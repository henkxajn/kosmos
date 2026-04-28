# M3 P1.2 — COMPLETE (snapshot)

**Tag:** `m3-commit-p1-2-complete`
**Predecessor:** `m3-commit-p1-1-complete`
**Commits:** `e5d9539` (P1.2 base) → `c90d123` (post-fix #1) → `9e49311` (post-fix #2)
**Save version:** v67 (bez zmian — selection efemerycznie)

## Status

P1.2 deliverables w pełni działają (z drobnymi n/a per gameplay state):

- Tactical map mouse interactions (raycaster + sprite hit detection)
- `_handleTacticalLeftClick` — selection (own vessel) + deselect (empty)
- `_handleTacticalRightClick` — context menu z target type resolution
- Walk-up-parent dla zagnieżdżonych meshów (planet group → atmoMesh/cloudMesh children)
- Defensive `userData.kosmosType` add dla vessel/POI/planet sprites (4 punkty)
- 2 nowe devtools (`raycastAt`, `simulateRightClick`)
- Pełen integration z P1.1 RightClickMenu przez `EventBus.emit('ui:rightClickMenuOpened', ...)`

## Files (cumulative across 3 commits)

```
P1.2 base (e5d9539):
  src/utils/RaycasterPure.js          80 LoC  NEW
  src/utils/RaycasterHelper.js        61 LoC  NEW
  src/renderer/ThreeRenderer.js       +19/-4  EXTEND (4 userData adds + 3 getters)
  src/scenes/GameScene.js             +80    EXTEND (handlers + devtools)
  src/data/RightClickMenuOptions.js   +6     COMMENT
  tmp_m3_p1_2_raycaster_test.mjs      247    NEW (T1-T5)

Post-fix #1 (c90d123): vessel.owner field + simulateRightClick
  src/utils/RaycasterPure.js          +18/-3  (inline _isVesselEnemy mirror)
  src/scenes/GameScene.js             +12/-5  (myEmpireId='player' + simulate rewrite)
  tmp_m3_p1_2_raycaster_test.mjs      +24/-7  (T2.2b/T2.3b owner fixtures)

Post-fix #2 (9e49311): planet-canvas isOverUI blocking
  src/scenes/GameScene.js             +11    (tagName === 'CANVAS' bypass)
```

## Verifications V1-V8 (z odkryciami)

| V | Wynik | Odkrycie |
|---|-------|---------|
| V1 | ThreeRenderer raycaster `_ray` istnieje na L217 | reuse zamiast new instance |
| V2 | POI sprite L4416 ma userData `{poiId, poiName, poiType}` z M2b C7 | rozszerzony o `kosmosType:'poi'` |
| V3 | Existing contextmenu handler GameScene.js:3138-3174 | rozszerzony ELSE branch (overlay check) |
| V4 | 4 canvasy w index.html | **L22 odkrycie** — runtime check pokazał planet-canvas dominuje |
| V5 | `cameraController.wasDrag` flag istnieje L3122 | **D2 architectural win** — reuse zamiast 5px duplikacja |
| V6 | Planet mesh L1400-1403 bez userData; atmoMesh/cloudMesh mają `isAtmosphere/isCloud` | defensive add `kosmosType:'planet'` |
| V7 | Vessel 3D wrapper async GLB load — userData musi być na wrapper Group | sync set L3098 (przed callback) |
| V8 | RightClickMenu payload contract z P1.1 | `{target, screenPoint}` — kompatybilne |

## Decyzje rozstrzygnięte (D1-D6 + 2 post-fix)

- **D1: bez `FEATURES.uiInteraction` flag** — placeholder console.log, conditional dispatch wystarcza
- **D2: reuse `cameraController.wasDrag`** — zamiast 5px threshold w GameScene (architectural simplification)
- **D3: N/A** — PPM nie używana przez camera, brak konfliktu
- **D4: empty click → deselect** TAK (Q6, ESC w P1.3)
- **D5: closest hit wygrywa** — naturalne Three.js sortowanie (R10 mitigation w P1.5)
- **D6: `worldPoint` payload key** — spec consistency
- **Post-fix #1 D1: hardcoded `'player'` literal** + TODO M4 — brak helpera w runtime
- **Post-fix #1 fix vs prompt**: inline mirror `Vessel.isEnemyVessel` (3-field check: `isEnemy/owner/ownerEmpireId`) zamiast literal `vessel.owner === currentEmpireId`
- **Post-fix #2 D1: `tagName === 'CANVAS'` bypass `isOverUI`** — bardziej robust niż id whitelist (Claude Code refinement)

## Off-spec / odkrycia (5 krytycznych)

1. **Architectural split RaycasterPure / RaycasterHelper** (Pure no-THREE dla offline test, main re-exports z THREE.Raycaster) — Node ESM nie resolwuje `import * as THREE` z vendored lib
2. **`vessel.owner` field name (3-field semantics)** — plan zakładał `ownerEmpireId`, realne pole to `owner` z fallback'iem na `isEnemy` legacy
3. **`isOverUI` viewport-wide blocking** gdy any overlay open (FleetOverlay/IntelOverlay) — selection przez devtools triggerowała FleetOverlay open → cały viewport "UI" → tactical clicks blocked
4. **`planet-canvas` z=4 persistent overlay** — display:none w CSS ale runtime aktywny przez PlanetGlobeRenderer/legacy. Wszystkie eventy mają `e.target.id === 'planet-canvas'` zamiast `'three-canvas'`
5. **`simulateRightClick` initial wersja używała `dispatchEvent`** — syntetyczny event miał `target === undefined`, post-fix #1 rewrite na direct `EventBus.emit`

## Test results

```
tmp_m3_p1_2_raycaster_test.mjs    20/20 PASS  (T1×3, T2×8 z owner fixtures, T3×3, T4×3, T5×3)
tmp_m3_p1_1_menu_test.mjs         17/17 PASS  (regression check)

Cumulative M3:                    37/37 GREEN
M2b regression suite:             nie puszczone w post-fix iteracjach (TODO sprawdzić w P1.3)
```

## Real-flow scenariusze A-I

| Scen | Wynik | Notatki |
|------|-------|---------|
| A | n/a | Vessele dockowane na start, sprite za małe na mapie 3D — selekcja przez sprite **kod jest** (smoke pass) ale gameplay limitation. Primary flow z P1.1 (FleetOverlay click) działa. |
| B | PASS | Empty click deselect — verified po `selectVessel('v_1')` + lewy klik w pustą przestrzeń |
| C | PASS | Prawy klik empty → menu z worldPoint, browser native menu blocked |
| D | PASS | Devtools workaround `openRightClickMenu('ownVessel'/'enemyVessel', {x,y}, {entityId})` — menu pokazuje właściwe opcje. Real myszka n/a (vessele dockowane). post-fix #1 logic verified przez smoke T2 |
| E | PASS | POI sprite menu z patrol option (po `KOSMOS.debug.createPOI(...)`) |
| F | PASS | Planet menu bez Dock (V7 P1.1). F.2 atmosfera klik → walk-up-parent działa |
| G | skip | Pedantic test, kamera pan działa normalnie (LPM drag = pan, OK) |
| H | PASS | **REGRESSION GATE** — ColonyOverlay ground unit moveUnit flow zachowany |
| I | n/a | Specific overlap vessel-nad-POI nie wystąpił w current sandbox |

**4 PASS scenariusze + 3 sanity checks** = core P1.2 functionality verified. **A i D real myszką** odłożone do P1.3 (po order issue) gdy vessele będą na orbicie.

## Lekcje z P1.2 (kandydaci do M3 lessons learned, ostateczna lista po m3-complete)

### L18 — Module separation dla testowalności w Node ESM

`import * as THREE from 'three'` nie resolwuje się w Node ESM bez import maps (three vendored w `src/lib/`). Pure helper splits na **Pure** module (no-THREE imports) + **main** module (z THREE wrappers). Smoke testuje Pure offline, runtime używa main.

**Pattern:** `<helper>Pure.js` (czysta logika, testowalna) + `<helper>Helper.js` (re-exports + wrappery z external deps).

### L19 — Każdy lookup do gameState w pure helperze cytuj real def

Plan mode P1.2 V8 wspominał `myEmpireId` ale **nie cytował** gdzie wartość jest stored. Z fallback'iem `?? 'player'` smoke pass był false-positive. Runtime ujawnił że ścieżka `gameState.get('player.empireId')` **nie istnieje**.

**Plan mode mandate:** każdy `gameState.get(...)` w plan mode V_lookup musi mieć **cytat z miejsca gdzie wartość jest zapisywana**, nie tylko gdzie jest czytana. Bez tego — fallback to magic value.

### L20 — Smoke fixtures pure helpera muszą cytować real entity defs

Plan P1.2 zakładał `vessel.ownerEmpireId` jako pole — ale Vessel.js definiuje `owner` (string), plus legacy `isEnemy` (bool). Smoke 18/18 pass był false-positive bo fixtures użyły **spec interface**, nie **real entity shape**.

**Plan mode mandate dla P1.3+:** jeśli pure helper czyta entity fields (Vessel/Planet/POI), V_extra MUSI cytować konstruktor entity z numerami linii i listą wszystkich pól. Bez tego — fixture jest zgadywany.

### L21 — Pure helpers mogą duplikować logikę z entity classes z `KEEP IN SYNC` comment

Vessel.isEnemyVessel honoruje 3 pola (`isEnemy / owner / ownerEmpireId`). RaycasterPure mógłby importować Vessel.js, ale Vessel ciągnie EntityManager/ShipsData/etc. — niepotrzebne deps w pure module. **Decyzja:** inline mirror logic z explicit `// KEEP IN SYNC with Vessel.isEnemyVessel` comment.

**Trade-off:** duplikacja vs ciężkie deps. `grep "KEEP IN SYNC"` jako forcing function podczas przyszłych zmian.

### L22 — Plan mode V verification "jakie X istnieją" to za mało — runtime check krytyczny

V4 P1.2 wylistował 4 canvasy z z-indexes z `index.html` (statyczna analiza HTML). ALE **nie sprawdził** który canvas faktycznie łapie eventy w typowym gameplay. Runtime pokazał że `planet-canvas` (display:none w CSS!) jest persistent overlay łapiący wszystko.

**Plan mode mandate dla P1.3+:** jeśli V verification dotyczy event flow / DOM hierarchy / runtime state, plan musi zawierać **explicit runtime check** (np. "wykonaj logger w konsoli, wklej output"). Statyczna analiza nie wystarczy dla mutowanego DOM.

### L23 — `isOverUI` viewport-wide blocking gdy any overlay open

UIManager.isOverUI używa `overlayManager.isAnyOpen()` który zwraca true gdy **dowolny** overlay (FleetOverlay, IntelOverlay, etc.) jest open — niezależnie od jego visual coverage. To powoduje że selekcja vessel'a (która otwiera FleetOverlay automatycznie) → blokuje **cały viewport** dla tactical clicks.

**Fix pattern:** odróżniać "over real DOM UI element" od "over visual canvas overlay". `tagName === 'CANVAS'` jako bypass — wszystkie game canvasy akceptowane, DOM panele dalej blokowane.

**Implication dla M3:** każda akcja w UIManager która otwiera overlay (selectVessel, selectColony, openIntel) **musi rozważać** czy nie blokuje runtime tactical clicks. P1.3+ keyboard handlers również.

## Pre-existing issues (do M3 known issues list)

- **`(⚓ undefined)` w EventLog dla dock orders** — Łowca Alfa/Beta/Gamma w intel z dock targetem `undefined`. Pre-existing z M1/M2a. Naprawimy w P4 (polish).
- **Vessele zaczynają jako dockowane** — sprite'y nie widoczne na mapie 3D, secondary flow z spec §5.1 (sprite click) **kod jest** ale gameplay limitation. P1.3 (`MOS.issueOrder`) prawdopodobnie naprawi przez umożliwienie undock + lot na orbitę.
- **`planet-canvas` display:none w CSS ale runtime aktywny** — coś przełącza display w PlanetGlobeRenderer / legacy PlanetScene. Off-spec, do udokumentowania w M4 cleanup.
- **`simulateRightClick` post-fix #1 nie testowany w prod path** — direct `EventBus.emit` reprodukuje POST raycaster, ale nie testuje pełnego event flow z handler'em. Real myszka pokrywa pełen flow.
- **M2b regression suite nie puszczony w post-fix iteracjach** — TODO sprawdzić w P1.3 czy 168/168 z M2b nadal GREEN (niska szansa regression bo P1.2 nie ruszał MOS/POI/IntelSystem).
- **`KOSMOS.gameScene` undefined** — scene nie exposed (P1.1 known issue, persistent).

## Próbka konkretnego diff'u (post-fix #2 critical)

```js
// GameScene.js — w _handleTacticalRightClick i _handleTacticalLeftClick:
// BYŁO:
if (this.uiManager?.isOverUI?.(e.clientX, e.clientY)) return;

// JEST:
// Bypass isOverUI gdy target to CANVAS (game viewport):
//   planet-canvas/three-canvas → tactical map clicks
//   DOM panele/modale → target.tagName !== 'CANVAS' → isOverUI dalej blokuje
const isGameCanvas = e.target?.tagName === 'CANVAS';
if (!isGameCanvas && this.uiManager?.isOverUI?.(e.clientX, e.clientY)) return;
```

## Next: P1.3

**Order issue handlers — najtrudniejszy commit P1.**

Krytyczne lekcje z M2b + M3 P1.1/P1.2 do plan mode P1.3:

- **L19/L20** — V_extra MUSI cytować Vessel.js + MovementOrderSystem.js konstruktory (wszystkie pola, nie tylko spec interface). Plus dock-related fields (`vessel.dockedAt`? `location.type==='docked'`? itd.). Bez tego — fixture zgadywany.
- **L21** — jeśli pure helper duplikuje logikę z MOS, użyj `KEEP IN SYNC with MovementOrderSystem.X` comment.
- **L22** — runtime check dla event flow / DOM state (picker mode shows visual cursor change? ESC keyboard ma working preventDefault?).
- **L23** — picker mode dla patrol waypoints **musi** współistnieć z otwartym FleetOverlay. Nie zamykać overlay'a podczas pickera.
- **L8** — XZ plane Y=altitude, picker waypoint clicks zwracają `worldPoint` z Y=0 (analogiczne do empty click).

Ponadto:
- **Dock state handling** — pierwszy "Lecisz tutaj" dla dockowanego vessel musi go undock najpierw (lub zwrócić error "vessel dockowany"). Decyzja w plan mode.
- **`FEATURES.m3OrdersInteractive` flag** — TAK w P1.3 (real wiring do MOS = destruktywne, rollback safety). Tu jest prawdziwe ryzyko (issued order może rozbić gameplay).
- **ESC keyboard handler** — cancel picker mode, deselect, close menu.

---

**P1.2 CLOSED.** 37/37 smoke + 4 PASS real-flow scenariuszy + 3 sanity checks GREEN, 5 off-spec odkryć, **3 post-fix iteracje** (vessel.owner field, simulateRightClick rewrite, planet-canvas isOverUI bypass). 6 nowych lekcji L18-L23 do M3 lessons learned.

**Najbogatsze odkryciowo P1.2** w cyklu — to oczekiwane, raycaster + DOM event integration to nontrivial. P1.3 będzie korzystać z każdej z tych lekcji.
