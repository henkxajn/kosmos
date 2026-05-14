# M4 P1 + P1.5 — Handoff snapshot (2026-05-14)

**Status:** Implementacja zakończona, częściowy playtest wykonany. Pozostały retesty Rev 5/6 + TEST 6/7.
**Tag candidate:** `m4-commit-p1-complete` (po zakończeniu retestów)
**Smoke tests:** 45/45 PASS (`tmp_m4_p1_smoke.mjs` 33 + `tmp_m4_p1_5_smoke.mjs` 12)
**Plan source:** `C:\Users\Komputer\.claude\plans\clever-forging-ember.md`

---

## TL;DR — co zrobiliśmy

**P1 (Activation + Notifications + Drift fix)** zamknięte:
- Wszystkie flagi M1/M2a flipnięte ON by default (`movementOrders`, `fleetMaterialization`, `proximitySystem`, `vesselCombat`, `unifiedAggregator`). `enduranceDrainActive` zostaje OFF do P4.
- MovementOrderSystem: drift state fix — po pursue/intercept na vessel target, marker `driftIdle` + 5 game-years timer → auto-rescue dock (inline teleport z fuel cost).
- AutoRetreatSystem: fuel-aware fallback (low_fuel_drift) gdy retreat moveToPoint zwraca insufficient_fuel.
- UIManager: 7 nowych subskrypcji (empire:fleetMoved/Materialized, vessel:proximityEnter, battle:resolved, autoRetreatFailed/LowFuel, driftIdle, diplomacy:warDeclared) z auto-slow + i18n PL/EN.
- VesselCombatSystem combat cooldown reform: A (drop team-up smearing) + B (reset cooldown na combatRangeExit) + C (2y → 1y).
- SaveMigration v68 → v69 (lazy default `driftIdle`/`lowFuelDrift` per vessel).
- `window.KOSMOS.eventBus` exposed dla debug konsoli.

**P1.5 (post-playtest #3 — debugability + starting frigate + civilian warnings)** zamknięte:
- Debug helper `KOSMOS.debug.spawnMyVessel('hull_frigate', opts?)` — instant militarny z auto-unlock `point_defense` + sensowne default modules.
- `spawnEnemyAttack` friendly defaults: `etaYears` 0.5→2.0, `spawnDistanceAU` 15→30.
- Power Test starting fleet dorzuca `hull_frigate` + auto-unlock `point_defense`.
- RightClickMenu warning `⚠` + tooltip "Brak broni" dla pursue/intercept gdy selected vessel bez weapon module (opcja **nadal enabled** — kamikaze recon możliwy).
- Debug helper `KOSMOS.debug.simulateBattleRetreat(opts?)` — jeden call zamiast 5 komend dla TEST 5.

**Rev 5/6 post-playtest fixy** (do retestu):
- Auto-return drift docking jako inline rescue teleport (pursue planety nie działało bo orbital speed > vessel speed).
- Usunięto duplikat log entry dla firstSighting (ObservatorySystem już to robi sam).

---

## Stan plików (zmodyfikowane w P1+P1.5)

```
src/config/GameConfig.js                    — FEATURES flagi + M4 flagi
src/scenes/GameScene.js                     — debug helpery (spawnMyVessel, simulateBattleRetreat)
                                               + _spawnPowerTestFleet + window.KOSMOS.eventBus exposure
src/scenes/UIManager.js                     — LOG_COLORS intel/combat/diplomacy
                                               + _subscribeM4Notifications (7 subskrypcji)
src/systems/MovementOrderSystem.js          — drift state + _tryAutoReturnDrift inline rescue
src/systems/AutoRetreatSystem.js            — fuel-aware fallback (low_fuel_drift)
src/systems/VesselCombatSystem.js           — cooldown A+B+C reform
src/systems/SaveMigration.js                — CURRENT_VERSION 69 + _migrateV68toV69
src/debug/SpawnTestEnemy.js                 — friendly defaults
src/data/RightClickMenuOptions.js           — _vesselHasNoWeapons + warning field
src/ui/RightClickMenu.js                    — warning prefix ⚠ + tooltip
src/i18n/pl.js + src/i18n/en.js             — 18 nowych kluczy
CLAUDE.md                                   — save v69 + FEATURES annotation

tmp_m4_p1_smoke.mjs (NEW)                   — 33 cases
tmp_m4_p1_5_smoke.mjs (NEW)                 — 12 cases
docs/m4-p1-test-flow.md (NEW)               — playtest checklist Rev 6
```

---

## Status playtestu (na 2026-05-14)

```
TEST 0  Sanity                  ✅ PASS
TEST 1  Activation flags        ✅ PASS
TEST 2.1-2.3 PPM movement       ✅ PASS (uwaga: 3D map vessel selection — known bug, defer)
TEST 2.4 pursue enemy           ⚠️  częściowo (frigate dostępny po Rev 4 — do retestu)
TEST 2.5 civilian warning       ⚠️  do testu (Rev 4)
TEST 3.1-3.3 drift marker       ✅ PASS
TEST 3.4 auto-return            🔧 FIX Rev 5 — DO RETESTU
TEST 3.5 player override        ✅ PASS (działa)
TEST 4.1 fleet movement         🔧 FIX Rev 5 — DO RETESTU (dedup, powinny być 2 wpisy nie 3)
TEST 4.2 proximity contact      ✅ PASS
TEST 4.3 battle resolved        ✅ PASS
TEST 4.4 war declared           ✅ PASS (TODO future: popup modal zamiast log)
TEST 5.1/5.2 low_fuel_drift     🔧 FIX Rev 6 — DO RETESTU (użyj simulateBattleRetreat helper)
TEST 6 save migration           ⬜ NIE PRZETESTOWANE
TEST 7 drift after reload       ⬜ NIE PRZETESTOWANE
```

---

## Co masz zrobić dalej (po restarcie sesji)

### Krok 1 — Retesty Rev 5/6 (priorytet)

Załaduj `docs/m4-p1-test-flow.md`. F5 w przeglądarce. Powtórz:

1. **TEST 3.4** — vessel po pursue/intercept na wrogiego vessela → 5y timer → auto-rescue dock do najbliższej planety. **Oczekiwane:** vessel orbituje planetę (`v.position.dockedAt === planet.id`), nie zwisa w pustce. Zużywa proporcjonalne paliwo.

2. **TEST 4.1** — `KOSMOS.debug.spawnEnemyAttack()` (nowe defaults: etaYears=2, spawnDistanceAU=30). **Oczekiwane:** w EventLog **2 wpisy** dla wykrycia (Observatory + proximity), NIE 3. Plus auto-slow + popup.

3. **TEST 5.1/5.2** — uproszczone z helperem:
   ```js
   KOSMOS.debug.simulateBattleRetreat()
   ```
   **Oczekiwane:** wpis w EventLog "dryfuje na resztkach paliwa", marker `vessel.lowFuelDrift` ustawiony (console log podpowiada komendę inspekcji).

### Krok 2 — TEST 6 + TEST 7 (jeszcze nie zrobione)

- **TEST 6** — save migration backward compat: symulujesz stary save v68 (komendy w doc), F5, weryfikujesz logi `[SaveMigration] Migracja v68 → v69`.
- **TEST 7** — drift state przeżywa save/reload: setup drift marker, save, reload, sprawdź że `v.driftIdle` jest preserved i `_driftingVessels` rebuilt.

### Krok 3 — Commit P1 + P1.5

Jeśli wszystkie testy PASS — utwórz atomic commits zgodnie z M3 wzorcem (`m4-commit-pX-Y-name`):

Propozycja split:
```
1. m4-commit-p1-1-flag-flip            — GameConfig flags + CLAUDE.md
2. m4-commit-p1-2-drift-state          — MovementOrderSystem drift + AutoRetreat fuel-aware
3. m4-commit-p1-3-notifications        — UIManager subskrypcje + LOG_COLORS + i18n
4. m4-commit-p1-4-migration-tests      — SaveMigration v69 + smoke tests
5. m4-commit-p1-5-combat-cooldown      — VCS A+B+C cooldown reform
6. m4-commit-p1.5-debug-helpers        — spawnMyVessel + simulateBattleRetreat + frigate start + warning + Rev 5/6 fixy
```

LUB jeden zbiorczy commit "M4 P1 complete (Activation + Notifications + Drift + Cooldown + P1.5 debug helpers)".

### Krok 4 — Przejście do P2

Po commit'cie P1 → start **P2 — Sensor radar + Galactic minimap + Vessel cycling** (~1.5 tygodnia).

P2 scope z planu:
- Sensor overlay w ThreeRenderer (cyan ring 0.3 AU wokół własnych vesseli, yellow ring observatory range wokół kolonii)
- Enemy ghosts (intel-gated) — rumor/contact/detailed quality renderowane różnie
- GalacticMiniMap (klawisz M) — strzałki tras AI flot
- Wreck list overlay (rozszerzenie FleetManagerOverlay, klawisz K)
- Vessel cycling Tab/Shift+Tab
- Save migration v69 → v70

---

## Known issues / future TODO

1. **3D map vessel selection (TEST 2)** — vessele w 3D scenie nie wybierają się LPM. Działa w tactical map (FleetManagerOverlay). Defer — możliwa fix w P2 (`ThreeRenderer.getEntityAtScreen` integration z UIManager.setSelectedVesselId).
2. **War declared popup modal** — currently tylko log entry. User chce popup z pauzą (jak vessel:firstSighting). Defer do P5 (Empire vs Empire combat zaplanowany — przy okazji rebuild dyplomacji).
3. **Proper auto-return travel physics** — obecnie inline rescue teleport. M5 backlog: intercept math na planet orbital prediction lub mission z `targetId=planet.id` + dock flow.
4. **Endurance unfreeze + fuel reform** — `FEATURES.enduranceDrainActive=false` zostaje. P4 unfreeze + presja ekonomiczna.
5. **Drift state przeżywa reload** — `_indexExistingOrders` rebuilds `_driftingVessels` Set z vessel.driftIdle. Smoke test T3.9 PASS. Real-flow TEST 7 do potwierdzenia.

---

## Architectural notes

**M3 patterns reused w P1+P1.5:**
- `_triggerAutoSlow(reason)` reused dla 4 nowych eventów (auto-slow stało się patternem)
- LOG_COLORS extension (nie modyfikacja core) — same shape jak `poi_alert`/`poi_rally`
- Function-based debug helpers w `KOSMOS.debug.*` (P3.1 wzorzec)
- Feature flag `m4XXX` per faza (P1/P2/...) — granular rollback (M3 P1.3 `m3OrdersInteractive` precedent)

**Nowe patterns w P1+P1.5:**
- Inline rescue dock (teleport z fuel cost) — lore-justified fallback gdy fizyka nie działa
- `bypassFuelCheck` opt-in spec field — nie nadpisuje, opcjonalny override
- `warning` field w buildMenuOptions — enabled z visual indicator (różny od disabled)
- 2-stage cooldown (per-pair + reset on disengage) — combat A+B+C reform

---

**Cumulative milestone progress:**
```
M1: ✅ COMPLETE   (targeting foundation, save v65)
M2a: ✅ COMPLETE  (combat core, save v66)
M2b: ✅ COMPLETE  (intel + POI, save v67)
M3:  ✅ COMPLETE  (POI ecosystem + tooltip, save v68)
M4:  🔄 IN PROGRESS
  P1:    ✅ COMPLETE (Activation + Notifications + Drift) — save v69
  P1.5:  ✅ COMPLETE (debugability + starting frigate)
  P2:    ⬜ TBD (Sensor radar + minimap + cycling)
  P3:    ⬜ TBD (Tick-based combat + weapon ranges)
  P4:    ⬜ TBD (Endurance + Fuel reform)
  P5:    ⬜ TBD (Empire vs Empire + AI POI)
  P6:    ⬜ TBD (Polish + Ambush)
```

**Solidnie zasłużony break.** 🚀
