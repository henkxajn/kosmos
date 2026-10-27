# T4-fleet-panels-baseline — migawka dawnych paneli floty i grupy przed usunięciem ich rysunku

| pole | wartość |
|---|---|
| **rodzaj** | migawka WYROCZNI usuniętej powierzchni (NIE zapis gry, NIE ślad symulacji) — strefy kliku `{ type, data }` bez geometrii + dyspozycja kliku |
| **commit nagrania** | `e873127` (docs(TABS T6) — ostatni commit z rysunkiem `FleetCommandPanel` / `FleetGroupPanel`) — REALNY `git worktree --detach` (pole `recordedFrom`) |
| **nagrał** | `node src/testing/smoke/fleet_panel_hud_smoke.mjs --record` z `T4_SNAPSHOT_COMMIT=e873127` (ten sam plik keepera, skopiowany do drzewa `e873127`) |
| **data** | 2026-10-27 |
| **źródło** | `FleetCommandPanel.draw` / `FleetGroupPanel.draw` (1280×720, wszystkie strony; bez stref stronicowania `pageUp` / `pageDown` i tła `bg`) i `handleClick` w środek każdej strefy (szpieg `_onHit`) |
| **zawartość** | `fleet` — 7 stanów floty (`FLEET_STATES`: w doku, w przestrzeni, mieszana z walką, pusta, inne układy, duża, zwinięta) — 112 stref, 16 typów · `group` — 8 stanów grupy (`GROUP_STATES`) — 94 strefy, 11 typów · `clicks` — 6 stanów F2 (`f_mixed`, `f_docked`, `f_other`, `g_docked`, `g_space`, `g_combat`) — 90 wywołań `_onHit` |
| **normalizacja** | brak (dane stref paneli to liczby i napisy); porównanie w keeperze przez `FleetPanelHudLogic.zoneKey` BIEŻĄCEGO modułu po obu stronach |
| **odbiorca** | `fleet_panel_hud_smoke` F1 (zbiór stref ON = OFF, pokrycie typów), F2 (każdy chip → ten sam handler), F3 (stany nieaktywne), F17 („Odwrót” grupy tylko w starciu), F0g (schemat: stany ≡ `FLEET_STATES` / `GROUP_STATES`, `recordedFrom`) |
| **decyzja** | REFORMA ZAKŁADEK T4, pytanie właściciela Q4 „Zamrozić migawkę” (wzór Finding 273) |

⚠ Rysunku dawnych paneli w kodzie już nie ma (T4-3; zostały stan, słuchacze i `_onHit` — cele chipów panelu T6) — migawki
**nie da się nagrać ponownie** z bieżącego drzewa. Świadoma zmiana zbioru akcji paneli floty / grupy T6 wymaga zmiany migawki
ręcznie (z uzasadnieniem i nowym wpisem tutaj). Zmiana konfiguracji stanów keepera pada na F0g (schemat), nie na F1.
