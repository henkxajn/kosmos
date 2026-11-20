// ARC COLONY SPHERE CS-8c — keeper stron konsoli Kolonii w idiomie konsol (Załoga / Populacja / Stacja, rekrutacja, pickery
// stacji, szuflada grupy) + Finding 789. Plan: docs/design/COLONY_SPHERE_PLAN.md §3.17.
//
//   P1  modele stron (czysta logika `ColonyConsolePagesLogic`): wiersze, tony ról, stany wyłączone z powodem (żadnej cichej
//       odmowy), kolejność powodów rekrutacji = dzisiejszy panel, okna i szuflada OBOK strefy inspektora
//   P2  Finding 789 (gra headless, flaga ON i OFF): budowa ruszona z kolejki zamówień bez okna kolonii — `cancelConstruction`
//       zdejmuje ją z kolejki i zwraca połowę kosztu (dawniej: nic, a zdarzenie ogłaszało sukces); kontrole: brak budowy,
//       kafel zsynchronizowany
//   P3  piny źródła: konsola nie woła już kodu dzisiejszych stron (osadzona kolumna, szuflada, modal rekrutacji, picker) dla
//       siatek geo; okno płaskiej kolonii dalej woła je wszystkie; strony bez emoji i bez literałów kolorów; podpowiedzi
//       wielowierszowe; okna modalne mówią dlaczego; rename armii bez okna przeglądarki; strojenie D-CS-28 bez zmian
//
// Importy nowych modułów dynamiczne — na bazie (przed CS-8c) piny degradują do FAIL, nie przerywają.

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as TG from '../../map/TileGraph.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const tryImport = async (p) => { try { return await import(p); } catch { return null; } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (rel) => { try { return readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const quiet = (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = console.warn = console.error = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.error = e; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Ciało metody klasy (wcięcie 2) od nagłówka do pierwszego `\n  }\n`. */
const method = (code, header) => { const i = code.indexOf(header); if (i < 0) return ''; const j = code.indexOf('\n  }\n', i); return j < 0 ? '' : code.slice(i, j); };

const L = (await tryImport('../../ui/ColonyConsolePagesLogic.js')) ?? {};
const need = ['crewRowsOf', 'crewSummaryOf', 'growthTipLines', 'satisfactionTipLines', 'targetTipLines', 'strataTipLines', 'populationPageOf',
  'stationBuildOf', 'stationManageOf', 'modulePickerRowsOf', 'shipPickerRowsOf', 'recruitStateOf', 'groupDrawerOf', 'windowNextToInspector', 'drawerRect'];
const missing = need.filter((n) => typeof L[n] !== 'function');

// ── P1 modele stron ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nP1 page models (pure)');
if (missing.length) {
  for (const n of ['P1a', 'P1b', 'P1c', 'P1d', 'P1e', 'P1f', 'P1g', 'P1h', 'P1i', 'P1j']) assert(false, `${n} ColonyConsolePagesLogic missing: ${missing.join(', ')}`);
} else {
  // P1a — Załoga: wiersze, steppery wyłączone z powodem tam, gdzie dziś nie było strefy
  const bd = [
    { type: 'laborer', namePL: 'Robotnicy', nameEN: 'Laborers', grossJobs: 10, workers: 8, synthetic: 0, wage: 1, pressure: 0.3, target: 0.35, staffing: 0.8 },
    { type: 'miner', namePL: 'Górnicy', nameEN: 'Miners', grossJobs: 0, workers: 0, synthetic: 0 },
    { type: 'engineer', namePL: 'Inżynierowie', grossJobs: 4, workers: 0, synthetic: 4, wage: 6, pressure: 0, target: 0.2, staffing: 1 },
    { type: 'clerk', namePL: 'Urzędnicy', grossJobs: 0, workers: 2, synthetic: 0, wage: 1, target: 0.1, staffing: 0 },
  ];
  const prev = { laborer: { target: 12, desired: 20, current: 8, delta: 4 }, engineer: { target: 3, desired: 3, current: 0, delta: 3 } };
  const rows = L.crewRowsOf(bd, { ordersOk: true, stateOf: (ty) => (ty === 'laborer' ? 'unreachable' : 'active'), previewOf: (ty) => prev[ty] ?? null });
  const [lab, min, eng, clk] = rows;
  assert(rows.length === 4 && min.active === false && lab.active && eng.active && clk.active
    && lab.shareText === '35%≈20!' && lab.shareTone === 'alert' && lab.wageTone === 'alert' && lab.staffTone === 'primary' && lab.capText === '8/10'
    && lab.targetMinus.enabled && lab.targetPlus.enabled && lab.stateTip
    && lab.droidMinus.enabled === false && lab.droidMinus.reasonKey === 'synthetic.reason.no_synthetic' && lab.droidPlus.enabled
    && eng.shareText === '20%≈3' && eng.shareTone === 'primary' && eng.staffTone === 'alert' && eng.capText === '0+4D/4'
    && eng.droidPlus.enabled === false && eng.droidPlus.reasonKey === 'synthetic.reason.no_open_slot' && eng.droidMinus.enabled
    && clk.targetMinus.enabled === false && clk.targetMinus.reasonKey === 'colonyPages.reason.noJobs' && clk.stateTip === false,
  'P1a Crew rows: share ≈ preview (unreachable → desired + "!", alert), wage pressure, staffing; every stepper that had no zone today is now disabled WITH a reason (no droid / no open slot / no jobs)');
  const foreign = L.crewRowsOf(bd, { ordersOk: false });
  assert(foreign[0].foreign === true && foreign[0].targetPlus.enabled === true && L.crewRowsOf(null).length === 0,
    'P1a Crew rows on a foreign colony: zones keep their real type (the ownership gate in _onHit refuses with a reason), the view only dims');
  // P1b — podsumowanie Załogi
  const sum = L.crewSummaryOf({ humans: 20, unemployed: 3, satisfaction: 61.4, prosperity: { cur: 50, tgt: 40 }, growth: 0.25, income: 80, wages: 96 });
  const byId = Object.fromEntries(sum.map((r) => [r.id, r]));
  assert(byId.unemployed.tone === 'alert' && byId.unemployed.value === '3 (15%)' && byId.satisfaction.tip === 'satisfaction' && byId.prosperity.value === '50 ↓ 40'
    && byId.prosperity.tone === 'alert' && byId.growth.tip === 'growth' && byId.net.tone === 'alert' && byId.net.wide
    && !L.crewSummaryOf({ prosperity: null }).some((r) => r.id === 'prosperity'),
  'P1b Crew summary: unemployed > 10% alert, prosperity trend (row only with the global prosperity system), net income − wages, growth/satisfaction carry tooltips');
  // P1c — podpowiedzi wielowierszowe (dzisiejsze podpowiedzi HTML; w konsoli były wygaszone)
  const g = L.growthTipLines({ growth: 0.18, base: 0.04, prosperityMult: 0.6, planetMod: 1, factionMult: 1, taper: 0.96, humans: 16, capacity: 32, fillFrac: 0.5, capped: false });
  const g2 = L.growthTipLines({ growth: 0.1, base: 0.04, prosperityMult: 1, planetMod: 1, factionMult: 1.2, taper: 1, humans: 1, capacity: 2, fillFrac: 0.5, capped: true, cap: 0.3, blockReason: 'no_housing' });
  const sl = L.satisfactionTipLines({ satisfaction: 50, base: 50, empTerm: 0, unemploymentRate: 0, crowdTerm: -2, taxTerm: 1, taxRate: 0.1 });
  const tt = L.targetTipLines('off', { target: 3, desired: 3, current: 3, delta: 0 });
  const st = L.strataTipLines('X', []);
  assert(g.length === 6 && g[0].bold && !g.some((l) => l.args?.[0]?.key === 'workforce.growthTip.faction') && g2.length === 9 && g2.some((l) => l.args?.[0]?.key === 'workforce.growthTip.faction') && g2.some((l) => l.key === 'workforce.growthTip.block.no_housing' && l.tone === 'alert') && g2.some((l) => l.key === 'workforce.growthTip.capped')
    && sl.length === 5 && tt.length === 1 && st.length === 2 && st[1].key === 'workforce.noBuildings' && L.growthTipLines(null).length === 0,
  'P1c tooltip lines: growth breakdown (faction line only when ≠ 1, block reason, cap), satisfaction breakdown, target preview, buildings of a stratum');
  // P1d — Populacja: 6 sekcji, progi alertu jak czerwień dzisiejszej zakładki
  const pg = L.populationPageOf({ loyalty: 20, identity: 10, traits: [], events: [{ nameKey: 'popPanel.crisisFamine', descKey: 'popPanel.crisisFamineDesc' }],
    needs: [{ name: 'Food', ratio: 0.4, penalty: '-15', pooled: false }, { name: 'Water', ratio: 1, pooled: true }], layers: { survival: 0.2, luxury: 0.9 },
    growthMult: 0.8, epoch: { nameKey: 'epoch.early', score: 3 }, goods: [{ name: 'A', unlocked: false }, { name: 'B', unlocked: true, production: 1, demand: 2, sat: 0.4 }],
    strata: [], housing: [{ name: 'H', level: 2, housing: 8 }, { name: 'C', level: 1, housing: 16 }] });
  const rowsOf = (i) => pg[i].rows;
  assert(pg.length === 6 && rowsOf(0)[0].tone === 'alert' && rowsOf(0).some((r) => r.key === 'colonyInfo.popTab.noTraits') && rowsOf(0).some((r) => r.valueKey === 'popPanel.activeLabel')
    && rowsOf(1)[0].tone === 'alert' && rowsOf(1).some((r) => r.key === 'popPanel.deficit') && rowsOf(1).some((r) => r.key === 'popPanel.fedFromPool')
    && rowsOf(2)[0].tone === 'alert' && rowsOf(2)[4].tone === 'primary' && rowsOf(3).some((r) => r.valueKey === 'colonyPages.locked') && rowsOf(3).some((r) => r.tone === 'alert')
    && rowsOf(4)[0].text === '—' && rowsOf(5).at(-1).total && same(rowsOf(5).at(-1).valueArgs, [24])
    && L.populationPageOf({ housing: null })[5].rows[0].key === 'popPanel.noHousingData' && L.populationPageOf({ housing: [] })[5].rows[0].key === 'popPanel.noHousingBuildings',
  'P1d Population page: six sections, same data and red thresholds as today (loyalty < 30 %, needs < 50 %, layers < 30 %), pooled need, locked goods, housing total');
  // P1e — Stacja: budowa i zarządzanie
  const sb = L.stationBuildOf({ targets: [{ id: 'p', name: 'P', type: 'planet' }, { id: 'm', name: 'M', type: 'moon' }], selectedId: 'gone', cost: [{ id: 'Fe', need: 100, have: 40 }, { id: 'Si', need: 10, have: 10 }], canAfford: false });
  const station = { pop: 4, popCapacity: 6, tradeCapacity: 2, hasActiveShipyard: false, stationType: 'orbital_station',
    modules: [{ id: 'a', moduleType: 'habitat', level: 1 }, { id: 'b', moduleType: 'reactor', active: false, inactiveReason: 'no_crew' }],
    pendingModuleOrders: [{ id: 'o1', moduleType: 'solar', progress: 1, buildTime: 4, status: 'building' }], shipQueues: [] };
  const defs = { habitat: { popCapacity: 4, energy: -1 }, reactor: { energy: 6 }, solar: { energy: 3 } };
  const sm = L.stationManageOf(station, { moduleDef: (ty) => defs[ty] ?? null, maxModules: 3 });
  assert(sb.selectedId === 'p' && sb.targets[0].sel && sb.pickable && sb.cost[0].tone === 'alert' && sb.cost[1].tone === 'primary' && sb.noteKey === 'station.buildWait'
    && sm.stats[1].value === '+0 / -1 = -1' && sm.stats[1].tone === 'alert' && sm.noCrewHint && sm.modules[0].demolish.blocked === true && sm.modules[1].demolish.blocked === false
    && sm.modules[1].status.key === 'colonyPages.module.noCrew' && sm.pending[0].frac === 0.25
    && sm.addModule.enabled === false && sm.addModule.reasonKey === 'colonyPages.reason.slotsFull' && same(sm.addModule.reasonArgs, [3, 3]),
  'P1e Station: build form (target fallback, short cost in alert, wait note), management (energy of active modules, populated habitat demolish blocked, full slots → add-module disabled with a reason instead of vanishing)');
  // P1f — pickery: kolejność powodów (technologia → unikat → sloty → magazyn), braki jako lista id (widok nazywa)
  const pst = { modules: [{ moduleType: 'hub' }], pendingModuleOrders: [] };
  const mdef = { lab: { requires: 'tx' }, hub: { unique: true }, cheap: {}, dear: {} };
  const pr = L.modulePickerRowsOf(['lab', 'hub', 'cheap', 'dear'], pst, { moduleDef: (ty) => mdef[ty], costOf: (ty) => (ty === 'dear' ? { Fe: 50 } : { Fe: 5 }), techOk: () => false, maxModules: 8, haveOf: () => 10 });
  const full = L.modulePickerRowsOf(['cheap'], { modules: [{}, {}], pendingModuleOrders: [] }, { moduleDef: () => ({}), costOf: () => ({}), maxModules: 2 });
  const sp = L.shipPickerRowsOf([{ hullId: 'nope' }, { hullId: 'h1', modules: ['m', null] }, { hullId: 'h2' }],
    { hullOf: (id) => ({ h1: { requires: 'x' }, h2: {} })[id] ?? null, costOf: () => ({ Fe: 9, C: 1 }), techOk: () => false, haveOf: (id) => (id === 'Fe' ? 1 : 5) });
  assert(pr[0].reasonKey === 'colonyPages.reason.tech' && same(pr[0].reasonArgs, ['tx']) && pr[1].reasonKey === 'colonyPages.reason.unique' && pr[2].canBuild
    && pr[3].reasonKey === 'colonyPages.reason.depotShort' && same(pr[3].reasonArgs, [['Fe']]) && full[0].reasonKey === 'colonyPages.reason.slotsFull'
    && sp.length === 2 && sp[0].reasonKey === 'colonyPages.reason.tech' && sp[0].modCount === 1 && sp[1].reasonKey === 'colonyPages.reason.depotShort' && same(sp[1].reasonArgs, [['Fe']]),
  'P1f pickers: every unbuildable row says why (tech / unique / slots / depot short), in today\'s button-label order; unknown hull skipped');
  // P1g — rekrutacja: ta sama kolejność warunków co dzisiejszy panel i strona Jednostek Dowództwa
  const R = L.recruitStateOf;
  assert(R({ hasColony: false }).reasonKey === 'cmdPages.ground.reasonNoColony'
    && R({ gate: { unlocked: false, reason: 'tech', missing: 't' }, slots: 0 }).reasonKey === 'cmdPages.ground.reasonTech'
    && same(R({ gate: { unlocked: false, requiredLv: 2, currentLv: 1 } }).reasonArgs, [2, 1])
    && same(R({ slots: 1, queue: 1, capOK: false, canAfford: false }).reasonArgs, [1, 1])
    && R({ slots: 2, queue: 0, capOK: false, maxUnits: 4, canAfford: false }).reasonKey === 'cmdPages.ground.reasonCap'
    && R({ slots: 2, queue: 0, canAfford: false }).reasonKey === 'cmdPages.ground.reasonCost' && R({ slots: 1, queue: 0 }).canRecruit === true,
  'P1g recruitment: colony → archetype gate (tech / barracks) → barracks slot → unit cap → cost — same order as GroundUnitPanel and the Command Units page');
  // P1h — szuflada grupy
  const us = [{ id: 'u1', hp: 3, hpMax: 15, dmg: 7 }, { id: 'u2', hp: 15, hpMax: 15, dmg: 5 }];
  const da = L.groupDrawerOf(us, { army: { id: 'A', name: 'Alfa', kills: 2, tileLabel: 'g4' } });
  const dg = L.groupDrawerOf(us, { sameTile: false }), dt = L.groupDrawerOf(us, { sameTile: true }), d1 = L.groupDrawerOf([us[0]]);
  assert(same(da.actions.map((a) => a.type), ['armySplitFromDrawer', 'armyRename', 'armyDisband']) && da.actions[2].danger && same(da.titleArgs, ['Alfa', 2, 'g4'])
    && same(da.sums, { dmg: 12, hp: 18, hpMax: 30, kills: 2 }) && da.rows[0].tone === 'alert'
    && dg.actions[0].type === 'armyCreateFromSelection' && dg.actions[0].enabled === false && dg.actions[0].reasonKey === 'colonyPages.reason.mergeSameTile' && dt.actions[0].enabled
    && dg.actions[1].type === 'drawerOpenGroup' && d1.actions[0].type === 'drawerOpenUnit' && same(d1.actions[0].data, { unitId: 'u1' }) && dg.sums === null,
  'P1h group drawer: army actions (split / rename / disband), group actions (merge / details) — merge off one tile is shown disabled with a reason instead of vanishing');
  // P1i — okna i szuflada OBOK strefy inspektora, w obrębie bohatera
  const zones = { hero: { x: 250, y: 70, w: 800, h: 700 }, inspector: { x: 1060, y: 70, w: 336, h: 780 } };
  const win = L.windowNextToInspector(zones, 900), dr = L.drawerRect(zones);
  const narrow = L.windowNextToInspector({ hero: { x: 750, y: 70, w: 300, h: 700 }, inspector: zones.inspector }, 200);
  assert(win.x + win.w === 1060 - L.COLONY_PAGES.WINDOW_GAP && win.y === 70 + L.COLONY_PAGES.WINDOW_GAP && win.y + win.h <= 770 && win.x >= 250
    && dr.x + dr.w === 1060 - L.COLONY_PAGES.WINDOW_GAP && dr.y + dr.h === 770 - L.COLONY_PAGES.WINDOW_GAP && narrow.x >= 750 + L.COLONY_PAGES.WINDOW_GAP && narrow.w <= 300 - 2 * L.COLONY_PAGES.WINDOW_GAP && narrow.h >= 80
    && L.windowNextToInspector({}, 100) === null && L.drawerRect(null) === null,
  'P1i windows (recruitment, station pickers) and the group drawer sit against the inspector zone inside the hero — not over the sphere centre; clamped on narrow screens');
  assert(same(L.CONSOLE_PAGES, ['workforce', 'populacja', 'stacja']) && L.pageScrollKey('stacja') === 'pg_stacja',
    'P1j page scroll keys: one per page (pg_workforce / pg_populacja / pg_stacja), routed by the console wheel');
}

// ── P2 Finding 789 ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nP2 Finding 789 — cancel a construction started without the colony window (headless game)');
const { GameCore } = await import('../headless/GameCore.js');
const { default: EventBus } = await import('../../core/EventBus.js');
const { BUILDINGS } = await import('../../data/BuildingsData.js');
const { evaluatePlacement } = await import('../../map/HexTile.js');
const SYNC = await import('../../utils/ColonyGrid.js');
function run789(flagOn, { sync = false } = {}) {
  GAME_CONFIG.FEATURES.colonySphere = flagOn;
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization', galaxySeed: 20261120 }));
  const K = window.KOSMOS, colony = K.colonyManager.getColony(K.homePlanet.id);
  const bSys = colony.buildingSystem, rs = colony.resourceSystem, store = K.systemPoolService?.getStore?.(rs) ?? rs;
  const graph = TG.tileGraphOf(bSys._grid ?? colony.grid), b = BUILDINGS.solar_farm;
  const saved = {}; for (const k of Object.keys(b.cost ?? {})) { saved[k] = store.inventory.get(k) ?? 0; store.inventory.set(k, 0); }
  const tile = graph.tiles().find((t) => !t.capitalBase && !t.buildingId && !t.underConstruction && !t.pendingBuild && evaluatePlacement(t, b, { techSystem: K.techSystem, planet: colony.planet }).ok);
  const key = graph.idOf(tile);
  quiet(() => EventBus.emit('planet:buildRequest', { tile, buildingId: b.id }));
  for (const [k, v] of Object.entries(saved)) store.inventory.set(k, v + 5000);
  quiet(() => bSys._tickPendingQueue());
  if (sync) quiet(() => SYNC.syncTileBuildings(bSys._grid ?? colony.grid, bSys));
  const stale = !!tile.pendingBuild && !tile.underConstruction;
  const started = bSys._constructionQueue.has(key);
  const fe0 = store.inventory.get('Fe') ?? 0;
  const events = []; const onRes = (e) => events.push(!!e.success); EventBus.on('planet:demolishResult', onRes);
  let ret; quiet(() => { ret = bSys.cancelConstruction(key); });
  const none = quiet(() => bSys.cancelConstruction('no-such-tile'));
  EventBus.off?.('planet:demolishResult', onRes);
  return { started, stale, ret, still: bSys._constructionQueue.has(key), refund: (store.inventory.get('Fe') ?? 0) - fe0, expected: Math.floor((b.cost?.Fe ?? 0) * 0.5),
    tileClear: !tile.underConstruction && !tile.pendingBuild, events, none };
}
for (const flagOn of [true, false]) {
  let r = null, err = null;
  try { r = run789(flagOn); } catch (e) { err = e; }
  assert(r && r.started && r.stale && r.ret === true && r.still === false && r.refund === r.expected && r.expected > 0 && r.tileClear && same(r.events, [true]),
    `P2${flagOn ? 'a' : 'b'} flag ${flagOn ? 'ON (geo)' : 'OFF (flat)'}: stale tile (pendingBuild left by the pending queue) → cancelConstruction takes the queue entry, removes the construction and refunds half (${r?.refund ?? '?'} / ${r?.expected ?? '?'})${err ? ' — ' + err.message : ''}`);
}
{
  let r = null, err = null;
  try { r = run789(true, { sync: true }); } catch (e) { err = e; }
  assert(r && r.started && !r.stale && r.ret === true && r.still === false && r.refund === r.expected && r.none === false,
    `P2c control: a synced tile (colony window open) cancels as before; an unknown tile key returns false${err ? ' — ' + err.message : ''}`);
}
GAME_CONFIG.FEATURES.colonySphere = false;

// ── P3 piny źródła ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nP3 source pins');
const co = src('src/ui/ColonyOverlay.js'), cv = src('src/ui/ColonyConsoleView.js'), pv = src('src/ui/ColonyConsolePages.js'), bsSrc = stripComments(src('src/systems/BuildingSystem.js'));
const cvC = stripComments(cv), pvC = stripComments(pv), coC = stripComments(co);
const dc = method(coC, '  _drawConsole(ctx, W, H, colony, grid) {');
const drawFn = method(coC, '  draw(ctx, W, H) {');
assert(pv.length > 2000 && !/_drawInfoPanel\(|consoleTab|drawLegacyTab/.test(cvC)
  && /drawCrewPage\(ov, ctx, body, roles, colony/.test(cvC) && /drawPopulationPage\(ov, ctx, body, roles, colony/.test(cvC) && /case 'station': return drawStationPage\(/.test(cvC),
'P3a the console no longer embeds the old right column: Crew / Population / Station come from ColonyConsolePages (no _drawInfoPanel / consoleTab in the console view)');
assert(dc.length > 300 && !/_drawBottomDrawer\(|_drawDraftModal\(|_drawStationPicker\(|_draftPanel\.draw\(/.test(dc)
  && /drawGroupDrawer\(this, ctx, z, roles\)/.test(dc) && /drawRecruitWindow\(this, ctx, z, roles, colony\)/.test(dc) && /drawStationPickerWindow\(this, ctx, z, roles\)/.test(dc),
'P3b _drawConsole draws the kit drawer and kit windows, never today\'s drawer / recruitment modal / station picker');
assert(drawFn.length > 500 && /this\._drawBottomDrawer\(/.test(coC) && /this\._drawDraftModal\(ctx, ox, oy, ow, oh\)/.test(drawFn) && /this\._drawStationPicker\(ctx, ox, oy, ow, oh\)/.test(drawFn)
  && /this\._drawInfoPanel\(/.test(drawFn) && drawFn.indexOf('this._drawConsole(') < drawFn.indexOf('this._drawInfoPanel('),
'P3c flat colonies keep today\'s screen: the non-console branch of draw() still draws the right column, the drawer, the recruitment modal and the station picker');
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FF}]/u;
assert(pv.length > 2000 && !EMOJI.test(pvC) && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(pvC) && !/THEME\.(accent|danger|warning|success|textPrimary|textDim|textSecondary|border)/.test(pvC)
  && !/drawStationManageCompact|drawStationPickerModal|GroundUnitPanel\b|_drawInfoSection|_drawLabeledBar|_drawBtn\(/.test(pvC),
'P3d pages in the kit idiom: no emoji, no colour literals, no non-role theme colours, none of today\'s page drawing helpers');
assert(/zone\?\.data\?\.tipLines\?\.length/.test(cvC) && /drawTipLines\(/.test(cvC) && /tipLines: tipOf\(strataTipLines\(/.test(pvC) && /'wfInfo', \{ tipLines: tipOf\(lines\) \}/.test(pvC),
'P3e the Crew tooltips (buildings of a stratum, growth and satisfaction breakdowns, target preview) are drawn by the console — they were suppressed in CS-8');
const hd = method(coC, '  _handleDraftClick(x, y) {'), hp = method(coC, '  _handleStationPickerClick(x, y) {');
assert(/zn\.type === 'cReason'/.test(hd) && /this\._showFlash\(z\.data\.tip\)/.test(hd) && /zn\.type === 'cReason'/.test(hp) && /this\._showFlash\(z\.data\.tip\)/.test(hp),
'P3f modal windows: a click on a disabled element inside the recruitment window / station picker flashes its reason (never a silent no-op)');
assert(!/window\.prompt\(/.test(coC) && /showRenameModal\(army\.name/.test(coC) && !/'Nowa nazwa armii/.test(coC) && !/this\._showFlash\('Potrzeba|`🎖 Utworzono/.test(coC),
'P3g army rename uses the game rename window (not the browser prompt); army flashes are i18n');
const cc = method(bsSrc, '  cancelConstruction(tileKey) {');
assert(/tile\.underConstruction = entry;/.test(cc) && /if \(!this\._pendingQueue\.has\(tileKey\)\) tile\.pendingBuild = null;/.test(cc) && /return !this\._constructionQueue\.has\(tileKey\);/.test(cc)
  && /colonyPages\.reason\.nothingToCancel/.test(coC),
'P3h Finding 789: cancelConstruction takes the tile state from the queue and reports the result; the console flashes a reason when nothing is left to cancel');
const cl = src('src/ui/ColonyConsoleLogic.js');
assert(/LIST_W: 236,/.test(cl) && /INSP_W: 336,/.test(cl) && /STRIP_H: 78,/.test(cl) && /PORTRAIT: 72,/.test(cl) && /const HERO_VIGNETTE = \{ alpha: 0\.62, reach: 1\.55 \};/.test(co),
'P3i D-CS-28 tuning unchanged: list 236 px, inspector 336 px, strip 78 px, portrait 72 px, hero vignette 0.62 / 1.55');
assert(/'pg_'|pageScrollKey/.test(method(coC, '  _consoleScroll(delta, x, y) {')) && /if \(pickerOn && this\._cInspector\?\.kind !== 'station'\)/.test(dc),
'P3j wheel reaches the page scroll bands; the station picker lives only while the Station page is in the inspector');

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
