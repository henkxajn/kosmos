# KOSMOS — solar-system simulator + 4X strategy (browser game)

## Maintenance
- This file is instructions only. Hard cap: ~5k tokens.
- Arc/slice close-outs, gate results, decision records and finding registries go to the arc's
  plan doc in `docs/design/` and to `docs/history/<domain>.md` — never here. A `docs(X)` commit
  must not append to this file.
- If something here is wrong or stale, fix it in place; don't add a correction below it.

## What it is
Two layers: (1) simulation — a generated planetary system evolving on Kepler orbits;
(2) 4X — once a civilization exists the player runs it: hex colony maps, tech, fleets,
stations, AI empires, war and diplomacy. Endgame: Dyson sphere → jump gate.
Vision, design principles, decisions, lore: `docs/GAME_DESIGN.md`.

## Stack & running
- Native ES modules, no bundler, no npm at runtime. Three.js from CDN (importmap) for 3D;
  Canvas 2D for UI and the planet hex map.
- Run: open `index.html` with VS Code Live Server. `src/main.js` → `TitleScene` → `GameScene`
  (wires every system into `window.KOSMOS`; console tools under `KOSMOS.debug.*`).
- Node v24 only for tooling: `generate-planets.js` + `lib/` (planet textures →
  `assets/planet-textures/`), `npm run ship -- <slot>` (ship-model normalizer),
  `tools/model-workshop/index.html` (via Live Server), tests.
- Save: localStorage `kosmos_save_v1` plus `.json` files on disk (menu ☰ / title screen).
  The save version is `CURRENT_VERSION` in `src/systems/SaveMigration.js` — the only source of
  truth; never trust a version number written in a doc.

## Tests
- Keepers: `src/testing/smoke/<topic>_smoke.mjs`. Sweep:
  `node src/testing/smoke/run-all.mjs [--quiet]` — must end with 0 FAIL.
- i18n gate: `node tools/check-i18n.mjs` (PL/EN key parity + hard-coded literal ratchet).
- Headless sim: `src/testing/headless/` (`GameCore.boot()`, `probe-*.mjs`). Fixtures:
  `src/testing/fixtures/` (canonical save `GATE-S4-fresh-gy60.save.json.gz`, recorded traces
  in `fixtures/traces/`, conventions in its README).
- Node `three` is a tracked stub (`src/testing/fixtures/three-stub`, devDependency `file:`;
  `npm ci` recreates the link). Never edit the stub to make a test pass.
- Measure real-game behaviour with headless Chrome over CDP, not by assumption.

## Repo map
- `src/scenes/` GameScene, TitleScene (`PlanetScene` is legacy, never opened).
- `src/systems/` game logic, one mechanic per system; `src/systems/director/` AI empire decisions.
- `src/data/` definitions and balance numbers (buildings, tech, hulls, modules, tuning tables).
- `src/entities/` bodies, Vessel, Station; `src/map/HexGrid.js` cube coordinates.
- `src/renderer/` ThreeRenderer, ThreeCameraController; `src/renderer/combat/` battle stage
  and FX (pure `*Logic.js`).
- `src/ui/` Canvas UI (UIManager, ColonyOverlay, FleetManagerOverlay, Outliner, HUD layers on
  `#hud-canvas`); pure helpers in `*Logic.js`.
- `src/utils/` shared canons (see Traps) and pure math. `src/core/` EventBus, EntityManager,
  GameState, DebugLog. `src/config/GameConfig.js` constants + `FEATURES` flags.
  `src/i18n/pl.js`, `en.js`. Also `src/generators/`, `src/scenarios/`, `src/debug/`.
- `docs/design/` plans, decision records, gate checklists, finding registries ·
  `docs/audit/` read-only audits · `docs/handoff/` step state · `kosmos-handover/`
  (untracked) gate checklists and contact sheets.
- Reference: `docs/ARCHITECTURE.md` (rendering, 4X dependency map, EventBus event table,
  save/migration protocol and save-file strategy, critical files), `docs/GAME_DESIGN.md`,
  `docs/history/` (arc and slice logs by domain).

## Architecture rules
- Systems talk only through `EventBus` (`on` / `emit`); never import one system from another.
  4X systems are reached lazily via `window.KOSMOS`.
- Data in `src/data/`, logic in `src/systems/`. Named constants with units; simple rules over
  special cases.
- New domains (empires, intel, diplomacy, wars, battles, invasions) live in `GameState` and
  change only through intent methods of their owner system.
- Non-pausing notices go through `NotificationCenter` (bell + Event Log); important events
  auto-slow time.
- Critical files — change only with a plan: `src/core/EventBus.js`, `src/core/EntityManager.js`,
  `src/systems/PhysicsSystem.js`, `src/config/GameConfig.js`, `src/map/HexGrid.js`,
  `src/systems/SaveMigration.js`, `generate-planets.js` + `lib/`, `assets/planet-textures/`.
- Save format change: bump `CURRENT_VERSION`, add `_migrateVNtoVN+1` and register it in
  `MIGRATIONS`, `?? default` in `restore()`, write the field in `serialize()`. Migrations live
  only in `SaveMigration.js`. Prefer designs that round-trip without a migration.
- Behaviour changes ship behind `FEATURES.<flag>` (OFF = old behaviour bit for bit); at arc end
  flags become permanent and OFF paths are removed, proven by before/after frame comparison.

## Workflow
1. Read-only audit (measurements, findings, options) → plan doc in `docs/design/` → the owner
   (Filip) signs the decisions → only then code. A task's framing is a hypothesis: measure
   first. Before changing a system, grep `docs/design/` and `docs/history/` for it.
2. Implement in small steps; keepers + sweep + `check-i18n` green. Visual steps: keepers only
   for logic (no pins on drawing constants), an HTML contact sheet across the 5 themes, owner
   viewing + tuning loop.
3. Live browser gate by the owner before every commit. Write the gate checklist to a file
   before the gate starts; validate every console one-liner on the live engine and confirm that
   every UI element you ask the owner to click exists. Gate window: 1600×1041 CSS (UI scale
   ≈1.25); 1280×833 and pre-change code are controls and must give a different result.
4. Atomic commits on `main` (no branches), staging explicit paths only (other sessions commit in
   the same tree). Commit or push only when asked. Usual pair: `feat(X)` code, then `docs(X)`
   close-out with the gate result (in the plan doc and `docs/history/`, not here).
- ⚠ Never write any file while a live gate may be open: every write (code, docs, even an audit
  report) makes Live Server reload the owner's tab and drops the game to the last save. If a
  gate might be open, ask before writing.

## Language
- Chat with the owner, gate scripts and checklists: Polish. Plan docs, prompts, commit
  messages: English.
- Code: comments in Polish, identifiers in English (camelCase, PascalCase classes, `_private`
  methods, UPPER_CASE data constants), physical units in comments.
- Every visible UI string exists in PL and EN (`t()` keys in both `src/i18n/` files; data
  entities carry `namePL` / `nameEN`).

## Naming
- Commits: `type(scope): summary` — types `feat fix docs refactor tune data chore`; scope = step
  id (`CV-4a`, `W3-4b`, `G5-C`) or finding numbers (`663`, `640+675`).
- Findings: one global sequence `Finding NNN` / `#NNN`, never reused. Before assigning a number,
  grep the plan docs in `docs/design/` for the highest one in use. VISUALS findings use `V-NNN`
  (a bare 246–254 is the AI-economy arc). Status: ✅ closed · 🔴 critical · 🟠 open · ⚪ minor /
  no step. A finding is recorded and closed in its own arc's plan doc;
  `docs/design/OPEN_FINDINGS_INDEX.md` is an index, not the truth — before planning from it,
  run the keeper and `git log -S`.
- Decisions `D-<ARC>-<n>` (or numbered decisions in the plan). Plans
  `docs/design/<ARC>_PLAN.md`, gates `<ARC>_GATE<n>_CHECKLIST.md`, audits
  `docs/audit/<TOPIC>_AUDIT.md`, keepers `<topic>_smoke.mjs` (old docs still say `tmp_*`).

## Active documents
- `docs/design/COMBAT_VISUALS_PLAN.md` — combat visuals plan and findings registry; its arc
  summary lists findings for future mechanics and sound work.
- `docs/design/POLISH_PLAN.md` — UI and graphics polish.
- `docs/design/VESSEL_ORDERS_PLAN.md` — main registry of orders, fleet and combat findings.
- `docs/deferred-live-gates.md` — browser checks deliberately deferred.
- `KOSMOS_backlog_niezrealizowane.md` — unscheduled backlog.
- Arc plans (registries of their findings): UI_PLAN, HUD_PLAN, TABS_REFORM_PLAN, GALAXY_PLAN,
  AI_STRIKES_BACK_PLAN (§8.7 binding rules), AI_GARRISON_PLAN, WOJNA_I_POKOJ_MASTER_PLAN,
  COLONY_OWNERSHIP_GUARD_PLAN, VISUALS_PLAN, `docs/POPULATION_REDESIGN.md`.

## Traps (each one cost a real bug)
Headless and keepers
- `ThreeRenderer`, `GameScene`, `UIManager`, `ColonyOverlay` do not import under node
  (`THREE.TextureLoader`) → source pins only. `FleetManagerOverlay`, `Outliner`,
  `BottomContext`, `CargoLoadModal`, `GroundUnitPanel` do import → pin by execution.
  `GameCore.boot()` mounts no MOS / OrderService / FleetSystem; a second `boot()` wipes the world.
- Fail-first in a real `git worktree --detach <base>` with the final pins (not `git archive`:
  EOL differs). A control pin is green on both sides; a pin that is red on the base is not a control.
- Every exclusion pin needs a witness (`every()` on an empty set is a false green). Pins degrade,
  never abort: import not-yet-existing symbols via namespace or dynamic `import()`.
- Source pins read `\r\n→\n`-normalized text with comments stripped and never assert disk EOL.
  Pin the live path (`ColonyOverlay` keeps V1-legacy / V2-live pairs). `node --check` is not a test.
- `check-i18n` parses `t('…')` even inside comments — don't quote such calls in keeper comments.
- `KOSMOS.debugLog` is the AI/war/diplomacy audit (closed `TRACKED_EVENTS`, wiped on scene
  restart). A new AI refusal reason joins `TRACKED_EVENTS` in the same commit; fleet events
  never do — the fleet channel is the Event Log (`EventLogSystem`).
- Keepers that declare war set `fleetPoolSystem.enabled = false` unless they pin the pool; a needed
  undefended AI colony → `garrisonSystem.enabled = false`; landing/capture tests declare war in setup.
Game model
- Ids are global, coordinates are per star system (star at 0,0). Compare systems with
  `SystemScope` (`isSameSystem` fail-open for orders; `isSameSystemStrict` fail-closed, combat only).
- Use the canons, don't re-derive: `ColonyOwnership`, `SystemExploration` (fail-closed),
  `SystemReveal`, `VesselReveal`, `VesselStatus` (labels only), `WarGate`, `RetreatTarget`,
  `GroundVisibility`, `CameraFrame` (camera-frame admission at finalization, never at arm).
- Seams: AI hull only via `VesselManager.createAIVessel`; AI ground unit only via
  `GroundUnitManager.createAIUnit`; AI strike only via `StrikeSquadronSystem.launchSquadron`;
  non-combat vessel removal only via `VesselManager.destroyVessel(id, { reason })` —
  `vessel:docked` is not a removal event.
- `AcceptanceEngine._kosmos()` is a whitelist: a missing key silently zeroes a term.
- A passing gate or predicate is not the effect — measure the effect. Count all producers of an
  event before calling a class of bug fixed.
Rendering
- Visual code never calls `Math.random` — use `rendererRandom` (`src/renderer/RendererRng.js`);
  the `generateUUID` patch in `src/lib/three.core.js` must be reapplied when updating three.
- GLSL: per-object values via uniforms, never string-interpolated (shared program cache); no
  backticks inside GLSL template literals; every GLSL commit carries a headless compile probe with
  a failing control; kill-switch OFF paths read a frozen copy of the knobs.
- Custom shaders write log depth via `src/renderer/LogDepthChunks.js`, except
  `PlanetGlobeRenderer` (no log depth buffer there).
- A `FEATURES` flag flipped in the console applies only after entering a different system; F5
  reloads flags from the file.
UI
- A new full-screen modal in `ColonyOverlay` → add its flag to both functions of
  `src/ui/ColonyModalLogic.js`. The info-panel globe size is fixed for all tabs
  (`fixedGlobeSize`); scroll is the only valve.
- Canvas `clip()` does not clip hit zones; `FleetManagerOverlay` is not a `BaseOverlay`.
Tooling
- Patch scripts are files written with `open(p, 'wb')`; heredocs collapse `\\`. Don't trust
  `| head` on existence greps.
- Never junction `node_modules` into a worktree (`git worktree remove --force` deleted the main one).
