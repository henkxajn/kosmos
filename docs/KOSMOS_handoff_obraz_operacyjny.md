# HANDOFF — „Obraz Operacyjny" floty (M1 + tryb Y + rejestr K3) + mini-arc Polish

**Data:** 2026-07-18 · **Tag:** `obraz-operacyjny-v1` · **Save:** v90 — FORMAT NIETKNIĘTY przez
cały arc (zero migracji; jedyny persist = `uiPrefs.fleetMapLabelsVisible`, spread+merge).
**Dokumenty:** plan `docs/KOSMOS_plan_obraz_operacyjny_v1.md` (v1.1 + Aneks A wiążący) ·
weryfikacja+raporty `docs/KOSMOS_obraz_operacyjny_weryfikacja.md` (§1–§10.4 — TU jest wszystko) ·
checklisty `docs/obraz-operacyjny-faza{1,2,3}-playtest.md` + `obraz-operacyjny-polish-playtest.md`.

## Stan (wszystko na main, po push)

- **Faza 0** — `FleetPictureLogic.js`: JEDEN słownik (ROLE_GLYPHS 7 ról→5 glifów+◈ ·
  STATUS_TONES=nazwy tokenów THEME + `toneColor(tone, THEME)` · ALERT_KINDS 1/2/3 ·
  `buildShipEntry` · `collectAlerts` · `clusterScreenPoints` histereza 44/56 z `opts.prev`
  in/out · `buildTimelineRows`). i18n `fleetPicture.*` PL+EN.
- **Faza 1** — plakietki flot/klastrów + strzałki krawędziowe + chipy układów na mapie 3D
  (`FEATURES.fleetMapLabels` ON + `uiPrefs.fleetMapLabelsVisible`, menu ☰ „Plakietki floty").
  1e: sprite'y wracają po `switchSystem` (`_restoreActiveSystemVesselSprites`), fade klastrów
  usunięty, `systemDisplayName` (rejestr→gwiazda→id), chip aktywny „◉".
- **Faza 2** — tryb taktyczny **Y** (`FEATURES.tacticalMode` ON): lerp kątów kamery
  (snapshotView GOAL-AWARE/flyTo, drag przerywa), TacticalModeController (wymuszenie warstw =
  flaga + JAWNY re-sync; auto-exit przy overlayu; restore 1:1), glify-billboardy (ukrywane
  TYLKO dzieci wrappera GLB), duchy ETA (`~rok`+puls dla moving), 2g: warstwa nawigacyjna
  ZAMIAST dimu (orbity 0.55 + siatka 0.05 + chevrony + tiki `+N` z `orbitalPositionAtDelta` —
  ten sam łańcuch KeplerMath co PhysicsSystem + znacznik ⏱ celu zaznaczonego statku).
- **Faza 3** — rejestr K3 (`FEATURES.fleetRegistry` ON): pod-widok [MAPA]/[REJESTR] w SYSTEM
  TACTICAL; `FleetRegistryLogic` (wiersze TYLKO z buildShipEntry; sort 9 kolumn; filtry
  układ×rola×szukajka; `groupRows` flota/układ/brak) + `TimelineLayout` (oś READ-ONLY).
- **Mini-arc Polish:** 2h tiki w skali ekranu · 3e pełna szerokość + grupowanie + prawy panel
  `REGISTRY_RIGHT_W=300` (per-widok) · 3f wraki/kontakty (**ZMIANA KONTRAKTU: `excluded`
  USUNIĘTE → wrak=pełny wpis `isWreck:true`**; kontakty intel-gated, rumor=„?", ZERO akcji;
  klik wraku → raport bitwy w prawym panelu) · 3g **`FEATURES.commandTacticalMap` OFF
  (default)** — rejestr domyślną treścią tactical, kod mapy 2D NIETKNIĘTY ·
  Fix 1 `9a16869` pasek „Przypisz (N)" w rejestrze · Fix 2 `76cb53e` declutter tików
  (`orbitTicksVisible`, `TICK_MIN_ORBIT_PX=120`).
- **Decyzja obowiązująca:** rejestr NIE wydaje rozkazów (monitoring+selekcja; „Przypisz (N)"
  jedyną akcją zbiorczą); rozkazy w prawym panelu i na mapie 3D.

**Flagi (GameConfig.FEATURES):** `fleetMapLabels: true` · `tacticalMode: true` ·
`fleetRegistry: true` · `commandTacticalMap: false` (okres próbny deprecjacji mapy 2D).

## Architektura — FleetPictureLogic i konsumenci

`FleetPictureLogic` (czysty, node-importowalny; świat przez `ctx = {gameYear, fleetSystem,
combatCheck→DSCS._findActiveEncounterContaining, isImmobilized→VesselManager, lowFuelPct}`)
— TWARDA REGUŁA: żaden widok nie liczy glifu/tonu/ETA/alertu sam. Konsumenci:
1. **Etykiety mapy** — `MapLabelLogic.gatherVesselLabels` (+`toLogicalPx` — px CSS ÷ UI_SCALE!)
   → `MapLabelLayer.drawVesselLabels` (klastrowanie histerezą, plakietki, strzałki, chipy).
2. **Tryb Y** — `ThreeRenderer._syncTacticalGlyphs` (glify/duchy/markery orbit; per-frame,
   no-op poza trybem) + `TacticalModeController` (enter/exit) + `TacticalModeLogic` (plany,
   Kepler, reguły tików).
3. **Rejestr** — `FleetRegistryLogic.buildRegistryRows` (kinds own/wreck/contact) +
   `TimelineLayout` → `FleetManagerOverlay._drawRegistry/_drawTimelinePanel`.
GOTCHA: `systemId===null` = tranzyt — NIE używać `?? 'sys_home'` (łapie null).

## Otwarte pozycje

- **Test „tydzień bez MAPY" (3g) W TOKU** — notatki Filipa → §10.3; checklista §10.3 przed
  ewentualnym KASOWANIEM kodu mapy 2D (jedyny znany brak: skrót klik-celu-na-mapie w pickerze
  misji — lista celów prawego panelu działa).
- **Wraki/kontakty w rejestrze NIETESTOWANE live** (brak wraków w save; logika smoke 83/83+50/50)
  — zweryfikować przy naturalnej okazji (chip 💀 → klik → raport bitwy; rumor jako „?").
- **#fleetpicture-consolidation ODROCZONE** (ROADMAP §4): migracja legacy formatterów
  (lista §4 weryfikacji) na FleetPictureLogic — stopniowo, za decyzją.
- **#obraz-operacyjny-faza4 ODROCZONE** (pasek osi w trybie Y — §5 planu, osobna decyzja).
- Backlog powiązany: `#loop-resume-ux`, `#nan-resources-power-test-fastforward`,
  `#stale-smoke-fleet-p1-p3`, `#H-reset-kamery` (ROADMAP §4).

## ✅ „Dok taktyczny" — WYKONANY (Faza 4)

Zlecenie z **`docs/KOSMOS_plan_dok_taktyczny_v1.md`** ZREALIZOWANE: Krok A-lite (§11
weryfikacji) + slice'y 4a–4d (`d946915` · `f55e198` · `97e4002` · `6278770`).
Handoff arca: **`docs/KOSMOS_handoff_dok_taktyczny.md`**. Flaga `FEATURES.tacticalDock` OFF
(default). **Live-gate PENDING Filip** — checklista `docs/dok-taktyczny-playtest.md`.
Prerequisity P1/P2 (`9a16869` / `76cb53e`) potwierdzone jako wykonane w §11.1 pkt 7.

## Smoke'i (lokalne — `tmp_*` w .gitignore; uruchamiać z korzenia repo)

```
node tmp_fleetpicture_smoke.mjs        # 83/83 — słownik+macierz+klaster+oś (F0+3f)
node tmp_fleet_map_labels_smoke.mjs    # 52/52 — zbieracz/LOD/strzałki/chipy (F1)
node tmp_tactical_mode_smoke.mjs       # 44/44 — tryb Y: plany/kamera/Kepler/tiki (F2+2g+2h+Fix2)
node tmp_fleet_registry_smoke.mjs      # 50/50 — rejestr: sort/filtry/grupy/kinds/oś (F3+3e+3f)
node tmp_fleetsystem_currentyear_smoke.mjs           # 5/5 — fix createdYear
node src/testing/smoke/tmp_map_labels_smoke.mjs      # 37/37 — regresja etykiet kolonii/stacji
```
⚠ Smoke'i wymagają mocków `globalThis.localStorage` + `window` (wzorzec w plikach).
Wydajność (bench): warstwa mapy 0.073 ms/klatkę, rejestr 0.112 ms @100 statków (budżet 2 ms).
