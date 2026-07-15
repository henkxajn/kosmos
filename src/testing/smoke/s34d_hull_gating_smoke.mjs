// S3.4d — smoke: gating kadłubów (stocznie naziemne = tylko small; orbitalne = wszystko).
// Uruchom: node src/testing/smoke/s34d_hull_gating_smoke.mjs
// Pokrycie: G (canBuildHullAt) · P (chokepointy startShipBuild/queueStationShip) · AI (zwolnienie) ·
//           OLD (stare kolejki dokańczają) · FLEET (istniejące floty nietknięte) · UX (picker) · i18n.
// Opcja A (rewizja #2): gate WYŁĄCZNIE w 2 chokepointach (startShipBuild/queueStationShip) — brak gate fabryki.
// Audyt: docs/audits/s34d-hull-gating-audit.md

globalThis.window = globalThis.window ?? { KOSMOS: {} };
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
globalThis.window.KOSMOS.timeSystem = { gameTime: 0 };
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const { canBuildHullAt, getShipSpec } = await import('../../data/ShipBuildRules.js');
const { HULLS } = await import('../../data/HullsData.js');
const { createVessel } = await import('../../entities/Vessel.js');
const EntityManager = (await import('../../core/EntityManager.js')).default;
const EventBus = (await import('../../core/EventBus.js')).default;
const cmMod = await import('../../systems/ColonyManager.js');
const ColonyManager = cmMod.ColonyManager ?? cmMod.default;
const ssMod = await import('../../systems/StationSystem.js');
const StationSystem = ssMod.StationSystem ?? ssMod.default;
const { t } = await import('../../i18n/i18n.js');
const plDict = (await import('../../i18n/pl.js')).default;
const enDict = (await import('../../i18n/en.js')).default;

const WARSHIPS = ['hull_frigate', 'hull_destroyer', 'hull_cruiser'];
const MEDIUM_LARGE = ['hull_medium', 'hull_large'];
const ORBITAL_ONLY = [...MEDIUM_LARGE, ...WARSHIPS];
const ALL_HULLS = ['hull_small', ...ORBITAL_ONLY];

// ══ G. canBuildHullAt — reguła klasyfikacji ═════════════════════════════════════════════════════════
T('G1 hull_small budowalny na ziemi', canBuildHullAt('hull_small', 'ground') === true);
T('G2 medium+/wojenne NIE na ziemi', ORBITAL_ONLY.every(h => canBuildHullAt(h, 'ground') === false));
T('G2b hull_frigate (size:small ale wojenny) NIE na ziemi', canBuildHullAt('hull_frigate', 'ground') === false);
T('G3 wszystkie kadłuby budowalne na orbicie', ALL_HULLS.every(h => canBuildHullAt(h, 'orbital') === true));
T('G5 nieznany kadłub: ground=false (default-deny), orbital=true',
  canBuildHullAt('nieistniejacy_hull', 'ground') === false && canBuildHullAt('nieistniejacy_hull', 'orbital') === true);
T('G5b getShipSpec(nieznany)=null', getShipSpec('nieistniejacy_hull') === null);
// Integralność danych (Krok 1): flaga tylko na hull_small
T('G6 dane: hull_small.groundBuildable===true', HULLS.hull_small.groundBuildable === true);
T('G6b dane: pozostałe 5 kadłubów bez groundBuildable', ORBITAL_ONLY.every(h => HULLS[h].groundBuildable !== true));

// ══ Wspólny setup: ColonyManager z kolonią gracza + kolonią AI (bogate zasoby, fake stocznia Lv1) ════
function makeFakeRS(init = {}) {
  const inv = new Map(Object.entries(init));
  return {
    inventory: inv,
    getAmount: (id) => inv.get(id) ?? 0,
    canAfford: (costs) => Object.entries(costs).every(([k, v]) => (inv.get(k) ?? 0) >= v),
    spend: (costs) => { for (const [k, v] of Object.entries(costs)) inv.set(k, (inv.get(k) ?? 0) - v); return true; },
    receive: (g) => { for (const [k, v] of Object.entries(g)) inv.set(k, (inv.get(k) ?? 0) + v); },
  };
}
const RICH = { Fe: 1e6, Ti: 1e6, Cu: 1e6, Hv: 1e6, Si: 1e6, Xe: 1e6,
  structural_alloys: 1e5, reactive_armor: 1e5, electronic_systems: 1e5, pressure_modules: 1e5, polymer_composites: 1e5, power_cells: 1e5 };
function makeColony(planetId, ownerEmpireId = null) {
  return {
    planetId, ownerEmpireId,
    shipQueues: [], pendingShipOrders: [],
    _cachedShipyardLevel: 1, _shipyardLevelDirty: false,   // fake stocznia Lv1 (omija BuildingSystem)
    resourceSystem: makeFakeRS(RICH),
    civSystem: { freePops: 100, lockPops() {}, convertToStrata() {}, unlockPops() {} },
  };
}
const techMock = { isResearched: () => true };
const cm = new ColonyManager(techMock);
const pcol = makeColony('pcol', null);          // gracz
const acol = makeColony('acol', 'empire_x');    // AI
cm._colonies.set('pcol', pcol);
cm._colonies.set('acol', acol);

// ══ P. Chokepoint NAZIEMNY — ColonyManager.startShipBuild ════════════════════════════════════════════
const r_cruiser = cm.startShipBuild('pcol', 'hull_cruiser');
T('P1 gracz+cruiser na kolonii → odrzucone', r_cruiser.ok === false);
T('P1b powód = fleet.requiresOrbitalShipyard', r_cruiser.reason === t('fleet.requiresOrbitalShipyard'));
pcol.shipQueues.length = 0;   // reset po ewentualnej próbie
const r_small = cm.startShipBuild('pcol', 'hull_small');
T('P2 gracz+hull_small na kolonii → OK (facility gate przepuszcza)', r_small.ok === true);
T('P2b hull_small NIE dostał powodu orbitalnego', r_small.reason !== t('fleet.requiresOrbitalShipyard'));

// ══ AI. Zwolnienie z gatingu — kolonia AI buduje cokolwiek ═══════════════════════════════════════════
const r_ai = cm.startShipBuild('acol', 'hull_cruiser');
T('AI1 kolonia AI+cruiser → NIE zablokowana facility-gate', r_ai.reason !== t('fleet.requiresOrbitalShipyard'));
T('AI1b kolonia AI+cruiser → ok (buduje po staremu)', r_ai.ok === true);
acol.shipQueues.length = 0;   // zwolnij slot stoczni (AI1 zajął go cruiserem)
const r_ai_small = cm.startShipBuild('acol', 'hull_small');
T('AI2 kurier AI hull_small → ok', r_ai_small.ok === true);

// ══ P3. Chokepoint ORBITALNY — StationSystem.queueStationShip (stacja buduje wszystko) ═══════════════
const fakeStation = { id: 'st_s34d', type: 'station', hasActiveShipyard: true, shipQueues: [],
  depot: { spend: () => true, getAmount: () => 1e6 } };
EntityManager.add(fakeStation);
window.KOSMOS.techSystem = { isResearched: () => true };
const stSys = new StationSystem();
const r_station = stSys.queueStationShip('st_s34d', 'hull_cruiser');
T('P3 stacja buduje cruiser (orbital=wszystko)', r_station.ok === true);
T('P3b stacja NIGDY nie zwraca facility_restricted (martwa gałąź)', r_station.reason !== 'facility_restricted');

// ══ OLD. Stare kolejki/pending DOKAŃCZAJĄ (gate tylko przy enqueue) ══════════════════════════════════
const cm2 = new ColonyManager(techMock);
const oldcol = makeColony('oldcol', null);
oldcol.shipQueues = [{ shipId: 'hull_cruiser', progress: 15, buildTime: 15, modules: [] }];   // sprzed gate
cm2._colonies.set('oldcol', oldcol);
let completed = null;
const off = EventBus.on('fleet:shipCompleted', (e) => { completed = e; });
cm2._tickShipBuilds(0.1);
T('OLD1 stara kolejka hull_cruiser → dokończona (fleet:shipCompleted)', completed?.shipId === 'hull_cruiser');
T('OLD1b kolejka opróżniona po ukończeniu', oldcol.shipQueues.length === 0);
if (typeof off === 'function') off();

const oldcol2 = makeColony('oldcol2', null);
oldcol2.pendingShipOrders = [{ id: 'pso_old', shipId: 'hull_medium', cost: {}, crewCost: 0, modules: [] }];
cm2._colonies.set('oldcol2', oldcol2);
cm2._tickPendingShipOrders();
T('OLD2 stare pending hull_medium → awansuje do shipQueues (bez re-checku kadłuba)',
  oldcol2.shipQueues.some(q => q.shipId === 'hull_medium'));
T('OLD2b pending opróżnione po awansie', oldcol2.pendingShipOrders.length === 0);

// ══ FLEET. Istniejące floty nietknięte — gate TYLKO w chokepointach (enqueue), NIE w fabryce ════════
const restored = createVessel('hull_cruiser', 'pcol');   // spawn/restore dowolnego kadłuba — brak gate fabryki (Opcja A)
T('FLEET1 spawn/restore cruiser materializuje się (gate nie rusza fabryki ani floty)', !!restored && restored.shipId === 'hull_cruiser');

// ══ UX. Logika pickera kolonijnego (canBuildFacility → canClick) ═════════════════════════════════════
T('UX1 picker: cruiser w kolonii canBuildFacility=false (→ canClick false, widoczny+locked)',
  canBuildHullAt('hull_cruiser', 'ground') === false);
T('UX1b picker: hull_small canBuildFacility=true (klikalny)', canBuildHullAt('hull_small', 'ground') === true);

// ══ i18n ════════════════════════════════════════════════════════════════════════════════════════════
T('i18n PL: fleet.requiresOrbitalShipyard obecny',
  typeof plDict['fleet.requiresOrbitalShipyard'] === 'string' && plDict['fleet.requiresOrbitalShipyard'].length > 0);
T('i18n EN: fleet.requiresOrbitalShipyard obecny',
  typeof enDict['fleet.requiresOrbitalShipyard'] === 'string' && enDict['fleet.requiresOrbitalShipyard'].length > 0);

console.log(`\nS3.4d (gating kadłubów) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
