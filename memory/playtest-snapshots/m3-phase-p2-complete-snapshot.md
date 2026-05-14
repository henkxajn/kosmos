# M3 PHASE P2 — COMPLETE (mega-snapshot)

**Phase tag:** Phase P2 zakończony tagiem `m3-commit-p2-3-create-poi-mode` (5da2093)
**Phase predecessor:** `m3-commit-fleet-body-tooltip-unified` (3f8862e — migration commit po Phase P1 close)
**Phase successor:** Phase P3 (picket + rally + ambush runtime systems)
**Save version:** v67 (bez zmian w P2 — efemeryczne UI state per D2=A across all P2 commits)

---

## Phase P2 = pełen POI ecosystem przez UI

Phase P2 dostarczył **complete POI lifecycle przez UI** — od read-only browse do create/edit/delete + tactical visibility + coord-aware operations. **5 commitów + chore custom confirm + chore scroll clamp.**

```
[m3-commit-p2-3-create-poi-mode]    P2.3 last commit (15 plików, 858 LoC)
chore-poipanel-scroll-clamp ✓        chore (1 plik, 14 LoC)
chore-custom-confirm-modal ✓         chore (5 plików, 193 LoC)
m3-commit-p2-2-poi-modals ✓          P2.2 (7 plików, 1279 LoC)
m3-commit-p2-1-poi-panel ✓           P2.1 (8 plików, 863 LoC)
[m3-commit-fleet-body-tooltip-unified] ← Phase P2 startuje stąd
```

**Total Phase P2:** 5 commitów, 36 plików zmienione (z duplikatami), ~3200 LoC delta.

---

## P2 commit-by-commit

### **P2.1 — POI Panel Sidebar (read-only)** ✓
`m3-commit-p2-1-poi-panel` (3160894)

- **Files:** 8 plików, 863 LoC
- **NEW:** POIPanel.js (332), POIPanelLogic.js (175), test (305)
- **Smoke:** 25/25 (T1×6 sort + T2×6 filter + T3×7 format + T4×6 integration)
- **Decyzje:** D5=I full-screen overlay registered (Filip's "left sidebar coexist" niewykonalny w pattern)
- **Dostarcza:** read-only POI list view z sort/filter/live update, klawisz N, focus camera (D4=A)
- **Off-spec:** 5 (POI shape per type — `point` vs `waypoints[0]` vs `center`, rangePxLocal vs range, etc.)
- **Real-flow:** 6/7 PASS + 1 PARTIAL (focus camera coord mismatch)
- **Deferred (3 issues):** #4 brak delete UI, #5 focus camera coord mismatch, #6 brak POI sprites tactical

### **P2.2 — POI Create + Edit Modals (CRUD)** ✓
`m3-commit-p2-2-poi-modals`

- **Files:** 7 plików, 1279 LoC (większy niż plan 700-800 — DOM field renderers × 7 typów)
- **NEW:** POIModal.js (549), POIFormLogic.js (251), test (348)
- **Smoke:** 32/32 (T1×6 schema + T2×12 validate + T3×5 form→params + T4×5 reverse + T5×4 integration)
- **Decyzje:** D2=b standalone modal (function-based + Promise pattern z 14 istniejących modali), D6=a use existing updatePOI, D7=γ validation on submit, L28=A full-screen overlay
- **Dostarcza:** POIModal full CRUD, "+ Dodaj POI" header button, inline pencil + trash icons, browser confirm, type immutable na edit
- **Off-spec:** 5 (updatePOI EXISTS, type immutable, function-based pattern, Canvas hit zones, z=1000 codebase coherence)
- **Real-flow:** 10/10 PASS (D2 max length acceptable feature, F browser confirm UX issue)
- **Resolves:** #4 (brak delete UI)
- **NEW deferred (2 issues):** #7 Windows-style confirm UX, #8 browser maxlength feature acceptance

### **chore: custom confirm modal** ✓
`chore-custom-confirm-modal` (e8bb24a)

- **Files:** 5 plików, 193 LoC (ConfirmModal NEW 161 + 2 callsites + i18n × 2)
- **NEW:** ConfirmModal.js (161) — function-based showConfirmModal({title,message,confirmLabel,cancelLabel,danger}) → Promise<boolean>
- **Decyzje:** function-based + Promise pattern (V2/V4 P2.2 reuse), z=1000 codebase coherence
- **Dostarcza:** custom THEME-styled confirm modal (zastąpił window.confirm w P2.2)
- **V1 finding:** 2 legacy callsites poza P2.2 (ColonyOverlay army disband, UnitCardPanel unit disband) → deferred do M4
- **Off-spec:** 1 (ConfirmModal +200% LoC vs plan ze pełnymi keyboard handlers, focus glow, hexToRgb shadow)
- **Real-flow:** Re-F + Re-G PASS (po Filip's diagnostyce scrollY=360 bug ujawnił pre-existing P2.1 issue)
- **Resolves:** #7 (Windows-style confirm UX)

### **chore: POIPanel scroll clamp** ✓
`chore-poipanel-scroll-clamp` (5cfca89)

- **Files:** 1 plik, +13/-1 LoC
- **EDIT:** POIPanel.js — `Math.max(0, Math.min(scrollY, maxScroll))` w render (single source of truth) + `_maxScroll` cache dla handleScroll
- **Decyzje:** root cause fix przez clamp (nie symptom-targeted disable scroll dla short lists)
- **Dostarcza:** scrollY auto-clamped → POI auto-visible po delete/filter shrink (eliminuje "scroll up workaround")
- **Off-spec:** 0 (minimal targeted fix)
- **Real-flow:** Re-Scroll-1/2/3 PASS (3 scenariusze)
- **Resolves:** pre-existing P2.1 bug ujawniony przez akumulację create/delete operations

### **P2.3 — Create POI Mode + Tactical Sprites + Coord Fix + Coord Tooltip** ✓
`m3-commit-p2-3-create-poi-mode` (5da2093)

- **Files:** 15 plików, 858 LoC (882 ins / 24 del)
- **NEW:** CoordTransform.js (40), test (250)
- **EXTEND:** ThreeCameraController +10, POIPanel +5/-2 (#5 fix), RightClickMenuOptions +13/-2, RightClickMenu +13/-5, GameScene +201/-2, POIModal +17, FleetManagerOverlay +132/-1, TacticalRaycaster +18/-1, POIPanelLogic +71, i18n × 2
- **Smoke:** 31/31 (T1×6 round-trip + T2×8 picker→spec + T3×8 sprite data + T4×4 tooltip format + T5×5 picker flow)
- **Decyzje:** Q1=γ-b RightClickMenu 5 flat entries, Q2=a embedded type, Q3=β geometric shapes, Q4=b override P1.5 D2, Q5=γ focusOnGameplayCoord wrapper
- **Dostarcza:** atomic resolution 4 deferred issues + new feature
- **Off-spec:** 8 (WORLD_SCALE=10 vs hipoteza AU_TO_PX=110, ui:openPOIModal placeholder reuse, TARGET_POINT unused reuse, POIPanel button skip, TARGET_POINT inline finalize, EventBus loose coupling, regression test updates, etc.)
- **Real-flow:** 11/11 PASS A-K (~15-20 min)
- **Resolves:** #5 (focus camera coord), #6 (POI sprites tactical), Filip coord tooltip request, NEW create POI mode

---

## Phase P2 cumulative metrics

```
Commits:                                           5 (+ 0 sub-fix, najczystszy phase)
Real-flow scenariusze total (P2.1+P2.2+P2.3):      28 (7+10+11)
Real-flow PASS (z PARTIAL acceptable):             27/28 (96%)
Smoke cases dodane:                                119 (P2.1: 25, P2.2: 32, chore confirm: 0, chore scroll: 0, P2.3: 31)
Cumulative regression GREEN po P2.3:               256/256
Off-spec discoveries:                              19 (P2.1: 5, P2.2: 5, chore confirm: 1, P2.3: 8)
Lekcje workflow nowe w P2:                        9 (L44-L52)
Files unique zmienione w P2:                       ~22 (z dup.: ~36)
LoC delta total Phase P2:                          ~3200
```

## Off-spec patterns ujawnione w P2

P2 phase ujawnił **3 cumulative patterns** off-spec discovery:

### **Pattern 1 — Schema variation per entity type (L44, P2.1)**
POI shape różny per type (`point` waypoint, `waypoints[0]` patrol, `center` picket/rally/ambush). Resolution: schema-aware uniform extractor `getPOILocation(poi)` + `getPOIFormSchema(type)`. **Reused w P2.2 form rendering + P2.3 picker→spec mapping.**

### **Pattern 2 — Browser-native UX trade-offs (L47-L48, P2.2)**
- `window.confirm()` Windows-style → custom THEME modal (L47, resolved by chore)
- `<input maxlength>` browser-native cap → akceptowalne feature, NIE bug (L48)

### **Pattern 3 — Coord conversion + existing infrastructure reuse (L46/L50/L51, P2.3)**
- L46: coord space gaps cross-feature (P2.1 #5 → P2.3 #5 atomic resolution)
- L50: cite REAL formula PRZED hipoteza (WORLD_SCALE=10 vs AU_TO_PX=110)
- L51: existing infrastructure reuse trumps new abstraction (TARGET_POINT, ui:openPOIModal placeholder, RightClickMenu createPOI entry)

---

## Resolved issues w Phase P2

```
✓ #4  P2.1 brak delete UI w POI panel       → P2.2 (inline trash + Edit Delete)
✓ #5  P2.1 POI focus camera coord mismatch  → P2.3 (focusOnGameplayCoord + CoordTransform)
✓ #6  P2.1 brak POI sprites w tactical map  → P2.3 (_drawPOISprites geometric shapes)
✓ #7  P2.2 Windows-style confirm UX         → chore custom confirm modal
✓     pre-existing P2.1 scroll persistence  → chore scroll clamp (clamp na render)
```

**5/5 P2-introduced issues resolved w P2 phase.** Zero leftover do P3+.

## Acceptable known issues post-P2

```
DEFERRED do M4 (z poprzednich phases):
  - #1  Mapa 3D planet hover (RaycasterPure gap)        — M4 polish
  - #2  G2.3 cancel button hover                         — M4 polish
  - Star tooltip planet template (migration commit)     — M4 / future mini-commit
  - KOSMOS.gameScene undefined exposure                  — deferred chore
  - KOSMOS.gameConfig undefined exposure                 — deferred chore

DEFERRED do M4 (z P2):
  - 2 legacy window.confirm callsites (ColonyOverlay, UnitCardPanel) — M4
  - #8 Browser maxlength feature (acceptance, NIE bug)   — feature, no fix needed

DEFERRED future:
  - "(⚓ undefined)" w EventLog dla dock orders          — M1 pre-existing
  - Brak dock orderType                                   — P1.1 V7 known
  - Brak "out of range" UI feedback                       — częściowo P1.5 disabled menu
  - Vessele za małe sprite na 3D                          — UI limitation
```

**Total: 9 deferred issues** (z czego 1 jest feature acceptance, NIE bug). Wszystkie M3 P2-introduced **resolved**.

---

## Lekcje workflow nowe w Phase P2 (L44-L52)

### L44 — Schema variation per entity type → uniform helper
P2.1 ujawnił że POI ma różne fields per type. Resolution: pure helper `getPOILocation(poi)` schema-aware. Reused w P2.2 form rendering + P2.3 picker→spec mapping.

### L45 — One-at-a-time overlay pattern wymusza UX trade-off
Filip's "left sidebar coexist" niewykonalny w OverlayManager. Plan mode V4/V5 ujawnił constraint PRZED kodem. Architectural reframe (D5=I full-screen) zamiast fight pattern.

### L46 — Real-flow ujawnia coord space gaps cross-feature
P2.1 D4 (focus camera) i P2.3 (create POI) używają tego samego coord conversion. P2.1 pominął → bug ujawniony w real-flow. P2.3 atomic resolution.

### L47 — Browser-native UI elements potencjalnie psują immersję
`window.confirm()` używa Windows-style native dialog. Dla gier z custom THEME = breaking immersion. Resolution: custom modal (function-based + Promise pattern reuse).

### L48 — Browser-native HTML attributes mogą zastąpić validation
`<input maxlength>` browser-native cap blokuje przed validation post-submit. Akceptowalne jako feature (lepsze UX niż "tekst za długi" error post-submit).

### L49 — Scroll state out-of-bounds bug ujawniony tylko po akumulacji operacji
Pre-existing P2.1 bug ujawniony dopiero w P2.2 + chore custom confirm real-flow gdy create/delete operations zaakumulowały scrollY out-of-bounds. Resolution: render-time clamp `Math.max(0, Math.min(scrollY, maxScroll))`.

### L50 — Coord conversion: cite REAL formula PRZED hipoteza
P2.3 V3 ujawnił że hipoteza `AU_TO_PX` (110) była częściowo myląca — realny scaling factor `WORLD_SCALE` (10). Plan mode V_extra MUSI cytować REAL formulę z source code (z numerami linii), NIE hipoteza z prompta.

### L51 — Existing infrastructure reuse trumps new abstraction
P2.3 V_extra ujawnił 3 placeholders / unused features w codebase (PickerStateMachine.TARGET_POINT, ui:openPOIModal placeholder, RightClickMenu createPOI entry). Reuse zamiast new abstraction = lepsze workflow consistency.

### L52 — Loose coupling przez EventBus dla cross-component dispatch
Codebase preferuje loose coupling (gameScene NOT exposed na window.KOSMOS). Cross-component dispatch przez EventBus emit/listen, NIE direct method calls. Plan mode V_extra MUSI sprawdzić architectural style przed forsowaniem direct refs.

---

## Architectural insights z P2

### **POI ecosystem complete CRUD architecture**

```
                 USER ACTIONS
                      |
        ┌─────────────┼─────────────┐
        │             │             │
     READ          CREATE          UPDATE/DELETE
   (P2.1)        (P2.2 + P2.3)     (P2.2)
        │             │             │
   POIPanel    ┌──────┴──────┐  POIModal Edit
   (sort/      │             │  + inline pencil/trash
   filter/     POIModal      Picker mode
   live)       (manual X/Y)  (PPM tactical)
                                    
   Klawisz N   "+ Dodaj POI"  RightClickMenu PPM
                                  → 5 type entries
                                  → picker → modal pre-filled
        │             │             │
        └─────────────┼─────────────┘
                      │
                 POIRegistry
                 (M2b backend, untouched)
                      │
                      ↓
              EventBus (poi:created/updated/deleted)
                      │
                      ↓
        ┌─────────────┼─────────────┐
        │             │             │
   POIPanel     POI sprites     ThreeRenderer
   live update  tactical map     POI sprites 3D
                (P2.3)           (M2b unchanged)
```

### **CRUD operations infrastructure**

- **Read:** POIRegistry.listPOIs/getPOI (M2b) → POIPanelLogic helpers (P2.1) → POIPanel render (P2.1)
- **Create:** RightClickMenu PPM → PickerStateMachine → POIModal pre-filled (P2.3) **OR** POIPanel "+" → POIModal manual (P2.2) → POIRegistry.createPOI
- **Update:** POIPanel pencil → POIModal Edit pre-filled (P2.2) → POIRegistry.updatePOI (preserve ID, type immutable)
- **Delete:** POIPanel trash inline OR POIModal Edit Delete → ConfirmModal (chore) → POIRegistry.deletePOI

### **Coord systems unified (P2.3)**

```
Three.js world coords (Y=0 plane, XZ)
        ↕ × WORLD_SCALE (10)
Gameplay coords (px from origin)  ← SOURCE OF TRUTH
        ↕ tacticalToWorld / inverse
Tactical canvas coords (px in FleetOverlay map)
        ↕ raycaster intersect XZ plane  
Screen coords (clientX, clientY mouse events)
```

**Single source of truth:** gameplay px. Wszystkie inne systemy konwertują do/z gameplay px przez:
- `gameplayToWorld(p)` / `worldToGameplay(wx, wz)` (CoordTransform.js, P2.3)
- `tacticalToWorld(local.x, local.y, viewState)` (TacticalRaycaster.js, P1.3.5)
- `OrderDispatcher.POINT_FROM_WORLD(wp)` (P1.3.5 fix)

---

## Procedural insights

P2 phase = **najczystsze workflow w M3:**

```
P2.1 commit:                  1 sesja, 0 post-fix scope-relevant
P2.2 commit:                  1 sesja, 0 post-fix scope-relevant
chore custom confirm:         1 sesja, 0 post-fix
chore scroll clamp:           1 sesja, 0 post-fix
P2.3 commit:                  1 sesja, 0 post-fix
─────────────────
Total: 5 sesji, 0 post-fix scope-relevant
```

vs Phase P1 (5 main commits + 2 sub-fix + 1 docs = 8 commits, ~14 sesji).

**Plan mode dojrzał cumulatively:** każda lekcja z P1 odzwierciedlona w P2 V verifications. Off-spec discoveries adaptowane PRZED kodem zamiast post-fix iteracji.

---

## Status M3 progress po Phase P2

```
PHASE P1 COMPLETE                        ← 5 + 2 sub-fix + 1 docs commits
PHASE P2 COMPLETE                        ← 5 commits (P2.1 + P2.2 + 2 chores + P2.3)
─────────────────
Cumulative: 13 atomic commits

M3 progress: ~80% done

[NEXT]
P3.1 — Picket + Rally runtime systems    1-2 sesje
└─ Detection logic (picket = enemy entry → alert events)
└─ Member assembly (rally = multi-vessel rendezvous)
└─ EventLog integration

P3.2 — Ambush + Integration              1-2 sesje
└─ Ambush trigger (enemy entry → combat init)
└─ Hidden state mgmt
└─ Integration z combat system

P4 — Polish (EventLog UX)                1-2 sesje
└─ EventLog improvements per design doc §6 P4
└─ M4 cleanup deferred items (KOSMOS.gameScene exposure, legacy confirms, etc.)

─────────────────
Realistic M3 close: 3-5 sesji więcej
Cumulative tag: M3-COMPLETE po P4
```

---

## Phase P2 deliverables — co realnie gracz dostał

**Z perspektywy gameplay UX po Phase P2:**

1. **POI Panel sidebar** (klawisz N) — gracz widzi listę swoich POI, sortuje, filtruje, klika żeby skupić kamerę
2. **Create POI** — gracz może utworzyć POI dwoma drogami:
   - **Manual:** "+ Dodaj POI" w panel → modal → wpisuje X/Y ręcznie
   - **PPM picker:** prawym myszki na tactical map → menu z 5 typami → klik → modal pre-filled
3. **Edit POI** — pencil icon w panel → modal pre-filled → save (type immutable)
4. **Delete POI** — trash icon inline lub Delete w modal → custom THEME confirm → POI usunięty
5. **POI w tactical map** — geometric shapes z kolorami per type, range circles dla picket/ambush
6. **Coord tooltip** — hover na pustym obszarze (3D + tactical) 500ms → coord display
7. **Focus camera** — klik POI row → kamera ślizga się DO sprite (correct coord conversion)

**Phase P2 = pełen POI ecosystem.** Backend M2b POIRegistry untouched, wszystko przez UI layer.

---

**PHASE P2 COMPLETE.** ⚠️ MAJOR MILESTONE.

5 commitów, 256/256 GREEN, 9 nowych lekcji workflow, 5/5 P2-introduced issues resolved.

**Phase P3 next:** picket + rally + ambush runtime systems (detection logic, alert events, member assembly, integration z combat).

**Cumulative M3 lessons total: 52** (M2b L1-L14 + M3 L15-L52).

Po P4 → **M3 CLOSE.**
