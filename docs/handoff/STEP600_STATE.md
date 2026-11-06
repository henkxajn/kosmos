# Step 600 — stan (2026-11-06, baza `f1a8dfd`, status: committed — kod `0800372`, dokumentacja w commicie `docs(600)`)

**Cel:** stempel `galaxyData.systems[].empireId` ma jednego pisarza, `TerritoryService`.
**W commicie `fix(600)`:** `src/systems/TerritoryService.js`, `ColonyManager.js`, `EmpireRegistry.js`, `IntelSystem.js` (komentarz),
`src/generators/EmpireGenerator.js`, `src/scenes/GameScene.js`, keepery `sb1_fleet_tuning_smoke.mjs`,
`w3_conquest_persists_smoke.mjs`, `invasion_player_capture_smoke.mjs`, NOWY `system_owner_stamp_smoke.mjs`.
Poza nim: `.claude/settings.local.json` i cudze pliki nieśledzone.

**Decyzje D1–D3 zastosowane.** D1: A2/B2 pinują „stempel == kanon”. D2: wczesny `return 0` w `syncOwnerStamps` + strażnik
w `_ensure` (nie w `_invalidate`: `_ensure` obejmuje zdarzenie i odczyt; odczyt bez rejestru czyścił indeks już na `f1a8dfd`).
D3: komentarz w §d.

**Keeper:** 39/39 po D1–D3, po poprawkach jałowych pinów **45/45** (39 + 2 C1/C2 niezależne od sondy + 4 F3/F4).
**Fail-first `f1a8dfd`:** 17 pass / 28 fail: (i) brak API 20, (ii) merytoryczne 8 (A1, A2, B1, B2, C1, C2, F4 ×2).
A2/B2 w pierwszej wersji były zielone na starym kodzie, dlatego dostały krok ponownego wyprowadzenia stempla, a B2 odwrócone role.
**Mutacje (w worktree, usunięty):** 7/8 zabite; przeżył M6, bo strażnik w `_writeOwnerStamps` jest nadmiarowy. Zostawiony: to jedyne miejsce zapisu.

**Decyzja A9 (właściciel, 2026-11-06):** `invasion_player_capture_smoke` pinował dawnego pisarza, więc świat keepera montuje
teraz `TerritoryService` (asercje bez zmian, 25/25).
**Sweep po A9:** 364/364, 0 FAIL, 29 advisory. `check-i18n` PASS (pl = en = 3413).

**W grze (ZF120.json z galaxy-g2, 2 przebiegi):** `KOSMOS.debug.systemOwnerMismatches()` = `[]` po wczytaniu i po chwili biegu;
Castor (`sys_040`) `emp_test_enemy` w pliku → `emp_002`; 0 wyjątków, 0 `console.error`; 32 × 404 PNG = notatka O16 (`GALAXY_PLAN.md` §7).
Kontrola przyrządu: ręcznie zatruty stempel sonda zgłasza i nie leczy, a `syncOwnerStamps` go zdejmuje.

**Wpis do rejestru:** #600 ✅, #601 ⚪ („pierwsza kolonia wygrywa”, świadomie bez zmian). Pierwszy wolny numer: 602.
**Dalej:** nic w tym kroku. G3 nierozpoczęty.
