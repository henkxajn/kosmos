// Player Fleet Groups — P2 (Orders + Sync ETA) smoke test.
// Offline, pure-logic. Bez DOM/canvas.
//
// Pokrycie:
//   T1  MOS issueOrder z opts.fromFleet + _arrivalSyncYear (moveToPoint)   (4 cases)
//   T2  Sync ETA core: 2 vessele różne dist + speed → arrive same year    (4 cases)
//   T3  Speed cap dla pursue (clamp do min(memberSpeeds))                  (3 cases)
//   T4  preferMaxRange w engage → optimalFactor 0.98 (P3 doctrine kite)    (2 cases)
//   T5  FleetSystem.issueFleetOrder fan-out + agregacja accepted/rejected  (5 cases)
//   T6  fleet.activeOrder tracking + cancelFleetOrder                       (3 cases)
//   T7  vessel:orderCompleted → drop entry z memberOrderIds → fleet done    (3 cases)
//   T8  RightClickMenuOptions buildMenuOptions fleet-context                (4 cases)
//
// Target: ≥25 GREEN cases.

globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = {
  timeSystem: { gameTime: 100.0 },
  debug: {},
  // Stub colonyManager dla SpaceportCheck.canLaunchFromCurrent (zawsze OK w teście).
  colonyManager: { getColony: () => null },
};
globalThis.document = {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
  getElementById: () => null,
};

const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
GAME_CONFIG.FEATURES.playerFleets = true;
GAME_CONFIG.FEATURES.m4DeepSpaceCombat = true;

const EventBusModule = await import('./src/core/EventBus.js');
const EventBus = EventBusModule.default ?? EventBusModule.EventBus;
const { FleetSystem } = await import('./src/systems/FleetSystem.js');
const FleetMod = await import('./src/entities/Fleet.js');
const { setNextFleetId } = FleetMod;
const { MovementOrderSystem } = await import('./src/systems/MovementOrderSystem.js');
const { buildMenuOptions } = await import('./src/data/RightClickMenuOptions.js');

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// ── Minimalny VesselManager mock dla MOS + FleetSystem ────────────────────
function makeVM() {
  const _vessels = new Map();
  return {
    _vessels,
    getVessel: (id) => _vessels.get(id) ?? null,
    getAllVessels: () => [..._vessels.values()],
    addMock: (v) => _vessels.set(v.id, v),
    // _calcRoute: bezpieczna prosta trasa bez waypointów (test'om wystarczy)
    _calcRoute: (sx, sy, tx, ty) => ({
      totalDist: Math.hypot(tx - sx, ty - sy),
      waypoints: [{ x: tx, y: ty }],
    }),
  };
}
function makeVessel(id, opts = {}) {
  return {
    id,
    name: opts.name ?? id.toUpperCase(),
    shipId: opts.shipId ?? 'frigate_hull',
    colonyId: opts.colonyId ?? 'p1',
    position: opts.position ?? { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' },
    velocity: { vx: 0, vy: 0, updatedYear: 0 },
    speedAU: opts.speedAU ?? 1.0,
    fuel: opts.fuel ?? { current: 999, max: 999, consumption: 0, fuelType: 'power_cells' },
    fleetId: null,
    isWreck: false,
    ownerEmpireId: opts.ownerEmpireId ?? null,
    isEnemy: opts.isEnemy ?? false,
    mission: null,
    movementOrder: null,
    status: 'idle',
    modules: opts.modules ?? [],
    missionLog: [],
    endurance: { current: 100, max: 100, drainPerYear: 1, regenPerYear: 10, lastDepleted: null },
  };
}

// Stub canLaunchFromCurrent — w testach pomijamy spaceport check.
// Wpinamy się przez globalThis import override — najprościej przez bypass spec.

// ── T1 — MOS issueOrder z opts.fromFleet + _arrivalSyncYear ─────────────────
header('T1: MOS issueOrder z opts.fromFleet + _arrivalSyncYear (moveToPoint)');
{
  EventBus.clear?.();
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const v = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  vm.addMock(v);

  // Plain order — naturalArrival
  const r1 = mos.issueOrder('v_1', {
    type: 'moveToPoint',
    targetPoint: { x: 100, y: 0 },
    bypassSpaceportCheck: true,
  });
  assert(r1.ok, 'plain moveToPoint OK');
  const natArrival = v.mission.arrivalYear;
  // Cofnij — następny order z _arrivalSyncYear później niż natural.
  const futureSyncYear = natArrival + 50;
  mos.cancelOrder('v_1', 'test_reset');
  // Reset vessel position do startu
  v.position.x = 0; v.position.y = 0;
  v.position.state = 'orbiting'; v.position.dockedAt = 'p1';

  const r2 = mos.issueOrder('v_1', {
    type: 'moveToPoint',
    targetPoint: { x: 100, y: 0 },
    bypassSpaceportCheck: true,
    _arrivalSyncYear: futureSyncYear,
  }, { fromFleet: 'fleet_test' });
  assert(r2.ok, 'moveToPoint z _arrivalSyncYear OK');
  assert(Math.abs(v.mission.arrivalYear - futureSyncYear) < 0.01,
         `arrivalYear override ${v.mission.arrivalYear.toFixed(2)} ≈ ${futureSyncYear}`);
  assert(v.movementOrder._fromFleet === 'fleet_test', '_fromFleet propagowany do orderu');
}

// ── T2 — Sync ETA core ──────────────────────────────────────────────────────
header('T2: Sync ETA core — różne dist + speed → fleet_eta = max(native_eta)');
{
  // Sprawdzamy tylko logikę FleetSystem.issueFleetOrder math, bez ticka MOS.
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const fs = new FleetSystem(vm);
  window.KOSMOS.fleetSystem = fs;

  // 2 vessele:
  //   v_fast: pos (0,0), speedAU 2.0 → dist 5 AU = 550 px → eta = 550/220 = 2.5 yr
  //   v_slow: pos (0,0), speedAU 1.0 → dist 5 AU = 550 px → eta = 550/110 = 5.0 yr
  // → fleet_eta = 5.0 yr, arrivalSyncYear = gameTime + 5.0 = 105.0
  const fleet = fs.createFleet('Alpha');
  const vFast = makeVessel('v_fast', { speedAU: 2.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  const vSlow = makeVessel('v_slow', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  vm.addMock(vFast); vm.addMock(vSlow);
  fs.addMember(fleet.id, 'v_fast');
  fs.addMember(fleet.id, 'v_slow');

  const target = { x: 5 * AU_TO_PX, y: 0 };  // 5 AU
  const res = fs.issueFleetOrder(fleet.id, {
    type: 'moveToPoint',
    targetPoint: target,
    bypassSpaceportCheck: true,
  });
  assert(res.ok && res.accepted.length === 2, `issueFleetOrder accepted obu (acc=${res.accepted.length})`);
  // Fleet ETA: max(5/2, 5/1) = 5.0
  assert(Math.abs(res.fleetEta - 5.0) < 0.01, `fleetEta ≈ 5.0 (got ${res.fleetEta})`);
  // Każdy vessel ma mission.arrivalYear = gameTime + 5.0 = 105.0
  // ALE — v_fast naturalArrival = 100 + 2.5 = 102.5, klampowany do max(102.5, 105) = 105
  //        v_slow naturalArrival = 100 + 5.0 = 105.0
  assert(Math.abs(vFast.mission.arrivalYear - 105) < 0.01,
         `v_fast arrivalYear klampowany do 105 (got ${vFast.mission.arrivalYear})`);
  assert(Math.abs(vSlow.mission.arrivalYear - 105) < 0.01,
         `v_slow arrivalYear ≈ 105 (got ${vSlow.mission.arrivalYear})`);
}

// ── T3 — Speed cap dla pursue ───────────────────────────────────────────────
header('T3: Speed cap dla pursue — clamp do min(memberSpeeds)');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const fs = new FleetSystem(vm);
  window.KOSMOS.fleetSystem = fs;
  // Stub EntityManager dla resolveTarget
  const { default: EntityManagerDefault } = await import('./src/core/EntityManager.js');
  // Target = obcy vessel z velocity, w VM ale poza floty.
  const enemy = makeVessel('e_1', { speedAU: 0.5, ownerEmpireId: 'enemy', position: { x: 100, y: 100, state: 'in_transit', dockedAt: null } });
  vm.addMock(enemy);

  const fleet = fs.createFleet('Bravo');
  const v1 = makeVessel('v_a', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  const v2 = makeVessel('v_b', { speedAU: 2.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  const v3 = makeVessel('v_c', { speedAU: 3.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  vm.addMock(v1); vm.addMock(v2); vm.addMock(v3);
  fs.addMember(fleet.id, 'v_a');
  fs.addMember(fleet.id, 'v_b');
  fs.addMember(fleet.id, 'v_c');

  const res = fs.issueFleetOrder(fleet.id, { type: 'pursue', targetEntityId: 'e_1' });
  assert(res.ok, `pursue fleet order OK (acc=${res.accepted.length}, rej=${res.rejected.length})`);
  assert(Math.abs(res.speedCap - 1.0) < 0.001, `speedCap === min(1.0, 2.0, 3.0) = 1.0 (got ${res.speedCap})`);
  // Each vessel order has _speedCapAU = 1.0
  const orders = ['v_a', 'v_b', 'v_c'].map(id => vm.getVessel(id).movementOrder);
  assert(orders.every(o => o && o._speedCapAU === 1.0),
         'wszystkie ordery dostały _speedCapAU=1.0');
}

// ── T4 — preferMaxRange w engage ───────────────────────────────────────────
header('T4: preferMaxRange propagowany do order (P3 doctrine kite hook)');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  // Vessel z weapon module — żeby _issueEngage nie odrzucał no_weapons.
  // Najprostsze: ustawiamy speedAU + modules ['weapon_laser']
  const v = makeVessel('v_eng', { speedAU: 1.0, modules: ['weapon_laser'], position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  vm.addMock(v);
  const enemy = makeVessel('e_eng', { speedAU: 0.5, ownerEmpireId: 'enemy', position: { x: 100, y: 0, state: 'in_transit', dockedAt: null } });
  vm.addMock(enemy);

  const r = mos.issueOrder('v_eng', {
    type: 'engage',
    targetEntityId: 'e_eng',
    preferMaxRange: true,
  });
  assert(r.ok, `engage z preferMaxRange OK (reason=${r.reason ?? '-'})`);
  if (r.ok) {
    assert(v.movementOrder.preferMaxRange === true, 'order.preferMaxRange === true');
  } else { fail++; }  // dodatkowy fail żeby liczyć
}

// ── T5 — FleetSystem.issueFleetOrder fan-out + agregacja ───────────────────
header('T5: FleetSystem.issueFleetOrder fan-out + agregacja accepted/rejected');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const fs = new FleetSystem(vm);
  window.KOSMOS.fleetSystem = fs;

  // Empty fleet → ok:false reason:fleet_empty
  const fEmpty = fs.createFleet('Empty');
  const r0 = fs.issueFleetOrder(fEmpty.id, { type: 'moveToPoint', targetPoint: { x: 100, y: 0 } });
  assert(!r0.ok && r0.reason === 'fleet_empty', 'empty fleet → fleet_empty');

  const fleet = fs.createFleet('Charlie');
  const v1 = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  const v2 = makeVessel('v_2', { speedAU: 1.5, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  vm.addMock(v1); vm.addMock(v2);
  fs.addMember(fleet.id, 'v_1');
  fs.addMember(fleet.id, 'v_2');

  const r = fs.issueFleetOrder(fleet.id, {
    type: 'moveToPoint',
    targetPoint: { x: 100, y: 0 },
    bypassSpaceportCheck: true,
  });
  assert(r.ok && r.accepted.length === 2, 'fan-out: 2 vessele accepted');
  assert(fleet.activeOrder?.type === 'moveToPoint', 'fleet.activeOrder set');
  assert(Object.keys(fleet.activeOrder.memberOrderIds).length === 2,
         'memberOrderIds ma 2 entries');
  // Brak member → ok:false reason:no_eligible_members
  // Symulujemy: usuwamy oba vessele z VM (orphan)
  vm._vessels.delete('v_1');
  vm._vessels.delete('v_2');
  // Tworzymy świeżą flotę z orphan-only
  const fOrphan = fs.createFleet('Orphan');
  fOrphan.memberIds = ['ghost_a', 'ghost_b'];  // direct mutation dla testu
  const r2 = fs.issueFleetOrder(fOrphan.id, { type: 'moveToPoint', targetPoint: { x: 50, y: 0 } });
  assert(!r2.ok && r2.reason === 'no_eligible_members', 'orphan members → no_eligible_members');
}

// ── T6 — fleet.activeOrder + cancelFleetOrder ─────────────────────────────
header('T6: fleet.activeOrder tracking + cancelFleetOrder');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const fs = new FleetSystem(vm);
  window.KOSMOS.fleetSystem = fs;

  const fleet = fs.createFleet('Delta');
  const v = makeVessel('v_d', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  vm.addMock(v);
  fs.addMember(fleet.id, 'v_d');
  fs.issueFleetOrder(fleet.id, {
    type: 'moveToPoint',
    targetPoint: { x: 100, y: 0 },
    bypassSpaceportCheck: true,
  });
  const orderId = v.movementOrder.id;
  assert(fleet.activeOrder.memberOrderIds['v_d'] === orderId,
         'activeOrder.memberOrderIds zawiera vessel→orderId');
  const cancelled = fs.cancelFleetOrder(fleet.id, 'test');
  assert(cancelled && fleet.activeOrder === null, 'cancelFleetOrder → activeOrder=null');
  // Vessel order powinien być cancelled przez MOS.cancelOrder
  assert(v.movementOrder === null || v.movementOrder.status === 'cancelled',
         `vessel order cancelled w MOS (status=${v.movementOrder?.status ?? 'null'})`);
}

// ── T7 — orderCompleted → drop from memberOrderIds ─────────────────────────
header('T7: vessel:orderCompleted → drop entry z memberOrderIds → fleet done');
{
  EventBus.clear?.();
  setNextFleetId(1);
  const vm = makeVM();
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.vesselManager = vm;
  window.KOSMOS.movementOrderSystem = mos;
  const fs = new FleetSystem(vm);
  window.KOSMOS.fleetSystem = fs;

  const fleet = fs.createFleet('Echo');
  const v1 = makeVessel('v_e1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  const v2 = makeVessel('v_e2', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'p1' } });
  vm.addMock(v1); vm.addMock(v2);
  fs.addMember(fleet.id, 'v_e1');
  fs.addMember(fleet.id, 'v_e2');
  fs.issueFleetOrder(fleet.id, {
    type: 'moveToPoint',
    targetPoint: { x: 100, y: 0 },
    bypassSpaceportCheck: true,
  });
  const oid1 = v1.movementOrder.id;
  const oid2 = v2.movementOrder.id;

  // Symuluj orderCompleted dla v_e1
  let completedFleetEmit = null;
  EventBus.on('fleet:orderCompleted', (p) => { completedFleetEmit = p; });
  EventBus.emit('vessel:orderCompleted', { vesselId: 'v_e1', orderId: oid1 });
  assert(fleet.activeOrder && !fleet.activeOrder.memberOrderIds['v_e1'] && fleet.activeOrder.memberOrderIds['v_e2'],
         'po v_e1 completed: drop v_e1 z memberOrderIds, v_e2 zostaje');
  assert(completedFleetEmit === null, 'fleet:orderCompleted NIE jeszcze emitowany (v_e2 active)');

  // Drugi vessel completed → finalize fleet order
  EventBus.emit('vessel:orderCompleted', { vesselId: 'v_e2', orderId: oid2 });
  assert(fleet.activeOrder === null && completedFleetEmit?.fleetId === fleet.id,
         'po v_e2 completed: activeOrder=null + fleet:orderCompleted emitowany');
}

// ── T8 — buildMenuOptions fleet-context ────────────────────────────────────
header('T8: RightClickMenuOptions buildMenuOptions fleet-context');
{
  EventBus.clear?.();
  // Setup: fleet "Tango" istnieje w window.KOSMOS.fleetSystem
  setNextFleetId(1);
  const vm = makeVM();
  const fs = new FleetSystem(vm);
  window.KOSMOS.fleetSystem = fs;
  fs.createFleet('Tango');
  const fleetId = fs.listFleets()[0].id;

  // Empty target + selectedFleetId set → fleet.moveToPoint widoczne
  const target = { type: 'empty', worldPoint: { x: 50, y: 0 } };
  const optsFleet = buildMenuOptions(target, { fleetId });
  const hasFleetMove = optsFleet.some(o => o.id === 'fleet.moveToPoint');
  assert(hasFleetMove, 'empty + fleetId → fleet.moveToPoint widoczne');
  // Plain moveToPoint (requiresSelection) NIE widoczne gdy fleet active i brak vesselId
  const hasVesselMove = optsFleet.some(o => o.id === 'moveToPoint' && o.requiresSelection);
  assert(!hasVesselMove, 'empty + fleetId BEZ vesselId → moveToPoint (vessel) ukryty');

  // Enemy vessel + fleetId → fleet.engage + fleet.pursue widoczne
  const targetEnemy = { type: 'enemyVessel', entityId: 'e_x' };
  const optsEnemy = buildMenuOptions(targetEnemy, { fleetId });
  const fEngage = optsEnemy.some(o => o.id === 'fleet.engage');
  const fPursue = optsEnemy.some(o => o.id === 'fleet.pursue');
  assert(fEngage && fPursue, 'enemy + fleetId → fleet.engage + fleet.pursue widoczne');

  // Label zawiera nazwę floty w suffix
  const fMoveOpt = optsFleet.find(o => o.id === 'fleet.moveToPoint');
  assert(fMoveOpt?.labelPL?.includes('Tango'), `labelPL zawiera nazwę floty (${fMoveOpt?.labelPL})`);
}

console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
