// M3 P4 polish — minimal smoke test
// - Asserts SaveMigration.CURRENT_VERSION matches the value referenced in CLAUDE.md (v68).
// - Verifies RaycasterPure.resolveTargetFromHits planet lookup is wired to
//   entityManager.get() (the fix for the long-standing 3D planet hover gap).

import { CURRENT_VERSION } from './src/systems/SaveMigration.js';
import { resolveTargetFromHits } from './src/utils/RaycasterPure.js';

let passed = 0;
let failed = 0;

function assert(label, cond) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else      { failed++; console.error(`  ✗ ${label}`); }
}

console.log('T1 — SaveMigration.CURRENT_VERSION');
assert('CURRENT_VERSION === 68', CURRENT_VERSION === 68);

console.log('\nT2 — RaycasterPure planet lookup uses entityManager.get()');
// Mock window.KOSMOS.entityManager — only .get() is supported (matches real EntityManager API).
globalThis.window = globalThis.window ?? {};
const fakePlanet = { id: 'planet_test', name: 'Test' };
window.KOSMOS = {
  entityManager: {
    get(id) { return id === 'planet_test' ? fakePlanet : null; },
  },
};

const planetHit = {
  object: { userData: { kosmosType: 'planet', planetId: 'planet_test' }, parent: null },
  kosmosNode: { userData: { kosmosType: 'planet', planetId: 'planet_test' } },
};
const out = resolveTargetFromHits([planetHit], { x: 0, y: 0, z: 0 }, 'player');

assert('returns type=planet', out.type === 'planet');
assert('attaches planet instance', out.planet === fakePlanet);
assert('entityId matches planetId', out.entityId === 'planet_test');

// Negative path: stale userData (planet missing in registry) → type:'empty'
const staleHit = {
  object: { userData: { kosmosType: 'planet', planetId: 'planet_missing' }, parent: null },
  kosmosNode: { userData: { kosmosType: 'planet', planetId: 'planet_missing' } },
};
const stale = resolveTargetFromHits([staleHit], { x: 0, y: 0, z: 0 }, 'player');
assert('stale planet id → type=empty', stale.type === 'empty');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
