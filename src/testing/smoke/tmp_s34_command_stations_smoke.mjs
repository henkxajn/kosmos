// S3.4-F2 — smoke: FleetOverlay (Command) zna stacje jako lokację.
// FleetManagerOverlay._drawLeft buduje listę z vMgr.getAllVessels().filter(!isEnemyVessel && !isWreck),
// a lokację rozwiązuje przez _resolveName (fix: mirror utils/BodyName.resolveBodyName — rozwiązuje stacje).
// Ten test weryfikuje ŹRÓDŁO listy + rozwiązywanie nazwy stacji + undock (undockToOrbit) na REALNYCH
// modułach (VesselManager/StationSystem/Station/BodyName/Vessel), bez canvas (FMO nieimportowalny headless).
// Uruchom: node tmp_s34_command_stations_smoke.mjs

// ── Stub środowiska przeglądarki ──────────────────────────────────────────────
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const researched = new Set(['exploration']);
const homeColony = {
  planetId: 'home', name: 'Kolonia Domowa',
  resourceSystem: { receive() {} },
  fleet: [],
};
globalThis.window = {
  localStorage: globalThis.localStorage,
  KOSMOS: {
    techSystem: { isResearched: (id) => researched.has(id) },
    homePlanet: { id: 'home' },
    activeSystemId: 'sys_home',
    timeSystem: { gameTime: 0 },
    colonyManager: {
      getColony: (id) => (id === 'home' ? homeColony : null),
      getPlayerColonies: () => [homeColony],
      activePlanetId: 'home',
    },
  },
};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const EntityManager = (await import('../../core/EntityManager.js')).default;
const { Station } = await import('../../entities/Station.js');
const { StationSystem } = await import('../../systems/StationSystem.js');
const { VesselManager } = await import('../../systems/VesselManager.js');
const { makeStationModule } = await import('../../data/StationModuleData.js');
const { SHIPS } = await import('../../data/ShipsData.js');
const { isEnemyVessel } = await import('../../entities/Vessel.js');
const { resolveBodyName } = await import('../../utils/BodyName.js');

const vMgr = new VesselManager();
window.KOSMOS.vesselManager = vMgr;
const stSys = new StationSystem();
window.KOSMOS.stationSystem = stSys;

// Replika filtra źródła listy Command (FleetManagerOverlay._draw:537) — statki gracza żywe.
const commandList = () => vMgr.getAllVessels().filter(v => !isEnemyVessel(v) && !v.isWreck);
const inCommand = (id) => commandList().some(v => v.id === id);

// Ciało macierzyste stacji + kolonii.
EntityManager.clear?.();
EntityManager.add({ id: 'home', type: 'planet', name: 'Kolonia Domowa', x: 100, y: 0, systemId: 'sys_home' });
EntityManager.add({ id: 'moon_a', type: 'moon', name: 'Księżyc A', x: 120, y: 10, systemId: 'sys_home' });

// ── 1. Stacja z aktywną stocznią; zbuduj statek → docked przy stacji ──────────
const shipId = 'science_vessel';
const ship = SHIPS[shipId];
const cost = { ...(ship.cost ?? {}), ...(ship.commodityCost ?? {}) };
const station = new Station({
  id: 'station_1', name: 'Stacja Alfa', bodyId: 'moon_a', systemId: 'sys_home', pop: 5,
  modules: [makeStationModule('power_fusion', 1), makeStationModule('shipyard', 1)],
  depot: { ...cost },
});
EntityManager.add(station);
stSys._recomputeModuleStates(station);
T('1.1 stacja ma aktywną stocznię', station.hasActiveShipyard === true);

const rQ = stSys.queueStationShip('station_1', shipId);
T('1.2 queueStationShip ok', rQ.ok === true);
stSys._tick(ship.buildTime + 0.01);   // tick → _tickShipQueues → _spawnStationShip
T('1.3 statek zbudowany (kolejka pusta)', station.shipQueues.length === 0);

const built = vMgr.getAllVessels().find(v => v.shipId === shipId);
T('1.4 statek zarejestrowany w VesselManager', !!built);
T('1.5 statek zadokowany PRZY STACJI (dockedAt=station_1)', built?.position?.state === 'docked' && built?.position?.dockedAt === 'station_1');
T('1.6 colonyId = kolonia macierzysta (nie stacja)', built?.colonyId === 'home');

// ── 2. Statek stacyjny JEST na liście Command (źródło getAllVessels, !enemy, !wreck) ──
T('2.1 statek stacyjny NIE jest wrogiem', isEnemyVessel(built) === false);
T('2.2 statek stacyjny obecny na liście Command PRZED undock', inCommand(built.id));

// ── 3. Rozwiązywanie nazwy stacji jako lokacji (fix _resolveName mirror resolveBodyName) ──
T('3.1 resolveBodyName(station_1) = nazwa stacji (nie surowe id)', resolveBodyName('station_1') === 'Stacja Alfa');
T('3.2 EntityManager zna stację (typ station)', EntityManager.get('station_1')?.type === 'station');

// ── 4. Undock (reuse undockToOrbit) → orbituje stację, wciąż na liście Command ─────
const rU = vMgr.undockToOrbit(built.id);
T('4.1 undockToOrbit ok', rU === true);
T('4.2 statek orbituje stację (state=orbiting, dockedAt=station_1)', built.position.state === 'orbiting' && built.position.dockedAt === 'station_1');
T('4.3 statek stacyjny nadal na liście Command PO undock', inCommand(built.id));

// ── 5. Regresja: statek kolonijny (dock przy kolonii) bez zmian ───────────────
const colVessel = vMgr.createAndRegister(shipId, 'home', { x: 100, y: 0 });
vMgr.dockAtColony?.(colVessel.id, 'home');
T('5.1 statek kolonijny zarejestrowany', !!vMgr.getVessel(colVessel.id));
T('5.2 statek kolonijny na liście Command', inCommand(colVessel.id));
T('5.3 statek kolonijny NIE jest wrogiem', isEnemyVessel(colVessel) === false);
T('5.4 lista Command zawiera OBA (stacyjny + kolonijny)', inCommand(built.id) && inCommand(colVessel.id));

console.log(`\nS3.4-F2 Command-stations smoke: ${pass}/${pass + fail} passed` + (fail ? ` — ${fail} FAILED` : ' ✓'));
process.exit(fail ? 1 : 0);
