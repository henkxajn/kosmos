// Smoke test M2b Commit 1 — schema v66→v67 + 3 FEATURES + MOS order defaults
//
// Pokrywa:
//   T1.1-T1.9 — _migrateV66toV67 (9 cases, w tym idempotency v67 round-trip)
//   T3.1-T3.3 — GAME_CONFIG.FEATURES.{intelContactState,predictionCone,poiSystem} === false
//
// Run: node tmp_m2b_c1_migration_test.mjs

// ── Stub browser globals (ESM gra używa localStorage przez i18n, etc.) ─────
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem:    (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;

// ── Imports (po stubach!) ──────────────────────────────────────────────────
const { migrate, CURRENT_VERSION } = await import('./src/systems/SaveMigration.js');
const { GAME_CONFIG }              = await import('./src/config/GameConfig.js');

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

function assertDeepEq(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: deep mismatch\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

function assertThrowsNot(fn, label) {
  try { fn(); } catch (err) { throw new Error(`${label}: unexpected throw: ${err.message}`); }
}

// ──────────────────────────────────────────────────────────────────────────
// T1 — SaveMigration v66 → v67
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T1: SaveMigration v66 → v67 ===');

test('T1.1 bumps version to 67', () => {
  const v66 = { version: 66, gameState: {} };
  const result = migrate(v66);
  assertEq(result.version, 67, 'version');
});

test('T1.2 initializes empty pois domain', () => {
  const v66 = { version: 66, gameState: {} };
  const result = migrate(v66);
  assertDeepEq(result.gameState.pois, {}, 'gameState.pois');
});

test('T1.3 initializes intel.vessels (preserves existing intel fields)', () => {
  const v66 = { version: 66, gameState: { intel: { someExistingField: 'foo' } } };
  const result = migrate(v66);
  assertEq(result.gameState.intel.someExistingField, 'foo', 'preserved field');
  assertDeepEq(result.gameState.intel.vessels, {}, 'intel.vessels');
});

test('T1.4 does NOT overwrite existing intel.vessels (idempotent on data)', () => {
  const v66 = {
    version: 66,
    gameState: { intel: { vessels: { v_1: { quality: 'rumor' } } } },
  };
  const result = migrate(v66);
  assertEq(result.gameState.intel.vessels.v_1.quality, 'rumor', 'preserved v_1');
});

test('T1.5 adds movementOrder defaults to existing vessels (preserves existing fields)', () => {
  const v66 = {
    version: 66,
    gameState: {},
    civ4x: {
      vesselManager: {
        vessels: [
          { id: 'v_1', movementOrder: { type: 'pursue', status: 'active', id: 'mo_1' } },
          { id: 'v_2', movementOrder: { type: 'moveToPoint', status: 'active', id: 'mo_2' } },
        ],
      },
    },
  };
  const result = migrate(v66);
  const v1 = result.civ4x.vesselManager.vessels[0];
  assertEq(v1.movementOrder.poiId,               null, 'v1.poiId');
  assertEq(v1.movementOrder.predictionCone,      null, 'v1.predictionCone');
  assertEq(v1.movementOrder.patrolWaypointIndex, 0,    'v1.patrolWaypointIndex');
  assertEq(v1.movementOrder.patrolDirection,     1,    'v1.patrolDirection');
  assertEq(v1.movementOrder.escorteeId,          null, 'v1.escorteeId');
  assertEq(v1.movementOrder.type,                'pursue', 'v1.type preserved');
  assertEq(v1.movementOrder.status,              'active', 'v1.status preserved');

  const v2 = result.civ4x.vesselManager.vessels[1];
  assertEq(v2.movementOrder.patrolDirection, 1, 'v2.patrolDirection');
  assertEq(v2.movementOrder.type, 'moveToPoint', 'v2.type preserved');
});

test('T1.6 skips vessels without movementOrder (no crash)', () => {
  const v66 = {
    version: 66,
    gameState: {},
    civ4x: { vesselManager: { vessels: [{ id: 'v_1' /* no movementOrder */ }] } },
  };
  assertThrowsNot(() => migrate(v66), 'migrate(v_1 bez movementOrder)');
  const result = migrate({
    version: 66,
    gameState: {},
    civ4x: { vesselManager: { vessels: [{ id: 'v_1' }] } },
  });
  // vessel zostaje bez movementOrder (nie tworzymy go ad-hoc)
  if (result.civ4x.vesselManager.vessels[0].movementOrder !== undefined &&
      result.civ4x.vesselManager.vessels[0].movementOrder !== null) {
    throw new Error('movementOrder pojawiło się gdzie nie powinno');
  }
});

test('T1.7 handles missing civ4x gracefully', () => {
  const v66 = { version: 66, gameState: {} };
  assertThrowsNot(() => migrate(v66), 'migrate(no civ4x)');
});

test('T1.8 does NOT override existing M2b movementOrder fields (idempotent on data)', () => {
  const v66 = {
    version: 66,
    gameState: {},
    civ4x: {
      vesselManager: {
        vessels: [{
          id: 'v_1',
          movementOrder: {
            type: 'patrol',
            poiId: 'poi_42',
            patrolWaypointIndex: 3,
            patrolDirection: -1,
          },
        }],
      },
    },
  };
  const result = migrate(v66);
  const v1 = result.civ4x.vesselManager.vessels[0];
  assertEq(v1.movementOrder.poiId,               'poi_42', 'poiId preserved');
  assertEq(v1.movementOrder.patrolWaypointIndex, 3,        'patrolWaypointIndex preserved');
  assertEq(v1.movementOrder.patrolDirection,     -1,       'patrolDirection preserved');
  // pola których nie było — dostają default
  assertEq(v1.movementOrder.predictionCone, null, 'predictionCone default');
  assertEq(v1.movementOrder.escorteeId,     null, 'escorteeId default');
});

test('T1.9 round-trip idempotency v67 (already-migrated input not re-mutated)', () => {
  // Input: save z version=67, M2b polami już set.
  // migrate() powinno zauważyć fromVersion === CURRENT_VERSION i zwrócić as-is.
  // Pętla `for (let v=67; v<67; ...)` nie startuje — _migrateV66toV67 nie wywołuje się.
  const v67 = {
    version: 67,
    gameState: {
      pois: { poi_a: { id: 'poi_a', kind: 'wreck', x: 10, y: 20 } },
      intel: { vessels: { v_1: { quality: 'detailed', lastSeenYear: 100 } } },
    },
    civ4x: {
      vesselManager: {
        vessels: [{
          id: 'v_1',
          movementOrder: {
            type: 'goToPOI',
            poiId: 'poi_a',
            patrolDirection: -1,
            patrolWaypointIndex: 5,
            predictionCone: { foo: 'bar' },
            escorteeId: 'v_99',
          },
        }],
      },
    },
  };
  const before = JSON.stringify(v67);
  const result = migrate(v67);
  const after = JSON.stringify(result);
  assertEq(after, before, 'v67 round-trip nietknięty');
  assertEq(result.version, 67, 'version stays 67');
  assertEq(result.civ4x.vesselManager.vessels[0].movementOrder.patrolWaypointIndex, 5, 'patrolWaypointIndex pozostaje 5');
});

// ──────────────────────────────────────────────────────────────────────────
// T3 — GameConfig FEATURES default OFF
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T3: GAME_CONFIG.FEATURES M2b flags ===');

test('T3.1 intelContactState === true (M2b Commit 2 flipped)', () => {
  // Po M2b Commit 2 flaga flippnęła z false → true. C2 dostarcza realną logikę
  // za nią (IntelSystem.vessels), więc default true jest oczekiwany.
  assertEq(GAME_CONFIG.FEATURES.intelContactState, true, 'intelContactState');
});
test('T3.2 predictionCone defaults to false', () => {
  assertEq(GAME_CONFIG.FEATURES.predictionCone, false, 'predictionCone');
});
test('T3.3 poiSystem defaults to false', () => {
  assertEq(GAME_CONFIG.FEATURES.poiSystem, false, 'poiSystem');
});

// ──────────────────────────────────────────────────────────────────────────
// Sanity bonus: CURRENT_VERSION exported = 67
// ──────────────────────────────────────────────────────────────────────────
console.log('\n=== sanity ===');
test('CURRENT_VERSION === 67', () => {
  assertEq(CURRENT_VERSION, 67, 'CURRENT_VERSION');
});

// ──────────────────────────────────────────────────────────────────────────
// Wynik
// ──────────────────────────────────────────────────────────────────────────
console.log(`\n======================================`);
console.log(`Wynik: ${passed} PASS, ${failed} FAIL  (łącznie ${passed + failed})`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const { name, err } of failures) {
    console.log(`  - ${name}\n    ${err.message}`);
  }
  process.exit(1);
}
console.log('Wszystkie smoke testy GREEN.');
process.exit(0);
