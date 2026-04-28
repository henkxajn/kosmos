// Smoke test M3 P1.3.5 — Tactical map raycaster (FleetOverlay 2D)
//
// Pokrywa T1, T2, T3, T4 (~17 cases):
//   T1 tacticalToWorld pure math — 5 cases (center / off-center / pan / null guard / round-trip)
//   T2 findHitZone reverse-iter + filter — 5 cases (no hits / single body / single vessel / overlap / non-tactical filter)
//   T3 resolveTacticalTarget dispatch — 6 cases (empty / ownVessel / enemyVessel / planet / stale vessel / stale entity)
//   T4 viewState defensive — 3 cases (null / missing fields / zero scale)
//
// Pure tylko — bez DOM, bez THREE. Testowalne offline.
// Run: node tmp_m3_p1_3_tactical_test.mjs

// ── Stub browser globals (PRZED importami) ─────────────────────────────────
globalThis.window = globalThis.window ?? globalThis;

// Mock dla resolveTacticalTarget — lookups jako test injection (czystsze
// niż globalne window.KOSMOS w teście pure helpera).
const _vessels = new Map([
  ['v_own',         { id: 'v_own',     name: 'Alfa' }],                        // player default
  ['v_own_explicit',{ id: 'v_own_explicit', name: 'Beta', owner: 'player' }],  // player explicit
  ['v_enemy',       { id: 'v_enemy',   name: 'Wróg',  owner: 'emp_sandbox' }], // enemy via owner
  ['v_enemy_legacy',{ id: 'v_enemy_legacy', name: 'Łowca', isEnemy: true }],   // enemy via isEnemy
]);
const _entities = new Map([
  ['planet_1', { id: 'planet_1', type: 'planet', name: 'Bastion' }],
  ['moon_1',   { id: 'moon_1',   type: 'moon',   name: 'Tycho' }],
  ['star_0',   { id: 'star_0',   type: 'star',   name: 'Słońce' }],
]);
const lookups = {
  getVessel: (id) => _vessels.get(id) ?? null,
  getEntity: (id) => _entities.get(id) ?? null,
};

const { tacticalToWorld, findHitZone, resolveTacticalTarget } =
  await import('./src/utils/TacticalRaycaster.js');

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
function assertNull(actual, label) {
  if (actual !== null) throw new Error(`${label}: expected null, got ${JSON.stringify(actual)}`);
}

// Reference viewState matching FleetOverlay._mapViewState shape:
//   mapCx, mapCy = środek tactical mapy w UI-canvas-local px
//   auToPx       = mapRadius / maxOrbitAU (skalowany przez _mapZoom)
//   AU_TO_PX     = GAME_CONFIG.AU_TO_PX (typowo ~63 px/AU dla widoku układu)
const viewState = {
  mapCx: 500,
  mapCy: 300,
  auToPx: 60,        // 1 AU = 60 px na ekranie tactical mapy
  AU_TO_PX: 60,      // 1 AU = 60 vessel.position px (1:1 dla prostoty testu)
};

// ──────────────────────────────────────────────────────────────────────────
// T1 — tacticalToWorld pure math (5 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT1 — tacticalToWorld:');

test('T1.1 (mapCx, mapCy) → world (0, 0)', () => {
  const wp = tacticalToWorld(500, 300, viewState);
  assertClose(wp.x, 0, 1e-9, 'wp.x');
  assertClose(wp.y, 0, 1e-9, 'wp.y');
});

test('T1.2 off-center (560, 360) → world (60, 60) przy 1:1 scale', () => {
  // (560-500) * 60/60 = 60
  const wp = tacticalToWorld(560, 360, viewState);
  assertClose(wp.x, 60, 1e-9, 'wp.x');
  assertClose(wp.y, 60, 1e-9, 'wp.y');
});

test('T1.3 z innym scale ratio (auToPx=120, AU_TO_PX=60) — 0.5 px/world', () => {
  // dzielnik 120, mnożnik 60 → ratio 0.5: każdy screen px = 0.5 world px
  const vs = { mapCx: 500, mapCy: 300, auToPx: 120, AU_TO_PX: 60 };
  const wp = tacticalToWorld(620, 300, vs);
  assertClose(wp.x, 60, 1e-9, 'wp.x');  // (620-500)*60/120 = 60
  assertClose(wp.y, 0,  1e-9, 'wp.y');
});

test('T1.4 null viewState → null (defensywny guard)', () => {
  assertNull(tacticalToWorld(500, 300, null), 'tacticalToWorld(null)');
});

test('T1.5 round-trip: world (X, Y) → toSx/toSy → tacticalToWorld → identity', () => {
  // Forward (z FleetOverlay): toSx = bodyX/AU_TO_PX * auToPx + mapCx
  const X = 123, Y = -456;
  const sx = X / viewState.AU_TO_PX * viewState.auToPx + viewState.mapCx;
  const sy = Y / viewState.AU_TO_PX * viewState.auToPx + viewState.mapCy;
  const wp = tacticalToWorld(sx, sy, viewState);
  assertClose(wp.x, X, 1e-9, 'round-trip x');
  assertClose(wp.y, Y, 1e-9, 'round-trip y');
});

// ──────────────────────────────────────────────────────────────────────────
// T2 — findHitZone reverse-iter + filter (5 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT2 — findHitZone:');

test('T2.1 brak hit zones → null', () => {
  assertNull(findHitZone(100, 100, []), 'empty hitZones');
  assertNull(findHitZone(100, 100, null), 'null hitZones');
});

test('T2.2 single body → match', () => {
  const zones = [{ x: 90, y: 90, w: 20, h: 20, type: 'map_body', data: { bodyId: 'planet_1' } }];
  const hit = findHitZone(100, 100, zones);
  assertEq(hit.data.bodyId, 'planet_1', 'matched body');
});

test('T2.3 single vessel → match', () => {
  const zones = [{ x: 90, y: 90, w: 20, h: 20, type: 'map_vessel', data: { vesselId: 'v_own' } }];
  const hit = findHitZone(100, 100, zones);
  assertEq(hit.data.vesselId, 'v_own', 'matched vessel');
});

test('T2.4 vessel pushed AFTER body → vessel wygrywa overlap (reverse-iter)', () => {
  // Push order matches FleetOverlay tactical render: bodies first, vessels last.
  const zones = [
    { x: 90, y: 90, w: 20, h: 20, type: 'map_body',   data: { bodyId: 'planet_1' } },
    { x: 90, y: 90, w: 20, h: 20, type: 'map_vessel', data: { vesselId: 'v_own' } },
  ];
  const hit = findHitZone(100, 100, zones);
  assertEq(hit.type, 'map_vessel', 'vessel topmost');
  assertEq(hit.data.vesselId, 'v_own', 'vessel id');
});

test('T2.5 non-tactical types skipped (toggle / home_focus / atlas_report)', () => {
  const zones = [
    { x: 0, y: 0, w: 200, h: 200, type: 'home_focus',   data: {} },
    { x: 0, y: 0, w: 200, h: 200, type: 'map_toggle',   data: {} },
    { x: 0, y: 0, w: 200, h: 200, type: 'atlas_report', data: {} },
  ];
  assertNull(findHitZone(100, 100, zones), 'non-tactical types ignored');
});

// ──────────────────────────────────────────────────────────────────────────
// T3 — resolveTacticalTarget dispatch (6 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT3 — resolveTacticalTarget:');

test('T3.1 hit=null → empty + worldPoint passthrough', () => {
  const wp = { x: 10, y: 20 };
  const t = resolveTacticalTarget(null, wp, lookups);
  assertEq(t.type, 'empty', 'type');
  assertEq(t.worldPoint, wp, 'wp passthrough');
});

test('T3.2 ownVessel (no owner field — default player)', () => {
  const hit = { type: 'map_vessel', data: { vesselId: 'v_own' } };
  const wp = { x: 5, y: 5 };
  const t = resolveTacticalTarget(hit, wp, lookups);
  assertEq(t.type, 'ownVessel', 'type');
  assertEq(t.entityId, 'v_own', 'entityId');
  assertEq(t.vessel?.name, 'Alfa', 'vessel resolved');
});

test('T3.3 ownVessel (owner=player explicit)', () => {
  const hit = { type: 'map_vessel', data: { vesselId: 'v_own_explicit' } };
  const t = resolveTacticalTarget(hit, { x: 0, y: 0 }, lookups);
  assertEq(t.type, 'ownVessel', 'type');
});

test('T3.4 enemyVessel (owner != player)', () => {
  const hit = { type: 'map_vessel', data: { vesselId: 'v_enemy' } };
  const t = resolveTacticalTarget(hit, { x: 0, y: 0 }, lookups);
  assertEq(t.type, 'enemyVessel', 'type');
  assertEq(t.entityId, 'v_enemy', 'entityId');
});

test('T3.5 planet (map_body → resolved entity)', () => {
  const hit = { type: 'map_body', data: { bodyId: 'planet_1' } };
  const t = resolveTacticalTarget(hit, { x: 100, y: 200 }, lookups);
  assertEq(t.type, 'planet', 'type');
  assertEq(t.entityId, 'planet_1', 'entityId');
  assertEq(t.planet?.name, 'Bastion', 'planet resolved');
});

test('T3.6 stale vessel/entity → empty fallback (defensywny)', () => {
  const hitV = { type: 'map_vessel', data: { vesselId: 'NIE_ISTNIEJE' } };
  const tV = resolveTacticalTarget(hitV, { x: 0, y: 0 }, lookups);
  assertEq(tV.type, 'empty', 'stale vessel → empty');

  const hitB = { type: 'map_body', data: { bodyId: 'NIE_ISTNIEJE' } };
  const tB = resolveTacticalTarget(hitB, { x: 0, y: 0 }, lookups);
  assertEq(tB.type, 'empty', 'stale body → empty');
});

// ──────────────────────────────────────────────────────────────────────────
// T4 — viewState defensive (3 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT4 — viewState defensive:');

test('T4.1 missing AU_TO_PX → null', () => {
  const vs = { mapCx: 0, mapCy: 0, auToPx: 60 }; // brak AU_TO_PX
  assertNull(tacticalToWorld(10, 10, vs), 'no AU_TO_PX');
});

test('T4.2 zero auToPx → null (zapobiega div-by-zero)', () => {
  const vs = { mapCx: 0, mapCy: 0, auToPx: 0, AU_TO_PX: 60 };
  assertNull(tacticalToWorld(10, 10, vs), 'zero auToPx');
});

test('T4.3 NaN/string mapCx → null', () => {
  const vs = { mapCx: 'oops', mapCy: 0, auToPx: 60, AU_TO_PX: 60 };
  assertNull(tacticalToWorld(10, 10, vs), 'invalid mapCx');
});

// ──────────────────────────────────────────────────────────────────────────
// Raport
// ──────────────────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────`);
console.log(`Wynik: ${passed} PASS, ${failed} FAIL (${passed + failed} total)`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.name}`);
    console.log(`    ${f.err.message}`);
  }
  process.exit(1);
}
process.exit(0);
