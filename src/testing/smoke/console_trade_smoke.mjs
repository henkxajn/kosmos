// ARC KONSOLE K3-B — keeper konsoli Handlu (Handel + Rynek) w grupie Ekonomii i Finding 738 (docs/design/CONSOLES_PLAN.md §1.2,
// D-K-15, D-K-20; Finding 725 — część Handlu).
//
// H — Handel: dostępność akcji ON ⊇ OFF (każdy dzisiejszy typ strefy jest w konsoli; jedyny nowy typ to `trade_conn`), dane stref
//     ON == OFF (wydatki, migracja, siatka towarów, słupki wykresu); skutki handlerów (wybór połączenia, blokada towaru).
// R — Rynek: to samo dla `market_*` (imperia, przełącznik auto-handlu, kolonie, tablica towarów, ilość, kup / sprzedaj, anuluj);
//     skutki: ilość ±10, zlecenie kupna z tymi samymi argumentami co dziś.
// Q — pole ilości <input>: prostokąt = strefa `market_qty_edit` (w inspektorze konsoli) × skala z rysunku, przy 1600×1041 i 1280×833
//     (okno CSS), klik i otwarcie pola przy podmienionym innerWidth; źródło: gałęzie konsoli w handlerach bez window.inner*.
// T — Finding 725 (Handel): tekst konsoli bez surowych id / snake_case (kontrola: dzisiejsza strona rysuje surowe id cen
//     lokalnych); źródło TradeOverlay bez literału „Kr/rok”.
// G — czipy grupy ze stron Handlu: kolejność, Handel → Rynek bez ponownego otwarcia i ze stanem Handlu, Budżet / Produkcja
//     → openPanel; pas subnav nad Handlem znika przy fladze ON.
// F — Finding 738: w świecie z kopalniami i fabrykami każdy wiersz listy Przepływów (wartość narysowana) == netto bohatera
//     (`flowDiagram` rozbicia); świadek: zasób, którego bilans z samego rejestru producentów różni się od netto.
//
// Bez pinów na stałych rysowania. Moduły nowe importowane dynamicznie (pin degraduje, nie przerywa).

import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { setLocale, t } from '../../i18n/i18n.js';
import EventBus from '../../core/EventBus.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { BASE_PRICE, TRADEABLE_GOODS } from '../../data/TradeValuesData.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const TO = await tryImport('../../ui/TradeOverlay.js');
const EO = await tryImport('../../ui/EconomyOverlay.js');
const ECL = await tryImport('../../ui/EconomyConsoleLogic.js');
const CL = await tryImport('../../ui/ConsoleLayoutLogic.js');
const CPD = await tryImport('../../ui/CivPanelDrawer.js');
const TCL = await tryImport('../../ui/TradeConsoleLogic.js');
const TOB = await tryImport('../../systems/TradeOrderBoard.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/\/\/.*$/gm, '');
setLocale('pl');
const F = GAME_CONFIG.FEATURES;
const saved = { consoleKit: F.consoleKit, consoleEconomy: F.consoleEconomy };
const setEco = (on) => { F.consoleKit = true; F.consoleEconomy = on; };

function recCtx() {
  const texts = [], log = [];
  const st = { canvas: { width: 1600, height: 1041 } };
  const ctx = new Proxy(st, {
    get: (o, k) => {
      if (k === 'fillText') return (s, x, y) => { texts.push(String(s)); log.push(['fillText', String(s), x, y, o.fillStyle]); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      if (k in o) return o[k];
      return (...a) => { log.push([String(k), ...a]); };
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { ctx, texts, log };
}

// ── świat-atrapa Handlu ───────────────────────────────────────────────────────────────────────────────────────────────
const SNAKE_EXP = 'structural_alloys';   // drogi (zapas 0, konsumpcja) — surowe id na dzisiejszej stronie
const SNAKE_CHEAP = 'power_cells';       // tani (zapas na lata)
function makeWorld() {
  const calls = { creditsOf: [], open: [], orders: [], cancels: [], emits: [], toggles: [], bonus: [] };
  const colA = { planetId: 'col_a', name: 'Alfa', isOutpost: false, tradeOverrides: {}, credits: 5000,
    resourceSystem: { inventory: new Map([['Fe', 100], [SNAKE_CHEAP, 500]]), receive() {},
      _producers: new Map([['building_1_1', { [SNAKE_EXP]: -2, [SNAKE_CHEAP]: -1, Fe: 3 }]]) } };
  const colB = { planetId: 'col_b', name: 'Beta', isOutpost: false, resourceSystem: { inventory: new Map(), _producers: new Map() } };
  colA.buildingSystem = { _constructionQueue: new Map([['t1', { progress: 0, buildTime: 10 }]]) };
  colA.prosperitySystem = { _eventBonuses: new Map(), addEventBonus: (...a) => calls.bonus.push(a) };
  const ai1 = { planetId: 'ai_1', name: 'Nowa Sparta', ownerEmpireId: 'emp_x', credits: 5000, resourceSystem: { inventory: new Map([['Fe', 300], [SNAKE_CHEAP, 200]]) } };
  const ai2 = { planetId: 'ai_2', name: 'Port Kel', ownerEmpireId: 'emp_x', resourceSystem: { inventory: new Map() } };
  const cols = [colA, colB, ai1, ai2];
  const colMgr = { activePlanetId: 'col_a', getColony: (id) => cols.find((c) => c.planetId === id) ?? null,
    getAllColonies: () => cols, getPlayerColonies: () => [colA, colB] };
  const civ = {
    getCredits: (id) => (calls.creditsOf.push(id), 5000), getCreditsPerYear: () => 3.5, getTradeCapacity: () => 40,
    getConnections: () => [{ partnerId: 'col_b', partnerName: 'Beta', distance: 1.234 }, { partnerId: 'col_c', partnerName: 'Gamma', distance: 2.5 }],
    getFlowsForColony: () => [{ partnerId: 'col_b', partnerName: 'Beta', goodId: SNAKE_EXP, qtyPerYear: 2.5, direction: 'export' },
      { partnerId: 'col_b', partnerName: 'Beta', goodId: 'Fe', qtyPerYear: 1, direction: 'import' }],
    getOverrides: () => ({ Fe: 'block' }),
    getLocalPrice: (g) => (BASE_PRICE[g] ?? 1) * 1.2,
    isCrossEmpireTradeEnabled: () => true, setCrossEmpireTrade: (id, v) => calls.toggles.push([id, v]),
  };
  const trade = TO ? new TO.TradeOverlay() : null;
  const om = { active: 'trade', overlays: { trade }, openPanel(id) { calls.open.push(id); this.active = id; } };
  window.KOSMOS = {
    colonyManager: colMgr, civilianTradeSystem: civ, overlayManager: om,
    buildingSystem: colA.buildingSystem,   // globalne = systemy aktywnej kolonii (switchActiveColony)
    prosperitySystem: colA.prosperitySystem,
    tradeLog: {
      getLog: () => [{ type: 'export', year: 12.3, vesselName: 'Kupiec', partnerName: 'Beta', items: { [SNAKE_EXP]: 3.2 } },
        { type: 'import', year: 12.8, vesselName: 'Kupiec', partnerName: 'Beta', items: { Fe: 12 } }],
      getYearlyAggregation: () => [{ year: 11, exports: 5, imports: 2, exportItems: { [SNAKE_EXP]: 5 }, importItems: { Fe: 2 } },
        { year: 12, exports: 8, imports: 0, exportItems: { [SNAKE_EXP]: 8 }, importItems: {} }],
    },
    diplomacySystem: { hasTradeAgreement: (e) => e === 'emp_x' },
    empireRegistry: { get: () => ({ namePL: 'Hegemonia Kel', nameEN: 'Kel Hegemony' }) },
    techSystem: { isResearched: () => true }, timeSystem: { gameTime: 10 },
    tradeOrderBoard: { getOrders: () => [{ id: 'o1', side: 'buy', goodId: SNAKE_CHEAP, qty: 10, total: 55.5, deliverYear: 12 }],
      placeOrder: (o) => calls.orders.push(o), cancelOrder: (id) => calls.cancels.push(id) },
  };
  return { calls, colMgr, civ, trade, om, cols };
}
// stan Rynku: imperium + kolonia AI + towar wybrane
function marketState(ov) { ov._marketEmpireId = 'emp_x'; ov._marketAiColId = 'ai_1'; ov._marketGoodId = SNAKE_CHEAP; ov._marketQty = 30; }
function render(page, on, { W = 1600, H = 1041, market = true, pre = null } = {}) {
  setEco(on);
  const w = makeWorld();
  const ov = w.trade;
  ov.visible = true; ov._tab = page;
  if (page === 'market' && market) marketState(ov);
  if (pre) pre(ov, w);
  const r = recCtx();
  safe(() => ov.draw(r.ctx, W, H));
  return { ov, w, ...r, zones: ov._hitZones ?? [] };
}
const types = (zs) => new Set(zs.map((z) => z.type));
const isKit = (r) => !!r?.ov?.consoleZones;
const dataOf = (zs, type) => zs.filter((z) => z.type === type).map((z) => JSON.stringify(z.data ?? null));
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
const clickZone = (r, z) => { setEco(true); window.KOSMOS.overlayManager.active = 'trade'; return safe(() => r.ov.handleClick(z.x + Math.min(3, z.w / 2), z.y + Math.min(3, z.h / 2))); };

if (!TO) assert(false, 'TradeOverlay importuje się');
else {
  // ═══ H — Handel ═════════════════════════════════════════════════════════════════════════════════════════════════
  console.log('H — Handel: akcje ON ⊇ OFF');
  const off = render('trade', false, { H: 5000 }), on = render('trade', true, { H: 5000 });
  const tOff = types(off.zones), tOn = types(on.zones);
  assert(['close', 'tab', 'migration_toggle', 'spend_rush', 'spend_buy', 'spend_festival', 'trade_toggle_good', 'trade_bar_hover'].every((x) => tOff.has(x)),
    `H0 kontrola: OFF Handel ma wszystkie typy (${[...tOff].join(',')})`);
  const lostH = [...tOff].filter((x) => !tOn.has(x));
  assert(isKit(on) && lostH.length === 0, `H1 konsola Handlu ma każdy dzisiejszy typ strefy${lostH.length ? ' — brak: ' + lostH.join(',') : ''}`);
  const newH = [...tOn].filter((x) => !tOff.has(x));
  assert(isKit(on) && [...newH].sort().join(',') === 'trade_conn,trade_ctx_toggle', `H2 nowe typy tylko: trade_conn + trade_ctx_toggle (kontekst kolonii, runda 2) (${newH.join(',')})`);
  for (const ty of ['spend_rush', 'spend_buy', 'spend_festival', 'migration_toggle', 'trade_toggle_good', 'trade_bar_hover']) {
    assert(isKit(on) && sameSet(dataOf(off.zones, ty), dataOf(on.zones, ty)), `H3 dane stref ${ty} ON == OFF (${dataOf(on.zones, ty).length})`);
  }
  assert(isKit(on) && dataOf(on.zones, 'trade_toggle_good').length === TRADEABLE_GOODS.length, `H4 siatka towarów: ${TRADEABLE_GOODS.length} stref (pełny inspektor)`);
  // skutki
  const conn = on.zones.find((z) => z.type === 'trade_conn' && z.data.partnerId === 'col_c');
  if (conn) clickZone(on, conn);
  assert(on.ov._tradeConnId === 'col_c', 'H5 klik połączenia wybiera je (inspektor = jego przepływy)');
  const emitted = [];
  const origEmit = EventBus.emit.bind(EventBus);
  EventBus.emit = (ev, p) => { emitted.push([ev, JSON.stringify(p)]); };
  for (const r of [off, on]) {
    const z = r.zones.find((q) => q.type === 'trade_toggle_good' && q.data.goodId === 'Fe');
    setEco(r === on); window.KOSMOS.overlayManager.active = 'trade';
    if (z) safe(() => r.ov._onHit(z));
  }
  EventBus.emit = origEmit;
  assert(isKit(on) && emitted.length === 2 && emitted[0][1] === emitted[1][1] && /"mode":null/.test(emitted[1][1]), 'H6 blokada towaru: ten sam trade:setOverride ON == OFF (odblokowanie Fe)');
  const onClick = render('trade', true, { H: 5000 });
  const tg = onClick.zones.find((q) => q.type === 'trade_toggle_good' && q.data.goodId === 'Fe');
  const em2 = [];
  EventBus.emit = (ev, p) => { em2.push(ev); };
  if (tg) clickZone(onClick, tg);
  EventBus.emit = origEmit;
  assert(isKit(onClick) && em2.includes('trade:setOverride'), 'H7 klik siatki konsoli dochodzi do handlera (handleClick → _onHit)');

  // ═══ R — Rynek ══════════════════════════════════════════════════════════════════════════════════════════════════
  console.log('R — Rynek: akcje ON ⊇ OFF');
  const mOff = render('market', false, { H: 5000 }), mOn = render('market', true, { H: 5000 });
  const mtOff = types(mOff.zones), mtOn = types(mOn.zones);
  const MT = ['close', 'tab', 'market_empire', 'market_empire_toggle', 'market_colony', 'market_good', 'market_qty', 'market_qty_edit', 'market_buy', 'market_sell', 'market_cancel'];
  assert(MT.every((x) => mtOff.has(x)), `R0 kontrola: OFF Rynek ma wszystkie typy (${mtOff.size})`);
  const lostR = [...mtOff].filter((x) => !mtOn.has(x));
  assert(isKit(mOn) && lostR.length === 0, `R1 konsola Rynku ma każdy dzisiejszy typ strefy${lostR.length ? ' — brak: ' + lostR.join(',') : ''}`);
  assert(isKit(mOn) && [...mtOn].every((x) => mtOff.has(x) || x === 'trade_ctx_toggle'), 'R2 Rynek bez nowych typów stref (poza trade_ctx_toggle — kontekst kolonii)');
  for (const ty of ['market_empire', 'market_empire_toggle', 'market_colony', 'market_good', 'market_qty', 'market_buy', 'market_sell', 'market_cancel']) {
    assert(isKit(mOn) && sameSet(dataOf(mOff.zones, ty), dataOf(mOn.zones, ty)), `R3 dane stref ${ty} ON == OFF (${dataOf(mOn.zones, ty).length})`);
  }
  const plus = mOn.zones.find((z) => z.type === 'market_qty' && z.data.delta > 0);
  if (plus) clickZone(mOn, plus);
  assert(isKit(mOn) && mOn.ov._marketQty === 40, `R4 klik [ + ] konsoli: ilość 30 → ${mOn.ov._marketQty}`);
  const buyOf = (r, on) => {
    const got = [];
    window.KOSMOS.tradeOrderBoard.placeOrder = (o) => got.push(o);
    const z = r.zones.find((q) => q.type === 'market_buy');
    setEco(on); window.KOSMOS.overlayManager.active = 'trade';
    if (z) safe(() => r.ov._onHit(z));
    return got.length ? JSON.stringify(got[0]) : null;
  };
  const bOffArgs = buyOf(mOff, false);
  const mOn2 = render('market', true, { H: 5000 });
  const bOnArgs = buyOf(mOn2, true);
  assert(isKit(mOn2) && bOffArgs != null && bOffArgs === bOnArgs, `R5 kup: te same argumenty placeOrder ON == OFF (${bOnArgs})`);
  const cancel = mOn2.zones.find((z) => z.type === 'market_cancel');
  if (cancel) clickZone(mOn2, cancel);
  assert(mOn2.w.calls.cancels.includes('o1'), 'R6 klik [ ANULUJ ] w pasie konsoli anuluje zlecenie o1');
  const emp = mOn2.zones.find((z) => z.type === 'market_empire');
  const tog = mOn2.zones.find((z) => z.type === 'market_empire_toggle');
  assert(isKit(mOn2) && emp && tog && (emp.x + emp.w <= tog.x + 0.5), 'R7 wiersz imperium: strefa wyboru i przełącznik auto-handlu nie zachodzą na siebie');

  // ═══ Q — pole ilości ════════════════════════════════════════════════════════════════════════════════════════════
  console.log('Q — pole ilości <input>');
  const inside = (r, f) => r && f && r.x >= f.x - 0.5 && r.y >= f.y - 0.5 && r.x + r.w <= f.x + f.w + 0.5 && r.y + r.h <= f.y + f.h + 0.5;
  const origCreate = document.createElement;
  for (const [cw, ch] of [[1600, 1041], [1280, 833]]) {
    const iw = window.innerWidth, ih = window.innerHeight;
    window.innerWidth = cw; window.innerHeight = ch;
    const vp = CL ? CL.uiViewport(cw, ch) : { scale: 1, W: 1280, H: 720 };
    const r = render('market', true, { W: vp.W, H: vp.H });
    const z = r.zones.find((q) => q.type === 'market_qty_edit');
    assert(isKit(r) && inside(z, r.ov.consoleZones?.inspector), `Q1 ${cw}×${ch}: pole ilości w inspektorze konsoli`);
    window.innerWidth = 333; window.innerHeight = 222;   // handler nie może czytać okna
    document.createElement = (tag) => { const el = origCreate(tag); el.style = {}; el.focus = () => {}; el.select = () => {}; return el; };
    if (z) clickZone(r, z);
    const inp = r.ov._qtyInput;
    document.createElement = origCreate;
    window.innerWidth = iw; window.innerHeight = ih;
    const px = (v) => `${Math.round(v * vp.scale)}px`;
    const ok = inp && z && inp.style.left === px(z.data.boxCanvasX) && inp.style.top === px(z.data.boxCanvasY)
      && inp.style.width === px(z.data.boxW) && inp.style.height === px(z.data.boxH);
    assert(ok, `Q2 ${cw}×${ch}: <input> = strefa × skala ${vp.scale.toFixed(3)} (${inp?.style?.left},${inp?.style?.top} ${inp?.style?.width}×${inp?.style?.height})`);
    safe(() => r.ov._closeQtyInput());
  }
  const s = src('../../ui/TradeOverlay.js');
  const kitBlocks = [...s.matchAll(/if \(kitOn\(\)\) \{([\s\S]*?)\n    \}/g)].map((m) => m[1]);
  assert(kitBlocks.length >= 3 && kitBlocks.every((b) => !/window\.inner/.test(b)), `Q3 źródło: gałęzie kitOn w draw / klik / kółko bez window.inner* (${kitBlocks.length})`);
  {
    const r = render('trade', true);
    const iw = window.innerWidth; window.innerWidth = 333;
    const lr = r.ov._consoleListRect, ir = r.ov._consoleInspRect, sr = r.ov._consoleStripRect;
    setEco(true);
    safe(() => r.ov.handleScroll(40, lr.x + 4, lr.y + 4));
    safe(() => r.ov.handleScroll(40, ir.x + 4, ir.y + 4));
    safe(() => r.ov.handleScroll(40, sr.x + 4, sr.y + 4));
    window.innerWidth = iw;
    assert(r.ov._scrollLeft === 20 && r.ov._scrollRight === 20 && r.ov._kitScrollStrip === 20, 'Q4 kółko: lista, inspektor i pas przewijane osobno ze stref ostatniej klatki');
  }

  // ═══ T — Finding 725 ═══════════════════════════════════════════════════════════════════════════════════════════
  console.log('T — 725: nazwy zamiast id');
  const offT = render('trade', false, { H: 5000 });
  assert(offT.texts.some((x) => x.includes(SNAKE_EXP)), `T0 kontrola: dzisiejsza strona rysuje surowe id (${SNAKE_EXP}) w cenach lokalnych`);
  for (const page of ['trade', 'market']) {
    for (const loc of ['pl', 'en']) {
      setLocale(loc);
      const r = render(page, true, { H: 5000 });
      const raw = r.texts.filter((x) => /\b[a-z]+_[a-z_]+\b/.test(x) || /\b(Kr\/rok|econ\.|tradePanel\.|market\.)/.test(x) && loc === 'en');
      assert(isKit(r) && r.texts.length > 20 && raw.length === 0, `T1 ${page} ${loc}: tekst konsoli bez surowych id / kluczy${raw.length ? ' — ' + raw.slice(0, 3).join(' | ') : ''}`);
    }
  }
  setLocale('pl');
  assert(!/Kr\/rok/.test(s), 'T2 źródło TradeOverlay bez literału Kr/rok (econ.console.krPerYear)');

  // ═══ G — czipy ze stron Handlu ═════════════════════════════════════════════════════════════════════════════════
  console.log('G — czipy grupy ze stron Handlu');
  {
    const r = render('trade', true);
    const tabs = r.zones.filter((z) => z.type === 'tab').map((z) => z.data?.id);
    assert(JSON.stringify(tabs) === JSON.stringify(['budget', 'economy', 'trade', 'market', 'flows']), `G1 czipy z Handlu w kolejności: ${tabs.join(',')}`);
    const chipClick = (page, id) => {
      const rr = render(page, true);
      if (page === 'market') marketState(rr.ov);
      const z = rr.zones.find((q) => q.type === 'tab' && q.data?.id === id);
      if (z) clickZone(rr, z);
      return rr;
    };
    const a = chipClick('trade', 'market');
    assert(a.ov._tab === 'market' && a.w.calls.open.length === 0, 'G2 Handel → [ RYNEK ]: zakładka market bez ponownego otwarcia');
    const b = chipClick('market', 'trade');
    assert(b.ov._tab === 'trade' && b.w.calls.open.length === 0 && b.ov._marketEmpireId === 'emp_x' && b.ov._marketGoodId === SNAKE_CHEAP && b.ov._marketQty === 30,
      'G3 Rynek → [ HANDEL ]: stan Rynku (imperium, towar, ilość) zostaje');
    const c = chipClick('market', 'budget');
    assert(c.w.calls.open.at(-1) === 'budget', 'G4 z Rynku [ BUDŻET ] → openPanel(budget)');
    const d = chipClick('trade', 'economy');
    assert(d.w.calls.open.at(-1) === 'economy', 'G5 z Handlu [ PRODUKCJA ] → openPanel(economy) (dzisiejsza strona)');
    const e = chipClick('trade', 'flows');
    assert(e.w.calls.open.at(-1) === 'flows', 'G6 z Handlu [ PRZEPŁYWY ] → openPanel(flows)');
    if (CPD) {
      makeWorld(); window.KOSMOS.overlayManager.active = 'trade';
      setEco(true); const hOn = CPD.getSubNavHeight();
      setEco(false); const hOff = CPD.getSubNavHeight();
      assert(hOn === 0 && hOff > 0, `G7 pas subnav nad Handlem: ON ${hOn}, OFF ${hOff} (kontrola)`);
    } else assert(false, 'G7 CivPanelDrawer importuje się');
  }
}

// ═══ F — Finding 738 ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('F — 738: lista Przepływów == bohater');
if (!EO) assert(false, 'F EconomyOverlay importuje się');
else {
  const COM = Object.values(COMMODITIES).find((c) => c.recipe && Object.keys(c.recipe).includes('Fe'))
    ?? Object.values(COMMODITIES).find((c) => c.recipe);
  const mkRs = (producers, inv = {}) => ({ inventory: new Map(Object.entries(inv)), _producers: new Map(Object.entries(producers)),
    _deltaTracker: { observedPerYear: new Map() }, energy: { balance: 0 }, getAmount: () => 0, inventorySnapshot: () => ({ ...inv }) });
  const colA = { planetId: 'col_a', name: 'Alfa', isOutpost: false, credits: 0, creditsPerYear: 0,
    resourceSystem: mkRs({ building_1_1: { Fe: 4, food: 3 }, civilization_consumption: { food: -6 } }, { Fe: 50 }),
    buildingSystem: { _active: new Map([['1_1', { building: { id: 'mine' } }]]), _cachedMineLevel: 1,
      _deposits: [{ resourceId: 'Fe', remaining: 50, totalAmount: 100, richness: 1 }, { resourceId: 'Ti', remaining: 80, totalAmount: 100, richness: 0.5 }] },
    factorySystem: { _allocations: new Map([[COM.id, { points: 3 }]]) } };
  const colB = { planetId: 'col_b', name: 'Beta', isOutpost: false, credits: 0, creditsPerYear: 0,
    resourceSystem: mkRs({ building_2_2: { water: 2, Fe: -5 } }),
    buildingSystem: { _active: new Map(), _deposits: [], _cachedMineLevel: 0 }, factorySystem: null };
  const cols = [colA, colB];
  window.KOSMOS = { colonyManager: { getPlayerColonies: () => cols, getAllColonies: () => cols, getColony: (id) => cols.find((c) => c.planetId === id),
    activePlanetId: 'col_a', taxRate: 0.1, calculateTaxIncome: () => 0 }, overlayManager: { active: 'flows', overlays: {} } };
  setEco(true);
  const ov = new EO.EconomyOverlay();
  ov.visible = true;
  const r = recCtx();
  safe(() => ov.draw(r.ctx, 1600, 1041));
  const rows = (ov._hitZones ?? []).filter((z) => z.type === 'flow_res');
  // wartość narysowana w wierszu: teksty z tą samą linią bazową w prostokącie wiersza, po x — końcówka „+12.3” / „-1”
  const drawnValue = (z) => {
    const cy = z.y + z.h / 2;
    const seg = r.log.filter((l) => l[0] === 'fillText' && Math.abs(l[3] - cy) < 0.01 && l[2] >= z.x && l[2] <= z.x + z.w).sort((a, b) => a[2] - b[2]);
    const m = seg.map((l) => l[1]).join('').match(/([+-]?\d+(?:\.\d+)?)([kM]?)$/);
    if (!m) return null;
    return Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'M' ? 1e6 : 1);
  };
  const net = (id) => ECL.flowDiagram(ov._gatherFlowBreakdown(id)).net;
  const regOnly = (id) => { let s = 0; for (const c of cols) for (const rates of c.resourceSystem._producers.values()) s += rates[id] ?? 0; return s; };
  const bad = rows.filter((z) => { const v = drawnValue(z), n = net(z.data.resId); return v == null || Math.abs(v - n) > Math.max(0.051, Math.abs(n) * 0.001); });
  assert(!!ov.consoleZones && rows.length >= 4 && bad.length === 0,
    `F1 każdy wiersz listy (${rows.length}) = netto bohatera${bad.length ? ' — różne: ' + bad.map((z) => `${z.data.resId} ${drawnValue(z)}≠${net(z.data.resId).toFixed(2)}`).join(', ') : ''}`);
  const ids = rows.map((z) => z.data.resId);
  const witness = ids.filter((id) => Math.abs(regOnly(id) - net(id)) > 0.5);
  assert(witness.includes('Fe'), `F2 świadek: Fe — rejestr producentów ${regOnly('Fe').toFixed(1)} ≠ netto ${net('Fe').toFixed(1)} (kopalnia + wsad fabryki)`);
  assert(ids.includes('Ti'), 'F3 zasób tylko z kopalni (Ti) jest na liście (bohater go pokazuje)');
  setEco(false);
  const off = new EO.EconomyOverlay(); off.visible = true;
  const r3 = recCtx();
  safe(() => off.draw(r3.ctx, 1600, 1041));
  const offIds = (off._hitZones ?? []).filter((z) => z.type === 'flow_res').map((z) => z.data.resId);
  assert(offIds.length >= 3 && !offIds.includes('Ti'), `F4 kontrola: dzisiejsza lista (OFF) bez Ti — liczona z samego rejestru (${offIds.join(',')})`);
}

// ═══ A — Handel: wybór połączenia steruje bohaterem i inspektorem (polerka K3, uwaga A) ═══════════════════════════
console.log('A — połączenie');
const joined = (r) => r.texts.join(' ').replace(/\s+/g, ' ');
const lc = (x) => String(x).toLowerCase();
{
  const ALL = TCL?.ALL_CONNS;
  const rows = [{ id: 'col_b' }, { id: 'col_c' }];
  assert(ALL && TCL.pickConnection(rows, undefined) === ALL && TCL.pickConnection(rows, 'col_c') === 'col_c' && TCL.pickConnection(rows, 'gone') === ALL
    && TCL.pickConnection([], 'col_b') === null, 'A1 domyślnie „wszystkie połączenia”; zapamiętane zostaje; zniknięte → wszystkie');
  const log = [{ type: 'export', year: 11.4, partnerName: 'Beta', items: { Fe: 2 } }, { type: 'import', year: 11.9, partnerName: 'Beta', items: { Fe: 1, Cu: 3 } },
    { type: 'export', year: 12.1, partnerName: 'Gamma', items: { Fe: 9 } }];
  const h = safe(() => TCL.connectionHistory(log, 'Beta'), []);
  assert(h.length === 1 && h[0].year === 11 && h[0].exports === 2 && h[0].imports === 4 && h[0].importItems.Cu === 3,
    'A2 historia połączenia z dziennika: tylko wpisy partnera, sumy per rok (kształt getYearlyAggregation)');
  const fl = [{ partnerId: 'b', goodId: 'Fe', qtyPerYear: 2, direction: 'export' }, { partnerId: 'c', goodId: 'Fe', qtyPerYear: 3, direction: 'export' },
    { partnerId: 'b', goodId: 'Cu', qtyPerYear: 1, direction: 'import' }];
  const bb = safe(() => TCL.connectionFlowBars(fl, 'b'), []), ba = safe(() => TCL.connectionFlowBars(fl, ALL), []);
  assert(bb.length === 2 && bb[0].goodId === 'Fe' && bb[0].qty === 2 && ba.find((b) => b.goodId === 'Fe' && b.isExport)?.qty === 5,
    'A3 słupki bieżących przepływów: jednego partnera / wszystkich zsumowane');

  const all = render('trade', true);
  const connZ = all.zones.filter((z) => z.type === 'trade_conn').map((z) => z.data.partnerId);
  assert(isKit(all) && connZ[0] === ALL && connZ.includes('col_b') && connZ.includes('col_c') && all.ov._tradeConnId === ALL,
    `A4 pierwszy wiersz listy = wszystkie połączenia i jest domyślnie wybrany (${connZ.join(',')})`);
  const beta = render('trade', true, { pre: (ov) => { ov._tradeConnId = 'col_b'; } });
  const barsAll = dataOf(all.zones, 'trade_bar_hover'), barsBeta = dataOf(beta.zones, 'trade_bar_hover');
  assert(isKit(beta) && barsBeta.length > 0 && !sameSet(barsAll, barsBeta), `A5 wybór połączenia zmienia wykres bohatera (${barsAll.length} → ${barsBeta.length} słupków)`);
  const jb = lc(joined(beta));
  assert(jb.includes(lc(t('econ.console.partnerPrices', 'Beta'))) && jb.includes(lc(t('econ.console.connInfo'))) && !jb.includes(lc(t('tradePanel.localPrices'))),
    'A6 inspektor połączenia: fakty połączenia + ceny u partnera (ceny są per kolonia)');
  const priced = [];
  const bp = render('trade', true, { pre: (ov) => { ov._tradeConnId = 'col_b'; const f0 = ov._calcLocalPrices.bind(ov); ov._calcLocalPrices = (c) => { priced.push(c?.planetId); return f0(c); }; } });
  const pricedAll = [];
  render('trade', true, { pre: (ov) => { const f0 = ov._calcLocalPrices.bind(ov); ov._calcLocalPrices = (c) => { pricedAll.push(c?.planetId); return f0(c); }; } });
  assert(isKit(bp) && priced.includes('col_b') && !pricedAll.includes('col_b'), `A6b ceny liczone dla kolonii partnera (${priced.join(',')}; wszystkie: ${pricedAll.join(',')})`);
  const gam = render('trade', true, { pre: (ov) => { ov._tradeConnId = 'col_c'; } });
  assert(isKit(gam) && joined(gam).includes(t('econ.console.connNoData')) && dataOf(gam.zones, 'trade_bar_hover').length === 0,
    'A7 połączenie bez danych: zwykły tekst „brak danych” zamiast cichego braku zmian');
  const strip = gam.ov.consoleZones?.strip;
  const stripTexts = gam.log.filter((e) => e[0] === 'fillText' && strip && e[3] >= strip.y && e[3] <= strip.y + strip.h).map((e) => e[1]);
  assert(stripTexts.length > 0 && !stripTexts.some((x) => x.includes('Kupiec')), 'A8 pas: dziennik tylko wybranego połączenia (Gamma — brak wpisów Beta)');
  const cur = render('trade', true, { pre: (ov, w) => { ov._tradeConnId = 'col_b'; window.KOSMOS.tradeLog.getLog = () => []; } });
  const curBars = cur.zones.filter((z) => z.type === 'trade_bar_hover');
  assert(isKit(cur) && curBars.length === 2 && curBars.every((z) => z.data.goodId && z.data.year == null) && joined(cur).includes(t('econ.console.flowLegend')),
    'A9 połączenie bez historii w dzienniku: słupki bieżących przepływów + legenda szt./rok');
}

// ═══ B — Rynek: bramka zlecenia z powodem, nigdy cichy brak reakcji (polerka K3, uwaga B) ══════════════════════════
console.log('B — bramka zlecenia');
{
  const base = { playerOk: true, qty: 10, warp: true, agreement: true, total: 100, playerCredits: 500, aiCredits: 500, aiStock: 50, ownStock: 50,
    empireName: 'Kel', techName: 'Napędy' };
  const g = (side, patch) => safe(() => TCL.orderGate({ ...base, side, ...patch }), null);
  const cases = [
    ['buy', { playerOk: false }, 'econ.console.gateNoColony'], ['buy', { qty: 0 }, 'econ.console.gateQty'],
    ['buy', { warp: false }, 'econ.console.gateTech'], ['sell', { agreement: false }, 'econ.console.gateTreaty'],
    ['buy', { playerCredits: 99 }, 'econ.console.gateCredits'], ['buy', { aiStock: 0 }, 'econ.console.gatePartnerStock'],
    ['sell', { ownStock: 9 }, 'econ.console.gateOwnStock'], ['sell', { aiCredits: 99 }, 'econ.console.gatePartnerCredits'],
    ['buy', { warp: false, agreement: false }, 'econ.console.gateTech'],
  ];
  for (const [side, patch, key] of cases) {
    const r = g(side, patch);
    assert(r && r.ok === false && r.key === key, `B1 ${side} ${JSON.stringify(patch)} → wyłączony, powód ${key}`);
  }
  assert(g('buy', {})?.ok === true && g('sell', {})?.ok === true, 'B2 wszystkie warunki spełnione → KUP i SPRZEDAJ dozwolone (kontrola)');
  const tn = (txt) => t(txt.key, ...txt.args);
  assert(cases.every(([side, patch]) => { const r = g(side, patch); return r && !/^(econ|market)\./.test(tn(r)); }), 'B3 każdy powód ma tekst PL (klucze w i18n)');

  // wykonanie: stan zablokowany → brak strefy, powód narysowany; stan dozwolony → strefa, bez powodu
  const blocked = [['warp', (ov, w) => { window.KOSMOS.techSystem.isResearched = () => false; }, 'econ.console.gateTech'],
    ['traktat', (ov, w) => { window.KOSMOS.diplomacySystem.hasTradeAgreement = () => false; }, 'econ.console.gateTreaty'],
    ['kredyty', (ov, w) => { w.cols[0].credits = 1; }, 'econ.console.gateCredits'],
    ['zapas partnera', (ov, w) => { w.cols[2].resourceSystem.inventory.set(SNAKE_CHEAP, 0); }, 'econ.console.gatePartnerStock']];
  for (const [name, pre, key] of blocked) {
    const r = render('market', true, { pre });
    const reasonHead = t(key, '\u0000', '\u0000').split('\u0000')[0].replace(/[:(]\s*$/, '').trim();
    assert(isKit(r) && !r.zones.some((z) => z.type === 'market_buy') && joined(r).includes(reasonHead),
      `B4 ${name}: [ KUP ] bez strefy, powód „${reasonHead}…” pod przyciskiem`);
  }
  const ok = render('market', true);
  assert(isKit(ok) && ok.zones.some((z) => z.type === 'market_buy') && ok.zones.some((z) => z.type === 'market_sell')
    && !joined(ok).includes(t('econ.console.gateTech', '').split(':')[0]), 'B5 stan dozwolony: KUP i SPRZEDAJ mają strefy, brak powodu');
  // ścieżka OFF odrzuca tak samo — ta sama metoda placeOrder (to nie błąd konsoli)
  if (TOB?.TradeOrderBoard) {
    const w = makeWorld();
    const board = new TOB.TradeOrderBoard(w.colMgr);
    board._orders = () => (board.__o ??= []);
    window.KOSMOS.techSystem.isResearched = () => false;
    const r1 = safe(() => board.placeOrder({ side: 'buy', goodId: SNAKE_CHEAP, qty: 10, playerColonyId: 'col_a', aiColonyId: 'ai_1' }), null);
    window.KOSMOS.techSystem.isResearched = () => true;
    window.KOSMOS.diplomacySystem.hasTradeAgreement = () => false;
    const r2 = safe(() => board.placeOrder({ side: 'buy', goodId: SNAKE_CHEAP, qty: 10, playerColonyId: 'col_a', aiColonyId: 'ai_1' }), null);
    assert(r1?.ok === false && r1.reason === 'no_warp' && r2?.ok === false && r2.reason === 'no_agreement',
      `B6 TradeOrderBoard.placeOrder (ta sama dla OFF): bez ion_drives → ${r1?.reason}, bez traktatu → ${r2?.reason}`);
    board.dispose?.();
  } else assert(false, 'B6 TradeOrderBoard importuje się');
  const off = render('market', false, { pre: () => { window.KOSMOS.techSystem.isResearched = () => false; } });
  assert(!isKit(off) && off.zones.some((z) => z.type === 'market_buy'), 'B7 kontrola OFF: strona dzisiejsza ma strefę [ KUP ] także bez ion_drives (klik = cicha odmowa placeOrder)');
}

// ═══ C — wykresy Handlu i tablica Rynku: etykiety (polerka K3, uwagi 4–5) ══════════════════════════════════════════
console.log('C — etykiety');
{
  const r = render('trade', true);
  assert(isKit(r) && r.texts.includes(t('econ.console.yearN', 11)) && r.texts.includes(t('econ.console.yearN', 12)) && joined(r).includes(t('econ.console.chartLegend')),
    'C1 Handel: oś X „Rok N” i linia jednostki słupków');
  const m = render('market', true);
  const heads = m.texts.filter((x) => x === t('econ.console.boardStock').toUpperCase()).length;
  assert(isKit(m) && heads >= 1 && m.texts.includes(t('econ.console.boardGood').toUpperCase()), `C2 Rynek: nagłówki kolumn tablicy (${heads}× „zapas · cena”)`);
  const title = m.texts.find((x) => lc(x).includes(lc('Nowa Sparta ·')));
  assert(title && lc(title).includes(lc('Hegemonia Kel')) && !m.texts.some((x) => lc(x).startsWith(lc(t('market.tradeWith')))),
    `C3 Rynek: tytuł tablicy = kolonia · imperium („${title ?? '—'}”)`);
}

// ═══ K — runda 2: kolonia Handlu (kto handluje), powody po polsku, wydatki, objaśnienie zlecenia, debug ═════════════
console.log('K — kolonia Handlu');
const withOutpost = (ov, w) => {
  const o = { planetId: 'col_o', name: 'Placówka Zeta', isOutpost: true, resourceSystem: { inventory: new Map() } };
  w.cols.push(o);
  w.colMgr.getPlayerColonies = () => [w.cols[0], w.cols[1], o];
  w.colMgr.activePlanetId = 'col_o';
  w.colMgr.switchActiveColony = () => { w.calls.switched = (w.calls.switched ?? 0) + 1; return true; };
};
{
  const opts = safe(() => TCL.tradeColonyOptions([{ planetId: 'a', name: 'A' }, { planetId: 'o', name: 'O', isOutpost: true }]), []);
  assert(opts.length === 2 && opts[0].ok && !opts[1].ok && opts[1].reasonKey === 'econ.console.ctxOutpost', 'K1 placówka widoczna, niewybieralna, z powodem');
  const pk = (p, a) => safe(() => TCL.pickTradeColony(opts, p, a), 'x');
  assert(pk('a', 'o') === 'a' && pk(null, 'o') === 'a' && pk('o', 'a') === 'a' && pk(null, null) === 'a'
    && safe(() => TCL.pickTradeColony([{ id: 'o', ok: false }], null, 'o'), 'x') === null, 'K2 wybór: wybrana pełna → aktywna pełna → pierwsza pełna; sama placówka → brak');

  // przypadek właściciela: aktywna kolonia gry = placówka
  const r = render('market', true, { pre: withOutpost });
  assert(isKit(r) && safe(() => r.ov._tradeColonyId?.(), null) === 'col_a' && joined(r).includes(t('econ.console.ctxLabel', 'Alfa')),
    `K3 aktywna = placówka → konsola handluje pełną kolonią i mówi którą („${t('econ.console.ctxLabel', 'Alfa')}”)`);
  const buy = r.zones.find((z) => z.type === 'market_buy');
  if (buy) clickZone(r, buy);
  const ord = r.w.calls.orders[0];
  assert(buy && ord?.playerColonyId === 'col_a' && window.KOSMOS.colonyManager.activePlanetId === 'col_o' && !r.w.calls.switched,
    `K4 [ KUP ] składa zlecenie dla kolonii Handlu (${ord?.playerColonyId ?? '—'}); aktywna gry bez zmian, bez switchActiveColony`);
  const off = render('market', false, { pre: withOutpost });
  const offBuy = off.zones.find((z) => z.type === 'market_buy');
  if (offBuy) { setEco(false); safe(() => off.ov.handleClick(offBuy.x + 2, offBuy.y + 2)); }
  assert(!isKit(off) && (!offBuy || off.w.calls.orders[0]?.playerColonyId === 'col_o'), 'K5 kontrola OFF: dzisiejsza strona używa aktywnej kolonii gry (placówki)');

  // lista wyboru kolonii
  const pk1 = render('trade', true, { pre: (ov, w) => { withOutpost(ov, w); ov._ctxOpen = true; } });
  const picks = pk1.zones.filter((z) => z.type === 'trade_ctx_pick').map((z) => z.data.colonyId);
  assert(isKit(pk1) && picks.join(',') === 'col_a,col_b' && joined(pk1).includes(`Placówka Zeta — ${t('econ.console.ctxOutpost').split(' ')[0]}`),
    `K6 lista wyboru: pełne kolonie wybieralne (${picks.join(',')}), placówka przygaszona z powodem`);
  const pz = pk1.zones.find((z) => z.type === 'trade_ctx_pick' && z.data.colonyId === 'col_b');
  if (pz) clickZone(pk1, pz);
  pk1.w.calls.creditsOf.length = 0;
  const rd = recCtx();
  setEco(true);
  safe(() => pk1.ov.draw(rd.ctx, 1600, 1041));
  assert(pk1.ov._tradeColId === 'col_b' && !pk1.ov._ctxOpen && pk1.w.calls.creditsOf.includes('col_b') && !pk1.w.calls.creditsOf.includes('col_a')
    && window.KOSMOS.colonyManager.activePlanetId === 'col_o' && !pk1.w.calls.switched,
    'K7 wybór Beta: Handel czyta kredyty Bety; aktywna gry bez zmian (kontekst lokalny)');

  // żaden klik konsoli nie zmienia aktywnej kolonii gry (diagnoza — kontrola)
  let changed = 0, clicked = 0;
  for (const page of ['trade', 'market']) {
    const base0 = render(page, true, { pre: withOutpost });
    for (const z of base0.zones.filter((q) => !['close', 'tab', 'trade_ctx_pick'].includes(q.type))) {
      const rr = render(page, true, { pre: withOutpost });
      const zz = rr.zones.find((q) => q.type === z.type && JSON.stringify(q.data) === JSON.stringify(z.data));
      if (!zz) continue;
      clickZone(rr, zz); clicked++;
      if (window.KOSMOS.colonyManager.activePlanetId !== 'col_o' || rr.w.calls.switched) changed++;
    }
  }
  assert(clicked > 10 && changed === 0, `K8 kontrola: ${clicked} klików w konsoli — żaden nie zmienia aktywnej kolonii gry`);

  // powody: PL i EN, prostym językiem, bez surowych id i angielskiego w PL
  const keys = TCL?.TRADE_REASON_KEYS ?? [];
  const bad = [];
  for (const k of keys) {
    setLocale('pl'); const pl = t(k, 'X', 'Y');
    setLocale('en'); const en = t(k, 'X', 'Y');
    if (pl === k || en === k || pl === en || /\b[a-z]+_[a-z_]+\b/.test(pl + en) || /\b(select|player|colony)\b/i.test(pl)) bad.push(k);
  }
  setLocale('pl');
  assert(keys.length >= 13 && bad.length === 0, `K9 ${keys.length} kluczy powodów w PL i EN, bez id i angielskiego w PL${bad.length ? ' — źle: ' + bad.join(',') : ''}`);
  assert(/pełn/.test(t('econ.console.gateNoColony')) && /placówk/.test(t('econ.console.gateNoColony')), 'K10 powód „brak kolonii” mówi: pełna kolonia, placówki nie handlują');

  // wydatki: bramki z powodem
  const sg = (p) => safe(() => TCL.spendGates({ credits: 500, hasConstruction: true, buyTarget: true, buyCost: 40, festivalActive: false, ...p }), null);
  assert(sg({})?.rush?.ok && sg({})?.buy?.ok && sg({})?.festival?.ok, 'K11 wydatki: wszystko spełnione → dozwolone');
  assert(sg({ hasConstruction: false })?.rush?.key === 'econ.console.spendNoBuild' && sg({ credits: 10 })?.rush?.key === 'econ.console.spendCredits'
    && sg({ buyTarget: false })?.buy?.key === 'econ.console.spendNoShortage' && sg({ credits: 39 })?.buy?.key === 'econ.console.spendCredits'
    && sg({ festivalActive: true })?.festival?.key === 'econ.console.spendFestivalOn' && sg({ credits: 79 })?.festival?.key === 'econ.console.spendCredits',
    'K12 każdy warunek wydatku → wyłączony z kluczem powodu');
  const poor = render('trade', true, { pre: (ov, w) => { w.civ.getCredits = () => 10; } });
  assert(isKit(poor) && !poor.zones.some((z) => z.type === 'spend_festival') && joined(poor).includes(t('econ.console.spendCredits', '80', '10')),
    'K13 mało kredytów: [ FESTYN ] bez strefy, powód pod nim');
  const ctxB = render('trade', true, { pre: (ov, w) => { w.cols[1].credits = 900; w.cols[1].buildingSystem = { _constructionQueue: new Map([['b1', { progress: 0, buildTime: 10 }]]) };
    w.cols[1].prosperitySystem = { _eventBonuses: new Map(), addEventBonus: () => {} }; w.cols[1].resourceSystem._producers = new Map(); ov._tradeColId = 'col_b'; } });
  const rush = ctxB.zones.find((z) => z.type === 'spend_rush');
  if (rush) clickZone(ctxB, rush);
  assert(rush?.data.colonyId === 'col_b' && ctxB.w.cols[1].buildingSystem._constructionQueue.get('b1').progress > 0
    && window.KOSMOS.buildingSystem._constructionQueue.get('t1').progress === 0, 'K14 [ PRZYSPIESZ ] przyspiesza budowy kolonii Handlu (Beta), nie aktywnej');

  // Rynek: objaśnienie zlecenia
  const m = render('market', true);
  const jm = joined(m);
  assert(isKit(m) && jm.includes(t('econ.console.orderTo')) && jm.replace(/\s/g, '').includes(t('econ.console.orderDeliveryVal', '1', '11.0').replace(/\s/g, ''))
    && jm.includes(t('econ.console.orderHowBuy', 'Nowa Sparta', 'Alfa').split(' ').slice(0, 4).join(' ')),
    'K15 Rynek: odbiorca (Twoja kolonia), płacisz / otrzymujesz, dostawa warpem (rok 11.0), jak działa KUP');

  // debug
  render('market', true, { pre: withOutpost });
  const dbg = safe(() => window.KOSMOS.debug?.trade?.ctx?.(), null);
  assert(dbg?.activeColony?.type === 'outpost' && dbg?.tradeColony?.type === 'full_colony' && dbg?.market?.placeOrderGates?.playerColony_notOutpost === true
    && typeof dbg?.spend?.festival === 'string', `K16 KOSMOS.debug.trade.ctx(): aktywna ${dbg?.activeColony?.type}, Handlu ${dbg?.tradeColony?.type}, bramki zlecenia i wydatków`);
}

Object.assign(F, saved);
console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
