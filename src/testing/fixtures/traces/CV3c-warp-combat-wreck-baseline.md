# CV3c-warp-combat-wreck-baseline — dwa ślady z wrakiem AI po CV-3c „wrak w miejscu śmierci”

| pole | wartość |
|---|---|
| **rodzaj** | ślad wykonania (NIE zapis gry): stan statków co 5 tików (`ai_wrecked_mid_flight` — co tik) + zdarzenia skoku, rozkazów i wraku, `x, y` w px — ten sam format co `F607-warp-combat-baseline.json` |
| **commit nagrania** | drzewo robocze CV-3c na `835f439` (przed commitem `feat(CV-3c)`; `recordedFrom` w pliku: `835f439+CV-3c`) |
| **nagrał** | `node src/testing/smoke/warp_combat_607_smoke.mjs --record-cv3c`; dwa nagrania dały ten sam SHA-256 (`59f341a4…`) |
| **data** | 2026-11-12 |
| **schemat** | jak `F607-warp-combat-baseline` (`DT = 0.02`, `FLIGHT = 67`, `reseed('f607-<nazwa>')`, rundy starcia wołane wprost `_tickEncounter`) |
| **scenariusze** | `ai_lost_battle` (AI przy 1 HP: rozkaz odwrotu w trakcie starcia, potem zabicie — wrak) · `ai_wrecked_mid_flight` (AI ginie w skoku z układu B — wrak, stempel `sys_home`, Finding 609) |
| **odbiorca** | `warp_combat_607_smoke` T0 — te dwa ślady porównywane z tym plikiem; `ai_retreat_in_encounter` z `M1-warp-combat-ai-retreat-baseline`, pozostałe pięć z `F607-warp-combat-baseline` (`eca9a3b`) |
| **dlaczego osobny plik** | CV-3c (decyzja właściciela 44 (5)) przeniósł punkt wraku z punktu środkowego starcia na pozycję okrętu w chwili śmierci (`DeepSpaceCombatSystem._deathPointOf`). Jedyna różnica wobec starych nagrań: współrzędna x wiersza wraku — 224,4 px (pozycja rajdera, 2 AU + NEAR) zamiast 222,2 px (punkt środkowy). Zdarzenia, stany, misje, paliwo i stempel układu — co do bajtu. Pilnuje tego świadek T0 (podstawienie starej x daje co do bajtu stare nagranie M1 / eca9a3b) |
| **kiedy nagrywać ponownie** | gdy świadomie zmienia się punkt wraku albo mechanika rund starcia; na drzewie z tą zmianą (`--record-cv3c`) |
