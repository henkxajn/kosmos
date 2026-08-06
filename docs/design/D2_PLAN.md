# PHASE D2 — Acceptance Engine + retrofit · plan doc (DRAFT do recenzji)

**Arc:** WOJNA I POKÓJ 1.0 · **Parent:** `DIPLOMACY_BACKBONE.md` §2 + §5 · **Skeleton:** `D2_PLAN_SKELETON.md`
**Zależy od:** D1 ✅ (gate 2026-08-06) · **GALAXY_SEED** (mini-stream przed implementacją D2)
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

## Decyzje otwarte — wymagają Twojego podpisu przed implementacją

1. **`threatened_by_you`: term czy modyfikator?** (§5 skeletonu). Rekomendacja: **term `tension`**
   (czysto, bez sprzężenia zwrotnego), a wpis `threatened_by_you` + jego dwa klucze i18n **skasować**
   jako martwe. Wariant kompromisowy: term liczy wynik, a panel dorysowuje wiersz informacyjny
   w rozbiciu AKCEPTACJI (nie opinii). Trzymanie obu = podwójne liczenie.
2. **`relative_power`: stub w D2 czy naprawa R2 teraz?** (K-1). Rekomendacja: **stub**, naprawa
   w WAR_BACKBONE.
3. **Flip decayu: „jak w katalogu" i strojenie po pomiarze, czy od razu z rekalibracją?**
   Rekomendacja: **zapalić bez zmian tempa, zmierzyć E7, potem stroić** — katalog jest jednym
   miejscem, więc korekta jest tania. ⚠ Ale unifikacja jednostek wchodzi w tym samym commicie, więc
   „bez zmian" oznacza tu „bez zmian ODCZUWALNEGO tempa po przeliczeniu na lata wyświetlane".
4. **Odmowa emisariusza — co widzi gracz?** Statek wraca bez efektu, czy jest odsyłany szybciej?
   Wpis w Dzienniku, czy pauzujący modal? Rekomendacja: **wraca normalnie, wpis w Dzienniku** (envoy
   jest abstrakcyjny, bez lotu — pauzujący modal byłby nieproporcjonalny).
5. **`_onColonyFounded`: pominąć kolonie AI, czy od razu przygotować ścieżkę napięcia AI↔AI?**
   Rekomendacja: **pominąć w D2** (jedna bramka `ownerEmpireId`), ścieżka AI↔AI razem z D5, gdzie
   pary AI↔AI w ogóle powstają.
