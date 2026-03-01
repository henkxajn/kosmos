// ColonyManager — zarządzanie koloniami (multi-planet) + flotą
//
// Centralny rejestr kolonii. Każda kolonia ma własny:
//   - ResourceSystem (zasoby per-kolonia)
//   - CivilizationSystem (populacja, morale, wzrost per-kolonia)
//   - Listę budynków (zarządzaną przez BuildingSystem)
//   - Siatkę hex (HexGrid)
//   - Flotę statków (fleet) i kolejkę budowy (shipQueue)
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
import { SHIPS } from '../data/ShipsData.js';

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
const MIGRATION_MORALE_HIGH = 70;   // morale powyżej = przyciąga
const MIGRATION_MORALE_LOW  = 40;   // morale poniżej = odpycha
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
    EventBus.on('fleet:buildRequest', ({ shipId }) => {
      this.startShipBuild(this._activePlanetId, shipId);
    });

    // Tick budowy statków (deltaYears)
    EventBus.on('time:tick', ({ deltaYears }) => {
      this._tickShipBuilds(deltaYears);
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
    const colony = {
      planetId:        planet.id,
      planet:          planet,
      isHomePlanet:    true,
      name:            planet.name,
      founded:         Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0),
      resourceSystem:  resourceSystem,
      civSystem:       civSystem,
      buildingSystem:  buildingSystem,  // per-kolonia BuildingSystem
      grid:            null,  // ustawiane przy otwarciu mapy
      allowImmigration: true,
      allowEmigration:  true,
      fleet:           [],    // statki w hangarze: ['science_vessel', ...]
      shipQueue:       null,  // aktualnie budowany: { shipId, progress, buildTime }
    };
    this._colonies.set(planet.id, colony);
    this._activePlanetId = planet.id;
    return colony;
  }

  // Utwórz nową kolonię (z ekspedycji kolonizacyjnej)
  createColony(planetId, startResources, startPop, gameYear) {
    const entity = this._findEntity(planetId);
    if (!entity) {
      console.warn('[ColonyManager] Nie znaleziono encji:', planetId);
      return null;
    }

    // ResourceSystem per-kolonia
    const resSys = new ResourceSystem({
      minerals: { amount: startResources.minerals ?? 100, capacity: 500 },
      energy:   { amount: startResources.energy   ?? 100, capacity: 500 },
      organics: { amount: startResources.organics ?? 100, capacity: 500 },
      water:    { amount: startResources.water    ?? 100, capacity: 500 },
      research: { amount: startResources.research ?? 0,   capacity: 500 },
    });

    // CivilizationSystem per-kolonia
    const civSys = new CivilizationSystem({
      population: startPop,
      housing:    0,  // Stolica doda 4
    }, this.techSystem);

    // BuildingSystem per-kolonia — powiązany z własnymi ResourceSystem i CivilizationSystem
    const bSys = new BuildingSystem(resSys, civSys, this.techSystem);

    const colony = {
      planetId,
      planet:          entity,
      isHomePlanet:    false,
      name:            entity.name,
      founded:         gameYear,
      resourceSystem:  resSys,
      civSystem:       civSys,
      buildingSystem:  bSys,
      grid:            null,
      allowImmigration: true,
      allowEmigration:  true,
      fleet:           [],
      shipQueue:       null,
    };

    this._colonies.set(planetId, colony);

    EventBus.emit('colony:founded', { colony });
    EventBus.emit('colony:listChanged', {});

    return colony;
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

  // Rozpocznij budowę statku w stoczni danej kolonii
  startShipBuild(planetId, shipId) {
    const colony = this.getColony(planetId);
    if (!colony) {
      EventBus.emit('fleet:buildFailed', { reason: 'Nie znaleziono kolonii' });
      return { ok: false, reason: 'Nie znaleziono kolonii' };
    }

    const ship = SHIPS[shipId];
    if (!ship) {
      EventBus.emit('fleet:buildFailed', { reason: 'Nieznany typ statku' });
      return { ok: false, reason: 'Nieznany typ statku' };
    }

    // Sprawdź tech
    if (ship.requires && !this.techSystem?.isResearched(ship.requires)) {
      const reason = `Wymaga technologii: ${ship.requires}`;
      EventBus.emit('fleet:buildFailed', { reason });
      return { ok: false, reason };
    }

    // Sprawdź czy stocznia istnieje w tej kolonii
    if (!this._hasBuilding(colony, 'shipyard')) {
      const reason = 'Brak Stoczni w tej kolonii';
      EventBus.emit('fleet:buildFailed', { reason });
      return { ok: false, reason };
    }

    // Sprawdź czy nie buduje się już inny statek
    if (colony.shipQueue) {
      const current = SHIPS[colony.shipQueue.shipId];
      const reason = `Stocznia zajęta: budowa ${current?.namePL ?? colony.shipQueue.shipId}`;
      EventBus.emit('fleet:buildFailed', { reason });
      return { ok: false, reason };
    }

    // Sprawdź czy stać na koszt
    if (!colony.resourceSystem.canAfford(ship.cost)) {
      const reason = 'Brak surowców na budowę statku';
      EventBus.emit('fleet:buildFailed', { reason });
      return { ok: false, reason };
    }

    // Pobierz zasoby
    colony.resourceSystem.spend(ship.cost);

    // Ustaw kolejkę budowy
    colony.shipQueue = {
      shipId:    ship.id,
      progress:  0,
      buildTime: ship.buildTime,
    };

    EventBus.emit('fleet:buildStarted', { planetId, shipId: ship.id });
    return { ok: true };
  }

  // Tick budowy statków — wywoływany z time:tick
  _tickShipBuilds(deltaYears) {
    for (const colony of this._colonies.values()) {
      if (!colony.shipQueue) continue;

      colony.shipQueue.progress += deltaYears;

      if (colony.shipQueue.progress >= colony.shipQueue.buildTime) {
        // Statek gotowy — dodaj do hangaru
        const shipId = colony.shipQueue.shipId;
        colony.fleet.push(shipId);
        colony.shipQueue = null;

        EventBus.emit('fleet:shipCompleted', { planetId: colony.planetId, shipId });
      }
    }
  }

  // Zużyj statek z floty (przy wysyłaniu ekspedycji)
  consumeShip(planetId, shipId) {
    const colony = this.getColony(planetId);
    if (!colony) return false;

    const idx = colony.fleet.indexOf(shipId);
    if (idx === -1) return false;

    colony.fleet.splice(idx, 1);
    EventBus.emit('fleet:shipConsumed', { planetId, shipId });
    return true;
  }

  // Sprawdź czy kolonia ma statek danego typu w hangarze
  hasShip(planetId, shipId) {
    const colony = this.getColony(planetId);
    if (!colony) return false;
    return colony.fleet.includes(shipId);
  }

  // Pobierz flotę kolonii
  getFleet(planetId) {
    const colony = this.getColony(planetId);
    return colony?.fleet ?? [];
  }

  // Pobierz kolejkę budowy
  getShipQueue(planetId) {
    const colony = this.getColony(planetId);
    return colony?.shipQueue ?? null;
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

  // Wykonaj automatyczne transfery na drogach handlowych
  _executeTradeRoutes() {
    for (const route of this._tradeRoutes) {
      if (!route.active) continue;
      const a = this.getColony(route.colonyA);
      const b = this.getColony(route.colonyB);
      if (!a || !b) continue;

      const RESOURCES = ['minerals', 'energy', 'organics', 'water'];
      const transferred = {};

      for (const res of RESOURCES) {
        const aRes = a.resourceSystem.resources[res];
        const bRes = b.resourceSystem.resources[res];
        if (!aRes || !bRes) continue;

        const aFrac = aRes.capacity > 0 ? aRes.amount / aRes.capacity : 0;
        const bFrac = bRes.capacity > 0 ? bRes.amount / bRes.capacity : 0;

        // Kierunek: nadwyżka → niedobór
        if (aFrac > TRADE_SURPLUS_RATIO && bFrac < TRADE_DEFICIT_RATIO) {
          const amt = Math.min(TRADE_BASE_AMOUNT, Math.floor(aRes.amount * 0.1));
          if (amt > 0) {
            aRes.amount -= amt;
            bRes.amount = Math.min(bRes.capacity, bRes.amount + amt);
            transferred[res] = (transferred[res] ?? 0) + amt;
          }
        } else if (bFrac > TRADE_SURPLUS_RATIO && aFrac < TRADE_DEFICIT_RATIO) {
          const amt = Math.min(TRADE_BASE_AMOUNT, Math.floor(bRes.amount * 0.1));
          if (amt > 0) {
            bRes.amount -= amt;
            aRes.amount = Math.min(aRes.capacity, aRes.amount + amt);
            transferred[res] = (transferred[res] ?? 0) - amt; // ujemne = B→A
          }
        }
      }

      if (Object.keys(transferred).length > 0) {
        EventBus.emit('colony:tradeExecuted', { route, transferred });
      }
    }
  }

  // Sprawdź migrację POP między koloniami
  _checkMigration() {
    const colonies = this.getAllColonies();
    if (colonies.length < 2) return;

    // Znajdź kolonie z wysokim i niskim morale
    const high = colonies.filter(c => (c.civSystem?.morale ?? 50) > MIGRATION_MORALE_HIGH && c.allowImmigration);
    const low  = colonies.filter(c => (c.civSystem?.morale ?? 50) < MIGRATION_MORALE_LOW  && c.allowEmigration);

    for (const src of low) {
      if (src.civSystem.population <= 2) continue; // nie opuści małej kolonii
      for (const dst of high) {
        if (src.planetId === dst.planetId) continue;
        // Sprawdź housing w docelowej
        if (dst.civSystem.population >= dst.civSystem.housing) continue;
        // Losowa szansa
        if (Math.random() > MIGRATION_CHANCE) continue;

        // Migracja 1 POPa
        src.civSystem.population -= 1;
        dst.civSystem.population += 1;

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
        name:             col.name,
        founded:          col.founded,
        resources:        col.resourceSystem.serialize(),
        civ:              col.civSystem.serialize(),
        buildings:        col.buildingSystem?.serialize() ?? [],
        allowImmigration: col.allowImmigration,
        allowEmigration:  col.allowEmigration,
        fleet:            col.fleet ?? [],
        shipQueue:        col.shipQueue ?? null,
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

      // CivilizationSystem per-kolonia
      const civSys = new CivilizationSystem({}, this.techSystem);
      if (colData.civ) civSys.restore(colData.civ);

      // BuildingSystem per-kolonia — powiązany z własnymi systemami
      const bSys = new BuildingSystem(resSys, civSys, this.techSystem);
      if (colData.buildings?.length > 0) {
        bSys.restoreFromSave(colData.buildings);
      }

      const colony = {
        planetId:         colData.planetId,
        planet:           entity,
        isHomePlanet:     colData.isHomePlanet ?? false,
        name:             colData.name ?? entity.name,
        founded:          colData.founded ?? 0,
        resourceSystem:   resSys,
        civSystem:        civSys,
        buildingSystem:   bSys,
        grid:             null,
        allowImmigration: colData.allowImmigration ?? true,
        allowEmigration:  colData.allowEmigration  ?? true,
        fleet:            colData.fleet ?? [],
        shipQueue:        colData.shipQueue ?? null,
      };

      this._colonies.set(colData.planetId, colony);

      if (colData.isHomePlanet) {
        this._activePlanetId = colData.planetId;
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
  _onColonyFounded({ planetId, startResources, startPop }) {
    const gameYear = Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);
    const colony = this.createColony(planetId, startResources, startPop, gameYear);

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

  // Znajdź encję po id — przeszukaj planety, księżyce, planetoidy
  _findEntity(targetId) {
    const TYPES = ['planet', 'moon', 'planetoid'];
    for (const t of TYPES) {
      const bodies = EntityManager.getByType(t);
      const found  = bodies.find(b => b.id === targetId);
      if (found) return found;
    }
    return null;
  }
}
