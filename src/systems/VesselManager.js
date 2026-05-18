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
import { HULLS }      from '../data/HullsData.js';

// Helper: pobierz definicję kadłuba (legacy SHIPS lub nowe HULLS)
function _getHullDef(id) { return SHIPS[id] ?? HULLS[id]; }
import { GAME_CONFIG } from '../config/GameConfig.js';
import {
  createVessel, effectiveRange, canReach, consumeFuel, refuel,
  needsRefuel, getShipDef, setNextVesselId, getNextVesselId,
  addMissionLog, getEnduranceDefaults,
} from '../entities/Vessel.js';
import { getModuleCapabilities, calcShipStats, SHIP_MODULES } from '../data/ShipModulesData.js';
import {
  serializeNameCounters, restoreNameCounters,
} from '../data/VesselNames.js';
import { t } from '../i18n/i18n.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX; // 110

// Strefa wykluczenia wokół gwiazdy (w jednostkach fizyki gry = AU × AU_TO_PX)
const SUN_EXCLUSION_AU = 0.3;                           // AU
const SUN_EXCLUSION    = SUN_EXCLUSION_AU * AU_TO_PX;   // px — promień strefy
const SUN_MARGIN       = 0.1 * AU_TO_PX;                // margines ominięcia

// Tankowanie: ile jednostek paliwa/rok docked vessel ładuje (z inventory kolonii)
const REFUEL_RATES = {
  power_cells:  3,    // jednostek/rok
  plasma_cores: 1,    // jednostek/rok
  warp_cores:   0.5,  // jednostek/rok
};
// Koszt energetyczny: ile energy z inventory kolonii za 1 power_cell
const ENERGY_PER_PC = 5;

export class VesselManager {
  constructor() {
    /** @type {Map<string, object>} vesselId → VesselInstance */
    this._vessels = new Map();

    // ── EventBus ──────────────────────────────────────────────────
    EventBus.on('fleet:shipCompleted', ({ planetId, shipId, modules = [] }) =>
      this._onShipCompleted(planetId, shipId, modules));

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

    // M1 Targeting — resume oryginalnej mission po zakończeniu/anulowaniu orderu.
    //   Mission została suspended przez MOS._suspendMissionIfAny przy issue;
    //   tu rebuildujemy route od aktualnej pozycji do docelowego targetu.
    EventBus.on('vessel:orderCompleted', ({ vesselId }) =>
      this._resumeMissionAfterOrder(vesselId));
    EventBus.on('vessel:orderCancelled', ({ vesselId }) =>
      this._resumeMissionAfterOrder(vesselId));

    // M4 P2 — Battle history stamp. battle:resolved emit przez
    // WarSystem.recordBattle ORAZ VesselCombatSystem._applyOutcome. Stamp obie
    // strony — vessele które wygrały też mogą zostać wrakami w future battles,
    // ale field zawsze pokazuje OSTATNIĄ bitwę. FleetManagerOverlay wrak row
    // używa lastBattleId tylko gdy vessel.isWreck.
    EventBus.on('battle:resolved', ({ battleId, result }) => {
      if (!battleId || !result) return;
      const year = result.year ?? (window.KOSMOS?.timeSystem?.gameTime ?? 0);
      const stamp = (ids) => {
        if (!Array.isArray(ids)) return;
        for (const id of ids) {
          const v = this._vessels.get(id);
          if (!v) continue;
          v.lastBattleId   = battleId;
          v.lastBattleYear = year;
        }
      };
      stamp(result.participantA?.vesselIds);
      stamp(result.participantB?.vesselIds);
    });

    // Rozkazy w obcym układzie
    EventBus.on('expedition:foreignRecon', ({ vesselId, targetId, scope }) =>
      this._startForeignRecon(vesselId, targetId, scope));
    EventBus.on('expedition:foreignColonize', ({ vesselId, targetId }) =>
      this._startForeignColonize(vesselId, targetId));
    EventBus.on('expedition:foreignUnload', ({ vesselId, targetId }) =>
      this._startForeignUnload(vesselId, targetId));

    // Full Scan z orbity
    EventBus.on('vessel:fullScan', ({ vesselId, targetId }) =>
      this._startFullScan(vesselId, targetId));

    // Away Team
    EventBus.on('vessel:sendAwayTeam', ({ vesselId, targetId }) =>
      this._sendAwayTeam(vesselId, targetId));
    EventBus.on('vessel:collectAwayTeam', ({ vesselId }) =>
      this._collectAwayTeam(vesselId));
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

    // Zachowaj bazowe zużycie paliwa (przed tech efficiency) — do dispatchOnMission
    vessel._baseFuelPerAU = vessel.fuel.consumption;

    // Oblicz colonistCapacity z modułów (habitat_pod, cryo_pod)
    let colCap = 0;
    if (vessel.modules?.length) {
      for (const modId of vessel.modules) {
        const mod = SHIP_MODULES[modId];
        if (mod?.stats?.colonistCapacity) colCap += mod.stats.colonistCapacity;
      }
    }
    vessel.colonistCapacity = colCap;

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
      if (this._vesselHasCapability(v, capability)) return v;
    }
    return null;
  }

  // Sprawdź czy statek ma daną zdolność (kadłub + moduły)
  _vesselHasCapability(v, capability) {
    // Sprawdź capability z hull definition
    const hullCaps = _getHullDef(v.shipId)?.capabilities ?? [];
    if (hullCaps.includes(capability)) return true;
    // Sprawdź capability z modułów
    if (v.modules?.length) {
      const moduleCaps = getModuleCapabilities(v.modules);
      if (moduleCaps.has(capability)) return true;
      // Każdy statek z napędem może robić recon/survey
      if ((capability === 'recon' || capability === 'survey') &&
          v.modules.some(m => SHIP_MODULES[m]?.slotType === 'propulsion')) {
        return true;
      }
    }
    return false;
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
    // Bazowe zużycie z modułów+masy (vessel.fuel.consumption ustawione przy tworzeniu)
    const baseFuelPerAU = vessel._baseFuelPerAU ?? vessel.fuel.consumption ?? _getHullDef(vessel.shipId)?.fuelPerAU ?? 0.5;
    const fuelEffMult = window.KOSMOS?.techSystem?.getFuelEfficiency() ?? 1.0;
    // Faza D2a hook: dyson_transmitter +100% zasięg (= fuelPerAU ×0.5)
    const dysonRangeMult = (window.KOSMOS?.techSystem?.isResearched?.('dyson_transmitter') ?? false) ? 0.5 : 1.0;
    vessel.fuel.consumption = baseFuelPerAU * fuelEffMult * dysonRangeMult;

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
    m.returnTargetX = predictedHome.x ?? m.startX;
    m.returnTargetY = predictedHome.y ?? m.startY;
    m.phase = 'returning';

    // Oblicz waypoints powrotne (unikanie Słońca + ciał niebieskich)
    let returnRoute = { waypoints: [], totalDist: 0 };
    try {
      const returnSysId = vessel.systemId ?? this._findEntity(vessel.colonyId)?.systemId ?? 'sys_home';
      returnRoute = this._calcRoute(m.returnStartX, m.returnStartY, m.returnTargetX, m.returnTargetY, returnSysId);
    } catch (e) {
      console.warn('[VesselManager] _calcRoute failed in startReturn, using direct route:', e);
      const dx = (m.returnTargetX ?? 0) - (m.returnStartX ?? 0);
      const dy = (m.returnTargetY ?? 0) - (m.returnStartY ?? 0);
      returnRoute = { waypoints: [], totalDist: Math.sqrt(dx * dx + dy * dy) };
    }
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

    const shipDef = _getHullDef(vessel.shipId);
    if (!shipDef) return false;

    // Warp capability pochodzi z modułów (engine_warp) — nie z kadłuba.
    // Legacy fallback: flaga na hullDef (starsze save'y / jednostki debugowe).
    const stats = Array.isArray(vessel.modules) && vessel.modules.length > 0
      ? calcShipStats(shipDef, vessel.modules)
      : null;
    const isWarpCapable = stats?.warpCapable === true || shipDef.warpCapable === true;
    if (!isWarpCapable) return false;

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

    // Prędkość warp (z bonusem beacon) — z modułów jeśli dostępne
    const baseSpeed = stats?.warpSpeedLY || shipDef.warpSpeedLY || 2.5; // LY/rok
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
   * Oznacz statek jako zużyty/zniszczony (colony_ship, katastrofa, walka orbitalna).
   * Usuwa z rejestru + z colony.fleet. Jednostki naziemne w troop bay GINĄ razem
   * ze statkiem (emituje groundUnit:destroyed z cause='transport_lost').
   */
  destroyVessel(vesselId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return;

    // Jednostki naziemne w ładowni giną razem ze statkiem (dramaturgia desantu)
    if (vessel.groundUnits?.length > 0) {
      const gum = window.KOSMOS?.groundUnitManager;
      for (const unitId of [...vessel.groundUnits]) {
        const unit = gum?.getUnit?.(unitId);
        if (unit) {
          EventBus.emit('groundUnit:destroyed', {
            unitId,
            planetId: unit.planetId ?? vessel.colonyId,
            cause: 'transport_lost',
            archetypeId: unit.archetypeId,
            popCost: unit.popCost ?? 0,
            ownerId: unit.owner ?? null,
          });
          gum?.removeUnit?.(unitId);
        }
      }
      vessel.groundUnits = [];
      vessel.troopBayUsed = 0;
    }

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

  // ── Full Scan z orbity ─────────────────────────────────────────────────

  _startFullScan(vesselId, targetId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel || vessel.position.state !== 'orbiting') return;
    if (vessel.status !== 'idle') return;

    vessel.status = 'on_mission';
    vessel._fullScan = {
      targetId,
      progress: 0,
      duration: 0.5, // 0.5 roku cywilizacyjnego
    };
  }

  _tickFullScan(vessel, dt) {
    if (!vessel._fullScan) return;
    vessel._fullScan.progress += dt / vessel._fullScan.duration;

    if (vessel._fullScan.progress >= 1) {
      this._completeFullScan(vessel);
    }
  }

  _completeFullScan(vessel) {
    const targetId = vessel._fullScan.targetId;
    vessel._fullScan = null;
    vessel.status = 'idle';

    // Określ tier skanera (najwyższy moduł naukowy)
    let scanTier = 1;
    for (const modId of (vessel.modules ?? [])) {
      const mod = SHIP_MODULES[modId];
      if (mod?.slotType === 'science' && (mod.tier ?? 1) > scanTier) {
        scanTier = mod.tier;
      }
    }

    // Pobierz grid planety
    const colMgr = window.KOSMOS?.colonyManager;
    let grid = colMgr?.getColony(targetId)?.grid;
    if (!grid) {
      // Ciało bez kolonii — pobierz lub wygeneruj tymczasowy grid
      // (anomalie istnieją tylko na gridach w ColonyOverlay)
      // Generuj grid dla niezkolonizowanego ciała
      const entity = this._findEntity(targetId);
      if (entity) {
        // Ciało bez gridu — full scan nie może wykryć anomalii
        // (anomalie generowane przy tworzeniu gridu w ColonyOverlay)
        return;
      }
    }

    if (!grid) return;

    let detectedCount = 0;
    grid.forEach(tile => {
      if (!tile.anomaly) return;
      if (!tile.anomalyDetected) {
        tile.anomalyDetected = true;
        detectedCount++;
      }
      // Tier 2+ ujawnia szczegóły
      if (scanTier >= 2 && !tile.anomalyRevealed) {
        tile.anomalyRevealed = true;
      }
    });

    EventBus.emit('vessel:fullScanComplete', {
      vesselId: vessel.id,
      targetId,
      detectedCount,
      scanTier,
    });
  }

  // ── Away Team ─────────────────────────────────────────────────────────

  _sendAwayTeam(vesselId, targetId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel || vessel.position.state !== 'orbiting') return;
    if (vessel.awayTeamUnitId) return; // już na powierzchni

    // Emituj event → ColonyOverlay wejdzie w tryb wyboru hexa
    EventBus.emit('vessel:awayTeamLanding', {
      vesselId: vessel.id,
      targetId,
    });
  }

  // Wywoływane gdy gracz wybrał hex lądowania
  deployAwayTeam(vesselId, planetId, q, r) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return;

    const mgr = window.KOSMOS?.groundUnitManager;
    if (!mgr) return;

    const unit = mgr.createUnit('science_rover', planetId, q, r);
    if (unit) {
      vessel.awayTeamUnitId = unit.id;
      EventBus.emit('vessel:awayTeamDeployed', {
        vesselId: vessel.id,
        unitId:   unit.id,
        planetId, q, r,
      });
    }
  }

  _collectAwayTeam(vesselId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel || !vessel.awayTeamUnitId) return;

    const mgr = window.KOSMOS?.groundUnitManager;
    if (mgr) {
      mgr.removeUnit(vessel.awayTeamUnitId);
    }

    const unitId = vessel.awayTeamUnitId;
    vessel.awayTeamUnitId = null;

    EventBus.emit('vessel:awayTeamCollected', {
      vesselId: vessel.id,
      unitId,
    });
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
      // MovementOrder — deep-copy (jak mission). null gdy brak rozkazu.
      let movementOrderData = null;
      if (v.movementOrder) {
        movementOrderData = { ...v.movementOrder };
        if (movementOrderData.targetPoint)    movementOrderData.targetPoint    = { ...movementOrderData.targetPoint };
        if (movementOrderData.lastTargetPos)  movementOrderData.lastTargetPos  = { ...movementOrderData.lastTargetPos };
        if (movementOrderData.interceptPoint) movementOrderData.interceptPoint = { ...movementOrderData.interceptPoint };
        if (Array.isArray(movementOrderData.patrolRoute)) {
          movementOrderData.patrolRoute = movementOrderData.patrolRoute.map(p => ({ ...p }));
        }
      }
      // Endurance — serializujemy current/max/lastDepleted. drainPerYear/regenPerYear
      // są pochodne z roli/modułów (getEnduranceDefaults) i odtwarzane przy restore.
      const enduranceData = v.endurance ? {
        current:      v.endurance.current,
        max:          v.endurance.max,
        lastDepleted: v.endurance.lastDepleted ?? null,
      } : null;
      // _suspendedMission — oryginalna mission gdy vessel wykonuje movementOrder (§8.3).
      // Bez tego save/load podczas aktywnego orderu gubiłby kontekst resume.
      let suspendedMissionData = null;
      if (v._suspendedMission) {
        suspendedMissionData = { ...v._suspendedMission };
        if (suspendedMissionData.waypoints) {
          suspendedMissionData.waypoints = suspendedMissionData.waypoints.map(w => ({ ...w }));
        }
        if (suspendedMissionData.returnWaypoints) {
          suspendedMissionData.returnWaypoints = suspendedMissionData.returnWaypoints.map(w => ({ ...w }));
        }
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
        modules:      v.modules ?? [],
        cargo:        v.cargo ?? {},
        cargoUsed:    v.cargoUsed ?? 0,
        colonists:    v.colonists ?? 0,
        automation:   v.automation ? { ...v.automation } : { autoReturn: false, autoRefuel: true },
        missionLog:   v.missionLog ? [...v.missionLog] : [],
        stats:        v.stats ? { ...v.stats } : { distanceTraveled: 0, missionsComplete: 0, resourcesHauled: 0, bodiesSurveyed: 0 },
        generation:   v.generation ?? 1,
        fuelType:     v.fuelType ?? 'power_cells',
        speedAU:      v.speedAU ?? 1.0,
        cargoMax:     v.cargoMax ?? 0,
        totalMass:    v.totalMass ?? 0,
        _baseFuelPerAU: v._baseFuelPerAU ?? v.fuel?.consumption ?? 0.5,
        damaged:      v.damaged ?? false,
        _repairProgress: v._repairProgress ?? 0,
        awayTeamUnitId: v.awayTeamUnitId ?? null,
        // Ownership & wreck flags — kluczowe dla filtrów UI (isEnemyVessel)
        // i logiki bitwy. Bez persystowania wrogi statek po load staje się
        // "statkiem gracza" w Outlinerze/Fleet/WarSystem.
        isEnemy:       v.isEnemy ?? false,
        owner:         v.owner ?? null,
        ownerEmpireId: v.ownerEmpireId ?? null,
        isWreck:       v.isWreck ?? false,
        wreckedAt:     v.wreckedAt ?? null,
        // M2a: pozycja wraku w deep-space (gdy dockedAt===null). null dla wraków orbitujących ciała.
        wreckLocation: v.wreckLocation ?? null,
        // Faza desantu: groundUnits (załadowane jednostki), troopBayUsed (runtime used),
        // orbitalStrike (ammoCurrent + cooldown). troopCapacity/canDropTroops są
        // odtwarzane z modułów przy restore — nie trzeba ich zapisywać.
        groundUnits:  Array.isArray(v.groundUnits) ? [...v.groundUnits] : [],
        troopBayUsed: v.troopBayUsed ?? 0,
        orbitalStrike: v.orbitalStrike ? {
          ammoCurrent: v.orbitalStrike.ammoCurrent ?? 0,
          cooldownUntilYear: v.orbitalStrike.cooldownUntilYear ?? 0,
        } : null,
        // ── Milestone 1 — Targeting Foundation ────────────────────────────
        endurance:         enduranceData,
        movementOrder:     movementOrderData,
        suspendedMission:  suspendedMissionData,
        // velocity — celowo pominięte (derived; resync w pierwszym _updatePositions po load)
        // ── M4 P1 — drift state ───────────────────────────────────────────
        // driftIdle/lowFuelDrift muszą przeżyć save/load: MovementOrderSystem
        // odbudowuje _driftingVessels Set z vessel.driftIdle w _indexExistingOrders.
        driftIdle:     v.driftIdle ? { ...v.driftIdle } : null,
        lowFuelDrift:  v.lowFuelDrift ? { ...v.lowFuelDrift } : null,
        // ── M4 P2 — battle history (wraki: ostatnia bitwa) ───────────────
        // Stamp z battle:resolved listener. UI: FleetManagerOverlay
        // expanded wrak row → WarSystem.getBattleRecord(lastBattleId).
        lastBattleId:   v.lastBattleId   ?? null,
        lastBattleYear: v.lastBattleYear ?? null,
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
        modules:      vd.modules ?? [],
        cargo:        vd.cargo ?? {},
        cargoUsed:    vd.cargoUsed ?? 0,
        colonists:    vd.colonists ?? 0,
        colonistCapacity: 0,  // obliczane poniżej z modułów
        automation:   vd.automation ? { ...vd.automation } : { autoReturn: false, autoRefuel: true },
        missionLog:   vd.missionLog ? [...vd.missionLog] : [],
        stats:        vd.stats ? { ...vd.stats } : { distanceTraveled: 0, missionsComplete: 0, resourcesHauled: 0, bodiesSurveyed: 0 },
        generation:   vd.generation ?? 1,
        fuelType:     vd.fuelType ?? 'power_cells',
        speedAU:      vd.speedAU ?? _getHullDef(vd.shipId)?.speedAU ?? 1.0,
        cargoMax:     vd.cargoMax ?? _getHullDef(vd.shipId)?.cargoCapacity ?? 0,
        totalMass:    vd.totalMass ?? _getHullDef(vd.shipId)?.baseMass ?? 30,
        _baseFuelPerAU: vd._baseFuelPerAU ?? vd.fuel?.consumption ?? _getHullDef(vd.shipId)?.fuelPerAU ?? 0.5,
        damaged:      vd.damaged ?? false,
        _repairProgress: vd._repairProgress ?? 0,
        awayTeamUnitId: vd.awayTeamUnitId ?? null,
        // Faza desantu: pola z modułów (troop_bay_*/drop_pods/orbital_strike_battery)
        groundUnits:    Array.isArray(vd.groundUnits) ? [...vd.groundUnits] : [],
        troopCapacity:  0,       // obliczane poniżej z modułów
        troopBayUsed:   vd.troopBayUsed ?? 0,
        canDropTroops:  false,   // obliczane poniżej
        orbitalStrike:  vd.orbitalStrike ? { ...vd.orbitalStrike } : null,
        // Ownership & wreck flags — muszą przeżyć save/load (patrz serialize)
        isEnemy:        vd.isEnemy ?? false,
        owner:          vd.owner ?? null,
        ownerEmpireId:  vd.ownerEmpireId ?? null,
        isWreck:        vd.isWreck ?? false,
        wreckedAt:      vd.wreckedAt ?? null,
        // M2a: deep-space wrak pozycja (null dla żywych i wraków orbitujących ciała)
        wreckLocation:  vd.wreckLocation ?? null,
        // ── Milestone 1 — Targeting Foundation ──────────────────────────────
        // Velocity: derived state, zeruje się przy load; pierwszy tick _updatePositions
        //   ustawi prawidłową wartość z delty pozycji.
        velocity: {
          vx:          0,
          vy:          0,
          updatedYear: 0,
        },
        // Endurance: current/max/lastDepleted z save; drain/regen pochodne z roli.
        endurance: {
          current:       vd.endurance?.current ?? 100,
          max:           vd.endurance?.max     ?? 100,
          drainPerYear:  0,  // wyliczane niżej po odtworzeniu modułów
          regenPerYear:  0,
          lastDepleted:  vd.endurance?.lastDepleted ?? null,
        },
        // MovementOrder: deep-copy po deserializacji z save.
        movementOrder: (() => {
          if (!vd.movementOrder) return null;
          const mo = { ...vd.movementOrder };
          if (mo.targetPoint)    mo.targetPoint    = { ...mo.targetPoint };
          if (mo.lastTargetPos)  mo.lastTargetPos  = { ...mo.lastTargetPos };
          if (mo.interceptPoint) mo.interceptPoint = { ...mo.interceptPoint };
          if (Array.isArray(mo.patrolRoute)) mo.patrolRoute = mo.patrolRoute.map(p => ({ ...p }));
          return mo;
        })(),
        // M4 P1 — drift state restore. MovementOrderSystem._indexExistingOrders
        // odbuduje _driftingVessels Set na podstawie tego pola.
        driftIdle:    vd.driftIdle    ? { ...vd.driftIdle }    : null,
        lowFuelDrift: vd.lowFuelDrift ? { ...vd.lowFuelDrift } : null,
        // M4 P2 — battle history
        lastBattleId:   vd.lastBattleId   ?? null,
        lastBattleYear: vd.lastBattleYear ?? null,
      };
      // _suspendedMission — oryginalna mission zawieszona przez aktywny order.
      if (vd.suspendedMission) {
        const sm = { ...vd.suspendedMission };
        if (sm.waypoints)       sm.waypoints       = sm.waypoints.map(w => ({ ...w }));
        if (sm.returnWaypoints) sm.returnWaypoints = sm.returnWaypoints.map(w => ({ ...w }));
        vessel._suspendedMission = sm;
      }
      // Endurance drain/regen (M1) — pochodne z roli/modułów; odtwarzane po restore.
      const endDef = getEnduranceDefaults(vessel);
      vessel.endurance.drainPerYear = endDef.drain;
      vessel.endurance.regenPerYear = endDef.regen;

      // Przelicz z modułów: colonistCapacity + troop_bay/drop_pods/orbital_strike.
      // Konieczne bo save przechowuje moduły (vessel.modules) ale pola pochodne
      // mogą być stare (pre-Faza desantu) lub niezsynchronizowane.
      if (vessel.modules?.length) {
        const hull = _getHullDef(vessel.shipId);
        const stats = hull ? calcShipStats(hull, vessel.modules) : null;
        if (stats) {
          vessel.colonistCapacity = stats.colonistCapacity ?? 0;
          vessel.troopCapacity    = stats.troopCapacity ?? 0;
          vessel.canDropTroops    = !!stats.canDropTroops;
          // orbitalStrike: zachowaj ammoCurrent/cooldownUntilYear z save, ale weź spec z modułów
          if (stats.orbitalStrike) {
            vessel.orbitalStrike = {
              ...stats.orbitalStrike,
              ammoCurrent:     vd.orbitalStrike?.ammoCurrent ?? 0,
              cooldownUntilYear: vd.orbitalStrike?.cooldownUntilYear ?? 0,
            };
          } else {
            vessel.orbitalStrike = null;
          }
        }
      }

      // Migracja: stare save'y bez masy — przelicz statystyki z modułów
      if (!vd.totalMass && vessel.modules?.length) {
        const hull = _getHullDef(vessel.shipId);
        if (hull) {
          const stats = calcShipStats(hull, vessel.modules);
          vessel.speedAU = stats.speed;
          vessel.fuel.consumption = stats.fuelPerAU;
          vessel.fuel.max = stats.fuelCapacity;
          vessel.cargoMax = stats.cargo;
          vessel.totalMass = stats.totalMass;
          vessel._baseFuelPerAU = stats.fuelPerAU;
        }
      }

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
      if (typeof item === 'string' && _getHullDef(item)) {
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
  _onShipCompleted(planetId, shipId, modules = []) {
    const vessel = this.createAndRegister(shipId, planetId, { modules });
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
    this._tickFullScans(deltaYears);
    this._tickEndurance(deltaYears);
    // M2a ProximitySystem PRZED MOS — combat (event-driven po proximityEnter)
    //   może wreckować target w tym ticku; vessel:wrecked → MOS._onVesselWrecked
    //   ustawia blockReason='target_lost' ZANIM MOS._tick iteruje. Master doc §5.
    //   Hook no-op gdy flag OFF lub system nieinstancjonowany.
    window.KOSMOS?.proximitySystem?._tick?.(deltaYears);
    // M4 P3 DeepSpaceCombatSystem — per-tick fire exchange w active encounters.
    //   Po ProximitySystem (combatRangeEnter event przyjdzie najpierw, encounter
    //   utworzony przed pierwszym tickiem fire), przed MOS (engage order może
    //   zmienić pozycję player vessela w tym samym ticku po fire). Hook no-op
    //   gdy FEATURES.m4DeepSpaceCombat OFF lub system nieinstancjonowany.
    window.KOSMOS?.deepSpaceCombatSystem?._tick?.(deltaYears);
    // M1 Targeting — MovementOrderSystem resolve PRZED _updatePositions
    //   (order może nadpisać mission.targetX/Y; pozycja liczona z mission).
    //   Sync call (nie własny time:tick listener) gwarantuje kolejność.
    window.KOSMOS?.movementOrderSystem?._tick?.(deltaYears);
    this._updatePositions(deltaYears);
    this._tickWreckCleanup();
  }

  /**
   * M1 Targeting — tick endurance (stamina operacyjna).
   *
   * Drain gdy state='in_transit' (pursuit multiplier w M2).
   * Regen gdy state='docked'. Orbiting = neutralny (no drain/regen).
   * Hysteresis dla eventów:
   *   - vessel:enduranceLow     — gdy current ≤ 20% i flag nie podniesiona
   *   - reset flag gdy current ≥ 40%
   *   - vessel:enduranceDepleted — gdy current = 0 i lastDepleted = null
   *   - lastDepleted zeruje się gdy current > 0 (ready na kolejny cykl)
   *
   * @param {number} civDy — civDeltaYears
   */
  _tickEndurance(civDy) {
    if (civDy <= 0) return;
    // M2a post-playtest freeze: endurance drain zamrożony do M3.
    // Wartość `enduranceDrainActive=false` (GameConfig.FEATURES) wyłącza CAŁY
    // tick — nie tylko drain, ale też regen i hysteresis events enduranceLow/
    // enduranceDepleted. Semantyka „zamrożone": istniejące wartości endurance
    // nie zmieniają się. Flip flagi w dev/test (KOSMOS.debug) przywraca M2a
    // Commit 8 behavior dla regresji. Unfreeze w M3 po pełnej reformie fuel.
    if (!GAME_CONFIG.FEATURES?.enduranceDrainActive) return;
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const LOW_THRESHOLD   = 0.20;  // 20%
    const RESET_THRESHOLD = 0.40;  // 40% hysteresis
    // M2a Commit 8: pursue/intercept → drain ×3 (presja zasobowa, nie hard-stop).
    // Hard-stop pursue przy endurance=0 → M3. Wartość ×3 zgodna z design doc
    // §8.7 (domyślna; ×4 odrzucone przez R5 frustracja gracza).
    const PURSUE_DRAIN_MULT = 3.0;

    for (const vessel of this._vessels.values()) {
      if (vessel.isWreck) continue;
      const end = vessel.endurance;
      if (!end) continue;

      const state = vessel.position?.state;
      const orderType = vessel.movementOrder?.type;
      const isPursuing = orderType === 'pursue' || orderType === 'intercept';

      if (state === 'in_transit' || isPursuing) {
        const mult = isPursuing ? PURSUE_DRAIN_MULT : 1.0;
        end.current = Math.max(0, end.current - (end.drainPerYear ?? 0) * mult * civDy);
      } else if (state === 'docked') {
        end.current = Math.min(end.max, end.current + (end.regenPerYear ?? 0) * civDy);
      }
      // orbiting + !pursuing = neutral (bez drain, bez regen)

      const pct = end.max > 0 ? (end.current / end.max) : 0;

      // Hysteresis low/reset
      if (pct <= LOW_THRESHOLD && !vessel._enduranceLowFired) {
        vessel._enduranceLowFired = true;
        EventBus.emit('vessel:enduranceLow', { vesselId: vessel.id, endurance: { ...end } });
      } else if (pct >= RESET_THRESHOLD && vessel._enduranceLowFired) {
        vessel._enduranceLowFired = false;
      }

      // Depleted — raz przy przejściu do zera
      if (end.current <= 0 && end.lastDepleted == null) {
        end.lastDepleted = gameYear;
        EventBus.emit('vessel:enduranceDepleted', { vesselId: vessel.id });
      } else if (end.current > 0 && end.lastDepleted != null) {
        end.lastDepleted = null;
      }
    }
  }

  // Wraki (status='destroyed', isWreck=true) dryfują przez WRECK_LIFETIME_YEARS,
  // potem są sprzątane. To daje graczowi czas zobaczyć że ktoś wygrał bitwę.
  _tickWreckCleanup() {
    const currentYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const LIFETIME = 30; // civYears
    const tr = window.KOSMOS?.threeRenderer;
    const toRemove = [];
    for (const vessel of this._vessels.values()) {
      if (!vessel.isWreck) continue;
      const wreckedAt = vessel.wreckedAt ?? currentYear;
      if (currentYear - wreckedAt >= LIFETIME) toRemove.push(vessel.id);
    }
    for (const id of toRemove) {
      this._vessels.delete(id);
      if (tr?._removeVesselSprite) tr._removeVesselSprite(id);
      EventBus.emit('vessel:destroyed', { vesselId: id });
    }
  }

  _tickFullScans(deltaYears) {
    for (const vessel of this._vessels.values()) {
      if (vessel._fullScan) {
        this._tickFullScan(vessel, deltaYears);
      }
    }
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
      const refuelRate = REFUEL_RATES[ft] ?? 2;
      const wantFuel = refuelRate * deltaYears;
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
      // M1 Targeting — pursue/intercept są zarządzane przez MovementOrderSystem.
      //   MOS ustawia vessel.position i vessel.velocity bezpośrednio przed tym call'em;
      //   tu pomijamy całą logikę interpolacji, tylko push do moving (sprite update).
      const mo = vessel.movementOrder;
      const isOrderControlled = mo?.status === 'active' &&
        (mo.type === 'pursue' || mo.type === 'intercept' || mo.type === 'engage');

      if (isOrderControlled) {
        // Velocity już ustawione przez MOS. Nie zerujemy.
        moving.push(vessel);
        continue;
      }

      // M1 Targeting — velocity default zero (docked/orbiting/wreck = zero wg §2.1).
      // Branches in_transit nadpisują przez _updateVelocityFromDelta po ruchu.
      if (vessel.velocity) {
        vessel.velocity.vx = 0;
        vessel.velocity.vy = 0;
        vessel.velocity.updatedYear = gameYear;
      }

      const m = vessel.mission;

      // Wraki — aktualizuj pozycję z OrbitalSpaceSystem żeby podążały za planetą
      // (planeta krąży wokół gwiazdy, więc wrak bez tego zostawałby w starej pozycji).
      if (vessel.isWreck && vessel.position?.dockedAt) {
        const body = this._findEntity(vessel.position.dockedAt);
        if (body) {
          const orbital = window.KOSMOS?.orbitalSpaceSystem;
          const orbit = orbital?.getOrbit?.(vessel.id);
          if (orbit) {
            const tSec = performance.now() * 0.001;
            const pos = orbital.getPosition(
              vessel.id,
              { x: body.x / 10, z: body.y / 10 },
              tSec
            );
            if (pos) {
              vessel.position.x = pos.x * 10;
              vessel.position.y = pos.z * 10;
              moving.push(vessel);
            }
          }
        }
        continue;
      }

      // Docked statki — synchronizuj pozycję z planetą macierzystą
      if (vessel.position.state === 'docked' && vessel.position.dockedAt) {
        const entity = this._findEntity(vessel.position.dockedAt);
        if (entity) {
          vessel.position.x = entity.x;
          vessel.position.y = entity.y;
        }
        continue;
      }

      // Orbitujące statki z misją — pozycja z OrbitalSpaceSystem (jeśli jest
       // zarejestrowany), inaczej fallback na pozycję ciała macierzystego.
      if (vessel.position.state === 'orbiting' && m) {
        const body = this._findEntity(m.targetId);
        if (body) {
          const orbital = window.KOSMOS?.orbitalSpaceSystem;
          const orbit = orbital?.getOrbit?.(vessel.id);
          if (orbit) {
            const tSec = performance.now() * 0.001;
            const pos = orbital.getPosition(
              vessel.id,
              { x: body.x / 10, z: body.y / 10 },
              tSec
            );
            if (pos) {
              vessel.position.x = pos.x * 10;
              vessel.position.y = pos.z * 10;
            } else {
              vessel.position.x = body.x;
              vessel.position.y = body.y;
            }
          } else {
            vessel.position.x = body.x;
            vessel.position.y = body.y;
          }
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

      // Orbitujące BEZ misji — pozycja z OrbitalSpaceSystem (sferyczne koordynaty).
      // Stary kod ustawiał (x, y) = pozycja planety → wszystkie orbitujące statki
      // siedziały w jednym miejscu w tactical map. Teraz czerpiemy projekcję 2D
      // (x, z) z world-space pozycji zwracanej przez OrbitalSpaceSystem.
      if (vessel.position.state === 'orbiting' && !m && vessel.position.dockedAt) {
        const body = this._findEntity(vessel.position.dockedAt);
        if (!body) { continue; }

        const orbital = window.KOSMOS?.orbitalSpaceSystem;
        const tSec = performance.now() * 0.001;
        const orbit = orbital?.getOrbit?.(vessel.id);
        if (orbit) {
          // World-space Three.js — mnożymy przez WORLD_SCALE żeby dostać jednostki fizyki (px)
          // WORLD_SCALE=10 (patrz ThreeRenderer); pozycja body w px jest bezpośrednio.
          const pos = orbital.getPosition(
            vessel.id,
            { x: (body.x ?? 0) / 10, z: (body.y ?? 0) / 10 },
            tSec
          );
          if (pos) {
            vessel.position.x = pos.x * 10;  // przelicz z Three-unit na px
            vessel.position.y = pos.z * 10;
          } else {
            vessel.position.x = body.x;
            vessel.position.y = body.y;
          }
        } else {
          // Brak orbity w rejestrze — fallback: przy planecie
          vessel.position.x = body.x;
          vessel.position.y = body.y;
        }
        moving.push(vessel);
        continue;
      }

      if (vessel.position.state === 'in_transit' && m) {
        // ── Misja międzygwiezdna (warp transit) ──
        if (m.type === 'interstellar_jump' && m.phase === 'warp_transit') {
          const _preX = vessel.position.x, _preY = vessel.position.y;
          this._tickInterstellar(vessel, m, gameYear);
          this._updateVelocityFromDelta(vessel, _preX, _preY, deltaYears, gameYear);
          moving.push(vessel);
          continue;
        }

        // ── Foreign recon (full_system) — własna logika interpolacji i skanowania ──
        // Uwaga: returning phase przechodzi dalej do standardowej interpolacji powrotu
        if (m.type === 'foreign_recon' && m.scope === 'full_system' && m.phase !== 'returning') {
          const _preX = vessel.position.x, _preY = vessel.position.y;
          this._tickForeignRecon(vessel, m, gameYear);
          this._updateVelocityFromDelta(vessel, _preX, _preY, deltaYears, gameYear);
          this._updateRouteLine(vessel, m);
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

        // M1: velocity z delty pozycji (AU/civYear) — przed ewentualnym snap'em
        // do targetu przy arrival (który teleportuje pozycję i dałby NaN-wa prędkość).
        this._updateVelocityFromDelta(vessel, prevX, prevY, deltaYears, gameYear);

        // ── Detekcja przylotu — statek dotarł do celu ──
        if (!m.phase?.startsWith('return') && gameYear >= m.arrivalYear) {
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
   * M1 Targeting — resume oryginalnej mission po zakończeniu/anulowaniu orderu (§8.3).
   *
   * vessel._suspendedMission to deep-copy oryginalnej mission (z flagą
   * suspendedDuringReturn). Rebuildujemy route od aktualnej pozycji do docelowego
   * targetu (dla returning → originId, dla outgoing → targetId).
   *
   * @param {string} vesselId
   */
  _resumeMissionAfterOrder(vesselId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel) return;
    const snapshot = vessel._suspendedMission;
    if (!snapshot) return;  // brak zawieszonej mission — nic do resume

    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;

    const isReturning = !!snapshot.suspendedDuringReturn;
    const destId = isReturning
      ? (snapshot.originId ?? vessel.colonyId)
      : snapshot.targetId;
    const destEntity = this._findEntity(destId);

    if (!destEntity) {
      // Target lost (planeta zniszczona / outpost usunięty itp.) — anuluj mission.
      console.warn(`[VesselManager] _resumeMissionAfterOrder: destEntity ${destId} nie istnieje — drop mission`);
      delete vessel._suspendedMission;
      vessel.mission = null;
      vessel.status = 'idle';
      return;
    }

    const sx = vessel.position.x;
    const sy = vessel.position.y;
    const speedAU = vessel.speedAU ?? 1.0;

    // Szybki estimate czasu podróży (distance z aktualnej pos do bieżącej pos celu).
    // Dla ruchomych planet kepler'owskich ten estimate jest przybliżeniem — używamy
    // go jako arrivalYear, potem predict ciała na ten arrivalYear dla targetX/Y/waypoints.
    const dxEst = (destEntity.x ?? sx) - sx;
    const dyEst = (destEntity.y ?? sy) - sy;
    const distAUEst = Math.hypot(dxEst, dyEst) / AU_TO_PX;
    const travelYears = distAUEst / Math.max(0.01, speedAU);
    const arrivalYear = gameYear + travelYears;

    // Predict pozycji celu na moment arrival (kepler) — jak w dispatchOnMission.
    const predicted = this._predictPosition(destId, arrivalYear);
    const tx = predicted?.x ?? destEntity.x ?? sx;
    const ty = predicted?.y ?? destEntity.y ?? sy;

    const sysId = vessel.systemId ?? destEntity.systemId ?? 'sys_home';
    const route = this._calcRoute(sx, sy, tx, ty, sysId);

    // Zaadaptuj snapshot do resume (outgoing vs returning).
    const m = { ...snapshot };
    delete m.suspendedDuringReturn;
    if (isReturning) {
      m.phase           = 'returning';
      m.returnStartX    = sx;
      m.returnStartY    = sy;
      m.returnTargetX   = tx;
      m.returnTargetY   = ty;
      m.returnWaypoints = route.waypoints;
      m.returnDepartYear = gameYear;
      m.returnYear      = arrivalYear;
    } else {
      m.phase       = m.phase ?? 'outgoing';
      m.startX      = sx;
      m.startY      = sy;
      m.targetX     = tx;
      m.targetY     = ty;
      m.waypoints   = route.waypoints;
      m.departYear  = gameYear;
      m.arrivalYear = arrivalYear;
    }

    vessel.mission           = m;
    vessel.status            = 'on_mission';
    vessel.position.state    = 'in_transit';
    vessel.position.dockedAt = null;
    delete vessel._suspendedMission;

    addMissionLog(vessel, gameYear,
      `Resume mission → ${destEntity.name ?? destId}`,
      'info');

    EventBus.emit('vessel:launched', { vessel, mission: m });
  }

  /**
   * M1 Targeting — wylicz velocity (AU/civYear) z delty pozycji.
   *
   * Jednostka: AU/civYear. VesselManager._tick dostaje civDeltaYears z TimeSystem
   * (linia 71-72), więc delta AU / deltaYears to naturalna civ-scale velocity.
   * Intercept math (M1/M2) porównuje z vessel.speedAU bez konwersji (zob. §6.2
   * docs/design/milestone-1-targeting-foundation.md).
   *
   * @param {object} vessel
   * @param {number} prevX — pozycja px przed update
   * @param {number} prevY
   * @param {number} civDy — civDeltaYears tego ticku
   * @param {number} gameYear — aktualny czas gry (do updatedYear)
   */
  _updateVelocityFromDelta(vessel, prevX, prevY, civDy, gameYear) {
    if (!vessel.velocity || civDy <= 1e-9) return;
    vessel.velocity.vx = (vessel.position.x - prevX) / AU_TO_PX / civDy;
    vessel.velocity.vy = (vessel.position.y - prevY) / AU_TO_PX / civDy;
    vessel.velocity.updatedYear = gameYear;
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
    // Punkt powrotu → aktualna pozycja bazy macierzystej (dla returning)
    if (m.phase === 'returning') {
      const homeEntity = this._findEntity(vessel.colonyId);
      if (homeEntity) {
        m.returnTargetX = homeEntity.x;
        m.returnTargetY = homeEntity.y;
      }
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
    const ship = _getHullDef(vessel.shipId);
    const speedAU = (vessel.speedAU ?? ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);

    // Odległość od gwiazdy (pozycja statku) do planety (AU)
    const dx = (target.x - vessel.position.x) / AU_TO_PX;
    const dy = (target.y - vessel.position.y) / AU_TO_PX;
    const distAU = Math.sqrt(dx * dx + dy * dy);
    const travelYears = distAU / speedAU;
    const arrivalYear = gameYear + travelYears;

    // Zużyj paliwo in-system (pc/AU)
    const fuelEffMult = window.KOSMOS?.techSystem?.getFuelEfficiency?.() ?? 1.0;
    const fuelPerAU = (vessel.fuel.consumption ?? ship?.fuelPerAU ?? 1) * fuelEffMult;
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
        targetName: this._resolveEntityName(targetId),
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
      const ship = _getHullDef(vessel.shipId);
      const speedAU = (vessel.speedAU ?? ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
      const distAU = Math.hypot(
        (firstTarget.x - vessel.position.x) / AU_TO_PX,
        (firstTarget.y - vessel.position.y) / AU_TO_PX
      );
      const travelYears = distAU / speedAU;

      const star = EntityManager.getStarOfSystem(systemId);
      vessel.mission = {
        type: 'foreign_recon',
        scope: 'full_system',
        systemId,
        targetName: star?.name ?? systemId,
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
      // Podążaj za skanowanym ciałem (orbituje — pozycja się zmienia)
      const scanBodyId = m.targets[m.currentIdx];
      const scanBody = this._findEntity(scanBodyId);
      if (scanBody) {
        vessel.position.x = scanBody.x;
        vessel.position.y = scanBody.y;
      }

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
        const ship = _getHullDef(vessel.shipId);
        const speedAU = (vessel.speedAU ?? ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
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
   * Przerwij foreign_recon — statek przechodzi do orbiting_body z pełnym panelem akcji.
   */
  abortForeignRecon(vesselId) {
    const vessel = this._vessels.get(vesselId);
    if (!vessel || !vessel.mission) return false;
    const m = vessel.mission;
    if (m.type !== 'foreign_recon') return false;

    // Znajdź najbliższe ciało (aktualny cel lub ostatnio zbadane)
    const currentTargetId = m.targets?.[m.currentIdx] ?? m.targetId;
    const body = this._findEntity(currentTargetId);
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;

    // Snap do ciała (lub zostań w miejscu)
    if (body) {
      vessel.position.x = body.x;
      vessel.position.y = body.y;
    }
    vessel.position.state = 'orbiting';
    vessel.position.dockedAt = currentTargetId;
    vessel.status = 'on_mission';
    m.phase = 'orbiting_body';
    m.type = 'exploration'; // UI pokaże panel orbiting_body z pełnymi akcjami

    addMissionLog(vessel, gameYear, t('vessel.reconAborted'), 'warning');

    EventBus.emit('vessel:positionUpdate', { vessels: [vessel] });
    return true;
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
    const ship = _getHullDef(vessel.shipId);
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
