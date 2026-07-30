# src/testing/smoke — headless smoke tests (promoted)

Node ESM smoke tests promowane z katalogu głównego repo, trackowane jako regresja.
Testują REALNĄ logikę systemów (bez canvas / DOM). **Prefix `tmp_` = scratch (root, gitignored);
promowane keepery NIE mają prefiksu** (Slice 5D zdjął `tmp_` z 49 keeperów, `cd652f9`).

## Uruchamianie

```
node src/testing/smoke/<plik>.mjs        # pojedynczy
node src/testing/smoke/run-all.mjs        # cały sweep (crash-safe: exit≠0 gdy KTÓRAKOLWIEK suita padnie)
```

Preferuj `run-all.mjs` nad bash-for-loop — pętla `for f in *.mjs; do node "$f"; done` CICHO łyka
crash w środku (agreguje tylko ostatni exit code). Każdy plik drukuje własne `N PASS / M FAIL` i
zwraca kod ≠0 przy błędzie; runner agreguje exit codes.

## Konwencje

- **Nazewnictwo**: keepery BEZ prefiksu (`foo_smoke.mjs`); `tmp_*` zarezerwowane dla scratchu w root.
- **Importy**: relatywne do `src/` przez `../../` (np. `../../systems/SaveMigration.js`) —
  spójnie z `src/testing/headless/`.
- **Piny wersji save**: NIE hardkoduj numeru bieżącej wersji. Wzorzec:
  - „funkcja wprowadzona w wersji N" → `assert(CURRENT_VERSION >= N)`
  - „migracja dochodzi do szczytu" → `assert(migrated.version === CURRENT_VERSION)`
  - Wyjątek: test celowo weryfikujący zachowanie DLA konkretnej wersji historycznej
    (np. `importSave({version:85})` → zostaje 85) — literał zostaje.

## Uwaga — smokes NIE promowane (dług, zostają w root, untracked)

Kilka starych smoke'ów (S3.0b / S3.2) testuje ZASTĄPIONE zachowanie z późniejszych
reform (krzywa `fuelMult` S3.0b-S2, model `fuelType` dual-tank, kolejka badań AI) —
to NIE są piny wersji, więc świadomie ich tu nie przeniesiono:
`tmp_s3_0a_a_smoke`, `tmp_s3_0b_s1_chain_v81_v82_smoke`, `tmp_s3_0b_s1b_readers_smoke`,
`tmp_s3_2_s2_smoke`. Wymagają decyzji: aktualizacja asercji do bieżącej krzywej vs retire.
