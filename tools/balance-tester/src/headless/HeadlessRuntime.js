// HeadlessRuntime — inicjalizacja gry KOSMOS bez renderingu
// Replikuje GameScene.start() ale pomija: ThreeRenderer, UIManager, AudioSystem,
// CameraController, PlanetScene, MissionEventModal, IntroModal, keyboard/mouse input
//
// Używa importów ES Module z ../../src/ (game source)

import { installMockGlobals, resetMockGlobals } from './MockGlobals.js';

// Ścieżka bazowa do src gry (tools/balance-tester/src/headless/ → ../../../../src/)
const GAME_SRC = '../../../../src';

// Lazy-loaded game modules (wypełniane w init())
let EventBus, EntityManager;
let PhysicsSystem, TimeSystem, LifeSystem, DiskPhaseSystem;
let ResourceSystem, CivilizationSystem, BuildingSystem, TechSystem;
let FactorySystem, DepositSystem, ColonyManager, VesselManager;
let MissionSystem, TradeRouteManager, ResearchSystem, RandomEventSystem;
let CivilianTradeSystem, ObservatorySystem;
let ImpactDamageSystem;
let SystemGenerator;
let PlanetMapGenerator;
let BUILDINGS, TERRAIN_TYPES, TECHS;
let VesselLoadCargo, VesselUnloadCargo;

let _modulesLoaded = false;

/** Załaduj moduły gry (jednorazowo) */
async function loadGameModules() {
  if (_modulesLoaded) return;

  const core = await import(`${GAME_SRC}/core/EventBus.js`);
  EventBus = core.default;

  const em = await import(`${GAME_SRC}/core/EntityManager.js`);
  EntityManager = em.default;

  ({ PhysicsSystem }     = await import(`${GAME_SRC}/systems/PhysicsSystem.js`));
  ({ TimeSystem }        = await import(`${GAME_SRC}/systems/TimeSystem.js`));
  ({ LifeSystem }        = await import(`${GAME_SRC}/systems/LifeSystem.js`));
  ({ DiskPhaseSystem }   = await import(`${GAME_SRC}/systems/DiskPhaseSystem.js`));
  ({ ResourceSystem }    = await import(`${GAME_SRC}/systems/ResourceSystem.js`));
  ({ CivilizationSystem } = await import(`${GAME_SRC}/systems/CivilizationSystem.js`));
  ({ BuildingSystem }    = await import(`${GAME_SRC}/systems/BuildingSystem.js`));
  ({ TechSystem }        = await import(`${GAME_SRC}/systems/TechSystem.js`));
  ({ FactorySystem }     = await import(`${GAME_SRC}/systems/FactorySystem.js`));
  ({ DepositSystem }     = await import(`${GAME_SRC}/systems/DepositSystem.js`));
  ({ ColonyManager }     = await import(`${GAME_SRC}/systems/ColonyManager.js`));
  ({ VesselManager }     = await import(`${GAME_SRC}/systems/VesselManager.js`));
  const vesselMod = await import(`${GAME_SRC}/entities/Vessel.js`);
  VesselLoadCargo = vesselMod.loadCargo;
  VesselUnloadCargo = vesselMod.unloadCargo;
  ({ MissionSystem }     = await import(`${GAME_SRC}/systems/MissionSystem.js`));
  ({ TradeRouteManager } = await import(`${GAME_SRC}/systems/TradeRouteManager.js`));
  ({ ResearchSystem }    = await import(`${GAME_SRC}/systems/ResearchSystem.js`));
  ({ RandomEventSystem } = await import(`${GAME_SRC}/systems/RandomEventSystem.js`));
  ({ CivilianTradeSystem } = await import(`${GAME_SRC}/systems/CivilianTradeSystem.js`));
  ({ ObservatorySystem }   = await import(`${GAME_SRC}/systems/ObservatorySystem.js`));
  ({ ImpactDamageSystem } = await import(`${GAME_SRC}/systems/ImpactDamageSystem.js`));
  ({ SystemGenerator }   = await import(`${GAME_SRC}/generators/SystemGenerator.js`));
  ({ PlanetMapGenerator } = await import(`${GAME_SRC}/map/PlanetMapGenerator.js`));

  const bd = await import(`${GAME_SRC}/data/BuildingsData.js`);
  BUILDINGS = bd.BUILDINGS;

  const ht = await import(`${GAME_SRC}/map/HexTile.js`);
  TERRAIN_TYPES = ht.TERRAIN_TYPES;

  const td = await import(`${GAME_SRC}/data/TechData.js`);
  TECHS = td.TECHS;

  _modulesLoaded = true;
}

/**
 * Headless instancja gry KOSMOS — jedna gra, wiele ticków.
 */
export class HeadlessRuntime {
  constructor() {
    this.timeSystem = null;
    this.physicsSystem = null;
    this.resourceSystem = null;
    this.civSystem = null;
    this.buildingSystem = null;
    this.techSystem = null;
    this.factorySystem = null;
    this.colonyManager = null;
    this.vesselManager = null;
    this.expeditionSystem = null;
    this.tradeRouteManager = null;
    this.researchSystem = null;
    this.depositSystem = null;
    this.civilianTradeSystem = null;
    this.observatorySystem = null;

    this.star = null;
    this.planets = [];
    this.moons = [];
    this.planetoids = [];
    this.homePlanet = null;
    this.grid = null;

    this._gameOver = false;
    this._gameOverReason = null;
    this._initialized = false;
  }

  /**
   * Inicjalizuj headless grę (replikuje GameScene.start + auto-kolonizacja)
   * @param {number} seed — seed dla PRNG
   * @param {object} options — opcje inicjalizacji
   * @param {string} options.scenario — 'civilization' (domyślny) lub 'civilization_boosted'
   */
  async init(seed = 42, options = {}) {
    const scenario = options.scenario ?? 'civilization';
    // Zainstaluj/reset globalne mocki
    if (!_modulesLoaded) {
      installMockGlobals(seed);
      await loadGameModules();
    } else {
      resetMockGlobals(seed);
    }

    // Wyczyść singletony
    EventBus.clear();
    EntityManager.clear();

    // ── TimeSystem ──
    this.timeSystem = new TimeSystem();
    this.timeSystem.multiplierIndex = 4; // 1r/s (index 4 w TIME_MULTIPLIERS)
    this.timeSystem.isPaused = false;
    // Wyłącz auto-slow (niepotrzebny w headless)
    this.timeSystem._autoSlowEnabled = false;

    // ── PhysicsSystem ──
    this.physicsSystem = new PhysicsSystem();

    // ── Generuj układ planetarny ──
    window.KOSMOS.scenario = scenario;
    window.KOSMOS.activeSystemId = 'sys_home';
    const generator = new SystemGenerator();
    const result = generator.generateCivScenario();

    this.star = result.star;
    this.star.x = 0;
    this.star.y = 0;
    this.planets = result.planets || [];
    this.moons = result.moons || [];
    this.planetoids = result.planetoids || [];

    // Ustaw systemId na wszystkich ciałach (wymagane przez MissionSystem)
    for (const e of [...this.planets, ...this.moons, ...this.planetoids, this.star]) {
      if (e) e.systemId = 'sys_home';
    }

    // Inicjalizuj pozycje orbit
    this.physicsSystem.update(0.001);

    // ── LifeSystem + DiskPhase ──
    this.lifeSystem = new LifeSystem(this.star);
    this.diskPhaseSystem = new DiskPhaseSystem(this.timeSystem);

    // ── Systemy 4X ──
    this.resourceSystem = new ResourceSystem();
    this.techSystem = new TechSystem(this.resourceSystem);
    this.civSystem = new CivilizationSystem({}, this.techSystem);
    this.buildingSystem = new BuildingSystem(
      this.resourceSystem, this.civSystem, this.techSystem
    );
    this.factorySystem = new FactorySystem(this.resourceSystem);
    this.buildingSystem.setFactorySystem(this.factorySystem);
    this.expeditionSystem = new MissionSystem(this.resourceSystem);
    this.colonyManager = new ColonyManager(this.techSystem);
    this.vesselManager = new VesselManager();
    this.tradeRouteManager = new TradeRouteManager();
    this.randomEventSystem = new RandomEventSystem();
    // ImpactDamageSystem wyłączony w headless — kolizje z planetoidami dodają
    // niekontrolowaną losowość do testów balansu (EXTINCTION w 100% seedów ~yr15)
    // this.impactDamageSystem = new ImpactDamageSystem(this.colonyManager);
    this.impactDamageSystem = null;
    this.researchSystem = new ResearchSystem(this.techSystem);
    this.civilianTradeSystem = new CivilianTradeSystem(this.colonyManager);
    this.observatorySystem = new ObservatorySystem();

    // ── window.KOSMOS service locator ──
    window.KOSMOS.civMode = false;
    window.KOSMOS.homePlanet = null;
    window.KOSMOS.buildingSystem = this.buildingSystem;
    window.KOSMOS.resourceSystem = this.resourceSystem;
    window.KOSMOS.civSystem = this.civSystem;
    window.KOSMOS.techSystem = this.techSystem;
    window.KOSMOS.factorySystem = this.factorySystem;
    window.KOSMOS.expeditionSystem = this.expeditionSystem;
    window.KOSMOS.missionSystem = this.expeditionSystem;
    window.KOSMOS.colonyManager = this.colonyManager;
    window.KOSMOS.vesselManager = this.vesselManager;
    window.KOSMOS.tradeRouteManager = this.tradeRouteManager;
    window.KOSMOS.timeSystem = this.timeSystem;
    window.KOSMOS.randomEventSystem = this.randomEventSystem;
    window.KOSMOS.researchSystem = this.researchSystem;
    window.KOSMOS.civilianTradeSystem = this.civilianTradeSystem;
    window.KOSMOS.observatorySystem = this.observatorySystem;
    // overlayManager nie istnieje w headless — stub
    window.KOSMOS.overlayManager = { openPanel: () => {}, closeActive: () => {}, isAnyOpen: () => false };

    // ── Auto-kolonizacja (replikuje GameScene flow) ──
    const civPlanetId = result.civPlanetId;
    const civPlanet = EntityManager.get(civPlanetId);
    if (!civPlanet) {
      throw new Error(`Nie znaleziono planety cywilizacyjnej: ${civPlanetId}`);
    }

    this._setupColony(civPlanet);

    // Generuj grid hex
    this.grid = PlanetMapGenerator.generate(civPlanet, true);
    if (this.buildingSystem) {
      this.buildingSystem._gridHeight = this.grid.height;
    }

    // Postaw stolicę (colony_base) — w prawdziwej grze robi to ColonyOverlay przy otwarciu
    this._placeCapital(this.grid);

    if (scenario === 'civilization_boosted') {
      // BOOSTED: tech + budynki + 4 POP (replikuje GameScene._setupBoostedTechs + _autoPlaceBoostedBuildings)
      this._setupBoostedTechs();
      this.civSystem.population = 4;
      this._autoPlaceBoostedBuildings(this.grid);
    } else {
      // Standardowy: 3 budynki + 2 POP
      this._autoPlaceStarterBuildings(this.grid);
    }

    // Zarejestruj jako aktywną kolonię
    this.colonyManager.switchActiveColony?.(civPlanet.id);

    // Nazwy
    window.KOSMOS.civName = 'Test Colony';
    civPlanet.name = 'Test Planet';
    const colony = this.colonyManager.getColony(civPlanet.id);
    if (colony) colony.name = 'Test Planet';

    // Ustaw grid na colony
    if (colony) colony.grid = this.grid;

    // ── Game Over detection ──
    // W headless: wyłączone collision game-over (ImpactDamageSystem disabled).
    // PhysicsSystem nadal usuwa encje przy kolizjach orbitów planet/planetoidów,
    // ale nie kończy to gry — testy balansu mierzą ekonomię, nie fizykę.
    this._gameOver = false;
    this._gameOverReason = null;

    // Wykryj śmierć populacji (głód, brownout) — jedyny warunek game over w headless
    EventBus.on('civ:popDied', () => {
      const pop = this.civSystem?.population ?? 0;
      if (pop <= 0) {
        this._gameOver = true;
        this._gameOverReason = 'extinction';
      }
    });

    // ── Auto-rozwiązanie ruchów społecznych (headless: zawsze negotiate) ──
    EventBus.on('civ:movementStarted', ({ movementId }) => {
      // W headless bot nie może interagować z UI — auto-negotiate
      EventBus.emit('civ:resolveMovement', { movementType: movementId, resolutionId: 'negotiate' });
    });

    // ── Fix: aktualizuj grid tile po zakończeniu budowy/upgrade ──
    // W prawdziwej grze robi to PlanetGlobeScene; w headless musimy sami
    EventBus.on('planet:constructionComplete', ({ tileKey, buildingId, isUpgrade }) => {
      if (!this.grid || !tileKey) return;
      const parts = tileKey.split(',');
      if (parts.length < 2) return;
      const tile = this.grid.get(parseInt(parts[0], 10), parseInt(parts[1], 10));
      if (!tile) return;

      // Wyczyść flagę budowy
      tile.underConstruction = null;

      if (isUpgrade) {
        // Upgrade — level został już zaktualizowany w _applyUpgrade na tileLike,
        // ale musimy zsynchronizować z _active (źródło prawdy)
        const entry = this.buildingSystem?._active?.get(tileKey);
        if (entry) {
          tile.buildingLevel = entry.level;
        }
      } else {
        // Nowa budowa — ustaw buildingId i level na tile
        tile.buildingId = buildingId;
        tile.buildingLevel = 1;
      }
    });

    this._initialized = true;
  }

  /** Replikuje GameScene._setupColony(planet) */
  _setupColony(planet) {
    window.KOSMOS.civMode = true;
    window.KOSMOS.homePlanet = planet;
    this.homePlanet = planet;
    planet.explored = true;

    // Startowe zasoby (identyczne z GameScene._setupColony)
    this.resourceSystem.receive({
      Fe: 200, C: 150, Si: 100, Cu: 50, Ti: 20, Li: 10, Pt: 4,
      food: 100, water: 100, research: 100,
      steel_plates: 15, polymer_composites: 10, concrete_mix: 8, copper_wiring: 8,
      power_cells: 12, electronics: 6, food_synthesizers: 3,
      mining_drills: 5, hull_armor: 4, habitat_modules: 4, water_recyclers: 3,
      robots: 0, semiconductors: 2, ion_thrusters: 0,
      fusion_cores: 0, nanotech_filters: 0, quantum_cores: 0, antimatter_cells: 0,
    });

    // Ustaw deposits i zarejestruj kolonię
    this.buildingSystem.setDeposits(planet.deposits ?? []);
    this.colonyManager.registerHomePlanet(
      planet, this.resourceSystem, this.civSystem, this.buildingSystem
    );
  }

  /** Postaw stolicę (colony_base) — replikuje ColonyOverlay._ensureCapital */
  _placeCapital(grid) {
    if (!grid || !this.buildingSystem) return;
    const allTiles = grid.toArray();
    // Znajdź najlepszy tile na stolicę (jak ColonyOverlay._findColonyBaseTile)
    const freeTiles = allTiles.filter(t => {
      const terrain = TERRAIN_TYPES[t.type];
      return terrain?.buildable && !t.buildingId && !t.underConstruction;
    });
    // Preferuj plains
    const baseTile = freeTiles.find(t => t.type === 'plains') || freeTiles[0];
    if (!baseTile) return;

    // Emituj buildRequest — BuildingSystem._build() obsłuży colony_base
    EventBus.emit('planet:buildRequest', { tile: baseTile, buildingId: 'colony_base' });
  }

  /** Replikuje GameScene._autoPlaceStarterBuildings (bez kosztów surowcowych) */
  _autoPlaceStarterBuildings(grid) {
    const bSys = this.buildingSystem;
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

    if (entries.length > 0) {
      bSys.restoreFromSave(entries);
    }
  }

  /** Zbadaj tech wymagane przez budynki boosted (replikuje GameScene._setupBoostedTechs) */
  _setupBoostedTechs() {
    const techIds = ['orbital_survey', 'rocketry', 'exploration', 'basic_computing', 'automation'];
    this.techSystem.restore({ researched: techIds });
  }

  /** Postaw budynki boosted (replikuje GameScene._autoPlaceBoostedBuildings) */
  _autoPlaceBoostedBuildings(grid) {
    const bSys = this.buildingSystem;
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

    // Identyczny plan jak GameScene._autoPlaceBoostedBuildings
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
    const capitalTile = allTiles.find(t => t.capitalBase === true);

    for (const plan of buildPlan) {
      // Odblokuj budynek bez sprawdzania requires (jak w GameScene)
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
    }

    if (entries.length > 0) {
      bSys.restoreFromSave(entries);
    }
  }

  /** Znajdź tile pasujący do budynku (replikacja z GameScene) */
  _findTileForBuilding(freeTiles, building, usedTiles) {
    for (const tile of freeTiles) {
      if (usedTiles.has(tile.key)) continue;
      const terrain = TERRAIN_TYPES[tile.type];
      if (!terrain?.buildable) continue;
      if (building.terrainOnly) {
        if (building.terrainOnly.includes(tile.type)) return tile;
        continue;
      }
      if (building.terrainAny) return tile;
      if (terrain.allowedCategories?.includes(building.category)) return tile;
    }
    return null;
  }

  // ── PUBLIC API ──────────────────────────────────────────────────────────────

  /**
   * Symuluj N lat gry (rozdzielczość: 0.1 roku per tick)
   * @param {number} gameYears — ile lat do zasymulowania
   */
  tick(gameYears) {
    if (!this._initialized || this._gameOver) return;

    const TICK_SIZE = 0.1; // 0.1 roku per tick
    const numTicks = Math.ceil(gameYears / TICK_SIZE);
    // deltaMs odpowiadające TICK_SIZE przy multiplier=1.0 (index 3)
    const deltaMs = TICK_SIZE * 1000; // 100ms = 0.1 roku przy 1r/s

    for (let i = 0; i < numTicks && !this._gameOver; i++) {
      this.timeSystem.update(deltaMs);
    }
  }

  /** Snapshot stanu gry dla bota / metryk */
  getState() {
    const colony = this.colonyManager?.getColony(this.homePlanet?.id);
    const invSnap = this.resourceSystem.inventorySnapshot();
    const resSnap = this.resourceSystem.snapshot();

    return {
      gameYear: this.timeSystem.gameTime,
      isGameOver: this._gameOver,
      gameOverReason: this._gameOverReason,

      colony: {
        population: this.civSystem.population,
        housing: this.civSystem.housing,
        // Morale zastąpione przez prosperity + loyalty
        morale: this.civSystem.loyalty ?? 50, // backward compat — mapuj loyalty jako morale
        moraleTarget: this.civSystem.loyalty ?? 50,
        prosperity: colony?.prosperitySystem?.prosperity ?? 50,
        targetProsperity: colony?.prosperitySystem?.targetProsperity ?? 50,
        loyalty: this.civSystem.loyalty ?? 50,
        epoch: colony?.prosperitySystem?.epoch ?? 'early',
        freePops: this.civSystem.freePops,
        employedPops: this.civSystem.employedPops ?? 0,
        lockedPops: this.civSystem.lockedPops ?? 0,
        isUnrest: this.civSystem.unrestActive ?? false,
        isFamine: this.civSystem._famine ?? false,
        growthProgress: this.civSystem._growthProgress ?? 0,
        activeMovements: this.civSystem.activeMovements?.filter(m => !m.resolved) ?? [],
        strata: this._getStrataSnapshot(),
      },

      resources: {
        inventory: Object.fromEntries(this.resourceSystem.inventory),
        perYear: Object.fromEntries(this.resourceSystem._inventoryPerYear),
        energyBalance: this.resourceSystem.energy.balance,
        energyProduction: this.resourceSystem.energy.production,
        energyConsumption: this.resourceSystem.energy.consumption,
        brownout: this.resourceSystem.energy.brownout,
        researchAmount: this.resourceSystem.research.amount,
        researchPerYear: this.resourceSystem.research.perYear,
      },

      buildings: {
        active: this._getActiveBuildings(),
        constructionQueue: this.buildingSystem._constructionQueue
          ? [...this.buildingSystem._constructionQueue]
          : [],
      },

      tech: {
        researched: this.techSystem?._researched ? [...this.techSystem._researched] : [],
        available: this._getAvailableTechs(),
      },

      factory: {
        // UWAGA: używamy window.KOSMOS.factorySystem bo ColonyManager podmienia instancję
        totalPoints: (window.KOSMOS?.factorySystem ?? this.factorySystem)?._totalPoints ?? 0,
        allocations: (window.KOSMOS?.factorySystem ?? this.factorySystem)?._allocations
          ? [...(window.KOSMOS?.factorySystem ?? this.factorySystem)._allocations.entries()].map(([id, a]) => ({
              commodityId: id, points: a.points, progress: a.progress,
              targetQty: a.targetQty, produced: a.produced,
            }))
          : [],
        queue: (window.KOSMOS?.factorySystem ?? this.factorySystem)?._queue ?? [],
      },

      grid: this._getGridSummary(),

      fleet: {
        hangar: colony?.fleet?.map(vid => this.vesselManager?.getVessel?.(vid)).filter(Boolean) ?? [],
        allVessels: this.vesselManager?.getAllVessels?.() ?? [],
      },

      system: {
        planetCount: this.planets.length,
        moonCount: this.moons.length,
        planetoidCount: this.planetoids.length,
        exploredBodies: EntityManager.getAll().filter(e => e.explored).length,
        totalBodies: EntityManager.getAll().filter(e =>
          e.type === 'planet' || e.type === 'moon' || e.type === 'planetoid'
        ).length,
      },

      deposits: (this.homePlanet?.deposits ?? []).map(d => ({
        resourceId: d.resourceId,
        richness: d.richness,
        remaining: d.remaining,
        totalAmount: d.totalAmount,
      })),

      colonies: (this.colonyManager?.getColonies?.() ?? []).map(c => ({
        planetId: c.planetId,
        name: c.name,
        isOutpost: c.isOutpost ?? false,
        population: c.civSystem?.population ?? 0,
        isHomePlanet: c.isHomePlanet ?? false,
      })),
    };
  }

  /** Aktywne budynki jako lista */
  _getActiveBuildings() {
    const active = this.buildingSystem?._active;
    if (!active) return [];
    const result = [];
    for (const [key, entry] of active) {
      // Pobierz yieldBonus z tile'a (grid)
      let yieldBonus = 1.0;
      if (this.grid) {
        const tileKey = key.replace('capital_', '');
        const [q, r] = tileKey.split(',').map(Number);
        const tile = (!isNaN(q) && !isNaN(r)) ? this.grid.get(q, r) : null;
        if (tile) {
          const terrain = TERRAIN_TYPES[tile.type];
          const building = entry.building ?? BUILDINGS[entry.buildingId];
          const cat = building?.category ?? 'default';
          const yieldKey = cat === 'mining' ? 'mining' : cat === 'energy' ? 'energy' : cat === 'food' ? 'food' : 'default';
          yieldBonus = terrain?.yieldBonus?.[yieldKey] ?? terrain?.yieldBonus?.default ?? 1.0;
        }
      }
      result.push({
        tileKey: key,
        buildingId: entry.buildingId ?? entry.building?.id ?? 'unknown',
        level: entry.level ?? 1,
        yieldBonus,
      });
    }
    return result;
  }

  /** Snapshot strat populacyjnych */
  _getStrataSnapshot() {
    const strata = this.civSystem?.strata;
    if (!strata) return {};
    const snap = {};
    for (const [type, data] of Object.entries(strata)) {
      snap[type] = {
        count: data.count ?? 0,
        satisfaction: data.satisfaction ?? 50,
      };
    }
    return snap;
  }

  /** Dostępne technologie do badania */
  _getAvailableTechs() {
    if (!this.techSystem || !TECHS) return [];
    const researched = this.techSystem._researched ?? new Set();
    const available = [];
    for (const [id, tech] of Object.entries(TECHS)) {
      if (researched.has(id)) continue;
      // Sprawdź prerequisites
      const prereqs = tech.requires ?? [];
      if (prereqs.every(r => researched.has(r))) {
        // cost to obiekt { research: N } — wyciągamy wartość liczbową
        const costValue = typeof tech.cost === 'number' ? tech.cost : (tech.cost?.research ?? 0);
        available.push({ id, cost: costValue, namePL: tech.namePL });
      }
    }
    return available;
  }

  /** Podsumowanie siatki hex */
  _getGridSummary() {
    if (!this.grid) return { freeBuildable: 0, terrainDistribution: {} };
    const allTiles = this.grid.toArray();
    const terrainDist = {};
    let freeBuildable = 0;
    for (const tile of allTiles) {
      terrainDist[tile.type] = (terrainDist[tile.type] || 0) + 1;
      const terrain = TERRAIN_TYPES[tile.type];
      if (terrain?.buildable && !tile.isOccupied && !tile.buildingId && !tile.underConstruction) {
        freeBuildable++;
      }
    }
    return { freeBuildable, terrainDistribution: terrainDist, totalTiles: allTiles.length };
  }

  // ── BOT ACTION API ──────────────────────────────────────────────────────────

  /** Odczytaj tile z klucza "q,r" */
  _getTileByKey(key) {
    if (!this.grid || !key) return null;
    const parts = key.split(',');
    if (parts.length < 2) return null;
    return this.grid.get(parseInt(parts[0], 10), parseInt(parts[1], 10));
  }

  /** Buduj budynek na tile'u */
  buildOnTile(tileKey, buildingId) {
    const tile = this._getTileByKey(tileKey);
    if (!tile) return false;
    EventBus.emit('planet:buildRequest', { tile, buildingId });
    return true;
  }

  /** Ulepsz budynek na tile'u */
  upgradeBuilding(tileKey) {
    const tile = this._getTileByKey(tileKey);
    if (!tile || !tile.buildingId) return false;
    EventBus.emit('planet:upgradeRequest', { tile });
    return true;
  }

  /** Rozbiórka / downgrade budynku */
  demolishBuilding(tileKey) {
    const tile = this._getTileByKey(tileKey);
    if (!tile) return false;
    EventBus.emit('planet:demolishRequest', { tile });
    return true;
  }

  /** Zbadaj technologię */
  researchTech(techId) {
    EventBus.emit('tech:researchRequest', { techId });
    return true;
  }

  /** Alokuj punkty fabryczne do commodity */
  allocateFactory(commodityId, points) {
    EventBus.emit('factory:allocate', { commodityId, points });
    return true;
  }

  /** Ustaw target produkcji */
  setFactoryTarget(commodityId, qty) {
    EventBus.emit('factory:setTarget', { commodityId, qty });
    return true;
  }

  /** Buduj statek */
  startShipBuild(shipId) {
    EventBus.emit('fleet:buildRequest', { shipId });
    return true;
  }

  /** Wyślij ekspedycję */
  sendExpedition(type, targetId, vesselId) {
    EventBus.emit('expedition:sendRequest', { type, targetId, vesselId });
    return true;
  }

  /** Załaduj towar na statek z inventory kolonii */
  loadCargo(vesselId, commodityId, qty) {
    const vessel = this.vesselManager?.getVessel(vesselId);
    if (!vessel) return 0;
    return VesselLoadCargo(vessel, commodityId, qty, this.resourceSystem);
  }

  /** Rozładuj towar ze statku do inventory kolonii */
  unloadCargo(vesselId, commodityId, qty) {
    const vessel = this.vesselManager?.getVessel(vesselId);
    if (!vessel) return 0;
    return VesselUnloadCargo(vessel, commodityId, qty, this.resourceSystem);
  }

  /** Wyślij transport (cargo ship z ładunkiem na cel → outpost jeśli pusty) */
  sendTransport(targetId, vesselId) {
    const vessel = this.vesselManager?.getVessel(vesselId);
    if (!vessel) return false;
    EventBus.emit('expedition:transportRequest', {
      targetId,
      cargo: vessel.cargo ? { ...vessel.cargo } : {},
      vesselId,
      cargoPreloaded: true,
    });
    return true;
  }

  /** Wyślij colony ship na cel (kolonizacja lub upgrade outpostu) */
  sendColonyShip(targetId, vesselId) {
    EventBus.emit('expedition:sendRequest', { type: 'colony', targetId, vesselId });
    return true;
  }

  /** Zwróć listę kolonii/outpostów */
  getColonies() {
    return this.colonyManager?.getColonies?.() ?? [];
  }

  /** Znajdź najlepszy tile na budynek danego typu */
  findBestTile(buildingId) {
    if (!this.grid || !BUILDINGS[buildingId]) return null;
    const building = BUILDINGS[buildingId];
    const allTiles = this.grid.toArray();
    const candidates = allTiles.filter(t => {
      if (t.buildingId || t.underConstruction || t.isOccupied) return false;
      const terrain = TERRAIN_TYPES[t.type];
      if (!terrain?.buildable) return false;
      if (building.terrainOnly) return building.terrainOnly.includes(t.type);
      if (building.terrainAny) return true;
      return terrain.allowedCategories?.includes(building.category);
    });

    if (candidates.length === 0) return null;

    // Scoring: yieldBonus × latitude mod
    const gridHeight = this.grid.height;
    candidates.sort((a, b) => {
      const scoreA = this._tileBuildScore(a, building, gridHeight);
      const scoreB = this._tileBuildScore(b, building, gridHeight);
      return scoreB - scoreA;
    });

    return candidates[0];
  }

  /** Score tile'a dla danego budynku */
  _tileBuildScore(tile, building, gridHeight) {
    const terrain = TERRAIN_TYPES[tile.type];
    // Yield bonus z terenu
    const yieldKey = building.category === 'mining' ? 'mining'
      : building.category === 'energy' ? 'energy'
      : building.category === 'food' ? 'food'
      : 'default';
    const yieldBonus = terrain?.yieldBonus?.[yieldKey] ?? terrain?.yieldBonus?.default ?? 1.0;

    // Latitude modifier (polar penalty)
    let latMod = 1.0;
    const r = tile.r ?? 0;
    if (r === 0 || r === gridHeight - 1) latMod = 0.5;
    else if (r === 1 || r === gridHeight - 2) latMod = 0.7;

    return yieldBonus * latMod;
  }

  /** Czy gra się zakończyła */
  isGameOver() {
    return this._gameOver;
  }

  /** Aktualny rok gry */
  getGameYear() {
    return this.timeSystem?.gameTime ?? 0;
  }

  /** Gettery pomocnicze */
  getEventBus() { return EventBus; }
  getEntityManager() { return EntityManager; }
  getBuildingsData() { return BUILDINGS; }
  getTechsData() { return TECHS; }
  getTerrainTypes() { return TERRAIN_TYPES; }
}
