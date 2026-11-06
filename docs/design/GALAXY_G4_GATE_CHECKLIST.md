# GALAXY G4 — checklista bramki skoku floty (K0–K11)

Napisana PRZED bramką. Każde polecenie uruchomione na żywym silniku (Chrome, GPU, okno 1600×1041, kopia zapisu ZF120) 2026-11-06; liczby niżej to odczyty z tego przebiegu. Wszystkie polecenia bez cudzysłowów.

**Wynik bramki:** właściciel 2026-11-06, **K0–K11 PASS**.
- **Klient EN:** bramka szła w kliencie angielskim, a teksty oczekiwane niżej są po polsku, bo w tym kliencie sprawdzał je walidator. W EN te same komunikaty czyta się po angielsku (`Rozkaz skoku wydany` = `Warp order issued`).
- **K7:** zapis na odcinku 1/3, nie 2/3. Zapis i wczytanie w trakcie trasy nadal dowiedzione.
- **K10:** tekst odmowy przy fladze OFF brzmi `No route in range`, nie mówi o wyłączonej funkcji (⚪, ginie z flagą w G5). `reason: feature_off` i `unchanged: true` jak niżej.
- **Z bramki:** Finding 605 ⚪ (flota stojąca przy gwieździe bez oznaczenia floty na płycie; → G5).
- **Poza meldunkiem z bramki:** lista „Do obejrzenia poza K0–K11” na końcu.

**Zapis:** ZF120 = `Downloads/kosmos_Zjednoczona_Federacja_r120_v101 (3).json`. Gramy na kopii: rig dodaje statki, a autozapis wnosi je do slotu.

**Pomocniki (`KOSMOS.debug`):**
- `fleetWarpRig(kind)` buduje flotę `G4` przy domu i ją zaznacza; kolejny rig zastępuje poprzedni. 1 = wszyscy zdolni · 2 = `G4-szybki` bez napędu warp · 3 = `G4-szybki` w rezerwie.
- `fleetWarpPlan(n)` / `fleetWarpIssue(n)`: `n` = liczba skoków; cel to najbliższy układ o trasie dokładnie n skoków. Issue idzie tą samą ścieżką co klik wpisu menu.
- `fleetWarpState()` odczyt (także toasty: `toastFleet`, `toastMembers`) · `fleetWarpDivert(i)` zjazd i-tego członka · `fleetWarpSave()` zapis · `fleetWarpAI()` odczyt ścieżki AI.
- `fleetWarpStop()` Stop floty: ta sama metoda co chip `[ Stop ]` · `fleetWarpOwnOrder(i)` i-ty członek dostaje własny skok do najbliższego układu.

**Członkowie rigu:** `G4-wolny` 6 LY/rok, 10 rdzeni · `G4-wiazacy` 12 LY/rok, 5 rdzeni, na orbicie · `G4-szybki` 18 LY/rok, 10 rdzeni. Zużycie 0,125 rdzenia/LY.

⚠ **Prędkości rigu są nadpisane.** W danych gry każdy `engine_warp` ma 18 LY/rok, więc mieszanych prędkości nie ma w żadnym zapisie; blokada prędkości działa dziś z prędkością 18. Nadpisanie żyje w sesji i nie trafia do zapisu.

⚠ **Popupy spoza testu.** ZF120 przy przyspieszonym czasie otwiera własne zdarzenia (bank danych, napięcie frakcji, prośba o pokój). Pauzują grę; zamknij `[ENTER]` i czas rusza dalej. To nie są popupy skoku. Popup przylotu floty czeka w kolejce za nimi, więc może pojawić się dopiero po ich zamknięciu.

⚠ **Czas.** `KOSMOS.timeSystem.setMultiplier(4)` = miesiąc/s, `KOSMOS.timeSystem.play()` rusza, `KOSMOS.timeSystem.pause()` zatrzymuje.

---

## K0 — Home + wczytanie
**Ustaw:** ekran tytułowy → Wczytaj z pliku → ZF120. Klawisz Home.
**Polecenie:** `KOSMOS.gameConfig.FEATURES.fleetWarp`
**Wynik:** `true`. W świecie: rok ok. 120,5 · 46 statków · dwie floty (`Flota Wojenna I` ×3, `Flota Wojenna II` ×4) · konsola bez błędów.

## K1 — menu: ETA najwolniejszego, członek wiążący
**Ustaw:** `KOSMOS.timeSystem.pause()` · `KOSMOS.debug.fleetWarpRig(1)` · klawisz G.
**Polecenie:** `KOSMOS.debug.fleetWarpPlan(2)`
**Wynik:** `ok: true`, cel `Suhail [sys_048]`, trasa `Kepler-4799 > Megrez > Suhail`, 10,25 LY, `groupSpeedLY: 6`, `etaYears: 1.708`, `binding: G4-wiazacy`, `fuelNeed: 1.281`, `fuelHave: 5`.
**Oko:** najedź na Suhail (na południowy zachód od Kepler-4799): jedna linia przerywana przez Megrez. PPM na Suhail, wpis: `Flota: skok do ??? — Skoki: 2 · ETA: 1.7 lat · Rdzenie: 1.3 / 5.0 (G4-wiazacy)`. Ten sam wpis po zaznaczeniu samego członka w prawym outlinerze. Nie klikaj.

## K2 — rozkaz: te same przeskoki
**Polecenie:** `KOSMOS.debug.fleetWarpIssue(2)`, potem `KOSMOS.debug.fleetWarpState()`
**Wynik:** Issue: `ok: true`, tekst `Rozkaz skoku wydany`. State: `order.type: warp`, `order.hops: sys_home>sys_023>sys_048`; każdy członek `in_transit`, `phase: warp_transit`, `to: sys_023`, `leg: 1/2`, ta sama trasa, `speedLY: 6`, `warpSpeed: 6`; `sameHops: true`, `sameArrival: true`; rdzenie 9,19 / 4,19 / 9,19; `line: Skok warp → ??? · ETA: 1.7 lat`; `logFleet` = jedna linia `G4: flota skacze do ??? (skoki: 2)`; `logMembers` puste.
**Oko:** panel floty ma linię `Skok warp → ??? · ETA: …`; na płycie jeden znacznik `×3`.

## K3 — pierwszy przeskok w jednym ticku
**Ustaw:** `KOSMOS.timeSystem.setMultiplier(4)` · `KOSMOS.timeSystem.play()`. Po ok. 13 s (przylot do Megrez za 1,08 roku) `KOSMOS.timeSystem.pause()`.
**Polecenie:** `KOSMOS.debug.fleetWarpState()`
**Wynik:** `arrivals.sys_023: { members: 3, sameTick: true }`; członkowie `leg: 2/2`, `to: sys_048`; `logMembers` puste; zero popupu przylotu.

## K4 — finał w jednym ticku, jedna linia
**Ustaw:** `KOSMOS.timeSystem.play()`, ok. 8 s.
**Polecenie:** `KOSMOS.debug.fleetWarpState()`
**Wynik:** `order: null`, `line: null`; `arrivals.sys_048: { members: 3, sameTick: true }`; każdy członek `sys: sys_048`, `orbiting`, te same `x, y`; rdzenie 8,719 / 3,719 / 8,719; `logFleet` = `G4: flota dotarła do Suhail` + linia startu; `logMembers` puste.
**Oko:** dokładnie jeden popup przylotu: `G4 zakończył skok warp i wszedł w układ Suhail.`

## K5 — członek bez napędu: odmowa
**Ustaw:** `KOSMOS.debug.fleetWarpRig(2)`
**Polecenie:** `KOSMOS.debug.fleetWarpIssue(1)`
**Wynik:** `ok: false`, `reason: not_warp_capable`, `text: Żaden statek nie ruszył · G4-szybki (Brak napędu warp)`, `unchanged: true`.
**Oko:** PPM na gwieździe: wpis wyłączony, pod nim ten sam tekst; toast i wpis w Dzienniku z tym tekstem.

## K6 — członek w rezerwie: odmowa
**Ustaw:** `KOSMOS.debug.fleetWarpRig(3)`
**Polecenie:** `KOSMOS.debug.fleetWarpIssue(1)`
**Wynik:** `ok: false`, `reason: vessel_in_reserve`, `text: Żaden statek nie ruszył · G4-szybki (Kadłub w rezerwie — najpierw obsadź go załogą (Rozmieść))`, `unchanged: true`.

## K7 — zapis w połowie trasy, wczytanie
**Ustaw:** `KOSMOS.debug.fleetWarpRig(1)` · `KOSMOS.debug.fleetWarpIssue(3)` (cel `Arktur [sys_015]`, trasa `Kepler-4799 > Wezen > Tau Ceti > Arktur`, 13,969 LY, `etaYears: 2.328`) · play, aż `KOSMOS.debug.fleetWarpState()` pokaże `leg: 2/3` · pauza · `KOSMOS.debug.fleetWarpSave()` · F5 · Kontynuuj.
**Polecenie:** `KOSMOS.debug.fleetWarpState()`
**Wynik:** po wczytaniu ta sama grupa, `order.hops: sys_home>sys_026>sys_053>sys_015`, `leg: 2/3`, `to: sys_053`, `speedLY: 6`, `sameHops: true`, `sameArrival: true`, `arrivalYear` jak przed zapisem. Po dalszym biegu: `arrivals.sys_053` i `arrivals.sys_015` po trzech w jednym ticku, wszyscy w jednym punkcie, `order: null`, `logFleet[0]: G4: flota dotarła do Arktur`.

## K8 — członek zjeżdża z trasy
**Ustaw:** `KOSMOS.debug.fleetWarpRig(1)` · `KOSMOS.debug.fleetWarpIssue(3)` · play, aż `leg: 2/3` · pauza.
**Polecenie:** `KOSMOS.debug.fleetWarpDivert(2)`, potem play aż `order: null`, potem `KOSMOS.debug.fleetWarpState()`
**Wynik:** Divert: `member: G4-wiazacy`, `direct: false:in_transit`, `stopsAt: Tau Ceti`, `thenTo: Kanopus [sys_031]`. Na końcu `G4-wolny` i `G4-szybki` w `sys_015`, `G4-wiazacy` w `sys_031` z własną prędkością `warpSpeed: 18`, `order: null`, `arrivals.sys_015.members: 2`. Dziennik: `G4: flota dotarła do Arktur` oraz linie samego członka (`trasa przerwana (diverted)`, `skok do ??? (1 przeskoków)`, `dotarł do Kanopus`).
⚠ `direct: false:in_transit` to wynik oczekiwany: statek w skoku nie przyjmuje własnego rozkazu skoku. Dlatego pomocnik najpierw zdejmuje go z trasy (kończy bieżący skok), a dopiero na przystanku wydaje mu własny rozkaz. W UI nie ma dziś przycisku zjazdu w locie.

## K9 — ścieżka AI bez zmian
**Polecenie:** `KOSMOS.debug.fleetWarpAI()`
**Wynik:** `empire: emp_001`, `on.ok: true`, `on.composite: true`, `on.sameAngle: true`; obaj: `type: interstellar_jump`, `to: sys_home`, `warpSpeed: 18`, `pending: attack`, `group: g4_k9`, `route: null`, `warpGroupId: null`; `sameAsOff: true`. Pomocnik sam usuwa swoje okręty.

## K10 — flaga OFF
**Ustaw:** `KOSMOS.debug.fleetWarpRig(1)` · `KOSMOS.gameConfig.FEATURES.fleetWarp=false`
**Oko:** z zaznaczonym węzłem floty PPM na gwieździe: `Skok do ???`, pod spodem `flota — G4`, wyłączone (zaślepka G3); bez podglądu trasy przy najechaniu; picker bez sekcji `FLOTY`.
**Polecenie:** `KOSMOS.debug.fleetWarpIssue(1)`
**Wynik:** `ok: false`, `reason: feature_off`, `unchanged: true`. Na koniec `KOSMOS.gameConfig.FEATURES.fleetWarp=true`.

## K11 — Stop floty w skoku: przerwanie na najbliższym przystanku
**Ustaw:** `KOSMOS.timeSystem.pause()` · `KOSMOS.debug.fleetWarpRig(1)` · `KOSMOS.debug.fleetWarpIssue(3)` (cel `Arktur [sys_015]`, trasa `Kepler-4799 > Wezen > Tau Ceti > Arktur`). Panel floty: `Skok warp → Arktur · ETA: 2.3 lat`.
⚠ Nazwy jak po K7 i K8, które odkryły Arktur i Wezen. Od świeżego wczytania, bez K7: `???` zamiast nazw w linii panelu i w linii startu.
**Klik:** w panelu floty `[ Rozkazy ▼ ]`, potem `[ Stop ]`. Bez myszy to samo robi `KOSMOS.debug.fleetWarpStop()` (`stopped: true`).
**Oko:** ETA w panelu spada do `0.4 lat`, trasa na płycie kończy się na Wezen. Żadnego toastu ani nowej linii w Dzienniku: to jedyna reakcja na klik, dopóki flota nie wyląduje.
**Polecenie:** `KOSMOS.debug.fleetWarpState()`
**Wynik:** `order.target: sys_026`, `order.hops: sys_home>sys_026`, `line: Skok warp → Wezen · ETA: 0.4 lat`; każdy członek `in_transit`, `phase: warp_transit`, `to: sys_026`, `leg: 1/1`; rdzenie 9,703 / 4,703 / 9,703; `logFleet` = sama linia startu `G4: flota skacze do Arktur (skoki: 3)`; `logMembers`, `toastFleet`, `toastMembers` puste.
**Polecenie:** `KOSMOS.debug.fleetWarpStop()`
**Wynik:** `stopped: false`: drugi Stop nic nie zmienia.
**Ustaw:** `KOSMOS.timeSystem.setMultiplier(4)` · `KOSMOS.timeSystem.play()`. Po ok. 5 s (przylot do Wezen za 0,4 roku) `KOSMOS.timeSystem.pause()`.
**Polecenie:** `KOSMOS.debug.fleetWarpState()`
**Wynik:** `order: null`, `line: null`; `arrivals` ma wyłącznie `sys_026: { members: 3, sameTick: true }`; każdy członek `sys: sys_026`, `orbiting`, `phase: in_system`, `leg: null`, te same `x, y`; rdzenie bez zmian; `logFleet[0]: G4: trasa floty przerwana w Wezen`; `logMembers` puste; `toastFleet` = ta sama linia, dokładnie jedna; `toastMembers` puste.
**Oko:** jeden toast i jeden popup przylotu: `G4 zakończył skok warp i wszedł w układ Wezen.` Zamknij `[ENTER]`.
**Członkowie wolni:** `KOSMOS.debug.fleetWarpPlan(1)`: `ok: true`, trasa `Wezen > Kepler-4799`. `KOSMOS.debug.fleetWarpOwnOrder(2)`: `ok: true`, `member: G4-wiazacy`, `to: Kepler-4799 [sys_home]`, `warpSpeed: 18` (własna prędkość, nie blokada floty), `group: null`.
**Ostatni odcinek:** `KOSMOS.debug.fleetWarpRig(1)` · `KOSMOS.debug.fleetWarpIssue(1)` (cel `Wezen [sys_026]`) · `KOSMOS.debug.fleetWarpStop()`: `stopped: false`, bo przystankiem jest cel i nie ma czego przerywać. `KOSMOS.timeSystem.play()`, aż `KOSMOS.debug.fleetWarpState()` pokaże `order: null`: `logFleet[0]: G4: flota dotarła do Wezen`, `toastFleet` puste; jeden popup przylotu.
⚠ Własne przerwanie członka (K8) dalej ma własną linię: statek, który schodzi z trasy bez Stopu, nie może zniknąć z floty bez słowa.

---

## Do obejrzenia poza K0–K11
- Picker `[ Wyślij ▼ ]` przypiętej gwiazdy: sekcja `FLOTY` nad `STATKI [N]`, odmówione floty przyciemnione z powodem; klik wiersza `G4` startuje skok i zamyka picker.
- Szyna: gwiazda z dokładnie 4 statkami po najechaniu: 3 nazwy + `+1`; zwinięta: 1 statek sam znacznik, 2 i więcej `+N`.
- Dowództwo: flota w skoku ma status skoku, nie „bezczynna”.
