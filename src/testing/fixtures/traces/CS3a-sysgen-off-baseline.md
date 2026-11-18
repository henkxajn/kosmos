# CS3a-sysgen-off-baseline — generator układów sprzed D-CS-17 (flaga `seededSystems` OFF)

| pole | wartość |
|---|---|
| **rodzaj** | ślad wykonania (NIE zapis gry): SHA-256 kanonicznego JSON-a ciał (gwiazda, planety, księżyce, planetoidy; klucze posortowane; pole `surfaceSeed` pominięte — nadaje je wołający, nie generator) + liczby `peekCountsForStar` |
| **commit nagrania** | `bf5a08d` (HEAD przed CS-3a; `recordedFrom` w pliku mówi to samo) |
| **nagrał** | `CS3A_BASELINE_COMMIT=bf5a08d node src/testing/smoke/colony_sphere_seeds_smoke.mjs --record <plik>` na realnym `git worktree --detach bf5a08d` (keeper i `src/testing/headless/SysGenDigest.mjs` skopiowane do worktree); dwa nagrania bajt w bajt identyczne (SHA-256 pliku `6b21b1e2…`) |
| **data** | 2026-11-18 |
| **schemat** | `SysGenDigest.sysGenDigest()`: dla 5 gwiazd (`sys_001` G, `sys_017` K, `sys_037` M, `sys_052` F, `sys_071` A) `EntityManager.clear()` → `generateForStar(gs)` i osobno `peekCountsForStar(gs)`; dla 3 ziaren harnessu (`cs3a-home-1…3`) `EntityManager.clear()` → `reseed(s)` → `generateCivScenario()`. `FEATURES.smallBodies = false` (sprawdzane przed porównaniem) |
| **odbiorca** | `colony_sphere_seeds_smoke` S2 — przy `seededSystems` OFF wynik musi być bajt w bajt jak tu (także gdy wołający podaje `galaxySeed`) |
| **dlaczego** | CLAUDE.md: flaga OFF = zachowanie sprzed kroku bit w bit. D-CS-17 zmienia ziarno strumienia RNG obcych układów i układu domowego — ten plik dowodzi, że ścieżka OFF jej nie dotyka |
| **kiedy nagrywać ponownie** | gdy świadomie zmienia się generator ciał (SystemGenerator / DepositSystem / ElementsData) — na drzewie z tą zmianą; NIGDY po to, żeby zazielenić S2 po zmianie ziarna. Przy CS-Z (flaga permanentna, ścieżka OFF usunięta) ślad i S2 odchodzą razem |
