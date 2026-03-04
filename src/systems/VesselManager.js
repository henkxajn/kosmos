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
import { KeplerMath } from '../utils/KeplerMath.js';
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

// Strefa wykluczenia wokół gwiazdy (w jednostkach fizyki gry = AU × AU_TO_PX)
const SUN_EXCLUSION_AU = 0.3;                           // AU
const SUN_EXCLUSION    = SUN_EXCLUSION_AU * AU_TO_PX;   // px — promień strefy
const SUN_MARGIN       = 0.1 * AU_TO_PX;                // margines ominięcia

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

  /** Statki orbitujące wokół ciał (do aktualizacji pozycji). */
  _getOrbiting() {
    const result = [];
    for (const v of this._vessels.values()) {
      if (v.position.state === 'orbiting') result.push(v);
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

    // Pozycja startu (bieżąca pozycja kolonii)
    const startEntity = this._findEntity(vessel.position.dockedAt);
    const sx = startEntity?.x ?? vessel.position.x;
    const sy = startEntity?.y ?? vessel.position.y;

    // Pozycja celu — predykcja Keplera (gdzie cel BĘDZIE w momencie przylotu)
    const predicted = this._predictPosition(mission.targetId, mission.arrivalYear);
    const tx = predicted.x;
    const ty = predicted.y;

    // Oblicz trasę z unikaniem Słońca i ciał niebieskich
    const route = this._calcRoute(sx, sy, tx, ty);

    vessel.mission = {
      ...mission,
      startX: sx, startY: sy,
      targetX: tx, targetY: ty,
      waypoints: route.waypoints, // [{x,y}] lub []
      originId: vessel.position.dockedAt ?? vessel.colonyId, // id planety startu (do śledzenia linii trasy)
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
    // Cel powrotu = predykowana pozycja kolonii macierzystej w momencie przylotu
    const predictedHome = this._predictPosition(vessel.colonyId, m.returnYear);
    m.returnTargetX = predictedHome.x || m.startX;
    m.returnTargetY = predictedHome.y || m.startY;
    m.phase = 'returning';

    // Oblicz waypoints powrotne (unikanie Słońca + ciał niebieskich)
    const returnRoute = this._calcRoute(m.returnStartX, m.returnStartY, m.returnTargetX, m.returnTargetY);
    m.returnWaypoints = returnRoute.waypoints;

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
      let missionData = null;
      if (v.mission) {
        missionData = { ...v.mission };
        // Głęboka kopia waypoints (tablice obiektów)
        if (missionData.waypoints) missionData.waypoints = missionData.waypoints.map(w => ({ ...w }));
        if (missionData.returnWaypoints) missionData.returnWaypoints = missionData.returnWaypoints.map(w => ({ ...w }));
      }
      vessels.push({
        id:         v.id,
        shipId:     v.shipId,
        name:       v.name,
        colonyId:   v.colonyId,
        position:   { ...v.position },
        fuel:       { ...v.fuel },
        mission:    missionData,
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
      let missionData = null;
      if (vd.mission) {
        missionData = { ...vd.mission };
        if (missionData.waypoints) missionData.waypoints = missionData.waypoints.map(w => ({ ...w }));
        if (missionData.returnWaypoints) missionData.returnWaypoints = missionData.returnWaypoints.map(w => ({ ...w }));
        // Fallback: stare save'y bez originId
        if (!missionData.originId) missionData.originId = vd.colonyId;
      }
      const vessel = {
        id:         vd.id,
        shipId:     vd.shipId,
        name:       vd.name,
        colonyId:   vd.colonyId,
        position:   { ...vd.position },
        fuel:       { ...vd.fuel },
        mission:    missionData,
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
      // Orbitujące statki — podążają za ciałem, wokół którego krążą
      if (vessel.position.state === 'orbiting' && vessel.mission) {
        const body = this._findEntity(vessel.mission.targetId);
        if (body) {
          vessel.position.x = body.x;
          vessel.position.y = body.y;
          anyMoved = true;
        }
        continue;
      }

      if (vessel.position.state !== 'in_transit' || !vessel.mission) continue;

      const m = vessel.mission;

      if (m.phase === 'returning') {
        // Powrót: interpolacja returnStart → (waypoints) → returnTarget
        // (cel powrotu ustalony predykcyjnie w startReturn — bez dynamicznego śledzenia)
        const totalReturn = (m.returnYear ?? m.arrivalYear) - (m.arrivalYear ?? m.departYear);
        if (totalReturn <= 0) continue;
        const t = Math.max(0, Math.min(1,
          (gameYear - (m.arrivalYear ?? m.departYear)) / totalReturn
        ));
        const rp = this._interpolateWaypoints(
          m.returnStartX, m.returnStartY,
          m.returnTargetX, m.returnTargetY,
          m.returnWaypoints ?? [], t
        );
        vessel.position.x = rp.x;
        vessel.position.y = rp.y;
      } else {
        // W drodze do celu: interpolacja start → (waypoints) → target
        const totalTravel = (m.arrivalYear ?? 1) - (m.departYear ?? 0);
        if (totalTravel <= 0) continue;
        const t = Math.max(0, Math.min(1,
          (gameYear - m.departYear) / totalTravel
        ));

        // Cel ustalony predykcyjnie w dispatchOnMission — bez dynamicznego śledzenia
        const op = this._interpolateWaypoints(
          m.startX, m.startY,
          m.targetX, m.targetY,
          m.waypoints ?? [], t
        );
        vessel.position.x = op.x;
        vessel.position.y = op.y;
      }

      anyMoved = true;
    }

    // ── Aktualizuj wizualne końce linii trasy (śledzą planety w ruchu) ──
    for (const vessel of this._vessels.values()) {
      const m = vessel.mission;
      if (!m) continue;

      // Punkt startu trasy → aktualna pozycja planety macierzystej
      const originEntity = this._findEntity(m.originId ?? vessel.colonyId);
      if (originEntity) {
        m.liveOriginX = originEntity.x;
        m.liveOriginY = originEntity.y;
      }

      // Punkt docelowy → aktualna pozycja ciała docelowego
      const targetEntity = this._findEntity(m.targetId);
      if (targetEntity) {
        m.liveTargetX = targetEntity.x;
        m.liveTargetY = targetEntity.y;
      }
    }

    if (anyMoved) {
      const moving = [...this.getInTransit(), ...this._getOrbiting()];
      EventBus.emit('vessel:positionUpdate', { vessels: moving });
    }
  }

  /**
   * Interpolacja po wielopunktowej trasie: start → waypoints → target.
   * t ∈ [0,1] — postęp całej trasy; zwraca {x, y}.
   */
  _interpolateWaypoints(sx, sy, tx, ty, waypoints, t) {
    if (!waypoints || waypoints.length === 0) {
      // Prosta interpolacja bez waypointów
      return { x: sx + (tx - sx) * t, y: sy + (ty - sy) * t };
    }

    // Zbuduj tablicę segmentów: start → wp1 → wp2 → ... → target
    const pts = [{ x: sx, y: sy }];
    for (const wp of waypoints) pts.push(wp);
    pts.push({ x: tx, y: ty });

    // Oblicz długości segmentów
    const segLens = [];
    let totalLen = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      segLens.push(d);
      totalLen += d;
    }
    if (totalLen < 1) return { x: sx, y: sy };

    // Znajdź segment odpowiadający postępowi t
    let traveled = t * totalLen;
    for (let i = 0; i < segLens.length; i++) {
      if (traveled <= segLens[i] || i === segLens.length - 1) {
        const segT = segLens[i] > 0 ? Math.min(1, traveled / segLens[i]) : 0;
        return {
          x: pts[i].x + (pts[i + 1].x - pts[i].x) * segT,
          y: pts[i].y + (pts[i + 1].y - pts[i].y) * segT,
        };
      }
      traveled -= segLens[i];
    }
    return { x: tx, y: ty };
  }

  /**
   * Oblicz trasę z unikaniem Słońca i ciał niebieskich.
   * Zwraca { waypoints: [{x,y}], totalDist } w jednostkach fizyki gry (px).
   */
  _calcRoute(sx, sy, tx, ty) {
    const dx = tx - sx, dy = ty - sy;
    const lenSq = dx * dx + dy * dy;
    const directDist = Math.sqrt(lenSq);
    if (lenSq < 1) return { waypoints: [], totalDist: directDist };

    // Krótkie dystanse (< 0.5 AU) → linia prosta, bez unikania
    // (np. lot planeta→księżyc — oba blisko gwiazdy, nie trzeba omijać)
    const SHORT_HOP = 0.5 * AU_TO_PX;
    if (directDist < SHORT_HOP) {
      return { waypoints: [], totalDist: directDist };
    }

    // ── Krok 1: unikanie Słońca (strefa wykluczenia wokół (0,0)) ──
    let sunWaypoints = [];

    const cross = (-sx) * dy - (-sy) * dx;
    const len = directDist;
    const minDistSun = Math.abs(cross) / len;

    const dotSun = (-sx) * dx + (-sy) * dy;
    const tSun = dotSun / lenSq;

    if (minDistSun <= SUN_EXCLUSION && tSun >= 0 && tSun <= 1) {
      const r = SUN_EXCLUSION + SUN_MARGIN;
      const baseAngle = Math.atan2(dy, dx);
      const wp1 = { x: r * Math.cos(baseAngle + Math.PI / 2), y: r * Math.sin(baseAngle + Math.PI / 2) };
      const wp2 = { x: r * Math.cos(baseAngle - Math.PI / 2), y: r * Math.sin(baseAngle - Math.PI / 2) };
      const d1 = Math.hypot(wp1.x - sx, wp1.y - sy) + Math.hypot(tx - wp1.x, ty - wp1.y);
      const d2 = Math.hypot(wp2.x - sx, wp2.y - sy) + Math.hypot(tx - wp2.x, ty - wp2.y);
      sunWaypoints = [d1 <= d2 ? wp1 : wp2];
    }

    // ── Krok 2: unikanie planet i księżyców ──
    const BODY_MARGIN = 0.15 * AU_TO_PX; // 0.15 AU margines
    const allBodies = [
      ...EntityManager.getByType('planet'),
      ...EntityManager.getByType('moon'),
    ];
    const waypoints = this._avoidBodies(sx, sy, tx, ty, sunWaypoints, allBodies, BODY_MARGIN);

    // Przelicz łączny dystans z finalnymi waypointami
    const totalDist = this._routeLength(sx, sy, tx, ty, waypoints);

    // Sanity check: jeśli trasa z waypointami jest >3× dłuższa niż prosta,
    // waypoints przynoszą więcej szkody niż pożytku — leć prosto
    if (waypoints.length > 0 && totalDist > directDist * 3) {
      return { waypoints: [], totalDist: directDist };
    }

    return { waypoints, totalDist };
  }

  /**
   * Sprawdź kolizje trasy z ciałami niebieskimi i dodaj waypoints ominięcia.
   */
  _avoidBodies(sx, sy, tx, ty, existingWps, bodies, margin) {
    const newWps = [...existingWps];

    for (const body of bodies) {
      const bx = body.x, by = body.y;

      // Nie omijaj celu ani startu (byłoby absurdalne)
      const distToStart = Math.hypot(bx - sx, by - sy);
      const distToEnd   = Math.hypot(bx - tx, by - ty);
      if (distToStart < margin || distToEnd < margin) continue;

      // Zbuduj aktualną trasę z waypointami
      const pts = [{ x: sx, y: sy }, ...newWps, { x: tx, y: ty }];

      // Sprawdź każdy segment trasy
      for (let i = 0; i < pts.length - 1; i++) {
        const minDist = this._pointToSegmentDist(bx, by, pts[i], pts[i + 1]);
        if (minDist < margin) {
          const wp = this._avoidanceWaypoint(pts[i], pts[i + 1], bx, by, margin + 0.05 * AU_TO_PX);
          if (wp) newWps.push(wp);
          break; // jedno ciało = jeden waypoint
        }
      }
    }

    // Posortuj waypoints wg odległości od startu (spójna trasa)
    if (newWps.length > 1) {
      newWps.sort((a, b) =>
        Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy)
      );
    }
    return newWps;
  }

  /**
   * Minimalna odległość punktu (px, py) od odcinka segA→segB.
   */
  _pointToSegmentDist(px, py, segA, segB) {
    const dx = segB.x - segA.x, dy = segB.y - segA.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) return Math.hypot(px - segA.x, py - segA.y);
    const t = Math.max(0, Math.min(1, ((px - segA.x) * dx + (py - segA.y) * dy) / lenSq));
    const projX = segA.x + t * dx, projY = segA.y + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  /**
   * Waypoint ominięcia ciała — tangencjalny, po krótszej stronie trasy.
   */
  _avoidanceWaypoint(segA, segB, bx, by, avoidR) {
    const dx = segB.x - segA.x, dy = segB.y - segA.y;
    const baseAngle = Math.atan2(dy, dx);
    const wp1 = { x: bx + avoidR * Math.cos(baseAngle + Math.PI / 2),
                  y: by + avoidR * Math.sin(baseAngle + Math.PI / 2) };
    const wp2 = { x: bx + avoidR * Math.cos(baseAngle - Math.PI / 2),
                  y: by + avoidR * Math.sin(baseAngle - Math.PI / 2) };
    const d1 = Math.hypot(wp1.x - segA.x, wp1.y - segA.y) + Math.hypot(segB.x - wp1.x, segB.y - wp1.y);
    const d2 = Math.hypot(wp2.x - segA.x, wp2.y - segA.y) + Math.hypot(segB.x - wp2.x, segB.y - wp2.y);
    return d1 <= d2 ? wp1 : wp2;
  }

  /**
   * Łączna długość trasy start → waypoints → target (px).
   */
  _routeLength(sx, sy, tx, ty, wps) {
    const pts = [{ x: sx, y: sy }, ...(wps || []), { x: tx, y: ty }];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return total;
  }

  /**
   * Przekieruj statek w locie do nowego celu (sekwencyjny recon).
   */
  redirectToTarget(vesselId, newTargetId, newArrivalYear) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel?.mission) return;
    const m = vessel.mission;

    // Snap do pozycji bieżącego celu (statek właśnie dotarł)
    const currentTarget = this._findEntity(m.targetId);
    if (currentTarget) {
      vessel.position.x = currentTarget.x;
      vessel.position.y = currentTarget.y;
    }

    // Obecna pozycja staje się nowym startem
    m.startX = vessel.position.x;
    m.startY = vessel.position.y;
    m.targetId = newTargetId;
    // Predykowana pozycja nowego celu w momencie przylotu
    const predicted = this._predictPosition(newTargetId, newArrivalYear);
    m.targetX = predicted.x;
    m.targetY = predicted.y;

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    m.departYear = gameYear;
    m.arrivalYear = newArrivalYear;
    m.phase = undefined; // outbound

    // Oblicz waypoints (unikanie Słońca + ciał niebieskich)
    const route = this._calcRoute(m.startX, m.startY, m.targetX, m.targetY);
    m.waypoints = route.waypoints;

    // Zużyj paliwo za nowy odcinek (consumption = pc/AU, totalDist w px)
    const fuelCost = (route.totalDist / AU_TO_PX) * vessel.fuel.consumption;
    vessel.fuel.current = Math.max(0, vessel.fuel.current - fuelCost);

    vessel.position.state = 'in_transit';
  }

  /**
   * Predykcja pozycji ciała niebieskiego w przyszłości (Kepler).
   * Zwraca {x, y} w pikselach (układ fizyki gry).
   * @param {string} entityId — id ciała (planet, moon, planetoid)
   * @param {number} futureYear — rok gry, w którym chcemy pozycję
   */
  _predictPosition(entityId, futureYear) {
    const entity = this._findEntity(entityId);
    if (!entity?.orbital) return entity ? { x: entity.x, y: entity.y } : { x: 0, y: 0 };

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const dt = futureYear - gameYear;
    const orb = entity.orbital;

    // Przyszła anomalia średnia → mimośrodowa → prawdziwa → pozycja
    const futureM     = KeplerMath.updateMeanAnomaly(orb.M, dt, orb.T);
    const futureE     = KeplerMath.solveKepler(futureM, orb.e);
    const futureTheta = KeplerMath.eccentricToTrueAnomaly(futureE, orb.e);
    const r           = KeplerMath.orbitalRadius(orb.a, orb.e, futureTheta);
    const angle       = futureTheta + orb.inclinationOffset;

    if (entity.type === 'moon') {
      // Księżyc: najpierw przewidź pozycję planety-rodzica
      const parentPos = this._predictPosition(entity.parentPlanetId, futureYear);
      return {
        x: parentPos.x + r * Math.cos(angle) * AU_TO_PX,
        y: parentPos.y + r * Math.sin(angle) * AU_TO_PX,
      };
    }

    // Planeta/planetoid: orbita wokół gwiazdy
    const stars = EntityManager.getByType('star');
    const starX = stars[0]?.x ?? 0;
    const starY = stars[0]?.y ?? 0;
    return {
      x: starX + r * Math.cos(angle) * AU_TO_PX,
      y: starY + r * Math.sin(angle) * AU_TO_PX,
    };
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
