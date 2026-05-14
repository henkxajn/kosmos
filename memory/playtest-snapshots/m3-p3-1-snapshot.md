# M3 Phase P3.1 — Snapshot Delta

**Tag:** `m3-commit-p3-1-poi-runtime` (commit db899e8, post-fix #1)
**Predecessor:** `m3-commit-p2-3-create-poi-mode` (5da2093)
**Base commit P3.1:** uncommitted/squashed do post-fix (BEZ tagu — per L33)
**Successor target:** `m3-commit-p3-2-ambush-combat`
**Phase status:** P3 = 50% done. M3 ~85% done.

---

## TL;DR

**Pierwszy P3 commit zamieniający POI z statycznych UI markerów w żyjące systemy runtime.** Picket alert (detection + auto-slow time + EventLog + visual feedback) + Rally member assembly + save persistence. ~877 LoC base + ~27 LoC post-fix = ~904 LoC. 13 plików (base + post-fix). 286/286 cumulative smoke GREEN. **11/11 real-flow PASS** (A-J + bonus E.11).

**11 off-spec discoveries** (najwięcej w M3 dotychczas — 7 z plan mode + 1 post-implementation + 3 nowe z real-flow). Każda adaptowana **bez catastrophic refactor** — P3.1 core gameplay logic (detection + state + cooldown + tactical color) **NIGDY nie była broken**. Wszystkie post-fix #1 zmiany w **UI feedback layer** (EventLog wireup + Tooltip handler).

**Z perspektywy gracza:** POI to teraz **prawdziwe gameplay primitives**. Picket alert = early warning + pauza-do-1d/s (Stellaris/Civ pattern). Rally = multi-vessel coordination przez FleetOverlay LEFT/RIGHT panel + RallyAssignModal (DOM modal scalable do 5-10 rally late-game).

---

## Decyzje Filipa (locked PRZED kodem)

1. **D-picket-alert-ui** = β + slowdown (EventLog + visual flash + auto-slow do 1d/s, smart skip jeśli już slow)
2. **D-rally-member-assignment** = α FleetOverlay LEFT/RIGHT panel + RallyAssignModal modal (scalable)
3. **D-rally-complete-action** = a (EventLog notification only)
4. **D-detection-frequency** = β throttled co 10 ticks (~167ms)
5. **D-picket-cooldown** = B 30s game-seconds
6. **D-save-persistence** = A full persistence (v67→v68 migration)
7. **D-poi-triggered-visual** = simple color change / scale change (no animation pulse, defer P4)

**Krytyczna decyzja sub-flow:** Filip zmienił preferencję z **(α inline canvas)** na **(β modal RallyAssignModal)** mid-prompt — dłuższoterminowa scalability over short-term workflow consistency. **L23 + L28** retroactively w pełnej formie.

---

## Plik-by-plik (cumulative base + post-fix)

```
NEW:
  src/systems/POIRuntimeSystem.js      273 LoC    detection logic, time:tick listener
  src/ui/RallyAssignModal.js           298 LoC    DOM modal z=1000 (function-based + Promise)
  tmp_m3_p3_1_poi_runtime_test.mjs     526 LoC    30 smoke cases (T1-T5)

EXTEND:
  src/ui/FleetManagerOverlay.js        +164      rally section RIGHT panel + 🎯 LEFT indicator
                                                  + _drawPOISprites color change
  src/scenes/GameScene.js              +23       instantiate + KOSMOS.debug wireup
  src/systems/SaveMigration.js         +28       v67→v68 migration (runtime fields defaults)
  src/i18n/pl.js + en.js               +18 / +18 eventLog.poi.* + tooltip.poi.* + fleet.rally.* + rallyModal.*
  src/renderer/ThreeRenderer.js        +13       _updatePOISprite scale change (1.3 / 1.2)
  src/ui/EventLog.js                   +13       (POST-DISCOVERY: dead file w runtime)
  src/config/GameConfig.js             +11       poiDetectionTickInterval, picketCooldownSeconds
  src/utils/CoordTransform.js          +18       gameplayDistance helper
  src/systems/TimeSystem.js            +5        nowy reason 'poi_alert' w log handler

REGRESSION TEST UPDATE:
  tmp_m2b_c1_migration_test.mjs        +42 / -19 v67→v68 sanity update

POST-FIX #1 (commit db899e8):
  src/scenes/UIManager.js              +14      2 EventBus subscriptions + 2 LOG_COLORS keys
  src/utils/TooltipContent.js          +13 / -4 _poiContent extended (triggered + complete + progress)

TOTAL: 11 prod files (base) + 2 prod files (post-fix) + 2 test files = 15 paths
       ~904 LoC dodanych łącznie
```

---

## 11 off-spec discoveries

### **Z plan mode** (7):

1. **EventLog API string-based** `_add(text, type)` — adjusted plan subscriber pattern + 2 color keys
2. **TimeSystem `_triggerAutoSlow` exists** — reuse zamiast nowego eventu, zero TimeSystem changes
3. **POI runtime fields generic-merge** — POIRegistry validators NIE odrzucają extra fields, no schema migration
4. **CoordTransform brak `gameplayDistance`** — added ~10 LoC
5. **POI sprite triggered visual** = simple color/scale change (no animation) — Filip's decyzja redukuje regresji risk
6. **Rally assignment przez NEW RallyAssignModal** — Filip's decyzja β scalable late-game
7. **CURRENT_VERSION=67** (CLAUDE.md outdated says 66) — v67→v68 correct migration

### **Post-implementation discoveries** (1):

8. **3D POI sprite color**: textury cache'owane per type w ThreeRenderer (L4356) → tint koloru wymagałby per-poi texture. **Decyzja:** scale change (1.3× picket triggered, 1.2× rally complete) zamiast color w 3D. Tactical 2D ma pełen color swap (no texture cache constraint). **Asymmetric strategy per surface** — tactical full color, 3D scale.

### **Real-flow ujawnione** (3):

9. **EventBus NIE exposed** na `KOSMOS.eventBus` (ES module singleton importowany). Tylko `recorder` ma emit/on API z `KOSMOS.*` namespace. Plan mode V verifications cytowały **file paths**, NIE runtime instance paths.

10. **EventLog runtime path** = `UIManager._log()` przez `UIManager._setupLogEvents()`, NIE `src/ui/EventLog.js` (dead file). Plan mode V3 cytował właściwy file paths ALE runtime instance jest **embedded w UIManager** z direct push do `_logEntries` array. Post-fix #1 dodał handlers w UIManager (~14 LoC).

11. **`_poiSprites.get(id)` zwraca wrapper** `{sprite, type}`, NIE direct THREE.Sprite. Mój ad-hoc diagnostic czytał `wrapper.scale` (undefined) zamiast `wrapper.sprite.scale`. **Plan mode mini V_extra** sprawdziło source code z `grep` i potwierdziło że Code path w `_updatePOISprite` był correct — żadna zmiana nie była potrzebna w ThreeRenderer.

---

## Real-flow execution (Filip, A-J + bonus E.11)

### Setup pre-flight (~2 min):

```js
// Picket:
KOSMOS.debug.createPOI({type:'picket', name:'Granica Beta', center:{x:100,y:100}, rangePxLocal:80, alertOnEmpireIds:null})

// Rally + 3 player vessels assigned:
const myVessels = KOSMOS.vesselManager.getAllVessels().filter(v => v.ownerEmpireId === undefined).slice(0,3)
KOSMOS.debug.createPOI({type:'rally', name:'Atak Beta', center:{x:200,y:200}, waitForCount:3, memberVesselIds: myVessels.map(v=>v.id)})
```

**Setup off-spec ujawnione:** filter `v => !v.ownerEmpireId` zwrócił 0 — vessels mają `ownerEmpireId=undefined` (NIE `'player'`). Correct filter: `v.ownerEmpireId === undefined`. **7 vessels w Combat Sandbox** — 4 player (Obrońca Alfa/Beta/Gamma + Badacz Sigma) + 3 enemy (Łowca Alfa/Beta/Gamma `ownerEmpireId='emp_sandbox_enemy'`).

### Wyniki (11/11 PASS):

```
A ⚠️  KRYT — Picket detection             ✅ PASS (po post-fix #1)
                                          Wymagało plan mode V_extra na 3 wrong runtime paths
B           — Cooldown                    ✅ PASS (30 game-seconds blocks duplicate)
C           — alertOnEmpireIds filter     ✅ PASS (whitelist + null=all)
D ⚠️  HIGH — Own vessel ignored           ✅ PASS (isEnemyVessel fallback handles undefined ↔ 'player')
E ⚠️  KRYT — Rally assignment             ✅ PASS (modal + UI feedback, drobny setup artifact: 2 duplicate rally usunięte)
E.11        — Time slowdown bonus         ✅ PASS (2 → 1 smart skip)
F ⚠️  KRYT — Rally complete trigger       ✅ PASS (3 members in range → complete=true + EventLog + tactical green)
G           — Idempotent                  ✅ PASS (vessel exits/enters → no double event)
H           — Throttling                  ✅ PASS (60fps, 120 ticks / 2s = 12 detection cycles ~167ms)
I           — Save persistence            ✅ PASS (triggered, cooldown, complete, members zachowane po F5+reload)
J ⚠️  KRYT — Regression gate              ✅ PASS (J.1 wymagało KOSMOS.debug.enableMovementOrders() toggle — NIE regression)
```

---

## Post-fix #1 timeline

**Real-flow A (przed post-fix):**
- ✅ Detection works (D8/D9 manual force tick — triggered=true)
- ✅ Tactical 2D color works (orange after triggered)
- ✅ POI sprite renders w tactical (screenshot confirmed)
- ❌ EventLog wpis nie pojawia się (delta=0 po force trigger)
- ❌ 3D sprite scale (diagnostic czytał wrong path: `wrapper.scale` zamiast `wrapper.sprite.scale`)
- ❌ Tooltip "ALERT — wykrył wroga" line brak

**Plan mode mini Claude Code V_extra (krytyczna korekta):**
- **Issue #1 EventLog** — CONFIRMED, fix needed (~14 LoC w UIManager)
- **Issue #2 3D sprite scale** — ALREADY CORRECT, NIE fix (Filip's diagnostic wrong path; code path correct)
- **Issue #3 Tooltip ALERT line** — CONFIRMED, fix needed (~13 LoC w TooltipContent)

**Scope reduced** od oryginalnego post-fix prompt (~30-60 LoC, 3 plików) do **~27 LoC, 2 plików**. **Skip ThreeRenderer eliminates regression risk.** Workflow consistency — L51 mandate (existing infrastructure works, don't touch).

**Post-fix commit db899e8** → Filip's Re-A test (4/4 PASS) → kontynuacja B-J → 11/11 PASS → tag.

---

## Lekcje L53-L54 (nowe z P3.1)

### **L53 — Plan mode V verifications MUSZĄ cytować REAL runtime instance paths**

**Symptom:** Off-spec #9/#10 ujawnione w real-flow real-time. `KOSMOS.eventBus` = undefined, `KOSMOS.uiManager.eventLog` = undefined (EventLog embedded w UIManager z direct `_log()` method).

**Mandate:** Plan mode V verifications dla multi-system integration **MUSZĄ** cytować `KOSMOS.X.Y.Z` runtime instance paths PRZED implementation, NIE tylko file paths źródłowe (`src/ui/EventLog.js`). Plan mode V verifications powinny includować **devtools console probe** wraz z grep-based source review.

**Konsekwencja:** Plan mode dla future phases (P3.2 ambush + combat integration, P4 polish) MUSI mieć dedykowaną sekcję **V_runtime_paths** z grep'owanymi referencjami **plus** devtools verification że `KOSMOS.X.Y.Z` exists at runtime. To **L34 + L39 V1 multi-keyword grep extended** — grep source + verify runtime instance.

### **L54 — Stored values w runtime Maps mogą być wrapper objects, NIE direct entities**

**Symptom:** `_poiSprites.get(poiId)` zwraca `{sprite, type}` wrapper, NIE direct THREE.Sprite. Mój ad-hoc diagnostic w real-flow czytał `wrapper.scale` (undefined) zamiast `wrapper.sprite.scale`. Plan mode mini V_extra **skoryguje** ten błąd przez `grep` source code (znalazło `entry.sprite.scale.set(...)` w `_updatePOISprite` L4451) — eliminating fałszywie negative diagnosis.

**Mandate:** Plan mode V_extra dla **Map-based caches** MUSI cytować **shape stored values** (przez `console.log(JSON.stringify(Array.from(map.values())[0]))` lub similar diagnostic) PRZED użyciem fields. Plus diagnostic kod w real-flow MUSI **zawsze odwzorowywać source code paths** (grep z line numbers), NIE hipotetyczne field positions.

**Konsekwencja:** Plan mode mini przed post-fix z V_extra (source code review) potencjalnie **skoryguje ad-hoc real-flow diagnosis** jeśli runtime returns wrapper objects. **Plan mode mini > moja diagnostyka** dla Map field access.

---

## Lekcje cumulative L1-L54

```
M2b:           L1-L14
M3 P1:         L15-L43
M3 P2.1:       L44-L46
M3 P2.2:       L47-L48
M3 P2.x chore: L49
M3 P2.3:       L50-L52
M3 P3.1:       L53-L54
```

**L52 retroactively confirmed:** EventBus loose coupling pattern w P3.1 worked idealnie — POIRuntimeSystem emit `poi:alertTriggered` / `poi:rallyComplete`, EventLog listenuje. Brak direct coupling między systems. Plus ThreeRenderer `EventBus.on('poi:updated', ...)` workował correctly (off-spec #11 był fałszywie negatywny).

---

## Smoke test cumulative

```
M3 P1.1 menu                17/17  GREEN
M3 P1.2 raycaster           20/20  GREEN
M3 P1.3 orders              54/54  GREEN
M3 P1.3 tactical            19/19  GREEN
M3 P1.4.5 cancel motion      5/5   GREEN
M3 P1.4 cancel              25/25  GREEN
M3 P1.5 tooltip             28/28  GREEN
M3 P2.1 panel               25/25  GREEN
M3 P2.2 modal               32/32  GREEN
M3 P2.3 create POI          31/31  GREEN
M3 P3.1 runtime (NEW)       30/30  GREEN
─────────────────────────────────────
CUMULATIVE M3              286/286 GREEN ✓
```

Plus M2b regression check + VCS team-up cooldown PASS.

---

## Deferred items (M4 polish)

```
1. Mapa 3D planet hover (RaycasterPure gap)               P4
2. G2.3 cancel button hover                                P4
3. Star tooltip planet template                            P4
4. KOSMOS.gameScene/gameConfig undefined exposure          P4
5. 2 legacy window.confirm callsites                       P4
6. #8 Browser maxlength feature acceptance                 M4
7. CLAUDE.md CURRENT_VERSION outdated (says 66, real 68)   P4 chore
8. src/ui/EventLog.js dead file cleanup                    M4
9. KOSMOS.saveSystem.currentVersion exposure (drobne)      M4
10. Animation pulse dla POI triggered (nice-to-have)       M4
11. Per-rally configurable gather range                    M4
```

---

## Status M3

```
✅ PHASE P1 (Orders + Selection + Tooltips)   COMPLETE   8 commits + chore
✅ PHASE P2 (POI CRUD UI)                     COMPLETE   3 commits + 2 chores
✅ PHASE P3.1 (POI Runtime — Picket + Rally)  COMPLETE   1 commit + post-fix
⬜ PHASE P3.2 (Ambush + Combat integration)              1-2 sesje
⬜ PHASE P4 (Polish + remaining items)                   1-2 sesje
─────────────────────────────────────────────────────────────────
M3 progress: ~85% done

14 atomic commits cumulative
286/286 cumulative smoke GREEN
54 lekcji workflow (L1-L54)
~50 plików tworzonych/zmodyfikowanych w M3
```

**Realistic M3 close:** 2-4 sesje więcej.
