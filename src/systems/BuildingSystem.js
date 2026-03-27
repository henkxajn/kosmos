// BuildingSystem — logika budowania i zarządzania instalacjami na mapie hex
//
// NOWY SYSTEM: poziomy budynków (1–10), koszty w surowcach+commodities,
// kopalnia → wydobycie z deposits, energyCost per budynek, fabryka → punkty produkcji
// CZAS BUDOWY: budynki z buildTime > 0 trafiają do kolejki budowy
//
// Komunikacja:
//   Nasłuchuje: 'planet:buildRequest'    { tile, buildingId }
//               'planet:demolishRequest' { tile }
//               'planet:upgradeRequest'  { tile }
//   Emituje:    'planet:buildResult'     { success, tile, buildingId, reason, underConstruction? }
//               'planet:demolishResult'  { success, tile, reason, cancelled? }
//               'planet:upgradeResult'   { success, tile, reason, underConstruction? }
//               'planet:constructionComplete' { tileKey, buildingId }
//               'resource:registerProducer' → do ResourceSystem
//               'resource:removeProducer'   → do ResourceSystem
//               'civ:addHousing'            → do CivilizationSystem
//               'civ:removeHousing'         → do CivilizationSystem

import EventBus from '../core/EventBus.js';
import { BUILDINGS }      from '../data/BuildingsData.js';
import { COMMODITIES }    from '../data/CommoditiesData.js';
import { TERRAIN_TYPES }  from '../map/HexTile.js';
import { TECHS }          from '../data/TechData.js';
import { HexGrid }        from '../map/HexGrid.js';
import { POP_PER_BUILDING } from '../systems/CivilizationSystem.js';
import { DepositSystem }    from '../systems/DepositSystem.js';
import { t, getName }      from '../i18n/i18n.js';

// Maksymalny poziom budynku — base 10, tech nie potrzebny
const BASE_MAX_LEVEL = 10;

// Outpost: max budynków (bez colony_base/stolica)
const OUTPOST_MAX_BUILDINGS = 5;

// Outpost: kara wydajności autonomicznych budynków (brak ludzi do nadzoru)
const OUTPOST_EFFICIENCY = 0.6;

// Helper: sprawdza czy obiekt ma klucze (bez alokacji tablicy)
function hasKeys(obj) { for (const _ in obj) return true; return false; }

export class BuildingSystem {
  constructor(resourceSystem = null, civSystem = null, techSystem = null) {
    this.resourceSystem = resourceSystem;
    this.civSystem      = civSystem;
    this.techSystem     = techSystem;

    // Rejestr aktywnych producentów:
    //   tileKey → { building, baseRates, effectiveRates, housing, popCost, level }
    this._active = new Map();

    // Kolejka budowy:
    //   tileKey → { buildingId, progress, buildTime, tileR, tileType, isUpgrade?, targetLevel? }
    this._constructionQueue = new Map();

    // Oczekujące zamówienia (brak surowców → czeka aż będą dostępne):
    //   tileKey → { tileKey, buildingId, cost, isUpgrade, targetLevel, tileR, tileType, queuedAt }
    this._pendingQueue = new Map();

    // Wysokość siatki (do obliczania modyfikatora polarnego)
    this._gridHeight = 0;

    // Referencja na deposits ciała niebieskiego (ustawiana przez GameScene)
    this._deposits = null;

    // Referencja na factorySystem (do punktów produkcji)
    this._factorySystem = null;

    // ID planety (do filtrowania zdarzeń losowych)
    this._planetId = null;

    // Flaga outpost — pomija POP w build/deploy/upgrade/activate
    this._isOutpost = false;

    // Flaga: nowa kolonia wymaga portu kosmicznego jako pierwszej infrastruktury
    this._requiresSpaceportFirst = false;

    // Flaga RegionSystem — dezaktywuje modyfikator polarny (region.r = 0 zawsze)
    this._isRegionMode = false;

    // Referencja na HexGrid — potrzebna do adjacency bonus (ustawiana z ColonyOverlay)
    this._grid = null;

    // Guard: tylko aktywna kolonia przetwarza żądania budowy/rozbiórki
    EventBus.on('planet:buildRequest', ({ tile, buildingId }) => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._build(tile, buildingId);
    });

    EventBus.on('planet:demolishRequest', ({ tile }) => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._demolish(tile);
    });

    EventBus.on('planet:upgradeRequest', ({ tile }) => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._upgrade(tile);
    });

    // Po zbadaniu technologii przelicz effectiveRates wszystkich budynków
    // BEZ guardu — tech jest globalne, wszystkie kolonie muszą przeliczyć stawki
    EventBus.on('tech:researched', () => this._reapplyAllRates());

    // Kara efficiency podczas niepokojów społecznych (−30% produkcji przez 10 lat)
    this._civPenalty = 1.0;
    EventBus.on('civ:unrest', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._civPenalty = 0.7; this._reapplyAllRates();
    });
    EventBus.on('civ:unrestLifted', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._civPenalty = 1.0; this._reapplyAllRates();
    });

    // Przelicz raty po zmianie populacji (per-building laborEfficiency)
    EventBus.on('civ:popBorn', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._reapplyAllRates();
    });
    EventBus.on('civ:popDied', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._reapplyAllRates();
    });

    // Przelicz raty po zdarzeniu losowym (production multiplier)
    EventBus.on('randomEvent:occurred', ({ planetId }) => {
      if (this._planetId && planetId === this._planetId) this._reapplyAllRates();
    });
    EventBus.on('randomEvent:expired', ({ planetId }) => {
      if (this._planetId && planetId === this._planetId) this._reapplyAllRates();
    });

    // Tick: budowa + wydobycie surowców z deposits przez kopalnie + pending queue
    // civDeltaYears = deltaYears × CIV_TIME_SCALE — mechaniki 4X biegną szybciej
    EventBus.on('time:tick', ({ civDeltaYears: deltaYears }) => {
      this._tickConstruction(deltaYears);
      this._tickMineExtraction(deltaYears);
      this._tickPendingQueue();
    });
  }

  // ── Ustaw deposits i factorySystem ──────────────────────────────────────
  setDeposits(deposits) { this._deposits = deposits; }
  setFactorySystem(fs) { this._factorySystem = fs; }
  setRegionMode(isRegion) { this._isRegionMode = !!isRegion; }
  setPlanetId(id) { this._planetId = id; }

  // ── Sprawdź czy kolonia ma port kosmiczny ────────────────────────────────
  hasSpaceport() {
    for (const [, entry] of this._active) {
      if (entry.building.isSpaceport) return true;
    }
    // Sprawdź też w kolejce budowy
    for (const [, constr] of this._constructionQueue) {
      if (BUILDINGS[constr.buildingId]?.isSpaceport) return true;
    }
    return false;
  }

  // ── Licznik budynków na outpoście (bez stolica/spaceport) ────────────────
  _countOutpostBuildings() {
    let count = 0;
    for (const [key, entry] of this._active) {
      if (key.startsWith('capital_')) continue;
      if (entry.building.isSpaceport) continue;
      count++;
    }
    // Dolicz budynki w kolejce budowy
    for (const [, constr] of this._constructionQueue) {
      const b = BUILDINGS[constr.buildingId];
      if (b?.isSpaceport) continue;
      count++;
    }
    return count;
  }

  // ── Pobierz max level budynku ────────────────────────────────────────────
  getMaxLevel() {
    return BASE_MAX_LEVEL;
  }

  // ── Pobierz level budynku na tile ───────────────────────────────────────
  getBuildingLevel(tileKey) {
    return this._active.get(tileKey)?.level ?? 1;
  }

  // ── Query metody dla CivilizationSystem (strata demand) ─────────────────

  /** Zapotrzebowanie na dany typ straty (suma popCost budynków z matching popType) */
  getSlotDemand(strataType) {
    let demand = 0;
    for (const entry of this._active.values()) {
      const pType = entry.building?.popType ?? 'laborer';
      if (pType === strataType && entry.popCost > 0) {
        demand += entry.popCost * entry.level;
      }
    }
    return demand;
  }

  /** Efektywność kopalń: ratio produkcji vs max capacity (0-1) */
  getMineEfficiency() {
    let total = 0, active = 0;
    for (const entry of this._active.values()) {
      if (entry.building?.isMine && entry.popCost > 0) {
        total++;
        // Kopalnia jest aktywna jeśli ma pracowników (nie ma syntheticSlot i empPenalty < 1)
        active++;
      }
    }
    return total > 0 ? active / total : 0.5;
  }

  /** Efektywność fabryk: ratio aktywnych vs total (0-1) */
  getFactoryOutputRatio() {
    let total = 0, producing = 0;
    for (const entry of this._active.values()) {
      const id = entry.building?.id;
      if (id === 'factory') {
        total++;
        producing++;
      }
    }
    return total > 0 ? producing / total : 0.5;
  }

  /** % zaawansowanych budynków działających (nuclear, fusion, shipyard etc.) */
  getAdvancedBuildingsUptime() {
    let total = 0, running = 0;
    for (const entry of this._active.values()) {
      const req = entry.building?.requires;
      if (req && entry.popCost > 0) {
        total++;
        running++;  // na razie zakładamy 100% uptime — Faza 6 doda real check
      }
    }
    return total > 0 ? running / total : 0.5;
  }

  // ── Synthetic units: install/remove ─────────────────────────────────────

  /** Mapa tier → efficiency multiplier */
  static SYNTH_EFFICIENCY = { 2: 1.7 };

  /**
   * Zainstaluj syntetyczną jednostkę w budynku.
   * @param {string} tileKey — klucz hexa "q,r"
   * @param {string} commodityId — np. 'android_worker'
   * @returns {{ success: boolean, reason?: string }}
   */
  installSynthetic(tileKey, commodityId) {
    const entry = this._active.get(tileKey);
    if (!entry) return { success: false, reason: 'no_building' };

    // Sprawdź czy budynek akceptuje syntetyki (musi mieć popCost > 0 i nie być autonomiczny)
    if (entry.building.isAutonomous || entry.popCost === 0) {
      return { success: false, reason: 'autonomous_building' };
    }

    // Sprawdź tile
    const [q, r] = tileKey.split(',').map(Number);
    const tile = this._grid?.get(q, r);
    if (!tile) return { success: false, reason: 'no_tile' };
    if (tile.syntheticSlot) return { success: false, reason: 'slot_occupied' };

    // Sprawdź commodity w inventory
    const inv = this.resourceSystem?._inventory;
    if (!inv || (inv[commodityId] ?? 0) < 1) {
      return { success: false, reason: 'no_commodity' };
    }

    // Pobierz tier z commodity definition
    const tier = COMMODITIES[commodityId]?.droidTier ?? 1;

    // Zużyj commodity
    inv[commodityId] -= 1;

    // Ustaw slot
    tile.syntheticSlot = { commodityId, tier };

    // Przelicz efficiency budynku
    this._reapplyAllRates();

    EventBus.emit('building:syntheticInstalled', { tileKey, commodityId, tier });
    return { success: true };
  }

  /**
   * Usuń syntetyczną jednostkę z budynku (zwrot 50%).
   */
  removeSynthetic(tileKey) {
    const [q, r] = tileKey.split(',').map(Number);
    const tile = this._grid?.get(q, r);
    if (!tile?.syntheticSlot) return { success: false, reason: 'no_synthetic' };

    const { commodityId } = tile.syntheticSlot;

    // Zwrot 50% (zaokrąglenie w górę — minimum 0, max 1 dla 1 sztuki = 0 zwrotu)
    // Dla 1 sztuki input: brak zwrotu (ceil(0.5) = 1, ale mamy tylko 1 → 0)
    // Decyzja: brak zwrotu commodity (unit jest zużyty). Proste i jasne.
    tile.syntheticSlot = null;

    // Przelicz efficiency
    this._reapplyAllRates();

    EventBus.emit('building:syntheticRemoved', { tileKey, commodityId });
    return { success: true };
  }

  // ── Aktywacja budynku (wspólna logika dla nowej budowy i zakończenia construction) ──

  _activateBuilding(tileKey, buildingId, tileR, tileType, isCapital = false) {
    const building = BUILDINGS[buildingId];
    if (!building) return;

    const level = 1;
    // Zbuduj minimalny tile-like obiekt do obliczenia stawek
    const tileLike = { r: tileR, type: tileType, key: tileKey };

    const baseRates      = this._calcBaseRates(building, tileLike, level);
    const activeKey  = isCapital ? `capital_${tileKey}` : tileKey;
    const effectiveRates = this._applyTechMultipliers(baseRates, building, activeKey);

    const producerId = isCapital ? `capital_${tileKey}` : `building_${tileKey}`;

    // Zarejestruj produkcję (bezpośrednio — unika cross-colony bleed)
    if (hasKeys(effectiveRates) && this.resourceSystem) {
      this.resourceSystem.registerProducer(producerId, effectiveRates);
    }

    // Housing (bezpośrednio na własnym civSystem)
    if (building.housing > 0 && this.civSystem) {
      this.civSystem.addHousing(building.housing);
    }

    // Fabryka: dodaj punkt produkcji
    if (buildingId === 'factory' && this._factorySystem) {
      this._factorySystem.setTotalPoints(this._factorySystem.totalPoints + 1);
    }

    const popCost = this._isOutpost ? 0 : (building.popCost ?? POP_PER_BUILDING);

    // Zapamiętaj aktywny budynek
    this._active.set(activeKey, {
      building, baseRates, effectiveRates,
      housing: building.housing,
      popCost,
      level,
      producerId,
    });

    // Zatrudnienie (pomiń w outpost) — bezpośrednio na własnym civSystem
    if (popCost > 0 && !this._isOutpost && this.civSystem) {
      // Konwertuj wolnego POPa z innej strata jeśli brakuje w wymaganej
      const pType = building.popType ?? 'laborer';
      this.civSystem.convertToStrata(pType, popCost);
      this.civSystem.changeEmployment(popCost);
    }

    // Invaliduj cache mine level jeśli zbudowano kopalnię
    if (building.isMine || buildingId === 'mine') this._mineLevelDirty = true;

    // Przelicz stawki sąsiadów (adjacency bonus — Etap 38)
    this._reapplyNeighborRates(tileKey);
  }

  // ── Budowa ──────────────────────────────────────────────────────────────

  _build(tile, buildingId) {
    const building = BUILDINGS[buildingId];
    if (!building) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: t('ui.unknownBuilding') });
      return;
    }

    const isCapital = !!building.isCapital;

    if (!isCapital && tile.isOccupied) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: t('ui.tileOccupied') });
      return;
    }

    if (!this._canBuildOnTile(tile, building)) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: t('ui.terrainForbidden') });
      return;
    }

    // Sprawdzenie wymaganej technologii
    if (building.requires) {
      const hastech = this.techSystem?.isResearched(building.requires) ?? false;
      if (!hastech) {
        const tech = TECHS[building.requires];
        const techName = tech ? getName(tech, 'tech') : building.requires;
        EventBus.emit('planet:buildResult', { success: false, tile, reason: t('ui.requiresTech', techName) });
        return;
      }
    }

    // Reguła "spaceport first" — nowe kolonie wymagają portu kosmicznego
    if (this._requiresSpaceportFirst && !building.isSpaceport && !isCapital && !this.hasSpaceport()) {
      EventBus.emit('planet:buildResult', {
        success: false, tile,
        reason: t('ui.buildSpaceportFirst'),
      });
      return;
    }

    // Outpost: tylko budynki autonomiczne (popCost=0 lub isAutonomous)
    if (this._isOutpost && !isCapital && !building.isSpaceport) {
      const isAllowedOnOutpost = building.isAutonomous || building.popCost === 0;
      if (!isAllowedOnOutpost) {
        EventBus.emit('planet:buildResult', {
          success: false, tile,
          reason: t('ui.outpostAutonomousOnly'),
        });
        return;
      }

      // Outpost: max OUTPOST_MAX_BUILDINGS budynków (bez stolica/spaceport)
      const outpostCount = this._countOutpostBuildings();
      if (outpostCount >= OUTPOST_MAX_BUILDINGS) {
        EventBus.emit('planet:buildResult', {
          success: false, tile,
          reason: t('ui.outpostMaxBuildings', OUTPOST_MAX_BUILDINGS),
        });
        return;
      }
    }

    // Modyfikator polarny (wyłączony dla RegionSystem — polarność wbudowana w biom)
    const latMod = (!this._isRegionMode && this._gridHeight > 0)
      ? HexGrid.getLatitudeModifier(tile.r, this._gridHeight)
      : { production: 1.0, buildCost: 1.0, label: null };

    // Oblicz koszt (surowce + commodities) z modyfikatorem polarnym
    const actualCost = {};
    if (building.cost) {
      for (const [k, v] of Object.entries(building.cost)) {
        actualCost[k] = Math.ceil(v * latMod.buildCost);
      }
    }
    // Commodity cost (bez modyfikatora polarnego — to gotowe komponenty)
    if (building.commodityCost) {
      for (const [k, v] of Object.entries(building.commodityCost)) {
        actualCost[k] = v;
      }
    }

    // Habitat na planecie z atmosferą thick/dense — nie wymaga habitat_modules
    if (buildingId === 'habitat') {
      const atmo = window.KOSMOS?.homePlanet?.atmosphere;
      if (atmo === 'thick' || atmo === 'dense') {
        delete actualCost.pressure_modules;
      }
    }

    // Surcharge Si na ekstremalnych planetach (brak atmo, gorąco, zimno)
    if (this._isPlanetExtreme() && building.popCost > 0 && !building.isAutonomous) {
      actualCost.Si = (actualCost.Si || 0) + 5;
    }

    // Mutex: farm vs synthesized_food_plant (nie mogą istnieć na tej samej planecie)
    if (building.isSynthFood) {
      for (const entry of this._active.values()) {
        if (entry.building.id === 'farm') {
          EventBus.emit('planet:buildResult', {
            success: false, tile,
            reason: t('ui.farmConflictSynth'),
          });
          return;
        }
      }
    }
    if (buildingId === 'farm') {
      for (const entry of this._active.values()) {
        if (entry.building.isSynthFood) {
          EventBus.emit('planet:buildResult', {
            success: false, tile,
            reason: t('ui.synthConflictFarm'),
          });
          return;
        }
      }
    }

    // Sprawdzenie POPów i surowców — brak → dodaj do pending queue
    const popCost = this._isOutpost ? 0 : (building.popCost ?? POP_PER_BUILDING);
    const canAffordResources = !(this.resourceSystem && hasKeys(actualCost) && !this.resourceSystem.canAfford(actualCost));
    const hasFreePops = !(popCost > 0 && this.civSystem && this.civSystem.freePops < popCost);

    if (!canAffordResources || !hasFreePops) {
      const tileKey = tile.key;
      this._pendingQueue.set(tileKey, {
        tileKey,
        buildingId,
        cost: { ...actualCost },
        popCost,
        isUpgrade: false,
        targetLevel: null,
        tileR: tile.r,
        tileType: tile.type,
        queuedAt: window.KOSMOS?.timeSystem?.gameTime ?? 0,
      });
      tile.pendingBuild = buildingId;
      EventBus.emit('planet:buildResult', { success: true, tile, buildingId, queued: true });
      EventBus.emit('planet:buildQueued', { tile, buildingId, cost: { ...actualCost } });
      return;
    }

    // Pobierz koszt
    if (this.resourceSystem && hasKeys(actualCost)) {
      this.resourceSystem.spend(actualCost);
    }

    // Czas budowy (z mnożnikiem tech — AI Core itp.)
    const rawBuildTime = building.buildTime ?? 0;
    const btMult = this.techSystem?.getBuildTimeMultiplier() ?? 1.0;
    const buildTime = rawBuildTime * btMult;

    if (buildTime > 0 && !isCapital) {
      // Budowa z opóźnieniem — dodaj do kolejki
      const tileKey = tile.key;
      this._constructionQueue.set(tileKey, {
        buildingId,
        progress: 0,
        buildTime,
        tileR: tile.r,
        tileType: tile.type,
      });
      tile.underConstruction = { buildingId, progress: 0, buildTime };
      EventBus.emit('planet:buildResult', { success: true, tile, buildingId, underConstruction: true });
      return;
    }

    // Natychmiastowa budowa (buildTime === 0 lub stolica)
    if (isCapital) {
      tile.capitalBase = true;
    } else {
      tile.buildingId = buildingId;
      tile.buildingLevel = 1;
    }

    this._activateBuilding(tile.key, buildingId, tile.r, tile.type, isCapital);
    EventBus.emit('planet:buildResult', { success: true, tile, buildingId });
  }

  // ── Ulepszenie budynku ──────────────────────────────────────────────────

  _upgrade(tile) {
    if (!tile.buildingId) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: t('ui.noBuilding') });
      return;
    }

    // Nie można ulepszać podczas trwającej budowy/upgrade/pending na tym hexie
    if (tile.underConstruction) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: t('ui.constructionInProgress') });
      return;
    }
    if (tile.pendingBuild) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: t('ui.buildQueued') });
      return;
    }

    const entry = this._active.get(tile.key);
    if (!entry) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: t('ui.noActiveBuilding') });
      return;
    }

    const building = entry.building;
    const currentLevel = entry.level || 1;
    const maxLevel = this.getMaxLevel();

    if (currentLevel >= maxLevel) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: t('ui.maxLevel', maxLevel) });
      return;
    }

    const nextLevel = currentLevel + 1;

    // Koszt ulepszenia: baseCost × level × 1.2
    const upgradeCost = {};
    if (building.cost) {
      for (const [k, v] of Object.entries(building.cost)) {
        upgradeCost[k] = Math.ceil(v * nextLevel * 1.2);
      }
    }
    // Commodities od poziomu 3
    if (nextLevel >= 3 && building.commodityCost) {
      for (const [k, v] of Object.entries(building.commodityCost)) {
        upgradeCost[k] = Math.ceil(v * (nextLevel - 1));
      }
    }

    // Sprawdzenie POPów i surowców — brak → dodaj do pending queue
    const popCost = this._isOutpost ? 0 : (entry.popCost ?? building.popCost ?? POP_PER_BUILDING);
    const canAffordUpgrade = !(this.resourceSystem && hasKeys(upgradeCost) && !this.resourceSystem.canAfford(upgradeCost));
    const hasFreePopsUpg = !(popCost > 0 && this.civSystem && this.civSystem.freePops < popCost);

    if (!canAffordUpgrade || !hasFreePopsUpg) {
      const tileKey = tile.key;
      this._pendingQueue.set(tileKey, {
        tileKey,
        buildingId: building.id,
        cost: { ...upgradeCost },
        popCost,
        isUpgrade: true,
        targetLevel: nextLevel,
        tileR: tile.r,
        tileType: tile.type,
        queuedAt: window.KOSMOS?.timeSystem?.gameTime ?? 0,
      });
      tile.pendingBuild = building.id;
      EventBus.emit('planet:upgradeResult', { success: true, tile, queued: true });
      EventBus.emit('planet:upgradeQueued', { tile, cost: { ...upgradeCost } });
      return;
    }

    // Pobierz koszt
    if (this.resourceSystem && hasKeys(upgradeCost)) {
      this.resourceSystem.spend(upgradeCost);
    }

    // Czas budowy upgrade: bazowy × 0.5
    const upgradeTime = (building.buildTime ?? 0) * 0.5;

    if (upgradeTime > 0) {
      // Upgrade z opóźnieniem — budynek działa normalnie na starym poziomie
      const tileKey = tile.key;
      this._constructionQueue.set(tileKey, {
        buildingId: building.id,
        progress: 0,
        buildTime: upgradeTime,
        tileR: tile.r,
        tileType: tile.type,
        isUpgrade: true,
        targetLevel: nextLevel,
      });
      tile.underConstruction = { buildingId: building.id, progress: 0, buildTime: upgradeTime, isUpgrade: true };
      EventBus.emit('planet:upgradeResult', { success: true, tile, underConstruction: true });
      return;
    }

    // Natychmiastowy upgrade (buildTime === 0)
    this._applyUpgrade(tile, entry, building, nextLevel, popCost);
    EventBus.emit('planet:upgradeResult', { success: true, tile, level: nextLevel });
  }

  // Wspólna logika natychmiastowego ulepszenia
  _applyUpgrade(tile, entry, building, nextLevel, popCost) {
    // Zatrudnienie — upgrade wymaga dodatkowego POPa (bezpośrednio)
    if (popCost > 0 && this.civSystem) {
      const pType = building.popType ?? 'laborer';
      this.civSystem.convertToStrata(pType, popCost);
      this.civSystem.changeEmployment(popCost);
    }

    // Aktualizuj level
    entry.level = nextLevel;
    tile.buildingLevel = nextLevel;

    // Przelicz stawki z nowym levelem
    entry.baseRates = this._calcBaseRates(building, tile, nextLevel);
    entry.effectiveRates = this._applyTechMultipliers(entry.baseRates, building);

    const producerId = `building_${tile.key}`;
    if (hasKeys(entry.effectiveRates) && this.resourceSystem) {
      this.resourceSystem.registerProducer(producerId, entry.effectiveRates);
    }

    // Housing: każdy kolejny level dodaje housing (np. habitat +3/lv)
    if (building.housing > 0) {
      entry.housing = (entry.housing || 0) + building.housing;
      if (this.civSystem) this.civSystem.addHousing(building.housing);
    }

    // Fabryka: dodaj punkt produkcji za każdy level powyżej 1
    if (building.id === 'factory' && this._factorySystem) {
      this._recalcFactoryPoints();
    }

    // Invaliduj cache mine level jeśli ulepszono kopalnię
    if (building.id === 'mine' || building.isMine) this._mineLevelDirty = true;
  }

  // ── Rozbiórka ───────────────────────────────────────────────────────────

  _demolish(tile) {
    // Anulowanie oczekującego zamówienia (pending)
    if (tile.pendingBuild) {
      const pendingId = tile.pendingBuild;
      this.cancelPending(tile.key);
      EventBus.emit('planet:demolishResult', { success: true, tile, cancelled: true, buildingId: pendingId });
      return;
    }

    // Anulowanie budowy w toku
    if (tile.underConstruction) {
      const uc = tile.underConstruction;
      const building = BUILDINGS[uc.buildingId];
      const tileKey = tile.key;

      // Usuń z kolejki
      this._constructionQueue.delete(tileKey);
      tile.underConstruction = null;

      // Zwrot 50% kosztu budowy (tylko dla nowej budowy, nie upgrade)
      if (!uc.isUpgrade && building && this.resourceSystem) {
        const refund = {};
        if (building.cost) {
          for (const [k, v] of Object.entries(building.cost)) {
            refund[k] = Math.floor(v * 0.5);
          }
        }
        if (building.commodityCost) {
          for (const [k, v] of Object.entries(building.commodityCost)) {
            refund[k] = Math.floor(v / 2);
          }
        }
        if (hasKeys(refund)) {
          this.resourceSystem.receive(refund);
        }
      }

      // Zwrot 50% kosztu upgrade
      if (uc.isUpgrade && building && this.resourceSystem) {
        const targetLevel = uc.targetLevel ?? 2;
        const refund = {};
        if (building.cost) {
          for (const [k, v] of Object.entries(building.cost)) {
            refund[k] = Math.floor(Math.ceil(v * targetLevel * 1.2) * 0.5);
          }
        }
        if (targetLevel >= 3 && building.commodityCost) {
          for (const [k, v] of Object.entries(building.commodityCost)) {
            refund[k] = Math.floor(Math.ceil(v * (targetLevel - 1)) / 2);
          }
        }
        if (hasKeys(refund)) {
          this.resourceSystem.receive(refund);
        }
      }

      EventBus.emit('planet:demolishResult', { success: true, tile, cancelled: true, buildingId: uc.buildingId });
      return;
    }

    if (!tile.buildingId) {
      EventBus.emit('planet:demolishResult', { success: false, tile, reason: t('ui.noBuilding') });
      return;
    }

    const buildingDef = BUILDINGS[tile.buildingId];
    if (buildingDef?.isColonyBase || buildingDef?.isCapital) {
      EventBus.emit('planet:demolishResult', { success: false, tile, reason: t('ui.capitalIndestructible') });
      return;
    }

    // Nie pozwól na rozbiórkę ostatniego portu kosmicznego
    if (buildingDef?.isSpaceport && this._requiresSpaceportFirst) {
      let spaceportCount = 0;
      for (const [, e] of this._active) {
        if (e.building.isSpaceport) spaceportCount++;
      }
      if (spaceportCount <= 1) {
        EventBus.emit('planet:demolishResult', {
          success: false, tile, reason: t('ui.cannotDemolishSpaceport'),
        });
        return;
      }
    }

    const entry     = this._active.get(tile.key);
    const buildingId = tile.buildingId;
    const building  = BUILDINGS[buildingId];
    const level     = entry?.level ?? 1;

    // ── Downgrade (Lv > 1): obniż o 1 poziom ──────────────────────
    if (level > 1) {
      const refund = {};
      // Zwrot surowców: floor(ceil(baseCost × level × 1.2) × 0.5)
      if (building?.cost) {
        for (const [k, v] of Object.entries(building.cost)) {
          refund[k] = Math.floor(Math.ceil(v * level * 1.2) * 0.5);
        }
      }
      // Zwrot commodities (tylko gdy level >= 3 — wydano je przy upgrade do 3+)
      if (level >= 3 && building?.commodityCost) {
        for (const [k, v] of Object.entries(building.commodityCost)) {
          const spent = Math.ceil(v * (level - 1));
          refund[k] = Math.floor(spent / 2);
        }
      }

      // Oddaj surowce i commodities
      if (this.resourceSystem && hasKeys(refund)) {
        this.resourceSystem.receive(refund);
      }

      // Obniż poziom
      const newLevel = level - 1;
      entry.level = newLevel;
      tile.buildingLevel = newLevel;

      // Przelicz stawki produkcji na nowy (niższy) level
      entry.baseRates = this._calcBaseRates(building, tile, newLevel);
      entry.effectiveRates = this._applyTechMultipliers(entry.baseRates, building);

      const producerId = `building_${tile.key}`;
      if (hasKeys(entry.effectiveRates) && this.resourceSystem) {
        this.resourceSystem.registerProducer(producerId, entry.effectiveRates);
      }

      // Fabryka: przelicz punkty produkcji
      if (buildingId === 'factory' && this._factorySystem) {
        this._recalcFactoryPoints();
      }

      // Odejmij housing za obniżony poziom (np. habitat -3/lv)
      if (building?.housing > 0) {
        entry.housing = Math.max(0, (entry.housing || 0) - building.housing);
        if (this.civSystem) this.civSystem.removeHousing(building.housing);
      }

      // Zwolnij POPy za obniżony poziom (bezpośrednio)
      const downgradePop = entry.popCost ?? building?.popCost ?? POP_PER_BUILDING;
      if (downgradePop > 0 && this.civSystem) {
        this.civSystem.changeEmployment(-downgradePop);
      }

      // Invaliduj cache mine level jeśli rozebrano kopalnię
      if (buildingId === 'mine' || building?.isMine) this._mineLevelDirty = true;

      EventBus.emit('planet:demolishResult', {
        success: true, tile, buildingId,
        downgrade: true, newLevel,
      });
      return;
    }

    // ── Pełna rozbiórka (Lv 1) ──────────────────────────────────────

    // Usuń producenta (bezpośrednio)
    if (this.resourceSystem) {
      this.resourceSystem.removeProducer(`building_${tile.key}`);
    }

    // Housing (bezpośrednio)
    if (entry?.housing > 0 && this.civSystem) {
      this.civSystem.removeHousing(entry.housing);
    }

    // Zwrot 50% kosztu budowy (surowce + commodities)
    if (building && this.resourceSystem) {
      const refund = {};
      if (building.cost) {
        for (const [k, v] of Object.entries(building.cost)) {
          refund[k] = Math.floor(v * 0.5);
        }
      }
      if (building.commodityCost) {
        for (const [k, v] of Object.entries(building.commodityCost)) {
          refund[k] = Math.floor(v / 2);
        }
      }
      if (hasKeys(refund)) {
        this.resourceSystem.receive(refund);
      }
    }

    // Fabryka: odejmij punkty produkcji
    if (buildingId === 'factory' && this._factorySystem) {
      this._recalcFactoryPoints();
    }

    // Zwolnij POPy (bezpośrednio)
    const popCost = entry?.popCost ?? building?.popCost ?? POP_PER_BUILDING;
    if (popCost > 0 && this.civSystem) {
      this.civSystem.changeEmployment(-popCost);
    }

    // Invaliduj cache mine level jeśli rozebrano kopalnię
    if (buildingId === 'mine' || building?.isMine) this._mineLevelDirty = true;

    tile.buildingId = null;
    tile.buildingLevel = 1;
    this._active.delete(tile.key);

    EventBus.emit('planet:demolishResult', { success: true, tile, buildingId });
  }

  // ── Tick budowy — progresja construction queue ────────────────────────

  _tickConstruction(deltaYears) {
    if (this._constructionQueue.size === 0) return;

    const completed = [];

    for (const [tileKey, entry] of this._constructionQueue) {
      entry.progress += deltaYears;

      if (entry.progress >= entry.buildTime) {
        completed.push(tileKey);
      }
    }

    // Powiadom UI o postępie budowy (pasek progresu)
    if (completed.length < this._constructionQueue.size) {
      EventBus.emit('planet:constructionProgress');
    }

    for (const tileKey of completed) {
      const entry = this._constructionQueue.get(tileKey);
      this._constructionQueue.delete(tileKey);

      if (entry.isUpgrade) {
        // Upgrade zakończony — zaktualizuj level w _active
        const activeEntry = this._active.get(tileKey);
        if (activeEntry) {
          const building = activeEntry.building;
          const nextLevel = entry.targetLevel ?? (activeEntry.level + 1);
          const popCost = activeEntry.popCost ?? building?.popCost ?? POP_PER_BUILDING;

          // Użyj tile-like do _applyUpgrade
          const tileLike = { key: tileKey, r: entry.tileR, type: entry.tileType, buildingLevel: activeEntry.level, buildingId: building.id };
          this._applyUpgrade(tileLike, activeEntry, building, nextLevel, popCost);
        }
      } else {
        // Nowa budowa zakończona — aktywuj budynek
        this._activateBuilding(tileKey, entry.buildingId, entry.tileR, entry.tileType, false);
      }

      EventBus.emit('planet:constructionComplete', { tileKey, buildingId: entry.buildingId, isUpgrade: entry.isUpgrade });
    }
  }

  // ── Tick pending queue — sprawdź czy zamówienia mogą ruszyć ──────────

  _tickPendingQueue() {
    if (this._pendingQueue.size === 0) return;

    // Zbierz klucze do iteracji (nie modyfikujemy Map podczas for..of)
    const keys = [...this._pendingQueue.keys()];

    for (const tileKey of keys) {
      const order = this._pendingQueue.get(tileKey);
      if (!order) continue;

      // Sprawdź środki (re-check — stan mógł się zmienić po poprzednim fulfillment)
      if (hasKeys(order.cost) && !this.resourceSystem?.canAfford(order.cost)) continue;

      // Sprawdź POPy (re-check po każdym fulfillment)
      const neededPop = order.popCost ?? 0;
      if (neededPop > 0 && this.civSystem && this.civSystem.freePops < neededPop) continue;

      // ── Fulfill — usuń z pending, pobierz koszt, uruchom budowę ──
      this._pendingQueue.delete(tileKey);

      if (hasKeys(order.cost)) {
        this.resourceSystem.spend(order.cost);
      }

      if (order.isUpgrade) {
        const entry = this._active.get(tileKey);
        if (entry) {
          const building = entry.building;
          const upgradeTime = (building.buildTime ?? 0) * 0.5;

          if (upgradeTime > 0) {
            this._constructionQueue.set(tileKey, {
              buildingId: building.id,
              progress: 0,
              buildTime: upgradeTime,
              tileR: order.tileR,
              tileType: order.tileType,
              isUpgrade: true,
              targetLevel: order.targetLevel,
            });
          } else {
            const tileLike = { key: tileKey, r: order.tileR, type: order.tileType, buildingLevel: entry.level, buildingId: building.id };
            this._applyUpgrade(tileLike, entry, building, order.targetLevel, neededPop);
          }
        }
      } else {
        const building = BUILDINGS[order.buildingId];
        const rawBuildTime = building?.buildTime ?? 0;
        const btMult = this.techSystem?.getBuildTimeMultiplier() ?? 1.0;
        const buildTime = rawBuildTime * btMult;

        if (buildTime > 0) {
          this._constructionQueue.set(tileKey, {
            buildingId: order.buildingId,
            progress: 0,
            buildTime,
            tileR: order.tileR,
            tileType: order.tileType,
          });
        } else {
          this._activateBuilding(tileKey, order.buildingId, order.tileR, order.tileType, false);
        }
      }

      EventBus.emit('planet:pendingFulfilled', {
        tileKey,
        buildingId: order.buildingId,
        isUpgrade: order.isUpgrade,
      });
    }
  }

  // ── Anuluj oczekujące zamówienie ────────────────────────────────────────

  cancelPending(tileKey) {
    const order = this._pendingQueue.get(tileKey);
    if (!order) return;
    this._pendingQueue.delete(tileKey);
    // Tile pendingBuild jest czyszczony przez _syncBuildingIds() po evencie
    EventBus.emit('planet:pendingCancelled', { tileKey });
  }

  // ── Demand z pending orders (dla CivilianTradeSystem) ────────────────

  /**
   * Auto-umieść budynek na pierwszym pasującym hexie (bez kosztu surowców).
   * Używane przy: auto-spaceport z colony ship, outpost + budynek z cargo.
   * @param {string} buildingId
   * @returns {boolean} true jeśli udało się postawić
   */
  autoPlaceBuilding(buildingId) {
    const building = BUILDINGS[buildingId];
    if (!building) return false;

    const grid = this._grid;
    if (!grid) return false;

    // Znajdź pierwszy wolny hex pasujący do budynku
    for (const [key, tile] of grid.tiles) {
      if (tile.buildingId) continue;         // zajęty
      if (tile.capitalBase) continue;        // stolica
      if (tile.underConstruction) continue;  // w budowie

      // Sprawdź czy teren pasuje
      const allowed = building.allowedTerrain;
      if (allowed && !allowed.includes(tile.terrain)) continue;

      // Postaw budynek natychmiast (bez kosztu, bez czasu budowy)
      tile.buildingId = buildingId;
      tile.buildingLevel = 1;

      // Zarejestruj w _active
      const rates = this._calcBaseRates(building, tile, 1);
      const effectiveRates = this._applyTechMultipliers(rates, building);
      const entry = {
        building, def: building, level: 1, tile, tileKey: key,
        baseRates: { ...rates }, effectiveRates: { ...effectiveRates },
        popCost: building.popCost ?? 0,
      };
      this._active.set(key, entry);

      // Zarejestruj producenta
      if (this.resourceSystem) {
        this.resourceSystem.registerProducer(key, rates);
      }

      // Housing
      if (building.housing > 0) {
        EventBus.emit('civ:addHousing', { amount: building.housing });
      }

      // Przelicz factory points jeśli to fabryka
      if (building.id === 'factory') this._recalcFactoryPoints();

      return true;
    }
    return false;
  }

  getPendingDemand() {
    const demand = {};
    for (const [, order] of this._pendingQueue) {
      for (const [resId, qty] of Object.entries(order.cost)) {
        demand[resId] = (demand[resId] ?? 0) + qty;
      }
    }
    return demand;
  }

  // ── Przywracanie zapisanego stanu ───────────────────────────────────────

  restoreFromSave(buildings) {
    let totalPopCost = 0;
    let totalHousing = 0;

    for (const b of buildings) {
      const building = BUILDINGS[b.buildingId];
      if (!building) continue;

      const isCapital = !!building.isCapital;
      const level = b.level ?? 1;

      const baseRates      = b.baseRates || b.effectiveRates || {};
      const effectiveRates = this._applyTechMultipliers(baseRates, building);

      const activeKey  = isCapital ? (b.tileKey.startsWith('capital_') ? b.tileKey : `capital_${b.tileKey}`) : b.tileKey;
      const producerId = isCapital ? `capital_${b.tileKey.replace('capital_', '')}` : `building_${b.tileKey}`;
      const popCost    = this._isOutpost ? 0 : (b.popCost ?? building.popCost ?? POP_PER_BUILDING);
      const housing    = b.housing || 0;

      if (hasKeys(effectiveRates) && this.resourceSystem) {
        this.resourceSystem.registerProducer(producerId, effectiveRates);
      }
      this._active.set(activeKey, {
        building, baseRates, effectiveRates,
        housing,
        popCost,
        level,
        producerId,
      });
      totalPopCost += popCost * level;
      totalHousing += housing;  // housing już skumulowany (per-level) w serialize()
    }

    if (this.civSystem) {
      // Przelicz zatrudnienie z budynków
      if (totalPopCost > 0) {
        this.civSystem._employedPops = Math.max(0, this.civSystem._employedPops + totalPopCost);
      }
      // Przelicz housing z budynków (analogicznie — bezpośrednio, nie przez EventBus)
      if (totalHousing > 0) {
        this.civSystem.housing += totalHousing;
      }
    }

    // Przelicz punkty fabryczne po restore
    if (this._factorySystem) {
      this._recalcFactoryPoints();
    }
  }

  restoreFromGrid(grid) {
    grid.forEach(tile => {
      if (!tile.buildingId) return;  // pomiń puste i underConstruction-only
      const building = BUILDINGS[tile.buildingId];
      if (!building) return;

      const level = tile.buildingLevel ?? 1;
      const baseRates      = this._calcBaseRates(building, tile, level);
      const effectiveRates = this._applyTechMultipliers(baseRates, building);
      const producerId     = `building_${tile.key}`;

      if (hasKeys(effectiveRates) && this.resourceSystem) {
        this.resourceSystem.registerProducer(producerId, effectiveRates);
      }
      this._active.set(tile.key, {
        building, baseRates, effectiveRates,
        housing: building.housing,
        popCost: building.popCost ?? POP_PER_BUILDING,
        level,
        producerId,
      });
    });

    if (this._factorySystem) {
      this._recalcFactoryPoints();
    }
  }

  // ── Serializacja ────────────────────────────────────────────────────────

  serialize() {
    const buildings = [];
    this._active.forEach((entry, tileKey) => {
      buildings.push({
        tileKey,
        buildingId:     entry.building.id,
        baseRates:      { ...(entry.baseRates || {}) },
        effectiveRates: { ...(entry.effectiveRates || {}) },
        housing:        entry.housing || 0,
        popCost:        entry.popCost ?? 0.25,
        level:          entry.level ?? 1,
      });
    });
    return buildings;
  }

  // Serializacja kolejki budowy (oddzielnie — przez ColonyManager)
  serializeQueue() {
    const queue = [];
    for (const [tileKey, entry] of this._constructionQueue) {
      const item = {
        tileKey,
        buildingId: entry.buildingId,
        progress:   entry.progress,
        buildTime:  entry.buildTime,
        tileR:      entry.tileR,
        tileType:   entry.tileType,
      };
      if (entry.isUpgrade) {
        item.isUpgrade   = true;
        item.targetLevel = entry.targetLevel;
      }
      queue.push(item);
    }
    return queue;
  }

  // Przywracanie kolejki budowy (z ColonyManager.restore)
  restoreQueue(queue) {
    if (!Array.isArray(queue)) return;
    for (const item of queue) {
      this._constructionQueue.set(item.tileKey, {
        buildingId: item.buildingId,
        progress:   item.progress ?? 0,
        buildTime:  item.buildTime ?? 1,
        tileR:      item.tileR ?? 0,
        tileType:   item.tileType ?? 'plains',
        isUpgrade:  item.isUpgrade ?? false,
        targetLevel: item.targetLevel,
      });
    }
  }

  // Serializacja pending queue (oddzielnie — przez ColonyManager)
  serializePendingQueue() {
    const pending = [];
    for (const [, order] of this._pendingQueue) {
      pending.push({ ...order });
    }
    return pending;
  }

  // Przywracanie pending queue (z ColonyManager.restore)
  restorePendingQueue(pending) {
    if (!Array.isArray(pending)) return;
    for (const item of pending) {
      this._pendingQueue.set(item.tileKey, {
        tileKey:     item.tileKey,
        buildingId:  item.buildingId,
        cost:        item.cost ?? {},
        isUpgrade:   item.isUpgrade ?? false,
        targetLevel: item.targetLevel ?? null,
        tileR:       item.tileR ?? 0,
        tileType:    item.tileType ?? 'plains',
        queuedAt:    item.queuedAt ?? 0,
      });
    }
  }

  // ── Prywatne ────────────────────────────────────────────────────────────

  _isPlanetExtreme() {
    const planet = window.KOSMOS?.homePlanet;
    if (!planet) return false;
    return planet.atmosphere === 'none'
      || (planet.temperatureC != null && planet.temperatureC > 150)
      || (planet.temperatureC != null && planet.temperatureC < -100);
  }

  _canBuildOnTile(tile, building) {
    const terrain = TERRAIN_TYPES[tile.type];
    if (!terrain?.buildable) return false;
    if (tile.damaged)        return false;
    if (building.terrainOnly) return building.terrainOnly.includes(tile.type);
    if (building.terrainAny) return true;
    // Sprawdź standardowe allowedCategories terenu
    if (terrain.allowedCategories.includes(building.category)) return true;
    // Sprawdź terrain unlock z technologii (Etap 38)
    const techUnlocks = this.techSystem?.getTerrainUnlocks(tile.type) ?? [];
    return techUnlocks.includes(building.category);
  }

  // Oblicz stawki bazowe z uwzględnieniem poziomu budynku
  // Efekt poziomu: rate × level (liniowy — upgrade podwaja produkcję)
  _calcBaseRates(building, tile, level = 1) {
    const hasRates = building.rates && hasKeys(building.rates);
    const hasEnergyCost = building.energyCost && building.energyCost > 0;
    const hasMaintenance = building.maintenance && hasKeys(building.maintenance);

    // Jeśli brak rates I brak energyCost I brak maintenance → naprawdę puste
    if (!hasRates && !hasEnergyCost && !hasMaintenance) return {};

    const terrain = TERRAIN_TYPES[tile.type];
    const bonuses = terrain?.yieldBonus ?? {};
    const multiplier = bonuses[building.category] ?? bonuses.default ?? 1.0;

    const latMod = (!this._isRegionMode && this._gridHeight > 0)
      ? HexGrid.getLatitudeModifier(tile.r, this._gridHeight)
      : { production: 1.0, buildCost: 1.0, label: null };

    // Mnożnik poziomu: liniowy — Lv2 = 2x, Lv3 = 3x produkcji
    const levelMult = level;

    const base = {};
    if (hasRates) {
      const rates = building.rates;
      for (const key in rates) {
        const val = rates[key];
        if (key === 'research') {
          base[key] = val * latMod.production * levelMult;
        } else if (val < 0) {
          // Konsumpcja rośnie liniowo z levelem: Lv2 = 2×, Lv3 = 3×
          base[key] = val * levelMult;
        } else {
          base[key] = val * multiplier * latMod.production * levelMult;
        }
      }
    }

    // Dodatkowa konsumpcja energii (energyCost z definicji budynku)
    if (hasEnergyCost) {
      base.energy = (base.energy ?? 0) - building.energyCost * levelMult;
    }

    // Maintenance — stały koszt utrzymania per level (ujemne stawki surowców)
    if (hasMaintenance) {
      for (const [res, amount] of Object.entries(building.maintenance)) {
        base[res] = (base[res] ?? 0) - amount * levelMult;
      }
    }

    return base;
  }

  /**
   * Oblicz mnożnik adjacency bonus dla budynku na danym hexie.
   * Warunek: zbadane urban_planning.
   * Bonus: 1.0 + (count sąsiadów tej samej kategorii × adjMultiplier)
   */
  _calcAdjacencyBonus(tileKey, building) {
    const adjMult = this.techSystem?.getAdjacencyMultiplier() ?? 0;
    if (adjMult === 0 || !this._grid) return 1.0;

    const parts = tileKey.split(',');
    const q = parseInt(parts[0], 10);
    const r = parseInt(parts[1], 10);
    if (isNaN(q) || isNaN(r)) return 1.0;

    const neighbors = this._grid.getNeighbors(q, r);
    let count = 0;
    for (const nb of neighbors) {
      const nbKey = `${nb.q},${nb.r}`;
      const nbEntry = this._active.get(nbKey);
      if (nbEntry && nbEntry.building.category === building.category) {
        count++;
      }
    }
    return 1.0 + count * adjMult;
  }

  /**
   * Przelicz stawki sąsiadów danego hexa (po budowie/rozbiórce).
   */
  _reapplyNeighborRates(tileKey) {
    if (!this._grid) return;
    const parts = tileKey.split(',');
    const q = parseInt(parts[0], 10);
    const r = parseInt(parts[1], 10);
    if (isNaN(q) || isNaN(r)) return;

    const neighbors = this._grid.getNeighbors(q, r);
    for (const nb of neighbors) {
      const nbKey = `${nb.q},${nb.r}`;
      const entry = this._active.get(nbKey);
      if (!entry) continue;
      const newEffective = this._applyTechMultipliers(entry.baseRates, entry.building, nbKey);
      entry.effectiveRates = newEffective;
      if (hasKeys(newEffective) && this.resourceSystem) {
        const pid = entry.producerId ?? `building_${nbKey}`;
        this.resourceSystem.registerProducer(pid, newEffective);
      }
    }
  }

  /** Per-budynkowe labor efficiency oparte o matching strata type lub syntheticSlot */
  _getBuildingLaborEfficiency(building, tileKey = null) {
    if (!building || !this.civSystem?.strata) return 1.0;
    // Autonomiczne / popCost=0 → pełna wydajność
    if (building.isAutonomous || building.popCost === 0) return 1.0;
    // Singularność: tech allBuildingsAutonomous
    if (this.techSystem?.isAllAutonomous?.()) return 1.0;

    // Synthetic unit zainstalowany → tier efficiency (×1.4 / ×1.7 / ×2.5)
    if (tileKey && this._grid) {
      const [q, r] = tileKey.split(',').map(Number);
      const tile = this._grid.get(q, r);
      if (tile?.syntheticSlot) {
        return BuildingSystem.SYNTH_EFFICIENCY[tile.syntheticSlot.tier] ?? 1.4;
      }
    }

    // Biologiczne strata: matching type
    const strataType = building.popType ?? 'laborer';
    const strataCount = this.civSystem.strata[strataType]?.count ?? 0;
    const demand = this.getSlotDemand(strataType);
    if (demand <= 0) return 1.0;
    return Math.min(1.0, strataCount / demand);
  }

  _applyTechMultipliers(baseRates, building, tileKey = null) {
    if (!hasKeys(baseRates)) return {};

    // Per-budynkowe labor efficiency (zamiast globalnego employmentPenalty)
    const empPenalty = this._getBuildingLaborEfficiency(building, tileKey);

    const isAutonomous = building.isAutonomous || building.popCost === 0;
    const isSingularity = this.techSystem?.isAllAutonomous?.() ?? false;

    // Adjacency bonus (Etap 38) — mnożnik produkcji z sąsiadów tej samej kategorii
    const adjBonus = tileKey ? this._calcAdjacencyBonus(tileKey, building) : 1.0;

    // Autonomiczna wydajność bonus (AI tech)
    const autoEfficiency = (isAutonomous && !isSingularity)
      ? (this.techSystem?.getAutonomousEfficiency() ?? 1.0)
      : 1.0;

    // Outpost: kara wydajności ×0.6 — brak ludzi do nadzoru/konserwacji
    const outpostPenalty = this._isOutpost ? OUTPOST_EFFICIENCY : 1.0;

    // Mnożnik lojalności (0.6 do 1.05) i kara z negocjacji ruchów społecznych
    const loyaltyMult = this.civSystem?.getLoyaltyProductionMultiplier?.() ?? 1.0;
    const penaltyMult = this.civSystem?.getProductionPenaltyMultiplier?.() ?? 1.0;

    const effective = {};
    for (const key in baseRates) {
      const val = baseRates[key];
      if (val > 0) {
        const techMult = this.techSystem?.getProductionMultiplier(key) ?? 1.0;
        // Mnożnik z aktywnych zdarzeń losowych (per-kolonia)
        const eventMult = this._planetId
          ? (window.KOSMOS?.randomEventSystem?.getProductionMultiplierForColony(this._planetId, key) ?? 1.0)
          : 1.0;
        effective[key] = val * techMult * eventMult * this._civPenalty * empPenalty * adjBonus * autoEfficiency * outpostPenalty * loyaltyMult * penaltyMult;
      } else if (val < 0) {
        const techMult = this.techSystem?.getConsumptionMultiplier(key) ?? 1.0;
        effective[key] = val * techMult;
      } else {
        effective[key] = val;
      }
    }
    return effective;
  }

  _reapplyAllRates() {
    for (const [activeKey, entry] of this._active) {
      const newEffective = this._applyTechMultipliers(entry.baseRates, entry.building, activeKey);
      entry.effectiveRates = newEffective;

      if (hasKeys(newEffective) && this.resourceSystem) {
        const pid = entry.producerId ?? (activeKey.startsWith('capital_') ? activeKey : `building_${activeKey}`);
        this.resourceSystem.registerProducer(pid, newEffective);
      }
    }
  }

  // Przelicz sumaryczne punkty fabryczne ze wszystkich fabryk
  _recalcFactoryPoints() {
    if (!this._factorySystem) return;
    let total = 0;
    for (const entry of this._active.values()) {
      if (entry.building.id === 'factory') {
        total += entry.level ?? 1;
      }
    }
    this._factorySystem.setTotalPoints(total);
  }

  // Tick: wydobycie surowców z deposits przez kopalnie (wszystkie kolonie)
  _tickMineExtraction(deltaYears) {
    if (!this._deposits || this._deposits.length === 0) return;
    if (!this.resourceSystem) return;

    // Cache mine level — invalidowany przy budowie/rozbiórce kopalni
    if (this._mineLevelDirty !== false) {
      let total = 0;
      for (const entry of this._active.values()) {
        if (entry.building.isMine || entry.building.id === 'mine') {
          total += entry.level ?? 1;
        }
      }
      this._cachedMineLevel = total;
      this._mineLevelDirty = false;
    }
    if (this._cachedMineLevel === 0) return;

    // Wydobądź surowce z deposits (zwraca plain object)
    const gains = DepositSystem.extractFromDeposits(this._deposits, this._cachedMineLevel, deltaYears);

    // Dodaj wydobyte surowce do inventory
    if (gains && hasKeys(gains)) {
      this.resourceSystem.receive(gains);
    }
  }
}
