// ── M3 P1.4.5 — Smoke tests dla physics-level cancel cleanup ──────────
// Real MOS + mock VesselManager. Testuje że MOS.cancelOrder po fix
// zatrzymuje vessel motion: vessel.mission=null (jeśli synth move_to_point),
// position.state='orbiting', position.dockedAt=null, status='idle',
// velocity=0.
//
// Uruchomienie: node tmp_m3_p1_4_5_cancel_motion_test.mjs

// ── Stub browser globals (PRZED importami) ─────────────────────────────
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem:    (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {
  timeSystem: { gameTime: 100 },
};

// ── Imports (real singletons) ──────────────────────────────────────────
const EventBus              = (await import('./src/core/EventBus.js')).default;
const gameState             = (await import('./src/core/GameState.js')).default;
const { GAME_CONFIG }       = await import('./src/config/GameConfig.js');
const { MovementOrderSystem } = await import('./src/systems/MovementOrderSystem.js');

// ── Test harness ───────────────────────────────────────────────────────
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
  if (!cond) throw new Error(`${label}: expected true`);
}

// ── Mocks ──────────────────────────────────────────────────────────────
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
  };
}

function resetState() {
  gameState.reset();
  GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
  GAME_CONFIG.FEATURES.movementOrders = true;
  if (EventBus.listeners) EventBus.listeners.clear();
  globalThis.window.KOSMOS.timeSystem = { gameTime: 100 };
}

// ──────────────────────────────────────────────────────────────────────
// T1 — moveToPoint cancel cleanup (5 cases — D4 mandate)
// ──────────────────────────────────────────────────────────────────────
console.log('\n[T1 — moveToPoint cancel physics cleanup]');

test('T1.1 — cancel moveToPoint bez snapshot → state=orbiting, mission=null, velocity=0', () => {
  resetState();
  const vessel = makeVessel('v_1', {
    position: { x: 100, y: 100, state: 'docked', dockedAt: 'planet_home' },
  });
  const vm = makeVesselManagerMock([vessel]);
  const mos = new MovementOrderSystem(vm);

  // Issue moveToPoint
  const r = mos.issueOrder('v_1', { type: 'moveToPoint', targetPoint: { x: 500, y: 500 } });
  assertEq(r.ok, true, 'issue ok');
  assertEq(vessel.position.state, 'in_transit', 'state in_transit po issue');
  assertEq(vessel.mission?.type, 'move_to_point', 'synth mission po issue');
  // Symuluj kawałek ruchu — ustaw niezerową velocity (jak _updateVelocityFromDelta)
  vessel.velocity.vx = 0.31;
  vessel.velocity.vy = -0.29;
  // Brak _suspendedMission (vessel był docked, mission=null przed issue)
  assertEq(vessel._suspendedMission, undefined, 'brak snapshot przed cancel');

  // Cancel
  const ok = mos.cancelOrder('v_1', 'player');
  assertEq(ok, true, 'cancelOrder returns true');

  // Post-cancel: physics-level cleanup
  assertEq(vessel.movementOrder.status, 'cancelled', 'order.status=cancelled');
  assertEq(vessel.movementOrder.blockReason, 'player', 'blockReason=player');
  assertEq(vessel.mission, null, 'mission=null (synth wywalony)');
  assertEq(vessel.position.state, 'orbiting', 'state=orbiting');
  assertEq(vessel.position.dockedAt, null, 'dockedAt=null (drift in space)');
  assertEq(vessel.status, 'idle', 'status=idle');
  assertEq(vessel.velocity.vx, 0, 'velocity.vx=0');
  assertEq(vessel.velocity.vy, 0, 'velocity.vy=0');
  assertEq(vessel.velocity.updatedYear, 100, 'velocity.updatedYear=gameYear');
});

test('T1.2 — cancel moveToPoint Z suspended mission → resume nadpisuje cleanup', () => {
  resetState();
  // Vessel z aktywną oryginalną mission (np. exploration), gracz issue moveToPoint
  const originalMission = {
    type: 'exploration',
    targetId: 'planet_2',
    targetName: 'Mars',
    startX: 100, startY: 100,
    targetX: 800, targetY: 800,
    waypoints: [],
    departYear: 50,
    arrivalYear: 150,
    originId: 'planet_home',
  };
  const vessel = makeVessel('v_2', {
    position: { x: 400, y: 400, state: 'in_transit', dockedAt: null },
    mission: originalMission,
    status: 'on_mission',
  });
  const vm = makeVesselManagerMock([vessel]);
  const mos = new MovementOrderSystem(vm);

  // Mock subscriber _resumeMissionAfterOrder — nadpisze cleanup
  let resumeCalled = false;
  EventBus.on('vessel:orderCancelled', ({ vesselId }) => {
    if (vesselId === 'v_2' && vessel._suspendedMission) {
      resumeCalled = true;
      // Symuluj efekt _resumeMissionAfterOrder: nadpisz cleanup
      vessel.mission = { ...vessel._suspendedMission, departYear: 100, arrivalYear: 200 };
      vessel.position.state = 'in_transit';
      vessel.status = 'on_mission';
      delete vessel._suspendedMission;
    }
  });

  // Issue moveToPoint — _suspendMissionIfAny zachowa originalMission
  const r = mos.issueOrder('v_2', { type: 'moveToPoint', targetPoint: { x: 500, y: 500 } });
  assertEq(r.ok, true, 'issue ok');
  assertTrue(!!vessel._suspendedMission, 'snapshot zrobiony (mission przed issue była non-synth)');
  assertEq(vessel._suspendedMission.type, 'exploration', 'snapshot.type=exploration');

  // Cancel — _stopVesselMotion zerujе, potem subscriber resume nadpisze
  mos.cancelOrder('v_2', 'player');

  assertTrue(resumeCalled, 'subscriber resume wywołany');
  assertEq(vessel.position.state, 'in_transit', 'state nadpisany przez resume → in_transit');
  assertEq(vessel.mission?.type, 'exploration', 'mission resumed → exploration');
  assertEq(vessel.status, 'on_mission', 'status=on_mission po resume');
});

test('T1.3 — cancel pursue → state=orbiting, velocity=0', () => {
  resetState();
  const target = makeVessel('v_target', {
    position: { x: 500, y: 500, state: 'orbiting', dockedAt: null },
  });
  const pursuer = makeVessel('v_3', {
    position: { x: 100, y: 100, state: 'docked', dockedAt: 'planet_home' },
  });
  const vm = makeVesselManagerMock([pursuer, target]);
  const mos = new MovementOrderSystem(vm);

  // Issue pursue — ustawia state='in_transit', mission zostaje null
  const r = mos.issueOrder('v_3', { type: 'pursue', targetEntityId: 'v_target' });
  assertEq(r.ok, true, 'pursue issued');
  assertEq(pursuer.position.state, 'in_transit', 'state in_transit po issue');
  // Symuluj velocity od MOS tick
  pursuer.velocity.vx = 0.5;
  pursuer.velocity.vy = 0.4;

  // Cancel
  const ok = mos.cancelOrder('v_3', 'player');
  assertEq(ok, true, 'cancelOrder ok');

  assertEq(pursuer.position.state, 'orbiting', 'state=orbiting po cancel');
  assertEq(pursuer.position.dockedAt, null, 'dockedAt=null');
  assertEq(pursuer.status, 'idle', 'status=idle');
  assertEq(pursuer.velocity.vx, 0, 'velocity.vx=0');
  assertEq(pursuer.velocity.vy, 0, 'velocity.vy=0');
  // Pursue NIE ma synth move_to_point mission, więc mission może być null lub poprzednia
  // (tu była null, więc null pozostaje)
  assertEq(pursuer.mission, null, 'mission pozostaje null (pursue nie ustawia mission)');
});

test('T1.4 — cancelOrder nieistniejącego orderu → false, brak side effects', () => {
  resetState();
  const vessel = makeVessel('v_4', {
    position: { x: 100, y: 100, state: 'orbiting', dockedAt: 'planet_home' },
  });
  const vm = makeVesselManagerMock([vessel]);
  const mos = new MovementOrderSystem(vm);

  // Brak orderu
  const ok = mos.cancelOrder('v_4', 'player');
  assertEq(ok, false, 'returns false');
  // Vessel nietknięty
  assertEq(vessel.position.state, 'orbiting', 'state nietknięty');
  assertEq(vessel.position.dockedAt, 'planet_home', 'dockedAt nietknięty');
  assertEq(vessel.status, 'idle', 'status nietknięty');
});

test('T1.5 — cancelOrder już cancelled → idempotentny, brak double-cleanup', () => {
  resetState();
  const vessel = makeVessel('v_5', {
    position: { x: 100, y: 100, state: 'docked', dockedAt: 'planet_home' },
  });
  const vm = makeVesselManagerMock([vessel]);
  const mos = new MovementOrderSystem(vm);

  mos.issueOrder('v_5', { type: 'moveToPoint', targetPoint: { x: 500, y: 500 } });
  const ok1 = mos.cancelOrder('v_5', 'player');
  assertEq(ok1, true, 'first cancel ok');
  assertEq(vessel.movementOrder.status, 'cancelled', 'status=cancelled');

  // Drugi cancel — order już cancelled, returns false (status !== 'active' guard)
  const ok2 = mos.cancelOrder('v_5', 'player');
  assertEq(ok2, false, 'second cancel returns false');
  // Stan po pierwszym cancel zachowany
  assertEq(vessel.position.state, 'orbiting', 'state nietknięty (orbiting po pierwszym cleanup)');
  assertEq(vessel.mission, null, 'mission nadal null');
});

// ──────────────────────────────────────────────────────────────────────
console.log(`\n══ M3 P1.4.5 ══  PASS=${passed}  FAIL=${failed}`);
if (failed > 0) {
  console.error('\nFailures:');
  failures.forEach(f => console.error(`  - ${f.name}: ${f.err.message}`));
  process.exit(1);
}
process.exit(0);
