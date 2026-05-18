// ── M3 P1.3 — OrderDispatcher (pure helper) ──────────────────────────
// Buduje `spec` dla MovementOrderSystem.issueOrder z opcji menu i targetu
// raycaster'a. Pure — testowalne offline (L18-L20). Brak importu THREE/DOM.
//
// KEEP IN SYNC z MovementOrderSystem.issueOrder(vesselId, spec) (V1):
//   spec.type ∈ ORDER_TYPES (moveToPoint|pursue|intercept|escort|goToPOI|patrol)
//   moveToPoint:        spec.targetPoint = { x, y }   (px, vessel.position units)
//   pursue/intercept/escort: spec.targetEntityId = string
//   goToPOI:            spec.poiId = string
//   patrol:             spec.poiId = string  OR  spec.patrolRoute = [{x,y}, ...] (≥2)
//
// Off-spec discoveries (z plan mode V_extra):
//   - V3: Planet NIE ma `.position` field — używamy body.x / body.y (CelestialBody)
//   - V_extra: worldPoint.y = 0 (KOSMOS XZ plane Y=altitude); konwersja XZ → XY
//
// Target shape (z RaycasterHelper.resolveTargetFromHits):
//   { type: 'empty'|'enemyVessel'|'ownVessel'|'poi'|'planet',
//     entityId?, vessel?, poi?, planet?,
//     worldPoint: { x, y:0, z } }

// P1.3.5 post-fix: obsługa OBU konwencji worldPoint:
//   3D (mapa 3D legacy, XZ plane Y=0): { x, y, z } → używamy wp.z jako y (L8)
//   2D (tactical map, FleetOverlay):    { x, y }    → używamy wp.y bezpośrednio
// Null guard: invalid wp / brakujące pola → null → caller raportuje no_target_point.
const POINT_FROM_WORLD = (wp) => {
  if (!wp || typeof wp.x !== 'number' || !Number.isFinite(wp.x)) return null;
  const y = typeof wp.z === 'number' ? wp.z : wp.y;
  if (typeof y !== 'number' || !Number.isFinite(y)) return null;
  return { x: wp.x, y };
};

/**
 * Buduje spec dla MOS.issueOrder z opcji menu + raycaster target.
 * @param {object} option   — z buildMenuOptions: { id, orderType, action, ... }
 * @param {object} target   — z resolveTargetFromHits: { type, entityId?, planet?, vessel?, poi?, worldPoint }
 * @param {string|null} vesselId — selected vessel ID (UIManager.getSelectedVesselId)
 * @returns {{ ok: boolean, spec?: object, reason?: string }}
 */
export function buildOrderSpec(option, target, vesselId) {
  if (!vesselId) return { ok: false, reason: 'no_vessel_selected' };
  if (!option || !option.orderType) return { ok: false, reason: 'option_has_no_orderType' };
  if (!target || !target.type) return { ok: false, reason: 'no_target' };

  const orderType = option.orderType;

  switch (orderType) {
    case 'moveToPoint': {
      // Planet target — używaj body.x/body.y bezpośrednio (V3 — Planet NIE ma .position)
      if (target.type === 'planet' && target.planet
          && typeof target.planet.x === 'number'
          && typeof target.planet.y === 'number') {
        return {
          ok: true,
          spec: { type: 'moveToPoint', targetPoint: { x: target.planet.x, y: target.planet.y } },
        };
      }
      // Empty target — worldPoint może być 3D (mapa 3D, XZ plane) lub
      // 2D (tactical FleetOverlay, P1.3.5). POINT_FROM_WORLD obsługuje OBA.
      const point = POINT_FROM_WORLD(target.worldPoint);
      if (point) {
        return {
          ok: true,
          spec: { type: 'moveToPoint', targetPoint: point },
        };
      }
      return { ok: false, reason: 'no_target_point' };
    }

    case 'pursue':
    case 'intercept':
    case 'escort':
    case 'engage': {
      if (!target.entityId || typeof target.entityId !== 'string') {
        return { ok: false, reason: 'no_target_entity' };
      }
      return {
        ok: true,
        spec: { type: orderType, targetEntityId: target.entityId },
      };
    }

    case 'goToPOI': {
      if (target.type !== 'poi' || !target.entityId) {
        return { ok: false, reason: 'no_poi_target' };
      }
      return {
        ok: true,
        spec: { type: 'goToPOI', poiId: target.entityId },
      };
    }

    case 'patrol': {
      // POI patrol — used z menu poi (option.id='patrol' na POI typu 'patrol').
      // Manual patrol z empty target (option.id='patrolManual') NIE przechodzi przez
      // ten helper — UI uruchamia picker mode przed wywołaniem buildPatrolFromWaypoints.
      if (target.type === 'poi' && target.entityId) {
        return {
          ok: true,
          spec: { type: 'patrol', poiId: target.entityId },
        };
      }
      return { ok: false, reason: 'patrol_needs_poi_or_picker' };
    }

    default:
      return { ok: false, reason: 'unknown_orderType', orderType };
  }
}

/**
 * Buduje spec patrol z waypoint'ów picker mode. Waypoints są w (x, y) — UIManager
 * konwertuje XZ→XY przy addPickerWaypoint via GameScene tactical click handler.
 * @param {Array<{x:number, y:number}>} waypoints
 * @returns {{ ok: boolean, spec?: object, reason?: string }}
 */
export function buildPatrolFromWaypoints(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { ok: false, reason: 'min_waypoints_not_met', have: waypoints?.length ?? 0 };
  }
  const route = waypoints.map(w => ({ x: w.x, y: w.y }));
  for (const w of route) {
    if (typeof w.x !== 'number' || typeof w.y !== 'number'
        || !Number.isFinite(w.x) || !Number.isFinite(w.y)) {
      return { ok: false, reason: 'invalid_waypoint' };
    }
  }
  return {
    ok: true,
    spec: { type: 'patrol', patrolRoute: route },
  };
}

export const _internals = { POINT_FROM_WORLD };
