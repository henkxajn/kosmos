// M3 P1.4 — pure helper dispatchu cancel orderu.
//
// Wyciągnięte z FleetManagerOverlay._handleHit('cancel_movement_order') by
// móc testować logikę headlessly (FleetOverlay zależy od canvas/THREE).
// Deps injectowane zamiast window.KOSMOS — smoke mockuje wszystkie 4.
//
// L21 — KEEP IN SYNC z MovementOrderSystem.cancelOrder():
//   - przyjmuje (vesselId, reason) → boolean
//   - true gdy istniał aktywny order (status='active')
//   - false gdy: !vessel || !order || order.status !== 'active'
//
// Zwraca { ok, reason? } zamiast czystego boolean by smoke mógł asercjonować
// konkretną przyczynę odrzucenia (no_vessel vs no_order vs mos_rejected).

/**
 * @param {object} deps
 * @param {object} deps.mos              — MovementOrderSystem instance (lub null)
 * @param {object} deps.vesselManager    — VesselManager instance (lub null)
 * @param {object} deps.eventLogSystem   — EventLogSystem instance (lub null)
 * @param {function} deps.t              — i18n translator (key, ...args) → string
 * @param {string} vesselId
 * @returns {{ok: boolean, reason?: string}}
 *   reason ∈ 'no_mos' | 'no_vessel' | 'no_order' | 'mos_rejected'
 */
export function tryCancelVesselOrder(deps, vesselId) {
  const { mos, vesselManager, eventLogSystem, t } = deps ?? {};
  if (!mos?.cancelOrder) return { ok: false, reason: 'no_mos' };

  const vessel = vesselManager?.getVessel?.(vesselId);
  if (!vessel) return { ok: false, reason: 'no_vessel' };
  if (!vessel.movementOrder) return { ok: false, reason: 'no_order' };

  const orderType = vessel.movementOrder.type;
  const cancelled = mos.cancelOrder(vesselId, 'player');
  if (!cancelled) return { ok: false, reason: 'mos_rejected' };

  // EventLog wpis — channel='fleet' (V5: 'orders' nie istnieje w CHANNELS).
  eventLogSystem?.push?.({
    text: t ? t('fleet.cancelOrderEntry', vessel.name ?? '?', orderType) : `cancelled ${vesselId}`,
    channel: 'fleet',
    severity: 'info',
    entityRef: vesselId,
  });
  return { ok: true };
}
