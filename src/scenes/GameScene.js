// Główna scena gry — zarządza symulacją układu słonecznego
// Przepisana: bez Phasera, czyste JS + Three.js renderer
//
// Inicjalizuje wszystkie systemy, ThreeRenderer, UIManager.
// Komunikacja wyłącznie przez EventBus.

import EventBus              from '../core/EventBus.js';
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
import { ResourceSystem }    from '../systems/ResourceSystem.js';
import { CivilizationSystem } from '../systems/CivilizationSystem.js';
import { BuildingSystem }    from '../systems/BuildingSystem.js';
import { TechSystem }        from '../systems/TechSystem.js';
import { MissionSystem }    from '../systems/MissionSystem.js';
import { ColonyManager }      from '../systems/ColonyManager.js';
import { VesselManager }      from '../systems/VesselManager.js';
import { RandomEventSystem }  from '../systems/RandomEventSystem.js';
import { FactorySystem }      from '../systems/FactorySystem.js';
import { DepositSystem }         from '../systems/DepositSystem.js';
import { ImpactDamageSystem }    from '../systems/ImpactDamageSystem.js';
import { CivilianTradeSystem }  from '../systems/CivilianTradeSystem.js';
import { ProductionRequestBoard } from '../systems/ProductionRequestBoard.js';
import TradeLog                 from '../systems/TradeLog.js';
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
import { spawnTestEnemy, spawnEnemyFleet, spawnEnemyCiv, spawnEnemyAttack } from '../debug/SpawnTestEnemy.js';
import { loadCombatSandbox, sandboxInfo, sandboxResetPositions, sandboxSpawnMoreEnemies } from '../scenarios/CombatSandbox.js';
import { formatStatLine, formatStatLineWithCursor, formatSectionTitle } from '../ui/TerminalPopupBase.js';
import { SystemGenerator }   from '../generators/SystemGenerator.js';
import { GalaxyGenerator }   from '../generators/GalaxyGenerator.js';
import { EmpireGenerator }   from '../generators/EmpireGenerator.js';
import { EmpireRegistry }    from '../systems/EmpireRegistry.js';
import { IntelSystem }       from '../systems/IntelSystem.js';
import { DiplomacySystem }   from '../systems/DiplomacySystem.js';
import { AlienCivSystem }    from '../systems/AlienCivSystem.js';
import { WarSystem }         from '../systems/WarSystem.js';
import { InvasionSystem }    from '../systems/InvasionSystem.js';
import { EnemyAttackHandler } from '../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem } from '../systems/OrbitalSpaceSystem.js';
import { MovementOrderSystem } from '../systems/MovementOrderSystem.js';
import { EmpireFleetMaterializer } from '../systems/EmpireFleetMaterializer.js';
import { ProximitySystem } from '../systems/ProximitySystem.js';
import { VesselCombatSystem } from '../systems/VesselCombatSystem.js';
import { AutoRetreatSystem } from '../systems/AutoRetreatSystem.js';
import { HULLS } from '../data/HullsData.js';
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
import { ThreeRenderer }     from '../renderer/ThreeRenderer.js';
import { ThreeCameraController } from '../renderer/ThreeCameraController.js';
import { UIManager }         from './UIManager.js';
import { PlanetScene }       from './PlanetScene.js';
import { GAME_CONFIG }       from '../config/GameConfig.js';
import { BUILDINGS }         from '../data/BuildingsData.js';     // POWER TEST
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
    this.civilianTradeSystem = new CivilianTradeSystem(this.colonyManager);
    this.productionRequestBoard = new ProductionRequestBoard();
    this.tradeLog          = new TradeLog();
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
    this.empireRegistry       = new EmpireRegistry();
    this.intelSystem          = new IntelSystem();
    this.diplomacySystem      = new DiplomacySystem();
    this.alienCivSystem       = new AlienCivSystem();
    this.warSystem            = new WarSystem();
    this.invasionSystem       = new InvasionSystem();
    this.orbitalSpaceSystem   = new OrbitalSpaceSystem();
    this.enemyAttackHandler   = new EnemyAttackHandler();

    window.KOSMOS.civMode          = false;
    window.KOSMOS.homePlanet       = null;
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
    window.KOSMOS.overlayManager   = this.uiManager.overlayManager;
    window.KOSMOS.civilianTradeSystem = this.civilianTradeSystem;
    window.KOSMOS.productionRequestBoard = this.productionRequestBoard;
    window.KOSMOS.tradeLog         = this.tradeLog;
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
    window.KOSMOS.empireRegistry   = this.empireRegistry;
    window.KOSMOS.intelSystem      = this.intelSystem;
    window.KOSMOS.diplomacySystem  = this.diplomacySystem;
    window.KOSMOS.alienCivSystem   = this.alienCivSystem;
    window.KOSMOS.warSystem        = this.warSystem;
    window.KOSMOS.invasionSystem   = this.invasionSystem;
    window.KOSMOS.orbitalSpaceSystem = this.orbitalSpaceSystem;
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
      spawnTestEnemy,
      spawnEnemyFleet,
      spawnEnemyCiv,
      spawnEnemyAttack,
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
      // ── Combat Sandbox (scenarioMode === 'combat_sandbox') ────────────
      // KOSMOS.debug.sandboxInfo() — dump stanu: empires + vessele + aktywne flagi.
      sandboxInfo,
      // KOSMOS.debug.sandboxResetPositions() — vessele wracają do pozycji startowych,
      // anuluje aktywne movement ordery.
      sandboxResetPositions,
      // KOSMOS.debug.sandboxSpawnMoreEnemies(count=1) — N dodatkowych wrogich hull_small.
      sandboxSpawnMoreEnemies,
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
      EmpireGenerator.generate(window.KOSMOS.galaxyData, this.empireRegistry);
      // Dla każdego świeżo stworzonego imperium → zapewnij rekord intel=unknown
      this.intelSystem.initForAllEmpires();
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
      // Ustaw homePlanet i aktywne systemy
      const homePlanetId = c4x.homePlanetId ?? c4x.colonies?.find(c => c.isHomePlanet)?.planetId;
      if (homePlanetId) {
        setTimeout(() => {
          const hp = this.colonyManager._findEntity(homePlanetId);
          if (hp) {
            window.KOSMOS.homePlanet = hp;
            hp.explored = true;
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
      // Przywróć EventLogSystem (zunifikowany dziennik — Opcja B)
      if (c4x.eventLog) {
        this.eventLogSystem.restore(c4x.eventLog);
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
    EventBus.on('colony:founded', ({ colony }) => {
      this.colonyManager.switchActiveColony(colony.planetId);
      this.uiManager?.overlayManager?.openPanel('colony');
    });
    EventBus.on('outpost:founded', ({ colony }) => {
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

    EventBus.on('battle:resolved', ({ warId, battleId, result }) => {
      // Tylko gdy civMode aktywny i gracz bierze udział
      if (!window.KOSMOS?.civMode) return;
      const war = window.KOSMOS?.warSystem?.getWar(warId);
      if (!war) return;
      if (war.aggressor !== 'player' && war.defender !== 'player') return;

      // Ustal stronę gracza (A/B) w payload BattleSystem
      const playerSide = result?.participantB?.type === 'player' ? 'B' : 'A';
      const empireId = war.aggressor === 'player' ? war.defender : war.aggressor;
      const emp = window.KOSMOS?.empireRegistry?.get(empireId);

      const battleData = {
        warId, battleId, result,
        aggressorName:     war.aggressor === 'player' ? 'Gracz' : (emp?.name ?? 'Obcy'),
        defenderName:      war.defender  === 'player' ? 'Gracz' : (emp?.name ?? 'Obcy'),
        aggressorArchetype: emp?.archetype,
        playerSide,
      };

      this._battleQueue.push(battleData);
      this._tryShowNextBattle();
    });

    // Wpis do EventLoga dla KAŻDEJ bitwy (także obcy-vs-obcy w przyszłości).
    // Niezależny od cinematic/queue powyżej — trwały ślad dla gracza.
    EventBus.on('battle:resolved', ({ warId, result }) => {
      const evtLog = window.KOSMOS?.eventLogSystem;
      if (!evtLog || !result) return;
      const war = window.KOSMOS?.warSystem?.getWar(warId);
      if (!war) return;

      const reg = window.KOSMOS?.empireRegistry;
      const sysId = result.location;
      const homeSys = window.KOSMOS?.homePlanet?.systemId ?? 'sys_home';
      const sysName = sysId === homeSys
        ? (window.KOSMOS?.homePlanet?.name ?? 'dom')
        : (sysId ?? '?');
      const aName = war.aggressor === 'player' ? 'Gracz' : (reg?.get(war.aggressor)?.name ?? war.aggressor);
      const dName = war.defender  === 'player' ? 'Gracz' : (reg?.get(war.defender)?.name  ?? war.defender);

      const winnerLabel = result.winner === 'A' ? aName
        : result.winner === 'B' ? dName
        : '—';

      const playerInvolved = (war.aggressor === 'player' || war.defender === 'player');
      const playerSide = result.participantB?.type === 'player' ? 'B' : 'A';
      const playerWon = playerInvolved && (result.winner === playerSide);
      const severity = !playerInvolved ? 'info'
        : result.winner === 'draw' ? 'warn'
        : playerWon ? 'info'
        : 'alert';

      evtLog.push({
        text:      `⚔ Bitwa w ${sysName}: ${aName} vs ${dName}. Zwycięzca: ${winnerLabel}. Straty: ${Math.round(result.lossesA ?? 0)}/${Math.round(result.lossesB ?? 0)}, ${result.turns ?? 0} tur.`,
        channel:   'combat',
        severity,
        entityRef: sysId ?? null,
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

      let stats = '';
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
      stats += formatStatLineWithCursor(
        isPL ? 'ZAGROŻENIE' : 'THREAT',
        isPL ? 'AKTYWNE'    : 'ACTIVE',
        'at-stat-neg'
      );

      EventBus.emit('time:pause');
      const headline = isPL ? '⚔ WYKRYTO WROGĄ JEDNOSTKĘ' : '⚔ ENEMY UNIT DETECTED';
      const desc = isPL
        ? `Systemy obserwatorium wykryły obcy statek w naszym układzie. Analizuj dane, rozważ odpowiedź.`
        : `Observatory detected an alien vessel in our system. Analyze intel, consider response.`;
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
          // Tech pozostawione nieodkryte — gracz ma 2000 research na start drzewa
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

  // POWER TEST — flota startowa (1× science_vessel, 1× cargo_ship, 1× heavy_freighter)
  _spawnPowerTestFleet(planetId) {
    const vMgr = window.KOSMOS?.vesselManager;
    const colony = this.colonyManager.getColony(planetId);
    if (!vMgr || !colony) return;
    for (const shipId of [
      'science_vessel', 'cargo_ship',
    ]) {
      const vessel = vMgr.createAndRegister(shipId, planetId);
      colony.fleet.push(vessel.id);
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
    // Odblokowane od startu — gracz nie musi ich badać
    // Nuclear power NIE odblokowany — gracz musi sam zbadać
    const techIds = ['orbital_survey', 'rocketry', 'exploration', 'basic_computing', 'automation'];
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
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // CTRL-hold → pokaż labele wszystkich obiektów 3D (planety, statki, wraki).
      // Znika po puszczeniu (keyup).
      if ((e.key === 'Control' || e.ctrlKey) && this.threeRenderer?.setShowAllLabels) {
        if (!this.threeRenderer._showAllLabels) {
          this.threeRenderer.setShowAllLabels(true);
          this.uiManager?.markDirty?.();
        }
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
        case 'Digit1': EventBus.emit('time:setMultiplier', { index: 1 }); EventBus.emit('time:play'); break; // 1d/s
        case 'Digit2': EventBus.emit('time:setMultiplier', { index: 2 }); EventBus.emit('time:play'); break; // 1t/s
        case 'Digit3': EventBus.emit('time:setMultiplier', { index: 3 }); EventBus.emit('time:play'); break; // 1m/s
        case 'Digit4': EventBus.emit('time:setMultiplier', { index: 4 }); EventBus.emit('time:play'); break; // 1r/s
        case 'Digit5': EventBus.emit('time:setMultiplier', { index: 5 }); EventBus.emit('time:play'); break; // 10r/s
        case 'Digit6': EventBus.emit('time:setMultiplier', { index: 6 }); EventBus.emit('time:play'); break; // 10kr/s
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
    });
    // Edge case: utrata focusu okna podczas trzymania CTRL
    window.addEventListener('blur', () => {
      if (this.threeRenderer?._showAllLabels) {
        this.threeRenderer.setShowAllLabels(false);
        this.uiManager?.markDirty?.();
      }
    });
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
    window.addEventListener('click', (e) => {
      // Propaguj modifiery kliku do ColonyOverlay (multi-select shift/ctrl)
      const overlay = this.uiManager?.overlayManager?.overlays?.colony;
      if (overlay) overlay._lastMouseMods = { shift: e.shiftKey, ctrl: e.ctrlKey };
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
      }
    });

    // Prawy klik — blokuj natywne menu przeglądarki (wygląda jak HTML, nie jak gra).
    // Wyjątek: inputy tekstowe (ModalInput, pola liczby) — tam menu native daje copy/paste.
    // Następnie ewentualny rozkaz ruchu jednostki naziemnej (ColonyOverlay).
    window.addEventListener('contextmenu', (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      e.preventDefault();

      const overlay = this.uiManager?.overlayManager?.overlays?.colony;
      if (!overlay?.visible || !overlay._selectedUnit) return;

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
    });
  }
}
