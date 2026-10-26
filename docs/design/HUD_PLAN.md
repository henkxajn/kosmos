# HUD_PLAN — ARKUSZ HUD: zasięgi radarów, etykiety, trasy, model uwagi, paleta z motywu

> **Stan: FAZA A zamknięta — podpisy właściciela 2026-10-21 (§5.0); H0 WYKONANE 2026-10-22** (§4.1: `5449674` H0-1 ·
> `6464e4d` H0-2; bramka H0 PASS; ✅ 510, 511, 512; D-HUD-7 uzupełnienie — §5.0); **H1 WYKONANE 2026-10-24** (§4.2:
> `6630665` H1-1 · `a756fab` H1-2 · `29cf778` H1-3; bramka H1 PASS 2026-10-23 z korektą 1b — wariant granicy `primary`;
> ✅ 505, 506, 507, 508, 516); **paczka A WYKONANA 2026-10-24** (§4.3, §4.4, §4.2a: `5a6d953` A-1 etykiety · `1664c84`
> A-2 trasy · `9b5e6f1` A-3 karta z boku tarczy; bramka paczki A PASS 2026-10-24 ze strojeniem 1; ✅ 509, 513, 514, 515,
> 525; z rejestru `UI_PLAN.md` §6 — 493 (przejściowo), 497, 503). Faza A — audyt read-only 2026-10-21
> na HEAD `ad65e47` (ARKUSZ UI zamknięty — `UI_PLAN.md` §4.7; origin = `ad65e47`, ahead 0); w fazie A zero zmian
> w `src/`. Plan zacommitowany razem z podpisami — commit `docs(HUD A)` = kotwica H0. Podpisy właściciela 2026-10-21:
> odczytania §1.1 (1)–(5), decyzje D-HUD-1…18, D-HUD-b/c bez zmian, cięcie H0 → H4 (§4), 504 — osobny drobny krok.
> **Protokół od H2 — aneks 2026-10-23 (§4.0):** paczki A (H2 + H3 + 493) i B (H4), commit raz na paczkę (paczka A —
> trzy commity kodu A-1 / A-2 / A-3 na prośbę właściciela), keepery wyłącznie dla logiki, walidator → arkusz kontaktowy
> HTML na 5 motywach, bramka = oglądanie + pętla strojenia.
> **Dalej (podpis właściciela 2026-10-24, `TABS_REFORM_PLAN.md` §6.0):** najpierw — poza arkuszem — **REFORMA ZAKŁADEK**
> (ramy 2026-10-24; inwentarz wykonany 2026-10-24): **531 / 532 — ✅ 2026-10-24** (`471191d` · `da8b2c9`) → **T3 —
> ✅ 2026-10-25** (`496ab80`, ze strojeniem 1) → **T1 — ✅ 2026-10-26** (`fc44de7`) → **T2 — ✅ 2026-10-26**
> (`0ddbf05`, ze strojeniem 1) → T5 (panel statku w idiomie etykiet — decyzja właściciela 2026-10-26) → T4; **paczka B,
> H4 (§4.5; w niej D-HUD-16 — kolory 3D w rolach, §5.0) PO T4** — chipy warstw D-HUD-13 stają w pasie dolnym w miejscu
> doku. Kotwica T5 = commit dokumentacji `docs(TABS T2)`.
> **Pomiary:** prawdziwa gra w Chrome (CDP, GPU — ANGLE / RTX 3070, `devicePixelRatio` 1 → `pixelRatio` renderera 1,5),
> zapis ZF gy120 (Kepler-4799 — ten sam co bramki ARKUSZA UI), okno **1600×1041 CSS** (skala UI gry 1,25 — logicznie
> 1280×833), kontrola **1280×833**; przed każdym odczytem 4 s biegu gry (stan po wczytaniu na pauzie jest inny —
> Finding 510). Kontrast motywów — czysty node na `src/config/ThemeConfig.js` (5 motywów ekranu tytułowego + 23 presety;
> sprostowanie 2026-10-22 — w fazie A pisało „24”, `Object.keys(PRESET_THEMES)` = 23).
> **Teczka:** `C:\Users\Komputer\kosmos-handover\hud-phase-a\` — `probes/` (sondy), `results/` (JSON, zrzuty PNG,
> `hexes_hud.txt` — pełna lista kolorów na sztywno), `HANDOVER_HUD_PHASE_A.md`.
> **Oznaczenia** jak w `UI_PLAN.md`: `[code]` — odczyt źródła (linie przy `ad65e47`) · `[measured]` — pomiar w grze albo
> sondą · `[derived]` — wniosek bez osobnego pomiaru · `[git]`. **Findingi:** rejestr #504–#555 (§3; 517–521 z H0,
> 522–527 z H1, 528–530 z paczki A, 531–543 z inwentarza reformy zakładek, 544–548 z T3, 549–552 z T1, 553–555 z T2
> reformy zakładek); 488, 493, 497, 502 i 503 — `UI_PLAN.md` §6 (tu tylko odsyłacze). Pierwszy wolny numer po audycie:
> 517; po H0: 522; po H1: 528; po paczce A: 531; po inwentarzu reformy zakładek: 544; po T3 reformy zakładek: 549; po T1
> reformy zakładek: 553; **po T2 reformy zakładek: 556**.

---

## 1. Zakres (podpisany przez właściciela 2026-10-21 — dosłownie)

> CEL ARKUSZA (podpisany zakres właściciela, 2026-10-21):
> Warstwa HUD nad sceną 3D mapy układu + jedna dopisana grupa chipów w dolnym pasie. Zero kolorów na sztywno — wszystko z motywu UI (pkt 8).
>  (1) Zasięgi radarów: dziś pełne pomarańczowe/niebieskie elipsy → granica jako słabe kropki (alpha ~0,2), ping rozchodzący się od obiektu (ostra linia ~0,7 + miękka poświata ~0,2 + echo ~0,25), podziałka co 30°, kolor = hud.primary. Widoczne domyślnie TYLKO dla zaznaczonego obiektu; dla pozostałych tylko błysk na granicy, gdy obcy obiekt w nią wchodzi.
>  (2) Etykiety zamiast plakietek: tekst mono na półprzezroczystym ciemnym pasku bez ramki (0,72 zaznaczony / 0,55 reszta), podkreślenie = nitka do obiektu, pionowa „szyna” dla stosu planeta+księżyce+stacja, hierarchia: kolonie wersaliki + letter-spacing, statki małe litery, zaznaczony jedyny pogrubiony, druga linia z danymi tylko dla zaznaczonego/hover, cyfry tabularyczne, LOD po zoomie („NOWA ZIEMIA +2” z daleka → rozwinięta szyna z bliska), anti-overlap (zrzut właściciela: Nowa Ziemia / Nowy Księżyc / Stacja zachodzą na siebie przy prawej krawędzi).
>  (3) Model uwagi: etykiety i trasy niezaznaczone ~0,38 (trasy ~0,25), zaznaczony + alerty 1,0; alert w hud.alert (dwie obwódki różnej jasności + kropkowany wektor + treść: typ, dystans, namiar).
>  (4) Orbity: cieńsze (~0,8 px) i ciemniejsze (~0,8 alpha).
>  (5) Mikro-ruch: etykiety fade-in 150 ms bez skoków; ping ~2,4 s ease-out; marsz kresek tras bardzo wolny, zatrzymany przy pauzie („pauza to pauza”, POLISH §13).
>  (6) Trasy statków (zrzut właściciela: długa jasna kreskowana linia Cu i Hv → Kurier → gwiazda przecina pół ekranu): linia 1 px w kolorze statków z motywu, alpha GASNĄCA wzdłuż długości (przy statku ~0,6 → przy celu ~0,15), cel = małe puste kółko/chevron w punkcie dotarcia, bez strzałek na długości; lot warp (do innego układu) = dłuższy wzór kresek zakończony glifem układu docelowego przy krawędzi kadru, nie linia w nieskończoność; obce statki — trasa tylko w zasięgu sensorów (jeśli dziś w ogóle pokazywana — ustal).
>  (7) Chipy warstw w dolnym pasie zegara/kalendarza: [R] radar · [T] trasy · [E] etykiety · [O] orbity (+ [H] handel, jeśli linie handlu 3D z Etapu 39 mają dziś własny przełącznik — ustal), w konwencji BottomControlBar z U4 (szerokości z measureText per aktywny font, położenie względem suwaka zoomu i 🔔 — zaproponuj), aktywny = wypełnienie, nieaktywny = obrys; to JEDYNA zmiana w dolnym pasie; do tego skróty klawiszowe.
>  (8) Paleta z motywu: właściciel wybiera kolorystykę UI przed startem gry. HUD wprowadza cztery role: hud.primary (własne obiekty, etykiety, ping, trasy), hud.dim (przygaszone), hud.alert (alerty), hud.foreign (obce) — każda = token motywu, bez hexów w kodzie HUD. Jeśli motyw ma primary w barwie ostrzegawczej, hud.alert bierze token ostrzeżenia motywu; sprawdź kontrast primary↔alert dla KAŻDEGO motywu.
> POZA ZAKRESEM (nie dotykać, nie proponować): rendering planet/gwiazdy (gradienty, bloom, 502), winieta, górna belka, oba outlinery, dolny pas poza grupą chipów z pkt 7, okna/zakładki (488/493), linie handlu 3D (poza ewentualnym przełącznikiem [H]). Zmiana tych elementów = STOP i pytanie.
> Domyślne decyzje właściciela (D-HUD-b/c, może nadpisać przy podpisie planu):
>  b) ping gra raz przy zaznaczeniu, potem co ~6 s; przy bliskim zoomie (duży dysk ciała) ping stoi — tylko statyczna słaba granica (bez pulsowania przy bliskim zoomie);
>  c) nawiasy narożne ⌜ ⌟ wokół zaznaczonego ciała, „oddychanie” 1,0→1,04 / 2 s, gasnące przy bliskim zoomie.
> Odłożone do osobnego potwierdzenia (NIE w planie jako krok): „planeta jako obiekt” w dalekim zoomie (gradient/bloom kropki).

### 1.1 Gdzie pomiar wymusza odczytanie zakresu — PRZYJĘTE (podpis 2026-10-21)

**Odczytania (1)–(5) przyjęte przez właściciela 2026-10-21** (§5.0).

1. **Pkt 4, „~0,8 px”.** Linia orbity to dziś 1 px BUFORA renderera (`LineBasicMaterial`), czyli 0,67 px CSS przy DPR 1
   i 0,5 px CSS przy DPR ≥ 1,34 — już cieńsza niż 0,8 px CSS (§2.6). Linia o szerokości 0,8 px CSS (`Line2`) byłaby
   GRUBSZA niż dziś. Odczytanie: grubość bez zmian, „cieńsze” = wrażenie z mniejszej jasności → D-HUD-7.
2. **Pkt 4, „~0,8 alpha”.** Krycie orbit to dziś 0,08–0,15; dosłowne 0,8 byłoby 5–10× jaśniej („ciemniejsze” mówi
   odwrotnie). Odczytanie: mnożnik ×0,8 dzisiejszego krycia → D-HUD-7.
3. **Pkt 8, „primary w barwie ostrzegawczej → alert = ostrzeżenie”.** W Amber Noir primary (`#c49830`) JEST barwą
   ostrzegawczą, a jego `warning` (`#dd8833`) różni się od niego o ΔE2000 12,6 — i o **0,44** w deuteranopii
   (praktycznie ten sam kolor). Dosłowna reguła psuje dokładnie ten motyw, do którego się odnosi. Odczytanie
   z pomiaru: alert = `danger`, a `warning` tylko wtedy, gdy primary leży za blisko `danger` (Biopunk Green, Neon Cyber)
   → D-HUD-2, §2.10.
4. **Pkt 6, warp.** Statek w skoku nie należy do żadnego układu (`systemId = null` od chwili rozkazu —
   `VesselManager.js:1014`), a skok zaczyna się natychmiast: dziś trasy warp nie ma w żadnej postaci i nie ma odcinka
   w układzie, który można przedłużyć → D-HUD-9.
5. **Pkt 7, [H].** Linie handlu 3D nie mają dziś przełącznika (§2.9) ⇒ wg litery zakresu chip [H] odpada → D-HUD-13.

---

## 2. Pomiary A1–A14

### 2.1 A1 — okręgi zasięgu `[code]` `[measured]`

**Kto i czym.** `ThreeRenderer._syncSensorOverlay` (`ThreeRenderer.js:6078-6139`) + `_upsertSensorRing` (`:6141-6166`)
— obiekty three.js, nie DOM i nie Canvas 2D: `Mesh(RingGeometry(0,985·r, r, 96), MeshBasicMaterial)` (przezroczysty,
krycie 0,15, `DoubleSide`, `depthWrite: false`), obrót −π/2 (płaszczyzna ekliptyki), Y = 0,04 (stałe `SENSOR_RING_*`,
`:158-165`). Cache `this._sensorRingMeshes` (klucz `v_<id>` / `col_<planetId>`), mark & sweep; geometria przebudowywana
tylko przy zmianie promienia albo koloru, pozycja przy każdym syncu.

**Kiedy.** Nie co klatkę — na zdarzeniach `physics:updated` (`:778-786`), `vessel:positionUpdate` (`:863-867`),
`ui:sensorOverlayToggle` (`:869-875`). W pauzie zdarzenia nie lecą ⇒ pierścienie stoją.

**Bramki.** `FEATURES.m4SensorOverlay` (`GameConfig.js:73`) i `uiPrefs.sensorOverlayVisible === true` — przełącznik
„Radar” w menu ☰ (`BottomBar.js:441, 452, 553-559`), domyślnie OFF (`main.js:22`), w zapisie od v70; tryb taktyczny Y
wymusza ON na czas trybu (`TacticalModeLogic.js:29`); SHIFT (czysty widok) chowa (`ThreeRenderer.js:3802`). Zapis ZF
gy120 ma radar włączony.

**Które encje.**
- **Własne statki** (nie wrak, nie wróg) w oglądanym układzie — filtr `v.systemId && v.systemId !== activeSys` (`:6098`)
  przepuszcza `systemId === null` (Finding 516); bez pytania o stan i o `isInService` — pierścień mają także zadokowane
  (bez sprite'a — `:5133-5137`) i kadłuby w rezerwie (Finding 507). Promień = `GAME_CONFIG.SENSOR_LOCK_AU` = **0,3 AU
  stałe** (`GameConfig.js:550`), kolor cyjan 0x44ccff.
- **Kolonie** z `colonyManager.getAllColonies()` (`:6114` — bez terminu właściciela, Finding 506) w oglądanym układzie,
  pełne i placówki — promień `ObservatorySystem.getVesselDetectionRangeAU(col)` (`ObservatorySystem.js:169-179`:
  `VESSEL_DETECTION_RANGE = [1, 3, 6, 15, ∞, ∞, ∞]` AU wg poziomu obserwatorium, `:31`), ∞ przycięte do 35 AU
  (`SENSOR_RING_MAX_COLONY_AU`), kolor bursztyn 0xffcc44.
- Stacje, posterunki, obce statki — brak; obce kolonie — tylko przez Finding 506.

**Co znaczą barwy.** Cyjan = próg sensor-locku (ujawnienie tożsamości wroga — `IntelSystem._onSensorLock`), bursztyn =
zasięg wykrycia obserwatorium kolonii (`ObservatorySystem._tickVesselDetection`) — komentarze `:6092`, `:6110`. Promień
cyjanu nie odpowiada mechanice (Finding 505).

**Pomiar ZF gy120** (`results/inventory_1600_v2/inventory.json`, `results/sensor_ranges.json`): 15 pierścieni —
10 statków (8 zadokowanych: po 3 nałożone w Nt i w Nowej Ziemi, po jednym w Nowym Księżycu i w Cu i Hv), 5 kolonii
(Nowa Ziemia ∞ → 35 AU, cztery po 1 AU).
Mnożnik `sensor_range` = 4,608 ⇒ realny zasięg wykrycia statku 11,52 AU (`hull_small` 2,5 AU × 4,608), sensor-lock
1,38 AU — pierścień pokazuje 0,3 AU. Promień pierścienia statku na ekranie: 2,6–3,9 px przy 450 j., 8–47 px przy 40 j.,
13–201 px przy Fobosie z 3 j.; pas = 1,5 % promienia ⇒ od 0,04 px do ~26 px (Finding 508). „Pełne niebieskie elipsy”
ze zgłoszenia to trzy nałożone pierścienie statków zadokowanych w Nowej Ziemi i czwarty — statku w Nowym Księżycu tuż
obok (`results/inventory_1600_v2/S4_nowaZiemia_d12.png`); bursztynowe — pierścienie kolonii.

**Dla HUD.** Pierścień w 2D (rzut okręgu ekliptyki na ekran co klatkę) albo w 3D z pasem o stałej szerokości ekranowej
— ta technika jest już w repo: `engagementRingBand` (`VesselFxLogic.js:108-129`, CP27 — pierścień starcia 1,5 px).
Kropki, podziałka i ping są prostsze w 2D (D-HUD-1).

### 2.2 A2 — plakietki i strefa kliku (503) `[code]` `[measured]`

**Kto i czym.** `MapLabelLayer` (`src/ui/MapLabelLayer.js`) — Canvas 2D na `#ui-canvas`, tryb natychmiastowy (nie CSS2D,
nie DOM, nie sprite), wołany z `UIManager._draw` (`:2323-2325` kolonie i stacje, `:2329-2331` floty). Bramki: `civMode`,
`FEATURES.mapLabels` (`GameConfig.js:268`) / `FEATURES.fleetMapLabels` (`:273`) + `uiPrefs.fleetMapLabelsVisible`
(menu ☰ „Plakietki floty”, `BottomBar.js:443, 453, 565-571`), `!overlayManager.isAnyOpen()`, `!globeOpen`. Dane:
`MapLabelLogic.gatherColonyLabels` (`:108-128` — wyłącznie `getPlayerColonies`), `gatherStationLabels` (`:153-169` —
stacje gracza), `gatherVesselLabels` (`:242-286`). Pozycja — `ThreeRenderer.getBodyScreenPosition` (`:3263-3283`) /
`getStationScreenPosition` (`:3246`); `null` (inny układ, za kamerą) ⇒ pominięte.

**Treść.** Kolonia: ikona (🏠 dom · 🏙️ kolonia · ⛺ placówka) + nazwa + „N POP” (placówka bez POP); stacja: 🛰️ + nazwa +
„pop/pojemność POP” + plakietki statusu 🔨 👥 ⚡ (`stationStatusBadges`, `MapLabelLogic.js:136-146`); statki: plakietki
flot i klastrów („◆ ×N” albo nazwa floty), wróg w `THEME.danger` (`MapLabelLayer.js:405`). Nazwy ucinane do 16 znaków
bez „…” (Finding 513).

**Wygląd.** Plakietka W2 (`_drawW2`, `:193-226`): tło `rgba(8,12,20,0.82)` (`:204`), ramka i pasek w kolorze rodzaju
(`KIND_COLOR`, `:28-33` — dom `THEME.accent`, kolonia `THEME.mint ?? THEME.success`, placówka `THEME.textSecondary`,
stacja **`'#8fb8ff'` na sztywno**), nazwa `bold THEME.fontSizeNormal` (11 px), druga linia `THEME.fontSizeSmall` (9 px);
łącznik (`_drawConnector`, `:157-169`) — pionowa linia 1 px, alfa ×0,5, kropka przy ciele; znacznik LOD (`_drawMarker`,
`:172-190`) — tło `rgba(6,10,16,0.55)` (`:180`); plakietka statku (`:411-439`) — tło `rgba(8,12,20,0.80)` (`:422`);
strzałki krawędzi dla statków poza kadrem (`:354-376`; Finding 497). Kolonia 34 px NAD ciałem, stacja 30 px POD nim.

**Klik i hover.** Klikalne: plakietki flot (własna — 1. klik zaznacza zbiór, 2. klik — kamera; wroga — ping, 2. klik —
kamera) i etykiety stacji — znacznik ALBO plakietka (`_hitZones`, `:103`, `:121`) → `clickObject` (`ClickIntentLogic`,
reguła D-UI-5) w `MapLabelLayer.handleClick` (`:445-473`). Plakietki KOLONII nie mają strefy — klik przechodzi do
raycastu 3D (`ThreeRenderer.handleClick`, `:3158-3208`). Kolejność w `UIManager.handleClick` (`:1951-2049`): panele
pływające → pasek nawigacji → pas dolny → górna belka → dziennik → outlinery → **etykiety mapy (`:2008`)** → … → **karta
ciała (`:2043`)** → raycast 3D w `GameScene` (Finding 515). Hovera warstwa nie ma (brak `handleMouseMove`).

**503 dziś** `[measured]` (oba okna): przy 450 j. znacznik stacji 18 × 15 px log. w (625, 413) — strefa obejmuje środek
gwiazdy (640, 416). Mechanizm: `STATION_MARKER_FLOOR` 0,9 (`MapLabelLogic.js:50`; `stationLabelLOD`, `:60-66`) trzyma
znacznik — i jego strefę — przy każdym oddaleniu (podłoga istnieje, bo GLB stacji jest wtedy mniejszy niż piksel),
a stacja krąży 6,2 j. od gwiazdy, więc w kadrze układu leży na jej tarczy (16 px). Od ~40 j. strefa schodzi z gwiazdy.

**Jak zachować i poprawić przy etykietach tekstowych.** Strefa = prostokąt TEKSTU etykiety (nie znacznik przy ciele),
z regułą 487: punkt kliku na tarczy ciała (`ThreeRenderer._isOnBodyDisc`, `:3552-3557`) wygrywa z etykietą; etykieta
zwinięta („NOWA ZIEMIA +2”) ma strefę zwiniętego tekstu i zaznacza kotwicę; reguła D-UI-5 bez zmian → D-HUD-5. Przy
tej regule 503 zamyka się w H2.

### 2.3 A3 — zaznaczenie i hover `[code]`

- **Zaznaczenie — jeden kanon:** `readClickSelection(K)` (`ClickIntentLogic.js:77-92`) — `vesselIds` / `leadId`
  (`UIManager.getSelectedVesselIds` / `getSelectedVesselId`), `entityId` (`UIManager._selectedEntity` — karta ciała),
  `stationId` (otwarty `StationPanel`), `fleetId`, `pingedEnemyId` (`ThreeRenderer._pingedEnemyId`), `activeSystemId`.
  Czytają go oba outlinery (U2/U3) i reguła kliku (U1). Renderer trzyma osobno zaznaczenie ciała `_selectedEntityId`
  i cel kamery `_focusEntityId` (U1-2): `body:selected { entity, focus }` (`ThreeRenderer.js:1021-1062`),
  `body:deselected` (`:1068-1083`), `ui:selectionChanged` (`:1097-1100`).
- ⇒ HUD czyta wyłącznie `readClickSelection` (+ geometrię z renderera); żadnego nowego stanu zaznaczenia; outlinery
  nietknięte.
- **Hover — trzy osobne stany, bez wspólnego źródła.** Mapa: `ThreeRenderer._hoverPlanetId` (raycast tarcz; zdarzenie
  `planet:hover`, którego jedynym konsumentem jest sam renderer — podświetlenie orbity, `:1261-1284`) i `_hoverVesselId`
  (picker ekranowy `_getVesselAtScreen(x, y)` z progiem 28 px, `:3578-3605`, bez zdarzenia; `handleMouseMove`
  `:3394-3446` — bez `visibleOnly`, Finding 485). Outlinery: własny `_hoverKey` każdej kolumny
  (`OutlinerColumn.js:55`, `:312-322`), bez zdarzenia. Etykiety mapy — brak.
- ⇒ „Druga linia przy hover” (pkt 2) może czytać hover MAPY i własny hover etykiety HUD; hover wiersza w outlinerze nie
  dotrze bez zmiany outlinerów (poza zakresem) → D-HUD-5. Picker hovera dla HUD musi mieć `visibleOnly` (jak picker
  kliku `_pickVesselForClick`, `:3214`), inaczej druga linia powtórzy 485.

### 2.4 A4 — alerty `[code]`

- **„Obcy wszedł w zasięg” — jest, per para statków.** `ProximitySystem._checkPair` (`ProximitySystem.js:178-307`),
  trzy progi z histerezą (wyjście ×1,2): wykrycie → `vessel:proximityEnter` z polami `vesselAId`, `vesselBId`,
  `distanceAU`, `sameFaction` (`:208`; próg = większy z zasięgów pary — gracz `sensorRangeAU` kadłuba × tech, wróg płasko 0,5 AU,
  `:322-333`), sensor-lock → `vessel:sensorLockEnter` (`:236`), zasięg walki 0,15 AU → `vessel:combatRangeEnter`
  (`:294`; drugi producent — `MovementOrderSystem.js:1362`, `:1725`). Kadłub w rezerwie nie wykrywa i nie jest
  wykrywany (`:73-84`).
- **Kolonie.** `ObservatorySystem._tickVesselDetection` (`:580+`) — sensory wyłącznie z kolonii GRACZA (`:589-591`);
  `vessel:detectionChanged { vesselId, detected, vessel }` (`:647`, `:663`) BEZ kolonii, która wykryła, i bez dystansu
  ⇒ błysk na granicy pierścienia KOLONII wymaga dopisania pola albo przeliczenia w HUD (D-HUD-4).
  `vessel:firstSighting` (`:689`) — pierwsze wykrycie statku imperium.
- **Konsumenci dziś.** Widoczność wroga w rendererze (`ThreeRenderer.js:884`), `NotificationCenter` (`:82` — uzbrojony
  kontakt), `IntelSystem` (`:68`, `:74`), walka (`VesselCombatSystem.js:63`, DSCS), Dziennik (`UIManager.js:1493-1513`
  — Finding 504), popup pierwszego kontaktu (`GameScene.js:2883`).
- **Znacznik wroga na mapie.** `_syncEnemyAlertMarkers` (`ThreeRenderer.js:7731-7786`, flaga `fcEnemyAlertMarker`,
  `GameConfig.js:210`) — celownik-sprite 0xff4466 (`ALERT_MARKER_COLOR`, `:172`) na wrogu z jakością ≥ `rumor`; puls
  `sin(t·3,2)` z `THREE.Clock` — czas REALNY, więc pulsuje także w pauzie.
- **Chip ⚔** (`BottomControlBar.js:193-201`) — gdy `combatHud.isMinimized() && combatHud.hasActiveEncounters()` (tylko
  starcia DSCS ze zminimalizowaną kartą walki); etykieta `combat.hudChip` / `hudChipN`; `_drawCombatChip` (`:293-306`)
  z wartościami zapasowymi `'rgba(60, 60, 60, 0.6)'` i `'#ff4466'`.
- **Dystans** — w ładunku `proximityEnter` (`distanceAU`) i do policzenia z pozycji (`x/y` w ramce układu). **Namiaru**
  nie liczy nikt: `bearing|namiar|azimuth` — 0 trafień w `src/ui`, `src/renderer`, `UIManager.js`; `atan2` służy tam
  wyłącznie do obrotu modeli. Do policzenia z pozycji; potrzebna konwencja 0° (D-HUD-11).

### 2.5 A5 — czcionki; DOM czy Canvas `[code]` `[measured]`

- **Font HUD = `THEME.fontFamily`**, czytany przy KAŻDYM rysunku Canvas. Ekran tytułowy zawsze nakłada jeden z pięciu
  motywów (`TitleScene.js:80-90`; `SS_THEMES`, `:16-59`): Amber Noir, Cold Blue, Galactic Violet, Biopunk Green →
  **Share Tech Mono**; Neon Cyber → **Rajdhani**. Wartość domyślna `fontFamily` to Space Mono (`ThemeConfig.js:42`) —
  w grze tylko po F7 (`ThemeOverlay`, panel debug, `GameScene.js:4862-4864`, `:5452-5455`).
- **Pomiar** (`results/fonts.json`; Chrome, fonty wczytane `document.fonts.load` — sonda z gry mierzyła font zastępczy,
  §8): Share Tech Mono — cyfry stałe, 0,54 em (9 px → 4,86 px); `bold` bez zmiany szerokości (Google Fonts serwuje jedną
  wagę, `index.html:10` — pogrubienie jest sztuczne, przeglądarki); Space Mono — 0,612 em; **Rajdhani — cyfry
  proporcjonalne** (9 px: „1” 2,85 px, „0” 4,63 px), a `font-variant-numeric: tabular-nums` nie działa (DOM 12 px:
  „1111” 15,22 / „8888” 24,92 px przy obu ustawieniach — font bez cechy `tnum`). `ctx.letterSpacing` działa („NOWA
  ZIEMIA”, Share Tech Mono 9 px: 53,46 → 64,46 px przy 1 px → 75,46 px przy 2 px).
- ⇒ Cyfry tabularyczne są za darmo w 4 motywach (font mono) i niewykonalne fontem w Neon Cyber — wyjście: cyfry
  w stałej kratce (szerokość najszerszej cyfry), niezależnie od fontu (D-HUD-6). „Zaznaczony jedyny pogrubiony” —
  w Share Tech Mono pogrubienie jest sztuczne (grubszy rysunek, ta sama szerokość).
- **DOM czy Canvas.** Dziś wszystkie etykiety mapy to Canvas 2D; DOM nad sceną mają tylko podpowiedzi
  (`#colony-3d-tooltip`, `ThreeRenderer.js:3718-3736` — `'Courier New'`, ramka `#1a6e50`, polskie literały, znana klasa
  113 — komentarz `:3685`). Canvas: pasek pod tekstem = `fillRect` z `measureText`, fade-in = alfa z zegara,
  anti-overlap na prostokątach z `measureText` (jak `stackLabels`), strefy kliku jak dziś, kolejność warstw kontrolowana
  (D-HUD-1). DOM: daje `tabular-nums` (i tak martwe w Rajdhani), za cenę pomiaru kolizji przez `getBoundingClientRect`
  (reflow co klatkę), osobnego porządku warstw względem kanwy UI (`index.html:31-34`: `#three-canvas` 1, `#ui-canvas` 2,
  `#event-layer` 3) i kliku przez `#event-layer`. **Rekomendacja: Canvas.**

### 2.6 A6 — orbity `[code]` `[measured]`

- **Planety:** `_buildOrbit` (`ThreeRenderer.js:2690-2748`) — `THREE.Line` z `LineBasicMaterial`, 129 punktów; bez
  `linewidth` (WebGL/ANGLE i tak go ignoruje) ⇒ zawsze 1 px BUFORA. Bufor = CSS × `pixelRatio`,
  `pixelRatio = min(DPR × 1,5, 2)` (`:284` — supersampling) ⇒ linia ma 0,67 px CSS przy DPR 1 i 0,5 px CSS przy
  DPR ≥ 1,34. Nie `Line2`.
- **Kolory na sztywno** (`:2704-2708`, `:2719`; `_restoreOrbitDefaults` `:2634-2638`): 0x003828 domyślna, 0x005540
  życie / kolonia, 0x007852 dom, 0x553322 niestabilna (`orbitalStability < 0,5`), 0x00ccff (`planet.isSelected` —
  pole legacy), 0xffc832 zaznaczona (krycie 0,7). Krycie: dom 0,15 · kolonia 0,10 · filtr 0,08.
- **Widoczność:** filtr `ORBIT_MODES` all / planets_moons / planetoids / none (`BottomBar.js:41-42`; cykl `:537-545`;
  localStorage `kosmos_orbit_filter`, domyślnie planetoids; menu ☰ „Orbity”) → `setOrbitFilter` (`ThreeRenderer.js:2649`)
  → `_applyOrbitFilter` (`:2655`). Dom i kolonie widoczne przy KAŻDYM filtrze, także „Żadne” (Finding 511).
- **Księżyce:** pierścień `RingGeometry` 0x445566 (`:2464-2473`), krycie 0,15 albo 0 wg filtra (`_hideAllMoonOrbits`
  `:2533-2541`), 0,30 przy zaznaczeniu (`_showMoonOrbit`, `:2525-2530`). **Planetoidy:** 0x554433, krycie 0,12 (`:2859-2865`, budowa
  `:2895-2927`) — w ZF przy filtrze domyślnym 18 linii.
- **Przebudowa:** `_rebuildAllOrbits` (`:2670-2688`) co 180 wywołań `_syncPlanetMeshes` (`:2425-2431`) i na 8 zdarzeniach;
  po wczytaniu na pauzie orbity domu i kolonii są ukryte do pierwszej przebudowy (Finding 510).
- **Motyw:** tokeny `orbitLine` / `orbitColony` istnieją w każdym presecie i nikt ich nie czyta (Finding 512) —
  w Amber Noir orbity są turkusowe.
- **Pkt 4 zakresu** — patrz §1.1 (1)–(2): grubość już poniżej 0,8 px CSS; „~0,8 alpha” = mnożnik.

### 2.7 A7 — zoom i LOD `[code]` `[measured]`

- **Sygnały kamery:** `ThreeRenderer.getCameraDistance()` (`:3287`, = `ThreeCameraController._dist`),
  `getCameraMoveEpoch()` (`:3293`; `ThreeCameraController.moveEpoch` — getter `:266`, podbijany przy każdej zmianie
  pozycji kamery `:162-165`; UI przerysowuje się przy zmianie epoki, `UIManager.js:2191-2192`), getter `minDist`
  (`ThreeCameraController.js:242-247`; od 501 strefa
  `STAR_ZONE_MULT` 1,3 / podłoga `STAR_FLOOR_MULT` 2,2, `:27-28`), `MAX_DIST` 450 (`:19`), `frameSystem` = clamp(maxAU ×
  20, 70, 450) (`:188-197`).
- **Rozmiar tarczy w px** — brak gettera; liczy się z promienia siatki, głębi widoku i FOV 55° (wzór w repo:
  `ThreeRenderer._viewDepth` + `capBillboardWorld`, `CombatWatchLogic.js:215`). ZF gy120, okno 1600 px: Nowa Ziemia
  0,3 / 3,6 / 11,8 / 35,5 px przy 450 / 40 / 12 / 4 j.; gwiazda 16 / 162 px (450 / 40 j.); Fobos 9,3 / 37,2 px (6 / 1,5 j.).
  Dystans kamery nie zna promienia ciała (gwiazda 3,6 j., księżyce 0,015–0,04 j.) — progi HUD lepiej po pikselach tarczy
  (D-HUD-5). Progi w px są też odporne na naprawę 502 (tarcza gwiazdy zależna od klasy).
- **Progi dziś:** etykiety kolonii i stacji (`MapLabelLogic.js:21-24`) — ≤ 150 j. plakietka · 150–215 przenikanie
  plakietka ↔ znacznik · 215–300 znacznik · 300–360 zanik · ≥ 360 nic; stacja — podłoga znacznika 0,9 (`:50`);
  plakietki statków — `vesselLabelLOD` 120 / 180 (`:194-210`).

### 2.8 A8 — anti-overlap `[code]` `[measured]`

- **Jest jeden mechanizm:** `stackLabels` (`MapLabelLogic.js:77-100`) — zachłanne zsuwanie W DÓŁ (sort po docelowym Y),
  wyłącznie plakietki kolonii i stacji między sobą. Znaczniki LOD — bez anti-overlap; plakietki statków — własne
  grupowanie (`clusterScreenPoints`), poza `stackLabels`.
- **Stos planeta + księżyc + stacja dziś** (Nowa Ziemia, Nowy Księżyc, Stacja Nowa Ziemia): ≤ 150 j. — kolumna nad
  tarczą (Nowa Ziemia −34 px, księżyc i stacja zsunięte w dół co ~33 px); przy bliskim kadrze kolumna leży na tarczy
  gwiazdy (`S4_nowaZiemia_d12.png`); 150–215 j. — plakietki (alfa ↓) i znaczniki (alfa ↑) jednocześnie, bez wzajemnego
  odsuwania: **przy 200 j. 10 nakładających się par** w obu oknach, w tym trzy znaczniki na sobie w 88–95 % — to jest
  „zachodzą na siebie” ze zgłoszenia (Finding 514); ≥ 215 j. — trzy znaczniki w jednym miejscu.
- **Kadru nie ma** — etykiety rysują się poza obszarem mapy (Finding 514); strzałki krawędzi istnieją tylko dla statków
  (`edgeIndicators`, `MapLabelLogic.js:301-341`, kadr z `MapInsets` od U4-2).
- **Szyna (pkt 2) ma gotowe grupowanie:** `stationGroupOf` (`src/utils/StationGroup.js`) — kotwica = planeta, członkowie
  = planeta + księżyce; stacje grupy przez `getStationsAt` członków.

### 2.9 A9 — trasy; odcinki przy Fobosie `[code]` `[measured]`

**Inwentarz linii ruchu na mapie układu:**

| Element | Kto rysuje | Kiedy | Czym | Kolor / krycie |
|---|---|---|---|---|
| Trasa statku | `ThreeRenderer`: model GLB `:4488-4512`, sprite zapasowy `:4701-4726`, aktualizacja `_syncVesselPositions` `:5222-5242` | statek w oglądanym układzie, `vessel.mission` istnieje, stan ≠ `orbiting`/`docked` | `LineDashedMaterial`, kreska 0,3 j. / przerwa 0,15 j. ŚWIATA (px rosną z zoomem), 2 punkty: statek (Y 0,3) → cel (Y 0); `computeLineDistances()` co tik — wzór liczony od statku | `_orderLineColor` (`:7062-7074`) wg `movementOrder.type`: walka 0xff5544, pościg/przechwycenie 0xffaa44, patrol 0x44ccff, odwrót 0xcc88ff, ruch 0x66ddaa, bez rozkazu: własny 0x66ddaa / wróg 0xff8866; krycie 0,55; najechanie → 1,0 i 0x9fffe6 (`:193-197`, `:1255-1284`) |
| Stożek przechwycenia | `_syncPredictionCones` (`:5969`) | rozkaz `intercept` | stożek 3D | 0x00ffff (`:146-151`) |
| Puls startu i przylotu | `_spawnMovementPulse` (`:7077`, Slice 6) | start / przylot | pierścień FX | 0x88ffcc / 0x88ddff (`:1175-1177`) |
| Linie handlu | `_updateTradeLines` (`:5442-5492`), świetliki `_animateTradeFireflies` (`:5727`) | połączenia w oglądanym układzie | kreska 0,5 / 0,3 j., krycie 0,08–0,15 | gradient liczony wg towaru |

- **Cel linii:** `liveTargetX/Y ?? targetX/Y ?? 0`, w drodze powrotnej `returnTargetX/Y ?? liveOrigin ?? 0` (`:5189-5190`)
  — zapas 0 = środek gwiazdy (w ZF obie linie mają prawdziwy cel).
- **Linie handlu — przełącznika nie mają** `[code]`: żadnej preferencji ani flagi widoczności (`tradeLine*Visible`,
  `showTradeLines` — 0 trafień w `src/`); chowa je wyłącznie SHIFT (`ThreeRenderer.js:3799-3800`). ⇒ [H] wg litery
  zakresu odpada (§1.1 (5), D-HUD-13).
- **Dla jakich rozkazów** (`[code]`, nieodtworzone w grze): linię mają statki z misją w locie — transport, kolonizacja,
  rekon, górnictwo, `moveToPoint` (misja `move_to_point`; także odwrót i dok), faza powrotu. Bez linii: patrol, eskorta,
  pościg, przechwycenie i walka — te rozkazy misji nie tworzą (MOS sam steruje pozycją — `MovementOrderSystem.js:763+`,
  `:1215+`, `:1819+`), a preempcja VO-3 zeruje przy rozkazie starą misję (`:423`; flaga `unifiedVesselOrders`);
  przechwycenie ma stożek, walka — pierścień starcia. Bez linii są też statki zadokowane i na orbicie. Gałęzie
  `_orderLineColor` dla walki, patrolu i pościgu nie mają więc dziś linii, na której by się pokazały.
- **Łańcuch `pendingOrder` i warp:** widać tylko bieżący odcinek. Skok warp zaczyna się natychmiast
  (`VesselManager.dispatchInterstellar`, `:924`; od razu `in_transit`, `systemId = null`, `:1010-1014`), sprite znika z
  oglądanego układu (`_syncVesselPositions`, `:5121-5127`), przylot — na obrzeżu 30 AU (`_tickInterstellar`, `:2986`)
  ⇒ **trasa warp dziś nie istnieje**.
- **Obce statki:** linia widoczna wyłącznie przy jakości `'detailed'` (`:5375-5376`), której nie nadaje żaden producent
  ⇒ **trasy obcych nigdy się nie pokazują** (Finding 509).
- **Animacja i pauza:** linie nie są animowane; wzór liczony od statku przesuwa się razem z nim; w pauzie stoją (brak
  zdarzeń). Komentarz flagi `fcOrderLines` („animowane linie rozkazów (kolor/strumień/grot)”, `GameConfig.js:207`) jest
  nieaktualny `[git]` — strumień i grot usunięto w `5ec0e1f` (reforma detekcji); flaga steruje dziś tylko kolorem.
- **Pomiar ZF gy120** (`results/inventory_1600_v2`): w oglądanym układzie 2 linie — Kurier i Smok II, transport →
  Nowa Ziemia, 0x66ddaa, krycie 0,55, długość 12,05 / 9,8 j.; 10 innych statków z misją jest poza oglądanym układem,
  więc bez linii (zgodnie z filtrem), w tym wrogi „Rajder” w skoku (`systemId` null). **Linia ze zgłoszenia („Cu i Hv → Kurier →
  gwiazda”)** to trasa transportu Kuriera do Nowej Ziemi — Nowa Ziemia krąży 6,2 j. od gwiazdy, więc przy tym kadrze
  linia wygląda, jakby kończyła się na gwieździe; to nie zapas (0, 0).
- **Krótkie kropkowane odcinki przy Fobosie** `[measured]`: to **pierścienie zasięgu**, nie nitki plakietek, nie orbity
  księżyców i nie trasy. Dowód — warianty z wyłączaną warstwą (`results/followup_1600/F2_d40_*.png`,
  `results/inventory_1600_v2/S5v_fobos_d3_*.png`): bez pierścieni przerywane łuki znikają; bez orbit, bez tras i bez
  warstwy 2D — zostają. Pas pierścienia statku przy 40 j. ma 0,43 px, pierścienia placówki przy Fobosie z 3 j. — ułamek
  piksela; pas węższy niż piksel rasteryzuje się w kreski (Finding 508). Proste przerywane odcinki w tym samym kadrze to
  trasy Kuriera i Smoka II. Nitka plakietki jest ciągła; pierścienie księżyców przy filtrze domyślnym — ukryte.

### 2.10 A10 — motywy, tokeny, kolory na sztywno, kontrast `[code]` `[measured]`

**Gdzie właściciel wybiera.** Ekran tytułowy (`TitleScene.js`): `SS_THEMES` (`:16-59`) — 5 motywów → presety
`ambient_1` (Amber Noir), `ambient_2` (Cold Blue), `ambient_3` (Galactic Violet), `ambient_4` (Biopunk Green),
`neon_cyber`; kropka motywu (`:278`) → `_applyTheme` (`:116-169`) → `applyPreset` (`ThemeConfig.js:906-916`) +
`saveTheme` (localStorage `kosmos_theme_v1`) + `kosmos_ss_theme`. W grze — F7 (`ThemeOverlay`, debug) zmienia motyw
W TRAKCIE gry. **Zdarzenia zmiany motywu nie ma** — `applyPreset` / `applyTheme` mutują obiekt `THEME` w miejscu;
jedyny callback to CRT (`_crtUpdateFn`).

**Tokeny.** Obiekt JS `THEME` (`ThemeConfig.js:9-58`), nie CSS custom properties: powierzchnie (`bgPrimary`…), ramki,
tekst (`textPrimary`, `textSecondary`, `textLabel`, `textDim`, `textHeader`), akcent (`accent`, `accentDim`,
`accentMed`), statusy (`success`, `successDim`, `danger`, `dangerDim`, `warning`, `yellow`, `info`, `purple`, `mint`),
mapa (`orbitLine`, `orbitColony`, `starfield`, `vignetteEnd` — bez czytelnika, Finding 512; od H0 `orbitLine` /
`orbitColony` czytają orbity), fonty, CRT; 23 presety (sprostowanie 2026-10-22 — było „24”).
Token ostrzeżenia (`warning`) i alertu (`danger`) ma każdy motyw. Tokenu `text` NIE ma — mimo to czytają go dwa miejsca
jako wartość zapasową (`FleetPictureLogic.toneColor`, `:57-58`; `ThreeRenderer.js:7355`) — dziś nieosiągalne (ton zawsze
znany), w HUD nie powielać.

**Kto czyta tokeny.** Canvas 2D UI — tak, przy każdym rysunku. ThreeRenderer importuje `THEME` (`:49`), ale używa go
w jednym miejscu (glify trybu taktycznego, `:7355`); orbity, pierścienie, trasy, celowniki, linie handlu, POI i tryb
taktyczny mają własne hexy.

**Kolory na sztywno warstwy HUD mapy** (pełna lista z liniami — `results/hexes_hud.txt`, 223 trafienia: ThreeRenderer
149, UIManager 26, ColonyBuildingMarkers 12, VesselFxLogic 9, BottomControlBar 7, CombatFxConfig 6, MapLabelLayer 4):

| Element | Gdzie | Kolory |
|---|---|---|
| Pierścienie zasięgu | `ThreeRenderer.js:158-159` | 0x44ccff · 0xffcc44 |
| Orbity planet / księżyców / planetoid | `:2634-2638`, `:2704-2708`, `:2719`, `:2467`, `:2921` | 0x003828 · 0x005540 · 0x007852 · 0x553322 · 0x00ccff · 0xffc832 · 0x445566 · 0x554433 |
| Trasy | `_orderLineColor` `:7062-7074`, najechanie `:195` | 0xff5544 · 0xffaa44 · 0x44ccff · 0xcc88ff · 0x66ddaa · 0xff8866 · 0x9fffe6 |
| Stożek przechwycenia | `:146-151` | 0x00ffff |
| Celownik wroga | `:172` | 0xff4466 |
| Ping celu (tryb taktyczny) | `:186` | 0x66ddff |
| Puls ruchu | `:1175-1177` | 0x88ffcc · 0x88ddff |
| POI | `:252-256` | 0x5588ff · 0x33ff66 · 0xff3333 · 0xffaa22 · 0xaa44ff |
| Etykiety CTRL | `:3324-3377` | #ffd866 · #9effc4 · #b0b0c0 · #a08060 · #888 · #ff4466 · #44cc66 · #8fb8ff |
| Podpowiedź statku (DOM) | `:3647-3727` | #ff8888 · #88ff99 · #b0c4b0 · #66aa88 · #a0a0c0 · #1a6e50 · rgba(6,12,20,0.95) |
| Plakietki | `MapLabelLayer.js:32`, `:180`, `:204`, `:422` | #8fb8ff · rgba(6,10,16,0.55) · rgba(8,12,20,0.82) · rgba(8,12,20,0.80) |
| Ramki RTS statków, paski paliwa, plakietka trybu taktycznego | `UIManager.js:2580-2708` | rgba(140,255,200,…) · rgba(160,220,200,…) · #44cc66 · #6688ff · rgba(0,0,0,0.5–0.55) · rgba(8,12,20,0.85) |
| Kolor frakcji statku | `VesselFxLogic.js:197-206` | 0x44cc66 · 0xff4466 · 0x888888 |
| Pierścień starcia (CP27) | `VesselFxLogic.js:108` | 0xff5544 |
| Chip ⚔ (zapasowe) | `BottomControlBar.js:296-302` | rgba(60,60,60,0.6) · #ff4466 |
| Tło najechania przycisków pasa | `BottomControlBar.js:214, 310, 320, 332` | rgba(255,255,255,0.08) |

**Kontrast ról** (`results/theme_contrast.json`, `results/theme_roles.json`; WCAG + ΔE2000, symulacja daltonizmu
Machado 2009 przy nasileniu 1,0; „najgorszy” = minimum z oka normalnego, protanopii, deuteranopii i tritanopii):

| Motyw | accent (primary) | danger | warning | ΔE primary↔danger (najgorszy) | ΔE primary↔warning (najgorszy) | WCAG na czerni: primary / danger |
|---|---|---|---|---|---|---|
| Amber Noir | #c49830 | #cc4433 | #dd8833 | 35,0 (13,1 — deuteranopia) | 12,6 (**0,44** — deuteranopia) | 7,9 / 4,4 |
| Cold Blue | #4090c0 | #cc4455 | #ddaa55 | 49,3 (32,7) | 49,6 (46,0) | 6,0 / 4,5 |
| Galactic Violet | #a060c0 | #cc4455 | #cc9955 | 27,4 (21,2) | 50,8 (18,2) | 4,9 / 4,5 |
| Biopunk Green | #50a060 | #cc5544 | #ccaa44 | 57,6 (**6,9** — deuteranopia) | 28,9 (10,7) | 6,5 / 5,0 |
| Neon Cyber | #ff2288 | #ff4466 | #ffaa44 | 10,7 (**0,75** — tritanopia) | 48,6 (19,7) | 5,8 / 6,3 |

- Kontrast luminancji primary↔alert jest niski we WSZYSTKICH motywach (WCAG 1,03–1,9) — rozróżnia je wyłącznie barwa;
  dlatego miarą jest ΔE z symulacją daltonizmu, a alert potrzebuje drugiego kanału poza kolorem (dwie obwódki, wektor,
  treść — zakres pkt 3 to już daje).
- `info` = `accent` w Amber Noir i Cold Blue (ΔE 0) — `info` nie nadaje się na żadną rolę HUD.
- **Reguły ról zmierzone** (minimum najgorszego ΔE z trzech par primary / alert / foreign): **B2** — foreign =
  `textPrimary`, alert = `danger`, a `warning`, gdy najgorsze ΔE(primary, danger) < 10: 13,1 / 27,0 / 21,2 / 10,7 /
  17,5 (Biopunk Green i Neon Cyber biorą `warning`). Dosłowne „primary ostrzegawczy → warning” daje w Amber Noir 0,44.
  „foreign = danger, alert = warning” — 0,4 / 20,1 / 14,9 / 6,9 / 0,8; „foreign = purple” — primary↔foreign od 2,8
  (Cold Blue). → D-HUD-2.
- **Potok 3D przesuwa barwy:** ACES Filmic (ekspozycja 1,12, `ThreeRenderer.js:289-290`) zmienia kolor linii 3D o ΔE
  4,3–11,1 (np. Amber Noir accent #c49830 → #d2b143) — elementy HUD w 3D nie trafią dokładnie w token motywu; elementy
  2D trafią.

### 2.11 A11 — klawisze `[code]`

**Zajęte na mapie** (`GameScene.js` — `keydown` `:4718`, `keyup` `:4877`):
- przytrzymania: Ctrl — etykiety wszystkich obiektów (`:4731`), Shift — czysty widok (`:4742`, w trybie cywilizacji);
- Escape — kaskada (lot wstępu, picker, overlay, okno potwierdzenia, zaznaczenie; `:4725`, `:4751+`), Enter — picker
  trasy (`:4770`), Tab / Shift+Tab — statki (`:4805`);
- litery overlayów przez `OverlayManager.handleKey(e.key)` (`:4818`; mapa `OverlayManager.js:19-45`, bez rozróżnienia
  wielkości liter): **c e h d f t s i w g u o l n m k** (+ **p** przy `FEATURES.populationOverlay`);
- `switch (e.code)` (`:4822+`): Space — pauza; Home i KeyH — reset widoku (H w trybie cywilizacji przejmuje wcześniej
  overlay kolonii); KeyY — tryb taktyczny; Comma / Period / KeyB — outlinery (U2-4); Digit1–Digit5 — prędkości;
  BracketLeft / BracketRight — wolniej / szybciej; KeyQ / KeyW / KeyE — akcje generatora (tylko poza trybem
  cywilizacji); F7 — panel motywu; Ctrl+Shift+R — rejestrator (`:4866-4872`).
- osobne konteksty (nie mapa): `ColonyOverlay` — strzałki / WASD przy otwartej mapie kolonii (`ColonyOverlay.js:5675-5678`),
  modale, `BattleView3D`, globus.

**Wolne na mapie w trybie cywilizacji:** litery **a j q r v x z** (+ **p** przy fladze OFF; samo R — Ctrl+Shift+R to
rejestrator); cyfry **6 7 8 9 0**; klawisze `Minus`, `Equal`, `Backquote`, `Slash`, `Semicolon`, `Quote`, `Backslash`
(`e.code`); End, PageUp, PageDown, Insert; strzałki; F2, F4, F8, F9 (F1, F3, F5, F6, F10–F12 — przeglądarka). Z liter chipów (pkt 7) wolne jest tylko **R** — T, E, O, H należą do overlayów. Shift
i Alt odpadają (czysty widok; menu przeglądarki). → D-HUD-14.

### 2.12 A12 — budżet `[measured]`

Pomiar w grze (`results/followup_1600/followup.json`; RTX 3070, okno 1600×1041, `pixelRatio` 1,5; mediany serii; render
3D z synchronizacją GPU przez odczyt 1 piksela; „warstwy HUD” w pomiarze 3D = pierścienie zasięgu, linie tras i orbity
planetoid — orbity planet zostały w obu wariantach):

| Kadr | Pierścienie / trasy / orbity | `_syncSensorOverlay` | `_syncVesselPositions` | etykiety (`draw` / statki) | cały `_draw()` UI z etykietami / bez | render 3D z warstwami HUD / bez | wywołania rysowania / linie |
|---|---|---|---|---|---|---|---|
| układ, 450 j. | 15 / 2 / 4 + 18 planetoid | 0,013 ms | 0,003 ms | 0,014 / 0,044 ms | 0,75 / 0,67 ms | 2,42 / 1,90 ms | 99 / 1858 (bez: 49 / 128) |
| gwiazda, 60 j. | jw. | 0,008 ms | 0,002 ms | 0,154 / 0,045 ms | 0,75 / 0,65 ms | 2,43 / 1,99 ms | 116 / 1858 (bez: 66 / 128) |
| Nowa Ziemia, 40 j. | jw. | 0,008 ms | 0,002 ms | 0,149 / 0,038 ms | 0,91 / 0,79 ms | 2,29 / 1,79 ms | 100 / 1858 (bez: 50 / 128) |

Przebudowy okresowe: `_rebuildAllOrbits` 0,07 ms, `_rebuildPlanetoidOrbits` 0,22 ms; ramki zaznaczenia 0,017 ms.
- Dzisiejsze warstwy HUD w 3D kosztują 0,45–0,52 ms renderu na klatkę (pierścienie jako przezroczysty `DoubleSide` — po
  2 wywołania na pierścień; 18 orbit planetoid = 1730 z 1858 odcinków linii); etykiety 2D — 0,08–0,12 ms.
- Pętla UI rysuje tylko przy `_dirty || _animating || timeDirty (100 ms, gra biegnie) || kamera w ruchu`
  (`UIManager.js:2181-2201`) — animacja HUD rysowana w `#ui-canvas` wymusza przerysowanie CAŁEGO UI (0,75–0,9 ms) w każdej
  klatce, dopóki trwa; marsz kresek tras trwa zawsze, gdy gra biegnie i trasa jest widoczna.
- **Proponowany budżet:** warstwa HUD ≤ 0,5 ms na klatkę (CPU, Canvas) w kadrach S0/S1/S4/S5 zapisu ZF w oknie
  1600×1041, przy wyłączonych dzisiejszych pierścieniach i trasach 3D (które HUD zastępuje); pomiar w każdej bramce.

### 2.13 A13 — flagi `FEATURES.*` `[code]` `[measured]`

- `GAME_CONFIG.FEATURES` (`GameConfig.js`) — zwykły obiekt; `window.KOSMOS.gameConfig === GAME_CONFIG` (zmierzone).
- **Warstwy 2D** czytają flagę przy każdym rysunku (`UIManager._draw`, np. `mapLabels` `:2323`) ⇒ przełączenie z konsoli
  działa od następnej klatki, także w pauzie.
- **3D** czyta flagę w syncu (`m4SensorOverlay` — `_syncSensorOverlay`, `:6079`; `fcOrderLines` — kolor nowej linii) albo
  przy budowie materiału (`dayNightAtmosphere`, `sceneDepthUnification` — `GameConfig.js:503`, `:542`) ⇒ zmiana widoczna
  dopiero po następnym zdarzeniu (w pauzie — nigdy) albo po wejściu do INNEGO układu (lekcja V3); F5 wczytuje
  `GameConfig.js` z pliku, więc przełączenie z konsoli przepada.
- **Wykonalność `hudRadar` / `hudLabels` / `hudRoutes` (+ `hudOrbits`, `hudAttention`) — tak**, przy dwóch warunkach:
  ścieżka OFF = dzisiejszy kod co do bitu (nowa warstwa obok, stara nietknięta i wyłączana tylko przy ON), a warstwy 3D
  (orbity) przebudowują się przy zmianie flagi i motywu same — inaczej bramka w pauzie mierzy ciszę. Brak klucza = OFF;
  ON domyślnie dopiero po bramce kroku (wzór `mapVesselPanelCompact`, `GameConfig.js:244`). → D-HUD-15.

### 2.14 A14 — otwarte findingi, których dotyka arkusz (tylko relacja)

- **503** (strefa stacji na gwieździe) — H2 buduje strefy etykiet od nowa; przy D-HUD-5 503 zamyka się w H2.
- **485** (podpowiedź najechania zdradza statek ukryty mgłą) — HUD nie dotyka podpowiedzi, ale druga linia przy hover
  musi czytać picker z `visibleOnly`, inaczej powieli 485.
- **490** (prawy klik nad kanwą UI otwiera menu mapy) — dotyczy też chipów (H4): prawy klik w chip otworzy menu pod nim
  (`GameScene.js:6083-6084` przepuszcza cel `CANVAS`) → D-HUD-17.
- **493** (karta ciała po fokusie leży na tarczy) — nawiasy ⌜ ⌟ (D-HUD-c) i etykiety przy ciele znajdą się pod kartą;
  kotwica karty poza zakresem (okna).
- **497** (strzałki krawędzi bez plakietek) — nowe etykiety statków (H2) nie mogą odziedziczyć wczesnego `return`.
- **502** (tarcza gwiazdy niezależna od klasy) — progi LOD liczone w px tarczy są na nią odporne.
- **501 / V-268** (podłoga zoomu przy gwieździe) — ping i nawiasy przy bliskim kadrze gwiazdy wygaszają się po px tarczy.
- **487** (pierwszeństwo tarczy ciała przed statkiem) — ta sama reguła dla etykiet (D-HUD-5).

---

## 3. Findingi #504–#555 (rejestr macierzysty; 517–521 z H0, 522–527 z H1, 528–530 z paczki A, 531–543 z inwentarza reformy zakładek, 544–548 z T3, 549–552 z T1, 553–555 z T2 reformy zakładek)

| # | | Treść | Kierunek |
|---|---|---|---|
| **504** | 🟠 | **Dziennik zdradza nazwę wrogiego statku przy jakości „rumor”.** `UIManager.js:1493-1513` subskrybuje `vessel:proximityEnter` (wykrycie — dla gracza zasięg `sensorRangeAU × tech`, w ZF 11,52 AU) i pisze `log.m4.proximityContact` z `enemy.name`, bez pytania o wywiad; ta sama para ma w tej chwili jakość `rumor` (`IntelSystem._observeVessel`, `:411-412` — `contact` dopiero poniżej 0,3 AU; sensor-lock — 1,38 AU), a mapa pokazuje „❓ niezidentyfikowany kontakt” (`ThreeRenderer.js:3647`). Reguła repo: Dziennik o statkach od `contact` (`CLAUDE.md`, `intel:vesselContactChanged`). Wniosek z kodu (w ZF brak wroga w zasięgu). | osobny drobny krok (Dziennik) — **podpis 2026-10-21: NIE w kroku arkusza**; alerty HUD (H4) stosują tę regułę — bez nazwy poniżej `contact` |
| **505** | ✅ | **Pierścień radaru statku pokazuje stałe 0,3 AU, a mechanika liczy inne zasięgi.** `_syncSensorOverlay` (`ThreeRenderer.js:6101-6105`) bierze `GAME_CONFIG.SENSOR_LOCK_AU` bez mnożnika techu i bez kadłuba; detekcja: wykrycie = `sensorRangeAU` kadłuba × `sensor_range` (`ProximitySystem.js:322-333`), ujawnienie = 0,3 × tech (`:346-352`). Zmierzone (ZF gy120): mnożnik 4,608 ⇒ wykrycie 11,52 AU, ujawnienie 1,38 AU — pierścień 38× i 4,6× za mały. | ✅ **H1** — `a756fab` (przy `hudRadar` ON): promień radaru statku = zasięg WYKRYCIA z jednej reguły (`DetectionRange.vesselDetectionRangeAU`, ta sama co `ProximitySystem`; ZF: 11,52 AU, odczyt „11,5 AU”); zasięg ujawnienia — druga linia etykiety (H2); przy OFF — jak dziś |
| **506** | ✅ | **Pierścienie radaru kolonii AI.** `ThreeRenderer.js:6114` iteruje `getAllColonies()` bez terminu właściciela; kolonia AI w oglądanym układzie dostaje bursztynowy pierścień o promieniu z poziomu JEJ obserwatorium (1/3/6/15 AU, ∞ → 35) — gracz widzi poziom obserwatorium AI, a cudze pokrycie wygląda jak własne; detekcja liczy wyłącznie kolonie gracza (`ObservatorySystem.js:589-591`). Wniosek z kodu (w ZF brak kolonii AI w układzie domowym). | ✅ **H1** — `a756fab` (ON): radar wyłącznie kolonii gracza (`isPlayerColony`); przy OFF — jak dziś; orbity kolonii AI — 518 |
| **507** | ✅ | **Pierścienie statków zadokowanych i w rezerwie.** Filtr `_syncSensorOverlay` (`:6094-6099`) nie pyta o stan ani o `isInService`: statek zadokowany (bez sprite'a, `:5133-5137`) dostaje pierścień w środku kolonii — w ZF 8 z 10 pierścieni statków, po 3 nałożone w Nt i w Nowej Ziemi („pełne niebieskie elipsy”); kadłub w rezerwie nie wykrywa (`ProximitySystem.js:75-78`), a pierścień ma. | ✅ **H1** — `a756fab` (ON): statki tylko w służbie, zadokowany wyłącznie zaznaczony (okrąg w środku ciała postoju); przy OFF — jak dziś |
| **508** | ✅ | **Pas pierścienia = 1,5 % promienia, więc grubość na ekranie od ułamka piksela do kilkudziesięciu.** `_upsertSensorRing` (`:6149`: wewnętrzny 0,985 × zewnętrzny; komentarz `:6146-6148` mówi „~3 %”). Zmierzone: statek 0,3 AU przy 40 j. — promień 29 px, pas 0,43 px; Nowa Ziemia 35 AU przy 40 j. — 701 px / 10,5 px. Pas węższy niż piksel rasteryzuje się w kreski — to są „krótkie kropkowane odcinki przy Fobosie” (§2.9). Stała szerokość ekranowa jest w repo (`engagementRingBand`, `VesselFxLogic.js:115`, CP27). | ✅ **H1** — `a756fab` (ON): pierścienie 3D wyłączone, granica 2D o stałej szerokości na ekranie (kropki 1,5 px co 6 px — korekta 1b); przy OFF — jak dziś |
| **509** | ✅ | **Trasa obcego statku nie pokazuje się nigdy.** `_applyVesselIntelVisibility` (`ThreeRenderer.js:5375-5376`) pokazuje linię wyłącznie przy jakości `'detailed'`, a żaden producent nie nadaje statkowi `'detailed'` (`IntelSystem._observeVessel` `:411-412` — `rumor`/`contact`; `_onSensorLock` `:408` — `contact`; skan obserwatorium — `contact`; `recordSighting` — `rumor`) ⇒ gałąź martwa. | ✅ **paczka A** — `1664c84` A-2 (przy `hudRoutes` ON): trasa obcego statku tylko, gdy wykryty TERAZ (para wykrycia z własnym statkiem albo obserwatorium kolonii gracza) i jakość ≥ `contact` — reguła pulsu ruchu (SB43); `rumor` — nigdy; przy OFF — jak dziś |
| **510** | ✅ | **Po wczytaniu zapisu na pauzie orbity domu i kolonii są ukryte.** `_buildOrbit` (`:2706-2726`) czyta `window.KOSMOS.homePlanet` i `colonyManager.getColony` w chwili budowy sceny, zanim wczytywany zapis je odtworzy ⇒ obie orbity ukryte do pierwszej przebudowy — co 180 wywołań `_syncPlanetMeshes` (`:2425-2431`), czyli dopiero po odpauzowaniu. Zmierzone (ZF gy120): po wczytaniu orbita Nowej Ziemi `#005540`, ukryta (gałąź „życie” — `isHomePlanet` był wtedy fałszywy); po 4 s biegu — `#007852`, krycie 0,15, widoczna. | ✅ **H0** — `6464e4d` (przy `hudOrbits` ON): klucz synchronizacji orbit = flaga + epoka motywu + dom gracza, przebudowa w pętli renderu także w pauzie ⇒ orbita domu i kolonii widoczna od razu po wczytaniu (bramka H0, K1); przy OFF — jak dziś |
| **511** | ✅ | **Filtr orbit „Żadne” / „None” zostawia orbitę domu i kolonii** — `_restoreOrbitDefaults` (`:2627-2646`) i `_buildOrbit` (`:2715-2726`) pokazują je niezależnie od filtra; zmierzone (`orbits_none`). Etykieta `menu.orbitsNone` obiecuje brak orbit. | ✅ **H0** — `6464e4d` (ON): „Żadne” chowa wszystkie orbity, także dom i kolonie, poza orbitą zaznaczonego ciała (D-HUD-7 uzupełnienie 3b — §5.0; bramka H0, K4); przy OFF — jak dziś; chip [O] — H4 |
| **512** | ✅ | **Tokeny mapy w motywach bez czytelnika.** `orbitLine`, `orbitColony`, `starfield`, `vignetteEnd` (`ThemeConfig.js:37-40` i każdy preset — np. Amber Noir `rgba(196,152,48,0.06)` / `rgba(196,152,48,0.20)`) — zero czytelników w `src/` poza `ThemeConfig.js`; orbity mają zaszyte 0x003828 / 0x005540 / 0x007852 — turkus w KAŻDYM motywie, także bursztynowym i fioletowym. | ✅ **H0** — `6464e4d`: `orbitLine` / `orbitColony` czyta `HudOrbitLogic` (ON; bramka H0, K1–K3); `starfield` / `vignetteEnd` — poza zakresem, dalej bez czytelnika |
| **513** | ✅ | **Nazwy etykiet ucięte bez wielokropka** — `MapLabelLogic.js:121` i `:160` (`.slice(0, 16)`), choć warstwa ma `_truncate` z „…” (`MapLabelLayer.js:129`); zmierzone: „Stacja Nowa Ziem”. | ✅ **paczka A** — `5a6d953` A-1 (przy `hudLabels` ON): pełne nazwy, „…” tylko przy braku miejsca; przy OFF — jak dziś |
| **514** | ✅ | **Etykiety mapy wychodzą poza obszar mapy i nakładają się w paśmie przejścia LOD.** (a) `MapLabelLayer` nie ma clipu ani kadru, a górna belka rysuje się PRZED etykietami (`UIManager.js:2223` wobec `:2323-2331`) — plakietki ciał nad kadrem malują się na belce: zmierzone „Nt” na belce przy 12 j. (`S4_nowaZiemia_d12.png`), plakietki do y = −29 px przy Fobosie z 1,5 j., oba okna. (b) Znaczniki LOD (`_drawMarker`) nie biorą udziału w anti-overlap (`stackLabels` — tylko plakietki), a w paśmie 150–215 j. rysują się razem z plakietkami: przy 200 j. 10 nakładających się par, w tym znaczniki Nowej Ziemi, Nowego Księżyca i stacji nałożone w 88–95 % (oba okna) — zgłoszone „zachodzą na siebie”. | ✅ **paczka A** — `5a6d953` A-1 (ON): etykiety na `#hud-canvas` pod belkami (kolejność z konstrukcji — D-HUD-1), kadr = obszar mapy z `MapInsets`, anti-overlap WSZYSTKICH etykiet jednym przebiegiem (zwinięte „+N” i szyna w nim); scena 200 j.: 10 nakładających się par → 0 (keeper `hud_labels_smoke` L2); przy OFF — jak dziś |
| **515** | ✅ | **Karta ciała leży pod etykietami mapy** — w rysowaniu (`BottomContext.draw`, `UIManager.js:2269`; etykiety `:2323-2331`) i w kliku (etykiety `:2008`, karta `:2043`): plakietka albo strefa stacji nad kartą zabiera klik karcie. Panele pływające przeniesiono nad etykiety w U2-4 (483) — karta ciała została. Wniosek z kodu, nieodtworzony. | ✅ **paczka A** — `5a6d953` A-1 (ON): etykiety pod kartą w rysowaniu (`#hud-canvas` pod `#ui-canvas`) i w kliku (etykiety HUD w `UIManager.handleClick` PO karcie ciała); przy OFF — jak dziś |
| **516** | ✅ | **Pierścień radaru statku w skoku warp zostaje w oglądanym układzie.** Filtr `v.systemId && v.systemId !== activeSys` (`ThreeRenderer.js:6098`) przepuszcza `systemId === null` (tranzyt warp — `VesselManager.dispatchInterstellar`, `:1014`; stan `in_transit`, pozycja sprzed skoku), a sprite filtruje ściśle (`vessel.systemId === activeSys`, `:5121-5127`) ⇒ statek znika, jego pierścień zostaje w punkcie odlotu na cały czas skoku. Rodzina „globalne id ≠ położenie”. Wniosek z kodu (w ZF brak własnego statku w skoku). | ✅ **H1** — `a756fab` (ON): filtr układu ścisły (`systemIdOf`) — statek w skoku bez radaru; przy OFF — jak dziś |
| **517** | ⚪ | **Pojedyncze pole koloru w panelu motywu (F7) nie podbija epoki motywu.** `ThemeOverlay.js:264`, `:270`, `:361` zapisują `THEME[key] = …` wprost, z pominięciem `applyTheme`, więc licznik epoki (`themeEpoch`, D-HUD-15) stoi — warstwy 3D (orbity H0) przyjmują nową barwę dopiero przy najbliższej przebudowie (zdarzenie, co 180 synchronizacji fizyki, zmiana układu), w pauzie — wcale. Paleta orbit ma pamięć po WARTOŚCIACH tokenów (`orbitPalette`, keeper `hud_orbits_smoke` O8c) — brakuje wyłącznie sygnału. Wniosek z kodu; bramka H0, punkt 9. | drobny krok poza arkuszem — 3 linie w `ThemeOverlay` (`applyTheme({ [key]: v })` albo podbicie epoki); rodzina 520, 521 |
| **518** | ⚪ | **Orbity kolonii AI wyróżnione jak kolonie gracza.** Rola „kolonia” orbity planety z `colonyManager.getColony(id) != null` — bez terminu właściciela (`ThreeRenderer.js:2647`, `:2731` — ścieżka OFF; `:3014` — ścieżka ON H0): przy ON barwa `orbitColony` motywu GRACZA i widoczność niezależna od filtra (poza „Żadne”). Semantyka sprzed H0 zachowana świadomie. Rodzina 506. Wniosek z kodu (w ZF brak kolonii AI w układzie domowym); bramka H0, punkt 10. | do decyzji — osobno (radar kolonii AI zamknięty w H1 — 506; tu orbity) |
| **519** | ✅ | **SHIFT przy biegnącej grze kasował orbity planetoid na stałe.** Okresowe odświeżenie orbit (co 180 synchronizacji fizyki, ok. 3 s) przebudowuje też orbity planetoid, a `_rebuildPlanetoidOrbits` (`ThreeRenderer.js:2889-2914`) kopiuje widoczność ze starych linii — w czystym widoku ukrytych ⇒ po puszczeniu Shift orbity planetoid zostają ukryte, a każde kolejne odświeżenie kopiuje to dalej (do zmiany filtra). Zmierzone w grze (sonda `probe_shift_running_h0.mjs`, Shift 6 s): kod sprzed H0 — 18/18 → 0/18 i 0/18 po kolejnych 7 s; H0 (ON) — 18/18 i 18/18; bramka H0, K6 (kontrola `ad65e47`: 19 → 1). | ✅ **H0** — `6464e4d` (ON: `_hudRebuildPlanetoidOrbits` od zera, widoczność po SHIFT liczona ze stanu); przy OFF zostaje (OFF = kod sprzed H0) |
| **520** | ⚪ | **Klik w przycisk panelu motywu (F7) przechodzi do mapy jako klik w pustkę.** Globalny `click` na `window` (`GameScene._setupMouseInput`, `:5462`) ma strażniki dla modali i menu ☰ (`.kosmos-menu-panel`, `:5483`), ale nie dla `ThemeOverlay` (panel bez klasy i bez `stopPropagation`) ⇒ klik w „⚡ Neon Cyber” odznacza zaznaczone ciało (w kodzie sprzed H0 — wraz z przebudową orbit; stąd orbita domu w kontroli K2 bramki H0, to nie naprawa 510). Czy ciało pod przyciskiem zostałoby zaznaczone — niezmierzone. Bramka H0, punkt 16. | drobny krok poza arkuszem — strażnik klasy panelu albo `stopPropagation`; rodzina 517, 521 |
| **521** | ⚪ | **Pola koloru panelu F7 dostają wartości rgba.** `ThemeOverlay.js:442` (`controls.picker.value = THEME[key]`) wpisuje do `<input type="color">` tokeny w formie `rgba(…)` (np. `orbitLine` / `orbitColony` w każdym presecie), a pole przyjmuje wyłącznie `#rrggbb` ⇒ ostrzeżenia konsoli przy każdym otwarciu F7. Sprzed H0; zgłoszenie właściciela z bramki H0. | drobny krok poza arkuszem (konwersja `rgba` → `#rrggbb` w panelu); rodzina 517, 520 |
| **522** | ⚪ | **`window.KOSMOS.planetGlobeOpen` nie ma pisarza.** Czytają go `UIManager.js:2008` (klik plakietek mapy), `:2219` (etykiety), `OutlinerColumn.js:70` i od H1 `HudLayer` (reguła „globus”); w `src/` nikt go nie ustawia. Dziś bez skutku — globus planety żyje wyłącznie w overlayu kolonii, więc chowa wszystko reguła overlayu (bramka H1, K8: `"overlay"`); globus poza overlayem (np. podgląd z mapy) odsłoniłby nad sobą etykiety, outlinery i HUD. Wniosek z kodu (sesja H1). | do decyzji — pisarz w miejscu otwarcia globusa albo usunięcie flagi u czterech czytelników |
| **523** | ⚪ | **Pierścienie radaru 3D znikają po przełączeniu układu w pauzie (przed H1).** `switchSystem` → `_disposeAllMeshes` usuwa je, a odbudowuje dopiero `physics:updated` / `vessel:positionUpdate` / ☰ „Radar” ⇒ do pierwszej klatki gry oglądany układ jest bez radaru. Zmierzone: bramka H1, K10 linia 2 — 0 pierścieni w kontroli `e047f04` i w ścieżce OFF kodu H1. Przy `hudRadar` ON nie występuje (warstwa HUD liczy radar w każdej klatce rysunku). | przy ON — nie dotyczy; przy OFF (rollback) zostaje |
| **524** | ⚪ | **Rola `dim` w 4 z 5 motywów ekranu tytułowego różni się od `primary` tylko jasnością.** `textDim` w Amber Noir, Cold Blue, Galactic Violet i Biopunk Green = akcent z kryciem 0,32 (orbity — ten sam akcent: `orbitLine` 0,06, `orbitColony` 0,20); inny odcień tylko Neon Cyber (`rgba(220,190,210,0.25)`). D-HUD-2 wymaga, by role się różniły — raport kontrastu (`hudContrastReport`) liczy ΔE z kryciem tokenu na czerni, więc duże ΔE(primary, dim) bierze się z jasności, nie z barwy. Zmierzone (korekta 1b H1, `probes/contrast_1b.mjs`): granica radaru w `dim` — kontrast z tłem 1,09–1,12, ΔE od orbit domu i kolonii 0,3–2,3 (nieodróżnialna); powód wyboru `primary` na bramce H1. | paczka A: etykiety w rolach `primary` / `foreign`, `dim` wyłącznie w nazwach wraków przy CTRL (D-HUD-16) — odróżnialność `dim` od orbit w paczce A nie wystąpiła; zostaje: zmiana tokenu albo roli — decyzja właściciela |
| **525** | ✅ | **Odczyt zasięgu radaru pod plakietką stosu „◆ ×2”.** Plakietki mapy (`#ui-canvas`, nad HUD) i odczyt zasięgu przy najwyższej kresce głównej (HUD) bez wspólnej antykolizji — w K2 bramki H1 odczyt „1,0 AU” Fobosa wypada pod plakietką stosu. | ✅ **paczka A** — `5a6d953` A-1 (ON): odczyt zasięgu radaru jest przeszkodą wspólnego anti-overlap etykiet (keeper `hud_labels_smoke` L2h); plakietki stosu przy ON nie istnieją |
| **526** | ⚪ | **Podziałka radaru na małych okręgach („słoneczko”).** Kreski 10 / 16 px do wewnątrz mają stałą długość na ekranie, więc przy okręgu ~19 px (Fobos w widoku układu — bramka H1, K2) sięgają do 53 / 84 % promienia. | do decyzji (paczka A jej nie rozstrzygnęła) — propozycja: kreski ≤ ~30 % promienia na ekranie albo bez podziałki poniżej ~40 px |
| **527** | ⚪ | **Bramka H1 sprzed korekty 1b (K11 — czas JS warstwy) nie widziała kosztu rasteryzacji.** Przy S5 (kamera ~3 j. od Fobosa; okrąg 1 AU w rzucie ~1,7 mln px — przycięcie płaszczyzną bliską kamery) radar zbijał obraz: kod sprzed 1b 18,4 kl./s w sondzie (walidator, kontrola `bc62bdb`: 22–23 kl./s przy ~57 bez radaru), kropki 1b na całej ścieżce 6,0 kl./s — przy czasie JS `stroke()` ~0,005 ms. W H1 zamknięte przycięciem kropek do okna (`clipRunsToRect`, faza `lineDashOffset`; 60 kl./s); otwarta zostaje reguła pomiaru. | protokół od H2 (§4.0, aneks 2026-10-23): keepery budżetu klatek mierzą kl./s przy ruchu kamery, z warstwą i bez |
| **528** | ⚪ | **Kotwice kart na ścieżce OFF traktują px CSS jako logiczne.** Karta ciała (`computeFloatingPlacement` z `getBodyScreenPosition`, `BottomContext`) i panel stacji (`sp.x + 18` z `getStationScreenPosition`, `StationPanel`) dostają położenie w px CSS i stawiają kartę w px logicznych UI ⇒ przy skali UI ≠ 1 karta przesunięta: w oknie właściciela (skala UI 1,26) karta ciała stoi ok. 169 px za daleko w prawo, prosto na tarczy — część przyczyny 493. Przy `bodyCardSide` ON nie występuje (px logiczne z projektora HUD — `objectScreenDisc`). Sesja paczki A. | przy `bodyCardSide` ON — nie dotyczy; przy OFF (rollback) zostaje |
| **529** | ✅ | **Panel statku z boku modelu potrafi przykryć trasę i cel statku.** Reguła 493 (`BodyCardSideLogic`) chroni wyłącznie tarczę / model zaznaczonego obiektu; trasa HUD (A-2) i jej cel mogą wypaść pod panelem. Wniosek z kodu (sesja paczki A). | → reforma zakładek (ramy 2026-10-24: pływający panel statku znika — `TABS_REFORM_PLAN.md`) — ✅ T3 `496ab80` (2026-10-25; `TABS_REFORM_PLAN.md` §5.5) |
| **530** | ⚪ | **Dymek „Pozycja: (x, y)” przy kursorze nad pustą mapą może zasłaniać etykiety HUD.** Podpowiedź współrzędnych przy kursorze stojącym na pustej mapie leży nad warstwą HUD (`#ui-canvas`); walidator arkusza kontaktowego paczki A odstawiał kursor w róg okna, żeby nie wchodziła w kadry. Sesja paczki A. | do decyzji (polerka) |
| **531** | ✅ | **Podpowiedź mapy nad kolonią AI kłamie o właścicielu i zdradza populację.** `TooltipContent._planetContent` (`:146-153`) bierze kolonię z `colonyManager.getColony` (kolonie AI też tam są) i pisze „Właściciel: Imperium gracza” oraz populację, bez terminu właściciela i bez bramki wywiadu (kanon `SystemReveal.js:92` — populacja od `detailed`). Zmierzone (Polonia gy79): Akhernar h (`emp_001`, wywiad `contact`) — „Właściciel: Imperium gracza”, „Populacja: 55”. Rodzina 188, 506, 518. Inwentarz reformy zakładek (2026-10-24). | ✅ **drobny krok reformy zakładek** — `471191d` (2026-10-24): kolonia obca (`!isPlayerColony`) — właściciel i populacja wg osi właściciela kanonu `SystemReveal` (ta sama reguła co panel STRATCOM): nazwa imperium od `contact`, „obce imperium” od `rumor`, „nieznany” poniżej (decyzja właściciela — nie „Neutralne”), populacja od `detailed`; brak wywiadu ⇒ fail-closed; kolonia gracza bez zmian; zero nowych kluczy i18n. Keeper `tooltip_foreign_colony_smoke` 24/24; smoke przed / po w grze (Polonia — „Właściciel: Liga Spalonej Drogi”, bez populacji) — PASS. W T1 rozwinięcie zastąpi podpowiedź (D-TR-2) |
| **532** | ✅ | **Drugi klik w statek zadokowany przy planetoidzie nic nie robi.** `vessel:focus` (`ThreeRenderer.js:1213-1233`) szuka miejsca postoju tylko w `_planets` i `_moons`; planetoida → brak pozycji → kamera stoi, karty brak. Zmierzone (ZF): Fracht @ Nt, Dostawca II @ Cu i Hv — kamera STOI; kontrola: planeta i księżyc — kamera + karta. Reguła D-UI-5 (2. klik = focus) martwa dla statków placówek na planetoidach — prawy outliner, Dok taktyczny, Tab. Inwentarz reformy zakładek (2026-10-24). | ✅ **drobny krok reformy zakładek** — `da8b2c9` (2026-10-24): miejsce postoju szukane także w `_planetoids` (ta sama mapa, z której rysowane są placówki) — kamera na planetoidę (podłoga 0,3, zoom 0,8) + karta ciała, jak przy planecie; planeta i księżyc bez zmian. Keeper `docked_focus_planetoid_smoke` 17/17; smoke przed / po w grze (ZF — Fracht @ Nt, dwa kliki w prawym outlinerze) — PASS |
| **533** | ✅ | **Podpowiedź kolonii (`#colony-3d-tooltip`) bez limitu wysokości.** Lista budynków stolicy ZF wychodzi poza okno 1041 px i przykrywa pasek nawigacji; `top = min(sy − 10, innerHeight − 250)` zakłada ≤ 250 px (`ThreeRenderer.js:3957-3958`). Inwentarz reformy zakładek (2026-10-24). | ✅ **reforma zakładek T1** — `fc44de7` (2026-10-26; przy `labelHover` ON): kolonię opisuje rozwinięcie etykiety HUD (≤ 4 linie), `#colony-3d-tooltip` wygaszony (D-TR-2 (a)); przy OFF — jak dziś (`TABS_REFORM_PLAN.md` §5.6) |
| **534** | ✅ | **Esc nie zamyka karty ciała ani panelu stacji** — bez zaznaczonego statku otwiera menu ☰ (`GameScene.js:4758-4808`). Zmierzone (M3). Inwentarz reformy zakładek (2026-10-24). | ✅ **reforma zakładek T2** — `0ddbf05` (2026-10-26; przy `labelPin` ON): Esc zdejmuje przypięcie — po zaznaczeniu statku, przed overlayem; przy otwartym overlayu Esc należy do overlayu, nad oknem szczegółów ciała — do okna (zachowania przyjęte na bramce); przy OFF — jak dziś (`TABS_REFORM_PLAN.md` §5.7) |
| **535** | ⚪ | **Karta ciała zminimalizowana do doku zostaje „bieżącym zaznaczeniem”** (`readClickSelection.entityId` bez warunku minimalizacji, `ClickIntentLogic.js:85`) → klik w to ciało = kamera + karta wraca; panel stacji w doku daje `select` (`:81`, T2e). Zmierzone (M4). Inwentarz reformy zakładek (2026-10-24). | znika z dokiem — reforma zakładek T4 (D-TR-6 (a)); tylko rejestr |
| **536** | ✅ | **Trzy warstwy najechania naraz** — statek: `#colony-3d-tooltip` (od razu) + druga linia etykiety HUD + `#kosmos-tooltip` (po 500 ms); zaznaczona kolonia: K4 + K5 + K6. Zmierzone (M6). Inwentarz reformy zakładek (2026-10-24). | ✅ **reforma zakładek T1** — `fc44de7` (2026-10-26; przy `labelHover` ON): jedna warstwa — rozwinięcie etykiety HUD; `#colony-3d-tooltip` (kolonia, statek) i ciałowo-statkowa część `#kosmos-tooltip` wygaszone, zostają podpowiedź budynku (K3), POI, współrzędne pustej mapy (D-TR-2 (a)); przy OFF — jak dziś (`TABS_REFORM_PLAN.md` §5.6) |
| **537** | ✅ | **Karta ciała, panel stacji i panel statku otwierają się niezależnie i nakładają** — przy stacji na orbicie planety i statku obok trzy prostokąty leżą na sobie, karta ciała całkowicie przykryta. Zmierzone (M1). Inwentarz reformy zakładek (2026-10-24). | reforma zakładek T2 / T3 (D-TR-5 (a)) — po T3 (`496ab80`) częściowo: karta ciała i panel statku razem (D-TR-14), karta omija panel (544) — ✅ **T2** `0ddbf05` (2026-10-26; przy `labelPin` ON): karta ciała i panel stacji się nie rysują, jedno przypięcie naraz (ciało albo stacja), panel statku osobno — przypięta etykieta przenosi się obok panelu statku; przy OFF — jak dziś (`TABS_REFORM_PLAN.md` §5.7) |
| **538** | ⚪ | **Literały i surowe identyfikatory na czterech powierzchniach** (klasa 113 / 495): karta — typ surowym `planetType`, `-type star`, „Luminosity”, „HZ”, „lat” w ORBICIE, złoża surowym `resourceId`; panel stacji — „Układ: sys_home” (`:228`); panel statku — etykieta rozkazu („→ MoveTo:”, „⚔ Pursue:”, „⚠ Order blocked: <slug>”, „(mission paused)”, „↻ Patrol manualny” — `FMO :8605-8649`), „📦 Cargo:” (`:7751`); podpowiedzi DOM — „wolne”, „Budynki:”, „Energia:”, „ETA … lat”, „Etap:”; `#kosmos-tooltip` — „Typ: rocky”, „[in_transit]”. `check-i18n` ich nie widzi (bez polskich znaków / surowe pola). Inwentarz reformy zakładek (2026-10-24). | pola przechodzące do rozwinięć i panelu — przez `t()` w T1–T3; reszta w T4 |
| **539** | ✅ | **Klik ciała na mapie zdejmuje zaznaczenie statku, klik ciała w lewym outlinerze — nie** (`GameScene._selectFromClickPick` `:6066` — gałąź kanwy bez celu). Zmierzone (M2, mapa); outliner — z kodu. Inwentarz reformy zakładek (2026-10-24). | reforma zakładek T3 (D-TR-14 (a) — klik ciała na mapie nie zdejmuje statku) — ✅ T3 `496ab80` (2026-10-25; `TABS_REFORM_PLAN.md` §5.5) |
| **540** | ✅ | **Panel stacji rysuje się i łapie klik nad otwartym overlayem pełnoekranowym** — także nad Technologiami, Dowództwem itd. (`UIManager.js:2388`, `:1983` bez `!isAnyOpen()`; zamysł S4-2 „coexist z colony”). Z kodu. Inwentarz reformy zakładek (2026-10-24). | ✅ **reforma zakładek T2** — `0ddbf05` (2026-10-26; przy `labelPin` ON): panel stacji nie rysuje się i nie łapie kliku, kółka, kursora ani przeciągania (`UIManager._stationPanelSurface`); stację opisuje przypięcie przy etykiecie; przy OFF — jak dziś (`TABS_REFORM_PLAN.md` §5.7) |
| **541** | ⚪ | **Chip doku nie zna układu** — przywrócenie karty ciała / panelu stacji z innego układu otwiera kartę bez kotwicy (róg obszaru mapy) dla obiektu spoza kadru, bez przełączenia układu (`BottomContext.js:544-551`, `StationPanel.js:390-410`). Z kodu. Inwentarz reformy zakładek (2026-10-24). | znika z dokiem — reforma zakładek T4 (D-TR-6 (a)) |
| **542** | ✅ | **Tryb Y: dwa panele statku naraz** — mini-panel Doku taktycznego i pływający panel statku (`UIManager.js:2397` bez warunku trybu Y). Z kodu. Inwentarz reformy zakładek (2026-10-24). | reforma zakładek T3 (D-TR-10 (a)) — ✅ T3 `496ab80` (2026-10-25; `TABS_REFORM_PLAN.md` §5.5) |
| **543** | ✅ | **Rozbiórka statku bez potwierdzenia** — jeden klik „🗑 Disband” → `fleet:disbandRequest` (`FMO :2732-2736` → `ColonyManager._disbandVessel`); nieodwracalne. Z kodu. Inwentarz reformy zakładek (2026-10-24). | reforma zakładek T3 (D-TR-13 (a)) — ✅ T3 `496ab80` (2026-10-25; `TABS_REFORM_PLAN.md` §5.5) |
| **544** | ✅ | **Karta ciała z boku tarczy wchodzi pod panel statku przy prawym outlinerze**, gdy tarcza stoi w prawej części kadru (arkusz T3: K4 — Thuban d, K12 — Nowa Ziemia): panel rysuje się na karcie i bierze jej kliki — róg z przyciskami zwiń / zamknij niedostępny, napisy karty prześwitują przez tło panelu. Zmierzone (arkusz T3). Reforma zakładek T3 (2026-10-25). | ✅ T3 strojenie 1 `496ab80` — panel statku przeszkodą karty ciała i panelu stacji (`BodyCardSideLogic.cardObstacles`; `TABS_REFORM_PLAN.md` §5.5) |
| **545** | ✅ | **Karta walki i panel statku przy outlinerze nachodzą na siebie w oknie 1280×720** (pas x 830–920): panel rysuje się na karcie i przykrywa „Obserwuj”, a klik w tym pasie szedł do karty walki — rysunek i klik niezgodne. W oknie właściciela bez wspólnego pasa. Zmierzone (arkusz T3, K10b). Reforma zakładek T3 (2026-10-25). | ✅ T3 strojenie 1 `496ab80` — karta walki przeszkodą kotwicy (`ShipPanelAnchorLogic`), przy ON klik panelu statku przed kartą walki (§5.5) |
| **546** | ⚪ | **Konfigurator misji nie zna statku** — zmiana zaznaczenia w kroku wyboru celu przenosi „WYBIERZ CEL — TRANSPORT” na nowy statek (`FleetManagerOverlay._missionConfig` bez id statku). Zmierzone na `e71ffad` i po T3 (sonda `obs_t3.mjs`). Reforma zakładek T3 (2026-10-25). | do decyzji (panel statku) |
| **547** | ✅ | **Polska etykieta rozbiórki po angielsku** — `fleet.disbandReturn` PL = „🗑 Disband (zwrot 75%)”; T3 powtarza ją w tytule okna potwierdzenia; `check-i18n` tego nie widzi (klucz istnieje w obu językach). Reforma zakładek T3 (2026-10-25). | ✅ T3 strojenie 1 `496ab80` — „🗑 Rozbiórka (zwrot 75%)” (§5.5) |
| **548** | ⚪ | **Karta ciała z boku tarczy przy pauzie i nieruchomej kamerze zostaje półprzezroczysta** — wjeżdżanie (`BottomContext._slideProgress`, przyrost na klatkę) nie podtrzymuje redrawu (`UIManager._animating` liczy tylko dziennik, górny pasek, nawigację i koniec gry). Widać na K12 w obu arkuszach T3 — także przed T3. Reforma zakładek T3 (2026-10-25). | reforma zakładek T2 (karta ciała znika) albo wjeżdżanie karty w `_animating` |
| **549** | ✅ | **Dymek mapy nad obcym statkiem przy wywiadzie `rumor` zdradza nazwę statku i imperium.** `#kosmos-tooltip` — treść z `TooltipContent._vesselContent` (`src/utils/TooltipContent.js:77-120`) bez pytania o wywiad: tytuł = nazwa statku, imperium, paliwo, wytrzymałość; zmierzone (arkusz T1, K9 przed: „Dostawca \| Imperium: Konsorcjum Siódmego Kręgu \| Paliwo: 0.0/20.0 \| …”), choć `#colony-3d-tooltip` w tej samej chwili mówi „Niezidentyfikowany kontakt” — wyciek mgły wojny (klasa 504). Reforma zakładek T1 (2026-10-26). | ✅ **reforma zakładek T1** — `fc44de7` (ON: dymek wygaszony, rozwinięcie etykiety obcego statku poniżej `contact` bez nazwy — „Niezidentyfikowany kontakt”); przy OFF zostaje (OFF = kod sprzed T1) |
| **550** | ✅ | **Słownik PL: `bodyType.Planetoid` = „Planetoid”** (angielskie słowo) — lewy outliner, okno szczegółów ciała (`BodyDetailModal`), od T1 rozwinięcie planetoidy (arkusz T1: K3, K5, K12). `check-i18n` tego nie widzi (klucz istnieje w obu językach). Reforma zakładek T1 (2026-10-26). | ✅ **reforma zakładek T1** — `fc44de7`: „Planetoida” (`pl.js:532`, jedna linia, zero nowych kluczy; słownik — bez flagi); linia dodana przy commicie po PASS, więc arkusz T1 pokazuje jeszcze „Planetoid” |
| **551** | ✅ | **Najechana etykieta rośnie o drugą linię i podskakuje o jej wysokość** (I8.3 sprzed T1) — zmierzone (arkusz T1, K12 przed: górna krawędź 352,8 → 339,8 px we wszystkich 5 motywach). Reforma zakładek T1 (2026-10-26). | ✅ **reforma zakładek T1** — `fc44de7` (ON: najechana etykieta stoi — górna krawędź i strona bez zmian, sąsiedzi ustępują i wracają — `placeLabelsPinned`, `makeYieldMemory`); przy OFF zostaje (OFF = kod sprzed T1) |
| **552** | ✅ | **Najechanie środka tarczy gwiazdy pokazuje dymek statku stojącego w pobliżu w rzucie** — promień najechania statku (28 px) wygrywa z tarczą (bliźniak 487 dla najechania); zmierzone (arkusz T1, K4 przed: `#colony-3d-tooltip` „Smok II”). Reforma zakładek T1 (2026-10-26). | ✅ **reforma zakładek T1** — `fc44de7` (ON: statek na tarczy tylko w rdzeniu sprite'a, gwiazda wygrywa — lustro reguły kliku, `resolveHoverTarget`); przy OFF zostaje (OFF = kod sprzed T1) |
| **553** | ✅ | **Karta ciała podaje „Odl.” od planety macierzystej także dla ciała z INNEGO układu** — `BottomContext.js:111-114` liczy `DistanceUtils.fromHomePlanetAU(entity)` bez terminu układu, a współrzędne są lokalne dla układu (gwiazda każdego układu w (0, 0)), więc liczba nie ma sensu. Zmierzone (arkusz T2, Polonia P1 przed: kolonia AI w innym układzie — „Odl: 1,38 AU”). Rodzina „globalne id ≠ położenie”. Reforma zakładek T2 (2026-10-26). | ✅ **reforma zakładek T2** — `0ddbf05` (przy `labelPin` ON): przypięcie podaje „Odl.” tylko dla ciał z układu domu (`LabelPinLogic.homeDistanceLine`); przy OFF karta jak dziś — znika w T4 (`TABS_REFORM_PLAN.md` §5.7) |
| **554** | ✅ | **„Mapa ciała” martwa dla obcej kolonii bez moich wojsk i bez pełnego skanu** — `bodyCardAction` (lustro `BottomContext._actionLabel`) daje przycisk, a `BottomContext._doAction` nic nie robi (podgląd obcej kolonii wymaga własnych jednostek na ciele albo `analyzed`). Na karcie ciała sprzed T2 i lustrzanie w przypięciu T2 przed strojeniem. Z kodu i keepera (`label_pin_smoke` P8g–P8j); w zapisach ZF i Polonia brak naturalnego przypadku (obie kolonie AI Polonii zbadane) — arkusz strojenia: scena z wyczyszczonym `analyzed`. Reforma zakładek T2 (2026-10-26). | ✅ **reforma zakładek T2, strojenie 1** — `0ddbf05` (przy `labelPin` ON): przycisk „Mapa ciała” tylko wtedy, gdy `_doAction` coś zrobi (`LabelPinLogic.mapActionWorks` — lustro bramek `_doAction`); przy OFF karta bez zmian (decyzja właściciela) |
| **555** | ⚪ | **Okno szczegółów ciała pokazuje „???” zamiast nazwy ciała niezbadanego** (`BodyDetailModal.js:62` — `explored ? body.name : '???'`), choć etykieta, przypięcie i lewy outliner pokazują nazwę (oś miejsca `SystemReveal`) — dwie reguły nazwy dla tego samego ciała (rodzina 372, `AI_GARRISON_PLAN.md` §6). Od T2 częściej na widoku („[ Raport ]” z każdego przypięcia). Reforma zakładek T2 (2026-10-26). | rejestr — do decyzji (jedna reguła nazwy ciała; polerka) |

Rejestr #504–#516 po fazie A: **13 wpisów — 🟠 5** (504, 505, 506, 514, 516) **· ⚪ 8** (507–513, 515). Wszystkie
otwarte; 504 — osobny drobny krok, reszta w krokach H0–H3. Pierwszy wolny: **517**.

Po H0 (2026-10-22): rejestr #504–#521 — **18 wpisów — ✅ 4** (510, 511, 512, 519 — przy `hudOrbits` ON) **· 🟠 5** (504,
505, 506, 514, 516) **· ⚪ 9** (507, 508, 509, 513, 515, 517, 518, 520, 521). Punkt 12 bramki H0 (tryb Y — wzmocnienie
orbit gaśnie przy restylu) — odsyłacz do **V-249**, bez numeru. Pierwszy wolny: **522**.

Po H1 (2026-10-24): rejestr #504–#527 — **24 wpisy — ✅ 9** (505, 506, 507, 508, 516 — przy `hudRadar` ON; 510, 511,
512, 519 — przy `hudOrbits` ON) **· 🟠 2** (504, 514) **· ⚪ 13** (509, 513, 515, 517, 518, 520–527). Obserwacja (b)
z korekty 1b — karta ciała zakrywa radar zaznaczonego ciała — to ten sam temat co **493** (`UI_PLAN.md` §6; tu §4.2a),
bez nowego numeru. Pierwszy wolny: **528**.

Po paczce A (2026-10-24): rejestr #504–#530 — **27 wpisów — ✅ 14** (509, 513, 514, 515, 525 — przy flagach paczki A ON;
505, 506, 507, 508, 516 — przy `hudRadar` ON; 510, 511, 512, 519 — przy `hudOrbits` ON) **· 🟠 1** (504) **· ⚪ 12** (517,
518, 520–524, 526–530). Z rejestru `UI_PLAN.md` §6 zamknięte w paczce A: 493 (przejściowo — reforma zakładek), 497, 503.
Cyjan z kadru 10 arkusza paczki A (najpewniej stożki przechwycenia `0x00ffff`) — pozycja D-HUD-16 dla paczki B (§5.0),
bez numeru. Pierwszy wolny: **531**.

Po inwentarzu reformy zakładek (2026-10-24; kandydaci przyjęci w całości — `TABS_REFORM_PLAN.md` §6.0, §7): rejestr #504–#543 —
**40 wpisów — ✅ 14** (bez zmian) **· 🟠 3** (504, 531, 532) **· ⚪ 23** (517, 518, 520–524, 526–530, 533–543).
Kolejność kroków (podpis 2026-10-24): 531 / 532 → reforma zakładek T3 → T1 → T2 → T4 → paczka B. Pierwszy wolny: **544**.

Po kroku 531 / 532 (2026-10-24, `471191d` · `da8b2c9`; bramka właściciela PASS): rejestr #504–#543 — **40 wpisów —
✅ 16** (14 jak wyżej + 531, 532) **· 🟠 1** (504) **· ⚪ 23** (517, 518, 520–524, 526–530, 533–543). Następny krok:
reforma zakładek T3. Pierwszy wolny: **544**.

Po T3 reformy zakładek (2026-10-25, `496ab80`; bramka właściciela PASS ze strojeniem 1): rejestr #504–#548 — **45 wpisów —
✅ 23** (16 jak wyżej + 529, 539, 542, 543, 544, 545, 547) **· 🟠 1** (504) **· ⚪ 21** (517, 518, 520–524, 526–528, 530,
533–538, 540, 541, 546, 548). 537 — częściowo (T3: D-TR-14 i przeszkoda 544; reszta — T2). Następny krok: reforma
zakładek T1. Pierwszy wolny: **549**.

Po T1 reformy zakładek (2026-10-26, `fc44de7`; bramka właściciela PASS — oglądanie, bez uwag do treści i wyglądu):
rejestr #504–#552 — **49 wpisów — ✅ 29** (23 jak wyżej + 533, 536, 549, 551, 552 — przy `labelHover` ON; 550 — słownik)
**· 🟠 1** (504) **· ⚪ 19** (517, 518, 520–524, 526–528, 530, 534, 535, 537, 538, 540, 541, 546, 548). Następny krok:
reforma zakładek T2. Pierwszy wolny: **553**.

Po T2 reformy zakładek (2026-10-26, `0ddbf05`; bramka właściciela PASS ze strojeniem 1): rejestr #504–#555 — **52 wpisy —
✅ 34** (29 jak wyżej + 534, 537, 540, 553, 554 — przy `labelPin` ON) **· 🟠 1** (504) **· ⚪ 17** (517, 518, 520–524,
526–528, 530, 535, 538, 541, 546, 548, 555). Z rejestru `UI_PLAN.md` §6 — **488** ✅ (przy `labelPin` ON: karta z glifem
„−” się nie rysuje, przypięcie ma „[ ✕ ]”). 548 — przy ON nie występuje (karta ciała się nie rysuje); status bez zmian.
Następny krok: reforma zakładek T5 (panel statku w idiomie etykiet — `TABS_REFORM_PLAN.md` §5.8), potem T4. Pierwszy
wolny: **556**.

---

## 4. Cięcie na kroki

### 4.0 Propozycja: H0 → H1 → H2 → H3 → H4 (zmiana wobec sugestii z promptu — uzasadnienie)

**Cięcie H0 → H4 PRZYJĘTE przez właściciela 2026-10-21** (§5.0).

Sugestia z promptu: H0 = flagi + role + orbity + okręgi → ping · H1 = etykiety + strefy + szyna + anti-overlap · H2 =
trasy · H3 = model uwagi + LOD + chipy + skróty · H4 = mikro-ruch. Audyt zmienia trzy rzeczy:

1. **Mikro-ruch nie jest osobnym krokiem.** Ping to główny rysunek radaru, marsz kresek — część trasy, fade-in —
   część etykiety; każdy z nich ma własną odpowiedź na pauzę (D-HUD-12). Osobny krok H4 znaczyłby drugą bramkę dla
   tych samych warstw. Animacja wchodzi z warstwą, którą animuje.
2. **LOD nie może czekać do H3.** Zwijanie „NOWA ZIEMIA +2” jest częścią układu szyny i anti-overlap (H2), a wygaszanie
   pingu i nawiasów przy bliskim zoomie — częścią radaru (H1) i nawiasów (H4). LOD wchodzi z warstwą.
3. **Pierwszy krok rozdzielony.** Orbity zostają w 3D (okluzja tarczą — V4), radar idzie do 2D (D-HUD-1): dwa różne
   nośniki i dwa różne problemy z motywem (3D nie widzi zmiany motywu — §2.10; 2D czyta token co klatkę). H0 = role
   + orbity (pierwszy widoczny konsument ról, w 3D); H1 = warstwa HUD 2D + radar (pierwszy konsument warstwy 2D). Każdy
   krok ma więc widocznego konsumenta i daje się sprawdzić na bramce.

Chipy zostają w ostatnim kroku (jak w sugestii): sterują warstwami, które muszą już istnieć.

**Wspólne dla każdego kroku:** nowa logika w czystych modułach testowalnych pod node (wzór `MapLabelLogic`,
`StationGroup`, `VesselFxLogic`); keeper z fail-first w ŚWIEŻYM klonie na commicie rodzica (keeper musi być czerwony
przed zmianą, zielony po; kontrole pinu zielone po obu stronach); sweep (dziś **333/333**, `UI_PLAN.md` §4.7) +
`check-i18n` (dziś pl = en = 3394); STOP przed każdym commitem; `GATE_Hn.md` w teczce kroku z walidatorem CDP, który
przechodzi wszystkie kroki na **każdym z pięciu motywów ekranu tytułowego** (przełączenie w stronie:
`import('/src/config/ThemeConfig.js')` — ten sam moduł co gra — i `applyPreset`), w oknie 1600×1041 i w kontroli
1280×833, z kontrolą na starym kodzie (flaga OFF) dającą INNY wynik; flaga kroku — brak klucza = OFF, ON domyślnie
dopiero po bramce. Zapis v101 bez migracji (stan warstw w `uiPrefs` przez `?? domyślna`).

**Aneks 2026-10-23 — zmiana protokołu od H2 (decyzja właściciela po bramce H1).** Dla H2 i dalej zastępuje akapit
„Wspólne dla każdego kroku” w tym, co wymienia; H0 i H1 przeszły według akapitu.
- **Paczki:** A = H2 (etykiety) + H3 (trasy) + **493** (karta ciała z boku tarczy — §4.2a) · B = H4. **Commit raz na
  paczkę** (kod) + commit dokumentacji; jedna bramka na paczkę.
- **Keepery wyłącznie dla logiki:** strefy kliku, zegary / pauza, mgła wojny, `uiPrefs`, budżet klatek (kl./s przy
  ruchu kamery, z warstwą i bez — Finding 527). **Bez** pinów na stałych rysunku, **bez** mutacji rysunku, **bez**
  kontroli na poprzednim commicie i **bez** drugiego okna (kontrola 1280×833).
- **Walidator → arkusz kontaktowy HTML** na 5 motywach ekranu tytułowego (zrzuty do oglądania) zamiast tabel wartości.
- **Bramka właściciela = oglądanie arkusza + pętla strojenia** (stałe rysunku stroi się w trakcie bramki).
- **Paczka A — wykonanie (2026-10-24):** na prośbę właściciela trzy commity kodu zamiast jednego — `5a6d953` A-1
  etykiety · `1664c84` A-2 trasy · `9b5e6f1` A-3 karta 493 — sweep i rozruch gry na każdym stanie pośrednim (338 / 339 /
  340 suit, 0 FAIL); jedna bramka. Arkusz kontaktowy `gate/kontakt_A.html` (16 kadrów × 5 motywów, pary przed / po);
  smoke w grze (ZF gy120, okno 1618×1195, DPR 0,9): 0 wyjątków JS; OFF = stary kod — plakietki, linie tras 3D i karta
  ciała identyczne przy wspólnym czasie gry; 60 kl./s z warstwami i bez; CPU warstwy HUD — pełne przerysowanie
  147–234 µs, realne klatki przy obrocie kamery średnio 329–465 µs (radar 126–178 µs); strojenie 1 (a — histereza strony
  karty, b — strzałki krawędzi w rolach, c — glif warp = cel trasy) z mini-arkuszem `gate/kontakt_A_s1.html`; **PASS
  2026-10-24**. Teczka: `C:\Users\Komputer\kosmos-handover\hud-paczka-a\` (`RAPORT_A.md`, `gate/`, `probes/`).

### 4.1 H0 — role kolorów z motywu + orbity (D-HUD-2, D-HUD-7, D-HUD-15)

> **✅ WYKONANE 2026-10-22.** Commity `tools/commit_H0.sh`: **`5449674`** (H0-1 — NEW `src/ui/HudPalette.js`: role HUD
> z motywu wg reguły B2, raport kontrastu; epoka motywu w `ThemeConfig.js` — `applyPreset` / `applyTheme`) ·
> **`6464e4d`** (H0-2 — NEW `src/renderer/HudOrbitLogic.js`, orbity planet, pierścienie księżyców i orbity planetoid
> w kolorach tokenów `orbitLine` / `orbitColony` za `FEATURES.hudOrbits` — ON; zaznaczona `primary`, niestabilna `alert`,
> krycie × 0,8; `_syncHudOrbits` w pętli renderu — przebudowa przy zmianie flagi, epoki motywu i domu gracza; poprawka 3b
> po bramce — przy „Żadne” zostaje orbita zaznaczonego ciała, §5.0). **Bramka H0 u właściciela — PASS 2026-10-22:** K0–K7
> na Biopunk Green (wczytanie) i Amber Noir (`applyPreset` z konsoli), K0 / K1 / K3 z rozwiniętą tablicą planet na Neon
> Cyber; obie gałęzie alertu okiem (`0xcc4433` danger / `0xffaa44` warning); okno 1618×1053, DPR 0,9 → `pixelRatio` 1,35
> → linia orbity 0,74 px CSS; 16 punktów „Do potwierdzenia” przyjętych, decyzje 8 = (a) i 3 = (b) (§5.0); po poprawce 3b
> K4 powtórzone na Neon Cyber: wariant A 0/32, wariant B („Kepler-4799 i” zaznaczona — `0xff2288`, 0,56) 1/32, po
> odznaczeniu 0/32. Keepery: `hud_palette_smoke` 30/30 (fail-first na `6496b38`: 3/27), `hud_orbits_smoke` 57/57
> (na `6496b38`: 12/45; poprawka 3b wobec drzewa H0-2 sprzed niej: 52/5); bateria mutacji 19/19; sweep **335/335**;
> `check-i18n` pl = en = **3394** (bez nowych kluczy); koszt `_rebuildAllOrbits` przy ON 0,063–0,0715 ms (faza A:
> 0,07 ms); save v101 bez migracji. ✅ **510**, **511**, **512**; nowe **517–521** (§3; 519 ✅ przy ON). Teczka:
> `C:\Users\Komputer\kosmos-handover\hud-h0\` (`HANDOVER_H0.md`, `gate/GATE_H0.md`).

**Koszt (propozycja):** 2 commity kodu + 1 dokumentacji · **bramka:** jedna (~15 min, 5 motywów).
- NEW `src/ui/HudPalette.js` — czysty: `resolveHudRoles(theme)` → `{ primary, dim, alert, foreign, alertSource }` wg
  reguły D-HUD-2; `hudContrastReport(theme)` dla keepera. Zero hexów.
- Licznik zmian motywu (D-HUD-15): `applyPreset` / `applyTheme` podbijają epokę w `ThemeConfig.js` — jedyne miejsce,
  które wie o zmianie; warstwy 3D przebudowują się przy zmianie epoki.
- Orbity za flagą `hudOrbits` (`ThreeRenderer._buildOrbit` / `_restoreOrbitDefaults` / księżyce / planetoidy): kolory
  z `orbitLine` (domyślne) i `orbitColony` (dom, kolonie), krycie × 0,8; zaznaczona i niestabilna wg D-HUD-7;
  przebudowa przy zmianie flagi, motywu i po wczytaniu zapisu (510); filtr „Żadne” wg D-HUD-7 (511). Ścieżka OFF —
  dzisiejsze hexy co do bitu.
- **Keepery:** NEW `hud_palette_smoke` (role i progi ΔE dla 5 motywów ekranu tytułowego, raport dla 23 presetów, zero
  hexów w module, odczyt tokenów co wywołanie — zmiana motywu widoczna od razu) · NEW `hud_orbits_smoke` (kolory z
  tokenów przy ON, dzisiejsze przy OFF; krycie × 0,8; przebudowa po zmianie epoki; 510 — orbita domu widoczna po
  wczytaniu bez biegu gry; 511 — wg decyzji). Do sprawdzenia: `click_focus_rule_smoke` (podświetlenie orbity przy
  najechaniu), `zoom_floor_smoke`.
- **Bramka H0:** orbity w kolorze motywu na 5 motywach (zmiana motywu w trakcie gry — F7 — przebudowuje orbity),
  zaznaczona / dom / kolonia / filtr, stan po wczytaniu na pauzie, flaga OFF = turkus jak dziś.

### 4.2 H1 — warstwa HUD 2D + radar (D-HUD-1, D-HUD-3, D-HUD-4, D-HUD-12, D-HUD-b, D-HUD-18)

> **✅ WYKONANE 2026-10-24.** Commity `tools/commit_H1.sh`: **`6630665`** (H1-1 — `#hud-canvas` pod `#ui-canvas`, warstwa
> `HudLayer` z własną pętlą — rysunek tylko przy zmianie kamery / zaznaczenia / motywu / układu albo w trakcie animacji,
> w spoczynku zero pracy; wspólny projektor `HudProjection`) · **`a756fab`** (H1-2 — radar zaznaczonego obiektu za
> `FEATURES.hudRadar` (ON): NEW `DetectionRange` (jedna reguła zasięgu wykrycia, wspólna z `ProximitySystem`),
> `HudRadarLogic`, `HudRadarLayer`; tryb Y — wszystkie własne w oglądanym układzie; pierścienie 3D przy ON wyłączone;
> ☰ „Radar” = `uiPrefs.hudRadarVisible`; korekta 1b) · **`29cf778`** (H1-3 — błysk na granicy NIEzaznaczonego obiektu, rola
> `alert`, 0,8 s). **Bramka H1 u właściciela — PASS 2026-10-23:** przed korektą K0, K1, K2, K5–K11 PASS (Amber Noir
> pełna pętla; Neon Cyber K0 / K1 / K3 / K7 / K10; okno 1618×1195, DPR 0,9), K3 PASS na Neon Cyber; uwagi: granica
> statyczna nieczytelna (zlewała się z orbitami, nie mówiła, co znaczy), błysk za krótki (→ H4, §4.5), K11 S1 „pingi 0”
> (nie odtworzone w oknie właściciela — S1: 1 ping). **Korekta 1b (przed commitem):** granica z kropek 1,5 px
> z okrągłym końcem co 6 px α 0,35, podziałka 10 / 16 px α 0,55, odczyt zasięgu „11,5 AU” / „1,0 AU” α 0,6 przy
> najwyższej na ekranie kresce głównej (decyzja właściciela), kropki tylko w oknie (`clipRunsToRect` — K11 S5:
> 6 → 60 kl./s; kod sprzed 1b 18–23 kl./s — Finding 527); wariant koloru granicy z przełącznika tymczasowego —
> **`primary`** (decyzja właściciela; `dim` w 4 z 5 motywów = akcent × 0,32, ten sam odcień co orbity — Finding 524);
> w commicie przełącznik usunięty, stała `HUD_RADAR.BOUNDARY_ROLE = 'primary'`. Punkty „Do potwierdzenia” 1–27
> przyjęte (poza rysunkiem korekta nie zmienia zachowania — konstruktor, `prepare`, klucz klatki i słuchacze zdarzeń
> co do bajtu jak przed nią). Keepery: `hud_layer_smoke` 48/48 (fail-first na `e047f04`: 3/45), `hud_radar_smoke`
> 91/91 (wersja H1-2: 73/73; fail-first: H1-2 na H1-1 5/68, H1-3 na H1-2 74/17, końcowy na `e047f04` 5/86, na drzewie
> sprzed 1b 75/16); bateria mutacji 34/34; sweep **337/337**; `check-i18n` pl = en = **3394** (bez nowych kluczy —
> „AU” jak w wartościach liczba + jednostka); save v101 bez migracji. ✅ **505**, **506**, **507**, **508**, **516**;
> nowe **522–527** (§3); obserwacja (b) z 1b → **493** (§4.2a). Teczka: `C:\Users\Komputer\kosmos-handover\hud-h1\`
> (`HANDOVER_H1.md`, `gate/GATE_H1.md`, `gate/porownanie_1b.html`).

**Koszt:** 2–3 commity kodu + 1 dokumentacji · **bramka:** jedna (~25 min).
- Warstwa HUD wg D-HUD-1 (rekomendacja: `#hud-canvas` pod `#ui-canvas`), własna pętla: rysuje, gdy kamera się rusza,
  zmienia się zaznaczenie albo trwa animacja; projektor ekliptyka → ekran (z `_viewDepth`); zegary — realny i
  `simClockMs` (D-HUD-12); chowa się przy overlayu, globusie i SHIFT (czysty widok).
- Radar za flagą `hudRadar`: granica kropkami (alfa ~0,2), podziałka co 30°, ping (ostra linia ~0,7, poświata ~0,2,
  echo ~0,25, ~2,4 s ease-out; raz przy zaznaczeniu, potem co ~6 s — D-HUD-b; przy dużej tarczy stoi), tylko dla
  zaznaczonego (w trybie Y — wg D-HUD-18), promień wg D-HUD-3, encje wg D-HUD-4 (505, 506, 507, 516); błysk na granicy
  niezaznaczonego przy wejściu obcego (D-HUD-4). Przy ON dzisiejsze pierścienie 3D wyłączone (508 znika z nimi);
  przy OFF — dzisiejszy kod.
- **Keepery:** NEW `hud_radar_smoke` (czysty `HudRadarLogic`: promień z kadłuba × tech i z obserwatorium, kto ma radar,
  filtr układu z `null` — 516, rezerwa — 507, kolonie AI — 506; plan pingu na zegarze z pauzą; kąt podziałki; geometria
  błysku z namiaru) · NEW `hud_layer_smoke` (cykl warstwy: brak rysunku pod overlayem / globusem / SHIFT; pętla bez
  pracy w spoczynku).
- **Bramka H1:** zaznaczony statek / kolonia na 5 motywach, ping w biegu i w pauzie, błysk przy wejściu wroga
  (`KOSMOS.debug.spawnEnemyRaider` w oglądanym układzie — scena z debug-rajderem stabilna tylko na pauzie, bo
  `DirectorRecall` odwołuje bezczynnego rajdera; `VESSEL_ORDERS_PLAN.md` §268), statek w skoku bez pierścienia,
  budżet ≤ 0,5 ms.

### 4.2a 493 — karta ciała z boku tarczy (osobny mały krok po H1 — paczka A)

> **✅ WYKONANE 2026-10-24 — A-3 `9b5e6f1`** (`FEATURES.bodyCardSide`, ON). NEW `src/ui/BodyCardSideLogic.js`: karta
> ciała (`BottomContext`), panel statku w trybie kompaktowym (`UIManager`) i panel stacji (`StationPanel`) z boku tarczy /
> modelu — prawo (odstęp 16 px), flip w lewo przy braku miejsca w obszarze mapy, nigdy nad tarczą, gdy którakolwiek
> strona się mieści; przy zoomie karta idzie za krawędzią tarczy; tarcza z projektora HUD w px logicznych
> (`objectScreenDisc` — ciało, statek, stacja; `ThreeRenderer.getStationWorldInfo`); ścieżka OFF myli px CSS z logicznymi
> — Finding 528. **Strojenie 1 (a):** strona wybierana przy zaznaczeniu i trzymana (`makeCardSideMemory`), zmiana tylko,
> gdy karta wyszłaby poza obszar mapy (a druga strona się mieści), nie częściej niż co 400 ms — zoom na stację z panelem:
> 42 zmiany strony w 435 klatkach (najkrótszy odstęp 16 ms) → 0 w 433; `HudProjection.point` z opcjonalnym progiem
> głębi — kotwica obiektu 1e-4 j. (przy podłodze zoomu stacji 0,005 j. karta nie skacze do rogu kadru; radar bez zmian).
> Decyzja 5 strojenia: karta z boku także po pierwszym kliku. Keepery: NEW `body_card_side_smoke` 26/26 (histereza
> z kontrolą — ta sama scena bez pamięci migocze), `right_outliner_smoke` przecelowany (R9e / R9f przy OFF).
> **Rozwiązanie przejściowe** — w reformie zakładek karta ciała i panel stacji znikają (ramy właściciela 2026-10-24,
> `TABS_REFORM_PLAN.md`).

Finding **493** (`UI_PLAN.md` §6): karta ciała kotwiczona 18 px od ŚRODKA ciała (`computeFloatingPlacement`,
`BottomContextLogic.js`) po fokusie zakrywa 33–41 % tarczy, a od H1 — także radar zaznaczonego ciała: w K2 bramki H1
karta Fobosa otwiera się nad Fobosem i zakrywa cały jego radar (obserwacja (b) z korekty 1b — ten sam temat; walidator
i właściciel przeciągali kartę za nagłówek). Kierunek (decyzja właściciela 2026-10-23): **karta ciała z boku tarczy** —
osobny mały krok po H1, w paczce A (§4.0, aneks 2026-10-23).

### 4.3 H2 — etykiety (D-HUD-5, D-HUD-6, D-HUD-16)

> **✅ WYKONANE 2026-10-24 — A-1 `5a6d953`** (`FEATURES.hudLabels`, ON). NEW `src/ui/HudLabelLogic.js` (LOD stosu,
> anti-overlap z kadrem, strefy kliku, kratka cyfr, „…”, fade-in) + `src/ui/HudLabelLayer.js` (podwarstwa nad radarem —
> odczyt świata, rzut, pomiar tekstu, rysunek, klik); przy ON plakietki `MapLabelLayer` wyłączone (rysunek i klik), klik
> etykiet HUD po karcie ciała, etykiety CTRL w rolach; przy OFF — dzisiejszy kod co do bitu. Progi LOD 6 / 40 px bez
> zmian; **decyzje strojenia 1:** 1 — trzeci stan LOD (tarcza kotwicy ≥ 40 px — każdy członek stosu przy swoim obiekcie)
> — TAK; 2 — nazwy kolonii w widoku układu (~450 j.) — ZOSTAJĄ; (b) strzałki krawędzi w rolach — własne `primary` (także
> z alertem), obce `foreign`. ✅ 513, 514, 515, 525; z `UI_PLAN.md` §6 — 497, 503. Keepery: NEW `hud_labels_smoke` 55/55;
> `hud_radar_smoke` przecelowany (radar po klasie, nie po indeksie; R13 / R14 przy etykietach i trasach OFF); świadkowie
> plakietek (`map_labels`, `click_focus_rule`, `map_vessel_panel_compact`, `left_outliner`, `map_insets_single_source`,
> `dok_taktyczny_4f`, `event_log_entry`) zieloni przy ON i OFF — bez przecelowania.

**Koszt:** 3 commity kodu (logika układu · rysunek · strefy kliku) + 1 dokumentacji · **bramka:** jedna (~30 min).
- Etykiety za flagą `hudLabels` na warstwie HUD: tekst `THEME.fontFamily` na pasku bez ramki (0,72 zaznaczony / 0,55
  reszta), nitka do obiektu, kolonie wersalikami z odstępem liter, statki małymi literami, zaznaczony jedyny pogrubiony,
  druga linia dla zaznaczonego i hovera mapy, cyfry w kratce (D-HUD-6), szyna dla stosu planeta + księżyce + stacje
  (`stationGroupOf`), LOD po px tarczy kotwicy („NOWA ZIEMIA +2” ↔ szyna), anti-overlap obejmujący WSZYSTKIE etykiety
  (także statków), kadr = obszar mapy z `MapInsets` (514), fade-in 150 ms bez skoków (zegar realny); pełne nazwy z „…”
  (513); strzałki krawędzi bez wczesnego wyjścia (497); etykiety CTRL w rolach (D-HUD-16).
- Strefy kliku = prostokąt tekstu; tarcza ciała wygrywa (503, 487); klik etykiety w `UIManager.handleClick` PO karcie
  ciała (515) — reguła D-UI-5 bez zmian.
- **Keepery:** NEW `hud_labels_smoke` (czysty `HudLabelLogic`: szyna z `stationGroupOf`, LOD po px, zwinięcie „+N”,
  anti-overlap bez nakładania w ZF przy 200 j. (dziś 10 par), kadr — zero etykiet poza obszarem mapy, wersaliki /
  minuskuły, kratka cyfr, „…”; strefy: środek gwiazdy przy 450 j. → gwiazda, nie stacja (503); karta przed etykietą
  (515)). Do przecelowania za zgodą (świadkowie plakietek): `map_labels_smoke`, `click_focus_rule_smoke`,
  `map_vessel_panel_compact_smoke`, `left_outliner_smoke`, `map_insets_single_source_smoke`, `dok_taktyczny_4f_smoke`,
  `event_log_entry_smoke` — dopóki flaga OFF, zostają zielone.
- **Bramka H2:** stos Nowa Ziemia / Nowy Księżyc / stacja przy 450 / 200 / 120 / 40 / 12 j., klik w gwiazdę przy 450 j.,
  klik etykiety i karty, 5 motywów (cyfry w Neon Cyber), budżet.

### 4.4 H3 — trasy (D-HUD-8, D-HUD-9, D-HUD-10, D-HUD-12)

> **✅ WYKONANE 2026-10-24 — A-2 `1664c84`** (`FEATURES.hudRoutes`, ON). NEW `src/ui/HudRouteLogic.js` (zestaw rozkazów,
> mgła wojny, układ ściśle, marsz kresek na `simClockMs`, promień warp) + `src/ui/HudRouteLayer.js` (podwarstwa pod
> radarem; glify warp jako przeszkody etykiet); przy ON linie tras 3D nie powstają, a istniejące zwalnia pętla renderu
> (także w pauzie); przy OFF — jak dziś. **Decyzje strojenia 1:** 3 — glif warp z nazwą układu DOCELOWEGO TRASY
> (`warpRoute.finalSystemId`), kreski w kierunku pierwszego (bieżącego) przeskoku — poprawka c („Lalande” → „Bellatrix”
> przy rozkazie do Bellatrix); 4 — pościg: trasa tylko do celu widocznego na mapie — TAK. ✅ 509. Keeper NEW
> `hud_routes_smoke` 51/51.

**Koszt:** 2 commity kodu + 1 dokumentacji · **bramka:** jedna (~25 min).
- Trasy za flagą `hudRoutes` na warstwie HUD: linia 1 px w `hud.primary` (obce — `hud.foreign`), alfa gasnąca 0,6 →
  0,15, wzór kresek w px ekranu, cel — puste kółko (ciało) albo chevron (punkt), bez strzałek, marsz kresek na
  `simClockMs` (stoi w pauzie), zestaw rozkazów wg D-HUD-8, warp wg D-HUD-9, obce wg D-HUD-10 (509). Przy ON
  dzisiejsze linie 3D wyłączone; najechanie statku podświetla trasę jak dziś.
- **Keepery:** NEW `hud_routes_smoke` (czysty `HudRouteLogic`: odcinek ekranowy, gradient alfy, glif celu, przesunięcie
  wzoru = f(`simClockMs`) — pauza nie przesuwa, reguła obcych z `isEndpointVisibleByQuality` / `isMovementPulseVisible`,
  kierunek glifu warp).
- **Bramka H3:** Kurier i Smok II w ZF, pauza (marsz stoi), rozkaz w punkt, dok, odwrót, skok warp z oglądanego układu,
  wróg w zasięgu (contact) i poza nim, 5 motywów.

### 4.5 H4 — model uwagi, alerty, nawiasy, chipy, klawisze (D-HUD-11, D-HUD-13, D-HUD-14, D-HUD-16, D-HUD-17, D-HUD-c)

**Koszt:** 3 commity kodu (uwaga i alerty · nawiasy · chipy i klawisze) + 1 dokumentacji · **bramka:** jedna (~30 min).
- Poziomy uwagi (etykiety 0,38, trasy 0,25, zaznaczony i alerty 1,0) w warstwach H1–H3; alert w `hud.alert`: dwie
  obwódki, kropkowany wektor, treść (typ, dystans, namiar — D-HUD-11; bez nazwy poniżej `contact` — 504); celownik
  wroga i ramki statków w rolach (D-HUD-16); nawiasy ⌜ ⌟ wokół zaznaczonego ciała z oddychaniem 1,0 → 1,04 / 2 s,
  gasnące przy dużej tarczy (D-HUD-c).
- Chipy w pasie (`BottomControlBar`) za flagą `hudChips`: [R] [T] [E] [O] wg D-HUD-13, szerokość z `measureText`
  aktywnego fontu, aktywny = wypełnienie, nieaktywny = obrys, stan w `uiPrefs`, klawisze wg D-HUD-14; 490 wg D-HUD-17.
- **Wymagania z bramki H1 (2026-10-23):** błysk na granicy — minimalna długość łuku w px i ~1,6 s albo dwa impulsy
  (dziś 0,8 s, łuk ±15° — za krótki), scalenie z celownikiem wroga; kolonia z zasięgiem ∞ (bez granicy, więc bez
  błysku) — alert przez etykietę; statek i ciało zaznaczone naraz (dziś dwa radary — punkt 6 bramki H1); scalenie
  pingu HUD z pingiem zaznaczenia D-UI-10 (`pingVessel` — statek w doku zaznaczony z wiersza).
- **Z bramki paczki A (2026-10-24) — D-HUD-16:** kolory 3D w rolach — stożki przechwycenia `0x00ffff` (cyjan z kadru 10
  arkusza paczki A — najpewniej one); bez numeru findingu (§5.0).
- **Keepery:** NEW `hud_attention_smoke` (poziomy alfy, warunek alertu, treść i mgła wojny, namiar), NEW
  `hud_chips_smoke` (geometria grupy względem suwaka zoomu, czipu ⚔ i rzędu doku na prawdziwym `BottomControlBar` z
  atrapą ctx; szerokości per font; zapis `uiPrefs`; klawisze; brak chipów pod overlayem). Do przecelowania za zgodą:
  `bottom_strip_smoke` (rząd doku kończy się przed grupą), `zoom_slider_smoke`, `fleet_clock_band_smoke`.
- **Bramka H4:** zaznaczanie i odznaczanie, alert przy wejściu wroga, nawiasy przy zoomie, chipy i klawisze w biegu
  i w pauzie, zapis + F5, 5 motywów, kontrola 1280×833.

### 4.6 Suma

5 kroków, ~12–13 commitów kodu + 5 dokumentacji, 5 bramek (~2 h u właściciela łącznie). Kolejność stała: H0 (role) jest
wejściem dla wszystkich; H1 (warstwa 2D) — dla H2–H4; chipy (H4) — po warstwach. 504 — osobny drobny krok, poza
kolejnością.

**Po aneksie 2026-10-23 (§4.0):** H0 i H1 wykonane (5 commitów kodu + 2 dokumentacji, 2 bramki); dalej dwie paczki —
A (H2 + H3 + 493) i B (H4) — po jednym commicie kodu, commicie dokumentacji i bramce na paczkę.

**Po paczce A (2026-10-24):** H2 + H3 + 493 wykonane — 3 commity kodu (A-1 / A-2 / A-3 — na prośbę właściciela) + 1
dokumentacji, 1 bramka ze strojeniem 1; w arkuszu zostaje paczka B (H4).

---

## 5. Decyzje (D-HUD-1…18) — PODPISANE 2026-10-21

### 5.0 Podpisy właściciela (2026-10-21)

| Pozycja | Podpis |
|---|---|
| §1.1 odczytania (1)–(5) | **PRZYJĘTE** |
| **D-HUD-1** | **(a)** — `#hud-canvas` pod `#ui-canvas`; orbity w 3D |
| **D-HUD-2** | reguła z pomiaru **B2**: primary = `accent`, dim = `textDim`, foreign = `textPrimary`, alert = `danger`; `warning`, gdy najgorsze ΔE2000(primary, danger) < 10 |
| **D-HUD-3** | promień = **zasięg wykrycia**; sensor-lock w drugiej linii etykiety |
| **D-HUD-4** | jak rekomendacja |
| **D-HUD-5** | jak rekomendacja (progi 40 / 6 px tarczy — do kalibracji na bramce H2) |
| **D-HUD-6** | **kratka cyfr** |
| **D-HUD-7** | grubość bez zmian; krycie × 0,8; tokeny `orbitLine` / `orbitColony`; zaznaczona `hud.primary` 0,7 × 0,8; niestabilna `hud.alert`; 510 naprawione; „Żadne” chowa WSZYSTKIE (511); chip [O] OFF = „Żadne” / ON = ostatni tryb |
| **D-HUD-7 — uzupełnienie (2026-10-22, po bramce H0)** | **decyzja 8 = (a):** w 5 motywach ekranu tytułowego (`orbitLine` = `orbitColony` = `accent` w RGB) hierarchię orbit niesie samo krycie (0,064 / 0,08 / 0,12 / 0,56) — bez kroku, bez zmiany tokenów · **decyzja 3 = (b) — poprawka 3b:** przy filtrze „Żadne” orbita **zaznaczonego ciała** zostaje widoczna (`primary`); zakres (pytanie z sesji poprawki, odpowiedź 2026-10-22): **każde zaznaczone ciało** — planeta 0,56, pierścień księżyca 0,24, orbita planetoidy 0,28; reszta ukryta — także dom i kolonie (511 bez zmian); najechana — bez orbity; odznaczenie — orbita znika, zmiana zaznaczenia — przeskakuje; SHIFT chowa także ją; tylko ścieżka ON, OFF = dziś co do bitu (`6464e4d`) |
| **D-HUD-8** | jak rekomendacja |
| **D-HUD-9** | kreski do krawędzi kadru + glif; tylko układ odlotu |
| **D-HUD-10** | jak rekomendacja |
| **D-HUD-11** | jak rekomendacja |
| **D-HUD-12** | jak rekomendacja |
| **D-HUD-13** | [R] [T] [E] [O]; **[H] — NIE**; EN S / R / L / O; geometria jak w planie |
| **D-HUD-14** | **Digit6–Digit9** |
| **D-HUD-15** | jak rekomendacja |
| **D-HUD-16** | tylko to, co HUD zastępuje |
| **D-HUD-17** | minimalna poprawka 490 w H4 |
| **D-HUD-18** | w trybie Y radar wszystkich własnych obiektów |
| **D-HUD-b / D-HUD-c** | domyślne właściciela bez zmian |
| **504** | osobny drobny krok, **NIE w kroku arkusza**; zapisany w rejestrze (§3) |
| Cięcie H0 → H4 (§4) | **PRZYJĘTE** |
| **Paczka A — strojenie 1 (2026-10-24)** | decyzje: **1 = TAK** (trzeci stan LOD — tarcza kotwicy ≥ 40 px: każdy członek stosu przy swoim obiekcie) · **2 = ZOSTAJE** (nazwy kolonii w widoku układu ~450 j.) · **3 = nazwa CELU trasy** przy glifie warp, kierunek pierwszego przeskoku · **4 = TAK** (pościg — trasa tylko do celu widocznego na mapie) · **5 = TAK** (karta z boku także po pierwszym kliku); poprawki a (histereza strony karty), b (strzałki krawędzi w rolach), c (glif = cel trasy) — **PASS**; findingi 528–530 → rejestr ⚪ |
| **D-HUD-16 — uzupełnienie (2026-10-24, po bramce paczki A)** | w paczce B także kolory 3D w rolach — stożki przechwycenia `0x00ffff` (cyjan z kadru 10 arkusza paczki A); bez numeru findingu |
| **Reforma zakładek — ramy (2026-10-24)** | krok ZAPLANOWANY po paczce A, poza arkuszem HUD — `TABS_REFORM_PLAN.md` (statki: panel wysuwany w lewo od prawego outlinera, pływający panel statku znika; kolonie, ciała, stacje: model etykiety — karta ciała i panel stacji znikają, 493 = rozwiązanie przejściowe; pierwszy krok — inwentarz zakładek read-only) |

### 5.1 Decyzje — treść z fazy A (rekomendacja pierwsza)

**D-HUD-b (domyślne właściciela):** ping raz przy zaznaczeniu, potem co ~6 s; przy bliskim zoomie (duża tarcza) stoi —
tylko statyczna słaba granica. Wpisane do H1; „blisko” = próg px tarczy z D-HUD-5.

**D-HUD-c (domyślne właściciela):** nawiasy ⌜ ⌟ wokół zaznaczonego ciała, oddychanie 1,0 → 1,04 / 2 s, gasnące przy
bliskim zoomie. Wpisane do H4; oddychanie na zegarze z D-HUD-12.

1. **D-HUD-1 — nośnik HUD.** (a) **osobna kanwa `#hud-canvas` pod `#ui-canvas`** (w DOM zaraz po `#three-canvas`,
   z-index 1, `pointer-events: none`) — kolejność z resztą UI z konstrukcji (belki, outlinery, panele i karta zawsze
   nad HUD — 514, 515 i klasa 483 znikają), animacje przerysowują tylko HUD, nie całe UI (0,75–0,9 ms); klik — strefy
   HUD sprawdzane w `UIManager.handleClick` na końcu, przed raycastem 3D · (b) rysowanie w `#ui-canvas` (jak dziś
   etykiety) — prościej, ale każda animacja = przerysowanie całego UI, a kolejność trzeba pilnować ręcznie · (c) obiekty
   3D — barwy przesunięte przez ACES (ΔE 4–11), brak zmiany motywu bez przebudowy, tekst trudny. **Rekomendacja (a);
   orbity zostają w 3D** (okluzja tarczą).
2. **D-HUD-2 — role kolorów.** primary = `accent` · dim = `textDim` · foreign = `textPrimary` · alert = `danger`,
   a `warning`, gdy najgorsze ΔE2000(primary, danger) w symulacji daltonizmu < 10 (dziś: Biopunk Green, Neon Cyber).
   Zastępuje dosłowne „primary w barwie ostrzegawczej → warning”, które w Amber Noir daje alert nieodróżnialny od
   primary dla deuteranopów (§1.1 (3), §2.10). Konsekwencja do akceptacji: obce statki przestają być czerwone (alert
   jest czerwony; cztery role muszą się różnić) — obce w jasnym `textPrimary`.
3. **D-HUD-3 — promień radaru.** Statek: **zasięg wykrycia** (`sensorRangeAU` kadłuba × tech — to on wywołuje
   „obcy wchodzi”) jako granica; zasięg ujawnienia (sensor-lock) w drugiej linii etykiety. Kolonia: obserwatorium;
   ∞ (Lv4+) — bez okręgu, znak „∞” przy etykiecie. Alternatywa: dwa okręgi (wykrycie + ujawnienie).
4. **D-HUD-4 — kto ma radar i skąd błysk.** Radar: statki gracza w służbie (bez rezerwy; zadokowany — okrąg w środku
   kolonii tylko, gdy zaznaczony) i kolonie gracza (pełne i placówki); nigdy AI (506). Błysk: statek —
   `vessel:proximityEnter` pary z graczem (`!sameFaction`) w punkcie granicy na namiarze obcego; kolonia —
   `vessel:detectionChanged` z `detected: true` + HUD sam wybiera najbliższą kolonię gracza w zasięgu (bez zmiany
   `ObservatorySystem`).
5. **D-HUD-5 — etykiety.** Zakres encji jak dziś (kolonie i stacje gracza, floty i statki, wrogowie wg mgły wojny);
   szyna = `stationGroupOf`; LOD po px tarczy kotwicy (próg do kalibracji na bramce, punkt wyjścia: tarcza ≥ 40 px —
   szyna rozwinięta, < 6 px — zwinięta „+N”); strefa = prostokąt tekstu, tarcza wygrywa (503, 487), zwinięta etykieta
   zaznacza kotwicę; druga linia — zaznaczony i hover MAPY (hover outlinera nie, bez zmian w outlinerach); etykiety pod
   kartą ciała (515).
6. **D-HUD-6 — cyfry tabularyczne.** Cyfry w stałej kratce (szerokość najszerszej cyfry aktywnego fontu) — działa w
   każdym motywie, font motywu zostaje · alternatywa: osobny font mono dla danych (zmienia charakter Neon Cyber).
7. **D-HUD-7 — orbity.** Grubość jak dziś (1 px bufora; bez `Line2`, które byłoby grubsze); krycie = dzisiejsze × 0,8;
   kolory z tokenów `orbitLine` (domyślne i filtr) i `orbitColony` (dom, kolonie); zaznaczona — `hud.primary`, krycie
   0,7 × 0,8; niestabilna — `hud.alert` w kryciu kolonii; 510 naprawione (przebudowa po wczytaniu). Filtr „Żadne”
   chowa WSZYSTKIE orbity (zgodnie z etykietą — 511); chip [O] OFF = „Żadne”, ON = ostatni tryb z menu.
   **Uzupełnienie 2026-10-22 (po bramce H0, §5.0):** (8a) hierarchię orbit w 5 motywach tytułowych niesie samo krycie;
   (3b) „Żadne” chowa wszystkie orbity poza orbitą zaznaczonego ciała — każdego: planety, księżyca, planetoidy.
8. **D-HUD-8 — trasy.** Kolor `hud.primary` / `hud.foreign` (nie kolor typu rozkazu — typ niesie glif celu i druga
   linia); alfa 0,6 → 0,15 × poziom uwagi (D-HUD-11); wzór kresek w px ekranu (punkt wyjścia 6 / 4 px), marsz ~4 px/s
   czasu biegu gry; cel: puste kółko (ciało), chevron (punkt w przestrzeni); zestaw rozkazów: dzisiejszy + patrol
   (bieżący odcinek) + pościg i przechwycenie (do celu / punktu przechwycenia); walka — bez trasy (pierścień starcia).
9. **D-HUD-9 — warp.** Statek w skoku nie jest w żadnym układzie. Rekomendacja: w układzie ODLOTU, przez czas skoku,
   dłuższy wzór kresek od punktu odlotu do krawędzi kadru w kierunku układu docelowego (kierunek z mapy galaktyki)
   i glif z nazwą układu przy krawędzi; w układzie celu — nic do przylotu (statek pojawia się na obrzeżu i dalej ma
   zwykłą trasę). Alternatywa: sam glif przy krawędzi, bez kresek.
10. **D-HUD-10 — trasy obcych.** Tylko gdy obcy statek jest TERAZ wykryty (aktywna para wykrycia z dowolnym statkiem
    gracza albo kolonia gracza w zasięgu) i jakość ≥ `contact`; ta sama reguła widoczności co puls ruchu
    (`isMovementPulseVisible`, SB43). `rumor` — nigdy (509).
11. **D-HUD-11 — model uwagi i alert.** Zaznaczony + obiekty z alertem 1,0; reszta etykiet 0,38, tras 0,25 (pasek
    etykiety 0,72 / 0,55 osobno). Alert = obcy statek w zasięgu wykrycia statku lub kolonii gracza (do wyjścia
    z zasięgu) oraz start starcia w oglądanym układzie. Treść: typ (poniżej `contact` — „nieznany kontakt”, bez nazwy;
    504), dystans w AU z jednym miejscem po przecinku, namiar 000–359° w ramce układu (0° = stały kierunek osi układu,
    nie kamery — dokładne 0° do ustalenia pomiarem w H4).
12. **D-HUD-12 — zegary i pauza.** Okresowe (ping co ~6 s, marsz kresek, oddychanie nawiasów, puls alertu) — na
    `simClockMs` (stoją w pauzie; przed pierwszym tikiem po wczytaniu — stan statyczny, BEZ zapasu na czas realny,
    inaczej niż `orbitClockSec`); jednorazowe odpowiedzi na akcję gracza (fade-in 150 ms, pierwszy ping po zaznaczeniu)
    — czas realny, działają w pauzie.
13. **D-HUD-13 — chipy.** Litery z i18n: PL [R] [T] [E] [O]; EN — propozycja [S] Sensors · [R] Routes · [L] Labels ·
    [O] Orbits (dosłowne R/T/E/O po angielsku nic nie znaczą, a „Radar” i „Routes” dzielą R). Sama litera w polu chipa
    (pole = nawiasy). Wysokość 16 px jak chipy doku; szerokość jak czip ⚔ — `ceil(measureText)` + `CHIP_PAD_X` (14)
    przy `THEME.fontSizeSmall` (9 px): litera 4,86 px (Share Tech Mono) / ≤ 5,13 px (Rajdhani) / 5,51 px (Space Mono)
    ⇒ chip 19–20 px, grupa czterech z odstępem `CHIP_GAP` 4 ≈ 88–92 px. Położenie: grupa tuż na lewo od suwaka zoomu
    (prawy brzeg = `zoom.x − 4`; w ZF logicznie x ≈ 904–996), czip ⚔ na lewo od grupy, rząd doku kończy się przed nimi;
    pod overlayem — ukryte jak dok. Stan w `uiPrefs.hudLayers` (w zapisie gry, bez migracji), domyślnie wszystkie ON.
    **[H] — nie** (dziś linie handlu nie mają przełącznika; zakres warunkuje [H] istniejącym przełącznikiem).
14. **D-HUD-14 — klawisze.** **Digit6 [R] · Digit7 [T] · Digit8 [E] · Digit9 [O]** — wolne, w rzędzie cyfr tuż za
    prędkościami 1–5 z tego samego pasa, kolejność = kolejność chipów; podpowiedź chipa pokazuje klawisz. Alternatywa:
    R + V / X / Z (mnemonika tylko dla R).
15. **D-HUD-15 — flagi i motyw.** `hudOrbits`, `hudRadar`, `hudLabels`, `hudRoutes`, `hudAttention`, `hudChips`: brak
    klucza = OFF, ścieżka OFF = dzisiejszy kod co do bitu, ON domyślnie po bramce kroku. Zmiana motywu: licznik epoki
    podbijany w `applyPreset` / `applyTheme` (`ThemeConfig.js` — poza listą plików krytycznych); warstwy 3D przebudowują
    się przy zmianie epoki albo flagi; walidator bramek przełącza motyw importem `ThemeConfig.js` w stronie.
16. **D-HUD-16 — kolory na sztywno spoza ośmiu punktów** (§2.10: etykiety CTRL, ramki RTS i paski paliwa, celownik
    wroga, podpowiedź DOM, puls ruchu, stożek przechwycenia, pierścień starcia, POI, tryb taktyczny, znaczniki budynków).
    Rekomendacja: w arkuszu tylko to, co HUD zastępuje albo obejmuje — etykiety CTRL (H2), ramki statków i celownik
    wroga (H4); reszta zostaje, lista do osobnego kroku polerki.
    **Uzupełnienie 2026-10-24 (po bramce paczki A, §5.0):** w paczce B także kolory 3D w rolach — stożki przechwycenia
    `0x00ffff` (cyjan widoczny w kadrze 10 arkusza paczki A); bez numeru findingu.
17. **D-HUD-17 — 490 przy chipach.** Prawy klik w chip otworzy menu mapy pod nim. Rekomendacja: minimalna poprawka 490
    (prawy klik pyta `isOverUI` także dla celu `CANVAS`) jako commit H4 — inaczej chipy mają znaną dziurę od pierwszego
    dnia. Alternatywa: zostawić 490 na osobny krok.
18. **D-HUD-18 — tryb taktyczny Y.** Dziś wymusza pierścienie WSZYSTKICH. Rekomendacja: w Y radar wszystkich własnych
    obiektów (wyjątek od „tylko zaznaczony” — sens trybu taktycznego), poza Y — tylko zaznaczony.

---

## 6. Ryzyka

1. **Strefy kliku.** Etykiety tekstowe są większe niż dzisiejsze znaczniki i mogą zabierać klik tarczom i statkom
   (rodzina 487, 503). Mitygacja: tarcza wygrywa, kolejność w `UIManager.handleClick` po karcie i panelach, keeper
   z odczytem prawdziwego łańcucha kliku; bramka klika gwiazdę przy 450 j. i karty przy etykietach.
2. **Wydajność.** Marsz kresek trwa przez cały bieg gry przy widocznej trasie — 60 przerysowań HUD na sekundę. Przy
   rysowaniu w `#ui-canvas` każde = całe UI (0,75–0,9 ms) — stąd D-HUD-1 (a). Budżet ≤ 0,5 ms (§2.12), pomiar w każdej
   bramce; warstwa w spoczynku nie rysuje.
3. **DOM czy Canvas dla tekstu.** Canvas wybrany (§2.5); `ctx.letterSpacing` działa w Chrome (gra uruchamiana w Chrome
   przez Live Server) — w innych przeglądarkach do sprawdzenia; Rajdhani bez `tnum` — kratka cyfr (D-HUD-6).
4. **Kontrast alert ↔ primary per motyw.** Luminancja nie rozróżnia ról w żadnym motywie (WCAG ≤ 1,9) — tylko barwa;
   w daltonizmie margines 10,7–27 ΔE przy D-HUD-2. Alert ma drugi kanał (obwódki, wektor, treść). Keeper pilnuje progu
   na 5 motywach; nowy preset bez sprawdzenia może zejść niżej.
5. **Pauza a animacje tras.** `simClockMs` jest `null` przed pierwszym tikiem po wczytaniu — HUD nie może przejść na
   czas realny (wtedy marsz ruszyłby w pauzie); stan statyczny do pierwszego tiku. Puls dzisiejszego celownika wroga
   chodzi w pauzie (czas realny) — po H4 jedna reguła (D-HUD-12).
6. **Motyw zmieniany w trakcie gry.** F7 zmienia `THEME` bez zdarzenia; bez licznika epoki orbity 3D zostaną w starym
   kolorze do najbliższej przebudowy. 2D czyta tokeny co klatkę — bez ryzyka.
7. **Mgła wojny i układ.** Każdy element obcy (etykieta, trasa, alert, błysk) — reguła układu (`systemIdOf`, ściśle
   dla rysowania — 516) i jakości wywiadu (`isEndpointVisibleByQuality`); przeciek tej klasy już istnieje (504, 485).
8. **Czysty widok (SHIFT), overlaye, globus.** HUD na osobnej kanwie trzeba chować jawnie — półprzezroczyste tła
   overlayów pokazałyby go pod spodem; `_cvVis` (`ThreeRenderer.js:3778-3807`) przywraca widoczność orbit po SHIFT
   i nadpisze zmianę z chipa [O] wykonaną w trakcie SHIFT — widoczność orbit liczona z preferencji po przywróceniu.
9. **Świadkowie dzisiejszego wyglądu.** Keepery pinujące plakietki i pas (§4.3, §4.5) — zielone, dopóki flagi OFF;
   przy przestawieniu ON — przecelowania wyłącznie za zgodą, z listą przed kodem.
10. **DPR właściciela nieznany.** Grubość linii 3D w px CSS zależy od `devicePixelRatio` (0,67 px przy 1; 0,5 px
    przy ≥ 1,34); walidator ustawia DPR okna właściciela (pierwszy krok bramki: odczyt `devicePixelRatio`).
11. **Live Server.** Zapis pliku przez CC przeładowuje kartę właściciela — żadnych zapisów w trakcie bramek.

---

## 7. Czego nie zweryfikowano

- **Jeden zapis.** Wszystkie pomiary na ZF gy120; drugi zapis (Polonia gy79) przygotowany w
  `E:\kosmos-work\hud-phase-a\fixtures\`, niezmierzony.
- **Wnioski z kodu, bez sceny:** 504 (wróg w zasięgu wykrycia), 506 (kolonia AI w oglądanym układzie), 509 (trasa
  wroga), 515 (karta pod etykietą), 516 (własny statek w skoku) — w ZF brak takich sytuacji w układzie domowym.
- **Kontrast** policzony z tokenów (sRGB, symulacja daltonizmu Machado 2009), nie z pikseli ekranu; przesunięcie ACES —
  ze wzoru shadera three r171 (`results/theme_contrast.json`), nie z odczytu GPU.
- **Fonty** — Chrome na tej maszynie; inne przeglądarki nie.
- **Koszt** — RTX 3070, DPR 1; maszyna i DPR właściciela nieznane (ryzyko 10).
- **Sweep** w tej sesji nieuruchamiany (zero zmian w `src/`); stan wyjściowy 333/333 i `check-i18n` 3394 — wg
  `UI_PLAN.md` §4.7.
- **Przełączanie motywu importem modułu w stronie** — wniosek z semantyki modułów ES (ten sam adres = ten sam moduł),
  nieuruchomione.
- **Zrzuty właściciela** z zakresu (pkt 2 i 6) — niedostępne; opisy dopasowane do pomiaru (§2.8, §2.9).
- **Kierunek 0° namiaru** i kierunek glifu warp (z mapy galaktyki na ekran) — nieustalone (D-HUD-9, D-HUD-11).

---

## 8. Warsztat — lekcje tego audytu

1. **Font Google ładuje się przy pierwszym użyciu** (`display=swap`): pierwsza sonda w grze zmierzyła font zastępczy
   (`results/followup_1600/followup.json` — `loaded: { raj12: false, sm11: false }`). Pomiar fontu — po
   `document.fonts.load` (`probes/probe_fonts.mjs`).
2. **Stan po wczytaniu na pauzie ≠ stan gry.** Orbity domu i kolonii po wczytaniu ukryte (510) — sonda mierzy po 4 s
   biegu; inaczej opisuje stan przejściowy.
3. **„Kropkowane” bywa siatką węższą niż piksel.** Odcinki przy Fobosie wyglądały na trasy albo nitki; rozstrzygnęły
   warianty z wyłączaną warstwą (`F2_d40_*`, `S5v_fobos_d3_*`), nie oko.
4. **Skala UI ≠ DPR.** `UI_SCALE = min(W / 1280, H / 720)` (`UIManager.js:93`) nie zależy od DPR; grubość linii 3D
   zależy od DPR. „Okno 1600×1041, skala 1,25” nie mówi, ile pikseli ma linia orbity u właściciela.
5. **Dosłowna reguła z zakresu sprawdzona liczbą.** „primary ostrzegawczy → alert = warning” brzmi dobrze i zawodzi
   w Amber Noir (0,44 ΔE w deuteranopii); pomiar wszystkich par na wszystkich motywach przed rekomendacją.
6. **Długie listy — do pliku.** 223 kolory na sztywno — `results/hexes_hud.txt`; w planie tabela grup z liniami.
