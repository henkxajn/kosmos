# BALANS 1.0 — Phase 2 · RESOURCES slice result

> **Status: RESOURCES vertical slice CLOSED.** Telemetry → report → launcher are built and green.
> **Zero game-balance constants were changed.** This is a measurement record: findings are *logged*,
> not fixed. Tuning is Phase 3.

All figures are **game-years** (`gameTime`); **1 gy = 12 civ-years**. Production/consumption rates in this
document and in the report are **per game-year** (the game's own per-civ-year rates × 12), so they are
directly comparable to the year-over-year change of a stockpile.

Reproduce:

```
# the panel this record is based on (REAL generator, no deposit injection):
KOSMOS_QUIET=1 node src/testing/headless/balans-resource-telemetry.mjs --class=REAL --seeds=8 --gy=45
#   → src/testing/reports/balans/resource-telemetry-REAL.json + resource-report-REAL.html

# same thing from the browser panel (now has a metric selector: POP | ZASOBY):
node src/testing/headless/balans-launcher.mjs        # → http://localhost:7333

# keepers (offline):
node src/testing/smoke/balans_resource_telemetry_smoke.mjs   # 71/71
node src/testing/smoke/balans_resource_report_smoke.mjs      # 48/48
node src/testing/smoke/balans_launcher_smoke.mjs             # 61/61
```

---

## 1. What the slice built

| layer | file | what it is |
|---|---|---|
| driver | `src/testing/headless/balans-driver.mjs` | **shared** boot→bot→tick→sample loop for *every* Phase-2 metric |
| telemetry | `src/testing/headless/ResourceTelemetry.js` | read-only per-game-year sampler of the *live* systems + the per-resource state classifier |
| runner | `src/testing/headless/balans-resource-telemetry.mjs` | seed panel through the shared driver; writes JSON + HTML |
| report | `src/testing/report/ResourceReport.js` | pure `renderResourceReport()` → self-contained HTML (inline SVG, no deps) |
| launcher | `src/testing/headless/balans-launcher.mjs` | now metric-aware: `METRICS` registry → panel dropdown → runs POP **or** RESOURCES |

**Shared core, as the brief preferred.** The boot/sample/write loop *was* cleanly shareable, so it was
extracted into `balans-driver.mjs` and **both** runners now use it. The migration of the (closed, validated)
POP runner was verified the only way that actually proves it: the POP panel was run before and after the
refactor and `pop-telemetry-REAL.json` is **byte-identical**. The POP slice's numbers (350/360 surplus-years,
309 BUFFER, 40 WASTED, 1 BOUND) reproduce exactly.

**What the sensor reads, per resource, per game-year:**

- **stock** and its **year-over-year delta** — ground truth.
- **production / consumption** — the game's own breakdown (`ResourceSystem.getResourceBreakdown`), i.e. the
  exact numbers the player sees in the resource tooltip (mines + buildings + POP + factory), × 12.
- **residual** = *(prod − cons) − Δstock* — what left the stockpile outside the breakdown.
- **blocked builds** — for every tech-unlocked building with a legal free tile, the real cost formula
  (`computeBuildResourceCost` / `computeBuildCommodityCost`) is checked key-by-key against the colony's own
  `canAfford`. This counts **commodities as well as ores**.
- **the game's own "waiting for resources" queue** (`BuildingSystem._pendingQueue`).

**State classifier**, branched by the resource's *kind* (taken from the game's taxonomy in `ResourcesData`):

- **BINDING** — the economy is *stalled* (zero buildings affordable anywhere) **and** this resource is one of
  the blockers; or the stockpile is empty and draining (starvation).
- **TIGHT** — blocks ≥1 building, or less than 1 gy of consumption in store.
- **GLUT** — ≥ 20 gy of consumption in store (or no sink at all) and blocking nothing.
- **INERT** — no production, no consumption, no movement: the resource does not participate.
- **OK** — everything else.

> A definitional trap was caught on the very first run and is worth recording, because it is exactly the
> class of thing the one-metric-at-a-time method exists to catch: `energy` and `research` have **no
> stockpile**. `getAmount('energy')` returns the *balance*, and `research` is an accumulator that
> `ResearchSystem` drains to zero on purpose. Treated as inventory, both scored "empty and draining →
> BINDING" in *every single year*. The classifier now branches on kind: energy is judged on its balance
> (deficit = brownout = real binding), research only as INERT/OK.

---

## 2. The measured panel — REAL generator, 8 seeds, 45 gy

360 seed-years, 0 crashes.

| seed | years stalled (from) | binding resources (years) | top blocker (years) | final Fe (cover) | POP-cons defect |
|---|---|---|---|---|---|
| 1 | 2 (gy1) | energy 3 · Fe 2 · Ti 2 | structural_alloys 42 | 32 487 (25 gy) | from gy29 |
| 2 | 0 | energy 1 | structural_alloys 39 | 35 341 (33 gy) | — |
| 3 | 2 (gy1) | energy 3 · Fe 2 · Ti 2 | structural_alloys 38 | 34 778 (31 gy) | from gy28 |
| **4** | 2 (gy1) | energy 3 · Fe 2 · Cu 2 | electronic_systems 30 | 25 249 (11 gy) | — |
| 5 | 8 (gy1) | Fe 9 · Ti 8 · energy 4 | electronic_systems 22 | 32 049 (26 gy) | from gy25 |
| 6 | 0 | — | structural_alloys 42 | 27 404 (54 gy) | from gy13 |
| **7** | **45 (gy1)** | **Fe 45 · Ti 45 · energy 45** | structural_alloys 45 | **23 (0.04 gy)** | — |
| **8** | 0 | energy 1 | electronic_systems 36 | 15 091 (9 gy) | — |

"Stalled" = a year in which **not one** building was affordable anywhere on the home colony.

Per resource across the whole panel (mean rates per game-year):

| resource | mean prod | mean cons | keeps up | binding | tight | glut | inert | seeds binding | first bind |
|---|---|---|---|---|---|---|---|---|---|
| C | 1 318 | 138 | yes | 7 | 15 | 230 | 0 | 1 | gy7 |
| **Fe** | 1 608 | 396 | yes | **60** | 30 | 140 | 0 | 5 | gy1 |
| Si | 1 576 | 334 | yes | 5 | 4 | 247 | 0 | 5 | gy1 |
| Cu | 820 | 68 | yes | 7 | 7 | 260 | 0 | 5 | gy1 |
| **Ti** | 152 | 47 | yes | **59** | **65** | 148 | 0 | 5 | gy1 |
| Li | 199 | 36 | yes | 5 | 8 | 274 | 0 | 5 | gy1 |
| Hv | 168 | 1.3 | yes | 0 | 0 | 306 | 0 | 0 | — |
| Xe | 0 | 1.2 | **NO** | 0 | 16 | 305 | 0 | 0 | — |
| Nt | 0 | 0 | — | 0 | 0 | 63 | **297** | 0 | — |
| H | 83 | 0 | yes | 0 | 0 | 43 | **315** | 0 | — |
| food | 1 950 | 252 | yes | 0 | 8 | 270 | 0 | 0 | — |
| water | 852 | 198 | yes | 0 | 4 | 141 | 0 | 0 | — |
| **energy** | 1 979 | 1 088 | yes | **60** | **215** | 0 | 0 | 7 | gy1 |
| research | 240 | 0 | — | 0 | 0 | 0 | 0 | 0 | — |

Panel verdict emitted by the runner: **outcome 2 — MIXED** (Fe leads with 30% of all binding seed-years;
no single resource dominates ≥60%).

---

## 3. Does production keep up with consumption?

**Yes — for 13 of 14 resources, by a wide margin, and that is itself the finding.** Mean production exceeds
mean consumption for every resource except Xe. Ten to eleven of the fourteen resources **end the run in
GLUT** on a typical seed (8 of 14 even on the two most expansive seeds). Fe finishes with **15 000 – 35 000
in store = 9 to 54 game-years of cover**; Cu, Li, Hv, Si, C are in permanent surplus with almost no sink.

The one exception, **Xe**, is a one-way path: production 0, consumption ~1.2/gy. The home's Xe supply is a
single guaranteed 50-unit deposit (`GameCore._setupColony`), mined out in the first few game-years and then
spent as ion fuel (seed_1: 0 → 27 by gy9 → 2 by gy27; seed_7, which never launches anything, sits at 50
forever). It never binds inside 45 gy, but nothing renews it.

---

## 4. Which resource binds, when, how often?

**Almost never an ore — a component.** In **348 of 360 seed-years (97%)** the resource blocking the most
buildings is a **manufactured commodity**, not a mined resource:

| top blocker | seed-years |
|---|---|
| `structural_alloys` | 242 |
| `electronic_systems` | 99 |
| Fe | 12 |
| `reactive_armor` | 4 |
| `conductor_bundles` | 3 |

Timing: binding is concentrated in two places.

1. **The opening (gy1).** 5 of 8 seeds hit a stall in game-year 1 — the starter stock runs out before the
   first mine/factory chain spins up. On 4 of them it lasts 2 gy and resolves itself; on seed_5 it lasts 8 gy.
2. **The permanent deadlock (seed_7).** 45 of 45 years — see §5.

Outside those, the mid/late game is **not** resource-bound: seeds 2, 6 and 8 never stall at all, and every
seed except 7 ends with 8–23 buildings affordable.

Energy is the interesting middle case: **215 of 360 seed-years are TIGHT** (balance below 5% of production)
and 60 are outright deficit, on 7 of 8 seeds. But that number describes the *reference bot* as much as the
game — its doctrine scales generators toward a fixed `energy_reserve = 5`, so a permanently thin margin is
what it is *aiming for*. Read it as "the grid is never comfortable", not as a balance verdict.

---

## 5. Cross-check (a) — seed_7, the known Fe-contention deadlock

The resource curves at the deadlock, in game-years (nameplate rates per gy):

| gy | Fe stock | Fe prod | Fe cons | Fe Δ | **Fe residual** | Ti stock | energy balance | energy avail | affordable |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 200 | 0 | 112 | — | — | 20 | +1.4 | 1.00 | 11 |
| 1 | 28 | 599 | 141 | −172 | 630 | 7.7 | −18 | 0.55 | **0** |
| 6 | 24 | 591 | 141 | +2 | 448 | 2.4 | −24 | 0.48 | 0 |
| 12 | 26 | 582 | 141 | +16 | 425 | 2.6 | −23 | 0.53 | 0 |
| 24 | 21 | 564 | 141 | +6 | 418 | 2.4 | −25 | 0.51 | 0 |
| 36 | 12 | 547 | 141 | +8 | 398 | 2.3 | −25 | 0.51 | 0 |
| 45 | 23 | 534 | 141 | 0 | 394 | 2.2 | −25 | 0.51 | 0 |

**What the resource data adds to finding #2 (this is new).** The deadlock is *not* "the mine doesn't produce
Fe". Nameplate mine output is **534–599 Fe per game-year for the entire run** — more than the whole
registered consumption — and yet the stockpile never leaves the 5–28 band, i.e. below the cost of the next
mine or solar farm. Two mechanisms, both visible in the table:

- **Half the production is never actually mined.** `energyAvail` sits at **0.48–0.55** from gy1 onward: the
  brownout gate scales the mine input level by energy availability. The breakdown the *player* sees does
  **not** apply that factor, so the tooltip overstates mine income by ~2× for the whole deadlock. (Recorded
  as an observation about the UI number, not fixed.)
- **The rest is eaten as fast as it arrives.** The residual — production minus consumption minus the actual
  change in stock — is **~400 Fe/gy, every year, for 45 game-years**. That is the reactive factory's
  one-shot spending (plus the brownout gap above) consuming the mine's entire output.

Meanwhile **Ti sits at 2.2–2.7 units for the entire run** against 43/gy of consumption, and the top blocker
is `structural_alloys` blocking **19 buildings in every single year**. So the loop is exactly the one Phase 1
described, now quantified: components need Fe, Fe arrives at ~half the advertised rate, components eat all of
it, and neither Fe nor the components ever accumulate enough at one instant to pay for the next producer.

Finding **#2 (factory-pacing / Fe-contention) is confirmed and sharpened. Not fixed.**

---

## 6. Cross-check (b) — the ballooning regime (seeds 4 & 8)

**Nothing on seeds 4 and 8 is resource-gated.** They are the *least* constrained seeds in the panel:

| | seed_4 | seed_8 |
|---|---|---|
| stalled years | 2 (the gy1 opening, like most seeds) | **0 — never** |
| binding after the opening | none | none (1 energy year) |
| final state | Fe **ok** (25 249 = 11 gy cover), Ti ok, 8 resources in GLUT | Fe **ok** (15 091 = 9 gy), Ti tight, 8 in GLUT |
| brownout years | 3 | 1 |
| affordable buildings at gy45 | 14 | 23 |
| colonies / POP | 5 / 133 | 5 / 130 |

So the ballooning regime is **not** a resource phenomenon. It is what the POP slice suspected: growth is
logistic against capacity = Σ housing, housing keeps rising, job creation lags, and the difference
accumulates as unemployment. The resource layer neither causes it nor limits it.

**A detail that strengthens this considerably:** seeds 4 and 8 are also the only expanding seeds **not**
affected by the measurement defect in §7 (their home population never stops changing, which is precisely
what makes them "ballooning", and that is also what keeps their consumption registration self-repairing).
Their food/water/energy numbers are trustworthy — and they show no scarcity. The ballooning finding does not
rest on corrupted data.

Finding **#5 (ballooning) stays open, unchanged, bot-vs-balance still unresolved.**

---

## 7. ⛔ INSTRUMENT DEFECT — home POP consumption is silently zeroed (found, logged, NOT fixed)

This is the most important thing the slice found, and it is a defect in the **harness environment**, not in
the game's balance and not (in practice) in the shipped game.

**Mechanism, fully traced:**

1. `CivilizationSystem`'s constructor schedules `setTimeout(() => this._syncConsumption(), 0)`
   (`CivilizationSystem.js:201`).
2. The harness makes zero-delay timers **synchronous** (`src/testing/headless/env.js:222-231`, "for `ms==0`
   run synchronously"). So that callback runs *inside the constructor* — **before** `ColonyManager` assigns
   `civSys.resourceSystem = resSys` (`ColonyManager.js:390` for colonies, `:468` for outposts).
3. With `this.resourceSystem` still null, `_syncConsumption` takes its EventBus fallback
   (`CivilizationSystem.js:1864`), and `ResourceSystem`'s listener accepts it in **whichever colony is
   currently active** — the home colony (`ResourceSystem.js:122`).
4. So every newly constructed colony/outpost overwrites the **home** colony's `civilization_consumption`
   producer with *its own* rates: a fresh outpost writes `{food: 0, water: 0, energy: 0}`.
5. Home repairs itself the next time its population changes (`_syncConsumption` early-returns while
   `pop === _registeredPop`). **If home's population never changes again, the zeros are permanent.**

Measured on seed_1 (3 constructor-path writes into the home store in one run):

| gy | written into home | home pop at the time | effect |
|---|---|---|---|
| 7.83 | food −1, water −0.75, energy −0.5 | 32 | transient (home ate −14.5 food/civ-yr; repaired at next pop change) |
| 12.50 | food −1, water −0.75, energy −0.5 | 44 | transient |
| **28.83** | **food 0, water 0, energy 0** | **79 (never changes again)** | **permanent** |

**Blast radius in this panel:** 4 of 8 seeds (1, 3, 5, 6) from gy13–29 onward. On those seeds, from that
year on, **food / water / energy consumption reads as zero while the population keeps eating nothing** —
food piles up to ~80 000, and any survival/prosperity signal derived from it is inflated. Mined resources
(Fe, Si, Cu, Ti, C, Li, Hv) are **not** affected: their consumption does not go through this producer.

**The shipped game is not affected.** In a browser, `setTimeout(…, 0)` is asynchronous, so by the time the
callback runs `civSys.resourceSystem` is already assigned (`ColonyManager.js:390/468/2208`,
`GameScene.js:244`) and the EventBus fallback is never taken. It remains a latent trap in game code
(`_syncConsumption` has no `pop <= 0` guard, unlike `forceConsumptionSync`), but it does not fire in play.

**Why it is not fixed here (deliberate).** Any of the three candidate fixes — making the harness timer
truly asynchronous, adding a `pop <= 0` guard, or assigning `resourceSystem` before construction-time sync —
**changes the measured curve** and would invalidate the closed Phase-1 record and the POP slice panel, which
were both produced on this environment. This slice is an instrument slice under a "measure, don't tune"
rule; silently re-baselining every prior number to fix a defect discovered mid-slice is exactly the kind of
thing that should be a deliberate, separate decision. **What this slice does instead:** the telemetry
detects the condition per year (`popConsumptionZeroed`), the runner prints a warning, and the HTML report
carries a red box naming the affected seeds and the game-year from which their food/water/energy are not to
be trusted.

**Recommended for a later, deliberate session:** fix `_syncConsumption` (guard `pop <= 0` *and* prefer the
owning store), then re-run Phase 1 gate2 + the POP panel + this panel and record the deltas. Cost is one
re-baseline; the benefit is that food/water/energy become measurable at all.

---

## 8. NEW candidate findings (observations — NOT adjudicated, NOT fixed)

6. **The build economy is component-gated, not ore-gated.** 97% of seed-years the top blocker is
   `structural_alloys` or `electronic_systems`. Ores block in 3% of years. Whether the components are priced
   too high, the factory too slow, or the bot's pacing wrong is finding #2's territory — but the *shape* is
   now measured: the wall is components, on every seed, all game.
7. **Ore glut / deposit sizing.** 10–11 of 14 resources end in GLUT on a typical seed; Fe ends with 9–54
   game-years of cover (15k–35k units); Cu/Li/Hv/C have essentially no sink. This is the direct answer to
   "are deposit sizes sensible": for everything except Ti and Xe, the answer measured here is *far too
   generous relative to the sinks that exist*.
8. **Ti is the one genuinely scarce ore, and it is bimodal.** 59 binding + 65 tight seed-years, yet 148 glut
   seed-years — depending on whether the home rolled a Ti deposit. Where it did (seeds 1/4/5) Ti ends at
   2 700–3 200; where it did not (seed_7) it sits at ~2.4 units all game against 43/gy of demand.
9. **The grid is never comfortable.** Energy is TIGHT in 215/360 seed-years and in deficit in 60, on 7 of 8
   seeds. ⚠ Read with the bot caveat in §4 — the reference bot targets a fixed +5 reserve, so this measures
   the doctrine as much as the balance. Worth re-measuring against a different energy doctrine before
   drawing a balance conclusion.
10. **Xe is a one-way sink** (§3): the only resource whose production never covers consumption. A fixed
    50-unit home deposit, then nothing. Not urgent (never binds in 45 gy), but it is a slow leak by design.
11. **Two resources never appear in play at all:** Nt is INERT on 6 of 8 seeds, H on 7 of 8 (H exists only on
    seed_6, where it piles up to ~30 000 with zero consumption). Whether they are meant to be mission-reward
    /late-game only is a design question, not a bug — but as of gy45 they are dead weight in the resource UI.

---

## 9. Metric limitations — stated plainly

- **The residual is a mixed quantity.** *(prod − cons) − Δstock* lumps together one-shot spending (builds,
  ships, factory bursts, fuel) **and** the gap between nameplate and actual production (brownout throttling
  of mines). §5 shows both acting at once on seed_7 and the sensor does not separate them. Separating them
  would need per-transaction instrumentation of `spend()`/`receive()` — a bigger, later slice.
- **Build cost uses the cheapest tile.** The polar `latBuildCost` modifier is per-tile; the sensor passes 1,
  so "blocked" is computed against the best-case cost and slightly *understates* blocking on polar tiles.
- **Commodities are measured as blockers only** — their stock and their blocking count, not their
  production/consumption flow. Factory flow goes through `spend()`/`receive()`, not the producer registry.
  Given §8.6 this is now the obvious next thing to measure, and it belongs to finding #2's slice.
- **Home colony only** (same scope as the POP slice). Secondary colonies and outposts are not sampled; on
  the expansive seeds a meaningful share of the economy sits off-home.
- **Energy "tight" partly measures bot doctrine**, not balance (§4, §8.9).
- **`research` is deliberately not judged** — it is an accumulator drained by design; "research as a
  constraint" needs its own metric (research pace), not this one.

---

## 10. Scope boundary of this slice

Deliberately **not** built yet (next slices, after sign-off): building-ROI telemetry, price telemetry,
commodity/factory flow telemetry. Deliberately untouched (fence): outpost droid slots (5B.2), AI economy,
Time 1.0, AI Droid/Data Center epic. Deliberately unchanged: every game-balance constant, the bot's decision
policy, and — as argued in §7 — the harness environment itself.

**Phase-2 findings queue after this slice:**

1. ~~POP-glut~~ — dropped in the POP slice.
2. **Factory-pacing / Fe-contention** — open, **confirmed and quantified** here (§5); §8.6 says it is the
   dominant constraint on *every* seed, not just the deadlocked one.
3. **POOR-class survivability** — open, untouched by this slice (REAL panel only).
4. **Fleet-upkeep Kr drain** — open, untouched (credits are not a resource in `ResourcesData`).
5. **Ballooning regime** — open, unchanged; §6 rules resources out as a cause.
6. **NEW: component-gated build economy** (§8.6).
7. **NEW: ore glut / deposit sizing** (§8.7).
8. **NEW: Ti scarcity bimodality** (§8.8).
9. **NEW: energy permanently marginal** (§8.9, with the bot-doctrine caveat).
10. **NEW (minor): Xe one-way sink** (§8.10).
11. **NEW (minor): Nt / H never in play** (§8.11).

**Instrument item (not a balance finding):** the POP-consumption zeroing of §7 — decide deliberately whether
to fix + re-baseline, before any Phase-3 tuning that touches food, water, energy or prosperity.
