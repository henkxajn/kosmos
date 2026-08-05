# BALANS 1.0 — Phase 2 · AI EMPIRE slice result

> **Status: AI vertical slice CLOSED — and with it, Phase 2.** Telemetry → loud decision hooks →
> thresholds → report → launcher are built and green. **Zero game-balance constants and zero lines of AI
> logic were changed.** This is a measurement record: findings are *logged*, not fixed. Fixes belong to
> **WOJNA I POKÓJ**; tuning is **Phase 3**.

All figures are **game-years** (`gameTime`); **1 gy = 12 civ-years**. Same shared driver, same reference
bot and the same 8-seed REAL panel as the POP / RESOURCES / ROI / PRICES slices, with **one variable
changed**: `aiEmpires: true` (AI empires + their decision layers live; random events stay off).

Reproduce (~30 s for the whole panel — ~4 s per seed):

```
# the panel this record is based on:
KOSMOS_QUIET=1 node src/testing/headless/balans-ai-telemetry.mjs --class=REAL --seeds=8 --gy=45
#   → src/testing/reports/balans/ai-telemetry-REAL.json + ai-report-REAL.html

# same thing from the browser panel (metric dropdown now: POP | ZASOBY | ROI | CENY | AI):
node src/testing/headless/balans-launcher.mjs        # → http://localhost:7333

# keepers (offline):
node src/testing/smoke/balans_ai_telemetry_smoke.mjs   # 94/94
node src/testing/smoke/balans_ai_report_smoke.mjs      # 35/35
node src/testing/smoke/balans_launcher_smoke.mjs       # 92/92  (T8 = AI end-to-end)
```

---

## 0. Why this slice is different in kind

POP, RESOURCES, ROI and PRICES **validated constants**. This one **diagnoses a suspected regression**.

The premise (from the combat/diplomacy audit): AI empires run the **real** colony economy — AI colonies
are real `Colony` objects using the same `ResourceSystem` / `CivilizationSystem` / `BuildingSystem` /
`FactorySystem` as the player. So Population 2.0 landed on AI colonies too. But the AI **decision layer**
— `EmpireStrategySystem` (colonisation) and `ColonyAutoExpander` (colony build-out) — was never adapted
to the new economy. Suspicion: AI colonisation is weaker than it was pre-Pop-2.0.

Consequence for method: the deliverable is not a verdict on a number, it is a **localisation** — which
decision fires, which blocks, which quietly does nothing, and on what reason.

---

## 1. What the slice built

| layer | file | what it is |
|---|---|---|
| sensor | `src/testing/headless/AiTelemetry.js` | per-game-year read-only snapshot per empire + transparent wrappers on the real decision methods + dependency probe |
| thresholds | `src/testing/headless/AiThresholds.js` | pure health checks → WARN lines (measurement criteria, tunable) |
| runner | `src/testing/headless/balans-ai-telemetry.mjs` | seed panel through the **shared** `balans-driver.mjs`; writes JSON + HTML |
| report | `src/testing/report/AiReport.js` | pure `renderAiReport()` → self-contained HTML (inline SVG, no deps) |
| launcher | `src/testing/headless/balans-launcher.mjs` | one `METRICS` entry → fifth option in the dropdown |

Three sensor layers, in the order they matter:

1. **Time series per empire** — colonies (outposts vs full, home-system vs other systems), population /
   employment / growth / satisfaction, stocks *and* flows, buildings by type, queue depths, credits,
   droids (stored / installed / Build-N order) and the **outpost-kit shortfall broken down by item**.
2. **Decision log** — wrappers around `_executeAutonomousOutpost`, `_executeFullColony`,
   `_maybeOrderOutpostDroids`, `_runForEmpire`, `_tryBuild`, `_tryUpgrade`, `_runSurvival`, `_runTargets`.
   Every tick where a layer evaluates and does nothing records a **reason**. No silent pass.
3. **Dependency probe** — the AI architecture leans on `window.KOSMOS?.x`, which degrades silently. Each
   such lookup is checked every sampled year; `undefined` is reported as a **finding**, not skipped.

Reasons follow the **priority order of the real decision path** — layer C uses the game's own
`explainColonization`; layer B has a mirror (`explainExpander`) with the same gate order. If the game's
gate order changes, the mirror must change with it, or the diagnosis will name the wrong cause.

**The wrappers are read-only by contract**: they call through and return the original value unchanged.
Keeper T3 pins exactly that (and caught a real bug while doing it — `detach()` must restore the *original
reference*, not a bound copy, or repeated attach/detach stacks wrappers instead of removing them).

### 1b. First finding, and it is about the instrument

**The harness itself had a dead AI layer.** `GameCore` spawned empires (when `solo:false`) but never
constructed layers B/C, and `window.KOSMOS.empireColonyBootstrap` was `undefined` — so
`EmpireStrategySystem._runForEmpire` would have returned on its **first line**, every tick, forever.
Any AI measurement taken before this slice would have measured a harness artifact.

`GameCore.boot` now takes `aiEmpires` (decoupled from `solo`) and wires the layer exactly as
`GameScene:296-304` does. Defaults are unchanged, so the POP / RESOURCES / ROI / PRICES reference panel is
untouched — keeper T8 pins that too. This is the **same class of failure** the slice was sent to find,
which is why the dependency probe is part of the instrument rather than a curiosity.

---

## 2. Pre-step: is `automation_droid` a naming relic?

No — and the doubt points the other way. Full note: `docs/audits/droid-entity-naming-check.md`.

* `automation_droid` (tier 1, `droidTier: 1`, **no tech gate**) is live and central: build cost of
  `autonomous_mine` / `autonomous_solar_farm` / `autonomous_spaceport` / `orbital_mine` / `ai_core`,
  first in `DROID_INSTALL_PRIORITY`, and the thing the AI orders 2-per-outpost.
* `android_worker` (tier 2, gated on `android_engineering`) is also live, but **lost its build-cost role**
  in Phase 5B; the `android_worker` tokens still visible in `BuildingsData` / `EmpireStrategySystem` are
  *comments about that swap*. That is almost certainly the source of the "is this still real?" feeling.
* Side observation, logged not fixed: `android_worker` is priced **160 Kr** vs the droid's **450 Kr**
  while its recipe is a strict superset of the droid's — a stale price left behind by the 5D recipe
  change, same class as the `warp_cores` mispricing from the PRICES slice.

So the outpost blocker worth measuring is **`automation_droid`**. Measuring `android_worker` stock as
"the AI's droid supply" would have measured a phantom.

---

## 3. Is the suspected regression real?

**Yes — and it is worse than "slower".** Panel: REAL, 8 seeds, 45 gy, 2 AI empires per run (16 empire-runs).

| | player (reference bot) | AI (all 16 runs) | AI · industrialist (8) | AI · expansionist (8) |
|---|---|---|---|---|
| bodies at 45 gy (median) | **4.5** | 2 | 3 | **1** |
| first new body | 10 gy | 12.5 gy | 12.5 gy | **never** |
| population at 45 gy (median) | 73 | 55 | 121 | 31 |
| buildings at 45 gy (median) | 45 | 41 | 50.5 | 29 |
| **job coverage** (humans+droids / jobs) | **102 %** | **60 %** | 90 % | **27 %** |
| unfilled jobs at 45 gy (median) | ~0 | **49** | 15 | 80.5 |
| unemployed POP | 15–23 (peak 72) | **median 0**; non-zero in 10 % of samples, max 10 | 0 | 0 |

Threshold violations across the panel: `AI_FEW_COLONIES` 16/16 · `AI_ENERGY_DEFICIT` 16/16 ·
`AI_RESOURCE_ZERO` 13 · `AI_SLOW_FIRST_OUTPOST` 8 · `AI_NO_FIRST_OUTPOST` 8 · `AI_POP_DECLINE` 1.
**No empire in any seed met the "first outpost within 2 gy" threshold**; the earliest was 11 gy (5.5×
late), the median 12.5 gy (6× late), the slowest 24 gy, and half the empires never expanded at all.

The AI enters the game with a **designed advantage** — 18 free buildings, free techs, free starting
stock, 1000 Kr — and still ends behind the player on bodies. **The suspicion is confirmed.**

But "the AI lags" is the shallow reading. The interesting result is that the two archetypes fail in
**two different ways**, and neither failure is about colonisation doctrine.

---

## 4. Localisation — where exactly it breaks

### 4.1 Layer C barely ever gets to decide

Across 16 empire-runs × 45 gy, layer C fired **19 outposts and 3 full colonies**, all of them from
industrialists (the 3 full colonies all from one empire in one seed, at gy 36/39/42). Its no-op reasons:

| count | reason (layer C) |
|---|---|
| 1133 | `cannot_afford_outpost` — the kit is not in the mother colony's store |
| 556 | `targets_saturated` — doctrine satisfied (2 Xe + Nt outposts), correct behaviour |

So layer C is **not** making bad choices. It is starved: when it wants to act it cannot pay, and once it
has paid twice it correctly stops. **The failure is upstream of the strategy layer.**

### 4.2 The expansionist's raw-ore deadlock (Ti)

The outpost kit (autonomous solar + autonomous mine) costs
`Fe 30, Si 20, Ti 15, Cu 13, structural_alloys 8, power_cells 3, conductor_bundles 2, extraction_systems 2,
electronic_systems 1, automation_droid 2`.

The expansionist's home planet (Castor e, `sys_040`) has **no Ti deposit in any seed** —
`C, Fe, Si, Cu, Li, Hv, H` and nothing else — while the colony *consumes* Ti at ~3.6/yr. It therefore sits
at **Ti = 0 forever**, 15 short of the kit, in 8 runs out of 8.

Its home system contains 35 bodies that *do* have Ti. It cannot reach any of them, because reaching them
means founding an outpost, which costs 15 Ti. **To get Ti you need an outpost; to build an outpost you
need Ti.** There is no fallback: no alternative recipe, no cross-empire purchase, and the courier layer
(`EmpireLogisticsSystem`) only moves goods between colonies the empire already owns.

This is not bad luck in one seed — the AI home systems are fixed by the galaxy layout, so it reproduces
identically every run (see §7 on what that does and does not prove). The gap it exposes is real and
documented in the code itself: `EmpireColonyBootstrap` guarantees the AI a breathable homeworld
(`makeHomeworldBreathable`) but the **Ti guarantee was deliberately deferred** in S3.1b. This slice
measures what that deferral costs: for half the empire slots, the entire expansion doctrine is dead on
arrival.

### 4.3 Layer B: a build queue that fills with orders that can never be paid

`ColonyAutoExpander` rate-limits itself to 3 pending builds + 2 pending upgrades per colony. In the game's
own accounting `queued` counts as **success** — the order was accepted, it is waiting for resources.

For the expansionist that becomes a trap. Its pending queue sits at **2.5–3.5 permanently**, filled with
orders the colony will never fund; because the queue is full, the **survival module rests**
(`restFromBuilds`), so it never builds the habitat it needs; without housing, population is capped at
**32 housing / 31 POP from gy 20 to gy 45 — frozen for 25 game-years**; without population there are no
workers; without workers there is no production; without production the queue is never funded. The
industrialist, on the same clock, grows housing 32 → 140.

Layer B no-op reasons across the panel:

| count | reason (layer B) |
|---|---|
| 4642 | `unreachable_backoff` (survival) |
| 2792 | `queue_full` (survival — the trap above) |
| 1412 | `cooldown` (target) |
| 1171 | `anti_thrash` (survival) |
| 1108 | `unreachable_backoff` (target) |
| 411 | `queue_full` (target) |
| 215 | `healthy` — nothing was wrong |

And the attempts themselves: 11 957 × `upgrade:no_candidate` (the avgLevel loop scanning with nothing to
upgrade), 455 `build:queued`, 194 `build:fail`.

**A target the AI can never satisfy:** of those 194 silent build failures, **138 are `smelter`**, which
`requires: 'deep_drilling'` — a tech that is in neither the Industrialist `startingTechs` nor its
`researchQueue`. `smelter` sits in `BUILD_PRIORITY` and in `INDUSTRIALIST_TARGETS`, so the AI retries it
forever on a 30-civ-year backoff cycle. It is throttled, not fatal — but it is dead weight, and it is the
largest single contributor to the `unreachable_backoff` count above. (`solar_farm` fails 47×, `farm` 6×,
`well` 3×.)

### 4.4 The root-cause candidate: a permanent labour famine

This is the Population 2.0 fingerprint, and it is visible in the very first sampled year:

| game-year | AI jobs / workers (median) | player jobs / workers |
|---|---|---|
| **0** | **19 / 6** | **10 / 16** |
| 5 | 25 / 19 | 26 / 26 |
| 10 | 46 / 30 | 31 / 31 |
| 20 | 96 / 59 (ind) · 81 / 31 (exp) | 41 / 41 |
| 45 | 148 / 120 (ind) · 111 / 31 (exp) | 47 / 48 |

At turn one the AI has **19 jobs and 6 POP** (32 % coverage) while the player has **10 jobs and 16 POP**
(160 %). The player runs a labour surplus all game (unemployment 15–23, peaking at 72); the AI runs a
famine — **panel-median unemployment is 0 in every sampled year**, non-zero in only 10 % of the 736
empire-samples and never above 10.

The mechanism is a redenomination that was applied on one side of the ledger only. Population 2.0 Phase 1
(`bc87846`) multiplied populations ×4 and defined `jobs = popCost × 4`. It scaled the player's start
(4 → 16 POP), the colonist/crew/ground costs, and — inside the AI archetype file — exactly **one** field:
`popTransferSize` (2 → 8). It did **not** touch `startingPops`, which still reads
`{ laborer: 3, worker: 1, scientist: 1, merchant: 1 }` = **6 POP**, where the ×4 rule implies 24.
(`EXPANSIONIST` is a `structuredClone` of `INDUSTRIALIST`, so both carry it.)

So the AI's 18 free starting buildings — its designed head start — now demand four times the labour they
used to, against an unchanged workforce. **The advantage inverted into a liability**: more free buildings
means more unfilled jobs, and every understaffed building runs at reduced efficiency.

A second consequence of the same shift: founding a full colony requires `minFreePops: 8`, and free POP is
`population − employed − locked`. With jobs permanently outrunning people, AI free POP almost never
reaches 8 (it exceeded 0 in 10 % of samples and never passed 10), so that gate is *nearly* unreachable
rather than strictly so — which is exactly the shape of the result: **3 full colonies in the entire
panel**, all founded late (gy 36/39/42) by the one empire that ended with the *fewest* buildings (34) and
therefore the only real labour slack.

> **Honesty about causation.** The ×4 asymmetry is a *fact in the data files*; the labour famine is a
> *measured fact*; the link between them is an **inference**, not a proven causal chain. The experiment
> that would settle it — re-run the panel with `startingPops` scaled ×4 and compare — means changing a
> balance constant, which this slice is forbidden to do. It is the **first experiment WOJNA I POKÓJ should
> run**, and this baseline is exactly what it should be compared against.

### 4.5 Energy: a structural early brownout, for the same reason

`AI_ENERGY_DEFICIT` fires for **16/16 empires**. Median energy balance:

| gy | 0 | 2 | 5 | 10 | 20 | 45 |
|---|---|---|---|---|---|---|
| industrialist | −22.8 | −24.8 | −28.2 | −9.4 | +57.7 | +351.6 |
| expansionist | −13.4 | −27.7 | −14.1 | +34.7 | +7.2 | +5.3 |

Phase 3 made energy **staffing-scaled**: an unstaffed building still draws 20 % standby, while a plant's
*output* scales with its staffing. An empire that starts at 32 % job coverage therefore gets solar farms
producing a fraction of nameplate against consumers drawing their standby floor — a **deficit by
construction, not by design choice**. It resolves for the industrialist as population catches up
(+352 by gy 45) and never really resolves for the expansionist, whose population is frozen.

This is the same root as §4.4 seen through a different meter, and it compounds it: a brownout throttles
non-survival production, which slows the components the outpost kit needs.

### 4.6 Every AI colony ends at 0 credits

All 16 empires end at **0 Kr**, both archetypes, every seed. This is *expected* per Phase 3 (AI has no
recurring income; wages drain to a floor of 0, "cosmetic" because no AI behaviour is credit-gated — droid
production is explicitly credit-exempt for AI colonies). Recorded here as a baseline fact, because it
means **any future credit-gated AI mechanic would silently never fire**.

---

## 5. Cross-reference: is this the same wall the player hits?

The RESOURCES slice found the player's economy is **component-gated** — in 97 % of seed-years the binding
blocker is a factory-made component, not ore. For the AI the answer is *partly the same, partly not*:

| | binding blocker | same as player? |
|---|---|---|
| industrialist | `automation_droid` (component) until ~gy 11, then doctrine-saturated | **yes** — same component wall, and it costs it ~11 gy |
| expansionist | **Ti** (raw ore), permanently | **no** — a raw-ore deadlock the player never hits |
| both | jobs ≫ people (labour), all game | **no** — the player runs a labour *surplus* |

The factory's own stall reason for the droid order was `missing_ingredient` in every stalled year — never
`insolvent`, never `no_points`, never `tech_blocked`. So the AI's droid delay is an **input** problem, not
a credits or tech problem, exactly as the component-wall finding predicts.

Net: the component wall is real for the AI too, but it is **not** the dominant cause of the AI's lag. The
dominant cause is labour, which is a Population 2.0 side-effect the AI decision layer never absorbed.

---

## 6. Thresholds

Initial values from the brief, deliberately printed with every report because they are **measurement
criteria, not game constants** — `AiThresholds.js`:

```
FIRST_OUTPOST_GY 2 · COLONIES_TARGET 3 by COLONIES_BY_GY 10 · POP_DECLINE_YEARS 3 · DEFICIT_GY 1
SURVIVAL_RESOURCES ['food','water'] · STOCK_EPS 1.0
```

Two calibration notes for whoever tunes them:

* **Energy is not stock-checked.** The game has no energy inventory — `getAmount('energy')` returns the
  *balance*, so "0" means "grid exactly saturated", not "no energy". Measured as stock it flagged 4/4
  empires from gy 0 (a false-positive generator). It has its own check on negative balance / brownout at
  the same time threshold.
* **War is context, not a mute button.** A population-decline warn during a war is still reported, flagged
  `duringWar`. In this panel it never mattered — `warSeeds: 0`, no AI empire went to war with the player
  in 45 gy, so nothing here is explained away by combat.

---

## 7. Limits of this measurement — read before acting on it

* **The AI sample is not 16 independent draws.** The seed randomises the *player's* system; AI empires
  spawn in the **same two home systems every run** (`sys_061` industrialist, `sys_040` expansionist) with
  near-identical home deposits. 16 rows are really **2 situations × 8 repetitions**. That makes the result
  *reproducible* ("not a fluke") but **not** *general* ("this happens for any AI start"). In particular,
  "8/16 empires never expand" should be read as "**one of the two AI starting situations is unwinnable**",
  which is the more useful statement anyway.
* **The player curve here is not the reference panel's curve.** Enabling empires perturbs PRNG draws and
  adds ticking colonies, so the player is only comparable **inside this run** — which is how every
  comparison above is drawn.
* **Random events are off** (one variable at a time). Nothing here says anything about AI resilience to
  disasters.
* **The economy is `civilization_boosted`** (mines ×5, deposits ×10, factory ×1.5) — parity with the other
  four slices. AI colonies live under the same multipliers, so the comparison is fair, but absolute
  numbers are scenario numbers.
* **Causation is inferred, not proven** — see the box in §4.4.
* Wrappers add per-call bookkeeping. Decision counts are exact (`truncated: false` on all 8 seeds), but
  the *timing* of a run under instrumentation is not a performance measurement.

---

## 8. What this hands to WOJNA I POKÓJ (observations only — nothing was fixed)

In rough order of how much they explain, not of how easy they look:

1. **AI `startingPops` was left un-redenominated** (6 where the ×4 rule implies 24) while
   `jobs = popCost × 4` applied to its 18 free buildings. Everything downstream — job coverage 27–90 %,
   permanent 0 unemployment, the unreachable `minFreePops: 8` gate, the early energy deficit — is
   consistent with this single asymmetry. **Run the counterfactual first.**
2. **No Ti guarantee for the AI homeworld** while the outpost kit hard-requires 15 Ti, with no fallback
   path (no alternative recipe, no cross-empire buy, couriers only serve owned colonies). Deadlocks an
   entire empire slot from turn one. The breathable-homeworld guarantee already exists next door in
   `EmpireColonyBootstrap`; the Ti one was explicitly deferred in S3.1b.
3. **`queued` counts as success in the expander's rate limiter.** A colony that cannot pay fills its
   3-slot queue with permanent orders and thereby switches its own survival module off. Anything that
   distinguishes "accepted" from "fundable" breaks the loop.
4. **`smelter` is an unreachable target** — in `BUILD_PRIORITY` and in the Industrialist targets, but its
   `deep_drilling` prereq is in neither `startingTechs` nor `researchQueue`. 138 silent failures per panel.
5. **AI colonies are permanently insolvent (0 Kr).** By design today; a landmine for any future
   credit-gated AI behaviour.
6. **Layer C's diagnosis quality is good** — `explainColonization` named the true reason in every case we
   cross-checked. Layer B has no equivalent in the game (the mirror lives in the harness); giving it one
   would make live debugging symmetrical.

Explicitly **not** proposed here: any change to doctrine, thresholds, costs, or the archetypes. That is
the next arc's call, with this run as its "before" baseline.

---

## 9. Phase 2 closure

The instrument is complete. Five vertical slices — **POP, RESOURCES, ROI, PRICES, AI** — all on the
corrected harness (`3fe634e`), all driven by the same `balans-driver.mjs`, all reporting in game-years,
all reachable from one launcher dropdown, each protected by offline keepers:

| slice | record | verdict in one line |
|---|---|---|
| POP | `docs/BALANS_PHASE2_POP.md` | raw POP glut was a false alarm; "ballooning" on 2/8 seeds is housing-vs-jobs coupling |
| RESOURCES | `docs/BALANS_PHASE2_RESOURCES.md` | the economy is component-gated, not ore-gated (97 % of seed-years); ores are in glut |
| ROI | `docs/BALANS_PHASE2_ROI.md` | nothing productive is overpriced (payback < 1.4 gy), but the build tile shows ~1/5 of the true cost |
| PRICES | `docs/BALANS_PHASE2_PRICES.md` | the table mostly obeys its own rule, but the base unit `energy = 1 Kr = 1 Fe` is ungrounded |
| **AI** | *this document* | **AI lags the player despite a designed head start; the head start itself inverted into a labour liability** |

The accumulated Phase-2 findings are ready for **Phase 3 tuning**. Phase 3 is **not** started here.

One property worth carrying forward: this baseline is dated. Phase 3 will tune the same economy the AI
lives in, so **re-running this panel after Phase 3 will show whether the tuning helped or hurt the AI** —
for free, with one command.
