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

import { ORDER_ACTIVITY_KEYS, ORDER_ACTIVITY_FALLBACK_KEY } from '../ui/FleetPictureLogic.js';

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
  // ⚠ Do audytu 2026-08-27 do wpisu szedł SUROWY slug (`moveToPoint`). Kompletna macierz
  //   etykiet (9 typów + `generic`) istniała w `FleetPictureLogic` jako PRYWATNA — teraz
  //   eksportowana. To czyste DANE, więc import nie wciąga i18n i nie psuje testowalności
  //   tego modułu pod node (tłumacz nadal wchodzi PARAMETREM, wzorzec `BattleSides`).
  const orderLabel = t
    ? t(ORDER_ACTIVITY_KEYS[orderType] ?? ORDER_ACTIVITY_FALLBACK_KEY)
    : orderType;
  const cancelled = mos.cancelOrder(vesselId, 'player');
  if (!cancelled) return { ok: false, reason: 'mos_rejected' };

  // EventLog wpis — channel='fleet' (V5: 'orders' nie istnieje w CHANNELS).
  eventLogSystem?.push?.({
    // ⚠ Modul jest BEZJEZYKOWY z rozmyslu (`t` wchodzi parametrem — ten sam wzorzec co
    // `BattleSides`), ale fallback byl zaszytym angielskim z surowym id. Gdy tlumacza nie ma,
    // lepiej wypisac NAZWE statku niz `v_49`.
    text: t ? t('fleet.cancelOrderEntry', vessel.name ?? '?', orderLabel)
            : `${vessel.name ?? vesselId}: ${orderType}`,
    channel: 'fleet',
    severity: 'info',
    entityRef: vesselId,
  });
  return { ok: true };
}
