# POLISH — polerka UI i grafiki

> **Status:** ✅ **P1 — ZAMKNIĘTY W KODZIE 2026-10-17:** `13ca6c9` (P1-1) · `bcecaa0` (P1-2), zakres `20e23a2..bcecaa0`,
> po bramce `gate/GATE_P1.md` w przeglądarce właściciela (PASS — §9.5a) i zgodzie na przecelowanie **R-P1-2** (CP9);
> na `bcecaa0` sweep **310/310**, `check-i18n` PASS pl = en 3458 (§9.1). Decyzje **CP1–CP12** (§5); zamknięcia **449** ·
> **452** · **454** · **438** · **436** — §9.6. Następny krok: **P2 — widoczność**, najpierw audyt (§7); potem **P3** —
> **456** (CP12). Audyt P1 — 2026-10-16, bez kodu (§2–§4; HEAD audytu `3b7819f`, commit `1af65fc`). Arc otwarty
> wskazaniem właściciela przy zamknięciu AI STRIKES BACK (`AI_STRIKES_BACK_PLAN.md` §8.8).
> Decyzje arca — prefiks **CP**. Rejestr findingów arca — §6, **#449–#457**; pierwszy wolny **458**. Sondy audytu:
> `kosmos-handover/polish-p1-combat-pace/`; kod, dowód i bramka P1: `kosmos-handover/polish-p1-code/` (SHA256SUMS).
> Tagi: `[code]` źródło · `[git]` historia · `[measured]` pomiar · `[doc]` dokumenty · `[derived]` wniosek z powyższych.

## 0. Cel arca

Polerka tego, co gracz widzi i czuje, bez zmiany reguł gry. Kolejka (`AI_STRIKES_BACK_PLAN.md` §8.8): **P1** — model
czasu starcia w przestrzeni (**438** / **436**, z nimi **432**); dalej **441** (SB77), i18n **404** / **412**, tekst
**409**, flash **405**; **447 (b)** — po Alfie.

## 1. P1 — tempo starcia

**Cel właściciela:** gracz ma czuć, że bierze udział w bitwie — częste, widoczne strzały i spadki HP, walka widocznie się
rozwija; starcie w przestrzeni trwa co najmniej 5–8 s realnych przy najwolniejszej prędkości gry, z wysoką częstością rund.

**Kierunek podpisany:** SB68 (c) (2026-10-13), doprecyzowany 2026-10-16 („zgoda”): (1) w starciu czas gry odpięty od
czasu realnego — każda runda przesuwa zegar gry o STAŁY krok równy dzisiejszemu efektywnemu, więc wyniki zostają
dzisiejsze i nie zależą od prędkości gracza; (2) czas rundy w czasie realnym staje się kluczem strojenia (roboczo
`combatRoundMs`, domyślnie ≈ 350 ms, zakres 50–1000) — 20 rund ≈ 7 s; wynik od klucza nie zależy.

**Zakres P1:** krok czasu gry na rundę · klucz czasu rundy · pauza bez nadrabiania · zegar orbit w starciu.
**Poza P1:** widoczność strzałów i HP (P2, §3.3) · limit 20 rund (**432** — wynik ma zostać dzisiejszy) · bitwa
planetarna `EnemyAttackHandler` bez przebiegu (**165**).

**Decyzje 2026-10-17 (§5):** kształt „siatka” (CP1), klucz `combatRoundMs` domyślnie **400 ms** (CP2), prędkość gracza
w starciu bez wpływu na zegar starcia, pauza zatrzymuje starcie (CP3), starcie nieoglądane w dzisiejszym tempie (CP4),
zegar orbit (CP5), 450 i 453 → P2 (CP6, CP7), zgoda na R-P1-1 (CP8); po bramce — zgoda na R-P1-2 (CP9), „game time”
z CP5 = zegar klatek `TimeSystem` (CP10), „restored after” z CP3: P1 ustawienia prędkości nie rusza, a auto-slow do 1 d/s
po bitwie z udziałem gracza (157) zostaje (CP11), 456 → P3 (CP12). Kod — §9 (`13ca6c9`, `bcecaa0`).

## 2. Audyt

### 2.1 A1 — pętla rund dziś `[code]`

- **Kto planuje rundy:** nikt osobny. `DeepSpaceCombatSystem._tick` jest wołany z `VesselManager._tick` (`:1947`) przy
  KAŻDYM `time:tick`, czyli co klatkę pętli rAF `GameScene` (`:3751-3759`; `deltaMs = now − last`, bez ograniczenia)
  → `TimeSystem.update` (`:69`). Kolejność w klatce: proximity (`:1941`) → DSCS → MOS (`:1951`) → `_updatePositions`
  (`:1952`) → proximity (`:1962`). Pauza: `TimeSystem` nie emituje ticku; DSCS ma bramkę `civDy ≤ 0` (`:508`).
- **Kadencja — zegar REALNY** `performance.now()` (`_nowMs`, `:1603`): runda co `ROUND_INTERVAL_MS` = 110 ms (`:73`),
  pierwsza natychmiast przy utworzeniu (`:518`), do `MAX_ROUNDS_PER_TICK` = 4 na klatkę (nadrabianie, `:74`);
  `MAX_ROUNDS` = 20 (`:58`) ⇒ starcie ≤ ~2,2 s realnych.
- **Krok symulacji rundy — już na zegarze starcia:** `CIV_PER_ROUND` = 0,3 civY (`:72`) — odliczanie broni (laser co 2,
  kinetyk co 3, rakieta co 5 rund) i regeneracja tarcz (`:742`); zbliżenie `CLOSE_STEP_YEARS` = 0,025 roku gry × prędkość
  statku (`:80`, SB49). Losowania rundy: `mulberry32(seedBase + runda)` (`:619`), `seedBase` z roku startu (`:385`).
- **Między rundami płynie czas gry:** fizyka ciał · statki na orbicie ciała (kąt w czasie REALNYM — §2.3) · rozkazy MOS
  (`engage` — dogonienie i trzymanie dystansu `:1302`, odwrót, pościg) · proximity (wejście 0,15 AU / wyjście 0,20 AU) ·
  Director · doktryna `retreat_at_50` (co 0,5 civY, `FleetSystem:640`) — `time:tick` subskrybują 52 pliki systemów.
- **Koniec:** zniszczenie strony · odwrót AI (`pct ≤ 0,2` i `pct < pct przeciwnika × 0,5`, `:836-841`; gracz bez
  auto-odwrotu) · rozejście — wszyscy żywi strony > 0,5 AU od STAŁEGO punktu środkowego (`_allOutsideOf`), co rundę
  (`:757-786`) i na `vessel:combatRangeExit` w klatce (`:936-963`) · limit 20 rund (więcej HP wygrywa, żywi przegrani →
  wrak — **432**) · `forceFinalize` (debug). Rekord bitwy bez pola `turns` (`:1060`).
- **Start:** `vessel:engaged` → auto-slow do 1 d/s (`TimeSystem:51`, `UIManager:1525`; tylko gdy prędkość > 1 d/s) +
  fokus kamery (`ThreeRenderer:1060`). Prędkość można przestawić w trakcie walki — nic tego nie blokuje.

### 2.2 A2 — krok czasu gry na rundę i zależność wyniku `[measured]`

Prawdziwa gra (fixture GATE-S4, izolowany headless Chrome), sonda **deterministyczna**: zegar wirtualny, `Math.random`
gry ziarnisty, tryb klatek (§8). Scena **n** — 3 fregaty gracza z laserem, rozkaz `engage` na izolowanego strażnika
stolicy `emp_001`, start 0,6 AU (scena (a) z C6 z krótszym dolotem). **Kontrola X = X identyczna** (ta sama sygnatura,
4849 losowań, 0 losowań poza klatką sondy).

| konfiguracja — dziś (kod HEAD), scena n, geometria 0 | krok gry / rundę [dni] | bitwy (rundy) | strażnik | fregaty stracone |
|---|---|---|---|---|
| 110 ms, 1 d/s (auto-slow), 60 FPS | 0,096–0,112 | 16 / 6 / 11 | żyje | 3 |
| … kontrola | 0,096–0,112 | identycznie | żyje | 3 |
| prędkość w walce 3 d/s | 0,288–0,336 | 16 / 11 / 8 / 1 / 1 | wrak | 2 |
| 1 tydz./s | 0,672–0,784 | 20 | wrak (limit rund) | 1 |
| 1 mies./s | 2,92–3,41 | 20 | wrak (limit rund) | 0 |
| 1 rok/s | 35,1–40,9 | 9 (odwrót GRACZA) | żyje | 0 |
| 30 FPS | 0,099–0,132 | 11 / 11 / 6 | żyje | 3 |
| 120 FPS | 0,104–0,112 | 20 / 11 / 1 / 1 / 6 | żyje | 3 |
| runda 350 ms | 0,336–0,352 | 16 / 11 / 8 / 1 | żyje | 3 |
| runda 600 ms | 0,592–0,608 | 20 | wrak | 1 |
| pauza 2 s w rundzie 5 | 0 … 0,112 | 16 / 17 / 1 | wrak | 1 |

**Werdykt: wynik dziś ZALEŻY od prędkości gracza w trakcie walki** (potwierdzone), a także od czasu rundy, od FPS i od
pauzy — 10 konfiguracji, 10 różnych sekwencji bitew (wiersze FPS — cały przebieg w tym FPS, także dolot; sam FPS walki
przy dolocie w 60 FPS: 120 FPS w starciu zmienia drugą bitwę, 30 FPS — bez zmian). Geometria 1 (inny kąt startu):
110 ms / 350 ms / 1 rok/s — trzy różne.
Przy 1 d/s strażnik wygrywa trzy starcia; przy 1 mies./s ginie w pierwszym bez strat gracza; przy 1 rok/s jedna bitwa
obejmuje 321 dni gry, a strona gracza „ucieka” (geometria odjeżdża od stałego punktu środkowego starcia). Scena c
(obrońcy w środku planety domu) jest niewrażliwa — 110 = 350 ms (jak w C6). **Dzisiejszy efektywny krok: 0,110 dnia na
rundę** (średnia 0,1104 przy 60 FPS; rundy co 6 albo 7 klatek po 16 ms). Czas realny 1. starcia (16 rund): 1664 ms.

### 2.3 A3 — czas realny a czas gry `[code]`

**Czas realny w LOGICE (zmienia stan gry):**
1. kadencja rund DSCS — `performance.now()` (`:509`, `:518-529`);
2. **kąt orbity statku wokół ciała** — `performance.now() × 0,001` w `VesselManager._updatePositions` (`:2497` wrak,
   `:2536` orbita z misją, `:2573` orbita bez misji) → `OrbitalSpaceSystem.getPosition` θ = θ0 + ω·t (`:199-200`; okręt
   ω ≈ 0,10 ± 0,02 rad/s, promień 1,9–2,5 × promień ciała). Dotyczy statków z zarejestrowaną orbitą (`vessel:arrived`);
   krążą w sekundach REALNYCH, niezależnie od prędkości gry; po pauzie kąt przeskakuje (**452**);
3. `EnemyAttackHandler`: pozycja świeżego wraku na orbicie (`:379`) i okno partii bitwy planetarnej 500 ms (`:67`);
4. pętla rAF bez ograniczenia `deltaMs` — długa klatka = jeden tik z dużym krokiem gry.

**Czas realny tylko w PREZENTACJI:** efekty walki (`_spawnFx` `:6048`: smuga 260 ms, błysk 460 ms po 150 ms, pierścień
tarczy 360 ms, rozrzut salwy 40 ms × do 8), znacznik starcia — wygasa 1600 ms po ostatniej rundzie ze strzałem
(`:6320`), kamera, animacja okna wyniku (CSS 0,6 s).

**Czas gry:** `_year()` (ziarno, rok rekordu, id starcia) · MOS · fizyka · proximity · Director · doktryna · gospodarka.
`encounter.currentYear = startYear + runda × CIV_PER_ROUND` (`:616`) dodaje do lat gry kroki civY (20 rund = +6 „lat”);
pole bez czytelnika — kosmetyka.

**Miejsca styku:** (m1) rundy w czasie realnym × świat w czasie gry między rundami ⇒ krok gry na rundę = interwał ×
mnożnik prędkości (**438**) · (m2) pauza zatrzymuje ticki, nie zegar rund (**449**) · (m3) kąt orbity w czasie realnym
(**452**) · (m4) brak ograniczenia `deltaMs` · (m5) jednostki `currentYear`.

### 2.4 A4 — co gracz widzi dziś `[code]` + zrzuty `[measured]`

- **Start:** auto-slow do 1 d/s; kamera leci na punkt starcia i zbliża się (≤ 6 j.) — także gdy starcie jest w innym
  układzie: wtedy w pusty punkt oglądanego układu (**453**).
- **Co rundę ze strzałem** (`combat:roundFx`, flaga `fcCombatFx`): smugi od strzelca do celu (kolor wg kategorii broni;
  trafienie krycie 0,9, pudło 0,4; 260 ms), błysk trafienia — osobna kula 0,06 j. w pozycji celu, rośnie ×3 w 460 ms;
  pierścień tarczy przy zablokowaniu; pulsujący pierścień znacznika starcia. Bez terminu układu: starcie w innym układzie
  rysuje się w OGLĄDANYM, w pustym punkcie o swoich współrzędnych (**453**, zmierzone).
- **Trafienie nie zmienia wyglądu statku** (błysk to osobny obiekt); zniszczenie → eksplozja + ciemny wrak z czerwoną
  poświatą.
- **HP:** panel walki na dole ekranu — „BITWA W DEEP-SPACE”, „runda N · dystans”, dwa zbiorcze paski HP stron z liczbami,
  „żywych X/Y”, lista statków (nazwa · kadłub, broń; kolor żywy/zniszczony), 6 ostatnich zdarzeń („R5: Statek → Laser →
  Cel (24 dmg)”). HP pojedynczego statku nie ma ani w panelu, ani na mapie (**451**).
- **Między rundami:** przy 110 ms smuga rundy N (260 ms) nachodzi na rundę N+1 — ciągłe migotanie; licznik rund ~9/s;
  całe starcie ≤ 2,2 s (zmierzone 1. starcie: 1664 ms).
- **Po starciu:** okno wyniku z pauzą — ZWYCIĘSTWO / PORAŻKA / REMIS (zaszyte po polsku — **163**), „A vs B · Tur: 0 ·
  Straty: x / y”; „Tur: 0” zawsze (**450**).
- **Starcie w innym układzie:** panel walki jak dla oglądanego; na mapie oglądanego układu kamera, smugi i pulsujący
  pierścień lecą w pusty punkt (**453**; zrzut `screenshots/cross_system/p1_x1_strzal.png`).
- **Drobne:** etykiety stron w panelu (`Gracz (N)`, `Wróg — …`) zaszyte po polsku w DSCS (`:347-352`); polskie klucze
  panelu bez ogonków („zywych”, „pudlo”); popup zdarzenia losowego w trakcie starcia pauzuje grę i zakrywa bitwę (dziś
  skutkuje nadrabianiem — **449**).

**Zrzuty** `[measured]` (`kosmos-handover/polish-p1-combat-pace/screenshots/`, PL, kod HEAD, render włączony; pierwsze
starcie sceny n — to samo co w przebiegu porównawczym M2: 16 rund, 12 strzałów, 7 trafień, 1664 ms realnych):
- `p1_s0_przed.png` — przed starciem (fregaty ~0,45 AU od strażnika; kamera ustawiona sondą jak auto-fokus, dystans 6 j.):
  na mapie ikony i znaczniki, modeli statków nie widać.
- `p1_s1_runda1.png` — runda 1 (0,283 AU): panel — HP gracza 50/120 po dwóch trafieniach rakiet, log „R1: Sztylet →
  Wyrzutnia Rakiet → P1 n0 (35 dmg)” ×2; **na mapie brak smug tej salwy** (aktywne efekty: 0) — **455**.
- `p1_s2_strzal.png` — runda 6 (0,131 AU), następna runda ze strzałem: dwie chybione rakiety — cienka smuga między
  znacznikami i pierścień znacznika starcia.
- `p1_s3_zblizenie.png` — runda 11 po „Obserwuj bitwę” (dystans ~1,5 j., 0,043 AU): smuga lasera i trafienie rakiety,
  HP 14/120 wobec 107/120; znacznik starcia stoi w stałym punkcie środkowym, statki od niego odpłynęły.
- `p1_s4_wynik.png` — okno wyniku: „PORAŻKA · Gracz vs Liga Trzech Słońc · Tur: 0 · Straty: 1 / 0” (**450**).

Strzały padły w 7 z 16 rund (rundy 2–5 — samo zbliżanie): tempo strzałów wyznaczają odliczania broni i zasięg, nie czas
rundy. Wcześniejsze próby zrzutów (zasłonięte oknami zdarzenia losowego i propozycji pokoju) — `screenshots/attempt*/`.

**Werdykt A4:** strzały SĄ rysowane w rundach ze strzałem (smugi, błyski) — z wyjątkiem zmierzonej salwy otwierającej
(**455**) — a zbiorcze HP stron spada w panelu; brak HP pojedynczego statku, trafienie nie podświetla statku, okno wyniku
nie mówi, ile rund trwała walka, a przy 110 ms całe starcie mija w 1,7 s. Przy domyślnym kadrze (6 j.) gracz widzi ikony,
znaczniki i cienkie smugi — nie modele. → P2 (§3.3) po P1.

### 2.5 A5 — keepery a projekt `[code]` `[measured]`

| keeper | co przypina | pod B1 (oba kształty) + B2 (domyślnie 350; także przy 110) |
|---|---|---|
| `sb3_combat_closing_smoke` T1–T10 | zegar rund podmieniony (`performance.now`), `round()` = +`ROUND_INTERVAL_MS` i `_tick`; T4 krok niezależny od `civDy`; T10 pin źródłowy `_tick(civDy) {` + `_closeToWeaponRange` przed `_tickEncounter(…, CIV_PER_ROUND)` | 🔴 przy OBU wartościach: rundy liczy zegar starcia z `TimeSystem`, a `round()` przesuwa `performance.now` — daje tylko pierwszą rundę ⇒ T1–T9; T10, gdy zmieni się sygnatura `_tick`. Przecelowanie **R-P1-1** (helper `round()` przesuwa zegar starcia, kotwica T10) — za zgodą. Gdyby zostawić zegar realny w DSCS z kluczem: 110 zielone, 350 czerwone (helper przesuwa 110 ms). Z rezerwą `performance.now`, gdy zegara starcia brak (keeper bez `TimeSystem`): zielone przy obu, ale **454** zostaje — rekomendacja: bez rezerwy |
| `fleet_engage_scope` T3b · `fleet_engage_picker_frame` T5b | „po 120 tikach starcie nadal aktywne” (kontrola anty-jałowości) | dziś zależne od czasu realnego — zmierzone: przy zegarze +60 ms/wywołanie oba padają (**454**); pod B1 surowe `time:tick` keeperów (bez zegara starcia) dają wyłącznie pierwszą rundę ⇒ zielone i deterministyczne; wariant „runda na każdy tik” ⇒ czerwone |
| `battle_result_classification_smoke` T2 + auto-slow | `vessel:engaged` ma jednego producenta (DSCS); `TimeSystem._triggerAutoSlow` | zielone (auto-slow zostaje, brak nowego emitenta) |
| `sb1_fleet_pool_smoke` T1c | każdy klucz `SB_TUNING` ma konsumenta w `src/` | zielone, gdy `combatRoundMs` czyta `TimeSystem` |
| `sb1_fleet_tuning_smoke` | wiersze tabeli = `tuningKeys()` (bez sztywnej liczby) | zielone |
| keepery kończące starcie `_finalizeBattle` wprost (`battle_announce_once`, `w3_battle_booking`, `w3_seams` T2, `sb2b_encounter_id`, `sb2b_wreck_still`) i ustawiające starcie ręcznie (`retreat_target` T9, `sb3_group_arrival` T5) | rekord, wraki, ogłoszenie | zielone — omijają kadencję |
| keepery headless `GameCore` | — | nie dotyczy: `GameCore` nie montuje DSCS ani proximity |

## 3. Propozycja — najprostsza najpierw

### 3.1 B1 — czas gry w starciu odpięty od czasu realnego

**Wspólne dla obu kształtów.** Gdy trwa co najmniej jedno starcie DSCS, `TimeSystem.update` nie mnoży czasu realnego przez
prędkość gracza: czas gry przyrasta wyłącznie stałymi krokami starcia, odmierzanymi w tempie klucza `combatRoundMs`
(zaległość ≤ 1 runda; pauza zatrzymuje licznik). DSCS liczy rundy z zegara starcia prowadzonego przez `TimeSystem` —
znikają `performance.now`, `_lastRoundMs` w ms realnych i nadrabianie (`MAX_ROUNDS_PER_TICK`). Surowe `time:tick` bez
zegara starcia (keepery) dają wyłącznie pierwszą rundę. Kąt orbity statku (**452**) liczy zegar `TimeSystem`: poza
starciem płynie z czasem realnym (dzisiejszy wygląd), w starciu przyrasta razem z krokami (konsumenci:
`VesselManager._updatePositions` ×3, `EnemyAttackHandler._turnIntoWreck`, `OrbitalSpaceSystem.getPosition`). Cały świat
(fizyka, MOS, proximity, Director, gospodarka) tyka tymi krokami; `time:display` co klatkę.

| kształt | tik czasu gry w starciu | runda | krok gry na rundę |
|---|---|---|---|
| **B1-prosty** (dosłownie z polecenia) | jeden, 0,110 dnia, co `combatRoundMs` | jedna na tik | 0,1100 dnia |
| **B1-siatka** (rekomendacja) | 0,016 dnia (16 ms × 1 d/s — dzisiejsza klatka przy 60 FPS i auto-slow), co `16 × combatRoundMs / 110` ms realnych (350 ms ⇒ co 50,9 ms) | dzisiejsza reguła: co 110 ms zegara starcia, z resztą — 6 albo 7 tików | 0,096 / 0,112 dnia — jak dziś |

**Dlaczego siatka** `[measured]` (§3.4): podpisane „wyniki zostają dzisiejsze”. Dziś (60 FPS, 1 d/s) świat tyka 6–7 razy
na rundę; B1-prosty tyka raz i zmienia wynik — w scenach n g1 i a także KLASĘ (kto ginie). B1-siatka odtwarza dzisiejszy
przebieg bit w bit we wszystkich trzech scenach i jest niezmienniczy wobec klucza (110 / 350 / 600 ms), prędkości w walce
(1 rok/s), FPS walki (30) i pauzy (2 s). Koszt: pętla siatki w `TimeSystem` (kilka linii); tików na sekundę realną
w starciu mniej niż dziś (350 ms: 19,6/s, dziś 60/s).

**Bitwy, których gracz nie ogląda** (starcie w układzie innym niż oglądany; każde starcie DSCS ma gracza po jednej
stronie — `startEngagement` wymaga grupy gracza). **Model wymuszony, tempo bez zmian.** Stały krok i zegar starcia
obowiązują także tu: zegar czasu jest jeden dla całej galaktyki, a bez kroku wynik niewidzianej bitwy dalej zależałby od
prędkości (438 w połowie). Tempo wyniku nie zmienia (I1), więc może zostać **dzisiejsze — 110 ms na rundę** (galaktyka
zwalnia na ≤ 2,2 s, jak dziś); klucz `combatRoundMs` obowiązuje, gdy co najmniej jedno aktywne starcie leży w oglądanym
układzie. Rekomendacja: tak (pytanie 4). Panel walki pokazuje wszystkie starcia niezależnie od widoku.

### 3.2 B2 — klucz `combatRoundMs`

`SB_TUNING.combatRoundMs = { default: 350, type: 'int', min: 50, max: 1000, unit: 'ms czasu realnego na rundę' }`,
konsument `TimeSystem` (`getTuning` w chwili użycia — `sb1_fleet_pool_smoke` T1c wymaga konsumenta w `src/`). Konsola
bez nowego kodu: `KOSMOS.debug.sbSet('combatRoundMs', 350)`; odmowy z ogólnej walidacji — `350.5` albo `'350'` →
`wrong_type` (int), `30` / `1200` → `out_of_range` [50, 1000], literówka → `unknown_key` z listą kluczy;
`sbReset('combatRoundMs')` → 350. Wartość jedzie w zapisie (`gameState.strikesBackTuning`, SB16; v101 bez migracji).
Czas realny starcia ≈ (rundy − 1) × klucz: przy 350 ms 20 rund 6,7 s, 16 rund 5,3 s, 11 rund 3,5 s, 6 rund 1,75 s
(zmierzone w siatce: 16 rund — 5296 ms przy 350 i 9072 ms przy 600; 20 rund — 11 440 ms przy 600; nadwyżka to
kwantowanie siatki 16 ms).
→ **CP2 (2026-10-17): domyślnie 400 ms, jednostka „ms”** — zmierzone na kodzie P1: 16 rund — 6048 ms, 20 rund — 7616 ms
(§9.3).

### 3.3 B3 — widoczność: OSOBNY krok P2

Najmniejszy dodatek: (1) cienki pasek HP nad każdym statkiem aktywnego starcia (kanwa UI; rzut pozycji sprite'a;
`hp / hpStart` z `vesselStates`; kolor strony; znika po starciu) — **451**; (2) błysk trafienia NA modelu statku (emisja
~200 ms przy `combat:roundFx` z trafieniem); (3) „Tur: N” z liczby rund — **450**; (4) smuga salwy otwierającej —
**455**. Szacunek ~1–1,5 dnia + bramka w przeglądarce. Kandydaci z pomiaru: wygładzenie skoku zbliżenia (0,025 AU
na rundę w B1-prostym; w siatce ruch idzie 6–7 krokami na rundę), czas życia znacznika starcia (1600 ms) wobec rakiet
strzelających co 5 rund (5 × 350 ms = 1,75 s).

### 3.4 Prototypy w sondzie — wynik `[measured]`

Oba kształty zbudowane WYŁĄCZNIE w sondzie (podmiany serwera, repo nietknięte), z zegarem orbit; B1-prosty także bez
niego. Komórka = sekwencja bitew (rundy) · straty gracza/AI · los strażnika.

| | dziś | B1-prosty + zegar orbit | B1-siatka |
|---|---|---|---|
| scena n g0, 110 ms, 60 FPS, 1 d/s | 16/6/11 · 3/0 · strażnik żyje | 16/16/6 · 3/0 · żyje | **= dziś** |
| scena n g1, 110 ms | 6/16/17/1/1 · 2/1 · strażnik ginie | 6/11/20 · 3/0 · **żyje** | **= dziś** |
| scena a, 110 ms | 20/11/11 · 3/0 · strażnik żyje | 20/15/1/1 · 1/1 · **ginie** | **= dziś** |
| klucz 110 / 350 / 600 ms, scena n g0 | 3 różne wyniki | identycznie | **identycznie** (= dziś) |
| klucz 110 / 350, scena n g1 | 2 różne | identycznie (także 600) | **identycznie** (= dziś) |
| klucz 110 / 600, scena a | — | identycznie | **identycznie** (= dziś) |
| prędkość 1 rok/s w walce, scena n g0 | inny wynik | identycznie (także g1) | **identycznie** |
| FPS samej walki 30, scena n g0 | = 60 FPS | identycznie | **identycznie** |
| FPS samej walki 120, scena n g0 | druga bitwa 11 zamiast 6 rund | identycznie | nie mierzone |
| pauza 2 s w rundzie 5 | 4 + 4 + 3 rundy w 3 klatkach | zero nadrabiania, wynik bez zmian | **zero nadrabiania**, wynik = dziś (350 ms) |
| scena co (orbita), 110 / 350 / 600 ms | 110 ≠ 350 | identycznie | nie mierzone |
| czas realny 1. starcia (16 rund), 110 / 350 / 600 ms | 1664 ms przy 110 | 1648 / 5248 / 8992 | 1664 / 5296 / 9072 |
| krok gry na rundę | 0,096–0,112 dnia | 0,1100 | 0,096–0,112 (jak dziś) |

B1-prosty bez zegara orbit: 110 = 350 ≠ 600 ms w scenie n g0 (druga bitwa 6 zamiast 16 rund, strażnik ginie) — **452**.
Kontrola konstrukcji siatki: z regułą rund podmienioną na 350 ms (błąd sondy, §8) siatka dała wynik identyczny
z dzisiejszym przy 350 ms — przy odtwarzaniu ponad 3 razy wolniejszym niż dziś i z pauzą 2 s.

### 3.5 Inwarianty i dowód bramki P1

| # | inwariant | dziś | B1-prosty + zegar orbit | B1-siatka |
|---|---|---|---|---|
| I1 | wynik identyczny przy `combatRoundMs` 110 / 350 / 600 | ✗ | ✓ (n g0, g1; a; co) | ✓ (n g0 110 / 350 / 600; g1 110 / 350; a 110 / 600 — wszystkie = dziś) |
| I2 | wynik identyczny przy każdej prędkości gracza w walce | ✗ | ✓ | ✓ (n g0) |
| I3 | wynik samej walki identyczny przy 30 / 60 / 120 FPS | ✗ (120 FPS) | ✓ | ✓ (30 FPS; 120 nie mierzone) |
| I4 | czas realny starcia ≈ (rundy − 1) × klucz | — | ✓ ± 1 klatka | ✓ 16 rund: 5296 / 9072 ms przy 350 / 600 (15 × klucz + 46 / 72 ms kwantowania siatki) |
| I5 | krok gry na rundę niezależny od klucza, prędkości, FPS i pauzy | ✗ 0,096–0,112 zmienne | ✓ 0,1100 | ✓ 0,096 / 0,112 — sekwencja dzisiejsza |
| I6 | pauza: zero rund w pauzie, potem tempo klucza | ✗ | ✓ | ✓ (350 ms + pauza 2 s) |
| I7 | wynik = dziś przy 60 FPS i 1 d/s | — | ✗ (n g0 inna kolejność; n g1 i a — inna klasa) | ✓ bit w bit (n g0, n g1, a) |

**I7 — co znaczy „wyniki dzisiejsze”:** dzisiejszy wynik nie jest jedną rzeczą — zmienia się z FPS, prędkością i pauzą
(§2.2). Odniesieniem jest konfiguracja, w której gracz dziś walczy: auto-slow 1 d/s przy 60 FPS. B1-siatka zachowuje
ją bit w bit; B1-prosty zachowuje MODEL (krok 0,110 dnia, reguły rundy, limit 20 rund), nie przebieg. **FPS poza walką**
(dolot) zmienia chwilę startu starcia, a z nią ziarno rundy — to cecha całej symulacji klatkowej, nie modelu starcia;
P1 jej nie usuwa.

**Bramka P1:** (1) ta sama sonda deterministyczna na kodzie P1 — macierz I1–I7 na scenach n (g0, g1), a, co i c,
kontrola X = X i licznik losowań poza klatką = 0; (2) keeper `combat_pace_smoke` — tempo kroków, runda z zegara starcia,
pauza bez zaległości, prędkość ignorowana w starciu, zegar orbit, odmowy klucza; (3) w przeglądarce właściciela —
odczucie przy 350 ms, pauza i zmiana prędkości w trakcie walki, bitwa w innym układzie.

### 3.6 Ryzyka

- **Galaktyka zwalnia na czas bitwy oglądanej:** ≈ 0,31 d/s przy 350 ms przez ≤ 7 s (dziś 1 d/s przez ≤ 2,2 s);
  przy serii bitew (kampanie AI) — odczuwalne. Łagodzą klucz i pytanie 4.
- **Zegar orbit zmienia wygląd:** w starciu statki na orbitach ciał zwalniają razem z czasem gry (pytanie 5).
- **B1-prosty:** wynik nie dzisiejszy (I7) i świat tyka raz na rundę — sprite'y skaczą co `combatRoundMs`.
- **Długa klatka** (karta w tle): w starciu ≤ 1 runda zaległości; poza starciem bez zmian (brak ograniczenia `deltaMs`
  — poza P1).
- **Przecelowanie R-P1-1** (`sb3_combat_closing`) wymaga zgody; T3b/T5b (**454**) — sprawdzić fail-first.

## 4. Pytania do właściciela (tylko te, które zmieniają implementację)

> **Odpowiedzi właściciela 2026-10-17 → decyzje CP1–CP8 (§5):** 1 → CP1 (siatka) · 2 → CP2 (stały klucz, domyślnie
> **400 ms**) · 3 → CP3 ((a) — prędkość ignorowana dla zegara starcia; pauza zatrzymuje starcie) · 4 → CP4 ((a)) ·
> 5 → CP5 · 6 → CP6 (P2) · 7 → CP7 (P2, pierwsza pozycja); zgoda na R-P1-1 → CP8. Pytania po kodzie (§9.7) —
> odpowiedzi 2026-10-17, po bramce → CP9–CP12.

1. **Kształt B1:** siatka (wynik bit w bit jak dziś przy 60 FPS i 1 d/s — rekomendacja) czy prosty (jeden tik na rundę,
   krok dokładnie 0,110 dnia — wynik zmienia się względem dziś, w dwóch z trzech zmierzonych scen także klasa)?
2. **Czas trwania:** klucz na rundę (350 ms ⇒ 20 rund 6,7 s, 16 rund 5,3 s, 11 rund 3,5 s, 6 rund 1,75 s — zmierzone
   długości bitew sceny n: 6, 11, 16, 20 rund i dobicia po 1 rundzie) czy minimalny czas starcia (krótkie bitwy
   wydłużone — wynik bez zmian) czy wyższy domyślny (500 ms ⇒ 11 rund 5 s, 20 rund 9,5 s)? Rekomendacja: stały klucz
   350, korekta po bramce.
3. **Prędkość gracza w trakcie walki:** (a) ignorowana do końca starcia — rekomendacja, najprostsze; (b) skraca czas rundy
   (przewijanie bez zmiany wyniku), np. 1 d/s = 350 ms, 3 d/s = 117 ms, wyżej 50 ms.
4. **Bitwa w układzie, którego gracz nie ogląda** (model — stały krok — wymuszony w obu wariantach): (a) dzisiejsze
   tempo, 110 ms na rundę — rekomendacja, „bez zmian”; (b) tempo klucza jak bitwa oglądana (galaktyka zwalnia na ≤ 7 s
   przy każdej bitwie gracza).
5. **Zegar orbit (konieczny dla niezmienności — 452):** w trakcie starcia statki na orbitach ciał zwalniają razem
   z czasem gry (przy 350 ms ≈ ×0,31) — akceptacja wyglądu?
6. **450** („Tur: 0” i „0 tur”): w P1 (jedno pole rekordu) czy w P2?
7. **453** (kamera, smugi i znacznik przy starciu w innym układzie): w P1 (termin układu w auto-fokusie i efektach)
   czy w P2?

## 5. Decyzje

Prefiks **CP**. Podpisane przez właściciela **2026-10-17**: CP1–CP8 — odpowiedzi na §4, CP9–CP12 — odpowiedzi na
pytania §9.7 po bramce (brzmienie z polecenia sesji zamykającej P1). Słowa właściciela — dosłownie (oryginał angielski);
obok — odczyt w kodzie P1 (§9).

| CP | słowa właściciela (2026-10-17) | odczyt w kodzie P1 |
|---|---|---|
| **CP1** | „Shape = GRID (variant b1v): inside an engagement the world ticks with today's frame (16 ms game-step at 1 d/s) regardless of the player's speed setting or FPS; the DSCS round rule stays 110 ms of that grid; the tuning key only sets the real-time playback pace of grid frames. Outcome must equal today's (60 FPS, 1 d/s) in every probe scene.” | `TimeSystem`: gdy trwa co najmniej jedno aktywne starcie DSCS, tik gry = klatka siatki 16 ms przy 1 d/s, odtwarzana w tempie `110 / tempo rundy` czasu realnego; DSCS — runda co 110 ms zegara klatek symulacji. 34 przebiegi sondy na scenach n (g0, g1), a, co — wynik = dziś w każdej grupie (§9.3) |
| **CP2** | „Key SB_TUNING.combatRoundMs — int, default 400, range 50–1000, unit "ms", in the sbTuning table with sbSet/sbReset refusals. 16 rounds ≈ 6.4 s, 20 rounds ≈ 8 s.” | `SB_TUNING.combatRoundMs = { default: 400, type: 'int', min: 50, max: 1000, unit: 'ms' }`; konsument `TimeSystem.combatRoundMs()` (`getTuning` w chwili użycia); odmowy z ogólnej walidacji tabeli. Zmierzone: 16 rund — 6048 ms, 20 rund — 7616 ms od rundy 1 do ostatniej (15 / 19 odstępów) |
| **CP3** | „Player speed setting during an engagement is ignored for the engagement's own clock (restored after). PAUSE IS A PAUSE: while the game is paused the engagement is frozen too — no rounds, no grid frames, no catch-up after unpause (closes Finding 449); the engagement resumes exactly where it stopped, and the outcome is identical with or without the pause.” | siatka ma stały mnożnik 1 d/s; USTAWIENIA prędkości P1 nie rusza (keeper `combat_pace_smoke` T3b — świat bez `UIManager`). ⚠ **Sprostowanie 2026-10-17 (po `20e23a2`):** było „po starciu świat tyka tym, które gracz ma w tej chwili” — po rozstrzygnięciu bitwy z udziałem gracza `UIManager` robi auto-slow do 1 d/s (`src/scenes/UIManager.js:1563-1568`, Finding 157, bez zmian w P1), więc 1 r/s ustawione w trakcie starcia po starciu nie zostaje (walidator: `predkoscTeraz` 1 w obu wersjach kodu) — CP11. Pauza: `update()` wraca przed jakimkolwiek tikiem, zegar klatek i zaległość siatki stoją |
| **CP4** | „Engagements the player is not watching (other system) run at today's pace (110 ms real), not at the key; they also freeze on pause.” | `DeepSpaceCombatSystem.engagementView(activeSystemId)` → `watched` / `unwatched` / `null`; przy samych `unwatched` tempo = 110 ms realnych na rundę; pauza jak CP3 |
| **CP5** | „Orbit angle clock (Finding 452) switches to game time.” | kąt orbity statku (logika ×5, renderer ×2) liczy zegar klatek symulacji `TimeSystem` (`orbitClockSec()`): poza starciem przyrasta o czas realny klatki (dzisiejszy wygląd), w starciu krokami siatki, w pauzie stoi. „Game time” odczytany jako zegar `TimeSystem` z §3.1 i pytania 5 — nie rok gry `gameTime` (pytanie 2 §9.7) — potwierdzone: CP10 |
| **CP6** | „Finding 450 ("Tur: 0") → P2.” | 450 bez zmian w P1 — P2 |
| **CP7** | „Finding 453 (effects of a foreign-system engagement drawn in the viewed system, camera jump) → P2, first item.” | 453 bez zmian w P1 — P2, pozycja pierwsza |
| **CP8** | „Consent to retarget R-P1-1 (sb3_combat_closing T1–T10 onto the new clock), given 2026-10-17.” | R-P1-1 w C1 (§9.4) — commit `13ca6c9` |
| **CP9** | „R-P1-2: consent.” | R-P1-2 (`sb1_fleet_tuning_smoke` T11b — czwarty czytelnik tabeli strojenia: `TimeSystem`) w C2 — commit `bcecaa0` (`tools/commit_P1.sh --zgoda-R-P1-2`, §9.1) |
| **CP10** | „CP5 "game time" = TimeSystem frame clock (simClock), not the game year — stays.” | bez zmian w kodzie: zegar kąta orbit = zegar klatek symulacji `TimeSystem.simClockMs` (`orbitClockSec()`), nie rok gry `gameTime` |
| **CP11** | „CP3 "restored after": P1 does not touch the speed setting; after a battle involving the player the existing auto-slow to 1 d/s (Finding 157) stays.” | bez zmian w kodzie: P1 ustawienia prędkości nie rusza (T3b); po bitwie z udziałem gracza — auto-slow do 1 d/s (`UIManager`, 157) |
| **CP12** | „Finding 456 (planetary-battle batch window in real time) → separate step P3 after P2, audit first.” | 456 bez zmian w P1 i P2 — krok **P3** po P2, najpierw audyt (§7) |

## 6. Rejestr findingów arca

### #449–#455 — P1, audyt (2026-10-16)

⚠ **Registry-first (2026-10-16):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem —
najwyższy numer findingu **#448** (`AI_STRIKES_BACK_PLAN.md` §6, §8.6); trafienia „449”–„456” to liczby linii, ceny,
wartości tabel i identyfikatory sesji, nie findingi `[measured]`. Mapa numeracji: `OPEN_FINDINGS_INDEX.md` (#449– → ten plik).

### ✅ 449 — pauza w trakcie starcia nie zatrzymuje zegara rund: po odpauzowaniu zaległe rundy lecą po 4 na klatkę

`[code]` `DeepSpaceCombatSystem._tick` (`:507-535`): rundy liczone z `performance.now()`; w pauzie `TimeSystem` nie
emituje ticku, ale zegar realny płynie, więc po odpauzowaniu `now − _lastRoundMs` = długość pauzy i DSCS rozgrywa zaległe
rundy po `MAX_ROUNDS_PER_TICK` = 4 na klatkę, bez czasu gry między nimi. Grę pauzują m.in. gracz, okno wyniku bitwy
(`showBattleOutcome` — przy dwóch równoczesnych starciach), popupy zdarzeń losowych i misji. `[measured]` sonda P1, scena n:
pauza 2 s w rundzie 5 → rundy 6–16 w 3 klatkach (4 + 4 + 3), krok gry między nimi 0. → P1 (B1; w prototypie zero
nadrabiania i wynik identyczny jak bez pauzy).
→ **POLISH P1 — kod (2026-10-17; CP3): naprawa PRZYGOTOWANA w C1 (zestagowana) — zamknięcie przy commicie** (§9.6).
Pauza: `TimeSystem.update` wraca przed tikiem, a rundy DSCS liczy zegar klatek symulacji (`simClockMs`), który w pauzie
stoi — po odpauzowaniu nie ma czego nadrabiać. `[measured]` sonda na kodzie P1, scena n, klucz 400 ms, pauza 2 s i 30 s
po rundzie 5, starcie oglądane i nieoglądane: 0 tików i 0 rund w pauzie, rok gry i zegar klatek stoją, potem ≤ 1 runda na
klatkę, wynik = dziś; walidator bramki (prawdziwa gra, czas realny): pauza 10 s — 0 rund, rok gry i zegar klatek stoją;
keeper `combat_pace_smoke` T5, T7c.
✅ **ZAMKNIĘTY 2026-10-17 — `13ca6c9` (P1-1, CP3), bramka P1 PASS (§9.5a):** u właściciela w przebiegu 3 pauza ~10 s
w trakcie starcia — bez salw, nic się nie rusza; po klawiszu 5 (1 r/s) salwy w tym samym tempie, bez skoku pozycji;
w przebiegu 1 krótka pauza (1455 ms) — rok gry i zegar klatek przed = po; we wszystkich trzech przebiegach 0 rund
w pauzie, najwyżej 1 runda na klatkę, wynik ten sam. `combat_pace_smoke` na `bcecaa0` — 71 / 0.

### ⚪ 450 — okno wyniku bitwy w przestrzeni pokazuje zawsze „Tur: 0”, a Dziennik „0 tur” / „0 turns”

`[code]` rekord bitwy DSCS (`_finalizeBattle`, `:1060-1087`) nie ma pola `turns`; okno wyniku czyta `res.turns ?? 0`
(`BattleIntroModal:289`), linia Dziennika `result.turns ?? 0` (`GameScene:2667`). Liczba rund jest w `timeline` /
`currentRound`. Przypis po #165 w `VESSEL_ORDERS_PLAN.md` odnotował brak pola tylko jako wyjaśnienie odczytów „N tur”.
`[measured]` zrzut `p1_s4_wynik.png` (PL) po starciu 16-rundowym: okno „PORAŻKA · Gracz vs Liga Trzech Słońc · Tur: 0 ·
Straty: 1 / 0”, Dziennik „⚔ Bitwa w głębokim kosmosie (Propus): … Straty: 1/0, 0 tur.” → P2 albo P1 (pytanie 6).
→ **CP6 (2026-10-17): P2** (§7).

### ⚪ 451 — HP pojedynczego statku nie jest widoczne nigdzie

`[code]` w starciu panel walki (`CombatHUD._drawEncounterRow`, `:193-288`) pokazuje wyłącznie zbiorcze paski HP stron;
statki — nazwą, kadłubem, bronią i kolorem żywy/zniszczony. Trwałe uszkodzenia `vessel.combatDamage` (bez regeneracji —
decyzja 2026-05-20) nie mają czytelnika w UI (grep: wyłącznie `VesselManager`, `DeepSpaceCombatSystem`,
`SaveMigration`, `ThreatMath`). → P2.
→ **P2 (§7):** pasek HP nad statkiem aktywnego starcia + błysk trafienia na modelu (§3.3).

### ✅ 452 — kąt orbity statku wokół ciała liczony w czasie REALNYM zmienia geometrię walki

`[code]` `performance.now() × 0,001` w `VesselManager._updatePositions` (`:2497`, `:2536`, `:2573`), w
`EnemyAttackHandler` (`:379`) i jako wartość domyślna `OrbitalSpaceSystem.getPosition` (`:199`); dotyczy statków
z zarejestrowaną orbitą (rejestracja przy `vessel:arrived`). `[measured]` prototyp B1-prosty bez zegara orbit, scena n:
przy 600 ms druga bitwa ma 6 rund zamiast 16 i strażnik ginie (pierwsza identyczna), przy 110 i 350 ms — identycznie jak
z zegarem orbit; z zegarem orbit 110 = 350 = 600 ms. W scenie co (obrońcy z jawnie zarejestrowaną orbitą) bez wpływu na
wynik — 110 = 350 = 600 ms także bez zegara orbit. Konieczność stoi na jednym zmierzonym przypadku. → P1 (zegar orbit,
pytanie 5).
→ **POLISH P1 — kod (2026-10-17; CP5): naprawa PRZYGOTOWANA w C1 — zamknięcie przy commicie** (§9.6). Kąt orbity
z zegara klatek symulacji (`SimClock.orbitClockSec()`) w `VesselManager._updatePositions` ×3, `EnemyAttackHandler`
(świeży wrak na orbicie) i `OrbitalSpaceSystem.getPosition` (wartość domyślna), a także w rendererze
(`_tickOrbitingVessels`, `_tickOrbitingStations` — inaczej sprite rozjeżdżałby się z pozycją logiczną po każdej pauzie).
`[measured]` scena co (orbita jawna), starcie oglądane, klucz 110 / 400 / 1000 — wynik = dziś; keeper `combat_pace_smoke`
T8 (w pauzie kąt stoi, po 10 s pauzy pierwszy krok = ω × 16 ms, w starciu przyrasta krokami siatki).
✅ **ZAMKNIĘTY 2026-10-17 — `13ca6c9` (P1-1; CP5, CP10 — zegar klatek symulacji, nie rok gry):** zamknięcie stoi na
sondzie (scena co) i keeperze T8 — scena bramki u właściciela (§9.5a) to statki w wolnej przestrzeni, bez orbit ciał,
więc zegara orbit nie ćwiczy; wygląd orbit w pauzie w przeglądarce — nieraportowany (§9.8).

### ⚪ 453 — starcie w innym układzie: kamera, smugi i znacznik starcia lądują w oglądanym układzie

`[code]` brak terminu układu w trzech miejscach `ThreeRenderer`: auto-fokus na `vessel:engaged` (`:1060-1073`) przestawia
cel kamery na punkt starcia i zbliża ją (≤ 6); `_onCombatRoundFx` (`:6176`) rysuje smugi — dla statków spoza oglądanego
układu sprite'ów nie ma (`_syncVesselPositions` je usuwa), więc `_combatEndpointWorld` bierze migawki pozycji z ładunku;
`_upsertEngagementMarker` (`:6292`) stawia pierścień w punkcie starcia. `[measured]` sonda zrzutów (widok `sys_home`,
starcie w `sys_059`): po rundzie 1 pierścień w świecie (13,77; −6,00) = punkt starcia / 10, po rundzie 6 dwie smugi
(13,19; −7,48) → (13,73; −6,14) na wysokości 0,3 (migawki), cel kamery (13,28; −5,78) przy malejącym dystansie — pusty
punkt w ramce oglądanego układu (klasa „globalne id ≠ położenie”); zrzut `screenshots/cross_system/p1_x1_strzal.png`.
→ P1 albo P2 (pytanie 7).

### ✅ 454 — `fleet_engage_scope` T3b i `fleet_engage_picker_frame` T5b zależą od tempa czasu realnego

`[code]` kontrola anty-jałowości „po 120 tikach starcie nadal aktywne” trzyma się, bo 120 tików w node mija szybciej niż
kolejne rundy (110 ms realne). `[measured]` z `performance.now` przesuwanym o 60 ms na wywołanie (wolna maszyna) obie
padają (encounters = 0 — bitwa zdąży się rozstrzygnąć). → P1 (pod B1 — rundy z zegara starcia — surowe `time:tick`
keeperów dają wyłącznie pierwszą rundę: piny stają się deterministyczne; do sprawdzenia fail-first przy wdrożeniu).
→ **POLISH P1 — kod (2026-10-17): zmierzone — na kodzie P1 deterministyczne; zamknięcie przy commicie C1** (§9.6), bez
zmian w keeperach. `[measured]` z zegarem realnym +60 ms na wywołanie (`probes/slowclock_454.mjs`): na `1af65fc`
`fleet_engage_scope` 50 / 1 (T3b: encounters = 0) i `fleet_engage_picker_frame` 51 / 1 (T5b: encounters = 0); na kodzie P1
51 / 0 i 52 / 0 (encounters = 1) — tak samo z zegarem zwykłym. Powód: keepery nie mają prawdziwego `TimeSystem`, więc
`combatClockMs()` = 0 — zegar starcia stoi, starcie rozgrywa wyłącznie pierwszą rundę, niezależnie od tempa maszyny.
✅ **ZAMKNIĘTY 2026-10-17 — `13ca6c9` (P1-1), bez zmian w keeperach:** na `bcecaa0` `fleet_engage_scope_smoke` 51 / 0
i `fleet_engage_picker_frame_smoke` 52 / 0; sweep 310/310 `[measured]`.

### ⚪ 455 — salwa pierwszej rundy starcia nie została narysowana na mapie — widoczna tylko w logu panelu

`[measured]` sonda zrzutów P1 (scena n, kod HEAD): runda 1 pierwszego starcia — 2 strzały, 2 trafienia (rakiety, −70 HP
ze 120 fregaty gracza), a klatkę później `ThreeRenderer._activeEffects` = 0; rundy 6 i 11 (strzały) — 2 i 5 aktywnych
efektów. `[code]` jedyna ścieżka, która pomija smugę: `_onCombatRoundFx` → `_combatEndpointWorld` zwraca `null`, gdy wróg
ma jakość kontaktu poniżej `contact` (`_isEnemyEndpointVisible`, `ThreeRenderer:6182-6183`). Jakości kontaktu w chwili
rundy 1 nie zmierzono; klatkę później etykieta wroga ma już nazwę. Najsilniejsza salwa tego starcia była widoczna
wyłącznie w logu panelu. Zmierzone na jednym starciu. → P2 (§7).

### #456–#457 — P1, kod (2026-10-17)

⚠ **Registry-first (2026-10-17):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem —
najwyższy numer findingu **#455**; trafienia „456”–„459” to zapis „pierwszy wolny 456” `[measured]`.

### ⚪ 456 — okno partii bitwy planetarnej liczy 500 ms CZASU REALNEGO: bitwa rozstrzyga się także w pauzie, a skład partii zależy od tempa

`[code]` `EnemyAttackHandler._onVesselArrived` (`:66-69`): pierwszy przylot wroga z misją `attack` uruchamia
`setTimeout(…, BATTLE_BATCH_WINDOW_MS)` = 500 ms (`:28`); napastnicy, którzy dolecą w tym oknie, walczą razem. Okno płynie
w czasie REALNYM: bitwa planetarna rozstrzyga się także wtedy, gdy gracz zapauzował grę w tym oknie (pauza nie jest pauzą —
rodzina **449**), a w trakcie oglądanego starcia DSCS (siatka P1, klucz 400 ms) 500 ms realnych to ≈ 137 ms czasu siatki
zamiast dzisiejszych 500 ms — w jednej partii mniej przylotów. Bitwa planetarna nie ma przebiegu (**165**). Niezmierzone:
sceny dowodu P1 nie mają bitwy planetarnej. → poza P1 (pytanie 4 §9.7).
→ **CP12 (2026-10-17): osobny krok P3 po P2 — najpierw audyt** (§7).

### ⚪ 457 — znacznik starcia gaśnie po 1600 ms CZASU REALNEGO bez rundy ze strzałem — przy 400 ms na rundę także w trakcie starcia

`[code]` `ThreeRenderer._upsertEngagementMarker` (`:6292-6306`) odświeża znacznik WYŁĄCZNIE przy `combat:roundFx`, a DSCS
emituje go tylko z rundy ze strzałem (`:720`, `round.events.length > 0`); `_tickEngagementMarkers` (`:6320-6327`) usuwa
znacznik po 1600 ms realnych bez odświeżenia, następny strzał stawia go od nowa. Dziś (110 ms na rundę) to 14 rund bez
strzału; przy 400 ms — 4 (zbliżanie, odliczanie broni: rakieta co 5 rund); w pauzie znacznik gaśnie po 1,6 s.
`[measured]` walidator bramki P1 (prawdziwa gra, headless — klatki ~100–150 ms, więc przerwy w czasie zegarowym są
zawyżone): drzewo dev C2 — przy 400 ms po jednej przerwie znacznika w trakcie starcia w obu przebiegach (1404 ms między
rundami 1 i 4 oraz 1613 ms między rundami 2 i 3), przy 110 ms zero; zestagowane repo — przy 400 ms po jednej (1499 ms,
rundy 5→6; 1531 ms, rundy 2→3) i jedna także przy 110 ms (1221 ms, rundy 7→8); `1af65fc` — zero. ⚠ **Sprostowanie
2026-10-17 (po `20e23a2`):** wpis mówił „przy 110 ms i na `1af65fc` — zero” — trzeci przebieg walidatora (zestagowane
repo) tego nie potwierdza. W headless długie klatki rysowania wstrzymują grę na ~1 s, więc pomiar walidatora nie
rozstrzyga — 457 stoi na `[code]`. Bramka u właściciela (§9.5a): zachowania znacznika nie raportowano. Prezentacja, nie
przebieg. → P2 (§7).

## 7. Następne kroki

1. ~~Odpowiedzi na §4~~ → **CP1–CP8 (2026-10-17, §5).**
2. ~~P1 — kod~~ → **ZAMKNIĘTY W KODZIE 2026-10-17:** bramka `gate/GATE_P1.md` u właściciela PASS (§9.5a) → zgoda na
   R-P1-2 (CP9) → commity `13ca6c9` (P1-1) · `bcecaa0` (P1-2) → zamknięcia 449 / 452 / 454 (tutaj) i 438 / 436
   (`AI_STRIKES_BACK_PLAN.md` §6) — §9.6.
3. **P2 — widoczność** (kolejność właściciela, CP6 / CP7) — **następny krok, najpierw audyt, bez kodu:** **453** (pierwsza —
   termin układu w auto-fokusie, smugach i znaczniku starcia) · **450** („Tur: N” z liczby rund) · **455** (salwa
   pierwszej rundy) · **451** (pasek HP nad statkiem aktywnego starcia + błysk trafienia na modelu) · kandydat **457**
   (znacznik starcia przy 400 ms).
4. **P3** — **456** (okno partii bitwy planetarnej w czasie realnym; CP12): osobny krok po P2, najpierw audyt.
5. Dalej kolejka arca (§0).

## 8. Warsztat — lekcje sondy (wiążące dalej)

- **Three.js zjada strumień `Math.random` gry.** `generateUUID` (`src/lib/three.core.js`) losuje 4 razy na każdy obiekt;
  asynchroniczne wypiekanie tekstur planet i `GLTFLoader` kończą się w chwili zależnej od obciążenia maszyny. Pierwsza
  macierz P1 dała dwa RÓŻNE wyniki dla identycznej konfiguracji (488 vs 536 losowań poza klatką sondy, wszystkie
  z `generateUUID`). Poprawka sondy: `three.core.js` → strumień renderera, jak `rendererRng` dla `ThreeRenderer.js`;
  kontrola X = X wróciła (0 losowań poza klatką). Sonda porównująca przebiegi liczy losowania poza klatką — niezerowa
  liczba unieważnia porównanie. Macierz M1 jest unieważniona jako porównanie wyników (zostają pomiary mechanizmów).
- **Prędkość „w walce” nie może przeciekać po walce:** sonda C6 zostawiała podwyższoną prędkość po starciu (gdy była
  wyższa od bazowej) — mierzyła więc też kolejne bitwy.
- **FPS to dwa pytania:** pełny przebieg w innym FPS zmienia dolot (start starcia, ziarno); niezmienność samej walki
  mierzy się FPS-em zmienianym wyłącznie w trakcie starcia.
- **Scena musi ćwiczyć mechanizm:** orbita statku wokół ciała jest liczona tylko dla statków z zarejestrowaną orbitą
  (`vessel:arrived`); strażnik puli i obrońcy postawieni sondą stoją w środku ciała (scena c niewrażliwa na czas rundy).
  Scena „co” rejestruje orbitę jawnie.
- **Klucz w sondzie nie może dotknąć reguły, której nie dotyczy.** Wariant „siatka” dzielił z resztą wariantów linię
  podmiany `ROUND_INTERVAL_MS` = klucz — przebiegi przy 350 / 600 ms mierzyły REGUŁĘ 350 / 600, nie tempo. Wydało się
  przy porównaniu z odniesieniem: „siatka przy 350 ms” = „dziś przy 350 ms” bit w bit. Złe przebiegi zostały jako
  kontrola konstrukcji (`results/m5/README_M5.md`), poprawione — `results/m6/`.
- **Obciążenie:** maszyna przerabia ~7 klatek gry na sekundę łącznie, niezależnie od liczby równoległych Chrome; render
  SwiftShader pod obciążeniem (5 Chrome) to dziesiątki sekund na klatkę — zrzuty robić osobno.
- **(P1 — kod) Scena nieoglądana nie ćwiczy klucza.** Pierwsza partia dowodu na kodzie P1 dała ten sam czas realny
  przy kluczu 110 i 1000 ms — starcia scen n i a toczą się w układzie stolicy `emp_001`, a widok sondy stał na układzie
  domowym (CP4: tempo 110 ms). Dowód tempa wymaga widoku przełączonego na układ starcia (`run_p1c.mjs`, `P1_VIEW=battle`).
- **(P1 — kod) Losowania poza klatką z ustawiania sceny przez samą sondę są deterministyczne:** scena co — 9 losowań
  (`OrbitalSpaceSystem.assignOrbit` z `setupCDorbit`), te same w każdym przebiegu i w kontroli X = X; liczyć je osobno od
  losowań asynchronicznych (UUID Three.js), które unieważniają porównanie.
- **(P1 — kod) Bramka w czasie realnym — ziarno z roku utworzenia.** Ziarno starcia (`floor(rok × 10000) × 7919`) u
  właściciela byłoby inne niż w walidatorze (inny rok utworzenia sceny): ta sama scena dała 6 rund z ziarnem roku
  60,1171 i 16 z ziarnem ustawionym jawnie (strojenie, 16 ziaren: 7–20 rund). Krok sceny ustawia ziarno jawnie; liczba
  rund i tak może się lekko różnić — bramka sprawdza własność (trzy przebiegi z jednego zapisu = ten sam wynik), nie
  identyfikator.
- **(P1 — kod) Po F5 → Continue gra rusza bez pauzy** (`isPaused` nie jedzie w zapisie): starcie z zapisu gra w tempie
  klucza z zapisu, zanim właściciel wciśnie spację — krok sceny ustawia klucz 1000 ms przed zapisem.
- **(P1 — kod) Zamknięty zbiór czytelników tabeli strojenia** (`sb1_fleet_tuning_smoke` T11b) nie stoi w audycie A5 —
  każdy nowy konsument tabeli to przecelowanie (tu R-P1-2); sprawdzić przed wpięciem kolejnego klucza.
- **(P1 — kod) Czas zegarowy headless ≠ czas gry:** klatki walidatora z rysowaniem SwiftShader trwają ~100–150 ms, a `dt`
  ograniczone do 100 ms — tempo rund mierzyć z czasu, który gra dostała (suma `dt`), nie z zegara ściennego.
- **(P1 — bramka) Straty ≠ wraki przy limicie rund:** `lossesA/B` liczą wyłącznie statki z HP ≤ 0 (`_countLosses`), a przy
  limicie 20 rund żywi przegrani też idą na wrak (432) — u właściciela straty 1/1 przy trzech wrakach (§9.5a). Odczyt
  bramki porównuje wynik i listę wraków razem; różnica liczb to nie błąd rejestratora.

## 9. P1 — kod (2026-10-17): ZACOMMITOWANY — `13ca6c9` (P1-1), `bcecaa0` (P1-2)

Polecenie właściciela (2026-10-17): kod P1 według CP1–CP8 — audyt przed kodem (§2–§3), keeper fail-first, jeden temat na
commit, każdy commit zielony (pełny sweep + `check-i18n`), STOP przed commitem; przecelowanie R-P1-1 za zgodą (CP8), każde
inne czerwone → `*.PROPOSED` + dowód mutacyjny. Folder: `kosmos-handover/polish-p1-code/` (SHA256SUMS).

### 9.1 Łańcuch `[git]` `[measured]`

| krok | treść | keeper kroku | sweep · `check-i18n` |
|---|---|---|---|
| **P1-1 (C1)** `13ca6c9` | zegar starcia — siatka (CP1, CP3, CP4), zegar orbit (CP5), keeper NEW `combat_pace_smoke`, przecelowanie **R-P1-1** (CP8) | `combat_pace_smoke` 58 / 0; fail-first na bazie **27 PASS / 31 FAIL** | **310/310** OK, 0 FAIL, 31 advisory · PASS, pl = en 3458 |
| **P1-2 (C2)** `bcecaa0` | klucz `combatRoundMs` (CP2), keeper T10, przecelowanie **R-P1-2** (za zgodą) | `combat_pace_smoke` 71 / 0; fail-first wersji z C2 na C1 **58 PASS / 13 FAIL** (czerwone dokładnie T10) | **310/310** OK, 0 FAIL, 31 advisory · PASS, pl = en 3458 |

Baza `1af65fc`: sweep 309/309, `check-i18n` PASS 3458. Liczby — budowa weryfikacyjna w świeżym klonie
(`tools/build_chain_P1.sh`, `results/chain_verify/`); drzewa kroków na bazie `20e23a2` (commit dokumentacji P1) —
`patches/trees.txt`. Commity 2026-10-17 `[git]`: `tools/commit_P1.sh --zgoda-R-P1-2` (po bramce §9.5a i zgodzie CP9;
test na sucho `tools/dryrun_P1.sh`) — `13ca6c9` (P1-1, drzewo `6c216dc8`) i `bcecaa0` (P1-2, drzewo `0dd82ac1`), zakres
`20e23a2..bcecaa0`; drzewa = `patches/trees.txt`. Na `bcecaa0` `[measured]`: sweep **310/310** OK, 0 FAIL, 31 advisory ·
`check-i18n` PASS, pl = en 3458 · `combat_pace_smoke` 71 / 0 · `sb3_combat_closing_smoke` 28 / 0 ·
`sb1_fleet_tuning_smoke` 71 / 0 · `fleet_engage_scope_smoke` 51 / 0 · `fleet_engage_picker_frame_smoke` 52 / 0.

**Pliki:** NEW `src/data/CombatPaceData.js` (reguła rund 110 ms, klatka siatki 16 ms, prędkość siatki = indeks 1 d/s,
najwyżej 8 klatek siatki na klatkę gry, tempo starcia nieoglądanego 110 ms) · NEW `src/utils/SimClock.js` (`simClockMs()`,
`combatClockMs()` — bez zegara stała 0, `orbitClockSec()` — bez zegara czas realny) · `TimeSystem` (`simClockMs`,
`_updateCombatGrid`, `combatRoundMs()`, `_combatView()`) · `DeepSpaceCombatSystem` (`_tick` z `combatClockMs()`,
`engagementView()`, `ROUND_INTERVAL_MS` = `COMBAT_ROUND_RULE_MS`, `_nowMs` usunięte) · zegar orbit:
`VesselManager._updatePositions` ×3, `EnemyAttackHandler._turnIntoWreck`, `OrbitalSpaceSystem.getPosition` (wartość
domyślna), `ThreeRenderer._tickOrbitingVessels` i `_tickOrbitingStations` · `StrikesBackData` (wiersz `combatRoundMs`) ·
keepery: NEW `combat_pace_smoke`, `sb3_combat_closing_smoke` (R-P1-1), `sb1_fleet_tuning_smoke` (R-P1-2).
Save v101 bez migracji: zegar klatek nie jedzie w zapisie (jak dotąd `performance.now`), klucz jedzie z tabelą strojenia
(SB16). Zero nowych kluczy słownika: jednostka „ms” jest taka sama w PL i EN, a tabela strojenia trzyma jednostki jako
dane (tak jak pozostałe 18 kluczy; tabela to narzędzie konsoli).

### 9.2 Mechanizm `[code]`

- `TimeSystem.update(deltaMs)`: pauza albo mnożnik 0 → powrót przed czymkolwiek (zegar klatek i zaległość siatki stoją).
  Zegar klatek symulacji `simClockMs` (ms) kotwiczy się w czasie realnym przy pierwszym tiku; poza starciem przyrasta
  o `deltaMs`, w starciu o 16 ms na klatkę siatki; nie jedzie w zapisie.
- Starcie aktywne (`engagementView(activeSystemId)` ≠ `null`): zaległość += `deltaMs × 110 / tempo`; każda pełna klatka
  siatki → `time:tick` z `deltaYears` = 16 ms × 1 d/s (dzisiejsza klatka 60 FPS przy auto-slow), najwyżej 8 na klatkę gry
  (zaległość ≤ 8 klatek ≈ 1 runda); pauza w trakcie tików (okno wyniku, zdarzenie) albo koniec ostatniego starcia — reszta
  zaległości przepada. Tempo: co najmniej jedno aktywne starcie w oglądanym układzie — `combatRoundMs()`; tylko starcia
  w innych układach — 110 ms (CP4).
- DSCS: runda co 110 ms zegara starcia (`combatClockMs()`); `MAX_ROUNDS_PER_TICK` zostaje jako bezpiecznik — przy siatce
  ≤ 1 runda na tik; bez prawdziwego `TimeSystem` (keepery z surowym `time:tick`) zegar stoi — wyłącznie pierwsza runda.
- Czas realny rundy: 6 albo 7 klatek siatki (96 / 112 ms, średnio 110) w tempie `tempo / 110` — przy 400 ms średnio
  400 ms, kwant 16 × 400 / 110 ≈ 58 ms.
- Galaktyka w trakcie oglądanego starcia płynie siatką: przy 400 ms ≈ 0,275 d/s (110 / 400 × 1 d/s) przez ≤ 7,6 s (20
  rund), niezależnie od ustawionej prędkości. Ustawienia prędkości kod P1 nie rusza (keeper `combat_pace_smoke` T3b —
  świat bez `UIManager`): auto-slow do 1 d/s przy rozpoczęciu starcia zostaje jak dotąd (`TimeSystem.js:70-78`), a po
  rozstrzygnięciu bitwy z udziałem gracza `UIManager` robi auto-slow do 1 d/s (`src/scenes/UIManager.js:1563-1568`,
  Finding 157, bez zmian w P1) — 1 r/s ustawione w trakcie starcia po starciu nie zostaje (walidator: `predkoscTeraz` 1
  w obu wersjach kodu). ⚠ **Sprostowanie 2026-10-17 (po `20e23a2`):** było „po starciu — prędkość ustawiona przez
  gracza”; to samo uproszczenie niesie wiadomość commita `13ca6c9` („po starciu świat tyka ustawioną”) — CP11.

### 9.3 Dowód — sonda deterministyczna na kodzie P1 `[measured]`

Sonda audytu (prawdziwa gra, fixture GATE-S4, zegar wirtualny, `Math.random` gry ziarnisty, `three.core.js` na strumieniu
renderera, tryb klatek) na drzewie dev C2 (`staged`) i na `1af65fc` (`today`); sterowniki: `run_p1.mjs` audytu (widok na
układzie domowym) i `run_p1c.mjs` (ta sama sonda + prawdziwa ścieżka pauzy, odczyt zwrotny klucza w grze, widok
przełączany na układ starcia — `P1_VIEW=battle`). **34 przebiegi** (`results/TABLE_proof.md`); grupa = scena · geometria ·
widok (starcie oglądane = układ bitwy jest układem oglądanym):

| grupa | przebiegi | sygnatura |
|---|---|---|
| n g0 · nieoglądane | dziś · klucz 110 / 400 / 1000 · prędkość w walce 1 t/s i 1 r/s · klatka walki 33 ms · pauza 2 s i 30 s | **= dziś (9/9)** |
| n g0 · oglądane | dziś · klucz 110 / 400 / 1000 · 400 + 1 r/s · 400 + klatka walki 33 ms · 400 + pauza 2 s i 30 s | **= dziś (8/8)** |
| n g1 · nieoglądane / oglądane | nieoglądane: dziś · klucz 110 / 400 / 1000; oglądane: dziś · klucz 400 | **= dziś (4/4 · 2/2)** |
| a · nieoglądane / oglądane | nieoglądane: dziś · klucz 110 / 400 / 1000; oglądane: dziś · klucz 400 | **= dziś (4/4 · 2/2)** |
| co (orbita jawna) · oglądane | dziś + kontrola X = X · klucz 110 / 400 / 1000 | **= dziś (5/5)** |

**Tempo** (czas realny 1. starcia od rundy 1 do ostatniej, zegar wirtualny sondy): oglądane — scena n g0 (16 rund): dziś
1664 ms · klucz 110 → 1664 · **400 → 6048** · 1000 → 15 120 · 400 + 1 r/s → 6048 · 400 + klatka walki 33 ms → 6072 ·
400 + pauza 2 s → 8048 · 400 + pauza 30 s → 36 048; scena a (20 rund): dziś 2096 · **400 → 7616**; n g1 (6 rund): dziś
560 · 400 → 2032; co (6 rund): dziś 560 · 110 → 560 · 400 → 2032 · 1000 → 5088. Nieoglądane — przy KAŻDYM kluczu
dzisiejsze 1664 / 560 / 2096 ms (CP4; pauza dodaje swoją długość: 3664 / 31 664). ⚠ CP2 „16 rounds ≈ 6.4 s” liczy
16 × 400 — od pierwszej do ostatniej rundy jest 15 odstępów: 15 × 400 + 48 ms kwantu siatki = 6048 ms.
**Krok gry na rundę** — 0,096 / 0,112 dnia we wszystkich przebiegach (dziś przy 60 FPS i 1 d/s — to samo). **Pauza** (4
przebiegi): 0 tików i 0 rund w pauzie, rok gry i zegar klatek stoją; po pauzie najwyżej 1 runda na klatkę (wszystkie 34
przebiegi: najwyżej 1). **Losowania poza klatką:** 0 — z wyjątkiem sceny co: 9 losowań samej sondy przy ustawianiu sceny
(`assignOrbit`), deterministycznych, tych samych w każdym przebiegu i w kontroli X = X (§8).

### 9.4 Keepery i przecelowania `[measured]`

- **`combat_pace_smoke`** (NEW; T1–T10, 71 asercji po C2): prawdziwy `TimeSystem.update` w pętli klatek, zegar wirtualny,
  łańcuch `time:tick` → VesselManager → Proximity → VCS → DSCS → MOS → EAH; sygnatura i czas gry KAŻDEJ rundy = nagranie
  z `1af65fc` (`--record`; 17 rund, 1760 ms) przy kluczu 110 / 400 / 1000, prędkości w walce 1 d/s … 1 r/s, klatce walki
  33 ms, pauzie 2 s i 30 s; starcie nieoglądane — 110 ms także przy kluczu 1000, zamarza w pauzie; zegar orbit; piny
  źródłowe (DSCS bez czasu realnego, orbity przez `orbitClockSec()`); T10 — klucz (wiersz tabeli, odczyt w chwili użycia,
  tempo z konsoli, pięć odmów bez zmiany stanu, reset, konsument). Fail-first: 27 / 31 na bazie (czerwone: tempo z kluczem,
  prędkości 3 d/s … 1 r/s, klatka 33 ms, zegar w pauzie i brak nadrabiania, krok gry na rundę, świadek starcia oglądanego,
  zegar orbit, piny źródłowe); wersja z C2 na C1 — 58 / 13 (T10).
- **R-P1-1** (CP8, w C1): `sb3_combat_closing_smoke` — pomocnik `round()` przesuwa zegar starcia
  (`timeSystem.simClockMs` += 110) zamiast podmienionego `performance.now`; asercje T1–T10 bez zmian. Oryginał na kodzie
  C1: **25 / 3** (T1, T6, T6b — zegar starcia stoi, fregaty nie strzelają); przecelowany: na C1 28 / 0, na bazie 25 / 3.
- **R-P1-2** (zgoda właściciela 2026-10-17 — CP9; w C2, `bcecaa0`): `sb1_fleet_tuning_smoke` T11b pinuje ZAMKNIĘTY zbiór
  czytelników `StrikesBackTuning.js` (GameScene, FleetLimit, planer fali — rozszerzony raz, R-S3-1); C2 dokłada czwartego:
  `TimeSystem` (CP2 — konsument w chwili użycia). Audyt A5 (§2.5) tego pinu nie wymienił. Oryginał na C2: **70 / 1**
  (T11b); propozycja: na C2 71 / 0, na C1 70 / 1. Dowód mutacyjny 7 / 7 zgodnych (3 / 3 mutanty zabite: piąty czytelnik
  — DSCS, `TimeSystem` bez odczytu tabeli, czytelnik w nowym module); `proposed/sb1_fleet_tuning_smoke.mjs.{ORIG,PROPOSED}`,
  `proposed/R-P1-2.diff`.
- **454** — jak w §6 (deterministyczne na kodzie P1, bez zmian w keeperach).
- Nietknięte i zielone (sweep 310/310): `battle_result_classification` (auto-slow), `sb1_fleet_pool` T1c (konsument
  klucza), keepery kończące starcie wprost i ustawiające starcie ręcznie, keepery `GameCore`.

### 9.5 Bramka w przeglądarce `[measured]`

`kosmos-handover/polish-p1-code/gate/GATE_P1.md` — gra po angielsku, tryb klatek: 7 kroków konsoli, 3 kroki czasu
(T1 — klucz 400 ms ze stoperem, T2 — 110 ms ze stoperem, T3 — 400 ms z pauzą 10 s w trakcie i przełączeniem na 1 r/s),
3 × F5 → Continue. Scena: 2 fregaty gracza z laserem i 2 fregaty obrony układu emp_001 w wolnej przestrzeni układu
domowego; starcie utworzone na pauzie, ziarno ustawione jawnie (ziarno z roku utworzenia byłoby u właściciela inne),
klucz 1000 ms na czas wczytań, zapis — trzy przebiegi z tego zapisu. Walidator (prawdziwa gra na fixture GATE-S4,
headless, klatki w czasie realnym): **kod P1** — drzewo dev C2: trzy przebiegi identyczne (16 rund · 23 strzały ·
15 trafień · zwycięzca B · straty 2/0), tempo z czasu gry 398 / 117 / 402 ms na rundę; zestagowane repo (dopisane
2026-10-17 — sprostowanie po `20e23a2`): wynik ten sam, 408 / 111 / 403 ms na rundę; w obu w pauzie 10 s — 0 rund, rok
gry i zegar klatek stoją,
najwyżej 1 runda na klatkę, przy 1 r/s krok gry na rundę 0,096 / 0,112 dnia; **kontrola `1af65fc`** — w tej scenie wynik
ten sam, ale ≈ 40 ms czasu gry na rundę, do 4 rund na klatkę (po pauzie — 449) i 7,1–7,4 dnia gry na rundę przy 1 r/s
(438); 0 wyjątków w obu.

### 9.5a Bramka u właściciela — 2026-10-17: PASS `[measured: odczyt właściciela]`

Przeglądarka właściciela, scenariusz `gate/GATE_P1.md` (fixture GATE-S4); kod P1 zestagowany (drzewo indeksu = C2 —
te same pliki, które weszły w `13ca6c9` + `bcecaa0`). Odczyty konsoli — z raportu właściciela; stopera nie zapisano.

| krok | odczyt |
|---|---|
| 1 — scena na pauzie | rok 60,1469 · `sys_home` · strażnicy `v_30` / `v_31`, fregaty `v_32` / `v_33` · rozkazy ok, ok · starcie `encounter_60_15_player_emp_001` · ziarno 468532936 · klucz przed zapisem 1000 · zapis |
| przebieg 1 — krok 2 → T1 → krok 3 (klucz 400) | po wczytaniu runda 8, 2 vs 2 · **20 rund, 28 strzałów, 20 trafień, zwycięzca B, bez odwrotu, straty 1/1** · wraki P1 F0, P1 F1, P1 Guard0 · rund zarejestrowanych 12, 4437 ms, `msNaRunde` 403, krok gry 0,112 / 0,096 dnia · najwyżej 1 runda na klatkę · 0 rund w pauzie (krótka pauza 1455 ms — rok gry i zegar klatek przed = po) |
| przebieg 2 — krok 4 → T2 → krok 5 (klucz 110) | po wczytaniu runda 8 · wynik i wraki = przebieg 1 · najwyżej 1 runda na klatkę · 0 rund w pauzie |
| przebieg 3 — krok 6 → T3 → krok 7 (klucz 400) | po wczytaniu runda 8 · ~2 s salw, pauza ~10 s — bez salw, nic się nie rusza; klawisz 5 (1 r/s) — salwy w tym samym tempie, bez skoku pozycji · wynik i wraki = przebieg 1 · najwyżej 1 runda na klatkę · 0 rund w pauzie |
| oko | salwy co ≈ 0,4 s w przebiegach 1 i 3, szybko w przebiegu 2 |
| konsola | błędów nie zgłoszono |

- **Własność bramki spełniona:** trzy przebiegi z jednego zapisu — klucz 400 ms, 110 ms oraz 400 ms z pauzą ~10 s
  i przełączeniem na 1 r/s — dały ten sam wynik i te same wraki; w pauzie zero rund, najwyżej 1 runda na klatkę.
- **20 rund zamiast 16 walidatora — przewidziane:** inny rok utworzenia sceny (60,1469 wobec 60,117 w walidatorze)
  przesuwa przebieg (§8 — „ziarno z roku utworzenia”); bramka sprawdza własność, nie identyfikator.
- **Starcie kończy się limitem rund** `[code]`: przy 20 rundach wygrywa strona z większą sumą HP
  (`DeepSpaceCombatSystem._checkEndConditions`, `:844-848`), a żywi przegrani idą na wrak (`_finalizeBattle`,
  `:1098-1107` — Finding **432**, bez zmian w P1); straty liczą wyłącznie statki z HP ≤ 0 (`_countLosses`, `:1465-1473`)
  ⇒ straty 1/1 przy trzech wrakach — żywa fregata gracza na wrak przy limicie `[derived]`. Ścieżka limitu rund jest na
  kodzie P1 tak samo niezależna od tempa jak zniszczenie.
- **Tempo** `[derived]`: przebieg 1 — 11 odstępów × 403 ms ≈ 4433 ms (odczyt 4437 ms), czyli czas gry rundy ≈ klucz
  400 ms w przeglądarce właściciela (walidator: 398–408 ms).
- **Nieraportowane:** stoper (T1, T2), znacznik starcia (457), orbity w pauzie (scena bez orbit ciał) — §9.8.

### 9.6 Zamknięcia — 2026-10-17 (`13ca6c9`, `bcecaa0`; bramka §9.5a PASS)

- ✅ **449** — `13ca6c9` (C1) w całości (CP3: zero rund i klatek siatki w pauzie, bez nadrabiania, wynik jak bez pauzy).
- ✅ **452** — `13ca6c9` (C1; CP5, CP10).
- ✅ **454** — `13ca6c9` (C1; bez zmian w keeperach; deterministyczne).
- ✅ **438** / ✅ **436** (`AI_STRIKES_BACK_PLAN.md` §6) — `13ca6c9` + `bcecaa0` (wynik niezależny od prędkości, FPS
  walki, czasu rundy i pauzy; starcie oglądane 400 ms na rundę — 16 rund ≈ 6 s).
- Bez zmian: **432** (limit 20 rund — wynik dzisiejszy; starcie bramki u właściciela kończy się limitem — §9.5a),
  **450** / **451** / **453** / **455** / **457** (P2), **456** (P3, CP12), **165**.
- Rejestr arca #449–#457 po zamknięciach: ✅ 3 (449, 452, 454) · ⚪ 6 (450, 451, 453, 455, 456, 457); pierwszy wolny
  **458** (registry-first 2026-10-17: najwyższy nagłówek findingu w `docs/` — 457) `[measured]`.

### 9.7 Pytania do właściciela

1. **Zgoda na R-P1-2** (`sb1_fleet_tuning_smoke` T11b — czwarty czytelnik tabeli strojenia: `TimeSystem`)?
2. **CP5 — „game time”:** zegar klatek `TimeSystem` (jak §3.1 i pytanie 5: poza starciem dzisiejszy wygląd, w starciu
   z siatką, w pauzie stoi), nie rok gry `gameTime` — wtedy orbity kręciłyby się z prędkością gry (przy 1 r/s 365 razy
   szybciej niż przy 1 d/s). Zostaje tak?
3. **CP3 — „restored after”:** ustawienia prędkości kod P1 w ogóle nie zmienia; po starciu świat tyka tym, które gracz ma
   (auto-slow do 1 d/s przy rozpoczęciu starcia zostaje jak dotąd). Zostaje tak?
4. **456** (okno partii bitwy planetarnej w czasie realnym) — P2 czy osobny krok (rodzina 165)?

→ **Odpowiedzi właściciela 2026-10-17 (po bramce):** 1 → **CP9** (zgoda) · 2 → **CP10** (zostaje) · 3 → **CP11**
(zostaje; auto-slow po bitwie — 157) · 4 → **CP12** (osobny krok P3 po P2, najpierw audyt) — §5.

### 9.8 Czego nie zweryfikowano

- Bramka w przeglądarce właściciela — PASS (§9.5a); stopera nie zapisano — tempo z odczytu wzrokowego (salwy co ≈ 0,4 s
  przy 400 ms, szybko przy 110 ms) i z rejestratora (`msNaRunde` 403 w przebiegu 1); wygląd orbit w pauzie (scena bramki —
  statki w wolnej przestrzeni, bez orbit ciał) i znacznik starcia (457) — nieraportowane.
- 120 FPS walki (I3 — nie mierzone także w audycie dla siatki).
- Starcie oglądane i nieoglądane naraz (tempo klucza obowiązuje wtedy oba) — nie mierzone.
- Długa klatka i karta w tle w trakcie starcia (najwyżej 8 klatek siatki na klatkę gry, nadwyżka ucięta) — tylko `[code]`.
- Zapis i wczytanie w ŚRODKU starcia: pierwsza runda po wczytaniu pada od razu (jak dotąd) — przebieg może się różnić od
  przebiegu bez wczytania; bramka wczytuje zapis sprzed pierwszej rundy, więc tego nie ćwiczy.
- Seria bitew kampanii AI przy 400 ms (galaktyka zwalnia na czas każdej oglądanej bitwy) — nie mierzone w grze.
