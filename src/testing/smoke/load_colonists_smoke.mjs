// Load-and-hold kolonistów — smoke: akcja `load_colonists` (pre-load POP pod kolonizację cross-system).
// Uruchom: node src/testing/smoke/tmp_load_colonists_smoke.mjs
//
// Zakres:
//  1. Definicja akcji FLEET_ACTIONS.load_colonists (shape) + i18n PL (label/reasons resolvują, nie klucz).
//  2. getAvailableActions — load_colonists OBECNE dla kolonizatora (canColonize), BRAK dla passenger-only.
//  3. canExecute — bramki: happy path / nie zadokowany / zajęty / kabiny pełne / brak wolnych POPów.
//  4. Integracja loadColonists/unloadColonists — POPy fizycznie schodzą z kolonii i wracają (load-and-hold).
//     + canExecute odzwierciedla stan po załadunku (freePops=0 → reasonNoFreePops).

// ── Shim środowiska (jak inne smoki S3.4) ────────────────────────────────────
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage, KOSMOS: {} };

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const { getAvailableActions, FLEET_ACTIONS } = await import('../../data/FleetActions.js');
const { loadColonists, unloadColonists, canColonize } = await import('../../entities/Vessel.js');
const { t } = await import('../../i18n/i18n.js');

// ── Mocki world ──────────────────────────────────────────────────────────────
const colonies = new Map();
function makeColony(id, population, freePops) {
  const civSystem = {
    population, freePops,
    removePop(_strata, n) { this.population -= n; this.freePops = Math.max(0, this.freePops - n); },
    addPop(_strata, n) { this.population += n; this.freePops += n; },
  };
  const col = { id, name: id, planetId: id, fleet: [], civSystem };
  colonies.set(id, col);
  return col;
}
function makeVessel(id, { colonyId = 'home', modules = ['habitat_pod'], colonistCapacity = 5,
                          colonists = 0, state = 'docked', status = 'idle', shipId = 'hull_medium' } = {}) {
  return {
    id, shipId, name: id, colonyId, homeColonyId: colonyId, modules,
    colonistCapacity, colonists,
    position: { state, dockedAt: state === 'docked' ? colonyId : null, x: 6, y: 6 },
    status,
  };
}
globalThis.window.KOSMOS = {
  techSystem: { isResearched: () => true },
  colonyManager: { getColony: (id) => colonies.get(id) ?? null },
};
const stateFor = () => ({
  missionSystem: {},
  colonyManager: window.KOSMOS.colonyManager,
  techSystem: window.KOSMOS.techSystem,
  activePlanetId: 'home',
});
const hasAction = (acts, id) => acts.some(r => r.action?.id === id);
const findAct = (acts, id) => acts.find(r => r.action?.id === id);

// ═══════════════════════════════════════════════════════════════════════════
// 1. Definicja akcji + i18n
// ═══════════════════════════════════════════════════════════════════════════
{
  const a = FLEET_ACTIONS.load_colonists;
  T('1.1 akcja load_colonists istnieje', !!a);
  T('1.2 id = load_colonists', a?.id === 'load_colonists');
  T('1.3 requiresTarget=false (load-and-hold, bez celu)', a?.requiresTarget === false);
  T('1.4 ma canExecute + execute', typeof a?.canExecute === 'function' && typeof a?.execute === 'function');
  T('1.5 execute jest no-op (przechwytywane w overlay)', a?.execute() === undefined);
  // i18n PL (locale domyślny) — label + reasons NIE zwracają samego klucza (istnieją w słowniku).
  T('1.6 label i18n resolvuje', a?.label === 'Załaduj POP');
  T('1.7 reasonColonistCabinsFull i18n', t('fleet.reasonColonistCabinsFull') !== 'fleet.reasonColonistCabinsFull');
  T('1.8 reasonNoFreePops i18n', t('fleet.reasonNoFreePops') !== 'fleet.reasonNoFreePops');
  T('1.9 colonistsLoadedToast i18n z interpolacją', t('fleet.colonistsLoadedToast', 3, 'Zorza') === '👥 Załadowano 3 POP na Zorza');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. getAvailableActions — gate canColonize
// ═══════════════════════════════════════════════════════════════════════════
{
  makeColony('home', 5, 3);
  const colV  = makeVessel('col',  { modules: ['habitat_pod'], colonistCapacity: 5 });
  const passV = makeVessel('pass', { modules: ['passenger_module', 'passenger_module'], colonistCapacity: 2, shipId: 'hull_small' });
  const acts = getAvailableActions(colV, stateFor());
  T('2.1 kolonizator (habitat_pod): load_colonists OBECNE', hasAction(acts, 'load_colonists'));
  T('2.2 kolonizator: colonize NADAL obecne (nie ruszone)', hasAction(acts, 'colonize'));
  T('2.3 passenger-only: BRAK load_colonists (canColonize gate)', !hasAction(getAvailableActions(passV, stateFor()), 'load_colonists'));
  // Sanity: canColonize potwierdza rozróżnienie.
  T('2.4 canColonize(colV)=true', canColonize(colV) === true);
  T('2.5 canColonize(passV)=false', canColonize(passV) === false);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. canExecute — bramki
// ═══════════════════════════════════════════════════════════════════════════
{
  makeColony('home', 5, 3);
  const ce = FLEET_ACTIONS.load_colonists.canExecute;

  // Happy path — zadokowany kolonizator, wolne kabiny, kolonia z POPami.
  const okV = makeVessel('ok', { colonistCapacity: 5, colonists: 0 });
  T('3.1 docked + wolne kabiny + freePops>0 → ok:true', ce(okV, stateFor()).ok === true);

  // Nie zadokowany.
  const orbV = makeVessel('orb', { state: 'orbiting' });
  const r2 = ce(orbV, stateFor());
  T('3.2 orbiting → ok:false + reasonNotDocked', r2.ok === false && r2.reason === t('fleet.reasonNotDocked'));

  // Zajęty (na misji).
  const busyV = makeVessel('busy', { status: 'on_mission' });
  const r3 = ce(busyV, stateFor());
  T('3.3 status on_mission → ok:false + reasonBusy', r3.ok === false && r3.reason === t('fleet.reasonBusy'));

  // refueling dozwolony (jak transport_passenger).
  T('3.4 status refueling → ok:true (ładowanie POP nie koliduje z tankowaniem)',
    ce(makeVessel('rf', { status: 'refueling' }), stateFor()).ok === true);

  // Kabiny pełne.
  const fullV = makeVessel('full', { colonistCapacity: 3, colonists: 3 });
  const r5 = ce(fullV, stateFor());
  T('3.5 colonists==capacity → ok:false + reasonColonistCabinsFull', r5.ok === false && r5.reason === t('fleet.reasonColonistCabinsFull'));

  // Kolonia bez wolnych POPów.
  makeColony('dry', 1, 0);
  const dryV = makeVessel('dry_ship', { colonyId: 'dry', colonistCapacity: 5 });
  const r6 = ce(dryV, stateFor());
  T('3.6 freePops=0 → ok:false + reasonNoFreePops', r6.ok === false && r6.reason === t('fleet.reasonNoFreePops'));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Integracja loadColonists / unloadColonists (load-and-hold) + canExecute po fakcie
// ═══════════════════════════════════════════════════════════════════════════
{
  const col = makeColony('home', 6, 3);
  const v = makeVessel('hold', { colonistCapacity: 5, colonists: 0 });
  const ce = FLEET_ACTIONS.load_colonists.canExecute;

  // Załaduj 5 żądane → limit = min(5, cap 5, freePops 3) = 3.
  const loaded = loadColonists(v, 5, col.civSystem);
  T('4.1 loadColonists ładuje min(request,cap,freePops)=3', loaded === 3);
  T('4.2 vessel.colonists=3 (trzymane na pokładzie)', v.colonists === 3);
  T('4.3 kolonia: freePops 3→0, population 6→3', col.civSystem.freePops === 0 && col.civSystem.population === 3);

  // Po opróżnieniu puli POPów canExecute blokuje kolejny załadunek (freePops=0).
  const rAfter = ce(v, stateFor());
  T('4.4 po załadunku freePops=0 → canExecute reasonNoFreePops', rAfter.ok === false && rAfter.reason === t('fleet.reasonNoFreePops'));

  // Rozładunek (istniejący przycisk „Wyładuj kolonistów") zwraca POPy.
  const unloaded = unloadColonists(v, col.civSystem);
  T('4.5 unloadColonists zwraca 3', unloaded === 3);
  T('4.6 vessel.colonists=0, population 3→6', v.colonists === 0 && col.civSystem.population === 6);

  // Foreign colonize czyta vessel.colonists — potwierdź że po ponownym załadunku pole jest źródłem startPop.
  loadColonists(v, 2, col.civSystem);
  const colonistsLoaded = v.colonists ?? 0;
  const startPop = colonistsLoaded > 0 ? colonistsLoaded : Math.max(2, 2);   // wzór z VesselManager._startForeignColonize
  T('4.7 startPop = vessel.colonists po pre-load (2), nie fallback', startPop === 2 && colonistsLoaded === 2);
}

// ── Wynik ────────────────────────────────────────────────────────────────────
console.log(`\nload_colonists smoke: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
process.exit(fail ? 1 : 0);
