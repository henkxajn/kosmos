// MovementOrderTypes — enum rodzajów orderów ruchu militarnego + walidator.
//
// Rozkaz ruchu (MovementOrder) to warstwa nad standardową misją (transport/recon/...),
// sterująca pozycją statku w kontekście wojskowym (moveTo, pursue, intercept).
// Patrz docs/design/milestone-1-targeting-foundation.md §8.
//
// W M1 pełna implementacja tylko dla 'moveToPoint'; 'pursue'/'intercept' dojdą
// w Commit 5; 'patrol' runtime + 'goToPOI' dochodzą w M2b Commit 6;
// 'escort' — no-op stub (runtime w M2b Commit 7).
//
// M2b Commit 6: 'goToPOI' to "moveToPoint z poiId hint" — punkt celu rozwiązywany
//   z POIRegistry per typ POI (waypoint→point, patrol→waypoints[0], rally/picket/
//   ambush→center). 'patrol' rozszerzony — akceptuje poiId LUB patrolRoute.

export const ORDER_TYPES = Object.freeze({
  moveToPoint: 'moveToPoint',
  pursue:      'pursue',
  intercept:   'intercept',
  patrol:      'patrol',     // M2b C6: pełny runtime
  escort:      'escort',     // M2b C7 stub (runtime w C7)
  goToPOI:     'goToPOI',    // M2b C6: POI nawigacja (delegacja do moveToPoint)
});

const TYPES_WITH_ENTITY_TARGET = new Set([ORDER_TYPES.pursue, ORDER_TYPES.intercept, ORDER_TYPES.escort]);
const TYPES_WITH_POINT_TARGET  = new Set([ORDER_TYPES.moveToPoint]);
export const TYPES_WITH_POI_TARGET = new Set([ORDER_TYPES.goToPOI]);

/**
 * Waliduje specyfikację orderu przekazaną do MovementOrderSystem.issueOrder.
 *
 * @param {object} spec — { type, targetEntityId?, targetPoint?, patrolRoute?, issuedBy? }
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateOrder(spec) {
  if (!spec || typeof spec !== 'object') {
    return { valid: false, reason: 'spec_missing' };
  }
  const type = spec.type;
  if (!Object.values(ORDER_TYPES).includes(type)) {
    return { valid: false, reason: 'invalid_type' };
  }

  if (TYPES_WITH_ENTITY_TARGET.has(type)) {
    if (!spec.targetEntityId || typeof spec.targetEntityId !== 'string') {
      return { valid: false, reason: 'missing_target_entity' };
    }
  }

  if (TYPES_WITH_POINT_TARGET.has(type)) {
    const p = spec.targetPoint;
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' ||
        !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return { valid: false, reason: 'missing_target_point' };
    }
  }

  if (TYPES_WITH_POI_TARGET.has(type)) {
    // M2b C6: goToPOI wymaga poiId (string non-empty). Istnienie POI sprawdza
    // _issueGoToPOI runtime (registry lookup), bo MovementOrderTypes.js nie zna
    // window.KOSMOS.poiRegistry.
    if (typeof spec.poiId !== 'string' || spec.poiId.length === 0) {
      return { valid: false, reason: 'missing_poi_id' };
    }
  }

  if (type === ORDER_TYPES.patrol) {
    // M2b C6: patrol akceptuje poiId LUB patrolRoute (>=2 punktów). Co najmniej jedno.
    // Gdy poiId — _issuePatrol resolve'uje route z POI.waypoints; gdy patrolRoute —
    // używa go bezpośrednio (manualny patrol z devtools).
    const hasPOI   = typeof spec.poiId === 'string' && spec.poiId.length > 0;
    const hasRoute = Array.isArray(spec.patrolRoute) && spec.patrolRoute.length >= 2;
    if (!hasPOI && !hasRoute) {
      return { valid: false, reason: 'patrol_needs_poi_or_route' };
    }
  }

  return { valid: true };
}
