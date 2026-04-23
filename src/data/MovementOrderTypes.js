// MovementOrderTypes — enum rodzajów orderów ruchu militarnego + walidator.
//
// Rozkaz ruchu (MovementOrder) to warstwa nad standardową misją (transport/recon/...),
// sterująca pozycją statku w kontekście wojskowym (moveTo, pursue, intercept).
// Patrz docs/design/milestone-1-targeting-foundation.md §8.
//
// W M1 pełna implementacja tylko dla 'moveToPoint'; 'pursue'/'intercept' dojdą
// w Commit 5; 'patrol'/'escort' — no-op stub (placeholder pod M2).
//
// TODO M2: rozszerzyć ORDER_TYPES o 'goToPOI' — POI (Point of Interest) to nazwana
//   lokacja z typem (anomaly / beacon / station / resource cluster). POI Registry
//   to osobny system M2. Obecnie targetEntityId ogranicza się do vessel + celestial body.

export const ORDER_TYPES = Object.freeze({
  moveToPoint: 'moveToPoint',
  pursue:      'pursue',
  intercept:   'intercept',
  patrol:      'patrol',
  escort:      'escort',
});

const TYPES_WITH_ENTITY_TARGET = new Set([ORDER_TYPES.pursue, ORDER_TYPES.intercept, ORDER_TYPES.escort]);
const TYPES_WITH_POINT_TARGET  = new Set([ORDER_TYPES.moveToPoint]);

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

  if (type === ORDER_TYPES.patrol) {
    const r = spec.patrolRoute;
    if (!Array.isArray(r) || r.length < 2) {
      // M1: patrol to no-op stub, ale walidator wymaga >=2 punktów żeby złapać literówki wcześnie.
      return { valid: false, reason: 'patrol_needs_2_points' };
    }
  }

  return { valid: true };
}
