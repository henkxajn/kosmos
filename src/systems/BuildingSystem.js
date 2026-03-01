// BuildingSystem — logika budowania i zarządzania instalacjami na mapie hex
//
// Odbiera żądania budowy z PlanetScene przez EventBus.
// Sprawdza warunki (teren, środki), pobiera koszt, rejestruje produkcję.
//
// Komunikacja:
//   Nasłuchuje: 'planet:buildRequest'  { tile, buildingId }
//               'planet:demolishRequest' { tile }
//   Emituje:    'planet:buildResult'   { success, tile, buildingId, reason }
//               'planet:demolishResult'{ success, tile, reason }
//               'resource:registerProducer' → do ResourceSystem
//               'resource:removeProducer'   → do ResourceSystem
//               'civ:addHousing'            → do CivilizationSystem
//               'civ:removeHousing'         → do CivilizationSystem
//
// resourceSystem i civSystem są opcjonalne — budynek zostanie postawiony wizualnie
// nawet bez aktywnych systemów (stosowane przy testowaniu przed etapem 6.8)

import EventBus from '../core/EventBus.js';
import { BUILDINGS }      from '../data/BuildingsData.js';
import { TERRAIN_TYPES }  from '../map/HexTile.js';
import { TECHS }          from '../data/TechData.js';
import { HexGrid }        from '../map/HexGrid.js';
import { POP_PER_BUILDING } from '../systems/CivilizationSystem.js';

export class BuildingSystem {
  // resourceSystem: instancja ResourceSystem (opcjonalna — może być null w testach)
  // civSystem:      instancja CivilizationSystem (opcjonalna)
  // techSystem:     instancja TechSystem (opcjonalna — mnożniki technologii)
  constructor(resourceSystem = null, civSystem = null, techSystem = null) {
    this.resourceSystem = resourceSystem;
    this.civSystem      = civSystem;
    this.techSystem     = techSystem;

    // Rejestr aktywnych producentów:
    //   tileKey → { building, baseRates, effectiveRates, housing }
    //   baseRates:     stawki z bonusem terenu + debuff polarny (bez tech)
    //   effectiveRates: baseRates × mnożniki technologii (to idzie do ResourceSystem)
    this._active = new Map();

    // Wysokość siatki (do obliczania modyfikatora polarnego)
    this._gridHeight = 0;

    // Guard: tylko aktywna kolonia przetwarza żądania budowy/rozbiórki
    EventBus.on('planet:buildRequest', ({ tile, buildingId }) => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._build(tile, buildingId);
    });

    EventBus.on('planet:demolishRequest', ({ tile }) => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._demolish(tile);
    });

    // Po zbadaniu technologii przelicz effectiveRates wszystkich budynków
    // BEZ guardu — tech jest globalne, wszystkie kolonie muszą przeliczyć stawki
    EventBus.on('tech:researched', () => this._reapplyAllRates());

    // Kara efficiency podczas niepokojów społecznych (−30% produkcji przez 10 lat)
    this._civPenalty = 1.0;  // 1.0 = brak kary, 0.7 = −30%
    EventBus.on('civ:unrest', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._civPenalty = 0.7; this._reapplyAllRates();
    });
    EventBus.on('civ:unrestLifted', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._civPenalty = 1.0; this._reapplyAllRates();
    });

    // Przelicz raty po zmianie populacji (employmentPenalty może się zmienić)
    // Guard: civ:popBorn/popDied emitowane tylko przez aktywną kolonię
    EventBus.on('civ:popBorn', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._reapplyAllRates();
    });
    EventBus.on('civ:popDied', () => {
      if (window.KOSMOS?.buildingSystem !== this) return;
      this._reapplyAllRates();
    });
  }

  // ── Budowa ────────────────────────────────────────────────────────────────

  _build(tile, buildingId) {
    const building = BUILDINGS[buildingId];
    if (!building) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: 'Nieznany budynek' });
      return;
    }

    // Stolica (colony_base) — wirtualny budynek, nie blokuje hexa
    const isCapital = !!building.isCapital;

    // Pole zajęte (pomijaj dla Stolicy — ona nie blokuje)
    if (!isCapital && tile.isOccupied) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: 'Pole zajęte' });
      return;
    }

    // Sprawdzenie terenu
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

    // Modyfikator polarny — droższy koszt budowy przy biegunach
    const latMod = this._gridHeight > 0
      ? HexGrid.getLatitudeModifier(tile.r, this._gridHeight)
      : { production: 1.0, buildCost: 1.0, label: null };

    // Oblicz faktyczny koszt (z modyfikatorem polarnym)
    const actualCost = {};
    for (const [k, v] of Object.entries(building.cost)) {
      actualCost[k] = Math.ceil(v * latMod.buildCost);
    }

    // Sprawdzenie środków
    if (this.resourceSystem && !this.resourceSystem.canAfford(actualCost)) {
      EventBus.emit('planet:buildResult', { success: false, tile, reason: 'Brak surowców' });
      return;
    }

    // Sprawdzenie dostępności POPów (siła robocza)
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

    // Pobierz koszt (z modyfikatorem polarnym)
    if (this.resourceSystem) {
      this.resourceSystem.spend(actualCost);
    }

    // Stolica: wirtualny budynek — NIE ustawiaj buildingId, ustaw flagę capitalBase
    if (isCapital) {
      tile.capitalBase = true;
      // tile.buildingId pozostaje null — hex wolny do budowy innego budynku
    } else {
      tile.buildingId = buildingId;
    }

    // Oblicz stawki: najpierw base (tylko teren), potem effective (teren × tech)
    const baseRates      = this._calcBaseRates(building, tile);
    const effectiveRates = this._applyTechMultipliers(baseRates, building);

    // Stolica: specjalny klucz (capital_Q,R) aby nie kolidować z budynkiem na tym hexie
    const activeKey  = isCapital ? `capital_${tile.key}` : tile.key;
    const producerId = isCapital ? `capital_${tile.key}` : `building_${tile.key}`;

    // Zarejestruj produkcję/konsumpcję w ResourceSystem
    if (Object.keys(effectiveRates).length > 0) {
      EventBus.emit('resource:registerProducer', { id: producerId, rates: effectiveRates });
    }

    // Bonus pojemnościowy (Magazyn)
    if (building.capacityBonus && this.resourceSystem) {
      for (const [key, delta] of Object.entries(building.capacityBonus)) {
        const current = this.resourceSystem.resources[key]?.capacity ?? 0;
        this.resourceSystem.setCapacity(key, current + delta);
      }
    }

    // Miejsca mieszkalne (Habitat)
    if (building.housing > 0) {
      EventBus.emit('civ:addHousing', { amount: building.housing });
    }

    // Zapamiętaj aktywny budynek
    this._active.set(activeKey, { building, baseRates, effectiveRates, housing: building.housing, popCost });

    // Powiadom CivSystem o zatrudnieniu POPa
    if (popCost > 0) {
      EventBus.emit('civ:employmentChanged', { delta: popCost });
    }

    EventBus.emit('planet:buildResult', { success: true, tile, buildingId });
  }

  // ── Rozbiórka ─────────────────────────────────────────────────────────────

  _demolish(tile) {
    if (!tile.isOccupied) {
      EventBus.emit('planet:demolishResult', { success: false, tile, reason: 'Brak budynku' });
      return;
    }

    // Stolica jest niezbywalna — nie można jej rozebrać
    const buildingDef = BUILDINGS[tile.buildingId];
    if (buildingDef?.isColonyBase || buildingDef?.isCapital) {
      EventBus.emit('planet:demolishResult', { success: false, tile, reason: 'Stolica jest niezbywalna' });
      return;
    }

    const entry     = this._active.get(tile.key);
    const buildingId = tile.buildingId;
    const building  = BUILDINGS[buildingId];

    // Usuń rejestrację produkcji
    EventBus.emit('resource:removeProducer', { id: `building_${tile.key}` });

    // Zwróć pojemność (Magazyn)
    if (building?.capacityBonus && this.resourceSystem) {
      for (const [key, delta] of Object.entries(building.capacityBonus)) {
        const current = this.resourceSystem.resources[key]?.capacity ?? 0;
        this.resourceSystem.setCapacity(key, Math.max(0, current - delta));
      }
    }

    // Usuń miejsca mieszkalne (Habitat)
    if (entry?.housing > 0) {
      EventBus.emit('civ:removeHousing', { amount: entry.housing });
    }

    // Zwrot 50% kosztu budowy (ograniczone do pojemności magazynu)
    if (building?.cost && this.resourceSystem) {
      const refund = {};
      for (const [k, v] of Object.entries(building.cost)) {
        refund[k] = Math.floor(v * 0.5);
      }
      this.resourceSystem.receive(refund);
    }

    // Zwolnij POPy z zatrudnienia
    const popCost = entry?.popCost ?? building?.popCost ?? POP_PER_BUILDING;
    if (popCost > 0) {
      EventBus.emit('civ:employmentChanged', { delta: -popCost });
    }

    tile.buildingId = null;
    this._active.delete(tile.key);

    EventBus.emit('planet:demolishResult', { success: true, tile, buildingId });
  }

  // ── Przywracanie zapisanego stanu ─────────────────────────────────────────

  // Po wczytaniu save z localStorage: przywróć produkcję ze zapisanych stawek
  // (stawki są gotowe z zapisu — nie wymagają ponownego obliczania z terenu)
  restoreFromSave(buildings) {
    let totalPopCost = 0;

    for (const b of buildings) {
      const building = BUILDINGS[b.buildingId];
      if (!building) continue;

      const isCapital = !!building.isCapital;

      // Jeśli save ma baseRates — użyj ich; fallback: effectiveRates (stary format save)
      const baseRates      = b.baseRates      || b.effectiveRates || {};
      const effectiveRates = this._applyTechMultipliers(baseRates, building);

      // Stolica: specjalny klucz i producerId (capital_Q,R)
      const activeKey  = isCapital ? (b.tileKey.startsWith('capital_') ? b.tileKey : `capital_${b.tileKey}`) : b.tileKey;
      const producerId = isCapital ? `capital_${b.tileKey.replace('capital_', '')}` : `building_${b.tileKey}`;
      const popCost    = b.popCost ?? building.popCost ?? POP_PER_BUILDING;

      if (Object.keys(effectiveRates).length > 0 && this.resourceSystem) {
        this.resourceSystem.registerProducer(producerId, effectiveRates);
      }
      this._active.set(activeKey, {
        building,
        baseRates,
        effectiveRates,
        housing: b.housing || 0,
        popCost,
      });
      totalPopCost += popCost;
    }

    // Powiadom CivSystem o sumarycznym zatrudnieniu (po przywróceniu wszystkich budynków)
    // Używamy bezpośredniej modyfikacji zamiast EventBus (per-kolonia restore)
    if (totalPopCost > 0 && this.civSystem) {
      this.civSystem._employedPops = Math.max(0, this.civSystem._employedPops + totalPopCost);
    }
  }

  // Po wczytaniu save: przywróć produkcję dla wszystkich zajętych pól
  restoreFromGrid(grid) {
    grid.forEach(tile => {
      if (!tile.isOccupied) return;
      const building = BUILDINGS[tile.buildingId];
      if (!building) return;

      const baseRates      = this._calcBaseRates(building, tile);
      const effectiveRates = this._applyTechMultipliers(baseRates, building);
      const producerId     = `building_${tile.key}`;

      if (Object.keys(effectiveRates).length > 0 && this.resourceSystem) {
        this.resourceSystem.registerProducer(producerId, effectiveRates);
      }
      if (building.housing > 0) {
        // Nie emitujemy civ:addHousing — CivilizationSystem ma już housing z save
      }
      this._active.set(tile.key, {
        building, baseRates, effectiveRates,
        housing: building.housing,
        popCost: building.popCost ?? POP_PER_BUILDING,
      });
    });
  }

  // ── Serializacja budynków (per-kolonia) ────────────────────────────────────

  serialize() {
    const buildings = [];
    this._active.forEach((entry, tileKey) => {
      buildings.push({
        tileKey,
        buildingId:     entry.building.id,
        baseRates:      { ...(entry.baseRates      || {}) },
        effectiveRates: { ...(entry.effectiveRates || {}) },
        housing:        entry.housing || 0,
        popCost:        entry.popCost ?? 0.25,
      });
    });
    return buildings;
  }

  // ── Prywatne ──────────────────────────────────────────────────────────────

  // Sprawdź czy budynek może stanąć na tym polu
  _canBuildOnTile(tile, building) {
    const terrain = TERRAIN_TYPES[tile.type];
    if (!terrain?.buildable) return false;
    if (tile.damaged)        return false;

    // Budynek specjalny dla konkretnego terenu
    if (building.terrainOnly) {
      return building.terrainOnly.includes(tile.type);
    }
    // Budynek na każdym buildable terenie
    if (building.terrainAny) return true;

    // Standardowe sprawdzenie kategorii
    return terrain.allowedCategories.includes(building.category);
  }

  // Oblicz stawki bazowe: bonus terenu × modyfikator polarny (bez mnożników technologii)
  _calcBaseRates(building, tile) {
    if (!building.rates || Object.keys(building.rates).length === 0) return {};

    const terrain = TERRAIN_TYPES[tile.type];
    const bonuses = terrain?.yieldBonus ?? {};
    // Bonus dla kategorii budynku; fallback na 'default' lub 1.0
    const multiplier = bonuses[building.category] ?? bonuses.default ?? 1.0;

    // Modyfikator polarny — niższa produkcja przy biegunach
    const latMod = this._gridHeight > 0
      ? HexGrid.getLatitudeModifier(tile.r, this._gridHeight)
      : { production: 1.0, buildCost: 1.0, label: null };

    const base = {};
    for (const [key, val] of Object.entries(building.rates)) {
      if (key === 'research') {
        // Research przekazywany bez mnożnika terenu, ale z modyfikatorem polarnym
        base[key] = val * latMod.production;
      } else if (val < 0) {
        // Konsumpcja nie jest wzmacniana przez bonus terenu ani debuff polarny
        base[key] = val;
      } else {
        base[key] = val * multiplier * latMod.production;
      }
    }
    return base;
  }

  // Zastosuj mnożniki technologii + karę cywilizacyjną + karę zatrudnienia
  // Produkcja (val > 0): × techMult × civPenalty × employmentPenalty
  // Konsumpcja (val < 0): × consumptionMult (kary NIE zwiększają konsumpcji)
  _applyTechMultipliers(baseRates, building) {
    if (Object.keys(baseRates).length === 0) return {};

    // Kara za niedobór POPów: gdy zatrudniono więcej niż jest ludzi
    // Używamy this.civSystem (per-kolonia), nie window.KOSMOS.civSystem
    const empPenalty = this.civSystem?.employmentPenalty ?? 1.0;

    const effective = {};
    for (const [key, val] of Object.entries(baseRates)) {
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

  // Przelicz effectiveRates wszystkich aktywnych budynków po nowej technologii
  // i zaktualizuj rejestrację w ResourceSystem
  // Używa this.resourceSystem.registerProducer() bezpośrednio (nie EventBus),
  // aby per-kolonia BuildingSystem aktualizował swoją własną powiązaną ResourceSystem
  _reapplyAllRates() {
    for (const [activeKey, entry] of this._active) {
      const newEffective = this._applyTechMultipliers(entry.baseRates, entry.building);
      entry.effectiveRates = newEffective;

      // Stolica: klucz zaczyna się od 'capital_' → producerId = activeKey
      const producerId = activeKey.startsWith('capital_') ? activeKey : `building_${activeKey}`;
      if (Object.keys(newEffective).length > 0 && this.resourceSystem) {
        this.resourceSystem.registerProducer(producerId, newEffective);
      }
    }
  }
}
