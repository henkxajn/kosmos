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
    label: 'Zbadaj ciało',
    icon: '🔭',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked' && vessel.position.state !== 'orbiting') {
        return { ok: false, reason: 'Statek w locie' };
      }
      if (vessel.status !== 'idle' && vessel.status !== 'on_mission') {
        return { ok: false, reason: 'Statek zajęty' };
      }
      const ms = state.missionSystem;
      if (!ms) return { ok: false, reason: 'Brak systemu misji' };
      const techOk = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
      if (!techOk) return { ok: false, reason: 'Brak tech: Rakietnictwo' };
      if (!_checkPad(vessel, state)) return { ok: false, reason: 'Brak Wyrzutni (wymagana dla tego kadłuba)' };
      const caps = _getVesselCaps(vessel);
      if (!caps.has('survey')) {
        return { ok: false, reason: 'Statek nie ma zdolności zwiadowczych' };
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
    label: 'Skan układu',
    icon: '📡',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: 'Statek musi być w hangarze' };
      if (vessel.status !== 'idle') return { ok: false, reason: 'Statek zajęty' };
      const ms = state.missionSystem;
      if (!ms) return { ok: false, reason: 'Brak systemu misji' };
      const techOk = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
      if (!techOk) return { ok: false, reason: 'Brak tech: Rakietnictwo' };
      if (!_checkPad(vessel, state)) return { ok: false, reason: 'Brak Wyrzutni (wymagana dla tego kadłuba)' };
      const caps = _getVesselCaps(vessel);
      if (!caps.has('deep_scan')) {
        return { ok: false, reason: 'Statek nie ma zdolności skanowania' };
      }
      const unexplored = ms.getUnexploredCount();
      if (unexplored.total === 0) return { ok: false, reason: 'Układ w pełni zbadany' };
      return { ok: true };
    },
    execute(vessel, state) {
      state.missionSystem.createMission('deep_scan', vessel.id, {});
    },
  },

  mining: {
    id: 'mining',
    label: 'Wydobycie',
    icon: '⛏',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: 'Statek musi być w hangarze' };
      if (vessel.status !== 'idle') return { ok: false, reason: 'Statek zajęty' };
      const techOk = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
      if (!techOk) return { ok: false, reason: 'Brak tech: Rakietnictwo' };
      if (!_checkPad(vessel, state)) return { ok: false, reason: 'Brak Wyrzutni (wymagana dla tego kadłuba)' };
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
    label: 'Transport',
    icon: '📦',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked' && vessel.position.state !== 'orbiting') {
        return { ok: false, reason: 'Statek w locie' };
      }
      // Pozwól tankującym statkom na misję — paliwo sprawdzane przy dispatchu
      if (vessel.status !== 'idle' && vessel.status !== 'on_mission' && vessel.status !== 'refueling') {
        return { ok: false, reason: 'Statek zajęty' };
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
      });
    },
  },

  colonize: {
    id: 'colonize',
    label: 'Kolonizuj',
    icon: '🏗',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: 'Statek musi być w hangarze' };
      if (vessel.status !== 'idle') return { ok: false, reason: 'Statek zajęty' };
      const caps = _getVesselCaps(vessel);
      if (!caps.has('colony')) return { ok: false, reason: 'Statek nie ma zdolności kolonizacyjnych' };
      const ms = state.missionSystem;
      if (!ms) return { ok: false, reason: 'Brak systemu misji' };
      const techOk = window.KOSMOS?.techSystem?.isResearched('colonization') ?? false;
      if (!techOk) return { ok: false, reason: 'Brak tech: Kolonizacja' };
      if (!_checkPad(vessel, state)) return { ok: false, reason: 'Brak Wyrzutni (wymagana dla tego kadłuba)' };
      if (state.targetId) {
        const check = ms.canLaunchColony(state.targetId);
        if (!check.ok) {
          if (!check.exploredOk)  return { ok: false, reason: 'Cel niezbadany' };
          if (!check.typeOk)      return { ok: false, reason: 'Cel nie nadaje się' };
          if (!check.notColonized) return { ok: false, reason: 'Cel ma kolonię' };
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

  found_outpost: {
    id: 'found_outpost',
    label: 'Załóż placówkę',
    icon: '🏗',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: 'Statek musi być w hangarze' };
      if (vessel.status !== 'idle') return { ok: false, reason: 'Statek zajęty' };
      const caps = _getVesselCaps(vessel);
      if (!caps.has('cargo')) return { ok: false, reason: 'Wymaga statku cargo' };
      const techOk = window.KOSMOS?.techSystem?.isResearched('exploration') ?? false;
      if (!techOk) return { ok: false, reason: 'Brak tech: Eksploracja' };
      if (!_checkPad(vessel, state)) return { ok: false, reason: 'Brak Wyrzutni (wymagana dla tego kadłuba)' };
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

  return_home: {
    id: 'return_home',
    label: 'Powrót',
    icon: '🏠',
    requiresTarget: false,
    canExecute(vessel, state) {
      // Dostępny gdy orbituje lub jest w locie
      if (vessel.position.state === 'docked') return { ok: false, reason: 'Statek w hangarze' };

      // Blokada: away team na powierzchni
      if (vessel.awayTeamUnitId) return { ok: false, reason: 'Zbierz Away Team przed odlotem' };

      // Statek już wraca (vessel-level) — nie potrzebuje rozkazu
      if (vessel.mission?.phase === 'returning') return { ok: false, reason: 'Już wraca' };

      // Znajdź misję statku w systemie ekspedycji
      const ms = state.missionSystem;
      const mission = ms?.getActive().find(m => m.vesselId === vessel.id);

      // Statek bez aktywnej ekspedycji ale wciąż w locie/na orbicie — pozwól wrócić bezpośrednio
      if (!mission) {
        // Statek ma vessel.mission (VesselManager) — można wydać rozkaz powrotu
        if (vessel.mission) {
          return { ok: true };
        }
        return { ok: false, reason: 'Brak aktywnej misji' };
      }
      if (mission.status === 'returning') return { ok: false, reason: 'Już wraca' };

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
          return { ok: true, lowFuel: true, reason: `Mało paliwa (${vessel.fuel.current.toFixed(1)}/${fuelNeeded.toFixed(1)} pc)` };
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

  trade_route: {
    id: 'trade_route',
    label: 'Trasa handlowa',
    icon: '🔄',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'docked') return { ok: false, reason: 'Statek musi być w hangarze' };
      if (vessel.status !== 'idle') return { ok: false, reason: 'Statek zajęty' };
      const caps = _getVesselCaps(vessel);
      if (!caps.has('cargo')) {
        return { ok: false, reason: 'Wymaga statku cargo' };
      }
      const techOk = window.KOSMOS?.techSystem?.isResearched('interplanetary_logistics') ?? false;
      if (!techOk) return { ok: false, reason: 'Brak tech: Logistyka' };
      return { ok: true };
    },
    execute(vessel, state) {
      // Obsługa w FleetTabPanel — otwiera TradeRouteModal
    },
  },

  redirect: {
    id: 'redirect',
    label: 'Zmień cel',
    icon: '🔄',
    requiresTarget: true,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: 'Statek musi orbitować' };
      const ms = state.missionSystem;
      if (!ms) return { ok: false, reason: 'Brak systemu misji' };
      const mission = ms.getActive().find(m => m.vesselId === vessel.id);
      if (!mission) return { ok: false, reason: 'Brak aktywnej misji' };
      if (mission.status !== 'orbiting') return { ok: false, reason: 'Statek nie na orbicie' };
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

  // ── Akcje skanowania i Away Team (orbita) ─────────────────────────────

  full_scan: {
    id: 'full_scan',
    label: 'Pełny Skan',
    icon: '📡',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: 'Wymaga orbity' };
      if (vessel.status !== 'idle') return { ok: false, reason: 'Statek zajęty' };
      // Wymaga modułu naukowego
      const hasSciMod = (vessel.modules ?? []).some(
        m => SHIP_MODULES[m]?.slotType === 'science'
      );
      if (!hasSciMod) return { ok: false, reason: 'Brak modułu naukowego' };
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
    label: 'Wyślij Away Team',
    icon: '🤖',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: 'Wymaga orbity' };
      if (vessel.status !== 'idle') return { ok: false, reason: 'Statek zajęty' };
      // Wymaga modułu away team
      const hasAT = (vessel.modules ?? []).some(
        m => SHIP_MODULES[m]?.stats?.enablesAwayTeam
      );
      if (!hasAT) return { ok: false, reason: 'Brak modułu Away Team' };
      // Nie może mieć już aktywnego away team
      if (vessel.awayTeamUnitId) return { ok: false, reason: 'Away Team już na powierzchni' };
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
    label: 'Zbierz Away Team',
    icon: '⬆',
    requiresTarget: false,
    canExecute(vessel, state) {
      if (vessel.position.state !== 'orbiting') return { ok: false, reason: 'Wymaga orbity' };
      if (!vessel.awayTeamUnitId) return { ok: false, reason: 'Brak Away Team na powierzchni' };
      return { ok: true };
    },
    execute(vessel, state) {
      EventBus.emit('vessel:collectAwayTeam', {
        vesselId: vessel.id,
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
    if (caps.has('survey')) {
      result.push(_check(ACTIONS.survey, vessel, state));
    }
    if (caps.has('deep_scan')) {
      result.push(_check(ACTIONS.deep_scan, vessel, state));
    }
    if (caps.has('colony')) {
      result.push(_check(ACTIONS.colonize, vessel, state));
    }
    result.push(_check(ACTIONS.transport, vessel, state));
    if (caps.has('cargo')) {
      result.push(_check(ACTIONS.found_outpost, vessel, state));
      result.push(_check(ACTIONS.trade_route, vessel, state));
    }
  } else if (vessel.position.state === 'orbiting') {
    // Na orbicie — skan, away team, powrót, redirect, transport
    result.push(_check(ACTIONS.full_scan, vessel, state));
    result.push(_check(ACTIONS.send_away_team, vessel, state));
    result.push(_check(ACTIONS.collect_away_team, vessel, state));
    result.push(_check(ACTIONS.return_home, vessel, state));
    result.push(_check(ACTIONS.redirect, vessel, state));
    result.push(_check(ACTIONS.transport, vessel, state));
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
