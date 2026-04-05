# BRIEFING DLA OPUS 4.6 — Pure Strata + Synthetic Units
## Specyfikacja do stworzenia planu implementacji

**Wersja**: 2.0
**Dla**: Claude Opus 4.6 — przeczytaj całość, następnie stwórz własny plan implementacji
**Projekt**: KOSMOS — `E:\programy\Claude_kody\kosmos\`

---

## INSTRUKCJE DLA OPUS

Twoje zadanie:
1. Przeczytaj ten dokument w całości
2. Przeczytaj OBOWIĄZKOWO pliki wymienione w Sekcji 2
3. Stwórz własny, szczegółowy plan implementacji podzielony na fazy
4. Każda faza musi być: samoizolowana, testowalnie skończona, bezpieczna dla save'ów

**Czego NIE rób**:
- Nie implementuj niczego bez planu
- Nie zmieniaj więcej niż jedna faza nakazuje
- Nie modyfikuj plików krytycznych (`EventBus.js`, `EntityManager.js`, `PhysicsSystem.js`, `HexGrid.js`) — te są poza zakresem
- Nie wymyślaj funkcjonalności spoza tej specyfikacji

**Format planu jaki stworzysz**:
```
Faza N: [nazwa]
  Pliki do zmiany: [lista]
  Zmiany: [co dokładnie]
  Zależności: [co musi być gotowe przed tą fazą]
  Jak przetestować: [konkretne kroki]
  Ryzyko złamania: [niskie/średnie/wysokie + dlaczego]
```

---

## SEKCJA 1 — Kontekst i ograniczenia

### Czym jest ten projekt

KOSMOS to gra przeglądarkowa (JavaScript ES Modules, brak bundlera, Live Server).
Warstwa 4X: CivilizationSystem, BuildingSystem, ResourceSystem, TechSystem, ColonyManager.
EventBus = jedyna dozwolona komunikacja między systemami.
SaveSystem v25 — zapis do localStorage, centralna migracja w `SaveMigration.js`.

### Nienaruszalne zasady

1. **Save compatibility**: każda zmiana musi mieć migrację w `SaveMigration.js`
2. **EventBus guard pattern**: `if (window.KOSMOS?.civSystem !== this) return;` — zachowaj we wszystkich handlerach
3. **Multi-kolonia**: każda kolonia ma własne instancje `ResourceSystem`, `CivilizationSystem`, `BuildingSystem` — zmiany muszą działać per-kolonia, nie globalnie
4. **CIV_TIME_SCALE = 12**: systemy 4X używają `civDeltaYears`, nie `deltaYears`
5. **Dwujęzyczność**: każdy tekst widoczny w UI musi mieć `namePL` i `nameEN`

### Co POZOSTAJE bez zmian

Te mechaniki NIE są modyfikowane przez tę specyfikację:
- PhysicsSystem, LifeSystem, GravitySystem — bez zmian
- ExpeditionSystem, VesselManager, TradeRouteManager — tylko drobne integracje
- PlanetGlobeScene, PlanetGlobeRenderer — bez zmian (tylko EventBus events)
- TechSystem, ResourceSystem — bez zmian strukturalnych
- BuildingSystem — zmiana tylko `employmentPenalty` → `laborEfficiency`
- Istniejące budynki — nie usuwa się żadnych, tylko dodaje nowe
- Istniejące commodities — nie usuwa się żadnych, tylko rename `robots` + nowe

---

## SEKCJA 2 — Pliki do przeczytania przed planowaniem

Opus MUSI przeczytać te pliki zanim stworzy plan:

| Plik | Dlaczego ważny |
|------|----------------|
| `src/systems/CivilizationSystem.js` | Rdzeń refaktoru — pełna implementacja |
| `src/systems/BuildingSystem.js` | `employmentPenalty`, `_build()`, `_calcBaseRates()` |
| `src/systems/SaveMigration.js` | Format migracji, aktualny CURRENT_VERSION |
| `src/data/CommoditiesData.js` | Istniejące commodities, format wpisów |
| `src/data/BuildingsData.js` | Istniejące budynki, format wpisów |
| `src/data/TechData.js` | Istniejące technologie, format wpisów |
| `src/systems/ColonyManager.js` | Jak kolonie są tworzone i zarządzane |
| `src/scenes/UIManager.js` | Gdzie wyświetlana populacja / CivPanel |
| `src/scenes/PlanetGlobeScene.js` | Jak wyświetlane dane strat w UI |

---

## SEKCJA 3 — Cel: co budujemy i dlaczego

### Problem z obecnym systemem

Obecny `CivilizationSystem` przechowuje populację jako jeden integer (`this.population`).
Budynki wymagają ułamkowych POPów (`popCost: 0.25`), co tworzy gamey feeling.
Lojalność i tożsamość kulturowa nie mają podstawy w materialnych warunkach kolonii.

### Cel

Zastąpić jeden integer `population` systemem **strat** — typowanych grup roboczych, gdzie każda strata:
- rośnie organicznie gdy jej typ budynku jest w kolonii
- ma własną satisfakcję opartą na fizycznych wskaźnikach z gry
- może tworzyć ruchy społeczne gdy jest niezadowolona
- buduje tożsamość kulturową przez historię zdarzeń

Dodać syntetyczne jednostki robocze (droids/androidy) jako drogie alternatywy z konsekwencjami społecznymi.

---

## SEKCJA 4 — Specyfikacja systemu strat

### 4.1 Nowa struktura danych w CivilizationSystem

Zastąp `this.population` (integer) strukturą `this.strata`:

```javascript
// PRZED:
this.population = 2;  // integer

// PO:
this.strata = {
  laborer:    { count: 2, growthProgress: 0.0, satisfaction: 65 },
  miner:      { count: 0, growthProgress: 0.0, satisfaction: 50 },
  worker:     { count: 0, growthProgress: 0.0, satisfaction: 50 },
  scientist:  { count: 0, growthProgress: 0.0, satisfaction: 50 },
  merchant:   { count: 0, growthProgress: 0.0, satisfaction: 50 },
  engineer:   { count: 0, growthProgress: 0.0, satisfaction: 50 },
  bureaucrat: { count: 0, growthProgress: 0.0, satisfaction: 50 },
};

// totalPop = getter: sum of all strata[t].count
get population() {
  return Object.values(this.strata).reduce((s, t) => s + t.count, 0);
}
// UWAGA: getter 'population' zachowuje backwards-compatible API dla reszty kodu
```

**Konsekwencja**: cały kod który używa `this.population` lub `civSystem.population` nadal działa.

### 4.2 Typy strat i ich budynki źródłowe

| Typ straty | Budynki które ją "tworzą" (demandMultiplier) | Satisfakcja pochodzi głównie z |
|------------|----------------------------------------------|-------------------------------|
| `laborer` | farm, well, habitat | food_ratio, water_ratio, housing |
| `miner` | mine, smelter | mine_efficiency, food, brak eksploatacji |
| `worker` | factory, consumer_factory | commodity output, brak blackout |
| `scientist` | research_station, observatory | research rate, library |
| `merchant` | trade_hub, free_market, trade_beacon, commodity_nexus | credits, aktywne trasy |
| `engineer` | shipyard, nuclear_plant, robot_assembly, android_lab | zaawansowane budynki działają |
| `bureaucrat` | admin_office (nowy), imperial_hall | governance_score, porządek |

### 4.3 Wzrost straty — formuła

```javascript
// Per strata, per rok cywilny (wewnątrz _yearlyUpdate)
_calcStrataGrowthRate(type) {
  const strata = this.strata[type];
  const demand  = this._calcStrataDemand(type);   // ile etatów czeka na ten typ
  const cond    = this._calcConditionMult();       // food/housing/energy (istniejąca logika)
  const satMult = strata.satisfaction > 40 ? 1.0
                : strata.satisfaction > 20 ? 0.5 : 0.1;
  const BASE = 0.08;  // bazowy przyrost per rok cywilny
  return BASE * demand * cond * satMult;
}

_calcStrataDemand(type) {
  // Policz "wolne etaty" dla tego typu na podstawie budynków
  // Przykład miner: (liczba kopalń × 0.25) - strata.miner.count
  // Clamp 0–1: 0 = brak zapotrzebowania, 1 = maksymalne
  const needed  = this._buildingSystem?.getSlotDemand(type) ?? 0;
  const current = this.strata[type].count;
  return Math.max(0, Math.min(1, (needed - current) / Math.max(1, needed)));
}

// Wzrost (w _yearlyUpdate):
for (const type of Object.keys(this.strata)) {
  const rate = this._calcStrataGrowthRate(type);
  this.strata[type].growthProgress += rate;
  if (this.strata[type].growthProgress >= 1.0) {
    this.strata[type].growthProgress -= 1.0;
    this.strata[type].count += 1;
    EventBus.emit('civ:popBorn', { population: this.population, strataType: type });
  }
}
```

### 4.4 Śmierć podczas głodu

```javascript
// Stara logika: population -= 1 po STARVATION_YEARS
// Nowa logika: ta sama, ale -1 od straty o najniższej satisfakcji
_killLowestSatisfactionStrata() {
  let lowestType = null, lowestSat = Infinity;
  for (const [type, strata] of Object.entries(this.strata)) {
    if (strata.count > 0 && strata.satisfaction < lowestSat) {
      lowestSat = strata.satisfaction;
      lowestType = type;
    }
  }
  if (lowestType) {
    this.strata[lowestType].count -= 1;
    EventBus.emit('civ:popDied', { cause: 'starvation', population: this.population, strataType: lowestType });
  }
}
```

### 4.5 Wyświetlana populacja (displayPopulation)

```javascript
// Getter — zero nowego stanu, używa istniejącego growthProgress:
get displayPopulation() {
  let total = 0;
  for (const strata of Object.values(this.strata)) {
    total += strata.count + strata.growthProgress;
  }
  return Math.round(total * 100_000);  // 1 POP = 100,000 mieszkańców
}

get populationGrowthRate() {
  let rate = 0;
  for (const type of Object.keys(this.strata)) {
    rate += this._calcStrataGrowthRate(type);
  }
  return Math.round(rate * 100_000);  // ludzi per rok
}

// UI: "2,840,000 mieszkańców (+18,000/rok)"
// Skala: start=200,000 | rozwinięta=3,000,000 | metropolia=8,000,000
```

### 4.6 Satisfakcja per typ

```javascript
_calcStrataSatisfaction(type) {
  const r = this._resourceSnap;
  const foodRatio  = this._resourceRatio('food');
  const waterRatio = this._resourceRatio('water');
  const housingOk  = this.housing >= this.population ? 1.0 : this.housing / this.population;
  const energyOk   = (r.energy ?? 0) >= 0 ? 1.0 : Math.max(0, 1 + (r.energy / 20));

  switch (type) {
    case 'laborer':
      return foodRatio*0.40 + waterRatio*0.25 + housingOk*0.20 + energyOk*0.15;

    case 'miner': {
      const mineEff = this._buildingSystem?.getMineEfficiency() ?? 0.5;
      const exportFraction = this._getExportFraction('minerals');
      const exploitPenalty = Math.min(0.5, Math.max(0, exportFraction - 0.5) * 0.6);
      return mineEff*0.30 + foodRatio*0.35 - exploitPenalty + housingOk*0.10;
    }

    case 'worker': {
      const factoryOutput = this._buildingSystem?.getFactoryOutputRatio() ?? 0.5;
      return factoryOutput*0.40 + foodRatio*0.30 + energyOk*0.20 + housingOk*0.10;
    }

    case 'scientist': {
      const researchRate = (r.research ?? 0) / 20;
      const empireConn   = this._hasTradeRoute() ? 0.8 : 0.4;
      return Math.min(1,researchRate)*0.40 + empireConn*0.20 + housingOk*0.20 + foodRatio*0.20;
    }

    case 'merchant': {
      const credits  = window.KOSMOS?.civilianTradeSystem?.getCreditsPerYear(this._colonyId) ?? 0;
      const routes   = this._getActiveTradeRoutes();
      const freedom  = this._tradeIsolated() ? 0 : 1.0;
      return Math.min(1, credits/10)*0.25 + Math.min(1,routes/3)*0.35 + freedom*0.25 + foodRatio*0.15;
    }

    case 'engineer': {
      const advBuildingsOk = this._buildingSystem?.getAdvancedBuildingsUptime() ?? 0.5;
      return advBuildingsOk*0.40 + foodRatio*0.30 + energyOk*0.30;
    }

    case 'bureaucrat': {
      const governance = this._getGovernanceScore();
      const order      = 1 - Math.min(1, (this.activeMovements?.length ?? 0) / 3);
      return governance*0.40 + order*0.30 + foodRatio*0.30;
    }
  }
  return 0.5;
}
// Zwraca 0–1, przechowuj jako 0–100: strata[type].satisfaction = sat * 100
```

### 4.7 Loyalty jako wypadkowa

```javascript
// Colony Loyalty (0–100) — computed property, nie osobny float
get loyalty() {
  const total = this.population;
  if (total === 0) return 80;
  let weighted = 0;
  for (const [type, strata] of Object.entries(this.strata)) {
    weighted += strata.count * strata.satisfaction;
  }
  const base = weighted / total;
  // Modyfikatory historyczne (zanikają 2pt/rok, przechowywane w this._loyaltyModifiers):
  const modSum = (this._loyaltyModifiers ?? []).reduce((s, m) => s + m.value, 0);
  return Math.max(0, Math.min(100, base + modSum));
}
```

---

## SEKCJA 5 — BuildingSystem: zmiana employmentPenalty

### Obecny stan

```javascript
// BuildingSystem — aktualne:
get employmentPenalty() {
  const needed = this._employedPops + this._lockedPops;
  if (needed <= 0 || this.population >= needed) return 1.0;
  return this.population / needed;
}
// Używane w _calcBaseRates() jako mnożnik produkcji
```

### Nowy stan

```javascript
// BuildingSystem — nowe: per-budynek, uwzględnia syntetyczne
_getBuildingLaborEfficiency(buildingId, tileKey) {
  const tile = this._hexGrid?.getTile(tileKey);
  if (!tile) return 1.0;

  const synth = tile.syntheticSlot;  // { tier: 1|2|3, count: N } lub null
  if (synth) {
    const effMap = { 1: 1.4, 2: 1.7, 3: 2.5 };
    return effMap[synth.tier] ?? 1.0;
  }

  // Biologiczny: czy strata dla tego typu budynku istnieje?
  const bdef = BUILDINGS[buildingId];
  const strataType = bdef?.popType ?? 'laborer';
  const strataCount = this._civSystem?.strata[strataType]?.count ?? 0;
  const demand = this._calcSlotDemand(strataType);
  if (demand === 0) return 1.0;
  return Math.min(1.0, strataCount / demand);
}
// Używaj zamiast employmentPenalty w _calcBaseRates()
// UWAGA: zachowaj employmentPenalty jako getter-alias dla backwards compat
```

---

## SEKCJA 6 — Commodities: zmiany

### 6.1 Nowe commodity `microcircuits` (Tier 2)

```javascript
microcircuits: {
  id:       'microcircuits',
  namePL:   'Mikroobwody', nameEN: 'Microcircuits',
  icon:     '🔲',
  tier:     2,
  recipe:   { Si: 8, Cu: 4 },
  baseTime: 0.375,
  weight:   0.8,
  description: 'Drukowane obwody scalone — podstawa robotyki i automatyzacji',
  isConsumerGood: false, consumptionLayer: null,
},
```

**Dlaczego**: `automation_droid` nie może wymagać `semiconductors` (potrzebują Pt+Xe — zbyt późno
w grze dla Tier 1 narzędzia). `microcircuits` jest dostępny od pospolitych Si+Cu.

### 6.2 Rename: `robots` → `automation_droid`

```javascript
// Stary wpis robots zostaje zastąpiony:
automation_droid: {
  id:       'automation_droid',
  namePL:   'Droid Automatyzacyjny', nameEN: 'Automation Droid',
  icon:     '🤖',
  tier:     2,
  recipe:   { Fe: 8, Cu: 5, Si: 3, electronics: 3, microcircuits: 2, power_cells: 1 },
  // BEZ semiconductors — dostępny z pospolitych minerałów
  baseTime: 1.0,
  weight:   3.5,
  isDroidUnit: true, droidTier: 1,
  description: 'Prosta jednostka automatyzacyjna — obsadza slot w budynku, +40% produkcji. Generuje subtelne napięcia wśród robotników.',
  isConsumerGood: false, consumptionLayer: null,
},
```

### 6.3 Nowe commodity `android_worker` (Tier 3)

```javascript
android_worker: {
  id:       'android_worker',
  namePL:   'Android Robotniczy', nameEN: 'Android Worker',
  icon:     '🦾',
  tier:     3,
  recipe:   { Fe: 8, Cu: 6, Si: 5, electronics: 5, semiconductors: 3, polymer_composites: 2 },
  // semiconductors = Pt + Xe — celowa bariera mid-late game
  baseTime: 2.5,
  weight:   5.0,
  isDroidUnit: true, droidTier: 2,
  requiresTech: 'android_engineering',
  description: 'Humanoidalny android — zajmuje pełny slot POP, +70% wydajności. Poważne napięcia społeczne.',
  isConsumerGood: false, consumptionLayer: null,
},
```

### 6.4 Nowe commodity `ai_chips` (Tier 3)

```javascript
ai_chips: {
  id:       'ai_chips',
  namePL:   'Chipy AI', nameEN: 'AI Chips',
  icon:     '🧠',
  tier:     3,
  recipe:   { semiconductors: 4, quantum_processors: 2, Pt: 4, Xe: 2 },
  baseTime: 5.0,
  weight:   0.3,
  requiresTech: 'quantum_computing',
  description: 'Procesory neuromorficzne — serce systemów sztucznej inteligencji.',
  isConsumerGood: false, consumptionLayer: null,
},
```

### 6.5 Nowe commodity `ai_collective_node` (Tier 4)

```javascript
ai_collective_node: {
  id:       'ai_collective_node',
  namePL:   'Węzeł AI Collective', nameEN: 'AI Collective Node',
  icon:     '🌐',
  tier:     4,
  recipe:   { ai_chips: 5, quantum_processors: 3, electronics: 10, semiconductors: 8, exotic_alloy: 2 },
  baseTime: 8.0,
  weight:   2.0,
  isDroidUnit: true, droidTier: 3,
  requiresTech: 'artificial_intelligence',
  description: 'Kolektyw AI — superinteligentna sieć. Produkcja ×2.5, ale egzystencjalne napięcia.',
  isConsumerGood: false, consumptionLayer: null,
},
```

### 6.6 Poprawka: `semiconductors` — zmiana flagi

```javascript
// Obecny stan (błędny):
semiconductors: { ..., isConsumerGood: true, consumptionLayer: 'luxury' }

// Nowy stan:
semiconductors: { ..., isConsumerGood: false, consumptionLayer: null }
// Półprzewodniki to komponent przemysłowy, nie luxury good
```

### 6.7 Aktualizacja prefabów autonomicznych

```javascript
// Prefab autonomous NIE wymaga semiconductors — ma Tier 1 droid (microcircuits)
prefab_autonomous_mine: {
  recipe: { Fe: 35, Cu: 10, Ti: 10, microcircuits: 2, power_cells: 2 },
  // stary: { Fe: 35, Cu: 8, Ti: 10 }
},
prefab_autonomous_solar_farm: {
  recipe: { Si: 22, Cu: 12, Ti: 6, Fe: 8, microcircuits: 2, power_cells: 1 },
  // stary: { Si: 22, Cu: 10, Ti: 6, Fe: 8 }
},
// prefab_autonomous_spaceport: zachowaj oryginalną recepturę
```

---

## SEKCJA 7 — Nowe budynki (BuildingsData.js)

### 7.1 robot_assembly (Synthetyka)

```javascript
robot_assembly: {
  id: 'robot_assembly',
  namePL: 'Montownia Robotów', nameEN: 'Robot Assembly',
  category: 'synthetic',
  icon: '🤖🏭',
  cost: { Fe: 40, Cu: 15, Si: 20 },
  commodityCost: { steel_plates: 6, electronics: 4, microcircuits: 3 },
  energyCost: 8, buildTime: 2.0,
  rates: {},
  popCost: 0.25, popType: 'engineer',
  requires: 'robotics',
  maxLevel: 5,
  terrainAny: false,
  // Budynek dedykowany produkcji automation_droid — 2× szybszy niż fabryka generyczna
  assemblyBonus: 2.0,
  description: 'Dedykowana montownia droidów automatyzacyjnych.',
},
```

### 7.2 android_lab (Synthetyka)

```javascript
android_lab: {
  id: 'android_lab',
  namePL: 'Laboratorium Androidów', nameEN: 'Android Laboratory',
  category: 'synthetic',
  icon: '🦾🔬',
  cost: { Si: 50, Cu: 30, Ti: 20 },
  commodityCost: { steel_plates: 8, electronics: 6, semiconductors: 4 },
  energyCost: 12, buildTime: 3.0,
  rates: {},
  popCost: 0.5, popType: 'engineer',
  requires: 'android_engineering',
  maxLevel: 3,
  terrainAny: false,
  // Jedyne miejsce gdzie można produkować android_worker
  description: 'Laboratorium do projektowania i produkcji androidów humanoidalnych.',
},
```

### 7.3 ai_nexus (Synthetyka)

```javascript
ai_nexus: {
  id: 'ai_nexus',
  namePL: 'Centrum AI', nameEN: 'AI Nexus',
  category: 'synthetic',
  icon: '🌐🧠',
  cost: { Ti: 100, Si: 80, Cu: 60, Pt: 20 },
  commodityCost: { ai_chips: 10, quantum_processors: 5, semiconductors: 10, exotic_alloy: 3 },
  energyCost: 25, buildTime: 5.0,
  rates: {},
  popCost: 0, isAutonomous: true,
  requires: 'artificial_intelligence',
  maxLevel: 1,
  terrainAny: true,
  // Umożliwia instalację ai_collective_node w kolonii
  description: 'Centrum superinteligentnej sieci AI. Wymaga stałego zasilania.',
},
```

### 7.4 admin_office (Governance)

```javascript
admin_office: {
  id: 'admin_office',
  namePL: 'Biuro Administracyjne', nameEN: 'Administrative Office',
  category: 'governance',
  icon: '🏢',
  cost: { Fe: 20, Si: 10, Cu: 5 },
  commodityCost: { steel_plates: 3, electronics: 2 },
  energyCost: 2, buildTime: 1.0,
  rates: {},
  popCost: 0.25, popType: 'bureaucrat',
  requires: null,
  maxLevel: 5,
  terrainAny: true,
  governanceBonus: 15,
  revolutionThreshold: +10,  // trudniej wywołać ruch społeczny
  description: 'Centrum administracji kolonii. Stabilizuje lojalność.',
},
```

### 7.5 trade_union_hall (Governance)

```javascript
trade_union_hall: {
  id: 'trade_union_hall',
  namePL: 'Dom Związkowy', nameEN: 'Trade Union Hall',
  category: 'governance',
  icon: '✊',
  cost: { Fe: 15, C: 5 },
  commodityCost: { steel_plates: 2, concrete_mix: 2 },
  energyCost: 1, buildTime: 0.5,
  rates: {},
  popCost: 0.10, popType: 'laborer',
  requires: null,  // dostępny od początku — "zawór bezpieczeństwa"
  maxLevel: 3,
  terrainAny: true,
  // Poprawia satisfakcję pracowniczą, ale obniża całkowitą produkcję
  laborerSatisfactionBonus: +20,
  workerSatisfactionBonus:  +15,
  minerSatisfactionBonus:   +15,
  allProductionPenalty:     -0.05,
  displacementMitigation:   0.2,
  description: 'Dom związkowy robotników. Redukuje napięcia, ale kosztem wydajności.',
},
```

**Nowa kategoria budynków**: `'synthetic'` i `'governance'` — dodaj do `HexTile.allowedCategories`.

---

## SEKCJA 8 — Nowe technologie (TechData.js)

Nowa gałąź: **Synthetyka** (`synthetic` branch). Wymagania w łańcuchu:
```
metallurgy → robotics → android_engineering → quantum_computing → artificial_intelligence
```

```javascript
robotics: {
  id: 'robotics', tier: 2,
  namePL: 'Robotyka', nameEN: 'Robotics',
  requires: ['metallurgy'],
  cost: { research: 120 },
  effects: {
    unlockBuilding: ['robot_assembly'],
    unlockFactory: ['automation_droid'],
    productionBonus: { mine: 0.10 },
  },
  descPL: 'Automatyzacja procesów przemysłowych.',
  descEN: 'Industrial process automation.',
},

android_engineering: {
  id: 'android_engineering', tier: 3,
  namePL: 'Inżynieria Androidów', nameEN: 'Android Engineering',
  requires: ['robotics', 'advanced_materials'],
  cost: { research: 300 },
  effects: {
    unlockBuilding: ['android_lab'],
    unlockFactory: ['android_worker'],
    displacementMitigation: 0.3,
  },
  descPL: 'Projekowanie humanoidalnych androidów roboczych.',
  descEN: 'Design of humanoid worker androids.',
},

quantum_computing: {
  id: 'quantum_computing', tier: 4,
  namePL: 'Obliczenia Kwantowe', nameEN: 'Quantum Computing',
  requires: ['android_engineering', 'quantum_physics'],
  cost: { research: 600 },
  effects: {
    unlockFactory: ['ai_chips'],
    researchMultiplier: 1.5,
  },
  descPL: 'Komputery kwantowe otwierają drogę do prawdziwej AI.',
  descEN: 'Quantum computers pave the way for true AI.',
},

artificial_intelligence: {
  id: 'artificial_intelligence', tier: 5,
  namePL: 'Sztuczna Inteligencja', nameEN: 'Artificial Intelligence',
  requires: ['quantum_computing'],
  cost: { research: 1200 },
  effects: {
    unlockBuilding: ['ai_nexus'],
    unlockFactory: ['ai_collective_node'],
    socialTensionReduction: 0.2,
  },
  descPL: 'Superinteligentna AI zmienia oblicze cywilizacji.',
  descEN: 'Superintelligent AI transforms civilization.',
},
```

---

## SEKCJA 9 — Cultural Identity i Loyalty

### 9.1 Nowe pola w CivilizationSystem

```javascript
// Dodaj do konstruktora:
this.identity = {
  score: 0,          // 0–100
  events: [],        // [{ type, year, content }]
  dominantType: 'laborer',
  traits: [],        // ['workers_republic', 'reform_heritage', ...]
};
this._loyaltyModifiers = [];  // [{ value, decayPerYear, source }]
this.activeMovements = [];    // aktywne ruchy społeczne
```

### 9.2 Identity Events — wagi

| Typ zdarzenia | Waga |
|---------------|------|
| `disaster_survived_alone` | +12 |
| `revolution_negotiated` | +10 |
| `revolution_won` | +20 |
| `revolution_crushed` | +8 |
| `trade_boom` | −5 |
| `aid_received` | −8 |
| `isolation_decade` | +6 per 10 lat |
| `cultural_center_built` | +7 |
| `android_displacement_major` | −10 |
| `luddite_victory` | +15 |

`identity.score = Math.min(100, sum(events.map(e => IDENTITY_WEIGHTS[e.type] ?? 0)))`

### 9.3 Cultural Traits

Traits przyznawane gdy `identity.score` przekroczy próg i jest konkretna historia:

| Trait | Warunki | Główny efekt |
|-------|---------|-------------|
| `workers_republic` | revolution_won + dominant=miner/worker | +15% mining/factory, wymaga prosperity ≥ 40 |
| `reform_heritage` | revolution_negotiated | +8% all production, loyalty stabilna |
| `martyrs_colony` | revolution_crushed militarnie | +10% prod, loyalty −25 trwałe, separatyzm ×2 |
| `free_trade_charter` | merchant revolution wygrała | +20% credits, +1 trade route slot |
| `academic_republic` | scientist revolution wygrała | +30% research |
| `human_core` | syntheticRatio < 20% przez 20+ lat | +loyalty, resist droid adoption |
| `synthetic_society` | syntheticRatio > 60% przez 20+ lat | +40% production, power-failure vulnerability |
| `frontier_pride` | isolation_decade + disaster_survived_alone | +identity, prod bonus hostile terrain |

---

## SEKCJA 10 — Ruchy społeczne (podstawowa mechanika)

### 10.1 Triggery

```javascript
_checkMovements() {
  for (const [type, strata] of Object.entries(this.strata)) {
    if (strata.count === 0) continue;

    const alreadyActive = this.activeMovements.find(m => m.strataType === type);
    if (alreadyActive) continue;

    // Faza 1: Niezadowolenie (tylko log, bez pauzy)
    if (strata.satisfaction < 30) {
      strata._lowSatYears = (strata._lowSatYears ?? 0) + 1;
      if (strata._lowSatYears >= 3 && !strata._discontent) {
        strata._discontent = true;
        EventBus.emit('civ:strataDiscontent', { type, satisfaction: strata.satisfaction, colony: this._colonyId });
      }
    } else {
      strata._lowSatYears = 0;
      strata._discontent = false;
    }

    // Faza 2: Ruch (pauza + modal)
    if (strata._discontent && strata.satisfaction < 20 && strata._lowSatYears >= 6) {
      this._triggerMovement(type, 'phase2');
    }
  }

  // Specjalny trigger: displacement androidów
  const displaced = this._getDisplacedBiological();
  if (displaced >= 3 && !this.activeMovements.find(m => m.type === 'luddite')) {
    this._triggerMovement('displaced', 'luddite');
  }
}
```

### 10.2 Typy ruchów

| Strata | Typ ruchu | Żądania |
|--------|-----------|---------|
| `miner` | Związek Górniczy | Ogranicz eksport minerałów; zapewnij jedzenie; housing |
| `laborer` | Ruch Robotniczy | Jedzenie NATYCHMIAST; housing; opieka medyczna |
| `worker` | Strajk Fabryczny | Utrzymaj fabryki; brak blackout; lepsze warunki |
| `scientist` | Autonomia Akademicka | Budżet badań; wolność badań; biblioteki |
| `merchant` | Bojkot Handlowy | Otwarte trasy; zniesienie ceł |
| `displaced` | Ruch Luddystyczny | Usuń droids/androidy; Basic Income; nowe miejsca pracy |
| *(cross-type)* | Separatyzm | Gdy identity > 55 AND loyalty < 35 |

### 10.3 EventBus — nowe zdarzenia

```javascript
// Emitowane przez CivilizationSystem:
'civ:strataDiscontent'  { type, satisfaction, colony }
'civ:movementStarted'   { colony, strataType, demands, strength }
'civ:movementResolved'  { colony, strataType, outcome, trait? }
'civ:identityEvent'     { colony, eventType, year, content }
'civ:loyaltyChanged'    { colony, loyalty, delta }
'civ:traitAcquired'     { colony, trait }

// Payload 'civ:popBorn' rozszerzony:
'civ:popBorn'           { population, strataType }   // dodano strataType

// Payload 'civ:popDied' rozszerzony:
'civ:popDied'           { cause, population, strataType }  // dodano strataType
```

---

## SEKCJA 11 — SaveMigration v25 → v26

```javascript
// W SaveMigration.js — nowa metoda:
_migrateV25toV26(data) {
  for (const colony of data.c4x?.colonies ?? []) {
    const civ = colony.civ ?? {};
    const pop = civ.population ?? 2;

    // 1. robots → automation_droid
    if (colony.commodities?.robots !== undefined) {
      colony.commodities.automation_droid = colony.commodities.robots;
      delete colony.commodities.robots;
    }

    // 2. Nowe commodity defaults
    colony.commodities ??= {};
    colony.commodities.microcircuits       ??= 0;
    colony.commodities.android_worker      ??= 0;
    colony.commodities.ai_chips            ??= 0;
    colony.commodities.ai_collective_node  ??= 0;

    // 3. Strata z istniejącej populacji (przybliżenie na podstawie budynków)
    //    Jeśli nie można odczytać budynków — rozkład domyślny
    civ.strata = {
      laborer:    { count: Math.max(1, Math.ceil(pop * 0.5)),  growthProgress: 0, satisfaction: 65 },
      miner:      { count: Math.floor(pop * 0.2),              growthProgress: 0, satisfaction: 55 },
      worker:     { count: Math.floor(pop * 0.1),              growthProgress: 0, satisfaction: 60 },
      scientist:  { count: Math.floor(pop * 0.1),              growthProgress: 0, satisfaction: 60 },
      merchant:   { count: Math.floor(pop * 0.05),             growthProgress: 0, satisfaction: 55 },
      engineer:   { count: Math.floor(pop * 0.05),             growthProgress: 0, satisfaction: 60 },
      bureaucrat: { count: 0,                                  growthProgress: 0, satisfaction: 65 },
    };
    // Korekta: suma musi być = pop
    const strataSum = Object.values(civ.strata).reduce((s, t) => s + t.count, 0);
    civ.strata.laborer.count += Math.max(0, pop - strataSum);

    // 4. Identity i Loyalty defaults
    civ.identity = { score: 0, events: [], dominantType: 'laborer', traits: [] };
    civ.loyaltyModifiers = [];
    civ.activeMovements  = [];

    // 5. Zachowaj stary population dla backwards compat (teraz jest getter)
    // civ.population zostaje — getter go nadpisze
  }

  // 6. STARTING_COMMODITIES: dodaj nowe klucze
  // (obsługiwane przez ?? defaults w restore())
}
```

---

## SEKCJA 12 — Ryzyka i uwagi dla Opus

### Krytyczne miejsca gdzie łatwo o błąd

1. **`population` getter vs stary field**: Po refaktorze `this.population` staje się getterem.
   Każde miejsce które robi `this.population = X` (przypisanie) musi być zmienione.
   Szukaj: `grep -n "this.population\s*=" src/systems/CivilizationSystem.js`

2. **`_employedPops` i `_lockedPops`**: Nadal są potrzebne (BuildingSystem je modyfikuje).
   NIE usuwaj ich — tylko employment penalty zmienia semantykę.

3. **Multi-kolonia guard pattern**: Każdy nowy EventBus handler w CivilizationSystem
   musi mieć: `if (window.KOSMOS?.civSystem !== this) return;`

4. **`civ:popBorn` i `civ:popDied`**: BuildingSystem nasłuchuje tych zdarzeń.
   Rozszerzone payloady (+ `strataType`) są backwards-compatible (odbiorca ignoruje nowe pola).

5. **`serialize()` i `restore()`**: Oba muszą obsługiwać `strata` object.
   `restore()` musi mieć defensywne defaults (`?? defaultStrata`) dla starych save'ów.

6. **Nowa kategoria budynków `'synthetic'` i `'governance'`**: Dodaj do
   `HexTile.allowedCategories` — inaczej buildable validation odrzuci nowe budynki.

7. **COMMODITY_BY_TIER i COMMODITY_SHORT**: Pamiętaj zaktualizować obie tablice
   po dodaniu nowych commodities — inaczej UI może nie wyświetlić ich poprawnie.

8. **STARTING_COMMODITIES**: Dodaj nowe klucze z wartością `0`.

### Kolejność priorytetów

Implementuj od najniższego ryzyka:
1. Dane statyczne (`CommoditiesData`, `BuildingsData`, `TechData`) — game loads, no logic change
2. `SaveMigration` v26 — safe forward migration
3. `displayPopulation` getter — additive, nie zmienia logiki
4. Strata w `CivilizationSystem` — największy refaktor, ostatni
5. `BuildingSystem.laborEfficiency` — zależy od gotowego CivSystem
6. Satisfaction formulas + Movement triggers — po stabilizacji strat

---

## SEKCJA 13 — Definition of Done

Każda faza implementacji jest skończona gdy:

| Kryterium | Opis |
|-----------|------|
| **Game loads** | Gra startuje bez błędów w konsoli |
| **Save compatibility** | Stary save z v25 wczytuje się poprawnie po migracji |
| **New game works** | Nowa gra (scenariusz Cywilizacja) startuje i produkuje POPy |
| **Colonies work** | Multi-kolonia: przełączanie kolonii nie psuje strat |
| **UI displays** | Populacja wyświetla się jako liczba mieszkańców |
| **No regression** | Budynki budują się, ekspedycje działają, czas płynie |

---

## Appendix — Diagram emergencji

```
GRACZ BUDUJE BUDYNKI
        ↓
STRATA DEMAND rośnie dla typów pasujących do budynków
        ↓
STRATA GROWS (demand × conditions × satisfaction) — ciągły wzrost
        ↓
SATISFAKCJA per TYP (formuły z materialnych wskaźników gry)
        ↓               ↓
  LOYALTY           RUCH SPOŁECZNY (satisfaction < 30 przez N lat)
= weighted avg              ↓
  satisfakcji         REWOLUCJA (ruch ignorowany)
                            ↓
                    IDENTITY EVENT (trwała historia)
                            ↓
                    IDENTITY SCORE (suma wag)
                            ↓
                    CULTURAL TRAIT (próg + dominant type)
                            ↓
              modyfikuje satisfakcję + trwały efekt ekonomiczny

GRACZ INSTALUJE DROIDS/ANDROIDY:
  → budynek: efficiency ×1.4/1.7/2.5
  → biological strata: displacement (Tier 2+)
  → idle displaced: revolutionary pressure
  → identity: dilution lub "Synthetic Society" path
```
