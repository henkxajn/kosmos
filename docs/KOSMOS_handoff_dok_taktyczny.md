# HANDOFF — „Dok taktyczny" (Faza 4 Obrazu Operacyjnego)

**Data:** 2026-07-19 · **Save:** v90 — FORMAT NIETKNIĘTY (zero migracji; persist =
`uiPrefs.tacticalDockCollapsed` + `uiPrefs.tacticalDockTab`, jadą w hurtowej serializacji uiPrefs).
**Flaga:** `FEATURES.tacticalDock` — **ON (default)** (commit `8cbd2e8`). **✅ FAZA 4 PRZYJĘTA — „Dok
taktyczny" ZAMKNIĘTY W CAŁOŚCI.** Finalny live-check Filipa PASS: dok „pływa" i jest czytelny, stacja
przeżywa przełączanie układów; ostatni szlif **4f-1c** = belka zakładek jednolita z pasem.
**Następny krok = test „tydzień bez MAPY"** (dok ON jako konfiguracja docelowa) → decyzja o kasowaniu
kodu mapy 2D wg **checklisty §10.3** (`docs/KOSMOS_obraz_operacyjny_weryfikacja.md`).
**Dokumenty:** plan `docs/KOSMOS_plan_dok_taktyczny_v1.md` · Krok A-lite = §11
`docs/KOSMOS_obraz_operacyjny_weryfikacja.md` · playtest `docs/dok-taktyczny-playtest.md`.

## Koncepcja

W trybie taktycznym **Y** (i tylko w nim) na dole ekranu — półprzezroczysty **pas dowodzenia**:
lewy dok z zakładkami **[LISTA]/[OŚ]** (~70%) + prawy **mini-panel** wybranego statku (~300 px).
Dok = **czwarta soczewka** `FleetPictureLogic` — „co się dzieje TERAZ, tutaj" (bieżący układ +
tranzyt). Selekcja wspólna z mapą 3D (klik/hover odbija się natychmiast). Pełny audyt imperium
zostaje w Command/REJESTR — dok świadomie BEZ szukajki/wraków/kontaktów/grupowania.

## Stan (wszystko na main, po push)

- **Krok A-lite** (`edfae60`) — §11 weryfikacji: 7 punktów zbadanych w kodzie, architektura
  potwierdzona, brak STOP; decyzja wiążąca D2 (offset paneli, NIE supresja — plan §1.8).
- **4a** (`d946915`) — `TacticalDockLogic.js` (czysty: `buildDockRows` filtr układ+tranzyt / sort
  alerty→ETA / `computeDockLayout` / `filterDockVessels` / scroll helpers) + `TacticalDock.js`
  szkielet (pas, zakładki, zwijanie, persist, konsumpcja myszy, `getReservedHeight` = 1 źródło
  podnoszenia paneli). 6 wpięć UIManager + offset 5 paneli (FleetGroupPanel/FleetCommandPanel/
  CombatHUD/PanelDock/StationPanel) + Outliner hide (§1.8).
- **4b** (`f55e198`) — LISTA (wiersze buildShipEntry) + selekcja dwustronna (klik+ping/dwuklik
  focus/auto-scroll) + hover-podgląd. ThreeRenderer: `pingVessel` (throttled, dedykowana — NIE
  reuse `_spawnMovementPulse`), `setTacticalHoverVid` (routeLine jaśniej + puls ducha).
  GameScene: guard `isOverUI` na natywnym dblclick (D5).
- **4c** (`97e4002`) — [OŚ]: reuse `TimelineLayout`/`buildTimelineRows`, ten sam zbiór co LISTA
  (`filterDockVessels`), kolejność lane'ów = LISTY. ThreeRenderer: `setTacticalHoverYear` + marker
  „gdzie będzie planeta celu HOVEROWANEGO statku w roku X" (cyan). **#obraz-operacyjny-faza4
  ZAMKNIĘTE** (ROADMAP).
- **4d** (`6278770`) — mini-panel: single (karta + ✕ Anuluj `cancelOrder` / 🎯 Rejestr) ·
  multi/flota = agregat (ustępowanie FleetGroupPanel/FleetCommandPanel). FleetManagerOverlay:
  `open({view:'registry', focusVesselId})` czyści filtry + scrolluje rejestr do statku (Q3).
- **4f** (`0b4cfb7`) — polish po live-gate 7/9. **4f-1** pas wycentrowany ~90% (`DOCK_SIDE_GAP_FRAC=0.05`
  → wszystkie pod-rect offsetowane) + tło jaśniejsze (`TACTICAL_DOCK_BG_ALPHA`) + mini-panel 300→260 +
  podniesienie nad zegar (`TACTICAL_DOCK_CLOCK_CLEARANCE=20`; dolna krawędź pasa siada na `H-62` = górna
  krawędź paska zegara; `getReservedHeight += prześwit`, panele w lockstep). **4f-2** hover trasy pełny
  (kolor+opacity + mocniejszy puls ducha; grubość linii = knob best-effort, WebGL capuje do 1 px). **4f-3**
  CTRL+klik wiersza = `toggleSelection` (mods plumbowane w GameScene, wzór Outlinera). **4f-4** dwuklik
  zadokowanego przy STACJI → `station:focus` (else-branch vessel:focus miał tylko planety/księżyce). Smoke
  `tmp_dok_taktyczny_4f_smoke.mjs` 31/31.
- **4f-1b** (`be4517d`) — strojenie „niemal pływa": `TACTICAL_DOCK_BG_ALPHA` 0.55→0.32 + **USUNIĘTA ramka**
  pasa (górna krawędź) I przegroda mini-panelu; separacja = przyciemnienie tła + typografia (wiersze/zakładki
  bez zmian).
- **4f-1c** (`4e6bdd1`) — belka zakładek BEZ osobnego przyciemnienia (usunięty overlay `bgAlpha(0.35)`) →
  jednolite tło pasa; aktywna zakładka = sama ramka + kolor tekstu, nie ciemniejsza belka.
- **Fix znikającej stacji** (`b35c0a5`, OSOBNO) — przyczyna intermittent NIE była zniknięciem mesha, lecz
  **declutter `labelLOD`**: kamera w trybie Y/dopasowaniu układu parkuje ≥360, marker+plakietka gaśnie a GLB
  stacji sub-pikselowy → stacja „znika i wraca". Fix `stationLabelLOD` z podłogą markera
  `STATION_MARKER_FLOOR=0.9` (Filip akceptuje — spójne z `clusterAlpha=1` statków, Slice 1e). Smoke
  `tmp_map_labels_smoke.mjs` 44/44.
- **Kandydat B** (`75f5778`, potwierdzony live) — `switchSystem` gubił stacje po zmianie i powrocie do
  układu → `_restoreActiveSystemStations` (mirror restorera statków, idempotentny). Weryfikacja: Filip,
  scenariusz stacja→inny układ→powrót.

**i18n** `tacticalDock.*` PL+EN (zakładki, empty, panel, akcje). **Stałe** LayoutConfig:
`TACTICAL_DOCK_H=200` / `_PANEL_W=260` / `_TAB_H=24` / `DOCK_SIDE_GAP_FRAC=0.05` /
`TACTICAL_DOCK_CLOCK_CLEARANCE=20`; TacticalDock: `TACTICAL_DOCK_BG_ALPHA=0.32`; ThreeRenderer:
`TACTICAL_PING_*`, `ROUTE_LINE_*` (opacity/color/width), `GHOST_PULSE_HOVER_*`; MapLabelLogic:
`STATION_MARKER_FLOOR=0.9`.

## Architektura — kto co robi

- `TacticalDockLogic.js` (CZYSTY, node-test): `buildDockRows`/`sortDockRows`/`filterDockVessels`
  (JEDNO źródło zbioru LISTA↔OŚ) / `computeDockLayout` / `computePanelMode` / `canCancelOrder` /
  scroll helpers.
- `TacticalDock.js` (widok, `BaseOverlay`, trzymany przez UIManager): draw PRZED nav+control,
  klik/scroll PRZED overlayManager, hover; self-managed przez `tactical:modeChanged`.
- `FleetPictureLogic` — glif/ton/aktywność/ETA/alert/timeline (soczewka współdzielona; dok nic
  nie liczy sam).
- `ThreeRenderer` — render-only: `pingVessel`, `setTacticalHoverVid`/`setTacticalHoverYear` +
  markery (hover route/ghost/planet-year). GOTCHA: routeLine opacity WŁASNYCH = event-driven
  (trzyma się), ghost opacity = per-frame authoritative (read-in-sync).

## Weryfikacja (bez live-gate)

```
node tmp_tactical_dock_smoke.mjs   # 103/103 — logika+layout+widok+selekcja+hover+OŚ+panel+i18n
# regresje arca:
node tmp_fleetpicture_smoke.mjs        # 83/83
node tmp_fleet_map_labels_smoke.mjs    # 52/52
node tmp_tactical_mode_smoke.mjs       # 44/44
node tmp_fleet_registry_smoke.mjs      # 50/50
```
`tmp_*` w .gitignore (lokalne). ⚠ `tmp_fleet_p1/p3` padają — to znany `#stale-smoke-fleet-p1-p3`
(pre-existing, potwierdzone na HEAD~5; NIE dotyczy doku).

## ✅ FAZA 4 PRZYJĘTA — ARC „DOK TAKTYCZNY" ZAMKNIĘTY W CAŁOŚCI

Dok **zaimplementowany i wypchnięty** (Krok A-lite + 4a–4d + **4f + 4f-1b + 4f-1c**), flaga `tacticalDock`
**ON**. **Live-gate 4f Filipa: 7/9 PASS** (hover kolor+puls wystarcza), poprawki wdrożone (4f-1b/4f-1c
strojenie „pływania", fix znikającej stacji `labelLOD` + kandydat B `switchSystem` restore), **FINALNY
live-check Filipa PASS** (dok pływa i czytelny, stacja przeżywa przełączanie układów). **DoD §4 domknięte.**

**NASTĘPNY KROK (Filip): test „tydzień bez MAPY"** — grać z **dokiem ON** (dok + rejestr jako docelowe
zastąpienie mapy 2D), z `commandTacticalMap` OFF. Po nim **decyzja o kasowaniu kodu mapy 2D** wg audytu
flows **§10.3** (`docs/KOSMOS_obraz_operacyjny_weryfikacja.md`). Filip wróci z notatkami + decyzją.

## Otwarte pozycje (bez zmian względem arca Obrazu Operacyjnego)

- **Live-gate doku (§4.3)** — checklista `docs/dok-taktyczny-playtest.md` (flaga ON → `Y` → pełny
  obieg + kolizje HUD/paneli + scroll + OŚ). Ostatni punkt DoD §4; do zrobienia przez Filipa.
- **„Tydzień bez MAPY"** (deprecjacja mapy 2D, `commandTacticalMap` OFF) — **start PO playteście doku**,
  z **dokiem ON jako konfiguracją docelową** (dok + rejestr zastępują mapę 2D). Notatki: weryfikacja §10.3.
- **Checklista §10.3** (`docs/KOSMOS_obraz_operacyjny_weryfikacja.md`) — audyt flows mapy 2D PRZED
  ewentualnym kasowaniem kodu.
- **#fleetpicture-consolidation** (ROADMAP §4) — migracja legacy formatterów na `FleetPictureLogic`
  (stopniowo, za decyzją).
- **Wraki/kontakty w rejestrze — NIETESTOWANE live** (brak wraków w save; logika smoke) — zweryfikować
  przy naturalnej okazji.
- **Domyślny stan pasa** — start rozwinięty (`TACTICAL_DOCK_H=200`); pierwsza sesja Filipa oceni
  (rozwinięty vs zwinięty) — stała łatwa do zmiany.
- **Backlog doku (poza planem, osobna decyzja):** zoom poziomy osi, marker year-planet dla nie-hover
  celów, akcje zbiorcze w doku (świadomie oddane FleetGroupPanel/FleetCommandPanel).
- **`#route-line2-thickness` (DEFERRED)** — realna grubość linii tras. WebGL capuje `LineDashedMaterial`/
  `LineBasicMaterial.linewidth` do 1 px, więc knoby `ROUTE_LINE_*_WIDTH` nie renderują pogrubienia.
  Filip: kolor+puls wystarcza → NIE implementować teraz; gdyby temat wrócił = konwersja tras na `Line2`/
  tube geometry (mesh o realnej szerokości).
- **`#station-restore-live` — do potwierdzenia przez Filipa** — kandydat B (`_restoreActiveSystemStations`)
  bez smoke (ThreeRenderer niefeasible headless); scenariusz: stacja→inny układ→powrót → stacja wraca.
