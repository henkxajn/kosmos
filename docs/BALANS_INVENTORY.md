# BALANS 1.0 — Phase 0: Inwentaryzacja istniejącego toolingu

> **Status:** RAPORT ONLY. Zero kodu, zero zmian balansu. Po tym dokumencie — STOP i czekam na decyzję reuse-vs-rebuild (Filip + Claude chat).
> **Zakres:** cały headless/bot/sim tooling w repo + 4 deep-dive'y z addendum (probe/runner verdict, 18 reguł ConclusionsEngine, dobór bota, scenariusz/rywalskie AI).

---

## 0. TL;DR — werdykty

| Obszar | Werdykt | Jednym zdaniem |
|--------|---------|----------------|
| **Headless entry point** | **EXTEND `GameCore.js`** | To jest realna ścieżka gracza (prawdziwe systemy 4X, prawdziwe budynki startowe) — fundament BALANS. |
| **`probe-freepops-longrun.mjs`** | **REBUILD (zżąć wzorce)** | Świadoma APROKSYMACJA na ścieżce AI (nie GameCore), tech całkowicie zastubowany — nie rozszerzać; przejąć wzorzec pętli + time-series + gotcha `_reapplyAllRates`. |
| **Bot referencyjny** | **RuleBot: EXTEND strukturę, RECALIBRATE stałe** | Adaptive-within-strategy (drabina priorytetów P0–P17, sterowana kontekstem) — rozszerzalny; progi liczbowe są sprzed Population 2.0 (×4) i sprzed 5C. |
| **MCTSBot / EvoBot** | **NIE używać jako krzywej referencyjnej** | To SOLVERY — mierzą podłogę trudności (co osiągalne), nie krzywą intended-play. Ewentualnie później osobne bounds floor/ceiling. |
| **ConclusionsEngine (18 reguł)** | **PRECURSOR — w większości needs-rewrite; INV = ŚWIEŻY system** | Działa na agregacie końca-runu (coaching bota), nie na time-series z game-year i first-occurrence — INV-1..6 + off-target wymagają nowego modułu. |
| **Scenariusz / rywalskie AI** | **NIE-STOP** | `'civilization'` spawnuje ABSTRAKCYJNE imperia (FSM/dyplo/wojna), ale **NIE uruchamia żywych ekonomii rywali** (brak `EmpireStrategySystem`/`ColonyAutoExpander` w GameCore). Rekomendacja: zneutralizować warstwę agresji AI dla runów referencyjnych. |
| **Jednostka raportu** | **REBUILD warstwy raportowej** | Cała obecna telemetria emituje w **civYears** (snapshot co 50/100 cy, eventy stemplowane `floor(gameTime*12)`) — narusza HARD-CONSTRAINT #3 (game-years). Silnik tick jest dwu-zegarowo świadomy (`gameTime` dostępne), warstwa raportu nie. |

---

## 1. Mapa artefaktów (`src/testing/`)

```
src/testing/
├── headless/
│   ├── env.js            ← REUSE. Mocki window/document/localStorage/THREE/Audio + seeded Math.random (mulberry32).
│   ├── GameCore.js       ← EXTEND. Realny boot "Nowa Gra" ('civilization'/'civilization_boosted'), zero UI/renderera.
│   ├── Ticker.js         ← EXTEND. Ręczna pętla time:tick; tickSize w civYears; gameTime tracked.
│   ├── Snapshot.js       ← AUDIT (Pop 2.0). Migawka stanu (pop/housing/prosperity/…) — czytniki do sprawdzenia vs Pop 2.0.
│   ├── smoke-test.js / test-boot.js / test-ticker.js / test-actions.js / test-*-bot.js  ← dev-scaffolding (jednorazowe).
│   └── probe-freepops-longrun.mjs  ← REBUILD (zżąć wzorce). Ścieżka AI, aproksymacja, tech-stub.
├── actions/
│   ├── ActionAdapter.js  ← EXTEND. {type}→EventBus.emit. 10 typów; BRAK 5C-slider, BRAK load-POP, BRAK parallel-burst.
│   └── ActionCatalog.js  ← EXTEND. Enumeracja legalnych akcji (build/upgrade/demolish/research/expedition/buildShip/factory).
├── bots/
│   ├── BaseBot.js        ← REUSE (abstract + buildObservation).
│   ├── RuleBot.js        ← EXTEND+RECALIBRATE (kandydat referencyjny).
│   ├── MCTSBot.js        ← EXCLUDE z referencji (solver).
│   ├── EvoBot.js         ← EXCLUDE z referencji (solver/tuner).
│   ├── RandomBot.js      ← rola: crash-hunt (nie balans).
│   └── ScriptedBot.js    ← rola: regresja/replay (nie krzywa).
├── analytics/
│   ├── Metrics.js            ← time-series storage (baza pod telemetrię, ale civYear-based).
│   ├── BottleneckDetector.js ← 9 flag pełno-growych (POP_STAGNATION…STALEMATE) — coaching, nie INV.
│   ├── ConclusionsEngine.js  ← 18 reguł — precursor INV (patrz §8).
│   └── Reporter.js           ← GameReport + JSON/MD (civYear cadence).
├── runner/
│   ├── run.js       ← CLI. In-process reseed per-gra (`seed_i`), fork per-gra w --isolated.
│   ├── worker.js    ← 1 gra = 1 proces (KOSMOS_SEED w env).
│   ├── SingleGame.js← pętla bot-vs-env; decisionsPerCivYear=1; metryki+eventy w civYears.
│   └── Tournament.js← EvoBot selekcja/mutacja (poza zakresem).
├── scripts/         ← ScriptedBot JSON (regresja).
├── ui/              ← lokalna konsola HTML (port 4455) — nice-to-have, nie krytyczna.
└── reports/         ← ~40 runów z 2026-04-16/17 (ERA PRZED Pop 2.0 — patrz §9).
```

**Gwarancja zero-modyfikacji gry** (README + potwierdzone): cały tooling żyje w `src/testing/`; jedyne runtime-overrides to mocki w `env.js`. Jedyny dodatek poza folderem: `src/package.json` (ESM flag). To zgodne z HARD-CONSTRAINT #4 (additive) — BALANS może dalej trzymać tę dyscyplinę.

---

## 2. Headless entry point — deep dive (addendum #1)

### 2a. `GameCore.js` — **EXTEND** (to jest fundament)

Napędza **realne ścieżki kodu** (spełnia HARD-CONSTRAINT #2). `boot()` replikuje `GameScene.start()` bez renderera/UI:
- `SystemGenerator.generateCivScenario()` → realny układ + `civPlanetId`;
- instancjonuje **wszystkie** realne systemy 4X: `ResourceSystem`, `TechSystem`, `CivilizationSystem`, `BuildingSystem`, `FactorySystem`, `MissionSystem`, `ColonyManager`, `VesselManager`, `CivilianTradeSystem`, `ObservatorySystem`, `RandomEventSystem`, … (pełna lista `window.KOSMOS`);
- `_setupColony` — realne startowe zasoby (Fe 200, C 150, … + commodities) + gwarant Xe; `registerHomePlanet`;
- `PlanetMapGenerator.generate` → realny grid hex; `_placeCapital` emituje **prawdziwy** `planet:buildRequest {colony_base}`;
- `_autoPlaceStarterBuildings` → farm/well/solar_farm przez `bSys.restoreFromSave` (realne rates z `_calcBaseRates`);
- `switchActiveColony(home)`.

**Kontrola seeda / planety startowej (obecnie):**
- Seed: `env.js` patchuje `Math.random` na mulberry32(xmur3(KOSMOS_SEED)); `run.js` woła `reseed('seed_i')` per-gra (in-process) i fork z `KOSMOS_SEED` per-proces (`--isolated`). **Per-seed determinizm jest obsłużony w obu trybach.**
- Planeta startowa: **NIEKONTROLOWANA** — `generateCivScenario()` daje losową (per seed) planetę cyw. Brak jakiegokolwiek override depozytów/atmosfery/warunków. To główny brak wobec BALANS Phase 1 (panel 3 klas GOOD_FE/MEDIAN/POOR wymaga zadanych złóż).

**Co Phase 1 musi dodać do GameCore (additive):**
1. **Injekcja klas planet** — override `homePlanet.deposits` / `atmosphere` / `temperatureK` / `composition` PO `generateCivScenario`, PRZED `_setupColony.setDeposits`. Wzorzec dokładnie taki jak `mkBody(...)` z probe (dep helper). GOOD_FE = replika sesji Filipa (Fe-rich); MEDIAN = target bands; POOR = thin.
2. **Solo/sandbox toggle** — opcja pominięcia/neutralizacji abstrakcyjnych imperiów (patrz §5-scenariusz).
3. **Config-swappable stałe** — GameCore czyta stałe z `src/data`/`src/config` przez importy; A/B na podmienionym zestawie stałych = wymóg first-class (HARD-CONSTRAINT/Phase 1). Do rozważenia: warstwa override modułów danych lub parametryzacja importu.

### 2b. `probe-freepops-longrun.mjs` — **REBUILD** (nie extend; zżąć wzorce)

Nazwa sugeruje „już robi long-run nadwyżki POP" — i owszem robi time-series `freePops/pop/kolonie/food/Ti` do ~gy80. **Ale to zły entry point dla BALANS:**
- **Ścieżka AI, nie GameCore** — bootstrapuje 2 imperia (`EmpireColonyBootstrap` + `INDUSTRIALIST`/`EXPANSIONIST`), nie gracza. Mierzy ekonomię AI → **za płotem zakresu** (rival AI economy OUT).
- **Tech całkowicie zastubowany** — `techStub = Proxy(() => 1 / isResearched:true)` → ZERO realnego gatingu tech, ZERO realnych kosztów research. Krzywa mierzona bez tech to fikcja (narusza #2).
- **Sam deklaruje aproksymację** — prosperity fallback 1.0 (neutral), brak `CivilianTradeSystem`/upkeep, ręczny hack `_reapplyAllRates()` co tick.
- Raport w **cy** (game-year tylko w summary).

**Co ZŻĄĆ z probe (cenne):**
- Kształt pętli: `civDeltaYears=1/tick`, `gameTime += 1/12`, emisja `time:tick {deltaYears, civDeltaYears, gameTime, multiplier}`.
- Wzorzec time-series `freePops/POP/kolonie/zasoby` — dokładnie telemetria (F).
- **GOTCHA `_reapplyAllRates`**: `resource:registerProducer` jest GUARDOWANY do aktywnej kolonii (`ResourceSystem:111`). W żywej grze `_reapplyAllRates` (direct, bez guardu) re-fire'uje na `tech:researched`/`popBorn`/`popDied`. Dla telemetrii **multi-kolonia** (druga kolonia po kolonizacji) to krytyczna wiedza — nieaktywne kolonie mogą mieć produkcję=0 jeśli nie zadbamy o re-apply. Do uwzględnienia w Phase 2.
- Wzorzec `mkBody`/`dep` — bazowy szablon injekcji klas planet (§2a-1).

---

## 3. Pętla tick + dwa zegary (Ticker / SingleGame)

- `Ticker.run(targetCivYears, {tickSize=1.0})`: ustawia `multiplierIndex=5` (1 rok/s), `deltaMs = tickSize/12*1000`, force-unpause co tick (obchodzi `time:pause` z popupów), łapie crashe w handlerach. Hooki `onTick` / `onCivYear`.
- `gameTime` (**game-years**) JEST śledzone (`timeSystem.gameTime`) — silnik jest dwu-zegarowo świadomy. **Ale** cała warstwa nad nim liczy w civYears:
  - `SingleGame.pushEvent` stempluje `civYear = floor(gameTime*12)`;
  - snapshoty co `snapshotInterval` **civYears** (50/100);
  - `decisionsPerCivYear = 1` (twardo w run.js) → **bot podejmuje 1 decyzję / civYear**.

**Implikacje dla BALANS:**
- **HARD-CONSTRAINT #3** — warstwa raportu MUSI zostać przełożona na game-years (dzielić przez 12 / czytać `gameTime`). Silnik OK, raport do przepisania.
- **Parallel front-load (Filip: mine+factory+solar naraz na pauzie)** — przy 1 decyzji/civYear NIE jest odtwarzalny. Phase 1 potrzebuje `decisionsPerCivYear > 1` LUB burst-budżetu (kilka `planet:buildRequest` przed tickiem), respektując realne bramki affordability. To wymóg z Phase 1 („queue multiple in parallel when capacity allows").

---

## 4. Action API — co UI/harness wywołuje (build/upgrade/queue/5C/kolonizacja/load-POP)

`ActionAdapter.execute({type,…})` → `EventBus.emit`. Obecne typy:

| type | Event | Uwaga |
|------|-------|------|
| `build` | `planet:buildRequest {tile, buildingId}` | ✓ realna ścieżka |
| `upgrade` | `planet:upgradeRequest {tile}` | ✓ |
| `demolish` | `planet:demolishRequest {tile}` | ✓ |
| `research` | `tech:researchRequest {techId}` | ✓ |
| `expedition` | `expedition:sendRequest {type, targetId, vesselId, cargo}` | recon/mining/scientific/**colonize** |
| `buildShip` | `fleet:buildRequest {shipId, modules, planetId}` | ✓ (Stocznia) |
| `factoryEnqueue` | `factory:enqueue {commodityId, qty}` | kolejkowanie towaru |
| `factoryDequeue` | `factory:dequeue {index}` | |
| `factorySetMode` | `factory:setMode {mode}` | manual/reactive/priority |
| `wait` | — | noop |

**Kolejkowanie równoległe (queue incl. simultaneous):** możliwe technicznie (wiele `planet:buildRequest` + `factory:enqueue`), ale bramkowane cadencją `decisionsPerCivYear=1` (patrz §3). BuildingSystem ma własną kolejkę konstrukcji + pending — parallel na poziomie GRY działa, na poziomie BOTA nie jest ćwiczony.

**LUKI KRYTYCZNE (bot BALANS ich wymaga):**
- **5C allocation sliders — BRAK akcji.** Grep `emit(*focus*)` w `src/ui` zwraca wyłącznie `vessel:focus`/`station:focus` (kamera). 5C focus/droid to **stepery `focusMinus`/`focusPlus` w ColonyOverlay (zakładka Workforce)** wołające **intent-method na `CivilizationSystem` bezpośrednio** (nie EventBus) — więc harness musi albo dodać nowy typ akcji wołający intent-method, albo wywoływać ją wprost. **Bez tego INV-2 (slider load-bearing) jest niemierzalny.**
- **Load POP na statek — BRAK akcji, a realna gra tego WYMAGA.** Istnieje realna ścieżka: `Vessel.loadColonists(vessel, count, civSystem)` (`src/entities/Vessel.js:759`) + UI „Załaduj POP" (`fleet.actionLoadColonists`) + modal + **bramka `expedition.noColonistsLoaded` = „Załaduj kolonistów na statek przed wysłaniem"**. Obecny `expedition/colonize` emituje `expedition:sendRequest` BEZ pre-load → w aktualnej grze kolonizacja bota byłaby **odrzucona**. To znaczy: **istniejąca ścieżka kolonizacji w harnessie jest STALE/zepsuta wobec obecnej gry.** Phase 1 musi dodać akcję load-POP (early max 2 POP/statek) PRZED colonize — to jednocześnie „zawór upustu glutu POP" z prompta (kolonizacja drenuje POP macierzysty).

**`ActionCatalog`** enumeruje legalne akcje z realnymi bramkami (`canAfford`, `_canBuildOnTile`, tech-gate, shipyard/launch_pad gate). Solidna baza — do rozszerzenia o 5C + load-POP.

---

## 5. Polityka botów + scenariusz (addendum #3 i #4)

### RuleBot — **adaptive-within-strategy** (rozszerzalny), stałe do rekalibracji

**Adaptacyjny, NIE skrypt.** Drabina warunkowych priorytetów P0–P17 czytana z żywego kontekstu (`_buildContext`: pop, housing, food/water/rate, energyBalance, countBuilding, hasTech, canBuild):
- P0 opening order (mine→factory→habitat→observatory→lab), z **auto-fallbackiem**: jeśli krok wymaga tech → zainicjuj research; jeśli brak commodity → enqueue w fabryce;
- P1–P3 krytyczne food/water/energy (reaktywne progi `food<40`, `rate<pop×0.6`…);
- P4 housing (anticipate growth), P5 research (TECH_PRIORITY: metallurgy→space chain), P8–P9 shipyard/launch_pad po tech, P12 multi-factory per-pop, P13–P14 science_vessel→recon→cargo→colonize, P15 mining, P16–P17 fallbacki.

Archetyp = **builder + explorer** — dokładnie referencja Filipa (rozwija, ekspanduje, eksploruje). **Werdykt: EXTEND strukturę.** Wymaga:
- **RECALIBRACJI progów pop** — `pop>=3/4/5/6`, `factory_per_pop {6,10,15}`, `housing_buffer=1` są **sprzed redenominacji ×4 (Population 2.0)** → po ×4 odpalają się przy innej realnej skali. Do przeskalowania.
- **Dodania 5C + load-POP** (patrz §4) — obecnie RuleBot nie dotyka suwaków ani nie ładuje POP przed colonize.
- **Czasomiary w civYear** (`civYear = floor(gameTime*12)`, cooldowny enqueue w cy) → zmapować/raportować w game-years.

### MCTSBot / EvoBot — **EXCLUDE z krzywej referencyjnej**

To SOLVERY: MCTSBot sampluje K=30 akcji + ocena heurystyczna + UCB1; EvoBot = RuleBot z 12 evolvable weights trenowanymi w Tournament. **Mierzą podłogę trudności / optimum, nie intended-play.** Zgodnie z addendum: NIE wpinać jako bota krzywej referencyjnej; ewentualnie później osobne bounds (floor = solver, ceiling = tuned) — **poza tym arciem.**

### RandomBot / ScriptedBot — role poboczne
RandomBot = crash-hunt (fuzz, ważone kategorie). ScriptedBot = regresja/replay z JSON. Żaden nie jest krzywą.

### Scenariusz / rywalskie AI — **NIE-STOP** (z rekomendacją neutralizacji)

`GameCore.boot` używa `'civilization'` (lub `'civilization_boosted'` = Nowa Gra 2). Krok `EmpireGenerator.generate(galaxyData, empireRegistry)` **spawnuje 3–6 obcych imperiów** + init `IntelSystem/DiplomacySystem/AlienCivSystem/WarSystem/InvasionSystem`.

**ALE — kluczowe rozróżnienie:** GameCore **NIE instancjonuje** `EmpireStrategySystem` ani `ColonyAutoExpander` ani `EmpireColonyBootstrap` (te są tylko w probe). Więc **rywalskie imperia NIE prowadzą żywych ekonomii per-kolonia** — istnieją jako abstrakcyjne wpisy rejestru + FSM (`AlienCivSystem`) + dyplomacja/wojna na warstwie galaktyki. **Żaden rywal nie konkuruje o zasoby ani nie wprowadza per-kolonia niedeterminizmu ekonomicznego.**

→ To **NIE spełnia warunku STOP** z addendum („rival empires with **live economies**"). Reference run izoluje solo ekspansję ekonomiczną na poziomie zasobów.

→ **Rekomendacja (nie blocker):** warstwa abstrakcyjnego AI (`AlienCivSystem` FSM + `WarSystem`/`InvasionSystem` tick) MOŻE w dłuższych runach wygenerować wojnę/inwazję = confound + źródło niedeterminizmu. Dla runów referencyjnych early-game (M4.2 ≈ gy20 = 240 civYears) proponuję Phase 1: **flaga solo** w GameCore, która albo pomija `EmpireGenerator.generate`, albo neutralizuje eskalację wrogości/wojny. To additive (harness-only), zgodne z płotem. Do potwierdzenia w Phase 1 czy w oknie ~240 cy jakakolwiek agresja w ogóle się odpala.

---

## 6. Metryki / raportowanie — obecne vs potrzebne (telemetria A–H)

**Obecne (`SingleGame`/`Reporter`/`Metrics`/`ConclusionsEngine`):**
- Agregat końca-runu: `finalStats` (avg_pop/housing/prosperity/…), `eventTotals`, `shortageByResource`, `techsByBranch`, `shipsBuiltByType`, `flagHistogram`.
- Snapshoty co 50/100 **civYears**: pop/housing/prosperity/energy/inventory Fe/food/water/Si/C + rates.
- Event timeline (200 eventów) stemplowany **civYear**.

**Braki wobec telemetrii A–H (BALANS):**
- (A) Milestone first-occurrence w **game-years** median/p10/p90 per klasa — brak (obecnie agregat, nie first-occurrence).
- (B) per-resource `stock/throughput/demand/binding_constraint` per tick — **brak `demand` i `binding_constraint`**; jest tylko stock+rate dla wybranych zasobów.
- (C) Building ROI / payback (koszt vs wartość, payback w game-years) — **brak całkowicie.**
- (D) Deposit-size sensitivity (dry/never-bind/always-bottleneck per abundance tier) — **brak** (najbliżej: generyczna reguła `shortage_${res}`).
- (E) Price affordability (Kr vs droid/android/ship; desired→attainable gap) — **brak** (kredyty są w snapshot, brak krzywej gap).
- (F) POP supply(jobs) vs demand(POP), pivot timestamp, growth base-vs-feedback — **brak dekompozycji**; probe pokazuje wzorzec surowej time-series POP/freePops (do zżęcia).
- (G) Pacing / decision density (luki między decyzjami w game-years) — **brak.**
- (H) Invariant log (violation timestamp+frequency) — **brak** (najbliżej: `BottleneckDetector` 9 flag, ale pełno-growych, nie INV early-game).

**Werdykt:** silnik metryk (`Metrics` time-series store) reużywalny; warstwa CO i JAK mierzy — do przepisania pod A–H i game-years.

---

## 7. `BottleneckDetector` — 9 flag (kontekst dla INV)

`POP_STAGNATION` (50cy), `RESOURCE_STALL` (Fe 100cy), `TECH_IRRELEVANCE` (100cy), `FLEET_UNUSED`, `DIPLOMACY_DEAD`, `RUNAWAY_LEADER`, `EVENT_CASCADE`, `STALEMATE` (250cy), `COLONY_LOCK`. Wszystkie to detektory **pełno-growej stagnacji** (coaching bota / QA długich runów), progi w civYears. **Nie pokrywają INV-1..6** (early-game, first-occurrence, game-years). Mogą zostać jako osobny QA-layer; do INV powstaje nowy moduł.

---

## 8. ConclusionsEngine — 18 reguł otagowanych (addendum #2)

Tag względem: Population 2.0 (×4 redenominacja, `unemployed`, prosperity GAMMA), 5C sliders, dual-fuel, warunki planetarne, rzadkie minerały.

| # | Reguła (id) | Kat. | Tag | Uzasadnienie |
|---|-------------|------|-----|--------------|
| 1 | `no_colonization` | bot | **NEEDS-REWRITE** | Koncept żywy, ale binarny pass/fail po ≥200 cy. W BALANS to milestone **M3.3** (first-occurrence, game-years). Dodatkowo: ścieżka colonize wymaga teraz load-POP → false-positive dopóki §4 luka niezałatana. |
| 2 | `no_exploration` | bot | **NEEDS-REWRITE** | → milestone **M3.2** (first POI). Nie binarny agregat. |
| 3 | `no_fleet` | bot | **NEEDS-REWRITE** | → milestone **M3.1** (first small hull). |
| 4 | `no_factory` | bot | **NEEDS-REWRITE** | Z bota adaptacyjnego factory ma być zawsze → jako flaga martwa; przenieść do ROI(C)/pacing. |
| 5 | `too_few_factories` | bot | **STALE** | Próg `pop>=6` sprzed ×4 (Pop 2.0) → skala pop inna; do rekalibracji lub porzucenia. |
| 6 | `factory_mode_manual` | bot | **NEEDS-REWRITE** | `shortages>10` heurystyka; koncept „factory pause" mapuje na **INV-4** (early tension), ale liczy na agregacie. |
| 7 | `tech_slow` | bot | **NEEDS-REWRITE** | „1 tech/20 cy" — tempo zmienione (boosted „Nowa gra", ResearchSystem). → wiązać z **M3.4** + pacing(G). |
| 8 | `no_space_tech` | bot | **NEEDS-REWRITE** | → gate/milestone, nie binarny agregat. |
| 9 | `pop_death_spiral` | econ | **VALID (extend)** | `popDied>popBorn` — realny sygnał survival; zasila **INV-1** (brownout) + głód. Przełożyć na game-year first-occurrence. |
| 10 | `water_crisis` | econ | **VALID + RECALIBRATE** | Koncept ok; próg `sh.water>n×2` + konsumpcja wody **÷4** (Pop 2.0) → rekalibracja. → telemetria **B** (binding_constraint). |
| 11 | `food_crisis` | econ | **VALID + RECALIBRATE** | j.w. (food ÷4). → **B**. |
| 12 | `shortage_${res}` (generic) | econ | **VALID (extend)** | Najbliżej BALANS — generyczny per-resource. Rozszerzyć na rzadkie minerały (Li/Ti…) → telemetria **B/D**. |
| 13 | `low_prosperity` | econ | **NEEDS-REWRITE** | Próg `<30` sprzed rekalibracji prosperity **GAMMA** (Pop 2.0) → skala inna. |
| 14 | `housing_limit` | bot | **STALE** | `housing<=4` — po ×4 kapitał sam daje ×4; liczby bez sensu w nowej skali. |
| 15 | `diplomacy_dead` | game | **OUT-OF-SCOPE** | AI/dyplomacja za płotem BALANS — drop w tym arcie. |
| 16 | `random_events_overload` | game | **VALID (minor)** | Sygnał tuningu gry; dla runu referencyjnego events = **confound do wyłączenia** (determinizm). |
| 17 | `stalemate_frequent` | bot | **PARTIAL / OUT-OF-SCOPE** | STALEMATE mapuje na Phase D slack — to **backlog (missing system), nie constants** → poza arciem tuningu. |
| 18 | `colonization_working` | bot(+) | **STALE** | Pozytywny agregat; zastąpić statusem milestone. |

**Czy INV-1..6 + off-target może to ROZSZERZYĆ, czy potrzeba świeżego systemu flag?**
→ **ŚWIEŻY system.** ConclusionsEngine działa na **agregacie końca-runu** (finalStats/eventTotals/flagHistogram po ~500 grach) i produkuje **prozę coachingu bota**. INV-1..6 + off-target milestone potrzebują strukturalnie czegoś innego: **per-tick time-series z game-year, first-occurrence, pivot-tick, violation timestamp+frequency, desired→attainable gap** (wielkości ciągłe, nie zdarzenia dyskretne — patrz forward-note derived metrics). To inny kształt danych i inny cel (balance-verdict vs bot-coaching).
→ **Rekomendacja:** nowy moduł `InvariantLog.js` / `BalanceFlags.js`, reużywający z ConclusionsEngine tylko (a) wzorzec severity/prozy wyjścia i (b) reguły 9–12 (survival/shortage) jako ziarna kalibracji progów. Pliku nie rozszerzać.

---

## 9. Ocena staleness (co przeżyło zmiany systemów)

| System | Wpływ na tooling |
|--------|------------------|
| **Population 2.0 (×4, `unemployed`, satysfakcja, prosperity GAMMA)** | Najszersza staleness. Progi pop w RuleBot/Conclusions (≥3/4/6, housing=4) sprzed ×4. `Snapshot.js`/`probe` czytają `population`/`freePops`/`_employedPops` — **wymagają audytu** czy fieldy nadal istnieją (Pop 2.0: `employed` getter, `_unemployed`, `freePops` „future-refactor hook"). |
| **5C sliders (focus/droid)** | Nieobecne w całym toolingu (ActionAdapter/Catalog/bots). Nowa mechanika — brak akcji, brak metryk. INV-2 = od zera. |
| **Dual-fuel** | Nieobecne w toolingu. Colonize/ship w warp może mieć nowe bramki paliwowe — do weryfikacji (Phase 1). |
| **Warunki planetarne / rzadkie minerały** | Brak kontroli klas planet (§2a); `shortage_${res}` łapie minerały generycznie, ale deposit-size sensitivity (D) od zera. |
| **Reports 2026-04** | ~40 runów sprzed Pop 2.0 — historyczne, nie baza porównawcza dla BALANS. |
| **`colonize` bez load-POP** | Ścieżka kolonizacji w harnessie **zepsuta** wobec obecnej bramki `noColonistsLoaded` (§4). |

---

## 10. Rekomendacje dla Phase 1 (do decyzji Filip + Claude chat)

1. **Fundament: EXTEND GameCore + Ticker + SingleGame + ActionCatalog/Adapter.** Nie budować od zera, nie extendować probe.
2. **Panel klas planet** przez injekcję depozytów/atmosfery po `generateCivScenario` (wzorzec `mkBody`/`dep` z probe). GOOD_FE/MEDIAN/POOR (+opc. ABUNDANCE_SWEEP).
3. **Bot: EXTEND RuleBot** (adaptive builder+explorer) — rekalibracja progów pop do skali Pop 2.0, wyniesienie priority-list + affordability do config/data (wymóg Phase 1), dodanie 5C + load-POP.
4. **Action API +2 luki:** 5C-slider (intent-method `CivilizationSystem`) i load-POP (`Vessel.loadColonists`, max 2 POP/statek, PRZED colonize).
5. **Parallel front-load:** `decisionsPerCivYear > 1` / burst-budżet z realnymi bramkami affordability.
6. **Solo-run:** flaga w GameCore neutralizująca abstrakcyjne AI (agresja/wojna) + wyłączenie `RandomEventSystem` dla runów referencyjnych (determinizm/confound).
7. **Warstwa raportu: REBUILD w game-years** (dziel/­czytaj `gameTime`), telemetria A–H, **świeży `InvariantLog`** (nie extend ConclusionsEngine).
8. **Determinizm (Phase 1 verify, per forward-note):** `env.js` patchuje globalny `Math.random` (mulberry32) + `reseed` per-gra — dobra baza; **do zweryfikowania czy CAŁA losowość sim przechodzi przez `Math.random`** (moduły z własnym PRNG lub `Date.now()` uciekłyby). Fallback per addendum: więcej seedów + raportuj rozkład, nigdy sztuczny determinizm.

---

## 11. STOP

Phase 0 zakończona. **Nie przechodzę do Phase 1.** Czekam na decyzję reuse-vs-rebuild i sygnał (Filip + Claude chat).
