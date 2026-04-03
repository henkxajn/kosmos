// MissionSystem — ewolucja ExpeditionSystem
//
// Pełna przebudowa systemu misji z zachowaniem CAŁEJ logiki z ExpeditionSystem.
// Zmiany:
//   - Typy: recon(target/nearest) → survey, recon(full_system) → deep_scan
//   - Fazy: transit_to → executing → transit_back → complete
//   - progressPct: 0–1 dla bieżącej fazy
//   - ETA: szacowany czas każdej fazy
//   - Mission log: wpisy w dzienniku statku
//   - EventBus: nowe nazwy (mission:*) + aliasy starych (expedition:*)
//
// Zachowane z ExpeditionSystem:
//   - Colony founding, outpost creation/upgrade
//   - Sequential greedy NN recon (deep_scan)
//   - Disaster rolls, yield calculation
//   - POP locking/unlocking
//   - visitCounts tracking
//   - Fuel/range checks

import EventBus          from '../core/EventBus.js';
import EntityManager     from '../core/EntityManager.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { SHIPS }         from '../data/ShipsData.js';
import { BUILDINGS }     from '../data/BuildingsData.js';
import { COMMODITIES }   from '../data/CommoditiesData.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { addMissionLog } from '../entities/Vessel.js';
import { t }             from '../i18n/i18n.js';

// ── Koszty misji ─────────────────────────────────────────────────────────────
const LAUNCH_COST          = { Fe: 50, C: 20 };
const COLONY_LAUNCH_COST   = { Fe: 150, C: 50, Ti: 20, food: 100, water: 50 };
const RECON_COST           = { Fe: 10 };
const MIN_TRAVEL_YEARS     = 0.008; // ~3 dni gry
const MIN_COLONY_TRAVEL    = 0.02;  // ~7 dni gry
const EXPEDITION_CREW_COST = 0.5;
const COLONY_CREW_COST     = 2.0;
const RECON_CREW_COST      = 0.5;
const BASE_DISASTER_CHANCE = 2.0;   // % — bazowe ryzyko katastrofy (było 5%)
const MIN_DISASTER_CHANCE  = 0.1;   // % — minimum (nigdy nie spada do zera)
const XP_REDUCTION_PER     = 0.1;   // % redukcji na punkt doświadczenia statku

// Zasoby startowe nowej kolonii (przed mnożnikiem)
const COLONY_START_RESOURCES = { Fe: 200, C: 150, Si: 100, Cu: 50, food: 100, water: 100, research: 50 };

// ── Mapowanie starych typów → nowe ──────────────────────────────────────────
// recon(target/nearest) → survey
// recon(full_system)    → deep_scan
// colony               → colonize
// mining/scientific/transport — bez zmian

export class MissionSystem {
  constructor(resourceSystem = null) {
    this.resourceSystem = resourceSystem;
    this._missions      = [];   // tablica aktywnych i ostatnich zakończonych misji
    this._nextId        = 1;
    this._gameYear      = 0;
    this._visitCounts   = new Map();

    // Śledź bieżący rok gry
    EventBus.on('time:display', ({ gameTime }) => {
      this._gameYear = gameTime;
    });

    // Sprawdzaj przybycia i powroty co tick
    EventBus.on('time:tick', () => this._checkArrivals());

    // ── Obsługa żądań — nowe nazwy + aliasy starych ──
    // Nowe API
    EventBus.on('mission:sendRequest', ({ type, targetId, cargo, vesselId }) =>
      this._launch(type, targetId, cargo, vesselId));

    // Aliasy starych eventów (backward compat z UI)
    EventBus.on('expedition:sendRequest', ({ type, targetId, cargo, vesselId }) =>
      this._launch(type, targetId, cargo, vesselId));

    EventBus.on('expedition:transportRequest', ({ targetId, cargo, vesselId, cargoPreloaded, isTradeRoute, sourceColonyId }) =>
      this._launchTransport(targetId, cargo, vesselId, cargoPreloaded, isTradeRoute, sourceColonyId));

    EventBus.on('expedition:orderReturn', ({ expeditionId }) =>
      this._orderReturn(expeditionId));
    EventBus.on('mission:orderReturn', ({ missionId }) =>
      this._orderReturn(missionId));

    EventBus.on('expedition:orderRedirect', ({ expeditionId, targetId }) =>
      this._orderRedirect(expeditionId, targetId));
    EventBus.on('mission:orderRedirect', ({ missionId, targetId }) =>
      this._orderRedirect(missionId, targetId));

    EventBus.on('expedition:foundOutpostRequest', ({ targetId, buildingId, vesselId }) =>
      this._launchFoundOutpost(targetId, buildingId, vesselId));

    EventBus.on('expedition:deliverCargo', ({ expeditionId }) =>
      this._deliverCargo(expeditionId));

    // Cleanup misji przy zniszczeniu kolonii
    EventBus.on('colony:destroyed', ({ planetId }) =>
      this._onColonyDestroyed(planetId));
  }

  // ── API publiczne ──────────────────────────────────────────────────────────

  /**
   * Stwórz i wyślij misję.
   * @param {string} type — survey|deep_scan|transport|colonize|mining|scientific|transit
   * @param {string} vesselId — id statku
   * @param {object} params — { targetId, cargo, ... }
   */
  createMission(type, vesselId, params = {}) {
    // Mapuj nowe typy na stare metody
    if (type === 'survey') {
      this._launch('recon', params.targetId ?? 'nearest', null, vesselId);
    } else if (type === 'deep_scan') {
      this._launch('recon', 'full_system', null, vesselId);
    } else if (type === 'colonize') {
      this._launch('colony', params.targetId, null, vesselId);
    } else if (type === 'transport') {
      this._launchTransport(params.targetId, params.cargo, vesselId, params.cargoPreloaded);
    } else {
      this._launch(type, params.targetId, params.cargo, vesselId);
    }
  }

  /**
   * Anuluj misję → statek wraca do bazy.
   */
  cancelMission(missionId) {
    this._orderReturn(missionId);
  }

  // Sprawdź czy gracz może wysłać ekspedycję mining/scientific
  canLaunch(type = 'mining') {
    const techOk = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
    const padOk  = this._hasSpaceport();
    const colMgr = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const vesselOk = type !== 'scientific' || (colMgr?.hasShipWithCapability(activePid, 'scientific') ?? false);
    return { ok: techOk && padOk && vesselOk, techOk, padOk, crewOk: true, vesselOk };
  }

  // Sprawdź czy gracz może wysłać ekspedycję kolonizacyjną
  canLaunchColony(targetId) {
    const techOk   = window.KOSMOS?.techSystem?.isResearched('colonization') ?? false;
    const padOk    = this._hasSpaceport();
    const colMgr   = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const shipOk   = colMgr?.hasShipWithCapability(activePid, 'colony') ?? false;
    const target   = this._findTarget(targetId);
    const exploredOk = target?.explored === true;
    const typeOk   = target
      ? (target.type === 'planetoid' || target.type === 'moon' ||
         (target.type === 'planet' && (target.planetType === 'rocky' || target.planetType === 'ice')))
      : false;
    // Outposty można upgrade'ować colony shipem — blokuj tylko pełne kolonie
    const existingCol = colMgr?.getColony(targetId);
    const notColonized = existingCol ? existingCol.isOutpost === true : true;
    return {
      ok: techOk && padOk && shipOk && exploredOk && typeOk && notColonized,
      techOk, padOk, shipOk, crewOk: true, exploredOk, typeOk, notColonized
    };
  }

  // Sprawdź czy gracz może wysłać misję rozpoznawczą (survey/deep_scan)
  canLaunchRecon() {
    const techOk   = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
    const padOk    = this._hasSpaceport();
    const colMgr   = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const vesselOk = colMgr?.hasShipWithCapability(activePid, 'recon') ?? false;
    return { ok: techOk && padOk && vesselOk, techOk, padOk, crewOk: true, vesselOk };
  }

  // Sprawdź czy gracz może założyć outpost (cargo ship + budynek)
  canFoundOutpost(targetId, buildingId) {
    const techOk   = window.KOSMOS?.techSystem?.isResearched('exploration') ?? false;
    const colMgr   = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const vMgr     = window.KOSMOS?.vesselManager;
    const shipOk   = vMgr?.hasAvailableShipWithCapability(activePid, 'cargo') ?? false;
    const target   = this._findTarget(targetId);
    const exploredOk = target?.explored === true;
    const typeOk   = target
      ? (target.type === 'planetoid' || target.type === 'moon' ||
         (target.type === 'planet' && (target.planetType === 'rocky' || target.planetType === 'ice')))
      : false;
    const existingCol = colMgr?.getColony(targetId);
    const notColonized = !existingCol;
    const bDef = BUILDINGS[buildingId];
    const buildingOk = !!bDef;
    const resSys = this.resourceSystem;
    let canAfford = true;
    const totalCost = {};
    if (bDef) {
      for (const [resId, qty] of Object.entries(bDef.cost ?? {})) {
        totalCost[resId] = (totalCost[resId] ?? 0) + qty;
      }
      for (const [comId, qty] of Object.entries(bDef.commodityCost ?? {})) {
        totalCost[comId] = (totalCost[comId] ?? 0) + qty;
      }
      if (resSys) canAfford = resSys.canAfford(totalCost);
    }
    return {
      ok: techOk && shipOk && exploredOk && typeOk && notColonized && buildingOk && canAfford,
      techOk, shipOk, exploredOk, typeOk, notColonized, buildingOk, canAfford, totalCost,
    };
  }

  // Liczba niezbadanych ciał wg typu
  getUnexploredCount() {
    const homePl = window.KOSMOS?.homePlanet;
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    let planets = 0, moons = 0, other = 0;
    for (const p of EntityManager.getByTypeInSystem('planet', sysId)) {
      if (p === homePl) continue;
      if (!p.explored) planets++;
    }
    for (const m of EntityManager.getByTypeInSystem('moon', sysId)) {
      if (!m.explored) moons++;
    }
    for (const t of ['asteroid', 'comet', 'planetoid']) {
      for (const b of EntityManager.getByTypeInSystem(t, sysId)) {
        if (!b.explored) other++;
      }
    }
    const total = planets + moons + other;
    return { planets, moons, other, total };
  }

  // Szacowany czas misji rozpoznawczej
  getReconTime(scope, vesselId) {
    const speed = this._getShipSpeed(vesselId);
    if (scope === 'nearest') {
      const nearest = this._findNearestUnexplored();
      const dist = nearest ? this._calcDistance(nearest) : 2.0;
      return parseFloat(Math.max(0.05, dist / speed).toFixed(3));
    }
    if (scope === 'full_system') {
      const nearest = this._findNearestUnexplored();
      const dist = nearest ? this._calcDistance(nearest) : 2.0;
      const unexploredTotal = this.getUnexploredCount().total;
      return parseFloat(Math.max(0.1, (dist / speed) * Math.max(1, unexploredTotal * 0.7)).toFixed(1));
    }
    // Konkretne ciało — dystans × 2 (tam i z powrotem)
    const target = this._findTarget(scope);
    if (target) {
      const dist = this._calcDistance(target);
      return parseFloat(Math.max(0.05, (dist / speed) * 2).toFixed(3));
    }
    return 1.0;
  }

  // Wszystkie misje (aktywne + ostatnie zakończone)
  getAll() {
    return [...this._missions];
  }

  // Tylko aktywne (en_route, orbiting, returning)
  getActive() {
    return this._missions.filter(e => e.status !== 'completed');
  }

  // Szacunkowy zarobek bez mnożnika
  estimateYield(type, targetId) {
    const target = this._findTarget(targetId);
    if (!target) return {};
    return this._baseYield(type, target);
  }

  // Pobierz liczbę wizyt na ciele
  getVisitCount(bodyId) { return this._visitCounts.get(bodyId) ?? 0; }

  /**
   * Oblicz fazę i progressPct dla misji.
   * @returns {{ phase: string, progressPct: number }}
   */
  getMissionProgress(mission) {
    if (!mission) return { phase: 'complete', progressPct: 1 };

    if (mission.status === 'completed') return { phase: 'complete', progressPct: 1 };
    if (mission.status === 'orbiting')  return { phase: 'executing', progressPct: 1 };

    if (mission.status === 'returning') {
      const returnDepart = mission._returnDepartYear ?? mission.arrivalYear;
      const returnTotal  = (mission.returnYear ?? returnDepart) - returnDepart;
      if (returnTotal <= 0) return { phase: 'transit_back', progressPct: 1 };
      const t = Math.max(0, Math.min(1, (this._gameYear - returnDepart) / returnTotal));
      return { phase: 'transit_back', progressPct: t };
    }

    if (mission.status === 'en_route') {
      const totalTravel = (mission.arrivalYear ?? 1) - (mission.departYear ?? 0);
      if (totalTravel <= 0) return { phase: 'transit_to', progressPct: 1 };
      const t = Math.max(0, Math.min(1, (this._gameYear - mission.departYear) / totalTravel));
      return { phase: 'transit_to', progressPct: t };
    }

    return { phase: 'transit_to', progressPct: 0 };
  }

  /**
   * Oblicz ETA (lata do faz) dla misji.
   */
  getMissionETA(mission) {
    if (!mission) return {};

    const now = this._gameYear;
    return {
      transit_to:   Math.max(0, (mission.arrivalYear ?? now) - now),
      transit_back: mission.returnYear ? Math.max(0, mission.returnYear - Math.max(now, mission.arrivalYear ?? 0)) : null,
    };
  }

  /**
   * Pobierz typ misji w nowej nomenklaturze.
   */
  getMissionType(mission) {
    if (!mission) return 'unknown';
    if (mission.type === 'recon') {
      if (mission.scope === 'full_system') return 'deep_scan';
      return 'survey';
    }
    if (mission.type === 'colony') return 'colonize';
    return mission.type; // mining, scientific, transport
  }

  // Serializacja
  serialize() {
    const visitObj = {};
    for (const [k, v] of this._visitCounts) visitObj[k] = v;
    return {
      expeditions: this._missions.map(e => ({ ...e })),  // backward compat key name
      missions:    this._missions.map(e => ({ ...e })),
      nextId:      this._nextId,
      visitCounts: visitObj,
    };
  }

  // Odtworzenie ze save
  restore(data) {
    if (!data) return;
    // Backward compat: czytaj missions lub expeditions
    this._missions = data.missions ?? data.expeditions ?? [];
    this._nextId   = data.nextId ?? (this._missions.length + 1);

    // UWAGA: walidacja statków odroczona do validateMissions() — VesselManager
    // może nie być jeszcze przywrócony w momencie wywołania restore().

    // Przywróć visitCounts
    this._visitCounts.clear();
    if (data.visitCounts) {
      for (const [k, v] of Object.entries(data.visitCounts)) {
        this._visitCounts.set(k, v);
      }
    }

    // POPy blokowane przy budowie statku (ColonyManager) — nie przy starcie misji
    // lockedPops przywracane z save CivilizationSystem
  }

  /**
   * Walidacja misji po pełnym restore (VesselManager musi być przywrócony).
   * Wywołaj z GameScene PO vesselManager.restore().
   */
  validateMissions() {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;
    this._missions = this._missions.filter(exp => {
      if (!exp.vesselId) return false;
      return !!vMgr.getVessel(exp.vesselId);
    });
  }

  // ── Prywatne ──────────────────────────────────────────────────────────────

  _hasBuilding(buildingId) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!bSys) return false;
    for (const [, entry] of bSys._active) {
      if (entry.building.id === buildingId) return true;
    }
    return false;
  }

  _hasSpaceport() {
    const bSys = window.KOSMOS?.buildingSystem;
    return bSys ? bSys.hasSpaceport() : false;
  }

  // ── Emituj event z aliasem (nowy + stary) ──────────────────────────────────
  _emit(newEvent, oldEvent, data) {
    EventBus.emit(newEvent, data);
    if (oldEvent && oldEvent !== newEvent) {
      EventBus.emit(oldEvent, data);
    }
  }

  // ── Launch główny (mining/scientific/recon/colony) ─────────────────────────
  _launch(type, targetId, cargo, vesselId) {
    if (type === 'colony') {
      this._launchColony(targetId, vesselId);
      return;
    }
    if (type === 'recon') {
      this._launchRecon(targetId, vesselId);
      return;
    }

    // mining/scientific
    const { ok, techOk, padOk, vesselOk } = this.canLaunch(type);
    if (!ok) {
      const reason = !techOk
        ? t('mission.noTechRocketry')
        : !padOk
          ? t('mission.noSpaceport')
          : t('mission.noScienceVessel');
      this._emit('mission:failed', 'expedition:launchFailed', { reason });
      return;
    }

    const target = this._findTarget(targetId);
    if (!target) {
      this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.unknownTarget') });
      return;
    }
    if (!target.explored) {
      this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.targetNotExplored') });
      return;
    }

    const distance = this._calcDistance(target);

    const vMgr  = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;
    let assignedVesselId = vesselId ?? null;
    if (vMgr && assignedVesselId) {
      const vessel = vMgr.getVessel(assignedVesselId);
      if (!vessel || vessel.status !== 'idle') {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.shipUnavailable') });
        return;
      }
      const fuelNeeded = distance * vessel.fuel.consumption;
      if (vessel.fuel.current < fuelNeeded) {
        this._emit('mission:failed', 'expedition:launchFailed', {
          reason: t('mission.insufficientFuel', fuelNeeded.toFixed(1), vessel.fuel.current.toFixed(1))
        });
        return;
      }
    } else if (type === 'scientific' && !this._isInRange(target, 'science_vessel')) {
      const dist = DistanceUtils.orbitalFromHomeAU(target).toFixed(1);
      const range = SHIPS.science_vessel.range;
      this._emit('mission:failed', 'expedition:launchFailed', {
        reason: t('mission.targetOutOfRange', dist, range)
      });
      return;
    }

    if (this.resourceSystem) {
      if (!this.resourceSystem.canAfford(LAUNCH_COST)) {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.noStartupResources') });
        return;
      }
      this.resourceSystem.spend(LAUNCH_COST);
    }

    const shipSpeed  = this._getShipSpeed(assignedVesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));
    const departYear = this._gameYear;

    const mission = {
      id:          `exp_${this._nextId++}`,
      type,
      targetId,
      targetName:  target.name,
      targetType:  target.type,
      departYear,
      arrivalYear: departYear + travelTime,
      returnYear:  departYear + travelTime * 2,
      distance:    parseFloat(distance.toFixed(4)),
      travelTime,
      crewCost:    EXPEDITION_CREW_COST,
      vesselId:    assignedVesselId,
      originColonyId: assignedVesselId ? (vMgr?.getVessel(assignedVesselId)?.colonyId ?? colMgr?.activePlanetId) : colMgr?.activePlanetId,
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._missions.push(mission);

    if (vMgr && assignedVesselId) {
      vMgr.dispatchOnMission(assignedVesselId, {
        type,
        targetId,
        targetName: target.name,
        departYear,
        arrivalYear: mission.arrivalYear,
        returnYear:  mission.returnYear,
        fuelCost:    distance * (vMgr.getVessel(assignedVesselId)?.fuel?.consumption ?? 0),
      });
    }

    this._emit('mission:started', 'expedition:launched', { expedition: mission });
  }

  // ── Ekspedycja kolonizacyjna ──────────────────────────────────────────────
  _launchColony(targetId, vesselId) {
    const check = this.canLaunchColony(targetId);
    if (!check.ok) {
      const reason = !check.techOk
        ? t('mission.noTechColonization')
        : !check.padOk
          ? t('mission.noSpaceport')
          : !check.shipOk
            ? t('mission.noColonyShip')
            : !check.exploredOk
              ? t('mission.targetNotExploredScience')
              : !check.typeOk
                ? t('mission.targetNotSuitable')
                : t('mission.targetHasColony');
      this._emit('mission:failed', 'expedition:launchFailed', { reason });
      return;
    }

    const target = this._findTarget(targetId);
    const distance = this._calcDistance(target);

    const vMgr  = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;
    if (vMgr && vesselId) {
      const vessel = vMgr.getVessel(vesselId);
      if (!vessel || vessel.status !== 'idle') {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.shipUnavailable') });
        return;
      }
      const fuelNeeded = distance * vessel.fuel.consumption;
      if (vessel.fuel.current < fuelNeeded) {
        this._emit('mission:failed', 'expedition:launchFailed', {
          reason: t('mission.insufficientFuel', fuelNeeded.toFixed(1), vessel.fuel.current.toFixed(1))
        });
        return;
      }
    } else if (!this._isInRange(target, 'cargo_ship')) {
      const dist = DistanceUtils.orbitalFromHomeAU(target).toFixed(1);
      const range = SHIPS.cargo_ship?.range ?? 12;
      this._emit('mission:failed', 'expedition:launchFailed', {
        reason: t('mission.targetOutOfRange', dist, range)
      });
      return;
    }

    if (this.resourceSystem) {
      if (!this.resourceSystem.canAfford(COLONY_LAUNCH_COST)) {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.noStartupResources') });
        return;
      }
      this.resourceSystem.spend(COLONY_LAUNCH_COST);
    }

    const techMult    = window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1.0;
    const colonySpeed = (SHIPS.cargo_ship?.baseSpeedAU ?? 0.9) * techMult;
    const travelTime  = parseFloat(Math.max(MIN_COLONY_TRAVEL, distance / colonySpeed).toFixed(3));
    const departYear  = this._gameYear;

    const mission = {
      id:             `exp_${this._nextId++}`,
      type:           'colony',
      targetId,
      targetName:     target.name,
      targetType:     target.type,
      departYear,
      arrivalYear:    departYear + travelTime,
      returnYear:     null,
      distance:       parseFloat(distance.toFixed(2)),
      travelTime,
      crewCost:       COLONY_CREW_COST,
      status:         'en_route',
      gained:         null,
      eventRoll:      null,
      vesselId:       vesselId ?? null,
      originColonyId: vesselId ? (vMgr?.getVessel(vesselId)?.colonyId ?? colMgr?.activePlanetId) : colMgr?.activePlanetId,
    };

    this._missions.push(mission);

    if (vMgr && vesselId) {
      vMgr.dispatchOnMission(vesselId, {
        type:        'colony',
        targetId,
        targetName:  target.name,
        departYear,
        arrivalYear: mission.arrivalYear,
        returnYear:  null,
        fuelCost:    distance * (vMgr.getVessel(vesselId)?.fuel?.consumption ?? 0),
      });
    }

    this._emit('mission:started', 'expedition:launched', { expedition: mission });
  }

  // ── Założenie outpostu (cargo ship + budynek) ─────────────────────────────
  _launchFoundOutpost(targetId, buildingId, vesselId) {
    const check = this.canFoundOutpost(targetId, buildingId);
    if (!check.ok) {
      const reason = !check.techOk ? t('mission.noTechColonization')
        : !check.shipOk ? t('mission.noColonyShip')
        : !check.exploredOk ? t('mission.targetNotExploredScience')
        : !check.typeOk ? t('mission.targetNotSuitable')
        : !check.notColonized ? t('mission.targetHasColony')
        : !check.canAfford ? t('mission.noStartupResources')
        : t('mission.targetNotSuitable');
      this._emit('mission:failed', 'expedition:launchFailed', { reason });
      return;
    }

    const target = this._findTarget(targetId);
    const vMgr   = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;

    // Znajdź cargo ship
    let vessel;
    if (vesselId) {
      vessel = vMgr?.getVessel(vesselId);
    } else {
      vessel = vMgr?.getFirstAvailableWithCapability(activePid, 'cargo');
    }
    if (!vessel || vessel.status !== 'idle') {
      this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.shipUnavailable') });
      return;
    }

    const distance = this._calcDistance(target);

    // Sprawdź paliwo
    const fuelNeeded = distance * vessel.fuel.consumption;
    if (vessel.fuel.current < fuelNeeded) {
      this._emit('mission:failed', 'expedition:launchFailed', {
        reason: t('mission.insufficientFuel', fuelNeeded.toFixed(1), vessel.fuel.current.toFixed(1))
      });
      return;
    }

    // Pobierz surowce z kolonii i załaduj na statek
    const bDef = BUILDINGS[buildingId];
    const totalCost = check.totalCost;
    if (this.resourceSystem) {
      this.resourceSystem.spend(totalCost);
    }
    for (const [resId, qty] of Object.entries(totalCost)) {
      if (qty > 0) {
        vessel.cargo = vessel.cargo ?? {};
        vessel.cargo[resId] = (vessel.cargo[resId] ?? 0) + qty;
        const weight = COMMODITIES[resId]?.weight ?? 1;
        vessel.cargoUsed = (vessel.cargoUsed ?? 0) + qty * weight;
      }
    }

    // Czas podróży
    const shipSpeed  = this._getShipSpeed(vesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));
    const departYear = this._gameYear;

    const mission = {
      id:             `exp_${this._nextId++}`,
      type:           'found_outpost',
      targetId,
      targetName:     target.name,
      targetType:     target.type,
      buildingId,
      departYear,
      arrivalYear:    departYear + travelTime,
      returnYear:     null,
      distance:       parseFloat(distance.toFixed(2)),
      travelTime,
      crewCost:       0,
      status:         'en_route',
      gained:         null,
      eventRoll:      null,
      vesselId:       vessel.id,
      originColonyId: vessel.colonyId ?? activePid,
    };

    this._missions.push(mission);

    // Wyślij statek
    vMgr.dispatchOnMission(vessel.id, {
      type:        'found_outpost',
      targetId,
      targetName:  target.name,
      departYear,
      arrivalYear: mission.arrivalYear,
      returnYear:  null,
      fuelCost:    fuelNeeded,
    });

    this._emit('mission:started', 'expedition:launched', { expedition: mission });
  }

  // ── Transport zasobów ──────────────────────────────────────────────────────
  _launchTransport(targetId, cargo, vesselId, cargoPreloaded = false, isTradeRoute = false, sourceColonyId = null) {
    // Pusty cargo dozwolony — transport = też relokacja statku
    if (!cargo) cargo = {};
    const hasCargo = Object.keys(cargo).length > 0;

    const vMgr   = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;
    const vessel = vesselId ? vMgr?.getVessel(vesselId) : null;

    // ── Trasy handlowe — osobna ścieżka (bez POP, spaceport, active colony) ──
    if (isTradeRoute) {
      if (!vessel || vessel.position.state !== 'docked') return;

      // Oblicz dystans od pozycji statku do celu
      const target = this._findTarget(targetId);
      const targetEntity = target || { x: 0, y: 0 };
      const distance = Math.max(0.001, DistanceUtils.euclideanAU(
        { x: vessel.position.x, y: vessel.position.y },
        targetEntity
      ));

      // Sprawdź paliwo
      const fuelNeeded = distance * (vessel.fuel?.consumption ?? 0);
      if (vessel.fuel && vessel.fuel.current < fuelNeeded) return; // retry w TradeRouteManager

      // Sprawdź i odejmij zasoby z kolonii, w której statek jest zadokowany
      if (hasCargo) {
        const dockedColony = sourceColonyId ? colMgr?.getColony(sourceColonyId) : null;
        const resSys = dockedColony?.resourceSystem;
        if (resSys) {
          if (!resSys.canAfford(cargo)) return; // retry w TradeRouteManager
          resSys.spend(cargo);
        }
      }

      const shipSpeed  = this._getShipSpeed(vesselId);
      const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));
      const departYear = this._gameYear;

      const mission = {
        id:          `exp_${this._nextId++}`,
        type:        'transport',
        targetId,
        targetName:  target?.name ?? colMgr?.getColony(targetId)?.name ?? targetId,
        targetType:  target?.type ?? 'colony',
        departYear,
        arrivalYear: departYear + travelTime,
        returnYear:  null, // TradeRouteManager zarządza powrotami
        distance:    parseFloat(distance.toFixed(2)),
        travelTime,
        crewCost:    0, // trasy handlowe nie blokują POPów
        vesselId,
        originColonyId: vessel.colonyId,
        cargo:       { ...cargo },
        status:      'en_route',
        gained:      null,
        eventRoll:   null,
      };
      this._missions.push(mission);

      vMgr.dispatchOnMission(vesselId, {
        type: 'transport', targetId,
        targetName: mission.targetName,
        departYear, arrivalYear: mission.arrivalYear, returnYear: null,
        fuelCost: fuelNeeded,
        cargo: { ...cargo },
      });

      this._emit('mission:started', 'expedition:launched', { expedition: mission });

      // Loguj eksport (trasa handlowa)
      if (hasCargo) {
        EventBus.emit('trade:exported', {
          colonyId: sourceColonyId ?? vessel.colonyId,
          year: departYear,
          items: { ...cargo },
          vesselName: vessel?.name ?? vesselId,
          targetName: mission.targetName,
        });
      }
      return;
    }

    // ── Standardowy transport (nie trasa handlowa) ──────────────────

    // Sprawdź czy statek jest na orbicie lub zadokowany w zdalnej lokalizacji (re-dispatch)
    const isOrbiting = vessel && vessel.position.state === 'orbiting' && vessel.status === 'on_mission';
    const isRemoteDocked = vessel && vessel.position.state === 'docked'
      && (vessel.status === 'idle' || vessel.status === 'refueling')
      && vessel.colonyId !== colMgr?.activePlanetId;
    const isRedispatch = isOrbiting || isRemoteDocked;

    if (!isRedispatch) {
      // Standardowy launch z bazy — wymaga launch_pad
      const padOk  = this._hasSpaceport();

      if (!padOk) {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.noSpaceport') });
        return;
      }

      if (!cargoPreloaded) {
        if (this.resourceSystem && !this.resourceSystem.canAfford(cargo)) {
          this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.noResourcesToTransport') });
          return;
        }
        if (this.resourceSystem) this.resourceSystem.spend(cargo);
      }
    }

    // Oblicz dystans — zawsze z bieżącej pozycji statku do celu
    const target = this._findTarget(targetId);
    let distance;
    if (vessel) {
      const targetEntity = target || { x: 0, y: 0 };
      distance = Math.max(0.001, DistanceUtils.euclideanAU(
        { x: vessel.position.x, y: vessel.position.y },
        targetEntity
      ));
    } else {
      distance = this._calcDistance(target || { orbital: { a: 2 } });
    }

    // Sprawdź paliwo
    if (vessel) {
      const fuelNeeded = distance * vessel.fuel.consumption;
      if (vessel.fuel.current < fuelNeeded) {
        this._emit('mission:failed', 'expedition:launchFailed', {
          reason: t('mission.insufficientFuel', fuelNeeded.toFixed(1), vessel.fuel.current.toFixed(1))
        });
        return;
      }
    }

    // Zamknij starą ekspedycję
    if (isRedispatch && vesselId) {
      const oldExp = this._missions.find(e =>
        e.vesselId === vesselId && (e.status === 'orbiting' || e.status === 'en_route')
      );
      if (oldExp) {
        oldExp.status = 'completed';
      }
    }

    const shipSpeed  = this._getShipSpeed(vesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));
    const departYear = this._gameYear;

    const mission = {
      id:          `exp_${this._nextId++}`,
      type:        'transport',
      targetId,
      targetName:  target?.name ?? colMgr?.getColony(targetId)?.name ?? targetId,
      targetType:  target?.type ?? 'colony',
      departYear,
      arrivalYear: departYear + travelTime,
      returnYear:  departYear + travelTime * 2,
      distance:    parseFloat(distance.toFixed(2)),
      travelTime,
      crewCost:    EXPEDITION_CREW_COST,
      vesselId:    vesselId ?? null,
      originColonyId: vessel?.colonyId ?? colMgr?.activePlanetId,
      cargo:       { ...cargo },
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._missions.push(mission);

    if (vMgr && vesselId) {
      const fuelCost = distance * (vessel?.fuel?.consumption ?? 0);
      const missionData = {
        type: 'transport', targetId,
        targetName: mission.targetName,
        departYear, arrivalYear: mission.arrivalYear, returnYear: mission.returnYear,
        fuelCost,
        cargo: { ...cargo },
      };

      if (isOrbiting) {
        // Re-dispatch z orbity — nie wymaga idle+docked
        vMgr.redispatchFromOrbit(vesselId, missionData);
      } else {
        vMgr.dispatchOnMission(vesselId, missionData);
      }
    }

    this._emit('mission:started', 'expedition:launched', { expedition: mission });

    // Loguj eksport (standardowy transport)
    if (hasCargo) {
      const originId = mission.originColonyId ?? colMgr?.activePlanetId;
      EventBus.emit('trade:exported', {
        colonyId: originId,
        year: departYear,
        items: { ...cargo },
        vesselName: vessel?.name ?? vesselId,
        targetName: mission.targetName,
      });
    }
  }

  // ── Rozkaz powrotu ────────────────────────────────────────────────────────
  _orderReturn(missionId) {
    const exp = this._missions.find(e => e.id === missionId);
    if (!exp || (exp.status !== 'orbiting' && exp.status !== 'en_route')) return;

    const vMgr = window.KOSMOS?.vesselManager;
    const shipSpeed = this._getShipSpeed(exp.vesselId);

    if (exp.status === 'en_route') {
      // Zawrócenie w locie
      const vessel = exp.vesselId ? vMgr?.getVessel(exp.vesselId) : null;
      const homeEntity = vessel ? EntityManager.get(vessel.colonyId) : null;
      let returnDist = exp.distance;
      if (vessel && homeEntity) {
        returnDist = DistanceUtils.euclideanAU(
          { x: vessel.position.x, y: vessel.position.y },
          homeEntity
        );
      }
      // Statek nie zdążył odlecieć (dystans ≈ 0) — natychmiastowy powrót do hangaru
      if (returnDist < 0.01 && vMgr && exp.vesselId) {
        exp.status = 'completed';
        vMgr.dockAtColony(exp.vesselId, exp.originColonyId);
        this._emit('mission:cancelled', 'expedition:returnOrdered', { expedition: exp });
        return;
      }
      const returnTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, returnDist / shipSpeed).toFixed(3));
      exp.status = 'returning';
      exp._returnDepartYear = this._gameYear;
      exp.returnYear = this._gameYear + returnTime;
      if (vessel?.mission) {
        vessel.mission.returnYear = exp.returnYear;
      }
      if (vMgr && exp.vesselId) vMgr.startReturn(exp.vesselId);
    } else {
      // Z orbity
      const returnTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, exp.distance / shipSpeed).toFixed(3));
      exp.status = 'returning';
      exp._returnDepartYear = this._gameYear;
      exp.returnYear = this._gameYear + returnTime;
      if (vMgr && exp.vesselId) {
        const vessel = vMgr.getVessel(exp.vesselId);
        if (vessel?.mission) {
          vessel.mission.returnYear = exp.returnYear;
        }
        vMgr.startReturn(exp.vesselId);
      }
    }

    this._emit('mission:cancelled', 'expedition:returnOrdered', { expedition: exp });
  }

  // ── Rozkaz zmiany celu ────────────────────────────────────────────────────
  _orderRedirect(missionId, newTargetId) {
    const exp = this._missions.find(e => e.id === missionId);
    if (!exp || exp.status !== 'orbiting') return;

    const target = this._findTarget(newTargetId);
    if (!target) {
      this._emit('mission:redirectFailed', 'expedition:redirectFailed', { reason: t('mission.unknownTarget') });
      return;
    }

    const currentBody = this._findTarget(exp.targetId);
    const dist = currentBody
      ? DistanceUtils.euclideanAU(currentBody, target)
      : this._calcDistance(target);

    const vMgr = window.KOSMOS?.vesselManager;
    if (exp.vesselId && vMgr) {
      const vessel = vMgr.getVessel(exp.vesselId);
      if (vessel) {
        const fuelNeeded = dist * vessel.fuel.consumption;
        if (vessel.fuel.current < fuelNeeded) {
          this._emit('mission:redirectFailed', 'expedition:redirectFailed', {
            reason: t('mission.insufficientFuel', fuelNeeded.toFixed(1), vessel.fuel.current.toFixed(1))
          });
          return;
        }
      }
    }

    const shipSpeed = this._getShipSpeed(exp.vesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, dist / shipSpeed).toFixed(3));

    // Zsynchronizuj cargo z vessel
    if (exp.type === 'transport' && exp.vesselId && vMgr) {
      const vessel = vMgr.getVessel(exp.vesselId);
      if (vessel) {
        exp.cargo = vessel.cargo ? { ...vessel.cargo } : {};
      }
    }

    exp.targetId    = newTargetId;
    exp.targetName  = target.name ?? '???';
    exp.distance    = parseFloat(dist.toFixed(4));
    exp.arrivalYear = this._gameYear + travelTime;
    exp.returnYear  = null;
    exp.status      = 'en_route';

    if (exp.vesselId && vMgr) {
      vMgr.redirectToTarget(exp.vesselId, newTargetId, exp.arrivalYear);
    }

    this._emit('mission:redirected', 'expedition:redirected', { expedition: exp });
  }

  // ── Dostarczenie cargo (manual) ───────────────────────────────────────────
  _deliverCargo(missionId) {
    // Placeholder — logika dostarczenia w _processTransportArrival
  }

  // ── Recon (survey / deep_scan) ────────────────────────────────────────────
  _launchRecon(scope, vesselId) {
    const { ok, techOk, padOk, vesselOk } = this.canLaunchRecon();
    if (!ok) {
      const reason = !techOk
        ? t('mission.noTechRocketry')
        : !padOk
          ? t('mission.noSpaceport')
          : t('mission.noScienceVessel');
      this._emit('mission:failed', 'expedition:launchFailed', { reason });
      return;
    }

    const unexplored = this.getUnexploredCount();
    const isSpecificTarget = scope !== 'nearest' && scope !== 'full_system';

    if (!isSpecificTarget) {
      if (scope === 'nearest' && unexplored.planets === 0 && unexplored.moons === 0) {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.noUnexploredBodies') });
        return;
      }
      if (unexplored.total === 0) {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.systemFullyExplored') });
        return;
      }
    }

    if (isSpecificTarget) {
      this._launchReconTarget(scope, vesselId);
      return;
    }

    if (this.resourceSystem) {
      if (!this.resourceSystem.canAfford(RECON_COST)) {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.noStartupResources') });
        return;
      }
      this.resourceSystem.spend(RECON_COST);
    }

    const departYear = this._gameYear;
    const vMgr  = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;

    if (scope === 'full_system') {
      // Sekwencyjny deep_scan
      const firstTarget = this._findNearestUnexplored(null);
      if (!firstTarget) {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.noUnexplored') });
        return;
      }
      const distance = this._calcDistance(firstTarget);
      const shipSpeed = this._getShipSpeed(vesselId);
      const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));

      const mission = {
        id:               `exp_${this._nextId++}`,
        type:             'recon',
        scope:            'full_system',
        targetId:         firstTarget.id,
        targetName:       t('mission.fullSystem'),
        targetType:       'recon',
        departYear,
        arrivalYear:      departYear + travelTime,
        returnYear:       null,
        distance:         parseFloat(distance.toFixed(4)),
        travelTime,
        crewCost:         RECON_CREW_COST,
        vesselId:         vesselId ?? null,
        originColonyId:   vesselId ? (vMgr?.getVessel(vesselId)?.colonyId ?? colMgr?.activePlanetId) : colMgr?.activePlanetId,
        status:           'en_route',
        gained:           null,
        eventRoll:        null,
        bodiesDiscovered: [],
      };

      this._missions.push(mission);

      if (vMgr && vesselId) {
        const fuelCost = distance * (vMgr.getVessel(vesselId)?.fuel?.consumption ?? 0);
        vMgr.dispatchOnMission(vesselId, {
          type: 'recon', targetId: firstTarget.id,
          targetName: firstTarget.name,
          departYear, arrivalYear: mission.arrivalYear, returnYear: null,
          fuelCost,
        });
      }

      this._emit('mission:started', 'expedition:launched', { expedition: mission });
      return;
    }

    // scope === 'nearest'
    const nearest = this._findNearestUnexplored(null);
    const distance = nearest ? this._calcDistance(nearest) : 0.1;
    const shipSpeed = this._getShipSpeed(vesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));

    const mission = {
      id:          `exp_${this._nextId++}`,
      type:        'recon',
      scope:       'nearest',
      targetId:    nearest?.id ?? 'nearest',
      targetName:  nearest?.name ?? t('mission.nearestBody'),
      targetType:  'recon',
      departYear,
      arrivalYear: departYear + travelTime,
      returnYear:  departYear + travelTime * 2,
      distance:    parseFloat(distance.toFixed(4)),
      travelTime,
      crewCost:    RECON_CREW_COST,
      vesselId:    vesselId ?? null,
      originColonyId: vesselId ? (vMgr?.getVessel(vesselId)?.colonyId ?? colMgr?.activePlanetId) : colMgr?.activePlanetId,
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._missions.push(mission);

    if (vMgr && vesselId) {
      const fuelCost = distance * (vMgr.getVessel(vesselId)?.fuel?.consumption ?? 0);
      vMgr.dispatchOnMission(vesselId, {
        type: 'recon', targetId: nearest?.id ?? 'nearest',
        targetName: mission.targetName,
        departYear, arrivalYear: mission.arrivalYear, returnYear: mission.returnYear,
        fuelCost,
      });
    }

    this._emit('mission:started', 'expedition:launched', { expedition: mission });
  }

  // ── Recon na konkretne ciało ──────────────────────────────────────────────
  _launchReconTarget(targetId, vesselId) {
    const target = this._findTarget(targetId);
    if (!target) {
      this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.unknownTarget') });
      return;
    }
    if (target.explored) {
      this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.bodyAlreadyExplored') });
      return;
    }

    const distance = this._calcDistance(target);
    const vMgr  = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;

    if (vMgr && vesselId) {
      const vessel = vMgr.getVessel(vesselId);
      if (!vessel || vessel.status !== 'idle') {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.shipUnavailable') });
        return;
      }
      const fuelNeeded = distance * 2 * vessel.fuel.consumption;
      if (vessel.fuel.current < fuelNeeded) {
        this._emit('mission:failed', 'expedition:launchFailed', {
          reason: t('mission.insufficientFuelRoundTrip', fuelNeeded.toFixed(1))
        });
        return;
      }
    }

    if (this.resourceSystem) {
      if (!this.resourceSystem.canAfford(RECON_COST)) {
        this._emit('mission:failed', 'expedition:launchFailed', { reason: t('mission.noStartupResources') });
        return;
      }
      this.resourceSystem.spend(RECON_COST);
    }

    const shipSpeed = this._getShipSpeed(vesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));
    const departYear = this._gameYear;

    const mission = {
      id:          `exp_${this._nextId++}`,
      type:        'recon',
      scope:       'target',
      targetId,
      targetName:  target.name ?? '???',
      targetType:  target.type,
      departYear,
      arrivalYear: departYear + travelTime,
      returnYear:  departYear + travelTime * 2,
      distance:    parseFloat(distance.toFixed(4)),
      travelTime,
      crewCost:    RECON_CREW_COST,
      vesselId:    vesselId ?? null,
      originColonyId: vesselId ? (vMgr?.getVessel(vesselId)?.colonyId ?? colMgr?.activePlanetId) : colMgr?.activePlanetId,
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._missions.push(mission);

    if (vMgr && vesselId) {
      const fuelCost = distance * (vMgr.getVessel(vesselId)?.fuel?.consumption ?? 0);
      vMgr.dispatchOnMission(vesselId, {
        type: 'recon', targetId,
        targetName: mission.targetName,
        departYear, arrivalYear: mission.arrivalYear, returnYear: mission.returnYear,
        fuelCost,
      });
    }

    this._emit('mission:started', 'expedition:launched', { expedition: mission });
  }

  // ── Obsługa zniszczenia kolonii ─────────────────────────────────────────
  _onColonyDestroyed(planetId) {
    const homePlanetId = window.KOSMOS?.homePlanet?.id;

    for (const exp of this._missions) {
      if (exp.status === 'completed') continue;

      // Misje lecące DO zniszczonego ciała → anuluj
      if (exp.targetId === planetId && (exp.status === 'en_route' || exp.status === 'orbiting')) {
        exp.status = 'completed';
        // Odblokuj POPy — crewCost pochodzi z misji, nie ze statku
        // (POPy statku odblokowywane przy disband, tu chodzi o POPy misji)
        // VesselManager sam obsługuje powrót statku
      }

      // Misje z originColonyId = zniszczona kolonia → reassign na homePlanet
      if (exp.originColonyId === planetId && homePlanetId) {
        exp.originColonyId = homePlanetId;
      }
    }
  }

  // ── Sprawdzanie przybycz i powrotów ───────────────────────────────────────
  _checkArrivals() {
    let changed = false;

    for (const exp of this._missions) {
      if (exp.status === 'en_route' && this._gameYear >= exp.arrivalYear) {
        this._processArrival(exp);
        changed = true;
      } else if (exp.status === 'returning' && exp.returnYear && this._gameYear >= exp.returnYear) {
        exp.status = 'completed';
        // POPy zablokowane przy budowie statku — odblokowane tylko przy disband/zniszczeniu
        if (exp.vesselId) {
          const vMgr = window.KOSMOS?.vesselManager;
          if (vMgr) vMgr.dockAtColony(exp.vesselId, exp.originColonyId);
        }
        this._emit('mission:complete', 'expedition:returned', { expedition: exp });
        changed = true;
      }
    }

    if (changed) {
      const completed = this._missions.filter(e => e.status === 'completed');
      if (completed.length > 5) {
        const keep = new Set(completed.slice(-5));
        this._missions = this._missions.filter(
          e => e.status !== 'completed' || keep.has(e)
        );
      }
    }
  }

  // ── Przetwarzanie przybycia ───────────────────────────────────────────────
  _processArrival(exp) {
    if (exp.targetId) {
      this._visitCounts.set(exp.targetId, (this._visitCounts.get(exp.targetId) ?? 0) + 1);
    }

    // Wpis do dziennika statku
    const vMgr = window.KOSMOS?.vesselManager;
    if (exp.vesselId && vMgr) {
      const vessel = vMgr.getVessel(exp.vesselId);
      if (vessel) {
        addMissionLog(vessel, this._gameYear, `Dotarł do ${exp.targetName ?? '?'}`, 'info');
      }
    }

    if (exp.type === 'colony')        { this._processColonyArrival(exp); return; }
    if (exp.type === 'transport')     { this._processTransportArrival(exp); return; }
    if (exp.type === 'recon')         { this._processReconArrival(exp); return; }
    if (exp.type === 'found_outpost') { this._processFoundOutpostArrival(exp); return; }

    const roll = Math.random() * 100;
    exp.eventRoll = roll;
    const disasterThreshold = this._getDisasterChance(exp.vesselId);

    if (roll < disasterThreshold) {
      // Sprawdź emergency_protocols / force_fields — statek przeżywa uszkodzony
      const survivalChance = window.KOSMOS?.techSystem?.getShipSurvivalChance?.() ?? 0;
      if (survivalChance > 0 && Math.random() * 100 < survivalChance) {
        // Statek przeżywa — uszkodzony, zostaje na orbicie
        exp.status = 'orbiting';
        exp.gained = {};
        if (exp.vesselId && vMgr) {
          const vessel = vMgr.getVessel(exp.vesselId);
          if (vessel) {
            vessel.damaged = true;
            addMissionLog(vessel, this._gameYear, 'Protokół awaryjny — statek uszkodzony', 'warning');
            vMgr.arriveAtTarget(exp.vesselId);
          }
        }
        this._emit('mission:disaster', 'expedition:disaster', { expedition: exp, survived: true });
        return;
      }
      // KATASTROFA
      exp.status = 'completed';
      exp.gained = {};
      // Odblokuj POPy na kolonii źródłowej i zabij załogę
      const originCol1 = window.KOSMOS?.colonyManager?.getColony(exp.originColonyId);
      const crew1 = exp.crewCost ?? EXPEDITION_CREW_COST;
      if (originCol1?.civSystem) {
        originCol1.civSystem.unlockPops(crew1, exp.crewStrata);
        originCol1.civSystem.removePop(null, crew1);
        EventBus.emit('civ:popDied', { cause: 'expedition_disaster', population: originCol1.civSystem.population });
      }
      if (exp.vesselId && vMgr) {
        addMissionLog(vMgr.getVessel(exp.vesselId), this._gameYear, 'KATASTROFA — statek utracony!', 'danger');
        vMgr.destroyVessel(exp.vesselId);
      }
      this._emit('mission:disaster', 'expedition:disaster', { expedition: exp });
      return;
    }

    if (exp.type === 'scientific') {
      const target = this._findTarget(exp.targetId);
      if (target) target.explored = true;
      // Stats: bodiesSurveyed
      if (exp.vesselId && vMgr) {
        const vessel = vMgr.getVessel(exp.vesselId);
        if (vessel?.stats) vessel.stats.bodiesSurveyed += 1;
      }
    }

    const target    = this._findTarget(exp.targetId);
    const baseGains = this._baseYield(exp.type, target);

    let multiplier;
    if      (roll < 15) multiplier = 0.5;
    else if (roll < 90) multiplier = 1.0;
    else                multiplier = 1.5;

    // Bonus z obserwatorium w kolonii wysyłającej
    const obsSys = window.KOSMOS?.observatorySystem;
    if (obsSys && exp.originColonyId) {
      multiplier += obsSys.getMissionYieldBonus(exp.originColonyId);
    }

    const gained = {};
    for (const [key, val] of Object.entries(baseGains)) {
      gained[key] = Math.floor(val * multiplier);
    }

    exp.gained = gained;
    exp.status = 'orbiting';

    if (exp.vesselId && vMgr) {
      vMgr.arriveAtTarget(exp.vesselId);
      // Stats: resourcesHauled
      const vessel = vMgr.getVessel(exp.vesselId);
      if (vessel?.stats) {
        for (const v of Object.values(gained)) vessel.stats.resourcesHauled += v;
      }
    }

    if (this.resourceSystem && Object.keys(gained).length > 0) {
      this.resourceSystem.receive(gained);
    }

    const targetName = exp.targetName ?? '?';
    const icon = exp.type === 'scientific' ? '🔬' : '⛏';
    const gainParts = Object.entries(gained).map(([k, v]) => `${k}:${v}`).join(', ');
    const multStr = multiplier !== 1.0 ? ` (×${multiplier.toFixed(1)})` : '';
    this._emit('mission:report', 'expedition:missionReport', {
      expedition: exp, gained, multiplier,
      text: `${icon} ${targetName}: ${gainParts}${multStr}`,
    });

    // Odkrycie naukowe — losuj po misji scientific
    if (exp.type === 'scientific' && target) {
      const distAU = target.orbital?.a ?? 1.0;
      EventBus.emit('discovery:roll', {
        expedition: exp,
        bodyId: exp.targetId,
        bodyType: target.type,
        distanceAU: distAU,
      });
    }

    this._emit('mission:arrived', 'expedition:arrived', { expedition: exp, gained, multiplier });
  }

  // ── Colony arrival ────────────────────────────────────────────────────────
  _processColonyArrival(exp) {
    const colMgr = window.KOSMOS?.colonyManager;
    const vMgr   = window.KOSMOS?.vesselManager;

    // Upgrade outpost → pełna kolonia
    const existingCol = colMgr?.getColony(exp.targetId);
    if (existingCol?.isOutpost) {
      const roll = Math.random() * 100;
      let resourceMult;
      if      (roll < 15) resourceMult = 0.5;
      else if (roll < 85) resourceMult = 1.0;
      else                resourceMult = 1.5;

      const startResources = {};
      for (const [key, val] of Object.entries(COLONY_START_RESOURCES)) {
        startResources[key] = Math.floor(val * resourceMult);
      }
      existingCol.resourceSystem.receive(startResources);
      colMgr.upgradeOutpostToColony(exp.targetId, exp.crewCost);

      // Odblokuj POPy na kolonii źródłowej (bezpośrednio)
      const originColUpgrade = colMgr?.getColony(exp.originColonyId);
      if (originColUpgrade) originColUpgrade.civSystem.unlockPops(exp.crewCost, exp.crewStrata);
      if (exp.vesselId && vMgr) vMgr.destroyVessel(exp.vesselId);

      exp.status = 'completed';
      exp.gained = startResources;

      this._emit('mission:report', 'expedition:missionReport', {
        expedition: exp,
        gained: startResources,
        multiplier: resourceMult,
        text: t('colony.outpostUpgraded'),
      });
      return;
    }

    const roll = Math.random() * 100;
    exp.eventRoll = roll;
    const disasterThreshold = this._getDisasterChance(exp.vesselId);

    if (exp.vesselId && vMgr) {
      vMgr.destroyVessel(exp.vesselId);
    }

    if (roll < disasterThreshold) {
      // KATASTROFA — kolonia NIE powstaje
      exp.status = 'completed';
      exp.gained = {};
      // Odblokuj POPy na kolonii źródłowej i zabij załogę
      const originColDisaster = colMgr?.getColony(exp.originColonyId);
      if (originColDisaster?.civSystem) {
        originColDisaster.civSystem.unlockPops(exp.crewCost, exp.crewStrata);
        originColDisaster.civSystem.removePop(null, exp.crewCost);
        EventBus.emit('civ:popDied', { cause: 'colony_disaster', population: originColDisaster.civSystem.population });
      }
      this._emit('mission:disaster', 'expedition:disaster', { expedition: exp });
      return;
    }

    let resourceMult;
    if      (roll < 20) resourceMult = 0.5;
    else if (roll < 90) resourceMult = 1.0;
    else                resourceMult = 1.5;

    const startResources = {};
    for (const [key, val] of Object.entries(COLONY_START_RESOURCES)) {
      startResources[key] = Math.floor(val * resourceMult);
    }

    exp.gained = startResources;
    exp.status = 'completed';

    // Odblokuj POPy na kolonii źródłowej (bezpośrednio)
    const originColFounded = colMgr?.getColony(exp.originColonyId);
    if (originColFounded) originColFounded.civSystem.unlockPops(exp.crewCost, exp.crewStrata);

    this._emit('expedition:colonyFounded', null, {
      expedition:     exp,
      planetId:       exp.targetId,
      startResources,
      startPop:       exp.crewCost,
      roll:           roll,
      resourceMult,
    });

    this._emit('mission:arrived', 'expedition:arrived', {
      expedition: exp,
      gained: startResources,
      multiplier: resourceMult,
    });
  }

  // ── Transport arrival ─────────────────────────────────────────────────────
  _processTransportArrival(exp) {
    const colMgr = window.KOSMOS?.colonyManager;
    const vMgr   = window.KOSMOS?.vesselManager;
    const targetCol = colMgr?.getColony(exp.targetId);

    if (targetCol) {
      // Dostarcz cargo — prefaby zostają na statku, reszta do inventory kolonii
      const vessel = exp.vesselId ? vMgr?.getVessel(exp.vesselId) : null;

      if (exp.cargo) {
        const deliverable = {};
        for (const [key, val] of Object.entries(exp.cargo)) {
          if (val > 0) deliverable[key] = val;
        }
        targetCol.resourceSystem.receive(deliverable);
        exp.gained = deliverable;

        // Loguj import (cargo dostarczone do kolonii)
        if (Object.keys(deliverable).length > 0) {
          const originCol = colMgr?.getColony(exp.originColonyId);
          EventBus.emit('trade:imported', {
            colonyId: exp.targetId,
            year: this._gameYear,
            items: { ...deliverable },
            vesselName: vessel?.name ?? exp.vesselId ?? '?',
            sourceName: originCol?.name ?? exp.originColonyId ?? '?',
          });
        }
      } else {
        exp.gained = {};
      }

      // Stats: resourcesHauled
      if (vessel?.stats && exp.cargo) {
        for (const v of Object.values(exp.cargo)) vessel.stats.resourcesHauled += v;
      }

      // Wyczyść cargo statku — wszystko dostarczone
      if (vessel) {
        vessel.cargo = {};
        vessel.cargoUsed = 0;
      }
      exp.cargo = null;

      // Dock statek w kolonii docelowej + transfer floty
      exp.status = 'completed';

      if (exp.vesselId && vMgr) {
        const oldColonyId = vessel?.colonyId;
        const oldCol = oldColonyId ? colMgr.getColony(oldColonyId) : null;
        if (oldCol) {
          const idx = oldCol.fleet.indexOf(exp.vesselId);
          if (idx !== -1) oldCol.fleet.splice(idx, 1);
        }
        vMgr.dockAtColony(exp.vesselId, exp.targetId);
        if (!targetCol.fleet.includes(exp.vesselId)) {
          targetCol.fleet.push(exp.vesselId);
        }
      }
    } else if (colMgr) {
      // Cel BEZ kolonii — sprawdź czy cel jest w tym samym układzie co kolonia macierzysta
      const vessel = exp.vesselId ? vMgr?.getVessel(exp.vesselId) : null;
      const originCol = colMgr.getColony(exp.originColonyId);
      const targetBody = this._findTarget(exp.targetId);
      const originSysId = originCol?.systemId ?? 'sys_home';
      const targetSysId = targetBody?.systemId ?? 'sys_home';

      if (originSysId !== targetSysId) {
        // Obcy układ — statek orbituje cel, NIE tworzymy outpostu (wymaga moduł kolonizacyjny)
        exp.status = 'orbiting';
        if (exp.vesselId && vMgr) {
          vMgr.arriveAtTarget(exp.vesselId, exp.targetId);
        }
      } else {
        // Ten sam układ — utwórz outpost z cargo (jeśli jest co dostarczyć)
        const outpostResources = {};

        if (vessel?.cargo) {
          for (const [comId, qty] of Object.entries(vessel.cargo)) {
            if (qty <= 0) continue;
            outpostResources[comId] = (outpostResources[comId] ?? 0) + qty;
          }
        }

        if (exp.cargo) {
          for (const [key, val] of Object.entries(exp.cargo)) {
            if (val > 0) outpostResources[key] = (outpostResources[key] ?? 0) + val;
          }
        }

        const hasCargo = Object.keys(outpostResources).length > 0;

        if (!hasCargo) {
          // Pusty transport bez cargo — statek orbituje cel, nie tworzy pustego outpostu
          exp.status = 'orbiting';
          if (exp.vesselId && vMgr) {
            vMgr.arriveAtTarget(exp.vesselId, exp.targetId);
          }
        } else {
          // Stats: resourcesHauled
          if (vessel?.stats) {
            for (const v of Object.values(outpostResources)) vessel.stats.resourcesHauled += v;
          }

          const gameYear = Math.floor(this._gameYear);
          colMgr.createOutpost(exp.targetId, outpostResources, gameYear);

          if (exp.vesselId && vMgr) {
            const oldColonyId = vessel?.colonyId;
            const oldCol2 = oldColonyId ? colMgr.getColony(oldColonyId) : null;
            if (oldCol2) {
              const idx = oldCol2.fleet.indexOf(exp.vesselId);
              if (idx !== -1) oldCol2.fleet.splice(idx, 1);
            }
            vMgr.dockAtColony(exp.vesselId, exp.targetId);

            if (vessel) {
              vessel.cargo = {};
              vessel.cargoUsed = 0;
            }

            const outpostCol = colMgr.getColony(exp.targetId);
            if (outpostCol && !outpostCol.fleet.includes(exp.vesselId)) {
              outpostCol.fleet.push(exp.vesselId);
            }
          }

          exp.gained = outpostResources;
          exp.status = 'completed';
        }
      }
    }

    this._emit('mission:arrived', 'expedition:arrived', {
      expedition: exp,
      gained: exp.gained ?? exp.cargo,
      multiplier: 1.0,
    });
  }

  // ── Found outpost arrival ─────────────────────────────────────────────────
  _processFoundOutpostArrival(exp) {
    const colMgr = window.KOSMOS?.colonyManager;
    const vMgr   = window.KOSMOS?.vesselManager;
    const vessel = exp.vesselId ? vMgr?.getVessel(exp.vesselId) : null;
    const gameYear = Math.floor(this._gameYear);

    // Utwórz outpost z cargo statku
    const outpostResources = {};
    if (vessel?.cargo) {
      for (const [comId, qty] of Object.entries(vessel.cargo)) {
        if (qty > 0) outpostResources[comId] = (outpostResources[comId] ?? 0) + qty;
      }
    }

    const outpost = colMgr?.createOutpost(exp.targetId, outpostResources, gameYear);
    if (!outpost) {
      // Cel ma już kolonię — powrót statku
      exp.status = 'completed';
      if (vessel && vMgr) {
        vMgr.dockAtColony(exp.vesselId, exp.originColonyId);
      }
      this._emit('mission:arrived', 'expedition:missionReport', {
        expedition: exp, gained: {}, multiplier: 0,
        text: t('mission.targetHasColony'),
      });
      return;
    }

    // Wygeneruj siatkę hex dla outpostu (potrzebna do autoPlaceBuilding)
    if (!outpost.grid && outpost.planet) {
      const grid = PlanetMapGenerator.generate(outpost.planet, false);
      outpost.grid = grid;
      if (outpost.buildingSystem) {
        outpost.buildingSystem._grid = grid;
        outpost.buildingSystem._gridHeight = grid.height ?? 10;
      }
    }

    // Auto-build budynku na outpoście
    const bDef = BUILDINGS[exp.buildingId];
    let buildSuccess = false;
    if (bDef && outpost.buildingSystem) {
      buildSuccess = outpost.buildingSystem.autoPlaceBuilding(exp.buildingId);
    }

    // Wyczyść cargo statku
    if (vessel) {
      vessel.cargo = {};
      vessel.cargoUsed = 0;
    }

    // Dok statek w outpoście + transfer floty
    if (exp.vesselId && vMgr) {
      const oldColonyId = vessel?.colonyId;
      const oldCol = oldColonyId ? colMgr?.getColony(oldColonyId) : null;
      if (oldCol) {
        const idx = oldCol.fleet.indexOf(exp.vesselId);
        if (idx !== -1) oldCol.fleet.splice(idx, 1);
      }
      vMgr.dockAtColony(exp.vesselId, exp.targetId);
      if (!outpost.fleet.includes(exp.vesselId)) {
        outpost.fleet.push(exp.vesselId);
      }
    }

    exp.status  = 'completed';
    exp.gained  = outpostResources;

    // Raport misji
    const bName = bDef ? (bDef.namePL ?? exp.buildingId) : exp.buildingId;
    this._emit('mission:arrived', 'expedition:missionReport', {
      expedition: exp,
      gained: outpostResources,
      multiplier: 1.0,
      text: buildSuccess
        ? t('expedition.foundOutpost', bName)
        : t('expedition.foundOutpostFailed'),
    });
  }

  // ── Recon arrival ─────────────────────────────────────────────────────────
  _processReconArrival(exp) {
    const roll = Math.random() * 100;
    exp.eventRoll = roll;
    const vMgr = window.KOSMOS?.vesselManager;
    const disasterThreshold = this._getDisasterChance(exp.vesselId);

    if (roll < disasterThreshold) {
      // KATASTROFA
      exp.status = 'completed';
      exp.gained = {};
      // Odblokuj POPy na kolonii źródłowej i zabij załogę
      const originColRecon = window.KOSMOS?.colonyManager?.getColony(exp.originColonyId);
      const crewRecon = exp.crewCost ?? RECON_CREW_COST;
      if (originColRecon?.civSystem) {
        originColRecon.civSystem.unlockPops(crewRecon, exp.crewStrata);
        originColRecon.civSystem.removePop(null, crewRecon);
        EventBus.emit('civ:popDied', { cause: 'expedition_disaster', population: originColRecon.civSystem.population });
      }
      if (exp.vesselId && vMgr) {
        vMgr.destroyVessel(exp.vesselId);
      } else {
        const colMgr = window.KOSMOS?.colonyManager;
        const activePid = colMgr?.activePlanetId;
        if (colMgr) colMgr.consumeShip(activePid, 'science_vessel');
      }
      this._emit('mission:disaster', 'expedition:disaster', { expedition: exp });
      return;
    }

    // Rozpoznanie konkretnego ciała (scope='target' lub 'nearest')
    if (exp.scope === 'target' || exp.scope === 'nearest') {
      const discovered = [];
      const target = this._findTarget(exp.targetId);
      if (target && !target.explored) {
        target.explored = true;
        discovered.push(target.id);
        if (target.type === 'planet') {
          for (const m of EntityManager.getByType('moon')) {
            if (m.parentPlanetId === target.id && !m.explored) {
              m.explored = true;
              discovered.push(m.id);
            }
          }
        }
      }

      // Stats: bodiesSurveyed
      if (exp.vesselId && vMgr) {
        const vessel = vMgr.getVessel(exp.vesselId);
        if (vessel?.stats) vessel.stats.bodiesSurveyed += discovered.length;
      }

      exp.gained = { discovered: discovered.length };
      exp.status = 'orbiting';

      if (exp.vesselId && vMgr) {
        vMgr.arriveAtTarget(exp.vesselId);
      }

      this._emit('survey:complete', 'expedition:reconComplete', {
        expedition: exp, scope: exp.scope, discovered,
      });
      this._emit('mission:arrived', 'expedition:arrived', { expedition: exp, gained: exp.gained, multiplier: 1.0 });
      return;
    }

    // Sekwencyjny full_system (deep_scan)
    if (exp.scope === 'full_system') {
      const target = this._findTarget(exp.targetId);
      if (target && !target.explored) {
        target.explored = true;
        if (!exp.bodiesDiscovered) exp.bodiesDiscovered = [];
        exp.bodiesDiscovered.push(target.id);
        if (target.type === 'planet') {
          for (const m of EntityManager.getByType('moon')) {
            if (m.parentPlanetId === target.id && !m.explored) {
              m.explored = true;
              exp.bodiesDiscovered.push(m.id);
            }
          }
        }
      }

      // Stats
      if (exp.vesselId && vMgr) {
        const vessel = vMgr.getVessel(exp.vesselId);
        if (vessel?.stats) vessel.stats.bodiesSurveyed += 1;
      }

      this._emit('deep_scan:progress', 'expedition:reconProgress', {
        expedition: exp,
        body: target,
        discovered: exp.bodiesDiscovered?.length ?? 0,
      });

      // Szukaj następnego celu (greedy NN)
      const nextTarget = this._findNearestUnexploredFrom(target, exp.id);

      if (nextTarget) {
        const vessel = vMgr?.getVessel(exp.vesselId);
        const homePl = window.KOSMOS?.homePlanet;
        if (vessel && homePl) {
          const distNext = DistanceUtils.euclideanAU(target, nextTarget);
          const distReturn = DistanceUtils.euclideanAU(nextTarget, homePl);
          const fuelNeeded = (distNext + distReturn) * vessel.fuel.consumption;

          if (vessel.fuel.current >= fuelNeeded) {
            const shipSpeed = this._getShipSpeed(exp.vesselId);
            const travelNext = parseFloat(Math.max(MIN_TRAVEL_YEARS, distNext / shipSpeed).toFixed(3));

            exp.targetId = nextTarget.id;
            exp.arrivalYear = this._gameYear + travelNext;
            exp.status = 'en_route';

            if (vMgr && exp.vesselId) {
              vMgr.redirectToTarget(exp.vesselId, nextTarget.id, exp.arrivalYear);
            }
            return; // kontynuuj
          }
        }
      }

      // Koniec deep_scan
      exp.gained = { discovered: exp.bodiesDiscovered?.length ?? 0 };
      exp.status = 'orbiting';

      if (exp.vesselId && vMgr) {
        vMgr.arriveAtTarget(exp.vesselId);
      }

      this._emit('survey:complete', 'expedition:reconComplete', {
        expedition: exp, scope: 'full_system',
        discovered: exp.bodiesDiscovered ?? [],
      });
      this._emit('mission:arrived', 'expedition:arrived', { expedition: exp, gained: exp.gained, multiplier: 1.0 });
      return;
    }

    // Fallback
    exp.status = 'returning';
    if (exp.vesselId && vMgr) vMgr.startReturn(exp.vesselId);
  }

  // ── Helpery ───────────────────────────────────────────────────────────────

  _getActiveReconTargets(excludeExpId = null) {
    const targets = new Set();
    for (const exp of this._missions) {
      if (exp.id === excludeExpId) continue;
      if (exp.type !== 'recon') continue;
      if (exp.status !== 'en_route') continue;
      targets.add(exp.targetId);
    }
    return targets;
  }

  _findNearestUnexplored(excludeExpId = null) {
    const homePl = window.KOSMOS?.homePlanet;
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const activeTargets = this._getActiveReconTargets(excludeExpId);
    const candidates = [];

    for (const p of EntityManager.getByTypeInSystem('planet', sysId)) {
      if (p === homePl || p.explored || activeTargets.has(p.id)) continue;
      candidates.push(p);
    }
    for (const m of EntityManager.getByTypeInSystem('moon', sysId)) {
      if (m.explored || activeTargets.has(m.id)) continue;
      candidates.push(m);
    }
    for (const pl of EntityManager.getByTypeInSystem('planetoid', sysId)) {
      if (pl.explored || activeTargets.has(pl.id)) continue;
      candidates.push(pl);
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => this._calcDistance(a) - this._calcDistance(b));
    return candidates[0];
  }

  _findNearestUnexploredFrom(fromEntity, excludeExpId = null) {
    if (!fromEntity) return this._findNearestUnexplored(excludeExpId);
    const homePl = window.KOSMOS?.homePlanet;
    const sysId = fromEntity.systemId ?? window.KOSMOS?.activeSystemId ?? 'sys_home';
    const activeTargets = this._getActiveReconTargets(excludeExpId);
    const candidates = [];

    for (const p of EntityManager.getByTypeInSystem('planet', sysId)) {
      if (p === homePl || p.explored || activeTargets.has(p.id)) continue;
      candidates.push(p);
    }
    for (const m of EntityManager.getByTypeInSystem('moon', sysId)) {
      if (m.explored || activeTargets.has(m.id)) continue;
      candidates.push(m);
    }
    for (const pl of EntityManager.getByTypeInSystem('planetoid', sysId)) {
      if (pl.explored || activeTargets.has(pl.id)) continue;
      candidates.push(pl);
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) =>
      DistanceUtils.euclideanAU(fromEntity, a) - DistanceUtils.euclideanAU(fromEntity, b)
    );
    return candidates[0];
  }

  _baseYield(type, target) {
    if (!target) return { Fe: 30 };

    const gained = {};
    const deposits = target.deposits ?? [];

    if (type === 'mining' && deposits.length > 0) {
      for (const d of deposits) {
        if (d.remaining <= 0) continue;
        const amt = Math.min(150, Math.max(5, Math.floor(d.richness * 30)));
        gained[d.resourceId] = (gained[d.resourceId] ?? 0) + amt;
      }
      if (Object.keys(gained).length === 0) gained.Fe = 20;
      return gained;
    }

    if (target.type === 'asteroid' || target.type === 'planetoid') {
      const comp = target.composition ?? {};
      gained.Fe = Math.max(10, Math.min(200, Math.floor((comp.Fe ?? 15) * 1.5)));
      if ((comp.Si ?? 0) > 5) gained.Si = Math.floor((comp.Si ?? 0) * 0.8);
      if ((comp.C  ?? 0) > 5) gained.C  = Math.floor((comp.C  ?? 0) * 0.8);
      if (type === 'scientific') gained.research = 30;
    } else if (target.type === 'comet') {
      gained.water    = 200;
      gained.C        = 40;
      gained.research = 50;
    } else if (target.type === 'moon') {
      const comp = target.composition ?? {};
      const massMult = (target.physics?.mass ?? 0) > 0.01 ? 1.0 : 0.5;
      gained.Fe = Math.max(10, Math.floor((comp.Fe ?? 10) * massMult));
      gained.Si = Math.max(5,  Math.floor((comp.Si ?? 5)  * massMult * 0.5));
      if ((comp.H2O ?? 0) > 5)  gained.water = Math.floor((comp.H2O ?? 0) * massMult * 2);
      if ((comp.Cu  ?? 0) > 0.5) gained.Cu   = Math.floor((comp.Cu ?? 0) * massMult * 3);
      if ((comp.Ti  ?? 0) > 0.1) gained.Ti   = Math.floor((comp.Ti ?? 0) * massMult * 2);
      if (type === 'scientific') gained.research = target.atmosphere !== 'none' ? 60 : 30;
    } else if (target.type === 'planet') {
      const comp = target.composition ?? {};
      gained.Fe    = Math.max(20, Math.floor((comp.Fe  ?? 15) * 0.8));
      gained.Si    = Math.max(5,  Math.floor((comp.Si  ?? 10) * 0.5));
      gained.water = Math.max(10, Math.floor((comp.H2O ?? 5)  * 0.8));
      if (target.surface?.hasWater) gained.food = 30;
      if (type === 'scientific') gained.research = (target.lifeScore ?? 0) > 30 ? 80 : 30;
    } else {
      gained.Fe = 30;
    }

    return gained;
  }

  _calcDistance(target) {
    const home = window.KOSMOS?.homePlanet;
    if (!home || !target) return 0.1;
    const dist = DistanceUtils.euclideanAU(home, target);
    return Math.max(0.001, dist);
  }

  _getShipSpeed(vesselId) {
    const vMgr = window.KOSMOS?.vesselManager;
    let base = 1.0;
    if (vMgr && vesselId) {
      const vessel = vMgr.getVessel(vesselId);
      if (vessel) {
        const shipDef = SHIPS[vessel.shipId];
        // Warp = natychmiastowy lot (bardzo duża prędkość → travelTime ≈ 0)
        if (shipDef?.warpCapable) return 99999;
        base = vessel.speedAU ?? shipDef?.speedAU ?? 1.0;
        // Uszkodzony statek — 50% prędkości
        if (vessel.damaged) base *= 0.5;
      }
    }
    // Mnożnik z technologii napędowych
    const techMult = window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1.0;
    return base * techMult;
  }

  // Oblicz efektywne ryzyko katastrofy (%) z uwzględnieniem doświadczenia statku i tech
  _getDisasterChance(vesselId) {
    let chance = BASE_DISASTER_CHANCE;

    // Redukcja z doświadczenia statku
    const vMgr = window.KOSMOS?.vesselManager;
    if (vMgr && vesselId) {
      const vessel = vMgr.getVessel(vesselId);
      if (vessel) chance -= vessel.experience * XP_REDUCTION_PER;
    }

    // Redukcja z technologii
    const techRed = window.KOSMOS?.techSystem?.getDisasterReduction() ?? 0;
    chance -= techRed;

    // Redukcja z obserwatorium w kolonii wysyłającej
    const obsSys = window.KOSMOS?.observatorySystem;
    if (obsSys && vMgr && vesselId) {
      const vessel = vMgr.getVessel(vesselId);
      const colId = vessel?.colonyId;
      if (colId) chance -= obsSys.getDisasterReduction(colId);
    }

    return Math.max(MIN_DISASTER_CHANCE, chance);
  }

  _isInRange(target, shipId) {
    const ship = SHIPS[shipId];
    if (!ship || !ship.range) return true;
    const dist = DistanceUtils.orbitalFromHomeAU(target);
    return dist <= ship.range;
  }

  _findTarget(targetId) {
    const TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];
    for (const t of TYPES) {
      const bodies = EntityManager.getByType(t);
      const found  = bodies.find(b => b.id === targetId);
      if (found) return found;
    }
    return null;
  }
}
