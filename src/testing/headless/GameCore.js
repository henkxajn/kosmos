// ═══════════════════════════════════════════════════════════════
// GameCore — bootstrap gry bez renderowania i UI
// ─────────────────────────────────────────────────────────────
// Replikuje GameScene.start() z pominięciem:
//   - ThreeRenderer, ThreeCameraController
//   - UIManager, PlanetScene
//   - Wszystkich popupów i modalów
//   - requestAnimationFrame loop (Ticker wywołuje timeSystem.update() ręcznie)
//   - showIntroSequence (używa domyślnych nazw)
// Zero modyfikacji w src/core/*, src/systems/*, src/generators/*, src/ui/* itd.
// ═══════════════════════════════════════════════════════════════

// env.js MUST be imported FIRST by entry point — tu nie duplikujemy.

import EventBus              from '../../core/EventBus.js';
import EntityManager         from '../../core/EntityManager.js';
// Używane do emitowania build events
const _eventBus = EventBus;
import gameState             from '../../core/GameState.js';
import debugLog              from '../../core/DebugLog.js';

import { PhysicsSystem }     from '../../systems/PhysicsSystem.js';
import { TimeSystem }        from '../../systems/TimeSystem.js';
import { LifeSystem }        from '../../systems/LifeSystem.js';
import { SaveSystem }        from '../../systems/SaveSystem.js';
import { ResourceSystem }    from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem }    from '../../systems/BuildingSystem.js';
import { TechSystem }        from '../../systems/TechSystem.js';
import { MissionSystem }     from '../../systems/MissionSystem.js';
import { ColonyManager }     from '../../systems/ColonyManager.js';
import { VesselManager }     from '../../systems/VesselManager.js';
import { RandomEventSystem } from '../../systems/RandomEventSystem.js';
import { FactorySystem }     from '../../systems/FactorySystem.js';
import { DepositSystem }     from '../../systems/DepositSystem.js';
import { ImpactDamageSystem } from '../../systems/ImpactDamageSystem.js';
import { CivilianTradeSystem } from '../../systems/CivilianTradeSystem.js';
import TradeLog              from '../../systems/TradeLog.js';
import { ResearchSystem }    from '../../systems/ResearchSystem.js';
import { DiscoverySystem }   from '../../systems/DiscoverySystem.js';
import { ObservatorySystem } from '../../systems/ObservatorySystem.js';
import { CollisionForecast } from '../../systems/CollisionForecast.js';
import { DiskPhaseSystem }   from '../../systems/DiskPhaseSystem.js';
import { GroundUnitManager } from '../../systems/GroundUnitManager.js';
import { AnomalyEffectSystem } from '../../systems/AnomalyEffectSystem.js';
import { LeaderSystem }      from '../../systems/LeaderSystem.js';
import { FactionSystem }     from '../../systems/FactionSystem.js';
import { DysonSystem }       from '../../systems/DysonSystem.js';
import { AutoPauseSystem }   from '../../systems/AutoPauseSystem.js';
import { ScheduledEventSystem } from '../../systems/ScheduledEventSystem.js';
import { EmpireRegistry }    from '../../systems/EmpireRegistry.js';
import { IntelSystem }       from '../../systems/IntelSystem.js';
import { DiplomacySystem }   from '../../systems/DiplomacySystem.js';
import { AlienCivSystem }    from '../../systems/AlienCivSystem.js';
import { WarSystem }         from '../../systems/WarSystem.js';
import { InvasionSystem }    from '../../systems/InvasionSystem.js';
import { StarSystemManager } from '../../systems/StarSystemManager.js';

import { SystemGenerator }   from '../../generators/SystemGenerator.js';
import { GalaxyGenerator }   from '../../generators/GalaxyGenerator.js';
import { EmpireGenerator }   from '../../generators/EmpireGenerator.js';

import { BUILDINGS }         from '../../data/BuildingsData.js';
import { TERRAIN_TYPES }     from '../../map/HexTile.js';
import { PlanetMapGenerator } from '../../map/PlanetMapGenerator.js';

export class GameCore {
  /**
   * Bootstrap game state headless. Używa scenariusza "civilization" (Nowa Gra).
   * Po boot() wszystkie systemy są w window.KOSMOS, kolonia założona, budynki startowe.
   */
  boot({ civName = 'Test Empire', capitalName = 'Capital', quiet = true } = {}) {
    this._quiet = quiet;

    // Czyść singletony
    EntityManager.clear();
    EventBus.clear();

    // Scenariusz zawsze civilization w testach
    window.KOSMOS.scenario = 'civilization';
    window.KOSMOS.civMode = false;
    window.KOSMOS.homePlanet = null;
    window.KOSMOS.savedData = null;

    // ── Systemy podstawowe ──
    this.timeSystem = new TimeSystem();
    // Auto-slow wyłączony w testach (nie chcemy że czas się sam zwalnia)
    this.timeSystem._autoSlowEnabled = false;
    this.physicsSystem = new PhysicsSystem();

    // ── Generowanie układu (scenariusz civilization) ──
    const gen = new SystemGenerator();
    const result = gen.generateCivScenario();
    const { star, planets, moons = [], planetesimals = [], asteroids = [], comets = [], planetoids = [] } = result;
    this._civPlanetId = result.civPlanetId;
    star.x = 0;
    star.y = 0;
    this.star = star;

    // ── StarSystemManager ──
    this.starSystemManager = new StarSystemManager();
    this.starSystemManager.registerHomeSystem(star, planets, moons, planetoids);
    window.KOSMOS.starSystemManager = this.starSystemManager;
    window.KOSMOS.activeSystemId = 'sys_home';

    // Inicjalizacja pozycji planet (bez rendera)
    this.physicsSystem.update(0.001);

    // ── Systemy symulacyjne ──
    this.lifeSystem = new LifeSystem(star);
    this.diskPhaseSystem = new DiskPhaseSystem(this.timeSystem);
    this.saveSystem = new SaveSystem(star, this.timeSystem);

    // ── Systemy 4X ──
    this.resourceSystem = new ResourceSystem();
    this.techSystem = new TechSystem(this.resourceSystem);
    this.civSystem = new CivilizationSystem({}, this.techSystem);
    this.civSystem.resourceSystem = this.resourceSystem;
    this.buildingSystem = new BuildingSystem(this.resourceSystem, this.civSystem, this.techSystem);
    this.civSystem.buildingSystem = this.buildingSystem;
    this.factorySystem = new FactorySystem(this.resourceSystem);
    this.buildingSystem.setFactorySystem(this.factorySystem);
    this.expeditionSystem = new MissionSystem(this.resourceSystem);
    this.missionSystem = this.expeditionSystem;
    this.colonyManager = new ColonyManager(this.techSystem);
    this.vesselManager = new VesselManager();
    this.civilianTradeSystem = new CivilianTradeSystem(this.colonyManager);
    this.tradeLog = new TradeLog();
    this.randomEventSystem = new RandomEventSystem();
    this.impactDamageSystem = new ImpactDamageSystem(this.colonyManager);
    this.researchSystem = new ResearchSystem(this.techSystem);
    this.discoverySystem = new DiscoverySystem();
    this.observatorySystem = new ObservatorySystem();
    this.collisionForecast = new CollisionForecast();
    this.groundUnitManager = new GroundUnitManager();
    this.anomalyEffectSystem = new AnomalyEffectSystem();
    this.leaderSystem = new LeaderSystem();
    this.factionSystem = new FactionSystem();
    this.dysonSystem = new DysonSystem();
    this.autoPauseSystem = new AutoPauseSystem();
    this.scheduledEventSystem = new ScheduledEventSystem();
    this.empireRegistry = new EmpireRegistry();
    this.intelSystem = new IntelSystem();
    this.diplomacySystem = new DiplomacySystem();
    this.alienCivSystem = new AlienCivSystem();
    this.warSystem = new WarSystem();
    this.invasionSystem = new InvasionSystem();

    // Zapełnij window.KOSMOS
    const K = window.KOSMOS;
    K.buildingSystem = this.buildingSystem;
    K.resourceSystem = this.resourceSystem;
    K.civSystem = this.civSystem;
    K.techSystem = this.techSystem;
    K.factorySystem = this.factorySystem;
    K.prosperitySystem = null; // per-kolonia
    K.expeditionSystem = this.expeditionSystem;
    K.missionSystem = this.missionSystem;
    K.colonyManager = this.colonyManager;
    K.vesselManager = this.vesselManager;
    K.civilianTradeSystem = this.civilianTradeSystem;
    K.tradeLog = this.tradeLog;
    K.timeSystem = this.timeSystem;
    K.randomEventSystem = this.randomEventSystem;
    K.researchSystem = this.researchSystem;
    K.discoverySystem = this.discoverySystem;
    K.observatorySystem = this.observatorySystem;
    K.collisionForecast = this.collisionForecast;
    K.groundUnitManager = this.groundUnitManager;
    K.anomalyEffectSystem = this.anomalyEffectSystem;
    K.leaderSystem = this.leaderSystem;
    K.factionSystem = this.factionSystem;
    K.dysonSystem = this.dysonSystem;
    K.autoPauseSystem = this.autoPauseSystem;
    K.scheduledEventSystem = this.scheduledEventSystem;
    K.empireRegistry = this.empireRegistry;
    K.intelSystem = this.intelSystem;
    K.diplomacySystem = this.diplomacySystem;
    K.alienCivSystem = this.alienCivSystem;
    K.warSystem = this.warSystem;
    K.invasionSystem = this.invasionSystem;
    K.overlayManager = null; // brak UI w headless
    K.threeRenderer = null;  // brak renderera w headless

    // ── Reactive store ──
    gameState.reset();
    debugLog.clear();
    debugLog.attach();
    K.gameState = gameState;
    K.debugLog = debugLog;

    // ── Galaktyka + obce imperia ──
    K.galaxyData = GalaxyGenerator.generate(star.id, star.name, star.spectralType);
    K.unitDesigns = [];
    EmpireGenerator.generate(K.galaxyData, this.empireRegistry);
    this.intelSystem.initForAllEmpires();
    this.diplomacySystem.initForAllEmpires();
    this.alienCivSystem.initForAllEmpires();

    // ── Domyślny lider (pomijamy FactionSelectScene) ──
    this.leaderSystem.setLeaderNoFaction('yara_osei', 0);

    // ── Auto-kolonizacja (zastępuje showIntroSequence) ──
    const civPlanet = EntityManager.get(this._civPlanetId);
    if (!civPlanet) {
      throw new Error('[GameCore] Nie znaleziono planety cywilizacyjnej po generateCivScenario()');
    }
    this._setupColony(civPlanet);
    K.civName = civName;
    civPlanet.name = capitalName;
    const colony = this.colonyManager.getColony(civPlanet.id);
    if (colony) colony.name = capitalName;

    // ── Grid + starter buildings ──
    const grid = PlanetMapGenerator.generate(civPlanet, true);
    this.buildingSystem._gridHeight = grid.height;
    colony.grid = grid;

    // KRITICAL: auto-place capital (colony_base) — w normalnej grze robi to
    // ColonyOverlay przy pierwszym otwarciu. W headless musimy to zrobić ręcznie,
    // inaczej brak stolicy = brak housing +4, brak food+3/research+2 z capital.
    this._placeCapital(grid);

    this._autoPlaceStarterBuildings(grid);

    // Aktywna kolonia = home planet
    this.colonyManager.switchActiveColony(civPlanet.id);

    if (!this._quiet) {
      console.log(`[GameCore] Boot OK. star=${star.name} (${star.spectralType}), planets=${planets.length}, civPlanet=${civPlanet.name} (${civPlanet.planetType}, T=${Math.round(civPlanet.temperatureC ?? 0)}°C)`);
      console.log(`[GameCore] Empires spawned: ${this.empireRegistry.listAll().length}`);
    }

    return {
      star,
      planets,
      moons,
      planetoids,
      homePlanet: civPlanet,
      colony,
      grid,
    };
  }

  // ── Kopia _setupColony z GameScene (bez rover spawn, bez UI) ──
  _setupColony(planet) {
    const K = window.KOSMOS;
    K.civMode = true;
    K.homePlanet = planet;
    planet.explored = true;
    this.civSystem.planet = planet;

    // Startowe zasoby (identyczne z GameScene._setupColony)
    this.resourceSystem.receive({
      Fe: 200, C: 150, Si: 100, Cu: 50, Ti: 20, Li: 10, Hv: 4,
      food: 100, water: 100, research: 100,
      structural_alloys: 15, polymer_composites: 10, conductor_bundles: 8,
      power_cells: 12, electronic_systems: 6, extraction_systems: 5,
      pressure_modules: 4, reactive_armor: 4, compact_bioreactor: 3,
      automation_droid: 0, semiconductor_arrays: 2, propulsion_systems: 0,
      plasma_cores: 0, metamaterials: 0, quantum_processors: 0, warp_cores: 0,
    });

    // Gwarantuj Xe (paliwo jonowe)
    if (!planet.deposits) planet.deposits = [];
    if (!planet.deposits.some(d => d.resourceId === 'Xe')) {
      planet.deposits.push({ resourceId: 'Xe', richness: 1.0, totalAmount: 50, remaining: 50 });
    }

    this.buildingSystem.setDeposits(planet.deposits ?? []);
    this.colonyManager.registerHomePlanet(planet, this.resourceSystem, this.civSystem, this.buildingSystem);
  }

  // ── Kopia _autoPlaceStarterBuildings z GameScene (bez ColonyOverlay refresh) ──
  _autoPlaceStarterBuildings(grid) {
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

    const buildPlan = [
      { id: 'farm',       level: 1, count: 1 },
      { id: 'well',       level: 1, count: 1 },
      { id: 'solar_farm', level: 1, count: 1 },
    ];

    const entries = [];
    const usedTiles = new Set();
    const capitalTile = allTiles.find(t => t.capitalBase === true);

    for (const plan of buildPlan) {
      const building = BUILDINGS[plan.id];
      if (!building) continue;

      let tile;
      if (plan.id === 'farm' && capitalTile && !usedTiles.has(capitalTile.key)) {
        tile = capitalTile;
      } else {
        tile = this._findTileForBuilding(freeTiles, building, usedTiles);
      }
      if (!tile) continue;

      usedTiles.add(tile.key);
      tile.buildingId = plan.id;
      tile.buildingLevel = plan.level;

      const baseRates = bSys._calcBaseRates(building, tile, plan.level);
      const housing = (building.housing || 0) * plan.level;

      entries.push({
        tileKey: tile.key,
        buildingId: plan.id,
        baseRates,
        housing,
        popCost: building.popCost ?? 0.25,
        level: plan.level,
      });
    }

    if (entries.length > 0) bSys.restoreFromSave(entries);
  }

  _findTileForBuilding(freeTiles, building, usedTiles) {
    const allowed = building.allowedCategories ?? null;
    for (const tile of freeTiles) {
      if (usedTiles.has(tile.key)) continue;
      if (!allowed || allowed.includes(TERRAIN_TYPES[tile.type]?.category)) {
        return tile;
      }
    }
    return null;
  }

  // ── Auto-place capital (colony_base) — replika ColonyOverlay logic ──
  _placeCapital(grid) {
    if (!grid) return;
    const tiles = grid.toArray();
    // Preferuj plains (najwyższe food bonus), potem any buildable blisko środka
    let best = tiles.find(t => t.type === 'plains' && !t.buildingId && !t.damaged);
    if (!best) {
      best = tiles.find(t => {
        const terrain = TERRAIN_TYPES[t.type];
        return terrain?.buildable && !t.buildingId && !t.damaged;
      });
    }
    if (best) {
      _eventBus.emit('planet:buildRequest', { tile: best, buildingId: 'colony_base' });
    }
  }
}
