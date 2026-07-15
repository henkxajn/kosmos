# S3.4 — Stacje orbitalne: dokument wznowienia (continuation plan)

> **Samowystarczalny.** Świeża instancja Claude Code ma wznowić pracę WYŁĄCZNIE z tego pliku
> + repozytorium. Nie zakłada pamięci poprzedniej sesji.
> **Data zamrożenia:** 2026-07-04 (koniec pracy po FAZIE 2; live-gate FAZY 2 PENDING).
> **STATUS 2026-07-14: ARC ZAMKNIĘTY — S3.4 (F0–F6) + W2.1 + S3.4b DONE, live-gate PASS. Szczegóły na końcu pliku.**
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
4. Odpal smoke: `tmp_s34_p1` (**50/50**), `tmp_s34_p2` (**61/61**), `tmp_s34_faza3` (**47/47**),
   `tmp_s34_command_stations` (**17/17**), `tmp_s34_faza4` (**80/80**), `tmp_map_labels` (**35/35**).
   Każdy fail → STOP + raport.
5. **STAN (2026-07-14):** FAZY 1-4 **ZAMKNIĘTE** (F4 RETEST PASS). FAZA 5 DONE (`c17eb95`),
   **live-gate PENDING** (Filip wybiera W1/W2). Następna praca:
   - **FAZA 5 live-gate FAIL / brak** → poprawki wg uwag Filipa; nie zaczynaj cleanupu.
   - **FAZA 5 live-gate PASS (wybór W1/W2)** → cleanup starych rombów `_colonyLabels` + martwej gałęzi
     wariantu (FAZA 6 §6.2), potem **FAZA 6** (domknięcie: round-trip save, sweep martwego kodu, CLAUDE.md).
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
| **FAZA 4** — transport POP | ✅ **ZAMKNIĘTA** (RETEST PASS RT1-RT5) | commity **`2394c6b`** (obsada=pop) + **`19084f5`** (transport pasażerski) + **`c0ff981`** (B1/B2/K1/K2); smoke `tmp_s34_faza4_smoke.mjs` **80/80** + `tmp_s34_faza3_smoke.mjs` **47/47** + `p2` **61/61**. **RETEST PASS** (Filip): bramka canColonize w UI, no_housing + auto-unload na żywo, pełna pojemność + częściowy rozładunek, blokada rozbiórki zasiedlonego habitatu. |
| **FAZA 5** — etykiety na mapie | ✅ DONE (W2.1 + cleanup), **live-gate final PENDING** | commity **`c17eb95`** (W1/W2) + **`4f18b15`** (W2.1: LOD K1 + stacking K2 + focus K3 + kosmetyka K4) + **`d7e6e34`** (cleanup: romby/W1/flaga wariantu out); smoke `tmp_map_labels_smoke.mjs` **37/37** + regr faza1-4 (50/61/47/80). `MapLabelLayer` (Trasa A: overlay 2D na #ui-canvas) — etykiety kolonii (ikona+nazwa+POP) i stacji (🛰+nazwa+pop/cap+badge). **Wybór Filipa: W2** → cleanup wykonany (stare romby `_colonyLabels` + gałąź `_drawW1` + `resolveLabelVariant`/`mapLabelVariant` debug usunięte; W2.1 jedyny render). Stacja klikalna → `station:selected` + `station:focus` (K3). Sekcja „FAZA 5 — DONE" niżej. **BACKLOG (nie teraz):** odcień niebieskiego ramki stacji do palety terminala; dalsze podkręcanie plakietek. |
| **FAZA 6** — domknięcie | ✅ DONE | commity **`8620c61`** (sweep §6.2) + **`8d8f53d`** (exportSave/importSave) + **`adb90e6`** (CLAUDE.md); regresja rot-proof (piny v85/v86 + mock s4_3) w tmp smokes; smoke `tmp_s34_faza6_smoke.mjs` **18/18**. Raport końcowy S3.4 niżej („FAZA 6 — DONE + RAPORT KOŃCOWY"). §6.1 round-trip pokryty istniejącymi smokami (p1 migracja v90 / faza3 station serialize-restore / faza4 misja pasażerska) + live-gate F2 R3. |

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

## FAZA 4 — POPRAWKI LIVE-GATE (B1/B2/K1/K2, commit `c0ff981`; RETEST PENDING)

Częściowy live-gate FAZY 4 (Filip): **T1/T3/T6/T7/T8 PASS**, pętla główna T4 działa dla 1. POP.
Zgłoszone 2 bugi + 2 korekty — domknięte commitem `c0ff981` (bez migracji save, v90). RETEST przez Filipa.

**B1 (fix, KRYTYCZNE) — root cause:** bramka `Vessel.canColonize` (przeprojektowana w `19084f5` na moduł
`slotType==='habitat'`) była POPRAWNA, ale UI jej NIE używało. `getModuleCapabilities` dodaje capability
`'colony'` dla KAŻDEGO `colonistCapacity>0` — więc statek z 2× `passenger_module` (zero habitatu) dostawał
akcję „Kolonizuj" przez `caps.has('colony')`. W nowej grze maskował to osobny tech-gate (`colonization`
niezbadany → akcja nieaktywna). Fix: JEDNO źródło prawdy — `canColonize` w 3 miejscach decydujących o
dostępności: `FleetActions.getAvailableActions` (push colonize) + `colonize.canExecute` + `FleetManagerOverlay`
picker `foreign_colonize`. Pozostałe `colonistCapacity>0` w UI to display projektu (nie dostępność) —
`transport_passenger` słusznie zostaje na `colonistCapacity>0`.

**B2 (fix) — root cause:** statek pasażerski czekający przy pełnej stacji (`no_housing`) był
niekomunikowany — gracz sądził, że POP zginął. Dwie mylące etykiety: (1) status „Czeka na paliwo" —
`dockAtTarget` przy stacji uruchamia auto-tankowanie z depotu (bez `power_cells`) → `_awaitingFuel=true`
mimo pełnego baku; (2) misja „Tranzyt ETA rok X" — faza `no_housing` wpadała w `else`→`phaseTransit` z
nieaktualnym `arrivalYear`. Fix: marker `vessel._awaitingHousing` (transient) + event `vessel:awaitingHousing`;
`_statusText` daje markerowi PIERWSZEŃSTWO → „Oczekuje na wolny habitat"; `_drawActiveMission` faza
`no_housing` → „Oczekiwanie (brak miejsca)" + ukryte ETA; EventLog (UIManager); hint na ekranie stacji
(StationManagementView); dirty-redraw (ColonyOverlay). **Retry potwierdzony smoke:** `no_housing` → +habitat
→ auto-unload → `completed` w ≤ kilku ticków.

**K1 (feat) — załadunek = pełna pojemność kabin** (był hardcode 1 POP). Kolonia: `min(kabiny, population-1)`
(nigdy ostatni POP); stacja: `min(kabiny, pop)` (hub przeładunkowy — można opróżnić). **Rozładunek CZĘŚCIOWY:**
wysiada tylu, ilu mieści się w wolnych habitatach; reszta czeka na pokładzie w `no_housing` (spójnie z B2).
Selektor ilości w UI = backlog (świadomie nie teraz).

**K2 (feat, decyzja Filipa) — blokada rozbiórki zasiedlonego habitatu** (zastępuje wariant „dozwolone +
warn", decyzja #8). `StationSystem.demolishModule`: splice-check-revert (żywy getter `popCapacity`) → `false`
gdy `pop > popCapacity` po rozbiórce. UI: 🗑 szary + hit-zone `station_mgmt_demolish_blocked` + komunikat
„Najpierw przetransportuj POP — habitat zamieszkany". Nie-habitaty i puste habitaty bez zmian.

**Smoke:** `tmp_s34_faza4_smoke.mjs` **80/80** (§8 B1 dostępność akcji, §9 K1 pojemność+rozładunek częściowy,
§10 B2 marker/event/retry, §11 K2 blokada) + `tmp_s34_faza3_smoke.mjs` **47/47** (§5 pod K2: pusta stacja +
5.11 blocked view). Regr p1 50/p2 61/command 17/slice8b 51/s4_2 25.

### LISTA RETEST FAZY 4 (Filip — po `c0ff981`)

1. **[B1]** Zbuduj projekt z 2× `passenger_module` (zero habitat_pod/cryo_pod), odblokuj tech Kolonizacja
   (lub save z techem). Statek pasażerski **NIE MA** akcji „Kolonizuj"; colony ship (z habitatem) MA.
2. **[B2]** Wyślij pasażera na PEŁNĄ stację → statek: status „Oczekuje na wolny habitat" (nie „Czeka na
   paliwo"), misja „Oczekiwanie (brak miejsca)" (nie „Tranzyt ETA"), EventLog „<statek> czeka…", ekran
   stacji hint „Statek z X POP czeka — dobuduj habitat". Dobuduj habitat → POP rozładowany sam.
3. **[K1]** Statek 2-kabinowy z kolonii ≥3 POP → zabiera 2 (nie 1); z kolonii 2 POP → zabiera 1. Rozładunek
   na stację z 1 wolnym miejscem (2 na pokładzie) → 1 wysiada, 1 czeka.
4. **[K2]** 🗑 na zasiedlonym habitacie → szary + komunikat „Najpierw przetransportuj POP". Pusty habitat /
   inny moduł → rozbiórka działa.

---

## FAZA 5 — DONE (etykiety kolonii + stacji na mapie; live-gate PENDING — wybór W1/W2)

**Commit `c17eb95`.** Bez migracji save (v90), render/UI-only. Zaimplementowane wg planu c) FAZA 5:

- **NEW `src/ui/MapLabelLogic.js`** (czysty, node-test) — zbieranie danych etykiet + mgła wojny w
  JEDNYM miejscu: `gatherColonyLabels` (**`getPlayerColonies` — NIGDY `getAllColonies`**; ikona
  home/colony/outpost + POP; outpost `pop=null`), `gatherStationLabels` (**tylko stacje gracza**
  `!ownerEmpireId`; pop/popCapacity + badge), `stationStatusBadges` (`building`→`no_crew`→`no_power`
  z `inactiveReason`), **`labelLOD(dist)`** (K1 — cross-fade `{plaqueAlpha, markerAlpha}` na progach
  `LOD_PLAQUE_FULL 150 / LOD_PLAQUE_FADE 215 / LOD_MARKER_FADE 300 / LABEL_FADE_END 360`), **`stackLabels`**
  (K2 — deterministyczny greedy anty-nakładanie: sort po targetY, kolidujące zsuwane w dół z odstępem).
- **NEW `src/ui/MapLabelLayer.js`** (widok canvas) — **Trasa A: overlay 2D na `#ui-canvas`** rysowany
  w `UIManager.draw()` nad WebGL (NIE sprite 3D). Pozycje: kolonie **`getBodyScreenPosition`**, stacje
  **`getStationScreenPosition`** (oba z-clamp, **NIGDY legacy `getScreenPosition`**); `/UI_SCALE` + clip
  wzorem `_drawBracketForVessel`. Render **W2.1** (jedyny po cleanupie): plakietka rounded-rect + pasek
  akcentu + 2 linie + badge (`_drawW2`), LOD-far → minimalny znacznik ikona[+badge] (`_drawMarker`,
  klikalny), łącznik plakietka↔ciało (`_drawConnector`, K4), nazwa ucinana „…" do `MAX_NAME_W` (K4),
  offset NAD/POD tarczą (K4). **Etykieta stacji KLIKALNA → `station:selected` ORAZ `station:focus`**
  (K3 — reuse ścieżki najazdu kamery); kolonie display-only (klik ciała = raycast 3D).
- **`ThreeRenderer.getCameraDistance()`** (accessor `_cameraController._dist`) dla LOD.
- **`GameConfig.FEATURES.mapLabels`** (ON) — master gate; rollback OFF = brak etykiet.
- **UIManager** — instancja + draw (gate `mapLabels && civMode && !isAnyOpen && !globeOpen`, pod ramkami
  statków) + `handleClick` stacji (gate MIRROR draw — chroni przed klikiem w stare hit-zony podczas globusa).
- **Treść:** KOLONIA = ikona typu + nazwa + POP; STACJA = 🛰 + nazwa + pop/popCapacity + badge
  (🔨 budowa / 👥 brak załogi / ⚡ deficyt). Bez i18n (emoji + nazwy encji + liczby — uniwersalne).

**✅ CLEANUP WYKONANY (`d7e6e34`)** — Filip wybrał **W2** na live-gate → usunięto:
- stare romby `_colonyLabels` w ThreeRenderer (`_syncColonyLabels`/`_updateColonyLabelPositions`/
  `_removeColonyLabel`/`_createColonyMarker` + init/dispose/tick) — selekcja ciała przez raycast
  planety/księżyca (`_entityByUUID`) nietknięta;
- martwą gałąź wariantu W1 (`_drawW1`, `_drawPlaque` dispatcher, param `variant`);
- `resolveLabelVariant` (MapLabelLogic) + `KOSMOS.debug.mapLabelVariant` (GameScene).
W2.1 (`_drawW2` + LOD + stacking) = jedyny render.

**Smoke:** `tmp_map_labels_smoke.mjs` **37/37** (mgła wojny + inwariant getAllColonies-never, ikony/POP,
stacje gracza-only, badge+kolejność, **LOD cross-fade + monotoniczność (K1)**, **stacking kolizja/łańcuch/
determinizm/no-mutate (K2)**). ⚠ `MapLabelLayer` (widok) nieimportowalny headless do renderu — smoke
pokrywa CZYSTĄ logikę; rysowanie/klik/LOD wizualnie weryfikuje Filip na final live-gate.

**BACKLOG (continuation doc, nie teraz):** dostrojenie odcienia niebieskiego ramki stacji (`#8fb8ff`) do
palety terminala; dalsze podkręcanie wyglądu plakietek (offsety, fonty, progi LOD).

### LISTA FINAL LIVE-GATE FAZY 5 (Filip — po cleanupie)

1. **Etykiety kolonii** — nad każdą kolonią gracza: ikona (🏠 home / 🏙️ kolonia / ⛺ placówka) +
   nazwa + POP (placówka bez POP). Kolonie AI **NIE** mają etykiet (mgła wojny).
2. **Etykiety stacji** — nad stacją gracza: 🛰 + nazwa + `pop/popCapacity` + badge (🔨 budowa modułu/
   statku, 👥 brak załogi, ⚡ deficyt energii). Cudze stacje bez etykiet.
3. **Klik etykiety stacji** → `station:selected` (StationPanel) + `station:focus` (najazd kamery, K3).
4. **LOD zoom-out (K1)** — BLISKO/ŚREDNIO: pełna plakietka; DALEKO: zwija się do minimalnego znacznika
   (ikona[+badge], klikalny); BARDZO DALEKO: fade out. Przejścia płynne.
5. **Anty-nakładanie (K2)** — nachodzące etykiety rozsuwają się pionowo + łącznik do ciała-kotwicy.
6. **Kosmetyka (K4)** — długie nazwy ucinane „…"; plakietka NAD/POD tarczą (nie na niej) + krótki łącznik.
7. **Regresja** — klik ciała (planeta/księżyc) dalej selekcjonuje (romby usunięte, raycast działa);
   overlay kolonii/stacji bez zmian; pod otwartym panelem/globusem etykiety znikają.

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
   `StationSystem.demolishModule` usuwa moduł, bilanse przeliczają się na kolejnym ticku.
   ⚠ **ZAKTUALIZOWANE przez K2 (FAZA 4 live-gate, `c0ff981`):** rozbiórka ZASIEDLONEGO habitatu
   (`pop > popCapacity` po rozbiórce) jest **ZABLOKOWANA** (splice-check-revert → `false`), NIE „dozwolona
   z console.warn". UI wyszarza 🗑 (`station_mgmt_demolish_blocked`) + komunikat „Najpierw przetransportuj
   POP". Decyzja Filipa zastępuje wariant warn-owy.
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
**✅ Cleanup etykiet FAZY 5 WYKONANY (`d7e6e34`, przed FAZĄ 6):** stare romby `_colonyLabels` +
`_syncColonyLabels`/`_createColonyMarker`/`_updateColonyLabelPositions`/`_removeColonyLabel` w
`ThreeRenderer` usunięte (zastąpione `MapLabelLayer`); martwa gałąź `_drawW1`/`_drawPlaque` +
`resolveLabelVariant`/`mapLabelVariant` debug usunięte (W2.1 jedyny render). Selekcja ciała działa
dalej przez raycast planety/księżyca (`_entityByUUID`), zweryfikowana grep-em.
**6.3** Aktualizacja `CLAUDE.md` (sekcja stacji: nowy model, save v90, mapa plików).
**6.4** Raport końcowy: co zrobione, co odłożone (wpięcie trade w `CivilianTradeSystem`, stacje w
Outlinerze/minimapie, tier 2+, klasy stacji, stacje AI — świadomie POZA zakresem).

---

## e) BACKLOG FAZY 6 (dodatkowe, poza planem nadrzędnym)

1. ✅ **DONE (F6, untracked)** — **Naprawa starych pinów v85/v86 + przestarzałego mocka w regresji.**
   Piny przepisane **rot-proof**: `CURRENT_VERSION === N` → `>= N` (floor istnienia migracji),
   `migrated.version === N` → `=== CURRENT_VERSION` (wynik pełnego łańcucha). Naprawione:
   `tmp_s3_3b_s2` (34/34), `tmp_s3_3b_s3` (35/35), `tmp_s3_3b_s3b_e1` (16/16), `tmp_s3_5a_1` (43/43),
   `tmp_s3_5b` (51/51). Mock `tmp_s4_3` (14/14) + `getPlayerColonies` (filtr `!ownerEmpireId`, mirror
   ColonyManager). ⚠ Zostają untracked → efemeryczne (patrz #3). **Poza scope Filipa jeszcze wykryte**
   (NIENAPRAWIONE, starsze slice'y, ten sam pattern): `tmp_s3_0a_a/b/d/e` (v80/81), `tmp_s3_2_s2` (v83),
   `tmp_warp_route_system` (v88) — rekomendacja: rot-proof sweep razem z decyzją #3.
2. ✅ **DONE (F6, `8d8f53d`)** — **Debug `exportSave()` / `importSave()`** (+ statyczne `SaveSystem.exportSave/
   importSave`). `KOSMOS.debug.exportSave()` pobiera plik + schowek + zwraca string; `importSave(json)`
   nadpisuje slot (string/obiekt) + instruuje reload. Smoke 9/9 (w `tmp_s34_faza6_smoke.mjs` 18/18).
3. ⏳ **DECYZJA FILIPA** — **`tmp_s34_*` i pozostałe `tmp_*` smokes: stałe czy usunąć?** Obecnie ~60
   untracked plików w root; fixy z #1 są efemeryczne (znikną przy `git clean`). Rekomendacja: promować
   kluczowe (`tmp_s34_p1/p2/faza3/faza4/faza6`, `tmp_map_labels`, `tmp_s34_command_stations`) do
   `src/testing/` jako trackowane + runner, resztę zostawić/usunąć. Osobny slice infra-testów (poza S3.4).
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
  **`2394c6b`** (FAZA 4 obsada=pop), **`19084f5`** (FAZA 4 transport pasażerski), **`c0ff981`** (FAZA 4
  poprawki live-gate B1/B2/K1/K2), **`c17eb95`** (FAZA 5 etykiety W1/W2), **`4f18b15`** (FAZA 5 W2.1:
  LOD/stacking/focus/kosmetyka), **`d7e6e34`** (FAZA 5 cleanup — romby/W1/flaga out), **`8620c61`**
  (FAZA 6 sweep §6.2), **`8d8f53d`** (FAZA 6 exportSave/importSave), **`adb90e6`** (FAZA 6 CLAUDE.md).
  `git log 35ce5a2^..HEAD`.
- Smoke: `tmp_s34_p1_smoke.mjs` (50/50), `tmp_s34_p2_smoke.mjs` (61/61), `tmp_s34_faza3_smoke.mjs` (47/47),
  `tmp_s34_command_stations_smoke.mjs` (17/17), `tmp_s34_faza4_smoke.mjs` (80/80),
  `tmp_map_labels_smoke.mjs` (37/37), `tmp_s34_faza6_smoke.mjs` (18/18). Untracked (konwencja tmp).

---

## FAZA 6 — DONE + RAPORT KOŃCOWY S3.4 (2026-07-14)

**S3.4 (stacje orbitalne jako pełny ekran gracza) — WSZYSTKIE FAZY 0-6 UKOŃCZONE.** Save v90.
Final live-gate FAZY 5 (etykiety W2.1 wizualnie) + retest domknięcia F6 PENDING (Filip).

### Co zrobione (per faza)
- **F0** audyt (workflow 4+4 agenty) → `docs/audits/s34-phase0-findings.md`.
- **F1** dane + model encji + migracja v89→v90 (`35ce5a2`). Live-gate PASS z zastrzeżeniem (migracja
  headless-tested — single-slot save).
- **F2** tick stateful: budowa modułów (depot.spend), bilans energii/pracy (obsada=pop od F4),
  lab→research home, stocznia→spawn+dockAtStation (`7073a99` + fixy stoczni/Command). Live-gate PASS.
- **F3** ekran zarządzania: `StationManagementView.js` + tryb stacji w ColonyOverlay (zakładki 🛰, siatka
  slotów, picker modułów+statków z projektów gracza, depot, kolejka stoczni, rozbiórka). Live-gate PASS.
- **F4** transport pasażerski POP: `passenger_module` + misja `_launchPassenger`/`_processPassengerArrival`
  + `_awaitingHousing`/no_housing (auto-unload po zbudowaniu habitatu) + pełna pojemność/częściowy
  rozładunek + blokada rozbiórki zasiedlonego habitatu. `canColonize` = moduł habitat (nie colonistCapacity).
  RETEST PASS RT1-RT5 (`2394c6b`+`19084f5`+`c0ff981`).
- **F5** etykiety mapy (`MapLabelLayer`, Trasa A overlay 2D): W2.1 = plakietki kolonii (ikona+nazwa+POP)
  i stacji (🛰+nazwa+pop/cap+badge), LOD 3-poziomowy (plakietka→znacznik→fade), anty-nakładanie greedy +
  łącznik, kosmetyka (ucinanie „…", offset nad/pod tarczą), stacja klikalna → `station:selected`+`station:focus`.
  Mgła wojny: `getPlayerColonies`/stacje `!ownerEmpireId` — NIGDY getAllColonies. Wybór Filipa=W2 →
  cleanup (romby/W1/flaga wariantu out). (`c17eb95`+`4f18b15`+`d7e6e34`).
- **F6** domknięcie: sweep §6.2 (StationData.buildTime + i18n moduleShipyardSoon/rename — martwe),
  `exportSave/importSave` debug, regresja rot-proof (piny v85/v86 + mock s4_3), CLAUDE.md + ten raport.
  (`8620c61`+`8d8f53d`+`adb90e6`).

### Inwarianty utrzymane (twarde ograniczenia)
- Stacja NIGDY w `ColonyManager._colonies`. Zero zmian w `CivilianTradeSystem`/`switchActiveColony`/
  `ColonyManager.serialize`. Balans wyłącznie w `StationModuleData.js`. Commity atomowe. i18n PL+EN.
- Fasady: `StationDepot` (façade store), `_playerStationFacades` (EconomyOverlay), tryb stacji ColonyOverlay
  (colonyId fallback, render ekranem stacji, bez switchActiveColony).

### Świadomie ODŁOŻONE (backlog — poza zakresem S3.4)
- Wpięcie stacji w `CivilianTradeSystem` (handel towarami PRZEZ stację jako węzeł).
- Stacje w Outlinerze/minimapie/Stratcom; stacje AI (cross-empire); tier 2+ i klasy stacji.
- Szablon „Statek pasażerski" w kreatorze jednostek; budowa statków stacyjnych z Command/Shipyard
  (globalny FleetOverlay — dziś tylko z ekranu stacji); selektor ilości POP w transporcie pasażerskim.
- Dostrojenie odcienia niebieskiego ramki stacji (`#8fb8ff`) do palety terminala; dalsze podkręcanie plakietek.
- **DECYZJA FILIPA:** los `tmp_*` smokes (efemeryczne fixy pinów) — promocja do `src/testing/` czy usunięcie
  (§e.3). Starsze piny v80/81/83/88 (`tmp_s3_0a_*`/`tmp_s3_2`/`tmp_warp`) niezaadresowane — rot-proof sweep razem.

### Regresja końcowa (headless, wszystkie PASS)
`p1` 50/50 · `p2` 61/61 · `faza3` 47/47 · `command_stations` 17/17 · `faza4` 80/80 ·
`map_labels` 37/37 · `faza6` 18/18. Regresja rot-proof: `s3_3b_s2` 34/34 · `s3_3b_s3` 35/35 ·
`s3_3b_s3b_e1` 16/16 · `s3_5a_1` 43/43 · `s3_5b` 51/51 · `s4_3` 14/14.

### NEXT (po final live-gate Filipa)
S3.5 (cross-empire trade — częściowo zrobione: S3.5a-1 upkeep, S3.5b order board) / dług techniczny AI /
empire tech state — wg nadrzędnego roadmapu, poza S3.4.

---

## Domknięcie S3.4 — KROK A (testy) + KROK B (W2.1) — final live-gate PASS + poprawki

### KROK A — promocja smoke'ów + sweep pinów (commit `e934072`)
18 headless smoke'ów przeniesionych z rootu do **`src/testing/smoke/`** (trackowane, regresja):
- S3.4 (7): `p1/p2/faza3/faza4/faza6`, `map_labels`, `command_stations`.
- Milestone regresja (11): `s3_0a_a2/b/c/d/e/chain_v78_v81`, `s3_0b_s3`, `s3_2_s2_integration`,
  `warp_route_planner/route_system/stratcom`.
Zmiany: importy `./src/` → `../../` (jak `headless/`); **sweep martwych pinów wersji** —
`CURRENT_VERSION === N` → `>= N`, `migrated.version === N` → `=== CURRENT_VERSION` (odporność na bump).
`faza6` zostawia literały `v90/v85` — celowo testują preserve-version `importSave/exportSave`, to nie piny.
`README.md` z konwencją. Wszystkie 18 zielone z nowej lokalizacji.
**NIE promowane (dług, untracked w root):** `s3_0a_a`, `s3_0b_s1_chain_v81_v82`, `s3_0b_s1b_readers`,
`s3_2_s2_smoke` — mają **dryf zachowania** (nie piny): krzywa `fuelMult` S3.0b-S2 (`fuelPerLY` 0.5→0.125,
`warpFuel` 5→4.375), model `fuelType` dual-tank, kolejka badań AI. Decyzja: update asercji do bieżącej
krzywej **vs** retire — odłożone (rewrite behawioralnych asercji ≠ „sweep pinów", ryzyko zamaskowania regresji).

### KROK B — W2.1 (poprawki etykiet MapLabelLayer)
**B1 — lag etykiet / „dogadnianie" myszką (root-cause WSPÓLNY z ramkami selekcji):**
Diagnoza: overlay 2D (`UIManager._draw`) jest bramkowany `_dirty || _animating || timeDirty` — **nic nie
śledzi ruchu kamery**. `ThreeCameraController.update()` (co klatkę) *lerpuje* `_dist→_targetDist` i
`_target→_goalTarget` (0.08/kl.) → po scrollu/panie kamera WebGL sunie ~30 klatek („inercja"), a overlay
dogania dopiero na `timeDirty` (10fps, gra biegnie) albo na ruch myszy (pauza). `_drawSelectionBrackets`
dzieli TEN SAM `_draw()` → ten sam utajony bug. Fix na poziomie bramki naprawia OBA spójnie.
Fix: `ThreeCameraController` eksponuje **epokę ruchu** (`_moveEpoch`, bump w `update()` gdy `distanceToSquared`
pozycji > 1e-8) → `ThreeRenderer.getCameraMoveEpoch()` → `UIManager` dokłada `cameraMoved` do bramki
(`|| cameraMoved`). Overlay przerysowuje się co klatkę DOPÓKI kamera się rusza; po osiadnięciu epoka zamiera →
powrót do idle (bez wiecznego redrawu). Zysk: etykiety + łączniki + ramki selekcji przyklejone bez smużenia.
Pozostaje (świadomie, poza B1): przy grze biegnącej + statycznej kamerze ciała ruszają się, overlay 10fps
(`timeDirty`) — osobny, celowy throttle.

**B2 — dynamiczna szerokość plakietki:** `MapLabelLayer._measurePlaque` już liczył `w = max(mainW,subW)+16`
(szerokość adaptacyjna), ale `MAX_NAME_W=120` ucinał ~18-znakowe nazwy. Podniesione do **200** (≈30 znaków przy
foncie 10-11px) — pełne realne nazwy (np. „Stacja Orbitalna Alfa") bez „…"; dopiero absurd ucina. Stacking i
łączniki i tak liczyły realną `dims.w`.

Pliki B: `ThreeCameraController.js`, `ThreeRenderer.js`, `UIManager.js`, `MapLabelLayer.js`. Bez migracji save.
B1/B2 są WIZUALNE → **live-gate** (headless nie testuje canvas/three). `map_labels` smoke 37/37 PASS (bez regresji),
4 pliki `node --check` czyste.

---

## S3.4b — Panele okienkowe (drag / minimize / dock / stacking)

Cel: pływające panele ciał (BottomContext = „okno planety", StationPanel) zachowują się jak lekkie
okienka — przesuwalne, minimalizowalne do paska zadań, kilka naraz. **C0 zaakceptowany przez Filipa**
(architektura kompozycyjna, NIE przepisywanie paneli).

### C0 — rekonesans (ustalenia)
Dwa OSOBNE pływające panele, brak wspólnej bazy „okna": **BottomContext** (bespoke, planeta/kolonia,
miał już minimize „in-place") vs **StationPanel** (`extends BaseOverlay`, stacja). Oba anchored do
ekranowej pozycji ciała/stacji + clamp do mapy. Drag/dock nie istniały. Decyzje: okno planety =
BottomContext; ▼ BottomContext PRZEROBIĆ na dokowanie (minimalizacja in-place znika); drag odczepia od
kotwicy (panel nieruchomy przy ruchu kamery); pozycje NIE serializowane (reset per sesja); StationPanel ~440px.

### Architektura (kompozycja, nie dziedziczenie)
- **`FloatingPanel.js`** (helper): `dragPos` (override kotwicy), `place/beginDrag/updateDrag(próg 4px)/endDrag/
  reanchor`, flaga `minimized`. Panel trzyma instancję i deleguje pozycję + drag.
- **`PanelDock.js`** + **`PanelDockLogic.js`** (`computeDockSlots` — czysta, smoke): wspólny pasek zadań
  (rejestr `register/unregister/get/has` + draw belek + `handleClick`→onRestore + `isOver`/hover). Belki
  lewy-dół, stack pionowo w górę nad nawigacją, overflow guard. Trzymany w UIManager: draw PO overlayach,
  klik PRZED, blokada kamery przez `isOver`.

### C1 — drag (commit `e583e0c`)
BottomContext + StationPanel: `_float` + strefa-drag = pas nagłówka POZA przyciskami; `tryBeginDrag/
handleDragMove/endDrag/isDraggingPanel`; reanchor przy zmianie encji/stacji. UIManager router:
mousedown→tryBeginDrag, mousemove→handleDragMove+pochłoń, mouseup→endDrag.

### C2 — minimize + dock (commit `537fdfa`)
BottomContext: ▼ przerobione (in-place USUNIĘTE) → dokuj belkę (encja-scoped `body:<id>`); `_minimized`=
zadokowany (early-return w draw); restore=klik belki (onRestore→body:selected); `body:selected` un-minimizuje
+ zdejmuje belkę. StationPanel: nowy ▼ w [✏][▼][✕] (dragZone→PW-70) → dok z `restorePos` (przywrócenie na
poprzednią pozycję); station:selected/destroyed zdejmują belkę. Smoke `computeDockSlots` 19/19.

### C3 — StationPanel 2× szerszy (commit `35f5933`)
PW 220→440, treść w dwóch kolumnach (LEWA: właściciel/orbita/depot; PRAWA: handel/moduły — pełna lista).
`_buildLines`→`_buildColumns({left,right})` + `_drawColumn`; „Zarządzaj" full-width na dole; wysokość=max(kolumn).

### Poprawki z adversarial review (workflow `s34b-review` — 8/9 CONFIRMED)
- **#1** dok bez bramki `civMode` (4 call-sites w UIManager: draw/handleClick/isOver/handleMouseMove) —
  BottomContext (a więc minimalizacja) działa też poza civMode (generator/power_test); geometria już adaptuje.
- **#2** BottomContext słucha `entity:removed` → zdejmuje osieroconą belkę + czyści stan (parytet ze StationPanel).
- **#3** StationPanel `_restoreFromDock`: displaced (inna żywa stacja na ekranie) najpierw DOKOWANA — nie gubi
  jej ani pozycji (realizuje wizję „stacja 1 + stacja 2" bez utraty).
- **#4** `endDrag` na SZCZYCIE `handleMouseUp` (przed early-return na overlay) + abort draga gdy overlay wejdzie
  w trakcie (handleMouseMove) — drag nie utyka `_dragging=true`.
- **#5** `_panelDragConsumedClick` — realny drag pochłania nadchodzący click (GameScene guard obok
  `_boxSelectConsumedClick`) → nie przelatuje do sceny 3D (deselekcja/czyszczenie floty).
- **#6/#7** PanelDock stackuje się NAD panelami floty (FleetGroupPanel/FleetCommandPanel) — dodany
  `FleetGroupPanel._drawnRect`; `_geom` podnosi `baseY` nad ich rect. Bez nakładania i kradzieży klików.
- **#8** BottomContext zeruje `_lastRect` przy deselect (early-return) — brak fantomowej strefy-drag.

### Znane ograniczenia / świadome decyzje (S3.4b)
- Panele SINGLE-INSTANCE: jednocześnie WIDOCZNE = 1 okno planety + 1 okno stacji; wiele MOŻNA zadokować
  (belki niezależne); przełączanie displaced auto-dokuje (#3), więc nic nie ginie.
- Belki doku = tylko restore (klik). Brak per-belka ✕ (dismiss) — dismiss = restore→✕. Follow-up jeśli trzeba.
- BottomContext restore = re-emit `body:selected` → pokazuje przy kotwicy + fokus kamery (nie „poprzednia
  pozycja draga" jak StationPanel — draw-time reanchor). Pozycje nieserializowane (reset per sesja).
- Wszystko WIZUALNE → **live-gate**. `node --check` czyste (9 plików); smokes: paneldock 19/19,
  bottomcontext-dock 14/14, s4_2 25/25, s4_3 14/14, faza3 47/47, command_stations 17/17, map_labels 37/37,
  slice8b 51/51 (regr FleetGroupPanel), FloatingPanel logika (node import) OK.

---

## ✅ STATUS KOŃCOWY — ARC STACJI ORBITALNYCH ZAMKNIĘTY (2026-07-14)

**S3.4 (FAZY 0–6) + W2.1 (KROK A+B) + S3.4b (C0–C4) = DONE, LIVE-GATE PASS, save v90.**

Final live-gate (Filip, 2026-07-14) przeszedł w całości:
- **KROK B / W2.1** — etykiety mapy trzymają się ciał podczas zoomu/inercji kamery (fix redraw-gate przez
  `moveEpoch` kamery); dynamiczna szerokość plakietki do nazwy (MAX 200 px, potem „…"). PASS.
- **S3.4b** — panele okienkowe: drag za nagłówek + minimalizacja do doku + stackowanie belek nad panelami
  floty + StationPanel 2× szerszy (440 px, dwie kolumny). Zweryfikowane pkt 1–12 (w tym restore z krawędzi
  ekranu, brak duplikatu panel↔belka, kotwica bez draga nietknięta, „Zarządzaj" nie chowa panelu, klik-ciała
  otwiera panel bez zmian). PASS.

Commity arca (main, wypchnięte): F0–F6 (patrz sekcja „Referencje"/„FAZA 6"), W2.1 `e934072` (KROK A
promocja smoke'ów + sweep pinów) + KROK B (etykiety), S3.4b `e583e0c` (C1 drag) · `537fdfa` (C2 dock) ·
`35f5933` (C3 szerszy panel) · `c16b38e` + `eb9deff` (adversarial-review fixy #1–#8).

**Nic z S3.4/S3.4b nie wisi lokalnie.** Świeża instancja: arc traktować jako zamknięty; kolejne prace
otwierają NOWY slice.

### Backlog feature'ów (świadomie ODŁOŻONE — nowe slice'y, nie dług do domknięcia arca)
Stacje — funkcje:
- Wpięcie stacji w `CivilianTradeSystem` (handel cywilny/kredyty przez stację jako węzeł).
- Stacje w Outlinerze i na minimapie galaktycznej.
- Tier 2+ i klasy stacji (obecnie tylko `orbital_station` tier 1).
- Stacje AI (imperia budują własne stacje).
- Szablon „Statek pasażerski" w kreatorze statków; budowa statków stacyjnych z modułu Command/Shipyard.
- Selektor ilości POP w transporcie pasażerskim (obecnie stały transfer).

Panele okienkowe (S3.4b) — polish:
- Prawdziwie MULTI-INSTANCE panele (obecnie 1 okno planety + 1 okno stacji naraz; displaced auto-dokuje).
- Per-belka ✕ (dismiss bez restore) — dziś dismiss = restore→✕.
- Serializacja pozycji paneli (dziś reset per sesja — celowo, żeby nie zaśmiecać save).
- BottomContext restore na „ostatnią pozycję draga" (dziś re-emit `body:selected` = reanchor przy kotwicy;
  StationPanel już trzyma `restorePos`).

---

## S3.4c — Unifikacja magazynu STACJA <-> KOLONIA — IMPLEMENTACJA UKONCZONA (Commity 1-5, save v90 bez bumpu, live-gate PENDING)

**Status:** kod + smoke KOMPLETNE (5 commitow na main), pelna regresja zielona. **STOP na live-gate**
(reguła `live-game-mandatory-gate`) — arc NIE zamkniety do czasu przejscia zywej gry (szkic live-gate w
`docs/plans/s34c-depot-unification-plan.md` §e).

**Commity:**
- **C1** `2b4c6fc` — proxy resolver StationDepot + stamp `ownerColonyId` (D1, D2). `resolveHomeColony`
  w `TransferStore.js` (guard AI -> stamp -> per-body -> parent(ksiezyc) -> jedyna-w-systemie -> null).
  `StationDepot` deleguje receive/spend/getAmount/inventory do kolonii-matki; sierota wlasna Mapa.
  serialize ksztalt bez zmian (matka `{}`, sierota plaski). Smoke `s34c_depot_proxy` 28/28.
- **C2** `cbfaeb9` — drain przy restore (D3) + osierocenie po `colony:destroyed` (D5).
  `_normalizeAndDrainDepot` (stamp normalizacyjny + przelew do kolonii, idempotentny; drenuje tez
  fuel/warp_cores D4). `depotDetached` marker (subskrybent match po STAMPIE — kolonia usunieta przed
  emitem; brak re-motheringu do rodzenstwa). Smoke `s34c_drain_orphan` 28/28.
- **C3** `97e882e` — trade bonus (D7) + wykluczenie self-cargo (D8). `_getStationTradeBonus` po
  `ownerColonyId` (zero double-count) w `_allocateTC`; bez capa; detached/AI pominiete. Self-cargo:
  stacja z matka poza celami `transport`, `transport_passenger` zostaje, sierota legalna. Smoke
  `s34c_trade_selfcargo` 14/14.
- **C4** `9bf3d4c` — UI wspolnego magazynu + i18n (D9). StationManagementView/StationPanel: "Wspolny
  magazyn: <kolonia>" (matka) / wlasny depot + "Odcieta od zaopatrzenia" (detached). EconomyOverlay
  fasada matki OUT. Pickery canAfford BEZ zmian (proxy `station.depot.getAmount` deleguje -> poprawne).
  i18n PL+EN `station.sharedStorage`/`cutOffFromSupply`. Smoke `s34c_ui_i18n` 9/9.
- **C5** (ten) — debug `stationFillDepot` komentarz (proxy), weryfikacja `loadOrbitalShells` (R13 —
  dziedziczy proxy przez resSys), `.gitignore /tmp_*.mjs` (root debris), pelna regresja, docs.

**Regresja (pelna, zielona):** wszystkie smoke w `src/testing/smoke/` (S3.4c 79 + S3.4/S3.4b + S3.0a/S3.0b
+ warp + map_labels) — 0 FAIL.

**Ryzyka R1-R13 (mitygacja):** R1 (eventy resource:changed) — D6 pozadane. R2 (colony:destroyed cleanup) —
subskrybent D5. R3 (migracja JSON) — live-restore drain, save v90. R4 (stacje AI) — guard `ownerEmpireId`
w resolveHomeColony. R5 (self-transfer) — filtr D8. R6 (2+ kolonii double-count) — atrybucja po ownerColonyId.
R7 (redundancja UI) — D9 + pickery przez proxy. R8 (wspolny pool paliwa) — akceptacja (drain fuel/warp_cores).
R9 (side-effect migracji POP) — zaakceptowany. R10 (energy-jako-cargo) — benign. R11 (0 kolonii) — fallback
null->depot. R12 (spend guard) — benign. R13 (loadOrbitalShells) — dziedziczy proxy przez resSys.

**Ponizej: pierwotny plan (ZAPLANOWANE) — zachowany dla kontekstu decyzji.**

---

### (pierwotny wpis planistyczny)

**Design:** "orbitalna dzielnica" — stacja gracza z kolonia-matka w systemie uzywa magazynu kolonii
(`colony.resourceSystem`) zamiast wlasnego `StationDepot`; stacja bez matki (debug / osierocona) zachowuje
wlasny depot. Implementacja: **Wariant B (depot-jako-proxy)** — `StationDepot` pozostaje obiektem
(inwariant `instanceof` zachowany), wewnetrznie deleguje do kolonii.

**Audyt (przeczytac W CALOSCI przed kodem):** `docs/audits/s34c-depot-unification-audit.md` —
kontrakty depot<->resourceSystem, mapy call-site (Obszary 1-6), ryzyka R1-R13.
**Plan implementacji (samowystarczalny, START jutrzejszy stad):** `docs/plans/s34c-depot-unification-plan.md` —
kontekst, decyzje D1-D9 (pelne brzmienie), plan 5 commitow z mapa ryzyk, smoke do napisania, live-gate, protokol startu.

**Decyzje (skrot — pelne w planie):** D1 stamp `ownerColonyId`+fallbacki per-body->parent->jedyna->depot ·
D2 proxy w `station.depot`, inwariant+serialize bez zmiany ksztaltu · D3 drain do kolonii przy restore
(idempotentny, **save v90 bez bumpu**, sieroty nietkniete) · D4 wspolny pool fuel/warp_cores · D5 subskrybent
`colony:destroyed` -> osierocenie (nie zniszczenie) · D6 `resource:changed` z operacji stacyjnych POZADANE ·
D7 `trade_module` -> tc kolonii-matki po `ownerColonyId`, bez capa · D8 self-cargo out w `FleetManagerOverlay:8108`,
`transport_passenger` zostaje, sieroty legalnym celem · D9 UI "Wspolny magazyn: <kolonia>", pickery canAfford
must-fix (`:363/466`), fasady depotowe w EconomyOverlay out, sierota = depot + "Odcieta od zaopatrzenia".

**Twarde ograniczenia S3.4 (Wariant A architektury) OBOWIAZUJA** — stacja poza `ColonyManager._colonies`,
nie dotyka `switchActiveColony`/`ColonyManager.serialize`; unifikacja idzie przez proxy magazynu, NIE przez
wciagniecie stacji do rejestru kolonii.
