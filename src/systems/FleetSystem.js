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
import {
  createFleet, serializeFleet, restoreFleet,
  getNextFleetId, setNextFleetId,
} from '../entities/Fleet.js';
import { FLEET_DOCTRINES, DEFAULT_DOCTRINE, isValidDoctrine } from '../data/FleetDoctrines.js';

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
}
