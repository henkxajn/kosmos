// Smoke test M2b Commit 3 — PredictionConeMath + MOS._tickInterceptOrder integration
//
// Pokrywa T1-T4 (~17 cases):
//   T1 qualityToAngleMultiplier — 4 quality values
//   T2 computeCone math — direction, degenerate, static angles, moving (numerical), cap
//   T3 MOS integration — flag OFF, fallback quality, IntelSystem contact lookup
//   T4 anti-pattern proof — imported GAME_CONFIG mutation (NIE window.GAME_CONFIG, lekcja L1 z C2)
//
// Run: node tmp_m2b_c3_predictioncone_test.mjs

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
  timeSystem:      { gameTime: 0 },
  vesselManager:   null,  // per-test
  intelSystem:     null,  // per-test
};

// ── Imports (real singletons) ──────────────────────────────────────────────
const EventBus              = (await import('./src/core/EventBus.js')).default;
const { GAME_CONFIG }       = await import('./src/config/GameConfig.js');
const { PredictionConeMath } = await import('./src/utils/PredictionConeMath.js');
const { MovementOrderSystem } = await import('./src/systems/MovementOrderSystem.js');
const { ORDER_TYPES }       = await import('./src/data/MovementOrderTypes.js');

const AU_TO_PX       = GAME_CONFIG.AU_TO_PX;        // 110
const CIV_TIME_SCALE = GAME_CONFIG.CIV_TIME_SCALE;  // 12

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

function assertNull(val, label) {
  if (val !== null && val !== undefined) {
    throw new Error(`${label}: expected null/undefined, got ${JSON.stringify(val)}`);
  }
}

function assertApprox(actual, expected, eps, label) {
  const diff = Math.abs(actual - expected);
  if (!Number.isFinite(actual) || diff > eps) {
    throw new Error(`${label}: expected ${expected} ± ${eps}, got ${actual} (diff=${diff})`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// T1 — qualityToAngleMultiplier
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T1: qualityToAngleMultiplier ===');

test('T1.1 detailed → 0.2', () => {
  assertEq(PredictionConeMath.qualityToAngleMultiplier('detailed'), 0.2, 'mult');
});

test('T1.2 contact → 0.6', () => {
  assertEq(PredictionConeMath.qualityToAngleMultiplier('contact'), 0.6, 'mult');
});

test('T1.3 rumor → 1.5', () => {
  assertEq(PredictionConeMath.qualityToAngleMultiplier('rumor'), 1.5, 'mult');
});

test('T1.4 unknown / inne → 3.0', () => {
  assertEq(PredictionConeMath.qualityToAngleMultiplier('unknown'), 3.0, 'unknown');
  assertEq(PredictionConeMath.qualityToAngleMultiplier(undefined), 3.0, 'undefined');
  assertEq(PredictionConeMath.qualityToAngleMultiplier('garbage'), 3.0, 'garbage');
});

// ──────────────────────────────────────────────────────────────────────────
// T2 — computeCone math
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T2: computeCone math ===');

test('T2.1 dx=100, dy=0 → dirX=1, dirY=0, rangeAU=100/110', () => {
  const c = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 100, y: 0 }, null, 1.0, 'detailed', 0,
  );
  assertApprox(c.dirX, 1, 1e-9, 'dirX');
  assertApprox(c.dirY, 0, 1e-9, 'dirY');
  assertApprox(c.rangeAU, 100 / AU_TO_PX, 1e-9, 'rangeAU');
});

test('T2.2 dx=0, dy=100 → dirX=0, dirY=1', () => {
  const c = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 0, y: 100 }, null, 1.0, 'detailed', 0,
  );
  assertApprox(c.dirX, 0, 1e-9, 'dirX');
  assertApprox(c.dirY, 1, 1e-9, 'dirY');
});

test('T2.3 dx=100, dy=100 → dirX≈0.707, dirY≈0.707', () => {
  const c = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 100, y: 100 }, null, 1.0, 'detailed', 0,
  );
  const sqrt2 = Math.SQRT2 / 2;
  assertApprox(c.dirX, sqrt2, 1e-9, 'dirX');
  assertApprox(c.dirY, sqrt2, 1e-9, 'dirY');
});

test('T2.4 distPx<1 (degenerate) → null', () => {
  const c = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 0.5, y: 0 }, null, 1.0, 'detailed', 0,
  );
  assertNull(c, 'cone musi być null dla degenerate');
});

test('T2.5 static target, detailed → angleWidth = 0.02 rad', () => {
  // dist=110 px = 1 AU, vel=null → drift=0 → factor=1, mult=0.2
  // angleWidth = 0.1 × 1 × 0.2 = 0.02
  const c = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 110, y: 0 }, null, 1.0, 'detailed', 0,
  );
  assertApprox(c.angleWidth, 0.02, 1e-9, 'angleWidth');
});

test('T2.6 static target, rumor → angleWidth = 0.15 rad', () => {
  // 0.1 × 1 × 1.5 = 0.15
  const c = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 110, y: 0 }, null, 1.0, 'rumor', 0,
  );
  assertApprox(c.angleWidth, 0.15, 1e-9, 'angleWidth');
});

test('T2.7 moving target — szerszy niż static (relative)', () => {
  // distAU=10, velocity small; powinno być szersze niż T2.5 (static).
  const cMoving = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 1100, y: 0 }, { vx: 0.1, vy: 0 }, 1.0, 'detailed', 0,
  );
  const cStatic = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 1100, y: 0 }, null, 1.0, 'detailed', 0,
  );
  assertTrue(cMoving.angleWidth > cStatic.angleWidth, 'moving > static');
});

test('T2.7b numerical (CIV_TIME_SCALE-aware + cap activates)', () => {
  // Hand-calc:
  //   distAU=10, speedAU=1 → time=10 gameYears
  //   velMagPhys = 0.5 × 12 = 6 AU/gameYear
  //   driftAU = 6 × 10 = 60
  //   ratio = min(60/10, 5) = 5  ← cap
  //   factor = 6
  //   angleWidth = 0.1 × 6 × 0.2 = 0.12 rad
  // Off-by-12 (bez konwersji): 0.5 × 10 = 5, ratio=0.5, factor=1.5,
  //   angleWidth = 0.03 — test wyłapie literalnie.
  const c = PredictionConeMath.computeCone(
    { x: 0, y: 0 },
    { x: 1100, y: 0 },
    { vx: 0.5, vy: 0 },
    1.0,
    'detailed',
    100,
  );
  assertApprox(c.angleWidth, 0.12, 1e-9,
    'angleWidth = 0.12 — CIV_TIME_SCALE conversion + cap@5');
});

test('T2.7c cap behavior — extreme drift NIE eksploduje', () => {
  // velocity=100 AU/civYear, distAU=1 → driftAU=1200, ratio=1200 → cap@5
  // angleWidth = 0.1 × 6 × 0.2 = 0.12 rad
  const c = PredictionConeMath.computeCone(
    { x: 0, y: 0 },
    { x: 110, y: 0 },
    { vx: 100, vy: 0 },
    1.0,
    'detailed',
    0,
  );
  assertApprox(c.angleWidth, 0.12, 1e-9, 'angleWidth capped @ 0.12');
  assertTrue(c.angleWidth < 1.0, 'angleWidth musi być w sane range');
});

test('T2.8 confidence — detailed ≈ 0.833, rumor = 0.4', () => {
  const cDet = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 110, y: 0 }, null, 1.0, 'detailed', 0,
  );
  const cRum = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 110, y: 0 }, null, 1.0, 'rumor', 0,
  );
  assertApprox(cDet.confidence, 1 / 1.2, 1e-9, 'detailed conf');
  assertApprox(cRum.confidence, 1 / 2.5, 1e-9, 'rumor conf');
});

test('T2.x updatedYear z parametru (NIE z window.KOSMOS)', () => {
  // Zmień window.KOSMOS.timeSystem.gameTime — argument musi mieć priorytet.
  globalThis.window.KOSMOS.timeSystem.gameTime = 999;
  const c = PredictionConeMath.computeCone(
    { x: 0, y: 0 }, { x: 110, y: 0 }, null, 1.0, 'detailed', 42,
  );
  assertEq(c.updatedYear, 42, 'updatedYear z parametru');
  globalThis.window.KOSMOS.timeSystem.gameTime = 0;
});

// ──────────────────────────────────────────────────────────────────────────
// T3 — MOS._tickInterceptOrder integration
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T3: MOS._tickInterceptOrder integration ===');

// Stub VesselManager — minimalna powierzchnia używana w tym teście.
function makeStubVm(vessels) {
  return {
    getVessel:      (id) => vessels[id] ?? null,
    getAllVessels:  () => Object.values(vessels),
    _calcRoute:     () => ({ totalDist: 0, waypoints: [] }),
  };
}

function makePursuer(id, x, y) {
  return {
    id,
    isWreck: false,
    speedAU: 1.0,
    position: { x, y, state: 'in_transit', dockedAt: null },
    velocity: { vx: 0, vy: 0, updatedYear: 0 },
    fuel: { current: 100, max: 100, consumption: 0 },
    status: 'on_mission',
    movementOrder: null,
    mission: null,
  };
}

function makeTargetVessel(id, x, y, ownerEmpireId = null, vx = 0, vy = 0) {
  return {
    id,
    isWreck: false,
    speedAU: 1.0,
    ownerEmpireId,
    position: { x, y, state: 'in_transit', dockedAt: null },
    velocity: { vx, vy, updatedYear: 0 },
    fuel: { current: 100, max: 100, consumption: 0 },
    status: 'on_mission',
    movementOrder: null,
    mission: null,
  };
}

function setupMOS({ flag, intelContact = null, gameYear = 100 } = {}) {
  EventBus.clear();
  GAME_CONFIG.FEATURES.predictionCone = flag;
  globalThis.window.KOSMOS.timeSystem.gameTime = gameYear;
  globalThis.window.KOSMOS.intelSystem = intelContact != null
    ? { getVesselContact: () => intelContact }
    : null;
}

test('T3.1 flag OFF → order.predictionCone zostaje null', () => {
  const pursuer = makePursuer('v_p', 0, 0);
  const target  = makeTargetVessel('v_t', 1100, 0, 'enemy_1', 0, 0);
  const vm = makeStubVm({ v_p: pursuer, v_t: target });
  setupMOS({ flag: false });
  const mos = new MovementOrderSystem(vm);

  const order = {
    id: 'mo_1',
    type: ORDER_TYPES.intercept,
    targetEntityId: 'v_t',
    lastTargetPos: null,
    interceptPoint: null,
    predictionCone: null,
    status: 'active',
  };
  pursuer.movementOrder = order;
  mos._byVessel.set('v_p', order);

  mos._tickInterceptOrder(pursuer, order, 0.01, 100);

  assertNull(order.predictionCone, 'cone musi zostać null gdy flag OFF');
  mos.destroy();
});

test('T3.2 flag ON, no contact, target bez ownerEmpireId → quality=detailed', () => {
  const pursuer = makePursuer('v_p', 0, 0);
  const target  = makeTargetVessel('v_t', 1100, 0, null, 0, 0);  // no empire
  const vm = makeStubVm({ v_p: pursuer, v_t: target });
  setupMOS({ flag: true, intelContact: null });
  const mos = new MovementOrderSystem(vm);

  const order = {
    id: 'mo_2',
    type: ORDER_TYPES.intercept,
    targetEntityId: 'v_t',
    lastTargetPos: null,
    interceptPoint: null,
    predictionCone: null,
    status: 'active',
  };
  pursuer.movementOrder = order;
  mos._byVessel.set('v_p', order);

  mos._tickInterceptOrder(pursuer, order, 0.01, 100);

  assertTrue(order.predictionCone != null, 'cone musi być ustawiony');
  // detailed: mult=0.2 → confidence = 1/1.2
  assertApprox(order.predictionCone.confidence, 1 / 1.2, 1e-9,
    'confidence sygnalizuje detailed (mult=0.2)');
  mos.destroy();
});

test('T3.3 flag ON, contact.quality=contact → mult=0.6 użyte', () => {
  const pursuer = makePursuer('v_p', 0, 0);
  const target  = makeTargetVessel('v_t', 1100, 0, 'enemy_1', 0, 0);
  const vm = makeStubVm({ v_p: pursuer, v_t: target });
  setupMOS({ flag: true, intelContact: { quality: 'contact' } });
  const mos = new MovementOrderSystem(vm);

  const order = {
    id: 'mo_3',
    type: ORDER_TYPES.intercept,
    targetEntityId: 'v_t',
    lastTargetPos: null,
    interceptPoint: null,
    predictionCone: null,
    status: 'active',
  };
  pursuer.movementOrder = order;
  mos._byVessel.set('v_p', order);

  mos._tickInterceptOrder(pursuer, order, 0.01, 100);

  assertTrue(order.predictionCone != null, 'cone musi być ustawiony');
  // contact: mult=0.6 → confidence = 1/1.6
  assertApprox(order.predictionCone.confidence, 1 / 1.6, 1e-9,
    'confidence sygnalizuje contact (mult=0.6)');
  mos.destroy();
});

test('T3.4 flag ON, target z ownerEmpireId, brak intelSystem → fallback rumor', () => {
  const pursuer = makePursuer('v_p', 0, 0);
  const target  = makeTargetVessel('v_t', 1100, 0, 'enemy_1', 0, 0);
  const vm = makeStubVm({ v_p: pursuer, v_t: target });
  setupMOS({ flag: true, intelContact: null });  // intelSystem = null
  const mos = new MovementOrderSystem(vm);

  const order = {
    id: 'mo_4',
    type: ORDER_TYPES.intercept,
    targetEntityId: 'v_t',
    lastTargetPos: null,
    interceptPoint: null,
    predictionCone: null,
    status: 'active',
  };
  pursuer.movementOrder = order;
  mos._byVessel.set('v_p', order);

  mos._tickInterceptOrder(pursuer, order, 0.01, 100);

  assertTrue(order.predictionCone != null, 'cone musi być ustawiony');
  // rumor: mult=1.5 → confidence = 1/2.5 = 0.4
  assertApprox(order.predictionCone.confidence, 0.4, 1e-9,
    'confidence = 0.4 dla rumor fallback (target.ownerEmpireId set, no intel)');
  mos.destroy();
});

test('T3.5 cone targetPos = ip (NIE lastTargetPos) — kierunek wzdłuż trajektorii', () => {
  // Pursuer w (0,0), target w (1100,0) z velocity (0, 0.5 AU/civYear).
  // _computeInterceptPoint da ip != target.position (target się porusza).
  // Cone.dirX/dirY musi pokazywać KU ip, NIE ku targetowi.
  const pursuer = makePursuer('v_p', 0, 0);
  const target  = makeTargetVessel('v_t', 1100, 0, 'enemy_1', 0, 0.5);
  const vm = makeStubVm({ v_p: pursuer, v_t: target });
  setupMOS({ flag: true, intelContact: { quality: 'detailed' } });
  const mos = new MovementOrderSystem(vm);

  const order = {
    id: 'mo_5',
    type: ORDER_TYPES.intercept,
    targetEntityId: 'v_t',
    lastTargetPos: null,
    interceptPoint: null,
    predictionCone: null,
    status: 'active',
  };
  pursuer.movementOrder = order;
  mos._byVessel.set('v_p', order);

  mos._tickInterceptOrder(pursuer, order, 0.01, 100);

  const cone = order.predictionCone;
  const ip   = order.interceptPoint;
  assertTrue(cone != null, 'cone ustawiony');
  assertTrue(ip != null,   'ip ustawiony');

  // Cone direction = unit vector od pursuer ku ip.
  const expDist = Math.hypot(ip.x, ip.y);
  assertApprox(cone.dirX, ip.x / expDist, 1e-9, 'dirX wzdłuż pursuer→ip');
  assertApprox(cone.dirY, ip.y / expDist, 1e-9, 'dirY wzdłuż pursuer→ip');

  // Sanity: rangeAU musi być dist do ip, NIE dist do targetu.
  // distToTarget = 1100/110 = 10 AU; distToIp != 10 (różny dla movingu).
  assertApprox(cone.rangeAU, expDist / AU_TO_PX, 1e-9, 'rangeAU = dist do ip');
  mos.destroy();
});

// ──────────────────────────────────────────────────────────────────────────
// T4 — anti-pattern proof (lekcja L1 z C2)
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T4: anti-pattern proof ===');

test('T4.1 flag flip via imported GAME_CONFIG mutation (NIE window.GAME_CONFIG)', () => {
  // Setup: window.GAME_CONFIG NIE istnieje, mutujemy imported singleton.
  // Jeśli MOS używałby window.GAME_CONFIG (lekcja L1), test by failował.
  delete globalThis.window.GAME_CONFIG;

  const pursuer = makePursuer('v_p', 0, 0);
  const target  = makeTargetVessel('v_t', 1100, 0, 'enemy_1', 0, 0);
  const vm = makeStubVm({ v_p: pursuer, v_t: target });

  // Najpierw flag ON via imported.
  EventBus.clear();
  GAME_CONFIG.FEATURES.predictionCone = true;
  globalThis.window.KOSMOS.timeSystem.gameTime = 100;
  globalThis.window.KOSMOS.intelSystem = null;
  const mos = new MovementOrderSystem(vm);

  const order = {
    id: 'mo_6',
    type: ORDER_TYPES.intercept,
    targetEntityId: 'v_t',
    lastTargetPos: null,
    interceptPoint: null,
    predictionCone: null,
    status: 'active',
  };
  pursuer.movementOrder = order;
  mos._byVessel.set('v_p', order);

  mos._tickInterceptOrder(pursuer, order, 0.01, 100);
  assertTrue(order.predictionCone != null, 'cone ustawiony gdy imported flag ON');

  // Teraz mutuj imported na false → cone musi przestać się aktualizować.
  order.predictionCone = null;
  GAME_CONFIG.FEATURES.predictionCone = false;
  mos._tickInterceptOrder(pursuer, order, 0.01, 100);
  assertNull(order.predictionCone, 'cone null gdy imported flag OFF (anti-pattern proof)');

  mos.destroy();
});

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────

console.log(`\n=== Summary ===`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.name}`);
    console.log(`    ${f.err.stack ?? f.err.message}`);
  }
  process.exit(1);
}
console.log('\nAll tests passed.');
process.exit(0);
