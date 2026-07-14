# S3.4 — Stacje orbitalne: dokument wznowienia (continuation plan)

> **Samowystarczalny.** Świeża instancja Claude Code ma wznowić pracę WYŁĄCZNIE z tego pliku
> + repozytorium. Nie zakłada pamięci poprzedniej sesji.
> **Data zamrożenia:** 2026-07-04 (koniec pracy po FAZIE 2; live-gate FAZY 2 PENDING).
> **Plan nadrzędny:** S3.4 „STACJE ORBITALNE: MODUŁY, POP, EKRAN, OZNACZENIA" (ewolucja Wariantu A z audytu).

---

## ✅ FLAGA PROJEKTOWA — ROZSTRZYGNIĘTA (obsada = pop, wdrożona)

**DECYZJA WIĄŻĄCA (Filip): `obsada = pop`.** Mostek `max(pop, popCapacity)` ZLIKWIDOWANY.
Wdrożone commitem **`2394c6b`** `feat(S3.4-F4): obsada stacji = pop (likwidacja mostka popCapacity)`.
Habitat daje TYLKO pojemność (`popCapacity`), ZERO załogi. Świeża stacja z `pop=0` ma moduły
wymagające pracy w stanie `👥✗ no_crew` — CELOWO. Stacja ożywa dopiero po przywiezieniu pierwszego
POP (transport pasażerski, FAZA 4). Habitat (`popWork 0`) zostaje pasywnie aktywny, więc `popCapacity`
działa bez załogi.

**Co zmienił commit `2394c6b`:**
- `StationSystem._recomputeModuleStates`: `availCrew = station.pop ?? 0` (było `Math.max(pop, popCapacity)`).
- **NOWY `CREW_SHED_ORDER`** w `StationModuleData.js` (`trade_module → lab → shipyard → power_*`): przy
  `pop=0` moduły `power_*` (`popWork 0.1`) TEŻ gasną na `no_crew` (bez tego pop=0 nie pokazywałby
  martwej stacji — power nie było sheddable, bo nie ma go w `MODULE_SHED_ORDER`). To rozszerza „jedną
  linię" z pierwotnej estymaty — świadomie, bo tego wymaga poprawny `no_crew` przy świeżej stacji.
- `StationManagementView`: nagłówek wykrywa `no_crew` → hint „Brak załogi — przetransportuj POP
  z kolonii" (`station.mgmt.noCrewHint`, pl+en).
- Smoke `tmp_s34_p2_smoke.mjs` **61/61** — sekcje 6.1-6.8 przepisane pod obsada=pop (6.3 `power_atom`
  no_crew przy pop=0, 6.5 shipyard martwy, 6.5a `_tick` bez crashu przy energy=0, 6.7 kaskada pop=1 →
  power→konsumenci w ≤1 tick, 6.8 `power_solar_auto` autonomiczny bez załogi).

**Konsekwencja potwierdzona:** (a) przy energy=0 (pop=0, wygaszone reaktory) `_tick` NIE crashuje;
(b) po dostawie 1. POP kaskada wstaje w dobrej kolejności (power → konsumenci) w ≤2 ticki; habitat
(popWork 0) pasywnie funkcjonalny.

---

## g) PROTOKÓŁ WZNOWIENIA (wykonaj po kolei)

1. Przeczytaj **ten plik** w całości.
2. Przeczytaj oba audyty: `docs/audits/orbital-stations-audit.md` (nadrzędny) i
   `docs/audits/s34-phase0-findings.md` (FAZA 0 — etykiety/trade capacity/moduły statków/misje transportu).
3. `git log --oneline 35ce5a2^..HEAD` — przejrzyj commity S3.4 (35ce5a2 F1, 7073a99 F2, F3: ee19179/
   2c0fb84/03bff50, F4: 2394c6b/19084f5).
4. Odpal smoke: `tmp_s34_p1` (**50/50**), `tmp_s34_p2` (**61/61**), `tmp_s34_faza3` (**45/45**),
   `tmp_s34_command_stations` (**17/17**), `tmp_s34_faza4` (**57/57**). Każdy fail → STOP + raport.
5. **STAN (2026-07-14):** FAZY 1-4 DONE. **FAZA 4 live-gate PENDING** (Filip). Następna praca:
   - **FAZA 4 live-gate FAIL / brak** → poprawki wg uwag Filipa; nie zaczynaj FAZY 5.
   - **FAZA 4 live-gate PASS** → START **FAZY 5** (etykiety kolonii+stacji na mapie; sekcja c) FAZA 5).
6. ⚠ 3 pre-istniejące faile smoke NIE-S3.4 (stale, nie regresje): `tmp_s3_5a_1`/`tmp_s3_5b` asertują
   `CURRENT_VERSION===86` (jest 90), `tmp_s4_3` mock bez `getPlayerColonies`. Backlog e) pkt 1.

---

## a) STAN (2026-07-14)

| Faza | Status | Dowód |
|------|--------|-------|
| **FAZA 0** — mini-audyty | ✅ DONE | `docs/audits/s34-phase0-findings.md` (workflow 4 agenty + 4 weryfikatory, confidence high) |
| **FAZA 1** — dane + model + migracja v90 | ✅ DONE, **live-gate PASS z zastrzeżeniem** | commit **`35ce5a2`**; smoke `tmp_s34_p1_smoke.mjs` **50/50**. ⚠ Zastrzeżenie: migracja v89→v90 **nietestowana na żywo** (stary save nadpisany przez nową grę, single-slot) — akceptacja na podstawie headless smoke. Pokryte na żywo: natywny v90 nowej gry, moduły startowe (debug spawn + ścieżka orderowa UI), popCapacity=1, round-trip save→F5→load. |
| **FAZA 2** — logika ticka (budowa/energia/praca/efekty/stocznia) | ✅ DONE, **live-gate ZALICZONY W CAŁOŚCI** | commity **`7073a99`** + fix stoczni (`a3892e0`) + fix Command (`7894230`); smoke `tmp_s34_p2_smoke.mjs` **61/61** (przepisane pod obsada=pop), `tmp_s34_command_stations_smoke.mjs` **17/17**; regresja FAZY 1 **50/50**, slice8b **51/51**. **F2 live-gate = R1-R3 PASS + fix Command zweryfikowany (V1-V5 PASS).** R1 stocznia (queue→build→spawn docked→rozkazy), R2 no_crew (rebalans na kolejnym ticku), R3 round-trip (progres przeżywa save→reload i kontynuuje). FIX #1 (`a3892e0`): stocznia `insufficient_resources`. FIX #2 (`7894230`): Command zna stacje jako lokację (V1-V5 PASS). |
| **FAZA 3** — ekran zarządzania | ✅ DONE + **domknięcie R2** (`03bff50`), **live-gate CZĘŚCIOWY** (T2-T5,T7 PASS; B1-B3 fix + R1-R2 + R2-fix dodane) | `StationManagementView.js` + tryb stacji w ColonyOverlay (zakładki 🛰, siatka slotów, picker modułów+statków, depot, kolejka stoczni, rozbiórka) + StationPanel „Zarządzaj". **R2 (`03bff50`): ship picker stacji buduje WYŁĄCZNIE projekty gracza** (`window.KOSMOS.unitDesigns`), NIE surowe szablony `SHIPS` — parytet ze stocznią kolonijną (decyzja #10). Smoke `tmp_s34_faza3_smoke.mjs` **45/45**; regr slice8b 51/51, s4_2 25/25, p1 50/50, p2 61/61. **DO POWTÓRKI (Filip):** retest B1-B3 + R1-R2 + R2-fix (budowa z projektu), zaległe T8 (i18n/estetyka) + T9 (round-trip/regresja). |
| **FAZA 4** — transport POP | ✅ DONE, **live-gate PENDING** | commity **`2394c6b`** (obsada=pop) + **`19084f5`** (transport pasażerski); smoke `tmp_s34_faza4_smoke.mjs` **57/57** + `tmp_s34_p2_smoke.mjs` **61/61** (obsada). Sekcja „FAZA 4 — DONE" niżej. Manual live-gate: Filip dostanie osobny. |
| **FAZA 5** — etykiety na mapie | ❌ NIEROZPOCZĘTA | — |
| **FAZA 6** — domknięcie | ❌ NIEROZPOCZĘTA | — |

**Save:** `CURRENT_VERSION = 90` (`SaveMigration.js`). FAZA 1 wprowadziła `_migrateV89toV90`.
FAZY 2/3/4 **nie bumpują wersji** (nowe pola przez `?? default` w restore; passenger_module data-only;
pola misji passenger round-trip przez całościowy serialize misji; `station.pop` już serializowane).
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

### DOMKNIĘCIE FAZY 3 (po częściowym live-gate T1-T7 — bugi B1-B3 + rozszerzenia R1-R2)

**Live-gate T1-T7:** T2/T3/T4/T5/T7 rdzeń PASS. Naprawione/dodane:
- **B1** — powrót z trybu stacji do kolonii nie przywracał mapy hex. Root cause: wejście w tryb
  stacji zostawia `_selectedColonyId` = aktywna kolonia (fallback); klik zakładki TEJ SAMEJ kolonii
  → `_switchColony` early-return (`planetId===_selectedColonyId`) → `_stationMode` nigdy nie czyszczony.
  Fix: handler `colonyTab` czyści `_stationMode`/`_stationPickerOpen`/`_stationShipPickerOpen` PRZED `_switchColony`.
- **B2** — ✕ pickera modułów nie zamykał. Root cause: bazowe hit-zony ekranu (dodane wcześniej)
  wygrywały z `_hitTest=find()` nad ✕/Buduj pickera (z-order). Fix: gdy picker (modułów LUB statków)
  otwarty, ekran bazowy NIE rejestruje hit-zon (`bhit` = no-op) → zostają tylko strefy pickera.
- **B3** — StationPanel (3D) wisiał nad overlayem po „Zarządzaj". Fix: handler `manage` woła `this.hide()`
  (re-show tylko przez `station:selected` — ponowny klik stacji na 3D; nie wraca sam).
- **R1 — rozbiórka modułu**: 🗑 na karcie zbudowanego modułu → `showConfirmModal` (danger) →
  `StationSystem.demolishModule(stationId, moduleId)`. **BEZ zwrotu kosztów** (konwencja jak cancel
  budowy). Slot → pusty; bilanse przeliczą się na kolejnym ticku. Guard: rozbiórka habitatu z
  `pop>popCapacity` DOZWOLONA z `console.warn` (limit egzekwuje FAZA 4 — spójnie z `stationSetPop`).
  Emit `station:moduleDemolished`. i18n `station.mgmt.demolishConfirm`.
- **R2 — budowa statku z UI stacji**: „＋ Buduj statek" w sekcji stoczni (gdy shipyard aktywny) →
  ship picker (lista `SHIPS`, tech-gate 🔒, koszt have/need z depotu, Buduj) → **reuse `queueStationShip`**
  (z jego `missing:{...}` → flash powodu). Zero nowej logiki budowy. i18n `station.mgmt.buildShip/shipPicker`.

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
12. **[B1 retest]** kolonia → 🛰 stacja → **klik zakładki TEJ SAMEJ kolonii** → mapa hex WRACA (bez artefaktu).
13. **[B2 retest]** picker modułów: ✕ ORAZ klik w tło zamykają picker.
14. **[B3 retest]** klik „Zarządzaj" w StationPanel → panel 3D znika; po zamknięciu overlaya NIE wraca sam.
15. **[R1]** 🗑 na karcie modułu → modal potwierdzenia → po „Tak" moduł znika, slot pusty ＋, bilanse
    przeliczone na kolejnym ticku. Rozbiórka habitatu przy pop>cap → działa + `console.warn` w konsoli.
16. **[R2]** „＋ Buduj statek" (gdy stocznia aktywna) → ship picker (kadłuby, tech-gate 🔒, koszt have/need);
    „Buduj" (gdy stać) → statek w kolejce stoczni; brak środków → flash powodu.

---

## FAZA 4 — DONE (transport pasażerski POP; live-gate PENDING)

**Commity:** `2394c6b` (obsada=pop, patrz FLAGA PROJEKTOWA u góry) + **`19084f5`**
`feat(S3.4-F4): transport pasażerski POP (moduł + misja + UI)`. Bez migracji save (v90).

**Zaimplementowane (10 plików, `19084f5`):**
- **`passenger_module`** (`ShipModulesData.js`) — `slotType:'special'`, `colonistCapacity:1`,
  `requires:null`, `cost {Fe,Ti} + commodityCost {pressure_modules}`. Reuse `vessel.colonists`
  (wozi POP jako pasażera, kolonii NIE zakłada). Dwujęzyczny namePL/nameEN.
- **`Vessel.canColonize` przeprojektowany (§4.1a OBOWIĄZKOWY)** — bramka z **modułu `slotType==='habitat'`**
  (`habitat_pod`/`cryo_pod`), NIE z `colonistCapacity>0`. Passenger z `colonistCapacity:1` NIE
  koloniuzje. Legacy fallback `def.isColonizer` **nietknięty** (regresja colony ship). Smoke 1.1-1.7.
- **`VesselModelResolver.vesselRole`** — `passenger_module` → rola `'colony'` (reuse GLB colony,
  model-only, ZERO wpływu na `canColonize`).
- **`MissionSystem`** — typ misji `'passenger'`:
  - `_launchPassenger(targetId, vesselId)` (wzór `_launchTransport`): walidacja kabiny + źródła
    (**kolonia `population>1`** / **stacja `pop>0`**) + port + paliwo → DOPIERO POTEM pobór 1 POP
    (kolonia `loadColonists`→`removePop`; stacja `pop--` + emit `station:popDeparted`) → mission
    `en_route` → `dispatchOnMission`. **Bramki PRZED poborem POP = zero wycieku przy odmowie.**
  - `_processPassengerArrival(exp)`: cel STACJA (mutacja LIVE przez `EntityManager.get` — kopia
    z `_findTarget` nie ma getterów) → `pop < popCapacity` → `pop++` + emit `station:popArrived`;
    **pełna → status `no_housing`, statek czeka zadokowany, retry co tick** (`_checkArrivals` hook).
    Cel KOLONIA → `addPop('laborer')` + **fallback-emit `civ:popBorn`** (planetId+colonyName). One-shot.
  - Dispatch w `_processArrival` + retry-branch w `_checkArrivals`. Bez `mission:report` (1 POP =
    lekki feed EventLog, BEZ pauzy-popup).
- **`FleetActions`** — akcja `transport_passenger` (docked + idle/refueling + `colonistCapacity>0`) →
  emit `expedition:passengerRequest`.
- **`FleetManagerOverlay`** — `passenger` w `_getValidTargets` (kolonie z `hasColony` + stacje gracza,
  bez własnego doku), ikona 🧑‍🚀 + etykieta misji.
- **`ColonyOverlay`** — flash `+1/−1 POP` w trybie stacji (gated `_stationMode && stationId`) + dirty-redraw.
- **`UIManager`** — `station:popArrived/popDeparted` → EventLog (bez pauzy).
- **i18n pl+en** — `fleet.actionPassenger/missionTypePassenger/reasonNotDocked/reasonBusy/
  reasonNoPassengerCabin`, `mission.noPassengerCabin/noStationCrew/neverLastPop/sourceColonyMissing/
  colonistsUnavailable`, `log.passengerToStation/passengerFromStation`, `station.mgmt.noCrewHint/noDesigns`.

**Smoke `tmp_s34_faza4_smoke.mjs` 57/57:** (1) canColonize REGRESJA (colony ship→true, passenger→false,
colonistCapacity-alone→false, legacy isColonizer→true); (2) passenger_module dane; (3) resolver
passenger→klucz `*_colony`; (4) misja kolonia→stacja (load population-1, arrival pop++); (5) pełna
stacja no_housing + retry po zwolnieniu; (6) stacja→kolonia (pop--, arrival addPop+popBorn); (7) bramki
never-last-POP / pusta stacja / brak kabiny / nie zadokowany. Realny `MissionSystem` + `EntityManager`
+ `Station` (mock `window.KOSMOS`).

**⚠ NIE zaimplementowane (świadomie, poza §4.x lub przyszły polish):**
- Dedykowany szablon „Statek pasażerski" w UI budowy (osobny wpis w liście projektów/stoczni) — na
  razie passenger_module dokładasz do projektu w Dowództwie (kreator projektów). Bramka+model+misja gotowe.

### LISTA LIVE-GATE FAZY 4 (do klikania — Filip)

Setup: stacja (`KOSMOS.debug.spawnStation()` lub zbuduj), kolonia z ≥2 POP, projekt statku z
`passenger_module` (Dowództwo → kreator projektów) zbudowany w stoczni.

1. **Regresja kolonizacji** — colony ship (projekt z `habitat_pod`/`cryo_pod`) NADAL ma opcję
   „Kolonizuj"; statek z `passenger_module` (bez habitatu) **NIE MA** opcji kolonizacji.
2. **Akcja transportu POP** — statek z kabiną zadokowany w kolonii/stacji → menu floty pokazuje
   „Transport POP" (🧑‍🚀); cele = kolonie gracza + stacje gracza (nie własny dok).
3. **Kolonia → stacja** — wyślij POP z kolonii (population>1) na świeżą stację (pop=0): kolonia traci
   1 POP, po dolocie `station.pop=1`, flash `+1 POP` na ekranie stacji, linia EventLog. **Moduły stacji
   wychodzą z `no_crew`** (power → konsumenci) w ≤2 ticki (kaskada obsady).
4. **Pełna stacja** — stacja z `pop==popCapacity` jako cel: statek dokuje i CZEKA (status „no housing”);
   po zwolnieniu miejsca (rozbuduj habitat / odeślij POP) POP dostarczony automatycznie.
5. **Stacja → kolonia** — wyślij POP ze stacji (pop>0) do kolonii: `station.pop--`, po dolocie
   kolonia `+1 POP` (EventLog „nowy POP"), statek przepięty do floty kolonii docelowej.
6. **Bramki** — nie da się wysłać ostatniego POP kolonii (population=1); pusta stacja jako źródło
   odrzucona; statek bez kabiny nie ma akcji.
7. **Regresja** — zwykły transport cargo, misje rekonu/kolonii bez zmian; save→reload w trakcie
   tranzytu pasażera (misja round-trip, POP dociera po reloadzie).

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
8. **Rozbiórka modułu (FAZA 3, R1) = BEZ zwrotu kosztów** (konwencja jak cancel budowy modułu/statku).
   `StationSystem.demolishModule` usuwa moduł, bilanse przeliczają się na kolejnym ticku. Guard habitatu
   `pop>popCapacity` → dozwolone z `console.warn` (limit egzekwuje FAZA 4).
9. **Budowa statków STACYJNYCH z UI stacji (FAZA 3, R2)** — ship picker w ekranie stacji reuse
   `queueStationShip`. Budowa statków stacyjnych z poziomu **Command/Shipyard** (globalny
   FleetOverlay) = **POZA ZAKRESEM S3.4** → osobny slice (dotyka FleetOverlay globalnie; patrz backlog e).
10. **Ship picker stacji buduje WYŁĄCZNIE projekty gracza** (korekta R2 po live-gate — zastępuje „lista
    `SHIPS`" z decyzji #9). Źródło = `window.KOSMOS.unitDesigns` (te same projekty co stocznia kolonijna,
    `FleetManagerOverlay._drawShipyard`), filtr = tech-gate na KADŁUBIE (`HULLS[hullId].requires`), koszt =
    `calcShipCost(hull, moduły)` z depotu stacji. `queueStationShip(stationId, hullId, moduleIds)` niesie
    moduły do `_spawnStationShip` → `createAndRegister(shipId, colonyId, {modules})` (parytet: statek stacyjny
    ma moduły projektu, jak kolonijny). Surowy szablon `SHIPS` (np. `science_vessel`) NIE jest budowalny ze
    stacji. Pusta lista → „Brak projektów — stwórz projekt w stoczni (Dowództwo)" (`station.mgmt.noDesigns`,
    pl+en). Backward-compat: `queueStationShip(id, shipId)` bez `moduleIds` = goły kadłub (koszt = hull cost,
    `calcShipCost(ship, [])`). Bez migracji save (v90). Commit **`03bff50`** `fix(S3.4-F3): stocznia stacji
    buduje projekty gracza`. Smoke `tmp_s34_faza3_smoke.mjs` **45/45** (sekcja 6 rewrite + sekcja 8
    system-level koszt/spawn z modułami).
11. **`obsada = pop` (FAZA 4, wdrożone `2394c6b`)** — habitat daje TYLKO `popCapacity`, ZERO załogi;
    mostek `max(pop, popCapacity)` zlikwidowany. Świeża stacja `pop=0` = moduły `no_crew` do czasu
    dostawy pierwszego POP. NOWY `CREW_SHED_ORDER` (`power_*` sheddable na `no_crew`) — patrz FLAGA
    PROJEKTOWA u góry. `passenger_module` NIE odblokowuje kolonizacji (`canColonize` = bramka na
    `slotType==='habitat'`, nie `colonistCapacity>0`); legacy `def.isColonizer` nietknięty.

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
4. **Budowa statków stacyjnych z Command/Shipyard** (globalny FleetOverlay) — osobny slice PO S3.4.
   Dotyka FleetOverlay globalnie (zakładka Stocznia buduje dla kolonii; rozszerzenie o stacje = zmiana
   celu budowy + routing spawnu). W S3.4 FAZA 3 (R2) budowa statków stacyjnych działa TYLKO z ekranu
   stacji (ship picker → `queueStationShip`). Świadomie poza zakresem S3.4.

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
- Commity: **`35ce5a2`** (FAZA 1), **`7073a99`** (FAZA 2), **`03bff50`** (FAZA 3 R2 — projekty gracza),
  **`2394c6b`** (FAZA 4 obsada=pop), **`19084f5`** (FAZA 4 transport pasażerski). `git log 35ce5a2^..HEAD`.
- Smoke: `tmp_s34_p1_smoke.mjs` (50/50), `tmp_s34_p2_smoke.mjs` (61/61), `tmp_s34_faza3_smoke.mjs` (45/45),
  `tmp_s34_command_stations_smoke.mjs` (17/17), `tmp_s34_faza4_smoke.mjs` (57/57). Untracked (konwencja tmp).
