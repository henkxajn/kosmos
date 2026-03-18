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
  addMissionLog,
} from '../entities/Vessel.js';
import {
  serializeNameCounters, restoreNameCounters,
} from '../data/VesselNames.js';
import { t } from '../i18n/i18n.js';

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

    // civDeltaYears = deltaYears × CIV_TIME_SCALE — tankowanie i naprawa biegną szybciej
    EventBus.on('time:tick', ({ civDeltaYears: deltaYears }) =>
      this._tick(deltaYears));

    EventBus.on('vessel:rename', ({ vesselId, name }) =>
      this._renameVessel(vesselId, name));

    // Cleanup statków przy zniszczeniu kolonii
    EventBus.on('colony:destroyed', ({ planetId, destroyedVesselIds }) =>
      this._onColonyDestroyed(planetId, destroyedVesselIds ?? []));

    // Redirect statku po przylecie międzygwiezdnym (do planety w nowym układzie)
    EventBus.on('vessel:interstellarRedirect', ({ vesselId, targetId }) =>
      this._redirectInterstellarVessel(vesselId, targetId));

    // Rozkazy w obcym układzie
    EventBus.on('expedition:foreignRecon', ({ vesselId, targetId, scope }) =>
      this._startForeignRecon(vesselId, targetId, scope));
    EventBus.on('expedition:foreignColonize', ({ vesselId, targetId }) =>
      this._startForeignColonize(vesselId, targetId));
    EventBus.on('expedition:foreignUnload', ({ vesselId, targetId }) =>
      this._startForeignUnload(vesselId, targetId));
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
   * Wszystkie statki w danym układzie gwiezdnym.
   */
  getVesselsInSystem(systemId) {
    const result = [];
    for (const v of this._vessels.values()) {
      if ((v.systemId ?? 'sys_home') === systemId) result.push(v);
    }
    return result;
  }

  /**
   * Statki w tranzycie międzygwiezdnym (nie przypisane do żadnego układu).
   */
  getInterstellarVessels() {
    const result = [];
    for (const v of this._vessels.values()) {
      if (v.mission?.type === 'interstellar_jump') result.push(v);
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
   * Czy kolonia ma idle statek z daną capability (np. 'recon', 'colony', 'cargo')?
   */
  hasAvailableShipWithCapability(colonyId, capability) {
    return this.getFirstAvailableWithCapability(colonyId, capability) !== null;
  }

  /**
   * Pierwszy idle statek z daną capability w kolonii.
   */
  getFirstAvailableWithCapability(colonyId, capability) {
    const docked = this.getVesselsAt(colonyId);
    for (const v of docked) {
      if (v.status !== 'idle') continue;
      const caps = SHIPS[v.shipId]?.capabilities;
      if (caps && caps.includes(capability)) return v;
    }
    return null;
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
    // Pozwól statkom tankującym na misję (przerwij tankowanie)
    if ((vessel.status !== 'idle' && vessel.status !== 'refueling') || vessel.position.state !== 'docked') return false;

    // Zastosuj fuel efficiency z tech (np. plasma_drives -30% zużycie)
    const fuelEffMult = window.KOSMOS?.techSystem?.getFuelEfficiency() ?? 1.0;
    vessel.fuel.consumption = (SHIPS[vessel.shipId]?.fuelPerAU ?? vessel.fuel.consumption) * fuelEffMult;

    // Pozycja startu (bieżąca pozycja kolonii)
    const startEntity = this._findEntity(vessel.position.dockedAt);
    const sx = startEntity?.x ?? vessel.position.x;
    const sy = startEntity?.y ?? vessel.position.y;

    // Pozycja celu — predykcja Keplera (gdzie cel BĘDZIE w momencie przylotu)
    const predicted = this._predictPosition(mission.targetId, mission.arrivalYear);
    const tx = predicted.x;
    const ty = predicted.y;

    // Oblicz trasę z unikaniem Słońca i ciał niebieskich
    const vesselSysId = vessel.systemId ?? this._findEntity(vessel.position.dockedAt)?.systemId ?? 'sys_home';
    const route = this._calcRoute(sx, sy, tx, ty, vesselSysId);

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

    // Wpis do dziennika
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    addMissionLog(vessel, gameYear, t('vessel.launchedMission', mission.type, mission.targetName ?? this._resolveEntityName(mission.targetId)), 'info');

    EventBus.emit('vessel:launched', { vessel, mission: vessel.mission });
    return true;
  }

  /**
   * Re-dispatch statku z orbity na nową misję (np. transport po zakończeniu kolonizacji/recon).
   * Nie wymaga idle+docked — akceptuje orbiting+on_mission.
   */
  redispatchFromOrbit(vesselId, mission) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return false;
    if (vessel.position.state !== 'orbiting') return false;

    // Pozycja startu = bieżąca pozycja orbity
    const sx = vessel.position.x;
    const sy = vessel.position.y;

    // Pozycja celu — predykcja Keplera
    const predicted = this._predictPosition(mission.targetId, mission.arrivalYear);
    const tx = predicted.x;
    const ty = predicted.y;

    // Oblicz trasę z unikaniem Słońca
    const redispatchSysId = vessel.systemId ?? this._findEntity(vessel.position.dockedAt)?.systemId ?? 'sys_home';
    const route = this._calcRoute(sx, sy, tx, ty, redispatchSysId);

    vessel.mission = {
      ...mission,
      startX: sx, startY: sy,
      targetX: tx, targetY: ty,
      waypoints: route.waypoints,
      originId: vessel.position.dockedAt ?? vessel.colonyId,
    };

    // Zużyj paliwo
    if (mission.fuelCost != null) {
      vessel.fuel.current = Math.max(0, vessel.fuel.current - mission.fuelCost);
    }

    vessel.status = 'on_mission';
    vessel.position.state = 'in_transit';
    vessel.position.dockedAt = null;

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    addMissionLog(vessel, gameYear, t('vessel.dispatchedFromOrbit', mission.type, mission.targetName ?? this._resolveEntityName(mission.targetId)), 'info');

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

    // Wpis do dziennika
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    addMissionLog(vessel, gameYear, t('vessel.arrived', vessel.mission.targetName ?? this._resolveEntityName(vessel.mission.targetId)), 'success');

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
    m.returnDepartYear = window.KOSMOS?.timeSystem?.gameTime ?? m.arrivalYear; // moment startu powrotu
    // Cel powrotu = predykowana pozycja kolonii macierzystej w momencie przylotu
    const predictedHome = this._predictPosition(vessel.colonyId, m.returnYear);
    m.returnTargetX = predictedHome.x || m.startX;
    m.returnTargetY = predictedHome.y || m.startY;
    m.phase = 'returning';

    // Oblicz waypoints powrotne (unikanie Słońca + ciał niebieskich)
    const returnSysId = vessel.systemId ?? this._findEntity(vessel.colonyId)?.systemId ?? 'sys_home';
    const returnRoute = this._calcRoute(m.returnStartX, m.returnStartY, m.returnTargetX, m.returnTargetY, returnSysId);
    m.returnWaypoints = returnRoute.waypoints;

    // Zużyj paliwo na powrót (dystans w AU × consumption)
    const returnDistAU = returnRoute.totalDist / AU_TO_PX;
    consumeFuel(vessel, returnDistAU);

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

    const targetId = colonyId ?? vessel.colonyId;
    const entity = this._findEntity(targetId);
    vessel.colonyId = targetId;
    vessel.position.state = 'docked';
    vessel.position.dockedAt = targetId;
    vessel.position.x = entity?.x ?? 0;
    vessel.position.y = entity?.y ?? 0;
    vessel.status = 'idle';
    vessel.mission = null;
    vessel.experience += 1;
    if (vessel.stats) vessel.stats.missionsComplete += 1;

    // Wpis do dziennika misji
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const targetName = this._resolveEntityName(targetId);
    addMissionLog(vessel, gameYear, t('vessel.docked', targetName), 'success');

    EventBus.emit('vessel:docked', { vessel });
  }

  // ── Misje międzygwiezdne ────────────────────────────────────────────────────

  /**
   * Wyślij statek w podróż międzygwiezdną (warp jump).
   * @param {string} vesselId — id statku (musi być warpCapable, docked, idle)
   * @param {string} targetSystemId — id docelowego układu (z GalaxyGenerator)
   * @returns {boolean} sukces
   */
  dispatchInterstellar(vesselId, targetSystemId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return false;
    if (vessel.status !== 'idle' && vessel.status !== 'refueling') return false;
    if (vessel.position.state !== 'docked') return false;

    const shipDef = SHIPS[vessel.shipId];
    if (!shipDef?.warpCapable) return false;

    // Dane docelowej gwiazdy z galaxyData
    const gd = window.KOSMOS?.galaxyData;
    if (!gd) return false;
    const targetStar = gd.systems.find(s => s.id === targetSystemId);
    if (!targetStar) return false;

    // Oblicz odległość w LY (3D)
    const homeStar = gd.systems.find(s => s.id === (vessel.systemId ?? 'sys_home'));
    if (!homeStar) return false;
    const dx = targetStar.x - homeStar.x;
    const dy = targetStar.y - homeStar.y;
    const dz = (targetStar.z ?? 0) - (homeStar.z ?? 0);
    const distLY = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Sprawdź paliwo (warp_cores)
    const fuelPerLY = shipDef.fuelPerLY ?? 0.5;
    const fuelCost = distLY * fuelPerLY;
    if (vessel.fuel.current < fuelCost) return false;

    // Prędkość warp (z bonusem beacon)
    const baseSpeed = shipDef.warpSpeedLY ?? 2.5; // LY/rok
    const ssMgr = window.KOSMOS?.starSystemManager;
    const beaconBonus = ssMgr?.hasBeacon(targetSystemId) ? 3.0 : 1.0;
    const warpSpeed = baseSpeed * beaconBonus;
    const travelYears = distLY / warpSpeed;

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;

    // Zużyj paliwo
    vessel.fuel.current = Math.max(0, vessel.fuel.current - fuelCost);

    // Ustaw misję
    vessel.mission = {
      type:          'interstellar_jump',
      fromSystemId:  vessel.systemId ?? 'sys_home',
      toSystemId:    targetSystemId,
      targetName:    targetStar.name,
      departYear:    gameYear,
      arrivalYear:   gameYear + travelYears,
      warpSpeed,
      distLY,
      fuelCost,
      phase:         'warp_transit',
      // Pozycje galaktyczne (LY) — do interpolacji na mapie galaktyki
      fromGalX: homeStar.x, fromGalY: homeStar.y,
      toGalX:   targetStar.x, toGalY:   targetStar.y,
    };

    vessel.status = 'on_mission';
    vessel.position.state = 'in_transit';
    vessel.position.dockedAt = null;
    // systemId = null podczas tranzytu międzygwiezdnego (statek "między" układami)
    vessel.systemId = null;

    addMissionLog(vessel, gameYear,
      t('vessel.interstellarLaunch', targetStar.name, distLY.toFixed(1)),
      'info');

    EventBus.emit('vessel:launched', { vessel, mission: vessel.mission });
    EventBus.emit('interstellar:departed', { vessel, targetSystemId, arrivalYear: gameYear + travelYears });
    return true;
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
   * Obsługa zniszczenia kolonii — przekieruj/reassign statki w locie.
   * Statki w hangarze (docked) już zniszczone przez ColonyManager.removeColony().
   */
  _onColonyDestroyed(planetId, destroyedVesselIds) {
    const homePlanetId = window.KOSMOS?.homePlanet?.id;
    if (!homePlanetId) return;

    const alreadyDestroyed = new Set(destroyedVesselIds);

    for (const vessel of this._vessels.values()) {
      if (alreadyDestroyed.has(vessel.id)) continue;

      // Statki w tranzycie/orbitujące DO zniszczonego ciała → awaryjny powrót
      if (vessel.mission?.targetId === planetId &&
          (vessel.position.state === 'in_transit' || vessel.position.state === 'orbiting')) {
        // Zmień cel powrotu na homePlanet
        vessel.colonyId = homePlanetId;
        // Dodaj do floty homePlanet
        const homeColony = window.KOSMOS?.colonyManager?.getColony(homePlanetId);
        if (homeColony && !homeColony.fleet.includes(vessel.id)) {
          homeColony.fleet.push(vessel.id);
        }
        // Wymuś powrót
        this.startReturn(vessel.id);
        const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
        addMissionLog(vessel, gameYear, t('vessel.emergencyReturn'), 'danger');
        continue;
      }

      // Statki wracające DO zniszczonej kolonii → zmień cel powrotu
      if (vessel.colonyId === planetId && vessel.mission?.phase === 'returning') {
        vessel.colonyId = homePlanetId;
        // Przelicz punkt docelowy powrotu
        const homeEntity = this._findEntity(homePlanetId);
        if (homeEntity && vessel.mission) {
          vessel.mission.returnTargetX = homeEntity.x;
          vessel.mission.returnTargetY = homeEntity.y;
        }
        const homeColony = window.KOSMOS?.colonyManager?.getColony(homePlanetId);
        if (homeColony && !homeColony.fleet.includes(vessel.id)) {
          homeColony.fleet.push(vessel.id);
        }
        const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
        addMissionLog(vessel, gameYear, t('vessel.redirectedBase'), 'danger');
        continue;
      }

      // Statki należące do zniszczonej kolonii (na innej misji) → reassign
      if (vessel.colonyId === planetId) {
        vessel.colonyId = homePlanetId;
        vessel.homeColonyId = homePlanetId;
        const homeColony = window.KOSMOS?.colonyManager?.getColony(homePlanetId);
        if (homeColony && !homeColony.fleet.includes(vessel.id)) {
          homeColony.fleet.push(vessel.id);
        }
        const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
        addMissionLog(vessel, gameYear, t('vessel.reassigned', this._resolveEntityName(homePlanetId)), 'warning');
      }
    }
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
        id:           v.id,
        shipId:       v.shipId,
        name:         v.name,
        colonyId:     v.colonyId,
        homeColonyId: v.homeColonyId ?? v.colonyId,
        systemId:     v.systemId ?? 'sys_home',
        position:     { ...v.position },
        fuel:         { ...v.fuel },
        mission:      missionData,
        status:       v.status,
        experience:   v.experience,
        cargo:        v.cargo ?? {},
        cargoUsed:    v.cargoUsed ?? 0,
        automation:   v.automation ? { ...v.automation } : { autoReturn: false, autoRefuel: true },
        missionLog:   v.missionLog ? [...v.missionLog] : [],
        stats:        v.stats ? { ...v.stats } : { distanceTraveled: 0, missionsComplete: 0, resourcesHauled: 0, bodiesSurveyed: 0 },
        generation:   v.generation ?? 1,
        fuelType:     v.fuelType ?? 'power_cells',
        damaged:      v.damaged ?? false,
        _repairProgress: v._repairProgress ?? 0,
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
        id:           vd.id,
        shipId:       vd.shipId,
        name:         vd.name,
        colonyId:     vd.colonyId,
        homeColonyId: vd.homeColonyId ?? vd.colonyId,
        systemId:     vd.systemId ?? 'sys_home',
        position:     { ...vd.position },
        fuel:         { ...vd.fuel },
        mission:      missionData,
        status:       vd.status ?? 'idle',
        experience:   vd.experience ?? 0,
        cargo:        vd.cargo ?? {},
        cargoUsed:    vd.cargoUsed ?? 0,
        automation:   vd.automation ? { ...vd.automation } : { autoReturn: false, autoRefuel: true },
        missionLog:   vd.missionLog ? [...vd.missionLog] : [],
        stats:        vd.stats ? { ...vd.stats } : { distanceTraveled: 0, missionsComplete: 0, resourcesHauled: 0, bodiesSurveyed: 0 },
        generation:   vd.generation ?? 1,
        fuelType:     vd.fuelType ?? 'power_cells',
        damaged:      vd.damaged ?? false,
        _repairProgress: vd._repairProgress ?? 0,
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
   * Tick gry — tankowanie + naprawa + interpolacja pozycji.
   */
  _tick(deltaYears) {
    this._tickRefueling(deltaYears);
    this._tickRepair(deltaYears);
    this._updatePositions(deltaYears);
  }

  /**
   * Naprawa uszkodzonych statków docked w kolonii ze stocznią.
   * Wymagane: 1 rok docked → vessel.damaged = false.
   */
  _tickRepair(deltaYears) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;

    for (const vessel of this._vessels.values()) {
      if (!vessel.damaged) continue;
      if (vessel.position.state !== 'docked') continue;

      // Sprawdź czy kolonia ma stocznię
      const colony = colMgr.getColony(vessel.position.dockedAt);
      if (!colony?.buildingSystem) continue;
      let hasShipyard = false;
      for (const entry of colony.buildingSystem._active.values()) {
        if (entry.buildingId === 'shipyard') { hasShipyard = true; break; }
      }
      if (!hasShipyard) continue;

      // Akumuluj czas naprawy
      vessel._repairProgress = (vessel._repairProgress ?? 0) + deltaYears;
      if (vessel._repairProgress >= 1.0) {
        vessel.damaged = false;
        vessel._repairProgress = 0;
        addMissionLog(vessel, window.KOSMOS?.timeSystem?.gameTime ?? 0, 'Repair complete', 'success');
      }
    }
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

      // Sprawdź odpowiedni typ paliwa w inventory
      const ft = vessel.fuelType ?? vessel.fuel?.fuelType ?? 'power_cells';
      const fuelAvailable = inv.get(ft) ?? 0;
      if (fuelAvailable <= 0) {
        // Brak paliwa — status refueling ale nie może ładować
        if (vessel.status === 'idle') vessel.status = 'refueling';
        continue;
      }

      // Ile chcemy zatankować w tym ticku
      const wantFuel = REFUEL_RATE * deltaYears;
      const canFuel = Math.min(wantFuel, fuelAvailable, vessel.fuel.max - vessel.fuel.current);

      if (canFuel > 0) {
        // Pobierz paliwo z inventory
        colony.resourceSystem.spend({ [ft]: canFuel });
        refuel(vessel, canFuel);
        vessel.status = needsRefuel(vessel) ? 'refueling' : 'idle';
      }
    }
  }

  /**
   * Interpolacja pozycji statków w tranzycie + aktualizacja linii tras.
   * Połączone w jedną pętlę dla wydajności.
   */
  _updatePositions(deltaYears) {
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const moving = []; // statki w ruchu (do vessel:positionUpdate)

    for (const vessel of this._vessels.values()) {
      const m = vessel.mission;

      // Docked statki — synchronizuj pozycję z planetą macierzystą
      if (vessel.position.state === 'docked' && vessel.position.dockedAt) {
        const entity = this._findEntity(vessel.position.dockedAt);
        if (entity) {
          vessel.position.x = entity.x;
          vessel.position.y = entity.y;
        }
        continue;
      }

      // Orbitujące statki — podążają za ciałem, wokół którego krążą
      if (vessel.position.state === 'orbiting' && m) {
        const body = this._findEntity(m.targetId);
        if (body) {
          vessel.position.x = body.x;
          vessel.position.y = body.y;
        }
        // Tick foreign_recon (scope='target') — skanowanie na orbicie
        if (m.type === 'foreign_recon' && m.scope === 'target') {
          this._tickForeignRecon(vessel, m, gameYear);
        }
        // Aktualizuj linie trasy dla orbitujących
        this._updateRouteLine(vessel, m);
        moving.push(vessel);
        continue;
      }

      if (vessel.position.state === 'in_transit' && m) {
        // ── Misja międzygwiezdna (warp transit) ──
        if (m.type === 'interstellar_jump' && m.phase === 'warp_transit') {
          this._tickInterstellar(vessel, m, gameYear);
          moving.push(vessel);
          continue;
        }

        // ── Foreign recon (full_system) — własna logika interpolacji i skanowania ──
        if (m.type === 'foreign_recon' && m.scope === 'full_system') {
          this._tickForeignRecon(vessel, m, gameYear);
          moving.push(vessel);
          continue;
        }

        // Śledź dystans (delta pozycji → AU)
        const prevX = vessel.position.x;
        const prevY = vessel.position.y;

        if (m.phase === 'returning') {
          // Powrót: interpolacja returnStart → (waypoints) → returnTarget
          const returnDepart = m.returnDepartYear ?? m.arrivalYear ?? m.departYear;
          const totalReturn = (m.returnYear ?? m.arrivalYear) - returnDepart;
          if (totalReturn > 0.0001) {
            const t = Math.max(0, Math.min(1,
              (gameYear - returnDepart) / totalReturn
            ));
            const rp = this._interpolateWaypoints(
              m.returnStartX, m.returnStartY,
              m.returnTargetX, m.returnTargetY,
              m.returnWaypoints ?? [], t
            );
            vessel.position.x = rp.x;
            vessel.position.y = rp.y;
          } else {
            // Prawie zerowy czas powrotu — snap do celu
            vessel.position.x = m.returnTargetX ?? m.startX;
            vessel.position.y = m.returnTargetY ?? m.startY;
          }
        } else {
          // W drodze do celu: interpolacja start → (waypoints) → target
          const totalTravel = (m.arrivalYear ?? 1) - (m.departYear ?? 0);
          if (totalTravel > 0.0001) {
            const t = Math.max(0, Math.min(1,
              (gameYear - m.departYear) / totalTravel
            ));
            const op = this._interpolateWaypoints(
              m.startX, m.startY,
              m.targetX, m.targetY,
              m.waypoints ?? [], t
            );
            vessel.position.x = op.x;
            vessel.position.y = op.y;
          } else {
            // Prawie zerowy czas podróży — snap do celu
            vessel.position.x = m.targetX ?? vessel.position.x;
            vessel.position.y = m.targetY ?? vessel.position.y;
          }
        }
        // Akumuluj przebytą odległość (AU)
        if (vessel.stats) {
          const dPx = Math.hypot(vessel.position.x - prevX, vessel.position.y - prevY);
          vessel.stats.distanceTraveled += dPx / AU_TO_PX;
        }

        // ── Detekcja przylotu dla exploration mission (obcy układ) ──
        if (m.type === 'exploration' && !m.phase?.startsWith('return') && gameYear >= m.arrivalYear) {
          const target = this._findEntity(m.targetId);
          vessel.position.state = 'orbiting';
          vessel.position.dockedAt = m.targetId;
          vessel.position.x = target?.x ?? m.targetX;
          vessel.position.y = target?.y ?? m.targetY;
          vessel.status = 'on_mission';
          m.phase = 'orbiting_body';

          addMissionLog(vessel, gameYear,
            t('vessel.arrived', target?.name ?? this._resolveEntityName(m.targetId)),
            'success');

          EventBus.emit('vessel:arrived', { vessel, mission: m });
          moving.push(vessel);
          continue;
        }

        // Aktualizuj linie trasy dla latających
        this._updateRouteLine(vessel, m);
        moving.push(vessel);
        continue;
      }

      // Docked z misją — aktualizuj linie trasy
      if (m) {
        this._updateRouteLine(vessel, m);
      }
    }

    if (moving.length > 0) {
      EventBus.emit('vessel:positionUpdate', { vessels: moving });
    }
  }

  /**
   * Aktualizuj wizualne końce linii trasy (śledzą planety w ruchu).
   */
  _updateRouteLine(vessel, m) {
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
    // Trasa krótsza niż 1 px — interpoluj liniowo wg t (unikaj zamrożenia na starcie)
    if (totalLen < 1) return { x: sx + (tx - sx) * t, y: sy + (ty - sy) * t };

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
   * Tick statku w tranzycie międzygwiezdnym.
   * Interpolacja pozycji galaktycznej, sprawdzenie przylotu.
   */
  _tickInterstellar(vessel, m, gameYear) {
    if (gameYear >= m.arrivalYear) {
      // ── Przylot do nowego układu ──
      const ssMgr = window.KOSMOS?.starSystemManager;
      const gd    = window.KOSMOS?.galaxyData;
      const targetStar = gd?.systems?.find(s => s.id === m.toSystemId);

      // Leniwa generacja układu (jeśli jeszcze nie wygenerowany)
      if (ssMgr && targetStar && !ssMgr.getSystem(m.toSystemId)) {
        ssMgr.generateAndRegister(targetStar);
      }

      // Ustaw statek w nowym układzie (pozycja = obrzeża, wolna przestrzeń)
      const sysData = ssMgr?.getSystem(m.toSystemId);
      const star    = sysData ? EntityManager.get(sysData.starEntityId) : null;

      // Obrzeża układu (~MAX_ORBIT_AU) zamiast centrum gwiazdy
      const edgeAU = 30; // AU — obrzeża układu
      const angle = Math.random() * Math.PI * 2;
      const edgePx = edgeAU * AU_TO_PX;
      vessel.systemId = m.toSystemId;
      vessel.position.state = 'orbiting';
      vessel.position.x = Math.cos(angle) * edgePx;  // gwiazda zawsze w (0,0)
      vessel.position.y = Math.sin(angle) * edgePx;
      vessel.position.dockedAt = null; // nie orbituje gwiazdy — wolna przestrzeń
      vessel.status = 'on_mission'; // nadal na misji — gracz musi zdecydować co dalej
      m.phase = 'in_system';

      // Wpis do dziennika
      addMissionLog(vessel, gameYear,
        t('vessel.interstellarArrived', m.targetName ?? m.toSystemId),
        'success');

      // Stats
      if (vessel.stats) vessel.stats.distanceTraveled += (m.distLY ?? 0) * AU_TO_PX;

      // Event — UI pokaże popup
      EventBus.emit('interstellar:arrived', {
        vessel,
        systemId: m.toSystemId,
        star,
        targetName: m.targetName,
      });
      return;
    }

    // Interpolacja pozycji galaktycznej (do wizualizacji na mapie galaktyki)
    const totalTravel = (m.arrivalYear ?? 1) - (m.departYear ?? 0);
    if (totalTravel > 0.0001) {
      const progress = Math.max(0, Math.min(1, (gameYear - m.departYear) / totalTravel));
      m.galProgress = progress;
      // Pozycja w przestrzeni galaktycznej (LY) — do rysowania na mapie
      m.currentGalX = (m.fromGalX ?? 0) + ((m.toGalX ?? 0) - (m.fromGalX ?? 0)) * progress;
      m.currentGalY = (m.fromGalY ?? 0) + ((m.toGalY ?? 0) - (m.fromGalY ?? 0)) * progress;
    }
  }

  /**
   * Oblicz trasę z unikaniem Słońca i ciał niebieskich.
   * Zwraca { waypoints: [{x,y}], totalDist } w jednostkach fizyki gry (px).
   */
  _calcRoute(sx, sy, tx, ty, systemId) {
    const dx = tx - sx, dy = ty - sy;
    const lenSq = dx * dx + dy * dy;
    const directDist = Math.sqrt(lenSq);
    // Bardzo krótki dystans — linia prosta, bez unikania (zapobiega NaN z division by ~0)
    if (lenSq < 1 || directDist < 0.01) return { waypoints: [], totalDist: Math.max(directDist, 0) };

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

    // ── Krok 2: unikanie planet i księżyców (tylko z aktywnego układu) ──
    const BODY_MARGIN = 0.15 * AU_TO_PX; // 0.15 AU margines
    const routeSysId = systemId ?? window.KOSMOS?.activeSystemId ?? 'sys_home';
    const allBodies = [
      ...EntityManager.getByTypeInSystem('planet', routeSysId),
      ...EntityManager.getByTypeInSystem('moon', routeSysId),
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
    const redirectSysId = vessel.systemId ?? this._findEntity(vessel.colonyId)?.systemId ?? 'sys_home';
    const route = this._calcRoute(m.startX, m.startY, m.targetX, m.targetY, redirectSysId);
    m.waypoints = route.waypoints;

    // Zużyj paliwo za nowy odcinek (consumption = pc/AU, totalDist w px)
    const fuelCost = (route.totalDist / AU_TO_PX) * vessel.fuel.consumption;
    vessel.fuel.current = Math.max(0, vessel.fuel.current - fuelCost);

    vessel.position.state = 'in_transit';
  }

  /**
   * Przekieruj statek po przylecie międzygwiezdnym do planety w nowym układzie.
   * Akceptuje: interstellar_jump(in_system), exploration(orbiting_body), foreign_recon(orbiting_body).
   */
  _redirectInterstellarVessel(vesselId, targetId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return;
    const m = vessel.mission;
    if (!m) return;
    // Akceptuj różne fazy przylotu w obcym układzie
    const isInterstellar = m.type === 'interstellar_jump' && m.phase === 'in_system';
    const isOrbiting = (m.type === 'exploration' || m.type === 'foreign_recon') && m.phase === 'orbiting_body';
    if (!isInterstellar && !isOrbiting) return;

    const target = this._findEntity(targetId);
    if (!target) return;

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const ship = SHIPS[vessel.shipId];
    const speedAU = (ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);

    // Odległość od gwiazdy (pozycja statku) do planety (AU)
    const dx = (target.x - vessel.position.x) / AU_TO_PX;
    const dy = (target.y - vessel.position.y) / AU_TO_PX;
    const distAU = Math.sqrt(dx * dx + dy * dy);
    const travelYears = distAU / speedAU;
    const arrivalYear = gameYear + travelYears;

    // Zużyj paliwo in-system (pc/AU)
    const fuelEffMult = window.KOSMOS?.techSystem?.getFuelEfficiency?.() ?? 1.0;
    const fuelPerAU = (ship?.fuelPerAU ?? 1) * fuelEffMult;
    const fuelCost = distAU * fuelPerAU;
    vessel.fuel.current = Math.max(0, vessel.fuel.current - fuelCost);

    // Przygotuj standardową misję in-system (exploration/transit)
    const predicted = this._predictPosition(targetId, arrivalYear);
    const targetSysId = this._findEntity(targetId)?.systemId ?? vessel.systemId ?? 'sys_home';
    const route = this._calcRoute(vessel.position.x, vessel.position.y, predicted.x, predicted.y, targetSysId);

    vessel.mission = {
      type:        'exploration',
      targetId,
      startX:      vessel.position.x,
      startY:      vessel.position.y,
      targetX:     predicted.x,
      targetY:     predicted.y,
      departYear:  gameYear,
      arrivalYear,
      waypoints:   route.waypoints,
      originId:    m.fromSystemId ?? m.originId ?? vessel.colonyId, // macierzysty układ
      fuelCost,
    };

    vessel.status = 'on_mission';
    vessel.position.state = 'in_transit';
    vessel.position.dockedAt = null;

    addMissionLog(vessel, gameYear,
      t('vessel.arrived', target.name ?? targetId), 'info');

    EventBus.emit('vessel:launched', { vessel, mission: vessel.mission });
  }

  // ── Rozkazy w obcym układzie ───────────────────────────────────────────

  /**
   * Recon ciała lub całego układu z obcego systemu.
   * @param {string} vesselId
   * @param {string|null} targetId — id ciała (scope='target') lub null (scope='full_system')
   * @param {'target'|'full_system'} scope
   */
  _startForeignRecon(vesselId, targetId, scope) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return;
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const systemId = vessel.systemId;

    if (scope === 'target' && targetId) {
      // Recon konkretnego ciała — 0.02 roku (~7 dni) na zbadanie
      vessel.mission = {
        type: 'foreign_recon',
        scope: 'target',
        targetId,
        systemId,
        startYear: gameYear,
        completeYear: gameYear + 0.02,
        phase: 'scanning',
      };
      vessel.status = 'on_mission';

      addMissionLog(vessel, gameYear,
        t('vessel.foreignReconStart', this._resolveEntityName(targetId)), 'info');
      return;
    }

    if (scope === 'full_system') {
      // Recon całego układu — zbierz niezbadane ciała, greedy NN
      const allBodies = [
        ...EntityManager.getByTypeInSystem('planet', systemId),
        ...EntityManager.getByTypeInSystem('moon', systemId),
        ...EntityManager.getByTypeInSystem('planetoid', systemId),
      ].filter(b => !b.explored);

      if (allBodies.length === 0) {
        addMissionLog(vessel, gameYear, t('vessel.foreignReconAllDone'), 'info');
        return;
      }

      // Greedy nearest neighbor
      const targets = [];
      const remaining = [...allBodies];
      let cx = vessel.position.x, cy = vessel.position.y;
      while (remaining.length > 0) {
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const d = Math.hypot(remaining[i].x - cx, remaining[i].y - cy);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        const chosen = remaining.splice(bestIdx, 1)[0];
        targets.push(chosen.id);
        cx = chosen.x; cy = chosen.y;
      }

      // Oblicz czas do pierwszego ciała
      const firstTarget = this._findEntity(targets[0]);
      const ship = SHIPS[vessel.shipId];
      const speedAU = (ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
      const distAU = Math.hypot(
        (firstTarget.x - vessel.position.x) / AU_TO_PX,
        (firstTarget.y - vessel.position.y) / AU_TO_PX
      );
      const travelYears = distAU / speedAU;

      vessel.mission = {
        type: 'foreign_recon',
        scope: 'full_system',
        systemId,
        targets,          // id ciał w kolejności odwiedzania
        currentIdx: 0,
        phase: 'traveling', // traveling → scanning → traveling → ...
        startX: vessel.position.x,
        startY: vessel.position.y,
        targetX: firstTarget.x,
        targetY: firstTarget.y,
        departYear: gameYear,
        arrivalYear: gameYear + travelYears,
        scanCompleteYear: null,
      };
      vessel.status = 'on_mission';
      vessel.position.state = 'in_transit';
      vessel.position.dockedAt = null;

      addMissionLog(vessel, gameYear,
        t('vessel.foreignReconSystemStart', targets.length), 'info');
    }
  }

  /**
   * Tick logiki foreign_recon (scope='target' i 'full_system').
   */
  _tickForeignRecon(vessel, m, gameYear) {
    if (m.scope === 'target') {
      // Czekaj na zakończenie skanowania
      if (gameYear >= m.completeYear) {
        const target = this._findEntity(m.targetId);
        if (target) {
          target.explored = true;
          // Auto-discover księżyce
          const moons = EntityManager.getByTypeInSystem('moon', m.systemId)
            .filter(moon => moon.parentPlanetId === m.targetId);
          moons.forEach(moon => { moon.explored = true; });

          const discovered = [target, ...moons];
          EventBus.emit('expedition:reconProgress', {
            body: target,
            discovered,
          });
          addMissionLog(vessel, gameYear,
            t('vessel.foreignReconDone', target.name ?? m.targetId), 'success');
        }
        // Zakończ misję — statek gotowy na nowe rozkazy
        vessel.position.state = 'orbiting';
        vessel.position.dockedAt = m.targetId;
        m.phase = 'orbiting_body';
        m.type = 'exploration'; // przywróć typ aby UI pokazywał panel orbiting_body
      }
      return;
    }

    // full_system
    if (m.phase === 'traveling') {
      // Interpolacja pozycji do bieżącego celu
      const totalTravel = (m.arrivalYear ?? 1) - (m.departYear ?? 0);
      if (totalTravel > 0.0001) {
        const t2 = Math.max(0, Math.min(1, (gameYear - m.departYear) / totalTravel));
        const pos = this._interpolateWaypoints(
          m.startX, m.startY, m.targetX, m.targetY,
          m.waypoints ?? [], t2
        );
        vessel.position.x = pos.x;
        vessel.position.y = pos.y;
      }

      // Przylot do ciała
      if (gameYear >= m.arrivalYear) {
        const bodyId = m.targets[m.currentIdx];
        const body = this._findEntity(bodyId);
        if (body) {
          vessel.position.x = body.x;
          vessel.position.y = body.y;
        }
        m.phase = 'scanning';
        m.scanCompleteYear = gameYear + 0.02; // ~7 dni na skan
      }
      return;
    }

    if (m.phase === 'scanning') {
      if (gameYear >= m.scanCompleteYear) {
        const bodyId = m.targets[m.currentIdx];
        const body = this._findEntity(bodyId);
        if (body) {
          body.explored = true;
          // Auto-discover księżyce
          const moons = EntityManager.getByTypeInSystem('moon', m.systemId)
            .filter(moon => moon.parentPlanetId === bodyId);
          moons.forEach(moon => { moon.explored = true; });

          const discovered = [body, ...moons];
          EventBus.emit('expedition:reconProgress', {
            body,
            discovered,
          });
          addMissionLog(vessel, gameYear,
            t('vessel.foreignReconDone', body.name ?? bodyId), 'success');
        }

        // Następne ciało lub koniec
        m.currentIdx++;
        if (m.currentIdx >= m.targets.length) {
          // Cały układ zbadany
          EventBus.emit('expedition:reconComplete', {
            scope: 'full_system',
            discovered: m.targets.map(id => this._findEntity(id)).filter(Boolean),
          });
          addMissionLog(vessel, gameYear, t('vessel.foreignReconSystemDone'), 'success');

          // Statek przechodzi w orbiting ostatniego ciała
          vessel.position.state = 'orbiting';
          vessel.position.dockedAt = bodyId;
          m.phase = 'orbiting_body';
          m.type = 'exploration'; // przywróć typ
          return;
        }

        // Leć do następnego ciała
        const nextId = m.targets[m.currentIdx];
        const nextBody = this._findEntity(nextId);
        const ship = SHIPS[vessel.shipId];
        const speedAU = (ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
        const distAU = Math.hypot(
          ((nextBody?.x ?? 0) - vessel.position.x) / AU_TO_PX,
          ((nextBody?.y ?? 0) - vessel.position.y) / AU_TO_PX
        );
        const travelYears = Math.max(0.01, distAU / speedAU);

        m.phase = 'traveling';
        m.startX = vessel.position.x;
        m.startY = vessel.position.y;
        m.targetX = nextBody?.x ?? 0;
        m.targetY = nextBody?.y ?? 0;
        m.departYear = gameYear;
        m.arrivalYear = gameYear + travelYears;
        m.waypoints = [];
        vessel.position.state = 'in_transit';
        vessel.position.dockedAt = null;
      }
    }
  }

  /**
   * Kolonizacja ciała w obcym układzie.
   */
  _startForeignColonize(vesselId, targetId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return;
    const target = this._findEntity(targetId);
    if (!target || !target.explored) return;

    // Sprawdź typ ciała — rocky, ice, lub planetoid
    const validTypes = ['rocky', 'ice', 'planetoid'];
    if (!validTypes.includes(target.planetType) && target.type !== 'planetoid') return;

    // Sprawdź czy nie jest już skolonizowany
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;
    if (colMgr.getColony(targetId)) return;

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const ship = SHIPS[vessel.shipId];
    const startPop = ship?.colonists ?? 2;

    // Zasoby startowe
    const startResources = {
      Fe: 200, C: 100, Si: 80, Cu: 30, Ti: 10,
      food: 80, water: 80,
    };

    // Dodaj cargo jako dodatkowe zasoby
    if (vessel.cargo) {
      for (const [key, qty] of Object.entries(vessel.cargo)) {
        if (qty > 0) startResources[key] = (startResources[key] ?? 0) + qty;
      }
      vessel.cargo = {};
      vessel.cargoUsed = 0;
    }

    // Utwórz outpost lub pełną kolonię
    if (startPop >= 2) {
      // Colony ship — pełna kolonia
      colMgr.createOutpost(targetId, startResources, gameYear);
      colMgr.upgradeOutpostToColony(targetId, startPop);
    } else {
      // Mały statek — outpost
      colMgr.createOutpost(targetId, startResources, gameYear);
    }

    addMissionLog(vessel, gameYear,
      t('vessel.foreignColonized', target.name ?? targetId), 'success');

    EventBus.emit('expedition:colonyFounded', {
      planetId: targetId,
      startResources,
      startPop,
    });

    // Zniszcz statek (colony ship jest jednorazowy)
    const colonyId = vessel.colonyId;
    const colony = colMgr.getColony(colonyId);
    if (colony) {
      const idx = colony.fleet.indexOf(vesselId);
      if (idx !== -1) colony.fleet.splice(idx, 1);
    }
    this._vessels.delete(vesselId);
    EventBus.emit('vessel:docked', { vessel }); // usunie sprite
  }

  /**
   * Rozładunek cargo w obcym układzie.
   */
  _startForeignUnload(vesselId, targetId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel || !vessel.cargo) return;

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const colMgr = window.KOSMOS?.colonyManager;
    const target = this._findEntity(targetId);
    if (!target) return;

    let colony = colMgr?.getColony(targetId);

    // Jeśli brak kolonii — utwórz outpost z cargo jako zasoby startowe
    if (!colony && colMgr) {
      const startRes = {};
      for (const [key, qty] of Object.entries(vessel.cargo)) {
        if (qty > 0) startRes[key] = qty;
      }
      colMgr.createOutpost(targetId, startRes, gameYear);
      vessel.cargo = {};
      vessel.cargoUsed = 0;

      addMissionLog(vessel, gameYear,
        t('vessel.foreignUnloadOutpost', target.name ?? targetId), 'success');
      return;
    }

    // Jest kolonia — dodaj cargo do zasobów
    if (colony) {
      const resSys = colony.resourceSystem;
      for (const [key, qty] of Object.entries(vessel.cargo)) {
        if (qty > 0 && resSys) {
          const current = resSys.getAmount?.(key) ?? resSys.resources?.[key] ?? 0;
          if (resSys.resources) resSys.resources[key] = current + qty;
        }
      }
      vessel.cargo = {};
      vessel.cargoUsed = 0;

      addMissionLog(vessel, gameYear,
        t('vessel.foreignUnloadColony', target.name ?? targetId), 'success');
    }
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

    // Planeta/planetoid: orbita wokół gwiazdy (znajdź gwiazdę tego układu)
    const sysId = entity.systemId;
    const star = sysId
      ? EntityManager.getStarOfSystem(sysId)
      : EntityManager.getByType('star')[0];
    const starX = star?.x ?? 0;
    const starY = star?.y ?? 0;
    return {
      x: starX + r * Math.cos(angle) * AU_TO_PX,
      y: starY + r * Math.sin(angle) * AU_TO_PX,
    };
  }

  /**
   * Znajdź encję po id — O(1) lookup z EntityManager.
   */
  _findEntity(targetId) {
    if (!targetId) return null;
    return EntityManager.get(targetId);
  }

  /**
   * Rozwiąż czytelną nazwę encji/kolonii po ID.
   * Fallback: EntityManager → ColonyManager → raw ID.
   */
  _resolveEntityName(entityId) {
    if (!entityId) return '???';
    const entity = this._findEntity(entityId);
    if (entity?.name) return entity.name;
    // Fallback: kolonia może mieć nazwę w ColonyManager
    const colony = window.KOSMOS?.colonyManager?.getColony(entityId);
    if (colony?.name) return colony.name;
    return entityId;
  }
}
