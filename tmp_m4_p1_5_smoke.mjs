// ── M4 P1.5 — Post-playtest #3 smoke test ───────────────────────────────────
// Pure-logic only (Node ESM, no DOM/canvas/Three).
//
// T1 — spawnEnemyAttack friendly defaults              (~2 cases)
// T2 — vesselHasNoWeapons logic                        (~5 cases)
// T3 — buildMenuOptions warning field                  (~3 cases)
// T4 — i18n keys exist                                 (~2 cases)
//
// Target: ~12 GREEN cases (cumulative z P1: 33 + 12 = 45).

// ── Stub browser globals (PRZED importami) ─────────────────────────────
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {};
globalThis.document = globalThis.document ?? {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
};

// ── Imports ───────────────────────────────────────────────────────────
const { buildMenuOptions } = await import('./src/data/RightClickMenuOptions.js');
const { t } = await import('./src/i18n/i18n.js');
// SpawnTestEnemy contains spawnEnemyAttack — sprawdzimy source dla default values.
// Funkcja używa opts.etaYears ?? <default> i opts.spawnDistanceAU ?? <default>.
import fs from 'node:fs';
const spawnSource = fs.readFileSync(
  new URL('./src/debug/SpawnTestEnemy.js', import.meta.url),
  'utf-8',
);

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

// ============================================================================
// T1 — spawnEnemyAttack friendly defaults
// ============================================================================

test('T1.1 etaYears default == 2.0 (poprzednio 0.5)', () => {
  // Source contains: `opts.etaYears ?? 2.0`
  const hasNew = spawnSource.includes('opts.etaYears ?? 2.0');
  const hasOld = spawnSource.includes('opts.etaYears ?? 0.5');
  assertTrue(hasNew, 'new default 2.0 present');
  assertFalse(hasOld, 'old default 0.5 absent');
});

test('T1.2 spawnDistanceAU default == 30 (poprzednio 15)', () => {
  const hasNew = spawnSource.includes('opts.spawnDistanceAU ?? 30');
  const hasOld = spawnSource.includes('opts.spawnDistanceAU ?? 15');
  assertTrue(hasNew, 'new default 30 present');
  assertFalse(hasOld, 'old default 15 absent');
});

// ============================================================================
// T2 — vesselHasNoWeapons logic (przez buildMenuOptions warning side-effect)
// ============================================================================

// Setup mock vesselManager dla _vesselHasNoWeapons internal.
function setMockVessel(vesselId, vessel) {
  window.KOSMOS.vesselManager = {
    getVessel: (id) => id === vesselId ? vessel : null,
  };
}

test('T2.1 vessel z weapon_kinetic module → warning=null', () => {
  setMockVessel('v_armed', {
    id: 'v_armed',
    modules: ['engine_chemical', 'weapon_kinetic', 'shield_basic'],
  });
  const target = { type: 'enemyVessel', entityId: 'enemy_1' };
  const opts = buildMenuOptions(target, 'v_armed');
  const pursue = opts.find(o => o.id === 'pursue');
  assertTrue(pursue, 'pursue option exists');
  assertEq(pursue.warning, null, 'warning null dla armed vessel');
  assertEq(pursue.enabled, true, 'enabled true');
});

test('T2.2 vessel bez weapon module → warning="no_weapons"', () => {
  setMockVessel('v_civilian', {
    id: 'v_civilian',
    modules: ['engine_chemical', 'science_lab', 'cargo_hold'],
  });
  const target = { type: 'enemyVessel', entityId: 'enemy_1' };
  const opts = buildMenuOptions(target, 'v_civilian');
  const pursue = opts.find(o => o.id === 'pursue');
  assertTrue(pursue, 'pursue option exists');
  assertEq(pursue.warning, 'no_weapons', 'warning set');
  assertEq(pursue.enabled, true, 'still enabled (player może kamikaze)');
});

test('T2.3 vessel z legacy shipId=science_vessel (no modules) → warning', () => {
  setMockVessel('v_legacy_sci', {
    id: 'v_legacy_sci',
    shipId: 'science_vessel',
    modules: [],  // legacy ship — pusta tablica
  });
  const target = { type: 'enemyVessel', entityId: 'enemy_1' };
  const opts = buildMenuOptions(target, 'v_legacy_sci');
  const pursue = opts.find(o => o.id === 'pursue');
  assertEq(pursue.warning, 'no_weapons', 'science_vessel detected as civilian');
});

test('T2.4 intercept także dostaje warning', () => {
  setMockVessel('v_civ_2', { id: 'v_civ_2', modules: ['cargo_hold'] });
  const target = { type: 'enemyVessel', entityId: 'enemy_1' };
  const opts = buildMenuOptions(target, 'v_civ_2');
  const intercept = opts.find(o => o.id === 'intercept');
  assertEq(intercept.warning, 'no_weapons', 'intercept warning set');
});

test('T2.5 moveToPoint NIE dostaje weapons warning', () => {
  setMockVessel('v_civ_3', { id: 'v_civ_3', modules: [] });
  const target = { type: 'empty', worldPoint: { x: 100, y: 0, z: 50 } };
  const opts = buildMenuOptions(target, 'v_civ_3');
  const move = opts.find(o => o.id === 'moveToPoint');
  assertEq(move.warning, null, 'moveToPoint bez warning');
});

// ============================================================================
// T3 — buildMenuOptions warning field
// ============================================================================

test('T3.1 brak selectedVesselId → no warning na pursue (disabled)', () => {
  const target = { type: 'enemyVessel', entityId: 'enemy_1' };
  const opts = buildMenuOptions(target, null);
  const pursue = opts.find(o => o.id === 'pursue');
  assertEq(pursue.enabled, false, 'disabled bez selection');
  assertEq(pursue.warning, null, 'warning null gdy disabled');
});

test('T3.2 wszystkie opcje mają warning field', () => {
  setMockVessel('v_test', { id: 'v_test', modules: ['weapon_kinetic'] });
  const target = { type: 'enemyVessel', entityId: 'enemy_1' };
  const opts = buildMenuOptions(target, 'v_test');
  for (const opt of opts) {
    assertTrue('warning' in opt, `option ${opt.id} ma warning field`);
  }
});

test('T3.3 vessel z weapon_missile/weapon_laser także armed', () => {
  setMockVessel('v_missile', { id: 'v_missile', modules: ['weapon_missile'] });
  const opts1 = buildMenuOptions({ type: 'enemyVessel', entityId: 'e' }, 'v_missile');
  assertEq(opts1.find(o => o.id === 'pursue').warning, null, 'missile armed');

  setMockVessel('v_laser', { id: 'v_laser', modules: ['weapon_laser'] });
  const opts2 = buildMenuOptions({ type: 'enemyVessel', entityId: 'e' }, 'v_laser');
  assertEq(opts2.find(o => o.id === 'pursue').warning, null, 'laser armed');
});

// ============================================================================
// T4 — i18n keys exist
// ============================================================================

test('T4.1 log.m4.firstSighting key resolves', () => {
  const result = t('log.m4.firstSighting', 'TestVessel', 'TestEmpire');
  assertTrue(result.includes('TestVessel'), `vessel name in result: ${result}`);
  assertFalse(result === 'log.m4.firstSighting', 'key not raw');
});

test('T4.2 tooltip.menu.noWeapons key resolves', () => {
  const result = t('tooltip.menu.noWeapons');
  assertFalse(result === 'tooltip.menu.noWeapons', 'key not raw');
  assertTrue(result.length > 5, 'meaningful text');
});

// ── Wynik ────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n──────────────────────────────────────────`);
console.log(`M4 P1.5 smoke: ${passed}/${total} PASS, ${failed} FAIL`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`  ✗ ${f.name}: ${f.err}`);
  }
  process.exit(1);
}
console.log(`✓ All tests passed.`);
