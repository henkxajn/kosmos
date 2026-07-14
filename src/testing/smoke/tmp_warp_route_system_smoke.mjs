// Smoke test: WarpRouteSystem (egzekutor multi-hop) + save round-trip + migracja v87→v88.
// Uruchom: node tmp_warp_route_system_smoke.mjs
//
// E1  canOrder — bramki (warp-capable / in_transit / immobilized / enemy)
// E2  beginJourney direct (single-tank) — warpRoute set, dispatch, warpRoute:started
// E3  beginJourney odrzuca insufficient_warp_fuel — warpRoute NIE ustawiony
// E4  _onArrived chaining multi-hop (manual route) — legComplete → completed
// E5  _onArrived abort 'stranded_fuel' (canJump kolejnego odcinka false)
// E6  _onArrived abort 'diverted' (przylot do nieoczekiwanego układu)
// E7  _onArrived ignoruje statek bez warpRoute (zwykły single dispatch)
// E8  wiring konstruktora — EventBus 'interstellar:arrived' łańcuchuje
// E9  save round-trip warpRoute (real VesselManager serialize/restore)
// E10 migracja v87→v88 (CURRENT_VERSION + lazy warpRoute=null)

// ── Stub browser globals (PRZED importami) ─────────────────────────────
globalThis.localStorage = { _s: {}, getItem(k){return this._s[k]??null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];} };
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {};
globalThis.document = globalThis.document ?? { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }) };

// ── Imports ───────────────────────────────────────────────────────────
const EventBus = (await import('../../core/EventBus.js')).default;
const { WarpRouteSystem } = await import('../../systems/WarpRouteSystem.js');
const { VesselManager } = await import('../../systems/VesselManager.js');
const { warpDist3D } = await import('../../utils/WarpRoutePlanner.js');
const { CURRENT_VERSION, migrate } = await import('../../systems/SaveMigration.js');

let pass = 0, fail = 0;
const assert = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + label); } };

// Galaktyka testowa: home(0)-B(5)-C(10) na osi X.
const SYS = [
  { id: 'sys_home', name: 'Dom', x: 0,  y: 0, z: 0 },
  { id: 'B',        name: 'Beta', x: 5,  y: 0, z: 0 },
  { id: 'C',        name: 'Cygni', x: 10, y: 0, z: 0 },
  { id: 'F',        name: 'Far',  x: 5,  y: 3, z: 0 },
  { id: 'M9',       name: 'Mid',  x: 9,  y: 0, z: 0 },
  { id: 'X15',      name: 'Daleki', x: 15, y: 0, z: 0 },
];
window.KOSMOS.galaxyData = { systems: SYS };
window.KOSMOS.timeSystem = { gameTime: 0 };
window.KOSMOS.eventLogSystem = { push() {} };

// Łap eventy warpRoute:*
const events = [];
for (const ev of ['warpRoute:started', 'warpRoute:legComplete', 'warpRoute:completed', 'warpRoute:aborted']) {
  EventBus.on(ev, (d) => events.push({ ev, d }));
}
const lastEvent = (name) => [...events].reverse().find(e => e.ev === name);

// W realnej grze istnieje DOKŁADNIE JEDNA instancja WarpRouteSystem. Test używa
// jednej współdzielonej (swap _vm per test) — wiele instancji nasłuchiwałoby
// interstellar:arrived i przetwarzało vessel z payloadu krzyżowo (artefakt testu).
const SHARED_WRS = new WarpRouteSystem(null);
const useVM = (vm) => { SHARED_WRS._vm = vm; return SHARED_WRS; };

function mkVessel(id, over = {}) {
  return {
    id, name: id, shipId: 'hull_frigate',
    isWreck: false,
    systemId: over.systemId ?? 'sys_home',
    status: over.status ?? 'idle',
    position: { x: 0, y: 0, state: over.state ?? 'docked', dockedAt: 'home_planet' },
    modules: [],
    warpFuel: { current: over.current ?? 10, max: over.max ?? 10, consumption: over.consumption ?? 0.5, fuelType: 'warp_cores' },
    unpaidYears: over.unpaidYears ?? 0,
    mission: null,
    warpRoute: null,
    ...over.extra,
  };
}

// Fake VM — implementuje tylko to, czego używa WarpRouteSystem; dispatch symuluje silnik.
function makeFakeVM(vessel) {
  const vessels = new Map([[vessel.id, vessel]]);
  return {
    dispatchCalls: [],
    getVessel(id) { return vessels.get(id) ?? null; },
    isImmobilized(v) { return (v.unpaidYears ?? 0) >= 2; },
    dispatchInterstellar(id, target) {
      const v = vessels.get(id); if (!v) return false;
      const fromS = SYS.find(s => s.id === (v.systemId ?? 'sys_home'));
      const toS = SYS.find(s => s.id === target);
      if (!fromS || !toS) return false;
      const cost = warpDist3D(fromS, toS) * v.warpFuel.consumption;
      if (v.warpFuel.current < cost - 1e-9) return false;   // canJump-like gate
      v.warpFuel.current -= cost;
      v.mission = { type: 'interstellar_jump', toSystemId: target, phase: 'warp_transit' };
      v.position.state = 'in_transit';
      v.status = 'on_mission';
      v.systemId = null;
      this.dispatchCalls.push({ id, target });
      return true;
    },
  };
}
// Symuluj przylot statku do układu (mimik _tickInterstellar) + emisja eventu.
function arrive(v, sysId, wrs) {
  v.systemId = sysId; v.position.state = 'orbiting'; v.status = 'on_mission';
  if (v.mission) v.mission.phase = 'in_system';
  wrs._onArrived({ vessel: v, systemId: sysId });
}

// ── E1: canOrder gates ─────────────────────────────────────────────────
{
  const v = mkVessel('e1');
  const wrs = useVM(makeFakeVM(v));
  assert(wrs.canOrder(v).ok, 'E1: docked warp-capable → ok');
  assert(wrs.canOrder({ ...v, warpFuel: { max: 0 } }).reason === 'not_warp_capable', 'E1: warpFuel.max=0 → not_warp_capable');
  assert(wrs.canOrder({ ...v, position: { state: 'in_transit' } }).reason === 'in_transit', 'E1: in_transit → in_transit');
  assert(wrs.canOrder({ ...v, unpaidYears: 2 }).reason === 'immobilized', 'E1: unpaidYears>=2 → immobilized');
  assert(wrs.canOrder({ ...v, ownerEmpireId: 'emp_1' }).reason === 'not_player', 'E1: enemy → not_player');
}

// ── E2: beginJourney direct (single-tank) ──────────────────────────────
{
  events.length = 0;
  const v = mkVessel('e2', { current: 10, max: 10, consumption: 0.5 });
  const vm = makeFakeVM(v);
  const wrs = useVM(vm);
  const res = wrs.beginJourney('e2', 'B');
  assert(res.ok, 'E2: beginJourney ok');
  assert(v.warpRoute && v.warpRoute.finalSystemId === 'B', 'E2: warpRoute ustawiony (final=B)');
  assert(v.warpRoute.hops.length === 2, 'E2: hops=[home,B]');
  assert(vm.dispatchCalls.length === 1 && vm.dispatchCalls[0].target === 'B', 'E2: dispatch do B');
  assert(v.position.state === 'in_transit', 'E2: in_transit');
  assert(lastEvent('warpRoute:started'), 'E2: warpRoute:started wyemitowany');
}

// ── E3: beginJourney odrzuca insufficient_warp_fuel ────────────────────
{
  const v = mkVessel('e3', { current: 1, max: 10, consumption: 0.5 });  // C=10LY → 5 cores > 1
  const vm = makeFakeVM(v);
  const wrs = useVM(vm);
  const res = wrs.beginJourney('e3', 'C');
  assert(!res.ok && res.reason === 'insufficient_warp_fuel', 'E3: insufficient_warp_fuel');
  assert(v.warpRoute === null, 'E3: warpRoute NIE ustawiony');
  assert(vm.dispatchCalls.length === 0, 'E3: brak dispatch');
}

// ── E4: _onArrived chaining multi-hop (manual route) ───────────────────
{
  events.length = 0;
  // consumption małe → maxHopLY duże, fuel starcza na chaining (test maszyny stanów)
  const v = mkVessel('e4', { current: 10, max: 10, consumption: 0.1, state: 'in_transit', status: 'on_mission' });
  v.systemId = null;
  v.mission = { type: 'interstellar_jump', toSystemId: 'B', phase: 'warp_transit' };
  v.warpRoute = { hops: ['sys_home', 'B', 'C'], legIndex: 0, finalSystemId: 'C', totalFuelPlanned: 1, startedYear: 0 };
  const vm = makeFakeVM(v);
  const wrs = useVM(vm);
  arrive(v, 'B', wrs);   // przylot 1 odcinka
  assert(v.warpRoute && v.warpRoute.legIndex === 1, 'E4: legIndex=1 po przylocie do B');
  assert(vm.dispatchCalls.length === 1 && vm.dispatchCalls[0].target === 'C', 'E4: dispatch kolejnego odcinka do C');
  assert(lastEvent('warpRoute:legComplete'), 'E4: warpRoute:legComplete');
  arrive(v, 'C', wrs);   // przylot finalny
  assert(v.warpRoute === null, 'E4: warpRoute wyczyszczony po finale');
  assert(lastEvent('warpRoute:completed'), 'E4: warpRoute:completed');
}

// ── E5: abort 'stranded_fuel' ──────────────────────────────────────────
{
  events.length = 0;
  const v = mkVessel('e5', { current: 0.05, max: 10, consumption: 0.1, state: 'in_transit', status: 'on_mission' });
  v.systemId = null;
  v.mission = { type: 'interstellar_jump', toSystemId: 'B', phase: 'warp_transit' };
  v.warpRoute = { hops: ['sys_home', 'B', 'C'], legIndex: 0, finalSystemId: 'C', totalFuelPlanned: 1, startedYear: 0 };
  const wrs = useVM(makeFakeVM(v));
  arrive(v, 'B', wrs);   // B→C = 5LY × 0.1 = 0.5 cores > 0.05 → canJump false
  assert(v.warpRoute === null, 'E5: warpRoute wyczyszczony (abort)');
  const ab = lastEvent('warpRoute:aborted');
  assert(ab && ab.d.reason === 'stranded_fuel', 'E5: warpRoute:aborted stranded_fuel');
}

// ── E6: abort 'diverted' (nieoczekiwany przylot) ───────────────────────
{
  events.length = 0;
  const v = mkVessel('e6', { current: 10, max: 10, consumption: 0.1, state: 'in_transit', status: 'on_mission' });
  v.systemId = null;
  v.mission = { type: 'interstellar_jump', toSystemId: 'B', phase: 'warp_transit' };
  v.warpRoute = { hops: ['sys_home', 'B', 'C'], legIndex: 0, finalSystemId: 'C', totalFuelPlanned: 1, startedYear: 0 };
  const wrs = useVM(makeFakeVM(v));
  arrive(v, 'F', wrs);   // przylot do F zamiast B
  const ab = lastEvent('warpRoute:aborted');
  assert(v.warpRoute === null && ab && ab.d.reason === 'diverted', 'E6: abort diverted');
}

// ── E7: _onArrived ignoruje statek bez warpRoute ───────────────────────
{
  events.length = 0;
  const v = mkVessel('e7'); v.warpRoute = null;
  const vm = makeFakeVM(v);
  const wrs = useVM(vm);
  arrive(v, 'B', wrs);
  assert(vm.dispatchCalls.length === 0 && events.length === 0, 'E7: brak akcji dla statku bez warpRoute');
}

// ── E8: wiring konstruktora przez EventBus ─────────────────────────────
{
  events.length = 0;
  const v = mkVessel('e8', { current: 10, max: 10, consumption: 0.1, state: 'in_transit', status: 'on_mission' });
  v.systemId = null;
  v.mission = { type: 'interstellar_jump', toSystemId: 'B', phase: 'warp_transit' };
  v.warpRoute = { hops: ['sys_home', 'B', 'C'], legIndex: 0, finalSystemId: 'C', totalFuelPlanned: 1, startedYear: 0 };
  const vm = makeFakeVM(v);
  const wrs = useVM(vm);   // subskrybuje interstellar:arrived
  v.systemId = 'B'; v.position.state = 'orbiting'; if (v.mission) v.mission.phase = 'in_system';
  EventBus.emit('interstellar:arrived', { vessel: v, systemId: 'B' });
  assert(vm.dispatchCalls.some(c => c.target === 'C'), 'E8: EventBus interstellar:arrived łańcuchuje (dispatch C)');
}

// ── E9: save round-trip warpRoute (real VesselManager) ─────────────────
{
  const vm = Object.create(VesselManager.prototype);
  vm._vessels = new Map();
  vm.restore({
    vessels: [{
      id: 'sv', shipId: 'hull_frigate', name: 'Saver',
      position: { x: 0, y: 0, state: 'orbiting', dockedAt: null },
      warpFuel: { current: 4, max: 10, consumption: 0.5 },
      warpRoute: { hops: ['sys_home', 'B', 'C'], legIndex: 1, finalSystemId: 'C', totalFuelPlanned: 5, startedYear: 7 },
    }],
    nextId: 5, nameCounters: null,
  });
  const v = vm.getVessel('sv');
  assert(v && v.warpRoute && v.warpRoute.legIndex === 1 && v.warpRoute.finalSystemId === 'C', 'E9: restore warpRoute');
  assert(v.warpRoute.hops.length === 3, 'E9: restore hops');
  const ser = vm.serialize();
  const sv = ser.vessels.find(x => x.id === 'sv');
  assert(sv.warpRoute && sv.warpRoute.legIndex === 1 && sv.warpRoute.hops.length === 3, 'E9: serialize round-trip');
  // stary statek bez warpRoute → null po restore
  const vm2 = Object.create(VesselManager.prototype); vm2._vessels = new Map();
  vm2.restore({ vessels: [{ id: 'old', shipId: 'hull_small', position: { state: 'docked' }, warpFuel: { current: 0, max: 0, consumption: 0 } }], nextId: 2 });
  assert(vm2.getVessel('old').warpRoute === null, 'E9: brak warpRoute → null');
}

// ── E10: migracja v87→v88 ──────────────────────────────────────────────
{
  assert(CURRENT_VERSION >= 88, 'E10: CURRENT_VERSION >= 88');
  const data = { version: 87, civ4x: { vesselManager: { vessels: [{ id: 'm1', shipId: 'hull_small' }] } } };
  const r = migrate(data);
  assert(r.version === CURRENT_VERSION, 'E10: wersja podbita do CURRENT_VERSION');
  assert(r.civ4x.vesselManager.vessels[0].warpRoute === null, 'E10: warpRoute=null default');
}

// ── E11: beginJourney stosuje twardy limit skoku → multi-hop dla celu 15 LY ──
{
  events.length = 0;
  // duży bak + niskie zużycie → tankRange>>10, więc wiąże limit skoku (cap=10).
  const v = mkVessel('e11', { current: 10, max: 10, consumption: 0.125 });
  const vm = makeFakeVM(v);
  const wrs = useVM(vm);
  const res = wrs.beginJourney('e11', 'X15');   // direct 15 LY > limit 10
  assert(res.ok, 'E11: beginJourney do celu 15 LY ok (multi-hop)');
  assert(res.route && res.route.hops.length >= 3, `E11: trasa multi-hop (${res.route?.hops?.length - 1} skoki, nie direct)`);
  assert(res.route.legs.every(l => l.distLY <= 10 + 1e-6), 'E11: każdy odcinek ≤ limit 10 LY');
  assert(vm.dispatchCalls.length === 1 && vm.dispatchCalls[0].target === res.route.hops[1], 'E11: dispatch PIERWSZEGO odcinka (≤10 LY)');
}

console.log(`\nWarpRouteSystem: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
