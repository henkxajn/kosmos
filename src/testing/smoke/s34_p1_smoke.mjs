// S3.4 FAZA 1 — smoke test (data + model + migracja v90). Uruchom: node tmp_s34_p1_smoke.mjs
// Pokrywa: definicje modułów, encja Station (modules/pop/popCapacity getter/pendingModuleOrders),
// StationSystem.serialize/restore round-trip, migracja v89→v90 (+ guardy), StationData.maxModules.

// Stub środowiska przeglądarki (StationSystem/SaveMigration dotykają window/localStorage).
globalThis.window = globalThis.window ?? { KOSMOS: {} };
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const {
  STATION_MODULES, stationModuleCost, createStarterModules, makeStationModule,
} = await import('../../data/StationModuleData.js');
const { STATIONS } = await import('../../data/StationData.js');
const { Station } = await import('../../entities/Station.js');
const EntityManager = (await import('../../core/EntityManager.js')).default;
const { StationSystem } = await import('../../systems/StationSystem.js');
const { migrate, CURRENT_VERSION } = await import('../../systems/SaveMigration.js');

// ── 1. Definicje modułów ─────────────────────────────────────────────────────
const IDS = ['habitat', 'power_atom', 'power_solar', 'power_fusion', 'power_solar_auto', 'shipyard', 'trade_module', 'lab'];
T('1.1 wszystkie 8 modułów obecne', IDS.every(id => STATION_MODULES[id]));
T('1.2 habitat.popCapacity=1', STATION_MODULES.habitat.popCapacity === 1);
T('1.3 trade_module.maxLevel=3', STATION_MODULES.trade_module.maxLevel === 3);
T('1.4 trade_module.tradeCapacityByLevel=[200,400,600]',
  JSON.stringify(STATION_MODULES.trade_module.tradeCapacityByLevel) === '[200,400,600]');
T('1.5 lab.researchPerYear=4', STATION_MODULES.lab.researchPerYear === 4);
T('1.6 power_fusion gate=fusion_power', STATION_MODULES.power_fusion.requires === 'fusion_power');
T('1.7 power_solar_auto gate=automation', STATION_MODULES.power_solar_auto.requires === 'automation');
T('1.8 power_atom/solar/lab bez gate (null)',
  STATION_MODULES.power_atom.requires === null && STATION_MODULES.lab.requires === null);
T('1.9 shipyard.unlocksShipyard=true', STATION_MODULES.shipyard.unlocksShipyard === true);
T('1.10 energia znaki: power_atom +6, habitat -1, shipyard -3',
  STATION_MODULES.power_atom.energy === 6 && STATION_MODULES.habitat.energy === -1 && STATION_MODULES.shipyard.energy === -3);
T('1.11 popWork: power_solar_auto=0 (roboty), trade_module=0.5',
  STATION_MODULES.power_solar_auto.popWork === 0 && STATION_MODULES.trade_module.popWork === 0.5);
T('1.12 dwujęzyczność (namePL/nameEN/descPL/descEN na każdym module)',
  IDS.every(id => STATION_MODULES[id].namePL && STATION_MODULES[id].nameEN && STATION_MODULES[id].descPL && STATION_MODULES[id].descEN));
T('1.13 buildTime w latach cyw. (2..8)', IDS.every(id => STATION_MODULES[id].buildTime >= 2 && STATION_MODULES[id].buildTime <= 8));

// stationModuleCost — płaski merge cost+commodityCost
const cH = stationModuleCost('habitat');
T('1.14 stationModuleCost(habitat) merge {Fe:400, pressure_modules:40}', cH.Fe === 400 && cH.pressure_modules === 40);
T('1.15 stationModuleCost(nieznany) = {}', Object.keys(stationModuleCost('nope')).length === 0);

// ── 2. Fabryki modułów / starter ─────────────────────────────────────────────
const sm = createStarterModules();
T('2.1 starter = 2 moduły', sm.length === 2);
T('2.2 starter = habitat + power_atom', sm[0].moduleType === 'habitat' && sm[1].moduleType === 'power_atom');
T('2.3 starter kształt {id,moduleType,level,active}', sm.every(m => m.id && m.level === 1 && m.active === true));
T('2.4 starter unikalne id', sm[0].id !== sm[1].id);
const mm = makeStationModule('trade_module', 2, false);
T('2.5 makeStationModule level/active override', mm.moduleType === 'trade_module' && mm.level === 2 && mm.active === false);

// ── 3. Encja Station: pola + popCapacity getter (dynamiczny) ──────────────────
const st = new Station({ id: 'station_test', name: 'Test', bodyId: 'planet_1', modules: createStarterModules() });
T('3.1 pop default 0', st.pop === 0);
T('3.2 pendingModuleOrders default []', Array.isArray(st.pendingModuleOrders) && st.pendingModuleOrders.length === 0);
T('3.3 popCapacity=1 (1× habitat lv1)', st.popCapacity === 1);
st.modules.push(makeStationModule('habitat', 1));
T('3.4 popCapacity=2 po dodaniu habitatu (dynamiczny)', st.popCapacity === 2);
st.modules.push(makeStationModule('power_atom', 1));
T('3.5 popCapacity nadal 2 (power_atom nie daje capacity)', st.popCapacity === 2);
const stLvl = new Station({ id: 's_lvl', modules: [makeStationModule('habitat', 2)] });
T('3.6 popCapacity=2 dla habitat lv2 (×poziom)', stLvl.popCapacity === 2);
const stEmpty = new Station({ id: 's_empty' });
T('3.7 modules/pop/popCapacity defaults dla pustej stacji', stEmpty.modules.length === 0 && stEmpty.pop === 0 && stEmpty.popCapacity === 0);

// ── 4. StationSystem.serialize / restore round-trip ──────────────────────────
EntityManager.clear?.();
const stForSer = new Station({ id: 'station_ser', name: 'Ser', bodyId: 'planet_1', pop: 2, modules: createStarterModules() });
EntityManager.add(stForSer);
const sys = new StationSystem();
const ser = sys.serialize();
const row = ser.find(r => r.id === 'station_ser');
T('4.1 serialize zawiera modules', row && Array.isArray(row.modules) && row.modules.length === 2);
T('4.2 serialize zawiera pop', row && row.pop === 2);
T('4.3 serialize zawiera pendingModuleOrders', row && Array.isArray(row.pendingModuleOrders));
T('4.4 serialize NIE zawiera popCapacity (pochodna)', row && !('popCapacity' in row));

// restore po usunięciu (idempotent guard wymaga braku encji)
EntityManager.remove('station_ser');
T('4.5 encja usunięta przed restore', !EntityManager.get('station_ser'));
sys.restore(ser);
const restored = EntityManager.get('station_ser');
T('4.6 restore odtwarza encję', !!restored && restored.type === 'station');
T('4.7 restore modules ==', restored && restored.modules.length === 2);
T('4.8 restore pop ==', restored && restored.pop === 2);
T('4.9 restore popCapacity liczony z modules', restored && restored.popCapacity === 1);

// ── 5. Migracja v89 → v90 ────────────────────────────────────────────────────
T('5.1 CURRENT_VERSION >= 90', CURRENT_VERSION >= 90);

const v89 = {
  version: 89,
  civ4x: { stationSystem: [
    { id: 's_old', name: 'Old', bodyId: 'p1', depot: {}, tier: 1, stationType: 'orbital_station', createdYear: 0, systemId: 'sys_home' },
  ] },
};
const out = migrate(v89);
T('5.2 wersja bumpnięta do CURRENT_VERSION', out.version === CURRENT_VERSION);
const so = out.civ4x.stationSystem[0];
T('5.3 stara stacja dostaje 2 moduły startowe', Array.isArray(so.modules) && so.modules.length === 2);
T('5.4 startowe = habitat + power_atom',
  so.modules.some(m => m.moduleType === 'habitat') && so.modules.some(m => m.moduleType === 'power_atom'));
T('5.5 pop=0 po migracji', so.pop === 0);
T('5.6 pendingModuleOrders=[] po migracji', Array.isArray(so.pendingModuleOrders) && so.pendingModuleOrders.length === 0);

// guard: brak stationSystem → bez crasha, wersja bumpnięta
const out2 = migrate({ version: 89, civ4x: {} });
T('5.7 brak stacji migruje czysto', out2.version === CURRENT_VERSION);

// guard: istniejące moduły/pop NIE nadpisane
const out3 = migrate({
  version: 89,
  civ4x: { stationSystem: [
    { id: 's2', modules: [makeStationModule('shipyard', 1)], pop: 3, pendingModuleOrders: [{ x: 1 }] },
  ] },
});
const s3 = out3.civ4x.stationSystem[0];
T('5.8 istniejące moduły zachowane', s3.modules.length === 1 && s3.modules[0].moduleType === 'shipyard');
T('5.9 istniejący pop zachowany', s3.pop === 3);
T('5.10 istniejąca kolejka zachowana', s3.pendingModuleOrders.length === 1);

// ── 6. Pełny round-trip v89 → migrate → restore → serialize (stabilność) ──────
EntityManager.clear?.();
const migrated = migrate({
  version: 89,
  civ4x: { stationSystem: [
    { id: 's_rt', name: 'RT', bodyId: 'p1', depot: {}, tier: 1, stationType: 'orbital_station', createdYear: 5, systemId: 'sys_home' },
  ] },
});
const sys2 = new StationSystem();
sys2.restore(migrated.civ4x.stationSystem);
const reser = sys2.serialize();
const rtRow = reser.find(r => r.id === 's_rt');
T('6.1 round-trip zachowuje 2 moduły', rtRow && rtRow.modules.length === 2);
T('6.2 round-trip pop=0', rtRow && rtRow.pop === 0);
T('6.3 round-trip encja ma popCapacity=1', EntityManager.get('s_rt')?.popCapacity === 1);

// ── 7. StationData.maxModules ────────────────────────────────────────────────
T('7.1 STATIONS.orbital_station.maxModules = 8', STATIONS.orbital_station.maxModules === 8);

console.log(`\nS3.4 FAZA 1 smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
