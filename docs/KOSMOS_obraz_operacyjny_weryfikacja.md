# KOSMOS — „Obraz Operacyjny" — weryfikacja checklisty (Krok A)

**Data:** 2026-07-18 · **Status:** UKOŃCZONA (analiza bez zmian w kodzie)
**Plan źródłowy:** plan wykonawczy „Obraz Operacyjny" v1 (2026-07-17, §1 checklista 21 punktów)
**Koncepcje:** `docs/KOSMOS_koncepcja_obraz_operacyjny.md` · `docs/KOSMOS_koncepcje_reforma_zarzadzania_flota.md`

---

## 0. WERDYKT

**Architektura planu POTWIERDZONA — warunek STOP z §0 planu NIE zachodzi.** Wszystkie fundamenty
istnieją i mają zakładaną semantykę: `getVesselScreenPosition` (ThreeRenderer.js:5226),
`vessel.systemId` z `null`=tranzyt, czysty `MapLabelLogic`, wspólna selekcja UIManager,
`uiPrefs` z persist, komplet źródeł danych dla `FleetPictureLogic`.

Wykryto natomiast **8 rozbieżności szczegółowych** (§2) — żadna nie podważa architektury, ale
każda zmienia szczegół implementacji którejś fazy — oraz podjęto **2 decyzje wiążące** (§3):
mapowanie ról→glify i klawisz trybu taktycznego **`Y` zamiast `T`** (T zajęty przez Technologie).

Najważniejsze korekty w skrócie:
1. **Klawisz T zajęty** (overlay Technologie) → tryb taktyczny na **Y** (wolny, sąsiad T).
2. **Kamera nie ma tweenu kąta** — `_theta`/`_phi` zmieniają się tylko skokowo; Faza 2 musi dodać
   mały mechanizm animacji kąta w `ThreeCameraController`.
3. **Helpery screen-position zwracają px CSS**, nie „logical px" — konsument MUSI dzielić przez `UI_SCALE`.
4. **`entry.mesh` nie istnieje** — statek w `_vessels` ma jedno pole `sprite` (Group GLB lub Sprite);
   naiwne `sprite.visible=false` gasi kaskadowo insygnia/markery/labele.
5. **`vessel.status` NIE ma wartości `'damaged'`** — uszkodzenie to osobna flaga boolean `vessel.damaged`.
6. **`_computeFleetStatus` istnieje, ale w FleetManagerOverlay** (UI), nie w FleetSystem.
7. **Warstwy renderera są heterogeniczne** — „wymuszenie warstw" w trybie T wymaga jawnego re-syncu,
   a linie rozkazów w ogóle nie są przełączalną warstwą.
8. **Inline input na canvasie JUŻ istnieje** (`TradeOverlay._openQtyInput`) — wyszukiwarka rejestru
   to adaptacja, nie projekt od zera.

---

## 1. TABELA WERYFIKACYJNA

### 1.1 Model danych (pkt 1–8)

| # | Założenie planu | Stan faktyczny | Wpływ na plan |
|---|---|---|---|
| 1 | `vessel.systemId` istnieje; `null`=tranzyt; fallback `?? 'sys_home'` u odbiorców | **POTWIERDZONE.** Init `Vessel.js:143-152` (`opts.systemId ?? entity?.systemId ?? activeSystemId ?? 'sys_home'`). `null` przy warp: `VesselManager.js:770-771` (`dispatchInterstellar`), przywracany `:2197` (`_tickInterstellar`). Fallback `?? 'sys_home'`: `VesselManager.js:202,349,397,492,1073,1189`, `MovementOrderSystem.js:484`, `FleetSystem.js:159`. Tranzyt bywa też wykrywany po `mission.type==='interstellar_jump'` (`getInterstellarVessels`, `VesselManager.js:213`) | Brak zmian. Chip „🌀 tranzyt" gate'uje po `systemId===null`; `mission.type==='interstellar_jump'` jako źródło danych paska (skąd→dokąd, `galProgress`) |
| 2 | `vessel.position.state ∈ {docked,in_transit,orbiting}`; osobno `vessel.status ∈ {idle,on_mission,refueling,damaged}` (+`destroyed`) | **CZĘŚCIOWO.** `position.state` — POTWIERDZONE, dokładnie 3 wartości (`Vessel.js:155-160`). **ROZBIEŻNOŚĆ:** `status` faktycznie ∈ {`idle`,`on_mission`,`refueling`,`destroyed`} — wartość **`'damaged'` nigdy nie jest przypisywana** (komentarz w `Vessel.js:204` mylący). Uszkodzenie = boolean `vessel.damaged` (`MissionSystem.js:1553`, naprawa `VesselManager._tickRepair:1526-1541`). Wrak = `isWreck=true` **ORAZ** `status='destroyed'` + `wreckedAt` (`DeepSpaceCombatSystem.js:1144-1147` i 3 inne miejsca) | `buildShipEntry` czyta uszkodzenie z flagi `vessel.damaged`, nie ze statusu. Filtr wraków po `vessel.isWreck` (kanoniczne — tak robi `isEnemyVessel`/serialize). Osobno istnieje `vessel.combatDamage` `{hpMissing,shieldMissing}` (ubytki bojowe, brak auto-regen) — inny byt niż `damaged` |
| 3 | `mission.{type,arrivalYear,returnYear,targetX,targetY,phase,galProgress}` + typy z audytu §3 | **POTWIERDZONE pola** (struktura luźna — pola zależne od typu; `galProgress` w `VesselManager.js:2227`; `phase`: `warp_transit/in_system/returning/orbiting_body/outgoing`). **Typów misji więcej niż w audycie:** `transport`, `recon`, `colony`, `passenger`, `envoy` (abstrakcyjna, bez lotu), `foreign_recon` (ze `scope`), `exploration`, `mining`, `interstellar_jump`, `attack` (wróg/debug) + **syntetyczne** `move_to_point` i `engage` tworzone przez MovementOrderSystem (`MovementOrderSystem.js:546,758`) | Macierz smoke Fazy 0 obejmuje pełną listę (12 typów + null). `buildShipEntry` musi mieć deterministyczny fallback dla nieznanego typu (klucz generyczny) — ale zdefiniowany RAZ w FleetPictureLogic, nie per widok |
| 4 | `movementOrder.{type,status,blockReason}` + `ORDER_TYPES` w MovementOrderTypes.js | **POTWIERDZONE.** Pełny obiekt orderu: `MovementOrderSystem.js:515-539`; statusy: `active/blocked/cancelled/completed`; `_blockAndCancel` (`:1203-1208`) ustawia `blocked`+`blockReason`+emit `vessel:orderBlocked`. **ORDER_TYPES = 9 typów** (`MovementOrderTypes.js:15-25`): `moveToPoint, pursue, intercept, patrol, escort, goToPOI, engage, retreat, dock` | Plan wymieniał 5 — słownik Fazy 0 musi objąć też `goToPOI/engage/retreat/dock` (engage kluczowy dla tone=combat) |
| 5 | `getPrimaryRole()` → 7 ról; zdecydować mapowanie na 5 glifów + stacja | **POTWIERDZONE.** `Vessel.js:492-502`, dokładnie `{colony, assault, transport, warship, science, cargo, scout}`, capability-based z modułów (canColonize/troopCapacity/hasWeapons/canDoScience/canHaulCargo). Etykiety PL: `getRoleLabelPL:507-519` | **DECYZJA podjęta → §3.1** (7 ról → 5 glifów + ◈ stacja; `role` w entry zostaje 7-wartościowe) |
| 6 | Alerty: `vessel:strandedNoFuel`, `isImmobilized()`, `unpaidYears`, `_awaitingFuel`, `damaged`, order `blocked`; wykrywanie walki | **POTWIERDZONE wszystkie.** `vessel:strandedNoFuel {vesselId,name}` (`VesselManager.js:469`, tylko statki gracza, flaga `_strandedNotified` in-memory). `isImmobilized(vessel)` = **metoda VesselManager** (`:1706-1709`, `unpaidYears ≥ UPKEEP_GRACE_YEARS=2`). `_awaitingFuel` (`:1558+`, NIE serializowana). `damaged` boolean (pkt 2). Blocked: `movementOrder.status==='blocked'`+`blockReason`. Walka: `FleetManagerOverlay._isVesselInCombat` (`:61-69`, prywatny helper) — kanoniczne API to `DeepSpaceCombatSystem._findActiveEncounterContaining(vesselId)` (`:1160-1166`) | `collectAlerts` dostaje w `ctx` referencje `vesselManager` + `dscs` (combat-check przez API DSCS, NIE kopia helpera z overlay). ⚠ endurance zamrożony (`FEATURES.enduranceDrainActive=false`) — alerty endurance nie odpalają, nie uwzględniać w hierarchii do M4 P4 |
| 7 | `fleetSystem.listFleets()`, `fleet.memberIds`, `activeOrder.arrivalSyncYear`, `_computeFleetStatus` | **POTWIERDZONE 3 pierwsze:** `FleetSystem.js:454` / `Fleet.js:34` (authoritative; `vessel.fleetId` = mirror, zakaz ręcznej mutacji) / `FleetSystem.js:226`. **ROZBIEŻNOŚĆ lokalizacji:** `_computeFleetStatus(fleet)` istnieje w **`FleetManagerOverlay.js:3006`** (UI; zwraca gotowe `{label,color}` z i18n+THEME wg `activeOrder.type`), NIE w FleetSystem | FleetPictureLogic definiuje WŁASNĄ czystą agregację statusu floty (klucze i18n, nie stringi) — overlayowy helper trafia na listę długu §4 (migracja później). Doktryny: `FleetDoctrines.js` (engage_in_range/kite/hold_position/retreat_at_50) |
| 8 | `timeSystem.gameTime` = bieżący rok | **POTWIERDZONE.** `TimeSystem.js:19,74` (float, lata gry); dostęp `window.KOSMOS.timeSystem` (`GameScene.js:326`). Brak akumulatora civYears — `time:tick` niesie `civDeltaYears = deltaYears × CIV_TIME_SCALE(12)`. ETA misji (`arrivalYear` itd.) są w **latach gry** — spójne z `gameTime` | Brak zmian. ⚠ Znalezisko poboczne: `FleetSystem._currentYear()` czyta **nieistniejące** `timeSystem.currentYear` → `fleet.createdYear` zawsze 0 (§5) |

### 1.2 Renderer 3D (pkt 9–14)

| # | Założenie planu | Stan faktyczny | Wpływ na plan |
|---|---|---|---|
| 9 | `getVesselScreenPosition(vesselId)` → `{x,y}` logical px, null za kamerą; analogi dla body/station/labels | **POTWIERDZONE istnienie i null-semantyka** (`ThreeRenderer.js:5226-5237`, NDC z-clamp → null, bez clampu do ekranu); `getStationScreenPosition:2778`, `getBodyScreenPosition:2795` (getWorldPosition — księżyce zagnieżdżone), `getAllVisibleLabels:2836` (bramkowana `_showAllLabels` (CTRL) + fog-of-war `'?'`). **ROZBIEŻNOŚĆ:** zwracają **px CSS** oparte na `window.innerWidth/Height` — bez UI_SCALE i bez DPR. Wzorzec konsumenta: `pos.x / UI_SCALE` (`UIManager.js:2053,2070-2072`); DPR załatwia transform płótna (`UIManager.js:1676`) | `gatherVesselLabels` MUSI dzielić przez `UI_SCALE` (identycznie jak MapLabelLayer robi dla kolonii) — bez tego rozjazd na każdej rozdzielczości ≠1280×720. `getAllVisibleLabels` NIE nadaje się jako źródło pozycji warstwy (gate CTRL) — własny zbieracz |
| 10 | Wzorzec „stały rozmiar ekranowy" w `_syncEnemyAlertMarkers` | **POTWIERDZONE** (`ThreeRenderer.js:5845-5884`): `m.scale.setScalar(pulseScale × max(0.5, camPos.distanceTo(m.position) / ALERT_MARKER_REF_DIST))`; stałe `:87-89` (SCALE=0.7, REF_DIST=60). Marker = `THREE.Sprite` w osobnej mapie, pozycjonowany do `entry.sprite.position`, sync **per-frame** (pętla `:3296`) | Wzorzec do wzięcia wprost dla glifów trybu T. Uwaga: `_syncInsignia` ma skalę STAŁĄ (nie kompensuje dystansu) — wzorcem jest alert marker, nie insygnia |
| 11 | Sprite-fallback per-statek wymuszalny w runtime; struktura `entry.mesh`/`entry.sprite` | **ROZBIEŻNOŚĆ (przewidziana pytaniem planu).** `_addVesselSpriteFallback` (`:3711`) istnieje, ale odpala się TYLKO po podwójnej awarii ładowania GLB — **nie ma runtime-toggle**. Entry w `_vessels`: **jedno pole `sprite`** (wrapper `Group` GLB z `isModel3D:true` LUB billboard `Sprite`; `:3594-3600`) — `entry.mesh` NIE istnieje. `entry.sprite.visible=false` gasi kaskadowo: insygnia (`:5779`), alert markery (`:5859`), labele (`:2884`) — wszystkie bramkują po `.visible` | Faza 2: glif = **DODATKOWY billboard** (osobna mapa, wzorzec `_syncEnemyAlertMarkers`) + ukrycie **wewnętrznego dziecka-modelu** wrappera (traverse `entry.sprite.children`), NIE wrappera. Model w cache szablonów — odwracalne w 1 klatkę, ale to nowy kod, nie gotowy przełącznik |
| 12 | Warstwy: `fcOrderLines`, `m4SensorOverlay`, `predictionCone`, `poiSystem`, `fcInsignia`, `fcEnemyAlertMarker` + bramki intel | **POTWIERDZONE flagi** (wszystkie ON w GameConfig). **Niuanse:** tylko sensor overlay ma toggle `uiPrefs.sensorOverlayVisible` (`:5119`); insygnia+alertMarker sync **per-frame** (`:3295-3296`); sensor+cones **event-driven** (`physics:updated`/`vessel:positionUpdate`, `:512,593-594`); **linie rozkazów NIE są warstwą** — `routeLine` pieczony per-statek przy tworzeniu/ruchu (`fcOrderLines` steruje tylko kolorem przez `_orderLineColor:5698`). Bramki intel: `_isEnemyEndpointVisible` (≥contact, `:5257-5263`) / `_isEnemyTargetable` (≥rumor, `:5268-5274`), quality z `intelSystem.getVesselContact` | Faza 2 „wymuszone warstwy": po wejściu w tryb **jawny re-sync** (emit `ui:sensorOverlayToggle` / bezpośrednie `_syncSensorOverlay()`), inaczej warstwy event-driven pojawią się dopiero na następnym ticku. Linii rozkazów nie da się „włączyć" globalnie bez zmian — są zawsze (per misja/order) |
| 13 | Preset top-down: czy `frameSystem` + dolot `vessel:focus` wystarczą | **ROZBIEŻNOŚĆ ISTOTNA.** Stan sferyczny: `_theta/_phi/_dist` (`ThreeCameraController.js:21-27`). `update()` (`:107-125`) lerpuje **TYLKO** `_dist` (0.08) i `_target` — **kąty NIE są nigdzie animowane**: drag inkrementalnie, `frameSystem` (`:147-156`) i `resetToCenter` (`:139-142`) SNAP-ują. `vessel:focus` (`ThreeRenderer.js:878-911`) = instant target + lerp zoomu, kąty nietknięte | Faza 2 slice 1 dodaje mały mechanizm animacji kąta (`_goalPhi`/`_goalTheta` + lerp w `update()`) + zapis/przywrócenie `{_theta,_phi,_targetDist,_target}`. Preset celuje w `_phi≈0.1`, NIE 0 (degeneracja `lookAt`; clamp 0.1–0.9π istnieje tylko w dragu). Nadal render-only — zmiana mała, ale NOWA |
| 14 | `getCameraMoveEpoch()` + `_dirty` w UIManager | **POTWIERDZONE.** Epoch counter: `moveEpoch++` gdy pozycja kamery zmienia się >1e-8 (`ThreeCameraController.js:118-124`); `getCameraMoveEpoch` (`ThreeRenderer.js:2825`). Pętla `UIManager._startDrawLoop` (`:1651-1671`): redraw gdy `_dirty \|\| _animating \|\| timeDirty(≥10fps przy biegu) \|\| cameraMoved`. `_dirty` = goła flaga przypisywana w ~40 miejscach | Brak zmian — warstwy Obrazu Operacyjnego dostają odświeżanie „za darmo" przy ruchu kamery i biegu czasu; przy pauzie+bezruchu trzeba pamiętać o `_dirty=true` po zmianach selekcji/intel (istniejący wzorzec) |

### 1.3 Warstwa UI (pkt 15–21)

| # | Założenie planu | Stan faktyczny | Wpływ na plan |
|---|---|---|---|
| 15 | `MapLabelLayer.draw(ctx,tr,W,H,uiScale)` + czyste `labelLOD`/`stackLabels`; gate `civMode && mapLabels && !isAnyOpen() && !globeOpen` | **POTWIERDZONE.** Sygnatura `:46`; `labelLOD(dist)` → `{plaqueAlpha,markerAlpha}` (progi 150/215/300/360, `MapLabelLogic.js:19-29`); `stackLabels(items,gap)` `:53` — czyste, node-importowalne (nagłówek `:1-6`). Gate dokładnie jak w planie + guard `tr` (`UIManager.js:1853-1856`); klik warstwy PRZED overlayManager (`:1484-1485`). Zbiera kolonie (`getPlayerColonies`) + stacje gracza; statków NIE | Zgodnie z planem: dochodzi `gatherVesselLabels` + osobny `vesselLabelLOD` (progi kolonii nietykane). Wzorzec klikalności stacji (`station:selected`+`station:focus`, `MapLabelLayer.js:204-205`) gotowy do skopiowania dla plakietek statków |
| 16 | Selekcja: `setSelectedVesselId/getSelectedVesselIds/toggleSelection/setSelectedFleetId` + `ui:selectionChanged`, `vessel:focus` | **POTWIERDZONE komplet** (`UIManager.js:365-479`; też `addToSelection/removeFromSelection/cycleSelectedVessel/clearSelection`; `_selectedVesselIds` Set + lead; add filtruje własne żywe). `ui:selectionChanged {vesselId, vesselIds[], prevVesselId}` (`:390,402,412`); `vessel:focus {vesselId}` — jedyny odbiorca `ThreeRenderer.js:878` (kamera) | Brak zmian |
| 17 | FleetManagerOverlay: `_drawLeft/_drawCenter/_drawRight`, `LEFT_W=260/RIGHT_W=200`, scroll+clip+culling, `_hitZones`, wzorzec przełącznika | **POTWIERDZONE.** Stałe `:133-135` (+`TAB_H=28`); 5 zakładek: `stratcom/tactical/shipyard/ground/atlas` (`:645-651`, default `tactical` `:322`); `_drawLeft:2045` / `_drawCenter:3244` / `_drawRight` (`:604-606`); clip+scroll+culling `:2259-2358`; `_hitZones` `{x,y,w,h,type,data}`, hit-test REVERSE (top-most first, `:718-724`), tab-wzorzec: `_drawTabBar:634` + `_switchTab:470` + hitZone `type:'tab'`. Hardcode PL potwierdzony: `'WROGIE JEDNOSTKI'`/`'WRAKI'` (`:2177,:2181`) + `'wrogi'/'nasz'` (`:2386`), `'zniszczony: rok'` (`:2392`), `'◈ w hangarze/⊙ na orbicie/→ w locie'` (`:2457-2459`) | `[MAPA]/[REJESTR]` jako wewnętrzny segmented-control wzorem `_drawTabBar` (stan `_tacticalView`). ⚠ `_drawLeftTabs:2669`/`_drawLeftFleets:2696` = martwy kod poprzedniej iteracji (komentarz `:2048`) — nie wzorować się, kandydat do sprzątnięcia. i18n sekcji wroga/wraków dodać przy Fazie 3 (nie powielać hardcodu) |
| 18 | Pole tekstowe: ModalInput / DOM; inline input na canvasie „raczej nie ma — zaprojektuj" | **ROZBIEŻNOŚĆ na korzyść planu:** inline input **JUŻ ISTNIEJE**. `ModalInput.js` = modal DOM (Promise, z-index 100, Enter/Escape, stopPropagation, cleanup). **`TradeOverlay._openQtyInput` (`:52-123`)** = inline `<input type="number">` pozycjonowany NAD polem canvasa (skala `min(innerW/1280, innerH/720)`, `position:fixed`, z-index 300, Enter=commit/Escape=cancel/blur=commit, pełny cleanup); analog w EconomyOverlay (safety stock). RightClickMenu: DOM z-index 9999, boundary-flip, click-outside przez `setTimeout(0)`+`{once:true}` | Wyszukiwarka rejestru (Faza 3) = adaptacja wzorca `_openQtyInput` (`type="text"`, commit on-input zamiast on-enter) — projektowanie od zera zbędne |
| 19 | `uiPrefs` — gdzie żyje, jak persystowany | **POTWIERDZONE.** Init `main.js:20-23`; serialize CAŁOŚCI spreadem `SaveSystem.js:96-97`; restore merge nad defaultami `GameScene.js:228-230`; migracja v70 tylko dla historycznych kluczy. Znane klucze: `sensorOverlayVisible`, `miniMapVisible`, `battleAutoFocus`, `combatFxVisible`, `selectedFleetId` | **Nowe klucze uiPrefs NIE wymagają migracji save** (spread+merge: brak klucza w starym save → default z `main.js`). W pełni zgodne z regułą „zero zmian w sim/save" |
| 20 | Zmapować helpery statusu do konsolidacji | **POTWIERDZONE + zmapowane — pełna lista w §4.** Skrót: 7 formatterów typu misji, 9 formatterów stanu, `_drawMovementOrderLabel` + **`OrderTargetInfo.js` — już skonsolidowany** helper (ikona rozkazu + cel + mgła wojny + dystans; współdzielony przez 3 panele) | `OrderTargetInfo` = dowód, że wzorzec konsolidacji działa w tym repo — FleetPictureLogic jest jego rozszerzeniem na status/misję/ETA/alerty. Migracja stopniowa wg §4 (bez zmian w Fazie 0) |
| 21 | Czy `T` wolny (H=reset, M=minimapa, F=Command, CTRL=labels) | **ROZBIEŻNOŚĆ KRYTYCZNA: T ZAJĘTY** — `'t': 'tech'` (`OverlayManager.js:23`, primary klawisze TopBaru). Ponadto: **H = overlay Kolonia** (keymap ma priorytet — reset kamery H NIE działa w civMode), **M = Fleet/Stratcom** (minimapa bez skrótu, komentarze „klawisz M" nieaktualne), dyplomacja na **D** (nie Y). Pełna mapa: C/E/H/P/D/F/T primary + I/W/G/U/O/L/N/M/K + Tab/CTRL/Space/1-5/[]. **Wolne: a, b, j, s, v, x, y, z** (+ q, r w civMode) | **DECYZJA → §3.2: tryb taktyczny na `Y`** (w pełni wolny, fizyczny sąsiad T na QWERTY). Wpis do MANUAL.md przy Fazie 2 |

---

## 2. ROZBIEŻNOŚCI — SZCZEGÓŁY I KOREKTY PLANU

**R1 · Klawisz T zajęty (pkt 21).** `t` otwiera overlay Technologie (primary klawisz TopBaru — nie do
ruszenia bez łamania pamięci mięśniowej gracza). Decyzja: **Y** (§3.2). Przy okazji sprostowanie mapy
klawiszy w planie: H=Kolonia (nie reset kamery), M=Stratcom (nie minimapa), D=dyplomacja (nie Y).

**R2 · Brak tweenu kąta kamery (pkt 13).** Żaden istniejący mechanizm nie animuje `_theta/_phi` —
płynne przejście do top-down i z powrotem wymaga dodania `_goalPhi/_goalTheta` + lerp w
`ThreeCameraController.update()` oraz snapshot/restore stanu sferycznego. Zmiana mała i render-only,
ale to NOWY kod, nie „wykorzystanie mechanizmu dolotów". Preset: `_phi≈0.1` (nie 0).

**R3 · Screen-position w px CSS (pkt 9).** `getVesselScreenPosition` i analogi zwracają px z
`window.innerWidth/Height`. Kontrakt dla `gatherVesselLabels`: pozycje dzielone przez `UI_SCALE`
(wzorzec `UIManager.js:2070-2072` i sam MapLabelLayer). DPR nie dotykać (transform płótna).

**R4 · Reprezentacja statku: jedno pole `entry.sprite` (pkt 11).** Brak `entry.mesh`; brak
runtime-przełącznika GLB→sprite. Glify trybu T: dodatkowy billboard w osobnej mapie (wzorzec
`_syncEnemyAlertMarkers`) + ukrycie wewnętrznego dziecka-modelu (nie wrappera — wrapper niesie
pozycję dla wszystkich nakładek i bramki `.visible` insygniów/markerów/labeli).

**R5 · `vessel.status` bez `'damaged'` (pkt 2).** Enum faktyczny: `idle/on_mission/refueling/destroyed`.
Uszkodzenie: flaga `vessel.damaged` (katastrofy misji, naprawa w stoczni) — osobno od
`vessel.combatDamage` (ubytki HP/tarcz po bitwie). Słownik Fazy 0 rozróżnia oba (alert „uszkodzony"
z `damaged`; ewentualny przyszły alert „poobijany" z `combatDamage` — poza zakresem v1).

**R6 · `_computeFleetStatus` w UI (pkt 7).** Istnieje w `FleetManagerOverlay.js:3006` i zwraca gotowe
`{label,color}` — czyli dokładnie to, czego FleetPictureLogic ma NIE robić (render tłumaczy).
FleetPictureLogic definiuje agregację statusu floty od nowa (klucze i18n + tone); overlayowy helper
→ lista długu §4.

**R7 · Heterogeniczne warstwy renderera (pkt 12).** „Wymuszone warstwy" trybu T muszą: (a) dla
sensor ringów — ustawić flagę wymuszenia i **jawnie** wywołać re-sync (event-driven); (b) dla
prediction cones — jw.; (c) linie rozkazów — nic nie robić (zawsze są, nie są warstwą); (d) insygnia/
alert markery — nic (per-frame). Mechanizm „forced overrides" = mały obiekt stanu czytany przez
istniejące `_sync*` — bez duplikacji renderu. Dodatkowo dim kosmetyki NIE może nadpisywać
`material.opacity` wrogów — system intel (`_applyVesselIntelVisibility`, `_origOpacity` w
`mat.userData`) już nim zarządza; dim musi być komponowany (mnożnik), a bloom-pass (exhaust/wraki,
`BLOOM_LAYER=1`) wygaszany świadomie (`visible`, nie tylko materiał).

**R8 · Inline input istnieje (pkt 18).** `TradeOverlay._openQtyInput` + analog w EconomyOverlay —
wyszukiwarka rejestru to adaptacja gotowego wzorca (commit `47e3e65`).

---

## 3. DECYZJE WIĄŻĄCE

### 3.1 Mapowanie ról → glify (`ROLE_GLYPHS`, pkt 5)

7 ról `getPrimaryRole()` → 5 glifów koncepcji + glif stacji (mapowanie wiele-do-jednego;
pole `role` w `buildShipEntry` zachowuje pełną 7-wartościową rolę — rejestr/tooltip mogą
rozróżniać tekstem, glif jest celowo zgrubny):

| Rola | Glif | Uzasadnienie |
|---|---|---|
| `transport` | □ | koncepcja §2.1 |
| `cargo` | □ | propozycja planu (frachtowiec = transportowiec wizualnie) |
| `warship` | △ | koncepcja §2.1 („bojowy") |
| `assault` | △ | propozycja planu (desantowiec uzbrojony = bojowy; rozróżnienie tekstem roli) |
| `science` | ◇ | koncepcja §2.1 |
| `scout` | ○ | koncepcja §2.1 |
| `colony` | ⬠ | koncepcja §2.1 |
| *(stacja — encja, nie rola)* | ◈ | Station entity (`type='station'`), poza `getPrimaryRole` |

### 3.2 Klawisz trybu taktycznego: **`Y`** (pkt 21)

`T` zajęty (Technologie, primary). Wybór `Y`: w pełni wolny (brak w keymapie i w `GameScene`
keydown), fizyczny sąsiad `T` na QWERTY (pamięć mięśniowa „obok T"), brak konfliktu z niczym.
Rejestracja w `GameScene` keydown (jak Tab — tryb, nie overlay), gate `civMode +
FEATURES.tacticalMode`. Wpis do MANUAL.md w Fazie 2. Fallback gdyby Y okazał się niewygodny
w playteście: `j` / `v` / `x` / `z`.

---

## 4. DŁUG KONSOLIDACYJNY — miejsca docelowo czytające z `FleetPictureLogic` (pkt 20)

Migracja STOPNIOWA (nie w Fazie 0 — wtedy tylko ta lista). `OrderTargetInfo.js` zostaje osobnym,
już-skonsolidowanym helperem celu/mgły wojny (FleetPictureLogic może go wołać, nie dublować).

**A) Formatery typu misji (7 kopii):**
| Miejsce | Co formatuje |
|---|---|
| `FleetManagerOverlay.js:222` `_missionTypeIcon` (module) | typ → emoji |
| `FleetManagerOverlay.js:235` `_missionTypeLabel` (module) | typ → i18n |
| `FleetManagerOverlay.js:7832` `_missionTypeName` (metoda) | typ → i18n (DUPLIKAT z innym zestawem: +transit/foreign_recon/exploration) |
| `FleetTabPanel.js:112` `_missionLabel` | typ → i18n key |
| `FleetTabPanel.js:2226` `typeNames` (inline) | typ → i18n (podzbiór) |
| `NavPeekProviders.js:42` `_missionLabel` | typ → i18n (`'fleet.missionType'+suf`) |
| `MissionEventModal.js:55` `_missionTypeLabel` | typ → i18n (raporty) |

**B) Formatery stanu statku (9 miejsc; domeny obce — kurier/wojna/jednostki naziemne — poza migracją):**
| Miejsce | Co formatuje |
|---|---|
| `FleetManagerOverlay.js:7532` `_statusText(vessel)` | pełna logika: docked/orbiting/in_transit + awaitingFuel/refueling/stranded/awaitingHousing |
| `FleetGroupPanel.js:44-48` `STATUS_KEY` | state → i18n |
| `FleetCommandPanel.js:47-49` `STATUS_*` | DUPLIKAT powyższego |
| `FleetTabPanel.js:2064` `statusLabel` (inline) | state → i18n |
| `FleetManagerOverlay.js:2457-2459` (inline, wiersz wroga) | hardcode PL |
| *(poza migracją: `StationPanel.js:33` kurier · `ColonyOverlay.js:1561`/`PlanetScene.js:835` jednostki · `WarOverlay.js:119` wojna)* | inne domeny |

**C) Etykieta rozkazu ruchu:**
| Miejsce | Co formatuje |
|---|---|
| `FleetManagerOverlay.js:7581` `_drawMovementOrderLabel` | ikona+label rozkazu (w tym blocked) |
| `FleetManagerOverlay.js:3006` `_computeFleetStatus` | status floty → `{label,color}` (R6) |
| `OrderTargetInfo.js` (`getOrderTargetInfo/ORDER_ICON/targetDisplayName`) | **już skonsolidowany** — wzór, nie dług |

---

## 5. ZNALEZISKA POBOCZNE (poza checklistą; bez zmian w kodzie teraz)

1. **Bug: `FleetSystem._currentYear()` (`FleetSystem.js:626-628`)** czyta `timeSystem.currentYear`,
   które NIE istnieje (jest `gameTime`) → zawsze 0 → `fleet.createdYear` nowych flot = 0.
   Tani fix jednolinijkowy — do decyzji Filipa, poza zakresem tego pakietu.
2. **`H` w civMode nie resetuje kamery** — keymap (`'h'→colony`) konsumuje klawisz przed
   `switch(e.code)` w GameScene. Reset kamery w civMode jest faktycznie NIEOSIĄGALNY z klawiatury.
   Nie ruszamy w tym pakiecie; warto odnotować w MANUAL.md.
3. **Nieaktualne komentarze „klawisz M"** w `main.js:22` i `GalacticMiniMap.js:35-36` (M = Stratcom).
4. **NavPeekCards są zacommitowane** (wpis w pamięci projektu „NIEZACOMMITOWANE" nieaktualny);
   working tree kodu źródłowego czysty — tylko untracked docs/makieta.
5. **Endurance zamrożony** (`FEATURES.enduranceDrainActive=false`) — alerty endurance poza
   hierarchią alertów v1 (wrócą przy M4 P4).
6. **Dwa baki**: `vessel.fuel` (in-system) + `vessel.warpFuel` — stranding/`_awaitingFuel` dotyczą
   TYLKO in-system; `buildShipEntry.warpFuelPct` czyta `warpFuel.current/max` (null gdy brak baku).
7. **Kanał przełączenia układu (Faza 1 pkt 5)**: `starSystemManager.switchActiveSystem(systemId)` →
   emit `system:switched {systemId, star}` (`StarSystemManager.js:135-165`). Guard: nieznany układ →
   `false` (chipy dotyczą tylko układów z naszymi statkami = wygenerowanych, więc OK).

---

## 6. WPŁYW NA FAZY — delta względem planu v1

**Faza 0 (FleetPictureLogic):** kontrakt bez zmian architektonicznych; doprecyzowania źródeł:
`state=vessel.position.state`, uszkodzenie=`vessel.damaged` (flaga), wrak=`isWreck`,
walka=`dscs._findActiveEncounterContaining` przez `ctx`, immobilized=`vesselManager.isImmobilized(v)`,
pełna macierz misji (12 typów) i rozkazów (9 typów), ETA w latach gry (`gameTime`).
Agregacja statusu floty pisana od nowa (R6).

**Faza 1 (M1-light):** pozycje przez `/UI_SCALE` (R3); własny zbieracz (nie `getAllVisibleLabels`);
chip układu → `switchActiveSystem`; wzorzec klikalnej plakietki ze stacji (`MapLabelLayer.js:204`).

**Faza 2 (tryb T):** + mały tween kąta w ThreeCameraController (R2); glif = dodatkowy billboard +
ukrycie dziecka-modelu (R4); forced overrides z jawnym re-sync (R7); dim komponowany z intel-opacity
i świadomy bloom-passu (R7); klawisz **Y** (R1).

**Faza 3 (rejestr):** przełącznik wzorem `_drawTabBar`/`_switchTab`; wyszukiwarka wzorem
`TradeOverlay._openQtyInput` (R8); przy okazji i18n sekcji wroga/wraków (pkt 17) — bez powielania
hardcodu; kolumna Stan/Zadanie z `buildShipEntry`, nie z `_statusText`.

---

## 7. DoD FAZY 0 — WYKONANIE (2026-07-18, Krok C wg Aneksu A planu v1.1)

**Commit poboczny (dyspozycje A.7):** `3284777` — fix `FleetSystem._currentYear()`
(`currentYear`→`gameTime`; mini-smoke `tmp_fleetsystem_currentyear_smoke.mjs` 5/5) + wpis
backlogowy `#H-reset-kamery` w `docs/ROADMAP.md` §4 (DEFERRED).

**Faza 0 UKOŃCZONA** — `src/ui/FleetPictureLogic.js`:
- **Slice 0a** `97e2beb` — ROLE_GLYPHS (A.1) · STATUS_TONES (nazwy tokenów THEME, rozwiązanie
  przez `toneColor(tone, theme)` — moduł bez importu ThemeConfig) · TONE_PRIORITY + `worstTone` ·
  ALERT_KINDS (hierarchia 1/2/3) · `buildShipEntry` (jedna funkcja priorytetów tonu; aktywność
  jako klucz i18n; ETA firm/moving; `systemId` null=tranzyt; wrak→`excluded:true`; wróg→alerts
  puste) · `collectAlerts` · i18n `fleetPicture.*` PL+EN (37 kluczy).
- **Slice 0b** `5abea3a` — `clusterScreenPoints` (union-find, histereza 44/56, `opts.prev`
  jako akumulator in/out) · `buildTimelineRows` (paski `mission-<typ>`/`return`/`warp`,
  fallback sync-ETA floty, guard pasków zdegenerowanych).

**Smoke:** `tmp_fleetpicture_smoke.mjs` **81/81 PASS** (macierz A.2: 3 state × 4 status ×
13 misji × 10 rozkazów = 1560 kombinacji bez `undefined`; role/glify; priorytety tonów;
hierarchia alertów; ETA; histereza symulowana 5 klatkami; oś czasu; i18n completeness PL/EN).
Regresja: `tmp_nav_peek_providers` 44/44 · `tmp_nav_peek` 55/55 · `tmp_fc_command` 10/0 ·
`tmp_slice8b` 51/0 · `tmp_fleet_p2` 28/0 · `tmp_fleetsystem_currentyear` 5/5.
⚠ `tmp_fleet_p1`/`tmp_fleet_p3` padają IDENTYCZNIE przed i po zmianach — stale testy migracji
save v72/v73 rozbijają się o celowy break v75→v76 ze Slice 1 („Rozpocznij nową grę") —
pre-existing staleness, nie regresja tego arca.

**Wpis o migracji (wymóg DoD §2 planu):** obowiązującą listą helperów do stopniowej migracji
na `FleetPictureLogic` jest **§4 tego dokumentu** (A: 7 formatterów typu misji · B: formattery
stanu · C: etykiety rozkazu + `_computeFleetStatus`). Żadnej migracji nie wykonano teraz
(zgodnie z planem); migracja stopniowa w Fazach 1–3, `OrderTargetInfo` pozostaje osobnym
skonsolidowanym helperem.

**Bez flagi FEATURES w Fazie 0** — moduł nie jest importowany przez żaden plik runtime
(zero kosztów, zero zmian zachowania gry); pierwszy konsument (Faza 1) wchodzi za
`FEATURES.fleetMapLabels`. Zero zmian sim/save.
