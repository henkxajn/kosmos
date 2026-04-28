# M2b Commit 0 — COMPLETE (2026-04-25)

## Status
Tag: m2b-commit-0-complete
Save version: v66 (bez zmian, Commit 0 to refactor)
Playtest Combat Sandbox: PASS

## Zmiany
- ProximitySystem dual-threshold (0.5 detection + 0.15 combat, hysteresis 0.20/0.6)
- New events: vessel:combatRangeEnter, vessel:combatRangeExit
- VCS subscribe combatRangeEnter; stary vessel:orderCompleted hook usunięty
- _inCombatState akceptuje state==='orbiting' niezależnie od dockedAt (było: wymaga dockedAt===null)
- Team-up cooldown fill w _applyOutcome — po bitwie, wszystkie pary (sideA × sideB) dostają timestamp w _recentlyEngaged

## Bugi znalezione i naprawione podczas Commit 0 playtest
1. VCS _inCombatState za restrykcyjny — blokował combat dla wrogów orbitujących kolonię (docked).
2. Team-up cooldown per-pair, nie per-battle — 3 combatRangeEnter w tym samym ticku → 3 bitwy zamiast 1.

## Known issue (deferred, nie blocker)
- _makeBattleId collision gdy wiele bitew w tym samym ticku między tymi samymi stronami. Po fix team-up cooldown → praktycznie niemożliwy scenariusz w M2b. Fix (sequence/counter w battleId) → M3 empire↔empire combat.

## Real-flow playtest verification (Combat Sandbox)
- Pursue v_1 → v_5 (dystans startowy ~5 AU)
- O 6.693y: proximityEnter (detection, 0.5 AU)
- O 6.769y: orderCompleted pursue (MOS kończy przy 0.15 AU)
- O 6.770y: SEQUENCE:
  - autoRetreatIssued (mo_2) — v_1 przegrał bitwę, retreat
  - 1× battle:resolved (battle_ds_6_77_player_emp_sandbox_enemy)
  - 3× combatRangeEnter (v_1↔v_5/v_6/v_7, distance 0.149 AU)
  - cooldown pokrył wszystkie 3 pary → brak kolejnych bitew
- O 6.781y: combatRangeExit (v_1 odjeżdża)
- O 6.861y: proximityExit

## Ready for M2b Commit 1
Commit 1 spec: milestone-2b-intelligence-poi.md §2.5 (3 FEATURES) + §2.6 (migracja v66→v67) + Vessel.movementOrder extensions.