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
import { WarpRouteSystem }   from '../../systems/WarpRouteSystem.js';
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
// Warstwa DECYZYJNA AI (parytet z GameScene:296-304) — instancjonowana tylko przy
// boot({ aiEmpires: true }). Bez niej imperia AI istnieją, ale NIC nie decydują.
import { EmpireColonyBootstrap }  from '../../systems/EmpireColonyBootstrap.js';
import { EmpireColonyMaintenance } from '../../systems/EmpireColonyMaintenance.js';
import { ColonyAutoExpander }     from '../../systems/ColonyAutoExpander.js';
import { EmpireStrategySystem }   from '../../systems/EmpireStrategySystem.js';
import { EmpireLogisticsSystem }  from '../../systems/EmpireLogisticsSystem.js';
import { EmpireResearchSystem }   from '../../systems/EmpireResearchSystem.js';
import { IntelSystem }       from '../../systems/IntelSystem.js';
import { POIRegistry }       from '../../systems/POIRegistry.js';
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
import { STARTER_RESOURCES, BOOSTED_STARTER_TECHS, BOOSTED_BUILD_PLAN, BOOSTED_STARTER_POP } from '../../data/StarterLoadout.js';

/**
 * Stały seed galaktyki dla harnessu headless (Decyzja 3 w GALAXY_SEED_PLAN).
 *
 * R1 — reprodukowalność: `boot()` domyślnie spawnuje imperia AI (`aiEmpires = !solo`),
 *   więc KAŻDY non-solo boot konsumuje seed galaktyki. Gdyby harness mintował losowo
 *   (jak robi to nowa gra w przeglądarce), baseline'y BALANS i turnieje botów
 *   przestałyby być powtarzalne. Headless NIE mintuje — nigdy.
 * R3 — stabilność baseline'ów: wartość to DOKŁADNIE ten seed, który headless dostawał
 *   przed GALAXY_SEED (`hashString('entity_1')` — `star.id` to pierwsza encja licznika
 *   `EntityManager`), więc wszystkie istniejące baseline'y zostają BIT W BIT.
 *
 * Test chcący INNEJ galaktyki podaje własną liczbę: `boot({ galaxySeed: 12345 })`.
 * Panele BALANS / runner podają ten pin JAWNIE (`SingleGame.js`), żeby był widoczny
 * w kodzie, a nie ukryty w domyślce.
 */
export const HEADLESS_GALAXY_SEED = -2102099243;

export class GameCore {
  /**
   * Bootstrap game state headless. Używa scenariusza "civilization" (Nowa Gra).
   * Po boot() wszystkie systemy są w window.KOSMOS, kolonia założona, budynki startowe.
   *
   * @param {number} [galaxySeed] — jawny seed galaktyki; domyślnie stały
   *   `HEADLESS_GALAXY_SEED` (reprodukowalność harnessu — patrz wyżej).
   */
  boot({ civName = 'Test Empire', capitalName = 'Capital', quiet = true, scenario = 'civilization',
         solo = false, aiEmpires = !solo, planetClass = null,
         galaxySeed = HEADLESS_GALAXY_SEED } = {}) {
    this._quiet = quiet;
    // solo (BALANS reference run): neutralizuje warstwę AI (brak spawnu obcych imperiów →
    // brak agresji/wojny/inwazji, izolacja solo ekonomii) i wyłącza RandomEventSystem
    // (zdarzenia losowe = confound + niedeterminizm). Toggleable — bez flagi boot = pełna gra.
    this._solo = solo;
    // aiEmpires: spawn obcych imperiów + WARSTWA DECYZYJNA AI, ROZPRZĘGNIĘTE od `solo`.
    //   Domyślnie `!solo` ⇒ dotychczasowe zachowanie obu trybów bez zmian. Slice AI (BALANS
    //   Phase 2) używa `{ solo: true, aiEmpires: true }`: imperia ŻYJĄ, ale zdarzenia losowe
    //   zostają WYŁĄCZONE — jedna zmienna naraz względem panelu referencyjnego POP/ZASOBY/ROI/CENY.
    this._aiEmpires = aiEmpires;

    // Czyść singletony
    EntityManager.clear();
    EventBus.clear();

    // scenariusz: 'civilization' (standard Nowa Gra) lub 'civilization_boosted' (Nowa Gra 2).
    // Boosted: dodatkowe budynki startowe (habitat, launch_pad, shipyard, solar Lv3),
    // pre-researched techy (orbital_survey, rocketry, exploration, basic_computing, automation),
    // populacja startowa 4 zamiast 2.
    this._scenario = scenario;
    window.KOSMOS.scenario = scenario;
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
    this.warpRouteSystem = new WarpRouteSystem(this.vesselManager);
    this.civilianTradeSystem = new CivilianTradeSystem(this.colonyManager);
    this.tradeLog = new TradeLog();
    // solo: pomijamy RandomEventSystem (deterministyczny run referencyjny). Wszystkie
    // odczyty w grze są `?.`-optional → null bezpieczny (grep: brak twardych dostępów).
    this.randomEventSystem = solo ? null : new RandomEventSystem();
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
    this.poiRegistry = new POIRegistry();
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
    K.warpRouteSystem = this.warpRouteSystem;
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
    K.poiRegistry = this.poiRegistry;
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
    // GALAXY_SEED: seed wchodzi JAWNYM parametrem `boot({ galaxySeed })`, domyślnie
    // stałym (HEADLESS_GALAXY_SEED). W harnessie NIE MA ścieżki mintowania losowego —
    // to jest cała mitygacja R1 (reprodukowalność BALANS / turniejów botów).
    K.galaxyData = GalaxyGenerator.generate(galaxySeed, star.name, star.spectralType);
    K.unitDesigns = [];
    // solo: pomijamy spawn obcych imperiów (izolacja solo ekonomii + brak agresji AI).
    // Poniższe initForAllEmpires to no-op przy pustym rejestrze (iterują listAll()=[]);
    // initVesselSubdomain/initPOISubdomain NIE są per-imperium → zawsze wołane (gracz ma
    // statki i POI). Bez flagi solo = pełny spawn rywali jak w normalnej grze.
    if (aiEmpires) EmpireGenerator.generate(K.galaxyData, this.empireRegistry);
    this.intelSystem.initForAllEmpires();
    this.intelSystem.initVesselSubdomain();
    this.poiRegistry.initPOISubdomain();
    this.diplomacySystem.initForAllEmpires();
    this.alienCivSystem.initForAllEmpires();

    // ── Domyślny lider (pomijamy FactionSelectScene) ──
    this.leaderSystem.setLeaderNoFaction('yara_osei', 0);

    // ── Auto-kolonizacja (zastępuje showIntroSequence) ──
    const civPlanet = EntityManager.get(this._civPlanetId);
    if (!civPlanet) {
      throw new Error('[GameCore] Nie znaleziono planety cywilizacyjnej po generateCivScenario()');
    }
    // Seed panel (BALANS) — nadpisz KLASĘ planety (złoża/atmosfera/temp) PRZED _setupColony.setDeposits.
    // Kontroluje ekonomię startową (GOOD_FE/MEDIAN/POOR) niezależnie od losowego seeda; null = losowa
    // planeta z generateCivScenario (dotychczasowe zachowanie). Wzorzec dep() z probe.
    this._planetClass = planetClass;
    if (planetClass) this._applyPlanetClass(civPlanet, planetClass);
    this._setupColony(civPlanet);
    K.civName = civName;
    civPlanet.name = capitalName;
    const colony = this.colonyManager.getColony(civPlanet.id);
    if (colony) colony.name = capitalName;

    // ── Grid + starter buildings ──
    const grid = PlanetMapGenerator.generate(civPlanet, true);
    this.buildingSystem._grid = grid;   // parytet z ColonyManager:2359 — BEZ tego droid-install
    this.buildingSystem._gridHeight = grid.height;   // (_strataDroidBuildings) i inne grid-ops padają
    colony.grid = grid;

    // KRITICAL: auto-place capital (colony_base) — w normalnej grze robi to
    // ColonyOverlay przy pierwszym otwarciu. W headless musimy to zrobić ręcznie,
    // inaczej brak stolicy = brak housing +4, brak food+3/research+2 z capital.
    this._placeCapital(grid);

    if (this._scenario === 'civilization_boosted') {
      // Nowa Gra 2 — boosted start: odblokuj techy + postaw dodatkowe budynki.
      // Wszystkie wartości z StarterLoadout (parytet z GameScene).
      this._setupBoostedTechs();
      this.civSystem.setPopulation(BOOSTED_STARTER_POP);
      this._autoPlaceBoostedBuildings(grid);
    } else {
      this._autoPlaceStarterBuildings(grid);
    }

    // Aktywna kolonia = home planet
    this.colonyManager.switchActiveColony(civPlanet.id);

    // Warstwa decyzyjna AI — PO utworzeniu kolonii gracza (systemy czytają KOSMOS leniwie
    // w ticku; subskrypcja time:tick w konstruktorze wystarczy przed pierwszym tickiem).
    if (aiEmpires) this._wireAiDecisionLayer();

    if (!this._quiet) {
      console.log(`[GameCore] Boot OK${solo ? ' [SOLO]' : ''}. star=${star.name} (${star.spectralType}), planets=${planets.length}, civPlanet=${civPlanet.name} (${civPlanet.planetType}, T=${Math.round(civPlanet.temperatureC ?? 0)}°C)`);
      console.log(`[GameCore] Empires spawned: ${this.empireRegistry.listAll().length}  RandomEvents: ${this.randomEventSystem ? 'ON' : 'OFF'}  AI decision layer: ${aiEmpires ? 'ON' : 'OFF'}`);
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

  // ── Warstwa decyzyjna AI (parytet z GameScene:296-304 + ekspozycje KOSMOS) ──
  // Headless dotąd spawnował imperia (przy solo=false), ale NIE tworzył warstw B/C —
  // AI stało bezczynnie, a `window.KOSMOS.empireColonyBootstrap` był `undefined`, przez co
  // `EmpireStrategySystem._runForEmpire` wychodziłby CICHO w pierwszej linii. Bez tej metody
  // każdy pomiar AI mierzyłby artefakt harnessu, nie zachowanie gry.
  _wireAiDecisionLayer() {
    const K = window.KOSMOS;
    K.empireColonyBootstrap = EmpireColonyBootstrap;   // klasa statyczna (jak w GameScene)
    this.empireColonyMaintenance = new EmpireColonyMaintenance();
    this.colonyAutoExpander      = new ColonyAutoExpander();      // Warstwa B — rozbudowa kolonii
    this.empireStrategySystem    = new EmpireStrategySystem();    // Warstwa C — kolonizacja
    this.empireLogisticsSystem   = new EmpireLogisticsSystem();   // kurierzy outpost↔stolica
    this.empireResearchSystem    = new EmpireResearchSystem();    // kolejka badań AI
    K.colonyAutoExpander    = this.colonyAutoExpander;
    K.empireStrategySystem  = this.empireStrategySystem;
    K.empireLogisticsSystem = this.empireLogisticsSystem;
    K.empireResearchSystem  = this.empireResearchSystem;
  }

  // ── Seed panel: nadpisanie klasy planety (BALANS) ──────────────────────────
  // Deterministyczne złoża/atmosfera per klasa — izoluje ekonomię startową od losowego seeda.
  // GOOD_FE = replika dobrej-Fe sesji (target: gracz koloniza wcześnie); MEDIAN = pasma docelowe;
  // POOR = cienkie złoża, thin atmosphere (lags but survives). Xe gwarantowany osobno w _setupColony.
  _applyPlanetClass(planet, className) {
    const cls = GameCore.PLANET_CLASSES[className];
    if (!cls) {
      if (!this._quiet) console.warn(`[GameCore] Nieznana klasa planety '${className}' — pomijam injekcję`);
      return;
    }
    planet.deposits = cls.deposits.map(d => ({ ...d }));   // świeża kopia (per-gra mutowalne)
    planet.atmosphere = cls.atmosphere;
    planet.temperatureK = cls.temperatureK;
    planet.temperatureC = cls.temperatureK - 273.15;
    planet.planetType = 'rocky';   // klasa ekonomiczna zakłada skalistą (kolonizowalna)
  }

  // ── Kopia _setupColony z GameScene (bez rover spawn, bez UI) ──
  _setupColony(planet) {
    const K = window.KOSMOS;
    K.civMode = true;
    K.homePlanet = planet;
    planet.explored = true;
    planet.analyzed = true;   // parytet z GameScene._setupColony (planeta domowa = pełna wiedza)
    this.civSystem.planet = planet;

    // Startowe zasoby — jedno źródło prawdy (StarterLoadout), spójne z GameScene._setupColony.
    this.resourceSystem.receive({ ...STARTER_RESOURCES });

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

  // ── Boosted start (Nowa Gra 2) — port z GameScene._autoPlaceBoostedBuildings ──
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

    // Standard + dodatkowe budynki dla boosted — jedno źródło: StarterLoadout (parytet z GameScene).
    const buildPlan = BOOSTED_BUILD_PLAN;

    const entries = [];
    const usedTiles = new Set();
    const capitalTile = allTiles.find(t => t.capitalBase === true);

    for (const plan of buildPlan) {
      // Kopia definicji bez `requires` — w boosted wszystkie budynki dostępne od startu
      const building = { ...BUILDINGS[plan.id] };
      if (!building.id) continue;
      delete building.requires;

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

    if (entries.length > 0) bSys.restoreFromSave(entries);
  }

  _setupBoostedTechs() {
    // Lista startowa boosted — jedno źródło prawdy (StarterLoadout), spójne z GameScene.
    // (Wcześniej DRYF: harness miał basic_computing+automation zamiast metallurgy → Fabryka
    //  niedostępna od startu → krzywa referencyjna liczona na złym stanie startowym.)
    this.techSystem.restore({ researched: [...BOOSTED_STARTER_TECHS] });
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

// ── Seed panel klas planet (BALANS) — deterministyczne złoża per klasa ekonomiczna ──
// dep(id, richness, remaining) — kształt z probe (richness 0.1..1.0; remaining = zapas złoża).
const _dep = (resourceId, richness, remaining) => ({ resourceId, richness, totalAmount: remaining, remaining });
GameCore.PLANET_CLASSES = {
  // GOOD_FE — replika dobrej-Fe sesji: Fe-rich, pełny suite mineralny, breathable, temperate.
  GOOD_FE: {
    atmosphere: 'breathable', temperatureK: 288,
    deposits: [
      _dep('Fe', 1.0, 150000), _dep('Si', 0.9, 120000), _dep('Cu', 0.7, 90000),
      _dep('Ti', 0.5, 50000),  _dep('C', 0.9, 120000),  _dep('Li', 0.4, 30000), _dep('Hv', 0.3, 20000),
    ],
  },
  // MEDIAN — pasma docelowe: umiarkowane złoża, breathable.
  MEDIAN: {
    atmosphere: 'breathable', temperatureK: 288,
    deposits: [
      _dep('Fe', 0.6, 80000), _dep('Si', 0.6, 70000), _dep('Cu', 0.4, 40000),
      _dep('Ti', 0.3, 20000), _dep('C', 0.6, 70000),  _dep('Li', 0.2, 12000),
    ],
  },
  // POOR — cienkie złoża, thin atmosphere: lags but survives.
  POOR: {
    atmosphere: 'thin', temperatureK: 270,
    deposits: [
      _dep('Fe', 0.3, 40000), _dep('Si', 0.3, 35000), _dep('Cu', 0.2, 15000),
      _dep('C', 0.4, 40000),  _dep('Ti', 0.15, 6000),
    ],
  },
};
