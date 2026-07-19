# HANDOFF — „Dok taktyczny" (Faza 4 Obrazu Operacyjnego)

**Data:** 2026-07-19 · **Save:** v90 — FORMAT NIETKNIĘTY (zero migracji; persist =
`uiPrefs.tacticalDockCollapsed` + `uiPrefs.tacticalDockTab`, jadą w hurtowej serializacji uiPrefs).
**Flaga:** `FEATURES.tacticalDock` — **OFF (default)**. **Live-gate: PENDING Filip** (sesja
autonomiczna, rozszerzenie Chrome niepodłączone → weryfikacja = smoke + regresje).
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

**i18n** `tacticalDock.*` PL+EN (zakładki, empty, panel, akcje). **Stałe** LayoutConfig:
`TACTICAL_DOCK_H=200` / `_PANEL_W=300` / `_TAB_H=24`; ThreeRenderer: `TACTICAL_PING_*`,
`ROUTE_LINE_*_OPACITY`.

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

## Otwarte / backlog

- **Live-gate (Filip)** — checklista `docs/dok-taktyczny-playtest.md` (flaga ON → `Y` → pełny
  obieg + kolizje HUD/paneli + scroll + OŚ). To ostatni punkt DoD §4.
- **Domyślny stan pasa** — start rozwinięty (`TACTICAL_DOCK_H=200`); pierwsza sesja Filipa oceni
  (rozwinięty vs zwinięty) — stała łatwa do zmiany.
- **Backlog (poza planem, osobna decyzja):** zoom poziomy osi, marker year-planet dla nie-hover
  celów, akcje zbiorcze w doku (świadomie oddane FleetGroupPanel/FleetCommandPanel).
