// ── M3 P2.3 — Create POI mode + tactical sprites + coord fix smoke test ──
// Pure-logic only (Node ESM, no DOM/canvas/Three).
//
// T1 — gameplayToWorld / worldToGameplay round-trip          (~6 cases)
// T2 — pickerResultToPOISpec per type                          (~10 cases)
// T3 — TacticalRaycaster map_poi case                          (~5 cases)
// T4 — Coord tooltip format                                    (~4 cases)
// T5 — Picker flow + integration                               (~5 cases)
//
// Cumulative target: ~225 (P2.1+P2.2) + ~30 = ~255 GREEN.

// ── Stub browser globals (PRZED importami) ─────────────────────────────
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {};

// ── Imports ───────────────────────────────────────────────────────────
const { gameplayToWorld, worldToGameplay, _internals: ctInternals }
  = await import('./src/utils/CoordTransform.js');
const { pickerResultToPOISpec, getPOILocation, PICKER_DEFAULTS }
  = await import('./src/utils/POIPanelLogic.js');
const { findHitZone, resolveTacticalTarget, tacticalToWorld }
  = await import('./src/utils/TacticalRaycaster.js');
const { createPickerState, startPicker, addWaypoint, finalizePicker, cancelPicker, PICKER_MODES }
  = await import('./src/utils/PickerStateMachine.js');

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
function assertCloseEq(actual, expected, eps, msg) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg}: expected ${expected} ± ${eps}, got ${actual}`);
  }
}
function assertNull(actual, msg) {
  if (actual !== null) throw new Error(`${msg}: expected null, got ${JSON.stringify(actual)}`);
}
function assertTrue(actual, msg) {
  if (!actual) throw new Error(`${msg}: expected truthy, got ${actual}`);
}
function assertFalse(actual, msg) {
  if (actual) throw new Error(`${msg}: expected falsy, got ${actual}`);
}

// ══════════════════════════════════════════════════════════════════════
// T1 — gameplayToWorld / worldToGameplay round-trip
// ══════════════════════════════════════════════════════════════════════
console.log('T1 — gameplayToWorld/worldToGameplay round-trip');

test('T1.1 — origin (0,0) maps to (0,0)', () => {
  assertEq(gameplayToWorld({ x: 0, y: 0 }), { worldX: 0, worldZ: 0 }, 'origin');
  assertEq(worldToGameplay(0, 0), { x: 0, y: 0 }, 'inverse origin');
});

test('T1.2 — (1100, -330) maps to (110, -33)', () => {
  // 1 AU = 110 px = 11 world units → 1 world unit = 10 px (WORLD_SCALE)
  assertEq(gameplayToWorld({ x: 1100, y: -330 }), { worldX: 110, worldZ: -33 }, 'forward');
  assertEq(worldToGameplay(110, -33), { x: 1100, y: -330 }, 'inverse');
});

test('T1.3 — round-trip preserves precision', () => {
  const start = { x: 555.5, y: -333.3 };
  const world = gameplayToWorld(start);
  const back = worldToGameplay(world.worldX, world.worldZ);
  assertCloseEq(back.x, start.x, 0.001, 'round-trip x');
  assertCloseEq(back.y, start.y, 0.001, 'round-trip y');
});

test('T1.4 — null input returns null', () => {
  assertNull(gameplayToWorld(null), 'null input');
  assertNull(gameplayToWorld(undefined), 'undefined input');
  assertNull(gameplayToWorld({}), 'empty obj input');
  assertNull(gameplayToWorld({ x: 'NaN', y: 5 }), 'string x');
});

test('T1.5 — invalid worldToGameplay returns null', () => {
  assertNull(worldToGameplay(NaN, 0), 'NaN x');
  assertNull(worldToGameplay(0, NaN), 'NaN z');
  assertNull(worldToGameplay(undefined, 5), 'undefined x');
});

test('T1.6 — WORLD_SCALE constant matches ThreeRenderer', () => {
  // Must stay in sync z ThreeRenderer.js:29 (WORLD_SCALE = 10)
  assertEq(ctInternals.WORLD_SCALE, 10, 'WORLD_SCALE');
});

// ══════════════════════════════════════════════════════════════════════
// T2 — pickerResultToPOISpec per type
// ══════════════════════════════════════════════════════════════════════
console.log('T2 — pickerResultToPOISpec per type');

test('T2.1 — waypoint single point', () => {
  const r = pickerResultToPOISpec('waypoint', { point: { x: 100, y: 200 } });
  assertEq(r, { point: { x: 100, y: 200 } }, 'waypoint spec');
});

test('T2.2 — picket adds rangePxLocal default', () => {
  const r = pickerResultToPOISpec('picket', { point: { x: 50, y: 50 } });
  assertEq(r, { center: { x: 50, y: 50 }, rangePxLocal: PICKER_DEFAULTS.rangePxLocal }, 'picket spec');
  assertTrue(r.rangePxLocal > 0, 'picket has positive range');
});

test('T2.3 — rally adds waitForCount default', () => {
  const r = pickerResultToPOISpec('rally', { point: { x: -10, y: 30 } });
  assertEq(r, { center: { x: -10, y: 30 }, waitForCount: PICKER_DEFAULTS.waitForCount }, 'rally spec');
});

test('T2.4 — ambush adds rangePxLocal + hidden default', () => {
  const r = pickerResultToPOISpec('ambush', { point: { x: 0, y: 0 } });
  assertEq(r, {
    center: { x: 0, y: 0 },
    rangePxLocal: PICKER_DEFAULTS.rangePxLocal,
    hidden: PICKER_DEFAULTS.hidden,
  }, 'ambush spec');
  assertTrue(r.hidden === true, 'ambush hidden defaults to true');
});

test('T2.5 — patrol multi-waypoints + loopMode default', () => {
  const r = pickerResultToPOISpec('patrol', {
    waypoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
  });
  assertEq(r.waypoints.length, 3, 'patrol waypoint count');
  assertEq(r.loopMode, 'loop', 'patrol default loop');
});

test('T2.6 — patrol rejects <2 waypoints', () => {
  assertNull(pickerResultToPOISpec('patrol', { waypoints: [{ x: 0, y: 0 }] }), 'single wp rejected');
  assertNull(pickerResultToPOISpec('patrol', { waypoints: [] }), 'empty wp rejected');
});

test('T2.7 — patrol filters invalid waypoints', () => {
  const r = pickerResultToPOISpec('patrol', {
    waypoints: [{ x: 0, y: 0 }, null, { x: 'NaN', y: 5 }, { x: 10, y: 10 }],
  });
  assertEq(r.waypoints.length, 2, 'invalid wp filtered');
});

test('T2.8 — invalid type returns null', () => {
  assertNull(pickerResultToPOISpec('unknown', { point: { x: 0, y: 0 } }), 'unknown type');
  assertNull(pickerResultToPOISpec('waypoint', null), 'null pickerResult');
  assertNull(pickerResultToPOISpec('waypoint', { point: null }), 'null point');
});

test('T2.9 — waypoint missing point returns null', () => {
  assertNull(pickerResultToPOISpec('waypoint', { point: { x: 'NaN', y: 0 } }), 'invalid x');
  assertNull(pickerResultToPOISpec('waypoint', { point: {} }), 'empty point');
});

test('T2.10 — pickerResult preserves negative coords', () => {
  const r = pickerResultToPOISpec('waypoint', { point: { x: -550, y: -1000 } });
  assertEq(r, { point: { x: -550, y: -1000 } }, 'negative coords');
});

// ══════════════════════════════════════════════════════════════════════
// T3 — TacticalRaycaster map_poi case
// ══════════════════════════════════════════════════════════════════════
console.log('T3 — TacticalRaycaster map_poi case');

test('T3.1 — findHitZone matches map_poi', () => {
  const zones = [
    { x: 0, y: 0, w: 20, h: 20, type: 'map_poi', data: { poiId: 'poi_1' } },
  ];
  const hit = findHitZone(10, 10, zones);
  assertEq(hit?.type, 'map_poi', 'hit type');
  assertEq(hit?.data?.poiId, 'poi_1', 'hit poiId');
});

test('T3.2 — findHitZone reverse iter (POI added after vessel wins)', () => {
  const zones = [
    { x: 0, y: 0, w: 20, h: 20, type: 'map_vessel', data: { vesselId: 'v_1' } },
    { x: 0, y: 0, w: 20, h: 20, type: 'map_poi',    data: { poiId: 'poi_1' } },
  ];
  const hit = findHitZone(10, 10, zones);
  assertEq(hit?.type, 'map_poi', 'POI wins (last in array, reverse iter)');
});

test('T3.3 — resolveTacticalTarget map_poi → type:poi', () => {
  const fakePoi = { id: 'poi_1', type: 'waypoint', point: { x: 0, y: 0 } };
  const hit = { type: 'map_poi', data: { poiId: 'poi_1' } };
  const target = resolveTacticalTarget(hit, { x: 5, y: 5 }, {
    getPOI: (id) => id === 'poi_1' ? fakePoi : null,
  });
  assertEq(target?.type, 'poi', 'target type');
  assertEq(target?.entityId, 'poi_1', 'target entityId');
  assertTrue(target?.poi === fakePoi, 'target poi reference');
});

test('T3.4 — resolveTacticalTarget unknown poiId → empty', () => {
  const hit = { type: 'map_poi', data: { poiId: 'poi_xxx' } };
  const target = resolveTacticalTarget(hit, { x: 0, y: 0 }, { getPOI: () => null });
  assertEq(target?.type, 'empty', 'unknown poi → empty');
});

test('T3.5 — resolveTacticalTarget map_vessel/map_body still works', () => {
  const fakeVessel = { id: 'v_1', isEnemy: false };
  const r1 = resolveTacticalTarget(
    { type: 'map_vessel', data: { vesselId: 'v_1' } },
    { x: 0, y: 0 },
    { getVessel: () => fakeVessel },
  );
  assertEq(r1?.type, 'ownVessel', 'map_vessel regression');

  const fakePlanet = { id: 'p_1' };
  const r2 = resolveTacticalTarget(
    { type: 'map_body', data: { bodyId: 'p_1' } },
    { x: 0, y: 0 },
    { getEntity: () => fakePlanet },
  );
  assertEq(r2?.type, 'planet', 'map_body regression');
});

// ══════════════════════════════════════════════════════════════════════
// T4 — Coord tooltip format (string formatting only)
// ══════════════════════════════════════════════════════════════════════
console.log('T4 — Coord tooltip format');

// Formatter inline (logic z GameScene._scheduleCoordTooltip)
function formatCoord(p) {
  const x = Math.round(p.x * 10) / 10;
  const y = Math.round(p.y * 10) / 10;
  return `Pozycja: (${x.toFixed(1)}, ${y.toFixed(1)})`;
}

test('T4.1 — basic positive coords', () => {
  assertEq(formatCoord({ x: 123.456, y: 67.89 }), 'Pozycja: (123.5, 67.9)', 'positive');
});

test('T4.2 — negative coords', () => {
  assertEq(formatCoord({ x: -550.123, y: -333.456 }), 'Pozycja: (-550.1, -333.5)', 'negative');
});

test('T4.3 — zero coords', () => {
  assertEq(formatCoord({ x: 0, y: 0 }), 'Pozycja: (0.0, 0.0)', 'zero');
});

test('T4.4 — large coords', () => {
  assertEq(formatCoord({ x: 12345.6, y: -54321.0 }), 'Pozycja: (12345.6, -54321.0)', 'large');
});

// ══════════════════════════════════════════════════════════════════════
// T5 — Picker flow + integration
// ══════════════════════════════════════════════════════════════════════
console.log('T5 — Picker flow integration');

test('T5.1 — startPicker targetPoint mode (z metadata)', () => {
  const s = createPickerState();
  const r = startPicker(s, PICKER_MODES.TARGET_POINT, () => {}, {
    intent: 'create_poi', poiType: 'waypoint',
  });
  assertTrue(r.ok, 'startPicker ok');
  assertEq(r.newState.mode, PICKER_MODES.TARGET_POINT, 'mode');
  assertEq(r.newState.metadata.intent, 'create_poi', 'metadata.intent');
  assertEq(r.newState.metadata.poiType, 'waypoint', 'metadata.poiType');
});

test('T5.2 — startPicker patrolWaypoints mode dla create_poi', () => {
  const s = createPickerState();
  const r = startPicker(s, PICKER_MODES.PATROL_WAYPOINTS, () => {}, {
    intent: 'create_poi', poiType: 'patrol',
  });
  assertTrue(r.ok, 'startPicker ok');
  assertEq(r.newState.metadata.intent, 'create_poi', 'patrol create_poi metadata');
});

test('T5.3 — patrol multi-click flow ≥ 2 waypoints', () => {
  let s = createPickerState();
  s = startPicker(s, PICKER_MODES.PATROL_WAYPOINTS, () => {}, { intent: 'create_poi' }).newState;
  s = addWaypoint(s, { x: 100, y: 200 }).newState;
  s = addWaypoint(s, { x: 300, y: 400 }).newState;
  assertEq(s.waypoints.length, 2, 'wp count after 2 clicks');
  const r = finalizePicker(s);
  assertTrue(r.ok, 'finalize ok');
  assertEq(r.result, [{ x: 100, y: 200 }, { x: 300, y: 400 }], 'finalized waypoints');
});

test('T5.4 — patrol min waypoints not met', () => {
  let s = createPickerState();
  s = startPicker(s, PICKER_MODES.PATROL_WAYPOINTS, () => {}, {}).newState;
  s = addWaypoint(s, { x: 0, y: 0 }).newState;
  const r = finalizePicker(s);
  assertFalse(r.ok, 'finalize rejected');
  assertEq(r.reason, 'min_waypoints_not_met', 'reason');
});

test('T5.5 — cancel resets state', () => {
  let s = createPickerState();
  s = startPicker(s, PICKER_MODES.PATROL_WAYPOINTS, () => {}, {}).newState;
  s = addWaypoint(s, { x: 0, y: 0 }).newState;
  const r = cancelPicker(s);
  assertTrue(r.ok, 'cancel ok');
  assertEq(r.newState, { mode: null, callback: null, waypoints: [], metadata: {} }, 'reset');
});

test('T5.6 — getPOILocation per type (regression P2.1)', () => {
  assertEq(getPOILocation({ type: 'waypoint', point: { x: 1, y: 2 } }), { x: 1, y: 2 }, 'waypoint');
  assertEq(getPOILocation({ type: 'patrol', waypoints: [{ x: 5, y: 6 }, { x: 10, y: 10 }] }),
           { x: 5, y: 6 }, 'patrol → wp[0]');
  assertEq(getPOILocation({ type: 'picket', center: { x: 7, y: 8 } }), { x: 7, y: 8 }, 'picket');
  assertEq(getPOILocation({ type: 'ambush', center: { x: -1, y: -2 } }), { x: -1, y: -2 }, 'ambush');
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
