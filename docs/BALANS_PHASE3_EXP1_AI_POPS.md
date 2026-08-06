# BALANS 1.0 — Phase 3 · experiment #1 · AI `startingPops` parity — result

> **Status: experiment CLOSED, result decisive.** One balance constant changed
> (`INDUSTRIALIST.startingPops`, 6 → 24 POP by the Population 2.0 ×4 rule), everything else untouched,
> same panel re-run and diffed against the preserved pre-fix baseline.
>
> **This is Phase 3 (tuning), not Phase 2 (measurement).** The Phase-2 record
> (`docs/BALANS_PHASE2_AI.md`) stands as the "before".

All figures are **game-years**; 1 gy = 12 civ-years. Panel: REAL / 8 seeds / 45 gy, 2 AI empires per run
(16 empire-runs), the same shared driver and reference bot as every other slice.

```
# after (this record):
KOSMOS_QUIET=1 node src/testing/headless/balans-ai-telemetry.mjs --class=REAL --seeds=8 --gy=45
#   → src/testing/reports/balans/ai-{telemetry,report}-REAL.{json,html}

# before (preserved, launcher-servable side by side):
#   → src/testing/reports/balans/ai-{telemetry,report}-REAL_PRE_POPFIX.{json,html}
#     (reports dir is gitignored — the numbers below and in BALANS_PHASE2_AI.md are the durable record)

node src/testing/smoke/balans_ai_telemetry_smoke.mjs   # 101/101 (T10 pins the parity rule)
```

---

## 1. What was changed, and why exactly this

`SaveMigration._migrateV95toV96` is the Population 2.0 unit change: `S = 4`, applied to **every
per-stratum `count`**, with building labour redefined as `jobs = popCost × 4`. `startingPops` is a
per-stratum count map (fed straight into `civSystem.addPop(stratum, count)`), so the rule applies to it
verbatim:

| stratum | before | after (×4) |
|---|---|---|
| laborer | 3 | **12** |
| worker | 1 | **4** |
| scientist | 1 | **4** |
| merchant | 1 | **4** |
| **total** | **6** | **24** |

Not a hand-picked number: it is the same multiplier the migration applies to save data, the same one that
took the player's start from 4 to 16 (`BOOSTED_STARTER_POP`) and `popTransferSize` from 2 to 8 in this
very file. There was no ambiguity to report — one rule, one factor, one field that had been missed.

Starting housing is 32 (`colony_base` 16 + `habitat` 12 + `launch_pad` 4), so 24 POP fits with headroom;
the colony does not spawn at its logistic growth cap. `EXPANSIONIST` inherits through
`structuredClone(INDUSTRIALIST)`. **Nothing else was touched** — in particular the Ti deadlock and the
`queued`-counts-as-success rate limiter were left in place on purpose.

---

## 2. Validity check first: the player is unmoved

| player (median of 8 seeds) | before | after |
|---|---|---|
| bodies @45 gy | 4.5 | **4.5** |
| population | 73 | **73** |
| buildings | 45 | **45** |
| job coverage | 101.9 % | **101.9 %** |
| first expansion | 10 gy | **10 gy** |

Identical on every metric. The variable moved only what it was supposed to move.

---

## 3. The result — labour parity accounts for a large, specific slice of the regression

### Industrialist (8 runs): the regression largely lifts

| | before | after | |
|---|---|---|---|
| first outpost | 12.5 gy | **6 gy** | 2.1× faster |
| 3 bodies reached | 15 gy | **8.5 gy** | now inside the 8–10 gy target band |
| bodies @45 gy | 3 | **8** | |
| **full colonies** @45 gy | 1 | **3** | the `minFreePops: 8` gate became reachable |
| job coverage @45 gy | 90 % | **100 %** | |
| unfilled jobs @45 gy | 15 | **0** | |
| population @45 gy | 121 | 134 | |
| buildings @45 gy | 50.5 | 44 | *fewer* buildings, fully staffed |

That last row is worth a sentence: the AI now builds **less** and gets **more**. Before, the expander kept
adding structures it could not crew; with labour parity it reaches its targets and stops.

**Energy was a staffing symptom, exactly as the slice inferred.** Median energy balance at gy 0:
**−22.8 → +23.4**. The whole early deficit flips positive on turn one, from a population change alone —
no energy constant was touched. What remains for the industrialist are 2–3 gy blips (seeds 2/4/5/6/7),
not the sustained early hole.

### Expansionist (8 runs): unchanged, and that is the clean result

| | before | after |
|---|---|---|
| first outpost | never (8/8) | **never (8/8)** |
| bodies @45 gy | 1 | **1** |
| job coverage @45 gy | 27.2 % | 28.2 % |
| unfilled jobs @45 gy | 80.5 | 79 |

**The Ti deadlock is confirmed independent of population.** Its home planet has no Ti in any seed, the
outpost kit hard-requires 15 Ti, and no amount of labour creates ore. This is precisely the isolation the
experiment was designed to produce: one root cause fixed, the second root cause still standing, visibly
unmoved.

⚠ **Read "in any seed" narrowly.** All 8 seeds of this panel shared **one galaxy**, so "any seed" means
"any *player*-side draw" — the expansionist's home (`sys_040`) was the same planet in all 8 runs. That was
not a panel choice: the galaxy seed itself was a constant until **GALAXY_SEED** (`e0615bd`). The panel is
still comparable (the harness pins that same galaxy explicitly now — see `BALANS_PHASE2_AI.md` §7), but
the deadlock is a property of **one specific AI start**, not of AI starts in general.

Two second-order effects on this still-broken archetype, worth logging honestly:

* `AI_POP_DECLINE` went **1 → 3**, and **all three are expansionists** (31 → 27/25, no war). Starting at
  24 instead of 6 pushes it into its housing cap (frozen at 32 all game) much sooner, where it then
  starves — `AI_RESOURCE_ZERO` on food/water persists. The fix did not cause the cap; it made the colony
  arrive there earlier.
* Its long energy deficits (20–43 gy) survive the fix — same reason: an unstaffed colony.

### Panel-wide, and why the headline median lies

| all 16 empire-runs | before | after |
|---|---|---|
| first outpost (median) | 12.5 gy | **6 gy** |
| empires with no outpost | 8/16 | **8/16** |
| bodies @45 gy (median) | 2 | 2 |
| population @45 gy (median) | 55 | **74.5** (player: 73) |
| job coverage (median) | 60 % | **82.7 %** |
| unfilled jobs (median) | 49 | **7.5** |
| threshold violations | 62 | **47** |

**The "bodies: 2 → 2" line is an artifact of mixing two populations.** Eight expansionists stuck at 1 body
sit in the middle of the distribution, so the median cannot move no matter what the industrialists do
(they went 3 → 8). Read this table per archetype or not at all — which is why §3 splits it.

### Decision log — the shape of the change

| | before | after |
|---|---|---|
| `strategy:outpost:fired` | 19 | **32** |
| `strategy:colony:fired` | 3 | **17** |
| `strategy` no-op `cannot_afford_outpost` | 1133 | 993 |
| `expander` no-op `survival: healthy` | 215 | **1365** |
| `expander` no-op `target: targets_met` | 10 | **145** |
| `expander` no-op `survival: unreachable_backoff` | 4642 | 3915 |

Full colonies **5.7×**, outposts **1.7×**. The most telling row is `survival: healthy` — the survival
module now overwhelmingly evaluates and finds *nothing wrong*, which is what a healthy colony looks like
from inside the decision layer.

---

## 4. What still blocks the AI (nothing here was fixed)

1. **Ti deadlock — untouched, now isolated.** The expansionist founds nothing in 8/8 runs; the outpost kit
   needs 15 Ti, its home has none, and the 35 Ti-bearing bodies in its own system are unreachable without
   an outpost. `Ti` is still the top blocker at 8/16 empires. **This is now the single largest remaining
   cause** and the obvious next experiment.
   ⚠ The 8/8 is **8 repetitions of one AI start**, not 8 independent starts — all runs shared one galaxy
   (see §3). Since **GALAXY_SEED** (`e0615bd`) a real game varies AI homes per new game, so the obvious
   next experiment is now cheap to run properly: sweep `galaxySeed` and ask how often *any* AI home is
   Ti-less. (Note `BALANS_STATE.md` later reclassified this item as an artifact of frozen pop, resolved
   by the housing fix — this record predates that reading.)
2. **The rate limiter still counts `queued` as success — untouched.** The expansionist's pending queue
   still fills with unfundable orders, which still switches its own survival module off; its housing stays
   frozen at 32 from gy 0 to gy 45. Combined with (1) this is why that archetype gained nothing.
3. **The component wall still costs the industrialist its first ~6 gy.** `cannot_afford_outpost` is still
   the dominant strategy-layer no-op (993), and the droid order still stalls on `missing_ingredient`
   (250 samples, never `insolvent`, never `tech_blocked`). Labour parity roughly halved the time to first
   outpost; what remains is the manufacturing time of the kit itself — the same component-gated economy the
   RESOURCES slice measured for the player.
4. **`smelter` is still an unreachable build target** (`deep_drilling` in neither `startingTechs` nor
   `researchQueue`) — 215 silent build failures, and still the largest single feeder of
   `unreachable_backoff`.
5. **AI colonies still end at 0 Kr.** Unchanged and unrelated; still a landmine for any future
   credit-gated AI behaviour.

### One threshold worth re-calibrating (not changed here)

`AI_SLOW_FIRST_OUTPOST` still fires for all 8 industrialists — at 6 gy against a 2 gy threshold. Given the
kit must be *manufactured* (ore → components → droids), 2 gy may simply be an unrealistic target rather
than a defect signal. The sibling threshold — 3+ bodies by 8–10 gy — is now **met** (8.5 gy median). Worth
deciding deliberately in Phase 3 rather than leaving a permanently-red check.

---

## 5. Verdict

Labour parity was **necessary and substantial, but not sufficient**. It recovered essentially the whole
industrialist regression (first expansion 2.1× faster, bodies 3 → 8, full colonies 1 → 3, coverage
90 % → 100 %, early energy deficit gone) and moved the AI's median population level with the player's
(74.5 vs 73). It recovered **nothing** for the expansionist, which is the informative half of the result:
that archetype's failure was never about people.

The inference from the AI slice — "the ×4 asymmetry causes the labour famine, and the famine causes the
lag" — is now **tested and supported**, on the one archetype where labour was the binding constraint, with
the player's curve unmoved as a control.

**Stop here.** Ti and the rate limiter are the next two isolated experiments; they are deliberately not
touched in this one.
