// Smoke test M2b Commit 7 (FINAL) — MOS escort runtime
//
// Pokrywa T1-T5 (~20 cases):
//   T1 _issueEscort validation — 6 cases (valid, not_found, wreck, self, not_vessel, flag OFF)
//   T2 _tickEscortOrder movement — 5 cases (chase, in_range stop, partial step, escortee wreck, missing)
//   T3 flag gate + dispatcher — 3 cases (flag OFF, dispatcher routes escort to _tickEscortOrder, blocked status skips)
//   T4 events emission — 3 cases (escortStarted, escortLost, orderIssued)
//   T5 escortee lifecycle — 3 cases (chase moving escortee, wreck mid-escort, escortee orbiting)
//
// Rendering POI sprites NIE pokrywany — wymaga Three.js loader (jak C4).
// Visual review w real-flow Combat Sandbox.
//
// Run: node tmp_m2b_c7_escort_test.mjs

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
const { MovementOrderSystem } = await import('./src/systems/MovementOrderSystem.js');
const { ORDER_TYPES }       = await import('./src/data/MovementOrderTypes.js');

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;            // 110
const ESCORT_DIST_PX = 0.1 * AU_TO_PX;            // 11
const HALF_DIST_PX   = ESCORT_DIST_PX * 0.5;      // 5.5

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
function assertClose(actual, expected, eps, label) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${label}: expected ${expected} ± ${eps}, got ${actual}`);
  }
}
function assertTrue(cond, label) {
  if (!cond) throw new Error(`${label}: expected true, got false`);
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

function resetState() {
  gameState.reset();
  GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
  GAME_CONFIG.FEATURES.poiSystem = true;
  GAME_CONFIG.FEATURES.movementOrders = true;
  if (EventBus.listeners) EventBus.listeners.clear();
}

// ──────────────────────────────────────────────────────────────────────────
// T1 — _issueEscort validation (6 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T1 — _issueEscort validation]');

test('T1.1 — valid escortee (vessel) → ok, type=escort, escorteeId set, event emitted', () => {
  resetState();
  const escorter = makeVessel('v_1');
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  const cap = captureEvent('vessel:escortStarted');
  const result = mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  assertEq(result.ok, true, 'ok');
  assertTrue(typeof result.orderId === 'string', 'orderId is string');
  assertEq(escorter.movementOrder.type, 'escort', 'order.type');
  assertEq(escorter.movementOrder.escorteeId, 'v_2', 'order.escorteeId');
  assertEq(escorter.movementOrder.targetEntityId, 'v_2', 'order.targetEntityId');
  assertEq(escorter.movementOrder.status, 'active', 'status');
  assertEq(cap.captured.length, 1, 'one event');
  assertEq(cap.captured[0].vesselId, 'v_1', 'event vesselId');
  assertEq(cap.captured[0].escorteeId, 'v_2', 'event escorteeId');
  cap.detach();
});

test('T1.2 — escortee not found → escortee_not_found', () => {
  resetState();
  const escorter = makeVessel('v_1');
  const vm = makeVesselManagerMock([escorter]);
  const mos = new MovementOrderSystem(vm);

  const result = mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_ghost' });
  assertEq(result.ok, false, 'ok');
  assertEq(result.reason, 'escortee_not_found', 'reason');
});

test('T1.3 — escortee.isWreck=true → escortee_is_wreck', () => {
  resetState();
  const escorter = makeVessel('v_1');
  const escortee = makeVessel('v_2', { isWreck: true });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  const result = mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  assertEq(result.ok, false, 'ok');
  assertEq(result.reason, 'escortee_is_wreck', 'reason');
});

test('T1.4 — escortee === vessel (self) → escortee_self', () => {
  resetState();
  const escorter = makeVessel('v_1');
  const vm = makeVesselManagerMock([escorter]);
  const mos = new MovementOrderSystem(vm);

  const result = mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_1' });
  assertEq(result.ok, false, 'ok');
  assertEq(result.reason, 'escortee_self', 'reason');
});

test('T1.5 — escortee jest planetą (EntityManager only, not vessel) → escortee_not_vessel', async () => {
  resetState();
  const EntityManager = (await import('./src/core/EntityManager.js')).default;
  // Wstrzyknij planetę do EntityManager (bez vesselManager)
  const planet = { id: 'planet_1', name: 'TestPlanet', x: 200, y: 0, isWreck: false };
  EntityManager.add(planet);
  const escorter = makeVessel('v_1');
  const vm = makeVesselManagerMock([escorter]);
  const mos = new MovementOrderSystem(vm);

  const result = mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'planet_1' });
  assertEq(result.ok, false, 'ok');
  assertEq(result.reason, 'escortee_not_vessel', 'reason');
  // cleanup
  EntityManager.remove?.(planet.id);
});

test('T1.6 — flag poiSystem=false → feature_disabled', () => {
  resetState();
  GAME_CONFIG.FEATURES.poiSystem = false;
  const escorter = makeVessel('v_1');
  const escortee = makeVessel('v_2');
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  const result = mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  assertEq(result.ok, false, 'ok');
  assertEq(result.reason, 'feature_disabled', 'reason');
});

// ──────────────────────────────────────────────────────────────────────────
// T2 — _tickEscortOrder movement (5 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T2 — _tickEscortOrder movement]');

test('T2.1 — distPx=100, dPhys=1, speed=1AU → step≈94.5, position≈(94.5, 0)', () => {
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: null } });
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  const order = escorter.movementOrder;
  // distPx=100; speedPxPerYear = 1.0 * 110 = 110; halfDist=5.5.
  // stepPx = max(0, min(100-5.5, 110*1)) = 94.5
  mos._tickEscortOrder(escorter, order, 1.0, 0);
  assertClose(escorter.position.x, 94.5, 0.01, 'position.x');
  assertClose(escorter.position.y, 0, 0.01, 'position.y');
});

test('T2.2 — distPx=10 (już w zasięgu, < 11) → brak ruchu', () => {
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: null } });
  const escortee = makeVessel('v_2', { position: { x: 10, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  const order = escorter.movementOrder;
  mos._tickEscortOrder(escorter, order, 1.0, 0);
  assertEq(escorter.position.x, 0, 'position.x unchanged');
  assertEq(escorter.position.y, 0, 'position.y unchanged');
});

test('T2.3 — distPx=200, dPhys=0.5, speed=1AU → step=55 (limited by speed*dt)', () => {
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: null } });
  const escortee = makeVessel('v_2', { position: { x: 200, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  const order = escorter.movementOrder;
  // speedPxPerYear*dt = 110*0.5 = 55. distPx-halfDist = 200-5.5 = 194.5.
  // stepPx = min(194.5, 55) = 55.
  mos._tickEscortOrder(escorter, order, 0.5, 0);
  assertClose(escorter.position.x, 55, 0.01, 'position.x');
});

test('T2.4 — escortee wreck mid-tick → escortLost emitted, blockAndCancel', () => {
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: null } });
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  const order = escorter.movementOrder;
  // Symuluj wreck escortee
  escortee.isWreck = true;

  const lostCap = captureEvent('vessel:escortLost');
  const blockedCap = captureEvent('vessel:orderBlocked');
  mos._tickEscortOrder(escorter, order, 1.0, 0);

  assertEq(lostCap.captured.length, 1, 'one escortLost event');
  assertEq(lostCap.captured[0].vesselId, 'v_1', 'event vesselId');
  assertEq(lostCap.captured[0].reason, 'escortee_lost', 'event reason');
  assertEq(order.status, 'blocked', 'order.status blocked');
  assertEq(order.blockReason, 'escortee_lost', 'order.blockReason');
  assertEq(blockedCap.captured.length, 1, 'orderBlocked emitted');
  lostCap.detach(); blockedCap.detach();
});

test('T2.5 — escortee resolveTarget=null → escortLost emitted (same path jako wreck)', () => {
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: null } });
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  const order = escorter.movementOrder;
  // Symuluj missing escortee — usuń z vesselManager
  vm._vessels.delete('v_2');

  const cap = captureEvent('vessel:escortLost');
  mos._tickEscortOrder(escorter, order, 1.0, 0);

  assertEq(cap.captured.length, 1, 'escortLost emitted');
  assertEq(cap.captured[0].reason, 'escortee_lost', 'reason');
  assertEq(order.status, 'blocked', 'status blocked');
  cap.detach();
});

// ──────────────────────────────────────────────────────────────────────────
// T3 — flag gate + dispatcher (3 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T3 — flag gate + dispatcher]');

test('T3.1 — flag OFF mid-game (po issue) — _tickEscortOrder działa nadal (no flag check w tick)', () => {
  // Decyzja: flag tylko przy issue; już aktywny escort kontynuuje. Spójne z patrol.
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: null } });
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  const order = escorter.movementOrder;
  GAME_CONFIG.FEATURES.poiSystem = false;
  mos._tickEscortOrder(escorter, order, 1.0, 0);
  // Powinno się nadal poruszyć — flag tylko przy issue.
  assertClose(escorter.position.x, 94.5, 0.01, 'movement happens');
});

test('T3.2 — _tick dispatcher: order.type=escort, status=active → _tickEscortOrder wywołane', () => {
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: null } });
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  // ustaw lastTickYear i wywołaj _tick — gameYear przesunięty o 1
  mos._lastTickYear = 0;
  window.KOSMOS.timeSystem.gameTime = 1;
  mos._tick(1);  // civDy>0
  // po jednym tick'u escorter powinien się ruszyć
  assertTrue(escorter.position.x > 0, 'escorter moved via dispatcher');
});

test('T3.3 — _tick dispatcher: status=blocked → escort skipped (general status filter)', () => {
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: null } });
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  escorter.movementOrder.status = 'blocked';
  mos._lastTickYear = 0;
  window.KOSMOS.timeSystem.gameTime = 1;
  mos._tick(1);
  assertEq(escorter.position.x, 0, 'no movement when blocked');
});

// ──────────────────────────────────────────────────────────────────────────
// T4 — events emission (3 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T4 — events emission]');

test('T4.1 — vessel:escortStarted payload {vesselId, orderId, escorteeId}', () => {
  resetState();
  const escorter = makeVessel('v_1');
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  const cap = captureEvent('vessel:escortStarted');
  const result = mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  assertEq(cap.captured.length, 1, 'one event');
  const ev = cap.captured[0];
  assertEq(ev.vesselId, 'v_1', 'vesselId');
  assertEq(ev.orderId, result.orderId, 'orderId match');
  assertEq(ev.escorteeId, 'v_2', 'escorteeId');
  cap.detach();
});

test('T4.2 — vessel:escortLost payload {vesselId, orderId, reason}', () => {
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0 });
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  const result = mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  escortee.isWreck = true;
  const cap = captureEvent('vessel:escortLost');
  mos._tickEscortOrder(escorter, escorter.movementOrder, 1.0, 0);
  assertEq(cap.captured.length, 1, 'one event');
  const ev = cap.captured[0];
  assertEq(ev.vesselId, 'v_1', 'vesselId');
  assertEq(ev.orderId, result.orderId, 'orderId match');
  assertEq(ev.reason, 'escortee_lost', 'reason');
  cap.detach();
});

test('T4.3 — vessel:orderIssued (legacy M1) emitted dla escort', () => {
  resetState();
  const escorter = makeVessel('v_1');
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  const cap = captureEvent('vessel:orderIssued');
  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  assertEq(cap.captured.length, 1, 'orderIssued emitted');
  assertEq(cap.captured[0].order.type, 'escort', 'order.type=escort');
  cap.detach();
});

// ──────────────────────────────────────────────────────────────────────────
// T5 — escortee lifecycle (3 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T5 — escortee lifecycle]');

test('T5.1 — escortee się rusza między tickami → escort vessel kontynuuje chase', () => {
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: null } });
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  const order = escorter.movementOrder;
  // Tick 1: escorter zbliża się
  mos._tickEscortOrder(escorter, order, 1.0, 0);
  const x1 = escorter.position.x;
  assertTrue(x1 > 0, 'first tick moves escorter');

  // Escortee się przesuwa
  escortee.position.x = 250;

  // Tick 2: dystans wzrósł, escorter chase'uje dalej
  mos._tickEscortOrder(escorter, order, 1.0, 1.0);
  assertTrue(escorter.position.x > x1, 'escorter continues chase after escortee moved');
  assertEq(order.status, 'active', 'order still active');
});

test('T5.2 — escortee→wreck mid-escort → next tick → escortLost + blocked', () => {
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0 });
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: null } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  // First tick OK
  mos._tickEscortOrder(escorter, escorter.movementOrder, 1.0, 0);
  assertEq(escorter.movementOrder.status, 'active', 'still active');

  // Escortee wreck
  escortee.isWreck = true;

  const cap = captureEvent('vessel:escortLost');
  mos._tickEscortOrder(escorter, escorter.movementOrder, 1.0, 1);
  assertEq(cap.captured.length, 1, 'lost emitted on next tick');
  assertEq(escorter.movementOrder.status, 'blocked', 'blocked');
  cap.detach();
});

test('T5.3 — escortee orbiting (state=orbiting, dockedAt=planet) → escort kontynuuje chase do escortee.position', () => {
  // Decyzja z planu: escortee w orbicie/docked NADAL exists jako entity z position;
  // escort vessel kontynuuje (gracz może manualnie cancel jeśli chce).
  resetState();
  const escorter = makeVessel('v_1', { speedAU: 1.0, position: { x: 0, y: 0, state: 'orbiting', dockedAt: null } });
  const escortee = makeVessel('v_2', { position: { x: 100, y: 0, state: 'orbiting', dockedAt: 'planet_1' } });
  const vm = makeVesselManagerMock([escorter, escortee]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_1', { type: 'escort', targetEntityId: 'v_2' });
  const order = escorter.movementOrder;
  mos._tickEscortOrder(escorter, order, 1.0, 0);
  assertEq(order.status, 'active', 'order remains active when escortee orbiting');
  assertTrue(escorter.position.x > 0, 'escorter chases escortee position');
});

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(70)}`);
console.log(`Test results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`);
    console.log(`    ${f.err.message}`);
  }
  process.exit(1);
} else {
  console.log('All M2b C7 tests PASS');
  process.exit(0);
}
