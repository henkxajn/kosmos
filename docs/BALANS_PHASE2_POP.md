# BALANS 1.0 — Phase 2 · POP slice result

> **Status: POP vertical slice CLOSED.** Telemetry → report → launcher are built and green.
> **Zero game-balance constants were changed.** This is a measurement record: findings are *logged*,
> not fixed. Tuning is Phase 3.

All figures are **game-years** (`gameTime`); **1 gy = 12 civ-years**. Two clocks: Kr/upkeep run on the
game clock, production/population/energy on the civ clock (×12) — every number below is converted to gy.

Reproduce:

```
# the panel this record is based on (REAL generator, no deposit injection):
KOSMOS_QUIET=1 node src/testing/headless/balans-pop-telemetry.mjs --class=REAL --seeds=8 --gy=45
#   → src/testing/reports/balans/pop-telemetry-REAL.json + pop-report-REAL.html

# same thing from a browser panel instead of the terminal:
node src/testing/headless/balans-launcher.mjs        # → http://localhost:7333

# keepers (offline):
node src/testing/smoke/balans_pop_telemetry_smoke.mjs
node src/testing/smoke/balans_pop_report_smoke.mjs
node src/testing/smoke/balans_launcher_smoke.mjs
```

---

## 1. What the slice built

Three layers, one metric (POP) through all of them:

| layer | file | what it is |
|---|---|---|
| telemetry | `src/testing/headless/PopTelemetry.js` | read-only per-game-year sampler of the *live* systems + the healthy/wasted classifier |
| runner | `src/testing/headless/balans-pop-telemetry.mjs` | mirrors the gate2-report driver (same boot, same bot, same 4-actions/civ-year budget); samples once per gy; writes JSON + HTML |
| report | `src/testing/report/PopReport.js` | pure `renderPopReport()` → self-contained HTML (inline SVG, no deps) |
| launcher | `src/testing/headless/balans-launcher.mjs` | thin local HTTP panel: seeds / game-years / class → Run → open the report |

**Classifier (outlet-based, OR).** Surplus POP is a problem only when it has nowhere to go:

- **BUFFER** — surplus *with* an outlet: home built out **OR** home absorbing (human jobs rising YoY) **OR** expansion active.
- **WASTED** — surplus with **no** outlet (home stalled *and* no expansion) → the real glut.
- **BOUND** — unfilled jobs exist → POP-limited (the *opposite* of glut).
- **TIGHT** — no slack.

The report's methodology box states the limitation openly: at this map scale (~256 buildable tiles) the
build-out leg is **inert** — it never approaches the 80% threshold — so classification operatively rests on
**two legs**: expansion and absorption.

---

## 2. The measured panel — REAL generator, 8 seeds, 45 gy

Final-year state and the surplus-year split per seed:

| seed | pop | unemployed | human jobs | housing | colonies/outposts | surplus yrs | buffer | wasted | final growth | regime |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 79 | 29 (37%) | 49 | 80 | 3/1 | 44 | 44 | 0 | 0 | self-limiting |
| 2 | 55 | 15 (27%) | 39 | 56 | 3/2 | 42 | 42 | 0 | 0 | self-limiting |
| 3 | 79 | 26 (33%) | 52 | 80 | 2/3 | 44 | 43 | 0 | 0 | self-limiting |
| **4** | **133** | **70 (53%)** | **63** | **140** | 4/1 | 44 | 44 | 0 | **0.197** | **ballooning** |
| 5 | 67 | 20 (30%) | 46 | 68 | 3/1 | 45 | 43 | 2 | 0 | self-limiting |
| 6 | 43 | 8 (19%) | 34 | 44 | 1/3 | 42 | 40 | 2 | 0 | self-limiting |
| 7 | 31 | 8 (26%) | 23 | 32 | 1/0 | 45 | 9 | **36** | 0 | **deadlock (WASTED)** |
| **8** | **130** | **70 (54%)** | **60** | **140** | 4/1 | 44 | 44 | 0 | **0.25 (cap)** | **ballooning** |

Final-year row = gy45. Self-limiting seeds sit **at** capacity (pop ≈ housing); the two ballooning seeds are
~10 POP below a capacity that is still being raised.

Panel totals: **360 seed-years**, 350 with surplus (97%) — **309 BUFFER (88%)**, 40 WASTED (11%), 1 BOUND.
Verdict emitted by the runner: **outcome 1 — BUFFER**. 0 crashes.

---

## 3. Finding #1 "POP-glut" — **FALSE ALARM, dropped**

Phase 1's finding #1 read "every class/year shows unfilled-jobs = 0 with a growing labor surplus → POP never
binds → glut". Measured against Filip's own healthy/wasted definition, **88% of all surplus-years are BUFFER**:
the surplus has an outlet (the home colony is still absorbing it into new jobs, or expansion is running).
The raw signal ("unfilled jobs = 0 + rising surplus") was **counting buffered POP as glut**.

**Finding #1 is dropped as a standalone finding.** What survives of it is the narrower ballooning signal (§5).

---

## 4. seed_7 — the metric independently rediscovered finding #2

seed_7 is the only WASTED seed (36/45 surplus-years). It is **not an independent POP problem**: it is the
known Phase-1 **factory-pacing / Fe-contention deadlock** (`docs/BALANS_PHASE1.md` §3) seen from the POP side —
pop frozen at 31 from ~gy11, jobs frozen at 23, zero expansion for the whole run, so the surplus genuinely has
nowhere to go. The classifier found it **without being told about it**, from a different sensor than the one
that found it in Phase 1. That is the strongest evidence in this slice that the metric measures the right thing.

Carried forward as finding **#2 (factory-pacing / Fe-contention)**, unchanged and unfixed.

---

## 5. NEW candidate finding — the **ballooning** regime

Surfaced by the buffer-size-over-time chart: **the single BUFFER label hides two regimes.**

- **Self-limiting (6/8 seeds).** Pop plateaus, growth decays to 0, unemployment settles at a stable ~19–37%.
  The colony reaches its housing capacity and stops. Healthy.
- **Ballooning (2/8 seeds — 4 and 8).** Unemployment climbs roughly linearly to **~70 POP = >50% of the
  population** and is still climbing at the 45 gy horizon, while **growth stays pinned at the `MAX_GROWTH_PER_YEAR
  = 0.25`/civ-yr cap** and **expansion has stalled**: last colonizer built ~gy11, last new colony/outpost
  ~gy15–16, colonies frozen at 4 for the remaining ~30 gy.

**Observed mechanism (measured, not adjudicated):** on the ballooning seeds housing keeps rising (32 → 140)
while human jobs lag badly (27 → 63). Growth is logistic against capacity = Σ housing (Population 2.0 Phase 1,
Decision 1), so as long as habitats keep going up the growth stays at the cap; job creation does not keep pace,
and the difference accumulates as unemployment. On the self-limiting seeds housing stops (56 / 44) and pop
simply parks at capacity.

This is **Filip's original arc concern resurfacing in measured form** ("growth cap 0.25/civ-yr may outpace job
creation → surplus-pop regime") — and it appears **specifically when expansion stalls**.

**OPEN QUESTION — do NOT prejudge:**

- **bot-policy reading** — the reference bot stops colonizing around gy15; if it kept expanding, the surplus
  would be drained into colonizers and new colonies (which is exactly what the other 6 seeds' outlets do).
  Then ballooning is a gap in the bot's expansion behaviour, not in the balance.
- **balance reading** — nothing throttles POP growth once expansion stalls; a player who stops expanding
  (for any reason) still pays full food/water/housing for a population that is >50% idle.

**Revisit when we examine expansion behaviour** (why the bot stops colonizing ~gy15). Not fixed here, on either
side: no bot change, no balance change.

---

## 6. Known metric limitation — recorded honestly, **not fixed now**

The classifier labels the ballooning years **BUFFER** because `expansionActive` fires on *"colonies exist"*
(`colonizersBuilt > 0 || outposts > 0 || fullColonies ≥ 2`), **not** on *"expansion is actively draining POP
this year"*. On seeds 4 and 8 that flag stays true for ~30 gy after expansion has actually stopped. By Filip's
own healthy/wasted definition those years are drifting **buffer → wasted**, and the metric misses the transition.

**Candidate refinement for later** (deliberately not applied in this slice): redefine `expansionActive` as
*actively draining* — e.g. a colonizer in flight, or POP shipped out within the last N game-years — instead of
"a colony exists somewhere". Decision taken this session: **leave the metric as-is and log the regime**, because
re-tuning the metric before we know whether ballooning is a bot gap would be treating the symptom of the wrong
system. The trade-off is stated here so the 88% BUFFER headline is read with the right caveat.

---

## 7. Scope boundary of this slice

Deliberately **not** built yet (next slice, after sign-off): per-resource telemetry, building-ROI, price
telemetry. Deliberately untouched (fence): outpost droid slots (5B.2), AI economy, Time 1.0, AI Droid/Data
Center epic. Deliberately unchanged: every game-balance constant, and the bot's decision policy.

**Phase-2 findings queue after this slice:**

1. ~~POP-glut~~ — **dropped** (§3).
2. **Factory-pacing / Fe-contention** — open, unchanged (seed_7 is its POP-side symptom, §4).
3. **POOR-class survivability** — open, untouched by this slice.
4. **Fleet-upkeep Kr drain** — open, untouched by this slice.
5. **NEW: ballooning regime** — open candidate, bot-vs-balance question unresolved (§5), plus the metric
   limitation in §6.
