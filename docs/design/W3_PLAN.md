# W3 — offensive AI · plan doc (APPROVED)

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** B · **Slice:** W3 · **Status:** ✅ **APPROVED 2026-08-17** —
read-only seam audit complete (this doc §Audit); **all seven open decisions resolved** (two owner rulings,
five orchestrator ratifications) and moved to §Decisions taken. Implementation proceeds **without
re-litigation**.
**Parent:** `WAR_BACKBONE.md` §2 P1 recorded intent + §6a + §6 W3+ (signed 2026-08-13) · **Predecessor:**
`W2_PLAN.md` (COMPLETE, three gates PASSED 2026-08-16/16/17)
**Basis:** seven read-only seam audits + six adversarial passes (2026-08-17) · `docs/audit/COMBAT_DIPLO_AUDIT.md`
(2026-08-05, superseded in parts) · `W1_PLAN.md`, `W2_PLAN.md`, `DIRECTOR_SLICE1_PLAN.md`, `D2_PLAN.md`
**Save:** v101 — **this plan proposes NO bump** (see §Save strategy; every candidate feature fits an
already-declared `gameState` domain, and the one item that would need a backfill is grandfathered).

**Language convention (signed 2026-08-14, `W1_PLAN.md`):** design and plan docs in the war-backbone chain are
**English**. Gate checklists and RESUME session scripts stay **Polish**.

---

## RESUME — czytaj to PIERWSZE (PL, wzór W1/W2)

**Stan na 2026-08-18 (noc).** Scommitowane: **W3-0** `ea05d8f` · **W3-1** `efa8f85` · **W3-2**
`d5a9b8d` · GATE 1 (`536fd51`/`d19777b`/`b630c55`) · **W3-3** `1e57d1b` · **W3-4** `4724e46` ·
`7a43c3a` · **W3-4b** `369adfc`+`cb815cd` · `4514df4` · **W3-4c** `a7b84bd`+`9a96382` ·
**W3-5** `07c1087` · **W3-5b** `61bdffe` + `807bd85` + **`994935e`** (naprawa montażu) · `d6356d3` ·
**W3-6** `0eae716` · **W3-7** `cced9df` · `13cc5c0` · **W3-6b** `6e14b34`+`2eb9bf5` · **W3-8**
`814fb38` · **W3-9** (ten commit).
Sweep **148/148 OK, 0 FAIL** · `check-i18n` **PASS** · zapis **v101 bez migracji przez CAŁY slice**.

✅ **GATE 1 ZDANY 2026-08-17** · ✅ **GATE 2 (§§1-7) ZDANY 2026-08-18** — łańcuch uderzenia
międzygwiezdnego udowodniony NA ŻYWO od początku do końca (`W3_GATE2_CHECKLIST.md` §Wynik).
Trzy pytania z przebiegu domknięte POMIAREM (§A1-A3): kształt `location` mówi, KTÓRA ścieżka
walczyła · eviction pierścienia WYKLUCZONY (10 000 pojemności vs ~48 wpisów/rok gry) · **rundy
NIE księgują się osobno** (jedno starcie = jedna bitwa) ⇒ wycena pokoju w W4 bezpieczna.

⏸ **GATE 2 §8 — PIERWSZA PRÓBA ZABLOKOWANA NA AWARII MONTAŻU (2026-08-18), NAPRAWIONE.**
`KOSMOS.directorOffensive` było `undefined`: reguła ŻYŁA w katalogu i była oceniana co tik, ale
w bloku lokatora `GameScene` zabrakło jednego wiersza — więc gate nie miał czym jej oglądać.
Defekt GAME-WIDE (blok lokatora biegnie dla każdego scenariusza), nie sandbox-only. Naprawione
w `994935e` + keeper czytający PRAWDZIWĄ ścieżkę bootu (§Findings 35-36). Przy okazji zmierzone:
**w Combat Sandboxie ta reguła nie może odpalić NIGDY** — układ sporny przypada pierwszej
kolonii (gracza), więc wróg roszczy 0 układów (§Findings 38). §8 przepisana: KROK 0 montaż →
KROK 1 diagnoza (`strikeReport`) → KROK 2 decyzja (`forceStrike`) → KROK 3 autonomia w NORMALNEJ grze.

✅ **GATE 2 ZDANY W CAŁOŚCI 2026-08-18** — mechanizm (§§1-7, wyd. 2) ORAZ autonomia (§8).
Drabina odmów okazała się PRAWDOMÓWNA w TRZECH różnych stanach świata, każdy z inną przyczyną:
`no_target_in_reach` w Sandboxie (geometria terytorium) · **„brak wojny — reguła milczy z definicji"**
na rozwiniętym zapisie dla OBU imperiów (**korekta C-4 trzyma: AI nie obchodzi dyplomacji**) ·
`no_target_in_reach` przy `forceStrike(emp_002)` mimo powłoki 7 (układ gracza poza powłoką — geografia
tej galaktyki).

⏳ **JEDEN PUNKT ZOSTAJE OTWARTY I ZAMKNIE SIĘ SAM: 8e — „reguła odpaliła SAMA".** Wymaga pary
**wojna × zasięg** naraz, a w tej galaktyce taka para nie istnieje (sonda: 2 z 8 par). ⚠ **PRZY
PIERWSZYM `director:strikeLaunched` W PRAWDZIWEJ WOJNIE — dopisz tu rok i imperium.** To jedyna
obserwacja, której ten slice jeszcze nie ma, i przyjdzie sama w normalnej rozgrywce.

**Co dowiózł W3-5:** `DirectorOffensive` + reguła katalogowa `strike_player_target` — REGUŁA
z własną akcją, nie trzecia doktryna (model doktryny nie potrafi wyrazić CELU, korekta C-2).
Cztery ograniczenia, każde kupione pomiarem: **zasięg stawia reguła** (powłoka `InfluenceMap`,
§Findings 27 — transport dałby skok przez pół galaktyki) · **eskadra 2+ przeciw obronie**
(§Findings 34) · **sól galaktyki w kluczu rzutu, OPT-IN** (§Findings 24 — globalna przesunęłaby
losy pierwszego kontaktu, nacisku i mobilizacji) · **wojna jest warunkiem wstępnym, nie skutkiem**
(korekta C-4). Dobór okrętów po `warpFuel.max > 0` (D4). W3-5b domknął §Findings 32 (obcy przylot
nie ogłasza się jako Twój — modal PAUZOWAŁ grę, więc bez tego W3-5 dowoziłby regresję).

**Zmierzone sondą `probe-w3-targets.mjs`** (zasiewa żeton stacji R-3 i DOWODZI, że się przyjął):
gracz wpada w zasięg imperium w **2 z 8 par** (4 ziarna × 2 imperia) — reszta czeka na ekspansję;
pełna drabina odmów (`no_warp_capable_hull` → `insufficient_squadron` → WYSŁANO); **4 różne
układy** pierwszej odpalającej próby na 4 ziarnach (reguła bez soli: 1 układ na 4 ziarna).

✅ **W3-6** `0eae716` (desant AI z bitew `vessel_group` — próg WYPROWADZONY Z KADŁUBÓW zamiast
abstrakcyjnej siły; przy okazji frakcja naziemna najeźdźcy przestała być ludzka) ·
✅ **W3-7** `cced9df` (gracz dowiaduje się, że jest atakowany: `invasion:*` → dzwonek, stempel
`empireId: 'player'` naprawiający TRZECH filtrujących konsumentów, natywny `alert()` skasowany,
§Findings 22 naprawione U ŹRÓDŁA, i18n S26).

⏸ **GATE 3 ZATRZYMANY NA §2 (2026-08-18) — NAPRAWIONE w `6e14b34` (W3-6b).** Rajdery wygrały
orbitę, a WSZYSTKIE trzy liczniki `invasion:*` pokazały zero. Dwa defekty, oba w INSTRUMENCIE
i w KSIĘGOWYM, żaden w desancie: (1) `recordBattle` emitował `battle:resolved` ZANIM ustawił
dominację, więc bramka desantu czytała świat SPRZED bitwy i odmawiała `no_orbital_dominance`
dokładnie wtedy, gdy orbita została zdobyta; (2) `invasion:blocked` NIE był śledzony w `DebugLog`,
więc odmowa padała za każdym razem, a pomiar pokazywał ciszę. ⚠ Hipoteza ze zgłoszenia była
BŁĘDNA w jednym punkcie: EAH **też** emituje `vessel_group` — połówki spotykały się co do typu,
rozjeżdżały w CZASIE. Pójście za hipotezą dołożyłoby drugą ścieżkę i zostawiło błąd kolejności
żywy pod obiema. §Findings 44-48; §2 checklisty ma zaktualizowane polecenia.

✅ **GATE 3 ZDANY WARUNKOWO 2026-08-18** (`W3_GATE3_CHECKLIST.md` §Wynik) — §1-4, 7-9 PASS na
żywo; §5-6 nie testowane osobno (nieblokujące). **Trzy warunki = §Findings 49-51** (numeracja
orkiestratora 42-44), każdy z osobną przyszłą pracą: katalog AI nie ma roli transportowej ⇒
`no_drop_capable_hull` to jedyna osiągalna odpowiedź · desant AI biegnie na modelu LEGACY, nie
archetypach · **desant AI nigdy nie kończy się przejęciem kolonii** (brak lustra
`_tryPlayerCapture` po stronie AI; §4/§5 zweryfikowane obejściem przez `transferColony`).

✅ **W3-8** `814fb38` (wycofanie martwej warstwy abstrakcyjnej floty — `MilitaryAI`, `EconAI`,
`EmpireFleetMaterializer`, `spawnFleet`/`moveFleet`, gałąź `unifiedAggregator`, `spawnEnemyFleet`;
`war_seams_smoke` T2 przeniesione na **pin źródłowy T2b**, bo stary pin mierzył ciszę martwej
pętli, a ta pętla właśnie zniknęła) · ✅ **W3-9** (ten commit — domknięcie dokumentacji).

# 🏁 **SLICE W3 ZAMKNIĘTY.** Zapis **v101 bez migracji przez CAŁY slice**; sweep **148/148 0 FAIL**;
`check-i18n` PASS.

**Co dalej — trzy OSOBNE, nowe sesje** (nic z tego nie należy do W3): **nowy gate „AI przejmuje
kolonię"** (§Findings 51) · **katalog transportowca AI** (§Findings 49) · slice **GROUND**
(S12 morale → R13 RNG → pule desantu na archetypy, §Findings 50). ⚠ Poza tym wciąż otwarte:
§Findings 33 (nawigacja w obcych układach — asymetria WARSTWY WIDOKU) oraz punkt **8e** wyżej
(„reguła odpaliła SAMA" — przyjdzie sam w normalnej rozgrywce, dopisz rok i imperium).

---

## Audit method and confidence

Seven read-only seam audits, each followed by an adversarial pass instructed to **refute** the first pass's
load-bearing claims. Verdicts use the W1/W2 labels: **CONFIRMED** / **NARROWED** / **REFUTED**.

**Honest coverage statement.** 13 of 16 agents completed. **Both cross-cutting critics died on the account's
monthly spend limit, as did the `save-instruments` adversarial pass.** Consequences, stated plainly:

- Six of seven seams carry a completed adversarial pass. **`save-instruments` is SINGLE-PASS** — its claims
  are marked *[single-pass]* below and must be re-verified by execution before anything load-bearing is built
  on them (the W2 precedent for exactly this situation).
- The contradiction hunt and completeness sweep were **performed by hand instead**, on the five claims the
  plan actually rests on. Each was re-read at file:line by me, not inherited from an agent:
  `mission.type='attack'` has one producer · `recordBattle` has three callers and DSCS is not among them ·
  `_holdAtHome` omits the `targetPoint` its own sibling's comment declares mandatory · `OCCUPY_DURATION` is
  measured on `gameTime` · `getColoniesByEmpire` filters a deleted colony out of existence. All five
  **CONFIRMED**.
- What that hand-pass does **not** replace: a systematic sweep for seams nobody examined. Two are already
  visible as gaps — `ArmySystem` (live, wired at `GameScene.js:56`/`:290`, restored `:2142`, serialized) was
  never audited, and the **UI surface for every W3 feature** was inventoried only incidentally. Both are
  recorded in §Open decisions and §Findings filed rather than quietly assumed away.

The audit contradicted its brief in **six** places. Those are §Corrections, and three of them remove a
premise the slice was scoped on.

---

## Context

W3 was scoped from the P1 recorded intent — *an AI that selects targets and attacks its enemies, strikes the
capital, conducts ground invasions* — plus §6a's territorial peace, plus one debt handed over from W2.

**What the audit changes about that framing: W3 is not an extension slice. There is nothing offensive to
extend.** Measured, not argued:

- **The AI has no offensive dispatch of any kind.** Both shipped doctrines are home-bound —
  `_patrolBodyId:275-284` and `_outerPlanets:291-300` resolve from `capital.systemId`, and `defend_home`
  issues no movement at all. No AI code calls `WarpRouteSystem.beginJourney` (production callers are
  `OrderService.js:106` and three in `FleetManagerOverlay`). The AI's one warship template carries a
  deliberate **`CELOWY BRAK warp_tank`** (`ShipTemplateData.js:121-148`). **AI ships never leave home.** The
  only AI hull that ever reaches player space is the scripted first-contact probe — unarmed, `once: true`,
  two per galaxy.
- **The AI cannot profit from winning.** `transferColony` disposes five subsystems and deletes the colony
  from `_colonies` (`ColonyManager.js:678-685`), handing the empire **only an id** (`:693`).
  `getColoniesByEmpire` maps ids through `ColonyManager.getColony` and filters the miss
  (`EmpireRegistry.js:46-53`), so `DirectorProduction`, `EmpireResearchSystem`, `EmpireStrategySystem`,
  `EmpireLogisticsSystem` and `relinkColoniesAfterRestore` all see nothing. A conquered world yields the AI
  **zero production, zero research, zero logistics**, and the dead id persists in every future save.
- **The reserve of W3's own headline debt is empty.** `EmpireFleetMaterializer` is not "the AI's principal
  fleet source" — it is a system with **zero input**. Its only trigger is `empire:fleetMoved`, emitted only
  by `EmpireRegistry.moveFleet:223`, reachable only from `empire.fleets[]`, whose two producers are an
  unreachable `MilitaryAI.build_fleet` branch and a debug cheat. Measured twice this session:
  `war_seams_smoke` T5 (Σ = 0 after 120 civY) and `probe-war-seams` W2a (Σ = 0 after 200 civY).

**And three foundations are broken underneath the features, in the consumer-side way the standing question
predicts.** Each would make its feature cosmetic:

1. **Deep-space combat is not booked.** `DeepSpaceCombatSystem._finalizeBattle` writes
   `gameState.set('battles.<id>')` and emits `battle:resolved` with **`warId: null` hardcoded**
   (`:1006-1007`). `recordBattle` has exactly three callers — `WarSystem.js:339`, `:492`,
   `EnemyAttackHandler.js:181` — and DSCS is not one of them. So a war fought in deep space accrues **no
   exhaustion, no `war.battles[]`, no orbital dominance**. Exhaustion is the 55-point term of peace
   acceptance. **A war fought where the player actually fights can never be ended by attrition** — and
   territorial peace would price itself against a counter that does not move.
2. **Orbital dominance does not survive a save.** Written on every battle (`WarSystem.js:288`), read by the
   troop-drop gate (`FleetActions.js:553`, `:588`; `ColonyOverlay.js:261`, `:323` via
   `playerHasOrbitalDominance:671`) — and **absent from `createDefaultState`**, so `GameState.restore`'s
   top-level merge (`GameState.js:142-147`) discards it at every load. The source documents its own casualty
   at `GameState.js:52-54` and `WarSystem.js:623-625`; `SaveMigration.js:1643-1645` seeds a key that restore
   then throws away.
3. **Conquest does not touch diplomacy.** Neither ownership executor calls `changeHostility`, `changeTrust`
   or `addIncident` (audit finding 2.4b, re-confirmed). Taking an empire's homeworld changes the relation by
   **zero**. The thing territorial peace is meant to price is not connected to the thing that would price it.

**The one genuinely cheap thing the audit found.** The entire orbital-strike pipeline already exists and is
correct — batching, **auto war declaration** (`EnemyAttackHandler.js:112-120`), `recordBattle` booking,
orbital dominance, wreck placement. It is gated on `mission.type === 'attack'` (`:41`), and the only producer
of that mission in the tree is the debug cheat `SpawnTestEnemy.js:612`. Meanwhile the only live AI order
channel builds `mission = { type: 'move_to_point' }` (`MovementOrderSystem.js:564-566`). **The two facts
have never been joined: even a correct AI order sending a hull to a player planet produces arrival with no
battle.** W3's first offensive capability is a *producer for one mission type*, not new combat code.

---

## Corrections to WAR_BACKBONE

Six findings that change the slice's shape. Three remove premises carried in the scope statement.

### C-1 — "The ground-invasion path: the audit's §2 assessment stands (functional)" — **REFUTED for the AI direction.** The path is dead at both ends.

The **player→AI** direction is live and complete: `drop_troops` (`FleetActions.js:535-563`, gated on
`playerHasOrbitalDominance`) → `_dropMode` (`ColonyOverlay.js:308-341`) → `Vessel.dropTroop:729-736` →
`CombatSystem` stack combat → tile flip → `InvasionSystem._tryPlayerCapture:223-250` →
`captureColonyForPlayer`.

The **AI→player** direction cannot fire:
- `InvasionSystem._onBattleResolved:151` returns unless `participantA.type === 'empire'`. Only abstract
  fleets emit that shape (`WarSystem.js:336` debug, `:489` `_fleetArrived`); every real battle emits
  `'vessel_group'` (`DSCS:945`, `EnemyAttackHandler:154`).
- `fleet.hasTroopTransport` has no live producer (`EmpireRegistry.js:199-201` defaults false; only
  `SpawnTestEnemy.js:364-369` sets it), so the `invasion:blocked / no_troop_transport` branch would take
  every fleet anyway.
- ⚠ **These are not two independent gates.** The would-be producer sits inside `MilitaryAI.build_fleet`,
  which can never run. **Adding the three fields to `spawnFleet` would fix nothing.**

⇒ W3 does not extend the AI invasion path. It needs a **new entry point from `vessel_group` battles**, reusing
the live `launchInvasion(empireId, planetId, count, archetypes)` intent and the whole landing/capture half,
which does work.

### C-2 — "Doctrines must remain extensible to offensive target selection" — the doctrine model cannot express a target, and one of its two branches is broken. **[CONFIRMED by execution of the validator]**

- A doctrine is not a first-class object: it is a catalog entry whose response is the single action
  `assignDoctrine`, plus a roster array. The doctrine **name** is validated by a hardcoded string test that
  **throws** on anything else (`DirectorDoctrine.js:85-87`).
- A third doctrine is **not data-only**: **five** hardcoded sites — whitelist `:85-87`, dispatch ternary
  `:101-103`, roster write `:120-121`, `_pruneAllRosters` `:207-210`, `_hasAnyDoctrine` `:220`.
- ⚠ **`_holdAtHome` is broken today.** It issues `{ type: 'moveToPoint', targetBodyId, … }` with **no
  `targetPoint`** (`:140-143`), while `validateOrder` puts `moveToPoint` in `TYPES_WITH_POINT_TARGET` and
  returns `missing_target_point` (`MovementOrderTypes.js:28`, `:52-58`). Its sibling `_sendOnPatrol:166-170`
  passes the point **and its comment `:162-165` states the requirement in writing**. So every garrison
  move-to-capital order for a ship not already docked there is rejected, `_issue` warns, and the ship is
  dropped from the roster. `war_doctrine_smoke` spawns garrison ships **already docked** (`:64`, `:78`) and
  asserts the early-return HOLD path (`:90`), so the order path has never been exercised.
- ⚠ Doctrine assignment is a **one-shot order, not a behaviour**. `_idleArmedAtCapital` excludes anything
  with a `movementOrder` (`:260`) and `_hasAnyDoctrine` excludes anything already rostered (`:265`), so a
  doctrine'd ship is permanently invisible to every other rule. The patrol doctrine's own documented
  "circuit" (`:271-284`) is therefore unenforced: **each ship receives exactly one patrol order in its
  lifetime.** Same class as `roll.unit` — declared behaviour the engine never performs.

⇒ Offensive target selection must be a **rule with its own action**, not a third doctrine branch.

### C-3 — "The W2-carried debt: price materialized-fleet crew" — **REFUTED as work.** The system has zero input; pricing it is dead work.

W2 §Findings 10 is verbatim correct about the mechanism (`EmpireFleetMaterializer.js:105-110` calls
`createVessel` without `serviceState` ⇒ `'active'` by default, `crewLocked: 0`). But the surrounding claim —
*"it is the AI's principal fleet source"* — is false, and the GATE 3 close-out already proved it by
enumeration. The materializer has no reachable trigger.

Two further facts make revival actively unattractive: its hulls carry `modules: []`
(`FleetCompositionPolicy.js:78`) ⇒ `hasWeapons` false ⇒ **both** AI armed-hull selectors skip them
(`DirectorMobilization.js:59`, `DirectorDoctrine.js:251`); and it stamps `colonyId = the PLAYER's
homePlanet.id` (`:105`), so `_resolveCrewColony` would crew an AI war fleet **from the player's population**.
Its trigger is also hardcoded to the literal `destSystemId === 'sys_home'` (`:191`), so it would not fire for
a strike on any other system.

⇒ The debt closes by **retiring the path**, not by pricing it. *Narrowing:* "zero producers" is not "cannot
exist" — `createEmpire` does whitelist a `fleets` slot (`EmpireRegistry.js:96`) and `GameState.restore`
rehydrates `empires` verbatim, so a legacy save can carry entries. The defensible claim is **no live producer
in a fresh game**.

### C-4 — The AI *does* already select the player as a target — in the diplomacy dimension, and that is where war goals must attach. **[CONFIRMED]**

`DiplomacySystem.changeTension:294-305` runs warning → ultimatum → `declareWar` at threshold, plus `:713` on
ultimatum expiry, guarded by `non_aggression` (`:319`) and nothing else. This is the only production code
where an AI picks the player as a target, and `WAR_BACKBONE` §6a's *"war goals reaching back into
`declare_war`"* lands here — **not** in `MilitaryAI`.

⚠ `MilitaryAI` is **live-wired and ticks every civYear** (`AlienCivSystem.js:133-136`). It is not unwired; it
**scores 0** on all three actions, because `EmpireRegistry.updateResource`/`updateMilitaryPower` are explicit
no-op stubs (`:150-157`) and `createEmpire`'s literal has no `resources` key. The distinction matters: a plan
line reading *"MilitaryAI never runs"* would look for the wrong fix.

### C-5 — Conquest does not stick, in three independent ways. **[CONFIRMED]** This is the precondition of the whole slice.

1. **Dangling id (AI gains nothing).** Above, §Context.
2. **Invisible after a save.** `syncToGalaxyData` clears every stamp and re-derives `systemId` through
   `colMgr.getColony(colonyId)` (`EmpireRegistry.js:268-290`, `:283-285`) — the deleted colony returns
   undefined and the conquered system is skipped. The in-place stamp at `ColonyManager.js:699` is runtime-only
   **and** conditional on `!gs.empireId`. ⇒ after any save/load the AI's conquest is invisible to the
   border/trespass logic and to the political map.
3. **The counterparty can be deleted mid-war.** `EmpireRegistry.removeColony:137-148` calls `destroyEmpire`
   when the last colony leaves. `captureColonyForPlayer` on an AI's final body therefore **deletes the empire
   record** while `gameState.wars.*` and the diplomacy relations keyed on that id survive as dangling
   references (only `IntelSystem.js:89` and `TerritoryService.js:32` react to `empire:destroyed`).

Plus the event half: `transferColony` hand-rolls a partial teardown (docked vessels `:641-648`, trade routes
`:652-654`, five `dispose()` `:678-682`) but **never emits `colony:destroyed`**, so `MissionSystem:120`,
`StationSystem:213`, `TransportOrderSystem:51`, `VesselManager:109`, `EmpireLogisticsSystem:97`,
`SystemPoolService:53` and `GameScene:3204` never fire. Missions keep flying to a body that changed hands; a
player station silently re-mothers onto an unrelated colony (`TransferStore.js:79-82`).

### C-6 — "`CAPTURE_GRACE_YEARS` has been waiting in the code for exactly this" — **REFUTED.** It is dead, and the grace that exists is a clock bug.

`CAPTURE_GRACE_YEARS = 3.0` (`InvasionSystem.js:26`) and `invasions[].playerEmptySince` (`:133`) are both
declared, both documented in the header (`:14-18`), and **read by nobody**. `_tickCaptureChecks:287` has no
elapsed test.

What produces a de-facto grace is `_tickOccupation`: `OCCUPY_DURATION = 6/12` measured against
`this._year()`, which is `timeSystem.gameTime` — **displayed** years (`GroundUnitManager.js:565`, `:967`). So a
built hex takes **6 displayed months**. ⚠ **Three contradictory unit declarations for one timer**: `:405`
says *"2-mo timer"*, `:565` says *"6 miesięcy = 0.5 civYear"* (the two halves disagree by 12×), `:624` says
*"timerem 0.5 civYear"*. The enforced value matches only the "6 months" half.

⚠ **Therefore "fix the clock" is a trap**: a reader who believes the `0.5 civYear` half and corrects the code
to match would make every ground capture **12× faster**, deleting the only grace the game has. The active
route is a *different* clock again — `_tickCaptures` runs on civ (`:804`, 2 civY = 2 displayed months).

---

## Audit — state of the seams (read-only, with verdicts)

| # | Seam | State | Load-bearing detail |
|---|---|---|---|
| S1 | AI offensive dispatch | **does not exist** | Both doctrines home-bound; no AI caller of `beginJourney`; L1 template has no warp tank by design. The AI's only reach into player space is the scripted first-contact probe. |
| S2 | `mission.type='attack'` | **one producer, and it is the cheat** | Gate `EnemyAttackHandler.js:41`; producer `SpawnTestEnemy.js:612`. The whole orbital pipeline behind it (batch, auto-war `:112-120`, `recordBattle` `:181`, dominance, wreck) is live and correct. |
| S3 | Live AI order channel | **wrong mission type** | `MovementOrderSystem._issueMoveToPoint:564-566` builds `type:'move_to_point'`. The join to S2 is the missing link for capital strikes. |
| S4 | `DirectorDoctrine` | **5 hardcoded sites; `_holdAtHome` broken; one-shot** | C-2. Keeper never exercises the order path. |
| S5 | Battle booking | **third silent path still open** | `recordBattle` callers: `WarSystem.js:339`, `:492`, `EAH:181`. DSCS emits `warId:null` (`:1006-1007`); VCS likewise. W1-4 closed EAH only. |
| S6 | `orbitalDominance` | **wiped on every load** | Producer `WarSystem.js:288`; absent from `createDefaultState`; four live consumers via `playerHasOrbitalDominance:671`. ⚠ `FleetTabPanel.js:2132` is a **dead file** — do not count it. |
| S7 | Ownership executors | **asymmetric by construction** | `transferColony` deletes (dispose ×5 + `_colonies.delete`); `captureColonyForPlayer` keeps everything and rewrites in place. A returnable body has **no data to return** on the delete side. |
| S8 | Conquest aftermath | **AI gains nothing; empire can vanish** | C-5, three ways. |
| S9 | Occupation representation | **exists per-HEX only** | `tile.owner` + `tile.occupyEmpireId`/`occupyStart` are real, serialized, with reset-on-abandon (`HexTile.js:255-259`; `GroundUnitManager:564-613`). ⚠ `tile:ownerChanged` (`:619`) has **zero subscribers**. No colony-level state, and none possible for a body the player LOST. |
| S10 | `CAPTURE_GRACE_YEARS` | **dead; grace is a clock artefact** | C-6. |
| S11 | Ground combat AI | **exists — first pass was wrong** | `GroundUnitManager._tickCombatAI:984-1014` drives every non-player unit (nearest foreign unit → `moveUnit` onto its hex). W3 inherits a tactical AI with a role-name bug at `:1010` (`role === 'military'`), it does not build one. |
| S12 | Ground unit morale | **legacy units die on the first hit, and a reload changes it** | No `morale`/`noMorale` on legacy archetypes ⇒ `CombatSystem:302-303` sets 0 ⇒ the same round's sweep `:232-241` disbands. Applies to AI landing troops **and** the player's starting infantry (`GameScene:3841`). ⚠ `serialize` writes `morale: u.morale ?? 100` (`:1281`) and legacy restore spreads (`:1380-1398`) ⇒ **ground outcomes differ before vs after a save/load — a determinism hole larger than R13.** |
| S13 | R13 (ground RNG) | **confirmed, 4 live sites, 2 seeded precedents** | `CombatSystem:291`, `:357`; `InvasionSystem:101`, `:334` (+ dead `GroundUnitManager:693`). Reuse `BattleSystem.mulberry32` (`:21-30`, seeded from `context.seed` `:98`) or `SeedMath.mixSeed` (`:31-44`). ⚠ `headless/env.js:34-36` **globally replaces `Math.random`**, so keepers booting through it are blind to the defect. |
| S14 | Acceptance term slot | **already wired, never fed** | `offer` is a complete slot: ctx (`AcceptanceEngine:353`) → evaluator (`:133`) → diminishing returns → weight 10-25 (`AcceptanceWeightData:205,220,234,248,264`) + `trader ×1.5` (`:288`), marked `TERM_STATUS.UNFED` (`:95-96`). **All three production call sites pass the verb alone.** W3's territory term is the missing PRODUCER half, not new machinery. |
| S15 | Peace execution | **there is none** | `offerPeace:430-451` sets truce, caps tension, swaps opinion modifiers, emits; `WarSystem:61→:365` closes the record. **No code path anywhere transfers anything.** An executor is new. |
| S16 | War goals | **a comment, not a field** | `createWar:111-121` literal has no `goals`; `GameState.js:30` documents an intention. `war.fronts` is permanently `[]` (`addFront` has zero callers). `declare_war`'s `reason` is dropped from the war record but **does** persist on the relation (`DiplomacySystem:325`, `:332`) — a round-trip precedent. |
| S17 | Peace entry points | **three, not one** | `DiplomacyOverlay.js:606`, `WarOverlay.js:349`, and `WarSystem._triggerAutoPeace:386` (playerInitiated:false, re-fires on **every battle** once exhaustion caps, `:370-392`). A term wired into one panel yields a silently termless peace from the other. |
| S18 | `war_status` rationale | **stale since W1-4b** | `AcceptanceEngine:93-96` justifies `min(exhaustionSelf, exhaustionOther)` on the premise both grow symmetrically. W1-4b made it asymmetric (`WarSystem:49-50`, `:256-260` ⇒ winner 2, loser 9 per battle), so `min()` now systematically reads the **winner's** counter. Against `peaceCost 30` the winning side needs ~15 battles before peace is arguable. |
| S19 | Territory index | **a ceded colony vanishes from it** | `TerritoryService._rebuild` indexes `getAllColonies()` + **player** stations only (`:77-102`); `getSystemDevScore` itself has **zero callers** (`:45`), devScore reaching a consumer solely via `getOwnedSystems` → `TerritoryField:75-80`; AI stations skipped (`:98`). After a player→AI cession the system loses its owner and the AI never gains it. |
| S20 | `InfluenceMap` | **built, 80 % unused** | Only production reader is `DirectorPressure.js:66`, `:81`. `getBorderSystems` / `getClaimedSystems` / `distanceToClaimLY` / `getClaimant` have no caller — an existing LY-scale adjacency layer for "which enemy system is next to me". |
| S21 | AI warship production | **one structural master switch** | `queueWarships` rejects `no_orbital_station` unless `hasOrbitalStation` (`DirectorProduction:163-166`, `:359`); the token is seeded **only** if `window.KOSMOS.stationSystem` exists at bootstrap (`EmpireColonyBootstrap:255-270`), else a warn + `ai:empireStationSeedFailed`. ⚠ **`GameCore` does not mount `stationSystem`**, so headless AI is structurally incapable of building a warship — any W3 measurement that does not seed the token measures silence. |
| S22 | Reserve vs orbit | **stored hulls hold ground they cannot defend** | `_hasHostileFleetInSystem` (`WarSystem:630-641`) and `_hostileWarshipInOrbit` (`SystemPoolService:352-356`) do **not** test `isInService`, while `ProximitySystem:77` refuses to detect stored hulls and DSCS refuses to fight them. *Narrowed by the verifier:* `mobilize_reserve` (guard `empireOutgunnedByPlayer`) exists to pull hulls out exactly when a player strike force arrives, so a permanent lock is **not** the default — residual only (roll 40 %, cooldown 3 y, `empireHasFreeCrew`). |
| S23 | Reserve asymmetry in combat | **live defect** | `EAH._resolveBatchedBattle:93-98` gathers enemy orbiters with **no** `isInService` filter, while `_wreckPlayerVesselsInSystem:334` **does** exclude reserve. An AI reserve hull fights; a player reserve hull is exempt from wrecking. |
| S24 | `MovementOrderSystem` gate | **hole in W2's exclusion set** | `issueOrder:180-229` has no `isInService` test, and `_issuePursueOrIntercept:677-682` launches directly without the gated `dispatchOnMission`. **A reserve hull can be flown by pursue/intercept/engage today** — free warship, zero crew, 10 % upkeep. |
| S25 | Player feedback | **the loudest events are silent** | `invasion:launched/troopsLanded/blocked/repelled` reach only `DebugLog:37-38` — **no UI subscriber anywhere**; colony loss surfaces as a blocking native `alert()` (`GameScene:2276`). `battle:orbitalDominance` (`WarSystem:289`) has zero consumers. ⚠ `UIManager:1344` filters EAH battles in **both** branches (participantB is `{type:'player'}` with no `empireId`, `EAH:161-164`) ⇒ no auto-slow, no combat log; and there is **no EventLog line at all on the enemy-wins branch** (`:208-216`), where the player's fleet is silently wrecked. |
| S26 | Desant i18n | **hardcoded Polish** | `ColonyOverlay.js:313,314,324,4647,4672,4685,4687`; `GameScene:2271-2273`. A standing bilingual-rule violation W3 inherits the moment it touches these flows. |
| S27 | Save model *[single-pass]* | **no bump needed; one landmine** | `CURRENT_VERSION = 101` (`SaveMigration:28`). `GameState.restore` merges **top-level keys from `createDefaultState`** and silently discards the rest (`:142-147`) — sub-keys under a declared domain ship free (precedent `director.doctrine`; `tradeOrders`/`crossEmpireTrade` at v86 with no bump). ⚠ `restore` does **not** deep-merge (`merged[k] = data[k] ?? def[k]`), so every new sub-key needs a defensive read. ⚠ A throwing migration **deletes the player's save** (`SaveMigration:261-269` → `TitleScene:414-419`). |
| S28 | Instruments *[single-pass]* | **136 suites; the closest probe is a coverage probe** | `node src/testing/smoke/run-all.mjs` (exit code authoritative); `node tools/check-i18n.mjs` (fails only on used-but-undefined; pl/en drift advisory ⇒ table-mapped reason keys need their own keeper, the `w2_deploy_ui` T6 precedent). Closest AI instrument: `probe-border-zone-coverage.mjs` (candidate systems per empire, real galaxy, multi-seed) + `AiTelemetry`'s reason-carrying decision journal. **Zero keeper coverage of `CombatSystem` or `GroundUnitManager` combat.** |

---

## Scope — SPLIT W3 (✅ SIGNED, D1)

**The scope on the table was two slices, and the audit showed a clean seam between them.**

§6a defines two paths for a body to change owners: **(1) wartime conquest** *(fait accompli)* and
**(2) peace treaty** *(legalization or exchange)*. The audit's finding is that **path 1 does not work** — the
AI cannot dispatch, cannot land, cannot book a battle, and cannot keep what it takes. Path 2 legalizes the
outcome of path 1. **Building the treaty layer first would be pricing a transaction whose goods do not exist**,
against an exhaustion counter that deep-space combat never increments (S5/S18), for a conquest the political
map cannot see (S19).

**Recommended split:**

- **W3 — OFFENSIVE AI.** Make conquest *happen* and *stick*: the three broken foundations, then the offensive
  loop (dispatch → orbital battle → landing → a colony the AI actually owns and profits from). Ends with an AI
  that can take a player world and keep it, and a player who can see it coming.
- **W4 — TERRITORIAL PEACE.** Occupation as a distinct state, `offer_peace` term slots in both directions with
  a valuation and an **executor**, war goals attaching to `declare_war` (C-4). Depends on W3's reversible
  ownership flip (S7) — a body cannot be ceded back if the delete path destroyed it.

Everything below plans **W3 only**. Deferred items are listed in §Out of scope with their W4 tag.

⚠ **D7's narrowing binds this slice's definition of "sticks":** W3 delivers **mechanical** reversibility — a
transferred colony keeps simulating and can change hands again, symmetrically in both directions. **Occupation
sociology** (loyalty, resistance, assimilation, productivity under foreign rule) is a **named future stream**,
not a gap this slice papers over. W3-1 must therefore not smuggle in a half-loyalty model; the free
`civSystem._autonomousState` hook the audit found (serialized, consumed by the loyalty cap at
`CivilizationSystem:1790`, **zero writers**) stays unwritten in W3 and is handed to that stream.

---

## Save strategy

**No bump. v101 stands.** Every W3 candidate fits an already-declared `gameState` domain or an existing
serialize whitelist:

- `orbitalDominance` → **one key in `createDefaultState`** (`GameState.js:20-56`). An empty default is the
  correct value for old saves, so no migration is needed — the fix is the declaration, not a backfill.
- Empire target/posture state → sub-keys under the declared `director` domain (precedent `director.doctrine`,
  round-trip pinned by `war_doctrine_smoke:172-197`). ⚠ Not via `createEmpire`, whose literal silently drops
  unknown fields (`EmpireRegistry:74-98` — the `military` precedent that produced K-1).
- Occupation record → under the declared `invasions` domain (`GameState.js:32`).

⚠ **Bump only if something must be BACKFILLED.** The single candidate — crew on already-materialized hulls —
is **grandfathered** exactly as W2 grandfathered `crewLocked: 0` (`SaveMigration:2392-2398`), and under C-3
the path is retired rather than priced, so it does not arise. If review overturns C-3, the bump comes back and
gets its own commit and its own gate (the W2-3 precedent).

---

## Commit plan

Atomic, one slice per commit, paths added explicitly. **Three live gates**, matching the three independent
failure modes: the repairs, the offensive loop, the conquest aftermath.

| # | commit | content | gate |
|---|---|---|---|
| **W3-0** | `test(war): weryfikacja szwów przed W3` | NEW `src/testing/headless/probe-w3-seams.mjs` + keeper `w3_seams_smoke` — pins the load-bearing facts **by execution**, each asserted against CURRENT behaviour so later commits must deliberately invert them: S2 (an AI hull ordered to a player body arrives with **no** battle) · S5 (a DSCS battle during a declared war leaves `exhaustion` and `war.battles[]` untouched) · S6 (dominance written, save/load, dominance gone) · C-5 (after `transferColony`, `getColoniesByEmpire` returns one fewer colony than `empires[].colonies` has ids) · C-2 (`_holdAtHome` on a ship not at the capital returns `missing_target_point`) · S12 (a legacy unit disbands on its first hit; the same unit reloaded does not). ⚠ Must seed the **R-3 station token** (S21) or the AI half measures silence. **Zero production code.** | — |
| **W3-1** | `fix(war): podbój zostaje — odwracalny transfer własności` | **PREREQUISITE.** `transferColony` reworked into a reversible in-place ownership flip mirroring `captureColonyForPlayer` (keep the colony in `_colonies`, keep its five subsystems, rewrite `ownerEmpireId` + hexes) — this is what makes the AI able to profit from a conquest at all, and what makes a W4 cession returnable · emit `colony:destroyed`-equivalent teardown for the seven subscribers that currently never fire, or route the existing event (C-5) · `syncToGalaxyData` re-derivation fixed · guard `destroyEmpire`-on-last-colony while a war or relation references the empire. ⚠ Touches the `s34c_z9_transfer_dispose` contract — that keeper is rewritten deliberately, not incidentally. | — |
| **W3-2** | `fix(war): DSCS i VCS księgują bitwy przez recordBattle` | The third silent path (S5), closed the way W1-4 closed EAH: DSCS/VCS route through `WarSystem.recordBattle` so a deep-space war accrues exhaustion, appends `war.battles[]` and sets orbital dominance. ⚠ **Own gate** — it changes when wars end; E7 acceptance matrices re-run with before/after attached, and the untracked BALANS baseline copied aside first (V19). ⚠ Do **not** read `lossesA/B` in any new consumer (W1 §Findings 3: HP-delta in BattleSystem, vessel count in DSCS, same field name). | **GATE 1 ✅ PASSED 2026-08-17** |
| **W3-3 ✅** `1e57d1b` | `fix(save): orbitalDominance przeżywa wczytanie` | One key in `createDefaultState` + a keeper + defensive reads (S27's no-deep-merge rule). Removes the dead seed at `SaveMigration:1643-1645`. Behaviour change — post-load invasions become possible again — so it carries its own before/after and does **not** ride another commit. | — |
| **W3-4 ✅** `4724e46` | `feat(ai): rozkaz uderzenia — producent misji \`attack\`` | The join the audit found (S2+S3): an AI hull sent at a player body arrives with `mission.type='attack'` and the **existing** EAH pipeline does the rest (batching, auto war declaration, booking, dominance, wrecks). Fix `_holdAtHome`'s `missing_target_point` in the same commit (C-2) — same order channel. **D6: close the `isInService` hole** in `MovementOrderSystem.issueOrder` here (one gate, reason `vessel_in_reserve`, i18n PL+EN) so the new order path does not inherit it (§Findings 1). ⚠ Check the **spaceport gate** (`MovementOrderSystem:489-494` → `SpaceportCheck:55-63`) is not silently refusing AI departures — it is **not** bypassed by `DirectorDoctrine`. | — |
| **W3-4b ✅** `369adfc` + `cb815cd` | `fix(war): uderzenie międzygwiezdne leci przez SKOK` + `fix(war): księga bierze układ CELU` | **Repair family forced by GATE 2 edition 1** (§Findings 25-28). Movement orders are intra-system by construction while ids are global, so `attack` on a body in another system flew to its coordinates *inside the attacker's own system* and reported docking at a body that is not there; the battle and dominance booked for the **attacker's** system, and the defender was a fabricated phantom `{hp:100, weapons:[]}`. NEW `src/utils/SystemScope.js` + system gates on `moveToPoint`/`attack`/`pursue`/`intercept`/`engage` + **`OrderService.issueAttack`** (warp → strike via `pendingOrder`) + arrival-seam repair + `WarSystem.hasPlayerPresenceInSystem`. Keeper `w3_cross_system_attack_smoke` 42/42. | **GATE 2 ed. 2** |
| **W3-5 ✅** `07c1087` + `61bdffe` | `feat(ai): wybór celu — reguła Directora, nie doktryna` | Target selection as a **catalog rule + its own action** (C-2), reading `ThreatAssessment.getStrength` for force (**D3: global truth, signed**), `TerritoryService.getSystemDevScore` for value and `InfluenceMap` for adjacency (S19/S20 — reuse, do not write a second scorer). **D4 (verified): strike composition selects hulls on `warpFuel.max > 0`, never on template id**, so the escorts fly and FRG-3 stays home by its own design; "no warp-capable hull in reserve" is a **first-class refusal reason**, since roamers arrive only at L2, one per incident. ⚠ **`delay: 0` mandatory** (`_firePending` dereferences the null left by `gameState.set(key,null)` **outside** both try/catch layers — `DirectorSystem:252-262`, `:161`; pinned catalog-wide by `w2_ai_mobilization` T4). ⚠ Roll key must mix `GALAXY_SEED` — the first-contact defect is precisely this class and `DirectorRuleMath:71-74` warns about it in writing. ⚠ Roll-less rules are throttled only by cooldown; the once-per-displayed-year gate lives inside `if (rule.roll)`. **⚠ CARRIES THE W3-0 PROBE** (scope ruling 2026-08-17: folded here, where its measurement is consumed and the Director must be wired anyway — building it in W3-0 would be harness work done twice). NEW `src/testing/headless/probe-w3-targets.mjs`, multi-seed, longitudinal. **⚠ IT MUST SEED THE R-3 STATION TOKEN** — `GameCore` mounts no `stationSystem`, so `EmpireColonyBootstrap:255-270` skips the token, `DirectorProduction:359` refuses every warship with `no_orbital_station`, and **an unseeded probe measures SILENCE, not restraint** (S21). Replicate the bootstrap's seed after boot (`new StationSystem()` → `createStation(capitalBodyId, { ownerEmpireId, starterModules: false })`, the `director_station_seed_smoke` shape) and **assert the token took** before measuring anything. | **GATE 2 §8** |
| **W3-6 ✅** `0eae716` | `feat(ai): desant AI z bitew vessel_group` | New entry point into the live `launchInvasion` intent from `battle:resolved` with `participantA.type==='vessel_group'` + orbital dominance, reading `vessel.troopCapacity`/`canDropTroops` off the winning side's real hulls (C-1). Reuses the whole landing/capture half unchanged. ⚠ `MIN_SURVIVING_STRENGTH_TO_LAND = 30` is evaluated against abstract `pA.strength` — a unit with no meaning on the real-vessel path; it needs a hull-derived replacement, not a copy. | — |
| **W3-7 ✅** `cced9df` | `feat(ui): gracz widzi, że jest atakowany` | S25, the cheapest large win in the slice: `invasion:*` gains a real consumer through `NotificationCenter` with the W2-7 contact gate (anonymous at `contact`, named at `detailed`) · the `{type:'player'}` participant gains `empireId:'player'`, which repairs **three** filtered consumers at once (`UIManager:1344` and both `GameScene` branches) · an EventLog line on the enemy-wins branch (`EAH:208-216`) · colony loss stops being a native `alert()`. i18n PL+EN, and the desant strings of S26 come with it. | **GATE 3** (checklista gotowa) |
| **W3-8 ✅** `814fb38` | `chore(ai): wycofanie martwej warstwy abstrakcyjnej floty` | C-3/C-4: retire `MilitaryAI`/`EconAI`/`EmpireFleetMaterializer`/`spawnFleet`/`moveFleet` and the `unifiedAggregator` branch behind an explicit dead-code notice, deleting `FLEET_AGGRO_INTERVAL` with them. **Isolated commit, after the live gates** — the point is that nothing above depends on it. | — |
| **W3-9 ✅** | `docs(war): domknięcie W3` | `WAR_BACKBONE.md` C-1…C-6 · master plan · `CLAUDE.md` · `MEMORY.md` + memory file · this plan's results. | — |

**Per-commit gates:** `node src/testing/smoke/run-all.mjs` **0 FAIL** · `node tools/check-i18n.mjs` **PASS**
with pl↔en divergence **0 both ways** · no `window.KOSMOS?.` silent no-op in any new decision path (audit R12).

**⚠ R13 is deliberately NOT in this commit plan.** Seeding four `Math.random` sites buys nothing while
`CombatSystem` has no `serialize` at all and S12's morale defect changes ground outcomes across a reload. The
honest ordering is **S12 first, then R13, as their own slice** — see §Open decisions D5.

---

## Tests

Keepers in `src/testing/smoke/` (no `tmp_` prefix, imports via `../../`). **Fail-first proven by execution**,
and **every pin carries a pin control** — a pin without one is indistinguishable from a pin that checks
nothing.

⚠ **The neighbour a dispatch pin must not be satisfiable by is `isImmobilized`** and the neighbour an
occupation pin must not be satisfiable by is `tile.owner` — both produce the same observable through different
mechanisms.

⚠ **A keeper that silently no-ops passes the sweep** (`run-all.mjs:47-69` — exit code decides, the summary
line is advisory). Combined with `GameCore` mounting neither `stationSystem` nor the Director (S21/S20 of W2),
a green pin proves nothing on its own.

| keeper | commit | what it pins |
|---|---|---|
| `w3_seams_smoke` | W3-0 | The six pre-state facts by execution (see commit plan). Each is inverted deliberately by a later commit. |
| `w3_conquest_persists_smoke` | W3-1 | After a transfer: the empire's colony id resolves to a live colony · the AI's production/research/logistics see it · `galaxyData` survives a save/load round-trip · taking the last colony does **not** leave a dangling war record. Pin control: a *player* capture still behaves exactly as `invasion_player_capture_smoke` asserts. |
| `w3_battle_booking_smoke` | W3-2 | A DSCS battle during a declared war moves `exhaustion`, appends `war.battles[]` and sets dominance · a battle with no war still routes to the **skirmish** fork (`_classifyBattle:171-190`) and never to exhaustion · `lossesA/B` is read by nobody new. |
| `w3_dominance_persist_smoke` | W3-3 | Dominance survives serialize→restore, including an **enemy** controller · an old save with no key restores to the empty default · the troop-drop gate reads the restored value. |
| `w3_attack_dispatch_smoke` | W3-4 | An AI hull ordered to a player body arrives carrying `mission.type='attack'` and EAH resolves a battle · `_holdAtHome` on a ship away from the capital now succeeds (the `missing_target_point` inversion) · **pin control**: a *patrol* order is unchanged. |
| `w3_target_selection_smoke` | W3-5 | The rule fires at most once per displayed year · its guards actually gate it · **`delay: 0` across the whole catalog** (C-7's dormant crash stays dormant) · **the roll key mixes `GALAXY_SEED`** — asserted by two galaxies producing different choices, the instrument the first-contact finding lacked. |
| `w3_ai_invasion_smoke` | W3-6 | A `vessel_group` victory over a defended player body lands troops · without dominance it does not · the landing party is derived from real hull capacity, not from abstract strength. |
| `w3_attack_visibility_smoke` | W3-7 | `invasion:*` reaches a notification at `contact` and is named only at `detailed` · the enemy-wins branch writes an EventLog entry · **filter by event kind, never by display text** (the GATE 2 rule bought with a bug). |

**Regression that must pass unedited:** `war_seams` · `war_doctrine` · `war_skirmish` · `threat_assessment` ·
`acceptance_relpower` · `acceptance_engine` (210 PASS today, incl. the P14 import pin) · `director_pressure` ·
`director_first_contact` · `director_feed_isolation` · `director_skeleton` · `w2_deploy_model` ·
`w2_crew_ledger` · `w2_reserve_upkeep` · `w2_ai_mobilization` · `w2_migration_v101` ·
`invasion_player_capture` · full sweep (**136** today).

**Keepers EXPECTED to fail, to be rewritten deliberately and not incidentally fixed:**
- `s34c_z9_transfer_dispose_smoke` — W3-1 changes the dispose contract it exists to pin.
- ~~`war_doctrine_smoke:64,:78,:90` — asserts the early-return HOLD path; W3-4 makes the order path
  real.~~ **PREDICTION WRONG (W3-4, measured):** the keeper passes **34/34 unedited**. It spawns the
  garrison *already docked at the capital*, so it only ever exercised the early-return HOLD branch —
  which W3-4 does not touch. That is precisely **why** the `missing_target_point` defect survived:
  the keeper's blind spot and the defect's location are the same place. The order path is now
  covered by `w3_attack_dispatch_smoke` T3 and by the inverted `w3_seams_smoke` T5.

**BALANS.** Copy the untracked baseline in `src/testing/reports/balans/` aside **before** the first W3-2 run
(V19 — the runner overwrites the same filename) and diff the payload, not the file.

---

## Verification (live gates)

**GATE 1 (W3-2) — the ledger. ✅ PASSED 2026-08-17, all eight sections — `W3_GATE1_CHECKLIST.md` §Wynik.** Fight a deep-space battle during a declared war: exhaustion moves for both
sides asymmetrically (winner 2, loser 9), the battle appears in the war record, and orbital dominance is set.
Then a battle with **no** war: tension moves, exhaustion does not. ⚠ Check the acceptance breakdown before and
after — this commit changes the price of peace, and the E7 matrices must be attached to the gate, not
promised after it.

**GATE 2 — split in two by the commit order.** ⏳ The MECHANISM half (W3-3 + W3-4) is written up and awaiting the owner: `W3_GATE2_CHECKLIST.md` (strike order → flight → battle · dominance across a reload · the reserve gate · the garrison fix). The AUTONOMY half below is appended to that same checklist when W3-5 lands.

**GATE 2 autonomy half (W3-5) — the offensive loop.** On a live save with an AI past the war-commodity gate and holding an
orbital-station token: the AI picks a target, hulls leave its home system (the first time in the game's
history), arrive over a player body, and a battle resolves through the normal pipeline. The player sees it
coming through sensors and hears about it in the Journal. ⚠ Verify the rule fires **once**, that a second
galaxy makes a **different** choice (the seed pin, live), and that parity quiets it — the W2 GATE 3 brake
should still be visible in the data.

**GATE 3 (W3-7) — the aftermath.** Let the AI take a player colony: troops land **with a notification the
player actually receives**, the colony changes hands without a native `alert()`, and — the point of the whole
slice — the AI **keeps and uses it**: it appears in that empire's production and research, it survives a
save/reload, and the political map shows the system as theirs. Then reload and confirm orbital dominance is
still where the battle left it.

**Standing gate-script rules, all still binding, each bought with a bug:** no multi-line code inside block
quotes · capital **only** via `KOSMOS.directorProduction.capitalOf(empireId)` · read shortages **from the
engine**, never from a list in memory · `DebugLog` is a ring **cleared on reload** · **never run a gate in
parallel with CC work** · state levers only through validated tools · **every one-liner EXECUTED on the live
engine before it is written into the checklist** · **never filter Journal or log entries by DISPLAY TEXT** —
filter by event kind, channel or entry `type`.

---

## Out of scope (deliberately)

**Deferred to W4 (territorial peace):** occupation as a distinct colony-level state (§6a) · `offer_peace`
term slots for celestial bodies in both directions, their valuation function and the **executor** that
performs the transfer (S14/S15) · war goals fixed at declaration and reaching back into `declare_war` (S16,
C-4) · peacetime cession (`territory_exchange`) · captured population's fate.

**Deferred to the named "GROUND" slice (D5, queued after W3):** the S12 morale defect **first** (first-hit
disband + reload-to-100), then R13 ground-RNG seeding. ⚠ That slice's plan must carry the
`headless/env.js:34-36` warning in writing — it replaces `Math.random` globally, so most keepers are blind to
R13 by construction.

**Deferred to the named "occupation sociology" stream (D7's signed narrowing):** population loyalty under
foreign rule, resistance, assimilation, productivity penalties. W3 delivers mechanical reversibility only.
The free `civSystem._autonomousState` hook stays unwritten and is handed to that stream.

**Deferred with a named reason:** the `_tickOccupation` clock (C-6 — fixing it in isolation
makes capture 12× faster; it needs its own before/after) · ship repair (dead game-wide,
`VesselManager:1830`; enabling it changes attrition balance everywhere) · AI fleet upkeep (W2 decision 14,
`PHASE5_TODO` at the guard — and `_resolvePayHomeId`'s player-home fallback must be fixed before the flip is
one line) · per-empire weapon/sensor tech state · empire↔empire relations, intel and targeting (**D5**;
`DiplomacySystem` keys every relation to the player constant) · the three divergent weapon predicates and the
`lossesA/B` unit collision (W1 §Findings 2-3) · BattleSystem↔DSCS pricing parity (W1 §Findings 4) ·
`_firePending`'s latent crash (pinned dormant by `delay: 0`; fixing it is its own commit) · the synchronized
first-contact seed (standing parallel item, its own before/after).

---

## Findings filed (not fixed in W3)

1. **`MovementOrderSystem.issueOrder` has no `isInService` gate** (S24). A reserve hull can be flown by
   pursue/intercept/engage from the right-click menu today — free warship, zero crew, 10 % upkeep. This is a
   hole in W2's exclusion set, not a W3 discovery, but any W3 order type inherits it. **Candidate for W3-4**
   if review wants it closed (see D6).
2. **`EAH._resolveBatchedBattle` does not filter reserve while `_wreckPlayerVesselsInSystem` does** (S23) —
   an AI reserve hull fights, a player reserve hull is exempt from wrecking.
3. **The AI never demobilizes.** Every `withdrawVessel` caller is player-side, so AI crew is a one-way
   ratchet and POP returns to an AI colony only through death. Any rule that mobilizes on threat should state
   whether the AI ever stands down, or reserves drain AI population monotonically.
4. **`ThreatAssessment` is global truth, not intel-gated**, and three of its seven public methods
   (`getRelativePower`, `getAllStrengths`, `valueOfVessel`) have **zero** production consumers. Wiring it into
   target selection as-is gives the AI perfect knowledge of player strength everywhere (D3).
5. **`director.posture` is written by `DirectorPressure:108`, serialized, and read by nobody**;
   `director:doctrineAssigned` is emitted into nothing. Two serialized-and-unread fields in the domain W3
   works in.
6. **The ETA unit is mislabelled by 12×.** `moveFleet`'s JSDoc says civYears (`EmpireRegistry:209`) while the
   arithmetic uses `gameTime` (`:216-220`), feeding `ETA_WINDOW_CIV_YEARS` (`EmpireFleetMaterializer:24`).
   Inert only because `empire.fleets` is empty — reviving abstract fleets revives the error.
7. **`WarSystem._isPlayerInSystem` counts any colony, including AI ones** (`:495-502`), so an AI colony makes
   "the player is present" true. A direct input to attack decisions.
8. **`IntelSystem`'s passive rumor discovery has never fired** — it reads `col.systemId` off `emp.colonies`,
   which is a string array (`EmpireRegistry:51-53`), so `inRange` is always false and
   `PASSIVE_RUMOR_LY`/`PASSIVE_RUMOR_YEARS` are dead. W3 reasons about what the AI knows while one of two
   discovery channels is inoperative.
9. **`ArmySystem` was never audited** — live, wired (`GameScene:56`, `:290`), restored (`:2142`), serialized,
   subscribing `groundUnit:routed`. An entire ground-domain system with persistent state, untraced.
10. **`CombatSystem` has no `serialize` at all**, so round counters and battle totals are lost on reload and
    `combat:hexResolved` then never fires (guarded by `if (totals)`).
11. **A new `offer_peace` precondition misfires today.** `offerPeace` has no blocked branch:
    `if (!result.decision)` (`DiplomacySystem:434`) catches hard blocks too, so a block would stamp memory
    `peace_refused`, call `noteRefusal` — setting a `recent_refusal` cooldown for a block, which the code
    explicitly forbids at `:360-363` — and never reach `REJECT_REASON_BY_KEY`, which is wired only into
    `proposeTreaty` (`:546`). **W4 must fix this before adding a personality floor on territory.**
12. **`war_status`'s documented basis is stale** (S18) — `min()` now reads the winner's counter. Any W4
    territory valuation composes with it.
13. **Battle history is pruned to the 50 most recent** at serialize (`GameState:121-134`). Evidence anchored
    to battle records expires at load.
14. **Dead surfaces that skew greps in this area:** `FleetTabPanel.js` (never imported, yet appears in every
    naive `orbitalDominance` consumer list at `:2132`) · `EventChoiceModal.js` (zero importers) ·
    `ExpeditionSystem.js` (dead twin of `MissionSystem`) · `casusBelli.moralePenalty` and `war.fronts`
    (`addFront` has zero callers) — both look like existing war-cost mechanics and are consumed by nobody.
15. **`buildScheduledEventPopup` does not read per-button `onClick`** (`ScheduledEventPopup:434`, buttons
    `:647-677`), so the diplomatic popup channel cannot carry per-button actions. A working builder exists
    (`buildTerminalPopup`), used by `IntroModal`. Relevant to W4's proposal UI.
16. **`DirectorPressure._pickRoamer`'s tie-break hash carries no galaxy salt** (`:170-172`,
    `h = h*31 + charCode`) — the same class as the first-contact defect (`DirectorRuleMath:105`,
    `DirectorFirstContact._courseAngle`) and `DirectorDoctrine._hash:327-331`. It decides which escort an
    empire builds only when `aggression` is strictly between 0.4 and 0.6, so the blast radius is small — but
    it is a third site of the class the project has already been bitten by twice. Found while verifying D4.

### Added at GATE 1 (2026-08-17, owner-witnessed live) — GATE 1 PASSED, all eight sections

17. **`spawnEnemyFleet` is the wrong lever for the Combat Sandbox, twice over.** In the sandbox it
    spawns an **abstract** fleet for `emp_test_enemy` — but the sandbox's war is declared against
    `emp_sandbox_enemy` (`CombatSandbox.js:29`, `_declareSandboxWar:411-419`), so the fleet belongs
    to the **wrong empire**; and the abstract path is precisely what **W3-8 retires** (decision D2).
    ✅ **RULED 2026-08-17: the lever DIES WITH W3-8.** Rewriting it onto real hulls would duplicate
    `spawnEnemyAttack`, which already does the job better (a real journey, interceptable). Marked
    deprecated in the debug docs now — one line in `CHEATS.md` and in
    `docs/design/combat-sandbox-scenario.md` — and deleted in W3-8 together with the abstract stack.
    §6 of the GATE 1 checklist carries the same note; the control it was meant to provide is covered
    offline by `war_seams_smoke` T6 and `w3_battle_booking_smoke`.
18. **S18 confirmed LIVE by the owner, not just by reading.** Over eight battles the loser's counter
    reached **28.8** while the winner's crawled to **6.4** — and the peace curve tracked the **6.4**.
    `war_status` uses `min(exhaustionSelf, exhaustionOther)`, so **the price of peace reads the
    WINNER's counter** and cannot tell who is winning. The formula's own justification
    (`AcceptanceEngine.js:93-96`) says both sides "grow symmetrically", which W1-4b made false.
    **W4 prices territory with this same term** — it must be resolved there, not inherited.
19. **S25 confirmed live TWICE, and it is worse in the hand than on paper.** Battles resolve as
    **background toasts** the player can miss entirely, and losing a colony arrives as a **native
    Windows alert** (`GameScene.js:2276`). This is exactly W3-7's mandate — now owner-witnessed
    rather than inferred from a grep, which raises its priority within the slice.
20. ⚠ **`getAllColonies` returns colonies of EVERY owner, and the only visible distinction is a
    UI-name suffix.** The gate stalled on ownership ambiguity because of this. **Binding rule for
    every future checklist and probe: select the player's colonies by the ownership stamp
    (`ColonyManager.getPlayerColonies()` / `isPlayerColony`), NEVER by name or by eyeballing a
    list.** This is the same canon `ai-empire-hidden-from-player` already records for UI code; it
    now applies to gate scripts too. ✅ **Third justification, and the sub-question is CLOSED:** the
    three Propus bodies (`entity_157/158/159`) belong to **`emp_002`** — no missing stamp, no fourth
    owner; the sandbox simply builds on a live galaxy skeleton, so "absent from three lists" meant
    "we were reading three lists out of four".
21. ⚠ **CORRECTED 2026-08-17 — the original entry was WRONG.** It read *"the Combat Sandbox seeds a
    player colony outside the home system that the Outliner never showed (Nihal c)"*. **Nihal c was
    `emp_001`'s all along**; the player owns only Bastion in the sandbox. There is no sandbox
    ownership discrepancy and nothing to look at. What the misreading produced instead is worth more
    than the finding it replaces: §7[5] ran the **AI→AI** transfer variant
    (`emp_001` → `emp_sandbox_enemy`) and proved it end to end, including across a save/F5/load —
    legal and valuable under D7's signed **symmetry**, and a direction no keeper had exercised.
22. **A colony-loss alert fired for a colony that was never the player's.** Found while resolving
    §7[5]: the transfer was AI→AI (`emp_001` → `emp_sandbox_enemy`), yet the game announced to the
    player that **he** had lost a colony. The colony-loss consumer does not filter by owner — the
    **fourth-instrument-lesson class**: state reaches a consumer that never checks **whose** state
    it is (siblings: the Journal feed-isolation leak of Director Slice 1, and `_onColonyFounded`
    charging the player for AI colonisation in D2/E8). **W3-7 must gate ALL invasion/loss surfaces
    on ownership** — the native `alert()` at `GameScene.js:2276` dies there anyway under S25, but
    the ownership filter is the actual defect and must not ride along as a side effect of replacing
    the widget.

### Added at W3-3 / W3-4 (2026-08-18, measured during implementation)

23. **The spaceport gate is inactive for the AI only by accident of the catalog.**
    `MovementOrderSystem` runs every departure through `canLaunchFromCurrent`, and
    `DirectorDoctrine` does **not** bypass it. Measured: all four resolvable templates
    (`frigate_laser_escort` / `frigate_missile_escort` / `frigate_system_defender` /
    `science_probe`) land on hulls of `size: 'small'`, which need no port — so the gate refuses
    nothing today. But `hull_destroyer` (medium) and `hull_cruiser` (large) **do** require one, and
    the AI capital is seeded with a **module-less** station as a permission token (R-3), not with a
    spaceport. ⇒ The day the catalog gains a heavier template, **AI departures start being refused
    silently** with `no_spaceport_at_origin`, and it will look like the target-selection rule is
    "not firing". Pinned in both directions by `w3_attack_dispatch_smoke` T6.
24. **`_pruneRoster` is the only thing that returns a doctrine'd ship to the pool — and W3-4 made
    the garrison branch reachable for the first time.** Nothing is broken today, but the roster
    logic has never run against a garrison that actually *travels*: until now `defend_home` either
    early-returned (ship at home) or silently failed (ship away). W3-5's target rule will pull from
    the same pool, so if churn appears there, this is the first place to look — not the new rule.

---

### Added at GATE 2 wydanie 1 (2026-08-18, owner-witnessed live — gate INTERRUPTED on a real defect)

25. ⚠ **Movement orders are INTRA-system by construction; ids are GLOBAL. Nothing enforced the
    difference.** Each system's star sits at (0,0), so a body's `x/y` only means anything inside
    its own system — but `EntityManager.get` resolves any id galaxy-wide. An AI hull in `sys_061`
    ordered to attack the player's planet in `sys_home` therefore flew to *that planet's
    coordinates measured from its own star*, landed at a random point of `sys_061`, and reported
    itself **docked at a body that does not exist in its system**. Reproduced headless 1:1.
    ⇒ Fixed in W3-4b-1 at three levels: an issue-time gate in `_issueMoveToPoint` (the chokepoint
    for moveToPoint/goToPOI/dock/attack), the same gate on entity-targeted orders
    (`pursue`/`intercept`/`engage` shared the shape exactly as predicted), and a repair at the
    arrival seam so the inconsistent state cannot be reached even from an old save.
    **Lesson, and it is the third instance of this class in the arc: an id is not a location.**
    GATE 1 passed only because that boot happened to co-locate everyone in `sys_home` — the same
    way `war_doctrine_smoke` passed by spawning its garrison already at the capital.
26. ⚠ **`playerVesselsToBattleUnit([])` fabricates a defender: `{ hp: 100, weapons: [] }`.**
    This is the answer to "why did Bastion's planetary defense fight a light-year away" — and it
    is worse than the question assumed: **Bastion's defense did not fight at all.** For a system
    where the player owns nothing, `_buildPlayerBattleUnit` returned that phantom untouched (no
    fleet, no colony, so not even the "symbolic defense" branch fires), the AI beat a 100-HP
    punching bag that cannot shoot back, and the war ledger charged the player the loser's share.
    ⇒ W3-4b-2 does **not** change `playerVesselsToBattleUnit` — it has other consumers (DSCS,
    enemy aggregation) and changing it would move balance under them. Instead the **route** to the
    phantom is cut: `WarSystem.hasPlayerPresenceInSystem` (same two inputs as the unit builder,
    single-sourced) gates `EnemyAttackHandler`. The phantom itself remains, pinned as engine
    behaviour, and is a candidate for the GROUND/balance slice.
    ⚠ Note this defect was **not** cross-system-only: any AI strike on a body where the player has
    nothing would have farmed exhaustion against nobody.
27. **`WarpRouteSystem.canOrder` refuses every AI vessel (`not_player`) — it is a UI gate, not a
    world rule.** The world rule lives one layer down in `VesselManager.dispatchInterstellar`,
    which has an explicit owner fork (S3.0a: the player is hard-gated by `canJump`, the AI flies
    on fumes with a clamp). `OrderService.issueWarp` now routes AI vessels straight there.
    ⚠ **Declared consequence, for W3-5 to price:** the AI gets a **single hop with no distance
    limit** (no multi-hop chaining, no `WARP_MAX_JUMP_LY`). Strike *reach* is therefore a property
    of the target-selection rule (adjacency via `InfluenceMap`), not of the transport layer. If
    W3-5 does not bound it, an AI empire can strike across the galaxy for one tank of fumes.
28. **Two existing keepers were testing the defect instead of catching it.** `w3_seams_smoke` T5
    and `w3_attack_dispatch_smoke` T3 spawned an AI hull *in `sys_home`* and ordered it home to a
    capital in another system — a physically impossible scene that passed **only** because the
    engine allowed flying to another system's coordinates. Both scenes moved into the capital's
    own system in W3-4b-1. **When a fix makes an old test red, check whether the test's scene was
    ever possible** — here the red was the fix working, not a regression.

---

### Added at GATE 2 edition 2 (2026-08-18, owner-witnessed live — gate BLOCKED on tooling)

29. ⚠ **The interstellar scene could not be staged by any validated lever — a tooling gap that
    looked like a defect.** Measured on a fresh Combat Sandbox boot: all three Łowcy are
    `frigate_system_defender` with `warpFuel.max: 0` (**correct** — the catalog gives FRG-3 a
    deliberate `CELOWY BRAK warp_tank`), and `spawnEnemyAttack` picks its hull by *strength*, so
    the default 500 lands on `hull_medium` — also no warp tank. The only remaining route was
    hand-editing fuel state, which the standing gate rules forbid; the owner correctly refused.
    ⇒ W3-4c adds `spawnEnemyRaider` (also reachable as `spawnEnemyAttack({ warpCapable: true })`):
    hull resolved **from the catalog**, placed in the nearest **non-player** system, warp tank
    full, owner defaulting to **the opponent of the active war** (§Findings 17's lesson made a
    default), and — unless `autoOrder: false` — the strike issued through the **real production
    path** (`OrderService.issueAttack`), not a hand-assembled mission like the legacy spawner.
    **The lever verifies its own contract after the fact** (`warpCapable` in the report + a loud
    error) — a silent success that leaves the gate stuck exactly as before would be worse than no
    lever at all.
    ⚠ Filed as a standing property, not a one-off: **a gate that cannot be staged is a gap in the
    instruments, and the instrument is the deliverable.** The keeper pins both the lever *and the
    gap* (`spawnEnemyAttack` default still yields `warpFuel.max === 0`), so nobody "simplifies"
    the lever back into the hole it was dug out of.
30. **The Combat Sandbox is a DEFENSIVE fixture and stays one.** It seeds only FRG-3, which is the
    right ship for "hold the line at home" and structurally blind for "leave home and strike".
    Not changed: adding an escort wave would make every sandbox session an offensive scenario.
    The offensive scene now comes from a lever that also works **outside** the sandbox.
31. **One world-state, two answers depending on who asked.** `issueWarp` to the vessel's current
    system returned `same_system` on the player path (the planner, `WarpRoutePlanner:57`) and
    `dispatch_failed` on the AI path (which never reaches the planner — §Findings 27). Unified on
    the **canonical** `same_system`; deliberately **not** a new `already_in_system` string, because
    the constant, the UI mapping (`FleetManagerOverlay:6623`) and the PL/EN text
    (`fleet.warpErrSame`) already existed — a second name would have forked the vocabulary for one
    event. Worth watching for: `OrderService` wraps two dispatch paths with different reason
    vocabularies, and this was the first place they visibly disagreed.

---

### Added at GATE 2 PASS (2026-08-18, owner-witnessed live) — three clarifications answered by measurement

**A1 — `planetId: null` + `point` is the DEEP-SPACE signature, and the checklist promise was wrong,
not the recorder.** Measured headless on the same chain: the orbital path
(`EnemyAttackHandler._resolveBatchedBattle`) writes `{ systemId: 'sys_home', planetId: 'entity_3',
point: null }` — planetId **is** set, exactly as edition 2's L10 promised. `{ planetId: null,
point: {x,y} }` is written **only** by `DeepSpaceCombatSystem:336` and `VesselCombatSystem`.
⇒ The engagement resolved as **vessel↔vessel deep-space combat**, not as planetary defense: the
raider was intercepted on approach rather than fought by the colony's guns. Both records are
correct for their producer. **The checklist is fixed, the recorder is not touched** — L10 now
reads the shape as *evidence of which path fought*, which is more informative than the promise it
replaces.

**A2 — ring eviction is RULED OUT by measurement; the ring is either cleared or detached.**
`DebugLog._max = 10000` and the measured volume is **~48 entries per game year** with two AI
empires (767 entries over 16 game years). Three displayed years ≈ 36 game years ≈ **1 700
entries** — nowhere near the cap, and `battle:resolved` survived every measured run. So the
"~3 years of AI activity evicted it" hypothesis is **false**. Remaining candidates, in order:
(a) the ring is **cleared on reload** (documented standing property, and §4 of the gate does
save→F5→load — if L9 ran after §4, the ring was legitimately empty); (b) `DebugLog.attach()` lost
its subscription. **Not** a missing emit: the orbital path books through `WarSystem.recordBattle`,
which emits `battle:resolved`, and the measurement caught it in the ring. ⇒ Checklist gains a
disambiguating one-liner (`query({}).length` first). If it ever reproduces with a **non-empty**
ring and zero `battle:resolved`, that IS an audit hole and gets its own commit.

**A3 — rounds do NOT book separately; two battles means two ENCOUNTERS.** Verified in source:
`_finalizeBattle` is the single booking site and ends with `encounter.isActive = false`
(`DeepSpaceCombatSystem:1009`), so one encounter → exactly one `recordBattle`, however many rounds
it ran. **W4's peace pricing is safe from round-inflation.** The two loser-shares therefore come
from two engagements of one raider, and the mechanism the code supports is
**retreat-then-re-engage**: enemy AI auto-retreats at ≤20 % HP while clearly losing (M4 P3 polish),
retreat is booked as a **LOSS** with the ship alive, and `ENGAGEMENT_COOLDOWN_YEARS = 1` allows a
fresh `combatRangeEnter` well inside a ~2.7-year approach. ✅ **CONFIRMED BY A LIVE READ 2026-08-18** (GATE 3 §2, §Findings 47): the battle record carried
`retreated: 'B'` with the player's planetary defence alive (10/50 losses, 21 rounds) — so
*retreat books as a LOSS with forces surviving* is now **measured, not inferred**, and with the
one-encounter-one-battle invariant it closes the question. Earlier note, kept for the record: the
invariant was proven while the retreat→re-entry sequence was inferred from source and **not**
reproduced headless (the harness resolved the approach through the orbital
path instead). Next live run can settle it in one read — the first record should carry
`retreated` set and a surviving raider.

### Added at GATE 2 PASS — findings from the run

32. ⚠ **An AI interstellar arrival announces itself to the player as if it were his own — with a
    free survey of the destination.** `MissionEventModal._onInterstellarArrived` (`:609`,
    subscribed `:658`) has **no owner filter**: it fires the full arrival popup — vessel name, star
    type, planet and moon counts, habitable-zone tally — for **any** vessel emitting
    `interstellar:arrived`. Same family as §Findings 22 (a consumer that never asks *whose* state
    it is), and it is simultaneously an **intel leak** of the Director Slice 1 Journal class.
    ⚠ It also **pauses the game** (the modal is a pausing popup), so from W3-5 onward — when AI
    raiders warp on their own initiative — this fires repeatedly with a false claim. Foreign
    arrivals should be at most a **sensor contact behind detection**, never a player-arrival modal.
33. **OWNER UX REQUEST — full orders/navigation in foreign systems. Assessment: VIEW-LAYER
    asymmetry, not a world constraint.** Measured: `StarSystemManager.switchActiveSystem` is
    complete (rebuilds the 3D scene, emits `system:switched`) and has **exactly one caller in the
    tree** — `Outliner.js:699`, keyed on a **colony's** system. A system where the player has a
    *ship* but no *colony* therefore has **no entry point**, which is why after arrival he picks a
    body from a list instead of navigating. The world does not forbid it: a ship in a foreign
    system passes the W3-4b same-system gate for bodies in that system, so right-click orders
    would work the moment the view followed the ship.
    **Cost:** the entry point is small (a "enter this system" action from the fleet registry or
    Stratcom for any system with a player presence). The real cost is the **audit of consumers
    that assume `activeSystemId === 'sys_home'`** — station restore, sensor overlays, colony
    overlay, minimap — plus on-demand generation for a system never visited, and a defined return
    path. Scope it as its own slice after GATE 3 or beside W3-7; **not** a drive-by.
34. **DESIGN NOTE FOR W3-5 — a lone raider cannot crack a defended colony** (proven twice live,
    the AI feeding the player two free victories and 7.2 exhaustion of its own). The target rule
    must **prefer squadrons (2+) against targets with planetary defense or a defending fleet**,
    otherwise the offensive AI is a exhaustion pump pointed at itself. This is the first
    *balance* constraint the offensive layer imposes on its own trigger.

---

### Added at GATE 2 §8 attempt 1 (2026-08-18, owner-witnessed live — BLOCKED on mounting)

35. ⚠ **Constructed, registered, and invisible: the locator line that was never written.**
    W3-5 shipped `strike_player_target` alive — `DirectorSystem` imports `DIRECTOR_RULES` directly
    and evaluates the catalog every tick — but `GameScene`'s service-locator block was missing
    `window.KOSMOS.directorOffensive`. Every §8 one-liner therefore died on `undefined`, and the
    autonomy layer ran only where the *probe* had hand-mounted it. **Inverted S21:** the harness
    had MORE than the game, which is the opposite of the failure mode the audit taught us to fear.
    ⇒ The defect is **game-wide, not sandbox-only** — the locator block runs for every scenario.
    Fixed in W3-5b. ⚠ The class is nasty because nothing complains: every consumer reads through
    `?.`, so a missing locator entry is indistinguishable from "the feature is quiet".
36. ⚠ **THIRD MEMBER OF THE BLIND-SPOT FAMILY, and the one that forced a different kind of test.**
    `war_doctrine_smoke` spawned its garrison **already docked** (so it never entered the order
    channel and missed `missing_target_point`); `w3_attack_dispatch_smoke` spawned its hull **in
    the same system** (so it missed the whole cross-system defect); and the offensive probe
    **mounts the system itself** (so it could not notice that the game does not). Shared shape:
    **the test builds a scene the product never builds.** 145 green keepers proved the rule works
    *when mounted*; nothing proved it mounts.
    ⇒ The cure is to pin **how the game assembles the scene**, not the behaviour of a ready-made
    one. `w3_director_mounting_smoke` reads the **real boot source** and asserts a manifest
    (`this.directorX = new …` ⟹ `window.KOSMOS.directorX = …`), that every catalog name resolves
    under exactly the registrars the boot imports, and that `new DirectorSystem()` survives that
    set. Fail-first proven against the parked `GameScene`: it reports `Brakujące: directorOffensive`.
37. **A silent rule and an unmounted rule look identical from the console — by construction.**
    `DirectorSystem.tickEmpire` returns **before** `_writeRuleState` when a poll trigger returns 0,
    so a rule with no reachable target leaves **no row** in `director.rules` and emits **no
    refusal**. That is exactly what the owner measured, and it cost a session to diagnose.
    ⇒ `KOSMOS.debug.strikeReport(empireId)` now renders the difference in one read (war / claimed /
    border / targets / chosen target / ready hulls / verdict), and `forceStrike(empireId)` exercises
    the decision itself when the trigger is legitimately quiet. Both are read/intent, never state edits.
38. ⚠ **The Combat Sandbox can NEVER satisfy this rule's trigger — measured, not assumed.** The
    sandbox seeds the enemy colony on the farthest planet of the **player's own** system, and
    `TerritoryService._rebuild` awards a contested system to the **first** colony indexed (the
    player's home), skipping colonies of any other owner. So `emp_sandbox_enemy` claims **0
    systems**, has a **0-system border shell**, and `reachablePlayerTargets` is structurally **0**.
    ⇒ §8 belongs in a **normal game**; the sandbox stays a defensive fixture (§Findings 30) and now
    serves §8 only for KROK 0 (the mounting check). ⚠ Second-order note for W4/BALANS: *any* rule
    keyed on `InfluenceMap` reach is blind in the sandbox for the same reason.

---

### Added at W3-6 / W3-7 (2026-08-18, measured during implementation)

39. ⚠ **`transferColony` announced every ownership change as the PLAYER's loss — the literal in
    the payload.** `previousOwner: 'player'` was hardcoded (`ColonyManager.js`), while the same
    method also performs AI→AI transfers (proven live at GATE 1 §7[5]). That is the root cause of
    §Findings 22, and it sat one line away from the event that carried it. Fixed at **both** ends:
    the emitter now reports the owner read **before** the overwrite, and the consumers gate on
    `previousOwner === 'player'`. ⚠ One layer alone would have left the next consumer on the same
    mine — the notification centre and the scene handler each subscribe independently.
40. **The AI invasion path was dead at BOTH ends, and the live end was the cheaper fix.**
    `_onBattleResolved` returned unless `participantA.type === 'empire'` — a shape only abstract
    fleets emit, and those have no producer. Every real battle emits `vessel_group`. The landing,
    ground-combat and capture machinery was complete the whole time (the player uses it daily);
    W3-6 is an **entry point**, not a system. Same shape as W3-4's mission producer: *the
    mechanism is smaller than it looks and the precondition is larger.*
41. **`MIN_SURVIVING_STRENGTH_TO_LAND` has no meaning on the hull path, and converting it would
    have been worse than replacing it.** `pA.strength` is an abstract-fleet unit and `lossesA`
    counts **ships** in DSCS but HP in BattleSystem (W1 §Findings 3 — one field name, two units).
    Any arithmetic bridging them would have encoded that collision into the invasion gate. The
    replacement asks a question with physical meaning and mirrors the **player's own** requirement:
    *did a hull with `drop_pods` and a troop bay survive?* Landing size then follows from the
    summed bays of survivors, capped at one wave per won orbit.
42. **An empire id is not an unknown faction — and treating it as one made every alien invader
    look human.** `GroundUnitFactory.resolveFaction` fell back to `humanity` with a warning **per
    unit created**, so AI landings both spammed the console and produced human infantry stepping
    off alien transports. Empires now map deterministically onto a non-human faction (same empire
    ⇒ same faction, across saves), hashed through `mixSeed` rather than a bare `h*31` — the
    fourth site of that class in this codebase. Genuine typos still fall back **and still warn**.
    ⚠ **Known limit, filed not fixed:** `INVASION_UNIT_POOLS` currently yields **legacy** unit
    types (`infantry`), which have no faction at all — so the mapping only reaches archetype-based
    units. Switching the pools is a **ground-combat balance change** (different stats, different
    counters) and belongs to the **GROUND** slice beside S12 (morale) and R13 (RNG), not to a
    visibility commit.
43. **Three consumers were filtering on a stamp the producer never wrote.** `UIManager`'s
    `battle:resolved` handler and both `GameScene` branches test `p.empireId === 'player'`, while
    `EnemyAttackHandler` and `WarSystem` built `{ type: 'player' }` without it. Net effect: on the
    EAH path the player got **no auto-slow, no Journal entry, and — on the losing branch — no
    word at all** that his fleet had been destroyed. One field, three repairs. ⚠ The keeper pins
    the *producer/consumer pair*, not either half: a stamp with no consumer, or a consumer with no
    stamp, is the same silent failure.

---

### Added at GATE 3 §2 (2026-08-18, owner-witnessed live — STOPPED on an integration gap)

44. ⚠ **The accountant announced the result BEFORE it wrote the consequence.**
    `WarSystem.recordBattle` emitted `battle:resolved` and only then called
    `_updateOrbitalDominance`, so every subscriber read the world **as it was before the battle
    being announced**. W3-6's landing gate is such a subscriber: it refused with
    `no_orbital_dominance` at the exact moment the orbit had been won. Fixed by ordering — the
    event now carries a world consistent with the fact it reports. ⚠ Checked before moving it:
    the **only** consumer of `getOrbitalController` inside the `battle:resolved` path is that
    gate; the other readers are UI gates that ask on demand. **Same lesson as W3-2, one layer
    deeper: fix in the accountant, and make sure the accountant finishes its own books before
    it speaks.**
45. ⚠ **"Not even a refusal" was an instrument artifact — the refusal fired every time.**
    `invasion:blocked` was missing from `DebugLog.TRACKED_EVENTS`, so the very read the gate
    performs (`query({kind:'invasion:blocked'})`) returned 0 whether or not the system spoke.
    A contract that says *"landing or a reasoned refusal, never silence"* is **indistinguishable
    from its own violation** without an audit trail for the refusal. Added with
    `invasion:repelled`. ⚠ Generalisation worth keeping: whenever a commit introduces a refusal
    reason, the refusal joins the tracked events **in the same commit** — otherwise the next gate
    measures silence and reports a false defect (this is the second time in W3: `strikeRefused`
    was added for the same reason in W3-5b).
46. **The reported diagnosis was wrong in one load-bearing detail, and measuring beat reasoning.**
    The hypothesis was "W3-6 listens to `vessel_group` (DSCS) while W3-4 terminates in an EAH
    orbital battle" — but `EnemyAttackHandler` **also** emits `participantA.type = 'vessel_group'`
    (`:168`). The two halves met on type and diverged in **time**, not in shape. Had the fix
    followed the hypothesis (a second, EAH-specific entry point), it would have added a duplicate
    path and left the ordering bug live under both.
47. ✅ **GATE 2 clarification 3 is now ANSWERED BY A LIVE READ, not inference.** The live battle
    record carried `retreated: 'B'` with the player's planetary defence surviving (10/50 losses,
    21 rounds) — confirming the mechanism GATE 2 could only infer from source: **a retreat books
    as a LOSS while the retreating force stays alive**, which is how one arrival produces two
    booked battles without any round-level inflation. The one-encounter-one-battle invariant
    (§A3) and this observation together close the question.
48. **War is declared at the first BATTLE, not at spawn — and that is the intended design.**
    Measured: `spawnEnemyAttack` created no war; the war appeared when the engagement resolved,
    via `EnemyAttackHandler`'s auto-declaration (`enemy_attack_arrived`). This is the pipeline the
    audit called correct at S2 — the declaration attaches to an event that can justify it rather
    than to a debug spawn. Recorded so no future gate reads the gap between spawn and war as a bug.

### Added at GATE 3 (2026-08-18, owner-witnessed live) — the three CONDITIONS of the conditional pass

> ⚠ **Numbering note.** The orchestrator filed these as 42-44; this register already stood at 48
> when they arrived, so they land as **49-51** and the mapping is written here rather than
> silently renumbering anything: **orchestrator 42 = 49 · 43 = 50 · 44 = 51.**

49. **The AI ship catalog has no TRANSPORT role — so `no_drop_capable_hull` is the only reachable
    answer of the battle→invasion join, by construction, not by chance.** Every template in
    `SHIP_TEMPLATES` is a warship or a courier; none mounts `troop_bay_*` + `drop_pods`, and there
    is no rule that would ever queue one. The W3-6 entry point is therefore *correct and unused*:
    it reads real hulls, finds no drop-capable survivor, and refuses with a truthful reason. The
    live landing on this gate was produced by a debug lever, not by the AI's own production.
    ⇒ **The missing piece is a CATALOG entry plus a rule that wants it**, not code in the invasion
    path. Full data: `docs/audit/AI_DROP_HULL_AUDIT.md`. Assigned to its own future slice.
50. **The AI's landing force runs on the LEGACY ground model, not on archetypes — a different
    game with a different balance.** `INVASION_UNIT_POOLS` points exclusively at legacy
    `GROUND_UNITS` types (60 HP / 12 attack) while the player's archetype units are a separate,
    later model (15 HP / 7 attack, with morale and supply). Legacy units have **no** morale or
    supply layer at all, and legacy morale carries contradictory defaults (0 on being hit vs 100
    on sweep and on save/load) ⇒ **a legacy unit falls apart on its first hit unless the game has
    been reloaded since the landing.** Switching the pool to archetypes is a ground-combat balance
    change, so it belongs to the **GROUND** slice next to the S12 morale defect and R13 RNG
    seeding — not to a visibility commit. Full data: `docs/audit/GROUND_UNITS_AUDIT.md`.
51. ⚠ **An AI landing NEVER ends in the colony changing hands — the capture requirement exists
    only on the player's side.** Verified live: the invader's unit (`gu_42`) stood on Nekkar d and
    `getColoniesByEmpire` never listed that colony under the enemy. `InvasionSystem` has
    `_tryPlayerCapture` (the player takes an AI body) with **no** mirror for the AI direction, so
    the last step of the conquest loop — *hold the capital, own the colony* — is missing on the
    side W3 just taught to attack. GATE 3 §4/§5 were therefore verified through a
    **`transferColony` workaround** (the same reversible mechanism W3-1 built), which proves the
    OWNERSHIP half works end to end; what is unproven is the AI's route to triggering it.
    ⇒ Its own future gate: **AI takes the colony.** This is the reason GATE 3 is *conditional*.

---

## Decisions taken — SEVEN, all resolved 2026-08-17 (owner + orchestrator)

Two **owner rulings** (D4, D7 — recorded verbatim in substance), five **orchestrator ratifications**. Each
carries the rejected alternative beside it. Nothing in W3 awaits a ruling.

**D1 — SPLIT: YES.** W3 = offensive AI (conquest happens and sticks); **W4 = territorial peace**. Building
term slots first would price a transaction whose goods do not exist, against a counter that never moves, for
a conquest the political map cannot see. **§6a is not abandoned — it gains its foundation.**
*Rejected:* one fifteen-commit slice with three interleaved failure modes, where regression cannot be
attributed.

**D2 — RETIRE the abstract-fleet stack: YES**, as W3-8, isolated, after the gates. *Rejected:* revive
`empire.fleets` to get `participantA.type==='empire'` for free — reviving a materializer that would crew AI
fleets from the **player's** population and re-arm the 12× ETA error is not an alternative.

**D3 — GLOBAL TRUTH for target selection: YES, SIGNED.** Register line, verbatim:
> **AI reads true player strength everywhere; a fog model arrives with D5's empire-to-empire intel work.
> Taken deliberately, not silently — the inverted-`relative_power` lesson.**

**D4 (OWNER) — REAL JOURNEY.** Hulls physically travel from the AI capital via `MovementOrderSystem` with
`bypassFuelCheck` (the sanctioned pattern). *Rejected:* a scripted spawn — it guts W3-7, because the player
must **see it coming through sensors**.

> ✅ **VERIFIED BEFORE W3-4 (2026-08-17), and the dilemma DISSOLVES.** The audit's line *"the AI's one warship
> template"* was **WRONG** — it generalised from FRG-3 alone. Catalog v1 ships **three** frigates, and the two
> escorts survived: `frigate_laser_escort` (`ShipTemplateData.js:88`) and `frigate_missile_escort` (`:106`)
> both carry **`warp_tank` `required: true`** (`:100`, `:115`), with the rationale written in
> (`:93-96` — dropping the tank *"zmieniłoby ROLĘ okrętu"*). Only `frigate_system_defender` (`:121`) has the
> `CELOWY BRAK warp_tank` (`:135`).
> **Stronger still: the escorts are already IN PRODUCTION.** `DirectorPressure.js:39`
> `TEMPLATE_ROAMERS = ['frigate_laser_escort','frigate_missile_escort']`; `:118-122` queues one at **L2**
> under the comment **„możemy przyjść do was"**; `_pickRoamer:166-173` selects by aggression (≥0.6 missile,
> ≤0.4 laser, hash tie-break).
> ⇒ **Strikes fly escort templates cross-system, ZERO template changes. No same-system-only narrowing.**
> Two constraints this imposes on W3-5, both binding:
> 1. Roamers arrive **only at L2**, one per incident ⇒ "no warp-capable hull in reserve yet" is a
>    **first-class refusal reason**, not an assumption. The pressure ladder gates the strike force.
> 2. Strike composition selects on **`warpFuel.max > 0`**, never on template id — that is the property every
>    cross-system path actually gates on (`Vessel.js:122-124`), and it keeps FRG-3 excluded by its own design
>    rather than by a hardcoded list.
> ⚠ New finding while verifying: `_pickRoamer`'s tie-break hash (`:170-172`) is `h*31 + charCode` with **no
> galaxy salt / `mixSeed`** — the same class as the first-contact defect and `DirectorDoctrine._hash`. It
> only bites for aggression strictly between 0.4 and 0.6. Filed as §Findings 16.

**D5 — S12 BEFORE R13, both as their own slice ("GROUND"): YES**, queued after W3. Legacy morale (first-hit
disband + reload-to-100) is the larger determinism hole. ⚠ **The `headless/env.js:34-36` `Math.random`
replacement must be written into that slice's plan** — most keepers are blind to R13 by construction.

**D6 — CLOSE the `isInService` hole in `MovementOrderSystem`: YES, inside W3-4** (one gate, one reason
string, i18n PL+EN). *Rejected:* treat "a reserve hull can be scrambled" as a mechanic — then it needs a
price, and deploy already has one.

**D7 (OWNER) — LOSING IS RECOVERABLE.** Reversible in-place ownership flip, **SYMMETRIC**: a lost player
colony lives and functions normally under AI ownership and can be retaken in a later war; the same for AI
colonies under the player.

> **SCOPE NARROWING signed with it:** W3 delivers **MECHANICAL reversibility only**. Occupation sociology —
> population loyalty, resistance, assimilation, productivity under foreign rule — is a **NAMED future
> stream**, deliberately out of scope, **not a silent gap**. To be recorded as an addendum in
> `WAR_BACKBONE.md` §6a.

**Absorbed with the same review:** all 15 findings accepted as filed; corrections **C-1…C-6** fold into
`WAR_BACKBONE.md` with an audit-correction note. ⚠ **The `CAPTURE_GRACE_YEARS` "has been waiting in the code
for exactly this" line dies** — it was consumer-less, the fourth instrument lesson's purest case.

---

## STANDING LESSON (process, not code) — CC writing files RELOADS the owner's live tab

**Filed at W3 close, 2026-08-18. Applies to every future slice, every session.**

The game is served by **Live Server**, which watches the working tree. Every file CC writes —
including a file written during a *read-only audit*, such as a report under `docs/audit/` — makes
Live Server reload the owner's open tab. **A reload throws away runtime state and drops the game
back to the last save**: a mid-gate scene the owner spent ten minutes assembling (spawned raiders,
a won orbit, troops on the ground) is simply gone, and nothing announces why.

⚠ The trap is that this hits precisely the tasks that *look* harmless. "Zero changes to code" does
not mean zero writes; an audit that produces a report is a write. Two rules follow, and both are
binding:

1. **Read-only audits run when the owner has NO tab open** — or the owner is told, before the work
   starts, that the tab will reload.
2. **CC never writes during a gate.** This is the same rule as *"gate never runs in parallel with
   CC"* (recorded in W1), now with its mechanism written down: the conflict is not attention, it is
   the file watcher.

---

## Where this leaves the arc

W2 turned a hull into two things — an industrial artefact and a crewed warship. W3's audit found that the
fleet W2 taught the AI to crew **has nowhere to go, no way to be counted when it fights, and nothing to gain
if it wins**. The three foundations in §Context are not adjacent repairs; they are the slice. The offensive
capability on top of them turns out to be small — one mission type, one rule, one entry point — because the
orbital pipeline, the landing machinery and the capture logic were all built already and left without a
producer. That is the same shape W2 found: **the mechanism is smaller than it looks and the preconditions are
larger.**
