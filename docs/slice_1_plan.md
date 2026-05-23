# KOSMOS — Slice 1: AI Empire ECS Economy (v3)

## Status

**v3** — po Fazie 0 (recon). Adresuje 8 issues znalezionych w istniejącym kodzie. Główne zmiany vs v2:

- Safety stock jest w `FactorySystem._demandBonus`, nie `colony.safetyStock`. Dostęp przez `factorySystem.getSafetyStockTarget()` / `setDemandBonus()`.
- `inventory` to **Map** na `colony.resourceSystem.inventory`, nie obiekt na `colony.inventory`.
- `preferredTerrain` wymaga rozszerzenia `autoPlaceBuilding(buildingId, opts)` — nie istnieje w obecnym API.
- AI używa `autoPlaceBuilding` dla startowych budynków, bezpośredniego `aiColony.buildingSystem._build()` dla budowy w trakcie gry.
- 4 metody w `ColonyManager` wymagają filtra `colony.ownerEmpireId === null`.
- `EconomySandboxScene` uruchamiana przez menu button w `TitleScene`, nie URL query string.
- `civ:popBorn` ma guard — AI musi forsować `_reapplyAllRates()` co tactical tick.
- Stary `spawnFleet()` call w `EmpireGenerator` musi być explicit usunięty.

## Przeczytaj NAJPIERW całość przed implementacją

Slice 1 podzielony na **3 fazy** (Faza 0 już wykonana). Implementujesz fazę po fazie, po każdej czekasz na potwierdzenie od użytkownika. Każda faza ma test akceptacyjny.

## Kontekst architektoniczny — "cicha hybryda"

Imperium AI używa **tych samych klas i systemów co gracz** dla wszystkich danych ECS: `ColonyManager`, `BuildingSystem`, `ResourceSystem`, `CivilizationSystem`, `FactorySystem`, hex maps, POPy, inventory, build queue, **safety stock + production split**.

Każda kolonia ma już **własne instancje** wszystkich tych systemów (zweryfikowane w Fazie 0). `time:tick` handlery większości systemów nie mają guarda — kolonie AI będą tickować automatycznie po normalnym game loop.

**Decyzje** AI są podejmowane na **strategicznym poziomie abstract**: AI decyduje "podnieś safety stock structural_alloys do 30 (bonus +27 do base 3)", nie "ustaw fabrykę_1 żeby produkowała 50% structural_alloys". Production split jest **emergent w game engine** — `FactorySystem` w reactive mode dzieli moce między commodities w deficycie.

Konsekwencja dla AI w Slice 1:
- AI ma **jedną decyzję ekonomiczną** per kolonia: jak ustawić safety stocki (przez `setDemandBonus`).
- AI ma **jedną decyzję budowlaną** per kolonia: co następnego zbudować.
- AI ma **jedną decyzję strategiczną** per imperium: jaki focus mieć.
- Reszta dzieje się automatycznie przez istniejący game engine.

Konsekwencja dla gracza:
- Gracz może zaszpiegować planetę AI, zobaczyć jej mapę heksową, podbić ją i przejąć budynki 1:1.
- Gracz w intel widzi safety stocki AI — silny strategic signal.

## API które AI musi używać (zweryfikowane w Fazie 0)

**Inventory** (read):
```js
const C = colony.resourceSystem.inventory.get('C') ?? 0;
const food = colony.resourceSystem.inventory.get('food') ?? 0;
```

**Safety stock** (read + write):
```js
// Read:
const target = colony.factorySystem.getSafetyStockTarget('structural_alloys');  // base + bonus
const bonus = colony.factorySystem.getDemandBonus('structural_alloys');         // tylko bonus

// Write:
colony.factorySystem.setDemandBonus('structural_alloys', 27);
// → getSafetyStockTarget zwraca 30 (3 base dla tier 1-2 + 27 bonus)
```

**Building**:
```js
// Bootstrap (startowe budynki AI, instant, free, no-tech-check):
colony.buildingSystem.autoPlaceBuilding(buildingId, { preferredTerrain: ['mountains', 'crater'] });
// ← preferredTerrain to nowa funkcjonalność dodawana w Fazie 1

// Budowa w trakcie gry (przechodzi przez normalny construction queue + surowce + tech check):
colony.buildingSystem._build(tile, buildingId);
// ← bypass event guard. Zostaw komentarz "AI access, bypasses event-based guard"
```

**POP refresh** (wymagane co tactical tick dla AI):
```js
// civ:popBorn ma guard window.KOSMOS.buildingSystem !== this w BuildingSystem L119-126.
// Kolonia AI nie odświeży reaktywnie labor efficiency.
// Wymuś co tactical tick:
aiColony.buildingSystem._reapplyAllRates();
```

## Co Slice 1 robi

Imperium AI typu Industrialist z lekkim handicapem startowym. AI żyje ekonomicznie, rozbudowuje budynki, dostraja safety stocki zgodnie ze strategią. Gracz może to wszystko zaszpiegować przez intel.

## Co Slice 1 NIE robi (out-of-scope)

- Brak ekspansji — AI ma 1 kolonię startową, nie zakłada nowych. Slice 2.
- Brak proaktywnej dyplomacji. Slice 3.
- Brak produkcji statków — stocznia istnieje fizycznie (z handicapu) ale nie produkuje. Slice 4.
- Brak nowych typów budynków — AI używa 59 istniejących budynków gracza.
- Brak nowych surowców/towarów — 13 surowców + 23 towary + credits.
- Brak per-hex AI decision making — `ColonyAutoPlanner` decyduje per-hex.
- Brak nowej mechaniki safety stock — używamy `FactorySystem.setDemandBonus`.
- Brak GOAP, BehaviorTree — Utility AI z constraintami osobowości.
- Brak wstecznej kompatybilności save'ów — clean break v75 → v76.
- Brak modyfikacji core'a systemów gracza poza explicite zatwierdzonymi hookami.

---

# FAZA 1 — Fundament ECS dla imperium AI

## Cel

Imperium AI dostaje przy starcie **realną kolonię** (typu `Colony` przez `ColonyManager.createColony()`) z lekkim handicapem startowym. Kolonia żyje — produkuje, konsumuje, populacja rośnie, fabryka działa reaktywnie. Bez AI decision making jeszcze.

## Modyfikacje istniejących systemów

### `src/systems/BuildingSystem.js` — rozszerzenie `autoPlaceBuilding`

Aktualne API (z Fazy 0): `autoPlaceBuilding(buildingId)` bierze pierwszy wolny hex spełniający `BUILDINGS[id].allowedTerrain`.

Nowe API: `autoPlaceBuilding(buildingId, opts = {})` z opcjonalnym `opts.preferredTerrain`:

```js
autoPlaceBuilding(buildingId, opts = {}) {
  const { preferredTerrain = [] } = opts;
  const building = BUILDINGS[buildingId];
  if (!building) return false;
  const grid = this._grid;
  if (!grid || typeof grid.forEach !== 'function') return false;

  let placedKey = null, placedTile = null;
  
  // Pass 1: szukaj hexu z preferredTerrain
  if (preferredTerrain.length > 0) {
    grid.forEach(tile => {
      if (placedKey) return;
      if (tile.buildingId || tile.capitalBase || tile.underConstruction) return;
      if (!preferredTerrain.includes(tile.terrain)) return;
      const allowed = building.allowedTerrain;
      if (allowed && !allowed.includes(tile.terrain)) return;
      placedKey = tile.key ?? `${tile.q},${tile.r}`;
      placedTile = tile;
    });
  }
  
  // Pass 2: fallback do dowolnego allowedTerrain (istniejące zachowanie)
  if (!placedTile) {
    grid.forEach(tile => {
      if (placedKey) return;
      if (tile.buildingId || tile.capitalBase || tile.underConstruction) return;
      const allowed = building.allowedTerrain;
      if (allowed && !allowed.includes(tile.terrain)) return;
      placedKey = tile.key ?? `${tile.q},${tile.r}`;
      placedTile = tile;
    });
  }
  
  if (!placedTile) return false;
  // ... reszta zostaje: tile.buildingId / capitalBase, _activateBuilding()
}
```

**Backward compat**: gdy `opts` nie podane, zachowanie identyczne jak wcześniej. Istniejące callery (`colony_base`, `launch_pad`, `solar_farm` w `ColonyManager._onColonyFounded`) działają bez zmian.

### `src/systems/ColonyManager.js` — hook `ownerEmpireId` + filtry

**Dodać pole `ownerEmpireId`** do struktury kolonii w `createColony()` i `registerHomePlanet()`. Domyślnie `null` (kolonia gracza).

```js
// W obu funkcjach kreacyjnych:
const colony = {
  ...
  ownerEmpireId: null,  // <-- nowe pole, AI nadpisze przez EmpireRegistry.addColony()
  ...
};
```

**Dodać `getPlayerColonies()`** jako filtrowaną wersję `getAllColonies()`:
```js
getPlayerColonies() {
  return Array.from(this._colonies.values()).filter(c => c.ownerEmpireId === null);
}
```

Zostaw `getAllColonies()` bez filtra — niektóre callery (stats) chcą wszystkich.

**Dodać filtry `ownerEmpireId === null` w 3 metodach**:

1. `_applyTaxes()` (L1406-1438) — początek pętli:
```js
for (const colony of this._colonies.values()) {
  if (colony.ownerEmpireId !== null) continue;  // <-- skip AI colonies
  // ... reszta bez zmian
}
```

2. `_autoCreateTradeRoutes()` (L2099-2106) — analogicznie.

3. `_checkMigration()` (L1840-1869) — analogicznie. Migracje wewnątrz gracza, AI ma swoje (off-scope dla Slice 1).

**Nie filtrować** następujących (AI w Slice 1 ma puste queues → no-op):
- `_tickShipBuilds`
- `_tickGroundUnitBuilds`
- `_tickGroundUnitUpkeep`
- `_tickPendingShipOrders`
- `_tickPendingOutpostOrders`

## Pliki do utworzenia

### `src/data/EmpireArchetypeIndustrialist.js`

```js
export const INDUSTRIALIST = {
  id: 'industrialist',
  namePL: 'Industrialista',
  nameEN: 'Industrialist',
  descPL: 'Cywilizacja oparta na produkcji i handlu. Buduje fabryki, gromadzi towary, rozwija się stabilnie.',
  descEN: 'Production and trade focused civilization. Builds factories, stockpiles commodities, grows steadily.',
  color: '#CD7F32',  // bronze — można dostosować
  personality: {
    aggression: 0.3,
    expansion: 0.7,
    secrecy: 0.2,
    trade: 0.9,
    science: 0.6
  },
  strategicPriorities: {
    raw_extraction: 1.0,
    commodity_production: 0.9,
    self_sufficiency: 0.8,
    civilian_logistics: 0.7,
    defense: 0.3,
    science: 0.5,
    military_buildup: 0.1
  },
  startingBuildings: [
    { buildingId: 'colony_base', count: 1 },
    { buildingId: 'habitat', count: 2 },
    { buildingId: 'launch_pad', count: 1 },
    { buildingId: 'shipyard', count: 1 },
    { buildingId: 'factory', count: 1 },
    { buildingId: 'mine', count: 1, preferredTerrain: ['mountains', 'crater'] },
    { buildingId: 'farm', count: 1, preferredTerrain: ['plains', 'forest'] },
    { buildingId: 'well', count: 1 },
    { buildingId: 'solar_farm', count: 3, level: 3 }
  ],
  startingPops: {
    laborer: 8, miner: 2, worker: 2, scientist: 1,
    merchant: 1, engineer: 1, bureaucrat: 1
  },
  startingResources: {
    C: 200, Fe: 200, Si: 100, Cu: 80, food: 150, water: 150,
    credits: 1000
  },
  // Bonus do safety stock (base jest hardcoded w FactorySystem: tier 1-2 = 3, tier 3-5 = 1)
  // Wartości tu to bonus który będzie ustawiony przez setDemandBonus()
  startingSafetyStockBonus: {
    structural_alloys: 27,    // → target 30
    polymer_composites: 17,   // → target 20
    conductor_bundles: 17,    // → target 20
    extraction_systems: 12    // → target 15
  }
};
```

### `src/systems/EmpireColonyBootstrap.js`

```js
import { INDUSTRIALIST } from '../data/EmpireArchetypeIndustrialist.js';
import { EventBus } from '../core/EventBus.js';

const ARCHETYPES = {
  industrialist: INDUSTRIALIST
};

class EmpireColonyBootstrap {
  /**
   * Tworzy realną kolonię dla imperium AI.
   * @param {string} empireId
   * @param {string} archetypeId - 'industrialist' w Slice 1
   * @param {string} homeSystemId
   * @returns {string} colonyId
   */
  static bootstrapHomeColony(empireId, archetypeId, homeSystemId) {
    const archetype = ARCHETYPES[archetypeId];
    if (!archetype) throw new Error(`Unknown archetype: ${archetypeId}`);
    
    // 1. Stwórz kolonię przez normalny ColonyManager flow
    const colonyManager = window.KOSMOS.colonyManager;
    const colony = colonyManager.createColony({
      systemId: homeSystemId,
      // Wybierz planetę: pierwsza rocky w systemie
      planetId: this._pickHomePlanet(homeSystemId),
      isHomePlanet: false,  // gracz ma swoją home planet
      ownerEmpireId: empireId,  // <-- kluczowe
    });
    
    // 2. Zadeponuj startowe surowce do colony.resourceSystem.inventory (Map)
    for (const [resourceId, amount] of Object.entries(archetype.startingResources)) {
      if (resourceId === 'credits') {
        colony.credits = (colony.credits ?? 0) + amount;
        continue;
      }
      colony.resourceSystem.inventory.set(
        resourceId,
        (colony.resourceSystem.inventory.get(resourceId) ?? 0) + amount
      );
    }
    
    // 3. Dodaj POPy
    for (const [strata, count] of Object.entries(archetype.startingPops)) {
      for (let i = 0; i < count; i++) {
        colony.civilization.addPop(strata);
      }
    }
    
    // 4. Postaw startowe budynki przez autoPlaceBuilding
    const placementReport = this._placeStartingBuildings(colony, archetype.startingBuildings);
    
    // 5. Ustaw safety stock bonusy
    for (const [commodityId, bonus] of Object.entries(archetype.startingSafetyStockBonus)) {
      colony.factorySystem.setDemandBonus(commodityId, bonus);
    }
    
    // 6. Wymuszony recompute rates (POPy + buildings)
    colony.buildingSystem._reapplyAllRates();
    
    // 7. Log
    EventBus.emit('ai:empireBootstrap', {
      empireId,
      archetype: archetypeId,
      colonyId: colony.id,
      systemId: homeSystemId,
      buildingsPlaced: placementReport.placed,
      buildingsFailed: placementReport.failed
    });
    
    console.log(
      `Empire AI bootstrapped: ${archetypeId} on ${homeSystemId}, ` +
      `colony ${colony.id}, buildings: ${placementReport.placed}/${placementReport.attempted}`
    );
    
    return colony.id;
  }
  
  /**
   * Stawia startowe budynki via autoPlaceBuilding.
   * Każdy budynek dostaje instant placement (bez kolejki, bez kosztu, bez tech check).
   */
  static _placeStartingBuildings(colony, startingBuildings) {
    const report = { attempted: 0, placed: 0, failed: [] };
    
    for (const def of startingBuildings) {
      const count = def.count ?? 1;
      const opts = def.preferredTerrain 
        ? { preferredTerrain: def.preferredTerrain }
        : {};
      
      for (let i = 0; i < count; i++) {
        report.attempted++;
        const success = colony.buildingSystem.autoPlaceBuilding(def.buildingId, opts);
        if (success) {
          report.placed++;
          
          // Jeśli def.level > 1, upgrade do tego levelu
          if (def.level && def.level > 1) {
            this._upgradeBuilding(colony, def.buildingId, def.level);
          }
        } else {
          report.failed.push({ buildingId: def.buildingId, attempt: i + 1 });
        }
      }
    }
    
    return report;
  }
  
  static _upgradeBuilding(colony, buildingId, targetLevel) {
    // Znajdź budynek i podnieś jego level bezpośrednio (instant upgrade, bypass cost)
    const active = colony.buildingSystem._active || [];
    const recent = active.filter(b => b.buildingId === buildingId).slice(-1)[0];
    if (recent) {
      recent.level = targetLevel;
      colony.buildingSystem._reapplyAllRates();
    }
  }
  
  static _pickHomePlanet(systemId) {
    const galaxy = window.KOSMOS.galaxyData;
    const system = galaxy.systems.find(s => s.id === systemId);
    if (!system?.planets) return null;
    
    // Preferuj rocky, fallback do pierwszej planety
    const rocky = system.planets.find(p => p.type === 'rocky');
    return rocky?.id ?? system.planets[0]?.id ?? null;
  }
}

export { EmpireColonyBootstrap };
```

## Modyfikacje (kompletna lista)

### `src/generators/EmpireGenerator.js`

- L94: zamień losowanie `targetCount` na hardcoded `1` (Slice 1).
- L124-189: pętla per home system — zamień losowy archetyp na hardcoded `'industrialist'`.
- L183-189: **USUŃ** `empireRegistry.spawnFleet(empireId, { strength: ... })` call. Imperium AI w Slice 1 nie ma startowej floty.
- Usuń z payloadu `createEmpire()`: `military: { power }`, `resources: { production }`, `tech: { level, focus }`.
- Po `createEmpire()` wywołaj `EmpireColonyBootstrap.bootstrapHomeColony(empireId, 'industrialist', homeSystemId)`.

### `src/systems/EmpireRegistry.js`

- W `createEmpire()` (L57-84): usuń pola `military`, `resources`, `tech`.
- Usuń `_growAll(years)` (L236-255).
- Dodaj metodę:
```js
addColony(empireId, colonyId) {
  const empire = this.getEmpire(empireId);
  if (!empire) return false;
  if (!empire.colonies.includes(colonyId)) {
    empire.colonies.push(colonyId);
  }
  // Set ownerEmpireId na kolonii
  const colony = window.KOSMOS.colonyManager.getColony(colonyId);
  if (colony) colony.ownerEmpireId = empireId;
  return true;
}
```
- Zostaw `spawnFleet`, `moveFleet`, `destroyFleet` — dla późniejszych slice'ów.

### `src/scenes/GameScene.js`

- Linia ~93 (import EconAI): **usuń**.
- Linia ~357 (`window.KOSMOS.econAI = EconAI`): **usuń**.
- W bloku `if (isNewGame)` po `EmpireGenerator.generate()`, dodaj log podsumowujący (już jest w bootstrap, ale dla pewności w scene flow).

### `src/persistence/SaveMigration.js`

- `CURRENT_VERSION = 76` (z 75).
- Dodaj migrację v75 → v76 z `throw new Error('Save v75 incompatible with Slice 1. Empire AI rewritten. Please start new game.')`.

### `src/systems/ai/EconAI.js`

- **Usuń plik** lub zostaw z pustym `export {};` i komentarzem "Replaced by EmpireStrategicAI + EmpireStockpilePolicy + ColonyAutoPlanner in Slice 1".
- Usuń import z `src/systems/AlienCivSystem.js` L22.
- Usuń wywołanie `EconAI.tick()` z `_tickAll()` L102.

## Test akceptacyjny Fazy 1

Uruchom nową grę. W konsoli musi pojawić się log:
```
Empire AI bootstrapped: industrialist on <systemId>, colony <colonyId>, buildings: 11/11
```

Inspekcja w konsoli:
```js
const empireId = Object.keys(window.KOSMOS.gameState.empires)[0];
const empire = window.KOSMOS.empireRegistry.getEmpire(empireId);
const colonyId = empire.colonies[0];
const colony = window.KOSMOS.colonyManager.getColony(colonyId);

// Empire-level
console.log('Empire:', empire.name, empire.archetype, 'colonies:', empire.colonies);

// Colony-level (UWAGA: poprawne API)
console.log('Colony ownership:', colony.ownerEmpireId);
console.log('Population:', colony.civilization?.population);
console.log('Buildings:', colony.buildingSystem._active.length);
console.log('Building types:', colony.buildingSystem._active.map(b => b.buildingId));
console.log('Prosperity:', colony.prosperitySystem.prosperity);

// Resources (Map, nie obiekt)
console.log('Inventory C:', colony.resourceSystem.inventory.get('C'));
console.log('Inventory food:', colony.resourceSystem.inventory.get('food'));
console.log('Credits:', colony.credits);

// Safety stocks
console.log('Safety stock structural_alloys:', 
  colony.factorySystem.getSafetyStockTarget('structural_alloys'));
console.log('Demand bonus structural_alloys:', 
  colony.factorySystem.getDemandBonus('structural_alloys'));
```

Wymagania:
- `empire.archetype === 'industrialist'`
- `colony.ownerEmpireId === empireId`
- `colony.civilization.population` ~15-16
- `colony.buildingSystem._active.length >= 10` (11 startowych, ale 1-2 mogą się nie zmieścić jeśli mało hexów odpowiedniego terenu — to OK)
- `colony.resourceSystem.inventory.get('C') > 0`
- `colony.resourceSystem.inventory.get('food') > 0`
- `colony.factorySystem.getSafetyStockTarget('structural_alloys') === 30` (3 base + 27 bonus)
- `colony.prosperitySystem.prosperity >= 30`

Speed 5x, 30 sekund realnego czasu (~10 civYears in-game). Powtórz inspekcję:
- `population` rośnie.
- `inventory.get('C')`, `inventory.get('Fe')` rosną (mine pracuje).
- `inventory.get('food')` stabilne lub rosnące.
- `inventory.get('structural_alloys')` osiąga 30 i się zatrzymuje (fabryka działa reaktywnie, osiągnęła safety stock target).

Jeśli któryś warunek nie przejdzie — **stop, raport, NIE Faza 2**.

## Co Faza 1 NIE robi

- Nie pisze EmpireStrategicAI, EmpireStockpilePolicy, ColonyAutoPlanner — Faza 2.
- Nie modyfikuje IntelOverlay — Faza 3.
- Nie pisze EconomySandboxScene — Faza 3.

---

# FAZA 2 — Strategic AI brain + Auto-Planner + Stockpile Policy

## Cel

AI imperium decyduje trzy rzeczy:
1. **Strategic focus** (co 8 civYears): wybiera kategorię z priorytetów Industrialist.
2. **Safety stocks** per kolonia (co 4 civYears): podnosi/obniża `demandBonus` zgodnie z focus.
3. **Next building** per kolonia (co 1 civYear): proponuje budynek + hex przez `ColonyAutoPlanner`.

Plus wymuszony `_reapplyAllRates()` co tactical tick (workaround dla guarda na `civ:popBorn`).

## Architektura tempa

```
time:tick → AlienCivSystem._tickAll()
  → empireStrategicAI.tickIfDue(empireId)        [próg: 8 civYears]
  → empireStockpilePolicy.tickIfDue(empireId)    [próg: 4 civYears]
  → for each colony in empire.colonies:
      → colonyAutoPlanner.tickIfDue(colonyId)    [próg: 1 civYear]
      → aiColony.buildingSystem._reapplyAllRates()  [każdy tactical tick]
```

## Pliki do utworzenia

### `src/systems/ai/EmpireStrategicAI.js`

```js
import { EventBus } from '../../core/EventBus.js';
import { INDUSTRIALIST } from '../../data/EmpireArchetypeIndustrialist.js';

const ARCHETYPES = { industrialist: INDUSTRIALIST };
const STRATEGIC_TICK_INTERVAL = 8.0;  // civYears

class EmpireStrategicAI {
  constructor(empireRegistry) {
    this._empireRegistry = empireRegistry;
    this._accumulators = new Map();  // empireId -> civYears since last tick
  }
  
  /**
   * Called from AlienCivSystem._tickAll per civYear per empire.
   */
  tickIfDue(empireId, civDeltaYears = 1.0) {
    const acc = (this._accumulators.get(empireId) ?? 0) + civDeltaYears;
    if (acc < STRATEGIC_TICK_INTERVAL) {
      this._accumulators.set(empireId, acc);
      return;
    }
    this._accumulators.set(empireId, 0);
    this._strategicTick(empireId);
  }
  
  _strategicTick(empireId) {
    const empire = this._empireRegistry.getEmpire(empireId);
    if (!empire) return;
    
    const archetype = ARCHETYPES[empire.archetype];
    if (!archetype) return;
    
    const scores = this._computeDeficiencyScores(empire);
    
    // Multiply by archetype priorities
    const weightedScores = {};
    for (const [category, score] of Object.entries(scores)) {
      const priority = archetype.strategicPriorities[category] ?? 0;
      weightedScores[category] = score * priority;
    }
    
    // Pick top
    let topCategory = 'self_sufficiency';
    let topScore = -Infinity;
    for (const [cat, score] of Object.entries(weightedScores)) {
      if (score > topScore) {
        topScore = score;
        topCategory = cat;
      }
    }
    
    const oldFocus = empire.currentStrategy?.focus;
    const newFocus = topCategory;
    
    empire.currentStrategy = {
      focus: newFocus,
      startedYear: empire.year ?? 0,
      validUntil: (empire.year ?? 0) + STRATEGIC_TICK_INTERVAL,
      rationale: `score: ${topScore.toFixed(2)}`
    };
    
    if (oldFocus !== newFocus) {
      EventBus.emit('ai:strategicShift', {
        empireId,
        oldFocus,
        newFocus,
        rationale: empire.currentStrategy.rationale
      });
    }
  }
  
  _computeDeficiencyScores(empire) {
    return {
      raw_extraction: this._rawExtractionDeficit(empire),
      commodity_production: this._commodityProductionDeficit(empire),
      self_sufficiency: this._selfSufficiencyDeficit(empire),
      civilian_logistics: 0,    // Slice 1: 1 kolonia
      defense: 0,                // Slice 1: brak agresorów
      science: this._scienceDeficit(empire),
      military_buildup: 0        // Slice 1: out of scope
    };
  }
  
  _rawExtractionDeficit(empire) {
    // Per kolonia: czy produkcja podstawowych surowców (C, Fe) jest niska?
    const colony = this._getFirstColony(empire);
    if (!colony) return 0;
    
    const C = colony.resourceSystem.inventory.get('C') ?? 0;
    const Fe = colony.resourceSystem.inventory.get('Fe') ?? 0;
    const pop = colony.civilization.population;
    
    // Score wysoki gdy buffer surowców < 10 × population
    const target = pop * 10;
    const actual = C + Fe;
    if (actual >= target) return 0;
    return Math.min(1.0, (target - actual) / target);
  }
  
  _commodityProductionDeficit(empire) {
    const colony = this._getFirstColony(empire);
    if (!colony) return 0;
    
    // Score wysoki gdy mamy fabryki ale safety stocks tier 1 są niskie
    const factoryCount = colony.buildingSystem._active
      .filter(b => b.buildingId === 'factory').length;
    if (factoryCount === 0) return 0.5;  // chcemy fabryki ale ich nie mamy
    
    const structural = colony.factorySystem.getSafetyStockTarget('structural_alloys');
    // Jeśli target < 100 → możemy podnieść
    if (structural < 100) return 0.7;
    return 0.3;
  }
  
  _selfSufficiencyDeficit(empire) {
    const colony = this._getFirstColony(empire);
    if (!colony) return 0;
    
    const food = colony.resourceSystem.inventory.get('food') ?? 0;
    const water = colony.resourceSystem.inventory.get('water') ?? 0;
    const pop = colony.civilization.population;
    
    // Score wysoki gdy food lub water buffer < 2y konsumpcji
    // Konsumpcja food: 2.5 per POP/y, water: 1.5 per POP/y (z ResourcesData)
    const foodBuffer = food / (pop * 2.5);
    const waterBuffer = water / (pop * 1.5);
    
    const minBuffer = Math.min(foodBuffer, waterBuffer);
    if (minBuffer > 2.0) return 0;
    return 1.0 - (minBuffer / 2.0);
  }
  
  _scienceDeficit(empire) {
    // Slice 1: science = 0.2 stała wartość (AI nie bada techów)
    return 0.2;
  }
  
  _getFirstColony(empire) {
    if (!empire.colonies || empire.colonies.length === 0) return null;
    return window.KOSMOS.colonyManager.getColony(empire.colonies[0]);
  }
}

export { EmpireStrategicAI };
```

### `src/systems/ai/EmpireStockpilePolicy.js`

```js
import { EventBus } from '../../core/EventBus.js';

const STOCKPILE_TICK_INTERVAL = 4.0;  // civYears

// Targets per focus (bonus values dla setDemandBonus, base hardcoded w FactorySystem)
const STOCKPILE_TARGETS = {
  raw_extraction: {
    // Niskie safety stocki — oszczędzamy surowce
    structural_alloys: 17,    // → 20
    polymer_composites: 12,   // → 15
    conductor_bundles: 12     // → 15
  },
  commodity_production: {
    structural_alloys: 197,   // → 200
    polymer_composites: 147,  // → 150
    conductor_bundles: 97,    // → 100
    extraction_systems: 77,   // → 80
    power_cells: 57,           // → 60
    electronic_systems: 57    // → 60
  },
  self_sufficiency: {
    structural_alloys: 47,    // → 50
    polymer_composites: 32,   // → 35
    conductor_bundles: 27     // → 30
  },
  civilian_logistics: {
    // Przygotowanie do statków: wysokie tier-2 dla shipbuilding
    structural_alloys: 147,
    propulsion_systems: 27,
    electronic_systems: 47
  },
  defense: {
    structural_alloys: 97,
    reactive_armor: 27,
    military_supplies: 47
  },
  science: {
    structural_alloys: 32,
    quantum_processors: 7
  }
};

class EmpireStockpilePolicy {
  constructor(empireRegistry) {
    this._empireRegistry = empireRegistry;
    this._accumulators = new Map();
  }
  
  tickIfDue(empireId, civDeltaYears = 1.0) {
    const acc = (this._accumulators.get(empireId) ?? 0) + civDeltaYears;
    if (acc < STOCKPILE_TICK_INTERVAL) {
      this._accumulators.set(empireId, acc);
      return;
    }
    this._accumulators.set(empireId, 0);
    this._stockpileTick(empireId);
  }
  
  _stockpileTick(empireId) {
    const empire = this._empireRegistry.getEmpire(empireId);
    if (!empire?.currentStrategy?.focus) return;
    
    const focus = empire.currentStrategy.focus;
    const targets = STOCKPILE_TARGETS[focus] ?? STOCKPILE_TARGETS.self_sufficiency;
    
    for (const colonyId of empire.colonies) {
      const colony = window.KOSMOS.colonyManager.getColony(colonyId);
      if (!colony) continue;
      
      const changes = [];
      for (const [commodityId, targetBonus] of Object.entries(targets)) {
        const currentBonus = colony.factorySystem.getDemandBonus(commodityId);
        if (currentBonus !== targetBonus) {
          colony.factorySystem.setDemandBonus(commodityId, targetBonus);
          changes.push({ commodityId, from: currentBonus, to: targetBonus });
        }
      }
      
      if (changes.length > 0) {
        EventBus.emit('ai:stockpileAdjusted', {
          empireId,
          colonyId,
          focus,
          changes
        });
      }
    }
  }
}

export { EmpireStockpilePolicy };
```

### `src/systems/ai/ColonyAutoPlanner.js`

```js
import { EventBus } from '../../core/EventBus.js';

const TACTICAL_TICK_INTERVAL = 1.0;  // civYears

class ColonyAutoPlanner {
  constructor(empireRegistry) {
    this._empireRegistry = empireRegistry;
    this._accumulators = new Map();  // colonyId -> civYears
  }
  
  tickIfDue(colonyId, focus, civDeltaYears = 1.0) {
    const acc = (this._accumulators.get(colonyId) ?? 0) + civDeltaYears;
    if (acc < TACTICAL_TICK_INTERVAL) {
      this._accumulators.set(colonyId, acc);
      return;
    }
    this._accumulators.set(colonyId, 0);
    this._tacticalTick(colonyId, focus);
  }
  
  _tacticalTick(colonyId, focus) {
    const colony = window.KOSMOS.colonyManager.getColony(colonyId);
    if (!colony) return;
    
    // KRYTYCZNE: forsuj recompute rates (workaround dla civ:popBorn guarda)
    colony.buildingSystem._reapplyAllRates();
    
    const proposal = this.proposeNextBuilding(colony, focus);
    if (!proposal) return;
    
    EventBus.emit('ai:buildProposal', {
      colonyId,
      empireId: colony.ownerEmpireId,
      buildingId: proposal.buildingId,
      tileKey: proposal.tileKey,
      reason: proposal.reason
    });
    
    // Wywołaj _build bezpośrednio (bypass event guard)
    // AI access, bypasses event-based guard intentionally
    const tile = colony.buildingSystem._grid.get(proposal.tileKey);
    if (tile) {
      colony.buildingSystem._build(tile, proposal.buildingId);
    }
  }
  
  proposeNextBuilding(colony, focus) {
    switch (focus) {
      case 'raw_extraction': return this._proposeForRawExtraction(colony);
      case 'commodity_production': return this._proposeForCommodityProduction(colony);
      case 'self_sufficiency': return this._proposeForSelfSufficiency(colony);
      case 'civilian_logistics': return null;  // Slice 1: 1 colony
      default: return this._proposeForSelfSufficiency(colony);
    }
  }
  
  _proposeForRawExtraction(colony) {
    // Priorytet 1: mining_capacity vs population
    const mines = colony.buildingSystem._active.filter(b => b.buildingId === 'mine').length;
    const pop = colony.civilization.population;
    if (mines < Math.ceil(pop / 8)) {
      const tile = this._findBestHex(colony, 'mine', ['mountains', 'crater', 'tundra']);
      if (tile) return { buildingId: 'mine', tileKey: tile.key, reason: 'mining_capacity_low' };
    }
    
    // Priorytet 2: energy
    const solarCount = colony.buildingSystem._active.filter(b => b.buildingId === 'solar_farm').length;
    if (solarCount < 4) {
      const tile = this._findBestHex(colony, 'solar_farm', ['desert', 'plains']);
      if (tile) return { buildingId: 'solar_farm', tileKey: tile.key, reason: 'energy_buildup' };
    }
    
    return null;
  }
  
  _proposeForCommodityProduction(colony) {
    const factories = colony.buildingSystem._active.filter(b => b.buildingId === 'factory').length;
    if (factories < 4) {
      const tile = this._findBestHex(colony, 'factory', ['plains', 'mountains']);
      if (tile) return { buildingId: 'factory', tileKey: tile.key, reason: 'factory_buildup' };
    }
    
    // Smelter jeśli mamy 2+ factory
    if (factories >= 2) {
      const smelters = colony.buildingSystem._active.filter(b => b.buildingId === 'smelter').length;
      if (smelters === 0) {
        const tile = this._findBestHex(colony, 'smelter', ['mountains']);
        if (tile) return { buildingId: 'smelter', tileKey: tile.key, reason: 'smelter_needed' };
      }
    }
    
    return null;
  }
  
  _proposeForSelfSufficiency(colony) {
    const pop = colony.civilization.population;
    const food = colony.resourceSystem.inventory.get('food') ?? 0;
    const foodBuffer = food / (pop * 2.5);
    
    if (foodBuffer < 1.5) {
      const farms = colony.buildingSystem._active.filter(b => b.buildingId === 'farm').length;
      if (farms < 3) {
        const tile = this._findBestHex(colony, 'farm', ['plains', 'forest']);
        if (tile) return { buildingId: 'farm', tileKey: tile.key, reason: 'food_buffer_low' };
      }
    }
    
    // Housing
    const habitats = colony.buildingSystem._active.filter(b => b.buildingId === 'habitat').length;
    if (pop > habitats * 8) {  // ~8 POP per habitat
      const tile = this._findBestHex(colony, 'habitat', ['plains']);
      if (tile) return { buildingId: 'habitat', tileKey: tile.key, reason: 'housing_low' };
    }
    
    return null;
  }
  
  /**
   * Znajduje najlepszy hex dla budynku.
   * Preferowany teren > allowed terrain > kara biegunowa.
   */
  _findBestHex(colony, buildingId, preferredTerrain) {
    const grid = colony.buildingSystem._grid;
    if (!grid) return null;
    
    const BUILDINGS = window.KOSMOS.buildingsData?.BUILDINGS;
    const building = BUILDINGS?.[buildingId];
    if (!building) return null;
    
    let bestTile = null;
    let bestScore = -Infinity;
    
    grid.forEach(tile => {
      if (tile.buildingId || tile.capitalBase || tile.underConstruction) return;
      if (tile.pendingBuild) return;
      
      const allowed = building.allowedTerrain;
      if (allowed && !allowed.includes(tile.terrain)) return;
      
      let score = 0;
      if (preferredTerrain.includes(tile.terrain)) score += 10;
      
      // Kara biegunowa: rzędy 0, 1, last, prelast są gorsze
      const totalRows = grid.rows ?? 14;
      if (tile.r === 0 || tile.r === totalRows - 1) score -= 5;
      if (tile.r === 1 || tile.r === totalRows - 2) score -= 2;
      
      if (score > bestScore) {
        bestScore = score;
        bestTile = tile;
      }
    });
    
    return bestTile;
  }
}

export { ColonyAutoPlanner };
```

## Modyfikacje

### `src/systems/AlienCivSystem.js`

W konstruktorze (po istniejących systems):
```js
import { EmpireStrategicAI } from './ai/EmpireStrategicAI.js';
import { EmpireStockpilePolicy } from './ai/EmpireStockpilePolicy.js';
import { ColonyAutoPlanner } from './ai/ColonyAutoPlanner.js';

// W konstruktorze:
this._strategicAI = new EmpireStrategicAI(empireRegistry);
this._stockpilePolicy = new EmpireStockpilePolicy(empireRegistry);
this._autoPlanner = new ColonyAutoPlanner(empireRegistry);
```

Zamień `_tickAll(steps)`:
```js
_tickAll(steps) {
  const civDelta = steps;  // typowo 1.0
  
  for (const empireId of Object.keys(this._empires)) {
    this._strategicAI.tickIfDue(empireId, civDelta);
    this._stockpilePolicy.tickIfDue(empireId, civDelta);
    
    const empire = this._empireRegistry.getEmpire(empireId);
    if (!empire) continue;
    
    const focus = empire.currentStrategy?.focus;
    for (const colonyId of empire.colonies) {
      this._autoPlanner.tickIfDue(colonyId, focus, civDelta);
    }
  }
}
```

## Test akceptacyjny Fazy 2

Nowa gra, speed 5x, **5 minut realnego czasu** (~100 civYears in-game).

```js
const empireId = Object.keys(window.KOSMOS.gameState.empires)[0];
const empire = window.KOSMOS.empireRegistry.getEmpire(empireId);
const colony = window.KOSMOS.colonyManager.getColony(empire.colonies[0]);

console.log('Buildings after 100y:', 
  colony.buildingSystem._active.map(b => b.buildingId));
console.log('Resources:', Object.fromEntries(colony.resourceSystem.inventory));
console.log('Population:', colony.civilization.population);
console.log('Prosperity:', colony.prosperitySystem.prosperity);
console.log('Current strategy:', empire.currentStrategy);

const log = window.KOSMOS.debugLog.tail(200);
const shifts = log.filter(e => e.type === 'ai:strategicShift');
const stockpile = log.filter(e => e.type === 'ai:stockpileAdjusted');
const builds = log.filter(e => e.type === 'ai:buildProposal');
console.log('Strategic shifts:', shifts.length, shifts);
console.log('Stockpile adjustments:', stockpile.length);
console.log('Build proposals:', builds.length);
```

Wymagania:
- Buildings count wzrosło z ~11 do **co najmniej 15**.
- Co najmniej **2 różne typy** nowych budynków.
- Population > 20.
- Prosperity ≥ 30 stabilnie.
- Co najmniej **2 strategic shifts**.
- Co najmniej **3 stockpile adjustments**.
- Co najmniej **5 build proposals**.

Stop + raport gdy któryś warunek nie przejdzie.

## Co Faza 2 NIE robi

- Nie modyfikuje IntelOverlay — Faza 3.
- Nie pisze EconomySandboxScene — Faza 3.

---

# FAZA 3 — Intel + EconomySandboxScene

## Cel

Gracz widzi nową rzeczywistość AI przez `IntelOverlay`. Tworzymy `EconomySandboxScene` uruchamiany przez **menu button w TitleScene**.

## Pliki do utworzenia

### `src/systems/ai/IntelDataGenerator.js`

```js
class IntelDataGenerator {
  /**
   * @param colonyId
   * @param intelLevel 'unknown' | 'rumor' | 'contact' | 'detailed'
   */
  static generateColonyIntel(colonyId, intelLevel) {
    const colony = window.KOSMOS.colonyManager.getColony(colonyId);
    if (!colony || intelLevel === 'unknown') return null;
    
    const empire = window.KOSMOS.empireRegistry.getEmpire(colony.ownerEmpireId);
    
    if (intelLevel === 'rumor') {
      return {
        populationEstimate: '???',
        buildingCountEstimate: '???'
      };
    }
    
    if (intelLevel === 'contact') {
      return {
        populationEstimate: this._bucketize(colony.civilization.population, [10, 25, 50, 100]),
        buildingCountEstimate: this._bucketize(colony.buildingSystem._active.length, [5, 15, 30, 50]),
        archetype: empire?.archetype
      };
    }
    
    if (intelLevel === 'detailed') {
      return {
        population: colony.civilization.population,
        buildings: this._summarizeBuildings(colony),
        safetyStocks: this._summarizeSafetyStocks(colony),
        strategicFocus: empire?.currentStrategy?.focus,
        focusStartedYear: empire?.currentStrategy?.startedYear,
        lastObservedYear: window.KOSMOS.gameState?.year ?? 0
      };
    }
  }
  
  static _bucketize(value, brackets) {
    for (let i = 0; i < brackets.length; i++) {
      if (value <= brackets[i]) {
        return i === 0 ? `<${brackets[0]}` : `${brackets[i-1]}-${brackets[i]}`;
      }
    }
    return `>${brackets.at(-1)}`;
  }
  
  static _summarizeBuildings(colony) {
    const byCategory = {};
    for (const b of colony.buildingSystem._active) {
      const cat = window.KOSMOS.buildingsData?.BUILDINGS?.[b.buildingId]?.category ?? 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      
      const existing = byCategory[cat].find(x => x.buildingId === b.buildingId);
      if (existing) {
        existing.count++;
      } else {
        byCategory[cat].push({ buildingId: b.buildingId, count: 1, level: b.level ?? 1 });
      }
    }
    return byCategory;
  }
  
  static _summarizeSafetyStocks(colony) {
    const stocks = {};
    // Iteruj po wszystkich commodities z bonusem
    for (const [commodityId, bonus] of colony.factorySystem._demandBonus.entries()) {
      const target = colony.factorySystem.getSafetyStockTarget(commodityId);
      const current = colony.resourceSystem.inventory.get(commodityId) ?? 0;
      stocks[commodityId] = { current, target, bonus };
    }
    return stocks;
  }
}

export { IntelDataGenerator };
```

### `src/scenarios/EconomySandbox.js`

Wzorowane na `CombatSandbox.js`. **Nie scena**, funkcja `loadEconomySandbox(scene)`.

```js
import { EmpireColonyBootstrap } from '../systems/EmpireColonyBootstrap.js';
import { EventBus } from '../core/EventBus.js';

export function loadEconomySandbox(scene) {
  // Setup: znajdź wolny system, stwórz tam imperium
  const galaxy = window.KOSMOS.galaxyData;
  const homeSystem = galaxy.systems.find(s => s.id !== 'sys_home' && !s.empireId);
  if (!homeSystem) {
    console.error('No free system for sandbox');
    return;
  }
  
  // Stwórz imperium + bootstrap
  const empireReg = window.KOSMOS.empireRegistry;
  const empireId = empireReg.createEmpire({
    name: 'Sandbox Industrialist',
    archetype: 'industrialist',
    homeSystemId: homeSystem.id,
    colonies: []
  });
  
  const colonyId = EmpireColonyBootstrap.bootstrapHomeColony(
    empireId, 'industrialist', homeSystem.id
  );
  empireReg.addColony(empireId, colonyId);
  
  // Run loop
  scene._sandboxSnapshots = [];
  const startYear = window.KOSMOS.gameState?.year ?? 0;
  
  // Take snapshots co 10 civYears
  const snapshotInterval = setInterval(() => {
    const empire = empireReg.getEmpire(empireId);
    const colony = window.KOSMOS.colonyManager.getColony(colonyId);
    const year = window.KOSMOS.gameState?.year ?? 0;
    
    scene._sandboxSnapshots.push({
      year,
      population: colony.civilization.population,
      prosperity: colony.prosperitySystem.prosperity,
      buildings: colony.buildingSystem._active.length,
      buildingTypes: Array.from(new Set(
        colony.buildingSystem._active.map(b => b.buildingId)
      )),
      resources: Object.fromEntries(colony.resourceSystem.inventory),
      safetyStocks: Object.fromEntries(colony.factorySystem._demandBonus),
      focus: empire.currentStrategy?.focus,
      credits: colony.credits
    });
    
    if (year - startYear >= 100) {
      clearInterval(snapshotInterval);
      _buildSandboxReport(scene, empireId, colonyId);
    }
  }, 2000);  // co 2 sekundy realne (przy speed max ~10-20 civYears)
  
  // Ustaw max speed
  EventBus.emit('time:setSpeed', { speed: 'max' });
  
  console.log('Economy sandbox running. Watch console for report after ~30s.');
}

function _buildSandboxReport(scene, empireId, colonyId) {
  const log = window.KOSMOS.debugLog.tail(1000);
  
  const report = {
    duration: 100,
    snapshots: scene._sandboxSnapshots,
    growth: {
      populationGrowth: scene._sandboxSnapshots.at(-1).population / 
                        scene._sandboxSnapshots[0].population,
      buildingGrowth: scene._sandboxSnapshots.at(-1).buildings - 
                      scene._sandboxSnapshots[0].buildings
    },
    shifts: log.filter(e => e.type === 'ai:strategicShift'),
    stockpileChanges: log.filter(e => e.type === 'ai:stockpileAdjusted'),
    buildProposals: log.filter(e => e.type === 'ai:buildProposal'),
    redFlags: _detectRedFlags(scene._sandboxSnapshots)
  };
  
  console.log('=== ECONOMY SANDBOX REPORT ===');
  console.log(JSON.stringify(report, null, 2));
  
  window.KOSMOS.sandboxReport = report;
  
  try {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    console.log('Report copied to clipboard.');
  } catch (e) {
    console.log('Clipboard unavailable, report in window.KOSMOS.sandboxReport');
  }
}

function _detectRedFlags(snapshots) {
  const flags = [];
  if (snapshots.some(s => s.prosperity < 20)) flags.push('prosperity_dip');
  if (snapshots.at(-1).population - snapshots[0].population < 5) flags.push('population_stagnant');
  if (snapshots.some(s => (s.resources.food ?? 0) < 50)) flags.push('food_shortage');
  return flags;
}
```

## Modyfikacje

### `src/ui/IntelOverlay.js`

Dla intel level `detailed`, dodaj 3 sekcje (używając `IntelDataGenerator`):

1. **Buildings inventory**: lista per kategoria (mining, energy, food, industrial, ...).
2. **Safety stocks**: dla każdego commodity z bonusem — current / target.
3. **Strategic posture**: focus + od kiedy trwa.

(Konkretny styling: spójny z istniejącym IntelOverlay.)

### `src/scenes/TitleScene.js`

Dodaj przycisk "ECONOMY SANDBOX" analogicznie do "COMBAT SANDBOX":
- Linia ~236-239: nowy button data-action="economy_sandbox"
- Linia ~340-343: handler:
```js
if (action === 'economy_sandbox') {
  SaveSystem.clearSave();
  window.KOSMOS.scenario = 'economy_sandbox';
  // navigate to GameScene
}
```

### `src/scenes/GameScene.js`

Po inicjalizacji game state:
```js
if (window.KOSMOS?.scenario === 'economy_sandbox') {
  import('../scenarios/EconomySandbox.js').then(m => m.loadEconomySandbox(this));
}
```

## Test akceptacyjny Fazy 3

**Test 1 — sandbox via menu**:
- Otwórz menu → "ECONOMY SANDBOX".
- Czekaj ~30-60 sekund.
- Sprawdź konsolę: report wyświetlony.
- Sprawdź `window.KOSMOS.sandboxReport`.

Wymagania:
- `snapshots.length >= 10`
- `growth.populationGrowth >= 1.3`
- `growth.buildingGrowth >= 4`
- `shifts.length >= 2`
- `stockpileChanges.length >= 3`
- `redFlags.length <= 1`

**Test 2 — intel UI**:
Nowa gra normalna. Force intel:
```js
const empireId = Object.keys(window.KOSMOS.gameState.empires)[0];
window.KOSMOS.intelSystem.setIntelLevel(empireId, 'detailed');
```
Otwórz IntelOverlay (klawisz I). Wybierz imperium. Sprawdź:
- ✅ Buildings inventory pokazuje grupowanie per kategoria.
- ✅ Safety stocks pokazuje listę commodities z current/target.
- ✅ Strategic posture pokazuje focus.

Pozwól grze 60 sekund. Otwórz ponownie — safety stocks lub focus zmieniły się.

## Co Faza 3 NIE robi

- Nie zmienia DiplomacyOverlay.
- Nie dodaje proaktywnej dyplomacji.
- Nie pisze headless mode.

---

# Lista plików — szybkie podsumowanie

## Tworzone
- `src/data/EmpireArchetypeIndustrialist.js`
- `src/systems/EmpireColonyBootstrap.js`
- `src/systems/ai/EmpireStrategicAI.js`
- `src/systems/ai/EmpireStockpilePolicy.js`
- `src/systems/ai/ColonyAutoPlanner.js`
- `src/systems/ai/IntelDataGenerator.js`
- `src/scenarios/EconomySandbox.js`

## Modyfikowane
- `src/systems/BuildingSystem.js` — `autoPlaceBuilding` opt `preferredTerrain`
- `src/systems/ColonyManager.js` — pole `ownerEmpireId`, `getPlayerColonies()`, filtry w `_applyTaxes`, `_autoCreateTradeRoutes`, `_checkMigration`
- `src/generators/EmpireGenerator.js` — hardcoded 1 imperium Industrialist, usuń spawnFleet, usuń scalary
- `src/systems/EmpireRegistry.js` — usuń scalary, dodaj `addColony()`
- `src/systems/AlienCivSystem.js` — nowy tick loop z 3 AI systems
- `src/scenes/GameScene.js` — usuń import EconAI i `window.KOSMOS.econAI`, dodaj scenariusz `economy_sandbox`
- `src/scenes/TitleScene.js` — przycisk "ECONOMY SANDBOX"
- `src/persistence/SaveMigration.js` — CURRENT_VERSION = 76, clean break
- `src/ui/IntelOverlay.js` — 3 nowe sekcje dla detailed level

## Usuwane
- `src/systems/ai/EconAI.js` (lub stub z komentarzem)

---

# Polityka pracy

1. **Implementuj fazę po fazie**, czekaj na potwierdzenie po każdej.
2. **Używaj public API zweryfikowanego w Fazie 0** (sekcja "API które AI musi używać").
3. **Loguj wszystko ważne do DebugLog**:
   - `ai:empireBootstrap`, `ai:strategicShift`, `ai:stockpileAdjusted`, `ai:buildProposal`
4. **Test acceptance jest hard gate**.
5. **Save migration to clean break** — throw error przy v75.
6. **Bezpośredni `_build()` call w AI ma jawny komentarz**: "AI access, bypasses event-based guard intentionally".
7. **`_reapplyAllRates()` co tactical tick** — workaround dla `civ:popBorn` guarda.
8. **Jeśli napotkasz coś niespodziewanego — zatrzymaj się i pytaj**.

Czas trwania: realnie 2-5 tygodni dla całej Slice 1.

---

**Rozpocznij od Fazy 1.** Po jej ukończeniu, raport testu akceptacyjnego, czekaj na potwierdzenie przed Fazą 2.
