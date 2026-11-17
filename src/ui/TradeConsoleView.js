// TradeConsoleView — Handel i Rynek na zestawie konsoli (ARC KONSOLE K3-B, docs/design/CONSOLES_PLAN.md §1.2; KZ-E: jedyna ścieżka).
//
// Wołane przez `TradeOverlay.draw`, gdy `isKitScreen('trade')`. Ta sama instancja, zakładka `_tab` ('trade' | 'market') wybiera stronę.
// Szablon 4-strefowy (D-K-1), nagłówek grupy Ekonomii jak na Budżecie i Przepływach (D-K-15: te same czipy z każdej strony):
//  HANDEL: (2) lista połączeń handlu cywilnego (nowa strefa `trade_conn` — wybór) · (3) bohater: kredyty handlu, przepustowość,
//          wykresy eksport / import (dzisiejsze strefy `trade_bar_hover`) · (4) inspektor: przepływy połączenia, ceny lokalne
//          (nazwy, Finding 725), wydatki (`spend_rush` / `spend_buy` / `spend_festival`), migracja (`migration_toggle`), siatka
//          towarów (`trade_toggle_good`) · pas: dziennik transakcji;
//  RYNEK:  (2) imperia-partnerzy → kolonie (`market_empire`, `market_empire_toggle`, `market_colony`) · (3) bohater: zapasy i ceny
//          kolonii AI (`market_good`) · (4) inspektor: zlecenie (`market_qty`, `market_qty_edit`, `market_buy`, `market_sell`) ·
//          pas: zlecenia w toku (`market_cancel`).
// Geometria — wyłącznie `consoleZones` (wejście czyta strefy ostatniej klatki; pole ilości <input> też). Kolory — role.

import { THEME } from '../config/ThemeConfig.js';
import { t, getName } from '../i18n/i18n.js';
import { TRADEABLE_GOODS, BASE_PRICE } from '../data/TradeValuesData.js';
import { TECHS } from '../data/TechData.js';
import { DELAY_YEARS } from '../systems/TradeOrderBoard.js';
import { consoleZones, consoleClockRect, insetRect, uiViewport, CONSOLE_SCREEN_SPECS } from './ConsoleLayoutLogic.js';
import { drawConsoleHeader, drawZoneFrame, drawZoneRule, drawEyebrow, drawKvRow, drawInstrument, drawList, drawTabular,
  drawActionChip, drawSelectBrackets, drawConsoleTooltip, chipLabel, CONSOLE_KIT } from './ConsoleKit.js';
import { consoleRoles } from './ConsoleRolesLogic.js';
import { NAV_GROUPS } from './CivPanelDrawer.js';
import { clampScroll, scrollThumb } from './InfoPanelLayoutLogic.js';
import { truncateText } from './HudLabelLogic.js';
import { economyGroupChips } from './EconomyConsoleLogic.js';
import { goodName, connectionRows, pickConnection, ALL_CONNS, connectionHistory, connectionFlowBars, orderGate, spendGates,
  tradeColonyOptions, pickTradeColony, TRADE_REASON_KEYS, priceGroups, emergencyBuy, partnerRows, boardColumns, fmtKr, fmtQty,
  logEntries, SPEND_COST } from './TradeConsoleLogic.js';

// Wymiary widoku (px logiczne)
const TV = Object.freeze({
  HERO_INSET: 18,
  STRIP_H: 96,         // pas: dziennik transakcji / zlecenia w toku
  CHART_MAX_H: 220,    // wykres eksport / import
  CHART_GAP: 24,
  BAR_MAX_W: 36,       // słupek wykresu (przy kilku latach nie rozlewa się na całą szerokość)
  BOARD_ROW_H: 18,     // wiersz tablicy towarów Rynku
  BOARD_GAP: 18,
  BOARD_HEAD_H: 18,    // nagłówki kolumn tablicy (towar · zapas / cena)
  GRID_ROW_H: 18,      // siatka kontroli towarów (inspektor)
  TOGGLE_W: 64,        // „⇄ WŁ” w wierszu imperium
  CANCEL_W: 84,        // „[ ANULUJ ]” w wierszu zlecenia
  QTY_BOX_W: 52,
});

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
function text(ctx, s, x, y, color, font = null, align = 'left') {
  if (font) ctx.font = font;
  ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}
const nm = (id) => goodName(id, getName);
const kr = () => t('econ.console.krPerYear');

/** Tekst łamany po słowach do szerokości `w` (komunikaty pustych stanów w wąskich strefach). Zwraca wysokość. */
function wrapText(ctx, s, x, y, w, color, lineH = 16) {
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall);
  ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
  const words = String(s ?? '').split(/\s+/).filter(Boolean);
  let line = '', yy = y;
  for (const wd of words) {
    const test = line ? `${line} ${wd}` : wd;
    if (line && ctx.measureText(test).width > w) { ctx.fillText(line, x, yy + 12); yy += lineH; line = wd; } else line = test;
  }
  if (line) { ctx.fillText(line, x, yy + 12); yy += lineH; }
  ctx.restore();
  return yy - y;
}

/** Wejście: rysuje stronę Handlu (`ov._tab`: 'trade' | 'market'). */
export function drawTradeConsole(ov, ctx, W, H) {
  const roles = consoleRoles(THEME);
  const K = window.KOSMOS;
  const spec = { ...(CONSOLE_SCREEN_SPECS.trade ?? {}), stripH: TV.STRIP_H, clock: consoleClockRect(W, H, NAV_GROUPS.length) };
  const z = consoleZones(ov._getOverlayBounds(W, H), spec);
  ov.consoleZones = z;
  ov._consoleTooltip = null;
  // skala UI do pola <input> i podpowiedzi DOM — liczona tu (rysunek), handlery czytają zapamiętaną wartość
  if (typeof window !== 'undefined' && window.innerWidth) ov._uiScale = uiViewport(window.innerWidth, window.innerHeight).scale;
  const hz = ov._hoverZone;
  // przełączenie Handel ↔ Rynek: pas i inspektor od góry (listę i inspektor zeruje już klik czipu — `applyEconChip`)
  if (ov._kitStripTab !== ov._tab) { ov._kitStripTab = ov._tab; ov._kitScrollStrip = 0; ov._kitInspContentH = 0; }

  // (1) Nagłówek — czipy grupy Ekonomii (te same z każdej strony)
  const hoverHdr = hz?.type === 'tab' ? hz.data?.id : hz?.type === 'close' ? 'close' : null;
  const chips = economyGroupChips('trade', ov._tab, t);
  for (const h of drawConsoleHeader(ctx, z, roles, { title: t('econPanel.header'), chips, hoverId: hoverHdr })) {
    if (h.type === 'close') ov._addHit(h.x, h.y, h.w, h.h, 'close');
    else ov._addHit(h.x, h.y, h.w, h.h, 'tab', { id: h.id });
  }

  if (ov._tab === 'market') drawMarket(ov, ctx, z, roles, K, hz);
  else drawTrade(ov, ctx, z, roles, K, hz);

  if (ov._consoleTooltip) drawConsoleTooltip(ctx, ov._consoleTooltip, z.frame, roles, { tone: 'dim' });
}

// ── Wspólne: strefa z głowicą i przewijaniem ─────────────────────────────────────────────────────────────────────────

/** Inspektor przewijany `ov._scrollRight` (ten sam stan, który zeruje przełączenie Handel ↔ Rynek). */
function drawScrolledInspector(ov, ctx, iz, roles, label, body) {
  const ih = drawZoneRule(ctx, iz, label, roles);
  const rect = { x: iz.x, y: iz.y + ih + 6, w: iz.w, h: Math.max(0, iz.h - ih - 6) };
  ov._consoleInspRect = rect;
  const sc = clampScroll(ov._scrollRight ?? 0, ov._kitInspContentH ?? 0, rect.h);
  ov._scrollRight = sc;
  // tylko elementy w całości w pasie widoku dostają strefy (clip nie przycina stref trafień — Finding 110)
  const vis = (y, h = CONSOLE_KIT.KV_H) => y >= rect.y - 1 && y + h <= rect.y + rect.h + 1;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  const h = body(rect.x, rect.y - sc, rect.w - CONSOLE_KIT.SCROLLBAR_W - 6, vis);
  ctx.restore();
  ov._kitInspContentH = h;
  drawScrollbar(ctx, rect, sc, h, roles);
}

function drawScrollbar(ctx, rect, sc, contentH, roles) {
  const th = scrollThumb(sc, contentH, rect.h, rect.y);
  if (!th) return;
  ctx.save();
  const sx = rect.x + rect.w - CONSOLE_KIT.SCROLLBAR_W;
  ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(sx, rect.y, CONSOLE_KIT.SCROLLBAR_W, rect.h);
  ctx.globalAlpha = 1; ctx.fillStyle = roles.primary; ctx.fillRect(sx, th.y, CONSOLE_KIT.SCROLLBAR_W, th.h);
  ctx.restore();
}

/** Prostokąt treści strefy pod głowicą (lista / pas). */
function ruledRect(ctx, zr, label, roles) {
  const h = drawZoneRule(ctx, zr, label, roles);
  return { x: zr.x, y: zr.y + h + 4, w: zr.w, h: Math.max(0, zr.h - h - 4) };
}

/** Pas: lista przewijana `ov._kitScrollStrip`; zwraca strefy wierszy drawList. */
function drawStripList(ov, ctx, strip, label, rows, roles, opts = {}) {
  const rect = ruledRect(ctx, strip, label, roles);
  ov._consoleStripRect = rect;
  if (!rows.length) { wrapText(ctx, opts.empty ?? '', rect.x, rect.y, rect.w, roles.dim); return []; }
  const res = drawList(ctx, rect, rows, roles, { scroll: ov._kitScrollStrip ?? 0, selectedId: null, hoverId: opts.hoverId ?? null,
    renderRow: opts.renderRow ?? null, underline: false });
  ov._kitScrollStrip = res.scroll;
  return res.zones;
}

/**
 * K3 runda 2 — pierwsza linia strefy listy: „Twoja kolonia: <nazwa> ▾” (strefa `trade_ctx_toggle`). Otwarta: lista kolonii gracza —
 * pełne wybieralne (`trade_ctx_pick`), placówki przygaszone z powodem (bez strefy). Zwraca prostokąt pozostały na listę strony.
 */
function colonyContext(ov, ctx, rect, roles, hz) {
  const cm = window.KOSMOS?.colonyManager;
  const opts = tradeColonyOptions(cm?.getPlayerColonies?.() ?? []);
  const cur = ov._tradeColonyId();
  const curName = opts.find((o) => o.id === cur)?.name;
  const rowH = 24;
  const r0 = { x: rect.x, y: rect.y, w: rect.w, h: rowH };
  ctx.save();
  ctx.textBaseline = 'middle';
  if (hz?.type === 'trade_ctx_toggle') { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(r0.x, r0.y, r0.w, r0.h); ctx.globalAlpha = 1; }
  const label = `${curName ? t('econ.console.ctxLabel', curName) : t('econ.console.ctxNone')} ${ov._ctxOpen ? '▴' : '▾'}`;
  text(ctx, truncateText(label, r0.w - 2 * CONSOLE_KIT.ROW_PAD_X, (q) => { ctx.font = F(THEME.fontSizeNormal, true); return ctx.measureText(q).width; }),
    r0.x + CONSOLE_KIT.ROW_PAD_X, r0.y + rowH / 2, curName ? roles.primary : roles.alert, F(THEME.fontSizeNormal, true));
  ctx.restore();
  ov._addHit(r0.x, r0.y, r0.w, r0.h, 'trade_ctx_toggle', {});
  let y = rect.y + rowH + 6;
  if (ov._ctxOpen) {
    y += drawEyebrow(ctx, rect.x + CONSOLE_KIT.ROW_PAD_X, y, rect.w - 2 * CONSOLE_KIT.ROW_PAD_X, t('econ.console.ctxPick'), roles);
    ctx.save();
    ctx.textBaseline = 'middle';
    for (const o of opts) {
      const rr = { x: rect.x, y, w: rect.w, h: 22 };
      if (o.ok) {
        const hov = hz?.type === 'trade_ctx_pick' && hz.data?.colonyId === o.id;
        if (hov) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(rr.x, rr.y, rr.w, rr.h); ctx.globalAlpha = 1; }
        text(ctx, o.name, rr.x + CONSOLE_KIT.ROW_PAD_X, rr.y + 11, roles.primary, F(THEME.fontSizeNormal));
        if (o.id === cur) drawSelectBrackets(ctx, rr, roles);
        ov._addHit(rr.x, rr.y, rr.w, rr.h, 'trade_ctx_pick', { colonyId: o.id });
      } else {
        const s2 = `${o.name} — ${t(o.reasonKey)}`;
        text(ctx, truncateText(s2, rr.w - 2 * CONSOLE_KIT.ROW_PAD_X, (q) => { ctx.font = F(THEME.fontSizeSmall); return ctx.measureText(q).width; }),
          rr.x + CONSOLE_KIT.ROW_PAD_X, rr.y + 11, roles.dim, F(THEME.fontSizeSmall));
      }
      y += 22;
    }
    ctx.restore();
  }
  return { x: rect.x, y, w: rect.w, h: Math.max(0, rect.y + rect.h - y) };
}

/**
 * K3 runda 2 — `KOSMOS.debug.trade.ctx()`: aktywna kolonia gry, kolonia Handlu, każda bramka `placeOrder` (dla wybranej / pierwszej
 * kolonii AI z traktatem i towaru) i każda bramka wydatków. Tylko odczyt.
 */
export function installTradeDebug(ov) {
  const K = window.KOSMOS;
  if (!K) return;
  K.debug ??= {};
  if (K.debug.trade?.__ov === ov) return;
  const colInfo = (c) => (c ? { id: c.planetId, name: c.name ?? null,
    type: c.ownerEmpireId && c.ownerEmpireId !== 'player' ? 'ai_colony' : c.isOutpost ? 'outpost' : 'full_colony',
    pop: c.civSystem?.population ?? null } : null);
  K.debug.trade = {
    __ov: ov,
    ctx() {
      const KK = window.KOSMOS, cm = KK?.colonyManager;
      const active = cm?.getColony?.(cm?.activePlanetId) ?? null;
      const tradeCol = cm?.getColony?.(ov._tradeColonyId?.() ?? cm?.activePlanetId) ?? null;
      const ai = (ov._marketAiColId && cm?.getColony?.(ov._marketAiColId))
        || (cm?.getAllColonies?.() ?? []).find((c) => c.ownerEmpireId && KK?.diplomacySystem?.hasTradeAgreement?.(c.ownerEmpireId)) || null;
      const goodId = ov._marketGoodId ?? 'Fe';
      const qty = ov._marketQty ?? 0;
      const civ = KK?.civilianTradeSystem;
      const price = (g, c) => (civ?.getLocalPrice ? civ.getLocalPrice(g, c) : (BASE_PRICE[g] ?? 1));
      const placeOrderGates = {
        playerColony_isPlayer: !!tradeCol && !(tradeCol.ownerEmpireId && tradeCol.ownerEmpireId !== 'player'),
        playerColony_notOutpost: !!tradeCol && !tradeCol.isOutpost,
        aiColony: ai ? `${ai.name} (${ai.ownerEmpireId})` : null,
        tech_ion_drives: KK?.techSystem?.isResearched?.('ion_drives') ?? false,
        tradeTreaty: ai ? (KK?.diplomacySystem?.hasTradeAgreement?.(ai.ownerEmpireId) ?? false) : null,
      };
      const base = { playerOk: placeOrderGates.playerColony_isPlayer && placeOrderGates.playerColony_notOutpost, qty,
        warp: placeOrderGates.tech_ion_drives, agreement: !!placeOrderGates.tradeTreaty,
        playerCredits: tradeCol?.credits ?? 0, aiCredits: ai?.credits ?? 0,
        aiStock: ai?.resourceSystem?.inventory?.get(goodId) ?? 0, ownStock: tradeCol?.resourceSystem?.inventory?.get(goodId) ?? 0,
        empireName: ai?.ownerEmpireId ?? '', techName: TECHS.ion_drives ? getName(TECHS.ion_drives, 'tech') : 'ion_drives' };
      const fmt = (g) => (g.ok ? 'OK' : t(g.key, ...g.args));
      const buy = ai ? orderGate({ ...base, side: 'buy', total: price(goodId, tradeCol ?? ai) * qty }) : null;
      const sell = ai ? orderGate({ ...base, side: 'sell', total: price(goodId, ai) * qty }) : null;
      const prices = tradeCol?.resourceSystem ? ov._calcLocalPrices?.(tradeCol) ?? [] : [];
      const eb = emergencyBuy(prices);
      const credits = civ?.getCredits?.(tradeCol?.planetId) ?? 0;
      const sg = spendGates({ credits, hasConstruction: (tradeCol?.buildingSystem?._constructionQueue?.size ?? 0) > 0,
        buyTarget: !!eb.target, buyCost: eb.cost, festivalActive: !!tradeCol?.prosperitySystem?._eventBonuses?.has('trade_festival') });
      return { activeColony: colInfo(active), tradeColony: colInfo(tradeCol), consoleOn: !!ov.consoleZones,
        market: { good: goodId, qty, placeOrderGates, buy: buy ? fmt(buy) : 'brak kolonii AI z traktatem', sell: sell ? fmt(sell) : null },
        spend: { tradeCredits: credits, rush: fmt(sg.rush), emergencyBuy: fmt(sg.buy), festival: fmt(sg.festival) } };
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// HANDEL
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function drawTrade(ov, ctx, z, roles, K, hz) {
  const colMgr = K?.colonyManager;
  const civTrade = K?.civilianTradeSystem;
  const tradeLog = K?.tradeLog;
  const tradeColId = ov._tradeColonyId();   // K3 runda 2 — kolonia Handlu (lokalna), nie globalna aktywna
  // te same źródła co dawna lewa kolumna Handlu (usunięta w KZ-E)
  const civCredits = civTrade?.getCredits(tradeColId) ?? 0;
  const civPerYear = civTrade?.getCreditsPerYear(tradeColId) ?? 0;
  const civTC = civTrade?.getTradeCapacity(tradeColId) ?? 0;
  const civConns = civTrade?.getConnections(tradeColId) ?? [];
  const hasCivTrade = civConns.length > 0 || civCredits > 0;
  const flows = hasCivTrade ? (civTrade?.getFlowsForColony(tradeColId) ?? []) : [];
  const rows = connectionRows(civConns, flows);
  ov._tradeConnId = pickConnection(rows, ov._tradeConnId);
  const conn = ov._tradeConnId === ALL_CONNS ? null : (rows.find((r) => r.id === ov._tradeConnId) ?? null);
  const rawConn = conn ? civConns.find((c) => c.partnerId === conn.id) : null;
  // dane JEDNEGO połączenia: przepływy (per partner), historia z dziennika (po nazwie partnera), ceny u partnera (kolonia końca)
  const connFlows = conn ? flows.filter((f) => f.partnerId === conn.id) : [];
  const connHist = conn ? connectionHistory(tradeLog?.getLog(tradeColId, 200) ?? [], conn.name, 10) : null;
  const connBars = conn ? connectionFlowBars(flows, conn.id) : [];

  // (2) Lista połączeń — pierwszy wiersz „Wszystkie połączenia” (dzisiejszy widok globalny)
  const listRect = colonyContext(ov, ctx, ruledRect(ctx, z.list, t('econ.console.tradeConns'), roles), roles, hz);
  ov._consoleListRect = listRect;
  if (ov._ctxOpen) { /* lista wyboru kolonii zajmuje strefę listy */ } else if (!hasCivTrade || rows.length === 0) {
    wrapText(ctx, hasCivTrade ? t('tradePanel.noConnections') : t('tradePanel.noTrade'), listRect.x + CONSOLE_KIT.ROW_PAD_X,
      listRect.y, listRect.w - 2 * CONSOLE_KIT.ROW_PAD_X, roles.dim);
  } else {
    const lrows = [{ id: ALL_CONNS, label: t('econ.console.allConns'), value: String(rows.length), tone: 'dim' }]
      .concat(rows.map((r) => ({ id: r.id, label: r.name, value: t('econ.console.au', r.distance.toFixed(1)), tone: 'dim' })));
    const hoverRow = hz?.type === 'trade_conn' ? hz.data?.partnerId : null;
    const res = drawList(ctx, listRect, lrows, roles, { selectedId: ov._tradeConnId, hoverId: hoverRow, scroll: ov._scrollLeft });
    ov._scrollLeft = res.scroll;
    for (const zz of res.zones) ov._addHit(zz.x, zz.y, zz.w, zz.h, 'trade_conn', { partnerId: zz.id });
  }

  // (3) Bohater — kredyty, przepustowość, eksport / import (wszystkie połączenia albo wybrane)
  drawZoneFrame(ctx, z.hero, roles);
  const r = insetRect(z.hero, TV.HERO_INSET);
  let y = r.y;
  const a = drawInstrument(ctx, r.x, y, roles, { label: t('econ.console.civCredits'), value: civCredits.toFixed(0), unit: 'Kr',
    delta: `${civPerYear >= 0 ? '+' : ''}${civPerYear.toFixed(1)} ${kr()}`, deltaTone: civPerYear >= 0 ? 'dim' : 'alert' });
  drawInstrument(ctx, r.x + Math.max(a.w + 48, Math.min(r.w * 0.5, 320)), y, roles,
    { label: t('econ.console.tradeCapacity'), value: civTC.toFixed(0), unit: kr() });
  y += a.h + 22;
  const yearly = conn ? connHist : (tradeLog?.getYearlyAggregation(tradeColId, 10) ?? []);
  const useBars = !!conn && !yearly.length && connBars.length > 0;
  const eyebrow = !conn ? t('econ.console.exportImport')
    : useBars ? t('econ.console.connCurrent', conn.name) : t('econ.console.connHistory', conn.name);
  y += drawEyebrow(ctx, r.x, y, r.w, eyebrow, roles);
  if (yearly.length || useBars) {
    text(ctx, t(useBars ? 'econ.console.flowLegend' : 'econ.console.chartLegend'), r.x, y + 10, roles.dim, F(THEME.fontSizeSmall));
    y += 18;
  }
  const halfW = Math.floor((r.w - TV.CHART_GAP) / 2);
  const chartH = Math.max(40, Math.min(TV.CHART_MAX_H, r.y + r.h - y - 34));
  if (useBars) {
    drawFlowBars(ov, ctx, r.x, y + 4, halfW, chartH, connBars.filter((b) => b.isExport), true, roles, hz);
    drawFlowBars(ov, ctx, r.x + halfW + TV.CHART_GAP, y + 4, halfW, chartH, connBars.filter((b) => !b.isExport), false, roles, hz);
  } else if (!yearly.length) {
    wrapText(ctx, conn ? t('econ.console.connNoData') : t('tradePanel.noActivity'), r.x, y + 2, r.w, roles.dim);
  } else {
    let maxVal = 1;
    for (const yr of yearly) maxVal = Math.max(maxVal, yr.exports, yr.imports);
    drawChart(ov, ctx, r.x, y + 4, halfW, chartH, yearly, true, maxVal, roles, hz);
    drawChart(ov, ctx, r.x + halfW + TV.CHART_GAP, y + 4, halfW, chartH, yearly, false, maxVal, roles, hz);
  }

  // (4) Inspektor — połączenie (albo wszystkie): przepływy, ceny; potem wydatki, migracja, towary kolonii
  drawScrolledInspector(ov, ctx, z.inspector, roles, conn ? conn.name : t('econ.console.allConns'), (x, y0, w, vis) => {
    let yy = y0;
    if (!hasCivTrade) return wrapText(ctx, t('tradePanel.noTrade'), x, yy, w, roles.dim);
    const kv = (k, v, tone = 'primary', unit = '') => { if (vis(yy)) drawKvRow(ctx, x, yy, w, k, v, roles, { tone, unit }); yy += CONSOLE_KIT.KV_H; };
    const colony = colMgr?.getColony(tradeColId);

    if (conn) {
      // fakty połączenia
      yy += drawEyebrow(ctx, x, yy, w, t('econ.console.connInfo'), roles);
      kv(t('econ.console.partner'), conn.name);
      kv(t('econ.console.distance'), t('econ.console.au', conn.distance.toFixed(1)));
      if (Number.isFinite(rawConn?.gradient)) kv(t('econ.console.prosperityGap'), `${Math.round(rawConn.gradient * 100)}%`, 'dim');
      yy += 8;
    }
    // przepływy połączenia (albo wszystkich, zsumowane per towar)
    yy += drawEyebrow(ctx, x, yy, w, conn ? t('econ.console.connFlows') : t('econ.console.allFlows'), roles);
    const fl = conn ? connFlows : connectionFlowBars(flows, ALL_CONNS)
      .map((b) => ({ goodId: b.goodId, qtyPerYear: b.qty, direction: b.isExport ? 'export' : 'import' }));
    if (conn && !fl.length) yy += wrapText(ctx, t(connHist?.length ? 'econ.console.connNoFlows' : 'econ.console.connNoData'), x, yy, w, roles.dim) + 4;
    else if (!fl.length) kv(t('tradePanel.noFlow'), '', 'dim');
    for (const f of fl) {
      const exp = f.direction === 'export';
      kv(`${exp ? '↑' : '↓'} ${nm(f.goodId)}`, f.qtyPerYear.toFixed(1), exp ? 'primary' : 'foreign', t('econ.console.perYear'));
    }
    yy += 8;

    // ceny (Finding 725 — nazwy zamiast id): ceny są per kolonia → przy wybranym połączeniu ceny u partnera (koniec połączenia)
    const prices = colony?.resourceSystem ? ov._calcLocalPrices(colony) : [];
    const priceCol = conn ? colMgr?.getColony(conn.id) : colony;
    if (priceCol?.resourceSystem) {
      yy += drawEyebrow(ctx, x, yy, w, conn ? t('econ.console.partnerPrices', conn.name) : t('tradePanel.localPrices'), roles);
      const pg = priceGroups(conn ? ov._calcLocalPrices(priceCol) : prices);
      if (!pg.expensive.length && !pg.cheap.length) kv(t('econ.console.pricesFlat'), '', 'dim');
      for (const p of pg.expensive) kv(`${t('tradePanel.expensive')} · ${nm(p.id)}`, `×${p.mult.toFixed(1)}`, 'alert');
      for (const p of pg.cheap) kv(`${t('tradePanel.cheap')} · ${nm(p.id)}`, `×${p.mult.toFixed(1)}`, 'primary');
      yy += 8;
    }

    // wydatki — te same warunki stref co dziś (handler sprawdza koszt ponownie)
    yy += drawEyebrow(ctx, x, yy, w, t('econ.console.spend'), roles);
    const hovT = hz?.type;
    const chip = (label, enabled, desc, type, data) => {
      const show = vis(yy, CONSOLE_KIT.CHIP_H);
      if (show) {
        const rr = drawActionChip(ctx, x, yy, w, roles, { label, enabled, hover: enabled && hovT === type });
        if (type && enabled) ov._addHit(rr.x, rr.y, rr.w, rr.h, type, data);
      }
      yy += CONSOLE_KIT.CHIP_H + 2;
      if (desc) yy += wrapText(ctx, desc, x + CONSOLE_KIT.CHIP_PAD_X, yy, w - CONSOLE_KIT.CHIP_PAD_X, enabled ? roles.dim : roles.alert);
      yy += 4;
    };
    // bramki wydatków (te same warunki co handlery `spend_*`); systemy KOLONII HANDLU, nie globalne aktywnej
    const buildSys = colony?.buildingSystem;
    const hasConstruction = !!buildSys && buildSys._constructionQueue?.size > 0;
    const eb = emergencyBuy(prices);
    const festivalActive = !!colony?.prosperitySystem?._eventBonuses?.has('trade_festival');
    const sg = spendGates({ credits: civCredits, hasConstruction, buyTarget: !!eb.target, buyCost: eb.cost, festivalActive });
    const why = (g, okDesc) => (g.ok ? okDesc : t(g.key, ...g.args));
    chip(t('econ.console.rush', SPEND_COST.rush), sg.rush.ok, why(sg.rush, t('tradePanel.rushBuildDesc')),
      'spend_rush', { cost: SPEND_COST.rush, colonyId: tradeColId });
    chip(eb.target ? t('econ.console.buyEmergency', nm(eb.target.id), eb.qty, eb.cost) : t('econ.console.buyNone'),
      sg.buy.ok, why(sg.buy, t('tradePanel.buyResourceDesc')),
      'spend_buy', eb.target ? { cost: eb.cost, goodId: eb.target.id, qty: eb.qty, colonyId: tradeColId } : null);
    chip(festivalActive ? t('econ.console.festivalActive') : t('econ.console.festival', SPEND_COST.festival),
      sg.festival.ok, why(sg.festival, t('tradePanel.festivalDesc')),
      'spend_festival', { cost: SPEND_COST.festival, colonyId: tradeColId });
    yy += 4;

    // migracja cywilna
    yy += drawEyebrow(ctx, x, yy, w, t('econ.console.migration'), roles);
    const blockedMig = colMgr?.getColony(tradeColId)?.tradeOverrides?.migration === 'block';
    kv(t('econ.console.migrationState'), blockedMig ? t('econ.console.migrationBlocked') : t('econ.console.migrationAllowed'),
      blockedMig ? 'alert' : 'primary');
    chip(blockedMig ? t('econ.console.migrationAllowAct') : t('econ.console.migrationBlockAct'), true, null,
      'migration_toggle', { colonyId: tradeColId });
    yy += 4;

    // kontrola handlu towarami — siatka 2 kolumn (dzisiejsza strefa `trade_toggle_good`)
    yy += drawEyebrow(ctx, x, yy, w, t('econ.console.goodsControl'), roles);
    const overrides = civTrade?.getOverrides(tradeColId) ?? {};
    const colW = Math.floor(w / 2);
    ctx.save();
    ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
    for (let i = 0; i < TRADEABLE_GOODS.length; i++) {
      const goodId = TRADEABLE_GOODS[i];
      const gx = x + (i % 2) * colW, gy = yy + Math.floor(i / 2) * TV.GRID_ROW_H;
      if (!vis(gy, TV.GRID_ROW_H)) continue;
      const blocked = overrides[goodId] === 'block';
      const hov = hz?.type === 'trade_toggle_good' && hz.data?.goodId === goodId;
      if (hov) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(gx, gy, colW - 4, TV.GRID_ROW_H); ctx.globalAlpha = 1; }
      ctx.fillStyle = blocked ? roles.alert : roles.primary;
      ctx.fillText(truncateText(`${blocked ? '✕' : '●'} ${nm(goodId)}`, colW - 10, (s) => ctx.measureText(s).width), gx + 2, gy + TV.GRID_ROW_H / 2);
      ov._addHit(gx, gy, colW - 4, TV.GRID_ROW_H, 'trade_toggle_good', { goodId, colonyId: tradeColId, blocked });
    }
    ctx.restore();
    yy += Math.ceil(TRADEABLE_GOODS.length / 2) * TV.GRID_ROW_H + 4;
    return yy - y0;
  });

  // pas — dziennik transakcji
  if (z.strip) {
    const log0 = tradeLog?.getLog(tradeColId, conn ? 200 : 30) ?? [];
    const log = conn ? log0.filter((e) => e.partnerName === conn.name).slice(-30) : log0;
    const { entries, more } = logEntries(log, 20);
    const srows = entries.map((e, i) => {
      const exp = e.type === 'export';
      const items = Object.entries(e.items ?? {}).map(([id, q]) => `${nm(id)} ${fmtQty(q)}`).join(', ');
      return { id: `log${i}`, label: `${exp ? '↑' : '↓'} ${e.vesselName} ${exp ? '→' : '←'} ${e.partnerName} · ${items}`,
        value: `${t('tradePanel.year')} ${e.year.toFixed(1)}`, tone: exp ? 'primary' : 'foreign' };
    });
    if (more) srows.push({ id: 'more', label: `+${more}`, dimmed: true });
    drawStripList(ov, ctx, z.strip, conn ? `${t('econ.console.txLog')} · ${conn.name}` : t('econ.console.txLog'), srows, roles,
      { empty: t('tradePanel.noActivity') });
  }
}

/** Wykres słupkowy eksportu (rola primary) albo importu (rola foreign); strefy `trade_bar_hover` jak dziś. */
function drawChart(ov, ctx, x, y, w, h, yearly, isExport, maxVal, roles, hz) {
  const col = isExport ? roles.primary : (roles.foreign ?? roles.primary);
  const totalKey = isExport ? 'exports' : 'imports';
  const itemsKey = isExport ? 'exportItems' : 'importItems';
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'alphabetic';
  text(ctx, `${isExport ? '↑' : '↓'} ${t(isExport ? 'tradePanel.exports' : 'tradePanel.imports')}`, x, y + 11, col);
  const top = y + 20, base = y + h;
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 0.5, top); ctx.lineTo(x + 0.5, base + 0.5); ctx.lineTo(x + w, base + 0.5); ctx.stroke();
  const spacing = Math.floor(w / yearly.length);
  const barW = Math.max(4, Math.min(TV.BAR_MAX_W, spacing - 6));
  for (let i = 0; i < yearly.length; i++) {
    const yr = yearly[i];
    const val = yr[totalKey];
    if (val <= 0) continue;
    const barH = Math.max(2, Math.floor((val / maxVal) * (base - top - 14)));
    const bx = x + i * spacing + Math.floor((spacing - barW) / 2), by = base - barH;
    const hov = hz?.type === 'trade_bar_hover' && hz.data?.year === yr.year && hz.data?.isExport === isExport;
    ctx.globalAlpha = hov ? 1 : 0.7; ctx.fillStyle = col; ctx.fillRect(bx, by, barW, barH); ctx.globalAlpha = 1;
    text(ctx, t('econ.console.yearN', yr.year), bx + barW / 2, base + 12, roles.dim, F(THEME.fontSizeSmall - 2), 'center');
    if (barH > 14) text(ctx, fmtQty(val), bx + barW / 2, by - 3, roles.primary, F(THEME.fontSizeSmall - 2), 'center');
    const items = yr[itemsKey] ?? {};
    if (Object.keys(items).length > 0) ov._addHit(bx, by, barW, barH, 'trade_bar_hover', { year: yr.year, items, total: val, isExport });
  }
  ctx.restore();
}

/** Słupki bieżących przepływów połączenia (towar → szt./rok), gdy dziennik nie ma jego historii. Strefa jak wykresu lat. */
function drawFlowBars(ov, ctx, x, y, w, h, bars, isExport, roles, hz) {
  const col = isExport ? roles.primary : (roles.foreign ?? roles.primary);
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'alphabetic';
  text(ctx, `${isExport ? '↑' : '↓'} ${t(isExport ? 'tradePanel.exports' : 'tradePanel.imports')}`, x, y + 11, col);
  const top = y + 20, base = y + h;
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 0.5, top); ctx.lineTo(x + 0.5, base + 0.5); ctx.lineTo(x + w, base + 0.5); ctx.stroke();
  if (!bars.length) { text(ctx, '—', x + 8, base - 6, roles.dim); ctx.restore(); return; }
  const maxVal = Math.max(1e-9, ...bars.map((b) => b.qty));
  const spacing = Math.floor(w / bars.length);
  const barW = Math.max(4, Math.min(TV.BAR_MAX_W, spacing - 6));
  bars.forEach((b, i) => {
    const barH = Math.max(2, Math.floor((b.qty / maxVal) * (base - top - 14)));
    const bx = x + i * spacing + Math.floor((spacing - barW) / 2), by = base - barH;
    const hov = hz?.type === 'trade_bar_hover' && hz.data?.goodId === b.goodId && hz.data?.isExport === isExport;
    ctx.globalAlpha = hov ? 1 : 0.7; ctx.fillStyle = col; ctx.fillRect(bx, by, barW, barH); ctx.globalAlpha = 1;
    text(ctx, truncateText(nm(b.goodId), spacing - 2, (s) => ctx.measureText(s).width), bx + barW / 2, base + 12, roles.dim, F(THEME.fontSizeSmall - 2), 'center');
    if (barH > 14) text(ctx, b.qty.toFixed(1), bx + barW / 2, by - 3, roles.primary, F(THEME.fontSizeSmall - 2), 'center');
    ov._addHit(bx, by, barW, barH, 'trade_bar_hover', { year: null, goodId: b.goodId, items: { [b.goodId]: b.qty }, total: Math.round(b.qty * 10) / 10, isExport });
  });
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// RYNEK
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function drawMarket(ov, ctx, z, roles, K, hz) {
  const colMgr = K?.colonyManager;
  const dipl = K?.diplomacySystem;
  const civTrade = K?.civilianTradeSystem;
  const empReg = K?.empireRegistry;
  const board = K?.tradeOrderBoard;
  const warp = K?.techSystem?.isResearched?.('ion_drives') ?? false;
  const now = K?.timeSystem?.gameTime ?? 0;
  const tradeColId = ov._tradeColonyId();   // K3 runda 2 — kolonia Handlu (lokalna), nie globalna aktywna
  const playerCol = colMgr?.getColony?.(tradeColId);
  const playerOk = !!playerCol && !playerCol.ownerEmpireId && !playerCol.isOutpost;

  // partnerzy = kolonie AI z traktatem handlowym, grupowane po imperium (jak dziś)
  const byEmpire = new Map();
  for (const c of (colMgr?.getAllColonies?.() ?? [])) {
    if (!c.ownerEmpireId) continue;
    if (!(dipl?.hasTradeAgreement?.(c.ownerEmpireId) ?? false)) continue;
    if (!byEmpire.has(c.ownerEmpireId)) byEmpire.set(c.ownerEmpireId, []);
    byEmpire.get(c.ownerEmpireId).push(c);
  }

  // (2) Lista partnerów
  const listRect = colonyContext(ov, ctx, ruledRect(ctx, z.list, t('econ.console.partners'), roles), roles, hz);
  ov._consoleListRect = listRect;
  if (ov._ctxOpen) { /* lista wyboru kolonii zajmuje strefę listy */ } else if (byEmpire.size === 0) {
    wrapText(ctx, warp ? t('market.noPartners') : t('market.requiresWarpTreaty'), listRect.x + CONSOLE_KIT.ROW_PAD_X, listRect.y,
      listRect.w - 2 * CONSOLE_KIT.ROW_PAD_X, roles.dim);
  } else {
    const prow = partnerRows(byEmpire, ov._marketEmpireId, (id) => ov._empireName(empReg?.get?.(id), id));
    const byId = new Map(prow.map((p) => [p.id, p]));
    const selectedId = ov._marketAiColId ? `c:${ov._marketAiColId}` : ov._marketEmpireId ? `e:${ov._marketEmpireId}` : null;
    const hoverId = hz?.type === 'market_empire' || hz?.type === 'market_empire_toggle' ? `e:${hz.data?.empireId}`
      : hz?.type === 'market_colony' ? `c:${hz.data?.aiColId}` : null;
    const res = drawList(ctx, listRect, prow, roles, { selectedId, hoverId, scroll: ov._scrollLeft,
      renderRow: (c, row, rr, { sel }) => {
        const p = byId.get(row.id);
        const cy = rr.y + rr.h / 2;
        c.font = F(THEME.fontSizeNormal); c.textBaseline = 'middle';
        if (p.kind === 'empire') {
          const autoOn = civTrade?.isCrossEmpireTradeEnabled?.(p.empireId) ?? true;
          c.font = F(THEME.fontSizeSmall);
          c.fillStyle = autoOn ? roles.primary : roles.alert;
          drawTabular(c, `⇄ ${autoOn ? t('market.on') : t('market.off')}`, rr.x + rr.w - CONSOLE_KIT.ROW_PAD_X, cy, 'right');
          c.font = F(THEME.fontSizeNormal);
          c.fillStyle = roles.primary;
          const open = ov._marketEmpireId === p.empireId;
          c.fillText(truncateText(`${open ? '▾' : '▸'} ${p.name}`, rr.w - TV.TOGGLE_W - CONSOLE_KIT.ROW_PAD_X, (s) => c.measureText(s).width),
            rr.x + CONSOLE_KIT.ROW_PAD_X, cy);
        } else {
          c.fillStyle = sel ? roles.primary : roles.foreign ?? roles.primary;
          c.fillText(truncateText(p.name, rr.w - 3 * CONSOLE_KIT.ROW_PAD_X - 14, (s) => c.measureText(s).width),
            rr.x + 2 * CONSOLE_KIT.ROW_PAD_X + 14, cy);
        }
      } });
    ov._scrollLeft = res.scroll;
    for (const zz of res.zones) {
      const p = byId.get(zz.id);
      if (!p) continue;
      if (p.kind === 'empire') {
        ov._addHit(zz.x, zz.y, Math.max(0, zz.w - TV.TOGGLE_W), zz.h, 'market_empire', { empireId: p.empireId });
        ov._addHit(zz.x + zz.w - TV.TOGGLE_W, zz.y, TV.TOGGLE_W, zz.h, 'market_empire_toggle', { empireId: p.empireId });
      } else {
        ov._addHit(zz.x, zz.y, zz.w, zz.h, 'market_colony', { aiColId: p.aiColId, empireId: p.empireId });
      }
    }
  }

  // (3) Bohater — zapasy i ceny kolonii AI
  drawZoneFrame(ctx, z.hero, roles);
  const r = insetRect(z.hero, TV.HERO_INSET);
  const aiCol = ov._marketAiColId ? colMgr?.getColony?.(ov._marketAiColId) : null;
  const priceOf = (goodId, col) => (civTrade?.getLocalPrice ? civTrade.getLocalPrice(goodId, col) : (BASE_PRICE[goodId] ?? 1));
  if (!aiCol) {
    ctx.save(); ctx.textBaseline = 'middle';
    text(ctx, t('market.selectColonyHint'), r.x + r.w / 2, r.y + r.h / 2, roles.dim, F(THEME.fontSizeMedium), 'center');
    ctx.restore();
  } else {
    let y = r.y;
    const empName = ov._empireName(empReg?.get?.(aiCol.ownerEmpireId), aiCol.ownerEmpireId);
    y += drawEyebrow(ctx, r.x, y, r.w, `${aiCol.name ?? ov._marketAiColId} · ${empName}`, roles);
    if (!playerOk) { text(ctx, t('market.activeColonyRequired'), r.x, y + 12, roles.alert, F(THEME.fontSizeSmall)); y += 18; }
    y += drawEyebrow(ctx, r.x, y, r.w, t('econ.console.board'), roles);
    const n = TRADEABLE_GOODS.length;
    const cols = boardColumns(n, TV.BOARD_ROW_H, r.y + r.h - y - TV.BOARD_HEAD_H);
    const perCol = Math.ceil(n / cols);
    const colW = Math.floor((r.w - (cols - 1) * TV.BOARD_GAP) / cols);
    ctx.save();
    ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'alphabetic';
    for (let c = 0; c < cols; c++) {
      const hx = r.x + c * (colW + TV.BOARD_GAP);
      text(ctx, t('econ.console.boardGood').toUpperCase(), hx + 4, y + 11, roles.dim);
      text(ctx, t('econ.console.boardStock').toUpperCase(), hx + colW - 4, y + 11, roles.dim, null, 'right');
    }
    ctx.restore();
    y += TV.BOARD_HEAD_H;
    const aiRes = aiCol.resourceSystem;
    ctx.save();
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const goodId = TRADEABLE_GOODS[i];
      const cx = r.x + Math.floor(i / perCol) * (colW + TV.BOARD_GAP);
      const cy = y + (i % perCol) * TV.BOARD_ROW_H;
      const stock = aiRes?.inventory?.get(goodId) ?? 0;
      const price = priceOf(goodId, playerCol ?? aiCol);
      const sel = ov._marketGoodId === goodId;
      const hov = hz?.type === 'market_good' && hz.data?.goodId === goodId;
      const rr = { x: cx, y: cy, w: colW, h: TV.BOARD_ROW_H };
      if (hov && !sel) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(rr.x, rr.y, rr.w, rr.h); ctx.globalAlpha = 1; }
      ctx.font = F(THEME.fontSizeSmall);
      ctx.fillStyle = sel ? roles.primary : roles.dim;
      const vw = drawTabular(ctx, `${Math.round(stock)} · ${fmtKr(price)} Kr`, rr.x + rr.w - 4, cy + rr.h / 2, 'right');
      ctx.font = F(THEME.fontSizeNormal);
      ctx.fillStyle = sel || stock > 0 ? roles.primary : roles.dim;
      ctx.fillText(truncateText(nm(goodId), Math.max(0, rr.w - vw - 14), (s) => ctx.measureText(s).width), rr.x + 4, cy + rr.h / 2);
      if (sel) drawSelectBrackets(ctx, rr, roles);
      ov._addHit(rr.x, rr.y, rr.w, rr.h, 'market_good', { goodId });
    }
    ctx.restore();
  }

  // (4) Inspektor — zlecenie: ilość, ceny, kup / sprzedaj
  const goodId = aiCol ? ov._marketGoodId : null;
  drawScrolledInspector(ov, ctx, z.inspector, roles, goodId ? nm(goodId) : t('econ.console.orderBox'), (x, y0, w, vis) => {
    let yy = y0;
    if (!aiCol) return wrapText(ctx, t('market.selectColonyHint'), x, yy, w, roles.dim);
    if (!goodId) return wrapText(ctx, t('econ.console.pickGood'), x, yy, w, roles.dim);
    const kv = (k, v, tone = 'primary', unit = '') => { if (vis(yy)) drawKvRow(ctx, x, yy, w, k, v, roles, { tone, unit }); yy += CONSOLE_KIT.KV_H; };
    const qty = ov._marketQty;
    const buyPrice = priceOf(goodId, playerCol ?? aiCol);
    const sellPrice = priceOf(goodId, aiCol);
    kv(t('econ.console.aiStock'), String(Math.round(aiCol.resourceSystem?.inventory?.get(goodId) ?? 0)));
    kv(t('econ.console.ownStock'), String(Math.round(playerCol?.resourceSystem?.inventory?.get(goodId) ?? 0)), playerOk ? 'primary' : 'dim');
    kv(t('econ.console.buyPrice'), fmtKr(buyPrice), 'primary', 'Kr');
    kv(t('econ.console.sellPrice'), fmtKr(sellPrice), 'primary', 'Kr');
    yy += 10;

    // ilość [ − ] N [ + ] — pole liczby otwiera <input> nad sobą (prostokąt ze stref konsoli)
    yy += drawEyebrow(ctx, x, yy, w, t('market.qty'), roles);
    const qh = CONSOLE_KIT.CHIP_H;
    ctx.font = F(THEME.fontSizeSmall);
    const qbw = Math.ceil(Math.max(ctx.measureText(chipLabel('−')).width, ctx.measureText(chipLabel('+')).width)) + 2 * CONSOLE_KIT.CHIP_PAD_X;
    if (vis(yy, qh)) {
      const hovQ = hz?.type === 'market_qty' ? hz.data?.delta : null;
      const mr = drawActionChip(ctx, x, yy, qbw, roles, { label: '−', hover: hovQ === -10 });
      ov._addHit(mr.x, mr.y, mr.w, mr.h, 'market_qty', { delta: -10 });
      const bx = x + qbw + 6, bw = TV.QTY_BOX_W;
      ctx.save();
      ctx.strokeStyle = hz?.type === 'market_qty_edit' ? roles.primary : roles.dim; ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, yy + 0.5, bw - 1, qh - 1);
      ctx.font = F(THEME.fontSizeNormal); ctx.textBaseline = 'middle'; ctx.fillStyle = roles.primary;
      drawTabular(ctx, String(qty), bx + bw / 2, yy + qh / 2, 'center');
      ctx.restore();
      ov._addHit(bx, yy, bw, qh, 'market_qty_edit', { boxCanvasX: bx, boxCanvasY: yy, boxW: bw, boxH: qh });
      const pr = drawActionChip(ctx, bx + bw + 6, yy, qbw, roles, { label: '+', hover: hovQ === 10 });
      ov._addHit(pr.x, pr.y, pr.w, pr.h, 'market_qty', { delta: +10 });
    }
    yy += qh + 12;

    // jak działa zlecenie: Twoja kolonia, płatność, dostawa warpem (dane z TradeOrderBoard)
    yy += drawEyebrow(ctx, x, yy, w, t('econ.console.orderBox'), roles);
    kv(t('econ.console.orderTo'), playerCol?.name ?? '—', playerOk ? 'primary' : 'alert');
    kv(t('econ.console.orderPay'), fmtKr(buyPrice * qty), 'primary', 'Kr');
    kv(t('econ.console.orderGet'), fmtKr(sellPrice * qty), 'primary', 'Kr');
    kv(t('econ.console.orderDelivery'), t('econ.console.orderDeliveryVal', String(DELAY_YEARS), (now + DELAY_YEARS).toFixed(1)), 'dim');
    yy += 8;
    // kup / sprzedaj — bramka `orderGate` (te same warunki co `placeOrder` + rozliczenie); wyłączony czip ma powód pod sobą
    const gateBase = { playerOk, qty, warp: K?.techSystem?.isResearched?.('ion_drives') ?? false,
      agreement: K?.diplomacySystem?.hasTradeAgreement?.(aiCol.ownerEmpireId) ?? false,
      playerCredits: playerCol?.credits ?? 0, aiCredits: aiCol.credits ?? 0,
      aiStock: aiCol.resourceSystem?.inventory?.get(goodId) ?? 0, ownStock: playerCol?.resourceSystem?.inventory?.get(goodId) ?? 0,
      empireName: ov._empireName(empReg?.get?.(aiCol.ownerEmpireId), aiCol.ownerEmpireId),
      techName: TECHS.ion_drives ? getName(TECHS.ion_drives, 'tech') : 'ion_drives' };
    for (const [type, key, price, side] of [['market_buy', 'econ.console.buyTotal', buyPrice, 'buy'], ['market_sell', 'econ.console.sellTotal', sellPrice, 'sell']]) {
      const g = orderGate({ ...gateBase, side, total: price * qty });
      if (vis(yy, CONSOLE_KIT.CHIP_H)) {
        const rr = drawActionChip(ctx, x, yy, w, roles, { label: t(key, fmtKr(price * qty)), enabled: g.ok, hover: g.ok && hz?.type === type });
        if (g.ok) ov._addHit(rr.x, rr.y, rr.w, rr.h, type, { goodId, qty });
      }
      yy += CONSOLE_KIT.CHIP_H + 2;
      if (!g.ok) yy += wrapText(ctx, t(g.key, ...g.args), x + CONSOLE_KIT.CHIP_PAD_X, yy, w - CONSOLE_KIT.CHIP_PAD_X, roles.alert);
      yy += 6;
    }
    if (playerCol) {
      const an = aiCol.name ?? ov._marketAiColId, pn = playerCol.name ?? tradeColId;
      yy += wrapText(ctx, t('econ.console.orderHowBuy', an, pn), x, yy + 4, w, roles.dim) + 6;
      yy += wrapText(ctx, t('econ.console.orderHowSell', an, pn), x, yy, w, roles.dim) + 6;
    }
    return yy - y0;
  });

  // pas — zlecenia w toku (aktywna kolonia gracza)
  if (z.strip) {
    const orders = board?.getOrders?.({ playerColonyId: tradeColId }) ?? [];
    const orows = orders.map((o) => ({ id: o.id, o,
      label: `${o.side === 'buy' ? t('market.buy') : t('market.sell')} ${nm(o.goodId)} ×${Math.round(o.qty)}`,
      value: `${fmtKr(o.total)} Kr · ${Math.max(0, o.deliverYear - now).toFixed(1)}${t('market.yearsShort')}` }));
    const byId = new Map(orows.map((q) => [q.id, q]));
    const hoverId = hz?.type === 'market_cancel' ? hz.data?.orderId : null;
    const zones = drawStripList(ov, ctx, z.strip, t('market.pendingOrders'), orows, roles, { empty: t('market.noPendingOrders'),
      renderRow: (c, row, rr) => {
        const cy = rr.y + rr.h / 2;
        const o = byId.get(row.id).o;
        drawActionChip(c, rr.x + rr.w - TV.CANCEL_W, rr.y + (rr.h - CONSOLE_KIT.CHIP_H) / 2, TV.CANCEL_W, roles,
          { label: t('market.cancelShort'), danger: true, hover: hoverId === row.id });
        c.font = F(THEME.fontSizeSmall); c.textBaseline = 'middle'; c.fillStyle = roles.dim;
        const vw = drawTabular(c, row.value, rr.x + rr.w - TV.CANCEL_W - 8, cy, 'right');
        c.font = F(THEME.fontSizeNormal);
        c.fillStyle = o.side === 'buy' ? roles.primary : (roles.foreign ?? roles.primary);
        c.fillText(truncateText(row.label, Math.max(0, rr.w - TV.CANCEL_W - vw - 24), (s) => c.measureText(s).width), rr.x + CONSOLE_KIT.ROW_PAD_X, cy);
      } });
    for (const zz of zones) ov._addHit(zz.x + zz.w - TV.CANCEL_W, zz.y, TV.CANCEL_W, zz.h, 'market_cancel', { orderId: zz.id });
  }
}
