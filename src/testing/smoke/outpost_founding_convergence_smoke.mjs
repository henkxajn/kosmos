// KEEPER — (e) Finding 254: dostawa transportowa i przycisk „Rozładuj cargo" zakładają placówkę
// TĄ SAMĄ ścieżką.
//
// CO PINUJE (i dlaczego akurat to)
// Dwie ścieżki zakładania placówki z ładunku były PEŁNYMI RÓWNOLEGŁYMI implementacjami — dzieliły
// wyłącznie prymityw `ColonyManager.createOutpost`, a decyzję, marshalling cargo i log miały
// własne:
//   • `VesselManager._startForeignUnload` — ZERO bramek: brak kolonii ⇒ placówka, gdziekolwiek;
//   • `MissionSystem._processTransportArrival` (A4) — wymagała TEGO SAMEGO układu ORAZ
//     `body.explored`; obcy układ ⇒ statek orbituje, placówka NIE powstaje.
// Rozjazd stał się nośny dopiero po d1: gracz może teraz wysłać transport na obce ciało, więc
// dostawa milczkiem NIE zakładała placówki, którą przycisk na tym samym ciele zakłada.
//
// ⚠ ZBIEŻNOŚĆ MUSI BYĆ JEDNĄ IMPLEMENTACJĄ, NIE DWIEMA, KTÓRE DZIŚ SIĘ ZGADZAJĄ. To repo trzy
//   razy zapłaciło za nieutwardzonego bliźniaka (`removeColony:667`, `ReturnJump`, `FleetActions`).
//   Dlatego e-1 porównuje WYNIK obu ścieżek, a nie „każda coś założyła".
//
// e-1 ZBIEŻNOŚĆ — dostawa i przycisk na TYM SAMYM ciele dają IDENTYCZNY wynik
// e-2 NIEJAŁOWOŚĆ — bez naprawy ścieżka transportowa zostawia statek na orbicie BEZ placówki
// e-3 GRANICA — ten sam układ + ciało NIEZBADANE dalej bez placówki (reconcile nie wycieka)
// e-4 MGŁA — placówka tylko na ciele z układu WYGENEROWANEGO (inwariant jawny)
//
// Uruchom: node src/testing/smoke/outpost_founding_convergence_smoke.mjs

globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style: {}, getContext: () => null, appendChild() {}, addEventListener() {}, setAttribute() {} }),
  body: { appendChild() {}, removeChild() {} }, addEventListener() {},
};
globalThis.localStorage = {
  _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }, key(i) { return Object.keys(this._s)[i] ?? null; },
  get length() { return Object.keys(this._s).length; },
};

const EntityManager     = (await import('../../core/EntityManager.js')).default;
const { VesselManager } = await import('../../systems/VesselManager.js');
const { MissionSystem } = await import('../../systems/MissionSystem.js');
const { GAME_CONFIG }   = await import('../../config/GameConfig.js');

const AU = GAME_CONFIG.AU_TO_PX;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n--- ' + s + ' ---');

EntityManager.clear();
EntityManager.add({ id: 'star_home', type: 'star', systemId: 'sys_home', x: 0, y: 0, mass: 1 });
EntityManager.add({ id: 'p_home', type: 'planet', systemId: 'sys_home', x: 2 * AU, y: 0, name: 'Dom', explored: true });
// Ciało w OBCYM, ale ODWIEDZONYM (wygenerowanym) układzie — `explored:false` jest UCZCIWE.
EntityManager.add({ id: 'p_far_a', type: 'planet', systemId: 'sys_gen', x: 3 * AU, y: 0, name: 'Phact c', explored: false, planetType: 'rocky' });
EntityManager.add({ id: 'p_far_b', type: 'planet', systemId: 'sys_gen', x: 4 * AU, y: 0, name: 'Phact d', explored: false, planetType: 'rocky' });
// Ciało NIEZBADANE we WŁASNYM układzie — granica, której (e) NIE przesuwa.
EntityManager.add({ id: 'p_home_dark', type: 'planet', systemId: 'sys_home', x: 5 * AU, y: 0, name: 'Ciemna', explored: false, planetType: 'rocky' });

const generated = new Set(['sys_home', 'sys_gen']);
const created = [];           // rejestr wywołań createOutpost — porównujemy WYNIK, nie „coś się stało"
const colonies = new Map([['p_home', { planetId: 'p_home', name: 'Dom', isOutpost: false, systemId: 'sys_home', fleet: [], resourceSystem: { receive() {} } }]]);
const colonyManager = {
  getColony: id => colonies.get(id) ?? null,
  hasColony: id => colonies.has(id),
  activePlanetId: 'p_home',
  createOutpost(targetId, resources, year) {
    created.push({ targetId, resources: { ...resources }, year });
    colonies.set(targetId, { planetId: targetId, name: targetId, isOutpost: true, fleet: [], resourceSystem: { receive() {} } });
    return colonies.get(targetId);
  },
};

const clock = { gameTime: 40 };
const vm = new VesselManager();
const ms = new MissionSystem();
globalThis.KOSMOS = {
  timeSystem: clock, vesselManager: vm, missionSystem: ms, colonyManager,
  starSystemManager: { getSystem: id => (generated.has(id) ? { systemId: id } : null) },
  stationSystem: { getStation: () => null, getStationsAt: () => [] },
};

function makeVessel(id, cargo, over = {}) {
  const v = {
    id, name: id, shipId: 'hull_medium', systemId: 'sys_gen',
    colonyId: 'p_home', homeColonyId: 'p_home', status: 'on_mission',
    position: { state: 'orbiting', dockedAt: null, x: 3 * AU, y: 0 },
    mission: null, fuel: { current: 60, max: 60, consumption: 1 },
    warpFuel: { current: 4, max: 8, consumption: 0.2 },
    speedAU: 1, experience: 0, stats: { distanceTraveled: 0, missionsComplete: 0, resourcesHauled: 0 },
    modules: [], cargo: { ...cargo }, cargoUsed: Object.values(cargo).reduce((a, b) => a + b, 0),
    missionLog: [], pendingOrder: null, warpRoute: null, movementOrder: null,
    serviceState: 'active', isWreck: false, unpaidYears: 0, ...over,
  };
  vm._vessels.set(id, v);
  return v;
}

const CARGO = { minerals: 10, water: 5 };

// ── e-1 / e-2 — ścieżka TRANSPORTOWA na obcym, odwiedzonym ciele ──────────────────────────────
header('e-1/e-2 — dostawa transportowa na OBCYM, odwiedzonym ciele zakłada placówkę');
created.length = 0;
const vT = makeVessel('v_transport', CARGO);
const expT = {
  id: 'exp_1', type: 'transport', vesselId: 'v_transport', targetId: 'p_far_a',
  originColonyId: 'p_home', cargo: null, status: 'in_transit', gained: null,
};
ms._processTransportArrival(expT);
const transportCall = created.find(c => c.targetId === 'p_far_a');
ok(!!transportCall,
  `placówka ZAŁOŻONA przez dostawę (created=${JSON.stringify(created.map(c => c.targetId))}) — ` +
  'bez naprawy A4 statek tylko orbitował z cargo na pokładzie (e-2: to jest ta różnica)');
ok(expT.status === 'completed', `misja zakończona, nie „orbiting" (status=${expT.status})`);

// ── e-1 — ścieżka PRZYCISKU na bliźniaczym ciele ──────────────────────────────────────────────
header('e-1 ZBIEŻNOŚĆ — przycisk „Rozładuj cargo" na bliźniaczym ciele');
const vU = makeVessel('v_unload', CARGO, { position: { state: 'orbiting', dockedAt: 'p_far_b', x: 4 * AU, y: 0 } });
vU.mission = { type: 'exploration', phase: 'orbiting_body', targetId: 'p_far_b' };
vm._startForeignUnload('v_unload', 'p_far_b');
const unloadCall = created.find(c => c.targetId === 'p_far_b');
ok(!!unloadCall, `placówka założona przez przycisk (${JSON.stringify(unloadCall?.resources)})`);

ok(transportCall && unloadCall
   && JSON.stringify(transportCall.resources) === JSON.stringify(unloadCall.resources),
  `OBIE ŚCIEŻKI przekazały IDENTYCZNE zasoby: dostawa=${JSON.stringify(transportCall?.resources)} ` +
  `vs przycisk=${JSON.stringify(unloadCall?.resources)}`);
const colT = colonyManager.getColony('p_far_a'), colU = colonyManager.getColony('p_far_b');
ok(!!colT && !!colU && colT.isOutpost === colU.isOutpost && colT.isOutpost === true,
  `obie placówki tego samego rodzaju (isOutpost: ${colT?.isOutpost} / ${colU?.isOutpost})`);
ok(vT.cargo && Object.keys(vT.cargo).length === 0 && vU.cargo && Object.keys(vU.cargo).length === 0,
  'obie ścieżki opróżniły ładownię — statek nie wozi ładunku, który już wyładował');

// ── e-3 — GRANICA: własny układ + ciało NIEZBADANE bez zmian ──────────────────────────────────
header('e-3 GRANICA — ten sam układ + ciało NIEZBADANE dalej BEZ placówki');
created.length = 0;
const vD = makeVessel('v_dark', CARGO, { systemId: 'sys_home', position: { state: 'orbiting', dockedAt: null, x: 5 * AU, y: 0 } });
const expD = {
  id: 'exp_2', type: 'transport', vesselId: 'v_dark', targetId: 'p_home_dark',
  originColonyId: 'p_home', cargo: null, status: 'in_transit', gained: null,
};
ms._processTransportArrival(expD);
ok(!created.some(c => c.targetId === 'p_home_dark'),
  `ciało niezbadane we WŁASNYM układzie dalej nie dostaje placówki (${JSON.stringify(created.map(c => c.targetId))}) — ` +
  'reconcile NIE wycieka do ścieżki in-system');
ok(expD.status === 'orbiting', `statek orbituje z cargo, misja bez błędu (status=${expD.status})`);
ok(Object.keys(vD.cargo).length > 0, 'KONTROLA PINU: ładunek NIE przepadł — zostaje na pokładzie');

// ── e-4 — MGŁA: tylko układ wygenerowany ──────────────────────────────────────────────────────
header('e-4 MGŁA — placówka tylko na ciele z układu WYGENEROWANEGO');
created.length = 0;
EntityManager.add({ id: 'p_ghost', type: 'planet', systemId: 'sys_never', x: 6 * AU, y: 0, name: 'Widmo', explored: false });
const vG = makeVessel('v_ghost', CARGO, { systemId: 'sys_never', position: { state: 'orbiting', dockedAt: null, x: 6 * AU, y: 0 } });
const expG = {
  id: 'exp_3', type: 'transport', vesselId: 'v_ghost', targetId: 'p_ghost',
  originColonyId: 'p_home', cargo: null, status: 'in_transit', gained: null,
};
ms._processTransportArrival(expG);
ok(!created.some(c => c.targetId === 'p_ghost'),
  'ciało z układu NIEWYGENEROWANEGO nie dostaje placówki — inwariant mgły jest JAWNY, ' +
  'choć transport i tak nie miałby jak tam dolecieć (d1/d2 tego nie dopuszczają)');

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;
