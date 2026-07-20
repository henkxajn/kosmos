// FleetActions — definicje akcji dostępnych dla statków
//
// Każda akcja ma:
//   id:          unikalny klucz
//   label:       tekst przycisku (PL)
//   icon:        emoji ikona
//   canExecute:  (vessel, state) → { ok, reason }
//   execute:     (vessel, state) → void (deleguje do MissionSystem / VesselManager)
//
// state = {
//   missionSystem, vesselManager, colonyManager, techSystem,
//   activePlanetId, targetId, cargo
// }

import { SHIPS } from './ShipsData.js';
import { HULLS } from './HullsData.js';
import { SHIP_MODULES, getModuleCapabilities } from './ShipModulesData.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';
import { canColonize } from '../entities/Vessel.js';

// Helper: czy statek wymaga wyrzutni (spaceport)?
// Małe kadłuby (size === 'small') nie wymagają — mogą startować/lądować wszędzie
function _needsSpaceport(vessel) {
  const hull = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
  if (hull?.size === 'small') return false;
  return hull?.requiresSpaceport !== false; // domyślnie true
}

// Helper: sprawdź spaceport — pomija check dla małych statków
function _checkPad(vessel, state) {
  if (!_needsSpaceport(vessel)) return true;
  const vesselColony = state.colonyManager?.getColony(vessel.colonyId);
  return vesselColony?.buildingSystem?.hasSpaceport() ?? false;
}

// Helper: pobierz zdolności statku (kadłub + moduły)
function _getVesselCaps(vessel) {
  const hull = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
  const hullCaps = hull?.capabilities ?? [];
  const modCaps = vessel.modules?.length ? getModuleCapabilities(vessel.modules) : new Set();
  // Każdy statek z napędem może robić recon (zwiad)
  if (vessel.modules?.some(m => SHIP_MODULES[m]?.slotType === 'propulsion')) {
    modCaps.add('recon');
    modCaps.add('survey');
  }
  // Połącz kadłub + moduły
  const all = new Set(hullCaps);
  for (const c of modCaps) all.add(c);
  return all;
}

// ── Definicje akcji ─────────────────────────────────────────────────────────

const ACTIONS = {
  survey: {
    id: 'survey',
    get label() { return t('fleet.action.survey'); },
    icon: '🔭',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked' && vessel.position.state !== 'orbiting') {
        return { ok: false, reason: t('fleet.reason.inFlight') };
      }
      if (vessel.status !== 'idle' && vessel.status !== 'on_mission') {
        return { ok: false, reason: t('fleet.reasonBusy') };
      }
      const ms = state.missionSystem;
      if (!ms) return { ok: false, reason: t('fleet.reason.noMissionSystem') };
      const techOk = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
      if (!techOk) return { ok: false, reason: t('fleet.reason.needRocketry') };
      if (!_checkPad(vessel, state)) return { ok: false, reason: t('fleet.reason.needSpaceport') };
      const caps = _getVesselCaps(vessel);
      if (!caps.has('survey')) {
        return { ok: false, reason: t('fleet.reason.noSurveyCap') };
      }
      return { ok: true };
    },
    execute(vessel, state) {
      if (!state.targetId) return;
      state.missionSystem.createMission('survey', vessel.id, { targetId: state.targetId });
    },
  },

  deep_scan: {
    id: 'deep_scan',
    get label() { return t('fleet.action.deepScan'); },
    icon: '📡',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: t('fleet.reason.mustBeDocked') };
      if (vessel.status !== 'idle') return { ok: false, reason: t('fleet.reasonBusy') };
      const ms = state.missionSystem;
      if (!ms) return { ok: false, reason: t('fleet.reason.noMissionSystem') };
      const techOk = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
      if (!techOk) return { ok: false, reason: t('fleet.reason.needRocketry') };
      if (!_checkPad(vessel, state)) return { ok: false, reason: t('fleet.reason.needSpaceport') };
      const caps = _getVesselCaps(vessel);
      if (!caps.has('deep_scan')) {
        return { ok: false, reason: t('fleet.reason.noScanCap') };
      }
      const unexplored = ms.getUnexploredCount();
      if (unexplored.total === 0) return { ok: false, reason: t('fleet.reason.systemFullyExplored') };
      return { ok: true };
    },
    execute(vessel, state) {
      state.missionSystem.createMission('deep_scan', vessel.id, {});
    },
  },

  mining: {
    id: 'mining',
    get label() { return t('fleet.action.mining'); },
    icon: '⛏',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: t('fleet.reason.mustBeDocked') };
      if (vessel.status !== 'idle') return { ok: false, reason: t('fleet.reasonBusy') };
      const techOk = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
      if (!techOk) return { ok: false, reason: t('fleet.reason.needRocketry') };
      if (!_checkPad(vessel, state)) return { ok: false, reason: t('fleet.reason.needSpaceport') };
      return { ok: true };
    },
    execute(vessel, state) {
      if (!state.targetId) return;
      EventBus.emit('expedition:sendRequest', {
        type: 'mining', targetId: state.targetId, vesselId: vessel.id,
      });
    },
  },

  transport: {
    id: 'transport',
    get label() { return t('fleet.action.transport'); },
    icon: '📦',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked' && vessel.position.state !== 'orbiting') {
        return { ok: false, reason: t('fleet.reason.inFlight') };
      }
      // Pozwól tankującym statkom na misję — paliwo sprawdzane przy dispatchu
      if (vessel.status !== 'idle' && vessel.status !== 'on_mission' && vessel.status !== 'refueling') {
        return { ok: false, reason: t('fleet.reasonBusy') };
      }
      return { ok: true };
    },
    execute(vessel, state) {
      if (!state.targetId) return;
      EventBus.emit('expedition:transportRequest', {
        targetId: state.targetId,
        cargo: state.cargo ?? {},
        vesselId: vessel.id,
        cargoPreloaded: true,
        // Transport cykliczny (pętla z powracającym ładunkiem) — kiedyś w TradeRouteManager,
        // teraz natywnie w MissionSystem.
        loop: !!state.loop,
        returnCargoSpec: state.returnCargoSpec ?? null,
      });
    },
  },

  // ── Transport pasażerski (S3.4 FAZA 4) — 1 POP z bieżącego doku (kolonia/stacja) do celu ──
  // Wymaga modułu z pojemnością pasażera (passenger_module / habitat_pod). Załadunek POP w
  // MissionSystem._launchPassenger (kolonia: population>1; stacja: pop>0). One-shot, bez pętli.
  transport_passenger: {
    id: 'transport_passenger',
    get label() { return t('fleet.actionPassenger'); },
    icon: '🧑‍🚀',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: t('fleet.reasonNotDocked') };
      if (vessel.status !== 'idle' && vessel.status !== 'refueling') return { ok: false, reason: t('fleet.reasonBusy') };
      if ((vessel.colonistCapacity ?? 0) <= 0) return { ok: false, reason: t('fleet.reasonNoPassengerCabin') };
      return { ok: true };
    },
    execute(vessel, state) {
      if (!state.targetId) return;
      EventBus.emit('expedition:passengerRequest', { targetId: state.targetId, vesselId: vessel.id });
    },
  },

  colonize: {
    id: 'colonize',
    get label() { return t('fleet.action.colonize'); },
    icon: '🏗',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: t('fleet.reason.mustBeDocked') };
      if (vessel.status !== 'idle') return { ok: false, reason: t('fleet.reasonBusy') };
      // B1 (F4 live-gate): kolonizacja przez JEDNO źródło prawdy — Vessel.canColonize (moduł habitat),
      // NIE caps.has('colony') (= colonistCapacity>0, przez co czysty passenger fałszywie kolonizował).
      if (!canColonize(vessel)) return { ok: false, reason: t('fleet.reason.noColonyCap') };
      const ms = state.missionSystem;
      if (!ms) return { ok: false, reason: t('fleet.reason.noMissionSystem') };
      const techOk = window.KOSMOS?.techSystem?.isResearched('colonization') ?? false;
      if (!techOk) return { ok: false, reason: t('fleet.reason.needColonization') };
      // Misja kolonizacyjna: średni/duży kadłub nie wymaga wyrzutni (statek → spaceport na miejscu)
      const hull = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
      const colonyBypassPad = hull?.size === 'medium' || hull?.size === 'large';
      if (!colonyBypassPad && !_checkPad(vessel, state)) return { ok: false, reason: t('fleet.reason.needSpaceport') };
      if (state.targetId) {
        const check = ms.canLaunchColony(state.targetId);
        if (!check.ok) {
          if (!check.exploredOk)  return { ok: false, reason: t('fleet.reason.targetUnexplored') };
          if (!check.typeOk)      return { ok: false, reason: t('fleet.reason.targetUnsuitable') };
        }
      }
      return { ok: true };
    },
    execute(vessel, state) {
      if (!state.targetId) return;
      EventBus.emit('expedition:sendRequest', {
        type: 'colony', targetId: state.targetId, vesselId: vessel.id,
      });
    },
  },

  // ── Załadunek kolonistów bez startu (pre-load pod kolonizację cross-system) ──
  // Ładuje POPy na kolonizator i TRZYMA je (load-and-hold), bez wyboru celu i bez startu.
  // Warp colony ship: załaduj tu → skok STRATCOM → „Kolonizuj obcy" (czyta vessel.colonists).
  // Rozładunek: istniejący przycisk „Wyładuj kolonistów".
  load_colonists: {
    id: 'load_colonists',
    get label() { return t('fleet.actionLoadColonists'); },
    icon: '👥',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: t('fleet.reasonNotDocked') };
      if (vessel.status !== 'idle' && vessel.status !== 'refueling') return { ok: false, reason: t('fleet.reasonBusy') };
      if (Math.max(0, (vessel.colonistCapacity ?? 0) - (vessel.colonists ?? 0)) <= 0) {
        return { ok: false, reason: t('fleet.reasonColonistCabinsFull') };
      }
      const colony = state.colonyManager?.getColony(vessel.colonyId);
      if (Math.floor(colony?.civSystem?.freePops ?? 0) <= 0) return { ok: false, reason: t('fleet.reasonNoFreePops') };
      return { ok: true };
    },
    // Realizację przechwytuje FleetManagerOverlay._handleAction (modal + loadColonists) — execute no-op.
    execute() {},
  },

  found_outpost: {
    id: 'found_outpost',
    get label() { return t('fleet.action.foundOutpost'); },
    icon: '🏗',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: t('fleet.reason.mustBeDocked') };
      if (vessel.status !== 'idle') return { ok: false, reason: t('fleet.reasonBusy') };
      const caps = _getVesselCaps(vessel);
      if (!caps.has('cargo')) return { ok: false, reason: t('fleet.reason.needCargoShip') };
      const techOk = window.KOSMOS?.techSystem?.isResearched('exploration') ?? false;
      if (!techOk) return { ok: false, reason: t('fleet.reason.needExploration') };
      if (!_checkPad(vessel, state)) return { ok: false, reason: t('fleet.reason.needSpaceport') };
      return { ok: true };
    },
    execute(vessel, state) {
      if (!state.targetId || !state.buildingId) return;
      EventBus.emit('expedition:foundOutpostRequest', {
        targetId: state.targetId,
        buildingId: state.buildingId,
        vesselId: vessel.id,
      });
    },
  },

  // ── Załadunek wojsk na statek desantowy (docked) ──────────────────────
  load_troops: {
    id: 'load_troops',
    get label() { return t('fleet.action.loadTroops'); },
    icon: '🪖',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked' && vessel.position.state !== 'orbiting') {
        return { ok: false, reason: t('fleet.reason.inFlight') };
      }
      if ((vessel.troopCapacity ?? 0) <= 0) return { ok: false, reason: t('fleet.reason.noTroopBay') };
      return { ok: true };
    },
    execute(vessel, state) {
      // Otwórz CargoLoadModal — gracz wybiera jednostki garnizonu z kolonii
      // i ładuje na statek. Walidacja pojemności (transportSize) w loadGroundUnit().
      EventBus.emit('vessel:openCargoModal', { vesselId: vessel.id });
    },
  },

  // ── Lot i orbita wokół dowolnego ciała (docked) ────────────────────────
  // Uniwersalna akcja "leć i zatrzymaj się na orbicie". Bez science bonus,
  // bez transport cargo — czysty lot. Po dotarciu statek orbituje czekając
  // na kolejny rozkaz (drop troops, orbital strike, redirect, return).
  // Jeśli ciało docelowe należy do wroga, bitwa orbitalna zostanie wywołana
  // przez WarSystem._fleetArrived (mechanizm istniejący dla flot AI).
  // UWAGA: nie wymaga spaceport (ani u źródła, ani u celu) — to manewr kosmiczny,
  // statek wychodzi na orbitę z hangaru i zrzuca przez drop pods, bez lądowania.
  orbit: {
    id: 'orbit',
    get label() { return t('fleet.action.orbit'); },
    icon: '⊙',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: t('fleet.reason.mustBeDocked') };
      if (vessel.status !== 'idle') return { ok: false, reason: t('fleet.reasonBusy') };
      const techOk = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
      if (!techOk) return { ok: false, reason: t('fleet.reason.needRocketry') };
      return { ok: true };
    },
    execute(vessel, state) {
      if (!state.targetId) return;
      // Misja typu `survey` z oznaczeniem `orbitOnly` — leci, orbituje, nie robi science.
      // ExpeditionSystem/MissionSystem traktuje ją jak recon-target ale bez yield.
      state.missionSystem?.createMission('survey', vessel.id, {
        targetId: state.targetId,
        orbitOnly: true,
      });
    },
  },

  return_home: {
    id: 'return_home',
    get label() { return t('fleet.action.return'); },
    icon: '🏠',
    requiresTarget: false,
    canExecute(vessel, state) {
      // Dostępny gdy orbituje lub jest w locie
      if (vessel.position.state === 'docked') return { ok: false, reason: t('fleet.reason.inHangar') };

      // Blokada: away team na powierzchni
      if (vessel.awayTeamUnitId) return { ok: false, reason: t('fleet.reason.collectAwayFirst') };

      // Statek już wraca (vessel-level) — nie potrzebuje rozkazu
      if (vessel.mission?.phase === 'returning') return { ok: false, reason: t('fleet.reason.alreadyReturning') };

      // Znajdź misję statku w systemie ekspedycji
      const ms = state.missionSystem;
      const mission = ms?.getActive().find(m => m.vesselId === vessel.id);

      // Statek bez aktywnej ekspedycji ale wciąż w locie/na orbicie — pozwól wrócić bezpośrednio
      if (!mission) {
        // Statek ma vessel.mission (VesselManager) — można wydać rozkaz powrotu
        if (vessel.mission) {
          return { ok: true };
        }
        return { ok: false, reason: t('fleet.reason.noActiveMission') };
      }
      if (mission.status === 'returning') return { ok: false, reason: t('fleet.reason.alreadyReturning') };

      // Statek w obcym układzie — powrót = skok warp (nie lokalny dystans)
      const homeEntity = state.vesselManager?._findEntity(vessel.colonyId);
      const homeSystemId = homeEntity?.systemId ?? 'sys_home';
      const isForeign = vessel.systemId && vessel.systemId !== homeSystemId;
      if (isForeign) {
        return { ok: true }; // warp fuel sprawdzany w dispatchInterstellar
      }

      // Sprawdź paliwo na powrót (ostrzeżenie, nie blokada — "lot awaryjny")
      const AU_TO_PX = GAME_CONFIG.AU_TO_PX;
      if (homeEntity && vessel.fuel) {
        const distPx = Math.hypot(vessel.position.x - homeEntity.x, vessel.position.y - homeEntity.y);
        const distAU = distPx / AU_TO_PX;
        const fuelNeeded = distAU * (vessel.fuel.consumption ?? 0);
        if (vessel.fuel.current < fuelNeeded) {
          return { ok: true, lowFuel: true, reason: t('fleet.reason.lowFuel', vessel.fuel.current.toFixed(1), fuelNeeded.toFixed(1)) };
        }
      }
      return { ok: true };
    },
    execute(vessel, state) {
      const vMgr = state.vesselManager;

      // ── Statek w obcym układzie → skok warp do macierzystego ──
      const homeColony = vMgr?._findEntity(vessel.colonyId);
      const homeSystemId = homeColony?.systemId ?? 'sys_home';
      const isForeign = vessel.systemId && vessel.systemId !== homeSystemId;

      if (isForeign && vMgr) {
        // Przerwij bieżącą misję (foreign_recon itp.)
        if (vessel.mission?.type === 'foreign_recon') {
          vMgr.abortForeignRecon(vessel.id);
        }
        // Resetuj stan do idle i odpal skok międzygwiezdny
        vessel.status = 'idle';
        vessel.position.state = 'docked';
        vessel.mission = null;
        vMgr.dispatchInterstellar(vessel.id, homeSystemId);
        return;
      }

      // ── Lokalny powrót (w ramach tego samego układu) ──
      const ms = state.missionSystem;
      const mission = ms?.getActive().find(m => m.vesselId === vessel.id);
      if (mission) {
        ms.cancelMission(mission.id);
      } else {
        // Brak ekspedycji ale statek jest w kosmosie — bezpośredni powrót przez VesselManager
        if (vMgr && vessel.mission) {
          const hx = homeColony?.x ?? 0;
          const hy = homeColony?.y ?? 0;
          const distPx = Math.hypot(vessel.position.x - hx, vessel.position.y - hy);
          const distAU = distPx / GAME_CONFIG.AU_TO_PX;
          // Statek nie zdążył odlecieć — natychmiastowy powrót
          if (distAU < 0.01) {
            vMgr.dockAtColony(vessel.id, vessel.colonyId);
            return;
          }
          const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
          const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
          const speed = (vessel.speedAU ?? ship?.speedAU ?? 0.3) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
          const travelYears = distAU / speed;
          vessel.mission.returnYear = gameYear + travelYears;
          vMgr.startReturn(vessel.id);
        }
      }
    },
  },

  redirect: {
    id: 'redirect',
    get label() { return t('fleet.action.redirect'); },
    icon: '🔄',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: t('fleet.reason.mustOrbit') };
      const ms = state.missionSystem;
      if (!ms) return { ok: false, reason: t('fleet.reason.noMissionSystem') };
      const mission = ms.getActive().find(m => m.vesselId === vessel.id);
      if (!mission) return { ok: false, reason: t('fleet.reason.noActiveMission') };
      if (mission.status !== 'orbiting') return { ok: false, reason: t('fleet.reason.notOrbiting') };
      return { ok: true };
    },
    execute(vessel, state) {
      if (!state.targetId) return;
      const ms = state.missionSystem;
      const mission = ms.getActive().find(m => m.vesselId === vessel.id);
      if (mission) {
        EventBus.emit('expedition:orderRedirect', {
          expeditionId: mission.id,
          targetId: state.targetId,
        });
      }
    },
  },

  // ── Dokowanie do stacji orbitalnej (depot paliwa, S3.3b-S3) ───────────
  // Dostępne gdy statek orbituje ciało, na którego orbicie jest WŁASNA stacja.
  // Dok → VesselManager.dockAtStation (port uniwersalny, dockedAt=stationId).
  dock_station: {
    id: 'dock_station',
    get label() { return t('fleet.action.dockStation'); },
    icon: '🛰',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: t('fleet.reason.requiresOrbit') };
      if (vessel.status !== 'idle' && vessel.status !== 'on_mission') return { ok: false, reason: t('fleet.reasonBusy') };
      const stations = window.KOSMOS?.stationSystem?.getStationsAt?.(vessel.position.dockedAt) ?? [];
      if (!stations.some(s => (s.ownerEmpireId ?? 'player') === 'player')) {
        return { ok: false, reason: t('fleet.reason.noOwnStation') };
      }
      return { ok: true };
    },
    execute(vessel, state) {
      const stations = window.KOSMOS?.stationSystem?.getStationsAt?.(vessel.position.dockedAt) ?? [];
      const station = stations.find(s => (s.ownerEmpireId ?? 'player') === 'player') ?? stations[0];
      if (station) state.vesselManager?.dockAtStation(vessel.id, station.id);
    },
  },

  // ── Akcje skanowania i Away Team (orbita) ─────────────────────────────

  full_scan: {
    id: 'full_scan',
    get label() { return t('fleet.action.fullScan'); },
    icon: '📡',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: t('fleet.reason.requiresOrbit') };
      if (vessel.status !== 'idle') return { ok: false, reason: t('fleet.reasonBusy') };
      // Wymaga modułu naukowego
      const hasSciMod = (vessel.modules ?? []).some(
        m => SHIP_MODULES[m]?.slotType === 'science'
      );
      if (!hasSciMod) return { ok: false, reason: t('fleet.reason.noScienceModule') };
      return { ok: true };
    },
    execute(vessel, state) {
      EventBus.emit('vessel:fullScan', {
        vesselId: vessel.id,
        targetId: vessel.position.dockedAt,
      });
    },
  },

  send_away_team: {
    id: 'send_away_team',
    get label() { return t('fleet.action.sendAwayTeam'); },
    icon: '🤖',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: t('fleet.reason.requiresOrbit') };
      if (vessel.status !== 'idle') return { ok: false, reason: t('fleet.reasonBusy') };
      // Wymaga modułu away team
      const hasAT = (vessel.modules ?? []).some(
        m => SHIP_MODULES[m]?.stats?.enablesAwayTeam
      );
      if (!hasAT) return { ok: false, reason: t('fleet.reason.noAwayTeamModule') };
      // Nie może mieć już aktywnego away team
      if (vessel.awayTeamUnitId) return { ok: false, reason: t('fleet.reason.awayTeamDeployed') };
      return { ok: true };
    },
    execute(vessel, state) {
      EventBus.emit('vessel:sendAwayTeam', {
        vesselId: vessel.id,
        targetId: vessel.position.dockedAt,
      });
    },
  },

  collect_away_team: {
    id: 'collect_away_team',
    get label() { return t('fleet.action.collectAwayTeam'); },
    icon: '⬆',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: t('fleet.reason.requiresOrbit') };
      if (!vessel.awayTeamUnitId) return { ok: false, reason: t('fleet.reason.noAwayTeamDeployed') };
      return { ok: true };
    },
    execute(vessel, state) {
      EventBus.emit('vessel:collectAwayTeam', {
        vesselId: vessel.id,
      });
    },
  },

  // ── Zrzut desantu (orbita + drop_pods + załadowane wojsko) ─────────────
  drop_troops: {
    id: 'drop_troops',
    get label() { return t('fleet.action.dropTroops'); },
    icon: '⚔',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: t('fleet.reason.requiresOrbit') };
      if (!vessel.canDropTroops) return { ok: false, reason: t('fleet.reason.noDropPods') };
      if ((vessel.groundUnits?.length ?? 0) === 0) return { ok: false, reason: t('fleet.reason.holdEmpty') };
      // Dominacja orbitalna wymagana dla wrogich ciał (własne kolonie OK bez bitwy).
      // Wrogie = kolonia z ownerEmpireId LUB isTestEnemy (debug spawn), lub brak kolonii w colMgr.
      const targetId = vessel.position.dockedAt;
      const colMgr = state.colonyManager;
      const warSys = window.KOSMOS?.warSystem;
      const targetColony = colMgr?.getColony?.(targetId);
      const targetIsOwn = !!targetColony
        && !targetColony.ownerEmpireId
        && !targetColony.isTestEnemy;
      if (!targetIsOwn && warSys && !warSys.playerHasOrbitalDominance(targetId)) {
        return { ok: false, reason: t('fleet.reason.noOrbitalDominance') };
      }
      return { ok: true };
    },
    execute(vessel, state) {
      EventBus.emit('vessel:dropTroopsRequest', {
        vesselId: vessel.id,
        targetId: vessel.position.dockedAt,
      });
    },
  },

  // ── Ostrzał orbitalny (orbita + orbital_strike_battery + amunicja + cooldown) ─
  orbital_strike: {
    id: 'orbital_strike',
    get label() { return t('fleet.action.orbitalStrike'); },
    icon: '💥',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: t('fleet.reason.requiresOrbit') };
      if (!vessel.orbitalStrike) return { ok: false, reason: t('fleet.reason.noStrikeBattery') };
      const os = vessel.orbitalStrike;
      if ((os.ammoCurrent ?? 0) <= 0) return { ok: false, reason: t('fleet.reason.noAmmo') };
      const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      if (gameYear < (os.cooldownUntilYear ?? 0)) {
        return { ok: false, reason: t('fleet.reason.cooldown', (os.cooldownUntilYear - gameYear).toFixed(1)) };
      }
      const targetId = vessel.position.dockedAt;
      const colMgr = state.colonyManager;
      const warSys = window.KOSMOS?.warSystem;
      const targetColony = colMgr?.getColony?.(targetId);
      const targetIsOwn = !!targetColony
        && !targetColony.ownerEmpireId
        && !targetColony.isTestEnemy;
      if (!targetIsOwn && warSys && !warSys.playerHasOrbitalDominance(targetId)) {
        return { ok: false, reason: t('fleet.reason.noOrbitalDominance') };
      }
      return { ok: true };
    },
    execute(vessel, state) {
      EventBus.emit('vessel:orbitalStrikeRequest', {
        vesselId: vessel.id,
        targetId: vessel.position.dockedAt,
      });
    },
  },
};

// ── Helper: pobierz dostępne akcje dla statku ────────────────────────────────

/**
 * Zwraca tablicę akcji z informacją o dostępności.
 * @param {object} vessel — VesselInstance
 * @param {object} state — kontekst (missionSystem, colonyManager, etc.)
 * @returns {Array<{action, ok, reason}>}
 */
export function getAvailableActions(vessel, state) {
  const result = [];

  // Akcje wg stanu statku
  if (vessel.position.state === 'docked') {
    // W hangarze — akcje misji wg zdolności (kadłub + moduły)
    const caps = _getVesselCaps(vessel);
    // Uniwersalna akcja lotu — każdy statek z silnikiem może lecieć i orbitować
    result.push(_check(ACTIONS.orbit, vessel, state));
    // Załadunek wojska — widoczne tylko dla statków z troop bay
    if ((vessel.troopCapacity ?? 0) > 0) {
      result.push(_check(ACTIONS.load_troops, vessel, state));
    }
    // Survey/deep_scan wymagają modułu naukowego (science_lab/deep_scanner/quantum_scanner),
    // nie tylko posiadania silnika (caps.has('survey') jest przyznawane każdemu z engine).
    const hasScience = (vessel.modules ?? []).some(m => SHIP_MODULES[m]?.slotType === 'science');
    if (hasScience && caps.has('survey')) {
      result.push(_check(ACTIONS.survey, vessel, state));
    }
    if (hasScience && caps.has('deep_scan')) {
      result.push(_check(ACTIONS.deep_scan, vessel, state));
    }
    // B1 (F4 live-gate): dostępność kolonizacji przez Vessel.canColonize (moduł habitat), NIE
    // caps.has('colony') — passenger-only ma colonistCapacity>0, ale NIE koloniuzje.
    if (canColonize(vessel)) {
      result.push(_check(ACTIONS.colonize, vessel, state));
      result.push(_check(ACTIONS.load_colonists, vessel, state));   // pre-load POP (kolonizacja cross-system)
    }
    result.push(_check(ACTIONS.transport, vessel, state));
    // Transport pasażerski — statki z pojemnością na pasażera (passenger_module / colony ship).
    if ((vessel.colonistCapacity ?? 0) > 0) {
      result.push(_check(ACTIONS.transport_passenger, vessel, state));
    }
    if (caps.has('cargo')) {
      result.push(_check(ACTIONS.found_outpost, vessel, state));
    }
  } else if (vessel.position.state === 'orbiting') {
    // Załadunek (przy własnej kolonii — canExecute sprawdzi kontekst)
    if ((vessel.troopCapacity ?? 0) > 0) {
      result.push(_check(ACTIONS.load_troops, vessel, state));
    }
    // Desant (drop pods + załadowane wojsko + dominacja)
    if (vessel.canDropTroops) {
      result.push(_check(ACTIONS.drop_troops, vessel, state));
    }
    // Ostrzał orbitalny (bateria + amunicja + dominacja)
    if (vessel.orbitalStrike) {
      result.push(_check(ACTIONS.orbital_strike, vessel, state));
    }
    // Skaner pokładowy (tylko gdy jest moduł naukowy)
    const hasScience = (vessel.modules ?? []).some(m => SHIP_MODULES[m]?.slotType === 'science');
    if (hasScience) {
      result.push(_check(ACTIONS.full_scan, vessel, state));
    }
    // Away Team (tylko gdy jest moduł science_away_team)
    const hasAwayTeam = (vessel.modules ?? []).some(m => SHIP_MODULES[m]?.stats?.enablesAwayTeam);
    if (hasAwayTeam) {
      result.push(_check(ACTIONS.send_away_team, vessel, state));
      // Zbierz pokazuje się tylko gdy team JEST na powierzchni (żeby nie zaśmiecać UI)
      if (vessel.awayTeamUnitId) {
        result.push(_check(ACTIONS.collect_away_team, vessel, state));
      }
    }
    result.push(_check(ACTIONS.return_home, vessel, state));
    result.push(_check(ACTIONS.redirect, vessel, state));
    result.push(_check(ACTIONS.transport, vessel, state));
    // Dokowanie do stacji — tylko gdy na orbicie ciała jest stacja (depot paliwa, S3.3b-S3).
    if ((window.KOSMOS?.stationSystem?.getStationsAt?.(vessel.position.dockedAt)?.length ?? 0) > 0) {
      result.push(_check(ACTIONS.dock_station, vessel, state));
    }
  } else if (vessel.position.state === 'in_transit') {
    // W locie — tylko powrót
    result.push(_check(ACTIONS.return_home, vessel, state));
  }

  return result;
}

function _check(action, vessel, state) {
  const { ok, reason } = action.canExecute(vessel, state);
  return { action, ok, reason: reason ?? '' };
}

export { ACTIONS as FLEET_ACTIONS };
