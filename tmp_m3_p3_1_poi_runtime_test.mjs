// ── M3 P3.1 — POI Runtime Systems smoke test ───────────────────────────────
// Pure-logic only (Node ESM, no DOM/canvas/Three).
//
// T1 — gameplayDistance helper                                 (~5 cases)
// T2 — _tickPicket detection logic                             (~10 cases)
// T3 — _tickRally assembly logic                               (~8 cases)
// T4 — Throttling tickInterval                                 (~3 cases)
// T5 — EventBus + EventLog wiring                              (~4 cases)
//
// Cumulative target: ~256 (P2 phase) + ~30 = ~286 GREEN.

// ── Stub browser globals (PRZED importami) ─────────────────────────────
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {};
globalThis.document = globalThis.document ?? { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) };

// ── Imports ───────────────────────────────────────────────────────────
const { gameplayDistance } = await import('./src/utils/CoordTransform.js');
const EventBusModule = await import('./src/core/EventBus.js');
const EventBus = EventBusModule.default ?? EventBusModule.EventBus;

// POIRuntimeSystem — main system under test.
const { POIRuntimeSystem } = await import('./src/systems/POIRuntimeSystem.js');

// ── Test harness ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (err) { failed++; failures.push({ name, err: err.message ?? String(err) }); }
}
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function assertTrue(actual, msg) {
  if (!actual) throw new Error(`${msg}: expected truthy, got ${actual}`);
}
function assertFalse(actual, msg) {
  if (actual) throw new Error(`${msg}: expected falsy, got ${actual}`);
}
function assertCloseEq(actual, expected, eps, msg) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg}: expected ${expected} ± ${eps}, got ${actual}`);
  }
}

// ── Mock POIRegistry (in-memory, generic merge) ────────────────────────
function makeMockRegistry(initialPois = {}) {
  const pois = { ...initialPois };
  const updates = [];
  return {
    pois,
    updates,
    listPOIs(filter) {
      const all = Object.values(pois);
      if (!filter) return all;
      if (filter.type) return all.filter(p => p.type === filter.type);
      return all;
    },
    getPOI(id) { return pois[id] ?? null; },
    updatePOI(id, changes) {
      if (!pois[id]) return { ok: false, reason: 'not_found' };
      pois[id] = { ...pois[id], ...changes, type: pois[id].type, id };
      updates.push({ id, changes });
      // Fake emit poi:updated (POIRuntimeSystem nie listenuje na to, ale dla telemetrii)
      return { ok: true };
    },
  };
}

// ── Mock VesselManager (in-memory) ─────────────────────────────────────
function makeMockVesselManager(vessels = []) {
  const map = new Map(vessels.map(v => [v.id, v]));
  return {
    getAllVessels() { return [...map.values()]; },
    getVessel(id)   { return map.get(id) ?? null; },
  };
}

// ── Factory: POI ───────────────────────────────────────────────────────
function makePOI(id, type, props = {}) {
  return {
    id, type, name: `${type}_${id}`,
    ownerEmpireId: 'player',
    createdYear: 0,
    ...props,
  };
}

// ── Factory: Vessel ────────────────────────────────────────────────────
function makeVessel(id, x, y, opts = {}) {
  return {
    id, name: `Vessel_${id}`,
    position: { x, y, state: 'in_transit', dockedAt: null },
    ownerEmpireId: opts.empireId ?? null,
    isEnemy: opts.isEnemy ?? false,
    wreckedAt: opts.wreckedAt ?? null,
  };
}

// ── Helper: capture EventBus emits during scope ────────────────────────
function captureEvents(eventNames, fn) {
  const captured = [];
  const handlers = {};
  for (const name of eventNames) {
    handlers[name] = (data) => captured.push({ event: name, data });
    EventBus.on(name, handlers[name]);
  }
  try { fn(); }
  finally {
    for (const name of eventNames) {
      EventBus.off?.(name, handlers[name]);
    }
  }
  return captured;
}

// ══════════════════════════════════════════════════════════════════════
// T1 — gameplayDistance helper
// ══════════════════════════════════════════════════════════════════════

test('T1.1 — same point → 0', () => {
  assertEq(gameplayDistance({ x: 5, y: 5 }, { x: 5, y: 5 }), 0, 'distance');
});

test('T1.2 — 3-4-5 triangle', () => {
  assertEq(gameplayDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5, '3-4-5');
});

test('T1.3 — negative coords', () => {
  assertEq(gameplayDistance({ x: -3, y: -4 }, { x: 0, y: 0 }), 5, 'neg');
});

test('T1.4 — null inputs → Infinity', () => {
  assertEq(gameplayDistance(null, { x: 0, y: 0 }), Infinity, 'p1 null');
  assertEq(gameplayDistance({ x: 0, y: 0 }, null), Infinity, 'p2 null');
  assertEq(gameplayDistance(null, null), Infinity, 'both null');
});

test('T1.5 — non-finite inputs → Infinity', () => {
  assertEq(gameplayDistance({ x: NaN, y: 0 }, { x: 0, y: 0 }), Infinity, 'NaN');
  assertEq(gameplayDistance({ x: Infinity, y: 0 }, { x: 0, y: 0 }), Infinity, 'Infinity');
});

// ══════════════════════════════════════════════════════════════════════
// T2 — _tickPicket detection logic
// ══════════════════════════════════════════════════════════════════════

function setupPicketScenario(picketProps = {}, vessels = []) {
  const reg = makeMockRegistry({
    p1: makePOI('p1', 'picket', {
      center: { x: 100, y: 100 },
      rangePxLocal: 50,
      alertOnEmpireIds: null,
      ownerEmpireId: 'player',
      ...picketProps,
    }),
  });
  const vMgr = makeMockVesselManager(vessels);
  const sys = new POIRuntimeSystem({ poiRegistry: reg, vesselManager: vMgr });
  return { reg, vMgr, sys };
}

test('T2.1 — enemy w zasięgu, alertOn=null → trigger', () => {
  const enemy = makeVessel('v1', 110, 110, { empireId: 'empire_hostile' });
  const { reg, sys } = setupPicketScenario({}, [enemy]);
  const events = captureEvents(['poi:alertTriggered'], () => {
    // Manual call _tickPicket bypassuje throttling
    sys._tickPicket(reg.pois.p1, [enemy], 100, reg);
  });
  assertEq(events.length, 1, 'one event');
  assertEq(events[0].data.poiId, 'p1', 'poi id');
  assertEq(events[0].data.vesselId, 'v1', 'vessel id');
  assertTrue(reg.pois.p1.triggered, 'triggered=true');
});

test('T2.2 — vessel out of range → no trigger', () => {
  const farVessel = makeVessel('v1', 1000, 1000, { empireId: 'empire_hostile' });
  const { reg, sys } = setupPicketScenario({}, [farVessel]);
  const events = captureEvents(['poi:alertTriggered'], () => {
    sys._tickPicket(reg.pois.p1, [farVessel], 100, reg);
  });
  assertEq(events.length, 0, 'no event');
  assertFalse(reg.pois.p1.triggered, 'triggered=false');
});

test('T2.3 — own vessel w zasięgu → skip', () => {
  // Player vessel (no empireId) vs poi.ownerEmpireId='player'
  const own = makeVessel('v1', 110, 110);
  const { reg, sys } = setupPicketScenario({}, [own]);
  const events = captureEvents(['poi:alertTriggered'], () => {
    sys._tickPicket(reg.pois.p1, [own], 100, reg);
  });
  assertEq(events.length, 0, 'own vessel skip');
});

test('T2.4 — alertOnEmpireIds=["empire_X"], vessel from empire_Y → no trigger', () => {
  const wrongEmpire = makeVessel('v1', 110, 110, { empireId: 'empire_Y' });
  const { reg, sys } = setupPicketScenario({ alertOnEmpireIds: ['empire_X'] }, [wrongEmpire]);
  const events = captureEvents(['poi:alertTriggered'], () => {
    sys._tickPicket(reg.pois.p1, [wrongEmpire], 100, reg);
  });
  assertEq(events.length, 0, 'whitelist filter');
});

test('T2.5 — alertOnEmpireIds=["empire_X"], vessel from empire_X → trigger', () => {
  const matchEmpire = makeVessel('v1', 110, 110, { empireId: 'empire_X' });
  const { reg, sys } = setupPicketScenario({ alertOnEmpireIds: ['empire_X'] }, [matchEmpire]);
  const events = captureEvents(['poi:alertTriggered'], () => {
    sys._tickPicket(reg.pois.p1, [matchEmpire], 100, reg);
  });
  assertEq(events.length, 1, 'whitelist match');
});

test('T2.6 — alertOnEmpireIds=[] (empty = nikt) → no trigger', () => {
  const enemy = makeVessel('v1', 110, 110, { empireId: 'empire_hostile' });
  const { reg, sys } = setupPicketScenario({ alertOnEmpireIds: [] }, [enemy]);
  const events = captureEvents(['poi:alertTriggered'], () => {
    sys._tickPicket(reg.pois.p1, [enemy], 100, reg);
  });
  assertEq(events.length, 0, 'empty whitelist = nobody');
});

test('T2.7 — cooldown active → no trigger', () => {
  const enemy = makeVessel('v1', 110, 110, { empireId: 'empire_hostile' });
  const { reg, sys } = setupPicketScenario({
    triggered: true,
    cooldownEndsAt: 200,  // future cooldown
  }, [enemy]);
  const events = captureEvents(['poi:alertTriggered'], () => {
    sys._tickPicket(reg.pois.p1, [enemy], 100, reg);  // gameTime=100 < 200
  });
  assertEq(events.length, 0, 'cooldown blocks');
});

test('T2.8 — cooldown expired → auto-clear triggered + re-trigger', () => {
  const enemy = makeVessel('v1', 110, 110, { empireId: 'empire_hostile' });
  const { reg, sys } = setupPicketScenario({
    triggered: true,
    cooldownEndsAt: 50,  // expired
  }, [enemy]);
  const events = captureEvents(['poi:alertTriggered'], () => {
    sys._tickPicket(reg.pois.p1, [enemy], 100, reg);  // gameTime=100 >= 50
  });
  // Two updatePOI calls: (a) auto-clear triggered=false, (b) re-trigger=true
  assertTrue(reg.updates.length >= 2, 'updates >= 2');
  assertEq(events.length, 1, 'one new alert');
  assertTrue(reg.pois.p1.triggered, 'triggered=true after re-fire');
});

test('T2.9 — multiple enemies in range → 1 trigger (first wins, break)', () => {
  const e1 = makeVessel('v1', 110, 110, { empireId: 'empire_hostile' });
  const e2 = makeVessel('v2', 105, 95,  { empireId: 'empire_hostile' });
  const e3 = makeVessel('v3', 120, 100, { empireId: 'empire_hostile' });
  const { reg, sys } = setupPicketScenario({}, [e1, e2, e3]);
  const events = captureEvents(['poi:alertTriggered'], () => {
    sys._tickPicket(reg.pois.p1, [e1, e2, e3], 100, reg);
  });
  assertEq(events.length, 1, 'exactly 1 trigger');
  assertEq(events[0].data.vesselId, 'v1', 'first vessel wins');
});

test('T2.10 — wrak (wreckedAt set) w zasięgu → no trigger', () => {
  const wreck = makeVessel('v1', 110, 110, { empireId: 'empire_hostile', wreckedAt: 50 });
  const { reg, sys } = setupPicketScenario({}, [wreck]);
  const events = captureEvents(['poi:alertTriggered'], () => {
    sys._tickPicket(reg.pois.p1, [wreck], 100, reg);
  });
  assertEq(events.length, 0, 'wreck nie triggeruje');
});

// ══════════════════════════════════════════════════════════════════════
// T3 — _tickRally assembly logic
// ══════════════════════════════════════════════════════════════════════

function setupRallyScenario(rallyProps = {}, vessels = []) {
  const reg = makeMockRegistry({
    r1: makePOI('r1', 'rally', {
      center: { x: 200, y: 200 },
      waitForCount: 3,
      memberVesselIds: [],
      ownerEmpireId: 'player',
      ...rallyProps,
    }),
  });
  const vMgr = makeMockVesselManager(vessels);
  const sys = new POIRuntimeSystem({ poiRegistry: reg, vesselManager: vMgr });
  return { reg, vMgr, sys };
}

test('T3.1 — 0 members → no progress (ale currentMembers=0 confirm)', () => {
  const { reg, sys } = setupRallyScenario({ memberVesselIds: [] }, []);
  reg.pois.r1.currentMembers = 5;  // simulate stale state
  sys._tickRally(reg.pois.r1, [], 100, reg);
  assertEq(reg.pois.r1.currentMembers, 0, 'reset to 0');
});

test('T3.2 — 2/3 in range, waitForCount=3 → progress=2, no complete', () => {
  const v1 = makeVessel('v1', 210, 210);
  const v2 = makeVessel('v2', 215, 195);
  const v3 = makeVessel('v3', 1000, 1000);  // out of range
  const { reg, sys } = setupRallyScenario(
    { memberVesselIds: ['v1', 'v2', 'v3'], waitForCount: 3 },
    [v1, v2, v3]
  );
  const events = captureEvents(['poi:rallyComplete'], () => {
    sys._tickRally(reg.pois.r1, [v1, v2, v3], 100, reg);
  });
  assertEq(events.length, 0, 'no complete');
  assertEq(reg.pois.r1.currentMembers, 2, 'progress=2');
  assertFalse(reg.pois.r1.complete, 'NOT complete');
});

test('T3.3 — 3/3 in range → complete + emit', () => {
  const v1 = makeVessel('v1', 210, 210);
  const v2 = makeVessel('v2', 215, 195);
  const v3 = makeVessel('v3', 200, 230);
  const { reg, sys } = setupRallyScenario(
    { memberVesselIds: ['v1', 'v2', 'v3'], waitForCount: 3 },
    [v1, v2, v3]
  );
  const events = captureEvents(['poi:rallyComplete'], () => {
    sys._tickRally(reg.pois.r1, [v1, v2, v3], 100, reg);
  });
  assertEq(events.length, 1, 'complete event');
  assertEq(events[0].data.memberCount, 3, 'count=3');
  assertTrue(reg.pois.r1.complete, 'complete=true');
  assertEq(reg.pois.r1.completedYear, 100, 'completedYear');
});

test('T3.4 — complete=true, additional vessel → no double-event (idempotent)', () => {
  const v1 = makeVessel('v1', 210, 210);
  const { reg, sys } = setupRallyScenario(
    { memberVesselIds: ['v1'], waitForCount: 1, complete: true, completedYear: 50 },
    [v1]
  );
  const events = captureEvents(['poi:rallyComplete'], () => {
    sys._tickRally(reg.pois.r1, [v1], 100, reg);
  });
  assertEq(events.length, 0, 'no double event');
  assertEq(reg.pois.r1.completedYear, 50, 'completedYear unchanged');
});

test('T3.5 — vessel destroyed (wreckedAt set) → not counted', () => {
  const v1 = makeVessel('v1', 210, 210);
  const v2 = makeVessel('v2', 215, 195, { wreckedAt: 80 });  // wreck
  const { reg, sys } = setupRallyScenario(
    { memberVesselIds: ['v1', 'v2'], waitForCount: 2 },
    [v1, v2]
  );
  const events = captureEvents(['poi:rallyComplete'], () => {
    sys._tickRally(reg.pois.r1, [v1, v2], 100, reg);
  });
  assertEq(events.length, 0, 'wreck nie liczy');
  assertEq(reg.pois.r1.currentMembers, 1, 'tylko v1');
});

test('T3.6 — currentMembers updated tylko przy zmianie (avoid spam)', () => {
  const v1 = makeVessel('v1', 210, 210);
  const { reg, sys } = setupRallyScenario(
    { memberVesselIds: ['v1'], waitForCount: 5, currentMembers: 1 },  // already 1
    [v1]
  );
  const updatesBefore = reg.updates.length;
  sys._tickRally(reg.pois.r1, [v1], 100, reg);
  // Same value (1 in range, currentMembers=1) → no update spam
  assertEq(reg.updates.length, updatesBefore, 'no spam update');
});

test('T3.7 — vessel out of range → not counted', () => {
  const v1 = makeVessel('v1', 5000, 5000);  // far far away
  const { reg, sys } = setupRallyScenario(
    { memberVesselIds: ['v1'], waitForCount: 1 },
    [v1]
  );
  sys._tickRally(reg.pois.r1, [v1], 100, reg);
  assertEq(reg.pois.r1.currentMembers, 0, 'out of range');
  assertFalse(reg.pois.r1.complete, 'NOT complete');
});

test('T3.8 — waitForCount=1, single member in range → instant complete', () => {
  const v1 = makeVessel('v1', 210, 210);
  const { reg, sys } = setupRallyScenario(
    { memberVesselIds: ['v1'], waitForCount: 1 },
    [v1]
  );
  const events = captureEvents(['poi:rallyComplete'], () => {
    sys._tickRally(reg.pois.r1, [v1], 100, reg);
  });
  assertEq(events.length, 1, 'instant complete');
  assertTrue(reg.pois.r1.complete, 'complete=true');
});

// ══════════════════════════════════════════════════════════════════════
// T4 — Throttling tickInterval
// ══════════════════════════════════════════════════════════════════════

test('T4.1 — counter increments on each time:tick', () => {
  const reg = makeMockRegistry();
  const vMgr = makeMockVesselManager();
  const sys = new POIRuntimeSystem({ poiRegistry: reg, vesselManager: vMgr });
  // Direct _onTick calls (no EventBus dispatch needed for counter)
  sys._onTick(0); sys._onTick(0); sys._onTick(0);
  assertEq(sys._tickCounter, 3, 'counter=3');
});

test('T4.2 — detection runs co tickInterval ticks', () => {
  let detectionCount = 0;
  const reg = makeMockRegistry({ p1: makePOI('p1', 'picket', { center: { x: 0, y: 0 }, rangePxLocal: 1 }) });
  const vMgr = makeMockVesselManager();
  const sys = new POIRuntimeSystem({ poiRegistry: reg, vesselManager: vMgr });
  // Hook _tickPicket via prototype (prosty spy)
  const origTickPicket = sys._tickPicket.bind(sys);
  sys._tickPicket = (...args) => { detectionCount++; return origTickPicket(...args); };
  // 9 ticks → 0 detections; 10. → 1 detection
  for (let i = 0; i < sys._tickInterval - 1; i++) sys._onTick(0);
  assertEq(detectionCount, 0, 'no detection w pierwszych 9');
  sys._onTick(0);
  assertEq(detectionCount, 1, 'detection na 10.');
});

test('T4.3 — counter wraps i throttling kontynuuje', () => {
  let detectionCount = 0;
  const reg = makeMockRegistry({ p1: makePOI('p1', 'picket', { center: { x: 0, y: 0 }, rangePxLocal: 1 }) });
  const vMgr = makeMockVesselManager();
  const sys = new POIRuntimeSystem({ poiRegistry: reg, vesselManager: vMgr });
  const origTickPicket = sys._tickPicket.bind(sys);
  sys._tickPicket = (...args) => { detectionCount++; return origTickPicket(...args); };
  // 30 ticków → 3 detections (10, 20, 30)
  for (let i = 0; i < 30; i++) sys._onTick(0);
  assertEq(detectionCount, 3, '3 detections w 30 ticks');
});

// ══════════════════════════════════════════════════════════════════════
// T5 — EventBus + EventLog wiring
// ══════════════════════════════════════════════════════════════════════

test('T5.1 — picket trigger emits poi:alertTriggered z poprawnym payloadem', () => {
  const enemy = makeVessel('v1', 110, 110, { empireId: 'empire_hostile' });
  const { reg, sys } = setupPicketScenario({}, [enemy]);
  let payload = null;
  const handler = (data) => { payload = data; };
  EventBus.on('poi:alertTriggered', handler);
  try { sys._tickPicket(reg.pois.p1, [enemy], 100, reg); }
  finally { EventBus.off?.('poi:alertTriggered', handler); }
  assertTrue(payload != null, 'payload set');
  assertEq(payload.poiId, 'p1', 'poiId');
  assertEq(payload.poiName, 'picket_p1', 'poiName');
  assertEq(payload.vesselId, 'v1', 'vesselId');
  assertEq(payload.vesselName, 'Vessel_v1', 'vesselName');
  assertEq(payload.empireId, 'empire_hostile', 'empireId');
  assertEq(payload.location, { x: 100, y: 100 }, 'location');
});

test('T5.2 — rally complete emits poi:rallyComplete z poprawnym payloadem', () => {
  const v1 = makeVessel('v1', 210, 210);
  const { reg, sys } = setupRallyScenario(
    { memberVesselIds: ['v1'], waitForCount: 1 },
    [v1]
  );
  let payload = null;
  const handler = (data) => { payload = data; };
  EventBus.on('poi:rallyComplete', handler);
  try { sys._tickRally(reg.pois.r1, [v1], 150, reg); }
  finally { EventBus.off?.('poi:rallyComplete', handler); }
  assertTrue(payload != null, 'payload set');
  assertEq(payload.poiId, 'r1', 'poiId');
  assertEq(payload.poiName, 'rally_r1', 'poiName');
  assertEq(payload.memberCount, 1, 'count');
  assertEq(payload.location, { x: 200, y: 200 }, 'location');
});

test('T5.3 — POIRuntimeSystem subskrybuje time:tick (via constructor)', () => {
  const reg = makeMockRegistry();
  const vMgr = makeMockVesselManager();
  const sys = new POIRuntimeSystem({ poiRegistry: reg, vesselManager: vMgr });
  // Po constructor — handler powinien być zarejestrowany. Test: emit time:tick →
  // _tickCounter rośnie.
  const before = sys._tickCounter;
  EventBus.emit('time:tick', { gameTime: 100 });
  assertEq(sys._tickCounter, before + 1, 'tickCounter++');
  sys.destroy?.();
});

test('T5.4 — picket trigger calls _triggerAutoSlow (via window.KOSMOS.timeSystem mock)', () => {
  let autoSlowCalled = false;
  let autoSlowReason = null;
  globalThis.window.KOSMOS.timeSystem = {
    _triggerAutoSlow(reason) { autoSlowCalled = true; autoSlowReason = reason; },
  };
  const enemy = makeVessel('v1', 110, 110, { empireId: 'empire_hostile' });
  const { reg, sys } = setupPicketScenario({}, [enemy]);
  sys._tickPicket(reg.pois.p1, [enemy], 100, reg);
  assertTrue(autoSlowCalled, 'autoSlow called');
  assertTrue(typeof autoSlowReason === 'string' && autoSlowReason.length > 0, 'reason is non-empty string');
  // Cleanup
  delete globalThis.window.KOSMOS.timeSystem;
});

// ══════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════
console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log(`  Passed:   ${passed}`);
console.log(`  Failed:   ${failed}`);
console.log(`  Total:    ${passed + failed}`);
console.log('────────────────────────────────────────────────────────────');
if (failed > 0) {
  console.log('');
  console.log('Failures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`);
    console.log(`    ${f.err}`);
  }
  process.exit(1);
}
console.log('  ALL GREEN ✓');
process.exit(0);
