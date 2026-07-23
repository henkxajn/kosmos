# KOSMOS Reform — Stage 1 Report

**Scope.** Unify the triplicated building-placement gate (A1), add a real climate gate to `farm` (A2),
and surface a climate-blocked Farm with a reason instead of silently omitting it (A3). Plus read-only
investigation of Well/water calibration data (B1), AI-parity risk (B2), and the building-category
inventory (B3). Builds on `PLANET_SYSTEM_AUDIT.md`.

**Status: Part A implemented + tested. NOT committed** — handed back for Filip's browser live-gate.
Part B changed **no** game logic (findings only). Save version untouched (v92 — the reform builds only on
already-round-tripping fields: `atmosphere`, `temperatureC`; no migration needed).

> **A2 latent-gate note (found during Stage 2 live-gate, 2026-07-23).** The Farm gate at `HexTile.js:174`
> hard-blocks on `planet.atmosphere === 'none'`. **Planetoid bodies carried `atmosphere === undefined`**
> (the class never assigned it — only `Planet`/`Moon` did), so `=== 'none'` silently failed to fire on them:
> a warm airless planetoid would slip the atmosphere half of the gate. It hadn't manifested (all such bodies
> observed were also below the temperature threshold, so Farm stayed blocked on temperature anyway). Fixed at
> the source in Stage 2 — `Planetoid`/`Asteroid` constructors now set `atmosphere = 'none'` (airless), which
> makes this gate fire correctly with no change to A2's own logic. Detail: `REFORM_STAGE2_REPORT.md`.

**Two decisions taken with the user before coding:**
1. **Gate scope = universal** — the hard block applies to player *and* AI, using each colony's **own**
   planet (not `window.KOSMOS.homePlanet`). AI-expansion-colony exposure is documented in B2 as the
   deferred follow-up, not fixed here.
2. **Reason wording = plain** — "Too cold for this building" / "Requires atmosphere".

---

## Part A — Implemented

### A1 — One shared buildability evaluator (single source of truth)

**New pure function `evaluatePlacement(tile, building, { techSystem, planet }) → { ok, reason, kind }`** in
`src/map/HexTile.js` (co-located with `TERRAIN_TYPES` — this avoids a circular import, since
`BuildingSystem`/`ColonyOverlay`/`RegionSystem` already import from `HexTile.js` and `HexTile.js` imports
nothing back). `reason` is an i18n **key**; `kind ∈ {'terrain','climate',null}` so callers can distinguish
"omit" (terrain) from "show locked" (climate). It reproduces the authority ladder verbatim —
`buildable → damaged → terrainOnly → terrainAny → allowedCategories → getTerrainUnlocks` — **including the
tech-unlock branch that the picker was missing** (the desync fix), then appends the A2 climate gate.

The audit's "3 copies" were actually **5**; all now route through the one function:

| Site | File:line | Change |
|---|---|---|
| Authority | `src/systems/BuildingSystem.js` `_canBuildOnTile` (~:1465) | Delegates: `return evaluatePlacement(tile, building, { techSystem: this.techSystem, planet: this._resolveOwnPlanet() }).ok;` — preserves the `=>bool` contract for its 3 callers (`_build`, `testing/actions/ActionCatalog.js:83`, `PlanetGlobeRenderer.js:468`). |
| Enforcement | `BuildingSystem._build` (~:451-459) | Now calls `evaluatePlacement` directly and emits the **specific** reason (`t(placement.reason)`) instead of always `ui.terrainForbidden`. |
| UI mirror | `src/ui/ColonyOverlay.js` `_getAvailableBuildings` (~:3120) | Keeps the tech/prereq/faction/`isCapital` omit-filters; replaces the inline terrain tail with `evaluatePlacement` → **desync auto-fixed**. Return shape changed (see A3). |
| Dead copy | `src/map/HexTile.js` `canBuild` (~:240) | Keeps occupancy guards, delegates terrain via `evaluatePlacement(this, { category })`. |
| Dead copy | `src/map/RegionSystem.js` `Region.canBuild` (~:100) | Same delegation (extra copy collapsed for completeness; zero production callers). |

New helper `BuildingSystem._resolveOwnPlanet()` (~:1458) →
`window.KOSMOS?.colonyManager?.getColony(this._planetId)?.planet ?? null` — the multi-colony-safe pattern
already used at `BuildingSystem.js:1823`. **Deliberately NOT** `homePlanet` (the audit-flagged bug in
`_isPlanetExtreme`). Fail-open: an unresolvable planet → `null` → climate gate skipped (never blocks on a
missing reference).

`PlanetGlobeRenderer`'s inline fallback (`:471-475`) was left untouched — it only fires if `_canBuildOnTile`
is absent (never), and the primary path now delegates correctly.

### A2 — Farm climate gate + thin-atmosphere ×0.5 food penalty

- **`src/data/BuildingsData.js`** — added `requiresOpenAirClimate: true` to **`farm`** only (`:165`). This
  single flag drives both the hard block and the ×0.5. `well` (outputs `water`) and
  `synthesized_food_plant` (`isSynthFood`, deliberately for soilless/airless bodies) are left unflagged —
  see B-note in A2's "other food building" question below.
- **Hard block** — inside `evaluatePlacement` (A1): `atmosphere === 'none'` → block
  (`ui.requiresAtmosphere`); `(temperatureC ?? 0) < 0` → block (`ui.requiresWarmth`), evaluated on the
  tile's own colony planet. Universal (player + AI).
- **×0.5 multiplier — `BuildingSystem._calcBaseRates`** (`:1495` factor, `:~1543` application):
  ```js
  const climatePlanet   = this._resolveOwnPlanet();
  const climateFoodMult = (building.requiresOpenAirClimate && climatePlanet?.atmosphere === 'thin') ? 0.5 : 1.0;
  ...
  base[key] = val * multiplier * (key === 'food' ? climateFoodMult : 1) * latMod.production * levelMult * anomalyMult;
  ```
  `multiplier` (terrain `yieldBonus`) and `climateFoodMult` are independent factors → they **stack
  multiplicatively** exactly as specified (ice_sheet `0.8 × 0.5 = 0.4`). Recomputes for free via
  `_reapplyAllRates`. Breathable homes (player + AI) are never `thin`, so unaffected.

**A2's "any other food building besides farm/well?" question — answered:** yes, exactly one —
`synthesized_food_plant` (`BuildingsData.js:383`, `category:'food'`, `rates:{food:6}`, `isSynthFood:true`,
`terrainAny:true`, `requires:'food_synthesis'`, described "food on soilless/airless bodies"). It is
**conceptually sheltered/synthetic, not open-air agriculture**, so per the prompt's judgment call it was
**left unflagged** — it must remain the intended fallback for airless worlds. `well` also stays unflagged
(it outputs water, and the prompt explicitly excludes it).

### A3 — Visible-but-locked-with-reason (instead of vanishing)

- **i18n** (plain wording, PL+EN) added next to `ui.terrainForbidden`:
  - `src/i18n/pl.js`: `ui.requiresWarmth` = "Za zimno dla tego budynku", `ui.requiresAtmosphere` = "Wymaga atmosfery".
  - `src/i18n/en.js`: `ui.requiresWarmth` = "Too cold for this building", `ui.requiresAtmosphere` = "Requires atmosphere".
- **`_getAvailableBuildings`** now returns `[{ id, locked, reason }]`. Terrain/tech/faction/prereq failures
  still **omit** (unchanged); a **climate** failure is **kept** as `{ locked:true, reason }`. Both consumers
  updated (`:2711` layout uses `.length`; `:2925` render loop iterates objects).
- **Render loop** (`_drawFloatingPanel`, ~:2943) — a locked row reuses the existing `!canAfford` greyed
  styling (border `#442222`, text `#666`) plus a `🔒` prefix.
- **Enforcement + flash** — clicking a locked row still emits `planet:buildRequest`; `_build` rejects via
  `evaluatePlacement` and emits `planet:buildResult { success:false, reason }`, which the existing handler
  (`ColonyOverlay.js:118` → `_showFlash(e.reason)`) surfaces automatically. **No new flash wiring** — the
  server is the single enforcement point.
- **Hover tooltip** (~:3849) — appends the lock reason (`🔒 <reason>`) from a per-frame
  `this._buildLockReasons` map, so the row explains itself on hover too, not only on click.

### How Part A was tested

- **New smoke `src/testing/smoke/farm_climate_gate_smoke.mjs` — 34/34 PASS.** Covers: the terrain ladder
  (ocean/mountains/plains/ice_sheet/damaged); the **tech-unlock desync fix** (a faked
  `getTerrainUnlocks(['food'])` flips a mountains+farm from block→ok — the branch the picker used to drop);
  the climate gate (`none`→`requiresAtmosphere`, `temp<0`→`requiresWarmth`, `thin`/`breathable`/`dense`+temp≥0→ok,
  boundary temp===0→ok); `well`/`synth` never climate-blocked; fail-open with `planet:null`; the ×0.5 in
  `_calcBaseRates` (farm/plains thin 7.0 vs breathable 14.0; farm/ice_sheet thin 4.0 = 0.8×0.5 vs 8.0);
  `well`/`synth` output identical on thin vs breathable; and **multi-colony safety** (two colonies gate/scale
  on their own planet with `homePlanet` set breathable — proving `homePlanet` is not used).
- **Regression:** the full smoke suite (41 files) runs **0 FAIL**, including `energy_brownout_gate_smoke`
  (27/27, exercises `_calcBaseRates`) and `s34d_hull_gating_smoke` (26/26).
- **`node --check`** passes on all 7 edited source files.
- **`node tools/check-i18n.mjs` → PASS** (new keys present + consistent in both locales).
- **Not run:** the browser live-gate — that is Filip's step before commit.

---

## Part B — Investigation (findings only; no code changed)

### B1 — Well / water calibration data (for a later `surface.hasWater`-from-composition stage)

**H2O literal per `getCompositionTemplate` preset** (`src/data/ElementsData.js:225-232`; presets `:89-129`),
percent-by-mass, renormalized ~100 at generation with ±20% per-element jitter:

| preset | H2O% | used for |
|---|---|---|
| `hot_rocky` | **0** | rocky inside the hot zone |
| `rocky` | **2.5** | rocky in/near HZ (`orbitalA ≤ hz.max×1.3`) |
| `rocky_cold` | **28** | rocky beyond HZ |
| `gas` | **0** | gas giants |
| `ice` | **49** | ice planets |

Reference neighbors: comet 40, icy moon 55, carbonaceous planetoid 8.

**Representative sample of actual generated masses** (12 generated systems; `mass` in M⊕; H2O the stored
fraction incl. jitter). `hot_rocky` did not appear in this draw (rarer close-in type; code range 0.1–2.0):

| planetType | n | mass min/median/max (M⊕) | H2O% min/med/max | **abs H2O = H2O%×mass, median (M⊕)** |
|---|---|---|---|---|
| rocky | 41 | 0.64 / 3.84 / 5.72 | 2.03 / 2.94 / 31.88 | **0.13** |
| gas | 30 | 26.98 / 171.46 / 319.56 | 0 / 0 / 0 | 0.00 |
| ice | 14 | 2.38 / 14.57 / 18.74 | 43.73 / 49.55 / 53.65 | **7.25** |

Generator mass bands (`SystemGenerator.getPlanetMass:435-446`): hot_rocky 0.1–2.0, **rocky 0.3–6.0**, ice
2–20, gas 50–330 (near) / 10–50 (far).

**The calibration point, made concrete:** a median **ice** planet holds ~**7.25 M⊕** of absolute water vs a
median **rocky** planet's ~**0.13 M⊕** — a ~56× gap, even though ice's H2O *fraction* is only ~20× larger,
because ice planets are also ~4× more massive. The rocky H2O% column already spans in-HZ (`rocky` ~2.5%) and
cold (`rocky_cold` ~28%) presets in one type. **A flat H2O-% cutoff would rank a small icy moon (55% H2O,
mass «1 M⊕) above a large rocky world** in "water", which is backwards in absolute terms — so a future
`hasWater` must be **mass-weighted** (H2O% × mass), exactly as the prompt anticipated.

**Reference table:** there is **no** importable real-constants table (no `EARTH_MASS`/`M_EARTH`). The only
literal SI Earth mass is inline in a sandbox (`src/sim/WorldGen.js:30`, `5.972e24`). The reusable pieces for
a calibration are the composition presets above, the Earth-relative unit conventions + physical temperature
pipeline in `SystemGenerator.js` (M⊕ / R⊕ / g; `calcEquilibriumTemp`), and the `GREENHOUSE`/atmosphere enum
— not a dedicated constants file.

### B2 — AI-parity risk for the new Farm gate (universal enforcement was chosen)

- **AI builds through the real `BuildingSystem`.** Each AI colony owns a real instance + hex grid
  (`ColonyManager.createColony:389`); runtime expansion calls the real `_build`
  (`ColonyAutoExpander._tryBuild → bSys._build`, `:509`). So **both** the `_build` gate and the
  `_calcBaseRates` ×0.5 reach AI colonies.
- **Two entry points.** Runtime expansion goes through `_build` (now gated). The **bootstrap** path
  (`EmpireColonyBootstrap._placeBuildingSmart → _activateBuilding`, `:699`) **bypasses `_build`** — so
  starting home farms are not blocked (and the home is breathable anyway), but their output is still halved
  by `_calcBaseRates` if the planet were `thin`. (This is also why the gate lives in placement, not
  `_activateBuilding` — that path is shared with save-restore, and gating it would delete legacy farms on
  load.)
- **Fallback is clean — no crash, no busy-loop.** A gated `_build` returns early without setting tile flags
  → `_tryBuild` classifies `'fail'` → `_markUnreachable` (30 civYear) + `_blacklistTile` (60 civYear), then
  moves to the next building. No throw, no per-tick retry storm.
- **But no food recovery.** `farm` is planned regardless of climate (`BUILD_PRIORITY[0]`, the survival
  `organics<0` rule, and target counts). AI colony food/population is **real** (per-colony
  `CivilizationSystem`: consumption, growth-halt, starvation at `foodRatio<0.02`). **AI home colonies are
  protected** (breathable + gate-bypassing bootstrap farms). **AI expansion colonies are exposed** — they
  colonize thin/dense/cold bodies and rely on runtime `_build` for farms, so a blocked farm can make the
  colony's food deficit permanently unsolvable by the planner → slow starvation.
- **AI food/water trade.** Generic gradient-driven **intra-empire** food/water trade exists
  (`CivilianTradeSystem`), but nothing **deficit-triggered**; **AI↔AI cross-empire is blocked**; the physical
  courier layer (`EmpireLogisticsSystem`) hauls only mined Xe/Nt/Ti, never food/water. So the intended fix —
  "AI trades for food when its farms are climate-blocked" — is **largely new behavioral work** on the
  existing transfer plumbing, not a config flip.
- **Conclusion (deferred):** Stage 1 ships the universal gate as decided. The AI-expansion starvation
  exposure is the documented follow-up for a later stage; **not fixed here** per the prompt.

### B3 — Building-category inventory

12 distinct `category` values across `src/data/BuildingsData.js`:
`population`, `mining`, `energy`, `food`, `research`, `space`, `military`, `market`, `infrastructure`,
`synthetic`, `governance`, `civil`.

---

## Edge cases / risks flagged

- **Cold-breathable home:** `getAtmosphere` allows `breathable` for `T ∈ [-30, 50]`, so a breathable home
  could have `temperatureC < 0` and thus block *additional* farm placement (starting farms survive — placed
  via the bootstrap path). This is per-spec (the prompt lists `temp<0` as a block independent of atmosphere),
  but worth noting as a gameplay consequence on cold home worlds.
- **`_resolveOwnPlanet()` fails open:** unresolvable `_planetId`/colony/planet → `null` → climate gate and
  multiplier both no-op. Safe default (never blocks on a missing reference).
- **Placement-only gate:** legacy/restored/home farms on now-"cold" worlds keep producing; only *new*
  placement is blocked (the `thin` ×0.5 still applies to their output). No migration, no retroactive removal.
- **Airless/frozen worlds now require synthetic food (intended tech-pressure):** on an `atmosphere:'none'`
  or sub-zero world, `farm` is hard-blocked and `well` yields only water, so the sole food building is
  `synthesized_food_plant` — which needs the `food_synthesis` tech. A colony founded there *before*
  researching that tech has no food source. This is the intended resource/tech tension the gate creates
  (airless worlds should be harder to feed), not a bug — but worth watching in the live-gate for both the
  player's early colonies and AI expansion (see B2).

## Independent verification
An independent adversarial review of the full diff (read-only) reported **no correctness issues** across all
8 targeted checks: no circular import (`HexTile.js` has zero imports, so it initializes first in any cycle);
`climateFoodMult` applied only to positive `food` output, stacking with the terrain multiplier, never to
consumption/research/energy/maintenance; `_build` ordering unchanged and all three reason keys resolve in
both locales; `_getAvailableBuildings`' new object return type handled by both (and only) consumers; the
synthetic `{category}` path safe; `_resolveOwnPlanet` never reintroduces `homePlanet`; the tooltip map safe;
and the `_canBuildOnTile`-caller behavior change (ActionCatalog, PlanetGlobeRenderer) is the intended
universal parity.

## Files touched (Part A)
`src/map/HexTile.js`, `src/map/RegionSystem.js`, `src/systems/BuildingSystem.js`,
`src/data/BuildingsData.js`, `src/i18n/pl.js`, `src/i18n/en.js`, `src/ui/ColonyOverlay.js`,
`src/testing/smoke/farm_climate_gate_smoke.mjs` (new).
