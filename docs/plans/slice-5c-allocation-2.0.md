# Slice 5C — Allocation 2.0 (PLAN, przed kodem)

> Population 2.0 Faza 5, Slice 5C. Kolejność: 5A ✅ → 5B ✅ → **5C allocation 2.0** → 5D housekeeping.
> Cztery lewary (prompt Filipa): **structure-target focus**, **building tri-state priority**, **continuous-feel
> migration**, **growth/satisfaction tooltips**. Research: workflow 4-cluster (pełne cytaty niżej). Plan zatwierdza
> Filip PRZED kodem; forki poniżej — Filip wybiera. [[population-2-0-phase5b]] [[population-2-0-phase2]] [[population-2-0-phase3]]

## Fundament — jak działa alokacja DZIŚ

`CivilizationSystem._allocateWorkforce` (raz/civ-rok w `_yearlyUpdate:822`, ORAZ mid-year przez
`BuildingSystem._reallocateAndRefresh` na install/remove droida):
- **Etap 1** (`:1329-1346`): pula `_unemployed` → wolne etaty, ranking **pressure-desc** (`:1339`, tie-break wage).
- **Etap 2** (`:1348-1364`): migracja między stratami, cap `MIGRATION_FRICTION=10%/civYr` (`:1351` `floor`),
  cel = strata ze ŚCIŚLE wyższą płacą i wolnym etatem (`:1354`).
- **Focus** (`_focusBonus`, cap `max(1,floor(FOCUS_BONUS_MAX×grossJobs))`) = czysty +demandBonus → pressure → wage.
  **NIE tworzy realnych etatów** (etaty = `_humanJobs = getSlotDemand(brutto) − getSyntheticJobs`).
- **Produkcja budynków**: JEDYNIE colony-wide binary `FactorySystem._productionEnabled` (offline toggle, `:833` gate).
  Budowa = `BuildingSystem._constructionQueue`/`_tickConstruction` — ZERO linku do pauzy fabryki, ZERO tri-state.

**Seamy dla 4 lewarów (wyizolowane):** (a) structure-target → `_focusBonus` + rank `:1339` + filtr Etap-2 `:1354`
+ pressure `:1241`; (b) continuous → cadence gate `_update:803-808` + friction floor `:1351`; (c) tri-state →
promocja `_productionEnabled` + wpięcie `_tickConstruction` (EventBus, bez importu); (d) tooltips →
`getWorkforceBreakdown:1271` + nowe `getGrowthBreakdown`/`getSatisfactionBreakdown`.

## Deliverable — CONSUMER-FATE (wymóg Filipa: los KAŻDEGO konsumenta getterów)

| Getter | Konsumenci (real) | LOS pod 5C |
|---|---|---|
| **`getTotalLaborCost`/`getStrataWage`/`getStrataLaborCost`** | `ColonyManager._applyTaxes:1558` (realny wydatek Kr, gracz+AI) | **KEEP-AS-COST** — płace zostają jako koszt; tylko ROLA pressure→wage w migracji Etap-2 może się przekształcić |
| **`employed`** | `ColonyManager.calculateTaxIncome:1521` (baza podatku) | **KEEP-AS-COST** |
| **`getIndustryEmploymentShare`** | `CivilianTradeSystem:407-408` (mnożnik handlu Kr) | **KEEP-AS-COST** |
| **`getStrataPressure`** | wage (koszt) **I** ranking Etap-1 `:1339` | **LOGIC-CRITICAL** — getter ZOSTAJE (wage go potrzebuje); jego ROLA RANKINGOWA to dokładnie to, co 5C przepisuje. **Pressure NIE retire** — staje się czystym sygnałem scarcity dla płacy (recompute `effDemand` bez focusu, by focus nie double-countował do wage) |
| **`getStrataJobs`(=getSlotDemand brutto), `getStrataWorkers`(=strata.count)** | backbone: demand/pressure/focus-cap/wage/droid-displacement | **LOGIC-CRITICAL** — bardziej centralne (target = kompozycja NAD tymi etatami) |
| **`getStrataFocus`/`setStrataFocus`** | `ColonyOverlay:3981` (slider) | **LEWAR 5C** — powierzchnia zostaje, ZNACZENIE zmienia się z +bonus na target-kompozycję |
| **`unemployed`→`unemploymentRate:436`** | satysfakcja `:1374` + migracja `:490` + display | **LOGIC-CRITICAL** (wartość) — to sprzężenie tooltips growth/satysfakcji ma wyjaśniać |
| **`freePops`** (~40 konsumentów: crew/build/expedition/ground/AI) | gate'y | **FROZEN** — formuła POZA 5C (`:584-597`). 5C MUSI trzymać inwariant `freePops≈_unemployed` (test Faza-2 (f)) |
| **`getWorkforceBreakdown:1271`** | JEDYNY: `ColonyOverlay:1353` | **DISPLAY-ONLY** — retire z LOGIKI, ROZSZERZ dla UI (kolumny target + payload tooltipów) |
| **display readouts** (TopBar `:702`, drawer `:298`, NavPeek `:102/157`, debug) | mirror employed/unemployed/freePops | **DISPLAY-ONLY** — kosmetyka, zostaje; zaktualizuj etykiety jeśli semantyka focus się zmieni |

**Kontrakt ekonomii = MAŁY i NIETYKALNY:** getStrataWage / getTotalLaborCost / employed / getIndustryEmploymentShare
/ freePops przechodzą przez 5C BEZ ZMIAN kształtu i roli-kosztowej. Allocation 2.0 przepisuje TYLKO wnętrze
`_allocateWorkforce` + ZNACZENIE `getStrataFocus`/pressure-w-alokacji.

## Inwarianty do zachowania (twarde — z droid/lock/save)

1. **Droid-net:** alokacja celuje w `_humanJobs` (NETTO droidów), NIGDY gross → droid-sloty nie ściągają ludzi.
2. **Locked crew:** każdy ruch przez `unlocked=floor(count−locked)` → crew nigdy nie migruje. Target NAD pulą MOBILNĄ.
3. **Integer-normalization** (Faza 3 BUG3): `_lockedPerStrata` UŁAMKOWE → prolog `:1307-1310` re-floor, reszta→U.
   Target = `%×mobilePool` MUSI re-floor + remainder→`_unemployed`.
4. **Model B:** `floor(humans)=Σstrata+_unemployed` — ruchy tylko 1-osobowe.
5. **Idempotencja mid-year:** solver odpala się przy install/remove droida (`_reallocateAndRefresh`) → musi być
   tani i idempotentny (może strzelać wiele razy/rok).
6. **Ordering `_reapplyAllRates:827`** po alokacji (Faza 3 BUG1 — energia desync jeśli naruszone).
7. **`freePops≈_unemployed`** steady-state (~40 gate'ów).

## AI (ColonyAutoExpander) — ZERO zmian, JEŚLI empty-target → economic fallback

AI biegnie TĄ SAMĄ ścieżką alokacji (`_update` early-return tylko na `!civMode`, nigdy `ownerEmpireId`). AI NIGDY
nie dotyka focus (`_focusBonus={}` → `getStrataFocus=0` → alokacja czysto ekonomiczna). Build-logic AI odsprzężony
od alokacji (Faza 2 FIX A). **Krytyczny guard: `_allocateWorkforce` NIE MOŻE pomijać ekonomicznego fallbacku dla
pustego targetu** — inaczej KAŻDA kolonia AI zamraża workforce. Empty/null target ≡ dzisiejsza alokacja.

## Save migration — v98→v99

Focus dziś: `civ.focusBonus` int-per-strata (serialize `:722`, restore `:772` `?? {}`, seed `_migrateV96toV97`).
5C przekształca int→target (share/headcount). **Rekomendacja: `_migrateV98toV99` RESETUJE stare int-focus** (stary
cap-int i nowy target są niewspółmierne; stary int nie kodował intencji kompozycyjnej wartej zachowania) + seed
neutralnego targetu. `serialize`/`restore` round-trip nowego pola; guardy `?? null`. Continuous-feel z PERSYSTOWANYM
akumulatorem = NOWE pole (`_focusMigrationProgress`) + własny seed; sub-year cadence bez carry = bez nowego stanu.
Tri-state per-building = OSOBNY dodatek save-format (jeśli enum na `_active`).

---

## FORKI (wszystkie — Filip wybiera PRZED kodem)

**FORK 1 — Semantyka focus (RDZEŃ, przesądza resztę):** (A1) target-SHARE % workforce/strata (stabilny pod
wzrostem — rek.), (A2) target absolute-HEADCOUNT (intuicyjny, dryfuje z popem), (A3) additive bonus + ranking
(inkrementalny, najmniejsza zmiana). A1/A2 zmieniają znaczenie `getStrataPressure:1241`.
**FORK 2 — Target NAD jaką pulą (droid/lock):** (a) gross incl droidy (łamie droid-net), (b) `_humanJobs` netto
(droidy kurczą pulę — rek.), (c) pula MOBILNA (unlocked). + `_focusCap` recompute na `_humanJobs` nie gross (`:1228`).
**FORK 3 — Target vs migracja płacowa (Etap 2 `:1354`):** target OVERRIDE gradientu płac, czy COEXIST (blend/priorytet)?
Jeśli override → wage kosmetyczna DLA MIGRACJI (dalej realna dla kosztu). Rek.: target primary, wage = tie-break.
**FORK 4 — Mechanizm continuous-feel:** (C1) alokacja sub-year (per game-month 1/12 friction — rusza STAN ciągle,
ale re-run Etap-0/1 + `_reapplyAllRates` churn + interakcja freePops≈unemployed + ordering satysfakcji), (C2) yearly
cadence + interpolacja TYLKO DISPLAY (kosmetyka, najtańsze/najbezpieczniejsze), (C3) yearly + UŁAMKOWY akumulator
friction (małe straty trickle). **Decyzja: STAN ciągły (C1/C3) vs READOUT ciągły (C2)** — przesądza save surface.
**FORK 5 — Friction floor:** `floor(0.10×count)` (straty <10 zamrożone) vs ułamkowy akumulator (trickle). Sprzężony z F4.
**FORK 6 — Building tri-state:** (6a) granularność per-building flag (mocne, ale serialize/migracja `_active`) vs
colony-wide 3-value (reuse `_productionEnabled` serialize `:706`); (6b) stany {active,paused,priority?} — „priority"
niezdefiniowane (nakłada się na energy-brownout); (6c) „pauza podczas budowy" scope: auto-ALL gdy jakikolwiek build
w kolejce vs per-designation vs contention-based; (6d) coupling EventBus (constructionProgress/Complete już emitowane
`:1318/1342` — bez nowych eventów, rek.) vs direct call `setFactorySystem:203` (łamie no-import); (6e) czy tri-state
PRZEKIEROWUJE pracowników (sprzęga z F1) czy czysty toggle produkcji (rek. — ortogonalny).
**FORK 7 — AI opt-in:** AI OFF (empty→economic, zero zmian — rek.) vs doktryna-target archetypu (osobny slice).
**FORK 8 — Save:** reshape `focusBonus` int→target in-place + RESET starych (rek.) vs nowe pole. + czy F4 dodaje
persystowany akumulator (nowe pole).
**FORK 9 — Tooltips:** dedykowane `getGrowthBreakdown()`/`getSatisfactionBreakdown()` (mirror getWorkforceBreakdown,
unit-testowalne — rek.) vs inline w ColonyOverlay. Źródło: `_computeLogisticGrowth:1171` (rate/prosperity/planetMod/
taper/capacity) + `_updateSatisfaction:1368` (emp/crowd/tax).
**FORK 10 (pochodna F1):** jeśli F1=A1 → rola rankingowa pressure znika → pressure = czysty sygnał wage-scarcity,
recompute `effDemand` bez focus (koniec double-count focus→wage).

## DECYZJE ZABLOKOWANE (Filip, gate 5C-plan)

- **F1 = Target-SHARE %** (A1). Focus[type] = docelowy % workforce; alokacja dąży do niego nad **pulą MOBILNĄ
  human-jobs** (F2-c: `Σ unlocked(_humanJobs)` — netto droidów, bez crew). Etap-1 rank = „najdalej pod targetem";
  pressure → CZYSTY sygnał wage-scarcity (F10: recompute `effDemand` bez focus, koniec double-count focus→wage).
- **F4 = Ułamkowy akumulator friction** (C3). Yearly cadence, `floor(0.10×count)` → per-(src,dst) akumulator
  `_focusMigrationProgress` (małe straty trickle: 3-worker → 0.3/rok → ruch po ~3 latach). **NOWE pole save (F8).**
- **F3 = Target primary, wage tie-break.** Etap-2 cel = under-target strata; wage tylko tie-break przy równym
  target-gap. Wage ZOSTAJE realna jako KOSZT (płace/podatek bez zmian).
- **F6 = „Priority" TAKŻE przekierowuje pracowników** (opcja sprzężona — NIE production-only). Wymaga **per-building
  designation** (który budynek jest priority) → granularność per-`_active`-entry (F6a) + serialize/migracja `_active`.
  Coupling przez **EventBus** (F6d, no-import). Patrz „Design coupling" niżej.
- **F7 AI OFF** · **F9 dedykowane `getGrowthBreakdown`/`getSatisfactionBreakdown`** · **F8 save v98→v99: reset int-focus
  → share + nowe `_focusMigrationProgress` + per-building priority-state**.

## Design coupling — „Priority" jako TRANSIENTNY target-bump (rekomendacja, do potwierdzenia)

Budynek w stanie **priority** (per-building): (1) **EventBus pauzuje konkurujące fabryki** (uwalnia surowce dla
kolejki budowy — rozwiązuje 5A early-Fe); (2) **wnosi TRANSIENTNY dodatek do target-share** dla swojej straty
(`popType`), proporcjonalny do jego `_humanJobs`, NAŁOŻONY na target gracza — pociąga pracowników przez TĘ SAMĄ
maszynę alokacji (accumulator). Po ukończeniu budowy / zdjęciu priority: transient usunięty, pracownicy relaksują ku
target-share gracza. **JEDNA maszyna alokacji** (structure-target), priority = transient overlay. Konflikt priority-labor
vs target gracza: ADYTYWNY (transient bump nad baseline), accumulator naturalnie rate-limituje (friction) — brak twardej
kolizji. ✅ ZATWIERDZONE (Filip): **transient-bump** (nie override) — komponuje się czysto, nie głodzi innych targetów.
Cap sumy targetów ≤100% (nadwyżka → clamp).

## Szkic implementacji (slice'y — po zatwierdzeniu)
1. **Model target-share** (`CivilizationSystem`): `_focusTarget[type]` (0..1, share) + `_focusMigrationProgress`
   (per-src/dst accumulator). Getter `getStrataTarget`/`setStrataTarget` (zastępuje setStrataFocus semantykę).
   Pula mobilna = `Σ unlocked(_humanJobs)`.
2. **`_allocateWorkforce` rewrite** (rdzeń): Etap-1 rank „najdalej pod targetem" (share × mobilePool − workers);
   Etap-2 cel under-target + wage tie-break; friction akumulator (F4). Zachowaj: droid-net, unlocked-crew, integer
   re-floor+remainder→U, idempotencję mid-year, `_reapplyAllRates` ordering. Empty target → economic fallback (AI).
3. **Pressure recompute** (F10): `effDemand` bez focus → pressure = wage-scarcity; getStrataWage bez double-count.
4. **Building tri-state** (`FactorySystem` per-`_active` state {active/paused/priority} + EventBus: build-queued →
   pauza konkurentów, priority → transient target-bump + pauza; restore na `planet:constructionComplete`).
5. **Tooltips** (F9): `getGrowthBreakdown()` (z `_computeLogisticGrowth`) + `getSatisfactionBreakdown()` (z
   `_updateSatisfaction`) → ColonyOverlay Workforce tab (target-share slidery + tooltipy).
6. **Save v98→v99** (`_migrateV98toV99`): reset `focusBonus`→`focusTarget` neutral + seed `_focusMigrationProgress:{}`
   + per-building priority-state default. serialize/restore round-trip + guardy.
7. **Testy:** economy-contract UNCHANGED (wage/tax/trade), droid/lock invarianty, `freePops≈unemployed`, target-share
   convergence, friction-trickle małych strat, priority-bump pull+restore, AI 60-let bez zamrożenia. + flaga `FEATURES`.

## 5C.1 — UI/UX Workforce tab + rule change (dodatki Filipa, w tym samym sub-slice)

**(1) Staffing GAUGES (per-strata termometr):** poziomy pasek `fill = (POP+droids)/jobs` (clamp [0,1]),
color-graded **<70% zielony / 70-90% pomarańczowy / >90% czerwony** (styl brutalist terminal, monospace-friendly —
render blokami np. `[████░░░░]`). ✅ ZATWIERDZONE (Filip): RED = strata SATUROWANA / przy capacity (wszystkie etaty
zajęte → rozbuduj budynki by rosła dalej); GREEN = miejsce na absorpcję pracowników (cue do ekspansji, nie błąd).
**(2) Kolumny:** `Jobs | POP | Droids | Wage | Focus` — **droidy = WŁASNA kolumna** (koniec „15+5🤖" w Emp) + per-strata
**[−] [+]** (instaluj/usuń droida w budynkach tej straty). Install reuse istniejący flow (dialog wyparcia); usuwanie
wg RULE CHANGE niżej.
**(3) RULE CHANGE (globalny, Filipa) — deinstalacja ZWRACA droida do magazynu:** `removeSynthetic:514` przed
`_reallocateAndRefresh` dodaje `resourceSystem.receive({[commodityId]:1})`. **Demolish (`:1294`) i downgrade-trim
(`:1207`) DALEJ NISZCZĄ** (destrukcja=katastrofa, deinstalacja=planowanie) — `getDemolishDroidLoss:622` + dialogi
demolish/downgrade BEZ zmian. UI copy: `synthetic.removeWarn` „NISZCZY droida"→„zwraca do magazynu", `removedFlash`
„🗑 zniszczony"→„🔄 zwrócony". Ekonomia droid-orders bez zmian (creditCost tylko przy PRODUKCJI). Testy: remove→
`getAmount+1`; demolish/downgrade→brak zwrotu (zachowane). **doc §8:** ewolucja reguły (destroy-on-remove = reguła
Fazy 4; potrzeba redeploymentu pod Build-N + bulk autonomize + tri-state ją zastępuje).
**Within-stratum install target: ✅ AUTO-PICK (Filip)** — `[+]` instaluje w budynek tej straty z NAJNIŻSZĄ obsadą
(najbardziej potrzebny wolny slot) przez `installSynthetic`; `[−]` deinstaluje z budynku tej straty z droidem
(np. najwyższy count) → zwraca do magazynu (rule change). Bez pickera UI (spójne z bulk „Autonomizuj"). Picker
odroczony jeśli gracz zgłosi potrzebę.
