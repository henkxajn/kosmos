# BALANS 1.0 — Phase 1 close record

> **Status: Phase 1 CLOSED.** The instrument (a headless, real-code economic-audit harness driven by a
> competent reference bot) is built and validated. **Zero game-balance constants were changed across Phase 1.**
> This document lets Phase 2 start cold without reconstructing nine sessions. **Phase 2 is not started here.**

All timings in this document are **game-years** (`gameTime`); 1 game-year = 12 civ-years. Reproduce the panels with:

```
# real home distribution (no deposit injection): --class=REAL is an unknown key → injection is skipped
KOSMOS_QUIET=1 node src/testing/headless/balans-gate2-report.mjs --class=REAL    --seeds=8 --gy=45
# injected seed-panel classes:
KOSMOS_QUIET=1 node src/testing/headless/balans-gate2-report.mjs --class=GOOD_FE --seeds=8 --gy=45
KOSMOS_QUIET=1 node src/testing/headless/balans-gate2-report.mjs --class=MEDIAN  --seeds=5 --gy=45
KOSMOS_QUIET=1 node src/testing/headless/balans-gate2-report.mjs --class=POOR    --seeds=5 --gy=45
# keeper (offline assertions):
node src/testing/smoke/balans_harness_smoke.mjs
```

---

## 1. What the instrument is & does

**BALANS 1.0 is an instrument, not a regulator.** It measures KOSMOS's early/mid-game economic curve by driving
the *real game systems* headless with a bot that plays like a competent player, so the measured curve reflects the
actual game code and constants — never a mock. When it finds something broken, it **logs** it; it does not fix it.
Phase 1's job was to build that instrument and establish that it is trustworthy. Balance tuning is Phase 3.

**Harness (real code paths, no render/UI):**
- `src/testing/headless/GameCore.js` — boots the real 4X systems exactly as `GameScene` does (same
  `SystemGenerator.generateCivScenario`, same systems, same `window.KOSMOS` service locator), minus renderer/UI/RAF.
- `src/testing/headless/Ticker.js` — manual `timeSystem.update()` loop (1 civ-year per tick).
- `src/testing/actions/ActionCatalog.js` + `ActionAdapter.js` — the bot↔game bridge (what's buildable/affordable;
  execute an action via the same events/methods the UI uses).
- `src/testing/bots/RuleBot.js` — the reference bot (adaptive priority ladder over live game state).
- `src/testing/headless/balans-gate2-report.mjs` — the game-year milestone report used for every panel below.
- `src/testing/smoke/balans_harness_smoke.mjs` — offline keeper (harness invariants).

**Reference bot:** an extended **RuleBot** playing Filip's **works-forward builder + explorer** archetype, solo,
deterministic per seed. `solo` neutralizes the rival-AI layer (no `EmpireGenerator` spawn → no aggression/war/invasion)
and disables `RandomEventSystem` (removes a non-deterministic confound), isolating the single-player economy.

**Seed panel:** `GameCore.PLANET_CLASSES` can inject a deterministic deposit/atmosphere/temperature shape onto the
home planet (`GOOD_FE` / `MEDIAN` / `POOR`) to isolate the economy from seed luck. Passing no class (or an unknown
key such as `--class=REAL`) skips injection → the **real** generated home distribution.

**Bot capabilities built in Phase 1** (all bot-heuristic, zero game constants):
- **Start-state parity** — `src/data/StarterLoadout.js` is the single authoritative t=0 definition (starter resources
  incl. `Fe:200`, boosted techs `orbital_survey/rocketry/exploration/metallurgy`, boosted build plan, `POP 16`).
  **Both** `GameScene` (real new game) **and** `GameCore` (harness) import it, so the harness start cannot drift from
  a real "New Game 2" (`civilization_boosted`). Verified identical t=0 across REAL/GOOD_FE/MEDIAN/POOR (loadout is
  deposit-independent).
- **Research** — progressive `ResearchSystem.queueTech` on the real UI path (non-blocking; queue only when a slot is idle).
- **Placement doctrine** — best-output terrain per building: mine → crater / volcano / mountain (mineral `yieldBonus`),
  solar → desert, coal → high-C.
- **Ship designs + engine upgrades** — scout, cargo, and colonizer built from real hulls/modules through the ground
  shipyard (S3.4d-legal `hull_small`); engine progression chemical → **ion** (`ion_drives`, rangeMult 2.5) → **fusion**
  (4.0), `hasTech`-gated (no faking). Scout/cargo/colonizer all select the best available engine; scout upgrade builds
  the better-engine hull then disbands the old one (`fleet:disbandRequest`).
- **Scout servicing loop** — recall a live `full_system` scout at ≤46% fuel (`RECALL_FUEL_FRAC=0.46`) **before** the
  game's fuel-stop (no stranding), dock, `manualRefuel`, re-dispatch. Strand-detect anti-spam.
- **Both colonization paths** — (a) POP-colonize a rocky world via colonizer + a goods bundle; (b) autonomous outpost
  via cargo → set droid order → found outpost with `autonomous_mine` (consumes a droid; gated on `automation` tech) →
  `autonomous_solar_farm` so the outpost is net-positive and self-mines.
- **Outpost → home shipping** — a bot-managed shuttle (`_outpostShuttle`: at outpost load + ship rare resources home;
  at home deadhead back), because the one-shot transport loop stalls after ~1 cycle.
- **Droid two-way juggle** — `_maybeReleaseDroid` before producing in the outpost path (dormant under the current
  labor surplus — see finding #1).
- **Fe-demand-aware mine scaling** — `_maybeScaleMines`: proactive baseline `max(2, factories)` + a Phase-3 demand
  branch (Fe draining ≥20/civ-yr **and** below `fe_working_buffer=1500` → +1 mine per `cooldown=4` civ-yr; cooldown +
  feLow + stop-on-not-draining prevent runaway).
- **Energy-demand-aware scaling** — `_maybeScaleEnergy`: scale energy producers to the **live** `energyBalance` toward
  `energy_reserve=5`, with `_pendingEnergySupply` (in-progress producers) as an overshoot guard; `_bestEnergyBuilding`
  = solar/desert by default, coal when desert is exhausted and C is healthy.
- **Shared build-or-burst primitive** — `_burstMissingCommodity` (used by *both* mine and energy scaling): when a build
  is blocked purely by a short **commodity**, fire a one-shot factory burst (what a player does); **honest** — it
  yields when the block is a short **raw** (Fe/Si/Cu — mines make those) or an un-makeable recipe, so it never
  monopolizes decisions futilely.

---

## 2. Validated scope

**A real new-game home is ALWAYS Fe-richness 1.0.** `generateCivScenario` picks the best rocky planet in the habitable
zone; the rocky composition template is **Fe 22%** (`ElementsData.PLANET_COMPOSITIONS.rocky`), Fe is rarity 1, and
deposit richness `= clamp(Fe% / 2, 0.1, 1.0)` **saturates at just 2% Fe**. Measured across **12 real seeds: Fe richness
min = max = 1.0** (remaining 102k–147k, all rocky/breathable). A sub-1.0-Fe *home* is impossible to generate.
**Therefore `GOOD_FE` (Fe 1.0) = a real home**, and the injected classes `MEDIAN` (0.6) / `POOR` (0.3) correspond to no
possible real home — they model **secondary/colony-grade worlds** (see §4).

**The bot plays Filip's economy end-to-end from a real start on 7 of 8 real-generator seeds.** Real generator, 8 seeds,
45 game-years:

| metric | result |
|---|---|
| founded ≥1 outpost | **7/8** |
| founded a 2nd (POP) colony | **7/8** |
| energy holds (final ≥ 0) | **7/8** |
| science ship (median) | **3.0 gy** |
| colonizer (median) | 7.1 gy |
| 2nd colony (median) | 9.5 gy |
| POP deficit (median) | 4.6 gy |
| bodies explored (median) | 29 / 48 |
| final Fe (median) | ~32,000 |
| crashes | 0/8 |

**The earlier "GOOD_FE 5/5" was a 5-seed undersample.** Re-run at 8 seeds, injected **GOOD_FE is also 7/8** — it fails
the *same* seed (seed_7) with the *same* deadlock. So the true real-home rate is **7/8, confirmed on both the injected
GOOD_FE panel and the real-generator panel**; injection never masked the failure. This 7/8 is the honest instrument
boundary — it is **not** reported as 8/8.

---

## 3. The 1/8 boundary — seed_7 (documented, not fixed)

On seed_7 the bot hard-deadlocks: no science ship, 0 outposts, reach 0/63, `energyBalance` stuck at **−25**, and it
**waits ~97% of its decisions**. Fully traced:

1. seed_7's **starter solar auto-places on low-yield tiles** — its two starter solar farms output **Σ20.8** vs seed_1's
   **Σ32.0** (solar output = `terrain.yieldBonus × latitudeModifier × level`; **no** insolation/temperature term, so this
   is per-grid tile luck, not a stellar/temperature effect). Opening energy is therefore negative from t=0 (production
   21.84 vs consumption 20.44 → +1.4, then −7 once the opening mine+factory land).
2. With energy negative, energy-scaling (priority, runs before mine-scaling) repeatedly **bursts solar's commodities**,
   which the reactive factory makes **from Fe** — consuming the lone mine's Fe output.
3. The mine baseline is thus starved of both decision-slots and Fe; the single mine's output is fully eaten by the
   factory; **Fe stays pinned ~10–34, below the mine cost (Fe:20) and solar cost (Fe:15)** → nothing new can be built.

**Classification: a known-class BOT-POLICY gap, not balance, not a deposit effect.** It is the **factory-pacing /
Fe-contention** gap carried since take-2 ("the bot never pauses the reactive factory") — the same mechanism as
Phase-2 finding #2 below, now surfacing on ~1/8 real *homes* (via unlucky starter-solar placement) instead of only on
`MEDIAN`/`POOR`. The game state is **recoverable in-game** (seed_7's home has 28 free desert tiles and a rich Fe
deposit; a player would simply build more solar or pause the factory). A minimal one-line fix (decoupling the mine
baseline from the `energyBalance ≥ 0` gate) was tested and **ruled out** — the baseline is starved by the
higher-priority energy-commodity-burst plus the factory Fe drain, not by that gate; a real fix needs a non-minimal
reorder or a factory-pause-when-stuck heuristic, which is Phase-2 scope. **Left unfixed by decision** (this was a
close session, not a fix cycle).

---

## 4. Explicit boundaries — what Phase 1 does NOT cover

- **`MEDIAN` / `POOR` are secondary-colony stress scenarios, not starts.** A real home is always Fe 1.0 (§2); the
  `MEDIAN`(0.6)/`POOR`(0.3) *home* deadlocks are the secondary-colony bootstrap problem wearing a home costume. Their
  real-play solution is a pre-shipped resource bundle (a manoeuvre the bot lacks) — deferred to Phase 2. They stay in
  the panel for economic contrast only.
- **Idealized baseline.** `solo` = no rival economies, no diplomacy/war/invasion, `RandomEventSystem` off. The measured
  curve is the isolated single-player economy, not a contested game.
- **One archetype only.** The reference bot plays the works-forward builder + explorer. Rusher / turtle / under-combat
  are separate future curves.
- **Deferred fuel-refinery / fuel-transport chain.** Far bodies that need a fuel-transport relay to reach remain
  out of scope (the bot reaches the near/mid field on the real generator; the deep field is a Phase-2+ concern).
- **Mine-SHAPE debt.** The Fe scaler scales by mine *count* (many Lv1), because the headless upgrade path is broken
  (`catalog.listUpgradeActions` returns 0 via a bad grid accessor). Fe *output* is equivalent, so the loop works, but
  it is not Filip's actual ~4×Level-2 shape. This matters for Phase-2 building-ROI measurement and needs the upgrade
  path repaired first.

---

## 5. Phase-2 findings queue (candidates surfaced by the instrument — NOT adjudicated, do NOT fix)

> **Update (Phase 2, POP slice):** finding **#1 was adjudicated and DROPPED** — 88% of surplus-years are a healthy
> buffer, the raw signal was counting buffered POP as glut. A **new** candidate ("ballooning" regime, 2/8 seeds)
> took its place, and seed_7 (§3) turned out to be finding #2 seen from the POP side. Record + numbers:
> **`docs/BALANS_PHASE2_POP.md`**. The list below is left as written for Phase 1's historical record.

1. **POP-glut.** Every class/year shows unfilled-jobs = 0 with a growing labor surplus; POP never binds. Matches
   Filip's lived observation ("POP grows too fast, nothing to do with them"). **Top candidate.** Also why
   droids-by-yr6 = 0 — there is no labor scarcity to fire the droid-install signal, so the droid economy is dormant
   (instrument working as intended, not a bug).
2. **Factory-pacing / Fe-contention.** The mine that produces Fe costs Fe you don't have; the reactive factory pins Fe
   below the next Fe-producer's cost. Surfaces on `MEDIAN`/`POOR` and on ~1/8 real homes (seed_7, §3). Real-play fix =
   more solar / pause the factory / pre-ship a supply bundle. Whether the bundle-need is a balance property or just a
   missing bot manoeuvre is the Phase-2 question.
3. **POOR-class survivability.** The poorest worlds never build a scout (Fe ~0.3 + thin-atmosphere food-starvation).
   Balance finding or bot-manoeuvre gap — TBD.
4. **Fleet-upkeep Kr drain.** Each productive outpost spawns ~2 cargo ships, draining credits hard (one seed 503 → 71
   Kr). This is the real cost of the shipping doctrine — measure it in Phase 2.

---

## 6. Resolved in Phase 1 (in the bot's favor — not balance problems)

- **Ships are gated by POP, not Fe** — the earlier "Fe-starve blocks ships" reading was a placement/POP artifact.
- **Droid pricing is healthy** — no desired→attainable gap when the loop runs; droids are dormant only because of the
  POP-glut (finding #1), not because they are mispriced.

---

*Phase 1 closed on the honest 7/8 real-home boundary. The instrument is trustworthy for what it measures — the
early/mid-game curve from a real start. Phase 2 (findings adjudication + any balance tuning) is a separate scope and
is not begun here.*
