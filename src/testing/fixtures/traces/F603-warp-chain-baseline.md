# F603-warp-chain-baseline — ślad skoku AI i statku gracza bez rozkazu SPRZED naprawy Findingu 603

| pole | wartość |
|---|---|
| **rodzaj** | ślad wykonania (NIE zapis gry): stan statków co 5 tików + zdarzenia skoku i rozkazów, `x, y` w px |
| **commit nagrania** | `010f081` (docs(G4)), świeży `git clone`, checkout LF |
| **nagrał** | `node src/testing/smoke/engage_warp_603_smoke.mjs --record` z `F603_BASELINE_COMMIT=010f081`; dwa nagrania dały ten sam SHA-256 (`2eb92abea096500a…`) |
| **data** | 2026-11-06 |
| **schemat** | `DT = 0.02` roku GRY/tik · `AU_TO_PX` z `GameConfig` · `FLIGHT = 67` tików (8 LY przy 6 LY/rok) · `reseed('f603-<nazwa>')` przed każdym scenariuszem |
| **scenariusze** | `ai_group` (`issueGroupAttack` + `pendingOrder`) · `ai_live_order` (AI z żywym rozkazem w chwili skoku) · `player_one_hop` · `player_two_hops` · `player_stale_record` (stary rekord rozkazu + migawka) |
| **odbiorca** | `engage_warp_603_smoke` T0: ścieżka AI i statek bez żywego rozkazu są po naprawie identyczne (`===`) |
| **kiedy nagrywać ponownie** | gdy świadomie zmienia się ścieżka skoku AI albo statku bez rozkazu; wtedy na commicie sprzed tej zmiany |
