# Deferred live-gates

Live-gate (browser) verifications that were consciously deferred, plus the gaps
found while attempting them. Each entry is a hand-off note for whoever picks the
work up: what was verified, what was not, and how to reproduce the missing check.

---

## ENTRY 1 — A1 abort-below-threshold, browser verification deferred

Status: implemented, headless-verified, NOT browser-verified.

Browser-verified for A1 (all directly observed in the DevTools console):
- Freeze + pause: `_createEncounter` fired, `_isMissionPauseEligible` → true,
  `_pausePlayerSideForCombat` ran, vessel showed `state=orbiting`,
  `mission=null`, `_suspendedMission` populated, `_combatPause` set.
- Resume above threshold: one science vessel resumed twice ("Resume
  mission → Thuban d", "Resume mission → Thuban b" in its missionLog);
  a transport resumed its mission after a deep-space battle
  (battleId `battle_ds_81_58_player_emp_001`).
- Point-target resume: a `move_to_point` mission resumed toward the stored
  coordinates rather than being cancelled.
- No regression: `orderCompleted` / `orderCancelled` still clear the
  snapshot; no AI vessel ever carried `_suspendedMission`.

NOT verified: the abort branch (`pct <= RETREAT_THRESHOLD` → retreat to
nearest friendly planet). Player fleets don't get beaten below 20% in
normal play, so it has to be forced.

Repro procedure for whoever picks this up:
1. Set `GAME_CONFIG.FEATURES.m4PlayerCombatMissionPause = true`.
2. Install this hook in the console BEFORE combat starts — it knocks the
   player side down to 5% at the exact moment the threshold is computed:

   ```js
   const dscs = window.KOSMOS.deepSpaceCombatSystem;
   const orig = dscs._resolvePlayerMissionsPostBattle;
   dscs._resolvePlayerMissionsPostBattle = function (enc, battleId) {
     const side = enc.sideA.ownerEmpireId === 'player' ? enc.sideA
                : enc.sideB.ownerEmpireId === 'player' ? enc.sideB : null;
     if (side) for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
       const s = enc.vesselStates.get(vid);
       if (s) s.hp = Math.max(1, Math.floor(s.hp * 0.05));
     }
     return orig.apply(this, [enc, battleId]);
   };
   ```

   Note: vessels have no `hp` field of their own — combat HP lives in
   `encounter.vesselStates`, built by `_buildVesselState`. Mutating the
   vessel will do nothing.
3. Send a vessel carrying a REAL mission (exploration / transport / scan)
   — NOT a `moveToPoint` order — on a course crossing a hostile vessel.
   Verify before launch that `vessel.movementOrder` and
   `vessel._suspendedMission` are both null.
4. Expected: after the battle the vessel drops its original mission and
   heads for the nearest friendly planet, with `_suspendedMission` cleared.

---

## ENTRY 2 — abort branch unreachable while a movementOrder is active

Found while attempting Entry 1. Confirmed sequence in-browser:

```
_isMissionPauseEligible → true
_pausePlayerSideForCombat → state orbiting, mission null, snapshot taken
pct after forced knockdown: 0.050   (well below RETREAT_THRESHOLD 0.2)
_resolvePlayerMissionsPostBattle
→ result: mission restored, snapshot cleared, NO retreat issued
```

Cause: the vessel had an active `moveToPoint` movementOrder. The freeze
clears `vessel.mission`, but the order layer re-populates it before
`_resolvePlayerMissionsPostBattle` reaches its guard:

```js
if (v.mission) { delete v._suspendedMission; continue; }
```

so the `eligible && pct <= RETREAT_THRESHOLD` branch is never reached.

Consequence: a player fleet reduced below 20% while flying on a movement
order will never auto-retreat. The safeguard silently does not apply to
that entire class of vessels.

Open design question, not yet answered: should the abort take priority
over the order layer? A fleet at 5% HP arguably should retreat regardless
of what is driving it.

Also observed but unconfirmed: after that battle the vessel appeared to
fly back toward its origin instead of continuing to the ordered point.
Possible separate re-path bug in the freeze → order-layer handoff. Needs
its own investigation.

---

## ENTRY 3 — cannot issue an exploration mission to a body in another system

Unrelated to A1. The mission panel does not allow selecting a body in a
non-home system as an exploration target. This is what blocked the Entry
1 test — I had to fall back to `moveToPoint`, which invalidated it. Not
investigated; log only, needs its own audit.
