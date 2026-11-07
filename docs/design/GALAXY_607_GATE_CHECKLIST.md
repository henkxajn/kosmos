# GALAXY — Finding 607: bramka właściciela (K0–K3)

Napisana PRZED bramką. Każde polecenie uruchomione na żywym silniku (Chrome bez okna, viewport 1600×1041, kopia zapisu ZF120) 2026-11-07, na drzewie z naprawą, w tej kolejności; liczby niżej to odczyty z tego przebiegu. Wszystkie polecenia bez cudzysłowów.

**Wynik bramki:** właściciel 2026-11-07, **K0–K3 PASS**.
- **Klient EN:** bramka szła w kliencie angielskim, a teksty oczekiwane niżej są po polsku, bo w tym kliencie sprawdzał je walidator. W EN te same komunikaty czyta się po angielsku (`Statek bierze udział w bitwie` = `Vessel is in combat`).

**Co sprawdzamy:** statek gracza w aktywnym starciu nie skacze: odmowa z powodem, nic się nie zmienia, rdzenie zostają. Po końcu starcia ten sam statek skacze. Flota z jednym członkiem w starciu odmawia i nazywa go. Ścieżka AI bez zmian.

**Zapis:** ZF120 = `Downloads/kosmos_Zjednoczona_Federacja_r120_v101 (3).json`. Gramy na kopii: pomocniki dodają rajdery, a autozapis wnosi to do slotu.

**Pomocniki (`KOSMOS.debug`), domyślnie zaznaczony statek:**
- `probe603()` odczyt: stan, układ, misja, rozkaz żywy (`order`) i ostatni (`lastOrder`), trasa, rdzenie, starcie (`encounter`), `canOrder`.
- `probe603Rig()` zaznacza okręt solo ze skokiem w układzie z wrogiem i ustawia tam kamerę.
- `probe603Battle(1)` zbrojny rajder na 1 HP, 0,1 AU od statku + engage + start starcia, gra na pauzie. Bez argumentu rajder w pełni sił.
- `probe603Warp(n)` ten sam rozkaz co klik wpisu menu, do najbliższego układu o trasie n skoków; `unchanged` = statek co do bitu. Bez zaznaczenia bierze ostatni odczytany statek.
- `fleetWarpRig(1)` flota `G4`: 3 fregaty przy domu · `fleetWarpBattle(i)` członek i (od 0) w starciu: odsunięty od reszty, zbrojny rajder obok, gra na pauzie · `fleetWarpIssue(n)` ten sam rozkaz co klik wpisu menu; `unchanged` = członkowie i rekord co do bitu · `fleetWarpState()` odczyt floty · `fleetWarpAI()` para okrętów AI.

⚠ **Popupy spoza testu.** ZF120 przy przyspieszonym czasie otwiera własne zdarzenia (bank danych, napięcie frakcji, termin wycofania). Pauzują grę; zamknij `[ENTER]` i czas rusza dalej.

⚠ **Czas.** `KOSMOS.timeSystem.setMultiplier(4)` = miesiąc/s, `KOSMOS.timeSystem.play()` rusza, `KOSMOS.timeSystem.pause()` zatrzymuje.

---

## K0 — skok w starciu: odmowa
**Ustaw:** ekran tytułowy → Wczytaj z pliku → ZF120. Klawisz Home. `KOSMOS.timeSystem.pause()`
**Ustaw:** `KOSMOS.debug.probe603Rig()`
**Wynik:** `ship: USS Saratoga`, `system: Thuban [sys_061]`, `cores: 1.142`.
**Ustaw:** `KOSMOS.debug.probe603Battle(1)`
**Wynik:** `ok: true`, `enemy: Rajder`, `armed: true`, `encounter: encounter_…`. Rajder na 1 HP, żeby K1 miał czym skoczyć: z rajderem w pełni sił (`probe603Battle()`) K0 czyta się tak samo, ale tę walkę statek przegrywa (K3 bramki 603).
**Polecenie:** `KOSMOS.debug.probe603Warp(1)`
**Wynik:** `ok: false`, `reason: in_combat`, `text: Nie można wydać rozkazu — Statek bierze udział w bitwie`, `target: Castor [sys_040]`, `unchanged: true`.
**Polecenie:** `KOSMOS.debug.probe603()`
**Wynik:** `state: orbiting`, `system: sys_061`, `mission: null`, `order: engage/active`, `cores: 1.142`, `encounter: encounter_…`, `canOrder: {ok: false, reason: in_combat}`.
**Oko:** klawisz G. PPM na Shaula (na północ od Thuban): wpis `🌀 Skok do Shaula — Skoki: 1 · ETA: 0.3 lat · Rdzenie: 0.7 / 1.1`, pod nim `Statek bierze udział w bitwie`. Klik wpisu nie wydaje rozkazu, menu się zamyka: `KOSMOS.debug.probe603()` bez zmian. Klawisz G.

## K1 — koniec starcia: ten sam statek skacze
**Ustaw:** `KOSMOS.timeSystem.setMultiplier(2)` · `KOSMOS.timeSystem.play()`
**Oko:** rajder ginie w pierwszych rundach, baner wyniku pauzuje grę. Zamknij `[ENTER]`. `KOSMOS.timeSystem.pause()`
**Polecenie:** `KOSMOS.debug.probe603()`
**Wynik:** `order: null`, `lastOrder: engage/blocked/target_lost`, `encounter: null`, `canOrder: {ok: true}`, `cores: 1.142`. W Dzienniku `⚔ Bitwa w głębokim kosmosie (Thuban): Gracz vs Konsorcjum Siódmego Kręgu. Zwycięzca: Gracz`.
**Polecenie:** `KOSMOS.debug.probe603Warp(1)`
**Wynik:** `ok: true`, `text: Rozkaz skoku wydany`, `target: Castor [sys_040]`, `etaYears: 0.286`.
**Polecenie:** `KOSMOS.debug.probe603()`
**Wynik:** `state: in_transit`, `system: null`, `mission: interstellar_jump/warp_transit`, `to: sys_040`, `arrivalYear` = rok + 0,285, `cores: 0.5`, `route: sys_061>sys_040 leg 0`, `canOrder: {ok: false, reason: in_transit}`.
**Ustaw:** `KOSMOS.timeSystem.setMultiplier(4)` · `KOSMOS.timeSystem.play()`, do roku po `arrivalYear`, potem `KOSMOS.timeSystem.pause()`.
**Polecenie:** `KOSMOS.debug.probe603()`
**Wynik:** `state: orbiting`, `system: sys_040`, `mission: interstellar_jump/in_system`, `route: null`, `canOrder: {ok: true}`. **Oko:** jeden popup przylotu. Zamknij `[ENTER]`.

## K2 — flota z jednym członkiem w starciu
**Ustaw:** `KOSMOS.debug.fleetWarpRig(1)`
**Wynik:** `fleet: G4`, `home: sys_home`; `G4-wolny` w doku, `G4-wiazacy` na orbicie, `G4-szybki` w doku; rdzenie 10 / 5 / 10.
**Ustaw:** `KOSMOS.debug.fleetWarpBattle(0)`
**Wynik:** `ok: true`, `member: G4-wolny`, `enemy: Rajder`, `armed: true`, `encounter: encounter_…`, `inEncounter: [G4-wolny]`. Gra stoi na pauzie.
**Polecenie:** `KOSMOS.debug.fleetWarpIssue(1)`
**Wynik:** `ok: false`, `reason: in_combat`, `target: Wezen [sys_026]`, `text: Żaden statek nie ruszył · G4-wolny (Statek bierze udział w bitwie)`, `members: [G4-wolny: in_combat]`, `unchanged: true`. W Dzienniku ta sama linia, kanał `fleet`, `warn`.
**Polecenie:** `KOSMOS.debug.fleetWarpState()`
**Wynik:** `order: null`, `line: null`; wszyscy w `sys_home`, rdzenie 10 / 5 / 10.
**Oko:** klawisz G. PPM na Lalande: wpis `🌀 Flota: skok do Lalande — Skoki: 1 · ETA: 0.4 lat · Rdzenie: 0.7 / 5.0 (G4-wiazacy)`, pod nim `Żaden statek nie ruszył · G4-wolny (Statek bierze udział w bitwie)`. Klik wpisu nie wydaje rozkazu, menu się zamyka: `KOSMOS.debug.fleetWarpState()` bez zmian.
**Oko:** klik Lalande, `[ Wyślij ▼ ]`. `FLOTY`: przyciemniony `G4 · ×3`, pod nim `Żaden statek nie ruszył · G4-wolny (Statek bierze udział w…`. Panel `BITWA W DEEP-SPACE`: `Gracz — G4-wolny`, `Rajder`. Gdy gwiazda leży nisko na ekranie, panel zachodzi na picker (tak było w przebiegu walidatora); pełny tekst powodu stoi też w dymku obok przypięcia. W prawym outlinerze flota `G4` z trzema członkami. Esc, klawisz G.

## K3 — ścieżka AI bez zmian (jak G4 K9)
**Polecenie:** `KOSMOS.debug.fleetWarpAI()`
**Wynik:** `empire: emp_001`, `on.ok: true`, `on.composite: true`, `on.sameAngle: true`; obaj: `type: interstellar_jump`, `to: sys_home`, `warpSpeed: 18`, `pending: attack`, `group: g4_k9`, `route: null`, `warpGroupId: null`; `sameAsOff: true`.

---

## Granice walidacji
- Starcia stawiają pomocniki, nie zbliżenie statków na mapie. Rozkaz `engage` idzie ze specyfikacją PPM, nie gestem na mapie.
- Wiersz `G4` w pickerze przeczytany, nie kliknięty. Wiersz statku w starciu pokrywa keeper `warp_combat_607` T2.
- Starego panelu Stratcom walidator nie otwierał. Czyta tę samą bramkę; w jego liście statek w starciu ma etykietę `zajęty`.
- „Jeden popup przylotu” walidator wyprowadził z pauzy gry, bez oglądania. To sprawdza oko.
