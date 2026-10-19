# UI_PLAN — ARKUSZ UI: outlinery + belki

> **Stan: FAZA A zamknięta · U0 — ✅ ZAMKNIĘTE 2026-10-19** (commity `7d8231b` U0-1 · `97dd86c` U0-2 · `92f1b33` U0-3;
> bramka U0 u właściciela PASS 21/21 — §4.1) **· U1 — ✅ ZAMKNIĘTE 2026-10-19** (commity `4a645eb` U1-1 · `be52d8a`
> U1-2 · `d8cfe62` U1-3 + `0c4b30b` komentarz kontrolera kamery; bramka U1 u właściciela PASS — §4.2) **· następne: U2**
> (lewy outliner, §4.3). Faza A — audyt read-only 2026-10-18 na HEAD `a3c6c29` (POLISH P2b zamknięte, `POLISH_PLAN.md`
> §13). Podpisy właściciela 2026-10-18: decyzje 1–6 (§5), próg skrótu 10 000 (D-UI-12), odczytanie D-UI-3 przez decyzję 5
> (§2) oraz zgoda na §7.13–§7.15; 2026-10-19 (bramka U1): §7.18. Teczki: `C:\Users\Komputer\kosmos-handover\ui-phase-a\`
> (faza A) · `C:\Users\Komputer\kosmos-handover\ui-u0\` (U0) · `C:\Users\Komputer\kosmos-handover\ui-u1\` (U1; pomiary po
> bramce — `post_gate/`).
> Rejestr macierzysty findingów arca: **§6 tego pliku** (#471–#487; otwarte mają wiersze w `OPEN_FINDINGS_INDEX.md`).
> **Pierwszy wolny numer: 488** (484–487 — bramka U1 i sesja U1, 2026-10-19).
> Tagi: `[code]` źródło (plik:linia przy HEAD `a3c6c29`) · `[measured]` pomiar sondą read-only (zapisy właściciela,
> fixture) · `[derived]` wyliczenie z kodu i założonej metryki · `[git]` historia.

---

## 1. Cel

Słowa właściciela: **gracz ma grać jak najwięcej na mapie 3D układu. Listy po bokach są nawigacją, nie ekranami.**

Zakres arkusza: dwa outlinery (lewy — układy i ciała, prawy — statki gracza), jedna reguła klik/focus dla mapy 3D
i outlinerów, poprawki górnej i dolnej belki.

**Poza zakresem (zaparkowane przez właściciela):** reforma pływających okien statku / floty / kolonii / ciała
(`FleetManagerOverlay.drawVesselPanel`, `FleetGroupPanel`, `FleetCommandPanel`, `BottomContext`, `StationPanel`).
Ten arkusz ich nie projektuje i nie zmienia ich treści — zmienia tylko to, KIEDY się otwierają i czy rusza się kamera,
oraz gdzie stoją względem outlinerów.

---

## 2. Decyzje D-UI-1…13

Treść verbatim (podpisana przez właściciela 2026-10-18). Kolumna „pomiar" mówi, co audyt wie o każdej decyzji.

| # | Treść (verbatim) | Status | Co mówi pomiar |
|---|---|---|---|
| **D-UI-1** | Dwa outlinery: LEWY = układy i ciała, PRAWY = statki gracza. Wąskie, półprzezroczyste nad sceną 3D (nie wycięte z viewportu), zwijalne klawiszem: oba naraz i każdy osobno. | podpisana | Prawy istnieje (wysuwany drawer, krycie 1 od `be6e27e`); lewego nie było nigdy (A1). Półprzezroczystość odwraca powód `be6e27e` → decyzja 4. Klawisze: A9 (propozycja §7.16). |
| **D-UI-2** | Kolejność lewego: (1) układ macierzysty; (2) pozostałe własne układy z kolonią — najpierw te z koloniami z POP, potem same outposty; (3) inne układy wg odległości od układu macierzystego. | podpisana | `galaxyStar.distanceLY` jest gotowe w rekordzie gwiazdy (A4). Układ z własną kolonią musi być widoczny niezależnie od flagi „zbadany" — Finding 480. |
| **D-UI-3** | Widoczność w lewym: układ pojawia się na liście dopiero, gdy dotarł tam jakikolwiek statek gracza. Jeśli obserwatorium w home sys wcześniej go zeskanowało — po dotarciu pokazuje od razu WSZYSTKIE ciała (nazwy, bez żadnych danych dodatkowych); bez skanu — tylko ciała realnie odkryte. [Odczytanie Claude'a; właściciel może odwrócić.] | **podpisana** (2026-10-18): pierwsze zdanie bez zmian; lista ciał wg **decyzji 5 (b)** — lista = mapa, ciała nierozpoznane z „○", skan nie zmienia listy | Wykonalna bez nowego stanu w zapisie (A4). Dosłownie: lista węższa niż mapa 3D obok niej → **decyzja 5**. |
| **D-UI-4** | Zwijanie: planety i księżyce pod nazwą układu, domyślnie zwinięte poza bieżącym układem; stan zwinięcia pamiętany w sesji (nie w save). | podpisana | 4–11 planet + 10–22 księżyców w odwiedzonych układach zapisów właściciela ⇒ 14–33 wiersze rozwiniętego układu (A4). Planetoidy poza listą — §7.6. |
| **D-UI-5** | Reguła kliku — JEDNA na całą grę (mapa 3D i oba outlinery): 1. klik na statek/ciało = zaznaczenie + jego okno z opcjami BEZ ruchu kamery; 2. klik w ten sam obiekt = focus kamery. Klik na układ (lewy outliner) = przejście mapy 3D do tego układu, kamera w domyślnym widoku z odległości na gwiazdę. "Drugi klik", nie double-click z oknem czasu. | podpisana | Dziś każda powierzchnia robi co innego (A2, tabela); `body:selected` = karta + kamera; 16 miejsc w 5 plikach; granice reguły → **decyzja 2**. |
| **D-UI-6** | Prawy outliner: grupowanie UKŁAD → TYP; w układzie kolejność typów: wojenne, naukowe, cargo, reszta (dokładny porządek typów do zaproponowania z VesselData). | podpisana; porządek typów — propozycja §7.1 | Pliku `VesselData` nie ma — źródłem roli jest `getPrimaryRole` (`Vessel.js:575`), 7 ról (A5). |
| **D-UI-7** | Floty = jeden węzeł ze statkami pod spodem; klik na flotę = dzisiejsze menu floty (reforma tabów zaparkowana, nic tu nie projektujemy). | podpisana | „Dzisiejsze menu floty" = `FleetCommandPanel` przez `setSelectedFleetId`, dziś wołane wyłącznie z Dowództwa (A3). Flota rozpięta na dwa układy zmierzona w zapisie ZF gy120 → **decyzja 6**. |
| **D-UI-8** | Statki w locie między układami = osobna sekcja "W drodze" na górze prawego outlinera. | podpisana | „W drodze" ⇔ `systemId === null` (wyłącznie faza `warp_transit`) (A5). W 6 zmierzonych zapisach w chwili zapisu: 0 takich statków. |
| **D-UI-9** | Jeden znacznik statusu na wierszu statku (bezczynny / w ruchu / zadokowany / w walce / bez paliwa) — ikona lub kolor, minimum pikseli. | podpisana; mapowanie stanów — propozycja §7.2 | Jedno źródło priorytetu już istnieje (`buildShipEntry`, ton `combat > alert > move > mission > idle`). „Unieruchomiony za utrzymanie" dotyczy 9 z 13 statków w Polonii gy79 (A5). |
| **D-UI-10** | Synchronizacja zaznaczenia w obie strony: klik na mapie podświetla wiersz, klik na wiersz podświetla statek/ciało na mapie. | podpisana | Statek: już działa w obie strony (wiersz `Outliner.js:394-397`, ramki `_drawSelectionBrackets`). Ciało, stacja, flota: brak podświetlenia wiersza (nowe). Statek zadokowany nie ma sprite'a (A3). |
| **D-UI-11** | Górna belka: lista kolonii rozwija się po LPM na belkę, NIE po najechaniu. | podpisana | Dziś hover (`TopResourceDrawer.js:593-602`); klik poza nazwą już wymusza rozwinięcie (`:637-639`) (A6). |
| **D-UI-12** | Górna belka: stała szerokość komórki per surowiec + cyfry tabularne; skrót liczb od 10 000 (12 400 → 12,4k) [domyślne Claude'a]; kredyty zawsze widoczne w całości. | **podpisana** (2026-10-18): próg 10 000 potwierdzony; delty wg **decyzji 1 (a)** — strzałka ▲/▼, liczba w tooltipie | Font `Space Mono` (monospace) — cyfry już tabularne. Komórka stała z deltą nie mieści się w paśmie → **decyzja 1** (A6). |
| **D-UI-13** | Dolna belka z przyciskami głównych zakładek: bez ramek. | podpisana | Trzy elementy ramy rysowane w Canvas 2D (`BottomNavBar.js:117-147`), nie CSS; pasek zegara ma własną ramę „spójnie z nav" (§7.15) (A7). |

---

## 3. Pomiary A1–A9

### 3.1 A1 — outlinery historyczne `[code]` `[git]`

**Żywy jest jeden: prawy `src/ui/Outliner.js` (1196 linii).**
- Montaż: import `UIManager.js:69`, konstrukcja `:222`, stan składany od zera w każdym `_draw()` `:2243-2303`, rysowany
  `:2413-2421` z `_drawerMode = true` na stałe (`:2419`) — czyli **prawy wysuwany drawer**: pasek-trigger 6 px na prawej
  krawędzi (`Outliner.js:43, 137-143`), wysuw na hover (`:119-134`), chowanie po 300 ms (`:45, 854`). Klik przed
  overlayManagerem `UIManager.js:1973`, blokada kamery `:1886`, kółko `:2096`, hover `:2179`, animacja `:2473`.
  Chowany, gdy rozwinięty jest Dok taktyczny (te same linie + `:2418`). Flag `FEATURES`: brak.
- Treść — **pięć sekcji w jednym panelu:** KOLONIE (+stacje pod planetą-matką, +układy odwiedzone przez kanon
  `isSystemExploredData` `:199`, +układy z własnymi statkami `:210-217`) `:171-303` · EKSPEDYCJE (tylko statki
  AKTYWNEJ kolonii, max 6; filtr `UIManager.js:2260-2264`) `:306-345` · FLOTA (statki gracza w kubełkach kanonu
  `VesselStatus` `:368-373`) `:349-446` · KOLEJKA (produkcja aktywnej kolonii z ✕) `:449-542` · JEDN. NAZIEMNE (po
  ciele — **jedyne wejście do mapy obcego ciała z desantem**, naprawa `486982c`) `:545-609`.
- Krycie `bgAlpha(1)` `:149` od `be6e27e` (wcześniej 0,55 — drawer leży NAD overlayami i ich treść przebijała).
  Szerokość `COSMIC.OUTLINER_W = 150` (`LayoutConfig.js:11`). Górne 30 px przezroczyste (`CHIP_CLEAR_H` `:40`) —
  pozostałość po czipie czasu, który od UI v3 stoi na dole.
- Historia: stały panel (UI v1 Slice 5, `30b0171`) → zawsze wysuwany drawer (Slice B+C, `e7b5c6a`) → nieprzezroczysty,
  rysowany na samym wierzchu (`be6e27e`). Inwariant „na samym wierzchu" domknął B1 `23523af` (etykiety mapy przeniesione
  przed panele — komentarz `UIManager.js:2345-2360`).

**Lewa krawędź:** `NavDrawer.js` + `NavEdgeShim.js` leżą na dysku NIEWPIĘTE (`UIManager.js:70-71`; zero importów
w `src/`) — to była nawigacja, nie outliner. **Lewego outlinera nie było nigdy** (`git log --all -S LeftOutliner` oraz
`-S leftOutliner` — pusto). `CIV_SIDEBAR_W = 0` (`CivPanelDrawer.js:13`) — pozostałość pionowego paska.

**Co reużywalne, co martwe.** Reużywalne: szkielet sekcji / clip / scroll / prostokąty trafień (`_drawSection :632-666`,
`handleWheel :669-674`, `hitTest :677-794`), wiersze układów i stacji, `OutlinerGroundLogic.js` (czysty, keeper 55 pinów),
kubełki kanonu `VesselStatus`, tooltip kolonii (`:1044-1172`). Do wymiany: tryb drawer (`_drawerMode`, slide, trigger,
`getCoveredWidth :1186-1189`), krycie 1, mieszanka pięciu sekcji. Martwe: `NavDrawer.js`, `NavEdgeShim.js`, `CHIP_CLEAR_H`.

**Keepery wykonujące `Outliner`:** `ground_troops_reachable_smoke` (T3 — prawdziwy `draw` + `hitTest`),
`vessel_status_label_smoke` (T4 — kubełek). Odwołania przez geometrię lub tekst: `combat_watch_frame` T7a (Outliner 150
w prostokącie bezpiecznym kadru), `combat_follow_centre` (`OUTLINER_W`), `overlay_tab_entry` T7,
`system_exploration_canon`, `map_vessel_panel_compact` (komentarze).

### 3.2 A2 — zaznaczenie i focus na mapie 3D `[code]`

**Ścieżka kliku.** `window click` (`GameScene.js:5449`) → `uiManager.handleClick` (`UIManager.js:1956-2058`);
gdy zwróci `false` → `threeRenderer.handleClick(x, y)` (`GameScene.js:5480`) **oraz** `_handleTacticalLeftClick(e)`
(`:5485`, definicja `:5976`). Dwuklik to osobny nasłuch (`:5596-5634`). To nie jest jedno miejsce — w jednym geście
biegną dwa handlery i dwa pickery statku (`ThreeRenderer.js:3108`: `_hoverVesselId ?? _getVesselAtScreen(…, 40)`;
`GameScene.js:5995`: `_getVesselAtScreen(…, 40)`).

**Stan dziś — co robi pierwszy klik:**

| Powierzchnia | Obiekt | Dziś | Kamera |
|---|---|---|---|
| mapa 3D | własny statek | `vessel:focus` (`ThreeRenderer.js:3108-3111`) + zaznaczenie (`GameScene.js:6002`) → panel statku | **tak** (śledzi) |
| mapa 3D | wrogi statek | `vessel:focus` (`:3108-3111`); zaznaczenia brak (`GameScene.js:6005`) | **tak** |
| mapa 3D | stacja | `station:focus` + `station:selected` (`:3129-3130`) | **tak** |
| mapa 3D | ciało | `body:selected` (`:3139`) → karta `BottomContext` + kamera + auto-zoom (`:1004-1041`); zaznaczenie statków czyszczone (`GameScene.js:6007`) | **tak** |
| mapa 3D | pustka | `body:deselected` (`:3141`) → `focusOn(gwiazda)` (`:1043-1060`) + `clearSelection` | **tak** (na gwiazdę) |
| mapa 3D, dwuklik | statek / ciało z kolonią | `vessel:focus` (`GameScene.js:5608`) / `switchActiveColony` + `openPanel('colony')` (`:5619-5628`) | tak / overlay |
| Outliner | statek | `setSelectedVesselId` + `vessel:focus` (`Outliner.js:699-700`) | **tak** |
| Outliner | kolonia (nazwa) | zmiana układu + `switchActiveColony` + `colony:switched` + `camera:focusTarget` (`:730-737`) → `body:selected` (`GameScene.js:3609-3615`) | **tak** |
| Outliner | stacja | zmiana układu + `station:selected` + `station:focus` (`:743-748`) | **tak** |
| Outliner | nagłówek układu | `switchActiveSystem` tylko gdy INNY układ (`:714-716`) | kadr układu |
| etykiety mapy | plakietka własna | samo zaznaczenie (`MapLabelLayer.js:521-526`) | nie (drugiego kliku brak) |
| etykiety mapy | plakietka wroga | `vessel:focus` (`:517-520`) | **tak** |
| etykiety mapy | etykieta stacji | `station:selected` + `station:focus` (`:549-550`) | **tak** |
| Dok taktyczny | wiersz statku | zaznaczenie + `pingVessel`; dwuklik w oknie 300 ms → `vessel:focus` (`TacticalDock.js:40, 632-651`) | nie / dwuklik tak |
| klawiatura | Tab | `setSelectedVesselId` + `vessel:focus` (`UIManager.js:601-620`) | tak |

**Wnioski.**
- **Statek i stacja: zaznaczenie i kamera to już osobne zdarzenia** (`setSelectedVesselId` / `vessel:focus`;
  `station:selected` / `station:focus`) — producenci emitują je razem. Rozdzielenie = warunkowa emisja u producenta.
- **Ciało: jedno zdarzenie niesie oba znaczenia.** `body:selected` ma 13 emitentów (`ThreeRenderer` ×2 — klik `:3139`
  i fokus zadokowanego statku `:1192`, `GameScene` ×4 — przekaźnik `camera:focusTarget` `:3613` i trzy starty
  scenariusza / intro, `BottomContext:537`, `EventLogOverlay` ×2, `FleetManagerOverlay` ×2, `FleetTabPanel` (martwy
  plik), `ObservatoryOverlay`) i 4 słuchaczy (`ThreeRenderer:1004`, `UIManager:731`, `BottomContext:77`,
  `PlayerActionSystem:28`). W `ThreeRenderer` pole **`_focusEntityId` jest dwufunkcyjne**: cel kamery
  (`_updateCameraFocus :2195-2205`) i wizualizacja zaznaczenia (złota orbita `:2666-2669`, wyjątki filtra orbit `:1223`,
  `:1232`, `:2610`, znaczniki kolonii `:1065`, `:3338`, zasłona obserwatorium `:6871-6873`). Rozdzielenie D-UI-5 dla ciał
  wymaga osobnego pola zaznaczenia — 8 odczytów do przepięcia.
- **Licznik D-UI-5** (mapa 3D, oba outlinery, etykiety mapy — leżą NA mapie): **16 miejsc w 5 plikach** (+1 w Doku
  taktycznym przy decyzji 2c) — `ThreeRenderer.handleClick` ×3 gałęzie, słuchacze `body:selected` i `body:deselected`
  ×2, nowe pole zaznaczenia (8 odczytów, jeden krok), `GameScene` dwuklik ×2, `Outliner` ×4 (statek, kolonia, stacja,
  układ), `MapLabelLayer` ×3, `BottomContext:537` (przywrócenie karty z doku też dziś rusza kamerę).
- **Sprostowanie po U1 (2026-10-19; pre-flight i sesja kodu U1 — `kosmos-handover/ui-u1/HANDOVER_U1.md` §1; linie przy
  `d1f2158`).** Licznik się zgadza (16 miejsc w 5 plikach + 1 w Doku), opis — nie we wszystkim:
  (1) „8 odczytów” `_focusEntityId` do przepięcia = **7 miejsc / 9 odczytów** (`:1065`, `:1223`, `:1232`, `:2610`,
  `:2666`, `:3338`, `:6871-6873` — trzy odczyty); odczyty kamery (`_updateCameraFocus :2195-2204`) i blokada podglądu
  obserwatorium zostają na `_focusEntityId`.
  (2) **Celem kliku na mapie w zwykłej grze jest przezroczysty `#planet-canvas`** (legacy PlanetScene, nigdy
  nieotwierany), nie `#event-layer`: reguła `#game-container canvas { … display: block }` (`index.html:24-30`,
  specyficzność 1-0-1) wygrywa z `#planet-canvas { z-index: 4; display: none }` (`:33`, 1-0-0), a z-index 4 leży nad
  `#event-layer` (3) — zmierzone (`elementFromPoint` = `planet-canvas`). Żywa jest więc gałąź canvas
  `_handleTacticalLeftClick` z własnym pickerem `_getVesselAtScreen(40)` (najbliższy statek, a renderer brał najpierw
  statek najechany); gałąź z raycastem sceny biegnie tylko przy innym celu kliku — np. ekran ładowania (`#loading-screen`,
  z 9999), który w headless wisi ~20 s po wczytaniu. Pomiar wstępny U1 („klik trafia w DIV — gałąź canvas martwa”)
  złapał właśnie ekran ładowania — poprawione przed bramką (`tools/restage_C3_U1.sh`); Finding 484.
  (3) Wiersz tabeli „ciało → zaznaczenie statków czyszczone (`GameScene.js:6007`)” jest PRAWDZIWY dla zwykłej gry
  (gałąź canvas) — U1 tego nie zmienia (bramka U1, „do potwierdzenia” 11).

**„Przejdź do układu" istnieje jako funkcja.** `StarSystemManager.switchActiveSystem(id)` (`:144-174`) →
`ThreeRenderer.switchSystem` → `_disposeAllMeshes` (zeruje `_focus*` `:1459-1461`) → `initSystem` → `_frameActiveSystem`
(`:4161-4164`) → `ThreeCameraController.frameSystem(maxOrbitAU)` (`:163-172`): cel (0,0,0) = gwiazda, dystans
`clamp(maxAU × 20, 70, 450)`, kąty 0,3 / 1,1 — dokładnie „domyślny widok z odległości na gwiazdę". Po przełączeniu nic
innego kamery nie rusza (`system:switched` → `switchActiveColony` emituje tylko `resource:requestSnapshot`;
`FleetManagerOverlay:516-523` zeruje wyłącznie mapę 2D).
⚠ Działa tylko przy ZMIANIE układu: klik w bieżący układ jest no-opem (`Outliner.js:714`, `MapLabelLayer.js:539-542`).
Reset bez zmiany układu to `KeyH` (`GameScene.js:4826-4829`, `resetToCenter` `ThreeCameraController.js:155-158`) —
w `civMode` martwy (Finding 471), poza nim niepełny (Finding 472).

### 3.3 A3 — „okno statku z opcjami" `[code]`

- To jest **pływający panel mapy ze slice'u 258 w trybie kompaktowym B1**: render `FleetManagerOverlay.drawVesselPanel`
  (`UIManager.js:2399`), geometria `_vesselPanelBounds` (`:460-481`: szerokość 300, wysokość 300 / 360 przy wyborze celu,
  kotwica przy statku `resolveVesselPanelAnchor`, przeciąganie `FloatingPanel`), klik `:1986`, flaga
  `mapVesselPanelCompact: true` (`GameConfig.js:244`, `67f6af4`).
- Otwiera go **zaznaczenie** N==1: `_mapSurface()` → `resolveMapSelectionSurface` (`MapVesselPanelLogic.js:25-31`).
  N≥2 → `FleetGroupPanel`; flota → `FleetCommandPanel` (`ui:fleetSelectionChanged`, `UIManager.setSelectedFleetId :577-595`).
- **Focus nie jest sklejony z otwarciem panelu, tylko z gestem kliku.** Panel czyta wyłącznie `ui:selectionChanged`,
  kamera słucha wyłącznie `vessel:focus` (`ThreeRenderer.js:1157`). D-UI-5 dla statków nie dotyka panelu.
- „Dzisiejsze menu floty" (D-UI-7): `setSelectedFleetId` wołane wyłącznie z Dowództwa — wiersz floty
  (`FleetManagerOverlay.js:2044-2052`: przełącznik „drugi klik odznacza" + mutex czyszczący zaznaczenie statków),
  tworzenie floty (`:4694`), przypisanie (`:4743`). Mapa ani Outliner floty dziś nie wybierają.
- Statek zadokowany nie ma sprite'a ⇒ panel stoi w kotwicy zapasowej przy prawej krawędzi obszaru mapy
  (`MapVesselPanelLogic.js:42-44, 57-60`, `resolveVesselPanelAnchor`) — po U3 to miejsce zajmie prawy outliner.

### 3.4 A4 — źródła danych dla lewego outlinera `[code]` `[measured]`

**(i) „Odwiedzony"** — kanon `utils/SystemExploration.js` (fail-closed), prawda w `galaxyStar.explored`
w `galaxyData.systems`. Jedyny pisarz `markSystemExplored` ma **jednego wołającego**: `VesselManager._tickInterstellar:2979`
(przylot międzygwiezdny statku GRACZA, `!isEnemyVessel`). Dom — z definicji (`HOME_SYSTEM_ID`; rekord domu
`GalaxyGenerator.js:122-134`). Zapis: `galaxyData` w całości (`SaveSystem.js:218`), wczytanie `GameScene.js:2151`.
⇒ **„odwiedzony" ≡ „dotarł tam statek gracza" — bez nowego stanu.**
⚠ Zmierzone: zapisy sprzed naprawy 186 niosą układy odwiedzone jako niezbadane — ZF gy120 `sys_024` (dwie kolonie
gracza) i Polonia gy79 `sys_036` (statek gracza) mają `galaxyStar.explored = false` przy lustrze `sysData.explored =
true` (Finding 480). Reguła widoczności musi dodawać układy z własną kolonią / placówką / stacją (D-UI-2 grupa 2);
układ z samym statkiem gracza w takim zapisie zostanie niewidoczny, dopóki dane nie zostaną wyleczone.

**(ii) „Zeskanowany"** — `ObservatorySystem.getSystemScanResult(id)` → `{ tier, counts }` (`:488-490`; zapis wyniku `:525`;
serializacja `:716`, odczyt `:766`). Tier 1 = liczba planet (Lv2), 2 = + księżyce (Lv3-4), 3 = wszystkie ciała (Lv5+)
(`:405-411`). **Wynik niesie LICZBY, nie listę ciał**, i nie oznacza układu jako zbadanego. „Zeskanowany" i „odwiedzony"
to dwa osobne magazyny. ⚠ Poziom obserwatorium to maksimum po WSZYSTKICH koloniach gracza (`getMaxObservatoryLevel :118`,
Finding 191) — nie „obserwatorium w home sys".

**(iii) Ciała** — encje istnieją od generacji układu (`StarSystemManager.generateAndRegister :96-136`); lista
`EntityManager.getByTypeInSystem(type, systemId)` (`EntityManager.js:82-84`). Wiedza o ciele: `body.explored` (zgrubnie:
skan ciała obserwatorium `ObservatorySystem._completeBodyScan :373-386`, rekonesans `MissionSystem:2698, :2738`)
i `body.analyzed`. ⚠ **Mapa 3D rysuje WSZYSTKIE ciała odwiedzonego układu niezależnie od `explored`**
(`StarSystemManager.js:160-167`) ⇒ „tylko ciała realnie odkryte" z D-UI-3 zawęża LISTĘ, nie mapę (decyzja 5).

**(iv) Odległość** — `galaxyStar.distanceLY` gotowe w rekordzie, liczone od domu w (0,0,0) (`GalaxyGenerator.js:122-134,
180, 197`); dla dowolnej pary `InfluenceMath.distanceLY` (`:34-39`). Galaktyka: 72 układy, do 22 ly od domu (`:17-19`).

**Werdykt A4:** D-UI-3 wykonalna **bez nowego stanu w zapisie** (odwiedziny, skany i wiedza o ciałach już są w zapisie);
stan zwinięcia (D-UI-4) i widoczności outlinerów (D-UI-1) — wyłącznie sesja UI.

**Pomiar na zapisach właściciela** (sonda read-only bez silnika, `kosmos-handover/ui-phase-a/tools/measure2.mjs`):

| Zapis | gy | wersja | Odwiedzone obce | Zeskanowane | Kolonie gracza (pełne / placówki) | Ciała na układ (planety + księżyce) |
|---|---|---|---|---|---|---|
| Polonia r79 | 78,7 | v101 | 6 | 0 | 6 (4 / 2) | 14–31; **2 z 6 odwiedzonych** (`sys_044`, `sys_008`) mają 0 rozpoznanych ciał |
| Orcs r67 | 66,6 | v99 | 6 | 15 | 7 (4 / 3) | 22–31 |
| Zjedn. Federacja r120 (3) | 120,5 | v101 | 9 | 7 | 11 (8 / 3) | 14–33 |
| United Federation r60 | 60,5 | v101 | 0 | 0 | 1 | linia testu ekonomii AI |
| Pikaczu r67 / fixture GATE-S4 gy60 | 67,2 / 60,1 | v101 | 0 | 0 | 1 | linia testu ekonomii AI |

### 3.5 A5 — statki dla prawego outlinera `[code]` `[measured]`

- **Lista:** `vesselManager.getAllVessels()` + `!isEnemyVessel` (`UIManager._getAllPlayerVessels :2066-2073`). Wraki —
  `isWreck` (dzisiejszy Outliner pomija, `Outliner.js:378`).
- **Flota:** `fleetSystem.listFleets()` / `getFleet` / `getVesselFleet` (`FleetSystem.js:548-560`); członkostwo
  autorytatywnie `fleet.memberIds[]` (`:12`), lustro `vessel.fleetId`.
- **„W drodze":** `systemId === null` wyłącznie w fazie `warp_transit` (`VesselManager._resolveSystemId :326-333`;
  zerowanie przy starcie skoku `:1014`); `buildShipEntry` zachowuje `null` (`FleetPictureLogic.js:295`). Trasa
  wieloprzeskokowa i composite (`pendingOrder`) między skokami stoją W układzie (mają `systemId`).
- **Statusy (D-UI-9):** jedno źródło priorytetu `FleetPictureLogic.buildShipEntry` (`:198-341`) — ton
  `combat > alert > move > mission > idle` (`:247-252`), alerty `stranded / combat / blocked / immobilized / lowFuel /
  damaged / awaitingFuel` (`_gatherAlerts :152-178`), token stanu z kanonu `VesselStatus`. Wejścia świata:
  `combatCheck` = `DeepSpaceCombatSystem._findActiveEncounterContaining` (`:1451-1457`), `isImmobilized` =
  `unpaidYears ≥ 2` (`VesselManager.js:84, 2410-2413`). Klucze i18n statusów istnieją PL + EN (`fleetPicture.state.*`,
  `fleetPicture.alert.*`, `pl.js:3743-3755`) — znacznik nie potrzebuje nowych kluczy.
- **Rola (D-UI-6):** `getPrimaryRole` (`Vessel.js:575-588`) → 7 ról `colony / assault / transport / warship / science /
  cargo / scout`; glify `ROLE_GLYPHS` (`FleetPictureLogic.js:29-38`); etykiety `fleetPicture.role.*` PL + EN
  (`pl.js:3805-3811`). `getRoleLabelPL` (`Vessel.js:590`) jest martwy (zero wołających).

**Rozmiary na zapisach właściciela** `[measured]`:

| Zapis | Statki gracza żywe (wraki) | Floty (członkowie) | Układy ze statkami | W doku | W skoku | Unieruchomione (utrzymanie) |
|---|---|---|---|---|---|---|
| Polonia r79 | 13 (0) | 0 | 4 | 7 | 0 | **9** |
| Orcs r67 | 17 (0) | 2 (1, 1) | 6 | 14 | 0 | 0 |
| Zjedn. Federacja r120 (3) | 26 (3) | 2 (3, 4) — **„Flota Wojenna I" w dwóch układach** | 7 | 13 | 0 | 0 |
| United Federation r60 / Pikaczu r67 | 3 / 3 | 0 | 1 | 3 | 0 | 2 / 3 |

**Wirtualizacja listy: niepotrzebna.** Największy zapis (ZF gy120) daje ~26 statków + 2 węzły flot + ~7 nagłówków
układów + do 4 nagłówków typów na układ ≈ 50 wierszy (≈ 900 px przy 18 px na wiersz wobec ~650 px wysokości obszaru ⇒
przewijanie i zwijanie układów, które już istnieją). Canvas w trybie natychmiastowym z clipem, jak dzisiejszy Outliner.

### 3.6 A6 — górna belka `[code]` `[derived]`

- **Komponent:** `TopResourceDrawer` (`src/ui/TopResourceDrawer.js`, 655 linii); tło i dolną krawędź belki rysuje
  `TopBar` (`TopBar.js:105-110`, `TOP_BAND_H 28`).
- **Rozwijanie dziś:** hover — `handleMouseMove :593-602` ustawia `_hovered` nad pasmem lub panelem, animacja `stepSlide`
  w `draw :188-189`, chowanie po `NAV_HIDE_DELAY`; klik w pasmo poza nazwą wymusza rozwinięcie (`:637-639`); klik nazwy
  kolonii → zmiana układu + `switchActiveColony` + `openPanel('colony')` (`:623-635`). Tooltipy tokenów też z hovera
  (`:603-613`).
- **Szerokość komórek — nie stała.** Token „przytula" ikonę + wartość + deltę (`_drawItem :365-408`); slot = największa
  widziana szerokość (`_hwSlot :353-360`) kluczowana `kolonia|token` (`:356`) ⇒ kolumny różnych wierszy listy nie są
  wyrównane (Finding 474); maksimum nie maleje w sesji. Przepełnienie: `if (tx > rightClip) break` (`:342`) — kredyty są
  dodawane jako ostatni token (`:164-169`), więc ucinane są pierwsze (Finding 475).
- **Format:** `_fmtNum :47-52` skraca od 1 000 (`1.2k`), zawsze z kropką dziesiętną, także w grze PL (Finding 479);
  delta `_fmtDelta :58-65`. Wzór formatu zależnego od języka jest w repo: `NavPeekCardLogic` (`fmtInt` / `fmtDec`,
  separator `,` / `.`, język jako parametr).
- **Cyfry tabularne:** font `'Space Mono', monospace` (`ThemeConfig.js:44`, Google Fonts `index.html:10`) — cyfry już mają
  stałą szerokość; Canvas 2D i tak nie ma `font-variant-numeric`. Rozjazd kolumn bierze się z DŁUGOŚCI napisów
  („9.9k" / „12.4k", znak, delta), nie z glifów.
- **Tokeny:** 10 wydobywalnych + 2 zbieralne + paliwo + nauka + energia + dobrobyt + kredyty (+ plakietka puli hubu) =
  **17 (18)** (`_colonyTokens :116-183`).
- **Budżet szerokości `[derived]`.** Szerokość logiczna `W = round(innerWidth / UI_SCALE)`, `UI_SCALE = min(PW/1280,
  PH/720)` (`UIManager.js:90, 99`) ⇒ **W = 1280 na każdym ekranie do 16:9 włącznie**. Pasmo na tokeny:
  `1280 − 6 (EDGE_R) − 16 (HINT_W przy >1 kolonii) − 4 − (200 LEFT_W + 6)` ≈ **1048 px** (zgodne z komentarzem `:42`).
  Komórka stała przy założonej metryce Space Mono 0,6 em (6,6 px na znak przy 11 px, 5,4 px przy 9 px), ikona 16 + 2:

  | Wariant komórki | Szerokość | × 17 tokenów | Mieści się w 1048 px? |
  |---|---|---|---|
  | wartość 5 zn. („12,4k") + delta 5 zn. | ~84 px | **~1430 px** | **nie** (ucięte 4–5 ostatnich: energia, dobrobyt, kredyty) |
  | wartość + strzałka trendu (1 zn.) | ~62 px | ~1055 px | tak, po zwężeniu strefy nazwy 200 → 190 px |
  | sama wartość | ~55 px | ~930 px | tak (zapas ~120 px) |

  → **decyzja 1.** Metrykę zmierzyć `measureText` w U0 (to jedyne założenie w tej tabeli).
- **Pomiar U0 `[measured]` (2026-10-18, `measureText` w Chrome 155; teczka `kosmos-handover/ui-u0/`).** ⚠ Belka NIE
  rysuje się w grze fontem Space Mono z `ThemeConfig` — `TitleScene` przy KAŻDYM rozruchu nakłada preset motywu ekranu
  tytułowego (`TitleScene.js:81-90`, `applyPreset` `:163-167`): 4 z 5 motywów → **Share Tech Mono 9/11** (5,94 px na
  znak przy 11 px = 0,54 em), „Neon Cyber" → **Rajdhani 10/12** (proporcjonalny: cyfry 3,80–6,24 px; „,", „k" węższe
  od cyfry). **Space Mono** (6,732 px = 0,612 em, nie 0,6) — wyłącznie preset `default` z ThemeOverlay (F7), do
  następnego rozruchu. Budżet wariantu 1(a) przed implementacją (`STOP_U0_BUDGET.md`), najgorszy realny przypadek
  (>1 kolonia, czip EN „⚔ Battles [12]", kredyty 7-cyfrowe; zapas w px, ujemny = nie mieści się):

  | Font | 1(a), czip w paśmie | 1(a), czip poza pasmem | (b) bez strzałek | maks. strefa nazwy przy czipie w paśmie |
  |---|---|---|---|---|
  | Share Tech Mono (domyślny) | −33,6 | +57,4 | +70,6 | 166 |
  | Rajdhani | −39,5 | +36,5 | +139,0 | 160 |
  | Space Mono (tylko F7) | −111,3 | −12,3 | −7,1 | 88 |

  W pasku zegara (jeden slot nawigacji, x 1092–1274 przy W = 1280) miejsca na czip też nie ma: klaster 159–172 px,
  wolne 0,2–12,8 px, czip 20–93 px (`STOP_U0_CHIP.md`). ⇒ **czip ⚔ na lewo od paska zegara (decyzja właściciela,
  opcja 1 — Finding 482)**; strefa nazwy 200 → podłoga 160 dynamicznie przy ujemnym budżecie, nazwa z wielokropkiem;
  szablony szerokości z `measureText` AKTYWNEGO fontu, z najszerszą cyfrą (w Rajdhani najszersza realna postać to
  „444,4", nie „44,4k"). Po implementacji, na zapisie Polonia r79 (18 tokenów — z plakietką puli hubu): Share Tech Mono
  17/17 zwykłych, strefa 200 · Rajdhani 17/17, 172 · Space Mono 16/17 (znika wyłącznie plakietka puli na końcu), 160;
  kolumny równe w 6 wierszach, kredyty w całości (`results/belt_dev_C3_pl/`).
- **Prawy koniec pasma (stan przed U0 — czip przeniesiony, Finding 482):** czip „⚔ Walki [N]" (`BottomBar.js:158-171`, x = `W − szer. − 8`, y 6–26) leży w belce
  dokładnie tam, gdzie D-UI-12 przypnie kredyty; tekst czipu zaszyty po polsku (Finding 481).
- **Blokada kamery:** `TopBar.isOver` = `y ≤ TOP_BAR_H (46)` (`TopBar.js:21, 813-815`) przy belce 28 px ⇒ martwy pas
  18 px pod belką dla przeciągania i zoomu kamery (Finding 476).

### 3.7 A7 — dolna belka `[code]`

- **Komponent:** `BottomNavBar` (`src/ui/BottomNavBar.js`, 299 linii), geometria `BottomNavBarLogic.bottomNavBarRect`
  (`x = 0`, `w = W − 6`, `h = BOTTOM_NAV_H 36`, dobity do listwy dziennika). **Canvas 2D — ramy rysuje `draw()`, CSS
  nie ma tu nic do rzeczy.**
- **Ramy (`draw :117-147`):** separatory między slotami (akcent 0,3, `:121-128`), boki (akcent 0,55, `:129-136`), górna
  listwa 2,4 px (akcent 0,55, `:137-147`, z luką pod wysuniętą kartą peek — logika szwu `:101, 113, 141-147`).
  W slocie: górna linia akcentu 2 px na aktywnym i przy hover (`:232-238`) — **wskaźnik stanu, nie rama**.
- Sąsiednie ramy poza literą D-UI-13: karta peek (`NavPeekCard.js:145-152`), pasek zegara „spójnie z dolnym nav"
  (`BottomControlBar.js:103-114`, obrysy przycisków `:146`).
- Keeper geometrii `fleet_clock_band_smoke` nie zależy od ram.

### 3.8 A8 — wydajność i odświeżanie `[code]`

- **Pętla UI** `UIManager._startDrawLoop :2185-2205` przerysowuje przy `_dirty || _animating || timeDirty` (gra biegnie —
  co 100 ms) `|| cameraMoved` (każda klatka ruchu kamery). Stan Outlinera jest składany od zera w każdym `_draw()`
  (`:2243-2303`); jedyny cache to `getAllColonies()` z flagą `_coloniesDirty` (`:2248-2250`).
- **Koszt:** `getByTypeInSystem` = filtr tablicy z cache typu (`EntityManager.js:69-84`); przy rozmiarach z A4/A5
  (≤ 10 układów, ≤ 33 ciał rozwiniętego układu, ≤ ~30 statków) przebudowa na klatkę to rząd setek odczytów. Dok taktyczny
  już dziś liczy `buildShipEntry` dla całej floty co klatkę.
- **Zdarzenia** (liczba emitentów w `src/`, bez testów): `colony:listChanged` 12 · `colony:founded` 2 ·
  `outpost:founded` 2 · `colony:destroyed` 1 · `colony:captured` 1 · `colony:capturedByPlayer` 1 · `system:generated` 1 ·
  `system:switched` 1 · `interstellar:arrived` 1 · `observatory:systemScanned` 1 · `observatory:discovered` 1 ·
  `expedition:reconProgress` 3 · `vessel:created` 9 · `vessel:wrecked` 5 · `vessel:destroyed` 2 · `vessel:docked` 6 ·
  `vessel:launched` 15 · `vessel:arrived` 9 · `vessel:orderIssued` 6 · `vessel:orderCompleted` 2 ·
  `vessel:orderCancelled` 5 · `vessel:engaged` 1 · `battle:resolved` 5 · `fleet:created` 1 · `fleet:disbanded` 2 ·
  `fleet:memberAdded` 1 · `fleet:memberRemoved` 1 · `fleet:renamed` 1 · `station:created` 2 · `station:destroyed` 1 ·
  `body:renamed` 2 · `entity:removed` 1 · `warpRoute:completed` 1 · `ui:selectionChanged` · `ui:fleetSelectionChanged`.
- ⚠ **Nie każda zmiana ma zdarzenie:** `vessel:renamed` — 0 emitentów (zmiana nazwy idzie żądaniem `vessel:rename`
  od UI), `fleet:membersChanged` — 0 (są `fleet:memberAdded/Removed`), `body.explored` ustawiane bez zdarzenia
  w `MissionSystem:2698, :2738`.
- **Rekomendacja:** tryb natychmiastowy, jak dziś — struktura i statusy liczone w `_draw()`. Pamięć podręczna struktury
  drzewa unieważniana zdarzeniami (+ tanie odświeżenie co ~0,5 s czasu realnego na zmiany bez zdarzeń) dopiero wtedy,
  gdy bramka pokaże koszt klatki. Tego nie przewiduję.

### 3.9 A9 — klawisze i i18n `[code]`

- **Zajęte w `civMode`:** `OverlayManager._keyMap` (`OverlayManager.js:19-45`): c, e, h, d, f, t, s, i, w, g, u, o, l, n,
  m, k (+ p przy fladze `populationOverlay`, domyślnie OFF). `GameScene` keydown (`:4717-4860`): Space, H (w `civMode`
  przechwycone przez skrót kolonii — 471), Y, Digit1–5, `[` `]`, F7, Ctrl+Shift+R, Tab, Esc, Enter; przytrzymanie Ctrl
  (wszystkie etykiety) i Shift (czysty widok). Q/W/E w `switch` działają tylko poza `civMode`. Overlaye mają własne
  klawisze tylko gdy otwarte (`ColonyOverlay.handleKeyDown`: i, Delete, S, WASD).
- **Wolne:** a, b, j, q, r (bez modyfikatorów), v, x, z, `,`, `.`, `/`, `;`, `'`, `` ` ``, cyfry 6–0, `Home`, `End`,
  F1–F4, F6, F8–F10.
- **Propozycja (§7.16):** **`B`** — oba outlinery naraz; **`,`** — lewy; **`.`** — prawy. `e.code` (`KeyB` / `Comma` /
  `Period`) nie zależy od układu klawiatury PL / EN; znaki `<` `>` na tych klawiszach podpowiadają stronę; bez
  modyfikatorów, bo Ctrl i Shift to tryby przytrzymania. Reset kamery (471) → **`Home`**.
- **i18n:** baza `pl = en = 3458`, `check-i18n` PASS (2026-10-18). Bez nowych kluczy da się zrobić statusy
  (`fleetPicture.state/alert.*`), role (`fleetPicture.role.*`) i komunikaty pustek (`outliner.noShips` itd.). Nowe pary
  (szacunek ~12–15 dla całego arca): nagłówki lewego („UKŁADY [n]"), sekcja „W drodze" (⚠ `outliner.fleetInTransit` =
  „W locie" / „In transit" znaczy lot W układzie — nie reużywać), 4 kubełki typów, czip ⚔, podpowiedź klawiszy.
  `check-i18n` czyta `t('…')` także w komentarzach — keepery z przykładami kluczy muszą je składać dynamicznie.

---

## 4. Cięcie na slice'y

### 4.0 Kolejność: zostaje U0 → U1 → U2 → U3

Pomiary nie wskazują innej kolejności. Trzy zależności, które ją utrwalają:
1. **U0 jest niezależny** (belki) i ma najmniejszą bramkę — dobry rozruch.
2. **U1 przed U2/U3:** oba outlinery wołają jedną funkcję reguły. U1 obejmuje też DZISIEJSZY prawy Outliner (statek,
   kolonia, stacja, układ), więc reguła jest globalna od razu, a U3 ją dziedziczy.
3. **U2 przed U3 — twarda zależność:** dzisiejszy prawy Outliner jest jedyną drogą do mapy obcego ciała z desantem
   (naprawa `486982c`) i niesie kolonie oraz stacje. U2 musi je przenieść do lewego (decyzja 3), ZANIM U3 zrobi z prawego
   listę samych statków — inaczej otworzy się okno regresji.
   U2 wprowadza też rezerwę lewej krawędzi dla pływających paneli, które dziś kotwiczą się w lewym dolnym rogu
   (`FleetGroupPanel.js:119`, `FleetCommandPanel.js:128`, `PanelDock.js:48`).

### 4.1 U0 — belki (D-UI-11, D-UI-12, D-UI-13)

**Koszt:** 3 commity kodu + 1 dokumentacji · **bramka:** jedna, mała (~15 min) · **prerekwizyt:** decyzja 1.
`TopResourceDrawer`, `BottomNavBar`, `TopBar` i `BottomControlBar` importują się pod node (sprawdzone) ⇒ keepery
wykonaniowe.

- **U0-1 (D-UI-13).** `BottomNavBar.draw`: usunąć separatory, boki i górną listwę (`:117-147`); logika szwu pod kartą
  peek traci powód. Pasek zegara wg §7.15. **Keeper NEW:** `draw` na atrapie ctx z rejestracją wywołań — zero linii
  między slotami, zero listwy pełnej szerokości, wskaźnik aktywnego jest; fail-first na HEAD widzi ramy.
  `fleet_clock_band_smoke` bez zmian (geometria nietknięta).
- **U0-2 (D-UI-11).** `TopResourceDrawer`: rozwinięcie z kliku (stan „otwarte") zamiast z hovera; hover zostaje tylko dla
  tooltipów; zamknięcie wg §7.13. **Keeper:** `handleMouseMove` nad pasmem nie rozwija, `handleClick` przełącza, klik
  nazwy dalej otwiera kolonię.
- **U0-3 (D-UI-12 + Findingi 474, 475, 479, 481; opcjonalnie 476).** NEW `src/ui/TopBarFormatLogic.js` (czysty: format
  liczby wg języka i progu 10 000, szablony szerokości, plan slotów z kredytami przypiętymi do prawego końca) +
  `TopResourceDrawer` na nim; czip ⚔ przez i18n i poza slotem kredytów; `TopBar.isOver` → `TOP_BAND_H`.
  **Wykonanie (2026-10-18):** czip przeniesiony do `BottomControlBar` — na lewo od paska zegara, z własnym hit-testem
  (opcja 1, Finding 482); strefa nazwy 200 → 160 dynamicznie (pomiar §3.6).
  **Keeper:** tabela formatu PL/EN; x tokenu k identyczne w każdym wierszu listy (wykonanie `_drawRow` na atrapie ctx,
  dwie kolonie o różnych liczbach); kredyty narysowane przy 18 tokenach i dużych liczbach.
- **Bramka U0** (przeglądarka): hover nie rozwija · klik rozwija i zwija · kolumny równe przy 3+ koloniach ·
  12 400 → `12,4k` (PL) / `12.4k` (EN), 9 999 w całości · kredyty w całości także obok czipu ⚔ · pasek nawigacji bez ram,
  aktywny slot widoczny · karty peek i zegar bez regresji.
- **Ryzyko:** niskie; zapis bez zmian (v101); i18n +2–3 pary.
- **Bramka U0 u właściciela — 2026-10-19: PASS 21/21** `[measured: odczyt właściciela]`. Scenariusz
  `kosmos-handover/ui-u0/gate/GATE_U0.md` (21 kroków K0–K12, kopia zapisu Polonia r79, gra po polsku); kod U0 zestagowany
  (drzewo indeksu = C3 `5488d754` — te same pliki, które weszły w trzy commity niżej). Okno właściciela wyższe niż 720,
  więc liczby bezwzględne inne niż u walidatora (1280×720); relacje z dokumentu bramki zgodne:
  `czip.x + czip.w + 4 = zegarX` (K8) · `czipY = góraKarty − 20` przy karcie „Dowództwo” (K9) · `zegarY = góraKarty − 20`
  przy karcie „Nauka” (K9b). Punkty „do potwierdzenia” 1–6 przyjęte bez zmian: klik w nazwę kolonii zwija listę ·
  liczby wyrównane do prawej w komórce · próg strzałki trendu 0,05 na rok (dobrobyt 0,5) · wygląd czipu (tło + czerwona
  obwódka, szerokość = tekst + 14 px, 4 px od paska zegara) · Space Mono: strefa nazwy 160 z wielokropkiem, odpada
  plakietka puli · klik poza listą zwija ją także przy kliku w inny panel (lista nie pochłania kliku).
  Obserwacja właściciela z bramki (poza U0): po odznaczeniu ciała kamera leci na gwiazdę i kończy za blisko („wnętrze
  słońca”) — Finding **473**, wymóg zapisany do U1 (§4.2, §5 decyzja 2 (a)).
- **Zamknięcie U0 — 2026-10-19:** `tools/commit_U0.sh` — `7d8231b` (U0-1, drzewo `2a2cf6a8`) · `97dd86c` (U0-2,
  `84863ff0`) · `92f1b33` (U0-3, `5488d754`); drzewo każdego commitu = `patches/trees.txt`, przecelowań keeperów brak.
  Zamknięte w §6: ✅ **474** · **475** · **476** · **479** · **481** · **482** (wszystkie w U0-3). **483** → U2 (§7.18).
  Keepery NEW: `ui_bar_frames_smoke` 13/13 · `ui_colony_list_click_smoke` 11/11 · `ui_top_belt_slots_smoke` 82/82.
  Sweep 319 → 320 → 321 → **322/322, 0 FAIL** (łańcuch w klonie; na `92f1b33` w repo gry — **322/322**), `check-i18n`
  PASS pl = en = **3460** (+2: `combat.hudChip`, `combat.hudChipN`); zapis v101 bez migracji.

### 4.2 U1 — reguła klik/focus (D-UI-5)

**Koszt:** 3–4 commity kodu + 1 dokumentacji · **bramka:** jedna (~20 min) · **prerekwizyt:** decyzja 2.

- **U1-1.** NEW `src/ui/ClickIntentLogic.js` (czysty: klucz celu, `resolveClickIntent(target, selection) → 'select' |
  'focus'`, definicja „drugiego kliku" wg §7.7) + keeper (tabela). Jedna funkcja `resetToSystemView()` w `ThreeRenderer`:
  zeruje WSZYSTKIE `_focus*`, `_autoFocus`, `_watch`, potem `frameSystem` — naprawia 472; klawisz `Home` (471);
  ta sama funkcja dla kliku w bieżący układ (§7.9).
- **U1-2.** `ThreeRenderer`: osobne pole zaznaczenia ciała (8 odczytów `_focusEntityId` przepiętych na wizualizację);
  `body:selected { entity, focus }` z `focus` domyślnie `true` — emitenci spoza zakresu (Dziennik, Obserwatorium,
  Dowództwo, starty scenariusza) zostają bez zmian; słuchacz `:1004-1041` rusza kamerę tylko przy `focus !== false`;
  odznaczenie wg decyzji 2a. ⚠ Podgląd obserwatorium używa `_focusEntityId` jako twardej blokady kamery (`:2163-2167`,
  `:3734`) — to pole zostaje polem KAMERY.
- **Wymóg z bramki U0 (2026-10-19, obserwacja właściciela — Finding 473).** Dziś po odznaczeniu ciała kamera leci na
  gwiazdę i kończy za blisko („wnętrze słońca”). **Po odznaczeniu kamera stoi; żaden automatyczny ruch kamery nie kończy
  się bliżej gwiazdy niż kadr układu (`frameSystem`).** Do audytu U1: lista automatycznych ruchów kamery z celem na
  gwieździe (dziś m.in. `body:deselected` → `focusOn(gwiazda)`, `ThreeRenderer.js:1043-1060`; rodzina V-268 — kamera
  wchodzi do wnętrza tarczy) i zakres zdania wobec fokusu na ciele leżącym bliżej gwiazdy niż kadr układu.
- **U1-3.** Producenci w zakresie: `ThreeRenderer.handleClick` (statek / stacja / ciało; jeden picker dla gestu zamiast
  dwóch), `GameScene` dwuklik (2b), `MapLabelLayer` (plakietka własna / wroga, etykieta stacji), dzisiejszy `Outliner`
  (statek, kolonia, stacja; klik w bieżący układ = reset), `BottomContext:537` (przywrócenie karty bez kamery), wróg (2d),
  Dok taktyczny (2c).
- **Keepery:** NEW `click_focus_rule_smoke` — tabela + wykonanie `Outliner.hitTest`, `MapLabelLayer.handleClick`,
  `TacticalDock._onHit` (wszystkie trzy importują się pod node). `ThreeRenderer` i `GameScene` się nie importują ⇒ ich
  część pinem źródłowym + bramką. Przecelowania: `dok_taktyczny_4f` 4.6 (tylko przy 2c, za zgodą właściciela);
  `s34b_bottomcontext` powinien zostać zielony (`body:selected` dalej zdejmuje minimalizację).
- **Bramka U1** (przeglądarka): statek, ciało, stacja — pierwszy klik otwiera okno bez kamery, drugi klik rusza kamerę ·
  pustka i ✕ wg 2a (kamera stoi; żaden automatyczny ruch kamery nie kończy bliżej gwiazdy niż kadr układu) · dwuklik
  wg 2b · wróg wg 2d · dzisiejszy Outliner tak samo · klik w bieżący układ = domyślny widok · `Home`.
- **Ryzyko:** średnie — zmienia „czucie" mapy w każdym miejscu.
- **Bramka U1 u właściciela — 2026-10-19: PASS** `[measured: odczyt właściciela]`. Scenariusz
  `kosmos-handover/ui-u1/gate/GATE_U1.md` (32 kroki K0–K30 + K23c, kopia zapisu Polonia r79, gra po polsku); kod U1
  zestagowany (drzewo indeksu = C3 `7a02aac1` — te same pliki, które weszły w trzy commity niżej). Okno właściciela
  wyższe niż 720 — liczby bezwzględne inne niż u walidatora (1280×720), wszystkie relacje z dokumentu bramki zgodne
  (`kameraStoi`, `sledzenie`, `wKadrze`, `dystansCelu`, `kameraOdGwiazdy`). **K6** (zamknięcie karty ciała) pokryty
  ścieżką `body:deselected` z K3 (klik w pustkę) — właściciel nie znalazł w karcie „✕” (obserwacja 1). Punkty „do
  potwierdzenia” 1–12 przyjęte bez zmian.
  **Obserwacje właściciela z bramki** — pomiary 2026-10-19 w prawdziwej grze na tej samej kopii zapisu, drzewa
  `d1f2158` / C2 / C3 w świeżych klonach (`kosmos-handover/ui-u1/post_gate/`):
  1. **Karta ciała bez widocznego „✕”.** Zamknięcie karty to glif **„−”** — trzeci w nagłówku, za „✏” i „▼”
     (`BottomContext.js:208-220`), rysowany ZAWSZE (nie na hover); karta jest w całości dociskana do obszaru mapy
     (`computeFloatingPlacement`, `BottomContextLogic.js:36-38`), więc strefa zamknięcia nie wychodzi poza ekran —
     zmierzone przy 1280×720, 1600×900, 1920×969, 1920×1080 i 2560×1329 (np. 1920×1080: 24×24 px, x 1367, y 659 przy
     karcie Mstow w kadrze układu). Dokument bramki nazwał ten glif „✕” — błąd dokumentu, nie kodu. ⚠ Glif myli: „−”
     wygląda jak minimalizacja, a `StationPanel` ma w tym samym miejscu „✕” (`StationPanel.js:144`) — kandydat do
     zaparkowanej reformy pływających okien (§1); numeru nie nadano.
  2. **Po Home przy zaznaczonym ciele renderer bez zaznaczenia, karta „Mstow”** → Finding **486**. Zmierzone (C2, C3):
     Home, klik w aktywny chip i klik w nagłówek bieżącego układu ZOSTAWIAJĄ zaznaczenie po obu stronach
     (`_selectedEntityId` = Mstow, karta „Mstow”), także po fokusie. Rozjazd robi PRZEŁĄCZENIE układu: przebudowa sceny
     zeruje `_selectedEntityId` bez `body:deselected`, karta zostaje — i rozjazd trwa po powrocie do układu i po Home
     (stąd „po Home”). Tak samo na `d1f2158` (wtedy pole `_focusEntityId`). **Rozstrzygnięcie z pomiaru:** reset
     zostawia zaznaczenie („do potwierdzenia” 4, `resetToSystemView`); rozjazd zamyka przełączenie układu — 486 → U2.
  3. **Po odznaczeniu znika ikona kolonii Mstow** — ⚪, **NIE regresja** przepięcia odczytów; bez numeru. Znikają ikony
     budynków na tarczy (`ColonyBuildingMarkers`, 48 sprite'ów); plakietka „🏠 Mstow 111 POP” zostaje. Na `d1f2158`
     ten sam `body:deselected` → `_colonyMarkers.hide()` zdejmuje je w tej samej chwili (48 → 0), a z kamerą
     odstawioną w miejsce sprzed odznaczenia obraz jest identyczny jak na C2 i C3 (ikony 0, plakietka jest, orbita
     domyślna). Przed U1 tego nie było widać, bo kamera odlatywała w tarczę gwiazdy — U1 to odsłania. Czy ikony
     budynków mają zostać przy bliskiej kamerze bez zaznaczenia — decyzja projektowa poza U1.
  4. **Trudno kliknąć tarczę planety, gdy obok są sprite'y statków** → Finding **487** (do rozważenia w U2 / U3; w U1
     bez zmian).
  5. **Chipy układów w lewym górnym rogu** — właściciel potwierdza usunięcie w U2: **§7.18 podpisane** (2026-10-19).
- **Zamknięcie U1 — 2026-10-19:** `tools/commit_U1.sh` — `4a645eb` (U1-1, drzewo `3bf13ccd`) · `be52d8a` (U1-2,
  `d3b5670c`) · `d8cfe62` (U1-3, `7a02aac1`); drzewo każdego commitu = `patches/trees.txt` (ten sam łańcuch przed
  skryptem na tymczasowym indeksie — zgodny). Przecelowanie `dok_taktyczny_4f` 4.6 (decyzja 2c) w U1-3; innych brak.
  `0c4b30b` — komentarz nagłówka `ThreeCameraController.js` („H = reset” → Home; plik spoza listy §4.2).
  Zamknięte w §6: ✅ **471** · **472** (U1-1) · **473** (U1-2) · **478** (U1-3 — ścieżka Outlinera i mapy; Tab → U3,
  §4.4). Keepery: NEW `click_focus_rule_smoke` 71 → 89 → **160/160** (C1 → C2 → C3); `dok_taktyczny_4f` **31/31**;
  `s34b_bottomcontext` **14/14** bez zmian. Sweep 322 → **323/323, 0 FAIL, 31 advisory** (na `d8cfe62` w repo gry —
  **323/323**); `check-i18n` PASS pl = en = **3460** (bez nowych kluczy); zapis v101 bez migracji.

### 4.3 U2 — lewy outliner (D-UI-1 lewy, D-UI-2, D-UI-3, D-UI-4, D-UI-10 dla ciał)

**Koszt:** 4 commity kodu + 1 dokumentacji · **bramka:** jedna · **prerekwizyty:** U1, decyzje 3, 4, 5.

- **U2-1.** NEW `src/ui/SystemTreeLogic.js` (czysty): widoczność = dom ∨ własna kolonia / placówka / stacja ∨
  `isSystemExploredData`; kolejność D-UI-2 (populacja → placówki → `distanceLY`, §7.4); ciała wg decyzji 5; stacje pod
  ciałem-matką; znaczniki 🪖N / ⏳N wg decyzji 3. **Keeper** na danych w kształcie zapisów właściciela (ZF `sys_024`,
  Polonia `sys_044` / `sys_008`).
- **U2-2.** NEW `src/ui/LeftOutliner.js` + montaż w `UIManager` (rysowanie, klik, hover, kółko, `isOverUI`), zwijanie
  (sesja), podświetlenie wiersza (D-UI-10), reguła U1. NEW jedno źródło wcięć obszaru mapy (wzór
  `TacticalDock.getReservedHeight`) i przepięcie konsumentów: `FleetGroupPanel:119`, `FleetCommandPanel:128`,
  `PanelDock:48`, `BottomContext:92, 97`, `StationPanel` (granice), `_vesselPanelBounds` (granice obszaru
  `UIManager.js:474`), chipy układów, `watchSafeRect` (+ `leftW`, `CombatWatchLogic.js:97-101`; wołający
  `ThreeRenderer.js:6711-6715`).
  Przecelowania: `combat_watch_frame` T7a, `combat_follow_centre`.
- **U2-3.** Przeniesienie KOLONIE / stacje / JEDN. NAZIEMNE z prawego (decyzja 3), z zachowaniem drogi powrotnej desantu
  (`openPanel('colony', { colonyId })`); przecelowanie `ground_troops_reachable` T3 (intencja bez zmian). Chipy układów
  (`MapLabelLayer`, lewy górny róg: `CHIP_LEFT_M 12`, `CHIP_TOP 34`, `MapLabelLogic.js:386-390`) dublują lewy outliner
  i stoją w jego miejscu — wyłączyć albo przesunąć za jego prawą krawędź (§7.18).
- **U2-4.** Klawisze (§7.16), widoczność wg decyzji 4, lista kolonii z górnej belki rysowana NAD outlinerami (kolejność
  rysowania w `UIManager._draw`).
- **Bramka U2** (przeglądarka, zapis właściciela Polonia gy79 lub ZF gy120): kolejność i widoczność układów, zwijanie,
  klik / focus, panele floty i karta ciała nie wchodzą pod outliner, klawisze, kadr „Obserwuj" z lewym outlinerem.
- **Ryzyko:** średnie — przekrój przez 8 konsumentów geometrii i kadr walki (arc POLISH P2).

### 4.4 U3 — prawy outliner (D-UI-1 prawy, D-UI-6…D-UI-10)

**Koszt:** 3 commity kodu + 1 dokumentacji · **bramka:** jedna · **prerekwizyty:** U2, decyzja 6.

- **U3-1.** NEW `src/ui/ShipTreeLogic.js` (czysty): „W drodze" (§7.3), UKŁAD (kolejność z lewego) → TYP (§7.1), floty
  (decyzja 6), znacznik statusu (§7.2) z `buildShipEntry`. **Keeper** (m.in. ZF gy120: flota rozpięta).
- **U3-2.** `Outliner.js` przepisany na prawy outliner statków: zawsze widoczny, półprzezroczysty (koniec trybu drawer,
  triggera i `CHIP_CLEAR_H`), reguła U1, węzeł floty → `setSelectedFleetId` + mutex (§7.11), D-UI-10; `pingVessel`
  z terminem układu (Finding 477); Tab (`UIManager.cycleSelectedVessel`) przez regułę U1 — reszta Findingu 478 (zakres
  U1 zostawił Tab bez zmian: zaznacza i rusza kamerę naraz, statek z innego układu bez przełączenia); prawe wcięcie
  obszaru mapy (kotwica zapasowa panelu statku). Przecelowanie `vessel_status_label` T4.
- **U3-3.** Sprzątanie: EKSPEDYCJE i KOLEJKA (decyzja 3), martwe pola (`_drawerMode`, `getCoveredWidth` —
  `ColonyOverlay.js:1281`), i18n.
- **Bramka U3** (przeglądarka): grupowanie, „W drodze", węzły flot, znaczniki (czytelność 5 kolorów), synchronizacja
  z mapą, statek zadokowany, statek w innym układzie.

### 4.5 Suma

~14 commitów kodu + 4 dokumentacji; 4 bramki; zapis bez migracji (v101); i18n ~12–15 nowych par; keepery: 4 nowe
(U0, U1, U2-1, U3-1) + 5 przecelowań (`ground_troops_reachable` T3, `vessel_status_label` T4, `combat_watch_frame` T7a,
`combat_follow_centre`, `dok_taktyczny_4f` 4.6 — ten ostatni tylko przy 2c).

---

## 5. Decyzje właściciela (6) — wszystkie podpisane 2026-10-18

Tylko te, których nie da się wyprowadzić z D-UI-1…13. Resztę rozstrzygam domyślnie w §7.

### Decyzja 1 (U0) — D-UI-12: co z deltami w stałej komórce

**PODPISANA (2026-10-18): (a)** — strzałka ▲ / ▼ w kolorze zysku / straty zamiast liczby delty; liczba delty w tooltipie.
**Dopisek (2026-10-18, po pomiarze U0 — §3.6):** czip ⚔ → na lewo od paska zegara (opcja 1, Finding 482); strefa nazwy
kolonii 200 → podłoga 160 dynamicznie przy ujemnym budżecie, nazwa z wielokropkiem.

**Pomiar `[derived]`:** pasmo ~1048 px (W = 1280 do 16:9), 17 tokenów. Komórka z liczbową deltą ~84 px → ~1430 px
(ucięte 4–5 ostatnich tokenów); ze strzałką trendu ~62 px → ~1055 px (mieści się po zwężeniu strefy nazwy 200 → 190 px);
bez delty ~55 px → ~930 px.
- **(a) [rekomendacja]** Strzałka ▲ / ▼ (kolor zysku / straty) zamiast liczby delty; liczba w tooltipie. Informacja
  „rośnie / spada" zostaje, wszystko się mieści, zero nowych kluczy.
- **(b)** Delty wyłącznie w tooltipie — najwięcej luzu.
- **(c)** Delty liczbowe zostają, a z belki wypadają rzadkie Hv / Xe / Nt / H (do tooltipu lub rozwinięcia).

**Koszt:** (a) i (b) — ten sam commit U0-3; (c) — +0,5 commita (tooltip i i18n).

### Decyzja 2 (U1) — granice reguły D-UI-5

**PODPISANA (2026-10-18): (a) TAK, (b) TAK, (c) TAK, (d) TAK** — wszystkie cztery rekomendacje: odznaczenie bez ruchu
kamery; dwuklik → ColonyOverlay zdjęty; Dok taktyczny na „drugi klik" (zgoda na przecelowanie `dok_taktyczny_4f_smoke`
4.6); wrogi statek — pierwszy klik = ping celu, drugi = focus.

Cztery przypadki, których reguła nie rozstrzyga:
- **(a) Odznaczenie.** Klik w pustą przestrzeń i ✕ karty ciała przesuwają dziś kamerę na gwiazdę (Finding 473).
  **Rekomendacja:** odznaczenie bez ruchu kamery. **Koszt:** jedna gałąź w słuchaczu + pin.
  **Dopisek (2026-10-19, z bramki U0 — obserwacja właściciela):** po odznaczeniu kamera leci dziś na gwiazdę i kończy za
  blisko („wnętrze słońca”). Wymóg do U1: po odznaczeniu kamera stoi; żaden automatyczny ruch kamery nie kończy się
  bliżej gwiazdy niż kadr układu (`frameSystem`) — §4.2.
- **(b) Dwuklik na kolonię** otwiera pełnoekranowy ColonyOverlay (`GameScene.js:5619-5628`). Przy „drugim kliku = focus"
  szybki dwuklik da focus i overlay naraz. **Rekomendacja:** zdjąć dwuklik → ColonyOverlay; wejście zostaje przez
  przycisk „Mapa ciała" w karcie ciała (`BottomContext._doAction`) i klawisz H. Dwuklik → `vessel:focus` jest wtedy
  zbędny. **Koszt:** usunięcie bloku + pin.
- **(c) Dok taktyczny** (tryb Y) ma okno dwukliku 300 ms (`TacticalDock.js:40, 646-651`). **Rekomendacja:** zamienić na
  „drugi klik" dla spójności — przecelowanie pinu `dok_taktyczny_4f_smoke` 4.6 za zgodą. **Alternatywa:** zostawić
  (Dok nie jest wymieniony w D-UI-5).
- **(d) Wrogi statek.** Nie da się go zaznaczyć (`addToSelection` odrzuca wroga, `UIManager.js:537-540`) i nie ma okna
  na mapie; dziś klik = natychmiastowy `vessel:focus`. **Rekomendacja:** pierwszy klik = ping celu (bez kamery), drugi =
  focus — reguła bez wyjątku; okno wroga zostaje w Dowództwie. **Alternatywa:** zostawić natychmiastowy focus jako
  jedyny wyjątek.

**Koszt łącznie:** w U1-3, ±1 commit.

### Decyzja 3 (U2 / U3) — sekcje dzisiejszego Outlinera spoza D-UI-1

**PODPISANA (2026-10-18): rekomendacja** — KOLONIE + stacje → lewy; JEDN. NAZIEMNE → znacznik 🪖N przy ciele w lewym;
EKSPEDYCJE → usunąć; KOLEJKA → usunąć z outlinerów, znacznik ⏳N przy kolonii w lewym.

Dziś prawy panel ma pięć sekcji (A1); D-UI-1 zostawia po prawej tylko statki.
- **Rekomendacja:** KOLONIE + stacje → lewy (to są ciała); JEDN. NAZIEMNE → znacznik 🪖N przy ciele w lewym (klik = mapa
  ciała przez `openPanel('colony', { colonyId })` — zachowuje naprawę `486982c`); EKSPEDYCJE → usunąć (dublują wiersz
  statku: status + aktywność w tooltipie); KOLEJKA → usunąć z outlinerów (jest w Kolonii, Stoczni, Ekonomii), ewentualnie
  znacznik ⏳N przy kolonii w lewym.
- **Alternatywa:** KOLEJKA zostaje jako zwijana sekcja na dole prawego — łamie literę D-UI-1.

**Koszt:** w U2-3 (przeniesienie) i U3-3 (usunięcie); bez osobnego slice'u.

### Decyzja 4 (U2 / U3) — outlinery a overlay pełnoekranowy i Dok taktyczny

**PODPISANA (2026-10-18): rekomendacja** — outlinery tylko nad mapą; ukryte przy otwartym overlayu pełnoekranowym
i przy rozwiniętym Doku taktycznym.

Dziś prawy drawer wisi NAD każdym overlayem (rysowany ostatni, `UIManager.js:2413-2421`) — dlatego `be6e27e` dał mu
krycie 1. Przy rozwiniętym Doku taktycznym jest chowany. Półprzezroczystość z D-UI-1 nad tekstem overlayu = nieczytelność.
- **Rekomendacja:** outlinery tylko nad mapą — ukryte przy otwartym overlayu pełnoekranowym i przy rozwiniętym Doku
  (klawisze zwijania dalej zmieniają stan). Konsekwencje: znika powód krycia 1 i `getCoveredWidth` dla globusa kolonii
  (`ColonyOverlay.js:1281`); prawa rynna 150 px w DOM-owym Obserwatorium (`ObservatoryOverlay.js:52-53, 106-107`) staje
  się zbędna (sprzątanie później).
- **Alternatywa:** zawsze widoczne — nieprzezroczyste nad overlayem, półprzezroczyste nad mapą (dwa tryby).

**Koszt:** rekomendacja tańsza (jedna bramka `!isAnyOpen()`); alternatywa +1 commit.

### Decyzja 5 (U2) — D-UI-3: lista ciał węższa niż mapa

**PODPISANA (2026-10-18): (b)** — lista = mapa; ciała nierozpoznane oznaczone „○"; skan nie zmienia listy; pierwsze
zdanie D-UI-3 (układ na liście dopiero po przylocie statku gracza) bez zmian.

**Pomiar:** mapa 3D rysuje wszystkie ciała odwiedzonego układu (`StarSystemManager.js:160-167`). Dosłowne „bez skanu tylko
ciała realnie odkryte" pokaże w Polonii gy79 **dwa z sześciu** odwiedzonych układów (`sys_044`, `sys_008`) z PUSTĄ listą
przy 18 i 24 planetach i księżycach widocznych na mapie. Skan tier 1 / 2 mierzy tylko liczbę planet / księżyców.
- **(a) Dosłownie wg D-UI-3:** ciała wchodzą na listę po rozpoznaniu; skan wpuszcza wszystkie — z tierem: tier 1 planety,
  tier 2 + księżyce, tier 3 wszystko. Zachowuje sens „odkrycia"; lista ≠ mapa.
- **(b) [rekomendacja] Lista = mapa:** odwiedzony układ pokazuje wszystkie planety i księżyce (same nazwy); skan nie
  zmienia listy; ciała nierozpoznane oznaczone „○" (wzór katalogu obserwatorium). Lista nie powinna wiedzieć mniej niż mapa
  obok niej; mgła wojny i tak działa na poziomie układu (pierwsze zdanie D-UI-3 zostaje).

**Koszt:** (b) prostsze (bez tieru); (a) + obsługa tieru i keeper na trzy tiery.

### Decyzja 6 (U3) — flota rozpięta na kilka układów

**PODPISANA (2026-10-18): (a)** — węzeł floty w układzie prowadzącego; członkowie z innych układów pod nim z dopiskiem
układu.

**Pomiar:** w zapisie ZF gy120 „Flota Wojenna I" ma członków w `sys_061` i `sys_067`. D-UI-6 (UKŁAD → TYP) i D-UI-7
(jeden węzeł) się tu wykluczają.
- **(a) [rekomendacja]** Węzeł floty w układzie prowadzącego (pierwszy żywy członek — ten sam reprezentant co w 272),
  członkowie z innych układów pod nim z dopiskiem układu. „Jeden węzeł" dosłownie.
- **(b)** Węzeł w każdym układzie, w którym flota ma członków, z licznikiem „2/3".
- **(c)** Osobna sekcja FLOTY nad układami (floty poza grupowaniem po układzie).

**Koszt:** równy (logika w `ShipTreeLogic`).

---

## 6. Findingi #471–#487 (rejestr macierzysty)

| # | | Treść | Gdzie domknąć |
|---|---|---|---|
| **471** | ✅ | **Klawisz H (reset kamery) martwy w `civMode`.** `GameScene.js:4817` (`overlayManager.handleKey(e.key)`) zjada „h" → `'colony'` (`OverlayManager.js:23`) zanim `switch (e.code)` dojdzie do `case 'KeyH'` (`:4826-4829`). Dokumentacja (`ThreeCameraController.js:3`, `CLAUDE.md` „H = reset") opisuje funkcję nieosiągalną w głównym trybie gry. | U1-1 (`Home`) — ✅ **2026-10-19** `4a645eb` (Home → `resetToSystemView`, także w `civMode`; bramka U1 K23, K30); nagłówek kontrolera kamery — `0c4b30b`, `CLAUDE.md` — commit dokumentacji U1 |
| **472** | ✅ | **Reset kamery niepełny.** `KeyH` zeruje tylko `_focusEntityId` (`GameScene.js:4827`); `_updateCameraFocus` (`ThreeRenderer.js:2159-2192`) dalej śledzi `_focusVesselId` / `_focusStationId`, a `_watch` / `_autoFocus` biegną w pętli renderu (`:3750-3753`) ⇒ przy śledzonym statku lub stacji reset jest cofany w następnej klatce. | U1-1 (`resetToSystemView`) — ✅ **2026-10-19** `4a645eb` (zeruje wszystkie pola kamery, potem kadr `frameSystem`; bramka U1 K23 — śledzenie „Furii” przerwane, `wKadrze: true`) |
| **473** | ✅ | **Odznaczenie przesuwa kamerę.** Klik w pustą przestrzeń mapy (`ThreeRenderer.handleClick:3141` → `body:deselected`) i ✕ karty ciała (`BottomContext.js:452`) uruchamiają `focusOn(gwiazda)` (`ThreeRenderer.js:1043-1060`). Komentarz `:3105-3107` opisuje to jako znany kłopot przy statkach („kamera lata na gwiazdę"). Sprzeczne z celem arca. **Bramka U0 (2026-10-19), obserwacja właściciela:** po odznaczeniu ciała kamera kończy za blisko gwiazdy („wnętrze słońca”). | U1-2 (decyzja 2a) + wymóg z bramki U0: po odznaczeniu kamera stoi; żaden automatyczny ruch kamery nie kończy się bliżej gwiazdy niż kadr układu (`frameSystem`) — §4.2 — ✅ **2026-10-19** `be52d8a` (odznaczenie bez ruchu kamery — bramka U1 K3 / K14 / K19: kamera stoi 9,96 / 9,6 / 329,74 j. od gwiazdy, przed U1 0,8 / 0,3 / 0,9, czyli wewnątrz tarczy 3,6; ruchy z celem na gwieździe kończą w kadrze `frameSystem` — K23, K26–K28) |
| **474** | ✅ | **Kolumny listy kolonii w górnej belce niewyrównane.** Szerokość slotu kluczowana `kolonia\|token` (`TopResourceDrawer.js:356`); maksimum nie maleje w sesji. | U0-3 — ✅ **2026-10-19** `92f1b33` (jeden plan komórek dla wszystkich wierszy; bramka U0 K5, K10r, K10s) |
| **475** | ✅ | **Kredyty ucinane pierwsze.** Ostatni token (`:164-169`) + `break` przy przepełnieniu (`:342`) — „loose-end #2" z UI v3. | U0-3 — ✅ **2026-10-19** `92f1b33` (kredyty przypięte do prawego końca, w całości; bramka U0 K5, K8) |
| **476** | ✅ | **Martwy pas 18 px pod górną belką dla kamery.** `TopBar.isOver` → `y ≤ TOP_BAR_H` (46) (`TopBar.js:21, 813-815`) przy belce 28 px (`TOP_BAND_H`). | U0-3 (opcjonalnie) — ✅ **2026-10-19** `92f1b33` (`TopBar.isOver` w `civMode` → 28 px; bramka U0 K11) |
| **477** | ⚪ | **`pingVessel` bez terminu układu** (`ThreeRenderer.js:7151-7158`): statek bez sprite'a (inny układ, tranzyt warp) pinguje po `vessel.position` w ramce oglądanego układu. Osiągalne dziś z Doku taktycznego (wiersz statku w tranzycie — `TacticalDockLogic.js:33`; renderer usuwa sprite poza aktywnym układem). Klasa „globalne id ≠ położenie" — wniosek z kodu, bez kliknięcia w przeglądarce. Uzbraja się w U3 (D-UI-10 dla wszystkich układów). **Bramka U1 (2026-10-19):** po U1 pierwszy klik w wiersz Doku taktycznego idzie regułą jako zaznaczenie + `pingVessel` (`TacticalDock.js:646-647`); Dok listuje statki bieżącego układu i w tranzycie (`filterDockVessels`, `TacticalDockLogic.js:26`), więc „statek z innego układu” w Doku to statek w skoku — ta sama ścieżka co przed U1 (1. klik = zaznaczenie + ping); wniosek z kodu, bez kliknięcia. | U3-2 |
| **478** | ✅ | **`vessel:focus` dla statku w INNYM układzie to cichy no-op** (`ThreeRenderer.js:1157-1197`: brak sprite'a, ciało doku nie w scenie). Outliner i Tab (`UIManager.cycleSelectedVessel :601-620` cyklują po WSZYSTKICH statkach gracza) zaznaczają statek, kamera stoi, układ się nie przełącza. | U1-3 / U3 (§7.8) — ✅ **2026-10-19** `d8cfe62` dla Outlinera i mapy (statek z innego układu: 1. klik = zaznaczenie bez przełączania, 2. klik = przełączenie układu + kamera; `vessel:focus` bez sprite'a w oglądanym układzie — kamera na pozycji logicznej, śledzenie po wstawieniu sprite'a; bramka U1 K24, K25). **Tab → U3** (§4.4 U3-2; zakres U1: Tab bez zmian — K22) |
| **479** | ✅ | **Liczby w górnej belce zawsze z kropką dziesiętną, także w grze PL** (`_fmtNum` / `_fmtDelta`, `TopResourceDrawer.js:47-65`); wzór zależny od języka jest w `NavPeekCardLogic`. | U0-3 — ✅ **2026-10-19** `92f1b33` (`TopBarFormatLogic`; bramka U0 K6, K6en, K6pl) |
| **480** | 🟠 | **Zapisy sprzed naprawy 186 niosą układy odwiedzone (a nawet skolonizowane) jako niezbadane — naprawa nie leczy danych.** Zmierzone w 2 z 5 partii: ZF gy120 `sys_024` (kolonia pełna + placówka gracza) i Polonia gy79 `sys_036` (dom `emp_001`, statek gracza na miejscu) mają `galaxyStar.explored = false` przy lustrze `sysData.explored = true`. To sygnatura stanu sprzed 2026-08-29: bootstrap AI gasił wtedy TYLKO flagę gwiazdy, a przylot do układu wygenerowanego wcześniej niczego nie oznaczał (opis 186 w `CLAUDE.md`). W linii ZF stan trwa od gy71 (v91, lipiec) do gy120 (zapis z 2026-10-04 — już po naprawie, bo od tamtej pory żaden statek gracza nie przyleciał tam skokiem). Skutek dziś: kanon `isSystemExplored` mówi „nieznany" o układzie, który gracz zna albo kolonizuje → STRATCOM pokazuje go jako niezbadany (`SystemReveal.js:55-64`, `place = false`; nazwa tylko przy skanie lub wywiadzie). Skutek w U2: dosłowne D-UI-3 ukryłoby te układy. Naprawa danych poza tym arciem (kandydaci: kanon „zbadany ⇐ własna kolonia / placówka / stacja" albo leczenie przy wczytaniu, gdy lustro = `true`); U2 omija przez regułę widoczności z „lub". ⚠ Statki-chimery z Findingu 407 (Pikaczu `sys_060`, UF `sys_021`) to INNY stan — leczony przy wczytaniu (`_healDockedSystemId`). | osobny slice (U2 omija) |
| **481** | ✅ | **Czip „⚔ Walki [N]" zaszyty po polsku** (`BottomBar.js:166`) — klasa 113, niewidoczny dla bramki `check-i18n` (literał w zmiennej, bez polskiego znaku). Stoi w prawym końcu górnej belki, gdzie D-UI-12 przypnie kredyty. | U0-3 — ✅ **2026-10-19** `92f1b33` (etykieta przez i18n, +2 pary `combat.hudChip` / `combat.hudChipN`; czip poza belką; bramka U0 K8) |
| **482** | ✅ | **Czip „⚔ Walki" martwy w `civMode` — klik zjada pasmo górnej belki.** `UIManager.handleClick` woła `_topResourceDrawer.handleClick` (`UIManager.js:2006`) przed `_bottomBar._hitTestTopButtons` (`:2016`); prostokąt pasma `{0, 0, W − 6, 28}` (`TopResourceDrawer.js:211`) obejmował czip (x = `W − szer − 8`, y 6–26), a klik „poza nazwą" kończył się `return true` z wymuszonym rozwinięciem listy (`:637-639`). `toggleMinimize` ma dwóch wołających: klik czipu (`BottomBar.js:521`) i „—" w samym HUD (`CombatHUD.js:561`, po minimalizacji nierysowany) ⇒ zminimalizowany HUD wracał dopiero po końcu wszystkich starć (`CombatHUD.js:107`). Zmierzone na żywej grze (fixture GATE-S4, 1280×720): klik w środek czipu → `handleClick = true`, HUD bez zmian, lista rozwinięta. | U0-3 (czip na lewo od paska zegara z własnym hit-testem — opcja 1) — ✅ **2026-10-19** `92f1b33` (czip w `BottomControlBar`; bramka U0 K8, K8c, K12) |
| **483** | ⚪ | **Rozwinięta lista kolonii pod warstwą etykiet mapy.** `MapLabelLayer` rysuje chipy układów (lewy górny róg, `CHIP_TOP 34`, `MapLabelLogic.js:389-390`) oraz plakietki floty, kolonii i stacji PO górnej belce (`UIManager.js:2374` wobec `:2332`) ⇒ leżą na wierszach rozwiniętej listy kolonii (zmierzone na obrazach klatek, zapis Polonia r79: chipy na wierszu drugiej kolonii — `kosmos-handover/ui-u0/results/belt_dev_C3_pl/`; plakietki Jaskrow, Wancerzow, Mstow, „Stacja Mstow” i fregaty na wierszach 1–6 po najeździe kamery na układ domowy — `results/gate/owner_repo/K10s_spacemono.png`). Klik pochłania `MapLabelLayer.handleClick` (`UIManager.js:2003`, przed belką `:2006`) dla chipu układu, plakietki floty i etykiety stacji (`MapLabelLayer.js:511-551`); plakietka kolonii nie jest klikalna — klik przechodzi do listy (wniosek z kodu, bez kliknięcia). Istniało także przy rozwijaniu hoverem (U0 tego nie zmienia). | U2 (§7.18 — chipy wyłączone; lista rysowana i klikana przed `MapLabelLayer` — kolejność §7.17) |
| **484** | ⚪ | **`#planet-canvas` (legacy PlanetScene, nigdy nieotwierany) jest niewidzialnym celem KAŻDEGO kliku mapy.** `#planet-canvas { z-index: 4; display: none }` (`index.html:33`) przegrywa specyficznością z `#game-container canvas { … display: block }` (`:24-30`), a z-index 4 leży nad `#event-layer` (3, `:34`) — zmierzone w prawdziwej grze (`elementFromPoint` na środku mapy = `planet-canvas`; pre-flight U1). Gałąź canvas lewego kliku (`GameScene.js:5970`, `:5984`) polega na tym celu; prawy klik ma cel `CANVAS`, więc `isOverUI` nie jest tam pytany nigdy (`isGameCanvas`, `:6072-6073` — wniosek z kodu). ⚠ **Przy usuwaniu PlanetScene** (CLAUDE.md: kandydat do usunięcia) cel kliku przejdzie na `#event-layer`: lewy klik pójdzie gałęzią z raycastem sceny (po U1 zaznaczanie statków jest w obu gałęziach takie samo — różni się klik w ciało: canvas zdejmuje zaznaczenie statków, raycast je zostawia), a prawy klik zacznie pytać `isOverUI`. W headless ekran ładowania (`#loading-screen`, z 9999) przejmuje kliki jeszcze ~20 s po wczytaniu. | przy usuwaniu PlanetScene (ostrzeżenie, nie naprawa) |
| **485** | ⚪ | **Podpowiedź po najechaniu zdradza statek ukryty mgłą wojny.** Picker najechania (`ThreeRenderer.handleMouseMove` → `_getVesselAtScreen(x, y)`, `:3400`) nie pyta o `sprite.visible`; `_showVesselTooltip` (`:3593`) ma bramkę TOŻSAMOŚCI (kontakt poniżej `contact` → „❓ niezidentyfikowany kontakt”), nie WIDOCZNOŚCI ⇒ najechanie w miejsce wroga ukrytego mgłą pokazuje podpowiedź — obecność i położenie. Picker KLIKU filtruje od U1-3 (`_pickVesselForClick`, `:3205` — tylko widoczne). Istniało przed U1; wniosek z kodu, bez kliku. | U3 (statki na mapie) albo osobny drobny krok |
| **486** | ⚪ | **Przełączenie układu zostawia kartę ciała przy wyczyszczonym zaznaczeniu renderera** (obserwacja 2 z bramki U1). `ThreeRenderer.switchSystem` → `_disposeAllMeshes` zeruje `_selectedEntityId` i pola `_focus*` (`:1497-1502`) bez `body:deselected`, więc karta (`UIManager._selectedEntity`, `:731-738`) zostaje, a znaczniki kolonii trzymają stan starej sceny (`_colonyMarkers.entityId` bez zmian). Zmierzone (Polonia gy79, C3; `post_gate/`): karta „Mstow” → `sys_036` → `_selectedEntityId` null, karta „Mstow”; po powrocie i po Home — to samo (bez złotej orbity i ikon budynków), a następny klik w nazwę Mstow w Outlinerze daje od razu kamerę (reguła czyta kartę jako „bieżące zaznaczenie”). Home, klik w aktywny chip i w nagłówek bieżącego układu zaznaczenie ZOSTAWIAJĄ (renderer i karta zgodne). Tak samo na `d1f2158` (wtedy `_focusEntityId`). **Rozstrzygnięcie z pomiaru:** reset zostawia zaznaczenie; przełączenie układu zamyka kartę ciała spoza układu docelowego (`body:deselected` przed przebudową sceny) — zaznaczenie w układzie docelowym (drugi klik, §7.8) i tak wraca przez `body:selected { focus: true }` po przełączeniu. | U2 (lewy outliner — przełączanie układów kliknięciem) |
| **487** | ⚪ | **Picker statku wygrywa z tarczą ciała** (obserwacja 4 z bramki U1). `ThreeRenderer.handleClick` (`:3151-3157`) pyta o statek — najechany albo najbliższy widoczny w 40 px (`_pickVesselForClick`, `:3205`) — PRZED raycastem ciała (`:3194`) ⇒ sprite statku w promieniu 40 px od punktu kliku zabiera klik, nawet gdy kursor jest na tarczy. Zmierzone (Polonia gy79; „Fregata I” na orbicie „Stacji Mstow”, sprite 9 / 18 / 36 px od środka Mstow przy dystansie 40 / 20 / 10 j.): część tarczy Mstow klikalna jako ciało — 0 % przy 40 i 20 j. (tarcza 1,7 / 3,3 px), 15–19 % przy 10 j. (6,6 px), 100 % od 6 j. (≥ 11 px); klik w środek tarczy zaznacza „Fregatę I”. Te same liczby na `d1f2158` (picker `_hoverVesselId ?? _getVesselAtScreen(40)`) — sprzed U1. Kierunek: pierwszeństwo ciała, gdy punkt kliku leży na tarczy, a statek nie jest najechany wprost. | U2 / U3 (do rozważenia; lewy outliner daje ciało bez pickera mapy) |

Rejestr #471–#487 po U1 (2026-10-19): **17 wpisów — ✅ 10** (474, 475, 476, 479, 481, 482 — `92f1b33`; 471, 472 —
`4a645eb`; 473 — `be52d8a`; 478 — `d8cfe62`) **· otwarte 7** (477 → U3-2 · 480 → osobny slice · 483 → U2 · 484 → przy
usuwaniu PlanetScene · 485 → U3 albo osobny drobny krok · 486 → U2 · 487 → U2 / U3). Pierwszy wolny **488**.

---

## 7. Domyślne Claude'a w ramach podpisanych decyzji — do potwierdzenia przy promptach slice'ów

1. **D-UI-6 — porządek typów.** WOJENNE = `warship`, `assault`, `transport` (desantowy bez broni); NAUKOWE = `science`;
   CARGO = `cargo`; RESZTA = `colony`, `scout`. W kubełku: rola w tej kolejności, potem nazwa. Cztery nowe pary i18n
   nagłówków.
2. **D-UI-9 — mapowanie na pięć znaczników.** Priorytet: w walce > bez paliwa > w ruchu > zadokowany > bezczynny.
   „W walce" = ton `combat`. „Bez paliwa" = alert `stranded` ORAZ `immobilized` (statek stoi i nie poleci; tooltip
   rozróżnia — klucze istnieją); unieruchomienie za utrzymanie jest częste (Polonia gy79 9 z 13, Pikaczu gy67 3 z 3).
   „W ruchu" = ton `move`. „Zadokowany" = token `docked`. Reszta — także misja stojąca, np. zwiad zaparkowany na
   orbicie — = „bezczynny", z aktywnością w tooltipie. Znacznik = kolor glifu roli (`ROLE_GLYPHS`), zero dodatkowych
   pikseli; czytelność pięciu kolorów do sprawdzenia na bramce U3.
3. **D-UI-8.** Sekcja „W drodze" rysowana tylko gdy niepusta; flota w skoku — jako węzeł.
4. **D-UI-2.** W grupach (2) i (3) remis rozstrzyga odległość, potem nazwa. Układ z samą stacją (bez kolonii) → grupa (3).
5. **D-UI-4 / D-UI-6.** Zwijanie także w prawym outlinerze, tą samą regułą (bieżący układ rozwinięty). Stan zwinięcia obu
   outlinerów i ich widoczności (D-UI-1) — sesja.
6. **D-UI-4.** Planetoidy, asteroidy i komety poza listą (treść wymienia planety i księżyce); księżyce wcięte pod swoją
   planetą, bez osobnego zwijania.
7. **D-UI-5 — „drugi klik".** Klik w obiekt, który JEST bieżącym zaznaczeniem: lider zaznaczenia przy N==1, zaznaczone
   ciało, stacja w StationPanel, zaznaczona flota — z istniejącego stanu, bez nowego pola. CTRL+klik bez zmian
   (przełącza zbiór).
8. **D-UI-5 — obiekt z INNEGO układu (outliner).** Pierwszy klik = zaznaczenie + okno bez przełączania układu; drugi =
   przełączenie układu + focus. Dosłowne zastosowanie reguły; przy okazji naprawia 478.
9. **D-UI-5 — klik w BIEŻĄCY układ** w lewym outlinerze = powrót do domyślnego widoku (ta sama funkcja co reset kamery).
   Reset z klawiatury → `Home` (Finding 471); H zostaje skrótem Kolonii.
10. **D-UI-5 — kolonia a aktywna kolonia.** Zaznaczenie ciała z kolonią NIE przełącza aktywnej kolonii (dziś robi to wiersz
    Outlinera `Outliner.js:735`, a klik na mapie nie). Aktywną kolonię zmienia lista w górnej belce (D-UI-11) i otwarcie
    kolonii.
11. **D-UI-7.** Drugi klik w węzeł floty = focus na prowadzącym. Przełącznik „drugi klik odznacza" z Dowództwa
    (`FleetManagerOverlay.js:2047`) NIE przechodzi do outlinera (kolizja z D-UI-5); mutex flota / statek jak w Dowództwie.
12. **D-UI-10.** Zaznaczenie z mapy przewija outliner do wiersza i rozwija zwinięty układ. Wiersz → mapa: ramki (statek),
    złota orbita (ciało), ping z terminem układu (statek zadokowany — Finding 477).
13. **D-UI-11.** *(zgoda właściciela 2026-10-18)* Klik w pasmo poza nazwą kolonii = rozwiń / zwiń; klik w nazwę = panel kolonii (jak dziś); klik poza listą =
    zwiń; tooltipy tokenów zostają na hover.
14. **D-UI-12.** *(zgoda właściciela 2026-10-18)* Skrót od 10 000 (`12,4k` PL / `12.4k` EN, wzorem `NavPeekCardLogic`), poniżej pełne cyfry. Kredyty pełną
    liczbą z separatorem tysięcy w slocie przypiętym do prawego końca pasma — nigdy nie ucinane. Szerokości z `measureText`
    szablonów (np. „88,8k"), liczone raz na font (jak dzisiejszy reset przy zmianie fontu).
15. **D-UI-13.** *(zgoda właściciela 2026-10-18)* Znikają separatory, boki i górna listwa paska nawigacji; zostaje 2 px wskaźnik aktywnego / hover (stan,
    nie rama). Rama paska zegara (`BottomControlBar.js:103-114`) znika razem z nimi (spójność); obrysy przycisków prędkości
    zostają; rama karty peek bez zmian.
16. **Klawisze outlinerów.** `B` — oba / `,` — lewy / `.` — prawy.
17. **D-UI-1 — geometria.** Oba po 150 px, od dołu górnej belki (y 28); lewy — do górnej krawędzi paska nawigacji,
    **prawy — do górnej krawędzi paska zegara** (`BottomControlBar`, y 658 przy H = 720; korekta z pomiaru U0 2026-10-18:
    kolumna 150 px przy prawej krawędzi sięgająca paska nawigacji pokrywałaby pasek zegara — x 1092–1274, y 658–678); tło
    ~`bgAlpha(0.6)` + cień tekstu (do strojenia na bramce); lista kolonii z górnej belki rysowana NAD outlinerami.
18. **Chipy układów na mapie** (`fleetMapLabels`, lewy górny róg) — wyłączone w U2 jako dublujące lewy outliner; plakietki
    flot na mapie zostają. *(podpisane przez właściciela 2026-10-19 — obserwacja 5 z bramki U1, §4.2)*

---

## 8. Czego nie zweryfikowano

- ~~Metryka Space Mono 0,6 em~~ — **zmierzona w U0** (§3.6): font efektywny belki to Share Tech Mono (0,54 em), Space
  Mono ma 0,612 em i działa wyłącznie po F7, Rajdhani (Neon Cyber) jest proporcjonalny.
- **Zapisy właściciela** czytane strukturalnie, bez silnika (bez restore): „unieruchomione" z pola `unpaidYears` w zapisie,
  „w skoku" z `mission.phase` w chwili zapisu. Wersje v99–v101.
- **Koszt klatki outlinerów** — niezmierzony; A8 to wniosek z rozmiarów list.
- **Finding 480** — mechanizm wyprowadzony ze wzoru flag (lustro `true` / gwiazda `false` = sygnatura sprzed 186)
  i z dat zapisów; samego momentu powstania w linii ZF (gy60 → gy71) nie odtworzono.
- **Osiągalność 477 z Doku** — wniosek z kodu, bez kliknięcia w przeglądarce (po U1 — pierwszy klik w wiersz statku
  w skoku; §6). **485** (podpowiedź najechania w mgle) i prawy klik w **484** (`isOverUI` pomijany przy celu `CANVAS`)
  — także wnioski z kodu.
- **Czytelność półprzezroczystego tła** nad jasnymi obiektami (gwiazda, pierścienie) — do bramki U2.
- **Ekrany szersze niż 16:9** (W > 1280) — więcej miejsca w belce; nie liczone.
- **Sweep** — w fazie A nieuruchamiany (sesja bez kodu; ostatni znany 319/319, `2ff8d26`, handover P2b close); po U0
  — **322/322** na `92f1b33` (§4.1); po U1 — **323/323** na `d8cfe62` (§4.2).

## 9. Warsztat — lekcje tego audytu

- **Prawdziwe partie właściciela (`Downloads/kosmos_*.json`) mierzą „typową grę" lepiej niż fixture testu.** Fixture
  GATE-S4 gy60 ma 3 fregaty i 1 kolonię (linia testu ekonomii AI); partie Polonia / Orcs / ZF — 13–26 statków,
  6–11 kolonii, floty rozpięte na układy. Do pytań o UI listy brać zapisy partii, nie fixture.
- **Przed rozdzieleniem „zaznacz" od „kamera" policz czytelników POLA, nie tylko słuchaczy zdarzenia.** `body:selected`
  ma 4 słuchaczy, ale `_focusEntityId` ma 8 czytelników w dwóch rolach — ten koszt widać dopiero na liście odczytów.
- **Naprawa zachowania nie leczy danych.** Rozjazd `galaxyStar.explored` / `sysData.explored` (480) powstał przed
  naprawą 186 i jedzie w zapisach właściciela przez kilka wersji — 186 naprawił odczyt i przyszłe przyloty, nie stan
  zapisany wcześniej. Przy kanonach stanu trzeba pytać także „co z zapisami sprzed kanonu".
- **Zmiana, która zdejmuje ruch kamery, odsłania to, co ten ruch zasłaniał.** Obserwacja 3 bramki U1 („po odznaczeniu
  znika ikona kolonii”) wyglądała na regresję przepięcia odczytów; pomiar na `d1f2158` z kamerą ODSTAWIONĄ w to samo
  miejsce dał ten sam obraz — ikony znikały zawsze, tylko kamera odlatywała w gwiazdę. Przy zgłoszeniu „po zmianie
  znika X” porównuj stan sceny z kamerą w tym samym miejscu, nie dwa różne widoki.
- **Dokument bramki nazywa przycisk glifem, który kod naprawdę rysuje.** K6 kazał kliknąć „✕”, a karta ciała ma „−”
  (`StationPanel` ma „✕”) — właściciel szukał przycisku, którego nie ma; walidator klikał STREFĘ, nie glif, więc tego nie
  złapał.
