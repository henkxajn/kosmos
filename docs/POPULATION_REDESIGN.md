# KOSMOS — Redesign systemu populacji (Population 2.0) — v3

**Status:** Dokument decyzyjny + Faza 0 (mapowanie) — do weryfikacji przez Filipa
**Zakres:** kolonie planetarne + stacje orbitalne
**Zmiany v3 (po ekstrakcji configu przez CC):** plan dostosowany do
ISTNIEJĄCYCH systemów — strata popType jako przemysły, rekalibracja
(nie przebudowa) ProsperitySystem, aktywacja istniejącego mechanizmu
syntheticSlot dla droidów, konwersja popCost→jobs mnożnikiem ×4.
Dodana pełna Faza 0.

---

## 1. Motywacja

Problemy obecnego systemu:
- **Feast/famine:** budynek zamraża ułamek popa (popCost 0.1–1.0);
  na starcie brakuje, później nadwyżka się marnuje.
- **Ułamkowe popCosty** nieczytelne w UI i debugowaniu.
- **Prosperity za łatwe:** targety 5 warstw osiągalne zbyt szybko,
  pościg 15%/rok za dynamiczny, brak jawnej kary za bezrobocie.
- **Droidy tier 1 nie istnieją** (automation_droid zreferowany, niezdefiniowany);
  android_worker za drogi na wczesną grę.

Cel: **głębia zautomatyzowana** — system sam alokuje ludzi, gracz decyduje
strategicznie (focus, droidy vs czekanie, habitaty). Inspiracje: Victoria 3
(płace/pressure), Frostpunk (droidy produkowane), Surviving Mars (droidy
tylko do prostej pracy).

**Pętla samobalansująca:**
```
przeludnienie → bezrobocie → ↓satisfaction → ↓prosperity(target)
→ wolniejszy wzrost + niższe podatki → presja: etaty/habitaty/eksport ludzi
```

---

## 2. Model danych — INTEGRACJA Z ISTNIEJĄCYM

### 2.1 Przemysły = istniejące strata (popType)

NIE tworzymy nowej listy przemysłów. Używamy istniejących popType:
`laborer, miner, worker, engineer, scientist, merchant, bureaucrat`.

Slider focus, pressure, płace — wszystko per strata. Istniejący
`_getBuildingLaborEfficiency` (min(1, strataCount/slotDemand)) zostaje
rdzeniem "płynnej obsady" — wymaga tylko przejścia na całkowite jobs.

### 2.2 Konwersja popCost → jobs (mnożnik ×4)

```
jobs_per_level = popCost × 4        // 0.1→0.4(→zaokr. 0 lub 1, patrz tabela)
population_after_migration = old_pop × 4
housing_after_migration = old_housing × 4
POP_CONSUMPTION bez zmian per pop → ×4 popu = ×4 konsumpcji:
  SKALUJEMY food/water/energy need ÷4 per pop (per-pop: food 0.625,
  water 0.375, energy 0.25) ALBO produkcję farm/studni ×4 — DECYZJA
  w Fazie 1 (prościej: need ÷4, zero zmian w budynkach).
```

- 1 pop = umowna jednostka (~250 osób fikcyjnie). Kolonia startowa po
  konwersji: ~20–40, dojrzała: 200–800.
- humans jako float wewnętrznie, UI pokazuje floor().

### 2.3 Populacja kolonii

```js
colony.population = {
  humans: 57.3, droids: {...},      // droids: per syntheticSlot (istniejące)
  unemployed: 6,                    // pochodna per tick
  capacity: 160,                    // housing ×4
  growthRate: 0.04,
  satisfaction: 62,                 // NOWE pole (sekcja 3.5) — zasila prosperity
}
```

**NIE MA nieskończonego zawodu bazowego.** Nadwyżka = unemployed: nie płaci
podatku, obniża satisfaction, pierwsza w kolejce do nowych etatów.

### 2.5 Relacja population.humans ↔ istniejące strata (KRYTYCZNE dla Fazy 1)

`population.humans` NIE zastępuje strat — jest kanoniczną SUMĄ. Strata
(civSystem.strata) zostają jako podział alokacyjny. Inwariant:

```
floor(humans) = Σ strata counts + unassigned
```

**Faza 1 (zatrudnienie jeszcze nietknięte):**
- Migracja: każda strata ×4; humans = Σ strata po konwersji; unassigned = 0.
- Wzrost logistyczny dopisuje do humans (float); przy przekroczeniu pełnej
  jednostki nowy pop trafia TYMCZASOWO wg istniejącej logiki przydziału
  strat, a jeśli takiej nie ma — do `laborer` (placeholder, jawnie
  oznaczony komentarzem PHASE2_TODO).
- BuildingSystem._getBuildingLaborEfficiency i ProsperitySystem czytają
  strata BEZ ZMIAN w Fazie 1 (poza podmianą wnętrza warstwy infrastructure
  na satisfaction — sekcja 3.6). Zero desyncu: strata to nadal jedyne
  źródło obsady budynków.

**Faza 2** przejmuje przydział: alokacja dwustopniowa (3.2) zastępuje
placeholder, unemployed staje się realną pochodną, lockedPops/employedPops
przechodzą na całkowite jobs.

### 2.6 Slider gracza (focus)

Per strata: demandBonus (wirtualne etaty, max +25% etatów budynkowych)
→ pressure → płace → migracja między stratami. Ludzie NIE są przypisani
do budynku, tylko do straty (jak dziś) — budynki w stracie dzielą pulę
proporcjonalnie (jak dziś w _getBuildingLaborEfficiency).

---

## 3. Wzory

### 3.1 Wzrost populacji (logistyczny)

```
effectiveRate = growthRate × prosperityGrowthMult × planetMod(planet)
growth = effectiveRate × humans × (1 − humans / capacity)
```
prosperityGrowthMult = ISTNIEJĄCE getGrowthMultiplier() z PROSPERITY_EFFECTS.
planetMod: z istniejących band temp/atmo/grav (reużycie z demand modelu).
Droidy poza wzorem i poza capacity.

### 3.2 Zatrudnienie i bezrobocie

```
totalJobs(strata) = Σ jobs budynków tej straty (auton./popCost 0 → 0 etatów)
employed = Σ workers per strata
unemployed = max(0, floor(humans) − employed)
```
Alokacja per tick: (1) wolne etaty zasysają bezrobotnych bez tarcia,
**wg PRESSURE desc (tie-break: płaca desc)** — Faza 3: pressure zamiast płacy, inaczej
focus na warstwach o niskiej baseWage (laborer) jest bezużyteczny (focus podnosi pressure,
nie samą płacę, więc ranking po płacy ignorowałby skupienie); (2) migracja między stratami
z tarciem: max 10% źródła/tick, tylko do wyższej PŁACY z wolnym etatem (ekonomiczny ciąg —
zostaje wg płacy); (3) utrata etatów → unemployed.

### 3.3 Pressure i płace (per strata)

```
effDemand = totalJobs + demandBonus
pressure  = clamp((effDemand − workers − droidJobs) / effDemand, 0, 1)
wage      = baseWage(strata) × (1 + pressure)      // max ×2
laborCost = workers × wage                          // droidy bez płacy
```

### 3.4 Produkcja budynku

Istniejący mechanizm: efficiency = min(1, staffing). Zmiana: staffing
z całkowitych jobs. syntheticSlot (droid zainstalowany w budynku, jak dziś)
→ budynek w pełni obsadzony, mnożnik z SYNTH_EFFICIENCY (t1 ×1.4, t2 ×1.7),
jego jobs znikają z demand straty.

### 3.5 Satisfaction (0–100, NOWA zmienna per kolonia)

```
satisfaction = clamp(
    S_BASE
  + W_EMP   × (1 − unemploymentRate × K_UNEMP)
  − W_CROWD × crowding                       // >85% zapełnienia habitatów
  + istniejący wpływ taxRate (z _calcSatisfaction — REUŻYCIE progów)
, 0, 100)
```

### 3.6 Prosperity — REKALIBRACJA (nie przebudowa!)

Istniejący ProsperitySystem ZOSTAJE (5 warstw, event/tech/trade/faction
modifiers). Trzy zmiany:

```
// 1. Szósta warstwa albo wpięcie satisfaction (3.5) do infrastructure:
//    DECYZJA: infrastructure layer już liczy housing+employment →
//    ZASTĘPUJEMY jego wnętrze naszym satisfaction (spójne, bez duplikacji).

// 2. GAMMA na target (malejące przyrosty u góry):
targetProsperity = 100 × (rawTarget / 100) ^ GAMMA     // GAMMA = 1.5

// 3. Wolniejszy pościg:
INERTIA: 0.15 → 0.08 /rok
```

Efekt: zawyżone prosperity w starych save'ach samo dryfuje w dół.

### 3.7 Przychody (JEDEN budżet imperium, bilans per kolonia jako widok)

```
tax   = employed × taxRate × prosperityTaxMod      // bezrobotni/droidy: 0
trade = civilianTradeIncome × (1 + k × industryEmploymentShare)
net   = tax + trade − Σ laborCost
```
UWAGA dla CC: istnieje już taxRate w prosperity — zintegrować z istniejącym
systemem podatkowym, NIE tworzyć drugiego.

---

## 4. Droidy — dwa tiery (istniejący mechanizm syntheticSlot)

**Przemianowanie w i18n:** "Android Robotniczy" zostaje dla tier 2;
tier 1 = "Droid" (EN "Droid") — dziś automation_droid ("Droid
Automatyzacyjny") — UPRASZCZAMY nazwę.

### 4.1 Droid (tier 1 — ✅ ZDEFINIOWANY, Faza 4 SHIPPED)

automation_droid był zreferowany (i18n, save v26→v27, starting inventory,
HexTile ×1.4), a Faza 4 ZDEFINIOWAŁA go w COMMODITIES (rename i18n → „Droid"):
Storage upkeep = ZERO (commodity semantics — potwierdzone niżej „zero upkeepu"),
aktywny slot = 2 energii (tier 1) / 6 (tier 2). assemblyBonus 2.0 = FLAT ×2 output.

```js
automation_droid: {
  tier: 1, droidTier: 1, isDroidUnit: true,
  recipe: { Li: 1000, C: 1000, Fe: 1000, Cu: 500, Si: 2000 },   // basic-only, DROGI w ilości
  creditCost: 500,                              // Kr/szt. — sink kredytów przy ukończeniu (pauza gdy brak)
  baseTime: 1.0,                                // rok/szt.
  weight: 3.0,
  requiresTech: null,                           // OD STARTU GRY
  efficiencyBonus: 0.40,                        // spójne z fallbackiem ×1.4
}
```
Trade value (cena rynkowa): **450 Kr, RĘCZNIE** (android_worker: 160 Kr).
⚠ **Re-gate ISSUE 1 (decyzja Filipa — finalna):** droid = STRATEGICZNA INWESTYCJA, nie akcja-spam.
Pierwotny recipe (Fe20/Cu10/Si15/C10, ~95 Kr) był ~10× za tani. Finalnie: recipe masowy (tylko
basic-mined, ale duże ilości) **+ `creditCost: 500 Kr/szt`** (nowe pole schematu receptury —
pobierane z kredytów kolonii przy ukończeniu; niewypłacalność PAUZUJE produkcję do czasu odzysku Kr).
Cena rynkowa RĘCZNIE 450 Kr — **świadome złamanie konwencji raw×1.3** (dałaby ~14 300 Kr, absurd vs
android 160): recipe to PRODUCTION SINK, nie cena rynkowa. Produkcja w praktyce **stockpile-gated
(surowce) + credit-gated (Kr)** — potwierdzone testem. baseTime bez zmian (1.0).
Produkcja: factory (FactorySystem, jak android_worker) — **plus AKTYWACJA
martwego pola assemblyBonus: 2.0 w robot_assembly** (2× szybciej, dokładnie
tak jak opisuje komentarz w kodzie).

**Dozwolone straty (proste): laborer, miner, worker.**
Pokrywa: kopalnia, huta, elektrownie (węgl./słon./geoterm.), farma, studnia,
fabryka, synth food plant, rafinerie. NIE: engineer, scientist, merchant,
bureaucrat.

**Model DROID-PER-JOB (post-Faza 4, zastępuje pierwotne „jeden slot = cały budynek"):** 1 droid = 1 etat.
Budynek pomieści do `jobs×level` droidów, mieszanych z ludźmi (efektywna obsada = ludzie + droidy, cap J).
**Jeden tier na budynek** (mieszanie tierów odrzucone). Efektywność PROPORCJONALNA do udziału droidów:
`(D×eff + (J−D)×humanStaff)/J` — pełny droid = ×tier (1.4/1.7), pół-droid = pół bonusu, a niedobsadzona
ludzka reszta poprawnie ciągnie wynik w dół (understaffed-safe; przy pełnej obsadzie ludzi = `1+(eff−1)×D/J`).
Upkeep energii **per droid** (`upkeep[tier]×D`). Install/remove operują na POJEDYNCZYCH jednostkach (cap J →
`building_full`); downgrade/demolish niszczą nadmiar droidów (bez zwrotu, ostrzeżenie „Zniszczy N droidów").
Save: `syntheticSlot = {commodityId, tier, count}` (migracja v97→v98: stary slot → J jednostek). Powód zmiany:
stary model skalował korzyść z poziomem przy stałym koszcie jednostki (jeden droid automatyzujący 10 etatów =
złamana ekonomia) i przeczył „droid = substytut POP, nie budynku".

### 4.2 AI Droid (tier 2 = istniejący android_worker — HAK, później)

- Zostaje jak jest (T3, android_engineering, ×1.7). Dochodzi PÓŹNIEJ:
  gating przez computeCapacity z istniejącego budynku data_center
  (+X compute/level), bardzo wysoki upkeep energii, dozwolone straty:
  engineer (+ ewent. merchant/bureaucrat; science domyślnie ludzie-only).
- Teraz TYLKO architektura: allowedStrata per droidTier w configu.

**Mechanika wspólna (istniejąca):** installSynthetic konsumuje jednostkę,
budynek działa bez ludzi z mnożnikiem tieru. Egzekwować allowedStrata
przy instalacji. Droid w magazynie: zwykły commodity, zero upkeepu (jak
dziś) — upkeep energii aktywnego droida: NOWE, per zainstalowany slot
(tier 1: 2 energii, tier 2: 6 energii — do tuningu).

---

## 5. UI

1. **Colony overlay — prawa sekcja, NOWA ZAKŁADKA "Workforce"** obok
   danych planety (wzorzec tabów + _drawOverlayHeader). Zawartość:
   tabela strat: jobs | workers | wage (podświetlenie pressure) | slider
   focus; pod spodem: unemployed (ostrzegawczo przy >10%), satisfaction,
   prosperity + strzałka trendu do targetu. Dane planety = zakładka domyślna.
2. **Bilans kolonii:** tax + trade vs płace, netto ±N/rok (w zakładce
   Workforce lub osobno — decyzja przy implementacji).
3. **Droid:** produkcja przez istniejący FactorySystem UI; instalacja
   przez istniejący flow installSynthetic.
   Styl: brutalist terminal (yellow/black, monospace).

---

## 6. Migracja save (bump wersji)

- pop ×4 → population.humans; housing ×4; per-pop consumption ÷4
  (albo produkcja farm ×4 — decyzja Faza 1).
- popCost → jobs wg tabeli Fazy 0 (×4, zaokrąglenia jawne w tabeli).
- Wstępna alokacja workers per strata proporcjonalnie do jobs; nadwyżka
  → unemployed; satisfaction policzona od razu; prosperity bez zmian
  (dryfuje do nowego targetu sam).
- syntheticSlots zostają bez zmian.

---

## 7. FAZA 0 — Tabela mapowania i stałe (DO WERYFIKACJI)

### 7.1 Budynek → strata → jobs per level (popCost ×4)

| Budynek | Strata | popCost | jobs/lvl |
|---|---|---|---|
| colony_base | — | 0 | 0 (housing 16) |
| mine | miner | 0.25 | 1 |
| solar_farm | laborer | 0.25 | 1 |
| coal_plant | laborer | 0.25 | 1 |
| geothermal | laborer | 0.25 | 1 |
| farm | laborer | 0.25 | 1 |
| well | laborer | 0.25 | 1 |
| habitat | — | 0 | 0 (housing 12) |
| research_station | scientist | 0.25 | 1 |
| factory | worker | 0.5 | 2 |
| smelter | miner | 0.25 | 1 |
| nuclear_plant | engineer | 0.5 | 2 |
| launch_pad | engineer | 0.5 | 2 (housing 4) |
| autonomous_spaceport | — | 0 | 0 (auton.) |
| shipyard | engineer | 0.5 | 2 |
| synthesized_food_plant | worker | 0.5 | 2 |
| autonomous_mine / autonomous_solar_farm / orbital_mine / gas_fuel_refinery / fuel_refinery | — | 0 | 0 (auton.) |
| fusion_reactor | engineer | 0.5 | 2 |
| terraformer | scientist | 0.5 | 2 |
| observatory | scientist | 0.25 | 1 |
| data_center | scientist | 0.25 | 1 |
| genetics_lab | scientist | 0.25 | 1 |
| arcology_building | — | 0 | 0 (housing 32) |
| ai_core | scientist | 0.5 | 2 |
| defense_tower | laborer | 0.25 | 1 |
| defense_grid | laborer | 0.5 | 2 |
| barracks_lv1 | laborer | 0.25 | 1 |
| barracks_lv2 | laborer | 0.5 | 2 |
| barracks_lv3 | laborer | 0.75 | 3 |
| antimatter_factory | engineer | 0.5 | 2 |
| vacuum_generator | engineer | 0.5 | 2 |
| orbital_habitat | — | 0 | 0 (housing 80) |
| trade_hub / free_market / trade_beacon | merchant | 0.25 | 1 |
| commodity_nexus | merchant | 0.5 | 2 |
| warp_beacon / jump_gate | — | 0 | 0 (auton.) |
| robot_assembly | engineer | 0.25 | 1 |
| android_lab | engineer | 0.5 | 2 |
| ai_nexus | — | 0 | 0 (auton.) |
| admin_office | bureaucrat | 0.25 | 1 |
| trade_union_hall | laborer | 0.10 | 1 (zaokr. w górę z 0.4) |
| cultural_center | bureaucrat | 0.5 | 2 |
| historical_archive | scientist | 1.0 | 4 |
| confederation_hall | bureaucrat | 0.25 | 1 |
| seekers_institute | scientist | 0.25 | 1 |
| mediation_center | bureaucrat | 0.5 | 2 |
| memory_vault | bureaucrat | 0.25 | 1 |
| mission_archive | scientist | 0.5 | 2 |
| heritage_dome | bureaucrat | 0.5 | 2 |
| directional_observatory | scientist | 0.25 | 1 |
| anomaly_research_lab | scientist | 0.5 | 2 |
| deep_space_array | scientist | 0.25 | 1 |
| dyson_command | bureaucrat | 0.5 | 2 |
| orbital_fabricator | engineer | 0.25 | 1 |
| stellar_collector_relay | engineer | 0 | 0 |

(Strata przepisana 1:1 z istniejących popType — jedyne odstępstwo:
trade_union_hall zaokrąglony 0.4→1.)

### 7.2 Stałe startowe (tuning w Fazie 5)

| Stała | Wartość | Uwagi |
|---|---|---|
| growthRate | 0.04/rok | bazowy, przed mnożnikami |
| planetMod (wzrost) | 0.6–1.0, ideał = **1.0** | Faza 1 shipped: breathable+moderate+normal = 1.0 (BAZA, bez bonusu). atmo none 0.7 / thin 0.85 / dense 0.9 · temp cold/hot 0.85 · grav low/high 0.9 · clamp [0.6, 1.0]. (Weryfikacja: humans=48, cap=160, breathable → 0.04×48×0.7 = 1.344/rok cyw.) |
| baseWage: laborer/miner/worker | 1 / 1.5 / 1.5 Kr/pop/rok | |
| baseWage: engineer/scientist | 3 / 4 | |
| baseWage: merchant/bureaucrat | 2 / 2 | |
| pressure cap | ×2 płacy | |
| tarcie migracji między stratami | 10% źródła/tick | |
| demandBonus cap (slider) | +25% etatów | |
| k (mnożnik handlu z zatrudnienia) | 0.5 | trade ×(1+0.5×share) |
| S_BASE / W_EMP / K_UNEMP / W_CROWD | 50 / 40 / 3 / 15 | 15% bezrob. zeruje W_EMP |
| GAMMA (prosperity target) | 1.5 | |
| INERTIA (prosperity) | 0.08/rok | z 0.15 |
| droid t1: recipe / czas / eff / upkeep | Li1000 C1000 Fe1000 Cu500 Si2000 +500Kr / 1 rok / ×1.4 / 2 energii | od startu, bez tech; rynek 450 Kr |
| droid t2 (android_worker) upkeep | 6 energii/slot | reszta bez zmian |

---

## 8. Fazy implementacji (commit + live-gate każda)

**Faza 0 — ZATWIERDZONA przez Filipa (2026-07-27)** — tabela 7.1 i stałe
7.2 obowiązują.

**Faza 1 — Jednostki, wzrost, satisfaction, rekalibracja prosperity — ✅ SHIPPED (save v96, 2026-07-27, live-gate PASS po 2 rundach fix):**
Migracja save (×4, jobs), wzrost logistyczny, satisfaction (3.5) wpięte
w warstwę infrastructure, GAMMA + INERTIA 0.08.

**Zmiany zaszłe (ostateczne, post live-gate):**
- **Redenominacja ×4 (PEŁNA — grep KAŻDEGO raw-pop mnożnika/progu):** populacja/housing/`jobs`(=popCost×4),
  `POP_CONSUMPTION ÷4`, colonistCapacity/crewCost/`GROUND_UNIT_POP_COSTS`/`SURGE_POP_COST`/MissionSystem crew ×4,
  starty (`DEFAULT_POP 2→8`, GameScene/GameCore/CombatSandbox/SpawnTestEnemy/EmpireStrategy/Bootstrap).
- **FIX 1 (live-gate #1 złapał niepełną redenominację POZA `POP_CONSUMPTION`):** ProsperitySystem survival
  (food 3.0→0.75, water 1.5→0.375), `BASE_DEMAND` ÷4 (ProsperitySystem popyt/satysfakcja + FactorySystem cel
  — jedno źródło), maturityFactor popFactor /15→/60 + gate pop<15→<60, epochScore /5→/20, `CIV_EPOCHS` minPop
  ×4 (40/120/320), CivilianTradeSystem TC 200→50×pop, ColonyManager tax 5→1.25×pop + maxGroundUnits /4→/16 +
  „mała kolonia" pop≤2→≤8, PopulationOverlay display ÷4, debug TC mirror. **AI/faction/war = ZERO progów pop**
  (grep czysty; test-boty NIE skalowane — Faza 5). planetMod breathable 1.2→**1.0** (§7.2).
- **`popCost → jobs`** = autorytatywne całkowite etaty; `popCost`/`entry.popCost` zostaje TYLKO polem serialize.
  Zewn. modyfikatory zatrudnienia (ImpactDamageSystem/RandomEventSystem) przełączone na `entry.jobs`.
- **Model:** `population` = getter Σ strata (bez zmian); NOWY `humans = population + _growthProgress` (inwariant
  floor(humans)=Σ strata). Wzrost `_computeLogisticGrowth` (capacity = Σ housing; **Decision 1: cap TAKŻE
  macierzystej**; bramka non-breathable zachowana). Satysfakcja `civSystem.satisfaction` (dren podatkowy →
  `ConsumerGoodsData.taxSatisfactionDrain`, reużyty — bez importu system↔system). Prosperity: infra layer →
  `satisfaction/100`, GAMMA 1.5, inercja 0.08.
- **FIX 2 — growth metric (re-gate):** JEDYNA metryka `CivilizationSystem.getAnnualGrowth()` (float z
  `_computeLogisticGrowth` PRZED promocją, jednostki POP/rok cyw.). **Legacy `populationGrowthRate` USUNIĘTE**,
  `_lastGrowth` (binarny flag) martwy. Root-cause „+0/rok": `_fmtInhab`/`_fmtPop`/`fmtPeople` (`round(n)` dla
  n<1000) zaokrąglały pop-unit float (0.2→„0") na TopBar/PopulationOverlay/NavPeek → `.toFixed(1)` (jednostki
  POP) wszędzie. „0" = kolonia w capie.
- **FIX 3 — home cap UI:** `effectiveHousing` NIE zwraca już ∞ na macierzystej → skończony humans/capacity
  wszędzie; growth `+n.n/rok` w nagłówku ColonyOverlay.
- **NOWE:** `src/data/PopulationData.js` (planetMod + stałe §7.2). Testy: `tmp_pop2_{migration 29, growth 12,
  prosperity 5}_smoke.mjs`. Save `_migrateV95toV96`. `PHASE2_TODO` oznaczone w kodzie.

**Faza 2 — Zatrudnienie, bezrobocie, pressure, migracja, zakładka Workforce:**
Jobs całkowite, unemployed, alokacja dwustopniowa, pressure/płace, slider,
zakładka w Colony overlay.
Live-gate: rozbiórka budynku → unemployed → satisfaction spada; nowy budynek
zasysa bezrobotnych; produkcja skaluje się płynnie; zakładka renderuje się.

**Faza 3 — Ekonomia:** płace jako wydatek imperium, tax (integracja
z istniejącym taxRate!), mnożnik handlu, bilans per kolonia.
Live-gate: bilans = delta budżetu; focus kosztuje; bezrobocie = niższe podatki.
- **Dług testowy do naprawy w Fazie 3:** dwa smoke'y trade-capacity —
  `src/testing/smoke/s34c_trade_selfcargo_smoke.mjs` (6/15) i
  `s34c_z1_tradecap_diagnosis_smoke.mjs` (7/12) — FAILUJĄ już na bazie sprzed
  Fazy 2 (potwierdzone `git stash`), bo asertują STARĄ formułę TC (200×pop)
  po redenominacji ×4 na 50×pop (Faza 1). Naprawić fixture'y wraz z pracą nad
  handlem/płacami w Fazie 3 (dotykamy `CivilianTradeSystem`).

**Faza 4 — Droid tier 1 — ✅ SHIPPED (save v97 bez migracji):** definicja
automation_droid w COMMODITIES (basic-only recipe Fe60/Cu40/Si50/C30/Ti10, bez tech, od
startu; trade 371 Kr), rename i18n → „Droid", assemblyBonus 2.0 FLAT (robot_assembly
×2 output automation_droid), allowedStrata per droidTier (`ALLOWED_SYNTH_STRATA[1]=
[laborer,miner,worker]`; tier 2 unrestricted), upkeep energii aktywnego slotu
(`SYNTH_ENERGY_UPKEEP {1:2,2:6}`, per-budynek w effectiveRates → energyChain), scope 6
fix (net demand w `_getBuildingLaborEfficiency` — droid nie rozcieńcza ludzkiej efektywności).
- **⚠ Odkrycia:** (1) `installSynthetic`/`removeSynthetic` były MARTWE — zero callerów
  UI; (2) `installSynthetic` czytał nieistniejące `resourceSystem._inventory[id]` (ResourceSystem
  = Map) → naprawione na `getAmount`/`spend`. Debug: `KOSMOS.debug.installDroid/removeDroid`.
- **UI:** przycisk Zainstaluj/Usuń droida w pływającym panelu budynku (ColonyOverlay), stan
  allowed/blocked + powód i18n, tier-priority (droid→android), ostrzeżenie „Usunięcie NISZCZY
  droida". Workforce pokazuje syntetyki per warstwa („6+2🤖").

**Faza 4 — RE-GATE (2. live-gate, save v97 bez migracji):** live-gate złapał „testy zielone,
gra zepsuta" — install działał w headless, znikał w grze. **ROOT-CAUSE = `ColonyOverlay._getGrid`
REGENEROWAŁ grid gracza** przy każdym otwarciu mapy (guard reuse obejmował TYLKO kolonie obce
`isHostileColony`). Po wczytaniu zapisu `ColonyManager.restore` ustawiał `colony.grid = savedGrid`
(z `syntheticSlot`), a `_getGrid` go wyrzucał i generował świeży → **droidy znikały po reloadzie
(BUG C), a energyChain/Usuń działały na innej instancji grida (BUG A/B)**. Testy używały JEDNEGO
grida → nigdy nie łapały diverencji.
- **Fix:** wydzielony pure `shouldReuseColonyGrid(colony, isHostile)` (`src/ui/ColonyGridResolveLogic.js`,
  bez THREE — testowalny headless); `_getGrid` uszanuje grid gdy obcy LUB `colony._gridFromSave`
  (stempel w `ColonyManager.restore`) + synchronizuje `bSys._grid` do tej samej instancji + biomy +
  `_syncTileBuildings`. Jeden grid dla install/energyChain/render/save.
- **ISSUE 1 (recipe/cena — FINALNE, decyzja Filipa):** droid = strategiczna inwestycja, nie spam.
  Recipe masowy `Li1000/C1000/Fe1000/Cu500/Si2000` **+ nowe pole `creditCost: 500 Kr/szt`** (pobierane
  z kredytów kolonii przy ukończeniu w `FactorySystem._update` → `_trySpendProductionCredits`; brak Kr
  PAUZUJE alokację, progress+składniki nietknięte). Cena rynkowa RĘCZNIE 450 Kr (świadome złamanie
  raw×1.3 — recipe = sink, nie cena). Praktycznie stockpile+credit-gated (test k). UI: `formatRecipe`
  pokazuje `💰500Kr`, `_productionBlockHtml` ostrzega o niewypłacalności (i18n `econPanel.*`).
- **ISSUE 2 (tempo produkcji): brak units-buga.** Diagnoza headless: automation_droid @1 pkt
  produkcji = **dokładnie 1 szt / 1 civ-rok** (= baseTime, spec), android baseTime 2.5 → 0.4/civ-rok
  (też zgodne). Percepcja „10× za szybko" = mnożniki stakują się (punkty × techFactorySpeed ×
  assemblyBonus 2.0) w rozwiniętej kolonii + skala civ-vs-game-year. Źródłowa matematyka poprawna —
  NIE ruszano baseTime ani ticku. Ekonomiczny hamulec floodu = ISSUE 1 (limit składników).

**Post-Faza 4 — SYNTHETIC WORKFORCE OVERHAUL (save v97→v98, live-gate PASS):**
jeden atomowy arc łączący fixy fundamentu automatyzacji z redesignem modelu na **1 droid = 1 etat**
(decyzja Filipa). Powód redesignu: stary model „jeden slot = cały budynek" skalował korzyść z poziomem
przy stałym koszcie jednostki (jeden drogi droid automatyzujący 10 etatów = złamana ekonomia) i przeczył
§4.1 („droid = substytut POP", nie budynku).
- **Fundament (fixy w tym samym commicie, poprzedzają redesign):** (1) **freePops netuje syntetyki** —
  `_employedPops` było BRUTTO (liczyło etaty droidów jako ludzkie zatrudnienie) → droidy drenowały
  freePops, „0 wolnych" mimo bezrobotnych (rekrutacja zablokowana); teraz konsumenci (freePops/
  needsImmigrants/employmentPenalty) netują `getSyntheticJobsTotal()`, a display „employed" = ludzie
  (TopBar/drawer → `civSystem.employed`). (2) **FIX A — natychmiastowa realokacja** na install/remove
  (`_reallocateAndRefresh`, ta sama ścieżka co roczny tick): wyparci ludzie od razu do wolnych etatów/
  bezrobocia (koniec rocznego opóźnienia). (3) **FIX B — dialog wyparcia** przy instalacji w obsadzonym
  budynku („wyprze N, wolne etaty M", ostrzeżenie gdy M<N). (4) **UI polish:** „Zainstalowane: N" droidów
  w tooltipie magazynu; fix przepełnienia wiersza receptury (skrót materiałów + `💰Kr` zawsze czytelny) +
  pełna receptura na hover.
- **Model:** `tile.syntheticSlot` → `{commodityId, tier, count}` (count = liczba droidów, cap `jobs×level`;
  nazwa pola legacy-singular zachowana dla stabilności serializacji). **Jeden tier na budynek** (mieszanie
  odrzucone `tier_mismatch`). Efektywna obsada = ludzie + droidy (cap J).
- **Efektywność (proporcjonalna, understaffed-safe):** `(D×SYNTH_EFF[tier] + (J−D)×humanStaff)/J` — pełny
  droid = ×tier, pół-droid = pół bonusu (= `1+(eff−1)×D/J` przy pełnej obsadzie ludzi), a niedobsadzona
  ludzka reszta poprawnie ciągnie wynik w dół (nie fałszywie pełny bonus).
- **Energia:** upkeep PER DROID (`SYNTH_ENERGY_UPKEEP[tier] × D`), nie per budynek.
- **Netting:** `getSyntheticJobs`/`Total` liczą JEDNOSTKI (droidy), nie etaty budynku → freePops/pressure/
  alokacja spójne; `countInstalledSynthetics` = suma droidów.
- **Install/remove per-unit:** install dokłada 1 droida (cap J, `building_full`), remove zdejmuje 1
  (NISZCZY). Oba wyzwalają natychmiastową realokację (FIX A). Wyparcie per-unit: N∈{0,1}/install.
- **Downgrade/demolish (D5):** obniżenie poziomu trimuje nadmiar droidów (zniszczone, bez zwrotu); pełna
  rozbiórka czyści slot (naprawiony BUG: osierocony slot na pustym kaflu). UI ostrzega „Zniszczy N droidów".
  Odczyty clampują `min(count, J)`.
- **Migracja v97→v98** (`_migrateV97toV98`): stary whole-building slot → `count = jobs×level` (zachowuje
  pełną automatyzację; NIE 1 jednostka — cicho de-automatyzowałoby wysokie poziomy).
- **UI widoczności (re-gate):** panel budynku pokazuje „Obsada: {J−D} POP + {D}🤖 / J", „Produkcja (×eff)"
  (mnożnik D2 obsady) i jawny upkeep droidów; zakładka Workforce — kolumna Jobs = BRUTTO (pełna pojemność),
  Emp = „h+m🤖" (math pressure/alokacji zostaje NETTO — tylko wyświetlanie); panel auto-sizuje wysokość do
  sekcji droidów (fix przycinania przycisków Install/Remove). energyChain: kolumny `droids N/J` + `synthUpkeep`.
- Testy: `tmp_pop4_droid_per_job_smoke` (49) — install/cap/full, efficiency 1.0/1.2/1.4/0.95/1.7, per-droid
  energy, displacement per-unit, migracja, tier-mismatch, downgrade trim, UI display-data (gross-vs-net jobs +
  composition). Pełna regresja pop2/3/4 + brownout + auto-expander 0 nowych FAIL.

**Faza 5 — Tuning i AI:** stałe na realnej rozgrywce; ColonyAutoExpander:
habitaty przy pełnym capacity, budynki-etaty przy bezrobociu, bez bankructwa
na płacach.
Live-gate: sesja 30+ min, bez runaway'ów, AI bez trwałego bezrobocia >20%.
- **⚠ PRIORYTET (runaway zaobserwowany w grze, field-gate):** wzrost logistyczny PRZESKALOWUJE przy
  dużej populacji — pop 100+ z arcologiami → ~1.8/rok → skokowe bezrobocie ~50% → satysfakcja ~19% →
  wzrost zduszony (sprzężenie bezrobocie→satysfakcja→wzrost za ostre przy skali). Cele tuningu:
  bazowe tempo wzrostu (0.04) / **ABSOLUTNY cap wzrostu (nowy)** / złagodzenie `SAT_K_UNEMP`.
  Podniesiony priorytet — nie teoretyczny, realny cykl runaway/crush obserwowany na żywym save.
- **✅ Slice 5A POINT 2 — cap wzrostu ROZSTRZYGNIĘTY (re-gate Filip: `MAX_GROWTH_PER_YEAR 1.0→0.25`):**
  Kadencja „1 POP/game-month" była POPRAWNA, NIE leak — `_updateLogisticGrowth` odpala DOKŁADNIE raz/civ-rok,
  a cap /civYear × CIV_TIME_SCALE(12) = 12 POP/gameYr przy saturacji (dowód: `probe-growth-cadence.mjs` +
  4-soczewkowy adversarial verify, 0 refutacji). Cap 0.25 → plateau **~3 POP/gameYr**.
  **⚙ DŹWIGNIA KSZTAŁTU (świadoma decyzja Filipa): cap-plateau vs BASE_RATE-boom.** Cap PONIŻEJ naturalnego
  szczytu logistyki (~1.34) SPŁASZCZA krzywą do stałego ~3/gameYr przez większość życia kolonii (S-kształt
  tylko humans<~7 i przy capacity) — POŻĄDANE: płaski sufit, który gracz planuje („rosnę ~3/rok → potrzebuję
  ~3 etatów/rok") bije rosnący boom wyprzedzający budowę etatów (przyczyna field-catastrophe). **Gdyby
  live-play chciało boom-feel z niższą amplitudą → obniż `BASE_GROWTH_RATE` (0.04) ZAMIAST capa (zachowuje
  rise-then-fall). NIE ruszać `BASE_GROWTH_RATE` dla samego throttle — cap wystarcza.** (`SAT_K_UNEMP 3→2` +
  floor-at-0, `GROWTH_TAPER_SCALE=400` — reszta Slice 5A.) Regresja: growth 15 / employment 52 / droids 60,
  0 nowych FAIL (auto-expander 74/1 = pre-existing well/waterless).
- **⚠ ARGUMENT ZA 5C (re-diagnoza z gate'u Slice 5A, early-Fe):** wczesny „ścisk Fe" to problem
  PRIORYTETU, nie wolumenu — reaktywny dren Fe fabryki (struct_alloys itd.) konkuruje z kolejką BUDOWY
  o ten sam ubogi zapas Fe (1 kopalnia ~6 Fe/rok, `probe-fe-squeeze` potwierdza pin ~6). NIE recipe/BASE_DEMAND
  (dobra konsumpcyjne zdiagnozowane jako ~0 drenu Fe). Rozwiązanie należy do **5C building tri-state**:
  „Wstrzymaj" fabrykę podczas budowy zwalnia Fe dla kolejki; opcjonalnie **construction-reserves** (rezerwa
  surowca na budowę) jako pod-item 5C. Hard-gate obsady kopalni (dbeab34) = świadoma trudność, zostaje.
- **Do re-ewaluacji (obserwacja z live-gate Fazy 2):** sprzężenie
  bezrobocie → satysfakcja → prosperity → wzrost może być zbyt karzące
  (`SAT_K_UNEMP=3`, GAMMA 1.5, inercja 0.08 + gate wzrostu). Ocenić PO tym, jak
  usunięcie bramki POP na budowie (Faza 2 FIX A) zmieni realną dynamikę
  bezrobocia — dopiero wtedy kalibrować stałe (nie na oko przed obserwacją).
- **Pełna ekonomia AI (z Fazy 3):** dziś AI NIE ma powtarzalnego dochodu (podatek
  pomija AI, handel wymaga portu którego mają tylko stolice, brak budżetu imperium,
  1000 Kr stolica / 0 Kr ekspansja, brak dotacji). Faza 3 obciąża AI płacami
  symetrycznie → kredyty AI drenują do 0 (kosmetycznie — AI działa na surowcach,
  zero bramek kredytowych). Faza 5: dać AI realny dochód (ścieżka podatku dla AI),
  budżet imperium, decyzje świadome kredytów. Do tego czasu płace AI = soft flow.
- **Konsekwencje chronicznego niepłacenia płac (z Fazy 3):** kolonia przy 0 Kr płaci
  częściowo/wcale bez kary (soft flow, §3.7). Faza 5: rozważyć realną konsekwencję
  (spadek satysfakcji? niepokój?) przy tuningu — dopiero po obserwacji, nie na oko.
- **Profilowanie (narzędzie z Fazy 3):** `KOSMOS.debug.energyChain(planetId?)` — STAŁE
  narzędzie debug (console.table łańcucha energii per budynek: staffing/empPenalty/
  energyCost/baseRates.energy/effectiveRates.energy/zarejestrowane w ResourceSystem/bilans).
  Użyć w Fazie 5 do profilowania bilansu energii i weryfikacji skalowania zużycia obsadą po
  zmianach balansu (analogicznie `KOSMOS.debug.colonies()` dla zdrowia populacji/AI).
- **Przegląd cen (z re-gate Fazy 4):** droid dostał wysoką cenę produkcji (recipe masowy +
  creditCost 500) z uzasadnieniem „inwestycja, nie spam". Faza 5: analogiczny przegląd
  `android_worker` (też droga produkcja, ta sama zasada) + audyt pozostałych cen commodities
  (spójność `BASE_PRICE` vs realny koszt produkcji — dziś część to raw×1.3, część ręczna).
- **Review energii automatyzacji (z droid-per-job):** budynek w pełni obsadzony droidami pobiera **1.4×
  bazowej energii** (skalowanie zużycia efektywnością, PRE-EXISTING — świadomie ZACHOWANE) ORAZ **upkeep
  per droid** (2/6 × D). Faza 5: ocenić czy to podwójnie wycenia energię automatyzacji (double-pricing) —
  decyzja przy tuningu na realnej rozgrywce, nie na oko.
- **Ewolucja `android_worker` → „AI Droid" (backlog z live-gate 5B — NIE implementować teraz):** rola tier-2
  installable workera (obsada engineer/scientist/merchant/bureaucrat, gate `android_engineering`) docelowo
  przechodzi na **„AI Droid"** — tier-2 jednostkę bramkowaną OBLICZENIAMI (epik Data Center), z przeróbką
  receptury. `android_worker` pozostaje wtedy czystym bytem handlowym/legacy. Kolejność po 5C/5D; decyzja
  projektowa przy epiku Data Center.

**Post-Faza 4 — poprawka produkcji droidów (2 atomowe commity, save v98 bez migracji, live-gate PASS):**
- **`3a02f37` — boosted ×5 exemption + czytelne STALL-e:** `_getScaledRecipe` ×5'owało KAŻDĄ recepturę
  tier-1 w `civilization_boosted`, więc łapało `automation_droid` (tier 1, receptura ABSOLUTNA ~1000/szt.)
  → Li 1000→5000 > zapas gracza → perma-STALL „BRAK SUROWCÓW" (tylko boosted; testy w default nie łapały).
  Fix: exempt `isDroidUnit`. + `getStallReason` (tech > brak-składnika-z-ilościami > insolvent > no-points) na
  `getAllocations()`; `_productionBlockHtml` czyta SKALOWANĄ recepturę (czytał surową → „wszystko OK" mimo STALL).
- **`bec2028` — model dobra INWESTYCYJNEGO (Build-N):** droidy wyjęte z reactive/safety-stock (min-zapas 3
  wymuszał nadprodukcję + install cicho auto-uzupełniał). Rejestr `_droidOrders` per-typ (Build-N one-shot,
  koszt Kr/szt., ZERO auto-replenish, anulowanie zachowuje ukończone). Sekcja 🤖 DROIDY w panelu produkcji;
  min-zapas ukryty. Migracja soft (v98): konwersja jawnego one-shot droida, anulowanie in-flight reactive.

**Post-Faza 4 — field-fixes Report 1+2 (2 atomowe commity, live-gate PASS):**
- **`dbeab34` (Report 2) — wydobycie kopalni bramkowane obsadą górników (TWARDA bramka):** regularna
  kopalnia skaluje urobek frakcją obsady (`_getBuildingLaborEfficiency`, clamp ≤1.0, droidy liczą się);
  `MINE_STAFF_FLOOR=0` (GameConfig, tunable) → nieobsadzona = 0 urobku (celowa presja na obsadę/droidy/
  kolonistów — dziura ekonomii droidów). Autonomiczne/outpost (jobs=0) ×1.0; gas-refinery nietknięta.
  `_reapplyAllRates` unieważnia cache kopalń (obsada dynamiczna); `_cachedMineLevel` efektywny +
  `_cachedMineLevelRaw` (licznik); `getMineEfficiency` = level-ważona obsada (satysfakcja górników);
  panel „Wydobycie/rok (×0.00): +0.0 Fe" (uczciwy stan zamiast pustego „(×0)").
- **`ef9f9a1` (Report 1) — AI zamawia androidy Build-N pod outposty (demand-driven):** reforma droidów
  (bec2028) zabiła produkcję `android_worker` AI (setDemandBonus no-op + BRAK AI callera setDroidOrder) →
  0 androidów → outpost (koszt android:6) nieosiągalny → 0 nowych kolonii AI. Fix
  `EmpireStrategySystem._maybeOrderOutpostAndroids` (z `_runColonizationTree` gdy !canOutpost): Build-N na
  macierzystej, 6×plannedOutposts, cap 24, dedup vs magazyn+w-toku, gate `_colonyCanSustainRecipe`.
  **Relaksacja (live-gate Castor e): zamawia gdy androidShort>0 NIEZALEŻNIE od innych braków** — produkcja
  androida (~15 civY) leci RÓWNOLEGLE do reactive, nie serializuje czekania. Obserwacja: `[AI]` logi
  (zamówienie/ukończenie/outpost) + `debug.aiExpansion`/`aiOrders` + `explainColonization`.
- **Werdykty live-gate:** Konsorcjum (emp_001) = wzorcowe AI, doktryna **SATUROWANA** (Xe/Nt cele osiągnięte
  → pełne kolonie, NIE bug — werdykt S1 z probe). Pochód (emp_002) = ŻYWY dowód relaksacji (postawił +18
  android Build-N i UKOŃCZYŁ mimo równoległego braku Ti); jego niezdolność do outpostu = **zepsuta ekonomia
  bootstrapu, OUT OF SCOPE** (decyzja Filipa — patrz §9).
- **Przyszła dźwignia (Report 1):** **rezerwacja ciał Xe/Nt** — jeśli fallback pełnej kolonii zjada
  kandydatów na outpost ZANIM android gotowy (chicken-and-egg). Wygrany w zdrowej ekonomii (Xe = najniższy
  priorytet fallbacku, przeżywa ~15 civY produkcji androida), więc lever tylko gdyby realnie dokuczał.
- **Metoda diagnozy (utrwalona):** probe realnej ekonomii BEZ wstrzykiwania łapie to, co izolacja UKRYWA
  (integration-test wstrzykiwał `android_worker:1e3` → maskował root-cause). `_colonyCanSustainRecipe`
  SŁUSZNIE bramkuje kolonię raw-starved (order 0/N = stall bez sensu). [[trace-observed-behavior-over-greps]]

**Faza 5C.1 — Allocation 2.0 core (`82458aa`, save v99, `FEATURES.popAllocation2` default ON, live-gate PASS):**
Plan: `docs/plans/slice-5c-allocation-2.0.md`. Focus przestaje być int-bonusem do pressure, staje się DOCELOWYM
UDZIAŁEM (share 0..1) struktury siły roboczej.
- **Model:** `_focusTarget[type]` (share) + `_focusMigrationProgress` (per-`src>dst` ułamkowy akumulator friction).
  `getStrataTarget`/`setStrataTarget`, `_hasAnyTarget`, `_mobileJobPool`, `_targetHeadcounts` (Σshare>1 →
  normalizacja proporcjonalna, cap per-strata do `_humanJobs`). Stary `_focusBonus`/`getStrataFocus`/`_focusCap`
  ZOSTAJĄ tylko dla ścieżki flag-OFF.
- **Alokacja:** ekonomiczna gałąź (`_allocateStage1Economic`/`_allocateStage2Economic`) = **verbatim Faza 3** —
  odpala się pod flag OFF ORAZ pod flag ON gdy BRAK targetu (AI i un-focused player nietknięci; `empty ≡ dziś`).
  Target-guided: Etap-1 tuple `(targetDeficit desc, pressure desc, wage desc)` (additive overlay); Etap-2 migracja
  z akumulatorem ku warstwom pod-targetowym, **tylko rocznie** (`advanceMigration`; mid-year `_reallocateAndRefresh`
  = `false` → idempotencja). **Dawca guard:** warstwa targetowana i sama pod targetem NIE jest dawcą (inaczej dwie
  wzajemnie pod-targetowe okradałyby się w kółko — limit cycle złapany review'em).
- **F10 pressure:** pod flagą `effDemand = grossJobs` (czysty wage-scarcity, koniec double-count focus→wage). Przy
  neutralnym focusie identyczne z Fazą 3 → kontrakt ekonomii (wage/laborCost/employed/industryShare) byte-identical.
- **Droid rule change:** `removeSynthetic` ZWRACA droida do magazynu pod flagą; demolish/downgrade DALEJ NISZCZĄ.
  UI: kolumna Droidy z per-strata `[±]` (auto-pick: install najsłabiej obsadzony budynek, remove zwrot), termometry
  obsady `[████░░░░]` (zielony <70 / pomarańcz 70-90 / **czerwony ≥90 = SATUROWANA**, cue do rozbudowy budynków).
- **Save v98→v99** (`_migrateV98toV99`: reset int-focus → `focusTarget:{}` + `focusMigrationProgress:{}`).
- **Testy:** `tmp_pop2_5c1_smoke` 43/43 przez REALNE ścieżki (economy byte-identical, droid-net, locked-crew,
  integer re-floor, mid-year idempotence, empty→Faza-3-exact, konwergencja+trickle, remove-returns/demolish-destroys,
  AI 60-let no-freeze, share>100% norm, limit-cycle guard). Regr 0 nowych FAIL; legacy focus/droid-destroy testy
  przypięte do flag OFF (guard rollbacku). 4-lens adversarial review: rollback+save-migration czyste, 1 confirmed
  low limit-cycle (naprawiony), 1 missing i18n key (dodany).
- **⚠ SEMANTYKA (finding z live-gate — NIE bug):** w reżimie NADWYŻKI POP (wszystkie etaty obsadzone, 0 bezrobotnych)
  target NIE ma czego rozdzielać — F1 rankuje alokację NIEDOBORU, nie robi eviction-based redystrybucji. „Slider nic
  nie robi przy pełnej obsadzie" = design działa jak zablokowano. Poprawny przepływ potwierdzony gdy powstał niedobór
  (nowe budynki + miners 0% / laborers 50% → górnicy zmigrowali). **Cisza mechaniki myliła gate → 5C.2 doda wskaźniki
  stanu suwaka** („cel nieaktywny: brak niedoboru" przy pełnej obsadzie / „cel nieosiągalny: za mało etatów <strata>"
  przy over-jobs targecie).
- **TUNING (obserwacja do rewizji PO 5C.2):** cap wzrostu `MAX_GROWTH_PER_YEAR=0.25` (Slice 5A) może wciąż wyprzedzać
  tempo budowy etatów → reżim nadwyżki POP czyni alokację w większości bezczynną (patrz finding wyżej). Rewidować cap
  vs tempo konstrukcji po wylądowaniu 5C.2.

**Faza 5C.2 — tri-state budynków + priorytet (`0e34b2c`, save v99 soft, `FEATURES.popAllocation2Priority` default ON,
live-gate PASS po fixie). SLICE 5C COMPLETE.** Nadbudowa nad 5C.1.
- **Tri-state** `entry.designation {active|paused|priority}` (serialize soft `?? 'active'`, v99 bez bumpu).
  **PAUSED = idle produkcji I ZWOLNIENIE ETATÓW** (gate-fix): `getSlotDemand`/`getSyntheticJobs(Total)`/greedy
  pomijają paused (gated) → pracownicy ewakuowani do bezrobocia w TYM SAMYM ticku (rekoncyliacja alokacji),
  satysfakcja reaguje realnym bezrobociem; `changeEmployment(∓jobs)` trzyma `_employedPops`/freePops spójne;
  wznowienie re-absorbuje. (Root: pierwsza wersja pauzowała tylko STAWKI, nie DEMAND → workers nie wracali do U.)
- **Within-stratum GREEDY fill** (`_getBuildingLaborEfficiency`): priorytet/stabilny-tileKey napełniany do 100%
  najpierw (zamiast uniform). Memo `_greedyStaffCache` invalidowany w `_reapplyAllRates` + activate/upgrade/demolish.
- **Priorytet → transient bump** (PULL, stateless): `BuildingSystem.getPriorityHumanJobs / mobilePool` w
  `_effectiveTargetShare` (cap Σ≤100%). Ściąga pracowników; greedy kieruje ich do budynku priority.
- **Factory-pause** (priority-scoped, model epizodu): priorytet + kolejka budowy → pauza fabryk komodytowych
  (early-Fe); gracz przejmie przełącznik → relinquish + suppression do końca epizodu; `_factoryPausedByPriority`
  serializowany (nie „stuck OFF" po load).
- **Tooltipy** `getGrowthBreakdown`/`getSatisfactionBreakdown` na stopce Załogi + **wskaźniki stanu suwaka**
  (`getTargetState`: inactive-no-shortage / unreachable — domyka lukę „ciszy" z 5C.1) + **podgląd ≈N osób**
  (`getTargetHeadcountPreview`) + reposition tooltipa (flip przy krawędzi). Fix: `THEME.amber` (undefined) →
  `THEME.warning` (odblokowało też pomarańczowy pas termometru + amber wage z 5C.1).
- **Kill-switch** `popAllocation2Priority` (default ON, nested pod popAllocation2 → 3-warstwowy rollback
  Faza3←5C.1←5C.2). Save v99 bez bumpu (+ `factoryPausedByPriority` soft w ColonyManager).
- **Testy** `tmp_pop2_5c2_smoke` **64/64** (greedy/paused-demand-gate-fix/priority-bump/factory-pause lifecycle+
  restore+suppression/breakdowns/target-state/headcount-preview/flag-OFF=5C.1/serialize; blok O = scenariusz
  live-gate przez REALNĄ ścieżkę przycisku). 4-lens adversarial review: 7 confirmed (greedy stale build/upgrade,
  paused-upgrade producer leak, factory-pause stuck-off, growth-breakdown pop≤0, resume-vs-manual-OFFLINE,
  THEME.amber, i18n) — WSZYSTKIE naprawione + regr-testowane. Regr 0 nowych FAIL.
- **Kolejność Fazy 5:** 5A ✅ → 5B ✅ → 5C.1 ✅ → **5C.2 ✅ (SLICE 5C COMPLETE)** → 5D (housekeeping) NEXT.

---

## 9. Poza zakresem (świadomie)

- AI Droid gating (computeCapacity z data_center) — osobny epic po Fazie 5.
- Strata "IT Specialist" — ODRZUCONA na teraz (za mało etatów → szarpiące
  pressure; semantyka pokryta przez scientist/engineer). Hak: rozważyć
  przy epicu AI Droida jako wymóg obsługi Data Center, gdy budynków
  compute będzie więcej.
- Kwalifikacje popów; gubernatorzy (W_TAX hak); kohorty kultura/lojalność.
- Konsumpcja dóbr w satisfaction (istnieje w prosperity layers — nie duplikować).
- Migracja międzykolonijna statkami pasażerskimi (pressure jako atraktor) — epic.
- ai_collective_node (tier 3, ×2.5) — zreferowany, niezdefiniowany — zostaje.
- **Ekonomia bootstrapu ubogiego AI (emp_002/Pochód) — someday:** imperium ze słabym startem nie uzbiera
  zestawu outpostu (chroniczny brak Fe/Si/commodity), więc nie zakłada kolonii mimo działającego fixa
  Report 1. Docelowo: mniej rozwinięte AI buduje WIĘCEJ prostych/small instalacji zamiast utykać na drogim
  outpostcie. Poza field-fixes (decyzja Filipa) — Konsorcjum (zdrowe AI) jest wzorcem, Pochód czeka.
