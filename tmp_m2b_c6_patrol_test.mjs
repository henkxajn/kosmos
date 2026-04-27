// Smoke test M2b Commit 6 — MOS goToPOI + patrol runtime
//
// Pokrywa T1-T7 (~30 cases):
//   T1 _advancePatrolIndex ping_pong — 6 cases (forward, hit-end bounce, hit-start bounce, full cycle)
//   T2 _advancePatrolIndex loop — 3 cases (forward, wrap-around, full cycle)
//   T3 loopMode resolution — 3 cases (no poiId → ping_pong, POI loop → loop, POI deleted → ping_pong)
//   T4 _issueGoToPOI — 5 cases (waypoint OK, patrol→wp[0], rally→center, POI not found, flag OFF)
//   T5 _issuePatrol — 6 cases (POI patrol OK, manual route OK, POI not found, POI type=waypoint reject, route len<2, flag OFF)
//   T6 _tickPatrolOrder — 4 cases (move + advance, near waypoint advance, partial step, corrupted patrolRoute)
//   T7 events emission — 3 cases (goToPOIIssued, patrolStarted, patrolWaypointReached)
//
// Run: node tmp_m2b_c6_patrol_test.mjs

// ── Stub browser globals (PRZED importami) ─────────────────────────────────
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem:    (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {
  timeSystem: { gameTime: 0 },
};

// ── Imports (real singletons) ──────────────────────────────────────────────
const EventBus              = (await import('./src/core/EventBus.js')).default;
const gameState             = (await import('./src/core/GameState.js')).default;
const { GAME_CONFIG }       = await import('./src/config/GameConfig.js');
const { POIRegistry }       = await import('./src/systems/POIRegistry.js');
const { MovementOrderSystem } = await import('./src/systems/MovementOrderSystem.js');
const { ORDER_TYPES, validateOrder, TYPES_WITH_POI_TARGET } = await import('./src/data/MovementOrderTypes.js');

// ── Test harness ───────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err.message}`);
  }
}
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}
function assertTrue(cond, label) {
  if (!cond) throw new Error(`${label}: expected true, got false`);
}
function assertFalse(cond, label) {
  if (cond) throw new Error(`${label}: expected false, got true`);
}

// EventBus capture helper
function captureEvent(eventName) {
  const captured = [];
  const handler = (payload) => captured.push(payload);
  EventBus.on(eventName, handler);
  return {
    captured,
    detach: () => {
      const arr = EventBus.listeners.get(eventName);
      if (!arr) return;
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    },
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────
function makeVessel(id = 'v_1', overrides = {}) {
  return {
    id,
    name:        `Vessel ${id}`,
    speedAU:     1.0,
    fuel:        { current: 1000, consumption: 0 },
    velocity:    { vx: 0, vy: 0, updatedYear: 0 },
    position:    { x: 0, y: 0, state: 'orbiting', dockedAt: null },
    mission:     null,
    movementOrder: null,
    status:      'idle',
    isWreck:     false,
    missionLog:  [],
    systemId:    'sys_home',
    ...overrides,
  };
}

function makeVesselManagerMock(vessels = []) {
  const map = new Map(vessels.map(v => [v.id, v]));
  return {
    getVessel:     (id) => map.get(id) ?? null,
    getAllVessels: () => [...map.values()],
    _calcRoute: (sx, sy, tx, ty, _sysId) => ({
      totalDist: Math.hypot(tx - sx, ty - sy),
      waypoints: [],
    }),
    _vessels: map,
    addVessel: (v) => map.set(v.id, v),
  };
}

// Reset state przed każdym testem
function resetState() {
  gameState.reset();
  GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
  GAME_CONFIG.FEATURES.poiSystem = true;
  GAME_CONFIG.FEATURES.movementOrders = true;
  // Clear EventBus listeners (defensywne — testy emitują events)
  if (EventBus.listeners) EventBus.listeners.clear();
}

// ──────────────────────────────────────────────────────────────────────────
// T1 — _advancePatrolIndex ping_pong
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T1 — _advancePatrolIndex ping_pong]');

test('T1.1 — n=4, idx=0, dir=1 → next idx=1, dir=1', () => {
  resetState();
  const vm = makeVesselManagerMock();
  const mos = new MovementOrderSystem(vm);
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 0, patrolDirection: 1, poiId: null };
  mos._advancePatrolIndex(order);
  assertEq(order.patrolWaypointIndex, 1, 'index');
  assertEq(order.patrolDirection, 1, 'direction');
});

test('T1.2 — n=4, idx=2, dir=1 → next idx=3, dir=1', () => {
  resetState();
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 2, patrolDirection: 1, poiId: null };
  mos._advancePatrolIndex(order);
  assertEq(order.patrolWaypointIndex, 3, 'index');
  assertEq(order.patrolDirection, 1, 'direction');
});

test('T1.3 — n=4, idx=3, dir=1 → hit end, next idx=2, dir=-1', () => {
  resetState();
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 3, patrolDirection: 1, poiId: null };
  mos._advancePatrolIndex(order);
  assertEq(order.patrolWaypointIndex, 2, 'index');
  assertEq(order.patrolDirection, -1, 'direction');
});

test('T1.4 — n=4, idx=2, dir=-1 → next idx=1, dir=-1', () => {
  resetState();
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 2, patrolDirection: -1, poiId: null };
  mos._advancePatrolIndex(order);
  assertEq(order.patrolWaypointIndex, 1, 'index');
  assertEq(order.patrolDirection, -1, 'direction');
});

test('T1.5 — n=4, idx=0, dir=-1 → hit start, next idx=1, dir=1', () => {
  resetState();
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 0, patrolDirection: -1, poiId: null };
  mos._advancePatrolIndex(order);
  assertEq(order.patrolWaypointIndex, 1, 'index');
  assertEq(order.patrolDirection, 1, 'direction');
});

test('T1.6 — full cycle 8 advance steps z idx=0 → [1,2,3,2,1,0,1,2]', () => {
  resetState();
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 0, patrolDirection: 1, poiId: null };
  const seq = [];
  for (let i = 0; i < 8; i++) {
    mos._advancePatrolIndex(order);
    seq.push(order.patrolWaypointIndex);
  }
  assertEq(seq, [1,2,3,2,1,0,1,2], 'sequence');
});

// ──────────────────────────────────────────────────────────────────────────
// T2 — _advancePatrolIndex loop
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T2 — _advancePatrolIndex loop]');

test('T2.1 — n=4, idx=0, POI loopMode=loop → next idx=1', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'patrol', name:'Test', waypoints:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], loopMode:'loop' });
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 0, patrolDirection: 1, poiId: r.poiId };
  mos._advancePatrolIndex(order);
  assertEq(order.patrolWaypointIndex, 1, 'index');
});

test('T2.2 — n=4, idx=3, POI loopMode=loop → wrap idx=0', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'patrol', name:'Test', waypoints:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], loopMode:'loop' });
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 3, patrolDirection: 1, poiId: r.poiId };
  mos._advancePatrolIndex(order);
  assertEq(order.patrolWaypointIndex, 0, 'index (wrap)');
});

test('T2.3 — full cycle loop 6 steps z idx=0 → [1,2,3,0,1,2]', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'patrol', name:'Test', waypoints:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], loopMode:'loop' });
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 0, patrolDirection: 1, poiId: r.poiId };
  const seq = [];
  for (let i = 0; i < 6; i++) {
    mos._advancePatrolIndex(order);
    seq.push(order.patrolWaypointIndex);
  }
  assertEq(seq, [1,2,3,0,1,2], 'sequence');
});

// ──────────────────────────────────────────────────────────────────────────
// T3 — loopMode resolution
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T3 — loopMode resolution]');

test('T3.1 — order.poiId=null → fallback ping_pong', () => {
  resetState();
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  // ping_pong: idx=3, dir=1 (n=4) → hit end → idx=2, dir=-1
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 3, patrolDirection: 1, poiId: null };
  mos._advancePatrolIndex(order);
  assertEq(order.patrolWaypointIndex, 2, 'idx (ping_pong bounce)');
  assertEq(order.patrolDirection, -1, 'dir reversed');
});

test('T3.2 — order.poiId set, POI loopMode=loop → uses loop', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'patrol', name:'L', waypoints:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], loopMode:'loop' });
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 3, patrolDirection: 1, poiId: r.poiId };
  mos._advancePatrolIndex(order);
  assertEq(order.patrolWaypointIndex, 0, 'idx wrap (loop)');
});

test('T3.3 — order.poiId set ale POI usunięty → fallback ping_pong', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'patrol', name:'L', waypoints:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], loopMode:'loop' });
  // Patch reg.getPOI żeby zwracał null jak po delete (ale order.poiId pozostaje)
  reg.deletePOI(r.poiId);
  const mos = new MovementOrderSystem(makeVesselManagerMock());
  const order = { patrolRoute: [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}], patrolWaypointIndex: 3, patrolDirection: 1, poiId: r.poiId };
  mos._advancePatrolIndex(order);
  // ping_pong fallback po deleted POI
  assertEq(order.patrolWaypointIndex, 2, 'idx (ping_pong bounce)');
  assertEq(order.patrolDirection, -1, 'dir reversed');
});

// ──────────────────────────────────────────────────────────────────────────
// T4 — _issueGoToPOI
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T4 — _issueGoToPOI]');

test('T4.1 — POI waypoint OK → order.type=goToPOI, poiId set, emit goToPOIIssued', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'waypoint', name:'WP', point:{x:100,y:100} });
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const cap = captureEvent('vessel:goToPOIIssued');
  const result = mos.issueOrder('v_1', { type:'goToPOI', poiId: r.poiId });
  assertTrue(result.ok, 'ok');
  assertEq(v.movementOrder.type, 'goToPOI', 'order type');
  assertEq(v.movementOrder.poiId, r.poiId, 'order poiId');
  assertEq(cap.captured.length, 1, 'event count');
  assertEq(cap.captured[0].poiId, r.poiId, 'event poiId');
  cap.detach();
});

test('T4.2 — POI patrol → targetPoint = waypoints[0]', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'patrol', name:'P', waypoints:[{x:50,y:50},{x:150,y:150}], loopMode:'loop' });
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const result = mos.issueOrder('v_1', { type:'goToPOI', poiId: r.poiId });
  assertTrue(result.ok, 'ok');
  assertEq(v.mission.targetX, 50, 'targetX = waypoints[0].x');
  assertEq(v.mission.targetY, 50, 'targetY = waypoints[0].y');
});

test('T4.3 — POI rally → targetPoint = center', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'rally', name:'R', center:{x:200,y:200}, waitForCount:3 });
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const result = mos.issueOrder('v_1', { type:'goToPOI', poiId: r.poiId });
  assertTrue(result.ok, 'ok');
  assertEq(v.mission.targetX, 200, 'targetX = center.x');
});

test('T4.4 — POI not found → ok:false, reason=poi_not_found', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const result = mos.issueOrder('v_1', { type:'goToPOI', poiId: 'poi_999' });
  assertFalse(result.ok, 'not ok');
  assertEq(result.reason, 'poi_not_found', 'reason');
});

test('T4.5 — flag poiSystem=false → ok:false, reason=feature_disabled', () => {
  resetState();
  GAME_CONFIG.FEATURES.poiSystem = false;
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const result = mos.issueOrder('v_1', { type:'goToPOI', poiId: 'poi_1' });
  assertFalse(result.ok, 'not ok');
  assertEq(result.reason, 'feature_disabled', 'reason');
});

// ──────────────────────────────────────────────────────────────────────────
// T5 — _issuePatrol
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T5 — _issuePatrol]');

test('T5.1 — POI patrol OK → order.type=patrol, poiId set, route=POI.waypoints, emit patrolStarted', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'patrol', name:'P', waypoints:[{x:0,y:0},{x:100,y:0},{x:100,y:100}], loopMode:'ping_pong' });
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const cap = captureEvent('vessel:patrolStarted');
  const result = mos.issueOrder('v_1', { type:'patrol', poiId: r.poiId });
  assertTrue(result.ok, 'ok');
  assertEq(v.movementOrder.type, 'patrol', 'order type');
  assertEq(v.movementOrder.poiId, r.poiId, 'order poiId');
  assertEq(v.movementOrder.patrolRoute.length, 3, 'route length');
  assertEq(v.movementOrder.patrolWaypointIndex, 0, 'init index');
  assertEq(v.movementOrder.patrolDirection, 1, 'init direction');
  assertEq(cap.captured.length, 1, 'event count');
  assertEq(cap.captured[0].poiId, r.poiId, 'event poiId');
  assertEq(cap.captured[0].waypointIndex, 0, 'event waypointIndex');
  cap.detach();
});

test('T5.2 — manual patrolRoute (no POI) OK → poiId=null', () => {
  resetState();
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const result = mos.issueOrder('v_1', { type:'patrol', patrolRoute:[{x:0,y:0},{x:50,y:50}] });
  assertTrue(result.ok, 'ok');
  assertEq(v.movementOrder.poiId, null, 'poiId null');
  assertEq(v.movementOrder.patrolRoute.length, 2, 'route length');
});

test('T5.3 — POI not found → ok:false', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const result = mos.issueOrder('v_1', { type:'patrol', poiId: 'poi_999' });
  assertFalse(result.ok, 'not ok');
  assertEq(result.reason, 'poi_not_found', 'reason');
});

test('T5.4 — POI type=waypoint → ok:false, reason=poi_not_patrol_type', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'waypoint', name:'WP', point:{x:0,y:0} });
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const result = mos.issueOrder('v_1', { type:'patrol', poiId: r.poiId });
  assertFalse(result.ok, 'not ok');
  assertEq(result.reason, 'poi_not_patrol_type', 'reason');
});

test('T5.5 — patrolRoute z 1 punktem → walidator odrzuca patrol_needs_poi_or_route', () => {
  resetState();
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const result = mos.issueOrder('v_1', { type:'patrol', patrolRoute:[{x:0,y:0}] });
  assertFalse(result.ok, 'not ok');
  assertEq(result.reason, 'patrol_needs_poi_or_route', 'reason');
});

test('T5.6 — flag poiSystem=false → ok:false, reason=feature_disabled', () => {
  resetState();
  GAME_CONFIG.FEATURES.poiSystem = false;
  const v = makeVessel('v_1');
  const vm = makeVesselManagerMock([v]);
  const mos = new MovementOrderSystem(vm);
  const result = mos.issueOrder('v_1', { type:'patrol', patrolRoute:[{x:0,y:0},{x:50,y:0}] });
  assertFalse(result.ok, 'not ok');
  assertEq(result.reason, 'feature_disabled', 'reason');
});

// ──────────────────────────────────────────────────────────────────────────
// T6 — _tickPatrolOrder
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T6 — _tickPatrolOrder]');

test('T6.1 — vessel daleko od wp → krok ruchu (bez advance)', () => {
  resetState();
  const v = makeVessel('v_1', { position:{x:0,y:0,state:'in_transit',dockedAt:null}, speedAU: 1.0 });
  const order = {
    id:'mo_1', type:'patrol', status:'active',
    patrolRoute:[{x:1000,y:0},{x:2000,y:0}],
    patrolWaypointIndex: 0, patrolDirection: 1, poiId: null,
  };
  const mos = new MovementOrderSystem(makeVesselManagerMock([v]));
  // dPhysicsYear=0.5, speedAU=1, AU_TO_PX=110 → speedPxPerYear=110, step=55
  mos._tickPatrolOrder(v, order, 0.5, 1.0);
  assertTrue(v.position.x > 0 && v.position.x < 1000, 'moved partial');
  assertEq(order.patrolWaypointIndex, 0, 'no advance');
});

test('T6.2 — vessel blisko wp (dist < THREAT_RADIUS_PX) → emit patrolWaypointReached + advance', () => {
  resetState();
  const v = makeVessel('v_1', { position:{x:5,y:0,state:'in_transit',dockedAt:null} });
  const order = {
    id:'mo_1', type:'patrol', status:'active',
    patrolRoute:[{x:0,y:0},{x:100,y:0},{x:200,y:0}],
    patrolWaypointIndex: 0, patrolDirection: 1, poiId: null,
  };
  const mos = new MovementOrderSystem(makeVesselManagerMock([v]));
  const cap = captureEvent('vessel:patrolWaypointReached');
  mos._tickPatrolOrder(v, order, 0.1, 1.0);
  assertEq(cap.captured.length, 1, 'event emitted');
  assertEq(cap.captured[0].waypointIndex, 0, 'event idx (właśnie osiągnięty)');
  assertEq(order.patrolWaypointIndex, 1, 'advance to next');
  cap.detach();
});

test('T6.3 — emit patrolWaypointReached PRZED _advancePatrolIndex (kolejność)', () => {
  resetState();
  const v = makeVessel('v_1', { position:{x:0,y:0,state:'in_transit',dockedAt:null} });
  const order = {
    id:'mo_1', type:'patrol', status:'active',
    patrolRoute:[{x:0,y:0},{x:100,y:0}],
    patrolWaypointIndex: 0, patrolDirection: 1, poiId: null,
  };
  const mos = new MovementOrderSystem(makeVesselManagerMock([v]));
  let observedIdxAtEmit = -1;
  const handler = (payload) => { observedIdxAtEmit = order.patrolWaypointIndex; };
  EventBus.on('vessel:patrolWaypointReached', handler);
  mos._tickPatrolOrder(v, order, 0.1, 1.0);
  // Handler musiał odczytać idx=0 (PRZED advance), nie idx=1 (po advance)
  assertEq(observedIdxAtEmit, 0, 'handler widział idx PRZED advance');
  // Po _tickPatrolOrder advance już zaszedł
  assertEq(order.patrolWaypointIndex, 1, 'advance po emit');
  // Cleanup
  const arr = EventBus.listeners.get('vessel:patrolWaypointReached');
  if (arr) {
    const i = arr.indexOf(handler);
    if (i >= 0) arr.splice(i, 1);
  }
});

test('T6.4 — corrupted patrolRoute=null → _blockAndCancel z patrol_invalid_waypoint', () => {
  resetState();
  const v = makeVessel('v_1', { position:{x:0,y:0,state:'in_transit',dockedAt:null} });
  const order = {
    id:'mo_1', type:'patrol', status:'active',
    patrolRoute: null,  // corruption
    patrolWaypointIndex: 0, patrolDirection: 1, poiId: null, blockReason: null,
  };
  const mos = new MovementOrderSystem(makeVesselManagerMock([v]));
  mos._byVessel.set('v_1', order);
  const cap = captureEvent('vessel:orderBlocked');
  mos._tickPatrolOrder(v, order, 0.1, 1.0);
  assertEq(order.status, 'blocked', 'status blocked');
  assertEq(order.blockReason, 'patrol_invalid_waypoint', 'reason');
  assertEq(cap.captured.length, 1, 'event emitted');
  cap.detach();
});

// ──────────────────────────────────────────────────────────────────────────
// T7 — events emission payload shape
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T7 — events emission payload]');

test('T7.1 — vessel:goToPOIIssued payload {vesselId, orderId, poiId}', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'waypoint', name:'WP', point:{x:100,y:100} });
  const v = makeVessel('v_X');
  const mos = new MovementOrderSystem(makeVesselManagerMock([v]));
  const cap = captureEvent('vessel:goToPOIIssued');
  mos.issueOrder('v_X', { type:'goToPOI', poiId: r.poiId });
  assertEq(cap.captured.length, 1, 'count');
  const p = cap.captured[0];
  assertEq(p.vesselId, 'v_X', 'vesselId');
  assertTrue(typeof p.orderId === 'string' && p.orderId.startsWith('mo_'), 'orderId format');
  assertEq(p.poiId, r.poiId, 'poiId');
  cap.detach();
});

test('T7.2 — vessel:patrolStarted payload {vesselId, orderId, poiId, waypointIndex:0}', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  window.KOSMOS.poiRegistry = reg;
  const r = reg.createPOI({ type:'patrol', name:'P', waypoints:[{x:0,y:0},{x:50,y:0}], loopMode:'loop' });
  const v = makeVessel('v_Y');
  const mos = new MovementOrderSystem(makeVesselManagerMock([v]));
  const cap = captureEvent('vessel:patrolStarted');
  mos.issueOrder('v_Y', { type:'patrol', poiId: r.poiId });
  assertEq(cap.captured.length, 1, 'count');
  const p = cap.captured[0];
  assertEq(p.vesselId, 'v_Y', 'vesselId');
  assertTrue(typeof p.orderId === 'string', 'orderId');
  assertEq(p.poiId, r.poiId, 'poiId');
  assertEq(p.waypointIndex, 0, 'waypointIndex');
  cap.detach();
});

test('T7.3 — vessel:patrolWaypointReached payload {vesselId, orderId, waypointIndex}', () => {
  resetState();
  const v = makeVessel('v_Z', { position:{x:0,y:0,state:'in_transit',dockedAt:null} });
  const order = {
    id:'mo_42', type:'patrol', status:'active',
    patrolRoute:[{x:0,y:0},{x:100,y:0}],
    patrolWaypointIndex: 0, patrolDirection: 1, poiId: null,
  };
  const mos = new MovementOrderSystem(makeVesselManagerMock([v]));
  const cap = captureEvent('vessel:patrolWaypointReached');
  mos._tickPatrolOrder(v, order, 0.1, 1.0);
  assertEq(cap.captured.length, 1, 'count');
  const p = cap.captured[0];
  assertEq(p.vesselId, 'v_Z', 'vesselId');
  assertEq(p.orderId, 'mo_42', 'orderId');
  assertEq(p.waypointIndex, 0, 'waypointIndex');
  cap.detach();
});

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────
console.log(`\n[SUMMARY] passed=${passed} failed=${failed}`);
if (failed > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.err.message}`);
  }
  process.exit(1);
}
process.exit(0);
