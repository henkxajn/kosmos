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
| **FAZA 2** — logika ticka (budowa/energia/praca/efekty/stocznia) | ✅ DONE, **live-gate CZĘŚCIOWY PASS** (fix stoczni) | commity **`7073a99`** + fix stoczni; smoke `tmp_s34_p2_smoke.mjs` **60/60** (było 54, +6 sekcja 12); regresja FAZY 1 **50/50**. Manual: `docs/testing/s34-faza2-live-gate-manual.md`. **PASS (Filip):** T1 budowa modułów, T2 tech-gate, T4 bilans energii, T8 regresja. **FIX (ta sesja):** T6 stocznia — `stationBuildShip` odrzucał wszystko `insufficient_resources` (root cause niżej). **DO POWTÓRKI przez Filipa:** T6 (stocznia po fixie), T7 round-trip, sekwencja no_crew. |
| **FAZA 3** — ekran zarządzania | ❌ NIEROZPOCZĘTA | — |
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
