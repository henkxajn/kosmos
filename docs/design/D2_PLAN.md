# PHASE D2 — Acceptance Engine + retrofit · plan doc (ZATWIERDZONY — pięć decyzji podpisanych)

**Status:** 🔨 **W REALIZACJI od 2026-08-07.** Kolejność commitów: **E1 → E7 → E2 → E3 → E4 → E5 →
E6 → E8 → E9** · live-gate'y przy **E3, E5, E6**.
**Arc:** WOJNA I POKÓJ 1.0 · **Parent:** `DIPLOMACY_BACKBONE.md` §2 + §5 · **Skeleton:** `D2_PLAN_SKELETON.md`
**Zależy od:** D1 ✅ (gate 2026-08-06) · **GALAXY_SEED ✅** (gate 2026-08-07 — mini-stream zamknięty)
**Basis:** `docs/audit/COMBAT_DIPLO_AUDIT.md` §4.5, R2, R5, R9

---

## Context

Dyplomacja mówi „tak" na wszystko, co da się powiedzieć. Audyt §4.5 rozłożył sześć akcji gracza:
**pokój** i **emisariusz** nie mają ŻADNEGO sprawdzenia — nie ma zahardkodowanego `true` do
odwrócenia, brakuje samego punktu decyzyjnego (R5). Trzy traktaty mają realną ocenę, ale to para
progów: bez stanu wojny, bez relatywnej siły, bez pamięci zdrad, bez kosztu spamowania przyciskiem.
`casusBelli.peaceCost` istnieje dokładnie po to, żeby wyceniać pokój, i ma zero konsumentów.

D1 dostarczył fundament danych: opinia jako stos modyfikatorów z gotowym rozbiciem, napięcie, pamięć
relacji, reputacja, oś `objective`. Zostawił też **tymczasowy mostek** `getTrustEquivalent`
(dokładnie 3 wywołania), którego zniknięcie jest warunkiem zamknięcia D2.

D2 wstawia JEDEN evaluator dla każdej propozycji, w obu kierunkach, z rozbiciem widocznym dla gracza —
i po raz pierwszy pozwala AI powiedzieć „nie".

⚠ **Reguła fazy jest ODWROTNA niż w D1.** D1 miał nie zmieniać zachowania. D2 **jawnie je zmienia**:
każda zmiana wyniku musi być zamierzona, **zmierzona** (macierze akceptacji z harnessu) i opisana.
Tam, gdzie D2 ma zachować dzisiejszy wynik (trzy traktaty), robi to przez przeliczenie progów na wagi,
a nie przez przypadek.

---

## Decisions taken

1. **Flip `FEATURES.diplomacyDecay` → true to OSOBNY commit z własnym gate'em** (E6), po całym
   retrofitcie. Wpleciony w E2/E3 uczyniłby każdą regresję nieprzypisywalną — nie dałoby się odróżnić
   „silnik ocenia inaczej" od „dobra wola zaczęła blaknąć".
2. **Unifikacja jednostek czasu do lat WYŚWIETLANYCH, z przestrojeniem w tym samym przebiegu**
   (§5a skeletonu). Ląduje razem z E6, bo obie rzeczy ruszają to samo tempo i jeden gate powinien
   ocenić je łącznie. Naiwna konwersja tempa decayu napięcia daje **−60/rok wyświetlany** — to gałka
   do strojenia, nie mechaniczne mnożenie. Etykieta UI musi po zmianie **podawać jednostkę**.
3. **`DiplomacyTelemetry` + `Report`** jako para w rejestrze `METRICS` launchera BALANS. Artefaktem są
   **macierze akceptacji** (`archetyp × objective × czasownik`) — tabela, nie wykres, bo to instrument
   strojenia wag.
4. **`_onColonyFounded` dostaje bramkę `ownerEmpireId`** (przeniesione z D1, gdzie było poza zakresem
   jako zmiana zachowania).
5. **Wycofanie `kosmos_save_backup_v{N}`** z localStorage — po live-gate'cie D1 wiemy, że te klucze są
   nie tylko nieczytane, ale i **nieprzewidywalne** (autozapis pod ciśnieniem quoty kasuje je pierwszy).
   Osobny, mały commit; nie łączyć z niczym z silnika.
6. **Reguła anty-podwójnego-liczenia (nowa, twarda):** co jest TERMEM akceptacji, nie może być
   jednocześnie modyfikatorem opinii — bo opinia sama jest termem. Pilnowane asercją, nie tylko
   komentarzem. Dotyczy `tension`/`threatened_by_you` (§Decyzje otwarte 1) i `recent_refusal`.

---

## Corrections to spec

Backbone §2.1 opisuje jedenaście termów jako gotowe do użycia. Pięć z nich nie może w D2 działać
w pełni, i lepiej to powiedzieć teraz niż udawać kompletność (audyt R9: martwe dane czytają się jak
zaimplementowana funkcja).

| # | Spec mówi | Rzeczywistość / korekta |
|---|---|---|
| K-1 | `relative_power` „uses the repaired strength estimate (audit R2 fix, Phase 0b)" | **Phase 0b nie istnieje, R2 nie jest naprawiony.** Oba estymatory (`UtilityAI.estimatePlayerMilitary`, `AlienCivSystem._estimatePlayerMilitary`) robią `m?.id` po `string[]` → regex testuje `''` → zawsze false. Naprawa przesuwa `milRatio` z ~0 na realne wartości i może natychmiast wepchnąć imperia w `AGGRESSIVE`/`WAR`. **Rekomendacja: term jako STUB zwracający 0 z jawnym markerem, naprawa w WAR_BACKBONE** (gdzie „one shared module read by both war and diplomacy" jest już celem §4). Inaczej D2 wchłania reformę AI militarnego. |
| K-2 | `reputation` jako działający term | Ledger istnieje i zanika, ale **nic nie podnosi agresji** (raisery = D4). Term wchodzi strukturalnie, liczbowo jest zerem. Oznaczyć w kodzie i w rozbiciu UI (nie pokazywać wiersza o wartości 0). |
| K-3 | `erratic_noise` dla imperiów z cechą `erratic` | D1 świadomie **nie rzucał** `traits` (odroczone razem z konsumentem). D2 musi dodać rzut — z **własnego strumienia per imperium**, nigdy ze wspólnego (lekcja z `0b15d95`: finalizer + rozgrzanie, nie pierwszy rzut ze świeżego seeda). Po GALAXY_SEED rzut wreszcie różnicuje partie. |
| K-4 | `offer` — „every proposal can carry a sweetener" | Wymaga UI oferty + realnego transferu kredytów/surowców, a `gift` jest w katalogu **D4**. **Rekomendacja: term zaimplementowany, ale BEZ UI w D2** (oferta zawsze pusta ⇒ wkład 0; AI może go używać wewnętrznie). Pełne oferty w D4 razem z `gift`. |
| K-5 | `third_party` — „makes AI↔AI real" | Pary AI↔AI instancjonuje **D5**. W D2 term widzi wyłącznie relacje gracz↔AI plus wojny z `WarSystem`, więc `ally_of_our_enemy` / `at_war_with_our_enemy` będą prawie zawsze zerowe. Wchodzi jako częściowo bezczynny, z jasnym komentarzem. |

Dodatkowo: **`getTrustEquivalent` musi zniknąć w tej fazie** (3 wywołania: `proposeTreaty`,
bramka AI-envoy w `AlienCivSystem`, bramki przycisków w `DiplomacyOverlay`). Warunek zamknięcia D2:
`grep -rn "getTrustEquivalent" src/` puste.

---

## Commit plan (atomowo, live-gate przy E3, E5, E6)

**E1 — silnik + katalog termów i wag (czysta logika, ZERO wpięć).**
NEW `src/data/AcceptanceWeightData.js` (wagi verb × term + nadpisania archetyp/objective — balans
TYLKO tutaj) · `src/utils/AcceptanceMath.js` (czysta: sumowanie ważone, budowa rozbicia, próg,
`counterHint`; wzór `OpinionMath`) · `src/systems/diplomacy/AcceptanceEngine.js` (`evaluateProposal`,
rejestr termów; kolaboratorzy leniwie przez `window.KOSMOS`).
Stoi samodzielnie — nic w `src/systems`/`src/ui` tego jeszcze nie importuje (jak C1 w D1).
Test: `acceptance_engine_smoke` (pure).

**E2 — retrofit trzech traktatów.** `proposeTreaty` → engine. Progi 60/75/80 przeliczone na wagi tak,
by **wynik był identyczny jak dziś** dla tych samych wejść (asercja parytetu w smoke, wzór M13 z D1).
Usuwa 1. z 3 wywołań mostka.

**E3 — pokój i emisariusz dostają PIERWSZE sprawdzenie + auto-peace przez engine.** ⚠ Tu zmienia się
rozgrywka. `offerPeace` i `MissionSystem._launchEnvoy` zyskują szew, którego nigdy nie miały;
`WarSystem._triggerAutoPeace` przestaje być bypassem (exhaustion staje się wielkim TERMEM).
`casusBelli.peaceCost` wreszcie konsumowany. **Własny live-gate.**

**E4 — UI odmowy z rozbiciem + term `recent_refusal`.** Modal odmowy pokazuje `breakdown` verbatim
(kanał: `ScheduledEventPopup` — jedyny z `options[]`). `recent_refusal` kończy spamowanie przyciskiem.
Stan: `verbCooldowns` na rekordzie pary, czytane z `?? {}` — **prawdopodobnie bez bumpu save'a**
(wzór `bordersOpen` z D1; do potwierdzenia, patrz §Ryzyka).

**E5 — konsumenci osi `objective` + rzut `traits: ['erratic']` + term `erratic_noise`.**
Pierwsi realni konsumenci osi z C3. **Własny live-gate** (ten sam archetyp z różnym objective ma
mierzalnie inaczej akceptować).

**E6 — flip `FEATURES.diplomacyDecay` → true + UNIFIKACJA JEDNOSTEK + przestrojenie.**
⚠ Największe ryzyko fazy, dlatego osobno i na końcu. `DIPLOMACY_FROZEN` uzbraja się razem z flagą.
Etykieta `diplo.fadesIn` podaje jednostkę (PL+EN). **Własny live-gate.**

**E7 — `DiplomacyTelemetry` + `Report` + wpis w `METRICS`.** Może wejść WCZEŚNIEJ (przed E2/E3), jeśli
strojenie wag będzie tego wymagać — kolejność numeryczna nie jest tu zobowiązaniem.

**E8 — przeniesione z D1: bramka `ownerEmpireId` w `_onColonyFounded`.**

**E9 — wycofanie `kosmos_save_backup_v{N}`** (osobno, na końcu; ścieżka ratunkowa).

---

## Tests

- **`acceptance_engine_smoke`** (E1, pure): każdy term osobno (wejście → `{value,label}`), sumowanie
  ważone, próg, determinizm, `counterHint`, degradacja przy braku danych (nieznany archetyp,
  brak wojny), oraz **asercja anty-podwójnego-liczenia**: żaden id termu nie jest jednocześnie id
  modyfikatora w `OPINION_MODIFIERS`.
- **`acceptance_matrix_smoke`** (E2/E3): macierz `archetyp × objective × czasownik` przy ustalonych
  warunkach → **tabela odsetków akceptacji jako artefakt regresji**. To jest instrument strojenia.
- **Parytet E2**: te same wejścia co dzisiejsze progi ⇒ te same decyzje (wzór M13 z D1).
- **E3**: pokój odrzucany przy niskim exhaustion i przewadze przeciwnika; przyjmowany przy wysokim;
  `peaceCost` mierzalnie wpływa; emisariusz może zostać odrzucony i statek wraca bez efektu.
- **E6**: obie gałęzie flagi (D1 blok D4 MUSI przeżyć — zmienia się domyślna wartość, nie kontrakt);
  krzywe decayu po unifikacji jednostek; `DIPLOMACY_FROZEN` zapala się dopiero z flagą.
- Regresja D1: `diplomacy_d1_smoke`, `diplomacy_opinion_smoke`, `diplomacy_model_smoke`,
  `diplomacy_migration_v100_smoke`, `diplomacy_overlay_breakdown_smoke`, `empire_objective_smoke`.
- Bramki per commit: sweep 0 FAIL · `check-i18n` PASS · grep `getTrustEquivalent` (puste po E2-E4).

---

## Verification (live gate)

Trzy gate'y zamiast jednego — E3, E5 i E6 zmieniają rozgrywkę w różny sposób i muszą być oceniane
osobno, inaczej nie da się przypisać regresji.

1. **E3** — wojna, którą trudno zakończyć: pokój odrzucony przy niskim exhaustion; modal odmowy
   pokazuje rozbicie; ponowna propozycja w ciągu 2 lat obłożona `recent_refusal`; emisariusz odrzucony
   przez wrogie imperium.
2. **E5** — dwa imperia tego samego archetypu z różnym `objective` akceptują mierzalnie inaczej.
3. **E6** — dobra wola z emisariuszy blaknie w tempie zgodnym z NOWĄ jednostką; etykieta w panelu
   podaje jednostkę; napięcie po wojnie spada w rozsądnym czasie (nie w 6 miesiącach, nie w 60 latach).

---

## Out of scope (świadomie)

`gift` / `denounce` / `threaten` / NAP duration / mechanika sojuszu / war CB + reputacja / warunki
pokoju z transferem terytorium — **D4** · `tech_exchange` / `tribute` / `embargo` / ramping handlu /
aktywacja AI↔AI — **D5** · granice i incydenty (`bordersOpen` czeka nieczytane od D1) — **D3** ·
naprawa R2 i wspólny threat assessment — **WAR_BACKBONE** · UI kontrofert (`counterHint` jest
emitowany, nic go nie konsumuje) — poza 1.0 · reforma mapy galaktyki 2D — na końcu arca.

---

## Decyzje — PODPISANE (wszystkie pięć)

1. **`threatened_by_you`: wygrywa TERM `tension`.** Wpis w `OPINION_MODIFIERS` **i jego dwa klucze
   i18n** (`diplo.mod.threatenedByYou` w pl i en) **kasujemy** — bez tego zostałyby martwym wpisem
   udającym funkcję (R9). Wariant kompromisowy (term liczy wynik, panel dorysowuje wiersz
   informacyjny w rozbiciu AKCEPTACJI) **pozostaje dostępny jako opcja UI w E4**, gdyby zrozumiałość
   odmowy okazała się słaba — to decyzja o UI, nie o modelu, więc nie wraca do silnika.
2. **`relative_power`: STUB w D2, naprawa w WAR_BACKBONE.**
   ⚠ **Wymóg dołączony:** artefakt macierzy z E7 musi **JAWNIE oznaczać kolumnę siły jako BEZCZYNNĄ**
   (np. nagłówek `relative_power (INERT — R2)` + nota pod tabelą), żeby nikt nie stroił wag względem
   termu, który zwraca zero. To samo dotyczy `reputation` (K-2) i `third_party` (K-5).
3. **Flip decayu: zapalić BEZ zmiany ODCZUWALNEGO tempa, zmierzyć, potem stroić.**
   ⚠ **Wymóg dołączony:** tabela bazowa poniżej (§Baseline) musi być w planie **przed E6** — inaczej
   „bez odczuwalnej zmiany" jest niesprawdzalne na gate'cie.
4. **Odmowa emisariusza: statek wraca normalnie + wpis w Dzienniku.**
   ⚠ **Wymóg dołączony:** przy budowie kanału odmowy w E4 klasa zdarzeń ostrzeżeń/odmów dyplomacji
   dostaje **swojego PIERWSZEGO realnego subskrybenta Dziennika**. Dziś `diplomacy:warning` nie ma
   ani jednego (dlatego checklista D1 §1.3 musiała usunąć oczekiwanie wpisu) — E4 to zamyka.
5. **`_onColonyFounded`: sama bramka `ownerEmpireId`.** Ścieżka napięcia AI↔AI ląduje w D5, gdzie
   pary AI↔AI w ogóle powstają.

**Zmiana kolejności (zatwierdzona):** **E7 wchodzi PRZED E2/E3**. Macierze akceptacji są instrumentem
strojenia konwersji progów w E2 — stroimy z przyrządem, nie na wyczucie. Nowa kolejność:
**E1 → E7 → E2 → E3 → E4 → E5 → E6 → E8 → E9.**

---

## Baseline jednostek — tabela DO WYPEŁNIENIA POMIAREM przed E6

Stan dzisiejszy policzony z katalogu (`decayPerYear` działa na rok CYWILIZACYJNY,
`CIV_TIME_SCALE = 12`, wpis znika przy `|value| < MODIFIER_EPSILON = 0.5`):

| modyfikator | wartość | decay/rok cyw. | zanika po (lata cyw.) | zanika po (lata WYŚWIETLANE) | UI pokazuje dziś |
|---|---|---|---|---|---|
| `envoy_goodwill` | +5 | 1 | 5,0 | **0,42** | „zanika za 5 l." |
| `military_presence` | −5 | 2 | 2,5 | **0,21** | „zanika za 3 l." |
| `recent_war` | −15 | 2 | 7,5 | **0,63** | „zanika za 8 l." |
| `legacy_relations` (trust 80 ⇒ +30) | +30 | 2 | 15,0 | **1,25** | „zanika za 15 l." |
| napięcie (`PEACE_DECAY`) | 30 | 5 | 6,0 | **0,50** | — (pasek bez licznika) |

⚠ **Co ta tabela od razu pokazuje:** liczba w UI („zanika za 5 l.") jest **~12× większa** niż czas,
który gracz faktycznie przeżywa (0,42 roku wyświetlanego). Etykieta nie kłamie o jednostce — ona jej
w ogóle nie podaje.

To stawia realny problem przy E6: **utrzymanie odczuwalnego tempa 1:1** wymaga pomnożenia
`decayPerYear` przez 12 (na rok wyświetlany), a wtedy wyświetlane „zanika za N lat" spada do 0–1 dla
większości modyfikatorów i staje się bezużyteczne (`ceil(5/12) = 1`). Czyli po unifikacji trzeba
wybrać JEDNO:

- **(a) zachować odczuwalne tempo** → UI potrzebuje podrocznej precyzji („zanika za 5 miesięcy"), albo
- **(b) zwolnić decay** tak, by liczby w latach wyświetlanych były sensowne (np. dobra wola
  z emisariuszy żyje ~3 lata wyświetlane) — to jest realna zmiana balansu, świadoma i mierzona.

Ta decyzja zapada **po pomiarze z E7**, nie teraz. Kolumna „po unifikacji" tabeli zostaje pusta do
tego momentu — wypełnia ją commit E6 i ona jest dowodem na gate'cie.
