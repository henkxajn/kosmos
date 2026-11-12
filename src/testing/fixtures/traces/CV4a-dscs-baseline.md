# CV4a-dscs-baseline — skróty DSCS sprzed ładunku FX CV-4a (D-CV-8)

| pole | wartość |
|---|---|
| **rodzaj** | ślad wykonania (NIE zapis gry): skróty SHA-256 JSON-a (id starcia / bitwy zastąpione znacznikami) — `round.events` każdej rundy, `DeepSpaceCombatSystem.serialize()` po rundach 3 i 10, rekord `battle:resolved` |
| **commit nagrania** | `890e275` (drzewo sprzed jedynej edycji DSCS w CV-4a — pól ładunku `combat:roundFx`; `recordedFrom` w pliku mówi to samo) |
| **nagrał** | `CV4A_BASELINE_COMMIT=890e275 node src/testing/smoke/cv_weapons_ledger_smoke.mjs --record src/testing/fixtures/traces/CV4a-dscs-baseline.json`; dwa nagrania dały ten sam SHA-256 pliku (`3ac6b572…`) |
| **data** | 2026-11-12 |
| **schemat** | bitwy stagera `cvBattle` 10 na 10 w uprzęży keepera bez renderera: prawdziwy łańcuch `TimeSystem` → `time:tick` → `VesselManager` → `ProximitySystem` / `DeepSpaceCombatSystem` (rundy na atrapie zegara `performance.now`, klatki po 16 ms), świat od nowa (`setNextVesselId(1)`), `reseed('cv4a-battle')` i `reseedRendererRandom()` przed każdą bitwą |
| **scenariusze** | `seed1` (`{ seed: 1 }`, 31 rund) · `seed2random` (`{ seed: 2, random: 1 }`, 26 rund) |
| **odbiorca** | `cv_weapons_ledger_smoke` W0 — `round.events`, `serialize()` i rekord bitwy z ładunkiem FX (`fcCombatFx` ON) muszą być bajt w bajt jak tu; W0-d — ładunek budowany == bez ładunku |
| **dlaczego** | D-CV-8: pola ładunku (`round`, `seed`, `weapon`, `side`, `dmg`, `hpAfter`, `shieldAfter`, `killed`) są wyłącznie na zdarzeniu `combat:roundFx`, nigdy na `round.events` — ten plik dowodzi, że stan walki, zapis i rekord się nie zmieniły |
| **kiedy nagrywać ponownie** | gdy świadomie zmienia się mechanika walki DSCS (rundy, ogień, obrażenia, zapis starcia) — na drzewie z tą zmianą; NIGDY po to, żeby zazielenić W0 po zmianie warstwy wizualnej |
