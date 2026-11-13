# CVZ-orbital-results-baseline.json

Ślad wykonania (nie zapis gry) — sub-konwencja `fixtures/traces/` (`fixtures/README.md`).

- **Co:** wynik (`result`) i rekord (`gameState.battles`) bitwy orbitalnej `EnemyAttackHandler` w świecie od zera —
  wojna (`war`) i potyczka bez wojny (`skirm`), procesy potomne keepera `cv_orbital_results_smoke` (`--child war-off`,
  `--child skirm-off`).
- **Gdzie nagrane:** `36ddfb4` (przed CV-Z), worktree tylko do odczytu; `--child war-on` dał ten sam wynik i rekord co do
  JSON (różni się wyłącznie kluczem `fx` zdarzenia).
- **Kto czyta:** `cv_orbital_results_smoke` R2 — po CV-Z (flaga `cvOrbital` zdjęta, powtórka na stałe) wynik i rekord muszą być
  co do JSON identyczne z nagraniem (prezentacja nie dotyka walki), `fx` tylko na zdarzeniu.
