// ── M3 P1.3 — Smoke tests dla picker mode + OrderDispatcher ────────────
// Pure logic only (bez THREE/DOM/window). Mock EventBus przez no-op (nie testowane).
// Cumulative target: 37 (M3 prev) + 20 (P1.3) = 57/57 GREEN.
//
// Uruchomienie: node tmp_m3_p1_3_orders_test.mjs

import {
  createPickerState,
  startPicker,
  addWaypoint,
  finalizePicker,
  cancelPicker,
  PICKER_MODES,
} from './src/utils/PickerStateMachine.js';
import {
  buildOrderSpec,
  buildPatrolFromWaypoints,
} from './src/utils/OrderDispatcher.js';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}
function group(name) { console.log(`\n── ${name} ──`); }

// ──────────────────────────────────────────────────────────────────────
// T1 — PickerStateMachine
// ──────────────────────────────────────────────────────────────────────
group('T1 — PickerStateMachine');

// T1.1 startPicker valid
{
  const state = createPickerState();
  const r = startPicker(state, PICKER_MODES.PATROL_WAYPOINTS, () => {});
  ok(r.ok === true, 'T1.1a startPicker valid → ok');
  ok(r.newState?.mode === 'patrolWaypoints', 'T1.1b newState.mode set');
  ok(Array.isArray(r.newState?.waypoints) && r.newState.waypoints.length === 0, 'T1.1c waypoints empty');
}

// T1.2 startPicker already active
{
  const state = createPickerState();
  const r1 = startPicker(state, PICKER_MODES.PATROL_WAYPOINTS, () => {});
  const r2 = startPicker(r1.newState, PICKER_MODES.PATROL_WAYPOINTS, () => {});
  ok(r2.ok === false, 'T1.2a startPicker already active → ok=false');
  ok(r2.reason === 'already_active', 'T1.2b reason=already_active');
}

// T1.3 startPicker invalid mode
{
  const state = createPickerState();
  const r = startPicker(state, 'bogusMode', () => {});
  ok(r.ok === false && r.reason === 'invalid_mode', 'T1.3 invalid_mode rejected');
}

// T1.4 addWaypoint wrong mode
{
  const state = createPickerState();
  const r = addWaypoint(state, { x: 1, y: 2 });
  ok(r.ok === false && r.reason === 'wrong_mode', 'T1.4 addWaypoint idle → wrong_mode');
}

// T1.4b addWaypoint invalid point
{
  const state = startPicker(createPickerState(), PICKER_MODES.PATROL_WAYPOINTS, () => {}).newState;
  const r = addWaypoint(state, { x: NaN, y: 5 });
  ok(r.ok === false && r.reason === 'invalid_point', 'T1.4b addWaypoint NaN → invalid_point');
}

// T1.5 finalize patrol <2 waypoints
{
  let state = startPicker(createPickerState(), PICKER_MODES.PATROL_WAYPOINTS, () => {}).newState;
  state = addWaypoint(state, { x: 10, y: 10 }).newState;
  const r = finalizePicker(state);
  ok(r.ok === false && r.reason === 'min_waypoints_not_met', 'T1.5a finalize 1 wp rejected');
  ok(r.minRequired === 2 && r.have === 1, 'T1.5b minRequired+have reported');
}

// T1.6 finalize patrol with ≥2
{
  let cbCalled = false;
  let state = startPicker(createPickerState(), PICKER_MODES.PATROL_WAYPOINTS, (res) => { cbCalled = true; }, { vesselId: 'v_42' }).newState;
  state = addWaypoint(state, { x: 10, y: 20 }).newState;
  state = addWaypoint(state, { x: 30, y: 40 }).newState;
  state = addWaypoint(state, { x: 50, y: 60 }).newState;
  const r = finalizePicker(state);
  ok(r.ok === true, 'T1.6a finalize 3 wp → ok');
  ok(Array.isArray(r.result) && r.result.length === 3, 'T1.6b result is array of 3');
  ok(r.result[0].x === 10 && r.result[0].y === 20, 'T1.6c first waypoint preserved');
  ok(r.metadata?.vesselId === 'v_42', 'T1.6d metadata propagated');
  ok(typeof r.callback === 'function', 'T1.6e callback returned');
}

// T1.7 cancelPicker → idle state
{
  let state = startPicker(createPickerState(), PICKER_MODES.PATROL_WAYPOINTS, () => {}).newState;
  state = addWaypoint(state, { x: 1, y: 1 }).newState;
  const r = cancelPicker(state);
  ok(r.ok === true && r.newState.mode === null && r.newState.waypoints.length === 0, 'T1.7 cancel → idle');
}

// ──────────────────────────────────────────────────────────────────────
// T2 — OrderDispatcher.buildOrderSpec
// ──────────────────────────────────────────────────────────────────────
group('T2 — OrderDispatcher.buildOrderSpec');

// Fixtures (z V1-V3 cytatów)
const fOption = (orderType, action = 'issueOrder') => ({ id: orderType, orderType, action, requiresSelection: true });

// T2.1 moveToPoint empty + worldPoint (XZ → XY)
{
  const r = buildOrderSpec(
    fOption('moveToPoint'),
    { type: 'empty', worldPoint: { x: 100, y: 0, z: 200 } },
    'v_1',
  );
  ok(r.ok === true, 'T2.1a moveToPoint empty ok');
  ok(r.spec?.type === 'moveToPoint', 'T2.1b spec.type');
  ok(r.spec?.targetPoint?.x === 100 && r.spec?.targetPoint?.y === 200, 'T2.1c XZ→XY conversion');
}

// T2.2 moveToPoint planet (V3 — body.x/body.y NIE planet.position)
{
  const r = buildOrderSpec(
    fOption('moveToPoint'),
    { type: 'planet', entityId: 'p_1', planet: { id: 'p_1', x: 250, y: 0 }, worldPoint: { x: 0, y: 0, z: 0 } },
    'v_1',
  );
  ok(r.ok === true, 'T2.2a moveToPoint planet ok');
  ok(r.spec?.targetPoint?.x === 250 && r.spec?.targetPoint?.y === 0, 'T2.2b uses planet.x/y');
}

// T2.3 moveToPoint bez worldPoint i bez planet
{
  const r = buildOrderSpec(
    fOption('moveToPoint'),
    { type: 'empty' },
    'v_1',
  );
  ok(r.ok === false && r.reason === 'no_target_point', 'T2.3 no target → no_target_point');
}

// T2.4 pursue z entityId
{
  const r = buildOrderSpec(
    fOption('pursue'),
    { type: 'enemyVessel', entityId: 'v_99', worldPoint: { x: 0, y: 0, z: 0 } },
    'v_1',
  );
  ok(r.ok === true, 'T2.4a pursue ok');
  ok(r.spec?.type === 'pursue' && r.spec?.targetEntityId === 'v_99', 'T2.4b spec ma targetEntityId');
}

// T2.5 escort bez selectedVesselId
{
  const r = buildOrderSpec(
    fOption('escort'),
    { type: 'ownVessel', entityId: 'v_2', worldPoint: { x: 0, y: 0, z: 0 } },
    null,
  );
  ok(r.ok === false && r.reason === 'no_vessel_selected', 'T2.5 escort no vessel → reject');
}

// T2.6 goToPOI z poi target
{
  const r = buildOrderSpec(
    fOption('goToPOI'),
    { type: 'poi', entityId: 'poi_5', poi: { id: 'poi_5', type: 'waypoint' }, worldPoint: { x: 0, y: 0, z: 0 } },
    'v_1',
  );
  ok(r.ok === true && r.spec?.poiId === 'poi_5', 'T2.6 goToPOI poiId');
}

// T2.7 patrol POI (z menu poi, nie picker)
{
  const r = buildOrderSpec(
    fOption('patrol'),
    { type: 'poi', entityId: 'poi_pat', poi: { id: 'poi_pat', type: 'patrol' }, worldPoint: { x: 0, y: 0, z: 0 } },
    'v_1',
  );
  ok(r.ok === true && r.spec?.poiId === 'poi_pat', 'T2.7 patrol POI poiId');
}

// T2.7b patrol z empty target → picker required (NIE buildOrderSpec)
{
  const r = buildOrderSpec(
    fOption('patrol'),
    { type: 'empty', worldPoint: { x: 0, y: 0, z: 0 } },
    'v_1',
  );
  ok(r.ok === false && r.reason === 'patrol_needs_poi_or_picker', 'T2.7b patrol empty → reject (picker only)');
}

// T2.8 unknown orderType
{
  const r = buildOrderSpec(
    { id: 'foo', orderType: 'mysterious', action: 'issueOrder' },
    { type: 'empty', worldPoint: { x: 0, y: 0, z: 0 } },
    'v_1',
  );
  ok(r.ok === false && r.reason === 'unknown_orderType', 'T2.8 unknown orderType');
}

// ──────────────────────────────────────────────────────────────────────
// T3 — buildPatrolFromWaypoints
// ──────────────────────────────────────────────────────────────────────
group('T3 — buildPatrolFromWaypoints');

// T3.1 empty array
{
  const r = buildPatrolFromWaypoints([]);
  ok(r.ok === false && r.reason === 'min_waypoints_not_met', 'T3.1 empty → reject');
}

// T3.2 1 waypoint
{
  const r = buildPatrolFromWaypoints([{ x: 1, y: 2 }]);
  ok(r.ok === false && r.reason === 'min_waypoints_not_met', 'T3.2 1 wp → reject');
}

// T3.3 4 waypoints valid
{
  const r = buildPatrolFromWaypoints([
    { x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }, { x: 70, y: 80 },
  ]);
  ok(r.ok === true, 'T3.3a 4 wp ok');
  ok(r.spec?.type === 'patrol', 'T3.3b spec.type=patrol');
  ok(Array.isArray(r.spec?.patrolRoute) && r.spec.patrolRoute.length === 4, 'T3.3c patrolRoute len 4');
  ok(r.spec.patrolRoute[2].x === 50 && r.spec.patrolRoute[2].y === 60, 'T3.3d preserved coords');
}

// T3.4 invalid waypoint (NaN)
{
  const r = buildPatrolFromWaypoints([
    { x: 10, y: 20 }, { x: NaN, y: 40 },
  ]);
  ok(r.ok === false && r.reason === 'invalid_waypoint', 'T3.4 NaN waypoint → reject');
}

// ──────────────────────────────────────────────────────────────────────
// T4 — Integration: option click → buildOrderSpec → mock MOS dispatch
// ──────────────────────────────────────────────────────────────────────
group('T4 — Integration mock dispatch');

// Mock MOS.issueOrder spy
function mockMOS() {
  const calls = [];
  return {
    calls,
    issueOrder: (vesselId, spec) => {
      calls.push({ vesselId, spec });
      return { ok: true, orderId: `mo_${calls.length}` };
    },
  };
}

// T4.1 "Lecisz tutaj" → MOS.issueOrder(vId, {type:'moveToPoint', targetPoint})
{
  const mos = mockMOS();
  const opt = fOption('moveToPoint');
  const tgt = { type: 'empty', worldPoint: { x: 333, y: 0, z: 444 } };
  const built = buildOrderSpec(opt, tgt, 'v_alpha');
  if (built.ok) mos.issueOrder('v_alpha', built.spec);
  ok(mos.calls.length === 1, 'T4.1a MOS called once');
  ok(mos.calls[0].vesselId === 'v_alpha', 'T4.1b vesselId passed');
  ok(mos.calls[0].spec.type === 'moveToPoint', 'T4.1c moveToPoint type');
  ok(mos.calls[0].spec.targetPoint.x === 333 && mos.calls[0].spec.targetPoint.y === 444, 'T4.1d targetPoint XZ→XY');
}

// T4.2 "Eskortuj" + ownVessel target → MOS.issueOrder(vId, {type:'escort', targetEntityId})
{
  const mos = mockMOS();
  const opt = fOption('escort');
  const tgt = { type: 'ownVessel', entityId: 'v_beta', worldPoint: { x: 0, y: 0, z: 0 } };
  const built = buildOrderSpec(opt, tgt, 'v_alpha');
  if (built.ok) mos.issueOrder('v_alpha', built.spec);
  ok(mos.calls.length === 1, 'T4.2a MOS called');
  ok(mos.calls[0].spec.type === 'escort' && mos.calls[0].spec.targetEntityId === 'v_beta', 'T4.2b escort spec');
}

// T4.3 "Patroluj manualnie" empty target → buildOrderSpec rejects, picker required
{
  const mos = mockMOS();
  const opt = fOption('patrol');  // empty target = picker mode required
  const tgt = { type: 'empty', worldPoint: { x: 0, y: 0, z: 0 } };
  const built = buildOrderSpec(opt, tgt, 'v_alpha');
  ok(built.ok === false, 'T4.3a buildOrderSpec rejects empty patrol');
  ok(built.reason === 'patrol_needs_poi_or_picker', 'T4.3b reason guides to picker flow');
  // Symuluj picker flow: po finalize buildPatrolFromWaypoints daje spec, MOS issued.
  const pickerWp = [{ x: 100, y: 200 }, { x: 300, y: 400 }];
  const builtP = buildPatrolFromWaypoints(pickerWp);
  if (builtP.ok) mos.issueOrder('v_alpha', builtP.spec);
  ok(mos.calls.length === 1, 'T4.3c picker → MOS issued');
  ok(mos.calls[0].spec.type === 'patrol' && mos.calls[0].spec.patrolRoute.length === 2, 'T4.3d patrol with route');
}

// T4.4 picker callback dispatch via finalizePicker (e2e w pure logic)
{
  const mos = mockMOS();
  let cbInvoked = false;
  const cb = (waypoints) => {
    cbInvoked = true;
    const built = buildPatrolFromWaypoints(waypoints);
    if (built.ok) mos.issueOrder('v_gamma', built.spec);
  };
  let state = startPicker(createPickerState(), PICKER_MODES.PATROL_WAYPOINTS, cb, { vesselId: 'v_gamma' }).newState;
  state = addWaypoint(state, { x: 1, y: 1 }).newState;
  state = addWaypoint(state, { x: 2, y: 2 }).newState;
  const fin = finalizePicker(state);
  if (fin.ok && fin.callback) fin.callback(fin.result, fin.metadata);
  ok(cbInvoked === true, 'T4.4a callback fired');
  ok(mos.calls.length === 1 && mos.calls[0].spec.type === 'patrol', 'T4.4b MOS got patrol spec');
  ok(mos.calls[0].spec.patrolRoute.length === 2, 'T4.4c 2 waypoints in spec');
}

// ──────────────────────────────────────────────────────────────────────
console.log(`\n── Summary ──`);
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail > 0) {
  console.log('\nFailed cases:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('All P1.3 cases GREEN ✓');
