# PHASE D1 — Relations model, migration, opinion UI · plan doc

**Arc:** WOJNA I POKÓJ 1.0 · **Parent:** `DIPLOMACY_BACKBONE.md` §1, §5
**Rule for the phase:** *no behavior change* — the game must play identically after D1
(same treaty outcomes, same war triggers). D1 swaps the data foundation and makes it
visible. Behavior changes start in D2.

## Goal

Replace `trust`/`hostility` split state with the pair-wise relations model:
modifier-stack opinion (computed, never stored), tension, timed truce, memory,
global reputation, and empire `objective`/`traits` fields. Migrate saves. Show the
player a full opinion breakdown in DiplomacyOverlay.

## Deliverables

1. `RelationsModel` module (new): pair keys, modifier CRUD, opinion computation,
   decay tick, tension port, timed truce, memory ring.
2. `ReputationLedger` (new, small): per-empire aggression score + decay.
3. Empire generation: `objective` roll + optional `erratic` trait (data only in D1 —
   consumers arrive in D2).
4. Save migration shim old→new schema.
5. DiplomacyOverlay: opinion with modifier breakdown + tension, side by side.
6. Harness checks (see §Regression).

## Design details

### Pair keys & API

- Canonical key: ids sorted lexically, joined `'__'`; player is literal `'player'`
  (e.g. `emp_3__player`). Helper: `pairKey(a,b)`, `sideOf(rel, id) → 'a'|'b'`.
- Public API (DiplomacySystem facade — external callers should not touch raw state):
  - `getOpinion(ofId, aboutId) → number` (clamped −100..+100)
  - `getOpinionBreakdown(ofId, aboutId) → [{id, label, value, yearsLeft}]`
  - `addOpinionModifier(ofId, aboutId, modId, {value, decayPerYear, persistent, source})`
    — same `modId` refreshes (resets year, keeps single entry) unless the modifier
    declares `stacking: true`
  - `removeOpinionModifier(ofId, aboutId, modId)` — for persistent teardown
  - `getTension / changeTension` — port of `changeHostility` incl. ladder + escalation
  - `addMemory(ofId, aboutId, incident)` — replaces `addIncident`, cap 20
  - `getStatus / setStatus` — peace | war | truce(+truceUntilYear)
- All existing internal callers of `changeHostility` (4 sites) and `changeTrust`
  (8 modifier sources, audit §4.1) are rewired — see Mapping.

### Mapping old → new (behavior-preserving)

Hostility sources → `changeTension`, values unchanged (colony in claimed +30,
observatory scan +10, treaty broken +15, decay −5/y after 2 quiet years).
Ladder 40/60/80 and ultimatum flow untouched.

Trust sources → opinion modifiers:

| Old trust source | New modifier | value | decay/yr |
|---|---|---|---|
| envoy arrival / return (+5/+5) | `envoy_goodwill` (stacking) | +5 | 1 |
| AI envoy (+3) | `their_envoy` | +3 | 1 |
| trade agreement (+1/yr) | `trade_partner` (persistent) | +10 flat | — (torn down with treaty; ramping arrives in D5) |
| armed arrival (−5) | `military_presence` | −5 | 2 |
| science arrival (−3) / trespass (−5/y) | `surveillance` (stacking) | −3/−5 | 2 |
| war declared (trust→0) | `at_war` (persistent) | −40 | — (removed at peace, leaves `recent_war` −15, decay 2) |

Temporary D2-bridge: until the Acceptance Engine lands, `proposeTreaty`'s inline
thresholds read `50 + getOpinion(...)/2` where they read `trust` — same scale, same
outcomes for migrated values. Delete in D2.

### Migration shim (SaveMigration)

- `relations['player_<id>']` → pair-key record.
- `trust` → one modifier `legacy_relations {value: trust−50, decayPerYear: 2}`.
- `hostility` → `tension` 1:1. `state:'truce'` → `truceUntilYear = year + 10`.
- `lastIncidents[]` → `memory[]` (shape-mapped, keep years).
- `reputation` initialized to 0 for all empires (no retroactive scoring).
- New-domain fields ride GameState merge-by-key restore (no version bump needed for
  fresh fields; the key rename itself is the only shim logic).
- Delete DEAD: `TRADE_AGREEMENT_TRUST_YEAR`, `PACT_TRUST_YEAR`, `TreatyData.accept`.

### Decay tick

One place: `RelationsModel.tick(civDy)` called from DiplomacySystem's existing tick.
Per pair: age non-persistent modifiers (`value` toward 0 by `decayPerYear × civDy`,
remove at |value| < 0.5); tension decay as today; truce timer → on expiry set `peace`
+ add `recent_war` if absent (fixes audit R7 for live games). Reputation decay 1/y.
Tension>60 coupling: refresh `threatened_by_you` (−10, decay 3) each tick while above.

### UI (DiplomacyOverlay)

- Header: opinion number colored (−100 red … +100 green) + tension bar with ladder
  marks at 40/60/80 + status chip (peace/war/truce with years left).
- Breakdown list: each modifier as `label  +/-value  (fades in N y)` — terminal
  aesthetic, sorted by |value|. Persistent ones marked `∞`.
- Memory tab: last incidents with year (reuses existing last-4 display, extended).
- No new actions/buttons in D1.

## Commit plan (atomic, live-gate each)

1. `RelationsModel` + `ReputationLedger` + unit-style harness checks (pure logic,
   no wiring) — includes pairKey helpers, decay math, truce timer.
2. Save migration shim + GameState default-shape update + round-trip check
   (load old save → serialize → load again → identical relations).
3. Rewire DiplomacySystem internals: hostility→tension, trust sources→modifiers,
   `addIncident`→`addMemory`, D2-bridge for treaty thresholds. **Gate: play 30 min,
   verify treaty accept/reject outcomes match pre-D1 for same conditions.**
4. Empire generation: `objective` roll + `traits` (serialized, no consumers).
5. DiplomacyOverlay breakdown UI.
6. Harness: D1 regression module (below) wired into BALANS run summary.

## Regression (harness)

- Modifier decay: seed known stack, advance N years headless, assert curve.
- Refresh semantics: same-id re-add resets timer, no duplicates; stacking ids stack.
- Truce → peace transition at `truceUntilYear`; tension decay resumes after.
- Save round-trip on pair keys incl. an old-format save fixture.
- Behavior-parity spot check: scripted scenario (colonize in claimed → tension 30 →
  ultimatum at 60 → war at 80) produces identical event sequence pre/post D1.

## Out of scope (lands later)

Acceptance Engine and any accept/reject changes (D2) · borders fields are created in
the schema but unread (D3) · ramping trade values (D5) · objective/traits consumers
(D2) · any AI↔AI pair creation (D5 — schema supports it, nothing instantiates it).

## Risks

- Silent-degradation trap (audit R12): RelationsModel must **throw** on unknown pair
  access from internal callers, not return a default — a missing rewire should crash
  the dev build, not no-op.
- Trust→opinion scale drift: the D2-bridge formula keeps treaty outcomes identical
  only for migrated `legacy_relations`; fresh games start at opinion 0 (= old trust 50),
  which is by design equal.
- `battles` prune (50) unrelated but adjacent — don't touch.
