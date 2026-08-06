# DIPLOMACY BACKBONE 1.0 — design doc

**Arc:** WOJNA I POKÓJ 1.0 · **Status:** design approved, pre-implementation
**Basis:** `docs/audit/COMBAT_DIPLO_AUDIT.md` (2026-08-05) — all file:line references below point there.
**Inspirations:** Stellaris (modifier-stack opinion, acceptance breakdown), Victoria II (global reputation / infamy), CK (incident memory, per-cause decay), MOO 1/2 (personality × objective, ramping treaties, threaten verb).

## 0. Purpose & scope

Replace the current split-brain relationship state (trust + hostility, audit R8) and the
"always yes" diplomacy (audit §4.5) with a three-layer backbone that every future
diplomatic mechanic plugs into:

1. **Relations model** — one pair-wise schema for player↔AI *and* AI↔AI.
2. **Acceptance Engine** — one evaluator for every proposal, with a player-visible breakdown.
3. **Verbs** — diplomatic actions as data-driven plugins (treaties, war, peace, borders, gifts, threats…).

This doc defines the backbone and the implementation phases. Each phase gets its own
detailed plan doc before coding (same workflow as Population 2.0). The ReactionDirector
(scripted behaviors: first contact, military pressure) is a **separate doc** that consumes
this backbone; it is not specified here.

**Explicit non-goals for 1.0:** favors currency, Galactic Council / endgame vote,
espionage & false-flag ops, counter-offer negotiation UI (engine emits `counterHint`
but no UI consumes it yet), galaxy map 2D reform (separate task, scheduled after this arc).

---

## 1. Layer 1 — Relations model

### 1.1 Schema

Relations move from `diplomacy.relations['player_<id>']` to a symmetric pair key:

```js
// key: canonical sorted pair, player is the literal id 'player'
// e.g. 'emp_3__player', 'emp_1__emp_4'
gameState.diplomacy.relations['<idA>__<idB>'] = {
  a: 'emp_3', b: 'player',            // sorted; helpers resolve "my side"

  opinionModifiers: [                  // THE ONLY source of opinion
    { id: 'destroyed_our_fleet', value: -50, decayPerYear: 5,  year: 2311, source: 'battle:xyz' },
    { id: 'trade_partner',       value: +10, decayPerYear: 0,  persistent: true },  // lives while treaty lives
    { id: 'gift_received',       value: +15, decayPerYear: 3,  year: 2313 },
  ],
  // opinion(A→B) = clamp(-100, +100, Σ active modifiers)
  // ALWAYS computed, NEVER stored. UI breakdown comes for free.
  // Modifiers are directional: each entry carries `owner` ('a'|'b') = whose opinion it shapes.

  tension: 0,                          // 0..100 — successor of hostility, same ladder 40/60/80,
                                       // same decay -5/civYear after 2 quiet years
  status: 'peace',                     // 'peace' | 'war' | 'truce'
  truceUntilYear: null,                // NEW: truce is timed → auto-transition to 'peace'
                                       // (fixes audit R7: terminal truce killed decay forever)
  bordersOpen: { a: true, b: true },   // per direction: does A let B's civilian ships in
                                       // (military vessels ALWAYS need explicit access — see verb catalog)

  treaties: [ { id, signedYear, expiresYear|null, rampValue } ],
  memory:   [ { id, type, year, payload } ],   // full incidents ring buffer (cap 20);
                                               // opinion modifiers are the *shadow* of memory,
                                               // memory is the *evidence* (casus belli, UI history)
}
```

Design rules:

- **Opinion is derived, never written.** Every mechanic that "changes relations" adds or
  refreshes a modifier. Decay is per-cause: a broken alliance can take 20 years to fade,
  a border incident 3. Persistent modifiers (`persistent: true`) live as long as their
  source (treaty, war state) and are removed by the source's teardown.
- **Tension stays a separate axis** (decision from design discussion, option B):
  opinion = "what we think of you", tension = "how close to war we are".
  A xenophage can hold opinion 0 and tension 70. One-way coupling: tension > 60
  injects/refreshes an opinion modifier `threatened_by_you` (−10, decays when tension drops).
- **Directionality:** the pair record is one object, but modifiers and borders carry an
  owner side. `getOpinion(a→b)` ≠ `getOpinion(b→a)`.

### 1.2 Global reputation (infamy)

Outside pair records, per empire:

```js
gameState.diplomacy.reputation['player'] = {
  aggression: 0,           // 0..100; raised by: unprovoked war +15, colony conquest +10/colony,
                           // homeworld conquest +25, broken treaty +10, first-contact kill +20
  decayPerYear: 1,         // slow — the galaxy remembers
}
```

Every *other* empire reads it as an opinion modifier `known_aggressor`
(scaled: −aggression/4, floor −25). One field, one modifier type — and the foundation
for future coalitions and the (deferred) Council. AI empires accrue reputation by the
same rules; the galaxy judges everyone.

### 1.3 Empire model additions (MOO import)

- **`objective`** — second axis next to archetype, rolled at empire generation:
  `militarist | technologist | expansionist | diplomat | merchant | ecologist`.
  Archetype = culture (who they are), objective = current agenda (what they want).
  Consumed as weight overrides in the Acceptance Engine and (later) strategic priorities.
  Same xenophage plays differently per run. Cost: one enum + weight table.
- **`traits: ['erratic'?]`** — optional. Erratic adds seeded noise (±15) to acceptance
  scores and re-rolls a hidden attitude bias every ~10 years. One term, big flavor.

### 1.4 Migration from current state

- `rel.trust` → seed modifier `legacy_relations` with `value: (trust−50)`,
  `decayPerYear: 2` — old relationships matter but fade into the new system.
- `rel.hostility` → `tension` 1:1. Ladder constants unchanged.
- `rel.state 'truce'` → `truce` + `truceUntilYear = currentYear + 10` (unblocks R7 for old saves).
- `lastIncidents[]` → `memory[]` (shape-mapped).
- Key rename `player_<id>` → canonical pair key in a save-restore shim; GameState's
  merge-by-key restore covers new fields without a version bump (precedent: v86 `tradeOrders`).
- `TRADE_AGREEMENT_TRUST_YEAR`, `PACT_TRUST_YEAR`, `TreatyData.accept` (all DEAD per audit)
  are deleted, not migrated.

---

## 2. Layer 2 — Acceptance Engine

One evaluator for every proposal, both directions, both player↔AI and AI↔AI:

```js
evaluateProposal(fromId, toId, proposal) → {
  score: number,                       // Σ weighted terms
  decision: score >= verb.threshold,   // ACCEPT / REJECT
  breakdown: [                         // ALWAYS returned; UI renders it verbatim
    { term: 'opinion',        label: 'Dobre relacje',            value: +20 },
    { term: 'relative_power', label: 'Jesteśmy silniejsi',       value: -30 },
    { term: 'memory',         label: 'Pamiętamy zdradę paktu',   value: -25 },
    { term: 'offer',          label: 'Oferta: 500 minerałów',    value: +15 },
  ],
  counterHint: null | { addOffer: { credits: 300 } },   // emitted, not yet consumed (non-goal)
}
```

### 2.1 Standard terms

Each term is a pure function `(ctx, proposal) → {value, label}`. Verbs pick terms and
weights; archetype + objective supply weight overrides.

| Term | Notes |
|---|---|
| `opinion` | evaluator-side opinion of proposer; the workhorse |
| `tension` | **sign depends on verb** — high tension *helps* accept a NAP or peace, *hurts* an alliance |
| `relative_power` | weaker side more agreeable; uses the repaired strength estimate (audit R2 fix, Phase 0b) |
| `war_status` | at war with proposer / with third parties; exhaustion feeds peace evaluation |
| `personality` | archetype vector (aggression, trade, …) × objective overrides |
| `reputation` | proposer's global aggression score |
| `offer` | attached credits/resources — **every proposal can carry a sweetener**; diminishing returns |
| `memory` | hard modifiers from evidence: `broke_treaty_with_us` is a heavy, slow-decay minus |
| `recent_refusal` | rejected proposal ⇒ −20 "we just said no" for 2 years — kills button-spamming |
| `third_party` | `ally_of_our_enemy` −20 · `at_war_with_our_enemy` +15 · `our_ally` +10 — makes AI↔AI real |
| `erratic_noise` | seeded ±15, only for erratic-trait empires |

### 2.2 Seams

`DiplomacySystem.proposeTreaty :298` is already the single choke point for the one path
that evaluates today — the engine replaces its inline `personality × trust` thresholds.
`offerPeace :228` and `MissionSystem._launchEnvoy :1471` get the evaluation seam they
never had (audit R5). `WarSystem._triggerAutoPeace :268` routes through the engine too
(exhaustion 100 becomes a huge term, not a bypass).

---

## 3. Layer 3 — Verbs

### 3.1 Plugin contract

```js
{
  id: 'non_aggression',
  preconditions(ctx) → ok | {blocked, reason},   // intel level, status, existing treaties…
  acceptance: { terms: {...weights}, threshold },
  onAccept(ctx), onReject(ctx),                   // effects: modifiers, treaties, status, memory
  cooldownYears: 2,                               // per pair per verb
  aiInitiation: { evaluate(ctx) → score } | null, // when AI proposes it unprompted
  ui: { label, icon, offerSlots: true|false },
}
```

The engine knows how to evaluate and apply; it does not know what an alliance is.
Adding a diplomatic mechanic = adding a verb file + modifier types. Zero engine changes.

### 3.2 Catalog 1.0

| Verb | Mechanical core |
|---|---|
| `improve_relations` (envoy/mission) | adds decaying + modifier; **target may refuse** (fixes always-yes #3); keeps existing envoy mission mechanics as the delivery vehicle |
| `gift` | resources/credits → opinion modifier scaled by value, diminishing returns; the basic "buy goodwill" tool |
| `denounce` | −opinion at target, small + at target's enemies; feeds proposer↔target tension slightly; cheap signal |
| `threaten` (MOO) | coercion: vs weaker/pacifist → concession or −tension "generosity"; **backfires** vs aggressive/honorable (+tension, −opinion, memory `threatened_us`) |
| `open_borders` / `close_borders` | flips `bordersOpen[side]`; closed borders turn claimed-space entry into trespass incidents; military vessels always require explicit access regardless |
| *(border violation)* | **not a verb — an incident generator**: claimed/border-zone entry events (from ReactionDirector's influence map, 1 jump) write tension + memory; the diplomatic response ("withdraw your forces") is a verb the AI initiates |
| `non_aggression` | blocks war declaration; **has duration + renewal** — renewal is evaluated fresh (a natural diplomatic beat); breaking it: heavy modifier + reputation + memory |
| `alliance` | finally mechanical: war call (ally evaluates the call **through the same engine**), shared intel vision, −tension between allies |
| `declare_war` | requires casus belli from `memory` (existing `inferCasusBelli` retargeted); no-CB war = big reputation hit; unilateral (no acceptance) |
| `offer_peace` | through the engine: exhaustion + `casusBelli.peaceCost` (finally consumed) + relative power; result = timed truce |
| `trade_agreement` | as today + persistent `trade_partner` modifier; **ramping** (MOO): trade bonus grows to a cap over ~10 y, breaking forfeits accrued value; cancellable (verb — today no cancel button exists, audit §4.4) |
| `tech_exchange` | one-shot transaction tech-for-tech/credits through the engine; science archetypes/objectives weight it up |
| `tribute` | recurring payment — demanded by the strong or offered by the weak to buy calm; merchant/trader escalates the rate over time |
| `embargo` | cuts trade without war; middle rung between denounce and pact-breaking |

### 3.3 AI-initiated diplomacy

Each verb's `aiInitiation.evaluate` runs in the per-empire diplomacy tick (host:
`AlienCivSystem._tickAll`, audit §6.1). The AI proposes when its own evaluation clears
the bar — same engine, reversed direction. Player receives proposals via
`ScheduledEventPopup` (`config.options[]` — the audit-identified choice modal),
with accept/reject/(later counter). Log + bell for low-stakes verbs (denounce, envoy),
pausing popup for demands, war, peace, alliance calls.

---

## 4. AI↔AI

- **Symmetric engine, asymmetric cadence.** AI pairs run the same model, engine, and
  verbs — proposer's `aiInitiation` vs responder's `evaluateProposal`. Pair ticks are
  round-robin at 1–2 civYears (reuse the ≤8-steps-per-tick pattern from `_tickAll`).
- **Incident generators work between AIs**: shared border zones produce violations,
  colonization in claimed space produces tension, the 40/60/80 ladder produces wars.
- **AI↔AI combat** resolves on the abstract path (`BattleSystem`); DSCS stays
  player-only (audit R14 accepted as design). Outcomes reconcile back into fleet
  `strength` (Phase 0b reconciliation).
- **Visibility is intel-gated — no omniscience.** Third-party wars are visible only at
  ≥ `contact` with a participant; relation details (opinion, treaties) at `detailed`.
  Low-intel events surface as rumors ("docierają do nas wieści o wojnie na rubieżach").
  Diplomacy screen renders known third-party relations as a graph with fog gaps.
- **Third-party terms** (`third_party` in §2.1) are what make this layer matter:
  blocs emerge, and the player's alliances carry opportunity cost.
- Reputation is read by AI↔AI pairs too — an aggressor (player or AI) sours the whole map.

---

## 5. Implementation phases

Each phase = its own plan doc → atomic commits → live gate. Harness checks listed per phase.

**Phase D1 — Relations model + migration + UI.**
New schema, pair keys, modifier stack with decay tick, tension port, timed truce,
reputation, memory. Save migration shim. DiplomacyOverlay shows computed opinion with
full modifier breakdown and tension side by side. *No behavior change yet* — existing
treaty thresholds temporarily read computed opinion instead of trust.
Harness: modifier decay curves, truce→peace transition, save round-trip on pair keys.

**Phase D2 — Acceptance Engine + retrofit.**
Engine + standard terms. Retrofit the six existing actions: three treaties (replace
inline thresholds), **peace and envoy get their first-ever check** (ends "always yes"),
auto-peace routed through the engine. Rejection UI with breakdown. `recent_refusal` term.
Harness: scripted proposal matrices per archetype × objective — acceptance-rate tables
as regression artifact.

**Phase D3 — Borders + incident pipeline.**
`bordersOpen`, trespass incidents, "withdraw forces" AI-initiated verb. Depends on the
influence map (claimed + 1-jump border zone) — **shared prerequisite with
ReactionDirector Slice 1**; build it here, Director consumes it.
Harness: violation → tension → ladder escalation traces.

**Phase D4 — Verb catalog, batch 1.**
`gift`, `denounce`, `threaten`, NAP duration/renewal, alliance mechanics (war call,
shared vision), war CB requirement + reputation, peace terms consuming `peaceCost`.
Harness: threaten backfire matrix, alliance call acceptance, no-CB reputation hit.

**Phase D5 — Verb catalog, batch 2 + AI↔AI activation.**
`tech_exchange`, `tribute`, `embargo`, trade ramping + cancellation. AI↔AI pair ticks
switched on, third-party terms live, intel-gated visibility + rumor events.
Harness: N-decade headless run — AI↔AI wars occur, blocs form, no runaway
(all empires at war forever) and no dead calm (zero wars in 50 y with a xenophage on map).

**Interleaving with ReactionDirector:** Director Slice 1 (first contact, military
pressure L1–L2, AI ship production from templates) can start after D1 — it needs the
influence map (built in D3, can be pulled earlier if Director goes first) and writes
incidents/modifiers through the D1 schema. Verbs with demands (Director L3+) wait for D2/D4.

**Deferred, in order after this arc:** ReactionDirector Slices 2–3 · post-conquest
costs & peace territory transfer (WOJNA I POKÓJ Phase 3) · coalitions & Council ·
espionage · **galaxy map 2D reform** (scheduled last, per decision — the influence map
in D3 is data-only and does not depend on the visual reform).

---

## 6. Open items for phase plan docs

- Exact modifier catalog with values/decay (D1 plan) — start from audit §4.1 table, extend.
- Weight tables: verb × term × archetype × objective (D2 plan) — expect heavy tuning;
  harness acceptance matrices are the tuning instrument.
- ScheduledEventPopup payload contract for diplomatic proposals (D2 plan).
- Ship template format for AI production (Director Slice 1 doc — Filip delivers templates:
  e.g. frigate = hull + warp drive + warp core cell + standard armor + 2× kinetic,
  fallback 1× kinetic if capacity-constrained; built instantly when resources + criteria met).
- First-contact trigger math (Director doc): from observatory L5, cumulative yearly roll
  10% → 20% → 30% … capped at 100%.
