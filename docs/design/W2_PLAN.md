# W2 — the deploy model · plan doc (APPROVED)

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** B · **Slice:** W2 · **Status:** ✅ **APPROVED 2026-08-15** — all ten open decisions resolved (two owner rulings + eight orchestrator ratifications). Implementation proceeds without re-litigation.
**Parent:** `WAR_BACKBONE.md` §2 P4 + §6 (signed 2026-08-13; HANDOVER note 2026-08-14) · **Predecessor:** `W1_PLAN.md` (COMPLETE, three gates PASSED 2026-08-14)
**Basis:** read-only seam audit 2026-08-15 (this doc §Audit) · `docs/audit/COMBAT_DIPLO_AUDIT.md` (superseded in parts) · `DIRECTOR_SLICE1_PLAN.md`, `D2_PLAN.md`
**Save:** v100 → **v101** (first bump since v100; own commit, own gate)

**Language convention (signed 2026-08-14, `W1_PLAN.md`):** design and plan docs in the war-backbone
chain are **English**. Gate checklists and RESUME session scripts stay **Polish** — they are Filip-facing
and read at the console under time pressure.

---

## RESUME — czytaj to PIERWSZE (PL, wzór W1)

**Stan (2026-08-16, koniec sesji):** **W2-0…W2-8 ZACOMMITOWANE**, ostatni `3f8601d` (docs).
Sweep **136/136 OK, 0 FAIL** · `check-i18n` PASS (pl=en=3240) · zapis **v101**. Tabela ośmiu
commitów i dowody fail-first: §Results niżej. **GATE 1 ✅ · GATE 2 ✅ · GATE 3 ⏳ PENDING** —
nic nie padło, to kwestia harmonogramu.

**Jutro Filip prowadzi `W2_GATE3_CHECKLIST.md`** (pętla AI, osiem sekcji). Dwa warunki wstępne,
bez których gate nie ma czego pokazać: **(a)** zapis musi być ROZWINIĘTY — imperium AI potrzebuje
stoczni, stacji orbitalnej (żeton R-3) i techów okrętowych; **(b) gracz musi mieć ROZMIESZCZONE
okręty wojenne w służbie** — guard `empireOutgunnedByPlayer` porównuje SIŁY, więc flota w garażu
nie prowokuje nikogo i `slabszy: false` u wszystkich imperiów jest wtedy zachowaniem ZAMIERZONYM,
nie usterką.

**Po werdykcie PASS slice W2 się ZAMYKA** i rusza sekwencja domknięcia: ramki wyników w
checklistach → status planu → retrospektywa w `WOJNA_I_POKOJ_MASTER_PLAN.md`. ⚠ **Wybór następnego
horyzontu należy do Filipa i orkiestratora — NIE uprzedzać go w kodzie ani w planie:** W3 (ofensywne
AI + pokój terytorialny) vs Director Slice 2 vs BALANS z urosłą listą długów.

**Cztery długi niesione świadomie dalej (żaden nie blokuje zamknięcia W2):**
1. **Flota zmaterializowana omija model załogi** — `EmpireFleetMaterializer` tworzy kadłuby `active`
   z pominięciem obu szwów stoczni: nie kosztują AI ani jednego POP, a ich strata nikogo nie zabija.
   Wycena należy do **W3** (to główne źródło floty AI, więc to decyzja balansowa, nie higiena).
2. **Utrzymanie floty AI nienaliczane** — decyzja 14, świadoma asymetria, `PHASE5_TODO` przy guardzie.
3. **Opóźnienie zatrzasku zaległości** — §Findings filed 9: zapłata odblokowuje rozmieszczenie
   dopiero przy najbliższym rocznym rozliczeniu.
4. **Martwa naprawa statków** — `_tickRepair` czyta `entry.buildingId`, a wpisy mają `entry.building.id`;
   pinowane jako luka (`w2_crew_ledger` T11b), NIE naprawione (włączenie = zmiana balansu, własny commit).

**Trzy lekcje instrumentu, wiążące dalej:** „diff nie jest dowodem — dowodem jest ponowne uruchomienie
instrumentu" · **samo uruchomienie też nie wystarczy, dopóki nie sprawdzisz, że SONDA naprawdę zmieniła
zachowanie** (dowód na `delay` był NIEWAŻNY: duplikat klucza w literale, późniejszy `delay: 0` wygrywał) ·
jeden predykat (`isInService`), nie dziesięć testów pola.

⚠ **Zasady stałe gate'ów** (§Verification) obowiązują bez zmian, z dopiskiem z GATE 2: **nigdy nie
filtruj wpisów Dziennika po TEKŚCIE WYŚWIETLANYM** — Filip gra po angielsku, filtruj po rodzaju zdarzenia.

---

## Audit method and confidence

Nine read-only seam audits, each followed by an adversarial pass instructed to **refute** the first
pass's load-bearing claims, plus two cross-cutting critics (contradiction hunt, completeness sweep).
Verdicts use the W1 labels: **CONFIRMED** / **NARROWED** / **REFUTED**.

**Honest coverage statement.** 16 of 20 agents completed. Seven seams carry a completed adversarial
pass (vessel-state, shipyard-output, upkeep, crew, doctrine, save-bump, ui-surface). **Two seams —
`intel` and `war-commodities` — are SINGLE-PASS**: their verifiers died on API errors and the re-run hit
the account's monthly spend limit. Their claims are marked *[single-pass]* below and must be re-checked
at implementation time before anything load-bearing is built on them. The contradiction critic
independently re-read and **corrected one war-commodities claim** (C-5 below), which is the only
adversarial coverage those two seams received.

The audit contradicted its brief in five places. Those are §Corrections.

---

## Context

W2 builds the deploy model P4 signed: **build is industry, deploy is people.** A finished hull lands in
storage; committing crew (POP) turns it into a warship in service. The intended product is a strategic
object the intel layer can read — *"six frigates in storage, crew for three"* — and a mobilization that
is an observable event rather than a silent state flip.

W1 handed W2 exactly what P7 promised: a live `relative_power`, a shared threat number computed from
real hulls, an accounting fork with no silent third path, and doctrines with something to command.

What the audit changes about that framing: **the mechanism is smaller than it looks and the
preconditions are larger.** The interception point is two lines of production code. But the reserve this
slice is designed around **cannot exist for the AI today** for two independent reasons (C-5), the
"symmetric" baseline is not symmetric (C-1), and the crew ledger W2 must debit is already leaking in
every save on disk (C-3).

---

## Decisions taken

### The three P4 rulings (owner, 2026-08-15) — recorded verbatim

1. **R-A — STORED-SHIP UPKEEP:** *10% of full upkeep (maintenance/dock/watch). Cheap reserve, but a
   counted one — hoarding costs at scale.*
2. **R-B — DEPLOY DURATION:** *short but nonzero — ONE MONTH OF GAME TIME (displayed-time units, NOT
   civYears — the E6 unit-unification convention applies to every new constant in W2; state the unit in
   every comment and UI label from day one). Mobilization is an intel-visible event.*
3. **R-C — CREW FATE:** *crew DIES on ship loss, no escape pods. POP returns to the pool ONLY on a
   deliberate withdrawal to storage. War has a demographic cost — integrates with Population 2.0 and the
   W1-4b exhaustion asymmetry.*

**R-B unit resolution (arithmetic, not a choice).** `CIV_TIME_SCALE = 12` (`GameConfig.js:21`), so one
displayed month = **1.0 civYear** = 1/12 displayed year. The deploy timer therefore ticks in civYears —
the same clock as both ship-build queues (`ColonyManager.js:141→:954`, `StationSystem.js:401→:504`) and
the ground-unit `stateTimer` (`GroundUnitManager.js:545`). Constant, with the unit in the name and the
comment:
`DEPLOY_DURATION_CIVYEARS = 1.0 // 1.0 civYear = 1 displayed MONTH (CIV_TIME_SCALE = 12)`.
⚠ It must **not** reuse `VesselManager._maintenanceAccum`, which counts **game** years
(`VesselManager.js:1702-1704`) — the tick delivers both clocks in deliberately swapped-looking parameter
names (`:80-81`).

### Decisions this plan takes (open to owner override at review)

4. **The state bit is a new top-level `vessel.serviceState`** ∈ `'active' | 'stored' | 'mobilizing'`,
   with `vessel.mobilizeProgress` (civYears) alongside it. Added explicitly to **both** the serialize
   whitelist (`VesselManager.js:1104-1200`) and the restore literal (`:1225-1327`), defaulting
   `?? 'active'` — the `refuelAutomatically ?? true` / `directorOrigin ?? null` precedent.
   *Rejected:* a fourth `position.state` value (`'stored'`) — it round-trips free via the whole-object
   spread (`:1112`/`:1233`) but silently re-points every `state === 'docked'` test, including the two
   that must keep firing for stored ships (colony-loss cleanup `ColonyManager.js:573-582`, disband
   `:1932`) and the two that must stop (`_tickRefueling:1647`, `_tickRepair`).
   *Rejected:* a field nested inside `position` — it round-trips free for the same reason, and that is
   exactly why it is wrong: it hides the field from the explicit whitelist, which is the house's
   readability contract.
   ⚠ **Naming:** NOT `deployState` (owned by the ground-unit machine, persisted, with its own v57→v58
   migration) and NOT `reserve` as an identifier (`empire.logistics.reserve` already holds vessel IDs and
   round-trips through saves). PL UI wording *„rezerwa"* is fine.
5. **Storage intercepts at the two yard-completion sites, not at `createAndRegister`.**
   `VesselManager._onShipCompleted:1425-1432` (colony yard) and `StationSystem._spawnStationShip:513-529`
   (orbital yard) each pass `serviceState: 'stored'`. Every other creation path — materializer,
   first-contact probe, debug spawners, `migrateStringFleet` — keeps the `'active'` default and is not
   touched. Two edits, explicit, zero blast radius outside the yards.
6. **`ThreatAssessment` gains a second reading rather than changing its first.** `getStrength(ownerId)`
   becomes **deployed-only** (it is the *force* number: milRatio, `relative_power`, doctrines); a new
   `getPotentialStrength(ownerId)` keeps counting every non-wreck hull (the *potential* number: intel,
   UI). This is the mechanical form of the design story — *storage is potential, not force* — and
   because every legacy vessel migrates to `'active'`, the change is behaviourally continuous on load and
   only diverges as new hulls enter storage.
7. **Crew is per-vessel, not fungible.** New `vessel.crewLocked` (POP units, float) is the authoritative
   record of what THIS hull holds. Withdrawal and death debit exactly that number. Without it the model
   is unimplementable: `_lockedPerStrata` is an anonymous per-strata float bag with no vesselId
   back-reference (`CivilizationSystem.js:166`), which is why `_disbandVessel` currently refunds crew a
   station-built ship never locked and `_distributeUnlock` takes it proportionally out of *other* ships'
   locks (C-4).
8. **Legacy vessels are grandfathered at `crewLocked: 0`.** They migrate to `'active'` and hold no W2
   crew record, so losing or withdrawing them returns and kills nothing. Rationale: the pre-bump ledger
   is not reconstructible — AI colony-built hulls really locked crew, player station-built hulls never
   did (`StationSystem.js:331`), and `_lockedPerStrata` mixes ship crew with ground units, Surge and
   dead-path expedition locks. Any seeded number would be wrong for half the fleet, and wrong in the
   direction that steals POP from unrelated ships.
9. **`fleet:disbandRequest` is fixed in the same slice** to unlock `vessel.crewLocked ?? 0` instead of
   `shipDef.crewCost` (`ColonyManager.js:1979-1984`). This is a prerequisite of R-C, not a nice-to-have:
   R-C makes withdrawal the sanctioned POP-return path, and the only existing implementation of that path
   is a proportional theft.
10. **AI mobilization is a Director rule with `delay: 0`.** Poll trigger (`storedWarshipsAtCapital`) +
    guard + action `mobilizeVessels`, with `roll` so it inherits the once-per-displayed-year throttle
    (`DirectorSystem.js:212-213`). **Not** a Director `delay` — see C-7: `_firePending` carries a latent
    crash that is dormant only because every shipped rule has `delay: 0`, and one Director tick is
    already exactly one displayed month, so `delay` has no sub-resolution to express R-B with anyway.
11. **No `FEATURES` kill-switch.** Fleet maintenance — the mechanic R-A modifies — shipped without one as
    a declared *core mechanic* (`CLAUDE.md`, S3.5a-1), and a flag that has to be ON for the save
    migration to make sense is not a kill-switch. *Rejected:* a `reactionDirector`-style default-ON flag;
    it buys nothing once v101 exists.
12. **Save bump v100 → v101 is its own commit with its own gate** (owner instruction). Payload is exactly
    three per-vessel seeds and nothing else: `serviceState:'active'`, `mobilizeProgress:0`,
    `crewLocked:0`. **No drive-by schema changes** — in particular the queued `orbitalDominance`
    load-wipe fix (deferred by W1 *because* it edits `createDefaultState`) stays out. **Ratified —
    decision 20.**

### Signed 2026-08-15 — the ten that were open at draft

Two are **owner rulings** (both change player economy, recorded verbatim); eight are **orchestrator
ratifications** of this plan's recommendations. Nothing in W2 awaits a ruling.

13. **BASELINE SYMMETRISED UPWARD (C-1 resolved) — owner ruling, verbatim:**

    > **Build = industry only for BOTH sides; crew is charged at DEPLOY for both. The player pays POP
    > for crewing for the first time in the game's history; the station's zero-POP MVP asymmetry
    > (`StationSystem.js:331`) dies. AI's build-time POP gates move to deploy-time.**

    This is the decision that makes W2 a real change rather than a rename. Consequence: the player's
    warship economy gains a cost it has never had, and the *observable* effect at GATE 2 is that a
    station-built hull can no longer be sailed the moment it is finished.
14. **AI FLEET UPKEEP IS NOT CHARGED IN W2 — owner ruling, verbatim:**

    > **Explicitly NOT charged in W2 — deliberate, stated asymmetry with a `PHASE5_TODO` at AI economy.
    > (Removing the `isEnemyVessel` guard would bill the PLAYER via `homeColonyId` resolution, and AI
    > has no tax income.) ⇒ R-A (10%) applies to the player only in this slice — owner-acknowledged.
    > AI hoarding brakes: crew gate + shipyard throughput.**

    The `PHASE5_TODO` comment goes **at the guard** (`VesselManager.js:1713`), not in a doc, so the next
    reader of that line learns why it is still there.
15. **No storage cap** — shipyard throughput is the limit; recorded as a **player-side** constraint,
    since the AI cannot currently reach a hoarding scale worth capping (§Findings filed 8).
16. **The 10 % discount does NOT enter the upkeep sort key.** Sort **deployed-first, then cheapest**;
    `getVesselUpkeepCredits` keeps returning the *effective* rate so all five readouts stay honest.
17. **No arrears in storage.** A stored ship does not accrue `unpaidYears`; instead **DEPLOY is refused
    while the colony is in arrears**, with its own i18n reason.
    **Definition, fixed after GATE 2 (measured, not inferred):** *a colony is in arrears when any of its
    in-service ships carries an unpaid settlement year — a **latch** set by a failed annual settlement and
    released by the next successful one, not a test of the current cash balance.* Consequence, verified by
    execution: granting credits does **not** unblock deploy immediately; the block lifts at the next
    settlement (fleet upkeep settles once per **game** year). This is the intended definition — a colony
    whose budget cannot *sustain* the fleet should not commit more crew — and the i18n string was rewritten
    to say so rather than implying a cash shortage. **Filed, not fixed:** the up-to-one-game-year lag between
    paying and unblocking is a UX cost nobody examined at design time; a future slice may clear the latch
    early when the colony can afford the outstanding bill (§Findings filed 9).
18. **`commitCrew` draws unemployed first, then EVICTS the lowest-wage strata** — mobilization pulls
    people off the factory floor. This is what makes deploy work at the AI's designed `freePops ≈ 0`
    equilibrium, symmetrically, without an AI-only crew source.
19. **Withdrawal takes the same ONE MONTH**; POP returns at completion, not at the decision.
20. **The `orbitalDominance` load-wipe does NOT ride this bump** — first candidate for the next one.
    No drive-by schema changes.
21. **UI: a „Rezerwa" section in `ShipyardOverlay`'s Deploy column + Withdraw in the
    `FleetManagerOverlay` vessel detail panel.** No new nav slot, no second `shipyard` nav member.
22. **No authored AI mobilization numbers.** Ship the rule with the `empireHasFreeCrew` guard and a
    `ThreatAssessment` probe; tune later via E7/BALANS with the matrices in hand.

### Implementation conditions (signed with the plan, binding on every commit)

- **The war-commodity chain is a PREREQUISITE commit** (C-5), not an optional extra — the AI reserve
  must be able to exist before the reserve mechanics land. It moves to **W2-1**.
- **C-3 is a LEAK FIX, not new machinery.** Wire the ship-loss path to the *existing*
  `unlockPops` + `removePop` + `civ:popDied` composite; guard the integer-vs-fractional overkill (up to
  5×) and the `MissionSystem.js:1816` hull-before-crew double-debit. The historical leak stays
  grandfathered per decision 8 (§Findings filed 1).
- **State filters land BEFORE the state exists in the wild.** `_buildPlayerBattleUnit`,
  `_wreckPlayerVesselsInSystem` and doctrine eligibility ship in the same commit as `serviceState`:
  stored ships do not fight, do not get wrecked, do not patrol. **Fail-first keepers on all three.**
- **The save bump is its own commit and its own gate**, and **GATE 1 goes to Filip first and alone**.
  Idempotence is a **data-safety** requirement: `TitleScene.js:413-420` calls `clearSave()` on a
  migration error, so a throwing migration deletes the player's save. The pre-migration file-backup
  path (`0b9328d`) is **verified in the gate**, not assumed.
- **The two single-pass seams (intel, war-commodities) are re-verified by EXECUTION** at implementation
  time, before anything load-bearing is built on them — the audit's own honest-coverage requirement.

---

## Corrections to WAR_BACKBONE

Seven findings that change the slice's shape. Three invalidate premises carried in the scope statement.

### C-1 — "BUILD = industry only, no POP" is a no-op for the player and a real removal for the AI. The baseline is not symmetric. **[CONFIRMED, multi-source]**

- Player warships **cannot be built at a colony at all**: `canBuildHullAt(..., 'ground')` is default-deny
  and `groundBuildable: true` exists on `hull_small` alone (`HullsData.js:23`, `ShipBuildRules.js:31-35`),
  and the gate is applied **only to player colonies** (`ColonyManager.js:857`). Player frigates,
  destroyers and cruisers come out of `StationSystem.queueStationShip`, which has **no crew cost at
  all** — documented as a deliberate MVP asymmetry (`StationSystem.js:331`).
- AI warships come out of the colony yard (AI is exempt from that gate) and **do** pay crew: hard fail on
  `freePops < crewCost` (`ColonyManager.js:879-894`), `lockPops` at build start (`:924-926`), the same
  gate again on pending-order promotion (`:1608-1627`), and a Director pre-check rejecting `no_crew`
  before any of it (`DirectorProduction.js:151-155, :375-379`).
- ⇒ **Today the AI pays 0.2–1.0 POP per warship and the player pays zero.** P4 read literally deletes the
  AI's cost and ratifies the player's free ride.

**Consequence for the plan.** W2 symmetrises *upward*: build becomes industry-only for both (delete the
AI's three build-time gates), and crew is charged at **deploy** for both — introducing a cost the player
has never paid. **Signed by the owner as decision 13**; it is the difference between W2 being a real
change and W2 being a rename.

### C-2 — Doctrines do NOT consume only deployed ships. The claim is false today and must be made true. **[REFUTED as assumed; both passes agree]**

`DirectorDoctrine._idleArmedAtCapital` (`:241-263`) selects on five positive conditions: AI-owned, armed,
`position.dockedAt === capitalId`, no mission, no movement order, no existing doctrine role. **A stored
ship matches every one.** Worse, the trigger probe and the action read the *same* function
(`countIdleArmedAtCapital:71-73` → `:89`), so a reserve would both trip `doctrine_defend_home` (gte 1)
and be conscripted by it. There is no vessel-level storage vocabulary anywhere in `src/` to extend
(`isStored|storedAt|storageState|reserveFleet` = 0 hits).

### C-3 — R-C is not new machinery; the machinery exists three times, and today's behaviour is a save-persisted leak. **[REFUTED the audit's own headline; multi-source]**

The crew seam's headline breakage — *"R-C has nothing to hook into … needs a new `removePop`-style path
that does not exist"* — is **false**. `CivilizationSystem.removePop(type, count)` exists (`:535-554`), and
the exact composite R-C wants appears verbatim three times in `MissionSystem`, under the comment
*„Odblokuj POPy na kolonii źródłowej i zabij załogę"*: `:1631-1633`, `:1826-1828`, `:2417-2419`.

What is actually broken is different, and worse:
- **No ship-loss path touches POP.** `destroyVessel` (`VesselManager.js:824-861`) is crew-blind, and none
  of the twelve `vessel:wrecked` subscribers releases a lock. Since `_lockedPerStrata` is serialized
  (`CivilizationSystem.js:738`/`:791`), **every ship ever lost has permanently sterilised its crew from
  `freePops` in every v100 save on disk.** Population is unchanged; the workforce is not.
- The invariant that breaks is **not** `floor(humans) = Σstrata + unemployed` — locks sit outside that
  identity — but `locked ⊆ employed`.
- **`removePop` is integer-stepped** (`for (let i = 0; i < count; i++)`) while hull `crewCost` after the
  Population-2.0 ×4 is 0.2 / 0.4 / 0.6 / 1.0 (`HullsData.js:284-288`). `removePop(null, 0.4)` runs the
  body **once** and kills one whole citizen — a 2.5× over-debit, 5× for `hull_small`. This defect is
  already live at `MissionSystem.js:1828` and `:2418`.
- **Double-debit is a live hazard, not a hypothetical:** `MissionSystem.js:1816` destroys the hull
  *before* settling crew at `:1826`. Any W2 hook inside `destroyVessel` or on `vessel:wrecked` fires
  first and the mission block settles again.

⇒ R-C is a change from *silent leak* to *explicit debit*; it needs a fractional-aware primitive, and it
must be placed where it cannot double-fire.

### C-4 — The withdrawal precedent R-C will be built on is already wrong. **[CONFIRMED]**

`ColonyManager._disbandVessel:1980-1983` unlocks `shipDef.crewCost` **unconditionally**, with no check
that this vessel ever locked crew, on `getColony(vessel.colonyId)` — while upkeep bills `homeColonyId`
(`VesselManager.js:1733-1738`) and build locked on the *building* colony (`:924`). Three different
colonies for three phases of one ship's life. Because `_distributeUnlock` (`CivilizationSystem.js:321-333`)
removes proportionally from whatever is currently locked, disbanding a station-built player warship
(which locked nothing) **takes 0.2–1.0 POP out of other ships' crews.** Decisions 7 + 9 close this.

### C-5 — The AI reserve the intel story is about is EMPTY today, by two independent mechanisms. **[CONFIRMED by the contradiction critic; corrects the single-pass war-commodities seam]**

- **(a)** `EmpireFleetMaterializer` — the AI's principal fleet source — spawns hulls
  `position.state = 'orbiting'`, `dockedAt = null` (`:117-118`), so they can never enter
  `_idleArmedAtCapital`, which requires `dockedAt === capitalId`.
- **(b)** Shipyard-built AI warships cannot complete. All three catalog templates carry `armor_heavy`
  (`ShipTemplateData.js:98-103, :113-118, :142-147`), whose `commodityCost` includes `metamaterials`
  (`ShipModulesData.js:331`), gated on tech `exotic_materials` (`CommoditiesData.js:318`) — which appears
  in **zero** archetype `startingTechs` and **zero** `researchQueue`.
  ⚠ **The critic corrected the seam here and the symptom changes with it:** `armor_heavy.requires` is
  **`point_defense`**, not `exotic_materials` (`ShipModulesData.js:333`). The resolver therefore *selects*
  the module — it is never dropped as `NO_MODULE`. The blocker lands one layer later, at cost time:
  `canAfford` fails and the order **parks silently in `pendingShipOrders`** (`ColonyManager.js:904-918`)
  until the Director's 3.0-displayed-year TTL sweeps it. Not a loud rejection — an invisible,
  self-renewing queue.

⇒ Every seam reasoning about "AI ships in storage" is reasoning about an empty set. **The war-commodity
chain is a prerequisite of the AI half of this slice, not an optional extra** — which is why it moves
earlier in the commit plan than P4's ordering implies.

### C-6 — "docked ⇒ combat-safe for free" is false on two of three combat surfaces. **[CONFIRMED]**

`_inCombatState` (byte-identical in `VesselCombatSystem.js:411-416` and `DeepSpaceCombatSystem.js:1426`)
excludes `docked`, so deep-space combat ignores stored hulls for free. But:
- `WarSystem._buildPlayerBattleUnit:515-519` filters `systemId && !isEnemyVessel && !isWreck` — **no state
  test**. Six frigates in storage, crew for three ⇒ all six fight.
- `EnemyAttackHandler._wreckPlayerVesselsInSystem:325-333` — **no state test**. Under R-C that is a mass
  demographic event with no accounting path.

**Without gates at both lines the slice is cosmetic:** storage would cost 10 % and change nothing.

### C-7 — R-B must not be expressed as a Director `delay`: the machinery carries a latent crash. **[CONFIRMED — single code path, read in full]**

`DirectorSystem._firePending:258` clears a fired entry with `gameState.set(..., null)`; `GameState.set`
**assigns, never deletes** (`GameState.js:93-94`). Next tick `Object.entries(pending)` yields
`[key, null]`, `Number(entry?.fireAtYear)` is `NaN`, `NaN > year` is false so the `continue` is skipped,
and `:260` dereferences `entry.action` → TypeError. `_firePending` is called at `:161`, **outside** the
per-rule try/catch, and `AlienCivSystem.js:130` calls `tickEmpire` outside its own — so the throw kills
every empire after the poisoned one, and `director.pending` is serialized, so it survives save/load.
Dormant only because every shipped rule has `delay: 0`.

---

## Audit — state of the seams (read-only, with verdicts)

| # | Seam | State | Load-bearing detail |
|---|---|---|---|
| S1 | `vessel.position.state` | **closed 3-value enum** | `'docked' \| 'in_transit' \| 'orbiting'`, ~50 production assignments, no fourth value. `status` is the orthogonal axis; `'damaged'` is declared and never assigned. `isWreck` is the only existing "in the registry but not a real ship" flag. |
| S2 | Registry blast radius | **35 files** | 45 `getAllVessels()` + 29 `_vessels.values()` call sites; the near-universal filter idiom is `if (v.isWreck) continue` + `isEnemyVessel(v)`, so a new flag is **invisible to every one of them by default**. Three further helper iterators (`getVesselsAt` / `getVesselsInSystem` / `getInterstellarVessels`) with four external consumers. |
| S3 | serialize / restore | **explicit whitelist** | serialize writes 52 keys (`VesselManager.js:1104-1200`); restore rebuilds a fresh literal (`:1225-1327`) — an unnamed field is **silently dropped, no diagnostic**. `position` is spread wholesale on both sides (`:1112`/`:1233`). Restore has a six-way ordering contract (MissionSystem, OrderService, TransportOrderSystem, MOS `_indexExistingOrders`, FleetSystem, DSCS). |
| S4 | Yard → vessel | **two paths, one primitive** | `fleet:shipCompleted` (one production emitter, `ColonyManager.js:962`) → `_onShipCompleted:1425` → `createAndRegister`; and `StationSystem._spawnStationShip:513-529` → `createAndRegister` directly, emitting only `station:shipCompleted`. Anything hooked on `fleet:shipCompleted` alone **misses the player's entire warship output** (C-1). |
| S5 | Ownership stamp | **post-hoc, on `vessel:created`** | `createVessel` never sets `ownerEmpireId`; `DirectorProduction._claimVessel:212-222` stamps it from `colony.ownerEmpireId`. Two paths stamp by hand *before* emitting. `isEnemyVessel` reads an unstamped hull as **the player's** (Slice-1 finding 1, still verbatim). ⚠ `restore()` inserts vessels **without** emitting `vessel:created` (`:1395`), so no stamper runs on load. |
| S6 | Build-time crew | **asymmetric (C-1)** | Player warships: zero POP (station path). AI warships: hard fail + `lockPops`, twice in ColonyManager plus a Director pre-gate. `crewCost` per hull after ×4: 0.2 / 0.4 / 0.6 / 1.0. `crewStrata` is `'mix'` on every HULL ⇒ every ship lock is fractional by construction. |
| S7 | Crew return | **one path, and it is wrong** | `_disbandVessel:1980-1983` only; unconditional, wrong colony field, proportional theft (C-4). Ship loss returns nothing (C-3). The ground-unit twin does the **opposite** (`GROUND_UNIT_POP_REINTEGRATION`: 50–100 % back after 1–2 civYears) — R-C must state the asymmetry or players read it as a bug. |
| S8 | Fleet upkeep | **player-only, single primitive** | `_tickVesselMaintenance:1699-1730`, once per **game** year, `isEnemyVessel` skipped at `:1713`. `getVesselUpkeepCredits:1741-1743` is the sole rate function with **five** call sites — one of which is the **cheapest-first sort key** (`:1721`). `spendCredits` has a hard non-negative floor (`CivilianTradeSystem.js:879`). |
| S9 | The death spiral | **reproducible headlessly** | Executed during the audit: 6 × `hull_cruiser`, 500 Kr ⇒ `unpaid=[1…]` at gy 1, **all six immobilized at gy 2**. ⚠ The owner's *negative-credits* variant is **not** headless-reproducible: every sink is clamped except `GameScene.js:3535` (scheduled-event penalty) and `:3016`, both GameScene-only. **Zero existing keeper drives `_tickVesselMaintenance`** — all nine test hits are stubs. |
| S10 | AI credit income | **none that matters** | Taxes are player-only (`ColonyManager.js:1539`, with a `PHASE5_TODO` saying so). Wages are charged **symmetrically** and drain AI credits to 0 cosmetically. *Narrowed by the verifier:* same-empire AI↔AI civilian trade is **not** gated and does pay both sides — so "no income" is too strong; "no tax and no unconditional income" is exact. |
| S11 | `ThreatAssessment` | **state-blind** | `_recompute:101-119` excludes only `isWreck` and unknown owner. Six live read sites: milRatio numerator **and** denominator (`AlienCivSystem.js:291`/`:305`), `relative_power` (both sides in one call), `knownMilitary` ×2, IntelOverlay. ⚠ The denominator is floored at `PLAYER_DEFENSE_BASELINE_HP` and the numerator is not — so excluding stored hulls is **not** neutral bookkeeping, it is a global de-escalation of the alien FSM (four transitions sit on `MIL_RATIO_WAR`). |
| S12 | Intel record *[single-pass]* | **five scalars, one number** | `intel[empireId]` = `level, knownTech[], knownMilitary, knownColonies[], lastIncidents[]`. `knownMilitary` is a single rounded scalar gated at `detailed`, whose only producer is a **ground survey**. Per-vessel records carry no owner and no hull id, so per-empire aggregation is impossible from them. |
| S13 | Observation *[single-pass]* | **cannot see a docked hull** | Every `ObservatorySystem` path resolves either flying vessels by AU distance in the active system or celestial-body counts. Nothing inspects a colony's contents. `_refreshKnownMilitary` runs once per civYear = **once per displayed month** = exactly R-B's duration, so a mobilization can begin and end between two intel refreshes. |
| S14 | Director engine | **rule-shaped, one trap** | `trigger → guard → roll → delay → response`; registrars **must** run before `new DirectorSystem()` (`DirectorDoctrine.js:328-333`). Roll-less rules have no once-per-displayed-year throttle (it lives inside `if (rule.roll)`) and `validateRule` does **not** cross-check "roll-less ⇒ cooldown". Three guards are registered but referenced by no rule — including **`empireHasFreeCrew`**, which is exactly the mobilization guard W2 needs. |
| S15 | War commodities *[single-pass, C-5 corrected]* | **unreachable for both archetypes** | `metamaterials` ← tech `exotic_materials` (in zero archetype). `warp_cores` ← `ion_drives` + `antimatter_cells` ← `fusion_power` (Expansionist only ⇒ Industrialist blocked one ingredient deep). Ore floor: AI starts with **no Ti, Hv, Li or Nt**, and Hv/Li have no AI acquisition path at all (`strategicDeposits` = Xe/Nt/Ti). |
| S16 | AI production upgrades | **a one-file data surface** | `ColonyAutoExpander.BUILD_PRIORITY` is a fixed 10-entry list with no war-industry entry; `src/data/targets/industrialist.js` is the **only** target file and is shared by **both** archetypes (`:54-56` TODO). Its `safetyStocks` never mention a war commodity at any checkpoint. `gas_fuel_refinery`, `fuel_refinery`, `antimatter_factory`, `robot_assembly` all exist and appear in neither. **This is where P4's "buildings" half lives.** |
| S17 | Save-bump machinery | **well-trodden, one landmine** | Bump = `CURRENT_VERSION` + a `MIGRATIONS[100]` entry + the function + restore defaults + serialize. Persist is **best-effort** (`:272-278`) ⇒ **idempotence is a hard requirement**. ⚠ **Migration failure is destructive:** `TitleScene.js:413-420` calls `SaveSystem.clearSave()` on `saveData.error`. A v101 bump re-arms the pre-migration `window.confirm` once per player, on Continue **and** on import. Eight existing tests drive `migrate()` to the top, the thinnest fixture being `{ version: 99 }`. |
| S18 | Player UI | **three disjoint surfaces, zero coverage** | `ShipyardOverlay` (520 ln, single ≤560 px column, one shared scroll) never reads `vesselManager`. It registers hit zones at **scrolled** coordinates and **never prunes them** — a live ghost-click hazard the new Deploy buttons would inherit; `ColonyOverlay` / `StationManagementView` both use `pruneZones`. `grep ShipyardOverlay src/testing/` → **zero hits**. |
| S19 | `_drawActions` | **early-returns** | `FleetManagerOverlay.js:8423-8427` returns when `getAvailableActions` is empty — skipping Disband, Refuel, auto-refuel **and** the logistics-pool toggle. A Deploy/Withdraw button appended at the end is skipped **exactly when the ship is idle**, i.e. always for a stored hull. |
| S20 | Harness reach | **mounts neither yard** | `GameCore` constructs 46 systems and **zero** of: StationSystem, Director*, FleetSystem, MOS, Proximity, VCS, DSCS, EnemyAttackHandler, OrderService. Its own `ActionCatalog.listBuildShipActions` is **structurally dead** (enumerates legacy `SHIPS`, none `groundBuildable`, all rejected at `ColonyManager.js:857`), and `ActionCatalog.js:163` filters on `v.status === 'docked'` — a value `status` never takes. Hand-wire precedent that works: `s34_command_stations_smoke.mjs:60-80` drives `queueStationShip → _tick → _spawnStationShip` end to end. |
| S21 | i18n | **parity is a checklist, not a gate** | `check-i18n` exits non-zero only on keys *used but undefined*; pl↔en divergence is informational. Current baseline, executed: **pl=3212, en=3212, 0 divergence both ways**. ⚠ `ui.deployTab` already exists with zero call sites and **wrong Polish semantics** (`'📦 ZAINSTALUJ'` = INSTALL). ⚠ `ShipyardOverlay.js:222` renders a hardcoded non-`t()` Surge label — the checker cannot see it. |

---

## Commit plan

Atomic, one slice per commit, paths added explicitly. **Three live gates** — the save bump gets its own
(owner instruction), then the player loop, then the AI loop. Rationale: three independent failure modes,
and regression cannot otherwise be attributed.

| # | commit | content | gate |
|---|---|---|---|
| **W2-0** | `test(war): weryfikacja szwów przed W2` | NEW `src/testing/headless/probe-deploy-seams.mjs` + keeper `deploy_seams_smoke` — pins the load-bearing facts **by execution**: C-1 (an AI warship build consumes POP, a player station build does not) · C-2 (a docked armed AI hull at the capital IS picked by `_idleArmedAtCapital`) · C-3 (a wrecked ship leaves `_lockedPerStrata` unchanged — today's leak, asserted as the *pre*-state) · C-6 (`_buildPlayerBattleUnit` drafts a docked hull) · S9 (the death spiral, 6 cruisers → immobilized at gy 2). **Zero production code.** | — |
| **W2-1** | `feat(ai): łańcuch produkcyjny towarów wojennych — jeden towar realny` | **PREREQUISITE (implementation condition, C-5).** The AI reserve must be able to exist before the reserve mechanics land. **One** commodity made reachable end-to-end for the AI: `exotic_materials` into the archetype `researchQueue` (visible, timed, intel-legible — not `startingTechs`) + the ore floor (Hv has no AI acquisition path at all) + a war-industry entry in `ColonyAutoExpander.BUILD_PRIORITY` and in `targets/industrialist.js` `safetyStocks` (S16 — P4's "buildings" half). ⚠ **Re-verify S15 by execution first** (single-pass seam). Measured before/after: does an AI warship order actually clear `pendingShipOrders` inside the 3.0-displayed-year TTL? Low ordering risk despite landing before the state model: the chain is research- and production-gated, so no warship appears the instant it merges. | — |
| **W2-2** | `feat(war): model rezerwy — serviceState + przechwycenie na wyjściu ze stoczni` | `vessel.serviceState` / `mobilizeProgress` / `crewLocked` on the entity + both whitelists (decision 4) · the two yard sites emit `'stored'` (decision 5) · **the exclusion set**: `DirectorDoctrine._idleArmedAtCapital`, `WarSystem._buildPlayerBattleUnit`, `EnemyAttackHandler._wreckPlayerVesselsInSystem`, `_tickRefueling`, `_tickRepair`, `dispatchOnMission` / `getAvailable*`, `TransportOrderSystem._freePoolVessels`, `ProximitySystem._isValidForProximity` · `ThreatAssessment` split into `getStrength` (deployed) + `getPotentialStrength` (decision 6). No UI, no crew, no upkeep yet — a stored ship is simply inert. | — |
| **W2-3** | `feat(save): migracja v100 → v101 (model rezerwy)` | **THE BUMP, ALONE.** `CURRENT_VERSION = 101` · `MIGRATIONS[100] = _migrateV100toV101` · per-vessel seeds `serviceState:'active'`, `mobilizeProgress:0`, `crewLocked:0` — nothing else. Idempotent (`??=`), deterministic (no PRNG), keyed `data.civ4x ?? data.c4x`, never sets `data.version`. NEW keeper `w2_migration_v101_smoke` mirroring `diplomacy_migration_v100_smoke`, including its M13 live-store round-trip. **No drive-by schema changes.** | **GATE 1** |
| **W2-4** | `feat(war): załoga przy rozmieszczeniu — deploy/withdraw + śmierć załogi (R-B, R-C)` | Delete the three build-time crew gates (`ColonyManager.js:879-894`, `:1608-1627`, `DirectorProduction.js:375-379`) · NEW `deployVessel` / `withdrawVessel` intent methods with the `DEPLOY_DURATION_CIVYEARS = 1.0` timer ticked from `civDeltaYears` · NEW `CivilizationSystem.commitCrew` / `releaseCrew` / `killCrew` (fractional-aware, accumulator-based — **not** raw `removePop`, C-3) · R-C debit on `vessel:wrecked` with an explicit guard against the `MissionSystem.js:1816` double-fire · `_disbandVessel` fixed to `crewLocked` (decision 9). i18n PL+EN, unit stated in the label. | — |
| **W2-5** | `feat(war): utrzymanie rezerwy 10% (R-A)` | `getVesselUpkeepCredits` returns the **effective** rate (× `RESERVE_UPKEEP_FACTOR = 0.10`) so all five readouts tell the truth · the cheapest-first comparator changes to **deployed-first, then cheapest** (decision 16) · a stored ship does not accrue `unpaidYears`; instead **deploy is refused while the colony is in arrears**, with its own i18n reason (decision 17) · **player-only in this slice** (decision 14 — the `isEnemyVessel` guard at `VesselManager.js:1713` stays, and gets the `PHASE5_TODO` explaining why) · EconomyOverlay / CivilizationOverlay / FleetGroupPanel readouts split stored vs deployed. | — |
| **W2-6** | `feat(ui): rezerwa i rozmieszczenie w Stoczni + wycofanie w Rejestrze` | `ShipyardOverlay` gains a "Rezerwa" section (stored hulls, 10 % upkeep, Deploy button, mobilization bar with the unit in the label) — **and adopts `pruneZones`**, paying down the ghost-click debt in the same commit rather than shipping new buttons into it · Withdraw in `FleetManagerOverlay`, registered **before** the `_drawActions` early return (S19) · no new nav slot (a keeper pins exactly 7). i18n PL+EN, **not** `ui.deployTab`. | **GATE 2** |
| **W2-7** | `feat(ai): decyzja mobilizacyjna + widoczność dla intelu` | Director rule `mobilize_reserve` (poll probe + **the already-registered-but-unused `empireHasFreeCrew` guard** + action `mobilizeVessels`, `roll`, `delay: 0` per C-7) reading `ThreatAssessment` · `intel[empireId].knownReserve` + `knownCrewCapacity` beside `knownMilitary` · a mobilization notification through `NotificationCenter` (which auto-mirrors to the `intel` EventLog channel), **gated by contact quality** — an ungated one is free intel and re-opens the Slice-1 Journal leak. | **GATE 3** |
| **W2-8** | `docs(war): domknięcie W2` | `WAR_BACKBONE.md` corrections C-1…C-7 + the three rulings verbatim · `WOJNA_I_POKOJ_MASTER_PLAN.md` · `CLAUDE.md` (save version, the deploy-model section) · `MEMORY.md` + a memory file · this plan's results. | — |

**Per-commit gates:** `node src/testing/smoke/run-all.mjs` **0 FAIL** · `node tools/check-i18n.mjs` **PASS**
with pl↔en divergence still **0 both ways** · no `window.KOSMOS?.` silent no-op in any new decision path
(audit R12, the loud-fail rule).

---

## Tests

Keepers in `src/testing/smoke/` (no `tmp_` prefix, imports via `../../`). **Fail-first proven by
execution** wherever possible, and **every pin carries a pin control** — a pin without one is
indistinguishable from a pin that checks nothing.

⚠ **The specific neighbour a deploy pin must not be satisfiable by is `isImmobilized`** — the *existing*
"this hull exists but cannot move" state, which produces the same observable through the same four
refusal consumers. Every storage pin must assert the mechanism, not the symptom.

⚠ **A keeper that silently no-ops passes the sweep.** `run-all.mjs:41-43,55` make a missing summary line
advisory; only the exit code decides. Combined with the harness omitting the systems under test (S20), a
green pin proves nothing on its own.

| keeper | commit | what it pins |
|---|---|---|
| `deploy_seams_smoke` | W2-0 | C-1 / C-2 / C-3 / C-6 / S9 **by execution**. Fail-first: each assertion is written against the CURRENT behaviour, so W2-1 and W2-3 must deliberately invert them. |
| `w2_deploy_model_smoke` | W2-1 | A yard-completed hull is `'stored'` · both yards, not just the colony one · the exclusion set holds for each of the eight consumers individually · `getStrength` drops it while `getPotentialStrength` keeps it · **round-trip**: `serviceState` survives serialize → restore (the silent-drop failure mode). |
| `w2_migration_v101_smoke` | W2-2 | **Idempotence** (run twice ⇒ identical) · a v100 fixture and a mixed old/new fixture · a save with no `civ4x` · determinism · **M13-shape live-store round-trip** (post-migration reads back through `VesselManager.restore` with the same numbers) · range pin `CURRENT_VERSION >= 101`, never a point pin. |
| `w2_crew_ledger_smoke` | W2-3 | Build consumes **zero** POP (both owners) · deploy commits exactly `crewLocked` · **fractional debit**: a 0.4-POP crew kills 0.4, not 1 (the C-3 rounding trap, asserted numerically) · **no double-debit** on the `MissionSystem.js:1816` ordering · withdrawal returns exactly what was committed · disband uses `crewLocked`, so a legacy `crewLocked: 0` hull returns **nothing** (C-4 closed) · the timer is `1.0 civYear = 1 displayed month`, pinned **by execution** in the shape of `diplomacy_time_units_smoke`. |
| `w2_reserve_upkeep_smoke` | W2-4 | Stored rate is exactly 10 % · all five `getVesselUpkeepCredits` call sites see it · **the sort is deployed-first** (a scarcity fixture where the reserve must be the one to go unpaid) · a stored ship does not accrue `unpaidYears` · deploy is refused while in arrears, with the reason string. |
| `w2_ai_mobilization_smoke` | W2-7 | The rule fires at most once per displayed year · `empireHasFreeCrew` actually gates it · **`delay: 0`** (a pin control asserting no rule in the catalog carries `delay > 0`, so C-7's dormant crash stays dormant) · `intel.knownReserve` is written only at the contact level that gates it. |

**Regression that must pass unedited:** `war_seams` · `war_doctrine` · `war_skirmish` ·
`threat_assessment` · `acceptance_relpower` · `director_pressure` · `director_first_contact` ·
`director_feed_isolation` · `director_skeleton` · `crewlock_unemployed_invariant` ·
`s34_command_stations` · `s34d_hull_gating` · `station_ship_picker_scroll` · `shipyard_nav_slot` ·
`fleet_clock_band` · full sweep (**129** keepers today).

**Keepers EXPECTED to fail, to be deliberately rewritten and not incidentally fixed:**
- `director_seams_smoke.mjs:157-171` (T5) asserts on a **real GameCore boot** that `startShipBuild`
  hard-refuses when `freePops < crewCost`, labelled *„reguła nacisku potrzebuje guardu załogowego"*.
  P4 inverts it.
- `director_ai_production_smoke.mjs:156` asserts `queueWarships` returns `reason === 'no_crew'`. Same
  inversion, against a stubbed `civSystem`.
- `s34d_hull_gating_smoke.mjs` carries a frozen `crewCost: 0` in a `pendingShipOrders` fixture — check it
  against the migration.

**BALANS.** The R-A instrument already exists and needs no new plumbing: `PriceTelemetry.js:54-55`
declares a `fleet_upkeep` Kr bucket, `:74-80` routes on the exact `purpose` string
`_tickVesselMaintenance` passes, `:155` records `fleetUpkeepPerGy`, and `PriceReport.js:389` renders it.
⚠ **Copy the untracked baseline in `src/testing/reports/balans/` aside before the first run** (V19 — the
runner overwrites the same filename) and diff the payload, not the file.

---

## Verification (live gates)

**GATE 1 (W2-2) — the bump.** Load a real v100 save: the pre-migration `.json` backup dialog appears
**exactly once**, the file downloads with the `przed-migracja` suffix, the game loads, and every existing
vessel reads as **in service** with its crew record at zero. Save, reload: v101, no dialog, identical
fleet. Then the destructive path, deliberately: confirm the migration **cannot** throw, because
`TitleScene.js:413-420` calls `SaveSystem.clearSave()` on `saveData.error` — a throwing migration
**deletes the player's save**. Also import a v100 `.json` file (the second, likelier trigger of the same
dialog).

**GATE 2 (W2-5) — the player loop.** Build a warship at the station: it lands in the **Rezerwa** section,
not the fleet; it does not appear in a battle when the system is attacked (C-6); it costs 10 % upkeep and
the Economy panel says so. Deploy it: the mobilization bar runs for **one displayed month** (the label
states the unit), crew is debited from `freePops`, and only then does it become a normal warship.
Withdraw it: crew returns, exactly the amount committed. Lose a deployed one in combat: the population
drops and the Journal says so. ⚠ Check the arrears interaction explicitly — a colony that cannot pay must
refuse the deploy with a readable reason, not hand back a paralysed ship.

**GATE 3 (W2-7) — the AI loop.** On a live save with an AI empire past the war-commodity gate: the AI
completes a warship (verify it clears `pendingShipOrders` rather than sitting in it — C-5), the hull sits
in storage, doctrines **do not** conscript it (C-2), and the threat readout distinguishes force from
potential. Provoke it: the mobilization rule fires, once, and the intel panel shows the reserve at the
correct contact level — and **nothing** about it reaches the Journal below that level (the Slice-1
Journal-leak class).

**Standing gate-script rules, all still binding, each bought with a bug:** no multi-line code inside block
quotes · capital **only** via `KOSMOS.directorProduction.capitalOf(empireId)` · read shortages **from the
engine**, never from a list in memory · `DebugLog` is a ring **cleared on reload** · **never run a gate in
parallel with CC work** · state levers only through validated tools · **every one-liner EXECUTED on the
live engine before it is written into the checklist** · **never filter Journal or log entries by DISPLAY
TEXT** — filter by event kind, channel or entry `type`; a Polish-keyword grep returns empty for a player
running an English Journal while the entry is plainly on screen (bought at GATE 2), and matching both
locales is the fallback, not the default.

---

## Out of scope (deliberately)

Offensive AI — target selection, capital strikes, invasion (**W3+**, the recorded P1 intent) ·
territorial peace and occupation (**W3**, §6a) · war goals (**D4/W3**) · deleting `empire.fleets`
(**W2/W3 cleanup** per the signed K-2 narrowing — W2 does not need it and does not touch it) · the
`orbitalDominance` load-wipe (decision 20) · reconciling the three divergent weapon predicates and
the `lossesA/B` unit collision (W1 §Findings filed 2–3) · the BattleSystem↔DSCS pricing parity gap
(W1 §Findings filed 4) · AI↔AI combat producers and the `changeTension` / `addMemory` player-hardcoding
(**D5**) · per-empire weapon and sensor tech state (**W2/P5** in the backbone; **not** in this slice) ·
clamping the unguarded negative-credits paths (`GameScene.js:3535`, `:3016`) ·
`ActionCatalog`'s two dead predicates (S20) — filed below · the ground-unit POP double-deduct · fixing
`_feedCommodityDemand`'s inoperative `isKnownCommodity` guard (it would remove entries from existing v100
factory state — its own commit, its own before/after).

---

## Findings filed (not fixed in W2)

1. **The historical crew leak.** Every v100 save carries orphaned `_lockedPerStrata` from ships already
   lost. Decision 8 grandfathers rather than reconciles, because the pre-bump ledger is not
   reconstructible. If it ever becomes visible as un-recruitable POP, it is a BALANS item.
2. **`ActionCatalog` is doubly dead** (S20): `listBuildShipActions` enumerates only legacy `SHIPS`, none
   `groundBuildable`, so **every `BUILD_SHIP` action the harness emits is refused**; and `:163` filters
   expeditions on `v.status === 'docked'`, a value `status` never takes. MCTSBot / RandomBot consume that
   catalog; only RuleBot escapes, by hardcoding `hull_small`.
3. **`FleetPictureLogic` has zero test coverage** and six consumers, and is the §0 single source of truth
   for every fleet lens (registry, tactical dock, map labels, **and the 3D role/tone dictionary**). W2's
   first UI edit lands there. Teaching `buildShipEntry` a stored state propagates to 3D for free — which
   also means a mistake propagates for free.
4. **`ShipyardOverlay.js:435`** reads the **global** `window.KOSMOS.civSystem.freePops` while every other
   POP read in the same file reads the active colony's. Pre-existing; a P4 rework will trip over it.
5. **Two dead shipbuilding surfaces still mirror the live one** — `FleetTabPanel.js` (never imported) and
   `FleetManagerOverlay._drawLeftTabs` / `_drawLeftFleets` (defined, never called). Anyone grepping for
   "where do I add the storage counter" finds the wrong file.
6. **Three "net Kr/rok" formulas already disagree** (`NavPeekProviders.js:125` omits wages and ground-unit
   upkeep; `ColonyOverlay.js:2111` omits both upkeeps; only CivilizationOverlay and EconomyOverlay carry
   all five terms). A reserve rate makes the divergence larger, not smaller.
7. **The R-2 re-measurement obligation is still open and its premises moved again**: full AI colonies now
   land at civYear **303–353** (was ~456) and **0 outposts over 400 civY × 3 seeds**. Both numbers are
   premises of any AI mobilization cadence.
8. **Storage cap has no measurable subject yet.** The AI's own target table caps its capital at
   `shipyard { count: 1, avgLevel: 2.0 }` at gameYear 40 — two concurrent builds, contended with
   couriers. "Hoarding at scale" is currently unreachable for the AI; the cap question is a *player*
   question (decision 15).
9. **The arrears latch lags by up to one game year.** Paying does not unblock deploy until the next
   annual settlement (decision 17, measured at GATE 2). Defensible as designed, poor as feedback. Candidate
   fix: clear the latch early when the colony can currently afford the outstanding bill. Deliberately **not**
   done drive-by — it changes a refusal predicate that GATE 2 just certified.
10. **Materialized AI fleets bypass the crew model entirely.** `EmpireFleetMaterializer.js:105` calls
    `createVessel` **without** `serviceState`, so its hulls are born `'active'` with `crewLocked: 0` — they
    never pass through deploy, so they never cost the AI a single POP and their loss kills nobody. Same for
    `DirectorFirstContact.js:132` (the probe) and the debug/sandbox spawners. This is why an `active` +
    zero-crew AI hull in a save **cannot** be assumed to predate v101 (see the GATE 2 answer below). Whether
    shadow-fleet materialization should charge crew is a **W3** question — it is the AI's principal fleet
    source, and pricing it is a balance decision, not hygiene.

---

## Open decisions — NONE (all ten signed 2026-08-15)

The ten decisions this plan carried as open at draft — the P4 baseline · storage cap · the upkeep sort
key · arrears in storage · AI fleet upkeep · the crew source at deploy · withdrawal duration · the
`orbitalDominance` rider · UI shape · AI mobilization thresholds — were resolved on 2026-08-15 (two
**owner rulings**, D1 and D5, recorded verbatim; eight **orchestrator ratifications**) and moved into
**§Decisions taken 13-22**, each with the rejected alternative recorded beside it. Implementation
proceeds **without re-litigation**.

---

## Results — what actually shipped (2026-08-16)

Osiem commitów, `7f606b7` → `adc0fbd`. **GATE 1 ✅ · GATE 2 ✅ · GATE 3 pending** (live-only).
Sweep **136/136 0 FAIL** · `check-i18n` PASS (pl=en=3240, 0 rozbieżności) · zapis **v101**.

| commit | slice | co weszło |
|---|---|---|
| `7f606b7` | W2-0 | `deploy_seams` — pięć przesłanek audytu pinowanych WYKONANIEM |
| `7db3043` `3f35c36` | W2-1 | łańcuch towarów wojennych AI (prerekwizyt C-5) |
| `c4526b6` | W2-2 | `serviceState` + `isInService` + zbiór wykluczeń + rozdział siła/potencjał |
| `c9f728e` | W2-3 | **bump v100 → v101** (trzy zasiewy per statek, nic więcej) — **GATE 1** |
| `496067c` | W2-4 | załoga przy rozmieszczeniu (R-B/R-C), trzy bramki budowy skasowane |
| `e84bb72` | W2-5 | utrzymanie rezerwy 10 % (R-A), sort deployed-first, bramka zaległości |
| `c9062a1` | W2-6 | UI: sekcja Rezerwa + oś służby w Rejestrze + spłata długu ghost-click — **GATE 2** |
| `adc0fbd` | W2-7 | mobilizacja AI + rezerwa w intelu + powiadomienie za bramką kontaktu |

**Dowody fail-first WYKONANIEM** (nie diffem) — każdy odwracany i sprawdzany na czerwono:
ułamkowa śmierć załogi (surowe `removePop` → „spadło 1.0000 zamiast 0.4") · zegar mobilizacji
(podmiana na zegar GRY → mobilizacja nigdy się nie kończy) · sort utrzymania (naiwny
cheapest-first → obrońca nieopłacony) · `pruneZones` (→ ghost-click wraca) · kolejność
`_drawServiceStateAction` (→ przycisk znika przy pustej liście akcji) · bramka mgły wojny
(→ wpis powstaje na `rumor`) · `delay > 0` w katalogu Directora.
⚠ Jeden z tych dowodów był **NIEWAŻNY za pierwszym razem**: sonda wstawiła `delay` jako drugi
klucz literału, a późniejszy `delay: 0` wygrywa w JS — pin „przeszedł", bo sonda nic nie zmieniła.
Powtórzone na właściwej linii. Reguła „diff nie jest dowodem" ma więc młodszą siostrę:
**samo URUCHOMIENIE też nie wystarczy, dopóki nie sprawdzisz, że sonda naprawdę zmieniła zachowanie.**

**Trzy rzeczy znalezione po drodze, których nikt nie szukał:**
1. `EventLogSystem.TYPE_MAP` nie miał kluczy `intel`/`combat`/`diplomacy`, choć `CHANNELS` je ma →
   18 wywołań M4 P1 (bitwy, odwroty, wojny) lądowało na kanale **system** z poprawnym KOLOREM.
   Naprawione w W2-7, bo powiadomienie mobilizacyjne musiało trafić na kanał wywiadu.
2. `_tickRepair` czyta `entry.buildingId`, a wpisy `_active` mają `entry.building.id` → **naprawa
   statków nigdy nie działała, u nikogo**. Pinowane jako luka (`w2_crew_ledger` T11b), świadomie
   NIE naprawione: jednolinijkowa poprawka włączyłaby naprawę floty w całej grze.
3. Reguła `mobilize_reserve` spina DWIE rodziny rejestratorów (własną + guard z produkcji), a żaden
   keeper Directora nie wołał `registerProductionGuards` — katalog nie zwalidował się bez obu.

## Where this leaves the arc

W2 turns a hull into two different things — an industrial artefact and a crewed warship — and puts a month
and a demographic cost between them. The audit's real contribution is that it found the slice's
preconditions rather than its mechanism: the mechanism is two lines at the yards, but the AI has no
reserve to speak of until the war-commodity chain is real (C-5), the "symmetry" P4 asks for does not exist
to be preserved (C-1), and the crew ledger the whole model debits is already leaking in every save on disk
(C-3). Those three are why the commit plan looks the way it does.

What W2 hands W3: a fleet with a distinction between *force* and *potential* — which is exactly what an
offensive AI has to reason about before it picks a target.
