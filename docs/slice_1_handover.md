# Slice 1 — Handover do następnej sesji Claude Code

**Status sesji:** zamykana bez commita. Stan kodu na dysku, nie w git.
**Data:** 2026-05-22.
**Branch:** `main` (od `origin/main`).

---

## 1. Aktualny stan kodu (uncommitted)

### NOWE pliki (untracked)
- `src/data/EmpireArchetypeIndustrialist.js` — archetyp Industrialist: 6 POP, 16 budynków (1 colony_base + 1 habitat + 1 launch_pad + 1 shipyard + 1 factory + 1 mine + 2 farm + 2 well + 6 solar_farm), safety stocks (4 production + 2 consumer goods).
- `src/systems/EmpireColonyBootstrap.js` — bootstrap kolonii AI: lazy-gen pełnego systemu przez `StarSystemManager.generateAndRegister(galaxyStar)`, `_pickHomePlanet` (rocky pref), `_placeBuildingSmart` z scoringiem (polar penalty -5/-2, preferredTerrain +10, adjacency +2), `forceConsumptionSync` po addPop.
- `src/systems/EmpireColonyMaintenance.js` — workaround tick co 1 civYear: iteruje AI kolonie i wymusza `_reapplyAllRates()` + `forceConsumptionSync()`. **NIE działa wystarczająco** — kolonia AI nadal umiera (patrz sekcja 3).
- `docs/tech_debt_ai_ui_events.md` — notatka tech debt (active colony swap, event leak, propozycje A/B/C rozwiązania w Slice 3+).
- `docs/slice_1_plan.md` — oryginalny plan użytkownika (nie modyfikowany w tej sesji).

### ZMODYFIKOWANE pliki
- `.claude/settings.local.json` — settings harness (drobne).
- `src/core/DebugLog.js` — `TRACKED_EVENTS += 'ai:empireBootstrap'` (1 linia).
- `src/data/EmpireData.js` — import + re-export `INDUSTRIALIST` w `ARCHETYPES`, dodane `NAME_PREFIXES_PL/EN.industrialist` (Manufaktura/Konsorcjum/Fundacja/...).
- `src/debug/SpawnTestEnemy.js` — `addColony` nowy signature: `(empireId, planetId)` zamiast `(empireId, systemId, planetId)`.
- `src/generators/EmpireGenerator.js` — przepisany dla Slice 1: hardcoded `count=1`, `archetypeId='industrialist'`, usunięte `spawnFleet`/extraColCount, dodane wywołanie `EmpireColonyBootstrap.bootstrapHomeColony` + tracking `homeSys.empireId`.
- `src/scenarios/CombatSandbox.js` — `addColony` nowy signature (1 linia).
- `src/scenes/GameScene.js` — log po `EmpireGenerator.generate`, drugi `syncToGalaxyData` po restore kolonii, import + instancjowanie `EmpireColonyMaintenance` (z TODO Faza 2).
- `src/systems/BuildingSystem.js` — `autoPlaceBuilding(buildingId, opts)` rozszerzone o `opts.preferredTerrain` (2-fazowy search: preferred → fallback allowedTerrain). NIE dotyka guard `civ:popBorn`.
- `src/systems/CivilianTradeSystem.js` — `_halfYearlyTick` filtruje AI kolonie z `!system.explored` (otwiera Slice 3 handel po recon).
- `src/systems/ColonyManager.js` — dodane `ownerEmpireId: null` w 3 strukturach kolonii, filtry `!c.ownerEmpireId` w `_applyTaxes`/`_checkMigration`/`_autoCreateTradeRoutes`, transferColony używa nowego `addColony(empireId, planetId)`.
- `src/systems/EmpireRegistry.js` — przepisany: usunięte scalary `military.power`/`resources.production`/`tech.level`/`_growAll()`, nowy `addColony(empireId, colonyId)` signature, `setStrategicFocus`, no-op stuby dla starego EconAI/MilitaryAI, `syncToGalaxyData` odczytuje systemId z ColonyManager.
- `src/systems/IntelSystem.js` — adapter dla nowej struktury `emp.colonies = [colonyId, ...]` (odczyt systemId przez ColonyManager).
- `src/systems/SaveMigration.js` — `CURRENT_VERSION = 76`, `_migrateV75toV76` rzuca `Error` (clean break), `migrate()` owinięte try/catch.

**13 zmodyfikowanych + 5 nowych = 18 plików uncommitted.**

---

## 2. Status Slice 1

- **Faza 0 (recon):** ✅ ukończona. Raport w konwersacji odpowiada Q0.1-Q0.5 + 8 issues.
- **Faza 1 (bootstrap ECS):** ❌ **NIE UKOŃCZONA**. Bootstrap technicznie działa (kolonia AI tworzy się z 16 budynkami, 6 POP, real planet w `galaxyData`, deposits, composition), ale po pierwszym `time:tick` rozpoczyna się **spirala śmierci** — populacja umiera w ~10 sekundach realnego czasu (5x speed). Test acceptance NIE PRZECHODZI.
- **Faza 2 (EmpireStrategicAI/StockpilePolicy/AutoPlanner):** ⏸️ nierozpoczęta.
- **Faza 3 (IntelDataGenerator/EconomySandboxScene):** ⏸️ nierozpoczęta.

---

## 3. Znany aktualny bug

**Kolonia AI startuje poprawnie** (laborer.count=3, satisfaction=65, _employedPops=4.5, energy balance +1.64, food/water inventories rosną, deposits z Fe~125k). Po wyjściu z pauzy **pierwszy `time:tick`** wywołuje spirale śmierci:

- `_starvationYears` rośnie mimo dodatniej energy i rosnącego food w inventory (anomalia — głód nie powinien się liczyć przy pozytywnym foodRatio).
- `labSat` (laborer satisfaction) spada o **11 pkt w jednym tickuje** (65 → 53.8) bez wyraźnej przyczyny.
- Po ~10s realnych (5x speed = ~30 civYears): `laborer=0`, `brownout=true`, `balance=-32`.
- **Workaround `EmpireColonyMaintenance` (1-civYear tick `_reapplyAllRates` + `forceConsumptionSync`) NIE WYSTARCZA** — kolonia nadal umiera.

---

## 4. Co już wykluczono jako root cause

- **ScheduledEventSystem** — targetuje tylko gracza przez `_getHomeColony`.
- **`civ:popBorn` guard w BuildingSystem** — ręczne `_reapplyAllRates()` (w bootstrap i w `EmpireColonyMaintenance` tick) NIE pomaga.
- **Niepoprawny bootstrap struktur strata** — struktury strata AI vs gracz identyczne.
- **Brak POPów** — jest 3 laborer + inne strata, 4.5 zatrudnionych z 6 POP łącznie.
- **Brak employment przypisania** — `changeEmployment` to globalny licznik na koloni, nie per-strata; bootstrap wywołuje `addPop(stratum, count)` poprawnie.
- **Brak deposits** — w t=0 deposits są pełne (Fe~125k, Si~143k, Cu~63k, Ti~15k, Li~12k, Hv~15k z `SystemGenerator._generateDepositsForAll`).
- **Active colony swap** — w testach gracz NIE klikał na kolonię AI; bug istnieje niezależnie od `window.KOSMOS.buildingSystem` swap.

---

## 5. Co należy zbadać w nowej sesji

1. **Co dokładnie liczy `_starvationYears`?** Jaka definicja `foodRatio` (w `_resourceRatio('food')`)? Czy używa `inventory.food` czy `production.food / consumption.food`? Jeśli production rate jest cached i przestarzały (przed reapplyAllRates), foodRatio może być fałszywy.
2. **Jak liczona jest produkcja food per tick?** `ResourceSystem._update(civDeltaYears)` — per civYear, lazy, on-demand? Czy registerProducer producent jest aktywny od t=0?
3. **Czy istnieje `_firstTickInit` lub inny mechanizm aktywacji kolonii przy pierwszym tickuje?** Sprawdź `CivilizationSystem.constructor` (`setTimeout(() => this._syncConsumption(), 0)` — czy działa dla AI kolonii czy guard blokuje?).
4. **Co powoduje nagły spadek `labSat` o 11 pkt?** Sprawdź `_processSatisfaction` w CivilizationSystem — które komponenty (food, water, housing, prosperity) wpływają na laborer satisfaction.
5. **Dlaczego `_starvationYears` zachowuje się niemonotonicznie** (1→4→2→0→3)? Niemonotoniczność sugeruje że `foodRatio` oscyluje (czasem >0.02, czasem <0.02). Albo `_starvationYears` jest resetowany w niektórych tickach.
6. **Czy `_processPopGrowth` / `_processSatisfaction` mają guardy podobne do `civ:popBorn`?** Grep w CivilizationSystem.js: `if (window.KOSMOS?.civSystem !== this) return`. Jeśli tak — to root cause: cały tick civSystem nie działa dla AI kolonii.

---

## 6. Pliki kluczowe do zbadania

- `src/systems/CivilizationSystem.js` — szukaj: `_starvationYears`, `_processSatisfaction`, `_processPopGrowth`, `_resourceRatio`, `_update`. Sprawdź czy są guardy na `window.KOSMOS.civSystem !== this`.
- `src/systems/ResourceSystem.js` — produkcja food per tick (`_update`, `registerProducer`, `inventory` setter). Sprawdź czy producent `civilization_consumption` jest aktywny po `forceConsumptionSync` z bootstrap.
- `src/systems/ProsperitySystem.js` — wpływ na satisfaction. Czy guard na aktywną kolonię?
- `src/systems/BuildingSystem.js` linie 119-126 (guard `civ:popBorn`/`civ:popDied`/`civ:unrest`) — sprawdź czy są inne guardy które blokują AI kolonie reaktywnie (np. `randomEvent`, `factionShift`).

---

## 7. Dane diagnostyczne

Sample'y zebrane podczas ręcznej obserwacji (gracz NIE klikał na kolonię AI):

```
Sample 0-40 (pauza):         laborer:3, labSat:65,   starveYrs:0,  energyBal:+3.3, brownout:false
Sample 41 (pierwszy tick):   laborer:3, labSat:53.8, starveYrs:1,  energyBal:+3.3, brownout:false
Sample 44:                   laborer:2, labSat:28.6, labLowYrs:3,  energyBal:+3.4, brownout:false
Sample 45:                   laborer:2, labSat:27.9, energyBal:-7.1, brownout:TRUE
Sample 49:                   laborer:0, labSat:27.5, labLowYrs:12, energyBal:-19
Sample 50+:                  stabilizacja na laborer:0, balance:-32, brownout:true
```

**Obserwacje:**
- Skok `starveYrs` z 0 → 1 w pierwszym tickuje mimo `inventory.food > 0` (wcześniejsze sesje raportowały food 250 → 346 czyli rośnie).
- `labSat` spada -11 w jednym tickuje (65→53.8) → potem do 28 w 3 tickach → potem stabilizuje się na 27.x (suggesting floor lub clamp).
- `energyBal` flip z +3.4 (Sample 44) na -7.1 (Sample 45) — gwałtowny crash production. Możliwe: solar_farms zatrzymane przez brownout cascade lub przez deficit innej zależności.
- `laborer` count spada 3→2→0 w ~5 tickach (POP umierają od starvation).

---

## 8. Instrukcje dla następnej sesji

Następna sesja Claude Code powinna:

1. **Przeczytać ten plik** (`docs/slice_1_handover.md`) jako pierwszy krok.
2. **Przeczytać `docs/slice_1_plan.md`** (oryginalny plan — kontekst Fazy 1-3).
3. **Sprawdzić czy istnieje `docs/slice_1_investigation_brief.md`** (jeśli tak — to ma dodatkowe dane diagnostyczne; jeśli nie — pominąć).
4. **Zbadać 6 pytań z sekcji 5** — szukać guardów `window.KOSMOS.civSystem !== this` lub podobnych w CivilizationSystem/ProsperitySystem, prześledzić foodRatio computation, sprawdzić _processSatisfaction triggering.
5. **Przedstawić root cause + propozycję fixa BEZ pisania kodu** — najpierw diagnoza, potem decyzja użytkownika jak naprawić.
6. **Czekać na decyzję użytkownika** przed implementacją.

**Nie przechodzić do Fazy 2** dopóki Faza 1 acceptance test (kolonia AI żyje 20 civYears bez klika gracza) nie przejdzie.

**Nie usuwać `EmpireColonyMaintenance`** dopóki Faza 2 ColonyAutoPlanner nie zostanie zaimplementowany — to obecny safety net, nawet jeśli nie wystarcza.

---

## Lista plików do weryfikacji w nowej sesji

```bash
git status        # 13 modified + 5 untracked (5-cia to docs/slice_1_handover.md utworzony tu)
git diff --stat HEAD
```

Oczekiwana liczba zmienionych plików: **13 modified + 6 untracked** (po dodaniu tego handover).
