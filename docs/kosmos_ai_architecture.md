# KOSMOS — Architektura AI (Plan Główny)

## Filozofia

Hybryda Stellaris-style: 3 warstwy działające niezależnie, każda z innym frameworkiem.

```
┌─────────────────────────────────────────────────────────────┐
│ Warstwa C: Strategiczne Akcje (Slice 2-4)                   │
│ Trigger-based scripts: kolonizacja, atak, eksploracja, ...  │
│ KOSZT: zużywa surowce z inventory → naturalna dyskretność   │
└─────────────────────────────────────────────────────────────┘
                       ↓ ustawia targets
┌─────────────────────────────────────────────────────────────┐
│ Warstwa B: Auto-rozbudowa Kolonii (Slice 1 Faza 2)          │
│ Deklaratywne targets per archetyp (year 10/20/30/40)        │
│ Plus reaktywne reguły survival (food/water/energy)          │
└─────────────────────────────────────────────────────────────┘
                       ↓ wywołuje API kolonii
┌─────────────────────────────────────────────────────────────┐
│ Warstwa A: Symulacja Ekonomii ECS (Slice 1 Faza 1 ✅)       │
│ Czysta symulacja: POPy, budynki, surowce, fabryki           │
│ Maintenance tick force _reapplyAllRates                     │
└─────────────────────────────────────────────────────────────┘
```

## Warstwa A — Symulacja Ekonomii (UKOŃCZONA)

Status: Slice 1 Faza 1, patch v5.
Komponenty: ECS (POPy, budynki, ResourceSystem, FactorySystem), EmpireColonyMaintenance.

## Warstwa B — Auto-rozbudowa Kolonii

### Filozofia

Zamiast Utility AI — **deklaratywne target states** per archetyp.
AI po roku X dokładnie wie gdzie ma być. Iteruje target → buduje co brakuje.

### Targets dla Industrialist (przykładowy schemat — do uściślenia przez nagrania)

```js
year_10_target: {
  factories: { count: 2, level: 2 },
  mines: { count: 3, level: 2 },
  farms: { count: 3, level: 2 },
  wells: { count: 3, level: 2 },
  habitats: { count: 2 },
  solar_farms: { count: 3, level: 2 },
}

year_20_target: {
  factories: { count: 5, level: 4 },
  mines: { count: 6, level: 4 },
  farms: { count: 4, level: 3 },
  wells: { count: 5, level: 3 },
  habitats: { count: 4, except_homeworld: true },
  // Tier 2 commodities — safety stock per commodity
  tier2_commodities_safety: { all: 20 },
}

year_30_target: {
  // ...
  // Android workers safety stock 20 → umożliwia kolonizację
  tier3_commodities_safety: { android_workers: 20 },
}

year_40_target: {
  // ...
}
```

### Reaktywne reguły survival

Niezależnie od target — zawsze sprawdzaj:
- `energy_balance < 10` → priorytet build solar_farm
- `food_deficit OR food_stock < 50` → build farm
- `water_deficit OR water_stock < 50` → build well

### Konkretne liczby

**KLUCZOWE**: dokładne liczby (5 fabryk? 7 fabryk? lvl 4? lvl 5?) zostaną wyciągnięte
z nagrań gracza grającego jako Industrialist (3-5 partii). Dopiero po nagraniach
piszemy implementację ColonyAutoExpander.

### Co NIE jest osobnym budynkiem

- `assembly_module_factory` — to produkt zwykłej `factory`, nie osobny budynek
- `semi_conductor_facility` — j.w.

### Homeworld

Homeworld nie wymaga `habitat` (gracz tak ma). Specjalny case.

## Warstwa C — Strategiczne Akcje (Slice 2-4)

### Mechanizm

Trigger-based scripts. Każda akcja:
- Warunki triggerowe (zasoby + archetyp + sytuacja)
- **Konsumuje surowce** z inventory (kluczowe — dyskretność)
- Cooldown (nie spam)
- Wizualizacja (gracz widzi)

### Most do Warstwy B

Akcje definiowane w `archetype.actionTargets`. Warstwa B **czyta** `triggerWhen`
jako safety stocks i buduje fabryki żeby wypełnić.

### Przykład: kolonizacja

```js
colonize_neighbor_body: {
  cost: { structural_alloys: 800, fuel_cells: 400, food: 200 },
  minCooldown: 30,  // civYears
  triggerWhen: {
    structural_alloys_stock: 1200,
    android_workers_stock: 20,
    has_uncolonized_body_in_system: true,
  },
}
```

Kolonizacja zżera C, Fe, Li — naturalna gospodarka deficytowa na starcie.

## Personality System

5-osiowy wektor archetypu:
- `aggression` (Industrialist: 0.3)
- `expansion` (Industrialist: 0.7)
- `secrecy` (Industrialist: 0.2)
- `trade` (Industrialist: 0.9)
- `science` (Industrialist: 0.6)

Modyfikuje cooldowny akcji Warstwy C. Industrialist z `expansion=0.7`
ma kolonizację co 30y; Militarist z `expansion=0.3` co 50y.

## Tempo decyzji

- Warstwa A (Maintenance): co **1 civYear**
- Warstwa B (AutoExpander): co **3 civYears**
- Warstwa C (ActionRunner): co **5 civYears**

## Roadmapa per Slice

- **Slice 1 Faza 2**: Warstwa B dla Industrialist (po nagraniach!)
- **Slice 2**: Warstwa C, akcja `colonize_neighbor_body`
- **Slice 3**: Warstwa C, akcje handlu i eksploracji
- **Slice 4**: Warstwa C, akcje militarne, FleetTacticalAI

## Co potrzebujemy z nagrań gracza (Wariant A)

Pełen zakres replay:
- Lista budynków z timestamp (kiedy zbudowane)
- Snapshots stanu kolonii (POPy, surowce, energy) co X civYears
- Decyzje gracza (fabryka mode, safety stocks, manual trades, prosperity policy)

To dostarczy ground truth dla `year_10/20/30/40_target`.

## TECH DEBT — anti-deadlock follow-ups (commit ae7ae57)

Fixy Y1/Y2/Y3 (rate limit kolejki + stuck abandon + tile blacklist) domknęły
death spiral, ale zostawiają trzy do pilnowania:

- **Survival ignoruje unreachable.** Akcje survival (housing/energy/food) NIE
  sprawdzają `_isUnreachable` — bramkuje je tylko rate-limit + tile blacklist.
  Kompromis: w death-spiralu `freePops≈0` zatrzymuje budowanie, ale poza tym AI
  może cyklicznie odbudowywać porzucone hexy (widać w smoke T11). Do zrobienia:
  wpiąć `_isUnreachable` do `_runSurvival`.
- **Limity to heurystyka.** `MAX_PENDING_BUILDS_PER_COLONY=3` /
  `MAX_PENDING_UPGRADES_PER_COLONY=2` dobrane z nagrania referencyjnego (gracz
  1–2 naraz). Mogą wymagać tuningu po dłuższych testach.
- **Czemu `_findFreeTile` proponuje beznadziejne hexy?** Tile `(-3,7)` jako
  jedyny crater był spamowany `[fail]` — sugeruje, że istnieją typy terenu
  fundamentalnie nieprzydatne dla budynków (poza zasięgiem? zablokowane?).
  Blacklist to obejście; warto zrozumieć, czemu `_findFreeTile` w ogóle go
  zwraca.

## Następny krok

Audyt replay system. Patrz `docs/replay_audit_brief.md` (utworzony w następnej sesji).
