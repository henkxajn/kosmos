// ColonyManager — zarządzanie koloniami (multi-planet) + flotą
//
// Centralny rejestr kolonii. Każda kolonia ma własny:
//   - ResourceSystem (zasoby per-kolonia)
//   - CivilizationSystem (populacja, wzrost per-kolonia)
//   - Listę budynków (zarządzaną przez BuildingSystem)
//   - Siatkę hex (HexGrid)
//   - Flotę statków (fleet) i kolejki budowy (shipQueues — 1 slot per poziom stoczni)
//
// Wspólne (globalne):
//   - TechSystem (jedno drzewo tech dla całej cywilizacji)
//   - ExpeditionSystem (misje z dowolnej kolonii)
//
// Komunikacja:
//   Nasłuchuje: 'expedition:colonyFounded'  → tworzy nową kolonię
//               'fleet:buildRequest'        → budowa statku w stoczni
//               'time:yearTick'             → drogi handlowe + migracja (co rok)
//               'time:tick'                 → tick budowy statków
//   Emituje:    'colony:founded' { colony }
//               'colony:listChanged'
//               'colony:tradeExecuted' { route, transferred }
//               'colony:migration' { from, to, count }
//               'fleet:buildStarted'  { planetId, shipId }
//               'fleet:shipCompleted' { planetId, shipId }
//               'fleet:shipConsumed'  { planetId, shipId }
//               'fleet:buildFailed'   { reason }

import EventBus     from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { ResourceSystem } from './ResourceSystem.js';
import { CivilizationSystem } from './CivilizationSystem.js';
import { BuildingSystem } from './BuildingSystem.js';
import { FactorySystem } from './FactorySystem.js';
import { ProsperitySystem } from './ProsperitySystem.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { stationTotalCost } from '../data/StationData.js';
import { UNIT_ARCHETYPES, ARCHETYPE_REQUIREMENTS, GROUND_UNIT_CAP_EXEMPT, checkArchetypeUnlocked } from '../data/unitArchetypes.js';
import { RegionSystem } from '../map/RegionSystem.js';
import { HexGrid }      from '../map/HexGrid.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { t } from '../i18n/i18n.js';

// Rozmiary siatek hex per typ/masa ciała
const GRID_SIZES = {
  planet_rocky:   { cols: 12, rows: 10 },
  planet_ice:     { cols: 10, rows: 8  },
  moon_large:     { cols: 8,  rows: 6  },
  moon_small:     { cols: 6,  rows: 5  },
  planetoid:      { cols: 6,  rows: 4  },
  default:        { cols: 8,  rows: 6  },
};

// Próg masowy dla dużego/małego księżyca (masy ziemskie)
const MOON_MASS_THRESHOLD = 0.01;

// Drogi handlowe — stałe
const TRADE_INTERVAL      = 10;   // co ile lat automatyczny transfer
const TRADE_SURPLUS_RATIO = 0.6;  // >60% capacity = nadwyżka
const TRADE_DEFICIT_RATIO = 0.3;  // <30% capacity = niedobór
const TRADE_BASE_AMOUNT   = 50;   // bazowa ilość per transfer per zasób

// Migracja POP — stałe
const MIGRATION_INTERVAL    = 20;   // co ile lat sprawdzenie migracji
const MIGRATION_PROSPERITY_HIGH = 70;   // prosperity powyżej = przyciąga
const MIGRATION_PROSPERITY_LOW  = 40;   // prosperity poniżej = odpycha
const MIGRATION_CHANCE      = 0.10; // 10% szans na migrację

export class ColonyManager {
  constructor(techSystem = null) {
    this.techSystem = techSystem;

    // Rejestr kolonii: planetId → ColonyState
    this._colonies = new Map();

    // Aktualnie aktywna kolonia (której mapę gracz ogląda)
    this._activePlanetId = null;

    // Drogi handlowe: lista tras automatycznych
    this._tradeRoutes = [];

    // Licznik lat do trade routes i migracji
    this._lastTradeYear    = 0;
    this._lastMigrationYear = 0;

    // Śledzenie roku gry
    this._gameYear = 0;
    this._lastCheckedYear = 0;

    // System podatkowy — globalny suwak (0–0.25)
    this._taxRate = 0.08;          // 8% domyślnie (strefa neutralna)
    this._taxAccum = 0;            // akumulator fizycznych lat do miesięcznego naliczania
    this._taxProtestAccum = 0;     // licznik miesięcy ekstremalnego podatku → protest co rok

    // Nasłuch założenia kolonii z ekspedycji
    EventBus.on('expedition:colonyFounded', (data) => this._onColonyFounded(data));

    // Nasłuch nowej technologii — automatyczne drogi handlowe
    EventBus.on('tech:researched', ({ tech }) => {
      if (tech?.id === 'interplanetary_logistics') {
        this._autoCreateTradeRoutes();
      }
    });

    // Nasłuch roku gry — drogi handlowe + migracja
    EventBus.on('time:display', ({ gameTime }) => {
      this._gameYear = gameTime;
      const curYear = Math.floor(gameTime);
      if (curYear > this._lastCheckedYear) {
        this._lastCheckedYear = curYear;
        this.yearlyTick(curYear);
      }
    });

    // Nasłuch budowy statku z UI
    EventBus.on('fleet:buildRequest', ({ shipId, modules }) => {
      this.startShipBuild(this._activePlanetId, shipId, modules ?? []);
    });

    // Nasłuch rozformowania statku
    EventBus.on('fleet:disbandRequest', ({ vesselId }) => {
      this._disbandVessel(vesselId);
    });

    // Synchronizuj nazwę kolonii po rename ciała niebieskiego
    EventBus.on('body:renamed', ({ entity, name }) => {
      if (!entity?.id || !name) return;
      const colony = this._colonies.get(entity.id);
      if (colony) {
        colony.name = name;
        EventBus.emit('colony:listChanged', {});
      }
    });

    // Tick budowy statków + pending ship/outpost orders + podatki
    // civDeltaYears dla mechanik 4X (budowa, pending), deltaYears fizyczne dla podatków (raz/rok gry)
    EventBus.on('time:tick', ({ deltaYears: physDt, civDeltaYears: civDt }) => {
      this._tickShipBuilds(civDt);
      this._tickGroundUnitBuilds(civDt);
      this._tickGroundUnitUpkeep(civDt);       // Opcja C v3
      this._tickPendingPopReturns(civDt);      // Opcja C v3
      this._tickPendingShipOrders();
      this._tickPendingOutpostOrders();
      this._tickPendingStationOrders();
      this._tickTaxCollection(physDt);
    });

    // Opcja C v3: subscribe groundUnit:destroyed → kolejka reintegracji POPów
    this._subscribeGroundUnitDestroyed();

    // Invaliduj cache shipyard level przy budowie/rozbiórce/upgrade stoczni
    // planetId z eventu (BuildingSystem._tickConstruction) — fallback _activePlanetId
    // dla buildResult/demolishResult/upgradeResult (guarded — zawsze aktywna kolonia)
    const invalidateShipyard = ({ buildingId, tile, planetId }) => {
      if (buildingId === 'shipyard' || tile?.buildingId === 'shipyard') {
        const pid = planetId ?? this._activePlanetId;
        const colony = pid ? this._colonies.get(pid) : null;
        if (colony) colony._shipyardLevelDirty = true;
      }
    };
    EventBus.on('planet:buildResult', invalidateShipyard);
    EventBus.on('planet:demolishResult', invalidateShipyard);
    EventBus.on('planet:upgradeResult', invalidateShipyard);
    // Budynki z buildTime kończą budowę asynchronicznie — invaliduj też po zakończeniu
    EventBus.on('planet:constructionComplete', invalidateShipyard);

    // ── Zniszczenie ciała niebieskiego z kolonią ────────────────────────────
    EventBus.on('body:collision', ({ loser }) => {
      if (loser && this._colonies.has(loser.id)) {
        this.removeColony(loser.id, 'collision');
      }
    });
    EventBus.on('planet:ejected', ({ planet }) => {
      if (planet && this._colonies.has(planet.id)) {
        this.removeColony(planet.id, 'ejected');
      }
    });
    // Fallback: entity usunięty z EntityManager (np. kolizja bez body:collision)
    EventBus.on('entity:removed', ({ entity }) => {
      if (entity && this._colonies.has(entity.id)) {
        queueMicrotask(() => {
          if (this._colonies.has(entity.id)) {
            this.removeColony(entity.id, 'destroyed');
          }
        });
      }
    });
  }

  // ── API publiczne ───────────────────────────────────────────────────────

  // Czy ciało niebieskie ma kolonię?
  hasColony(planetId) {
    return this._colonies.has(planetId);
  }

  // Pobierz stan kolonii
  getColony(planetId) {
    return this._colonies.get(planetId) ?? null;
  }

  // Pobierz aktualnie aktywną kolonię (używane przez UI takie jak GroundUnitPanel)
  getActiveColony() {
    if (!this._activePlanetId) return null;
    return this._colonies.get(this._activePlanetId) ?? null;
  }

  // Pobierz ResourceSystem kolonii
  getResourceSystem(planetId) {
    return this._colonies.get(planetId)?.resourceSystem ?? null;
  }

  // Pobierz CivilizationSystem kolonii
  getCivSystem(planetId) {
    return this._colonies.get(planetId)?.civSystem ?? null;
  }

  // Wszystkie kolonie jako tablica
  getAllColonies() {
    return [...this._colonies.values()];
  }

  // Kolonie w danym układzie gwiezdnym
  getColoniesInSystem(systemId) {
    return this.getAllColonies().filter(c => (c.systemId ?? 'sys_home') === systemId);
  }

  // Liczba kolonii
  get colonyCount() {
    return this._colonies.size;
  }

  // Aktywna kolonia
  get activePlanetId() {
    return this._activePlanetId;
  }
  set activePlanetId(id) {
    this._activePlanetId = id;
  }

  // Przełącz aktywną kolonię — swap systemów w window.KOSMOS
  // Zwraca true jeśli przełączono, false jeśli kolonia nie istnieje
  switchActiveColony(planetId) {
    const colony = this.getColony(planetId);
    if (!colony) return false;
    this._activePlanetId = planetId;
    window.KOSMOS.resourceSystem  = colony.resourceSystem;
    window.KOSMOS.civSystem       = colony.civSystem;
    if (colony.buildingSystem) window.KOSMOS.buildingSystem = colony.buildingSystem;
    if (colony.factorySystem)     window.KOSMOS.factorySystem     = colony.factorySystem;
    if (colony.prosperitySystem)  window.KOSMOS.prosperitySystem  = colony.prosperitySystem;
    if (window.KOSMOS.expeditionSystem) window.KOSMOS.expeditionSystem.resourceSystem = colony.resourceSystem;
    if (window.KOSMOS.techSystem)       window.KOSMOS.techSystem.resourceSystem       = colony.resourceSystem;
    // Wymuś odświeżenie UI zasobów nowej kolonii (usuwa stale dane z poprzedniej)
    EventBus.emit('resource:requestSnapshot');
    return true;
  }

  // Aktywny ResourceSystem (do użycia przez UI)
  get activeResourceSystem() {
    return this.getResourceSystem(this._activePlanetId);
  }

  // Aktywny CivSystem
  get activeCivSystem() {
    return this.getCivSystem(this._activePlanetId);
  }

  // Łączna populacja imperium
  get totalPopulation() {
    let total = 0;
    for (const col of this._colonies.values()) {
      total += col.civSystem.population;
    }
    return total;
  }

  // Rozmiar siatki dla danego ciała niebieskiego
  static getGridSize(entity) {
    if (entity.type === 'planetoid') return GRID_SIZES.planetoid;
    if (entity.type === 'moon') {
      const mass = entity.physics?.mass ?? 0;
      return mass >= MOON_MASS_THRESHOLD ? GRID_SIZES.moon_large : GRID_SIZES.moon_small;
    }
    if (entity.type === 'planet') {
      if (entity.planetType === 'ice') return GRID_SIZES.planet_ice;
      return GRID_SIZES.planet_rocky;
    }
    return GRID_SIZES.default;
  }

  // ── Tworzenie kolonii ─────────────────────────────────────────────────

  // Zarejestruj homePlanet jako pierwszą kolonię (przy civMode=true)
  registerHomePlanet(planet, resourceSystem, civSystem, buildingSystem = null) {
    // Milestone founding dla home planet
    civSystem.initFoundingMilestone?.();

    // FactorySystem per-kolonia
    const factSys = new FactorySystem(resourceSystem);
    if (buildingSystem) {
      buildingSystem.setFactorySystem(factSys);
      buildingSystem.setPlanetId(planet.id);
    }

    // ProsperitySystem per-kolonia
    const prospSys = new ProsperitySystem(resourceSystem, civSystem, this.techSystem, planet);

    const colony = {
      planetId:        planet.id,
      planet:          planet,
      isHomePlanet:    true,
      ownerEmpireId:   null,  // Slice 1: null = gracz, empire_xxx = imperium AI
      name:            planet.name,
      systemId:        planet.systemId ?? window.KOSMOS?.activeSystemId ?? 'sys_home',
      founded:         Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0),
      resourceSystem:  resourceSystem,
      civSystem:       civSystem,
      buildingSystem:  buildingSystem,  // per-kolonia BuildingSystem
      factorySystem:   factSys,
      prosperitySystem: prospSys,
      grid:            null,  // ustawiane przy otwarciu mapy
      allowImmigration: true,
      allowEmigration:  true,
      fleet:           [],    // statki w hangarze: ['science_vessel', ...]
      shipQueues:      [],    // sloty budowy: [{ shipId, progress, buildTime }, ...]
      groundUnitQueues: [],   // Ground Unit System: kolejka rekrutacji [{ archetypeId, factionId, progress, buildTime }]
      credits:         500,   // Kredyty startowe — budżet operacyjny misji kolonizacyjnej
      creditsPerYear:  0,
      tradeCapacity:   0,
      activeTradeConnections: [],
      tradeOverrides:  {},
    };
    this._colonies.set(planet.id, colony);
    this._activePlanetId = planet.id;
    window.KOSMOS.factorySystem = factSys;
    window.KOSMOS.prosperitySystem = prospSys;
    return colony;
  }

  // Utwórz nową kolonię (z ekspedycji kolonizacyjnej)
  createColony(planetId, startResources, startPop, gameYear) {
    // Guard: nie nadpisuj istniejącej kolonii
    if (this._colonies.has(planetId)) {
      return this._colonies.get(planetId);
    }
    const entity = this._findEntity(planetId);
    if (!entity) {
      console.warn('[ColonyManager] Nie znaleziono encji:', planetId);
      return null;
    }

    // ResourceSystem per-kolonia (nowy model inventory)
    const resSys = new ResourceSystem(startResources);

    // CivilizationSystem per-kolonia
    const civSys = new CivilizationSystem({
      population: startPop,
      housing:    0,  // Stolica doda 4
    }, this.techSystem, entity);
    civSys.resourceSystem = resSys;
    civSys.initFoundingMilestone();  // milestone 'founding' w historii kolonii

    // BuildingSystem per-kolonia — powiązany z własnymi ResourceSystem i CivilizationSystem
    const bSys = new BuildingSystem(resSys, civSys, this.techSystem);
    civSys.buildingSystem = bSys;  // referencja do strata demand
    bSys.setDeposits(entity.deposits ?? []);
    bSys.setPlanetId(planetId);

    // FactorySystem per-kolonia
    const factSys = new FactorySystem(resSys);
    bSys.setFactorySystem(factSys);

    // ProsperitySystem per-kolonia
    const prospSys = new ProsperitySystem(resSys, civSys, this.techSystem, entity);

    const colony = {
      planetId,
      planet:          entity,
      isHomePlanet:    false,
      ownerEmpireId:   null,  // Slice 1: null = gracz; bootstrap AI nadpisze
      name:            entity.name,
      systemId:        entity.systemId ?? window.KOSMOS?.activeSystemId ?? 'sys_home',
      founded:         gameYear,
      resourceSystem:  resSys,
      civSystem:       civSys,
      buildingSystem:  bSys,
      factorySystem:   factSys,
      prosperitySystem: prospSys,
      grid:            null,
      allowImmigration: true,
      allowEmigration:  true,
      fleet:           [],
      shipQueues:      [],
      groundUnitQueues: [],
      credits:         0,
      creditsPerYear:  0,
      tradeCapacity:   0,
      activeTradeConnections: [],
      tradeOverrides:  {},
    };

    this._colonies.set(planetId, colony);

    EventBus.emit('colony:founded', { colony });
    EventBus.emit('colony:listChanged', {});

    return colony;
  }

  // Utwórz outpost (mini-kolonia bez POPów)
  createOutpost(planetId, startResources, gameYear) {
    // Guard: nie nadpisuj istniejącej kolonii/outpostu
    if (this._colonies.has(planetId)) {
      const existing = this._colonies.get(planetId);
      // Dostarcz zasoby do istniejącej kolonii zamiast nadpisywać
      if (startResources && Object.keys(startResources).length > 0) {
        existing.resourceSystem?.receive(startResources);
      }
      return existing;
    }
    const entity = this._findEntity(planetId);
    if (!entity) {
      console.warn('[ColonyManager] Nie znaleziono encji dla outpost:', planetId);
      return null;
    }

    // ResourceSystem per-outpost (magazyn)
    const resSys = new ResourceSystem(startResources);

    // CivilizationSystem — zamrożona (pop=0, housing=0)
    const civSys = new CivilizationSystem({
      population: 0,
      housing:    0,
    }, this.techSystem, entity);
    civSys.resourceSystem = resSys;

    // BuildingSystem per-outpost — flaga _isOutpost pomija POP
    const bSys = new BuildingSystem(resSys, civSys, this.techSystem);
    civSys.buildingSystem = bSys;
    bSys._isOutpost = true;
    bSys.setDeposits(entity.deposits ?? []);
    bSys.setPlanetId(planetId);

    // Generuj HexGrid — potrzebny do autoPlaceBuilding
    const grid = PlanetMapGenerator.generate(entity, false);
    bSys._grid = grid;
    bSys._gridHeight = grid.height ?? 10;

    // FactorySystem per-outpost
    const factSys = new FactorySystem(resSys);
    bSys.setFactorySystem(factSys);

    // ProsperitySystem per-outpost (pop=0 → prosperity=0, brak demand/epoch)
    const prospSys = new ProsperitySystem(resSys, civSys, this.techSystem, entity);
    prospSys.prosperity = 0;
    prospSys.targetProsperity = 0;

    // Oznacz ciało jako zbadane
    entity.explored = true;

    const colony = {
      planetId,
      planet:          entity,
      isHomePlanet:    false,
      isOutpost:       true,
      ownerEmpireId:   null,  // Slice 1: null = gracz
      name:            entity.name,
      systemId:        entity.systemId ?? window.KOSMOS?.activeSystemId ?? 'sys_home',
      founded:         gameYear,
      resourceSystem:  resSys,
      civSystem:       civSys,
      buildingSystem:  bSys,
      factorySystem:   factSys,
      prosperitySystem: prospSys,
      grid,
      allowImmigration: false,
      allowEmigration:  false,
      fleet:           [],
      shipQueues:      [],
      groundUnitQueues: [],
      credits:         0,
      creditsPerYear:  0,
      tradeCapacity:   0,
      activeTradeConnections: [],
      tradeOverrides:  {},
    };

    this._colonies.set(planetId, colony);

    EventBus.emit('outpost:founded', { colony });
    EventBus.emit('colony:listChanged', {});

    return colony;
  }

  // Upgrade outpost do pełnej kolonii (np. po przybyciu colony_ship)
  upgradeOutpostToColony(planetId, startPop) {
    const colony = this.getColony(planetId);
    if (!colony || !colony.isOutpost) return false;

    colony.isOutpost = false;
    colony.civSystem.setPopulation(startPop);
    colony.allowImmigration = true;
    colony.allowEmigration  = true;

    // Wyłącz flagę outpost w BuildingSystem (usunięcie kary ×0.6)
    if (colony.buildingSystem) {
      colony.buildingSystem._isOutpost = false;
      colony.buildingSystem._reapplyAllRates();
    }

    // Prosperity: start od 30 (pionierska kolonia — ProsperitySystem teraz liczy normalnie)
    if (colony.prosperitySystem) {
      colony.prosperitySystem.prosperity = 30;
      colony.prosperitySystem.targetProsperity = 30;
    }

    EventBus.emit('colony:founded', { colony });
    EventBus.emit('colony:listChanged', {});

    return true;
  }

  // ── Zniszczenie kolonii ──────────────────────────────────────────────

  // Usuń kolonię (ciało niebieskie zniszczone/wyrzucone)
  // Pomija homePlanet — game over obsługiwany w GameScene
  removeColony(planetId, reason = 'destroyed') {
    const colony = this._colonies.get(planetId);
    if (!colony) return;

    // HomePlanet → game over (obsługa w GameScene)
    if (colony.isHomePlanet) return;

    const vMgr = window.KOSMOS?.vesselManager;
    const destroyedVesselIds = [];

    // Zniszcz statki w hangarze tej kolonii
    if (vMgr && colony.fleet?.length > 0) {
      for (const vesselId of [...colony.fleet]) {
        const vessel = vMgr.getVessel(vesselId);
        if (vessel && vessel.position.state === 'docked') {
          destroyedVesselIds.push(vesselId);
          vMgr.destroyVessel(vesselId);
        }
      }
    }

    // Usuń drogi handlowe dotyczące tej kolonii (stary system ColonyManager)
    this._tradeRoutes = this._tradeRoutes.filter(
      r => r.colonyA !== planetId && r.colonyB !== planetId
    );

    // Jeśli aktywna kolonia = zniszczona → przełącz na homePlanet
    if (this._activePlanetId === planetId) {
      const homePlanetId = window.KOSMOS?.homePlanet?.id;
      if (homePlanetId && this._colonies.has(homePlanetId)) {
        this.switchActiveColony(homePlanetId);
      }
    }

    const colonyName = colony.name ?? planetId;
    const isOutpost  = colony.isOutpost ?? false;
    const population = colony.civSystem?.population ?? 0;

    this._colonies.delete(planetId);

    EventBus.emit('colony:destroyed', {
      planetId,
      colonyName,
      reason,
      isOutpost,
      population,
      destroyedVesselIds,
    });
    EventBus.emit('colony:listChanged', {});
  }

  // ── Faza 6: Przejęcie kolonii przez obce imperium ─────────────────
  //
  // Zwraca true jeśli transfer się udał. Obowiązujące reguły:
  //   - Kolonia znika z listy gracza (_colonies.delete)
  //   - Statki w hangarze zniszczone (analogicznie do removeColony)
  //   - Empire dostaje nową kolonię w swoim .colonies[] (przez EmpireRegistry)
  //   - Event colony:captured dla UI/narracji
  //   - HomePlanet → game over jest obsługiwany w GameScene przez colony:captured

  transferColony(planetId, newOwnerEmpireId, reason = 'invasion') {
    const colony = this._colonies.get(planetId);
    if (!colony) return false;

    const vMgr = window.KOSMOS?.vesselManager;
    const empireReg = window.KOSMOS?.empireRegistry;
    const destroyedVesselIds = [];
    // Zniszcz statki w hangarze przejętej kolonii
    if (vMgr && colony.fleet?.length > 0) {
      for (const vesselId of [...colony.fleet]) {
        const vessel = vMgr.getVessel(vesselId);
        if (vessel && vessel.position.state === 'docked') {
          destroyedVesselIds.push(vesselId);
          vMgr.destroyVessel(vesselId);
        }
      }
    }

    // Usuń drogi handlowe
    this._tradeRoutes = this._tradeRoutes.filter(
      r => r.colonyA !== planetId && r.colonyB !== planetId
    );

    // Jeśli to aktywna kolonia → przełącz na inną (priorytetowo homePlanet)
    const wasActive = this._activePlanetId === planetId;
    if (wasActive) {
      const homePlanetId = window.KOSMOS?.homePlanet?.id;
      if (homePlanetId && homePlanetId !== planetId && this._colonies.has(homePlanetId)) {
        this.switchActiveColony(homePlanetId);
      } else {
        // Wybierz dowolną inną kolonię
        const any = [...this._colonies.keys()].find(id => id !== planetId);
        if (any) this.switchActiveColony(any);
      }
    }

    const colonyName = colony.name ?? planetId;
    const population = colony.civSystem?.population ?? 0;
    const wasHomePlanet = !!colony.isHomePlanet;

    // Usuń z gracza
    this._colonies.delete(planetId);

    // Rozpoznaj systemId planety (via EntityManager)
    const planetEntity = EntityManager.get(planetId);
    const systemId = planetEntity?.systemId ?? null;

    // Dopisz do imperium — zaznacz w gameState (Slice 1: addColony(empireId, colonyId))
    if (empireReg?.addColony) {
      empireReg.addColony(newOwnerEmpireId, planetId);
    }
    // Oznacz system na galaxyData (dla rendering GalaxyMap)
    const gd = window.KOSMOS?.galaxyData;
    if (gd?.systems && systemId) {
      const gs = gd.systems.find(s => s.id === systemId);
      if (gs && !gs.empireId) gs.empireId = newOwnerEmpireId;
    }

    EventBus.emit('colony:captured', {
      planetId,
      colonyName,
      newOwner: newOwnerEmpireId,
      previousOwner: 'player',
      reason,
      population,
      wasHomePlanet,
      destroyedVesselIds,
    });
    EventBus.emit('colony:listChanged', {});

    return true;
  }

  // ── Drogi handlowe ────────────────────────────────────────────────

  // Pobierz listę dróg handlowych
  getTradeRoutes() {
    return [...this._tradeRoutes];
  }

  // Dodaj drogę handlową
  addTradeRoute(colonyA, colonyB) {
    if (!this.hasColony(colonyA) || !this.hasColony(colonyB)) return null;
    if (colonyA === colonyB) return null;
    // Nie duplikuj
    const exists = this._tradeRoutes.some(
      r => (r.colonyA === colonyA && r.colonyB === colonyB) ||
           (r.colonyA === colonyB && r.colonyB === colonyA)
    );
    if (exists) return null;

    const route = {
      id:       `route_${Date.now()}`,
      colonyA,
      colonyB,
      interval: TRADE_INTERVAL,
      active:   true,
    };
    this._tradeRoutes.push(route);
    EventBus.emit('colony:listChanged', {});
    return route;
  }

  // Usuń drogę handlową
  removeTradeRoute(routeId) {
    this._tradeRoutes = this._tradeRoutes.filter(r => r.id !== routeId);
    EventBus.emit('colony:listChanged', {});
  }

  // ── Flota — budowa i zarządzanie statkami ────────────────────────

  // Pobierz łączną liczbę slotów stoczni w kolonii (suma poziomów wszystkich stoczni)
  // Cache per-kolonia — invalidowany przy budowie/rozbiórce stoczni
  _getShipyardLevel(colony) {
    if (colony._cachedShipyardLevel != null && !colony._shipyardLevelDirty) {
      return colony._cachedShipyardLevel;
    }
    const bSys = colony?.buildingSystem;
    if (!bSys) return 0;
    let totalSlots = 0;
    for (const entry of bSys._active.values()) {
      if (entry.building.id === 'shipyard') totalSlots += entry.level ?? 1;
    }
    colony._cachedShipyardLevel = totalSlots;
    colony._shipyardLevelDirty = false;
    return totalSlots;
  }

  // Rozpocznij budowę statku w stoczni danej kolonii
  startShipBuild(planetId, shipId, moduleIds = []) {
    const colony = this.getColony(planetId);
    if (!colony) {
      EventBus.emit('fleet:buildFailed', { reason: t('fleet.colonyNotFound') });
      return { ok: false, reason: t('fleet.colonyNotFound') };
    }

    const ship = SHIPS[shipId] ?? HULLS[shipId];
    if (!ship) {
      EventBus.emit('fleet:buildFailed', { reason: t('fleet.unknownShip') });
      return { ok: false, reason: t('fleet.unknownShip') };
    }

    // Sprawdź tech — AI używa per-empire techSystem kolonii (Slice 2 S3), gracz
    // fallback na globalny window.KOSMOS.techSystem (gracz nie ma colony.techSystem).
    // Bez tego AI nigdy nie zbudowałoby hull_small (requires 'exploration'), bo
    // this.techSystem to drzewo gracza, nie imperium.
    const buildTech = colony.techSystem ?? this.techSystem;
    if (ship.requires && !buildTech?.isResearched(ship.requires)) {
      const reason = t('fleet.requiresTech', ship.requires);
      EventBus.emit('fleet:buildFailed', { reason });
      return { ok: false, reason };
    }

    // Sprawdź czy stocznia istnieje i ile slotów ma
    const shipyardLevel = this._getShipyardLevel(colony);
    if (shipyardLevel === 0) {
      const reason = t('fleet.noShipyard');
      EventBus.emit('fleet:buildFailed', { reason });
      return { ok: false, reason };
    }

    // Sprawdź czy są wolne sloty (1 slot per poziom stoczni)
    if (!colony.shipQueues) colony.shipQueues = [];
    if (colony.shipQueues.length >= shipyardLevel) {
      const reason = t('fleet.shipyardFull', colony.shipQueues.length, shipyardLevel);
      EventBus.emit('fleet:buildFailed', { reason });
      return { ok: false, reason };
    }

    // Sprawdź POPy (załoga blokowana przy budowie) — hard fail
    const crewCost = ship.crewCost ?? 0;
    let crewStrata = ship.crewStrata ?? null;
    if (crewCost > 0) {
      const civSys = colony.civSystem;
      const freePops = civSys?.freePops ?? 0;
      if (freePops < crewCost) {
        const reason = t('fleet.noCrewPops', crewCost);
        EventBus.emit('fleet:buildFailed', { reason });
        return { ok: false, reason };
      }
      // Konwertuj wolnych POPów do wymaganej strata (jeśli brakuje)
      if (crewStrata && crewStrata !== 'mix' && civSys) {
        civSys.convertToStrata(crewStrata, crewCost);
      }
    }

    // Sprawdź czy stać na koszt (surowce + commodities + moduły)
    const allCosts = { ...ship.cost, ...(ship.commodityCost || {}) };
    for (const mId of moduleIds) {
      const mod = SHIP_MODULES?.[mId];
      if (!mod) continue;
      if (mod.cost) for (const [k, v] of Object.entries(mod.cost)) allCosts[k] = (allCosts[k] ?? 0) + v;
      if (mod.commodityCost) for (const [k, v] of Object.entries(mod.commodityCost)) allCosts[k] = (allCosts[k] ?? 0) + v;
    }
    if (!colony.resourceSystem.canAfford(allCosts)) {
      // Brak surowców → dodaj do pending ship orders
      if (!colony.pendingShipOrders) colony.pendingShipOrders = [];
      const orderId = `pso_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      colony.pendingShipOrders.push({
        id: orderId,
        shipId: ship.id,
        cost: { ...allCosts },
        crewCost,
        modules: moduleIds,
        queuedAt: window.KOSMOS?.timeSystem?.gameTime ?? 0,
      });
      EventBus.emit('fleet:buildQueued', { planetId, shipId: ship.id, cost: { ...allCosts } });
      return { ok: true, queued: true };
    }

    // Pobierz zasoby
    colony.resourceSystem.spend(allCosts);

    // Zablokuj POPy — załoga przydzielona do statku (bezpośrednio na kolonii)
    if (crewCost > 0 && colony.civSystem) {
      colony.civSystem.lockPops(crewCost, crewStrata);
    }

    // Dodaj do kolejki budowy
    colony.shipQueues.push({
      shipId:    ship.id,
      progress:  0,
      buildTime: ship.buildTime,
      modules:   moduleIds,
    });

    EventBus.emit('fleet:buildStarted', { planetId, shipId: ship.id });
    return { ok: true };
  }

  // Tick budowy statków — wywoływany z time:tick
  // Prędkość budowy = poziom stoczni (Lv2=2×, Lv3=3×, Lv4=4× itd.)
  _tickShipBuilds(deltaYears) {
    for (const colony of this._colonies.values()) {
      const queues = colony.shipQueues;
      if (!queues || queues.length === 0) continue;

      // Bonus prędkości: wolne sloty przyspieszają budowę (totalSlots / usedSlots)
      const shipyardLevel = this._getShipyardLevel(colony);
      const speedBonus = Math.max(1, Math.floor(shipyardLevel / queues.length));

      // Iteruj od końca — splice nie zaburza indeksu
      for (let i = queues.length - 1; i >= 0; i--) {
        queues[i].progress += deltaYears * speedBonus;
        if (queues[i].progress >= queues[i].buildTime) {
          const shipId = queues[i].shipId;
          const modules = queues[i].modules || [];
          // Odblokuj POPy zablokowane przez Surge
          if (queues[i].surgePopsLocked > 0 && colony.civSystem) {
            colony.civSystem.unlockPops(queues[i].surgePopsLocked, 'mix');
          }
          queues.splice(i, 1);
          EventBus.emit('fleet:shipCompleted', { planetId: colony.planetId, shipId, modules });
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Ground Unit System — rekrutacja jednostek naziemnych (Opcja C v3)
  // ══════════════════════════════════════════════════════════════════════
  //
  // Gating: ARCHETYPE_REQUIREMENTS (barracks lv + tech) + pop cap + barracks slots.
  // Koszty: rare materials + commodities + laborer POP (lock) + Credits.
  // Utrzymanie: energy flow + Kr/y (upkeep tick co 1.0 civYear).
  // Init: fresh unit spawn z maxOrg = baseOrg + techBonuses (cap 100), supply = cap.
  // Szczegóły: docs/plan-ground-unit-recruitment-option-c-v3.md

  // Rare materials + commodities per archetype (build cost, jednorazowy)
  static GROUND_UNIT_BUILD_COSTS = {
    shock_infantry:     { Ti: 8,  Si: 5,  Hv: 2  },
    garrison_unit:      { Ti: 15, Si: 8,  Hv: 25 },
    rocket_artillery:   { Ti: 20, Si: 12, Hv: 18, Xe: 1 },
    aa_platform:        { Ti: 10, Si: 25, Hv: 8,  Xe: 2 },
    medic_unit:         { Ti: 8,  Si: 10, Hv: 5  },
    recon_drone:        { Ti: 5,  Si: 18,         Xe: 3 },
    ground_supply_unit: { Ti: 12, Si: 15 },
  };

  static GROUND_UNIT_COMMODITY_COSTS = {
    shock_infantry:     { structural_alloys: 2, reactive_armor: 1 },
    garrison_unit:      { structural_alloys: 5, reactive_armor: 4 },
    rocket_artillery:   { structural_alloys: 4, electronic_systems: 3, polymer_composites: 2 },
    aa_platform:        { structural_alloys: 3, electronic_systems: 4, metamaterials: 1 },
    medic_unit:         { polymer_composites: 3 },
    recon_drone:        { electronic_systems: 3, polymer_composites: 2 },
    ground_supply_unit: { structural_alloys: 5, electronic_systems: 3 },
  };

  // POP cost (zawsze 'laborer' — rekruci z wolnej populacji)
  static GROUND_UNIT_POP_COSTS = {
    shock_infantry: 0.15, garrison_unit: 0.30, rocket_artillery: 0.40,
    aa_platform: 0.30, medic_unit: 0.25, recon_drone: 0.00,
    ground_supply_unit: 0.30,
  };

  static GROUND_UNIT_CREDITS_BUILD = {
    shock_infantry: 100, garrison_unit: 250, rocket_artillery: 500,
    aa_platform: 400, medic_unit: 300, recon_drone: 400,
    ground_supply_unit: 350,
  };

  // Utrzymanie co 1.0 civYear — tylko kredyty (energy wyłączone: komplikowało drop/invasion UX).
  // Pola energy zachowane = 0 dla przyszłego re-enable; tick ignoruje je całkowicie.
  static GROUND_UNIT_UPKEEP = {
    shock_infantry:     { energy: 0, credits: 2  },
    garrison_unit:      { energy: 0, credits: 5  },
    rocket_artillery:   { energy: 0, credits: 10 },
    aa_platform:        { energy: 0, credits: 8  },
    medic_unit:         { energy: 0, credits: 6  },
    recon_drone:        { energy: 0, credits: 8  },
    ground_supply_unit: { energy: 0, credits: 5  },
  };

  static GROUND_UNIT_BUILD_TIMES = {
    shock_infantry: 0.8, garrison_unit: 1.2, rocket_artillery: 1.4,
    aa_platform: 1.1, medic_unit: 1.0, recon_drone: 0.8,
    ground_supply_unit: 1.2,
  };

  // Reintegracja POPów po śmierci jednostki — { rate: 0..1, delay: civYears }
  static GROUND_UNIT_POP_REINTEGRATION = {
    shock_infantry:     { rate: 0.5,  delay: 2.0 },
    garrison_unit:      { rate: 1.0,  delay: 1.0 },
    rocket_artillery:   { rate: 0.5,  delay: 2.0 },
    aa_platform:        { rate: 0.5,  delay: 2.0 },
    medic_unit:         { rate: 0.75, delay: 1.0 },
    recon_drone:        { rate: 0.0,  delay: 0.0 },
    ground_supply_unit: { rate: 0.75, delay: 1.5 },
  };

  static UPKEEP_GRACE_CIVYEARS = 5;  // offline → disband po tylu civYears bez utrzymania

  // ── Helpery Barracks ─────────────────────────────────────────────────────

  /** Max poziom koszar w kolonii (0 gdy brak). */
  _getBarracksLevel(colony) {
    let max = 0;
    if (this._hasBuilding(colony, 'barracks_lv1')) max = Math.max(max, 1);
    if (this._hasBuilding(colony, 'barracks_lv2')) max = Math.max(max, 2);
    if (this._hasBuilding(colony, 'barracks_lv3')) max = Math.max(max, 3);
    return max;
  }

  /** Łączna liczba slotów rekrutacji (każdy barracks = 1 slot). */
  _getBarracksSlots(colony) {
    let slots = 0;
    const bSys = colony?.buildingSystem;
    if (!bSys) return 0;
    for (const [, entry] of bSys._active) {
      const id = entry.building.id;
      if (id === 'barracks_lv1' || id === 'barracks_lv2' || id === 'barracks_lv3') slots += 1;
    }
    return slots;
  }

  /** Maks jednostek w kolonii (floor(pop/4), min 2). Drony i supply unit exempt. */
  _getMaxGroundUnits(colony) {
    const pop = Math.floor(colony.civSystem?.population ?? 0);
    return Math.max(2, Math.floor(pop / 4));
  }

  /** Czy można zrekrutować kolejną jednostkę (pop cap)? */
  _canRecruitMoreUnits(colony, archetypeId) {
    if (GROUND_UNIT_CAP_EXEMPT.has(archetypeId)) return true;

    const mgr = window.KOSMOS?.groundUnitManager;
    if (!mgr) return true;

    const units = mgr.getUnitsOnPlanet?.(colony.planetId) ?? [];
    const counted = units.filter(u =>
      (u.owner === 'player' || u.factionId === 'humanity') &&
      !GROUND_UNIT_CAP_EXEMPT.has(u.archetypeId)
    );
    return counted.length < this._getMaxGroundUnits(colony);
  }

  /**
   * Uruchom rekrutację jednostki naziemnej w danej kolonii (Opcja C v3).
   * 9-step check: colony → archetype → gating (barracks+tech) → cap → slot →
   *               pop → credits → resources → (spend + queue with init stats).
   * @returns {{ok: boolean, reason?: string, missing?: string, requiredLv?: number}}
   */
  startGroundUnitBuild(planetId, archetypeId, factionId = 'humanity') {
    const colony = this.getColony(planetId);
    if (!colony) return { ok: false, reason: 'colony_not_found' };
    if (!UNIT_ARCHETYPES[archetypeId]) return { ok: false, reason: 'unknown_archetype' };

    // 1. Gating: Barracks Lv + Tech
    const barracksLv = this._getBarracksLevel(colony);
    const unlock = checkArchetypeUnlocked(archetypeId, barracksLv, this.techSystem);
    if (!unlock.unlocked) {
      EventBus.emit('groundUnit:buildFailed', { planetId, archetypeId, ...unlock });
      return { ok: false, ...unlock };
    }

    // 2. Pop cap (kolonia nie może mieć więcej niż floor(pop/4) jednostek bojowych)
    if (!this._canRecruitMoreUnits(colony, archetypeId)) {
      const max = this._getMaxGroundUnits(colony);
      EventBus.emit('groundUnit:buildFailed', { planetId, archetypeId, reason: 'cap_reached', max });
      return { ok: false, reason: 'cap_reached', max };
    }

    // 3. Barracks slot — każdy barracks = 1 slot budowy równoległej
    if (!colony.groundUnitQueues) colony.groundUnitQueues = [];
    const maxSlots = this._getBarracksSlots(colony);
    if (colony.groundUnitQueues.length >= maxSlots) {
      EventBus.emit('groundUnit:buildFailed', { planetId, archetypeId, reason: 'barracks_full', current: colony.groundUnitQueues.length, max: maxSlots });
      return { ok: false, reason: 'barracks_full', current: colony.groundUnitQueues.length, max: maxSlots };
    }

    // 4. Free POPs (laborer)
    const popCost = ColonyManager.GROUND_UNIT_POP_COSTS[archetypeId] ?? 0;
    if (popCost > 0) {
      const freePops = colony.civSystem?.freePops ?? 0;
      if (freePops < popCost) {
        EventBus.emit('groundUnit:buildFailed', { planetId, archetypeId, reason: 'no_free_pops', required: popCost, available: freePops });
        return { ok: false, reason: 'no_free_pops', required: popCost, available: freePops };
      }
    }

    // 5. Credits
    const krCost = ColonyManager.GROUND_UNIT_CREDITS_BUILD[archetypeId] ?? 0;
    if ((colony.credits ?? 0) < krCost) {
      EventBus.emit('groundUnit:buildFailed', { planetId, archetypeId, reason: 'no_credits', required: krCost, available: colony.credits ?? 0 });
      return { ok: false, reason: 'no_credits', required: krCost, available: colony.credits ?? 0 };
    }

    // 6. Resources + Commodities (canAfford obsługuje oba razem)
    const elementCost   = ColonyManager.GROUND_UNIT_BUILD_COSTS[archetypeId]     ?? {};
    const commodityCost = ColonyManager.GROUND_UNIT_COMMODITY_COSTS[archetypeId] ?? {};
    const allCost = { ...elementCost, ...commodityCost };
    if (!colony.resourceSystem?.canAfford?.(allCost)) {
      EventBus.emit('groundUnit:buildFailed', { planetId, archetypeId, reason: 'cannot_afford', cost: allCost });
      return { ok: false, reason: 'cannot_afford', cost: allCost };
    }

    // 7. Wszystkie checki OK — pobierz
    colony.resourceSystem.spend(allCost);
    if (krCost > 0) {
      colony.credits = Math.max(0, (colony.credits ?? 0) - krCost);
      EventBus.emit('trade:spendCredits', { colonyId: planetId, amount: krCost, purpose: 'ground_unit_recruit' });
    }
    if (popCost > 0) colony.civSystem?.lockPops?.(popCost, 'laborer');

    // 8. Init stats z techBonuses
    const bonuses = this.techSystem?.getTechStatBonuses?.() ?? { org: 0, morale: 0, supplyCap: 0 };
    const arch    = UNIT_ARCHETYPES[archetypeId];
    const noMor   = arch.noMorale === true;
    const initialOrg       = Math.min(100, (arch.baseOrg    ?? 10) + bonuses.org);
    const initialMorale    = noMor ? 0 : Math.min(100, (arch.baseMorale ?? 10) + bonuses.morale);
    const initialSupplyCap = Math.min(200, (arch.baseSupplyCap ?? 100) + bonuses.supplyCap);

    colony.groundUnitQueues.push({
      archetypeId,
      factionId,
      progress:  0,
      buildTime: ColonyManager.GROUND_UNIT_BUILD_TIMES[archetypeId] ?? 1.0,
      popCost,
      krCost,
      initialOrg,
      initialMorale,
      initialSupplyCap,
      // Opcja C v3 + "macierz": kolonia która zrekrutowała jednostkę opłaca jej upkeep
      homeColonyId: planetId,
    });

    EventBus.emit('groundUnit:buildStarted', { planetId, archetypeId, factionId, krCost, popCost });
    return { ok: true };
  }

  /** Tick kolejki rekrutacji — wywoływany co civDeltaYears. */
  _tickGroundUnitBuilds(civDeltaYears) {
    if (!civDeltaYears || civDeltaYears <= 0) return;

    for (const colony of this._colonies.values()) {
      const queues = colony.groundUnitQueues;
      if (!queues || queues.length === 0) continue;

      // Iteracja od końca — splice nie zaburza indeksu
      for (let i = queues.length - 1; i >= 0; i--) {
        queues[i].progress += civDeltaYears;
        if (queues[i].progress >= queues[i].buildTime) {
          const item = queues[i];
          queues.splice(i, 1);
          this._spawnGroundUnit(colony, item);
        }
      }
    }
  }

  /**
   * Tick utrzymania jednostek naziemnych (Opcja C v3 + "macierz").
   * Co 1.0 civYear sprawdza:
   *   - Kredyty (Kr) — pobrane z HOME colony (unit.homeColonyId, czyli kolonii która zrekrutowała)
   *   - Energia (flow) — sprawdzana w DEPLOYED colony (gdzie unit aktualnie stacjonuje)
   *
   * Lore: HQ płaci żołd niezależnie od deployment (jak regularna armia).
   *       Ale lokalna elektronika/radary ciągną prąd z lokalnej sieci.
   *
   * Brak któregoś → unit offline + unpaidYears++; 5 civYears → disband.
   */
  _tickGroundUnitUpkeep(civDeltaYears) {
    if (!civDeltaYears || civDeltaYears <= 0) return;
    this._upkeepAccum = (this._upkeepAccum ?? 0) + civDeltaYears;
    if (this._upkeepAccum < 1.0) return;
    this._upkeepAccum -= 1.0;

    const mgr = window.KOSMOS?.groundUnitManager;
    if (!mgr) return;

    // Zbierz wszystkie unity gracza
    const allUnits = [];
    for (const u of mgr._units?.values?.() ?? []) {
      if (u.owner === 'player' || u.factionId === 'humanity') allUnits.push(u);
    }
    if (allUnits.length === 0) return;

    // ── Grupowanie: Kr per homeColonyId ──
    // Energy upkeep wyłączony (commit: remove ground unit energy upkeep) —
    // psuło drop/invasion UX (jednostki na wrogich planetach leciały w offline).
    // Utrzymanie jest teraz tylko kredytowe, płacone z home colony.
    const krByHome = new Map();  // homeId → { total, units[] }

    for (const u of allUnits) {
      const up = ColonyManager.GROUND_UNIT_UPKEEP[u.archetypeId];
      if (!up) continue;

      const homeId = u.homeColonyId ?? u.planetId;
      const krBucket = krByHome.get(homeId) ?? { total: 0, units: [] };
      krBucket.total += up.credits ?? 0;
      krBucket.units.push(u);
      krByHome.set(homeId, krBucket);
    }

    // ── Sprawdź credits per home colony → zapłać atomowo albo wszystkich z tego home
    //    przenieś w offline ──
    for (const [homeId, bucket] of krByHome) {
      const home = this.getColony(homeId);
      const hasCredits = home && (home.credits ?? 0) >= bucket.total;

      if (hasCredits && bucket.total > 0) {
        home.credits = Math.max(0, (home.credits ?? 0) - bucket.total);
        EventBus.emit('trade:spendCredits', {
          colonyId: homeId, amount: bucket.total, purpose: 'ground_unit_upkeep',
        });
      }

      // Tylko Kr decyduje: online jeśli home ma kredyty na cały bucket
      for (const u of bucket.units) {
        const online = hasCredits;

        if (online) {
          const wasOffline = u.status === 'offline';
          u.unpaidYears = 0;
          if (wasOffline) {
            u.status = 'idle';
            EventBus.emit('groundUnit:resumed', { unitId: u.id, planetId: u.planetId });
          }
        } else {
          u.status      = 'offline';
          u.unpaidYears = (u.unpaidYears ?? 0) + 1;

          if (u.unpaidYears >= ColonyManager.UPKEEP_GRACE_CIVYEARS) {
            // Disband — pełen zwrot POPów do HOME colony (gdzie były zablokowane)
            if ((u.popCost ?? 0) > 0) {
              const homeForPop = home ?? this.getColony(u.planetId);
              homeForPop?.civSystem?.unlockPops?.(u.popCost, 'laborer');
            }
            EventBus.emit('groundUnit:disbanded', {
              unitId: u.id, planetId: u.planetId, homeColonyId: homeId,
              reason: 'no_credits',
              archetypeId: u.archetypeId ?? null,
            });
            mgr.removeUnit?.(u.id);
          }
        }
      }
    }
  }

  /**
   * Tick opóźnionej reintegracji POPów po śmierci jednostek (Opcja C v3).
   * colony._pendingPopReturns = [{ amount, strata, readyAt }] — akumulowane
   * przez handler `groundUnit:destroyed` w _subscribeGroundUnitDestroyed().
   */
  _tickPendingPopReturns(civDeltaYears) {
    if (!civDeltaYears || civDeltaYears <= 0) return;
    this._pendingPopClock = (this._pendingPopClock ?? 0) + civDeltaYears;

    for (const colony of this._colonies.values()) {
      const list = colony._pendingPopReturns;
      if (!list || list.length === 0) continue;

      for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (this._pendingPopClock >= entry.readyAt) {
          colony.civSystem?.unlockPops?.(entry.amount, entry.strata ?? 'laborer');
          list.splice(i, 1);
        }
      }
    }
  }

  /**
   * Lazy subscribe do 'groundUnit:destroyed' — jednorazowo (z constructora).
   * Kolejkuje reintegrację POPów wg tabeli GROUND_UNIT_POP_REINTEGRATION.
   */
  _subscribeGroundUnitDestroyed() {
    if (this._groundUnitDestroyedSubscribed) return;
    this._groundUnitDestroyedSubscribed = true;

    EventBus.on('groundUnit:destroyed', ({ unitId, planetId, popCost, archetypeId, cause }) => {
      if (!planetId || !(popCost > 0) || !archetypeId) return;
      const colony = this.getColony(planetId);
      if (!colony) return;

      const ri = ColonyManager.GROUND_UNIT_POP_REINTEGRATION[archetypeId];
      if (!ri || ri.rate <= 0) return;

      const returnAmount = popCost * ri.rate;
      const readyAt = (this._pendingPopClock ?? 0) + (ri.delay ?? 0);

      if (!colony._pendingPopReturns) colony._pendingPopReturns = [];
      colony._pendingPopReturns.push({
        amount:  returnAmount,
        strata:  'laborer',
        readyAt,
      });
    });
  }

  /**
   * Spawnuje jednostkę na hexie sąsiadującym z Capital.
   * @param {object} colony
   * @param {object} queueItem — { archetypeId, factionId, popCost, krCost,
   *                                initialOrg, initialMorale, initialSupplyCap }
   */
  _spawnGroundUnit(colony, queueItem) {
    const mgr = window.KOSMOS?.groundUnitManager;
    if (!mgr) {
      EventBus.emit('groundUnit:buildFailed', {
        planetId: colony.planetId, archetypeId: queueItem.archetypeId, reason: 'no_manager',
      });
      return null;
    }

    const { archetypeId, factionId } = queueItem;
    const spawn = this._findGroundUnitSpawn(colony);
    if (!spawn) {
      EventBus.emit('groundUnit:buildFailed', {
        planetId: colony.planetId, archetypeId, reason: 'no_spawn_hex',
      });
      return null;
    }

    // Factory-style: 5 pozycyjnych args (archetypeId, factionId, planetId, q, r)
    const unit = mgr.createUnit(archetypeId, factionId, colony.planetId, spawn.q, spawn.r);
    if (!unit) {
      EventBus.emit('groundUnit:buildFailed', {
        planetId: colony.planetId, archetypeId, reason: 'create_failed',
      });
      return null;
    }

    // Opcja C v3: wstrzyknij init supply/org/morale z queueItem (uwzględnia techBonuses)
    const arch = UNIT_ARCHETYPES[archetypeId];
    const noMor = arch?.noMorale === true;
    unit.maxOrg          = queueItem.initialOrg    ?? (arch?.baseOrg    ?? 10);
    unit.maxMorale       = noMor ? 0 : (queueItem.initialMorale ?? (arch?.baseMorale ?? 10));
    unit.org             = unit.maxOrg;
    unit.morale          = unit.maxMorale;
    unit.supplyCap       = queueItem.initialSupplyCap ?? (arch?.baseSupplyCap ?? 100);
    unit.supply          = unit.supplyCap;                        // fresh = full
    unit.supplyConsumption = arch?.supplyConsumption ?? 2;
    unit.noMorale        = noMor;
    unit.isSupplier      = arch?.isSupplier === true;
    unit.supplyTransferRate = arch?.supplyTransferRate ?? 0;
    unit.transportStatus = null;  // null | 'loaded' | 'in_transit'
    unit.unpaidYears     = 0;
    unit.status          = unit.status ?? 'idle';
    // POP cost zapamiętany dla death reintegration + disband refund
    unit.popCost         = queueItem.popCost ?? 0;
    // Opcja C v3 "macierz": home colony opłaca Kr upkeep niezależnie od deployment
    unit.homeColonyId    = queueItem.homeColonyId ?? colony.planetId;

    // Deploy/Pack: powyższe init nadpisuje supplyConsumption bazą z archetypu;
    // jednostki z supportsDeploy startują w Mobile, więc reapply żeby wziąć
    // mobileSupplyConsumption + mobileStats (mov=2, dmg=0 zamiast deployed mov=0).
    if (arch?.supportsDeploy) {
      mgr._applyDeployStateStats(unit);
    }

    EventBus.emit('groundUnit:buildCompleted', {
      unitId:      unit.id,
      archetypeId,
      factionId,
      planetId:    colony.planetId,
      q:           spawn.q,
      r:           spawn.r,
    });
    return unit;
  }

  /** Znajdź wolny hex do spawnu jednostki (spiral od Capital). */
  _findGroundUnitSpawn(colony) {
    const grid = colony.grid;
    if (!grid) return null;

    // Znajdź Capital hex
    let capQ = 0, capR = 0;
    let found = false;
    for (const tile of grid.toArray()) {
      if (tile?.capitalBase) { capQ = tile.q; capR = tile.r; found = true; break; }
    }
    if (!found) {
      // Fallback: pierwszy niepoza-oceanowy hex
      for (const tile of grid.toArray()) {
        if (tile && tile.type !== 'ocean') {
          capQ = tile.q; capR = tile.r; found = true; break;
        }
      }
    }
    if (!found) return null;

    const mgr = window.KOSMOS?.groundUnitManager;

    // Spiral 0→5 — wolny hex bez jednostki + nie-ocean
    for (let radius = 0; radius <= 5; radius++) {
      const tiles = grid.spiral(capQ, capR, radius);
      for (const tile of tiles) {
        if (!tile || tile.type === 'ocean') continue;
        if (mgr?.getUnitAt?.(colony.planetId, tile.q, tile.r)) continue;
        return { q: tile.q, r: tile.r };
      }
    }

    // Fallback: Capital hex (jednostka się tam pojawi nawet jeśli coś jest)
    return { q: capQ, r: capR };
  }

  // ── Surge — przyspieszenie budowy statku (POP + Kr) ─────────────────────
  // Koszt: 0.5 POP (lock do zakończenia) + 500 Kr
  // Efekt: −50% remaining time per surge
  static SURGE_POP_COST = 0.5;
  static SURGE_KR_COST  = 500;
  static SURGE_TIME_REDUCTION = 0.5;

  surgeShipBuild(planetId, queueIndex) {
    const colony = this.getColony(planetId);
    if (!colony) return { ok: false, reason: 'noColony' };

    const queues = colony.shipQueues;
    if (!queues?.[queueIndex]) return { ok: false, reason: 'noQueue' };
    const queue = queues[queueIndex];

    const shipDef = SHIPS[queue.shipId] ?? HULLS[queue.shipId];
    const maxSurge = shipDef?.maxSurge ?? 1;
    if ((queue.surgeCount ?? 0) >= maxSurge)
      return { ok: false, reason: 'maxSurgeReached' };

    // Sprawdź wolne POPy
    const freePops = colony.civSystem?.freePops ?? 0;
    if (freePops < ColonyManager.SURGE_POP_COST)
      return { ok: false, reason: 'insufficientPop' };

    // Sprawdź Kr
    const kr = colony.credits ?? 0;
    if (kr < ColonyManager.SURGE_KR_COST)
      return { ok: false, reason: 'insufficientCredits' };

    // Wydaj Kr przez CivilianTradeSystem
    EventBus.emit('trade:spendCredits', {
      colonyId: planetId,
      amount:   ColonyManager.SURGE_KR_COST,
      purpose:  'shipyard_surge',
    });

    // Zablokuj POPy
    colony.civSystem.lockPops(ColonyManager.SURGE_POP_COST, 'mix');

    // Przyspieszenie: −50% pozostałego czasu
    const remaining = queue.buildTime - queue.progress;
    queue.progress += remaining * ColonyManager.SURGE_TIME_REDUCTION;
    queue.surgeCount = (queue.surgeCount ?? 0) + 1;
    queue.surgePopsLocked = (queue.surgePopsLocked ?? 0) + ColonyManager.SURGE_POP_COST;

    EventBus.emit('shipyard:surgeApplied', {
      colonyId:   planetId,
      queueIndex,
      surgeCount: queue.surgeCount,
      newProgress: queue.progress,
    });

    return { ok: true, surgeCount: queue.surgeCount };
  }

  // ── Podatki — globalny system podatkowy ──────────────────────────────────
  // Każda kolonia odprowadza podatek co rok cywilizacyjny → Kr trafiają na konto
  // Stawka 0–25%, efekty na prosperity i lojalność
  // Formuła: Kr/rok = POP × 5 × prosperity × taxRate
  //   ×5 = skala bazowa dochodu per POP (zbalansowane z kosztami: Surge=500 Kr)

  get taxRate() { return this._taxRate; }
  set taxRate(val) {
    this._taxRate = Math.max(0, Math.min(0.25, val));
    EventBus.emit('tax:rateChanged', { rate: this._taxRate });
  }

  calculateTaxIncome(colony) {
    const pop = colony.civSystem?.population ?? 0;
    const prosperity = colony.prosperitySystem?.prosperity ?? 50;
    return Math.floor(pop * 5 * prosperity * this._taxRate);
  }

  _tickTaxCollection(deltaYears) {
    if (!window.KOSMOS?.civMode) return;
    // Akumuluj fizyczne lata — co miesiąc (1/12 roku) nalicz 1/12 rocznego przychodu
    this._taxAccum += deltaYears;
    const MONTH = 1 / 12;
    if (this._taxAccum < MONTH) return;
    this._taxAccum -= MONTH;
    this._applyTaxes(MONTH);
  }

  _applyTaxes(fraction) {
    // Slice 1: pomiń kolonie imperium AI (ownerEmpireId !== null)
    const colonies = this.getAllColonies().filter(c => !c.ownerEmpireId);
    let totalIncome = 0;

    for (const colony of colonies) {
      if (colony.isOutpost) continue; // outposty nie płacą podatków
      // Miesięczna rata = roczny przychód × fraction (1/12)
      const annual = this.calculateTaxIncome(colony);
      const income = Math.floor(annual * fraction);
      colony.credits = (colony.credits ?? 0) + income;
      totalIncome += income;
    }

    // Ryzyko protestu przy ekstremalnych podatkach (>20%) — co 12 miesięcy
    if (this._taxRate > 0.20) {
      this._taxProtestAccum++;
      if (this._taxProtestAccum >= 12) {
        this._taxProtestAccum = 0;
        const targets = colonies.filter(c => !c.isOutpost);
        if (targets.length > 0) {
          const col = targets[Math.floor(Math.random() * targets.length)];
          EventBus.emit('randomEvent:taxProtest', {
            planetId: col.planetId,
            colonyName: col.name,
          });
        }
      }
    } else {
      this._taxProtestAccum = 0;
    }

    EventBus.emit('tax:collected', { totalIncome, taxRate: this._taxRate });
  }

  // Tick pending ship orders — sprawdź czy zamówienia mogą ruszyć
  _tickPendingShipOrders() {
    for (const colony of this._colonies.values()) {
      const pending = colony.pendingShipOrders;
      if (!pending || pending.length === 0) continue;

      const shipyardLevel = this._getShipyardLevel(colony);
      if (shipyardLevel === 0) continue;

      // Iteruj od początku (FIFO) — zbierz indeksy do usunięcia
      const toRemove = [];
      if (!colony.shipQueues) colony.shipQueues = [];

      for (let i = 0; i < pending.length; i++) {
        const order = pending[i];

        // Sprawdź wolne sloty stoczni
        if (colony.shipQueues.length >= shipyardLevel) break;

        // Sprawdź POPy (re-check — stan zmienia się po lockPops)
        const orderStrata = (SHIPS[order.shipId] ?? HULLS[order.shipId])?.crewStrata ?? null;
        if (order.crewCost > 0) {
          const freePops = colony.civSystem?.freePops ?? 0;
          if (freePops < order.crewCost) continue;
        }

        // Sprawdź surowce (re-check — stan zmienia się po spend)
        if (!colony.resourceSystem.canAfford(order.cost)) continue;

        // Wszystko OK — uruchom budowę
        colony.resourceSystem.spend(order.cost);

        if (order.crewCost > 0 && colony.civSystem) {
          // Konwertuj wolnych do wymaganej strata
          if (orderStrata && orderStrata !== 'mix') {
            colony.civSystem.convertToStrata(orderStrata, order.crewCost);
          }
          colony.civSystem.lockPops(order.crewCost, orderStrata);
        }

        const ship = SHIPS[order.shipId] ?? HULLS[order.shipId];
        colony.shipQueues.push({
          shipId:    order.shipId,
          progress:  0,
          buildTime: ship?.buildTime ?? 5,
          modules:   order.modules || [],
        });

        toRemove.push(i);
        EventBus.emit('fleet:buildStarted', { planetId: colony.planetId, shipId: order.shipId });
      }

      // Usuń zrealizowane (od końca żeby indeksy się nie przesunęły)
      for (let j = toRemove.length - 1; j >= 0; j--) {
        pending.splice(toRemove[j], 1);
      }
    }
  }

  // Anuluj oczekujące zamówienie statku
  cancelPendingShip(planetId, orderId) {
    const colony = this.getColony(planetId);
    if (!colony?.pendingShipOrders) return;

    const idx = colony.pendingShipOrders.findIndex(o => o.id === orderId);
    if (idx === -1) return;

    colony.pendingShipOrders.splice(idx, 1);
    EventBus.emit('fleet:pendingCancelled', { planetId, orderId });
  }

  // Pobierz oczekujące zamówienia statków dla kolonii
  getPendingShipOrders(planetId) {
    const colony = this.getColony(planetId);
    return colony?.pendingShipOrders ?? [];
  }

  // ── Pending Outpost Orders ──────────────────────────────────────────────────

  /**
   * Dodaj zamówienie placówki do kolejki (brakuje zasobów — fabryki wyprodukują).
   */
  addPendingOutpostOrder(planetId, { targetId, buildingId, vesselId, cost }) {
    const colony = this.getColony(planetId);
    if (!colony) return null;
    if (!colony.pendingOutpostOrders) colony.pendingOutpostOrders = [];

    const orderId = `poo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const targetEntity = EntityManager.get(targetId);
    const order = {
      id: orderId,
      targetId,
      targetName: targetEntity?.name ?? targetId,
      buildingId,
      vesselId,
      cost: { ...cost },
      queuedAt: window.KOSMOS?.timeSystem?.gameTime ?? 0,
    };
    colony.pendingOutpostOrders.push(order);
    EventBus.emit('outpost:orderQueued', { planetId, order });
    return orderId;
  }

  /**
   * Anuluj oczekujące zamówienie placówki.
   */
  cancelPendingOutpostOrder(planetId, orderId) {
    const colony = this.getColony(planetId);
    if (!colony?.pendingOutpostOrders) return;

    const idx = colony.pendingOutpostOrders.findIndex(o => o.id === orderId);
    if (idx === -1) return;

    colony.pendingOutpostOrders.splice(idx, 1);
    EventBus.emit('outpost:orderCancelled', { planetId, orderId });
  }

  /**
   * Pobierz oczekujące zamówienia placówek dla kolonii.
   */
  getPendingOutpostOrders(planetId) {
    const colony = this.getColony(planetId);
    return colony?.pendingOutpostOrders ?? [];
  }

  /**
   * Tick pending outpost orders — sprawdź czy zamówienia mogą ruszyć.
   * Wzorzec identyczny jak _tickPendingShipOrders.
   */
  _tickPendingOutpostOrders() {
    const vMgr = window.KOSMOS?.vesselManager;
    for (const colony of this._colonies.values()) {
      const pending = colony.pendingOutpostOrders;
      if (!pending || pending.length === 0) continue;

      const toRemove = [];
      for (let i = 0; i < pending.length; i++) {
        const order = pending[i];

        // Sprawdź czy vessel nadal istnieje i jest dostępny
        const vessel = vMgr?.getVessel(order.vesselId);
        if (!vessel) {
          // Statek zniszczony/utracony → anuluj zamówienie
          toRemove.push(i);
          EventBus.emit('outpost:orderCancelled', {
            planetId: colony.planetId, orderId: order.id, reason: 'vessel_lost',
          });
          continue;
        }
        // Vessel musi być idle + docked w tej kolonii
        if (vessel.status !== 'idle' || vessel.position?.state !== 'docked') continue;
        if (vessel.colonyId !== colony.planetId) continue;

        // Sprawdź surowce
        if (!colony.resourceSystem.canAfford(order.cost)) continue;

        // Wszystko OK — uruchom ekspedycję outpost
        toRemove.push(i);
        EventBus.emit('expedition:foundOutpostRequest', {
          targetId:   order.targetId,
          buildingId: order.buildingId,
          vesselId:   order.vesselId,
        });
      }

      // Usuń zrealizowane/anulowane (od końca)
      for (let j = toRemove.length - 1; j >= 0; j--) {
        pending.splice(toRemove[j], 1);
      }
    }
  }

  // ── Pending Station Orders (S3.3b-S2) ───────────────────────────────────
  // Wariant A: canAfford → spend → StationSystem.createStation (instant; bez vessela,
  // bez fazy budowy). buildTime z StationData NIE jest tykany w tym slice.

  addPendingStationOrder(planetId, { targetBodyId, cost = null, ownerEmpireId = null, stationType = 'orbital_station' } = {}) {
    const colony = this.getColony(planetId);
    if (!colony) return null;
    if (!colony.pendingStationOrders) colony.pendingStationOrders = [];

    // Fallback kosztu: null/undefined LUB pusty obiekt → pełny koszt z StationData
    // (chroni przed potraktowaniem braku override jako darmowej budowy).
    const finalCost = (cost && Object.keys(cost).length > 0)
      ? { ...cost }
      : stationTotalCost(stationType);

    const orderId = `pso_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const targetEntity = EntityManager.get(targetBodyId);
    const order = {
      id: orderId,
      targetBodyId,
      targetName: targetEntity?.name ?? targetBodyId,
      cost: finalCost,
      ownerEmpireId: ownerEmpireId ?? 'player',
      stationType,
      queuedAt: window.KOSMOS?.timeSystem?.gameTime ?? 0,
    };
    colony.pendingStationOrders.push(order);
    EventBus.emit('station:orderQueued', { planetId, order });
    return orderId;
  }

  cancelPendingStationOrder(planetId, orderId) {
    const colony = this.getColony(planetId);
    if (!colony?.pendingStationOrders) return;
    const idx = colony.pendingStationOrders.findIndex(o => o.id === orderId);
    if (idx === -1) return;
    colony.pendingStationOrders.splice(idx, 1);
    // Bez refundu — w Wariancie A spend następuje dopiero przy materializacji,
    // więc anulowanie PRZED materializacją nic nie zwraca (nic nie wydano).
    EventBus.emit('station:orderCancelled', { planetId, orderId });
  }

  getPendingStationOrders(planetId) {
    const colony = this.getColony(planetId);
    return colony?.pendingStationOrders ?? [];
  }

  /**
   * Tick pending station orders — Wariant A: spend-at-colony → instant materialize.
   * canAfford → (pre-check: ciało istnieje) → spend → StationSystem.createStation.
   * Pre-check PRZED spend, by nie marnować zasobów gdy ciało docelowe zniknęło.
   */
  _tickPendingStationOrders() {
    const ss = window.KOSMOS?.stationSystem;
    for (const colony of this._colonies.values()) {
      const pending = colony.pendingStationOrders;
      if (!pending || pending.length === 0) continue;

      const toRemove = [];
      for (let i = 0; i < pending.length; i++) {
        const order = pending[i];

        // Czeka aż kolonia uzbiera surowce. Bez spend dopóki nie stać.
        if (!colony.resourceSystem.canAfford(order.cost)) continue;

        // Pre-check PRZED spend: StationSystem dostępny + ciało docelowe istnieje.
        // Brak → anuluj order bez wydawania zasobów (bez refundu, bo nic nie wydano).
        if (!ss || !EntityManager.get(order.targetBodyId)) {
          toRemove.push(i);
          EventBus.emit('station:buildFailed', {
            planetId: colony.planetId, orderId: order.id,
            reason: ss ? 'body_lost' : 'no_station_system',
          });
          continue;
        }

        // Stać + ciało istnieje → spend + materializacja na ciele docelowym.
        colony.resourceSystem.spend(order.cost);
        toRemove.push(i);
        const st = ss.createStation(order.targetBodyId, {
          ownerEmpireId: order.ownerEmpireId,
          stationType:   order.stationType,
        });
        if (st) {
          EventBus.emit('station:built', {
            planetId: colony.planetId, stationId: st.id, targetBodyId: order.targetBodyId,
          });
        } else {
          // Nieoczekiwane (ciało istniało chwilę temu) — bez refundu.
          EventBus.emit('station:buildFailed', {
            planetId: colony.planetId, orderId: order.id, reason: 'create_failed',
          });
        }
      }

      // Usuń zrealizowane/anulowane (od końca żeby indeksy się nie przesunęły)
      for (let j = toRemove.length - 1; j >= 0; j--) {
        pending.splice(toRemove[j], 1);
      }
    }
  }

  // Zużyj statek z floty (przy wysyłaniu ekspedycji — np. colony_ship)
  // vesselId: konkretny vessel ID do zużycia, LUB shipId: typ do znalezienia pierwszego
  consumeShip(planetId, shipIdOrVesselId) {
    const colony = this.getColony(planetId);
    if (!colony) return false;

    const vMgr = window.KOSMOS?.vesselManager;

    if (vMgr) {
      // Nowy system: vessel instances
      let vesselId = shipIdOrVesselId;
      // Jeśli podano typ statku (stary API) — znajdź pierwszego dostępnego
      if (SHIPS[shipIdOrVesselId]) {
        const vessel = vMgr.getFirstAvailable(planetId, shipIdOrVesselId);
        if (!vessel) return false;
        vesselId = vessel.id;
      }
      // Usuń z fleet
      const idx = colony.fleet.indexOf(vesselId);
      if (idx !== -1) colony.fleet.splice(idx, 1);
      // Zniszcz w VesselManager
      vMgr.destroyVessel(vesselId);
      EventBus.emit('fleet:shipConsumed', { planetId, shipId: shipIdOrVesselId });
      return true;
    }

    // Fallback: stary system (stringi)
    const idx = colony.fleet.indexOf(shipIdOrVesselId);
    if (idx === -1) return false;
    colony.fleet.splice(idx, 1);
    EventBus.emit('fleet:shipConsumed', { planetId, shipId: shipIdOrVesselId });
    return true;
  }

  // Rozformuj statek — zwrot 75% surowców/commodities, odblokowanie POP
  _disbandVessel(vesselId) {
    const fail = (reason, details) => {
      console.warn('[disband] NIEPOWODZENIE:', reason, details ?? '');
      EventBus.emit('fleet:disbandFailed', { vesselId, reason, details });
    };

    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return fail('VesselManager niedostępny');
    const vessel = vMgr.getVessel(vesselId);
    if (!vessel) return fail('Nie znaleziono statku', vesselId);

    // Tylko zadokowane statki (idle/refueling)
    if (vessel.position.state !== 'docked') {
      return fail(`Statek ${vessel.name} nie zadokowany`, vessel.position.state);
    }

    const colony = this.getColony(vessel.colonyId);
    if (!colony) return fail('Kolonia nie istnieje', vessel.colonyId);

    // Wymaga stoczni w kolonii
    if (this._getShipyardLevel(colony) === 0) {
      return fail(`Brak stoczni w ${colony.name}`);
    }

    // Kadłub z SHIPS lub HULLS (custom design) — ten sam lookup co createVessel
    const shipDef = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    if (!shipDef) {
      return fail('Nieznany typ kadłuba', vessel.shipId);
    }

    // Zwrot 75% surowców i commodities budowy (kadłub)
    const refund = {};
    for (const [resId, qty] of Object.entries(shipDef.cost || {})) {
      refund[resId] = Math.floor(qty * 0.75);
    }
    for (const [comId, qty] of Object.entries(shipDef.commodityCost || {})) {
      refund[comId] = Math.floor(qty * 0.75);
    }
    // Moduły custom designu — zwrot 75% każdego zainstalowanego modułu
    if (Array.isArray(vessel.modules)) {
      for (const modId of vessel.modules) {
        const mod = SHIP_MODULES?.[modId];
        if (!mod) continue;
        for (const [resId, qty] of Object.entries(mod.cost || {})) {
          refund[resId] = (refund[resId] ?? 0) + Math.floor(qty * 0.75);
        }
        for (const [comId, qty] of Object.entries(mod.commodityCost || {})) {
          refund[comId] = (refund[comId] ?? 0) + Math.floor(qty * 0.75);
        }
      }
    }
    // Cargo statku — zwrot 100%
    if (vessel.cargo) {
      for (const [resId, qty] of Object.entries(vessel.cargo)) {
        if (qty > 0) refund[resId] = (refund[resId] ?? 0) + qty;
      }
    }
    colony.resourceSystem.receive(refund);

    // Odblokuj POPy (załoga wraca) — bezpośrednio na kolonii właściciela
    const crewCost = shipDef.crewCost ?? 0;
    const crewStrata = shipDef.crewStrata ?? null;
    if (crewCost > 0 && colony.civSystem) {
      colony.civSystem.unlockPops(crewCost, crewStrata);
    }

    // Usuń statek
    const fleetIdx = colony.fleet.indexOf(vesselId);
    if (fleetIdx !== -1) colony.fleet.splice(fleetIdx, 1);
    vMgr.destroyVessel(vesselId);

    EventBus.emit('fleet:disbanded', { vesselId, shipId: vessel.shipId, planetId: vessel.colonyId });
  }

  // Sprawdź czy kolonia ma statek danego typu w hangarze (idle, docked)
  hasShip(planetId, shipId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (vMgr) {
      return vMgr.hasAvailableShip(planetId, shipId);
    }
    // Fallback: stary system
    const colony = this.getColony(planetId);
    if (!colony) return false;
    return colony.fleet.includes(shipId);
  }

  // Sprawdź czy kolonia ma statek z daną capability (idle, docked)
  hasShipWithCapability(planetId, capability) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (vMgr) {
      return vMgr.hasAvailableShipWithCapability(planetId, capability);
    }
    return false;
  }

  // Pobierz flotę kolonii (vessel IDs lub stare string types)
  getFleet(planetId) {
    const colony = this.getColony(planetId);
    return colony?.fleet ?? [];
  }

  // Pobierz flotę jako vessel instances (nowe API)
  getFleetInstances(planetId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return [];
    return vMgr.getVesselsAt(planetId);
  }

  // Pobierz kolejki budowy (tablica slotów)
  getShipQueues(planetId) {
    const colony = this.getColony(planetId);
    return colony?.shipQueues ?? [];
  }

  // Kompatybilność wsteczna — pierwszy slot z tablicy
  getShipQueue(planetId) {
    const queues = this.getShipQueues(planetId);
    return queues.length > 0 ? queues[0] : null;
  }

  // Sprawdź czy kolonia ma budynek o danym id
  _hasBuilding(colony, buildingId) {
    const bSys = colony?.buildingSystem;
    if (!bSys) return false;
    for (const [, entry] of bSys._active) {
      if (entry.building.id === buildingId) return true;
    }
    return false;
  }

  // ── Tick roczny — drogi handlowe + migracja ──────────────────────

  yearlyTick(gameYear) {
    if (this._colonies.size < 2) return;

    // Drogi handlowe
    const hasLogistics = this.techSystem?.isResearched('interplanetary_logistics') ?? false;
    if (hasLogistics && gameYear - this._lastTradeYear >= TRADE_INTERVAL) {
      this._lastTradeYear = gameYear;
      this._executeTradeRoutes();
    }

    // Migracja POP
    if (gameYear - this._lastMigrationYear >= MIGRATION_INTERVAL) {
      this._lastMigrationYear = gameYear;
      this._checkMigration();
    }
  }

  // Wykonaj automatyczne transfery na drogach handlowych (nowy model inventory)
  _executeTradeRoutes() {
    // Zasoby podlegające handlowi (inventory items)
    const TRADE_RESOURCES = ['Fe', 'C', 'Si', 'Cu', 'Ti', 'Li', 'Hv', 'food', 'water'];

    for (const route of this._tradeRoutes) {
      if (!route.active) continue;
      const a = this.getColony(route.colonyA);
      const b = this.getColony(route.colonyB);
      if (!a || !b) continue;

      const transferred = {};

      for (const res of TRADE_RESOURCES) {
        const aAmt = a.resourceSystem.inventory.get(res) ?? 0;
        const bAmt = b.resourceSystem.inventory.get(res) ?? 0;

        // Kierunek: nadwyżka (>200) → niedobór (<50)
        if (aAmt > 200 && bAmt < 50) {
          const amt = Math.min(TRADE_BASE_AMOUNT, Math.floor(aAmt * 0.1));
          if (amt > 0) {
            a.resourceSystem.spend({ [res]: amt });
            b.resourceSystem.receive({ [res]: amt });
            transferred[res] = (transferred[res] ?? 0) + amt;
          }
        } else if (bAmt > 200 && aAmt < 50) {
          const amt = Math.min(TRADE_BASE_AMOUNT, Math.floor(bAmt * 0.1));
          if (amt > 0) {
            b.resourceSystem.spend({ [res]: amt });
            a.resourceSystem.receive({ [res]: amt });
            transferred[res] = (transferred[res] ?? 0) - amt; // ujemne = B→A
          }
        }
      }

      let hasTransfer = false;
      for (const _ in transferred) { hasTransfer = true; break; }
      if (hasTransfer) {
        EventBus.emit('colony:tradeExecuted', { route, transferred });
      }
    }
  }

  // Sprawdź migrację POP między koloniami
  _checkMigration() {
    // Slice 1: migracja działa tylko między koloniami gracza (pomiń ownerEmpireId !== null)
    const colonies = this.getAllColonies().filter(c => !c.ownerEmpireId);
    if (colonies.length < 2) return;

    // Znajdź kolonie z wysokim i niskim prosperity
    const high = colonies.filter(c => !c.isOutpost && (c.prosperitySystem?.prosperity ?? 50) > MIGRATION_PROSPERITY_HIGH && c.allowImmigration);
    const low  = colonies.filter(c => !c.isOutpost && (c.prosperitySystem?.prosperity ?? 50) < MIGRATION_PROSPERITY_LOW  && c.allowEmigration);

    for (const src of low) {
      if (src.civSystem.population <= 2) continue; // nie opuści małej kolonii
      for (const dst of high) {
        if (src.planetId === dst.planetId) continue;
        // Sprawdź housing w docelowej
        if (dst.civSystem.population >= dst.civSystem.housing) continue;
        // Losowa szansa
        if (Math.random() > MIGRATION_CHANCE) continue;

        // Migracja 1 POPa
        src.civSystem.removePop();
        dst.civSystem.addPop('laborer');

        EventBus.emit('colony:migration', {
          from:  src.name,
          to:    dst.name,
          count: 1,
        });
        return; // max 1 migracja na cykl
      }
    }
  }

  // ── Serializacja ──────────────────────────────────────────────────────

  serialize() {
    const colonies = [];
    for (const col of this._colonies.values()) {
      colonies.push({
        planetId:         col.planetId,
        isHomePlanet:     col.isHomePlanet,
        isOutpost:        col.isOutpost ?? false,
        name:             col.name,
        systemId:         col.systemId ?? 'sys_home',
        founded:          col.founded,
        resources:        col.resourceSystem.serialize(),
        civ:              col.civSystem.serialize(),
        buildings:        col.buildingSystem?.serialize() ?? [],
        constructionQueue: col.buildingSystem?.serializeQueue() ?? [],
        pendingQueue:     col.buildingSystem?.serializePendingQueue() ?? [],
        factorySystem:    col.factorySystem?.serialize() ?? null,
        prosperitySystem: col.prosperitySystem?.serialize() ?? null,
        allowImmigration: col.allowImmigration,
        allowEmigration:  col.allowEmigration,
        fleet:            col.fleet ?? [],
        shipQueues:       col.shipQueues ?? [],
        groundUnitQueues: col.groundUnitQueues ?? [],
        pendingShipOrders: col.pendingShipOrders ?? [],
        pendingOutpostOrders: col.pendingOutpostOrders ?? [],
        pendingStationOrders: col.pendingStationOrders ?? [],
        credits:          col.credits ?? 0,
        creditsPerYear:   col.creditsPerYear ?? 0,
        tradeCapacity:    col.tradeCapacity ?? 0,
        activeTradeConnections: col.activeTradeConnections ?? [],
        tradeOverrides:   col.tradeOverrides ?? {},
        requiresSpaceportFirst: col.buildingSystem?._requiresSpaceportFirst ?? false,
        // Grid regionów — opcjonalny, regenerowany deterministycznie przy otwarciu
        grid:             col.grid ? col.grid.serialize() : null,
      });
    }
    return {
      colonies,
      activePlanetId:   this._activePlanetId,
      tradeRoutes:      this._tradeRoutes.map(r => ({ ...r })),
      lastTradeYear:    this._lastTradeYear,
      lastMigrationYear: this._lastMigrationYear,
      taxRate:          this._taxRate,
      taxAccum:         this._taxAccum,
      taxProtestAccum:  this._taxProtestAccum,
    };
  }

  restore(data, buildingSystem) {
    if (!data?.colonies) return;

    for (const colData of data.colonies) {
      const entity = this._findEntity(colData.planetId);
      if (!entity) continue;

      // ResourceSystem per-kolonia
      const resSys = new ResourceSystem();
      if (colData.resources) resSys.restore(colData.resources);

      // CivilizationSystem per-kolonia (entity = planeta/księżyc/planetoid)
      const civSys = new CivilizationSystem({}, this.techSystem, entity);
      civSys.resourceSystem = resSys;
      if (colData.civ) civSys.restore(colData.civ);

      // BuildingSystem per-kolonia — powiązany z własnymi systemami
      const bSys = new BuildingSystem(resSys, civSys, this.techSystem);
      civSys.buildingSystem = bSys;
      bSys.setDeposits(entity.deposits ?? []);
      bSys.setPlanetId(colData.planetId);

      // Flaga outpost PRZED restoreFromSave — wpływa na kary wydajności (×0.6)
      const isOutpost = colData.isOutpost ?? false;
      if (isOutpost) bSys._isOutpost = true;

      // Flaga: nowa kolonia wymaga portu kosmicznego
      bSys._requiresSpaceportFirst = colData.requiresSpaceportFirst ?? false;

      if (colData.buildings?.length > 0) {
        bSys.restoreFromSave(colData.buildings);
      }
      // Przywróć kolejkę budowy
      if (colData.constructionQueue?.length > 0) {
        bSys.restoreQueue(colData.constructionQueue);
      }
      // Przywróć pending queue
      if (colData.pendingQueue?.length > 0) {
        bSys.restorePendingQueue(colData.pendingQueue);
      }

      // FactorySystem per-kolonia
      const factSys = new FactorySystem(resSys);
      bSys.setFactorySystem(factSys);
      if (colData.factorySystem) factSys.restore(colData.factorySystem);

      // ProsperitySystem per-kolonia
      const prospSys = new ProsperitySystem(resSys, civSys, this.techSystem, entity);
      if (colData.prosperitySystem) prospSys.restore(colData.prosperitySystem);

      // Przywróć grid jeśli zapisany (HexGrid lub RegionSystem)
      let savedGrid = null;
      if (colData.grid) {
        try {
          if (colData.grid.version === 2) {
            savedGrid = RegionSystem.restore(colData.grid);
          } else if (colData.grid.tiles && colData.grid.width) {
            // Format HexGrid (tapered lub prostokątny) — przywróć z anomaliami
            savedGrid = HexGrid.restore(colData.grid);
          }
        } catch (e) {
          console.warn('[ColonyManager] Grid restore failed, will regenerate:', e);
        }
      }

      const colony = {
        planetId:         colData.planetId,
        planet:           entity,
        isHomePlanet:     colData.isHomePlanet ?? false,
        isOutpost,
        name:             colData.name ?? entity.name,
        systemId:         colData.systemId ?? entity.systemId ?? 'sys_home',
        founded:          colData.founded ?? 0,
        resourceSystem:   resSys,
        civSystem:        civSys,
        buildingSystem:   bSys,
        factorySystem:    factSys,
        prosperitySystem: prospSys,
        grid:             savedGrid,
        allowImmigration: colData.allowImmigration ?? true,
        allowEmigration:  colData.allowEmigration  ?? true,
        fleet:            colData.fleet ?? [],
        shipQueues:       colData.shipQueues ?? [],
        groundUnitQueues: colData.groundUnitQueues ?? [],
        pendingShipOrders: colData.pendingShipOrders ?? [],
        pendingOutpostOrders: colData.pendingOutpostOrders ?? [],
        pendingStationOrders: colData.pendingStationOrders ?? [],
        credits:          colData.credits ?? 0,
        creditsPerYear:   colData.creditsPerYear ?? 0,
        tradeCapacity:    colData.tradeCapacity ?? 0,
        activeTradeConnections: colData.activeTradeConnections ?? [],
        tradeOverrides:   colData.tradeOverrides ?? {},
      };

      this._colonies.set(colData.planetId, colony);

      if (colData.isHomePlanet) {
        this._activePlanetId = colData.planetId;
        window.KOSMOS.factorySystem = factSys;
        window.KOSMOS.prosperitySystem = prospSys;
      }

      // Heal-up: kolonie uszkodzone przez wcześniejszy bug (brak Stolicy + pop=0).
      // Idempotentne — nic nie robi jeśli kolonia jest zdrowa.
      if (!colony.isHomePlanet && !isOutpost) {
        // Sprawdź czy stolica istnieje (w _active lub na grid)
        let hasCapital = false;
        for (const k of bSys._active.keys()) {
          if (k.startsWith('capital_')) { hasCapital = true; break; }
        }
        if (!hasCapital && savedGrid?.forEach) {
          savedGrid.forEach(tile => { if (tile.capitalBase) hasCapital = true; });
        }
        // Brak stolicy → postaw
        if (!hasCapital && savedGrid) {
          bSys._grid = savedGrid;
          bSys._gridHeight = savedGrid.height ?? 10;
          bSys.autoPlaceBuilding?.('colony_base');
        }
        // Pop = 0 na pełnej kolonii → minimum 2 POP startowe
        if (civSys.population <= 0) {
          civSys.setPopulation(2);
        }
      }
    }

    if (data.activePlanetId && this._colonies.has(data.activePlanetId)) {
      this._activePlanetId = data.activePlanetId;
    }

    // Przywróć drogi handlowe i liczniki
    this._tradeRoutes      = data.tradeRoutes ?? [];
    this._lastTradeYear    = data.lastTradeYear ?? 0;
    this._lastMigrationYear = data.lastMigrationYear ?? 0;

    // Przywróć podatki
    this._taxRate          = data.taxRate ?? 0.08;
    this._taxAccum         = data.taxAccum ?? 0;
    this._taxProtestAccum  = data.taxProtestAccum ?? 0;
  }

  // ── Prywatne ──────────────────────────────────────────────────────────

  // Obsługa zdarzenia założenia kolonii z ekspedycji
  _onColonyFounded({ planetId, startResources, startPop, autoSpaceport }) {
    const gameYear = Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);
    const colony = this.createColony(planetId, startResources, startPop, gameYear);

    // Generuj HexGrid — potrzebny do autoPlaceBuilding i stolicy
    if (colony?.buildingSystem && colony.planet) {
      const grid = PlanetMapGenerator.generate(colony.planet, false);
      colony.buildingSystem._grid = grid;
      colony.buildingSystem._gridHeight = grid.height ?? 10;
      colony.grid = grid;

      // Faza 6.5: inicjalizacja własności hexów na nowej kolonii
      for (const tile of grid.toArray()) {
        if (tile && tile.owner == null) tile.owner = 'player';
      }

      // Postaw stolicę (colony_base) — daje housing
      colony.buildingSystem.autoPlaceBuilding?.('colony_base');

      // Auto-spaceport + elektrownia: statek staje się budulcem
      if (autoSpaceport) {
        colony.buildingSystem.autoPlaceBuilding?.('launch_pad');
        colony.buildingSystem.autoPlaceBuilding?.('solar_farm');
      }
    }

    // Automatycznie utwórz drogi handlowe z nową kolonią (jeśli tech jest zbadany)
    if (colony && this.techSystem?.isResearched('interplanetary_logistics')) {
      for (const existing of this._colonies.values()) {
        if (existing.planetId !== planetId) {
          this.addTradeRoute(existing.planetId, planetId);
        }
      }
    }
  }

  // Auto-tworzenie dróg handlowych między istniejącymi koloniami
  _autoCreateTradeRoutes() {
    // Slice 1: drogi handlowe tylko między koloniami gracza (pomiń AI)
    const colonies = this.getAllColonies().filter(c => !c.ownerEmpireId);
    for (let i = 0; i < colonies.length; i++) {
      for (let j = i + 1; j < colonies.length; j++) {
        this.addTradeRoute(colonies[i].planetId, colonies[j].planetId);
      }
    }
  }

  // Znajdź encję po id — O(1) lookup z EntityManager
  _findEntity(targetId) {
    if (!targetId) return null;
    return EntityManager.get(targetId);
  }
}
