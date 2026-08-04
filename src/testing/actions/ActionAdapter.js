// ═══════════════════════════════════════════════════════════════
// ActionAdapter — tłumaczy abstrakcyjną akcję botową na EventBus.emit
// ─────────────────────────────────────────────────────────────
// Akcja ma format: { type: '<typ>', ...payload }
// ActionAdapter.execute(action) emituje odpowiedni event KOSMOS'a.
// Zwraca { emitted: boolean, event: string, reason?: string }
// ═══════════════════════════════════════════════════════════════

import EventBus from '../../core/EventBus.js';
import { loadColonists, loadCargo } from '../../entities/Vessel.js';

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
  INSTALL_DROID:   'installDroid',         // Pop 2.0 Faza 4 — droid substytuuje pracę (labor scarcity)
  FOUND_OUTPOST:   'foundOutpost',         // autonomiczna placówka (cargo ship + budynek autonomiczny)
  LOAD_CARGO:      'loadCargo',            // załaduj towar na statek (goods bundle POP-kolonizacji)
  TRANSPORT:       'transport',            // transport towarów kolonia→kolonia (outpost→home shipping)
  SET_DROID_ORDER: 'setDroidOrder',        // zlecenie budowy droida (Build-N) — direct, dowolny tryb
  SET_ONESHOT:     'setOneShot',           // jednorazowa produkcja towaru (burst bufor) — direct, dowolny tryb
  ORDER_RETURN:    'orderReturn',          // rozkaz powrotu misji do bazy (scout servicing loop — recon full_system)
  REFUEL:          'refuel',               // natychmiastowe tankowanie zadokowanego statku (manualRefuel)
  RELEASE_DROID:   'releaseDroid',         // Pop 2.0 Faza 4 — zwolnij zainstalowanego droida (→ magazyn), etat wraca do POP
  DISBAND:         'disband',              // rozbiórka statku (zwrot 75% + załoga) — engine-upgrade scout replacement
  WAIT:          'wait',
};

/** Aktywna kolonia gracza → jej BuildingSystem (per-kolonia). */
function _activeBuildingSystem() {
  const K = window.KOSMOS;
  const cm = K?.colonyManager;
  const active = cm?._activePlanetId ?? K?.homePlanet?.id;
  return active ? (cm?.getColony(active)?.buildingSystem ?? null) : null;
}

/** Aktywna kolonia gracza → jej FactorySystem (per-kolonia). */
function _activeFactorySystem() {
  const K = window.KOSMOS;
  const cm = K?.colonyManager;
  const active = cm?._activePlanetId ?? K?.homePlanet?.id;
  return active ? (cm?.getColony(active)?.factorySystem ?? K?.factorySystem ?? null) : null;
}

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

    case ACTION_TYPES.EXPEDITION: {
      if (!action.missionType || !action.targetId) return { emitted: false, reason: 'missing_expedition_args' };
      // ⚠ Alias 'colonize'→'colony': handler expedition:sendRequest woła _launch(type) BEZPOŚREDNIO,
      // a _launch zakłada kolonizację TYLKO dla type==='colony' (mapowanie 'colonize'→'colony' żyje
      // wyłącznie w createMission, którego ta ścieżka NIE używa). Bez tego 'colonize' spada do
      // generycznej misji (missionReport, kolonia NIE powstaje). Mirror createMission:131.
      const missionType = action.missionType === 'colonize' ? 'colony' : action.missionType;
      EventBus.emit('expedition:sendRequest', {
        type: missionType,
        targetId: action.targetId,
        vesselId: action.vesselId ?? null,
        cargo: action.cargo ?? null,
      });
      return { emitted: true, event: 'expedition:sendRequest', type: missionType };
    }

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

    case ACTION_TYPES.SET_DROID_ORDER: {
      // REALNA ścieżka gracza (EconomyOverlay:2641): fs.setDroidOrder(commodityId, qty) — DIRECT
      // na fabryce kolonii. Droid = _droidOrders (poza reactive/queue) → działa w KAŻDYM trybie
      // (factory:enqueue→enqueue no-opuje w reactive, dlatego direct). Zwraca bool.
      if (!action.commodityId) return { emitted: false, reason: 'missing_commodity' };
      const fs = _activeFactorySystem();
      if (!fs?.setDroidOrder) return { emitted: false, reason: 'no_factory_system' };
      const ok = fs.setDroidOrder(action.commodityId, action.qty ?? 1);
      return { emitted: true, event: 'factory:setDroidOrder', ok };
    }

    case ACTION_TYPES.SET_ONESHOT: {
      // REALNA ścieżka gracza (EconomyOverlay:900): fs.setOneShotJob(commodityId, qty) — burst
      // produkcji jednego towaru, NAJWYŻSZY priorytet FP, działa w reactive. Bufor commodities placówki.
      if (!action.commodityId) return { emitted: false, reason: 'missing_commodity' };
      const fs = _activeFactorySystem();
      if (!fs?.setOneShotJob) return { emitted: false, reason: 'no_factory_system' };
      const ok = fs.setOneShotJob(action.commodityId, action.qty ?? 1);
      return { emitted: true, event: 'factory:setOneShot', ok };
    }

    case ACTION_TYPES.LOAD_CARGO: {
      // REALNA ścieżka „Załaduj towar" = Vessel.loadCargo (goods bundle POP-kolonizacji). Bierze
      // towar z magazynu kolonii-doku statku. Zwraca faktycznie załadowaną ilość.
      if (!action.vesselId || !action.commodityId) return { emitted: false, reason: 'missing_cargo_args' };
      const K = window.KOSMOS;
      const vessel = K?.vesselManager?.getVessel?.(action.vesselId);
      if (!vessel) return { emitted: false, reason: 'vessel_not_found' };
      const originId = vessel.position?.dockedAt ?? vessel.colonyId;
      const originCol = K?.colonyManager?.getColony?.(originId);
      const rs = originCol?.resourceSystem;
      if (!rs) return { emitted: false, reason: 'no_source_colony' };
      const loaded = loadCargo(vessel, action.commodityId, action.qty ?? 1, rs);
      return { emitted: true, event: 'vessel:loadCargo', loaded };
    }

    case ACTION_TYPES.TRANSPORT: {
      // REALNA ścieżka transportu towarów = expedition:transportRequest → _launchTransport (osobne
      // zdarzenie; _launch NIE obsługuje 'transport' → spadłoby do mining). Source = dok statku.
      if (!action.targetId || !action.vesselId) return { emitted: false, reason: 'missing_transport_args' };
      EventBus.emit('expedition:transportRequest', {
        targetId: action.targetId,
        cargo: action.cargo ?? null,
        vesselId: action.vesselId,
        sourceColonyId: action.sourceColonyId ?? null,
      });
      return { emitted: true, event: 'expedition:transportRequest' };
    }

    case ACTION_TYPES.FOUND_OUTPOST: {
      // REALNA ścieżka gracza „Załóż placówkę" = expedition:foundOutpostRequest → _launchFoundOutpost
      // (cargo ship + buildingId autonomiczny; koszt budynku płacony z home przy starcie). Osobne
      // zdarzenie (NIE expedition:sendRequest — tamto woła _launch, które nie obsługuje found_outpost).
      if (!action.targetId || !action.buildingId) return { emitted: false, reason: 'missing_outpost_args' };
      EventBus.emit('expedition:foundOutpostRequest', {
        targetId: action.targetId,
        buildingId: action.buildingId,
        vesselId: action.vesselId ?? null,
      });
      return { emitted: true, event: 'expedition:foundOutpostRequest' };
    }

    case ACTION_TYPES.INSTALL_DROID: {
      // REALNA ścieżka gracza = BuildingSystem.installSyntheticForStrata (ColonyOverlay droidInstall
      // stepper woła DOKŁADNIE to — intent-method, NIE EventBus). Auto-pick budynku danej straty,
      // spend 1 automation_droid z inventory. Droid = substytut pracy (Pop 2.0 Faza 4).
      if (!action.strataType) return { emitted: false, reason: 'missing_strata_type' };
      const bSys = _activeBuildingSystem();
      if (!bSys?.installSyntheticForStrata) return { emitted: false, reason: 'no_building_system' };
      const res = bSys.installSyntheticForStrata(action.strataType);
      return { emitted: true, event: 'building:installDroid', strataType: action.strataType, success: !!res?.success, reason: res?.reason };
    }

    case ACTION_TYPES.ORDER_RETURN: {
      // REALNA ścieżka gracza „Powrót do bazy" = EventBus 'expedition:orderReturn' → MissionSystem._orderReturn
      // (FleetManagerOverlay przycisk powrotu woła DOKŁADNIE ten event). Scout servicing loop: sprowadza
      // zaparkowanego (fuel-stop) skauta full_system do domu → dok → auto/manual refuel → re-dispatch.
      if (!action.expeditionId) return { emitted: false, reason: 'missing_expedition' };
      EventBus.emit('expedition:orderReturn', { expeditionId: action.expeditionId });
      return { emitted: true, event: 'expedition:orderReturn' };
    }

    case ACTION_TYPES.REFUEL: {
      // REALNA ścieżka gracza „Tankuj" = VesselManager.manualRefuel (przycisk Refuel w panelu statku —
      // intent-method, NIE EventBus). Natychmiastowe pełne tankowanie zadokowanego statku z magazynu
      // kolonii/depotu. Bez tego re-dispatch skauta odpalałby z niepełnym bakiem → natychmiastowy fuel-stop.
      if (!action.vesselId) return { emitted: false, reason: 'missing_vessel' };
      const vMgr = window.KOSMOS?.vesselManager;
      if (!vMgr?.manualRefuel) return { emitted: false, reason: 'no_vessel_manager' };
      const ok = vMgr.manualRefuel(action.vesselId);
      return { emitted: true, event: 'vessel:manualRefuel', ok };
    }

    case ACTION_TYPES.RELEASE_DROID: {
      // REALNA ścieżka gracza = BuildingSystem.removeSyntheticForStrata (ColonyOverlay droidRelease
      // stepper woła DOKŁADNIE to — intent-method, NIE EventBus). Auto-pick budynku danej straty z
      // NAJWIĘCEJ droidami, zdejmuje 1 droida, zwraca go do magazynu (+1 automation_droid) przy
      // FEATURES.popAllocation2=true; etat wraca do POP. Two-way juggle: install (praca) ↔ release (misja).
      if (!action.strataType) return { emitted: false, reason: 'missing_strata_type' };
      const bSys = _activeBuildingSystem();
      if (!bSys?.removeSyntheticForStrata) return { emitted: false, reason: 'no_building_system' };
      const res = bSys.removeSyntheticForStrata(action.strataType);
      return { emitted: true, event: 'building:releaseDroid', strataType: action.strataType,
               success: !!res?.success, returned: !!res?.returned, reason: res?.reason };
    }

    case ACTION_TYPES.DISBAND: {
      // REALNA ścieżka gracza „Rozbierz statek" = EventBus 'fleet:disbandRequest' → ColonyManager._disbandVessel
      // (FleetManagerOverlay przycisk disband woła ten event). Wymaga statku ZADOKOWANEGO + stoczni;
      // zwraca 75% surowców/modułów + 100% cargo, odblokowuje załogę. Engine-upgrade: retire stary
      // (chemical) skaut po zbudowaniu nowego (ion/fusion) — „replace", nie akumuluj skautów.
      if (!action.vesselId) return { emitted: false, reason: 'missing_vessel' };
      EventBus.emit('fleet:disbandRequest', { vesselId: action.vesselId });
      return { emitted: true, event: 'fleet:disbandRequest' };
    }

    case ACTION_TYPES.WAIT:
      return { emitted: true, event: null, noop: true };

    default:
      return { emitted: false, reason: `unknown_action_type: ${action.type}` };
  }
}

export default { execute, ACTION_TYPES };
