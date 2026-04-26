// M2b — POI (Point of Interest) Types
//
// Schema definitions + per-type validators + soft cap.
//
// 5 typów (discriminated union po polu `type`):
//   waypoint — pojedynczy punkt nawigacyjny (point: {x,y})
//   patrol   — trasa cykliczna (waypoints: [...], loopMode: 'loop'|'ping_pong')
//   picket   — strefa alarmowa (center, rangePxLocal, alertOnEmpireIds?)
//   rally    — punkt zborny (center, waitForCount, memberVesselIds?)
//   ambush   — pułapka (center, rangePxLocal, triggerOnEmpireIds?, hidden)
//
// Runtime dla picket/rally/ambush — M3. W M2b tylko schema + CRUD + handler poi:deleted.

export const POI_TYPES = Object.freeze({
  waypoint: 'waypoint',
  patrol:   'patrol',
  picket:   'picket',
  rally:    'rally',
  ambush:   'ambush',
});

const TYPE_VALUES = new Set(Object.values(POI_TYPES));

/**
 * Walidacja POI spec dla create/update.
 * @param {object} spec
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validatePOISpec(spec) {
  if (!spec || typeof spec !== 'object') {
    return { ok: false, reason: 'spec_not_object' };
  }
  if (!TYPE_VALUES.has(spec.type)) {
    return { ok: false, reason: 'invalid_type' };
  }
  if (typeof spec.name !== 'string' || spec.name.length === 0) {
    return { ok: false, reason: 'name_required' };
  }

  switch (spec.type) {
    case 'waypoint':
      if (!_isPoint(spec.point)) return { ok: false, reason: 'point_required' };
      return { ok: true };

    case 'patrol':
      if (!Array.isArray(spec.waypoints) || spec.waypoints.length < 2) {
        return { ok: false, reason: 'waypoints_min_2' };
      }
      if (!spec.waypoints.every(_isPoint)) {
        return { ok: false, reason: 'waypoint_invalid' };
      }
      if (spec.loopMode !== 'loop' && spec.loopMode !== 'ping_pong') {
        return { ok: false, reason: 'loopMode_invalid' };
      }
      return { ok: true };

    case 'picket':
      if (!_isPoint(spec.center)) return { ok: false, reason: 'center_required' };
      if (typeof spec.rangePxLocal !== 'number' || spec.rangePxLocal <= 0) {
        return { ok: false, reason: 'rangePxLocal_invalid' };
      }
      // alertOnEmpireIds: null | string[] — both OK
      if (spec.alertOnEmpireIds != null && !Array.isArray(spec.alertOnEmpireIds)) {
        return { ok: false, reason: 'alertOnEmpireIds_invalid' };
      }
      return { ok: true };

    case 'rally':
      if (!_isPoint(spec.center)) return { ok: false, reason: 'center_required' };
      if (typeof spec.waitForCount !== 'number' || spec.waitForCount < 1) {
        return { ok: false, reason: 'waitForCount_invalid' };
      }
      return { ok: true };

    case 'ambush':
      if (!_isPoint(spec.center)) return { ok: false, reason: 'center_required' };
      if (typeof spec.rangePxLocal !== 'number' || spec.rangePxLocal <= 0) {
        return { ok: false, reason: 'rangePxLocal_invalid' };
      }
      if (typeof spec.hidden !== 'boolean') {
        return { ok: false, reason: 'hidden_required' };
      }
      return { ok: true };
  }
  return { ok: false, reason: 'unknown' };
}

function _isPoint(p) {
  return p && typeof p.x === 'number' && typeof p.y === 'number';
}

/** Soft cap warning threshold. Hard limit brak w M2b — dodanie w M3 jeśli memory/perf staje się problemem. */
export const POI_SOFT_CAP = 100;
