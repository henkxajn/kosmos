// AutoRetreatSystem — automatyczne wycofanie vesseli po retreat w bitwie (M2a).
//
// Event-driven. Nasłuchuje battle:resolved. Gdy result.retreated === 'A'|'B',
// dla każdego vessela strony retreatującej wydaje moveToPoint order do
// najbliższej friendly planety przez MovementOrderSystem. Gdy brak friendly
// planety (player ma tylko wrogie systemy lub zero kolonii) — vessel staje się
// deep-space wrakiem w miejscu aktualnej pozycji.
//
// Nie ma osobnego feature flag — system aktywny gdy FEATURES.vesselCombat=true
// (bez combat nie ma retreat; lazy init w GameScene razem z VCS).
//
// Eventy:
//   vessel:autoRetreatIssued { vesselId, battleId, destinationPlanetId, orderId }
//   vessel:autoRetreatFailed { vesselId, battleId, reason: 'no_friendly_planet' }
//
// Marker: vessel.movementOrder.retreatFromBattleId = battleId po udanym issue.
// UI może pokazać "Retreating from battle X" (M2b hookup).

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';

export class AutoRetreatSystem {
  /**
   * @param {import('./VesselManager.js').VesselManager} vesselManager
   * @param {object} colonyManager
   * @param {import('./MovementOrderSystem.js').MovementOrderSystem} movementOrderSystem
   */
  constructor(vesselManager, colonyManager, movementOrderSystem) {
    this._vm   = vesselManager;
    this._col  = colonyManager;
    this._mos  = movementOrderSystem;

    this._onBattleResolved = (e) => this._handleBattleResolved(e);
    EventBus.on('battle:resolved', this._onBattleResolved);
  }

  destroy() {
    EventBus.off('battle:resolved', this._onBattleResolved);
  }

  // ── Event handler ────────────────────────────────────────────────────

  _handleBattleResolved({ battleId, result }) {
    if (!result) return;
    const side = result.retreated === 'A' ? result.participantA
               : result.retreated === 'B' ? result.participantB
               : null;
    if (!side) return;
    if (side.type !== 'vessel_group') return;  // abstract fleet retreat → M3
    const vesselIds = Array.isArray(side.vesselIds) ? side.vesselIds : [];
    if (vesselIds.length === 0) return;

    for (const vId of vesselIds) {
      const v = this._vm?.getVessel?.(vId) ?? this._vm?._vessels?.get?.(vId);
      if (!v || v.isWreck) continue;
      this._issueRetreatOrder(v, battleId);
    }
  }

  // ── Retreat order ────────────────────────────────────────────────────

  _issueRetreatOrder(vessel, battleId) {
    const dest = this._findNearestFriendlyPlanet(vessel);
    if (!dest) {
      // Brak friendly planety — wrak w miejscu pozycji (delegacja do EAH).
      const handler = window.KOSMOS?.enemyAttackHandler;
      const pos = { x: vessel.position.x, y: vessel.position.y };
      if (handler?._turnIntoWreck) {
        handler._turnIntoWreck(vessel, pos, this._year());
      } else {
        // Fallback — taki sam stan jak deep-space wreck bez handler.
        vessel.isWreck  = true;
        vessel.status   = 'destroyed';
        vessel.mission  = null;
        vessel.wreckedAt = this._year();
        vessel.position.state    = 'orbiting';
        vessel.position.dockedAt = null;
        vessel.wreckLocation = pos;
        if (vessel.fuel) vessel.fuel.current = 0;
        EventBus.emit('vessel:wrecked', { vesselId: vessel.id, vessel });
      }
      EventBus.emit('vessel:autoRetreatFailed', {
        vesselId: vessel.id, battleId, reason: 'no_friendly_planet',
      });
      return null;
    }

    if (!this._mos?.issueOrder) return null;

    const res = this._mos.issueOrder(vessel.id, {
      type:        'moveToPoint',
      targetPoint: { x: dest.planet.x, y: dest.planet.y },
      issuedBy:    'auto_retreat',
    });
    if (!res?.ok) {
      // Order rejected (np. insufficient_fuel). NIE wrecking — gracz może
      // zatankować i ręcznie wydać order. Emit failed z powodem z MOS.
      EventBus.emit('vessel:autoRetreatFailed', {
        vesselId: vessel.id, battleId, reason: res?.reason ?? 'order_rejected',
      });
      return null;
    }

    // Marker retreatFromBattleId — UI pokazuje kontekst retreat.
    if (vessel.movementOrder) {
      vessel.movementOrder.retreatFromBattleId = battleId;
    }

    EventBus.emit('vessel:autoRetreatIssued', {
      vesselId:            vessel.id,
      battleId,
      destinationPlanetId: dest.planet.id,
      orderId:             res.orderId,
    });
    return res.orderId;
  }

  // ── Target selection ─────────────────────────────────────────────────

  /**
   * Znajdź najbliższą friendly planetę. Preferuje pełne kolonie (isOutpost=false);
   * gdy brak — fallback na outposty. Gdy nic — return null (wrak).
   *
   * @param {object} vessel
   * @returns {{ colony: object, planet: object, distanceAU: number } | null}
   */
  _findNearestFriendlyPlanet(vessel) {
    if (!this._col?.getAllColonies) return null;
    const ownerId = vessel.ownerEmpireId ?? vessel.owner ?? 'player';

    // Filtruj kolonie tej samej frakcji + istnieje Entity.
    const all = this._col.getAllColonies().filter(c => {
      const cOwner = c.ownerEmpireId ?? 'player';
      if (cOwner !== ownerId) return false;
      return !!EntityManager.get(c.planetId);
    });
    if (all.length === 0) return null;

    // Preferuj pełne kolonie (isOutpost=false). Jeśli żadna nie spełnia —
    // fallback na outposty. Design decyzja różniąca od doca §8.5: doc filtruje
    // outposty dla player "na twardo", ale gdy player MA tylko outposty,
    // zostałby wrakiem co jest zbyt surowe. Graceful fallback: outpost > wrak.
    const fullColonies = all.filter(c => !c.isOutpost);
    const candidates = fullColonies.length > 0 ? fullColonies : all;

    // Wrapper vessel jako { x, y } — DistanceUtils czyta .x/.y directly.
    const vwrap = { x: vessel.position.x, y: vessel.position.y };

    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const planet = EntityManager.get(c.planetId);
      if (!planet) continue;
      const d = DistanceUtils.euclideanAU(vwrap, planet);
      if (d < bestDist) {
        bestDist = d;
        best = { colony: c, planet, distanceAU: d };
      }
    }
    return best;
  }

  _year() {
    return window.KOSMOS?.timeSystem?.gameTime ?? 0;
  }
}
