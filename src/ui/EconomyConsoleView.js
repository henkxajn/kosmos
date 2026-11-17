// EconomyConsoleView — Budżet i Przepływy na zestawie konsoli (ARC KONSOLE K3, docs/design/CONSOLES_PLAN.md §1.2; FEATURES.consoleEconomy).
//
// Wołane przez `EconomyOverlay.draw`, gdy `isKitScreen('budget' | 'flows')`. Produkcja (`economy`) zostaje dzisiejszą stroną do K4.
// Szablon 4-strefowy (D-K-1):
//  (1) nagłówek — EKONOMIA + czipy grupy [ BUDŻET ] [ PRODUKCJA ] [ HANDEL ] [ RYNEK ] [ PRZEPŁYWY ] (D-K-15) + [ x ];
//  BUDŻET: (2) lista linii przychodów / wydatków · (3) bohater: netto Kr/rok (duży instrument), pasek przychody vs wydatki, suwak
//          stawki podatku (dzisiejsza strefa `tax_slider`) · (4) inspektor: rozbicie wybranej linii, efekt podatku (Finding 725),
//          blok magazynu D-K-16 · pas: ticker deficytów / nadwyżek;
//  PRZEPŁYWY: (2) lista zasobów (dzisiejsze wiersze i strefa `flow_res`) · (3) bohater: producenci → zasób → konsumenci (pasma w
//          rolach, wąskie gardło w roli alert) · (4) inspektor: rozbicie liczbowe + blok magazynu D-K-16.
// D-K-16 (warunkowe): lewej kolumny inwentarza nie ma — linie, których górna szuflada nie pokazuje (towary poza paliwem, magazyny
// stacji-sierot), stoją w bloku inspektora ze strefami `resource_hover` (dzisiejszy podgląd) i `toggle_cat` (zwijanie towarów).
// Geometria — wyłącznie `consoleZones` (wejście czyta strefy ostatniej klatki). Kolory — wyłącznie role (`consoleRoles`).

import { THEME } from '../config/ThemeConfig.js';
import { t, getName } from '../i18n/i18n.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { consoleZones, consoleClockRect, insetRect, uiViewport, CONSOLE_SCREEN_SPECS } from './ConsoleLayoutLogic.js';
import { drawConsoleHeader, drawZoneFrame, drawZoneRule, drawEyebrow, drawKvRow, drawBar, drawInstrument, drawList,
  drawTabular, drawConsoleTooltip, CONSOLE_KIT } from './ConsoleKit.js';
import { consoleRoles } from './ConsoleRolesLogic.js';
import { NAV_GROUPS } from './CivPanelDrawer.js';
import { clampScroll, scrollThumb } from './InfoPanelLayoutLogic.js';
import { truncateText } from './HudLabelLogic.js';
import { drawResourceIcon } from './ResourceIcons.js';
import { HOLO_TUNING } from '../renderer/ShipHologramLogic.js';
import { economyGroupChips, budgetLines, budgetLineTone, budgetNet, budgetTotals, budgetBreakdown, fmtSigned, taxEffect,
  taxTone, TAX_MAX, TAX_BANDS, budgetTicker, budgetStripItems, flowHeroLayout, flowDiagram, yearsToEmpty, aggregateStock, stockBlockLines, flowCandidateIds,
  flowListFromBreakdown }
  from './EconomyConsoleLogic.js';

// Wymiary widoku (px logiczne)
const EV = Object.freeze({
  HERO_INSET: 18,
  TICKER_H: 52,       // pas tickera Budżetu (dwie linie)
  CMP_BAR_H: 6,       // pasek przychody / wydatki
  TAX_BAR_H: 6,       // tor suwaka podatku
  TAX_HIT_H: 18,      // wysokość strefy suwaka
  STOCK_ROW_H: 18,    // wiersz bloku magazynu
  NODE_H: 30,         // węzeł diagramu przepływu
  NODE_GAP: 10,
  BAND_MAX: 16,       // grubość pasma przy udziale 1
  COL_W_FRAC: 0.30,   // kolumna węzłów diagramu (ułamek szerokości bohatera)
  COL_W_MAX: 230,
  CENTRE_W: 170,
});

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
function text(ctx, s, x, y, color, font = null, align = 'left') {
  if (font) ctx.font = font;
  ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}
const kr = () => t('econ.console.krPerYear');
function fmtAmt(n) {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}M` : a >= 1_000 ? `${(a / 1_000).toFixed(1)}k`
    : Number.isInteger(a) ? String(Math.round(a)) : a.toFixed(1);
  return n < 0 ? `-${s}` : s;
}
const resName = (id) => {
  const def = ALL_RESOURCES[id] ?? COMMODITIES[id];
  return def ? getName(def, COMMODITIES[id] && !ALL_RESOURCES[id] ? 'commodity' : 'resource') : id;
};
function typeName(type) {
  if (type === 'pop_consumption') return t('econPanel.resolvePopConsumption');
  if (type === 'prosperity_consumption') return t('econPanel.resolveProsperityConsumption');
  if (type === 'factory') return t('econPanel.resolveFactory');
  if (type === 'mine') return t('econPanel.resolveMine');
  const def = BUILDINGS[type];
  return def ? getName(def, 'building') : t('econ.console.otherSource');
}

/** Wejście: rysuje stronę `page` ('budget' | 'flows') konsoli Ekonomii. */
export function drawEconomyConsole(ov, ctx, W, H, page) {
  const roles = consoleRoles(THEME);
  const K = window.KOSMOS;
  const stripH = page === 'budget' ? EV.TICKER_H : 0;
  const spec = { ...(CONSOLE_SCREEN_SPECS[page] ?? {}), stripH, clock: consoleClockRect(W, H, NAV_GROUPS.length) };
  const z = consoleZones(ov._getOverlayBounds(W, H), spec);
  ov.consoleZones = z;
  ov._consoleTooltip = null;
  // skala UI do pozycjonowania podpowiedzi DOM — liczona tu (rysunek), handlery czytają zapamiętaną wartość
  if (typeof window !== 'undefined' && window.innerWidth) ov._uiScale = uiViewport(window.innerWidth, window.innerHeight).scale;
  const hz = ov._hoverZone;

  // (1) Nagłówek
  const om = K?.overlayManager;
  const hoverHdr = hz?.type === 'tab' ? hz.data?.id : hz?.type === 'close' ? 'close' : null;
  const chips = economyGroupChips(page, om?.overlays?.trade?._tab, t);
  for (const h of drawConsoleHeader(ctx, z, roles, { title: t('econPanel.header'), chips, hoverId: hoverHdr })) {
    if (h.type === 'close') ov._addHit(h.x, h.y, h.w, h.h, 'close');
    else ov._addHit(h.x, h.y, h.w, h.h, 'tab', { id: h.id });
  }

  if (page === 'budget') drawBudget(ov, ctx, z, roles, K, hz);
  else drawFlows(ov, ctx, z, roles, K, hz);

  if (ov._consoleTooltip) drawConsoleTooltip(ctx, ov._consoleTooltip, z.frame, roles, { tone: 'dim' });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// BUDŻET
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Dane świata do rozbicia linii (te same źródła co `_gatherBudgetData`). */
function budgetWorld(K) {
  const colMgr = K?.colonyManager;
  const colonies = (colMgr?.getPlayerColonies?.() ?? []).map((c) => ({
    name: c.name ?? c.planetId,
    isOutpost: !!c.isOutpost,
    creditsPerYear: c.creditsPerYear ?? 0,
    tax: c.isOutpost ? 0 : (colMgr?.calculateTaxIncome?.(c) ?? 0),
    labor: c.isOutpost ? 0 : (c.civSystem?.getTotalLaborCost?.() ?? 0),
    credits: c.credits ?? 0,
    research: c.resourceSystem?._deltaTracker?.observedPerYear?.get?.('research') ?? 0,
  }));
  const units = [];
  const guMgr = K?.groundUnitManager;
  const upTable = colMgr?.constructor?.GROUND_UNIT_UPKEEP;
  if (guMgr && upTable) {
    for (const u of guMgr._units?.values?.() ?? []) {
      if (u.owner !== 'player' && u.factionId !== 'humanity') continue;
      const up = upTable[u.archetypeId];
      if (!up) continue;
      const key = `groundUnit.${u.archetypeId}`;
      const nm = t(key);
      units.push({ archetypeId: u.archetypeId, name: nm === key ? u.archetypeId : nm, credits: up.credits ?? 0 });
    }
  }
  const fleet = K?.vesselManager?.getFleetUpkeepBreakdown?.() ?? null;
  return { colonies, units, fleet };
}

function drawBudget(ov, ctx, z, roles, K, hz) {
  const d = ov._gatherBudgetData();
  const lines = budgetLines(d);
  const lineIds = lines.filter((l) => !l.group).map((l) => l.id);
  if (!lineIds.includes(ov._budgetLine)) ov._budgetLine = lineIds[0];

  // (2) Lista linii
  const lz = z.list;
  const lh = drawZoneRule(ctx, lz, t('econ.console.lines'), roles);
  const listRect = { x: lz.x, y: lz.y + lh + 4, w: lz.w, h: Math.max(0, lz.h - lh - 4) };
  ov._consoleListRect = listRect;
  const unitOf = (l) => (l.unit === 'kryr' ? kr() : l.unit === 'kr' ? 'Kr' : t('econ.console.perYear'));
  const rows = lines.map((l) => (l.group
    ? { group: true, id: l.id, label: t(l.labelKey) }
    : { id: l.id, line: l,
        label: `${l.sub ? '   ' : ''}${t(l.labelKey)}${l.count ? ` (${l.count})` : ''}`,
        value: `${l.unit === 'kr' ? Math.round(l.value) : fmtSigned(l.value)} ${unitOf(l)}`,
        tone: budgetLineTone(l), dimmed: budgetLineTone(l) === 'dim' }));
  const hoverRow = hz?.type === 'budget_line' ? hz.data?.lineId : null;
  const res = drawList(ctx, listRect, rows, roles, { selectedId: ov._budgetLine, hoverId: hoverRow, scroll: ov._kitScrollList });
  ov._kitScrollList = res.scroll;
  for (const zz of res.zones) ov._addHit(zz.x, zz.y, zz.w, zz.h, 'budget_line', { lineId: zz.id });

  // (3) Bohater
  drawZoneFrame(ctx, z.hero, roles);
  drawBudgetHero(ov, ctx, insetRect(z.hero, EV.HERO_INSET), d, roles, hz);

  // (4) Inspektor (przewijany)
  const sel = lines.find((l) => l.id === ov._budgetLine);
  drawScrolledInspector(ov, ctx, z.inspector, roles, sel ? t(sel.labelKey) : '', (x, y, w, vis) => {
    let yy = y;
    yy += drawEyebrow(ctx, x, yy, w, t('econ.console.breakdown'), roles);
    const br = budgetBreakdown(ov._budgetLine, budgetWorld(K));
    const unit = sel?.unit === 'kryr' ? kr() : sel?.unit === 'kr' ? 'Kr' : t('econ.console.perYear');
    if (br.length === 0) {
      text(ctx, t('econ.console.noBreakdown'), x, yy + 12, roles.dim, F(THEME.fontSizeSmall)); yy += CONSOLE_KIT.KV_H + 2;
    }
    for (const r of br) {
      const label = r.key === 'inService' ? `${t('econ.console.inService')} (${r.count})`
        : r.key === 'reserve' ? `${t('fleet.reserveUpkeepRow')} (${r.count})` : r.label;
      const v = sel?.unit === 'kr' ? String(Math.round(r.value)) : fmtSigned(r.value);
      if (vis(yy)) drawKvRow(ctx, x, yy, w, label, v, roles, { tone: r.value < 0 ? 'alert' : 'primary', unit });
      yy += CONSOLE_KIT.KV_H;
    }
    yy += 8;
    // efekt podatku (Finding 725 — etykiety przez t())
    yy += drawEyebrow(ctx, x, yy, w, t('econ.console.taxEffect'), roles);
    const eff = taxEffect(d.taxRate);
    if (vis(yy)) drawKvRow(ctx, x, yy, w, t('civOverlay.taxRate'), `${Math.round(d.taxRate * 100)}%`, roles, { tone: taxTone(d.taxRate) });
    yy += CONSOLE_KIT.KV_H;
    if (vis(yy)) drawKvRow(ctx, x, yy, w, t('civOverlay.taxIncome'), fmtSigned(d.taxIncome, 0), roles, { unit: kr() });
    yy += CONSOLE_KIT.KV_H + 2;
    if (vis(yy)) text(ctx, t(eff.key, eff.pct), x, yy + 11, roles[eff.tone] ?? roles.dim, F(THEME.fontSizeSmall));
    yy += CONSOLE_KIT.KV_H + 8;
    return yy - y;
  });

  // pas — surowce (deficyty / nadwyżki); przy ujemnym netto budżetu pierwsza pozycja = deficyt budżetu
  if (z.strip) drawTicker(ctx, z.strip, budgetStripItems(budgetNet(d), budgetTicker(d.globalResources, ALL_RESOURCES)), roles);
}

function drawBudgetHero(ov, ctx, r, d, roles, hz) {
  const net = budgetNet(d);
  const tot = budgetTotals(d);
  let y = r.y;
  // instrumenty: netto i skarbiec
  const a = drawInstrument(ctx, r.x, y, roles, { label: t('econ.console.net'), value: fmtSigned(net), unit: kr(),
    tone: net >= 0 ? 'primary' : 'alert', delta: t(net >= 0 ? 'econ.console.netSurplus' : 'econ.console.netDeficit'),
    deltaTone: net >= 0 ? 'dim' : 'alert' });
  drawInstrument(ctx, r.x + Math.max(a.w + 48, Math.min(r.w * 0.5, 320)), y, roles,
    { label: t('civOverlay.credits'), value: String(Math.round(d.totalCredits ?? 0)), unit: 'Kr' });
  y += a.h + 22;

  // przychody vs wydatki
  y += drawEyebrow(ctx, r.x, y, r.w, t('econ.console.incomeVsExpense'), roles);
  const max = Math.max(tot.income, tot.expense, 1e-9);
  for (const [labelKey, val, tone] of [['econ.console.groupIncome', tot.income, 'primary'], ['econ.console.groupExpense', tot.expense, 'alert']]) {
    drawKvRow(ctx, r.x, y, r.w, t(labelKey), `${tone === 'alert' ? '-' : '+'}${val.toFixed(1)}`, roles, { tone, unit: kr() });
    y += CONSOLE_KIT.KV_H + 2;
    drawBar(ctx, r.x, y, r.w, val / max, roles, { tone, h: EV.CMP_BAR_H });
    y += EV.CMP_BAR_H + 10;
  }
  y += 12;

  // suwak podatku — dzisiejsza strefa `tax_slider` (klik = stawka z pozycji X, ta sama reguła)
  y += drawEyebrow(ctx, r.x, y, r.w, t('civOverlay.taxes'), roles);
  const rate = d.taxRate ?? 0;
  const tone = taxTone(rate);
  drawKvRow(ctx, r.x, y, r.w, t('civOverlay.taxRate'), `${Math.round(rate * 100)}%`, roles, { tone });
  y += CONSOLE_KIT.KV_H + 6;
  const barX = r.x, barW = Math.max(40, r.w), barY = y;
  drawBar(ctx, barX, barY, barW, rate / TAX_MAX, roles, { tone, h: EV.TAX_BAR_H });
  ctx.save();
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  for (const b of TAX_BANDS) {
    const tx = Math.round(barX + barW * b / TAX_MAX) + 0.5;
    ctx.beginPath(); ctx.moveTo(tx, barY - 3); ctx.lineTo(tx, barY + EV.TAX_BAR_H + 3); ctx.stroke();
  }
  ctx.strokeStyle = roles[tone] ?? roles.primary;
  const mx = Math.round(barX + barW * rate / TAX_MAX) + 0.5;
  ctx.beginPath(); ctx.moveTo(mx, barY - 6); ctx.lineTo(mx, barY + EV.TAX_BAR_H + 6); ctx.stroke();
  ctx.restore();
  ov._addHit(barX, barY - (EV.TAX_HIT_H - EV.TAX_BAR_H) / 2, barW, EV.TAX_HIT_H, 'tax_slider', { barX, barW });
  y += EV.TAX_BAR_H + 8;
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'alphabetic';
  text(ctx, '0%', barX, y + 10, roles.dim);
  text(ctx, `${Math.round(TAX_MAX * 100)}%`, barX + barW, y + 10, roles.dim, null, 'right');
  text(ctx, t('econ.console.taxHint'), barX + barW / 2, y + 10, roles.dim, null, 'center');
  ctx.restore();
  if (hz?.type === 'tax_slider') ov._consoleTooltip = { text: t('econ.console.taxHint'), x: barX, y: barY + 18 };
}

function drawTicker(ctx, r, st, roles) {
  drawZoneRule(ctx, r, '', roles);
  ctx.save();
  ctx.textBaseline = 'middle';
  const rowY = [r.y + 16, r.y + 36];
  let x0 = r.x;
  if (st.budget) {
    // deficyt budżetu — pierwsza pozycja pasa, w roli alert
    ctx.font = F(THEME.fontSizeSmall, true);
    const lab = `${t('econ.console.budgetDeficit').toUpperCase()} `;
    text(ctx, lab, x0, rowY[0], roles.alert);
    x0 += ctx.measureText(lab).width;
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.alert;
    x0 += drawTabular(ctx, `${fmtSigned(st.budget.net)} ${kr()}`, x0, rowY[0], 'left') + 28;
  }
  if (st.rows.every((row) => !row.items.length)) {
    text(ctx, t(st.emptyKey), x0, rowY[0], roles.dim, F(THEME.fontSizeSmall));
    ctx.restore();
    return;
  }
  st.rows.forEach(({ key, items, tone }, i) => {
    const y = rowY[i];
    ctx.font = F(THEME.fontSizeSmall);
    const lab = t(key).toUpperCase();
    const lx = i === 0 ? x0 : r.x;
    text(ctx, lab, lx, y, roles[tone]);
    let x = lx + Math.max(150, ctx.measureText(lab).width + 14);
    if (!items.length) { text(ctx, '—', x, y, roles.dim); return; }
    for (const it of items) {
      const s1 = `${resName(it.id)} `;
      const s2 = `${fmtSigned(it.rate)}${t('econ.console.perYear')}`;
      const s3 = ` (${Math.round(it.stock)})`;
      ctx.font = F(THEME.fontSizeSmall);
      const w = ctx.measureText(s1).width + ctx.measureText(s2).width + ctx.measureText(s3).width;
      if (x + w > r.x + r.w) break;
      text(ctx, s1, x, y, roles.foreign ?? roles.primary); x += ctx.measureText(s1).width;
      ctx.fillStyle = roles[tone]; x += drawTabular(ctx, s2, x, y, 'left');
      text(ctx, s3, x, y, roles.dim); x += ctx.measureText(s3).width + 18;
    }
  });
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PRZEPŁYWY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function drawFlows(ov, ctx, z, roles, K, hz) {
  const colonies = K?.colonyManager?.getPlayerColonies?.() ?? [];
  // Finding 738 — bilans wiersza z tego samego rozbicia co bohater (kopalnie i wsad fabryk wliczone); OFF liczy po staremu
  const items = flowListFromBreakdown(flowCandidateIds(colonies), (id) => ov._gatherFlowBreakdown(id));
  // domyślny wybór — pierwszy zasób (albo gdy poprzedni zniknął), jak dziś
  if (items.length && (!ov._flowSelectedResId || !items.some((i) => i.id === ov._flowSelectedResId))) ov._flowSelectedResId = items[0].id;

  // (2) Lista zasobów
  const lz = z.list;
  const lh = drawZoneRule(ctx, lz, t('econ.console.resources'), roles);
  const listRect = { x: lz.x, y: lz.y + lh + 4, w: lz.w, h: Math.max(0, lz.h - lh - 4) };
  ov._consoleListRect = listRect;
  const rows = items.map((i) => ({ id: i.id, label: resName(i.id), value: `${i.bal >= 0 ? '+' : ''}${fmtAmt(i.bal)}`,
    tone: i.bal >= 0 ? 'primary' : 'alert' }));
  const hoverRow = hz?.type === 'flow_res' ? hz.data?.resId : null;
  const res = drawList(ctx, listRect, rows, roles, {
    selectedId: ov._flowSelectedResId, hoverId: hoverRow, scroll: ov._kitScrollList, rowH: 22,
    renderRow: (c, row, rr, { sel }) => {
      const cy = rr.y + rr.h / 2;
      const def = ALL_RESOURCES[row.id] ?? COMMODITIES[row.id];
      const iw = drawResourceIcon(c, row.id, rr.x + CONSOLE_KIT.ROW_PAD_X, cy, 16, def?.icon) || 0;
      c.font = F(THEME.fontSizeNormal); c.textBaseline = 'middle';
      c.fillStyle = roles[row.tone];
      const vw = drawTabular(c, row.value, rr.x + rr.w - CONSOLE_KIT.ROW_PAD_X, cy, 'right');
      c.fillStyle = sel ? roles.primary : roles.foreign ?? roles.primary;
      const lx = rr.x + CONSOLE_KIT.ROW_PAD_X + iw + 6;
      c.fillText(truncateText(row.label, Math.max(0, rr.x + rr.w - CONSOLE_KIT.ROW_PAD_X - vw - 8 - lx), (s) => c.measureText(s).width), lx, cy);
    },
  });
  ov._kitScrollList = res.scroll;
  for (const zz of res.zones) ov._addHit(zz.x, zz.y, zz.w, zz.h, 'flow_res', { resId: zz.id });

  // (3) Bohater
  drawZoneFrame(ctx, z.hero, roles);
  const hr = insetRect(z.hero, EV.HERO_INSET);
  const resId = items.length ? ov._flowSelectedResId : null;
  const breakdown = resId ? ov._gatherFlowBreakdown(resId) : { producers: {}, consumers: {} };
  const dia = flowDiagram(breakdown);
  const stock = resId ? aggregateStock(colonies).inv[resId] ?? 0 : 0;
  if (!resId) {
    ctx.save(); ctx.textBaseline = 'middle';
    text(ctx, t('econPanel.noFlows'), hr.x + hr.w / 2, hr.y + hr.h / 2, roles.dim, F(THEME.fontSizeMedium), 'center');
    ctx.restore();
  } else {
    drawFlowDiagram(ctx, hr, resId, dia, roles);
  }

  // (4) Inspektor
  drawScrolledInspector(ov, ctx, z.inspector, roles, resId ? resName(resId) : '', (x, y, w, vis) => {
    let yy = y;
    if (resId) {
      const unit = t('econ.console.perYear');
      const kv = (k, v, tone = 'primary', u = unit) => { if (vis(yy)) drawKvRow(ctx, x, yy, w, k, v, roles, { tone, unit: u }); yy += CONSOLE_KIT.KV_H; };
      kv(t('econ.console.production'), `+${fmtAmt(dia.prodTotal)}`);
      kv(t('econ.console.consumption'), `-${fmtAmt(dia.consTotal)}`, dia.consTotal > 0 ? 'alert' : 'dim');
      kv(t('econ.console.balance'), `${dia.net >= 0 ? '+' : ''}${fmtAmt(dia.net)}`, dia.net >= 0 ? 'primary' : 'alert');
      kv(t('econ.console.stock'), fmtAmt(stock), 'primary', '');
      const yte = yearsToEmpty(stock, dia.net);
      if (yte != null) kv(t('econ.console.lastsFor'), yte >= 100 ? '100+' : yte.toFixed(1), 'alert', t('econ.console.years'));
      yy += 8;
      for (const [key, side, tone] of [['econ.console.producers', dia.prod, 'primary'], ['econ.console.consumers', dia.cons, 'alert']]) {
        yy += drawEyebrow(ctx, x, yy, w, t(key), roles);
        if (!side.length) { if (vis(yy)) text(ctx, t('econPanel.flowNone'), x, yy + 11, roles.dim, F(THEME.fontSizeSmall)); yy += CONSOLE_KIT.KV_H; }
        // inspektor: pełne rozbicie (bez węzła zbiorczego)
        const full = Object.entries(key === 'econ.console.producers' ? breakdown.producers : breakdown.consumers)
          .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        for (const [type, val] of full) kv(typeName(type), `${tone === 'alert' ? '-' : '+'}${fmtAmt(val)}`, tone);
        yy += 8;
      }
    }
    yy += drawStockBlock(ov, ctx, x, yy, w, roles, hz, vis);
    return yy - y;
  });
}

function drawFlowDiagram(ctx, r, resId, dia, roles) {
  const L = flowHeroLayout(r, dia.prod.length, dia.cons.length, { bandMax: Math.max(EV.BAND_MAX, Math.round(r.h / 24)) });
  const { cx, cy } = L.centre;
  const cw = L.centre.w;
  const cL = cx - cw / 2 + 12, cR = cx + cw / 2 - 12;
  const consTone = dia.bottleneck ? 'alert' : 'foreign';
  const valFont = F(THEME.fontSizeLarge);           // wartość węzła — rozmiar etykiety instrumentu
  const nameFont = F(THEME.fontSizeNormal);

  // K1c-B: miękkie lokalne przyciemnienie pod środkiem — liczba nie siada na gwieździe tła
  drawHeroDim(ctx, { x: L.centre.x, y: cy - r.h * 0.3, w: L.centre.w, h: r.h * 0.6 });

  const drawSide = (nodes, ys, col, left, tone) => {
    const thick = nodes.map((n) => L.band(n.frac));
    const bundle = thick.reduce((s, v) => s + v, 0);
    let off = cy - bundle / 2;
    ctx.save();
    nodes.forEach((n, i) => {
      const y = ys[i];
      const th = thick[i];
      const by = off + th / 2; off += th;
      // węzeł: nazwa + wartość przy ZEWNĘTRZNEJ krawędzi tercji; pasmo biegnie przez resztę kolumny aż do zasobu
      const outer = left ? col.x : col.x + col.w;
      const al = left ? 'left' : 'right';
      const name = truncateText(n.type === '__more' ? t('econ.console.more', n.count) : typeName(n.type), col.w * 0.78,
        (q) => { ctx.font = nameFont; return ctx.measureText(q).width; });
      const val = `${left ? '+' : '-'}${fmtAmt(n.val)}`;
      ctx.font = nameFont; const nw = ctx.measureText(name).width;
      ctx.font = valFont; const vw = ctx.measureText(val).width;
      const labW = Math.max(nw, vw) + 14;
      const b0 = left ? outer + labW : outer - labW;
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = roles[tone] ?? roles.primary; ctx.lineWidth = th;
      ctx.beginPath();
      if (left) { ctx.moveTo(b0, y); ctx.bezierCurveTo((b0 + cL) / 2, y, (b0 + cL) / 2, by, cL - 4, by); }
      else { ctx.moveTo(cR + 4, by); ctx.bezierCurveTo((cR + b0) / 2, by, (cR + b0) / 2, y, b0, y); }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'middle';
      text(ctx, name, outer, y - 11, roles.foreign ?? roles.primary, nameFont, al);
      ctx.font = valFont;
      ctx.fillStyle = roles[tone] ?? roles.primary;
      drawTabular(ctx, val, outer, y + 11, al);
    });
    ctx.restore();
  };

  // nagłówki tuż nad swoimi kolumnami
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall, true); ctx.textBaseline = 'alphabetic';
  text(ctx, t('econ.console.producers').toUpperCase(), L.prodHeader.x, L.prodHeader.y, roles.dim, null, 'left');
  text(ctx, t('econ.console.consumers').toUpperCase(), L.consHeader.x, L.consHeader.y, roles[dia.bottleneck ? 'alert' : 'dim'], null, 'right');
  ctx.restore();
  if (!dia.prod.length) { ctx.save(); ctx.textBaseline = 'middle'; text(ctx, t('econPanel.flowNone'), L.prodCol.x + L.prodCol.w, cy, roles.dim, nameFont, 'right'); ctx.restore(); }
  if (!dia.cons.length) { ctx.save(); ctx.textBaseline = 'middle'; text(ctx, t('econPanel.flowNone'), L.consCol.x, cy, roles.dim, nameFont, 'left'); ctx.restore(); }
  drawSide(dia.prod, L.prodYs, L.prodCol, true, 'primary');
  drawSide(dia.cons, L.consYs, L.consCol, false, consTone);

  // węzeł zasobu (środkowa tercja)
  const def = ALL_RESOURCES[resId] ?? COMMODITIES[resId];
  ctx.save();
  ctx.strokeStyle = roles[dia.bottleneck ? 'alert' : 'dim']; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cL, cy - 44); ctx.lineTo(cL, cy + 44); ctx.moveTo(cR, cy - 44); ctx.lineTo(cR, cy + 44); ctx.stroke();
  drawResourceIcon(ctx, resId, cx - 14, cy - 40, 28, def?.icon);
  ctx.font = F(THEME.fontSizeMedium, true); ctx.textBaseline = 'middle';
  text(ctx, truncateText(resName(resId).toUpperCase(), cR - cL - 8, (s) => ctx.measureText(s).width), cx, cy - 4, roles.primary, null, 'center');
  ctx.font = F(THEME.fontSizeInstrument ?? Math.round(2 * THEME.fontSizeLarge));
  ctx.fillStyle = roles[dia.net >= 0 ? 'primary' : 'alert'];
  drawTabular(ctx, `${dia.net >= 0 ? '+' : ''}${fmtAmt(dia.net)}`, cx, cy + 24, 'center');
  ctx.font = F(THEME.fontSizeSmall);
  text(ctx, t('econ.console.perYear'), cx, cy + 46, roles.dim, null, 'center');
  if (dia.bottleneck) {
    text(ctx, t('econ.console.bottleneck').toUpperCase(), cx, cy + 64, roles.alert, F(THEME.fontSizeSmall, true), 'center');
    text(ctx, t('econ.console.shortBy', fmtAmt(-dia.net)), cx, cy + 80, roles.alert, F(THEME.fontSizeSmall), 'center');
  }
  ctx.restore();
}

/** K1c-B (Stocznia, `paintHeroContent`): miękka elipsa `bgPrimary` o kryciu `HOLO_TUNING.heroDim` — pełna w środku, zero na krawędzi. */
function drawHeroDim(ctx, rect) {
  const dim = Number(HOLO_TUNING.heroDim) || 0;
  if (!(dim > 0) || typeof ctx.createRadialGradient !== 'function') return;
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.scale(rect.w / 2, rect.h / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, THEME.bgPrimary); g.addColorStop(0.55, THEME.bgPrimary); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = dim; ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Wspólne: inspektor z przewijaniem, blok magazynu D-K-16
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Inspektor: reguła z etykietą, treść w przycięciu z przewijaniem `ov._kitScrollInsp` (klamra po wysokości treści). `body(x, y, w,
 * vis)` rysuje i zwraca wysokość; `vis(y)` — czy wiersz na wysokości y jest w pasie widoku (strefy dokładane tylko wtedy).
 */
function drawScrolledInspector(ov, ctx, iz, roles, label, body) {
  const ih = drawZoneRule(ctx, iz, label, roles);
  const rect = { x: iz.x, y: iz.y + ih + 6, w: iz.w, h: Math.max(0, iz.h - ih - 6) };
  ov._consoleInspRect = rect;
  const prev = ov._kitInspContentH ?? 0;
  const sc = clampScroll(ov._kitScrollInsp ?? 0, prev, rect.h);
  ov._kitScrollInsp = sc;
  // tylko wiersze w całości w pasie widoku (clip nie przycina stref trafień — Finding 110)
  const vis = (y) => y >= rect.y - 1 && y + CONSOLE_KIT.KV_H <= rect.y + rect.h + 1;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  const h = body(rect.x, rect.y - sc, rect.w - CONSOLE_KIT.SCROLLBAR_W - 6, vis);
  ctx.restore();
  ov._kitInspContentH = h;
  const th = scrollThumb(sc, h, rect.h, rect.y);
  if (th) {
    ctx.save();
    const sx = rect.x + rect.w - CONSOLE_KIT.SCROLLBAR_W;
    ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(sx, rect.y, CONSOLE_KIT.SCROLLBAR_W, rect.h);
    ctx.globalAlpha = 1; ctx.fillStyle = roles.primary; ctx.fillRect(sx, th.y, CONSOLE_KIT.SCROLLBAR_W, th.h);
    ctx.restore();
  }
}

/** Dane bloku magazynu w zakresie lewej kolumny (globalnie / wybrana kolonia / wybrana stacja — filtr Produkcji). */
export function stockBlockData(ov) {
  const selCol = ov._resolveEntity(ov._selectedColonyId);
  const entities = selCol ? [selCol] : ov._getTabEntities();
  const { inv, rate } = aggregateStock(entities);
  const stations = (selCol ? (selCol.isStation ? [selCol] : []) : ov._playerStationFacades())
    .map((s) => ({ name: s.name ?? s.planetId, ...aggregateStock([s]), all: !!selCol }));
  return { selCol, ...stockBlockLines({ inv, rate, selected: !!selCol, stations }) };
}

/** Blok D-K-16: linie kolumny inwentarza, których górna szuflada nie pokazuje. Zwraca wysokość. */
function drawStockBlock(ov, ctx, x, y, w, roles, hz, vis) {
  const data = stockBlockData(ov);
  let yy = y;
  const scope = data.selCol ? (data.selCol.name ?? data.selCol.planetId) : t('econPanel.globalLabel');
  yy += drawEyebrow(ctx, x, yy, w, t('econ.console.stockBlock'), roles);
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
  if (vis(yy)) text(ctx, truncateText(scope, w, (s) => ctx.measureText(s).width), x, yy + 8, roles.dim);
  ctx.restore();
  yy += 18;
  const row = (id, amount, rateV) => {
    if (vis(yy)) {
      const def = ALL_RESOURCES[id] ?? COMMODITIES[id];
      const cy = yy + EV.STOCK_ROW_H / 2;
      const hov = hz?.type === 'resource_hover' && hz.data?.resourceId === id;
      ctx.save();
      if (hov) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(x, yy, w, EV.STOCK_ROW_H); ctx.globalAlpha = 1; }
      const iw = drawResourceIcon(ctx, id, x + 2, cy, 14, def?.icon) || 0;
      ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
      const rs = Math.abs(rateV) > 0.05 ? `${rateV > 0 ? '+' : ''}${fmtAmt(rateV)}` : '';
      ctx.fillStyle = rateV < 0 ? roles.alert : roles.dim;
      if (rs) drawTabular(ctx, rs, x + w, cy, 'right');
      ctx.fillStyle = roles.primary;
      const aw = drawTabular(ctx, fmtAmt(Math.round(amount)), x + w - 56, cy, 'right');
      ctx.fillStyle = roles.foreign ?? roles.primary;
      ctx.fillText(truncateText(resName(id), Math.max(0, w - 56 - aw - 8 - iw - 6), (s) => ctx.measureText(s).width), x + iw + 6, cy);
      ctx.restore();
      ov._addHit(x, yy, w, EV.STOCK_ROW_H, 'resource_hover', { resourceId: id });
    }
    yy += EV.STOCK_ROW_H;
  };
  // towary (zwijane — dzisiejsza strefa `toggle_cat`, klucz 'commodities')
  const collapsed = !!ov._collapsed?.commodities;
  if (vis(yy)) {
    const lab = `${collapsed ? '▸' : '▾'} ${t('econPanel.commodities')} (${data.goods.length})`;
    ctx.save();
    ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
    const hov = hz?.type === 'toggle_cat';
    text(ctx, lab, x, yy + 9, hov ? roles.primary : roles.dim);
    ctx.restore();
    ov._addHit(x, yy, w, 18, 'toggle_cat', { catKey: 'commodities' });
  }
  yy += 20;
  if (!collapsed) for (const g of data.goods) row(g.id, g.amount, g.rate);
  // stacje-sieroty (magazyn poza szufladą)
  for (const s of data.stations) {
    yy += 6;
    yy += drawEyebrow(ctx, x, yy, w, `${t('econ.console.stationStock')} · ${s.name}`, roles);
    for (const l of s.lines) row(l.id, l.amount, l.rate);
  }
  return yy - y;
}
