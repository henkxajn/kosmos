# KOSMOS Reform — Stage 3 Report

**Scope.** **A1** — Well water gate (mirror Stage 1's Farm climate-gate infrastructure, one more
condition). **A2** — scale `_upgrade` cost by environment (close the Stage 2 Part B4 scope gap). **B1** —
report-only audit of `ENVIRONMENT_SENSITIVITY` category contents. **Follow-up A** (live-gate round 2) — scale
`commodityCost` by the same environmental premium as resource cost, in `_build` + `_upgrade` + preview.
**Follow-up B** (live-gate round 2) — zero environmental sensitivity for orbital-anchored buildings via a
per-building override. Builds on `PLANET_SYSTEM_AUDIT.md`, `REFORM_STAGE1_REPORT.md`, `REFORM_STAGE2_REPORT.md`.

**Status: A1 + A2 + Follow-up A + Follow-up B implemented + tested. NOT committed** — handed back for Filip's
browser live-gate. Save version untouched (no serialized-schema change; all features read already-round-tripping
fields `surface.hasWater`, `surfaceGravity`/`atmosphere`/`temperatureC`, and static building flags).

---

## A1 — Well water gate (implemented)

Mirrors Stage 1's Farm climate gate exactly — same `evaluatePlacement` single-source, same
visible-locked-with-reason picker path, same fail-open convention.

- **`src/data/BuildingsData.js`** (`well`, `:188`) — added `requiresWater: true`.
- **`src/map/HexTile.js`** `evaluatePlacement` (`:178-183`) — new gate **after** the climate gate:
  ```js
  if (building.requiresWater && planet && !planet.surface?.hasWater) {
    return { ok: false, reason: 'ui.requiresWater', kind: 'climate' };
  }
  ```
  - **Pure hard block** — `hasWater` is boolean, no graduated yield-penalty tier (unlike Farm's
    atmosphere-thin `×0.5`). No `_calcBaseRates` change; the water gate is placement-only.
  - **Fail-open** via `&& planet` (matches Stage 1's climate gate `if (requiresOpenAirClimate && planet)`):
    a null/unresolvable planet → gate skipped, never blocks on missing data. **Deliberate deviation from the
    prompt's literal `!planet?.surface?.hasWater`** — that form blocks when `planet` is null too (fail-*closed*),
    which contradicts the reform's established fail-open rule (Stage 1 §B4). The `&& planet` form is the
    faithful "mirror Stage 1" reading.
  - **`kind: 'climate'`** (not a new `'water'` kind) is required to reuse the picker's visible-locked branch
    (`ColonyOverlay._getBuildableForTile` shows locked-with-reason only for `kind === 'climate'`; an unknown
    kind would silently drop the row). It's the "environment gate" bucket, shared with the climate reasons.
  - A **planet present but with no `surface` object** → blocked (`!undefined` → true). Fail-closed for that
    edge is intentional: no confirmed water. All real bodies carry `surface`, so this is a data-anomaly guard,
    not a live path.
- **i18n** (`src/i18n/pl.js:805`, `en.js:804`) — `ui.requiresWater` = `"Brak wody"` / `"No water"` (plain,
  Stage-1 style). Renders through the same picker/tooltip/flash pipeline as `ui.requiresAtmosphere` (verified
  `kind:'climate'` end to end).
- **AI exposure — confirmed, no new work needed.** `well` is in `ColonyAutoExpander.BUILD_PRIORITY`
  (`:98`) and the Industrialist archetype build order (`EmpireArchetypeIndustrialist.js:108`, already
  `preferredTerrain:['water','ice']`). AI placement flows `_tryBuild → _findFreeTile` (terrain-only) →
  `bSys._build` → **the same `evaluatePlacement`** → on block, `_build` no-ops and `_tryBuild` reads
  unchanged tile flags → outcome `'fail'` → `_blacklistTile` (`TILE_BLACKLIST_CIVYEARS=60`). Identical
  clean fallback (mark-unreachable + blacklist, no busy-loop, no crash) that Stage 1 §B2 already cleared for
  the Farm climate gate — water is a planet-level property just like atmosphere/temperature, so the behavior
  is the same class. *(Balance note, not a bug: a waterless AI colony can now never build `well`, so it must
  meet water demand another way — same tradeoff a no-atmosphere colony already has for Farm. Out of Stage-3
  scope.)*

**Real-data verification** (`evaluatePlacement`, real `well`/`farm` + real terrain):

| case | result |
|---|---|
| `well` @ wet (`hasWater:true`) | `ok=true` |
| `well` @ dry (`hasWater:false`) | `ok=false`, `reason='ui.requiresWater'`, `kind='climate'` |
| `well` @ no-`surface` | `ok=false`, `reason='ui.requiresWater'` |
| `well` @ null planet | `ok=true` (fail-open) |
| `farm` @ dry | `ok=true` (water gate doesn't touch Farm) |
| `farm` @ none-atmosphere | `ok=false`, `reason='ui.requiresAtmosphere'` (climate gate intact) |

---

## A2 — `_upgrade` cost scaled by environment (implemented)

Closes the Stage 2 Part B4 known scope gap ("`_upgrade` cost is intentionally not scaled"). Now upgrading a
building can't dodge the environmental premium construction pays.

- **`src/systems/BuildingSystem.js`** `_upgrade` (`:690-698`) — folds `envMultiplier` into the existing
  resource-cost loop:
  ```js
  const upgradeEnvMult = envMultiplier(building.category, this._resolveOwnPlanet());
  ...
  upgradeCost[k] = Math.ceil(v * nextLevel * 1.2 * upgradeEnvMult);
  ```
  - **Full strength** (like construction; upkeep is the half-strength one) — an upgrade is a build-type action.
  - **Resource portion only** — `commodityCost` (prefab components) unchanged, exactly mirroring
    `computeBuildResourceCost`'s scope.
  - **`_resolveOwnPlanet()`** — this colony's own planet, never `homePlanet` (same resolver construction uses);
    fail-open → `envMultiplier(null) = 1` → cost identical to pre-Stage-3.
  - The deferred/pending-queue path stores `{ ...upgradeCost }`, so the scaled cost carries through
    affordability, spend, and pending fulfilment consistently (same as construction). No UI upgrade-cost
    preview exists (the "⬆ Ulepsz" button shows no number — `ColonyOverlay.js:2935`), so no preview parity
    to maintain.
  - `envMultiplier` was already imported in `BuildingSystem.js:33` (Stage 2).

**Real-data verification** (integration: forced can't-afford path → read the actual env-scaled cost back out of
`_pendingQueue`, proving the wiring, not just the formula):

| `mine` Lv1→2 (`cost.Fe=20`) | env mult | upgrade `Fe` |
|---|---|---|
| normal-gravity (0.99g) | ×1.00 | **48** = `ceil(20·2·1.2·1.00)` |
| **high-gravity (2.97g)** | ×1.40 | **68** = `ceil(20·2·1.2·1.40)` |
| null planet (fail-open) | ×1.00 | 48 |

Also confirmed `farm` (food, gravity-sens 0.2) upgrade still scales on gravity (26 vs 24 at Lv1→2) — food's
atmo/temp inertness carries over from construction.

---

## B1 — `ENVIRONMENT_SENSITIVITY` content audit (report-only, weights unchanged)

Pulled the real per-category building list and checked each against the assumed theme. **Bottom line: every
category's theme broadly holds — none is grossly mis-assigned.** `mining`=extraction/heavy-industry,
`governance`=admin/political halls, `civil`=cultural/heritage, `food`/`market`/`military`/`research`/`energy`/
`synthetic`/`population` all match their weights' intent. One real structural mismatch and one soft one:

**⚠ Main flag — surface surcharges applied to ORBITAL/space structures** (already hinted in Stage 2 §B2;
here's the concrete list). These sit in surface-sensitive categories yet are sealed/in-orbit, so surface
gravity/atmosphere/temperature conceptually shouldn't drive their cost:
- `population` (atm **1.0**, temp **1.0**): `orbital_habitat` — a sealed orbital station charged full surface
  atmosphere+temperature premium.
- `mining` (gravity **1.0**): `orbital_mine`, `orbital_fabricator` — orbital, charged full surface-gravity
  premium; plus `launch_pad`/`autonomous_spaceport` (spaceports, arguably `space`).
- `space` (gravity 0.8): `dyson_command` — a star-orbit megastructure taking a surface-gravity surcharge.

This is the clearest content-vs-weight divergence. It's minor in live impact (few such buildings, and the
harshest planets aren't where most orbital builds happen) but conceptually loose. **Suggested direction for
Filip's call (not applied): a per-building `envSensitivity` override** (e.g. orbital/space structures opt out
of gravity/atmosphere), rather than re-weighting whole categories — the same per-building-override idea Stage 2
§B2 floated. Not changed here per the report-only constraint.

**Soft flag — `infrastructure` (gravity 0.3)** holds only two buildings, both huge FTL megastructures
(`warp_beacon`, `jump_gate` at `Fe:2000`). 0.3 under-weights their sheer scale relative to `space` (0.8) /
`mining` (1.0) — *unless* they're conceptually orbital/space-anchored, in which case low surface-gravity
sensitivity is fine. Genuinely ambiguous; flagged for Filip's judgment, not changed.

> **RESOLVED (live-gate round 2 — see "Follow-up B" below).** Both `warp_beacon` and `jump_gate` carry the
> game's existing `isOrbital: true` flag — they *are* orbital-anchored. Follow-up B's orbital exemption now
> zeroes their environmental sensitivity entirely, so the under-weight question is moot: they take **no**
> gravity surcharge at all. Soft-flag closed.

**Inert-by-path (no action):** `colony_base` (population, `cost:{}`) is pre-placed and never routed through the
`_build`/`_upgrade` cost path, so its `population` weights never apply. The `autonomous_*` buildings *do* build
through the cost path (prefab/outpost), so their category weights do apply.

**No category found grossly wrong; no weight changed.**

---

## Follow-up A — scale `commodityCost` by the same environmental premium (live-gate round 2, implemented)

Filip's live-gate saw the resource-cost line move on a high-gravity upgrade but the **commodity-cost line stayed
flat**. Investigation:

1. **What `commodityCost` structurally is:** a **distinct dict on the building def**, keyed by *commodity* IDs
   (prefab components — e.g. `mine.commodityCost = { structural_alloys:3, extraction_systems:2, power_cells:1 }`),
   separate from the resource dict `cost` (Fe/Ti/Si/…). At spend time both are merged into one `actualCost` and
   drawn from the same inventory store. `computeBuildResourceCost` only ever iterated `cost`, so commodities were
   never touched by the env multiplier.
2. **Where it was left unscaled — BOTH paths** (not new to `_upgrade`; a pre-existing Stage-2 gap):
   - `_build` (`BuildingSystem.js:549-552`) — commodities copied in raw.
   - `_upgrade` (`:701-705`) — commodities scaled only by `(nextLevel-1)`, no env.
3. **Fix — same `envMultiplier`, same %** as resource cost (full strength; **no** polar `latMod`, keeping the
   "prefab components skip latitude" rule — only the *environmental* premium is added so a harsh planet can't be
   dodged by paying in components):
   - New shared **`computeBuildCommodityCost(building, planet)`** (`EnvironmentCost.js:59-71`) — env-scaled
     commodities, one source of truth for spend **and** preview.
   - `_build` (`BuildingSystem.js:549-551`) → `Object.assign(actualCost, computeBuildCommodityCost(building, this._resolveOwnPlanet()))`.
   - `_upgrade` (`:702-705`) → commodity loop now `Math.ceil(v * (nextLevel-1) * upgradeEnvMult)`.
4. **UI preview updated** (preview == actual, Stage-2 principle) — `ColonyOverlay` build-tooltip commodity line
   (`:3912-3921`), `_canAfford` (`:3236`), `_getMissing` (`:3255`) all read `computeBuildCommodityCost` now.
   (No upgrade-cost preview exists, so construction is the only preview surface.)

**Real before/after** (`mine`, `commodityCost {structural_alloys:3, extraction_systems:2, power_cells:1}`):

| | structural_alloys | extraction_systems | power_cells |
|---|---|---|---|
| construction, normal (0.99g) | 3 | 2 | 1 |
| construction, **high (2.97g, ×1.40)** | **5** | **3** | **2** |
| upgrade Lv2→3, normal | 6 | — | — |
| upgrade Lv2→3, **high** | **9** | — | — |

(Verified by integration — `_upgrade` commodity read back out of `_pendingQueue`.)

## Follow-up B — zero environmental sensitivity for orbital-anchored buildings (live-gate round 2, implemented)

Confirmed decision from B1: orbital-anchored buildings get **zero** sensitivity on **all three** axes (gravity
included). Implemented as a per-building override, category weights untouched.

- **Full orbital sweep — 6 buildings** (not just the four flagged). The game's existing orbital marker is
  `isOrbital` (comment: "nie zajmuje hexa"), but it's applied to only three; the other three are orbital by
  design yet occupy a hex, so `isOrbital` alone is insufficient. Determined the true set from `isOrbital` +
  each building's description:
  - `orbital_habitat` (isOrbital; sealed orbital station)
  - `warp_beacon` (isOrbital; orbital FTL beacon) — **resolves B1 soft-flag**
  - `jump_gate` (isOrbital; orbital FTL gate) — **resolves B1 soft-flag**
  - `orbital_mine` ("wydobycie z planetoidów")
  - `orbital_fabricator` ("montaż … w zerowej grawitacji")
  - `dyson_command` ("centrum dowodzenia … Sfery", star orbit)
  - **Kept surface (verified, sensitivity unchanged):** `stellar_collector_relay` (description: beam to a
    *"stacja NAZIEMNA"* = ground station), `vacuum_generator` (surface plant, not orbit-anchored),
    `shipyard`, `terraformer`, `launch_pad`/`autonomous_spaceport` (surface spaceports), `antimatter_factory`.
- **Override mechanism (not category re-weighting):** new per-building flag **`orbitalAnchored: true`** on those
  6 defs (`BuildingsData.js`). Kept **separate from `isOrbital`** on purpose — `isOrbital` carries placement
  semantics ("no hex, limit 3"); adding it to `orbital_mine`/`orbital_fabricator`/`dyson_command` would have
  changed their placement. `envMultiplier` (`EnvironmentCost.js:35`) now short-circuits
  `if (building?.orbitalAnchored) return 1;` — one central gate, so **cost *and* upkeep** (both route through
  `envMultiplier`) are exempt. Every call site (`computeBuildResourceCost`, `computeBuildCommodityCost`,
  `_upgrade`, `_calcBaseRates` upkeep) now passes `{ building }`.
- **Surface siblings in the same category are unchanged** — regular `mine` (mining) still takes the full
  gravity surcharge; only the flagged orbital buildings are exempt.

**Real verification** — on a deliberately harsh body (`3.0g`, `atmosphere:'none'`, `-120°C`):
- `orbital_mine` construction cost `{Fe:50, Ti:20, Cu:15}` — **identical** to the raw/null-planet cost (no
  surcharge); same for `orbital_fabricator`, `dyson_command`, `orbital_habitat` (resources + commodities).
- `orbital_mine` upkeep (`_calcBaseRates`) — energy `-10`/maintenance `-2` **unscaled** (envUpkeep = 1).
- Control: surface `mine` on the same harsh body still `envMultiplier > 1` and `Fe > raw`. Sensitivity intact.

---

## Testing summary

- **`src/testing/smoke/stage3_well_gate_smoke.mjs` — 49/49 PASS** (A1 gate incl. fail-open; A2 upgrade
  resource-scaling via `_pendingQueue`; **Follow-up A** commodity scaling for build + upgrade; **Follow-up B**
  all 6 orbital flags + 8 surface siblings unflagged + harsh-body cost/upkeep exemption + surface-sibling
  control).
- **`farm_climate_gate_smoke.mjs` — 34/34** (was 33/1-fail after the Stage-3 change: its T4 planet
  `{atmosphere:'none', temperatureC:-50}` had no `surface`, so `well` now correctly hit the water gate. T4's
  *intent* is "well isn't blocked by the **climate** gate" — gave that test planet `surface:{hasWater:true}` to
  isolate the climate axis; intent preserved, water gate covered separately by the new smoke).
- **Regression 0 FAIL:** `stage2_water_envcost` 40/40, `energy_brownout` 27, `s34c_z4/z9` 14/16,
  `s34d_hull_gating` 26, `s34_faza1` 50, `s3_0a_*` chain. `tools/check-i18n.mjs` PASS.
  `node --check` clean on all touched files (`EnvironmentCost`, `BuildingSystem`, `BuildingsData`, `ColonyOverlay`).
- **Not run:** the browser live-gate — Filip's step before commit.

## Files touched
NEW: `src/testing/smoke/stage3_well_gate_smoke.mjs`, `REFORM_STAGE3_REPORT.md`.
Modified: `src/data/BuildingsData.js` (well `requiresWater` + `orbitalAnchored` on 6 orbital buildings),
`src/map/HexTile.js` (water gate), `src/i18n/pl.js` + `en.js` (`ui.requiresWater`),
`src/data/EnvironmentCost.js` (orbital exemption in `envMultiplier`; `{building}` in `computeBuildResourceCost`;
new `computeBuildCommodityCost`), `src/systems/BuildingSystem.js` (`_upgrade` env scaling; commodity env scaling
in `_build`+`_upgrade`; `{building}` in upkeep), `src/ui/ColonyOverlay.js` (commodity preview via
`computeBuildCommodityCost`), `src/testing/smoke/farm_climate_gate_smoke.mjs` (T4 planet given water to isolate
climate axis).

## Live-gate checklist (for Filip)
- [ ] On a **waterless** colony, `well` shows in the build picker **locked with "Brak wody" / "No water"**
      (not missing); on a **wet** colony it's buildable.
- [ ] `farm` is unaffected by water (still gated only by atmosphere/temperature).
- [ ] **Upgrade** a building on a **high-gravity** colony vs a normal one — both the **resource** line *and* the
      **commodity** line are visibly higher on the harsh world, and match what's actually spent.
- [ ] Building an **orbital** structure (`orbital_mine`/`orbital_fabricator`/`dyson_command`/`orbital_habitat`/
      `warp_beacon`/`jump_gate`) costs the **same** regardless of the body's gravity/atmosphere/temperature;
      a **surface** building in the same category still costs more on a harsh world.
