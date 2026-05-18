// Smoke P3-7: ProximitySystem._getDetectionRangeAU + dynamic hysteresis.

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.window.KOSMOS = {};

const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
GAME_CONFIG.FEATURES.proximitySystem = true;
const { ProximitySystem, PROXIMITY_DETECTION_AU } = await import('./src/systems/ProximitySystem.js');
const EventBusModule = await import('./src/core/EventBus.js');
const EventBus = EventBusModule.default ?? EventBusModule.EventBus;

let pass = 0, fail = 0;
function ok(name, cond, ctx = '') {
  if (cond) { console.log('  PASS  ' + name + (ctx ? ' [' + ctx + ']' : '')); pass++; }
  else { console.error('  FAIL  ' + name + (ctx ? ' [' + ctx + ']' : '')); fail++; }
}
function eq(name, actual, expected) {
  ok(name + ' (got ' + JSON.stringify(actual) + ')', actual === expected);
}
function approxEq(name, actual, expected, tol = 1e-6) {
  ok(name + ` (got ${actual}, expected ${expected})`, Math.abs(actual - expected) < tol);
}

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

// Mock TechSystem z konfigurowalnym multiplier.
class FakeTechSystem {
  constructor(multipliers = {}) { this._mult = multipliers; }
  getMultiplier(category) { return this._mult[category] ?? 1.0; }
}

function makeVessel(id, x, y, opts = {}) {
  return {
    id, position: { x, y }, isWreck: false,
    ownerEmpireId: opts.ownerEmpireId ?? null,
  };
}

function makeMockVM(vessels) {
  const map = new Map(vessels.map(v => [v.id, v]));
  return { _vessels: map };
}

// ── T1: bez tech → BASE 0.5 AU dla player ──────────────────────────────
console.log('\n--- T1: bez tech → BASE detection range ---');
{
  globalThis.window.KOSMOS.techSystem = null;
  const vm = makeMockVM([]);
  const ps = new ProximitySystem(vm);
  const player = makeVessel('p1', 0, 0);
  approxEq('player bez techSystem → BASE 0.5', ps._getDetectionRangeAU(player), 0.5);
  ps.destroy();
}

// ── T2: z tech advanced_sensors_1 → 0.625 ─────────────────────────────
console.log('\n--- T2: tech sensor_range ×1.25 → 0.625 ---');
{
  globalThis.window.KOSMOS.techSystem = new FakeTechSystem({ sensor_range: 1.25 });
  const vm = makeMockVM([]);
  const ps = new ProximitySystem(vm);
  const player = makeVessel('p1', 0, 0);
  approxEq('player z 1.25 mult → 0.625', ps._getDetectionRangeAU(player), 0.625);
  ps.destroy();
}

// ── T3: enemy bez tech → BASE 0.5 (P3 — empire tech state pojawi się w P5) ─
console.log('\n--- T3: enemy → BASE (empire bez tech P3) ---');
{
  globalThis.window.KOSMOS.techSystem = new FakeTechSystem({ sensor_range: 2.0 });
  const vm = makeMockVM([]);
  const ps = new ProximitySystem(vm);
  const enemy = makeVessel('e1', 0, 0, { ownerEmpireId: 'empire_alpha' });
  approxEq('enemy bez tech → BASE 0.5 (nie 1.0)', ps._getDetectionRangeAU(enemy), 0.5);
  ps.destroy();
}

// ── T4: cumulative multiplier (advanced_sensors_1+2+3 ≈ ×2.0) ──────────
console.log('\n--- T4: cumulative mult ×2.0 → 1.0 AU ---');
{
  globalThis.window.KOSMOS.techSystem = new FakeTechSystem({ sensor_range: 2.0 });
  const vm = makeMockVM([]);
  const ps = new ProximitySystem(vm);
  const player = makeVessel('p1', 0, 0);
  approxEq('player z 2.0 mult → 1.0', ps._getDetectionRangeAU(player), 1.0);
  ps.destroy();
}

// ── T5: pair detection — enter threshold = max(v1, v2) ─────────────────
console.log('\n--- T5: pair enter threshold = max(v1, v2) ---');
{
  globalThis.window.KOSMOS.techSystem = new FakeTechSystem({ sensor_range: 1.5 });
  // player z mult 1.5 → 0.75 AU, enemy bez tech → 0.5 AU. Pair entry = 0.75.
  // Ustaw enemy w 0.7 AU od player — w zasięgu player'a (0.75), poza enemy (0.5).
  const player = makeVessel('p1', 0, 0);
  const enemy  = makeVessel('e1', 0.7 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha' });
  const vm = makeMockVM([player, enemy]);
  const ps = new ProximitySystem(vm);

  const events = [];
  const sub = (e) => events.push(e);
  EventBus.on('vessel:proximityEnter', sub);
  ps._tick(0.1);
  ok('proximityEnter emitted (player\'s sensor wygrywa)', events.length === 1, JSON.stringify(events));
  EventBus.off('vessel:proximityEnter', sub);
  ps.destroy();
}

// ── T6: pair detection — vessel poza max threshold → no enter ──────────
console.log('\n--- T6: pair poza max → no enter ---');
{
  globalThis.window.KOSMOS.techSystem = new FakeTechSystem({ sensor_range: 1.25 });
  // player 0.625, enemy 0.5. Pair entry = 0.625. Ustaw enemy w 0.65 → poza obu.
  const player = makeVessel('p1', 0, 0);
  const enemy  = makeVessel('e1', 0.65 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha' });
  const vm = makeMockVM([player, enemy]);
  const ps = new ProximitySystem(vm);

  const events = [];
  const sub = (e) => events.push(e);
  EventBus.on('vessel:proximityEnter', sub);
  ps._tick(0.1);
  ok('NO proximityEnter (0.65 > max 0.625)', events.length === 0);
  EventBus.off('vessel:proximityEnter', sub);
  ps.destroy();
}

// ── T7: hysteresis exit = enter × 1.2 (dynamic) ───────────────────────
console.log('\n--- T7: hysteresis exit ratio 1.2 ---');
{
  globalThis.window.KOSMOS.techSystem = new FakeTechSystem({ sensor_range: 1.5 });
  // player 0.75, enemy 0.5. Pair entry = 0.75, exit = 0.75 × 1.2 = 0.90.
  // Ustaw enemy w 0.5 (in range), tick → enter; potem move do 0.85 (między enter i exit) — no exit;
  // potem 0.95 (poza exit) → exit.
  const player = makeVessel('p1', 0, 0);
  const enemy  = makeVessel('e1', 0.5 * AU_TO_PX, 0, { ownerEmpireId: 'empire_alpha' });
  const vm = makeMockVM([player, enemy]);
  const ps = new ProximitySystem(vm);

  const enterEvents = [];
  const exitEvents = [];
  EventBus.on('vessel:proximityEnter', e => enterEvents.push(e));
  EventBus.on('vessel:proximityExit',  e => exitEvents.push(e));
  ps._tick(0.1);
  ok('enter emit (dist 0.5 < enter 0.75)', enterEvents.length === 1);

  // Move enemy w pas hysteresis (0.85 — między enter 0.75 i exit 0.90) — no exit
  enemy.position.x = 0.85 * AU_TO_PX;
  ps._tick(0.1);
  ok('NO exit w paśmie hysteresis (0.85 między 0.75 i 0.9)', exitEvents.length === 0);

  // Move enemy poza exit (0.95)
  enemy.position.x = 0.95 * AU_TO_PX;
  ps._tick(0.1);
  ok('exit emit (dist 0.95 > exit 0.90)', exitEvents.length === 1);
  ps.destroy();
}

console.log(`\n========== ${pass} PASS / ${fail} FAIL ==========`);
process.exit(fail > 0 ? 1 : 0);
