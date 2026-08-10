# WOJNA I POKÓJ 1.0 — master plan

**Status:** living roadmap · **Last update:** 2026-08-10
**Basis:** `docs/audit/COMBAT_DIPLO_AUDIT.md` · **Companion docs:** `DIPLOMACY_BACKBONE.md` (done),
`WAR_BACKBONE.md` (pending), `REACTION_DIRECTOR.md` (pending), per-phase plan docs.
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
  Slice 1 (S2) and D3 consumes it. ⚠ The 5 LY constant is **provisional pending a coverage
  measurement** on the real 72-system galaxy across several seeds — see `DIRECTOR_SLICE1_PLAN.md`
  §Rulings R-2.
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

### B. War backbone (doc after D2, phases W1–Wn interleave with D3/D4)

Owns everything between war declaration and the peace table. Doc must cover:

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

- **Slice 1 — 🟢 IN PROGRESS.** Plan doc: `DIRECTOR_SLICE1_PLAN.md` (approved 2026-08-10; eight
  decisions signed + owner rulings **R-1** and **R-2**). Progress: **S0 ✅** `e9f1853` (seam
  verification by execution — 11 claims confirmed, **V4 broken**: the AI-side caller that
  "proves" `startShipBuild` has never fired in 4 seeds × 400 civYears; the mechanism itself was
  proven directly instead) · **S1 ✅** `31bd81b` (rule skeleton + registries + `gameState.director`
  at v100 with no migration; forced the `SeedMath.js` extraction out of `AcceptanceMath.js` so pin
  P14 kept its full strength, 206/206 unedited) · **S2 next** — influence map, and it carries R-2's
  coverage measurement (stop-with-table if the 5 LY shell approaches half the galaxy) ·
  S3–S7 pending · **Gates 1–3 all pending.**
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
                        → Director Slice 1 🟢 IN PROGRESS  (S0 ✅ e9f1853 · S1 ✅ 31bd81b)
                                                ⟵ WE ARE HERE — S2 next (carries R-2 measurement)
                        → [Director S2..S7 + Gates 1-3] ∥ D3 → WAR_BACKBONE doc
                        → D3/D4 ⇄ W1..Wn → D5 (AI↔AI live) → Director Slices 2–3 → deferred list
```

**Where we are right now:** **the diplomacy backbone's first two phases are done and the arc's
foundation is in place.** D1 gave relations a real model; D2 gave them a real *decision* — closed
2026-08-10 after nine commits and three passed live gates, with the save format untouched throughout
(v100, no migration). AI can now say no, and say *why*. The blow-by-blow lives under **Completed →
D2** above and in `D2_PLAN.md` (per-commit table + 16 implementation findings); the three gate scripts
carry their recorded results.

**Next horizon — the order was decided: Director Slice 1 went first and is UNDER WAY.**
1. **ReactionDirector Slice 1** (workstream C) — 🟢 **IN PROGRESS**, plan `DIRECTOR_SLICE1_PLAN.md`
   (read its **RESUME** block first). S0 ✅ + S1 ✅; **S2 next**, and S2 opens with R-2's coverage
   measurement before the 5 LY constant hardens. Still runs in parallel with D3 and still pulls B.3
   forward in a minimal form.
   ⚠ Two findings from S0 that bind later work: the AI-side `startShipBuild` caller has **never fired
   in a real game** (courier routes need outposts; the AI founds none — filed to WAR_BACKBONE/BALANS
   as an AI-economy diagnosis), and an AI-built warship currently leaves the yard with **no owner**
   (the only stamp filters `hull_small`), which Director S4 fixes for itself.
2. **WAR_BACKBONE doc** (workstream B) — the design pass that owns everything between a war
   declaration and the peace table. It is also where audit **R2** finally gets fixed (both player-military
   estimators are broken identically), which is what un-stubs D2's `relative_power` term, and where
   `FLEET_AGGRO_INTERVAL` gets deleted.
3. **D3** — borders, trespass incidents, influence map. `bordersOpen` has been sitting in the relation
   record, unread, since D1, and D3 is its consumer.

⚠ Two D2 terms stay deliberately inert until those land: `relative_power` (needs R2 →
WAR_BACKBONE) and `third_party` (needs AI↔AI pairs → D5). Both are marked INERT in E7's acceptance
matrices so nobody tunes weights against a term that returns zero.

Balancing note: full military tuning in BALANS waits until AI military economy exists
(workstream B); civilian-economy validation proceeds independently. Every phase ships
with harness regression checks (acceptance matrices, escalation traces, N-decade
AI↔AI runs).

## Workflow

Per phase: plan doc → atomic commits → live browser gate → harness regression run.
Loud-fail rule for all new AI code: no silent `window.KOSMOS?.` no-op paths (audit R12).
