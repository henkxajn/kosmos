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
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { RegionSystem } from '../map/RegionSystem.js';
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

    // Tick budowy statków + pending ship/outpost orders — civDeltaYears = deltaYears × CIV_TIME_SCALE
    EventBus.on('time:tick', ({ civDeltaYears: deltaYears }) => {
      this._tickShipBuilds(deltaYears);
      this._tickPendingShipOrders();
      this._tickPendingOutpostOrders();
    });

    // Invaliduj cache shipyard level przy budowie/rozbiórce/upgrade stoczni
    const invalidateShipyard = ({ buildingId, tile }) => {
      if (buildingId === 'shipyard' || tile?.buildingId === 'shipyard') {
        const pid = this._activePlanetId;
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
      credits:         0,     // Kredyty (Kr) z handlu cywilnego
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
    bSys._requiresSpaceportFirst = true;  // nowa kolonia wymaga portu kosmicznego
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
    bSys._requiresSpaceportFirst = true;  // nowa kolonia wymaga portu kosmicznego
    bSys.setDeposits(entity.deposits ?? []);
    bSys.setPlanetId(planetId);

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
      name:            entity.name,
      systemId:        entity.systemId ?? window.KOSMOS?.activeSystemId ?? 'sys_home',
      founded:         gameYear,
      resourceSystem:  resSys,
      civSystem:       civSys,
      buildingSystem:  bSys,
      factorySystem:   factSys,
      prosperitySystem: prospSys,
      grid:            null,
      allowImmigration: false,
      allowEmigration:  false,
      fleet:           [],
      shipQueues:      [],
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

    const ship = SHIPS[shipId];
    if (!ship) {
      EventBus.emit('fleet:buildFailed', { reason: t('fleet.unknownShip') });
      return { ok: false, reason: t('fleet.unknownShip') };
    }

    // Sprawdź tech
    if (ship.requires && !this.techSystem?.isResearched(ship.requires)) {
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
          queues.splice(i, 1);
          EventBus.emit('fleet:shipCompleted', { planetId: colony.planetId, shipId });
        }
      }
    }
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
        const orderStrata = SHIPS[order.shipId]?.crewStrata ?? null;
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

        const ship = SHIPS[order.shipId];
        colony.shipQueues.push({
          shipId:    order.shipId,
          progress:  0,
          buildTime: ship?.buildTime ?? 5,
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
    const order = {
      id: orderId,
      targetId,
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

  // Rozformuj statek — zwrot 100% surowców/commodities, odblokowanie POP
  _disbandVessel(vesselId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;
    const vessel = vMgr.getVessel(vesselId);
    if (!vessel) return;

    // Tylko zadokowane statki (idle/refueling)
    if (vessel.position.state !== 'docked') return;

    const colony = this.getColony(vessel.colonyId);
    if (!colony) return;

    // Wymaga stoczni w kolonii
    if (this._getShipyardLevel(colony) === 0) return;

    const shipDef = SHIPS[vessel.shipId];
    if (!shipDef) return;

    // Zwrot 75% surowców i commodities budowy
    const refund = {};
    for (const [resId, qty] of Object.entries(shipDef.cost || {})) {
      refund[resId] = Math.floor(qty * 0.75);
    }
    for (const [comId, qty] of Object.entries(shipDef.commodityCost || {})) {
      refund[comId] = Math.floor(qty * 0.75);
    }
    // Cargo statku — zwrot 100%
    if (vessel.cargo) {
      for (const [resId, qty] of Object.entries(vessel.cargo)) {
        if (qty > 0) refund[resId] = (refund[resId] ?? 0) + qty;
      }
    }
    colony.resourceSystem.receive(refund);

    // Odblokuj POPy (załoga wraca) — bezpośrednio na kolonii właściciela
    const crewCost = SHIPS[vessel.shipId]?.crewCost ?? 0;
    const crewStrata = SHIPS[vessel.shipId]?.crewStrata ?? null;
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
    const colonies = this.getAllColonies();
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
        pendingShipOrders: col.pendingShipOrders ?? [],
        pendingOutpostOrders: col.pendingOutpostOrders ?? [],
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

      // Przywróć grid regionów jeśli zapisany
      let savedGrid = null;
      if (colData.grid) {
        try {
          if (colData.grid.version === 2) {
            savedGrid = RegionSystem.restore(colData.grid);
          }
          // Stary format HexGrid — ignoruj, regeneruj przy otwarciu
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
        pendingShipOrders: colData.pendingShipOrders ?? [],
        pendingOutpostOrders: colData.pendingOutpostOrders ?? [],
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
    }

    if (data.activePlanetId && this._colonies.has(data.activePlanetId)) {
      this._activePlanetId = data.activePlanetId;
    }

    // Przywróć drogi handlowe i liczniki
    this._tradeRoutes      = data.tradeRoutes ?? [];
    this._lastTradeYear    = data.lastTradeYear ?? 0;
    this._lastMigrationYear = data.lastMigrationYear ?? 0;
  }

  // ── Prywatne ──────────────────────────────────────────────────────────

  // Obsługa zdarzenia założenia kolonii z ekspedycji
  _onColonyFounded({ planetId, startResources, startPop, autoSpaceport }) {
    const gameYear = Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);
    const colony = this.createColony(planetId, startResources, startPop, gameYear);

    // Auto-spaceport: statek kolonizacyjny staje się portem kosmicznym
    if (autoSpaceport && colony?.buildingSystem) {
      colony.buildingSystem.autoPlaceBuilding?.('launch_pad');
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
    const colonies = this.getAllColonies();
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
