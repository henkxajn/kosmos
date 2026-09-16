# F273-patrol-trace-baseline — ślad symulacji patrolu/eskorty SPRZED naprawy Findingu 273

| pole | wartość |
|---|---|
| **rodzaj** | ślad wykonania (NIE zapis gry) — `x, y` [px] + `patrolWaypointIndex` per tik |
| **commit nagrania** | `b52f724` (docs(267)) — REALNY `git worktree --detach`, checkout CRLF (`autocrlf=true`) |
| **nagrał** | `node src/testing/smoke/patrol_render_sync_smoke.mjs --record` z `F273_BASELINE_COMMIT=b52f724` |
| **data** | 2026-09-15 |
| **schemat** | `DT = 0.01` roku GRY/tik · `N = 200` tików · `AU_TO_PX = 110` · `CIV_TIME_SCALE = 12` |
| **statki** | `pMan` patrol manualny `[(32,0),(36,0)]` AU ze startu (30,0) · `pPoi` patrol POI `[(3,5),(5,5)]` ze startu (2,5) · `esc` eskorta lidera `lead` (moveToPoint (10,0)→(14,0)) · `ctl` kontrola moveToPoint (20,0)→(24,0); wszystkie `hull_small`, `speedAU 1.0` |
| **emisje przy nagraniu** | patrol 0/200 · POI 0/200 · eskorta 0/200 · lider 200/200 · kontrola 200/200 (to jest DEFEKT 273 — dowód, że baseline pochodzi sprzed naprawy; keeper T0 to sprawdza) |
| **odbiorca** | `patrol_render_sync_smoke` T2/T3/T4 — pin „brak podwójnego całkowania": ślad po naprawie ma być IDENTYCZNY (`===`) |

⚠ Baseline jest ważny dla **tej** kalibracji ruchu (`speedAU`, `THREAT_RADIUS_PX`, `AU_TO_PX`, `DT`).
Świadoma zmiana fizyki patrolu/eskorty w MOS **musi** nagrać go ponownie (na drzewie SPRZED tej zmiany,
z nowym hashem tutaj) — inaczej keeper zgłosi regresję, która nią nie jest. Zmiana konfiguracji
(DT/N/jednostki) pada już na T0 (schemat), nie na T2.
