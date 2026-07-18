// FleetSystem — rejestr logicznych grup statków gracza (Player Fleet Groups).
//
// P1 (CRUD + UI + save):
//   - createFleet / disbandFleet / setName / setDoctrine
//   - addMember / removeMember (mutuje OBA: fleet.memberIds + vessel.fleetId)
//   - Hook vessel:wrecked → auto-remove; pusta flota z autoDisbandWhenEmpty → disband
//   - serialize / restore
//
// P2 (P2): issueFleetOrder + sync ETA / speed cap dispatch.
// P3 (P3): applyDoctrine + retreat_at_50 tick.
//
// Authoritative źródło członkostwa: fleet.memberIds[].
// vessel.fleetId — reactive mirror, ustawiany TYLKO przez add/removeMember.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import {
  createFleet, serializeFleet, restoreFleet,
  getNextFleetId, setNextFleetId, clampRetreatThreshold,
} from '../entities/Fleet.js';
import { FLEET_DOCTRINES, DEFAULT_DOCTRINE, isValidDoctrine } from '../data/FleetDoctrines.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { isStationId } from '../utils/TransferStore.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;
// Próg auto-dock przy Return to base — gdy vessel dotrze w tej odległości od
// planety docelowej, FleetSystem snap'uje pozycję + ustawia dockedAt. Bez tego
// `moveToPoint` zostawia statek statycznie w punkcie (planeta odlatuje po orbicie).
const RETURN_DOCK_THRESHOLD_AU = 0.5;
// Sanity bound dla fleet_eta — jeśli flota startuje rozproszona (członek 100 AU
// od target) i większość blisko, fleet_eta byłoby dominowane przez outlier.
// Sanity: cap fleet_eta na MAX_SYNC_BOOST_FACTOR × min(native_eta). Empirycznie
// 10× wystarcza — outlier dalej trzyma sync, ale nie zmusza całej floty do
// "stania w miejscu" gdy 1 statek ma absurdalny dystans.
const MAX_SYNC_BOOST_FACTOR = 10;

export class FleetSystem {
  /**
   * @param {VesselManager} vesselManager — referencja do rejestru statków.
   *   Wymagane dla validacji addMember + sync vessel.fleetId.
   */
  constructor(vesselManager) {
    if (!vesselManager) throw new Error('[FleetSystem] vesselManager wymagany');
    this._vm = vesselManager;

    /** @type {Map<string, object>} fleetId → FleetInstance */
    this._fleets = new Map();

    // P3 retreat_at_50 — akumulator civYears (tick co 0.5 civYear).
    this._civYearAccumulator = 0;

    // ── EventBus ──────────────────────────────────────────────────────────
    // Vessel wrecked → auto-remove z floty. Hook na BattleSystem/EAH/AutoRetreat
    // emitters via VesselManager pattern; signal: vessel.isWreck=true.
    // P1 wystarczy listener; per kontrakt nie wymagamy konkretnego payload —
    // czytamy aktualny stan vessel.
    EventBus.on('vessel:wrecked', ({ vesselId }) => {
      if (!vesselId) return;
      this.removeMember(vesselId, 'wrecked');
    });

    // P2 — vessel.movementOrder zakończony/anulowany/zablokowany → usuń entry
    // z fleet.activeOrder.memberOrderIds. Gdy memberOrderIds pusty → emit
    // fleet:orderCompleted, clear activeOrder. Per-vessel orderCancelled
    // może oznaczać player override (issueOrder per-vessel poza flotą) lub
    // failure (target_lost, out_of_range itp.) — w obu przypadkach order
    // floty traci tego członka.
    EventBus.on('vessel:orderCompleted', ({ vesselId, orderId }) => {
      // P2 polish — auto-dock po Return to base. Sprawdź vessel._pendingReturnDock
      // PRZED _onMemberOrderEnded (które może czyścić activeOrder).
      this._maybeAutoDockOnReturn(vesselId);
      this._maybeDockOnArrival(vesselId);   // Slice 8b — rozkaz Dock (hangar) po dotarciu
      this._onMemberOrderEnded(vesselId, orderId, 'completed');
    });
    EventBus.on('vessel:orderCancelled', ({ vesselId, orderId }) => {
      this._onMemberOrderEnded(vesselId, orderId, 'cancelled');
    });
    EventBus.on('vessel:orderBlocked', ({ vesselId, orderId }) => {
      this._onMemberOrderEnded(vesselId, orderId, 'blocked');
    });

    // P3 — retreat_at_50 tick (0.5 civYear accumulator).
    EventBus.on('time:tick', ({ civDeltaYears }) => this._tickCivYears(civDeltaYears));
  }

  // ── P2 — Fleet order dispatch ──────────────────────────────────────────

  /**
   * Wydaj rozkaz całej flocie. Fan-out do MovementOrderSystem per member z:
   *  - Sync ETA dla moveToPoint (wszyscy lądują w tej samej chwili)
   *  - Speed cap dla pursue/intercept/engage (szybsi nie wyprzedzają wolnych)
   *  - applyDoctrine (P3) — w P2 pass-through
   *
   * @param {string} fleetId
   * @param {object} spec — { type, targetEntityId?, targetPoint?, ... } jak MOS
   * @returns {{ ok, accepted: vesselId[], rejected: [{vesselId, reason}], orderType, fleetEta?, speedCap? }}
   */
  issueFleetOrder(fleetId, spec) {
    const fleet = this._fleets.get(fleetId);
    if (!fleet) return { ok: false, reason: 'fleet_not_found', accepted: [], rejected: [] };
    if (!spec || typeof spec.type !== 'string') {
      return { ok: false, reason: 'invalid_spec', accepted: [], rejected: [] };
    }
    if (fleet.memberIds.length === 0) {
      return { ok: false, reason: 'fleet_empty', accepted: [], rejected: [] };
    }
    const mos = window.KOSMOS?.movementOrderSystem;
    if (!mos) return { ok: false, reason: 'mos_not_ready', accepted: [], rejected: [] };

    // Anuluj poprzedni active order floty (jeśli był) — fleet ma tylko 1 active order.
    if (fleet.activeOrder) this.cancelFleetOrder(fleetId, 'replaced');

    // Filtruj eligible members: żywi + nie wraki + istniejący w VM.
    const eligible = [];
    const rejected = [];
    for (const vid of fleet.memberIds) {
      const v = this._vm._vessels?.get?.(vid);
      if (!v) { rejected.push({ vesselId: vid, reason: 'vessel_not_found' }); continue; }
      if (v.isWreck) { rejected.push({ vesselId: vid, reason: 'wrecked' }); continue; }
      eligible.push(v);
    }
    if (eligible.length === 0) {
      return { ok: false, reason: 'no_eligible_members', accepted: [], rejected };
    }

    // applyDoctrine — P3 wypełnia (kite + hold_position).
    const doctrineMod = this.applyDoctrine(fleet, spec);
    // P3 hold_position: doctrineMod może zwrócić { _rejected: true, _reason }.
    // Cały fleet order odrzucony — wszyscy eligible members rejected.
    if (doctrineMod && doctrineMod._rejected) {
      const reason = doctrineMod._reason ?? 'doctrine_rejected';
      for (const v of eligible) rejected.push({ vesselId: v.id, reason });
      return { ok: false, reason, accepted: [], rejected };
    }

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const specBase = { ...doctrineMod, _fromFleet: fleet.id };

    // Liczenie sync / cap zależnie od typu rozkazu.
    let fleetEta = null;
    let speedCap = null;
    let perMemberSpec = null;

    if (spec.type === 'moveToPoint') {
      // Sync ETA — wszyscy lądują w tej samej chwili.
      const target = spec.targetPoint;
      if (!target) return { ok: false, reason: 'no_target_point', accepted: [], rejected };
      let maxEta = 0;
      let minEta = Infinity;
      // Bug P2 fix #1: użyj _calcRoute() dla accurate distance per member
      // (route może mieć waypointy omijania Słońca → totalDist > euclidean).
      // Bez tego fleet_eta z euclidean << naturalArrival per slow vessel,
      // klampowanie nie podciąga sync_year i statki dolatują osobno.
      const useRoute = typeof this._vm?._calcRoute === 'function';
      for (const v of eligible) {
        let dPx;
        if (useRoute) {
          const sysId = v.systemId ?? 'sys_home';
          try {
            const route = this._vm._calcRoute(v.position.x, v.position.y, target.x, target.y, sysId);
            dPx = route?.totalDist ?? Math.hypot(target.x - v.position.x, target.y - v.position.y);
          } catch {
            dPx = Math.hypot(target.x - v.position.x, target.y - v.position.y);
          }
        } else {
          dPx = Math.hypot(target.x - v.position.x, target.y - v.position.y);
        }
        const dAU = dPx / AU_TO_PX;
        const speedAU = Math.max(0.01, v.speedAU ?? 1.0);
        const eta = dAU / speedAU;
        if (eta > maxEta) maxEta = eta;
        if (eta < minEta) minEta = eta;
      }
      // Sanity bound — outlier 10× najszybszy nie wpływa absurdalnie.
      const cappedEta = Math.min(maxEta, Math.max(0.001, minEta) * MAX_SYNC_BOOST_FACTOR);
      fleetEta = cappedEta;
      // _arrivalSyncYear jest jeden dla wszystkich → MOS._issueMoveToPoint klampuje
      // self per vessel (max(syncYear, naturalArrival)). Outlier vessel poleci na max
      // speed, reszta dostosuje się przez interpolacje liniowa start→target.
      perMemberSpec = { ...specBase, _arrivalSyncYear: gameYear + fleetEta };
    } else if (spec.type === 'pursue' || spec.type === 'intercept' || spec.type === 'engage') {
      // Speed cap — szybsi nie wyprzedzają najwolniejszego.
      let minSpeed = Infinity;
      for (const v of eligible) {
        const s = v.speedAU ?? 1.0;
        if (s < minSpeed) minSpeed = s;
      }
      if (minSpeed === Infinity) minSpeed = 1.0;
      speedCap = minSpeed;
      perMemberSpec = { ...specBase, _speedCapAU: speedCap };
    } else {
      // Inne typy (patrol/escort/goToPOI/retreat) — bez sync mechaniki, plain fan-out.
      perMemberSpec = { ...specBase };
    }

    // Fan-out per member.
    const accepted = [];
    const memberOrderIds = {};
    for (const v of eligible) {
      const res = mos.issueOrder(v.id, { ...perMemberSpec }, { fromFleet: fleet.id });
      if (res?.ok && res.orderId) {
        accepted.push(v.id);
        memberOrderIds[v.id] = res.orderId;
      } else {
        rejected.push({ vesselId: v.id, reason: res?.reason ?? 'unknown' });
      }
    }

    // Debug trace — gated przez KOSMOS.debug.enableTargetingTrace flag (P2 polish).
    // Pomaga diagnozować sync ETA / speed cap problemy w grze.
    if (window.KOSMOS?.debug?.enableTargetingTrace) {
      console.log(`[FleetSystem] issueFleetOrder ${fleet.id} type=${spec.type} acc=${accepted.length} rej=${rejected.length} fleetEta=${fleetEta?.toFixed(2)} speedCap=${speedCap?.toFixed(2)}`);
      if (rejected.length > 0) {
        for (const r of rejected) console.log(`  rejected ${r.vesselId}: ${r.reason}`);
      }
    }

    // Active order floty — tracking całości; zerujemy gdy wszyscy ended.
    if (accepted.length > 0) {
      fleet.activeOrder = {
        type:           spec.type,
        targetEntityId: spec.targetEntityId ?? null,
        targetPoint:    spec.targetPoint ?? null,
        issuedYear:     gameYear,
        arrivalSyncYear: (typeof fleetEta === 'number') ? (gameYear + fleetEta) : null,
        speedCapAU:     speedCap,
        memberOrderIds,
        _retreatTriggered: false,
        _inCombat:         false,
      };
      EventBus.emit('fleet:orderIssued', {
        fleetId, type: spec.type, accepted: [...accepted], rejected: [...rejected],
        fleetEta, speedCap,
      });
    }

    return { ok: accepted.length > 0, accepted, rejected, orderType: spec.type, fleetEta, speedCap };
  }

  /**
   * Anuluj aktywny order floty. Wywołuje MOS.cancelOrder per member; clear activeOrder.
   */
  cancelFleetOrder(fleetId, reason = 'manual') {
    const fleet = this._fleets.get(fleetId);
    if (!fleet || !fleet.activeOrder) return false;
    const mos = window.KOSMOS?.movementOrderSystem;
    for (const [vesselId] of Object.entries(fleet.activeOrder.memberOrderIds ?? {})) {
      mos?.cancelOrder?.(vesselId, reason);
    }
    fleet.activeOrder = null;
    EventBus.emit('fleet:orderCancelled', { fleetId, reason });
    return true;
  }

  /**
   * Doktryna — modyfikuje fleet order spec wg fleet.doctrine.
   *  - engage_in_range: pass-through (default)
   *  - kite: dla 'engage' set preferMaxRange=true (MOS _tickEngageOrder
   *    używa optimalFactor 0.98 zamiast 0.95 — vessel trzyma się bliżej max range)
   *  - hold_position: dla 'pursue/intercept/engage' → zwraca {_rejected:true, _reason}
   *    (vessel nadal broni się reaktywnie przez DSCS na proximityEnter — to JEST
   *    "trzymaj pozycję", nie "nie strzelaj")
   *  - retreat_at_50: flag-only (tick agreguje HP osobno w _tickCivYears)
   *
   * NIE waliduje typu — invalid doctrine fallback to engage_in_range (pass).
   */
  applyDoctrine(fleet, spec) {
    const doctrine = fleet?.doctrine ?? 'engage_in_range';
    if (doctrine === 'engage_in_range') return spec;
    if (doctrine === 'kite') {
      if (spec.type === 'engage') {
        return { ...spec, preferMaxRange: true };
      }
      return spec;
    }
    if (doctrine === 'hold_position') {
      if (spec.type === 'pursue' || spec.type === 'intercept' || spec.type === 'engage') {
        return { _rejected: true, _reason: 'doctrine_hold_position' };
      }
      return spec;
    }
    // retreat_at_50 — bez modyfikacji spec; tick handluje
    return spec;
  }

  /**
   * Hook na vessel:orderCompleted/Cancelled/Blocked — usuwa entry z fleet.activeOrder.
   * Gdy memberOrderIds pusty → fleet:orderCompleted + clear activeOrder.
   * @private
   */
  _onMemberOrderEnded(vesselId, orderId, mode) {
    for (const fleet of this._fleets.values()) {
      const ao = fleet.activeOrder;
      if (!ao?.memberOrderIds) continue;
      const tracked = ao.memberOrderIds[vesselId];
      if (!tracked) continue;
      // Mismatch orderId → vessel dostał nowy order między (player override) →
      // usuwamy go z tracking ale nie kończymy aktywnego orderu floty.
      if (tracked !== orderId) {
        delete ao.memberOrderIds[vesselId];
        continue;
      }
      delete ao.memberOrderIds[vesselId];
      if (Object.keys(ao.memberOrderIds).length === 0) {
        // Wszyscy members done — finalize order floty.
        const completedType = ao.type;
        fleet.activeOrder = null;
        EventBus.emit('fleet:orderCompleted', { fleetId: fleet.id, type: completedType, mode });
      }
      return; // vessel jest w max 1 flocie → przerwij po pierwszej match
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────

  /**
   * Stwórz nową flotę.
   * @param {string} name
   * @param {object} [opts] — { doctrine?, createdYear? }
   * @returns {object} fleet
   */
  createFleet(name, opts = {}) {
    const fleet = createFleet({
      name,
      doctrine:    opts.doctrine ?? DEFAULT_DOCTRINE,
      createdYear: opts.createdYear ?? this._currentYear(),
    });
    this._fleets.set(fleet.id, fleet);
    EventBus.emit('fleet:created', { fleet });
    return fleet;
  }

  /**
   * Rozwiąż flotę. Czyści vessel.fleetId u wszystkich członków.
   * @param {string} fleetId
   * @param {string} [reason='manual'] — 'manual' | 'empty' (auto-disband)
   * @returns {boolean}
   */
  disbandFleet(fleetId, reason = 'manual') {
    const fleet = this._fleets.get(fleetId);
    if (!fleet) return false;
    // Wyczyść vessel.fleetId u wszystkich członków
    for (const vesselId of [...fleet.memberIds]) {
      const v = this._vm._vessels?.get?.(vesselId);
      if (v && v.fleetId === fleetId) v.fleetId = null;
    }
    fleet.memberIds = [];
    this._fleets.delete(fleetId);
    EventBus.emit('fleet:disbanded', { fleetId, reason });
    return true;
  }

  /**
   * Zmień nazwę floty.
   */
  setName(fleetId, name) {
    const fleet = this._fleets.get(fleetId);
    if (!fleet || typeof name !== 'string' || !name.trim()) return false;
    const oldName = fleet.name;
    fleet.name = name.trim();
    EventBus.emit('fleet:renamed', { fleetId, oldName, newName: fleet.name });
    return true;
  }

  /**
   * Zmień doktrynę floty. P1: zapis tylko (UI dropdown).
   * P3 wypełnia efekty w applyDoctrine + retreat tick.
   */
  setDoctrine(fleetId, doctrine) {
    const fleet = this._fleets.get(fleetId);
    if (!fleet || !isValidDoctrine(doctrine)) return false;
    const oldDoctrine = fleet.doctrine;
    if (oldDoctrine === doctrine) return true;
    fleet.doctrine = doctrine;
    EventBus.emit('fleet:doctrineChanged', { fleetId, oldDoctrine, newDoctrine: doctrine });
    return true;
  }

  /**
   * Ustaw próg auto-wycofania (0.05–0.95) — używany przez doctrine='retreat_at_50'.
   * Clamp do zakresu. Brak efektu jeśli wartość niezmieniona.
   */
  setRetreatThreshold(fleetId, threshold) {
    const fleet = this._fleets.get(fleetId);
    if (!fleet) return false;
    const clamped = clampRetreatThreshold(threshold);
    const oldThr = fleet.retreatThreshold ?? 0.5;
    if (Math.abs(clamped - oldThr) < 0.001) return true;
    fleet.retreatThreshold = clamped;
    EventBus.emit('fleet:retreatThresholdChanged', {
      fleetId, oldThreshold: oldThr, newThreshold: clamped,
    });
    return true;
  }

  /**
   * Dodaj statek do floty. Idempotent — duplicate addMember zwraca ok=true bez
   * efektu. Jeśli statek jest w innej flocie — automatyczne removeMember najpierw
   * (transfer). Wrak nie może wejść do floty.
   * @returns {{ ok: boolean, reason?: string }}
   */
  addMember(fleetId, vesselId) {
    const fleet = this._fleets.get(fleetId);
    if (!fleet) return { ok: false, reason: 'fleet_not_found' };
    const vessel = this._vm._vessels?.get?.(vesselId);
    if (!vessel) return { ok: false, reason: 'vessel_not_found' };
    if (vessel.isWreck) return { ok: false, reason: 'wrecked' };
    // Statki gracza tylko — w MVP enemy ships nie wchodzą do player fleets.
    if (vessel.ownerEmpireId && vessel.ownerEmpireId !== 'player') {
      return { ok: false, reason: 'not_player_vessel' };
    }
    // Już w tej flocie — idempotent no-op
    if (vessel.fleetId === fleetId) return { ok: true };
    // W innej flocie — transfer (auto-remove z poprzedniej)
    if (vessel.fleetId) {
      this.removeMember(vesselId, 'transferred');
    }
    fleet.memberIds.push(vesselId);
    vessel.fleetId = fleetId;
    EventBus.emit('fleet:memberAdded', { fleetId, vesselId });
    return { ok: true };
  }

  /**
   * Usuń statek z floty. Czyści vessel.fleetId. Jeśli flota stała się pusta
   * i ma autoDisbandWhenEmpty=true → wywołuje disbandFleet(reason='empty').
   * @returns {boolean} true gdy faktycznie usunięto
   */
  removeMember(vesselId, reason = 'manual') {
    const vessel = this._vm._vessels?.get?.(vesselId);
    const fleetId = vessel?.fleetId ?? this._findFleetByMember(vesselId);
    if (!fleetId) return false;
    const fleet = this._fleets.get(fleetId);
    if (!fleet) return false;
    const idx = fleet.memberIds.indexOf(vesselId);
    if (idx === -1) return false;
    fleet.memberIds.splice(idx, 1);
    if (vessel) vessel.fleetId = null;
    EventBus.emit('fleet:memberRemoved', { fleetId, vesselId, reason });
    // Auto-disband empty fleet (jeśli flaga ustawiona; default true)
    if (fleet.memberIds.length === 0 && fleet.autoDisbandWhenEmpty) {
      this.disbandFleet(fleetId, 'empty');
    }
    return true;
  }

  // ── Lookup ─────────────────────────────────────────────────────────────

  getFleet(fleetId) {
    return this._fleets.get(fleetId) ?? null;
  }

  listFleets() {
    return [...this._fleets.values()];
  }

  /**
   * Zwróć flotę zawierającą dany statek. Preferuje vessel.fleetId (O(1));
   * fallback to scan memberIds gdy vessel niedostępny (np. wrak).
   */
  getVesselFleet(vesselId) {
    const vessel = this._vm._vessels?.get?.(vesselId);
    if (vessel?.fleetId) return this._fleets.get(vessel.fleetId) ?? null;
    const fleetId = this._findFleetByMember(vesselId);
    return fleetId ? this._fleets.get(fleetId) : null;
  }

  // ── Serialize / restore ────────────────────────────────────────────────

  serialize() {
    const fleets = [];
    for (const f of this._fleets.values()) {
      const s = serializeFleet(f);
      if (s) fleets.push(s);
    }
    return {
      fleets,
      nextId: getNextFleetId(),
    };
  }

  /**
   * Restore z save data. Wymaga że vesselManager jest już zrestorowany —
   * walidujemy memberIds, droppujemy nieistniejących, re-ustawiamy vessel.fleetId.
   */
  restore(data) {
    if (!data) return;
    this._fleets.clear();
    setNextFleetId(data.nextId ?? 1);
    for (const fd of (data.fleets ?? [])) {
      const f = restoreFleet(fd);
      if (!f) continue;
      // Walidacja członków — drop orphans (vessel skasowany między save'ami)
      const validMembers = [];
      for (const vid of f.memberIds) {
        const v = this._vm._vessels?.get?.(vid);
        if (!v) continue;            // orphan, drop
        if (v.isWreck) continue;     // wrak nie powinien być w flocie
        validMembers.push(vid);
        v.fleetId = f.id;            // re-ustaw reactive mirror
      }
      f.memberIds = validMembers;
      // Walidacja activeOrder.memberOrderIds (P2+): drop entries których orderId nie istnieje
      if (f.activeOrder?.memberOrderIds) {
        const mos = window.KOSMOS?.movementOrderSystem;
        for (const [vid, orderId] of Object.entries(f.activeOrder.memberOrderIds)) {
          const order = mos?.getOrder?.(vid);
          if (!order || order.id !== orderId) {
            delete f.activeOrder.memberOrderIds[vid];
          }
        }
        if (Object.keys(f.activeOrder.memberOrderIds).length === 0) {
          f.activeOrder = null;
        }
      }
      // Auto-disband empty restored fleet (np. wszyscy członkowie zniknęli między save'ami)
      if (f.memberIds.length === 0 && f.autoDisbandWhenEmpty) {
        // Skip — nie dodawaj do rejestru
        continue;
      }
      this._fleets.set(f.id, f);
    }
  }

  // ── P3 retreat_at_50 tick ──────────────────────────────────────────────

  /**
   * Tick co 0.5 civYear: iteruj floty z doctrine='retreat_at_50', sprawdź
   * czy którykolwiek member jest w DSCS encounter (derived _inCombat —
   * nie subscribe noise), agreguj HP, gdy <threshold → trigger retreat.
   *
   * Retreat: każdy żywy member dostaje moveToPoint do nearest friendly
   * planet via AutoRetreatSystem._findNearestFriendlyPlanet + bypass fuel
   * check + _pendingReturnDock marker (auto-dock przy dotarciu).
   *
   * Idempotent przez fleet.activeOrder._retreatTriggered flag.
   *
   * @private
   */
  _tickCivYears(civDy) {
    this._civYearAccumulator += civDy ?? 0;
    if (this._civYearAccumulator < 0.5) return;
    this._civYearAccumulator = 0;

    const dscs = window.KOSMOS?.deepSpaceCombatSystem;
    if (!dscs?._activeEncounters) return;

    for (const fleet of this._fleets.values()) {
      if (fleet.doctrine !== 'retreat_at_50') continue;
      const ao = fleet.activeOrder;
      if (!ao || ao._retreatTriggered) continue;

      // Derived _inCombat — szukamy encountera zawierającego dowolnego membera.
      // Zachowujemy też flag w activeOrder dla debug/diagnostyki.
      let hpSum = 0, hpStartSum = 0, anyInCombat = false;
      for (const vid of fleet.memberIds) {
        const enc = this._findEncounterFor(vid, dscs);
        if (!enc) continue;
        const state = enc.vesselStates?.get?.(vid);
        if (!state) continue;
        anyInCombat = true;
        hpSum      += state.hp      ?? 0;
        hpStartSum += state.hpStart ?? state.hp ?? 0;
      }
      ao._inCombat = anyInCombat;
      if (!anyInCombat || hpStartSum === 0) continue;

      const pct = hpSum / hpStartSum;
      const threshold = (typeof fleet.retreatThreshold === 'number')
        ? fleet.retreatThreshold : 0.5;
      if (pct >= threshold) continue;

      // Trigger retreat — moveToPoint do nearest friendly per member.
      ao._retreatTriggered = true;
      const ar  = window.KOSMOS?.autoRetreatSystem;
      const mos = window.KOSMOS?.movementOrderSystem;
      const issuedIds = [];
      for (const vid of fleet.memberIds) {
        const v = this._vm._vessels?.get?.(vid);
        if (!v || v.isWreck) continue;
        const nearest = ar?._findNearestFriendlyPlanet?.(v);
        if (!nearest?.planet) continue;
        v._pendingReturnDock = nearest.planet.id;
        const res = mos?.issueOrder?.(vid, {
          type: 'moveToPoint',
          targetPoint: { x: nearest.planet.x, y: nearest.planet.y },
          bypassFuelCheck: true,
          bypassSpaceportCheck: true,
        }, { fromFleet: fleet.id });
        if (res?.ok) issuedIds.push(vid);
      }
      EventBus.emit('fleet:retreatTriggered', {
        fleetId:        fleet.id,
        aggregateHpPct: pct,
        threshold,
        memberCount:    fleet.memberIds.length,
        retreatedIds:   issuedIds,
      });
    }
  }

  /**
   * Znajdź encounter zawierający dany vessel.
   * @private
   */
  _findEncounterFor(vesselId, dscs) {
    if (!dscs?._activeEncounters) return null;
    for (const enc of dscs._activeEncounters.values()) {
      if (enc?.isActive && enc.vesselStates?.has?.(vesselId)) return enc;
    }
    return null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Liniowe skanowanie — używane wyłącznie gdy vessel.fleetId niedostępne. */
  _findFleetByMember(vesselId) {
    for (const f of this._fleets.values()) {
      if (f.memberIds.includes(vesselId)) return f.id;
    }
    return null;
  }

  /** Aktualny gameYear dla createdYear stamping. */
  _currentYear() {
    // TimeSystem trzyma bieżący rok w `gameTime` (pole `currentYear` nie istnieje —
    // stary odczyt zwracał zawsze 0 i zerował createdYear nowych flot).
    return window.KOSMOS?.timeSystem?.gameTime ?? 0;
  }

  // ── P2 polish — auto-dock przy Return to base ──────────────────────────
  // _handleFleetReturnBase w FleetManagerOverlay ustawia vessel._pendingReturnDock
  // = planetId PRZED issueFleetOrder. Po vessel:orderCompleted bezwarunkowo
  // snapuje pozycję do AKTUALNEJ pozycji planety + dockedAt=planetId.
  //
  // Polish 2 (2026-05-20): usunięty threshold check. Planeta porusza się na orbicie,
  // więc w momencie arrival vessel zwykle JEST daleko od pozycji planety (statyczny
  // targetPoint z momentu issue). UX: gracz oczekuje że "Powrót do bazy" zawsze
  // dock'uje. Snap to teleport, akceptowalny convenience w 4X grze.
  _maybeAutoDockOnReturn(vesselId) {
    const v = this._vm._vessels?.get?.(vesselId);
    if (!v || !v._pendingReturnDock) return;
    const planetId = v._pendingReturnDock;
    delete v._pendingReturnDock;  // jednorazowy flag
    const planet = EntityManager.get(planetId);
    if (!planet) return;
    // Snap do AKTUALNEJ pozycji planety (uwzględnia orbit movement during travel).
    v.position.x = planet.x;
    v.position.y = planet.y;
    v.position.state = 'orbiting';
    v.position.dockedAt = planetId;
    v.colonyId = planetId;
    v.mission = null;
    v.status = 'idle';
    // FIX (live-gate r3): vessel:arrived (NIE vessel:docked) — statek ZOSTAJE 'orbiting' przy bazie.
    // vessel:docked → OrbitalSpaceSystem.releaseOrbit + ThreeRenderer usuwał sprite, a state='orbiting'
    // → statek bez orbity w rejestrze → _tickOrbitingVessels go pomijał → sprite ZAMROŻONY (planeta
    // odlatuje, na tactical/mechanice orbituje, w 3D stoi). vessel:arrived → OrbitalSpaceSystem
    // assignOrbit → _tickOrbitingVessels śledzi planetę w 3D. Wzór: VesselManager recon-abort
    // (~2713 „sprite w 3D będzie żyć"). Player vessel + dockedAt set → pozostali słuchacze no-op.
    EventBus.emit('vessel:arrived', { vessel: v, mission: null });
    EventBus.emit('vessel:positionUpdate', { vessels: [v] });
  }

  // ── Slice 8b — auto-dock przy rozkazie Dock (hangar) ───────────────────────
  // MovementOrderSystem._issueDock ustawia vessel._pendingDock=bodyId PRZED moveToPoint.
  // Po vessel:orderCompleted dokujemy przez dockAtColony (spaceport gate: port→hangar,
  // brak portu→orbita). Gdy wynik=orbita, rejestrujemy orbitę (vessel:arrived) by sprite 3D
  // nie zamarzł (dockAtColony emituje vessel:orbiting, NIE arrived — jak w runda 4 root-cause).
  _maybeDockOnArrival(vesselId) {
    const v = this._vm._vessels?.get?.(vesselId);
    if (!v || !v._pendingDock) return;
    const bodyId = v._pendingDock;
    delete v._pendingDock;   // jednorazowy flag
    // Stacja orbitalna → dockAtStation: statek CHOWA SIĘ w stacji (hangar, sprite usuwany — Filip:
    // „schować się w niej, nie orbitować"). Fallback gdy dock się nie powiódł → orbituj stację
    // WIDOCZNIE (śledzona w _tickOrbitingVessels), żeby sprite nie zamarzł.
    if (isStationId(bodyId)) {
      this._vm.dockAtStation?.(vesselId, bodyId);
      if (v.position?.state !== 'docked') {
        if (!v.position.dockedAt) v.position.dockedAt = bodyId;
        EventBus.emit('vessel:arrived', { vessel: v, mission: null });
        EventBus.emit('vessel:positionUpdate', { vessels: [v] });
      }
      return;
    }
    // Planeta — dockAtColony (port-gate: port→hangar, brak portu→orbita widoczna).
    this._vm.dockAtColony?.(vesselId, bodyId);
    if (v.position?.state === 'orbiting') {   // no-port fallback → zarejestruj orbitę w 3D
      // dockAtColony (gałąź no-port) ZEROWAŁ dockedAt → OrbitalSpaceSystem.vessel:arrived czyta
      // `dockedAt ?? mission.targetId` = null → orbita NIE rejestrowana → sprite zamarza („stoi na
      // orbicie i nic więcej"). Przywróć dockedAt=bodyId by orbita się zarejestrowała (statek śledzi ciało).
      if (!v.position.dockedAt) v.position.dockedAt = bodyId;
      EventBus.emit('vessel:arrived', { vessel: v, mission: null });
      EventBus.emit('vessel:positionUpdate', { vessels: [v] });
    }
  }
}
