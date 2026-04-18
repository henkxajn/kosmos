# Plan — Opcja C v2: Barracks + Tech Gating + Rich Cost Model

**Status**: ⏸ Zaplanowane, nie zaimplementowane. Aktualnie Opcja B + quick fix rare materials.
**Utworzone**: 2026-04-18 (v1), **przepisane**: 2026-04-18 (v2 — rozszerzone o POP/Credits/Energy upkeep + rare materials)
**Poprzedzony przez**: Opcja B (merged) — flat cost `{ Ti: 5, Si: 3, Hv: 1 }` po quick fixie

---

## Kontekst — co jest teraz w grze (Opcja B + quick fix)

- `GroundUnitPanel` (U) — katalog 6 archetypów + detail + recruit
- `ColonyManager.startGroundUnitBuild()` — rekrutacja z każdej kolonii, flat koszt `{ Ti: 5, Si: 3, Hv: 1 }`, 1.0 civYear
- Wszystkie 6 archetypów dostępne z Capital, brak gating'u
- `colony.groundUnitQueues[]`, save v54

## Cel Opcji C v2

Przemienić rekrutację z "kliknij + zapłać surowce" w **głęboki system gospodarczy** z:
1. **Gating** przez budynek Barracks (Lv1-3) + 2 techy (`ground_warfare`, `drone_warfare`)
2. **Skalowane koszty** rare materials per archetype (wymuszają outposty)
3. **POP cost** (permanent lock, laborer) — rekrutacja to prawdziwe poświęcenie populacji
4. **Credits build + upkeep** (Kr)
5. **Energy upkeep (flow)** — garnizony/AA pochłaniają prąd ciągle
6. **Mechaniki**: reintegracja POPów po śmierci, offline state przy braku upkeep, cap od populacji

---

## 1. Zmiana modelu kosztów — kluczowe różnice vs v1

### Co się zmieniło

| Aspekt | v1 | v2 |
|---|---|---|
| Pierwiastki | Abstrakcyjne `minerals` | Konkretne **Ti, Si, Hv, Xe** (rare, wymaga planetoid) |
| Energy | W build cost | **Upkeep only** (flow, nie stockpile) — `ResourceSystem.canAfford` pomija energy |
| POP strata | Mieszane (scientist/engineer/laborer) | **Zawsze `laborer`** (rekruci z wolnej populacji, nie poaching specjalistów) |
| Credits | Brak | **Build + upkeep** |
| Typy kosztów | Jeden `cost: {}` | Split: `buildCost{}` + `upkeep{ energy, credits }` |
| Gating archetypów | Barracks Lv | **Barracks Lv + tech** |
| Mechaniki dodatkowe | Brak | **A** (reintegracja POPów), **B** (offline state), **D** (cap populacji) |

### Pierwiastki i ich dostępność (driver ekspansji)

| Element | Home start | Planetoid źródło | Rola |
|---|---|---|---|
| **Ti** (Tytan) | 20 | metallic | Konstrukcja pojazdów, rakiet, kevlar |
| **Si** (Krzem) | 100 | silicate | Elektronika, procesory, CPU |
| **Hv** (Metale Ciężkie) | **0** | metallic | Ciężki pancerz, bunkry. **Wymaga outpostu!** |
| **Xe** (Ksenon) | **0** | gaz giant, silicate | Napędy jonowe, lasery. **Wymaga outpostu!** |

**Efekt gameplay**: Samo wybudowanie 1 garnizonu (25 Hv) wymaga outpostu metallic z kopalnią Hv. 1 recon drone (3 Xe) wymaga outpostu silicate/gas. → Rekrutacja = driver ekspansji, nie tylko mining dla $.

---

## 2. Finalna tabela kosztów (v3)

### Build cost (jednorazowo)

| Archetype | Ti | Si | Hv | Xe | Commodities | POP (laborer) | Kr |
|---|---|---|---|---|---|---|---|
| **shock_infantry** | 8 | 5 | 2 | 0 | str_alloys 2, reactive 1 | 0.15 | 100 |
| **garrison_unit** | 15 | 8 | **25** | 0 | str_alloys 5, reactive 4 | 0.30 | 250 |
| **rocket_artillery** | **20** | 12 | 18 | 1 | str_alloys 4, electronic 3, polymer 2 | 0.40 | 500 |
| **aa_platform** | 10 | **25** | 8 | 2 | str_alloys 3, electronic 4, metamaterials 1 | 0.30 | 400 |
| **medic_unit** | 8 | 10 | 5 | 0 | polymer 3, bio_cultures 2 | 0.25 | 300 |
| **recon_drone** | 5 | 18 | 0 | **3** | electronic 3, polymer 2 | **0** | 400 |
| **TOTAL 1×each** | **66** | **78** | **58** | **6** | — | 1.4 | 1950 Kr |

### Upkeep (per civYear, flow-based)

| Archetype | Energy/y | Credits/y | Uzasadnienie |
|---|---|---|---|
| shock_infantry | 0 | 2 | żołnierze, zero elektroniki na stałe |
| garrison_unit | **4** | 5 | tarcze + radar + ogrzewanie 24/7 |
| rocket_artillery | 2 | 10 | systemy pojazdu, konserwacja |
| aa_platform | **3** | 8 | radar stale aktywny |
| medic_unit | 0 | 6 | sprzęt pasywny, zaopatrzenie |
| recon_drone | 1 | 8 | stacja dokująca, ładowanie baterii |

**Per 1 z każdego**: 10 energy/y flow + 39 Kr/y.

### Build time (stały)

| Archetype | Time |
|---|---|
| shock_infantry | 0.8 civYear |
| garrison_unit | 1.2 |
| rocket_artillery | 1.4 |
| aa_platform | 1.1 |
| medic_unit | 1.0 |
| recon_drone | 0.8 |

---

## 3. Mechaniki gameplay (A + B + D)

### 🎖 Mechanika A — Reintegracja POPów po śmierci jednostki

Gdy unit ginie (`groundUnit:destroyed`), część POPów wraca do puli po opóźnieniu:

| Archetype | Reintegracja | Opóźnienie | Lore |
|---|---|---|---|
| shock_infantry | **50%** | 2 civYear | rekonwalescencja rannych |
| garrison_unit | **100%** | 1 civYear | ewakuacja bunkra |
| rocket_artillery | 50% | 2 civYear | obsługa częściowo ranna |
| aa_platform | 50% | 2 civYear | technicy ocaleni |
| medic_unit | **75%** | 1 civYear | medycy ratują siebie i innych |
| recon_drone | **0%** | — | to maszyna, nie ma POPów |

**Implementacja**:
```js
// ColonyManager — subscribe do 'groundUnit:destroyed'
// Dodaj do colony._pendingPopReturns = [{ amount, strata: 'laborer', readyAt }]
// Tick sprawdza readyAt, woła civSystem.unlockPops(amount, strata)
```

### 💰 Mechanika B — Upkeep z offline state + grace period

**Tick upkeep co 1.0 civYear** (akumulator w ColonyManager, nowy):
```js
_tickGroundUnitUpkeep(civDeltaYears) {
  this._upkeepAccum += civDeltaYears;
  if (this._upkeepAccum < 1.0) return;
  this._upkeepAccum -= 1.0;
  
  for (const colony of this._colonies.values()) {
    // Oblicz total upkeep wszystkich żywych jednostek w kolonii
    const units = getGroundUnitsInColony(colony);
    let totalEnergy = 0, totalKr = 0;
    for (const u of units) {
      const up = UPKEEP[u.archetypeId];
      totalEnergy += up.energy;
      totalKr    += up.credits;
    }
    
    // Sprawdź energy flow (produkcja ≥ upkeep?)
    const energyFlow = colony.resourceSystem.snapshot().energy.perYear;
    const hasEnergy = (energyFlow >= totalEnergy);
    const hasCredits = (colony.credits >= totalKr);
    
    if (hasEnergy && hasCredits) {
      colony.credits -= totalKr;
      // Wszystkie jednostki online — reset unpaidYears
      for (const u of units) u.unpaidYears = 0;
    } else {
      // Któraś zapłata nie przeszła → wszystkie jednostki offline
      for (const u of units) {
        u.status = 'offline';
        u.unpaidYears = (u.unpaidYears ?? 0) + 1;
        if (u.unpaidYears >= 5) {
          // DISBAND — pełne zwrócenie POPów (nie przez reintegrację)
          EventBus.emit('groundUnit:disbanded', { unitId: u.id, reason: 'no_upkeep' });
          const popCost = PLAYER_UNIT_POP_COSTS[u.archetypeId];
          colony.civSystem.unlockPops(popCost, 'laborer');
          window.KOSMOS.groundUnitManager.removeUnit(u.id);
        }
      }
    }
  }
}
```

**Efekt offline**:
- `status = 'offline'` → w `GroundUnitManager._tickCombatAI` skip; w `capture()` return false; w `_tickPassiveAbilities` skip (medic nie leczy)
- Renderer pokazuje szary filter + ikonę 🔌 nad jednostką (ColonyOverlay, GroundUnitPanel)

**Resume**: gdy upkeep znów opłacony → `status = 'idle'`, `unpaidYears = 0`, EventBus `'groundUnit:resumed'`.

### 📊 Mechanika D — Cap militarny od populacji

```js
getMaxGroundUnits(colony) {
  const pop = Math.floor(colony.civSystem?.population ?? 0);
  return Math.max(2, Math.floor(pop / 4));  // minimum 2 zawsze
}

canRecruitMoreUnits(colony, archetypeId) {
  // Drony NIE liczą się do cap (autonomiczne)
  if (archetypeId === 'recon_drone') return true;
  
  const mgr = window.KOSMOS.groundUnitManager;
  const units = mgr.getUnitsOnPlanet(colony.planetId)
    .filter(u => u.owner === 'player' && u.archetypeId !== 'recon_drone');
  
  return units.length < getMaxGroundUnits(colony);
}
```

**W panelu**: wyświetl "Jednostki: 3/5" (current/max); przycisk Recruit disabled gdy pełne.

---

## 4. Gating archetypów przez Barracks + Tech

### Tabela wymagań

| Archetype | Barracks Lv | Tech |
|---|---|---|
| shock_infantry | 1 | — |
| garrison_unit | 1 | — |
| rocket_artillery | 2 | `ground_warfare` |
| aa_platform | 2 | `ground_warfare` |
| medic_unit | 3 | `ground_warfare` |
| recon_drone | 3 | `drone_warfare` |

### Helpery (`src/data/unitArchetypes.js`)

```js
const ARCHETYPE_REQUIREMENTS = {
  shock_infantry:   { barracksLv: 1, tech: null },
  garrison_unit:    { barracksLv: 1, tech: null },
  rocket_artillery: { barracksLv: 2, tech: 'ground_warfare' },
  aa_platform:      { barracksLv: 2, tech: 'ground_warfare' },
  medic_unit:       { barracksLv: 3, tech: 'ground_warfare' },
  recon_drone:      { barracksLv: 3, tech: 'drone_warfare' },
};

export function getArchetypeRequirements(archetypeId) {
  return ARCHETYPE_REQUIREMENTS[archetypeId] ?? { barracksLv: 1, tech: null };
}

export function checkArchetypeUnlocked(archetypeId, colony, techSystem) {
  const req = getArchetypeRequirements(archetypeId);
  if (req.tech && !techSystem?.isResearched?.(req.tech)) {
    return { unlocked: false, reason: 'tech', missing: req.tech };
  }
  const lv = getBarracksLevel(colony);
  if (lv < req.barracksLv) {
    return { unlocked: false, reason: 'barracks', requiredLv: req.barracksLv, currentLv: lv };
  }
  return { unlocked: true };
}
```

---

## 5. Nowy budynek Barracks (`src/data/BuildingsData.js`)

```js
barracks: {
  id:       'barracks',
  namePL:   'Koszary',
  nameEN:   'Barracks',
  descPL:   'Centrum rekrutacji i treningu jednostek naziemnych. Każdy poziom = 1 slot budowy równoczesnej.',
  descEN:   'Recruitment and training facility. Each level = 1 concurrent build slot.',
  icon:     '🪖',
  category: 'military',
  housing:  0,
  popCost:  0.25,
  maxLevel: 3,
  allowedTerrain: ['plains', 'desert', 'tundra', 'wasteland', 'crater'],

  // Lv1 base cost — dostępny od razu (bez tech)
  cost: { Fe: 60, Ti: 20, Cu: 15 },
  commodityCost: { structural_alloys: 6, reactive_armor: 3 },
  buildTime: 1.5,

  // BuildingSystem._upgrade używa baseCost × level × 1.5
  // Lv2 upgrade: 90 Fe, 30 Ti, 22 Cu + 9 str_alloys, 4.5 reactive
  // Lv3 upgrade: 180 Fe, 60 Ti, 45 Cu + 18 str_alloys, 9 reactive
  
  // Dodatkowe wymagania per upgrade level (nowy mechanizm — do dopisania w BuildingSystem._upgrade)
  upgradeRequires: {
    2: { tech: 'ground_warfare' },
    3: { tech: 'drone_warfare' },
  },

  baseRates: {},
  isAutonomous: false,
},
```

**Decyzja implementacyjna**: `upgradeRequires` to NOWY mechanizm — w `BuildingSystem._upgrade()` trzeba dopisać sprawdzenie. Alternatywa (bezpieczniejsza): 3 oddzielne budynki `barracks_lv1/lv2/lv3` każdy z klasycznym `requires: 'tech_X'`. Wybór w czasie implementacji.

---

## 6. Nowe techy (`src/data/TechData.js`)

```js
ground_warfare: {
  id: 'ground_warfare',
  namePL: 'Wojna Lądowa',
  nameEN: 'Ground Warfare',
  descPL: 'Doktryna walki pojazdów i wsparcia. Odblokowuje Barracks Lv2 + artylerię, obronę AA, medyków.',
  descEN: 'Vehicle combat and support doctrine. Unlocks Barracks Lv2 + artillery, AA, medics.',
  tier: 2,
  cost: { research: 150 },
  requires: ['rocketry'],   // zweryfikować w TechData przed implementacją
  unlocks: {
    upgradeBuilding: 'barracks_lv2',
    archetypes: ['rocket_artillery', 'aa_platform', 'medic_unit'],
  },
  icon: '⚔',
},

drone_warfare: {
  id: 'drone_warfare',
  namePL: 'Wojna Dronowa',
  nameEN: 'Drone Warfare',
  descPL: 'Zdalnie sterowane i autonomiczne systemy bojowe. Odblokowuje Barracks Lv3 + drona zwiadowczego.',
  descEN: 'Remote-controlled and autonomous combat systems. Unlocks Barracks Lv3 + recon drone.',
  tier: 3,
  cost: { research: 280 },
  requires: ['ground_warfare'],
  unlocks: {
    upgradeBuilding: 'barracks_lv3',
    archetypes: ['recon_drone'],
  },
  icon: '🛰',
},
```

---

## 7. ColonyManager — nowe/zmienione metody

### Zmienione

```js
// static — pełne tabele per archetyp
static GROUND_UNIT_BUILD_COSTS = {
  shock_infantry:   { Ti: 8, Si: 5, Hv: 2 },
  garrison_unit:    { Ti: 15, Si: 8, Hv: 25 },
  rocket_artillery: { Ti: 20, Si: 12, Hv: 18, Xe: 1 },
  aa_platform:      { Ti: 10, Si: 25, Hv: 8, Xe: 2 },
  medic_unit:       { Ti: 8, Si: 10, Hv: 5 },
  recon_drone:      { Ti: 5, Si: 18, Xe: 3 },
};

static GROUND_UNIT_COMMODITY_COSTS = {
  shock_infantry:   { structural_alloys: 2, reactive_armor: 1 },
  garrison_unit:    { structural_alloys: 5, reactive_armor: 4 },
  rocket_artillery: { structural_alloys: 4, electronic_systems: 3, polymer_composites: 2 },
  aa_platform:      { structural_alloys: 3, electronic_systems: 4, metamaterials: 1 },
  medic_unit:       { polymer_composites: 3, bio_cultures: 2 },
  recon_drone:      { electronic_systems: 3, polymer_composites: 2 },
};

static GROUND_UNIT_POP_COSTS = {
  shock_infantry: 0.15, garrison_unit: 0.30, rocket_artillery: 0.40,
  aa_platform: 0.30, medic_unit: 0.25, recon_drone: 0.00,
};

static GROUND_UNIT_CREDITS_BUILD = {
  shock_infantry: 100, garrison_unit: 250, rocket_artillery: 500,
  aa_platform: 400, medic_unit: 300, recon_drone: 400,
};

static GROUND_UNIT_UPKEEP = {
  shock_infantry:   { energy: 0, credits: 2 },
  garrison_unit:    { energy: 4, credits: 5 },
  rocket_artillery: { energy: 2, credits: 10 },
  aa_platform:      { energy: 3, credits: 8 },
  medic_unit:       { energy: 0, credits: 6 },
  recon_drone:      { energy: 1, credits: 8 },
};

static GROUND_UNIT_BUILD_TIMES = {
  shock_infantry: 0.8, garrison_unit: 1.2, rocket_artillery: 1.4,
  aa_platform: 1.1, medic_unit: 1.0, recon_drone: 0.8,
};

static GROUND_UNIT_POP_REINTEGRATION = {
  shock_infantry:   { rate: 0.5, delay: 2.0 },
  garrison_unit:    { rate: 1.0, delay: 1.0 },
  rocket_artillery: { rate: 0.5, delay: 2.0 },
  aa_platform:      { rate: 0.5, delay: 2.0 },
  medic_unit:       { rate: 0.75, delay: 1.0 },
  recon_drone:      { rate: 0.0, delay: 0.0 },
};

static UPKEEP_GRACE_CIVYEARS = 5; // offline → disband
```

### startGroundUnitBuild — nowa logika

```js
startGroundUnitBuild(planetId, archetypeId, factionId = 'humanity') {
  const colony = this.getColony(planetId);
  if (!colony) return { ok: false, reason: 'colony_not_found' };
  if (!UNIT_ARCHETYPES[archetypeId]) return { ok: false, reason: 'unknown_archetype' };

  // ── 1. Check Barracks + Tech gating ──
  const unlock = checkArchetypeUnlocked(archetypeId, colony, this.techSystem);
  if (!unlock.unlocked) return { ok: false, reason: unlock.reason, missing: unlock.missing };

  // ── 2. Check population cap (mechanika D) ──
  if (!canRecruitMoreUnits(colony, archetypeId)) {
    return { ok: false, reason: 'cap_reached', max: getMaxGroundUnits(colony) };
  }

  // ── 3. Check Barracks slot availability ──
  const barracksLv = this._getBarracksLevel(colony);
  if (!colony.groundUnitQueues) colony.groundUnitQueues = [];
  if (colony.groundUnitQueues.length >= barracksLv) {
    return { ok: false, reason: 'barracks_full', current: colony.groundUnitQueues.length, max: barracksLv };
  }

  // ── 4. Check POP availability (free laborers) ──
  const popCost = ColonyManager.GROUND_UNIT_POP_COSTS[archetypeId];
  if (popCost > 0) {
    const freePops = colony.civSystem?.freePops ?? 0;
    if (freePops < popCost) {
      return { ok: false, reason: 'no_free_pops', required: popCost, available: freePops };
    }
  }

  // ── 5. Check Credits (build) ──
  const krCost = ColonyManager.GROUND_UNIT_CREDITS_BUILD[archetypeId];
  if ((colony.credits ?? 0) < krCost) {
    return { ok: false, reason: 'no_credits', required: krCost, available: colony.credits ?? 0 };
  }

  // ── 6. Check surowce + commodities ──
  const elementCost   = ColonyManager.GROUND_UNIT_BUILD_COSTS[archetypeId];
  const commodityCost = ColonyManager.GROUND_UNIT_COMMODITY_COSTS[archetypeId];
  const allCost = { ...elementCost, ...commodityCost };
  if (!colony.resourceSystem.canAfford(allCost)) {
    return { ok: false, reason: 'cannot_afford' };
  }

  // ── 7. All checks passed — pobierz zasoby ──
  colony.resourceSystem.spend(allCost);
  colony.credits -= krCost;
  if (popCost > 0) colony.civSystem.lockPops(popCost, 'laborer');

  // ── 8. Dodaj do kolejki ──
  colony.groundUnitQueues.push({
    archetypeId,
    factionId,
    progress:  0,
    buildTime: ColonyManager.GROUND_UNIT_BUILD_TIMES[archetypeId],
    popCost,   // zapamiętaj do unlock na disband/death
  });

  EventBus.emit('groundUnit:buildStarted', { planetId, archetypeId, factionId, krCost, popCost });
  return { ok: true };
}
```

### Nowe metody

- `_getBarracksLevel(colony)` — max level z wszystkich barracks w kolonii
- `_tickGroundUnitUpkeep(civDt)` — tick co 1.0 civYear (sekcja 3 B)
- `_tickPendingPopReturns(civDt)` — reintegracja POPów (sekcja 3 A)
- Subscribe `'groundUnit:destroyed'` — dodaje do `colony._pendingPopReturns`

### Zmodyfikowane

- `_tickGroundUnitBuilds(dt)` — dodaj speed bonus wg wolnych slotów Barracks (jak shipyard)
- `_spawnGroundUnit(colony, archetypeId, factionId)` — po spawn NIE unlock POPów (są już zablokowane on permanent)

---

## 8. GroundUnitManager — integracja

### Nowe pola na unit

- `unit.unpaidYears` — licznik civYears bez upkeep
- `unit.status === 'offline'` — nowy stan

### Modyfikacje

```js
// _tickCombatAI — skip offline
for (const atk of enemies) {
  if (atk.hp <= 0 || atk.status === 'moving' || atk.status === 'offline') continue;
  // ...
}

// _tickPassiveAbilities — skip offline dla medic/drone
for (const medic of this._units.values()) {
  if (medic.abilityId !== 'heal_nearby') continue;
  if ((medic.hp ?? 0) <= 0 || medic.status === 'offline') continue;
  // ...
}

// capture() — skip offline
capture(unitId) {
  const unit = this._units.get(unitId);
  if (!unit || unit.status === 'offline') return { success: false, reason: 'offline' };
  // ...
}
```

### Emit `groundUnit:destroyed` z popCost

```js
// attackUnit → kill branch:
EventBus.emit('groundUnit:destroyed', {
  unitId: targetId, planetId: tgt.planetId, owner: tgt.owner, killedBy: attackerId,
  archetypeId: tgt.archetypeId,
  popCost: ColonyManager.GROUND_UNIT_POP_COSTS[tgt.archetypeId] ?? 0,
});
```

### Serializuj `unpaidYears` + `status` w restore

---

## 9. UI changes (`GroundUnitPanel`)

### Cost row split

```
┌──────────────────────────────────────┐
│ BUDOWA:  Ti 20  Si 12  Hv 18  Xe 1  │
│          str_alloys 4  electronic 3 │
│          👤 0.4 lab  💰 500 Kr       │
│                                      │
│ UTRZYMANIE:  ⚡ 2/y  💰 10 Kr/y      │
└──────────────────────────────────────┘
```

### Queue display z cap

"Kolejka: 2 / slots 3 (Barracks Lv3)"
"Jednostki: 4 / 5 (max z pop 20)"

### Lock overlay na tile

Tile zablokowany → szary filter + `🔒` + tooltip "Wymaga Barracks Lv2 + ground_warfare"

### Offline indicator

Zrekrutowana jednostka offline → w ColonyOverlay sprite otrzymuje szary filter + `🔌` ikonę, tooltip "Offline — brak energii/kredytów (3/5 civYears)"

### Barracks level display

Pod "Kolonia" w nagłówku: `🪖 Barracks Lv 2/3` (obecny level + max możliwy w kolonii)

---

## 10. Save migration v54 → v55

```js
function _migrateV54toV55(data) {
  if (data.civ4x?.colonies) {
    for (const col of data.civ4x.colonies) {
      col._pendingPopReturns = col._pendingPopReturns ?? [];
    }
  }
  // Istniejące groundUnits nie mają unpaidYears → tick doda je lazy
  return data;
}
```

---

## 11. Kolejność implementacji (14 kroków)

1. `src/data/TechData.js` — `ground_warfare` + `drone_warfare` (**zweryfikuj** że `rocketry` istnieje)
2. `src/data/BuildingsData.js` — `barracks` (decyzja: `upgradeRequires` vs 3 oddzielne budynki)
3. `src/data/unitArchetypes.js` — `ARCHETYPE_REQUIREMENTS` + helpery `getArchetypeRequirements`, `checkArchetypeUnlocked`
4. `src/systems/BuildingSystem.js` — handling `upgradeRequires` w `_upgrade()` (jeśli wybrany mechanizm)
5. `src/systems/ColonyManager.js`:
   - 7 static tabel kosztów (Build/Commodity/Pop/Credits/Upkeep/Time/Reintegration)
   - `_getBarracksLevel(colony)`, `getMaxGroundUnits(colony)`, `canRecruitMoreUnits(colony, archId)`
   - Przepisz `startGroundUnitBuild` (8 sprawdzeń)
   - `_tickGroundUnitUpkeep(civDt)` + `_tickPendingPopReturns(civDt)` + speed bonus w `_tickShipBuilds`-style dla builds
   - Subscribe `'groundUnit:destroyed'`
   - Serialize `_pendingPopReturns`
6. `src/systems/GroundUnitManager.js`:
   - Offline state (filters w `_tickCombatAI`, `_tickPassiveAbilities`, `capture`)
   - Emit `destroyed` z `popCost`
   - Serialize `unpaidYears, status`
7. `src/ui/GroundUnitPanel.js`:
   - Cost row split (BUDOWA + UTRZYMANIE)
   - Lock overlay na tile + tooltip reasoning
   - Queue + cap display w actions row
   - Barracks level display w headerze
   - Dynamic recruit button (disabled z konkretnym reason)
8. `src/ui/ColonyOverlay.js` — offline indicator (🔌 + szary filter)
9. `src/i18n/pl.js` + `en.js` — nowe klucze (sekcja 12)
10. `src/systems/SaveMigration.js` — bump v54→v55
11. `CLAUDE.md` — eventy `groundUnit:disbanded`, `groundUnit:resumed`
12. `memory/ground-unit-system.md` — sekcja "Opcja C"
13. Testy:
    - Barracks Lv1: tylko shock + garrison
    - Zbadaj ground_warfare, upgrade Lv2: dodatkowe 3 archetypy
    - Sprawdź POP check (brak wolnych laborer → reject)
    - Sprawdź Kr check (brak kredytów → reject)
    - Build garrison (Hv 25) — sprawdź że Hv potrzebne z outpostu
    - Upkeep: odetnij zasilanie → garrison offline → 5 civYears → disband
    - Reintegracja: zabij marines → po 2 civYear 50% POPów wraca
    - Cap: zbuduj 5 jednostek przy pop 20, próbuj 6 → reject
14. Acceptance criteria (sekcja 13)

## 12. Nowe i18n keys

```
barracks.name / .desc
groundPanel.buildCost = 'BUDOWA' / 'BUILD COST'
groundPanel.upkeepCost = 'UTRZYMANIE' / 'UPKEEP'
groundPanel.popLabel = 'lab' / 'lab'   (skrót od laborer)
groundPanel.lockedTech = '🔒 Wymaga tech: {0}' / '🔒 Requires tech: {0}'
groundPanel.lockedBarracks = '🔒 Wymaga Barracks Lv{0}' / '🔒 Requires Barracks Lv{0}'
groundPanel.noBarracks = '🔒 Brak Koszar' / '🔒 No Barracks'
groundPanel.barracksFull = 'Koszary pełne ({0}/{1})' / 'Barracks full'
groundPanel.barracksLv = '🪖 Barracks Lv {0}/{1}' / '🪖 Barracks Lv {0}/{1}'
groundPanel.cap = 'Jednostki: {0}/{1}' / 'Units: {0}/{1}'
groundPanel.capReached = 'Max jednostek ({0})' / 'Unit cap ({0})'
groundPanel.noFreePops = 'Brak wolnych POPów (wymagane {0})' / 'No free POPs (need {0})'
groundPanel.noCredits = 'Brak kredytów (wymagane {0} Kr)' / 'No credits (need {0} Kr)'
groundPanel.offlineUnit = 'Offline — brak utrzymania ({0}/5)' / 'Offline — no upkeep ({0}/5)'
tech.ground_warfare.name / .desc
tech.drone_warfare.name / .desc
groundUnit.disbanded = 'Jednostka rozwiązana (brak utrzymania)' / 'Unit disbanded (no upkeep)'
groundUnit.resumed = 'Jednostka aktywna' / 'Unit resumed'
```

## 13. Acceptance criteria

- [ ] Barracks Lv1 dostępny bez tech; Lv2 wymaga `ground_warfare`; Lv3 wymaga `drone_warfare`
- [ ] Bez Barracks: wszystkie 6 archetypów zablokowane w UI, recruit disabled
- [ ] Z Barracks Lv1: shock + garrison odblokowane; pozostałe lock
- [ ] Z Barracks Lv2 + `ground_warfare`: + rocket_artillery, aa_platform, medic_unit
- [ ] Z Barracks Lv3 + `drone_warfare`: + recon_drone
- [ ] Build garrison: zużyta Hv 25 → wymaga outpostu metallic z kopalnią Hv
- [ ] Build drone: zużyty Xe 3 → wymaga outpostu gaz/silicate z Xe
- [ ] Rekrutacja blokuje 0.15-0.4 POPa jako `laborer` (freePops spada)
- [ ] Kredyty pobrane przy rekrutacji (colony.credits -= krCost)
- [ ] Tick upkeep co 1.0 civYear: energy flow check + credits spend
- [ ] Brak energy LUB brak Kr → wszystkie jednostki kolonii `offline`
- [ ] 5 civYears offline → disband + 100% POP zwrot
- [ ] Odcięcie upkeep i wznowienie → unit offline → resumed (nie disband)
- [ ] Killed marines → po 2 civYear 50% popCost wraca do puli laborer
- [ ] Killed garrison → po 1 civYear 100% popCost wraca
- [ ] Killed drone → 0% zwrotu (zero popCost anyway)
- [ ] Cap: pop 8 → max 2 jednostki (floor(8/4))
- [ ] Cap: pop 2 → max 2 (safety minimum)
- [ ] Drony nie liczone w cap (buduj unlimited dronów)
- [ ] Save v55 → po F5 wszystkie pola zachowane (unpaidYears, _pendingPopReturns, queue)
- [ ] UI panel pokazuje split BUDOWA/UTRZYMANIE z wszystkimi kosztami per archetype
- [ ] Offline jednostka na ColonyOverlay: 🔌 + szary filter

## 14. Ryzyka + decyzje do podjęcia

| Ryzyko | Mitigacja |
|---|---|
| BuildingsData.js — krytyczny plik | Dodaj barracks izolowanie, test izolowane przed save migration |
| `upgradeRequires` nowy mechanizm | Alternatywa: 3 oddzielne budynki barracks_lv1/2/3 z `requires: 'tech'` — tradycyjne |
| Tech `rocketry` może nie istnieć | **Zweryfikować w TechData.js przed startem** |
| Category `military` i `TERRAIN.allowedCategories` | **Sprawdzić obecne kategorie** — jeśli brak `military` w biomach, dodać |
| Commodity names (`polymer_composites`, `bio_cultures`, `metamaterials`) | **Zweryfikować w CommoditiesData.js** — dopasować nazwy |
| Strata `laborer` check — `civSystem.freePops` API | **Zweryfikować w CivilizationSystem.js** — czy jest `freePops` getter? |
| `lockPops(amount, strata)` — istnienie | **Zweryfikować** — statki używają tego, więc powinno być |
| Stare save v54 — kolejka bez `popCost` / `unpaidYears` | Migracja dodaje defaults; unit z kolejki bez `popCost` → tick ignoruje POP unlock przy disband (bezpieczne) |
| Disband offline units — utrata kosztów (surowców, Kr, POPów) | Reintegracja POPów 100% = akceptowalne; surowce + Kr tracone (lesson learned dla gracza) |

### Decyzje do podjęcia na początku implementacji

1. **`upgradeRequires` mechanizm vs 3 oddzielne budynki** — simplest decision: **3 oddzielne budynki** (mniej zmian w BuildingSystem, bezpieczniejsze)
2. **Tech prerequisite dla `ground_warfare`** — `rocketry` czy coś innego? Zweryfikować w TechData
3. **Commodity nazwy** — dokładne ID z `CommoditiesData.js` (mogą różnić się od `structural_alloys`)
4. **Czy `bio_cultures` istnieje?** — jeśli nie, zastąpić np. `polymer_composites 5`
5. **Housing w barracks** — 0 czy wpływa na housing? Obecnie plan = 0

### Decyzje już podjęte (z ostatniej iteracji)

- Cap minimum: **2 jednostki**
- Grace period upkeep: **5 civYears**
- Reintegracja garrison: **100%**
- Drony NIE liczone w cap
- Penalty offline: nie atakuje/nie rusza/nie leczy (BEZ +50% dmg taken)
- Upkeep tick: co **1.0 civYear**
- POP strata: **zawsze laborer**

## 15. Historia decyzji

- 2026-04-18: Plan v1 — Barracks + gating + skalowane koszty minerals/energy
- 2026-04-18: User uwagi → rewrite v2: POP (laborer only), Credits, Energy upkeep (flow), mechaniki A+B+D, rare materials (Ti/Si/Hv/Xe zamiast "minerals")
- 2026-04-18: Quick fix Opcji B — `GROUND_UNIT_COST = { Ti: 5, Si: 3, Hv: 1 }` (ready for testing)
- TBD: Implementacja Opcji C v2

## 16. Co ZOSTANIE bez zmian

- Layout UI `GroundUnitPanel` — ta sama struktura (tylko bogatsze cost row)
- `GroundUnitManager` combat logic — bez zmian (dodaje tylko offline filter)
- `GroundUnitFactory`, `GlbSnapshotRenderer` — bez zmian
- Save v53 migracja (archetypy) — bez zmian
- Mapy, spawn spiral od Capital — bez zmian
- Capture, stealth, minefields, passive abilities — bez zmian
