// ARC KONSOLE K4 — keeper konsoli Produkcji (docs/design/CONSOLES_PLAN.md §1.2, §17; Findings 725 (część Produkcji), 732, 742).
//
// A — dostępność akcji ON ⊇ OFF (inwentarz stref): każda para (typ strefy, akcja, towar, tier) strony OFF jest osiągalna na konsoli
//     (suma po wyborze każdego towaru z listy i po rozwinięciu wyboru zakresu); jedyny wyjątek — `oneshot_toggle_picker` (lista
//     towarów JEST pickerem: zlecenie jednorazowe = wybór towaru + [ ZLEĆ JEDNORAZOWO ]); skutek handlera: ta sama metoda fabryki.
// C — czipy: pięć stron grupy to strony zestawu (strefy konsoli), pasa subnav nie ma przy ON, jest przy OFF.
// F — zakres: globalnie / kolonia / placówka / stacja → te same encje i te same linie produkcji ON co dzisiejszy przegląd OFF;
//     nazwa zakresu w nagłówku listy. 732: przy 24 encjach każda osiągalna z rozwiniętego wyboru (OFF gubi nadmiar — świadek).
// D — D-K-16: blok «Magazyn — poza szufladą» osiągalny na Produkcji (każda linia towarów bloku ma strefę `resource_hover`).
// B — wzory: tempo = Σ 1/timePerUnit, wejścia (na sztukę × tempo), kolejność wąskich gardeł, alerty = reguły `_generateAlerts`,
//     układ bohatera (zawieranie, brak nakładania); bohater rysuje wąskie gardło w roli alert; wybór towaru i zakresu zmienia widok.
// R — wyłączone akcje mają powód i18n (globalnie / stacja / placówka / zablokowana receptura), klucze PL i EN.
// N — tekst konsoli bez surowych id i snake_case (nazwy zamiast id w alertach — 725).
// S — geometria przy 1600×1041 i 1280×833; pola <input> (zlecenie jednorazowe, próg zapasu) = strefa × skala przy podmienionym
//     innerWidth; źródło: skala pól na stronie zestawu z rysunku.
// X — Finding 742: przełącznik eksportu konsoli adresuje kolonię zakresu (FactorySystem z `colonyId`); bez `colonyId` — aktywna.
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
function makeWorld({ extraColonies = 0, active = 'col_a' } = {}) {
  const calls = [];
  const allocRun = { commodityId: G_RUN.id, points: 2, timePerUnit: 0.4, progress: 0, pctComplete: 10, paused: false, targetQty: null, produced: 0, stallReason: null };
  const allocStall = { commodityId: G_STALL.id, points: 0, timePerUnit: Infinity, progress: 0, pctComplete: 0, paused: true, targetQty: null, produced: 0,
    stallReason: { kind: 'missing_ingredient', missing: [{ resId: missRes, need: G_STALL.recipe[missRes], have: 0 }] } };
  const fsA = makeFs({ total: 10, allocs: [allocRun, allocStall], queue: [{ commodityId: G_CONS.id, qty: 5 }],
    demand: [{ source: 'consumption', commodityId: G_CONS.id, qty: 12 }, { source: 'build', commodityId: G_RUN.id, qty: 4 }],
    droids: G_DROID ? [] : [], accepted: [{ requestId: 'r1', commodityId: G_RUN.id, qtyTotal: 8, produced: 3, requesterId: 'col_b' }], calls });
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
function render(on, { W = 1600, H = 1041, selected = null, good = null, picker = false, oneShotPicker = false, scrollInsp = 0, ov = null, page = 'economy' } = {}) {
  setEco(on);
  window.KOSMOS.overlayManager.active = page;
  const o = ov ?? new EO.EconomyOverlay();
  o.visible = true;
  o._selectedColonyId = selected;
  if (good) o._prodGoodId = good;
  o._prodScopeOpen = picker;
  o._showOneShotPicker = oneShotPicker;
  if (scrollInsp) o._kitScrollInsp = scrollInsp;
  const r = recCtx();
  safe(() => o.draw(r.ctx, W, H));
  return { ov: o, ...r, zones: o._hitZones ?? [], roles: ROLES ? ROLES.consoleRoles() : null };
}
const isKit = (r) => !!r?.ov?.consoleZones;
const key = (z) => [z.type, z.data?.action ?? '', z.data?.commodityId ?? z.data?.resourceId ?? '', z.data?.tier ?? '', z.type === 'colony_filter' ? String(z.data?.colonyId) : ''].join('|');
const clickZone = (r, z) => safe(() => { setEco(r.ov.consoleZones ? true : false); r.ov.handleClick(z.x + Math.min(2, z.w / 2), z.y + Math.min(2, z.h / 2)); });
const allTexts = (r) => r.texts.join(' ');

// ═══ A — dostępność akcji ═══════════════════════════════════════════════════════════════════════════════════════
console.log('A — dostępność akcji ON ⊇ OFF');
try {
  makeWorld();
  const offKeys = new Set();
  for (const osp of [false, true]) for (const z of render(false, { selected: 'col_a', oneShotPicker: osp }).zones) offKeys.add(key(z));
  for (const z of render(false, { selected: null }).zones) offKeys.add(key(z));
  const onKeys = new Set();
  const onTypes = new Set();
  let kitRenders = 0;
  const ids = goods.map((d) => d.id);
  for (const g of ids) for (const sc of [0, 400, 2000]) {
    const r = render(true, { selected: 'col_a', good: g, scrollInsp: sc });
    // drugi rysunek: przewinięcie inspektora klamrowane po wysokości z poprzedniej klatki
    const r2 = sc ? render(true, { selected: 'col_a', good: g, scrollInsp: sc, ov: r.ov }) : r;
    if (isKit(r)) kitRenders++;
    for (const z of [...r.zones, ...r2.zones]) { onKeys.add(key(z)); onTypes.add(z.type); }
  }
  for (const z of render(true, { selected: 'col_a', picker: true }).zones) { onKeys.add(key(z)); onTypes.add(z.type); }
  for (const z of render(true, { selected: null, picker: true }).zones) { onKeys.add(key(z)); onTypes.add(z.type); }
  const ignore = (k) => k.startsWith('factory_btn|oneshot_toggle_picker') || k.startsWith('toggle_cat') || k.startsWith('resource_hover');
  const missing = [...offKeys].filter((k) => !ignore(k) && !onKeys.has(k));
  assert(offKeys.size > 20 && missing.length === 0, `A1 każda para (strefa, akcja, towar, tier) OFF jest osiągalna ON (${offKeys.size} par OFF; brak: ${missing.slice(0, 6).join(' ; ')})`);
  const offTypes = new Set([...offKeys].map((k) => k.split('|')[0]));
  assert(kitRenders > 0 && onTypes.has('prod_good') && [...offTypes].every((ty) => onTypes.has(ty)), `A2 typy stref OFF ⊆ ON konsoli (${[...offTypes].join(',')}; renderów konsoli ${kitRenders})`);
  const fbOff = [...offKeys].filter((k) => k.startsWith('factory_btn|')).length;
  assert(fbOff >= 30, `A3 świadek: OFF ma ${fbOff} par factory_btn (inwentarz nie jest pusty)`);
  const isPick = (k) => k.startsWith('factory_btn|oneshot_toggle_picker|');
  assert([...offKeys].some(isPick) && ![...onKeys].some(isPick), 'A4 wyjątek opisany: picker zlecenia jednorazowego tylko OFF (lista towarów jest pickerem)');
  // skutek handlera: ta sama metoda fabryki
  const w = makeWorld();
  const r = render(true, { selected: 'col_a', good: G_RUN.id });
  const plus = r.zones.find((z) => z.type === 'factory_btn' && z.data.action === 'demand_plus' && z.data.commodityId === G_RUN.id);
  if (plus) clickZone(r, plus);
  assert(w.calls.some((c) => c[0] === 'setDemandBonus' && c[1] === G_RUN.id && c[2] === 1), 'A5 klik [ + ] minimalnego zapasu → setDemandBonus(towar, +1) na kolonii zakresu');
  const tog = r.zones.find((z) => z.type === 'factory_btn' && z.data.action === 'toggle_production');
  if (tog) clickZone(r, tog);
  assert(isKit(r) && w.calls.some((c) => c[0] === 'setProductionEnabled' && c[1] === false) && !!tog?.data?.tooltip, 'A6 przełącznik fabryk → setProductionEnabled(false); podpowiedź zostaje');
  const w2 = makeWorld();
  const r2 = render(true, { selected: 'col_a', good: G_DROID?.id });
  const build = r2.zones.find((z) => z.type === 'factory_btn' && z.data.action === 'droid_build');
  if (build) clickZone(r2, build);
  assert(!!G_DROID && isKit(r2) && w2.calls.some((c) => c[0] === 'setDroidOrder' && c[1] === G_DROID.id), 'A7 droid (konsola): [ ZBUDUJ ] → setDroidOrder');
} catch (e) { assert(false, `A blok przerwany: ${e.message}`); }

// ═══ C — czipy i subnav ═════════════════════════════════════════════════════════════════════════════════════════
console.log('C — pięć stron zestawu, subnav');
{
  makeWorld();
  const pages = ['budget', 'economy', 'flows'].map((p) => render(true, { page: p }));
  assert(pages.every(isKit), 'C1 Budżet, Produkcja, Przepływy ON — strony zestawu (strefy konsoli)');
  const tabs = pages[1].zones.filter((z) => z.type === 'tab').map((z) => z.data.id);
  assert(JSON.stringify(tabs) === JSON.stringify(['budget', 'economy', 'trade', 'market', 'flows']), `C2 Produkcja ma pięć czipów grupy (${tabs.join(',')})`);
  assert(!!CL && CL.isKitScreen('trade', F) && CL.isKitScreen('economy', F), 'C3 Handel / Rynek (overlay trade) i Produkcja są w rejestrze ekranów zestawu');
  if (CPD) {
    const h = (on) => { setEco(on); return ['budget', 'economy', 'trade', 'flows'].map((id) => { window.KOSMOS.overlayManager.active = id; return CPD.getSubNavHeight(); }); };
    const on = h(true), off = h(false);
    assert(on.every((v) => v === 0), `C4 ON: brak pasa subnav nad pięcioma stronami (${on})`);
    assert(off.every((v) => v > 0), `C5 OFF: pas subnav zostaje (${off})`);
  } else assert(false, 'C4 CivPanelDrawer importuje się');
  const off = render(false);
  assert(!isKit(off) && off.zones.some((z) => z.type === 'colony_filter'), 'C6 OFF: dzisiejsza strona Produkcji (czipy colony_filter)');
}

// ═══ F — zakres ═════════════════════════════════════════════════════════════════════════════════════════════════
console.log('F — zakres globalnie / kolonia / placówka / stacja');
try {
  for (const sel of [null, 'col_a', 'col_b', 'col_o', 'st_1']) {
    makeWorld();
    const ovOff = new EO.EconomyOverlay();
    let offCols = null; const offIds = [];
    const ov0 = ovOff._drawProductionOverview.bind(ovOff), ar0 = ovOff._drawAllocRow.bind(ovOff);
    let inOv = false;
    ovOff._drawProductionOverview = (ctx, x, y, w, h, cols) => { offCols = cols.map((c) => c.planetId); inOv = true; try { return ov0(ctx, x, y, w, h, cols); } finally { inOv = false; } };
    ovOff._drawAllocRow = (ctx, x, y, w, a, col) => { if (inOv) offIds.push(a.commodityId); return ar0(ctx, x, y, w, a, col); };
    render(false, { selected: sel, ov: ovOff });
    const on = render(true, { selected: sel });
    const onIds = (on.ov._prodRows?.active ?? []).map((r) => r.id);
    assert(isKit(on) && JSON.stringify(on.ov._prodScope) === JSON.stringify(offCols), `F1 ${sel ?? 'globalnie'}: encje zakresu ON == OFF (${offCols})`);
    assert(isKit(on) && Array.isArray(on.ov._prodRows?.active) && JSON.stringify([...new Set(offIds)].sort()) === JSON.stringify([...onIds].sort()), `F2 ${sel ?? 'globalnie'}: linie produkcji ON == OFF (${[...new Set(offIds)].length})`);
    const name = sel ? (window.KOSMOS.colonyManager.getColony(sel)?.name ?? 'Orbita-9') : t('econ.console.prodScopeGlobal');
    assert(on.texts.some((s) => s.startsWith(t('econ.console.prodScope', name))), `F3 ${sel ?? 'globalnie'}: zakres jawnie w nagłówku listy („${t('econ.console.prodScope', name)}”)`);
  }
  // 732 — pełna lista encji w rozwiniętym wyborze
  makeWorld({ extraColonies: 21 });
  const entIds = [null, ...window.KOSMOS.colonyManager.getPlayerColonies().map((c) => c.planetId), 'st_1'];
  const off = render(false);
  const offF = new Set(off.zones.filter((z) => z.type === 'colony_filter').map((z) => z.data.colonyId));
  const seen = new Set();
  const ov = new EO.EconomyOverlay();
  for (let s = 0; s < 40; s++) {
    ov._kitScrollList = s * 60;
    const r = render(true, { picker: true, ov });
    for (const z of r.zones.filter((q) => q.type === 'colony_filter')) seen.add(z.data.colonyId);
  }
  assert(offF.size < entIds.length, `F4 świadek 732: dzisiejsze czipy pokazują ${offF.size} z ${entIds.length} zakresów`);
  assert(entIds.every((id) => seen.has(id)), `F5 732: rozwinięty wybór zakresu osiąga wszystkie ${entIds.length} zakresy (${seen.size})`);
  makeWorld();
  const r1 = render(true, { selected: null });
  const tg = r1.zones.find((z) => z.type === 'prod_scope_toggle');
  if (tg) clickZone(r1, tg);
  const r2 = render(true, { picker: r1.ov._prodScopeOpen, ov: r1.ov });
  const pick = r2.zones.find((z) => z.type === 'colony_filter' && z.data.colonyId === 'col_b');
  if (pick) clickZone(r2, pick);
  assert(!!tg && r1.ov._selectedColonyId === 'col_b' && r1.ov._prodScopeOpen === false, 'F6 klik zakresu → wybór kolonii (dzisiejszy handler colony_filter), lista wyboru się zamyka');
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
      const r = render(true, { selected: sel, ov, good: G_RUN.id });
      kit = kit && isKit(r);
      render(true, { selected: sel, ov });   // klamra po wysokości poprzedniej klatki
      for (const z of r.zones.filter((q) => q.type === 'resource_hover')) seen.add(z.data.resourceId);
    }
    const data = ECV ? ECV.stockBlockData(ov) : null;
    const want = data ? [...data.goods.map((g) => g.id), ...data.stations.flatMap((s) => s.lines.map((l) => l.id))] : [];
    assert(kit && want.length > 0 && want.every((id) => seen.has(id)), `D1 ${sel ?? 'globalnie'}: każda linia bloku «${t('econ.console.stockBlock')}» ma strefę na Produkcji (${want.length})`);
  }
  makeWorld();
  const fl = render(true, { page: 'flows' });
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
  // alerty = reguły dzisiejszej prawej kolumny
  makeWorld();
  window.KOSMOS.colonyManager.getPlayerColonies()[1].resourceSystem.energy.brownout = true;
  const ov = new EO.EconomyOverlay();
  const old = ov._generateAlerts();
  const neu = PCL.productionAlerts(window.KOSMOS.colonyManager.getPlayerColonies());
  assert(old.length >= 3 && JSON.stringify(old.map((a) => a.level)) === JSON.stringify(neu.map((a) => a.level)), `B10 alerty: te same reguły i poziomy co _generateAlerts (${old.length})`);
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
  const rs = render(true, { selected: 'col_a', good: G_STALL.id });
  const bnLine = rs.log.find((e) => e[0] === 'fillText' && String(e[1]).startsWith(t('econ.console.bottleneck').toUpperCase()));
  assert(!!bnLine && bnLine[4] === rs.roles?.alert && bnLine[1].includes(t('econ.console.prodBnMissing', '', '', '').split(' ')[0]), `B12 bohater: baner wąskiego gardła w roli alert („${bnLine?.[1]}”)`);
  const rr = render(true, { selected: 'col_a', good: G_RUN.id });
  const hero = (r) => r.log.filter((e) => e[0] === 'fillText' && r.ov.consoleZones?.hero && e[2] >= r.ov.consoleZones.hero.x && e[2] <= r.ov.consoleZones.hero.x + r.ov.consoleZones.hero.w && e[3] >= r.ov.consoleZones.hero.y && e[3] <= r.ov.consoleZones.hero.y + r.ov.consoleZones.hero.h).map((e) => e[1]).join('|');
  assert(hero(rs) !== hero(rr), 'B13 wybór innego towaru zmienia bohatera');
  const ra = render(true, { selected: null, good: G_RUN.id });
  const rb = render(true, { selected: 'col_b', good: G_RUN.id });
  assert(hero(ra) !== hero(rb), 'B14 zmiana zakresu zmienia bohatera (tempo / FP w zakresie)');
} else assert(false, 'B ProductionConsoleLogic importuje się');

// ═══ R — powody wyłączonych akcji ═══════════════════════════════════════════════════════════════════════════════
console.log('R — powody wyłączonych akcji');
try {
  const first = (k, ...a) => t(k, ...a).split(' ').slice(0, 3).join(' ');
  for (const [sel, k] of [[null, 'econ.console.prodGateGlobal'], ['st_1', 'econ.console.prodGateStation'], ['col_o', 'econ.console.prodGateOutpost']]) {
    makeWorld();
    const r = render(true, { selected: sel, good: G_RUN.id });
    const fb = r.zones.filter((z) => z.type === 'factory_btn');
    assert(fb.length === 0 && r.texts.some((s) => s.startsWith(first(k))), `R1 ${sel ?? 'globalnie'}: akcje wyłączone (0 stref) z powodem „${first(k)}…”`);
  }
  {
    const w0 = makeWorld();
    const offO = render(false, { selected: 'col_o' });
    const fbOff = offO.zones.filter((z) => z.type === 'factory_btn').length;
    const wNo = makeWorld(); wNo.cols[1].factorySystem = null;
    const rNo = render(true, { selected: 'col_b', good: G_RUN.id });
    assert(fbOff > 0, `R4 świadek: dzisiejsza strona daje placówce ${fbOff} akcji fabryki (bez skutku — 0 FP, bez załogi)`);
    assert(!rNo.zones.some((z) => z.type === 'factory_btn') && rNo.texts.some((s) => s.startsWith(first('econ.console.prodGateNoFactory'))), 'R5 kolonia bez systemu fabryk: powód „Tu nie ma fabryk…”');
    void w0;
  }
  makeWorld();
  const r = render(true, { selected: 'col_a', good: G_LOCK?.id });
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
    const r = render(true, { selected: sel, good: g, scrollInsp: sc });
    if (isKit(r)) kitN++;
    for (const s of r.texts) {
      if (/\b[a-z]+_[a-z0-9_]+\b/.test(s) || ids.has(s.trim())) bad.add(s);
    }
  }
  assert(kitN > 0 && bad.size === 0, `N1 tekst konsoli Produkcji bez snake_case / id (${[...bad].slice(0, 4).join(' | ')})`);
  const r = render(true, { selected: 'col_a', good: G_STALL.id });
  const rn = typeof ECV?.resName === 'function' ? ECV.resName(missRes) : missRes;
  const stallTxt = t('econ.console.prodAlertStall', 'Alfa', rn);
  const rB = render(true, { selected: 'col_b', good: G_STALL.id });
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
    const r = render(true, { W: vp.W, H: vp.H, selected: 'col_a', good: G_CONS.id });
    const zz = r.ov.consoleZones;
    const ok = isKit(r) && r.zones.every((z) => inside(z, zz.frame))
      && r.zones.filter((z) => z.type === 'prod_good' && z.x < zz.hero.x).every((z) => inside(z, zz.list))
      && r.zones.filter((z) => z.type === 'factory_btn').every((z) => inside(z, zz.inspector) || inside(z, zz.strip) || inside(z, zz.list))
      && !CL.zonesOverlap(zz);
    assert(ok, `S1 ${cw}×${ch}: strefy w ramie; towary w liście; akcje w inspektorze, pasie lub (steppery) liście; strefy konsoli bez nakładania`);
    for (const action of ['oneshot_pick', 'demand_set_input']) {
      const rr = render(true, { W: vp.W, H: vp.H, selected: 'col_a', good: G_CONS.id });
      const z = rr.zones.find((q) => q.type === 'factory_btn' && q.data.action === action);
      window.innerWidth = 333; window.innerHeight = 222;   // handler nie może czytać okna
      document.createElement = (tag) => { const el = origCreate(tag); el.style = {}; el.focus = () => {}; el.select = () => {}; el.addEventListener = () => {}; return el; };
      const g0 = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = () => 0;
      if (z) { setEco(true); safe(() => rr.ov.handleClick(z.x + 2, z.y + 2)); }
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
  assert(scaleLines.length >= 2 && scaleLines.every((l) => /kitPage\(\) \? \(this\._uiScale/.test(l)), `S3 źródło: oba pola DOM biorą skalę z rysunku na stronie zestawu (${scaleLines.length})`);
} catch (e) { assert(false, `S blok przerwany: ${e.message}`); }

// ═══ L — lista: zapas / minimum + steppery (bramka właściciela) ══════════════════════════════════════════════════
console.log('L — lista: zapas / minimum, steppery, droid, zablokowane');
try {
  const listZ = (r) => r.zones.filter((z) => z.type === 'factory_btn' && z.data?.src === 'list' && r.ov.consoleZones && z.x < r.ov.consoleZones.hero.x);
  const w = makeWorld();
  w.fsA.setDemandBonus(G_RUN.id, 2);
  // dzisiejsza tabela minimalnych zapasów (OFF, kolonia): pary stepperów odblokowanych towarów
  const off = render(false, { selected: 'col_a' });
  // dzisiejsza tabela łącznie z towarami zablokowanymi (próg ustawiany przed odkryciem)
  const isTable = (z) => z.type === 'factory_btn' && /^demand_/.test(z.data.action) && !COMMODITIES[z.data.commodityId]?.isDroidUnit;
  const offPairs = new Set(off.zones.filter(isTable).map((z) => `${z.data.action}|${z.data.commodityId}`));
  const onPairs = new Set();
  const ov = new EO.EconomyOverlay();
  for (const d of goods) {
    for (let sc = 0; sc <= 600; sc += 120) {
      ov._kitScrollList = sc;
      const r = render(true, { selected: 'col_a', good: d.id, ov });
      for (const z of listZ(r)) onPairs.add(`${z.data.action}|${z.data.commodityId}`);
    }
  }
  const miss = [...offPairs].filter((k) => !onPairs.has(k));
  const lockedPairs = [...offPairs].filter((k) => COMMODITIES[k.split('|')[1]]?.requiresTech);
  assert(offPairs.size > 20 && lockedPairs.length > 0 && miss.length === 0, `L1 każdy stepper dzisiejszej tabeli min. zapasu (z zablokowanymi: ${lockedPairs.length}) osiągalny z listy (${offPairs.size}; brak: ${miss.slice(0, 4).join(' ; ')})`);
  assert(offPairs.has(`demand_minus|${G_RUN.id}`) && onPairs.has(`demand_minus|${G_RUN.id}`), 'L2 [ − ] tylko z bonusem — w liście jak w tabeli (świadek: bonus 2)');
  // komórka zapas / min w roli alert przy zapasie < min
  const r = render(true, { selected: 'col_a', good: G_RUN.id });
  const cellTxt = PCL.stockMinCell(3, 12).text;
  const cellLine = r.log.find((e) => e[0] === 'fillText' && e[2] > r.ov.consoleZones.list.x + 150 && e[2] < r.ov.consoleZones.hero.x && String(e[1]).includes('/'));
  assert(!!cellLine && cellLine[4] === r.roles.alert, `L3 kolumna «zapas / min» w roli alert, gdy zapas < min („${cellTxt}”)`);
  // hover na innym wierszu → jego steppery; klik [ + ] zmienia kolonię zakresu
  const w2 = makeWorld();
  const rB = render(true, { selected: 'col_b', good: G_RUN.id });
  const rowZ = rB.zones.find((z) => z.type === 'prod_good' && z.data.commodityId === G_CONS.id && z.x < rB.ov.consoleZones.hero.x);
  rB.ov._hoverZone = rowZ;
  const rB2 = render(true, { selected: 'col_b', good: G_RUN.id, ov: rB.ov });
  const plus = listZ(rB2).find((z) => z.data.action === 'demand_plus' && z.data.commodityId === G_CONS.id);
  assert(!!rowZ && !!plus, 'L4 wiersz pod kursorem pokazuje steppery (strefa przed strefą wiersza)');
  if (plus) clickZone(rB2, plus);
  assert(w2.fsB && w2.calls.some((c) => c[0] === 'setDemandBonus' && c[1] === G_CONS.id) && w2.fsB.getDemandBonus(G_CONS.id) === 1 && w2.fsA.getDemandBonus(G_CONS.id) === 0,
    'L5 klik [ + ] w liście → minimalny zapas kolonii zakresu (Beta), nie aktywnej');
  // zablokowany: bez stepperów nawet zaznaczony; podpowiedź z wymaganiem
  makeWorld();
  const rl = render(true, { selected: 'col_a', good: G_LOCK.id });
  const lz = rl.zones.find((z) => z.type === 'prod_good' && z.data.commodityId === G_LOCK.id && z.x < rl.ov.consoleZones.hero.x);
  rl.ov._hoverZone = lz;
  const rl2 = render(true, { selected: 'col_a', good: G_LOCK.id, ov: rl.ov });
  const lockList = listZ(rl2).filter((z) => z.data.commodityId === G_LOCK.id).map((z) => z.data.action);
  assert(lockList.includes('demand_plus') && !lockList.includes('demand_set_input')
    && String(rl2.ov._consoleTooltip?.text ?? '').includes(t('econPanel.minStockRequires', '').trim().split(' ')[0]),
    `L6 zablokowany: [ + ] min. zapasu (bez pola wartości, jak dziś) + podpowiedź z wymaganiem (${lockList})`);
  const offL = render(false, { selected: 'col_a' });
  assert(offL.zones.some((z) => z.data?.action === 'demand_plus' && z.data.commodityId === G_LOCK.id), 'L7 świadek: dzisiejsza tabela daje [ + ] zablokowanemu towarowi');
  // droid: znacznik «buduj»; długa nazwa ucięta → pełna w podpowiedzi
  const rd = render(true, { selected: 'col_a', good: G_RUN.id });
  assert(rd.texts.some((s) => s === t('econ.console.prodBuildMark') || s.includes(t('econ.console.prodBuildMark').slice(2))), 'L8 wiersz droida ma znacznik «buduj»');
} catch (e) { assert(false, `L blok przerwany: ${e.message}`); }

// ═══ I — inspektor: instrument zapas / minimum ═══════════════════════════════════════════════════════════════════
console.log('I — instrument zapas / minimum');
try {
  makeWorld();
  const r = render(true, { selected: 'col_a', good: G_RUN.id });
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
  const r = render(true, { selected: null, good: G_CONS.id });
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
    const p0 = render(true, { selected: 'col_a', good: G_RUN.id, ov: ovp });
    const plus0 = p0.texts.filter((s) => s === '+1').length;
    wp.allocRun.produced += 1;   // silnik ukończył sztukę między klatkami
    const p1 = render(true, { selected: 'col_a', good: G_RUN.id, ov: ovp });
    const p2 = render(true, { selected: 'col_a', good: G_RUN.id, ov: ovp });
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
  const off = render(false, { selected: 'col_a' });
  const offB = new Set(off.zones.filter((z) => z.data?.action === 'droid_build').map((z) => z.data.commodityId));
  const onB = new Set();
  let ok = true;
  for (const d of droids) {
    makeWorld();
    const r = render(true, { selected: 'col_a', good: d.id });
    const bz = r.zones.find((z) => z.data?.action === 'droid_build');
    if (bz) {
      onB.add(d.id);
      const trendY = r.log.find((e) => e[0] === 'fillText' && e[1] === t('econ.console.prodTrend').toUpperCase())?.[3] ?? 1e9;
      if (!(bz.y < trendY && bz.h >= 26 && r.texts.includes(t('econ.console.prodDroidBuild', 1)))) ok = false;
    } else if (!r.texts.some((s) => s.startsWith(t('econ.console.prodGateLocked', '').split(' ')[0]))) ok = false;
  }
  assert(offB.size >= 1 && JSON.stringify([...offB].sort()) === JSON.stringify([...onB].sort()), `DR1 budowa droida ON == OFF (${[...onB].join(',')})`);
  assert(ok, 'DR2 duży [ ZBUDUJ × N ] wysoko w inspektorze (nad trendem); zablokowany droid — powód z technologią');
  const w = makeWorld();
  const r = render(true, { selected: 'col_a', good: G_DROID.id });
  const plus = r.zones.find((z) => z.data?.action === 'droid_qty_plus');
  if (plus) clickZone(r, plus);
  const r2 = render(true, { selected: 'col_a', good: G_DROID.id, ov: r.ov });
  const bz = r2.zones.find((z) => z.data?.action === 'droid_build');
  if (bz) clickZone(r2, bz);
  assert(r2.texts.includes(t('econ.console.prodDroidBuild', 2)) && w.calls.some((c) => c[0] === 'setDroidOrder' && c[1] === G_DROID.id && c[2] === 2), 'DR3 [ + ] ilości → [ ZBUDUJ × 2 ] → setDroidOrder(droid, 2)');
  w.fsA._colonyCanSustainRecipe = () => false;
  const r3 = render(true, { selected: 'col_a', good: G_DROID.id });
  assert(!r3.zones.some((z) => z.data?.action === 'droid_build') && r3.texts.some((s) => s.startsWith(t('econ.console.prodGateDroidSource').split(' ').slice(0, 3).join(' '))), 'DR4 brak źródła składników: przycisk wyłączony z powodem (dziś zlecenie by nie ruszyło)');
  makeWorld();
  const rg = render(true, { selected: null, good: G_DROID.id });
  assert(!rg.zones.some((z) => z.data?.action === 'droid_build') && rg.texts.some((s) => s.startsWith(t('econ.console.prodGateGlobal').split(' ').slice(0, 2).join(' '))), 'DR5 zakres globalny: budowa wyłączona z powodem');
} catch (e) { assert(false, `DR blok przerwany: ${e.message}`); }

// ═══ X — Finding 742 ════════════════════════════════════════════════════════════════════════════════════════════
console.log('X — Finding 742: eksport adresowany do kolonii zakresu');
try {
  const w = makeWorld({ active: 'col_a' });
  const seen = [];
  const h = (e) => seen.push(e);
  EventBus.on('factory:setExportEnabled', h);
  const r = render(true, { selected: 'col_b', good: G_RUN.id });
  const z = r.zones.find((q) => q.type === 'factory_btn' && q.data.action === 'export_toggle_enabled');
  if (z) clickZone(r, z);
  const off = render(false, { selected: 'col_b' });
  const zo = off.zones.find((q) => q.type === 'factory_btn' && q.data.action === 'export_toggle_enabled');
  if (zo) { setEco(false); safe(() => off.ov._onHit(zo)); }   // dzisiejszy handler (geometria OFF zależy od okna env)
  EventBus.off?.('factory:setExportEnabled', h);
  assert(seen[0]?.colonyId === 'col_b', `X1 konsola: zdarzenie niesie kolonię zakresu (${JSON.stringify(seen[0])})`);
  assert(seen.length === 2 && !('colonyId' in seen[1]), 'X2 kontrola — OFF: dzisiejszy ładunek bez colonyId (zachowanie bez zmian)');
  void w;
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

F.consoleKit = saved.consoleKit; F.consoleEconomy = saved.consoleEconomy;
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
