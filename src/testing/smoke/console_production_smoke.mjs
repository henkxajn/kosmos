// ARC KONSOLE K4 — keeper konsoli Produkcji (docs/design/CONSOLES_PLAN.md §1.2, §17; Findings 725 (część Produkcji), 732, 742).
//
// KZ-E: grupa Ekonomii jest na stałe konsolą (flaga strony usunięta, starej strony nie ma) — porównania ON == OFF zastąpione
// pinami bezwzględnymi z dzisiejszej konsoli (wartości wyliczone ze świata-atrapy poniżej).
//
// A — inwentarz stref bezwzględnie (klucz typ|akcja|towar|tier|kolonia) w każdym stanie: zakres globalny, wybór zakresu
//     rozwinięty, kolonia z wybranym towarem (odblokowany / ZABLOKOWANY / droid), bonus zapasu, zlecenie jednorazowe, zlecenie
//     droida, kolonia zakresu ≠ aktywna, stacja; skutki handlerów (metody fabryki, stan przeglądu, hover surowca).
//     Zlecenie jednorazowe = wybór towaru z listy + [ ZLEĆ JEDNORAZOWO ] (osobnego pickera nie ma).
// C — czipy: pięć stron grupy to strony zestawu (strefy konsoli); pasa subnav nie ma (także bez flag zestawu).
// F — zakres: globalnie / kolonia / placówka / stacja → encje zakresu i linie produkcji (wartości bezwzględne);
//     nazwa zakresu w nagłówku listy. 732: przy 25 zakresach każdy osiągalny z rozwiniętego wyboru.
// D — D-K-16: blok «Magazyn — poza szufladą» osiągalny na Produkcji (każda linia towarów bloku ma strefę `resource_hover`).
// B — wzory: tempo = Σ 1/timePerUnit, wejścia (na sztukę × tempo), kolejność wąskich gardeł, alerty (reguły modułu logiki,
//     lista bezwzględna ze świata-atrapy), układ bohatera (zawieranie, brak nakładania); bohater rysuje wąskie gardło w roli
//     alert; wybór towaru i zakresu zmienia widok.
// R — wyłączone akcje mają powód i18n (globalnie / stacja / placówka / zablokowana receptura), klucze PL i EN.
// N — tekst konsoli bez surowych id i snake_case (nazwy zamiast id w alertach — 725).
// S — geometria przy 1600×1041 i 1280×833; pola <input> (zlecenie jednorazowe, próg zapasu) = strefa × skala przy podmienionym
//     innerWidth; źródło: skala pól na stronie zestawu z rysunku.
// X — Finding 742: oba przełączniki eksportu konsoli zawsze niosą kolonię strefy (zakresu), nie aktywną; FactorySystem
//     z `colonyId` zmienia TĘ kolonię, bez `colonyId` — aktywną.
// L, DR — steppery minimalnego zapasu (także zablokowanych towarów) i budowa droida: zbiory bezwzględne.
//
// Bez pinów na stałych rysowania. Moduły nowe importowane dynamicznie (pin degraduje, nie przerywa).

import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { setLocale, t } from '../../i18n/i18n.js';
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const PCL = await tryImport('../../ui/ProductionConsoleLogic.js');
const EO = await tryImport('../../ui/EconomyOverlay.js');
const ECV = await tryImport('../../ui/EconomyConsoleView.js');
const CL = await tryImport('../../ui/ConsoleLayoutLogic.js');
const CPD = await tryImport('../../ui/CivPanelDrawer.js');
const ROLES = await tryImport('../../ui/ConsoleRolesLogic.js');
const FSM = await tryImport('../../systems/FactorySystem.js');
const PL = (await tryImport('../../i18n/pl.js'));
const EN = (await tryImport('../../i18n/en.js'));

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/\/\/.*$/gm, '');
setLocale('pl');
const F = GAME_CONFIG.FEATURES;
const saved = { consoleKit: F.consoleKit };
F.consoleKit = true;   // warunek bazowy (Ekonomia i tak jest konsolą bez flag — pin C5)

function recCtx() {
  const texts = [], log = [];
  const st = { canvas: { width: 1600, height: 1041 } };
  const ctx = new Proxy(st, {
    get: (o, k) => {
      if (k === 'fillText') return (s, x, y) => { texts.push(String(s)); log.push(['fillText', String(s), x, y, o.fillStyle]); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      if (k === 'getImageData') return () => ({ data: [] });
      if (k in o) return o[k];
      return (...a) => { log.push([String(k), ...a]); };
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { ctx, texts, log };
}

// ── świat-atrapa: kolonie z fabrykami, placówka, stacja-sierota ──
const goods = Object.values(COMMODITIES);
const NON_DROID = goods.filter((d) => !d.isDroidUnit && d.recipe);
const G_RUN = NON_DROID.find((d) => !d.requiresTech && Object.keys(d.recipe).length >= 2);      // produkuje
const G_STALL = NON_DROID.find((d) => !d.requiresTech && d !== G_RUN);                          // stoi (brak surowca)
const G_CONS = goods.find((d) => d.isConsumerGood && !d.requiresTech) ?? NON_DROID[2];          // zapotrzebowanie konsumpcji
const G_LOCK = NON_DROID.find((d) => d.requiresTech);                                           // zablokowany
const G_DROID = goods.find((d) => d.isDroidUnit && !d.requiresTech) ?? goods.find((d) => d.isDroidUnit);
const missRes = Object.keys(G_STALL.recipe)[0];

function makeFs({ total = 10, allocs = [], queue = [], job = null, droids = [], demand = [], enabled = true, accepted = [], prefs = null, calls }) {
  const bonus = new Map();
  let pr = prefs ?? { enabled: true, tiers: { 1: true, 2: true, 3: false, 4: false } };
  let on = enabled, oneShot = job;
  const dOrders = new Map(droids.map((d) => [d.commodityId, { qty: d.qty, produced: d.produced }]));
  return {
    mode: 'reactive', setMode() {},
    get totalPoints() { return total; },
    get usedPoints() { return allocs.reduce((s, a) => s + a.points, 0); },
    get freePoints() { return Math.max(0, total - this.usedPoints); },
    getAllocations: () => allocs.map((a) => ({ ...a })),
    getQueue: () => [...queue],
    get oneShotJob() { return oneShot ? { ...oneShot } : null; },
    setOneShotJob: (id, q) => { calls.push(['setOneShotJob', id, q]); oneShot = { commodityId: id, qty: q, produced: 0 }; },
    cancelOneShotJob: () => { calls.push(['cancelOneShotJob']); oneShot = null; },
    get droidOrders() { return [...dOrders.entries()].map(([commodityId, o]) => ({ commodityId, ...o })); },
    getDroidOrder: (id) => (dOrders.has(id) ? { commodityId: id, ...dOrders.get(id) } : null),
    setDroidOrder: (id, n) => calls.push(['setDroidOrder', id, n]),
    cancelDroidOrder: (id) => calls.push(['cancelDroidOrder', id]),
    get reactiveDemand() { return [...demand]; },
    get exportPrefs() { return { enabled: pr.enabled, tiers: { ...pr.tiers } }; },
    get acceptedOrders() { return [...accepted]; },
    isRecipeAvailable: (id) => !!COMMODITIES[id] && !COMMODITIES[id].requiresTech,
    isProductionEnabled: () => on,
    setProductionEnabled: (v) => { calls.push(['setProductionEnabled', v]); on = v; },
    getStock: () => 3,
    getDemandBonus: (id) => bonus.get(id) ?? 0,
    setDemandBonus: (id, v) => { calls.push(['setDemandBonus', id, v]); bonus.set(id, Math.max(0, v)); },
    getSafetyStockTarget: (id) => 10 + (bonus.get(id) ?? 0),
    _getScaledRecipe: (r) => r,
    _getTechBlockedIngredients: () => [],
  };
}
function resSys(inv) {
  const inventory = new Map(Object.entries(inv));
  return { inventory, energy: { brownout: false, balance: 1 }, _deltaTracker: { observedPerYear: new Map() }, getAmount: (id) => inventory.get(id) ?? 0,
    inventorySnapshot: () => ({ ...inv, _observedPerYear: {}, _energy: {} }) };
}
function makeWorld({ extraColonies = 0, active = 'col_a', droids = [] } = {}) {
  const calls = [];
  const allocRun = { commodityId: G_RUN.id, points: 2, timePerUnit: 0.4, progress: 0, pctComplete: 10, paused: false, targetQty: null, produced: 0, stallReason: null };
  const allocStall = { commodityId: G_STALL.id, points: 0, timePerUnit: Infinity, progress: 0, pctComplete: 0, paused: true, targetQty: null, produced: 0,
    stallReason: { kind: 'missing_ingredient', missing: [{ resId: missRes, need: G_STALL.recipe[missRes], have: 0 }] } };
  const fsA = makeFs({ total: 10, allocs: [allocRun, allocStall], queue: [{ commodityId: G_CONS.id, qty: 5 }],
    demand: [{ source: 'consumption', commodityId: G_CONS.id, qty: 12 }, { source: 'build', commodityId: G_RUN.id, qty: 4 }],
    droids, accepted: [{ requestId: 'r1', commodityId: G_RUN.id, qtyTotal: 8, produced: 3, requesterId: 'col_b' }], calls });
  const fsB = makeFs({ total: 4, allocs: [{ ...allocRun, points: 1, timePerUnit: 0.8 }], calls });
  const inv = { Fe: 500, C: 300, Si: 200, Cu: 100, [missRes]: 0 };
  const colA = { planetId: 'col_a', name: 'Alfa', ownerEmpireId: 'player', isOutpost: false, credits: 900, resourceSystem: resSys({ ...inv, [G_RUN.id]: 7 }), factorySystem: fsA };
  const colB = { planetId: 'col_b', name: 'Beta', ownerEmpireId: 'player', isOutpost: false, credits: 100, resourceSystem: resSys({ Fe: 20 }), factorySystem: fsB };
  // placówka w żywej grze MA factorySystem (0 FP) — sonda K4: dzisiejsza strona daje jej akcje bez skutku
  const out = { planetId: 'col_o', name: 'Placówka', ownerEmpireId: 'player', isOutpost: true, credits: 0, resourceSystem: resSys({ Si: 7 }), factorySystem: makeFs({ total: 0, calls }) };
  const cols = [colA, colB, out];
  for (let i = 0; i < extraColonies; i++) {
    cols.push({ planetId: `col_x${i}`, name: `Kolonia-${String(i).padStart(2, '0')}-Daleka`, ownerEmpireId: 'player', isOutpost: false, credits: 0,
      resourceSystem: resSys({}), factorySystem: makeFs({ total: 0, calls }) });
  }
  EntityManager.clear?.();
  EntityManager.add({ id: 'st_1', type: 'station', name: 'Orbita-9', ownerEmpireId: 'player', depotDetached: true,
    depot: { inventory: new Map([['Cu', 15], [G_RUN.id, 2]]), getAmount: () => 0 } });
  const colMgr = { getPlayerColonies: () => cols, getAllColonies: () => cols, activePlanetId: active, getColony: (id) => cols.find((c) => c.planetId === id) ?? null,
    calculateTaxIncome: () => 0, taxRate: 0.1 };
  const om = { active: 'economy', overlays: { trade: { _tab: 'trade' } }, openPanel(id) { this.active = id; } };
  window.KOSMOS = { colonyManager: colMgr, overlayManager: om, factorySystem: fsA,
    economyHistoryLog: { getYearlyHistory: () => [{ year: 10, producedTotal: 5, consumedTotal: 3, produced: { [G_RUN.id]: 5 }, consumed: {}, current: false },
      { year: 11, producedTotal: 2, consumedTotal: 1, produced: { [G_RUN.id]: 2 }, consumed: {}, current: true }] },
    productionRequestBoard: { getAvailableFor: () => [{ commodityId: G_RUN.id }] } };
  return { calls, cols, fsA, fsB, colMgr, allocRun };
}
function render({ W = 1600, H = 1041, selected = null, good = null, picker = false, scrollInsp = 0, ov = null, page = 'economy' } = {}) {
  window.KOSMOS.overlayManager.active = page;
  const o = ov ?? new EO.EconomyOverlay();
  o.visible = true;
  o._selectedColonyId = selected;
  if (good) o._prodGoodId = good;
  o._prodScopeOpen = picker;
  if (scrollInsp) o._kitScrollInsp = scrollInsp;
  const r = recCtx();
  safe(() => o.draw(r.ctx, W, H));
  return { ov: o, ...r, zones: o._hitZones ?? [], roles: ROLES ? ROLES.consoleRoles() : null };
}
const isKit = (r) => !!r?.ov?.consoleZones;
const key = (z) => [z.type, z.data?.action ?? '', z.data?.commodityId ?? z.data?.resourceId ?? '', z.data?.tier ?? '', z.type === 'colony_filter' ? String(z.data?.colonyId) : ''].join('|');
const clickZone = (r, z) => safe(() => { r.ov.handleClick(z.x + Math.min(2, z.w / 2), z.y + Math.min(2, z.h / 2)); });
const allTexts = (r) => r.texts.join(' ');

// ═══ A — inwentarz stref (bezwzględnie) ═════════════════════════════════════════════════════════════════════════
console.log('A — inwentarz stref i skutki handlerów');
try {
  const keysOf = (r, pred = () => true) => [...new Set(r.zones.filter(pred).map(key))].sort();
  const fbKeys = (r) => keysOf(r, (z) => z.type === 'factory_btn');
  const typesOf = (r) => [...new Set(r.zones.map((z) => z.type))].sort();
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const fb = (action, id = '', tier = '') => `factory_btn|${action}|${id}|${tier}|`;
  // przełącznik fabryk + eksport (włącz / 4 tiery) — w każdej kolonii z fabrykami, niezależnie od towaru
  const BASE = [fb('toggle_production'), fb('export_toggle_enabled'), ...[1, 2, 3, 4].map((n) => fb('export_toggle_tier', '', n))];
  const NO_FB = ['close', 'prod_good', 'prod_scope_toggle', 'resource_hover', 'tab', 'toggle_cat'];
  const ALL_IDS = goods.map((d) => d.id);
  const fbCols = (r) => [...new Set(r.zones.filter((z) => z.type === 'factory_btn').map((z) => z.data.colonyId))];

  // zakres globalny: lista wszystkich towarów, bez akcji fabryki (świadek: pełna lista towarów)
  makeWorld();
  const g = render({ selected: null });
  const gGoods = [...new Set(g.zones.filter((z) => z.type === 'prod_good').map((z) => z.data.commodityId))];
  assert(isKit(g) && ALL_IDS.length > 20 && same(gGoods, ALL_IDS) && same(typesOf(g), NO_FB),
    `A1 globalnie: typy stref ${typesOf(g).join(',')} (bez factory_btn), lista = wszystkie towary (${gGoods.length}/${ALL_IDS.length})`);
  const gp = render({ selected: null, picker: true });
  const cf = keysOf(gp, (z) => z.type === 'colony_filter').map((k) => k.split('|')[4]);
  assert(same(cf, ['null', 'col_a', 'col_b', 'col_o', 'st_1']) && fbKeys(gp).length === 0,
    `A2 wybór zakresu rozwinięty: colony_filter = globalnie + 3 kolonie + stacja (${cf.join(',')})`);

  // kolonia, towar odblokowany: dokładnie 9 akcji, wszystkie na kolonii zakresu
  const exRun = [...BASE, fb('demand_plus', G_RUN.id), fb('demand_set_input', G_RUN.id), fb('oneshot_pick', G_RUN.id)];
  const ra = render({ selected: 'col_a', good: G_RUN.id });
  assert(same(fbKeys(ra), exRun) && same(fbCols(ra), ['col_a']) && same(typesOf(ra), [...NO_FB, 'factory_btn']),
    `A3 col_a + ${G_RUN.id}: factory_btn = przełącznik, eksport ×5, [+] / pole minimum, zlecenie jednorazowe (${fbKeys(ra).length}: ${fbKeys(ra).map((k) => k.split('|')[1] + (k.split('|')[3] || '')).join(',')})`);
  const pa = render({ selected: 'col_a', picker: true });
  assert(same(fbKeys(pa), exRun) && keysOf(pa, (z) => z.type === 'colony_filter').length === 5, 'A3b rozwinięty wybór zakresu przy kolonii: akcje inspektora zostają (9) obok 5 zakresów');

  // bonus zapasu + zlecenie jednorazowe w toku → [ − ] i [ ANULUJ ] zamiast [ ZLEĆ ]
  const w4 = makeWorld();
  w4.fsA.setDemandBonus(G_RUN.id, 2); w4.fsA.setOneShotJob(G_RUN.id, 5); w4.calls.length = 0;
  const r4 = render({ selected: 'col_a', good: G_RUN.id });
  const ex4 = [...BASE, fb('demand_minus', G_RUN.id), fb('demand_plus', G_RUN.id), fb('demand_set_input', G_RUN.id), fb('oneshot_cancel')];
  assert(same(fbKeys(r4), ex4), `A4 bonus 2 + zlecenie jednorazowe: + [ − ] minimum, [ ANULUJ ] zamiast zlecenia (${fbKeys(r4).map((k) => k.split('|')[1]).join(',')})`);
  const minus = r4.zones.find((z) => z.data?.action === 'demand_minus');
  if (minus) clickZone(r4, minus);
  assert(w4.calls.some((c) => c[0] === 'setDemandBonus' && c[1] === G_RUN.id && c[2] === 1) && w4.fsA.getDemandBonus(G_RUN.id) === 1, 'A5 klik [ − ] → setDemandBonus(towar, 2 − 1)');
  const osc = r4.zones.find((z) => z.data?.action === 'oneshot_cancel');
  if (osc) clickZone(r4, osc);
  assert(w4.calls.some((c) => c[0] === 'cancelOneShotJob') && w4.fsA.oneShotJob === null, 'A6 klik [ ANULUJ ] → cancelOneShotJob');

  // towar ZABLOKOWANY: tylko [ + ] minimum (bez pola wartości i bez zlecenia); z bonusem — także [ − ]
  makeWorld();
  const rl = render({ selected: 'col_a', good: G_LOCK.id });
  assert(!!G_LOCK && same(fbKeys(rl), [...BASE, fb('demand_plus', G_LOCK.id)]), `A7 zablokowany ${G_LOCK?.id}: przełącznik, eksport ×5 i [ + ] minimum — bez pola wartości i zlecenia (${fbKeys(rl).length})`);
  const wl = makeWorld();
  wl.fsA.setDemandBonus(G_LOCK.id, 1);
  const rl2 = render({ selected: 'col_a', good: G_LOCK.id });
  assert(same(fbKeys(rl2), [...BASE, fb('demand_plus', G_LOCK.id), fb('demand_minus', G_LOCK.id)]), 'A8 zablokowany z bonusem 1: + [ − ] minimum');

  // droid: stepper ilości + [ ZBUDUJ ]; [ − ] dopiero przy ilości > 1; zlecenie w toku → tylko [ ANULUJ ]
  const wd = makeWorld();
  const rd = render({ selected: 'col_a', good: G_DROID.id });
  assert(!!G_DROID && same(fbKeys(rd), [...BASE, fb('droid_qty_plus', G_DROID.id), fb('droid_build', G_DROID.id)]), `A9 droid ${G_DROID?.id}: [ + ] ilości i [ ZBUDUJ ] (bez [ − ] przy 1)`);
  const bz = rd.zones.find((z) => z.data?.action === 'droid_build');
  if (bz) clickZone(rd, bz);
  assert(wd.calls.some((c) => c[0] === 'setDroidOrder' && c[1] === G_DROID.id && c[2] === 1), 'A10 [ ZBUDUJ ] bez zmiany ilości → setDroidOrder(droid, 1)');
  wd.calls.length = 0;
  let rq = render({ selected: 'col_a', good: G_DROID.id, ov: rd.ov });
  for (const act of ['droid_qty_plus', 'droid_qty_plus', 'droid_qty_minus']) {
    const z = rq.zones.find((q) => q.data?.action === act);
    if (z) clickZone(rq, z);
    rq = render({ selected: 'col_a', good: G_DROID.id, ov: rq.ov });
  }
  assert(fbKeys(rq).includes(fb('droid_qty_minus', G_DROID.id)), 'A11 ilość > 1 → strefa [ − ] ilości');
  const bz2 = rq.zones.find((z) => z.data?.action === 'droid_build');
  if (bz2) clickZone(rq, bz2);
  assert(wd.calls.some((c) => c[0] === 'setDroidOrder' && c[1] === G_DROID.id && c[2] === 2), 'A12 [ + ] [ + ] [ − ] → [ ZBUDUJ ] → setDroidOrder(droid, 2)');
  const wo = makeWorld({ droids: [{ commodityId: G_DROID.id, qty: 3, produced: 1 }] });
  const ro = render({ selected: 'col_a', good: G_DROID.id });
  assert(same(fbKeys(ro), [...BASE, fb('droid_cancel', G_DROID.id)]), 'A13 zlecenie droida w toku: tylko [ ANULUJ ] (bez stepper / budowy)');
  const dc = ro.zones.find((z) => z.data?.action === 'droid_cancel');
  if (dc) clickZone(ro, dc);
  assert(wo.calls.some((c) => c[0] === 'cancelDroidOrder' && c[1] === G_DROID.id), 'A14 klik [ ANULUJ ] droida → cancelDroidOrder(droid)');

  // kolonia zakresu ≠ aktywna: każda akcja adresuje kolonię zakresu
  makeWorld({ active: 'col_a' });
  const rb = render({ selected: 'col_b', good: G_RUN.id });
  assert(fbKeys(rb).length === 9 && same(fbCols(rb), ['col_b']), `A15 zakres Beta przy aktywnej Alfie: wszystkie ${fbKeys(rb).length} akcje niosą colonyId col_b (${fbCols(rb)})`);
  // stacja: bez akcji fabryki (świadek: lista towarów i wybór zakresu są)
  const rs = render({ selected: 'st_1', good: G_RUN.id });
  assert(isKit(rs) && same(typesOf(rs), NO_FB), `A16 stacja: typy stref ${typesOf(rs).join(',')} (bez factory_btn)`);

  // skutki handlerów: [ + ] minimum, przełącznik fabryk, wybór towaru, rozwinięcie zakresu, hover surowca
  const w = makeWorld();
  const r = render({ selected: 'col_a', good: G_RUN.id });
  const plus = r.zones.find((z) => z.type === 'factory_btn' && z.data.action === 'demand_plus' && z.data.commodityId === G_RUN.id);
  if (plus) clickZone(r, plus);
  assert(w.calls.some((c) => c[0] === 'setDemandBonus' && c[1] === G_RUN.id && c[2] === 1), 'A17 klik [ + ] minimalnego zapasu → setDemandBonus(towar, +1) na kolonii zakresu');
  const tog = r.zones.find((z) => z.type === 'factory_btn' && z.data.action === 'toggle_production');
  if (tog) clickZone(r, tog);
  assert(isKit(r) && w.calls.some((c) => c[0] === 'setProductionEnabled' && c[1] === false) && !!tog?.data?.tooltip, 'A18 przełącznik fabryk → setProductionEnabled(false); podpowiedź zostaje');
  const pg = r.zones.find((z) => z.type === 'prod_good' && z.data.commodityId === G_CONS.id);
  r.ov._kitScrollInsp = 300;
  if (pg) clickZone(r, pg);
  assert(!!pg && r.ov._prodGoodId === G_CONS.id && r.ov._kitScrollInsp === 0, 'A19 klik towaru → wybór towaru, inspektor przewinięty na górę');
  const st0 = r.zones.find((z) => z.type === 'prod_scope_toggle');
  r.ov._kitScrollList = 120;
  if (st0) clickZone(r, st0);
  const open1 = r.ov._prodScopeOpen, list1 = r.ov._kitScrollList;
  if (st0) clickZone(r, st0);
  assert(!!st0 && open1 === true && list1 === 0 && r.ov._prodScopeOpen === false, 'A20 klik wyboru zakresu → rozwija (lista od góry), drugi klik zwija');
  const rh = render({ selected: 'col_a', good: G_RUN.id });
  const hz = rh.zones.find((z) => z.type === 'resource_hover');
  if (hz) safe(() => rh.ov.handleMouseMove(hz.x + Math.min(2, hz.w / 2), hz.y + Math.min(2, hz.h / 2)));
  assert(!!hz && rh.ov._hoverResourceId === hz.data.resourceId, `A21 hover surowca → podgląd tego surowca (${hz?.data?.resourceId})`);
} catch (e) { assert(false, `A blok przerwany: ${e.message}`); }

// ═══ C — czipy i subnav ═════════════════════════════════════════════════════════════════════════════════════════
console.log('C — pięć stron zestawu, subnav');
{
  makeWorld();
  const pages = ['budget', 'economy', 'flows'].map((p) => render({ page: p }));
  assert(pages.every(isKit), 'C1 Budżet, Produkcja, Przepływy — strony zestawu (strefy konsoli)');
  const tabs = pages[1].zones.filter((z) => z.type === 'tab').map((z) => z.data.id);
  assert(JSON.stringify(tabs) === JSON.stringify(['budget', 'economy', 'trade', 'market', 'flows']), `C2 Produkcja ma pięć czipów grupy (${tabs.join(',')})`);
  assert(!!CL && CL.isKitScreen('trade', F) && CL.isKitScreen('economy', F), 'C3 Handel / Rynek (overlay trade) i Produkcja są w rejestrze ekranów zestawu');
  const ECO = ['budget', 'economy', 'trade', 'flows'];
  assert(!!CL && ECO.every((id) => CL.isKitScreen(id, {})) && CL.isKitScreen('tech', {}) === false,
    'C3b grupa Ekonomii jest ekranem zestawu bez żadnej flagi (kontrola: Technologie — nie konsola — nie)');
  if (CPD) {
    const h = (kit) => { F.consoleKit = kit; const v = ECO.map((id) => { window.KOSMOS.overlayManager.active = id; return CPD.getSubNavHeight(); }); F.consoleKit = true; return v; };
    const on = h(true), noKit = h(false);
    F.consoleKit = false; window.KOSMOS.overlayManager.active = 'tech';
    const ctrl = CPD.getSubNavHeight(); F.consoleKit = true;
    assert(on.every((v) => v === 0), `C4 brak pasa subnav nad stronami grupy Ekonomii (${on})`);
    assert(ctrl > 0 && noKit.every((v) => v === 0), `C5 bez consoleKit też brak pasa (${noKit}); świadek — Technologie (nie konsola) mają pas (${ctrl})`);
  } else assert(false, 'C4 CivPanelDrawer importuje się');
}

// ═══ F — zakres ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('F — zakres globalnie / kolonia / placówka / stacja');
try {
  // wartości ze świata-atrapy: Alfa — linia pracująca G_RUN + stojąca G_STALL; Beta — G_RUN; placówka i stacja — bez linii
  const EXPECT = {
    null: { scope: ['col_a', 'col_b', 'col_o', 'st_1'], lines: [G_RUN.id, G_STALL.id] },
    col_a: { scope: ['col_a'], lines: [G_RUN.id, G_STALL.id] },
    col_b: { scope: ['col_b'], lines: [G_RUN.id] },
    col_o: { scope: ['col_o'], lines: [] },
    st_1: { scope: ['st_1'], lines: [] },
  };
  for (const sel of [null, 'col_a', 'col_b', 'col_o', 'st_1']) {
    makeWorld();
    const ex = EXPECT[String(sel)];
    const on = render({ selected: sel });
    const onIds = (on.ov._prodRows?.active ?? []).map((r) => r.id);
    assert(isKit(on) && JSON.stringify(on.ov._prodScope) === JSON.stringify(ex.scope), `F1 ${sel ?? 'globalnie'}: encje zakresu ${JSON.stringify(on.ov._prodScope)} (oczekiwane ${ex.scope})`);
    assert(isKit(on) && Array.isArray(on.ov._prodRows?.active) && JSON.stringify([...onIds].sort()) === JSON.stringify([...ex.lines].sort()), `F2 ${sel ?? 'globalnie'}: linie produkcji [${onIds}] (oczekiwane [${ex.lines}])`);
    const name = sel ? (window.KOSMOS.colonyManager.getColony(sel)?.name ?? 'Orbita-9') : t('econ.console.prodScopeGlobal');
    assert(on.texts.some((s) => s.startsWith(t('econ.console.prodScope', name))), `F3 ${sel ?? 'globalnie'}: zakres jawnie w nagłówku listy („${t('econ.console.prodScope', name)}”)`);
  }
  // 732 — pełna lista encji w rozwiniętym wyborze
  makeWorld({ extraColonies: 21 });
  const entIds = [null, ...window.KOSMOS.colonyManager.getPlayerColonies().map((c) => c.planetId), 'st_1'];
  const seen = new Set();
  const ov = new EO.EconomyOverlay();
  for (let s = 0; s < 40; s++) {
    ov._kitScrollList = s * 60;
    const r = render({ picker: true, ov });
    for (const z of r.zones.filter((q) => q.type === 'colony_filter')) seen.add(z.data.colonyId);
  }
  assert(entIds.length === 26 && entIds.every((id) => seen.has(id)), `F5 732: rozwinięty wybór zakresu osiąga wszystkie ${entIds.length} zakresy (${seen.size})`);
  makeWorld();
  const r1 = render({ selected: null });
  const tg = r1.zones.find((z) => z.type === 'prod_scope_toggle');
  if (tg) clickZone(r1, tg);
  const r2 = render({ picker: r1.ov._prodScopeOpen, ov: r1.ov });
  const pick = r2.zones.find((z) => z.type === 'colony_filter' && z.data.colonyId === 'col_b');
  r1.ov._kitScrollList = 60;
  if (pick) clickZone(r2, pick);
  assert(!!tg && r1.ov._selectedColonyId === 'col_b' && r1.ov._prodScopeOpen === false && r1.ov._kitScrollList === 0, 'F6 klik zakresu → wybór kolonii (handler colony_filter), lista wyboru się zamyka i wraca na górę');
} catch (e) { assert(false, `F blok przerwany: ${e.message}`); }

// ═══ D — D-K-16 na Produkcji ════════════════════════════════════════════════════════════════════════════════════
console.log('D — blok magazynu na Produkcji');
{
  for (const sel of [null, 'col_a', 'st_1']) {
    makeWorld();
    const ov = new EO.EconomyOverlay();
    const seen = new Set();
    let kit = true;
    for (const sc of [0, 300, 600, 900, 1200, 5000]) {
      ov._kitScrollInsp = sc;
      const r = render({ selected: sel, ov, good: G_RUN.id });
      kit = kit && isKit(r);
      render({ selected: sel, ov });   // klamra po wysokości poprzedniej klatki
      for (const z of r.zones.filter((q) => q.type === 'resource_hover')) seen.add(z.data.resourceId);
    }
    const data = ECV ? ECV.stockBlockData(ov) : null;
    const want = data ? [...data.goods.map((g) => g.id), ...data.stations.flatMap((s) => s.lines.map((l) => l.id))] : [];
    assert(kit && want.length > 0 && want.every((id) => seen.has(id)), `D1 ${sel ?? 'globalnie'}: każda linia bloku «${t('econ.console.stockBlock')}» ma strefę na Produkcji (${want.length})`);
  }
  makeWorld();
  const fl = render({ page: 'flows' });
  assert(fl.texts.includes(t('econ.console.stockBlock').toUpperCase()) || fl.texts.some((s) => s.includes(t('econ.console.stockBlock'))), 'D2 kontrola: blok magazynu nadal na Przepływach');
}

// ═══ B — wzory łańcucha ═════════════════════════════════════════════════════════════════════════════════════════
console.log('B — łańcuch i wąskie gardło');
if (PCL) {
  const fp = { total: 10, free: 4, enabledAny: true, factories: 1 };
  const recipe = { Fe: 8, C: 4 };
  const run = [{ rate: PCL.allocRate({ points: 2, timePerUnit: 0.4 }), points: 2, colonyName: 'Alfa' }, { rate: PCL.allocRate({ points: 1, timePerUnit: 0.8 }), points: 1, colonyName: 'Beta' }];
  const m = PCL.chainModel({ id: 'x', recipe, lines: run, stock: { Fe: 100, C: 20, x: 5 }, fp, available: true });
  assert(Math.abs(m.rate - (1 / 0.4 + 1 / 0.8)) < 1e-9 && m.points === 3, `B1 tempo = Σ 1/timePerUnit (${m.rate.toFixed(3)}), FP = Σ punktów`);
  assert(PCL.allocRate({ points: 2, timePerUnit: 0.4, paused: true }) === 0 && PCL.allocRate({ points: 0, timePerUnit: 1 }) === 0, 'B2 linia stojąca / bez FP → tempo 0');
  const fe = m.inputs.find((i) => i.id === 'Fe');
  assert(fe && Math.abs(fe.perYear - 8 * m.rate) < 1e-9 && Math.abs(fe.cover - 100 / fe.perYear) < 1e-9 && fe.low === false, 'B3 wejście: na rok = ilość na sztukę × tempo; zapas na lata');
  const c = m.inputs.find((i) => i.id === 'C');
  assert(c.low === true && c.short === false && m.bottleneck === null && m.status === 'producing', 'B4 niski zapas (< 10× na sztukę) bez wąskiego gardła przy produkcji');
  const idle = PCL.chainModel({ id: 'x', recipe, lines: [], stock: { Fe: 3, C: 50 }, fp, available: true });
  assert(idle.status === 'idle' && idle.bottleneck?.kind === 'missing' && idle.bottleneck.resId === 'Fe' && idle.bottleneck.need === 8 && idle.bottleneck.have === 3,
    'B5 bezczynny: brakujące wejście (stan < ilość na sztukę) = wąskie gardło');
  const st = (kind, extra) => ({ rate: 0, points: 0, paused: true, colonyName: 'Alfa', stallReason: { kind, ...extra } });
  const s1 = PCL.chainModel({ id: 'x', recipe, lines: [st('missing_ingredient', { missing: [{ resId: 'C', need: 4, have: 1 }] }), st('tech_blocked', { blocked: [{ ingredientId: 'Fe', requiresTech: 'tx' }] })], stock: {}, fp, available: true });
  assert(s1.status === 'stalled' && s1.bottleneck?.kind === 'tech' && s1.bottleneck.resId === 'Fe' && s1.bottleneck.colonyName === 'Alfa', 'B6 linie stojące: tech przed brakiem surowca, z kolonią');
  const s2 = PCL.chainModel({ id: 'x', recipe, lines: [st('missing_ingredient', { missing: [{ resId: 'C', need: 4, have: 1 }] })], stock: {}, fp, available: true });
  assert(s2.bottleneck?.kind === 'missing' && s2.bottleneck.resId === 'C' && PCL.bottleneckInput(s2) === 'C', 'B7 brak surowca z powodu STALL → wejście-wąskie gardło');
  const order = [
    PCL.chainModel({ id: 'x', recipe, lines: [], stock: {}, fp: { ...fp, total: 0 }, available: false }).bottleneck?.kind,
    PCL.chainModel({ id: 'x', recipe, lines: [], stock: {}, fp: { ...fp, total: 0 }, available: true }).bottleneck?.kind,
    PCL.chainModel({ id: 'x', recipe, lines: [], stock: {}, fp: { ...fp, enabledAny: false }, available: true }).bottleneck?.kind,
    PCL.chainModel({ id: 'x', recipe, lines: [], stock: { Fe: 99, C: 99 }, fp: { ...fp, free: 0 }, available: true }).bottleneck?.kind,
    PCL.chainModel({ id: 'x', recipe, lines: [], stock: { Fe: 99, C: 99 }, fp, available: true }).bottleneck,
  ];
  assert(JSON.stringify(order) === JSON.stringify(['locked', 'noFactories', 'offline', 'noCapacity', null]), `B8 kolejność: zablokowana > brak fabryk > wyłączone > brak FP; bezczynny z zapasem — brak (${JSON.stringify(order)})`);
  const done = PCL.chainModel({ id: 'x', recipe, lines: [{ rate: 0, points: 1, paused: true, stallReason: { kind: 'target_done' } }], stock: { Fe: 99, C: 99 }, fp, available: true });
  assert(done.status === 'done' && done.bottleneck === null, 'B9 cel osiągnięty — nie jest wąskim gardłem');
  const tbI = PCL.chainModel({ id: 'x', recipe, lines: [], stock: { Fe: 0, C: 99 }, fp, available: true, techBlocked: [{ ingredientId: 'C', requiresTech: 'tq' }] });
  assert(tbI.bottleneck?.kind === 'tech' && tbI.bottleneck.resId === 'C' && tbI.bottleneck.tech === 'tq' && tbI.inputs.find((i) => i.id === 'C')?.tech === true,
    'B15 bezczynny: składnik zablokowany technologią przed brakującym surowcem');
  // alerty: lista bezwzględna ze świata-atrapy (receptura G_RUN = Fe 8, C 4; Alfa ma C = 0 → niski C; linia G_STALL stoi
  // z powodu braku C; Beta ma Fe 20 < 80 → niski Fe, do tego brownout; placówka pominięta)
  makeWorld();
  window.KOSMOS.colonyManager.getPlayerColonies()[1].resourceSystem.energy.brownout = true;
  const neu = PCL.productionAlerts(window.KOSMOS.colonyManager.getPlayerColonies());
  const want = [
    { level: 'warning', kind: 'low', commodityId: G_RUN.id, resId: 'C', colonyId: 'col_a', colonyName: 'Alfa' },
    { level: 'critical', kind: 'stall', commodityId: G_STALL.id, resId: missRes, colonyId: 'col_a', colonyName: 'Alfa' },
    { level: 'warning', kind: 'low', commodityId: G_RUN.id, resId: 'Fe', colonyId: 'col_b', colonyName: 'Beta' },
    { level: 'critical', kind: 'brownout', colonyId: 'col_b', colonyName: 'Beta' },
  ];
  assert(JSON.stringify(G_RUN.recipe) === JSON.stringify({ Fe: 8, C: 4 }) && missRes === 'C' && JSON.stringify(neu) === JSON.stringify(want),
    `B10 alerty: niski zapas (ostrzeżenie), linia stojąca i brownout (krytyczne), placówka pominięta (${neu.map((a) => a.level + ':' + a.kind + ':' + (a.resId ?? '')).join(', ')})`);
  assert(JSON.stringify(PCL.alertsFor(neu, G_RUN.id, new Set(['col_a'])).map((a) => a.kind)) === JSON.stringify(['low'])
    && JSON.stringify(PCL.alertsFor(neu, G_STALL.id, new Set(['col_b'])).map((a) => a.kind)) === JSON.stringify(['brownout']),
    'B10b alerty inspektora: towar + brownout, tylko kolonie zakresu');
  {
    // magazyn kolonii pełny, a silnik (magazyn puli) zgłasza brak — alert nazywa składnik z powodu STALL, nie «?»
    const rid = Object.keys(G_STALL.recipe)[1] ?? missRes;
    const col = { planetId: 'q', name: 'Q', resourceSystem: { inventory: new Map(Object.keys(G_STALL.recipe).map((k) => [k, 9999])), energy: {} },
      factorySystem: { getAllocations: () => [{ commodityId: G_STALL.id, paused: true, targetQty: null, produced: 0, stallReason: { kind: 'missing_ingredient', missing: [{ resId: rid, need: 5, have: 1 }] } }] } };
    const al = PCL.productionAlerts([col]);
    assert(al.length === 1 && al[0].resId === rid, `B16 alert STALL: składnik z powodu silnika (${al[0]?.resId}), gdy magazyn kolonii go nie pokazuje`);
  }
  // układ bohatera
  let okL = true;
  for (const r of [{ x: 300, y: 80, w: 700, h: 500 }, { x: 300, y: 80, w: 420, h: 360 }]) for (let n = 0; n <= 5; n++) {
    const L = PCL.chainHeroLayout(r, n);
    const inR = (q) => q.x >= r.x - 0.5 && q.y >= r.y - 0.5 && q.x + q.w <= r.x + r.w + 0.5 && q.y + q.h <= r.y + r.h + 0.5;
    const ov2 = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const all = [...L.inputs, L.factory, L.output, L.banner];
    if (!all.every(inR)) okL = false;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (all[i].h > 0 && all[j].h > 0 && ov2(all[i], all[j])) okL = false;
  }
  assert(okL, 'B11 układ bohatera: wejścia, fabryka, produkt, baner w prostokącie i bez nakładania (1–5 wejść, dwa rozmiary)');
  // render: wąskie gardło w roli alert, wybór zmienia widok
  makeWorld();
  const rs = render({ selected: 'col_a', good: G_STALL.id });
  const bnLine = rs.log.find((e) => e[0] === 'fillText' && String(e[1]).startsWith(t('econ.console.bottleneck').toUpperCase()));
  assert(!!bnLine && bnLine[4] === rs.roles?.alert && bnLine[1].includes(t('econ.console.prodBnMissing', '', '', '').split(' ')[0]), `B12 bohater: baner wąskiego gardła w roli alert („${bnLine?.[1]}”)`);
  const rr = render({ selected: 'col_a', good: G_RUN.id });
  const hero = (r) => r.log.filter((e) => e[0] === 'fillText' && r.ov.consoleZones?.hero && e[2] >= r.ov.consoleZones.hero.x && e[2] <= r.ov.consoleZones.hero.x + r.ov.consoleZones.hero.w && e[3] >= r.ov.consoleZones.hero.y && e[3] <= r.ov.consoleZones.hero.y + r.ov.consoleZones.hero.h).map((e) => e[1]).join('|');
  assert(hero(rs) !== hero(rr), 'B13 wybór innego towaru zmienia bohatera');
  const ra = render({ selected: null, good: G_RUN.id });
  const rb = render({ selected: 'col_b', good: G_RUN.id });
  assert(hero(ra) !== hero(rb), 'B14 zmiana zakresu zmienia bohatera (tempo / FP w zakresie)');
} else assert(false, 'B ProductionConsoleLogic importuje się');

// ═══ R — powody wyłączonych akcji ═══════════════════════════════════════════════════════════════════════════════
console.log('R — powody wyłączonych akcji');
try {
  const first = (k, ...a) => t(k, ...a).split(' ').slice(0, 3).join(' ');
  for (const [sel, k] of [[null, 'econ.console.prodGateGlobal'], ['st_1', 'econ.console.prodGateStation'], ['col_o', 'econ.console.prodGateOutpost']]) {
    makeWorld();
    const r = render({ selected: sel, good: G_RUN.id });
    const fb = r.zones.filter((z) => z.type === 'factory_btn');
    assert(fb.length === 0 && r.zones.some((z) => z.type === 'prod_good') && r.texts.some((s) => s.startsWith(first(k))), `R1 ${sel ?? 'globalnie'}: akcje wyłączone (0 stref) z powodem „${first(k)}…”`);
  }
  {
    // (R4 — świadek starej strony z akcjami placówki — usunięty w KZ-E: tej strony nie ma; R1 col_o pinuje konsolę)
    const wNo = makeWorld(); wNo.cols[1].factorySystem = null;
    const rNo = render({ selected: 'col_b', good: G_RUN.id });
    assert(!rNo.zones.some((z) => z.type === 'factory_btn') && rNo.zones.some((z) => z.type === 'prod_good') && rNo.texts.some((s) => s.startsWith(first('econ.console.prodGateNoFactory'))), 'R5 kolonia bez systemu fabryk: powód „Tu nie ma fabryk…”');
  }
  makeWorld();
  const r = render({ selected: 'col_a', good: G_LOCK?.id });
  assert(!G_LOCK || (!r.zones.some((z) => z.data?.action === 'oneshot_pick') && r.texts.some((s) => s.startsWith(first('econ.console.prodGateLocked', 'x')))),
    'R2 zablokowana receptura: brak zlecenia jednorazowego, powód „zbadaj …”');
  const keys = PCL?.PROD_REASON_KEYS ?? [];
  const plT = PL?.default ?? PL?.pl ?? PL?.PL ?? null, enT = EN?.default ?? EN?.en ?? EN?.EN ?? null;
  const plObj = plT && typeof plT === 'object' ? plT : null, enObj = enT && typeof enT === 'object' ? enT : null;
  assert(keys.length === 7 && plObj && enObj && keys.every((k) => typeof plObj[k] === 'string' && typeof enObj[k] === 'string' && plObj[k] !== enObj[k]),
    `R3 klucze powodów (${keys.length}) w PL i EN`);
} catch (e) { assert(false, `R blok przerwany: ${e.message}`); }

// ═══ N — bez surowych id ════════════════════════════════════════════════════════════════════════════════════════
console.log('N — bez surowych id');
try {
  makeWorld();
  window.KOSMOS.colonyManager.getPlayerColonies()[1].resourceSystem.energy.brownout = true;
  const bad = new Set();
  let kitN = 0;
  const ids = new Set([...Object.keys(COMMODITIES)]);
  for (const sel of [null, 'col_a', 'st_1']) for (const g of [G_RUN.id, G_STALL.id, G_CONS.id, G_LOCK?.id, G_DROID?.id].filter(Boolean)) for (const sc of [0, 600]) {
    const r = render({ selected: sel, good: g, scrollInsp: sc });
    if (isKit(r)) kitN++;
    for (const s of r.texts) {
      if (/\b[a-z]+_[a-z0-9_]+\b/.test(s) || ids.has(s.trim())) bad.add(s);
    }
  }
  assert(kitN > 0 && bad.size === 0, `N1 tekst konsoli Produkcji bez snake_case / id (${[...bad].slice(0, 4).join(' | ')})`);
  const r = render({ selected: 'col_a', good: G_STALL.id });
  const rn = typeof ECV?.resName === 'function' ? ECV.resName(missRes) : missRes;
  const stallTxt = t('econ.console.prodAlertStall', 'Alfa', rn);
  const rB = render({ selected: 'col_b', good: G_STALL.id });
  assert(r.texts.includes(stallTxt) && !rB.texts.includes(stallTxt), 'N3 alerty inspektora tylko z kolonii zakresu (Alfa: jest; zakres Beta: brak)');
  assert(rn !== missRes && r.texts.some((s) => s.startsWith(t('econ.console.prodAlertStall', 'Alfa', rn).slice(0, 20)) && s.includes(rn)), `N2 alert STALL z nazwą kolonii i surowca „${rn}” (nie id ${missRes})`);
} catch (e) { assert(false, `N blok przerwany: ${e.message}`); }

// ═══ S — geometria i pola DOM ═══════════════════════════════════════════════════════════════════════════════════
console.log('S — geometria i pola <input>');
try {
  const inside = (r, f) => r && f && r.x >= f.x - 0.5 && r.y >= f.y - 0.5 && r.x + r.w <= f.x + f.w + 0.5 && r.y + r.h <= f.y + f.h + 0.5;
  const origCreate = document.createElement;
  for (const [cw, ch] of [[1600, 1041], [1280, 833]]) {
    makeWorld();
    const vp = CL ? CL.uiViewport(cw, ch) : { scale: 1, W: 1280, H: 720 };
    const iw = window.innerWidth, ih = window.innerHeight;
    window.innerWidth = cw; window.innerHeight = ch;
    const r = render({ W: vp.W, H: vp.H, selected: 'col_a', good: G_CONS.id });
    const zz = r.ov.consoleZones;
    const ok = isKit(r) && r.zones.every((z) => inside(z, zz.frame))
      && r.zones.filter((z) => z.type === 'prod_good' && z.x < zz.hero.x).every((z) => inside(z, zz.list))
      && r.zones.filter((z) => z.type === 'factory_btn').every((z) => inside(z, zz.inspector) || inside(z, zz.strip) || inside(z, zz.list))
      && !CL.zonesOverlap(zz);
    assert(ok, `S1 ${cw}×${ch}: strefy w ramie; towary w liście; akcje w inspektorze, pasie lub (steppery) liście; strefy konsoli bez nakładania`);
    for (const action of ['oneshot_pick', 'demand_set_input']) {
      const rr = render({ W: vp.W, H: vp.H, selected: 'col_a', good: G_CONS.id });
      const z = rr.zones.find((q) => q.type === 'factory_btn' && q.data.action === action);
      window.innerWidth = 333; window.innerHeight = 222;   // handler nie może czytać okna
      document.createElement = (tag) => { const el = origCreate(tag); el.style = {}; el.focus = () => {}; el.select = () => {}; el.addEventListener = () => {}; return el; };
      const g0 = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = () => 0;
      if (z) safe(() => rr.ov.handleClick(z.x + 2, z.y + 2));
      globalThis.requestAnimationFrame = g0;
      const inp = rr.ov._minStockInput;
      document.createElement = origCreate;
      window.innerWidth = cw; window.innerHeight = ch;
      const px = (v) => `${Math.round(v * vp.scale)}px`;
      const czz = rr.ov.consoleZones ?? {};
      const ins = (z && czz.list && inside(z, czz.list) ? czz.list : czz.inspector) ?? { x: 0, y: 0, w: 0, h: 0 };
      const besideOk = action === 'oneshot_pick' ? (z?.data.boxCanvasY === z?.y && z.data.boxCanvasX >= z.x + z.w && z.data.boxCanvasX + 50 <= ins.x + ins.w)
        : (z?.data.boxCanvasX === z?.x && z?.data.boxCanvasY === z?.y);
      const okI = inp && z && besideOk && inp.style.left === px(z.data.boxCanvasX) && inp.style.top === px(z.data.boxCanvasY) && inside(z, ins);
      assert(okI, `S2 ${cw}×${ch} ${action}: <input> = strefa × skala ${vp.scale.toFixed(3)} (${inp?.style?.left},${inp?.style?.top})`);
      safe(() => rr.ov._closeMinStockInput());
    }
    window.innerWidth = iw; window.innerHeight = ih;
  }
  const s = src('../../ui/EconomyOverlay.js');
  const scaleLines = (s.match(/const SCALE = [^\n]*/g) ?? []);
  // KZ-E: strona jest zawsze konsolą — skala tylko z rysunku (bez gałęzi okna i bez usuniętego `kitPage`)
  assert(scaleLines.length >= 2 && scaleLines.every((l) => /this\._uiScale/.test(l) && !/window\.inner|kitPage/.test(l)),
    `S3 źródło: oba pola DOM biorą skalę z rysunku, bez gałęzi okna (${scaleLines.map((l) => l.trim()).join(' ; ')})`);
} catch (e) { assert(false, `S blok przerwany: ${e.message}`); }

// ═══ L — lista: zapas / minimum + steppery (bramka właściciela) ══════════════════════════════════════════════════
console.log('L — lista: zapas / minimum, steppery, droid, zablokowane');
try {
  const listZ = (r) => r.zones.filter((z) => z.type === 'factory_btn' && z.data?.src === 'list' && r.ov.consoleZones && z.x < r.ov.consoleZones.hero.x);
  const w = makeWorld();
  w.fsA.setDemandBonus(G_RUN.id, 2);
  w.fsA.setDemandBonus(G_LOCK.id, 1);
  // oczekiwane steppery listy (bezwzględnie): każdy towar nie-droid — [ + ] (także zablokowany: próg przed odkryciem);
  // pole wartości tylko odblokowanym; [ − ] tylko z bonusem (bonus mają wyłącznie G_RUN i zablokowany G_LOCK)
  const nonDroid = goods.filter((d) => !d.isDroidUnit);
  const want = new Set([
    ...nonDroid.map((d) => `demand_plus|${d.id}`),
    ...nonDroid.filter((d) => !d.requiresTech).map((d) => `demand_set_input|${d.id}`),
    `demand_minus|${G_RUN.id}`, `demand_minus|${G_LOCK.id}`,
  ]);
  const onPairs = new Set();
  const ov = new EO.EconomyOverlay();
  for (const d of goods) {
    for (let sc = 0; sc <= 600; sc += 120) {
      ov._kitScrollList = sc;
      const r = render({ selected: 'col_a', good: d.id, ov });
      for (const z of listZ(r)) onPairs.add(`${z.data.action}|${z.data.commodityId}`);
    }
  }
  const miss = [...want].filter((k) => !onPairs.has(k));
  const extra = [...onPairs].filter((k) => !want.has(k));
  const lockedPlus = nonDroid.filter((d) => d.requiresTech && onPairs.has(`demand_plus|${d.id}`)).length;
  assert(want.size > 20 && lockedPlus > 0 && miss.length === 0 && extra.length === 0,
    `L1 steppery listy = [ + ] każdego towaru (zablokowanych: ${lockedPlus}), pole wartości odblokowanych, [ − ] z bonusem (${onPairs.size}/${want.size}; brak: ${miss.slice(0, 3).join(' ; ')}; nadmiar: ${extra.slice(0, 3).join(' ; ')})`);
  const minusIds = [...onPairs].filter((k) => k.startsWith('demand_minus|'));
  assert(JSON.stringify(minusIds.sort()) === JSON.stringify([`demand_minus|${G_RUN.id}`, `demand_minus|${G_LOCK.id}`].sort()),
    `L2 [ − ] tylko z bonusem — także zablokowanemu (bonus: ${G_RUN.id}, ${G_LOCK.id}; ${minusIds})`);
  // komórka zapas / min w roli alert przy zapasie < min
  const r = render({ selected: 'col_a', good: G_RUN.id });
  const cellTxt = PCL.stockMinCell(3, 12).text;
  const cellLine = r.log.find((e) => e[0] === 'fillText' && e[2] > r.ov.consoleZones.list.x + 150 && e[2] < r.ov.consoleZones.hero.x && String(e[1]).includes('/'));
  assert(!!cellLine && cellLine[4] === r.roles.alert, `L3 kolumna «zapas / min» w roli alert, gdy zapas < min („${cellTxt}”)`);
  // hover na innym wierszu → jego steppery; klik [ + ] zmienia kolonię zakresu
  const w2 = makeWorld();
  const rB = render({ selected: 'col_b', good: G_RUN.id });
  const rowZ = rB.zones.find((z) => z.type === 'prod_good' && z.data.commodityId === G_CONS.id && z.x < rB.ov.consoleZones.hero.x);
  rB.ov._hoverZone = rowZ;
  const rB2 = render({ selected: 'col_b', good: G_RUN.id, ov: rB.ov });
  const plus = listZ(rB2).find((z) => z.data.action === 'demand_plus' && z.data.commodityId === G_CONS.id);
  assert(!!rowZ && !!plus, 'L4 wiersz pod kursorem pokazuje steppery (strefa przed strefą wiersza)');
  if (plus) clickZone(rB2, plus);
  assert(w2.fsB && w2.calls.some((c) => c[0] === 'setDemandBonus' && c[1] === G_CONS.id) && w2.fsB.getDemandBonus(G_CONS.id) === 1 && w2.fsA.getDemandBonus(G_CONS.id) === 0,
    'L5 klik [ + ] w liście → minimalny zapas kolonii zakresu (Beta), nie aktywnej');
  // zablokowany: bez stepperów nawet zaznaczony; podpowiedź z wymaganiem
  makeWorld();
  const rl = render({ selected: 'col_a', good: G_LOCK.id });
  const lz = rl.zones.find((z) => z.type === 'prod_good' && z.data.commodityId === G_LOCK.id && z.x < rl.ov.consoleZones.hero.x);
  rl.ov._hoverZone = lz;
  const rl2 = render({ selected: 'col_a', good: G_LOCK.id, ov: rl.ov });
  const lockList = listZ(rl2).filter((z) => z.data.commodityId === G_LOCK.id).map((z) => z.data.action);
  assert(lockList.includes('demand_plus') && !lockList.includes('demand_set_input')
    && String(rl2.ov._consoleTooltip?.text ?? '').includes(t('econPanel.minStockRequires', '').trim().split(' ')[0]),
    `L6 zablokowany: [ + ] min. zapasu (bez pola wartości, jak dziś) + podpowiedź z wymaganiem (${lockList})`);
  // (L7 — świadek starej tabeli z [ + ] zablokowanego — usunięty w KZ-E: strony nie ma; L1 / L6 / A7 pinują konsolę)
  // droid: znacznik «buduj»; długa nazwa ucięta → pełna w podpowiedzi
  const rd = render({ selected: 'col_a', good: G_RUN.id });
  assert(rd.texts.some((s) => s === t('econ.console.prodBuildMark') || s.includes(t('econ.console.prodBuildMark').slice(2))), 'L8 wiersz droida ma znacznik «buduj»');
} catch (e) { assert(false, `L blok przerwany: ${e.message}`); }

// ═══ I — inspektor: instrument zapas / minimum ═══════════════════════════════════════════════════════════════════
console.log('I — instrument zapas / minimum');
try {
  makeWorld();
  const r = render({ selected: 'col_a', good: G_RUN.id });
  const cell = PCL.stockMinCell(3, 10);
  const big = r.log.filter((e) => e[0] === 'fillText' && e[2] >= r.ov.consoleZones.inspector.x);
  const statusY = big.find((e) => e[1] === t('econ.console.prodStatusKey'))?.[3] ?? 0;
  const labY = big.find((e) => e[1] === t('econ.console.prodStockMin').toUpperCase())?.[3] ?? -1;
  const alertY = big.find((e) => e[1] === t('econ.console.prodAlerts', 0) || e[1] === t('econ.console.prodAlerts', 1))?.[3] ?? 99999;
  assert(labY > statusY && labY < alertY, `I1 instrument «${t('econ.console.prodStockMin')}» tuż pod Statusem (y ${statusY} < ${labY} < ${alertY})`);
  const st = r.zones.filter((z) => z.type === 'factory_btn' && /^demand_(plus|set_input)/.test(z.data.action) && z.data.commodityId === G_RUN.id && z.x >= r.ov.consoleZones.inspector.x);
  assert(st.length >= 2 && st.every((z) => Math.abs(z.y - (labY + 20)) < 60), `I2 steppery obok instrumentu (${st.length})`);
  assert(cell.text === '3 / 10' && cell.tone === 'alert' && PCL.stockMinCell(12, 10).tone === 'primary' && PCL.stockMinCell(5, null).text === '5', 'I3 komórka: «zapas / min», alert przy zapasie < min, bez min — sam zapas');
} catch (e) { assert(false, `I blok przerwany: ${e.message}`); }

// ═══ H — bohater w trzech pasmach, «+1» ═════════════════════════════════════════════════════════════════════════
console.log('H — pasma bohatera i «+1»');
try {
  const r0 = { x: 300, y: 80, w: 700, h: 560 };
  const B = PCL.heroBands(r0);
  const inR = (q) => q.x >= r0.x && q.y >= r0.y && q.x + q.w <= r0.x + r0.w && q.y + q.h <= r0.y + r0.h + 0.5;
  assert([B.now, B.chain, B.foot].every(inR) && B.now.y + B.now.h <= B.chain.y && B.chain.y + B.chain.h <= B.foot.y && B.now.h > r0.h * 0.25 && B.foot.h > r0.h * 0.2,
    'H1 trzy pasma z góry na dół, w prostokącie, bez nakładania, mniej więcej tercje');
  makeWorld();
  const r = render({ selected: null, good: G_CONS.id });
  const b = r.ov._prodBands;
  const nowZ = r.zones.filter((z) => z.type === 'prod_good' && b && z.x >= b.now.x && z.y >= b.now.y && z.y + z.h <= b.now.y + b.now.h + 0.5);
  const lines = PCL.productionLines(window.KOSMOS.colonyManager.getPlayerColonies());
  assert(nowZ.length === lines.length && lines.length >= 3, `H2 «Produkcja teraz»: wiersz na każdą linię zakresu (${nowZ.length}/${lines.length})`);
  const stallTxt = r.log.find((e) => e[0] === 'fillText' && b && e[3] >= b.now.y && e[3] <= b.now.y + b.now.h && e[4] === r.roles.alert);
  assert(!!stallTxt, `H3 linia stojąca: powód w roli alert („${stallTxt?.[1]}”)`);
  if (nowZ[0]) clickZone(r, nowZ[0]);
  assert(r.ov._prodGoodId === nowZ[0]?.data.commodityId, 'H4 klik linii = wybór towaru');
  const q = r.log.filter((e) => e[0] === 'fillText' && String(e[1]).endsWith(' · Alfa') && b && e[3] > b.chain.y + b.chain.h);
  assert(q.length > 0 && !!b && q.every((e) => e[3] >= b.foot.y && e[3] <= b.foot.y + b.foot.h && e[2] >= b.foot.x - 1),
    'H5 kolejka i zlecenia w dolnym paśmie bohatera (nie w pasie)');
  const chartLab = r.texts.filter((s) => s === t('econ.console.prodChart').toUpperCase()).length;
  const trendLab = r.texts.filter((s) => s === t('econ.console.prodTrend').toUpperCase()).length;
  assert(chartLab === 1 && trendLab === 1 && t('econ.console.prodChart') !== t('econ.console.prodTrend'), `H6 jeden wykres 10 lat w pasie i osobny trend towaru w inspektorze (${chartLab}, ${trendLab})`);
  // «+1»: wykrycie ukończenia; pauza = statycznie
  const L0 = [{ colonyId: 'a', commodityId: 'x', pct: 0.8, produced: 3 }];
  const m0 = PCL.pulseTick({}, L0, 1000);
  const m1 = PCL.pulseTick(m0, [{ ...L0[0], pct: 0.1, produced: 4 }], 1100);
  const m2 = PCL.pulseTick(m1, [{ ...L0[0], pct: 0.1, produced: 4 }], 1200);
  const m3 = PCL.pulseTick(m0, L0, 1100);
  assert(m0['a|x'].pulseAt === null && m1['a|x'].pulseAt === 1100 && m2['a|x'].pulseAt === 1100 && m3['a|x'].pulseAt === null, 'H7 «+1»: ukończona sztuka (licznik / zawinięcie) → błysk; ten sam stan → bez nowego błysku');
  assert(PCL.pulseAlpha(m1['a|x'], 1100) === 1 && PCL.pulseAlpha(m1['a|x'], 1100 + PCL.PULSE_MS) === 0 && PCL.pulseAlpha(m3['a|x'], 1200) === 0, 'H8 błysk gaśnie po PULSE_MS');
  const wrapOnly = PCL.pulseTick(m0, [{ ...L0[0], pct: 0.05, produced: 3 }], 1300);
  assert(wrapOnly['a|x'].pulseAt === 1300, 'H9 zawinięcie postępu bez licznika też jest ukończeniem');
  {
    const wp = makeWorld();
    const ovp = new EO.EconomyOverlay();
    const p0 = render({ selected: 'col_a', good: G_RUN.id, ov: ovp });
    const plus0 = p0.texts.filter((s) => s === '+1').length;
    wp.allocRun.produced += 1;   // silnik ukończył sztukę między klatkami
    const p1 = render({ selected: 'col_a', good: G_RUN.id, ov: ovp });
    const p2 = render({ selected: 'col_a', good: G_RUN.id, ov: ovp });
    assert(plus0 === 0 && p1.texts.includes('+1') && p2.texts.includes('+1'), 'H11 render: ukończona sztuka → «+1» przy pasku linii (i trwa w kolejnych klatkach do wygaśnięcia)');
  }
  {
    // linia stojąca nigdy nie wygląda na pracującą: pasek zatrzymany (0) w roli alert, bez błysku — nawet przy pełnym postępie i świeżym błysku
    const st = { colonyId: 'a', commodityId: 'x', pct: 1, produced: 5, paused: true, stallReason: { kind: 'missing_ingredient', missing: [] } };
    const hot = { pulseAt: 1000 };
    const b = PCL.nowBarState(st, hot, 1001);
    const run = PCL.nowBarState({ ...st, paused: false, stallReason: null, pct: 0.4 }, hot, 1001);
    assert(b.frac === 0 && b.tone === 'alert' && b.pulse === 0 && run.frac === 0.4 && run.tone === 'primary' && run.pulse > 0.9,
      'H12 stojąca linia: pasek 0 w roli alert, bez «+1»; produkująca: postęp i błysk');
    const m0 = PCL.pulseTick({}, [{ ...st, pct: 0.9, produced: 4 }], 1000);
    const m1 = PCL.pulseTick(m0, [st], 1100);
    assert(m1['a|x'].pulseAt === null, 'H13 stojąca linia: zmiana licznika / postępu nie zapala «+1»');
  }
  const sv = src('../../ui/ProductionConsoleView.js');
  assert(!/requestAnimationFrame|_dirty\s*=|setInterval|setTimeout/.test(sv), 'H10 źródło: animacja bez własnych klatek (bez rAF / _dirty / timerów) — kadencja UI');
} catch (e) { assert(false, `H blok przerwany: ${e.message}`); }

// ═══ DR — budowa droida ══════════════════════════════════════════════════════════════════════════════════════════
console.log('DR — budowa droida');
try {
  const droids = goods.filter((d) => d.isDroidUnit);
  makeWorld();
  // oczekiwane: [ ZBUDUJ ] ma każdy droid bez wymogu technologii (atrapa: receptura dostępna ⇔ brak requiresTech)
  const wantB = droids.filter((d) => !d.requiresTech).map((d) => d.id).sort();
  const onB = new Set();
  let ok = true;
  for (const d of droids) {
    makeWorld();
    const r = render({ selected: 'col_a', good: d.id });
    const bz = r.zones.find((z) => z.data?.action === 'droid_build');
    if (bz) {
      onB.add(d.id);
      const trendY = r.log.find((e) => e[0] === 'fillText' && e[1] === t('econ.console.prodTrend').toUpperCase())?.[3] ?? 1e9;
      if (!(bz.y < trendY && bz.h >= 26 && r.texts.includes(t('econ.console.prodDroidBuild', 1)))) ok = false;
    } else if (!r.texts.some((s) => s.startsWith(t('econ.console.prodGateLocked', '').split(' ')[0]))) ok = false;
  }
  assert(wantB.length >= 1 && droids.length > wantB.length && JSON.stringify(wantB) === JSON.stringify([...onB].sort()), `DR1 budowa droida: dostępne ${[...onB].join(',')} (oczekiwane ${wantB}; zablokowane bez przycisku)`);
  assert(ok, 'DR2 duży [ ZBUDUJ × N ] wysoko w inspektorze (nad trendem); zablokowany droid — powód z technologią');
  const w = makeWorld();
  const r = render({ selected: 'col_a', good: G_DROID.id });
  const plus = r.zones.find((z) => z.data?.action === 'droid_qty_plus');
  if (plus) clickZone(r, plus);
  const r2 = render({ selected: 'col_a', good: G_DROID.id, ov: r.ov });
  const bz = r2.zones.find((z) => z.data?.action === 'droid_build');
  if (bz) clickZone(r2, bz);
  assert(r2.texts.includes(t('econ.console.prodDroidBuild', 2)) && w.calls.some((c) => c[0] === 'setDroidOrder' && c[1] === G_DROID.id && c[2] === 2), 'DR3 [ + ] ilości → [ ZBUDUJ × 2 ] → setDroidOrder(droid, 2)');
  w.fsA._colonyCanSustainRecipe = () => false;
  const r3 = render({ selected: 'col_a', good: G_DROID.id });
  assert(!r3.zones.some((z) => z.data?.action === 'droid_build') && r3.texts.some((s) => s.startsWith(t('econ.console.prodGateDroidSource').split(' ').slice(0, 3).join(' '))), 'DR4 brak źródła składników: przycisk wyłączony z powodem (dziś zlecenie by nie ruszyło)');
  makeWorld();
  const rg = render({ selected: null, good: G_DROID.id });
  assert(!rg.zones.some((z) => z.data?.action === 'droid_build') && rg.texts.some((s) => s.startsWith(t('econ.console.prodGateGlobal').split(' ').slice(0, 2).join(' '))), 'DR5 zakres globalny: budowa wyłączona z powodem');
} catch (e) { assert(false, `DR blok przerwany: ${e.message}`); }

// ═══ X — Finding 742 ════════════════════════════════════════════════════════════════════════════════════════════
console.log('X — Finding 742: eksport adresowany do kolonii zakresu');
try {
  // ładunek ZAWSZE z kolonią strefy (zakresu), nie aktywną — oba przełączniki, w obie strony (zakres Beta / aktywna Alfa i odwrotnie)
  const seen = [];
  const hE = (e) => seen.push(['en', e]), hT = (e) => seen.push(['tier', e]);
  EventBus.on('factory:setExportEnabled', hE);
  EventBus.on('factory:setExportTier', hT);
  const clickExport = (scope, active) => {
    makeWorld({ active });
    seen.length = 0;
    const r = render({ selected: scope, good: G_RUN.id });
    const zs = r.zones.filter((q) => q.type === 'factory_btn' && /^export_toggle_/.test(q.data.action));
    for (const z of zs) clickZone(r, z);
    return { n: zs.length, got: JSON.stringify(seen.map(([k, e]) => [k, e]).sort((p, q) => JSON.stringify(p) < JSON.stringify(q) ? -1 : 1)) };
  };
  // atrapa: eksport włączony, tiery { 1: tak, 2: tak, 3: nie, 4: nie } → klik odwraca każdą wartość
  const expect = (col) => JSON.stringify([
    ['en', { enabled: false, colonyId: col }],
    ['tier', { tier: 1, enabled: false, colonyId: col }], ['tier', { tier: 2, enabled: false, colonyId: col }],
    ['tier', { tier: 3, enabled: true, colonyId: col }], ['tier', { tier: 4, enabled: true, colonyId: col }],
  ].sort((p, q) => JSON.stringify(p) < JSON.stringify(q) ? -1 : 1));
  const xb = clickExport('col_b', 'col_a');
  const xa = clickExport('col_a', 'col_b');
  EventBus.off?.('factory:setExportEnabled', hE);
  EventBus.off?.('factory:setExportTier', hT);
  assert(xb.n === 5 && xb.got === expect('col_b'), `X1 zakres Beta, aktywna Alfa: 5 przełączników eksportu → ładunki z colonyId col_b (${xb.got})`);
  assert(xa.n === 5 && xa.got === expect('col_a'), `X2 zakres Alfa, aktywna Beta: ładunki z colonyId col_a (${xa.got})`);
  // FactorySystem: adresowanie
  if (FSM?.FactorySystem) {
    const mk = (pid) => { const rs = { inventory: new Map(), _inventoryPerYear: new Map(), spend() {}, receive() {} }; const fs = safe(() => new FSM.FactorySystem(rs)); return { pid, fs }; };
    const a = mk('col_a'), b = mk('col_b');
    if (a.fs && b.fs) {
      const cols = [{ planetId: 'col_a', ownerEmpireId: 'player', factorySystem: a.fs }, { planetId: 'col_b', ownerEmpireId: 'player', factorySystem: b.fs }];
      window.KOSMOS = { ...window.KOSMOS, factorySystem: a.fs, colonyManager: { activePlanetId: 'col_a', getAllColonies: () => cols, getPlayerColonies: () => cols, getColony: (id) => cols.find((c) => c.planetId === id) } };
      const a0 = a.fs.exportPrefs.enabled, b0 = b.fs.exportPrefs.enabled;
      EventBus.emit('factory:setExportEnabled', { enabled: !b0, colonyId: 'col_b' });
      const step1 = a.fs.exportPrefs.enabled === a0 && b.fs.exportPrefs.enabled === !b0;
      EventBus.emit('factory:setExportTier', { tier: 3, enabled: true, colonyId: 'col_b' });
      const step2 = b.fs.exportPrefs.tiers[3] === true && a.fs.exportPrefs.tiers[3] !== true;
      EventBus.emit('factory:setExportEnabled', { enabled: !a0 });
      const step3 = a.fs.exportPrefs.enabled === !a0 && b.fs.exportPrefs.enabled === !b0;
      assert(step1 && step2, 'X3 FactorySystem: colonyId zmienia preferencje TEJ kolonii (nie aktywnej)');
      assert(step3, 'X4 kontrola: bez colonyId — aktywna kolonia (dzisiejsza semantyka)');
      safe(() => a.fs.dispose?.()); safe(() => b.fs.dispose?.());
    } else assert(false, 'X3 FactorySystem konstruuje się pod node');
  } else assert(false, 'X3 FactorySystem importuje się');
} catch (e) { assert(false, `X blok przerwany: ${e.message}`); }

F.consoleKit = saved.consoleKit;
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
