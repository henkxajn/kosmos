// MovementOrderSystem — centralny resolver rozkazów ruchu militarnego.
//
// Rozkaz (MovementOrder) to warstwa nad standardową misją (transport/recon/...),
// sterująca pozycją statku w kontekście wojskowym: moveToPoint / pursue / intercept /
// patrol / escort. Patrz docs/design/milestone-1-targeting-foundation.md §8.
//
// Kolejność w VesselManager._tick (§5.1):
//   _tickRefueling → _tickRepair → _tickFullScans → _tickEndurance
//   → MovementOrderSystem._tick   ← TU (modyfikuje vessel.mission)
//   → _updatePositions            ← interpoluje z zaktualizowanej mission
//   → _tickWreckCleanup
//
// M1 Commit 4 — scaffold + moveToPoint. Commit 5 dopisuje pursue/intercept.

import EventBus              from '../core/EventBus.js';
import EntityManager         from '../core/EntityManager.js';
import { ORDER_TYPES, validateOrder } from '../data/MovementOrderTypes.js';
import { GAME_CONFIG }       from '../config/GameConfig.js';
import { addMissionLog }     from '../entities/Vessel.js';
import { PredictionConeMath } from '../utils/PredictionConeMath.js';
import { DistanceUtils }     from '../utils/DistanceUtils.js';
import { SHIP_MODULES }      from '../data/ShipModulesData.js';
import { canLaunchFromCurrent } from '../utils/SpaceportCheck.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;
const CIV_TIME_SCALE = GAME_CONFIG.CIV_TIME_SCALE ?? 12;

// Strefa wykluczenia wokół Słońca (punkty wewnątrz = unreachable).
// Spójne z VesselManager._calcRoute — zob. §8.5.
const SUN_EXCLUSION_PX = 0.3 * AU_TO_PX;

// M4 P1 — drift auto-return timer. Po complete pursue/intercept na vessel target
// (deep-space drift state, M1 BUG#4), vessel czeka N game-years na nowy rozkaz
// gracza, potem sam wraca do najbliższej friendly planety. Wartość w PHYSICS YEARS
// (gameYear units), nie civYears.
const DRIFT_AUTO_RETURN_GAME_YEARS = 5;

// Próg zakończenia pursue/intercept — dystans "dotarcia" do celu (§5.2).
// BUG#1 z playtestu: 0.05 AU (5.5 px) było zbyt permisywne — dwa vessele orbitujące
// bliskie ciała miały często <5.5 px initial distance → insta-complete w pierwszym ticku.
// Nowa wartość: 0.15 AU (16.5 px) ≈ 2× szerokość sprite vessela na mapie — sensowny
// próg "dotarcia" i zostawia miejsce na widoczny ruch przy krótkich pursuach.
const THREAT_RADIUS_AU = 0.15;
const THREAT_RADIUS_PX = THREAT_RADIUS_AU * AU_TO_PX;

// Epsilon dla intercept math — detekcja degenerate cases.
const INTERCEPT_EPS = 1e-6;

// Dev trace helper — gated przez window.KOSMOS.debug.enableTargetingTrace.
// Design doc §11.3 obiecał tę flagę; BUG#3 z playtestu — nie była zaimplementowana.
// Log format: '[MOS] ...' dla łatwego grepu w konsoli.
function _trace(...args) {
  if (window.KOSMOS?.debug?.enableTargetingTrace) console.log('[MOS]', ...args);
}

let _nextOrderId = 1;

export class MovementOrderSystem {
  /**
   * @param {VesselManager} vesselManager — do pozyskania instancji statków i _calcRoute.
   */
  constructor(vesselManager) {
    if (!vesselManager) throw new Error('[MovementOrderSystem] vesselManager wymagany');
    this._vm = vesselManager;

    // Active orders indeksowane po vesselId (max jeden per vessel — §2.3).
    /** @type {Map<string, object>} */
    this._byVessel = new Map();

    // M4 P1 — drift vessele które ukończyły pursue/intercept na vessel target i
    // czekają DRIFT_AUTO_RETURN_GAME_YEARS na nowy order. Po timeout: auto-issue
    // moveToPoint do nearest friendly planet. Set vesselId — sprawdzanie istnienia
    // markera w _tick + cleanup w issueOrder/onWrecked.
    /** @type {Set<string>} */
    this._driftingVessels = new Set();

    // Cache gameYear poprzedniego ticku — do obliczania dPhysicsYear.
    // VesselManager._tick dostaje civDeltaYears, ale ruch pursue/intercept operuje
    // w skali physics (spójnie z vessel.speedAU = AU/gameYear). Diff gameYear
    // pomiędzy tickami daje nam physicsDy bez znajomości dwóch timescales.
    this._lastTickYear = null;

    // Subskrypcje — pętla tick przychodzi synchronicznie z VesselManager._tick.
    this._onArrived     = ({ vessel, mission }) => this._onVesselArrived(vessel, mission);
    this._onWrecked     = ({ vessel }) => this._onVesselWrecked(vessel);
    EventBus.on('vessel:arrived',  this._onArrived);
    EventBus.on('vessel:wrecked',  this._onWrecked);

    // M2b C5 — cancel-dangling-orders gdy POI usunięty (proactive defensive,
    // §9.2). W M1/M2a wszystkie ordery mają poiId=null → handler iteruje pustą listę.
    // C6 (goToPOI/patrol) zacznie ustawiać order.poiId — handler już gotowy.
    this._onPOIDeleted  = ({ poiId }) => this._onPOIDeletedHandler(poiId);
    EventBus.on('poi:deleted', this._onPOIDeleted);

    // Rebuild index po restore savu — vessels w VesselManager mogą mieć movementOrder
    // zserializowany, ale my nie wiemy o nich dopóki nie zostaną zarejestrowane w _byVessel.
    // GameScene.onLoadComplete() lub konstruktor ładują istniejące order z vesseli.
    this._indexExistingOrders();
  }

  /**
   * Po load — skanuj vessele w VesselManager i zbuduj indeks aktywnych orderów.
   * Graceful degradation: cancel orderów z missing target (§2.3).
   */
  _indexExistingOrders() {
    const vessels = this._vm.getAllVessels?.() ?? [];
    for (const v of vessels) {
      // M4 P1 — restore drift state (vessel.driftIdle serialized w save).
      if (v.driftIdle && !v.isWreck && GAME_CONFIG.FEATURES?.m4DriftFix) {
        this._driftingVessels.add(v.id);
      }

      const mo = v.movementOrder;
      if (!mo || mo.status !== 'active') continue;
      if (this._isTargetMissing(mo)) {
        console.warn(`[MovementOrderSystem] cancel order ${mo.id} dla ${v.id}: target_lost_on_load`);
        mo.status = 'cancelled';
        mo.blockReason = 'target_lost_on_load';
        EventBus.emit('vessel:orderCancelled', {
          vesselId: v.id, orderId: mo.id, reason: 'target_lost_on_load',
        });
        continue;
      }
      this._byVessel.set(v.id, mo);
    }
  }

  /**
   * Suspend oryginalnej mission gdy vessel wykonuje inny order (§8.3).
   *   - Deep-copy mission do vessel._suspendedMission (marker istnienia = flag "mission paused").
   *   - suspendedDuringReturn = (mission.phase === 'returning') — przy resume target = originId.
   *   - move_to_point mission NIE suspendujemy (to synth stworzone przez nas — nic do zachowania).
   *   - Już suspended → no-op.
   * @returns {boolean} true gdy coś suspendowaliśmy (używane do UI log).
   */
  _suspendMissionIfAny(vessel) {
    const m = vessel.mission;
    if (!m) return false;
    if (m.type === 'move_to_point') return false;
    if (vessel._suspendedMission) return false;  // już jest w zawieszeniu

    const snapshot = { ...m };
    if (m.waypoints)        snapshot.waypoints        = m.waypoints.map(w => ({ ...w }));
    if (m.returnWaypoints)  snapshot.returnWaypoints  = m.returnWaypoints.map(w => ({ ...w }));
    snapshot.suspendedDuringReturn = (m.phase === 'returning');

    vessel._suspendedMission = snapshot;
    return true;
  }

  _isTargetMissing(order) {
    const t = order.type;
    if (t === ORDER_TYPES.pursue || t === ORDER_TYPES.intercept || t === ORDER_TYPES.escort) {
      if (!order.targetEntityId) return true;
      const entity = EntityManager.get(order.targetEntityId) ?? this._vm.getVessel?.(order.targetEntityId);
      return !entity;
    }
    // moveToPoint / patrol — target to punkt w przestrzeni; nie znika.
    return false;
  }

  /**
   * Główne API: wydaj rozkaz statkowi.
   * @param {string} vesselId
   * @param {object} spec — { type, targetEntityId?, targetPoint?, patrolRoute?, issuedBy?,
   *                          // Player Fleet Groups (P2):
   *                          _arrivalSyncYear?, _speedCapAU?, preferMaxRange? }
   * @param {object} [opts] — { fromFleet?: string } — informacyjny tag floty
   *   (propagowany do order._fromFleet + vessel:orderIssued event payload).
   * @returns {{ ok: boolean, reason?: string, orderId?: string }}
   */
  issueOrder(vesselId, spec, opts = {}) {
    const vessel = this._vm.getVessel?.(vesselId);
    if (!vessel) return { ok: false, reason: 'vessel_not_found' };
    if (vessel.isWreck) return { ok: false, reason: 'vessel_is_wreck' };

    const val = validateOrder(spec);
    if (!val.valid) return { ok: false, reason: val.reason };

    // S3.5a-1 — statek immobilized (>=2 lata nieopłaconego utrzymania) nie przyjmuje
    // nowych rozkazów. Powrót do bazy idzie przez VesselManager.startReturn (poza issueOrder),
    // więc pozostaje dozwolony. Bramka PRZED mutacją stanu (drift marker, mission suspend).
    if (this._vm.isImmobilized?.(vessel))
      return { ok: false, reason: 'vessel_immobilized' };

    // Propaguj opts.fromFleet do spec (forwarded do order factory).
    if (opts.fromFleet) spec._fromFleet = opts.fromFleet;

    // M4 P1 — gracz wydaje nowy order → vessel wychodzi z drift state, marker usuwany.
    this._clearDriftMarker(vessel);

    // M1: pełna implementacja moveToPoint, pursue/intercept (Commit 5).
    // M2b C6: goToPOI (delegat do moveToPoint) + patrol (runtime).
    // M2b C7: escort runtime — zostaje stub w C6.
    if (spec.type === ORDER_TYPES.moveToPoint) {
      return this._issueMoveToPoint(vessel, spec);
    }
    if (spec.type === ORDER_TYPES.pursue || spec.type === ORDER_TYPES.intercept) {
      return this._issuePursueOrIntercept(vessel, spec);
    }
    if (spec.type === ORDER_TYPES.goToPOI) {
      return this._issueGoToPOI(vessel, spec);
    }
    if (spec.type === ORDER_TYPES.patrol) {
      return this._issuePatrol(vessel, spec);
    }
    if (spec.type === ORDER_TYPES.escort) {
      return this._issueEscort(vessel, spec);
    }
    if (spec.type === ORDER_TYPES.engage) {
      return this._issueEngage(vessel, spec);
    }
    if (spec.type === ORDER_TYPES.retreat) {
      return this._issueRetreat(vessel, spec);
    }

    return { ok: false, reason: 'unhandled_type' };
  }

  /**
   * M4 P3 polish — manualne wycofanie z bitwy. Auto-wybór najbliższej friendly
   * planety przez reuse AutoRetreatSystem._findNearestFriendlyPlanet. Wydaje
   * moveToPoint z markerem `_retreatFromCombat=true` żeby UI mogło rozróżnić
   * retreat od zwykłego ruchu.
   *
   * Reject:
   *   - not_in_combat (vessel nie jest w aktywnym DSCS encounter)
   *   - no_friendly_planet (brak kolonii/outpostu w zasięgu)
   *
   * Po wydaniu rozkazu vessel kieruje się do friendly planety; gdy wyjdzie
   * z combat range (>0.50 AU od midpoint), DSCS._handleCombatRangeExit
   * zidentyfikuje sideA jako uciekającego → finalize retreated='A', winner='B'
   * (LOSS dla gracza).
   *
   * @private
   */
  _issueRetreat(vessel, _spec) {
    const dscs = window.KOSMOS?.deepSpaceCombatSystem;
    const inCombat = dscs?._findActiveEncounterContaining?.(vessel.id);
    if (!inCombat) return { ok: false, reason: 'not_in_combat' };

    const target = window.KOSMOS?.autoRetreatSystem?._findNearestFriendlyPlanet?.(vessel);
    if (!target) return { ok: false, reason: 'no_friendly_planet' };

    // _findNearestFriendlyPlanet zwraca { colony, planet, distanceAU } — czytamy z .planet
    // (AutoRetreatSystem._issueRetreatOrder line 99 robi to samo: dest.planet.x/y).
    const planet = target.planet ?? target;
    const targetX = planet.x ?? planet.position?.x ?? 0;
    const targetY = planet.y ?? planet.position?.y ?? 0;
    const targetName = planet.name ?? target.colony?.name ?? '?';

    const result = this._issueMoveToPoint(vessel, {
      type: 'moveToPoint',
      targetPoint: { x: targetX, y: targetY },
      issuedBy: 'manual_retreat',
    });
    if (result.ok && vessel.movementOrder) {
      vessel.movementOrder._retreatFromCombat = true;
      EventBus.emit('vessel:retreatIssued', {
        vesselId:   vessel.id,
        targetPoint: { x: targetX, y: targetY },
        targetName,
      });
    }
    return result;
  }

  /**
   * M2b C7 — `escort`: vessel trzyma się obok escortee (innego vessela), chase'ując
   * go gdy distance > ESCORT_DISTANCE_PX. Escortee wreck/missing → `vessel:escortLost`
   * + block.
   *
   * Filip's decision: ESCORT_DISTANCE_PX = 0.1 AU (~11 px) — wizualna formacja
   * "dwa vessele lecące razem" bez "siedzenia na targecie". Spec §10.3 sugerował
   * 0.15 AU (= THREAT_RADIUS_PX), ale 0.1 AU daje czytelniejszą formację.
   *
   * Walidacje:
   *   - feature_disabled (poiSystem flag OFF — M2b gate dla nowych orderów)
   *   - escortee_not_found (resolveTarget zwrócił null)
   *   - escortee_is_wreck (escortee.isWreck=true)
   *   - escortee_self (escortee === vessel)
   *   - escortee_not_vessel (escortee jest planetą/moonem, nie vesselem)
   */
  _issueEscort(vessel, spec) {
    if (!GAME_CONFIG.FEATURES?.poiSystem) {
      return { ok: false, reason: 'feature_disabled' };
    }

    const escortee = this._resolveTarget(spec.targetEntityId);
    if (!escortee)            return { ok: false, reason: 'escortee_not_found' };
    if (escortee.isWreck)     return { ok: false, reason: 'escortee_is_wreck' };
    if (escortee === vessel)  return { ok: false, reason: 'escortee_self' };

    // Tylko vessele jako escortees — planety/moons mają stałe orbity, escort
    // dla planety byłby identyczny z `goToPOI(rally|center)` lub `moveToPoint`.
    const isVessel = !!this._vm.getVessel?.(spec.targetEntityId);
    if (!isVessel) return { ok: false, reason: 'escortee_not_vessel' };

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const orderId = `mo_${_nextOrderId++}`;
    const order = {
      id:             orderId,
      type:           ORDER_TYPES.escort,
      issuedYear:     gameYear,
      issuedBy:       spec.issuedBy ?? 'player',
      targetEntityId: spec.targetEntityId,
      targetPoint:    null,
      patrolRoute:    null,
      lastTargetPos:  null,
      interceptPoint: null,
      status:         'active',
      completedYear:  null,
      blockReason:    null,
      poiId:               null,
      predictionCone:      null,
      patrolWaypointIndex: 0,
      patrolDirection:     1,
      escorteeId:          spec.targetEntityId,
      retreatFromBattleId: null,
    };

    // Suspend oryginalnej mission (jeśli aktywna). Escort sterowany pozycyjnie
    // przez _tickEscortOrder — stara mission nie ma wpływu na ruch, ale resume
    // po orderCompleted/Cancelled przywróci ją.
    this._suspendMissionIfAny(vessel);

    // Implicit launch z dock/orbit (analogicznie do pursue/intercept/patrol).
    if (vessel.position.state === 'docked' || vessel.position.state === 'orbiting') {
      vessel.position.state    = 'in_transit';
      vessel.position.dockedAt = null;
      vessel.status            = 'on_mission';
      EventBus.emit('vessel:launched', { vessel, mission: vessel.mission ?? null });
    }

    vessel.movementOrder = order;
    this._byVessel.set(vessel.id, order);

    addMissionLog(vessel, gameYear,
      `Escort: ${escortee.name ?? escortee.id ?? '???'}`,
      'info');

    _trace(`issue escort ${orderId} vessel=${vessel.id} → escortee=${spec.targetEntityId}`);
    EventBus.emit('vessel:orderIssued',    { vesselId: vessel.id, order });
    EventBus.emit('vessel:escortStarted', {
      vesselId:   vessel.id,
      orderId,
      escorteeId: spec.targetEntityId,
    });
    return { ok: true, orderId };
  }

  /**
   * Per-tick escort: chase escortee gdy distance > ESCORT_DISTANCE_PX. Cel ruchu
   * = half-distance (escortee position − halfDist w kierunku do vessela), żeby
   * nie oscylować na granicy threshold'a. Escortee.isWreck/missing → emit
   * `vessel:escortLost` + `_blockAndCancel('escortee_lost')`.
   *
   * Movement physics analogiczna do `_tickPatrolOrder` — ten sam template
   * speedPxPerYear × dPhysicsYear, velocity update w skali civYear.
   */
  _tickEscortOrder(vessel, order, dPhysicsYear, gameYear) {
    const escortee = this._resolveTarget(order.escorteeId);
    if (!escortee || escortee.isWreck) {
      EventBus.emit('vessel:escortLost', {
        vesselId: vessel.id,
        orderId:  order.id,
        reason:   'escortee_lost',
      });
      this._blockAndCancel(vessel, order, 'escortee_lost');
      return;
    }

    const tx = escortee.x ?? escortee.position?.x ?? 0;
    const ty = escortee.y ?? escortee.position?.y ?? 0;

    // Filip's decision: 0.1 AU (~11 px) — czytelna formacja bez "siedzenia
    // na targecie". Spec §10.3 sugerował 0.15 AU (THREAT_RADIUS_PX), ale playtest
    // M3 może fine-tune'ować jeśli pojawi się feedback "za blisko/daleko".
    const ESCORT_DISTANCE_PX = 0.1 * AU_TO_PX;

    const dx = tx - vessel.position.x;
    const dy = ty - vessel.position.y;
    const distPx = Math.hypot(dx, dy);

    if (distPx <= ESCORT_DISTANCE_PX) return;  // wystarczająco blisko, stój

    // Cel ruchu: half-distance (zostań w okolicy ESCORT_DISTANCE_PX*0.5 od escortee).
    // Math.max(0, ...) guard — chroni przed ujemnym stepPx gdy distPx < halfDist
    // (np. escortee się szybko zbliżył w międzyczasie). Bez tego vessel cofałby się.
    const halfDist = ESCORT_DISTANCE_PX * 0.5;
    const speedPxPerYear = (vessel.speedAU ?? 1.0) * AU_TO_PX;
    const stepPx = Math.max(0, Math.min(
      distPx - halfDist,
      speedPxPerYear * Math.max(0, dPhysicsYear),
    ));

    if (stepPx > 0 && distPx > 0) {
      const ux = dx / distPx;
      const uy = dy / distPx;
      vessel.position.x += ux * stepPx;
      vessel.position.y += uy * stepPx;

      // Velocity update — analogicznie do patrol/pursue.
      if (vessel.velocity) {
        const speedCiv = (vessel.speedAU ?? 1.0) / CIV_TIME_SCALE;
        vessel.velocity.vx = ux * speedCiv;
        vessel.velocity.vy = uy * speedCiv;
        vessel.velocity.updatedYear = gameYear;
      }
    }
  }

  /**
   * moveToPoint — reużywa _calcRoute (unikanie Słońca + planet) do syntezy mission.
   */
  _issueMoveToPoint(vessel, spec) {
    const p = spec.targetPoint;

    // §8.5 — reject gdy punkt wewnątrz strefy wykluczenia Słońca (nie do obejścia).
    if (Math.hypot(p.x, p.y) < SUN_EXCLUSION_PX) {
      return { ok: false, reason: 'unreachable_target' };
    }

    // Spaceport gate — medium/large hull NIE może startować z ciała bez portu.
    // Mały hull (small) startuje z każdego ciała. Vessel w in_transit/orbiting
    // pomija check (już w przestrzeni). Bypass: spec.bypassSpaceportCheck=true
    // (rezerwa dla emergency retreat / auto-rescue).
    if (!spec.bypassSpaceportCheck) {
      const portCheck = canLaunchFromCurrent(vessel);
      if (!portCheck.ok) {
        return { ok: false, reason: portCheck.reason ?? 'no_spaceport_at_origin' };
      }
    }

    const sx = vessel.position.x;
    const sy = vessel.position.y;
    const tx = p.x;
    const ty = p.y;

    const sysId = vessel.systemId ?? 'sys_home';
    const route = this._vm._calcRoute(sx, sy, tx, ty, sysId);
    const totalDistPx = route.totalDist;
    const totalDistAU = totalDistPx / AU_TO_PX;

    // Paliwo — prosta gatekeeping. Reforma fuel/endurance w M4 P4.
    // M4 P1: spec.bypassFuelCheck=true → wydaj order mimo niedoboru (AutoRetreat
    // low_fuel_drift fallback). Vessel doleci na cel — fuel.current zostaje co jest
    // (clamped do 0), reforma w P4 nada temu real consequences (degradacja velocity).
    const fuelNeeded = totalDistAU * (vessel.fuel?.consumption ?? 0);
    if (vessel.fuel && vessel.fuel.current < fuelNeeded && !spec.bypassFuelCheck) {
      return { ok: false, reason: 'insufficient_fuel' };
    }

    const speedAU = vessel.speedAU ?? 1.0;
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const travelYears = totalDistAU / Math.max(0.01, speedAU);

    // Player Fleet Groups (P2): Sync ETA dla moveToPoint.
    //   Jeśli spec._arrivalSyncYear ustawione (przez FleetSystem.issueFleetOrder
    //   z fleet_eta = max(native_eta_i)), override naturalnego arrivalYear, by
    //   wszyscy członkowie floty dolecieli w tej samej chwili. Sanity: nie pozwól
    //   na arrivalYear EARLIER niż natural (max() — vessel nie może lecieć szybciej
    //   niż swoja v_max). Jeśli sync_year < natural → użyj natural (vessel jest
    //   tym najwolniejszym, nie ma czego dopasować).
    const naturalArrival = gameYear + travelYears;
    const arrivalYear = (typeof spec._arrivalSyncYear === 'number')
      ? Math.max(spec._arrivalSyncYear, naturalArrival)
      : naturalArrival;

    const orderId = `mo_${_nextOrderId++}`;
    const order = {
      id:             orderId,
      type:           ORDER_TYPES.moveToPoint,
      issuedYear:     gameYear,
      issuedBy:       spec.issuedBy ?? 'player',
      targetEntityId: null,
      targetPoint:    { x: tx, y: ty },
      patrolRoute:    null,
      lastTargetPos:  null,
      interceptPoint: null,
      status:         'active',
      completedYear:  null,
      blockReason:    null,
      // M2b Commit 1 — defaults spójne z _migrateV66toV67 (Commits 3/6/7 użyją)
      poiId:               null,
      predictionCone:      null,
      patrolWaypointIndex: 0,
      patrolDirection:     1,
      escorteeId:          null,
      // Player Fleet Groups (P2) — propaguj z spec do order (do tick + UI).
      _fromFleet:          spec._fromFleet ?? null,
      _arrivalSyncYear:    (typeof spec._arrivalSyncYear === 'number') ? spec._arrivalSyncYear : null,
      _speedCapAU:         (typeof spec._speedCapAU === 'number') ? spec._speedCapAU : null,
      preferMaxRange:      !!spec.preferMaxRange,
    };

    // Konstrukcja mission — specjalny typ 'move_to_point', bez targetId.
    // _updatePositions interpoluje przez startX/Y → targetX/Y + waypoints;
    // detekcja przylotu snap'uje do targetX/Y gdy gameYear ≥ arrivalYear.
    const mission = {
      type:       'move_to_point',
      targetId:   null,
      targetName: null,
      startX: sx, startY: sy,
      targetX: tx, targetY: ty,
      waypoints:  route.waypoints,
      departYear: gameYear,
      arrivalYear,                            // override przez _arrivalSyncYear (P2)
      originId:   vessel.position.dockedAt ?? vessel.colonyId,
      fuelCost:   fuelNeeded,
    };

    // Zużyj paliwo (jeden kierunek — brak powrotu w moveToPoint).
    if (vessel.fuel && fuelNeeded > 0) {
      vessel.fuel.current = Math.max(0, vessel.fuel.current - fuelNeeded);
    }

    // Suspend oryginalnej mission (jeśli aktywna) — resume po orderCompleted/cancelled.
    this._suspendMissionIfAny(vessel);

    vessel.mission           = mission;
    vessel.movementOrder     = order;
    vessel.status            = 'on_mission';
    vessel.position.state    = 'in_transit';
    vessel.position.dockedAt = null;

    this._byVessel.set(vessel.id, order);

    addMissionLog(vessel, gameYear,
      `MoveTo (${tx.toFixed(0)}, ${ty.toFixed(0)}) — ${totalDistAU.toFixed(2)} AU`,
      'info');

    _trace(`issue moveToPoint ${orderId} vessel=${vessel.id} → (${tx.toFixed(1)},${ty.toFixed(1)}) dist=${totalDistAU.toFixed(2)}AU fuel=${fuelNeeded.toFixed(2)} arrivalYear=${mission.arrivalYear.toFixed(3)}`);
    EventBus.emit('vessel:launched',    { vessel, mission });
    EventBus.emit('vessel:orderIssued', { vesselId: vessel.id, order });

    return { ok: true, orderId };
  }

  /**
   * Pursue/Intercept — ściganie ruchomego targetu.
   *
   * Pursue: kieruj na aktualną pozycję targetu co tick.
   * Intercept: kieruj na przewidywany punkt spotkania (linear extrapolation target.velocity).
   *
   * Po issueOrder MOS przejmuje sterowanie pozycją (VesselManager._updatePositions
   * pomija interpolację dla order-controlled vessel).
   */
  _issuePursueOrIntercept(vessel, spec) {
    const target = this._resolveTarget(spec.targetEntityId);
    if (!target) return { ok: false, reason: 'target_not_found' };
    if (target.isWreck) return { ok: false, reason: 'target_is_wreck' };
    if (target === vessel) return { ok: false, reason: 'target_self' };

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const orderId = `mo_${_nextOrderId++}`;
    // BUG#2 fix: vessel targets nie mają .x/.y na rootu (tylko .position.x/.y).
    // Fallback pattern spójny z _tickPursueOrder — inaczej init daje {undefined, undefined}
    // aż do pierwszego ticka (widoczne przy inspection gry w pauzie).
    const initTx = target.x ?? target.position?.x ?? 0;
    const initTy = target.y ?? target.position?.y ?? 0;

    // BUG#1 fix: issue-time reject gdy target już w zasięgu zakończenia.
    //   Bez tego vessel insta-complete'uje pursue w pierwszym ticku gdy initial
    //   distance < THREAT_RADIUS_PX (wykryte w playtescie z 2 vesselami orbitującymi
    //   bliskie ciała). Semantyczny komunikat dla UX: "target już w zasięgu".
    const initDist = Math.hypot(initTx - vessel.position.x, initTy - vessel.position.y);
    if (initDist < THREAT_RADIUS_PX) {
      return { ok: false, reason: 'target_already_in_range' };
    }
    const order = {
      id:             orderId,
      type:           spec.type,
      issuedYear:     gameYear,
      issuedBy:       spec.issuedBy ?? 'player',
      targetEntityId: spec.targetEntityId,
      targetPoint:    null,
      patrolRoute:    null,
      lastTargetPos:  { x: initTx, y: initTy },
      interceptPoint: null,
      status:         'active',
      completedYear:  null,
      blockReason:    null,
      // M2b Commit 1 — defaults spójne z _migrateV66toV67 (Commits 3/6/7 użyją)
      poiId:               null,
      predictionCone:      null,
      patrolWaypointIndex: 0,
      patrolDirection:     1,
      escorteeId:          null,
      // Player Fleet Groups (P2) — speed cap dla synchronizacji z najwolniejszym
      // członkiem floty (target się rusza → arrival-time sync zawodzi, używamy
      // stałego clampu). preferMaxRange dla doktryny kite (P3).
      _fromFleet:      spec._fromFleet ?? null,
      _speedCapAU:     (typeof spec._speedCapAU === 'number') ? spec._speedCapAU : null,
      preferMaxRange:  !!spec.preferMaxRange,
    };

    // Suspend oryginalnej mission (jeśli aktywna). MOS rządzi pozycją bezpośrednio
    // dla pursue/intercept, więc stara mission nie ma wpływu na ruch — ale resume
    // po orderCompleted przywróci ją (może z recompute route od aktualnej pozycji).
    this._suspendMissionIfAny(vessel);

    // Jeśli vessel docked LUB orbiting (z lub bez dockedAt) — implicit launch.
    // Post-playtest M2a fix: poprzednio guard tylko na 'docked' powodował, że pursue
    // wydany vesselowi w 'orbiting' (zwykły post-mission state) nie zwalniał go z
    // ciała macierzystego — MOS pisał position.x/y, ale ThreeRenderer renderował go
    // wokół dockedAt (orbital interpolation). Spójne z _issueMoveToPoint, które
    // robi to bezwarunkowo (linie 236-238).
    if (vessel.position.state === 'docked' || vessel.position.state === 'orbiting') {
      vessel.position.state = 'in_transit';
      vessel.position.dockedAt = null;
      vessel.status = 'on_mission';
      EventBus.emit('vessel:launched', { vessel, mission: vessel.mission ?? null });
    }

    vessel.movementOrder = order;
    this._byVessel.set(vessel.id, order);

    addMissionLog(vessel, gameYear,
      `${spec.type === 'intercept' ? 'Intercept' : 'Pursue'}: ${target.name ?? target.id ?? '???'}`,
      'info');

    _trace(`issue ${spec.type} ${orderId} vessel=${vessel.id} → target=${spec.targetEntityId} pos=(${initTx.toFixed(1)},${initTy.toFixed(1)})`);
    EventBus.emit('vessel:orderIssued', { vesselId: vessel.id, order });
    return { ok: true, orderId };
  }

  /**
   * Target resolution: najpierw VesselManager (vessels), potem EntityManager
   * (planety/księżyce/planetoidy). Zwraca encję lub null.
   */
  _resolveTarget(entityId) {
    if (!entityId) return null;
    const v = this._vm.getVessel?.(entityId);
    if (v) return v;
    return EntityManager.get(entityId) ?? null;
  }

  // ── M4 P3 C5 — Engage order (tactical kiting) ─────────────────────────

  /**
   * Engage — player tactical kiting na enemy vessel.
   *
   * Vessel utrzymuje optimal distance = maxWeaponRangeAU × 0.95:
   *   - dist > optimal × 1.05 → move toward target (zbliż się)
   *   - dist < optimal × 0.95 → move away from target (cofnij)
   *   - else hold (sweet spot — strzelaj)
   *
   * Cancel auto:
   *   - target wreck → 'target_lost'
   *   - currentDist > 2 × maxWeaponRangeAU → 'target_out_of_range'
   *
   * Vessel jest stationary z punktu widzenia mission interpolation
   * (state='orbiting', dockedAt=null). MOS bezpośrednio mutuje vessel.position
   * (jak pursue/intercept).
   *
   * @private
   */
  _issueEngage(vessel, spec) {
    const target = this._resolveTarget(spec.targetEntityId);
    if (!target) return { ok: false, reason: 'target_not_found' };
    if (target.isWreck) return { ok: false, reason: 'target_is_wreck' };
    if (target === vessel) return { ok: false, reason: 'target_self' };
    // Target musi być vesselem (engage nie ma sensu na planecie/moonie).
    if (!this._vm.getVessel?.(spec.targetEntityId)) {
      return { ok: false, reason: 'target_not_vessel' };
    }

    // Sprawdź czy vessel ma broń — bez broni engage nie ma sensu.
    const maxRangeAU = _computeMaxWeaponRangeAU(vessel);
    if (maxRangeAU <= 0) return { ok: false, reason: 'no_weapons' };

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const orderId = `mo_${_nextOrderId++}`;
    const tx = target.position?.x ?? 0;
    const ty = target.position?.y ?? 0;

    const order = {
      id:             orderId,
      type:           ORDER_TYPES.engage,
      issuedYear:     gameYear,
      issuedBy:       spec.issuedBy ?? 'player',
      targetEntityId: spec.targetEntityId,
      targetPoint:    null,
      patrolRoute:    null,
      lastTargetPos:  { x: tx, y: ty },
      interceptPoint: null,
      status:         'active',
      completedYear:  null,
      blockReason:    null,
      poiId:               null,
      predictionCone:      null,
      patrolWaypointIndex: 0,
      patrolDirection:     1,
      escorteeId:          null,
      // M4 P3 — engage cache (rebuilt per-tick z aktualnych modules + tech).
      engageMaxRangeAU:    maxRangeAU,
      engageTargetId:      spec.targetEntityId,  // shorthand dla DSCS._pickTarget
      // Player Fleet Groups (P2) — speed cap dla synchronizacji + preferMaxRange
      // (kite doktryna, P3) zwiększa optimal threshold z 0.95 do 0.98 max range.
      _fromFleet:      spec._fromFleet ?? null,
      _speedCapAU:     (typeof spec._speedCapAU === 'number') ? spec._speedCapAU : null,
      preferMaxRange:  !!spec.preferMaxRange,
    };

    // Suspend obecnej mission (resume po orderCompleted/cancelled).
    this._suspendMissionIfAny(vessel);

    // M4 P3 hotfix #2: synthetic mission dla UI panelu ("Engage: targetName"
    // zamiast "brak aktywnej misji"). _updatePositions skip'uje engage przez
    // isOrderControlled check — synthetic mission NIE wpływa na pozycję.
    vessel.mission = {
      type:       'engage',
      targetId:   target.id,
      targetName: target.name ?? target.shipId ?? target.id,
      // Engage trwa dopóki target żyje — brak arrivalYear (UI panel nie pokazuje ETA).
      departYear: gameYear,
      arrivalYear: null,
      managedByOrder: true,  // marker dla _updatePositions/UI że to nie waypoint mission
    };
    vessel.movementOrder = order;
    vessel.status = 'on_mission';
    vessel.position.state = 'orbiting';
    vessel.position.dockedAt = null;

    this._byVessel.set(vessel.id, order);

    addMissionLog(vessel, gameYear,
      `Engage ${target.name ?? target.id} (optimal ${(maxRangeAU * 0.95).toFixed(3)} AU)`,
      'info');

    _trace(`issue engage ${orderId} vessel=${vessel.id} → ${spec.targetEntityId} maxRange=${maxRangeAU.toFixed(3)}AU`);
    EventBus.emit('vessel:orderIssued', { vesselId: vessel.id, order });

    return { ok: true, orderId };
  }

  /**
   * Per-tick engage — kiting toward/away from target.
   *
   * @private
   */
  _tickEngageOrder(vessel, order, dPhysicsYear, civDy, gameYear) {
    const target = this._resolveTarget(order.targetEntityId);
    if (!target || target.isWreck) {
      this._blockAndCancel(vessel, order, 'target_lost');
      addMissionLog(vessel, gameYear, 'Engage zakończone — cel zniszczony.', 'info');
      return;
    }

    // Refresh max range (tech mogło zmienić się od issueOrder).
    const maxRangeAU = _computeMaxWeaponRangeAU(vessel);
    if (maxRangeAU <= 0) {
      this._blockAndCancel(vessel, order, 'no_weapons');
      addMissionLog(vessel, gameYear, 'Engage anulowane — brak broni.', 'warn');
      return;
    }
    order.engageMaxRangeAU = maxRangeAU;

    // Target current position dla dist check.
    const tx = target.position?.x ?? 0;
    const ty = target.position?.y ?? 0;
    order.lastTargetPos = { x: tx, y: ty };

    const dxPx = tx - vessel.position.x;
    const dyPx = ty - vessel.position.y;
    const distPx = Math.hypot(dxPx, dyPx);
    const distAU = distPx / AU_TO_PX;

    // P3 polish #3 (2026-05-20): force-engagement fallback. ProximitySystem
    // jest discrete sampler — przy fast time / fast closing pair może minąć
    // combat range zone mid-tick (player+enemy obaj się ruszają w tej samej
    // pętli). proximityEnter NIGDY nie wystrzeli → encounter nie utworzony →
    // player kite hover bez walki.
    //
    // Threshold = maxRange × 1.2 (20% generous margin nad weapon range). Catch:
    //   1. Intra-tick crossing przez combat range zone (player chase + enemy
    //      przegonienie się w jednym ticku).
    //   2. Pair drift TUŻ poza combat enter ale w zasięgu broni (enemy ucieka,
    //      player nie nadąża, encounter już zakończony retreat).
    // Player intent (engage order) GWARANTUJE że chce walczyć — z punktu widzenia
    // mechaniki, gdy cel jest "w pobliżu" i nie ma encountera, ZAWSZE wymuszamy.
    if (GAME_CONFIG.FEATURES?.m4DeepSpaceCombat && !target.isWreck) {
      const forceThresholdAU = maxRangeAU * 1.2;
      if (distAU < forceThresholdAU) {
        const dscs = window.KOSMOS?.deepSpaceCombatSystem;
        if (dscs) {
          const enc1 = dscs._findActiveEncounterContaining?.(vessel.id);
          const enc2 = dscs._findActiveEncounterContaining?.(target.id);
          if (!enc1 && !enc2) {
            const sameFaction = (vessel.ownerEmpireId ?? null) === (target.ownerEmpireId ?? null);
            if (!sameFaction) {
              // Wyczyść _activeCombatPairs (jeśli zaschła z poprzedniego failed
              // attempt) i emit świeży combatRangeEnter. VCS player-intent
              // bypass pomija cooldown, DSCS.startEngagement tworzy encounter.
              const ps = window.KOSMOS?.proximitySystem;
              const k = vessel.id < target.id
                ? `${vessel.id}|${target.id}`
                : `${target.id}|${vessel.id}`;
              if (ps?._activeCombatPairs) {
                ps._activeCombatPairs.delete(k);
              }
              EventBus.emit('vessel:combatRangeEnter', {
                vesselAId:  vessel.id,
                vesselBId:  target.id,
                distanceAU: distAU,
                sameFaction: false,
              });
              if (ps?._activeCombatPairs) {
                ps._activeCombatPairs.add(k);
              }
              _trace(`force-engage ${order.id} vessel=${vessel.id} target=${target.id} dist=${distAU.toFixed(3)}AU < ${forceThresholdAU.toFixed(3)}AU (proximity sampling missed)`);
            }
          }
        }
      }
    }

    // Engage = "chase + kite" — chase'uj target dopóki nie wpadniesz w optimal
    // band, wtedy kituj (hold/away). Cancel TYLKO target wreck.
    //
    // Player Fleet Groups (P2): order.preferMaxRange (doktryna kite z P3) zwiększa
    // optimalDistAU 0.95 → 0.98 → vessel trzyma się bliżej max range zamiast
    // klasycznego 95% (więcej dystansu = bezpieczniej, ale ryzyko wyjścia z zasięgu
    // gdy enemy się odsuwa).
    const optimalFactor = order.preferMaxRange ? 0.98 : 0.95;
    const optimalDistAU = maxRangeAU * optimalFactor;
    // P3 polish #2 (2026-05-20): clamp upperBand do maxRangeAU × 0.98 — gwarancja
    // że vessel NIGDY nie hover'uje poza zasięgiem broni. Bez tego dla kite (0.98)
    // upperBand = 0.98 × 1.05 = 1.029 → vessel mógł być 2.9% poza max range i nie
    // strzelać. Cap = 0.98 → 2% bezpieczny margines wewnątrz zasięgu.
    const upperBandAU   = Math.min(optimalDistAU * 1.05, maxRangeAU * 0.98);
    const lowerBandAU   = optimalDistAU * 0.95;

    let direction = 0;  // -1 = away, 0 = hold, +1 = toward
    if (distAU > upperBandAU) direction = +1;
    else if (distAU < lowerBandAU) direction = -1;

    if (direction === 0 || distPx < INTERCEPT_EPS) {
      // Hold sweet spot.
      if (vessel.velocity) {
        vessel.velocity.vx = 0;
        vessel.velocity.vy = 0;
        vessel.velocity.updatedYear = gameYear;
      }
      return;
    }

    // M4 P3 hotfix #1: chase phase używa INTERCEPT MATH (target.velocity).
    // Naive toward(current_pos) zawodzi gdy enemy faster niż frigate — pursuer
    // gonił "ogon" enemy bez nigdy go dogonić. Intercept oblicza punkt spotkania
    // (rozwiązuje kwadratowe |target.pos + target.vel × τ − pursuer.pos| = pursuer.speed × τ).
    //   - Chase (direction=+1, dist > upperBand): waypoint = intercept point
    //   - Kite (direction=-1, dist < lowerBand): naive away from current pos
    //     (enemy w combat już stationary w DSCS, intercept zbędny)
    let wpX, wpY;
    if (direction === +1) {
      const ip = this._computeInterceptPoint(vessel, target);
      wpX = ip.x; wpY = ip.y;
    } else {
      wpX = tx; wpY = ty;
    }

    const dwx = wpX - vessel.position.x;
    const dwy = wpY - vessel.position.y;
    const distWpPx = Math.hypot(dwx, dwy);
    if (distWpPx < INTERCEPT_EPS) return;

    // Krok px. Cap do |dist - optimal| żeby nie overshoot w jednym ticku.
    // P2: _speedCapAU clamp (member floty leci nie szybciej niż najwolniejszy).
    const effectiveSpeedAU = (typeof order._speedCapAU === 'number')
      ? Math.min(vessel.speedAU ?? 1.0, order._speedCapAU)
      : (vessel.speedAU ?? 1.0);
    const speedPxPerYear = effectiveSpeedAU * AU_TO_PX;
    const optimalPx = optimalDistAU * AU_TO_PX;
    const distanceToOptimalPx = Math.abs(distPx - optimalPx);
    const rawStepPx = speedPxPerYear * Math.max(0, dPhysicsYear);
    const stepPx = Math.min(rawStepPx, distanceToOptimalPx);

    // Unit vector w kierunku waypoint (intercept point albo current target).
    const ux = dwx / distWpPx;
    const uy = dwy / distWpPx;

    // direction +1 → toward waypoint; direction -1 → away from current target pos.
    // Dla away używamy unit vector od target (nie od waypoint).
    if (direction === +1) {
      vessel.position.x += ux * stepPx;
      vessel.position.y += uy * stepPx;
    } else {
      // away from current target — flip ux,uy bo waypoint == target dla kite
      vessel.position.x -= ux * stepPx;
      vessel.position.y -= uy * stepPx;
    }

    if (vessel.velocity) {
      const speedCiv = (vessel.speedAU ?? 1.0) / CIV_TIME_SCALE;
      vessel.velocity.vx = direction * ux * speedCiv;
      vessel.velocity.vy = direction * uy * speedCiv;
      vessel.velocity.updatedYear = gameYear;
    }

    _trace(`tick engage ${order.id} vessel=${vessel.id} dist=${distAU.toFixed(3)}AU optimal=${optimalDistAU.toFixed(3)} dir=${direction === 1 ? `intercept→(${wpX.toFixed(1)},${wpY.toFixed(1)})` : 'kite-away'} step=${stepPx.toFixed(2)}`);
  }

  /**
   * M2 hook: intercept cone rendering, prediction confidence z IntelSystem.
   * W M1 wariant liniowy (stała velocity).
   *
   * Rozwiązuje kwadratowe: szuka najmniejszego τ>=0 takiego że
   *   |target.pos + target.vel*τ − pursuer.pos| = pursuer.speed * τ
   *
   * Jednostki: wszystko konwertowane do px/gameYear (żeby pursuer.speedAU i
   * target.velocity miały tę samą podstawę).
   *
   * @returns {{x,y}} punkt spotkania; przy braku rozwiązania — bieżąca pozycja targetu (fallback pursue).
   */
  _computeInterceptPoint(pursuer, target) {
    const px = pursuer.position.x, py = pursuer.position.y;
    const tx = target.x ?? target.position?.x ?? 0;
    const ty = target.y ?? target.position?.y ?? 0;

    // target.velocity jest w AU/civYear (M1 Commit 2). Konwersja do px/gameYear:
    //   AU/civYear × AU_TO_PX × CIV_TIME_SCALE = px/gameYear
    // Planetarne/nieruchome targety — brak velocity → 0.
    const tvx = (target.velocity?.vx ?? 0) * AU_TO_PX * CIV_TIME_SCALE;
    const tvy = (target.velocity?.vy ?? 0) * AU_TO_PX * CIV_TIME_SCALE;
    const s = (pursuer.speedAU ?? 1.0) * AU_TO_PX;  // px/gameYear

    const dx = tx - px, dy = ty - py;
    const a = tvx * tvx + tvy * tvy - s * s;
    const b = 2 * (dx * tvx + dy * tvy);
    const c = dx * dx + dy * dy;

    // Degenerate: target praktycznie nieruchomy vs pursuer speed — reduce to pursue.
    if (Math.abs(a) < INTERCEPT_EPS) {
      if (Math.abs(b) < INTERCEPT_EPS) return { x: tx, y: ty };
      const tau = -c / b;
      if (!Number.isFinite(tau) || tau < 0) return { x: tx, y: ty };
      return { x: tx + tvx * tau, y: ty + tvy * tau };
    }

    const disc = b * b - 4 * a * c;
    if (disc < 0) return { x: tx, y: ty };  // no solution — fallback pursue

    const sqrtDisc = Math.sqrt(disc);
    const tau1 = (-b - sqrtDisc) / (2 * a);
    const tau2 = (-b + sqrtDisc) / (2 * a);

    // Wybieramy najmniejsze τ ≥ 0.
    let tau = null;
    if (tau1 >= 0) tau = tau1;
    if (tau2 >= 0 && (tau === null || tau2 < tau)) tau = tau2;
    if (tau === null || !Number.isFinite(tau)) return { x: tx, y: ty };

    return { x: tx + tvx * tau, y: ty + tvy * tau };
  }

  /**
   * Per-tick pursue: vessel kieruje się na aktualną pozycję targetu.
   * @param {object} vessel
   * @param {object} order
   * @param {number} dPhysicsYear — czas ticka w gameYears (do stepAU)
   * @param {number} gameYear
   */
  _tickPursueOrder(vessel, order, dPhysicsYear, gameYear) {
    const target = this._resolveTarget(order.targetEntityId);
    if (!target || target.isWreck) {
      this._blockAndCancel(vessel, order, 'target_lost');
      return;
    }

    const tx = target.x ?? target.position?.x ?? 0;
    const ty = target.y ?? target.position?.y ?? 0;
    order.lastTargetPos = { x: tx, y: ty };

    _trace(`tick pursue ${order.id} vessel=${vessel.id}@(${vessel.position.x.toFixed(1)},${vessel.position.y.toFixed(1)}) target=${order.targetEntityId}@(${tx.toFixed(1)},${ty.toFixed(1)}) dPhys=${dPhysicsYear.toFixed(4)}`);
    this._moveTowardsAndMaybeComplete(vessel, order, tx, ty, dPhysicsYear, gameYear, target);
  }

  /**
   * Per-tick intercept: przelicz intercept point z target.velocity i kieruj tam.
   * Completion = proximity do TARGETA (nie do intercept pointu — vessel mógł minąć IP).
   */
  _tickInterceptOrder(vessel, order, dPhysicsYear, gameYear) {
    const target = this._resolveTarget(order.targetEntityId);
    if (!target || target.isWreck) {
      this._blockAndCancel(vessel, order, 'target_lost');
      return;
    }

    const ip = this._computeInterceptPoint(vessel, target);
    order.interceptPoint = ip;
    const ltx = target.x ?? target.position?.x ?? 0;
    const lty = target.y ?? target.position?.y ?? 0;
    order.lastTargetPos = { x: ltx, y: lty };

    // M2b Commit 3 — prediction cone update (per-tick refresh).
    // targetPos = ip (intercept point), NIE lastTargetPos. Cone reprezentuje
    // niepewność punktu spotkania — vessel leci DO ip, więc oś stożka musi
    // iść wzdłuż trajektorii vessel.position → ip. Użycie lastTargetPos
    // dawałoby stożek odchylony od trajektorii (zwłaszcza dla szybkich
    // ruchomych targetów gdy ip ≠ obecna pozycja). Spec §8.2 design bug.
    // Cleanup niepotrzebny — renderer (Commit 4) filtruje po status==='active'.
    if (GAME_CONFIG.FEATURES.predictionCone) {
      const contact    = window.KOSMOS?.intelSystem?.getVesselContact?.(target.id);
      const obsQuality = contact?.quality
        ?? (target.ownerEmpireId ? 'rumor' : 'detailed');
      order.predictionCone = PredictionConeMath.computeCone(
        vessel.position,
        ip,
        target.velocity,
        vessel.speedAU ?? 1.0,
        obsQuality,
        gameYear,
      );
    }

    _trace(`tick intercept ${order.id} vessel=${vessel.id}@(${vessel.position.x.toFixed(1)},${vessel.position.y.toFixed(1)}) target@(${ltx.toFixed(1)},${lty.toFixed(1)}) IP=(${ip.x.toFixed(1)},${ip.y.toFixed(1)}) dPhys=${dPhysicsYear.toFixed(4)}`);
    this._moveTowardsAndMaybeComplete(vessel, order, ip.x, ip.y, dPhysicsYear, gameYear, target);
  }

  /**
   * Wspólna mechanika: przesuń vessel w kierunku (tx, ty), sprawdź proximity
   * do `proximityTarget` (zwykle sam target entity) dla completion.
   */
  _moveTowardsAndMaybeComplete(vessel, order, tx, ty, dPhysicsYear, gameYear, proximityTarget) {
    // Proximity check PRZED ruchem — natychmiastowa completion gdy startowa pozycja
    // pokrywa się z celem (np. issue gdy vessel już tam jest).
    const ptx = proximityTarget.x ?? proximityTarget.position?.x ?? tx;
    const pty = proximityTarget.y ?? proximityTarget.position?.y ?? ty;
    const distBefore = Math.hypot(ptx - vessel.position.x, pty - vessel.position.y);
    if (distBefore <= THREAT_RADIUS_PX) {
      this._completeOrder(vessel, order, gameYear, proximityTarget);
      return;
    }

    // Wektor do waypointu (tx,ty) — dla pursue == target; dla intercept == IP.
    const dx = tx - vessel.position.x;
    const dy = ty - vessel.position.y;
    const distWpPx = Math.hypot(dx, dy);
    if (distWpPx < INTERCEPT_EPS) return;  // już w punkcie

    // Krok w jednostkach px. speedAU (AU/gameYear) × AU_TO_PX = px/gameYear.
    // Player Fleet Groups (P2): _speedCapAU clamp dla pursue/intercept gdy member floty.
    // FleetSystem.issueFleetOrder ustawia spec._speedCapAU = min(memberSpeeds).
    const effectiveSpeedAU = (typeof order._speedCapAU === 'number')
      ? Math.min(vessel.speedAU ?? 1.0, order._speedCapAU)
      : (vessel.speedAU ?? 1.0);
    const speedPxPerYear = effectiveSpeedAU * AU_TO_PX;
    const stepPx = Math.min(distWpPx, speedPxPerYear * Math.max(0, dPhysicsYear));

    const ux = dx / distWpPx;
    const uy = dy / distWpPx;
    vessel.position.x += ux * stepPx;
    vessel.position.y += uy * stepPx;

    // Velocity (AU/civYear) — dla consumerów które potrzebują aktualnej prędkości.
    // Kierunek × prędkość w civ skali = (speedAU / CIV_TIME_SCALE).
    if (vessel.velocity) {
      const speedCiv = (vessel.speedAU ?? 1.0) / CIV_TIME_SCALE;
      vessel.velocity.vx = ux * speedCiv;
      vessel.velocity.vy = uy * speedCiv;
      vessel.velocity.updatedYear = gameYear;
    }

    // Proximity check PO ruchu — gdy step zamknął lukę do progu.
    // (Krytyczne dla tail-chase gdy catch-rate pokrywa target-step dokładnie).
    const distAfter = Math.hypot(ptx - vessel.position.x, pty - vessel.position.y);
    if (distAfter <= THREAT_RADIUS_PX) {
      this._completeOrder(vessel, order, gameYear, proximityTarget);
    }
  }

  _completeOrder(vessel, order, gameYear, target) {
    order.status        = 'completed';
    order.completedYear = gameYear;
    this._byVessel.delete(vessel.id);

    // Dla pursue/intercept vessela — stand-by (orbiting bez dockedAt).
    // Dla planety/moon jako targetu — dock/orbit.
    const targetIsCelestial = target && target.id &&
      !this._vm.getVessel?.(target.id);
    if (targetIsCelestial) {
      vessel.position.state    = 'orbiting';
      vessel.position.dockedAt = target.id;
      vessel.position.x        = target.x ?? vessel.position.x;
      vessel.position.y        = target.y ?? vessel.position.y;
    } else {
      // M4 P1 — drift idle state z soft timer auto-return. Vessel kończy pursue/intercept
      // na vessel target gdzieś w otwartej przestrzeni; pozostaje state='orbiting' +
      // dockedAt=null (zachowane dla _updatePositions które nie ruszy pozycji bez
      // valid dockedAt). Marker driftIdle + _driftingVessels Set powoduje że _tick
      // monitoruje vessel i po DRIFT_AUTO_RETURN_GAME_YEARS auto-wydaje moveToPoint do
      // najbliższej friendly planety. Player override: wydaj nowy order → marker
      // jest czyszczony w issueOrder przez _clearDriftMarker.
      vessel.position.state    = 'orbiting';
      vessel.position.dockedAt = null;
      if (GAME_CONFIG.FEATURES?.m4DriftFix) {
        vessel.driftIdle = {
          sinceYear:      gameYear,
          autoReturnYear: gameYear + DRIFT_AUTO_RETURN_GAME_YEARS,
        };
        this._driftingVessels.add(vessel.id);
        EventBus.emit('vessel:driftIdle', {
          vesselId:       vessel.id,
          sinceYear:      gameYear,
          autoReturnYear: vessel.driftIdle.autoReturnYear,
        });
      }
    }
    vessel.status = 'idle';
    // Zeruj velocity po arrivalu (stoi przy targecie).
    if (vessel.velocity) {
      vessel.velocity.vx = 0;
      vessel.velocity.vy = 0;
      vessel.velocity.updatedYear = gameYear;
    }

    _trace(`complete ${order.id} ${order.type} vessel=${vessel.id} pos=(${vessel.position.x.toFixed(1)},${vessel.position.y.toFixed(1)}) dockedAt=${vessel.position.dockedAt ?? 'null'} year=${gameYear.toFixed(3)}`);
    EventBus.emit('vessel:orderCompleted', {
      vesselId:      vessel.id,
      orderId:       order.id,
      type:          order.type,
      completedYear: gameYear,
    });

    // Bugfix 2026-05-21 — pursue/intercept completion na enemy vessel: force-emit
    // combatRangeEnter. THREAT_RADIUS_AU (0.15) == COMBAT_ENGAGEMENT_AU (0.15) +
    // ProximitySystem używa strict `<` dla combat enter → przy dokładnym landingu
    // na 0.15 AU proximity nie emituje, DSCS nie startuje, vessel siedzi obok
    // wroga bez walki. Force-emit gdy target jest enemy vesselem i kontrastuje
    // faction. Czyścimy zarówno `_activeCombatPairs` jak i `_recentlyEngaged`
    // (cooldown) — pursue mógł wcześniej wygenerować failed CRE i zostawić stale
    // cooldown, który zablokuje nowy emit.
    if (target && (order.type === ORDER_TYPES.pursue || order.type === ORDER_TYPES.intercept)) {
      const isVessel = !!this._vm?.getVessel?.(target.id);
      if (isVessel && !target.isWreck) {
        const sameFaction = (vessel.ownerEmpireId ?? null) === (target.ownerEmpireId ?? null);
        if (!sameFaction) {
          const ps = window.KOSMOS?.proximitySystem;
          const vcs = window.KOSMOS?.vesselCombatSystem;
          const k = vessel.id < target.id ? `${vessel.id}|${target.id}` : `${target.id}|${vessel.id}`;
          if (ps?._activeCombatPairs) ps._activeCombatPairs.delete(k);
          if (vcs?._recentlyEngaged) vcs._recentlyEngaged.delete(k);
          EventBus.emit('vessel:combatRangeEnter', {
            vesselAId:  vessel.id,
            vesselBId:  target.id,
            distanceAU: THREAT_RADIUS_AU,
            sameFaction: false,
          });
          if (ps?._activeCombatPairs) ps._activeCombatPairs.add(k);
          _trace(`force-engage on complete: ${order.type} vessel=${vessel.id} target=${target.id}`);
        }
      }
    }
  }

  _blockAndCancel(vessel, order, reason) {
    order.status = 'blocked';
    order.blockReason = reason;
    this._byVessel.delete(vessel.id);
    _trace(`blocked ${order.id} ${order.type} vessel=${vessel.id} reason=${reason}`);
    EventBus.emit('vessel:orderBlocked', {
      vesselId: vessel.id, orderId: order.id, reason,
    });
  }

  // M2b C5 — cancel orderów referencjujących usunięty POI (§9.2 design doc).
  // Filtruje po order.poiId (pole istnieje od C1, default null). Dla M1/M2a/M2b-C5
  // wszystkie ordery mają poiId=null → pętla nigdy nie matchuje. C6 doda goToPOI
  // który ustawi order.poiId — handler od razu zacznie chronić przed dangling refs.
  _onPOIDeletedHandler(poiId) {
    if (!GAME_CONFIG.FEATURES.poiSystem) return;
    for (const [vId, order] of [...this._byVessel.entries()]) {
      if (order.poiId === poiId && order.status === 'active') {
        const vessel = this._vm.getVessel?.(vId);
        if (vessel) this._blockAndCancel(vessel, order, 'poi_deleted');
      }
    }
  }

  /**
   * M2b C6 — `goToPOI`: nawigacja do POI. Delegat do `_issueMoveToPoint` z punktem
   * rozwiązanym per typ POI (waypoint→point, patrol→waypoints[0], rally/picket/
   * ambush→center). Po success nadpisuje `order.type='goToPOI'` + `order.poiId` —
   * VesselArrived wykryje to i wyemituje `vesselReachedPOI` po dotarciu.
   */
  _issueGoToPOI(vessel, spec) {
    if (!GAME_CONFIG.FEATURES?.poiSystem) {
      return { ok: false, reason: 'feature_disabled' };
    }
    const registry = window.KOSMOS?.poiRegistry;
    const poi = registry?.getPOI?.(spec.poiId);
    if (!poi) return { ok: false, reason: 'poi_not_found' };

    // Resolve target point per POI type
    let targetPoint = null;
    if (poi.type === 'waypoint')      targetPoint = poi.point;
    else if (poi.type === 'patrol')   targetPoint = poi.waypoints?.[0];
    else                              targetPoint = poi.center;  // rally/picket/ambush
    if (!targetPoint || typeof targetPoint.x !== 'number' || typeof targetPoint.y !== 'number') {
      return { ok: false, reason: 'poi_no_target_point' };
    }

    // Delegate do moveToPoint (build mission, suspend, route avoidance Słońca, fuel).
    const result = this._issueMoveToPoint(vessel, {
      type:        ORDER_TYPES.moveToPoint,
      targetPoint: { x: targetPoint.x, y: targetPoint.y },
      issuedBy:    spec.issuedBy ?? 'player',
    });
    if (!result.ok) return result;

    // Override order — leci jako goToPOI, _onVesselArrived rozpozna i emit vesselReached.
    const order = vessel.movementOrder;
    order.type  = ORDER_TYPES.goToPOI;
    order.poiId = spec.poiId;

    EventBus.emit('vessel:goToPOIIssued', {
      vesselId: vessel.id,
      orderId:  order.id,
      poiId:    spec.poiId,
    });
    return result;
  }

  /**
   * M2b C6 — `patrol`: cykliczne chodzenie po waypoints. Akceptuje:
   *   - `spec.poiId` → resolve `waypoints` z POI typu 'patrol'
   *   - `spec.patrolRoute` → manualna route (devtools, brak POI)
   *
   * Patrol NIE buduje mission (chodzenie nie ma destination). Sterowanie pozycją
   * przez `_tickPatrolOrder` w głównej pętli `_tick`.
   */
  _issuePatrol(vessel, spec) {
    if (!GAME_CONFIG.FEATURES?.poiSystem) {
      return { ok: false, reason: 'feature_disabled' };
    }

    let waypoints = null;
    let poiId = null;
    if (spec.poiId) {
      const registry = window.KOSMOS?.poiRegistry;
      const poi = registry?.getPOI?.(spec.poiId);
      if (!poi) return { ok: false, reason: 'poi_not_found' };
      if (poi.type !== 'patrol') return { ok: false, reason: 'poi_not_patrol_type' };
      waypoints = poi.waypoints;
      poiId = spec.poiId;
    } else if (Array.isArray(spec.patrolRoute)) {
      waypoints = spec.patrolRoute;
    }

    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return { ok: false, reason: 'patrol_needs_2_points' };
    }

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const orderId = `mo_${_nextOrderId++}`;
    const order = {
      id:             orderId,
      type:           ORDER_TYPES.patrol,
      issuedYear:     gameYear,
      issuedBy:       spec.issuedBy ?? 'player',
      targetEntityId: null,
      targetPoint:    null,
      patrolRoute:    waypoints.map(w => ({ x: w.x, y: w.y })),
      lastTargetPos:  null,
      interceptPoint: null,
      status:         'active',
      completedYear:  null,
      blockReason:    null,
      poiId:               poiId,
      predictionCone:      null,
      patrolWaypointIndex: 0,
      patrolDirection:     1,
      escorteeId:          null,
    };

    // Suspend oryginalnej mission (jeśli aktywna). Patrol nie ma własnej mission.
    this._suspendMissionIfAny(vessel);

    // Implicit launch z dock/orbit (analogicznie do pursue/intercept).
    if (vessel.position.state === 'docked' || vessel.position.state === 'orbiting') {
      vessel.position.state    = 'in_transit';
      vessel.position.dockedAt = null;
      vessel.status            = 'on_mission';
      EventBus.emit('vessel:launched', { vessel, mission: vessel.mission ?? null });
    }

    vessel.movementOrder = order;
    this._byVessel.set(vessel.id, order);

    addMissionLog(vessel, gameYear,
      poiId ? `Patrol POI ${poiId} (${waypoints.length} wp)` : `Patrol manual (${waypoints.length} wp)`,
      'info');

    _trace(`issue patrol ${orderId} vessel=${vessel.id} poiId=${poiId ?? 'null'} wp=${waypoints.length}`);
    EventBus.emit('vessel:orderIssued',   { vesselId: vessel.id, order });
    EventBus.emit('vessel:patrolStarted', {
      vesselId:      vessel.id,
      orderId,
      poiId,
      waypointIndex: 0,
    });

    return { ok: true, orderId };
  }

  /**
   * Per-tick patrol: rusz w kierunku aktualnego waypointa, gdy dotrze (≤ THREAT_RADIUS_PX)
   * emit `vessel:patrolWaypointReached` PRZED `_advancePatrolIndex` (handler chce
   * "który właśnie został osiągnięty", nie "który następny"). Skorumpowany
   * `patrolRoute` (null/[]/idx out-of-range w runtime overwrite) → `_blockAndCancel`.
   */
  _tickPatrolOrder(vessel, order, dPhysicsYear, gameYear) {
    const wp = order.patrolRoute?.[order.patrolWaypointIndex];
    if (!wp) {
      this._blockAndCancel(vessel, order, 'patrol_invalid_waypoint');
      return;
    }

    const dx = wp.x - vessel.position.x;
    const dy = wp.y - vessel.position.y;
    const distPx = Math.hypot(dx, dy);

    if (distPx <= THREAT_RADIUS_PX) {
      // KOLEJNOŚĆ: emit PRZED advance — handler dostaje index "właśnie osiągnięty".
      EventBus.emit('vessel:patrolWaypointReached', {
        vesselId:      vessel.id,
        orderId:       order.id,
        waypointIndex: order.patrolWaypointIndex,
      });
      this._advancePatrolIndex(order);
      return;
    }

    // Movement physics — kopia z _moveTowardsAndMaybeComplete bez completion check.
    const speedPxPerYear = (vessel.speedAU ?? 1.0) * AU_TO_PX;
    const stepPx = Math.min(distPx, speedPxPerYear * Math.max(0, dPhysicsYear));
    const ux = dx / distPx;
    const uy = dy / distPx;
    vessel.position.x += ux * stepPx;
    vessel.position.y += uy * stepPx;

    if (vessel.velocity) {
      const speedCiv = (vessel.speedAU ?? 1.0) / CIV_TIME_SCALE;
      vessel.velocity.vx = ux * speedCiv;
      vessel.velocity.vy = uy * speedCiv;
      vessel.velocity.updatedYear = gameYear;
    }
  }

  /**
   * Advance patrol waypoint index. loopMode rozwiązuje POI lookup z fallback do
   * 'ping_pong' (Filip's decision: gdy patrol order bez poiId LUB POI usunięty).
   *
   * - 'loop':     index = (index + 1) % n
   * - 'ping_pong': bounce — przy hit end (next>=n): next=n-2, dir=-1;
   *                          przy hit start (next<0): next=1, dir=1
   *
   * Edge case n=2: ping_pong zachowuje się identycznie jak loop (A→B→A→B…).
   */
  _advancePatrolIndex(order) {
    const n = order.patrolRoute?.length ?? 0;
    if (n < 2) return;

    const poi = order.poiId ? window.KOSMOS?.poiRegistry?.getPOI?.(order.poiId) : null;
    const loopMode = poi?.loopMode ?? 'ping_pong';  // Filip's default

    if (loopMode === 'loop') {
      order.patrolWaypointIndex = (order.patrolWaypointIndex + 1) % n;
      return;
    }

    // ping_pong (default)
    let next = order.patrolWaypointIndex + order.patrolDirection;
    if (next >= n) {
      next = n - 2;
      order.patrolDirection = -1;
    } else if (next < 0) {
      next = 1;
      order.patrolDirection = 1;
    }
    order.patrolWaypointIndex = next;
  }

  /**
   * Stub dla patrol/escort — akceptuje order, ale runtime nie robi nic.
   * Placeholder pod M2 implementację.
   */
  _issueStubOrder(vessel, spec) {
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const orderId = `mo_${_nextOrderId++}`;
    const order = {
      id:             orderId,
      type:           spec.type,
      issuedYear:     gameYear,
      issuedBy:       spec.issuedBy ?? 'player',
      targetEntityId: spec.targetEntityId ?? null,
      targetPoint:    null,
      patrolRoute:    Array.isArray(spec.patrolRoute) ? spec.patrolRoute.map(p => ({ ...p })) : null,
      lastTargetPos:  null,
      interceptPoint: null,
      status:         'active',
      completedYear:  null,
      blockReason:    null,
      // M2b Commit 1 — defaults spójne z _migrateV66toV67 (Commits 3/6/7 użyją)
      poiId:               null,
      predictionCone:      null,
      patrolWaypointIndex: 0,
      patrolDirection:     1,
      escorteeId:          null,
    };
    vessel.movementOrder = order;
    this._byVessel.set(vessel.id, order);
    EventBus.emit('vessel:orderIssued', { vesselId: vessel.id, order });
    console.log(`[MovementOrderSystem] stub: ${spec.type} dla ${vessel.id}`);
    return { ok: true, orderId };
  }

  /**
   * Anulowanie orderu (z UI / AI / systemu).
   * @param {string} vesselId
   * @param {string} [reason='player']
   * @returns {boolean} true gdy istniał aktywny order
   */
  cancelOrder(vesselId, reason = 'player') {
    const vessel = this._vm.getVessel?.(vesselId);
    if (!vessel) return false;
    const order = vessel.movementOrder;
    if (!order || order.status !== 'active') return false;

    order.status = 'cancelled';
    order.blockReason = reason;
    this._byVessel.delete(vesselId);

    // M3 P1.4.5 — physics-level cleanup symetryczny z _onVesselArrived.
    // Bez tego vessel pozostawał state='in_transit' z synth move_to_point mission
    // (lub stale velocity dla pursue/intercept) → _updatePositions kontynuował ruch.
    // UWAGA ordering: emit('vessel:orderCancelled') jest synchronous → subscriber
    // _resumeMissionAfterOrder w VesselManager nadpisze nasz cleanup gdy snapshot
    // istnieje (resume oryginalnej mission). Test #2 weryfikuje resume path.
    this._stopVesselMotion(vessel);

    EventBus.emit('vessel:orderCancelled', {
      vesselId, orderId: order.id, reason,
    });
    return true;
  }

  /**
   * Cleanup pozycji/velocity/mission po cancel orderu.
   * Konwencja vessel.position.state ∈ {docked, orbiting, in_transit}; brak 'idle' —
   * "drift in space" reprezentujemy przez state='orbiting' + dockedAt=null
   * (spójne z _onVesselArrived dla moveToPoint, gdzie m.targetId=null).
   * Dla pursue/intercept oryginalna mission może być żywa (nie synth) — nie ruszamy
   * jej; jeśli był suspended snapshot, _resumeMissionAfterOrder podniesie state z
   * powrotem do 'in_transit' po naszym cleanup.
   */
  _stopVesselMotion(vessel) {
    // Synth move_to_point mission — wywal całkowicie (zgodnie z _onVesselArrived).
    if (vessel.mission?.type === 'move_to_point') {
      vessel.mission = null;
    }
    vessel.position.state    = 'orbiting';
    vessel.position.dockedAt = null;
    vessel.status            = 'idle';
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    vessel.velocity.vx = 0;
    vessel.velocity.vy = 0;
    vessel.velocity.updatedYear = gameYear;
  }

  getOrder(vesselId) {
    const v = this._vm.getVessel?.(vesselId);
    return v?.movementOrder ?? null;
  }

  listActive() {
    return [...this._byVessel.values()];
  }

  /**
   * Tick resolver — wywoływany synchronicznie z VesselManager._tick przed _updatePositions.
   * @param {number} civDy — civDeltaYears
   */
  _tick(civDy) {
    if (civDy <= 0) return;

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    // dPhysicsYear = diff gameYear pomiędzy tickami (gameYear rośnie w physics scale).
    //   Pierwszy tick po init/load: brak refs → 0 → brak ruchu w tym jednym tick.
    const dPhysicsYear = (this._lastTickYear != null)
      ? Math.max(0, gameYear - this._lastTickYear)
      : 0;
    this._lastTickYear = gameYear;

    // Iteruj aktywne ordery (po kopii — _byVessel może być zmutowane przez _completeOrder wewnątrz).
    if (this._byVessel.size > 0) {
      for (const [vesselId, order] of [...this._byVessel.entries()]) {
        const vessel = this._vm.getVessel?.(vesselId);
        if (!vessel) {
          // vessel znikł (cleaned wreck) — usuń order z indeksu
          this._byVessel.delete(vesselId);
          continue;
        }
        if (order.status !== 'active') {
          this._byVessel.delete(vesselId);
          continue;
        }

        if (order.type === ORDER_TYPES.pursue) {
          this._tickPursueOrder(vessel, order, dPhysicsYear, gameYear);
        } else if (order.type === ORDER_TYPES.intercept) {
          this._tickInterceptOrder(vessel, order, dPhysicsYear, gameYear);
        } else if (order.type === ORDER_TYPES.patrol) {
          this._tickPatrolOrder(vessel, order, dPhysicsYear, gameYear);
        } else if (order.type === ORDER_TYPES.escort) {
          this._tickEscortOrder(vessel, order, dPhysicsYear, gameYear);
        } else if (order.type === ORDER_TYPES.engage) {
          this._tickEngageOrder(vessel, order, dPhysicsYear, civDy, gameYear);
        }
        // moveToPoint, goToPOI — ruch zarządzany przez _updatePositions
        //   (mission interpolation, mission.type='move_to_point'); completion przez
        //   _onVesselArrived (rozszerzone o goToPOI → emit vesselReachedPOI).
      }
    }

    // M4 P1 — drift recovery loop. Vessele po pursue/intercept na vessel target
    // które przekroczyły autoReturnYear → auto-issue moveToPoint do nearest friendly.
    if (GAME_CONFIG.FEATURES?.m4DriftFix && this._driftingVessels.size > 0) {
      for (const vId of [...this._driftingVessels]) {
        const v = this._vm.getVessel?.(vId);
        if (!v || v.isWreck || !v.driftIdle) {
          this._driftingVessels.delete(vId);
          if (v) v.driftIdle = null;
          continue;
        }
        // Gracz wydał nowy order w międzyczasie? _clearDriftMarker już posprzątało.
        if (v.movementOrder?.status === 'active') {
          this._driftingVessels.delete(vId);
          v.driftIdle = null;
          continue;
        }
        if (gameYear >= v.driftIdle.autoReturnYear) {
          this._tryAutoReturnDrift(v, gameYear);
        }
      }
    }
  }

  /**
   * M4 P1 — wyczyść drift marker (player wydał nowy order LUB vessel wrecked).
   */
  _clearDriftMarker(vessel) {
    if (!vessel) return;
    if (vessel.driftIdle) vessel.driftIdle = null;
    if (this._driftingVessels.has(vessel.id)) this._driftingVessels.delete(vessel.id);
  }

  /**
   * M4 P1 — auto-return drift vessela do najbliższej friendly planety.
   *
   * P1 post-playtest #1 fix: pursue planety nie działa, bo orbital speed
   *   planety (bliska orbita: ~5-9 AU/civYear) > typowy vessel.speedAU (1.5-2.0).
   *   Vessel ściga ale dystans pozostaje stały lub rośnie — pursue nigdy nie
   *   wywołuje _completeOrder (THREAT_RADIUS_PX=0.15 AU).
   *
   * P1 post-playtest #2 fix (TEST 3.4): zamiast pursue, **inline rescue dock**.
   *   Vessel zużywa paliwo proporcjonalnie do dystansu i teleportuje się na
   *   orbitę planety (state=orbiting, dockedAt=planet.id, pozycja snapowana).
   *   Lore: automated emergency docking sequence — koloniści wysyłają beacon
   *   i tug-vessel. NIE jest fizycznie realistyczne, ale rozwiązuje drift trap
   *   gdy vessel nie może dogonić własnej kolonii. Pełna fizyka travel —
   *   backlog M5 (wymagałoby intercept math na planet orbital prediction).
   */
  _tryAutoReturnDrift(vessel, gameYear) {
    const dest = this._findNearestFriendlyPlanetForDrift(vessel);
    if (!dest) {
      // Brak friendly planety — extend timer o kolejne 5 game-years (lazy retry),
      // gracz zauważy w UI i ręcznie wyda order. NIE wreckujemy — drift jest miękki.
      vessel.driftIdle.autoReturnYear = gameYear + DRIFT_AUTO_RETURN_GAME_YEARS;
      return;
    }

    // Fuel cost — proporcjonalny do dystansu (symuluje że vessel rzeczywiście
    // leciał, mimo że robimy teleport). Clamp do current fuel (rescue dock
    // zawsze się udaje, nawet z fuel=0 — vessel dryfuje na bezwładności).
    const distAU = dest.distanceAU;
    const consumption = vessel.fuel?.consumption ?? 0;
    const fuelCost = Math.min(
      vessel.fuel?.current ?? 0,
      distAU * consumption,
    );
    if (vessel.fuel) {
      vessel.fuel.current = Math.max(0, (vessel.fuel.current ?? 0) - fuelCost);
    }

    // Inline rescue dock — snap do planety + dockedAt + orbiting state.
    vessel.position.state    = 'orbiting';
    vessel.position.dockedAt = dest.planet.id;
    vessel.position.x        = dest.planet.x ?? vessel.position.x;
    vessel.position.y        = dest.planet.y ?? vessel.position.y;
    vessel.status            = 'idle';
    if (vessel.velocity) {
      vessel.velocity.vx = 0;
      vessel.velocity.vy = 0;
      vessel.velocity.updatedYear = gameYear;
    }
    // Synth move_to_point mission cleanup (jeśli była aktywna z poprzednich orderów).
    if (vessel.mission?.type === 'move_to_point') vessel.mission = null;

    this._clearDriftMarker(vessel);

    addMissionLog(vessel, gameYear,
      `Auto-rescue dock → ${dest.planet.name ?? dest.planet.id} (${distAU.toFixed(2)} AU, fuel −${fuelCost.toFixed(2)})`,
      'info');

    EventBus.emit('vessel:driftAutoReturn', {
      vesselId:            vessel.id,
      destinationPlanetId: dest.planet.id,
      orderId:             null,  // inline rescue, brak orderu
      fuelConsumed:        fuelCost,
      distanceAU:          distAU,
    });
    EventBus.emit('vessel:docked', { vessel });
  }

  /**
   * M4 P1 — clone AutoRetreatSystem._findNearestFriendlyPlanet. ColonyManager
   * pobierany przez window.KOSMOS (spójnie z reszta MOS — _vm jest jedyny
   * konstruktor-injected). Preferencja: full colonies > outposts.
   */
  _findNearestFriendlyPlanetForDrift(vessel) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr?.getAllColonies) return null;
    const ownerId = vessel.ownerEmpireId ?? vessel.owner ?? 'player';

    const all = colMgr.getAllColonies().filter(c => {
      const cOwner = c.ownerEmpireId ?? 'player';
      if (cOwner !== ownerId) return false;
      return !!EntityManager.get(c.planetId);
    });
    if (all.length === 0) return null;

    const fullColonies = all.filter(c => !c.isOutpost);
    const candidates = fullColonies.length > 0 ? fullColonies : all;

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

  _findVesselIdFor(order) {
    // _byVessel mapuje vesselId → order; reverse lookup byłby drogi. Iteracja OK w M1.
    for (const [vid, o] of this._byVessel.entries()) {
      if (o === order) return vid;
    }
    return null;
  }

  /**
   * Vessel dotarł na cel — dla moveToPoint zamyka order.
   * _updatePositions emituje vessel:arrived gdy gameYear ≥ arrivalYear.
   */
  _onVesselArrived(vessel, mission) {
    if (!vessel || !mission) return;
    const order = vessel.movementOrder;
    if (!order || order.status !== 'active') return;

    // M2b C6: goToPOI delegate'uje do moveToPoint mission, więc completion path jest
    //   identyczny — różnica to dodatkowy emit `poi:vesselReached` (przez registry).
    const isMoveLike = (order.type === ORDER_TYPES.moveToPoint || order.type === ORDER_TYPES.goToPOI);
    if (isMoveLike && mission.type === 'move_to_point') {
      const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      order.status        = 'completed';
      order.completedYear = gameYear;
      this._byVessel.delete(vessel.id);

      // Po moveToPoint statek dryfuje w punkcie — mission=null, idle, orbiting bez dockedAt.
      // TODO M2: auto-return / stand-by mode. W M1 gracz musi wydać kolejny order.
      vessel.mission = null;
      vessel.status  = 'idle';

      // M2b C6: emit vesselReachedPOI gdy goToPOI dotarł.
      if (order.type === ORDER_TYPES.goToPOI && order.poiId) {
        window.KOSMOS?.poiRegistry?.vesselReachedPOI?.(vessel.id, order.poiId);
      }

      EventBus.emit('vessel:orderCompleted', {
        vesselId:      vessel.id,
        orderId:       order.id,
        type:          order.type,
        completedYear: gameYear,
      });
    }
  }

  /**
   * Vessel rozbity (combat / losy) — anuluj aktywny order jeśli istniał.
   * Dodatkowo: anuluj ordery które miały ten vessel jako target.
   */
  _onVesselWrecked(vessel) {
    if (!vessel) return;

    // M4 P1 — drift cleanup gdy wrecked.
    this._clearDriftMarker(vessel);

    // Pursuer wrecked → anuluj jego order.
    const order = vessel.movementOrder;
    if (order && order.status === 'active') {
      order.status = 'cancelled';
      order.blockReason = 'vessel_wrecked';
      this._byVessel.delete(vessel.id);
      EventBus.emit('vessel:orderCancelled', {
        vesselId: vessel.id, orderId: order.id, reason: 'vessel_wrecked',
      });
    }

    // Target wrecked → block orderów innych vesseli które go ścigały.
    for (const [vid, o] of [...this._byVessel.entries()]) {
      if (o.targetEntityId === vessel.id && o.status === 'active') {
        const pursuer = this._vm.getVessel?.(vid);
        if (pursuer) this._blockAndCancel(pursuer, o, 'target_lost');
      }
    }
  }

  /**
   * Cleanup — przed dismantlem (np. gdy flaga feature→off).
   * Anuluje wszystkie aktywne ordery + odpina eventy.
   */
  destroy() {
    for (const [vid] of this._byVessel) {
      this.cancelOrder(vid, 'feature_disabled');
    }
    this._byVessel.clear();
    EventBus.off('vessel:arrived', this._onArrived);
    EventBus.off('vessel:wrecked', this._onWrecked);
  }
}

// ── Module helpers ─────────────────────────────────────────────────────

/**
 * Max effective weapon range vessela (AU). Uwzględnia tech multipliers
 * (weapon_range_<category> × weapon_range_all) dla player vessela.
 * Wzorowane na DSCS._resolveWeaponRange (zduplikowane, nie importujemy DSCS).
 *
 * Używane przez _issueEngage (gate "no_weapons") i _tickEngageOrder
 * (kiting optimal range).
 *
 * @param {object} vessel
 * @returns {number} max effective range w AU; 0 gdy vessel bez broni.
 */
function _computeMaxWeaponRangeAU(vessel) {
  let maxAU = 0;
  const isPlayer = (vessel.ownerEmpireId == null || vessel.ownerEmpireId === 'player');
  const techSys = window.KOSMOS?.techSystem;
  for (const modId of vessel.modules ?? []) {
    const mod = SHIP_MODULES?.[modId];
    if (!mod?.stats?.rangeAU) continue;
    const category = mod.stats.category ?? mod.stats.range ?? 'medium';
    let mult = 1.0;
    if (isPlayer && techSys?.getMultiplier) {
      mult *= techSys.getMultiplier(`weapon_range_${category}`);
      mult *= techSys.getMultiplier('weapon_range_all');
    }
    const effective = mod.stats.rangeAU * mult;
    if (effective > maxAU) maxAU = effective;
  }
  return maxAU;
}
