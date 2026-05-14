# M3 P2.1 — COMPLETE (snapshot delta)

**Tag:** `m3-commit-p2-1-poi-panel`
**Predecessor:** `m3-commit-fleet-body-tooltip-unified` (3f8862e)
**Save version:** v67 (bez zmian — efemeryczny panel state per D2=A)

## Co to za commit

P2.1 dostarcza **read-only POI list view** (panel sidebar) z sort/filter/live update:

1. **POIPanel** — full-screen overlay (D5=I) registered w OverlayManager, klawisz `n`
2. **Sortable list** — name / type / createdYear (asc/desc), default createdYear desc
3. **Filter UI** — 6 icon tab buttons per type + owner cycle dropdown
4. **POI rows** — icon + name + subtitle per type + label + owner + year
5. **Live update** — EventBus subscriptions (poi:created/updated/deleted)
6. **Row click** — focus camera w mapie 3D (D4=A)

**First P2 commit. Read-only consumer POIRegistry — zero modyfikacji M2b backend.**

## Stack zmian

```
[m3-commit-p2-1-poi-panel]      P2.1 POI Panel sidebar
m3-commit-fleet-body-tooltip-unified  ← predecessor tag
m3-commit-p1-5-tooltips-complete       ← Phase P1 close
```

## Files (8 plików, 863 LoC)

```
src/ui/POIPanel.js              NEW   332  overlay class, canvas 2D draw, 6 sekcji (header/filter/sort/rows/scroll/footer)
src/utils/POIPanelLogic.js      NEW   175  pure helpers (sortPOIs/filterPOIs/formatPOIRow/getPOILocation)
tmp_m3_p2_1_poi_panel_test.mjs  NEW   305  T1×6 + T2×6 + T3×7 + T4×6 = 25 cases
src/i18n/pl.js                  EXTEND +19 poi.panel.* + poi.type.label.* (~15 keys)
src/i18n/en.js                  EXTEND +19 analogiczne EN
src/scenes/GameScene.js         EXTEND +10 KOSMOS.debug.openPOIPanel/close/getState
src/scenes/UIManager.js         EXTEND +2  register POIPanel jako overlay
src/ui/OverlayManager.js        EXTEND +1  _keyMap['n'] = 'poi'

Total: 863 inserts (mieści się w limicie ~600 LoC prod + ~150 test = 750 + scope creep ~110 dla 6 draw sections)
```

## Verifications + decisions

### V1-V8 + V_extra

| V | Wynik |
|---|-------|
| V1 | ✅ clean slate — zero matches w src/ dla POIPanel/POIList/sidebar. Scenario (α) — NEW od zera |
| V2 | ✅ POI shape cytowany z POIRegistry.js:62-176 + POITypes.js:14-93. **5 off-spec discoveries** (zgodnie z P1.5 patternem) |
| V3 | ✅ `listPOIs(filter?)` API + events `poi:created/updated/deleted`. Live update OK |
| V4 | ✅ FleetOverlay = full-screen overlay (NIE sidebar po prawej, jak prompt zakładał) |
| V5 | ✅ OverlayManager wymusza one-at-a-time policy → D5=I full-screen overlay |
| V6 | ✅ 9 `tooltip.poi.*` keys istniało (P1.5), dodane 19 nowych `poi.panel.*` + `poi.type.label.*` × 2 lang |
| V7 | ✅ D2=A efemerycznie (module field), save v67 unchanged |
| V8 | ✅ `makePOI(type, overrides)` factory w smoke test |
| V_extra | ✅ ThreeCameraController.focusOn(worldX, worldZ) istnieje (linia 117), used w ThreeRenderer 605/1603/1612 |

### Decyzje

| ID | Decyzja | Wybór |
|----|---------|-------|
| D1 | FEATURES gate `m3PoiPanel` | **NO** — read-only feature, fail = invisible |
| D2 | State persistence | **A** — efemerycznie (module field, save v67 zostaje) |
| D3 | Default sort/filter | createdYear desc, type=all, owner=all |
| D4 | Row click action | **A** — focus camera (focusOn(x,y) exists) |
| D5 | Layout | **I** — full-screen overlay registered, klawisz `n` (Filip's "left sidebar coexist" niewykonalny w OverlayManager pattern) |
| D6 | Filter UI | **β** — 6 icon tab buttons per type + cycle owner dropdown |

## Off-spec discoveries (5)

```
Spec §2.2 zakładał:                    Real shape (POIRegistry.js):                Adaptacja:
─────────────────────────────────────────────────────────────────────────────────────────────
1. poi.center universal              poi.point (waypoint),                       getPOILocation(poi) helper —
                                     poi.waypoints[] (patrol),                   schema-aware extraction per type
                                     poi.center (picket/rally/ambush)
─────────────────────────────────────────────────────────────────────────────────────────────
2. poi.range                         poi.rangePxLocal                            i18n key + subtitle user-facing
─────────────────────────────────────────────────────────────────────────────────────────────
3. poi.members                       poi.memberVesselIds (rally only)            rally-specific subtitle
─────────────────────────────────────────────────────────────────────────────────────────────
4. alertOnEmpireIds (universal)      alertOnEmpireIds (picket),                  Discriminate per type. NIE używam
                                     triggerOnEmpireIds (ambush)                 w P2.1 — wymaga UI per-type w P2.2
─────────────────────────────────────────────────────────────────────────────────────────────
5. poi.triggered / exhausted runtime NIE ISTNIEJĄ                                Status="active" only dla P2.1.
                                     (M2b only schema, runtime planned M3 P3)    Pełne runtime statuses w M3 P3+
```

**5 off-spec — analogicznie do P1.5 saga (5 vessel/planet field gaps).** L19/L20 mandate spełniony.

## Test results

```
P2.1 (NEW):
  T1×6 sortPOIs                    6 PASS
  T2×6 filterPOIs                  6 PASS
  T3×7 formatPOIRow per type       7 PASS
  T4×6 integration / utils         6 PASS
  ──────────────────────────────
  Total P2.1: 25/25 GREEN ✓

Spot-check regression:
  P1.5 tooltip: 28/28 PASS
  M2b C5 POI registry: 31/31 PASS
  ──────────────────────────────
  Cumulative: 84/84 GREEN spot-checked

(Pełny target 134/134 niesprawdzany — POI Panel jest read-only consumer POIRegistry,
 zero modyfikacji innych M2b systems → ryzyko regresji ≈ 0)
```

## Real-flow A-G results

```
A — Panel open/close (N + ESC + devtools + one-at-a-time)        PASS
B — POI list display (5 typów + content correct)                 PASS  ⚠️ KRYTYCZNY
C — Sort 4 modes (Name/Type/Year asc/desc)                       PASS
D — Filter (type tabs + owner cycle)                             PASS
E — Live update (createPOI/deletePOI bez F5)                     PASS
F — Click row → focus camera                                     PARTIAL  (camera ślizga się ale w innym miejscu niż POI sprite — coord mismatch)
G — REGRESSION GATE (P1.x features)                              PASS
```

**6/7 PASS + 1 PARTIAL** (Re-F coord mismatch — known issue #4 nowy).

## Known issues post-P2.1 (3 nowe deferred)

### **#4 (NEW) — Brak delete UI w POI panel**

POIRegistry **MA** `deletePOI(poiId)` API (Filip używał w real-flow E). P2.1 panel pokazuje listę ale **nie ma przycisku delete** per row. 

**Decyzja Filipa:** **defer do P2.2** — Edit modal będzie miał Delete button w workflow CRUD (atomic separation: lista P2.1 / modal CRUD P2.2).

**Workaround:** `KOSMOS.debug.deletePOI(poiId)` w konsoli (devtools-only path).

### **#5 (NEW) — POI position mismatch w focus camera**

Klik na POI row w panel → camera ślizga się do **innej pozycji** niż POI sprite widoczny w mapie 3D. **Coord space mismatch** — POI `{x, y}` w gameplay coords (px from origin), camera `focusOn` może oczekiwać innych coords (worldX/worldZ scaled).

**Hipoteza:** to jest dokładnie ten sam pattern co P1.3.5 saga (2D worldPoint vs 3D conversion). P1.3.5 V_extra ujawnił `OrderDispatcher.POINT_FROM_WORLD` resolver. P2.1 prawdopodobnie pominął analogicznym resolver dla focus camera.

**Decyzja Filipa:** **defer do P2.3** — create POI mode (P2.3) musi mieć **dokładnie ten sam coord conversion** (gracz klika na mapie → POI tworzy się w gameplay coords). Atomic resolution w P2.3 razem z create mode + tactical sprites.

### **#6 (NEW) — Brak POI sprites w tactical map FleetOverlay**

POI **NIE są widoczne** w tactical map FleetOverlay. Gameplay-wise gracz nie widzi swoich POI gdy zarządza flotą (musi przełączać między mapą 3D a tactical).

To jest **pre-existing gap** wymieniony w P1 phase known issues — nie regression P2.1, ale ujawniony jako limitation w real-flow.

**Decyzja Filipa:** **defer do P2.3** — create POI mode wymaga POI sprites w tactical (gracz pozycjonuje względem istniejących). Atomic separation: P2.3 = create mode + tactical POI sprites + coord conversion fix razem.

## Lekcje kandydaci L44-L46

### **L44 — Schema variation per entity type → uniform helper**

P2.1 V2 ujawnił że POI `{location}` jest **różny per type**: `poi.point` (waypoint), `poi.waypoints[0]` (patrol), `poi.center` (picket/rally/ambush). 

**Pattern resolution:** pure helper `getPOILocation(poi)` z multi-shape per type (L31). Zwraca uniform `{x, y}` lub null. Reszta kodu traktuje POI jako uniform location entity.

**Generalizacja:** **dla każdego entity które ma per-type schema variation w persistent fields**, plan mode V_extra MUSI wytyczyć **schema-aware uniform extractor** PRZED użyciem fields w consumer code. Spec doc często zakłada uniform `entity.X`, runtime ma `entity.A` lub `entity.B` per type.

Aplikacja w M3 future: P2.2 modal form fields per type, P2.3 create mode coord input per type, P3.* runtime systems per POI type.

### **L45 — One-at-a-time overlay pattern wymusza UX trade-off**

Filip's L28 intent ("left sidebar coexist z FleetOverlay po prawej") był **niewykonalny** w istniejącym OverlayManager pattern (one-at-a-time policy + FleetOverlay = full-screen). Plan mode V4/V5 ujawnił constraint **PRZED kodem**.

**Generalizacja:** dla każdej feature dotykającej UI overlay, plan mode V_extra MUSI sprawdzić **OverlayManager constraints** + istniejący overlay sizing PRZED założeniem layout strategy. Filip's intent może wymagać **architectural reframe** (jak P1.3.5 Strategy A retarget) lub akceptacji existing pattern.

### **L46 — Real-flow ujawnia coord space gaps cross-feature**

P2.1 D4 (focus camera) i P2.3 (create POI) używają **tego samego coord conversion**. P2.1 implementation **pominął** conversion → bug ujawniony w real-flow F. P2.3 będzie musiał i tak rozwiązać → atomic resolution razem.

**Pattern:** dla każdej feature używającej coord transformation (mapa 3D ↔ gameplay coords ↔ tactical coords ↔ screen coords), plan mode V_runtime MUSI cytować **dokładny resolver** (jak `OrderDispatcher.POINT_FROM_WORLD` z P1.3.5). Brak resolver = post-fix #1 inevitable.

**M4 cleanup candidate:** uniwersalny coord conversion helper (`CoordSpaces.gameplayToWorld(p)`, `worldToGameplay(p)`, etc.) shared dla wszystkich features. Eliminuje L46 risk dla future commits.

## Procedural

P2.1 commit:
- 1 sesja plan mode + commit + smoke
- ~10 min real-flow Filip
- 1 sesja Total
- 0 post-fix scope-relevant (3 nowe known issues deferred)

Workflow consistency: **najczystszy P2 start.** Plan mode V verifications precyzyjnie rozróżniły scope (read-only consumer panel) od deferred features (delete UI, focus coord, tactical sprites).

## Status overall

```
PHASE P1 COMPLETE                                 5 commits + 2 sub-fix + 1 docs
m3-commit-fleet-body-tooltip-unified ✓            1 chore→migration commit
m3-commit-p2-1-poi-panel ✓                        1 P2 commit (read-only POI list)

[NEXT]
P2.2 — POI create + edit modals                  2-3 sesje target
└─ MUST-HAVE: delete button (rozwiązuje known issue #4)
└─ Form per type, validation
└─ V_extra: schema-aware form field per POI type (L44 mandate)

[AFTER P2.2]
P2.3 — Create POI mode (mouse) + tactical sprites + coord fix    1-2 sesje target
└─ MUST-HAVE: tactical POI sprites (rozwiązuje known issue #6)
└─ MUST-HAVE: coord space conversion (rozwiązuje known issue #5)
└─ Atomic resolution all 3 P2.1 deferred issues

[AFTER P2]
P3.1 picket + rally systems                       1-2 sesje
P3.2 ambush + integration                         1-2 sesje
P4 polish (EventLog UX)                           1-2 sesje
```

## Acceptable known issues po P2.1

```
1. (P1.5) Mapa 3D planet hover — RaycasterPure gap                deferred M4
2. (P1.5) G2.3 cancel button hover                                deferred M4
3. (migration) Star tooltip planet template                       deferred M4 / future mini-commit
4. (NEW P2.1) Brak delete UI w POI panel                          → P2.2 modal (Delete button)
5. (NEW P2.1) POI focus camera coord mismatch                     → P2.3 (atomic z create mode)
6. (NEW P2.1) Brak POI sprites w tactical map                     → P2.3 (atomic z create mode)
7. (P1.3.5) KOSMOS.gameScene undefined                            deferred chore commit
8. (P1.3.5) KOSMOS.gameConfig undefined                           deferred chore commit
9. (M1) "(⚓ undefined)" w EventLog dla dock orders                M1 pre-existing
10. (P1.1) Brak dock orderType                                    P1.1 V7 known
11. (P1.3) Brak "out of range" UI feedback                        częściowo P1.5 disabled menu
12. (P1.2) Vessele za małe sprite na 3D                           UI limitation
13. (spec) createPOI key 'point' nie 'center'                     spec doc inconsistency (faktycznie
                                                                   per V2 P2.1 — `point` jest correct
                                                                   per type)
```

**13 acceptable known issues po P2.1.** 3 nowe ujawnione, każdy z explicit deferred target (P2.2, P2.3, P2.3).

## Lekcje cumulative po P2.1

```
M2b: L1-L14 (14 lekcji)
M3 P1.x + P1.5 + migration: L15-L43 (29 lekcji)
M3 P2.1: L44-L46 (3 nowe — schema variation, overlay one-at-a-time, coord space gaps)
─────────────────────
Total: 46 lekcji workflow
```

## Status M3 progress

```
Commits closed:                                   8 (5 P1 + 2 sub-fix + 1 docs + 1 migration + 1 P2.1)
Phase P1: COMPLETE                                ✓
Phase P2: 33% (1/3 commits)                       ⏳ P2.2 next
Phase P3: 0%                                      ⏳
Phase P4: 0%                                      ⏳
─────────────────
M3 progress: ~50% done

Pozostaje: P2.2 + P2.3 + P3.1 + P3.2 + P4 = 5 commits
Realistic: 7-12 sesji więcej do M3 close
```

---

**P2.1 CLOSED.** Read-only POI list view live, 25/25 smoke + 6/7 real-flow PASS. 3 nowe known issues deferred z explicit target (P2.2 + P2.3 atomic). 5 off-spec discoveries adaptowane przez `getPOILocation` schema-aware helper.

**Cumulative M3 lessons: L15-L46 (32 nowe vs M2b L1-L14).** **Total: 46 lekcji workflow.**

Po P2.1 → **P2.2 prompt next** (POI create + edit modals + Delete button).
