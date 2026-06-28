# Handoff — Reforma detekcji + Konsola Dowodzenia polish

> Przekazanie dla następnej sesji. Stan na 2026-06-28. Save **v88 (bez migracji)**.
> Live-gate (Filip, przeglądarka): **wszystkie testy PASS** (T1–T7).
> Plan źródłowy: `C:\Users\Komputer\.claude\plans\przeczytaj-handoff-z-ostatniej-dynamic-wreath.md`.

---

## 1. CEL

Kontynuacja reformy „Konsola Dowodzenia" (`main 8da65ed`). Cztery odłożone zadania z §7 starego handoffu (`docs/KOSMOS_handoff_fleet_command_console.md`) + reforma detekcji jako **główny gameplay-lever walki**: gracz ma móc wykrywać i angażować wrogów z dystansu, zanim się zbliżą.

## 2. DECYZJE GRACZA (z AskUserQuestion)

- **Reveal tożsamości (rumor→contact):** skalowany techem sensor-lock; **techy mają dużo mocniej wydłużać zasięg**. Dodatkowo nowa mechanika **skanu obserwatorium** (skan wrogiego statku jako zadanie). Skan **planet** ODŁOŻONY.
- **Zasięg wykrycia własnych statków:** **per-kadłub**.

## 3. CO ZROBIONE (4 fazy + 2 rundy fixów)

### Faza 1 — Reforma detekcji i intelu
- **1a Per-kadłub `sensorRangeAU`** — `src/data/HullsData.js` + `src/data/ShipsData.js` (scout/science 2.5, fregata 1.6, niszczyciel 1.4, krążownik 1.3, średni 1.5, transport/cargo/supply 1.0–1.1). `VesselManager.getVesselSensorRangeAU(vessel)` (wzór `getVesselUpkeepCredits`, fallback 0.5). `ProximitySystem._getDetectionRangeAU`: gracz = `getVesselSensorRangeAU × tech('sensor_range')`; wróg = flat `PROXIMITY_DETECTION_AU` (0.5).
- **1b Mocniejsze techy** — `TechData.js` `advanced_sensors_1/2/3` = ×1.6/×1.6/×1.8 (kumulatywnie **~×4.6**; scout teched ≈ 11.5 AU). Opisy PL+EN.
- **1c Sensor-lock reveal** — `ProximitySystem`: `_activeSensorLockPairs` Set + `_getSensorLockAU(v)` (gracz `SENSOR_LOCK_AU 0.3 × tech`, wróg 0) + 3. próg w `_checkPair` → `vessel:sensorLockEnter/Exit` (cleanup w `_handleVesselWrecked`+`destroy`). `IntelSystem._onSensorLock` → `advanceVesselContact(observedId,'contact','sensor_lock')`. Flaga `FEATURES.sensorLockContact`.
- **⚠ ROOT-CAUSE** (TODO Filipa „własny statek nie podbija intelu") — `IntelSystem._isPlayerVessel`: `=== 'player'` był ZA WĄSKI (statki gracza mają `undefined` owner) → `_resolveObservedFromPair` zwracał null → proximity NIGDY nie nadawał intelu z własnego statku. Fix: `!!v && !isEnemyVessel(v)`. **To naprawiło CAŁY tor proximity→intel, nie tylko sensor-lock.**
- **1d Skan obserwatorium** — `ObservatorySystem`: `_vesselScans` Map + `startVesselScan/cancelVesselScan/getVesselScanProgress/getActiveVesselScans` + `_tickVesselScans(civDeltaYears)` (wołane z `_tickScan`; `SCAN_DURATION_YEARS 3.0 / level`) → `_completeVesselScan` → `advanceVesselContact('contact','observatory_scan')` + `observatory:vesselScanComplete`. serialize/restore `vesselScans` z `?? {}` (BEZ migracji). UI: zakładka „Kontakty" w `ObservatoryOverlay` (`_renderContacts` + przyciski `data-scanaction` Skanuj/Anuluj + pasek postępu; gate `observatoryVesselScan`). `NotificationCenter._handleVesselScanComplete` + `NotificationDropdown` ikona `vessel_scan`. i18n PL+EN.

### Faza 2 — Martwy kod (ThreeRenderer)
Usunięte: `_syncSelectionRings`/`_upsertSelectionRing`/`_disposeSelectionRing`/`_disposeAllSelectionRings` + `SELECTION_RING_INNER/OUTER/SCREEN_K` + `_selectionRingMeshes`; `_syncRouteComet`/`_disposeRouteComet` + `_routeComet`. **`_orderLineColor` ZACHOWANE** (3 route-line create-sites). Zero pozostałych referencji.

### Faza 3 — „Obserwuj bitwę"
`CombatHUD`: przycisk **👁 Obserwuj** w lewym górnym rogu nagłówka → `EventBus.emit('camera:watchBattle', {x,y})` z `enc.location.point` (gameplay px — listener stosuje `S()`). `_watchBtnBounds` + handleClick PRZED minimize. i18n `combat.watchBattle`.

### Faza 4 — Multi-select (Slice 8, `fcMultiSelect` flip ON)
- `UIManager`: `_selectedVesselIds: Set` + lead `_selectedVesselId` (zbiór ZAWSZE zawiera lead w single-select). API `getSelectedVesselIds/addToSelection/removeFromSelection/toggleSelection`; `_drawSelectionBrackets` pętla po zbiorze (`_drawBracketForVessel`, lead jasny / reszta przyciemniona); `_drawMarquee`; `_syncFleetOvLead` cache do FleetOverlay.
- `GameScene`: CTRL+klik → `toggleSelection` (w `_handleTacticalLeftClick`); **box-select** `_setupBoxSelect` (SHIFT+LPM drag, mousedown/move/up window listeners, marquee w CLIENT px); `_boxSelectConsumedClick` (pochłania artefakt-click po dragu).
- `ThreeRenderer._getOwnVesselsInScreenRect`; `ThreeCameraController` skip orbit gdy `SHIFT && fcMultiSelect`.
- `RightClickMenu`: dispatch rozkazu w pętli po `getSelectedVesselIds()` (feedback tylko gdy ŻADEN nie przyjął).

### Runda fixów po adversarial review (3 potwierdzone)
- **Duplikat logu + przeciek nazwy** (`GameScene` `intel:vesselContactChanged`): handler logował nazwę dla KAŻDEJ zmiany; po fixie `_isPlayerVessel` proximity gracza emituje też **rumor** → przeciek. Fix: loguje **tylko `contact`+** i pomija `reason==='observatory_scan'` (NotificationCenter loguje).
- **Wrak w detekcji** (`ObservatorySystem._tickVesselDetection`): `if (!isEnemyVessel(v) || v.isWreck) continue;` (wrak znika z listy Kontaktów/skanu).
- **Box-select mouseup bez gardy przycisku** (`GameScene`): `if (e.button !== 0) return;`.

### Fix live-gate T7 — moveToPoint na ruchome ciało
ROOT: `OrderDispatcher.buildOrderSpec` robił STATYCZNY snapshot pozycji planety → misja `move_to_point` `targetId:null` → przylot `findEntity(null)` → snap do nieaktualnego punktu → statek w pustce. Fix: planet → `spec.targetBodyId` (+ `targetName`, `targetPoint` fallback). `MovementOrderSystem._issueMoveToPoint`: gdy `targetBodyId` → **predykcja Kepler** pozycji na ETA (`_vm._predictPosition`, 1 iteracja) dla kursu + `mission.targetId=bodyId` → przylot snapuje do ŻYWEJ pozycji (`target.x` w VesselManager:1932) i orbituje/śledzi planetę. Działa pojedynczo I dla grupy.

## 4. POKRĘTŁA STROJENIA

- Per-hull `sensorRangeAU` (HullsData/ShipsData) · tech `sensor_range` ×1.6/×1.6/×1.8 (TechData) · `SENSOR_LOCK_AU` 0.3 (GameConfig, mnożony techem) · `SCAN_DURATION_YEARS` 3.0/level (ObservatorySystem) · box-select próg 4–5px.
- Flagi `FEATURES`: `sensorLockContact` ON, `observatoryVesselScan` ON, `fcMultiSelect` ON (Slice 8). Rollback per-flaga.

## 5. ODŁOŻONE / NEXT (jutro)

1. **Slice 8b — UI zarządzania grupą i pojedynczym statkiem** (panel zaznaczonej grupy: lista, rozkazy zbiorcze, nazwanie grupy; pojedynczy statek też). Filip: „przydałoby się UI".
2. **Ujednolicenie skali odległości na mapie 3D** — odległości statków na mapie 3D wyglądają DUŻO większe niż realnie (walka odpala przy 0.15–0.22 AU = ~16–24 px, ale na 3D z `WORLD_SCALE` wygląda na dużą lukę); tactical map pokazuje mniejszą odległość niż 3D. Zbadać `WORLD_SCALE`/`AU_TO_PX` i zsynchronizować percepcję skali 3D ↔ tactical. (Istniejący problem wizualizacji, nie wprowadzony tą reformą.)
3. **Empire tech state** — per-imperium sensory/broń (obecnie wróg flat 0.5 AU, brak tech mult) — domyka asymetrię i AI kiting.
4. Sensor-lock skalowany też per-kadłub (na razie lock = tylko tech).

## 6. JAK TESTOWAĆ (live-gate)

Manual z komendami: patrz historia czatu tej sesji (TEST 1–7) — kluczowe:
- `?scenario=combat_sandbox` (4 własne + 3 wrogie statki, wszystkie techy) — najlepszy setup do detekcji/sensor-lock/engage/watch-battle/multi-select.
- `KOSMOS.debug.spawnEnemyAttack({etaYears, spawnDistanceAU})` — wrogi atak in-system.
- `KOSMOS.techSystem.restore({researched:['advanced_sensors_1','advanced_sensors_2','advanced_sensors_3']})` — nadanie techów sensorów.
- Snippet auto-stawiający obserwatorium Lv5 + `KOSMOS.observatorySystem.startVesselScan(id)` / `getVesselContact(id).quality`.
- Multi-select: CTRL+klik, SHIFT+drag (marquee), PPM → rozkaz do zbioru.
- T7: PPM na planetę → statek dolatuje DO planety i orbituje (nie w pustkę).

## 7. WERYFIKACJA HEADLESS (smoki — UNTRACKED, repo root)

- `tmp_sensor_detection_smoke.mjs` **46/46** (per-hull range, tech mult, sensor-lock event, IntelSystem `_isPlayerVessel` fix + `_onSensorLock`, observatory scan lifecycle + serialize/restore).
- Regresja: `tmp_obs_detection_reform_smoke.mjs` 43, `tmp_unarmed_no_combat_smoke.mjs` 18, `tmp_fc_foundation` 25 / `tmp_fc_combat_fx` 11 / `tmp_fc_command` 10 (T6 zaktualizowany pod targetBodyId).
- Uruchom: `node tmp_*_smoke.mjs`. `node --check` na wszystkich dotkniętych plikach OK; parytet i18n OK.

## 8. MAPA PLIKÓW (zmienione, 21 plików src + CLAUDE.md + ten handoff)

| Obszar | Pliki |
|--------|-------|
| Detekcja/intel | `ProximitySystem.js`, `IntelSystem.js`, `VesselManager.js`, `HullsData.js`, `ShipsData.js`, `TechData.js`, `GameConfig.js` |
| Skan obserwatorium | `ObservatorySystem.js`, `ObservatoryOverlay.js`, `NotificationCenter.js`, `NotificationDropdown.js` |
| UI/console | `CombatHUD.js`, `UIManager.js`, `GameScene.js`, `RightClickMenu.js`, `ThreeRenderer.js`, `ThreeCameraController.js` |
| T7 fix | `OrderDispatcher.js`, `MovementOrderSystem.js` |
| i18n | `pl.js`, `en.js` |

Memory: `memory/detection-reform-multiselect.md` (+ wpis w `MEMORY.md`).
