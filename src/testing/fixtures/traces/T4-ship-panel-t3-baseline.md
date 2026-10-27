# T4-ship-panel-t3-baseline — migawka dawnego panelu statku nad mapą (T3) przed jego usunięciem

| pole | wartość |
|---|---|
| **rodzaj** | migawka WYROCZNI usuniętej powierzchni (NIE zapis gry, NIE ślad symulacji) — strefy kliku `{ type, data }` bez geometrii + dyspozycja kliku |
| **commit nagrania** | `e873127` (docs(TABS T6) — ostatni commit z panelem T3) — REALNY `git worktree --detach` (pole `recordedFrom`) |
| **nagrał** | `node src/testing/smoke/ship_panel_hud_smoke.mjs --record` z `T4_SNAPSHOT_COMMIT=e873127` (ten sam plik keepera, skopiowany do drzewa `e873127`) |
| **data** | 2026-10-27 |
| **źródło** | `FleetManagerOverlay.drawVesselPanel(ctx, 0, 0, 300, 6000, { compact: true })` (wysokość bez przycinania — cała treść) i `handleVesselPanelClick` w środek każdej strefy (szpieg `_handleHit` / `_handleVesselPanelFooter`) |
| **zawartość** | `states` — 20 stanów statku keepera (`STATES`: hangar, dok bez stoczni, koloniści, orbita, lot, walka, obca orbita, przylot międzygwiezdny, rekon obcy, pętla, rezerwa, mobilizacja, rally ×2, pula, unieruchomiony, blokada, konfigurator ×3) — 209 stref, 31 typów · `clicks` — 209 dyspozycji (`via: hit/footer`) · `variants` — 3 światy ad hoc z H3 (obca orbita z ciałem przeanalizowanym i niezbadanym, hangar bez „rocketry”, potwierdzenie bez paliwa) |
| **normalizacja** | `data.vessel` (obiekt statku) → jego id — ta sama co `ShipPanelHudLogic.zoneKey`; porównanie w keeperze przez `zoneKey` BIEŻĄCEGO modułu po obu stronach |
| **odbiorca** | `ship_panel_hud_smoke` H1 (zbiór stref ON = OFF), H2 (każdy chip → ten sam handler), H3 (stany nieaktywne), H0g (schemat: stany ≡ `STATES`, `recordedFrom`) |
| **decyzja** | REFORMA ZAKŁADEK T4, pytanie właściciela Q4 „Zamrozić migawkę” (wzór Finding 273) |

⚠ Panelu T3 w kodzie już nie ma (T4-3) — migawki **nie da się nagrać ponownie** z bieżącego drzewa. Świadoma zmiana zbioru akcji
panelu statku T5 wymaga zmiany migawki ręcznie (z uzasadnieniem i nowym wpisem tutaj) albo nagrania na drzewie `e873127`
z keeperem, którego `STATES` opisuje nowy stan. Zmiana konfiguracji stanów keepera pada na H0g (schemat), nie na H1.
