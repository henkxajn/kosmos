# `vessel:orderBlocked` → resume suspended mission (pre-existing order-layer bug)

**Status:** implemented, no flag, no save-format change. Not part of
`m4PlayerCombatMissionPause` (A1) — a separate, pre-existing order-layer bug found while
live-gating A1 ("Smok II" ended a battle with **both** `vessel.mission` and
`vessel._suspendedMission` set, same `targetId`).

## Root cause

`MOS._suspendMissionIfAny` snapshots the active mission into `vessel._suspendedMission`
but **does not clear `vessel.mission`** (pursue/intercept/engage drive position directly;
the dormant `vessel.mission` is only used on resume). So during a pursue/engage **both**
fields are set by design.

`MOS._blockAndCancel` (e.g. pursue/engage `target_lost` when the enemy target is wrecked
mid-battle) emits `vessel:orderBlocked`, removes the order from `_byVessel`, and touches
neither `vessel.mission` nor the `vessel.movementOrder` marker. `VesselManager` subscribed
`_resumeMissionAfterOrder` to `vessel:orderCompleted` and `vessel:orderCancelled` **only** —
never `orderBlocked`. Result: after a blocked pursue/engage the snapshot was **orphaned**
next to the never-cleared `vessel.mission` (both set, same target). That was the observed
"Smok II" state.

## Fix

`VesselManager` also subscribes `_resumeMissionAfterOrder` to `vessel:orderBlocked`.
`_resumeMissionAfterOrder` rebuilds `vessel.mission` from `_suspendedMission` (route from the
current position) and **deletes `_suspendedMission`** → exactly one mission remains. No
snapshot → immediate no-op (safe for blocks with nothing suspended). Idempotent (the snapshot
delete makes a second `orderBlocked` a no-op).

## M4 drift-fix interaction (confirmed disjoint — no double-fire)

`driftIdle` (the M4 auto-return marker, `FEATURES.m4DriftFix`) is set **only in the
pursue/intercept COMPLETION path** (`_completeOrder`, when the pursuer *catches* a vessel
target in open space) and that path emits `vessel:orderCompleted` (already resumes). It is
**cleared on every `issueOrder`** (`_clearDriftMarker`, before the new order can later block)
and on wreck. The **block path** (`_blockAndCancel` → `orderBlocked`) **never sets
`driftIdle`**. Therefore:

- A blocked vessel has no `driftIdle` → the drift recovery loop skips it (`if (!v.driftIdle)`).
- `driftIdle` (completion, `orderCompleted`) and `orderBlocked` are **different order
  resolutions** — a single order either completes or blocks, never both — so the drift
  auto-return and this `orderBlocked`→resume can never fire on the same vessel.

Entity-target and vessel-target blocks both go through `_blockAndCancel` and are covered
identically (neither sets `driftIdle`).

## Tech-debt (deviation #3, logged — not fixed)

`_resumeMissionAfterOrder` sets a fresh `vessel.mission` but does **not** clear the
`vessel.movementOrder` marker. After a blocked pursue/engage (and, same mechanism, after a
`moveToPoint` resume) the vessel briefly carries the resumed mission **plus a stale
`vessel.movementOrder` marker** from the cancelled order. Benign — the resumed mission drives
movement and the marker is inert / re-synced on the next MOS tick — but it is the least-clean
path. **Same family** as the fleet-order double-marker note in
`docs/player-combat-mission-pause.md` §"Known limitation / tech-debt": one root
(`_resumeMissionAfterOrder` never touches `movementOrder`), two triggers. Deferred pending a
real FleetSystem/MOS marker-cleanup pass.

## Test

`src/testing/smoke/order_blocked_resume_smoke.mjs` — 9/9 (wiring, end-to-end orphan
resolution, no-snapshot no-op, idempotency). Regression: `player_combat_mission_pause_smoke`
19/19, `tmp_moveto_no_return_smoke` 15/15, `tmp_moveto_body_snap_smoke` 8/8.
