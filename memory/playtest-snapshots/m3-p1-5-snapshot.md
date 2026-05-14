# M3 P1.5 — COMPLETE (snapshot delta vs P1.4.5)

**Tag:** `m3-commit-p1-5-tooltips-complete` (commit P1.5 base + post-fix #1)
**Predecessor:** `m3-commit-p1-4.5-cancel-stops-vessel`
**Save version:** v67 (bez zmian — efemeryczny tooltip state)

## Co to za commit

P1.5 dostarcza **uniwersalny tooltip system** z full coverage (C strategy):

1. **Universal Tooltip component** — DOM-based z=99999, boundary flip, single instance
2. **Tooltip content per entity type** — pure helper `getTooltipContent` z per-type schema (vessel/planet/POI) + `_resolveVesselEmpireName` 3-shape ownership resolver
3. **Hover detection** — reuse RaycasterPure (mapa 3D) + TacticalRaycaster (tactical map) + DOM `data-tooltip` attribute (UI elements)
4. **500ms hover delay** — configurable w `GameConfig.UI.tooltipDelayMs`

**Last P1 commit. Phase P1 DONE.**

## Stack zmian

```
[post-fix #1]  M3 P1.5 post-fix #1: mousemove planet-canvas dispatch    ← HEAD + tag m3-commit-p1-5-tooltips-complete
[base commit]  M3 P1.5: Universal tooltip system (last P1 commit)
3f643d0  M3 P1.4.5: cancelOrder zatrzymuje vessel motion              ← predecessor tag
df9175c  M3 P1.4: Cancel order button + FleetOverlay extensions
```

## Files (cumulative across base + post-fix)

```
P1.5 base (~1008 LoC, 10 plików):
  src/ui/Tooltip.js                       NEW   ~180  DOM component, dual sources, boundary flip
  src/utils/TooltipContent.js             NEW   ~190  Pure helper per-type content lookup
  src/scenes/GameScene.js                 EXTEND +164 mousemove + multi-method tooltip dispatch
  src/scenes/UIManager.js                 EXTEND +7   tooltip access hookup
  src/ui/FleetManagerOverlay.js           EXTEND +32  cancel button hover + tactical hover
  src/ui/RightClickMenu.js                EXTEND +19  data-tooltip dla disabled options
  src/i18n/pl.js                          EXTEND +34  tooltip.* strings PL
  src/i18n/en.js                          EXTEND +34  tooltip.* strings EN
  src/config/GameConfig.js                EXTEND +7   UI.tooltipDelayMs
  tmp_m3_p1_5_tooltip_test.mjs            NEW   ~250  T1×12 + T2×5 + T3×4 + T4×1 = 22 cases

P1.5 post-fix #1 (~20 LoC, 1 plik):
  src/scenes/GameScene.js                 EXTEND +20/-1 mousemove planet-canvas dispatch
                                                         + bound check via toLocalUI()

Total: ~1028 LoC dodane (10 plików base + 1 post-fix on same file)
```

## Verifications + decisions

### V1-V8 + V_extra:

| V | Wynik | Discoveries |
|---|-------|-------------|
| V1 | 3 per-overlay tooltipy istnieją (ColonyOverlay z=50, EconomyOverlay z=200, TradeOverlay z=200) + topbar-tooltip z=60 | **OFF-SPEC #1**: brak universal Tooltip.js, scenario (β) — extending bez refactoring per-overlay |
| V2 | 5 entity field gaps vs spec §5.4 schema | **OFF-SPEC #2-5** (patrz Off-spec discoveries) |
| V3 | RaycasterPure (P1.2) + TacticalRaycaster (P1.3.5) reused via existing API | OK |
| V4 | Brak istniejącego globalnego mousemove handlera dla hover | Nowy listener |
| V5 | DOM container z=99999 (nad picker-banner z=9998 i RightClickMenu z=9999) | OK |
| V6 | Timer state machine `_currentKey` discriminator | OK |
| V7 | Selection ≠ hover (niezależne stany) | OK |
| V8 | i18n: 33 keys × 2 lang dodane | OK |
| V_extra (post-fix #1) | mousemove `e.target.id` ZAWSZE `'planet-canvas'` (z=4 capture nad three-canvas i ui-canvas) | **OFF-SPEC #6**: P1.2 post-fix #2 pattern dla mousemove missing w P1.5 base |

### Decyzje (D1-D6):

- **D1: NO FEATURES gate** — read-only feature, fail = invisible
- **D2: A — empty space no tooltip**
- **D3: SKIP** wraki tooltip (M4 future)
- **D4: A — static snapshot** content (KISS)
- **D5: B — configurable** w `GameConfig.UI.tooltipDelayMs = 500`
- **D6: α — `data-tooltip` attribute pattern** dla UI elements

## Off-spec discoveries (6)

1. **vessel.hp brak na entity** — schema spec §5.4 zakłada HP, runtime nie ma. SKIP linia (L24 robust). Future M4 doda persistent HP.
2. **vessel.empire brak** — resolve przez `_resolveVesselEmpireName` z 3-shape ownership (`isEnemy` / `owner` / `ownerEmpireId`). Helper pure.
3. **planet.owner/population brak na entity** — lookup przez `colonyManager.getColony(planetId)`; null → "Neutralne".
4. **planet.systemName brak** — SKIP linia "System:" (single-system MVP). Future M4 multi-system.
5. **3 per-overlay private tooltipy** (ColonyOverlay/EconomyOverlay/TradeOverlay) + topbar-tooltip — bez refactoru. Universal nowy z=99999 koegzystuje.
6. **post-fix #1**: mousemove `e.target.id === 'planet-canvas'` (P1.2 post-fix #2 pattern, P1.5 base nie skopiowało dla mousemove).

## Test results

```
P1.5 (NEW):
  T1×12 (getTooltipContent per type)              12 PASS
  T2×5  (schema robustness L24)                    5 PASS
  T3×4  (_resolveVesselEmpireName 3-shape)        4 PASS
  T4×1  (edge cases)                               1 PASS
  ─────────────────────────────────────
  P1.5 cumulative                                 22 PASS

M3 P1 cumulative (po post-fix #1):
  P1.1 menu                                       17 PASS
  P1.2 raycaster                                  20 PASS
  P1.3 orders                                     54 PASS
  P1.3.5 tactical                                 19 PASS
  P1.4 cancel                                     25 PASS
  P1.4.5 cancel motion                             5 PASS
  P1.5 tooltips                                   22 PASS
  ─────────────────────────────────────
  M3 P1: 162/162 GREEN ✓

M2b spot-check (last full check w P1.4.5 close):
  M2b suite: 81/81 GREEN ✓ (sanity zostawione, nie ruszane w P1.5 fix)

Cumulative dla P1 close: ~243/243 GREEN
```

## Real-flow scenariusze A-H + Re-tests

### Initial pass (P1.5 base):
- A — FAIL (vessel hover w tactical map nie pojawia się)
- B — PARTIAL (OLD `colony-3d-tooltip` pokazuje primitive, NEW nie odpala)
- C-vessel — PASS
- C-planet — FAIL (RaycasterPure gap)
- D — PASS
- E — n/a (sprite za małe + OLD overlap)
- F — PASS (devtools direct)
- G1 (disabled menu) — PASS
- G2.3 (cancel button hover) — FAIL (Filip "nie musi chyba")
- H — PASS (regression)

### Post-fix #1 retest:
- **Re-A — PASS** ✅ (vessel hover tactical, krytyczny scenario)
- **Re-B — PASS** ✅ (planet hover tactical — niespodzianka, TacticalRaycaster wykrywa planet sprites poprawnie, bo 2D bbox check niezależny od RaycasterPure)
- **Re-C-vessel — PASS** ✅
- **Re-G1 — PASS** ✅ (data-tooltip nadal działa)
- **Re-H — PASS** ✅ (regression gate)

**5/5 scenariuszy retest PASS.** Plus Re-D, Re-E, Re-F nie wymagały retest (mousemove fix dotyczy tylko routing, devtools direct i empty space ignoring nadal działają).

## Acceptable known issues po P1.5

1. **Mapa 3D planet hover** — RaycasterPure (P1.2) nie wykrywa planet sprites (P1.2 pre-existing gap). NEW tooltip nie odpala się. **OLD `colony-3d-tooltip` (z=40) pokazuje primitive content jako fallback.** Mixed UX acceptable. **Deferred do M4** (Universal raycaster refactor) lub P2.* (POI rendering w tactical może wymusić extension).

2. **G2.3 cancel button hover** — FleetOverlay canvas hover detection dla `cancel_movement_order` zone nie hookup'owany. Filip's "nie musi chyba". **Deferred do M4** lub osobny chore commit.

3. **`colony-3d-tooltip` overlap** — gdy gracz hover na planet w tactical map, OBA tooltips widoczne (NEW z=99999 nad OLD z=40). Visually NEW dominuje, ale gracz widzi 2 panele. **Następny chore commit:** hide OLD permanently (NEW jest superset).

4. **`KOSMOS.gameScene` undefined** — pre-existing P1.3.5 known issue, deferred.

5. **`KOSMOS.gameConfig` undefined** — pre-existing P1.3.5 known issue, deferred.

## Lekcje z P1.5 (kandydaci L39-L41)

### L39 — Plan mode V1 grep mandate: multi-keyword variants

V1 grep z P1.5 plan mode szukał `tooltip|Tooltip|hover|onMouseEnter|onMouseLeave` ale **przegapił `colony-3d-tooltip`** (different prefix pattern `colony-3d-` zamiast `colony-`). 

**L34 cumulative dla M3:** P1.4 (existing _drawMovementOrderLabel), P1.5 (3 per-overlay tooltipy + 4ty colony-3d-tooltip), P1.5 V2 (5 entity off-specs).

**Plan mode mandate dla M3+:** dla feature który "shows info" / "displays content" / "renders" — używać **multi-keyword grep z prefix variants**:
```bash
grep -rn "tooltip\|Tooltip\|hover\|Hover\|HoverLabel\|InfoCard\|Nameplate\|popup\|Popup\|inspector\|Inspector\|colony-3d\|hover-label\|info-card" src/
```

Single keyword grep przegapi systems używające inne nazewnictwo.

### L40 — Pre-existing bug w upstream system blokuje downstream feature

P1.5 reuse RaycasterPure (z P1.2) dla mapa 3D hover detection. **RaycasterPure ma pre-existing gap** — nie wykrywa planet sprites na mapie 3D (zwraca `'empty'` dla planet sprite hits). Plan mode P1.2 V_extra przegapil to bo focus był vessel selection use case.

P1.5 plan mode V3 **zaakceptował** RaycasterPure jako reusable bez sprawdzenia pełnego coverage. **Mapa 3D planet hover fail** ujawniony dopiero w real-flow C scenariusz.

**Plan mode mandate dla feature reusing istniejący system:** sprawdzić **wszystkie typy entity** które feature obsługuje, nie tylko primary use case. V_extra musi cytować coverage matrix:

```
Feature P1.5 obsługuje: vessel, planet, POI, empty
RaycasterPure (P1.2) zwraca: vessel ✓, POI ✓, empty ✓, planet ✗ (gap)
TacticalRaycaster (P1.3.5) zwraca: vessel ✓, planet ✓, POI ✓ (no gap)
```

Niezgodność (mapa 3D planet gap) musi być explicit'nie zaadresowana PRZED kodem (defer / fix / disable).

### L41 — Multi-canvas overlay event target gotcha (cumulative pattern)

P1.2 click handler miał problem: `e.target.id === 'three-canvas'` filter ale realnie events docierają do `'planet-canvas'` (z=4 overlay). Naprawione w post-fix #2.

P1.5 mousemove handler **powtórzył ten sam bug** (V_extra w post-fix #1 ujawnił).

**Pattern:** EVERY new mouse handler (click, mousemove, mouseenter, contextmenu) MUSI explicit'nie sprawdzać `'three-canvas' || 'planet-canvas'` (oba). Single-target check przegapi `planet-canvas` events.

**M4 cleanup candidate:** uniwersalny helper `_isMainCanvasEvent(e)` shared dla wszystkich mouse handlers (click + mousemove + mouseenter + contextmenu). Eliminuje L41 risk dla future commits.

## Konkretny diff post-fix #1 (mousemove dispatch)

```js
// PRZED (P1.5 base):
if (targetId === 'three-canvas' || targetId === 'planet-canvas') {
  this._tooltipHoverFromMain3D(clientX, clientY);
  return;
}
if (targetId === 'ui-canvas') {
  this._tooltipHoverFromTactical(clientX, clientY);
  return;
}

// PO (post-fix #1):
const isMainCanvas = (targetId === 'three-canvas' || targetId === 'planet-canvas');
if (isMainCanvas) {
  const fleetOv = this.uiManager?.overlayManager?.overlays?.fleet;
  const b = fleetOv?._visible ? fleetOv._mapBounds : null;
  if (b) {
    const local = this.uiManager?.toLocalUI?.(clientX, clientY);  // ← KRYTYCZNE: UI_SCALE conversion
    if (local && local.x >= b.x && local.x <= b.x + b.w
              && local.y >= b.y && local.y <= b.y + b.h) {
      this._tooltipHoverFromTactical(clientX, clientY);
      return;
    }
  }
  this._tooltipHoverFromMain3D(clientX, clientY);
  return;
}
if (targetId === 'ui-canvas') {  // Fallback
  this._tooltipHoverFromTactical(clientX, clientY);
  return;
}
```

**Krytyczne odchylenie od mojego planu:** Claude Code dodał `toLocalUI()` konwersję przed bound check. Mój plan porównywał `e.clientX/clientY` bezpośrednio z `_mapBounds`, ale `_mapBounds` żyje w **ui-canvas-local space** (po UI_SCALE). Bez `toLocalUI` fix by failował na komputerach z UI_SCALE != 1. **L17 + L36 w akcji** — Claude Code nie akceptuje promptu literalnie.

## Procedural

P1.5 wymagało:
- 1 sesja base commit (~1008 LoC, 10 plików)
- 1 sesja post-fix #1 (~20 LoC mousemove dispatch)
- ~10 min real-flow A-H + retest po post-fix
- **Total: 1.5-2 sesje**

vs poprzednie commits:
- P1.1: 1 sesja, 0 post-fix
- P1.2: 4 sesje, 3 post-fix
- P1.3: 2 sesje, 0 post-fix
- P1.3.5: 3 sesje, 1 post-fix
- P1.4: 1 sesja, 0 post-fix
- P1.4.5: 1 sesja, 0 post-fix (M1 bug fix)
- **P1.5: 2 sesje, 1 post-fix**

Średnia całe Phase P1: **2 sesje per commit, ~1 post-fix per commit.** Workflow stabilny.

## Status overall

```
P1.1 ✓     1 sesja, 0 post-fix    RightClickMenu + selection
P1.2 ✓     4 sesje, 3 post-fix    Tactical map mouse mapa 3D
P1.3 ✓     2 sesje, 0 post-fix    Order issue + picker + ESC
P1.3.5 ✓   3 sesje, 1 post-fix    Tactical retarget
P1.4 ✓     1 sesja, 0 post-fix    Cancel button
P1.4.5 ✓   1 sesja, 0 post-fix    Cancel motion fix (M1 bug)
P1.5 ✓     2 sesje, 1 post-fix    Universal tooltips (LAST P1)

PHASE P1 COMPLETE — 5 commits + 2 sub-fix, ~14 sesji łącznie
```

## Next: Chore commit + P2.1

### Chore commit najpierw (~5 min):
**`chore: hide redundant colony-3d-tooltip (P1.5 superseded)`**
- 1 plik (gdzie OLD jest tworzony), ~5-10 LoC
- Disable show() dla planety (NEW jest superset)
- Można zostawić show() dla vessel jeśli zachowuje wartość, lub też hide

Atomic separation: P1.5 tworzy NEW, chore commit ukrywa OLD redundant. Workflow consistency.

### Po chore — P2.1:
**POI panel sidebar** — pierwsza P2 commit. Reuse przyswojonego workflow z P1 phase (38+ lekcji jako mandate).

---

## Lekcje cumulative

**41 lekcji workflow** w M3+M2b knowledge base po P1.5:
- M2b: L1-L14 (14 lekcji)
- M3 P1.1-P1.5: L15-L41 (27 lekcji)

P2.1 prompt będzie miał wszystkie L1-L41 jako mandate'y.

---

**P1.5 CLOSED.** **PHASE P1 COMPLETE.** 162/162 P1 smoke + 5/5 retest PASS po post-fix #1. Universal tooltip system live, 4 acceptable known issues deferred (mapa 3D planet, G2.3, OLD overlap, KOSMOS.gameScene/Config exposure).

**3 nowe lekcje L39-L41** dodane. **Cumulative M3 lessons: L15-L41 (27 nowych vs M2b L1-L14).** **Total: 41 lekcji.**

Po P1.5 → **Chore commit hide colony-3d-tooltip → P2.* (POI UI, 3 commits) → P3.* (runtime, 2 commits) → P4 (polish, 1 commit). M3 total: ~6 commits zostaje.**
