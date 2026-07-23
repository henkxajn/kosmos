// Główna scena gry — zarządza symulacją układu słonecznego
// Przepisana: bez Phasera, czyste JS + Three.js renderer
//
// Inicjalizuje wszystkie systemy, ThreeRenderer, UIManager.
// Komunikacja wyłącznie przez EventBus.

import EventBus              from '../core/EventBus.js';
import { normalize as normalizeBattleLocation, isDeepSpace as isDeepSpaceBattle } from '../utils/BattleLocation.js';
import { mouseToNDC, castRay, resolveTargetFromHits } from '../utils/RaycasterHelper.js';
import { worldToGameplay } from '../utils/CoordTransform.js';
import { tacticalToWorld } from '../utils/TacticalRaycaster.js';
import { showPOIModalCreate, showPOIModalEdit, showPOIModalCreateFromPicker } from '../ui/POIModal.js';
import { pickerResultToPOISpec } from '../utils/POIPanelLogic.js';
import { resolveHomeColony } from '../utils/TransferStore.js';
import EntityManager         from '../core/EntityManager.js';
import gameState             from '../core/GameState.js';
import debugLog              from '../core/DebugLog.js';
import { PhysicsSystem }     from '../systems/PhysicsSystem.js';
import { TimeSystem }        from '../systems/TimeSystem.js';
import { AccretionSystem }   from '../systems/AccretionSystem.js';
import { StabilitySystem }   from '../systems/StabilitySystem.js';
import { PlayerActionSystem } from '../systems/PlayerActionSystem.js';
import { LifeSystem }        from '../systems/LifeSystem.js';
import { GravitySystem }     from '../systems/GravitySystem.js';
import { AudioSystem }       from '../systems/AudioSystem.js';
import { SaveSystem }        from '../systems/SaveSystem.js';
import { buildSaveFileName, downloadSave } from '../utils/SaveFile.js';
import { CURRENT_VERSION }   from '../systems/SaveMigration.js';
import { ResourceSystem }    from '../systems/ResourceSystem.js';
import { CivilizationSystem } from '../systems/CivilizationSystem.js';
import { BuildingSystem }    from '../systems/BuildingSystem.js';
import { TechSystem }        from '../systems/TechSystem.js';
import { MissionSystem }    from '../systems/MissionSystem.js';
import { ColonyManager }      from '../systems/ColonyManager.js';
import { VesselManager }      from '../systems/VesselManager.js';
import { WarpRouteSystem }    from '../systems/WarpRouteSystem.js';
import { OrderService }       from '../systems/OrderService.js';
import { RandomEventSystem }  from '../systems/RandomEventSystem.js';
import { FactorySystem }      from '../systems/FactorySystem.js';
import { DepositSystem }         from '../systems/DepositSystem.js';
import { ImpactDamageSystem }    from '../systems/ImpactDamageSystem.js';
import { CivilianTradeSystem }  from '../systems/CivilianTradeSystem.js';
import { TradeOrderBoard }      from '../systems/TradeOrderBoard.js';
import { ProductionRequestBoard } from '../systems/ProductionRequestBoard.js';
import TradeLog                 from '../systems/TradeLog.js';
import { EconomyHistoryLog }    from '../systems/EconomyHistoryLog.js';
import { ResearchSystem }      from '../systems/ResearchSystem.js';
import { DiscoverySystem }     from '../systems/DiscoverySystem.js';
import { ObservatorySystem }  from '../systems/ObservatorySystem.js';
import { CollisionForecast } from '../systems/CollisionForecast.js';
import { DiskPhaseSystem }   from '../systems/DiskPhaseSystem.js';
import { GroundUnitManager } from '../systems/GroundUnitManager.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { ArmySystem } from '../systems/ArmySystem.js';
import { SupplyCoverageSystem } from '../systems/SupplyCoverageSystem.js';
import { AnomalyEffectSystem } from '../systems/AnomalyEffectSystem.js';
import { LeaderSystem }        from '../systems/LeaderSystem.js';
import { FactionSystem }       from '../systems/FactionSystem.js';
import { DysonSystem }          from '../systems/DysonSystem.js';
import { AutoPauseSystem }      from '../systems/AutoPauseSystem.js';
import { ScheduledEventSystem } from '../systems/ScheduledEventSystem.js';
import { EventLogSystem }       from '../systems/EventLogSystem.js';
import { NotificationCenter }   from '../systems/NotificationCenter.js';
import { buildScheduledEventPopup } from '../ui/ScheduledEventPopup.js';
import { LEADERS }              from '../data/LeaderData.js';
import { NARRATIVE_EVENTS_BY_ID } from '../data/NarrativeEventsData.js';
import { EndgameScene }         from './EndgameScene.js';
import { ANOMALIES } from '../data/AnomalyData.js';
import { showIntroSequence }     from '../ui/IntroModal.js';
import { initMissionEvents, queueMissionEvent } from '../ui/MissionEventModal.js';
import { initConsulElection } from '../ui/ConsulElectionModal.js';
import { initAutoPauseToast } from '../ui/AutoPauseToast.js';
import { ActionRecorder }     from '../testing/recorder/ActionRecorder.js';
import { spawnTestEnemy, spawnEnemyFleet, spawnEnemyCiv, spawnEnemyAttack, spawnEnemyWarpGhost } from '../debug/SpawnTestEnemy.js';
import { loadCombatSandbox, sandboxInfo, sandboxResetPositions, sandboxSpawnMoreEnemies } from '../scenarios/CombatSandbox.js';
import { formatStatLine, formatStatLineWithCursor, formatSectionTitle } from '../ui/TerminalPopupBase.js';
import { SystemGenerator }   from '../generators/SystemGenerator.js';
import { GalaxyGenerator }   from '../generators/GalaxyGenerator.js';
import { EmpireGenerator }   from '../generators/EmpireGenerator.js';
import { EmpireRegistry }    from '../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../systems/EmpireColonyBootstrap.js';
import { IntelSystem }       from '../systems/IntelSystem.js';
import { POIRegistry }       from '../systems/POIRegistry.js';
import { POIRuntimeSystem }  from '../systems/POIRuntimeSystem.js';
import { DiplomacySystem }   from '../systems/DiplomacySystem.js';
import { AlienCivSystem }    from '../systems/AlienCivSystem.js';
import { EmpireColonyMaintenance } from '../systems/EmpireColonyMaintenance.js';  // TODO Faza 2: usuń razem z ColonyAutoPlanner
import { ColonyAutoExpander } from '../systems/ColonyAutoExpander.js';
import { EmpireStrategySystem } from '../systems/EmpireStrategySystem.js';
import { EmpireLogisticsSystem } from '../systems/EmpireLogisticsSystem.js';
import { EmpireResearchSystem } from '../systems/EmpireResearchSystem.js';
import { WarSystem }         from '../systems/WarSystem.js';
import { InvasionSystem }    from '../systems/InvasionSystem.js';
import { EnemyAttackHandler } from '../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem } from '../systems/OrbitalSpaceSystem.js';
import { StationSystem }      from '../systems/StationSystem.js';
import { TerritoryService }   from '../systems/TerritoryService.js';
import { TerritoryField }     from '../systems/TerritoryField.js';
import { MovementOrderSystem } from '../systems/MovementOrderSystem.js';
import { EmpireFleetMaterializer } from '../systems/EmpireFleetMaterializer.js';
import { ProximitySystem } from '../systems/ProximitySystem.js';
import { VesselCombatSystem } from '../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../systems/DeepSpaceCombatSystem.js';
import { AutoRetreatSystem } from '../systems/AutoRetreatSystem.js';
import { FleetSystem }         from '../systems/FleetSystem.js';
import { HULLS } from '../data/HullsData.js';
import { SHIPS } from '../data/ShipsData.js';
import { MilitaryAI }        from '../systems/ai/MilitaryAI.js';
import { EconAI }            from '../systems/ai/EconAI.js';
import { THEME }             from '../config/ThemeConfig.js';
import { BattleView3D }      from './BattleView3D.js';
import { showBattleIntro, showBattleOutcome, getBattleViewPreference } from '../ui/BattleIntroModal.js';
import { StarSystemManager } from '../systems/StarSystemManager.js';
import { Star }              from '../entities/Star.js';
import { Planet }            from '../entities/Planet.js';
import { Moon }              from '../entities/Moon.js';
import { Planetoid }         from '../entities/Planetoid.js';
import { isEnemyVessel }     from '../entities/Vessel.js';
import { ThreeRenderer }     from '../renderer/ThreeRenderer.js';
import { ThreeCameraController } from '../renderer/ThreeCameraController.js';
import { UIManager }         from './UIManager.js';
import { RightClickMenu }    from '../ui/RightClickMenu.js';
import { ToastSystem }       from '../ui/ToastSystem.js';
import { Tooltip }           from '../ui/Tooltip.js';
import { getTooltipContent } from '../utils/TooltipContent.js';
import { PlanetScene }       from './PlanetScene.js';
import { GAME_CONFIG }       from '../config/GameConfig.js';
import { BUILDINGS }         from '../data/BuildingsData.js';     // POWER TEST
import { TECHS }             from '../data/TechData.js';          // POWER TEST
import { TERRAIN_TYPES }     from '../map/HexTile.js';            // POWER TEST
import { ELEMENTS }          from '../data/ElementsData.js';      // POWER TEST
import { COMMODITIES }       from '../data/CommoditiesData.js';   // POWER TEST
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js'; // grid do auto-build
import { t, getLocale } from '../i18n/i18n.js';

export class GameScene {
  // canvas3D — element #three-canvas
  // uiCanvas  — element #ui-canvas
  // eventLayer — element #event-layer (zbiera mysz)
  start(canvas3D, uiCanvas, eventLayer) {
    EntityManager.clear();
    EventBus.clear();

    // Środek ekranu (gwiazda zawsze tu)
    const cx = GAME_CONFIG.WIDTH  / 2;
    const cy = GAME_CONFIG.HEIGHT / 2;

    // ── Systemy gry ────────────────────────────────────────────
    this.timeSystem    = new TimeSystem();
    this.physicsSystem = new PhysicsSystem();

    // Generowanie / przywrócenie układu
    window._updateLoading?.(10, 'Generowanie układu...');
    const savedData = window.KOSMOS?.savedData || null;
    const { star, planets, moons = [], planetesimals, asteroids = [], comets = [], planetoids = [] } =
      savedData
        ? this._restoreSystem(savedData, cx, cy)
        : this._generateFreshSystem(cx, cy);

    this.star = star;

    // ── StarSystemManager — rejestr układów gwiezdnych ───────
    window._updateLoading?.(25, 'Inicjalizacja systemów...');
    this.starSystemManager = new StarSystemManager();
    this.starSystemManager.registerHomeSystem(star, planets, moons, planetoids);
    window.KOSMOS.starSystemManager = this.starSystemManager;
    window.KOSMOS.activeSystemId    = 'sys_home';

    // ── Three.js renderer ──────────────────────────────────────
    window._updateLoading?.(40, 'Renderer 3D...');
    this.threeRenderer = new ThreeRenderer(canvas3D);

    // Inicjalizuj pozycje planet zanim renderer wyrenderuje pierwszą klatkę
    this.physicsSystem.update(0.001);

    window._updateLoading?.(55, 'Ładowanie tekstur...');
    this.threeRenderer.initSystem(star, planets, planetesimals, moons);

    // ── Kontroler kamery ───────────────────────────────────────
    // ThreeCameraController nasłuchuje na window (nie potrzebuje eventLayer)
    this.cameraController = new ThreeCameraController(
      this.threeRenderer.getCamera()
    );
    // Podpięcie kontrolera do renderera (update() wywoływany w render loop)
    this.threeRenderer.setCameraController(this.cameraController);

    // ── UI ─────────────────────────────────────────────────────
    this.uiManager = new UIManager(uiCanvas);
    this.uiManager.addInfo(t('dialog.systemFormed'));

    // M3 P1.1: RightClickMenu — DOM popup, self-managed (nie OverlayManager).
    // window.KOSMOS exposure dla devtools + przyszłych P1.x integration.
    this.rightClickMenu = new RightClickMenu();
    // P2.5 polish — toast system konsumuje EventBus 'ui:toast'. Niezbędne dla
    // feedback'u Fleet Engage pick mode i ogólnych powiadomień UX.
    this.toastSystem    = new ToastSystem();
    window.KOSMOS.uiManager      = this.uiManager;
    window.KOSMOS.rightClickMenu = this.rightClickMenu;
    window.KOSMOS.toastSystem    = this.toastSystem;

    // M3 P1.5: Universal Tooltip — single global instance, dual sources
    // (canvas hover via mousemove handler + DOM hover via data-tooltip listener).
    // Hover state shared (flag #4 — last hover wins, no double tooltip).
    this.tooltip = new Tooltip();
    this._tooltipHoverState = { key: null };  // last canvas hover discriminator
    window.KOSMOS.tooltip = this.tooltip;

    // Blokada kamery gdy kursor nad elementem UI
    this.cameraController._isOverUI = (x, y) => this.uiManager.isOverUI(x, y);

    // ── Pozostałe systemy ──────────────────────────────────────
    const isGenerator = window.KOSMOS?.scenario === 'generator';

    // Systemy fizyki symulacyjnej — aktywne tylko w trybie Generator
    if (isGenerator) {
      this.accretionSystem    = new AccretionSystem({ planetesimals, star });
      this.stabilitySystem    = new StabilitySystem(star);
      this.playerActionSystem = new PlayerActionSystem(star);
      this.gravitySystem      = new GravitySystem(star);
    }

    this.lifeSystem        = new LifeSystem(star);
    this.audioSystem       = window.KOSMOS.audioSystem || new AudioSystem();
    this.diskPhaseSystem   = new DiskPhaseSystem(this.timeSystem);
    this.saveSystem        = new SaveSystem(star, this.timeSystem);

    // Przywróć czas gry z save
    if (savedData?.gameTime) {
      this.timeSystem.gameTime = savedData.gameTime;
    }
    // M4 P2 — przywróć uiPrefs (sensor overlay, minimap)
    if (savedData?.uiPrefs && window.KOSMOS) {
      window.KOSMOS.uiPrefs = { ...(window.KOSMOS.uiPrefs ?? {}), ...savedData.uiPrefs };
    }

    // ── Systemy 4X ─────────────────────────────────────────────
    this.resourceSystem  = new ResourceSystem();
    this.techSystem      = new TechSystem(this.resourceSystem);
    this.civSystem       = new CivilizationSystem({}, this.techSystem);
    this.civSystem.resourceSystem = this.resourceSystem;
    this.buildingSystem  = new BuildingSystem(this.resourceSystem, this.civSystem, this.techSystem);
    this.civSystem.buildingSystem = this.buildingSystem;
    this.factorySystem   = new FactorySystem(this.resourceSystem);
    this.buildingSystem.setFactorySystem(this.factorySystem);
    this.expeditionSystem = new MissionSystem(this.resourceSystem);
    this.missionSystem    = this.expeditionSystem; // alias — ten sam obiekt
    this.colonyManager   = new ColonyManager(this.techSystem);
    this.vesselManager   = new VesselManager();
    // Warp multi-hop — egzekutor sekwencji skoków (subskrybuje interstellar:arrived).
    this.warpRouteSystem = new WarpRouteSystem(this.vesselManager);
    // Zunifikowana fasada rozkazów (rejestr/Stratcom/PPM) + auto-chain cross-system transport.
    this.orderService    = new OrderService();
    // Player Fleet Groups (save v73) — zawsze instancjowany dla save consistency;
    // FEATURES.playerFleets gates UI ekspozycję, nie istnienie obiektu.
    this.fleetSystem     = new FleetSystem(this.vesselManager);
    this.civilianTradeSystem = new CivilianTradeSystem(this.colonyManager);
    this.tradeOrderBoard   = new TradeOrderBoard(this.colonyManager);
    this.productionRequestBoard = new ProductionRequestBoard();
    this.tradeLog          = new TradeLog();
    this.economyHistoryLog = new EconomyHistoryLog();
    this.randomEventSystem = new RandomEventSystem();
    this.impactDamageSystem = new ImpactDamageSystem(this.colonyManager);
    this.researchSystem    = new ResearchSystem(this.techSystem);
    this.discoverySystem   = new DiscoverySystem();
    this.observatorySystem = new ObservatorySystem();
    this.collisionForecast = new CollisionForecast();
    this.groundUnitManager = new GroundUnitManager();
    this.combatSystem         = new CombatSystem();
    this.armySystem           = new ArmySystem();
    this.supplyCoverageSystem = new SupplyCoverageSystem(this.colonyManager, this.groundUnitManager);
    this.anomalyEffectSystem = new AnomalyEffectSystem();
    this.leaderSystem        = new LeaderSystem();
    this.factionSystem       = new FactionSystem();
    this.dysonSystem         = new DysonSystem();
    this.autoPauseSystem     = new AutoPauseSystem();
    this.scheduledEventSystem = new ScheduledEventSystem();
    this.eventLogSystem       = new EventLogSystem();
    this.notificationCenter   = new NotificationCenter();
    this.empireRegistry       = new EmpireRegistry();
    this.intelSystem          = new IntelSystem();
    this.poiRegistry          = new POIRegistry();
    // M3 P3.1 — POI Runtime System (picket detection + rally member assembly)
    this.poiRuntimeSystem     = new POIRuntimeSystem({
      poiRegistry:   this.poiRegistry,
      vesselManager: this.vesselManager,
    });
    this.diplomacySystem      = new DiplomacySystem();
    this.alienCivSystem       = new AlienCivSystem();
    // TODO Faza 2: usuń razem z ColonyAutoPlanner (przejmie _reapplyAllRates co tactical tick)
    this.empireColonyMaintenance = new EmpireColonyMaintenance();
    // Warstwa B AI — auto-rozbudowa kolonii AI (współistnieje z Maintenance, patrz konstruktor)
    this.colonyAutoExpander   = new ColonyAutoExpander();
    // Warstwa C AI — strategiczne decyzje kolonizacji (outpost Xe / pełna kolonia)
    this.empireStrategySystem = new EmpireStrategySystem();
    // Warstwa 2 transportu AI — kurierzy logistyczni outpost↔stolica (Slice 2 S3)
    this.empireLogisticsSystem = new EmpireLogisticsSystem();
    // Model badań AI — per-archetyp kolejka techów badana w czasie (S3.2 S2)
    this.empireResearchSystem = new EmpireResearchSystem();
    this.warSystem            = new WarSystem();
    this.invasionSystem       = new InvasionSystem();
    this.orbitalSpaceSystem   = new OrbitalSpaceSystem();
    this.stationSystem        = new StationSystem();
    this.enemyAttackHandler   = new EnemyAttackHandler();
    // Strefy wpływów — indeks własności układów (czyta colonyManager/stationSystem/
    // empireRegistry/gameState przez window.KOSMOS; event-invalidowany).
    this.territoryService     = new TerritoryService();
    // Strefy wpływów — pole wpływu + kontury (marching squares); czyta
    // territoryService/galaxyData/timeSystem przez window.KOSMOS.
    this.territoryField       = new TerritoryField();

    window.KOSMOS.civMode          = false;
    window.KOSMOS.homePlanet       = null;
    // M3 P4 — devtools/runtime exposures (resolves long-standing deferred chore
    // from P1.3.5 known-issues + RaycasterPure planet lookup needing entityManager).
    window.KOSMOS.gameScene        = this;
    window.KOSMOS.gameConfig       = GAME_CONFIG;
    window.KOSMOS.entityManager    = EntityManager;
    window.KOSMOS.saveCurrentVersion = CURRENT_VERSION;
    window.KOSMOS.buildingSystem   = this.buildingSystem;
    window.KOSMOS.resourceSystem   = this.resourceSystem;
    window.KOSMOS.civSystem        = this.civSystem;
    window.KOSMOS.techSystem       = this.techSystem;
    window.KOSMOS.factorySystem    = this.factorySystem;
    window.KOSMOS.prosperitySystem = null;  // tworzony per-kolonia w ColonyManager
    window.KOSMOS.expeditionSystem = this.expeditionSystem;
    window.KOSMOS.missionSystem    = this.missionSystem;
    window.KOSMOS.colonyManager    = this.colonyManager;
    window.KOSMOS.vesselManager    = this.vesselManager;
    window.KOSMOS.warpRouteSystem  = this.warpRouteSystem;
    window.KOSMOS.orderService     = this.orderService;
    window.KOSMOS.fleetSystem      = this.fleetSystem;
    window.KOSMOS.overlayManager   = this.uiManager.overlayManager;
    window.KOSMOS.civilianTradeSystem = this.civilianTradeSystem;
    window.KOSMOS.tradeOrderBoard  = this.tradeOrderBoard;
    window.KOSMOS.productionRequestBoard = this.productionRequestBoard;
    window.KOSMOS.tradeLog         = this.tradeLog;
    window.KOSMOS.economyHistoryLog = this.economyHistoryLog;
    window.KOSMOS.timeSystem       = this.timeSystem;
    window.KOSMOS.randomEventSystem = this.randomEventSystem;
    window.KOSMOS.researchSystem   = this.researchSystem;
    window.KOSMOS.discoverySystem  = this.discoverySystem;
    window.KOSMOS.observatorySystem = this.observatorySystem;
    window.KOSMOS.collisionForecast = this.collisionForecast;
    window.KOSMOS.groundUnitManager  = this.groundUnitManager;
    window.KOSMOS.combatSystem       = this.combatSystem;
    window.KOSMOS.armySystem         = this.armySystem;
    window.KOSMOS.supplyCoverageSystem = this.supplyCoverageSystem;
    window.KOSMOS.anomalyEffectSystem = this.anomalyEffectSystem;
    window.KOSMOS.leaderSystem     = this.leaderSystem;
    window.KOSMOS.factionSystem    = this.factionSystem;
    window.KOSMOS.dysonSystem      = this.dysonSystem;
    window.KOSMOS.autoPauseSystem  = this.autoPauseSystem;
    window.KOSMOS.scheduledEventSystem = this.scheduledEventSystem;
    window.KOSMOS.eventLogSystem       = this.eventLogSystem;
    window.KOSMOS.notificationCenter   = this.notificationCenter;
    window.KOSMOS.empireRegistry   = this.empireRegistry;
    window.KOSMOS.empireColonyBootstrap = EmpireColonyBootstrap;  // klasa statyczna (Slice 2 devtools)
    window.KOSMOS.intelSystem      = this.intelSystem;
    window.KOSMOS.poiRegistry      = this.poiRegistry;
    window.KOSMOS.poiRuntimeSystem = this.poiRuntimeSystem;
    window.KOSMOS.diplomacySystem  = this.diplomacySystem;
    window.KOSMOS.alienCivSystem   = this.alienCivSystem;
    window.KOSMOS.colonyAutoExpander = this.colonyAutoExpander;
    window.KOSMOS.empireStrategySystem = this.empireStrategySystem;
    window.KOSMOS.empireLogisticsSystem = this.empireLogisticsSystem;
    window.KOSMOS.empireResearchSystem = this.empireResearchSystem;
    window.KOSMOS.warSystem        = this.warSystem;
    window.KOSMOS.invasionSystem   = this.invasionSystem;
    window.KOSMOS.orbitalSpaceSystem = this.orbitalSpaceSystem;
    window.KOSMOS.stationSystem      = this.stationSystem;
    window.KOSMOS.territoryService   = this.territoryService;
    window.KOSMOS.territoryField     = this.territoryField;
    window.KOSMOS.enemyAttackHandler = this.enemyAttackHandler;
    // M1 Targeting — lazy init, feature flag. Tworzone gdy
    //   GAME_CONFIG.FEATURES.movementOrders=true lub via debug.enableMovementOrders().
    this.movementOrderSystem      = null;
    window.KOSMOS.movementOrderSystem = null;
    if (GAME_CONFIG.FEATURES?.movementOrders) this._ensureMovementOrderSystem();
    // M1 Fleet Materialization — lazy init, feature flag.
    this.empireFleetMaterializer = null;
    window.KOSMOS.empireFleetMaterializer = null;
    if (GAME_CONFIG.FEATURES?.fleetMaterialization) this._ensureEmpireFleetMaterializer();
    // M2a ProximitySystem — lazy init, feature flag. Per-tick detection zbliżeń
    //   vessel↔vessel. Hook w VesselManager._tick (PRZED MOS). Commit 2 — scaffold.
    this.proximitySystem          = null;
    window.KOSMOS.proximitySystem = null;
    if (GAME_CONFIG.FEATURES?.proximitySystem) this._ensureProximitySystem();
    // M2a VesselCombatSystem — event-driven combat na vessel:proximityEnter.
    //   Wymaga proximitySystem (implicit dependency — flag vesselCombat sam
    //   nie gwarantuje detection; sandbox włącza oba). Commit 4.
    this.vesselCombatSystem          = null;
    window.KOSMOS.vesselCombatSystem = null;
    if (GAME_CONFIG.FEATURES?.vesselCombat) this._ensureVesselCombatSystem();
    // M4 P3 DeepSpaceCombatSystem — per-tick deep-space combat (zastępuje
    //   instant resolve VCS gdy FEATURES.m4DeepSpaceCombat ON). VCS deleguje
    //   vessel:combatRangeEnter do DSCS przez flag. Domyślnie OFF do P3-3 close
    //   (skeleton bez fire exchange — flag flip dopiero gdy combat działa).
    this.deepSpaceCombatSystem          = null;
    window.KOSMOS.deepSpaceCombatSystem = null;
    if (GAME_CONFIG.FEATURES?.m4DeepSpaceCombat) this._ensureDeepSpaceCombatSystem();
    // M2a AutoRetreatSystem — event-driven retreat na battle:resolved. Nie ma
    //   osobnej flagi — pokryty przez vesselCombat (bez combat nie ma retreat).
    //   Commit 7.
    this.autoRetreatSystem          = null;
    window.KOSMOS.autoRetreatSystem = null;
    if (GAME_CONFIG.FEATURES?.vesselCombat) this._ensureAutoRetreatSystem();
    // Faza 7: AI (statyczne klasy — ekspozycja dla debug z konsoli)
    window.KOSMOS.militaryAI       = MilitaryAI;
    window.KOSMOS.econAI           = EconAI;
    window.KOSMOS.threeRenderer    = this.threeRenderer;
    // M4 P1 post-playtest — EventBus exposed dla debug konsoli (off-spec M3 #9).
    window.KOSMOS.eventBus         = EventBus;

    // ── ActionRecorder — nagrywa akcje gracza (Ctrl+Shift+R toggle) ──
    // Pozwala zapisać otwarcie jako script dla ScriptedBot (teach the AI how to open).
    this.actionRecorder = new ActionRecorder();
    window.KOSMOS.recorder = this.actionRecorder;

    // ── Debug cheats (konsola) ────────────────────────────────────
    // KOSMOS.debug.spawnTestEnemy() — tworzy wrogie imperium + kolonię
    //   na najbliższym niezamieszkałym ciele do testów desantu/walki.
    // KOSMOS.debug.giveResearch(10000) — dodaje research do aktywnej kolonii
    //   (przydatne na starym save bez konieczności rozpoczynania nowego Power Test).
    window.KOSMOS.debug = {
      // S3.4 FAZA 6 — backup/restore save'a przed bumpem wersji (single-slot save utrudnia
      //   test migracji na żywo). exportSave() → pobiera plik + kopiuje do schowka + zwraca string;
      //   importSave(json) → nadpisuje slot (string LUB obiekt) i instruuje reload (migracja przy load).
      exportSave: () => {
        const raw = SaveSystem.exportSave();
        if (!raw) { console.warn('[save] brak zapisu w localStorage (kosmos_save_v1)'); return null; }
        let data = null;
        try { data = JSON.parse(raw); } catch {}
        // Ta sama nazwa i ten sam downloader co menu ☰ → „Zapisz do pliku" (utils/SaveFile.js).
        downloadSave(raw, buildSaveFileName(data));
        // Kopia do schowka (best-effort — może wymagać gestu użytkownika).
        try { navigator.clipboard?.writeText?.(raw); } catch {}
        console.log(`[save] wyeksportowano save v${data?.version ?? '?'} (${raw.length} B) — plik + schowek. Zwrócony string poniżej:`);
        return raw;
      },
      // Ratuje kopię przedimportową (Twoja gra sprzed wczytania pliku) na dysk.
      // To JEDYNA ścieżka odczytu tej kopii — gra nie umie jej przywrócić sama, a przy braku
      // miejsca save() ją poświęca. Jeśli storageReport() pokazuje duży 'backup_preimport'
      // i chcesz tamtą grę zachować — najpierw to, potem importSave(...) z pobranego pliku.
      exportBackup: () => {
        const raw = localStorage.getItem('kosmos_save_backup_preimport');
        if (!raw) { console.warn('[save] brak kopii przedimportowej'); return null; }
        let data = null;
        try { data = JSON.parse(raw); } catch {}
        const filename = buildSaveFileName(data).replace(/\.json$/, '_przed-importem.json');
        downloadSave(raw, filename);
        console.log(`[save] kopia przedimportowa → ${filename} (${(raw.length / 1e6).toFixed(2)} mln znaków, v${data?.version ?? '?'}, rok ${Math.round(data?.gameTime ?? 0)}). Wczytasz ją przez menu ☰ → „Wczytaj z pliku".`);
        return filename;
      },
      // Raport zużycia localStorage — quota to ~5,2 mln ZNAKÓW na wszystkie klucze razem
      // (10 MiB liczone w UTF-16). Pokazuje, co realnie zajmuje miejsce.
      storageReport: () => {
        const rows = [];
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          const chars = (localStorage.getItem(k) ?? '').length;
          total += chars + k.length;
          rows.push({ klucz: k, 'mln znaków': +(chars / 1e6).toFixed(3), 'MiB (UTF-16)': +(chars * 2 / 1048576).toFixed(2) });
        }
        rows.sort((a, b) => b['mln znaków'] - a['mln znaków']);
        console.table(rows);
        console.log(`[storage] razem: ${(total / 1e6).toFixed(2)} mln znaków = ${(total * 2 / 1048576).toFixed(2)} MiB / ~10 MiB (${(total / 5.24e6 * 100).toFixed(0)}%)`);
        return { totalChars: total, totalMiB: +(total * 2 / 1048576).toFixed(2), keys: rows.length };
      },
      // Wymusza awarię zapisu i pokazuje, co widzi gracz. Uczciwsze niż fillStorage:
      // samo zapchanie pamięci NIE wywoła awarii, bo Chromium sprawdza quotę tylko gdy
      // element ROŚNIE — a autosave nadpisuje slot podobnym rozmiarem i przechodzi.
      //   heal:true  → pierwszy zapis pada, drugi (po sprzątnięciu backupów) przechodzi
      //                = ścieżka self-healing: w konsoli „zwolniono N backup(ów)", bez alarmu.
      //   heal:false → każdy zapis pada = ścieżka alarmu: czerwony toast + wpis w Dzienniku.
      simulateQuotaFail: ({ heal = false } = {}) => {
        const real = localStorage.setItem.bind(localStorage);
        let throwsLeft = heal ? 1 : Infinity;
        localStorage.setItem = (k, v) => {
          if (k === 'kosmos_save_v1' && throwsLeft > 0) {
            throwsLeft--;
            const e = new Error('QuotaExceededError (symulacja)');
            e.name = 'QuotaExceededError';
            throw e;
          }
          return real(k, v);
        };
        try {
          EventBus.emit('game:save');
        } finally {
          localStorage.setItem = real;   // ZAWSZE przywróć — inaczej gra zostaje kaleka
        }
        console.log(`[storage] symulacja zakończona (heal=${heal}). Zapis działa znowu normalnie.`);
        return { heal };
      },
      // Zapycha localStorage śmieciem. UWAGA: sam w sobie NIE wywoła awarii zapisu (patrz
      // simulateQuotaFail) — służy do testowania ODRZUCENIA IMPORTU, gdzie plik bywa większy
      // od bieżącego slotu. fillStorage(0) sprząta balast.
      fillStorage: (targetMiB = 8) => {
        localStorage.removeItem('kosmos_debug_ballast');
        if (targetMiB <= 0) { console.log('[storage] balast usunięty'); return 0; }
        let used = 0;
        for (let i = 0; i < localStorage.length; i++) used += (localStorage.getItem(localStorage.key(i)) ?? '').length;
        const wantChars = Math.max(0, Math.floor(targetMiB * 1048576 / 2) - used);
        try {
          localStorage.setItem('kosmos_debug_ballast', 'x'.repeat(wantChars));
          console.log(
            `[storage] Twoje dane: ${(used / 1e6).toFixed(2)} mln znaków (~${(used * 2 / 1048576).toFixed(1)} MiB)\n` +
            `[storage] balast:     ${(wantChars / 1e6).toFixed(2)} mln znaków → użycie ~${targetMiB} MiB / ~10 MiB\n` +
            `[storage] UWAGA: to NIE wywoła awarii zapisu (nadpisanie slotu podobnym rozmiarem przechodzi\n` +
            `[storage]   nawet przy pełnej pamięci). Do testu alarmu użyj KOSMOS.debug.simulateQuotaFail().\n` +
            `[storage] Sprzątanie: KOSMOS.debug.fillStorage(0)`,
          );
        } catch (e) {
          console.warn('[storage] balast się nie zmieścił:', e?.message);
        }
        return wantChars;
      },
      importSave: (json) => {
        const res = SaveSystem.importSave(json);
        if (res.ok) {
          console.log(`[save] zaimportowano save v${res.version} → slot kosmos_save_v1. Przeładuj grę i wybierz „Kontynuuj" (migracja przy odczycie).`);
        } else {
          console.error(`[save] import nieudany: ${res.reason}. Podaj string JSON lub obiekt z polem version.`);
        }
        return res;
      },
      // S3.5b — raport bramki handlu cross-empire (diagnostyka live-gate).
      // Dla każdej kolonii AI: czy handlowalna i dlaczego nie + per-empire warp/treaty/toggle.
      crossEmpireTradeStatus: () => {
        const cm   = window.KOSMOS?.colonyManager;
        const dipl = window.KOSMOS?.diplomacySystem;
        const civ  = window.KOSMOS?.civilianTradeSystem;
        const gs   = window.KOSMOS?.galaxyData?.systems;
        const warp = window.KOSMOS?.techSystem?.isResearched?.('ion_drives') ?? false;
        console.log(`[cross-empire trade] gracz warp(ion_drives)=${warp}`);
        const perEmpire = {};
        for (const c of (cm?.getAllColonies?.() ?? [])) {
          if (!c.ownerEmpireId) continue;
          const emp = c.ownerEmpireId;
          const treaty    = dipl?.hasTradeAgreement?.(emp) ?? false;
          const toggle    = civ?.isCrossEmpireTradeEnabled?.(emp) ?? true;
          const sys       = gs?.find(s => s.id === c.systemId);
          const explored  = !!sys?.explored;
          const spaceport = civ?._hasSpaceport?.(c) ?? null;
          const isolation = !!c.tradeOverrides?.isolation;
          const blocked = [];
          if (isolation)            blocked.push('isolation');
          if (spaceport === false)  blocked.push('no_spaceport');
          if (!treaty && !explored) blocked.push('not_explored(brak traktatu)');
          if (!warp)                blocked.push('gracz_bez_warp');
          if (!treaty)              blocked.push('brak_traktatu');
          if (!toggle)              blocked.push('toggle_off');
          console.log(`  ${c.planetId} [${emp}]: ${blocked.length ? 'BLOCKED — ' + blocked.join(', ') : 'TRADEABLE'} ` +
            `(explored=${explored}, spaceport=${spaceport}, treaty=${treaty}, toggle=${toggle})`);
          perEmpire[emp] = { warp, treaty, toggle };
        }
        console.log('[cross-empire trade] per-empire bramka:', perEmpire);
        return perEmpire;
      },
      // S3.4 — KOSMOS.debug.simulateVesselArrival('emp_001', 'weapons'|'research')
      // wymusza vessel:arrived gracza w systemie imperium (kara trust). Trespassing
      // (opóźniony) walidowany w headless — fake vessel nie jest w VesselManager.
      simulateVesselArrival: (empireId, kind = 'weapons') => {
        const reg  = window.KOSMOS?.empireRegistry;
        const dipl = window.KOSMOS?.diplomacySystem;
        const emp  = reg?.get(empireId);
        if (!emp || !dipl) { console.warn('[debug] simulateVesselArrival: brak imperium/diplomacy'); return; }
        const before = dipl.getTrust(empireId);
        const modules = kind === 'research' ? ['science_lab'] : ['weapon_laser'];
        const fakeVessel = {
          id: `dbg_${Date.now()}`,
          ownerEmpireId: 'player',
          systemId: emp.homeSystemId,
          modules,
          position: { state: 'orbiting' },
        };
        dipl._onVesselArrived(fakeVessel, { targetId: null });
        console.log(`[debug] simulateVesselArrival(${empireId}, ${kind}): trust ${before} → ${dipl.getTrust(empireId)}`);
      },
      // S3.4 BUG6 — wymuś AI envoy (pomija cooldown/gate) do testu Test 5.
      triggerAIEnvoy: (empireId) => {
        const dipl = window.KOSMOS?.diplomacySystem;
        if (!dipl) { console.warn('[debug] triggerAIEnvoy: brak diplomacy'); return; }
        const before = dipl.getTrust(empireId);
        dipl.changeTrust(empireId, 3, 'ai_envoy');
        EventBus.emit('diplomacy:aiEnvoy', { empireId });
        console.log(`[debug] triggerAIEnvoy(${empireId}): trust ${before} → ${dipl.getTrust(empireId)}`);
      },
      spawnTestEnemy,
      spawnEnemyFleet,
      spawnEnemyCiv,
      spawnEnemyAttack,
      // KOSMOS.debug.spawnEnemyWarpGhost({ offsetLY?, name? }) — wrogi statek w tranzycie
      // warp (pełna instancja Vessel) do testu ghost „?" na radarze/galaktyce Stratcom.
      // Zastępuje kruchy ręczny `_vessels.set('ghost_test', {...})` (surowy obiekt → crashe).
      spawnEnemyWarpGhost,
      // KOSMOS.debug.dumpIntel() — wypisz intel quality dla każdego enemy
      // vessela i imperium. Sprawdza czy IntelSystem (M4 P2) dziala.
      dumpIntel: () => {
        const intel = window.KOSMOS?.intelSystem;
        const vm = window.KOSMOS?.vesselManager;
        const reg = window.KOSMOS?.empireRegistry;
        if (!intel) { console.warn('[debug] Brak IntelSystem'); return; }

        console.log('=== INTEL EMPIRE CONTACTS ===');
        if (reg) {
          for (const empire of reg.getAll?.() ?? []) {
            if (empire.id === 'player') continue;
            const quality = intel.getEmpireContact?.(empire.id) ?? '?';
            console.log(`  ${empire.id} (${empire.namePL ?? empire.name}): ${quality}`);
          }
        }

        console.log('=== INTEL VESSEL CONTACTS ===');
        if (vm) {
          let live = 0, wrecks = 0, noContact = 0;
          for (const v of vm.getAllVessels()) {
            const isEnemy = v.ownerEmpireId && v.ownerEmpireId !== 'player';
            if (!isEnemy) continue;
            const contact = intel.getVesselContact?.(v.id);
            const wreckTag = v.isWreck ? ' [WRAK]' : '';
            if (v.isWreck) wrecks++;
            else if (!contact) noContact++;
            else live++;
            if (!contact) {
              const reason = v.isWreck ? 'intel cleared on wreck' : 'never observed';
              console.log(`  ${v.id} (${v.name})${wreckTag}: NO CONTACT (${reason}), owner=${v.ownerEmpireId}`);
              continue;
            }
            const yearsAgo = contact.lastSeenYear != null
              ? (window.KOSMOS.timeSystem.gameTime - contact.lastSeenYear).toFixed(1)
              : '?';
            console.log(`  ${v.id} (${v.name})${wreckTag}: quality=${contact.quality}, lastSeen=${yearsAgo}y ago, posKnown=${contact.positionKnown}, owner=${v.ownerEmpireId}`);
          }
          console.log(`--- summary: ${live} live with contact, ${noContact} live no-contact, ${wrecks} wrecks (intel cleared) ---`);
        }
      },
      // KOSMOS.debug.dumpCombat() — wypisz active encounters + per-vessel HP.
      dumpCombat: () => {
        const dscs = window.KOSMOS?.deepSpaceCombatSystem;
        if (!dscs) { console.warn('[debug] Brak DeepSpaceCombatSystem'); return; }
        const list = dscs.listActive();
        if (list.length === 0) { console.log('[debug] Brak aktywnych encounters'); return; }
        for (const enc of list) {
          console.log(`=== ${enc.id} (round ${enc.currentRound}) ===`);
          console.log(`  sideA (${enc.sideA.label}): ${[...enc.sideA.vesselIds, ...enc.sideA.joinedVesselIds].join(', ')}`);
          console.log(`  sideB (${enc.sideB.label}): ${[...enc.sideB.vesselIds, ...enc.sideB.joinedVesselIds].join(', ')}`);
          console.log(`  Per-vessel HP:`);
          for (const [vid, state] of enc.vesselStates) {
            const weapons = state.weapons.map(w => `${w.moduleId}(cd${w.cooldownYearsRemaining.toFixed(2)})`).join(', ');
            console.log(`    ${vid}: hp=${state.hp.toFixed(0)}/${state.hpStart}, shield=${state.shieldHP.toFixed(0)}, armor=${state.armor}, weapons=[${weapons}]`);
          }
          console.log(`  Last 5 events:`);
          const allEvents = enc.timeline.flatMap(r => (r.events ?? []).map(ev => ({ round: r.round, ...ev })));
          for (const ev of allEvents.slice(-5)) {
            console.log(`    R${ev.round}: ${ev.attacker} → ${ev.weapon} → ${ev.target}: ${ev.hit ? `${ev.damage} dmg` : 'MISS'} (dist ${ev.distanceAU?.toFixed(3)} AU)`);
          }
        }
      },
      giveResearch: (amount = 10000) => {
        const rs = window.KOSMOS?.resourceSystem;
        if (!rs) { console.warn('[debug] Brak aktywnego ResourceSystem'); return; }
        rs.receive({ research: amount });
        console.log(`[debug] +${amount} research → ${rs.research?.amount ?? '?'}`);
      },
      // KOSMOS.debug.unlockTech('ground_warfare', 'point_defense', ...) — natychmiast bada.
      // Bez argumentów: odblokowuje pakiet militarny (broń + desant + logistyka).
      unlockTech: (...techIds) => {
        const tSys = window.KOSMOS?.techSystem;
        if (!tSys) { console.warn('[debug] Brak aktywnego TechSystem'); return; }
        const list = techIds.length > 0
          ? techIds
          : ['point_defense', 'ground_warfare', 'military_logistics', 'drone_warfare', 'tech_munitions', 'fleet_logistics'];
        for (const id of list) {
          if (tSys.isResearched(id)) { console.log(`[debug] ${id} już zbadany`); continue; }
          tSys.restore({ researched: [id] });  // restore DODAJE do Set + emituje tech:researched
          console.log(`[debug] ✓ ${id}`);
        }
      },
      // KOSMOS.debug.give({ Fe: 500, structural_alloys: 50 }) — uniwersalne dodawanie zasobów.
      // Akceptuje surowce (Fe/C/Si/Cu/Ti/Li/Hv/Xe/Nt), utility (food/water/research)
      // i commodities (structural_alloys, power_cells, ...).
      give: (gains) => {
        const rs = window.KOSMOS?.resourceSystem;
        if (!rs) { console.warn('[debug] Brak aktywnego ResourceSystem'); return; }
        if (!gains || typeof gains !== 'object') {
          console.warn('[debug] Użycie: KOSMOS.debug.give({ Fe: 500, Ti: 100, structural_alloys: 20 })');
          return;
        }
        rs.receive(gains);
        console.log('[debug] Dodano:', gains);
      },
      // KOSMOS.debug.giveAll(1000) — sypie po `amount` KAŻDEGO surowca + commodity.
      giveAll: (amount = 1000) => {
        const rs = window.KOSMOS?.resourceSystem;
        if (!rs) { console.warn('[debug] Brak aktywnego ResourceSystem'); return; }
        const gains = {};
        for (const id of rs.inventory.keys()) gains[id] = amount;
        rs.receive(gains);
        console.log(`[debug] +${amount} każdego (${Object.keys(gains).length} typów)`);
      },
      // KOSMOS.debug.giveCredits(10000) — dodaje Kredyty (Kr) do aktywnej kolonii
      // (waluta handlowa z CivilianTradeSystem; wykorzystywana do rush build, zakupów awaryjnych).
      giveCredits: (amount = 10000) => {
        const colMgr = window.KOSMOS?.colonyManager;
        const colony = colMgr?.getActiveColony?.() ?? colMgr?.getColony?.(colMgr?.activePlanetId);
        if (!colony) { console.warn('[debug] Brak aktywnej kolonii'); return; }
        colony.credits = (colony.credits ?? 0) + amount;
        EventBus.emit('trade:creditsChanged', { colonyId: colony.planetId, credits: colony.credits, delta: amount });
        console.log(`[debug] +${amount} Kr → ${colony.credits}`);
      },
      // KOSMOS.debug.givePop(5) — dodaje POPy do aktywnej kolonii (lub konkretnej warstwy).
      givePop: (amount = 5, strata = 'laborer') => {
        const civ = window.KOSMOS?.civSystem;
        if (!civ) { console.warn('[debug] Brak aktywnego CivilizationSystem'); return; }
        civ.addPop?.(strata, amount);
        console.log(`[debug] +${amount} POP (${strata})`);
      },
      // KOSMOS.debug.spawnMyUnit('shock_infantry', q, r, planetId?) — natychmiastowy spawn
      // własnej jednostki na hexie (dla testów walki). planetId domyślnie homePlanet.
      spawnMyUnit: (archetypeId = 'shock_infantry', q = 0, r = 0, planetId = null) => {
        const gum = window.KOSMOS?.groundUnitManager;
        if (!gum) { console.warn('[debug] Brak GroundUnitManager'); return; }
        const pid = planetId ?? window.KOSMOS?.homePlanet?.id;
        if (!pid) { console.warn('[debug] Brak planetId — podaj explicit lub skolonizuj'); return; }
        const unit = gum.createUnit(archetypeId, pid, q, r, {
          factionId: 'humanity',
          owner: 'player',
        });
        if (unit) {
          console.log(`[debug] ✓ ${archetypeId} na (${q},${r}) planeta ${pid} — id=${unit.id}`);
          return unit;
        }
        console.warn(`[debug] Spawn nieudany — sprawdź archetypeId (dostępne: shock_infantry, rocket_artillery, garrison_unit, aa_platform, medic_unit, recon_drone, ground_supply_unit)`);
      },
      // KOSMOS.debug.spawnMyVessel('hull_frigate', { modules: [...] }) — instant spawn
      // własnego militarnego statku w hangarze homePlanet. Auto-unlock point_defense.
      // M4 P1.5 — żeby testowanie pursue/engage nie wymagało godzinnego ramp-up
      // (build shipyard → research tech → produce vessel).
      // Default: hull_frigate z weapon_kinetic + shield + armor (combat-ready loadout).
      spawnMyVessel: (hullId = 'hull_frigate', opts = {}) => {
        const vMgr = window.KOSMOS?.vesselManager;
        const colMgr = window.KOSMOS?.colonyManager;
        const home = window.KOSMOS?.homePlanet;
        if (!vMgr || !colMgr || !home) {
          console.warn('[debug] Brak VesselManager/ColonyManager/homePlanet');
          return null;
        }
        const colony = colMgr.getColony(home.id);
        if (!colony) { console.warn('[debug] Brak kolonii na homePlanet'); return null; }
        // Auto-unlock point_defense (dla każdego militarnego hulla — wymaganie z HullsData)
        if (this.techSystem && !this.techSystem.isResearched?.('point_defense')) {
          this.techSystem.restore?.({ researched: ['point_defense'] });
          console.log(`[debug] ✓ tech point_defense auto-unlocked`);
        }
        // S3.0b S1: auto-unlock warp tech gdy spawn warp-statku (restore jest addytywny).
        const _reqMods = opts.modules ?? [];
        if (this.techSystem && _reqMods.some(m => m === 'engine_warp' || m === 'warp_tank')
            && !this.techSystem.isResearched?.('warp_drive')) {
          this.techSystem.restore?.({ researched: ['warp_drive'] });
          console.log(`[debug] ✓ tech warp_drive auto-unlocked`);
        }
        if (this.techSystem && _reqMods.includes('engine_warp_mk2')
            && !this.techSystem.isResearched?.('warp_drive_mk2')) {
          this.techSystem.restore?.({ researched: ['warp_drive_mk2'] });
          console.log(`[debug] ✓ tech warp_drive_mk2 auto-unlocked`);
        }
        // Sensowne default modules per hull-class — combat-ready
        const defaultModules = {
          hull_frigate:   ['engine_chemical', 'weapon_kinetic', 'shield_basic', 'reinforced_hull'],
          hull_destroyer: ['engine_chemical', 'engine_chemical', 'weapon_kinetic', 'weapon_kinetic',
                           'shield_basic', 'reinforced_hull'],
          hull_cruiser:   ['engine_chemical', 'engine_chemical', 'engine_chemical',
                           'weapon_missile', 'weapon_kinetic', 'weapon_kinetic',
                           'shield_basic', 'reinforced_hull'],
          hull_small:     ['engine_chemical', 'weapon_laser'],
          hull_medium:    ['engine_chemical', 'engine_chemical', 'cargo_hold'],
          hull_large:     ['engine_chemical', 'engine_chemical', 'cargo_hold', 'cargo_hold', 'cargo_hold'],
        };
        const modules = opts.modules ?? defaultModules[hullId] ?? [];
        let vessel;
        try {
          vessel = vMgr.createAndRegister(hullId, home.id, { modules, ...opts });
        } catch (e) {
          console.warn(`[debug] createAndRegister fail dla ${hullId}:`, e.message);
          return null;
        }
        if (!vessel) { console.warn(`[debug] Spawn ${hullId} zwrócił null`); return null; }
        if (!colony.fleet.includes(vessel.id)) colony.fleet.push(vessel.id);
        console.log(`[debug] ✓ ${hullId} (${vessel.name}) spawned — id=${vessel.id}, modules=${modules.join(',')}`);
        return vessel;
      },
      // KOSMOS.debug.simulateBattleRetreat({ vesselId?, lowFuel?, deepSpace? })
      // Symuluje retreat po bitwie (TEST 5.1/5.2). Przesuwa vessel do deep-space,
      // opcjonalnie ustawia fuel low, emituje battle:resolved retreat='A'.
      //   vesselId — opcjonalny; brak → pierwszy żywy player vessel
      //   lowFuel  — default true (fuel=0.05 → wymusza lowFuelDrift path)
      //   deepSpace — default true (przesuwa vessel 5 AU od homePlanet)
      // Zwraca { vessel, prevState, prevFuel, deepSpacePos } dla rollback.
      simulateBattleRetreat: (opts = {}) => {
        const vMgr = window.KOSMOS?.vesselManager;
        const eventBus = window.KOSMOS?.eventBus;
        const home = window.KOSMOS?.homePlanet;
        if (!vMgr || !eventBus || !home) {
          console.warn('[debug] Brak VesselManager/eventBus/homePlanet');
          return null;
        }
        const lowFuel = opts.lowFuel ?? true;
        const deepSpace = opts.deepSpace ?? true;
        const all = vMgr.getAllVessels().filter(v => !v.ownerEmpireId && !v.isWreck);
        const vessel = opts.vesselId
          ? vMgr.getVessel(opts.vesselId)
          : all[0];
        if (!vessel) { console.warn('[debug] Brak żywego player vessela'); return null; }

        const prevState = { ...vessel.position };
        const prevFuel = vessel.fuel?.current ?? null;

        if (deepSpace) {
          // Przesuń vessel 5 AU od home planet (~550 px) — daleko od kolonii,
          // żeby fuelNeeded dla retreat moveToPoint przekraczał fuel.current.
          const AU = 110;  // GAME_CONFIG.AU_TO_PX
          const angle = Math.random() * Math.PI * 2;
          vessel.position.x = (home.x ?? 0) + Math.cos(angle) * 5 * AU;
          vessel.position.y = (home.y ?? 0) + Math.sin(angle) * 5 * AU;
          vessel.position.state    = 'in_transit';
          vessel.position.dockedAt = null;
        }

        if (lowFuel && vessel.fuel) {
          vessel.fuel.current = 0.05;
        }

        const battleId = `manual_test_retreat_${Date.now()}`;
        eventBus.emit('battle:resolved', {
          battleId,
          result: {
            retreated: 'A',
            participantA: {
              type: 'vessel_group',
              empireId: 'player',
              vesselIds: [vessel.id],
            },
          },
        });
        console.log(`[debug] ✓ simulateBattleRetreat: vessel=${vessel.id} (${vessel.name}), battleId=${battleId}, deepSpace=${deepSpace}, lowFuel=${lowFuel}`);
        console.log(`[debug] Sprawdź: KOSMOS.vesselManager.getVessel('${vessel.id}').lowFuelDrift`);
        return { vessel, prevState, prevFuel, deepSpacePos: { x: vessel.position.x, y: vessel.position.y } };
      },
      // ── M1 Targeting (Commit 4) ──────────────────────────────────────
      // KOSMOS.debug.enableMovementOrders() — włącz feature flag + instancjonuj system.
      enableMovementOrders: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.movementOrders = true;
        this._ensureMovementOrderSystem();
      },
      // KOSMOS.debug.disableMovementOrders() — wyłącz + anuluj aktywne ordery.
      disableMovementOrders: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.movementOrders = false;
        this._disableMovementOrderSystem();
      },
      // KOSMOS.debug.issueOrder(vesselId, spec) — wydaj rozkaz.
      //   spec: { type: 'moveToPoint', targetPoint: { x, y } }
      //         { type: 'pursue' | 'intercept', targetEntityId: string }
      //   Feature flag musi być ON (enableMovementOrders() pierwsze).
      issueOrder: (vesselId, spec) => {
        const mos = window.KOSMOS?.movementOrderSystem;
        if (!mos) { console.warn('[debug] MovementOrderSystem wyłączony — użyj enableMovementOrders()'); return { ok: false, reason: 'feature_disabled' }; }
        const result = mos.issueOrder(vesselId, spec);
        console.log(`[debug] issueOrder(${vesselId}, ${spec?.type}):`, result);
        return result;
      },
      // KOSMOS.debug.cancelOrder(vesselId) — anuluj aktywny rozkaz.
      cancelOrder: (vesselId) => {
        const mos = window.KOSMOS?.movementOrderSystem;
        if (!mos) { console.warn('[debug] MovementOrderSystem wyłączony'); return false; }
        const ok = mos.cancelOrder(vesselId, 'debug');
        console.log(`[debug] cancelOrder(${vesselId}):`, ok);
        return ok;
      },
      // KOSMOS.debug.listOrders() — lista aktywnych orderów.
      listOrders: () => {
        const mos = window.KOSMOS?.movementOrderSystem;
        if (!mos) { console.warn('[debug] MovementOrderSystem wyłączony'); return []; }
        const orders = mos.listActive();
        console.table(orders.map(o => ({
          id: o.id, type: o.type, status: o.status,
          target: o.targetEntityId ?? (o.targetPoint ? `(${o.targetPoint.x.toFixed(0)},${o.targetPoint.y.toFixed(0)})` : '-'),
        })));
        return orders;
      },
      // ── M1 Targeting (Commit 7) — EmpireFleetMaterializer ─────────────
      enableFleetMaterialization: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.fleetMaterialization = true;
        this._ensureEmpireFleetMaterializer();
      },
      disableFleetMaterialization: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.fleetMaterialization = false;
        this._disableEmpireFleetMaterializer();
      },
      // KOSMOS.debug.materializeFleet(empireId, fleetId) — force materializacja (bypass ETA/trigger).
      materializeFleet: (empireId, fleetId) => {
        const efm = window.KOSMOS?.empireFleetMaterializer;
        if (!efm) { console.warn('[debug] EmpireFleetMaterializer wyłączony — użyj enableFleetMaterialization()'); return null; }
        const result = efm.materializeFleet(empireId, fleetId);
        console.log(`[debug] materializeFleet(${empireId},${fleetId}):`, result);
        return result;
      },
      // ── S3.3b-S2 Stacje orbitalne ─────────────────────────────────────
      // KOSMOS.debug.spawnStation(bodyId?, opts?) — instant stacja na orbicie ciała
      //   (domyślnie homePlanet). Pomija pending order — do live-gate wizualnego.
      spawnStation: (bodyId = null, opts = {}) => {
        const ss = window.KOSMOS?.stationSystem;
        if (!ss) { console.warn('[debug] Brak StationSystem'); return null; }
        const targetId = bodyId ?? window.KOSMOS?.homePlanet?.id;
        if (!targetId) { console.warn('[debug] Brak bodyId i homePlanet'); return null; }
        const st = ss.createStation(targetId, opts);
        // S3.4c (D1) — debug też stampuje ownerColonyId (gdy cel ma kolonię-matkę wg reguły
        // resolveHomeColony), by ścieżka debug nie tworzyła nienormalnych stanów (stacja z matką bez stampu).
        if (st && !st.ownerColonyId) {
          const mother = resolveHomeColony(st);
          if (mother) st.ownerColonyId = mother.planetId;
        }
        console.log(`[debug] spawnStation → ${st?.id} @ ${targetId} (matka: ${st?.ownerColonyId ?? 'brak'})`);
        return st;
      },
      // KOSMOS.debug.queueStationOrder(targetBodyId?, costOverride?) — pending order na
      //   homePlanet (test canAfford → spend → materialize). Bez override = pełny koszt z StationData.
      queueStationOrder: (targetBodyId = null, costOverride = null) => {
        const colMgr = window.KOSMOS?.colonyManager;
        const home = window.KOSMOS?.homePlanet;
        if (!colMgr || !home) { console.warn('[debug] Brak ColonyManager/homePlanet'); return null; }
        const target = targetBodyId ?? home.id;
        const id = colMgr.addPendingStationOrder(home.id, { targetBodyId: target, cost: costOverride });
        console.log(`[debug] queueStationOrder → ${id} (target ${target})`);
        return id;
      },
      // KOSMOS.debug.destroyStation(stationId) — usuń stację (orbita + encja).
      destroyStation: (stationId) => {
        const ok = window.KOSMOS?.stationSystem?.destroyStation(stationId);
        console.log(`[debug] destroyStation(${stationId}): ${ok}`);
        return ok;
      },
      // ── S3.4 FAZA 2 — moduły stacji, bilans, stocznia (live-gate bez UI) ─────
      // Pierwsza stacja gracza (helper wewnętrzny dla poniższych).
      _firstStation: (stationId = null) => {
        const ss = window.KOSMOS?.stationSystem;
        if (!ss) { console.warn('[debug] Brak StationSystem'); return null; }
        const st = stationId ? ss.getAllStations().find(s => s.id === stationId) : ss.getAllStations()[0];
        if (!st) console.warn('[debug] Brak stacji — użyj spawnStation()');
        return st;
      },
      // KOSMOS.debug.stationFillDepot(stationId?) — dosyp surowce/towary do budowy modułów/statków.
      // S3.4c: `st.depot.receive` deleguje przez proxy — stacja z matką zasila MAGAZYN KOLONII
      // (wspólny pool), sierota własny depot. Bez zmian w kodzie (proxy transparentny).
      stationFillDepot: (stationId = null) => {
        const st = window.KOSMOS.debug._firstStation(stationId);
        if (!st) return null;
        // Baza: materiały do budowy MODUŁÓW stacji (surowce + towary konstrukcyjne).
        const fill = {
          Fe: 5000, Ti: 5000, Si: 5000, Cu: 5000, Hv: 2000, Li: 1000, W: 500, Pt: 500,
          structural_alloys: 500, pressure_modules: 500, power_cells: 500, conductor_bundles: 500,
          plasma_cores: 500, electronic_systems: 500, reactive_armor: 500,
        };
        // Union kosztów KAŻDEGO kadłuba budowalnego w stoczni (SHIPS + HULLS) — gwarantuje, że
        // queueStationShip(dowolny kadłub) przejdzie po jednym filldepot. Fix S3.4-F2: brakowało
        // Xe (space_supply_ship) + polymer_composites (science_vessel/cargo_ship/hull_*), przez co
        // science_vessel odbijał się od insufficient_resources mimo „napełnionego" depotu.
        for (const def of [...Object.values(SHIPS), ...Object.values(HULLS)]) {
          const cost = { ...(def.cost ?? {}), ...(def.commodityCost ?? {}) };
          for (const [id, amt] of Object.entries(cost)) {
            fill[id] = Math.max(fill[id] ?? 0, amt * 10);   // ×10 headroom = kilka statków z jednego filla
          }
        }
        st.depot.receive(fill);
        // Z6: log celu (matka/sierota + tryb magazynu) + lista WSZYSTKICH stacji dla orientacji.
        // Proxy S3.4c: matka → zasila magazyn kolonii (wspólny pool), sierota → własny depot.
        const _all = window.KOSMOS?.stationSystem?.getAllStations?.() ?? [];
        console.log(`[debug] stationFillDepot → cel=${st.id} (matka=${st.ownerColonyId ?? '(sierota)'}, `
          + `${st.depotDetached ? 'odcięta/własny depot' : 'wspólny magazyn kolonii'}). Wszystkie stacje:`,
          _all.map(s => ({ id: s.id, owner: s.ownerColonyId ?? '(sierota)', detached: !!s.depotDetached })));
        return st.id;
      },
      // KOSMOS.debug.stationBuildModule(moduleType?, stationId?) — dosyp depot + zakolejkuj moduł.
      stationBuildModule: (moduleType = 'trade_module', stationId = null) => {
        const st = window.KOSMOS.debug._firstStation(stationId);
        if (!st) return null;
        window.KOSMOS.debug.stationFillDepot(st.id);
        const r = window.KOSMOS?.stationSystem?.addPendingModuleOrder(st.id, moduleType);
        console.log(`[debug] stationBuildModule(${moduleType}) →`, r);
        return r;
      },
      // KOSMOS.debug.stationSetPop(pop, stationId?) — ustaw załogę (test bilansu pracy / prekursor pasażerów).
      stationSetPop: (pop = 1, stationId = null) => {
        const st = window.KOSMOS.debug._firstStation(stationId);
        if (!st) return null;
        st.pop = pop;
        // FAZA 2 debug NIE egzekwuje capacity (pasażerowie = FAZA 4). Guard capacity przy PRZYLOCIE
        // pasażera powstanie w FAZIE 4 (_processPassengerArrival: gate station.pop < station.popCapacity
        // → pełna stacja = status no_housing, statek czeka zadokowany). Tu tylko ostrzeżenie.
        if (pop > st.popCapacity) {
          console.warn(`[debug] stationSetPop: pop=${pop} > popCapacity=${st.popCapacity} — FAZA 2 nie egzekwuje limitu; guard capacity dojdzie w FAZIE 4 (przylot pasażera).`);
        }
        console.log(`[debug] stationSetPop → ${st.id} pop=${pop} (popCapacity=${st.popCapacity})`);
        return st.id;
      },
      // KOSMOS.debug.stationBuildShip(shipId?, stationId?) — wymaga aktywnej stoczni; dosyp depot + kolejkuj.
      stationBuildShip: (shipId = 'science_vessel', stationId = null) => {
        const st = window.KOSMOS.debug._firstStation(stationId);
        if (!st) return null;
        window.KOSMOS.debug.stationFillDepot(st.id);
        const r = window.KOSMOS?.stationSystem?.queueStationShip(st.id, shipId);
        console.log(`[debug] stationBuildShip(${shipId}) →`, r);
        return r;
      },
      // KOSMOS.debug.stationInfo(stationId?) — wypisz moduły (typ/poziom/active/powód), pop, tradeCapacity, kolejki.
      stationInfo: (stationId = null) => {
        const st = window.KOSMOS.debug._firstStation(stationId);
        if (!st) return null;
        const info = {
          id: st.id, pop: st.pop, popCapacity: st.popCapacity, tradeCapacity: st.tradeCapacity,
          hasActiveShipyard: st.hasActiveShipyard,
          modules: st.modules.map(m => `${m.moduleType} lv${m.level} ${m.active === false ? '✗' + (m.inactiveReason || '') : '✓'}`),
          pendingModuleOrders: st.pendingModuleOrders.map(o => `${o.moduleType} ${o.status} ${o.progress?.toFixed?.(2)}/${o.buildTime}`),
          shipQueues: st.shipQueues.map(q => `${q.shipId} ${q.progress?.toFixed?.(2)}/${q.buildTime}`),
        };
        console.table ? console.table(info.modules) : null;
        console.log('[debug] stationInfo', info);
        return info;
      },
      // KOSMOS.debug.tradeCapacityBreakdown(colonyId?) — S3.4c Z1 DIAGNOZA: rozbij tradeCapacity
      // kolonii na składowe (200·pop + prosperity + trade_hub + BONUS STACJI per stacja) i porównaj
      // wartość LIVE (_allocateTC z bonusem) z ECHO (col.tradeCapacity — to co widzi UI handlu).
      // Ujawnia: (1) czy bonus stacji liczony, (2) czy moduł trade AKTYWNY (no_crew/no_power=0),
      // (3) czy echo stale (tick early-return przy <2 koloniach handlowych → UI nie widzi zmian).
      tradeCapacityBreakdown: (colonyId = null) => {
        const cts = window.KOSMOS?.civilianTradeSystem;
        const colMgr = window.KOSMOS?.colonyManager;
        if (!cts || !colMgr) { console.warn('[debug] Brak CivilianTradeSystem/ColonyManager'); return null; }
        const id = colonyId ?? window.KOSMOS?.homePlanet?.id ?? colMgr.getActiveColony?.()?.planetId;
        const colony = colMgr.getColony?.(id);
        if (!colony) { console.warn(`[debug] Brak kolonii ${id}`); return null; }

        const isOutpost = colony.isOutpost ?? false;
        const pop = colony.civSystem?.population ?? 0;
        const prosperity = colony.prosperitySystem?.prosperity ?? 50;
        const basePop        = isOutpost ? 0 : 200 * pop;
        const baseProsperity = isOutpost ? 0 : Math.floor(prosperity / 20) * 50;
        const buildingBonus  = cts._getBuildingBonus(colony, 'tcBonus');
        const stationBonus   = cts._getStationTradeBonus(colony);
        const allocatedLive  = cts._allocateTC(colony);          // z bonusem, TERAZ (pure)
        const echo           = cts.getTradeCapacity(colony.planetId);   // to co widzi UI (z ostatniego ticku)

        // Rozbicie per stacja (przypisane do TEJ kolonii) + wszystkie stacje gracza (widoczność stampu).
        const ss = window.KOSMOS?.stationSystem;
        const allStations = ss?.getAllStations?.() ?? [];
        const attributed = [];
        for (const st of allStations) {
          if (st.ownerColonyId !== colony.planetId) continue;
          const tradeMods = (st.modules ?? []).filter(m => m.moduleType === 'trade_module')
            .map(m => ({ level: m.level, active: m.active !== false, inactiveReason: m.inactiveReason ?? null }));
          attributed.push({ id: st.id, name: st.name, pop: st.pop, popCapacity: st.popCapacity,
            depotDetached: !!st.depotDetached, tradeModules: tradeMods, contribution: st.tradeCapacity });
        }
        const allPlayerStations = allStations.filter(s => s.ownerEmpireId === 'player').map(s => ({
          id: s.id, ownerColonyId: s.ownerColonyId, depotDetached: !!s.depotDetached,
          tradeCapacity: s.tradeCapacity, pop: s.pop,
        }));

        // T5 fix: prawdziwy gate _halfYearlyTick to <2 kolonie HANDLOWE (spaceport, nie-izolowane),
        // NIE liczba kolonii gracza. Licz po tym samym filtrze co _halfYearlyTick (L83-98).
        const tradingCount = (colMgr.getAllColonies?.() ?? []).filter(c =>
          !c.tradeOverrides?.isolation && cts._hasSpaceport(c)).length;
        const out = {
          colonyId: colony.planetId, isOutpost, pop, prosperity,
          components: { basePop, baseProsperity, buildingBonus, stationBonus },
          allocatedTC_live: allocatedLive,
          echo_tradeCapacity_UI: echo,
          echoMatchesLive: allocatedLive === echo,
          tradingColonies: tradingCount,
          attributedStations: attributed,
          allPlayerStations,
          // Po Z7 getTradeCapacity liczy LIVE → echo == live z definicji (display nie jest już stale).
          // <2 kolonie handlowe wpływa tylko na ROUTING (_tcPool/goods flow), nie na display.
          diagnostic: tradingCount < 2
            ? 'ℹ <2 kolonie handlowe (spaceport, nie-izolowane): routing handlu (_tcPool/flow) nie biegnie (_halfYearlyTick early-return), ale getTradeCapacity liczy LIVE (Z7) → display poprawny.'
            : (allocatedLive === echo ? 'OK — echo == live.'
                                      : '⚠ echo ≠ live — nieoczekiwane po Z7 (zgłoś).'),
        };
        console.log('[debug] tradeCapacityBreakdown', out);
        if (attributed.length) console.table?.(attributed.flatMap(s =>
          s.tradeModules.map(m => ({ station: s.id, level: m.level, active: m.active, reason: m.inactiveReason, stContribution: s.contribution }))));
        else console.log('[debug]   (brak stacji przypisanych do tej kolonii — sprawdź allPlayerStations.ownerColonyId)');
        return out;
      },
      // KOSMOS.debug.destroyColony(colonyId?, {confirm}?) — S3.4c Z2: zniszcz kolonię PEŁNĄ ścieżką
      // produkcyjną (ColonyManager.removeColony → emit colony:destroyed + cleanup hangar/tras + switch
      // aktywnej). Odblokowuje live-gate T6 (osierocenie stacji z C2 dostaje PRAWDZIWY event, nie skrót).
      // Akcja NISZCZĄCA → wymaga potwierdzenia: destroyColonyConfirm() lub {confirm:true}.
      // UWAGA: removeColony NIE niszczy home planety (isHomePlanet guard → game-over path osobno) —
      // do testu osierocenia użyj stacji z matką na koloni WTÓRNEJ (nie home).
      destroyColony: (colonyId = null, opts = {}) => {
        const colMgr = window.KOSMOS?.colonyManager;
        if (!colMgr) { console.warn('[debug] Brak ColonyManager'); return null; }
        const id = colonyId ?? colMgr.getActiveColony?.()?.planetId ?? window.KOSMOS?.homePlanet?.id;
        const colony = colMgr.getColony?.(id);
        if (!colony) { console.warn(`[debug] Brak kolonii ${id}`); return null; }
        if (colony.isHomePlanet) {
          console.warn(`[debug] destroyColony: ${id} to HOME PLANET — removeColony jej NIE niszczy (ścieżka game-over osobno). Wskaż kolonię wtórną.`);
          return null;
        }
        if (opts.confirm !== true) {
          window.KOSMOS.debug._pendingDestroyColony = id;
          console.warn(`[debug] ⚠ AKCJA NISZCZĄCA: kolonia "${colony.name ?? id}" (${id}). ` +
            `Potwierdź: KOSMOS.debug.destroyColonyConfirm()  albo  destroyColony('${id}', {confirm:true}).`);
          return { pending: id };
        }
        return window.KOSMOS.debug._doDestroyColony(id);
      },
      destroyColonyConfirm: () => {
        const id = window.KOSMOS?.debug?._pendingDestroyColony;
        if (!id) { console.warn('[debug] Brak oczekującego destroyColony — wywołaj najpierw destroyColony(id).'); return null; }
        window.KOSMOS.debug._pendingDestroyColony = null;
        return window.KOSMOS.debug._doDestroyColony(id);
      },
      _doDestroyColony: (id) => {
        const colMgr = window.KOSMOS?.colonyManager;
        const colony = colMgr?.getColony?.(id);
        if (!colony) { console.warn(`[debug] Kolonia ${id} już nie istnieje`); return null; }
        // PEŁNA ścieżka produkcyjna (identyczna z body:collision/planet:ejected) — emit colony:destroyed.
        colMgr.removeColony(id, 'debug');
        console.log(`[debug] destroyColony → ${id} zniszczona (removeColony reason=debug; colony:destroyed wyemitowany → osierocenie stacji C2).`);
        return id;
      },
      // ── M2a Combat Core (Commit 8) ────────────────────────────────────
      // KOSMOS.debug.enableProximity() — ProximitySystem on + instance.
      enableProximity: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.proximitySystem = true;
        this._ensureProximitySystem();
      },
      disableProximity: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.proximitySystem = false;
        this._disableProximitySystem();
      },
      // KOSMOS.debug.enableVesselCombat() — VesselCombatSystem + AutoRetreat on.
      // Niezależne od proximitySystem (flag), ale BEZ proximityEnter eventów
      // VCS nie ma żeby czego nasłuchiwać — włącz oba razem.
      enableVesselCombat: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.vesselCombat = true;
        this._ensureVesselCombatSystem();
        this._ensureAutoRetreatSystem();
      },
      disableVesselCombat: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.vesselCombat = false;
        this._disableVesselCombatSystem();
        this._disableAutoRetreatSystem();
      },
      // M4 P3 — DeepSpaceCombatSystem ON (per-tick combat zamiast instant VCS).
      // Wymaga vesselCombat ON (DSCS delegowany z VCS._handleCombatRangeEnter).
      enableDeepSpaceCombat: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.m4DeepSpaceCombat = true;
        this._ensureDeepSpaceCombatSystem();
        console.log('[debug] m4DeepSpaceCombat = true (VCS deleguje do DSCS)');
      },
      disableDeepSpaceCombat: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.m4DeepSpaceCombat = false;
        this._disableDeepSpaceCombatSystem();
        console.log('[debug] m4DeepSpaceCombat = false (VCS instant resolve)');
      },
      // KOSMOS.debug.enableUnifiedAggregator() — WarSystem._fleetArrived skip
      // dla materialized. Pomiędzy abstract fleet battle a vessel-level combat.
      enableUnifiedAggregator: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.unifiedAggregator = true;
        console.log('[debug] unifiedAggregator = true (WarSystem._fleetArrived skip dla materialized)');
      },
      disableUnifiedAggregator: () => {
        GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
        GAME_CONFIG.FEATURES.unifiedAggregator = false;
        console.log('[debug] unifiedAggregator = false');
      },
      // ── Combat Sandbox (scenarioMode === 'combat_sandbox') ────────────
      // KOSMOS.debug.sandboxInfo() — dump stanu: empires + vessele + aktywne flagi.
      sandboxInfo,
      // KOSMOS.debug.sandboxResetPositions() — vessele wracają do pozycji startowych,
      // anuluje aktywne movement ordery.
      sandboxResetPositions,
      // KOSMOS.debug.sandboxSpawnMoreEnemies(count=1) — N dodatkowych wrogich hull_small.
      sandboxSpawnMoreEnemies,
      // ── M2b Commit 5 — POIRegistry CRUD ───────────────────────────────
      // KOSMOS.debug.createPOI(spec) — utwórz POI. Spec patrz POITypes.validatePOISpec.
      createPOI: (spec) => window.KOSMOS?.poiRegistry?.createPOI(spec),
      // KOSMOS.debug.listPOIs(filter?) — lista wszystkich lub filter={type}/{ownerEmpireId}.
      listPOIs:  (filter) => window.KOSMOS?.poiRegistry?.listPOIs(filter),
      // KOSMOS.debug.deletePOI(poiId) — usuń POI. MOS auto-cancel orderów referencjujących.
      deletePOI: (poiId) => window.KOSMOS?.poiRegistry?.deletePOI(poiId),
      // KOSMOS.debug.getPOI(poiId) — pełny obiekt POI lub null.
      getPOI:    (poiId) => window.KOSMOS?.poiRegistry?.getPOI(poiId),
      // ── M3 P2.1 — POI Panel ──────────────────────────────────────────────
      // KOSMOS.debug.openPOIPanel() — otwórz panel POI (klawisz N).
      openPOIPanel: () => window.KOSMOS?.uiManager?.overlayManager?.openPanel?.('poi'),
      // KOSMOS.debug.closePOIPanel() — zamknij panel POI (jeśli aktywny).
      closePOIPanel: () => {
        const om = window.KOSMOS?.uiManager?.overlayManager;
        if (om?.active === 'poi') om.closeActive();
      },
      // KOSMOS.debug.getPOIPanelState() — { visible, sortBy, sortDir, filterType, filterOwner, scrollY, poiCount }.
      getPOIPanelState: () => window.KOSMOS?.uiManager?.overlayManager?.overlays?.poi?.getState?.(),
      // ── M3 P2.3 — Create POI picker mode ─────────────────────────────────
      // KOSMOS.debug.openCreatePOIPickerMode('waypoint'|'patrol'|'picket'|'rally'|'ambush', { initialPoint? })
      // Bez initialPoint → enter targetPoint/patrolWaypoints picker, gracz klika.
      // Z initialPoint (gameplay px {x,y}) → fast path do modal'u (single-click types).
      openCreatePOIPickerMode: (poiType, options) => this._openCreatePOIPickerMode(poiType, options),
      // KOSMOS.debug.exitPickerMode() — anuluj aktywny picker (alias dla cancelPickerMode).
      exitPickerMode: () => this.uiManager?.cancelPickerMode?.(),
      // ── M3 P2.2 — POI Modal (create + edit) ─────────────────────────────
      // KOSMOS.debug.openPOIModalCreate('waypoint'|'patrol'|'picket'|'rally'|'ambush')
      openPOIModalCreate: async (initialType = 'waypoint') => {
        const m = await import('../ui/POIModal.js');
        return m.showPOIModalCreate(initialType);
      },
      // KOSMOS.debug.openPOIModalEdit(poiId) — otwiera Edit modal dla istniejącego POI.
      openPOIModalEdit: async (poiId) => {
        const poi = window.KOSMOS?.poiRegistry?.getPOI?.(poiId);
        if (!poi) { console.warn(`[debug] POI nie znaleziony: ${poiId}`); return null; }
        const m = await import('../ui/POIModal.js');
        return m.showPOIModalEdit(poi);
      },
      // ── M3 P3.1 — POI Runtime System ─────────────────────────────────────
      // KOSMOS.debug.poiRuntime — pełny obiekt POIRuntimeSystem.
      get poiRuntime() { return window.KOSMOS?.poiRuntimeSystem; },
      // KOSMOS.debug.simulatePicketAlert(poiId, vesselId) — force trigger picket alert (testing).
      simulatePicketAlert: (poiId, vId) => {
        const sys = window.KOSMOS?.poiRuntimeSystem;
        if (!sys?.simulatePicketAlert) return { ok: false, reason: 'system_unavailable' };
        const result = sys.simulatePicketAlert(poiId, vId);
        console.log(`[debug] simulatePicketAlert(${poiId}, ${vId}):`, result);
        return result;
      },
      // KOSMOS.debug.getPOIRuntimeState(poiId) — { type, triggered, cooldownEndsAt, complete, currentMembers, completedYear }.
      getPOIRuntimeState: (poiId) => {
        const sys = window.KOSMOS?.poiRuntimeSystem;
        return sys?.getPOIRuntimeState?.(poiId) ?? null;
      },
      // ── M2b Commit 6 — POI navigation devtools ─────────────────────────
      // KOSMOS.debug.issueGoToPOI(vesselId, poiId) — vessel leci do POI.
      issueGoToPOI: (vId, poiId) => {
        const mos = window.KOSMOS?.movementOrderSystem;
        if (!mos) { console.warn('[debug] MovementOrderSystem wyłączony — użyj enableMovementOrders()'); return { ok: false, reason: 'mos_disabled' }; }
        const result = mos.issueOrder(vId, { type: 'goToPOI', poiId });
        console.log(`[debug] issueGoToPOI(${vId}, ${poiId}):`, result);
        return result;
      },
      // KOSMOS.debug.issuePatrol(vesselId, poiIdOrSpec) — patrol z POI lub manualny.
      //   issuePatrol('v_1', 'poi_2') — POI patrol
      //   issuePatrol('v_1', { patrolRoute: [{x:0,y:0},{x:100,y:0}] }) — manualny
      issuePatrol: (vId, poiIdOrSpec) => {
        const mos = window.KOSMOS?.movementOrderSystem;
        if (!mos) { console.warn('[debug] MovementOrderSystem wyłączony — użyj enableMovementOrders()'); return { ok: false, reason: 'mos_disabled' }; }
        const spec = (typeof poiIdOrSpec === 'string')
          ? { type: 'patrol', poiId: poiIdOrSpec }
          : { type: 'patrol', ...poiIdOrSpec };
        const result = mos.issueOrder(vId, spec);
        console.log(`[debug] issuePatrol(${vId}):`, result);
        return result;
      },
      // ── M2b Commit 7 — escort runtime devtools ─────────────────────────
      // KOSMOS.debug.issueEscort(vesselId, escorteeId) — vessel eskortuje innego.
      issueEscort: (vId, escorteeId) => {
        const mos = window.KOSMOS?.movementOrderSystem;
        if (!mos) { console.warn('[debug] MovementOrderSystem wyłączony — użyj enableMovementOrders()'); return { ok: false, reason: 'mos_disabled' }; }
        const result = mos.issueOrder(vId, { type: 'escort', targetEntityId: escorteeId });
        console.log(`[debug] issueEscort(${vId}, ${escorteeId}):`, result);
        return result;
      },

      // ── M3 P1.1 — UI selection + context menu devtools ─────────────────
      // KOSMOS.debug.selectVessel(vId)        — ustaw zaznaczenie z konsoli.
      // KOSMOS.debug.clearSelection()         — wyczyść zaznaczenie.
      // KOSMOS.debug.getSelectedVesselId()    — odczyt aktualnego stanu.
      // KOSMOS.debug.openRightClickMenu(type, point, extra) — emituj otwarcie
      //   menu kontekstowego (testowanie bez raycaster — to dodajemy w P1.2).
      //   Przykład: openRightClickMenu('enemyVessel', {x:400,y:300}, {entityId:'v_2'})
      selectVessel: (vId) => window.KOSMOS?.uiManager?.setSelectedVesselId(vId),
      clearSelection: () => window.KOSMOS?.uiManager?.clearSelection(),
      getSelectedVesselId: () => window.KOSMOS?.uiManager?.getSelectedVesselId() ?? null,
      openRightClickMenu: (targetType = 'empty', screenPoint = { x: 100, y: 100 }, extra = {}) => {
        EventBus.emit('ui:rightClickMenuOpened', {
          target: { type: targetType, ...extra },
          screenPoint,
        });
      },

      // ── M3 P1.2 — raycaster + simulated right click ────────────────────
      // KOSMOS.debug.raycastAt(clientX, clientY) — sanity check raycaster
      //   z konkretnych koordynat (zwraca {type, entityId?, ..., worldPoint}).
      // KOSMOS.debug.simulateRightClick(clientX, clientY) — dispatch
      //   contextmenu MouseEvent (testy bez prawdziwej myszki).
      raycastAt: (clientX, clientY) => this._resolveClickTarget(clientX, clientY),
      // ── M3 P1.5 — tooltip devtools ─────────────────────────────────────
      // KOSMOS.debug.showTooltip(type, id, x?, y?)  — bypass hover detection,
      //   pokaż tooltip natychmiast (omija 500ms delay). Walidacja przez
      //   getTooltipContent (zwraca null gdy entity null/unknown).
      // KOSMOS.debug.hideTooltip()                  — schowaj.
      showTooltip: (entityType, entityId, x = 200, y = 200) => {
        const entity = this._lookupTooltipEntity(entityType, entityId);
        const content = getTooltipContent(entityType, entity, this._tooltipDeps());
        if (!content) {
          console.warn(`[debug.showTooltip] brak content dla ${entityType}:${entityId}`);
          return;
        }
        this.tooltip?.show(content, { x, y });
      },
      hideTooltip: () => this.tooltip?.hide(),
      simulateRightClick: (clientX, clientY) => {
        // Direct emit — omija UI guards z _handleTacticalRightClick (modal
        // detection, isOverUI). Reprodukuje produkcyjny path POST raycaster
        // resolve. Pełen event-flow testowanie → real myszka w real-flow.
        const target = this._resolveClickTarget(clientX, clientY);
        if (!target) { console.warn('[simulateRightClick] resolver returned null'); return; }
        EventBus.emit('ui:rightClickMenuOpened', {
          target,
          screenPoint: { x: clientX, y: clientY },
        });
      },

      // ── M3 P1.3 — picker mode + ESC keyboard devtools ──────────────────
      // KOSMOS.debug.startPicker(mode, callback?)  — np. ('patrolWaypoints', cb)
      // KOSMOS.debug.cancelPicker()                — anuluj aktywny picker
      // KOSMOS.debug.finalizePicker()              — zakończ (jeśli min reqs spełnione)
      // KOSMOS.debug.getPickerState()              — odczyt stanu (debug)
      // KOSMOS.debug.simulateKeydown(key)          — np. 'Escape' / 'Enter' (test path)
      startPicker: (mode = 'patrolWaypoints', callback) => {
        const cb = typeof callback === 'function'
          ? callback
          : (r) => console.log('[debug picker result]', r);
        return window.KOSMOS?.uiManager?.setPickerMode(mode, cb, { source: 'debug' });
      },
      cancelPicker: () => window.KOSMOS?.uiManager?.cancelPickerMode?.() ?? false,
      finalizePicker: () => window.KOSMOS?.uiManager?.finalizePickerMode?.() ?? false,
      getPickerState: () => window.KOSMOS?.uiManager?.getPickerState?.() ?? null,
      simulateKeydown: (key) => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      },
      // ── Player Fleet Groups (P1) — devtools ─────────────────────────────
      // KOSMOS.debug.createFleet('Strike Alpha') → fleet
      createFleet: (name = 'Test Fleet') => {
        const fs = window.KOSMOS?.fleetSystem;
        if (!fs) { console.warn('[debug] Brak FleetSystem'); return null; }
        const f = fs.createFleet(name);
        console.log('[debug] Created fleet:', f.id, f.name);
        return f;
      },
      // KOSMOS.debug.disbandFleet(fleetId) → bool
      disbandFleet: (fleetId) => {
        const fs = window.KOSMOS?.fleetSystem;
        if (!fs) { console.warn('[debug] Brak FleetSystem'); return false; }
        return fs.disbandFleet(fleetId, 'manual');
      },
      // KOSMOS.debug.addToFleet(fleetId, vesselId) → { ok, reason? }
      addToFleet: (fleetId, vesselId) => {
        const fs = window.KOSMOS?.fleetSystem;
        if (!fs) { console.warn('[debug] Brak FleetSystem'); return { ok: false, reason: 'no_system' }; }
        const res = fs.addMember(fleetId, vesselId);
        console.log('[debug] addMember:', res);
        return res;
      },
      // KOSMOS.debug.listFleets() — wypisz tabela flot + members + doktryna
      listFleets: () => {
        const fs = window.KOSMOS?.fleetSystem;
        if (!fs) { console.warn('[debug] Brak FleetSystem'); return; }
        const fleets = fs.listFleets();
        if (fleets.length === 0) { console.log('[debug] Brak flot'); return; }
        console.log(`=== PLAYER FLEETS (${fleets.length}) ===`);
        for (const f of fleets) {
          console.log(`  ${f.id} "${f.name}" doctrine=${f.doctrine} members=[${f.memberIds.join(', ')}]`);
        }
      },
      // KOSMOS.debug.issueFleetOrder(fleetId, spec) — manual fleet order
      issueFleetOrder: (fleetId, spec) => {
        const fs = window.KOSMOS?.fleetSystem;
        if (!fs?.issueFleetOrder) { console.warn('[debug] Brak FleetSystem.issueFleetOrder'); return null; }
        const res = fs.issueFleetOrder(fleetId, spec);
        console.log('[debug] issueFleetOrder:', res);
        return res;
      },
      // KOSMOS.debug.dumpFleet(fleetId) — szczegóły jednej floty
      dumpFleet: (fleetId) => {
        const fs = window.KOSMOS?.fleetSystem;
        const f = fs?.getFleet?.(fleetId);
        if (!f) { console.warn('[debug] Fleet not found:', fleetId); return null; }
        console.log(`=== ${f.id} "${f.name}" ===`);
        console.log(`  doctrine: ${f.doctrine}`);
        console.log(`  createdYear: ${f.createdYear}`);
        console.log(`  autoDisbandWhenEmpty: ${f.autoDisbandWhenEmpty}`);
        console.log(`  activeOrder: ${f.activeOrder ? JSON.stringify(f.activeOrder) : 'null'}`);
        const vm = window.KOSMOS?.vesselManager;
        console.log(`  members (${f.memberIds.length}):`);
        for (const vid of f.memberIds) {
          const v = vm?.getVessel?.(vid);
          console.log(`    ${vid} "${v?.name ?? '?'}" state=${v?.position?.state ?? '?'} fleetId=${v?.fleetId ?? '?'}`);
        }
        return f;
      },
    };

    // ── Reactive store + audit log (Faza 0: fundament dla wojny/dyplomacji/AI obcych) ──
    // Nowa gra → reset do domyślnego kształtu; restore z save'a niżej.
    // DebugLog musi się doczepić do EventBusu PO EventBus.clear() na początku start(),
    // w przeciwnym razie subskrypcje z module-load zostały wytarte.
    gameState.reset();
    debugLog.clear();
    debugLog.attach();
    window.KOSMOS.gameState  = gameState;
    window.KOSMOS.debugLog   = debugLog;

    // ── Dane galaktyczne (okoliczne układy gwiezdne) ──────────
    const isNewGame = !savedData?.civ4x?.galaxyData;
    window.KOSMOS.galaxyData = savedData?.civ4x?.galaxyData
      ?? GalaxyGenerator.generate(star.id, star.name, star.spectralType);

    // ── Faza 1: spawn obcych imperiów (tylko nowa gra) ─────────
    // Przy save — imperia w gameState.empires zostają przywrócone niżej,
    // a syncToGalaxyData() odtworzy empireId na galaxyData.systems.
    if (isNewGame) {
      // B2: barwa imperium wybrana na starcie (FactionSelectScene) → gameState PRZED
      // EmpireGenerator (wykluczenie koloru gracza z puli AI). Fallback: '#33ccff'
      // z createDefaultState gdy gracz nie wybrał (Power Test / brak ekranu wyboru).
      if (window.KOSMOS.selectedColor) {
        gameState.set('player.empireColor', window.KOSMOS.selectedColor, 'player_empire_color');
      }
      EmpireGenerator.generate(window.KOSMOS.galaxyData, this.empireRegistry);
      // Slice 1 log — pierwsze imperium AI z realną kolonią
      const _firstEmp = this.empireRegistry.listAll()[0];
      if (_firstEmp) {
        const _firstColonyId = _firstEmp.colonies?.[0];
        const _firstColony   = _firstColonyId
          ? this.colonyManager?.getColony(_firstColonyId)
          : null;
        const _buildingCount = _firstColony?.buildingSystem?._active?.size ?? 0;
        console.log(
          `Empire AI created: ${_firstEmp.name} on ${_firstEmp.homeSystemId}, ` +
          `colony ${_firstColony?.name ?? '?'} with ${_buildingCount} buildings`
        );
      }
      // Dla każdego świeżo stworzonego imperium → zapewnij rekord intel=unknown
      this.intelSystem.initForAllEmpires();
      // M2b Commit 2: zapewnij intel.vessels = {} (constructor IntelSystem
      // jest bezskuteczny — gameState.reset() powyżej wymiata jego init)
      this.intelSystem.initVesselSubdomain();
      // M2b Commit 5: zapewnij gameState.pois = {} (analogicznie L2 z C2 fix #2)
      this.poiRegistry.initPOISubdomain();
      // Faza 3: diplomacy (peace, hostility=0) + FSM (IDLE/EXPANDING wg personality)
      this.diplomacySystem.initForAllEmpires();
      this.alienCivSystem.initForAllEmpires();
    }

    // ── Szablony projektów statków (Unit Design) ─────────────────
    window.KOSMOS.unitDesigns = savedData?.civ4x?.unitDesigns ?? [];

    // ── Przywrócenie stanu 4X ──────────────────────────────────
    const c4x = savedData?.civ4x;
    if (c4x?.civMode) {
      window.KOSMOS.civMode = true;

      // Faza 0: reactive store (empires/intel/diplomacy/wars/battles/invasions)
      if (c4x.gameState) gameState.restore(c4x.gameState);
      // Faza 1: po restore — odśwież empireId na galaxyData (na wypadek save
      // sprzed Fazy 1 lub gdyby galaxyData była starsza od gameState.empires)
      this.empireRegistry.syncToGalaxyData(window.KOSMOS.galaxyData);
      // Faza 2: zapewnij rekord intel dla każdego imperium (save sprzed Fazy 2)
      this.intelSystem.initForAllEmpires();
      // M2b Commit 2: zapewnij intel.vessels (fallback dla save sprzed migracji v66→v67
      // i defense-in-depth dla świeżych save'ów)
      this.intelSystem.initVesselSubdomain();
      // M2b Commit 5: zapewnij gameState.pois + reconstruct _nextId po load
      this.poiRegistry.initPOISubdomain();
      // M2b Commit 7: po restore POI sprites — gameState.restore nie emituje
      // poi:created dla zsynchronizowanych POI, więc ThreeRenderer trzeba
      // zsiać explicit. Idempotent: skanuje gameState.pois i tworzy sprites.
      this.threeRenderer?.initPOISpritesFromState?.();
      // Faza 3: zapewnij relacje diplomacy + FSM (save sprzed Fazy 3)
      this.diplomacySystem.initForAllEmpires();
      this.alienCivSystem.initForAllEmpires();

      // Po migracji SaveMigration: save zawsze ma colonies[] (v5+)
      // Przywróć tech (globalne)
      if (c4x.techs) this.techSystem.restore(c4x.techs);
      if (c4x.researchSystem) this.researchSystem.restore(c4x.researchSystem);
      // Przywróć kolonie przez ColonyManager (tworzy per-kolonia ResourceSystem, CivSystem, BuildingSystem)
      if (c4x.colonies?.length > 0) {
        this.colonyManager.restore(c4x, this.buildingSystem);
      }
      // #2 (Slice 2 save/restore AI): re-link kolonii AI → ownerEmpireId + per-empire
      //   TechSystem z emp.colonies. PO colonyManager.restore (obiekty kolonii istnieją)
      //   I gameState.restore (emp.colonies istnieją). Synchroniczne — przed setTimeout swapem.
      EmpireColonyBootstrap.relinkColoniesAfterRestore(c4x.empireTech);
      if (c4x.empireStrategy) window.KOSMOS.empireStrategySystem?.restore(c4x.empireStrategy);
      // Slice 1: drugi sync — po restore kolonii. EmpireRegistry.syncToGalaxyData
      // czyta colony.systemId z ColonyManager (nowa struktura: emp.colonies = [colonyId, ...]).
      // Pierwsze wywołanie (linia 1015, przed restore) działa tylko dla home systemu
      // emp.homeSystemId — nowy sync dopisuje pozostałe kolonie.
      this.empireRegistry.syncToGalaxyData(window.KOSMOS.galaxyData);
      this.territoryService?.reindex();   // strefy wpływów — przebuduj indeks własności po restore
      // Ustaw homePlanet i aktywne systemy
      const homePlanetId = c4x.homePlanetId ?? c4x.colonies?.find(c => c.isHomePlanet)?.planetId;
      if (homePlanetId) {
        setTimeout(() => {
          const hp = this.colonyManager._findEntity(homePlanetId);
          if (hp) {
            window.KOSMOS.homePlanet = hp;
            hp.explored = true;
            hp.analyzed = true;   // planeta domowa = pełna wiedza
          }
          // Przywróć aktywne systemy z homePlanet (per-kolonia instancje)
          const homeCol = this.colonyManager.getColony(homePlanetId);
          if (homeCol) {
            window.KOSMOS.resourceSystem  = homeCol.resourceSystem;
            window.KOSMOS.civSystem       = homeCol.civSystem;
            window.KOSMOS.buildingSystem  = homeCol.buildingSystem;
            if (homeCol.factorySystem) {
              window.KOSMOS.factorySystem = homeCol.factorySystem;
              this.factorySystem = homeCol.factorySystem;
            }
            if (homeCol.prosperitySystem) {
              window.KOSMOS.prosperitySystem = homeCol.prosperitySystem;
            }
            this.resourceSystem  = homeCol.resourceSystem;
            this.civSystem       = homeCol.civSystem;
            this.buildingSystem  = homeCol.buildingSystem;
            this.expeditionSystem.resourceSystem = homeCol.resourceSystem;
            this.techSystem.resourceSystem      = homeCol.resourceSystem;
            const gridSizes = { rocky: 10, hot_rocky: 6, ice: 6, gas: 6 };
            this.buildingSystem._gridHeight = gridSizes[hp?.planetType] ?? 10;
            if (hp?.deposits) this.buildingSystem.setDeposits(hp.deposits);
          }
          // Po swapie KOSMOS: wymuś ponowną rejestrację konsumpcji POP
          // (przy restore() guard EventBus blokował emit bo KOSMOS wskazywał na stary ResourceSystem)
          for (const col of this.colonyManager.getAllColonies()) {
            col.civSystem._registeredPop = -1;
            col.civSystem.forceConsumptionSync(col.resourceSystem);
          }
        }, 0);
      }
      if (c4x.missions || c4x.expeditions) this.expeditionSystem.restore(c4x.missions ?? c4x.expeditions);
      // Przywróć VesselManager
      if (c4x.vesselManager) {
        this.vesselManager.restore(c4x.vesselManager);
        // M4 P1 fix — MOS skonstruowany w start() przed restore'em vesseli, więc
        // _indexExistingOrders zobaczył pustą listę. Re-index po restore zbuduje
        // _driftingVessels + _byVessel z aktualnego stanu vesseli (driftIdle, movementOrder).
        if (this.movementOrderSystem?._indexExistingOrders) {
          this.movementOrderSystem._indexExistingOrders();
        }
        // Slice C — wznów composite: statek przyleciał do celu przed zapisem, ale
        // arrival-event nie wróci po load → dostaw drugą nogę (transport/pasażer).
        this.orderService?._resumePendingOrders?.();
      }
      // M4 P3 — Przywróć DeepSpaceCombatSystem encounter state (po VesselManager,
      // bo restore filtruje encountery których vessele nie istnieją w VM).
      if (c4x.deepSpaceEngagements && this.deepSpaceCombatSystem?.restore) {
        this.deepSpaceCombatSystem.restore(c4x.deepSpaceEngagements);
      }
      // Player Fleet Groups (v73) — Przywróć FleetSystem po VesselManager.
      // FleetSystem.restore waliduje memberIds (drop orphans gdy vessel nie istnieje)
      // i re-ustawia vessel.fleetId reactive mirror z authoritative memberIds.
      // Stare save (v72→v73 zmigrowane) mają playerFleets={fleets:[],nextId:1}.
      if (c4x.playerFleets && this.fleetSystem?.restore) {
        this.fleetSystem.restore(c4x.playerFleets);
      }
      // Przywróć DiscoverySystem
      if (c4x.discoverySystem) {
        this.discoverySystem.restore(c4x.discoverySystem);
      }
      // Przywróć RandomEventSystem
      if (c4x.randomEventSystem) {
        this.randomEventSystem.restore(c4x.randomEventSystem);
      }
      // Przywróć ObservatorySystem
      if (c4x.observatorySystem) {
        this.observatorySystem.restore(c4x.observatorySystem);
      }
      // Przywróć OrbitalSpaceSystem (sferyczne orbity wszystkich obiektów)
      if (c4x.orbitalSpace) {
        this.orbitalSpaceSystem.restore(c4x.orbitalSpace);
      }
      // Przywróć StationSystem (encje stacji — orbita już przywrócona wyżej).
      // PO orbitalSpace.restore: emit station:created widzi gotową orbitę.
      if (c4x.stationSystem) {
        this.stationSystem.restore(c4x.stationSystem);
      }
      // Przywróć EventLogSystem (zunifikowany dziennik — Opcja B)
      if (c4x.eventLog) {
        this.eventLogSystem.restore(c4x.eventLog);
      }
      if (c4x.notificationCenter) {
        this.notificationCenter.restore(c4x.notificationCenter);
      }
      // Przywróć ProductionRequestBoard (zlecenia produkcyjne cross-colony)
      if (c4x.productionRequestBoard) {
        this.productionRequestBoard.restore(c4x.productionRequestBoard);
      }
      // Przywróć CollisionForecast
      if (c4x.collisionForecast) {
        this.collisionForecast.restore(c4x.collisionForecast);
      }
      // Przywróć GroundUnitManager
      if (c4x.groundUnitManager) {
        this.groundUnitManager.restore(c4x.groundUnitManager);
      }
      // Przywróć ArmySystem (Paradox-style grupy)
      if (c4x.armySystem) {
        this.armySystem.restore(c4x.armySystem);
      }
      // Przywróć AnomalyEffectSystem (planet modifiers)
      if (c4x.anomalyEffectSystem) {
        this.anomalyEffectSystem.restore(c4x.anomalyEffectSystem);
      }
      // Walidacja misji — teraz VesselManager jest przywrócony, można sprawdzić statki
      this.expeditionSystem.validateMissions();
      // Przywróć TradeLog
      if (c4x.tradeLog) {
        this.tradeLog.restore(c4x.tradeLog);
      }
      // Przywróć EconomyHistoryLog (historia wykresów produkcji/konsumpcji)
      if (c4x.economyHistory) {
        this.economyHistoryLog.restore(c4x.economyHistory);
      }
      // Migracja starych save: fleet[] ze stringami → vessel instances
      this._migrateStringFleets();
      if (c4x.civ?.unrestActive) {
        this.buildingSystem._civPenalty = 0.7;
        this.buildingSystem._reapplyAllRates();
      }
      // Przywróć StarSystemManager (wieloukładowy save)
      if (c4x.starSystemManager) {
        this.starSystemManager.restore(c4x.starSystemManager);
      }
      // Przywróć LeaderSystem
      if (c4x.leaderSystem) {
        this.leaderSystem.restore(c4x.leaderSystem);
      }
      // Przywróć FactionSystem
      if (c4x.factionSystem) {
        this.factionSystem.restore(c4x.factionSystem);
      }
      // Legacy heal: save'y sprzed fixu ResearchSystem emitCompletionHooks mogą mieć
      // kronika_lokalizacji zbadane ale FactionSystem wciąż zablokowany — bo stary
      // ResearchSystem pomijał hooki i narrative:earthLocated nigdy nie leciało.
      // Dodatkowo: Power Test save'y nie mają przypisanego lidera → pusta sekcja LIDER
      // i błędny stan frakcji po unlocku. setTimeout(0) odkłada na po rejestracji handlerów.
      setTimeout(() => {
        if (this.techSystem.isResearched('kronika_lokalizacji') && this.factionSystem.isLocked) {
          EventBus.emit('narrative:earthLocated');
        }
        if (!this.leaderSystem.activeLeader) {
          const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
          this.leaderSystem.setLeaderNoFaction('yara_osei', gameYear);
          // Frakcje już odblokowane (np. bo wcześniej poleciał earth_located bez lidera)
          // — przypisz frakcję nowego lidera, inaczej LeaderSystem.activeFaction zostanie null.
          if (!this.factionSystem.isLocked) {
            const leader = LEADERS['yara_osei'];
            this.leaderSystem.assignFaction(leader?.hidden_faction ?? 'confederates');
          }
        }
      }, 0);
      // Faza D3: Przywróć DysonSystem
      if (c4x.dysonSystem) {
        this.dysonSystem.restore(c4x.dysonSystem);
      }
      // Auto-pauza: przywróć ustawienia (master + per-kategoria)
      if (c4x.autoPause) {
        this.autoPauseSystem.restore(c4x.autoPause);
      }
      // Przywróć ScheduledEventSystem (zaplanowane zdarzenia)
      if (c4x.scheduledEventSystem) {
        this.scheduledEventSystem.restore(c4x.scheduledEventSystem);
      }
    }

    // Faza C4: nowa gra — ustaw lidera BEZ frakcji (frakcje odblokowują się
    // dopiero gdy koloniści odkryją gdzie jest Ziemia, później w trakcie gry)
    if (!savedData && window.KOSMOS.selectedLeader) {
      this.leaderSystem.setLeaderNoFaction(window.KOSMOS.selectedLeader, 0);
    }

    // ── Spawn rovera po postawieniu stolicy (nowa gra) ─────────
    this._initRoverSpawnListener();

    // ── PlanetScene (mapa hex) ─────────────────────────────────
    const planetCanvas = document.getElementById('planet-canvas');
    this.planetScene   = new PlanetScene(planetCanvas, this.timeSystem);

    // ── Nawigacja do kolonii → ColonyOverlay ─────────────────────
    EventBus.on('planet:colonize', ({ planet }) => {
      this._setupColony(planet);
      this.colonyManager.switchActiveColony(planet.id);
      this.uiManager?.overlayManager?.openPanel('colony');
    });
    EventBus.on('planet:openMap', ({ planet }) => {
      this.colonyManager.switchActiveColony(planet.id);
      this.uiManager?.overlayManager?.openPanel('colony');
    });
    EventBus.on('planet:openGlobe', ({ planet }) => {
      this.colonyManager.switchActiveColony(planet.id);
      this.uiManager?.overlayManager?.openPanel('colony');
    });
    // Podgląd powierzchni ciała przeanalizowanego (analyzed), ale NIE skolonizowanego.
    // Read-only — ColonyOverlay w trybie podglądu (bez switchActiveColony; ciało nie ma kolonii).
    EventBus.on('planet:previewMap', ({ planet }) => {
      this.uiManager?.overlayManager?.openPanel('colony', { previewPlanet: planet });
    });
    EventBus.on('colony:founded', ({ colony }) => {
      // Kolonie imperiów AI NIE otwierają panelu graczowi — to przeciek szczegółów przeciwnika.
      if (!ColonyManager.isPlayerColony(colony)) return;
      this.colonyManager.switchActiveColony(colony.planetId);
      this.uiManager?.overlayManager?.openPanel('colony');
    });
    EventBus.on('outpost:founded', ({ colony }) => {
      if (!ColonyManager.isPlayerColony(colony)) return;
      this.colonyManager.switchActiveColony(colony.planetId);
      this.uiManager?.overlayManager?.openPanel('colony');
    });

    // Kolizja — akrecja nowej planety z ThreeRenderer (EventBus obsługuje wewnątrz)
    EventBus.on('accretion:newPlanet', (planet) => {
      // ThreeRenderer subskrybuje 'accretion:newPlanet' samodzielnie
    });

    // ── Faza 5: cinematic BattleView3D po rozstrzygnięciu bitwy ──
    this._battleView3D = null;  // leniwa inicjalizacja
    this._battleQueue = [];     // bitwy oczekujące w kolejce (żeby nie nakładały się)
    this._battleShowing = false;

    // Faza 6: powiadomienie o utracie kolonii (inwazja zakończona sukcesem obcego)
    EventBus.on('colony:captured', ({ planetId, colonyName, newOwner, wasHomePlanet }) => {
      if (!window.KOSMOS?.civMode) return;
      const emp = window.KOSMOS?.empireRegistry?.get(newOwner);
      const empName = emp?.name ?? newOwner;
      const msg = wasHomePlanet
        ? `⚠ STOLICA ZDOBYTA!\nPlaneta "${colonyName}" przeszła pod kontrolę imperium ${empName}.\n\nZnajdź jakąś drogę powrotu…`
        : `⚠ Kolonia utracona!\nPlaneta "${colonyName}" zajęta przez ${empName}.`;
      // Simple DOM alert przez MessageQueue później; na razie popup
      setTimeout(() => {
        try { alert(msg); } catch { /* ignore */ }
      }, 100);
    });

    // Faza 6: przejęcie kolonii/placówki AI przez gracza (desant zakończony sukcesem)
    EventBus.on('colony:capturedByPlayer', ({ planetId }) => {
      if (!window.KOSMOS?.civMode) return;
      this.colonyManager.switchActiveColony(planetId);
    });

    EventBus.on('battle:resolved', ({ warId, battleId, result }) => {
      // Tylko gdy civMode aktywny i gracz bierze udział
      if (!window.KOSMOS?.civMode) return;
      if (!result) return;

      let battleData = null;

      if (warId) {
        // ── Path A: legacy war-driven battle ───────────────────────────────
        const war = window.KOSMOS?.warSystem?.getWar(warId);
        if (!war) return;
        if (war.aggressor !== 'player' && war.defender !== 'player') return;

        const playerSide = result?.participantB?.type === 'player' ? 'B' : 'A';
        const empireId = war.aggressor === 'player' ? war.defender : war.aggressor;
        const emp = window.KOSMOS?.empireRegistry?.get(empireId);

        battleData = {
          warId, battleId, result,
          aggressorName:     war.aggressor === 'player' ? 'Gracz' : (emp?.name ?? 'Obcy'),
          defenderName:      war.defender  === 'player' ? 'Gracz' : (emp?.name ?? 'Obcy'),
          aggressorArchetype: emp?.archetype,
          playerSide,
        };
      } else {
        // ── Path B: VCS deep-space battle ──────────────────────────────────
        // participant.type='vessel_group', empireId na obu stronach.
        const pA = result.participantA;
        const pB = result.participantB;
        if (!pA || !pB) return;
        const aIsPlayer = pA.empireId === 'player';
        const bIsPlayer = pB.empireId === 'player';
        if (!aIsPlayer && !bIsPlayer) return; // M2a: empire↔empire deferred do M3

        const playerSide = aIsPlayer ? 'A' : 'B';
        const foeEmpireId = aIsPlayer ? pB.empireId : pA.empireId;
        const emp = window.KOSMOS?.empireRegistry?.get(foeEmpireId);
        const reg = window.KOSMOS?.empireRegistry;

        battleData = {
          warId: null, battleId, result,
          source: 'dscs',  // Slice 1 — walka deep-space na żywej mapie (retire kina)
          aggressorName:      aIsPlayer ? 'Gracz' : (reg?.get(pA.empireId)?.name ?? pA.label ?? 'Obcy'),
          defenderName:       bIsPlayer ? 'Gracz' : (reg?.get(pB.empireId)?.name ?? pB.label ?? 'Obcy'),
          aggressorArchetype: emp?.archetype,
          playerSide,
        };
      }

      this._battleQueue.push(battleData);
      this._tryShowNextBattle();
    });

    // Wpis do EventLoga dla KAŻDEJ bitwy (także obcy-vs-obcy w przyszłości).
    // Niezależny od cinematic/queue powyżej — trwały ślad dla gracza.
    //
    // Dwupasmowy: legacy war-path (WarSystem/EAH) vs VCS deep-space
    // (warId=null, participantX.type='vessel_group'). Obie ścieżki dają wpis
    // o tym samym schemacie — gracz ma trwały ślad nawet bez wojny formalnej.
    EventBus.on('battle:resolved', ({ warId, result }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog || !result) return;

      const reg = window.KOSMOS?.empireRegistry;
      const loc = normalizeBattleLocation(result.location);
      const sysId = loc.systemId;
      const homeSys = window.KOSMOS?.homePlanet?.systemId ?? 'sys_home';

      let aName, dName, playerInvolved, playerSide, sysLabel;

      if (warId) {
        // ── Path A: legacy war-driven battle ───────────────────────────────
        const war = window.KOSMOS?.warSystem?.getWar(warId);
        if (!war) return;
        aName = war.aggressor === 'player' ? 'Gracz' : (reg?.get(war.aggressor)?.name ?? war.aggressor);
        dName = war.defender  === 'player' ? 'Gracz' : (reg?.get(war.defender)?.name  ?? war.defender);
        playerInvolved = (war.aggressor === 'player' || war.defender === 'player');
        playerSide = result.participantB?.type === 'player' ? 'B' : 'A';
        sysLabel = sysId === homeSys
          ? (window.KOSMOS?.homePlanet?.name ?? 'dom')
          : (sysId ?? '?');
      } else {
        // ── Path B: VCS deep-space battle ──────────────────────────────────
        const pA = result.participantA;
        const pB = result.participantB;
        if (!pA || !pB) return;
        const aIsPlayer = pA.empireId === 'player';
        const bIsPlayer = pB.empireId === 'player';
        playerInvolved = aIsPlayer || bIsPlayer;
        if (!playerInvolved) return; // M2a: VCS zawsze ma gracza; filtr przyszłościowy
        playerSide = aIsPlayer ? 'A' : 'B';
        aName = aIsPlayer ? 'Gracz' : (reg?.get(pA.empireId)?.name ?? pA.label ?? pA.empireId);
        dName = bIsPlayer ? 'Gracz' : (reg?.get(pB.empireId)?.name ?? pB.label ?? pB.empireId);
        // Deep-space zawsze ma point → "w głębokim kosmosie (system)"
        sysLabel = isDeepSpaceBattle(loc)
          ? `głębokim kosmosie (${sysId === homeSys ? (window.KOSMOS?.homePlanet?.name ?? 'dom') : sysId})`
          : (sysId === homeSys ? (window.KOSMOS?.homePlanet?.name ?? 'dom') : (sysId ?? '?'));
      }

      const winnerLabel = result.winner === 'A' ? aName
        : result.winner === 'B' ? dName
        : '—';

      const playerWon = playerInvolved && (result.winner === playerSide);
      const severity = !playerInvolved ? 'info'
        : result.winner === 'draw' ? 'warn'
        : playerWon ? 'info'
        : 'alert';

      // Adnotacja retreat — minimum UX dla VCS (gracz musi wiedzieć że statek wycofał się z bitwy)
      let retreatNote = '';
      if (result.retreated === playerSide) retreatNote = ' Gracz wycofał się.';
      else if (result.retreated && result.retreated !== playerSide) retreatNote = ' Wróg wycofał się.';

      evtLog.push({
        text:      `⚔ Bitwa w ${sysLabel}: ${aName} vs ${dName}. Zwycięzca: ${winnerLabel}. Straty: ${Math.round(result.lossesA ?? 0)}/${Math.round(result.lossesB ?? 0)}, ${result.turns ?? 0} tur.${retreatNote}`,
        channel:   'combat',
        severity,
        entityRef: sysId ?? null,
      });
    });

    // M2b Commit 2 — IntelSystem vessel contact EventLog (lekcja L3 z M2a:
    // UI w tym samym commicie co system emitujący — zapobiega silent skip)
    EventBus.on('intel:vesselContactChanged', ({ vesselId, oldQuality, newQuality, reason }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog) return;
      // Reforma detekcji — loguj WYŁĄCZNIE ujawnienie tożsamości (contact+). Fog-of-war:
      // rumor = anonim „?" (nazwa zakazana; po fixie _isPlayerVessel proximity gracza emituje
      // teraz rumor — bez tej bramki ujawniałby nazwę). Pierwsze wykrycie rumor loguje osobno
      // ObservatorySystem (anonimowo). Skan obserwatorium → NotificationCenter (bogatszy wpis,
      // unik duplikatu).
      if (newQuality !== 'contact' && newQuality !== 'detailed') return;
      if (reason === 'observatory_scan') return;
      const vessel = window.KOSMOS?.vesselManager?.getVessel(vesselId);
      const label = vessel?.name ?? vesselId;
      evtLog.push({
        text:      `Wykryto obcy statek (${newQuality}): ${label}`,
        channel:   'intel',
        severity:  'info',
        entityRef: vesselId,
      });
    });

    EventBus.on('intel:vesselContactLost', ({ vesselId, lastKnownPosition, reason }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog) return;
      const vessel = window.KOSMOS?.vesselManager?.getVessel(vesselId);
      const label = vessel?.name ?? vesselId;
      const pos = lastKnownPosition
        ? `[${Math.round(lastKnownPosition.x)},${Math.round(lastKnownPosition.y)}]`
        : '[unknown]';
      evtLog.push({
        text:      `Utracono kontakt z ${label}: ostatnia pozycja ${pos}`,
        channel:   'intel',
        severity:  'warn',
        entityRef: vesselId,
      });
    });

    // M2b Commit 5 — POI lifecycle EventLog (channel 'intel' — POI to lokacje strategiczne).
    // poi:deleted payload zawiera `name` (D1: capture w POIRegistry.deletePOI PRZED mutation
    // — subscriber EventLog nie może odczytać name post-fact bo POI już zniknął z gameState).
    EventBus.on('poi:created', ({ poi }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog) return;
      evtLog.push({
        text:      `Utworzono POI ${poi.type} '${poi.name}'`,
        channel:   'intel',
        severity:  'info',
      });
    });

    EventBus.on('poi:deleted', ({ poiId, name }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog) return;
      evtLog.push({
        text:      `Usunięto POI '${name ?? poiId}'`,
        channel:   'intel',
        severity:  'info',
      });
    });

    // M2b C6 — vessel POI navigation events (channel 'fleet' — akcje statku).
    EventBus.on('vessel:goToPOIIssued', ({ vesselId, poiId }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog) return;
      const vessel = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      const poi = window.KOSMOS?.poiRegistry?.getPOI?.(poiId);
      const vLabel = vessel?.name ?? vesselId;
      const pLabel = poi?.name ?? poiId;
      evtLog.push({
        text:      `${vLabel} → POI '${pLabel}'`,
        channel:   'fleet',
        severity:  'info',
        entityRef: vesselId,
      });
    });

    EventBus.on('vessel:patrolStarted', ({ vesselId, poiId }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog) return;
      const vessel = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      const vLabel = vessel?.name ?? vesselId;
      let text;
      if (poiId) {
        const poi = window.KOSMOS?.poiRegistry?.getPOI?.(poiId);
        const pLabel = poi?.name ?? poiId;
        const wpCount = poi?.waypoints?.length ?? '?';
        text = `${vLabel} rozpoczyna patrol '${pLabel}' (${wpCount} waypoints)`;
      } else {
        text = `${vLabel} rozpoczyna patrol manualny`;
      }
      evtLog.push({ text, channel: 'fleet', severity: 'info', entityRef: vesselId });
    });

    EventBus.on('vessel:patrolWaypointReached', ({ vesselId, waypointIndex }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog) return;
      const vessel = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      const total = vessel?.movementOrder?.patrolRoute?.length ?? '?';
      const vLabel = vessel?.name ?? vesselId;
      evtLog.push({
        text:      `${vLabel} osiągnął waypoint ${waypointIndex + 1}/${total}`,
        channel:   'fleet',
        severity:  'info',
        entityRef: vesselId,
      });
    });

    // M2b C7 — escort lifecycle EventLog (channel 'fleet').
    EventBus.on('vessel:escortStarted', ({ vesselId, escorteeId }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog) return;
      const vMgr = window.KOSMOS?.vesselManager;
      const v = vMgr?.getVessel?.(vesselId);
      const e = vMgr?.getVessel?.(escorteeId);
      const vLabel = v?.name ?? vesselId;
      const eLabel = e?.name ?? escorteeId;
      evtLog.push({
        text:      `${vLabel} eskortuje ${eLabel}`,
        channel:   'fleet',
        severity:  'info',
        entityRef: vesselId,
      });
    });

    EventBus.on('vessel:escortLost', ({ vesselId, reason }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog) return;
      const vessel = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      const vLabel = vessel?.name ?? vesselId;
      const reasonText = reason === 'escortee_lost' ? 'cel utracony' : reason;
      evtLog.push({
        text:      `${vLabel} przerwał eskortę: ${reasonText}`,
        channel:   'fleet',
        severity:  'warn',
        entityRef: vesselId,
      });
    });

    // Powiadomienia o zdarzeniach losowych — popup DATASHEET
    EventBus.on('randomEvent:occurred', ({ event, colonyName }) => {
      const severity = event.severity === 'danger' ? 'danger' : 'info';
      const eventName = t(`event.${event.id}.name`) !== `event.${event.id}.name`
        ? t(`event.${event.id}.name`) : (event.namePL ?? event.id);
      const eventDesc = t(`event.${event.id}.desc`) !== `event.${event.id}.desc`
        ? t(`event.${event.id}.desc`) : (event.descriptionPL ?? event.description ?? '');
      const isPL = getLocale() !== 'en';

      let stats = '';
      stats += formatStatLine(t('eventChoice.colony'), colonyName);
      if (event.duration > 0) {
        stats += formatStatLine(t('eventChoice.time'), t('eventChoice.duration', event.duration), 'at-stat-neu');
      }
      const prosperityFx = event.effects?.find(fx => fx.type === 'prosperity');
      if (prosperityFx) {
        const sign = prosperityFx.delta > 0 ? '+' : '';
        const cls = prosperityFx.delta > 0 ? 'at-stat-pos' : 'at-stat-neg';
        stats += formatStatLine(t('eventChoice.prosperity'), `${sign}${prosperityFx.delta}`, cls);
      }
      stats += formatStatLineWithCursor(t('eventChoice.statusLabel'), t('eventChoice.active'), 'at-stat-neu');

      EventBus.emit('time:pause');
      const svgKey = severity === 'danger' ? 'alert' : 'report';
      const { overlay, dismiss, btnElements } = buildScheduledEventPopup({
        severity,
        svgKey,
        headline:    eventName.toUpperCase(),
        description: eventDesc,
        contentHTML: stats,
        gameYear:    window.KOSMOS?.timeSystem?.gameTime ?? 0,
        buttons: [{ label: isPL ? '[ENTER] Rozumiem' : '[ENTER] Understood', primary: true }],
        onDismiss: () => EventBus.emit('time:resume'),
      });
      btnElements[0]?.addEventListener('click', () => dismiss());
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
    });

    // Prognoza kolizji — alert z obserwatorium (isHomePlanet = dowolna kolonia gracza)
    EventBus.on('observatory:collisionAlert', ({ bodyA, bodyB, yearsUntil, margin, isHomePlanet }) => {
      if (isHomePlanet) {
        this.timeSystem?.pause();
        const nameA = bodyA.name ?? '?';
        const nameB = bodyB.name ?? '?';
        this.uiManager?.addInfo(`🔭 ${t('log.collisionForecastHome', nameA, nameB, Math.round(yearsUntil), margin)}`);
      }
    });

    // Ostrzeżenie obserwatorium — zbliżające się zdarzenie
    EventBus.on('randomEvent:warning', ({ event, colonyName, yearsUntil }) => {
      const name = t(`event.${event.id}.name`) !== `event.${event.id}.name`
        ? t(`event.${event.id}.name`) : (event.namePL ?? event.id);
      this.uiManager?.addInfo(`🔭 ${t('log.observatoryWarning', event.icon ?? '⚠', name, colonyName, yearsUntil)}`);
    });
    // Zdarzenie zablokowane przez obronę
    EventBus.on('randomEvent:blocked', ({ event, colonyName }) => {
      const name = t(`event.${event.id}.name`) !== `event.${event.id}.name`
        ? t(`event.${event.id}.name`) : (event.namePL ?? event.id);
      this.uiManager?.addInfo(`🛡 ${name} — ${t('eventChoice.blocked')} [${colonyName}]`);
    });

    // Pierwsze wykrycie wrogiej jednostki — popup DATASHEET z pauzą
    EventBus.on('vessel:firstSighting', ({ vessel, empireId, empireName }) => {
      if (!vessel) return;
      const isPL = getLocale() !== 'en';
      const mission = vessel.mission;
      const currentYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      const home = window.KOSMOS?.homePlanet;

      // Typ kadłuba czytelnie (namePL/nameEN z HullsData, fallback shipId)
      const hullId = vessel.shipId ?? vessel.hullId ?? '?';
      const hullDef = HULLS[hullId] ?? null;
      const hullName = hullDef?.namePL ?? hullDef?.nameEN ?? hullId;

      // Dystans od homePlanet
      let distAU = null;
      if (home) {
        const dx = (home.x ?? 0) - (vessel.position?.x ?? 0);
        const dy = (home.y ?? 0) - (vessel.position?.y ?? 0);
        distAU = Math.sqrt(dx * dx + dy * dy) / GAME_CONFIG.AU_TO_PX;
      }

      // ETA — jeśli statek ma misję attack, wylicz lata do arrivalYear
      const etaYears = (mission?.arrivalYear != null)
        ? Math.max(0, mission.arrivalYear - currentYear)
        : null;

      // Cel misji — nazwa planety docelowej
      let targetName = null;
      if (mission?.targetId) {
        const target = EntityManager.get(mission.targetId);
        targetName = target?.name ?? mission.targetName ?? mission.targetId;
      }

      // Fog-of-war tożsamości: detekcja obserwatorium = poziom 'rumor' (pozycja bez tożsamości).
      // Popup pierwszego wykrycia pokazuje pełne dane (nazwa/imperium/kadłub/misja/ETA) DOPIERO
      // przy intel ≥ contact (bliskie spotkanie proximity). Inaczej anonimowy alert „niezident.".
      const intelQ = window.KOSMOS?.intelSystem?.getVesselContact?.(vessel.id)?.quality ?? 'unknown';
      const identified = (intelQ === 'contact' || intelQ === 'detailed');

      let stats = '';
      if (identified) {
        stats += formatStatLine(isPL ? 'Jednostka'  : 'Unit',     vessel.name ?? '?');
        stats += formatStatLine(isPL ? 'Imperium'   : 'Empire',   empireName ?? '?');
        stats += formatStatLine(isPL ? 'Kadłub'     : 'Hull',     hullName);
        if (distAU != null) {
          stats += formatStatLine(isPL ? 'Odległość' : 'Distance', `${distAU.toFixed(2)} AU`);
        }
        if (mission?.type === 'attack') {
          stats += formatStatLine(isPL ? 'Misja' : 'Mission', isPL ? 'ATAK' : 'ATTACK', 'at-stat-neg');
          if (targetName) {
            stats += formatStatLine(isPL ? 'Cel'   : 'Target', targetName);
          }
          if (etaYears != null) {
            stats += formatStatLine(
              isPL ? 'ETA' : 'ETA',
              `${etaYears.toFixed(2)} ${isPL ? 'lat' : 'yr'}`,
              'at-stat-neg'
            );
          }
        } else {
          stats += formatStatLine(isPL ? 'Stan' : 'State', vessel.position?.state ?? '?');
        }
      } else {
        // Anonimowy: ujawniamy tylko to, co daje radar — pozycję (dystans), bez tożsamości.
        stats += formatStatLine(isPL ? 'Jednostka' : 'Unit', isPL ? 'Niezidentyfikowana' : 'Unidentified');
        if (distAU != null) {
          stats += formatStatLine(isPL ? 'Odległość' : 'Distance', `${distAU.toFixed(2)} AU`);
        }
        stats += formatStatLine(isPL ? 'Intel' : 'Intel', isPL ? 'Brak identyfikacji — zbliż statek' : 'No ID — close in to identify');
      }
      stats += formatStatLineWithCursor(
        isPL ? 'ZAGROŻENIE' : 'THREAT',
        isPL ? 'AKTYWNE'    : 'ACTIVE',
        'at-stat-neg'
      );

      // M4 P1 fix — najpierw auto-slow do 1d/s, potem pauza. Po dismiss czas wraca
      // na 1d/s (nie na poprzedni multiplier, np. 1r/s). _triggerAutoSlow zapamiętuje
      // multiplier=1 zanim pause go zamrozi → resume kontynuuje na slow.
      const ts = window.KOSMOS?.timeSystem;
      if (ts?._triggerAutoSlow) {
        try { ts._triggerAutoSlow(t('log.autoSlowEnemyDetected')); } catch (e) { /* defensive */ }
      }
      EventBus.emit('time:pause');
      const headline = identified
        ? (isPL ? '⚔ WYKRYTO WROGĄ JEDNOSTKĘ' : '⚔ ENEMY UNIT DETECTED')
        : (isPL ? '⚠ NIEZIDENTYFIKOWANY KONTAKT' : '⚠ UNIDENTIFIED CONTACT');
      const desc = identified
        ? (isPL
            ? `Systemy obserwatorium wykryły obcy statek w naszym układzie. Analizuj dane, rozważ odpowiedź.`
            : `Observatory detected an alien vessel in our system. Analyze intel, consider response.`)
        : (isPL
            ? `Obserwatorium wykryło kontakt w naszym układzie — znamy tylko pozycję. Zbliż statek, by zidentyfikować.`
            : `Observatory detected a contact in our system — position only. Bring a vessel closer to identify.`);
      const { overlay, dismiss, btnElements } = buildScheduledEventPopup({
        severity:    'danger',
        svgKey:      'alert',
        headline,
        description: desc,
        contentHTML: stats,
        gameYear:    currentYear,
        buttons: [{ label: isPL ? '[ENTER] Rozumiem' : '[ENTER] Understood', primary: true }],
        onDismiss: () => EventBus.emit('time:resume'),
      });
      btnElements[0]?.addEventListener('click', () => dismiss());
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
    });

    // Powiadomienia o uderzeniach kosmicznych — popup DATASHEET
    EventBus.on('impact:colonyDamage', (data) => {
      const { severity, planetName, popLost, buildingsDestroyed, resourceLossPercent, popRemaining } = data;
      const isPL = getLocale() !== 'en';
      const impactTitles = {
        light:      isPL ? 'Lekki impakt'        : 'Minor impact',
        moderate:   isPL ? 'Umiarkowany impakt'   : 'Moderate impact',
        heavy:      isPL ? 'Poważny impakt'       : 'Major impact',
        extinction: isPL ? 'Katastrofalny impakt' : 'Catastrophic impact',
      };
      const title = impactTitles[severity] ?? impactTitles.moderate;

      let stats = '';
      stats += formatStatLine(isPL ? 'Kolonia' : 'Colony', planetName ?? '?');
      if (popLost > 0) stats += formatStatLine(isPL ? 'Populacja' : 'Population', `−${popLost} (${popRemaining ?? '?'})`, 'at-stat-neg');
      if (buildingsDestroyed > 0) stats += formatStatLine(isPL ? 'Budynki' : 'Buildings', `−${buildingsDestroyed}`, 'at-stat-neg');
      if (resourceLossPercent > 0) stats += formatStatLine(isPL ? 'Zasoby' : 'Resources', `−${resourceLossPercent}%`, 'at-stat-neg');
      stats += formatStatLineWithCursor('STATUS', severity === 'extinction' ? 'EXTINCTION' : 'CRITICAL', 'at-stat-neg');

      EventBus.emit('time:pause');
      const { overlay, dismiss, btnElements } = buildScheduledEventPopup({
        severity:    'danger',
        svgKey:      'impact',
        headline:    title.toUpperCase(),
        description: isPL ? 'Obiekt kosmiczny uderzył w planetę kolonii.' : 'A cosmic object struck the colony planet.',
        contentHTML: stats,
        gameYear:    window.KOSMOS?.timeSystem?.gameTime ?? 0,
        buttons: [{ label: isPL ? '[ENTER] Przyjąłem' : '[ENTER] Acknowledged', primary: true }],
        onDismiss: () => EventBus.emit('time:resume'),
      });
      btnElements[0]?.addEventListener('click', () => dismiss());
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
    });

    // Ruchy spoleczne — popup DATASHEET z 3 opcjami
    EventBus.on('civ:movementStarted', (data) => {
      const { movementId, namePL, nameEN, demands, strength } = data;
      const isPL = getLocale() !== 'en';
      const title = isPL ? namePL : (nameEN ?? namePL);
      const demandList = (demands ?? []).map(d => `• ${d}`).join('<br>');
      let stats = '';
      stats += formatStatLine(isPL ? 'Siła' : 'Strength', `${Math.round(strength * 100)}%`, 'at-stat-neg');
      stats += formatSectionTitle(isPL ? 'ŻĄDANIA' : 'DEMANDS');
      stats += `<div style="padding:4px 8px;font-size:12px;color:${THEME.textSecondary}">${demandList}</div>`;

      EventBus.emit('time:pause');
      const { overlay, dismiss, btnElements } = buildScheduledEventPopup({
        severity:    'danger',
        svgKey:      'alert',
        headline:    title.toUpperCase(),
        description: isPL
          ? 'Robotnicy żądają zmian. Wybierz odpowiedź ostrożnie.'
          : 'Workers are demanding change. Choose your response carefully.',
        contentHTML: stats,
        gameYear:    window.KOSMOS?.timeSystem?.gameTime ?? 0,
        buttons: [
          { label: isPL ? 'Negocjuj' : 'Negotiate', primary: true },
          { label: isPL ? 'Stłum'    : 'Suppress' },
          { label: isPL ? 'Ignoruj'  : 'Ignore' },
        ],
        onDismiss: () => EventBus.emit('time:resume'),
      });
      const resMap = ['negotiate', 'suppress', 'ignore'];
      btnElements.forEach((btn, i) => {
        btn.addEventListener('click', () => {
          EventBus.emit('civ:resolveMovement', { movementType: movementId, resolutionId: resMap[i] });
          dismiss();
        });
      });
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
    });

    // Milestones historii kolonii — log + opcjonalnie pauza
    EventBus.on('civ:milestoneReached', ({ colonyName, milestone, crisis }) => {
      const lang = window.KOSMOS?.lang ?? 'pl';
      const name = lang === 'en' ? milestone.nameEN : milestone.namePL;
      const icon = milestone.icon ?? '●';
      this.uiManager?.addInfo(`${icon} ${colonyName}: ${name}`);
      if (crisis) {
        EventBus.emit('time:pause');
      }
    });

    // Cechy kulturowe — log
    EventBus.on('civ:traitUnlocked', ({ colonyName, trait }) => {
      const lang = window.KOSMOS?.lang ?? 'pl';
      const name = lang === 'en' ? trait.nameEN : trait.namePL;
      this.uiManager?.addInfo(`${trait.icon} ${colonyName}: ${t('eventLog.traitUnlocked') || 'Nowa cecha'} — ${name}`);
    });

    // Flaga przetrwania katastrofy — z RandomEventSystem do CivilizationSystem
    EventBus.on('randomEvent:occurred', ({ event }) => {
      if (event?.severity === 'catastrophe' || event?.severity === 'heavy') {
        const civ = window.KOSMOS?.civSystem;
        if (civ?._milestoneState) {
          civ._milestoneState.justSurvivedDisaster = true;
        }
      }
    });

    // Popup: anomalia odkryta przez rovera
    EventBus.on('anomaly:discovered', ({ anomalyDef }) => {
      if (!anomalyDef) return;
      const lang = window.KOSMOS?.lang ?? 'pl';
      const name = lang === 'en' ? anomalyDef.nameEN : anomalyDef.namePL;
      let effectDesc = lang === 'en' ? anomalyDef.effectDescEN : anomalyDef.effectDescPL;
      // Dodaj info o wymaganiu budynku dla efektów tile-level
      const eff = anomalyDef.effect;
      const TILE_TYPES = ['tile_yield_bonus', 'building_multiplier', 'build_modifier', 'passive_resource'];
      if (eff && TILE_TYPES.includes(eff.type)) {
        const hint = lang === 'en'
          ? ' (build on this hex to activate)'
          : ' (postaw budynek na tym hexie aby aktywować)';
        effectDesc += hint;
      }
      queueMissionEvent({
        severity: 'info',
        barTitle: lang === 'en' ? 'ANOMALY DISCOVERED' : 'ANOMALIA ODKRYTA',
        barRight: '',
        svgKey:   'report',
        svgLabel: `${anomalyDef.icon ?? '❓'}<br>${anomalyDef.category?.toUpperCase() ?? ''}`,
        prompt:   '> ANALYZE_',
        headline: name,
        description: anomalyDef.description ?? '',
        contentHTML: formatStatLine(lang === 'en' ? 'Effect' : 'Efekt', effectDesc ?? '—'),
        buttons: [{ label: '[ENTER] OK', primary: true }],
      });
    });

    // Popupy misji (pauza + powiadomienie)
    initMissionEvents();
    // Modal wyborów konsularnych (Poszukiwacze co 15 lat)
    initConsulElection();
    // Toast auto-pauzy (krótki komunikat 3s przy auto-pauzie)
    initAutoPauseToast();

    // ── Faza C5: narodziny frakcji — handler kronika_lokalizacji ──────────
    // TechSystem emituje narrative:earthLocated po zbadaniu kronika_lokalizacji.
    // 1) odblokuj FactionSystem (pokaż HUD, rozpocznij tickowanie tension/narrative)
    // 2) przypisz lidera do jego ukrytej frakcji
    // 3) jeśli Seekers — zmień status na Konsula (kadencja 15 lat)
    // 4) wyzwól pierwszy event narracyjny (earth_located → chain do first_voices_of_division)
    EventBus.on('narrative:earthLocated', () => {
      const facSys = window.KOSMOS?.factionSystem;
      const leaderSys = window.KOSMOS?.leaderSystem;
      if (!facSys || !leaderSys) return;

      // Already triggered? (defensywa — zapobiega podwójnemu uruchomieniu)
      if (!facSys.isLocked) return;

      facSys.unlock();

      // Defensywa: jeśli brak aktywnego lidera (Power Test bez FactionSelectScene,
      // legacy save) — przypisz domyślnego Archonta żeby sekcja LIDER nie była pusta
      // i leader.hidden_faction dało prawidłową frakcję.
      if (!leaderSys.activeLeader) {
        leaderSys.setLeaderNoFaction('yara_osei', window.KOSMOS?.timeSystem?.gameTime ?? 0);
      }

      const leaderId = leaderSys.activeLeader;
      const leader = leaderId ? LEADERS[leaderId] : null;
      const factionId = leader?.hidden_faction ?? 'confederates';
      leaderSys.assignFaction(factionId);
      if (factionId === 'seekers') {
        leaderSys.convertToConsul();
      }

      // Wyzwól event narracyjny (chain w narrative:eventTriggered)
      const event = NARRATIVE_EVENTS_BY_ID['earth_located'];
      if (event) {
        const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
        EventBus.emit('narrative:eventTriggered', { event, gameYear });
      }
    });

    // ── Faza C3+C5: handler eventów narracyjnych frakcji ─────────────────
    // FactionSystem (lub inne źródła) emitują narrative:eventTriggered.
    // choice=true  → popup DATASHEET z 2-3 buttons, efekty per event.id
    // choice=false → kolejkowany popup DATASHEET (info z OK), shift suwaka, onComplete chain
    EventBus.on('narrative:eventTriggered', ({ event, gameYear, sliderDirectionForMinority }) => {
      const isPL = getLocale() !== 'en';
      const facSys = window.KOSMOS?.factionSystem;
      if (!facSys || !event) return;

      if (event.choice) {
        // ── Modal z wyborem (2-3 opcje) ──────────────────────────────────
        EventBus.emit('time:pause');

        const isCrisis = event.id === 'faction_crisis_protest';
        const optKeys = ['optionA', 'optionB', 'optionC'];
        const optLetters = ['A', 'B', 'C'];

        const buttons = [];
        const presentOpts = [];
        for (let i = 0; i < optKeys.length; i++) {
          const opt = event[optKeys[i]];
          if (!opt) continue;
          buttons.push({
            label:   isPL ? opt.labelPL : (opt.labelEN || opt.labelPL),
            primary: i === 0,
          });
          presentOpts.push({ letter: optLetters[i], opt });
        }

        const { overlay, dismiss, btnElements } = buildScheduledEventPopup({
          severity:    event.severity ?? 'warning',
          svgKey:      event.svgKey ?? 'report',
          headline:    (isPL ? event.titlePL : event.titleEN).toUpperCase(),
          description: isPL ? event.descPL : event.descEN,
          gameYear:    window.KOSMOS?.timeSystem?.gameTime ?? 0,
          buttons,
          onDismiss: () => { EventBus.emit('time:resume'); },
        });

        btnElements.forEach((btn, idx) => {
          const { letter, opt } = presentOpts[idx];
          btn.addEventListener('click', () => {
            let baseDelta = opt.sliderDelta ?? 0;
            if (isCrisis && letter === 'A') {
              baseDelta = baseDelta * (sliderDirectionForMinority ?? -1);
            }
            if (baseDelta !== 0) {
              facSys.shiftSlider(baseDelta, `${event.id}_choice${letter}`);
            }
            this._applyNarrativeChoiceEffect(event.id, letter, facSys);
            dismiss();
          });
        });

        document.body.appendChild(overlay);
        requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });

      } else {
        // ── Event informacyjny (kolejkowany popup z OK) ───────────────────
        if (event.sliderDelta) {
          facSys.shiftSlider(event.sliderDelta, event.id);
        }
        queueMissionEvent({
          severity:    event.severity ?? 'info',
          svgKey:      event.svgKey ?? 'report',
          headline:    (isPL ? event.titlePL : event.titleEN).toUpperCase(),
          description: isPL ? event.descPL : event.descEN,
          buttons: [{ label: isPL ? '[ENTER] Rozumiem' : '[ENTER] Understood', primary: true }],
        });

        // Faza C5: chain handler dla onComplete
        if (event.onComplete === 'faction_birth') {
          const next = NARRATIVE_EVENTS_BY_ID['first_voices_of_division'];
          if (next) {
            EventBus.emit('narrative:eventTriggered', {
              event:    next,
              gameYear: window.KOSMOS?.timeSystem?.gameTime ?? 0,
            });
          }
        } else if (event.onComplete === 'show_faction_assignment') {
          const leaderSys = window.KOSMOS?.leaderSystem;
          const lId = leaderSys?.activeLeader;
          const lData = lId ? LEADERS[lId] : null;
          const fId = leaderSys?.activeFaction;
          const factionLabel = isPL
            ? (fId === 'confederates' ? 'Konfederaci Misji' : (fId === 'seekers' ? 'Poszukiwacze Drogi' : '—'))
            : (fId === 'confederates' ? 'Confederation of the Mission' : (fId === 'seekers' ? 'Seekers of the Way' : '—'));
          queueMissionEvent({
            severity:    'info',
            svgKey:      'colony',
            headline:    `${(lData?.namePL ?? '?').toUpperCase()} — ${factionLabel.toUpperCase()}`,
            description: isPL
              ? 'Twój lider zajął wyraźne stanowisko. Kolonia to zauważyła.'
              : 'Your leader has taken a clear position. The colony noticed.',
            buttons: [{ label: isPL ? '[ENTER] Rozumiem' : '[ENTER] Understood', primary: true }],
          });
        }
      }
    });

    // ── Handler zaplanowanych zdarzeń (ScheduledEventSystem) ──────────────
    // Gwarantowane zdarzenie co 3-5 civYears z opcjami decyzji A/B/C.
    // WSZYSTKIE scheduled events uzywaja popupu DATASHEET (cyber-gazeta z video tlem).
    EventBus.on('scheduledEvent:triggered', ({ event, planetId }) => {
      const isPL   = getLocale() !== 'en';
      const colony = window.KOSMOS?.colonyManager?.getColony?.(planetId)
        ?? window.KOSMOS?.colonyManager?.getColony?.(window.KOSMOS?.homePlanet?.id);

      // Zastosuj karę automatyczną
      if (event.penalty) this._applyScheduledEffect(event.penalty, colony, planetId);

      // Zastosuj nagrodę bazową
      if (event.reward && Object.keys(event.reward).length > 0) {
        this._applyScheduledReward(event.reward, colony);
      }

      // Autoeffect bez opcji
      if (event.autoEffect && !event.options) {
        const effects = Array.isArray(event.autoEffect) ? event.autoEffect : [event.autoEffect];
        for (const eff of effects) {
          this._applyScheduledEffect(eff, colony, planetId);
        }
      }

      // Pauza — dla wszystkich scheduled events
      EventBus.emit('time:pause');

      // Video fallback chain: event-specific → category → default
      const vBase = 'assets/event-videos/';
      const videoSrc = [
        `${vBase}${event.id}.mp4`,
        `${vBase}${event.videoCategory ?? 'default'}.mp4`,
        `${vBase}default.mp4`,
      ];

      // Zbuduj liste opcji do wyswietlenia (opis, koszt, efekt)
      const popupOptions = event.options
        ? event.options.map(opt => ({
            label:      isPL ? opt.labelPL : opt.labelEN,
            cost:       opt.costKr ?? 0,
            effectDesc: isPL ? opt.effectPL : opt.effectEN,
          }))
        : null;

      // Przyciski
      const buttons = event.options
        ? event.options.map((opt, i) => ({
            label:   isPL ? opt.labelPL : opt.labelEN,
            primary: i === 0,
          }))
        : [{ label: isPL ? '[ENTER] Rozumiem' : '[ENTER] Understood', primary: true }];

      const { overlay, dismiss, btnElements } = buildScheduledEventPopup({
        severity:    event.severity ?? 'info',
        headline:    (isPL ? event.titlePL : event.titleEN).toUpperCase(),
        description: isPL ? event.descPL : event.descEN,
        videoSrc,
        gameYear:    window.KOSMOS?.timeSystem?.gameTime ?? 0,
        options:     popupOptions,
        buttons,
        onDismiss:   () => EventBus.emit('time:resume'),
      });

      // Podlacz logike przyciskow
      if (event.options) {
        const self = this;
        event.options.forEach((opt, i) => {
          btnElements[i]?.addEventListener('click', () => {
            if (opt.costKr > 0) {
              if ((colony?.credits ?? 0) < opt.costKr) return;
              colony.credits -= opt.costKr;
            }
            if (opt.effect) {
              const effects = Array.isArray(opt.effect) ? opt.effect : [opt.effect];
              for (const eff of effects) {
                self._applyScheduledEffect(eff, colony, planetId);
              }
            }
            dismiss();
          });
        });
      } else {
        // Brak opcji — pierwszy przycisk zamyka popup
        btnElements[0]?.addEventListener('click', () => dismiss());
      }

      document.body.appendChild(overlay);
      requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
    });

    // ── Faza D3: handlery DysonSystem ────────────────────────────────────
    // Wizualna progresja gwiazdy w 3D — DysonSystem emituje przy każdym ukończonym segmencie
    EventBus.on('dyson:visualStageChanged', ({ stage }) => {
      window.KOSMOS?.threeRenderer?.updateStarForDyson?.(stage);
    });

    // Popup po ukończeniu segmentu Sfery + faction shift
    EventBus.on('dyson:segmentCompleted', ({ segmentId, completedCount, segmentNamePL, segmentNameEN }) => {
      const isPL = getLocale() !== 'en';
      const name = isPL ? segmentNamePL : segmentNameEN;
      const fSys = window.KOSMOS?.factionSystem;
      const zone = fSys?.getCurrentZone?.() ?? 'balanced';
      const isConfederate = zone.includes('confederates');
      const factionReaction = isPL
        ? (isConfederate
            ? 'Zbudowaliśmy coś czego Ziemia nigdy nie widziała.'
            : 'Kolejny segment gotowy. Brama jest bliżej.')
        : (isConfederate
            ? 'We built something Earth has never seen.'
            : 'Another segment complete. The Gate is closer.');

      queueMissionEvent({
        severity:    'discovery',
        barTitle:    isPL ? 'SEGMENT SFERY DYSONA' : 'DYSON SPHERE SEGMENT',
        svgKey:      'discovery',
        svgLabel:    `${completedCount}/20`,
        prompt:      '> DYSON_SEGMENT.LOG_',
        headline:    `${segmentId}. ${(name ?? '').toUpperCase()}`,
        description: factionReaction,
        buttons: [{ label: isPL ? '[ENTER] Rozumiem' : '[ENTER] Understood', primary: true }],
      });

      // Brama Skoku zbliża się — slider w stronę Poszukiwaczy (-5)
      // (Konfederaci interpretują Sferę jako Type II prosperity, Seekers jako drogę powrotną)
      fSys?.shiftSlider?.(-5, 'dyson_segment_completed');

      // ── Faza D4: trigger endgame gdy segment 20 ukończony + tech zbadane ──
      if (completedCount === 20) {
        const hasJumpGate = window.KOSMOS?.techSystem?.isResearched?.('jump_gate_construction') ?? false;
        if (hasJumpGate) this._triggerEndgame();
      }
    });

    // ── Faza D4: druga ścieżka triggera — gdy tech zbadany PO ukończeniu seg 20
    EventBus.on('dyson:jumpGateUnlocked', () => {
      if (window.KOSMOS?.dysonSystem?.completedCount === 20) {
        this._triggerEndgame();
      }
    });

    // ── Faza D4: handlery sceny endgame ────────────────────────────────────
    EventBus.on('endgame:triggered', (data) => {
      const scene = new EndgameScene();
      scene.show(data);
    });

    EventBus.on('endgame:chosen', ({ ending, gameYear }) => {
      const isPL = getLocale() !== 'en';

      // Narracja epilogu per wybór
      const narratives = {
        return: {
          PL: `Po ${gameYear} latach, flota wraca. Brama Skoku otwiera się raz — i zamyka za ostatnim statkiem.\n\nCo zastają w Układzie Słonecznym? To zależy od tego jaką historię napisałeś przez te wszystkie lata.\n\nAle wrócili. Po 3000 latach i 400 pokoleniach — wrócili.`,
          EN: `After ${gameYear} years, the fleet returns. The Jump Gate opens once — and closes behind the last ship.\n\nWhat do they find in the Solar System? That depends on the history you wrote across all those years.\n\nBut they returned. After 3,000 years and 400 generations — they returned.`,
        },
        stay: {
          PL: `Energia Sfery zasila sieć bram przez cały układ. Każda kolonia oddalona o sekundy od każdej innej.\n\nNie wróciliście do Ziemi. Ale Układ stał się czymś czego Ziemia nigdy nie widziała.\n\nNie jesteście już zagubionymi kolonistami. Jesteście nową ludzkością.`,
          EN: `The Sphere's energy powers a gate network across the entire system. Every colony seconds away from every other.\n\nYou did not return to Earth. But the System became something Earth had never seen.\n\nYou are no longer lost colonists. You are a new humanity.`,
        },
        message: {
          PL: `Nadajnik galaktyczny aktywny. Sygnał niesie historię 400 000 kolonistów, ${gameYear} lat i jedną Sferę Dysona.\n\nOdpowiedź dotrze za 47 280 lat. Nikt z żyjących jej nie doczeka.\n\nMoże za 50 000 lat ktoś usłyszy. Może to wystarczy.`,
          EN: `The galactic transmitter is active. The signal carries the history of 400,000 colonists, ${gameYear} years, and one Dyson Sphere.\n\nThe reply will arrive in 47,280 years. No one alive will see it.\n\nMaybe in 50,000 years someone will hear. Maybe that is enough.`,
        },
      };
      const narrative = narratives[ending]?.[isPL ? 'PL' : 'EN']
        ?? narratives.message[isPL ? 'PL' : 'EN'];

      const headline = isPL
        ? (ending === 'return' ? 'Powrót'
         : ending === 'stay'   ? 'Nowa Ludzkość'
         : 'Wiadomość w Butelce')
        : (ending === 'return' ? 'Return'
         : ending === 'stay'   ? 'New Humanity'
         : 'Message in a Bottle');

      queueMissionEvent({
        severity:    'discovery',
        barTitle:    isPL ? 'KONIEC HISTORII' : 'END OF HISTORY',
        svgKey:      'discovery',
        svgLabel:    isPL ? 'EPILOG' : 'EPILOGUE',
        prompt:      '> END.LOG_',
        headline,
        description: narrative,
        buttons: [{
          label: isPL ? '[ENTER] Zakończ grę' : '[ENTER] End Game',
          primary: true,
          onClick: () => EventBus.emit('game:returnToTitle'),
        }],
      });

      // Zapisz wybór endgame w polu instance (do save lub statystyk)
      this._endgameChoice = ending;
    });

    // Powrót do TitleScene (najprostsze: reload strony)
    EventBus.on('game:returnToTitle', () => {
      EventBus.emit('time:pause');
      // Czyścimy save zakończonej gry — gracz wraca do menu z czystą kartą
      // (alternatywnie zostawić save jako "ukończona gra" — TODO Faza D5)
      window.location.reload();
    });

    // Popup: kolonia/placówka utracona (zniszczenie ciała niebieskiego)
    EventBus.on('colony:destroyed', ({ planetId, colonyName, reason, isOutpost, population, destroyedVesselIds }) => {
      // Zamknij ColonyOverlay (removeColony przełączyła aktywną kolonię, ale overlay jest stale)
      if (this.uiManager?.overlayManager?.isAnyOpen()) {
        this.uiManager.overlayManager.closeActive();
      }

      const reasonPL = reason === 'collision' ? t('log.planetaryCollision')
        : reason === 'ejected' ? t('log.ejectedFromSystem')
        : t('log.bodyDestroyed');

      const typeLabel = isOutpost ? t('colony.outpost') : t('colony.colony');
      const vesselCount = destroyedVesselIds?.length ?? 0;

      let stats = '';
      stats += formatStatLine(typeLabel.toUpperCase(), colonyName, 'at-stat-neg');
      stats += formatStatLine(t('colony.reason'), reasonPL, 'at-stat-neg');
      if (population > 0) {
        stats += formatStatLine('POPULACJA', `−${population} POP`, 'at-stat-neg');
      }
      if (vesselCount > 0) {
        stats += formatStatLine('STATKI', `−${vesselCount} utraconych`, 'at-stat-neg');
      }
      stats += formatStatLineWithCursor('STATUS', t('colony.irrecoverablyLost'), 'at-stat-neg');

      queueMissionEvent({
        severity: 'danger',
        barTitle: '⚠ ALARM KRYTYCZNY ⚠',
        svgKey: 'disaster',
        svgLabel: typeLabel.toUpperCase() + '<br>UTRACONA',
        prompt: '> COLONY_LOST.EXE_',
        headline: `${typeLabel.toUpperCase()}<br>UTRACONA`,
        description: `${typeLabel} ${colonyName} została bezpowrotnie utracona.`,
        contentHTML: stats,
      });
    });

    // Keyboard input (DOM)
    this._setupKeyboard();

    // M3 P1.3 — picker mode HUD banner (DOM div + cursor change subskrypcje)
    this._createPickerHUD();

    // M3 P2.3 — Create POI flow (PPM RightClickMenu → picker mode → modal pre-fill)
    this._setupPOICreateFlow();

    // Obsługa input z event layer
    this._setupMouseInput(eventLayer);

    // Nowa gra
    EventBus.on('game:new', () => { SaveSystem.clearSave(); window.location.reload(); });

    // ── Przełączenie układu — aktywuj pierwszą kolonię w nowym układzie ──
    EventBus.on('system:switched', ({ systemId, star }) => {
      const colMgr = window.KOSMOS?.colonyManager;
      if (!colMgr) return;
      const cols = colMgr.getAllColonies().filter(c => {
        const body = EntityManager.get(c.planetId);
        return body?.systemId === systemId;
      });
      if (cols.length > 0) {
        colMgr.switchActiveColony(cols[0].planetId);
      } else {
        // Brak kolonii w tym układzie — wyzeruj dane zasobów w UI
        EventBus.emit('resource:changed', {
          resources: { minerals: 0, energy: 0, organics: 0, water: 0, research: 0 },
          deltaPerYear: { minerals: 0, energy: 0, organics: 0, water: 0, research: 0 },
          inventory: {},
          invPerYear: {},
          energyFlow: { production: 0, consumption: 0, net: 0 },
        });
      }
    });

    // ── Game Over — planeta gracza zniszczona ──────────────────
    this._gameOver = false;
    const checkHomeDestroyed = (planet, reason) => {
      if (this._gameOver) return;
      if (!window.KOSMOS?.civMode || !window.KOSMOS?.homePlanet) return;
      if (planet?.id !== window.KOSMOS.homePlanet.id) return;
      this._gameOver = true;
      // Pauzuj grę
      EventBus.emit('time:pause');
      // Zamknij mapę planety / overlay jeśli otwarte
      this.uiManager?.overlayManager?.closeActive();
      if (this.planetScene?.isOpen) this.planetScene.close();
      // Wyłącz tryb 4X
      window.KOSMOS.civMode = false;
      // Emituj event game over — UIManager pokaże ekran końca gry
      EventBus.emit('game:over', { reason, planetName: planet.name });
    };

    // Safety net: entity:removed odpala się PRZED body:collision (bo EntityManager.remove() jest wywołany wcześniej)
    EventBus.on('entity:removed', ({ entity }) => {
      if (entity?.id === window.KOSMOS?.homePlanet?.id) {
        checkHomeDestroyed(entity, 'collision');
      }
    });

    // Kolizja planetarna — oba ciała tracą życie
    EventBus.on('body:collision', ({ winner, loser }) => {
      [winner, loser].forEach(p => {
        if (p?.id === window.KOSMOS?.homePlanet?.id) {
          checkHomeDestroyed(p, 'collision');
        }
      });
    });
    // Życie wymarło (np. warunki klimatyczne, kolizja)
    EventBus.on('life:extinct', ({ planet, reason }) => {
      checkHomeDestroyed(planet, reason ?? 'extinction');
    });
    // Planeta wyrzucona z układu (ejekcja orbitalna)
    EventBus.on('planet:ejected', ({ planet }) => {
      checkHomeDestroyed(planet, 'ejected');
    });

    // Populacja macierzystej planety spadła do 0 (katastrofa ekspedycji, głód, ekspozycja, zdarzenie losowe)
    EventBus.on('civ:popDied', ({ cause, population }) => {
      if (this._gameOver) return;
      if (!window.KOSMOS?.civMode || !window.KOSMOS?.homePlanet) return;
      // Sprawdź populację kolonii macierzystej (nie aktywnej kolonii — ta może być inna)
      const homePlanetId = window.KOSMOS.homePlanet.id;
      const colMgr = window.KOSMOS.colonyManager;
      const homeColony = colMgr?.getColony(homePlanetId);
      if (!homeColony) return;
      const homePop = homeColony.civSystem?.population ?? 0;
      if (homePop <= 0) {
        checkHomeDestroyed(window.KOSMOS.homePlanet, cause ?? 'population_extinct');
      }
    });

    // Focus kamery na encji (z Outlinera — klik na ekspedycję)
    EventBus.on('camera:focusTarget', ({ targetId }) => {
      if (!targetId) return;
      const entity = EntityManager.get(targetId);
      if (entity) {
        EventBus.emit('body:selected', { entity });
      }
    });

    // ── Auto-kolonizacja w scenariuszu Cywilizacja / Power Test ───────────
    // Nowa gra: intro (transmisja rządowa → nazwy) → kolonizacja → globus
    if (!savedData && this._civPlanetId) {
      const isPowerTest      = window.KOSMOS?.scenario === 'power_test';
      const isBoosted        = window.KOSMOS?.scenario === 'civilization_boosted';
      const isCombatSandbox  = window.KOSMOS?.scenario === 'combat_sandbox';

      setTimeout(async () => {
        const civPlanet = EntityManager.get(this._civPlanetId);
        if (!civPlanet) return;

        // Pauzuj grę na czas intro
        EventBus.emit('time:pause');

        // Focus kamery na planecie macierzystej + bliski zoom
        EventBus.emit('body:selected', { entity: civPlanet });
        this.cameraController._targetDist = 8;

        // COMBAT SANDBOX — testowy scenariusz M2 (player vs enemy w jednym układzie)
        if (isCombatSandbox) {
          // Domyślny lider (jak POWER TEST — bez FactionSelectScene)
          this.leaderSystem.setLeaderNoFaction('yara_osei', 0);
          try {
            loadCombatSandbox(this, civPlanet);
          } catch (err) {
            console.error('[CombatSandbox] LOAD FAILED:', err);
          }
          return;
        }

        // POWER TEST — pomijamy intro, domyślne nazwy
        if (isPowerTest) {
          // Kolonizuj planetę
          this._setupColony(civPlanet);
          // Minimalne zasoby startowe (po 100 każdego surowca + 2000 research)
          this._setupPowerTestResources();
          // Domyślny lider — Power Test pomija FactionSelectScene, więc bez tego
          // activeLeader byłby null i sekcja LIDER w UI świeciłaby pustką.
          // Yara Osei — dożywotni Archont Konfederatów.
          this.leaderSystem.setLeaderNoFaction('yara_osei', 0);
          // Power Test: wszystkie technologie odkryte od startu (ułatwia testy combat/floty)
          this.techSystem.restore({ researched: Object.keys(TECHS) });
          // Populacja 12 POP (suma popCost budynków Power Test ≈ 7.75, z marginesem)
          this.civSystem.setPopulation(12);
          // Domyślne nazwy
          window.KOSMOS.civName = 'Test Empire';
          civPlanet.name = 'Test Capital';
          const colony = this.colonyManager.getColony(civPlanet.id);
          if (colony) colony.name = 'Test Capital';
          // Flota startowa: 1× science_vessel, 1× cargo_ship
          this._spawnPowerTestFleet(civPlanet.id);
          // Generuj grid i auto-buduj
          const grid = PlanetMapGenerator.generate(civPlanet, true);
          // Ustaw gridHeight w BuildingSystem (potrzebne do modyfikatora polarnego)
          if (this.buildingSystem) this.buildingSystem._gridHeight = grid.height;
          this._autoBuildPowerTest(grid);
          // Otwórz ColonyOverlay (stolica auto-place w _openGlobe)
          this.colonyManager.switchActiveColony(civPlanet.id);
          this.uiManager?.overlayManager?.openPanel('colony');
          return;
        }

        // BOOSTED — scenariusz "Nowa Gra 2": intro → boosted budynki + 3 POP + tech
        if (isBoosted) {
          await new Promise(r => setTimeout(r, 1200));
          const { civName, capitalName } = await showIntroSequence();
          this._setupColony(civPlanet);
          window.KOSMOS.civName = civName;
          civPlanet.name = capitalName;
          const colony = this.colonyManager.getColony(civPlanet.id);
          if (colony) colony.name = capitalName;
          // Zbadaj technologie wymagane dla dodatkowych budynków
          this._setupBoostedTechs();
          // 4 POPy (3 zużyte przez budynki + 1 zapas na wzrost)
          this.civSystem.setPopulation(4);
          // Generuj grid i postaw budynki (standardowe + boosted)
          const grid = PlanetMapGenerator.generate(civPlanet, true);
          if (this.buildingSystem) this.buildingSystem._gridHeight = grid.height;
          this._autoPlaceBoostedBuildings(grid);
          this.colonyManager.switchActiveColony(civPlanet.id);
          this.uiManager?.overlayManager?.openPanel('colony');
          return;
        }

        // Czekaj na animację kamery (lerp do planety)
        await new Promise(r => setTimeout(r, 1200));

        // Sekwencja intro: transmisja rządowa → nazwa cywilizacji → nazwa stolicy
        const { civName, capitalName } = await showIntroSequence();

        // Kolonizuj planetę (bez otwierania globusa)
        this._setupColony(civPlanet);

        // Zapisz nazwy
        window.KOSMOS.civName = civName;
        civPlanet.name = capitalName;
        const colony = this.colonyManager.getColony(civPlanet.id);
        if (colony) colony.name = capitalName;

        // Generuj grid i postaw budynki startowe
        const grid = PlanetMapGenerator.generate(civPlanet, true);
        if (this.buildingSystem) this.buildingSystem._gridHeight = grid.height;
        this._autoPlaceStarterBuildings(grid);
        // Otwórz ColonyOverlay (stolica auto-place w _openGlobe)
        this.colonyManager.switchActiveColony(civPlanet.id);
        this.uiManager?.overlayManager?.openPanel('colony');
      }, 100);
    }
    // Przywrócenie civName z save
    if (savedData?.civ4x?.civName) {
      window.KOSMOS.civName = savedData.civ4x.civName;
    }

    // ── Muzyka tła ─────────────────────────────────────────────
    // Ładuj i startuj muzykę (autoplay po kliknięciu użytkownika w TitleScene)
    this.audioSystem.startMusic('game');

    // ── Pętla gry ─────────────────────────────────────────────
    // TimeSystem.update(deltaMs) emituje 'time:tick' → wszystkie systemy
    let lastTime = performance.now();
    const gameLoop = (now) => {
      const deltaMs = now - lastTime;
      lastTime = now;
      this.timeSystem.update(deltaMs);
      requestAnimationFrame(gameLoop);
    };
    requestAnimationFrame(gameLoop);
  }

  // ── Konfiguracja kolonii (wyciągnięte z planet:colonize) ───────
  // ── Faza C3+C5: per-event side effects narracyjnych wyborów ──────────
  // Wywoływane z handlera narrative:eventTriggered po kliknięciu buttona.
  // letter ∈ {'A','B','C'} — która opcja została wybrana.
  _applyNarrativeChoiceEffect(eventId, letter, facSys) {
    const prosp = window.KOSMOS?.prosperitySystem;
    const civ   = window.KOSMOS?.civSystem;

    switch (eventId) {
      // ── Faza C3 ─────────────────────────────────────────────────────
      case 'generational_winter_1':
        // Obie opcje: bonus morale 10 przez 5 lat
        prosp?.addEventBonus?.(`narrative_${eventId}_${letter}`, 10, 5);
        return;

      case 'faction_crisis_protest':
        if (letter === 'A') {
          // Ustąp mniejszości — napięcie spada (concession kalmy)
          facSys.tension = Math.max(0, facSys.tension - 30);
          facSys._narrativeCrisisFired = false;
        } else if (letter === 'B') {
          // Stłum siłą — drastyczny spadek napięcia, ale prosperity -20 / 10 lat
          facSys.tension = Math.max(0, facSys.tension - 50);
          facSys._narrativeCrisisFired = false;
          prosp?.addEventBonus?.(`narrative_${eventId}_suppress`, -20, 10);
        }
        return;

      // ── Faza C5: pierwszy sabotaż ──────────────────────────────────
      case 'first_sabotage':
        if (letter === 'A') {
          // Śledztwo — napięcie -15, prosperity -5 przez 5 lat
          facSys.tension = Math.max(0, facSys.tension - 15);
          prosp?.addEventBonus?.(`narrative_${eventId}_investigate`, -5, 5);
        } else if (letter === 'B') {
          // Amnestia — napięcie -25 ale morale -10 przez 5 lat (jako prosperity penalty)
          facSys.tension = Math.max(0, facSys.tension - 25);
          prosp?.addEventBonus?.(`narrative_${eventId}_amnesty`, -10, 5);
        }
        return;

      // ── Faza C5: groźba separacji ──────────────────────────────────
      case 'colony_separation_threat':
        if (letter === 'A') {
          // Pozwól odejść — tracisz 20% populacji, napięcie spada do 30
          const pop = civ?.population ?? 0;
          const toRemove = Math.floor(pop * 0.2);
          for (let i = 0; i < toRemove && (civ?.population ?? 0) > 1; i++) {
            civ?.removePop?.(null, 1);
          }
          if (toRemove > 0) {
            EventBus.emit('civ:popDied', { cause: 'separation', population: civ?.population ?? 0 });
          }
          facSys.tension = 30;
          facSys._crisisActive = false;
        } else if (letter === 'B') {
          // Negocjuj — napięcie -30, prosperity -10 / 10 lat
          facSys.tension = Math.max(0, facSys.tension - 30);
          facSys._crisisActive = false;
          prosp?.addEventBonus?.(`narrative_${eventId}_negotiate`, -10, 10);
        } else if (letter === 'C') {
          // Odmów — napięcie +20, ryzyko sabotażu rośnie (reset _sabotageTriggered = sabotaż znów możliwy)
          facSys.tension = Math.min(100, facSys.tension + 20);
          facSys._crisisActive = false;
          facSys._sabotageTriggered = false;
        }
        return;

      default:
        return;
    }
  }

  // ── Scheduled Events: aplikowanie efektów ──────────────────────────
  // Wywoływane z handlera scheduledEvent:triggered po wyborze opcji lub auto.

  /** Zastosuj pojedynczy efekt zaplanowanego zdarzenia */
  _applyScheduledEffect(effect, colony, planetId) {
    if (!effect) return;
    const facSys = window.KOSMOS?.factionSystem;
    const resSys = colony?.resourceSystem;
    const civSys = colony?.civSystem;
    const prosp  = colony?.prosperitySystem;

    switch (effect.type) {
      case 'resources':
        resSys?.receive?.(effect.gains);
        break;

      case 'temp_rate':
        resSys?.registerProducer?.(effect.sourceId, effect.rates);
        this.scheduledEventSystem?.registerTempEffect?.(
          effect.sourceId,
          planetId ?? colony?.planetId,
          effect.duration
        );
        break;

      case 'permanent_rate':
        resSys?.registerProducer?.(effect.sourceId, effect.rates);
        break;

      case 'credits':
        if (colony) colony.credits = (colony.credits ?? 0) + effect.amount;
        break;

      case 'prosperity_bonus':
        prosp?.addEventBonus?.(effect.sourceId, effect.delta, effect.duration);
        break;

      case 'production_mult':
        // Używa istniejącego mechanizmu _productionPenalties (addytywne, min 0.5)
        civSys?._productionPenalties?.push?.({
          mult: effect.mult,
          remainingYears: effect.duration,
        });
        break;

      case 'research_mult':
        // Taki sam mechanizm jak production_mult — wpływa na BuildingSystem
        civSys?._productionPenalties?.push?.({
          mult: effect.mult,
          remainingYears: effect.duration,
        });
        break;

      case 'ship_cost_mult':
        // Tymczasowy mnożnik kosztu statków — przez _productionPenalties jako fallback
        civSys?._productionPenalties?.push?.({
          mult: effect.mult - 1.0, // 0.8 → -0.2 (penalty format: addytywny do 1.0)
          remainingYears: effect.duration,
        });
        EventBus.emit('shipyard:tempCostMult', { mult: effect.mult, duration: effect.duration });
        break;

      case 'permanent_mult':
        // Stały mnożnik — emituj event (przyszła integracja z BuildingSystem/ColonyManager)
        EventBus.emit('colony:permanentMult', { category: effect.category, mult: effect.mult });
        console.log(`[ScheduledEvent] permanent_mult: ${effect.category} ×${effect.mult}`);
        break;

      case 'faction_slider':
        facSys?.shiftSlider?.(effect.delta, 'scheduled_event');
        break;

      case 'faction_slider_toward_center': {
        const current = facSys?.slider ?? 50;
        const direction = current > 50 ? -1 : 1;
        facSys?.shiftSlider?.(direction * effect.delta, 'political_resolution');
        break;
      }

      case 'faction_tension':
        if (facSys) facSys.tension = Math.max(0, (facSys.tension ?? 0) + effect.delta);
        break;

      case 'factory_product':
        // Commodity trafia do inventory (ResourceSystem obsługuje commodities)
        resSys?.receive?.({ [effect.product]: effect.count });
        break;

      case 'risky_mission':
        // Bonus morale (prosperity) z ducha wolontariuszy
        if (effect.morale) {
          prosp?.addEventBonus?.('sched_risky_morale', effect.morale, 3);
        }
        // Szansa na sukces
        if (effect.successChance > 0 && Math.random() < effect.successChance) {
          this._applyScheduledEffect(effect.successEffect, colony, planetId);
        }
        // Szansa na straty
        if (effect.casualtyChance > 0 && Math.random() < effect.casualtyChance) {
          this._applyScheduledEffect(effect.casualtyEffect, colony, planetId);
        }
        break;

      case 'pop_loss':
        civSys?.removePop?.(null, effect.count ?? 1);
        break;

      default:
        console.warn(`[ScheduledEvent] Nieznany typ efektu: ${effect.type}`);
    }
  }

  /** Zastosuj nagrodę bazową zdarzenia */
  _applyScheduledReward(reward, colony) {
    if (!reward || !colony) return;
    if (reward.credits) {
      colony.credits = (colony.credits ?? 0) + reward.credits;
    }
    if (reward.resources) {
      colony.resourceSystem?.receive?.(reward.resources);
    }
    if (reward.commodities) {
      colony.resourceSystem?.receive?.(reward.commodities);
    }
    if (reward.factionSlider) {
      window.KOSMOS?.factionSystem?.shiftSlider?.(reward.factionSlider, 'scheduled_reward');
    }
  }

  // ── Faza D4: trigger sceny zakończenia ──────────────────────────────
  // Wywoływane gdy ukończono segment 20 Sfery + zbadano jump_gate_construction.
  // Guard `_endgameTriggered` zapobiega podwójnemu odpaleniu (oba paths: segCompleted + techUnlocked).
  _triggerEndgame() {
    if (this._endgameTriggered) return;
    this._endgameTriggered = true;

    EventBus.emit('time:pause');

    // Krótkie opóźnienie dramatyczne (2s) — pozwala graczowi przeczytać popup segmentu 20
    setTimeout(() => {
      EventBus.emit('endgame:triggered', {
        slider:        window.KOSMOS?.factionSystem?.slider ?? 50,
        leaderName:    this._getLeaderName(),
        gameYear:      Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0),
        coloniesCount: window.KOSMOS?.colonyManager?.getAllColonies?.()?.length ?? 1,
      });
    }, 2000);
  }

  // Helper: nazwa aktywnego lidera (PL/EN per locale)
  _getLeaderName() {
    const leaderId = window.KOSMOS?.leaderSystem?.activeLeader;
    if (!leaderId) return '?';
    const leader = LEADERS[leaderId];
    if (!leader) return leaderId;
    const isPL = getLocale() !== 'en';
    return isPL ? (leader.namePL ?? leader.id) : (leader.nameEN ?? leader.namePL ?? leader.id);
  }

  _setupColony(planet) {
    window.KOSMOS.civMode    = true;
    window.KOSMOS.homePlanet = planet;
    planet.explored = true;
    planet.analyzed = true;   // planeta domowa = pełna wiedza (zgrubny + szczegółowy)
    // Podłącz referencję planety do CivSystem (potrzebne do sprawdzania atmosfery)
    this.civSystem.planet = planet;
    // Księżyce planety domowej — wymagają rozpoznania statkiem naukowym
    // Startowe zasoby (surowce + commodities T1/T2)
    this.resourceSystem.receive({
      Fe: 200, C: 150, Si: 100, Cu: 50, Ti: 20, Li: 10, Hv: 4,
      food: 100, water: 100, research: 100,
      structural_alloys: 15, polymer_composites: 10, conductor_bundles: 8,
      power_cells: 12, electronic_systems: 6, extraction_systems: 5,
      pressure_modules: 4, reactive_armor: 4, compact_bioreactor: 3,
      automation_droid: 0, semiconductor_arrays: 2, propulsion_systems: 0,
      plasma_cores: 0, metamaterials: 0, quantum_processors: 0, warp_cores: 0,
      fuel: 50,   // S3.0a: paliwo konwencjonalne (spłaszczenie power_cells/plasma_cores → fuel)
    });
    // Gwarantuj małe złoże Xe na planecie domowej (paliwo jonowe)
    if (!planet.deposits) planet.deposits = [];
    const hasXe = planet.deposits.some(d => d.resourceId === 'Xe');
    if (!hasXe) {
      planet.deposits.push({
        resourceId: 'Xe', richness: 1.0, totalAmount: 50, remaining: 50,
      });
    }
    // Zarejestruj jako pierwszą kolonię w ColonyManager (z per-kolonia BuildingSystem)
    this.buildingSystem.setDeposits(planet.deposits ?? []);
    this.colonyManager.registerHomePlanet(planet, this.resourceSystem, this.civSystem, this.buildingSystem);

    // Rover spawni się przy pierwszym buildResult colony_base (patrz _initRoverSpawnListener)
  }

  // ── Faza 5: pipeline BattleView3D ──────────────────────────
  async _tryShowNextBattle() {
    if (this._battleShowing) return;
    if (this._battleQueue.length === 0) return;
    this._battleShowing = true;

    const battleData = this._battleQueue.shift();

    // Fleet Command Console (Slice 1) — bitwy deep-space (DSCS, Path B) rozgrywają
    // się NA ŻYWO na głównej mapie (smugi + kamera + auto-slow). Pomijamy modal kina
    // — tylko lekki baner outcome (domknięcie). Kino zostaje dla Path A (war-driven,
    // abstrakcja bez żywych meshy). Rollback: fcCombatFx=false → stary pełny modal.
    if (GAME_CONFIG.FEATURES?.fcCombatFx && battleData?.source === 'dscs') {
      try { await showBattleOutcome(battleData); }
      catch (err) { console.error('[BattleOutcome] Error:', err); }
      this._battleShowing = false;
      if (this._battleQueue.length > 0) this._tryShowNextBattle();
      return;
    }

    // Preferencja gracza — 'ask' (domyślnie) lub 'skip' (Zawsze pomijaj)
    const pref = getBattleViewPreference();
    let choice = 'skip';
    if (pref === 'ask') {
      try {
        choice = await showBattleIntro(battleData);
      } catch (err) {
        console.error('[BattleView] Intro error:', err);
        choice = 'skip';
      }
    }

    if (choice === 'watch') {
      // Leniwa inicjalizacja BattleView3D z canvas
      if (!this._battleView3D) {
        const canvas = document.getElementById('three-canvas');
        if (canvas) this._battleView3D = new BattleView3D(canvas);
      }
      if (this._battleView3D) {
        try {
          await this._battleView3D.start(battleData);
        } catch (err) {
          console.error('[BattleView3D] Error:', err);
        }
      }
    } else {
      // Skip / Zawsze pomijaj — tylko baner outcome, bez cinematic 3D
      try {
        await showBattleOutcome(battleData);
      } catch (err) {
        console.error('[BattleOutcome] Error:', err);
      }
    }

    this._battleShowing = false;
    // Kolejna w kolejce, jeśli jest
    if (this._battleQueue.length > 0) this._tryShowNextBattle();
  }

  _initRoverSpawnListener() {
    const onBuild = ({ success, buildingId }) => {
      if (!success || buildingId !== 'colony_base') return;
      const mgr = this.groundUnitManager;
      const hp = window.KOSMOS?.homePlanet;
      if (!mgr || !hp) return;
      // Tylko jeśli nie ma jeszcze żadnej jednostki na planecie domowej
      if (mgr.getUnitsOnPlanet(hp.id).length > 0) return;

      // Znajdź hex stolicy
      const bSys = window.KOSMOS?.buildingSystem;
      let startQ = 0, startR = 0;
      if (bSys) {
        for (const [key] of bSys._active) {
          if (key.startsWith('capital_')) {
            const coords = key.replace('capital_', '').split(',').map(Number);
            startQ = coords[0]; startR = coords[1];
            break;
          }
        }
      }
      mgr.createUnit('science_rover', hp.id, startQ, startR);

      // Faza 6: auto-spawn pierwszej jednostki obrony — infantry na sąsiednim hexie
      const grid = this.colonyManager?.getColony(hp.id)?.grid;
      if (grid) {
        // Sąsiad kapitoły — cube offsets {q,r}
        const neighbors = [
          { dq: +1, dr:  0 }, { dq: -1, dr:  0 },
          { dq:  0, dr: +1 }, { dq:  0, dr: -1 },
          { dq: +1, dr: -1 }, { dq: -1, dr: +1 },
        ];
        for (const n of neighbors) {
          const nq = startQ + n.dq, nr = startR + n.dr;
          const tile = grid.get(nq, nr);
          if (!tile || tile.type === 'ocean') continue;
          if (mgr.getUnitAt(hp.id, nq, nr)) continue;
          mgr.createUnit('infantry', hp.id, nq, nr, { owner: 'player' });
          break;
        }
      }

      // Jednorazowy listener
      EventBus.off('planet:buildResult', onBuild);
    };
    EventBus.on('planet:buildResult', onBuild);
  }

  // ── Migracja starych save: fleet[] ze stringami → vessel instances ──
  _migrateStringFleets() {
    const colMgr = this.colonyManager;
    const vMgr = this.vesselManager;
    if (!colMgr || !vMgr) return;

    for (const colony of colMgr.getAllColonies()) {
      if (!colony.fleet || colony.fleet.length === 0) continue;
      // Sprawdź czy fleet zawiera stare stringi (typy statków)
      const hasStrings = colony.fleet.some(f => typeof f === 'string' && !f.startsWith('v_'));
      if (hasStrings) {
        colony.fleet = vMgr.migrateStringFleet(colony.fleet, colony.planetId);
      }
    }
  }

  // ── POWER TEST — metody pomocnicze ─────────────────────────────

  // POWER TEST — minimalne zasoby startowe (po 100 każdego surowca + 10k research)
  // _setupColony() dodał już startowe ilości — wyzeruj inventory i research.amount,
  // potem ustaw po 100 dla każdego pierwiastka, food/water oraz commodities.
  // Research 10000 (budżet na szybkie odblokowanie drzewa tech w trybie testowym).
  _setupPowerTestResources() {
    const rs = this.resourceSystem;
    if (!rs) return;

    // Wyzeruj wszystko co _setupColony zdążyło dodać
    for (const id of rs.inventory.keys()) {
      rs.inventory.set(id, 0);
    }
    rs.research.amount = 0;

    // 100 każdego pierwiastka + food + water + wszystkich commodities
    const gains = {};
    for (const id of Object.keys(ELEMENTS))    gains[id] = 100;
    for (const id of Object.keys(COMMODITIES)) gains[id] = 100;
    gains.food     = 100;
    gains.water    = 100;
    gains.research = 10000;

    rs.receive(gains);
  }

  // POWER TEST — flota startowa (1× science_vessel, 1× cargo_ship, 1× hull_frigate)
  // M4 P1.5 — dodany hull_frigate jako startowy militarny vessel + auto-unlock
  // tech `point_defense` żeby gracz mógł budować kolejne. Lore: "koloniści mieli
  // sprzęt na obronę przed nieznanym". Tylko Power Test — Civilization purystyczny.
  _spawnPowerTestFleet(planetId) {
    const vMgr = window.KOSMOS?.vesselManager;
    const colony = this.colonyManager.getColony(planetId);
    if (!vMgr || !colony) return;
    // Legacy ship types (SHIPS data)
    for (const shipId of ['science_vessel', 'cargo_ship']) {
      const vessel = vMgr.createAndRegister(shipId, planetId);
      colony.fleet.push(vessel.id);
    }
    // M4 P1.5 — hull_frigate z sensownymi defaultami militarnymi
    const frigate = vMgr.createAndRegister('hull_frigate', planetId, {
      modules: ['engine_chemical', 'weapon_kinetic', 'shield_basic', 'reinforced_hull'],
    });
    if (frigate) colony.fleet.push(frigate.id);
    // Auto-unlock point_defense — pozwala graczowi budować kolejne militarne hulle.
    if (this.techSystem && !this.techSystem.isResearched?.('point_defense')) {
      this.techSystem.restore?.({ researched: ['point_defense'] });
    }
  }

  // POWER TEST — auto-budowa budynków (grid przekazany jako parametr)
  _autoBuildPowerTest(grid) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!grid || !bSys) return;

    // Zbierz wolne, budowlane tile'y (nie ocean, nie damaged, nie zajęte)
    const allTiles = grid.toArray();
    const freeTiles = allTiles.filter(t => {
      const terrain = TERRAIN_TYPES[t.type];
      return terrain?.buildable && !t.isOccupied && !t.damaged;
    });

    // Priorytet: plains → desert → mountains → tundra → crater → reszta
    const terrainPriority = ['plains', 'desert', 'mountains', 'tundra', 'crater', 'forest', 'ice_sheet', 'wasteland', 'volcano'];
    freeTiles.sort((a, b) => {
      const ai = terrainPriority.indexOf(a.type);
      const bi = terrainPriority.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Lista budynków do postawienia — ręcznie wyselekcjonowane dla Power Test
    // (budowane przez restoreFromSave — pomija sprawdzanie tech requirements)
    const buildPlan = [
      { id: 'mine',             level: 2, count: 2 },
      { id: 'factory',          level: 2, count: 3 },
      { id: 'solar_farm',       level: 2, count: 2 },
      { id: 'coal_plant',       level: 2, count: 1 },
      { id: 'farm',             level: 2, count: 1 },
      { id: 'well',             level: 2, count: 1 },
      { id: 'shipyard',         level: 1, count: 1 },
      { id: 'launch_pad',       level: 1, count: 1 },  // Port Kosmiczny (spaceport)
      { id: 'research_station', level: 1, count: 1 },
    ];

    const entries = [];  // dane do restoreFromSave
    const usedTiles = new Set();

    for (const plan of buildPlan) {
      const building = BUILDINGS[plan.id];
      if (!building) continue;

      for (let n = 0; n < plan.count; n++) {
        // Znajdź tile pasujący do tego budynku
        const tile = this._findTileForBuilding(freeTiles, building, usedTiles);
        if (!tile) continue;

        usedTiles.add(tile.key);
        tile.buildingId    = plan.id;
        tile.buildingLevel = plan.level;

        // Oblicz baseRates z uwzględnieniem terenu i poziomu
        const baseRates = bSys._calcBaseRates(building, tile, plan.level);

        // Skumulowane housing (per level)
        const housing = (building.housing || 0) * plan.level;

        entries.push({
          tileKey:    tile.key,
          buildingId: plan.id,
          baseRates,
          housing,
          popCost:    building.popCost ?? 0.25,
          level:      plan.level,
        });
      }
    }

    // Przywróć budynki przez restoreFromSave (przelicza housing, employment, factory points)
    if (entries.length > 0) {
      bSys.restoreFromSave(entries);
    }
    // ColonyOverlay odświeży globus automatycznie przy otwarciu
  }

  // POWER TEST — znajdź wolny tile pasujący do budynku
  _findTileForBuilding(freeTiles, building, usedTiles) {
    for (const tile of freeTiles) {
      if (usedTiles.has(tile.key)) continue;
      const terrain = TERRAIN_TYPES[tile.type];
      if (!terrain?.buildable) continue;

      // terrainOnly: tylko określone typy terenu
      if (building.terrainOnly) {
        if (building.terrainOnly.includes(tile.type)) return tile;
        continue;
      }
      // terrainAny: dowolny buildable tile
      if (building.terrainAny) return tile;
      // Standardowe: category musi być w allowedCategories
      if (terrain.allowedCategories.includes(building.category)) return tile;
    }
    return null;
  }

  // ── Auto-budowa startowych budynków (nowa gra, scenariusz Cywilizacja) ──
  // Stawia farm, well, solar_farm na odpowiednich hexach — bez kosztów surowcowych
  _autoPlaceStarterBuildings(grid) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!grid || !bSys) return;

    const allTiles = grid.toArray();
    const freeTiles = allTiles.filter(t => {
      const terrain = TERRAIN_TYPES[t.type];
      return terrain?.buildable && !t.isOccupied && !t.damaged;
    });

    // Sortuj: tereny z bonusami najpierw
    const terrainPriority = ['plains', 'desert', 'ice_sheet', 'forest', 'mountains', 'tundra', 'crater', 'wasteland', 'volcano'];
    freeTiles.sort((a, b) => {
      const ai = terrainPriority.indexOf(a.type);
      const bi = terrainPriority.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Farm na hex ze stolicą (wirtualna — hex wolny), well i solar_farm na osobnych hexach
    const buildPlan = [
      { id: 'farm',       level: 1, count: 1 },
      { id: 'well',       level: 1, count: 1 },
      { id: 'solar_farm', level: 1, count: 1 },
    ];

    const entries = [];
    const usedTiles = new Set();

    // Stolica jest wirtualna (capitalBase=true, ale hex wolny) — farm na niej
    const capitalTile = allTiles.find(t => t.capitalBase === true);

    for (const plan of buildPlan) {
      const building = BUILDINGS[plan.id];
      if (!building) continue;

      let tile;
      // Farm → na hex ze stolicą (najlepsza lokalizacja, plains z bonusem food)
      if (plan.id === 'farm' && capitalTile && !usedTiles.has(capitalTile.key)) {
        tile = capitalTile;
      } else {
        tile = this._findTileForBuilding(freeTiles, building, usedTiles);
      }
      if (!tile) continue;

      usedTiles.add(tile.key);
      tile.buildingId    = plan.id;
      tile.buildingLevel = plan.level;

      const baseRates = bSys._calcBaseRates(building, tile, plan.level);
      const housing   = (building.housing || 0) * plan.level;

      entries.push({
        tileKey:    tile.key,
        buildingId: plan.id,
        baseRates,
        housing,
        popCost:    building.popCost ?? 0.25,
        level:      plan.level,
      });
    }

    if (entries.length > 0) {
      bSys.restoreFromSave(entries);
    }

    // ColonyOverlay odświeży globus automatycznie przy otwarciu
  }

  // ── Auto-budowa startowych budynków — scenariusz "Nowa Gra 2" (boosted) ──
  // Standardowe 3 + habitat Lv1, launch_pad Lv1, shipyard Lv1, solar_farm Lv3
  _autoPlaceBoostedBuildings(grid) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!grid || !bSys) return;

    const allTiles = grid.toArray();
    const freeTiles = allTiles.filter(t => {
      const terrain = TERRAIN_TYPES[t.type];
      return terrain?.buildable && !t.isOccupied && !t.damaged;
    });

    const terrainPriority = ['plains', 'desert', 'ice_sheet', 'forest', 'mountains', 'tundra', 'crater', 'wasteland', 'volcano'];
    freeTiles.sort((a, b) => {
      const ai = terrainPriority.indexOf(a.type);
      const bi = terrainPriority.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Standardowe + dodatkowe budynki dla boosted
    const buildPlan = [
      { id: 'farm',          level: 1, count: 1 },
      { id: 'well',          level: 1, count: 1 },
      { id: 'solar_farm',    level: 1, count: 1 },
      { id: 'habitat',       level: 1, count: 1 },
      { id: 'launch_pad',    level: 1, count: 1 },
      { id: 'shipyard',      level: 1, count: 1 },
      { id: 'solar_farm',    level: 3, count: 1 },
    ];

    const entries = [];
    const usedTiles = new Set();

    // Stolica jest wirtualna (capitalBase=true, hex wolny) — farm na niej
    const capitalTile = allTiles.find(t => t.capitalBase === true);

    for (const plan of buildPlan) {
      // Tymczasowo usuwamy requires z definicji — w boosted wszystkie budynki dostępne od startu
      const building = { ...BUILDINGS[plan.id] };
      if (!building.id) continue;
      delete building.requires; // odblokuj budynek bez tech

      for (let n = 0; n < plan.count; n++) {
        let tile;
        if (plan.id === 'farm' && n === 0 && capitalTile && !usedTiles.has(capitalTile.key)) {
          tile = capitalTile;
        } else {
          tile = this._findTileForBuilding(freeTiles, building, usedTiles);
        }
        if (!tile) continue;

        usedTiles.add(tile.key);
        tile.buildingId    = plan.id;
        tile.buildingLevel = plan.level;

        const baseRates = bSys._calcBaseRates(building, tile, plan.level);
        const housing   = (building.housing || 0) * plan.level;

        entries.push({
          tileKey:    tile.key,
          buildingId: plan.id,
          baseRates,
          housing,
          popCost:    building.popCost ?? 0.25,
          level:      plan.level,
        });
      }
    }

    if (entries.length > 0) {
      bSys.restoreFromSave(entries);
    }
  }

  // ── Zbadaj technologie wymagane dla budynków boosted ──────────
  _setupBoostedTechs() {
    // Tech wymagane: orbital_survey → rocketry (launch_pad), exploration (shipyard)
    // metallurgy — odblokowuje Fabrykę; gracz startuje z nią gotową (tier 1, bez prereqów)
    // Odblokowane od startu — gracz nie musi ich badać
    // Nuclear power NIE odblokowany — gracz musi sam zbadać
    // basic_computing + automation USUNIĘTE — gracz musi je sam zbadać (drugi slot
    // badawczy i budynki autonomiczne nie są darmowe na starcie).
    const techIds = ['orbital_survey', 'rocketry', 'exploration', 'metallurgy'];
    this.techSystem.restore({ researched: techIds });
  }

  // ── Generowanie / przywracanie układu ─────────────────────────

  _generateFreshSystem(cx, cy) {
    const generator = new SystemGenerator();

    // POWER TEST — scenariusz testowy z dużym układem
    const isPowerTest = window.KOSMOS?.scenario === 'power_test';
    const isBoosted   = window.KOSMOS?.scenario === 'civilization_boosted';
    const result = isPowerTest
      ? generator.generatePowerTestScenario()
      : generator.generateCivScenario();

    // Zachowaj id planety z cywilizacją do auto-kolonizacji
    this._civPlanetId = result.civPlanetId;
    // Gwiazda zawsze w centrum układu współrzędnych Three.js (0, 0)
    result.star.x = 0;
    result.star.y = 0;
    return result;
  }

  /**
   * M1 Targeting — idempotentne init MovementOrderSystem.
   * Lazy: tworzymy instancję przy pierwszej potrzebie. Wywoływane z debug toggle
   * (KOSMOS.debug.enableMovementOrders) lub przy starcie gdy FEATURES.movementOrders=true.
   */
  _ensureMovementOrderSystem() {
    if (this.movementOrderSystem) return this.movementOrderSystem;
    if (!this.vesselManager) {
      console.warn('[GameScene] vesselManager jeszcze nieinicjalizowany — odrocz enable');
      return null;
    }
    this.movementOrderSystem = new MovementOrderSystem(this.vesselManager);
    window.KOSMOS.movementOrderSystem = this.movementOrderSystem;
    console.log('[GameScene] MovementOrderSystem aktywowany');
    return this.movementOrderSystem;
  }

  _disableMovementOrderSystem() {
    if (!this.movementOrderSystem) return;
    this.movementOrderSystem.destroy();
    this.movementOrderSystem = null;
    window.KOSMOS.movementOrderSystem = null;
    console.log('[GameScene] MovementOrderSystem deaktywowany');
  }

  /**
   * M1 Fleet Materialization — idempotentne init.
   */
  _ensureEmpireFleetMaterializer() {
    if (this.empireFleetMaterializer) return this.empireFleetMaterializer;
    if (!this.vesselManager) {
      console.warn('[GameScene] vesselManager jeszcze nieinicjalizowany — odrocz enable');
      return null;
    }
    this.empireFleetMaterializer = new EmpireFleetMaterializer(this.vesselManager, this.empireRegistry);
    window.KOSMOS.empireFleetMaterializer = this.empireFleetMaterializer;
    console.log('[GameScene] EmpireFleetMaterializer aktywowany');
    return this.empireFleetMaterializer;
  }

  _disableEmpireFleetMaterializer() {
    if (!this.empireFleetMaterializer) return;
    this.empireFleetMaterializer.destroy();
    this.empireFleetMaterializer = null;
    window.KOSMOS.empireFleetMaterializer = null;
    console.log('[GameScene] EmpireFleetMaterializer deaktywowany (istniejące mater. floty pozostają)');
  }

  /**
   * M2a ProximitySystem — idempotentne init.
   * Lazy: tworzymy instancję przy pierwszej potrzebie. Wywoływane z debug toggle
   * (KOSMOS.debug.enableProximity — commit 8) lub przy starcie gdy FEATURES.proximitySystem=true.
   */
  _ensureProximitySystem() {
    if (this.proximitySystem) return this.proximitySystem;
    if (!this.vesselManager) {
      console.warn('[GameScene] vesselManager jeszcze nieinicjalizowany — odrocz enable proximity');
      return null;
    }
    this.proximitySystem = new ProximitySystem(this.vesselManager);
    window.KOSMOS.proximitySystem = this.proximitySystem;
    console.log('[GameScene] ProximitySystem aktywowany');
    return this.proximitySystem;
  }

  _disableProximitySystem() {
    if (!this.proximitySystem) return;
    this.proximitySystem.destroy();
    this.proximitySystem = null;
    window.KOSMOS.proximitySystem = null;
    console.log('[GameScene] ProximitySystem deaktywowany');
  }

  /**
   * M2a VesselCombatSystem — idempotentne init.
   * Event-driven: konsumuje vessel:proximityEnter. Wymaga FEATURES.proximitySystem
   * aby faktycznie cokolwiek słyszał (sandbox włącza oba razem).
   */
  _ensureVesselCombatSystem() {
    if (this.vesselCombatSystem) return this.vesselCombatSystem;
    if (!this.vesselManager) {
      console.warn('[GameScene] vesselManager jeszcze nieinicjalizowany — odrocz enable vesselCombat');
      return null;
    }
    this.vesselCombatSystem = new VesselCombatSystem(this.vesselManager);
    window.KOSMOS.vesselCombatSystem = this.vesselCombatSystem;
    console.log('[GameScene] VesselCombatSystem aktywowany');
    return this.vesselCombatSystem;
  }

  _disableVesselCombatSystem() {
    if (!this.vesselCombatSystem) return;
    this.vesselCombatSystem.destroy();
    this.vesselCombatSystem = null;
    window.KOSMOS.vesselCombatSystem = null;
    console.log('[GameScene] VesselCombatSystem deaktywowany');
  }

  /**
   * M4 P3 DeepSpaceCombatSystem — idempotentne init. Subscriber:
   * vessel:combatRangeEnter (delegacja z VCS przez FEATURES.m4DeepSpaceCombat).
   * Bez VesselCombatSystem nie ma kto deleguje — sandbox włącza oba razem.
   */
  _ensureDeepSpaceCombatSystem() {
    if (this.deepSpaceCombatSystem) return this.deepSpaceCombatSystem;
    if (!this.vesselManager) {
      console.warn('[GameScene] vesselManager jeszcze nieinicjalizowany — odrocz enable deepSpaceCombat');
      return null;
    }
    this.deepSpaceCombatSystem = new DeepSpaceCombatSystem(this.vesselManager);
    window.KOSMOS.deepSpaceCombatSystem = this.deepSpaceCombatSystem;
    console.log('[GameScene] DeepSpaceCombatSystem aktywowany');
    return this.deepSpaceCombatSystem;
  }

  _disableDeepSpaceCombatSystem() {
    if (!this.deepSpaceCombatSystem) return;
    this.deepSpaceCombatSystem.destroy();
    this.deepSpaceCombatSystem = null;
    window.KOSMOS.deepSpaceCombatSystem = null;
    console.log('[GameScene] DeepSpaceCombatSystem deaktywowany');
  }

  /**
   * M2a AutoRetreatSystem — idempotentne init.
   * Event-driven na battle:resolved (retreated='A'|'B'). Delegacja moveToPoint
   * order do najbliższej friendly planety przez MovementOrderSystem.
   */
  _ensureAutoRetreatSystem() {
    if (this.autoRetreatSystem) return this.autoRetreatSystem;
    if (!this.vesselManager || !this.colonyManager) {
      console.warn('[GameScene] vessel/colonyManager jeszcze nieinicjalizowany — odrocz enable autoRetreat');
      return null;
    }
    // MOS wymagane — jeśli flag movementOrders off, autoRetreat nie może wydawać orderów.
    const mos = this._ensureMovementOrderSystem();
    if (!mos) {
      console.warn('[GameScene] MovementOrderSystem niedostępny — AutoRetreatSystem nie może działać');
      return null;
    }
    this.autoRetreatSystem = new AutoRetreatSystem(this.vesselManager, this.colonyManager, mos);
    window.KOSMOS.autoRetreatSystem = this.autoRetreatSystem;
    console.log('[GameScene] AutoRetreatSystem aktywowany');
    return this.autoRetreatSystem;
  }

  _disableAutoRetreatSystem() {
    if (!this.autoRetreatSystem) return;
    this.autoRetreatSystem.destroy();
    this.autoRetreatSystem = null;
    window.KOSMOS.autoRetreatSystem = null;
    console.log('[GameScene] AutoRetreatSystem deaktywowany');
  }

  _restoreSystem(data, cx, cy) {
    const star = new Star({
      id:           data.star.id,
      name:         data.star.name,
      spectralType: data.star.spectralType,
      mass:         data.star.mass,
      luminosity:   data.star.luminosity,
    });
    // Gwiazda zawsze w centrum Three.js (0, 0)
    star.x = 0;
    star.y = 0;
    star.systemId = data.star.systemId ?? 'sys_home';
    EntityManager.add(star);

    // Przywróć dodatkowe gwiazdy (inne układy, Etap 40)
    if (data.stars?.length > 0) {
      for (const sd of data.stars) {
        const otherStar = new Star({
          id: sd.id, name: sd.name, spectralType: sd.spectralType,
          mass: sd.mass, luminosity: sd.luminosity,
        });
        otherStar.x = 0;
        otherStar.y = 0;
        otherStar.systemId = sd.systemId ?? 'sys_home';
        EntityManager.add(otherStar);
      }
    }

    const planets = data.planets.map(pd => {
      const p = new Planet({
        id:                pd.id,
        name:              pd.name,
        planetType:        pd.planetType,
        a:                 pd.a,
        e:                 pd.e,
        T:                 pd.T,
        M:                 pd.M,
        inclinationOffset: pd.inclinationOffset,
        mass:              pd.mass,
        visualRadius:      pd.visualRadius,
        albedo:            pd.albedo,
        atmosphere:        pd.atmosphere,
        color:             pd.color,
        glowColor:         pd.glowColor,
        temperatureK:      pd.temperatureK,
        temperatureC:      pd.temperatureC,
        surfaceRadius:     pd.surfaceRadius,
        surfaceGravity:    pd.surfaceGravity,
        composition:       pd.composition,
      });
      p.lifeScore        = pd.lifeScore        || 0;
      p.orbitalStability = pd.orbitalStability || 1.0;
      p.age              = pd.age              || 0;
      p.surface          = { ...(pd.surface || {}) };
      p.explored         = pd.explored         || false;
      p.analyzed         = pd.analyzed         ?? pd.explored ?? false;  // backfill inwariantu (analyzed ⇒ explored)
      p.systemId         = pd.systemId         ?? 'sys_home';
      // Przywróć złoża z save (v6)
      if (pd.deposits?.length > 0) {
        p.deposits = pd.deposits.map(d => ({ ...d }));
      }
      EntityManager.add(p);
      return p;
    });

    // Przywróć księżyce
    const moons = (data.moons || []).map(md => {
      const m = new Moon({
        id:                md.id,
        name:              md.name,
        a:                 md.a,
        e:                 md.e,
        // Migracja save'ów: stare T z KeplerMath (>0.5 lat) zastąp krótkim wizualnym
        T:                 (md.T > 0.5) ? 0.014 + Math.random() * 0.06 : md.T,
        M:                 md.M,
        inclinationOffset: md.inclinationOffset,
        mass:              md.mass,
        visualRadius:      md.visualRadius,
        color:             md.color,
        parentPlanetId:    md.parentPlanetId,
        moonType:          md.moonType || 'rocky',
        composition:       md.composition || null,
        temperatureK:      md.temperatureK || null,
        temperatureC:      md.temperatureC ?? null,
        surfaceRadius:     md.surfaceRadius ?? null,
        surfaceGravity:    md.surfaceGravity ?? null,
        atmosphere:        md.atmosphere || 'none',
      });
      m.age      = md.age      || 0;
      m.explored = md.explored || false;
      m.analyzed = md.analyzed ?? md.explored ?? false;  // backfill inwariantu (analyzed ⇒ explored)
      m.systemId = md.systemId ?? 'sys_home';
      // Przywróć złoża z save (v6)
      if (md.deposits?.length > 0) {
        m.deposits = md.deposits.map(d => ({ ...d }));
      }
      EntityManager.add(m);
      return m;
    });

    // Przywróć planetoidy
    const planetoids = (data.planetoids || []).map(pd => {
      const p = new Planetoid({
        id:                pd.id,
        name:              pd.name,
        planetoidType:     pd.planetoidType || 'silicate',
        a:                 pd.a,
        e:                 pd.e,
        T:                 pd.T,
        M:                 pd.M,
        inclinationOffset: pd.inclinationOffset,
        mass:              pd.mass,
        visualRadius:      pd.visualRadius,
        color:             pd.color,
        temperatureK:      pd.temperatureK,
        temperatureC:      pd.temperatureC,
        surfaceRadius:     pd.surfaceRadius,
        surfaceGravity:    pd.surfaceGravity,
        composition:       pd.composition,
      });
      p.explored = pd.explored || false;
      p.analyzed = pd.analyzed ?? pd.explored ?? false;  // backfill inwariantu (analyzed ⇒ explored)
      p.systemId = pd.systemId ?? 'sys_home';
      // Przywróć złoża z save
      if (pd.deposits?.length > 0) {
        p.deposits = pd.deposits.map(d => ({ ...d }));
      }
      EntityManager.add(p);
      return p;
    });

    // Wygeneruj brakujące złoża (migracja ze starszych save'ów)
    const depSys = new DepositSystem();
    depSys.resetNeutroniumCount();
    for (const p of planets) {
      if (!p.deposits || p.deposits.length === 0) depSys.generateDeposits(p);
    }
    for (const m of moons) {
      if (!m.deposits || m.deposits.length === 0) depSys.generateDeposits(m);
    }
    for (const p of planetoids) {
      if (!p.deposits || p.deposits.length === 0) depSys.generateDeposits(p);
    }

    // S3.0a (b): backfill złóż H na ISTNIEJĄCYCH ciałach (mają deposits, ale bez H — stare save).
    // Nowe gry: generateDeposits robi H automatycznie (H w ELEMENT_TO_RESOURCE). Idempotent.
    for (const p of planets)    depSys.ensureResourceDeposit(p, 'H');
    for (const m of moons)      depSys.ensureResourceDeposit(m, 'H');
    for (const p of planetoids) depSys.ensureResourceDeposit(p, 'H');

    const maxId = [data.star, ...data.planets, ...(data.moons || []), ...(data.planetoids || [])]
      .map(e => { const m = String(e.id).match(/(\d+)$/); return m ? parseInt(m[1]) : 0; })
      .reduce((a, b) => Math.max(a, b), 0);
    EntityManager._nextId = maxId + 1;

    window.KOSMOS.savedData = null;

    // Napraw systemId encji na podstawie StarSystemManager (obejście: registerHomeSystem nadpisuje)
    const ssmData = data.civ4x?.starSystemManager;
    if (ssmData?.systems) {
      const idToSys = new Map();
      for (const sys of ssmData.systems) {
        if (!sys.systemId || sys.systemId === 'sys_home') continue;
        for (const pid of (sys.planetIds || []))    idToSys.set(pid, sys.systemId);
        for (const mid of (sys.moonIds || []))      idToSys.set(mid, sys.systemId);
        for (const pid of (sys.planetoidIds || [])) idToSys.set(pid, sys.systemId);
      }
      for (const p of planets)    { const s = idToSys.get(p.id); if (s) p.systemId = s; }
      for (const m of moons)      { const s = idToSys.get(m.id); if (s) m.systemId = s; }
      for (const p of planetoids) { const s = idToSys.get(p.id); if (s) p.systemId = s; }
    }

    // Zwróć tylko encje home system (registerHomeSystem nadpisuje systemId!)
    const homePlanets    = planets.filter(p => (p.systemId ?? 'sys_home') === 'sys_home');
    const homeMoons      = moons.filter(m => (m.systemId ?? 'sys_home') === 'sys_home');
    const homePlanetoids = planetoids.filter(p => (p.systemId ?? 'sys_home') === 'sys_home');

    return { star, planets: homePlanets, moons: homeMoons, planetesimals: [], asteroids: [], comets: [], planetoids: homePlanetoids };
  }

  // ── Klawiatura ─────────────────────────────────────────────────
  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target?.isContentEditable) return;

      // CTRL-hold → pokaż labele wszystkich obiektów 3D (planety, statki, wraki).
      // Znika po puszczeniu (keyup).
      if ((e.key === 'Control' || e.ctrlKey) && this.threeRenderer?.setShowAllLabels) {
        if (!this.threeRenderer._showAllLabels) {
          this.threeRenderer.setShowAllLabels(true);
          this.uiManager?.markDirty?.();
        }
      }

      // SHIFT-hold → „czysty widok": ukryj cały UI (linie, etykiety, paski, pierścienie),
      // zostaw samą grafikę układu i modele statków. Box-select (SHIFT+LPM) działa dalej —
      // marquee rysuje się mimo ukrytego UI. Znika po puszczeniu Shift (keyup/blur).
      // Nie łączymy z CTRL (koliduje z „pokaż wszystkie etykiety"); tylko w widoku układu.
      if (e.key === 'Shift' && !e.ctrlKey && window.KOSMOS?.civMode
          && !this.uiManager?.overlayManager?.isAnyOpen?.() && !this.planetScene?.isOpen) {
        this._setCleanView(true);
      }

      // ── M3 P1.3 — picker / menu / selection keyboard (priorytet PRZED overlay/menu/Space) ──
      // ESC priority: picker → rightClickMenu → selectedVesselId → existing handlers.
      // ENTER: tylko gdy picker aktywny (finalize).
      const um = this.uiManager;
      if (e.key === 'Escape') {
        if (um?.isPickerActive?.()) {
          e.preventDefault();
          um.cancelPickerMode();
          return;
        }
        const rcm = window.KOSMOS?.rightClickMenu;
        if (rcm?.isOpen?.()) {
          e.preventDefault();
          rcm.hide();
          return;
        }
        if (um?.getSelectedVesselId?.()) {
          e.preventDefault();
          um.clearSelection();
          return;
        }
        // Brak picker/menu/selection → spada do istniejącego handling (overlay close, bottom menu)
      }
      if (e.key === 'Enter' && um?.isPickerActive?.()) {
        e.preventDefault();
        um.finalizePickerMode();
        return;
      }

      // Deleguj klawisze do aktywnego overlay (np. Escape w buildMode, strzałki)
      if (this.uiManager.overlayManager.isAnyOpen()) {
        const ov = this.uiManager.overlayManager.overlays[this.uiManager.overlayManager.active];
        if (ov?.handleKeyDown && ov.handleKeyDown(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })) { this.uiManager.markDirty(); return; }
        // Escape — zamknij aktywny overlay (jeśli overlay nie skonsumował)
        if (e.key === 'Escape') {
          this.uiManager.overlayManager.closeActive();
          this.uiManager.markDirty();
          return;
        }
      }

      // Escape — zamknij dialog potwierdzenia (jeśli widoczny)
      if (e.key === 'Escape' && this.uiManager._confirmDialog?.visible) {
        this.uiManager._confirmDialog = { visible: false };
        this.uiManager.markDirty();
        return;
      }

      // Escape — toggle menu (gdy brak overlay)
      if (e.key === 'Escape') {
        if (!this.planetScene?.isOpen) {
          this.uiManager._bottomBar.toggleMenu();
          this.uiManager.markDirty();
        }
        return;
      }

      // M4 P2 — Tab / Shift+Tab: cyklowanie własnymi vesselami
      if (e.key === 'Tab' && window.KOSMOS?.civMode) {
        const tag = (e.target?.tagName || '').toLowerCase();
        const editable = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
        if (!editable) {
          e.preventDefault();
          this.uiManager.cycleSelectedVessel(e.shiftKey ? -1 : 1);
          this.uiManager.markDirty();
          return;
        }
      }

      // Klawisze overlay (F/P/E/T) — civMode
      if (window.KOSMOS?.civMode) {
        if (this.uiManager.overlayManager.handleKey(e.key)) { this.uiManager.markDirty(); return; }
      }

      const ts = this.timeSystem;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          ts.isPaused ? EventBus.emit('time:play') : EventBus.emit('time:pause');
          break;
        case 'KeyH':
          this.threeRenderer._focusEntityId = null;
          this.cameraController.resetToCenter();
          break;
        case 'KeyY':
          // Obraz Operacyjny F2 — tryb taktyczny (Y zamiast zajętego T — decyzja
          // weryfikacji §3.2; gate: civMode + flaga; toggle sam sprawdza flagę).
          if (window.KOSMOS?.civMode && GAME_CONFIG.FEATURES?.tacticalMode) {
            window.KOSMOS.tacticalMode?.toggle();
          }
          break;
        case 'Digit1': EventBus.emit('time:setMultiplier', { index: 1 }); EventBus.emit('time:play'); break; // 1d/s
        case 'Digit2': EventBus.emit('time:setMultiplier', { index: 2 }); EventBus.emit('time:play'); break; // 3d/s
        case 'Digit3': EventBus.emit('time:setMultiplier', { index: 3 }); EventBus.emit('time:play'); break; // 1t/s
        case 'Digit4': EventBus.emit('time:setMultiplier', { index: 4 }); EventBus.emit('time:play'); break; // 1m/s
        case 'Digit5': EventBus.emit('time:setMultiplier', { index: 5 }); EventBus.emit('time:play'); break; // 1r/s
        case 'BracketLeft':  EventBus.emit('time:slower'); break;
        case 'BracketRight': EventBus.emit('time:faster'); break;
        case 'KeyQ': if (!window.KOSMOS?.civMode) EventBus.emit('action:stabilize');  break;
        case 'KeyW': if (!window.KOSMOS?.civMode) EventBus.emit('action:nudgeToHz');  break;
        case 'KeyE': if (!window.KOSMOS?.civMode) EventBus.emit('action:bombard');    break;
        case 'F7':
          e.preventDefault();
          this._toggleThemeOverlay();
          break;
        case 'KeyR':
          // Ctrl+Shift+R: toggle recorder (start/stop + auto-download przy stop)
          if (e.ctrlKey && e.shiftKey) {
            e.preventDefault();
            this._toggleRecorder();
          }
          break;
      }
    });

    // CTRL released → wyłącz labele wszystkich obiektów
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Control' || !e.ctrlKey) {
        if (this.threeRenderer?._showAllLabels) {
          this.threeRenderer.setShowAllLabels(false);
          this.uiManager?.markDirty?.();
        }
      }
      // Puszczenie Shift → wyjdź z czystego widoku.
      if (e.key === 'Shift' || !e.shiftKey) this._setCleanView(false);
    });
    // Edge case: utrata focusu okna podczas trzymania CTRL / Shift
    window.addEventListener('blur', () => {
      if (this.threeRenderer?._showAllLabels) {
        this.threeRenderer.setShowAllLabels(false);
        this.uiManager?.markDirty?.();
      }
      this._setCleanView(false);
    });
  }

  // SHIFT „czysty widok" — synchronizuje ukrycie UI 2D (UIManager) i nakładek 3D
  // (ThreeRenderer). Idempotentne; markDirty odświeża canvas 2D (WebGL ma własną pętlę).
  _setCleanView(active) {
    active = !!active;
    if (this._cleanViewActive === active) return;
    this._cleanViewActive = active;
    if (this.uiManager) {
      this.uiManager._cleanView = active;
      this.uiManager.markDirty?.();
    }
    this.threeRenderer?.setCleanView?.(active);
  }

  // ── M3 P1.3 — Picker mode HUD banner ─────────────────────────────
  // DOM div w document.body (poza game-container; index.html nie ma HUD layer'a).
  // EventBus.on('ui:pickerModeStarted/WaypointAdded/Ended') — pokaż/aktualizuj/ukryj.
  // Cursor crosshair przez document.body.style.cursor — restore na end.
  _createPickerHUD() {
    if (this._pickerBanner) return;  // idempotent
    const banner = document.createElement('div');
    banner.id = 'kosmos-picker-banner';
    banner.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: ${THEME.bgPrimary ?? '#1a1410'};
      border: 1px solid ${THEME.accent ?? '#d8a050'};
      color: ${THEME.textPrimary ?? '#f0e0c0'};
      padding: 8px 16px; border-radius: 4px;
      font-family: ${THEME.fontFamily ?? 'monospace'};
      font-size: ${THEME.fontSizeNormal ?? 14}px;
      z-index: 9998; display: none; pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      letter-spacing: 0.3px;
    `;
    document.body.appendChild(banner);
    this._pickerBanner = banner;

    EventBus.on('ui:pickerModeStarted', ({ mode, metadata }) => {
      const intent = metadata?.intent;
      if (mode === 'patrolWaypoints' && intent === 'create_poi') {
        banner.textContent = t('picker.create.patrol.instructions');
      } else if (mode === 'targetPoint' && intent === 'create_poi') {
        const typeLabel = t(`poi.type.label.${metadata?.poiType ?? 'waypoint'}`);
        banner.textContent = t('picker.create.point.instructions', typeLabel);
      } else if (mode === 'patrolWaypoints') {
        banner.textContent = 'Klikaj waypointy patrolu (min 2). ESC anuluj, ENTER zakończ.';
      } else if (mode === 'targetPoint') {
        banner.textContent = 'Klik aby ustawić punkt. ESC anuluj.';
      } else {
        return;  // unknown mode — don't show banner
      }
      banner.style.display = 'block';
      document.body.style.cursor = 'crosshair';
    });
    EventBus.on('ui:pickerWaypointAdded', ({ total }) => {
      const remainder = total < 2 ? ` (min ${2 - total} więcej)` : ' — ENTER zakończ lub klikaj dalej.';
      banner.textContent = `Waypoint ${total} dodany${remainder}`;
    });
    EventBus.on('ui:pickerModeEnded', () => {
      banner.style.display = 'none';
      document.body.style.cursor = '';
    });
  }

  // ── M3 P2.3 — Create POI flow ───────────────────────────────────────
  // Wiązanie:
  //   ui:openPOIModal → showPOIModalCreate / showPOIModalEdit (placeholder
  //     z RightClickMenu createPOI legacy entry)
  //   ui:openCreatePOIPicker → _openCreatePOIPickerMode (5 type-specific
  //     entries z RightClickMenu)
  //
  // Flow:
  //   single-click types (waypoint/picket/rally/ambush) z PPM worldPoint
  //     → fast path: skip picker, modal otwiera się natychmiast pre-filled
  //   single-click types bez worldPoint (devtools openCreatePOIPickerMode)
  //     → enter targetPoint picker, gracz klika
  //   patrol → enter patrolWaypoints picker (min 2 + ENTER)
  _setupPOICreateFlow() {
    EventBus.on('ui:openPOIModal', ({ mode, target, poiId }) => {
      if (mode === 'create') {
        showPOIModalCreate('waypoint');
      } else if (mode === 'edit' && poiId) {
        const poi = window.KOSMOS?.poiRegistry?.getPOI?.(poiId);
        if (poi) showPOIModalEdit(poi);
      }
    });

    EventBus.on('ui:openCreatePOIPicker', ({ poiType, worldPoint }) => {
      // worldPoint z RightClickMenu PPM tactical = tactical worldPoint w gameplay px
      // (TacticalRaycaster.tacticalToWorld zwraca px). Mapa 3D PPM nie istnieje,
      // ale defensywnie obsługujemy worldPoint.z (3D format) jako fallback.
      const initialPoint = this._normalizeWorldPointToGameplay(worldPoint);
      this._openCreatePOIPickerMode(poiType, { initialPoint });
    });

    // M3 P2.3 — TARGET_POINT picker finalize z tactical map (FleetOverlay).
    EventBus.on('ui:targetPointPickerFinalize', ({ point }) => {
      this._finalizeTargetPointPicker(point);
    });
  }

  // Konwertuj worldPoint (różne formaty) → gameplay px {x,y}.
  //   tactical (P1.3.5): {x, y} już w gameplay px → return as-is.
  //   3D raycaster (P1.2): {x, y:0, z} w Three.js world coords → / WORLD_SCALE.
  _normalizeWorldPointToGameplay(wp) {
    if (!wp) return null;
    if (typeof wp.z === 'number') {
      // 3D format → gameplay
      return worldToGameplay(wp.x, wp.z);
    }
    if (typeof wp.x === 'number' && typeof wp.y === 'number') {
      return { x: wp.x, y: wp.y };
    }
    return null;
  }

  // ── M3 P2.3 — Główny entry create POI picker mode ──────────────────
  // Strategy:
  //   single-click types z initialPoint → bypass picker, modal direct
  //   single-click types bez initialPoint → enter targetPoint picker
  //   patrol → enter patrolWaypoints picker
  // PickerStateMachine 'TARGET_POINT' mode obecny ale unused — reuse'ujemy.
  _openCreatePOIPickerMode(poiType, options = {}) {
    const um = this.uiManager;
    if (!um) return;
    if (!['waypoint', 'patrol', 'picket', 'rally', 'ambush'].includes(poiType)) {
      console.warn('[GameScene] _openCreatePOIPickerMode: invalid poiType', poiType);
      return;
    }
    const initialPoint = options.initialPoint;

    if (poiType === 'patrol') {
      // Multi-click ≥2 + ENTER → modal pre-filled z waypoints
      const ok = um.setPickerMode('patrolWaypoints', (waypoints) => {
        if (!Array.isArray(waypoints) || waypoints.length < 2) return;  // cancelled
        const prefill = pickerResultToPOISpec('patrol', { waypoints });
        if (!prefill) return;
        showPOIModalCreateFromPicker('patrol', prefill);
      }, { intent: 'create_poi', poiType: 'patrol' });
      if (!ok) console.warn('[GameScene] picker mode rejected (patrol create)');
      return;
    }

    // Single-click types (waypoint/picket/rally/ambush)
    if (initialPoint) {
      // Fast path — PPM worldPoint = 1st click. Modal otwiera się natychmiast.
      const prefill = pickerResultToPOISpec(poiType, { point: initialPoint });
      if (!prefill) {
        console.warn('[GameScene] pickerResultToPOISpec failed for', poiType);
        return;
      }
      showPOIModalCreateFromPicker(poiType, prefill);
      return;
    }

    // Bez initialPoint (np. devtools) → enter targetPoint picker, gracz kliknie
    const ok = um.setPickerMode('targetPoint', (point) => {
      if (!point) return;
      const prefill = pickerResultToPOISpec(poiType, { point });
      if (!prefill) return;
      showPOIModalCreateFromPicker(poiType, prefill);
    }, { intent: 'create_poi', poiType });
    if (!ok) console.warn(`[GameScene] picker mode rejected (${poiType} create)`);
  }

  // M3 P2.3 — Finalize TARGET_POINT picker (single-click finalize).
  // PickerStateMachine.finalizePicker dla TARGET_POINT zwraca result=null —
  // inline finalize: czytaj callback, cancel state, wywołaj callback z punktem.
  _finalizeTargetPointPicker(point) {
    const um = this.uiManager;
    const ps = um?.getPickerState?.();
    if (!ps || ps.mode !== 'targetPoint') return;
    const cb = ps.callback;
    um.cancelPickerMode();  // reset state + emit ui:pickerModeEnded (banner hide)
    if (typeof cb === 'function') {
      try { cb(point); } catch (err) { console.warn('[GameScene] targetPoint cb threw:', err); }
    }
  }

  // ── Recorder toggle (Ctrl+Shift+R) ───────────────────────────────
  // Start: zaczyna nagrywać akcje EventBus. Stop: zatrzymuje + pobiera JSON.
  _toggleRecorder() {
    const rec = this.actionRecorder;
    if (!rec) return;
    if (!rec.isRecording()) {
      rec.start();
      this._showRecorderToast('● REC — nagrywanie akcji', '#e74c3c');
    } else {
      rec.stop();
      const count = rec.getActions().length;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      rec.download(`opening-${ts}.json`, { name: `opening-${ts}`, fallback: 'rule', relative: true });
      rec.clear();
      this._showRecorderToast(`■ Stop — zapisano ${count} akcji`, '#27ae60');
    }
  }

  _showRecorderToast(msg, color = '#e74c3c') {
    let toast = document.getElementById('kosmos-recorder-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'kosmos-recorder-toast';
      Object.assign(toast.style, {
        position:     'fixed',
        top:          '16px',
        right:        '16px',
        padding:      '10px 16px',
        background:   'rgba(12,8,4,0.92)',
        border:       '1px solid #d4a574',
        borderRadius: '4px',
        color:        '#f4e8d4',
        font:         '13px/1.4 "Courier New", monospace',
        zIndex:       '9999',
        pointerEvents: 'none',
        transition:   'opacity 0.3s',
      });
      document.body.appendChild(toast);
    }
    toast.style.color = color;
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }

  // ── Theme overlay (F7) ───────────────────────────────────────────
  async _toggleThemeOverlay() {
    if (!this._themeOverlay) {
      const { ThemeOverlay } = await import('../ui/ThemeOverlay.js');
      this._themeOverlay = new ThemeOverlay();
    }
    this._themeOverlay.toggle();
  }

  // ── Mysz: rozdziela kliknięcia między UI a Three.js ───────────
  // Nasłuchuje na window (gwarantuje odbiór niezależnie od z-index warstw)
  _setupMouseInput(eventLayer) {
    this._setupBoxSelect();
    window.addEventListener('click', (e) => {
      // Slice 8 — klik bezpośrednio po box-select (drag) to artefakt; pochłoń go
      // (inaczej _handleTacticalLeftClick wyczyściłby świeżo zaznaczony zbiór).
      if (this._boxSelectConsumedClick) { this._boxSelectConsumedClick = false; return; }
      // #5 (S3.4b review) — klik zaraz po przeciągnięciu pływającego panelu = artefakt; pochłoń
      // (inaczej _handleTacticalLeftClick zdeselekcjonowałby ciało / wyczyścił zaznaczenie floty).
      if (this.uiManager?._panelDragConsumedClick) { this.uiManager._panelDragConsumedClick = false; return; }
      // Propaguj modifiery kliku do ColonyOverlay (multi-select shift/ctrl)
      const overlay = this.uiManager?.overlayManager?.overlays?.colony;
      if (overlay) overlay._lastMouseMods = { shift: e.shiftKey, ctrl: e.ctrlKey };
      // Slice 8b — modifiery kliku do Outlinera (CTRL+klik statku = multi-select w drawerze).
      const outl = this.uiManager?._outliner;
      if (outl) outl._lastMouseMods = { shift: e.shiftKey, ctrl: e.ctrlKey };
      // 4f-3 — modifiery kliku do Doku taktycznego (CTRL+klik wiersza = multi-toggle, jak Outliner).
      const dock = this.uiManager?.tacticalDock;
      if (dock) dock._lastMouseMods = { shift: e.shiftKey, ctrl: e.ctrlKey };
      if (this.planetScene?.isOpen) return;
      // Blokuj kliknięcia gdy DOM modal/menu jest na wierzchu
      if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return;
      if (e.target.closest && e.target.closest('.kosmos-menu-panel')) return;
      // Ignoruj drag kamery — ale NIE gdy overlay jest otwarty
      // (overlay blokuje kamerę przez isOverUI, więc _hasMoved jest stałe)
      const wasDrag = this.cameraController.wasDrag;
      this.cameraController._hasMoved = false;
      if (wasDrag && !this.uiManager.overlayManager.isAnyOpen()) return;

      const x = e.clientX;
      const y = e.clientY;

      // Najpierw UI, potem 3D
      if (!this.uiManager.handleClick(x, y)) {
        this.threeRenderer.handleClick(x, y);
        // M3 P1.2: tactical map left click → selection / deselect via raycaster.
        // Wykonywane PO threeRenderer.handleClick (dblclick focus dalej działa).
        // wasDrag już sprawdzone wyżej (ignored gdy camera drag) — tutaj dodatkowych guardów nie ma.
        this._handleTacticalLeftClick(e);
      }
    });

    // Prawy klik — blokuj natywne menu przeglądarki (wygląda jak HTML, nie jak gra).
    // Wyjątek: inputy tekstowe (ModalInput, pola liczby) — tam menu native daje copy/paste.
    // Następnie ewentualny rozkaz ruchu jednostki naziemnej (ColonyOverlay).
    window.addEventListener('contextmenu', (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      e.preventDefault();

      // M3 P1.3.5 — FleetOverlay tactical map = primary command surface.
      // PPM w obszarze tactical mapy → emit ui:rightClickMenuOpened przez
      // FleetOverlay.handleRightClick (nie raycaster 3D). Wcześniej w prompcie
      // P1.2/P1.3 tactical handlers targetowały mapę 3D układu — Filip's reframe
      // zmienia: mapa 3D = read-only "telewizor", orders przez tactical 2D.
      const fleetOv = this.uiManager?.overlayManager?.overlays?.fleet;
      if (fleetOv?.isVisible && fleetOv.handleRightClick) {
        // KEEP IN SYNC z UI_SCALE pattern w UIManager (rawX / UI_SCALE).
        const uiScaleFleet = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
        if (fleetOv.handleRightClick(e.clientX / uiScaleFleet, e.clientY / uiScaleFleet)) {
          return;
        }
      }

      const overlay = this.uiManager?.overlayManager?.overlays?.colony;
      if (!overlay?.visible || !overlay._selectedUnit) {
        // M3 P1.2: tactical map right click → context menu via raycaster.
        // ELSE branch — ColonyOverlay ground unit flow zachowany (early-return).
        // Note: gdy FleetOverlay otwarty, _handleTacticalRightClick early-returns
        // przez overlayManager.isAnyOpen() guard (commit f2b7e75).
        this._handleTacticalRightClick(e);
        return;
      }

      // Guard: gracz nie może kierować wrogimi jednostkami (owner !== 'player')
      const selected = overlay._selectedUnit;
      const isPlayerOwned = !selected.owner || selected.owner === 'player';
      if (!isPlayerOwned) {
        overlay._showFlash?.('Nie możesz kierować wrogą jednostką');
        return;
      }

      const colony = overlay._getColony();
      const grid = colony ? overlay._getGrid(colony) : null;
      if (!grid) return;
      const uiScale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
      const sx = e.clientX / uiScale, sy = e.clientY / uiScale;
      const tile = overlay._screenToTile(sx, sy, grid);
      if (tile) {
        // Sprint 3 placeholder: pętla po _selectedUnits gdy multi-select będzie gotowy.
        // MVP: tylko zaznaczona jednostka (player-owned — zweryfikowane powyżej).
        const gum = window.KOSMOS?.groundUnitManager;
        const selectedIds = overlay._selectedUnits instanceof Set && overlay._selectedUnits.size > 0
          ? [...overlay._selectedUnits]
          : [selected.id];
        for (const uid of selectedIds) {
          const u = gum?.getUnit?.(uid);
          if (u && (!u.owner || u.owner === 'player')) {
            gum.moveUnit(uid, tile.q, tile.r);
          }
        }
      }
    });

    // Victoria 2 stack combat: log rund i raporty końcowe bitew
    EventBus.on('combat:round', ({ planetId, q, r, round, playerLosses, enemyLosses }) => {
      const log = this.eventLogSystem;
      if (!log?.push) return;
      const pl = playerLosses ?? {};
      const en = enemyLosses ?? {};
      const pKilled = pl.killed ?? 0, eKilled = en.killed ?? 0;
      const pDmg = pl.dmgDealt ?? 0, eDmg = en.dmgDealt ?? 0;
      // Wpis per runda — zwięzły format
      let text = `⚔ Bitwa (${q},${r}) runda ${round}`;
      if (pKilled > 0 || eKilled > 0) text += ` · straty: gracz −${pKilled}, wróg −${eKilled}`;
      text += ` · dmg: gracz ${pDmg}→, wróg ${eDmg}→`;
      const severity = pKilled > 0 ? 'alert' : (eKilled > 0 ? 'warn' : 'info');
      log.push({ text, channel: 'combat', severity, entityRef: planetId });
    });

    EventBus.on('combat:hexResolved', ({ planetId, q, r, winnerId, playerKilled, enemyKilled, playerDmg, enemyDmg }) => {
      const log = this.eventLogSystem;
      if (log?.push) {
        let text;
        let severity;
        if (winnerId === 'player') {
          text = `⚔ Zwycięstwo (${q},${r}) — wróg zneutralizowany. Straty własne: ${playerKilled}, zadano ${playerDmg} dmg.`;
          severity = 'info';
        } else if (winnerId && winnerId !== 'player') {
          text = `💀 Przegrana (${q},${r}) — własne wojsko wybite. Straty: ${playerKilled}, zadano wrogowi ${playerDmg} dmg.`;
          severity = 'alert';
        } else {
          text = `⚔ Bitwa (${q},${r}) zakończona remisem. Straty: ${playerKilled} / ${enemyKilled}.`;
          severity = 'warn';
        }
        log.push({ text, channel: 'combat', severity, entityRef: planetId });
      }

      // Globalny modal — zawsze widoczny, niezależnie od otwartego overlay
      import('../ui/BattleReportModal.js').then(({ showBattleReport }) => {
        const entity = EntityManager.get(planetId);
        showBattleReport({
          winnerId, q, r,
          planetName: entity?.name ?? planetId,
          playerKilled, enemyKilled, playerDmg, enemyDmg,
        });
      }).catch(() => { /* ignore */ });
    });

    // Dwuklik na planetę/księżyc → otwórz ColonyOverlay
    // Dwuklik na vessel/wrak → fokus kamery (bliski zoom, śledzenie)
    window.addEventListener('dblclick', (e) => {
      if (this.planetScene?.isOpen) return;
      if (this.uiManager?.overlayManager?.isAnyOpen()) return;
      // Faza 4 (Dok taktyczny) + higiena: dwuklik nad panelem UI (dok/panele floty/stacji)
      // NIE fokusuje statku „pod spodem" — 3D picking tylko nad odsłoniętą mapą.
      if (this.uiManager?.isOverUI?.(e.clientX, e.clientY)) return;

      // Najpierw vessel — hover state łapie go niezależnie od rozmiaru sprite.
      // Screen-space picking zwiększamy do 50px (sprite ma często <5px na ekranie).
      const vesselId = this.threeRenderer._hoverVesselId
                    ?? this.threeRenderer._getVesselAtScreen?.(e.clientX, e.clientY, 50);
      if (vesselId) {
        EventBus.emit('vessel:focus', { vesselId });
        return;
      }

      let entity = this.threeRenderer.getEntityAtScreen(e.clientX, e.clientY);
      if (!entity || (entity.type !== 'planet' && entity.type !== 'moon')) {
        const focusId = this.threeRenderer._focusEntityId;
        if (focusId) entity = EntityManager.get(focusId);
      }
      if (!entity) return;

      // Tryb cywilizacyjny + ciało z kolonią → otwórz ColonyOverlay z animacją
      if (window.KOSMOS?.civMode && this.colonyManager.hasColony(entity.id)) {
        this.colonyManager.switchActiveColony(entity.id);
        const screenPos = this.threeRenderer.getScreenPosition(entity.id);
        this.uiManager.overlayManager.openPanel('colony', {
          originX: screenPos?.x ?? window.innerWidth / 2,
          originY: screenPos?.y ?? window.innerHeight / 2,
        });
        return;
      }

      // Planeta z życiem (lifeScore > 80) → kolonizuj
      if (!window.KOSMOS?.civMode && entity.type === 'planet' && entity.lifeScore > 80) {
        EventBus.emit('planet:colonize', { planet: entity });
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.planetScene?.isOpen) return;
      if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return;
      // Propaguj modifier state do overlay'a (żeby rect-select z Ctrl/Shift działał od mousedown)
      const overlay = this.uiManager?.overlayManager?.overlays?.colony;
      if (overlay) overlay._lastMouseMods = { shift: e.shiftKey, ctrl: e.ctrlKey };
      this.uiManager.handleMouseDown(e.clientX, e.clientY, e.button);
    });

    window.addEventListener('mouseup', (e) => {
      if (this.planetScene?.isOpen) return;
      if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return;
      this.uiManager.handleMouseUp(e.clientX, e.clientY, e.button);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.planetScene?.isOpen) return;

      const x = e.clientX;
      const y = e.clientY;

      this.uiManager.handleMouseMove(x, y);
      this.threeRenderer.handleMouseMove(x, y);

      // M3 P1.5 — universal tooltip canvas hover dispatch.
      // Skipujemy gdy modal otwarty (modal eats focus) lub gdy DOM tooltip
      // już aktywny (data-tooltip path obsługiwany przez Tooltip.js listenery).
      this._dispatchTooltipHover(e.target?.id, x, y);
    });
  }

  // ── M3 P1.5 — tooltip hover dispatch ─────────────────────────────────────
  // Dual-canvas: #three-canvas (mapa 3D) → RaycasterPure (P1.2),
  //              #ui-canvas    (tactical, FleetOverlay) → FleetOverlay.resolveHoverInfo
  //              + cancel button hint via hit zone 'cancel_movement_order'.
  // Single tooltip instance w `this.tooltip`. Schedule używa key (entityId lub
  // ui-hint id) żeby NIE flickerować przy mousemove w obrębie tego samego targetu.
  _dispatchTooltipHover(targetId, clientX, clientY) {
    const tooltip = this.tooltip;
    if (!tooltip) return;
    if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) {
      tooltip.cancelSchedule(); tooltip.hide();
      return;
    }

    // Fleet Atlas/Cluster — dedicated path, bypass całego routingu canvas.
    // Powód: poprzedni fix (resolveHoverInfo + tactical fallback) nie działał
    // w praktyce — najprawdopodobniej e.target.id nie matchował 'three-canvas'
    // ani 'ui-canvas' (event-layer capture'uje), więc cały tooltip path był
    // skip'owany. Tu wprost sprawdzamy stan fleet i robimy atlas hit-test
    // niezależnie od targetId.
    const fleetForAtlas = this.uiManager?.overlayManager?.overlays?.fleet;
    if (fleetForAtlas?._visible && (fleetForAtlas._showAtlas || fleetForAtlas._showCluster)) {
      this._tooltipHoverFromFleetAtlas(clientX, clientY, fleetForAtlas);
      return;
    }

    // DOM elements z data-tooltip — sam Tooltip.js obsługuje przez global mouseover/mouseout,
    // tu tylko canvas paths.
    // M3 P1.5 post-fix #1: planet-canvas (z=4) capture'uje WSZYSTKIE mouse
    // events nad mapą — events nigdy nie docierają do ui-canvas mimo że
    // tactical map jest tam renderowana. Bound check (fleetOv._mapBounds w
    // przestrzeni ui-canvas-local) rozróżnia tactical region od mapy 3D.
    // Pattern z P1.2 post-fix #2 (CANVAS bypass dla isOverUI), tutaj dla mousemove.
    const isMainCanvas = (targetId === 'three-canvas' || targetId === 'planet-canvas');
    if (isMainCanvas) {
      const fleetOv = this.uiManager?.overlayManager?.overlays?.fleet;
      const b = fleetOv?._visible ? fleetOv._mapBounds : null;
      if (b) {
        // _mapBounds żyje w ui-canvas-local (po UI_SCALE) — konwertujemy clientX/Y
        const local = this.uiManager?.toLocalUI?.(clientX, clientY);
        if (local
          && local.x >= b.x && local.x <= b.x + b.w
          && local.y >= b.y && local.y <= b.y + b.h) {
          this._tooltipHoverFromTactical(clientX, clientY);
          return;
        }
      }
      this._tooltipHoverFromMain3D(clientX, clientY);
      return;
    }
    if (targetId === 'ui-canvas') {
      // Fallback — gdyby planet-canvas miał display:none / pointer-events:none.
      this._tooltipHoverFromTactical(clientX, clientY);
      return;
    }
    // Inny element (np. DOM panel) — anuluj canvas hover (DOM data-tooltip
    // handler robi własną pracę).
    if (this._tooltipHoverState.key !== null) {
      this._tooltipHoverState.key = null;
      tooltip.cancelSchedule();
      tooltip.hide();
    }
  }

  // Dedicated path dla Fleet Atlas/Cluster — niezależny od e.target.id routingu.
  // Iteruje fleet._hitZones bezpośrednio (nie przez findHitZone, który filtruje
  // tylko tactical types). Hit na 'map_body' → entity tooltip; brak hit → cancel.
  // NIGDY nie wpada w coord tooltip — atlas nie jest mapą świata.
  _tooltipHoverFromFleetAtlas(clientX, clientY, fleet) {
    const local = this.uiManager?.toLocalUI?.(clientX, clientY);
    if (!local) {
      this._scheduleEntityTooltip(null, clientX, clientY);
      return;
    }
    const mx = local.x, my = local.y;
    const zones = fleet._hitZones ?? [];
    // Reverse iter — atlas rows pushed in order, last visible wygrywa przy overlap
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (!z || z.type !== 'map_body') continue;
      if (mx < z.x || mx > z.x + z.w || my < z.y || my > z.y + z.h) continue;
      const bodyId = z.data?.bodyId;
      if (!bodyId) break;
      const body = EntityManager.get(bodyId);
      if (!body) break;
      this._scheduleEntityTooltip(
        { type: 'planet', entityId: bodyId, planet: body, worldPoint: null },
        clientX, clientY,
      );
      return;
    }
    // Brak hit — cancel tooltip (NIE coord tooltip)
    this._scheduleEntityTooltip(null, clientX, clientY);
  }

  _tooltipHoverFromMain3D(clientX, clientY) {
    // Fullscreen overlay zakrywa mapę 3D — żaden hover nie trafia
    if (this.uiManager?.overlayManager?.isAnyOpen?.()) {
      this._scheduleEntityTooltip(null, clientX, clientY);
      return;
    }
    // Slice 8b — kursor nad pływającym panelem (FleetGroupPanel/StationPanel) na #ui-canvas:
    // nie pokazuj tooltipa mapy 3D (koordynaty/encja) przebijającego przez panel.
    if (this.uiManager?.isPointerOverFloatingPanel?.(clientX, clientY)) {
      this._scheduleEntityTooltip(null, clientX, clientY);
      return;
    }
    const target = this._resolveClickTarget(clientX, clientY);
    if (!target || target.type === 'empty') {
      // M3 P2.3 — coord tooltip dla empty space (override P1.5 D2 = no tooltip)
      // 3D worldPoint to Three.js coords (XZ plane Y=0). Konwersja → gameplay px.
      const wp = target?.worldPoint;
      if (wp && typeof wp.x === 'number' && typeof wp.z === 'number') {
        const gp = worldToGameplay(wp.x, wp.z);
        if (gp) {
          this._scheduleCoordTooltip(gp, clientX, clientY);
          return;
        }
      }
      this._scheduleEntityTooltip(null, clientX, clientY);
      return;
    }
    this._scheduleEntityTooltip(target, clientX, clientY);
  }

  _tooltipHoverFromTactical(clientX, clientY) {
    const fleet = this.uiManager?.overlayManager?.overlays?.fleet;
    if (!fleet?.resolveHoverInfo) {
      this._scheduleEntityTooltip(null, clientX, clientY);
      return;
    }
    // Convert clientX/Y → ui-canvas local px (UI_SCALE applied — same jak handleRightClick path)
    const local = this.uiManager?.toLocalUI?.(clientX, clientY);
    if (!local) {
      this._scheduleEntityTooltip(null, clientX, clientY);
      return;
    }
    const info = fleet.resolveHoverInfo(local.x, local.y);
    // Atlas/Cluster — żaden tooltip (kind:'none' różni się od null żeby
    // NIE wpadać w coord-tooltip fallback, bo _mapBounds pokrywa region Atlas).
    if (info?.kind === 'none') {
      this._scheduleEntityTooltip(null, clientX, clientY);
      return;
    }
    // Defensive guard — gdyby _dispatchTooltipHover nie złapał atlas/cluster
    // (np. ścieżka via 'ui-canvas' targetId), nigdy nie pokazuj coord tooltipa
    // nad atlasem/clusterem. Atlas != mapa świata.
    if (fleet._showAtlas || fleet._showCluster) {
      this._scheduleEntityTooltip(null, clientX, clientY);
      return;
    }
    if (!info) {
      // M3 P2.3 — coord tooltip dla empty space w obrębie tactical map bounds.
      // resolveHoverInfo zwraca null gdy outside mapBounds LUB empty hit.
      // Re-check bounds: jeśli inside → coord tooltip, inaczej cancel.
      const mb = fleet._mapBounds;
      if (mb && local.x >= mb.x && local.x <= mb.x + mb.w
          && local.y >= mb.y && local.y <= mb.y + mb.h) {
        const wp = tacticalToWorld(local.x, local.y, fleet._mapViewState);
        if (wp) {
          this._scheduleCoordTooltip(wp, clientX, clientY);
          return;
        }
      }
      this._scheduleEntityTooltip(null, clientX, clientY);
      return;
    }
    if (info.kind === 'entity') {
      this._scheduleEntityTooltip(info.target, clientX, clientY);
      return;
    }
    if (info.kind === 'uiHint') {
      const textKey = info.textKey;
      const text = t(textKey);
      const key = `uiHint:${textKey}`;
      if (this._tooltipHoverState.key !== key) {
        this._tooltipHoverState.key = key;
        this.tooltip.schedule(text, { x: clientX, y: clientY }, key);
      }
      return;
    }
    this._scheduleEntityTooltip(null, clientX, clientY);
  }

  _scheduleEntityTooltip(target, clientX, clientY) {
    const tooltip = this.tooltip;
    if (!target) {
      if (this._tooltipHoverState.key !== null) {
        this._tooltipHoverState.key = null;
        tooltip.cancelSchedule(); tooltip.hide();
      }
      return;
    }
    // Skip empty/unsupported types (D2: A — empty no tooltip)
    const supportedTypes = ['ownVessel', 'enemyVessel', 'vessel', 'planet', 'poi'];
    if (!supportedTypes.includes(target.type)) {
      if (this._tooltipHoverState.key !== null) {
        this._tooltipHoverState.key = null;
        tooltip.cancelSchedule(); tooltip.hide();
      }
      return;
    }
    const entityId = target.entityId ?? target.vessel?.id ?? target.planet?.id ?? target.poi?.id ?? null;
    if (!entityId) return;
    const key = `entity:${target.type}:${entityId}`;
    if (this._tooltipHoverState.key === key) return;  // same target — no flicker
    this._tooltipHoverState.key = key;

    const entity = target.vessel ?? target.planet ?? target.poi
      ?? this._lookupTooltipEntity(target.type, entityId);
    const content = getTooltipContent(target.type, entity, this._tooltipDeps());
    if (!content) {
      tooltip.cancelSchedule(); tooltip.hide();
      return;
    }
    tooltip.schedule(content, { x: clientX, y: clientY }, key);
  }

  _lookupTooltipEntity(type, entityId) {
    if (type === 'ownVessel' || type === 'enemyVessel' || type === 'vessel') {
      return window.KOSMOS?.vesselManager?.getVessel?.(entityId) ?? null;
    }
    if (type === 'poi') {
      return window.KOSMOS?.poiRegistry?.getPOI?.(entityId) ?? null;
    }
    if (type === 'planet') {
      return EntityManager.get(entityId) ?? null;
    }
    return null;
  }

  _tooltipDeps() {
    return {
      t,
      colonyManager:   window.KOSMOS?.colonyManager ?? null,
      empireRegistry:  window.KOSMOS?.empireRegistry ?? null,
      auToPx:          GAME_CONFIG.AU_TO_PX,  // M3: distance computation w _planetContent
    };
  }

  // M3 P2.3 — coord tooltip dla empty space hover (mapa 3D + tactical).
  // Override P1.5 D2 (no tooltip on empty) — Filip's feature request.
  // gameplayPoint w gameplay px ({x, y}). Format: "Pozycja: (123.4, -67.8)".
  _scheduleCoordTooltip(gameplayPoint, clientX, clientY) {
    const tooltip = this.tooltip;
    if (!tooltip || !gameplayPoint) return;
    const x = Math.round(gameplayPoint.x * 10) / 10;
    const y = Math.round(gameplayPoint.y * 10) / 10;
    const text = t('coord.tooltip.label', x.toFixed(1), y.toFixed(1));
    const key = 'coord:tooltip';  // single key — re-use existing schedule, no flicker
    if (this._tooltipHoverState.key === key) {
      // Same key — update content w-place gdyby dropił hide. Tooltip.schedule
      // z tym samym key pozostawia timer aktywnym (mousemove no-flicker).
      tooltip.schedule({ lines: [text] }, { x: clientX, y: clientY }, key);
      return;
    }
    this._tooltipHoverState.key = key;
    tooltip.schedule({ lines: [text] }, { x: clientX, y: clientY }, key);
  }

  // ── M3 P1.2 — Tactical map mouse interactions (raycaster) ─────────────
  // Lewy klik (z istniejącego window 'click' handler — wasDrag już sprawdzony):
  //   ownVessel sprite → setSelectedVesselId (secondary flow §5.1)
  //   empty → clearSelection (Q6)
  //   POI/planet/enemyVessel → no-op (P1.5 doda tooltip)
  // Prawy klik (z istniejącego 'contextmenu' handler — ELSE branch po
  // ColonyOverlay early-return):
  //   emit ui:rightClickMenuOpened z target shape z resolveTargetFromHits.
  // Slice 8 (box-select) — SHIFT+LPM drag na mapie 3D = marquee zaznaczenia własnych
  // statków. Kamera nie orbituje przy SHIFT (ThreeCameraController guard). +CTRL = dodaj
  // do zbioru (bez czyszczenia). Gate FEATURES.fcMultiSelect. Marquee rysuje UIManager.
  _setupBoxSelect() {
    const onMap = (e) => {
      if (this.planetScene?.isOpen) return false;
      if (this.uiManager?.overlayManager?.isAnyOpen?.()) return false;
      const tgt = e.target;
      const isCanvasish = tgt?.tagName === 'CANVAS' || tgt?.id === 'event-layer' || tgt?.id === 'three-canvas';
      if (!isCanvasish) return false;
      if (this.uiManager?.isOverUI?.(e.clientX, e.clientY)) return false;  // nie nad chrome UI
      return true;
    };
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this._boxSelectConsumedClick = false; if (this.uiManager) this.uiManager._panelDragConsumedClick = false; }  // świeży start interakcji
      if (!GAME_CONFIG.FEATURES?.fcMultiSelect) return;
      if (e.button !== 0 || !e.shiftKey) return;
      if (!onMap(e)) return;
      this._boxSel = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, additive: e.ctrlKey };
      this.uiManager._marqueeRect = { ...this._boxSel };
    });
    window.addEventListener('mousemove', (e) => {
      if (!this._boxSel) return;
      this._boxSel.x1 = e.clientX; this._boxSel.y1 = e.clientY;
      this.uiManager._marqueeRect = { x0: this._boxSel.x0, y0: this._boxSel.y0, x1: e.clientX, y1: e.clientY };
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;   // tylko LPM finalizuje box-select (PPM/MPM mid-drag nie urywa)
      if (!this._boxSel) return;
      const box = this._boxSel;
      this._boxSel = null;
      this.uiManager._marqueeRect = null;
      const dx = Math.abs(box.x1 - box.x0), dy = Math.abs(box.y1 - box.y0);
      if (dx < 4 && dy < 4) return;  // za mały drag → click handler zrobi single-select
      this._boxSelectConsumedClick = true;  // pochłoń artefaktowy click po dragu
      const ids = this.threeRenderer?._getOwnVesselsInScreenRect?.(box.x0, box.y0, box.x1, box.y1) ?? [];
      if (!box.additive) this.uiManager.clearSelection();
      for (const id of ids) this.uiManager.addToSelection(id);
    });
  }

  _handleTacticalLeftClick(e) {
    if (this.planetScene?.isOpen) return;
    if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return;
    if (e.target?.closest && e.target.closest('.kosmos-menu-panel')) return;
    // P1.3.5 post-fix #1 (D2 reinforcement) — Strategy A pełna:
    // mapa 3D = read-only "telewizor". Orders dispatchowane wyłącznie
    // przez tactical map w FleetOverlay. Mapa 3D LMB no-op niezależnie
    // od overlay state (poprzedni isAnyOpen() guard działał tylko gdy
    // overlay otwarty — z FleetOverlay zamkniętym furtka była otwarta).
    const targetId = e.target?.id;
    const isMapCanvas = (targetId === 'three-canvas' || targetId === 'planet-canvas');
    // Fleet Command Console (Slice 0) — mapa 3D NIE jest już read-only dla selekcji.
    // Zwykły klik = zaznacz OWN statek przez NIEZAWODNY screen-space picker
    // (_getVesselAtScreen; raycast tonie na sub-pikselowych GLB skala 0.002-0.012).
    // Picker mode (POI/patrol) padają do worldPoint flow niżej. Rollback: fcConsole=false → no-op.
    if (isMapCanvas) {
      if (!GAME_CONFIG.FEATURES?.fcConsole) return;
      if (!this.uiManager?.isPickerActive?.()) {
        const tr = this.threeRenderer;
        const vid = tr?._getVesselAtScreen?.(e.clientX, e.clientY, 40);
        // Slice 8 — CTRL+klik = toggle do zbioru (multi-select); inaczej single-select.
        const multi = GAME_CONFIG.FEATURES?.fcMultiSelect && e.ctrlKey;
        if (vid) {
          const v = window.KOSMOS?.vesselManager?.getVessel?.(vid);
          if (v && !isEnemyVessel(v)) {
            if (multi) this.uiManager.toggleSelection(vid);
            else       this.uiManager.setSelectedVesselId(vid);
            return;
          }
          if (v) return;  // wrogi statek pod kursorem — nie zaznaczamy (P1.2 semantyka), bez deselect
        }
        if (!multi) this.uiManager.clearSelection();  // klik w pustkę/ciało → deselekcja (CTRL+pustka zachowuje zbiór)
        return;
      }
      // picker aktywny → kontynuuj do worldPoint flow niżej (NIE return)
    }
    // Fullscreen overlay (FleetOverlay/IntelOverlay/...) zakrywa 3D mapę układu
    // — lewy klik NIE może raycast'ować przez niego do 3D sceny.
    // (W normalnym flow uiManager.handleClick i tak by to wcześniej pochłonął;
    //  ten guard jest defensywny dla edge-case'ów out-of-bounds w overlayu.)
    if (this.uiManager?.overlayManager?.isAnyOpen?.()) return;
    // isOverUI zwraca true dla CAŁEGO viewportu gdy overlayManager.isAnyOpen() (UIManager.js:794)
    // — bypass gdy target to CANVAS (game viewport): planet-canvas z=4 persistent
    // overlay przejmuje eventy z mapy galaktycznej; three-canvas z=1 dla typowego flow.
    // DOM panele/modale mają target.tagName !== 'CANVAS' → isOverUI dalej blokuje je.
    const isGameCanvas = e.target?.tagName === 'CANVAS';
    if (!isGameCanvas && this.uiManager?.isOverUI?.(e.clientX, e.clientY)) return;

    const target = this._resolveClickTarget(e.clientX, e.clientY);
    if (!target) return;

    // M3 P1.3 — picker mode left-click ZAWSZE wygrywa nad normalnym selection flow.
    // patrolWaypoints: każdy klik dodaje waypoint (worldPoint XZ → XY w UIManager.addPickerWaypoint).
    // M3 P2.3: targetPoint (create POI single-click) — finalize z gameplay px point.
    const um = this.uiManager;
    if (um?.isPickerActive?.()) {
      const ps = um.getPickerState();
      if (target.worldPoint) {
        // 3D worldPoint w Three.js coords (XZ plane Y=0). Konwersja → gameplay px.
        const gp = worldToGameplay(target.worldPoint.x, target.worldPoint.z);
        if (gp) {
          if (ps?.mode === 'patrolWaypoints') {
            um.addPickerWaypoint(gp);
          } else if (ps?.mode === 'targetPoint') {
            // Inline finalize: zapisz point w metadata, wywołaj callback bezpośrednio.
            this._finalizeTargetPointPicker(gp);
          }
        }
      }
      return;  // NIE robić selection/deselect w picker mode
    }

    if (target.type === 'ownVessel') {
      this.uiManager.setSelectedVesselId(target.entityId);
    } else if (target.type === 'empty') {
      this.uiManager.clearSelection();
    }
    // POI/planet/enemyVessel — left-click no-op w P1.2 (tooltip w P1.5).
  }

  _handleTacticalRightClick(e) {
    if (this.planetScene?.isOpen) return;
    if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return;
    if (e.target?.closest && e.target.closest('.kosmos-menu-panel')) return;
    // P1.3.5 post-fix #1 (D2 reinforcement) — Strategy A pełna:
    // mapa 3D = read-only "telewizor". PPM zawsze ignored, niezależnie od
    // overlay state. Orders dispatch wyłącznie przez tactical map w
    // FleetOverlay (FleetManagerOverlay.handleRightClick z GameScene
    // contextmenu route, P1.3.5 commit 0c720d9).
    const targetId = e.target?.id;
    const isMapCanvas = (targetId === 'three-canvas' || targetId === 'planet-canvas');
    // Fleet Command Console (Slice 7) — PPM wydaje rozkazy WPROST z mapy 3D
    // (read-only "telewizor" zniesione). Rollback: fcCommandFromMap=false → no-op na mapie.
    if (isMapCanvas && !GAME_CONFIG.FEATURES?.fcCommandFromMap) return;
    // Fullscreen overlay (FleetOverlay/IntelOverlay/...) zakrywa 3D mapę układu —
    // PPM NIE może raycast'ować przez niego. FleetOverlay PPM route'owany osobno
    // (contextmenu → handleRightClick przed tym handlerem), więc ten guard
    // zapobiega podwójnemu dispatchowi (single owner = RightClickMenu singleton).
    if (this.uiManager?.overlayManager?.isAnyOpen?.()) return;
    // Patrz _handleTacticalLeftClick — bypass isOverUI dla CANVAS targetów
    // (game viewport), DOM panele dalej blokowane.
    const isGameCanvas = e.target?.tagName === 'CANVAS';
    if (!isGameCanvas && this.uiManager?.isOverUI?.(e.clientX, e.clientY)) return;

    let target = this._resolveClickTarget(e.clientX, e.clientY);
    if (!target) return;

    // Slice 7 FIX — worldPoint z raycastu to Three.js WORLD coords (÷WORLD_SCALE=10);
    // MOS.issueOrder(moveToPoint) wymaga GAMEPLAY coords (AU×110). Bez konwersji cel był
    // 10× za blisko origin → „order rejected: unreachable target". Wzór: picker worldToGameplay.
    if (target.worldPoint) {
      const gp = worldToGameplay(target.worldPoint.x, target.worldPoint.z);
      if (gp) target = { ...target, worldPoint: { x: gp.x, y: gp.y } };
    }

    // Niezawodny screen-space vessel pick (raycast tonie na sub-pikselowych GLB 0.002-0.012).
    // Nadpisuje target gdy statek pod kursorem; wróg tylko gdy intel ≥ contact (fog-of-war)
    // — inaczej brak opcji engage/pursue na niewykrytego fantoma.
    const tr = this.threeRenderer;
    const vid = tr?._getVesselAtScreen?.(e.clientX, e.clientY, 40);
    if (vid) {
      const v = window.KOSMOS?.vesselManager?.getVessel?.(vid);
      if (v && !isEnemyVessel(v)) {
        target = { type: 'ownVessel', entityId: vid, worldPoint: target.worldPoint };
      } else if (v && tr._isEnemyTargetable?.(vid)) {
        // Wróg WYKRYTY (≥rumor) — można nakazać engage/pursue na kontakt radarowy.
        target = { type: 'enemyVessel', entityId: vid, worldPoint: target.worldPoint };
      }
      // niewykryty wróg (unknown) → zostaw target z raycastu (empty/body), brak menu na fantoma
    }

    EventBus.emit('ui:rightClickMenuOpened', {
      target,
      screenPoint: { x: e.clientX, y: e.clientY },
    });
  }

  _resolveClickTarget(clientX, clientY) {
    const tr = this.threeRenderer;
    if (!tr) return null;
    const canvas = tr.getCanvas?.();
    const camera = tr.getCamera?.();
    const scene = tr.getScene?.();
    const raycaster = tr.getRaycaster?.();
    if (!canvas || !camera || !scene || !raycaster) return null;

    const ndc = mouseToNDC(clientX, clientY, canvas);
    const { hits, worldPoint } = castRay(ndc, camera, scene, raycaster);
    // currentEmpireId vestigial w resolveTargetFromHits — own/enemy detection
    // przez tolerancyjny 3-field check (vessel.isEnemy/owner/ownerEmpireId).
    // TODO M4: jeśli multi-player → zastąp helperem getPlayerOwnerId().
    return resolveTargetFromHits(hits, worldPoint, 'player');
  }
}
