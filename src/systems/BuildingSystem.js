// BuildingSystem — logika budowania i zarządzania instalacjami na mapie hex
//
// NOWY SYSTEM: poziomy budynków (1–10), koszty w surowcach+commodities,
// kopalnia → wydobycie z deposits, energyCost per budynek, fabryka → punkty produkcji
//
// Komunikacja:
//   Nasłuchuje: 'planet:buildRequest'    { tile, buildingId }
//               'planet:demolishRequest' { tile }
//               'planet:upgradeRequest'  { tile }
//   Emituje:    'planet:buildResult'     { success, tile, buildingId, reason }
//               'planet:demolishResult'  { success, tile, reason }
//               'planet:upgradeResult'   { success, tile, reason }
//               'resource:registerProducer' → do ResourceSystem
//               'resource:removeProducer'   → do ResourceSystem
//               'civ:addHousing'            → do CivilizationSystem
//               'civ:removeHousing'         → do CivilizationSystem

import EventBus from '../core/EventBus.js';
import { BUILDINGS }      from '../data/BuildingsData.js';
import { TERRAIN_TYPES }  from '../map/HexTile.js';
import { TECHS }          from '../data/TechData.js';
import { HexGrid }        from '../map/HexGrid.js';
import { POP_PER_BUILDING } from '../systems/CivilizationSystem.js';
import { DepositSystem }    from '../systems/DepositSystem.js';

// Maksymalny poziom budynku — base 10, tech nie potrzebny
const BASE_MAX_LEVEL = 10;

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

    // Wysokość siatki (do obliczania modyfikatora polarnego)
    this._gridHeight = 0;

    // Referencja na deposits ciała niebieskiego (ustawiana przez PlanetGlobeScene/GameScene)
    this._deposits = null;

    // Referencja na factorySystem (do punktów produkcji)
    this._factorySystem = null;

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

    // Przelicz raty po zmianie populacji (employmentPenalty)
    EventBus.on('civ:popBorn', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._reapplyAllRates();
    });
    EventBus.on('civ:popDied', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._reapplyAllRates();
    });

    // Tick: wydobycie surowców z deposits przez kopalnie
    EventBus.on('time:tick', ({ deltaYears }) => {
      this._tickMineExtraction(deltaYears);
    });
  }

  // ── Ustaw deposits i factorySystem ──────────────────────────────────────
  setDeposits(deposits) { this._deposits = deposits; }
  setFactorySystem(fs) { this._factorySystem = fs; }

  // ── Pobierz max level budynku ────────────────────────────────────────────
  getMaxLevel() {
    return BASE_MAX_LEVEL;
  }

  // ── Pobierz level budynku na tile ───────────────────────────────────────
  getBuildingLevel(tileKey) {
    return this._active.get(tileKey)?.level ?? 1;
  }

  // ── Budowa ──────────────────────────────────────────────────────────────

  _build(tile, buildingId) {
    const building = BUILDINGS[buildingId];
    if (!building) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: 'Nieznany budynek' });
      return;
    }

    const isCapital = !!building.isCapital;

    if (!isCapital && tile.isOccupied) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: 'Pole zajęte' });
      return;
    }

    if (!this._canBuildOnTile(tile, building)) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: 'Teren niedozwolony' });
      return;
    }

    // Sprawdzenie wymaganej technologii
    if (building.requires) {
      const hastech = this.techSystem?.isResearched(building.requires) ?? false;
      if (!hastech) {
        const techName = TECHS[building.requires]?.namePL ?? building.requires;
        EventBus.emit('planet:buildResult', { success: false, tile, reason: `Wymaga tech: ${techName}` });
        return;
      }
    }

    // Modyfikator polarny
    const latMod = this._gridHeight > 0
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

    // Sprawdzenie środków
    if (this.resourceSystem && hasKeys(actualCost) && !this.resourceSystem.canAfford(actualCost)) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: 'Brak surowców' });
      return;
    }

    // Sprawdzenie POPów
    const popCost = building.popCost ?? POP_PER_BUILDING;
    if (popCost > 0) {
      const civSys = this.civSystem;
      if (civSys && civSys.freePops < popCost) {
        EventBus.emit('planet:buildResult', {
          success: false, tile, reason: `Brak wolnych POPów (potrzeba ${popCost})`,
        });
        return;
      }
    }

    // Pobierz koszt
    if (this.resourceSystem && hasKeys(actualCost)) {
      this.resourceSystem.spend(actualCost);
    }

    // Ustaw budynek na hexie
    if (isCapital) {
      tile.capitalBase = true;
    } else {
      tile.buildingId = buildingId;
      tile.buildingLevel = 1;
    }

    // Oblicz stawki produkcji
    const level = 1;
    const baseRates      = this._calcBaseRates(building, tile, level);
    const effectiveRates = this._applyTechMultipliers(baseRates, building);

    const activeKey  = isCapital ? `capital_${tile.key}` : tile.key;
    const producerId = isCapital ? `capital_${tile.key}` : `building_${tile.key}`;

    // Zarejestruj produkcję (energia rejestrowana jako flow)
    if (hasKeys(effectiveRates)) {
      EventBus.emit('resource:registerProducer', { id: producerId, rates: effectiveRates });
    }

    // Bonus pojemnościowy (Magazyn) — pominięty: inventory jest nieograniczone

    // Housing
    if (building.housing > 0) {
      EventBus.emit('civ:addHousing', { amount: building.housing });
    }

    // Fabryka: dodaj punkt produkcji
    if (buildingId === 'factory' && this._factorySystem) {
      this._factorySystem.setTotalPoints(this._factorySystem.totalPoints + 1);
    }

    // Zapamiętaj aktywny budynek (producerId cachowany dla szybkiego dostępu)
    this._active.set(activeKey, {
      building, baseRates, effectiveRates,
      housing: building.housing,
      popCost,
      level,
      producerId,
    });

    // Zatrudnienie
    if (popCost > 0) {
      EventBus.emit('civ:employmentChanged', { delta: popCost });
    }

    // Invaliduj cache mine level jeśli zbudowano kopalnię
    if (building.isMine || buildingId === 'mine') this._mineLevelDirty = true;

    EventBus.emit('planet:buildResult', { success: true, tile, buildingId });
  }

  // ── Ulepszenie budynku ──────────────────────────────────────────────────

  _upgrade(tile) {
    if (!tile.isOccupied) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: 'Brak budynku' });
      return;
    }

    const entry = this._active.get(tile.key);
    if (!entry) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: 'Brak aktywnego budynku' });
      return;
    }

    const building = entry.building;
    const currentLevel = entry.level || 1;
    const maxLevel = this.getMaxLevel();

    if (currentLevel >= maxLevel) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: `Max poziom (${maxLevel})` });
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

    if (this.resourceSystem && hasKeys(upgradeCost) && !this.resourceSystem.canAfford(upgradeCost)) {
      EventBus.emit('planet:upgradeResult', { success: false, tile, reason: 'Brak surowców na ulepszenie' });
      return;
    }

    // Sprawdzenie wolnych POPów (upgrade wymaga dodatkowego popCost)
    const popCost = entry.popCost ?? building.popCost ?? POP_PER_BUILDING;
    if (popCost > 0) {
      const civSys = this.civSystem;
      if (civSys && civSys.freePops < popCost) {
        EventBus.emit('planet:upgradeResult', {
          success: false, tile, reason: `Brak wolnych POPów (potrzeba ${popCost})`,
        });
        return;
      }
    }

    // Pobierz koszt
    if (this.resourceSystem && hasKeys(upgradeCost)) {
      this.resourceSystem.spend(upgradeCost);
    }

    // Zatrudnienie — upgrade wymaga dodatkowego POPa
    if (popCost > 0) {
      EventBus.emit('civ:employmentChanged', { delta: popCost });
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
      EventBus.emit('civ:addHousing', { amount: building.housing });
    }

    // Fabryka: dodaj punkt produkcji za każdy level powyżej 1
    if (building.id === 'factory' && this._factorySystem) {
      // Recalc total points: zlicz wszystkie fabryki × level
      this._recalcFactoryPoints();
    }

    // Invaliduj cache mine level jeśli ulepszono kopalnię
    if (building.id === 'mine' || building.isMine) this._mineLevelDirty = true;

    EventBus.emit('planet:upgradeResult', { success: true, tile, level: nextLevel });
  }

  // ── Rozbiórka ───────────────────────────────────────────────────────────

  _demolish(tile) {
    if (!tile.isOccupied) {
      EventBus.emit('planet:demolishResult', { success: false, tile, reason: 'Brak budynku' });
      return;
    }

    const buildingDef = BUILDINGS[tile.buildingId];
    if (buildingDef?.isColonyBase || buildingDef?.isCapital) {
      EventBus.emit('planet:demolishResult', { success: false, tile, reason: 'Stolica jest niezbywalna' });
      return;
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
        EventBus.emit('civ:removeHousing', { amount: building.housing });
      }

      // Zwolnij POPy za obniżony poziom
      const downgradePop = entry.popCost ?? building?.popCost ?? POP_PER_BUILDING;
      if (downgradePop > 0) {
        EventBus.emit('civ:employmentChanged', { delta: -downgradePop });
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

    EventBus.emit('resource:removeProducer', { id: `building_${tile.key}` });

    // Zwrot pojemności (Magazyn) — pominięty: inventory jest nieograniczone

    // Housing
    if (entry?.housing > 0) {
      EventBus.emit('civ:removeHousing', { amount: entry.housing });
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

    // Zwolnij POPy
    const popCost = entry?.popCost ?? building?.popCost ?? POP_PER_BUILDING;
    if (popCost > 0) {
      EventBus.emit('civ:employmentChanged', { delta: -popCost });
    }

    // Invaliduj cache mine level jeśli rozebrano kopalnię
    if (buildingId === 'mine' || building?.isMine) this._mineLevelDirty = true;

    tile.buildingId = null;
    tile.buildingLevel = 1;
    this._active.delete(tile.key);

    EventBus.emit('planet:demolishResult', { success: true, tile, buildingId });
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
      const popCost    = b.popCost ?? building.popCost ?? POP_PER_BUILDING;
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
      if (!tile.isOccupied) return;
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

  // ── Prywatne ────────────────────────────────────────────────────────────

  _canBuildOnTile(tile, building) {
    const terrain = TERRAIN_TYPES[tile.type];
    if (!terrain?.buildable) return false;
    if (tile.damaged)        return false;
    if (building.terrainOnly) return building.terrainOnly.includes(tile.type);
    if (building.terrainAny) return true;
    return terrain.allowedCategories.includes(building.category);
  }

  // Oblicz stawki bazowe z uwzględnieniem poziomu budynku
  // Efekt poziomu: rate × level (liniowy — upgrade podwaja produkcję)
  _calcBaseRates(building, tile, level = 1) {
    const hasRates = building.rates && hasKeys(building.rates);
    const hasEnergyCost = building.energyCost && building.energyCost > 0;

    // Jeśli brak rates I brak energyCost → naprawdę puste
    if (!hasRates && !hasEnergyCost) return {};

    const terrain = TERRAIN_TYPES[tile.type];
    const bonuses = terrain?.yieldBonus ?? {};
    const multiplier = bonuses[building.category] ?? bonuses.default ?? 1.0;

    const latMod = this._gridHeight > 0
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
          // Konsumpcja rośnie z levelem: 1 + 0.25 × (level-1)
          const consLevelMult = 1 + 0.25 * (level - 1);
          base[key] = val * consLevelMult;
        } else {
          base[key] = val * multiplier * latMod.production * levelMult;
        }
      }
    }

    // Dodatkowa konsumpcja energii (energyCost z definicji budynku)
    if (hasEnergyCost) {
      const consLevelMult = 1 + 0.25 * (level - 1);
      base.energy = (base.energy ?? 0) - building.energyCost * consLevelMult;
    }

    return base;
  }

  _applyTechMultipliers(baseRates, building) {
    if (!hasKeys(baseRates)) return {};

    const empPenalty = this.civSystem?.employmentPenalty ?? 1.0;

    const effective = {};
    for (const key in baseRates) {
      const val = baseRates[key];
      if (val > 0) {
        const techMult = this.techSystem?.getProductionMultiplier(key) ?? 1.0;
        effective[key] = val * techMult * this._civPenalty * empPenalty;
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
      const newEffective = this._applyTechMultipliers(entry.baseRates, entry.building);
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
