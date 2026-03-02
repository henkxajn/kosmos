// VesselManager — centralny system zarządzania flotą statków
//
// Odpowiedzialności:
//   - Rejestr wszystkich statków (Map: id → VesselInstance)
//   - Tworzenie instancji przy ukończeniu budowy w Stoczni
//   - Śledzenie pozycji i update co tick (interpolacja w tranzycie)
//   - Zarządzanie paliwem (automatyczne tankowanie w hangarze)
//   - Serializacja / restore
//
// Komunikacja (EventBus):
//   Nasłuchuje:
//     fleet:shipCompleted   → _onShipCompleted()
//     time:tick             → _tick()
//     vessel:sendMission    → _dispatchMission()
//     vessel:rename         → _renameVessel()
//   Emituje:
//     vessel:created        → { vessel }
//     vessel:launched       → { vessel, mission }
//     vessel:arrived        → { vessel, mission }
//     vessel:returning      → { vessel }
//     vessel:docked         → { vessel }
//     vessel:refueled       → { vessel }
//     vessel:positionUpdate → { vessels[] } (batch, co tick)

import EventBus       from '../core/EventBus.js';
import EntityManager  from '../core/EntityManager.js';
import { SHIPS }      from '../data/ShipsData.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import {
  createVessel, effectiveRange, canReach, consumeFuel, refuel,
  needsRefuel, getShipDef, setNextVesselId, getNextVesselId,
} from '../entities/Vessel.js';
import {
  serializeNameCounters, restoreNameCounters,
} from '../data/VesselNames.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX; // 110

// Tankowanie: ile power_cells/rok docked vessel ładuje (z energii kolonii)
const REFUEL_RATE = 2; // pc/rok
// Koszt energetyczny: ile energy z inventory kolonii za 1 power_cell
const ENERGY_PER_PC = 5;

export class VesselManager {
  constructor() {
    /** @type {Map<string, object>} vesselId → VesselInstance */
    this._vessels = new Map();

    // ── EventBus ──────────────────────────────────────────────────
    EventBus.on('fleet:shipCompleted', ({ planetId, shipId }) =>
      this._onShipCompleted(planetId, shipId));

    EventBus.on('time:tick', ({ deltaYears }) =>
      this._tick(deltaYears));

    EventBus.on('vessel:rename', ({ vesselId, name }) =>
      this._renameVessel(vesselId, name));
  }

  // ── API publiczne ─────────────────────────────────────────────────────────

  /**
   * Stwórz nowy statek i zarejestruj w rejestrze.
   * @param {string} shipId — typ z ShipsData
   * @param {string} colonyId — id kolonii macierzystej
   * @param {object} [opts] — opcje (name, x, y, fuel)
   * @returns {object} VesselInstance
   */
  createAndRegister(shipId, colonyId, opts = {}) {
    // Pobierz pozycję kolonii macierzystej
    const entity = this._findEntity(colonyId);
    const x = opts.x ?? (entity?.x ?? 0);
    const y = opts.y ?? (entity?.y ?? 0);

    const vessel = createVessel(shipId, colonyId, { ...opts, x, y });
    this._vessels.set(vessel.id, vessel);

    EventBus.emit('vessel:created', { vessel });
    return vessel;
  }

  /**
   * Pobierz statek po ID.
   */
  getVessel(vesselId) {
    return this._vessels.get(vesselId) ?? null;
  }

  /**
   * Wszystkie statki zadokowane w danej kolonii.
   */
  getVesselsAt(colonyId) {
    const result = [];
    for (const v of this._vessels.values()) {
      if (v.position.dockedAt === colonyId && v.position.state === 'docked') {
        result.push(v);
      }
    }
    return result;
  }

  /**
   * Statki dostępne do misji (docked + idle + wystarczające paliwo opcjonalnie).
   * @param {string} colonyId
   * @param {string} [shipId] — filtruj po typie statku
   * @returns {object[]} VesselInstance[]
   */
  getAvailable(colonyId, shipId = null) {
    const docked = this.getVesselsAt(colonyId);
    return docked.filter(v => {
      if (v.status !== 'idle') return false;
      if (shipId && v.shipId !== shipId) return false;
      return true;
    });
  }

  /**
   * Pierwszy dostępny statek danego typu w kolonii.
   */
  getFirstAvailable(colonyId, shipId) {
    return this.getAvailable(colonyId, shipId)[0] ?? null;
  }

  /**
   * Czy kolonia ma statek danego typu (idle, docked)?
   */
  hasAvailableShip(colonyId, shipId) {
    return this.getAvailable(colonyId, shipId).length > 0;
  }

  /**
   * Wszystkie statki w tranzycie.
   */
  getInTransit() {
    const result = [];
    for (const v of this._vessels.values()) {
      if (v.position.state === 'in_transit') result.push(v);
    }
    return result;
  }

  /**
   * Wszystkie statki (do UI listy floty itp.).
   */
  getAllVessels() {
    return [...this._vessels.values()];
  }

  /**
   * Wyślij statek na misję — zmienia status, pozycję, zużywa paliwo.
   * @param {string} vesselId
   * @param {object} mission — { type, targetId, departYear, arrivalYear, returnYear, cargo, ... }
   * @returns {boolean} sukces
   */
  dispatchOnMission(vesselId, mission) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return false;
    if (vessel.status !== 'idle' || vessel.position.state !== 'docked') return false;

    // Pobierz pozycje start i cel
    const startEntity = this._findEntity(vessel.position.dockedAt);
    const targetEntity = this._findEntity(mission.targetId);

    vessel.mission = {
      ...mission,
      startX: startEntity?.x ?? vessel.position.x,
      startY: startEntity?.y ?? vessel.position.y,
      targetX: targetEntity?.x ?? 0,
      targetY: targetEntity?.y ?? 0,
    };

    // Zużyj paliwo (dystans w jedną stronę)
    if (mission.fuelCost != null) {
      vessel.fuel.current = Math.max(0, vessel.fuel.current - mission.fuelCost);
    }

    vessel.status = 'on_mission';
    vessel.position.state = 'in_transit';
    vessel.position.dockedAt = null;

    EventBus.emit('vessel:launched', { vessel, mission: vessel.mission });
    return true;
  }

  /**
   * Statek dotarł do celu — wywołaj z ExpeditionSystem.
   */
  arriveAtTarget(vesselId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel || !vessel.mission) return;

    vessel.position.state = 'orbiting';
    vessel.position.dockedAt = vessel.mission.targetId;
    vessel.position.x = vessel.mission.targetX;
    vessel.position.y = vessel.mission.targetY;

    EventBus.emit('vessel:arrived', { vessel, mission: vessel.mission });
  }

  /**
   * Statek wyrusza w powrotną drogę.
   */
  startReturn(vesselId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel || !vessel.mission) return;

    // Zamień start↔target na powrót
    const m = vessel.mission;
    m.returnStartX = vessel.position.x;
    m.returnStartY = vessel.position.y;
    m.returnTargetX = m.startX;
    m.returnTargetY = m.startY;
    m.phase = 'returning';

    vessel.position.state = 'in_transit';
    vessel.position.dockedAt = null;

    EventBus.emit('vessel:returning', { vessel });
  }

  /**
   * Statek powrócił do bazy.
   */
  dockAtColony(vesselId, colonyId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return;

    const entity = this._findEntity(colonyId ?? vessel.colonyId);
    vessel.position.state = 'docked';
    vessel.position.dockedAt = colonyId ?? vessel.colonyId;
    vessel.position.x = entity?.x ?? 0;
    vessel.position.y = entity?.y ?? 0;
    vessel.status = 'idle';
    vessel.mission = null;
    vessel.experience += 1;

    EventBus.emit('vessel:docked', { vessel });
  }

  /**
   * Oznacz statek jako zużyty/zniszczony (colony_ship, katastrofa).
   * Usuwa z rejestru + z colony.fleet.
   */
  destroyVessel(vesselId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return;

    // Usuń z colony.fleet
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(vessel.colonyId);
    if (colony) {
      const idx = colony.fleet.indexOf(vesselId);
      if (idx !== -1) colony.fleet.splice(idx, 1);
    }

    this._vessels.delete(vesselId);

    // Usuń sprite z renderera
    EventBus.emit('vessel:docked', { vessel }); // reuse — usunie sprite
  }

  /**
   * Zmień nazwę statku.
   */
  _renameVessel(vesselId, name) {
    const vessel = this._vessels.get(vesselId);
    if (vessel && name) {
      vessel.name = name;
    }
  }

  // ── Serializacja ─────────────────────────────────────────────────────────

  serialize() {
    const vessels = [];
    for (const v of this._vessels.values()) {
      vessels.push({
        id:         v.id,
        shipId:     v.shipId,
        name:       v.name,
        colonyId:   v.colonyId,
        position:   { ...v.position },
        fuel:       { ...v.fuel },
        mission:    v.mission ? { ...v.mission } : null,
        status:     v.status,
        experience: v.experience,
      });
    }
    return {
      vessels,
      nextId:       getNextVesselId(),
      nameCounters: serializeNameCounters(),
    };
  }

  restore(data) {
    if (!data) return;

    this._vessels.clear();
    setNextVesselId(data.nextId ?? 1);
    restoreNameCounters(data.nameCounters ?? null);

    for (const vd of (data.vessels ?? [])) {
      const vessel = {
        id:         vd.id,
        shipId:     vd.shipId,
        name:       vd.name,
        colonyId:   vd.colonyId,
        position:   { ...vd.position },
        fuel:       { ...vd.fuel },
        mission:    vd.mission ? { ...vd.mission } : null,
        status:     vd.status ?? 'idle',
        experience: vd.experience ?? 0,
      };
      this._vessels.set(vessel.id, vessel);
    }
  }

  /**
   * Migracja: stary save (colony.fleet = ['science_vessel', ...])
   *   → utwórz vessel instances dla każdego stringa.
   * Zwraca tablicę nowych vessel IDs (do zastąpienia w colony.fleet).
   */
  migrateStringFleet(fleet, colonyId) {
    if (!Array.isArray(fleet)) return [];
    const newIds = [];
    for (const item of fleet) {
      if (typeof item === 'string' && SHIPS[item]) {
        // Stary format — string type
        const vessel = this.createAndRegister(item, colonyId);
        newIds.push(vessel.id);
      } else if (typeof item === 'string' && item.startsWith('v_')) {
        // Nowy format — vessel ID (już zmigrowany)
        newIds.push(item);
      }
    }
    return newIds;
  }

  // ── Prywatne ─────────────────────────────────────────────────────────────

  /**
   * Statek ukończony w Stoczni — stwórz vessel instance.
   */
  _onShipCompleted(planetId, shipId) {
    const vessel = this.createAndRegister(shipId, planetId);
    // Dodaj vessel ID do colony.fleet (przez ColonyManager)
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(planetId);
    if (colony) {
      colony.fleet.push(vessel.id);
    }
  }

  /**
   * Tick gry — tankowanie + interpolacja pozycji.
   */
  _tick(deltaYears) {
    this._tickRefueling(deltaYears);
    this._updatePositions(deltaYears);
  }

  /**
   * Automatyczne tankowanie docked vessels z energii kolonii.
   */
  _tickRefueling(deltaYears) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;

    for (const vessel of this._vessels.values()) {
      if (vessel.position.state !== 'docked') continue;
      if (!needsRefuel(vessel)) {
        if (vessel.status === 'refueling') vessel.status = 'idle';
        continue;
      }

      // Pobierz inventory kolonii
      const colony = colMgr.getColony(vessel.position.dockedAt);
      if (!colony) continue;
      const inv = colony.resourceSystem?.inventory;
      if (!inv) continue;

      // Sprawdź power_cells w inventory — użyj bezpośrednio
      const pcAvailable = inv.get('power_cells') ?? 0;
      if (pcAvailable <= 0) {
        // Brak power_cells — status refueling ale nie może ładować
        if (vessel.status === 'idle') vessel.status = 'refueling';
        continue;
      }

      // Ile chcemy zatankować w tym ticku
      const wantPC = REFUEL_RATE * deltaYears;
      const canPC = Math.min(wantPC, pcAvailable, vessel.fuel.max - vessel.fuel.current);

      if (canPC > 0) {
        // Pobierz power_cells z inventory
        colony.resourceSystem.spend({ power_cells: canPC });
        refuel(vessel, canPC);
        vessel.status = needsRefuel(vessel) ? 'refueling' : 'idle';
      }
    }
  }

  /**
   * Interpolacja pozycji statków w tranzycie.
   */
  _updatePositions(deltaYears) {
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    let anyMoved = false;

    for (const vessel of this._vessels.values()) {
      if (vessel.position.state !== 'in_transit' || !vessel.mission) continue;

      const m = vessel.mission;

      if (m.phase === 'returning') {
        // Powrót: interpolacja returnStart → returnTarget
        const totalReturn = (m.returnYear ?? m.arrivalYear) - (m.arrivalYear ?? m.departYear);
        if (totalReturn <= 0) continue;
        const t = Math.max(0, Math.min(1,
          (gameYear - (m.arrivalYear ?? m.departYear)) / totalReturn
        ));
        vessel.position.x = m.returnStartX + (m.returnTargetX - m.returnStartX) * t;
        vessel.position.y = m.returnStartY + (m.returnTargetY - m.returnStartY) * t;
      } else {
        // W drodze do celu: interpolacja start → target
        const totalTravel = (m.arrivalYear ?? 1) - (m.departYear ?? 0);
        if (totalTravel <= 0) continue;
        const t = Math.max(0, Math.min(1,
          (gameYear - m.departYear) / totalTravel
        ));

        // Aktualizuj pozycje docelowe (cele się poruszają po orbitach)
        const targetEntity = this._findEntity(m.targetId);
        if (targetEntity) {
          m.targetX = targetEntity.x;
          m.targetY = targetEntity.y;
        }
        // Aktualizuj startowe (planeta źródłowa też się porusza)
        const sourceEntity = this._findEntity(vessel.colonyId);
        if (sourceEntity) {
          m.startX = sourceEntity.x;
          m.startY = sourceEntity.y;
        }

        vessel.position.x = m.startX + (m.targetX - m.startX) * t;
        vessel.position.y = m.startY + (m.targetY - m.startY) * t;
      }

      anyMoved = true;
    }

    if (anyMoved) {
      EventBus.emit('vessel:positionUpdate', { vessels: this.getInTransit() });
    }
  }

  /**
   * Znajdź encję po id (planet, moon, planetoid).
   */
  _findEntity(targetId) {
    if (!targetId) return null;
    const TYPES = ['planet', 'moon', 'planetoid', 'asteroid', 'comet'];
    for (const t of TYPES) {
      const bodies = EntityManager.getByType(t);
      const found = bodies.find(b => b.id === targetId);
      if (found) return found;
    }
    return null;
  }
}
