# WOJNA I POKÓJ 1.0 — master plan

**Status:** living roadmap · **Last update:** 2026-08-07
**Basis:** `docs/audit/COMBAT_DIPLO_AUDIT.md` · **Companion docs:** `DIPLOMACY_BACKBONE.md` (done),
`WAR_BACKBONE.md` (pending), `REACTION_DIRECTOR.md` (pending), per-phase plan docs.
**Phase docs in repo:** `docs/design/D1_AUTONOMOUS_REPORT.md` · `docs/design/D1_LIVE_GATE_CHECKLIST.md` ·
`docs/design/D2_PLAN_SKELETON.md` · `docs/design/GALAXY_SEED_PLAN.md`.

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
- **D2** Acceptance Engine + retrofit of 6 existing actions (ends "always yes") ← **IN PROGRESS.**
  Plan doc `D2_PLAN.md` (per-commit status table there). Commit order **E1 → E7 → E2 → E3 → E4 →
  E5 → E6 → E8 → E9** (E7 pulled ahead: the acceptance matrices are the tuning instrument for E2's
  parity conversion). Live gates at E3, E5, E6.
  **Done: E1 `ef35af7` · E7 `27dd7a6` · E2 `b8b3e08` · E3 `e011017` — E3 live gate PASSED
  2026-08-08, 10/10 sections (`D2_E3_GATE_CHECKLIST.md` carries the recorded result).**
  In progress: **E4**. Remaining: E5, E6, E8, E9. Save stays **v100**, no migration.
  The gate's one discrepancy was a **checklist over-promise, not a regression**: a concluded
  peace has no Journal entry and never had one — `diplomacy:peaceSigned` only ever had *state*
  subscribers (WarSystem closes the war, AlienCivSystem flips the FSM), and
  `git log --all -S` over `UIManager` is empty. Same class as D1 §1.3. It only started to
  chafe because E3 gave refusals a voice, leaving peace as the sole *success* without one
  (treaty and envoy both have theirs). **Fixed in E4.**
  Headline results so far: `"always yes"` is over — peace and the envoy can be refused,
  `casusBelli.peaceCost` got its first reader in the codebase, and the `getTrustEquivalent`
  bridge is deleted. Parity for the three treaties is exact, proven by `diplomacy_d1_smoke`
  passing **83/83 unedited** — personality turned out to be a *hard gate*, not a weighted term
  (parity forces `O ≥ 8·P`, scale-invariant), so it became a `personalityFloor` precondition.
  Scope now also carries: unit
  unification (§5a), DiplomacyTelemetry+Report, the `threatened_by_you` wire-or-delete decision,
  the `_onColonyFounded` `ownerEmpireId` check, `kosmos_save_backup_v{N}` retirement, and the decay
  flag flip as its own commit + gate.
- **D3** Borders, trespass incidents, influence map (claimed + 1-jump border zone)
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
   REAL vessels built from modules, spawned instantly when resources + criteria are met
   (no physical build queue). Template format + catalog per hull class and role
   (Filip authors templates; example: frigate = hull_frigate + warp drive + warp core
   cell + standard armor + 2× kinetic, fallback 1× kinetic on capacity). Templates
   should be tech-aware (better modules as empire tech grows) and archetype-flavored.
4. **Threat assessment** — one shared module read by both war and diplomacy
   (fix of audit R2 lives here).
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

- **Slice 1** (can start after D1): Director skeleton + AI ship production from
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
D1 ✅ → GALAXY_SEED ✅ → D2 (E1✅ E7✅ E2✅ E3✅gate | E4🔨 E5 E6 E8 E9) ⟵ HERE
                        → [Director Slice 1 ∥ D2/D3] → WAR_BACKBONE doc
                        → D3/D4 ⇄ W1..Wn → D5 (AI↔AI live) → Director Slices 2–3 → deferred list
```

**Where we are right now:** D2 is four commits in and **past its first live gate**. E3 passed on
2026-08-08 — the game now has a refusable peace: the first refusal scored **−6.5** against a
threshold of 0 (war exhaustion 0 against a `border_incident` peace price of 30), the same war
concluded at exhaustion 70, and an extermination war survived exhaustion 100 without ending
itself. **E4 is in progress**: the refusal modal that renders the breakdown verbatim, the
`recent_refusal` term going UNFED → LIVE, and the E2-deferred flip of treaty/peace buttons to
always-clickable. Next gates are **E5** and **E6** (E4 ships without one — it adds a modal and a
cooldown, neither of which moves the acceptance maths).

Balancing note: full military tuning in BALANS waits until AI military economy exists
(workstream B); civilian-economy validation proceeds independently. Every phase ships
with harness regression checks (acceptance matrices, escalation traces, N-decade
AI↔AI runs).

## Workflow

Per phase: plan doc → atomic commits → live browser gate → harness regression run.
Loud-fail rule for all new AI code: no silent `window.KOSMOS?.` no-op paths (audit R12).
