# Slice 5B — Droid Autonomy (PLAN, przed kodem)

> Population 2.0 Faza 5, Slice 5B. Kolejność Fazy 5: 5A tuning ✅ (`d709f6a`) → **5B droid autonomy** →
> 5C allocation 2.0 → 5D housekeeping. Plan zatwierdza Filip PRZED kodem. Research: workflow 4-cluster
> (buildings/jobs, autonomy-mechanics, hull-cargo, AI-credits) — pełne cytaty w tym dokumencie.

## Decyzje ZABLOKOWANE (Filip, gate 5B-plan)

1. **Bulk retrofit action** — „Autonomizuj" instaluje `jobs×level` droidów w ISTNIEJĄCY budynek (pętla po
   działającym `installSynthetic`). BEZ nowych wariantów-budynków w danych. Koszt = produkcja droidów (istniejąca).
2. **Tier split ZACHOWANY** — tier-1 `automation_droid` obsadza laborer/miner/worker; engineer/scientist/merchant/
   bureaucrat wymagają tier-2 `android_worker` (gate `android_engineering`). Pełna autonomia kolonii = cel late-game.
3. **AI exempt z droid creditCost** — kolonie AI produkują droidy tylko za SUROWCE (skip 500 Kr). Zgodne z Fazą 3
   (kredyty AI kosmetyczne, „AI działa na surowcach"). Pełna ekonomia AI = osobny Faza-5-AI item.
4. **FULL-COLONY only** — 5B autonomizuje TYLKO pełne kolonie. **Outpost droid-boost ODROCZONY do Slice 5B.2**
   (patrz „Poza zakresem"). Powód niżej (outposty NIE mają slotów droidów).
5. **AMENDMENT (Filip) — BUILD-COST swap w zakresie 5B:** koszty budowy wariantów autonomicznych zamienione
   `android_worker → automation_droid` wg jobs-count (tabela niżej). **android_worker OPUSZCZA WSZYSTKIE koszty
   budowy** — zostaje TYLKO jako premium tier-2 installable worker. AI Build-N przełączony na automation_droid
   (`DROIDS_PER_OUTPOST=2` = solar 1 + mine 1); prosty łańcuch (Li/C/Fe/Cu/Si, bez Xe) → canSustain łatwiejszy →
   odblokowuje ubogie imperia (Pochód). To DATA + order-commodity swap, NIE reconcyliacja modelu outpostu (droid
   slots on outposts, ×0.6 boost = dalej 5B.2). 5D „unifikacja" kurczy się do samego cleanup nazw/ról.

**Tabela build-cost swap (jobs-count rule, ZASTOSOWANA):**
| Budynek | jobs-count | android_worker (stare) | automation_droid (nowe) |
|---|---|---|---|
| autonomous_mine | mine=1 | 3 | **1** |
| autonomous_solar_farm | solar_farm=1 | 3 | **1** |
| autonomous_spaceport | launch_pad=2 | 20 | **2** |
| orbital_mine | ~mine=1 | 4 | **1** |
| ai_core | own jobs=2 | 2 | **2** |
| orbital_habitat | own jobs=0 | 4 | **USUNIĘTE** (0 droidów) |

## Fundament — autonomia JUŻ działa (kluczowe odkrycie)

Model droid-per-job jest KOMPLETNY i grywalny dziś: `installSynthetic` wstawia 1 droida = 1 etat, budynek mieści
`jobs×level` droidów, ludzie+droidy mieszają się swobodnie. Zainstalowanie `jobs×level` droidów tier-1 → budynek
0-ludzki przy ×1.4 wydajności (`SYNTH_EFFICIENCY[1]`), flat upkeep 2 energii/droid/rok. Understaffed-/downgrade-/
demolish-safe. **5B NIE wynajduje mechanizmu — dodaje wygodę + zasięg + ekonomię.**
Cytaty: `BuildingSystem.js:446-493` (installSynthetic), `:1880-1912` (`_getBuildingLaborEfficiency`,
`(D×eff+(J−D)×humanStaff)/J`), `:394` (`SYNTH_EFFICIENCY {1:1.4,2:1.7}`), `:397` (`SYNTH_ENERGY_UPKEEP {1:2,2:6}`),
`:480` (`ALLOWED_SYNTH_STRATA {1:[laborer,miner,worker]}`).

### Cztery luki, które 5B wypełnia (wygoda/zasięg/ekonomia, NIE mechanizm)
1. **Brak bulk-action** — dziś `jobs×level` osobnych klików `installSynthetic`. „Autonomizuj" = największa ergonomia.
2. **Zasięg strat** — tier-1 tylko laborer/miner/worker; wyższe strata → tier-2 android (tech-gated). ZACHOWANE (dec. 2).
3. **AI payment** — 500 Kr/droid przy produkcji; AI nie ma dochodu → STALL. Fix: exempt AI (dec. 3).
4. **Cargo** — droid waży 3.0; transportowalny (już działa, patrz Deliverable 2).

## ⚠ Trzy byty o mylnie podobnych nazwach (do świadomości, unifikacja → 5D)

- **`automation_droid`** (tier-1, droidTier1, eff 0.40, waga 3.0, bez tech) — INSTALOWANY w sloty (droid-per-job).
  GŁÓWNY byt 5B (retrofit gracza).
- **`android_worker` jako tier-2 install** (droidTier2, eff 0.70, waga 5.0, tech `android_engineering`) — obsadza
  WYŻSZE strata w droid-per-job.
- **`android_worker` jako SKŁADNIK BUDOWY** — konsumowany w `commodityCost` autonomicznych wariantów
  (`autonomous_mine`/`autonomous_solar_farm`/`autonomous_spaceport`, 6/outpost = `ANDROIDS_PER_OUTPOST`). **TO
  jest ścieżka AI dla outpostów** (żywy dowód double-outpost = android_worker jako build-cost, NIE droidy w slotach).
  `EmpireStrategySystem.js:49`, `BuildingsData.js:345` (autonomous_spaceport android_worker:20).
5B NIE unifikuje tych trzech — reconcyliacja (stary autonomous-variant vs nowy droid-per-job) = kandydat 5D.

## Deliverable 1 — tabela konwersji kosztu (`autonomous cost = job count`)

`jobs = round(popCost×4)` (`BuildingsData.js:1582-1585`, wyjątek trade_union_hall forced 1). Autonomizacja budynku X
= instalacja `X.jobs` droidów → koszt = `jobs × recepta droida + jobs × 500 Kr` (koszt PRODUKCJI droidów; sama
akcja Autonomizuj konsumuje istniejący zapas droidów).

| jobs | # budynków | droidy | koszt surowcowy | Kr | przykłady |
|---|---|---|---|---|---|
| **0** | 15 | — (skip) | — | — | colony_base, habitat, arcology + **11 już-autonomicznych** |
| **1** | 24 | 1 | Li300 C1000 Fe1000 Cu500 Si2000 | 500 | mine, farm, solar_farm, research_station |
| **2** | 18 | 2 | Li600 C2000 Fe2000 Cu1000 Si4000 | 1000 | factory, shipyard, nuclear_plant, ai_core |
| **3** | 1 | 3 | Li900 C3000 Fe3000 Cu1500 Si6000 | 1500 | barracks_lv3 |
| **4** | 1 | 4 | Li1200 C4000 Fe4000 Cu2000 Si8000 | 2000 | historical_archive |

**Podział wg TYPU droida (strata → tier, dec. 2):**
- tier-1 `automation_droid` (bez tech): budynki laborer/miner/worker (~24) — mine, smelter, farm, well, solar/coal/
  geothermal, factory, synthesized_food_plant, fuel_refinery-human, itd.
- tier-2 `android_worker` (gate `android_engineering`): budynki engineer/scientist/merchant/bureaucrat (~20) —
  nuclear_plant, launch_pad, shipyard, fusion_reactor, wszystkie research (research_station/observatory/data_center/
  genetics_lab/ai_core/historical_archive), terraformer, trade_hub, admin_office, itd.

**Flagi:** (a) 15 budynków jobs=0 (housing/kapitał + 11 już-autonomicznych) → SKIP (nic do zastąpienia); (b)
`trade_union_hall` jobs=1 laborer — autonomizacja związku zawodowego droidami tematycznie sprzeczna → **exempt**;
(c) najdroższy: `historical_archive` (4 droidy tier-2 = Li1200/Si8000 + 2000 Kr + tech).

## Deliverable 2 — mission cargo feasibility (droid 3t vs kadłuby)

**Droidy = zwykły towar 3t, w pełni transportowalne DZIŚ, zero nowego kodu** (już w `_LOGI_GOOD_CATALOG`,
`loadCargo` bez special-case droida). Cargo = moduły (wszystkie kadłuby baseCargo 0): cargo_small +200t (bez tech),
cargo_large +1000t (bez tech), cargo_mass +5000t (tech `interplanetary_logistics`). Droidów/kadłub:

| hauler | pojemność | droidów/kurs |
|---|---|---|
| small hull + 1× cargo_small (bez tech) | 200t | **66** |
| small hull + 1× cargo_large (bez tech) | 1000t | **333** |
| medium hull + 4× cargo_large | 4000t | 1333 |

Tonaż = NON-constraint (66+ na najmniejszej ładowni). **Zastosowanie (skorygowane): dystrybucja droidów
MIĘDZY PEŁNYMI KOLONIAMI** (np. kolonia bez fabryki dostaje droidy z kolonii-producenta) — **NIE seeding
outpostów** (outposty nie mają slotów droidów, patrz niżej). Semantyka: dostawa robi `store.receive` do inventory
kolonii (`MissionSystem.js:2047`) — droid ląduje jako zapas, gracz instaluje ręcznie przez Autonomizuj.
Cytaty: `HullsData.js` (base 0), `ShipModulesData.js:116-162,685,716` (cargo modules, cargoMax=ΣcargoAdd),
`Vessel.js:564-587` (loadCargo generic, weight z COMMODITIES), `CommoditiesData.js:233` (waga 3.0).

## Deliverable 3 — AI creditCost proposal (WYBRANE: exempt AI)

**Problem (był latentny):** 500 Kr/droid ładowane przy ukończeniu produkcji, BEZ gałęzi player/AI, twardy STALL
przy niewypłacalności (`FactorySystem.js:904-910, 1444-1450`). AI nie ma powtarzalnego dochodu (podatek pomija AI
`ColonyManager.js:1538`, płace drenują AI, brak budżetu imperium). Kapitał AI startuje 1000 Kr (~2 droidy → STALL),
ekspansja 0 Kr (STALL na 1. droidzie). Dziś latentny bo AI Build-N celuje `android_worker` (bez creditCost).

**Rozwiązanie (dec. 3): EXEMPT AI.** `FactorySystem._trySpendProductionCredits`: jeśli kolonia-właściciel ma
`ownerEmpireId` (=AI) → pomiń opłatę Kr (return true bez wydania). Droidy AI = tylko surowce (dalej gate
`_colonyCanSustainRecipe`). Uzasadnienie: najmniejsza zmiana, AI już resource-gated nie credit-gated, zgodne z
Fazą 3 (kredyty AI kosmetyczne). Zachowanie AI POZA tym nietknięte (ścieżka outpost android_worker bez zmian).

## Plan implementacji (kroki + pliki)

1. **`BuildingSystem.autonomizeBuilding(tileKey)`** (NOWA metoda) — rdzeń bulk-action:
   - reject `_isOutpost` → `outpost_not_supported` (5B.2); reject `isAutonomous || jobs===0` → `nothing_to_autonomize`.
   - droidType wg `entry.building.popType`: laborer/miner/worker → `automation_droid` (tier-1); inaczej `android_worker`
     (tier-2). Tier-2 bez `android_engineering` → reason `requires_tech` (surface do UI).
   - openSlots = `jobs×level − currentDroidCount`; install `min(available_in_inventory, openSlots)` pętlą po
     `installSynthetic` (który już robi capacity/tier/strata/spend). Zwraca `{success, installed, shortfall, droidType, reason?}`.
   - REUSE `installSynthetic` w całości — zero duplikacji logiki instalacji.
2. **UI ColonyOverlay** — przycisk „🤖 Autonomizuj" w panelu budynku (obok install/remove synthetic). Pokazuje: typ
   droida, potrzebne (jobs×level), zapas, shortfall. Stany zablokowane: 🔒 tech (tier-2 bez android_engineering),
   „brak N droidów" (shortfall), ukryty gdy pełna autonomia. Klik → `autonomizeBuilding` + flash. (Opcjonalnie:
   przy shortfall zaproponuj Build-N reszty przez `setDroidOrder` — „produkuj i autonomizuj". Do rozważenia.)
3. **`FactorySystem._trySpendProductionCredits`** — gałąź AI-exempt (dec. 3). 1 warunek. Bez innych zmian ekonomii.
4. **Cargo** — bez kodu (działa). Ewentualnie tekst w tooltipie cost-preview że droidy są shippable między koloniami.
5. **i18n PL+EN** — `Autonomizuj`/reason (`requires_tech`/`insufficient_droids`/`nothing_to_autonomize`)/tooltip.

## Save migration
**BRAK (save zostaje v98).** Stan instalacji droidów już serializowany (Faza 4, `syntheticSlot` per tile).
Autonomizuj instaluje istniejące droidy → zero nowego stanu persystentnego. AI-exempt = runtime logic. Round-trip OK.

## Plan testów
- NOWY `tmp_slice5b_autonomy_smoke.mjs`: autonomizeBuilding wypełnia `jobs×level`; tier-split (tier-1 laborer OK,
  tier-2 bez tech/stock → reason); partial fill przy shortfall; outpost reject; **AI creditCost exempt** (kolonia
  AI produkuje droid @0 Kr, gracz @500); idempotencja (re-autonomizuj pełny = no-op); reasons.
- Regresja: droids 60, employment 52, growth 15, economy 32 + pełny sweep (0 nowych FAIL).
- Live-gate (Filip): autonomizuj factory/mine na pełnej kolonii → 0 ludzi, ×1.4, ludzie do bezrobotnych;
  tier-2 budynek zablokowany bez tech; AI nie stalluje na droidach. [[live-game-mandatory-gate]]

## Poza zakresem 5B (świadomie odroczone)
- **5B.2 — outpost droid-boost:** outposty dziś jobs=0 forced (`BuildingSystem.js:586-587`), staffing-free ×0.6
  (`OUTPOST_EFFICIENCY=0.6`, `:44,:1946`), ZERO slotów droidów (`installSynthetic` reject `autonomous_building`).
  Dać droidom rolę na outposcie (×0.6→×1.4, „remote extraction without population" = core 4X vision) wymaga
  ZMIANY modelu outpostu (un-force jobs=0 lub osobny outpost-droid slot) + reconcyliacji ze starym autonomous-variant
  modelem AI. Osobny slice po walidacji 5B.
- **5D — unifikacja (SKURCZONA po amendment):** build-cost swap już zrobiony w 5B (android_worker poza budową);
  zostaje SAM cleanup nazw/ról (android_worker = tylko tier-2 install; ewentualne przemianowania).
- **Faza-5-AI:** pełna ekonomia AI (dochód/budżet), AI świadomie autonomizujące pełne kolonie.
- **Energia autonomii:** flat 2 energii/droid + pełna energia budynku (nie standby, bo „obsadzony"). Zostaje as-is;
  re-balans (autonomia energożerna) = tuning późniejszy.
