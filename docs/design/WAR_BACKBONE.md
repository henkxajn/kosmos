# WAR BACKBONE 1.0 — design doc (SIGNED)

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** B · **Status:** ✅ **SIGNED** — P1–P7 signed by owner (2026-08-13); §6a territorial peace signed 2026-08-13; K-1/K-2 audit corrections folded 2026-08-14. First slice plan `W1_PLAN.md` **APPROVED** (implementation pending).
**Parent:** `WOJNA_I_POKOJ_MASTER_PLAN.md` §B · **Siblings:** `DIPLOMACY_BACKBONE.md` (shipped: D1–D2), `DIRECTOR_SLICE1_PLAN.md` (shipped: S0–S6, Gates 1–3) · **Slice plans:** `W1_PLAN.md` (approved)
**Basis:** `docs/audit/COMBAT_DIPLO_AUDIT.md` (2026-08-05; superseded in parts — see §1.2 and `W1_PLAN.md` §Corrections) + four AI-economy findings measured live during Director Slice 1 gates (2026-08-11/13)

## 0. Purpose

Everything between a war declaration and the peace table — plus the civilian reaction
layer that decides whether wars start at all. The diplomacy backbone answers "do we
fight and how does it end"; the war backbone answers "what actually happens with
ships, fleets, production, and presence in space" — for the player AND for AI
empires, symmetrically.

Design law for this doc (owner ruling, P1): **the simplest version that produces the
behavior**. Every mechanism must be testable in the headless harness; a layer that
cannot be exercised by a keeper does not ship. Nothing is built "for later" unless a
rule in the catalog consumes it.

## 1. Context

### 1.1 What Slice 1 proved works
AI empires now: build real module-fitted warships (station token → tech ladder →
crew → commodities → shipyard), react to armed player presence in a 5 LY border
shell with escalating production (L1→L2 with predecessor guard), initiate first
contact, refuse loudly with reasons, and keep all of it out of the player's feed.
Relations are pair-wise, incidents are single-channel, opinion/tension are separate
axes with the acceptance engine on top (D2).

### 1.2 The four measured economy findings (gate evidence, filed here)
1. **freePops steady-state ≈ 0.** AI colonies build jobs faster than population;
   full employment is the designed equilibrium. Any crew-gated activity is
   permanently starved. (S0 measured; occurred naturally in Gates 1 & 3.)
2. **Non-manufacturable war commodities.** Demand coupling sets factory demand for
   warp_cores / metamaterials that AI colonies have no chain to produce — demand
   theatre; the TTL bounds the damage. (Gate 1.)
3. **Dormant couriers.** EmpireLogisticsSystem's courier path is real but keyed to
   outposts; it has effectively never run. AI now founds outposts early (~year 7),
   so the fix may be small. (S0/V4; outpost timeline corrected in Gates 1/3.)
4. **Expansion has two schedules.** Outposts early and often; full colonies ~456
   civY. Influence-map coverage grows from early game; 5 LY shell needs re-measure
   over ≥60 displayed years once military economy lands. (S2 + gate observations.)

### 1.3 Standing debts this doc must clear
- **R2** (audit): `estimatePlayerMilitary` string[] bug — player strength invisible;
  `relative_power` stubbed in the acceptance engine since D2 E1.
- **R10**: abstract↔concrete fleet bridge is one-way.
- **R6/R14 residue**: war accounting split between DSCS and WarSystem.
- **R3**: `composeFromStrength` materializes unarmed fleets (now partially
  superseded by template production, but legacy path remains).
- Dead code: `FLEET_AGGRO_INTERVAL` (deletion candidate, from E6).

## 2. Signed direction (P1–P7, owner rulings 2026-08-13)

**P1 — MilitaryBrain: three thin layers, minimal.** Strategic posture (per empire,
already exists as `director.posture`, EmpireStrategySystem cadence) → operational
doctrine (per fleet/vessel group; ships with exactly TWO doctrines: `defend_home`,
`patrol_border`) → tactical execution (existing DSCS/BattleSystem gates, untouched).
Doctrines are states on posture — no new machinery. A third doctrine is added only
when a catalog rule consumes it.
> **Recorded owner intent (future, NOT in scope now):** the end-state is an AI that
> selects targets and attacks its enemies — strikes the enemy capital / home planet
> and conducts ground invasions (desant). This is the target of a later slice (W3+),
> after doctrines, threat assessment, and the deploy model exist. Written here so no
> intermediate design closes the door on it: doctrines must remain extensible to
> offensive target selection; the encounter/skirmish model must support fleet-level
> engagements; invasion hooks stay in the ground-combat seam (audit §2).

**P2 — Strength becomes derived.** `strength` = computed combat value of real hulls
+ modules (armor types, weapons, tiers all priced), not a parallel ledger.
Transition: two-way reconciliation (DSCS losses write back) while both exist; the
abstract ledger dies at the end of the transition. AI↔AI battles resolve on
BattleSystem via an adapter that computes from real hulls. Kills R10 as a class.
> ⚠ **CORRECTED 2026-08-14 — the transition is void** (W1 audit, `W1_PLAN.md` §K-2, REFUTED).
> `empire.fleets` is **always empty in normal play** — its only two producers are the structurally
> unreachable `MilitaryAI.build_fleet` and a debug cheat — so there is nothing to reconcile and no
> period in which "both exist". Meanwhile AI empires already own real, ownership-stamped warships
> (Director S4/S6), i.e. live military assets with *no* abstract representation. Narrowing signed by
> the orchestrator: derived strength ships as a **pure read-model**, the write-back is a shim for
> debug/legacy fleets only, and deletion of the ledger is parked for W2/W3 cleanup.

**P3 — WarSystem is the sole accountant.** Declarations, exhaustion, war goals,
peace routing: WarSystem only. DSCS/BattleSystem are pure battle-result providers.
Every battle carries a `warId` OR is a **skirmish** — a new category: combat
without war state, feeding tension + incident memory, never exhaustion. Border
encounters need this category.

**P4 — Production decoupled from population (owner design).** Applies to player AND
AI symmetrically:
- **Build** = industry only: hull + modules + commodities. No POP requirement.
- Built ships land in **storage** (reserve fleet), not in service.
- **Deploy** = activation: requires crew (POP); player clicks deploy, AI decides via
  doctrine/threat. Deployed ship is in service; crew is committed.
- AI colonies gain **production upgrades** (buildings/techs) for war commodities —
  the missing warp_cores/metamaterials chains become visible, capturable
  development goals (finding #2 becomes a feature).
- Open questions for the W2 plan doc (owner to rule at that point, proposals
  attached): maintenance cost of stored ships (proposal: fractional upkeep);
  deploy duration (proposal: short but nonzero — an intel-visible mobilization
  window); crew fate on ship loss (proposal: crew dies — POP becomes a real war
  cost, integrating with Population 2.0).
- Intel consequence (free feature): "they have 6 frigates in storage but crew for
  three" is a scannable, readable strategic object. Mobilization becomes an event.

**P5 — Reaction matrix as Director catalog data.** The civilian-presence matrix
(vesselClass × zone × treaty state × personality) extends the existing rule format
— predecessor guards, cooldowns, personality multipliers already exist there. No
second rule engine. Encounter protocol = an event contract (see §4) with one
trivial log consumer until AI flies civilian traffic.

**P6 — Courier diagnosis inside this workstream.** Likely small (outpost keying —
outposts now exist). Full AI↔AI matrix activation stays at D5 per the master plan.

**P7 — Slice order:** W1 = repairs on existing paths (no save-model changes);
W2 = the deploy model (data-model + economy change, own gate). Rationale: W1
unblocks `relative_power`, which W2's mobilization decisions need anyway.

## 3. Reaction matrix (R-M1–R-M3, signed 2026-08-13)

Defined for the pair **(observer, intruder)** — symmetric by construction; the
player is one empire among others (R-M3). Activation for AI↔AI pairs arrives with
D5 + awakened AI civilian traffic; the contract ships now.

| Intruder vessel | Border shell (5 LY) | Claimed space |
|---|---|---|
| **Trade** | nothing | trade agreement + open borders → **nothing** (legal traffic — trade becomes a treaty privilege, not a freebie); open borders, no agreement → `unregistered_traders` unease modifier (small, decaying) + after repeats an AI-initiated "regularize trade" signal → natural lead into a trade-agreement proposal; closed borders / no access → **border intrusion**: incident + tension ladder |
| **Science** | intel signal (see below) | as border, plus existing `surveillance` modifier stays |
| **Colony ship** | expansionist reads it as a land race → rush-claim response (claim intent, below) | existing +30 tension (colonize-in-claimed) stays |
| **Armed** | pressure L1–L2 (shipped, Slice 1) | existing `military_presence` (geographic disjointness from Gate 3 stays) |

**Science as two-way intel signal (R-M2, owner design):** a foreign science vessel
over my system / my planned system = "what do they intend?" — it raises their
known-interest in that system in my eyes, and generates an observer response by
personality: xenophage/isolationist → expulsion/escort; expansionist → **rush claim
of the threatened system** (accelerate colonization of my own planned buffer);
science-objective → joint-research proposal. Symmetric: the player's probe over
their buffer tells them the player is looking. Requires exposing **claim intent**
(EmpireStrategySystem already holds colonization targets; surface them to the
matrix as data — do not invent a new planner).

**Personality multipliers and the predecessor-guard ladder apply throughout** —
every escalating row inherits the L(n)→L(n+1) lesson from Slice 1.

## 4. Encounter protocol (contract only, future-proofing)

Event: `encounter:neutral { vesselA, vesselB, systemId, armedA, armedB, ownerA,
ownerB }` — emitted when two vessels of different owners share a neutral system.
Ships now with ONE consumer: DebugLog entry (+ optional `surveillance`-class
incident when one side scans). Full behaviors (ignore / scan / greet / shadow /
skirmish) are matrix rows added when AI civilian and military traffic exists
(post-W2 / Slice 2-3). Skirmish outcomes route per P3 (tension, not exhaustion).
The contract is written now so no intermediate design closes the door (P1 note).

## 5. Areas B.1–B.8 (master plan), updated state

1. **MilitaryBrain** → §2 P1. W1 ships two doctrines on posture.
2. **AI military economy** → production upgrades land with W2 (P4); buildup
   triggers (arms race) stay Slice 3 / Director rules.
3. **Ship construction & templates** → shipped in Slice 1 (catalog v1, resolver,
   economy-executes, TTL). Grows: tier-2 modules, archetype flavors, a "system
   engine" tier (30t dead-mass finding), science hull for flybys — owner authors,
   zero code changes (format proven).
4. **Threat assessment** → W1: one shared module reading derived strength (P2);
   consumed by acceptance (`relative_power`), doctrines, and future Director rules.
   Includes the R2 fix.
   > ⚠ **Direction correction (W1-3b, orchestrator ruling 2026-08-14).** `relative_power` first
   > shipped as *"+1 = evaluator STRONGER"*, which inverts `DIPLOMACY_BACKBONE §2.1`
   > (*"weaker side more agreeable"*) — a dominant AI signed everything and, on `offer_peace`,
   > a **winning** empire became more willing to settle. Treated as a **spec contradiction, not a
   > balance knob**: the D2 weights were authored against a stub returning 0, so the direction was
   > never validated. Sign inverted to match the backbone; **weight magnitudes untouched (D4)**.
   > Full register entry: `W1_PLAN.md` §Decisions taken 15.
5. **Fleet reconciliation** → §2 P2 (transition plan in W1/W2 plan docs).
6. **War accounting** → §2 P3. Skirmish category lands W1.
7. **Space combat depth** (repair, salvage, capture, DSCS tactics) → W3+, after
   the deploy model; salvage naturally feeds the storage layer from P4.
8. **Post-conquest & territory transfer** → W3+, defined core in §6a
   (occupation state, treaty term slots, both-direction cession); aligned with
   the recorded P1 intent (capital strikes, invasion); consumes
   DIPLOMACY_BACKBONE peace terms and reaches back into D4's `declare_war`
   (war goals dependency).

## 6. Slice plan

**W1 — repairs & foundations (no save-model changes).**
R2 fix (estimatePlayerMilitary) → derived-strength v1 (compute from real hulls;
reconciliation write-back) → shared ThreatAssessment module → un-stub
`relative_power` in the acceptance engine (matrices re-run in BALANS — expect
acceptance shifts, tune with E7 instruments) → skirmish category in WarSystem →
two doctrines on posture → courier diagnosis (P6) → `FLEET_AGGRO_INTERVAL`
deletion. Gate: threat numbers visible and sane in a live game; a border skirmish
produces tension not exhaustion; doctrines observable (home garrison holds, border
patrol moves).

**W2 — the deploy model (P4).** Build/storage/deploy for player and AI, crew at
deploy, production upgrades for war commodities, mobilization visibility for
intel. Own plan doc with the three open P4 questions; own gate; likely save
version bump (stored-fleet state) — first bump since v100, plan the migration.

**W3+ — offensive AI & territorial peace (recorded P1 intent + owner ruling
2026-08-13):** target selection, capital strikes, invasion; space-combat depth;
and the defined core of post-conquest — **wars end at a table with celestial
bodies on it** (§6a). Scoped after W1/W2 land.

### 6a. Territorial peace — signed direction for W3 (owner, 2026-08-13)

Two paths for celestial bodies to change owners:

1. **Wartime conquest (fait accompli):** invasion + occupation during war — the
   colony/system transfers physically, but its status is **occupied**, not
   annexed, until a treaty settles it. Ownership transfer on invasion already
   works (audit §2); the missing layer is occupation-as-distinct-state
   (`CAPTURE_GRACE_YEARS` has been waiting in the code for exactly this).
2. **Peace treaty (legalization or exchange):** `offer_peace` gains **term
   slots** — celestial bodies/systems join credits as offerable/demandable
   items, in BOTH directions: the winner demands keeping conquests (or bodies
   never taken, as the price of peace); the loser may CEDE territory to buy the
   war's end. The Acceptance Engine prices it: exhaustion × value of demanded
   territory × casus-belli peaceCost × personality pride. A xenophage never
   cedes its homeworld (personality floor, per the D4 personalityFloor ruling);
   a pragmatist cedes a border colony at exhaustion 80.

Parked for the W3 plan doc (proposals attached, owner rules then): occupation
mechanics (production for the occupier? unrest? grace years); captured
population's fate (stays and assimilates — integrates with Population 2.0);
peacetime cession (`territory_exchange` verb, CK-style trades — future);
**war goals** — whether a war is declared "about something" (a goal fixed at
declaration, Vicky-style), giving the war shape and the Acceptance Engine an
anchor for pricing peace. War goals reach back into `declare_war` (D4) — flag
the dependency when D4's plan doc is written.

**Interleaving:** reaction-matrix civilian rows (§3) implement as Director Slice 2
rules once W1's threat module exists; demand-channel UI (popup choices) remains
Slice 2's separate prerequisite as flagged in DIRECTOR_SLICE1_PLAN §Kolizje.

## 7. Open questions parked for slice plan docs

W1: exact combat-value formula for derived strength (module weights; two armor
types today, more later — table must be data); skirmish trigger conditions
(anyArmed? both armed? aggression gate?). W2: the three P4 questions; storage cap?
(proposal: none — shipyard throughput is the limit); migration shape for stored
fleets. W3: war goals taxonomy; invasion rework scope vs existing ground combat
(audit §2 assessment stands: functional but RNG unseeded, R13).
