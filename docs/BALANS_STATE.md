# BALANS 1.0 — project state map

> **What this is:** the single navigation point for BALANS 1.0 — *where we are*, not *what we found*.
> Findings live in the slice documents; this file only carries status and pointers. If a detail appears
> both here and in a slice doc, the slice doc wins — two copies drift.
>
> **What BALANS 1.0 is:** systematic validation and tuning of KOSMOS's balance constants via a headless
> harness that drives the real game code and plays like a competent player, in **game-years** — measurement
> instead of guesswork.

**At a glance:** Phase 1 CLOSED (instrument) · Phase 2 CLOSED (five measurement slices) · **Phase 3 IN
PROGRESS (tuning)** · three arcs parked for after BALANS.

| doc | what it holds |
|---|---|
| `docs/BALANS_INVENTORY.md` | Phase 0 — tooling inventory, reuse-vs-rebuild verdicts |
| `docs/BALANS_PHASE1.md` | Phase 1 close record — the instrument |
| `docs/BALANS_PHASE2_POP.md` | POP slice |
| `docs/BALANS_PHASE2_RESOURCES.md` | RESOURCES slice |
| `docs/BALANS_PHASE2_ROI.md` | ROI slice |
| `docs/BALANS_PHASE2_PRICES.md` | PRICES / affordability slice |
| `docs/BALANS_PHASE2_AI.md` | AI slice |
| `docs/BALANS_PHASE3_EXP1_AI_POPS.md` | Phase 3 experiment #1 — AI `startingPops` parity |
| `docs/BALANS_PHASE3_ENERGY_FE_PROBE.md` | Phase 3 read-only probe — energy:Fe relation map |
| `docs/BALANS_PHASE3_WARPCORES_FIX.md` | Phase 3 — `warp_cores` re-priced to the table's own rule + `android_worker` verdict |

**Instrument (do not rebuild):** `balans-driver.mjs`, five `*Telemetry.js` + `*Report.js` pairs,
`balans-launcher.mjs`, `balans_*_smoke.mjs` keepers.

---

## Phase 1 — instrument · **CLOSED**

Headless harness plus a reference bot (extended RuleBot: works-forward builder + explorer) that plays the
economy end-to-end on **7 of 8** real-generator seeds. **Zero balance constants changed.**

⚠ **Key fact that shapes every later reading:** a real new-game home is **always Fe-richness 1.0**, so the
synthetic MEDIAN/POOR classes model **secondary-colony worlds, not starts**.

→ `docs/BALANS_PHASE1.md`

---

## Phase 2 — measurement · **CLOSED** (five slices, all on the corrected harness)

⚠ A harness **measurement defect** (synchronous zero-delay timers zeroing outpost food/water/energy) was
found, fixed and the records **re-baselined**, with the old numbers kept visible rather than overwritten.

⚠ **The galaxy is a pinned control variable, not a varied one — and since `e0615bd` it is pinned
deliberately.** Every panel run so far shared **one galaxy**: the seed the game derived was a constant
(`hashString('entity_1')`), so the 8 seeds varied only the *player's* system while AI empires always
spawned in `sys_061` / `sys_040`. **GALAXY_SEED** (`e0615bd`, arc WOJNA I POKÓJ) made a *new game* mint
a random galaxy seed, so the harness now pins the old constant **explicitly** —
`SingleGame.js`, `balans-driver.mjs` and `balans-gate2-report.mjs` all pass
`galaxySeed: HEADLESS_GALAXY_SEED` (= the old value). **All existing baselines are therefore
bit-identical and remain comparable** (verified: still `sys_061` / `sys_040`).
Two consequences: (a) any AI result phrased as "in every seed" means "in this one galaxy, 8× over" —
notably the `sys_040` Ti finding; (b) varying the galaxy is now a **deliberate knob** (pass a different
`galaxySeed`), and a re-baseline taken with one is **not** comparable to anything recorded here.

| slice | headline | doc |
|---|---|---|
| **POP** | Raw "POP-glut" is a **false alarm** (88% buffer). New signal: **ballooning** on 2/8 seeds — housing drives growth, jobs don't keep up. | `docs/BALANS_PHASE2_POP.md` |
| **RESOURCES** | The economy is **component-gated, not ore-gated** — 97% of seed-years the blocker is `structural_alloys`/`electronic_systems` (factory-made from ore); ores glut. | `docs/BALANS_PHASE2_RESOURCES.md` |
| **ROI** | **No productive building is overpriced** (all pay back < 1.4 gy), but the build tile shows **~1/5 of true cost** — median 71% is factory-mediated components. | `docs/BALANS_PHASE2_ROI.md` |
| **PRICES** | The base unit **energy:Fe is ungrounded** — a *category mismatch* (flow vs stored tonne), **not a fixable price**. `warp_cores` was the one unexplained rule violation (**fixed in Phase 3**); `android_worker` turned out to be a data-marked design sink, **not** a bug (verdict in the Phase 3 doc). Energy's dynamic price is structurally **pinned at ×3** (flow, never in inventory). | `docs/BALANS_PHASE2_PRICES.md` + `docs/BALANS_PHASE3_ENERGY_FE_PROBE.md` |
| **AI** | **Regression confirmed** — the AI lags the player despite a starting-handicap advantage; localised to labour famine + rate-limiter + Ti. | `docs/BALANS_PHASE2_AI.md` |

---

## Phase 3 — tuning · **IN PROGRESS**

Method: **one isolated change at a time, "before" baseline preserved, diff the result.**

### Fixed

| change | result | commit |
|---|---|---|
| AI `startingPops` Pop-2.0 parity (6 → 24) | industrialist recovered | `81489f5` (record: `214127a`) |
| AI rate-limiter (counted `queued` as success) + missing AI housing rule | **6/8 seeds went 1 → 5 bodies** | — ⚠ see note |
| Ti-deadlock | **not a separate bug** — an artifact of frozen pop; resolved by the housing fix | — |
| `warp_cores` price 500 → **1420** (the table's own rule: inputs 1092 × 1.3) | conformance ×0.35 → **×1.00**, the −5.4 outlier is gone; **no measured curve moved** (tech-gated, never produced → its realised price was a pinned ×3 of the base) | → `BALANS_PHASE3_WARPCORES_FIX.md` |

> ⚠ **Note for a fresh session:** at the time this map was written (HEAD `214127a`) the rate-limiter +
> housing fix has **no commit in the log**, and the working tree shows no AI-side change. The status above
> is Filip's confirmed project state; do not assume the tree at this commit contains it — check before
> building on it, and do not re-derive it from scratch without asking.

### Design decisions taken — *world difficulty is a feature, not a bug*

- **Fe-poor seeds develop weakly — accepted as realism.** **Standing rule:** only fix outcomes that are
  broken *independent of the start*. Poor start → poor outcome is variance; keep it.
- **Expensive fleet upkeep — accepted.** It feeds the EKONOMIA Kr arc.

### Candidates / unadjudicated — these need a **read**, not a fix

- **`civilian_goods` ×1.63** — surfaced by the `warp_cores` fix, not caused by it: the outlier detector is
  *relative* (median + MAD), so pulling the worst violator back to ×1.00 tightened the spread and promoted
  the next-largest deviation. It is priced **above** its inputs (a generous margin, not a below-cost hole) —
  a different kind of finding, deliberately left alone. (`BALANS_PHASE3_WARPCORES_FIX.md` §2.1)
- **`propulsion_systems` ×0.88** — the remaining below-cost row without a sink marker; a near-miss on the
  table's own rule, logged in the PRICES slice and still unadjudicated.

- **Ballooning POP** — Filip's three levers (housing ↓ / jobs ↑ / prosperity-satisfaction coupling ↑) await a decision.
- **Buildings' energy DRAIN** — **not yet measured.** Per-year `energyCost` upkeep is a *different dimension*
  from build cost; the ROI slice never looked at it.
- **AI expansion under Fe scarcity** — is the AI *trying and failing*, or *not trying*?

---

## Parked arcs — separate work, after BALANS

### REFORMA ENERGII

**Finding #1 (well-diagnosed, decision already taken).** The tech `modifier` effect is
**global-per-resource with no per-building scope**. That is *correct* in mining and biology, where every
building does the same job — and *wrong* in energy, the one branch whose buildings are **competing successor
generations meant to replace each other**: a global multiplier on a successor tech also upgrades the
predecessor (solar reaches 20.2 in the fusion era, beating base coal).

**Fix chosen — option 4: extend the tech schema with per-building scope, but only for the energy techs**, so
each generation gets its own bonus and only its own. Leave the global multipliers where they are correct
(mining, biology). Detail and evidence: `docs/BALANS_PHASE3_ENERGY_FE_PROBE.md`.

Plus Filip's other energy ideas, **none of them built**:

- a new **intermediate power tier** on an underused resource — candidate Si, *to be verified by measurement
  in this arc, not assumed*;
- **coal-efficiency techs** (better output / lower C draw);
- **solar output scaling with distance from the star**;
- **data-center rework** consuming heavy energy, with an **energy-powered AI Droid** doing jobs harder than POP / military.

⚠ **Carry into this arc — the `android_worker` price ordering anomaly** (Phase 3 diagnosed it and
deliberately did **not** patch it, because `android_worker` is the entity the AI Droid replaces):
tier-2 `android_worker` is priced **160 Kr** against tier-1 `automation_droid`'s **450 Kr**, while being
strictly more expensive to build (superset recipe + 1 200 Kr vs 500 Kr) and strictly better (+70 % vs +40 %
efficiency, unrestricted strata). Both are *manual sink prices* — the table declares droid prices are
deliberately **not** recipe-derived — so this is not a rule violation, it is an **inverted tier ordering
inside the sink convention**, and no live build / install / AI path reads either price. Whoever designs the
AI Droid should set both prices together, tier-ordered. Evidence: `BALANS_PHASE3_WARPCORES_FIX.md` §4.

⚠ **This arc must START by measuring** the current energy curve and per-resource consumption (which resource
is *actually* least used) **before designing anything**. Do not design on a hunch.

### EKONOMIA Kr

Filip's diagnosis: **Kr barely functions as an economy today** — one generator (civilian trade), sinks are
fleet upkeep + droids, no building sinks or upkeep, no imperial treasury, colonies don't ship Kr home.
Redesign direction: POP consume goods at market prices and earn income from jobs; imperial treasury +
taxation; more sinks and generators.

### WOJNA I POKÓJ

AI decision layer + diplomacy reform. The remaining AI findings land here: smelter unreachable, AI expansion
under Fe scarcity, AI colonies ending at 0 Kr. The `startingPops ×4` fix is already validated as the
**"before" baseline** for this arc.

---

## Deferred — low priority

- **Smelter unreachable** — missing AI rule; unimportant building.
- **Data-sheet hypotheses not confirmed by a run:** `autonomous_solar_farm` ×64, `launch_pad` ×12.8,
  Lv2-upgrade dominance.
- **Hydrogen has no price** — a Kr blind spot, but fuel was live-gated as healthy.

---

## Sequence

**Finish Phase 3 tuning** → then **REFORMA ENERGII / EKONOMIA Kr / WOJNA I POKÓJ** as separate arcs (Filip
sequences them). Phase 3 (economy tuning) comes **before** WOJNA I POKÓJ, so the AI reform lands on an
already-balanced economy.

**Immediate next step:** the price-bug queue is **closed** — `warp_cores` is fixed and `android_worker`
turned out not to be a bug (§4 of the Phase 3 doc; its ordering anomaly rides with REFORMA ENERGII). Next
are the unadjudicated **reads**, not fixes: ballooning POP levers, buildings' per-year energy drain (never
measured), AI expansion under Fe scarcity.
