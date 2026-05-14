# M3 P2.3 — COMPLETE (snapshot delta)

**Tag:** `m3-commit-p2-3-create-poi-mode`
**Predecessor:** `chore-poipanel-scroll-clamp` (5cfca89)
**Save version:** v67 (bez zmian)

## Co to za commit

P2.3 = **last P2 commit. Atomic resolution 4 deferred issues + 1 new feature.**

1. **Resolves #5** — POI focus camera coord mismatch (root cause: WORLD_SCALE=10, NIE AU_TO_PX=110 jak hipoteza)
2. **Resolves #6** — Brak POI sprites w tactical map FleetManagerOverlay
3. **NEW Coord tooltip 500ms hover** — Filip's feature request, override P1.5 D2 (no tooltip on empty)
4. **NEW Create POI mode** — RightClickMenu PPM → 5 type entries → picker → modal pre-filled

**Phase P2 COMPLETE po tym commit.**

## Stack zmian

```
[m3-commit-p2-3-create-poi-mode]    P2.3 last P2 commit
chore-poipanel-scroll-clamp ✓        ← predecessor
chore-custom-confirm-modal ✓
m3-commit-p2-2-poi-modals ✓
m3-commit-p2-1-poi-panel ✓
m3-commit-fleet-body-tooltip-unified ✓
[Phase P1 complete]
```

## Files (15 plików, 858 net delta — 882 ins / 24 del)

```
src/utils/CoordTransform.js          NEW   +40   pure helpers gameplayToWorld/worldToGameplay
src/renderer/ThreeCameraController.js EXTEND +10  focusOnGameplayCoord wrapper (single source of truth #5 fix)
src/ui/POIPanel.js                   EXTEND +5/-2  fix #5 (1-line core: focusOn → focusOnGameplayCoord)
src/data/RightClickMenuOptions.js    EXTEND +13/-2 5 type entries dla empty target (createPOI.{type})
src/ui/RightClickMenu.js             EXTEND +13/-5 _handleOptionClick handler dla openCreatePOIPicker
src/scenes/GameScene.js              EXTEND +201/-2 EventBus subscribe + picker integration + coord tooltip dispatch (3D+tactical) + ESC + devtools
src/ui/POIModal.js                   EXTEND +17  showPOIModalCreateFromPicker(type, point, waypoints?)
src/ui/FleetManagerOverlay.js        EXTEND +132/-1 _drawPOISprites geometric shapes + range circles + hitZones map_poi
src/utils/TacticalRaycaster.js       EXTEND +18/-1  findHitZone filter + resolveTacticalTarget case 'map_poi' → type:'poi'
src/utils/POIPanelLogic.js           EXTEND +71  pickerResultToPOISpec(type, result) helper + per-type defaults
src/i18n/pl.js                       EXTEND +11  poi.create.* + picker.create.* + coord.tooltip.* keys
src/i18n/en.js                       EXTEND +11  analogiczne EN
tmp_m3_p2_3_create_poi_test.mjs      NEW   +250  T1×6 + T2×8 + T3×8 + T4×4 + T5×5 = 31 cases
tmp_m3_p1_1_menu_test.mjs            UPDATE +9/-5  regression update (MENU_OPTIONS_BY_TARGET.empty 3→7 entries)
tmp_m3_p1_2_raycaster_test.mjs       UPDATE +5/-3  regression update analogiczne

Total: 15 plików, +882/-24 = 858 net delta (plan target ~690, +24% — szczegółowy _drawPOISprites rendering)
```

## Verifications + decisions

### V1-V8 + V_extra

| V | Wynik |
|---|-------|
| V1 | ✅ multi-keyword grep ujawnił PickerStateMachine + RightClickMenu istnieją |
| V2 | ✅ PickerStateMachine.TARGET_POINT mode istniał **unused** — reuse zamiast new mode |
| V3 | ✅ **CRITICAL:** WORLD_SCALE=10 NOT AU_TO_PX=110 (hipoteza częściowo myląca). 1 AU = 11 jednostek Three.js |
| V4 | ✅ TacticalRaycaster hard-coded switch — extension dla 'map_poi' minimalna (~15 LoC) |
| V5 | ✅ Hover detection P1.5 — extension point w `_tooltipHoverFromTactical` (gdy info==null) |
| V6 | ✅ FleetOverlay NIE renderuje POI obecnie (issue #6 confirmed) — `_drawPOISprites` add'd po vessels |
| V7 | ✅ i18n pattern object literal z dot-keys + placeholder format {0}, {1} |
| V8 | ✅ makePOI factories z P2.1/P2.2 reused |
| V_extra RightClickMenu | ✅ flat menu, BRAK submenu — γ-b 5 flat entries acceptable |
| V_extra empty target | ✅ JUŻ MA `createPOI` entry (placeholder!) — replace z 5 type entries |
| V_extra ui:openPOIModal | ✅ EventBus emit od P1.1, BRAK listener — P2.3 wireup'uje |

### Decyzje (z Filip's 5 + plan mode rozstrzygnięcia)

| ID | Decyzja | Wybór | Filip's mandate |
|----|---------|-------|-----------------|
| D1 | FEATURES gate `m3PoiCreateMode` | NO | (default) |
| D-trigger | Skąd start picker? | **γ-b** 5 flat entries w RightClickMenu | **Q1=γ** |
| D-picker-flow | Per type | TARGET_POINT (single-click) + PATROL_WAYPOINTS (multi-click) | **Q2=a** routes to embed type w PPM |
| D-tactical-poi-display | POI sprites | **β** geometric shapes z THEME colors | **Q3=β** |
| D-coord-tooltip-trigger | Empty hover behavior | **b** override P1.5 D2 — ZAWSZE active | **Q4=b** |
| D-focus-camera-fix | Coord conversion routing | **γ** focusOnGameplayCoord w ThreeCameraController | **Q5=γ** |
| D-cancel | Picker exit | (a) ESC | (default) |
| D-poipanel-button | "+ Klik na mapę" w POIPanel header | **NIE** (Q1=γ flow wystarcza, scope reduction) | (plan mode) |

## Off-spec discoveries (8)

```
1. #5 root cause to WORLD_SCALE (10) NOT AU_TO_PX (110) per prompt §V3 hipoteza częściowo myląca.
   Prawidłowa formula: worldX = px / WORLD_SCALE, 1 AU = 11 jednostek Three.js.

2. ui:openPOIModal placeholder — RightClickMenu emitował od P1.1, brak listener'a. P2.3 wireup'uje.

3. createPOI legacy entry zachowany jako fallback (action='openCreatePOIModal'); 
   nowy primary flow przez 'openCreatePOIPicker' z poiType field. Backward compatibility.

4. PickerStateMachine.TARGET_POINT mode istniał **unused** — reuse zamiast new mode.

5. POIPanel "+ Klik na mapę" button SKIPPED (Q1=γ flow + devtools wystarczają — scope reduction).

6. TARGET_POINT finalize wymaga inline path — PickerStateMachine.finalizePicker zwraca null dla TARGET_POINT.
   _finalizeTargetPointPicker custom helper (read callback, cancelPickerMode, invoke).

7. Tactical map targetPoint click dispatch przez EventBus (ui:targetPointPickerFinalize) — 
   FleetOverlay → GameScene loose coupling (gameScene NOT exposed na window.KOSMOS).

8. 15 plików zamiast plan 11-12 — 2 dodatkowe regression test updates dla nowej struktury menu
   (MENU_OPTIONS_BY_TARGET.empty 3 → 7 entries).
```

**8 off-spec discoveries adaptowane PRZED kodem.** L19/L20/L34/L39/L43/L46 mandate w pełnej formie.

## Test results

```
P2.3 (NEW):
  T1×6  gameplayToWorld/worldToGameplay round-trip   6 PASS
  T2×8  pickerResultToPOISpec helper                 8 PASS
  T3×8  POI tactical sprite data                     8 PASS
  T4×4  Coord tooltip content format                 4 PASS
  T5×5  Picker flow integration                      5 PASS
  ─────────────────────
  Total P2.3: 31/31 GREEN ✓

Plus regression test updates:
  P1.1 menu: 17/17 PASS (updated dla 7 empty entries)
  P1.2 raycaster: 20/20 PASS (updated)

Cumulative regression:
  P1.1: 17  P1.2: 20  P1.3 orders: 54  P1.3 tactical: 19
  P1.4: 25  P1.4.5: 5  P1.5: 28
  P2.1: 25  P2.2: 32  P2.3: 31
  ─────────────────────
  Total: 256/256 GREEN ✓✓✓
```

## Real-flow A-K results

```
A — Coord tooltip empty hover (3D + tactical, 500ms, KRYT)        PASS
B — POI sprites visible w tactical (KRYT, resolves #6)            PASS
C — Focus camera correct (KRYT, resolves #5)                      PASS
D — Create waypoint przez PPM                                     PASS
E — Create patrol multi-click ≥2 + ENTER                          PASS
F — Picker cancel ESC                                             PASS
G — Create POI w tactical map                                     PASS
H — Tactical POI hover → tooltip 500ms                            PASS
I — Coord vs POI tooltip nie konfliktują                          PASS
J — Vessel hover regression (P1.5)                                PASS
K — Full regression gate (P1.x + P2.x + chores)                   PASS
```

**11/11 PASS** ✓✓✓ — najbogatszy real-flow w M3, all green.

## Resolved issues

### **By P2.3:**
- ✅ **#5** P2.1 known issue: POI focus camera coord mismatch → SOLVED przez `focusOnGameplayCoord` + CoordTransform helpers
- ✅ **#6** P2.1 known issue: brak POI sprites w tactical map → SOLVED przez `_drawPOISprites` w FleetManagerOverlay

### **Plus delivered:**
- ✅ Coord tooltip 500ms hover (Filip's feature request) — override P1.5 D2
- ✅ Create POI mode (PPM context menu → picker → modal pre-filled)

## Known issues po P2.3

```
RESOLVED:
  ✓ #4 P2.1 brak delete UI → P2.2 (inline trash + Edit Delete)
  ✓ #5 P2.1 POI focus camera coord mismatch → P2.3
  ✓ #6 P2.1 brak POI sprites tactical → P2.3
  ✓ #7 P2.2 Windows-style confirm UX → chore custom confirm
  ✓ Pre-existing P2.1 scroll bug → chore scroll clamp

DEFERRED do M4:
  - #1 Mapa 3D planet hover (RaycasterPure gap)
  - #2 G2.3 cancel button hover
  - Star tooltip planet template (migration commit)
  - KOSMOS.gameScene undefined exposure
  - KOSMOS.gameConfig undefined exposure
  - 2 legacy window.confirm callsites (ColonyOverlay army disband, UnitCardPanel unit disband)
  - #8 Browser maxlength feature (acceptance, NIE bug — feature)
```

**Acceptable known issues po P2.3: 7** (z czego #8 jest feature acceptance). Wszystkie M3-introduced issues z P2.x **resolved**.

## Lekcje kandydaci L50-L52

### **L50 — Coord conversion: cite REAL formula PRZED hipoteza**

P2.3 V3 ujawnił że hipoteza `AU_TO_PX` (110) była częściowo myląca — realny scaling factor to **`WORLD_SCALE` (10)** w ThreeRenderer. Plan mode V3 cytat dokładnej formuły z `_syncPlanetMeshes` zapobiegł post-fix.

**Pattern resolution:** dla każdej feature dotykającej coord systems (3D ↔ gameplay ↔ tactical ↔ screen), plan mode V_extra MUSI cytować **REAL formulę z source code** (z numerami linii), NIE hipoteza z prompta. Wartości magic numbers (10, 110, 50, etc.) różnią się per use case — `AU_TO_PX` dla distance display, `WORLD_SCALE` dla 3D mesh scaling. **Rozróżnienie krytyczne.**

**Generalizacja:** każda nowa feature używająca coord transformation MUSI mieć V_extra cytat z **dokładnym source location** + **przeliczenie konkretne** (np. `gameplay 1100px → world 110 units` z step-by-step). Eliminuje L46 risk dla future commits. Plus M4 candidate: uniwersalny `CoordSpaces` helper module (gdy będzie więcej coord-aware features).

### **L51 — Existing infrastructure reuse trumps new abstraction**

P2.3 V_extra ujawnił **3 pieces of existing infrastructure** które plan zakładał jako "nowe":
1. `PickerStateMachine.TARGET_POINT` mode istniał unused → reuse zamiast new mode
2. `EventBus 'ui:openPOIModal'` placeholder → wireup zamiast new event
3. `RightClickMenu createPOI` entry → replace z 5 type-specific zamiast new menu structure

**Pattern resolution:** plan mode V1 + V_extra MUSI zawierać **multi-keyword grep dla existing patterns** PRZED założeniem że trzeba budować od zera (L34 + L39). Codebase ma częste **placeholders** lub **unused features** które mogą być wireup'owane lub reused.

**Generalizacja:** **scope reduction świadomy** zamiast new abstraction = lepsze workflow consistency. Każdy nowy feature plan zaczyna od *"Czy istnieje już X w codebase?"*, nie *"Buduję X od zera"*.

### **L52 — Loose coupling przez EventBus dla cross-component dispatch**

P2.3 off-spec #7: tactical map targetPoint click → GameScene picker handler. Naturalny pattern by exposeować `gameScene` na `window.KOSMOS`, ALE codebase **NIE eksponuje** GameScene globalnie (świadoma decyzja architectural). Plan resolved przez **EventBus emit** (`ui:targetPointPickerFinalize`) — FleetOverlay nie zna GameScene direct, emit'uje event, GameScene listenuje.

**Pattern resolution:** dla cross-component dispatch w codebase preferującym loose coupling, **EventBus emit/listen** > direct method call. Spójne z `ui:openPOIModal` placeholder pattern.

**Generalizacja:** plan mode V_extra dla cross-component features MUSI sprawdzić **architectural style** codebase (loose coupling vs direct refs). Forsowanie direct refs gdy codebase preferuje EventBus = **L17 antipattern** (nadinterpretacja prompta vs codebase conventions).

## Procedural

P2.3 commit:
- 1 sesja plan mode + commit + smoke
- ~15-20 min real-flow Filip
- 1 sesja Total
- 0 post-fix scope-relevant
- 8 off-spec discoveries — all adaptowane PRZED kodem

**Workflow consistency: najczystszy P2 commit + najbogatszy scope.** Plan mode V verifications eliminowały WSZYSTKIE HIGH risks PRZED kodem (V3 coord formula, V_extra RightClickMenu submenu, V_extra existing placeholders). 11/11 real-flow PASS na pierwszym podejściu.

## Status overall

```
PHASE P1 COMPLETE                                     5 commits + 2 sub-fix + 1 docs
m3-commit-fleet-body-tooltip-unified ✓                migration commit
m3-commit-p2-1-poi-panel ✓                            P2 commit 1/3
m3-commit-p2-2-poi-modals ✓                           P2 commit 2/3
chore-custom-confirm-modal ✓                          P2 chore (resolves #7)
chore-poipanel-scroll-clamp ✓                         P2 chore (pre-existing fix)
m3-commit-p2-3-create-poi-mode ✓                      P2 commit 3/3 ← LAST P2

⚠️ PHASE P2 COMPLETE ⚠️ MAJOR MILESTONE

[NEXT — P3 phase]
P3.1 — Picket + Rally runtime systems                 1-2 sesje
└─ Detection logic, alert events, member assembly
└─ Per design doc §6 P3.1 row

P3.2 — Ambush + Integration                           1-2 sesje
└─ Ambush trigger logic, integration z combat
└─ Per design doc §6 P3.2 row

P4 — Polish (EventLog UX)                             1-2 sesje
└─ EventLog improvements per §6 P4 row
```

## Lekcje cumulative po P2.3

```
M2b: L1-L14 (14 lekcji)
M3 P1.x + migration: L15-L43 (29 lekcji)
M3 P2.1: L44-L46 (3 nowe — schema variation, overlay one-at-a-time, coord gaps)
M3 P2.2: L47-L48 (2 nowe — browser-native UI immersion, browser-native attrs vs validation)
M3 P2.x chores: L49 (1 nowa — scroll state out-of-bounds)
M3 P2.3: L50-L52 (3 nowe — real coord formula citation, existing infrastructure reuse, EventBus loose coupling)
─────────────────
Total: 52 lekcji workflow
```

## Status M3 progress

```
Commits closed:                                       13 atomic commits
  P1.x:                                                5 + 2 sub-fix + 1 docs
  Migration:                                           1
  P2.x:                                                3 (P2.1 + P2.2 + P2.3)
  P2.x chores:                                         2 (custom confirm + scroll clamp)
─────────────────
M3 progress: ~80% done

PHASE P2 COMPLETE — pełen POI ecosystem przez UI:
  ✓ Read (POIPanel sort/filter/live update — P2.1)
  ✓ Create (POIModal manual + PPM picker mode — P2.2 + P2.3)
  ✓ Update (POIModal Edit z type immutable — P2.2)
  ✓ Delete (inline trash + Edit Delete + custom confirm — P2.2 + chore)
  ✓ Tactical visibility (POI sprites + range circles — P2.3)
  ✓ Coord-aware (focus camera fix + coord tooltip — P2.3)

Pozostaje:
  P3.1 picket + rally runtime:                         1-2 sesje
  P3.2 ambush + integration:                           1-2 sesje
  P4 polish (EventLog UX):                             1-2 sesje
─────────────────
Realistic M3 close: 3-5 sesji więcej
```

---

**P2.3 CLOSED. PHASE P2 COMPLETE.** Atomic resolution 4 deferred issues + create POI mode delivered. 31/31 smoke + 11/11 real-flow PASS. 256/256 cumulative GREEN.

**Cumulative M3 lessons: L15-L52 (38 nowych vs M2b L1-L14).** **Total: 52 lekcji workflow.**

Po P2.3 → **P3.1 prompt next** (picket + rally runtime systems — detection logic, alert events, member assembly).
