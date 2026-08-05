# BALANS 1.0 — Phase 2 · ROI / building-cost slice result

> **Status: ROI vertical slice CLOSED.** Telemetry → report → launcher are built and green.
> **Zero game-balance constants were changed.** This is a measurement record: findings are *logged*,
> not fixed. Tuning is Phase 3.

All figures are **game-years** (`gameTime`); **1 gy = 12 civ-years**. Rates are per game-year (the game's
own per-civ-year rates × 12). Measured on the **post-fix harness** (`3fe634e`) — the same shared driver,
the same bot and the same reference panel as the POP and RESOURCES slices, so the curve is identical.

Reproduce:

```
# the panel this record is based on (REAL generator, no deposit injection):
KOSMOS_QUIET=1 node src/testing/headless/balans-roi-telemetry.mjs --class=REAL --seeds=8 --gy=45
#   → src/testing/reports/balans/roi-telemetry-REAL.json + roi-report-REAL.html

# same thing from the browser panel (metric dropdown now: POP | ZASOBY | ROI):
node src/testing/headless/balans-launcher.mjs        # → http://localhost:7333

# keepers (offline):
node src/testing/smoke/balans_roi_telemetry_smoke.mjs   # 110/110
node src/testing/smoke/balans_roi_report_smoke.mjs      #  77/77
node src/testing/smoke/balans_launcher_smoke.mjs        #  76/76
```

---

## 1. What the slice built

| layer | file | what it is |
|---|---|---|
| telemetry | `src/testing/headless/RoiTelemetry.js` | fully-loaded cost model (pure) + read-only per-game-year sampler of live buildings |
| runner | `src/testing/headless/balans-roi-telemetry.mjs` | seed panel through the **shared** `balans-driver.mjs`; writes JSON + HTML |
| report | `src/testing/report/RoiReport.js` | pure `renderRoiReport()` → self-contained HTML (inline SVG, no deps) |
| launcher | `src/testing/headless/balans-launcher.mjs` | one `METRICS` entry → third option in the dropdown |

### The cost side — fully loaded, because the sticker lies

A building's cost is `cost` (ore) + `commodityCost` (components). Components are **made by the factory
out of ore**, so each one carries a hidden ore bill. The sensor computes the cost with the **real game
formula** (`computeBuildResourceCost` / `computeBuildCommodityCost`, including the environmental surcharge
of that seed's planet) and then **recursively expands** every component through `COMMODITIES.recipe` down
to raw resources (recipes nest — `warp_cores` ← `quantum_cores` ← ore). Both halves are reported:

- **direct** — the ore the player sees on the build tile
- **embedded** — the ore hidden inside the components
- **fully loaded** = direct + embedded, and `embedded / fully-loaded` = the share that runs through the factory

### The value side — two tracks, deliberately not one number

- **(a) Productive** (mines, power, farms, wells, converters) → hard ROI. Flow measured from the **live**
  game: `effectiveRates` of every instance (which already contain terrain, tech, staffing, level, upkeep
  and energy) plus the **real** mine yield (`getMineOutputEstimate` — staffing × energy availability ×
  deposit depletion). Payback in game-years.
- **(b) Non-commodity** (housing → POP slots, labs → research, trade → capacity) → **its own functional
  metric, reported separately.** A forced common denominator would produce numbers that look comparable
  and are not.

Both sides of track (a) are expressed in **Kr of ore** using the game's own `TradeValuesData.BASE_PRICE` —
the same table `CivilianTradeSystem` trades on. `research` has **no price** in that table, which is exactly
why labs cannot enter track (a): missing data, not a methodological preference.

Buildings the bot never built get **nominal** ROI computed from the data sheet (level 1, no terrain/tech).
Without it, 50 of 61 buildings would be invisible. Every row is labelled measured vs nominal.

---

## 2. The measured panel — REAL generator, 8 seeds, 45 gy

360 seed-years, 0 crashes. The bot built **11 of 61** building types; **4** of them are productive.

| building | fully-loaded cost | in components | Kr/gy per level | **payback** | at ×1 mining | payback incl. wages | wage share | seeds |
|---|---|---|---|---|---|---|---|---|
| `mine` | 268 Kr | 84% | 2 285 | **0.12 gy** | 0.63 gy | 0.12 | 1% | 8/8 |
| `farm` | 85 Kr | 80% | 490 | **0.16 gy** | 0.16 gy | 0.16 | 2% | 8/8 |
| `well` | 89 Kr | 81% | 220 | **0.37 gy** | 0.37 gy | 0.38 | 5% | 8/8 |
| `solar_farm` | 346 Kr | 80% | 246 | **1.30 gy** | 1.30 gy | 1.36 | 5% | 8/8 |

Per-seed spread is small: mine 0.06–0.16, farm 0.11–0.27, well 0.26–0.70, solar farm 1.08–5.98 (the 5.98
outlier is a brownout seed where the grid throttles everything).

Buildings the bot built whose net flow is **negative** (they consume, they do not produce a priced
resource): `habitat`, `launch_pad`, `shipyard`, `factory`, `research_station`, `observatory`. That is not a
defect — it is what "non-commodity" means, and they are judged on their own tracks below.

Panel verdict emitted by the runner: **outcome 1 — SKEWED**, spread 10.98×. **Read §3.2 before using that
number.**

---

## 3. Filip's question: "a lot of buildings feel like they give little"

### 3.1 The answer is the cost side, not the value side

Every productive building the bot actually builds pays for itself in **under 1.4 game-years**. Nothing in
the measured set is overpriced relative to its output. The felt problem is somewhere else, and the slice
found it in the price tag:

| building | ore the player sees | ore hidden in components | true cost | **multiple** |
|---|---|---|---|---|
| `farm` | 17 Kr | 68 Kr | 85 Kr | **×5.0** |
| `well` | 17 Kr | 72 Kr | 89 Kr | **×5.2** |
| `solar_farm` | 68 Kr | 278 Kr | 346 Kr | **×5.1** |
| `factory` | 91 Kr | 361 Kr | 452 Kr | **×5.0** |
| `mine` | 42 Kr | 226 Kr | 268 Kr | **×6.4** |
| `habitat` | 44 Kr | 298 Kr | 342 Kr | **×7.9** |

Across the whole catalogue (60 buildings, capital excluded), the share of true cost that is
factory-mediated is: min **14%**, p25 **60%**, **median 71%**, p75 **80%**, max **100%**. Only 13 of 60 sit
below 50%, and they are the culture / governance / late-research ones (`confederation_hall` 14%,
`anomaly_research_lab` 15%, `seekers_institute` 19%).

So: **for a typical building, ~5 of every 6 ore units it really costs are invisible on the build tile**, and
they arrive as a queue on a shared factory rather than as a stock check. That is a coherent mechanical
explanation for "it costs a lot and gives little" that does **not** require any building to be mispriced —
and it dovetails exactly with the RESOURCES slice, which found the binding constraint is a *component*
(`structural_alloys` / `electronic_systems`) in **97%** of seed-years while ores sit in glut.

### 3.2 The SKEWED verdict is an artifact of the reference scenario — and now it says so

The reference panel runs on `civilization_boosted`, which multiplies **mine yield ×5** (`rateMult` in
`BuildingSystem` / `DepositSystem` / `ResourceSystem`). Parity with POP and RESOURCES forbids changing the
shared driver, so the sensor computes the counterfactual **arithmetically on the same measured series** —
the multiplier touches only mine extraction, so only extraction is divided; upkeep and energy stay:

| | measured (as run) | counterfactual ×1 mining |
|---|---|---|
| `mine` payback | 0.12 gy | **0.63 gy** |
| panel spread | 10.98× | **8.2×** |
| verdict | outcome 1 — SKEWED | **outcome 0 — PROPORTIONATE** |

**The headline verdict flips.** Read plainly: among the buildings the bot actually builds, costs *are*
proportionate to output; the boosted scenario is what pushes the mine past the threshold. The report shows
both numbers side by side and says which is which. (This is a counterfactual on measured data, not a second
run on another scenario — `civilization` would also change starting techs, POP and buildings, i.e. a
different game rather than a different multiplier.)

### 3.3 The data sheet understates real output by 2–3×

| building | nominal payback (data sheet) | measured payback (live) | live is better by |
|---|---|---|---|
| `farm` | 0.37 gy | 0.16 gy | 2.3× |
| `well` | 0.67 gy | 0.37 gy | 1.8× |
| `solar_farm` | 4.44 gy | 1.30 gy | 3.4× |

Terrain yield bonuses and tech multipliers roughly double to triple the raw `rates` in `BuildingsData`.
**Anyone judging balance by reading the data file is reading a number 2–3× too low.** (`mine` has no nominal
figure at all — `rates: {}`, its yield is computed from deposits.)

---

## 4. Which buildings actually give little — the outliers

All of these are **nominal** (the bot never built them), so they are data-sheet arithmetic, not measurement.
They are listed as observations, **not adjudicated**.

| building | cost | in components | nominal output | nominal payback | comparable |
|---|---|---|---|---|---|
| **`autonomous_solar_farm`** | 15 360 Kr | **100%** | 54 Kr/gy | **284 gy** | `solar_farm` 4.44 gy → **64× worse** |
| **`synthesized_food_plant`** | 567 Kr | 76% | 24 Kr/gy | **23.6 gy** | `farm` 0.37 gy → **64× worse** |
| `coal_plant` | 178 Kr | 71% | 120 Kr/gy | 1.48 gy | fine |
| `geothermal` | 276 Kr | 79% | 288 Kr/gy | 0.96 gy | fine |
| `nuclear_plant` | 853 Kr | 80% | 612 Kr/gy | 1.39 gy | fine |
| `fusion_reactor` | 1 115 Kr | 59% | 1 044 Kr/gy | 1.07 gy | fine |
| `vacuum_generator` | 3 023 Kr | 66% | 5 760 Kr/gy | 0.53 gy | fine |
| `stellar_collector_relay` | 1 716 Kr | 21% | 2 376 Kr/gy | 0.72 gy | fine |

The energy ladder is **remarkably flat**: coal → geothermal → nuclear → fusion → vacuum all land between
0.53 and 1.48 gy of payback. Whatever else is true, the power line is internally consistent.

The two outliers stand out by ~64× each:

- **`autonomous_solar_farm`** produces *less* than a plain solar farm (6 vs 8 energy) for **44× the cost**,
  and is the only building in the catalogue whose cost is **100%** components. Its selling point is
  `jobs: 0` (no staffing) — the question this slice cannot answer is whether one saved job is worth 15 000
  Kr of ore; that is a workforce-economics judgement, and it belongs with the droid/synthetic thread.
- **`synthesized_food_plant`** is the airless-world food answer, so a premium over an open-air farm is
  intended by design. 64× is still worth a look.

Expensive buildings with **no measurable output in this slice** (their value is not a resource flow, so any
ROI would be invented — cost shown, value not): `autonomous_spaceport` 36 612 Kr, `jump_gate` 23 530 Kr,
`warp_beacon` 6 750 Kr, `ai_nexus` 3 027 Kr, `antimatter_factory` 2 254 Kr, `barracks_lv3` 2 148 Kr,
`defense_grid` 2 109 Kr, `terraformer` 1 712 Kr, and 9 more.

**`launch_pad` deserves its own line.** It is the single most expensive thing the bot *does* build:
**16 296 Kr** — 12.8× the next most expensive thing it builds (`shipyard`, 1 270 Kr), 48× a habitat,
192× a farm — with a net flow of **−317 Kr/gy** in upkeep and 4 housing slots
as a side effect (4 074 Kr per slot, against the habitat's 28.5). It is a spaceport, so housing is not its
function and this slice cannot price "being able to launch". But the number is large enough to record.

---

## 5. Upgrades: level 2 is a bargain, level 3 is a wall

The game's upgrade formula (`BuildingSystem._upgrade`) is: ore = base × level × 1.2, and **components are
not charged until level 3** (then × level−1). Output scales **× level** (linear). Measured against the
fully-loaded build cost:

| building | build Lv1 | → Lv2 | → Lv3 | Lv2 / Lv1 | Lv3 / Lv1 |
|---|---|---|---|---|---|
| `mine` | 268 Kr | 102 Kr | 604 Kr | **0.38×** | 2.25× |
| `farm` | 85 Kr | 42 Kr | 198 Kr | **0.49×** | 2.33× |
| `well` | 89 Kr | 41 Kr | 206 Kr | **0.46×** | 2.31× |
| `solar_farm` | 346 Kr | 165 Kr | 804 Kr | **0.48×** | 2.32× |
| `habitat` | 342 Kr | 106 Kr | 754 Kr | **0.31×** | 2.21× |

Upgrading to Lv2 buys **exactly the same +1× of output as a new building for 31–49% of the price**, purely
because it skips the component bill. Then Lv3 costs 2.2–2.3× the original build for that same +1×.

Two consequences worth recording:

1. **Upgrade-everything-to-Lv2-first is strictly dominant** and the shape of the cost curve makes it so —
   not a player insight but a pricing artifact of "components start at Lv3".
2. It compounds §3.1: the cheap path (Lv2) is cheap *precisely because it does not touch the factory*, which
   is the bottleneck the RESOURCES slice found.

---

## 6. Cross-check (a) — the factory thread, from the cost side

The RESOURCES slice ended on the factory: the economy is component-gated, and a factory converting ~1 000 Fe
into components swung one seed's affordable buildings from 6 to 17. This slice adds the other half.

- **71% of the catalogue's true cost flows through the factory** (median; §3.1). Factory throughput is, in
  practice, the **currency of construction** — not ore.
- The bot **never scales it past 3–4 production points** on any seed (1 on seed_7). Points per seed:
  4/3/4/4/4/3/1/4.
- Its own Kr "value added" is noisy across seeds: **−476, −248, −170, +123, +361, +398, +399, +430**
  (median +242 Kr/gy).

**The negative seeds are a pricing artifact, not the factory destroying value.** Four commodities are priced
by the game *below* the ore their recipe consumes:

| commodity | price | ore in recipe | ratio |
|---|---|---|---|
| `android_worker` | 160 Kr | 7 805 Kr | ×0.02 (+1 200 Kr/unit) |
| `automation_droid` | 450 Kr | 7 500 Kr | ×0.06 (+500 Kr/unit) |
| `warp_cores` | 500 Kr | 626 Kr | ×0.80 |
| `propulsion_systems` | 100 Kr | 114 Kr | ×0.88 |

For the droids this is an explicit design decision (the recipe is a production sink; the comment in
`TradeValuesData` says so). A seed that spends its factory on droids therefore books "negative value added"
by construction. **Prices are their own slice — recorded here, not adjudicated.**

**Is the factory itself good ROI?** Measured in Kr it is the *worst* payback of anything the bot builds
(452 Kr against a median +242 Kr/gy of value added at 3–4 points ≈ 7.5 gy per point — ~60× slower than a
mine). But that framing is wrong and the report says so: the factory is a **gate**, not a producer. Without
it, 71% of every other building's cost cannot be paid at all. The honest measure is throughput against
component demand, and by that measure the interesting number is that it stays at 3–4 points all game.

---

## 7. Cross-check (b) — the mine nameplate gap, now per building

RESOURCES §5 found that the tooltip overstates mine income because `getResourceBreakdown` applies neither
staffing nor the brownout throttle. Measured per building here, as the ratio nameplate ÷ real yield:

| seed | 1 | 2 | 3 | 4 | 5 | 6 | **7** | 8 |
|---|---|---|---|---|---|---|---|---|
| nameplate / real | 1.04 | 1.03 | 1.06 | 1.05 | 1.04 | 1.02 | **2.02** | 1.02 |

On healthy seeds the tooltip is honest (2–6% off). On **seed_7 — the known Fe-contention deadlock — it
overstates by exactly ~2×**, which is what RESOURCES §5 predicted from `energyAvail` 0.48–0.55. Independent
confirmation from a different sensor, and it localises the effect: the tooltip is only misleading *while the
grid is browning out*. This slice uses the **real** yield for payback, not the tooltip figure.

---

## 8. NEW candidate findings (observations — NOT adjudicated, NOT fixed)

12. **The build tile shows ~1/5 of what a building really costs.** Median 71% of a building's true ore cost
    is embedded in components (p25 60%, p75 80%); typical multiple visible→true is ×5–8. This is the
    slice's answer to "buildings give little for their cost": the *value* side is fine, the *price tag* is
    the part that is not visible. (§3.1)
13. **Measured productive ROI is uniformly fast and, at ×1 mining, proportionate.** 0.12–1.30 gy measured;
    spread 8.2× on the counterfactual → outcome 0. The reference scenario's ×5 mining is what makes the
    panel read SKEWED. (§2, §3.2)
14. **`BuildingsData` understates real output by 2–3×** once terrain and tech multipliers apply — a trap
    for anyone tuning from the data file. (§3.3)
15. **`autonomous_solar_farm` is a 64× outlier**: 15 360 Kr, 100% components, *less* output than a 346 Kr
    solar farm, for a saving of one job. Same shape, milder, for `synthesized_food_plant` (64× vs `farm`,
    but it is the airless-world answer so a premium is intended). (§4)
16. **The upgrade curve has a step at Lv3, and it makes Lv2 strictly dominant** — Lv2 buys the same +1×
    output as a new building for 31–49% of the price, because components are not charged until Lv3. (§5)
17. **`launch_pad` is the bot's most expensive build by 12.8×** (16 296 Kr vs the next one, 1 270 Kr; −317 Kr/gy upkeep) and this
    slice cannot price what it delivers. (§4)
18. **The energy ladder is internally consistent** — coal → geothermal → nuclear → fusion → vacuum all
    within 0.53–1.48 gy nominal payback. A rare "this looks fine" result, recorded as such. (§4)
19. **Four commodities are priced below the ore they consume** (`android_worker` ×0.02, `automation_droid`
    ×0.06, `warp_cores` ×0.80, `propulsion_systems` ×0.88). Deliberate for droids; the other two are
    unexplained. Belongs to the price slice. (§6)
20. **The factory never scales past 3–4 points** while gating 71% of construction cost. (§6)
21. **The tooltip's mine overstatement is brownout-local** — ~1.03× normally, 2.02× on the deadlocked
    seed. Confirms and localises RESOURCES §5. (§7)

---

## 9. Metric limitations — stated plainly

- **Everything in track (a) rests on the game's own price table.** Cost and output are both converted to Kr
  of ore via `BASE_PRICE`. If those prices are mis-scaled relative to each other, the *ranking* moves with
  them. In particular **energy is priced 1 Kr, i.e. 1:1 with iron** — the entire value of every power plant
  hangs on that single number. Prices are a later slice; here they are assumed, not judged.
- **`research` has no price**, so labs cannot be ranked against producers at all. Their track reports "Kr of
  cost per 1 research/gy" (`research_station` 1.1, `observatory` 3.4) — comparable between labs, meaningless
  against a mine. Worth noting on the side: `research_station` pays its own build cost again in **wages**
  every ~3 gy (149 Kr cost, 48 Kr/gy of wages).
- **Wages are outside the headline payback**, though in the same currency, because they come from a
  different pool (credits, not the stockpile). They are 1–5% of gross flow for productive buildings —
  immaterial there, material for labs. Both figures are in the table.
- **Coverage: 11 of 61 buildings measured, 4 of them productive.** The other 50 are data-sheet arithmetic.
  This is a property of the reference bot's build policy, not of the game — a different doctrine would
  measure a different subset. Every outlier in §4 is nominal and should be confirmed by a run that actually
  builds it.
- **Build cost uses the cheapest tile** (`latBuildCost = 1`) — the polar modifier is per-tile and known only
  to `_build`, so costs are slightly *understated* on polar tiles. Same boundary as the RESOURCES slice.
- **Home colony only, normalised per level.** Secondary colonies and outposts are not sampled.
- **`housing` vs `jobs` asymmetry** (a real trap, caught and encoded in the keeper): the game *accumulates*
  `entry.housing` across levels but keeps `entry.jobs` per level. Multiplying both by level double-counts
  housing.
- **`COMMODITIES.baseTime` is in civ-years**, despite the data file's comment saying game-years —
  `FactorySystem._update` receives `civDeltaYears`. Factory-time figures divide by 12 accordingly.
- **The factory's Kr value-added is contaminated by §6's pricing** and should not be read as its worth.

---

## 10. Scope boundary of this slice

Deliberately **not** built (next slices, after sign-off): price telemetry, commodity/factory flow telemetry
(units and utilisation rather than Kr), AI telemetry. Deliberately untouched (fence): outpost droid slots
(5B.2), AI economy, Time 1.0, AI Droid/Data Center epic. Deliberately unchanged: every game-balance
constant, the bot's decision policy, the shared driver.

**Phase-2 findings queue after this slice:**

1. ~~POP-glut~~ — dropped in the POP slice.
2. **Factory-pacing / Fe-contention** — open; this slice adds the cost half (§6): the factory gates 71% of
   construction cost and never exceeds 4 points.
3. **POOR-class survivability** — open, untouched (REAL panel only).
4. **Fleet-upkeep Kr drain** — open, untouched.
5. **Ballooning regime** — open, untouched by this slice.
6. **Component-gated build economy** — open; now measured from both ends (RESOURCES §8.6 + ROI §3.1).
7. **Ore glut / deposit sizing** — open.
8. **Ti scarcity bimodality** — open.
9. **Energy permanently marginal** — open. §4 adds that the *ladder* is consistent, which narrows it: the
   problem is grid sizing/doctrine, not power-plant pricing.
10. **Xe one-way sink** — open (minor).
11. **Nt / H never in play** — open (minor).
12. **NEW: the build tile shows ~1/5 of the true cost** (§3.1, §8.12).
13. **NEW: measured ROI proportionate at ×1 mining; SKEWED is a scenario artifact** (§3.2, §8.13).
14. **NEW: `BuildingsData` understates live output 2–3×** (§3.3, §8.14).
15. **NEW: `autonomous_solar_farm` 64× outlier** (§4, §8.15).
16. **NEW: Lv2 upgrade strictly dominant, step at Lv3** (§5, §8.16).
17. **NEW: `launch_pad` 12.8× the next build, value unpriceable here** (§4, §8.17).
18. **NEW (positive): energy ladder internally consistent** (§4, §8.18).
19. **NEW: four commodities priced below their ore** (§6, §8.19) — for the price slice.
20. **NEW: factory capped at 3–4 points** (§6, §8.20).
21. **NEW: mine tooltip overstatement is brownout-local** (§7, §8.21).

**Recommended next slice:** prices. Three separate threads now point at the price table — the cross-slice
conversion this slice had to assume (§9), the four below-ore commodities (§6), and the question of whether
`structural_alloys` / `electronic_systems` are priced correctly given they gate 97% of build-years
(RESOURCES §8.6) and 71% of build cost (§3.1). It is the shared dependency of everything measured so far.
