# REFORMA ZAKŁADEK — ramy (decyzje właściciela 2026-10-24) i inwentarz (krok 1)

> **Stan: RAMY PODPISANE 2026-10-24; KROK 1 — INWENTARZ WYKONANY 2026-10-24 (read-only, HEAD = origin = `ae23697`,
> ahead 0); PODPISY WŁAŚCICIELA 2026-10-24 — decyzje D-TR-1…15 (§6.0), findingi §7 przyjęte w całości do rejestru
> `HUD_PLAN.md` §3.** Inwentarz — zero zmian w `src/`; plik zacommitowany razem z podpisami (commit `docs(TABS 0)` =
> kotwica kroku 531 / 532). **531 / 532 — ✅ WYKONANE 2026-10-24** (§5.4: `471191d` 531 · `da8b2c9` 532; bramka
> właściciela PASS). **T3 — ✅ WYKONANE 2026-10-25** (§5.5: `496ab80` — panel statku przy prawym outlinerze ze strojeniem 1;
> bramka właściciela PASS). **T1 — ✅ WYKONANE 2026-10-26** (§5.6: `fc44de7` — rozwinięcie informacyjne etykiet, etykieta
> na żądanie, dymki DOM wygaszone, karta ciała dla ciała bez akcji się nie otwiera; bramka właściciela PASS — oglądanie,
> bez uwag). **T2 — ✅ WYKONANE 2026-10-26** (§5.7: `0ddbf05` — przypięcie z akcjami przy etykiecie, karta ciała i panel
> stacji wyłączone przy `labelPin` ON; strojenie 1 — położenie przypięcia i rozwinięcia najechania względem tarczy, 554;
> bramka właściciela PASS); **T5 — ✅ WYKONANE 2026-10-26** (§5.8: `409f82b` — panel statku w idiomie etykiet przy prawym
> outlinerze za `shipPanelHud`, 530; strojenie 1 — zmiana zaznaczenia zdejmuje konfigurator misji (546), PL „Tankuj” /
> „Rozbiórka” (556); bramka właściciela PASS — szerokość 200 zostaje); **T6 — ✅ WYKONANE 2026-10-27** (§5.9: `694cfcf` —
> panele floty i grupy N ≥ 2 w idiomie etykiet przy prawym outlinerze za `fleetPanelHud`; strojenie 1 — klik w pustą mapę
> zdejmuje flotę, baner pickera ukryty przy konfiguratorze, „Odwrót” grupy tylko w starciu (562); bramka właściciela PASS;
> D-TR-9 ✅); **następny krok — T4** (sprzątanie: dok, `BodyCardSideLogic`, `FloatingPanel`, flagi T5 i T6), kotwica =
> commit dokumentacji `docs(TABS T6)`. Findingi po T3: ✅ 529, 539, 542, 543, 544, 545, 547; ⚪ 546, 548; po T1: ✅ 533,
> 536, 549, 551, 552 (przy `labelHover` ON), ✅ 550 (słownik); po T2: ✅ 488, 534, 537, 540, 553, 554 (przy `labelPin` ON),
> ⚪ 555; po T5: ✅ 530, 546 (przy `shipPanelHud` ON), 556 (słownik), 538 — część panelu statku (przy ON), ⚪ 557; po T6:
> ✅ 558, 559, 560, 561 (przy `fleetPanelHud` ON), 562 (przy OFF i ON), ⚪ 563, 564 (rejestr `HUD_PLAN.md` §3; 488 —
> `UI_PLAN.md` §6); pierwszy wolny **565**.
> **Kolejność całości (podpis D-TR-12 (b), D-TR-15 (b); T5 i T6 — decyzje właściciela 2026-10-26): 531 / 532 (drobny
> krok od razu) → T3 → T1 → T2 → T5 → T6 → T4 → paczka B ARKUSZA HUD** (B po T4: chipy warstw D-HUD-13 stają w pasie
> dolnym w miejscu doku; T4 sprząta flagi T5 i T6, a `FloatingPanel` — dopiero po T6). Reforma
> poza arkuszem HUD, po paczce A; dotyczy tych samych powierzchni co „reforma pływających okien” zaparkowana w ARKUSZU UI
> (`UI_PLAN.md` §1). Findingi — numeracja wspólna (`HUD_PLAN.md` §3): pierwszy wolny przed inwentarzem **531**, po
> przyjęciu §7 **544**, po T3 **549** (544–548 z T3 — §5.5), po T1 **553** (549–552 z T1 — §5.6), po T2 **556** (553–555
> z T2 — §5.7), po T5 **558** (556–557 z T5 — §5.8), po T6 **565** (558–564 z T6 — §5.9). Powiązane: 488, 493
> (`UI_PLAN.md` §6), 515, 528, 529, 530 (`HUD_PLAN.md` §3).
> **Teczka:** `C:\Users\Komputer\kosmos-handover\tabs-inventory\` — `probes/` (3 sondy CDP), `tools/` (kopia
> `kosmos_cdp_gpu.mjs` z paczki A), `results/behaviour/` (JSON i zrzuty pomiarów), `RAPORT_TABS_INV.md`.
> **Oznaczenia:** `[code]` — odczyt źródła, linie przy `ae23697` · `[measured]` — prawdziwa gra w izolowanym headless
> Chrome (GPU, CDP, serwer tylko-do-odczytu — nie Live Server), zapis ZF gy120 (Kepler-4799 — ten sam co bramki ARKUSZY
> UI i HUD), obca kolonia — zapis Polonia gy79; okno 1600×1041 CSS = logicznie **1280×833** przy skali UI 1,25 (okno
> właściciela), geometria także w **1280×720** · `[node]` — moduł gry pod node na atrapie ctx (stałe wierszy dokładne,
> szerokość znaku 6 px — szerokości tekstu przybliżone) · `[derived]` — wniosek bez osobnego pomiaru.

---

## 1. Ramy (decyzje właściciela 2026-10-24)

1. **Statki** — panel wysuwany W LEWO od prawego outlinera, na wysokości wiersza statku, zwijany przy zmianie
   zaznaczenia; pływający panel statku znika.
2. **Kolonie, ciała, stacje** — model etykiety: najechanie rozwija informację pod wersalikiem, klik przypina rozwinięcie
   z akcjami przy etykiecie; karta ciała i panel stacji znikają; **493 (karta z boku tarczy) = rozwiązanie przejściowe**.
3. **Pierwszy krok reformy = inwentarz zakładek read-only:** pola, akcje, kto otwiera — karta ciała, karta kolonii, panel
   statku, panel stacji.

## 2. Punkty wyjścia

| Powierzchnia | Dziś (ustalone w inwentarzu) | Ramy (§1) |
|---|---|---|
| panel statku | `FleetManagerOverlay.drawVesselPanel` → `_drawRight(…, {compact:true})` (ta sama metoda i instancja co prawa kolumna Rejestru — D-MVP-1); przy `bodyCardSide` z boku modelu statku — §3.3 | panel wysuwany w lewo od prawego outlinera — §1.1 |
| karta ciała | `BottomContext` — karta pływająca (przeciąganie, minimalizacja do doku — S3.4b); przy `bodyCardSide` z boku tarczy — §3.1 | znika — rozwinięcie etykiety — §1.2 |
| karta kolonii | **osobnego elementu nie ma** — kolonia dostaje tę samą kartę ciała (bez danych kolonii); dane kolonii niosą trzy podpowiedzi najechania i etykieta HUD — §3.2 | rozwinięcie etykiety kolonii — §1.2 |
| panel stacji | `StationPanel` — panel pływający (przeciąganie, dok — S3.4b); przy `bodyCardSide` z boku modelu stacji — §3.4 | znika — rozwinięcie etykiety — §1.2 |
| dok | `PanelDock` — chipy zminimalizowanych kart na pasie dolnym (U4-3); jedyni klienci: karta ciała i panel stacji — §3.5 | (nie w ramach; wniosek §5 — znika z kartami) |

Etykiety, na których staje model z §1.2, rysuje od paczki A warstwa HUD (`HudLabelLayer` — ARKUSZ HUD H2, `HUD_PLAN.md`
§4.3): **wyłącznie kolonie i stacje GRACZA oraz statki** (`HudLabelLayer.js:137-156`, `:388-456`) — kolonie wersalikami,
druga linia z danymi dla zaznaczonego i najechanego, strefa kliku = prostokąt tekstu, klik etykiety po karcie ciała.

---

## 3. Krok 1 — inwentarz (WYKONANY 2026-10-24)

### 3.0 Wspólne: obszar mapy, kolejność warstw, reguła kliku, zapis

**Obszar mapy i outlinery** (`MapInsets.getMapInsets`, `OutlinerColumn`):

| | 1280×720 (skala 1) | okno właściciela 1600×1041 CSS (skala 1,25 → 1280×833) |
|---|---|---|
| wcięcia L / P / G / D | 150 / 150 / 28 / 62 `[measured]` | 150 / 150 / 28 / 62 `[measured]` |
| obszar mapy (x, y, w × h) | 150, 28, **980 × 630** `[measured]` | 150, 28, **980 × 743** |
| prawy outliner | x 1130, y 28, **150** × 630 `[measured]` | x 1130, y 28, 150 × 743 `[measured]` |
| lewy outliner | 150 × 650 (do paska nawigacji) | 150 × 763 `[measured]` |
| wiersze prawego outlinera | nagłówek 18, układ 18, podnagłówek typu 14, statek i węzeł floty **16** (`Outliner.js:37-39`, `OutlinerColumn.js:31`) | jw. |
| statki ZF w układzie domowym | 11 wierszy, y 80–238 `[measured M7]` | — |

Skala UI: `UI_SCALE = min(okno.w / 1280, okno.h / 720)`, wymiary logiczne = okno / skala (`UIManager.js:93-115`).

**Kolejność rysowania** (`UIManager._draw`, `:2226-2418`; warstwa HUD — osobna kanwa `#hud-canvas` POD `#ui-canvas`):
karta ciała `:2289-2293` (najniżej z pływających; bez overlayu i globusa) → BottomBar `:2298` → overlay pełnoekranowy
`:2311` → etykiety CTRL `:2343` i plakietki `MapLabelLayer` (tylko przy `hudLabels` OFF) `:2347-2356` → lewy i prawy
outliner `:2361-2366` → lista kolonii z belki `:2367` → Dok taktyczny `:2372-2374` → pasek nawigacji `:2377` → pas dolny
`:2381-2384` → karta walki `:2387` → **panel stacji `:2388` (także NAD overlayem)** → panel floty `:2391` → panel grupy
`:2394-2395` → **panel statku `:2397-2404`** → **dok `:2409-2411`** → dziennik `:2412`.

**Kolejność kliku** (`UIManager.handleClick`, `:1964-2070`): karta walki `:1980` → **dok `:1982`** (bez overlayu) →
**panel stacji `:1983`** (także przy overlayu) → Dok taktyczny `:1985` → **panel statku `:1989`** → panel grupy `:1994` →
panel floty `:1997` → paski, belka, dziennik `:1999-2002` → outlinery `:2005-2008` → plakietki (OFF) `:2020-2024` →
menu `:2026` → overlay `:2037-2046` → TopBar / BottomBar `:2049-2056` → **karta ciała `:2059`** → **etykiety HUD
`:2063-2064`** → panel akcji `:2067`; `false` → `ThreeRenderer.handleClick` + `GameScene._handleTacticalLeftClick`
(`GameScene.js:5501-5507`). Blokada kamery (`isOverUI`): panel statku `:1907`, panel stacji `:1912`, dok `:1920`, karta
ciała `:1923`.

**Reguła klik/focus (U1)** — `readClickSelection` (`ClickIntentLogic.js:77-91`): zbiór statków i lider (panel statku
przy N == 1), `_selectedEntity` (karta ciała — **także zminimalizowana do doku**), panel stacji (**tylko widoczny
i niezminimalizowany**, `:81`), flota, ping wroga. 1. klik = `select` (okno, kamera stoi), 2. klik = `focus` (kamera),
obiekt z innego układu — 2. klik przełącza układ (§7.8 `UI_PLAN.md`).

**Esc** (`GameScene.js:4758-4808`): picker → menu PPM → **zaznaczenie statku** (`:4770-4774`) → klawisz / zamknięcie
overlayu → okno potwierdzenia → **menu ☰** (`:4803-4808`). Karty ciała i panelu stacji Esc **nie zamyka** `[measured M3]`.

**Zapis i F5:** `uiPrefs` w zapisie (`SaveSystem.js:96-97`, `GameScene.js:269-272`) ma klucze `sensorOverlayVisible`,
`fleetMapLabelsVisible`, `hudRadarVisible`, `combatFxVisible`, `battleAutoFocus` (w ZF także `miniMapVisible`,
`tacticalDockCollapsed`) — **żadnego dla czterech powierzchni**; zaznaczenie (statek, ciało, stacja), położenie kart
(`FloatingPanel` — „nie serializowane”, `FloatingPanel.js:9`) i dok żyją tylko w pamięci. F5 / wczytanie = brak kart,
pusty dok.

### 3.1 (a) Karta ciała — `BottomContext` (`src/ui/BottomContext.js`, 567 linii)

**I1 — pola** (tryb natychmiastowy: treść czytana z encji w każdej klatce `UIManager._draw` — przy `_dirty`, ruchu kamery,
co ≥ 100 ms w biegu gry, `UIManager.js:2209-2221`; wejście „fade” +0,16 na klatkę rysunku `:25`, `:146` — bez zegara):

| # | Pole | Źródło | Warunek pokazania | Linie |
|---|---|---|---|---|
| B1 | nazwa ciała (ucięta do 18 znaków) | `entity.name` | zawsze | `:216` |
| B2 | typ | `planetType ?? type` — **surowy identyfikator** („rocky”); gwiazda: `` `${spectralType}-type star` `` (angielski na sztywno) | zawsze | `:240-243` |
| B3 | „Odl: x AU” od planety macierzystej (kolor ostrzeżenia > 15 AU) | `DistanceUtils.fromHomePlanetAU` | civMode, nie gwiazda, nie dom, ma orbitę | `:109-117`, `:247-251` |
| B4 | zakładki ORBITA / FIZYKA / SKŁAD | `_visibleTabs`; stan `_tab` wspólny dla wszystkich ciał | nie gwiazda; SKŁAD gdy `composition` | `:102-107`, `:254-274` |
| B5 | „🏴 Okupowana: <kto>” | `readOccupier` / `readOccupierName` (`OccupationLedger`) | ciało okupowane w trwającej wojnie | `:342-347`, `:369-374` |
| B6 | „Garnizon: N jedn. / rezerwa N / nieznany” | `readGarrisonReadout` (`GarrisonReadout`, reguła 379) | obca kolonia | `:354-362` |
| B7 | ORBITA: orbita a (AU), mimośród, okres („lat” — po polsku na sztywno), stabilność %, wiek („lat”) | `orbital`, `orbitalStability`, `age` | zakładka ORBITA | `:391-400` |
| B8 | FIZYKA: masa (M⊕), temperatura °C, atmosfera (+ „(zdatna)”), życie % + etap | `physics.mass`, `temperatureC/K`, `atmosphere`, `lifeScore` | zakładka FIZYKA; ciało niezbadane — „???” | `:402-425` |
| B9 | SKŁAD: 5 największych składników % | `composition` (klucze surowe) | zakładka SKŁAD; niezbadane — „???” | `:427-440` |
| B10 | gwiazda: typ, masa (M☉), „Luminosity” (na sztywno), temperatura K, „HZ” | `spectralType`, `physics.mass`, `luminosity`, `temperature`, `habitableZone` | gwiazda | `:380-389` |
| B11 | złoża (do 12; od 6 w dwóch kolumnach): id + ★ / ★★ / ★★★, kolor z pozostałej ilości | `deposits` (`resourceId` surowe) | explored ∨ dom ∨ poza civMode | `:133-141`, `:306-326` |
| B12 | przycisk akcji: „► Mapa ciała” / „► Przejmij cywilizację” | `_actionLabel` | dom, kolonia (także AI), ciało `analyzed`; Generator: życie > 80 | `:119-131`, `:289-304` |
| B13 | ikona chipa w doku | `_entityIcon` (⬢ kolonia, ★ ☾ ◆ ☄ ●) | po ▼ | `:555-566` |

**I2 — akcje:**

| # | Akcja | Skutek | Potwierdzenie | Odpowiednik gdzie indziej | TYLKO tu |
|---|---|---|---|---|---|
| A1 | ✏ zmiana nazwy | `showRenameModal` → `entity.name` + `body:renamed` (ColonyManager `:136-142` przenosi nazwę na kolonię) | modal z polem | raport ciała w Dowództwie → Atlas (`BodyDetailModal.js:281`, otwierany z FMO `:2300-2304`) | nad mapą — tak |
| A2 | ▼ minimalizuj | `_minimize` → `panelDock.register('body:<id>')`; karta znika, **zaznaczenie zostaje** | — | — | tak |
| A3 | − zamknij | `body:deselected` (bez powodu) → karta, **panel stacji** (`StationPanel.js:66-71`), zaznaczenie renderera (orbity, znaczniki kolonii) | — | klik w pustą mapę (`ThreeRenderer.js:3344`), przełączenie układu (ciało spoza docelowego); Esc — nie | nie |
| A4 | zakładki | `_tab` | — | raport ciała (Atlas) | nad mapą — tak |
| A5 | ► Mapa ciała | `_doAction` `:467-502`: (i) dom / własna kolonia → `switchActiveColony` + `openPanel('colony')`; (ii) obca kolonia z WŁASNYMI jednostkami → `openPanel('colony', {colonyId})`; (iii) ciało `analyzed` bez kolonii (i obca kolonia bez moich jednostek) → `planet:previewMap` (podgląd tylko-do-odczytu); (iv) Generator → `planet:colonize` | — | (i) klawisz H / nawigacja (tylko AKTYWNA kolonia), lista kolonii z belki, Dziennik; (ii) 🪖N w lewym outlinerze (`LeftOutliner.js:255-262`); (iii) **brak — `planet:previewMap` ma JEDNEGO producenta (`:500`)**; (iv) dwuklik poza civMode (`GameScene.js:5634`) | **(iii) TAK** |
| A6 | przeciąganie za nagłówek | `FloatingPanel` (UIManager `:2131`, `:2170`, `:2143`) | — | — | tak |
| A7 | kółko i klik w tło | pochłonięte (`:331`, `:464`, `:505-507`) | — | — | — |

Zmierzone `[measured]` (ZF, układ domowy): **33 ciała klikalne** (gwiazda, 4 planety, 10 księżyców, 18 planetoid);
akcję „► Mapa ciała” ma **26** z nich — 5 kolonii i **21 ciał `analyzed` bez kolonii** (wariant (iii)); bez akcji —
gwiazda i 6 planetoid.

**I3 — wejścia i zamknięcie** (otwarcie = `body:selected` → `UIManager._selectedEntity`, `UIManager.js:770-776`):

| Wejście | Ścieżka | 1. / 2. klik | Linie |
|---|---|---|---|
| mapa 3D — tarcza ciała | `ThreeRenderer.handleClick` → `clickObject(body)` | 1. `{focus:false}` (karta, kamera stoi); 2. `{focus:true}` (kamera + auto-zoom); gwiazda 2. → `resetToSystemView` | `ThreeRenderer.js:3339-3342`, `:1037-1078` |
| lewy outliner — wiersz ciała, ⏳N | `clickObject(bodyTarget)` | jw. | `LeftOutliner.js:264-266` |
| etykieta HUD kolonii (A-1) | `HudLabelLayer.handleClick` → `clickObject`; zwinięta grupa → kotwica | jw.; klik HUD po karcie w łańcuchu (515) | `HudLabelLayer.js:623-630`; UIManager `:2063` |
| 2. klik w statek ZADOKOWANY przy planecie / księżycu (prawy outliner, Dok taktyczny, Tab) | `vessel:focus` → `body:selected` (focus domyślnie `true`) | karta ciała HANGARU + kamera `[measured M5b]`; przy **planetoidzie — nic** (§7, 532); przy stacji — `station:focus` bez panelu | `ThreeRenderer.js:1213-1233` |
| Dziennik — wpis | `body:selected` (+ dla kolonii gracza `openPanel('colony')`) | z kamerą; karta pod overlayem (widoczna po zamknięciu) | `EventLogOverlay.js:368-376` |
| Obserwatorium — katalog | `body:selected` | jw. | `ObservatoryOverlay.js:290-296` |
| start partii / intro | `body:selected` domu | z kamerą | `GameScene.js:3645`, `:3703`, `:5132` |
| `camera:focusTarget` | `body:selected` | jedyny producent — FMO `map_planet` `:2694`, martwy przy `commandTacticalMap:false` | `GameScene.js:3617-3622` |
| chip doku | `onRestore` → `{focus:false}` | karta wraca, kamera stoi (T13) | `:544-551` |
| przełączenie układu | `syncBodyCardOnSystemSwitch` (486): spoza docelowego → `body:deselected {reason}`; z docelowego → `{focus:false}` | — | `ClickIntentLogic.js:186-194`; UIManager `:780-786` |
| (martwe) FMO `map_body` / `map_station`; `FleetTabPanel` | — | `commandTacticalMap:false`; plik bez importu | FMO `:2249-2298`; `FleetTabPanel.js:459` |

**Zamknięcie:** „−”, klik w pustą mapę, przełączenie układu (ciało spoza docelowego). **Ukrycie bez zamknięcia:** overlay
pełnoekranowy i globus (`:2291`), SHIFT (`:2235`), ▼ (zaznaczenie zostaje). **Esc — nie** `[measured M3]`.
**`readClickSelection`:** `entityId` także dla karty zminimalizowanej → klik w to ciało = `focus` (kamera) + karta wraca
`[measured M4]`; panel stacji zminimalizowany daje `select` (T2e) — asymetria (§7, 535).

**I4 — stan:** `_tab` (sesja, wspólny), `_slideProgress`, `_minimized`, `_prevEntity`, `_float.dragPos` (przeciągnięcie
odczepia kartę od kotwicy do zmiany ciała `:153` albo przywrócenia z doku `:547`), `_sideMem` (strona z histerezą —
`SWITCH_MIN_MS` 400, `RESET_IDLE_MS` 1000, `BodyCardSideLogic.js:22-28`, `:74-94`). Położenie przy `bodyCardSide` ON:
z boku tarczy (prawo, odstęp 16 px, flip w lewo; pion — środek tarczy; `computeSideCardPlacement` `:43-67`; tarcza
z projektora HUD — `objectScreenDisc` `:110-126`); ciało za kamerą / poza sceną → róg obszaru (ox + 12, oy + 12); przy OFF —
`computeFloatingPlacement` (18 px od ŚRODKA ciała, px CSS jako logiczne — 528). Obszar: `_bounds` — lewa i prawa krawędź
z `MapInsets`, **górna `TOP_BAR_H` 46** (nie `MapInsets.top` 28), dół nad pasem (`:90-100`). Nic w `uiPrefs`, nic w zapisie.

**I5 — rozmiar:** szerokość **240** (`PW` `:28`); wysokość 4 + 22 + 14 [+ 14 dystans] [+ 20 zakładki] + 14 × wiersze + 4
[+ 26 akcja] [+ 14 + 12 × wiersze złóż + 4] + 6 = **120–298 px** `[derived]`; `[node]`: gwiazda M z HZ 240 × 120, księżyc
niezbadany 240 × 154, dom z 8 złożami 240 × 246, planeta z 12 złożami i dystansem 240 × 270; `[measured M1]`: Nowa Ziemia
240 × 232. Wiersze treści 4–7 (+ odznaka, + garnizon) + do 6 wierszy złóż. Najdłuższe teksty (PL / EN, znaki): „??? (wymaga
rozpoznania)” 24 / „??? (requires reconnaissance)” 29; „► Przejmij cywilizację” 22 / „► Take Civilization” 19; „Chemia
prebiotyczna” / „Prebiotic chemistry” 19; „rezerwa {0} jedn.” 17 / „reserve: {0} unit(s)” 20; nazwa ucinana do 18 znaków.

**I6 — zależności.** Keepery: `s34b_bottomcontext_smoke` (▼ → dok, przywrócenie, `body:selected` zdejmuje chip,
`entity:removed`, „−” → `body:deselected`) · `body_card_side_smoke` C1–C5 (C4a — montaż karty) · `click_focus_rule_smoke`
T2b, T9, T13 · `left_outliner_smoke` L5i–L5j, L11a–L11f, L17 · `map_insets_single_source_smoke` M2, M10 · `hud_labels_smoke`
L7c (klik HUD po karcie — 515) i przeszkoda `_cardRects` (`HudLabelLayer.js:485-496`) · `hud_layer_smoke` L4 (wyzwalacz
„ciało na karcie”) · `g3_ground_visibility_smoke` V8 · `g3_regrowth_smoke` R8 · `wp_occupied_badge_smoke` T0b, T4 ·
`ground_troops_reachable_smoke` T4 (`_doAction` — obca kolonia z moimi jednostkami). Findingi: 488 ⚪ (glif „−”), 493 ✅
przejściowo, 515 ✅ (ON), 528 ⚪ (OFF), 486 ✅, 496 ✅, 522 ⚪ (`planetGlobeOpen` bez pisarza), 492 🟠 (czarny ekran po H —
mapa kolonii), 113 (literały); nowe — §7: 531, 532, 534, 535, 537, 538, 541.

**I7 — docelowe miejsce:**

| Pole / akcja | Miejsce | Uzasadnienie |
|---|---|---|
| B1 nazwa | [E-hover] | to jest wersalik etykiety (kolonia) albo nazwa etykiety na żądanie (ciało bez kolonii — D-TR-1). |
| B2 typ + B8 temperatura i atmosfera | [E-hover] (1 linia: „skalista · +13 °C · oddychalna”) | pierwsze pytanie „co to za ciało”; typ przez klucz i18n, nie surowe id (538). |
| B5 okupacja, B6 garnizon | [E-hover] (po 1 linii, tylko gdy są) | stan wojny i decyzja desantu bez klikania. |
| B11 złoża | [E-hover] skrót („złoża 8 · ★★★ 3”), pełna lista [E-pin] | do 12 pozycji — nie mieści się w 4 liniach. |
| B3 dystans od domu | [E-pin] | pomocnicza przy wysyłce; podpowiedź mapy podaje odległość od GWIAZDY (inna liczba). |
| B4 zakładki, B7 orbita, B8 masa i życie, B9 skład, B10 gwiazda | [X] → raport ciała (D-TR-4) | dane katalogowe; `BodyDetailModal` ma je razem z ✏ — wystarczy przycisk „Raport” w przypięciu. |
| B12 / A5 Mapa ciała (4 warianty) | [E-pin] | akcja; wariant (iii) — jedyny producent `planet:previewMap` (21 z 33 ciał ZF). |
| A1 ✏ | [E-pin] przez raport (D-TR-4) | ✏ jest w `BodyDetailModal` (`:281`). |
| A2 ▼, A6 przeciąganie, B13 | [X] | przypięcie przy etykiecie nie potrzebuje doku ani przeciągania (D-TR-6). |
| A3 − | [E-pin] ✕ + Esc (D-TR-5) | dziś „−” myli (488), Esc nie działa (534). |

Budżet 4 linii informacyjnych `[derived]`: kolonia gracza — dziś 1 linia danych (POP · wolne · stolica · wykr.) + typ,
temperatura, atmosfera + złoża skrót + (okupacja albo kolejka) = 4; ciało bez kolonii — typ / temperatura / atmosfera +
status zbadania + złoża skrót + dystans = 4; obca kolonia — właściciel (wg wywiadu) + garnizon + okupacja + typ = 4. Z 13
pól karty w rozwinięciu mieści się 5–6 (B1, B2, B5, B6, część B8, skrót B11); B3 i B12 → przypięcie; B4, B7, B9, B10 →
raport; A2, A6, B13 → [X].

**I8 — ryzyka:**
1. **28 z 33 ciał ZF nie ma dziś etykiety HUD** `[measured]` (etykiety: 5 obiektów — NOWA ZIEMIA +2 [dom, Nowy Księżyc,
   stacja], NT, CU I HV, FOBOS, ◆ ×2) — rozwinięcie „pod wersalikiem” nie ma pod czym się pojawić dla gwiazdy, ciał bez
   kolonii i kolonii AI (D-TR-1).
2. Akcja „Mapa ciała” jest w 26 z 33 ciał — przypięcie musi istnieć także dla ciał bez etykiety, inaczej podgląd mapy
   (jeden producent) znika.
3. **Ruchomy cel kliku:** etykieta przesuwa się z orbitą i z anti-overlap (`placeLabels` — poprzedni kandydat wygrywa
   tylko póki ważny, `HudLabelLogic.js:169-203`) → przycisk w przypięciu może „uciec” spod kursora; najechanie powiększa
   prostokąt etykiety (już dziś druga linia) → możliwa oscylacja „najechanie → przesunięcie → koniec najechania”.
4. Rozwinięcie 4 linii = prostokąt do ~228 × 74 px (`MAX_NAME_PX` 180 + 40, `PAD` 4; linia 13–14 px — fonty 9 / 11 w 4
   motywach Share Tech Mono, 10 / 12 w Neon Cyber) wobec dzisiejszych ~228 × 31 → w szynie stosu rośnie cały blok; element
   większy niż kadr znika (`placeLabels` `:174`).
5. Trzy warstwy najechania już dziś `[measured M6]` — bez D-TR-2 rozwinięcie byłoby czwartą.
6. Dziś trzy karty naraz, nałożone `[measured M1]` — reguła „jedno okno” do ustalenia (D-TR-5).
7. **Akcje wymagające dojścia myszą do przycisku** (rozwinięcie na najechanie znika, gdy kursor opuszcza etykietę —
   hover ich nie udźwignie): A1 ✏, A3 zamknięcie, A5 „Mapa ciała” (4 warianty), a w panelu stacji S10 „Zarządzaj” i ✕ —
   wszystkie → [E-pin].

### 3.2 „Karta kolonii” — co otwiera się dla kolonii z mapy poza `ColonyOverlay`

**Odczytanie: osobnej karty kolonii nie ma.** Dla kolonii (gracza i AI) otwiera się ta sama karta ciała (§3.1) — bez
danych kolonii (POP, budynki, produkcja). Jej jedynymi elementami „kolonijnymi” są „► Mapa ciała” (B12/A5), odznaka
okupacji (B5), garnizon obcej kolonii (B6) i ikona ⬢ chipa (B13). Dane kolonii niosą znaczniki i podpowiedzi:

| # | Powierzchnia | Treść | Kiedy | Linie |
|---|---|---|---|---|
| K1 | karta ciała | §3.1 | klik | `BottomContext` |
| K2 | znaczniki budynków na tarczy 3D (`_colonyMarkers`) | ikony budynków | zaznaczone ciało z kolonią (także AI) | `ThreeRenderer.js:1059-1070` |
| K3 | podpowiedź budynku (`#colony-3d-tooltip`, DOM) | nazwa (`namePL`), poziom, stawki „/rok”, utrzymanie, energia, etaty, mieszkania — po polsku na sztywno | najechanie znacznika budynku zaznaczonej kolonii | `:3652-3657`, `:3672-3707` |
| K4 | podpowiedź kolonii (`#colony-3d-tooltip`) | nazwa, okupacja, „POP: x/y (wolne: z)”, lista budynków z poziomami, bilans energii — **bez limitu wysokości**: lista stolicy ZF wychodzi poza okno 1041 px i przykrywa pasek nawigacji `[measured M6]` | najechanie tarczy ZAZNACZONEJ kolonii | `:3659-3666`, `:3710-3770`, `:3941-3959` |
| K5 | podpowiedź mapy (`#kosmos-tooltip`, `Tooltip.js`, 500 ms) | typ (surowy), status zbadania, odległość od gwiazdy, atmosfera, właściciel, populacja, zasoby, temperatura — **przy kolonii AI: „Właściciel: Imperium gracza” i populacja przy wywiadzie `contact`** `[measured — Polonia]` (§7, 531) | najechanie dowolnego ciała (nie gwiazdy) | `GameScene.js:5764-5791`, `:5853-5885`; `TooltipContent.js:119-175` |
| K6 | etykieta HUD kolonii (A-1), druga linia | „N POP · M wolne · ✦ stolica · wykr. X AU” | zaznaczona / najechana kolonia GRACZA | `HudLabelLayer.js:210-224` |
| K7 | (outliner) podpowiedź wiersza kolonii | nazwa, typ + temperatura, POP / mieszkania + prosperity, epoka, zapasy, budynki | najechanie wiersza własnej kolonii w lewym outlinerze | `LeftOutliner.js` `colonyTooltipLines` |

Przy najechaniu zaznaczonej kolonii pokazują się naraz K4, K5 i K6 (`results/behaviour/M6_najechanie_kolonii.png`).
**I7 dla K:** K6 → [E-hover] (rdzeń rozwinięcia kolonii) · K4 „POP / wolne” → [X] (duplikat K6) · K4 budynki i bilans
energii → [E-pin] skrót („budynki 31 · ⚡ +34/rok”) albo [X] (mapa kolonii) — D-TR-3 · K5 → [X] (D-TR-2; 531) · K2, K3 →
bez zmian (mapa budynków na tarczy, nie zakładka) [?] · K7 → poza zakresem (outliner).

### 3.3 (b) Panel statku — `FleetManagerOverlay.drawVesselPanel` nad mapą (tryb kompaktowy)

Host w `UIManager`: geometria `_vesselPanelBounds` `:472-504`, rysunek `:2397-2404`, klik `:1989-1990`, kółko
`:2104-2105`, przeciąganie `:508-529`, `:2129`, `:2141`, `:2168`, blokada kamery `:1907`. Render: FMO `drawVesselPanel`
`:1417-1465` → `_drawRight(…, {compact:true})` `:7387-8147` (ta sama metoda i instancja co prawa kolumna Rejestru —
D-MVP-1; kompakt pomija kartę katalogową `:7596-7735`) + footer `:1471-1497`. Otwarcie — zaznaczenie N == 1
(`resolveMapSelectionSurface`, `MapVesselPanelLogic.js:24-30`); wróg i wrak — bez panelu (`:1422`).

**I1 — pola** (tryb natychmiastowy, co klatkę `_draw`; cele pickera — pamięć 2 s, `:9394`):

| # | Pole | Warunek | Linie |
|---|---|---|---|
| V1 | link „← Stocznia” | zawsze | `:7519-7526` |
| V2 | ikona kadłuba, nazwa (ucięta do 12 znaków), ✎ | zawsze | `:7528-7544` |
| V3 | rola (`_roleLabel` — envoy / `getPrimaryRole`) · nazwa kadłuba | zawsze | `:7546-7550` |
| V4 | status „● …” (kolor z kanonu `resolveVesselStatus` — 266) + gwiazdki doświadczenia | zawsze | `:7554-7564` |
| V5 | „Baza: …” | zawsze | `:7565-7573` |
| V6 | MODUŁY (n / max): ikona i etykieta slotu, nazwa modułu | zawsze | `:8451-8488` |
| — | osiągi, paliwo, paliwo warp, wytrzymałość, utrzymanie, unieruchomienie, zaległość | **tylko poza kompaktem** (Rejestr) — na mapie NIE | `:7596-7735` |
| V7 | „📦 Cargo: użyte / maks. t” (przycisk) | ładownia > 0, w doku albo na orbicie | `:7737-7757` |
| V8 | „Wyładuj N kolonistów” (przycisk) | koloniści > 0, w doku | `:7759-7779` |
| V9 | „🚀 Wystartuj na orbitę” (przycisk) | w doku | `:7781-7800` |
| V10 | rozkaz ruchu: typ + cel + dystans + „(mission paused)”; „⚠ Order blocked: <slug>” (angielski / polski na sztywno) | aktywny rozkaz | `:8587-8655` |
| V11 | aktywna misja: typ → cel, faza + ETA (rok), pasek postępu | misja w `MissionSystem` | `:8688-8734` |
| V12 | manifest: plan / na pokładzie / powrót (po 4 pozycje) | misja z ładunkiem | `:8737-8836` |
| V13 | przylot międzygwiezdny: nagłówek, „Dotarł do …”, [Przełącz widok] | `interstellar_jump` + `in_system` | `:7826-7879` |
| V14 | orbita obcego ciała: nagłówek + recon / kolonizacja / rozładunek | `exploration` + `orbiting_body` | `:7881-8008` |
| V15 | rekon obcy w toku: „Skanowanie / Lot do …”, postęp i / N, [Przerwij] | `foreign_recon` | `:8010-8059` |
| V16 | pętla transportowa: etap, „A ⇄ B”, oczekiwanie, [Przerwij pętlę] | pętla aktywna | `:8061-8118` |
| V17 | konfigurator misji (wybór celu / potwierdzenie) — zastępuje akcje i dziennik | `_missionConfig` | `:8120-8129`, `:9068-9363` |
| V18 | AKCJE: oś służby (Wycofaj / Rozmieść albo pasek mobilizacji), siatka 2 × N rozkazów z powodami blokad | zawsze | `:8899-8984`, `:8858-8897` |
| V19 | 🗑 Rozbiórka (zwrot 75 %) albo „wymaga stoczni” | w doku | `:8986-9016` |
| V20 | ⛽ Zatankuj + Auto-tankowanie | w doku | `:9018-9043` |
| V21 | pula logistyczna (przełącznik) | `transportOrders` | `:9045-9061` |
| V22 | Rally: przypisz / zmień / usuń | istnieje POI rally | `:8180-8235` |
| V23 | dziennik misji (8 wpisów, 18 znaków na wpis) | wpisy istnieją | `:8139-8143`, `:9363-9389` |
| V24 | footer: Odwrót / → Flota / Dokuj | zawsze | `:1471-1497` |
| V25 | pasek przewijania | treść > wysokość | `:8160-8178` |

**I2 — akcje** (31 typów stref; `action` = 16 rozkazów siatki — `FleetActions.getAvailableActions`, `:620-697`):

| Strefa | Skutek (`_handleHit`) | Potw. | Odpowiednik | TYLKO tu (nad mapą) |
|---|---|---|---|---|
| `back_to_shipyard` | odznacza + `openPanel('shipyard')` `:2228-2235` | — | nawigacja 🛠 / klawisz S | nie |
| `rename` | `_renameVessel` (modal) `:2677-2679` | modal | Rejestr; FleetGroupPanel ✏ (N ≥ 2) | nie |
| `cargo_load` / `unload_colonists` / `undock` | CargoLoadModal `:2697`; `_unloadColonists` `:2700`; `undockToOrbit` `:2703-2706` | modal / — / — | Rejestr; FleetGroupPanel „Odcumuj” (N ≥ 2) | tak (N == 1) |
| `cancel_movement_order` | `tryCancelVesselOrder` → `MOS.cancelOrder` `:2718-2731` | — | Dok taktyczny ✕, FleetGroupPanel / FleetCommandPanel Stop, Rejestr | nie |
| `cluster_switch` | `switchActiveSystem` `:2479-2493` | — | lewy outliner (klik układu), Stratcom | nie |
| `foreign_recon_body` / `_system`, `foreign_colonize`, `foreign_unload`, `abort_foreign_recon` | `expedition:foreignRecon` / `foreignColonize` (+ odznacza) / `foreignUnload`; `abortForeignRecon` `:2593-2652` | — | Rejestr (jedyni producenci `expedition:foreignRecon` — FMO `:7871`) | tak |
| `cancel_loop` | `transport:cancelLoop` `:2715-2717` | — | Rejestr | tak |
| `withdraw_vessel` / `deploy_vessel` | `withdrawVessel` / `deployVessel` (+ `vessel:deployRejected`) `:2439-2453` | — | Rejestr | tak |
| `action` (16: orbit, load_troops, survey, deep_scan, colonize, load_colonists, transport, transport_passenger, found_outpost, drop_troops, orbital_strike, full_scan, send_away_team, collect_away_team, redirect, dock_station) | `_handleAction` `:2763-2832` — modale ładunku / kolonistów / wojsk / desantu albo konfigurator celu, albo `action.execute` | modal / krok „potwierdź” | Rejestr; PPM — wyłącznie rozkazy ruchu (`src/data/RightClickMenuOptions.js` — moveToPoint, patrol, pursue, intercept, engage, escort, retreat, POI, dock) | **tak — misje tylko tu i w Rejestrze** |
| `select_target`, `confirm_mission`, `cancel_config`, `change_target`, `toggle_repeat`, `set_return_cargo` | konfigurator `:2656-2676`, `:2707-2714` (**`_missionConfig` wspólny z Rejestrem**) | krok „potwierdź” | Rejestr | tak |
| `disband` | `fleet:disbandRequest` → `ColonyManager._disbandVessel` + odznacza `:2732-2736` | **BRAK** (nieodwracalne) | Rejestr | tak |
| `manual_refuel` / `toggle_refuel_auto` | `manualRefuel` / mutacja `refuelAutomatically` `:2737-2744` | — | FleetGroupPanel Tankuj (N ≥ 2), Rejestr | tak (N == 1) |
| `toggle_logistics_pool` | `transportOrderSystem.togglePool` `:2434-2436` | — | Rejestr | tak |
| `rally_assign_open` / `_remove` | `_openRallyAssignModal` / `_removeFromRally` `:2681-2688` | modal | Rejestr | tak |
| `mvpRetreat` / `mvpFleet` / `mvpDock` | `MOS.issueOrder({type:'retreat'})`; `assignVesselsToFleet`; `openDockPicker({sameSystemOnly:true})` `:1590-1608` | — / modal / picker | PPM „Wycofaj się z bitwy” / „Dokuj tutaj”, FleetGroupPanel, FleetCommandPanel | nie |
| kółko / przeciąganie / tło | `handleVesselPanelScroll` `:1524-1530`; UIManager `:508-517`; pochłanianie ③ `:1556-1587` | — | — | — |

Nad mapą (bez otwierania Dowództwa) panel statku jest **jedynym** miejscem rozkazów misji, osi służby, rozbiórki,
tankowania, puli, rally i akcji w obcym układzie; w grze nic z tego nie jest unikalne (to samo `_drawRight` w Rejestrze).

**I3 — wejścia i zamknięcie** (`ui:selectionChanged`; `readClickSelection` — klucz `vessel:<lider>` tylko przy N == 1,
`ClickIntentLogic.js:44-55`):

| Wejście | Ścieżka | Linie |
|---|---|---|
| mapa 3D — model własnego statku | picker `ThreeRenderer.handleClick` → `GameScene._selectFromClickPick` → `setSelectedVesselId`; 2. klik → `vessel:focus` (kamera) | `ThreeRenderer.js:3302-3316`; `GameScene.js:6056-6064` |
| prawy outliner — wiersz statku | `clickObject(vesselTarget)` (+ mutex floty, ping statku w doku; CTRL — `toggleSelection`) | `Outliner.js:285-299` |
| Dok taktyczny (tryb Y) — wiersz | `clickObject` + ping | `TacticalDock.js:631-650` |
| etykieta HUD statku | `vesselsTarget` — pojedynczy → panel statku; klaster → N ≥ 2 → panel grupy | `HudLabelLayer.js:448` |
| Tab / Shift+Tab | `cycleSelectedVessel` — zaznaczenie + „drugi klik” (kamera; zadokowany przy planecie — karta ciała hangaru) | `UIManager.js:625-644`; `GameScene.js:4812-4821` |
| SHIFT — zaznaczenie prostokątem jednego statku, Dowództwo (zaznaczenie przeżywa zamknięcie overlayu), panel grupy 2 → 1 | — | D-MVP-3 |

**Zamknięcie:** `clearSelection` — klik w pustą mapę **i w tarczę ciała / model stacji NA MAPIE** (`GameScene.js:6066`)
`[measured M2]`; Esc (`:4770-4774`) `[measured M3]`; klik floty w prawym outlinerze (mutex, `ClickIntentLogic.js:153-154`);
„← Stocznia”, rozbiórka, „Kolonizuj” obce (odznaczają — FMO `:2230`, `:2734`, `:2614`); wrak. Klik ciała w LEWYM
outlinerze panelu NIE zamyka — asymetria (§7, 539). Ukrycie: overlay, globus, SHIFT; N ≥ 2 → panel grupy.

**I4 — stan:** `UIManager._vesselPanelFloat` (`FloatingPanel` — `dragPos`, `reanchor()` przy zmianie statku `:554`),
`_vesselPanelSide` (pamięć strony 493), `_vesselPanelDragBounds`; FMO `_rightScrollY` (**wspólny z Rejestrem** — D-MVP-6;
reset przy zmianie statku `:7484-7487` i kroku konfiguratora `:7488-7495`), `_missionConfig` (**wspólny z Rejestrem** —
wybór celu zaczęty na mapie trwa w Dowództwie i odwrotnie), `_cachedTargets` (2 s). Położenie przy ON: z boku modelu
(`objectScreenDisc 'vessel'`); statek bez modelu (zadokowany) albo za kamerą → kotwica zapasowa `resolveVesselPanelAnchor`
— prawy górny róg obszaru mapy (x = ox + ow − 300 − 12, y = oy + 8; `MapVesselPanelLogic.js:53-63`) — w pomiarze M5 panel
statku w doku stał w (810, 44) `[measured]`. Obszar clampu — `MapInsets` + 8 px (`:485-487`). Nic w `uiPrefs`, nic w zapisie.

**I5 — rozmiar:** **300 × 300** (kompakt), **360** w kroku wyboru celu (`MVP_COMPACT_H` / `MVP_SELECT_H`, UIManager
`:100-101`; szerokość = `REGISTRY_RIGHT_W` 300, FMO `:53` — golden E1/E2); footer 34 (`MVP_FOOTER_H`, FMO `:235`) → treść
266 / 326 px z przewijaniem (keeper compact C1: bez kompaktu treść ≈ 550 px, pierwsza akcja y + 456; kompakt — treść 322,
pierwsza akcja y + 228). Najdłuższe teksty kompaktu (PL / EN): „⛽ Czeka na paliwo (leg wylotowy)…” 33 / 34;
„＋ Dodaj do puli logistycznej” 28 / „✓ In logistics pool (remove)” 28; „🗑 Disband — wymaga stoczni” 27 / „… requires
shipyard” 30; „Oczekiwanie (brak miejsca)” 26 / 20 (poza kompaktem — „Skarbiec wystarcza — kara zejdzie przy najbliższej
próbie” 57). **Przy prawym outlinerze** `[derived]`: kolumna 150 px; panel 300 px wysunięty w lewo = x 830–1130 (31 %
szerokości obszaru mapy 980); przy 1280×720 wysokość 300 / 360 = 48 % / 57 % wysokości obszaru (630); każdy wiersz
(y ≤ 642) mieści się w zasięgu pionowym jakiegoś położenia panelu (górna krawędź 32–354 przy 300, 32–294 przy 360).

**I6 — zależności.** Keepery: `map_vessel_panel_smoke` (C1–C6; P1–P13, P-open, P-flag, P-scroll, P11, P-A1, P12, P-plate;
P8/P9 — footer i `sameSystemOnly`) · `map_vessel_panel_compact_smoke` (C1–C2, E1–E3, M2, R1–R2, A1–A2, D1–D2, S1–S2, Z1–Z3,
K1–K2) · `body_card_side_smoke` C4c · `right_outliner_smoke` R5, R9d, R10 · `left_outliner_smoke` L7i ·
`click_focus_rule_smoke` T10, T12, T14, T15 · `hud_labels_smoke` (`_cardRects` — panel przeszkodą etykiet) ·
`foreign_panel_slim_smoke` f-1, f-2 · `return_actions_removed_smoke` · `return_home_no_brick_smoke` (pin renderu) ·
`w2_deploy_ui_smoke` (oś służby) · `return_dock_family_smoke` (picker doku). Findingi: 529 ⚪ (panel z boku modelu
przykrywa trasę i cel), 493 ✅ przejściowo, 528 ⚪ (OFF), 260 ✅, 256 (D-MVP-9), 145, 253, 266, 269 / 113 (literały),
498 ⚪ (karta walki na pasie), 485 ⚪ (podpowiedź najechania zdradza statek w mgle); nowe — §7: 532, 536, 537, 538, 539, 542,
543.

**I7 — docelowe miejsce:** domyślnie wszystko → [O-panel] (ta sama metoda `_drawRight` w nowej geometrii — tożsamość
z Rejestrem zostaje z konstrukcji), z wyjątkami:

| Pole / akcja | Miejsce | Uzasadnienie |
|---|---|---|
| V1 „← Stocznia” | [X] (tylko w panelu przy outlinerze; Rejestr bez zmian) | artefakt układu Dowództwa; nad mapą odznacza statek i otwiera Stocznię. |
| V2–V6, V7–V9, V11–V22, V24 | [O-panel] | sedno panelu statku (rozkazy, misje, ładunek, oś służby). |
| V10 rozkaz ruchu + ✕ | [O-panel] + [E-hover] (aktywność w rozwinięciu wiersza / etykiety) | „co robi” bez otwierania panelu. |
| V19 rozbiórka | [O-panel] + potwierdzenie (D-TR-13) | nieodwracalna, a panel stanie przy liście. |
| paliwo / utrzymanie (dziś brak w kompakcie) | [?] D-TR-11 | mini-panel Doku pokazuje paliwo, kompakt — nie. |
| V23 dziennik misji (18 znaków / wpis) | [?] — rekomendacja [X] (Rejestr i Dziennik) | nieczytelny w kompakcie. |
| przeciąganie, kotwica z boku modelu (493), V25 | [X] / [O-panel] | panel przyklejony do kolumny. |

Najechanie statku już dziś ma trzy warstwy (wiersz prawego outlinera — R8; etykieta HUD; `#colony-3d-tooltip`
i `#kosmos-tooltip` — `[measured M6]`) — [E-hover] dla statku = wiersz outlinera + etykieta (D-TR-2, D-TR-3).

**I8 — ryzyka:**
1. Kotwica „wiersz statku” istnieje tylko przy widocznym prawym outlinerze — klawisz „.”, overlay i rozwinięty Dok
   taktyczny go chowają (decyzja 4, `OutlinerColumn.js:39-41`) → D-TR-8.
2. Wiersz w zwiniętym / przewiniętym układzie: zaznaczenie z mapy rozwija i przewija do wiersza (R7, `_revealKey`), ale
   przewinięcie listy kółkiem odsuwa wiersz od panelu albo za kadr kolumny → panel musi iść za wierszem albo zostać
   w ostatnim położeniu.
3. Flota (węzeł) i grupa N ≥ 2 mają osobne panele (`FleetCommandPanel`, `FleetGroupPanel` — 340 px, lewy dolny róg) →
   D-TR-9.
4. Karta walki (`CombatHUD` — 560 px na środku dołu, do 45 % wysokości; x 360–920 przy 1280) zachodzi na panel przy
   outlinerze (x 830–1130) w pasie x 830–920; panel rysuje się PO karcie (`:2387` → `:2397`) i przykrywa jej prawą część
   `[derived — scena walki niezmierzona]`.
5. Tryb Y: rozwinięty Dok chowa outlinery, a jednocześnie rysują się mini-panel Doku (260 px; rola, aktywność, ETA, paliwo,
   warp, alerty, ✕, 🎯 Rejestr — `TacticalDock.js:496-580`) i panel statku nad mapą `[code]` → D-TR-10 (§7, 542).
6. Wspólne `_missionConfig` / `_rightScrollY` z Rejestrem — przenosiny nie mogą zerwać tożsamości (golden P1/C6, E1/E2).
7. Rozbiórka bez potwierdzenia przy liście statków (D-TR-13, §7 543).
8. Wszystkie akcje panelu wymagają dojścia myszą do przycisku (siatka 2 × N, konfigurator) — tylko panel na klik (ramy
   §1.1 tak go definiują).

### 3.4 (c) Panel stacji — `StationPanel` (`src/ui/StationPanel.js`, 411 linii)

**I1 — pola** (tryb natychmiastowy; S8 przeliczane w każdej klatce — pętla po wszystkich statkach i aktywnych misjach):

| # | Pole | Źródło | Warunek | Linie |
|---|---|---|---|---|
| S1 | nazwa (ucinana do szerokości) | `station.name` | zawsze | `:159` |
| S2 | właściciel („Gracz” / nazwa imperium / id) | `ownerEmpireId`, `empireRegistry.get` | zawsze | `:222-225` |
| S3 | „Orbita: <ciało>” | `EntityManager.get(bodyId).name` | zawsze | `:226-227` |
| S4 | „Układ: <id>” — **surowy identyfikator** („sys_home”) | `station.systemId` | zawsze | `:228` |
| S5 | „Poziom: N” | `tier` | zawsze | `:229` |
| S6 | „Rok budowy: N” | `createdYear` | zawsze | `:230` |
| S7 | MAGAZYN: (a) matka w puli hubu — „Wspólna pula (planeta + księżyce):”, członkowie, do 12 pozycji sumy; (b) matka bez puli — „Wspólny magazyn:” + kolonia; (c) sierota — „⚠ Odcięta od zaopatrzenia”, surowce / towary albo „— pusty —” | `resolveHomeColony`, `systemPoolService.getPoolSnapshot`, `classifyStationDepot` | zawsze | `:232-265`; `StationPanelLogic.js:14-23` |
| S8 | HANDEL: statki w doku / w drodze / odlatujące (**bez limitu**) albo „brak ruchu” | `gatherStationTraders` (VesselManager + MissionSystem) — **jedyny konsument** | zawsze | `:268-275`; `StationPanelLogic.js:37-65` |
| S9 | MODUŁY: „👥 pop / poj. 🛠 ✓ / —”, moduły z ✓ / 👥✗ / ⚡✗ albo „Brak modułów” | `pop`, `popCapacity`, `hasActiveShipyard`, `modules`, `STATION_MODULES` | zawsze | `:277-290` |
| S10 | przycisk „🛰 Zarządzaj” | — | zawsze | `:178-190` |

**I2 — akcje:**

| Akcja | Skutek | Potw. | Odpowiednik | TYLKO tu |
|---|---|---|---|---|
| ✏ | `showRenameModal` → `station:rename` → `StationSystem._renameStation` (`:321-332`) | modal | ✏ w nagłówku zakładki Stacja (`ColonyOverlay.js:4908`) | nie |
| ▼ | `_minimize` → `panelDock.register('station:<id>', {restorePos})` (`:375-388`) | — | — | tak |
| ✕ | `hide()` (`:319`) | — | `body:deselected` bez powodu — klik w pustą mapę, „−” karty ciała (`:66-71`); przełączenie układu (491); `station:destroyed` | nie |
| 🛰 Zarządzaj | `openPanel('colony', {colonyId: gospodarz, infoTab:'stacja'})` (`resolveStationTabHost`; gdy grupę hostuje sam outpost — kolonia aktywna), panel się chowa (`:333-349`) | — | ColonyOverlay → zakładka Stacja | nie (ale jedyna droga z mapy) |
| przeciąganie | `FloatingPanel` — pas nagłówka bez 70 px przycisków (`:142`, `:354-372`) | — | — | tak |
| najechanie przycisków, tło | `_hoverZone` (BaseOverlay), pochłanianie (`:193`) | — | — | — |

**I3 — wejścia i zamknięcie:**

| Wejście | Ścieżka | 1. / 2. klik | Linie |
|---|---|---|---|
| mapa 3D — model stacji | `ThreeRenderer.handleClick` → `clickObject(station)` (stacja PRZED ciałami) | 1. `station:selected` (panel); 2. `station:focus` (kamera, podłoga 0,005) | `ThreeRenderer.js:3322-3337`, `:1258-1269` |
| lewy outliner — wiersz stacji | `clickObject(stationTarget)` (L10) | jw. | `LeftOutliner.js:269-272` |
| etykieta HUD — szyna / pojedyncza | `clickObject` | jw. | `HudLabelLayer.js:357`, `:380` |
| plakietka `MapLabelLayer` (OFF) | `clickObject` | jw. | `MapLabelLayer.js:466-469` |
| chip doku | `_restoreFromDock(sid)` — stację pokazywaną dotąd najpierw dokuje | panel na poprzedniej pozycji | `:390-410` |
| 2. klik w statek zadokowany przy stacji | `station:focus` — kamera, **bez panelu** `[measured M5b]` | — | `ThreeRenderer.js:1219-1221` |
| (martwe) FMO `map_station` | — | `commandTacticalMap:false` | FMO `:2236-2247` |

**Zamknięcie:** ✕; `body:deselected` bez powodu (klik w pustą mapę, „−” karty ciała); przełączenie układu na inny
(`syncStationPanelOnSystemSwitch`, UIManager `:783-786`); `station:destroyed`; „Zarządzaj”. **Overlay pełnoekranowy NIE
chowa panelu** — rysunek `:2388` i klik `:1983` bez `!isAnyOpen()` (S4-2 „coexist z colony”) `[code]` (§7, 540). Esc —
nie `[measured M3]`. Klik w ciało na mapie panelu nie zamyka `[measured M2]`. `readClickSelection.stationId` — tylko panel
widoczny i niezminimalizowany (`ClickIntentLogic.js:81`).

**I4 — stan:** `_stationId`, `visible`, `_float` (`dragPos`, `minimized`), `_sideMem`; `restorePos` we wpisie doku.
Położenie przy ON: z boku modelu stacji (`objectScreenDisc 'station'`, promień = sfera modelu; `:127-133`); przy OFF —
`sp.x + 18` w px CSS (528). Obszar: górna krawędź z `_getOverlayBounds` (pas górny + subnav), reszta z `MapInsets`
(`:119-125`). Nic w zapisie.

**I5 — rozmiar:** **440** (`PW` `:29`; dwie kolumny po (440 − 24) / 2 = 208 px) × (72 + wyższa kolumna) — `[node]`: stacja
z matką i 3 modułami 440 × 184, sierota z magazynem (4 pozycje) i 8 modułami 440 × 274, stacja z matką i 10 statkami w doku
440 × 319; `[measured M1]` Stacja Nowa Ziemia 440 × 229. Lista handlu bez limitu — wysokość rośnie z ruchem; pula hubu do
12 pozycji. Najdłuższe teksty: „Wspólna pula (planeta + księżyce):” 34 / „System pool (planet + moons):” 29; „⚠ Odcięta od
zaopatrzenia” 25 / „⚠ Cut off from supply” 21.

**I6 — zależności.** Keepery: `right_outliner_smoke` R9e–R9f (przecelowane w paczce A — przy `bodyCardSide` OFF), R13 (491)
· `left_outliner_smoke` L5n–L5o, L10, L11d–L11e · `body_card_side_smoke` C4b · `click_focus_rule_smoke` T2c, T2e ·
`station_group_smoke` T4 (`resolveStationTabHost` — „Zarządzaj”) · `hud_labels_smoke` L5 (szyna → stacja → panel) ·
`map_vessel_panel_compact_smoke` Z2 (kolejność rysowania `stationPanel`). Poza sweepem: `tmp_s4_2_smoke.mjs` w korzeniu
repo (ignorowany przez git). Findingi: 491 ✅, 488 (tu glif ✕), 493 ✅ przejściowo, 528 ⚪ (OFF), 503 ✅; nowe — §7: 534, 535,
537, 538, 540, 541.

**I7 — docelowe miejsce:**

| Pole / akcja | Miejsce | Uzasadnienie |
|---|---|---|
| S1 nazwa | [E-hover] | etykieta stacji (dziś bez wersalików). |
| S9 POP / poj. + plakietki | [E-hover] | dziś druga linia etykiety. |
| S7 magazyn | [E-hover] 1 linia („magazyn: Nowa Ziemia” / „pula: 3 ciała” / „⚠ odcięta”), lista [E-pin] | stan zaopatrzenia jednym rzutem oka. |
| S8 handel | [E-hover] licznik („ruch 2 ⇄ · 3 w doku”), lista [E-pin] z limitem | jedyny konsument `gatherStationTraders`. |
| S9 lista modułów | [E-hover] („moduły 3/8 · 🛠 ✓”), lista [E-pin] | |
| S10 Zarządzaj | [E-pin] | jedyna droga z mapy do zakładki Stacja. |
| S2 właściciel | [X] (stacje gracza) / [E-hover] dla obcych (D-TR-1) | etykiety mają dziś tylko stacje gracza. |
| S3 orbita, S4 układ | [X] | nitka / szyna pokazuje ciało; układ = oglądany (S4 to surowe id — 538). |
| S5 poziom, S6 rok budowy | [X] (zakładka Stacja) | poziom zawsze 1 (tier 2+ w backlogu). |
| ✏ | [X] | ✏ jest w zakładce Stacja. |
| ▼, przeciąganie | [X] | D-TR-6. |
| ✕ | [E-pin] ✕ + Esc | D-TR-5. |

Budżet 4 linii: POP / poj. + plakietki · magazyn · ruch · moduły — z 10 pól 4 w rozwinięciu, 3 listy i „Zarządzaj”
w przypięciu, 4 → [X].

**I8 — ryzyka:** usunięcie panelu zmienia zachowanie nad overlayem (dziś panel pływa nad Technologiami, Dowództwem itd. —
540); lista ruchu bez limitu — przypięcie potrzebuje limitu („6 + N”); stacja w stosie (NOWA ZIEMIA +2) przy LOD „zwinięta”
nie ma własnej etykiety (zwinięta grupa zaznacza kotwicę — L5) → rozwinięcie stacji dopiero od LOD „szyna”; 2. klik statku
w doku stacji daje kamerę bez panelu (M5b).

### 3.5 (d) Dok minimalizacji — `PanelDock` (`src/ui/PanelDock.js`, 144 linie; `PanelDockLogic.js`)

**I1 — pola:** chipy 16 px — ikona + nazwa do 110 px, odstęp 4 (`PanelDockLogic.js:9-11`) w jednym rzędzie na pasie dolnym
od prawej krawędzi lewego outlinera do klastra zegara (`BottomControlBar.getDockSpan` `:290`); „+N” z listą niewidocznych
w podpowiedzi (`PanelDock.js:75-80`, `:99-115`); bez pasa (Generator) — rząd nad dolną krawędzią obszaru mapy (`:50-53`).
Klucze `body:<id>` i `station:<id>` — **jedyni klienci** (`register` wołają wyłącznie `BottomContext.js:541`,
`StationPanel.js:381`, `:396`).

**I2 — akcje:** klik chipa → `onRestore` (karta ciała: `body:selected {focus:false}`; stacja: `_restoreFromDock`
z pozycją sprzed minimalizacji); klik „+N” → pierwszy niewidoczny (`:122-128`); najechanie — podświetlenie i lista „+N”
(`:132-135`); `isOver` blokuje kamerę (UIManager `:1920`). Bez potwierdzeń; odpowiednika nie ma (to jest mechanizm
minimalizacji).

**I3 — wejścia:** `register` — ▼ karty ciała (`BottomContext.js:536-553`), ▼ panelu stacji (`StationPanel.js:375-388`),
stacja wypchnięta przy przywróceniu innej (`:390-402`); `unregister` — `body:selected` tego ciała (`BottomContext.js:77-80`),
`entity:removed` (`:82-86`), `station:selected` tej stacji (`StationPanel.js:51-60`), `station:destroyed` (`:61-65`),
przywrócenie. `clear()` — bez wołających. Rysunek `UIManager.js:2409-2411` (bez overlayu i globusa, bez bramki civMode),
klik `:1982` (bez overlayu).

**I4 — stan:** wpisy tylko w pamięci (F5 — pusty dok). **Chip przeżywa odznaczenie** — po `body:deselected` (to samo
zdarzenie, które emituje klik w pustą mapę) oba chipy zostały (`dock: ['station:…', 'body:entity_5']`, `[measured M5]`);
chip nie zna układu (§7, 541).

**I5 — rozmiar:** rząd 16 px na pasie 20 px; chip ≤ 110 px; nazwa ucinana z „…”.

**I6 — zależności:** `s34b_paneldock_smoke` T0–T5 · `bottom_strip_smoke` B5–B6, D1–D6, U1–U3 · `left_outliner_smoke`
L5f–L5h · `s34b_bottomcontext_smoke` · `click_focus_rule_smoke` T2e, T13.

**I7:** cały dok → [X] w kroku sprzątania (D-TR-6): przypięcie przy etykiecie nie ma minimalizacji (odznaczenie =
zwinięcie), a rząd chipów na pasie dolnym zwalnia miejsce — także dla chipów warstw [R] [T] [E] [O] z paczki B ARKUSZA HUD
(D-HUD-13).

**I8 — ryzyka:** usunięcie doku przed usunięciem obu kart zostawiłoby ▼ bez celu — dok znika dopiero w kroku po T2.

### 3.6 Pomiary w grze (sondy `probes/probe_tabs_behaviour.mjs`, `probe_m5_docked_focus.mjs`, `probe_ai_colony_hover.mjs`)

| # | Pytanie | Wynik `[measured]` |
|---|---|---|
| M1 | czy karta ciała, panel stacji i panel statku otwierają się razem | TAK — i nakładają się: karta 240 × 232 @ (650, 305), panel stacji 440 × 229 @ (650, 306), panel statku 300 × 300 @ (641, 260); karta ciała całkowicie przykryta (`M1_trzy_karty.png`) |
| M2 | prawdziwy klik w tarczę ciała przy zaznaczonym statku | zaznaczenie statku zdjęte (panel statku znika), karta ciała i panel stacji zostają |
| M3 | Esc | 1. Esc zdejmuje zaznaczenie statku; 2. Esc otwiera menu ☰; karta ciała i panel stacji zostają |
| M4 | karta ciała w doku + klik w to ciało | `body:selected {focus:true}` — kamera + karta wraca; klucze zaznaczenia przed klikiem: `body:entity_5`, `station:…`; kontrola — panel stacji w doku: intencja `select` |
| M5b | 2. klik w statek zadokowany — wg miejsca postoju | planeta (Fracht III) i księżyc (Kurier II): kamera + karta ciała hangaru; **planetoida (Fracht @ Nt, Dostawca II @ Cu i Hv): kamera STOI, karty brak**; stacja (Handlarz II): `station:focus`, bez panelu |
| M6 | najechanie statku / zaznaczonej kolonii | statek: po 150 ms `#colony-3d-tooltip` + druga linia etykiety, po 950 ms także `#kosmos-tooltip` (trzy warstwy, nakładają się); kolonia: K4 + K5 + K6 naraz, K4 wychodzi poza okno |
| M7 | 1280×720 | obszar mapy 980 × 630 @ (150, 28); prawy outliner 150 × 630; 11 wierszy statków y 80–238 |
| 531 | najechanie kolonii AI (Polonia gy79, Akhernar h — `emp_001`, wywiad `contact`) | `#kosmos-tooltip`: „Właściciel: Imperium gracza”, „Populacja: 55” |

Błędy konsoli w przebiegach: wyłącznie 404 zasobów `assets/icons/build…` i `assets/buildings/…`, zero wyjątków JS.
**Sprostowanie 2026-10-24 (krok 531 / 532):** te 404 NIE pochodzą z serwera sondy — tych plików nie ma w repo:
`BuildingTextures.js:35` sonduje teksturę każdego budynku („~30/61 budynków bez PNG → cichy fallback do emoji”), a
`PlanetGlobeTexture.js:56` — ikony budynków globusa (`onerror` — fallback do markera Canvas 2D); te same 404 pojawiają
się w Live Server. Zmierzone: 32 ścieżki (31 × `assets/buildings/`, 1 × `assets/icons/building_…`), te same przed
poprawką 531 / 532 i po niej.

---

## 4. Powiązane findingi

- **488** (`UI_PLAN.md` §6) — zamknięcie karty ciała to glif „−”, który wygląda jak minimalizacja.
- **493** (`UI_PLAN.md` §6) — ✅ przejściowo: ARKUSZ HUD paczka A, A-3 `9b5e6f1` (`bodyCardSide`).
- **515** (`HUD_PLAN.md` §3) — ✅ przy ON: karta nad etykietami w rysowaniu i kliku.
- **528** (`HUD_PLAN.md` §3) — ścieżka OFF kotwic kart myli px CSS z logicznymi.
- **529** (`HUD_PLAN.md` §3) — panel statku z boku modelu potrafi przykryć trasę i cel statku (→ T3).
- **530** (`HUD_PLAN.md` §3) — dymek współrzędnych nad pustą mapą zasłania etykiety HUD (to ten sam `#kosmos-tooltip`
  co K5 — D-TR-2).
- **485**, **486**, **491**, **492**, **496**, **498**, **522** (`UI_PLAN.md` §6, `HUD_PLAN.md` §3) — §3, wiersze I6.
- Nowe kandydatury z inwentarza — §7 (531–543).

---

## 5. Propozycja cięcia (podpisana 2026-10-24 — kolejność wg D-TR-12 (b), §6.0)

### 5.1 Weryfikacja sugestii (T1 rozwinięcie + wyłączenie karty dla ciał bez akcji · T2 przypięcie + wyłączenie karty
i panelu stacji · T3 panel statku przy outlinerze · T4 sprzątanie)

- **T1 — wykonalne, z trzema korektami z pomiaru.** (1) „Ciała bez akcji” to w ZF 7 z 33 (gwiazda + 6 planetoid), a ciał
  bez ETYKIETY — 28: rozwinięcie pod wersalikiem obejmie dziś 5 obiektów → T1 musi wprowadzić etykietę na żądanie dla ciał
  bez etykiety (D-TR-1 (a)) albo ograniczyć się do kolonii i stacji gracza. (2) Wyłączenie karty dla ciał bez akcji zostawia
  im jako informację etykietę na żądanie z T1 albo dzisiejszą podpowiedź `#kosmos-tooltip` (531 — przy kolonii AI kłamie).
  (3) Bez D-TR-2 T1 dokłada czwartą warstwę najechania.
- **T2 — wykonalne;** obowiązkowa treść przypięcia z inwentarza: „Mapa ciała” w 4 wariantach (w tym jedyny producent
  `planet:previewMap`), „Zarządzaj” stacji, lista ruchu stacji (jedyny konsument `gatherStationTraders`), garnizon
  i okupacja obcych kolonii, ✏ ciała przez raport (`BodyDetailModal`), Esc (534). Po T2 dok traci obu klientów.
- **T3 — niezależny od T1/T2** (może iść pierwszy); warunki: D-TR-7…D-TR-11, D-TR-13, D-TR-14; zamyka 529; panele floty
  i grupy zostają (D-TR-9 (a) w T3; zmieniona 2026-10-26 — T6, §5.9).
- **T4 — sprzątanie:** dok (`PanelDock`, `PanelDockLogic`, rząd chipów), `BodyCardSideLogic` (493 — po T2 i T3 bez
  konsumentów), `FloatingPanel` (po T6 — panele floty i grupy, §5.9), kotwice OFF (528), przeszkody `_cardRects` w etykietach, flagi `bodyCardSide`
  i kroków po bramkach, keepery z §5.3.

### 5.2 Propozycja: cztery paczki T1 → T2 → T3 → T4 (protokół jak `HUD_PLAN.md` §4.0, aneks 2026-10-23); T5 i T6 — dopisane 2026-10-26

Wspólne: commit raz na paczkę (+ dokumentacja), flaga kroku (brak klucza = OFF, ON po bramce), keepery **wyłącznie dla
logiki** (strefy kliku, zegary / pauza, mgła wojny, stan zaznaczenia, budżet kl./s — z warstwą i bez), bez pinów na
stałych rysunku, walidator → **arkusz kontaktowy HTML na 5 motywach** ekranu tytułowego, bramka właściciela = oglądanie
+ pętla strojenia, zapis v101 bez migracji.

| Paczka | Treść | Flaga (robocza) | Keepery (logika) | Sceny arkusza (ZF, Polonia) |
|---|---|---|---|---|
| **T1** rozwinięcie informacyjne — **✅ WYKONANE 2026-10-26** (`fc44de7`, §5.6) | (a) rozwinięcie pod etykietą kolonii / stacji gracza (≤ 4 linie wg D-TR-3); (b) etykieta na żądanie przy najechaniu tarczy ciała bez etykiety, z tym samym rozwinięciem (D-TR-1 (a)); (c) rozwinięcie etykiety statku (aktywność / ETA / paliwo — D-TR-3); (d) przy ON wygaszone `#colony-3d-tooltip` (kolonia, statek) i ciałowo-statkowa część `#kosmos-tooltip` (D-TR-2) — 531 i 536 zamknięte z konstrukcji; (e) karta ciała wyłączona dla ciał bez akcji | `labelHover` | stan najechania (czas realny, pauza), treść wg wywiadu i właściciela (531), strefy (punkt na tarczy wygrywa — 487, 503), etykieta najechana nie zmienia położenia (bez oscylacji — I8.3), kl./s | kolonia gracza, ciało bez kolonii (zbadane / nie), kolonia AI (Polonia), stacja w szynie i pojedyncza, statek; najechanie w biegu i w pauzie |
| **T2** przypięcie — **✅ WYKONANE 2026-10-26** (`0ddbf05`, §5.7) | 1. klik (D-UI-5) przypina rozwinięcie z akcjami: Mapa ciała (4 warianty), Raport (`BodyDetailModal`), Zarządzaj, listy z limitem (złoża, magazyn, ruch, moduły), ✕; Esc zdejmuje (D-TR-5); `readClickSelection` czyta przypięcie; przełączenie układu zdejmuje przypięcie spoza układu (486 / 491); przy ON karta ciała i panel stacji wyłączone | `labelPin` | strefy (przycisk przypięcia > etykieta > tarcza), 1. / 2. klik z przypięciem, Esc, przełączenie układu, warianty Mapy ciała (jedyny producent podglądu), limit list | przypięcie każdego rodzaju, akcje, Esc, przełączenie układu, przypięcie przy ruchu kamery i orbity |
| **T3** panel statku przy outlinerze — **✅ WYKONANE 2026-10-25** (`496ab80`, §5.5) | `_drawRight` (kompakt) w geometrii przy wierszu (D-TR-7), zapas przy schowanym outlinerze (D-TR-8), tryb Y (D-TR-10), potwierdzenie rozbiórki (D-TR-13), zaznaczenie przy kliku ciała (D-TR-14), panel pływający wyłączony (529) | `shipPanelOutliner` | kotwica wiersz → prostokąt panelu (klamra, przewinięcie, wiersz poza kadrem kolumny), zapas, mutex N, wejścia (mapa, outliner, Dok, etykieta, Tab), zamknięcie, Esc | statek w ruchu / w doku / w obcym układzie, konfigurator (360 px), wiersz u dołu listy, outliner schowany, tryb Y, starcie |
| **T5** panel statku w idiomie etykiet — **✅ WYKONANE 2026-10-26** (`409f82b`, §5.8) | osobny lekki renderer panelu statku przy outlinerze w stylu przypięć HUD (treść — §5.8); Rejestr Dowództwa i `_drawRight` bez zmian; geometria, histereza, zapas i tryb Y z T3 bez zmian; przy okazji 530 | `shipPanelHud`; sprząta ją T4 | strefy kliku chipów i „[ Rozkazy ▼ ]”, kotwica T3 bez zmian, OFF = panel z T3, kl./s | statek w ruchu / w doku / w obcym układzie, długa nazwa (2 linie), konfigurator i wybór celu (~260 px), rozkazy rozwinięte, 530 |
| **T6** panele floty i grupy przy outlinerze — **✅ WYKONANE 2026-10-27** (`694cfcf`, §5.9; decyzja właściciela 2026-10-26 — D-TR-9 zmieniona) | panel floty (`FleetCommandPanel`) przy wierszu węzła floty w prawym outlinerze, panel grupy N ≥ 2 (`FleetGroupPanel`) przy wierszu lidera — oba w idiomie etykiet z T5 (osobne lekkie renderery); Rejestr / overlay floty nietknięte; geometria, łącznik, histereza, zapas i tryb Y z T3 | `fleetPanelHud`; sprząta ją T4 | zbiór akcji ON = OFF (te same handlery), strefy kliku, kotwica przy węźle floty / wierszu lidera, OFF = dzisiejsze panele, kl./s | flota (węzeł) i grupa N ≥ 2, lider w obcym układzie, outliner schowany, tryb Y, 1280×720 |
| **T4** sprzątanie | dok, `BodyCardSideLogic` (przed usunięciem — przenieść `objectScreenDisc`, z którego T1 korzysta w wyborze stacji pod kursorem; §5.7), `FloatingPanel` (dopiero po T6), kotwice OFF, `_cardRects`, flagi po bramkach (w tym flagi T5 i T6 — decyzje 2026-10-26); i18n pól, które przeszły do rozwinięć i panelu (538) — albo osobno | — | przecelowania z §5.3 | — |

Kolejność: T1 → T2 (przypięcie stoi na rozwinięciu) → T3 → T4; **T3 można przenieść na początek** (brak zależności od
T1/T2; zamyka 529) — D-TR-12.

**Podpis 2026-10-24 (§6.0): D-TR-12 (b) — T3 na początek; D-TR-15 (b) — 531 i 532 osobnym drobnym krokiem od razu.**
Kolejność całości: **531 / 532 → T3 → T1 → T2 → T4 → paczka B ARKUSZA HUD**. 531 zamyka drobny krok przed T3 — w T1
rozwinięcie zastępuje podpowiedź już poprawioną (D-TR-2), więc „531 zamknięte z konstrukcji” w wierszu T1 tabeli wyżej
przestaje dotyczyć.

**Decyzja właściciela 2026-10-26 (po bramce T2):** po T2 — **T5** (panel statku w idiomie etykiet, §5.8), przed T4; T4
sprząta także flagę T5. Kolejność całości: **531 / 532 → T3 → T1 → T2 → T5 → T4 → paczka B ARKUSZA HUD**.

**Decyzja właściciela 2026-10-26 (po bramce T5):** D-TR-9 zmieniona — po T5 **T6** (panele floty i grupy przy outlinerze
w idiomie etykiet, §5.9), przed T4; T4 sprząta `FloatingPanel` dopiero po T6. Kolejność całości: **531 / 532 → T3 → T1
→ T2 → T5 → T6 → T4 → paczka B ARKUSZA HUD**.

### 5.3 Keepery, które reforma zmieni (przecelowanie za zgodą albo usunięcie razem z powierzchnią)

- **karta ciała:** `s34b_bottomcontext_smoke` (cały) · `body_card_side_smoke` (cały, z 493) · `click_focus_rule_smoke` T2b,
  T13 · `left_outliner_smoke` L5i–L5j, L11a–L11f · `map_insets_single_source_smoke` M2, M10 · `hud_labels_smoke` L7c,
  przeszkody `_cardRects` · `hud_layer_smoke` L4 · `g3_ground_visibility_smoke` V8, `g3_regrowth_smoke` R8,
  `wp_occupied_badge_smoke` T4, `ground_troops_reachable_smoke` T4 (treść karty → przypięcie).
- **panel stacji:** `right_outliner_smoke` R9e–R9f, R13 · `left_outliner_smoke` L5n–L5o, L10, L11d–L11e ·
  `click_focus_rule_smoke` T2c, T2e · `station_group_smoke` T4 (zostaje — logika gospodarza) · `hud_labels_smoke` L5 (klik
  stacji) · `map_vessel_panel_compact_smoke` Z2.
- **panel statku:** `map_vessel_panel_compact_smoke` A1–A2, D1–D2, Z1 (kotwica, przeciąganie, kolejność) ·
  `map_vessel_panel_smoke` P11, P12 (prostokąt panelu) · `right_outliner_smoke` R9d · `left_outliner_smoke` L7i ·
  `body_card_side_smoke` C4c. Treść (`_drawRight`, golden P1/C6, E1/E2, f-1/f-2, oś służby) — bez zmian.
- **dok:** `s34b_paneldock_smoke` · `bottom_strip_smoke` B5–B6, D1–D6, U1–U3 · `left_outliner_smoke` L5f–L5h.

### 5.4 Drobny krok 531 / 532 — WYKONANY 2026-10-24 (D-TR-15 (b))

Commity: **`471191d`** `fix(531)` · **`da8b2c9`** `fix(532)`; bramka właściciela 2026-10-24 — **PASS** (oglądanie
kadrów przed / po). Teczka: `C:\Users\Komputer\kosmos-handover\tabs-531-532\` — `probes/` (sondy CDP),
`results/before|after/` (JSON i zrzuty), `kontakt_531_532.html` (arkusz przed / po), `RAPORT_531_532.md`.

- **531** (`TooltipContent._planetContent`, `GameScene._tooltipDeps` + `intelSystem`): kolonia obca (`!isPlayerColony`)
  dostaje właściciela i populację wg osi właściciela kanonu `SystemReveal` — ta sama reguła co panel STRATCOM: nazwa
  imperium od `contact`, „Właściciel: obce imperium” od `rumor`, „Właściciel: nieznany” poniżej, populacja od
  `detailed`; brak wywiadu w `deps` ⇒ fail-closed. **Decyzja właściciela 2026-10-24:** przy `unknown` „nieznany”, nie
  „Neutralne” (ciało ma kolonię; karta ciała i tak pokazuje obcą kolonię przy każdym wywiadzie). Kolonia gracza — bez
  zmian. i18n — zero nowych kluczy (`fleet.stratcomEmpireForeign` / `fleet.stratcomEmpireUnknown` jako całe linie).
- **532** (`ThreeRenderer`, słuchacz `vessel:focus`): miejsce postoju szukane także w `_planetoids` — tej samej mapie, z
  której rysowane są placówki (`getBodyWorldInfo`, `getBodyScreenPosition`) — kamera na planetoidę (podłoga 0,3,
  zoom 0,8) + karta ciała, jak przy planecie; planeta i księżyc — kod co do znaku jak dotąd. Ten sam słuchacz obsługuje
  prawy outliner, Dok taktyczny i Tab.
- **Keepery:** NEW `tooltip_foreign_colony_smoke` 24/24 (fail-first `git stash` 10 / 14) · NEW
  `docked_focus_planetoid_smoke` 17/17 (fail-first na kopii drzewa z HEAD 10 / 7 — `stash` przy `eol=lf` przepisałby
  CRLF `ThreeRenderer.js` na LF, zmierzone). Sweep 342/342 OK, 0 FAIL, 31 advisory; `check-i18n` PASS, pl = en = 3400.
- **Smoke w grze** (izolowany headless Chrome z GPU, okno 1600×1041, ten sam przebieg na kodzie przed i po): Polonia,
  Akhernar h (`emp_001`, `contact`) — przed „Właściciel: Imperium gracza”, „Populacja: 55”, po „Właściciel: Liga
  Spalonej Drogi”, bez populacji; kontrola — dymek własnej kolonii (ZF, Nowa Ziemia) identyczny. ZF, Fracht @ Nt — dwa
  prawdziwe kliki w prawym outlinerze: przed kamera stoi i karty brak, po kamera na Nt i karta „Nt”; kontrole Fracht III
  (planeta) i Kurier II (księżyc) bez zmian. Konsola — 0 błędów JS (404 tekstur budynków — §3.6, sprostowanie).
- **Obserwacja:** w kadrze 532 „po” panel statku (kotwica zapasowa statku w doku) przykrywa część karty ciała Nt — to
  537 (T2 / T3), jak przy planecie (M1).

### 5.5 T3 — panel statku przy prawym outlinerze — WYKONANE 2026-10-25 (D-TR-7, 8, 9, 10, 13, 14)

Commit: **`496ab80`** `feat(T3)` (jedna paczka ze strojeniem 1 — strojenie zmienia te same funkcje: `UIManager`,
`ShipPanelAnchorLogic`); bramka właściciela 2026-10-25 — **PASS** (oglądanie arkusza, zachowania 1–7 przyjęte), strojenie
1 — **PASS** (zachowania 1–4 przyjęte; łącznik i odstępy bez uwag). Flaga `FEATURES.shipPanelOutliner` (brak klucza =
OFF — dzisiejszy kod; w `GameConfig` ON). Teczka: `C:\Users\Komputer\kosmos-handover\tabs-t3\` — `probes/`, `gate/`
(`shots_T3.mjs` → `kontakt_T3.html` — 14 scen × 5 motywów, przed = `e71ffad`; `shots_T3s1.mjs` → `kontakt_T3s1.html` —
strojenie, K4 / K12 / K10b, przed = T3 sprzed strojenia), `results/` (sweep, `check-i18n`, fail-first, kl./s, Polonia),
`RAPORT_T3.md`, `RAPORT_T3_S1.md`.

- **Kotwica (D-TR-7 (a)):** NEW `ShipPanelAnchorLogic.js` — panel 300 × 300 (360 w kroku wyboru celu) wysunięty W LEWO od
  prawego outlinera: prawa krawędź = lewa krawędź kolumny, górna = wiersz zaznaczonego statku (`OutlinerColumn._layout` —
  układ listy z tej samej klatki; outliner rysowany przed panelem); klamra do obszaru mapy z `MapInsets`; wiersz
  przewinięty poza listę → panel przy krawędzi listy (idzie za przewijaniem), bez łącznika; układ zwinięty → nagłówek
  układu (z łącznikiem); „spawanie” — bez własnej krawędzi od strony kolumny (`seamRight`) i łącznik na wysokości wiersza
  (stałe rysunku `UIManager.shipPanelTab`). Bez przeciągania; pływający panel statku (`FloatingPanel`) i kotwica z boku
  modelu (493) przy ON nieużywane — **529 ✅**.
- **Zapas (D-TR-8 (a)):** kolumna ukryta („.”, overlay, rozwinięty Dok) albo statku brak w liście — dzisiejsza kotwica
  zapasowa (prawy górny róg obszaru mapy); po powrocie kolumny — przy wierszu.
- **Tryb Y (D-TR-10 (a)) — 542 ✅:** przy rozwiniętym Doku panel statku nad mapą się nie rysuje (klik, kółko, blokada kamery
  i prostokąt wyłączone); po zwinięciu Doku — przy wierszu.
- **Cykl:** otwiera 1. klik statku (mapa, prawy outliner, Dok „Pokaż”, etykieta HUD, Tab — wg `readClickSelection`, U1);
  zwija się przy zmianie zaznaczenia (przeskok do nowego wiersza), odznaczeniu, Esc (kaskada bez zmian) i przełączeniu
  układu na układ bez tego statku (`system:switched`; Tab i 2. klik §7.8 przełączają na układ statku — panel zostaje;
  statek w skoku — zdjęty). Mutex D-TR-9 (a) bez zmian.
- **Rozbiórka (D-TR-13 (a)) — 543 ✅:** „🗑 Rozbiórka” → istniejący `ConfirmModal`, `fleet:disbandRequest` dopiero po
  „Rozwiąż” (`confirmThenDisband`); także w Rejestrze Dowództwa (wspólny `_handleHit`). Nowy klucz
  `fleet.disbandVesselConfirm` (PL + EN).
- **D-TR-14 (a) — 539 ✅:** klik ciała albo stacji na mapie nie zdejmuje zaznaczenia statku (`ThreeRenderer.lastClickPick.object`,
  `GameScene._selectFromClickPick`); karta ciała i panel statku razem. 537 — domknięty częściowo (reszta: T2).
- **Strojenie 1 (2026-10-25):** **544 ✅** — panel statku jest przeszkodą karty ciała i panelu stacji (`BodyCardSideLogic`:
  `obstacles`, `cardObstacles`; `UIManager.getShipPanelObstacle` — prostokąt z ostatniej klatki, zmiana → jeszcze jedna
  klatka): karta na wolnej stronie tarczy, żadna wolna — większy prześwit, bez histerezy dla przeszkody. **545 ✅** —
  karta walki jest przeszkodą kotwicy: panel przy wierszu przesuwa się w pionie nad / pod kartę (przy kolumnie, łącznik
  gdy wiersz w zasięgu), brak miejsca → kotwica zapasowa; przy ON klik pyta panel statku przed kartą walki i panelem
  stacji (rysunek = klik). **547 ✅** — PL `fleet.disbandReturn` = „🗑 Rozbiórka (zwrot 75%)” (tytuł okna potwierdzenia
  z tego klucza), zero nowych kluczy.
- **Keepery:** NEW `ship_panel_outliner_smoke` 112/112 (S0–S13); `body_card_side_smoke` 38/38 (NEW C6 — przeszkoda; C4a —
  wywołanie z przeszkodą). Przecelowania za zgodą (§5.3 „panel statku”; piny OFF bez zmian, dopisane „-T3”):
  `map_vessel_panel_compact` A1, A2, D1, D2, Z1 · `map_vessel_panel` P11, P12 · `right_outliner` R9d · `left_outliner`
  L7i · `body_card_side` C4c. Fail-first: kopia `e71ffad` (`git archive`, pliki CRLF) — nowy keeper 23 / 66 (zielone =
  same kontrole), przecelowania 94/101 · 121/126 · 100/102 · 148/149 · 26/27; strojenie — kopia T3 sprzed strojenia:
  95 / 17 · 30 / 8 (zielone nowe piny = same kontrole). Sweep 343/343 OK, 0 FAIL, 31 advisory; `check-i18n` PASS,
  pl = en = 3401.
- **Gra** (izolowany headless Chrome z GPU, okno 1618×1195 DPR 0,9): ZF gy120 — arkusz 14 scen × 5 motywów i arkusz
  strojenia (K4, K12, K10b), 0 błędów JS; Polonia gy79 — wiersz → zapas „.” → wiersz → tryb Y bez panelu → przełączenie
  układu zdejmuje statek → Esc, 0 błędów; kl./s bez regresji (60 / 60; `_draw` 1,24 / 1,07 ms przy ON wobec 1,16 / 1,07 ms
  przy OFF).
- **Nowe findingi (rejestr `HUD_PLAN.md` §3):** 544, 545, 547 — ✅ w strojeniu 1; **546** ⚪ (konfigurator misji nie zna
  statku — zmiana zaznaczenia w kroku wyboru celu przenosi go na nowy statek; także przed T3); **548** ⚪ (karta ciała przy
  pauzie i nieruchomej kamerze zostaje półprzezroczysta — wjeżdżanie nie podtrzymuje redrawu; także przed T3).

### 5.6 T1 — rozwinięcie informacyjne etykiet + etykieta na żądanie — WYKONANE 2026-10-26 (D-TR-1, 2, 3)

Commit: **`fc44de7`** `feat(T1)`; bramka właściciela 2026-10-26 — **PASS** (oglądanie arkusza, bez uwag do treści
i wyglądu; zachowania 1–5 przyjęte — niżej). Flaga `FEATURES.labelHover` (brak klucza = OFF — dzisiejszy kod;
w `GameConfig` ON); stoi na warstwie etykiet HUD z paczki A (`hudLabels`). Teczka:
`C:\Users\Komputer\kosmos-handover\tabs-t1\` — `probes/` (`fps_t1.mjs`, `k12_pick.mjs`, `k12_diag.mjs`, `k12_return.mjs`,
sondy rozpoznania), `gate/` (`shots_T1.mjs` → `kontakt_T1.html` — 19 kadrów: 17 ZF gy120 + 2 Polonia gy79, × 5 motywów,
przed = `b3b0902`, okno 1618×1195, DPR 0,9), `results/` (pomiary, kontrola OFF, `fps/fps.json`, pierwszy przebieg arkusza
sprzed poprawki powrotu — `kontakt_v1`), `RAPORT_T1.md`.

- **(a) Rozwinięcie pod nazwą (D-TR-3 — tabele I7):** ≤ 4 linie (9 px, kratka cyfr) na najechanie etykiety albo obiektu
  (tarcza, sprite, model stacji — wybór lustrem reguły kliku: etykieta, chyba że punkt leży na tarczy ciała — 487 / 503;
  statek na tarczy tylko w rdzeniu sprite'a; picker `visibleOnly` — 485) i stale dla zaznaczonego. Treść: kolonia gracza
  · ciało bez kolonii · gwiazda · obca kolonia (właściciel, garnizon, populacja wg wywiadu — reguła 531) · stacja · statek
  (obcy poniżej `contact` — bez nazwy, „Niezidentyfikowany kontakt” — 504). Fade-in 150 ms, wygasanie ~200 ms — czas
  realny (działa w pauzie). Najechana etykieta stoi (I8.3: górna krawędź i strona bez zmian; po stronie W — prawa
  krawędź i tekst do prawej); sąsiedzi ustępują w kadrze `MapInsets` i po zjechaniu kursora wracają (`makeYieldMemory`;
  kamera ruszona w trakcie — bez powrotu). „+N” najechane → rozwinięcie kotwicy, szyna zwinięta. Treść z pamięci
  (TTL 250 ms); rozwinięcie z najechania — jedno naraz.
- **(b) Etykieta na żądanie (D-TR-1 (a) — część T1; przypięcie — T2):** gwiazda, ciała bez kolonii, kolonie i stacje AI,
  planetoidy — pojawia się przy najechaniu, zostaje, dopóki obiekt jest zaznaczony; 1. klik zaznacza (tarcza wygrywa —
  487 / 503); nazwa obcego wg `SystemReveal` (oś miejsca), kolonia AI — nazwa CIAŁA, nigdy nazwa cudzej kolonii.
- **(c) Dymki DOM (D-TR-2 (a)) — 533 ✅, 536 ✅:** przy ON wygaszone `#colony-3d-tooltip` (kolonia, statek)
  i ciałowo-statkowa część `#kosmos-tooltip`; zostają: podpowiedź budynku (K3), POI, współrzędne pustej mapy (530 — tylko
  nad PUSTĄ mapą, nie pod etykietą, gwiazdą ani stacją).
- **(d) Karta ciała dla ciała bez akcji:** przy ON się nie otwiera — gwiazda oraz ciało bez kolonii i bez pełnego skanu
  (`analyzed`; w ZF planetoidy bez placówki); 1. klik zaznacza + etykieta na żądanie, 2. klik — kamera (D-UI-5 bez
  zmian); ciało z akcją („Mapa ciała”, „Przejmij cywilizację”) — karta jak dziś. Lustro: `bodyCardAction` =
  `BottomContext._actionLabel` (`UIManager._bodyCardEntity` — rysunek, klik, kursor nad UI, kółko).
- **550 ✅ (słownik):** PL `bodyType.Planetoid` = „Planetoida” (`pl.js:532`, jedna linia, zero nowych kluczy; bez flagi).
  Linia dodana przy commicie po PASS — w drzewie oglądanym na bramce jej nie było, więc arkusz pokazuje jeszcze
  „Planetoid”.
- **Pliki:** NEW `src/ui/LabelHoverLogic.js` (czysty — flaga, `LABEL_HOVER`, pamięć najechania, `resolveHoverTarget`,
  treść I7, przypięcie, `makeYieldMemory`, `placeLabelsPinned`) · `HudLabelLayer.js` (`_t1Prepare`, etykiety na żądanie,
  rozkład z przypięciem i pamięcią powrotu, rysunek, `hoverObjectKey`, `coversPoint`) · `HudLayer.js` (`hoverObjectKey`,
  `coversPoint`) · `ThreeRenderer.js` (statek i kolonia — `#colony-3d-tooltip` tylko przy OFF) ·
  `GameScene._tooltipHoverFromMain3D` · `UIManager._bodyCardEntity` · `GameConfig` (`labelHover: true`) · 8 kluczy
  `labelHover.*` PL + EN (reszta treści — istniejące klucze).
- **Keepery:** NEW `label_hover_smoke` 72/72 (K0 API i flaga · K1 zegary · K2 treść i mgła · K3 wybór obiektu · K4 warstwa
  · K5 przypięcie I8.3 i powrót sąsiadów · K6 „+N” · K7 dymki · K8 karta ciała · K9 budżet logiki · K10 OFF = dziś).
  Fail-first na kopii `git archive b3b0902` (pliki CRLF — bez stash): 11 PASS / 61 FAIL — zielone wyłącznie kontrole
  i świadek sceny (K4, K4a, K5a, K5f, K7c, K7f, K8b, K8g, K9a, K10a, K10b). Przecelowania — zero (świadkowie dymków
  i karty ciała zieloni bez zmian — `RAPORT_T1.md` §4). Sweep 344/344 OK, 0 FAIL, 31 advisory; `check-i18n` PASS,
  pl = en = 3401 → 3409.
- **Gra** (izolowany headless Chrome z GPU): arkusz = smoke — 0 wyjątków JS w 20 przebiegach (404 — brakujące tekstury
  budynków, §3.6). **OFF = dziś** (kod T1, flaga przestawiona po rozruchu, Amber Noir): kadry statyczne ZF 11/11
  i Polonia 2/2 identyczne z `b3b0902` (etykiety, oba dymki DOM, karta ciała). Sonda K12 złapała wadę przed arkuszem —
  sąsiad, który ustąpił rozwinięciu, nie wracał (lepkość wyboru kandydata z paczki A); naprawa `makeYieldMemory` (5 scen
  80–450 j.: 0 etykiet poza miejscem 0,4 s po zjechaniu). Budżet: warstwa HUD 261–375 µs na narysowaną klatkę przy ON
  (+29…53 µs wobec OFF; dwa rozwinięcia naraz — najgorszy przypadek), p95 ≤ 0,5 ms, 60 / 60 kl./s; w spoczynku
  0 wywołań ctx.
- **Zachowania przyjęte na bramce (2026-10-26):** (1) dwa rozwinięcia naraz — zaznaczony (stałe) + najechany inny —
  zostają; (2) najechanie tarczy członka zwiniętego stosu rozkłada stos na szynę na czas najechania, najechanie „+N” —
  tylko kotwica; (3) sąsiedzi wracają po zjechaniu kursora, przy ruchu kamery w trakcie — zostają tam, gdzie ułożył je
  rozkład; (4) gwiazda — etykieta na żądanie tylko nad widocznym rdzeniem (487), nad poświatą nic; (5) karta przy
  1. kliku znika dla każdego ciała bez akcji (w innej partii także np. nieprzeskanowany księżyc).
- **Nowe findingi (rejestr `HUD_PLAN.md` §3):** **549** ✅ przy ON (dymek mapy nad obcym statkiem przy `rumor` zdradza
  nazwę statku i imperium — klasa 504) · **550** ✅ (słownik) · **551** ✅ przy ON (najechana etykieta podskakuje o drugą
  linię — I8.3) · **552** ✅ przy ON (dymek statku nad tarczą gwiazdy — bliźniak 487 dla najechania); 549, 551 i 552 przy
  OFF zostają.

### 5.7 T2 — przypięcie z akcjami przy etykiecie; karta ciała i panel stacji wyłączone — WYKONANE 2026-10-26 (D-TR-1, 4, 5)

Commit: **`0ddbf05`** `feat(T2)` (jedna paczka ze strojeniem 1 — strojenie zmienia te same funkcje: `LabelPinLogic`,
`HudLabelLayer`); bramka właściciela 2026-10-26 — **PASS** (oglądanie arkusza; zachowania 1, 2, 4, 6–10 z raportu
przyjęte), strojenie 1 — **PASS** (zachowanie 5 — wariant 2 z dopełnieniem dla rozwinięcia najechania; zachowanie 3
potwierdzone bez naprawy; 554; zmiana strony etykiety stacji przy przypięciu — przyjęta). Flaga `FEATURES.labelPin` (brak
klucza = OFF — kod T1; w `GameConfig` ON); stoi na T1 (`hudLabels` + `labelHover`). Teczka:
`C:\Users\Komputer\kosmos-handover\tabs-t2\` — `probes/` (`fps_t2.mjs`, `trace_off.mjs`, `probe_off_diverge.mjs`,
`cmp_off.mjs`, sondy rozpoznania `scout*_t2*.mjs`), `gate/` (`shots_T2.mjs` → `kontakt_T2.html` — 18 kadrów: 16 ZF gy120
i 2 Polonia gy79, oraz 3 kadry kontroli OFF, × 5 motywów, przed = `1eed72d`, okno 1618×1195, DPR 0,9; strojenie 1:
`kontakt_T2s1.html` — wariant 1, odrzucony; `shots_T2s1v2.mjs` → `kontakt_T2s1v2.html` — wariant 2, K3 i P1a–P1d;
`kontakt_T2s1v3.html` — dopełnienie, P1d najechanie), `results/` (fail-first, sweep, budżet, kontrola OFF — ślad i zrzuty),
`RAPORT_T2.md`, `RAPORT_T2s1.md`, `RAPORT_T2s1v2.md`, `RAPORT_T2s1v3.md`.

- **Przypięcie = zaznaczenie (D-TR-1 (a) — przypięcie; D-UI-5 bez zmian):** 1. klik w ciało / kolonię / stację — tarcza,
  model stacji, etykieta, etykieta na żądanie (T1), lewy outliner — przypina przy etykiecie obiektu rozwinięcie T1
  z wierszem akcji (przyciski tekstowe „[ … ]” w stylu etykiety); 2. klik (linia nazwy albo obiekt) — kamera. Bez nowego
  pola stanu: ciało = zaznaczenie w `UIManager`, stacja = panel stacji „otwarty” — `readClickSelection` czyta przypięcie
  z konstrukcji. Członek stosu wychodzi do własnej etykiety, reszta stosu — LOD jak dziś (zwinięta „+N” / szyna nazywa
  głowę reszty). Ciało z innego układu z lewego outlinera: 1. klik zaznacza i podświetla wiersz (sync U2), przypięcie
  widać po 2. kliku (kamera + przełączenie układu, §7.8) — potwierdzone w strojeniu 1 bez naprawy.
- **Akcje (D-TR-4 (a)) — dzisiejsze cele co do metody:** ciało — „[ Mapa ciała ]” (4 warianty `BottomContext._doAction`,
  w tym jedyny producent `planet:previewMap`; wariant Generatora — „Przejmij cywilizację”; od strojenia 1 tylko wtedy,
  gdy `_doAction` coś zrobi — 554), „[ Raport ]” (`BodyDetailModal` zamiast zakładek ORBITA / FIZYKA / SKŁAD; gwiazda bez
  raportu; ✏ tylko dla ciał zbadanych, dochodzi „Oznacz jako cel”), „[ Złoża ▼ ]”, „[ ✕ ]”; stacja gracza —
  „[ Zarządzaj ]” (zakładka Stacja), „[ Handel ▼ ]” (lista ruchu — jedyny konsument `gatherStationTraders`),
  „[ Moduły ▼ ]”, „[ Magazyn ▼ ]” (gdy lista niepusta), „[ ✕ ]”; stacja obca — sam „[ ✕ ]”. Listy: akordeon (jedna
  otwarta), 5 wierszy + „+N więcej”. Linia „Odl.” od domu — tylko ciała z układu domu (553). Obca kolonia — właściciel
  i garnizon wg wywiadu (treść T1).
- **Zamknięcie (D-TR-5 (a)):** jedno przypięcie naraz (ciało albo stacja; panel statku osobno) — zamiana ciało ↔ stacja
  (`pin_swap`) bez polecenia kamery, panel stacji zostaje; **Esc** zdejmuje przypięcie po zaznaczeniu statku (534 ✅);
  przy otwartym overlayu Esc należy do overlayu, nad oknem szczegółów ciała — do okna (zachowania 1–2, przyjęte);
  przełączenie układu zdejmuje przypięcie spoza układu (486 / 491); „[ Zarządzaj ]” zdejmuje przypięcie stacji (jak dziś
  zamyka panel).
- **Karta ciała i panel stacji przy ON:** nie rysują się i nie łapią kliku, kółka, kursora ani przeciągania
  (`UIManager._bodyCardEntity`, `_stationPanelSurface`) — **488 ✅** (glif „−” znika z kartą; przypięcie ma „[ ✕ ]”),
  **537 ✅** (zostaje przypięcie + panel statku), **540 ✅** (panel stacji nad overlayem); dok bez klientów (nieosiągalny
  — bez ▼; znika w T4).
- **Położenie (I8.3; strojenie 1 — zachowanie 5, wariant 2):** przypięta etykieta stoi przy swoim obiekcie (także
  w biegu), sąsiedzi ustępują w kadrze `MapInsets` (`yieldToPinnedLabel`; najechany, który wszedłby na przypiętą,
  ustępuje); panel statku (T3) zasłaniający przypięte miejsce — etykieta przenosi się obok. Pasek rośnie w dół jak przy
  najechaniu, a gdy wszedłby na tarczę swojego ciała, ciała-gospodarza stacji albo kotwicy stosu — przesuwa się w górę
  dokładnie o nadmiar (`LabelPinLogic.discExcess` — styczna, bez marginesu); bez miejsca w kadrze — pod tarczę (kandydat
  „pod”, ta sama strona; `pinLabelPlacement`). Nadmiar liczony co klatkę od położenia startowego — lista zwinięta:
  etykieta wraca; przy małych tarczach zero skoku przy przypinaniu. **Dopełnienie (po PASS wariantu 2):** ta sama reguła
  dla rozwinięcia NAJECHANIA (T1) — raz, przy pojawieniu się rozwinięcia, potem stoi (I8.3); przy `labelPin` OFF — jak T1.
- **Pliki:** NEW `src/ui/LabelPinLogic.js` (czysty — flaga, `LABEL_PIN`, `PIN_SWAP_REASON`, treść i przyciski przypięcia,
  `mapActionWorks`, listy z limitem, akordeon, `pinnedBox`, `yieldToPinnedLabel`, `pinHitAt`, `runPinAction`, jedno
  przypięcie naraz, Esc, `discExcess`, `pinLabelPlacement`) · `HudLabelLayer.js` (`_t2*`, `pinIt` / `pinPinned`, strefy
  przycisk > nazwa > reszta > tarcza, `pinButtonAt`) · `HudLayer.pinButtonAt` · `UIManager` (`_bodyCardEntity`, NEW
  `_stationPanelSurface`, jedno przypięcie naraz, „rączka”) · `GameScene` (Esc) · `ThreeRenderer` (`pin_swap`) ·
  `StationPanel` (`pin_swap` nie zamyka panelu) · `GameConfig` (`labelPin: true`) · 1 klucz `labelPin.report` PL + EN
  (reszta przycisków — istniejące klucze karty i panelu).
- **Keepery:** NEW `label_pin_smoke` 127/127 (P0 API i flaga · P1 przypięcie = zaznaczenie · P2 strefy kliku · P3 1. / 2.
  klik · P4 jedno przypięcie naraz · P5 Esc · P6 przełączenie układu · P7 `readClickSelection`, ✕, „Odl.” · P8 „Mapa
  ciała” — 4 warianty i 554 · P9 „Raport” · P10 listy · P11 położenie przy obiekcie i względem tarczy, reguła najechania ·
  P12 karta i panel przy ON · P13 wejścia I3 i potwierdzenie zachowania 3 · P14 budżet · P15 OFF = dziś). Przecelowania
  za zgodą (§5.3): `hud_labels_smoke` L5c / L5d / L5f — oryginały przy OFF, „-T2” przy ON — 58/58; reszta pozycji §5.3
  zielona bez zmian (wołają klasy wprost, wyłączenie siedzi w `UIManager`). Fail-first: kopia `git archive 1eed72d` —
  32 PASS / 95 FAIL (zielone wyłącznie kontrole, świadkowie sceny, OFF i potwierdzenie zachowania 3); kopia T2 sprzed
  strojenia — 115 / 12 (czerwone dokładnie piny strojenia). Sweep 345/345 OK, 0 FAIL, 31 advisory; `check-i18n` PASS,
  pl = en = 3409 → 3410.
- **Gra** (izolowany headless Chrome z GPU): arkusz T2 = smoke — 25 przebiegów (ZF gy120 i Polonia gy79 × 5 motywów ×
  przed / po + OFF), 0 wyjątków JS; arkusze strojenia — 0 wyjątków. **OFF = dziś:** ślad deterministyczny 42 klatek na
  stubie świata keepera — 0 z 42 różnych wobec `1eed72d` (KONTROLA: ON — 40 z 42); zrzuty w grze K1–K3b i K7 identyczne,
  rozjazd jednej odległej etykiety w K4–K6 z taktowania klatek w przelotach kamery (sonda krok po kroku — ten sam stan).
  Budżet warstwy HUD przy ON 286–461 µs na narysowaną klatkę (+14…77 µs wobec OFF; przypięcie + najechanie + zaznaczony
  statek), p95 ≤ 0,6 ms, 60 / 60 kl./s; spoczynek z przypięciem — 0 wywołań ctx. Strojenie 1 (px logiczne): K3 — lista
  handlu stacji przy ~4 j. przykrywała tarczę Nowej Ziemi o 42,6 px, po — tarcza odkryta; P1a (mała tarcza) — linia nazwy
  bez zmian; P1c (lista złóż przy dużej tarczy) — przesunięcie 76,3 px = nadmiar; P1d (Mstow, r 58) — najechanie
  przykrywało tarczę o 21,6 px (Neon Cyber 24,6), po dopełnieniu — odkryta; przypięcie — dalsze przesunięcie 17 px (Neon
  Cyber 18) = nadmiar wiersza akcji.
- **Dwie wady złapane przez pierwszy przebieg arkusza — poprawione przed oglądaniem:** rozwinięcie najechanego księżyca
  kładło się na przypiętą etykietę (teraz najechany ustępuje — P11h–P11l); najechanie reszty stosu po wyjściu przypiętego
  członka rozwijało treść członka zamiast głowy reszty (P11m).
- **Dla T4:** `BodyCardSideLogic` przy ON — bez wywołań rozmieszczenia kart; zostaje `objectScreenDisc` w wyborze stacji
  pod kursorem (T1, `HudLabelLayer`) — T4 przenosi go przed usunięciem modułu.
- **Nowe findingi (rejestr `HUD_PLAN.md` §3):** **553** ✅ przy ON (karta ciała podaje „Odl.” od domu także dla ciała
  z innego układu) · **554** ✅ przy ON (strojenie 1 — „Mapa ciała” martwa dla obcej kolonii bez moich wojsk i bez skanu;
  przy OFF karta bez zmian — decyzja właściciela) · **555** ⚪ (okno szczegółów ciała — „???” zamiast nazwy ciała
  niezbadanego; dwie reguły nazwy). 548 przy ON nie występuje (karta ciała się nie rysuje) — status bez zmian. Pierwszy
  wolny: **556**.

### 5.8 T5 — panel statku w idiomie etykiet — WYKONANE 2026-10-26 (decyzje właściciela 2026-10-26)

Decyzje właściciela 2026-10-26 (po bramce T2): krok **T5 po T2, przed T4**; T4 sprząta także flagę T5; kotwica T5 = commit
dokumentacji `docs(TABS T2)`. Commit: **`409f82b`** `feat(T5)` (jedna paczka ze strojeniem 1); bramka właściciela
2026-10-26 — **PASS** (oglądanie arkusza bez uwag; szerokość 200 px zostaje; zachowania 1–8 i 10 z raportu przyjęte),
strojenie 1 — zachowanie 9 (546) i 556 — wykonane przed commitem bez osobnej bramki (keeper i sweep zielone). Flaga
`FEATURES.shipPanelHud` (brak klucza = OFF — panel z T3 co do bitu; w `GameConfig` ON); stoi na T3 (`shipPanelOutliner`)
i trybie kompaktowym. Teczka: `C:\Users\Komputer\kosmos-handover\tabs-t5\` — `probes/` (`trace_off_T5.mjs`,
`cmp_off_T5.mjs`, `fps_t5.mjs`, `scout_t5.mjs`), `gate/` (`shots_T5.mjs` → `kontakt_T5.html` — 14 kadrów ZF gy120 × 5
motywów × przed / po, przed = `4916c76`, okno 1618×1195, DPR 0,9; + Polonia gy79), `results/` (fail-first, sweep, ślad
OFF, budżet, zwiad), `RAPORT_T5.md`.

- **Renderer (NEW `ShipPanelHudLayer`) — idiom przypięć HUD:** ciemny półprzezroczysty pasek bez ramki
  (`THEME.bgPrimary` × 0,72), font motywu, kolory wyłącznie z ról (`resolveHudRoles` — `primary`; `dim` — nieaktywne;
  `alert` — walka, blokada, powody), cyfry w stałej kratce (D-HUD-6; Neon Cyber — Rajdhani); szerokość **200 px**,
  konfigurator misji **260 px**; wysokość = treść z klamrą do obszaru mapy (`MapInsets`) — przy braku miejsca przewija się
  lista (rozkazy albo cele), nie panel; stałe rysunku strojone z konsoli (`KOSMOS.shipPanelHud.tune()`, odczyt `debug()`).
- **Układ:** „← Stocznia” (linia) · nazwa pełna małymi literami z glifem roli + ✎ (łamana do 2 linii, bez „…”; przy
  200 px 30 znaków z okna zmiany nazwy mieści się w jednej linii) · „typ · kadłub · ★” · „● stan · baza” (kropka w roli
  alarmu przy walce i alercie — ton `buildShipEntry`) · linie 9 px tylko z wartością: rozkaz (słowa z kluczy — 538 dla
  panelu statku; misja wstrzymana — „⏸ typ → cel”), misja · ETA + pasek postępu, paliwo (+ rdzenie warp), manifest,
  obcy układ, rekon, pętla, rally · MODUŁY n/m (ikona slotu + nazwa) · ładunek — tekst + pasek 2 px (chip okna ładunku
  w doku i na orbicie) · akcje jako chipy „[ … ]” zawijane w wiersze (kontekstowe → Dokuj · → Flota · Odwrót → Wycofaj /
  Rozmieść → Tankuj · Auto → pula → rally → Rozbiórka), nieaktywne w roli `dim`, nieklikalne · „[ Rozkazy ▼ ]” — rozkazy
  misji zwinięte; rozwinięte — chipy + powody blokad w roli alarmu (akordeon jak „[ Handel ▼ ]” z T2, zwija się przy
  zmianie zaznaczenia). Konfigurator (wybór celu, potwierdzenie) — w miejscu akcji, akcje pod nim. Dziennik misji —
  w Rejestrze Dowództwa (w panelu pominięty).
- **Treść i akcje = lustro `_drawRight` (kompakt) + footer** (NEW `ShipPanelHudLogic` — czysty): te same warunki
  pokazania, te same strefy `{ type, data }` — 31 typów (16 rozkazów misji = `action`) — i **te same handlery**
  (`_handleHit` / `_handleVesselPanelFooter`, dyspozycja jak `handleVesselPanelClick`); Rejestr Dowództwa, `_drawRight`,
  `drawVesselPanel` i golden (P1/C6, E1/E2, f-1/f-2, oś służby) — nietknięte (FMO bez zmian). Klik: chip > linia nazwy
  (D-UI-5 — 2. klik: kamera; statek z innego układu — przełączenie układu + kamera) > pasek (pochłania) > mapa; okno DOM
  na wierzchu — klik pochłonięty; „rączka” nad aktywnym chipem.
- **Geometria z T3 bez zmian:** `_shipPanelAtOutliner` (kotwica przy wierszu, łącznik, klamra, karta walki — 545, zapas
  przy schowanym outlinerze — D-TR-8), tryb Y (D-TR-10). Przy ON panel T3 się nie rysuje i nie łapie kliku, kółka ani
  kursora; przeszkoda kart (544) i etykiet HUD (`_cardRects`) — prostokąt panelu T5.
- **530 ✅** — dymek współrzędnych „Pozycja: (x, y)” pustej mapy nie pokazuje się nad żadnym UI: `isOverUI` (panel
  statku, outlinery, belka, pas, nawigacja, dziennik, panele) albo strefa etykiety / przypięcia HUD (`coversUiPoint`) —
  jeden warunek w `GameScene._coordTooltipOverUi`, przy każdym stanie flag.
- **Strojenie 1 (PASS):** zachowanie 9 — **546 ✅ przy ON**: zmiana zaznaczenia (także A → nic → A) zdejmuje
  konfigurator misji jak „ANULUJ” (`shouldDropMissionConfig`, słuchacz `ui:selectionChanged` w `UIManager`); przy
  otwartym overlayu (Rejestr Dowództwa — własna reguła: klik w wiersz statku) i przy OFF — bez zmian · **556 ✅** — PL
  „⛽ Tankuj”, „🗑 Rozbiórka — wymaga stoczni”.
- **Pliki:** NEW `src/ui/ShipPanelHudLogic.js` · NEW `src/ui/ShipPanelHudLayer.js` · `UIManager` (pole i
  `KOSMOS.shipPanelHud`, `_shipPanelHudActive`, `_drawShipPanelHud`, klik, trafienie, kółko, gałąź w `_draw` za bramką
  T3, „rączka”, `_dropMissionConfigOnSelection`) · `GameScene` (530) · `HudLabelLayer` (`coversUiPoint`, przeszkoda) ·
  `HudLayer.coversUiPoint` · `GameConfig` (`shipPanelHud: true`) · 1 nowy klucz `shipPanelHud.orders` PL + EN (+ 2 napisy
  PL — 556).
- **Keepery:** NEW `ship_panel_hud_smoke` 133/133 (H0 moduły i flaga · H1 zbiór akcji ON = OFF — strefy panelu T5 ≡
  prawdziwego panelu T3 w 20 stanach, pokrycie 31 typów · H2 te same handlery na prawdziwych klikach obu paneli · H3 stany
  nieaktywne · H4 strefy kliku i metody `UIManager` · H5 akordeon · H6 konfigurator, 546 · H7 kotwica T3 na prawdziwym
  Outlinerze · H8 łamanie nazwy · H9 530 · H10 OFF = T3 · H11 budżet · H12 556). Bez przecelowań
  (`ship_panel_outliner_smoke` 112, `map_vessel_panel_compact_smoke` 101, `map_vessel_panel_smoke` 126 — zielone bez
  zmian; gałąź T5 stoi za pierwszą instrukcją bloku T3, więc prostokąt T3 liczy się też przy ON — nieużywany). Fail-first:
  kopia `git archive 4916c76` (także przepisana na CRLF) — 7 PASS / 126 FAIL (zielone wyłącznie kontrole); kopia T5 sprzed
  strojenia — 128 / 5 (czerwone dokładnie piny strojenia). Sweep 346/346 OK, 0 FAIL, 31 advisory; `check-i18n` PASS,
  pl = en = 3410 → 3411.
- **Gra** (izolowany headless Chrome z GPU): arkusz T5 — 10 przebiegów (ZF gy120 × 5 motywów × przed / po) i Polonia gy79
  przed / po — 0 błędów konsoli. **OFF = T3** — ślad deterministyczny na stubie świata keepera, `4916c76` wobec T5 przy
  OFF: rysunek panelu w 20 stanach, 34 440 punktów wejścia (klik, trafienie, kursor nad UI, „rączka”, kółko), przeszkody
  etykiet, blok `_draw` — 0 różnic; dymek współrzędnych — 192 z 1152 punktów różnych, wszystkie nad UI (530, zamierzone);
  KONTROLA ON — różnice wszędzie. Budżet: 60 kl./s we wszystkich stanach; `UIManager._draw` ON 1,02–1,19 ms / OFF
  1,04–1,12 ms / bez zaznaczenia 0,81–0,89 ms; sam panel T5 0,18–0,22 ms ≈ panel T3.
- **Dla T4:** flagi `shipPanelHud` (i `shipPanelOutliner` z T3) po bramkach; przy ON `drawVesselPanel` nad mapą bez
  wywołań — zostaje w Rejestrze Dowództwa.
- **Nowe findingi (rejestr `HUD_PLAN.md` §3):** **556** ✅ (PL „Refuel” / „Disband” na chipach tankowania i rozbiórki) ·
  **557** ⚪ (nazwa celu misji renderowana przy utworzeniu i zapisywana — „→ Entire system” w PL; rodzina 165). **538** —
  część panelu statku ✅ przy ON. Pierwszy wolny: **558**.

### 5.9 T6 — panele floty i grupy przy outlinerze — WYKONANE 2026-10-27 (decyzja właściciela 2026-10-26)

Decyzja właściciela 2026-10-26 (po bramce T5): **D-TR-9 zmieniona** z (a) (panele floty i grupy poza reformą) — krok
**T6 po T5, przed T4**; T4 sprząta `FloatingPanel` dopiero po T6. Kolejność całości: **531 / 532 → T3 → T1 → T2 → T5 →
T6 → T4 → paczka B ARKUSZA HUD**. Kotwica T6 = commit dokumentacji `docs(TABS T5)`.

- **Co:** panel floty (`FleetCommandPanel`) przy **wierszu węzła floty** w prawym outlinerze; panel grupy N ≥ 2
  (`FleetGroupPanel`) przy **wierszu lidera** zaznaczenia — oba w idiomie etykiet z T5 (osobne lekkie renderery: ciemny
  pasek bez ramki, font motywu, kolory z ról, chipy „[ … ]”). Rejestr Dowództwa i overlay floty — nietknięte.
- **Bez zmian z T3:** geometria (kotwica przy wierszu, łącznik, klamra), histereza, zapas przy schowanym outlinerze,
  tryb Y.
- **Flaga:** nowa (nazwa przy starcie T6; brak klucza = OFF — dzisiejsze panele floty i grupy); sprząta ją T4.
- **Protokół** jak T5 (`HUD_PLAN.md` §4.0, aneks 2026-10-23): keepery wyłącznie dla logiki (zbiór akcji ON = OFF,
  te same handlery, strefy kliku, kotwica przy węźle floty / wierszu lidera, OFF = dzisiejsze panele, kl./s), arkusz
  kontaktowy na 5 motywach, bramka właściciela = oglądanie i pętla strojenia, zapis v101 bez migracji.
- **Flaga (start T6, 2026-10-27):** `FEATURES.fleetPanelHud`; stoi na T5 (`shipPanelHud` aktywny — geometria T3, tryb
  kompaktowy) i na dzisiejszych bramkach paneli (`fcFleetPanel`, `fcGroupPanel`).

**Wykonanie — 2026-10-27.** Commit **`694cfcf`** `feat(T6)` (jedna paczka ze strojeniem 1); bramka właściciela 2026-10-27 —
**PASS** (oglądanie arkusza; zachowania 1, 2 i 5–12 z raportu przyjęte, 3 i 4 — skorygowane w strojeniu 1), strojenie 1 —
**PASS** (zachowania 1–4 przyjęte). Flaga `FEATURES.fleetPanelHud` (brak klucza = OFF — dzisiejsze `FleetCommandPanel` /
`FleetGroupPanel` co do bitu; w `GameConfig` ON). Teczka: `C:\Users\Komputer\kosmos-handover\tabs-t6\` — `probes/`
(`trace_off_T6.mjs`, `cmp_off_T6.mjs`, `fps_t6.mjs`, `scout_t6.mjs`, `edge_gap.mjs`, `edge_dom.mjs`), `gate/`
(`kontakt_T6.html` — 13 kadrów ZF gy120 × 5 motywów × przed / po, przed = `4b9f7f9`, + Polonia gy79; `kontakt_T6s1.html` —
strojenie 1: 10 kadrów × 5 motywów, przed = runda 1, po = strojenie; okno 1618×1195, DPR 0,9), `results/` (fail-first,
sweep, ślad OFF, budżet, zwiad, pomiar krawędzi), `RAPORT_T6.md`, `RAPORT_T6s1.md`.

- **Renderer (NEW `FleetPanelHudLayer`, dziedziczy maszynerię tekstu `ShipPanelHudLayer`):** idiom T5 — ciemny pasek bez
  ramki, font motywu, kolory z ról, cyfry w kratce; **200 px**, konfigurator celu floty **260 px**; wysokość = treść
  z klamrą do obszaru mapy; przewija się lista członków (≤ 8 linii, kółko nad panelem); strojenie
  `KOSMOS.fleetPanelHud.tune()`, odczyt `debug()`.
- **Układ:** linia sterowania (flota „◀ ▶ … — ✕”, grupa „—”; po zwinięciu „+”) · nazwa (⛬, małe litery, ≤ 2 linie) + ✎
  (flota) / „grupa · N statków” · „N statków · lider: X · stan” (flota) / „lider: X” + linia zbiorcza paliwo · utrzymanie ·
  uzbrojenie, rezerwa i unieruchomione osobnymi liniami (grupa) · „doktryna: X ▾” · członkowie jako linie (glif roli
  w kolorze znacznika, prowadzący pogrubiony, dopisek układu, chipy-glify ◎ ✕ / ◎ ✎ ✕, linia celu ataku / pościgu w roli
  alarmu) · „[ Rozwiąż ]” / „[ → Flota ]” · „[ Rozkazy ▼ ]” (akordeon T5). Konfigurator celu floty = picker Rusz / Atak tej
  floty: „WYBIERZ CEL — …”, podpowiedź, „[ ANULUJ ]”.
- **Treść i akcje = lustro dzisiejszych paneli (NEW `FleetPanelHudLogic` — czysty):** te same warunki aktywności i te same
  strefy `{ type, data }` (flota 16 typów, grupa 11), dyspozycja do `_onHit` instancji z `UIManager` (stan — flota,
  zaznaczenie, zwinięcie — dalej w dzisiejszych panelach); stronicowanie → kółko, pochłanianie `bg` → reszta paska. Klik:
  chip > linia członka (zaznaczenie statku — panel statku T5, panel floty / grupy znika) > linia nazwy (D-UI-5) > pasek.
- **Kotwica — geometria T3 bez zmian:** wiersz węzła floty (`fleet:<id>`, potem nagłówek układu / „W drodze”) albo lidera
  grupy, łącznik, klamra, karta walki jako przeszkoda, zapas przy schowanym outlinerze; tryb Y — zapas.
- **Mutex (`fleetHudSurface` = reguła Doku `computePanelMode`):** w danej chwili jeden z trzech paneli — flota > N ≥ 2 >
  lider; zaznaczenie statku (każda powierzchnia) zdejmuje flotę (560); Esc zamyka panel floty (561); zmiana zaznaczenia
  zwija akordeon i zdejmuje picker floty, której panel już nie pokazuje (559 — reguła 546). Przy ON dzisiejsze panele
  w lewym dolnym rogu nie rysują się i nie łapią kliku, kółka ani kursora; przeszkoda etykiet HUD — prostokąt panelu T6.
- **Strojenie 1 (właściciel 2026-10-27, PASS):** (3) klik w PUSTĄ mapę zdejmuje flotę (`dropFleetOnEmptyMapClick`;
  uzbrojony picker — klik = cel; ciało / stacja zostawia flotę jak zaznaczenie statku — D-TR-14); (4) baner pickera u góry
  ukryty, gdy panel pokazuje konfigurator (`pickerBannerHidden`, `UIManager._syncPickerBanner` — `visibility`, w klatce
  i w zdarzeniach pickera; zwinięty panel / overlay — baner wraca; OFF jak dziś); **562 ✅** — „Odwrót” grupy aktywny tylko
  dla członka w aktywnym starciu, przy OFF i ON (`countActionable` + `combatCheckOf` = predykat bramki MOS `not_in_combat`;
  unieruchomiony w starciu — aktywny, D-FDk); **563** — pomocnika polskiej liczby mnogiej w repo nie ma → ⚪ bez nowego
  mechanizmu.
- **Pliki:** NEW `src/ui/FleetPanelHudLogic.js` · NEW `src/ui/FleetPanelHudLayer.js` · `UIManager` (pole
  i `KOSMOS.fleetPanelHud`, `_mapSurface` → `fleetHudSurface`, `_fleetPanelHudActive`, `_dropFleetOnShipSelection`,
  `_dropFleetPickerOnSelection`, `_dropFleetOnEmptyMapClick`, `_syncPickerBanner`, `_drawFleetPanelHud`,
  `_fleetPanelAtOutliner`, klik, trafienie, kółko, `isOverUI`, kursor; bramki dzisiejszych paneli przy ON) · `GameScene`
  (Esc, pusta mapa) · `HudLabelLayer` (przeszkoda) · `FleetGroupPanelLogic` / `FleetGroupPanel` (562) · `GameConfig`
  (`fleetPanelHud: true`) · 2 nowe klucze `fleetPanelHud.group` / `fleetPanelHud.leader` PL + EN.
- **Keepery:** NEW `fleet_panel_hud_smoke` **130/130** (F0 moduły i flaga · F1 zbiór akcji ON = OFF — strefy T6 ≡ strefy
  prawdziwych paneli w 15 stanach, pokrycie 16 / 11 typów · F2 te same handlery · F3 stany nieaktywne · F4 strefy kliku ·
  F5 mutex · F6 klik w członka · F7 akordeon · F8 konfigurator i 546 · F9 kotwica na prawdziwym Outlinerze · F10 Esc · F11
  OFF = dziś · F12 budżet · F13 kółko · F14 trafienie i przeszkody · F15 pusta mapa · F16 baner · F17 562 — z wykonaniem
  prawdziwego `MovementOrderSystem._issueRetreat`). Fail-first: wersja 99 na kopii `git archive 4b9f7f9` (LF i CRLF) —
  8 PASS / 91 FAIL (zielone wyłącznie kontrole); wersja 130 na rundzie 1 — 110 / 20 (czerwone dokładnie piny strojenia).
  Przecelowania (562, za zgodą — świadkowie z inwentarza §5.9.1): `vessel_status_label` T6 i `map_vessel_panel` P-A1 —
  fixture w starciu, asercje bez zmian (oba zielone także na rundzie 1). Sweep 347/347 OK, 0 FAIL, 31 advisory;
  `check-i18n` PASS, pl = en = 3411 → 3413.
- **Gra** (izolowany headless Chrome z GPU): arkusz T6 — 10 przebiegów; Polonia gy79 przed / po (zapis bez floty — flota
  instrumentem w sesji, tylko w pamięci); arkusz strojenia — 10 przebiegów; 0 błędów konsoli. **OFF = dziś** — ślad
  deterministyczny na stubie świata keepera, `4b9f7f9` wobec T6 przy OFF: rysunek w 8 stanach, 31 360 punktów wejścia,
  19 kroków zaznaczenia, przeszkody etykiet — 0 różnic, tekst bramek identyczny; KONTROLA ON — różnice (6 / 8 stanów,
  2564 punkty, 14 / 19 kroków). Budżet: 60 kl./s we wszystkich stanach; panel T6 0,19–0,23 ms na klatkę wobec 0,12–0,17 ms
  dzisiejszych paneli.
- **Prawa krawędź (diagnoza read-only przy strojeniu 1):** kolumna prawego outlinera dochodzi do krawędzi — x W − 150 … W,
  0 px przy 1618×1195 (DPR 0,9) i 1280×720 (pomiar w grze; tło do ostatniej kolumny pikseli w 5 motywach, przy krawędzi
  żadnego elementu DOM poza płótnami); panele T5 i T6 kotwiczą do `rightOutliner._rect.x`, nie do W − 150. Pozostałości po
  wyzwalaczu starego wysuwanego outlinera są OBOK kolumny: pasek nawigacji kończy się na W − 6
  (`BottomNavBarLogic.BOTTOM_NAV_EDGE`) i pasmo surowców górnej belki na W − 6 (`TopResourceDrawer`, `EDGE_R`); naprawa
  przesuwa ostatni slot nawigacji, do którego kotwiczą zegar, suwak zoomu i chip ⚔ (`BottomControlBar`), oraz belkę ⇒ bez
  naprawy w T6 — **564** ⚪ (kierunek: paczka B razem z chipami warstw w pasie dolnym; pin „pasek nawigacji i pasmo belki
  = W”). Dół prawej kolumny 20 px nad lewą to pas dolny (U4-3, decyzja (a)), nie defekt.
- **Dla T4:** flaga `fleetPanelHud` po bramce; przy ON `FleetCommandPanel.draw` / `FleetGroupPanel.draw` nad mapą bez
  wywołań — instancje trzymają stan i handlery (`_onHit`); `FloatingPanel` — po T6 do sprzątnięcia.
- **Findingi (rejestr `HUD_PLAN.md` §3):** ✅ **558** (surowy typ rozkazu w linii członka — przy ON), **559** (picker floty
  po zmianie zaznaczenia — przy ON), **560** (zaznaczenie statku a flota — przy ON), **561** (Esc — przy ON), **562**
  („Odwrót” grupy poza walką — przy OFF i ON) · ⚪ **563** (PL „3 statków” — bez pomocnika liczby mnogiej), **564** (6 px —
  pasek nawigacji i belka; paczka B). Pierwszy wolny: **565**.

#### 5.9.1 Inwentarz obu paneli (krok przed kodem — 2026-10-27, read-only na `4b9f7f9`)

`[code]` — linie przy `4b9f7f9`. Panele: `src/ui/FleetCommandPanel.js` (552 linie, CRLF; logika `FleetCommandPanelLogic.js`
— `nextFleetId`, `nextDoctrine`, `nearestEnemyToPoint`) i `src/ui/FleetGroupPanel.js` (456 linii, CRLF; logika
`FleetGroupPanelLogic.js` — `summarizeFleetGroup`, `buildRosterRows`, `countActionable`). Oba dziedziczą `BaseOverlay`
(strefy `_addHit` / `_hitTest` = `Array.find`, tło `bg` dodane na końcu). Host w `UIManager`: konstrukcja `:368-371`,
`:385`, `:401-404`; rysunek `:2596-2602` (panel floty przed panelem grupy — grupa stackuje się NAD flotą); klik
`:2192-2199` (po panelu statku, przed paskami); blokada kamery `isOverUI` `:2101-2105`; `isPointerOverFloatingPanel`
`:2148-2149`; najechanie `:2384-2385`; flagi `GameConfig.js:214-215` (`fcGroupPanel`, `fcFleetPanel` — ON). Kółka nie ma
(stronicowanie przyciskami). `FloatingPanel` — **nieużywany** przez żaden z dwóch paneli (używają go dziś tylko karta
ciała i panel stacji; przeciąganie — brak).

**I1 — pola.** Panel floty (FCP; pokazuje flotę `UIManager.getSelectedFleetId()`):

| # | Pole | Warunek | Linie |
|---|---|---|---|
| F1 | nagłówek „◀ nazwa · N ▶” (nazwa ucinana) + ✏ — ✕ | zawsze | `:182-199` |
| F2 | „Doktryna: X ▾” (klik = następna doktryna) | zawsze | `:205-211` |
| F3 | wiersz członka (≤ 6 na stronę): nazwa (lider zaznaczenia — akcent), linia „kadłub · status [ciało] · rozkaz” (rozkaz — **surowy typ**, np. `moveToPoint`), mini-pasek paliwa, 🎯 ✕; trzecia linia „ikona cel · X AU” przy ataku / pościgu / przechwyceniu | członkowie żywi | `:213-218`, `:279-320` |
| F4 | stronicowanie ▲ n/N ▼ | > 6 członków | `:220-235` |
| F5 | rozkazy (2 rzędy): Rusz, Atak, Dokuj, Odcumuj · Powrót, Stop, Rozwiąż | zawsze (nieaktywne bez strefy) | `:243-273` |
| F6 | zwinięty — chip „⛬ nazwa · N” w lewym dolnym rogu | po „—” | `:131-151` |

Panel grupy (FGP; zaznaczenie N ≥ 2, `_mapSurface() === 'group'`):

| # | Pole | Warunek | Linie |
|---|---|---|---|
| G1 | nagłówek „Zaznaczone statki · N” + [→ Flota] + — | → Flota: `fleetSystem` istnieje | `:178-197` |
| G2 | linia zbiorcza: Paliwo % · Utrzymanie Kr/rok · Uzbr. a/b · 📦 rezerwa (Kr) · ⚠ unieruchomione (segmenty, które się mieszczą) | zawsze | `:203-235` |
| G3 | wiersz statku: ⚠ (unieruchomiony) + nazwa (lider — akcent), linia „kadłub · status [ciało] · rozkaz”, pasek paliwa, 🎯 ✏ ✕; linia celu jak F3 | statki żywe, gracza | `:237-242`, `:307-365` |
| G4 | stronicowanie | > 6 | `:244-259` |
| G5 | rozkazy (2 rzędy): Dokuj, Odcumuj · Tankuj, Stop, Odwrót — nieaktywne wg `countActionable` | zawsze | `:267-300` |
| G6 | zwinięty — chip „⛬ Zaznaczone statki · N” | po „—” | `:121-141` |

**I2 — akcje (strefa → handler; wszystkie przez `_onHit` panelu):**

| Strefa | Panel | Skutek | Warunek aktywności | Potw. |
|---|---|---|---|---|
| `prevFleet` / `nextFleet` | F | `nextFleetId` → `setSelectedFleetId` | zawsze | — |
| `renameFleet` | F | `showRenameModal` → `fleetSystem.setName` | zawsze | modal |
| `closeFleet` | F | `setSelectedFleetId(null)` | zawsze | — |
| `doctrine` | F | `nextDoctrine` → `setDoctrine` + toast | zawsze | — |
| `memberFocus` / `focus` | F / G | `vessel:focus` (kamera, zaznaczenie bez zmian) | członek | — |
| `memberRemove` | F | `fleetSystem.removeMember(id, 'manual')` | członek | — |
| `remove` | G | `removeFromSelection(id)` | statek | — |
| `rename` | G | `showRenameModal` → `vessel:rename` | statek | modal |
| `bgMove` / `bgEngage` | F | picker punktu mapy (`setPickerMode('targetPoint')`, baner u góry) → admisja ramki kamery (255 / 268) → `issueFleetOrder` (moveToPoint / engage) → `_announce` | członkowie > 0 | klik w mapę |
| `bgDock` / `grpDock` | F / G | `openDockPicker(ids, {sameSystemOnly, vessel: pierwszy żywy})` — okno DOM | F: członkowie > 0; G: `canDock` | okno |
| `bgUndock` / `grpUndock` | F / G | `undockToOrbit` każdego zadokowanego | zadokowany ≥ 1 | — |
| `bgReturn` | F | `_fleetReturn` (cel per członek — 272) | ktoś poza dokiem | — |
| `bgStop` | F | `cancelFleetOrder(fleetId, 'manual')` | `fleet.activeOrder` | — |
| `bgDisband` | F | `disbandFleet(fleetId, 'manual')` — rozwiązuje grupowanie, statki zostają | zawsze | — |
| `assignFleet` | G | `assignVesselsToFleet` (okno: istniejąca / nowa) → `setSelectedFleetId` | `fleetSystem` | okno |
| `grpRefuel` / `grpStop` / `grpRetreat` | G | `manualRefuel` zadokowanych / `cancelOrder` / `issueOrder({type:'retreat'})` każdego | `countActionable` | — |
| `minimize` / `restore` | F / G | `_minimized` (chip w lewym dolnym rogu) | zawsze | — |
| `pageUp` / `pageDown` | F / G | `_page` | > 6 | — |
| `bg` | F / G | pochłonięcie (klik nie spada na mapę) | — | — |

Klik w wiersz członka POZA ikonami — nic (`bg`). **Przeciągania statków między flotami nie ma** (ani przeciągania
panelu) — każda akcja ma odpowiednik 1:1 w chipie albo w linii (I7); STOP z briefu nie zachodzi.

**I3 — wejścia i zamknięcie.** Panel floty: węzeł floty w prawym outlinerze (`Outliner.js:300-305` → `clickObject
(fleetTarget)`: 1. klik `setSelectedFleetId` + zaznaczenie statków zdjęte, 2. klik — kamera na prowadzącym,
`ClickIntentLogic.js:148-156`); Rejestr Dowództwa — nagłówek floty (`FleetManagerOverlay:2058-2066`, `:2141-2144`),
nowa flota / przypisanie (`:4700-4713`, `:4752-4761`); „→ Flota” z panelu grupy i z footera panelu statku
(`VesselGroupActions.assignVesselsToFleet:150` — zaznaczenie statków ZOSTAJE); ◀ ▶. Zamknięcie: ✕; klik statku
w outlinerze (`Outliner.js:293`) i w Rejestrze (`FMO:2104-2105`, `:2229-2230`, `:2346-2347`) — mutex flota / statek;
rozwiązanie floty (`fleet:disbanded`, `:71-75`). **Esc i klik w pustą mapę panelu floty NIE zamykają** (Esc: łańcuch
`GameScene.js:4762-4791` zna tylko zaznaczenie statków; `clearSelection` — tylko statki). **Klik statku na mapie, Tab,
etykieta HUD i Dok taktyczny NIE zdejmują floty** (`GameScene._selectFromClickPick:6107-6121` — tylko
`setSelectedVesselId`) — dziś panel floty i panel statku rysują się wtedy naraz. Panel grupy: CTRL+klik na mapie
(`GameScene:6111`), prostokąt SHIFT (`:6020-6022`), klaster etykiet HUD (`vesselsTarget` — `ClickIntentLogic.js:131-139`),
CTRL w outlinerze (`Outliner.js:289`) i w Doku (`TacticalDock.js:638-639`); lider = `UIManager._selectedVesselId`
(pierwszy dodany; po usunięciu — pierwszy pozostały, `:754-761`). Zamknięcie: Esc, pusta mapa, N → 1 (panel statku),
✕ do jednego. Dok taktyczny (tryb Y) — mini-panel dla floty i grupy pokazuje tylko podpowiedź „akcje w panelu floty /
grupy” (`TacticalDock.js:512-521`; reguła trybu `computePanelMode` — flota > grupa > statek, `TacticalDockLogic.js:147-152`).

**I4 — stan:** FCP `_fleetId` (z `ui:fleetSelectionChanged`), `_minimized`, `_page` (zerowany przy zmianie floty),
`_drawnRect` (stackowanie), `_hoverZone`; FGP `_ids` (z `ui:selectionChanged`), `_minimized`, `_page`, `_drawnRect`;
FGP zdejmuje wrak z zaznaczenia (`vessel:wrecked`). Położenie liczone co klatkę: lewy dolny róg obszaru mapy
(x = `MapInsets.left` + 8, y nad rezerwą dolną), grupa nad flotą (`:162-166`); przy overlayu i globusie — nie rysują się.
Nic w `uiPrefs`, nic w zapisie.

**I5 — rozmiar:** oba 340 px; flota: 26 + 18 + 4 + wiersze (26 / 40 z linią celu) × ≤ 6 + 16 + 6 + 50 + 6 — przy 3
członkach 188 px, przy 6 z celami 386 px; grupa: 26 + 18 + 4 + wiersze (30 / 44) × ≤ 6 + 16 + 6 + 50 + 6. Najdłuższe
napisy: „Zaznaczone statki” 17 / „Selected vessels” 16; „Brak wroga w tym miejscu” 24; „Przypisano {0} do floty …”.

**I6 — świadkowie (keepery):** `map_vessel_panel_smoke` P8 (piny źródłowe docka obu paneli), P10 (oba panele
wykonane na atrapie — `draw`, `grp*`, `bgDock`), P-mount (bramka `_mapSurface() === 'group'`), „dokładnie JEDNO
`fleetGroupPanel.draw(`”, zdjęty `grpReturn` · `left_outliner_smoke` (chipy zwinięte przy `MapInsets.left` — `:361-372`;
kolejność rysunku L7d / L17c — `fleetGroupPanel.draw(` po liście kolonii; kolejność kliku L17d —
`fleetCommandPanel?.handleClick?.(` przed listą kolonii) · `fleet_engage_picker_frame_smoke` (`_armEngagePicker`) ·
`fleet_engage_scope_smoke` (`_announce`) · `fleet_move_picker_frame_smoke` (`_armMovePicker`) ·
`fleet_return_per_member_smoke`, `return_dock_family_smoke` (`_fleetReturn`) · `vessel_status_label_smoke` T1–T5 (linie
statusu obu paneli) · `w2_reserve_upkeep_smoke` (`summarizeFleetGroup`) · `right_outliner_smoke` (węzeł floty) ·
`click_focus_rule_smoke` (cel floty) · `ship_panel_hud_smoke` (atrapa `UIManager` z panelami floty / grupy `null`).

**I7 — docelowe miejsce (T6, flaga ON):**

| Dziś | T6 | Uzasadnienie |
|---|---|---|
| F1 ◀ ▶ — ✕ | linia górna: chipy-glify „◀ ▶” i „— ✕” (te same strefy) | nawigacja i zamknięcie bez ramki |
| F1 nazwa · N; G1 tytuł · N | nazwa floty pogrubiona (glif ⛬, małe litery, łamana do 2 linii) + ✎ (`renameFleet`); grupa — „⛬ grupa · N statków”; linia nazwy = reguła D-UI-5 (2. klik: kamera na prowadzącym) | idiom etykiet (T5) |
| — | linia 9 px „N statków · lider: X · stan” (flota) / „lider: X” + linia zbiorcza G2 (grupa; rezerwa — osobna linia tekstem „w tym rezerwa: N kadł. · X Kr/rok”, istniejące klucze, zamiast emoji 📦; unieruchomione — linia w roli alarmu) | brief T6 |
| F2 doktryna | linia-chip „doktryna: X ▾” (strefa `doctrine`) | jak „← Stocznia” w T5 |
| F3 / G3 wiersz | linia członka: glif roli w kolorze znacznika (jak outliner — D-UI-9) + nazwa; klik w linię = zaznaczenie statku (D-UI-5 select, mutex floty, ping zadokowanego — jak wiersz outlinera) → panel statku T5; ◎ ✕ (flota) / ◎ ✎ ✕ (grupa) — chipy-glify na końcu linii (te same strefy; ◎ — glif tekstowy w kolorze roli zamiast emoji 🎯); linia celu — 9 px w roli alarmu; linia „kadłub · status · rozkaz” i pasek paliwa — [X] (panel statku członka; status niesie kolor glifu, paliwo grupy — linia zbiorcza) | jedna linia na członka (200 px) |
| F4 / G4 stronicowanie | [X] — kółko nad panelem przewija listę członków | brief T6 |
| F5 rozkazy | Rozwiąż — chip akcji głównej; Rusz, Atak, Dokuj, Odcumuj, Powrót, Stop — pod „[ Rozkazy ▼ ]” (akordeon T5) | brief T6 |
| G1 → Flota, G5 rozkazy | „→ Flota” — chip akcji głównej; Dokuj, Odcumuj, Tankuj, Stop, Odwrót — pod „[ Rozkazy ▼ ]” | brief T6 |
| F6 / G6 zwinięcie | „—” zwija panel do nagłówka przy wierszu (ten sam stan `_minimized` panelu), „+” rozwija; chipa w lewym dolnym rogu nie ma | idiom przy wierszu |
| picker Rusz / Atak (baner u góry) | „konfigurator celu floty” 260 px, gdy picker tej floty jest uzbrojony: nagłówek rozkazu, podpowiedź `picker.point.instructions`, „[ ANULUJ ]” (`cancelPickerMode`); zmiana zaznaczenia zdejmuje picker (reguła 546) | brief T6 — dziś FCP nie ma listy celów, cel = klik w mapę |
| `bg` | reszta panelu pochłania klik | jak T5 |

**I8 — ryzyka:** (1) mutex `readClickSelection` (flota > N ≥ 2 > lider) przy dzisiejszym kliku statku na mapie / Tab /
etykiecie / Doku (flota NIE schodzi) pokazałby dalej panel floty — przy ON zaznaczenie statku zdejmuje flotę (lustro
§7.11 outlinera i P2.5 Rejestru); (2) Esc nie zamyka panelu floty — przy ON zamyka (przed krokiem zaznaczenia statku);
(3) tryb Y: mini-panel Doku dla floty i grupy odsyła do panelu — panele zostają w zapasie (prawy górny róg obszaru
mapy; panel STATKU w trybie Y — jak T3, schowany); (4) picker floty przeżywa dziś zmianę zaznaczenia (lustro 546);
(5) piny źródłowe na tekście `UIManager` (jedno `fleetGroupPanel.draw(`, bramka panelu statku, kolejność kliku i rysunku)
— gałąź T6 obok, bez zmiany tych napisów; (6) węzeł floty w zwiniętym układzie — kotwica przy nagłówku układu (jak T3),
flota w skoku — „W drodze”; (7) członek floty w innym układzie niż prowadzący — linia z dopiskiem układu (jak outliner).

---

## 6. Decyzje (D-TR-1…15) — PODPISANE 2026-10-24

### 6.0 Podpisy właściciela (2026-10-24)

| # | Podpis | Co to znaczy dla cięcia |
|---|---|---|
| **D-TR-1** | (a) | etykieta na żądanie przy najechaniu tarczy ciała bez etykiety, z tym samym rozwinięciem (T1); 1. klik przypina (T2), odznaczenie zdejmuje — ✅ T1 2026-10-26 (`fc44de7`, §5.6 — etykieta na żądanie); przypięcie — ✅ T2 2026-10-26 (`0ddbf05`, §5.7) |
| **D-TR-2** | (a) | przy ON rozwinięcie zastępuje `#colony-3d-tooltip` (kolonia, statek) i ciałowo-statkową część `#kosmos-tooltip`; zostają: podpowiedź budynku (K3), współrzędne pustej mapy (530), POI (T1) — ✅ 2026-10-26 (`fc44de7`, §5.6) |
| **D-TR-3** | tabele I7 | treść rozwinięć wg tabel I7 (§3.1, §3.2, §3.4); szczegóły — strojenie na bramce T1 — ✅ 2026-10-26 (`fc44de7`, §5.6; bramka bez uwag do treści — bez strojenia) |
| **D-TR-4** | (a) | przypięcie ciała bez zakładek: Mapa ciała + Raport (`BodyDetailModal` — orbita, fizyka, skład, złoża, ✏) + ✕ (T2) — ✅ 2026-10-26 (`0ddbf05`, §5.7) |
| **D-TR-5** | (a) | jedno przypięcie naraz (ciało albo stacja), panel statku osobno; Esc zdejmuje przypięcie — po zaznaczeniu statku, przed overlayem (T2) — ✅ 2026-10-26 (`0ddbf05`, §5.7; przy otwartym overlayu Esc należy do overlayu — zachowanie przyjęte na bramce T2) |
| **D-TR-6** | (a) | dok minimalizacji znika w T4 razem z kartami; pas dolny wolny dla chipów warstw (D-HUD-13) |
| **D-TR-7** | (a) | panel statku 300 × 300 / 360, wysunięty w lewo od prawego outlinera (x = W − 150 − 300), górna krawędź na wysokości wiersza, klamra do obszaru mapy (T3) — ✅ 2026-10-25 (`496ab80`, §5.5) |
| **D-TR-8** | (a) | bez prawego outlinera (klawisz „.”, overlay, rozwinięty Dok) — kotwica zapasowa jak dziś: prawy górny róg obszaru mapy — ✅ 2026-10-25 (`496ab80`, §5.5) |
| **D-TR-9** | (a) → **zmieniona 2026-10-26** | (a) — flota (węzeł) i grupa N ≥ 2 poza reformą — obowiązywało w T3 i T5 (§5.5, §5.8); **decyzja właściciela 2026-10-26 (po bramce T5):** panel floty (`FleetCommandPanel`) przy wierszu węzła floty w prawym outlinerze, panel grupy N ≥ 2 (`FleetGroupPanel`) przy wierszu lidera — oba w idiomie etykiet z T5 (osobne lekkie renderery; Rejestr / overlay floty nietknięte), geometria / łącznik / histereza / zapas / tryb Y z T3 — krok T6 (§5.9) — ✅ 2026-10-27 (`694cfcf`, §5.9) |
| **D-TR-10** | (a) | tryb Y: przy rozwiniętym Doku panel statku nad mapą się nie rysuje (mini-panel Doku + „Pokaż w rejestrze”) — ✅ 2026-10-25 (`496ab80`, §5.5) |
| **D-TR-11** | (a) | panel statku bez zmian; paliwo i utrzymanie w rozwinięciu wiersza / etykiety (D-TR-3) |
| **D-TR-12** | **(b) — T3 NA POCZĄTEK** | kolejność całości niżej |
| **D-TR-13** | (a) | potwierdzenie rozbiórki statku przy przenosinach panelu (T3) — ✅ 2026-10-25 (`496ab80`, §5.5) |
| **D-TR-14** | (a) | klik ciała na mapie nie zdejmuje zaznaczenia statku — jak w lewym outlinerze (T3) — ✅ 2026-10-25 (`496ab80`, §5.5) |
| **D-TR-15** | **(b) — 531 i 532 od razu** | oba osobnym drobnym krokiem, przed T3 — ✅ 2026-10-24 (`471191d` · `da8b2c9`, §5.4) |

**Kolejność całości:** **531 / 532 → T3 → T1 → T2 → T4 → paczka B ARKUSZA HUD** — paczka B (H4) po T4, bo chipy warstw
[R] [T] [E] [O] (D-HUD-13) stają w pasie dolnym w miejscu doku (D-TR-6, §3.5 I7). **§7:** kandydaci 531–543 przyjęci
w całości do rejestru `HUD_PLAN.md` §3 — 531, 532 🟠, reszta ⚪; pierwszy wolny **544**. (531, 532 — ✅ 2026-10-24,
§5.4.) **Uzupełnienie 2026-10-26 (decyzja właściciela po bramce T2):** T5 — panel statku w idiomie etykiet (§5.8) — po
T2, przed T4: **531 / 532 → T3 → T1 → T2 → T5 → T4 → paczka B ARKUSZA HUD**; T4 sprząta także flagę T5.
**Uzupełnienie 2026-10-26 (decyzja właściciela po bramce T5):** D-TR-9 zmieniona — T6, panele floty i grupy przy
outlinerze (§5.9), po T5, przed T4: **531 / 532 → T3 → T1 → T2 → T5 → T6 → T4 → paczka B ARKUSZA HUD**; T4 sprząta
`FloatingPanel` dopiero po T6.

### 6.1 Decyzje — treść z inwentarza (rekomendacja pierwsza)

| # | Pytanie | Opcje | Rekomendacja |
|---|---|---|---|
| **D-TR-1** | Ciała BEZ etykiety (gwiazda, ciała bez kolonii, kolonie i stacje AI) — skąd rozwinięcie i przypięcie? | (a) etykieta na żądanie: najechanie tarczy pokazuje etykietę HUD z rozwinięciem, 1. klik przypina, odznaczenie ją zdejmuje; (b) stałe etykiety wszystkich ciał z LOD (33 w ZF domu, 61 w `sys_061`); (c) rozwinięcie przy wierszu LEWEGO outlinera (lustro ram statków); (d) karta ciała zostaje dla ciał bez etykiety | **(a)** — jeden komponent dla wszystkich ciał bez zalewania kadru; renderer już liczy najechanie tarczy (`_hoverPlanetId`, `planet:hover` — `ThreeRenderer.js:3627-3630`) |
| **D-TR-2** | Warstwy najechania (dziś 3 naraz — M6) | (a) przy ON rozwinięcie zastępuje `#colony-3d-tooltip` (kolonia, statek) i ciałowo-statkową część `#kosmos-tooltip`; zostają: podpowiedź budynku (K3), współrzędne pustej mapy (530 — osobno), POI; (b) zostawić wszystkie; (c) wygasić tylko `#colony-3d-tooltip` | **(a)** — jedno źródło informacji przy kursorze; zamyka 531, 533, 536 |
| **D-TR-3** | Treść rozwinięcia (≤ 4 linie) | wg tabel I7 (§3.1, §3.2, §3.4): kolonia — POP · wolne · stolica · wykr. / typ · temp. · atm. / złoża skrót / okupacja albo kolejka; ciało — typ · temp. · atm. / status zbadania / złoża skrót / dystans; obca kolonia — właściciel wg wywiadu / garnizon / okupacja / typ; stacja — POP / poj. + plakietki / magazyn / ruch / moduły; statek — rola · wykr. · lock / aktywność · ETA / paliwo | przyjąć tabele I7; szczegóły — strojenie na bramce T1 |
| **D-TR-4** | Przypięcie ciała: co z zakładkami ORBITA / FIZYKA / SKŁAD | (a) bez zakładek: Mapa ciała + Raport (`BodyDetailModal` — orbita, fizyka, skład, złoża, ✏) + ✕; (b) zakładki w przypięciu (karta w nowym miejscu) | **(a)** — raport istnieje, ma ✏, dziś osiągalny tylko przez Atlas |
| **D-TR-5** | Zamykanie i „jedno okno” | (a) jedno przypięcie naraz (ciało albo stacja), panel statku osobno; Esc zdejmuje przypięcie (po zaznaczeniu statku, przed overlayem); (b) niezależne jak dziś | **(a)** — dziś trzy karty nakładają się (M1, 537) |
| **D-TR-6** | Dok minimalizacji | (a) znika w T4 razem z kartami; (b) zostaje na przyszłe panele | **(a)** — jedyni klienci znikają; pas dolny wolny dla chipów warstw (D-HUD-13) |
| **D-TR-7** | Panel statku przy outlinerze — geometria | (a) 300 × 300 / 360, wysunięty w lewo (x = W − 150 − 300), górna krawędź na wysokości wiersza, klamra do obszaru mapy; (b) 260 px (jak mini-panel Doku) — przeliczenie treści, golden E1/E2; (c) pełna wysokość kolumny (odrzucone w slice'ie B1) | **(a)** — treść bez zmian, tożsamość z Rejestrem z konstrukcji |
| **D-TR-8** | Panel statku, gdy prawego outlinera nie ma (klawisz „.”, overlay, rozwinięty Dok) | (a) kotwica zapasowa = dzisiejsza (prawy górny róg obszaru mapy); (b) brak panelu; (c) zaznaczenie pokazuje outliner | **(a)** |
| **D-TR-9** | Flota (węzeł) i grupa N ≥ 2 | (a) poza reformą — `FleetCommandPanel` i `FleetGroupPanel` zostają; (b) panel floty przy węźle floty; (c) grupa przy wierszu lidera | **(a)** na teraz — osobny krok po T3 · **zmieniona 2026-10-26:** (b) + (c) w idiomie etykiet z T5 — krok T6 (§6.0, §5.9) |
| **D-TR-10** | Tryb Y — dwa panele statku (542) | (a) przy rozwiniętym Doku panel statku nad mapą się nie rysuje (mini-panel Doku + „Pokaż w rejestrze”); (b) jak dziś | **(a)** |
| **D-TR-11** | Paliwo i utrzymanie w panelu statku (kompakt ich nie pokazuje) | (a) bez zmian w panelu, paliwo w rozwinięciu wiersza / etykiety (D-TR-3); (b) linia skrótu w nagłówku panelu | **(a)** |
| **D-TR-12** | Kolejność i protokół | (a) T1 → T2 → T3 → T4, cztery paczki wg §5.2; (b) T3 na początek | **(a)**, z (b) jako dopuszczalną zamianą |
| **D-TR-13** | Rozbiórka statku bez potwierdzenia (543) | (a) potwierdzenie przy przenosinach panelu; (b) bez zmian | **(a)** |
| **D-TR-14** | Klik ciała na mapie zdejmuje zaznaczenie statku, w lewym outlinerze — nie (539) | (a) wyrównać do outlinera — klik ciała nie zdejmuje statku (panel przy outlinerze nie koliduje z przypięciem); (b) wyrównać do mapy; (c) bez zmian | **(a)** |
| **D-TR-15** | Kiedy 531 i 532 | (a) 531 w T1 (rozwinięcie zastępuje podpowiedź), 532 — osobny drobny krok przed T3 (panel przy outlinerze stoi na 2. kliku z wiersza); (b) oba osobnymi drobnymi krokami od razu | **(a)** — 531 jest wyciekiem mgły wojny; jeśli T1 nie startuje od razu — (b) dla 531 |

---

## 7. Findingi #531–#543 — przyjęte 2026-10-24 do rejestru `HUD_PLAN.md` §3

> Przyjęte w całości (podpis 2026-10-24, §6.0): **531, 532 ✅** (drobny krok 2026-10-24 — `471191d` · `da8b2c9`,
> §5.4); **539, 542, 543 ✅** (T3 — `496ab80`, §5.5); **533, 536 ✅** (T1 — `fc44de7`, §5.6); **534, 537, 540 ✅** (T2 —
> `0ddbf05`, §5.7; przy `labelPin` ON); **538** — część panelu statku ✅ przy `shipPanelHud` ON (T5 — `409f82b`, §5.8);
> reszta ⚪. Rejestr
> macierzysty — `HUD_PLAN.md` §3 (tam statusy i zamknięcia); ta tabela — zapis inwentarza, kolumna „Kierunek” wg podpisów.

| # | | Treść | Kierunek |
|---|---|---|---|
| **531** | ✅ | **Podpowiedź mapy nad kolonią AI kłamie o właścicielu i zdradza populację.** `TooltipContent._planetContent` (`:146-153`) bierze kolonię z `colonyManager.getColony` (kolonie AI też tam są) i pisze „Właściciel: Imperium gracza” oraz populację, bez terminu właściciela i bez bramki wywiadu (kanon `SystemReveal.js:92` — populacja od `detailed`). Zmierzone (Polonia gy79): Akhernar h (`emp_001`, wywiad `contact`) — „Właściciel: Imperium gracza”, „Populacja: 55”. Rodzina 188, 506, 518. | ✅ drobny krok 2026-10-24 — `471191d` (§5.4); przy wywiadzie `unknown` „nieznany”, nie „Neutralne” (decyzja właściciela); w T1 rozwinięcie zastępuje podpowiedź (D-TR-2) |
| **532** | ✅ | **Drugi klik w statek zadokowany przy planetoidzie nic nie robi.** `vessel:focus` (`ThreeRenderer.js:1213-1233`) szuka miejsca postoju tylko w `_planets` i `_moons`; planetoida → brak pozycji → kamera stoi, karty brak. Zmierzone (ZF): Fracht @ Nt, Dostawca II @ Cu i Hv — kamera STOI; kontrola: planeta i księżyc — kamera + karta. Reguła D-UI-5 (2. klik = focus) martwa dla statków placówek na planetoidach — prawy outliner, Dok taktyczny, Tab. | ✅ drobny krok 2026-10-24 — `da8b2c9` (§5.4); panel przy outlinerze (T3) stoi na 2. kliku z wiersza |
| **533** | ✅ | **Podpowiedź kolonii (`#colony-3d-tooltip`) bez limitu wysokości.** Lista budynków stolicy ZF wychodzi poza okno 1041 px i przykrywa pasek nawigacji; `top = min(sy − 10, innerHeight − 250)` zakłada ≤ 250 px (`ThreeRenderer.js:3957-3958`). | T1 (D-TR-2) — ✅ T1 `fc44de7` (2026-10-26; przy `labelHover` ON — kolonię opisuje rozwinięcie etykiety, §5.6) |
| **534** | ✅ | **Esc nie zamyka karty ciała ani panelu stacji** — bez zaznaczonego statku otwiera menu ☰ (`GameScene.js:4758-4808`). Zmierzone (M3). | T2 (D-TR-5) — ✅ T2 `0ddbf05` (2026-10-26; przy `labelPin` ON Esc zdejmuje przypięcie po zaznaczeniu statku, §5.7) |
| **535** | ⚪ | **Karta ciała zminimalizowana do doku zostaje „bieżącym zaznaczeniem”** (`readClickSelection.entityId` bez warunku minimalizacji, `ClickIntentLogic.js:85`) → klik w to ciało = kamera + karta wraca; panel stacji w doku daje `select` (`:81`, T2e). Zmierzone (M4). | znika z dokiem (T4) — tylko rejestr |
| **536** | ✅ | **Trzy warstwy najechania naraz** — statek: `#colony-3d-tooltip` (od razu) + druga linia etykiety HUD + `#kosmos-tooltip` (po 500 ms); zaznaczona kolonia: K4 + K5 + K6. Zmierzone (M6). | T1 (D-TR-2) — ✅ T1 `fc44de7` (2026-10-26; przy `labelHover` ON — jedna warstwa: rozwinięcie etykiety, §5.6) |
| **537** | ✅ | **Karta ciała, panel stacji i panel statku otwierają się niezależnie i nakładają** — przy stacji na orbicie planety i statku obok trzy prostokąty leżą na sobie, karta ciała całkowicie przykryta. Zmierzone (M1). | T2 / T3 (D-TR-5) — po T3 (`496ab80`) częściowo: karta ciała i panel statku razem (D-TR-14), karta omija panel (544); reszta — T2 — ✅ T2 `0ddbf05` (2026-10-26; przy `labelPin` ON zostaje przypięcie + panel statku, §5.7) |
| **538** | ⚪ | **Literały i surowe identyfikatory na czterech powierzchniach** (klasa 113 / 495): karta — typ surowym `planetType`, `-type star`, „Luminosity”, „HZ”, „lat” w ORBICIE, złoża surowym `resourceId`; panel stacji — „Układ: sys_home” (`:228`); panel statku — etykieta rozkazu („→ MoveTo:”, „⚔ Pursue:”, „⚠ Order blocked: <slug>”, „(mission paused)”, „↻ Patrol manualny” — `FMO :8605-8649`), „📦 Cargo:” (`:7751`); podpowiedzi DOM — „wolne”, „Budynki:”, „Energia:”, „ETA … lat”, „Etap:”; `#kosmos-tooltip` — „Typ: rocky”, „[in_transit]”. `check-i18n` ich nie widzi (bez polskich znaków / surowe pola). | pola przechodzące do rozwinięć i panelu — przez `t()` w T1–T3; reszta w T4; część panelu statku ✅ przy `shipPanelHud` ON (T5 `409f82b`, §5.8) |
| **539** | ✅ | **Klik ciała na mapie zdejmuje zaznaczenie statku, klik ciała w lewym outlinerze — nie** (`GameScene._selectFromClickPick` `:6066` — gałąź kanwy bez celu). Zmierzone (M2, mapa); outliner — z kodu. | T3 (D-TR-14) — ✅ T3 `496ab80` (2026-10-25; `TABS_REFORM_PLAN.md` §5.5) |
| **540** | ✅ | **Panel stacji rysuje się i łapie klik nad otwartym overlayem pełnoekranowym** — także nad Technologiami, Dowództwem itd. (`UIManager.js:2388`, `:1983` bez `!isAnyOpen()`; zamysł S4-2 „coexist z colony”). Z kodu. | znika z panelem (T2) — ✅ T2 `0ddbf05` (2026-10-26; przy `labelPin` ON panel stacji się nie rysuje i nie łapie kliku, §5.7) |
| **541** | ⚪ | **Chip doku nie zna układu** — przywrócenie karty ciała / panelu stacji z innego układu otwiera kartę bez kotwicy (róg obszaru mapy) dla obiektu spoza kadru, bez przełączenia układu (`BottomContext.js:544-551`, `StationPanel.js:390-410`). Z kodu. | znika z dokiem (T4) |
| **542** | ✅ | **Tryb Y: dwa panele statku naraz** — mini-panel Doku taktycznego i pływający panel statku (`UIManager.js:2397` bez warunku trybu Y). Z kodu. | T3 (D-TR-10) — ✅ T3 `496ab80` (2026-10-25; `TABS_REFORM_PLAN.md` §5.5) |
| **543** | ✅ | **Rozbiórka statku bez potwierdzenia** — jeden klik „🗑 Disband” → `fleet:disbandRequest` (`FMO :2732-2736` → `ColonyManager._disbandVessel`); nieodwracalne. Z kodu. | T3 (D-TR-13) — ✅ T3 `496ab80` (2026-10-25; `TABS_REFORM_PLAN.md` §5.5) |

Przyjęte w całości — pierwszy wolny numer: **544**.

---

## 8. Czego inwentarz nie zweryfikował

- Scena walki (karta walki × panel przy outlinerze) — w ZF brak starcia; nakładanie wyliczone z geometrii.
- Tryb Y (542), chip doku z innego układu (541), panel stacji nad overlayem (540), rozbiórka (543) — z kodu.
- Garnizon i okupacja na karcie — z keeperów G3 / WP, nie w grze (podpowiedź K5 nad kolonią AI — zmierzona).
- Oscylacja najechania przy większym rozwinięciu (I8.3 w §3.1) — przewidywanie.
- Wysokości kart `[node]` — stałe wierszy dokładne, szerokości tekstu przybliżone; w grze zmierzone dwie karty.
- 1280×720 — wyłącznie geometria (bez scen z kartami); Generator (poza civMode) — poza zakresem.
- Panel statku w tranzycie warp (sekcja „W drodze”) — z kodu.
