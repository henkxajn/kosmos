// ── M3 P1.3 — PickerStateMachine (pure logic) ────────────────────────
// Pure state machine dla picker mode (np. patrol waypoints, future:
// targetEntity / targetPoint pickers w P2.3+). Bez THREE, bez DOM,
// bez window references — testowalne offline (L18).
//
// Stany:
//   idle (mode=null) → pickingWaypoints (mode='patrolWaypoints')
//                    → finalized (callback called) | cancelled (callback skipped)
//
// API: createPickerState, startPicker, addWaypoint, finalizePicker, cancelPicker.
// UIManager używa tego helpera jako warstwy logiki — UI emit + cursor/HUD
// to oddzielna warstwa (GameScene._createPickerHUD).

export const PICKER_MODES = Object.freeze({
  TARGET_ENTITY:     'targetEntity',
  TARGET_POINT:      'targetPoint',
  PATROL_WAYPOINTS:  'patrolWaypoints',
});

const VALID_MODES = new Set(Object.values(PICKER_MODES));

const MIN_PATROL_WAYPOINTS = 2;  // D5 — zgodnie z MovementOrderTypes.validateOrder

export function createPickerState() {
  return {
    mode:      null,
    callback:  null,
    waypoints: [],
    metadata:  {},
  };
}

export function startPicker(state, mode, callback, metadata = {}) {
  if (state && state.mode !== null) {
    return { ok: false, reason: 'already_active' };
  }
  if (!VALID_MODES.has(mode)) {
    return { ok: false, reason: 'invalid_mode' };
  }
  return {
    ok: true,
    newState: {
      mode,
      callback: typeof callback === 'function' ? callback : null,
      waypoints: [],
      metadata: metadata && typeof metadata === 'object' ? { ...metadata } : {},
    },
  };
}

export function addWaypoint(state, point) {
  if (!state || state.mode !== PICKER_MODES.PATROL_WAYPOINTS) {
    return { ok: false, reason: 'wrong_mode' };
  }
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number'
      || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return { ok: false, reason: 'invalid_point' };
  }
  return {
    ok: true,
    newState: {
      ...state,
      waypoints: [...state.waypoints, { x: point.x, y: point.y }],
    },
  };
}

export function finalizePicker(state) {
  if (!state || state.mode === null) {
    return { ok: false, reason: 'no_active_picker' };
  }
  if (state.mode === PICKER_MODES.PATROL_WAYPOINTS
      && state.waypoints.length < MIN_PATROL_WAYPOINTS) {
    return {
      ok: false,
      reason: 'min_waypoints_not_met',
      minRequired: MIN_PATROL_WAYPOINTS,
      have: state.waypoints.length,
    };
  }
  return {
    ok: true,
    result: state.mode === PICKER_MODES.PATROL_WAYPOINTS
      ? state.waypoints.map(w => ({ x: w.x, y: w.y }))
      : null,
    callback: state.callback,
    metadata: { ...state.metadata },
    mode: state.mode,
  };
}

export function cancelPicker(state) {
  return { ok: true, newState: createPickerState(), mode: state?.mode ?? null };
}

export const _internals = { MIN_PATROL_WAYPOINTS, VALID_MODES };
