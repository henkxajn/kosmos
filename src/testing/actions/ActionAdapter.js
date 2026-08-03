// ═══════════════════════════════════════════════════════════════
// ActionAdapter — tłumaczy abstrakcyjną akcję botową na EventBus.emit
// ─────────────────────────────────────────────────────────────
// Akcja ma format: { type: '<typ>', ...payload }
// ActionAdapter.execute(action) emituje odpowiedni event KOSMOS'a.
// Zwraca { emitted: boolean, event: string, reason?: string }
// ═══════════════════════════════════════════════════════════════

import EventBus from '../../core/EventBus.js';
import { loadColonists } from '../../entities/Vessel.js';

/** Aktywna kolonia gracza → jej CivilizationSystem (per-kolonia). Wzorzec z ActionCatalog._getActive. */
function _activeCivSystem() {
  const K = window.KOSMOS;
  const cm = K?.colonyManager;
  const active = cm?._activePlanetId ?? K?.homePlanet?.id;
  return active ? (cm?.getColony(active)?.civSystem ?? null) : null;
}

export const ACTION_TYPES = {
  BUILD:         'build',
  UPGRADE:       'upgrade',
  DEMOLISH:      'demolish',
  RESEARCH:      'research',
  EXPEDITION:    'expedition',
  BUILD_SHIP:    'buildShip',
  FACTORY_ENQUEUE: 'factoryEnqueue',
  FACTORY_DEQUEUE: 'factoryDequeue',
  FACTORY_SET_MODE: 'factorySetMode',
  SET_STRATA_TARGET: 'setStrataTarget',   // 5C slider (Allocation 2.0) — intent-method, nie EventBus
  LOAD_COLONISTS:  'loadColonists',        // realny „Załaduj POP" przed kolonizacją
  WAIT:          'wait',
};

/** Emit akcję jako EventBus event. Zwraca metadane. */
export function execute(action) {
  if (!action || !action.type) return { emitted: false, reason: 'no_type' };

  switch (action.type) {
    case ACTION_TYPES.BUILD:
      if (!action.tile || !action.buildingId) return { emitted: false, reason: 'missing_tile_or_building' };
      EventBus.emit('planet:buildRequest', { tile: action.tile, buildingId: action.buildingId });
      return { emitted: true, event: 'planet:buildRequest' };

    case ACTION_TYPES.UPGRADE:
      if (!action.tile) return { emitted: false, reason: 'missing_tile' };
      EventBus.emit('planet:upgradeRequest', { tile: action.tile });
      return { emitted: true, event: 'planet:upgradeRequest' };

    case ACTION_TYPES.DEMOLISH:
      if (!action.tile) return { emitted: false, reason: 'missing_tile' };
      EventBus.emit('planet:demolishRequest', { tile: action.tile });
      return { emitted: true, event: 'planet:demolishRequest' };

    case ACTION_TYPES.RESEARCH: {
      if (!action.techId) return { emitted: false, reason: 'missing_tech' };
      // REALNA ścieżka gracza = ResearchSystem.queueTech (progresywna akumulacja punktów
      // w slocie, dokładnie jak TechOverlay:597). Stara ścieżka `tech:researchRequest` →
      // TechSystem._research wymaga CAŁEGO kosztu jako ryczałt w research.amount naraz —
      // a ResourceSystem capuje bezczynny bank do perYear×RESEARCH_BANK_YEARS(2) → ryczałt
      // NIGDY nie starcza na tech (≥50) → 0 zbadanych techów (flatline). NIE zmiana balansu:
      // RESEARCH_BANK_YEARS i koszty techów nietknięte — tylko API path bota.
      const rSys = window.KOSMOS?.researchSystem;
      if (!rSys?.queueTech) return { emitted: false, reason: 'no_research_system' };
      const queued = rSys.queueTech(action.techId);   // false = już aktywne/w kolejce (benign no-op)
      return { emitted: true, event: 'research:queueTech', queued };
    }

    case ACTION_TYPES.EXPEDITION:
      if (!action.missionType || !action.targetId) return { emitted: false, reason: 'missing_expedition_args' };
      EventBus.emit('expedition:sendRequest', {
        type: action.missionType,
        targetId: action.targetId,
        vesselId: action.vesselId ?? null,
        cargo: action.cargo ?? null,
      });
      return { emitted: true, event: 'expedition:sendRequest' };

    case ACTION_TYPES.BUILD_SHIP:
      if (!action.shipId) return { emitted: false, reason: 'missing_ship' };
      EventBus.emit('fleet:buildRequest', {
        shipId: action.shipId,
        modules: action.modules ?? [],
        planetId: action.planetId ?? window.KOSMOS?.homePlanet?.id,
      });
      return { emitted: true, event: 'fleet:buildRequest' };

    case ACTION_TYPES.FACTORY_ENQUEUE:
      if (!action.commodityId) return { emitted: false, reason: 'missing_commodity' };
      EventBus.emit('factory:enqueue', {
        commodityId: action.commodityId,
        qty: action.qty ?? 1,
      });
      return { emitted: true, event: 'factory:enqueue' };

    case ACTION_TYPES.FACTORY_DEQUEUE:
      EventBus.emit('factory:dequeue', { index: action.index ?? 0 });
      return { emitted: true, event: 'factory:dequeue' };

    case ACTION_TYPES.FACTORY_SET_MODE:
      if (!action.mode) return { emitted: false, reason: 'missing_mode' };
      EventBus.emit('factory:setMode', { mode: action.mode });
      return { emitted: true, event: 'factory:setMode' };

    case ACTION_TYPES.SET_STRATA_TARGET: {
      // REALNA ścieżka gracza 5C = CivilizationSystem.setStrataTarget (intent-method, NIE EventBus;
      // stepper targetPlus/targetMinus w ColonyOverlay woła DOKŁADNIE to — Allocation 2.0,
      // FEATURES.popAllocation2). Absolutny share [0..1]; clamp + neutralizacja (share≤0) w metodzie.
      if (!action.strataType) return { emitted: false, reason: 'missing_strata_type' };
      const civ = _activeCivSystem();
      if (!civ?.setStrataTarget) return { emitted: false, reason: 'no_civ_system' };
      if (!civ.strata?.[action.strataType]) return { emitted: false, reason: 'unknown_strata' };
      civ.setStrataTarget(action.strataType, action.share ?? 0);
      return { emitted: true, event: 'civ:setStrataTarget', strataType: action.strataType, share: action.share ?? 0 };
    }

    case ACTION_TYPES.LOAD_COLONISTS: {
      // REALNA ścieżka gracza „Załaduj POP" = Vessel.loadColonists (FleetManagerOverlay load-and-hold).
      // Fizycznie drenuje POP z kolonii-źródła. Ilość = REALNA pojemność kabin z modułu (NIE stała) —
      // domyślnie wszystkie wolne kabiny (colonistCapacity − colonists); early-game hull_small+habitat_pod
      // = 4 kabiny, a loadColonists sam dokłada cap min(count, kabiny, freePops).
      if (!action.vesselId) return { emitted: false, reason: 'missing_vessel' };
      const K = window.KOSMOS;
      const vessel = K?.vesselManager?.getVessel?.(action.vesselId);
      if (!vessel) return { emitted: false, reason: 'vessel_not_found' };
      const originId = vessel.position?.dockedAt ?? vessel.colonyId;
      const originCol = K?.colonyManager?.getColony?.(originId);
      const civ = originCol?.civSystem;
      if (!civ) return { emitted: false, reason: 'no_source_colony' };
      const freeCabins = Math.max(0, (vessel.colonistCapacity ?? 0) - (vessel.colonists ?? 0));
      const want = action.count != null ? action.count : freeCabins;   // domyślnie pełna pojemność
      const loaded = loadColonists(vessel, want, civ);                  // realna metoda, drenuje POP
      return { emitted: true, event: 'vessel:loadColonists', loaded };
    }

    case ACTION_TYPES.WAIT:
      return { emitted: true, event: null, noop: true };

    default:
      return { emitted: false, reason: `unknown_action_type: ${action.type}` };
  }
}

export default { execute, ACTION_TYPES };
