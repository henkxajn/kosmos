// StationSystem — tworzenie/niszczenie/persistencja stacji orbitalnych (S3.3b-S2).
// Bezstanowy nad EntityManager: rejestr stacji = EntityManager.getByType('station').
// Pozycja orbity zarządzana przez OrbitalSpaceSystem (rola 'station' → GEO, anchored).
// Przyszły dom logiki dokowania/depotu/rescue (S3.3b-S3). Dostęp do innych systemów
// przez window.KOSMOS (zasada: nie importujemy systemów między sobą).

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { Station } from '../entities/Station.js';
import { createStarterModules } from '../data/StationModuleData.js';

export class StationSystem {
  constructor() {
    // S4-2 — zmiana nazwy stacji (mirror VesselManager vessel:rename → _renameVessel).
    EventBus.on('station:rename', ({ stationId, name }) => this._renameStation(stationId, name));
  }

  /**
   * Utwórz stację na orbicie ciała (instant — Wariant A). Wołane przez
   * ColonyManager._tickPendingStationOrders (po spend) oraz debug.spawnStation.
   * Bez limitu stacji per ciało/system. @returns {Station|null} (null gdy brak ciała)
   */
  createStation(bodyId, { ownerEmpireId = 'player', stationType = 'orbital_station', tier = 1, name = null } = {}) {
    const body = EntityManager.get(bodyId);
    if (!body) {
      console.warn(`[StationSystem] createStation: brak ciała ${bodyId}`);
      return null;
    }

    // ID kolizjo-odporny (stacje to pierwszy runtime-user encji po generacji;
    // generateId() resetuje się przy clear() i nie jest bumpowany przez restore).
    const id   = `station_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const year = window.KOSMOS?.timeSystem?.gameTime ?? 0;

    const station = new Station({
      id,
      name:          name ?? `Stacja ${body.name}`,
      bodyId,
      ownerEmpireId,
      stationType,
      tier,
      createdYear:   year,
      systemId:      body.systemId ?? 'sys_home',
      x:             body.x,
      y:             body.y,
      modules:       createStarterModules(),   // S3.4 FAZA 1.3 — 1× habitat + 1× power_atom (w cenie bazy)
    });
    EntityManager.add(station);

    // Orbita: GEO, anchored, omega=0. Serializuje się przez OrbitalSpaceSystem
    // (civ4x.orbitalSpace) — round-trip bez dodatkowego kodu.
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    if (orbital) orbital.assignOrbit(bodyId, id, 'station');

    EventBus.emit('station:created', { station });
    return station;
  }

  /** Zniszcz stację — zwolnij orbitę, usuń encję, powiadom render. */
  destroyStation(stationId) {
    const station = EntityManager.get(stationId);
    if (!station || station.type !== 'station') return false;
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    if (orbital) orbital.releaseOrbit(stationId);
    EntityManager.remove(stationId);
    EventBus.emit('station:destroyed', { stationId });
    return true;
  }

  /** Stacje na danym ciele (helper pod S3.3b-S3 dokowanie/depot). */
  getStationsAt(bodyId) {
    return EntityManager.getByType('station').filter(s => s.bodyId === bodyId);
  }

  /** S4-2 — zmień nazwę stacji (mirror VesselManager._renameVessel; StationPanel czyta name live). */
  _renameStation(stationId, name) {
    const s = EntityManager.get(stationId);
    if (s && s.type === 'station' && name) s.name = name;
  }

  // ── Save / Restore ──────────────────────────────────────────────────────
  // Encje w civ4x.stationSystem; orbita osobno w civ4x.orbitalSpace.

  serialize() {
    return EntityManager.getByType('station').map(s => ({
      id:            s.id,
      name:          s.name,
      bodyId:        s.bodyId,
      ownerEmpireId: s.ownerEmpireId,
      tier:          s.tier,
      stationType:   s.stationType,
      createdYear:   s.createdYear,
      depot:         s.depot.serialize(),   // S3.3b-S3 — {fuel, warp_cores} (zastąpił fuelStore/fuelCapacity)
      systemId:      s.systemId,
      modules:             s.modules,               // S3.4 FAZA 1 — lista { id, moduleType, level, active }
      pop:                 s.pop,                   // załoga (popCapacity = pochodna, NIE serializowana)
      pendingModuleOrders: s.pendingModuleOrders,   // kolejka budowy modułów
    }));
  }

  restore(data) {
    if (!Array.isArray(data)) return;
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    for (const sd of data) {
      if (!sd?.id) continue;
      if (EntityManager.get(sd.id)) continue;        // idempotent — nie duplikuj
      const station = new Station({ ...sd });
      EntityManager.add(station);
      // Orbita przywracana WCZEŚNIEJ przez orbitalSpace.restore. Defensywnie:
      // gdy jej brak (uszkodzony save) → przypisz na nowo (nowa θ akceptowalna).
      if (orbital && sd.bodyId && !orbital.hasOrbit(sd.id)) {
        orbital.assignOrbit(sd.bodyId, sd.id, 'station');
      }
      EventBus.emit('station:created', { station });
    }
  }
}
