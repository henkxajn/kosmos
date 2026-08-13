# W1 — repairs & foundations · plan doc (APPROVED)

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** B · **Slice:** W1 · **Status:** ✅ **COMPLETE 2026-08-14** — all three gates PASSED, eleven commits, fifteen decisions signed
**Parent:** `WAR_BACKBONE.md` §6 (P1–P7 signed 2026-08-13) · **Siblings:** `DIPLOMACY_BACKBONE.md`, `DIRECTOR_SLICE1_PLAN.md`
**Basis:** read-only seam audit 2026-08-14 (this doc §Audit) + `docs/audit/COMBAT_DIPLO_AUDIT.md` §1/§3 (2026-08-05, superseded in parts)
**Save:** v100, **no save-model changes** (hard constraint, P7)

**Language convention (signed 2026-08-14):** design and plan docs in the war-backbone chain are **English**
(citation and terminology consistency with the parent). Gate checklists and RESUME session scripts stay
**Polish** — they are Filip-facing and read at the console under time pressure. `D2_PLAN.md` and
`DIRECTOR_SLICE1_PLAN.md` stay as they are; no retro-translation.

---

## RESUME — start świeżej sesji (czytaj to PIERWSZE)

**Stan:** dokument `WAR_BACKBONE.md` **PODPISANY**, ten plan **ZATWIERDZONY** — wszystkie decyzje
(1–14) podpisane przez orkiestratora 2026-08-14. **Wdrożenie NIE rozpoczęte.**

**Start:** od **W1-0** wg dziewięciu commitów z §Commit plan. Kolejność wiążąca, decyzje podpisane —
**bez ponownej dyskusji**. Zatrzymanie na każdym etapie gotowym do gate'u.

**Pierwszy raport:** po rodzinie commitów **K-1/R2** (W1-0 + W1-1) — z **poprawionymi komentarzami**
(`AcceptanceEngine.js:56-60`, `AcceptanceWeightData.js:61-65`, oba kłamią o skutku naprawy) oraz
z macierzami **E7 before/after** (para ląduje przy W1-3 / GATE 1).

⚠ **Reguła V19 — wykonać ZANIM ruszy pierwszy przebieg macierzy.** `src/testing/reports/balans/`
jest w `.gitignore`; leży tam **nieśledzony i NIEAKTUALNY** baseline (sprzed nadpisań objective z E5),
a runner **nadpisuje dokładnie ten plik**. Skopiuj go na bok **PRZED** jakimkolwiek uruchomieniem
i diffuj `payload.matrix.cells`, nie plik (`seeds[].series`/`panel` są zależne od przebiegu).

**Stałe reguły skryptów gate'ów** — §Verification (live gates) niżej; obowiązują wszystkie, każda
kupiona błędem. W szczególności: one-linery **WYKONANE na żywym silniku** przed wpisaniem do
checklisty, i **nigdy** gate równolegle z pracą CC.

---

## Audit method and confidence

Seven read-only seam audits, each followed by an adversarial verification pass instructed to **refute** the
first pass's load-bearing claims (14 agents, ~3.3M tokens, 778 tool calls). Verdicts are labelled:
**CONFIRMED** (verifier reproduced the claim independently), **NARROWED** (true, but the load-bearing
wording was wrong), **REFUTED** (the claim is false). Claims only one pass could establish are marked
*single-pass*, per Slice 1's convention.

The audit overturned its own brief twice, and both overturns change W1's shape. They are §Corrections.

---

## Context

W1 is the repair slice. It clears four standing debts (R2, R10, the R6/R14 residue, dead
`FLEET_AGGRO_INTERVAL`), builds the one shared module the rest of the war backbone reads
(ThreatAssessment), and un-stubs the diplomacy term that has been returning a literal zero since D2/E1.
Nothing here is new gameplay for its own sake: every piece exists because a *named* consumer is currently
blind. W2 (the deploy model) needs `relative_power` live before it can price mobilization decisions, which
is why P7 put repairs first.

What the audit changes about that framing: **the repairs are smaller than the doc assumes, and the
foundations are larger.** Two of the four debts turn out to be already-dead paths rather than broken live
ones, while two consumers nobody listed — orbital dominance, and the player-facing "Siła wojskowa ≈ 0"
readout — are quietly broken by the same missing number.

---

## Corrections to WAR_BACKBONE

The doc must absorb these before W1 starts. Three of them invalidate warnings that have been copied
forward through four documents.

### K-1 — The R2 fix cannot push empires into AGGRESSIVE/WAR. It changes nothing at all. **[REFUTED]**

`WAR_BACKBONE §1.3`, `COMBAT_DIPLO_AUDIT` R2, `D2_PLAN` K-1 and decision 2, `DIRECTOR_SLICE1_PLAN`
decision 5, and `WOJNA_I_POKOJ_MASTER_PLAN §Next horizon` all repeat the same warning: repairing
`estimatePlayerMilitary` "moves `milRatio` from ~0 to real values and can immediately push empires into
AGGRESSIVE/WAR."

That is false, and the reason is one line above the estimator:

```js
// AlienCivSystem.js:106
const milRatio = playerMilEstimate > 0 ? (emp.military?.power ?? 0) / playerMilEstimate : 1.0;
```

The **numerator does not exist.** `EmpireRegistry.createEmpire` (`:74-98`) builds the empire object from an
explicit whitelist with no `military`, no `resources` and no `tech` key — it silently **drops** them even
when a caller passes them (`SpawnTestEnemy.js:97` and `CombatSandbox.js:383` both pass
`military: { power: 200 }`; both are discarded). `updateMilitaryPower` is a documented no-op
(`EmpireRegistry.js:155`), and `_migrateV75toV76` **throws**, so no pre-Slice-1 save can smuggle the old
shape in. Both estimators floor their denominator at 100, so the ternary always divides.

`milRatio ≡ 0` before the fix and `milRatio ≡ 0` after it. `_decideNextState` compares it only against
constants (`:173/179/184/189/191/196/201`), so FSM transitions are byte-identical. `MilitaryAI` is
unaffected for independent reasons: `attack_player` multiplies by `ownMil = 0`, and `build_fleet` returns
at the `production` gate (`:123-124`) before it ever reaches the estimator.

**Consequences.** (a) R2 is a *correctness* fix and a *prerequisite*, not a lever — it needs no gate.
(b) The real lever is a **strength source for the AI side**, which is what ThreatAssessment supplies.
(c) Two in-repo comments assert the wrong consequence and must be corrected in the same commit, or the next
reader re-derives the same wrong expectation: `AcceptanceEngine.js:56-60` and
`AcceptanceWeightData.js:61-65`.

### K-2 — There is nothing to transition: the abstract ledger was never populated. **[REFUTED]**

P2 specifies "two-way reconciliation while both exist; the abstract ledger dies at the end of the
transition." **The transition period is void.** `gameState.empires[].fleets[].strength` has exactly two
producers: `MilitaryAI.build_fleet` (structurally unreachable — its score returns 0 at the `production`
gate, and `UtilityAI` only executes actions scoring > 0) and the debug cheat
`SpawnTestEnemy.spawnEnemyFleet`. In a shipped game `empire.fleets` is always `[]`.

Meanwhile the *inverse* is true and nobody wrote it down: since Director S4/S6 (kill-switch
`FEATURES.reactionDirector` default ON, `GameConfig.js:266`) **AI empires own real, ownership-stamped
warships** built through the normal economy (`DirectorProduction.js:382` → `ColonyManager.startShipBuild`,
stamped at `:220`), plus first-contact probes (`DirectorFirstContact.js:132-153`). There are live AI
military assets with **no abstract representation at all** — the opposite of the gap P2 describes.

Two further paths are dead on the same evidence: `EmpireFleetMaterializer`'s automatic trigger is
unreachable (`spawnFleet` never sets `materializationState`, and the one migration that would stamp it
reads `data.gameState.empires` while the real save nests at `data.civ4x.gameState.empires`), and its
`_pending` map is never populated for AI-dispatched fleets (`etaYears ≥ 3 > ETA_WINDOW_CIV_YEARS 2`, and
nothing re-checks). `FEATURES.unifiedAggregator`'s skip therefore never fires either.

**Signed narrowing (orchestrator, 2026-08-14) — register entry, verbatim:**

> **P2 (narrowed by audit refutation, orchestrator 2026-08-14):** transition void — `empire.fleets` always
> empty in normal play; derived strength ships as pure read-model; shim for debug/legacy only; abstract
> ledger documented as dying, deletion parked for W2/W3 cleanup.

Rationale for accepting the narrowing rather than the signed text: a stateless read-model is **stronger**
than what was signed. There is no second store to desync, and P2's goal — strength as a derivative of real
hulls, R10 dead as a class — is achieved immediately rather than at the end of a transition that has
nothing to transition. `WAR_BACKBONE §2 P2` carries a one-sentence audit-correction pointing here.

### K-3 — "carries a warId" is not the accounting line. **[CONFIRMED, and sharper than the doc]**

P3 phrases the fork as "every battle carries a `warId` OR is a skirmish". The real fork is **"went through
`recordBattle` or did not"**, and the two are not the same set:

- Exhaustion is credited in exactly one place — `recordBattle` (`WarSystem.js:168-169`) — which
  early-returns on a missing war (`:143-144`). `grep changeExhaustion src/` returns three hits, all inside
  WarSystem. So **a warId-less battle already cannot credit exhaustion**: the firewall P3 wants exists
  structurally, as a side-effect of bypass rather than as policy.
- But `EnemyAttackHandler` emits `battle:resolved` **with a real `war.id`** (`:178`) and *still* bypasses
  `recordBattle`: it writes `gameState.battles` inline (`:171`) and re-implements orbital dominance
  (`:174-176`). It even **declares the war itself** first (`:110-118`) before failing to account for it. So
  an orbital attack during a declared war credits **zero exhaustion** and never appends to `war.battles[]`
  — invisible even in `WarOverlay`, which reads that array.

This matters because exhaustion is the load-bearing input to peace acceptance
(`AcceptanceEngine._buildWarContext:340-357`, weight 55 on `offer_peace`): the D2 peace evaluation
systematically **underprices exactly the wars being actively fought**. It is the same defect class as audit
R6 (DSCS `warId: null` ⇒ zero exhaustion), found one layer deeper.

**Signed ruling (orchestrator, 2026-08-14) — register entry, verbatim:**

> **P3 (completed, not narrowed):** EAH bypass closed — `recordBattle` is the single entry point; the
> warId-vs-skirmish fork is now exhaustive (every battle is war-accounted or skirmish, no third silent
> path). Fail-first keeper: an EAH battle with `warId` that does NOT reach `recordBattle` turns red.

### K-4 — `patrol_border` is not expressible with existing machinery. **[NARROWED → redefined]**

`InfluenceMap` speaks in **systems at LY scale** (`isInBorderZone(systemId, ownerId)`); `MovementOrderSystem`
orders are **in-system coordinates**. No helper bridges the two (*single-pass*: InfluenceMap's public
surface and the MOS patrol path were both searched). Separately, AI colonies do not stock `fuel` and
`_issueMoveToPoint` hard-rejects on `insufficient_fuel` (`:513`) — `AutoRetreatSystem` already needed an
explicit `bypassFuelCheck` retry (`:107-114`) for exactly this reason.

**Signed ruling (Filip, 2026-08-14):** `patrol_border` ships as an **in-system standing patrol** — a
station-keeping loop on the **outer orbits of the AI's own home system**, i.e. the side a player arrives
from. The doc's "border" intent survives as *the approach to my space*; true inter-system patrol waits for
W2's deploy model. No LY→in-system bridge, no new machinery — the minimalism law (P1) holds.

### K-5 — The courier was never mis-keyed. **[NARROWED]**

`WAR_BACKBONE §1.2` finding 3 describes the courier path as "keyed to outposts" in a way that implies a
mismatch. There is **no mismatch**: `bootstrapAutonomousOutpost` calls `empireRegistry.addColony`
(`EmpireColonyBootstrap.js:452`, commented in-code as "fix #14"), `createOutpost` stamps
`isOutpost`/`planetId`/`ownerEmpireId` (`ColonyManager.js:496-503`), and the dispatcher's filter reads
exactly those fields (`EmpireLogisticsSystem.js:174-176`). The `strategicDeposits` half passes by
construction, because `_pickXeBody`/`_pickNtBody` only ever return bodies that already carry the deposit.

The path was dormant for one reason: **in the measured window no outposts existed.** Two further
corrections: the doc's "~year 7" is a unit conflation (the observation is **civYear 85 ≈ 7 displayed
years**, `CIV_TIME_SCALE = 12`), and today's real blockers differ from the diagnosis — see W1-6 and
§Findings filed.

*Narrowing from the verification pass:* `getColoniesByEmpire` resolves ids through `cm.getColony` and
silently drops unresolvable ones, so `emp.colonies.length` is **not** a safe outpost count after a
`transferColony` (which deletes the colony object *before* re-adding the id).

### K-6 — R3 (unarmed materialized fleets) now describes only a dead path. **[REFUTED as stated]**

`composeFromStrength` does emit `modules: []` (`FleetCompositionPolicy.js:78`), but that path runs only
through the materializer, which is unreachable (K-2). AI warships that actually exist carry real weapon
modules from the S3 template catalog. R3 is therefore not a live defect — it dies with the ledger.
(Also worth recording, since the audit doc states it the other way round: DSCS's `anyArmed` gate is an
**OR**, so armed-vs-unarmed *does* start a fight; only both-unarmed is refused.)

---

## Decisions taken

1. **P2 ships as a pure read-model** (signed narrowing, K-2). `ThreatAssessment` computes empire and player
   combat value by summing over `VesselManager`, grouped by `ownerEmpireId`. No new stored state, therefore
   no save-model change. The write-back shim (vessel losses → `fleets[].strength`) covers **debug-spawned
   and legacy-save fleets only**, and is labelled as such in code.
2. **The combat-value unit is anchored to HP.** `empireFleetToBattleUnit` sets `hp = strength` 1:1
   (`BattleSystem.js:205`) and `WarSystem:392` subtracts HP-delta losses straight off `fleet.strength` — the
   identity is *enforced by code*, not convention. Anchoring the derived value to the same unit keeps every
   scale-sensitive consumer meaningful without touching any of them: `composeFromStrength`'s
   `floor(strength/50)`, `InvasionSystem.MIN_SURVIVING_STRENGTH_TO_LAND = 30`, `MilitaryAI`'s `strength > 30`
   gate, and the battle **seed** (`floor(year * 7919 + fleet.strength)` — a rescale would change the whole
   battle stream, not just the stats).
3. **The weight table prices FIELDS, never module ids** — `hp`, `armor`, `evasion`, `damage`, `shieldHP`,
   `shieldRegen`, `armorRating`, `hpBonus`. A third armor type, or any new module, is then priced
   automatically with zero code change. This is the concrete answer to §7's "two armor types today, more
   later — table must be data". Balance lives in `src/data/CombatValueData.js` and nowhere else.
4. **Read cost: memoized per tick, dirty-flag invalidated.** *(Answer to the orchestrator's standing
   question — a conscious decision, not a profiler surprise during BALANS.)* The naive cost is not
   negligible: `AlienCivSystem` runs up to **8 tick-steps per frame** (`MAX_STEPS_PER_TICK = 8`, `:62-65`),
   calling the player estimate once per step **plus** once per empire inside `MilitaryAI.attack_player.score`
   — roughly `8 × (1 + N_empires) ≈ 56` calls per frame at high game speed with six empires, each O(all
   vessels) with a `SHIP_MODULES` lookup per module. At a realistic 50–200 vessels that is tens of thousands
   of lookups per frame, growing with every AI warship built, and it multiplies again inside the headless
   BALANS bots. **Decision:** `ThreatAssessment` holds a `Map<ownerId, value>` recomputed lazily behind a
   `_dirty` flag, invalidated on `vessel:created` / `vessel:wrecked` / `time:tick` — the pattern already
   shipped twice in this repo (`TerritoryService` `_dirty` + `_ensure()` at `:24/38/67`; `SystemPoolService`
   `_ensureFresh` at `:37/68`). Cost becomes O(V) once per tick regardless of caller count. A keeper pins
   the invalidation, because a memo without an invalidation test is a stale-value bug waiting for a gate.
5. **The acceptance term stays pure.** `AcceptanceEngine` terms are pure `(ctx, verbCfg) => raw ∈ −1..+1`,
   reading **only** the snapshot ctx and never a collaborator. Strength is therefore injected into ctx by the
   **context builder**, and `relative_power` **must degrade to raw 0 when its ctx field is absent** — this is
   what protects E2's parity anchors, because `DiplomacyTelemetry.matrixBaseContext` feeds no strength field
   at all.
6. **EAH is redirected through `recordBattle` in W1** (signed, K-3), with its own gate step and a
   before/after note. This is a deliberate behaviour change: wars begin exhausting on orbital attacks.
7. **Doctrines are catalog data + one registered action** — no new engine. The registrar must run **before**
   `new DirectorSystem()` (the constructor resolves every catalog name and throws on a miss,
   `DirectorSystem.js:64/117`) and must pass `{ allowOverride: true }` like all three existing registrars.
8. **No new top-level `gameState` key.** `restore()` merges only keys present in `createDefaultState()`;
   `orbitalDominance` is the live casualty of ignoring this — written and read at runtime, **wiped on every
   load** (`GameState.js:52-55`). All W1 state nests under the existing `director` / `wars` / `battles` /
   `diplomacy` domains.

### Signed 2026-08-14 (orchestrator) — the six that were open at draft

9. **Combat-value weight table prices FIELDS, never module ids** — `hp`, `armor`, `evasion`, `damage`,
   `shieldHP`, `shieldRegen`, `armorRating`, `hpBonus` — with the aggregate anchored to the **HP unit**
   (decision 2). Both armor types today are priced through `armorRating`, so a third needs no code; this is
   the concrete answer to §7's "table must be data". Starting weights live in `CombatValueData.js` and are
   tuned against E7/BALANS, never in code.
10. **No new skirmish trigger.** A skirmish is the **complement** of war-accounted, classified at the
    accounting seam — which is what makes the fork exhaustive by construction (the signed "no third silent
    path"). An arming gate would be a second policy, and it is already enforced upstream: DSCS refuses
    **both**-unarmed encounters, so an unarmed pair never produces a `battle:resolved` at all.
11. **Doctrine tick host = `AlienCivSystem._tickAll`** — it already carries the Director hook, gives one
    evaluation point and therefore one audit point, and runs at 1 civ-year. *Rejected:* `EmpireStrategySystem`
    (P1 names its cadence, but it has zero Director awareness — hanging doctrine execution there is a new
    subscription, not a hookup) and a private `time:tick` (a third clock inside one workstream).
    ⚠ A **roll-less** rule has no once-per-displayed-year throttle — that gate lives inside `if (rule.roll)`
    — so a doctrine rule must carry either a `roll` or a `cooldown`, otherwise it fires **12×** per displayed
    year.
12. **Doctrine order channel = `MOS.issueOrder` with `bypassFuelCheck`**, matching `AutoRetreatSystem`'s
    production precedent, rather than `dispatchOnMission` (which clamps fuel silently and bypasses the order
    system entirely). AI colonies do not stock fuel, so without the bypass a repeating patrol is eventually
    refused. The bypass is a **stated** consequence, not a hidden one — it belongs in the gate script.
13. **DSCS's ledger write stays where it is (not in W1).** Closing EAH — the one that carries a warId and
    therefore *should* be accounted — makes the fork exhaustive; DSCS's write is a skirmish record with no war
    to account against, so routing it would be churn without a behaviour change. Revisit when AI↔AI battles
    need records (D5).
14. **`defend_home` uses a sibling key, not `director.posture`.** The pressure keeper pins `posture`'s exact
    three-field shape, and V12 shows `level` is not even monotonic (L1 can overwrite an L2 stamp after its
    5-year cooldown) — a poor state source for a doctrine. Both options were migration-free; this one does not
    fight an existing pin.
15. **`relative_power` direction fixed to the signed backbone intent (W1-3b, orchestrator ruling,
    2026-08-14) — register entry, verbatim:**

    > **`relative_power` direction fixed to signed backbone intent; D2 weights were stub-era, never
    > direction-validated.**

    W1-3 shipped the sign as *"+1 = evaluator STRONGER"* with positive weights, which inverts
    `DIPLOMACY_BACKBONE §2.1` (*"relative_power — weaker side more agreeable"*). The observable
    consequence was backwards: a militarily dominant AI signed everything and a weak one refused,
    and on `offer_peace` (weight 30) a **winning** empire became more willing to settle — whereas
    winners press an advantage and losers seek the table. This is a **spec contradiction, not a
    balance knob**: the D2 weights were authored against a stub returning a literal 0, so the
    *direction* was never validated because there was nothing to validate. The backbone is the
    authority. **Weight magnitudes are untouched (that remains D4);** only the sign semantics move.
    Implementation: the term calls `relativePowerRaw(other, self)` — the shared formula in
    `ThreatMath` keeps its natural meaning (*"how much does A dominate B"*, which W1-5's doctrines
    read), and the inversion lives in the term where the semantic belongs.
    ⚠ The 0/210 E7 diff from W1-3 was measured on the **inverted** direction and does **not** carry
    forward; a fresh before/after pair is attached to the W1-3b commit and to `W1_GATE1_CHECKLIST.md`.


---

## Audit — state of the seams (read-only, with verdicts)

| # | Seam | State | Load-bearing detail |
|---|---|---|---|
| V1 | `UtilityAI.estimatePlayerMilitary:102` | **partial** | Live, but its fleet term is structurally 0. Adds `getAllColonies().length * 40` — and `getAllColonies` **includes AI colonies**, so every AI colony founded anywhere raises "player strength" by 40. |
| V2 | `AlienCivSystem._estimatePlayerMilitary:247` | **stub** | Returns the literal `100` for every possible game state. Has **drifted** from V1 (no colony term, has a try/catch) — two separate edits, and the two disagree about what the baseline means. |
| V3 | `vessel.modules` ground truth | **real** | Flat array of module-id **strings** on every writer (`Vessel.js:112/168`, `VesselManager.js:1118/1241`, all nine spawn paths). *Narrowed:* design templates carry **`null` holes** for empty slots, and two live readers still branch on the object shape (`OrbitalRolesData.js:124-127`, `SaveMigration.js:1710-1714`) — an unenforced convention, so the fix must be null-safe. The `.id` shape belongs to `Station.modules`, a different entity, and is the likely origin of the bug. |
| V4 | Canonical weapon test | **real** | `Vessel.hasWeapons:479` (`slotType === 'weapon'`). *Narrowed:* it is **one of three** inconsistent predicates — `slotType`, `stats.damage != null` (DSCS `:1026`), and id-prefix — which **disagree on real data** (`orbital_strike_battery` has the slot but no top-level damage). Reusing `hasWeapons` is a semantic change, not a neutral refactor: it drops `armor_`/`shield_` from the estimators' count. |
| V5 | Ownership / wreck filter | **defect** | **Neither estimator filters owner or wreck.** Today the always-false predicate masks it; after the fix, enemy hulls and wrecks would inflate "player military" — a booby trap that fires exactly when an AI fleet appears. Note `isEnemyVessel` is a *stamp* test: an unstamped vessel reads as the **player's** (Slice 1 finding 1). |
| V6 | `empire.military.power` / `empire.resources` | **dead** | Zero writers post-Slice-1; the `createEmpire` whitelist drops them. This is the missing numerator (K-1) and the reason `MilitaryAI` is a silent zero. |
| V7 | `empire.fleets[].strength` | **dead data, live readers** | One definitional field, **eleven** write sites across four systems — three of which bypass the intent methods `EmpireRegistry`'s own header declares mandatory. Every reader is live code operating on an empty set. `updateFleetStrength` **auto-destroys the fleet at ≤ 0**, so a derived value that legitimately reaches 0 would delete persisted rows. |
| V8 | `WarSystem.recordBattle:142` | **real** | Sole exhaustion producer, sole `war.battles[]` appender, sole `_updateOrbitalDominance` caller. Two callers, both internal. |
| V9 | `EnemyAttackHandler:178` | **defect** | Emits with a real warId, bypasses `recordBattle`, and **declares the war itself** (`:110-118`) before failing to account for it. Its no-war branch persists no record at all. |
| V10 | `battle:resolved` emitters / subscribers | **real** | Five emitters, nine subscribers. **None of the nine touches exhaustion, tension, opinion or memory** — the skirmish consumer is new behaviour, not relocated code. Two subscribers already branch on `warId`, so the category has a natural slot. Participant `type` takes three values with different field sets, and `lossesA/B` means **HP delta** in BattleSystem but **vessel count** in DSCS. |
| V11 | Tension / memory API | **real** | `DiplomacySystem.changeTension:282`, `addOpinionModifier:256`, `addMemory:310`; the sole writer of relation state is `RelationsModel`. *Caveat:* `changeTension` and `addMemory` **hardcode PLAYER** as one side — there is no AI↔AI facade (D5's problem). `INCIDENT_CHANNELS` (`AcceptanceWeightData.js:371`) is the anti-double-count registry a new incident **must** join. |
| V12 | `director.posture` | **write-only** | One writer, **zero behavioural readers**, never cleared. *Narrowed:* `level` is **not monotonic** (L1 can overwrite an L2 stamp after its 5-year cooldown), entries are never pruned for removed empires, `sinceYear` is in **displayed** years while the tick runs in civ-years, and on a **new game the key is `undefined`** — `initSubdomain` runs only on the restore path (`GameScene.js:1905/1927`). Any reader must be `?? {}`-defensive. |
| V13 | AI vessels as order targets | **real** | `MOS.issueOrder` has **no owner check**; `isImmobilized` exempts AI by construction; `AutoRetreatSystem` issues `moveToPoint` **exclusively** to AI vessels in production. *Narrowed:* issuance ≠ acceptance — the owner-agnostic **spaceport** and **fuel** gates do reject AI ships, which is why AutoRetreat carries a `bypassFuelCheck` retry. |
| V14 | Doctrine tick host | **missing** | `DirectorPressure` subscribes to **nothing**. Candidates run on different clocks: `AlienCivSystem._tickAll` (1 civ-year, already carries the Director hook), `EmpireStrategySystem._tick` (5 civ-years — the cadence P1 names, but it has **zero** Director awareness today), or a private `time:tick` (DirectorProduction / DirectorFirstContact precedent). |
| V15 | The doctrine's raw material | **real** | L1/L2 warships land **docked at the AI capital and nothing ever moves them**. `frigate_system_defender` has no warp tank **by design** — it is already a purpose-built `defend_home` asset. |
| V16 | `BattleSystem.resolveBattle:97` | **real, pure** | Zero imports, owner-agnostic, seeded. **No P3 work needed here.** The AI↔AI block is two early-returns in the *gathering* layer (`VesselCombatSystem.js:239`, `DSCS:244`), not in BattleSystem. |
| V17 | `playerVesselsToBattleUnit:219` | **real** | The hull-derived adapter **already exists**, and is already used to build **enemy** sides (`EnemyAttackHandler.js:123`; the code's own comment calls the name misleading). *Narrowed:* the parity gap versus DSCS is larger than two items — `hpBonus`, `techMult`, `DAMAGE_MULT 3.0`, `HIT_CHANCE_MULT 1.5` + 0.10 floor, per-weapon `rangeAU`/cooldown, persisted `combatDamage`, per-vessel vs mean evasion. A **third** derivation of the same stats exists (`calcShipStats`, `ShipModulesData.js:666`). |
| V18 | `relative_power` | **hard stub** | Literally `() => 0` (`AcceptanceEngine.js:61`) — not a missing case, not a status guard. The engine **never reads `TERM_STATUS`**; status is metadata consumed only by BALANS. Weights are authored and non-zero: trade_agreement 10, non_aggression 20, alliance 20, **offer_peace 30** (+ hegemon ×1.5). `offer_peace` has **no `personalityFloor` and threshold 0** — that is where un-stubbing moves the game most. |
| V19 | E7 instrument | **real, needs work** | The runner exists and its matrix is pure and seed-independent. But `matrixBaseContext` has **no strength field**, and `TERM_PROBES.relative_power` is a deliberate "nothing can move it" probe — flipping status to LIVE without replacing the probe fires a **false ⚠ `inertUnexpected`** and fails telemetry T4. `src/testing/reports/balans/` is **gitignored**; an untracked **stale** baseline sits on disk (it predates the E5 objective overrides) and the runner **overwrites that exact filename** — copy it aside before *any* run, and diff `payload.matrix.cells`, not the file. |
| V20 | Courier path | **real, dormant** | No keying mismatch (K-5). Real blockers: a per-empire **one-shot latch** (`logi.pendingBuildRoute`) with **no TTL and no `fleet:buildFailed` listener**; **new** shipyard contention with Director S6 warships on the same level-1 capital yard; and outpost scarcity (BALANS measured **8 of 16 empire-runs with zero outposts**, Ti deadlock). **No smoke coverage exists for this path at all.** |
| V21 | `FLEET_AGGRO_INTERVAL` | **dead** | `WarSystem.js:39` is its only occurrence in `src/` (re-verified during this audit). |
| V22 | Orbital dominance | **defect (adjacent)** | `playerHasOrbitalDominance` falls back to `_hasHostileFleetInSystem`, which scans **only** `emp.fleets[].strength > 0` — so a real AI warship parked in orbit does **not** deny the player dominance, and troop-drop UI stays enabled. Separately, the whole map is **wiped on every load** (absent from `createDefaultState`). |

**Blast radius of the un-stub** — keepers that go red *by design*; this is the fail-first proof, not a
regression: `acceptance_engine_smoke.mjs:241-242` (evaluator returns 0), `:477` (status STUB), `:483/:486`
(contributes exactly 0, looped over four verbs ⇒ four failures), `:398-400` (P7 parity boundaries 10/25/30
— the live margins say these **will** move); `balans_diplomacy_telemetry_smoke.mjs:150-151/158/167`; and the
sneaky one — `balans_launcher_smoke.mjs:331` asserts the **served HTML contains the string `BEZCZYNNY`**,
which disappears entirely once the only STUB term goes LIVE. `balans_diplomacy_report_smoke.mjs:48/121` is
**fixture**-based and will *not* fail (update for coherence, not as a gate).

---

## Commit plan

Atomic, one slice per commit, paths added explicitly. **Three live gates** — three independent failure
modes, and regression cannot otherwise be attributed (the house rationale from D2 and Director Slice 1).

| # | commit | content | gate |
|---|---|---|---|
| **W1-0** | `test(war): weryfikacja szwów przed W1` | NEW `src/testing/headless/probe-war-seams.mjs` + keeper `war_seams_smoke` — pins the audit's load-bearing facts **by execution**: `milRatio ≡ 0` today (K-1); an EAH battle carrying a warId does **not** reach `recordBattle` (K-3); `empire.fleets` stays empty over N ticks without a debug spawn (K-2). Also re-runs courier V4 on a horizon that **contains** outposts (≥200 civY, several seeds), recording `logistics:shipBuildRequested` and `logistics:courierClaimed` **separately** — the first proves the dispatcher fired, the second proves a courier completed. **Zero production code.** | — |
| **W1-1** | `fix(war): R2 — estymatory czytają modules poprawnie` | Both estimators (`UtilityAI.js:108`, `AlienCivSystem.js:258`) reuse `Vessel.hasWeapons`, **null-safe** (V3), **plus the owner/wreck filter neither has today** (V5). Corrects the two lying comments (`AcceptanceEngine.js:56-60`, `AcceptanceWeightData.js:61-65`). Expected observable change: **none** (K-1) — and the keeper pins exactly that. | — |
| **W1-2** | `feat(war): ThreatAssessment — siła wyprowadzona z realnych kadłubów` | NEW `src/data/CombatValueData.js` (weight table — balance **only** here) · `src/utils/ThreatMath.js` (pure: value of a hull + modules, aggregation) · `src/systems/ThreatAssessment.js` (memoized read-model per decision 4; exposed as `window.KOSMOS.threatAssessment`). **Stands alone — nothing imports it yet** (precedent: D2/E1, Director/S1). | — |
| **W1-3** | `feat(war): threat assessment zasila konsumentów + un-stub relative_power` | Wires the four blind consumers: `relative_power` via **ctx injection** (decision 5) · `AlienCivSystem` milRatio **numerator** · `IntelSystem.knownMilitary` (fixes the player-facing "Siła wojskowa ≈ 0") · `WarSystem._hasHostileFleetInSystem` (closes V22's dominance hole, runtime-only). Replaces `TERM_PROBES.relative_power` and adds a **neutral** strength field to `matrixBaseContext` (V19). E7 matrices **before/after attached**. | **GATE 1** |
| **W1-4** | `feat(war): kategoria skirmish + WarSystem jedynym księgowym` | Skirmish classification at the accounting seam plus its tension/memory consumer (new `INCIDENT_CHANNELS` member, new `OPINION_MODIFIERS` entry — precedent `first_contact_kill` / `border_pressure`, both landed at v100 with no migration) · **EAH redirected through `recordBattle`** (K-3, signed). ⚠ Deliberate behaviour change: **wars now exhaust on orbital attacks.** i18n PL+EN. | **GATE 2** |
| **W1-5** | `feat(war): dwie doktryny na postawie` | `defend_home` + `patrol_border` (in-system standing patrol, K-4) as catalog rules plus one registrar (`registerDoctrineBehaviors`, wired **before** `new DirectorSystem()`). Consumes the idle capital warships from V15. Reuses `AutoRetreatSystem._findNearestFriendlyPlanet`, which is already owner-generic. Resolves open decisions 3 and 4. | **GATE 3** |
| **W1-6** | `fix(ai): kurier — wyjście z zatrzasku pendingBuildRoute` | The **small** part of P6: subscribe `fleet:buildFailed` and give the per-empire latch an expiry, so a queued-but-unaffordable order cannot freeze courier construction permanently (V20). NEW keeper — this path has **no smoke coverage today**. The rest of P6 is **filed, not fixed** (§Findings filed). | — |
| **W1-7** | `chore(war): kasowanie FLEET_AGGRO_INTERVAL` | One-line deletion, isolated commit (precedent: the C8 prune `7201670`). Source-pin **with comments stripped first**, plus a **pin control** (memory `source-pin-strip-comments`). | — |
| **W1-8** | `docs(war): domknięcie W1` | `WAR_BACKBONE.md` corrections K-1…K-6 and both register entries verbatim · `CLAUDE.md` · `MEMORY.md` · this plan's results. | — |

**Per-commit gates:** `node src/testing/smoke/run-all.mjs` **0 FAIL** · `node tools/check-i18n.mjs` **PASS**
· grep for `window.KOSMOS?.` in any new decision path (audit R12, the loud-fail rule).

---

## Tests

Keepers in `src/testing/smoke/` (no `tmp_` prefix, imports via `../../`). **Fail-first proven by execution**
wherever possible — and every pin carries a **pin control**, because a pin without one is indistinguishable
from a pin that checks nothing.

**The pin-not-satisfiable-by-neighbours rule applies throughout:** a pin must go red when *its own*
mechanism is removed, and must not stay green because an adjacent mechanism produces the same observable.
Two places in W1 where that hazard is concrete, both handled in the keepers below:

- The skirmish incident must not be satisfiable by `DirectorPressure`'s `border_pressure`, which already
  writes an opinion modifier plus a same-id memory entry on combat-adjacent events.
- A doctrine order must not be satisfiable by `AutoRetreatSystem`, which is the *only other* system issuing
  MOS orders to AI vessels.

| keeper | commit | what it pins |
|---|---|---|
| `war_seams_smoke` | W1-0 | K-1 / K-2 / K-3 by execution. **Fail-first:** adding any `empire.military.power` writer must turn the `milRatio ≡ 0` pin red — that is what makes it a pin and not a description. |
| `threat_assessment_smoke` | W1-2 (pure) | The weight table drives the value (change a weight ⇒ the value changes) · an unarmed hull prices at hull-only value · a module-less materialized hull ≠ an armed template hull · **memo invalidation**: a new vessel changes the value on the next tick, and a stale read turns it red (decision 4) · degrades to 0 for an unknown owner · the **HP-unit anchor** holds (decision 2). |
| `acceptance_relpower_smoke` | W1-3 | raw ∈ −1..+1 · sign convention (+1 = evaluator stronger) · **degrades to raw 0 when ctx carries no strength field** (the E2 parity guard, decision 5) · all four verb weights actually move the score. Fail-first here is *structural*: the pins listed under §Blast radius go red and are rewritten in this commit. `balans_launcher_smoke:331` (`BEZCZYNNY`) must be updated **deliberately**, not incidentally. |
| `war_skirmish_smoke` | W1-4 | **(a)** a warId-less battle adds tension and a memory entry, and leaves `exhaustion` **byte-unchanged** — asserted on the *specific* memory type, so `border_pressure` cannot satisfy it. **(b)** **fail-first:** an EAH battle carrying a warId that does **not** reach `recordBattle` turns red (the signed P3 keeper). **(c)** the fork is exhaustive: no battle path is neither war-accounted nor skirmish. |
| `war_doctrine_smoke` | W1-5 | An idle armed AI vessel at the capital receives a doctrine order · the garrison **holds** with no threat · the patrol **moves**. **Not satisfiable by neighbours:** asserts `order.issuedBy` is the doctrine **and** that no `battle:resolved` preceded it (which excludes AutoRetreat). Plus `director.posture` survives `serialize → restore` **and** the new-game `undefined` path (V12). |
| `empire_logistics_courier_smoke` | W1-6 | NEW — the latch clears on `fleet:buildFailed`, and a second route can build after a failed one. The first smoke coverage this path has ever had. |
| source-pin | W1-7 | `FLEET_AGGRO_INTERVAL` absent from `src/` — **comments stripped first**, plus a pin control asserting the surrounding constants still exist, so a typo'd regex cannot pass silently. |

**Regression (must pass unedited):** `diplomacy_d1` · `diplomacy_opinion` · `diplomacy_time_units` ·
`diplomacy_migration_v100` · `empire_objective` · `director_pressure` · `director_ai_production` ·
`director_first_contact` · `director_feed_isolation` · `director_skeleton` · `director_seams` ·
`invasion_player_capture` · full sweep (**123** keepers today).
`acceptance_engine_smoke` is the single exception: its four `relative_power` pins are *expected* to fail at
W1-3 and are rewritten in that commit — nothing else inside it may move.

---

## Verification (live gates)

**GATE 1 (W1-3) — threat numbers.** On a live save with AI warships built: threat readouts are non-zero and
**sane** (an empire with three frigates ranks above one with none); the Intel panel stops showing
"Siła wojskowa ≈ 0"; a real AI warship parked in orbit **denies** the player orbital dominance (V22); and a
peace or treaty proposal shows a **non-zero `relative_power` row** in the refusal breakdown.
⚠ Two gate mechanics that will otherwise waste the run: the Diplomacy panel's buttons are gated by
`canPropose` (contact / not-at-war / no-treaty) and look **identical before and after** — verification
requires actually **submitting** proposals and reading the modal; and the modal caps at **`MAX_ROWS = 6`**
while `offer_peace` declares eleven terms, so a newly non-zero row **pushes another row out**. E7 matrices
before/after attached to the checklist (copy the untracked baseline aside **before** the first run, V19).

**GATE 2 (W1-4) — accounting.** A border skirmish produces **tension and a memory entry, and no
exhaustion**. Then the signed behaviour change, seen deliberately: an orbital attack **during a declared
war** makes exhaustion **visibly rise**, the battle appears in the war's battle list, and peace acceptance
shifts. Knock-on to check in the same run: auto-peace and peace-acceptance may fire **earlier** in wars with
heavy orbital combat. Re-run the E7 matrices and the BALANS war-related checks with before/after attached —
**if retuning is needed it happens in this commit family, with the evidence in hand**, not later by
surprise.

**GATE 3 (W1-5) — doctrines.** The home garrison **holds** (armed AI ships stop sitting inert at the
capital); the standing patrol **moves** on the outer orbits and is still visible on the 3D map after a save
reload. ⚠ Two known traps to check explicitly: an AI ship moved outside `VesselManager` must re-emit
`vessel:positionUpdate` or its 3D sprite never returns after load (`DirectorFirstContact.js:231-240`); and a
vessel in MOS-controlled motion with `dockedAt == null` must not hit the orbit-pin desync documented for
player Engage.

Standing gate-script rules (each bought with a bug, all still binding): **no multi-line code inside block
quotes** · capital **only** via `KOSMOS.directorProduction.capitalOf(empireId)` · read shortages **from the
engine**, never from a list in memory · `DebugLog` is a ring **cleared on reload** · **never run a gate in
parallel with CC work** · state levers only through validated tools. **Every one-liner must be EXECUTED on
the live engine before it is written into the checklist** (memory
`validate-gate-oneliners-on-live-engine`).

---

## Out of scope (deliberately)

The deploy model — build / storage / deploy, crew at deploy, production upgrades for war commodities,
mobilization visibility (**W2**, P4) · offensive AI: target selection, capital strikes, invasion (**W3+**,
the recorded P1 intent — W1 must not close the door on it, but builds nothing toward it) · AI↔AI combat
producers and the `changeTension`/`addMemory` player-hardcoding (**D5**) · per-empire tech state, i.e. AI
weapon and sensor multipliers (**W2/P5**) · arming `composeFromStrength` (audit R3 — **dead path, dies with
the ledger**, K-6) · deleting `empire.fleets` (**W2/W3 cleanup**, per the signed narrowing) · the
`orbitalDominance` load-wipe (fixing it edits `createDefaultState`, a save-shape change **W1 forbids**) ·
the first `MEMORY_EVIDENCE_WEIGHTS` member (**D4**'s, by its own pin's comment) · war goals (**D4/W3**) ·
ground-combat RNG seeding (audit R13) · reconciling the three divergent weapon predicates and the
`lossesA/B` unit collision (**filed below**) · the BattleSystem↔DSCS pricing parity gap (**filed below**).

---

## Findings filed (not fixed in W1)

1. **Courier — the part that is not small (P6).** Outpost scarcity is the real ceiling: BALANS measured
   **8 of 16 empire-runs with zero outposts** (all expansionists, Ti deadlock), and `cannot_afford_outpost`
   fired 993–1133 times against 19–32 outposts actually founded. That is a **BALANS** tuning item, not a W1
   repair. Second: Director S6 warships now contend for the **same level-1 capital shipyard**, a contention
   that did not exist when V4 was measured — so V4's conclusion cannot be carried forward unmodified.
   Scope estimate: both are measure-then-tune, roughly one BALANS slice.
2. **Three inconsistent weapon predicates** (`slotType === 'weapon'` / `stats.damage != null` / id-prefix)
   that disagree on real data. W1 reuses `hasWeapons` and does **not** unify them; unification is a balance
   decision and needs its own gate.
3. **`lossesA/B` unit collision** — HP delta in BattleSystem, vessel count in DSCS; same field name, same
   event. Contained today only because the HP-unit consumers (`WarSystem:392`, `InvasionSystem:160`) see
   only `'empire'`-typed participants. Any future AI↔AI adapter emitting `'empire'` participants from a
   hull-derived scale breaks that containment.
4. **BattleSystem↔DSCS pricing parity** — `hpBonus`, `techMult`, `DAMAGE_MULT`, `HIT_CHANCE_MULT`,
   `rangeAU` / cooldowns, persisted `combatDamage`, per-vessel vs mean evasion. The two engines price the
   same ship differently. W1's weight table prices fields DSCS already fights with, but does **not**
   reconcile the engines.
5. **`empire.fleets` has eleven writers across four systems**, three of which bypass the intent methods
   `EmpireRegistry`'s own header declares mandatory. Any future ledger work must not assume a single
   mutation chokepoint.
6. **Stale test fixture:** `src/testing/headless/test-empire-strategy-integration.mjs:102` still asserts
   that outposts are *not* in `empireRegistry` — contradicted by `EmpireColonyBootstrap.js:452`. Anyone
   validating W1 against that fixture draws the opposite conclusion about K-5.

---

## Results — W1 COMPLETE

| gate | zakres | wynik |
|---|---|---|
| **GATE 1** (W1-3) | liczby zagrożenia, intel, dominacja orbitalna, żywy `relative_power` | ✅ PASSED 2026-08-14 |
| **GATE 2** (W1-4) | potyczka vs wyczerpanie, EAH przez `recordBattle` | ✅ PASSED 2026-08-14 |
| **GATE 3** (W1-5) | doktryny: garnizon trzyma, patrol na posterunku | ✅ PASSED 2026-08-14 |

Keepery W1: `war_seams` 24 · `threat_assessment` 50 · `acceptance_relpower` 51 · `war_skirmish` 32 ·
`war_doctrine` 34 · `empire_logistics_courier` 10. Sweep 123 → **129**.

**Trzy commity, których w planie NIE BYŁO** — wszystkie z orzeczeń właściciela po gate'ach:
**W1-3b** (kierunek `relative_power` sprzeczny z backbone §2.1 — sprzeczność SPECYFIKACJI, nie
gałka balansu; wagi z D2 powstały przeciw stubowi, więc kierunku nikt nigdy nie zwalidował),
**W1-3c** (ciągły odczyt „Układ sił" w panelu intelu — kanał rozbicia akceptacji jest reaktywny
i milczy przy ZGODZIE), **W1-4b** (wyczerpanie asymetryczne wg WYNIKU bitwy — wygrywający naciska,
przegrywający szuka stołu).

**Pomiar do pliku R-2 (ponowny pomiar `BORDER_LY`):** AI zakłada PEŁNE KOLONIE ok. **civYear
303–353** (`bootstrapColony`: Ankaa e/g/h, Cor Caroli c/d/e, Rasalhague b) — oś czasu ekspansji
przesuwa się w DÓŁ kolejny raz (było ~456). Osobno: **0 outpostów przez 400 civY × 3 seedy**
(`probe-war-seams` W4), zero prób `cannot_afford_outpost` — te dwie liczby razem zmieniają
przesłanki i dla `BORDER_LY`, i dla P6.

**Przypadek testowy dla W2 (ekonomia):** zapis właściciela wszedł w spiralę śmierci utrzymania
floty (za dużo okrętów, ujemne kredyty). W2 dotyka kosztów magazynowania i rozmieszczenia —
to jest gotowy scenariusz regresyjny.

---

## Open decisions — NONE (all six signed 2026-08-14)

The six decisions this plan carried as open at draft — combat-value weight table · skirmish trigger
conditions · doctrine tick host · doctrine order channel · DSCS's ledger write · `defend_home`'s state key
— were signed by the orchestrator on 2026-08-14 and moved into **§Decisions taken 9–14**, each with the
rejected alternative recorded next to it. Nothing in W1 is awaiting a ruling; implementation proceeds
without re-litigation.

---

## Where this leaves the arc

W1 clears the debts and hands W2 a live `relative_power`, a shared threat number, and an accounting fork
with no silent third path. The two overturns (K-1, K-2) shrink the repair work and enlarge the foundation:
there is no dangerous FSM regression to guard against, and no ledger transition to manage — but there *is* a
whole class of AI military assets with no representation anywhere, which is precisely what W2's deploy model
will need to reason about.
