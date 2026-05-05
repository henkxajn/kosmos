// ── M3 P2.2 — Smoke tests dla POIFormLogic (pure helpers) ─────────────
// getPOIFormSchema / validatePOIForm / formToPOIParams / poiToFormData /
// makeDefaultFormData / integration roundtrip + POIRegistry mock.
//
// Brak DOM/canvas — tylko logika. Uruchomienie: node tmp_m3_p2_2_poi_modal_test.mjs

// ── Stub browser globals (PRZED importami) ───────────────────────────
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem:    (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {};

// ── Imports ──────────────────────────────────────────────────────────
const {
  getPOIFormSchema, validatePOIForm, formToPOIParams,
  poiToFormData, makeDefaultFormData, getFieldDefault,
} = await import('./src/utils/POIFormLogic.js');

// ── Test harness ─────────────────────────────────────────────────────
let passed = 0, failed = 0;
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
function assert(cond, label) { if (!cond) throw new Error(label); }

// ── Fixtures (POI entities — reused z P2.1 patternu) ─────────────────
function makeWaypoint(overrides = {}) {
  return { id: 'poi_w1', type: 'waypoint', name: 'Alpha', ownerEmpireId: 'player',
    createdYear: 2150, point: { x: 100, y: 200 }, ...overrides };
}
function makePatrol(overrides = {}) {
  return { id: 'poi_p1', type: 'patrol', name: 'Beta', ownerEmpireId: 'player',
    createdYear: 2155, waypoints: [{x:0,y:0},{x:10,y:10},{x:20,y:0}], loopMode: 'loop', ...overrides };
}
function makePicket(overrides = {}) {
  return { id: 'poi_pk1', type: 'picket', name: 'Charlie', ownerEmpireId: 'emp_3',
    createdYear: 2160, center: { x: 50, y: 50 }, rangePxLocal: 80, alertOnEmpireIds: null, ...overrides };
}
function makeRally(overrides = {}) {
  return { id: 'poi_r1', type: 'rally', name: 'Delta', ownerEmpireId: 'player',
    createdYear: 2165, center: { x: 0, y: 0 }, waitForCount: 3, memberVesselIds: ['v_1','v_2'], ...overrides };
}
function makeAmbush(overrides = {}) {
  return { id: 'poi_a1', type: 'ambush', name: 'Echo', ownerEmpireId: 'player',
    createdYear: 2170, center: { x: -50, y: 100 }, rangePxLocal: 60, hidden: true, triggerOnEmpireIds: null, ...overrides };
}

// ── FormData fixtures ────────────────────────────────────────────────
function validFormData(type) {
  switch (type) {
    case 'waypoint': return { name: 'WP A', point: { x: 10, y: 20 } };
    case 'patrol':   return { name: 'P A', waypoints: [{x:0,y:0},{x:10,y:10}], loopMode: 'loop' };
    case 'picket':   return { name: 'Pk A', center: { x: 0, y: 0 }, rangePxLocal: 100, alertOnEmpireIds: [] };
    case 'rally':    return { name: 'R A', center: { x: 0, y: 0 }, waitForCount: 5 };
    case 'ambush':   return { name: 'A A', center: { x: 0, y: 0 }, rangePxLocal: 50, hidden: true, triggerOnEmpireIds: [] };
  }
}

// ═════════════════════════════════════════════════════════════════════
// T1 — getPOIFormSchema (6 cases)
// ═════════════════════════════════════════════════════════════════════
console.log('\n[T1] getPOIFormSchema');

test('T1.1 waypoint schema → name + point', () => {
  const s = getPOIFormSchema('waypoint');
  assert(Array.isArray(s), 'array');
  assert(s.some(f => f.id === 'name' && f.type === 'text' && f.required), 'name required');
  assert(s.some(f => f.id === 'point' && f.type === 'point2d' && f.required), 'point required');
});

test('T1.2 patrol schema → waypoints (point2d_array) + loopMode (enum)', () => {
  const s = getPOIFormSchema('patrol');
  const wp = s.find(f => f.id === 'waypoints');
  const lm = s.find(f => f.id === 'loopMode');
  assert(wp && wp.type === 'point2d_array' && wp.minLength === 2 && wp.maxLength === 20, 'waypoints config');
  assert(lm && lm.type === 'enum', 'loopMode enum');
  assert(lm.options.includes('loop') && lm.options.includes('ping_pong'), 'loopMode options');
});

test('T1.3 picket schema → center + rangePxLocal + alertOnEmpireIds', () => {
  const s = getPOIFormSchema('picket');
  assert(s.some(f => f.id === 'center' && f.required), 'center');
  const r = s.find(f => f.id === 'rangePxLocal');
  assert(r && r.type === 'number' && r.min === 1, 'rangePxLocal min=1');
  const a = s.find(f => f.id === 'alertOnEmpireIds');
  assert(a && a.type === 'string_array' && a.required === false, 'alertOn optional');
});

test('T1.4 rally schema → center + waitForCount (min 1)', () => {
  const s = getPOIFormSchema('rally');
  const w = s.find(f => f.id === 'waitForCount');
  assert(w && w.type === 'number' && w.min === 1 && w.required, 'waitForCount min=1 required');
});

test('T1.5 ambush schema → center + range + hidden + triggerOn', () => {
  const s = getPOIFormSchema('ambush');
  const h = s.find(f => f.id === 'hidden');
  assert(h && h.type === 'checkbox' && h.required, 'hidden required checkbox');
  const tr = s.find(f => f.id === 'triggerOnEmpireIds');
  assert(tr && tr.type === 'string_array' && !tr.required, 'triggerOn optional');
});

test('T1.6 unknown type → null', () => {
  assertEq(getPOIFormSchema('unknown_xyz'), null, 'unknown returns null');
  assertEq(getPOIFormSchema(undefined), null, 'undefined returns null');
});

// ═════════════════════════════════════════════════════════════════════
// T2 — validatePOIForm (12 cases)
// ═════════════════════════════════════════════════════════════════════
console.log('\n[T2] validatePOIForm');

test('T2.1 valid waypoint → ok, no errors', () => {
  const r = validatePOIForm('waypoint', validFormData('waypoint'));
  assertEq(r.valid, true, 'valid');
  assertEq(r.errors, {}, 'no errors');
});

test('T2.2 valid patrol → ok', () => {
  const r = validatePOIForm('patrol', validFormData('patrol'));
  assert(r.valid, 'patrol valid');
});

test('T2.3 valid picket → ok', () => {
  const r = validatePOIForm('picket', validFormData('picket'));
  assert(r.valid, 'picket valid');
});

test('T2.4 valid rally → ok', () => {
  const r = validatePOIForm('rally', validFormData('rally'));
  assert(r.valid, 'rally valid');
});

test('T2.5 valid ambush → ok', () => {
  const r = validatePOIForm('ambush', validFormData('ambush'));
  assert(r.valid, 'ambush valid');
});

test('T2.6 missing name → errors.name === required', () => {
  const r = validatePOIForm('waypoint', { name: '', point: { x: 0, y: 0 } });
  assertEq(r.valid, false, 'invalid');
  assertEq(r.errors.name, 'required', 'name required');
});

test('T2.7 name too long (60 chars, maxLength=50) → errors.name === too_long', () => {
  const r = validatePOIForm('waypoint', { name: 'x'.repeat(60), point: { x: 0, y: 0 } });
  assertEq(r.errors.name, 'too_long', 'too_long');
});

test('T2.8 rally waitForCount=0 → errors.waitForCount === too_small', () => {
  const r = validatePOIForm('rally', { name: 'R', center: { x: 0, y: 0 }, waitForCount: 0 });
  assertEq(r.errors.waitForCount, 'too_small', 'too_small');
});

test('T2.9 waypoint point with NaN → errors.point === invalid_point', () => {
  const r = validatePOIForm('waypoint', { name: 'W', point: { x: NaN, y: 0 } });
  assertEq(r.errors.point, 'invalid_point', 'invalid_point');
});

test('T2.10 patrol empty waypoints → errors.waypoints === required', () => {
  const r = validatePOIForm('patrol', { name: 'P', waypoints: [], loopMode: 'loop' });
  assertEq(r.errors.waypoints, 'required', 'empty array → required');
});

test('T2.11 patrol single waypoint (min 2) → errors.waypoints === too_few_points', () => {
  const r = validatePOIForm('patrol', { name: 'P', waypoints: [{x:0,y:0}], loopMode: 'loop' });
  assertEq(r.errors.waypoints, 'too_few_points', 'too_few_points');
});

test('T2.12 picket alertOnEmpireIds=[] (optional) → valid', () => {
  const r = validatePOIForm('picket', { name: 'Pk', center: { x: 0, y: 0 }, rangePxLocal: 50, alertOnEmpireIds: [] });
  assert(r.valid, 'optional empty → valid');
});

// ═════════════════════════════════════════════════════════════════════
// T3 — formToPOIParams (5 cases)
// ═════════════════════════════════════════════════════════════════════
console.log('\n[T3] formToPOIParams');

test('T3.1 waypoint form → params {type, name, point}', () => {
  const p = formToPOIParams('waypoint', validFormData('waypoint'));
  assertEq(p, { type: 'waypoint', name: 'WP A', point: { x: 10, y: 20 } }, 'waypoint params');
});

test('T3.2 patrol form → params {type, name, waypoints, loopMode}', () => {
  const p = formToPOIParams('patrol', validFormData('patrol'));
  assertEq(p.type, 'patrol', 'type');
  assertEq(p.waypoints.length, 2, 'waypoints len');
  assertEq(p.loopMode, 'loop', 'loopMode');
});

test('T3.3 picket form z empty alertOnEmpireIds → params strips optional empty', () => {
  const p = formToPOIParams('picket', validFormData('picket'));
  assert(!('alertOnEmpireIds' in p), 'optional empty stripped');
  assertEq(p.rangePxLocal, 100, 'rangePxLocal preserved');
});

test('T3.4 rally form → params no memberVesselIds (POIRegistry init []) ', () => {
  const p = formToPOIParams('rally', validFormData('rally'));
  assertEq(p.waitForCount, 5, 'waitForCount');
  assertEq(p.center, { x: 0, y: 0 }, 'center');
});

test('T3.5 ambush form → params {hidden:true, type:ambush, ...}', () => {
  const p = formToPOIParams('ambush', validFormData('ambush'));
  assertEq(p.type, 'ambush', 'type');
  assertEq(p.hidden, true, 'hidden');
  assertEq(p.rangePxLocal, 50, 'rangePxLocal');
  assert(!('triggerOnEmpireIds' in p), 'triggerOn empty stripped');
});

// ═════════════════════════════════════════════════════════════════════
// T4 — poiToFormData (5 cases)
// ═════════════════════════════════════════════════════════════════════
console.log('\n[T4] poiToFormData');

test('T4.1 waypoint POI → formData {name, point}', () => {
  const f = poiToFormData(makeWaypoint());
  assertEq(f, { name: 'Alpha', point: { x: 100, y: 200 } }, 'waypoint formData');
});

test('T4.2 patrol POI → formData z waypoints + loopMode', () => {
  const f = poiToFormData(makePatrol());
  assertEq(f.name, 'Beta', 'name');
  assertEq(f.waypoints.length, 3, 'wp count');
  assertEq(f.loopMode, 'loop', 'loopMode');
});

test('T4.3 picket POI z null alertOnEmpireIds → formData ma []', () => {
  const f = poiToFormData(makePicket());
  assertEq(f.alertOnEmpireIds, [], 'null → []');
  assertEq(f.rangePxLocal, 80, 'range preserved');
});

test('T4.4 rally POI → formData {center, waitForCount}', () => {
  const f = poiToFormData(makeRally());
  assertEq(f.waitForCount, 3, 'waitForCount');
  assertEq(f.center, { x: 0, y: 0 }, 'center');
});

test('T4.5 ambush POI → formData {hidden, range, triggerOn=[]}', () => {
  const f = poiToFormData(makeAmbush());
  assertEq(f.hidden, true, 'hidden');
  assertEq(f.rangePxLocal, 60, 'range');
  assertEq(f.triggerOnEmpireIds, [], 'triggerOn null → []');
});

// ═════════════════════════════════════════════════════════════════════
// T5 — Integration / roundtrip (4 cases)
// ═════════════════════════════════════════════════════════════════════
console.log('\n[T5] Integration / roundtrip');

// Mock POIRegistry — śledzi wywołania
function makeMockRegistry() {
  const calls = [];
  return {
    calls,
    createPOI: (spec) => { calls.push({ method: 'createPOI', spec }); return { ok: true, poiId: 'poi_99' }; },
    updatePOI: (id, ch) => { calls.push({ method: 'updatePOI', id, ch }); return { ok: true }; },
  };
}

test('T5.1 valid form → validate → params → mock createPOI succeeds', () => {
  const reg = makeMockRegistry();
  const formData = validFormData('waypoint');
  const v = validatePOIForm('waypoint', formData);
  assert(v.valid, 'valid');
  const params = formToPOIParams('waypoint', formData);
  const r = reg.createPOI(params);
  assertEq(r.ok, true, 'create ok');
  assertEq(reg.calls.length, 1, '1 call');
  assertEq(reg.calls[0].spec.point, { x: 10, y: 20 }, 'point preserved');
});

test('T5.2 invalid form → validation fail → no createPOI call', () => {
  const reg = makeMockRegistry();
  const v = validatePOIForm('waypoint', { name: '', point: { x: 0, y: 0 } });
  assert(!v.valid, 'invalid');
  if (v.valid) reg.createPOI(formToPOIParams('waypoint', { name: '', point: { x: 0, y: 0 } }));
  assertEq(reg.calls.length, 0, 'no calls');
});

test('T5.3 roundtrip per type: poi → poiToFormData → formToPOIParams preserves data', () => {
  // Waypoint roundtrip
  const wp = makeWaypoint();
  const wpForm = poiToFormData(wp);
  const wpParams = formToPOIParams('waypoint', wpForm);
  assertEq(wpParams.point, wp.point, 'wp point preserved');
  assertEq(wpParams.name, wp.name, 'wp name preserved');

  // Patrol roundtrip
  const pt = makePatrol();
  const ptForm = poiToFormData(pt);
  const ptParams = formToPOIParams('patrol', ptForm);
  assertEq(ptParams.waypoints, pt.waypoints, 'patrol waypoints preserved');
  assertEq(ptParams.loopMode, pt.loopMode, 'patrol loopMode preserved');

  // Ambush roundtrip
  const am = makeAmbush();
  const amForm = poiToFormData(am);
  const amParams = formToPOIParams('ambush', amForm);
  assertEq(amParams.hidden, am.hidden, 'ambush hidden preserved');
  assertEq(amParams.rangePxLocal, am.rangePxLocal, 'ambush range preserved');
});

test('T5.4 makeDefaultFormData(patrol) + formToPOIParams produces valid loopMode default', () => {
  // Default form data dla patrol — sprawdzamy że loopMode default='loop' jest applied
  const def = makeDefaultFormData('patrol');
  assertEq(def.loopMode, 'loop', 'default loopMode');
  assertEq(def.name, '', 'default name empty');
  assertEq(def.waypoints, [], 'default waypoints []');

  // formToPOIParams z formData bez loopMode → schema default kicks in
  const params = formToPOIParams('patrol', { name: 'X', waypoints: [{x:0,y:0},{x:1,y:1}] });
  assertEq(params.loopMode, 'loop', 'schema default applied');
});

// ═════════════════════════════════════════════════════════════════════
// Final summary
// ═════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  PASSED: ${passed}    FAILED: ${failed}    TOTAL: ${passed + failed}`);
if (failed > 0) {
  console.log('\n  FAILURES:');
  for (const f of failures) console.log(`    - ${f.name}: ${f.err.message}`);
  process.exit(1);
}
console.log('\n  ✓ All tests passed.\n');
