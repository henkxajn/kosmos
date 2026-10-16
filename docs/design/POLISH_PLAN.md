# POLISH — polerka UI i grafiki

> **Status:** 📋 **P1 — AUDYT 2026-10-16, bez kodu.** Arc otwarty wskazaniem właściciela przy zamknięciu AI STRIKES BACK
> (`AI_STRIKES_BACK_PLAN.md` §8.8). HEAD audytu `3b7819f`. Decyzje arca — prefiks **CP** (żadna jeszcze niepodpisana).
> Rejestr findingów arca — §6, **#449–#455**; pierwszy wolny **456**. Sondy, wyniki, zrzuty:
> `kosmos-handover/polish-p1-combat-pace/` (SHA256SUMS). Tagi: `[code]` źródło · `[git]` historia · `[measured]` pomiar ·
> `[doc]` dokumenty · `[derived]` wniosek z powyższych.

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

Prefiks **CP**. Żadna niepodpisana — powstaną z odpowiedzi na §4.

## 6. Rejestr findingów arca

### #449–#455 — P1, audyt (2026-10-16)

⚠ **Registry-first (2026-10-16):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem —
najwyższy numer findingu **#448** (`AI_STRIKES_BACK_PLAN.md` §6, §8.6); trafienia „449”–„456” to liczby linii, ceny,
wartości tabel i identyfikatory sesji, nie findingi `[measured]`. Mapa numeracji: `OPEN_FINDINGS_INDEX.md` (#449– → ten plik).

### ⚪ 449 — pauza w trakcie starcia nie zatrzymuje zegara rund: po odpauzowaniu zaległe rundy lecą po 4 na klatkę

`[code]` `DeepSpaceCombatSystem._tick` (`:507-535`): rundy liczone z `performance.now()`; w pauzie `TimeSystem` nie
emituje ticku, ale zegar realny płynie, więc po odpauzowaniu `now − _lastRoundMs` = długość pauzy i DSCS rozgrywa zaległe
rundy po `MAX_ROUNDS_PER_TICK` = 4 na klatkę, bez czasu gry między nimi. Grę pauzują m.in. gracz, okno wyniku bitwy
(`showBattleOutcome` — przy dwóch równoczesnych starciach), popupy zdarzeń losowych i misji. `[measured]` sonda P1, scena n:
pauza 2 s w rundzie 5 → rundy 6–16 w 3 klatkach (4 + 4 + 3), krok gry między nimi 0. → P1 (B1; w prototypie zero
nadrabiania i wynik identyczny jak bez pauzy).

### ⚪ 450 — okno wyniku bitwy w przestrzeni pokazuje zawsze „Tur: 0”, a Dziennik „0 tur” / „0 turns”

`[code]` rekord bitwy DSCS (`_finalizeBattle`, `:1060-1087`) nie ma pola `turns`; okno wyniku czyta `res.turns ?? 0`
(`BattleIntroModal:289`), linia Dziennika `result.turns ?? 0` (`GameScene:2667`). Liczba rund jest w `timeline` /
`currentRound`. Przypis po #165 w `VESSEL_ORDERS_PLAN.md` odnotował brak pola tylko jako wyjaśnienie odczytów „N tur”.
`[measured]` zrzut `p1_s4_wynik.png` (PL) po starciu 16-rundowym: okno „PORAŻKA · Gracz vs Liga Trzech Słońc · Tur: 0 ·
Straty: 1 / 0”, Dziennik „⚔ Bitwa w głębokim kosmosie (Propus): … Straty: 1/0, 0 tur.” → P2 albo P1 (pytanie 6).

### ⚪ 451 — HP pojedynczego statku nie jest widoczne nigdzie

`[code]` w starciu panel walki (`CombatHUD._drawEncounterRow`, `:193-288`) pokazuje wyłącznie zbiorcze paski HP stron;
statki — nazwą, kadłubem, bronią i kolorem żywy/zniszczony. Trwałe uszkodzenia `vessel.combatDamage` (bez regeneracji —
decyzja 2026-05-20) nie mają czytelnika w UI (grep: wyłącznie `VesselManager`, `DeepSpaceCombatSystem`,
`SaveMigration`, `ThreatMath`). → P2.

### ⚪ 452 — kąt orbity statku wokół ciała liczony w czasie REALNYM zmienia geometrię walki

`[code]` `performance.now() × 0,001` w `VesselManager._updatePositions` (`:2497`, `:2536`, `:2573`), w
`EnemyAttackHandler` (`:379`) i jako wartość domyślna `OrbitalSpaceSystem.getPosition` (`:199`); dotyczy statków
z zarejestrowaną orbitą (rejestracja przy `vessel:arrived`). `[measured]` prototyp B1-prosty bez zegara orbit, scena n:
przy 600 ms druga bitwa ma 6 rund zamiast 16 i strażnik ginie (pierwsza identyczna), przy 110 i 350 ms — identycznie jak
z zegarem orbit; z zegarem orbit 110 = 350 = 600 ms. W scenie co (obrońcy z jawnie zarejestrowaną orbitą) bez wpływu na
wynik — 110 = 350 = 600 ms także bez zegara orbit. Konieczność stoi na jednym zmierzonym przypadku. → P1 (zegar orbit,
pytanie 5).

### ⚪ 453 — starcie w innym układzie: kamera, smugi i znacznik starcia lądują w oglądanym układzie

`[code]` brak terminu układu w trzech miejscach `ThreeRenderer`: auto-fokus na `vessel:engaged` (`:1060-1073`) przestawia
cel kamery na punkt starcia i zbliża ją (≤ 6); `_onCombatRoundFx` (`:6176`) rysuje smugi — dla statków spoza oglądanego
układu sprite'ów nie ma (`_syncVesselPositions` je usuwa), więc `_combatEndpointWorld` bierze migawki pozycji z ładunku;
`_upsertEngagementMarker` (`:6292`) stawia pierścień w punkcie starcia. `[measured]` sonda zrzutów (widok `sys_home`,
starcie w `sys_059`): po rundzie 1 pierścień w świecie (13,77; −6,00) = punkt starcia / 10, po rundzie 6 dwie smugi
(13,19; −7,48) → (13,73; −6,14) na wysokości 0,3 (migawki), cel kamery (13,28; −5,78) przy malejącym dystansie — pusty
punkt w ramce oglądanego układu (klasa „globalne id ≠ położenie”); zrzut `screenshots/cross_system/p1_x1_strzal.png`.
→ P1 albo P2 (pytanie 7).

### ⚪ 454 — `fleet_engage_scope` T3b i `fleet_engage_picker_frame` T5b zależą od tempa czasu realnego

`[code]` kontrola anty-jałowości „po 120 tikach starcie nadal aktywne” trzyma się, bo 120 tików w node mija szybciej niż
kolejne rundy (110 ms realne). `[measured]` z `performance.now` przesuwanym o 60 ms na wywołanie (wolna maszyna) obie
padają (encounters = 0 — bitwa zdąży się rozstrzygnąć). → P1 (pod B1 — rundy z zegara starcia — surowe `time:tick`
keeperów dają wyłącznie pierwszą rundę: piny stają się deterministyczne; do sprawdzenia fail-first przy wdrożeniu).

### ⚪ 455 — salwa pierwszej rundy starcia nie została narysowana na mapie — widoczna tylko w logu panelu

`[measured]` sonda zrzutów P1 (scena n, kod HEAD): runda 1 pierwszego starcia — 2 strzały, 2 trafienia (rakiety, −70 HP
ze 120 fregaty gracza), a klatkę później `ThreeRenderer._activeEffects` = 0; rundy 6 i 11 (strzały) — 2 i 5 aktywnych
efektów. `[code]` jedyna ścieżka, która pomija smugę: `_onCombatRoundFx` → `_combatEndpointWorld` zwraca `null`, gdy wróg
ma jakość kontaktu poniżej `contact` (`_isEnemyEndpointVisible`, `ThreeRenderer:6182-6183`). Jakości kontaktu w chwili
rundy 1 nie zmierzono; klatkę później etykieta wroga ma już nazwę. Najsilniejsza salwa tego starcia była widoczna
wyłącznie w logu panelu. Zmierzone na jednym starciu. → P2.

## 7. Następne kroki

1. Odpowiedzi na §4 → decyzje CP1… (osobny commit dokumentacji).
2. **P1 — kod:** B1 w kształcie z odpowiedzi 1 (zegar starcia w `TimeSystem`, rundy DSCS z zegara starcia, zegar
   orbit) + B2 (klucz) + keeper `combat_pace_smoke` + przecelowanie R-P1-1 (`sb3_combat_closing`, za zgodą);
   fail-first; sonda tej sesji jako dowód I1–I7; bramka w przeglądarce.
3. **P2 — widoczność** (§3.3): 451, 455, 450 (jeśli nie w P1), błysk na modelu, znacznik starcia.
4. Dalej kolejka arca (§0).

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
