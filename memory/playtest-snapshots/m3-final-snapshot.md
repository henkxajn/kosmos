# M3 Milestone — FINAL SNAPSHOT

**Status:** ✅ COMPLETE
**Tag:** `m3-commit-p4-polish` (88acdbe)
**Period:** ~6 weeks (mid-April 2026 → mid-May 2026)
**Phases:** P1 (Orders + Tooltips) → P2 (POI CRUD UI) → P3.1 (POI Runtime) → P4 (Polish)
**Dropped:** P3.2 (Ambush — combat already auto-engages via existing VesselCombatSystem)

---

## TL;DR

M3 dodał **pełen POI ecosystem** (Points of Interest) do KOSMOS plus **uniwersalny tooltip system** i **PPM context menu** workflow.

**Z perspektywy gracza:**
- Klawisz **N** otwiera **POIPanel** — sortowalna/filtrowalna lista wszystkich POI
- **PPM na tactical map** → menu "Lecisz tutaj" + "Utwórz [POI type] tutaj" (5 typów)
- **POIModal** — function-based + Promise pattern dla create/edit/delete
- **Picket** (border alarm) — enemy w zasięgu → EventLog wpis + auto-slow time do 1d/s
- **Rally** (punkt zborny) — vessels w zasięgu → "ZEBRANY" event
- **3 passive POI types** — ambush (defined ale runtime = waypoint), supply_route, waypoint
- **Universal tooltip** — hover na cokolwiek (planet, vessel, POI) → contextual info
- **Custom THEME modals** zastąpiły wszystkie `window.confirm` (5+ callsites)
- **Save migration** v66 → v68 backward-compatible

**Z perspektywy game design:**
POI to **pierwsze działające gameplay primitives** poza UI markers. Picket alert + auto-slow = Stellaris/Civ pattern (pause on important event). Rally complete = multi-vessel coordination pattern. **Foundation dla M4 advanced gameplay** (AI POI usage, combat tactical map, ambush mechanics z unique value-add).

---

## Phase-by-phase summary

### **P1 — Orders + Selection + Tooltips** (~3 weeks)

```
P1.1 — Right-click menu skeleton                                17 smoke
P1.2 — Tactical raycaster                                       20 smoke
P1.3 — Movement orders + tactical sprites                       54 + 19 smoke
P1.3.5 — Selection state + visual highlight                    -- (no tests)
P1.4 — Cancel button + motion fix (M1 9-month bug discovery)    25 + 5 smoke
P1.5 — Universal tooltip system                                 28 smoke
P1.5 post-fix — coord tooltip empty hover                       (chore)
```

**Kluczowe lekcje P1:**
- L19/L20 V_extra (real entity defs PRZED kodem)
- L23 + L28 (gameplay intent per surface)
- L33 (tag = real-flow PASS, NIE smoke completion)
- L34 + L39 V1 (multi-keyword grep PRZED kodem)
- L37 (diagnostic data > interpretation)

**Bugs ujawnione:** M1 motion bug (9 miesięcy w grze, dopiero P1.4 ujawnił). RaycasterPure planet hover gap (deferred do P4 fix).

### **P2 — POI CRUD UI** (~1.5 weeks)

```
P2.1 — POIPanel (sort/filter/edit)                              25 smoke
P2.2 — POIModal (function-based + Promise)                      32 smoke
P2.2.5 — Custom confirm modal (resolves window.confirm)         (chore)
P2.3 — PPM "Utwórz POI tutaj" + create POI mode + coord fix     31 smoke
P2.3 post-fix — POIPanel scroll clamp                           (chore)
```

**Kluczowe lekcje P2:**
- L43 (TacticalRaycaster type discrimination)
- L44 + L51 (schema variation + existing infrastructure reuse)
- L46 (coord space gaps — WORLD_SCALE=10 NOT AU_TO_PX=110)
- L47-L48 (function-based modals + Promise pattern)
- L52 (loose coupling przez EventBus)

**Off-spec discoveries P2.3:** 8 (najwięcej w pojedynczej fazie M3, przed P3.1).

### **P3.1 — POI Runtime (Picket + Rally)** (~1.5 weeks, 1 long session)

```
P3.1 — POIRuntimeSystem + RallyAssignModal + SaveMigration v67→v68  30 smoke
P3.1 post-fix #1 — UIManager EventLog + TooltipContent ALERT line   (in same commit)
```

**Kluczowe lekcje P3.1:**
- **L53 (NOWY):** Plan mode V verifications MUSZĄ cytować REAL runtime instance paths (`KOSMOS.X.Y.Z`), NIE tylko file paths źródłowe
- **L54 (NOWY):** Stored values w runtime Maps mogą być wrapper objects (`{sprite, type}`), NIE direct entities

**11 off-spec discoveries** (najwięcej w pojedynczej fazie M3):
1. EventLog API `_add(text, type)` (zaadresowane post-fix)
2. TimeSystem `_triggerAutoSlow` exists (reuse)
3. POI runtime fields generic-merge passes
4. CoordTransform brak `gameplayDistance`
5. POI sprite triggered = simple color/scale (no animation)
6. Rally assignment przez NEW RallyAssignModal (DOM)
7. CURRENT_VERSION=67 (CLAUDE.md outdated)
8. 3D sprite scale change (texture cache constraint)
9. EventBus NIE exposed na `KOSMOS.eventBus`
10. EventLog runtime = `UIManager._log`, NIE `src/ui/EventLog.js`
11. `_poiSprites.get(id)` wrapper shape

**Plus krytyczne odkrycie git state:** P3.1 commit `db899e8` był fake — message mówił o POIRuntimeSystem ale plik untracked. Recovery przez 11 kroków bez utraty pracy. Tag P3.1 retagged na proper commit `83db9b6`.

### **P3.2 — DROPPED** (~30 min decision)

Filip's observation: *"po co mi ambush jak combat zawsze on i statki at war auto-engage"* — fundamentalne pytanie ujawniło że P3.2 ambush jako event-only NIE dodaje unique gameplay value. **Decyzja: drop P3.2 z M3 scope.** Combat zawsze on przez existing VesselCombatSystem. Ambush jako POI type defined w P2.x ale runtime behavior = waypoint. Future M4 może dodać unique ambush mechanic (initiative bonus, force engagement, etc.) jeśli okaże się potrzebny.

**Lekcja:** L23 + L28 w pełnej formie — gameplay intent verification PRZED implementation. Plus L55 kandydat: *"Plan mode V verifications dla 'nowych' feature MUSZĄ zwerifikować czy proposed feature dodaje wartość PONAD existing behavior."*

### **P4 — Polish + M3 close** (~30 min implementation + recovery)

```
P4 — CLAUDE.md update + EventLog.js delete + 2 confirm refactors + KOSMOS exposures
   + 3D planet hover fix + i18n keys + 5 smoke cases               5 smoke
```

**Off-spec discovery #1 w P4:** Planet hover bug NIE był castRay loop issue (jak prompt zakładał) — był **API method mismatch** w `RaycasterPure.js` (`entityManager.getEntity()` called ale method jest `.get()`) plus brakujące `window.KOSMOS.entityManager` exposure. Plan mode V_extra ujawniło że plan zakładał wrong root cause.

**Recovery podczas P4:** Krytyczne ujawnienie git state inconsistency — P3.1 fake commit. Recovery wykonane przez 11 git ops bez utraty pracy. Tag P3.1 moved z `db899e8` (fix-only) na `83db9b6` (proper base + fix).

---

## Cumulative stats

```
Commits:                    16 atomic commits w M3
                            + 6 chores/post-fixes

LoC (production):           ~6000+ dodanych
                            ~258 deleted (P4 dead file cleanup)

Files (production):         ~50+ tworzonych/zmodyfikowanych
                            12 NEW major files
                            1 DELETED (src/ui/EventLog.js dead file)

Smoke tests:                286+ cumulative cases
                            All GREEN through M3 close

Lekcje workflow:            L1-L55 (55 lessons)
                            New w M3: L15-L55 (41 lessons)
                            New w P3.1+P4: L53-L55 (3 lessons)

Off-spec discoveries:       ~35+ cumulative w M3
                            Most w pojedynczej fazie: 11 (P3.1)
                            Wszystkie adaptowane bez catastrophic refactor

Real-flow PASSes:           ~50+ cumulative scenarios
                            P3.1: 11/11 PASS
                            P4: 5/5 visual + multi-test E gate PASS
```

---

## Nowe NEW pliki w M3 (production)

```
src/systems/POIRegistry.js              (P2.x)   POI CRUD store
src/systems/POIRuntimeSystem.js         (P3.1)   273 LoC — detection runtime
src/data/POITypes.js                    (P2.x)   5 POI types definitions
src/ui/POIPanel.js                      (P2.1)   sortowalna lista
src/ui/POIModal.js                      (P2.2)   function-based + Promise
src/ui/RallyAssignModal.js              (P3.1)   298 LoC — DOM modal
src/ui/ConfirmModal.js                  (P2.2)   custom THEME modal
src/ui/RightClickMenu.js                (P1.1)   PPM context menu
src/ui/RightClickMenuOptions.js         (P1.x)   menu options data
src/utils/TacticalRaycaster.js          (P1.2)   tactical map raycaster
src/utils/CoordTransform.js             (P1.x)   coord conversions
src/utils/TooltipContent.js             (P1.5)   universal tooltip
```

Plus 9 test files (tmp_m3_*.mjs) z ~286 cumulative smoke cases.

---

## Lekcje workflow L1-L55

### **Foundational (L1-L14 — M2b)**
Atomic commits, plan mode, V verifications, real-flow gates, snapshot deltas, L33 tag mandate, kontekst recovery.

### **M3 P1 (L15-L43)**
- L19/L20 V_extra real entity defs
- L23 + L28 gameplay intent per surface
- L33 tag mandate confirmed
- L34 + L39 V1 multi-keyword grep
- L37 diagnostic data > interpretation
- L40-L43 raycaster discrimination, error handling

### **M3 P2 (L44-L52)**
- L44 + L51 schema variation + existing infrastructure reuse
- L46 coord space gaps explicit verification
- L47-L48 function-based modals + Promise pattern
- L49 chore commits dla discovered bugs
- L50-L52 EventBus loose coupling, real coord formula

### **M3 P3.1 + P4 (L53-L55)**
- **L53:** Plan mode V verifications MUSZĄ cytować REAL runtime instance paths
- **L54:** Stored values w runtime Maps mogą być wrapper objects
- **L55 (kandydat):** Delegate research to Claude Code z source access (Filip's krytyka)
- Plus L23 + L28 w P3.2 drop decision

---

## Filip's pivotal decisions w M3

### **P3.1 — Rally assignment UI**
Initial pick: **(α) inline canvas list**. Mid-prompt zmiana na **(β) modal RallyAssignModal**. **Krytyka modal scalability** dla late-game 5-10 rally POI > short-term workflow consistency. **L28 retroactively w pełnej formie.**

### **P3.2 — DROP decyzja**
Filip's observation: *"po co mi ambush jak combat zawsze on i statki at war auto-engage"*. **Fundamentalne pytanie** ujawniło że event-only ambush NIE dodaje unique value. Decyzja: drop. Combat zawsze on przez existing VCS. Ambush jako POI type defined ale runtime = waypoint.

**Senior-grade design thinking** — gracz zatrzymał implementation feature bez clear value-add zamiast force-build.

### **P4 recovery — git state insight**
Filip zauważył że plan mode P3.2 ujawnił niespójność git: P3.1 commit message mówił o POIRuntimeSystem ale plik untracked. Filip zatrzymał Claude Code mid-plan, sprawdził `git status`, ujawnił że ~1400 LoC P3.1 jest only w working dir. Recovery przez 11 git ops zaadresował problem bez utraty pracy.

### **Workflow optimization**
Filip's krytyka *"dlaczego nie zapytasz Claude Code o wszystko promptem"* — **L55 kandydat**. Claude Code ma terminal + grep + source access, może zebrać 90% data samodzielnie. Devtools probe jest **uzupełnieniem**, NIE substytutem.

---

## Krytyczne bugfixes w M3

1. **M1 9-month motion bug** (P1.4) — cancel button odsłonił że vessels NIE zatrzymywali się properly. Bug istniał od M1, dopiero P1.4 implementation ujawnił.

2. **WORLD_SCALE coord space confusion** (P2.3) — Claude Code zakładał `AU_TO_PX=110`, realnie `WORLD_SCALE=10`. Plan mode V_extra coord space cytat ujawnił przed implementation.

3. **POI sprite color path** (P3.1) — Initial diagnostic czytał `wrapper.scale`, code path był `wrapper.sprite.scale`. Plan mode mini V_extra (grep source z line numbers) ujawnił że P3.1 ThreeRenderer kod był correct, mój ad-hoc diagnostic czytał wrong path.

4. **Planet hover API mismatch** (P4) — `entityManager.getEntity()` called ale method jest `.get()` plus `KOSMOS.entityManager` nie exposed. Plan zakładał castRay loop bug — V_extra ujawniło inny root cause.

5. **P3.1 fake commit** (P4 recovery) — commit message mówił o NEW POIRuntimeSystem.js ale plik untracked w git. Recovery przez `git reset --soft` + restash + rebuild proper commit + retag.

---

## Architectural patterns ustanowione w M3

1. **POI as gameplay primitive** — POIRegistry generic store, POIRuntimeSystem subscribes time:tick, type-dispatched tick functions (`_tickPicket`, `_tickRally`).

2. **EventBus loose coupling** — systems emit `poi:updated`, `poi:alertTriggered`, `poi:rallyComplete`. Listeners (ThreeRenderer, UIManager, TooltipContent) react bez direct coupling.

3. **Function-based modals + Promise** — `showXModal({...}) → Promise<result>`. Pattern: POIModal (P2.2), ConfirmModal (chore), RallyAssignModal (P3.1).

4. **Lazy default pattern w POI fields** — runtime fields (`triggered`, `cooldownEndsAt`, `complete`, `currentMembers`) consumers używają `poi.triggered ?? false`. Generic merge w POIRegistry akceptuje extra fields. **No schema migration needed** dla nowych runtime fields.

5. **TimeSystem auto-slow reuse** — `_triggerAutoSlow(reason)` istniejący method, P3.1 dodał `'poi_alert'` reason. **Zero TimeSystem modifications.**

6. **Tactical 2D + 3D asymmetric strategy per surface** — tactical map = full color palette + canvas hit zones, 3D map = sprite scale change (texture cache constraint), tooltip = universal content generator.

7. **Save migration backward compatible** — `_migrateV67toV68` lazy defaults pattern. Old saves load OK z default values applied.

---

## Deferred items (M4 backlog)

### **Nice-to-have:**
1. **POI animation pulse** dla triggered state — P3.1 użył simple scale change, animation pulse defer'owany
2. **Per-rally configurable gather range** — currently hardcoded 50px
3. **Star tooltip planet template** — drobne UX
4. **G2.3 cancel button hover** — drobne UX polish
5. **Browser maxlength feature acceptance** — drobne UX

### **Feature requests:**
6. **Movement orders auto-enable on game start** (Filip's E.1 feedback w P4) — currently wymaga `KOSMOS.debug.enableMovementOrders()`. Auto-enable w GameScene init (~5 LoC).
7. **Ambush runtime behavior** — z unique value-add (initiative bonus / force engagement / hidden positioning). Wymaga design decision PRZED implementation.

### **Architectural:**
8. **AI empire POI usage** — w M3 tylko gracz tworzy POI. AI empires powinny używać picket dla border defense, ambush dla offensive operations.

---

## Status z perspektywy KOSMOS

```
M3 dostarczył:
  ✅ POI ecosystem complete (5 types defined + 2 runtime)
  ✅ Universal tooltip system
  ✅ PPM context menu workflow
  ✅ Order menu + cancel motion fix
  ✅ Custom THEME modals (replaces window.confirm)
  ✅ Coord tooltip + RightClickMenu PPM
  ✅ POIPanel sort/filter/edit
  ✅ Save migration v66 → v68

Foundation dla M4:
  - VesselCombatSystem zawsze on (decyzja Filip's)
  - Universal tooltip pattern reusable
  - EventBus loose coupling pattern established
  - Function-based modals reusable
  - Generic POI store extensible (new POI types trivial)
```

---

## Cumulative milestone progress

```
M1: ✅ COMPLETE   (initial scaffolding)
M2a: ✅ COMPLETE  (VesselCombatSystem + ground combat)
M2b: ✅ COMPLETE  (FleetManagerOverlay + tactical map + L1-L14)
M3:  ✅ COMPLETE  (POI ecosystem + tooltip + L15-L55) ← TY TUTAJ
M4:  ⬜ TBD       (combat extensions? AI POI? new POI types?)
```

---

**M3 closed. 6 tygodni intensywnej pracy, ~6000 LoC, 16 commitów, 55 lekcji, zero catastrophic failures. KOSMOS solid foundation dla M4.** 🚀

**Solidnie zasłużony milestone.**
