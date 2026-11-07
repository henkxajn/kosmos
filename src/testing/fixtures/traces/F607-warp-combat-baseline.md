# F607-warp-combat-baseline — ślad skoku AI w starciu i kontroli gracza SPRZED naprawy Findingu 607

| pole | wartość |
|---|---|
| **rodzaj** | ślad wykonania (NIE zapis gry): stan statków co 5 tików (wrak w locie: co tik) + zdarzenia skoku, rozkazów, wraku i odwrotu, `x, y` w px |
| **commit nagrania** | `eca9a3b` (docs(603)), świeży `git clone`, checkout LF |
| **nagrał** | `node src/testing/smoke/warp_combat_607_smoke.mjs --record` z `F607_BASELINE_COMMIT=eca9a3b`; dwa nagrania dały ten sam SHA-256 (`12e599dc3c886cba…`) |
| **data** | 2026-11-07 |
| **schemat** | `DT = 0.02` roku GRY/tik · `AU_TO_PX` z `GameConfig` · `FLIGHT = 67` tików (8 LY przy 6 LY/rok) · `reseed('f607-<nazwa>')` przed każdym scenariuszem · rundy starcia wołane wprost (`_tickEncounter`), bo bez `TimeSystem` zegar starcia stoi |
| **scenariusze** | `ai_warp_in_encounter` · `ai_group_in_encounter` (`issueGroupAttack`) · `ai_recall_in_encounter` (`issueRecall`) · `ai_retreat_in_encounter` (rozkaz odwrotu) · `ai_lost_battle` (`AutoRetreatSystem`) · `ai_wrecked_mid_flight` (stempel wraku, Finding 609) · `player_bystander` · `player_after_battle` |
| **odbiorca** | `warp_combat_607_smoke` T0: ścieżka AI i statek gracza poza starciem są po naprawie identyczne (`===`) |
| **kiedy nagrywać ponownie** | gdy świadomie zmienia się skok AI albo stempel wraku (naprawa Findingu 609 zmienia `ai_wrecked_mid_flight`); wtedy na commicie sprzed tej zmiany |
