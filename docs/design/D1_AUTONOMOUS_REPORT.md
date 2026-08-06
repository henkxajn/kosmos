# PHASE D1 — autonomous run report

**Arc:** WOJNA I POKÓJ 1.0 · **Phase:** D1 (relations model, migration, opinion UI)
**Plan:** `C:\Users\Komputer\.claude\plans\zapoznaj-sie-z-master-sequential-feather.md`
**Spec:** `PLAN_D1_RELATIONS_MODEL.md` + `DIPLOMACY_BACKBONE.md` §1 · **Audit:** `docs/audit/COMBAT_DIPLO_AUDIT.md`
**Status:** all five commits landed · **live gate: NOT YET RUN** → `docs/design/D1_LIVE_GATE_CHECKLIST.md`

---

## 0. Headline

D1 replaced the split-brain relationship state (`trust` + `hostility`, audit R8) with the pair-wise
relations model: modifier-stack opinion (computed, never stored), tension, timed truce, memory ring,
global reputation, plus the empire `objective`/`traits` axis. Saves migrate v99 → **v100**. The
DiplomacyOverlay now shows *why* an empire feels the way it does.

**The phase rule was "no behavior change".** It holds for every relation whose old `trust` never
saturated 0 or 100, with **three deliberate, documented exceptions** (§6). The mechanism that would
have broken it silently — modifier decay, which old `trust` never had — ships **switched off** behind
`FEATURES.diplomacyDecay = false` and flips in D2.

| commit | stage | scope |
|---|---|---|
| `ae223c7` | C1 | model + catalog + pure harness (no-op for the running game) |
| `78c94f1` | C2 | atomic swap: migration v100 + facade rewrite + 20 rewire sites |
| `36af8cf` | C3 | empire `objective` (independent roll) + `traits` |
| `48cf431` | C4 | opinion breakdown UI + i18n PL/EN |
| `5cd6f47` | C5 | harness: Snapshot keys + `DIPLOMACY_FROZEN` detector |

**Final verification:** sweep **103/103 OK, 0 FAIL** · `check-i18n` **PASS** (0 pl↔en diffs both
directions) · grep gate **both passes empty** across `src/` and `tmp_*.mjs`.

| new suite | assertions |
|---|---|
| `diplomacy_opinion_smoke` | 85 |
| `diplomacy_model_smoke` | 83 |
| `diplomacy_migration_v100_smoke` | 57 |
| `diplomacy_d1_smoke` | 83 |
| `diplomacy_overlay_breakdown_smoke` | 36 |
| `empire_objective_smoke` | 21 |
| **total** | **365** |

---

## 1. C1 — `ae223c7` — model foundation

*(Committed before the autonomous run began; included for completeness.)*

**Built.** `src/data/OpinionModifierData.js` (10-modifier catalog: values, decay rates, combine mode,
i18n keys, plus the scale constants) · `src/utils/OpinionMath.js` (pure: pair keys + id validation,
owner-scoped opinion, upsert/decay/ramp, breakdown, tension/truce helpers) ·
`src/systems/diplomacy/RelationsModel.js` (sole writer of `diplomacy.relations`) ·
`src/systems/diplomacy/ReputationLedger.js`. Edited `GameConfig.js` (`diplomacyDecay: false`) and
`GameState.js:24` (`diplomacy: { relations: {}, reputation: {} }`).

**Tests.** `diplomacy_opinion_smoke` 85 · `diplomacy_model_smoke` 83.

**Deviations (3, all approved).** Added a second smoke for the stateful modules; `OpinionMath` imports
the scale constants from the data module rather than being literally zero-import; a few extra API
members (`removeModifier`, `modifierYearsLeft`, `getTruceUntilYear`, `hasTreaty`) needed by C2.

**Live gate: PASSED** (legacy `player_*` keys present, empty `reputation: {}`, console clean).

---

## 2. C2 — `78c94f1` — the atomic swap

The load-bearing commit. 26 files, +1245/−415.

### Built

**Migration `_migrateV99toV100`** (`SaveMigration.js`, `CURRENT_VERSION` 99 → 100). Per relation:
key `player_<id>` → `pairKey('player', id)`; `trust` → one `legacy_relations` modifier valued
`trust − 50` **owned by the empire side**; `hostility` → `tension` 1:1; `state` → `status`;
`truce` → `truceUntilYear = year + 10`; `lastIncidents[]` → `memory[]`; war seeds `at_war −40`; an
active trade agreement (and not at war) seeds `trade_partner` at 0. Seeds `bordersOpen` and
`diplomacy.reputation`. Every empire gets `objective` (from the archetype fallback — a save has no
seed to re-roll from) and `traits: []`. Drops `trust`/`lastChangeYear`/`warStartYear`/`empireId`.
Idempotent via the `includes('__')` skip. `console.info`s the count of rail-saturated relations.

**Facade rewrite** (`DiplomacySystem.js`). Two axes: opinion (Σ modifiers, computed) and tension
(old `hostility` 1:1 — same 40/60/80 ladder, same −5/civYear decay, same 3-year ultimatum grace).
Renamed `getHostility→getTension`, `getState→getStatus`, `changeHostility→changeTension`,
`addIncident→addMemory`, `listAll→listPlayerRelations` (a **projection**, never the raw record).
Deleted `getRelation`, `getTrust`, `getTrustStatus` (→ `getOpinionBand`), `changeTrust`, `_tickTreaties`
and all `TRUST_*` constants. Added `getOpinion`, `getOpinionOfPlayer`, `getOpinionBreakdown`,
`addOpinionModifier`, `removeOpinionModifier`, `getMemory`, `getTruceYearsLeft`, `getReputation`, and
the **D2 bridge** `getTrustEquivalent = clamp(0,100, 50 + opinion)` — exactly three call sites, all
deleted in D2.

**Tick order** (1 civYear, as before): `tickModifiers` → `reputation.tick` → truce expiry → tension
decay → ultimatum expiry → trespassing. Modifiers age *before* the handlers that add them, so a fresh
modifier cannot decay in the tick that created it; the relative order decay → ultimatum → trespass is
preserved from pre-D1.

**Rewire, 20 sites.** `AlienCivSystem` (⚠ only the two `dipl.getState` calls — its own FSM
`getState(empireId)` at `:81` stays), `MissionSystem`, `WarSystem` + `CasusBelliData` (signature →
`inferCasusBelli(memoryEntries, archetype)` reading a **10-entry window**), `DeepSpaceCombatSystem` +
`VesselCombatSystem`, `UtilityAI`/`MilitaryAI` (`ctx.relation` → `ctx.tension`),
`FleetManagerOverlay`, `NavPeekProviders`, `DiplomacyOverlay` (reads only), `Snapshot`,
`BottleneckDetector`, `GameScene` (+`KOSMOS.debug.dumpRelation`), `DebugLog`
(+`diplomacy:opinionChanged`), two smoke stubs, two operational recipe docs.

**Events.** Deleted `diplomacy:trustChanged` (zero production subscribers — only the retired scratch
smoke). `diplomacy:relationChanged` keeps its name, payload now `{empireId, tension, status, delta,
reason}` — verified safe because its only subscriber is the `DebugLog.TRACKED_EVENTS` whitelist, which
reads no fields. Kept `diplomacy:warning` (zero subscribers, but the ladder is ported unchanged, so
removing the emit would be a silent delta).

**New guard.** `proposeTreaty` gets an explicit `status === 'war'` rejection (reason `at_war`).
Previously unreachable because war zeroed trust; `at_war −40` no longer guarantees refusal.

### Tests

`diplomacy_migration_v100_smoke` 57 — keys, 1:1 scale, truce timer, memory shape-map, treaty seeding,
dead-field removal, idempotence over a partially-migrated blob (incl. no duplicate `mig_*` memory ids),
and **M13: round-trip through the live store**, which is the parity assertion (`getOpinionOfPlayer === 30`,
`getTrustEquivalent === 80`, tension/status/`hasTreaty` all matching the pre-migration blob).
`diplomacy_d1_smoke` 68 at C2 (83 after C5) — the port of `tmp_s3_4_smoke.mjs`, keeping the exact
thresholds 65/50/80/85 by seeding `legacy_relations` and gating on the bridge. The scratch file was
deleted after the port.

### Deviations (4, all approved after the fact)

1. **`TreatyData.yearlyTrust` deleted** (not on the DEAD list). The ramp
   (`OPINION_MODIFIERS.trade_partner.rampPerYear`) replaces it *in this commit*; leaving it would put
   one balance knob in two files. Same reasoning retired `AI_ENVOY_TRUST_GAIN`.
2. **`pop2_migration_smoke.mjs:47` hard-pinned `CURRENT_VERSION === 99`** — the exact anti-pattern its
   own README warns against. Changed to a range pin (`>= 99`).
3. **Idempotence tested through the real `migrate()`** rather than exporting the `MIGRATIONS` map: take
   the migrated blob, set `version = 99`, run it again through the production entry point.
4. **`KOSMOS.debug.dumpRelation(empireId)`** replaces the deleted `getRelation` as the console accessor
   (opinion, bridge value, band, tension, status, truce years, treaties, reputation + `console.table`
   of breakdown and memory).

### Live gate: NOT RUN — this is the load-bearing one, §1 of the checklist

---

## 3. C3 — `36af8cf` — empire `objective` + `traits`

**Built.** `EmpireData.js`: `EMPIRE_OBJECTIVES` (6-value enum) and `OBJECTIVE_BY_ARCHETYPE` **marked
migration-fallback-only, in a comment that says so explicitly** so it cannot get promoted back to a
rule. `EmpireRegistry.createEmpire`: `objective` (archetype fallback for calls that don't pass one —
debug, scenarios, test bots) and `traits: []`. `EmpireGenerator`: the roll, off its **own** stream.

```js
const objRng    = mulberry32(((galaxyData.seed ^ 0x0B1EC7) + i * 0x9E3779B1) >>> 0);
const objective = EMPIRE_OBJECTIVES[Math.floor(objRng() * EMPIRE_OBJECTIVES.length)];
```

**Determinism verified headless — not deferred.** `EmpireGenerator.generate` was run on 5 fixed seeds
before and after the change (colony bootstrap stubbed, registry captured), and empire names, colours
and home systems came out **byte-identical**. The pre-change values are now golden pins in G1 of the
keeper, so a future roll that reaches into the shared stream fails the test rather than silently
changing every galaxy.

`objective` is genuinely independent of archetype — `industrialist` draws `diplomat` on seed 12345 and
`expansionist` on seed 777; G2 asserts >1 distinct value across seeds and at least one differing from
the fallback table.

**Tests.** `empire_objective_smoke` 21.

**Deviations.** None beyond what C2 already carried (`EMPIRE_OBJECTIVES` landed in C2 alongside
`OBJECTIVE_BY_ARCHETYPE`, because the migration needed the table and the enum is what makes its values
checkable).

### Live gate: fixed-seed check is **already covered headless**; the checklist keeps a 60-second confirmation

---

## 4. C4 — `48cf431` — opinion breakdown UI

**Built.** `DiplomacyOverlay._drawRight` restructured: opinion number (−100..+100) with a colour lerped
red → amber → green plus the band label; **breakdown list** `label ±value (fades in N y)` sorted by
|value| with `∞` on persistent entries; status chip with a truce counter `[ROZEJM — 7 lat]`; tension bar
keeping its 40/60/80 ladder marks; memory list. Removed the trust bar, the threshold legend (the ladder
marks say the same thing), and the dead `'alliance'` status branch in `STATE_KEY`/`STATE_COLOR` — no code
path ever wrote that status; an alliance is a *treaty*.

**i18n**, PL **and** EN in the same commit: 8 new UI keys + 10 `diplo.mod.*` modifier labels; deleted
`diplo.trustLabel`, `diplo.hostility`, `diplo.hostilityFull`, `diplo.thresholdLegend`,
`diplo.recentIncidents`, `diplo.state.alliance`. Parity: **0 differences in either direction**.

**Vertical budget.** The plan's three mitigations shipped (breakdown capped at 5 + a `+N` row, memory
capped at 3, legend dropped).

**Tests.** `diplomacy_overlay_breakdown_smoke` 36, driven by a recording `ctx` that collects
`fillText`/`fillRect`: number and lerped colour, exactly 5 of 7 labels drawn, `+2 more` tail, `∞` vs
fade text, truce chip, memory limited to 3, absence of the removed keys, action hit-zones inside the
panel at 1280×720 / 1600×900 / 1280×800, and a full re-render in EN.

**Deviation (1) — forced by reality.** The right column has **no scroll** (`handleScroll` only scrolls
the left empire list), and with an ultimatum + 3 treaties + a full breakdown the action buttons still
overflowed the panel and became unclickable. So the action band is now **pinned to the bottom** and the
content above it is **clipped**. This is the same pinned-footer pattern the repo already uses for the
Załoga tab in `ColonyOverlay`. It is a layout change beyond the approved list; it is asserted at three
resolutions.

**Note.** `diplomacy_d1_smoke` T25 failed on this commit because it pinned `diplo.trustLabel`, which C4
deletes — the test correctly caught the removal and was updated to `diplo.opinionLabel`.

### Live gate: §3 of the checklist (1280×720, PL and EN)

---

## 5. C5 — `5cd6f47` — harness

**Built.** `Snapshot.capture`: `hostility` → `tension`, plus new `opinion`, `status` and `objective`
per empire row. Metric key `maxHostility` → `maxTension`. **Every consumer moved in the same commit**:
`BottleneckDetector` (`DIPLOMACY_DEAD`), `ConclusionsEngine` (conclusion wording) and — caught by the
grep gate, *not* by the plan — `src/testing/ui/app.js`, the alien-empires table in the bot-test report,
which read `e.hostility` and would have rendered a blank column. That table also gained
Objective / Opinia / Status columns.

**New detector `DIPLOMACY_FROZEN`**: zero variance in Σ|opinion| over 200 civYears, **gated on
`FEATURES.diplomacyDecay === true`**. With decay off (the D1 default) and a bot that conducts no
diplomacy, a flat opinion is the *legal* state — ungated it would flag every single run until D2. It is
a tripwire for the D2 flip and arms with it.

**Tests.** `diplomacy_d1_smoke` 68 → **83**: H1 snapshot shape (`tension` present, `hostility` gone,
`opinion`/`status`/`objective` present), H2 the detector in **both** flag states, H3 a 300-civYear
long-run (no exception, tension decayed to 0 in peace, the persistent treaty modifier survived, the ramp
sat at `rampMax`, only pair keys remained, memory ring within limit).

**Deviations (2) — both forced.** (a) The `empire_objective_smoke` "zero consumers" guard fired on
C5's Snapshot read; the guard was **sharpened rather than weakened** — telemetry *observes* a field,
a consumer is game logic that *branches* on it, so `src/testing/` is excluded with that reasoning
written down. (b) The smoke's registry stub gained `updateResource`/`updateMilitaryPower`/
`changeTechLevel` no-ops, mirroring the real `EmpireRegistry`'s documented no-ops (audit §3.2a);
without them H3 flooded the console with exceptions swallowed by `AlienCivSystem`'s try/catch.

### Live gate: §4 of the checklist (one telemetry command + the sweep)

---

## 6. Accepted parity exceptions — verify these deliberately

1. **Truce stops being terminal.** `truceUntilYear` (10 years) → status returns to `peace`, so tension
   decay resumes where it previously froze forever (audit R7). Knock-ons: AI empires leave
   `NEGOTIATING` again post-war, and Stratcom ring colours cool down.
2. **Post-war recovery.** `at_war −40` (persistent, removed at `offerPeace`, replaced by `recent_war
   −15`) instead of irreversibly zeroing trust. Surviving goodwill comes back. During war the value is
   unobservable — envoys, treaties and the overlay are all war-gated.
3. **Σ-then-clamp ≠ clamp-per-step.** Any relation whose old `trust` touched 0 or 100 diverges from its
   old trajectory; the overflow the old model discarded is now retained. The migration logs how many
   relations were affected.

---

## 7. Open questions / follow-ups for D2

- **The decay flag is the D2 headline.** `FEATURES.diplomacyDecay = false` today. Flipping it changes
  balance materially: envoy goodwill starts fading (~5 years per +5), and a loaded save's
  `legacy_relations` drains at 2/year. `DIPLOMACY_FROZEN` arms with the flip; both branches are pinned
  in `diplomacy_d1_smoke` D4.
- **`threatened_by_you`** sits in the catalog **unwired** (per decision). D2 wires it and tunes the
  opinion↔tension coupling.
- **`known_aggressor` / reputation raisers** — the ledger exists and decays, but nothing raises
  aggression and opinion does not read reputation. D4 lands both together.
- **The D2 bridge has exactly three call sites** (`proposeTreaty`, `AlienCivSystem` envoy gate,
  `DiplomacyOverlay` button gates). Deleting `getTrustEquivalent` in D2 must remove all three.
- **`bordersOpen`** is seeded and serialized but unread until D3.
- **Pre-existing bug, deliberately untouched** (would be a behavior change): `_onColonyFounded` has no
  `colony.ownerEmpireId` check, so when an AI founds a colony in another empire's system the system
  owner charges **the player** +30 tension with reason `player_colony_in_their_space`. D1 makes it more
  visible because it now lands in the player-readable memory list. File for D2.
- **Historical docs left untouched** by decision: `docs/audit/COMBAT_DIPLO_AUDIT.md` (a dated
  snapshot and the basis this arc cites), `docs/design/milestone-2-combat-intelligence.md`,
  `docs/design/milestone-2a-combat-core.md`, `docs/plan-war-diplomacy-ai.md`. They still describe the
  pre-D1 API on purpose. The two *operational recipe* docs were updated and carry a cross-reference
  note pointing at the audit.
- **`src/testing/ui/app.js` was an unlisted consumer** of a snapshot key. Worth remembering that the
  bot-test report UI reads snapshot rows directly — the next key rename should grep it explicitly.

---

## 8. Commands

```
node src/testing/smoke/run-all.mjs          # 103/103 OK, 0 FAIL
node tools/check-i18n.mjs                   # PASS, 0 pl↔en diffs

# grep gate — both passes must be empty across src/ and tmp_*.mjs
grep -rn "\.getHostility(\|\.changeHostility(\|\.changeTrust(\|\.getTrust(\|\.getTrustStatus(\|\.getRelation(\|\.addIncident(" src/ tmp_*.mjs
grep -rn "diplomacySystem\.\|dipl\.\|diplSys\.\|dip?\." src/ tmp_*.mjs | grep -E "lastIncidents|listAll\(\)|listVisible\(\)|getState\("
```

**Next:** run `docs/design/D1_LIVE_GATE_CHECKLIST.md`. Do not start D2 before it passes.
