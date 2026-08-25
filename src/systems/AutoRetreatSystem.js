// AutoRetreatSystem — automatyczne wycofanie vesseli po retreat w bitwie (M2a).
//
// Event-driven. Nasłuchuje battle:resolved. Gdy result.retreated === 'A'|'B',
// dla każdego vessela strony retreatującej wydaje moveToPoint order do najbliższego
// SCHRONIENIA przez MovementOrderSystem.
//
// ⚠ ZMIANA SEMANTYKI (slice RETREAT_TARGET, plan `docs/design/RETREAT_TARGET_PLAN.md`):
//   1. Cel dobiera `MovementOrderSystem.resolveShelterOrderSpec` → `utils/RetreatTarget.js`, a nie
//      `_findNearestFriendlyPlanet`. Tamta funkcja NIE MA TERMINU UKŁADU i wskazywała kolonie
//      z innych układów (gwiazda każdego układu stoi w (0,0)) ⇒ rozkaz odpadał na
//      `target_other_system` i ODWRÓT NIE DZIAŁAŁ DLA NIKOGO (Finding F-D, zmierzone na żywo 3×).
//      `_findNearestFriendlyPlanet` ZOSTAJE nietknięta — czytają ją cztery ścieżki „Powrót do bazy",
//      gdzie filtr własności jest poprawny.
//   2. BRAK CELU NIE ZABIJA (D-FDe). Dawniej `!dest` robiło `_turnIntoWreck`. Ta gałąź była
//      praktycznie martwa (selektor przeszukiwał całą galaktykę, więc zawsze coś znajdował), ale po
//      dodaniu terminu układu stałaby się TYPOWA — AI atakuje z definicji w cudzym układzie.
//      ⚠ I zabijałaby TAKŻE flotę GRACZA: `DeepSpaceCombatSystem:1236` woła `_issueRetreatOrder`
//      WPROST, omijając bramkę `empireId === 'player'` niżej.
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
// ⚠ `GAME_CONFIG` przestał tu być potrzebny wraz z usunięciem retry „low fuel"
// (`m4FuelAwareRetreat`) — bypass paliwa jest teraz bezwarunkowy w `resolveShelterOrderSpec`.

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
    // M4 P3 polish 2026-05-18: player retreat jest manualny — gracz albo wydał
    // explicit retreat order (już dostał moveToPoint), albo poszedł moveToPoint
    // sam. Nie nadpisujemy jego decyzji.
    // ⚠ TO NIE JEST BRAMKA SYMETRII i nie należy jej tak czytać. Gracz DOSTAJE auto-odwrót —
    //   tyle że drugimi drzwiami: `DeepSpaceCombatSystem._resolvePlayerMissionsPostBattle:1236`
    //   woła `_issueRetreatOrder` WPROST, z pominięciem tego `return`, gdy flota gracza spadnie
    //   ≤ RETREAT_THRESHOLD HP. Symetria mieszka w SELEKTORZE i w drabinie `!dest`, nie tutaj.
    if (side.empireId === 'player') return;
    const vesselIds = Array.isArray(side.vesselIds) ? side.vesselIds : [];
    if (vesselIds.length === 0) return;

    // Punkt starcia — od niego liczy się bąbel clearance (D-FDc). Bez niego statek „uciekłby"
    // na orbitę ciała, o które właśnie walczył: zostaje w zasięgu broni i wpada w ponowne zwarcie.
    const battlePoint = result.location?.point ?? null;

    for (const vId of vesselIds) {
      const v = this._vm?.getVessel?.(vId) ?? this._vm?._vessels?.get?.(vId);
      if (!v || v.isWreck) continue;
      this._issueRetreatOrder(v, battleId, battlePoint);
    }
  }

  // ── Retreat order ────────────────────────────────────────────────────

  /**
   * @param {object} vessel
   * @param {string} battleId
   * @param {{x:number,y:number}|null} [battlePoint] — punkt starcia; gdy brak (ścieżka
   *   `DeepSpaceCombatSystem:1236`), bąbel liczymy od bieżącej pozycji statku. Po
   *   `_freezeAsStationary` statek stoi praktycznie w midpoincie, więc to bliskie przybliżenie
   *   — i tak nazwane wprost, żeby nikt nie czytał go jako dokładności.
   */
  _issueRetreatOrder(vessel, battleId, battlePoint = null) {
    if (!this._mos?.issueOrder) return null;

    const avoidPoint = battlePoint ?? { x: vessel.position.x, y: vessel.position.y };
    const plan = this._mos.resolveShelterOrderSpec?.(vessel, {
      avoidPoint, issuedBy: 'auto_retreat',
    });

    if (!plan?.ok) {
      // ⚠ D-FDe — BRAK CELU NIE ZABIJA. Tu stał `_turnIntoWreck` (+ inline fallback); statek
      // ginął za GEOMETRIĘ układu, a nie za przegraną bitwę. Zostaje sama odmowa Z POWODEM:
      // kadłub żyje, gracz może wydać rozkaz ręcznie, a jeśli ma zginąć — zginie normalną drogą
      // (kill po HP=0 albo side-level wrak przy time-oucie DSCS).
      EventBus.emit('vessel:autoRetreatFailed', {
        vesselId: vessel.id, battleId, reason: plan?.reason ?? 'no_shelter_in_system',
      });
      return null;
    }

    const res = this._mos.issueOrder(vessel.id, plan.spec);
    if (!res?.ok) {
      // Rozkaz odrzucony NIŻEJ (np. `unreachable_target`). NIE wrecking — patrz wyżej.
      // ⚠ Retry „low fuel" USUNIĘTY jako martwy: `resolveShelterOrderSpec` daje `bypassFuelCheck`
      //   BEZWARUNKOWO (D-FDg), więc `insufficient_fuel` nie może już stąd wyjść.
      EventBus.emit('vessel:autoRetreatFailed', {
        vesselId: vessel.id, battleId, reason: res?.reason ?? 'order_rejected',
      });
      return null;
    }

    // Marker — czyta go `DeepSpaceCombatSystem._allOutsideOf` (D-FDd) oraz UI.
    this._mos.markAsRetreat?.(vessel, battleId);

    // Paliwo pobierane jest przy WYDANIU rozkazu (`MovementOrderSystem:765-767`), także pod
    // bypassem — więc pusty bak po odwrocie jest normalnym, oczekiwanym stanem. Marker zostaje,
    // bo to on karmi ostrzeżenie w panelu floty.
    if ((vessel.fuel?.current ?? 1) <= 0) {
      vessel.lowFuelDrift = {
        sinceYear:      this._year(),
        destPlanetId:   plan.spec.targetBodyId ?? null,
        originBattleId: battleId,
      };
      if (vessel.movementOrder) vessel.movementOrder.lowFuelDrift = true;
      EventBus.emit('vessel:autoRetreatLowFuel', {
        vesselId:            vessel.id,
        battleId,
        destinationPlanetId: plan.spec.targetBodyId ?? null,
        orderId:             res.orderId,
      });
    }

    EventBus.emit('vessel:autoRetreatIssued', {
      vesselId:            vessel.id,
      battleId,
      destinationPlanetId: plan.spec.targetBodyId ?? null,
      destinationName:     plan.targetName ?? null,
      tier:                plan.tier ?? null,
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
