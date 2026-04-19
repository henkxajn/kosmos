# Plan — Opcja C v3: Barracks + Supply/Morale/Organization + Logistics Units

**Status**: ⏸ Zaplanowane, nie zaimplementowane. Aktualnie Opcja B (flat `{ Ti:5, Si:3, Hv:1 }`).
**Utworzone**: 2026-04-19
**Poprzednicy**: Opcja B (merged), plan v2 (`plan-ground-unit-recruitment-option-c.md`) — v3 kompletnie zastępuje v2, rozszerza o Supply/Morale/Organization + 2 jednostki logistyczne.
**Save version**: v54 → **v55** (jeden bump dla całości)

---

## 1. Kontekst — co zostaje bez zmian z planu v2

Wszystko z planu v2 zostaje merytorycznie ważne, rozszerzone o sekcje Supply/Org/Morale:

- Gating Barracks Lv1-3 + techy (`ground_warfare`, `drone_warfare`)
- Rare materials per archetyp (Ti/Si/Hv/Xe) — wymusza outposty
- POP cost (permanent lock, zawsze `laborer`), reintegracja po śmierci
- Credits build + upkeep (Kr)
- Energy upkeep flow-based (pomijane w `canAfford`)
- Offline state + grace period 5 civYears → disband
- Cap militarny od populacji (floor(pop/4), min 2; drony nie liczone)
- Decyzja: **3 oddzielne budynki** `barracks_lv1/2/3` zamiast nowego mechanizmu `upgradeRequires` (prostsze, mniej zmian w BuildingSystem)

---

## 2. Cele v3 (nowe w stosunku do v2)

1. **Supply** — nowy commodity `military_supplies` produkowany w fabryce z `{ Hv, Li, Ti, Si, food, water }` (bez Fe, lekki sink na rare materials)
2. **Organization (org)** i **Morale (mor)** — dwie statystyki 0-100 per jednostka wojskowa (ground + space)
3. **damageMult wzór** — `(supply/20) × (1 + (org+morale)/200)` → 0 przy 0 supply, ×2.0 przy 100/100/100
4. **Dwie nowe jednostki logistyczne**:
   - `ground_supply_unit` — naziemny archetyp (magazyn ruchomy cap 200, transfer 10/civY do sąsiadów w 1 hex)
   - `space_supply_ship` — placeholder dla fleet-group supply (osobny projekt, ale archetyp dodany teraz)
5. **7 nowych techów** — liniowy wzrost max org/morale (10 → 100) + odblokowania
6. **SupplyCoverageSystem** — nowy system obliczający coverage (1 hex od Capital/Barracks/Supply Unit)
7. **Statystyki dotknięte mnożnikiem**: damage, capture speed, movement (penalty przy low supply), regen org/mor
8. **Starvation attrition** — supply=0 → damageMult=0 + morale -10/civY + HP -5%/civY
9. **Save migration v54→v55**

---

## 3. Koncepcja — Supply, Organization, Morale

### 3.1 Supply

- **Pojemność (cap)**: każdy archetyp ma `baseSupplyCap` (np. 100 dla shock_infantry, 50 dla drone, 200 dla supply unit, 500 dla supply ship). Tech `military_logistics` → +20; `fleet_logistics` → +20; `veteran_corps` → +20. Max cap ~160.
- **Stan**: `unit.supply` — aktualna wartość 0..cap
- **Konsumpcja**: per civYear, tylko gdy jednostka aktywna (patrz matryca §4)
- **Źródła uzupełnienia**:
  - Adjacent do Capital/Barracks (dowolny poziom) → instant refill do cap (draw z `colony.commodities.military_supplies` po 1:1)
  - Adjacent do Supply Unit w 1 hex → transfer z jego magazynu +10/civY
  - Ładowanie do transport ship (cargo bay) → FROZEN (stasis)

### 3.2 Organization (org)

- **Wartość**: `unit.org` 0..100, start = `archetype.baseOrg + techBonus.org`, cap = `unit.maxOrg = startValue + veteranBonus`
- **Degradacja**: każda akcja bojowa (attack) → `-5 org` (dla atakującego i celu), każdy ruch → `-2 org`
- **Regeneracja**: idle z supply>0 → `+3 org/civY` (cap = maxOrg)
- **Rola w grze**: "organizacja wojskowa" — im wyższa tym sprawniej jednostka działa (dmg bonus, capture speed bonus)

### 3.3 Morale (mor)

- **Wartość**: `unit.morale` 0..100, start = `archetype.baseMorale + techBonus.morale`, cap = `unit.maxMorale`
- **Degradacja**: bycie ostrzeliwanym → `-3 morale` per hit, supply=0 → `-10 morale/civY` (attrition)
- **Regeneracja**: idle z supply>0 i org>50 → `+5 morale/civY`
- **Rola w grze**: "duch walki" — dmg bonus, retreat chance gdy morale<20 (opcjonalnie do v4, teraz tylko dmg)

### 3.4 Wzór damageMult

```js
// Zastosowanie: GroundUnitFactory.getEffectiveDmg(atk, tgt) -> mnożnik po bazowym dmg
function computeDamageMult(unit) {
  if ((unit.supply ?? 0) <= 0) return 0;            // 0 supply = 0 dmg (hard cut)
  const supplyFactor = Math.min((unit.supply ?? 0) / 20, 1);   // <20 supply = penalty
  const coreBonus    = ((unit.org ?? 0) + (unit.morale ?? 0)) / 200;  // 0..1
  return supplyFactor * (1.0 + coreBonus);
}
```

**Wartości referencyjne:**
- `supply=0, *, *` → **×0** (nie walczy)
- `supply=10, org=10, morale=10` → 0.5 × 1.10 = **×0.55** (głodny, walczy słabo)
- `supply=20+, org=10, morale=10` → 1.0 × 1.10 = **×1.10** (lekki bonus)
- `supply=100, org=50, morale=50` → 1.0 × 1.50 = **×1.50**
- `supply=100, org=100, morale=100` → 1.0 × 2.00 = **×2.00** (duży bonus)

### 3.5 Penalty movement

Osobno (nie część damageMult):
```js
function getMovementCostMult(unit) {
  return (unit.supply ?? 0) < 20 ? 1.5 : 1.0;
}
```

---

## 4. Matryca konsumpcji supply (KLUCZOWE)

Odpowiedź na pytanie gracza: **kiedy jednostka traci supply?**

| Stan jednostki | `consumptionMult` | Uzasadnienie |
|---|---|---|
| `transportStatus === 'loaded'` (w ładowni statku) | **0** | FROZEN — hibernacja, brak konsumpcji nawet podczas wieloletniego lotu. **To jest obietnica gracz-friendly**. |
| Adjacent do Capital lub Barracks (dowolny lv) + colony ma `military_supplies>0` | **0** + auto-refill | Garnizon w bazie zawsze zaopatrzony. Refill 20 supply/civY draw z stocku (lub cały cap w 1 civYear). |
| W zasięgu Supply Unit (1 hex, SU ma supply>0 w magazynie) | **0** + refill 10/civY | SU przejmuje koszt logistyczny. |
| `status === 'idle'`, poza coverage | **1.0 × base** | Idle na obcej planecie — base rate. |
| `status === 'moving'` (w trakcie marszu) | **1.5 × base** | Ruch — większe zużycie. |
| `status === 'attacking'` (w walce) | **2.0 × base** | Amunicja, paliwo bojowe. |
| `status === 'capturing'` | **1.5 × base** | Przedłużona operacja. |

### Base rates per archetyp (per civYear)

| Archetype | base rate | cap | Survival time idle (cap/base) |
|---|---|---|---|
| shock_infantry | 3 | 100 | ~33 civY |
| garrison_unit | 2 | 100 | ~50 civY |
| rocket_artillery | 5 | 100 | ~20 civY (ciężki sprzęt) |
| aa_platform | 3 | 100 | ~33 civY |
| medic_unit | 2 | 100 | ~50 civY |
| recon_drone | 2 | 50 | ~25 civY |
| **ground_supply_unit** | 1 (own) + transfers out | 200 | ~200 civY own |
| **space_supply_ship** | 0 (używa paliwa, nie supply) | N/A | N/A |

### Auto-refill z kolonii

Gdy jednostka adjacent do Capital/Barracks i `colony.commodities.military_supplies > 0`:
1. `needed = unit.supplyCap - unit.supply`
2. `available = min(needed, colony.commodities.military_supplies, 20 /* per civY rate */)`
3. `unit.supply += available`; `colony.commodities.military_supplies -= available`

Gdy colony ma 0 `military_supplies` → brak refillu → consumption normalny (nawet w Capital!).
To daje napięcie: logistyka nie jest magiczna, musisz produkować supplies w fabryce.

---

## 5. Nowy commodity `military_supplies`

Dodać w `src/data/CommoditiesData.js`:

```js
military_supplies: {
  id:          'military_supplies',
  namePL:      'Zaopatrzenie Wojskowe',
  nameEN:      'Military Supplies',
  descPL:      'Amunicja, racje polowe, elektronika, medykamenty. Niezbędne dla wszystkich jednostek wojskowych — bez supply brak walki.',
  descEN:      'Ammunition, field rations, electronics, medical. Required by all military units — no supply, no combat.',
  tier:        2,
  icon:        '📦',
  weight:      0.5,
  stackSize:   500,
  requires:    'military_logistics',  // tech-gated
  category:    'military',
},
```

Dodać recipe w `src/data/FactoryRecipes.js` (lub gdziekolwiek recipe storage):

```js
military_supplies: {
  inputs: {
    Hv:    2,     // metale ciężkie (ammo, pancerze) — wymusza outpost metallic
    Li:    2,     // baterie, MRE, materiały wybuchowe
    Ti:    1,     // obudowy, nośniki
    Si:    1,     // elektronika polowa
    food:  3,     // racje
    water: 2,     // hydratacja
  },
  output:   { military_supplies: 10 },
  time:     1.0, // civYear per batch
  requires: 'military_logistics',
},
```

Pół-legalne Fe=0 (w innych commodity Fe dominuje — to świadome odchylenie).

---

## 6. Nowy budynek Barracks (3 tiery)

Decyzja: **3 oddzielne budynki** `barracks_lv1/2/3`, każdy z klasycznym `requires` (bezpieczniej niż `upgradeRequires`).

```js
// src/data/BuildingsData.js (dodaj 3 budynki)

barracks_lv1: {
  id:       'barracks_lv1',
  namePL:   'Koszary',
  nameEN:   'Barracks',
  descPL:   'Centrum rekrutacji jednostek naziemnych (Lv1). 1 slot budowy. Odblokowuje shock infantry + garrison.',
  descEN:   'Ground unit recruitment facility (Lv1). 1 build slot. Unlocks shock infantry + garrison.',
  icon:     '🪖',
  category: 'military',
  housing:  0,
  popCost:  0.25,
  maxLevel: 1,  // nie upgradable — zamiast tego build lv2 obok
  allowedTerrain: ['plains', 'desert', 'tundra', 'wasteland', 'crater', 'volcanic'],
  cost:          { Ti: 20, Si: 15, Cu: 10 },
  commodityCost: { structural_alloys: 6, reactive_armor: 3 },
  buildTime:     1.5,
  baseRates:     {},
  isAutonomous:  false,
},

barracks_lv2: {
  // ...
  requires:  'ground_warfare',
  cost:          { Ti: 40, Si: 30, Cu: 20 },
  commodityCost: { structural_alloys: 12, reactive_armor: 6 },
  buildTime:     2.5,
  // Lv2: slot zajmuje 2 × 0.25 = 0.5 POP (większa baza)
  popCost:       0.5,
  // flavor: 'Rozszerzone koszary z poligonem. 2 sloty budowy. Odblokowuje artylerię, AA, medyków.'
},

barracks_lv3: {
  // ...
  requires:  'drone_warfare',
  cost:          { Ti: 80, Si: 60, Cu: 40, Hv: 10 },
  commodityCost: { structural_alloys: 20, reactive_armor: 10, electronic_systems: 8 },
  buildTime:     4.0,
  popCost:       0.75,
  // flavor: 'Kompleks szkolenia z hangarem dronów. 3 sloty budowy. Odblokowuje drony zwiadowcze.'
},
```

### Barracks level helpers (ColonyManager)

```js
_getBarracksLevel(colony) {
  // Zwraca MAX level z wszystkich barracks_lv* obecnych w kolonii
  let max = 0;
  if (this._buildingExists(colony, 'barracks_lv1')) max = Math.max(max, 1);
  if (this._buildingExists(colony, 'barracks_lv2')) max = Math.max(max, 2);
  if (this._buildingExists(colony, 'barracks_lv3')) max = Math.max(max, 3);
  return max;
}

_getBarracksSlots(colony) {
  // Każdy poziom dodaje 1 slot — sumuj
  let slots = 0;
  for (const id of ['barracks_lv1','barracks_lv2','barracks_lv3']) {
    slots += this._countBuildings(colony, id);
  }
  return slots;
}
```

---

## 7. Nowe techy (9 łącznie: 2 z v2 + 7 nowych)

### 7.1 Existing z v2 (potwierdzone)

```js
ground_warfare: {
  id: 'ground_warfare',
  namePL: 'Wojna Lądowa', nameEN: 'Ground Warfare',
  tier: 2, cost: { research: 150 },
  requires: ['rocketry'],
  unlocks: {
    unlockBuilding: ['barracks_lv2'],
    archetypes:     ['rocket_artillery', 'aa_platform', 'medic_unit'],
  },
  icon: '⚔',
},

drone_warfare: {
  id: 'drone_warfare',
  namePL: 'Wojna Dronowa', nameEN: 'Drone Warfare',
  tier: 3, cost: { research: 280 },
  requires: ['ground_warfare'],
  unlocks: {
    unlockBuilding: ['barracks_lv3'],
    archetypes:     ['recon_drone'],
  },
  icon: '🛰',
},
```

### 7.2 Nowe w v3 — Supply/Org/Morale

```js
military_logistics: {
  id: 'military_logistics', tier: 2,
  namePL: 'Logistyka Wojskowa', nameEN: 'Military Logistics',
  descPL: 'Odblokowuje Zaopatrzenie Wojskowe (commodity) + Naziemną Jednostkę Zaopatrzeniową. +10 org, +10 mor.',
  cost: { research: 150 },
  requires: ['ground_warfare'],
  unlocks: {
    unlockCommodity: ['military_supplies'],
    archetypes:      ['ground_supply_unit'],
    statBonuses:     { org: 10, morale: 10, supplyCap: 20 },
  },
  icon: '📦',
},

field_discipline: {
  id: 'field_discipline', tier: 2,
  namePL: 'Dyscyplina Polowa', nameEN: 'Field Discipline',
  cost: { research: 160 },
  requires: ['ground_warfare'],
  unlocks: { statBonuses: { org: 15, morale: 15 } },
  icon: '🎖',
},

combat_doctrine: {
  id: 'combat_doctrine', tier: 3,
  namePL: 'Doktryna Bojowa', nameEN: 'Combat Doctrine',
  cost: { research: 220 },
  requires: ['field_discipline'],
  unlocks: { statBonuses: { org: 15, morale: 10 } },
  icon: '📜',
},

elite_training: {
  id: 'elite_training', tier: 3,
  namePL: 'Elitarne Szkolenie', nameEN: 'Elite Training',
  cost: { research: 220 },
  requires: ['field_discipline'],
  unlocks: { statBonuses: { org: 10, morale: 15 } },
  icon: '🥋',
},

fleet_logistics: {
  id: 'fleet_logistics', tier: 3,
  namePL: 'Logistyka Flotowa', nameEN: 'Fleet Logistics',
  cost: { research: 260 },
  requires: ['military_logistics', 'drone_warfare'],
  unlocks: {
    archetypes:  ['space_supply_ship'],
    statBonuses: { org: 5, morale: 5, supplyCap: 20 },
  },
  icon: '🚀',
},

strategic_doctrine: {
  id: 'strategic_doctrine', tier: 4,
  namePL: 'Doktryna Strategiczna', nameEN: 'Strategic Doctrine',
  cost: { research: 320 },
  requires: ['combat_doctrine'],
  unlocks: { statBonuses: { org: 20, morale: 15 } },
  icon: '♟',
},

veteran_corps: {
  id: 'veteran_corps', tier: 4,
  namePL: 'Korpus Weteranów', nameEN: 'Veteran Corps',
  cost: { research: 320 },
  requires: ['elite_training'],
  unlocks: { statBonuses: { org: 15, morale: 20, supplyCap: 20 } },
  icon: '🏅',
},
```

**Suma przy wszystkich 7 techach**: +90 org, +90 morale → startValue archetype + 90 = cap 100.

**Combat veteran bonus (dodatkowe, do v3.1)**: +1/+1 per wygrana bitwa, cap +10.

### 7.3 Mechanika `statBonuses` w TechSystem

Nowa metoda w TechSystem:
```js
getTechStatBonuses() {
  let org = 0, morale = 0, supplyCap = 0;
  for (const techId of this.researched) {
    const bonus = TECH_DATA[techId]?.unlocks?.statBonuses;
    if (!bonus) continue;
    org       += bonus.org       ?? 0;
    morale    += bonus.morale    ?? 0;
    supplyCap += bonus.supplyCap ?? 0;
  }
  return { org, morale, supplyCap };
}
```

Wywoływane przy spawn unit w `ColonyManager._spawnGroundUnit()`:
```js
const bonuses  = window.KOSMOS.techSystem?.getTechStatBonuses() ?? { org:0, morale:0, supplyCap:0 };
const arch     = UNIT_ARCHETYPES[archetypeId];
unit.maxOrg    = Math.min(100, (arch.baseOrg       ?? 10) + bonuses.org);
unit.maxMorale = Math.min(100, (arch.baseMorale    ?? 10) + bonuses.morale);
unit.org       = unit.maxOrg;
unit.morale    = unit.maxMorale;
unit.supplyCap = Math.min(200, (arch.baseSupplyCap ?? 100) + bonuses.supplyCap);
unit.supply    = unit.supplyCap;  // fresh unit = full supply
```

---

## 8. Archetype definitions — nowe + rozszerzone

### 8.1 Bazowe archetypy istniejące (rozszerz o supply/org/morale)

Dodaj do każdego z 6 archetypów w `src/data/unitArchetypes.js`:

```js
shock_infantry: {
  // ...existing fields
  baseOrg:         10,
  baseMorale:      15,   // elita — wyższe morale startowe
  baseSupplyCap:   100,
  supplyConsumption: 3,  // per civYear, base rate
},
garrison_unit: {
  baseOrg:         15,   // okopany — lepsza organizacja
  baseMorale:      10,
  baseSupplyCap:   100,
  supplyConsumption: 2,
},
rocket_artillery: {
  baseOrg:         10,
  baseMorale:      10,
  baseSupplyCap:   100,
  supplyConsumption: 5,  // ciężki sprzęt pali dużo
},
aa_platform: {
  baseOrg:         10,
  baseMorale:      10,
  baseSupplyCap:   100,
  supplyConsumption: 3,
},
medic_unit: {
  baseOrg:         10,
  baseMorale:      15,
  baseSupplyCap:   100,
  supplyConsumption: 2,
},
recon_drone: {
  baseOrg:         20,   // zautomatyzowane
  baseMorale:      0,    // N/A dla drona (zawsze traktowane jako 0 → brak bonusu z morale)
  baseSupplyCap:   50,
  supplyConsumption: 2,
  noMorale:        true, // flag — pomijaj morale w formułach
},
```

### 8.2 Nowy archetyp `ground_supply_unit`

```js
ground_supply_unit: {
  id:              'ground_supply_unit',
  namePL:          'Jednostka Zaopatrzeniowa',
  nameEN:          'Supply Unit',
  descPL:          'Mobilne zaopatrzenie. Tankuje w Capital/Barracks, transferuje supply do sąsiednich jednostek (1 hex).',
  descEN:          'Mobile logistics. Refills at Capital/Barracks, transfers supply to adjacent allies (1 hex).',
  icon:            '🚛',
  glbPath:         'supply_truck.glb',  // TODO asset
  faction:         'humanity',

  // Combat stats — słaby, niebojowy
  hp:              40,
  attack:          2,
  defense:         3,
  range:           1,
  moveSpeed:       2,

  // Supply/Org/Morale
  baseOrg:         20,
  baseMorale:      20,
  baseSupplyCap:   200,   // większy magazyn — to kurier
  supplyConsumption: 1,   // niska bo sam nie walczy
  isSupplier:      true,  // flag — SupplyCoverageSystem traktuje jako źródło

  // Requirements (C-gating)
  requiresTech:    ['military_logistics'],
  requiresBarracksLv: 2,

  // Recruitment
  buildCost:       { Ti: 12, Si: 15, Cu: 8 },
  commodityCost:   { structural_alloys: 5, electronic_systems: 3 },
  popCost:         0.3,   // laborer
  creditsCost:     350,
  buildTime:       1.2,
  upkeep:          { energy: 2, credits: 5 },
  popReintegration:{ rate: 0.75, delay: 1.5 },

  // Abilities
  supplyTransferRate: 10,  // supply/civY per adjacent unit
},
```

**Mechanika supply transfer** (w `SupplyCoverageSystem._tickSupply`):
```js
for (const supplier of getSuppliersOnPlanet(planetId)) {
  if ((supplier.supply ?? 0) <= 0) continue;
  const neighbors = getAdjacentAlliedUnits(supplier, 1);
  for (const ally of neighbors) {
    const need   = (ally.supplyCap ?? 100) - (ally.supply ?? 0);
    const rate   = supplier.supplyTransferRate ?? 10;
    const xfer   = Math.min(need, rate * civDt, supplier.supply);
    ally.supply    += xfer;
    supplier.supply -= xfer;
  }
}
```

### 8.3 Nowy archetyp `space_supply_ship` (placeholder)

```js
// src/data/ShipsData.js
space_supply_ship: {
  id:              'space_supply_ship',
  namePL:          'Statek Zaopatrzeniowy',
  nameEN:          'Supply Ship',
  descPL:          'Zaopatrzenie floty. Musi być w tej samej grupie floty co statki bojowe.',
  descEN:          'Fleet supply. Must be in same fleet group as combatants.',
  icon:            '🚀',
  class:           'logistics',

  hp:              80,
  attack:          0,
  defense:         4,
  cargoCapacity:   500,
  supplyMagazine:  500,
  supplyTransferRate: 20,

  fuelCapacity:    400,
  fuelPerAU:       2.5,

  baseOrg:         20,
  baseMorale:      20,

  buildCost:       { Ti: 40, Si: 30, Hv: 10, Xe: 2 },
  commodityCost:   { structural_alloys: 15, electronic_systems: 8, power_cells: 5 },
  creditsCost:     1200,
  buildTime:       4.0,
  upkeep:          { energy: 5, credits: 20 },

  requiresTech:    ['fleet_logistics'],
  buildBuilding:   'shipyard_lv2', // TODO — wyjaśnić w fleet-group projekcie

  placeholder:     true,  // flag — mechanika fleet-group w osobnym PR
},
```

**Placeholder status**: w v3 budujemy statek i dodajemy do floty, ale **nie implementujemy fleet-group supply broadcast** — to osobny projekt (grupowanie statków w locie). W v3 supply ship działa jako "paper unit" — ma statystyki, można go rekrutować, ale aktywna mechanika supply w kosmosie (fleet coverage) czeka na projekt "Fleet Groups".

W v3 dla statków bojowych w kosmosie: supply nie jest konsumowane (bo brak infrastruktury fleet-group). Damage mult dla statków = 1.0 zawsze (do czasu fleet-group projektu). TO JEST ŚWIADOME uproszczenie — v3 skupia się na ground warfare.

---

## 9. SupplyCoverageSystem (nowy plik)

Ścieżka: `src/systems/SupplyCoverageSystem.js`

### Odpowiedzialności

1. Dla każdej planety oblicz `coverageMap` (`Map<hexKey, source>`): które heksy są w 1 hex od Capital / Barracks / SupplyUnit
2. Tick supply:
   - Wszystkie allied unity na planecie — sprawdź coverage + stan → oblicz `consumptionMult` + refill
   - Supply Unit adjacent do Capital → refill swojego magazynu z colony.commodities.military_supplies
   - Supply Unit z magazynem → transfer do adjacent allied units (rate 10/civY each)
3. Tick attrition:
   - Unit z supply=0 → `morale -= 10*civDt`, `hp -= 0.05*hp*civDt` (5%/civY)
4. Tick regen:
   - Unit z supply>0, status=idle → `org += 3*civDt` (cap maxOrg), `morale += 5*civDt` (cap maxMorale, wymaga org>50)

### Szkielet

```js
export class SupplyCoverageSystem {
  constructor(colonyManager, groundUnitManager) {
    this.colonyManager     = colonyManager;
    this.groundUnitManager = groundUnitManager;
    this._coverageCache    = new Map();  // planetId -> { generation, hexMap }
    this._tickAccum        = 0;
  }

  update(civDeltaYears) {
    if (!civDeltaYears || civDeltaYears <= 0) return;
    this._tickSupplyAndRegen(civDeltaYears);
  }

  getCoverage(planetId) { /* zwraca Map<hexKey, source> dla UI overlay */ }

  _tickSupplyAndRegen(civDt) {
    const planetIds = this.groundUnitManager.getActivePlanetIds();
    for (const pid of planetIds) {
      const colony  = this.colonyManager.getColony(pid);
      const units   = this.groundUnitManager.getUnitsOnPlanet(pid);
      const coverage = this._computeCoverage(pid, colony, units);

      // Faza 1: refill z Capital/Barracks
      for (const u of units) {
        if (u.transportStatus === 'loaded') continue;
        if (coverage.get(hexKey(u.q, u.r))?.type === 'capital' && colony?.commodities?.military_supplies > 0) {
          const need   = (u.supplyCap ?? 100) - (u.supply ?? 0);
          const rate   = 20 * civDt;
          const draw   = Math.min(need, rate, colony.commodities.military_supplies);
          u.supply    += draw;
          colony.commodities.military_supplies -= draw;
        }
      }

      // Faza 2: Supply Units tankują się w Capital
      for (const u of units) {
        if (!u.isSupplier || u.transportStatus === 'loaded') continue;
        if (coverage.get(hexKey(u.q, u.r))?.type === 'capital' && colony?.commodities?.military_supplies > 0) {
          const need = (u.supplyCap ?? 200) - (u.supply ?? 0);
          const rate = 30 * civDt;  // SU tankuje się szybciej
          const draw = Math.min(need, rate, colony.commodities.military_supplies);
          u.supply  += draw;
          colony.commodities.military_supplies -= draw;
        }
      }

      // Faza 3: Supply Units karmią sąsiadów
      for (const su of units.filter(u => u.isSupplier && (u.supply ?? 0) > 0 && u.transportStatus !== 'loaded')) {
        const nbrs = getAdjacentAlliedUnits(units, su, 1);
        for (const ally of nbrs) {
          if (ally === su) continue;
          const need = (ally.supplyCap ?? 100) - (ally.supply ?? 0);
          const rate = (su.supplyTransferRate ?? 10) * civDt;
          const xfer = Math.min(need, rate, su.supply);
          ally.supply += xfer;
          su.supply   -= xfer;
        }
      }

      // Faza 4: Konsumpcja (matryca §4)
      for (const u of units) {
        if (u.transportStatus === 'loaded') continue;

        const cov = coverage.get(hexKey(u.q, u.r));
        const inRange = cov && (cov.type === 'capital' || cov.type === 'barracks' || cov.type === 'supplier');
        if (inRange) continue;  // w coverage — konsumpcja zerowana przez refill

        const base = u.supplyConsumption ?? 2;
        let mult   = 1.0;
        if (u.status === 'moving')    mult = 1.5;
        if (u.status === 'attacking') mult = 2.0;
        if (u.status === 'capturing') mult = 1.5;

        u.supply = Math.max(0, (u.supply ?? 0) - base * mult * civDt);
      }

      // Faza 5: Attrition przy starvation
      for (const u of units) {
        if ((u.supply ?? 0) > 0) continue;
        if (u.noMorale !== true) u.morale = Math.max(0, (u.morale ?? 0) - 10 * civDt);
        u.hp = Math.max(0, (u.hp ?? 0) - (u.maxHp ?? u.hp ?? 10) * 0.05 * civDt);
        if (u.hp <= 0) EventBus.emit('groundUnit:destroyed', { unitId: u.id, cause: 'starvation' });
      }

      // Faza 6: Regen idle units
      for (const u of units) {
        if ((u.supply ?? 0) <= 0) continue;
        if (u.status !== 'idle') continue;
        u.org = Math.min(u.maxOrg ?? 100, (u.org ?? 0) + 3 * civDt);
        if (u.noMorale !== true && (u.org ?? 0) > 50) {
          u.morale = Math.min(u.maxMorale ?? 100, (u.morale ?? 0) + 5 * civDt);
        }
      }
    }
  }

  _computeCoverage(planetId, colony, units) {
    const map = new Map();
    // 1. Capital hex + 6 sąsiadów
    if (colony?.capitalHex) addHexAndNeighbors(map, colony.capitalHex, { type: 'capital' });
    // 2. Barracks hexes
    for (const tile of getTilesWithBuildings(colony, ['barracks_lv1','barracks_lv2','barracks_lv3'])) {
      addHexAndNeighbors(map, tile, { type: 'barracks' });
    }
    // 3. Supply Units
    for (const u of units) {
      if (!u.isSupplier || (u.supply ?? 0) <= 0) continue;
      addHexAndNeighbors(map, { q: u.q, r: u.r }, { type: 'supplier', sourceId: u.id });
    }
    return map;
  }
}
```

### Integracja

- Inicjalizacja w `GameScene.start()`: `window.KOSMOS.supplyCoverageSystem = new SupplyCoverageSystem(colonyManager, groundUnitManager)`
- Tick w głównej pętli: `supplyCoverageSystem.update(civDeltaYears)` po `colonyManager.update()`
- EventBus `groundUnit:hit` → dodatkowe `morale -= 3`, `org -= 5` (w GroundUnitManager.attackUnit)

---

## 10. Wstrzyknięcie damageMult w walkę

W `src/systems/GroundUnitFactory.js` (metoda `getEffectiveDmg`):

```js
static getEffectiveDmg(attacker, target) {
  // ...existing counter bonus logic
  let dmg = baseDmg;

  // NOWE: damageMult z supply/org/morale
  const mult = computeDamageMult(attacker);
  dmg *= mult;

  // Counter bonus (existing)
  if (isCounter(attacker, target)) dmg *= 1.3;

  return dmg;
}

function computeDamageMult(unit) {
  if ((unit.supply ?? 0) <= 0) return 0;
  const supplyFactor = Math.min((unit.supply ?? 0) / 20, 1);
  const noMor = unit.noMorale === true;
  const coreSum = (unit.org ?? 0) + (noMor ? 0 : (unit.morale ?? 0));
  const coreDiv = noMor ? 100 : 200;  // drone — tylko org
  const coreBonus = coreSum / coreDiv;
  return supplyFactor * (1.0 + coreBonus);
}
```

W `GroundUnitManager.attackUnit()` (linia 403-449):

```js
attackUnit(attackerId, targetId) {
  // ...existing
  const dmgAfterCounter = GroundUnitFactory.getEffectiveDmg(atk, tgt);  // już zawiera damageMult
  const base     = Math.max(1, dmgAfterCounter - (tgt.defense ?? 0));
  // ...

  // NOWE: degradacja org/morale w walce
  atk.org    = Math.max(0, (atk.org ?? 0) - 5);
  tgt.org    = Math.max(0, (tgt.org ?? 0) - 5);
  if (!tgt.noMorale) tgt.morale = Math.max(0, (tgt.morale ?? 0) - 3);

  // NOWE: atakujący traci supply szybciej (2x) — tick SupplyCoverageSystem już to pokrywa przez status='attacking'
}
```

Dla capture speed (w `GroundUnitManager.capture()`):
```js
const mult = computeDamageMult(unit);
unit.captureProgress += (arch.captureRate ?? 1) * mult * civDt;
```

---

## 11. ColonyManager — nowe i zmienione (v3)

### Static tabele (rozszerz v2)

```js
static GROUND_UNIT_BUILD_COSTS = { /* jak v2 */
  ground_supply_unit: { Ti: 12, Si: 15, Cu: 8 },
};
static GROUND_UNIT_COMMODITY_COSTS = { /* jak v2 */
  ground_supply_unit: { structural_alloys: 5, electronic_systems: 3 },
};
static GROUND_UNIT_POP_COSTS = { /* jak v2 */
  ground_supply_unit: 0.3,
};
static GROUND_UNIT_CREDITS_BUILD = { /* jak v2 */
  ground_supply_unit: 350,
};
static GROUND_UNIT_UPKEEP = { /* jak v2 */
  ground_supply_unit: { energy: 2, credits: 5 },
};
static GROUND_UNIT_BUILD_TIMES = { /* jak v2 */
  ground_supply_unit: 1.2,
};
static GROUND_UNIT_POP_REINTEGRATION = { /* jak v2 */
  ground_supply_unit: { rate: 0.75, delay: 1.5 },
};

// NOWE — archetypy które nie liczą się do cap populacji (logistyka + drony)
static GROUND_UNIT_CAP_EXEMPT = ['recon_drone', 'ground_supply_unit'];
```

### Zmodyfikowany `startGroundUnitBuild`

Dodaj krok przed spawn:
```js
// ── 9. Init supply/org/morale przy dodaniu do kolejki ──
const bonuses = this.techSystem?.getTechStatBonuses?.() ?? { org:0, morale:0, supplyCap:0 };
const arch    = UNIT_ARCHETYPES[archetypeId];
colony.groundUnitQueues.push({
  archetypeId, factionId,
  progress:  0,
  buildTime: ColonyManager.GROUND_UNIT_BUILD_TIMES[archetypeId],
  popCost,
  // nowe:
  initialOrg:        Math.min(100, (arch.baseOrg       ?? 10) + bonuses.org),
  initialMorale:     Math.min(100, (arch.baseMorale    ?? 10) + bonuses.morale),
  initialSupplyCap:  Math.min(200, (arch.baseSupplyCap ?? 100) + bonuses.supplyCap),
});
```

W `_spawnGroundUnit()` po `createUnit()`:
```js
unit.maxOrg       = queueItem.initialOrg;
unit.maxMorale    = queueItem.initialMorale;
unit.org          = unit.maxOrg;
unit.morale       = unit.maxMorale;
unit.supplyCap    = queueItem.initialSupplyCap;
unit.supply       = unit.supplyCap;  // fresh = full
unit.status       = 'idle';
unit.transportStatus = null;  // null | 'loaded' | 'in_transit'
```

---

## 12. Transport integration — FROZEN supply

W `Vessel.js` przy załadowaniu ground unit do cargo:
```js
loadGroundUnit(unit) {
  unit.transportStatus = 'loaded';  // freeze supply
  unit.prevStatus       = unit.status;
  unit.status           = 'in_cargo';
  this.cargo.push(unit);
}

unloadGroundUnit(unit, q, r) {
  unit.transportStatus = null;
  unit.status           = unit.prevStatus ?? 'idle';
  unit.q = q; unit.r = r;
  // supply/org/morale zachowane (nie tickane podczas transportu)
}
```

Event `vessel:awayTeamLanding` → `unloadGroundUnit()` wywołuje się w ColonyOverlay/VesselManager.

---

## 13. UI changes

### 13.1 GroundUnitPanel (U) — cost row split

```
┌─────────────────────────────────────────────────┐
│  Shock Infantry — Rekrutacja                    │
├─────────────────────────────────────────────────┤
│ BUDOWA:                                         │
│   Ti 8  Si 5  Hv 2                              │
│   str_alloys 2  reactive 1                      │
│   👤 0.15 lab   💰 100 Kr                       │
│                                                 │
│ UTRZYMANIE:  ⚡ 0/y   💰 2 Kr/y                 │
│                                                 │
│ STATYSTYKI STARTOWE:                            │
│   Org: 25 / 25 (Lv+field_discipline)            │
│   Mor: 25 / 25 (elita +5)                       │
│   Supply cap: 120 (+military_logistics)          │
│   Konsumpcja supply: 3/civY                     │
│                                                 │
│ 🔒 Wymaga Barracks Lv2 + ground_warfare         │
│                                                 │
│   [ REKRUTUJ ]  |  Jednostki: 3/5 (max z pop)   │
└─────────────────────────────────────────────────┘
```

### 13.2 ColonyOverlay — status jednostki

Pod ikonką jednostki (sprite):
- **Pasek HP** (czerwony) — istniejący
- **Pasek Supply** (żółty) — NOWY, `supply/supplyCap`
- **Pasek Org** (niebieski) — NOWY, `org/maxOrg` (mały)
- **Pasek Morale** (zielony) — NOWY, `morale/maxMorale` (mały)
- Ikony statusu:
  - 🔌 offline (brak upkeep)
  - 🍖 starving (supply <= 0)
  - 📦 supplied (w coverage)

### 13.3 ColonyOverlay — Supply Coverage overlay

Toggle przyciskiem `S`:
- Heksy w coverage Capital → zielony tint (rgba(50,255,100,0.15))
- Heksy w coverage Barracks → błękitny tint
- Heksy w coverage Supply Unit → pomarańczowy tint
- Poza coverage (z aliami) → czerwony tint (starvation zone)

### 13.4 Tooltip jednostki (hover)

```
Shock Infantry "Orzeł 07"
──────────────────────────
HP:      38/40
Supply:  82/120   (base 3/civY, status: idle)
Org:     24/25    (regen +3/civY)
Morale:  23/25    (regen +5/civY, requires org>50)

Damage mult: ×1.00 × (1 + 0.47) = ×1.47
Coverage: ✅ Supply Unit "Logi-03" (adjacent)

[Atakuj] [Rusz] [Tankuj (Capital)]
```

---

## 14. Save migration v54 → v55

```js
function _migrateV54toV55(data) {
  if (!data.civ4x?.colonies) return data;

  for (const col of data.civ4x.colonies) {
    // nowe pola kolonii (z planu v2)
    col._pendingPopReturns = col._pendingPopReturns ?? [];

    // nowe commodities
    if (col.commodities) {
      col.commodities.military_supplies = col.commodities.military_supplies ?? 0;
    }
  }

  // Ground units — dodaj pola supply/org/morale
  if (data.civ4x?.groundUnits) {
    for (const u of data.civ4x.groundUnits) {
      if (u.supply === undefined) {
        // Stare unity nie mają supply — przyznaj pełne żeby nie wymrzeć po loadzie
        const arch = UNIT_ARCHETYPES[u.archetypeId] ?? {};
        u.maxOrg          = arch.baseOrg       ?? 10;
        u.maxMorale       = arch.baseMorale    ?? 10;
        u.org             = u.maxOrg;
        u.morale          = u.maxMorale;
        u.supplyCap       = arch.baseSupplyCap ?? 100;
        u.supply          = u.supplyCap;
        u.transportStatus = null;
        u.unpaidYears     = 0;
        u.status          = u.status ?? 'idle';
      }
    }
  }

  return data;
}

// SaveMigration.js
MIGRATIONS[54] = _migrateV54toV55;
export const CURRENT_VERSION = 55;
```

---

## 15. Kolejność implementacji (18 kroków)

1. **Weryfikacja** — `rocketry` ✅, `military` category ✅, `laborer` strata ✅, `attackUnit` w GroundUnitManager:403 ✅ (już zrobione)
2. **CommoditiesData.js** — dodać `military_supplies` (T2, gated `military_logistics`)
3. **FactoryRecipes (lub inline)** — recipe dla `military_supplies`
4. **TechData.js** — 7 techów: `military_logistics`, `field_discipline`, `combat_doctrine`, `elite_training`, `fleet_logistics`, `strategic_doctrine`, `veteran_corps`, + `ground_warfare` + `drone_warfare` z v2
5. **TechSystem.js** — metoda `getTechStatBonuses()` (+ subscribe `tech:researched` → emit `stats:techBonusesChanged`)
6. **BuildingsData.js** — 3 budynki `barracks_lv1/2/3`
7. **unitArchetypes.js** — rozszerz 6 archetypów o `baseOrg/baseMorale/baseSupplyCap/supplyConsumption`; dodaj `ARCHETYPE_REQUIREMENTS` helper; dodaj `ground_supply_unit`
8. **ShipsData.js** — dodać `space_supply_ship` (placeholder)
9. **VesselNames.js** — pool nazw dla supply ship
10. **ColonyManager.js** — 7 tabel kosztów (z `ground_supply_unit`), przepisać `startGroundUnitBuild` z sekcji 11 planu v2 + init org/morale/supply, `_getBarracksLevel()` (max z 3 budynków), `_getBarracksSlots()` (suma), `_tickGroundUnitUpkeep`, `_tickPendingPopReturns`, subscribe `groundUnit:destroyed`, serialize `_pendingPopReturns`
11. **GroundUnitManager.js** — nowe pola (`supply/org/morale/supplyCap/transportStatus/unpaidYears/status`), offline filters w `_tickCombatAI` / `_tickPassiveAbilities` / `capture()`, `attackUnit()` degradacja org -5/mor -3/atk.org -5, emit destroyed z popCost, serialize nowe pola
12. **GroundUnitFactory.js** — `getEffectiveDmg()` × `computeDamageMult(attacker)` + helper `computeDamageMult`
13. **SupplyCoverageSystem.js (NOWY)** — 6 faz tick'u z sekcji 9
14. **GameScene.js** — init `supplyCoverageSystem`, tick w pętli po `colonyManager.update()`
15. **Vessel.js** — `loadGroundUnit()/unloadGroundUnit()` ustawiają `transportStatus`
16. **UI:**
    - GroundUnitPanel.js — cost split BUDOWA/UTRZYMANIE/STATYSTYKI, lock overlay, queue/cap, Barracks Lv w headerze, dynamic recruit button z reason
    - ColonyOverlay.js — 3 nowe paski (supply/org/morale) pod sprite, ikony statusu (🔌🍖📦), coverage overlay (toggle `S`), tooltip jednostki z damageMult computation
17. **i18n/pl.js + en.js** — ~30 nowych kluczy (lista §18)
18. **SaveMigration.js** — `_migrateV54toV55`, `CURRENT_VERSION = 55`, backup `kosmos_save_backup_v54`
19. **CLAUDE.md + memory** — aktualizacja save version, opis Supply Coverage System, nowe eventy
20. **Testing** (§17)

---

## 16. EventBus — nowe eventy

| Event | Emitent | Odbiorca | Payload |
|---|---|---|---|
| `groundUnit:supplyChanged` | SupplyCoverageSystem | UI | `{ unitId, supply, max }` |
| `groundUnit:starved` | SupplyCoverageSystem | UI (alert) | `{ unitId, planetId }` |
| `groundUnit:orgChanged` | GroundUnitManager, Supply | UI | `{ unitId, org, max }` |
| `groundUnit:moraleChanged` | — | UI | `{ unitId, morale, max }` |
| `groundUnit:disbanded` | ColonyManager (upkeep) | UI, EventLog | `{ unitId, reason }` |
| `groundUnit:resumed` | ColonyManager (upkeep) | UI | `{ unitId }` |
| `supply:coverageChanged` | SupplyCoverageSystem | ColonyOverlay | `{ planetId, coverageMap }` |
| `colony:suppliesLow` | ResourceSystem (via tick) | EventLog | `{ colonyId, military_supplies }` |
| `tech:techBonusesRecomputed` | TechSystem | GroundUnitManager (propagate maxOrg/maxMorale na żywych) | `{ bonuses }` |

---

## 17. Acceptance criteria

### v2 carry-over (wszystko z planu v2)
- [ ] Barracks Lv1/2/3 gating jak w planie v2
- [ ] POP laborer lock + reintegracja
- [ ] Credits build + upkeep
- [ ] Offline state + grace 5 civYears → disband
- [ ] Cap od populacji (floor(pop/4), min 2)
- [ ] Rare materials per archetype (Hv driver ekspansji)

### v3 nowe (Supply/Org/Morale)
- [ ] `military_supplies` commodity dostępny po zbadaniu `military_logistics`
- [ ] Recipe `2Hv + 2Li + 1Ti + 1Si + 3food + 2water → 10 military_supplies` produkowalny w fabryce
- [ ] Fresh unit spawnuje z pełnym supply (cap) i maxOrg/maxMorale (startValue + techBonuses)
- [ ] Unit adjacent do Capital z `colony.commodities.military_supplies > 0` → refill 20/civY do cap, bez konsumpcji
- [ ] Unit w zasięgu Supply Unit (1 hex) → refill 10/civY, bez konsumpcji
- [ ] Unit poza coverage → konsumpcja per matryca §4 (`base`, `base × 1.5` moving, `base × 2` attacking)
- [ ] Unit z `transportStatus='loaded'` → **ZERO** konsumpcji niezależnie od czasu w ładowni
- [ ] Unit z supply=0 → damageMult=0 + morale -10/civY + HP -5%/civY attrition
- [ ] damageMult wzór działa: 0/*/*=0, 100/10/10=1.10, 100/100/100=2.00
- [ ] Capture speed też mnożony przez damageMult
- [ ] Supply Unit w Capital → tankuje 30/civY (priorytet nad allied units)
- [ ] Supply Unit transferuje 10/civY do każdego adjacent ally
- [ ] Zabicie Supply Unita → zerwanie coverage (unity w jego byłym zasięgu zaczynają konsumować)
- [ ] 7 techów da łącznie +90 org, +90 morale, +60 supply cap
- [ ] Combat: `attackUnit()` obniża org atk i tgt po -5, morale tgt -3
- [ ] Regen idle z supply: +3 org/civY, +5 morale/civY (wymaga org>50)
- [ ] UI: 3 nowe paski (supply/org/morale) pod sprite jednostki
- [ ] UI: coverage overlay (toggle `S`) — zielone/błękitne/pomarańczowe/czerwone heksy
- [ ] UI: tooltip z `damageMult` obliczonym live
- [ ] UI: ikony statusu 🔌🍖📦 nad sprite gdy odpowiedni stan
- [ ] Space Supply Ship da się zbudować po `fleet_logistics` (nawet jeśli placeholder — fleet-group mechanika w osobnym PR)
- [ ] Save v55: load gry v54 migruje — stare unity dostają `supply = cap`, `org = baseOrg + techBonuses`, `morale = baseMorale + techBonuses`
- [ ] Save round-trip: po F5 wszystkie pola zachowane

### Pytanie gracza — przyjazne UX
- [ ] Wysłanie jednostki na misję do innej planety: unit ląduje z supply IDENTYCZNYM jak przed załadowaniem (niezależnie od czasu lotu 0.5 civY czy 50 civY)

---

## 18. Nowe i18n keys (pl + en)

```
// Commodity
'commodity.military_supplies.name' / '.desc' / '.short'

// Techs (7)
'tech.military_logistics.name' / '.desc'
'tech.field_discipline.name' / '.desc'
'tech.combat_doctrine.name' / '.desc'
'tech.elite_training.name' / '.desc'
'tech.fleet_logistics.name' / '.desc'
'tech.strategic_doctrine.name' / '.desc'
'tech.veteran_corps.name' / '.desc'

// Buildings
'building.barracks_lv1.name' / '.desc'
'building.barracks_lv2.name' / '.desc'
'building.barracks_lv3.name' / '.desc'

// Archetypes (2)
'unit.ground_supply_unit.name' / '.desc'
'unit.space_supply_ship.name' / '.desc'

// Panel
'groundPanel.supply' = 'Supply' / 'Supply'
'groundPanel.org' = 'Organizacja' / 'Organization'
'groundPanel.morale' = 'Morale' / 'Morale'
'groundPanel.supplyCap' = 'Pojemność supply: {0}' / 'Supply cap: {0}'
'groundPanel.supplyConsumption' = 'Konsumpcja: {0}/civY' / 'Consumption: {0}/civY'
'groundPanel.damageMult' = 'Mnożnik dmg: ×{0}' / 'Damage mult: ×{0}'
'groundPanel.inCoverage' = '📦 W zasięgu supply ({0})' / '📦 In supply coverage ({0})'
'groundPanel.starving' = '🍖 Głodowanie — brak supply' / '🍖 Starving — no supply'
'groundPanel.loaded' = '💤 W transporcie — supply zamrożone' / '💤 In transport — supply frozen'

// Events
'event.groundUnit.starved' = 'Jednostka {0} umiera z głodu na {1}' / '{0} is starving on {1}'
'event.groundUnit.disbanded' = 'Jednostka {0} rozwiązana (brak utrzymania)' / '{0} disbanded (no upkeep)'
'event.colony.suppliesLow' = 'Niski stan military_supplies w {0}' / 'Military supplies low in {0}'
```

---

## 19. Decyzje podjęte (v3) + ryzyka

### Decyzje finalne

- Supply jako osobny commodity `military_supplies` (nie `{food, water, minerals}` bezpośrednio)
- Recipe bez Fe (2Hv + 2Li + 1Ti + 1Si + 3food + 2water → 10 military_supplies)
- 3 oddzielne barracks_lv1/2/3 (nie `upgradeRequires`)
- Transport FROZEN supply (obietnica gracz-friendly)
- Capital/Barracks adjacency = auto-supply (draw z colony.commodities)
- Supply Unit model (a): magazyn ruchomy 200, tankuje w Capital, karmi sąsiadów
- Space Supply Ship = placeholder — fleet-group mechanika w osobnym PR
- Starvation: damageMult=0 + morale -10/civY + HP -5%/civY
- damageMult dotyczy: damage, capture speed (nie dotyczy: HP, defense, range)
- Movement: supply<20 → cost +50%
- Combat degradacja: atak -5 org atk i tgt, tgt -3 morale
- Regen idle z supply: +3 org/civY, +5 morale/civY (wymaga org>50)
- 7 techów — liniowy wzrost +90/+90/+60 total
- Dron: `noMorale: true` — pomija morale w formułach (traktowane jako 0)
- Cap exempt od pop cap: `recon_drone`, `ground_supply_unit`

### Ryzyka + mitigacje

| Ryzyko | Mitigacja |
|---|---|
| `military_supplies` produkcja wymaga Hv którego gracz nie ma w Capital | Adjacency auto-supply dopiero gdy `colony.commodities.military_supplies > 0` → gracz musi najpierw rozbudować outpost metallic. BUT: fresh unit spawnuje z pełnym supply, więc ma ~33 civY żeby postawić outpost Hv przed pierwszym starvation. |
| Stare save v54 — unity bez supply | Migracja przyznaje `supply = cap` żeby nie umarły przy loadzie |
| Performance — 6 faz × N units × N planet per tick | `getActivePlanetIds()` zwraca tylko planety z unitami; coverage cached per `(planetId, generation)`; invalidate na `groundUnit:moved/spawned/destroyed`, `planet:buildResult` (barracks), `capital:moved` |
| UI overflow — 4 paski (HP/supply/org/morale) pod malutkim sprite | Paski kompaktowe 2px × 12px, kolorystyka: HP=czerwony, supply=żółty, org=niebieski, mor=zielony. Opcjonalnie zmergować org+mor w jeden "morale polowy" — do decyzji w UI. |
| Space Supply Ship "paper unit" może zmylić gracza | Tooltip: "[Placeholder] Mechanika fleet-supply w osobnym PR — obecnie statek nie wpływa na walkę w kosmosie." |
| `getTechStatBonuses` dotyczy wszystkich archetypów, włącznie z dronem mającym `noMorale` | W `_spawnGroundUnit` gdy `arch.noMorale`, ustawiamy `maxMorale = 0`, `morale = 0` — tech bonus do morale ignorowany dla dronów |
| Walka obniża org/morale u wszystkich — masywny raid może "rozbić" garnizon | Zamierzone gameplay. Garnizon w Capital (adjacent) regeneruje szybko dzięki supply + idle tagu po walce. |

---

## 20. Przyszłość (nie v3, do dalszych projektów)

1. **Fleet Groups** — grupowanie statków w locie → Space Supply Ship działa per-fleet-group jak Ground Supply Unit per-hex
2. **Retreat mechanic** — morale<20 → jednostka automatycznie cofa się do najbliższego Capital
3. **Combat veteran XP** — +1 org/+1 morale per wygrana bitwa (cap +10), "medal" w tooltip
4. **Supply chain visualization** — na GalaxyMap linia od Capital do frontu pokazująca przepływ supplies
5. **Supply raiding** — wrogie jednostki mogą zniszczyć Supply Unit → bonus reward (kradzione surowce)
6. **AI enemy** — wrogie cywilizacje też używają tego samego systemu (nie tylko gracz)
