# M3 PHASE P1 COMPLETE — mega-snapshot retrospective

**Status:** Phase P1 (Orders UI + Selection + Tooltips) **DONE**
**Date range:** P1.1 początek → P1.5 close
**Total time:** ~14 sesji
**Tag close:** `m3-commit-p1-5-tooltips-complete`

---

## Phase P1 deliverables

Phase P1 dostarcza **kompletny user-facing flow zarządzania flotą**:

1. **RightClickMenu** (P1.1) — kontekstowe menu z opcjami order'owymi per target type
2. **Mouse interactions** (P1.2 + P1.3.5) — raycaster mapy 3D + tactical raycaster, click/PPM dispatch, picker mode
3. **Order dispatch** (P1.3) — real wiring `MOS.issueOrder` z UI, picker patrol manualny, ESC keyboard handlers
4. **Cancel button** (P1.4 + P1.4.5) — UI button anulujący order + physics-level vessel motion stop (fix M1 bugu)
5. **Universal tooltips** (P1.5) — hover info system z 500ms delay, full coverage (canvas + UI elements)

**Po Phase P1:** gracz może wydawać i anulować rozkazy flotowe całkowicie przez UI (bez devtools), z visual feedback (status badge + tooltip + EventLog wpis).

---

## Stack commits (chronologicznie)

```
m3-commit-p1-5-tooltips-complete         post-fix #1 mousemove planet-canvas
                                         base ~1008 LoC universal tooltip system
m3-commit-p1-4.5-cancel-stops-vessel     fix M1 9-month bug (MOS.cancelOrder physics)
m3-commit-p1-4-complete                  cancel button + status display + EventLog
m3-commit-p1-3.5-tactical                base + post-fix #1 (2D worldPoint + mapa 3D PPM disable)
m3-commit-p1-3-complete                  orders + picker + ESC keyboard
m3-commit-p1-2-complete                  base + 3 post-fix saga (vessel.owner, planet-canvas)
m3-commit-p1-1-complete                  RightClickMenu + selection model
─────────────────────────────────────────────────────────────────────────────
docs commit: M3 EventLog access pattern clarification (preventive)
```

**5 main commits + 2 sub-fix (P1.4.5 cancel motion + P1.5 mousemove dispatch) + 1 docs commit.**

---

## LoC + tests cumulative

```
P1.1: ~XXX LoC (RightClickMenu + selection)
P1.2: 600 LoC base + 3 post-fix iteracji (raycaster + handlers)
P1.3: 814 LoC (orders + picker + ESC)
P1.3.5: 467 LoC base + 80 LoC post-fix (tactical retarget)
P1.4: 242 LoC (cancel button + helpers)
P1.4.5: 292 LoC (cancel motion fix)
P1.5: ~1028 LoC (universal tooltips + post-fix)

Cumulative M3 P1: ~3500 LoC dodanych łącznie

Smoke tests cumulative:
  P1.1: 17
  P1.2: 20
  P1.3: 54
  P1.3.5: 19
  P1.4: 25
  P1.4.5: 5
  P1.5: 22
  ─────────
  M3 P1: 162/162 GREEN ✓
  
+ M2b regression: 81/81 GREEN
═══════════════════════════════
TOTAL: 243/243 GREEN ✓✓✓
```

---

## Sessions + post-fix breakdown

```
Commit         Sessions    Post-fix    Notes
──────────────────────────────────────────────────────────────────
P1.1               1            0      Smooth, baseline
P1.2               4            3      Raycaster saga (vessel.owner shape, planet-canvas)
P1.3               2            0      Strong plan mode, off-spec ujawnione PRZED kodem
P1.3.5             3            1      Architectural retarget (Strategy A reframe)
P1.4               1            0      Cancel button, ujawnia M1 pre-existing bug
P1.4.5             1            0      Mini-fix, symetria z _onVesselArrived
P1.5               2            1      Universal tooltips, 5 off-spec discoveries
──────────────────────────────────────────────────────────────────
TOTAL             14            5      ~2 sesje/commit, 0.7 post-fix/commit
```

**Post-fix rate downward trend:**
- P1.1-P1.2 (early phase): 3/2 = 1.5 post-fix per commit
- P1.3-P1.5 (mature phase): 2/4 = 0.5 post-fix per commit

**Plan mode V verifications dojrzewały** — od P1.3 wzwyż coraz lepiej cytowały real entity defs PRZED kodem.

---

## Lekcje cumulative L1-L41

### M2b (L1-L14): 14 lekcji bazowych workflow

L1: Smoke ≠ real-flow
L2: Bilingual strings PL/EN ZAWSZE
L3-L7: M2b internal patterns (POI registry, intel, prediction cones)
L8: XZ plane convention (Three.js camera Y=0)
L9: Extend existing handlers, NIE new listeners
L10: Test convention (real fixtures, no mocks where avoidable)
L11-L14: M2b post-fix patterns

### M3 P1.1-P1.5 (L15-L41): 27 lekcji nowych

**P1.1-P1.2 (L15-L23):** raycaster + selection + handlers patterns
- L15: Pre-existing state w refactorach
- L16: Devtools-only path jako legitimate test pattern
- L17: Off-spec discoveries są signal of spec doc maturing
- L18: Module separation dla Node ESM testability (Pure vs Helper split)
- L19: Every gameState lookup w pure helper musi cytować real def
- L20: Smoke fixtures musisz cytować real entity defs
- L21: Pure helpers może duplikować logikę z `// KEEP IN SYNC` comment
- L22: Plan mode V "co X istnieje" insufficient — runtime check krytyczny
- L23: `isOverUI` viewport-wide blocking gdy any overlay open

**P1.2 post-fix saga (L24-L25):**
- L24: Smoke fixtures fragile cross-commit — `objectContaining` nie strict count
- L25: Real-flow testing wymaga F5 między scenariuszami które mutują state

**P1.3 (L26-L27):**
- L26: Test procedures musi cytować exact API signatures
- L27: MOS reject ≠ callsite bug — direct test PRZED assumption

**P1.3.5 (L28-L33):** architectural retarget lessons
- L28: Gameplay intent per surface (mapa 3D = telewizor vs tactical = command surface)
- L29: Spec doc apparent gap może być mismatch z runtime API
- L30: System X może już istnieć — `grep` PRZED założeniem `gameState.get(X)`
- L31: Pure helpers konsumujące outputs z multiple sources musi obsługiwać multiple shapes
- L32: D2 "disable handlers" wymaga target-zależnego check, nie stan-zależnego
- L33: Tag = symbol Filip's real-flow pass, NOT smoke completion

**P1.4 (L34-L37):**
- L34: Existing code może już realizować feature — `grep` PRZED założeniem helpera
- L35: Cancel features ujawniają state lifecycle gaps (rentgen pattern)
- L36: Pure helper extracted mid-impl jest valid signal, NIE scope creep
- L37: Diagnostyczne dane > moja interpretacja (autorefleksja)

**P1.4.5 (L38):**
- L38: Bug może żyć latami przez **test gap niewidocznego flow** (data-level test ≠ physics-level integration)

**P1.5 (L39-L41):**
- L39: Plan mode V1 grep mandate — multi-keyword variants (kebab-case, prefix variants)
- L40: Pre-existing bug w upstream system blokuje downstream feature (P1.5 reuse RaycasterPure z P1.2 gap)
- L41: Multi-canvas overlay event target gotcha (cumulative pattern z P1.2 click + P1.5 mousemove)

---

## Najbardziej powtarzające się lekcje

### **L34 — existing code grep PRZED założeniem (5x)**

W kolejnych commitach M3 lekcja **powtarzała się**:
1. P1.4 V6: `_drawMovementOrderLabel` już realizuje "status badge" (M1 §8.4)
2. P1.5 V1: 3 per-overlay tooltipy + topbar-tooltip pre-existing
3. P1.5 V1: 4ty `colony-3d-tooltip` przegapiony przez grep (different prefix)
4. P1.5 V2: 5 entity field gaps vs spec §5.4 (vessel.hp, empire, planet.owner/population, systemName)
5. P1.4.5 Investigation #2: `_onVesselArrived` symetria (existing pattern reuse)

**Pattern:** spec doc często opisuje **planowane** features, runtime ma **istniejące** patterns które trzeba odkryć. `grep` z multi-keyword variants PRZED każdym design decision.

### **L41 — multi-canvas overlay gotcha (3x)**

P1.2 click handler: `'three-canvas'` filter, ale `'planet-canvas'` capture'uje events → post-fix #2.
P1.3.5 PPM blocking: similar — wymagało target.id check + bounds check.
P1.5 mousemove: powtórzył P1.2 bug → post-fix #1.

**M4 cleanup candidate:** uniwersalny `_isMainCanvasEvent(e)` helper.

### **L19/L20 — real entity defs cytaty (każdy commit)**

P1.2: vessel.owner vs ownerEmpireId saga
P1.3: Planet.x/y nie .position (V3)
P1.3.5: 2D worldPoint vs 3D, OrderDispatcher.POINT_FROM_WORLD
P1.4: MOS.cancelOrder boolean nie {ok}
P1.4.5: vessel.position.state enum {docked, orbiting, in_transit}
P1.5: 5 entity field gaps + 3-shape ownership

**Plan mode V_extra mandate:** zawsze cytować real entity defs z konkretnymi numerami linii.

---

## Acceptable known issues po Phase P1

1. **Mapa 3D planet hover** (P1.5) — RaycasterPure pre-existing gap nie wykrywa planet sprites. OLD `colony-3d-tooltip` fallback. **Deferred do M4** (raycaster refactor).

2. **G2.3 cancel button hover** (P1.5) — FleetOverlay canvas hover detection dla `cancel_movement_order` zone. Filip "nie musi chyba". **Deferred do M4** lub osobny chore commit.

3. **OLD `colony-3d-tooltip` overlap** (P1.5 visual) — gracz widzi 2 tooltipy na hover planet w tactical map. **Następny chore commit:** hide OLD permanently (NEW jest superset).

4. **`KOSMOS.gameScene` undefined** (P1.3.5) — exposure missing. **Deferred** do osobny chore commit.

5. **`KOSMOS.gameConfig` undefined** (P1.3.5) — exposure missing. **Deferred** do osobny chore commit.

6. **`(⚓ undefined)` w EventLog** dla dock orders (M1 pre-existing).

7. **Brak dock orderType** (P1.1 V7).

8. **Brak "out of range" UI feedback** dla daleko od fuel range vessels (P1.3, częściowo rozwiązane przez disabled menu options w P1.5).

9. **Vessele za małe sprite na mapie 3D** (gameplay UI limitation, P1.2).

10. **`createPOI` key `point`** (nie `center`) — spec doc inconsistency.

11. **Devtools `KOSMOS.debug.cancelOrder` NIE wywołuje EventLog push** (P1.4) — expected behavior dla raw devtools.

12. **Combat-while-paused** (1 raport) — niereprodukowalne z udokumentowanego kodu, telemetria available.

---

## Workflow patterns które się sprawdziły

### Plan mode struktura

```
1. V verifications PRZED kodem (~6-8)
2. Decyzje rozstrzygnięte (~5-7)
3. Off-spec discoveries dokumentowane explicit
4. Diff outline (LoC per plik)
5. Test cases T1-T_N outline
6. Real-flow procedure A-H (~10-15 min)
7. Atomic commit message draft
```

**Effective dla M3 P1.3+** (3 off-spec discoveries PRZED kodem zamiast 3 post-fix iteracji).

### Atomic commit policy

```
1 commit = 1 logical scope
Pre-existing bug discovered → osobny commit (jak P1.4.5, P1.5 post-fix)
Refactor mid-impl → akceptowalne jeśli zachowuje atomic scope (jak P1.4 D2)
```

**L33 mandate strict:** tag PO Filip's pass real-flow, NIE po smoke completion.

### Real-flow gate Filipa

```
Setup pre-flight (~2 min): API sanity, devtools verify
Scenariusze A-H (~10-15 min): 5-10 user-facing tests
Pass criteria explicit per scenario
Fail → diagnostyka L37 (4 osobne pola: console + raycaster + timer + DOM state)
```

---

## Co dalej — rest of M3

```
[NEXT]      chore: hide redundant colony-3d-tooltip   ~5 LoC, ~5 min
─────────────────────────────────────────────────────
P2.1        POI panel sidebar (sortable, filter)      1-2 sesje
P2.2        POI create + edit modals                  2-3 sesje  
P2.3        Create POI mode (picker + EventBus)       1-2 sesje
P3.1        PicketAlertSystem + RallyTrackerSystem    1-2 sesje
P3.2        AmbushTriggerSystem + integration         1-2 sesje
P4          Polish + EventLog UX (channel filters)    1-2 sesje
─────────────────────────────────────────────────────
M3 close                                              ~7-13 sesji
```

**Realistic estimate** (bazując na P1 phase pace):
- **Optymistycznie:** 7-8 sesji do M3 close
- **Realistycznie:** 10-12 sesji do M3 close
- **Pesymistycznie:** 14+ sesji jeśli P2 ujawni nowe architectural reframes

**P2 phase (POI UI)** = 3 commits, najbogatszy scope w M3.
**P3 phase (runtime)** = 2 commits, mniej UI more logic.
**P4 phase (polish)** = 1 commit, najlżejszy.

---

## Najbardziej wartościowe meta-lekcje z Phase P1

### 1. **Plan mode dojrzewa cumulatively**

Każdy commit dorzuca lekcje używane w następnym. P1.1 nie miał "L34 mandate", P1.5 ma wszystkie L1-L40 jako mandate. **Workflow exponentially improves** z ilością lekcji.

### 2. **Post-fix nie jest porażką**

P1.2 miało 3 post-fix iteracji (saga). P1.3-P1.5 miały 0-1 każdy. Post-fix to **legitimate iteration**, nie failure. Tag scope-relevant commit, fix pre-existing bugs w osobnych commits.

### 3. **Real-flow ujawnia bugs ukryte przez devtools-only testing**

P1.4 ujawniło 9-miesięczny M1 bug (cancel motion). P1.5 ujawniło RaycasterPure planet gap (P1.2 era).
**User-facing UI = rentgen** dla gameplay layer integration.

### 4. **Spec doc jest draft, kod jest ground truth**

Spec doc zakłada features (vessel.hp, planet.systemName, etc.) które runtime nie ma. Plan mode V_extra MUSI cytować real entity defs PRZED założeniem schema z spec doc. **L19/L20 cumulative.**

### 5. **Atomic commits + workflow consistency = predictable progress**

5 commits + 2 sub-fix w 14 sesjach = ~2 sesje/commit średnio, predictable. Każdy commit ma:
- Unique tag
- Atomic scope
- Real-flow gate
- Snapshot delta
- Plan mode + commit + retest cycle

**Predictability dla future planning** (oszacowanie M3 close = 7-13 sesji więcej).

---

## Lekcja meta-meta — about Filip + me

**L37 (diagnostic data > moja interpretacja)** ujawnione w P1.4 retrospektywie. Filip's konsekwentne raportowanie F/G ("vessel leci po cancel") było **real bug**, ja zinterpretowałem jako "false alarm" 2x zanim diagnostyka pokazała realny stan.

**Pattern do future:** gdy Filip raportuje **ten sam problem** drugi raz (różne sesje, ten sam objaw) — **zaufaj danym**, nie szukaj alternative explanation. Druga diagnostyczna iteracja z większą granularnością (4 osobne pola: state + velocity + mission + status) zamiast wszystko-w-jednym dump.

W Phase P2+ — kontynuować ten autorefleksyjny pattern. Filip's gameplay knowledge > moja statyczna analiza kodu.

---

**PHASE P1 CLOSED.** 5 commits + 2 sub-fix + 1 docs = **8 atomic commits.** **41 lekcji** workflow knowledge base. **243/243 smoke GREEN.** **14 sesji.**

Workflow z m2b-complete sprawdza się **drugi raz** w ciężkim phase'ie. Ready dla P2.* — POI UI, najbogatszy scope w M3.

🎉 **Solidna pozycja na P2 start.** 🚀
