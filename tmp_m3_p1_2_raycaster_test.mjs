// Smoke test M3 P1.2 — Tactical map mouse interactions (raycaster)
//
// Pokrywa T1, T2, T3 (filter), T4, T5 (~18 cases):
//   T1 mouseToNDC pure math — 3 cases (env/TL/BR)
//   T2 resolveTargetFromHits dispatch — 6 cases (empty/own/enemy/poi/planet/stale)
//   T3 findKosmosNode walk-up parent — 3 cases (direct/parent/none)
//   T4 click vs drag distance math — 3 cases (<5/>5/boundary)
//   T5 target → buildMenuOptions integration (P1.1 schema) — 3 cases
//
// THREE-dependent castRay() pominięty (L1/L10 — real-flow visual review).
// Run: node tmp_m3_p1_2_raycaster_test.mjs

// ── Stub browser globals (PRZED importami) ─────────────────────────────────
globalThis.window = globalThis.window ?? globalThis;

// Mock vesselManager — odzwierciedla REAL vessel shape (Vessel.js:isEnemyVessel
// honoruje 3 pola: isEnemy / owner / ownerEmpireId).
// Player vessele typowo NIE mają żadnego z tych pól (default = own).
// Enemy vessele mają owner !== 'player' (typowo string z prefiksem 'emp_').
const _vessels = new Map([
  ['v_own',         { id: 'v_own',     name: 'Alfa' }],                        // player default (no owner field)
  ['v_own_explicit',{ id: 'v_own_explicit', name: 'Beta', owner: 'player' }],  // player explicit
  ['v_enemy',       { id: 'v_enemy',   name: 'Wróg',  owner: 'emp_sandbox' }], // enemy via owner
  ['v_enemy_legacy',{ id: 'v_enemy_legacy', name: 'Łowca', isEnemy: true }],   // enemy via legacy isEnemy flag
]);
const _pois = new Map([
  ['poi_p', { id: 'poi_p', name: 'Patrol Test', type: 'patrol' }],
  ['poi_w', { id: 'poi_w', name: 'Waypoint Test', type: 'waypoint' }],
]);
const _planets = new Map([
  ['planet_1', { id: 'planet_1', name: 'Bastion', type: 'rocky' }],
]);
globalThis.window.KOSMOS = {
  vesselManager:  { getVessel: (id) => _vessels.get(id) ?? null },
  poiRegistry:    { getPOI:    (id) => _pois.get(id)    ?? null },
  entityManager:  { getEntity: (id) => _planets.get(id) ?? null },
};

// ── Imports (Pure tylko — bez THREE) ───────────────────────────────────────
const { mouseToNDC, findKosmosNode, resolveTargetFromHits } =
  await import('./src/utils/RaycasterPure.js');
const { buildMenuOptions } = await import('./src/data/RightClickMenuOptions.js');

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
    throw new Error(`${label}: expected ${expected}±${eps}, got ${actual}`);
  }
}
function assertTrue(cond, label) {
  if (!cond) throw new Error(`${label}: expected true, got false`);
}

// Mock canvas dla mouseToNDC
function makeCanvas(width, height, left = 0, top = 0) {
  return {
    getBoundingClientRect: () => ({ left, top, width, height }),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// T1 — mouseToNDC pure math (3 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT1 — mouseToNDC:');

test('T1.1 środek canvasa 1000x600 → NDC (0, 0)', () => {
  const c = makeCanvas(1000, 600);
  const ndc = mouseToNDC(500, 300, c);
  assertClose(ndc.x, 0, 1e-9, 'NDC.x');
  assertClose(ndc.y, 0, 1e-9, 'NDC.y');
});

test('T1.2 lewy górny róg → NDC (-1, 1)', () => {
  const c = makeCanvas(1280, 720);
  const ndc = mouseToNDC(0, 0, c);
  assertClose(ndc.x, -1, 1e-9, 'NDC.x');
  assertClose(ndc.y, 1, 1e-9, 'NDC.y');
});

test('T1.3 prawy dolny róg → NDC (1, -1)', () => {
  const c = makeCanvas(1280, 720);
  const ndc = mouseToNDC(1280, 720, c);
  assertClose(ndc.x, 1, 1e-9, 'NDC.x');
  assertClose(ndc.y, -1, 1e-9, 'NDC.y');
});

// ──────────────────────────────────────────────────────────────────────────
// T2 — resolveTargetFromHits dispatch (6 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT2 — resolveTargetFromHits:');

const wp = { x: 5, y: 0, z: 10 };

test('T2.1 hits=[] → {type:empty, worldPoint}', () => {
  const t = resolveTargetFromHits([], wp, 'player');
  assertEq(t, { type: 'empty', worldPoint: wp }, 'target');
});

test('T2.2 vessel bez owner field (player default) → ownVessel', () => {
  const hit = { object: { userData: { kosmosType: 'vessel', vesselId: 'v_own' } }, kosmosNode: { userData: { kosmosType: 'vessel', vesselId: 'v_own' } } };
  const t = resolveTargetFromHits([hit], wp, 'player');
  assertEq(t.type, 'ownVessel', 'type');
  assertEq(t.entityId, 'v_own', 'entityId');
  assertEq(t.vessel.id, 'v_own', 'vessel.id');
  assertEq(t.worldPoint, wp, 'worldPoint');
});

test('T2.2b vessel z owner=player (explicit) → ownVessel', () => {
  const hit = { object: {}, kosmosNode: { userData: { kosmosType: 'vessel', vesselId: 'v_own_explicit' } } };
  const t = resolveTargetFromHits([hit], wp, 'player');
  assertEq(t.type, 'ownVessel', 'type');
  assertEq(t.vessel.owner, 'player', 'vessel.owner');
});

test('T2.3 vessel z owner=emp_sandbox → enemyVessel', () => {
  const hit = { object: {}, kosmosNode: { userData: { kosmosType: 'vessel', vesselId: 'v_enemy' } } };
  const t = resolveTargetFromHits([hit], wp, 'player');
  assertEq(t.type, 'enemyVessel', 'type');
  assertEq(t.entityId, 'v_enemy', 'entityId');
  assertEq(t.vessel.owner, 'emp_sandbox', 'vessel.owner');
});

test('T2.3b vessel z legacy isEnemy=true (bez owner field) → enemyVessel', () => {
  const hit = { object: {}, kosmosNode: { userData: { kosmosType: 'vessel', vesselId: 'v_enemy_legacy' } } };
  const t = resolveTargetFromHits([hit], wp, 'player');
  assertEq(t.type, 'enemyVessel', 'type');
  assertEq(t.vessel.isEnemy, true, 'vessel.isEnemy');
});

test('T2.4 POI patrol → {type:poi, poi.type:patrol}', () => {
  const hit = { object: {}, kosmosNode: { userData: { kosmosType: 'poi', poiId: 'poi_p' } } };
  const t = resolveTargetFromHits([hit], wp, 'player');
  assertEq(t.type, 'poi', 'type');
  assertEq(t.poi.type, 'patrol', 'poi.type');
  assertEq(t.entityId, 'poi_p', 'entityId');
});

test('T2.5 planet → {type:planet, planet.id}', () => {
  const hit = { object: {}, kosmosNode: { userData: { kosmosType: 'planet', planetId: 'planet_1' } } };
  const t = resolveTargetFromHits([hit], wp, 'player');
  assertEq(t.type, 'planet', 'type');
  assertEq(t.planet.id, 'planet_1', 'planet.id');
  assertEq(t.entityId, 'planet_1', 'entityId');
});

test('T2.6 vessel z stale userData (vesselId nie istnieje) → fallback empty', () => {
  const hit = { object: {}, kosmosNode: { userData: { kosmosType: 'vessel', vesselId: 'v_stale' } } };
  const t = resolveTargetFromHits([hit], wp, 'player');
  assertEq(t.type, 'empty', 'type');
  assertEq(t.worldPoint, wp, 'worldPoint zachowany');
});

// ──────────────────────────────────────────────────────────────────────────
// T3 — findKosmosNode walk-up parent chain (3 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT3 — findKosmosNode walk-up:');

test('T3.1 direct hit z userData.kosmosType → ten obiekt', () => {
  const node = { userData: { kosmosType: 'vessel', vesselId: 'v_1' } };
  const result = findKosmosNode(node);
  assertTrue(result === node, 'direct return');
});

test('T3.2 child mesh GLB → walk-up do wrapper Group', () => {
  const wrapper = { userData: { kosmosType: 'vessel', vesselId: 'v_3d' } };
  const child  = { userData: {}, parent: wrapper };
  const grandchild = { userData: undefined, parent: child };
  const result = findKosmosNode(grandchild);
  assertTrue(result === wrapper, 'walk-up znajduje wrapper');
});

test('T3.3 brak kosmosType w całym chain → null', () => {
  const root = { userData: { isAtmosphere: true } };  // np. atmoMesh
  const child = { userData: {}, parent: root };
  const result = findKosmosNode(child);
  assertEq(result, null, 'no match → null');
});

// ──────────────────────────────────────────────────────────────────────────
// T4 — Click vs drag distance math (3 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT4 — Click vs drag math:');

function clickVsDrag(downX, downY, upX, upY, threshold = 5) {
  const dist = Math.hypot(upX - downX, upY - downY);
  return dist < threshold ? 'click' : 'drag';
}

test('T4.1 mousedown→mouseup ~2.2px → CLICK', () => {
  assertEq(clickVsDrag(100, 100, 102, 99), 'click', 'verdict');
});

test('T4.2 mousedown→mouseup ~14px → DRAG', () => {
  assertEq(clickVsDrag(100, 100, 110, 110), 'drag', 'verdict');
});

test('T4.3 mousedown→mouseup ==5.0px (boundary, strict <) → DRAG', () => {
  assertEq(clickVsDrag(100, 100, 103, 104), 'drag', 'verdict');  // hypot(3,4)=5
});

// ──────────────────────────────────────────────────────────────────────────
// T5 — Target → buildMenuOptions integration (3 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT5 — Target → menu options dispatch:');

test('T5.1 ownVessel target ≠ selected → escort enabled', () => {
  const target = { type: 'ownVessel', entityId: 'v_own', worldPoint: wp };
  const opts = buildMenuOptions(target, 'v_other_selected');
  const escort = opts.find(o => o.id === 'escort');
  assertTrue(!!escort, 'escort obecny');
  assertEq(escort.enabled, true, 'escort.enabled');
});

test('T5.2 ownVessel target === selected → escort filtrowany (condition)', () => {
  const target = { type: 'ownVessel', entityId: 'v_own', worldPoint: wp };
  const opts = buildMenuOptions(target, 'v_own');  // self
  const escort = opts.find(o => o.id === 'escort');
  assertEq(escort, undefined, 'escort odfiltrowany');
});

test('T5.3 empty target z selectedVessel → moveToPoint+createPOI enabled', () => {
  const target = { type: 'empty', worldPoint: wp };
  const opts = buildMenuOptions(target, 'v_own');
  const move = opts.find(o => o.id === 'moveToPoint');
  const poi  = opts.find(o => o.id === 'createPOI');
  assertEq(move.enabled, true, 'moveToPoint.enabled');
  assertEq(poi.enabled, true, 'createPOI.enabled');
});

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`  ${f.name}`);
    console.log(`    ${f.err.message}`);
  }
  process.exit(1);
}
console.log(`────────────────────────────────────────`);
console.log(`✓ M3 P1.2 smoke OK (${passed}/${passed})`);
