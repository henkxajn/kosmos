# KOSMOS Reform — Stage 4 Report

**Scope.** Gravity-band-scaled fuel surcharge on **ground-colony launches**; **orbital-station launches always
exempt** (×1.0), regardless of the body's gravity ("escaping the gravity well"). Deliberately independent of the
B9-bis station-position offset — **that item was left untouched**, and this mechanic is correct whatever the
offset does. Reuses the Stage-2 gravity bands (`EnvironmentBands.js`: low `<0.4g` / normal `0.4–1.5g` /
high `>1.5g`) — no new thresholds. Builds on `PLANET_SYSTEM_AUDIT.md` (§B9, §B9-bis), `REFORM_STAGE2_REPORT.md`,
`REFORM_STAGE3_REPORT.md`.

**Status: implemented + tested (44/44 smoke, 0 regressions). NOT committed** — handed back for Filip's browser
live-gate, per every prior stage. **Save version untouched** (reads only the already-round-tripping
`surfaceGravity`; no new field, no migration — same reasoning as Stage 2's building-cost mechanic).

**Scope decision (asked & confirmed):** B9-bis mapped only the Transport path, but the fuel-computation surface is
actually **nine ground-launch functions/branches** (the recon dispatcher `_launch` routes to *three* separate recon
launch sites — an undercount of "six" at question-time; the universal decision covers them all regardless), and the
pre-launch fuel **preview is shared** across transport / passenger / colonize / found-outpost. Given the design line
*"ground-colony launches pay"* + the reform's universal-enforcement precedent + "preview must match spend", Filip
chose **all ground launches** (universal). Applied to every player launch that spends `distance × consumption` fuel
from a docked origin; in-space re-dispatches, return-from-orbit legs, and AI are naturally untouched (below).

---

## What was implemented (file:line)

### New pure module — `src/data/LaunchFuelCost.js` (mirrors `EnvironmentCost.js`)
- `LAUNCH_FUEL_GRAVITY_MULT = { low: 0.7, normal: 1.0, high: 1.5 }` (`:20`) — tunable, not final (values from the design).
- `launchFuelGravityMult(originBody)` (`:28`) — pure: `null → 1`; `type==='station' → 1`;
  else `LAUNCH_FUEL_GRAVITY_MULT[gravityBand(surfaceGravity)] ?? 1` (`gravityBand(null)='normal' → 1`). Imports the
  band thresholds from `EnvironmentBands.js` — **single source of truth**, no duplicated literals.

### Origin resolution — `src/utils/SpaceportCheck.js` (already owns "launch origin" logic + EntityManager)
- `resolveLaunchOriginBody(vessel)` (`:74`) — mirrors `canLaunchFromCurrent`'s first line: **only** when
  `position.state==='docked'` → `EntityManager.get(position.dockedAt)`; otherwise (in space / no ref / unknown
  body) → `null`. This is the existing mechanism that already distinguishes ground-docked from station-docked
  (`hasSpaceportAt` uses the same `EntityManager.get(id)?.type==='station'`) — reused, not reinvented.
- `launchFuelMultiplierForVessel(vessel)` (`:90`) = `launchFuelGravityMult(resolveLaunchOriginBody(vessel))`.

### Nine ground-launch spend sites — `src/systems/MissionSystem.js` (import `:23`)
Each multiplies **both** the fuel affordability pre-check **and** the dispatched `fuelCost` by the multiplier
(same vessel → same value → gate and spend agree):
| # | function | pre-check | dispatch |
|---|---|---|---|
| 1 | `_launch` (mining/scientific/transit) | `:520` | `:573` |
| 2 | `_launchColony` (colonize) | `:610` | `:671` |
| 3 | `_launchFoundOutpost` | `:714` (single `fuelNeeded` → `fuelCost: fuelNeeded`) | — |
| 4 | `_launchTransport` | `launchMult` `:832` → pre-check `:836` + `fuelCost` `:900` | — |
| 5 | `_launchPassenger` | `launchMult` `:981` → pre-check `:982` + dispatch `:1046` | — |
| 6 | `_launchRecon` — `full_system` branch | — | `:1263` |
| 7 | `_launchRecon` — `nearest` branch | — | `:1307` |
| 8 | `_launchReconTarget` (specific-target recon) | `:1345` | `:1393` |
| 9 | `_dispatchLoopLeg` (loop legs) | `:1941` (single `fuelNeeded` → `fuelCost: fuelNeeded`) | — |

`_launch` routes `type==='recon' → _launchRecon`, whose three launch entry points (6–8, all requiring a docked
`idle` science vessel) are the ones the initial "six" undercounted. Site 9 is why loops can't dodge the tax: each
leg is a fresh launch from a docked body, so a repeating colony↔colony route pays the surcharge on **every**
outbound-from-ground leg, not just the first. (Sites 6/7 have no pre-existing fuel pre-check — a pre-existing quirk
of the sequential/nearest recon path — so only the dispatched `fuelCost` is surcharged there.)

### Ordinary move path — `src/systems/MovementOrderSystem.js`
- Import `:23`; `_issueMoveToPoint` `fuelNeeded` `:495` — one `fuelNeeded` feeds the gate, `mission.fuelCost`, and
  the deduction, so the multiplier flows through all three.

### Preview parity — `src/ui/FleetManagerOverlay.js`
- Import `:32`; `_drawMissionConfirm` `fuelCost` `:8606` — the shared "paliwo / fuel" preview now includes the
  surcharge, so the displayed one-way cost **and** the "⛽ BRAK PALIWA / NO FUEL" button gate both match the
  actual spend across every action that uses this dialog (transport / passenger / colonize / found-outpost).

---

## The in-system redispatch sites (B9-bis's open question) — **structurally different, left as ×1.0**

`VesselManager.redirectToTarget` (`:2447`, sequential-recon in-flight redirect) and `_redirectInterstellarVessel`
(`:2485`, post-warp redirect to a planet) both operate on vessels **already in space** (`state !== 'docked'`,
`dockedAt = null`) — there is no docked origin / gravity well to escape. They need no special handling: passing
such a vessel to the helper returns ×1.0 by construction (`resolveLaunchOriginBody → null`). Confirmed the audit's
hypothesis — mid-flight/post-warp redirects, no clear origin. Untouched.

Same reasoning covers MissionSystem's own in-space paths, all left ×1.0: `_orderRedirect` (`:1126`, guarded
`status==='orbiting'`), the sequential-recon greedy-NN hop to the next body (`:2472`, vessel already orbiting), and
**return-from-orbit legs** via `VesselManager.startReturn` (the vessel orbits its target after arrival — `state==='orbiting'`, not `docked` — so it has already left the well; the return burn is computed inside `startReturn` and is correctly un-surcharged). The one place a return-family leg *does* pay is `_dispatchLoopLeg` (site 9): a loop
explicitly **docks** at each endpoint to load cargo, so its next leg is a genuine ground launch.

---

## AI fuel-cost finding — **AI movement is effectively abstracted; left alone (correctly)**

Investigated before assuming, per the s34d AI-parity lesson. Three AI movement modes, none pays *consequential*
fuel through these paths:

1. **Inter-system fleet movement** (galaxy map) — abstract: `empire.fleets[].destSystemId` + ETA.
   `EmpireFleetMaterializer` converts strength→vessels near the player and **deducts no fuel at all** (grep for
   `fuel`/`fuelCost` in that file = 0 hits).
2. **In-system logistics couriers** (`EmpireLogisticsSystem._advanceRouteCourier`) — these *are* real vessels
   dispatched via `dispatchOnMission` with a computed `fuelCost = distAU × consumption` (`:281`), BUT the code is
   explicitly **fuel-immune**: the comment at `:274-276` states *"AI jest fuel-immune (dispatch clampuje paliwo do
   0), więc kurier ma krążyć niezależnie od stanu paliwa"* — there is **no affordability gate** before dispatch
   (unlike the player's `_launchTransport`), so the fuel number is deducted-then-clamped-to-0 with zero
   consequence, and the courier circulates regardless. It also computes `fuelCost` **inline**, bypassing
   `_launchTransport` entirely, so none of my edits touch it.
3. **Combat movement** — DSCS/VCS manage position directly; `AutoRetreatSystem` issues `moveToPoint` only for
   in-space enemy vessels (`state !== 'docked'` → ×1.0) and skips the player side. `MilitaryAI` issues no
   `moveToPoint` orders at all (not among the 8 files that call `issueOrder`/`moveToPoint`).

**Conclusion:** AI does **not** pay real fuel costs through these paths — its movement is abstracted/fuel-immune.
Per the prompt, I left it alone rather than build new AI-side accounting that corresponds to nothing. Adding the
surcharge to the fuel-immune courier number would change a value that is already clamped to 0 with no gameplay
effect. (Backlog hook: if AI fuel is ever made real, `EmpireLogisticsSystem:281`'s inline computation is the one
site to add `launchFuelMultiplierForVessel` to.)

---

## Save compatibility — **no new field, no migration, no version bump**

Uses **only** the existing `surfaceGravity` (Planet/Moon/Planetoid), which already round-trips through
serialize/restore (`SaveMigration._migrateV16toV17` even backfills it for legacy saves). No serialized schema
change → `SaveMigration.CURRENT_VERSION` untouched (currently ≥93 from Stage 2). Same reasoning the Stage-2
building-cost mechanic used: reading an already-persisted attribute needs no migration. **Verified:** the real
save `kosmos_…r79_v92.json` carries `surfaceGravity` on all 545 bodies (0 null).

---

## Real before/after fuel numbers (from the actual save `kosmos_…r79_v92.json`)

Real inputs: `hull_small` freighter `consumption = 0.29803`; Opat III's real planet-departure leg
`distance = 2.861 AU` (one-way base fuel `= 0.8526`). Holding the leg fixed so the **only** variable is the origin
body's gravity band (isolates the tax), using bodies that actually sit in each band **in this save**:

| origin body (real) | real `surfaceGravity` | band | mult | fuel: before → after |
|---|---|---|---|---|
| **Nowa Ziemia** (home, `entity_5`) | 1.255 | normal | ×1.0 | 0.8526 → **0.8526** (unchanged) |
| **Fobos** (moon, `entity_7`) | 0.082 | low | ×0.7 | 0.8526 → **0.5969** (cheaper) |
| **Thuban c** (planet) | 1.914 | high | ×1.5 | 0.8526 → **1.2790** (pricier) |
| **any orbital station** | — (exempt) | — | ×1.0 | 0.8526 → **0.8526** (unchanged) |

And the two real freighters B9-bis flagged, showing the tax layers **on top of** the pre-existing positional
difference without touching the station leg:

| freighter | real origin | real leg | mult | before → after |
|---|---|---|---|---|
| **Opat III** (`v_46`) | Nowa Ziemia (planet, normal-g) | 2.861 AU | ×1.0 | 0.8526 → 0.8526 |
| **Dostawca III** (`v_45`) | station (per B9-bis) | 2.003 AU | ×1.0 (station exempt) | 0.5968 → 0.5968 |

**Honest empirical caveat for the live-gate:** the player's home world **Nowa Ziemia is normal-g (×1.0)**, so
*home* launches are intentionally **unchanged** — matching the audit's note that most rocky worlds land in the
normal band. The tax only visibly bites when launching from an **off-home low-g body** (moons/planetoids like
Fobos → ×0.7) or a **high-g planet** (Thuban c 1.914, Kepler-4799 h 2.62 → ×1.5). Across the save's 545 bodies the
split is **454 low / 19 normal / 72 high**, so the mechanic is far from inert galaxy-wide — it just happens to be
×1.0 at *this* home. **Test on a NEW launch** from a non-normal body (in-flight missions keep their departure-locked
`fuelCost` — same "changes don't touch ships already flying" rule as balance/speed tweaks).

---

## Fail-open behaviour (verified)

Every unresolvable case yields **×1.0** — never a block, throw, or alternate default (mirrors the Farm/Well
placement gates and the building-cost `planet null → 1`):
- vessel in space (`orbiting`/`in_transit`) → `null` origin → ×1.0
- `docked` but `dockedAt = null` → ×1.0
- `docked` at an id **not in EntityManager** (destroyed/unknown body) → ×1.0
- body with `surfaceGravity = null`/`undefined` → `gravityBand → 'normal'` → ×1.0
- `null`/`undefined`/`{}` vessel or body → ×1.0
- station (any gravity, even missing) → ×1.0 (exempt; note a **low-g station is ×1.0, not the ×0.7 discount** — the
  exemption is a hard ×1.0, verified in smoke T3)

---

## Launch-cost preview — **exists, and now matches spend**

Yes. `FleetManagerOverlay._drawMissionConfirm` shows a one-way "paliwo / fuel" row (`:8608`) and gates the send
button on it (`:8694` `insufficientFuel`). Both read the same `fuelCost`, now surcharged (`:8606`), so preview ==
actual spend for every action routed through that dialog (transport / passenger / colonize / found-outpost) — the
same "preview must match spend" fix Stages 2–3 needed. **The ordinary move order (right-click "move here") has no
fuel preview** — it dispatches directly via the context menu — so there is nothing to wire there; the spend itself
is surcharged in `_issueMoveToPoint`.

---

## Testing summary

- **`src/testing/smoke/stage4_launch_gravity_smoke.mjs` — 47/47 PASS** (bands + boundaries 0.4/1.5; station
  always-×1.0 incl. no low-g discount; fail-open on null/unknown/no-gravity; `resolveLaunchOriginBody` docked-only;
  vessel docked-ground/station/in-space; before/after with the real save's consumption & distances; thresholds
  sourced from `EnvironmentBands`; **T11 = end-to-end wiring proof** — drives the real
  `MissionSystem._dispatchLoopLeg` from a high-g vs normal-g docked origin and reads the surcharge back out of the
  `fuelCost` handed to `dispatchOnMission` (0.9 = 0.6×1.5 vs 0.6×1.0), proving the multiplier reaches the spend,
  not just the isolated helper).
- **Regression — 0 FAIL:** `stage2_water_envcost` 40/40, `stage3_well_gate` 49/49, `order_service` 28/28,
  `s34_faza4` (passenger) 80/80, `s3_0a_e` (loop fuel) 34/34, `s3_0a_d` (stranding) 39/39, `load_colonists` 27/27,
  `cross_system_targets` 8/8, `fleet_list_rows` 15/15. (No assertion moved because every synthetic test vessel
  resolves to ×1.0 — in-space, or docked at a mock body with no `surfaceGravity` / not in EntityManager — which is
  exactly the fail-open contract.)
- **`node --check` clean** on all 5 touched source files.
- **Not run:** the browser live-gate — Filip's step before commit.

## Files touched
NEW: `src/data/LaunchFuelCost.js`, `src/testing/smoke/stage4_launch_gravity_smoke.mjs`, `REFORM_STAGE4_REPORT.md`.
Modified: `src/utils/SpaceportCheck.js` (origin resolver + multiplier), `src/systems/MissionSystem.js` (9 launch
functions/branches + import), `src/systems/MovementOrderSystem.js` (move path + import), `src/ui/FleetManagerOverlay.js` (preview +
import). No i18n (no new user-facing strings — the surcharge is baked into the existing fuel numbers). No save
migration.

## Live-gate checklist (for Filip)
- [ ] Launch a **new** transport/move from a **low-g** body (a moon/planetoid outpost, e.g. Fobos-class ×0.7) →
      the confirm dialog's fuel is **~30% lower** than distance×consumption, and the actual burn matches.
- [ ] Launch a **new** one from a **high-g** planet (>1.5g, e.g. Thuban-c-class ×1.5) → fuel **~50% higher**, and
      the "NO FUEL" gate trips at the higher threshold.
- [ ] Launch from an **orbital station** → fuel **unchanged** (×1.0) regardless of the body it orbits.
- [ ] Launch from **Nowa Ziemia** (home, normal-g) → **unchanged** — this is correct, not a bug; the home world is
      in the normal band.
- [ ] A **repeating** trade loop between two ground colonies pays the surcharge on **every** ground-departure leg,
      not just the first.
