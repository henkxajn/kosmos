# S3.4 — Stacje orbitalne: dokument wznowienia (continuation plan)

> **Samowystarczalny.** Świeża instancja Claude Code ma wznowić pracę WYŁĄCZNIE z tego pliku
> + repozytorium. Nie zakłada pamięci poprzedniej sesji.
> **Data zamrożenia:** 2026-07-04 (koniec pracy po FAZIE 2; live-gate FAZY 2 PENDING).
> **Plan nadrzędny:** S3.4 „STACJE ORBITALNE: MODUŁY, POP, EKRAN, OZNACZENIA" (ewolucja Wariantu A z audytu).

---

## ⚠ FLAGA PROJEKTOWA — PRZECZYTAJ PRZED FAZĄ 4

**`obsada = max(pop, popCapacity)` to TYMCZASOWY MOSTEK.** W FAZIE 2 bilans pracy modułów
(`StationSystem._recomputeModuleStates`) używa `Math.max(station.pop, station.popCapacity)` jako
dostępnej załogi, bo **pasażerowie (FAZA 4) jeszcze nie istnieją**, a bez tego mostka `station.pop=0`
gasiłby każdy moduł trade/lab/shipyard zaraz po budowie (cała FAZA 2 byłaby martwa/nietestowalna).
Habitaty auto-obsadzają moduły do swojej pojemności.

**Na starcie FAZY 4 — decyzja Filipa (wiążąca dla implementacji pasażerów):**
- **REKOMENDACJA: powrót do `obsada = pop`** (habitat daje TYLKO pojemność, nie załogę), żeby
  transport pasażerski miał sens gameplayowy: świeża stacja z `pop=0` ma moduły `✗no_crew` aż
  do przywiezienia POP statkiem pasażerskim.
- Zmiana wymaga: (1) jednej linii w `_recomputeModuleStates` (`Math.max(...)` → `station.pop`);
  (2) aktualizacji **4 testów smoke** strzegących mostka: `tmp_s34_p2_smoke.mjs` przypadki
  **6.5/6.6/6.7/6.8** (obecnie zakładają auto-obsadę z popCapacity); (3) korekty live-gate:
  świeża stacja z pop=0 pokazuje `no_crew` do czasu dostawy POP.
- Jeśli Filip zdecyduje ZOSTAWIĆ mostek — passenger pop staje się „bonusem" ponad bazową obsadę,
  a transport pasażerski gra rolę populacyjną/lore, nie operacyjną. Wtedy nic nie zmieniać.

---

## g) PROTOKÓŁ WZNOWIENIA (wykonaj po kolei)

1. Przeczytaj **ten plik** w całości.
2. Przeczytaj oba audyty: `docs/audits/orbital-stations-audit.md` (nadrzędny) i
   `docs/audits/s34-phase0-findings.md` (FAZA 0 — etykiety/trade capacity/moduły statków/misje transportu).
3. `git log --oneline 35ce5a2^..HEAD` — przejrzyj commity S3.4 (35ce5a2 FAZA 1, 7073a99 FAZA 2).
4. Odpal oba smoke: `node tmp_s34_p1_smoke.mjs` (**50/50**) i `node tmp_s34_p2_smoke.mjs` (**54/54**).
5. Sprawdź **status live-gate FAZY 2** (patrz sekcja STAN / plik manuala):
   - **PASS od Filipa** → START FAZY 3.
   - **FAIL / brak** → najpierw poprawki FAZY 2 wg uwag Filipa; nie zaczynaj FAZY 3.
6. Manual testów: `docs/testing/s34-faza2-live-gate-manual.md`.

---

## a) STAN (2026-07-04)

| Faza | Status | Dowód |
|------|--------|-------|
| **FAZA 0** — mini-audyty | ✅ DONE | `docs/audits/s34-phase0-findings.md` (workflow 4 agenty + 4 weryfikatory, confidence high) |
| **FAZA 1** — dane + model + migracja v90 | ✅ DONE, **live-gate PASS z zastrzeżeniem** | commit **`35ce5a2`**; smoke `tmp_s34_p1_smoke.mjs` **50/50**. ⚠ Zastrzeżenie: migracja v89→v90 **nietestowana na żywo** (stary save nadpisany przez nową grę, single-slot) — akceptacja na podstawie headless smoke. Pokryte na żywo: natywny v90 nowej gry, moduły startowe (debug spawn + ścieżka orderowa UI), popCapacity=1, round-trip save→F5→load. |
| **FAZA 2** — logika ticka (budowa/energia/praca/efekty/stocznia) | ✅ DONE, **live-gate ZALICZONY W CAŁOŚCI** | commity **`7073a99`** + fix stoczni (`a3892e0`) + fix Command (`7894230`); smoke `tmp_s34_p2_smoke.mjs` **60/60**, `tmp_s34_command_stations_smoke.mjs` **17/17**; regresja FAZY 1 **50/50**, slice8b **51/51**. **F2 live-gate = R1-R3 PASS + fix Command zweryfikowany (V1-V5 PASS).** R1 stocznia (queue→build→spawn docked→rozkazy), R2 no_crew (rebalans na kolejnym ticku), R3 round-trip (progres przeżywa save→reload i kontynuuje) — zaliczone w powtórce PRZED fixem Command. FIX #1 (`a3892e0`): stocznia `insufficient_resources`. FIX #2 (`7894230`): Command „nie znał" stacji jako lokacji — V1-V5 PASS (statki stacyjne widoczne z 🛰, undock z Command, marker stacji klikalny, kolonijne bez regresji). |
| **FAZA 3** — ekran zarządzania | ✅ DONE, **live-gate PENDING** | `StationManagementView.js` (nowy) + tryb stacji w ColonyOverlay (zakładki 🛰, siatka slotów, picker modułów, depot, kolejka stoczni) + StationPanel „Zarządzaj". Smoke `tmp_s34_faza3_smoke.mjs` **16/16**; regr slice8b 51/51, s4_2 25/25, p1 50/50, p2 60/60. **Live-gate wykona Filip** (lista klikania niżej). |
| **FAZA 4** — transport POP | ❌ NIEROZPOCZĘTA | — |
| **FAZA 5** — etykiety na mapie | ❌ NIEROZPOCZĘTA | — |
| **FAZA 6** — domknięcie | ❌ NIEROZPOCZĘTA | — |

**Save:** `CURRENT_VERSION = 90` (`SaveMigration.js`). FAZA 1 wprowadziła `_migrateV89toV90`.
FAZA 2 nie bumpuje wersji (`shipQueues` przez `?? []` w konstruktorze — precedens `refuelAutomatically`).
Kolejność restore: `orbitalSpace.restore` (`GameScene.js:1268`) **przed** `stationSystem.restore` (`:1273`) — zachować.

### FIX FAZY 2 — stocznia stacji (ta sesja, commit `fix(S3.4-F2)`)

**Objaw (Filip, live-gate T6):** `KOSMOS.debug.stationBuildShip('science_vessel')` zwracał
`{ok:false, reason:'insufficient_resources'}` mimo że debug woła `stationFillDepot` bezpośrednio
przed. `giveAll(1000)` do kolonii nie pomagał (poprawnie — check jest na DEPOCIE stacji, nie kolonii).

**Root cause:** `stationFillDepot` (GameScene) dosypywał ustaloną listę pozycji, która **nie
zawierała `polymer_composites`** — a `science_vessel.commodityCost` go wymaga
(`{structural_alloys:4, polymer_composites:3, electronic_systems:2}`). `StationDepot.spend` jest
all-or-nothing → jeden brakujący składnik = całkowita odmowa. Analogicznie brakowało **`Xe`**
(`space_supply_ship.cost`). Reszta kadłubów (HULLS) też wymaga `polymer_composites` (small/medium/large).

**Fix (3 zmiany, bez migracji save):**
1. **`stationFillDepot` DATA-DRIVEN** (GameScene): baza materiałów modułowych + **union kosztów
   KAŻDEGO kadłuba z `SHIPS`+`HULLS` (×10 headroom)**. Dowolny przyszły kadłub auto-pokryty. Dodano
   import `SHIPS` do GameScene.
2. **`queueStationShip` niesie `missing:{...}`** (StationSystem): odmowa `insufficient_resources`
   zwraca i emituje `{missing:{id:brak,...}}` (have<need per pozycja) → live-gate debugowalny z konsoli.
3. **`stationSetPop` `console.warn`** gdy `pop > popCapacity` (bez egzekwowania — FAZA 2 nie ma
   pasażerów). **POTWIERDZONE (bez implementacji):** guard capacity dojdzie w **FAZIE 4**
   (`_processPassengerArrival`: gate `station.pop < station.popCapacity` → pełna stacja = status
   `no_housing`, statek czeka zadokowany — patrz sekcja FAZA 4 §4.3).

**DECYZJA (odnotowana): koszt budowy statku w stoczni stacji = WYŁĄCZNIE MATERIAŁY z depotu.**
`science_vessel`/pozostałe kadłuby nie mają kosztu w kredytach (`upkeepCredits` to utrzymanie floty,
osobny sink S3.5a-1 z globalnej puli gracza, nie koszt budowy). Depot trzyma tylko materiały —
parytet ze stocznią kolonijną. Gdyby przyszły kadłub dostał koszt kredytowy: kredyty z globalnej
puli gracza (jak stocznia kolonijna), nie z depotu.

**Smoke:** `tmp_s34_p2_smoke.mjs` sekcja 12 (**+6 asercji, 60/60**): fill zawiera
polymer_composites+Xe, `queueStationShip` ok:true dla każdego z SHIPS∪HULLS po jednym fillu,
odmowa niesie `missing`.

### FIX FAZY 2 #2 — Command (FleetManagerOverlay) zna stacje jako lokację (ta sesja)

**Objaw (Filip, live-gate R1):** statki zadokowane przy KOLONII widoczne w Command; statki
zadokowane przy STACJI lub orbitujące stację — wizualnie osierocone. Outliner (prawy drawer)
i StationPanel pokazują je poprawnie; rozkazy działają.

**Diagnoza:** statek stacyjny JEST w źródle listy Command (`vMgr.getAllVessels()` filtrowane
`!isEnemyVessel && !isWreck`) — potwierdzone smoke 17/17. Problem: FleetManagerOverlay traktował
stacje jako NIEZNANĄ lokację:
- lokalny `_findBody`/`_resolveName` pomija typ `station` (nie ma w `_BODY_TYPES`) → wiersz statku
  pokazywał SUROWE id (`station_1`) zamiast nazwy stacji (Outliner używa `utils/BodyName.resolveBodyName`
  = `EntityManager.get`, dlatego działał);
- mapa taktyczna (center) rysowała tylko ciała — brak markera stacji → statki przy stacji bez kotwicy;
- brak akcji **undock** w Command (była tylko w drawerze/FleetGroupPanel).

**Fix (FleetManagerOverlay + i18n, bez migracji save, bez zmian 3D):**
1. `_resolveName` rozwiązuje stacje wprost z `EntityManager.get` (mirror `resolveBodyName`) → `🛰 <nazwa>`
   w wierszach listy I etykietach mapy.
2. Mapa taktyczna: rysowanie stacji gracza (romb 🛰) na pozycji CIAŁA KOTWICZĄCEGO (`st.bodyId` live,
   bo stacja ma statyczne x/y) + hit-zone `map_station` → `station:selected`/`station:focus` (mgła
   wojny: `!ownerEmpireId || 'player'`).
3. Przycisk **Undock** w prawym panelu detalu dla zadokowanego statku → reuse
   `VesselManager.undockToOrbit` (instant launch to orbit ciała/stacji; ZERO nowej logiki dokowania).
4. i18n `fleet.undock` (pl+en).

**Zero zmian w renderingu 3D** — docked statki pozostają ukryte na głównej mapie 3D (świadoma
konwencja, kolonie i stacje jednakowo); zmiany dotyczą tylko listy/mapy taktycznej Command (Canvas 2D).

**Smoke:** `tmp_s34_command_stations_smoke.mjs` **17/17** (realne VesselManager/StationSystem/
BodyName/Vessel): statek stacyjny obecny na liście Command PRZED i PO undock, `resolveBodyName`
zwraca nazwę stacji, statek kolonijny bez regresji. ⚠ FMO nieimportowalny headless (canvas) — test
pokrywa ŹRÓDŁO listy + `resolveBodyName` (który `_resolveName` wiernie odwzorowuje); klik/rysowanie
weryfikuje Filip na żywo.

---

## FAZA 3 — DONE (ekran zarządzania stacją; live-gate PENDING)

**Zaimplementowane (bez migracji save, render/UI-only, zgodnie z planem c) FAZA 3):**
- **Nowy plik `src/ui/StationManagementView.js`** — `drawStationManagement(ctx, area, station, {addHit, techIsResearched, pickerOpen})`.
  Pure-ish (node-importowalny), addHit → `_hitZones` overlayu. Sekcje: nagłówek (nazwa + ✏ rename,
  załoga pop/cap + dostępna, bilans energii +prod/-cons/net, status stoczni, tradeCapacity), siatka
  slotów (maxModules=8, 2 kolumny: moduł=ikona+nazwa+lv+status ✓/⚡✗/👥✗; pending=pasek postępu+✕
  anuluj; pusty=＋ picker), depot (classifyStationDepot: surowce vs towary), kolejka stoczni (gdy
  shipyard aktywny — lista +✕), **picker modułów** (koszt have/need czerwony gdy brak, gate tech 🔒,
  gate slotów, Buduj).
- **ColonyOverlay TRYB STACJI** (`_stationMode`/`_selectedStationId`/`_stationPickerOpen`): zakładki
  🛰 stacji gracza dołączone do tab bara (`stationTab` → tryb stacji BEZ `switchActiveColony`); branch
  w `draw()` gatuje CAŁY blok mapy hex (`if(_stationMode){...}else{mapa}`); `show({stationMode, stationId})`;
  redraw per-tick przez subskrypcje `station:*`→`uiManager._dirty` (statusy zmieniają się na ticku, nie
  po akcji); klik poza hit-zone konsumowany (bez logiki kafla); nagłówek POP kolonii ukryty w trybie stacji.
  Intent: `addPendingModuleOrder`/`cancelPendingModuleOrder`/`cancelStationShip` + `station:rename`.
- **StationPanel** (pływający): placeholder „moduły wkrótce" zastąpiony podsumowaniem (POP/cap, stocznia,
  lista modułów ze statusem) + przycisk **„🛰 Zarządzaj"** → `overlayManager.openPanel('colony',
  {stationMode:true, stationId, colonyId:activePlanetId})`.
- **i18n `station.mgmt.*`** (pl+en, 23 klucze). Nazwy modułów z danych (dwujęzyczne w StationModuleData).

**Smoke:** `tmp_s34_faza3_smoke.mjs` **16/16** (realny `Station` + mock ctx): hit-zony rename/addslot(×5)/
cancelmodule/cancelship, picker build tylko dla stać+odblokowany (power_fusion tak / power_solar_auto nie),
pełne sloty → brak build. ⚠ ColonyOverlay/StationPanel nieimportowalne headless (three/canvas) — smoke
pokrywa CZYSTY widok + gettery; wpięcie (branch draw/taby/klik) weryfikuje Filip.

### LISTA LIVE-GATE FAZY 3 (elementy UI do klikania — Filip)

Setup: `KOSMOS.debug.spawnStation()` (lub zbuduj stację z kolonii), potem otwórz ekran kolonii (C).

1. **Zakładka stacji** — w tab barze ColonyOverlay widoczna zakładka 🛰 `<nazwa stacji>`; klik → wejście
   w tryb stacji (mapa hex znika, pojawia się ekran stacji). Klik zakładki kolonii → powrót do mapy.
2. **Nagłówek stacji** — nazwa + ✏; klik ✏ → modal rename → nazwa zmienia się (i w zakładce, i w panelu 3D).
3. **Pasek statystyk** — załoga (pop/cap + dostępna), energia (+prod/-cons/net; net czerwony przy deficycie),
   stocznia (aktywna/nieaktywna), tradeCapacity — zgodne ze `stationInfo()` w konsoli.
4. **Siatka slotów** — moduły startowe (habitat, power_atom) jako karty ze statusem ✓; puste sloty „＋ Dodaj".
5. **Picker modułów** — klik pustego slotu → modal listy modułów; koszt have/need (czerwony gdy brak);
   `power_fusion` 🔒 bez `fusion_power`, `power_solar_auto` 🔒 bez `automation`; klik „Buduj" (gdy stać) →
   moduł ląduje w kolejce (flash), picker się zamyka. Klik ✕ / tło → zamknięcie pickera.
6. **Budowa modułu w toku** — po `Buduj` slot pokazuje pasek postępu; po odczekaniu (advance czasu) moduł
   staje się aktywny (✓); ✕ na slocie pending → anulowanie.
7. **Bilans na żywo** — dobuduj `power_solar`/`power_fusion` przy deficycie → moduły trade/lab/shipyard
   wracają do ✓ na kolejnym ticku (status per-tick, nie natychmiast — celowe).
8. **Kolejka stoczni** — zbuduj `shipyard` (lub `spawnStation` z shipyard) + `KOSMOS.debug.stationBuildShip()`;
   sekcja „Kolejka stoczni" pokazuje statek z % + ✕ anuluj.
9. **Depot** — prawa kolumna pokazuje surowce/towary (po `stationFillDepot()` niepusta).
10. **StationPanel „Zarządzaj"** — klik stacji na mapie 3D → pływający panel; sekcja Moduły pokazuje
    listę+POP; przycisk „🛰 Zarządzaj" → otwiera ColonyOverlay w trybie tej stacji.
11. **Regresja** — zakładki/mapa zwykłych kolonii bez zmian; przełączanie kolonia↔stacja↔kolonia stabilne;
    `switchActiveColony` NIE wołane przy wyborze stacji (globalny stan gry nietknięty).

---

## d) ZATWIERDZONE DECYZJE (wiążące — nie re-litygować)

1. **`trade_module` tradeCapacity = `[200, 400, 600]` ABSOLUTNE per poziom** (parytet naziemnego
   `trade_hub` tcBonus 200/lv). FAZA 2 tylko WYSTAWIA liczbę (getter `Station.tradeCapacity`) —
   realne wpięcie w `CivilianTradeSystem` to przyszły slice (⚠ `getTradeCapacity(colonyId)` bierze
   ID kolonii, nie obiekt — stacja musiałaby być rejestrowalna w lookupie).
2. **`lab` = 4 RP/rok** (naziemna `research_station` = 8; moduł lżejszy).
3. **`passenger_module` = reuse `vessel.colonists`/`colonistCapacity`** (data-only, `slotType:'special'`).
4. **`modules` jako LISTA** `{id, moduleType, level, active}` (NIE mapa).
5. **`popCapacity` = Σ poziomów modułów habitat** — getter na `Station`, **nieserializowany** (liczony z modules).
6. **`no_housing` (transport pasażerski) = statek CZEKA zadokowany + retry** (wzór `_tryResumeLoop`),
   bez auto-powrotu. Passenger = **one-shot** (bez pętli cyklicznej).
7. Przy przylocie pasażera do KOLONII: `civSystem.addPop` + **fallback-emit `civ:popBorn`** wzorem
   `ExpeditionSystem.js:1407` (`addPop` sam NIE emituje `civ:popBorn`).

---

## f) OGRANICZENIA TWARDE

- **Stacja NIGDY nie wchodzi do `ColonyManager._colonies`** (Wariant A — osobna encja, widoczna przez fasady).
- **Zero zmian w `CivilianTradeSystem`, `switchActiveColony`, `ColonyManager.serialize`** (3 twarde crashe / mis-behave przy stacji w listach kolonii — patrz audyt §5.4).
- **Balans wyłącznie w `StationModuleData.js`** — zero magic numbers w logice.
- **Live-gate po KAŻDEJ fazie** (Filip w przeglądarce) przed przejściem dalej.
- **Commity atomowe** (jedna faza = jeden lub kilka atomowych commitów).
- i18n: każdy nowy string ma klucz **pl+en** od razu.

---

## c) PEŁNY PLAN FAZ 3–6 (pełne brzmienie)

### FAZA 3 — EKRAN: ZAKŁADKA STACJI W COLONYOVERLAY

Wg audytu §4.7 `ColonyOverlay` to edytor hex twardo związany z `colony.planet` — dlatego:

**3.1** Pasek zakładek kolonii (`ColonyOverlay` ~`:928-1000`): dołącz stacje gracza jako zakładki
🛰 (merge `getPlayerColonies()` + fasady stacji wzorem `EconomyOverlay._playerStationFacades`
`:95-121`). Wybór stacji ustawia `_selectedStationId` i przełącza overlay w **TRYB STACJI** —
**NIE woła `switchActiveColony`** (to by rozbiło globalny stan).

**3.2** TRYB STACJI = osobna ścieżka renderu wewnątrz `ColonyOverlay` (**nowy plik
`src/ui/StationManagementView.js`**, wołany z `ColonyOverlay`, żeby nie puchł główny plik):
- **NAGŁÓWEK:** nazwa (✏ rename — reuse `station:rename`), POP zajęty/capacity, bilans energii
  (produkcja/pobór), status stoczni, `tradeCapacity`.
- **SIATKA SLOTÓW:** `maxModules` slotów (8, `STATIONS.orbital_station.maxModules`); zajęte = ikona
  modułu + level + status (`active` / `no_power` / `no_crew` / budowa z paskiem %); pusty slot →
  klik otwiera **picker modułów** (koszt have/need z depotu, gated tech, przycisk Buduj / 🔒).
- **PANEL DEPOTU:** reuse `classifyStationDepot` ze `StationPanelLogic`.
- **KOLEJKA STOCZNI:** widoczna gdy shipyard aktywny (lista + cancel).
- **Estetyka:** brutalist terminal jak reszta UI (żółty/czarny, mono).

**3.3** `StationPanel` (pływający): sekcja „moduły = placeholder" (`StationPanel.js:201-203`) zastąp
skrótem: lista aktywnych modułów + POP + przycisk „Zarządzaj" otwierający `ColonyOverlay` w trybie stacji.

**3.4** i18n: komplet kluczy `station.module.*` (pl+en).

**⚠ NOTATKA UI (z live-gate FAZY 2):** statusy modułów (`active`/`no_power`/`no_crew`) i postęp
budowy zmieniają się **PER TICK** (`StationSystem._tick(civDt)`), NIE synchronicznie po akcji gracza
(np. zbudowanie power_solar gasi/wznawia moduły dopiero na kolejnym ticku bilansu — R2 no_crew,
R4 energia potwierdziły to jako zgodne z architekturą). `StationManagementView` musi odświeżać się
jak inne overlaye (dirty-loop / subskrypcja eventów `station:moduleBuilt`/`moduleBuildStarted`/tick),
a NIE zakładać natychmiastowej zmiany stanu po kliknięciu — inaczej UI pokaże nieaktualny status
do następnej klatki. Wzór: `station:*` eventy → `window.KOSMOS.uiManager._dirty=true`
(precedens `buildings:texturesLoaded` w ColonyOverlay).

**Gotowe API (FAZA 2) do wpięcia w UI FAZY 3:**
- `stationSystem.getAllStations()`, `getPendingModuleOrders(stationId)`.
- `addPendingModuleOrder(stationId, moduleType, level=1)` → `{ok, reason?, orderId?}`
  (`reason`: `no_station`/`unknown_module`/`requiresTech`/`no_slots`).
- `cancelPendingModuleOrder(stationId, orderId)`, `queueStationShip(stationId, shipId)`,
  `cancelStationShip(stationId, index)`.
- Gettery `Station`: `popCapacity`, `tradeCapacity`, `hasActiveShipyard`; pola `modules[]`
  (`{id, moduleType, level, active, inactiveReason}`), `pop`, `pendingModuleOrders[]`
  (`{id, moduleType, level, cost, status:'queued'|'building', progress, buildTime}`), `shipQueues[]`
  (`{shipId, progress, buildTime}`).
- Dane picker: `STATION_MODULES[type]` (`namePL/nameEN/descPL/descEN, icon, category, cost,
  commodityCost, buildTime, energy, popWork, maxLevel, requires` + efekty `popCapacity`/
  `tradeCapacityByLevel`/`researchPerYear`/`unlocksShipyard`); `stationModuleCost(type)` = płaski koszt.
- Eventy do flashy: `station:moduleOrderQueued/moduleOrderRejected/moduleBuildStarted/moduleBuilt/
  moduleOrderCancelled`, `station:shipBuildStarted/shipBuildRejected/shipCompleted/shipBuildCancelled`.

### FAZA 4 — TRANSPORT POP: MODUŁ PASAŻERSKI + STATEK PASAŻERSKI

**⚠ Najpierw rozstrzygnij FLAGĘ PROJEKTOWĄ (góra pliku): obsada = pop czy max(pop, popCapacity).**

Implementacja ZALEŻNA od ustaleń FAZY 0 (A3/A4) — trzymaj się wzorca colony ship, gdzie się da.
**Kluczowe ustalenie FAZY 0:** colony ship robi REALNY transfer POP (`loadColonists→civSystem.removePop`
`Vessel.js:754`; `unloadColonists→civSystem.addPop` `:774`; `createColony population=vessel.colonists`
`ColonyManager.js:376`), NIE abstrakcyjny `startPop`. **ALE `station.pop` to greenfield** — `Station`
nie ma `CivilizationSystem`; `addPop` nie zadziała na stację → potrzebna gałąź `station.pop±`.

**4.1** Nowy moduł statku **`passenger_module`** (pojemność: 1 POP) w `src/data/ShipModulesData.js`
(obok `habitat_pod` ~`:253`, `slotType:'special'`, `stats.colonistCapacity:1`). `colonistCapacity`
auto-przepływa do `vessel.colonistCapacity` (`VesselManager.js:160-167`) i jedzie w `vessel.colonists`
— zero zmian renderer/save dla pojemności. i18n namePL/nameEN.

**⚠ 4.1a (OBOWIĄZKOWO w tej samej fazie):** przeprojektować bramkę `Vessel.canColonize`
(`Vessel.js:421`) z `colonistCapacity>0` na **`posiada moduł o slotType==='habitat'`** — bo
`colonistCapacity>0` SAMO w sobie robi statek kolonizatorem, więc czysty passenger błędnie dostałby
opcję kolonizacji. **Test regresji na live-gate FAZY 4:** colony ship kolonizuje jak dotąd, statek
z `passenger_module` NIE MA opcji kolonizacji. Nie ruszać fallbacku legacy-save ani ścieżki
`foreign_colonize` (`VesselManager.js:2762`) — tylko potwierdzić, że przechodzą.

**4.2** Szablon „Statek pasażerski": reuse GLB colony ship (osobny wpis w mapie modeli
`VesselModelResolver`, ten sam plik `.glb` — rozjazd wizualny do ogarnięcia później).

**4.3** Nowy typ misji „transport pasażerski" (`MissionSystem`):
- Dispatcher przylotu = `_processArrival` (`MissionSystem.js:1394`, blok dispatch `:1408-1412`) —
  dodać `if (exp.type === 'passenger') { this._processPassengerArrival(exp); return; }`.
- `_launchPassenger` (klon `_launchTransport`): ORIGIN kolonia → guard `civSystem.population > 1`
  (**NOWY guard** — `loadColonists` guarduje tylko `freePops/colonistCapacity`), `removePop`,
  `vessel.colonists=1`.
- `_processPassengerArrival`: dok przez `vMgr.dockAtTarget`. Stacja → guard `station.pop < station.popCapacity`
  → `station.pop++`, `vessel.colonists=0`, emit `station:popArrived`; pełna stacja → status `no_housing`
  (statek czeka zadokowany + retry, wzór `_tryResumeLoop` `:1844`). Kolonia → `civSystem.addPop('laborer',1)`
  + **fallback-emit `civ:popBorn`** (wzór `ExpeditionSystem.js:1407` — `addPop` sam nie emituje).
- Kierunek stacja→kolonia symetrycznie: load `station.pop>0` → `station.pop--`, emit `station:popDeparted`;
  arrival kolonia `addPop`.
- **UI:** cel misji wybierany jak w transporcie cargo (`FleetManagerOverlay._getValidTargets` ~`:8029`
  już zna stacje gracza — rozszerz o typ misji pasażerskiej + wpis akcji w menu floty).

**4.4** Emit `station:popArrived` / `station:popDeparted` + flash w UI stacji (StationPanel /
StationManagementView) + linia EventLog (`UIManager`, wzór `station:built`). i18n pl+en.

### FAZA 5 — OZNACZENIA NA MAPIE: NOWE ETYKIETY KOLONII + STACJI

Wg FAZY 0 (A1): dzisiejsza „etykieta" kolonii to **bezteksowy romb-znacznik** (`_colonyLabels`,
THREE.Sprite; nazwa liczona i porzucana) — tekst trzeba zrobić od zera. Helpery kotwiczenia gotowe.

**5.1** NOWY wspólny komponent etykiety (jeden renderer, dwa warianty treści):
- **KOLONIA:** ikona typu (home/kolonia/outpost) + nazwa + POP + [opcjonalnie 1 badge alertu].
- **STACJA:** 🛰/ikona + nazwa + POP zajęty/capacity + badge statusu (⚡ deficyt / 🔨 budowa).
- **Trasa A (ZATWIERDZONA z FAZY 0):** overlay 2D na `#ui-canvas` (**`MapLabelLayer`**), wzór gate
  `_drawSelectionBrackets` (`UIManager` ~`:1774`, `civMode && !overlayManager.isAnyOpen()`).
  Pozycje: kolonie przez **`getBodyScreenPosition`**, stacje przez **`getStationScreenPosition`**
  (oba null-safe, z-clamp). **NIGDY `getScreenPosition`** (legacy, bez z-clamp). Dziel przez `UI_SCALE`.
  **Filtr `!c.ownerEmpireId` OBOWIĄZKOWY** (mgła wojny — `getAllColonies()` zwraca też kolonie AI).
- Styl spójny z brutalist terminal; czytelność na zoom-out (fade/scale progowe).

**5.2** DWA warianty wizualne za flagą debug (przełącznik dev / query param): **W1** minimalistyczny
(sam tekst + cienka ramka), **W2** pełny (plakietka z tłem + ikonografia). **Filip wybiera na
live-gate** → dopiero wtedy usuń stary rendering etykiet i flagę.

**5.3** Etykieta stacji klikalna → selekcja stacji (istniejący dual-emit `station:selected` —
bez ruszania `body:selected`).

### FAZA 6 — DOMKNIĘCIE

**6.1** Round-trip save test całości (v90): moduły w budowie, POP w tranzycie, kolejka stoczni.
**6.2** Sweep martwego kodu wg audytu **§5.2 W ZAKRESIE stacji:** placeholder „wkrótce"
(`StationPanel.js:201-203`), nieużywany klucz i18n `station.rename` (`pl.js:726` — podepnij pod ✏
zamiast hardkodu), `StationData.buildTime:7` (martwe pole instant-materialize).
**6.3** Aktualizacja `CLAUDE.md` (sekcja stacji: nowy model, save v90, mapa plików).
**6.4** Raport końcowy: co zrobione, co odłożone (wpięcie trade w `CivilianTradeSystem`, stacje w
Outlinerze/minimapie, tier 2+, klasy stacji, stacje AI — świadomie POZA zakresem).

---

## e) BACKLOG FAZY 6 (dodatkowe, poza planem nadrzędnym)

1. **Naprawa starych pinów v85 + przestarzałego mocka w regresji** — testy `tmp_s3_3b_s2/s3_smoke.mjs`
   asertują `CURRENT_VERSION===85` (od dawna nieaktualne), a `tmp_s4_3_smoke.mjs` używa mocka bez
   `getPlayerColonies` (crash). To NIE są regresje S3.4 (były zepsute wcześniej), ale warto naprawić.
2. **Debug `exportSave()` / `importSave()`** — backup save'a przed przyszłymi bumpami wersji
   (live-gate FAZY 1 pokazał, że single-slot save utrudnia test migracji na żywo).
3. **`tmp_s34_p*_smoke.mjs`** — zdecydować, czy zostają jako **stałe testy** (przenieść do
   `src/testing/`?) czy usunąć. Obecnie untracked w root (konwencja tmp).

---

## Mapa kluczowych plików S3.4 (dla świeżej instancji)

| Plik | Rola |
|------|------|
| `src/data/StationModuleData.js` | 8 modułów + `MODULE_SHED_ORDER` + helpery (`stationModuleCost`, `makeStationModule`, `createStarterModules`). ⚠ `buildTime` w LATACH CYWILIZACYJNYCH. |
| `src/entities/Station.js` | encja: `modules[]`, `pop`, `pendingModuleOrders[]`, `shipQueues[]` + gettery `popCapacity`/`tradeCapacity`/`hasActiveShipyard`. |
| `src/systems/StationSystem.js` | FAZA 2 logika: `_tick(civDt)` → `_tickModuleOrders`/`_recomputeModuleStates`/`_tickEffects`/`_tickShipQueues` + intent methods + `getAllStations`. |
| `src/data/StationData.js` | `STATIONS.orbital_station` + `maxModules:8` + `stationTotalCost`. |
| `src/systems/SaveMigration.js` | `CURRENT_VERSION=90`, `_migrateV89toV90`. |
| `src/scenes/GameScene.js` | debug helpers `stationBuildModule/BuildShip/SetPop/FillDepot/Info` (blok ~`:822`). |

**⚠ CADENCE (nie pomyl):** `buildTime` i progres liczone w **`civDeltaYears`** (NIE `deltaYears`/physDt).
Cały system budowy tak działa: `ColonyManager._tickShipBuilds(civDt)` (`:139`), a BuildingsData
„lata gry" to faktycznie civlata (`~30s @1d/s dzięki CIV_TIME_SCALE=12`). 1 civrok ≈ 30.4 dnia gry.

**Kluczowe integracje FAZY 2 (potwierdzone czytaniem kodu):**
- research: `_resolveHomeColony().resourceSystem.receive({research: labRP*civDt})` (home = `homePlanet`
  colony → 1. kolonia gracza z resourceSystem).
- stocznia: `vMgr.createAndRegister(shipId, homeColonyId, {x,y})` → `vMgr.dockAtStation(vId, stationId)`
  → push do `homeCol.fleet` (wzór `VesselManager._onShipCompleted:1375`).
- depot: `StationDepot.spend(costs)` = ATOMIC all-or-nothing (bool, bez pobrania gdy nie stać).

---

## Referencje

- Audyt nadrzędny: `docs/audits/orbital-stations-audit.md`
- FAZA 0 findings: `docs/audits/s34-phase0-findings.md`
- Manual live-gate FAZY 2: `docs/testing/s34-faza2-live-gate-manual.md`
- Commity: **`35ce5a2`** (FAZA 1), **`7073a99`** (FAZA 2). `git log 35ce5a2^..HEAD`.
- Smoke: `tmp_s34_p1_smoke.mjs` (50/50), `tmp_s34_p2_smoke.mjs` (54/54).
