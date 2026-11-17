// ProductionConsoleView — Produkcja na zestawie konsoli (ARC KONSOLE K4, docs/design/CONSOLES_PLAN.md §1.2, §17; FEATURES.consoleEconomy).
//
// Wołane przez `EconomyOverlay.draw`, gdy `isKitScreen('economy')`. Szablon 4-strefowy (D-K-1), kierunek bohatera: surowce → fabryki → towary:
//  (1) nagłówek — EKONOMIA + pięć czipów grupy (rama `econConsoleFrame`, jak Budżet / Przepływy);
//  (2) lista — «Zakres: X ▾» (rozwinięty = KAŻDA encja, Finding 732; wybór = dzisiejsza strefa `colony_filter`), pod nim towary
//      «W produkcji» / «Pozostałe» (`prod_good`) ze stałą kolumną «zapas / minimum» (alert, gdy zapas < min); na wierszu pod kursorem
//      i zaznaczonym — steppery minimalnego zapasu (dzisiejsze strefy tabeli `factory_btn` demand_*); droid — znacznik «buduj»;
//  (3) bohater w trzech pasmach: PRODUKCJA TERAZ (linie zakresu, pasek do następnej sztuki w czasie gry, «+1», tempo, FP) ·
//      łańcuch wybranego towaru (wejścia → fabryka → produkt) · baner wąskiego gardła + kolejka i zlecenia;
//  (4) inspektor — status, instrument «zapas / minimum» ze stepperami, blok budowy droida, alerty kolonii zakresu, trend towaru,
//      działania (zlecenie jednorazowe, zapotrzebowanie, przełącznik fabryk) z powodem i18n, blok magazynu D-K-16;
//  pas — zlecenia eksportowe (Finding 742 — adresowane do kolonii zakresu) + jeden wykres 10 lat (wszystkie kolonie).
// Animacja w kadencji rysowania UI (gra biegnie: co ~100 ms; pauza: tylko na zmianę) — bez dodatkowych klatek.
// Geometria — wyłącznie `consoleZones`; kolory — wyłącznie role. Strefy trafień: typy dzisiejszej strony bez zmian nazw.

import { THEME } from '../config/ThemeConfig.js';
import { t, getName } from '../i18n/i18n.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { insetRect } from './ConsoleLayoutLogic.js';
import { drawZoneFrame, drawZoneRule, drawEyebrow, drawKvRow, drawBar, drawInstrument, drawList, drawTabular, drawActionChip,
  drawSelectBrackets, drawConsoleTooltip, CONSOLE_KIT } from './ConsoleKit.js';
import { truncateText } from './HudLabelLogic.js';
import { drawResourceIcon } from './ResourceIcons.js';
import { aggregateStock } from './EconomyConsoleLogic.js';
import { econConsoleFrame, drawScrolledInspector, drawStockBlock, drawHeroDim, resName, fmtAmt } from './EconomyConsoleView.js';
import { scopeOptions, scopeEntities, scopeEntity, productionLines, goodRows, pickGood, chainModel, bottleneckInput, chainHeroLayout,
  productionAlerts, alertsFor, goodTrend, factoryGate, oneShotGate, queueRows, exportRows, heroBands, pulseTick, pulseAlpha, lineKey, nowLines,
  lineStalled, stockMinCell, droidBuildGate, nowBarState } from './ProductionConsoleLogic.js';

// Wymiary widoku (px logiczne)
const PV = Object.freeze({
  HERO_INSET: 18,
  STRIP_H: 112,       // pas: zlecenia eksportowe · wykres 10 lat
  ROW_H: 22,          // wiersz listy towarów
  SCOPE_H: 24,        // wiersz zakresu w nagłówku listy
  STEP_W: 44,         // czip [ − ] / [ + ]
  BOX_W: 40,          // pole wartości w stepperze
  CHIP_W: 170,        // czip akcji inspektora
  TREND_H: 30,        // słupki trendu w inspektorze
  CELL_W: 54,         // kolumna «zapas / min» listy (stała, do prawej)
  MINI: 16,           // mały przycisk − / + listy
  NOW_ROW_H: 24,      // wiersz pasma «Produkcja teraz»
  BIG_BTN_H: 30,      // duży przycisk [ ZBUDUJ × N ]
  NODE_2LINE_H: 28,   // węzeł wejścia niższy → jedna linia (nazwa · ×ilość · stan)
});

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
function text(ctx, s, x, y, color, font = null, align = 'left') {
  if (font) ctx.font = font;
  ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}
const fit = (ctx, s, w) => truncateText(String(s ?? ''), Math.max(0, w), (q) => ctx.measureText(q).width);
const goodName = (id) => { const d = COMMODITIES[id]; return d ? getName(d, 'commodity') : resName(id); };
const techName = (id) => (id ? (t(`tech.${id}.name`) || id) : '?');
const rateStr = (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));
const isHov = (hz, x, y) => !!hz && hz.x === x && hz.y === y;

export function drawProductionConsole(ov, ctx, W, H) {
  const { z, roles, K, hz } = econConsoleFrame(ov, ctx, W, H, 'economy', PV.STRIP_H);
  const entities = ov._getTabEntities();
  const selId = ov._selectedColonyId;
  const ent = scopeEntity(entities, selId);
  const scope = scopeEntities(entities, selId);
  const lines = productionLines(scope);
  // dostępność receptur — tech gracza wspólny dla kolonii (FactorySystem.isRecipeAvailable, fail-closed bez techu)
  const playerCols = K?.colonyManager?.getPlayerColonies?.() ?? [];
  const fsAny = scope.find((e) => e.factorySystem)?.factorySystem ?? playerCols.find((c) => c.factorySystem)?.factorySystem ?? null;
  const isAvail = fsAny ? (id) => fsAny.isRecipeAvailable(id) : null;
  const rows = goodRows(lines, isAvail);
  const goodId = pickGood(rows, ov._prodGoodId);
  ov._prodGoodId = goodId;
  ov._prodScope = scope.map((e) => e.planetId);   // diagnostyka / keeper: encje zakresu i wiersze listy
  ov._prodRows = rows;
  const scopeName = ent ? (ent.name ?? ent.planetId) : (selId ? selId : t('econ.console.prodScopeGlobal'));
  // fabryka zakresu dla minimalnego zapasu (lista + instrument): tylko kolonia z fabrykami (ta sama bramka co akcje)
  const scopeFs = !factoryGate(ent) ? ent.factorySystem : null;
  const stockInv = aggregateStock(scope).inv;
  const stockOf = (id) => (scopeFs ? (scopeFs.getStock?.(id) ?? 0) : (stockInv[id] ?? 0));
  // «+1»: wykrycie ukończonej sztuki w kadencji rysowania (bez dodatkowych klatek)
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  ov._prodPulse = pulseTick(ov._prodPulse ?? {}, lines, nowMs);

  drawGoodsList(ov, ctx, z.list, roles, hz, { entities, selId, scopeName, rows, goodId, scopeFs, stockOf });

  const def = goodId ? COMMODITIES[goodId] : null;
  let model = null;
  if (def) {
    const recipe = fsAny?._getScaledRecipe ? fsAny._getScaledRecipe(def.recipe ?? {}, goodId) : (def.recipe ?? {});
    const fp = { total: 0, free: 0, enabledAny: false, factories: 0 };
    for (const e of scope) {
      const fs = e.factorySystem;
      if (!fs || !(fs.totalPoints > 0)) continue;
      fp.total += fs.totalPoints; fp.free += fs.freePoints ?? 0; fp.factories += 1;
      fp.enabledAny = fp.enabledAny || (fs.isProductionEnabled?.() ?? true);
    }
    ov._prodFpTotal = fp.total;
    model = chainModel({ id: goodId, recipe, lines: lines.filter((l) => l.commodityId === goodId), stock: stockInv, fp,
      available: isAvail ? isAvail(goodId) : true, techBlocked: fsAny?._getTechBlockedIngredients?.(goodId) ?? [] });
  }
  ov._prodModel = model;

  // (3) Bohater — trzy pasma: produkcja teraz · łańcuch wybranego towaru · wąskie gardło + kolejka i zlecenia
  drawZoneFrame(ctx, z.hero, roles);
  const hr = insetRect(z.hero, PV.HERO_INSET);
  const B = heroBands(hr);
  ov._prodBands = B;
  drawNowBand(ov, ctx, B.now, lines, roles, hz, nowMs, !ent);
  if (def) drawChain(ov, ctx, B.chain, def, model, roles, hz);
  drawFoot(ov, ctx, B.foot, def, model, scope, roles);

  // (4) Inspektor
  const alerts = productionAlerts(playerCols);
  drawScrolledInspector(ov, ctx, z.inspector, roles, def ? goodName(goodId) : '', (x, y, w, vis) => {
    let h = def ? drawInspector(ov, ctx, x, y, w, vis, roles, hz, { def, model, ent, scope, scopeName, alerts, K, scopeFs, stockOf,
      available: isAvail ? isAvail(goodId) : true }) : 0;
    // D-K-16 — «Magazyn — poza szufladą» w zakresie filtra (jak na Przepływach)
    h += drawStockBlock(ov, ctx, x, y + h, w, roles, hz, vis);
    return h;
  });

  // Pas — zlecenia eksportowe + JEDEN wykres 10 lat (globalny)
  if (z.strip) drawStrip(ov, ctx, z.strip, roles, hz, { ent, scope, K });

  if (ov._consoleTooltip) drawConsoleTooltip(ctx, ov._consoleTooltip, z.frame, roles, { tone: 'dim' });
}

// ── (2) Lista: zakres + towary ───────────────────────────────────────────────────────────────────────────────────────

function drawGoodsList(ov, ctx, lz, roles, hz, { entities, selId, scopeName, rows, goodId, scopeFs, stockOf }) {
  const lh = drawZoneRule(ctx, lz, t('econ.console.prodGoods'), roles);
  // zakres — jawnie w nagłówku listy (klik rozwija pełną listę encji)
  const sr = { x: lz.x, y: lz.y + lh + 4, w: lz.w, h: PV.SCOPE_H };
  ctx.save();
  ctx.textBaseline = 'middle';
  if (hz?.type === 'prod_scope_toggle') { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(sr.x, sr.y, sr.w, sr.h); ctx.globalAlpha = 1; }
  ctx.font = F(THEME.fontSizeNormal, true);
  text(ctx, fit(ctx, `${t('econ.console.prodScope', scopeName)} ${ov._prodScopeOpen ? '▴' : '▾'}`, sr.w - 2 * CONSOLE_KIT.ROW_PAD_X),
    sr.x + CONSOLE_KIT.ROW_PAD_X, sr.y + sr.h / 2, roles.primary);
  ctx.restore();
  ov._addHit(sr.x, sr.y, sr.w, sr.h, 'prod_scope_toggle', {});
  const listRect = { x: lz.x, y: sr.y + sr.h + 6, w: lz.w, h: Math.max(0, lz.y + lz.h - sr.y - sr.h - 6) };
  ov._consoleListRect = listRect;

  if (ov._prodScopeOpen) {
    // Finding 732 — wszystkie encje (globalnie + kolonie + placówki + stacje), przewijane; żadna nie znika
    const opts = scopeOptions(entities);
    const kindLab = { station: t('econ.console.kindStation'), outpost: t('econ.console.kindOutpost') };
    const lrows = [{ group: true, label: t('econ.console.prodScopePick') },
      ...opts.map((o) => ({ id: o.id ?? '__global', label: o.id ? `${o.name}${kindLab[o.kind] ? ` · ${kindLab[o.kind]}` : ''}` : t('econ.console.prodScopeGlobal') }))];
    const hoverId = hz?.type === 'colony_filter' ? (hz.data?.colonyId ?? '__global') : null;
    const res = drawList(ctx, listRect, lrows, roles, { selectedId: selId ?? '__global', hoverId, scroll: ov._kitScrollList, rowH: PV.ROW_H });
    ov._kitScrollList = res.scroll;
    for (const zz of res.zones) ov._addHit(zz.x, zz.y, zz.w, zz.h, 'colony_filter', { colonyId: zz.id === '__global' ? null : zz.id });
    return;
  }

  const lrows = [];
  lrows.push({ group: true, label: t('econ.console.prodActive', rows.active.length) });
  for (const r of rows.active) lrows.push({ id: r.id, rate: r.rate, stalled: r.stalled, active: true });
  lrows.push({ group: true, label: t('econ.console.prodOther') });
  for (const r of rows.other) lrows.push({ id: r.id, locked: r.locked });
  // wiersz pod kursorem: strefa wiersza albo jego stepper (stepper ma pierwszeństwo trafienia — dodany przed wierszem)
  const hoverId = hz?.type === 'prod_good' ? hz.data?.commodityId : (hz?.type === 'factory_btn' && hz.data?.src === 'list' ? hz.data.commodityId : null);
  const steps = [];   // strefy stepperów (dodawane przed strefami wierszy)
  const res = drawList(ctx, listRect, lrows, roles, {
    selectedId: goodId, hoverId, scroll: ov._kitScrollList, rowH: PV.ROW_H,
    renderRow: (c, row, rr, { sel, hov }) => {
      const cy = rr.y + rr.h / 2;
      const d = COMMODITIES[row.id];
      const inside = rr.y >= listRect.y - 0.5 && rr.y + rr.h <= listRect.y + listRect.h + 0.5;
      const iw = drawResourceIcon(c, row.id, rr.x + CONSOLE_KIT.ROW_PAD_X, cy, 16, d?.icon) || 0;
      c.font = F(THEME.fontSizeSmall); c.textBaseline = 'middle';
      const colR = rr.x + rr.w - CONSOLE_KIT.ROW_PAD_X;
      let leftEdge = colR;
      // kolumna po prawej (stała szerokość): zapas / minimum · droid: zapas + «buduj» · zablokowany: kłódka
      if (row.locked) {
        // zablokowany: kłódka + «zapas / min»; minimalny zapas można ustawić przed odkryciem (dzisiejsza tabela: − z bonusem, +)
        c.fillStyle = roles.dim;
        const min = scopeFs ? scopeFs.getSafetyStockTarget(row.id) : null;
        const cell = stockMinCell(stockOf(row.id), min);
        const cw = Math.max(PV.CELL_W, drawTabular(c, cell.text, colR, cy, 'right'));
        const lw = drawTabular(c, '🔒', colR - cw - 6, cy, 'right');
        leftEdge = colR - cw - 6 - lw - 6;
        if (scopeFs && (sel || hov) && inside && !d?.isDroidUnit) {
          const bonus = scopeFs.getDemandBonus?.(row.id) ?? 0;
          const colId = ov._selectedColonyId;
          const by = rr.y + (rr.h - PV.MINI) / 2;
          const px = leftEdge - PV.MINI, mx = px - PV.MINI - 4;
          miniBtn(c, mx, by, '−', bonus > 0, roles, isHov(hz, mx, by), 'dim');
          miniBtn(c, px, by, '+', true, roles, isHov(hz, px, by), 'dim');
          if (bonus > 0) steps.push([mx, by, PV.MINI, PV.MINI, { action: 'demand_minus', colonyId: colId, commodityId: row.id, label: '−', x: mx, src: 'list' }]);
          steps.push([px, by, PV.MINI, PV.MINI, { action: 'demand_plus', colonyId: colId, commodityId: row.id, label: '+', x: px, src: 'list' }]);
          leftEdge = mx - 6;
        }
        if (hov && inside) ov._consoleTooltip = { x: rr.x + 20, y: rr.y + rr.h + 2, text: `${goodName(row.id)} — ${t('econPanel.minStockRequires', techName(d?.requiresTech))}` };
      } else if (d?.isDroidUnit) {
        c.fillStyle = roles.primary;
        const mw = drawTabular(c, t('econ.console.prodBuildMark'), colR, cy, 'right');
        c.fillStyle = roles.dim;
        const sw = drawTabular(c, stockMinCell(stockOf(row.id), null).text, colR - mw - 8, cy, 'right');
        leftEdge = colR - mw - 8 - sw - 8;
      } else {
        const min = scopeFs ? scopeFs.getSafetyStockTarget(row.id) : null;
        const cell = stockMinCell(stockOf(row.id), min);
        c.fillStyle = roles[cell.tone];
        const cw = Math.max(PV.CELL_W, drawTabular(c, cell.text, colR, cy, 'right'));
        leftEdge = colR - cw - 6;
        if (scopeFs && (sel || hov) && inside) {
          // steppery minimalnego zapasu (dzisiejsze strefy tabeli: − tylko z bonusem, pole wartości, +)
          // (zablokowany towar: gałąź wyżej — te same − / + w roli dim, bez pola wartości)
          const bonus = scopeFs.getDemandBonus?.(row.id) ?? 0;
          const colId = ov._selectedColonyId;
          const by = rr.y + (rr.h - PV.MINI) / 2;
          const px = leftEdge - PV.MINI, mx = px - PV.MINI - 4;
          miniBtn(c, mx, by, '−', bonus > 0, roles, isHov(hz, mx, by));
          miniBtn(c, px, by, '+', true, roles, isHov(hz, px, by));
          if (bonus > 0) steps.push([mx, by, PV.MINI, PV.MINI, { action: 'demand_minus', colonyId: colId, commodityId: row.id, label: '−', x: mx, src: 'list' }]);
          steps.push([px, by, PV.MINI, PV.MINI, { action: 'demand_plus', colonyId: colId, commodityId: row.id, label: '+', x: px, src: 'list' }]);
          // pole wartości = kolumna «zapas / min» (klik → dzisiejszy <input> progu, położony na kolumnie)
          const bx = colR - cw, bw = cw;
          steps.push([bx, by, bw, PV.MINI, { action: 'demand_set_input', colonyId: colId, commodityId: row.id, label: 'box', x: bx, boxW: bw, boxH: PV.MINI,
            boxCanvasX: bx, boxCanvasY: by, baseTarget: Math.max(0, min - bonus), src: 'list' }]);
          leftEdge = mx - 6;
        }
      }
      c.font = F(THEME.fontSizeNormal);
      if (row.active) {
        c.fillStyle = row.stalled ? roles.alert : roles.primary;
        const v = row.stalled && !(row.rate > 0) ? t('econ.console.prodStop') : `+${rateStr(row.rate)}`;
        leftEdge -= drawTabular(c, v, leftEdge, cy, 'right') + 8;
      }
      c.fillStyle = row.locked ? roles.dim : sel ? roles.primary : (roles.foreign ?? roles.primary);
      const lx = rr.x + CONSOLE_KIT.ROW_PAD_X + iw + 6;
      const full = goodName(row.id);
      const shown = fit(c, full, leftEdge - lx);
      c.fillText(shown, lx, cy);
      // długa nazwa ucięta → pełna nazwa w podpowiedzi pod kursorem
      if (hov && inside && shown !== full && !row.locked) ov._consoleTooltip = { x: lx, y: rr.y + rr.h + 2, text: full };
    },
  });
  ov._kitScrollList = res.scroll;
  for (const [x, y, w, h, data] of steps) ov._addHit(x, y, w, h, 'factory_btn', data);
  for (const zz of res.zones) ov._addHit(zz.x, zz.y, zz.w, zz.h, 'prod_good', { commodityId: zz.id });
}

/** Mały przycisk listy «−» / «+» (kwadrat w nawiasach, rola primary; wyłączony — dim). */
function miniBtn(ctx, x, y, glyph, enabled, roles, hover, tone = 'primary') {
  ctx.save();
  const col = enabled ? (roles[tone] ?? roles.primary) : roles.dim;
  if (hover && enabled) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = col; ctx.fillRect(x, y, PV.MINI, PV.MINI); ctx.globalAlpha = 1; }
  ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha = enabled ? 0.9 : 0.5;
  ctx.strokeRect(x + 0.5, y + 0.5, PV.MINI - 1, PV.MINI - 1);
  ctx.globalAlpha = 1;
  ctx.font = F(THEME.fontSizeNormal, true); ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = col;
  ctx.fillText(glyph, x + PV.MINI / 2, y + PV.MINI / 2 + 1);
  ctx.restore();
}

// ── (3) Bohater: łańcuch towaru ──────────────────────────────────────────────────────────────────────────────────────

function bottleneckText(b, def) {
  if (!b) return null;
  const col = b.colonyName ? ` · ${b.colonyName}` : '';
  switch (b.kind) {
    case 'locked': return t('econ.console.prodBnLocked', techName(def?.requiresTech));
    case 'noFactories': return t('econ.console.prodBnNoFactories');
    case 'offline': return t('econ.console.prodBnOffline');
    case 'tech': return t('econ.console.prodBnTech', resName(b.resId), techName(b.tech)) + col;
    case 'missing': return t('econ.console.prodBnMissing', resName(b.resId), fmtAmt(Math.floor(b.have)), fmtAmt(Math.ceil(b.need))) + col;
    case 'insolvent': return t('econ.console.prodBnInsolvent', b.need, Math.floor(b.have)) + col;
    case 'noCapacity': return t('econ.console.prodBnNoCapacity') + col;
    default: return null;
  }
}

/** Pasmo (a) PRODUKCJA TERAZ: każda linia zakresu — pasek do następnej sztuki (czas gry), «+1» po ukończeniu, tempo, FP; klik = wybór. */
function drawNowBand(ov, ctx, r, lines, roles, hz, nowMs, showColony) {
  const eh = drawEyebrow(ctx, r.x, r.y, r.w, t('econ.console.prodNow'), roles);
  const list = nowLines(lines);
  let y = r.y + eh + 2;
  const rowH = PV.NOW_ROW_H;
  const fitN = Math.max(0, Math.floor((r.y + r.h - y) / rowH));
  ctx.save();
  ctx.textBaseline = 'middle';
  if (!list.length) {
    text(ctx, t('econ.console.prodNowEmpty'), r.x, y + 10, roles.dim, F(THEME.fontSizeSmall));
    ctx.restore();
    return;
  }
  const show = list.length > fitN ? list.slice(0, Math.max(0, fitN - 1)) : list;
  const nameW = Math.floor(r.w * 0.30), barX = r.x + nameW + 10, barW = Math.floor(r.w * 0.36);
  for (const l of show) {
    const stalled = lineStalled(l);
    const bar = nowBarState(l, ov._prodPulse?.[lineKey(l)], nowMs);
    const tone = bar.tone;
    const cy = y + rowH / 2;
    const hov = hz?.type === 'prod_good' && hz.data?.commodityId === l.commodityId && hz.y === y;
    if (hov) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(r.x, y, r.w, rowH - 2); ctx.globalAlpha = 1; }
    const d = COMMODITIES[l.commodityId];
    const iw = drawResourceIcon(ctx, l.commodityId, r.x + 2, cy, 16, d?.icon) || 0;
    ctx.font = F(THEME.fontSizeNormal);
    const nm = showColony ? `${goodName(l.commodityId)} · ${l.colonyName}` : goodName(l.commodityId);
    text(ctx, fit(ctx, nm, nameW - iw - 8), r.x + iw + 6, cy, l.commodityId === ov._prodGoodId ? roles.primary : (roles.foreign ?? roles.primary));
    // pasek postępu do następnej sztuki (stojąca linia — zatrzymany pasek w roli alert)
    drawBar(ctx, barX, cy - 1, barW, bar.frac, roles, { tone, h: 3 });
    if (stalled) {
      // zatrzymany pasek: znacznik stopu w roli alert na początku toru
      ctx.save(); ctx.fillStyle = roles.alert; ctx.fillRect(barX, cy - 4, 2, 8); ctx.restore();
    }
    const pa = bar.pulse;
    if (pa > 0) {
      ctx.save(); ctx.globalAlpha = pa;
      ctx.fillStyle = roles.primary; ctx.fillRect(barX, cy - 2, barW, 5);
      text(ctx, '+1', barX + barW + 6, cy, roles.primary, F(THEME.fontSizeNormal, true));
      ctx.restore();
    }
    const rx = r.x + r.w;
    ctx.font = F(THEME.fontSizeSmall);
    if (stalled) {
      const why = ov._stallReasonMsg?.(l.stallReason) ?? t('econPanel.noResources');
      text(ctx, fit(ctx, why, rx - (barX + barW + 30)), rx, cy, roles.alert, null, 'right');
    } else {
      ctx.fillStyle = roles.dim;
      const fw = drawTabular(ctx, `FP ${l.points}`, rx, cy, 'right');
      ctx.fillStyle = roles.primary;
      drawTabular(ctx, `+${rateStr(l.rate)} ${t('econ.console.prodUnitsYr')}`, rx - fw - 12, cy, 'right');
    }
    ov._addHit(r.x, y, r.w, rowH - 2, 'prod_good', { commodityId: l.commodityId });
    y += rowH;
  }
  if (show.length < list.length) text(ctx, t('econ.console.more', list.length - show.length), r.x, y + 9, roles.dim, F(THEME.fontSizeSmall));
  ctx.restore();
}

/** Pasmo (b): łańcuch wybranego towaru — wejścia → fabryka → produkt; nagłówki tuż nad swoimi kolumnami. */
function drawChain(ov, ctx, r, def, m, roles, hz) {
  const L = chainHeroLayout(r, m.inputs.length, { headerH: 16, bannerH: 0, nodeH: 34, nodeMaxStep: 40 });
  const bnIn = bottleneckInput(m);
  const midY = (q) => q.y + q.h / 2;
  const top = Math.min(L.factory.y, L.output.y, ...(L.inputs.length ? [L.inputs[0].y] : []));
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall, true); ctx.textBaseline = 'alphabetic';
  text(ctx, t('econ.console.prodInputs').toUpperCase(), r.x, (L.inputs[0]?.y ?? top) - 5, roles.dim);
  text(ctx, t('econ.console.prodFactory').toUpperCase(), L.factory.x, L.factory.y - 5, roles.dim);
  text(ctx, t('econ.console.prodOutput').toUpperCase(), L.output.x + L.output.w, L.output.y - 5, roles.dim, null, 'right');
  ctx.restore();
  drawHeroDim(ctx, { x: L.factory.x - 20, y: L.factory.y - 10, w: L.factory.w + 40, h: L.factory.h + 20 });
  const arrow = (x0, y0, x1, y1, tone, dashed) => {
    ctx.save();
    ctx.strokeStyle = roles[tone] ?? roles.primary; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1;
    ctx.globalAlpha = tone === 'alert' ? 1 : 0.6;
    if (dashed) ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, x1 - 6, y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 7, y1 - 4); ctx.lineTo(x1 - 7, y1 + 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  const fIn = L.factory.x, fOut = L.factory.x + L.factory.w, fMid = midY(L.factory);
  m.inputs.forEach((inp, i) => {
    const q = L.inputs[i];
    if (!q || q.h <= 0) return;
    const bad = inp.id === bnIn || inp.short || inp.tech;
    arrow(q.x + q.w + 4, midY(q), fIn - 4, fMid, bad ? 'alert' : 'primary', bad);
    const isCom = !!COMMODITIES[inp.id];
    const hov = isCom ? hz?.type === 'prod_good' && hz.data?.commodityId === inp.id && hz.y === q.y : hz?.type === 'resource_hover' && hz.data?.resourceId === inp.id;
    ctx.save();
    if (hov) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(q.x, q.y, q.w, q.h); ctx.globalAlpha = 1; }
    ctx.textBaseline = 'middle';
    const d = ALL_RESOURCES[inp.id] ?? COMMODITIES[inp.id];
    const nameTone = bad ? roles.alert : (roles.foreign ?? roles.primary);
    const stockTone = bad ? roles.alert : inp.low ? (roles.foreign ?? roles.primary) : roles.primary;
    if (q.h < PV.NODE_2LINE_H) {
      // ciasno (receptury 6–8 składników): jedna linia — nazwa po lewej, «×ilość · stan» po prawej
      const cy = q.y + q.h / 2;
      const iw = drawResourceIcon(ctx, inp.id, q.x + 2, cy, 14, d?.icon) || 0;
      ctx.font = F(THEME.fontSizeSmall);
      const right = `×${fmtAmt(inp.perUnit)} · ${fmtAmt(Math.floor(inp.stock))}`;
      ctx.fillStyle = stockTone;
      const rw = drawTabular(ctx, right, q.x + q.w, cy, 'right');
      text(ctx, fit(ctx, resName(inp.id), q.w - iw - rw - 14), q.x + iw + 6, cy, nameTone);
    } else {
      const iw = drawResourceIcon(ctx, inp.id, q.x + 2, q.y + 9, 16, d?.icon) || 0;
      ctx.font = F(THEME.fontSizeNormal);
      text(ctx, fit(ctx, resName(inp.id), q.w - iw - 8), q.x + iw + 6, q.y + 9, nameTone);
      ctx.font = F(THEME.fontSizeSmall);
      ctx.fillStyle = roles.dim;
      drawTabular(ctx, t('econ.console.prodPerUnit', fmtAmt(inp.perUnit)), q.x + 2, q.y + q.h - 6, 'left');
      ctx.fillStyle = stockTone;
      drawTabular(ctx, t('econ.console.prodHave', fmtAmt(Math.floor(inp.stock))), q.x + q.w, q.y + q.h - 6, 'right');
    }
    ctx.restore();
    if (isCom) ov._addHit(q.x, q.y, q.w, q.h, 'prod_good', { commodityId: inp.id });
    else ov._addHit(q.x, q.y, q.w, q.h, 'resource_hover', { resourceId: inp.id });
  });
  if (!m.inputs.length) {
    ctx.save(); ctx.textBaseline = 'middle';
    text(ctx, t('econ.console.prodNoRecipe'), r.x, fMid, roles.dim, F(THEME.fontSizeSmall));
    ctx.restore();
  }
  // fabryka: tempo (duży instrument), FP przydzielone, status
  const b = m.bottleneck;
  const facTone = m.status === 'stalled' || (b && m.rate <= 0) ? 'alert' : 'primary';
  const fx = L.factory.x;
  let fy = L.factory.y;
  const ins = drawInstrument(ctx, fx, fy, roles, { label: t('econ.console.prodRate'), value: rateStr(m.rate), unit: t('econ.console.prodUnitsYr'), tone: facTone });
  fy += ins.h + 4;
  const fpTot = ov._prodFpTotal ?? 0;
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle'; ctx.fillStyle = roles.dim;
  drawTabular(ctx, t('econ.console.prodFp', m.points, fpTot), fx, fy + 6, 'left');
  ctx.restore();
  fy += 13;
  drawBar(ctx, fx, fy, Math.max(0, L.factory.w), fpTot > 0 ? Math.min(1, m.points / fpTot) : 0, roles, { tone: facTone });
  fy += 8;
  ctx.save();
  ctx.font = F(THEME.fontSizeNormal); ctx.textBaseline = 'middle';
  text(ctx, fit(ctx, t(`econ.console.prodStatus.${m.status}`), L.factory.w), fx, fy + 8, facTone === 'alert' ? roles.alert : roles.primary);
  ctx.restore();
  arrow(fOut + 4, fMid, L.output.x - 4, midY(L.output), facTone, false);
  // produkt — zaznaczony towar (nawiasy wyboru), podgląd receptury pod kursorem (dzisiejsza strefa `resource_hover`)
  const o = L.output;
  ctx.save();
  ctx.textBaseline = 'middle';
  const oiw = drawResourceIcon(ctx, def.id, o.x + 6, o.y + 16, 24, def.icon) || 0;
  ctx.font = F(THEME.fontSizeMedium, true);
  text(ctx, fit(ctx, goodName(def.id), o.w - oiw - 14), o.x + oiw + 12, o.y + 16, roles.primary);
  ctx.font = F(THEME.fontSizeSmall);
  ctx.fillStyle = roles.dim;
  drawTabular(ctx, t('econ.console.prodHave', fmtAmt(Math.floor(m.output.stock))), o.x + 6, o.y + 40, 'left');
  ctx.fillStyle = facTone === 'alert' ? roles.alert : roles.primary;
  drawTabular(ctx, `+${rateStr(m.rate)} ${t('econ.console.prodUnitsYr')}`, o.x + o.w - 6, o.y + 40, 'right');
  ctx.restore();
  drawSelectBrackets(ctx, o, roles);
  ov._addHit(o.x, o.y, o.w, o.h, 'resource_hover', { resourceId: def.id });
}

/** Pasmo (c): baner wąskiego gardła + kolejka i zlecenia (przeniesione z pasa). */
function drawFoot(ov, ctx, r, def, m, scope, roles) {
  const b = m?.bottleneck ?? null;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = b ? roles.alert : roles.dim; ctx.globalAlpha = b ? 1 : 0.5; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(r.x, r.y + 0.5); ctx.lineTo(r.x + r.w, r.y + 0.5); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = F(THEME.fontSizeNormal, !!b);
  const msg = !def ? '' : b ? `${t('econ.console.bottleneck').toUpperCase()}: ${bottleneckText(b, def)}` : t('econ.console.prodNoBottleneck');
  text(ctx, fit(ctx, msg, r.w), r.x, r.y + 14, b ? roles.alert : roles.dim);
  ctx.restore();
  let y = r.y + 30;
  y += drawEyebrow(ctx, r.x, y, r.w, t('econ.console.prodQueue'), roles);
  const qr = queueRows(scope);
  ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
  if (!qr.length) { text(ctx, t('econ.console.prodQueueEmpty'), r.x, y + 8, roles.dim); ctx.restore(); return; }
  // dwie kolumny, gdy wierszy więcej niż mieści jedna
  const rowH = 16, perCol = Math.max(1, Math.floor((r.y + r.h - y) / rowH));
  const cols = qr.length > perCol ? 2 : 1, colW = Math.floor((r.w - (cols - 1) * 20) / cols);
  const cap = perCol * cols;
  const show = qr.length > cap ? qr.slice(0, cap - 1) : qr;
  show.forEach((q, i) => {
    const cx = r.x + Math.floor(i / perCol) * (colW + 20), yy = y + (i % perCol) * rowH + rowH / 2;
    const mark = q.kind === 'oneshot' ? '⚡ ' : q.kind === 'droid' ? '🤖 ' : '';
    const amt = q.kind === 'queue' ? `×${q.qty}` : `${Math.floor(q.produced)}/${q.qty}`;
    ctx.fillStyle = roles.primary;
    const aw = drawTabular(ctx, amt, cx + colW, yy, 'right');
    ctx.fillStyle = roles.foreign ?? roles.primary;
    ctx.fillText(fit(ctx, `${mark}${goodName(q.commodityId)} · ${q.colonyName}`, colW - aw - 8), cx, yy);
  });
  if (show.length < qr.length) text(ctx, t('econ.console.more', qr.length - show.length), r.x + r.w, y - 9, roles.dim, null, 'right');
  ctx.restore();
}

// ── (4) Inspektor ────────────────────────────────────────────────────────────────────────────────────────────────────

function wrap(ctx, s, x, y, w, color, vis, lineH = 15) {
  const words = String(s ?? '').split(' ');
  let line = '', yy = y;
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
  for (const wd of words) {
    const test = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(test).width > w && line) { if (vis(yy)) text(ctx, line, x, yy + 7, color); yy += lineH; line = wd; } else line = test;
  }
  if (line) { if (vis(yy)) text(ctx, line, x, yy + 7, color); yy += lineH; }
  ctx.restore();
  return yy - y;
}

function drawInspector(ov, ctx, x, y, w, vis, roles, hz, { def, model, ent, scope, scopeName, alerts, K, available, scopeFs, stockOf }) {
  let yy = y;
  const id = def.id;
  const kv = (k, v, tone = 'primary', unit = '') => { if (vis(yy)) drawKvRow(ctx, x, yy, w, k, v, roles, { tone, unit }); yy += CONSOLE_KIT.KV_H; };
  const chip = (cx, label, data, { enabled = true, danger = false, cw = PV.CHIP_W } = {}) => {
    if (!vis(yy)) return;
    drawActionChip(ctx, cx, yy, cw, roles, { label, enabled, danger, hover: enabled && isHov(hz, cx, yy) });
    if (enabled && data) ov._addHit(cx, yy, cw, CONSOLE_KIT.CHIP_H, 'factory_btn', data);
  };
  const statusTone = model.status === 'stalled' ? 'alert' : model.status === 'producing' ? 'primary' : 'dim';
  kv(t('econ.console.prodStatusKey'), t(`econ.console.prodStatus.${model.status}`), statusTone);
  yy += 4;
  const gate = factoryGate(ent);
  const colId = ent?.planetId ?? null;
  const fs = scopeFs;

  // instrument «zapas / minimum» + steppery obok (droid: sam zapas — bez minimalnego zapasu, jak dziś)
  const isDroid = !!def.isDroidUnit;
  const min = fs && !isDroid ? fs.getSafetyStockTarget(id) : null;
  const cell = stockMinCell(stockOf(id), min);
  const label = isDroid || !fs ? t('econ.console.prodStockScope') : t('econ.console.prodStockMin');
  let insH = 0;
  if (vis(yy) && vis(yy + 40)) insH = drawInstrument(ctx, x, yy, roles, { label, value: cell.text, tone: cell.tone }).h;
  else insH = 46;
  if (fs && !isDroid) {
    const bonus = fs.getDemandBonus?.(id) ?? 0;
    const locked = !available;
    const sw = 2 * PV.STEP_W + PV.BOX_W + 4;
    const sy = yy + insH - CONSOLE_KIT.CHIP_H - 2;
    const sx = x + w - sw;
    const save = yy; yy = sy;
    // zablokowany towar: − / + zostają (próg ustawiany przed odkryciem — jak dziś), bez pola wartości
    stepper(ov, ctx, sx, yy, vis, roles, hz, min,
      bonus > 0 ? { action: 'demand_minus', colonyId: colId, commodityId: id, label: '−', x: sx } : null,
      locked ? null : { action: 'demand_set_input', colonyId: colId, commodityId: id, label: 'box', x: sx + PV.STEP_W + 2, boxW: PV.BOX_W, boxH: CONSOLE_KIT.CHIP_H,
        boxCanvasX: sx + PV.STEP_W + 2, boxCanvasY: yy, baseTarget: Math.max(0, min - bonus) },
      { action: 'demand_plus', colonyId: colId, commodityId: id, label: '+', x: sx + PV.STEP_W + PV.BOX_W + 4 }, locked);
    yy = save + insH + 4;
    if (locked && def.requiresTech) yy += wrap(ctx, t('econPanel.minStockRequires', techName(def.requiresTech)), x, yy, w, roles.dim, vis);
  } else {
    yy += insH + 4;
    if (!isDroid && gate) yy += wrap(ctx, t(gate), x, yy, w, roles.dim, vis);
  }
  yy += 4;

  // droid: wyraźny blok budowy wysoko w inspektorze (ilość, duży [ ZBUDUJ × N ], koszt; wyłączony z powodem)
  if (isDroid) {
    yy += drawEyebrow(ctx, x, yy, w, t('econ.console.prodDroidBlock'), roles);
    const order = fs?.getDroidOrder?.(id) ?? null;
    const dGate = droidBuildGate({ scopeGate: gate, available, sustainable: fs?._colonyCanSustainRecipe ? fs._colonyCanSustainRecipe(id) : true });
    if (order) {
      if (vis(yy)) { ctx.save(); ctx.font = F(THEME.fontSizeNormal); ctx.textBaseline = 'middle';
        text(ctx, t('econ.console.prodDroidOrder', Math.floor(order.produced), order.qty), x, yy + 9, roles.primary); ctx.restore(); }
      chip(x + w - 110, t('econPanel.droidCancel'), { action: 'droid_cancel', colonyId: colId, commodityId: id, label: 'cancel', x: x + w - 110 }, { danger: true, cw: 110 });
      yy += CONSOLE_KIT.CHIP_H + 4;
      if (vis(yy)) drawBar(ctx, x, yy, w, Math.min(1, order.produced / Math.max(1, order.qty)), roles);
      yy += 8;
      const al = fs.getAllocations().find((a) => a.commodityId === id);
      if (al?.paused) yy += wrap(ctx, ov._stallReasonMsg(al.stallReason) ?? t('econPanel.noResources'), x, yy, w, roles.alert, vis);
    } else {
      const n = fs && colId ? ov._getDroidBuildQty(colId, id) : 1;
      if (!dGate) {
        stepper(ov, ctx, x, yy, vis, roles, hz, n,
          n > 1 ? { action: 'droid_qty_minus', colonyId: colId, commodityId: id, label: '−', x } : null, null,
          { action: 'droid_qty_plus', colonyId: colId, commodityId: id, label: '+', x: x + PV.STEP_W + PV.BOX_W + 4 }, false);
        yy += CONSOLE_KIT.CHIP_H + 6;
      }
      // duży przycisk budowy (rola primary), wyłączony — dim bez strefy, powód pod spodem
      const bh = PV.BIG_BTN_H;
      if (vis(yy) && vis(yy + bh - CONSOLE_KIT.KV_H)) {
        const hov = !dGate && isHov(hz, x, yy);
        ctx.save();
        const col = dGate ? roles.dim : roles.primary;
        if (hov) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = col; ctx.fillRect(x, yy, w, bh); ctx.globalAlpha = 1; }
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, yy + 0.5, w - 1, bh - 1);
        ctx.font = F(THEME.fontSizeMedium, true); ctx.textBaseline = 'middle';
        text(ctx, t('econ.console.prodDroidBuild', n), x + w / 2, yy + bh / 2 + 1, col, null, 'center');
        ctx.restore();
        drawSelectBrackets(ctx, { x, y: yy, w, h: bh }, roles, { tone: dGate ? 'dim' : 'primary' });
        if (!dGate) ov._addHit(x, yy, w, bh, 'factory_btn', { action: 'droid_build', colonyId: colId, commodityId: id, label: 'build', x });
      }
      yy += bh + 4;
      yy += wrap(ctx, ov._droidCostPreview(def, n), x, yy, w, roles.dim, vis);
      if (dGate) yy += wrap(ctx, t(dGate, techName(def.requiresTech)), x, yy, w, roles.alert, vis);
    }
    yy += 6;
  }

  kv(t('econ.console.prodRate'), `+${rateStr(model.rate)}`, model.rate > 0 ? 'primary' : 'dim', t('econ.console.prodUnitsYr'));
  kv(t('econ.console.prodScopeKey'), scopeName, 'dim');
  if ((def.creditCost ?? 0) > 0) kv(t('econ.console.prodCost'), String(def.creditCost), 'primary', 'Kr');
  yy += 6;

  // alerty towaru (+ brownout) — tylko kolonie zakresu
  const mine = alertsFor(alerts, id, new Set(scope.map((e) => e.planetId)));
  yy += drawEyebrow(ctx, x, yy, w, t('econ.console.prodAlerts', mine.length), roles);
  if (!mine.length) { if (vis(yy)) text(ctx, t('econPanel.noAlerts'), x, yy + 11, roles.dim, F(THEME.fontSizeSmall)); yy += CONSOLE_KIT.KV_H; }
  for (const a of mine) {
    const s = a.kind === 'brownout' ? t('econ.console.prodAlertBrownout', a.colonyName)
      : a.kind === 'stall' ? t('econ.console.prodAlertStall', a.colonyName, a.resId ? resName(a.resId) : '?')
        : t('econ.console.prodAlertLow', a.colonyName, a.resId ? resName(a.resId) : '?');
    yy += wrap(ctx, s, x, yy, w, a.level === 'critical' ? roles.alert : (roles.foreign ?? roles.primary), vis);
  }
  yy += 6;

  // trend wybranego towaru (10 lat, wszystkie kolonie)
  yy += drawEyebrow(ctx, x, yy, w, t('econ.console.prodTrend'), roles);
  const trend = goodTrend(K?.economyHistoryLog?.getYearlyHistory?.(10) ?? [], id);
  const maxV = Math.max(0, ...trend.map((b) => b.v));
  if (!(maxV > 0)) { if (vis(yy)) text(ctx, t('econPanel.prodChartNoData'), x, yy + 11, roles.dim, F(THEME.fontSizeSmall)); yy += CONSOLE_KIT.KV_H; } else {
    if (vis(yy) && vis(yy + PV.TREND_H - CONSOLE_KIT.KV_H)) {
      const bw = Math.max(2, Math.floor(w / Math.max(1, trend.length)) - 3);
      trend.forEach((b, i) => {
        const h = Math.round((b.v / maxV) * (PV.TREND_H - 4));
        ctx.save(); ctx.globalAlpha = b.current ? 0.5 : 1; ctx.fillStyle = roles.primary;
        ctx.fillRect(x + i * (bw + 3), yy + PV.TREND_H - h, bw, h); ctx.restore();
      });
    }
    yy += PV.TREND_H + 2;
    if (vis(yy)) {
      ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle'; ctx.fillStyle = roles.dim;
      drawTabular(ctx, String(trend[0]?.year ?? ''), x, yy + 7, 'left');
      drawTabular(ctx, `${trend.at(-1)?.year ?? ''} · max ${fmtAmt(maxV)}`, x + w, yy + 7, 'right');
      ctx.restore();
    }
    yy += CONSOLE_KIT.KV_H;
  }
  yy += 6;

  // działania fabryki zakresu: zlecenie jednorazowe, zapotrzebowanie, przełącznik fabryk
  yy += drawEyebrow(ctx, x, yy, w, t('econ.console.prodActions', scopeName), roles);
  if (gate) {
    chip(x, t('econ.console.prodOneShot'), null, { enabled: false });
    yy += CONSOLE_KIT.CHIP_H + 4;
    yy += wrap(ctx, t(gate), x, yy, w, roles.alert, vis);
  } else {
    const job = fs.oneShotJob;
    const og = oneShotGate({ def, available, job });
    if (og === 'job') {
      if (vis(yy)) {
        ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
        text(ctx, fit(ctx, t('econ.console.prodOneShotJob', goodName(job.commodityId), Math.floor(job.produced), job.qty), w), x, yy + 8, roles.primary);
        ctx.restore();
      }
      yy += CONSOLE_KIT.KV_H;
      if (vis(yy)) drawBar(ctx, x, yy, w, Math.min(1, job.produced / Math.max(1, job.qty)), roles);
      yy += 6;
      chip(x, t('econPanel.oneShotCancel'), { action: 'oneshot_cancel', colonyId: colId, label: t('econPanel.oneShotCancel'), x }, { danger: true, cw: 110 });
      yy += CONSOLE_KIT.CHIP_H + 6;
    } else if (og === null) {
      // pole ilości (DOM) obok czipu — pozycja ze strefy (skala z rysunku, bez window.inner*)
      chip(x, t('econ.console.prodOneShot'), { action: 'oneshot_pick', colonyId: colId, commodityId: id, label: 'os_' + id, x,
        boxCanvasX: x + PV.CHIP_W + 8, boxCanvasY: yy });
      yy += CONSOLE_KIT.CHIP_H + 6;
    } else if (!isDroid) {
      chip(x, t('econ.console.prodOneShot'), null, { enabled: false });
      yy += CONSOLE_KIT.CHIP_H + 4;
      yy += wrap(ctx, t(og, techName(def.requiresTech)), x, yy, w, roles.alert, vis);
    }
    // zapotrzebowanie automatyczne tego towaru (bez «safety» — to minimalny zapas w instrumencie wyżej)
    yy += 4;
    yy += drawEyebrow(ctx, x, yy, w, t('econ.console.prodDemand'), roles);
    const srcKey = { build: 'build', fuel: 'fuel', consumption: 'consumption', trade: 'trade', safety: 'safety', export_orders: 'exportOrders' };
    const demand = (fs.reactiveDemand ?? []).filter((d) => d.source !== 'safety' && d.commodityId === id);
    if (!demand.length) yy += wrap(ctx, t('econ.console.prodNoDemand'), x, yy, w, roles.dim, vis);
    const stock = fs.getStock?.(id) ?? 0;
    for (const d of demand) {
      const lab = srcKey[d.source] ? t(`econPanel.reactiveSource.${srcKey[d.source]}`) : t('econ.console.otherSource');
      kv(lab, `${fmtAmt(Math.round(stock * 10) / 10)} / ${fmtAmt(Math.round(d.qty * 10) / 10)}`, stock >= d.qty ? 'primary' : 'alert');
      if (d.source === 'consumption') {
        const bonus = fs.getDemandBonus?.(id) ?? 0;
        const consBase = Math.max(0, Math.round(d.qty - bonus));
        yy += stepper(ov, ctx, x, yy, vis, roles, hz, Math.round(d.qty),
          bonus > 0 ? { action: 'demand_minus', colonyId: colId, commodityId: id, label: '−', x } : null,
          { action: 'demand_set_input', colonyId: colId, commodityId: id, label: 'box', x: x + PV.STEP_W + 2, boxW: PV.BOX_W, boxH: CONSOLE_KIT.CHIP_H,
            boxCanvasX: x + PV.STEP_W + 2, boxCanvasY: yy, baseTarget: consBase },
          { action: 'demand_plus', colonyId: colId, commodityId: id, label: '+', x: x + PV.STEP_W + PV.BOX_W + 4 }, false);
      }
    }
    // fabryki kolonii: FP i przełącznik
    yy += 4;
    yy += drawEyebrow(ctx, x, yy, w, t('econ.console.prodFactories', scopeName), roles);
    kv(t('econ.console.prodFpKey'), `${fs.freePoints} / ${fs.totalPoints}`, 'primary');
    const online = fs.isProductionEnabled();
    const swLabel = online ? t('econPanel.factoriesOnline') : t('econPanel.factoriesOffline');
    chip(x, swLabel, { action: 'toggle_production', colonyId: colId, label: swLabel, x, tooltip: t('econPanel.factoriesToggleTip') }, { danger: !online, cw: 200 });
    yy += CONSOLE_KIT.CHIP_H + 6;
  }
  yy += 8;
  return yy - y;
}

/** Stepper [ − ] wartość [ + ]: strefy tylko dla podanych danych (dzisiejsze reguły). Zwraca wysokość. */
function stepper(ov, ctx, x, y, vis, roles, hz, value, minus, box, plus, boxLocked) {
  if (vis(y)) {
    drawActionChip(ctx, x, y, PV.STEP_W, roles, { label: '−', enabled: !!minus, hover: !!minus && isHov(hz, x, y) });
    if (minus) ov._addHit(x, y, PV.STEP_W, CONSOLE_KIT.CHIP_H, 'factory_btn', minus);
    const bx = x + PV.STEP_W + 2;
    ctx.save();
    ctx.font = F(THEME.fontSizeNormal); ctx.textBaseline = 'middle';
    ctx.fillStyle = boxLocked ? roles.dim : roles.primary;
    drawTabular(ctx, String(value), bx + PV.BOX_W / 2, y + CONSOLE_KIT.CHIP_H / 2, 'center');
    ctx.strokeStyle = boxLocked ? roles.dim : roles.primary; ctx.globalAlpha = isHov(hz, bx, y) ? 1 : 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx + 4, y + CONSOLE_KIT.CHIP_H - 1.5); ctx.lineTo(bx + PV.BOX_W - 4, y + CONSOLE_KIT.CHIP_H - 1.5); ctx.stroke();
    ctx.restore();
    if (box) ov._addHit(bx, y, PV.BOX_W, CONSOLE_KIT.CHIP_H, 'factory_btn', box);
    const px = x + PV.STEP_W + PV.BOX_W + 4;
    drawActionChip(ctx, px, y, PV.STEP_W, roles, { label: '+', enabled: true, hover: isHov(hz, px, y) });
    if (plus) ov._addHit(px, y, PV.STEP_W, CONSOLE_KIT.CHIP_H, 'factory_btn', plus);
  }
  return CONSOLE_KIT.CHIP_H + 4;
}

// ── Pas: kolejka i zlecenia · zlecenia eksportowe · wykres 10 lat ─────────────────────────────────────────────────────

/** Pas: zlecenia eksportowe (przełączniki dla kolonii zakresu — Finding 742) + JEDEN wykres 10 lat (globalny, opisany). */
function drawStrip(ov, ctx, sr, roles, hz, { ent, scope, K }) {
  ov._consoleStripRect = sr;
  const gap = 20;
  const wB = Math.floor(sr.w * 0.55), wC = sr.w - wB - gap;
  const secB = { x: sr.x, y: sr.y, w: wB, h: sr.h };
  const secC = { x: sr.x + wB + gap, y: sr.y, w: wC, h: sr.h };
  const rowH = 16;
  let y = secB.y + drawEyebrow(ctx, secB.x, secB.y, secB.w, t('econ.console.prodExport'), roles);
  const fs = !factoryGate(ent) ? ent.factorySystem : null;
  if (fs) {
    const prefs = fs.exportPrefs ?? { enabled: true, tiers: { 1: true, 2: true, 3: false, 4: false } };
    const colId = ent.planetId;
    const tl = prefs.enabled ? t('econPanel.exportOn') : t('econPanel.exportOff');
    const tw = 130;
    drawActionChip(ctx, secB.x, y, tw, roles, { label: tl, enabled: true, danger: !prefs.enabled, hover: isHov(hz, secB.x, y) });
    ov._addHit(secB.x, y, tw, CONSOLE_KIT.CHIP_H, 'factory_btn', { action: 'export_toggle_enabled', colonyId: colId, label: tl, x: secB.x });
    let tx = secB.x + tw + 8;
    const tierW = Math.max(58, Math.floor((secB.w - tw - 8) / 4) - 2);
    const twoRows = tx + 4 * (tierW + 2) > secB.x + secB.w;
    if (twoRows) { y += CONSOLE_KIT.CHIP_H + 4; tx = secB.x; }
    for (const tier of [1, 2, 3, 4]) {
      const on = prefs.tiers?.[tier] === true;
      const label = `T${tier} ${on ? '✓' : '✗'}`;
      drawActionChip(ctx, tx, y, tierW, roles, { label, enabled: !!prefs.enabled, hover: prefs.enabled && isHov(hz, tx, y) });
      if (prefs.enabled) ov._addHit(tx, y, tierW, CONSOLE_KIT.CHIP_H, 'factory_btn', { action: 'export_toggle_tier', colonyId: colId, tier, label, x: tx });
      tx += tierW + 2;
    }
    y += CONSOLE_KIT.CHIP_H + 4;
  } else {
    ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
    text(ctx, fit(ctx, t(factoryGate(ent)), secB.w), secB.x, y + 8, roles.dim);
    ctx.restore();
    y += rowH;
  }
  const cm = K?.colonyManager;
  const ex = exportRows(scope, K?.productionRequestBoard, (cid) => cm?.getColony?.(cid)?.name ?? '?');
  const items = [...ex.accepted.map((a) => ({ a })), ...(ex.available > 0 ? [{ avail: ex.available }] : [])];
  ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
  if (!items.length) text(ctx, t('econ.console.prodExportNone'), secB.x, y + 8, roles.dim);
  const fitN = Math.max(0, Math.floor((secB.y + secB.h - y) / rowH));
  const show = items.length > fitN ? items.slice(0, Math.max(0, fitN - 1)) : items;
  for (const it of show) {
    const yy = y + rowH / 2;
    if (it.avail) { ctx.fillStyle = roles.dim; ctx.fillText(fit(ctx, t('econPanel.exportAvailable', it.avail), secB.w), secB.x, yy); }
    else {
      const a = it.a;
      ctx.fillStyle = roles.primary;
      const aw = drawTabular(ctx, `${a.remaining}/${a.total}`, secB.x + secB.w, yy, 'right');
      ctx.fillStyle = roles.foreign ?? roles.primary;
      ctx.fillText(fit(ctx, `→ ${goodName(a.commodityId)} · ${a.requester}`, secB.w - aw - 8), secB.x, yy);
    }
    y += rowH;
  }
  if (show.length < items.length) text(ctx, t('econ.console.more', items.length - show.length), secB.x, y + 8, roles.dim);
  ctx.restore();

  // wykres 10 lat (dzisiejszy prawej kolumny: wszystkie towary, wszystkie kolonie)
  y = secC.y + drawEyebrow(ctx, secC.x, secC.y, secC.w, t('econ.console.prodChart'), roles);
  const data = K?.economyHistoryLog?.getYearlyHistory?.(10) ?? [];
  if (!data.some((d) => d.producedTotal > 0 || d.consumedTotal > 0)) {
    ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
    text(ctx, fit(ctx, t('econPanel.prodChartNoData'), secC.w), secC.x, y + 8, roles.dim);
    ctx.restore();
    return;
  }
  const barH = Math.max(8, Math.floor((secC.y + secC.h - y - 2 * 15) / 2));
  for (const [key, labKey, tone] of [['producedTotal', 'econPanel.prodChartProduced', 'primary'], ['consumedTotal', 'econPanel.prodChartConsumed', 'foreign']]) {
    const maxV = Math.max(1, ...data.map((d) => d[key]));   // skala per seria (jak dzisiejsze mini-słupki)
    ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
    text(ctx, t(labKey), secC.x, y + 6, roles.dim);
    ctx.fillStyle = roles.dim;
    drawTabular(ctx, fmtAmt(data.at(-1)?.[key] ?? 0), secC.x + secC.w, y + 6, 'right');
    ctx.restore();
    y += 13;
    const bw = Math.max(2, Math.floor(secC.w / data.length) - 2);
    data.forEach((d, i) => {
      const h = Math.round((d[key] / maxV) * barH);
      ctx.save(); ctx.globalAlpha = d.current ? 0.5 : 1; ctx.fillStyle = roles[tone] ?? roles.primary;
      ctx.fillRect(secC.x + i * (bw + 2), y + barH - h, bw, h);
      ctx.restore();
    });
    y += barH + 2;
  }
}
