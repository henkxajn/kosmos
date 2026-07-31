// S3.4 FAZA 3 — smoke: StationSystem INTENT (demolishModule / queueStationShip / serialize-restore).
// ⚠ C6c-3: pełnoekranowy render (drawStationManagement, tryb stacji) RETIRED → hit-zony UI pokrywa teraz
// station_manage_compact_smoke.mjs (zakładka Stacja). Ten plik testuje CZYSTĄ logikę StationSystem (bez UI):
// rozbiórka modułu + round-trip save/restore, budowa statku z projektu gracza (koszt + spawn z modułami).
// Uruchom: node src/testing/smoke/s34_faza3_smoke.mjs

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage, KOSMOS: {} };

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const EntityManager = (await import('../../core/EntityManager.js')).default;
const { Station } = await import('../../entities/Station.js');
const { StationSystem } = await import('../../systems/StationSystem.js');
const { makeStationModule } = await import('../../data/StationModuleData.js');
const EventBus = (await import('../../core/EventBus.js')).default;

// ── 1. R1 — demolishModule: usuwa moduł, przelicza popCapacity, emituje event, round-trip serialize/restore ──
{
  const st = new Station({
    id: 'st_dem', name: 'Stacja Dem', bodyId: 'moon', pop: 0,
    modules: [makeStationModule('habitat', 1), makeStationModule('power_atom', 1), makeStationModule('trade_module', 1)],
    depot: {},
  });
  EntityManager.clear?.();
  EntityManager.add(st);
  const sys = new StationSystem();
  let demolishedEvent = null;
  EventBus.on('station:moduleDemolished', (e) => { demolishedEvent = e; });
  const habId = st.modules.find(m => m.moduleType === 'habitat').id;
  const capBefore = st.popCapacity;
  T('1.1 demolishModule ok', sys.demolishModule('st_dem', habId) === true);
  T('1.2 moduł usunięty z modules', !st.modules.some(m => m.id === habId));
  T('1.3 popCapacity przeliczone (spadek o 1)', st.popCapacity === capBefore - 1);
  T('1.4 event station:moduleDemolished z moduleType=habitat', demolishedEvent?.moduleType === 'habitat');
  const ser = sys.serialize().find(s => s.id === 'st_dem');
  T('1.5 serialize zawiera 2 moduły po rozbiórce', ser.modules.length === 2);
  EntityManager.remove('st_dem');
  sys.restore([ser]);
  T('1.6 restore odtwarza 2 moduły', EntityManager.get('st_dem')?.modules.length === 2);
  T('1.7 demolish nieistniejącego modułu → false', sys.demolishModule('st_dem', 'nope') === false);
}

// ── 2. R2 (decyzja #10) — queueStationShip buduje PROJEKT gracza (koszt z modułów + spawn z modułami) ──
{
  EntityManager.clear?.();
  const created = [];
  window.KOSMOS.techSystem     = { isResearched: (id) => id === 'exploration' || id === 'fusion_power' };
  window.KOSMOS.homePlanet     = { id: 'home' };
  window.KOSMOS.colonyManager  = { getColony: () => null, getPlayerColonies: () => [] };
  window.KOSMOS.vesselManager  = {
    createAndRegister(shipId, colonyId, opts) { const v = { id: `v${created.length}`, shipId, opts }; created.push(v); return v; },
    dockAtStation() {},
  };
  if (!EntityManager.get('moon2')) EntityManager.add({ id: 'moon2', type: 'moon', name: 'Moon2', x: 5, y: 6, systemId: 'sys_home' });
  const st = new Station({
    id: 'st_proj', name: 'Proj', bodyId: 'moon2', pop: 20,
    modules: [makeStationModule('power_fusion', 1), makeStationModule('shipyard', 1)],
    depot: { Fe: 9000, Ti: 9000, Cu: 9000, structural_alloys: 900, polymer_composites: 900, power_cells: 900 },
  });
  EntityManager.add(st);
  const sys = new StationSystem();
  sys._recomputeModuleStates(st);
  T('2.0 shipyard aktywny (pop 20)', st.hasActiveShipyard === true);
  const r = sys.queueStationShip('st_proj', 'hull_small', ['engine_chemical', null]);
  T('2.1 queueStationShip(projekt) ok', r.ok === true);
  T('2.2 shipQueue niesie modules projektu', st.shipQueues[0]?.modules?.includes('engine_chemical'));
  T('2.3 koszt policzony z modułem (Fe 9000-80=8920)', st.depot.getAmount('Fe') === 8920);
  T('2.4 koszt modułu pobrany (power_cells 900-2=898)', st.depot.getAmount('power_cells') === 898);
  sys._tick(4.0);
  T('2.5 statek zbudowany (queue pusta)', st.shipQueues.length === 0);
  T('2.6 spawn createAndRegister z modułami projektu', created.length === 1 && created[0].opts?.modules?.includes('engine_chemical'));
  const rMiss = sys.queueStationShip('st_proj', 'hull_large', ['engine_chemical']);
  T('2.7 brak środków → insufficient_resources + missing.reactive_armor', !rMiss.ok && rMiss.reason === 'insufficient_resources' && rMiss.missing?.reactive_armor > 0);
}

console.log(`\nS3.4 FAZA 3 (StationSystem intent) smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
