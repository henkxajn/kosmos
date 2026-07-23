# KOSMOS Reform — Stage 2 Report

## ✅ Ready-for-live-gate checklist (run first, then commit or report)

Stage 2 is implemented + tested but **NOT committed** — run these in the browser first. If everything
passes, commit is approved. If anything looks wrong, report exactly what — **with the specific planet /
building involved** — before anything is committed.

- [ ] **Water varies across ordinary (non-home) rocky worlds** — open a few; confirm some have surface
      water / ocean terrain and some don't (the new rule makes ~46% wet), i.e. not uniform. (Sanity: gas &
      hot rocky worlds are always dry; ice worlds always wet.)
- [ ] **Existing home still has water after the v93 migration** — load your current save (it migrates
      v92→v93 on load); confirm your home planet still shows water. (The migration *preserves* prior
      forced-wet cradles, so it must not have turned into a desert.) Bonus: start a **new game** and confirm
      that home also has water (guaranteed via composition, ~6% H2O).
- [ ] **Build-cost preview reacts to environment** — same building on a **harsh** planet (high gravity, or
      no atmosphere, or extreme temperature) vs a **mild** one; confirm the previewed build cost **visibly
      differs**, AND the preview number **matches what's actually spent** when you build it.
- [ ] **Farm cost = gravity only** — confirm Farm's build cost responds to **gravity** but **NOT** to
      atmosphere/temperature (those are already handled by Stage 1's climate gate + yield penalty, not this
      cost mechanic).

If all pass → commit approved (Stage 2 diff = the "Files touched" list at the bottom; ask CC to commit,
and say whether to include this report like Stage 1). If anything is off → report the specific planet +
building before committing.

---

## Live-gate investigation — "gravity has no visible effect on build cost" (2026-07-23)

**Filip's observation:** build cost looked identical across three colonies — `0.31g`, `0.99g` (home),
`2.97g`. **Handed back UNfixed and UNcommitted for Filip to confirm on his real save (see snippet below).**

**What was verified offline (real building data, not synthetic stubs):**

1. **The isolated computation is correct for every real building at `2.97g`.** Ran `computeBuildResourceCost`
   over all `BUILDINGS` with gravity isolated (atmosphere/temp held constant), three values `0.31 / 0.99 /
   2.97 g` → bands `low / normal / high`. **Every building with a nonzero `cost` shows a visible surcharge at
   `2.97g`.** Representative real numbers (normal → HIGH):
   - `mine` (mining, gravSens 1.0): `{Fe:20, C:10}` → **`{Fe:28, C:14}`** (+40%)
   - `smelter` (mining): `{Fe:40,Si:15,Cu:5}` → `{Fe:56,Si:21,Cu:7}`
   - `shipyard` (space, 0.8): `{Fe:80,Ti:30,Cu:20}` → `{Fe:106,Ti:40,Cu:27}`
   - `defense_tower` (military, 0.8): `{Fe:35,Ti:15,Cu:10}` → `{Fe:47,Ti:20,Cu:14}`
   - `farm` (food, 0.2): `{Fe:10,C:5}` → `{Fe:11,C:6}`   · `habitat` (population, 0.2): `{Fe:25,Si:10}` → `{Fe:27,Si:11}`

2. **`0.31g` (low) and `0.99g` (normal) are identical BY DESIGN.** `GRAVITY_SURCHARGE = {low:0, normal:0,
   high:0.40}` — neither low nor normal carries a surcharge, so **two of Filip's three colonies are expected to
   match exactly.** Only the `2.97g` (high) colony should differ. This alone accounts for most of the "no
   difference" impression.

3. **The live cost-preview path is correctly wired to the colony's own planet — traced end to end:**
   - Build-picker affordability greying: `ColonyOverlay._canAfford` (`ColonyOverlay.js:3233`) →
     `computeBuildResourceCost(building, colony.planet)`.
   - Hover cost tooltip (the ONLY place a cost *number* is shown in the colony map): `ColonyOverlay.js:3903` →
     same call.
   - Actual spend: `BuildingSystem._build` (`BuildingSystem.js:547`) →
     `computeBuildResourceCost(building, this._resolveOwnPlanet(), latMod.buildCost)`; `_resolveOwnPlanet`
     (`BuildingSystem.js:1471-1473`) returns `colonyManager.getColony(this._planetId).planet` — the tile's own
     colony, never `homePlanet`.
   - `colony.planet` is the live entity (`ColonyManager.js:405` `planet: entity`) and its `surfaceGravity`
     round-trips through save (`SaveSystem.js:286`). The colony info panel reads the **same** `colony.planet`
     (`ColonyOverlay.js:1139/1184`) — so the fact that Filip *sees* `2.97g` displayed proves the object passed
     into the cost call is genuinely at `2.97g`, and `gravityBand(2.97) → 'high' → 0.40`.

4. **Ruled out the specific hypotheses from the task:**
   - `gravityBand` misclassifying / missing key — no: returns `low|normal|high`, all present in
     `GRAVITY_SURCHARGE`; verified `2.97 → 'high'`.
   - A parallel/older cost path bypassing `computeBuildResourceCost` — the only raw-`b.cost` building tooltip
     (`UIManager._buildBuildingTooltipLines`, `UIManager.js:2423`) is **dead code**
     (`_detectCivPanelTooltip` no longer returns `type:'building'`). `BottomContext` shows no cost. No live
     raw-cost display exists.
   - Stale/cached preview across colony switch — `open()` resets `_hoveredBuildId`
     (`ColonyOverlay.js:385`); `_switchColony` clears `_selectedHex` (`:1125`) which closes the build float
     panel, and the next mousemove nulls `_hoveredBuildId` (`:3860`). Not reachable in practice.
   - Wrong planet reference (the Stage-1 class of bug) — uses `_resolveOwnPlanet`, not `homePlanet`; verified.

**Root cause (best available):** **No defect found in the cost computation or its wiring.** The offline
evidence says the mechanic is correct and *does* differentiate the `high` band for every building. The most
probable explanation for the observation is (a) 2 of the 3 colonies are design-identical (low+normal), and (b)
in the colony map a cost **number** appears only in the per-building *hover tooltip* — the picker rows show no
inline price — so unless a high-sensitivity building (e.g. `mine`) was hovered *specifically on the `2.97g`
colony*, there is no number in view to differ.

**Honest limitation:** the browser extension was **not connected**, so I could NOT trace Filip's actual save
directly (the definitive check, per the fuel-investigation lesson). This is therefore *not* declared "fixed" —
it is "could not reproduce offline; needs live-save confirmation." **Definitive check for Filip** — paste into
the game's DevTools console (F12):

```js
// KOSMOS — trace grawitacja → koszt budowy na ŻYWYM save
(async () => {
  const { computeBuildResourceCost } = await import('/src/data/EnvironmentCost.js');
  const { gravityBand } = await import('/src/data/EnvironmentBands.js');
  const { BUILDINGS } = await import('/src/data/BuildingsData.js');
  const cm = window.KOSMOS.colonyManager;
  const cols = cm.getAllColonies ? cm.getAllColonies() : [...cm._colonies.values()];
  for (const c of cols.filter(x => !x.ownerEmpireId)) {           // tylko kolonie GRACZA
    const p = c.planet;
    console.log(`\n${c.name}  g=${p?.surfaceGravity?.toFixed(2)}  band=${gravityBand(p?.surfaceGravity)}`
      + `  atm=${p?.atmosphere}  T=${p?.temperatureC?.toFixed(0)}°C`);
    for (const bid of ['mine','farm','habitat'])
      console.log(`   ${bid}: ${JSON.stringify(computeBuildResourceCost(BUILDINGS[bid], p))}`);
  }
  // Kandydaci na test Farmy (grawitacja < 0.4 g = pasmo 'low'):
  const low = window.KOSMOS.entityManager.getByType('planet')
    .concat(window.KOSMOS.entityManager.getByType('moon'))
    .concat(window.KOSMOS.entityManager.getByType('planetoid'))
    .filter(b => (b.surfaceGravity ?? 1) < 0.4)
    .map(b => ({ name: b.name, g: +(b.surfaceGravity ?? 1).toFixed(2), atm: b.atmosphere, T: Math.round(b.temperatureC ?? 0) }));
  console.log('\nCiała niskograwitacyjne (test Farmy):', low);
})();
```

**Expected output if the mechanic is working** (mine at Filip's three colonies): `0.31g → {Fe:20,C:10}`,
`0.99g → {Fe:20,C:10}`, `2.97g → {Fe:28,C:14}`. If instead `2.97g` prints `{Fe:20,C:10}`, that **is** a real
runtime bug (the object's `surfaceGravity` or category isn't what's displayed) — capture that output and it
becomes the concrete lead to trace next.

**Farm test-target:** could not search Filip's save (browser disconnected), so no named body is asserted here —
the snippet's last line enumerates every low-gravity body in his live game with `atmosphere`/`temperatureC`.
Note his **`0.31g` colony already is a low-gravity body**; to prove Farm reacts to gravity but not atmo/temp,
compare Farm cost on it (`{Fe:10,C:5}`, low band) vs the `2.97g` colony (`{Fe:11,C:6}`, high band) — differs on
gravity — and against any *other* colony in the **same** gravity band but different atmosphere/temperature —
Farm cost stays identical (food sensitivity atmo/temp = 0).

---

## Live-gate fix — `atmosphere === undefined` on Planetoid bodies (2026-07-23, save stays v94, NOT committed)

**Bug (from Filip's real save):** planetoid colonies (`Nt`, `Plt-1`, `Cu i Hv`, `Plt-4`) reported
`atmosphere === undefined`, not `'none'`. Effect: `envMultiplier` does `ATMOSPHERE_SURCHARGE[undefined] ?? 0`
→ **0 atmosphere surcharge** on genuinely airless bodies. A `mining` building cost `{Fe:20,C:10}` (base, no
surcharge) on these, versus `{Fe:25,C:13}` on airless *Moons* (`Fobos`, `Nowy Ksiezyc`) that carry explicit
`atmosphere:'none'`. Both are airless and should match.

**Root cause (which class, why):** **only `Planet` and `Moon` assign `atmosphere`** (`Planet.js:43`,
`Moon.js:41`); the base `CelestialBody` does not. **`Planetoid` never set it** (`Planetoid.js` constructor) —
a plain omission, not a deliberate skip: the class already carries the sibling reform fields
(`surfaceGravity`, `temperatureC`, `composition`, `surface.hasWater`), so leaving `atmosphere` unset was an
oversight, not a lightweight-body optimization. Planetoid is the **only airless small-body class that is
colonizable** (colonize gate `MissionSystem.js:168` / `ExpeditionSystem.js:147` = `planetoid | moon | rocky/ice
planet`), so it's the only one that feeds the Stage-2 cost path via `colony.planet`. `Asteroid`/`Comet` also
lack `atmosphere` but are **not** colonizable, so they never reach the cost path.

**Other reform fields — confirmed present on Planetoid (not assumed):** `surfaceGravity` (`Planetoid.js:33`,
`?? null`), `temperatureC` (`:37`), `composition` (`:55`, default provided) — all serialized
(`SaveSystem._serializePlanetoid` `:352-356`) and restored (`GameScene.js:3923-3927`). Only `atmosphere` was
missing.

**The fix (source-level, file:line):**
- `src/entities/Planetoid.js` (after `planetoidType`, ~`:31`): `this.atmosphere = config.atmosphere || 'none';`
  — the manifesting fix.
- `src/entities/Asteroid.js` (before `composition`, ~`:27`): same line — sibling airless class, physically
  correct, closes the same latent class even though asteroids aren't colonized (defensive; documented as such).

**Migration — NOT needed, and deliberately NOT added (contradicts the task's §5 assumption, with evidence):**
the task expected already-saved bodies to need a `v92→v93` backfill. They don't, for the same reason Stage 2's
Part A puts `hasWater` in the constructor rather than the generator (report §A2/§A3):
1. `SaveSystem._serializePlanetoid` (`:344-364`) **never writes `atmosphere`** — no `atmosphere:undefined` is
   persisted.
2. Planetoid restore rebuilds via **`new Planetoid(config)`** (`GameScene.js:3911`) with no `atmosphere` in
   config → the constructor's `|| 'none'` supplies it on **every load**.
3. Colony restore links `colony.planet` to that reconstructed EntityManager entity
   (`ColonyManager.js:2165` `_findEntity` → `EntityManager.get`, `:2228` `planet: entity`).

So a saved planetoid picks up `atmosphere:'none'` on the next load with zero migration. An inert migration line
would mislead (report §A3 makes exactly this argument for moons/planetoids). **Save version unchanged (v94).**

**Verified with real data (real `Planetoid`/`Asteroid`/`Moon` classes + `computeBuildResourceCost`), before → after:**

| body (low-g, airless) | `atmosphere` | `mine` cost |
|---|---|---|
| Planetoid — **before fix** | `undefined` | `{Fe:20, C:10}` (no surcharge — the bug) |
| Planetoid — **after fix** (fresh) | `'none'` | **`{Fe:25, C:13}`** |
| Planetoid — **after fix** (serialize→restore roundtrip) | `'none'` | **`{Fe:25, C:13}`** |
| Moon reference (`Fobos`, explicit `'none'`) | `'none'` | `{Fe:25, C:13}` |
| Asteroid — after fix | `'none'` | (n/a — not colonizable) |

`{Fe:25,C:13}` = base `{Fe:20,C:10}` × `1 + 0.5(mining atmo sens)×0.50(none surcharge) = ×1.25`, `Math.ceil`.
Planetoid now matches the airless Moon at the same gravity band, exactly as the task's acceptance criterion
required.

**Stage-1 latent gate also closed:** the Farm climate gate `HexTile.js:174` hard-blocks on
`planet.atmosphere === 'none'`; with `undefined` it silently didn't fire (a warm airless planetoid would slip
the atmosphere half of the gate). The same source fix makes it fire correctly. Noted in
`REFORM_STAGE1_REPORT.md`.

**Tests:** real-data diagnostic above (throwaway, discarded). `stage2_water_envcost_smoke.mjs` **40/40** — its
two version-pinned assertions (`CURRENT_VERSION === 93`, `migr.version === 93`) had drifted to FAIL after the
unrelated **v94** bump (commit `865fc73`, body-map/analyzed fix); realigned to the **version-agnostic** pattern
Stage 2 already blessed for `tmp_systemid` (`>= 93` / `=== CURRENT_VERSION`) — test-only, no production/logic
change, and the v92→v93 hasWater backfill still carries correctly through the full v92→v94 chain. Regression
spot-check (planetoid/save/serialize smokes): `s34c_depot_proxy` 28, `s34c_drain_orphan` 33, `s34c_z8` 24,
`s34_faza1` 50/`faza2` 61/`faza3` 47, `energy_brownout` 27 — 0 FAIL. `node --check` clean on both entity files.

**Files touched (this fix):** `src/entities/Planetoid.js`, `src/entities/Asteroid.js`,
`src/testing/smoke/stage2_water_envcost_smoke.mjs` (version-pin realignment only). **Not committed** — for
Filip's live-gate.

---

**Scope.** Two independent parts. **Part A** — composition-driven `surface.hasWater` (shared threshold, uniform
generation rule, reactive-rule unification, `v92→v93` backfill). **Part B** — environmental sensitivity of
building construction & upkeep costs (shared band constants + per-category sensitivity + surcharge tables,
wired into cost/upkeep/preview). Builds on `PLANET_SYSTEM_AUDIT.md` + `REFORM_STAGE1_REPORT.md`.

**Status: implemented + tested. NOT committed** — handed back for Filip's browser live-gate. Applies
universally to player and AI (Stage-1 precedent, no exemptions).

**Two decisions taken with the user before coding:**
1. **Water threshold = 3%** (not the prompt's suggested 1.5% — see A1).
2. **Home planets stay guaranteed-wet**, achieved by boosting home *composition* H2O (not by forcing the
   flag), for player, AI, and power-test homes.

---

## Part A — Composition-driven water

### A1 — Shared threshold + the value (data-validated)

`export const WATER_H2O_THRESHOLD = 3;` in **`src/data/ElementsData.js`** (leaf module — all consumers
already import from it, zero new import cycles). Used by the entity constructors, the reactive
collision/bombard checks, and (as a documented historical constant) the migration.

**The value was validated against a generated sample, as the prompt required.** The prompt suggested 1.5%,
but at 1.5% **100% of rocky bodies end up wet — no split** (it fails the prompt's own acceptance test,
because in-HZ rocky sits at ~2.5% > 1.5%). The observed distribution (12–40 generated systems, H2O% by mass):

| threshold | rocky wet% | ice | hot_rocky | gas |
|---|---|---|---|---|
| 1.5 | **100%** (no split) | 100% | 0% | 0% |
| **3 (chosen)** | **~46%** | 100% | 0% | 0% |
| 5 | ~31% | 100% | 0% | 0% |

**3% is the right value** because it (a) produces a genuine ~46%/54% rocky split, (b) **equals the existing
reactive rule** (`>= 3`), so unifying to one constant leaves collision/bombard behavior byte-identical, and
(c) unlike 5%, it doesn't make *all* in-HZ rocky worlds dry. Distribution per type: rocky min 2.0/med 3.0/max
34; ice 42–55 (always wet); hot_rocky & gas 0 (always dry); icy moons ~49–55 (always wet, template 55%).

### A2 — Uniform generation rule via entity constructors

**Implemented in the entity constructors, not `_makePlanet`** — a reasoned deviation that better achieves the
prompt's uniform-rule goal. The migration audit found **moons and planetoids do not serialize/restore
`surface`** (only `composition` round-trips), so a value set in the generator would be lost on reload for
those bodies. Computing `hasWater` in the constructor (which runs on both generation *and* restore, from the
always-serialized composition) makes water durably composition-driven for **every** body type with no
serialization-schema change:

- `src/entities/Planet.js:64` — `this.surface.hasWater = (this.composition.H2O ?? 0) >= WATER_H2O_THRESHOLD;` (after composition is set).
- `src/entities/Moon.js:49` — replaces the old `moonType === 'icy'` with the composition rule (behaviorally identical: icy ~55%→wet, rocky ~0.5%→dry).
- `src/entities/Planetoid.js:63` — replaces the old hardcoded `false`. **Behavior change (intended, uniform):** carbonaceous (~8%) & silicate (~5%) planetoids → wet; metallic (0%) → dry.

The old special-casing was removed: `SystemGenerator.js` `bestPlanet.surface.hasWater = true` at the two home
sites (`:704`, `:773`) is gone.

**Reactive rule unified** (was hardcoded `>= 3`, now `>= WATER_H2O_THRESHOLD`): `PhysicsSystem.js:183/235/255/343/367`
(collision/micro-impact) and `PlayerActionSystem.js:138` (bombard). One number, no behavior drift.

### A2-bis — Home water guarantee (user decision)

At threshold 3%, removing the home forcing would leave ~60% of home planets waterless (in-HZ rocky ~2.5% <
3%). Per the user's decision, homes stay wet **via composition, not a flag special-case**: the water
guarantee lives inside **`SystemGenerator.makeHomeworldBreathable` (`:668-672`)** — the shared helper called
by all three guaranteed-life homes (player `:706`, power-test `:775`, **AI empire `EmpireColonyBootstrap.js:100`**):

```js
if (planet.composition) {
  planet.composition.H2O = Math.max(planet.composition.H2O ?? 0, WATER_H2O_THRESHOLD + 3); // ~6% = 2× próg, margines
}
planet.surface.hasWater = (planet.composition?.H2O ?? 0) >= WATER_H2O_THRESHOLD;             // ta sama reguła
```

This mirrors the existing home-Ti guarantee, keeps the split for every *other* body, and is null-safe (no
composition → no bump, no throw). **Verified end-to-end:** in a fresh generation sample, every home now shows
`H2O = 6.00, hasWater = true` (cold-rocky homes keep their higher natural H2O); the general rocky split is
unchanged.

### A3 — Save migration `v92 → v93`

`SaveMigration.js`: `CURRENT_VERSION` 92→93, registered `92: _migrateV92toV93` in `MIGRATIONS`, function
recomputes **planet** hasWater from stored composition. Two deliberate specifics:

- **Hardcoded `3`, not the live constant** — a migration is a historical snapshot and must not drift if the
  constant later changes.
- **`wet || existingHasWater` (preserve, don't downgrade)** — old saves stored forced-wet cradles with
  composition ~2.5%; a strict recompute would turn migrated home worlds into deserts. Preservation keeps
  them wet (reactive-wet planets have composition ≥3 and recompute true anyway, so preservation only affects
  the forced cradles). Guards missing `p.surface`/`p.composition`.
- **Planets only** — moons/planetoids don't serialize `surface`; their constructors recompute hasWater from
  the serialized composition on every load, so no migration line is needed (an inert one would mislead).

### How Part A was tested
New smoke (below) T1–T6: threshold value; constructor rules for Planet/Moon/Planetoid; the 3% split; icy-moon
safety (template 55% → wet); migration backfill + cradle preservation + `no-surface` creation; home guarantee
(composition boost + hasWater + null-safety). Live generation sample confirms homes 100% wet and the split.
Pre-existing `test-breathable-home.mjs` still 23/23 (atmosphere/temp untouched).

---

## Part B — Environmental build/upkeep cost sensitivity

### B1 — Shared band constants

New leaf **`src/data/EnvironmentBands.js`**: `gravityBand(g)` (null→normal, <0.4 low, >1.5 high),
`temperatureBand(°C)` (null→moderate, >77 hot, <-53 cold), plus `GRAVITY_THRESHOLDS`/`TEMP_THRESHOLDS`.
Boundaries are byte-identical to the removed `ProsperitySystem._getGravKey`/`_getTempKey`. Consumers now
import it: `ProsperitySystem.js` (deleted both methods, call sites `:196/:198` use the band functions) and
`EnvironmentCost.js`. `ConsumerGoodsData.js` keeps its band-keyed multiplier tables; its threshold *comments*
now point at `EnvironmentBands.js` instead of duplicating the literals. (The `77` in `SystemGenerator` is an
unrelated habitability-scoring bound — left alone.)

### B2 — Category sensitivity table (as implemented)

`ENVIRONMENT_SENSITIVITY` in **`src/data/EnvironmentCost.js`**, one entry per building category (weights 0–1
per axis) — the prompt's draft, adopted verbatim. All 12 keys exactly match the categories present in
`BuildingsData.js`. **Sanity-check against actual category contents (flags, no fixes):**

- **`food`** (gravity 0.2, atmosphere 0, temperature 0) — deliberately atmo/temp-inert because Farm already
  has its Stage-1 climate gate + yield penalty; confirmed `well`/`synthesized_food_plant` are the only other
  food buildings and don't warrant a stacked penalty. Correct.
- **`civil`** = **cultural/heritage** buildings (cultural_center, heritage_dome, historical/mission archives,
  memory_vault) — *not* "civilian utilities". Its uniform 0.3/0.3/0.3 is reasonable for inhabited cultural
  structures; flagged so the meaning is on record.
- **Surface/orbital mix:** a few categories contain orbital buildings alongside surface ones (`population`→
  orbital_habitat; `mining`→orbital_mine/orbital_fabricator; `space`→shipyard). Applying *surface*
  gravity/atmosphere surcharges to orbital structures is conceptually loose, but the table is per-category by
  design (the prompt requires one entry per category), the effect is minor, and it's a candidate for a future
  per-building override — not a Stage-2 blocker.
- **`colony_base`** (the capital, `population`) is pre-placed and never built through the `_build` cost path,
  so the multiplier never applies to it. Fine.

### B3 — Surcharge tables + formula (as implemented)

```js
GRAVITY_SURCHARGE     = { low: 0,    normal: 0,    high: 0.40 };
ATMOSPHERE_SURCHARGE  = { none: 0.50, thin: 0.20, breathable: 0, dense: 0.10 };
TEMPERATURE_SURCHARGE = { cold: 0.25, moderate: 0, hot: 0.15 };
envMultiplier(category, planet, { half = false }) → 1 + (half ? total/2 : total)
```
`total = sens.gravity·gravSur + sens.atmosphere·atmoSur + sens.temperature·tempSur`. **Fail-open**: null
planet → 1 (never surcharges on a missing reference). Unknown atmosphere (legacy `'thick'`) → `?? 0`.

### B4 — Wiring

- **Construction cost** — `BuildingSystem._build` now builds resource cost via the shared
  `computeBuildResourceCost(building, this._resolveOwnPlanet(), latMod.buildCost)` (env full-strength ×
  polar latMod, `Math.ceil`). Uses the **tile's own colony planet** (`_resolveOwnPlanet`, never `homePlanet`).
  Applied to **resources only** — `commodityCost` (prefab components) unchanged, mirroring the existing latMod
  scope. Affordability, spend, and the deferred-pending path all read the same `actualCost`, so they stay
  consistent. **AI pays nothing extra** because AI builds via the free `autoPlaceBuilding` path (no spend).
- **Upkeep** — `BuildingSystem._calcBaseRates` applies `envMultiplier(category, climatePlanet, {half:true})`
  to `energyCost` + `maintenance` only (not to production rates, not to the Stage-1 food climate mult).
  `climatePlanet` is the already-resolved own-colony planet.
- **Cost-preview UI** — `ColonyOverlay` tooltip, `_canAfford`, and `_getMissing` all use
  `computeBuildResourceCost(building, colony.planet)`, so the previewed/greyed cost matches the actual env
  spend. (Pre-existing polar `latMod` divergence in the preview is unchanged and out of scope.)

**Known scope gap (flagged, not a bug):** `_upgrade` uses a separate cost formula and is **not** env-scaled —
Stage 2's "construction cost" is initial `_build`. Trivially extendable later if desired.

### How Part B was tested
New smoke T7–T11: band lookups incl. boundaries/null-defaults; `envMultiplier` per category incl. **food
confirmed unaffected by atmosphere/temperature (only gravity)**; **upkeep = exactly half** the construction
multiplier for the same conditions; fail-open; `computeBuildResourceCost` env×latMod×ceil and null-planet raw
cost; and `_calcBaseRates` upkeep scaled by the **own colony's** planet (with `homePlanet` set differently to
prove it's not used) while production stays unscaled.

---

## Testing summary

- **New smoke `src/testing/smoke/stage2_water_envcost_smoke.mjs` — 40/40 PASS** (T1–T11 above).
- **Full regression sweep: 42 smoke files, 0 FAIL.** One pre-existing test
  (`tmp_systemid_integrity_smoke.mjs`) had a version-pinned assertion `CURRENT_VERSION === 92`; updated to the
  version-agnostic `out.version === CURRENT_VERSION` (the v91→v92 systemId self-heal it verifies is
  unaffected; the chain now correctly continues to v93). `test-breathable-home.mjs` 23/23.
- **`node --check`** clean on all 14 touched/new files.
- **Independent adversarial diff review: no confirmed correctness issues** (10 checks: ctor ordering, no
  circular imports, restore path, migration guards, home guarantee null-safety, reactive sites, band-boundary
  parity, envMultiplier, `_build`/`_calcBaseRates` wiring, preview parity).
- **Not run:** the browser live-gate — Filip's step before commit.

## Deviations & risks (on record)
- **Threshold 3% ≠ prompt's 1.5%** — data-driven (1.5% gives no split); documented above.
- **hasWater in constructors, not `_makePlanet`** — required for moon/planetoid durability (their `surface`
  isn't serialized); composition is the durable, serialized input.
- **Home water via composition boost, not the flag** — user decision; boosts H2O to ~6% **without
  re-normalizing** composition (sum ~103.5%), matching the existing Ti-guarantee pattern; no system divides by
  the composition sum in an observable way.
- **Migration preserves prior water** (`|| existingHasWater`) so migrated cradles don't become deserts;
  moons/planetoids recompute from composition on load (no migration line).
- **`_upgrade` cost not env-scaled** — Stage-2 scope is initial construction.
- **Pre-Etap-31 saves** (no serialized moon composition, ~v4–v30) would render icy moons dry after a v93
  reload — negligible (moon water is cosmetic terrain input; within the "recompute from composition" model).

## Files touched
NEW: `src/data/EnvironmentBands.js`, `src/data/EnvironmentCost.js`, `src/testing/smoke/stage2_water_envcost_smoke.mjs`.
Modified: `src/data/ElementsData.js`, `src/entities/{Planet,Moon,Planetoid}.js`, `src/generators/SystemGenerator.js`,
`src/systems/{PhysicsSystem,PlayerActionSystem,SaveMigration,ProsperitySystem,BuildingSystem}.js`,
`src/data/ConsumerGoodsData.js`, `src/ui/ColonyOverlay.js`, `src/testing/smoke/tmp_systemid_integrity_smoke.mjs` (version-pin fix).
