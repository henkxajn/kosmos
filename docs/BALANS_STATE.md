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

| slice | headline | doc |
|---|---|---|
| **POP** | Raw "POP-glut" is a **false alarm** (88% buffer). New signal: **ballooning** on 2/8 seeds — housing drives growth, jobs don't keep up. | `docs/BALANS_PHASE2_POP.md` |
| **RESOURCES** | The economy is **component-gated, not ore-gated** — 97% of seed-years the blocker is `structural_alloys`/`electronic_systems` (factory-made from ore); ores glut. | `docs/BALANS_PHASE2_RESOURCES.md` |
| **ROI** | **No productive building is overpriced** (all pay back < 1.4 gy), but the build tile shows **~1/5 of true cost** — median 71% is factory-mediated components. | `docs/BALANS_PHASE2_ROI.md` |
| **PRICES** | The base unit **energy:Fe is ungrounded** — a *category mismatch* (flow vs stored tonne), **not a fixable price**. `warp_cores` and `android_worker` are confirmed mispricing bugs. Energy's dynamic price is structurally **pinned at ×3** (flow, never in inventory). | `docs/BALANS_PHASE2_PRICES.md` + `docs/BALANS_PHASE3_ENERGY_FE_PROBE.md` |
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

> ⚠ **Note for a fresh session:** at the time this map was written (HEAD `214127a`) the rate-limiter +
> housing fix has **no commit in the log**, and the working tree shows no AI-side change. The status above
> is Filip's confirmed project state; do not assume the tree at this commit contains it — check before
> building on it, and do not re-derive it from scratch without asking.

### Design decisions taken — *world difficulty is a feature, not a bug*

- **Fe-poor seeds develop weakly — accepted as realism.** **Standing rule:** only fix outcomes that are
  broken *independent of the start*. Poor start → poor outcome is variance; keep it.
- **Expensive fleet upkeep — accepted.** It feeds the EKONOMIA Kr arc.

### Waiting in Phase 3 — simple confirmed bugs, next up

- **`warp_cores`** — confirmed mispricing bug (z = −5.4).
- **`android_worker`** — priced 160 Kr against the droid's 450 despite a *superset* recipe; stale price.

### Candidates / unadjudicated — these need a **read**, not a fix

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

**Immediate next step:** the two simple price-bug fixes — `warp_cores`, then `android_worker`.
