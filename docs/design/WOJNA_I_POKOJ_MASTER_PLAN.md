# WOJNA I POKÓJ 1.0 — master plan

**Status:** living roadmap · **Last update:** 2026-08-14
**Basis:** `docs/audit/COMBAT_DIPLO_AUDIT.md` (2026-08-05 — **partly superseded**, see `W1_PLAN.md`
§Corrections K-1/K-2/K-5/K-6) · **Companion docs:** `DIPLOMACY_BACKBONE.md` (done),
`WAR_BACKBONE.md` (**signed 2026-08-13**), `REACTION_DIRECTOR.md` (pending), per-phase plan docs.
**Phase docs in repo:** `D1_AUTONOMOUS_REPORT.md` · `D1_LIVE_GATE_CHECKLIST.md` · `D2_PLAN_SKELETON.md` ·
`D2_PLAN.md` (+ `D2_E3/E5/E6_GATE_CHECKLIST.md`) · `GALAXY_SEED_PLAN.md` (+ its gate checklist) — all in `docs/design/`.

## Vision

A living galaxy: multiple AI empires with real economies, real militaries, and real
diplomacy. AI accepts or refuses based on relations, power, personality, and interest —
Victoria 2 / CK style, with a visible acceptance breakdown. The player, surrounded,
has to scheme: alliances, tribute, betrayal, conquest. MOO 1/2 flavor: personality ×
objective empires, ramping treaties, threats, (later) a Galactic Council endgame.

## Completed

- **Audit** — full combat/AI/diplomacy inventory (2026-08-05). Headline: the AI military
  layer was inert (dead code reading deleted fields), diplomacy "always yes" on peace and
  envoys, zero combat→diplomacy wiring, materialized AI fleets unarmed.
- **Phase 0a — AI economy repair (post-Population-2.0).** Done. AI develops and colonizes
  again; expansionist archetype fixed alongside industrialist. BALANS harness extended
  with AI-empire instrumentation (metrics, decision logs, health thresholds) — now a
  permanent regression check.
- **DIPLOMACY_BACKBONE.md** — three-layer design approved: relations model
  (modifier-stack opinion + tension + timed truce + global reputation), Acceptance Engine
  (one evaluator, visible breakdown), verbs as plugins. AI↔AI symmetric, intel-gated.
  MOO imports: objective axis, ramping treaties, threaten verb, erratic trait.
- **D1 — relations model + migration + opinion UI. DONE, live gate PASSED 2026-08-06.**
  `trust`/`hostility` (audit R8) replaced by pair-wise relations: modifier-stack opinion
  (computed, never stored), tension, timed truce (fixes R7 — truce was terminal), memory ring,
  reputation ledger, empire `objective`/`traits`. Save **v99 → v100**. Overlay shows the full
  opinion breakdown. Modifier decay ships **off** behind `FEATURES.diplomacyDecay` — old `trust`
  never decayed, so enabling it in D1 would have been a balance change; the flip is D2's.
  Commits `ae223c7` → `70a3a16`, plus `0b9328d` (pre-migration file backup) and `0b15d95`.
  365 assertions across 6 new smoke suites; sweep 103/103.
  Two findings from the gate:
  1. **`objective` PRNG degeneracy — fixed** (`0b15d95`): a fresh mulberry32 seeded per empire from
     near-consecutive integers, read on its first draw, collided for both empires. Fixed with a
     splitmix32 finalizer + one warmed stream per galaxy; variance now pinned by tests.
  2. **Constant galaxy seed — carried out as a separate task, now fixed and gated** (`e0615bd`; see
     GALAXY_SEED below). Root cause of the symptom that surfaced (1), and wider: before the fix
     every new game got an identical galaxy — identical star names/positions/spectral types,
     identical AI home systems and empire names.
     ⚠ Corrected after the scoping audit: empire **colours and archetypes are NOT seed-derived**
     (colour comes from the archetype, id from the loop index), so the fix will not change them.
     The player's own home system is **already** fully random today — only the galaxy around it is
     constant, which is why nobody spotted this.
- **GALAXY_SEED — DONE, live gate PASSED 2026-08-07.** Entropy now enters once at world creation:
  a new game rolls a random galaxy seed and **stores it in the save**; everything downstream derives
  from the stored seed exactly as before. Gate evidence: two fresh games ⇒ seeds **−1652911923** and
  **131797258** with different galaxy fingerprints, empire names, AI home systems and objectives;
  the same file reloaded ⇒ bit-identical galaxy; a legacy save kept its seed **−2102099243**.
  Colours and archetypes identical across runs — **by design, not a defect** (they are derived from
  the archetype sequence, never from the seed). Save stays **v100** (no bump: the `seed` field always
  round-tripped, only its *source* changed). Commits `e0615bd` (code + 65-assertion keeper),
  `615eb63` and `b5fea08` (docs). Headless reproducibility preserved by the explicit
  `HEADLESS_GALAXY_SEED` pin, so BALANS baselines are bit-identical.

- **D2 — Acceptance Engine + retrofit of all six player actions. DONE, phase CLOSED 2026-08-10.**
  Three live gates, all PASSED (E3 08-08 10/10 · E5 08-10 10/10 · E6 08-10 11/11). Nine commits
  `ef35af7` → `c0d89e5`; save stays **v100 with no migration for the entire phase** — nothing the
  engine needed turned out to require new persistent state (`verbCooldowns` rode `?? {}`, the
  `bordersOpen` pattern from D1).
  **What shipped:** one evaluator (`AcceptanceEngine`) behind every proposal in both directions,
  with a breakdown the player can read. `"always yes"` is over — **peace and the envoy can be
  refused**, which is the audit's R5 (they had no decision point at all, not even a hardcoded
  `true`), and `casusBelli.peaceCost` got its first reader in the codebase. Refusals now *explain
  themselves and cost something*: the modal renders the acceptance breakdown verbatim and
  `recent_refusal` ends button-spamming. The `objective` axis became real — six agendas move both
  the threshold and the weight of sympathy — and the `erratic` trait finally gets rolled, from its
  own per-empire stream. Modifier decay was lit, with every diplomacy time constant unified to
  **displayed game years**, so the panel's "fades in N" is finally a number in the player's own clock.
  The `getTrustEquivalent` bridge D1 left behind is deleted (it had **four** callers, not the three
  the plan predicted).
  **Four findings worth carrying forward.**
  1. **Parity impossibility (E2).** Converting the old 60/75/80 thresholds into weights is
     *impossible* while personality is a weighted term: parity forces `O ≥ 8·P`, scale-invariantly,
     which crushes every other term into noise. Personality was therefore never a weight — it was a
     **hard gate**, and became a `personalityFloor` precondition. `diplomacy_d1_smoke` passing
     **83/83 unedited** is the proof. The D4 consequence (`gift`/`offer` vs absolute floors) is
     recorded under D4 below.
  2. **Two signed properties collided, twice — and both times the property was NARROWED to a
     reference point rather than loosened.** E5's gate thesis ("same archetype, different agenda ⇒
     measurably different acceptance") directly negates E2's parity anchor ("boundary 10/25/30 for
     *every* agenda"); resolved with a **reference agenda** (`merchant` gets no override, so the old
     thresholds are reproduced *to the point* while five agendas spread around them). E6 hit the same
     shape: "light the decay without changing the felt tempo" turned out to be **empty** for the
     flag-gated rates, because measurement showed they had never run at all — their felt tempo was ∞,
     not the "0.42 displayed years" the plan had computed. Narrowed to *mechanisms observable in the
     shipped build*, with two reference points reproduced to the digit (ramp 0→+50 = **4.167**
     displayed years, tension 30→0 = **0.5**). **This is now the house move for moving a signed
     property: narrow it to something that still proves the original thesis, and sign the narrowing.**
  3. **The envoy decided E6's balance (§B5).** Its mission spans 5.0 displayed years with goodwill
     legs at +2.5 and +5.0 and an `accumulate` mode documented to sum them. Measured: under the
     naive "preserve felt tempo everywhere" variant the first leg **expires before the second lands**
     — the mode has nothing to sum, which is precisely the fear that kept the flag off in D1. Under
     the shipped choice the legs compound (5 → 2.5 → **7.5**; the shortfall from 10 is decay taking
     its toll on the way home, and correct). Measurement beat arithmetic here in general: the tick
     steps in *whole* civ years and entries vanish below an epsilon, so two rows of the plan's own
     computed table were wrong.
  4. **Gates keep finding pre-existing debt rather than regressions.** E3 revealed that a *concluded*
     peace had never had a Journal entry (only state subscribers), fixed in E4; a recovery audit after
     a lost session found the required threshold rendering as **−0** in every peace refusal and
     auto-peace reporting an offer the player never made, both fixed in E4e; E6's unit sweep found
     **three comments lying about their unit** (`ULTIMATUM_GRACE_YEARS`, `TRESPASS_YEARS`,
     `AI_ENVOY_COOLDOWN` were all *already* in displayed years — the code had been running 12× longer
     than it documented) and one panel counter reading a pasted literal `3` instead of the engine.
  **Closing items:** E8 gated `_onColonyFounded` on `ownerEmpireId` — AI colonisation had been
  charging *the player* with tension and a `territorial_violation`, even when an AI colonised its own
  system. E9 retired the `kosmos_save_backup_v{N}` write: a key with no read path in the game, the
  weight of a whole save, and deleted *first* under quota pressure — the guaranteed recovery path is
  the `.json` file on disk. Both shipped with fail-first-proven pins.

- **ReactionDirector Slice 1 — DONE, GATES 1-3 PASSED (2026-08-11 / 2026-08-12 / 2026-08-12).**
  Plan `DIRECTOR_SLICE1_PLAN.md`; gate scripts `DIRECTOR_S4_GATE1` / `S5_GATE2` / `S6_GATE3`.
  Shipped: **rule skeleton** (declarative `trigger → guard → roll → delay → response`, three name
  registries, state per `(rule, empire)` in `gameState.director`) · **influence map** (runtime-only,
  claimed vs 5 LY border shell, disjoint by construction) with R-2's coverage measurement
  (**17.7 %** across 4 seeds) · **template catalog v1** (Filip's three frigates + probe) with a
  resolver and its **inversion** (`matchTemplateId`) · **AI warship production** through the real
  economic path (`startShipBuild` → `shipQueues`/`pendingShipOrders`), gated by an orbital-station
  **permission token** (R-3), with a 3-year TTL so an order can never become a ghost ·
  **first-contact chain** (observatory L5 → cumulative roll → probe flyby across the player's
  system → the Director takes over the narrative beat → `first_contact_kill` if shot down) ·
  **military pressure L1-L2** on the **opinion** channel with escalation window and a defensive
  posture. Save **v100 with zero migrations across the whole slice** — a structural property
  (every new default shape is empty), not luck. Sweep 114 → **123** keepers.
  Five findings that outlived the slice:
  1. **"An unstamped ship is the player's" (V3c).** An AI-built warship left the yard with no owner,
     and because `isEnemyVessel` is a truthiness test, *no owner* reads as **the player's ship** —
     it showed up in the player's fleet and upkeep. Fixed structurally (own stamp on `vessel:created`,
     no `hull_small` filter), and the class is worth remembering: ownership must be stamped at
     creation, never inferred from absence.
  2. **A declared unit the engine never enforced.** `roll.unit: 'displayedYear'` was validated *to
     the letter* while `rollFires` counted only attempts and `tickEmpire` runs per **civ** year —
     so a 10 %/+10 pt curve saturated in **0.83** displayed years instead of ~3.7. Signed Decision 2
     would have been **dead on arrival, silently**. The engine now gates one attempt per displayed
     year; every rolled rule inherits it.
  3. **Feed isolation — three layers of one defect.** AI shipyard, AI vessel and finally AI *colony*
     events reached the player's Journal unfiltered: free intel bypassing the intel layer. The audit
     that closed it overturned its own sizing — **78** Journal-writing subscribers, not 44; three of
     six named suspects were not leaking, while three unlisted ones were, including `civ:epochChanged`
     which rendered **an AI empire's epoch advance as the player's own**. Product: a classification
     table of all 78 (18 gated / 36 player-scoped by construction / 24 global-by-design).
  4. **A ladder rung needs a predecessor guard, not just a higher threshold.** L1 and L2 roll
     independently and the engine evaluates every rule every tick, so under heavy pressure L2 could
     win its roll *before* L1 ever fired — an empire's first-ever incident came in at L2. Both
     working hypotheses (state keyed per-rule; escalation ticking independently) were **wrong**;
     the cause was found by reproducing it headless. Every future L(n)→L(n+1) pair needs the guard.
  5. **Four AI-economy findings, filed to WAR_BACKBONE/BALANS** — none of them Director's to fix:
     **freePops steady-state zero** (full employment is the designed state for AI colonies, so the
     hard crew gate refuses warships indefinitely) · **demand for non-manufacturable commodities**
     (the economic coupling asks for `warp_cores`/`metamaterials` a colony factory cannot make,
     while the *ores* that actually block are skipped) · **dormant couriers** (the only pre-existing
     AI caller of `startShipBuild` never fired once in 4 seeds × 400 civYears — Director is its
     first real user) · **expansion runs on two schedules** (outposts from civYear ~85 and recurring,
     full colonies only around ~456 — the "AI founds nothing" diagnosis was overturned in its strong
     form once the probe horizon was extended).

- **W1 — repairs & foundations. DONE, all three gates PASSED 2026-08-14.** Eleven commits
  `ee189ba` → `3b07e27`; save stays **v100 with no migration across the entire slice** — the same
  structural property Director Slice 1 had, and for the same reason: nothing W1 needed turned out to
  require new persistent state.
  **What shipped:** the R2 estimator repair · `ThreatAssessment` as a **pure read-model** computing
  strength from real hulls (`CombatValueData` prices FIELDS, never module ids, so a third armour type
  needs no code) · four blind consumers wired · `relative_power` **un-stubbed after sitting at a
  literal zero since D2/E1** · a **skirmish** category making the accounting fork exhaustive ·
  EAH redirected through `recordBattle` · two doctrines on posture · the courier latch given an exit ·
  `FLEET_AGGRO_INTERVAL` deleted. Sweep 123 → **129** keepers.
  **Six findings worth carrying forward.**
  1. **K-1 held, and the danger came in by a different door.** The warning copied through four
     documents — "repairing R2 pushes empires into AGGRESSIVE/WAR" — is false, and W1-0 proved it by
     execution: `milRatio ≡ 0` before *and* after, because the **numerator never existed**. But wiring
     the numerator alone would have caused exactly that catastrophe by a route nobody predicted: a
     **unit mismatch** (HP-scale numerator over a heuristic denominator), and then, once both sides
     used one unit, a **zero denominator** (`playerMil > 0 ? … : 1.0` puts an empty player fleet
     *above* the war threshold). Hence `PLAYER_DEFENSE_BASELINE_HP` — a balance knob that exists for
     a structural reason. *A refuted warning is not the same as a safe change.*
  2. **A signed term shipped pointing the wrong way, and the matrix could not see it.**
     `relative_power` went live as "+1 = evaluator STRONGER", inverting `DIPLOMACY_BACKBONE §2.1`
     ("weaker side more agreeable"): a dominant AI signed everything and, on `offer_peace`, a
     **winning** empire grew more willing to settle. Ruled a **spec contradiction, not a balance
     knob** — the D2 weights were authored against a stub returning 0, so the *direction* had never
     been validated. Fixed in W1-3b, magnitudes untouched.
     ⚠ **The E7 matrix is structurally blind to this class of error**: it holds strengths equal in
     the base context and stores probe impact as an **absolute** value. It returned 0/210 before and
     after the flip. Direction is pinned by keepers only.
  3. **E7 measures weights, not dynamics.** The same 0/210 came back for W1-4 and W1-4b, and was
     equally correct: those commits change how fast exhaustion *accrues*, while the matrix pins
     exhaustion at 45/45 by construction. Three separate times the instrument was the wrong lens and
     the runtime measurement was the right one. Worth knowing before D4 tunes anything with it.
  4. **The accounting fork had a third, silent path — and closing it changed the game.** EAH emitted
     `battle:resolved` with a real `warId` yet bypassed `recordBattle`, so orbital attacks in a
     declared war credited **zero** exhaustion and never appeared in `war.battles[]` — which meant D2
     systematically **underpriced peace in exactly the wars being fought**. Gate 2 saw exhaustion go
     0 → 100 on screen where it had been permanently zero. A fourth path nobody listed (EAH's
     "could not declare war" branch, which persisted nothing) was closed in the same commit.
  5. **Winning and losing must not cost the same.** Gate 2 measured the player winning every battle
     80:5 and fatiguing identically to the empire being destroyed — the same inversion as finding 2,
     one layer down. W1-4b split exhaustion into a small base for both plus a larger share for the
     **battle loser**, classified strictly by `winner` and never by `lossesA/B` (those carry the
     HP-delta vs vessel-count unit collision).
  6. **Idle-by-design looks identical to unassigned.** A garrison holds position by *not* receiving
     an order, so it still read as "idle" — the patrol rule kept poaching it, and the roster was
     *overwritten* rather than merged, producing permanent churn and orphaned veterans. Both found by
     running the gate one-liners on the live engine before writing them into the checklist.
  **Two constraints discovered about the harness itself**, both now binding on later slices: the
  headless harness never mounts `stationSystem`, so AI warship production is structurally blocked
  there (every W1 keeper spawns enemies by hand); and the courier premise remains **unmeasurable** —
  0 outposts over 400 civY × 3 seeds, with not even a `cannot_afford_outpost` attempt.

## Workstreams

### A. Diplomacy backbone (D1–D5) — see DIPLOMACY_BACKBONE.md §5

- **D1** Relations model + migration + opinion-breakdown UI — ✅ **DONE** (gate passed 2026-08-06)
- **GALAXY_SEED** (standalone mini-stream, **between D1 and D2 implementation**) — ✅ **DONE, gate
  PASSED 2026-08-07 (4/4).** Commits `e0615bd` (code + keeper, 65 assertions), `615eb63` and
  `b5fea08` (docs); G3 resolved without running (Decision 2 → no version bump). Gate result recorded
  at the end of `GALAXY_SEED_GATE_CHECKLIST.md`. **D2 is unblocked.**
  Entropy enters once at world creation: a new game
  rolls a random galaxy seed, **stores it in the save**, and everything downstream derives from the
  stored seed exactly as today. The determinism contract is *"deterministic given a seed"*, not
  *"identical across new games"*. Golden pins are unaffected — tests pass explicit seeds. Save stays
  **v100** (no bump: the `seed` field always round-tripped; only its *source* changed — exception
  note recorded in `SaveMigration`). Gate: two fresh games ⇒ different empire **names, AI home
  systems and objectives**; the same stored seed reloaded ⇒ identical galaxy.
  ⚠ **Colours and archetypes stay identical and that is NOT a defect** — colour comes from the
  archetype, archetype from the loop index; neither is seed-derived (Korekta 1 in the plan doc).
  ⚠ Hard constraint, held: an existing player's galaxy does NOT change on load. Headless
  reproducibility preserved by an explicit pin (`HEADLESS_GALAXY_SEED` = the old constant), so
  BALANS baselines are bit-identical.
- **D2** Acceptance Engine + retrofit of all 6 player actions (ends "always yes") — ✅ **DONE,
  phase CLOSED 2026-08-10.** Three gates PASSED (E3 · E5 · E6). Commits `ef35af7` (E1) · `27dd7a6`
  (E7) · `b8b3e08` (E2) · `e011017` (E3) · `9f166a4`+`10175c3`+`d473bcd`+`56de88d` (E4) ·
  `fc284c2`+`b75fe3e`+`db22a80` (E4e) · `6c7ea3d`+`d7ff7b5` (E5) · `38c1450`+`b075221`+`00484a5`+
  `2ca7d0c`+`7a8427e`+`894a161` (E6 + calibration) · `7d78da5` (E8) · `c0d89e5` (E9). Gate results
  recorded in `D2_E3_GATE_CHECKLIST.md`, `D2_E5_GATE_CHECKLIST.md`, `D2_E6_GATE_CHECKLIST.md`;
  per-commit table and all 16 implementation findings in `D2_PLAN.md`. Save **v100, no migration**.
  Full summary under Completed above.
- **D3** Borders, trespass incidents, influence map (claimed space + border zone)
  ⚠ **CORRECTED 2026-08-10 — ruling R-2 (Filip).** This line used to say *"claimed + 1-jump border
  zone"*. **"One jump" has no galaxy-side definition in this codebase:** `WarpRoutePlanner` builds
  edges on the fly from `warpDist3D(a,b) ≤ maxHopLY`, where `maxHopLY = warpFuel.max /
  warpFuel.consumption` — a property of *the vessel*, so two ships see two different graphs.
  The border zone is therefore a **radius in light years: 5 LY** around AI territory; claimed space
  keeps the existing `TERRITORY.R_MIN_LY 1.5 → R_MAX_LY 4.0` radii. The map is built in Director
  Slice 1 (**S2 ✅** — `InfluenceMap` + `InfluenceMath`, runtime-only) and D3 consumes it.
  ⚠ **The 5 LY constant was measured (17.7 % coverage across 4 seeds) and hardened — but its
  shelf life is short.** Three corrections landed after the measurement: the probe's 400-civY
  horizon stopped just short of AI expansion; full colonies appear around ~456 civY; and
  **outposts — which `TerritoryService` counts toward zones at `R_MIN_LY 1.5` — start as early as
  civYear 85** and recur (85/140/155/160/185 in one run). The projection reaches **46 % at 6
  systems per empire and 58.7 % at 8**, so `BORDER_LY` **must be re-measured over ≥60 displayed
  years**, counting outposts separately from colonies, before D3 leans on it. Details:
  `DIRECTOR_SLICE1_PLAN.md` §Rulings R-2.
- **D4** Verb batch 1: gift, denounce, threaten, NAP duration, alliance mechanics,
  war CB + reputation, peace terms (consumes `peaceCost`)

  **Ruling carried in from D2/E2 — `personalityFloor`: absolute vs priced.** E2 proved that a
  weighted `personality` term cannot reproduce the old acceptance conjunction (parity forces
  `O ≥ 8·P` — scale-invariant — which crushes every other term into noise), so archetype
  disposition became a *hard floor* precondition on the three treaties. That makes it binary:
  no sweetener can move it, which collides with `gift`/`offer` landing in D4. **The decision is
  PER-ARCHETYPE, not global.** Default direction: floors become **expensive negative terms**
  when `gift`/`offer` arrive — CK/Victoria spirit, everything has a price, sometimes an absurd
  one. Exception: **`xenophage` and `swarm` MAY keep absolute floors** as cultural identity
  ("nature forbids"), which no sweetener overrides. Mechanism to implement:
  `personalityFloor: absolute | priced(weight)`; the per-archetype values are decided at D4
  implementation time **with the acceptance matrices in hand** (E7's `diplomacy` metric), not now.
- **D5** Verb batch 2 (tech_exchange, tribute, embargo, trade ramping) + AI↔AI activation

### B. War backbone — ✅ **doc SIGNED 2026-08-13** (`WAR_BACKBONE.md`), phases W1–Wn interleave with D3/D4

Owns everything between war declaration and the peace table.

- **W1 — repairs & foundations. ✅ plan APPROVED 2026-08-14** (`W1_PLAN.md`), implementation pending,
  starts at commit **W1-0** of nine. R2 fix → derived-strength read-model → shared ThreatAssessment →
  un-stub `relative_power` → skirmish category + EAH accounting → two doctrines on posture → courier
  latch fix → `FLEET_AGGRO_INTERVAL` deletion. Save **v100, no save-model changes** (P7). Three gates.
  Fourteen decisions signed; **no re-litigation**.
  </details>
  ⚠ **Two audit refutations bind every later reader** (`W1_PLAN.md` §Corrections, and folded into
  `WAR_BACKBONE.md` §2 P2): **K-1** — repairing R2 does **NOT** move `milRatio` and cannot push empires
  into AGGRESSIVE/WAR; the *numerator* `empire.military.power` was deleted by the Slice-1 refactor and
  `createEmpire` silently drops it, so `milRatio ≡ 0` before **and** after. The warning repeated in this
  file, in `COMBAT_DIPLO_AUDIT` R2, in `D2_PLAN` K-1 and in `DIRECTOR_SLICE1_PLAN` decision 5 is **wrong**;
  two in-repo comments carry the same error and are corrected in W1-1. **K-2** — P2's transition is
  **void**: `empire.fleets` is always empty in normal play, while AI already owns real ownership-stamped
  warships since Director S4/S6 — live military assets with no abstract representation at all.
- **W2 — the deploy model (P4)**, own plan doc, own gate, likely the first save bump since v100.
- **W3+ — offensive AI & territorial peace** (§6a, signed 2026-08-13).

The doc covers:

1. **MilitaryBrain** — AI fleet decision layer: target selection, defend vs raid vs
   invade, retreat logic, defensive postures (e.g. homeworld orbital garrison as a
   persistent stance).
2. **AI military economy** — production share for shipyards, buildup triggers (arms
   race), defense buildings + ground units in AI build priorities (audit R11).
3. **Ship construction & templates** — which hulls with which modules. AI ships are
   REAL vessels built from modules. Template format + catalog per hull class and role
   (Filip authors templates; example: frigate = hull_frigate + warp drive + warp core
   cell + standard armor + 2× kinetic, fallback 1× kinetic on capacity). Templates
   should be tech-aware (better modules as empire tech grows) and archetype-flavored.
   ⚠ **SUPERSEDED 2026-08-10 — ruling R-1 (Filip).** This bullet used to read *"spawned instantly
   when resources + criteria are met (no physical build queue)"*, which contradicted this same
   workstream's *"scripts order, economy executes"* (§B.3 intent, restated in §C Slice 1): an instant
   spawn leaves **no queue for intel to observe**. The original ruling was motivated by avoiding new
   queue machinery; the Director Slice 1 audit found the machinery already exists and works
   (`ColonyManager.startShipBuild` → `shipQueues` / `pendingShipOrders`). **The economy executes.**
   ⚠ Second-order finding worth carrying into this workstream: the AI-side caller that "proves" the
   path (`EmpireLogisticsSystem:209`) **never fires in practice** — measured over 4 seeds × 400 civYears,
   zero courier builds, because courier routes require outposts and the AI founds none. The path works;
   it simply has no live consumer today. Rationale, the measurement table and the three hard requirements
   this imposes on Director S4 are in `DIRECTOR_SLICE1_PLAN.md` §Rulings + §Wyniki weryfikacji.
4. **Threat assessment** — one shared module read by both war and diplomacy
   (fix of audit R2 lives here).
   - *Carried in from D2/E6 (dead-code deletion, not a conversion):* `WarSystem:39
     FLEET_AGGRO_INTERVAL = 5` ("co ile lat AI wysyła flotę") is dead — that declaration is its
     only occurrence in `src/`, the logic having moved to `MilitaryAI`. E6's unit sweep found it
     while inventorying every `*_YEARS` constant and deliberately left it alone: there is nothing
     to unify in a constant nobody reads. Delete it when `MilitaryAI` is rebuilt here.
5. **Fleet model reconciliation** — abstract `strength` ⇄ concrete vessels, two-way
   (audit R10): DSCS losses write back as strength percentage.
6. **War accounting unification** — DSCS battles feed WarSystem (`warId`, exhaustion —
   audit R6); decide the single source of truth for war state.
7. **Space combat depth** (later chapters of the same doc): repair, salvage/loot,
   ship capture, DSCS tactical depth.
8. **Post-conquest costs** — pop loss, unrest/occupation, building damage; peace-term
   territory transfer (original arc Phase 3, folded here).

Settled constraints: DSCS stays player-only; AI↔AI combat resolves on abstract
BattleSystem; ground combat RNG gets seeded (audit R13) when touched.

### C. ReactionDirector — scripted behavior layer (doc pending)

Declarative trigger→response rules, personality-parameterized, with cooldowns and
escalation. Gives the game *dramaturgy* on top of systemic AI.

- **Slice 1 — ✅ DONE. All three gates PASSED (2026-08-11 / 2026-08-12 / 2026-08-12).**
  Retrospective + the five findings: see §Completed. Slices 2–3 remain unscoped. Plan doc: `DIRECTOR_SLICE1_PLAN.md`
  (approved 2026-08-10; eight decisions signed + owner rulings **R-1**…**R-4**). **Read its
  §PLAN NA JUTRO block first** — it carries the binding order for the next session.
  Progress: **S0 ✅** `e9f1853` · **S1 ✅** `31bd81b` · **S3 ✅** `4755f19` (Filip's frigate
  catalog + resolver with the capacity validator nobody else in the repo performs) ·
  **S2 ✅** `365ac53`+`aee8218` (R-2 measurement = **17.7 %**, then the influence map) ·
  **3D prerequisite ✅** `3596c0c` · **S4 ✅ + GATE 1 PASSED** (`8006ceb` foundation ·
  `499ff7b` station-token seed + AI combat tech · `9bebe0d` `queueWarships` · `0ff5b50`
  ownership fix · `1ee9a99` crew lever · `831a3e7` Journal isolation) ·
  **S5 ✅ + GATE 2 PASSED** (`2bd9dc2` first-contact chain · `c3aae2c` mesh-after-load + kill levers) ·
  **S6 ✅ + GATE 3 CONDITIONAL PASS 2026-08-12** (military pressure L1-L2, the slice finale) —
  three non-negotiables green live on both empires, success path proven (3× `hull_frigate` = the
  exact L2 loadout); the one condition was an **escalation-semantics defect, now fixed and awaiting
  Filip's re-check**. S7 pending.
  ⚠ **A ladder rung needs a guard, not just a higher threshold.** L1 and L2 are independent rules
  that roll independently, and `DirectorSystem` evaluates every catalog rule every tick — so under
  heavy pressure L2 was eligible from the first tick and could win its roll *before* L1 ever fired
  (measured: seeds `emp_D`/`emp_G` opened at L2, and both rules could fire in the same year).
  Neither working hypothesis held: the state key is already per-(rule, empire) and the escalation
  window correctly rejects a null `lastFiredYear`. Every future L(n)→L(n+1) pair needs a
  predecessor guard.
  ✅ **S4's condition is LIFTED** — the third layer of the Journal leak (AI **colony** events:
  famine, unrest, population) is fixed in `11abd0c`. The audit that closed it **overturned the
  sizing**: 78 Journal-writing subscribers, not 44; three of the six named suspects were not
  leaking at all (already source-gated), while three unlisted ones were — including
  `civ:epochChanged`, which carried no `planetId` and so rendered an **AI empire's epoch advance
  as the player's own**. Full classification table (18 gated / 36 player-scoped by construction /
  24 global-by-design, zero unclassified) lives in `DIRECTOR_SLICE1_PLAN.md`.
  ⚠ **S5 surfaced an engine-level defect that binds every future rule:** `roll.unit:'displayedYear'`
  was validated *to the letter* but never honored — `rollFires` counts attempts and `tickEmpire`
  runs per **civ** year, so a 10 %/+10 pt curve saturated in 0.83 displayed years instead of ~3.7,
  which would have made signed Decision 2 dead on arrival. The engine now gates one roll attempt
  per displayed year; every rolled rule inherits it.
  **Three owner rulings were added during the slice.** **R-3**: AI warship production requires
  an orbital station, seeded **module-less** at empire generation as part of the starting
  handicap — the station is a *permission token*, not a factory (an audit showed a functional
  module would leak AI research and AI-built ships into the **player's** colony and fleet).
  **R-4**: the catalog's tech ladder stays — `point_defense` was granted because it was a gate
  with *no route*, whereas `ion_drives`/`warp_drive` have one; the accepted consequence is that
  early-game pressure produces an incident with **no armed response**, deferred to Gate 3 review.
  Plus the `no_crew`/`no_module` reasons the gate exercised.
  Scope (can start after D1): Director skeleton + AI ship production from
  templates (pulls B.3 forward as a minimal version) + influence map (pulls D3's map
  forward if Director goes first) + two rule chains:
  - **First contact**: observatory L5 → yearly cumulative spawn roll 10%/20%/30%…→100%
    for an AI science-vessel flyby; detectable via normal sensors; narrative event.
    Variants per archetype: deferred (solid base first).
  - **Military pressure L1–L2**: armed player ship in AI border zone → AI builds
    2–3 frigates (via templates) + incident; repeat → squadron + homeworld defensive
    posture.
- **Slice 2** (after D2/D4): demand-based rules — pressure L3 ultimatum, tribute
  demands, counter-intel expulsion.
- **Slice 3**: strategic rules — arms race, wartime opportunism, precursor rivalry,
  reciprocity.

### D. Deferred (after the arc, rough order)

1. Galaxy map 2D reform (readability) — explicitly last; D3's influence map is
   data-only and does not depend on it.
   ⚠ **Now carries a concrete correctness item, surfaced by GATE 3:** the map draws
   `TerritoryField` isolines at **1.5–4.0 LY** (metaball contours over colony devScore) while
   military pressure actually triggers off the influence map's **5 LY border shell** — so a player
   reading the map misjudges where an incident will fire, and there is no drawn cue for the shell
   at all. Either render the shell or state plainly that the isoline is not it.
1b. **World variety — the remaining counter-derived constants.** GALAXY_SEED fixes the galaxy seed
   only. Everything keyed off `entity_N` ids stays identical in every new game: star texture variant
   (`ThreeRenderer.js:1245`), planet hex maps (`PlanetMapGenerator.js:92`), region layout
   (`RegionSystem.js:308`) and **deposits** (`DepositSystem.js:54-57`).
   ⚠ **Deposits are the one with real gameplay impact — every new game starts with an identical
   economy.** The other two are cosmetic. Natural candidate to pair with the 2D map reform above,
   since both touch what the player reads off the map.
2. Coalitions + Galactic Council (population-weighted vote, final war) — natural
   consumer of global reputation.
3. Espionage + false-flag ops (MOO2) — extension of the intel system.
4. Favors currency; counter-offer negotiation UI (engine already emits `counterHint`).

## Sequence

```
D1 ✅ → GALAXY_SEED ✅ → D2 ✅ (E1..E9, three gates PASSED, phase CLOSED 2026-08-10)
                        → Director Slice 1 ✅ COMPLETE (S0..S6, Gates 1-3 PASSED 2026-08-11/12)
                        → WAR_BACKBONE doc ✅ SIGNED (P1-P7 + §6a, owner 2026-08-13)
                        → W1 plan ✅ APPROVED (14 decisions signed, orchestrator 2026-08-14)
                        → W1 ✅ COMPLETE (13 commits, Gates 1-3 PASSED 2026-08-14, v100 no migration)
                        → W2 plan ✅ APPROVED (22 decisions signed, 3 owner rulings, 2026-08-15)
                        → W2 🟡 BUILT — 8 commits, **GATE 1 + GATE 2 PASSED**, save bumped v100 → v101
                                                ⟵ WE ARE HERE — **GATE 3 is the only thing left**:
                                                   AI warship end-to-end, LIVE ONLY (binding register
                                                   line: unmeasurable headless, GameCore mounts no Director)
                        → D3/D4 ⇄ W1..Wn → D5 (AI↔AI live) → Director Slices 2–3 → deferred list
```

**Where we are right now:** **the arc's foundation is complete and the war backbone has its first
executable plan.** D1 gave relations a real model; D2 gave them a real *decision* (closed 2026-08-10,
nine commits, three passed gates, save untouched at v100); Director Slice 1 gave the galaxy a
*dramaturgy* layer and — decisively for workstream B — the first AI empires that build real warships
through the real economy. `WAR_BACKBONE.md` is **signed** (P1–P7 plus §6a territorial peace), and
`W1_PLAN.md` is **approved** with fourteen signed decisions. **The next action is code, not design.**

**Next horizon — finish W2 at GATE 3, then W3.**
1. **W2 — the deploy model** (P4) — 🟡 **BUILT, ONE GATE LEFT**. Build → storage → deploy is live for
   both sides: a hull leaves the yard into **reserve**, crewing it costs POP and takes one displayed
   month, losing it kills that crew, and the AI now decides when to mobilize. All three P4 questions
   were ruled on 2026-08-15 and are implemented as stated (R-A 10 % reserve upkeep · R-B one month ·
   R-C crew dies). Save **v101**. Full register: `W2_PLAN.md`; corrections it forced on this backbone:
   `WAR_BACKBONE.md` §6-W2 (C-1…C-7).
   **Remaining: GATE 3** — AI warship end-to-end on a live game, plus the R-2 shell-coverage
   re-measure. It is live-only by binding register ruling: `GameCore` mounts no Director, so
   "an AI warship comes into being end-to-end" cannot be measured headless.
   ⚠ The owner's Gate-3 regression scenario (**fleet-upkeep death spiral** — too many ships, negative
   credits) is now pinned as `deploy_seams` T6 and left deliberately untouched by W2; the reserve rate
   only adds to it.
   ⚠ Two things W2 deliberately did **not** price, handed to W3: materialized shadow fleets bypass the
   crew model entirely, and AI fleet upkeep is still not charged.
3. **D3** — borders, trespass incidents, influence map. `bordersOpen` has been sitting in the relation
   record, unread, since D1, and D3 is its consumer. The influence map is already built (Director S2).

⚠ **`relative_power` stops being inert in W1** (commit W1-3, GATE 1) — the E7 acceptance matrices must
be re-run with before/after attached, and the untracked BALANS baseline copied aside **before** the first
run (`W1_PLAN.md` §V19). `third_party` stays inert until **D5** brings AI↔AI pairs; it remains marked
INERT in the matrices so nobody tunes weights against a term that returns zero.

⚠ **The four Director Slice 1 AI-economy findings** (freePops steady-state zero · demand for
non-manufacturable commodities · dormant couriers · expansion on two schedules) are now **triaged**:
the courier latch is a W1 commit, the rest are filed to BALANS with scope estimates in
`W1_PLAN.md` §Findings filed. The "dormant couriers = mis-keyed to outposts" diagnosis was **overturned**
— there is no keying mismatch; the path simply had no outposts in the measured window (§K-5).

Balancing note: full military tuning in BALANS waits until AI military economy exists
(workstream B); civilian-economy validation proceeds independently. Every phase ships
with harness regression checks (acceptance matrices, escalation traces, N-decade
AI↔AI runs).

## Workflow

Per phase: plan doc → atomic commits → live browser gate → harness regression run.
Loud-fail rule for all new AI code: no silent `window.KOSMOS?.` no-op paths (audit R12).
