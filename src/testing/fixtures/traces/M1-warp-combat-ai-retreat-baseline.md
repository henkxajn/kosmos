# M1-warp-combat-ai-retreat-baseline — dwa ślady odwrotu AI w starciu po M1 „bitwy do końca”

| pole | wartość |
|---|---|
| **rodzaj** | ślad wykonania (NIE zapis gry): stan statków co 5 tików + zdarzenia skoku, rozkazów, wraku i odwrotu, `x, y` w px — ten sam format co `F607-warp-combat-baseline.json` |
| **commit nagrania** | drzewo robocze M1 na `127994c` (przed commitem `feat(M1)`; `recordedFrom` w pliku mówi to samo) |
| **nagrał** | `node src/testing/smoke/warp_combat_607_smoke.mjs --record-m1`; dwa nagrania dały ten sam SHA-256 (`8a7f2639…`) |
| **data** | 2026-11-11 |
| **schemat** | jak `F607-warp-combat-baseline` (`DT = 0.02`, `FLIGHT = 67`, `reseed('f607-<nazwa>')`, rundy starcia wołane wprost `_tickEncounter`) |
| **scenariusze** | `ai_retreat_in_encounter` (rozkaz odwrotu AI w starciu — lot na zegarze starcia nie działa w tej uprzęży, ale rozkaz i znacznik tak) · `ai_lost_battle` (AI przy 1 HP: rozkaz odwrotu W TRAKCIE starcia, potem zabicie — uprząż nie przesuwa uciekającego) |
| **odbiorca** | `warp_combat_607_smoke` T0 — te dwa ślady porównywane z tym plikiem; pozostałe sześć z `F607-warp-combat-baseline` (`eca9a3b`) |
| **dlaczego osobny plik** | M1 (decyzja 33) zmienił MECHANIKĘ odwrotu AI (prawdziwy lot, ogień jednoczesny), nie bramkę 607 — nagranie z `eca9a3b` przestało opisywać te dwa scenariusze, a pytanie keepera („bramka gracza nie dotyka AI”) niosą pozostałe sześć śladów i T7 |
| **kiedy nagrywać ponownie** | gdy świadomie zmienia się mechanika odwrotu albo rund starcia; na drzewie z tą zmianą (`--record-m1`) |
