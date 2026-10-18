# POLISH — polerka UI i grafiki

> **Status:** ✅ **P1 — ZAMKNIĘTY W KODZIE 2026-10-17:** `13ca6c9` (P1-1) · `bcecaa0` (P1-2), zakres `20e23a2..bcecaa0`,
> po bramce `gate/GATE_P1.md` w przeglądarce właściciela (PASS — §9.5a) i zgodzie na przecelowanie **R-P1-2** (CP9);
> na `bcecaa0` sweep **310/310**, `check-i18n` PASS pl = en 3458 (§9.1). Decyzje **CP1–CP12** (§5); zamknięcia **449** ·
> **452** · **454** · **438** · **436** — §9.6. **P2 — widoczność: AUDYT 2026-10-17** (§10, bez kodu, HEAD
> `a7e2296`) → odpowiedzi właściciela na §10.11 → **CP13–CP20** (§5) → ✅ **P2a — ZAMKNIĘTY W KODZIE 2026-10-18:**
> `e866bd6` (P2a-1) · `51f8e81` (P2a-2) · `dc533cf` (P2a-3) · `9e752cc` (P2a-4), zakres `bd846b5..9e752cc`, po bramce
> `gate/GATE_P2A.md` w przeglądarce właściciela (PASS na własnościach — §11.9); na `9e752cc` sweep **313/313**,
> `check-i18n` PASS pl = en 3458; zamknięcia **453** · **455** · **457** · **458** · **459** · **462** — §11.10.
> Odpowiedzi na §11.7 → **CP21–CP24** (2026-10-18, §5): **P2b — OSTATNIA sesja kodu tematu widoczności starcia**
> (CP24): **467** (znacznik i cel auto-fokusu za środkiem walki), **451** + CP16 (paski HP), błysk trafienia (CP18),
> A7 + **461** (tempo efektów, płynne zbliżenie), panel walki — **468** + **465** (CP22) + nazwa układu w wierszu
> (CP23), **450** (jeśli mały); po P2b — **backlog bez daty**: **163** · **464** · **460** · **466** · **463** (§7).
> ✅ **P2b — ZAMKNIĘTY W KODZIE 2026-10-18:** `5504e2e` (P2b-1) · `9f03381` (P2b-2) · `96690d0` (P2b-3) · `f9d4efa`
> (P2b-4) · `72509d4` (P2b-5), zakres `b1265f4..72509d4`, po bramce `gate/GATE_P2B.md` w przeglądarce właściciela (PASS —
> §12.9); zamknięcia **450** · **451** · **461** · **465** · **467** · **468** — §12.10. Decyzje **CP25–CP28** (§5);
> poprawka z bramki **C6** `2ff8d26` (pierścień starcia subtelny — CP27, §13); na `2ff8d26` sweep **319/319**,
> `check-i18n` PASS pl = en 3458. **Temat widoczności starcia ZAMKNIĘTY (CP24, §13.5)** — backlog bez daty: **163** ·
> **464** · **460** · **466** · **463** · **469** · **470** (§7). NOWY **470** (dwa równoczesne starcia w jednym układzie
> — odczyty rejestratora bramki; audyt w §6, CP28).
> **P3** — **456** (CP12) — następny krok arca. Audyt P1 — 2026-10-16, bez kodu (§2–§4; HEAD audytu `3b7819f`, commit
> `1af65fc`). Arc otwarty wskazaniem właściciela przy zamknięciu AI STRIKES BACK (`AI_STRIKES_BACK_PLAN.md` §8.8).
> Decyzje arca — prefiks **CP**. Rejestr findingów arca — §6, **#449–#470**; pierwszy wolny **471**. Sondy audytu:
> `kosmos-handover/polish-p1-combat-pace/`; kod, dowód i bramka P1: `kosmos-handover/polish-p1-code/`; audyt P2:
> `kosmos-handover/polish-p2-visible-battle/`; kod, dowód i bramka P2a: `kosmos-handover/polish-p2a-code/`; kod, dowód
> i bramka P2b: `kosmos-handover/polish-p2b-code/`; zamknięcie P2b i C6: `kosmos-handover/polish-p2b-close/`
> (SHA256SUMS).
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
pytania §9.7 po bramce (brzmienie z polecenia sesji zamykającej P1), CP13–CP20 — odpowiedzi na §10.11 (brzmienie
z polecenia sesji kodu P2a). **2026-10-18:** CP21–CP24 — odpowiedzi na §11.7 po bramce P2A (brzmienie z polecenia sesji
zamykającej P2a); CP25–CP28 — odpowiedzi na §12.7 i uwaga z bramki P2B (brzmienie z polecenia sesji zamykającej P2b).
Słowa właściciela — dosłownie (oryginał angielski); obok — odczyt w kodzie P1 (§9), P2a (§11), P2b (§12) i C6 (§13).

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
| **CP13** | „"Watch battle" camera follows the engagement centre; distance fitted to the participants' spread with a margin, clamped min/max.” | C2: `_startWatch` / `_updateWatchCamera` co klatkę (przed `update()` kontrolera, także w pauzie) — środek PROSTOKĄTA RZUTU żywych, widocznych uczestników (pozycje sprite'ów) w środku prostokąta bezpiecznego (ekran bez pasków UI, Outlinera i panelu walki, margines 40 px); dystans — najmniejszy mieszczący, [0,4; 12] j., najbliższy uczestnik ≥ 0,2 j. od kamery; cel — szybkie śledzenie `focusOnSmooth`; koniec — starcie skończone albo poza widokiem, albo kamerę przejął inny fokus; kółko gracza wyłącza tylko dopasowanie dystansu (§11.2) |
| **CP14** | „Overlays (chevrons, enemy reticle) get a screen-size cap; the engagement ring is hidden while in Watch mode.” | C2: szewron insygniów ≤ 36 px, celownik wroga ≤ 44 px (poniżej limitu — rozmiar jak dotąd), pierścień znacznika ukryty przy „Watch”. ⚠ **Rozszerzenie do potwierdzenia (pytanie Q1, §11.7):** efekty walki w rozmiarze świata (błysk, pierścień osłony, wybuch) przy „Watch” nie większe na ekranie niż w kadrze auto-fokusu (głębia 6 j.) — bez tego bliski kadr robił z pierścienia osłony plamę na pół ekranu (§11.4) → **potwierdzone CP21 (2026-10-18): limit tylko przy „Watch”** |
| **CP15** | „Model size at missile range (4–5 px) stays for now; enlargement of participants is a P2b option after the owner's gate.” | bez zmian w kodzie — modele w rozmiarze świata; opcja powiększenia — P2b, po bramce |
| **CP16** | „HP bars: both sides of an ACTIVE engagement only (P2b).” | bez zmian w P2a — P2b (451) |
| **CP17** | „An enemy fighting the player is fully visible: first-round salvo drawn, no translucency (Findings 455, 462).” | C4: `VesselFxLogic.isEndpointVisibleInCombat` — uczestnik aktywnego starcia z graczem jest widocznym końcem smugi niezależnie od wywiadu; model w kryciu 1, w żywej pozycji (bez ducha `rumor`); stan wywiadu bez zmian (reguła rysowania); auto-fokus starcia — cel i dystans natychmiast (459) |
| **CP18** | „Hit flash: white, fixed 200 ms (P2b).” | bez zmian w P2a — P2b |
| **CP19** | „Wreck at the place of death (460) → P2c; today's behaviour stays.” | bez zmian — P2c |
| **CP20** | „Finding 463 (same-faction combatRangeEnter spam) → separate small step after P2, audit first.” | bez zmian w P2 — osobny krok po P2, najpierw audyt (§7) → zastąpione CP24 (2026-10-18): 463 → backlog bez daty |
| **CP21** | „Q1: effect size cap only in Watch; 466 → backlog.” | bez zmian w kodzie: limit efektów walki (`watchFxScale`, C2) zostaje WYŁĄCZNIE przy „Watch” — rozszerzenie CP14 potwierdzone; **466** → backlog bez daty (§7) |
| **CP22** | „Q2: Watch button per battle row (465) → P2b.” | P2b (D4): przycisk „Watch” przy każdym wierszu panelu walki (**465**) |
| **CP23** | „Q3: system name in the battle row → P2b.” | P2b (D4): nazwa układu starcia w wierszu panelu walki (propozycja P2-1 audytu — §10.2, §10.10) |
| **CP24** | „P2b is the LAST code session of the combat-visibility topic; after it: 450 done in P2b if small, 163 / 464 / 460 / 466 / 463 → backlog without a date.” | P2b (D1–D5) zamyka temat widoczności starcia; **450** w P2b (D5); P2c (460, CP19) i osobny krok 463 (CP20) nie powstają — **163** · **464** · **460** · **466** · **463** → backlog bez daty (§7) |
| **CP25** | „Auto-focus target = participants centred in band above card — stays; literal centre rejected: 100% frames hid guards under card.” | bez zmian w kodzie: cel auto-fokusu `watchTargetAt` przy bieżącym dystansie (P2b D1, `5504e2e`) zostaje; dosłowny środek uczestników na środku ekranu — scena V: strażnik pod kartą w 21 z 21 klatek auto-fokusu (§12.4); bramka P2B — wszyscy nad kartą 99,4 % (§12.9) |
| **CP26** | „Card ≤ 45% — stays; 61% without cap.” | bez zmian w kodzie: `CARD_MAX_H_FRAC` 0,45 (P2b D4, `f9d4efa`) zostaje; dwa starcia — 438 z 720 j. (61 %) bez limitu, 307 j. (42,6 %) z limitem (§12.4); bramka — „karty nic nie zasłaniają” (§12.9) |
| **CP27** | „Ring SUBTLE: thin line of constant on-screen width (~1.5 px regardless of zoom), low opacity (~0.3), NO pulsing (static). Must not cover models.” | C6 `2ff8d26` (§13.3): pas o stałej szerokości 1,5 px na ekranie w głębi każdego punktu okręgu, krycie 0,3, bez pulsu; promień (0,285 j.), pozycja (środek uczestników) i ukrycie przy „Watch” (CP14) bez zmian; keeper `combat_ring_subtle_smoke` |
| **CP28** | „Register NEW Finding 470 (backlog, no date, no code).” | NOWY ⚪ **470** (§6) — audyt read-only bez kodu gry: mechanizm z bramki nie potwierdzony, najbardziej prawdopodobny artefakt rejestratora; backlog bez daty (§7) |

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

### ✅ 450 — okno wyniku bitwy w przestrzeni pokazuje zawsze „Tur: 0”, a Dziennik „0 tur” / „0 turns”

`[code]` rekord bitwy DSCS (`_finalizeBattle`, `:1060-1087`) nie ma pola `turns`; okno wyniku czyta `res.turns ?? 0`
(`BattleIntroModal:289`), linia Dziennika `result.turns ?? 0` (`GameScene:2667`). Liczba rund jest w `timeline` /
`currentRound`. Przypis po #165 w `VESSEL_ORDERS_PLAN.md` odnotował brak pola tylko jako wyjaśnienie odczytów „N tur”.
`[measured]` zrzut `p1_s4_wynik.png` (PL) po starciu 16-rundowym: okno „PORAŻKA · Gracz vs Liga Trzech Słońc · Tur: 0 ·
Straty: 1 / 0”, Dziennik „⚔ Bitwa w głębokim kosmosie (Propus): … Straty: 1/0, 0 tur.” → P2 albo P1 (pytanie 6).
→ **CP6 (2026-10-17): P2** (§7).
→ **P2 — audyt (2026-10-17, §10.7):** zmierzone w grze EN i PL — baner „PORAŻKA · … · Tur: 0 · Straty: 1 / 0”,
Dziennik „0 turns” / „0 tur” przy `timeline` 16 rund; trzej czytelnicy `turns ?? 0` (baner, Dziennik, lista bitew
wojny `WarSystem:523`); kształt `turns: encounter.currentRound` — P2b-1 razem z **163** i **464**.
→ **CP24 (2026-10-18): w P2b, jeśli mały — P2b D5** (jedno pole liczby rund w rekordzie bitwy DSCS, czytane przez trzech
czytelników); **163** i **464** → backlog bez daty.
→ **POLISH P2b — kod (2026-10-18; D5): naprawa PRZYGOTOWANA w C5 (zestagowana) — zamknięcie przy commicie** (§12).
`turns: encounter.currentRound` w `_finalizeBattle`; okno wyniku, Dziennik i lista bitew wojny bez zmian. `[measured]`
sonda (§12.3): okno wyniku „Tur: N” = rundy bitwy we wszystkich scenach (przed — „Tur: 0”).
✅ **ZAMKNIĘTY 2026-10-18 — `72509d4` (P2b-5), bramka P2B PASS (§12.9):** u właściciela okno wyniku „Tur: 16” (scena A)
i „Tur: 20 | Tur: 20” (scena B) = rundy bitew; lista bitew wojny „16 rund · B · 2/0”, „20 rund · B · 0/0” ×2. Napis
„Tur:” po polsku w grze EN — **163** (backlog).

### ✅ 451 — HP pojedynczego statku nie jest widoczne nigdzie

`[code]` w starciu panel walki (`CombatHUD._drawEncounterRow`, `:193-288`) pokazuje wyłącznie zbiorcze paski HP stron;
statki — nazwą, kadłubem, bronią i kolorem żywy/zniszczony. Trwałe uszkodzenia `vessel.combatDamage` (bez regeneracji —
decyzja 2026-05-20) nie mają czytelnika w UI (grep: wyłącznie `VesselManager`, `DeepSpaceCombatSystem`,
`SaveMigration`, `ThreatMath`). → P2.
→ **CP16 (2026-10-17): paski HP — obie strony AKTYWNEGO starcia, P2b**; błysk trafienia — CP18 (P2b).
→ **P2 (§7):** pasek HP nad statkiem aktywnego starcia + błysk trafienia na modelu (§3.3).
→ **P2 — audyt (2026-10-17, §10.4):** HP per statek co rundę zmierzone (zmiana w 6 z 16 rund); makieta paska
40 × 5 px pod statkiem (`p2_w_6_MOCK_hpbars.png`); błysk na modelu — statki gracza dzielą materiały szablonu GLB
(klon per statek albo poświata dopasowana do modelu) — P2-3.
→ **P2b D2 (CP16, CP18; CP24 — ostatnia sesja kodu widoczności starcia).**
→ **POLISH P2b — kod (2026-10-18; D2): naprawa PRZYGOTOWANA w C2 (zestagowana) — zamknięcie przy commicie** (§12).
Paski HP 40 × 5 px pod uczestnikami aktywnego starcia (obie strony), biały błysk 200 ms na trafionym modelu. `[measured]`
sonda (§12.3): każdy żywy uczestnik na ekranie z paskiem w 100 % klatek, ułamek = hp / hpStart, po końcu starcia 0 pasków,
białe błyski = trafienia narysowane (przed — pasków i błysków brak).
✅ **ZAMKNIĘTY 2026-10-18 — `9f03381` (P2b-2, CP16, CP18), bramka P2B PASS (§12.9):** u właściciela paski 42 × 7 px —
każdy żywy uczestnik na ekranie z paskiem w 96 % klatek (scena A) i 72,5 % (scena B; walidator 100 — przyczyna
niezmierzona); białe błyski = trafienia narysowane: 16 = 16 (A), 22 = 22 (B).

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

### ✅ 453 — starcie w innym układzie: kamera, smugi i znacznik starcia lądują w oglądanym układzie

`[code]` brak terminu układu w trzech miejscach `ThreeRenderer`: auto-fokus na `vessel:engaged` (`:1060-1073`) przestawia
cel kamery na punkt starcia i zbliża ją (≤ 6); `_onCombatRoundFx` (`:6176`) rysuje smugi — dla statków spoza oglądanego
układu sprite'ów nie ma (`_syncVesselPositions` je usuwa), więc `_combatEndpointWorld` bierze migawki pozycji z ładunku;
`_upsertEngagementMarker` (`:6292`) stawia pierścień w punkcie starcia. `[measured]` sonda zrzutów (widok `sys_home`,
starcie w `sys_059`): po rundzie 1 pierścień w świecie (13,77; −6,00) = punkt starcia / 10, po rundzie 6 dwie smugi
(13,19; −7,48) → (13,73; −6,14) na wysokości 0,3 (migawki), cel kamery (13,28; −5,78) przy malejącym dystansie — pusty
punkt w ramce oglądanego układu (klasa „globalne id ≠ położenie”); zrzut `screenshots/cross_system/p1_x1_strzal.png`.
→ P1 albo P2 (pytanie 7).
→ **P2 — audyt (2026-10-17, §10.2):** potwierdzone na kodzie P1 (auto-fokus w pusty punkt układu domowego; 10 smug,
5 błysków i pierścień w złym układzie); czwarte miejsce — przycisk „Obserwuj / Watch” panelu walki (`CombatHUD.js:425`)
zbliża kamerę na pusty punkt oglądanego układu; panel nie podaje układu starcia. Kształt: reguła `isEngagementInView`
(wzór SB43) na 4 wejściach + „Obserwuj” przełącza widok na układ starcia — P2-1.
→ **POLISH P2a — kod (2026-10-17; CP7): naprawa PRZYGOTOWANA w C1 (zestagowana) — zamknięcie przy commicie** (§11).
Reguła `VesselFxLogic.isEngagementInView` (= `DeepSpaceCombatSystem.engagementView` 'watched') na czterech wejściach:
salwa (smugi, błyski), znacznik, auto-fokus przy starcie, „Watch”; DSCS niesie `systemId` w `combat:roundFx`; „Watch” na
starcie w innym układzie — `starSystemManager.switchActiveSystem`, potem kadr. `[measured]` sonda X (§11.3): przy widoku
domowym i starciu w `sys_059` — 0 smug, 0 błysków, 0 znaczników, kamera stoi (`9de9a20`: 7 salw — 10 smug, 5 błysków,
znacznik w 104 klatkach, kamera 450 → 6 j. w pusty punkt); po „Watch” widok `sys_059`. Nazwa układu w wierszu panelu
(propozycja §10.10) — poza P2a (polecenie C1: cztery wejścia + przełączenie widoku).
✅ **ZAMKNIĘTY 2026-10-18 — `e866bd6` (P2a-1, CP7), bramka P2A PASS (§11.9):** u właściciela w scenie B (starcie
w układzie stolicy `emp_001`, widok domowy) — 0 smug, 0 błysków i 0 znaczników przy widoku innego układu, kamera stoi
(ruszyła wyłącznie przy resecie kadru z kroku 3). „Watch” na starcie w innym układzie u właściciela NIEĆWICZONY —
starcie nieoglądane (110 ms na rundę, CP4; 11 rund) skończyło się, zanim zdążył zapauzować i kliknąć; przełączenie widoku
stoi na walidatorze (`results/gate/validate_gate_p2a_staged_repo.*`: widok → `sys_059`, wszyscy w kadrze 100 %)
i keeperze `combat_view_scope_smoke` — przyjęte przez właściciela. Nazwa układu w wierszu panelu — CP23, P2b.

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

### ✅ 455 — salwa pierwszej rundy starcia nie została narysowana na mapie — widoczna tylko w logu panelu

`[measured]` sonda zrzutów P1 (scena n, kod HEAD): runda 1 pierwszego starcia — 2 strzały, 2 trafienia (rakiety, −70 HP
ze 120 fregaty gracza), a klatkę później `ThreeRenderer._activeEffects` = 0; rundy 6 i 11 (strzały) — 2 i 5 aktywnych
efektów. `[code]` jedyna ścieżka, która pomija smugę: `_onCombatRoundFx` → `_combatEndpointWorld` zwraca `null`, gdy wróg
ma jakość kontaktu poniżej `contact` (`_isEnemyEndpointVisible`, `ThreeRenderer:6182-6183`). Jakości kontaktu w chwili
rundy 1 nie zmierzono; klatkę później etykieta wroga ma już nazwę. Najsilniejsza salwa tego starcia była widoczna
wyłącznie w logu panelu. Zmierzone na jednym starciu. → P2 (§7).
→ **P2 — audyt (2026-10-17, §10.5): hipoteza mgły POTWIERDZONA** — starcie rusza przy 0,3123 AU (próg z zasięgu rakiet
0,315 AU > „sensor lock” 0,30 AU), salwa rundy 1 emitowana przy jakości `rumor` (2 zdarzenia pominięte), `contact`
w tej samej klatce po rundzie; trzy przebiegi identycznie. Kamera auto-fokusu stoi wtedy na d 324 (**459**) — naprawa
razem z 459: P2-6.
→ **POLISH P2a — kod (2026-10-17; CP17): naprawa PRZYGOTOWANA w C4 (zestagowana) — zamknięcie przy commicie** (§11).
Uczestnik aktywnego starcia z graczem jest widocznym końcem smugi niezależnie od wywiadu (`isEndpointVisibleInCombat`).
`[measured]` sonda (§11.3): salwa rundy 1 przy wywiadzie `rumor` — W 2 smugi / 2 błyski, V 4 smugi / 2 błyski
(`9de9a20`: 0 / 0 w obu); keeper `combat_view_scope_smoke` T11 — PRAWDZIWE starcie przy `rumor`: każda smuga rundy 1.
✅ **ZAMKNIĘTY 2026-10-18 — `9e752cc` (P2a-4, CP17), bramka P2A PASS (§11.9):** u właściciela (wywiad strażnika przed
starciem `unknown`) salwa rundy 1 — „4 smug, 2 błysków (4 strzałów)”, oko: „smugi i błysk pierwszej salwy widoczne”;
kontrola `9de9a20` w walidatorze — 0 / 0.

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

### ✅ 457 — znacznik starcia gaśnie po 1600 ms CZASU REALNEGO bez rundy ze strzałem — przy 400 ms na rundę także w trakcie starcia

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
→ **P2 — audyt (2026-10-17, §10.6): zmierzone deterministycznie** (zegar klatek co do 16 ms): przy 400 ms dwie luki
w trakcie aktywnego starcia — 416 ms (rundy 2–5 bez strzału) i 1808 ms (pauza 2,6 s); przy 110 ms — zero. Kształt:
znacznik wg stanu starcia — P2-5.
→ **POLISH P2a — kod (2026-10-17): naprawa PRZYGOTOWANA w C3 (zestagowana) — zamknięcie przy commicie** (§11). Znacznik
wg STANU starcia (`VesselFxLogic.planEngagementMarkers` co klatkę z `listActive()`, także w pauzie); czas życia 1600 ms
wyłącznie dla imitacji bitew orbitalnych. `[measured]` sonda W (§11.3): znacznik w każdej klatce aktywnego starcia, także
przez 313 klatek pauzy (5 s); keeper `combat_marker_life_smoke` — PRAWDZIWE starcie z pauzą 10 s.
✅ **ZAMKNIĘTY 2026-10-18 — `dc533cf` (P2a-3), bramka P2A PASS (§11.9):** u właściciela znacznik w każdej klatce starcia
w widoku — 0 bez znacznika z 2629, także w długiej pauzie (0 z 2267 klatek pauzy); oko: „pierścień stał cały czas”.
⚠ Pozycja pierścienia — w punkcie STARTU starcia, „w dziwnym miejscu, z dala od statków” (oko właściciela) — NOWY **467**.

### #458–#464 — P2, audyt (2026-10-17)

⚠ **Registry-first (2026-10-17, audyt P2):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed
nadaniem — najwyższy numer findingu **#457**; trafienia „458”–„469” to numery linii i zapis „pierwszy wolny 458”
`[measured]`. Sonda i zrzuty: `kosmos-handover/polish-p2-visible-battle/` (§10.1).

### ✅ 458 — „Obserwuj / Watch” kadruje STAŁY punkt startu starcia i nie śledzi walki, a nakładki w rozmiarze świata zasłaniają statki

`[code]` `camera:watchBattle` (`ThreeRenderer:1076-1083`): cel = `encounter.location.point` (punkt środkowy pary
wyzwalającej z chwili startu), dystans ≤ 1,2 j., `minDist` 0,005; `_focusEncounterId` bez czytelnika — śledzenia brak.
Insygnia 0,32 j. (+0,4 j. nad statkiem), pierścień znacznika 0,25–0,32 j., celownik wroga 0,7 × max(0,5; d / 60) j., kula
błysku 0,06 j. ×3 — rozmiar świata, więc przy zbliżeniu rosną; model fregaty 0,016 j. `[measured]` §10.3: przy
„Obserwuj” (d 1,21–1,31) modele 8–9 px, szewrony 121–199 px, celownik 119–138 px, pierścień (promień) 121–165 px pod
panelem walki, środek walki 0,091–0,115 AU od celu kamery (statki przy prawej krawędzi). Kadr dopasowany do sprite'ów
uczestników (makieta sondy): d ≈ 0,40–0,43 j. — ~3 × bliżej niż dziś — modele 28–66 px, nakładki 20–31 px. ⚠ Kadr
z pozycji LOGICZNYCH jest błędny dla statku na orbicie ciała (sprite na wysokości y = r·cos φ orbity) — zmierzone na
pierwszej makiecie. → P2-2 (§10.10), pytania 1–3.
→ **POLISH P2a — kod (2026-10-17; CP13, CP14): naprawa PRZYGOTOWANA w C2 (zestagowana) — zamknięcie przy commicie**
(§11). Kadr z `CombatWatchLogic.fitWatchFrame` (pozycje sprite'ów, prostokąt bezpieczny, środek prostokąta rzutu),
szybkie śledzenie, nakładki z limitem, pierścień ukryty przy „Watch”; efekty walki przy „Watch” z limitem (pytanie Q1).
`[measured]` sonda (§11.3) — liczby przed / po w §11.3.
✅ **ZAMKNIĘTY 2026-10-18 — `51f8e81` (P2a-2, CP13, CP14; CP21 — limit efektów walki tylko przy „Watch”), bramka P2A
PASS (§11.9):** u właściciela „Watch” — 915 klatek obserwacji, wszyscy żywi uczestnicy w kadrze **93,4 %** (walidator
100 %), model min 3 / mediana 14,3 px, szewron max 36 px (pozostałe pola odczytu — nieprzekazane); oko: „Watch przybliżył
tak, że statki były widoczne — w miarę OK”. Różnica 93,4 % wobec 100 % — niezmierzona (inny przebieg walki: 16 rund,
straty 2/0; prawdziwe FPS).

### ✅ 459 — auto-fokus starcia dolatuje 1,4 s po starcie: rundy 1–4 mijają, zanim kamera dotrze

`[code]` `vessel:engaged` → `focusOn(punkt starcia)` + cel ≤ 6 j.; dystans dochodzi lerpem 0,08 na klatkę (zależnym od
FPS). `[measured]` W_en / W2_pl / X_en: z kadru układu (d 450) do d ≤ 6,3 — **88 klatek = 1408 ms**; runda 1 po 64 ms
(d 324), runda 2 po 480 ms (d 42), runda 3 po 880 ms (d 10,2), runda 4 po 1280 ms (d 6,6). Salwa otwierająca nie byłaby
widziana nawet bez bramki mgły (**455**). Przełącznik `uiPrefs.battleAutoFocus` nie ma producenta (rodzina **164**).
→ P2-6 (§10.10).
→ **POLISH P2a — kod (2026-10-17; CP17): naprawa PRZYGOTOWANA w C4 (zestagowana) — zamknięcie przy commicie** (§11).
Cel i dystans auto-fokusu natychmiast (`focusOnInstant` + NEW `ThreeCameraController.snapDist`). `[measured]` sonda
(§11.3): kamera ≤ 6,3 j. w pierwszej klatce po `vessel:engaged` (16 ms) — W i V; `9de9a20`: do kliknięcia „Watch”
kamera nie doleciała (W — 10,2 j. po 896 ms, V — 39,5 j. po 496 ms; w rundzie 1 — 324 j.).
✅ **ZAMKNIĘTY 2026-10-18 — `9e752cc` (P2a-4, CP17), bramka P2A PASS (§11.9):** u właściciela dolot auto-fokusu
0 klatek; oko: „kamera skoczyła od razu na walkę”. ⚠ Cel auto-fokusu = punkt STARTU starcia — „auto-fokus przybliżył na
pierścień, nie na statki” — NOWY **467**.

### ⚪ 460 — śmierć statku widać dopiero na końcu starcia, a wrak „przeskakuje” do punktu środkowego

`[code]` statek z HP ≤ 0 przestaje strzelać i być celem, ale wrak i wybuch powstają wyłącznie w `_finalizeBattle`
(`_wreckOne` — `:1094`, `:1105`) — przy stronie z kilkoma statkami zniszczony kadłub leci dalej nietknięty do końca
starcia, a wszystkie wybuchy padają naraz. `_wreckOne` → `_turnIntoWreck(vessel, mid)` stawia wrak w STAŁYM punkcie
środkowym starcia. `[measured]` W_en / X_en: wybuch w pozycji żywej (13,416; −6,923), wrak w punkcie środkowym — skok
**0,0895 AU**. Odroczenie wybuchu w czasie niezmierzone: w scenie 1 na 1 śmierć kończy starcie w tej samej rundzie.
→ P2b-2 (§10.10), pytanie 7.
→ **CP19 (2026-10-17): wrak w miejscu śmierci — P2c; dziś bez zmian.**
→ **CP24 (2026-10-18): backlog bez daty** — P2c nie powstaje; dzisiejsze zachowanie zostaje (CP19).

### ✅ 461 — zbliżenie w starciu idzie jednym skokiem raz na rundę (≈ 100 px co 400 ms przy „Obserwuj”)

`[code]` w starciu statek gracza nie ma ruchu z rozkazu (pauza misji, `_freezeAsStationary`); przesuwa go wyłącznie
`_closeToWeaponRange` — jeden krok `speedAU × CLOSE_STEP_YEARS` przed rundą, a sprite wolnego statku (`orbiting`,
`dockedAt = null`) bierze pozycję logiczną w tej samej klatce. `[measured]` W_en: fregata (1,114 AU / rok) — skok
0,0282 AU w rundach 2–8 (0,0226 w rundzie 9); przy „Obserwuj” ≈ 100 px co 400 ms (181 px na dwa kroki między rundami 7
i 9), przy auto-fokusie ≈ 20 px `[derived]`. ⚠ **Sprostowanie P1 §3.3** („w siatce ruch idzie 6–7 krokami na rundę”) — dla
zbliżenia w starciu nieprawda. → P2-4 (§10.10).
→ **P2b** (A7 — tempo efektów + płynne zbliżenie; polecenie sesji kodu P2a).
→ **P2b D3 (CP24 — ostatnia sesja kodu widoczności starcia).**
→ **POLISH P2b — kod (2026-10-18; D3, A7): naprawa PRZYGOTOWANA w C3 (zestagowana) — zamknięcie przy commicie** (§12).
Płynne zbliżenie (sprite płynie do pozycji logicznej przez rundę czasu realnego) i tempo efektów z `combatRoundMs()`.
`[measured]` sonda (§12.3) — skoki i pokrycie salw przed / po w §12.3.
✅ **ZAMKNIĘTY 2026-10-18 — `96690d0` (P2b-3), bramka P2B PASS (§12.9):** u właściciela (scena A) największy skok
w jednej klatce 1,6 % drogi (walidator 1,6; kontrola `534f45c` 27,3), przy „Watch” 0 px, smugi w 56,5 % klatek biegu.
Scena B — 660,5 px / 87,9 % przy „Watch” nie odtworzone w walidatorze (33,6 px / 1,3 %) → **470** (audyt: płynne
zbliżenie obejmuje każdego uczestnika aktywnego starcia w oglądanym układzie).

### ✅ 462 — wróg w starciu z graczem jest rysowany półprzezroczysty (krycie 0,5) przez całe starcie

`[code]` `_applyVesselIntelVisibility`: jakość `contact` → krycie modelu 0,5 (pełne dopiero przy `detailed`); w starciu
wróg dochodzi do `contact` przez „sensor lock” i tak zostaje. `[measured]` W_en: `intelOpacity` 0,5 w każdej migawce
starcia. Panel walki podaje jednocześnie nazwę, kadłub i broń wroga. → P2b-3 (§10.10), pytanie 5.
→ **POLISH P2a — kod (2026-10-17; CP17 — w P2a, nie w P2b): naprawa PRZYGOTOWANA w C4 (zestagowana) — zamknięcie przy
commicie** (§11). `[measured]` sonda (§11.3): krycie wroga w starciu 1 (min i max; materiał modelu 1) — W, X, V;
`9de9a20`: 0,30–0,5 (W, V).
✅ **ZAMKNIĘTY 2026-10-18 — `9e752cc` (P2a-4, CP17), bramka P2A PASS (§11.9):** u właściciela krycie wroga w starciu
(min) 1 (odczyt kroku 2); kontrola `9de9a20` w walidatorze — 0,5.

### ⚪ 463 — `ProximitySystem` re-emituje `vessel:combatRangeEnter` dla par tej samej frakcji co każde wywołanie (poza P2)

`[code]` gałąź samonaprawy (M4 P3 polish #2, `ProximitySystem:264-282`) kasuje znacznik pary, gdy DSCS nie ma dla niej
starcia — a dla pary tej samej frakcji starcia nie będzie nigdy, więc zdarzenie leci przy każdym wywołaniu proximity (dwa
na tik). `[measured]` W2_pl (fixture GATE-S4): **17 481** zdarzeń w 1702 klatkach — 7 par AI tej samej frakcji
(`emp_001` ×4, `emp_002` ×3) od klatki 0, po 2346 zdarzeń, para własnych fregat gracza 941 (od klatki 702); żadne nie
utworzyło starcia. Szum zdarzeń i praca odbiorców (VCS → DSCS odmawia); czasu klatki nie mierzono. Poza P2 (logika).
→ **CP20 (2026-10-17): osobny mały krok po P2, najpierw audyt.**
→ **CP24 (2026-10-18): backlog bez daty** (osobny krok z CP20 nie powstaje).

### ⚪ 464 — etykiety stron starcia DSCS zaszyte po polsku („Gracz — P1 n0” w grze EN)

`[code]` `_createEncounter` (`DeepSpaceCombatSystem:350-355`): `Gracz (N)`, `Gracz — …`, `Wróg` — mimo kluczy
`battle.label.playerGroup` / `playerUnit` / `enemyUnnamed`, których używa `VesselCombatSystem` (`:295-297`); etykieta
idzie do panelu walki i do rekordu bitwy (`participantA.label`). `[measured]` zrzuty W_en (gra EN): panel „Gracz — P1 n0”.
Klasa **113**; `check-i18n` nie widzi (szablon literału). → P2b-1 (§10.10), razem z **450** i **163**.
→ **CP24 (2026-10-18): backlog bez daty** (razem z **163**; **450** — P2b D5).

### #465–#466 — P2a, kod (2026-10-17)

⚠ **Registry-first (2026-10-17, kod P2a):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed
nadaniem — najwyższy numer findingu **#464**; trafienia „465”–„469” to zapis „pierwszy wolny 465”, numery linii
(`ColonyManager:468`) i wartości (0,467 AU) `[measured]`. Sonda i bramka: `kosmos-handover/polish-p2a-code/` (§11).

### ✅ 465 — przycisk „Obserwuj / Watch” zawsze kieruje do PIERWSZEGO starcia z listy panelu

`[code]` `CombatHUD`: panel pokazuje do dwóch aktywnych starć (`MAX_VISIBLE_ENCOUNTERS = 2`, `:26`), a jedyny przycisk
„Watch” bierze `visible[0]` (`:165`, `:183-184`) — pierwsze z `deepSpaceCombatSystem.listActive()`; na `9de9a20` tak samo
(`visible[0]?.location?.point`, `:148`). Przy dwóch równoczesnych starciach gracz nie wybiera, które ogląda — po P2a
„Watch” przełącza też widok na układ pierwszego z listy (453). Osiągalność dwóch równoczesnych starć z graczem —
niezmierzona. → P2b (kandydat).
→ **CP22 (2026-10-18): przycisk „Watch” przy każdym wierszu panelu walki — P2b D4.**
→ **POLISH P2b — kod (2026-10-18; D4, CP22): naprawa PRZYGOTOWANA w C4 (zestagowana) — zamknięcie przy commicie**
(§12). `[measured]` sonda Y (dwa starcia naraz, §12.3): dwa przyciski „Watch”, klik drugiego — obserwacja DRUGIEGO
starcia, wszyscy jego uczestnicy w kadrze (przed — jeden przycisk, drugiego brak).
✅ **ZAMKNIĘTY 2026-10-18 — `f9d4efa` (P2b-4, CP22), bramka P2B PASS (§12.9):** u właściciela przy dwóch starciach dwa
przyciski „Watch” (wiersze z nazwą układu 2); „Watch też fokusuje kamerę na danej bitwie”.

### ⚪ 466 — efekty walki w rozmiarze świata przy bliskim kadrze POZA „Watch” zakrywają ekran

`[measured]` sonda V na kodzie P2a przed limitem efektów (§11.4): przy kadrze „Watch” 0,47–0,55 j. pierścień osłony
(`shieldRing`: promień 0,06–0,10 j. × skala do 3) zakrywał pół ekranu; przy dzisiejszym „Watch” (≤ 1,2 j.) ten sam
pierścień ma do ~349 px średnicy `[derived]` (rzut keepera `combat_watch_frame_smoke` T12). `[code]` limit z P2a
(`watchFxScale`) działa WYŁĄCZNIE przy „Watch” (`_updateActiveEffects`: `if (watchFx && FX_WATCH_CAPPED.has(…))`); przy
zbliżeniu kółkiem albo fokusie statku poza „Watch” błysk (0,06 j.), pierścień osłony (0,10 j.) i wybuch (pierścień do
2 × rozmiar kadłuba, ≥ 0,4 j.) mają rozmiar świata, jak dziś. → pytanie Q1 (§11.7): limit także poza „Watch”?
→ **CP21 (2026-10-18): limit efektów walki tylko przy „Watch”; 466 → backlog bez daty.**

### #467–#468 — P2a, bramka u właściciela (2026-10-18)

⚠ **Registry-first (2026-10-18, zamknięcie P2a):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów
przed nadaniem — najwyższy numer findingu **#466**; trafienia „467”–„479” to zapis „pierwszy wolny 467”, numery linii
(`ColonyManager:468`), wartości (0,467 AU) i ziarno bramki P1 (468532936) `[measured]`.

### ✅ 467 — znacznik starcia i cel auto-fokusu stoją w punkcie STARTU starcia, a walka odpływa od niego ~0,1 AU

`[code]` oba czytają `encounter.location.point` — punkt środkowy pary wyzwalającej z chwili startu, stały przez całe
starcie (`DeepSpaceCombatSystem._createEncounter`: `location.point = mid`): znacznik — `ThreeRenderer._tickEngagementMarkers`
→ `VesselFxLogic.planEngagementMarkers` (`point: e.location?.point`; pozycja ustawiana przy utworzeniu znacznika, potem
już nie); auto-fokus — słuchacz `vessel:engaged` (`focusOnInstant(location.point)`, jednorazowo). „Watch” (P2a-2, CP13)
śledzi środek sprite'ów żywych uczestników co klatkę — te dwa nie. `[measured]` audyt P2 §10.3 (W_en): środek walki
0,079–0,115 AU od punktu startu (fregata podlatuje do strażnika, który trzyma orbitę); bramka P2A u właściciela
(2026-10-18, T1): „czerwony pierścień stał cały czas, ALE w dziwnym miejscu, z dala od statków; auto-fokus przybliżył na
pierścień, nie na statki; Watch przybliżył tak, że statki były widoczne”. → P2b D1 (logika śledzenia „Watch” dla
znacznika i celu auto-fokusu).
→ **POLISH P2b — kod (2026-10-18; D1): naprawa PRZYGOTOWANA w C1 (zestagowana) — zamknięcie przy commicie** (§12).
Znacznik co klatkę w środku uczestników; auto-fokus śledzi walkę — uczestnicy wyśrodkowani w pasie NAD kartą (reguła
kadru „Watch” przy bieżącym dystansie — pytanie Q1, §12.7). `[measured]` sonda (§12.3, §12.4).
✅ **ZAMKNIĘTY 2026-10-18 — `5504e2e` (P2b-1; CP25 — cel auto-fokusu zostaje), bramka P2B PASS (§12.9):** u właściciela
(scena A) pierścień w środku statków 0 px, auto-fokus — wszyscy nad kartą 99,4 %, środek grupy w środku pasa 0 px.
Wygląd pierścienia (za duży, za mocny, puls) — **C6** (CP27, §13).

### ✅ 468 — panel walki: tekst nie mieści się w karcie — nazwa imperium ucięta, log walki obcięty

`[code]` `CombatHUD._drawEncounterRow` przycina po LICZBIE ZNAKÓW, nie po szerokości tekstu: etykiety stron — 20 znaków
(`_truncate(enc.sideA/B.label, 20)`, `:233`, `:241`) — etykieta „Liga Trzech Słońc (2)” (21 znaków,
`DeepSpaceCombatSystem._createEncounter`) daje „Liga Trzech Słońc (…”; wiersze statków — 44 znaki (`:272`, `:277`); log
walki — ostatnie 6 zdarzeń (`LOG_LINES_MAX`), wiersz 88 znaków (`:304`), nazwy w wierszu 12 znaków (`:411`); szerokość
panelu stała — 560 (`PANEL_W`, `:20`). Pełnej nazwy nie ma gdzie zobaczyć (brak podpowiedzi). `[measured]` zrzut
właściciela z bramki P2A (2026-10-18, gra EN): nazwa imperium ucięta („Liga Trzech Słońc (…”), log walki obcięty.
→ P2b D4 (razem z **465** — CP22 — i nazwą układu w wierszu — CP23).
→ **POLISH P2b — kod (2026-10-18; D4, CP23): naprawa PRZYGOTOWANA w C4 (zestagowana) — zamknięcie przy commicie**
(§12). Przycinanie po szerokości tekstu z podpowiedzią, log — ostatnie linie, karta ≤ 45 % ekranu (pytanie Q2, §12.7),
nazwa układu w wierszu. `[measured]` sonda (§12.3): 0 napisów poza kartą we wszystkich scenach.
✅ **ZAMKNIĘTY 2026-10-18 — `f9d4efa` (P2b-4, CP23; CP26 — karta ≤ 45 % zostaje), bramka P2B PASS (§12.9):**
u właściciela 0 napisów poza kartą i 0 skróconych (sceny A i B), wiersze z nazwą układu 1 / 2; „karty nic nie zasłaniają”.

### #469 — P2b, kod (2026-10-18)

⚠ **Registry-first (2026-10-18, kod P2b):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed
nadaniem — najwyższy numer findingu **#468**; trafienia „469”–„470” to zapis „pierwszy wolny 469”, numery linii
(`GameScene.js:469`, `FleetGroupPanel:470-472`) i wartości (7 470, 0,470) `[measured]`. Etykiety stron „Gracz (2)” /
„Wróg” widoczne w karcie walki w grze EN (sonda P2b) — to istniejący **464** (backlog, CP24), nie nowy numer. Sonda
i bramka: `kosmos-handover/polish-p2b-code/` (§12).

### ⚪ 469 — auto-fokus przechodzi do KAŻDEGO nowego starcia — przy dwóch starciach kamera skacze z pierwszego na drugie

`[code]` słuchacz `vessel:engaged` (`ThreeRenderer`, auto-fokus Slice 1 / P2a-4 / P2b-1): bramki — przełącznik
`battleAutoFocus`, układ starcia w widoku (P2a-1), „Obserwuj” aktywne (P2a-2), gracz w starciu; brak bramki „auto-fokus
już śledzi inne starcie” — nowe starcie przejmuje kamerę (natychmiast, `focusOnInstant` + `snapDist`), a śledzenie
pierwszego się kończy. `[measured]` sonda P2b, scena Y (dwa starcia naraz w układzie domowym, ~2,4 AU od siebie): drugie
starcie rusza 70 klatek (1,1 s) po pierwszym — kamera przeskakuje z pierwszej walki na drugą. Zachowanie sprzed P2b (P2a
tak samo); osiągalność dwóch równoczesnych starć z graczem w normalnej grze — niezmierzona (465). → **backlog bez daty**
(CP24 — po P2b reszta widoczności starcia trafia do backlogu).

### #470 — P2b, bramka u właściciela (2026-10-18)

⚠ **Registry-first (2026-10-18, zamknięcie P2b):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów
przed nadaniem — najwyższy numer findingu **#469**; trafienia „470” to wyłącznie zapis „pierwszy wolny 470” (status
`POLISH_PLAN.md`, wiadomość `b1265f4`) i identyfikatory sesji w pamięci `[measured]`. Audyt read-only (~35 min, bez
kodu gry) i przebieg walidatora: `kosmos-handover/polish-p2b-close/probe470/` (§13).

### ⚪ 470 — dwa równoczesne starcia w jednym układzie: odczyty rejestratora bramki („skok” modeli przy „Watch”, kadr 45 % uczestników) — mechanizm z bramki nie potwierdzony

`[measured, Filip]` bramka P2B u właściciela, scena B (dwa starcia naraz w układzie domowym, pary ~5,65 AU od siebie):
„Watch” — `starcie: 'pierwsze'`, 1173 klatki, wszyscy uczestnicy w kadrze **45 %**; największy skok modelu przy „Watch”
**660,5 px**, największy skok w jednej klatce **87,9 %** drogi statku (scena A: 0 px, 1,6 %). Odczyt z bramki
(brzmienie zgłoszenia): (1) modele NOWO oglądanego starcia przeskakują, bo płynne zbliżenie działa tylko dla śledzonego
starcia; (2) kolejność wierszy karty ≠ kolejność starć w rejestratorze; (3) kadr „Watch” obejmuje 45 % uczestników.
Słowa właściciela przy tym kroku (T2): „wszystko wygląda OK, Watch też fokusuje kamerę na danej bitwie” — skoku okiem nie
zgłosił; liczby pochodzą wyłącznie z rejestratora.
`[code]` audyt (2026-10-18, read-only) — (1) **nieprawda w kodzie:** `ThreeRenderer._placeFreeVessel` (`:6433`) płynnie
prowadzi KAŻDEGO uczestnika AKTYWNEGO starcia w oglądanym układzie (`_findActiveEncounterContaining` + `isEngagementInView`
— bez pojęcia „starcie śledzone”), a `_tickCombatGlide` (`:6451`) przesuwa wszystkie sprite'y w ruchu (stoi wyłącznie
w pauzie). (2) **nieprawda:** wiersze karty idą w kolejności `DeepSpaceCombatSystem.listActive()` (`:1530` — kolejność
wstawienia do `_activeEncounters`), wstawienie (`:393`) przed `vessel:engaged` (`:411`), starcia zakończone usuwane
(`:534`), id unikalne (`_makeEncounterId`, `:1506`) ⇒ wiersz 1 = pierwsze starcie. Rejestrator (`gate/gate_steps_p2b.mjs`)
nazywa starcie WYŁĄCZNIE z PIERWSZEGO kliknięcia „Watch” (`r.watchAt == null` — `:38`); kolejne kliknięcia nie zmieniają
etykiety. `[measured]` walidator na `72509d4` (scena B, prawdziwy klik w pauzie): wiersz 1 → `'pierwsze'`, wiersz 2 →
`'drugie'`; w obu przebiegach skok przy „Watch” **33,6 px**, **1,3 %** drogi, wszyscy w kadrze **97,6 %**
(`probe470/results/gate/validate_gate_p2b_HEAD_72509d4_row1.*`, `polish-p2b-code/results/gate/`). (3) liczby 660,5 px,
87,9 % i 45 % — **nie odtworzone.** Różnice wobec walidatora: walki 20-rundowe zakończone limitem rund (walidator:
6 rund, zniszczenie), przeglądarka bez ziarna, prawdziwe FPS, sekwencja kliknięć. Najbardziej prawdopodobne —
**artefakt rejestratora** `[code]` `[derived]`:
poprzednie pozycje sprite'ów (`r.prev`, `:55–56`) aktualizowane są wyłącznie dla żywych, widocznych uczestników starcia
MIERZONEGO (obserwowane, inaczej pierwsze w oglądanym układzie, `:43`) — przełączenie mierzonego starcia tam i z powrotem
(np. „Watch” w wierszu 1 → 2 → 1) daje w pierwszej klatce „skok” = cały ruch statku z okresu bez pomiaru, a jego udział
w drodze sięga ~90 %; klatki przejazdu kamery między walkami ~5,65 AU liczą się jako klatki „Watch” z uczestnikami poza
kadrem. W kodzie gry nie znaleziono drogi, którą uczestnik aktywnego starcia w oglądanym układzie stawiany jest bez
płynnego zbliżenia; nie sprawdzono przejścia ocalałego po końcu starcia z ruchu płynnego do ruchu rozkazu.
→ **CP28 (2026-10-18): backlog bez daty, bez kodu** (temat widoczności starcia zamknięty — CP24). Do potwierdzenia przy
wznowieniu: rejestrator z zapisem każdego kliknięcia „Watch” i z resetem `r.prev` przy zmianie mierzonego starcia.

## 7. Następne kroki

1. ~~Odpowiedzi na §4~~ → **CP1–CP8 (2026-10-17, §5).**
2. ~~P1 — kod~~ → **ZAMKNIĘTY W KODZIE 2026-10-17:** bramka `gate/GATE_P1.md` u właściciela PASS (§9.5a) → zgoda na
   R-P1-2 (CP9) → commity `13ca6c9` (P1-1) · `bcecaa0` (P1-2) → zamknięcia 449 / 452 / 454 (tutaj) i 438 / 436
   (`AI_STRIKES_BACK_PLAN.md` §6) — §9.6.
3. **P2 — widoczność** (kolejność właściciela, CP6 / CP7): ~~audyt~~ (2026-10-17, §10) → ~~odpowiedzi na §10.11~~ →
   **CP13–CP20** (§5) → ~~P2a — kod~~ → **ZAMKNIĘTY W KODZIE 2026-10-18:** bramka `gate/GATE_P2A.md` u właściciela PASS
   na własnościach (§11.9) → `tools/commit_P2A.sh` → `e866bd6` · `51f8e81` · `dc533cf` · `9e752cc` → zamknięcia 453 /
   455 / 457 / 458 / 459 / 462 (§11.10) → odpowiedzi na §11.7 → **CP21–CP24** (2026-10-18, §5).
   - **P2b — OSTATNIA sesja kodu tematu widoczności starcia (CP24):** D1 — **467** (znacznik i cel auto-fokusu za
     środkiem walki — logika śledzenia „Watch”) · D2 — **451** paski HP obu stron aktywnego starcia (CP16) + błysk
     trafienia — biały, stałe 200 ms (CP18) · D3 — A7 tempo efektów z tempa rundy + płynne zbliżenie (**461**) · D4 —
     panel walki: **468** (tekst w karcie), **465** „Watch” przy każdym wierszu (CP22), nazwa układu w wierszu (CP23) ·
     D5 — **450** „Tur: N” (CP24: jeśli mały).
   - **Backlog bez daty (CP24) — po P2b temat widoczności starcia jest zamknięty:** **163** (okno wyniku bitwy po
     polsku — rejestr `VESSEL_ORDERS_PLAN.md`) · **464** (etykiety stron DSCS po polsku) · **460** (śmierć widoczna
     dopiero na końcu starcia, wrak w punkcie środkowym — P2c nie powstaje, CP19 zostaje) · **466** (limit efektów walki
     poza „Watch” — CP21) · **463** (szum `combatRangeEnter` w `ProximitySystem` — osobny krok z CP20 nie powstaje) ·
     **469** (auto-fokus przechodzi do każdego nowego starcia) · **470** (odczyty rejestratora bramki przy dwóch
     starciach — CP28).
     Opcja powiększenia modeli uczestników (CP15) — nie weszła do P2b (polecenie sesji: D1–D5).
   - ~~P2b — kod~~ → **ZAMKNIĘTY W KODZIE 2026-10-18:** bramka `gate/GATE_P2B.md` u właściciela PASS (§12.9) →
     `tools/commit_P2B.sh` → `5504e2e` · `9f03381` · `96690d0` · `f9d4efa` · `72509d4` → zamknięcia 467 / 451 / 461 /
     468 / 465 / 450 (§12.10) → odpowiedzi na §12.7 i uwaga z bramki → **CP25–CP28** (§5) → poprawka bramki **C6**
     `2ff8d26` (pierścień starcia subtelny, CP27 — §13). **Temat widoczności starcia ZAMKNIĘTY (CP24, §13.5).**
4. **P3** — **456** (okno partii bitwy planetarnej w czasie realnym; CP12): osobny krok po P2, najpierw audyt —
   **następny krok arca** (temat widoczności starcia zamknięty, §13.5).
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
- **(P2a) Teleport sondy między układami nie stawia modelu.** Statek AI utworzony w innym układzie i przeniesiony mutacją
  `systemId` + pozycji nie dostaje sprite'a (stojący statek nie jest w `vessel:positionUpdate` ruchu) — pierwsza sonda
  3 na 2 mierzyła starcie z NIEWIDZIALNYM wrogiem (`model: null` przez cały przebieg, „wszyscy w kadrze” 0 %). Uczciwa
  droga: zdarzenie, które gra emituje przy wejściu statku na orbitę (`vessel:positionUpdate`, jak `undockToOrbit`).
- **(P2a) Słuchacz sondy stoi ZA słuchaczem renderera.** „Kamera przed starciem” czytana w słuchaczu `vessel:engaged`
  sondy widzi kamerę JUŻ przesuniętą auto-fokusem (renderer rejestruje się przy starcie gry) — na `9de9a20` metryka
  mówiła „bez ruchu”. Stan „przed” — z ostatniej klatki pomiaru przed zdarzeniem.
- **(P2a) „Watch” z przełączeniem układu: model GLB wstawia się asynchronicznie** (obietnica loadera, także z pamięci
  podręcznej) — kadr liczony w chwili kliknięcia nie widzi sprite'ów i spadał na stary kadr; dopasowanie czeka na
  pierwszą klatkę ze sprite'ami.
- **(P2a) Lerp 0,08 na klatkę to ~12 klatek opóźnienia za ruchem.** Przy kadrze 0,4–0,5 j. wystarczy, by formacja
  wyjechała z kadru, a statek lecący ku kamerze wjechał w nią (model do 80 376 px w jednej klatce); ruchomy cel —
  `focusOnSmooth`, jak fokus statku.
- **(P2a) Bliski kadr przenosi problem rozmiaru z nakładek na efekty:** limit szewronów i celownika nie wystarczył —
  efekty w rozmiarze świata (pierścień osłony do 0,30 j. promienia) przy 0,45 j. zakrywały pół ekranu. Pomiar „Watch”
  niesie największy efekt na ekranie obok nakładek.
- **(P2a) „Dolot” po kliknięciu „Watch” to zbliżenie „Watch”, nie auto-fokus.** Pierwsza tabela dowodu podawała na
  `9de9a20` dolot 880–1008 ms (krócej niż 1408 ms z audytu) — klik „Watch” w rundzie 2–3 zmieniał dystans docelowy na
  1,2 j. i to ON sprowadzał kamerę poniżej 6,3 j. Dolot auto-fokusu mierzy się wyłącznie przed kliknięciem.
- **(P2a) Walidator bramki: pętla renderu startuje z rzeczywistej kolejki rAF.** Po przełączeniu zegara na wirtualny
  wywołanie zwrotne pętli czeka jeszcze w rzeczywistej kolejce `requestAnimationFrame` (w headless odpala rzadko) — pierwsze
  70–256 klatek kroku czasu biegło bez renderu w OBU wersjach kodu (`gate/diag_frames_p2a.mjs`: zawsze ciągły blok 1…N;
  potem bez braków). Lekarstwo: rozgrzewka w czasie rzeczywistym przed krokami (zegar wirtualny stoi). W sondzie bez
  skutku — długie ustawianie sceny z oczekiwaniami przenosi pętlę wcześniej (0 z 40 klatek bez kroku kamery po starcie).
- **(P2a) „Wszyscy w kadrze” jest trywialnie prawdziwe przy dalekim kadrze** — bez rozmiaru modelu i nakładek nie odróżnia
  kadru 450 j. od dobrego; tabela dowodu niesie wszystkie trzy.
- **(P2a) `TaskStop` nie kończy procesów potomnych Git Bash** (node, Chrome headless) — kończyć wyłącznie własne, po PID,
  drzewem (`taskkill /PID … /T /F`).
- **(P2a) Klonu roboczego serwowanego kolejce sond nie edytuje się w trakcie** — sondy „po” z migawki
  (`git worktree add --detach`), żeby poprawki w klonie nie mieszały wersji kodu między przebiegami.
- **(P2a — bramka) Starcie nieoglądane trwa ~1 s** (CP4: 110 ms na rundę — 11 rund ≈ 1,2 s): krok bramki „od razu
  spacja, potem w pauzie Watch” był dla człowieka niewykonalny — u właściciela starcie skończyło się przed kliknięciem
  (T2). Krok, który wymaga reakcji w trakcie starcia nieoglądanego, musi zostawić czas (starcie dłuższe — więcej HP,
  dalszy start) albo zrobić klik konsolą w pauzie.
- **(P2a — bramka) Odczyt skrócony „…”:** pola odczytu, których właściciel nie przekazał, zapisujemy jako nieprzekazane —
  nie jako PASS z walidatora.
- **Sonda, która trzyma `isPaused = true` poza własnym `update`, pokazuje rendererowi PAUZĘ także w klatkach biegu gry
  (P2b, 2026-10-18).** Pierwszy przebieg P2b po płynnym zbliżeniu: sprite'y uczestników stały w miejscu startu starcia przez
  całe starcie, a pozycje logiczne szły o ~0,25 AU — metryka skoków wyszła 0 (fałszywa zieleń „bez skoków”). Kod sprzed P2b
  nie miał w rendererze żadnego czytelnika pauzy, więc sondy P1 / P2 / P2a tego nie widziały. ⇒ przed pomiarem funkcji,
  która ZALEŻY od pauzy, sprawdź, czym sonda tę pauzę symuluje; podkładka wąska — na czas jednego czytelnika.
- **Dosłowna treść polecenia to hipoteza, którą mierzy się przed zestagowaniem (P2b D1, 2026-10-18).** „Auto-focus target =
  centroid” w prawdziwej grze stawiało strażników sceny 3 na 2 pod kartą walki we WSZYSTKICH klatkach auto-fokusu; ta sama
  reguła, co kadr „Obserwuj” (uczestnicy wyśrodkowani w pasie nad kartą) — 100 %. Zmiana idzie z pomiarem i pytaniem do
  właściciela, nie po cichu (§12.7 Q1).
- **Prostokąt bezpieczny kadru zależy od wysokości karty — a karta od liczby starć (P2b D4, 2026-10-18).** Dwa starcia
  z pełnym logiem: karta 61 % ekranu, pas nad nią ~130 px — kadr „Obserwuj” i auto-fokus nie mają gdzie postawić statków.
  Pomiar kadru przy JEDNYM starciu tego nie pokaże — scena z dwoma starciami (sonda Y) jest częścią dowodu.
- **Pin jałowy wychodzi dopiero na kodzie sprzed kroku (P2b, 2026-10-18).** Trzy piny P2b przechodziły bez funkcji kroku:
  pusta lista pasków (T3b — zero porównań), niezmienniki opisane jak sedno (karta T2a / T2b / T8b), a keeper D1 przerywał
  się na brakującej funkcji, zamiast degradować. Fail-first na drzewie poprzedniego kroku z czytaniem KAŻDEGO zielonego pinu
  — nie tylko licznika.

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

## 10. P2 — widoczność starcia: audyt (2026-10-17, bez kodu; HEAD `a7e2296`)

**Cel właściciela (P2):** gracz WIDZI, jak walka się rozwija — częste widoczne strzały, spadek HP, reagujące statki; do
tego nowa obserwacja: kamera „Obserwuj / Watch” zbliża się za bardzo i statków nie widać. Wyłącznie prezentacja: bez zmian
matematyki walki, zegarów i wyników (P1 zostaje). Kolejność z CP6 / CP7: **453** pierwsza.

### 10.1 Sonda P2 `[measured]`

Prawdziwa gra (fixture GATE-S4) w izolowanym headless Chrome (SwiftShader, okno 1600 × 900, viewport 1584 × 805), kod
HEAD `a7e2296` z eksportu `git archive` (repo nietknięte), determinizm sondy P1 (`detclock.mjs`: zegar wirtualny,
ziarnisty `Math.random` gry, UUID Three.js i renderer na osobnym strumieniu). Klatka sondy = 16 ms czasu realnego gracza
(60 FPS) = JEDNA klatka renderu (rAF z kolejki sondy). Scena „n” z P1: 3 fregaty gracza z laserem, `engage` na
izolowanego strażnika stolicy `emp_001` (2 × wyrzutnia rakiet, ciężki pancerz), start 0,6 AU; w starcie wchodzi jedna
fregata (P1 n0) — 1 na 1, 16 rund, wygrywa strażnik, straty 1 / 0. Klucz `combatRoundMs` = 400 ms (odczyt zwrotny).
Rejestratory: każdy efekt (`_spawnFx`), każda salwa (`_onCombatRoundFx` — jakość wywiadu końców, bramka mgły, liczba
efektów), cykl życia znacznika starcia, kolejność zdarzeń (proximity / sensor lock / wywiad / `vessel:engaged`), kamera co
klatkę, rzut uczestników na ekran (model, insygnia, celownik, pierścień, panel walki), HP każdego statku co rundę.
Przebiegi (`kosmos-handover/polish-p2-visible-battle/results/`): **W_en** — widok na układ starcia, gra EN (495 s);
**X_en** — widok na układ domowy (starcie w innym układzie, tempo 110 ms — CP4); **W2_pl** — W po polsku + makiety
sondy (kadr śledzący, nakładki w stałym rozmiarze ekranu, paski HP). W_en i W2_pl do chwili makiety — identyczne co do
rundy (te same salwy, te same luki znacznika, ta sama kamera; kontrola X = X). Losowania `Math.random` poza klatką
sondy: 0 we wszystkich trzech; wyjątki konsoli: 0. ⚠ Makiety to WYŁĄCZNIE sonda (podmienione metody instancji w stronie,
kanwa nakładki) — oznaczone „MOCK” w nazwach zrzutów; kod gry bez zmian.

### 10.2 A1 — starcie w innym układzie (453) `[code]` `[measured]`

- **Potwierdzone na kodzie P1** (X_en; widok `sys_home`, starcie w `sys_059` w punkcie (137,66; −60,03) px): auto-fokus
  przestawia cel kamery z (0; 0) na (13,77; −6,00) j. i dystans 450 → 6 — pusty punkt układu domowego; 7 salw rysuje
  **10 smug i 5 błysków** oraz pierścień znacznika (13,766; −6,003) w układzie domowym (współrzędne z migawek ładunku —
  sprite'ów statków z innego układu nie ma); zrzut `p2_x_2_autofocus_salvo.png` (smuga i pierścień obok gwiazdy domowej).
- **Czwarte miejsce bez terminu układu (nowe):** przycisk „Obserwuj / Watch” panelu walki emituje
  `camera:watchBattle { x, y }` bez układu (`CombatHUD.js:425`), a handler (`ThreeRenderer:1076`) zbliża kamerę na ten
  punkt w OGLĄDANYM układzie — zrzut `p2_x_3_watch.png` (kula błysku trafienia w pustce obok gwiazdy domowej).
- **Co gracz widzi zamiast tego dziś:** panel walki pokazuje wszystkie starcia (także z innego układu) — bez nazwy układu
  w wierszu (`CombatHUD._drawEncounterRow`); wpis Dziennika „auto-slow” przy prędkości > 1 d/s; baner i linia Dziennika
  po bitwie. Dzwonka dla startu starcia nie ma (`NotificationCenter` — żadnej subskrypcji `vessel:engaged`).
- **Najmniejszy kształt:** jedna czysta reguła `isEngagementInView({ encounterSystemId, activeSystemId })` w
  `VesselFxLogic` (wzór SB43 `isMovementPulseVisible`, Finding 415) na czterech wejściach: `_onCombatRoundFx` (DSCS
  dokłada `systemId` do ładunku `combat:roundFx` — emit wyłącznie FX, bez zegara), auto-fokus `vessel:engaged`
  (`location.systemId` już w ładunku), znacznik (karmiony tylko z salw), `camera:watchBattle` (panel podaje `systemId`;
  dla innego układu renderer najpierw przełącza widok `starSystemManager.switchActiveSystem`, potem kadruje). W
  oglądanym układzie — nic; w wierszu panelu — nazwa układu starcia.

### 10.3 A2 — kamera „Obserwuj / Watch” (458, 459) `[code]` `[measured]`

- **Mechanizm `[code]`:** `camera:watchBattle` (`ThreeRenderer:1076-1083`) — `setMinDist(0.005)`,
  `focusOnInstant(punkt starcia, y 0,3)`, `setTargetDist(min(cel, 1,2))`; punkt = `encounter.location.point` — STAŁY punkt
  środkowy pary wyzwalającej z chwili startu; śledzenia brak (`_focusEncounterId` jest ustawiany, ale nikt go nie czyta);
  `minDist 0,005` zostaje po bitwie aż do następnego fokusu (ciało / statek / stacja). Kamera: FOV 55°, φ 1,1 rad;
  kadr pionowo w płaszczyźnie celu = 2·d·tan 27,5°.
- **Rozmiary `[code]`:** model fregaty 0,016 j. (`VESSEL_TARGET_SIZE.frigate`) = 0,0015 AU; zasięgi broni 0,05 / 0,15 /
  0,30 AU = 33–200 długości statku. Nakładki w rozmiarze ŚWIATA: insygnia (szewron) 0,32 j. zawieszona 0,4 j. nad
  statkiem; pierścień znacznika starcia promień 0,25–0,32 j.; celownik wroga 0,7 × max(0,5; d / 60) j. (rośnie przy
  zbliżeniu poniżej d = 30); błysk trafienia — kula promienia 0,06 j. rosnąca ×3.
- **Pomiar `[measured]`** (W_en = W2_pl; viewport 1584 × 805; panel walki x 479–1104, y 519–748 px):

| kadr | dist [j.] | kadr pionowo [AU] | model px | insygnia px | celownik px | pierścień (promień) px | środek walki od celu kamery [AU] |
|---|---|---|---|---|---|---|---|
| auto-fokus, runda 6 | 6,01 | 0,568 | 1,9 / 2,4 | 41 / 35 | 38 | 25 | 0,079 |
| „Obserwuj” +45 klatek, runda 7 | 1,31 | 0,124 | 8,7 / 8,4 | 199 / 121 | 119 | 121 | 0,091 |
| „Obserwuj”, salwa rundy 9 | 1,21 | 0,115 | 9,1 / 9,0 | 176 / 129 | 138 | 150–165 | 0,115 |
| MOCK: kadr śledzący + nakładki 22 / 30 px, salwa rundy 11 | 0,42 | 0,040 | 66 / 28 | 31 / 20 | 27 | ukryty | 0,001 |

  Błysk trafienia przy „Obserwuj” (d 1,21) `[derived]`: 77 px na starcie → 230 px na końcu — przy modelu 9 px. Pierścień
  pulsuje ±10 % (dwa przebiegi: 150 i 165 px w tej samej klatce). Zrzuty:
  `p2_w_3_watch.png`, `p2_w_4_watch_salvo.png` (szewrony ~120–200 px, celownik ~130 px, pierścień pod panelem walki,
  modele jako kropki przy prawej krawędzi), `p2_w_5_MOCK_watch_follow_salvo.png` (makieta).
- **Werdykt A2:** „Obserwuj” nie jest za BLISKO — kadr wszystkich żywych uczestników z marginesem 80 px nad panelem
  walki wymaga dla tej pary (0,043–0,047 AU) **d ≈ 0,40–0,43 j.**, czyli ~3 × bliżej. Statków nie widać, bo (1) kamera
  patrzy w STAŁY punkt startu, a walka odpływa od niego o 0,08–0,115 AU (fregata podlatuje do strażnika, który trzyma
  orbitę) — statki lądują przy krawędzi; (2) nakładki w rozmiarze świata rosną przy zbliżeniu do 120–200 px i
  zasłaniają modele 8–9 px; (3) pierścień znacznika (promień 121–165 px) wisi w pustym punkcie pod panelem walki.
  Zgłoszenie właściciela („za blisko”) `[derived]`: przy zbliżeniu ekran wypełniają ikony, a statków nie widać.
- **Makieta (sonda):** cel = środek ciężkości SPRITE'ÓW żywych uczestników co klatkę, dystans = najmniejszy, przy którym
  wszyscy mieszczą się w prostokącie bez panelu walki (szukanie po rzucie), [0,4; 12] j.; szewrony 22 px, celownik 30 px
  w stałym rozmiarze ekranu, pierścień ukryty — modele 28–66 px, oba statki w kadrze, smugi czytelne. ⚠ Pierwsza wersja
  makiety (pozycje LOGICZNE, wysokość 0,3) postawiła strażnika pod panelem walki: statek na orbicie ciała jest rysowany
  w 3D na wysokości y = r·cos φ orbity, a pozycja logiczna jest płaska — **kadr musi liczyć się z pozycji sprite'ów**.
  Zależność od rozpiętości `[derived]`: model px ≈ 0,016 / (1,0412 · d) × 805; dla pojedynku na zasięg rakiet (0,30 AU)
  dopasowanie da d ≈ 2,5–3 j. ⇒ modele ~4–5 px — przy dalekim starciu statki zawsze będą małe, czytelność niosą ikony
  z limitem rozmiaru i paski HP (pytanie 3).
- **Auto-fokus (459) `[measured]`:** przy `vessel:engaged` kamera stoi na kadrze układu (d 450); cel 6, lerp 0,08 na
  klatkę (zależny od FPS) — d ≤ 6,3 dopiero po **88 klatkach = 1408 ms**, a runda 1 pada po 64 ms (d 324), runda 2 po
  480 ms (d 42), runda 3 po 880 ms (d 10,2), runda 4 po 1280 ms (d 6,6) — przy 400 ms na rundę cztery pierwsze rundy mijają
  przed dolotem kamery. Przełącznik `uiPrefs.battleAutoFocus` nie ma producenta (rodzina **164**) — gracz nie wyłączy
  auto-fokusu.
- **Reguła kadru (propozycja):** „Obserwuj” = śledzenie środka sprite'ów żywych uczestników (lerp kontrolera jak dziś,
  co klatkę), dystans z dopasowania rzutem do prostokąta bezpiecznego (viewport bez panelu walki i marginesu), granice
  [0,4; 6] j.; śledzenie kończy ruch gracza (obrót, zoom, inny fokus) albo koniec starcia; `minDist` wraca do wartości
  sprzed „Obserwuj”. Czysta matematyka kadru (rzut perspektywiczny bez THREE) — wykonywalna pod node w keeperze.

### 10.4 A3 — HP pojedynczego statku (451) + błysk trafienia `[code]` `[measured]`

- **Dziś:** panel walki — dwa zbiorcze paski stron z liczbami, lista statków (nazwa, kadłub, broń, kolor żywy / zniszczony),
  6 ostatnich zdarzeń z obrażeniami („R9: P1 n0 → Wieża Laserowa → Sztylet (13 dmg)”); na mapie nic per statek.
  Infrastruktura jest: `getVesselScreenPosition` („źródło prawdy dla 2D-zakotwiczonych UI per statek — ramki, paski HP”)
  i ramki selekcji z paskami paliwa (`UIManager._drawSelectionBrackets`) — dziś tylko dla własnych, tylko zaznaczonych.
- **Dane `[measured]`:** `vesselStates` niesie hp / hpStart / tarczę co rundę. Starcie W: P1 n0 120 → 49,6 (r1, dwie
  rakiety) → 14,4 (r11) → −20,8 (r16, wrak); Sztylet 120 → 107 (r9) → 94 (r13) → 81 (r15) — HP zmienia się w 6 z 16 rund.
- **Najmniejszy wskaźnik:** pasek 40 × 5 px pod statkiem (2D, warstwa UI jak ramki selekcji), kolor strony (własny zielony,
  wróg czerwony) + pasek tarczy 2 px; widoczny dla uczestników aktywnego starcia w oglądanym układzie (wróg — przy
  wywiadzie ≥ contact albo jako uczestnik starcia z graczem: panel i tak go nazywa — pytanie 4), znika z końcem starcia.
  Koszt: jedno przejście rysowania na klatkę po uczestnikach (≤ 2 × N), bez nowych danych. Makieta:
  `p2_w_6_MOCK_hpbars.png` (W2_pl) — paski pod oboma statkami w kadrze śledzącym.
- **Błysk trafienia:** ładunek `combat:roundFx` niesie {atakujący, cel, trafienie, kategoria, zablokowane tarczą} — sygnał
  jest. Dziś błysk to osobna kula przy celu (0,06 j. → ×3), przy „Obserwuj” 77 → 230 px wobec modelu 9 px; model nie
  zmienia wyglądu. ⚠ `_addVesselModel3D` klonuje materiały tylko wrogom i wrakom — statki gracza dzielą materiały szablonu
  GLB, więc puls emisji na modelu wymaga klonu per statek (leniwie, przy pierwszym trafieniu) albo poświaty dopasowanej do
  rozmiaru modelu (addytywny sprite, ~150–200 ms); kulę błysku skalować do modelu.

### 10.5 A4 — salwa pierwszej rundy (455) `[measured]` — hipoteza mgły POTWIERDZONA

Kolejność zdarzeń (W_en = W2_pl = X_en, numery kolejne w obrębie klatki): `vessel:combatRangeEnter` strażnik ↔ P1 n0 przy
**0,3123 AU** (próg wejścia = zasięg rakiet 0,30 × 1,05 = 0,315 AU, `ProximitySystem:257-261`) → `vessel:engaged` →
runda 1 (zbliżenie do 0,2845 AU, strażnik odpala 2 rakiety, oba trafienia, −70,4 HP) → `combat:roundFx` przy jakości
wroga **`rumor`** → `_combatEndpointWorld` → `null` (bramka mgły ≥ contact, `ThreeRenderer:6256`) → **0 smug, 0 błysków**
(2 zdarzenia pominięte) → w TEJ SAMEJ klatce drugie wywołanie proximity w `VesselManager._tick`: `vessel:sensorLockEnter`
przy 0,2841 AU (`SENSOR_LOCK_AU` 0,30 × mnożnik techu 1,0) → wywiad `rumor → contact` (powód `sensor_lock`). Salwa
otwierająca to w tej scenie 59 % HP fregaty. Panel walki nazywa wroga od startu („Liga Trzech Słońc — Sztylet”, log
„R1: Sztylet → Wyrzutnia Rakiet → P1 n0 (35 dmg)” × 2). Przy tempie 110 ms salwa otwierająca dawała przy okazji
pokrycie rund 2–5 (symulacja §10.8: 65,1 % → 98,8 %).
⚠ Nawet narysowana, salwa rundy 1 nie byłaby dziś WIDZIANA: kamera auto-fokusu stoi wtedy na d 324 (459). Naprawa ma
sens tylko razem z 459.
**Kształt:** reguła prezentacji w `VesselFxLogic` — wróg będący uczestnikiem aktywnego starcia z graczem jest widocznym
końcem smugi (pozycja z migawki ładunku), niezależnie od wywiadu (pytanie 5). Odrzucone: podbicie wywiadu przy starcie
starcia (zmiana stanu, nie prezentacja) i odroczenie efektów o klatkę (obejście).

### 10.6 A5 — znacznik starcia (457) `[measured]`

Na zegarze klatek co do 16 ms (W_en = W2_pl, 400 ms): znacznik powstaje przy rundzie 1 (+64 ms; `_upsertEngagementMarker`
woła się także, gdy smugi pominęła mgła), **gaśnie przy aktywnym starciu dwa razy**: +1680 ms (rundy 2–5 bez strzału) —
luka 416 ms do rundy 6; +5696 ms W PAUZIE 2,6 s — luka 1808 ms. Przy 110 ms (X_en): 0 usunięć, 6 dotknięć. Dotychczasowe
„stoi na `[code]`” (walidator P1 w czasie realnym nie rozstrzygał) — teraz zmierzone deterministycznie.
**Kształt:** znacznik żyje, dopóki starcie jest aktywne (także w pauzie), i znika z jego końcem: `_tickEngagementMarkers`
synchronizuje się z `deepSpaceCombatSystem.listActive()` (z regułą 453 — tylko starcia w oglądanym układzie); TTL 1600 ms
zostaje wyłącznie dla jednorazowych „imitacji” bitew orbitalnych (`orbital_*`, `_spawnBattleBurst`). Pozycja: stały
punkt startu (dziś) albo środek sprite'ów walki (pytanie 2).

### 10.7 A6 — „Tur: 0” (450) i język okna wyniku (163) `[code]` `[measured]`

- **Pomiar:** EN — baner „PORAŻKA · Player vs Liga Trzech Słońc · Tur: 0 · Straty: 1 / 0”, Dziennik „⚔ Battle in deep
  space (Propus): … Losses: 1/0, **0 turns**.” (zrzut `p2_w_8_result.png`); PL — „PORAŻKA · Gracz vs Liga Trzech Słońc ·
  Tur: 0 · Straty: 1 / 0”, „… Straty: 1/0, **0 tur**.”; `battle:resolved` — pola `turns` brak, `timeline` 16 rund.
- **Gdzie ginie:** rekord DSCS (`_finalizeBattle`, `:1061-1088`) nie ma pola `turns`; trzej czytelnicy `turns ?? 0` —
  baner (`BattleIntroModal:289`), Dziennik (`GameScene:2667`), lista bitew wojny (`WarSystem:523` → `WarOverlay:349`).
  **Kształt:** `turns: encounter.currentRound` — jedno pole (v101 bez migracji; stare rekordy `?? 0`).
- **163 nie jest jedną linią:** `showBattleOutcome` ma 6 zaszytych literałów (`ZWYCIĘSTWO` / `PORAŻKA` / `REMIS`,
  zastępcze `Agresor` / `Obrońca`, `Tur:`, `Straty:`) — ok. 6 par kluczy PL + EN, ~8 linii; `innerHTML` jest poza sinkami
  `check-i18n` (baseline bez zmian). Naturalnie w jednym commicie z 450 (ta sama linia szablonu) i z **464** (etykiety
  stron DSCS przez istniejące klucze). Mieści się w P2b (~0,25–0,5 sesji).

### 10.8 A7 — efekty przy 400 ms `[code]` `[measured]` `[derived]`

- **Czasy życia `[code]`:** smuga 260 ms (`FX_TRACER_MS`), błysk 460 ms po 150 ms, pierścień tarczy 360 ms po 150 ms,
  rozrzut salwy 40 ms × (i mod 8), znacznik 1600 ms bez odświeżenia, eksplozja 600 / 800 ms — strojone pod rundy 110 ms.
- **Pokrycie `[measured]`** (czas aktywnego starcia bez pauzy; symulacja offline z zarejestrowanych salw — `probes/pacing_p2.mjs`):

| tempo | czas aktywny | rundy ze strzałem | dziś | + salwa otwierająca (455) | smuga max(260; 0,9 R), błysk max(460; R) | smuga max(260; 1,8 R), błysk max(460; 1,5 R) (+455) |
|---|---|---|---|---|---|---|
| 400 ms (W) | 6048 ms | 7 z 16 (r1 przez mgłę) | **32,5 %**, przerwy 2032 / 868 / 768 ms | 43,3 % | 32,5 % | 43,8 % (56,3 %) |
| 110 ms (X, CP4) | 1664 ms | 7 z 16 | 65,1 %, najdłuższa 560 ms | 98,8 % | 65,1 % | 65,1 % (96,8 %) |

  Same smugi: 18,7 % czasu aktywnego przy 400 ms, 65,1 % przy 110 ms. Werdykt: efekty strojone pod 110 ms pokrywają
  przy 400 ms połowę udziału czasu sprzed P1; wydłużanie efektów pomaga mało — ograniczeniem jest KADENCJA salw z
  reguł (laser co 2 rundy, rakieta co 5; rundy 2–5 to samo zbliżanie). Przerwy wypełnia ruch: zbliżenie dziś idzie
  SKOKIEM (461 — 0,0282 AU raz na rundę, ≈ 100 px co 400 ms przy „Obserwuj”, ≈ 20 px przy auto-fokusie; sprostowanie
  P1 §3.3 „w siatce ruch idzie 6–7 krokami na rundę” — dla zbliżenia w starciu nieprawda, `_closeToWeaponRange`
  przesuwa raz przed rundą).
- **Propozycja:** (1) czasy efektów oglądanego starcia z tempa rundy R (`timeSystem.combatRoundMs()` — bez nowego
  czytelnika tabeli strojenia, R-P1-2): smuga max(260; 0,9 R), błysk max(460; R), rozrzut R / 10; (2) płynne zbliżenie —
  renderer interpoluje sprite uczestnika do pozycji logicznej w czasie rundy (logika nietknięta); (3) opcjonalnie lot
  pocisku rakiety przez ~0,8 R zamiast linii natychmiastowej.
- **Dźwięk:** `AudioSystem` nie ma ŻADNEGO zaczepu walki (subskrybuje `body:collision`, zdarzenia życia, akcje gracza,
  stan czasu). Sygnały gotowe do podpięcia: `vessel:engaged`, `combat:roundFx` (trafienie / kategoria per zdarzenie),
  `vessel:wrecked` (eksplozja), `battle:resolved` — tylko lista.

### 10.9 A8 — keepery a kroki P2 `[code]` `[measured]`

| keeper | co pinuje | krok P2 | werdykt |
|---|---|---|---|
| `combat_pace_smoke` T9a | DSCS bez `performance.now` / `Date.now` / `_nowMs` | P2-1 (`systemId` w ładunku FX) | zielony — bez zegara; KAŻDY krok wnoszący czas realny do DSCS — czerwony |
| `combat_pace_smoke` T9c | `_tickOrbitingVessels` / `_tickOrbitingStations`: `const tSec = orbitClockSec();` | P2-4 (płynne zbliżenie) | zielony, jeśli interpolacja nie rusza tej linii |
| `sb3_combat_closing_smoke` T1–T10 | krok zbliżenia na zegarze starcia (logika) | P2-4 | zielony tylko przy interpolacji WYŁĄCZNIE w rendererze; rozłożenie kroku logicznego na klatki siatki — czerwony i zmiana wyniku (zakazane) |
| `sb1_fleet_tuning_smoke` T11b | zamknięty zbiór 4 czytelników `StrikesBackTuning.js` | P2-4 (tempo efektów) | zielony przy odczycie `timeSystem.combatRoundMs()`; import tabeli w rendererze albo nowy klucz — czerwony (przecelowanie, zgoda) |
| `sb1_fleet_pool_smoke` T1c | każdy klucz tabeli ma konsumenta | — | zielony (P2 nie dodaje klucza) |
| `sb2b_pulse_scope_smoke` T6 | `_spawnMovementPulse` przez `isMovementPulseVisible` | P2-1 (siostrzana reguła w `VesselFxLogic`) | zielony (import przez przestrzeń nazw) |
| `battle_result_classification_smoke` T2 | jeden producent `vessel:engaged` (DSCS) | P2-1, P2-2 | zielony (bez nowego emitenta) |
| `patrol_render_sync_smoke` | jedna subskrypcja `vessel:positionUpdate` w rendererze | P2-4 | zielony, jeśli bez drugiej subskrypcji |
| `map_vessel_panel_smoke` P13 | gałąź „docked” w `_syncVesselPositions` | P2-2 / P2-4 | zielony |
| `i18n_269_amin_smoke`, `check-i18n` + `i18n_hardcoded_gate_smoke` | brak literałów PL w rendererze; nowe napisy przez `t()` | P2-1 (nazwa układu w panelu), P2b-1 | zielone przy kluczach PL + EN |
| `fleet_engage_scope` T3b · `fleet_engage_picker_frame` T5b | pierwsza runda DSCS deterministycznie | — | zielone (P2 nie rusza rund) |
| `battle_announce_once`, `w3_battle_booking`, `sb2b_*` (rekord bitwy) | pola rekordu, nie jego kształt | P2b-1 (`turns`) | zielone (grep: żaden keeper nie pinuje kluczy rekordu ani `turns`) |
| `sb2b_wreck_still_smoke` T1 | wrak stoi w miejscu zniszczenia | P2b-2 (miejsce wraku) | do sprawdzenia fail-first przy zmianie `wreckLocation` |

Renderera i `UIManager` nie da się zaimportować pod node — zachowanie rysowania pinują wyłącznie piny źródłowe i czyste
moduły (wzór `VesselFxLogic`, `StationRenderLogic`); w krokach rendererowych keeper ma postać „czysta reguła wykonaniem +
pin źródłowy wywołania”, a dowodem wyglądu jest bramka w przeglądarce.

### 10.10 Propozycja — łańcuch kodu P2 (kolejność: CP7, potem wartość dla celu)

| krok | treść | findingi | keeper | szacunek | co właściciel zobaczy na bramce |
|---|---|---|---|---|---|
| **P2-1** | termin układu dla efektów starcia (reguła `isEngagementInView`, 4 wejścia) + „Obserwuj” na starcie w innym układzie przełącza widok + nazwa układu w wierszu panelu | 453 | NEW `combat_view_scope_smoke`: reguła wykonaniem; DSCS emituje `systemId` (wykonanie — DSCS importuje się pod node); piny źródłowe 4 wejść | 0,5 sesji | starcie w innym układzie: widok czysty, kamera nie skacze; „Obserwuj” przenosi do układu bitwy |
| **P2-2** | kadr „Obserwuj” śledzący środek sprite'ów, dystans z dopasowania [0,4; 6] j.; nakładki z limitem rozmiaru ekranowego; pierścień przy „Obserwuj” ukryty / przy walce | 458 | NEW `combat_watch_frame_smoke`: czysta matematyka kadru (rzut bez THREE) na liczbach z sondy; piny źródłowe | 1 sesja | klik „Obserwuj” → oba statki w kadrze, modele kilkadziesiąt px, ikony nie zasłaniają, kamera idzie za walką |
| **P2-3** | pasek HP nad uczestnikami aktywnego starcia + błysk trafienia na modelu; kula błysku dopasowana do modelu | 451 | NEW `combat_hp_bar_smoke`: czysty model paska (ułamek, kolor, widoczność, mgła) wykonaniem; piny źródłowe | 1 sesja | pasek spada przy każdym trafieniu; trafiony statek błyska |
| **P2-4** | czasy efektów z tempa rundy + płynne zbliżenie (interpolacja sprite'a) | A7, 461 | NEW `combat_fx_pace_smoke`: czysta funkcja czasów wykonaniem; `sb3_combat_closing` zielony | 0,5–1 sesji | salwa trwa dłużej; między salwami statek widocznie podlatuje zamiast skakać |
| **P2-5** | znacznik starcia wg stanu starcia (także w pauzie) | 457 | czysta funkcja synchronizacji wykonaniem + pin źródłowy | 0,25 sesji | pierścień nie miga między salwami ani w pauzie |
| **P2-6** | salwa otwierająca widoczna: reguła „uczestnik starcia z graczem = widoczny koniec smugi” + auto-fokus dolatuje przed rundą 1 (szybszy lerp albo natychmiastowe ustawienie celu przy starcie) | 455, 459 | rozszerzenie `combat_view_scope_smoke` (reguła) + pomiar w sondzie | 0,5 sesji | pierwsza salwa — najmocniejsza w tej scenie — widoczna na mapie |
| P2b-1 | „Tur: N” + okno wyniku przez słownik + etykiety stron DSCS przez istniejące klucze | 450, 163, 464 | NEW `battle_outcome_i18n_smoke` (wykonanie, atrapa DOM z `headless/env.js` — do sprawdzenia, czy `BattleIntroModal` się importuje) | 0,25–0,5 sesji | „Tur: 16”; w grze EN „DEFEAT … Turns … Losses” |
| P2b-2 | śmierć widoczna w rundzie zniszczenia (wybuch, model wygaszony do końca starcia) + miejsce wraku | 460 | do ustalenia (zmiana `wreckLocation` = zmiana stanu) | 0,5 sesji | statek wybucha, gdy ginie, nie na końcu |
| P2b-3 | wróg — uczestnik starcia z graczem — w pełnym kryciu | 462 | czysta reguła + pin | 0,1 sesji | model wroga nie jest półprzezroczysty |

**Linia cięcia (rekomendacja):** P2 = P2-1 … P2-6 (≈ 4 sesje + bramka w przeglądarce). Różnica wobec oczekiwania z
polecenia: **455 w P2, nie w P2b** — sama naprawa jest mała, a bez niej najmocniejsza salwa starcia (tu 59 % HP fregaty)
zostaje niewidzialna; ale ma sens wyłącznie razem z 459 (kamera dolatuje 1408 ms po starcie), dlatego P2-6 łączy obie.
P2b = 450 + 163 + 464 (mały, oglądany po każdej bitwie — można dociągnąć do P2), 460, 462. Poza P2: **463** (szum
zdarzeń w `ProximitySystem` — logika, nie prezentacja).

### 10.11 Pytania do właściciela (tylko te, które zmieniają implementację)

1. **Kadr „Obserwuj”:** (a) śledzi walkę i dopasowuje dystans co klatkę, aż gracz ruszy kamerą (rekomendacja; makieta
   `p2_w_5_MOCK_watch_follow_salvo.png`); (b) jednorazowy kadr w chwili kliknięcia.
2. **Nakładki przy zbliżeniu:** (a) limit rozmiaru na ekranie (szewrony ≤ ~36 px, celownik ≤ ~44 px), pierścień starcia
   ukryty przy „Obserwuj”, a poza nim — w środku walki (rekomendacja); (b) szewrony i celownik ukryte przy „Obserwuj”;
   (c) bez zmian.
3. **Modele przy dalekim starciu:** przy wymianie na zasięg rakiet kadr wszystkich daje modele ~4–5 px. (a) zostają —
   czytelność niosą ikony i paski HP (rekomendacja dla P2); (b) powiększenie modeli uczestników na czas oglądanego
   starcia (prezentacja).
4. **Paski HP:** (a) uczestnicy aktywnego starcia w oglądanym układzie, obie strony (rekomendacja); (b) tylko własne;
   (c) także poza walką dla zaznaczonych (trwałe uszkodzenia `combatDamage`).
5. **Wróg w starciu z graczem** (455, 462): (a) dla prezentacji „ujawniony” — smugi salwy otwierającej rysowane bez
   względu na wywiad i model w pełnym kryciu (panel walki i tak go nazywa) (rekomendacja); (b) mgła bez wyjątku.
6. **Błysk trafienia na modelu:** kolor (a) broni, jak smuga (rekomendacja) / (b) biały; czas (a) stały ~150–200 ms
   (rekomendacja) / (b) od tempa rundy.
7. **(P2b) Śmierć statku:** (a) wybuch w rundzie zniszczenia, wrak tam, gdzie statek zginął (zmiana stanu —
   `wreckLocation`); (b) wybuch w rundzie zniszczenia, wrak jak dziś w punkcie środkowym; (c) bez zmian.

### 10.12 Czego nie zweryfikowano

- Wygląd docelowy — makiety to sonda (podmienione metody, kanwa nakładki); błysk na modelu i płynne zbliżenie — bez makiety.
- Jedna scena: 1 na 1, laser ↔ rakiety, starcie na zasięg lasera. Starcia wielu statków i pojedynek na zasięg rakiet
  (kadr ~2,5–3 j.) — tylko `[derived]` ze wzoru rozmiaru.
- 460 (śmierć odroczona do końca starcia) — tylko `[code]`: w scenie 1 na 1 śmierć kończy starcie w tej samej rundzie;
  zmierzony jest wyłącznie skok wraku do punktu środkowego (0,0895 AU).
- Czas dolotu auto-fokusu (459) przy innym FPS — lerp jest na klatkę; zmierzone przy 60 FPS zegara sondy.
- Panel walki w innych rozdzielczościach (zmierzone 1584 × 805, UI_SCALE 1,25).
- Wydajność 463 (szum zdarzeń) — policzone zdarzenia, czasu klatki nie mierzono.
- Bramka w przeglądarce właściciela — nie dotyczy (audyt).

## 11. P2a — kod (2026-10-17): ZACOMMITOWANY 2026-10-18 — `e866bd6` · `51f8e81` · `dc533cf` · `9e752cc`

Polecenie właściciela (2026-10-17): kod P2a według CP13–CP20 — kamera „Watch”, nakładki, znacznik, pierwsza salwa,
efekty starcia w innym układzie; prezentacja wyłącznie (bez zmian matematyki walki, zegarów, wyników i zapisu); keeper
fail-first na krok, zachowanie renderera — uprząż pomiarowa w prawdziwej grze (render, zegar deterministyczny jak w sondzie
audytu P2); STOP przed commitem. Folder: `kosmos-handover/polish-p2a-code/` (SHA256SUMS). Zakres: P2-1 (453), P2-2 (458;
CP13, CP14), P2-5 (457), P2-6 (455, 459; CP17 — także 462). P2b (451 + błysk trafienia, A7 + 461) — następna sesja.

### 11.1 Łańcuch `[git]` `[measured]`

| krok | treść | keeper kroku: fail-first (wersja kroku na drzewie poprzedniego) → na kroku | sweep · `check-i18n` |
|---|---|---|---|
| baza | `9de9a20` | — | 310/310 · PASS, pl = en 3458 |
| **C1** P2a-1 | 453 — `isEngagementInView` na czterech wejściach renderera, `systemId` w `combat:roundFx`, „Watch” przełącza układ | NEW `combat_view_scope_smoke` **8 / 21 → 29 / 0** | **311/311** · PASS 3458 |
| **C2** P2a-2 | 458 — kadr „Watch” (CP13), nakładki z limitem i pierścień ukryty (CP14), efekty walki z limitem przy „Watch” (Q1) | NEW `combat_watch_frame_smoke` **1 / 41 → 42 / 0** | **312/312** ⁽ᵃ⁾ · PASS 3458 |
| **C3** P2a-3 | 457 — znacznik wg stanu starcia | NEW `combat_marker_life_smoke` **3 / 15 → 18 / 0** | **313/313** · PASS 3458 |
| **C4** P2a-4 | 455, 459, 462 — wróg w starciu z graczem w pełni widoczny, auto-fokus natychmiast (CP17) | `combat_view_scope_smoke` (wersja C4) **34 / 13 → 47 / 0** | **313/313** · PASS 3458 |

⁽ᵃ⁾ Powtórka bez obciążenia; budowa weryfikacyjna — 311/312 (limit czasu `run-all`, §11.5).

**Commity (2026-10-18, `tools/commit_P2A.sh` bez argumentów, po bramce §11.9):** C1 `e866bd6` · C2 `51f8e81` · C3
`dc533cf` · C4 `9e752cc` — drzewa kroków = `patches/trees.txt` (C1 `6c07a53a` · C2 `1fd596cf` · C3 `bc7d60a0` · C4
`8d2d9de7`); na `9e752cc` sweep **313/313, 0 FAIL** (31 advisory), `check-i18n` PASS pl = en 3458 `[measured]`.

Na C4: `combat_view_scope_smoke` 47 / 0 · `combat_watch_frame_smoke` 42 / 0 · `combat_marker_life_smoke` 18 / 0 ·
`combat_pace_smoke` 71 / 0. Kontrole pinu (np. `combat_watch_frame` T11-0) zielone po obu stronach fail-first.

Łańcuch zbudowany w świeżym klonie (`tools/build_chain_P2A.sh`, wynik `results/chain_final/`): fail-first keepera kroku
(jego wersja z tego kroku) na drzewie POPRZEDNIEGO kroku, łatka, commit, keeper, pełny sweep + `check-i18n`. Treść
łańcucha = klon roboczy blob w blob. **Przecelowań istniejących keeperów: BRAK** (sweep po każdym kroku 0 FAIL). Save
v101 bez migracji; bez nowych kluczy słownika; bez nowego klucza tabeli strojenia (`sb1_fleet_tuning_smoke` T11b).

### 11.2 Mechanizm `[code]`

- **C1 — 453 (CP7).** NEW `VesselFxLogic.isEngagementInView({ encounterSystemId, activeSystemId })`: starcie DSCS jest
  „w widoku”, gdy jego układ (`location.systemId`) = układ oglądany — ta sama odpowiedź co
  `DeepSpaceCombatSystem.engagementView` ('watched'), więc tempo starcia (CP4) i rysowanie mówią o tym samym układzie;
  brak układu ⇒ nie w widoku. Cztery wejścia renderera: `_onCombatRoundFx` (smugi, błyski), znacznik (od C3 — plan
  znaczników), auto-fokus `vessel:engaged`, „Watch” (`watchBattleAction`: ten sam układ — kadruj; inny —
  `starSystemManager.switchActiveSystem`, potem kadr). DSCS: `systemId` w ładunku `combat:roundFx` (bez zegara —
  `combat_pace_smoke` T9a zielony). `CombatHUD`: przycisk „Watch” niesie id i układ starcia.
- **C2 — 458 (CP13, CP14).** NEW `src/renderer/CombatWatchLogic.js` (czysta matematyka, bez importów): baza kamery
  kontrolera, rzut, prostokąt bezpieczny (ekran bez górnego paska, dolnych pasków, Outlinera i panelu walki
  `CombatHUD.getPanelRect()`, margines 40 px), `fitWatchFrame` (środek PROSTOKĄTA RZUTU w środku prostokąta — krok
  Newtona; dystans najmniejszy mieszczący, [0,4; 12] j.; najbliższy uczestnik ≥ 0,2 j. od kamery), limit billboardu,
  `watchFxScale`. Renderer: `_startWatch` / `_updateWatchCamera` co klatkę przed `update()` kontrolera (także w pauzie);
  cel — `focusOnSmooth`; starcie w innym układzie — obserwacja startuje od razu, kadr dopasowuje pierwsza klatka ze
  sprite'ami (model GLB wstawia się asynchronicznie); koniec — starcie skończone / poza widokiem / kamerę przejął inny
  fokus, reset H, zmiana układu; kółko gracza — koniec dopasowania dystansu; minDist na czas „Watch” ≤ 0,05 j., potem
  wraca. Szewron ≤ 36 px, celownik ≤ 44 px (wszędzie; poniżej limitu bez zmian); pierścień znacznika ukryty przy „Watch”;
  efekty walki w rozmiarze świata (błysk, pierścień osłony, wybuch) przy „Watch” nie większe niż w kadrze auto-fokusu
  (głębia 6 j.) — rozszerzenie CP14, pytanie Q1.
- **C3 — 457.** NEW `VesselFxLogic.planEngagementMarkers` (+ `ENGAGEMENT_BURST_TTL_MS` 1600): znaczniki ze starć aktywnych
  w widoku — utwórz brakujące, zdejmij zakończone albo poza widokiem; czas życia wyłącznie dla imitacji bitew orbitalnych
  (`kind: 'burst'`). `_tickEngagementMarkers` synchronizuje co klatkę z `listActive()` (także w pauzie); salwa nie stawia
  już znacznika.
- **C4 — 455, 459, 462 (CP17).** NEW `VesselFxLogic.isPlayerEngagement`, `isEndpointVisibleInCombat`: wróg — wywiad
  ≥ `contact` ALBO uczestnik aktywnego starcia z graczem (panel walki nazywa go od rundy 1 — mapa nie zdradza niczego ponad
  panel); stan wywiadu bez zmian (reguła rysowania). `_applyVesselIntelVisibility`: ujawniony — widoczny, krycie 1, żywa
  pozycja; zbiór ujawnionych synchronizowany przy `vessel:engaged` / `vessel:joinedCombat` i co klatkę (koniec starcia —
  widoczność wg wywiadu). Auto-fokus: cel i dystans (≤ 6 j.) natychmiast — NEW `ThreeCameraController.snapDist`.

### 11.3 Dowód — sonda w prawdziwej grze `[measured]`

Sonda P2a (`probes/run_p2a.mjs`, `p2a_page.mjs`, `analyze_p2a.mjs`, tabela `proof_table_p2a.mjs` →
`results/proof_p2a.md`): fixture GATE-S4, izolowany headless Chrome (SwiftShader, okno 1600 × 900), gra po angielsku,
determinizm jak w audycie P2 (zegar wirtualny, ziarnisty `Math.random`, UUID Three.js i renderer na osobnym strumieniu),
klatka sondy 16 ms = jedna klatka renderu, pomiar w każdej klatce. „Przed” — `9de9a20`, „po” — C4 (migawka
`git worktree` klonu roboczego). Sceny: **W** — 1 na 1 (fregata z laserem ↔ strażnik stolicy `emp_001`), widok na układ
starcia, „Watch” w rundzie 3, pauza 5 s (313 klatek) w rundzie 6; **X** — ta sama scena, widok domowy (starcie w INNYM
układzie), „Watch” w rundzie 3; **V** — 3 na 2 w układzie domowym, „Watch” w rundzie 2.

Kluczowe metryki (pełna tabela — `results/proof_p2a.md`; „—” = nie dotyczy):

| metryka | W przed | W po | X przed | X po | V przed | V po |
|---|---|---|---|---|---|---|
| auto-fokus: kamera ≤ 6,3 j. po `vessel:engaged` (przed kliknięciem „Watch”) | nie doleciała — 10,2 j. po 896 ms | **16 ms** | rusza w pusty punkt układu domowego — 122,9 j. po 256 ms | **stoi** (450 j.) | nie doleciała — 39,5 j. po 496 ms | **16 ms** |
| dystans kamery w rundzie 1 [j.] | 324 | **6** | 414 | 450 | 324 | **6** |
| salwa rundy 1 (wywiad `rumor`): smugi / błyski | 0 / 0 | **2 / 2** | — (inny układ) | — | 0 / 0 | **4 / 2** |
| efekty przy widoku innego układu: smugi / błyski / znaczniki | — | — | 10 / 5 / 1 | **0 / 0 / 0** | — | — |
| krycie wroga w starciu (min) | 0,30 | **1** | — | **1** | 0,30 | **1** |
| znacznik: klatki starcia bez znacznika / najdłuższa luka | 315 z 695 / 4560 ms | **0 / 0** | — | **0 z 327** | 9 z 361 / 64 ms | **0 / 0** |
| znacznik w pauzie 5 s: klatki bez znacznika | 213 z 313 | **0 z 313** | — | — | — | — |
| „Watch”: układ widoku po kliknięciu | `sys_059` | `sys_059` | `sys_home` | **`sys_059`** | `sys_home` | `sys_home` |
| „Watch”: klatki z obserwacją | 0 z 639 | **639 z 639** | 0 | **327 z 327** | 0 z 330 | **326 z 330** ¹ |
| „Watch”: wszyscy żywi uczestnicy w kadrze | 100 % | 100 % | — | **100 %** | 9,7 % | **99,7 %** |
| „Watch”: model px (mediana / max) | 8,9 / 11,6 | **18,0 / 75,5** | — | **27,5 / 49,4** | 57,4 / 1197,7 ² | **16,5 / 60,2** |
| „Watch”: szewron / celownik max [px] | 279,8 / 149,4 | **36 / 44** | — | **36 / 44** | 1 135 966 / 2647 ² | **36 / 44** |
| „Watch”: pierścień znacznika widoczny [klatki] | 328 | **0** | — | **0** | 325 | **4** ¹ |
| „Watch”: największy efekt walki z obserwacją [px] ³ | 158,6 | **46,3** | — | **46,3** | 2340 | **46,3** |
| „Watch”: dystans kamery (mediana) [j.] | 1,2 | 0,72 | — | 0,44 | 1,2 | 0,52 |

¹ V: po odwrocie strażnika obserwacja kończy się z jego starciem; pościg (drugie, jednorundowe starcie) — auto-fokus,
bez obserwacji (4 klatki, pierścień widoczny, efekt do 143,9 px przy kamerze 0,52 j. — finding 466).
² V przed: stały kadr 1,2 j. w środku formacji — kamera w statkach (stąd mediana 57 px przy 9,7 % „wszyscy w kadrze”).
³ Średnica na ekranie największego błysku / pierścienia osłony / wybuchu; „przed” — w oknie po kliknięciu „Watch”.
Stan pośredni (C4 z poprawkami śledzenia, bez limitu efektów, `results/V_en_nofxcap/`): wszystkie metryki V = „po”,
oprócz efektu walki z obserwacją — **1397 px**.

**Walka bez zmian `[measured]`:** sygnatura (rundy, zwycięzca, odwrót, straty, strzały i trafienia per strzelec, wraki)
przed = po w każdej scenie — W i X: 16 rund · zwycięzca B · straty 1/0 · `v_27` 8/4, `v_32` 4/3 · 8 wraków; V: 15 rund
· zwycięzca A, odwrót B · straty 0/1 · 5 strzelców (4/1, 6/3, 6/6, 6/6, 6/5) + pościg 1 runda (3 × 1/1) · wraki
`v_32`, `v_33`; 0 losowań poza klatką sondy, 0 błędów konsoli w każdym przebiegu; V przed ×2 (`V_en_before_run1/`) —
identyczne co do metryki. **Sonda P1** (`polish-p1-code/probes/run_p1c.mjs`, scena n, klucz 400 ms, starcie oglądane)
na C4: **SYGNATURA = P1** — trzy bitwy 16 / 6 / 11 rund (12/7, 4/4, 7/6 strzałów/trafień), te same wraki
(`results/p1_signature/summary.txt`). `combat_pace_smoke` na C4: 71 / 0.

### 11.4 Defekty złapane uprzężą przed zestagowaniem `[measured]`

Pierwsze przebiegi „po” (kod sprzed poprawek kroku C2 — wyniki w `results/*_prefix2/`) ujawniły trzy defekty kodu
i dwa defekty narzędzi; każdy poprawiony i zmierzony ponownie (C2 poprawiony w klonie, łańcuch przebudowany):

1. **„Watch” na starcie w innym układzie bez śledzenia** (X): po `switchActiveSystem` sprite'y uczestników wstawiają się
   asynchronicznie (obietnica loadera GLB), kadr w chwili kliknięcia ich nie widział → dawny stały kadr 1,2 j.: obserwacja
   w 0 z 327 klatek, pierścień widoczny w 327, model 7,4 px (mediana). Poprawka: start obserwacji, kadr z pierwszej klatki
   ze sprite'ami — keeper T11c3.
2. **Kamera ciągnęła się za walką** (V): lerp 0,08 na klatkę (`flyTo`) — przy 0,47 j. statek lecący ku kamerze wjechał
   w nią (model do 80 376 px w jednej klatce, rzut poza ekran w kolejnych). Poprawka: `focusOnSmooth` — keeper T11c2.
3. **Efekty walki w rozmiarze świata przy bliskim kadrze** (V): pierścień osłony zakrywał pół ekranu. Stan pośredni (C4
   z poprawkami 1–2, bez limitu efektów — migawka `9d0d9b5` klonu roboczego) zmierzony ponownie: `results/V_en_nofxcap/`
   (pierwszy przebieg tego stanu usunięty przy restarcie kolejki — §11.8). Poprawka: `watchFxScale` przy „Watch” —
   keeper T12; rozszerzenie CP14 do potwierdzenia (Q1); poza „Watch” — 466.
4. **(narzędzie) Strażnicy sceny 3 na 2 i sceny A bramki bez modelu**: przeniesieni z układu stolicy `emp_001` mutacją
   `systemId` — renderer nie dostał zdarzenia; poprawka: `vessel:positionUpdate` (jak `undockToOrbit`).
5. **(narzędzie) „Kamera ruszona na starcie”** czytana w słuchaczu `vessel:engaged` sondy widziała kamerę już
   przesuniętą — na `9de9a20` metryka mówiła „bez ruchu”; poprawka: ostatnia klatka pomiaru przed zdarzeniem.

### 11.5 Keepery `[measured]`

- **NEW `combat_view_scope_smoke`** (C1 29 asercji; C4 rozszerza do 47): reguła `isEngagementInView` (tabela), zgodność
  z `DeepSpaceCombatSystem.engagementView` (prawdziwa metoda), `watchBattleAction`, ładunek salwy z układem (prawdziwy
  DSCS), przycisk panelu walki (prawdziwy `CombatHUD`), piny czterech wejść; C4 — `isPlayerEngagement` (prawdziwe starcie),
  reguła widoczności, PRAWDZIWE starcie przy `rumor`: każda smuga rundy 1 rysowana (kontrola: reguła sprzed kroku — 0),
  piny renderera i `snapDist`. Fail-first: C1 8 / 21, C4 (na C3) 34 / 13.
- **NEW `combat_watch_frame_smoke`** (C2, 42): matematyka kadru NIEZALEŻNYM rzutem (macierze 4 × 4 `lookAt` +
  perspektywa), minimalność dystansu, centrowanie (także para wzdłuż osi widzenia), granice, wysoki panel nad środkiem
  ekranu, prostokąt bezpieczny, limit billboardu, `getPanelRect`, limit efektów przy „Watch” (T12), piny źródłowe
  (śledzenie, start bez sprite'ów, pętla efektów). Fail-first (na C1): 1 / 41. Mutacje poprawek po pomiarze: renderer
  sprzed poprawki śledzenia — 34 / 2 (T11c2, T11c3); bez zmiany renderera dla efektów — 40 / 2 (T12d, T12e); bez
  `watchFxScale` — 38 / 4 (T12-0…c).
- **NEW `combat_marker_life_smoke`** (C3, 18): plan znaczników (tabela), PRAWDZIWE starcie DSCS z rundami bez strzału
  i pauzą 10 s — znacznik w każdej klatce aktywnego starcia, brak po rozstrzygnięciu (kontrola: reguła sprzed kroku gubi
  znacznik), piny. Fail-first (na C2): 3 / 15.
- **Przecelowań istniejących keeperów: BRAK.** Ograniczenia z §10.9 zielone (`combat_pace_smoke` T9a — DSCS bez zegara
  realnego; `sb1_fleet_tuning_smoke` T11b — bez nowego czytelnika tabeli; `battle_result_classification` T2 — bez nowego
  emitenta `vessel:engaged`; `patrol_render_sync` — bez drugiej subskrypcji `vessel:positionUpdate`).
- ⚠ Budowa weryfikacyjna łańcucha (`results/chain_verify/`) dała na C2 311/312: `g3_regrowth_smoke` zabity sygnałem
  SIGTERM (limit `run-all` 120 s na keeper przy czterech równoległych przeglądarkach headless); osobno 64 / 0 w 65 s,
  powtórka sweepu C2 bez obciążenia — 312/312, 0 FAIL (`results/chain_verify/sweep_C2_rerun.txt`).

### 11.6 Bramka w przeglądarce — `gate/GATE_P2A.md`

Gra po angielsku; **4 kroki konsoli + 2 kroki czasu** (scena A w układzie domowym — 2 strażniki emp_001 przeniesione na
orbitę przez `vessel:positionUpdate` jak w `undockToOrbit`, 2 fregaty gracza z laserem, `engage`; scena B w układzie
stolicy emp_001 przy widoku domowym). Walidator (`gate/validate_gate_p2a.mjs`): prawdziwa gra na fixture GATE-S4,
headless, klatki 16 ms na zegarze wirtualnym, rozgrzewka pętli renderu przed krokami, rejestrator po każdej klatce
renderu (792 / 792 wywołań w T1). Wyniki dosłownie: `results/gate/validate_gate_p2a_{staged,control_9de9a20}.{txt,json}`.

| własność | kod P2a (C4) | kontrola `9de9a20` |
|---|---|---|
| A — kamera na walce od pierwszej klatki | dolot 0 klatek, cel = punkt starcia, 6 j. | 87 klatek dolotu |
| A — salwa rundy 1 (`rumor`) | 4 smugi, 1 błysk (4 strzały) | 0 / 0 |
| A — krycie wroga | 1 | 0,5 |
| A — znacznik (także pauza 5 s) | 0 klatek bez (z 790), pauza 0 z 313 | 314 bez (jedna luka 314 klatek), pauza 264 z 313 |
| A — „Watch”: wszyscy w kadrze · model (mediana) | 100 % · 19,2 px | 4,3 % · 21,7 px (kamera w środku walki) |
| A — „Watch”: szewron / celownik / efekt max | 36 / 44 / 46,3 px | 106 218 / 2492 / 2203 px |
| A — „Watch”: pierścień | 0 klatek | 373 klatki |
| B — widok domowy przy starciu w `sys_059` | 0 smug, 0 błysków, 0 znaczników; kamera stoi (450 j.) | 3 smugi, 3 błyski, znacznik przez 109 klatek; kamera → pusty punkt, 6 j. |
| B — „Watch” | widok `sys_059`, wszyscy w kadrze 100 %, szewron 36, celownik 44, efekt 31,2 px, pierścień 0 | widok zostaje `sys_home` |
| wynik walki | A: 20 rund · A · 0/1; B: 6 rund · B · 1/0 | to samo |

0 wyjątków i błędów konsoli poza 404, 0 zdarzeń utraty kontekstu WebGL w obu przebiegach. Dokument: `gate/GATE_P2A.md`
(kroki z jednego źródła `gate/gate_steps_p2a.mjs`, oczekiwane + kontrola przy każdym kroku, tabela własności).

### 11.7 Pytania do właściciela (tylko te, które zmieniają implementację)

1. **Q1 — efekty walki przy „Watch”** (rozszerzenie CP14): (a) limit przy „Watch” jak w zestagowanym C2 — efekt nie
   większy niż w kadrze auto-fokusu (rekomendacja); (b) limit także poza „Watch”, przy każdym bliskim kadrze (466);
   (c) bez limitu — wycofać (z bliska pierścień osłony zakrywa pół ekranu).
2. **Q2 — 465:** przy dwóch równoczesnych starciach „Watch” bierze pierwsze z listy panelu — (a) przycisk „Watch” przy
   każdym wierszu panelu (P2b); (b) bez zmian.
3. **Q3 — nazwa układu w wierszu panelu walki** (propozycja P2-1 audytu, poza poleceniem C1): P2b-1 razem z 464 / 450
   / 163?

→ **Odpowiedzi właściciela 2026-10-18:** Q1 → **CP21** (limit tylko przy „Watch”; 466 → backlog) · Q2 → **CP22**
(„Watch” przy każdym wierszu — P2b) · Q3 → **CP23** (nazwa układu w wierszu — P2b); zakres P2b i backlog — **CP24** (§5).

### 11.8 Czego nie zweryfikowano

- Bramka w przeglądarce właściciela (prawdziwe FPS, karta w tle) — przed commitem.
- Inne rozdzielczości i skale UI (sonda 1600 × 900, skala z gry).
- Starcia większe niż 3 na 2 i pojedynek na zasięg rakiet o dużej rozpiętości (kadr dalej — CP15: modele 4–5 px).
- Dwa równoczesne starcia (465) — niezmierzone.
- Kółko myszy w trakcie „Watch” (koniec dopasowania dystansu) i przejęcie kamery przez inny fokus / reset H — piny
  źródłowe (`combat_watch_frame_smoke` T11c), bez przebiegu w sondzie.
- Zapis i wczytanie w trakcie „Watch” — stan obserwacji nie jest zapisywany (po wczytaniu brak obserwacji); niezmierzone.
- Limit efektów walki poza „Watch” (466) — świadomie poza zakresem (Q1).
- Pierwszy przebieg stanu pośredniego (śledzenie, bez limitu efektów) usunięty przy restarcie kolejki sond — zmierzony
  ponownie na migawce `9d0d9b5` (`results/V_en_nofxcap/`); liczby zgodne z odczytem z sesji.

### 11.9 Bramka u właściciela — 2026-10-18: PASS na własnościach `[measured: odczyt właściciela]`

Przeglądarka właściciela, fixture GATE-S4 (kopia), gra po angielsku, kroki `gate/GATE_P2A.md` na zestagowanym kodzie P2a
(drzewo C4). Odczyty — dosłownie z raportu właściciela; pola, których nie przekazał, zapisane jako nieprzekazane.

| krok | odczyt |
|---|---|
| 1 — scena A | rok 60,1372 · `sys_home` · strażnicy `v_30` / `v_31`, fregaty `v_32` / `v_33` · rozkazy ok, ok · 0,32 AU · wywiad strażnika `unknown` · klucz 400 |
| T1 — czas | słowa właściciela: „kamera skoczyła od razu na walkę; smugi i błysk pierwszej salwy widoczne; czerwony pierścień stał cały czas, ALE w dziwnym miejscu, z dala od statków; auto-fokus przybliżył na pierścień, nie na statki; Watch przybliżył tak, że statki były widoczne — w miarę OK” |
| 2 — odczyt A | salwa rundy 1 „4 smug, 2 błysków (4 strzałów)” · krycie wroga (min) 1 · klatki starcia w widoku 2629, bez znacznika 0 · klatki pauzy 2267 (długa pauza), bez znacznika 0 · dolot auto-fokusu 0 klatek · „Watch”: 915 klatek, wszyscy w kadrze 93,4 %, model min 3 / mediana 14,3 px, szewron max 36 px (pozostałe pola — nieprzekazane) · wynik 16 rund · zwycięzca B · straty 2/0 |
| zrzut | panel walki: tekst wychodzi poza kartę — nazwa imperium ucięta („Liga Trzech Słońc (…”), log walki obcięty → **468** |
| 3 — scena B | utworzona: `sys_059`, `v_34` / `v_35`, rozkaz ok |
| T2 — czas | starcie nieoglądane (110 ms na rundę — CP4; 11 rund) skończyło się, zanim właściciel zdążył zapauzować i kliknąć „Watch”; widok domowy został, kamera oddaliła się wyłącznie przy resecie kadru (krok 3) |
| 4 — odczyt B | smugi / błyski w innym układzie 0 / 0 · znaczniki przy widoku innego układu 0 · klatki starcia w widoku 0 · „Watch” — nie kliknięto · widok `sys_home` · wynik 11 rund · zwycięzca B · straty 1/0 |
| konsola | bez błędów (raport właściciela) |

Własności (tabela `GATE_P2A.md`): **1** start bez dolotu — PASS (0 klatek; oko) · **2** salwa rundy 1 — PASS (4 / 2;
oko) · **3** model wroga pełny — PASS (krycie 1) · **4** znacznik przez całe starcie i w pauzie — PASS (0 z 2629, pauza
0 z 2267); pozycja — **467** · **5** „Watch”: wszyscy w kadrze — 93,4 % wobec 100 % walidatora, oko „w miarę OK” · **6**
szewron 36 px — PASS; celownik i efekt — nieprzekazane · **7** pierścień przy „Watch” — nieprzekazane · **8** starcie
w innym układzie: widok domowy czysty, kamera stoi — PASS · **9** „Watch” przenosi do układu starcia — niećwiczone u
właściciela (T2), przyjęte na walidatorze i keeperze · **10** wynik walki — inny niż w walidatorze (rok utworzenia sceny
60,1372 wobec 60,1156 — inne ziarno; przewidziane w uwagach bramki). Werdykt właściciela: **PASS na własnościach**.
Z bramki dwa NOWE findingi: **467** (znacznik i cel auto-fokusu w punkcie startu starcia) i **468** (panel walki —
tekst poza kartą).

### 11.10 Zamknięcia — 2026-10-18 (`e866bd6` · `51f8e81` · `dc533cf` · `9e752cc`; bramka §11.9 PASS)

✅ **453** (`e866bd6`, P2a-1, CP7) · ✅ **458** (`51f8e81`, P2a-2, CP13, CP14, CP21) · ✅ **457** (`dc533cf`, P2a-3) ·
✅ **455** · **459** · **462** (`9e752cc`, P2a-4, CP17) — wpisy w §6. Przecelowań istniejących keeperów: brak. Decyzje
po bramce: CP21–CP24 (§5); następny krok — **P2b** (§7), ostatnia sesja kodu tematu widoczności starcia.

## 12. P2b — kod (2026-10-18): ZACOMMITOWANY 2026-10-18 — `5504e2e` · `9f03381` · `96690d0` · `f9d4efa` · `72509d4` (ostatnia sesja kodu widoczności starcia, CP24)

> Łańcuch P2b-1 … P2b-5 zbudowany w świeżym klonie na commicie dokumentacji P2b (ten commit) i ZESTAGOWANY w repo
> właściciela (`tools/apply_to_repo_P2B.sh`, EOL właściciela — `ThreeRenderer.js` CRLF, reszta LF). Commity dopiero po
> bramce w przeglądarce (`gate/GATE_P2B.md`) — `tools/commit_P2B.sh` (bez argumentów; przecelowań istniejących keeperów
> brak). Folder: `kosmos-handover/polish-p2b-code/` (SHA256SUMS). Save v101 bez migracji; bez nowych kluczy słownika.

### 12.1 Łańcuch `[git]` `[measured]`

| krok | treść | keeper kroku: fail-first (wersja kroku na drzewie poprzedniego) → na kroku | sweep · `check-i18n` |
|---|---|---|---|
| baza | `534f45c` | — | 313/313 · PASS, pl = en 3458 |
| **C1** P2b-1 | 467 — znacznik w środku uczestników, auto-fokus śledzi walkę (uczestnicy nad kartą — Q1) | NEW `combat_follow_centre_smoke` **5 / 22 → 27 / 0** | **314/314** · PASS 3458 |
| **C2** P2b-2 | 451 — paski HP obu stron aktywnego starcia (CP16), biały błysk 200 ms (CP18) | NEW `combat_hp_bar_smoke` **1 / 27 → 28 / 0** | **315/315** · PASS 3458 |
| **C3** P2b-3 | A7, 461 — tempo efektów z `combatRoundMs()`, płynne zbliżenie | NEW `combat_fx_pace_smoke` **5 / 22 → 27 / 0** | **316/316** · PASS 3458 |
| **C4** P2b-4 | 468, 465 — tekst w karcie, podpowiedź, „Watch” przy każdym wierszu (CP22), nazwa układu (CP23), karta ≤ 45 % (Q2) | NEW `combat_card_fit_smoke` **5 / 17 → 22 / 0** | **317/317** · PASS 3458 |
| **C5** P2b-5 | 450 — `turns` w rekordzie bitwy DSCS | NEW `combat_turns_smoke` **4 / 5 → 9 / 0** | **318/318** · PASS 3458 |

**Commity (2026-10-18, `tools/commit_P2B.sh` bez argumentów, po bramce §12.9):** C1 `5504e2e` · C2 `9f03381` · C3
`96690d0` · C4 `f9d4efa` · C5 `72509d4` — drzewa kroków = `patches/trees.txt` (C1 `9c6778e4` · C2 `4507ee81` · C3
`fa0a5e27` · C4 `d2f0a5ff` · C5 `7b26741f`); na `72509d4` sweep **318/318, 0 FAIL** (31 advisory), `check-i18n` PASS
pl = en 3458 `[measured]` (§13.1).

Łańcuch zbudowany w świeżym klonie (`tools/build_chain_P2B.sh`; w klonie `gc.auto 0`, `maintenance.auto false` przed
pierwszym commitem — lekcja P2a): fail-first keepera kroku (jego wersja z tego kroku) na drzewie POPRZEDNIEGO kroku,
łatka, commit, keeper, pełny sweep + `check-i18n`; budowa weryfikacyjna na `534f45c` (`results/chain_verify/`) i ostateczna
na tym commicie (`results/chain_final/`, `patches/trees.txt`) — te same liczby. Treść łańcucha = klon roboczy blob w blob.
**Przecelowań istniejących keeperów: BRAK** (sweep po każdym kroku 0 FAIL, 31 advisory jak na bazie). Save v101 bez
migracji; bez nowych kluczy słownika; bez nowego klucza tabeli strojenia (`sb1_fleet_tuning_smoke`).

### 12.2 Mechanizm `[code]`

- **D1 — znacznik i auto-fokus przy statkach (467, C1).** Środek uczestników = `centroid` kadru „Obserwuj”
  (`_computeWatchFit` — sprite'y żywych, widocznych uczestników; wróg ukryty mgłą nie wchodzi), pamiętany na jedną klatkę
  pętli renderu (`_engagementFit`). Znacznik starcia DSCS — co klatkę w tym środku (bez sprite'ów — punkt startu, jak
  dotąd). Auto-fokus — start natychmiast (P2a-4, bez zmian), potem stan `_autoFocus` i krok co klatkę
  (`_updateAutoFocusCamera`, po „Obserwuj”, przed `update()` kontrolera; koniec przy „Obserwuj”, końcu starcia, wyjściu z
  widoku albo przejęciu kamery — `autoFocusFollowStep`): cel = `watchTargetAt` przy BIEŻĄCYM dystansie — prostokąt rzutu
  uczestników wyśrodkowany w prostokącie bezpiecznym kadru „Obserwuj” (ekran bez pasków UI i panelu walki), szybkie
  śledzenie `focusOnSmooth`, bez dopasowania dystansu (dystans ustawia start, potem kółko gracza). ⚠ To nie jest dosłowne
  „cel auto-fokusu = środek uczestników” z polecenia — pomiar przed zestagowaniem (§12.4) — pytanie **Q1** (§12.7).
- **D2 — paski HP i biały błysk (451, CP16, CP18; C2).** `planCombatHpBars` — uczestnicy AKTYWNEGO starcia DSCS
  w oglądanym układzie, obie strony; poległy w trakcie — pasek pusty; koniec starcia — brak pasków. `_syncCombatHpBars` co
  klatkę: tło + wypełnienie w barwie właściciela (gracz — zielony, imperium — jego barwa), stały rozmiar EKRANOWY 40 × 5 px
  z ramką 1 px (42 × 7 px), 6 px pod modelem, billboard w scenie 3D (ten sam kadr co modele; chowany w „czystym widoku”).
  Biały błysk: addytywny billboard na trafionym statku w chwili uderzenia (razem z błyskiem trafienia), 200 ms, rozmiar
  model × 1,6 z podłogą 12 px na ekranie, idzie za sprite'em.
- **D3 — tempo efektów i płynne zbliżenie (A7, 461; C3).** `combatFxPace(combatRoundMs())` (CP2 — tempo z `TimeSystem`,
  renderer bez tabeli strojenia): smuga, błysk i pierścień tarczy — max(dawna stała, 1,2 · R), opóźnienie błysku —
  max(150, 0,375 · R), rozstaw salwy — max(40, R / 10) ms; przy 110 ms dokładnie dawne stałe (bitwa orbitalna, starcie
  nieoglądane), przy 400 ms smuga i błysk 480 ms (salwa trzyma się do następnej rundy; starsza już gaśnie). Końce smugi,
  błysk i pierścień tarczy idą za sprite'ami.
  Płynne zbliżenie: sprite uczestnika aktywnego starcia w oglądanym układzie (statek w wolnej przestrzeni) płynie do
  pozycji logicznej przez jedną rundę czasu realnego (`_placeFreeVessel` + `_tickCombatGlide`: krok z zegara realnego klatki,
  ≤ 100 ms; w pauzie gry ruch stoi; ruch rozpoczęty w starciu dobiega do końca). Logika walki nietknięta — renderer czyta
  pozycję logiczną; w systemie walki brak czasu realnego (`combat_pace` bez zmian, `combat_turns` T5c).
- **D4 — karta walki (468, 465, CP22, CP23; C4).** Przycinanie po SZEROKOŚCI tekstu (`measureText`) z wielokropkiem, pełny
  tekst w podpowiedzi (`UIManager.handleMouseMove` → karta); log — N ostatnich linii (6 → 2), potem statki w jednej linii,
  gdy karta nie mieści się między paskami ALBO przekracza 45 % wysokości ekranu (`CARD_MAX_H_FRAC` — §12.4, pytanie
  **Q2**); wiersz tytułu każdego starcia: nazwa układu (CP23, `systemDisplayName`) · runda i dystans · „👁 Watch” (CP22 —
  przy KAŻDYM wierszu; `_watchBtnBounds` = przycisk pierwszego wiersza, zgodność wstecz).
- **D5 — „Tur: N” (450; C5).** Rekord bitwy DSCS (`_finalizeBattle`) dostaje `turns: encounter.currentRound` — jedno pole
  czytane przez okno wyniku (`BattleIntroModal`), Dziennik (`log.battleLine`) i listę bitew wojny (`WarSystem.recordBattle`
  → `WarOverlay`); stare rekordy bez pola — `?? 0`. Napis „Tur:” zostaje po polsku (**163** — backlog, CP24).

### 12.3 Dowód — sonda w prawdziwej grze `[measured]`

Sonda P2b (`probes/run_p2b.mjs`, `p2b_page.mjs`, `analyze_p2b.mjs`, `proof_table_p2b.mjs`) — kopia sondy P2a: prawdziwa
gra na fixture GATE-S4 w izolowanym headless Chrome (1600 × 900), zegar wirtualny, ziarnisty `Math.random` gry, UUID
Three.js i renderer na osobnym strumieniu, klatka sondy 16 ms = jedna klatka renderu. Nowe metryki co klatkę: środek
uczestników (świat, ekran), pierścień od środka, cel kamery od środka, kadr nad kartą (prostokąt bezpieczny), paski HP
(widoczne, rozmiar px, ułamek), żywe efekty, pozycje sprite'ów (skoki px w głębi statku); audyt karty (`fillText`
w `CombatHUD.draw`); „Watch” w wybranym wierszu. Sceny: **W** (1 na 1, układ stolicy emp_001, „Watch” w rundzie 3,
pauza 5 s), **X** (1 na 1 w INNYM układzie), **V** (3 na 2, układ domowy, „Watch” w rundzie 2), **Y** (NOWA — dwa starcia
naraz w układzie domowym: 2 na 2 i 1 na 1 ~2,4 AU od siebie, „Watch” w DRUGIM wierszu). „Przed” = kod P2a (`534f45c`),
„po” = łańcuch P2b (eksport klonu roboczego; kod gry bajt w bajt = łańcuch ostateczny — różnią się wyłącznie keepery).
⚠ **Podkładka pauzy w sondzie** (punkt 5 nagłówka `p2b_page.mjs`; zmierzone na pierwszym przebiegu): sonda trzyma
`TimeSystem.isPaused = true` poza własnym `update`, więc renderer w klatce renderu widział PAUZĘ także w klatkach biegu
gry — płynne zbliżenie stało (sprite'y w miejscu startu starcia przez całe starcie, pozycje logiczne szły o ~0,25 AU).
W grze w klatkach biegu `isPaused` = false; podkładka ustawia to WYŁĄCZNIE na czas `_tickCombatGlide` w klatce biegu
(jedyny czytelnik w rendererze). Ta sama podkładka w walidatorze bramki — nie w krokach właściciela.

Skrót (pełna tabela — `results/proof_p2b.md`; „przed” → „po”; wariant A auto-fokusu — §12.4):

| metryka | W (1 na 1) | X (inny układ) | V (3 na 2) | Y (dwa starcia) |
|---|---|---|---|---|
| sygnatura walki (rundy · zwycięzca · straty) | 16 · B · 1/0 = | 16 · B · 1/0 = | 15 · A · 0/1 (+1 r) = | 11 · B · 2/0 ‖ 16 · B · 1/0 = |
| błędy konsoli / losowania poza klatką | 0 / 0 → 0 / 0 | 0 / 0 → 0 / 0 | 0 / 0 → 0 / 0 | 0 / 0 → 0 / 0 |
| D1 środek grupy od środka pasa nad kartą — auto-fokus [px, mediana] | 133 → **0,8** | — (kamera stoi) | 194 → **0,6** | 216 → **0,9** |
| D1 auto-fokus: wszyscy w oknie i nie pod kartą [% klatek] | 100 → 100 | — | 100 → 100 (A: **0**) | 100 → 100 (A: **34,4**) |
| D1 pierścień od środka statków [AU max] | 0,115 → **0** | 0,115 → **0** | 0,137 → **0** | 0,158 → **0** |
| D2 każdy żywy uczestnik na ekranie z paskiem HP [% klatek] | 0 → **100** | 0 → **100** | 0 → **100** | 0 → **100** |
| D2 trafienia narysowane / białe błyski | 7 / 0 → 7 / **7** | 5 / 0 → 5 / **5** | 24 / 0 → 24 / **24** | 26 / 0 → 26 / **26** |
| D3 smuga / błysk [ms] | 260 / 460 → 480 / 480 | = | = | = |
| D3 klatki z widoczną smugą [%] | 24,5 → **41,4** | 28,1 → **48** | 46,6 → **67,6** | 56,3 → **80,8** |
| D3 luki między salwami KOLEJNYCH rund (dodatnie) | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| D3 największy skok modelu na klatkę [px]: bez „Watch” / przy „Watch” | 46,8 / 691 → **2,7 / 53,8** | — / 669 → — / **52,4** | 80,4 / 473 → **4 / 32** | 86 / — → **4,4 / 34,1** |
| D3 największy skok w jednej klatce jako część drogi statku [%] | 11,2 → **0,7** | 16,9 → **1** | 21,3 → **1,3** | 21,7 → **2,5** |
| D4 napisy poza kartą · skrócone | 0 · 1 → 0 · 0 | — | 0 · 1 → 0 · 0 | 0 · 2 → 0 · 0 |
| D4 wiersze z nazwą układu · przyciski „Watch” | 0 · 1 → 1 · 1 | — | 0 · 1 → 1 · 1 | 0 · 1 → **2 · 2** |
| D4 wysokość karty [% z 720 j.] | 28,5 → 31,0 | — | 35,1 → 37,6 | 56,0 → **42,6** (A bez limitu: 61,0) |
| D4 „Watch” w drugim wierszu → wszyscy w kadrze [%] | — | — | — | brak przycisku → **100** |
| D5 okno wyniku „Tur: N” / rundy | 0 / 16 → **16** / 16 | 0 / 16 → **16** / 16 | 0 / 15 → **15** / 15 | 0 / 11 → **11** / 11 |

⚠ **Odczyt bez upiększeń:** (1) przy DOTYCHCZASOWYM auto-fokusie (punkt startu na środku ekranu) uczestnicy w tych scenach
też stali nad kartą — zmiana D1 to cel NA statkach (środek grupy w środku pasa nad kartą, pierścień w środku walki), nie
„wyciągnięcie spod karty”; dosłowne „środek uczestników na środku ekranu” (wariant A) chowało ich pod kartą (V, Y).
(2) Dziur między salwami KOLEJNYCH rund nie było także przed — błysk trafienia (150 + 460 ms) zakrywał przerwę; zysk D3
widać w smugach (każda trzyma się do następnej rundy) i w pudłach bez błysku (keeper D3 T2: dawne stałe — dziura w rundzie
samych pudeł). Przerwy z kadencji broni zostają. (3) Skok przy „Watch” 52–54 px na klatkę to ruch ciągły przy bliskim
kadrze (krok zbliżenia rozłożony na rundę — 0,7–2,5 % drogi na klatkę), nie skok.

**Sygnatury walki = P1** `[measured]` (sonda P1 `run_p1c.mjs`, scena n, klucz 400 ms, starcie oglądane, na kodzie P2b):
`[[16,12,7,1,0,"B",null],[6,4,4,1,0,"B",null],[11,7,6,1,0,"B",null]]` + wraki `v_24 … v_34` — **= P1** (błąd sondy brak,
wyjątki konsoli 0, losowania poza klatką 0; `results/p1_signature/summary.txt`). W sondzie P2b — sygnatury przed = po we
wszystkich czterech scenach (tabela wyżej).

### 12.4 Zmiany po pomiarze — przed zestagowaniem `[measured]`

1. **D1 — cel auto-fokusu: wariant A („środek uczestników”) odrzucony, wariant B („uczestnicy wyśrodkowani nad kartą”).**
   Pierwsza wersja (cel = środek uczestników na środku ekranu — dosłownie z polecenia) stawiała część uczestników POD
   kartą walki: V (karta ta sama w obu wariantach) — wszyscy żywi w oknie i nie pod kartą w **0 %** klatek auto-fokusu
   (od 10. klatki; 21 z 21 klatek ze strażnikiem pod kartą — oba strażniki); Y (wariant A z kartą bez limitu, pkt 2) —
   **34,4 %** (40 z 61). Wariant B (ta sama reguła co „Obserwuj” — `watchTargetAt` przy bieżącym dystansie): V i Y —
   **100 %**, 0 klatek pod kartą; środek grupy od środka pasa nad kartą ≤ 1,6 px. Keeper D1 T6 odtwarza zmierzony kadr V (rzut ±2 px od sondy): dawna reguła — strażnicy pod kartą, nowa — nikt.
   Pytanie **Q1**.
2. **D4 — karta najwyżej 45 % wysokości ekranu.** Przy dwóch starciach pełny log dawał kartę **438 z 720 j. (61 %)** —
   statki obu walk pod kartą, a pas nad nią ~130 px (prostokąt bezpieczny kadru na granicy zapasowego „cały ekran”).
   Z limitem: **307 j. (42,6 %)**, log 2 linie na starcie, statki w jednej linii; Y — „Watch” w drugim wierszu: wszyscy
   w kadrze 100 % (wariant A z kartą 61 %: 75,9 %, 92 klatki pod kartą). Pytanie **Q2**.
3. **Etykiety pinów (fail-first).** Keeper D1 przerywał się na kodzie sprzed kroku (T6: `centroidOf` nie istnieje) —
   kontrole liczą średnią lokalnie, T6 to wyprowadzenie (KONTROLA); keeper D2 T3b przechodził JAŁOWO (pusta lista pasków)
   — liczy porównania; keeper D4 T2a / T2b / T8b — prawdziwe także przed krokiem → NIEZMIENNIK, nie SEDNO.

### 12.5 Keepery `[measured]`

| keeper | krok | asercje | fail-first (wersja kroku na drzewie poprzedniego) | zielone po obu stronach |
|---|---|---|---|---|
| NEW `combat_follow_centre_smoke` | C1 | 27 | **5 / 22** | T4-0, T4-1, T5-0 (kontrole), T6-0, T6 (wyprowadzenie) |
| NEW `combat_hp_bar_smoke` | C2 | 28 | **1 / 27** | T3-0 (kontrola) |
| NEW `combat_fx_pace_smoke` | C3 | 27 | **5 / 22** | T2-0, T2-1, T4-1 (kontrole), T1e, T5h (niezmienniki) |
| NEW `combat_card_fit_smoke` | C4 | 22 | **5 / 17** | T1-0, T4-0 (kontrole), T2a, T2b, T8b (niezmienniki) |
| NEW `combat_turns_smoke` | C5 | 9 | **4 / 5** | T1-0, T4-0 (kontrole), T5a, T5b (niezmienniki — czytelnicy bez zmian) |

Na C5 bez zmian (przecelowań istniejących keeperów BRAK): `combat_view_scope` 47 / 0 · `combat_watch_frame` 42 / 0 ·
`combat_marker_life` 18 / 0 · `combat_pace` 71 / 0 · `sb3_combat_closing` 28 / 0 (zamknięcie starcia nietknięte) ·
`sb2b_pulse_scope` 10 / 0 · `map_vessel_panel` 120 / 120 · `patrol_render_sync` 42 / 0 · `sb1_fleet_tuning` 71 / 0
(bez nowego klucza tabeli strojenia). Keepery czytają źródło po normalizacji EOL (ThreeRenderer CRLF u właściciela).

### 12.6 Bramka w przeglądarce — `gate/GATE_P2B.md`

Scenariusz dla właściciela (gra po ANGIELSKU; 4 kroki konsoli + 2 kroki czasu, fixture GATE-S4): **krok 1** rejestrator
bramki (`window.__gp2b` — liczy wyłącznie to, co narysował renderer) + scena A — 2 fregaty obrony układu emp_001 i 2 fregaty
gracza z laserem 0,32 AU od nich w układzie domowym; **T1** spacja — start starcia, kamera i pierścień przy statkach, paski HP
i biały błysk, rytm salw, płynne zbliżenie, karta, „Watch” po kilku salwach, okno wyniku; **krok 2** odczyt; **krok 3**
scena B — DWA starcia naraz w układzie domowym (dwie pary 1 na 1 ~5,7 AU od siebie); **T2** spacja — gdy karta pokaże dwa
wiersze: pauza, nazwa układu i „Watch” w każdym wierszu, „Watch” w DRUGIM wierszu, do końca obu walk; **krok 4** odczyt.
Jedno źródło kroków `gate/gate_steps_p2b.mjs`; każdy krok wykonany walidatorem (`gate/validate_gate_p2b.mjs`, prawdziwa gra,
zegar wirtualny, rozgrzewka pętli renderu jak w P2a) na kodzie P2b i na kontroli `534f45c` (`results/gate/`):

| własność | kod P2b | kontrola `534f45c` |
|---|---|---|
| A — środek grupy od środka pasa nad kartą (auto-fokus) | 1 px (wszyscy nad kartą 100 %) | 250,1 px (100 %) |
| A — pierścień od środka statków (max) | 0 px | 553,4 px |
| A / B — paski HP (każdy żywy uczestnik na ekranie) | 100 % / 100 %, 42 × 7 px | 0 / 0 |
| A / B — białe błyski = trafienia narysowane | 20 = 20 / 10 = 10 | 0 / 0 |
| A / B — klatki z widoczną smugą | 70,6 / 45,7 % | 48 / 28,3 % |
| A / B — największy skok w jednej klatce jako część drogi | 1,6 / 1,3 % (A przed „Watch” 4,4 px) | 27,3 / 21,8 % (A 92 px) |
| A — karta: poza kartą · skrócone · wiersze z układem · „Watch” | 0 · 0 · 1 · 1 (34,4 % ekranu) | 0 · 1 · 0 · 1 (31,9 %) |
| B — karta: wiersze z układem · „Watch” · wysokość | 2 · 2 · 44,4 % | 0 · 1 · 52,8 % (skrócone 2) |
| B — „Watch” w drugim wierszu | drugie starcie, wszyscy w kadrze 97,6 % | brak przycisku |
| A / B — okno wyniku | „Tur: 20” / „Tur: 6”, „Tur: 6” | „Tur: 0” / „Tur: 0”, „Tur: 0” |
| wynik walki | A 20 r · A · 0/1; B 6 r · B · 1/0 (×2) | to samo |

0 wyjątków i błędów konsoli poza 404, 0 zdarzeń utraty kontekstu WebGL w obu przebiegach. ⚠ Walidator — ta sama podkładka
pauzy co sonda (wyłącznie na czas `_tickCombatGlide`, w klatkach biegu gry; kroki właściciela jej nie zawierają). ⚠ Starcie
nieoglądane (inny układ) trwa ~1 s (lekcja P2A) — scena B ma oba starcia w układzie domowym; „Watch” w wierszu starcia
z innego układu — keeper D4 T5 (§12.8).

### 12.7 Pytania do właściciela (tylko te, które zmieniają implementację)

1. **Q1 — cel auto-fokusu (D1).** Polecenie: „auto-focus target = centroid”. W kodzie: uczestnicy wyśrodkowani w pasie NAD
   kartą walki przy bieżącym dystansie (ta sama reguła co „Watch”); znacznik — dokładnie w środku uczestników. Powód —
   §12.4 (1). Zostaje / dosłownie „środek na środku ekranu” (część statków pod kartą)?
2. **Q2 — karta ≤ 45 % wysokości ekranu (D4).** Przy dwóch starciach log skraca się do 2 linii, a statki idą w jednej
   linii, żeby nad kartą został pas dla statków. Zostaje / inna granica / bez limitu?

→ **Odpowiedzi właściciela 2026-10-18 (po bramce):** Q1 → **CP25** (zostaje) · Q2 → **CP26** (zostaje) — §5.

### 12.8 Czego nie zweryfikowano

Bramka u właściciela (prawdziwe FPS, karta w tle, przeglądarka bez ziarna) · podpowiedź pełnego tekstu w prawdziwej grze
(w scenach sondy żaden napis karty nie był skrócony — wyłącznie keeper D4 T3) · „Watch” w wierszu starcia z INNEGO układu
(keeper D4 T5 + reguła P2a-1; scena Y — oba starcia w układzie domowym) · starcia większe niż 3 na 2, bardzo długie nazwy
(keeper), inne rozdzielczości i skale UI · zmiana prędkości gry w trakcie płynnego zbliżenia; zapis i wczytanie w trakcie
starcia (stan płynnego zbliżenia nie jest zapisywany — wyłącznie rysowanie) · luki salw z kadencji broni (przeładowanie
rakiet co 5 rund — rundy bez strzału nie mają czego rysować; czasy życia ich nie wypełnią) · przeskok auto-fokusu do
każdego nowego starcia (**469** — zachowanie sprzed P2b, zapisane).

### 12.9 Bramka u właściciela — 2026-10-18: PASS (scena A; scena B — karta i „Tur: N”) `[measured, Filip]`

Przeglądarka właściciela, fixture GATE-S4 (kopia), gra po ANGIELSKU, kroki `gate/GATE_P2B.md` na zestagowanym kodzie
P2b (drzewo C5); kontrola `534f45c` — w walidatorze (§12.6). **Każda liczba w tabeli to ODCZYT WŁAŚCICIELA** z konsoli
jego przeglądarki `[measured, Filip]` — dosłownie z raportu; pola, których nie przekazał, zapisane jako nieprzekazane.

| krok | odczyt właściciela |
|---|---|
| 1 — scena A | rozkazy ok, ok · klucz 400 · 0,32 AU · pauza true |
| T1 — czas | słowa właściciela: „wszystko gra i pasuje, poza wielkością pierścienia — za duży i zbyt mocny, powinien być tylko subtelny i wąski, aby nie zasłaniał modeli; pierścień pulsuje w dużym zoomie, to psuje imersję” → **C6** (CP27, §13) |
| 2 — odczyt A | starcie „w widoku” · auto-fokus: wszyscy nad kartą **99,4 %** (2000 klatek), środek grupy od środka pasa **0 px** · pierścień od środka statków (max) **0 px** · paski HP **96 %**, **42 × 7 px** · trafienia narysowane **16**, białe błyski **16** · rytm salw **63,2 %** · smugi widoczne **56,5 %** · skok max przed „Watch” **11,5 px**, przy „Watch” **0 px** · największy skok w jednej klatce **1,6 %** drogi · „Watch”: pierwsze starcie, 1013 klatek, wszyscy w kadrze **100 %** · karta: poza kartą 0 · skrócone 0 · wiersze z układem 1 · „Watch” 1 · wiersze 1 (wysokość — nieprzekazana) · okno wyniku „Tur: 16” · bitwa „16 rund · B · 2/0” · wiersze zapisu 10 498 · wywołania rejestratora 11 391 |
| 3 — scena B | pary `v_35` → `v_34`, `v_37` → `v_36` · rozkazy ok, ok · 5,65 AU · pauza true |
| T2 — czas | słowa właściciela: „obie walki w DEEP-SPACE BATTLES pokazały się w tym samym domowym układzie, karty nic nie zasłaniają, wszystko wygląda OK, Watch też fokusuje kamerę na danej bitwie” |
| 4 — odczyt B | starcia „w widoku, w widoku” · auto-fokus **0 %** (436 klatek; środek grupy — n/d, **469**) · pierścień **0 px** · paski HP **72,5 %**, **42 × 7 px** · trafienia / białe błyski **22 / 22** · rytm salw **70,9 %** · smugi **61,5 %** · skok przed „Watch” **0 px**, przy „Watch” **660,5 px** · największy skok **87,9 %** drogi · „Watch”: starcie „pierwsze”, 1173 klatki, wszyscy w kadrze **45 %** · karta: poza kartą 0 · skrócone 0 · wiersze z układem 2 · „Watch” 2 · wiersze 2 (wysokość — nieprzekazana) · okna wyniku „Tur: 20 \| Tur: 20” · bitwy „20 rund · B · 0/0 \| 20 rund · B · 0/0” · wiersze zapisu 1619 · wywołania rejestratora 2486 |
| konsola | nieprzekazane |

Werdykt właściciela: **scena A — PASS; scena B — PASS na karcie (C4) i „Tur: N” (C5).** Odczyt własności (tabela
`GATE_P2B.md`, liczby właściciela obok walidatora §12.6):

- **A — D1:** wszyscy nad kartą 99,4 % (walidator 100), środek grupy w środku pasa 0 px (1), pierścień w środku statków
  0 px (0) — PASS. Oko: pierścień za duży, za mocny i pulsuje → **C6** (CP27).
- **A — D2:** paski 42 × 7 px; każdy żywy uczestnik na ekranie z paskiem w 96 % klatek (walidator 100 — różnica
  niezmierzona: prawdziwe FPS, inny przebieg walki — 16 rund wobec 20); białe błyski = trafienia narysowane 16 = 16 —
  PASS.
- **A — D3:** smugi 56,5 % klatek biegu (walidator 70,6; kontrola `534f45c` 48), rytm salw 63,2 % (79,5); największy
  skok 1,6 % drogi (= walidator), przy „Watch” 0 px — PASS.
- **A — D4 / D5:** tekst w karcie (0 poza kartą, 0 skróconych), wiersz z układem i „Watch”; „Tur: 16” = 16 rund —
  PASS.
- **B — D4 (C4):** dwa wiersze, każdy z nazwą układu i własnym „Watch”, nic poza kartą, nic skrócone, „karty nic nie
  zasłaniają” — PASS. **B — D5 (C5):** „Tur: 20” w obu oknach = rundy obu bitew — PASS.
- **B — auto-fokus 0 %** — zachowanie **469** (auto-fokus przechodzi na drugie starcie, rejestrator mierzy pierwsze z
  listy); poza zakresem P2b (backlog, CP24).
- **B — skok przy „Watch” 660,5 px / 87,9 % drogi i „Watch” 45 %** — nie odtworzone w walidatorze (wiersz 1 i wiersz 2:
  33,6 px / 1,3 % / 97,6 %); najbardziej prawdopodobny artefakt rejestratora przy przełączaniu obserwowanego starcia —
  NOWY **470** (audyt §6, CP28 — backlog). Paski 72,5 % w scenie B (walidator 100) — przyczyna niezmierzona.
- **Wynik walki** inny niż w walidatorze (A: 16 rund · B · 2/0 wobec 20 · A · 0/1; B: 20 rund · B · 0/0 ×2 wobec 6 · B ·
  1/0 ×2) — przewidziane (przeglądarka bez ziarna; inny rok utworzenia sceny).

Odpowiedzi na §12.7 i uwaga z bramki → **CP25–CP28** (§5, §13).

### 12.10 Zamknięcia — 2026-10-18 (`5504e2e` · `9f03381` · `96690d0` · `f9d4efa` · `72509d4`; bramka §12.9 PASS)

✅ **467** (`5504e2e`, P2b-1) · ✅ **451** (`9f03381`, P2b-2, CP16, CP18) · ✅ **461** (`96690d0`, P2b-3) ·
✅ **468** · **465** (`f9d4efa`, P2b-4, CP22, CP23) · ✅ **450** (`72509d4`, P2b-5) — wpisy w §6. Przecelowań istniejących
keeperów: brak. Poprawka z bramki — **C6** `2ff8d26` (pierścień starcia subtelny, CP27) — §13.

## 13. P2b CLOSE (2026-10-18): commity P2b, bramka P2B, poprawka C6 — temat widoczności starcia ZAMKNIĘTY (CP24)

Polecenie właściciela (2026-10-18): „commit staged P2b, record gate, C6 ring restyle, close the combat-visibility
topic” — (a) commity tego, co zestagowane; (b) JEDNA poprawka kosmetyczna z bramki (C6 — pierścień starcia); (c) zapis
bramki i zamknięcie tematu. Folder: `kosmos-handover/polish-p2b-close/` (SHA256SUMS). Save v101 bez migracji; bez
nowych kluczy słownika.

### 13.1 Commity P2b `[git]` `[measured]`

`tools/commit_P2B.sh` (bez argumentów) w repo właściciela: C1 `5504e2e` · C2 `9f03381` · C3 `96690d0` · C4 `f9d4efa` ·
C5 `72509d4` — drzewa kroków = `polish-p2b-code/patches/trees.txt` (`9c6778e4` · `4507ee81` · `fa0a5e27` · `d2f0a5ff` ·
`7b26741f`); po commitach status czysty (poza `.claude/settings.local.json`), sweep **318/318**, 0 FAIL (31 advisory),
`check-i18n` PASS pl = en 3458, keepery P2a i P2b (8) zielone. ⚠ Przy `git apply --cached` łatki C2 — jedno przejściowe
„Permission denied” przy zapisie obiektu `7b087a78…`; ponowienie w skrypcie (`g()`) przeszło; obiekt sprawdzony (rozmiar
i skrót treści), bloby 12 plików HEAD = bloby łańcucha, `git fsck --connectivity-only` czysty. Wypchnięcie `9de9a20..b1265f4`
(P2a i obie dokumentacje) — przed tą sesją, na polecenie właściciela; commity P2b i dalsze — lokalne (pushuje właściciel).

### 13.2 Bramka P2B — skrót `[measured, Filip]`

Pełny zapis — §12.9. **Scena A — PASS:** auto-fokus — wszyscy nad kartą 99,4 %, środek grupy w środku pasa 0 px;
pierścień w środku statków 0 px; paski HP 96 %, 42 × 7 px; białe błyski = trafienia 16 = 16; największy skok 1,6 % drogi;
„Watch” — wszyscy w kadrze 100 %; „Tur: 16”. **Scena B — PASS na karcie** (dwa wiersze z nazwą układu i „Watch”, nic
poza kartą, nic skrócone) **i „Tur: N”** („Tur: 20” ×2). Oko właściciela (T1): wszystko gra poza pierścieniem — za duży,
za mocny, pulsuje przy dużym zoomie → **C6** (CP27). Odczyty sceny B przy „Watch” (660,5 px, 87,9 %, 45 %) → NOWY
**470** (CP28).

### 13.3 C6 — pierścień starcia subtelny (CP27) `[code]` `[measured]`

- **Mechanizm** `[code]`: `ThreeRenderer._tickEngagementMarkers` — puls usunięty (dawniej krycie
  `0,5 · (0,55 + 0,45 · sin 4t)` = 0,05–0,5 i skala `1 + 0,1 · sin 4t` z zegara realnego `this._clock`); co klatkę pas
  pierścienia przeliczany przez NEW `VesselFxLogic.engagementRingBand` — w każdym z 65 punktów okręgu szerokość świata =
  `WIDTH_PX` × świat na piksel w głębi tego punktu (`_viewDepth`), więc linia ma stałą szerokość na ekranie przy każdym
  przybliżeniu (dawny pas świata 0,25–0,32 j.: ~1 px w kadrze układu, ~30 px przy 2 j., ~190–290 px przy 0,5 j.). Stałe
  — NEW `VesselFxLogic.ENGAGEMENT_RING`: `WIDTH_PX 1.5`, `OPACITY 0.3`, `RADIUS 0.285` (środek dawnego pasa — promień bez
  zmian), `SEGMENTS 64`; kolor bez zmian. Pozycja (środek uczestników, C1) i ukrycie przy „Watch” (CP14) bez zmian.
  Wyłącznie render — znacznika nie czyta nic poza rendererem; nowy kod nie czyta zegara realnego. Pas jest siatką, nie
  linią GL: `pixelRatio` sięga 2, więc linia GL miałaby 1 piksel bufora ≈ 0,5–0,67 px CSS.
- **Keeper NEW `combat_ring_subtle_smoke`** (15): prawdziwe metody znacznika (`_upsertEngagementMarker`,
  `_tickEngagementMarkers`, `_disposeEngagementMarker`, `_viewDepth` — wyciągnięte ze źródła) na prawdziwym Three.js r171;
  60 klatek przy dystansach kamery 60 / 2 / 0,5 j. (kadr układu / auto-fokus / bliski kadr ≈ dolna granica „Watch” 0,4):
  krycie 0,3 i skala stałe, szerokość na ekranie **1,50 / 1,52 / 1,83 px** (stała z klatki na klatkę), środek pasa
  0,285 j.; ukryty przy „Watch” (wykonanie + `combat_watch_frame_smoke` T11i bez przecelowania); piny źródłowe (bez zegara
  i sinusa); wzór pasa. Fail-first na `72509d4`: **5 / 10** (zielone po obu stronach: K0, K1, T5a, T5b, T6-0; dawny
  pierścień: krycie 0,05–0,5, skala ±0,1, szerokość 0,94–1,11 / 28–35 / 186–288 px) → na C6 **15 / 0**. ⚠ 1,83 px przy
  0,5 j.: szerokość liczona jest w głębi każdego punktu, ale przy bardzo bliskim kadrze punkty okręgu leżą daleko od osi
  widoku i perspektywa poszerza odcinek (~1 / cos kąta) — w granicy keepera (≤ 2 px); poza „Watch” tak bliski kadr daje
  wyłącznie fokus na księżycu (najmniejszy dystans 0,5).
- **Sweep i słownik:** na C6 **319/319**, 0 FAIL (31 advisory), `check-i18n` PASS pl = en 3458 (bez nowych kluczy);
  bez zmian: `combat_follow_centre` 27 / 0 · `combat_marker_life` 18 / 0 · `combat_view_scope` 47 / 0 ·
  `combat_watch_frame` 42 / 0. Przecelowań istniejących keeperów: brak.
- **Tożsamość wyników walki przed / po C6** `[measured]`:
  walidator bramki (sceny A i B, zegar wirtualny, ziarno 4242) na `72509d4` i na C6 — wynik co do bajtu równy:
  wyniki walki (A 20 rund · A · 0/1; B 6 rund · B · 1/0 ×2) i wszystkie odczyty rejestratora; 0 błędów konsoli, 0 utraty
  kontekstu WebGL (przebieg na `72509d4` = przebieg na repo z sesji P2b co do bajtu — przyrząd deterministyczny). Sonda P2b
  (zegar sondy, ziarno 12345) — scena W i scena Y (= T2 bramki) na C6 wobec przebiegów na kodzie C5: bitwy (rundy,
  strzały, trafienia, straty, zwycięzca, odwrót), konsola, diagnostyka (0 losowań poza klatką) i wynik — równe; w zapisie
  klatkowym różnią się wyłącznie promień pierścienia w px (sam C6) i rozmiar pulsującego celownika wroga (`ret`) — faza
  pulsu z `THREE.Clock`, który startuje przy pierwszej klatce renderu jeszcze w czasie realnym, przed zegarem wirtualnym
  sondy (kontrola: dwa przebiegi TEGO SAMEGO kodu — sesja P2b i dziś — różnią się `ret` do 13,7 %; kod C5 i C6, oba
  dziś — do 0,6 %). Sygnatura P1 (scena n, 400 ms, starcie oglądane) na C6 = P1:
  `[[16,12,7,1,0,"B",null],[6,4,4,1,0,"B",null],[11,7,6,1,0,"B",null]]` + wraki `v_24 … v_34` (błąd sondy brak, wyjątki
  konsoli 0, losowania poza klatką 0).
- **Bramka C6** `[measured, Filip]`:
  krok 1 `GATE_P2B.md` w przeglądarce właściciela (2026-10-18) na zestagowanym C6 (drzewo indeksu `0ce955e9`):
  rozkazy ok, ok · klucz 400 · pauza true; spacja, ~20 s oglądania. Słowa właściciela: „ok wygląda wszystko dobrze, więc
  pass” — pierścień cienki, blady, bez pulsu, nie zasłania modeli. **PASS** → „go”.
- **Commit** `[git]`: test na sucho (`tools/dryrun_C6.sh` — świeży klon, bajty plików właściciela, 4 kontrole negatywne)
  PASS → `tools/commit_P2B_C6.sh` → `2ff8d26` (drzewo `0ce955e9`).

### 13.4 Decyzje CP25–CP28

Słowa właściciela (polecenie sesji zamykającej P2b, 2026-10-18) — w §5: **CP25** — cel auto-fokusu (uczestnicy
wyśrodkowani w pasie nad kartą) zostaje, dosłowny środek odrzucony; **CP26** — karta ≤ 45 % ekranu zostaje; **CP27** —
pierścień subtelny i statyczny (C6); **CP28** — **470** → backlog bez daty, bez kodu.

### 13.5 Temat widoczności starcia — ZAMKNIĘTY (CP24)

**Temat widoczności starcia ZAMKNIĘTY zgodnie z CP24. C6 był jedyną poprawką z bramki ostatniej sesji kodu. Backlog bez
daty: 163 · 464 · 460 · 466 · 463 · 469 · 470.** (Polecenie: „Combat-visibility topic CLOSED per CP24. C6 was the single
gate-fix of the last code session. Backlog, no date: 163, 464, 460, 466, 463, 469, 470.”) Następny krok arca — **P3**
(**456**, CP12; najpierw audyt).

### 13.6 Czego nie zweryfikowano

- C6 w przeglądarce właściciela poza krokiem bramki C6 — inne rozdzielczości i skale UI; płaski kąt kamery (pas skraca
  się w kierunku promienia jak każdy płaski element — przy wysokości kamery 50° ~1,15 px w najbliższym i najdalszym punkcie
  elipsy); wiele starć naraz (koszt: 65 rzutów punktu na znacznik co klatkę — niezmierzony, pomijalny `[derived]`).
- **470** — mechanizm z bramki nie potwierdzony; artefakt rejestratora — wniosek z kodu, nie pomiar (§6).
- Paski HP u właściciela 96 % (A) i 72,5 % (B) wobec 100 % walidatora; skok przed „Watch” 11,5 px (walidator 4,4) —
  przyczyna niezmierzona (prawdziwe FPS, inny przebieg walki).
- Konsola przeglądarki właściciela na bramce P2B — nieprzekazana.

### 13.7 Incydenty

1. Przejściowe „Permission denied” przy łatce C2 (§13.1) — ponowienie w skrypcie przeszło, obiekty sprawdzone.
2. Keeper C6, T7b (nowy, przed zestagowaniem): pierwsza wersja porównywała wynik `engagementRingBand` w `Float32Array`
   z tolerancją 1e-6 i padała na poprawnym kodzie (szerokość to różnica dwóch promieni ~0,3 — float32 daje błąd ~1e-5,
   zmierzone 9,6e-6); wzór sprawdzany teraz na `Float64Array` (`out`, tolerancja 1e-9), osobno — domyślna tablica
   `Float32Array`. Fail-first zmierzony ponownie FINALNĄ wersją keepera (5 / 10).
3. Stan wypchnięcia inny niż w poleceniu sesji: commity `e866bd6` … `b1265f4` były już wypchnięte (polecenie właściciela
   „push” w poprzedniej sesji) — HEAD, indeks i drzewo robocze zgodne z oczekiwanym stanem, więc bez STOP.
