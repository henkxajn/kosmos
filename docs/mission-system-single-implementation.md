# Mission system: MissionSystem is the ONLY live implementation — ExpeditionSystem.js is dead code

**TL;DR:** There is exactly one runtime mission system: `MissionSystem`. `ExpeditionSystem.js`
is never constructed and never imported — it is dead code. "mission-vs-expedition parallel" is
**not** a live duplication to keep in sync. When touching mission logic, edit **only**
`src/systems/MissionSystem.js`.

## Evidence

- **The two globals are the same object (an alias).** `src/scenes/GameScene.js:247-248`:
  ```js
  this.expeditionSystem = new MissionSystem(this.resourceSystem);
  this.missionSystem    = this.expeditionSystem; // alias — ten sam obiekt
  ```
  So `window.KOSMOS.expeditionSystem` and `window.KOSMOS.missionSystem` both point to the **same
  `MissionSystem` instance**. Anything reading either global hits `MissionSystem`.
- **No construction site.** `grep -rn "new ExpeditionSystem" src/` → **nothing**. `ExpeditionSystem`
  is never instantiated anywhere in the runtime.
- **No import.** `grep -rnE "import .*ExpeditionSystem|from ['\"].*ExpeditionSystem" src/` →
  **nothing**. `ExpeditionSystem.js` is not imported by any module.
- **`ExpeditionSystem.js`'s own EventBus subscriptions never fire** (e.g. its
  `on('expedition:transportRequest', …)` and `on('time:tick', …)`) because no instance exists to
  register them. Its handlers — including a **twin, un-gated `createOutpost` in
  `_processTransportArrival` (`:1654`)** — are unreachable.

## Why this matters (the concrete case that surfaced it)

During task A4 (gate transport-delivery outpost creation on `body.explored`), both
`MissionSystem._processTransportArrival` (`:2151`) and `ExpeditionSystem._processTransportArrival`
(`:1654`) contained an un-gated `createOutpost`. The "change duplicates in both" reflex would say
gate both. But only `MissionSystem` runs, so gating it **fully closes the hole**. (Corroborating
signal: A3's live gate produced an outpost carrying the *delivered cargo* — MissionSystem's richer
path; ExpeditionSystem creates an *empty* `{}` outpost. The behaviour observed in-game is
MissionSystem's.)

`MissionSystem.js:1-12` documents itself as "ewolucja ExpeditionSystem" that absorbed the full
logic; the alias was left in place for backward-compatible global names.

## Removal candidate — pending a reference sweep

`ExpeditionSystem.js` can be deleted. Before removing, note that all remaining `ExpeditionSystem`
references in `src/` are **non-code** and do **not** block removal:

- **Comments only:** `FleetActions.js:310`, `ColonyManager.js:12`, `CivilizationSystem.js:766`,
  `VesselManager.js:456`, and several in `MissionSystem.js` (parity/origin notes).
- **i18n section-header comments:** `pl.js` / `en.js` (`// === ExpeditionSystem … ===`). ⚠ The
  `expedition.*` **i18n keys under those headers are LIVE** — `MissionSystem` uses them
  (`t('expedition.…')`). Removal must touch only the *comment header*, never the keys.

So a removal is: delete `src/systems/ExpeditionSystem.js`, optionally relabel the i18n header
comment, leave everything else. No import/instantiation to unwind.

_Discovered: task A4 (2026-07-27). See commit `13b64ea` for the A4 gate itself._
