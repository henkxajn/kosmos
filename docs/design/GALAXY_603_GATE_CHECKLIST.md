# GALAXY — Finding 603: bramka właściciela (K0–K5 + 3 do obejrzenia)

Napisana PRZED bramką. Każde polecenie uruchomione na żywym silniku (Chrome bez okna, viewport 1600×1041, kopia zapisu ZF120) 2026-11-06, na drzewie z naprawą; liczby niżej to odczyty z tego przebiegu. Wszystkie polecenia bez cudzysłowów.

**Wynik bramki:** właściciel 2026-11-07, **K0–K5 + A/B/C PASS** (A/B/C = trzy pozycje z sekcji Do obejrzenia).
- **Klient EN:** bramka szła w kliencie angielskim, a teksty oczekiwane niżej są po polsku, bo w tym kliencie sprawdzał je walidator. W EN te same komunikaty czyta się po angielsku (`Anulowano rozkaz` = `Order cancelled`).
- **K0, żywy slot:** `patients: []`.
- **K1 dwa razy:** pierwszy przebieg wyszedł przez pomyłkę jako kontrola bez rozkazu. Drugi, z `engage/active`: `lastOrder: engage/cancelled/warp_departed`, przylot `orbiting` w `sys_061`, czyli cel inny niż Shaula z opisu K1.
- **K3:** skok w trakcie starcia dał dokładnie to, co opisuje Finding 607.
- **Nowe, ⚪ 608:** po najechaniu rozwinięte nazwy statków szyny przykrywa rozwinięcie informacji o gwieździe (ten sam obszar kotwicy). Polerka G5, razem z 604 i 605.

**Co sprawdzamy:** statek z żywym rozkazem wysłany skokiem dolatuje na ETA, rozkaz zamyka się przy starcie skoku, a odrzucony skok niczego nie rusza. Rozkaz floty i ścieżka AI bez zmian.

**Zapis:** ZF120 = `Downloads/kosmos_Zjednoczona_Federacja_r120_v101 (3).json`. Gramy na kopii: pomocniki dodają rajdery i tracą statek w K3, a autozapis wnosi to do slotu.

**Pomocniki (`KOSMOS.debug`), domyślnie zaznaczony statek:**
- `probe603()` odczyt: stan, układ, misja, rozkaz żywy (`order`) i ostatni (`lastOrder`), trasa, rdzenie, Rejestr, płyta (`plate`), starcie, `canOrder`; `patients` = statki w stanie z Findingu 603. Bez zaznaczenia czyta ostatni odczytany statek.
- `probe603Rig()` zaznacza okręt solo ze skokiem w układzie z wrogiem i ustawia tam kamerę · `probe603Engage()` · `probe603Patrol()` · `probe603Cores(x)` rdzenie = x.
- `probe603Warp(n)` ten sam rozkaz co klik wpisu menu, do najbliższego układu o trasie n skoków; `unchanged` = statek co do bitu.
- `probe603Enemy()` rajder 5 AU od statku · `probe603Battle()` zbrojny rajder 0,1 AU od statku + engage + start starcia. Oba pauzują grę.
- `probe603AI()` para AI rusza na dom gracza; kolejne wywołania tylko czytają · `probe603Rail()` liczba statków przy gwiazdach szyny.

⚠ **Popupy spoza testu.** ZF120 przy przyspieszonym czasie otwiera własne zdarzenia (bank danych, napięcie frakcji, termin wycofania). Pauzują grę; zamknij `[ENTER]` i czas rusza dalej. To nie są popupy skoku.

⚠ **Czas.** `KOSMOS.timeSystem.setMultiplier(4)` = miesiąc/s, `KOSMOS.timeSystem.play()` rusza, `KOSMOS.timeSystem.pause()` zatrzymuje.

---

## K0 — wczytanie i przegląd żywego slotu
**Ustaw:** ekran tytułowy → `Kontynuuj` Twoją bieżącą grę.
**Polecenie:** `KOSMOS.debug.probe603()`
**Wynik:** `patients: []`. Przy pustym zaznaczeniu także `ok: false`, `reason: no_vessel`. ⚠ Tego slotu walidator nie widział. Wpis na liście `patients` = statek z zapisu sprzed naprawy: naprawa go nie leczy, więc przerwij i daj znać.
**Ustaw dalej:** ekran tytułowy → Wczytaj z pliku → ZF120. Klawisz Home. `KOSMOS.timeSystem.pause()`
**Polecenie:** `KOSMOS.debug.probe603()`
**Wynik:** `patients: []`. W świecie: rok ok. 120,5 · 46 statków · dwie floty · konsola bez błędów.

## K1 — engage + skok z menu gwiazdy: dolatuje na ETA
**Ustaw:** `KOSMOS.debug.probe603Rig()`, potem `KOSMOS.debug.probe603Engage()`
**Wynik:** Rig: `ship: USS Saratoga`, `system: Thuban [sys_061]`, `cores: 1.142`, `enemy: Dostawca`, `enemyAU: 23.83`. Engage: `ok: true`, `order: engage/active`.
**Oko:** klawisz G. PPM na Shaula (na północ od Thuban), wpis `🌀 Skok do Shaula — Skoki: 1 · ETA: 0.3 lat · Rdzenie: 0.7 / 1.1`. Kliknij.
**Polecenie:** `KOSMOS.debug.probe603()`
**Wynik:** `state: in_transit`, `system: null`, `mission: interstellar_jump/warp_transit`, `to: sys_020`, `arrivalYear` = rok + 0,305, `order: null`, `lastOrder: engage/cancelled/warp_departed`, `inOrderIndex: false`, `route: sys_061>sys_020 leg 0`, `cores: 0.456`, `registry: [fleetPicture.state.inTransit, fleetPicture.activity.warp, <ETA>]`, `plate: [-12.75, -9.66, sys_020]`, `canOrder: in_transit`, `patients: []`.
**Oko:** Dziennik, od najstarszej: `Anulowano rozkaz: USS Saratoga (Atak)` · `🚀 USS Saratoga → Shaula (⛏ Skok warp)` · `USS Saratoga: skok do Shaula (1 przeskoków)`. Jedna linia anulowania. Jeden toast: `Rozkaz skoku wydany`.
**Ustaw:** `KOSMOS.timeSystem.setMultiplier(4)` · `KOSMOS.timeSystem.play()`
**Polecenie w połowie lotu:** `KOSMOS.debug.probe603()`
**Wynik:** dalej `in_transit`, `galProgress` ok. 0,5, `plate` inne niż przy starcie (odczyt: `[-12.44, -10.67]`), ETA w przyszłości. **Oko:** znacznik jedzie po linii do Shaula.
**Polecenie po ETA:** `KOSMOS.debug.probe603()`
**Wynik:** `state: orbiting`, `system: sys_020`, `mission: interstellar_jump/in_system`, `route: null`, `plate: at_star`, `canOrder: ok`. **Oko:** jeden popup przylotu (rok ok. 120,81). Zamknij `[ENTER]`.

## K2 — odrzucony skok: rozkaz żyje, rdzenie bez zmian
**Ustaw:** `KOSMOS.debug.probe603Enemy()` · `KOSMOS.debug.probe603Engage()` · `KOSMOS.debug.probe603Cores(0.1)`
**Wynik:** Enemy: `enemy: Rajder`, `armed: true`, `enemyAU: 5`. Engage: `order: engage/active`.
**Polecenie:** `KOSMOS.debug.probe603Warp(1)`
**Wynik:** `ok: false`, `reason: insufficient_warp_fuel`, `text: Nie można wydać rozkazu — ✗ Za mało rdzeni warp`, `target: Alzirr [sys_044]`, `unchanged: true`.
**Oko:** PPM na Thuban: `🌀 Skok do Thuban — Skoki: 1 · ETA: 0.3 lat · Rdzenie: 0.7 / 0.1 ✗ Za mało rdzeni warp`. Esc.
**Polecenie:** `KOSMOS.debug.probe603()`
**Wynik:** `order: engage/active`, `system: sys_020`, `cores: 0.1`. Po `KOSMOS.timeSystem.setMultiplier(2)` · `KOSMOS.timeSystem.play()` · chwili · `KOSMOS.timeSystem.pause()` dalej `engage/active`, a `xy` inne: pościg trwa.

## K3 — patrol odmawia; skok w trakcie starcia
**Ustaw:** `KOSMOS.debug.probe603Patrol()` · `KOSMOS.debug.probe603Cores(5)`
**Polecenie:** `KOSMOS.debug.probe603Warp(1)`
**Wynik:** `ok: false`, `reason: in_transit`, `text: Nie można wydać rozkazu — ✗ Statek w tranzycie`, `unchanged: true`. `probe603()`: `order: patrol/active`.
**Ustaw:** `KOSMOS.movementOrderSystem.cancelOrder(KOSMOS.uiManager.getSelectedVesselId())` · `KOSMOS.debug.probe603Battle()`
**Wynik:** `true`, potem `ok: true`, `enemy: Rajder`, `armed: true`, `encounter: encounter_…`.
**Polecenie:** `KOSMOS.debug.probe603Warp(1)`, potem `KOSMOS.debug.probe603()`
**Wynik:** Warp: `ok: true`, `text: Rozkaz skoku wydany`. Odczyt: `in_transit`, `system: null`, `mission: interstellar_jump/warp_transit`, `order: engage/cancelled` (zwolnienie czeka na koniec starcia), `lastOrder: engage/cancelled/warp_departed`, `encounter: encounter_…`.
**Ustaw:** `KOSMOS.timeSystem.setMultiplier(2)` · `KOSMOS.timeSystem.play()`
**Polecenie po chwili:** `KOSMOS.debug.probe603()`
**Wynik i oko:** walka nie puszcza statku. `status: destroyed`, `wreck: true`, `system: sys_home`, `route: sys_020>sys_044 leg 0`, cores zapłacone. W Dzienniku `⚔ Bitwa w głębokim kosmosie (Shaula): Gracz vs Konsorcjum Siódmego Kręgu. Zwycięzca: Konsorcjum…`, zaznaczenie znika.
⚠ **To nie jest skutek naprawy.** Ten sam wynik daje skok bez rozkazu (ścieżka, której strażnik nie dotyka). Bez skoku ta walka też kończy się wrakiem, tyle że z `system` układu walki. Różnice po skoku: stempel `sys_home`, stara trasa, zapłacone rdzenie. Osobny Finding 607 🟠, własny krok, następny (decyzja właściciela 2026-11-07). Walki wygranej walidator nie sprawdził.

## K4 — skok floty bez zmian (jak G4 K2)
**Ustaw:** `KOSMOS.debug.fleetWarpRig(1)`
**Polecenie:** `KOSMOS.debug.fleetWarpIssue(2)`, potem `KOSMOS.debug.fleetWarpState()`
**Wynik:** Issue: `ok: true`, `target: Suhail [sys_048]`, `route: Kepler-4799 > Megrez > Suhail`, `etaYears: 1.708`, `binding: G4-wiazacy`, `text: Rozkaz skoku wydany`. State: `order.type: warp`, `order.hops: sys_home>sys_023>sys_048`; każdy członek `in_transit`, `phase: warp_transit`, `to: sys_023`, `leg: 1/2`, `speedLY: 6`, `warpSpeed: 6`; `sameHops: true`, `sameArrival: true`; rdzenie 9,19 / 4,19 / 9,19; `line: Skok warp → ??? · ETA: 1.7 lat`; `logFleet` = jedna linia `G4: flota skacze do ??? (skoki: 2)`; `logMembers` puste.

## K5 — uderzenie AI między układami
**Polecenie:** `KOSMOS.debug.fleetWarpAI()`
**Wynik (jak G4 K9):** `empire: emp_001`, `on.ok: true`, `on.composite: true`, `on.sameAngle: true`; obaj: `type: interstellar_jump`, `to: sys_home`, `warpSpeed: 18`, `pending: attack`, `group: g4_k9`, `route: null`, `warpGroupId: null`; `sameAsOff: true`.
**Polecenie:** `KOSMOS.debug.probe603AI()`
**Wynik:** `issued: true`, `composite: true`, `arrived: false`; obaj `in_transit`, `mission: interstellar_jump/warp_transit`, `arrivalYear` = rok + 0,91, `pending: attack`, `order: null`.
**Ustaw:** `KOSMOS.timeSystem.setMultiplier(4)` · `KOSMOS.timeSystem.play()`, do roku po `arrivalYear`, potem `KOSMOS.timeSystem.pause()`.
**Polecenie:** `KOSMOS.debug.probe603AI()`
**Wynik:** `arrived: true`, `target: sys_home`; obaj `system: sys_home`, `mission: attack/null`, `pending: null`, `order: attack/active`. ⚠ Para leci na Twój dom (dolot ok. 4,5 roku), więc to ostatni krok na tej kopii, który przyspiesza czas.

---

## Do obejrzenia (przeniesione z G4)
- **Dowództwo:** flota z K4 w skoku ma status skoku, nie „bezczynna”. Dowództwo → Taktyka systemu: wiersze `G4-…` z `Tranzyt` · `W locie` · `Skok warp`, ETA 123. Panel floty: `Skok warp → ??? · ETA: …`.
- **Szyna:** `KOSMOS.debug.probe603Rail()`, gdy flota z K4 jest w drodze: `Kepler-4799`, `ships: 4`. Najedź na gwiazdę: 3 nazwy (`Dostawca II`, `Fracht III`, `Smok II`) i `+1`. Zwinięta: 1 statek sam znacznik, 2 i więcej `+N`.
- **Picker `[ Wyślij ▼ ]`:** `KOSMOS.debug.fleetWarpRig(1)`, klik Diphda, `[ Wyślij ▼ ]`. Nagłówek `WYBIERZ STATEK → ???`, potem `FLOTY`: `Flota Wojenna II · ×4` (`Skoki: 1 · ETA: 0.3 lat · Rdzenie: 0.7 / 2.5 (Żmija)`) · `G4 · ×3` (`Skoki: 3 · ETA: 3.6 lat · Rdzenie: 2.7 / 5.0 (G4-wiazacy)`) · przyciemniona `Flota Wojenna I · ×3` (`Żaden statek nie ruszył · USS Furia (Inny układ)`), niżej `STATKI [21]`. Klik wiersza `G4` startuje skok i zamyka picker.

## Granice walidacji
- Rozkaz `engage` idzie przez `probe603Engage()`, ze specyfikacją PPM, nie gestem na mapie.
- Wpisy menu z K1–K2 i lista pickera przeczytane w grze; wiersza `G4` w pickerze walidator nie kliknął (pokrywa go keeper `galaxy_fleet_warp_ui`).
- „Znacznik jedzie” i „jeden popup przylotu” walidator wyprowadził z odczytu `plate` i z pauz gry, bez oglądania. To sprawdza oko.
- Twój żywy slot (K0) i walka wygrana w K3 nie były sprawdzone.
