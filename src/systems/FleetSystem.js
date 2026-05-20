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
  getNextFleetId, setNextFleetId,
} from '../entities/Fleet.js';
import { FLEET_DOCTRINES, DEFAULT_DOCTRINE, isValidDoctrine } from '../data/FleetDoctrines.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';

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
      this._onMemberOrderEnded(vesselId, orderId, 'completed');
    });
    EventBus.on('vessel:orderCancelled', ({ vesselId, orderId }) => {
      this._onMemberOrderEnded(vesselId, orderId, 'cancelled');
    });
    EventBus.on('vessel:orderBlocked', ({ vesselId, orderId }) => {
      this._onMemberOrderEnded(vesselId, orderId, 'blocked');
    });
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

    // applyDoctrine — P2 stub (pass-through); P3 wypełnia.
    const doctrineMod = this.applyDoctrine(fleet, spec);
    // doctrineMod może zwrócić { rejected: true, reason } dla wszystkich (np. hold_position
    // blokuje pursue) — w P2 doctrineMod === spec (pass-through), więc skip tego case'u.

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
   * Doktryna — P2 pass-through. P3 wypełnia:
   *  - engage_in_range: pass
   *  - kite: dla 'engage' set preferMaxRange=true
   *  - hold_position: dla 'pursue/intercept/engage' → reject (P3 zwraca {rejected:true})
   *  - retreat_at_50: flag only (tick agreguje HP osobno)
   */
  applyDoctrine(_fleet, spec) {
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
    return window.KOSMOS?.timeSystem?.currentYear ?? 0;
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
    EventBus.emit('vessel:docked', { vessel: v });
  }
}
