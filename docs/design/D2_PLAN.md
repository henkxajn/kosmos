# PHASE D2 — Acceptance Engine + retrofit · plan doc (ZATWIERDZONY — sześć decyzji podpisanych)

**Status:** 🔨 **W REALIZACJI od 2026-08-07.** Kolejność commitów: **E1 → E7 → E2 → E3 → E4 → E5 →
E6 → E8 → E9** · live-gate'y przy **E3, E5, E6**.
**Postęp:** E1 ✅ · E7 ✅ · E2 ✅ · **E3 ✅ (gate PASSED 2026-08-08)** · **E4 ✅** · **E4e ✅**
(dwa fixy uczciwości z audytu recovery) · **E5 ✅ ZAMKNIĘTY (gate PASSED 2026-08-10, 10/10)** ·
**E6 ⬜ ← TU** · E8/E9 ⬜ do zrobienia

⚠ **E6 jest następny i jest NAJWIĘKSZYM ryzykiem fazy** (flip `diplomacyDecay` + unifikacja
jednostek + przestrojenie). Warunek podpisany (decyzja 3): **tabela §Baseline musi być wypełniona
POMIAREM PRZED commitem E6** — inaczej „bez odczuwalnej zmiany tempa" jest niesprawdzalne na gate'cie.

| commit | stan | hash | uwagi |
|---|---|---|---|
| **E1** silnik + katalog termów i wag | ✅ **DONE** | `ef35af7` | 197 asercji, zero wpięć; `INCIDENT_CHANNELS` zaostrzyły regułę anty-podwójnego-liczenia |
| **E7** telemetria + raport + `METRICS` | ✅ **DONE** | `27dd7a6` | macierze akceptacji jako TABELA; sonda wrażliwości termów oddzielona od macierzy |
| **E2** retrofit trzech traktatów | ✅ **DONE** | `b8b3e08` | osobowość → **podłoga** (dowód `O ≥ 8·P`); `diplomacy_d1_smoke` 83/83 BEZ poprawek |
| **E3** pokój + emisariusz + auto-peace | ✅ **DONE — GATE PASSED 2026-08-08** | `e011017` | 10/10 sekcji; skrypt+wynik: `docs/design/D2_E3_GATE_CHECKLIST.md` · mostek `getTrustEquivalent` USUNIĘTY · jedna rozbieżność → naprawa w E4 (ustalenie 6 niżej) |
| **E4** UI odmowy + `recent_refusal` | ✅ **DONE** (bez gate'u) | `9f166a4` `10175c3` `d473bcd` `56de88d` | 4 podkroki: a=pisarz karencji (UNFED→LIVE) · b=modal z rozbiciem · c=flip przycisków + powód blokady · d=wpis o ZAWARTYM pokoju (dług z gate'u E3). Save v100 bez migracji |
| **E4e** dwa fixy uczciwości modala | ✅ **DONE** | `fc284c2` `b75fe3e` `db22a80` | z audytu recovery po utraconej sesji: `−0` w progu odmowy pokoju (A) + auto-pokój logujący cudzą odmowę (B) + piny R11. Oba w §Ustalenia 11 |
| **E5** konsumenci `objective` + rzut `erratic` | ✅ **ZAMKNIĘTY — GATE PASSED 2026-08-10 (10/10)** | `6c7ea3d` `d7ff7b5` | a=liczby agendy + `merchant` jako agenda REFERENCYJNA (kotwica parytetu E2) · b=rzut `erratic` z własnego strumienia + term UNFED→LIVE. Wynik gate'u w `D2_E5_GATE_CHECKLIST.md` · przebieg na zapisie **po wojnie, w rozejmie** — progi zgodziły się co do punktu MIMO realnego stosu modyfikatorów, czyli potwierdzona przenośność skryptu (ustalenie 16). Save v100 bez migracji |
| **E6** flip `diplomacyDecay` + unifikacja jednostek | ⬜ do zrobienia | — | własny gate; tabela §Baseline do wypełnienia pomiarem |
| **E8** bramka `ownerEmpireId` w `_onColonyFounded` | ⬜ do zrobienia | — | przeniesione z D1 |
| **E9** wycofanie `kosmos_save_backup_v{N}` | ⬜ do zrobienia | — | osobno, ścieżka ratunkowa |

**Save przez całą fazę dotąd: v100 bez migracji** (żaden commit nie dołożył stanu persystentnego).

⚠ **Ustalenia z realizacji, których plan nie przewidywał** (szczegóły w opisach commitów):
1. Mostek miał **CZTERY** wywołania, nie trzy — czwarte to `trustEqD2` w `GameScene.debug`.
2. Reguła anty-podwójnego-liczenia w brzmieniu z planu przechodzi TRYWIALNIE (zbiory id są
   rozłączne). Realny hazard to term `memory`, którego typy pokrywają się z modyfikatorami
   opinii i z napięciem — stąd `INCIDENT_CHANNELS` (jeden incydent = jeden kanał).
3. **Konwersja progów na wagi jest niemożliwa** przy osobowości jako termie (`O ≥ 8·P`,
   niezależnie od skali). Osobowość została **podłogą** — czym w dawnym kodzie faktycznie była.
   Konsekwencja dla D4 (`gift`/`offer` a podłogi) zapisana w master planie przy D4.
4. `peaceCost 100` **nie wystarcza** do „praktycznie braku pokoju" — działa dopiero para
   cena × natura.
5. Odmawialny auto-pokój mógł **zakleszczyć wojnę** (wyczerpanie clampowane do 100 + wczesny
   return) — dołożony retry przy każdej kolejnej bitwie + `war:autoPeaceRefused` w Dzienniku.
6. **Gate E3 (PASSED) odsłonił dług sprzed fazy: pokój ZAWARTY nie ma wpisu w Dzienniku
   i nigdy nie miał** — `diplomacy:peaceSigned` ma wyłącznie subskrybentów STANU
   (`WarSystem:46` zamyka wojnę, `AlienCivSystem:66` przełącza FSM), a `git log --all -S`
   po `UIManager` jest pusty. To over-promise checklisty, nie regresja E3 (klasa D1 §1.3).
   Uwiera dopiero teraz, bo E3 dał głos ODMOWOM — pokój został jedynym sukcesem bez wpisu
   (traktat i emisariusz mają swoje). **Naprawiono w E4d**; macierz ośmiu wyników jest
   teraz PINEM w smoke, więc kolejna taka luka padnie w harnessie, nie na gate'cie.
7. **`recent_refusal` był gotowy w 90% od E1** — ewaluator, wagi we wszystkich pięciu
   czasownikach, plumbing `ctx` i sześć asercji. Brakowało wyłącznie PISARZA, więc E4
   nie dodawał termu, tylko go nakarmił (`RelationsModel.noteVerbRefusal`).
8. **Karencja MUSI omijać auto-pokój, inaczej E4 zatrzaskuje pułapkę, którą otworzył E3.**
   Auto-pokój ponawia się przy każdej bitwie; stemplowanie dałoby parze w praktyce stałe
   −20 na `offer_peace`. Rozwiązane JEDNĄ flagą `playerInitiated`, bo z tego samego faktu
   wynika i brak stempla, i brak modala (który pauzowałby grę w środku serii starć).
9. **Flip przycisków odsłonił kłamiącą diagnostykę.** Mapowanie powodu blokady było
   ternary bez trzeciej gałęzi (`alreadySigned ? … : 'at_war'`), więc podłoga osobowości
   meldowała się jako „trwa wojna". Dotąd nieosiągalne klikiem — bramka przycisku pytała
   silnik o decyzję, więc xenofag miał sojusz po prostu wyszarzony. Naprawione tabelą
   `REJECT_REASON_BY_KEY` w tym samym commicie, który to odsłonił.
10. **Atrapa headless nie miała `ParentNode.append`**, choć UI używa go w **sześciu miejscach
   w trzech plikach** (ScheduledEventPopup ×2, BattleIntroModal ×3, BattleView3D ×1). Każdy
   headless test dotykający tych ścieżek wywalał się komunikatem wyglądającym na błąd
   testowanego kodu. ⚠ Opis commita `10175c3` mówi „w czterech plikach" i wylicza trzy —
   liczba plików jest tam błędna (pomyłka opisu, nie kodu); poprawny stan jest tutaj.

⚠ **Znalezione PO E4, audytem recovery — NIE naprawione w E4** (kolejka na E4e; oba dotyczą
UCZCIWOŚCI kanału odmowy, czyli tego, co E4 miało załatwić):
- **A. `−0` w każdym modalu odmowy pokoju.** `_sign = v > 0 ? '+' : '−'` (`DiplomacyRefusalModal.js:45`)
  wpycha ZERO do gałęzi minusa, a `offer_peace` ma `threshold: 0` — i żaden archetyp, który gra
  faktycznie generuje, nie ma `thresholdDelta`. Skutek: linia „Wymagany próg" czyta się jako
  **−0** w KAŻDEJ odmowie pokoju w realnej partii. Zły znak na jedynej liczbie, dla której ten
  modal istnieje. Trafia też w linię wyniku, gdy `score` wypada dokładnie 0.
- **B. Auto-pokój melduje odmowę, której gracz nigdy nie zaproponował.** `offerPeace` emituje
  `diplomacy:peaceRejected` BEZWARUNKOWO (`DiplomacySystem.js:400`) — z `playerInitiated`
  w payloadzie. Modal ten flag HONORUJE (`DiplomacyRefusalModal.js:141`, bramka dodatnia),
  ale subskrybent Dziennika **nie** (`UIManager.js:1361` destrukturyzuje samo `{ empireId }`),
  więc każde ponowienie auto-pokoju dokłada wpis „🚫 {0} odrzucili propozycję pokoju" **i toast**.
  Gracz niczego nie proponował, a `war:autoPeaceRefused` mówi to samo uczciwie tuż obok.
  Kod jest E3, ale flagę rozstrzygającą dołożyło E4a — to niedokończony konsument, nie nowy projekt.
11. **Teza gate'u E5 była WPROST SPRZECZNA z podpisaną kotwicą parytetu E2.** Gate wymaga
   „ten sam archetyp z różną agendą akceptuje mierzalnie inaczej"; kotwica E2 wymagała granicy
   10/25/30 **dla KAŻDEJ agendy**, i to dla obu archetypów, które gra faktycznie generuje.
   Rozwiązane **agendą REFERENCYJNĄ**: `merchant` zostaje BEZ nadpisania — dokładnie tym samym
   chwytem, którym industrialist i expansionist zostały bez nadpisania archetypu. Parytet
   zmierzono pod `merchant` i pod tą agendą stoją fixture'y (154 asercje), więc kotwica
   przetrwała w formie mocniejszej: dawne progi są odtwarzane CO DO PUNKTU, a agenda daje
   rozrzut wokół nich. Kotwica zawężona z „każdej agendy" do referencyjnej — świadome
   przebazowanie, nie ciche poluzowanie testu.
12. **Gate E5 nie jest wykonalny na dwóch imperiach.** `AI_ARCHETYPE_SEQUENCE` ma dwa wpisy,
   więc partia ZAWSZE daje jednego industrialistę i jednego expansionistę — dwa imperia tej
   samej kultury nie mogą wystąpić. Gate zmienia agendę JEDNEMU imperium (precedens: §4 gate'u
   E3 podmieniał archetyp), co jest dowodem mocniejszym: zmienia się dokładnie jedna zmienna.
13. **Agenda mogła być strojona wyłącznie przez `opinion` i `thresholdDelta`.** Podpisana
   decyzja 2 zabrania stroić wagi wobec termów zwracających zero, a kontekst bazowy macierzy E7
   trzyma `offer`/`reputation`/`third_party` na zerze — nadpisanie ich NIC by nie zrobiło
   i było NIEWIDOCZNE w artefakcie, więc raport mówiłby „agenda nic nie zmienia" wbrew grze.
14. **Sól strumienia cech musi się różnić od soli agend.** Ta sama sól = ten sam ciąg, więc
   `erratic` korelowałby 1:1 z `objective`, a rzut wyglądałby na losowy dopóki ktoś nie zestawi
   obu kolumn. Zmierzone po naprawie: 25.4% na 1000 imperiów, rozkład 20–30% we WSZYSTKICH
   sześciu agendach.
15. **`LIVE` nie znaczy „zawsze niezerowy" i trzeba to było powiedzieć testom ORAZ raportowi.**
   `erratic_noise` wnosi 0 dla imperium bez cechy (czyli dla większości) — to poprawny WYNIK.
   Termy `UNFED` zwracają 0 dla KAŻDEGO wejścia, jakie gra potrafi wytworzyć; to jest ta różnica.
16. **Gate E5 (PASSED) poszedł na zapisie TRUDNIEJSZYM niż skrypt zakłada — i przez to udowodnił
   więcej.** Przebieg odbył się po wojnie, w trakcie rozejmu, więc para gracz↔`emp_001` miała realny
   stos modyfikatorów (`recent_war` i reszta) oraz napięcie po walkach, a nie czystą planszę, na
   której liczby mierzono headlessowo. **Wszystkie progi zgodziły się CO DO PUNKTU** (§1 sześć agend,
   §3 kotwica `merchant` 4/10/15, §4 pokój i emisariusz), a układ decyzji z §2 utrzymał się przy
   innej opinii bazowej niż +20. To potwierdza w warunkach polowych rozdział, który skrypt tylko
   deklarował: **próg jest własnością katalogu, wynik własnością partii.** Wniosek na przyszłe
   gate'y fazy: pinować PROGI (przenośne) i UKŁAD (monotoniczność), nigdy bezwzględnych `score`.

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
6. **Decision 1 (zawężenie kotwicy parytetu E5 do agendy referencyjnej) — RATYFIKOWANA przez
   orkiestratora 2026-08-09.** Sprzeczność była realna i nie do usunięcia w dawnym brzmieniu:
   „każda agenda odtwarza dawne progi" (E2) i „agenda mierzalnie rusza akceptację" (E5) nie mogą
   obowiązywać naraz. Rozwiązanie przez agendę referencyjną (`merchant` bez nadpisania ⇒ progi
   dawne CO DO PUNKTU; pięć agend odchyla się) powiela własny ruch E2 na osi archetypów, trzyma
   OBIE tezy przypięte JEDNOCZEŚNIE w telemetrii i zostało zrobione jawnie, z nazwanym zawężeniem.
   ⚠ To jest wzorzec przenoszenia PODPISANEJ własności: nie poluzować pinu, tylko zawęzić go do
   punktu odniesienia, który nadal dowodzi pierwotnej tezy — i podpisać zmianę w tym rejestrze.

**Zmiana kolejności (zatwierdzona):** **E7 wchodzi PRZED E2/E3**. Macierze akceptacji są instrumentem
strojenia konwersji progów w E2 — stroimy z przyrządem, nie na wyczucie. Nowa kolejność:
**E1 → E7 → E2 → E3 → E4 → E5 → E6 → E8 → E9.**

---

## Baseline jednostek — ✅ WYPEŁNIONA POMIAREM 2026-08-10 (warunek wejścia E6 spełniony)

**Instrument:** `src/testing/headless/probe-diplomacy-time-units.mjs` — sonda READ-ONLY, która NIE
liczy nic sama: przepuszcza prawdziwe `RelationsModel.tickModifiers` / `OpinionMath.decayModifiers` /
`rampModifiers` przez dokładnie tę kadencję, którą stosuje `DiplomacySystem` (`_tickAccum` →
`Math.floor` → CAŁE kroki), i mierzy, po ilu krokach wpis znika. Reprodukcja: `node
src/testing/headless/probe-diplomacy-time-units.mjs`.

**Dlaczego POMIAR, a nie dzielenie wartości przez tempo** — dwie rzeczy niewidoczne na kartce:
1. tick leci CAŁYMI latami cyw. (`Math.floor(_tickAccum)`), więc `5/2 = 2,5` daje w praktyce **3**;
2. wpis znika przy `|value| < MODIFIER_EPSILON = 0,5`, nie przy zerze — przy drobnym kroku
   (dt = 1/12 roku wyświetlanego) obcięcie epsilonem zjada nawet pół roku.

⚠ **Dwa wiersze poprzedniej (policzonej) wersji tej tabeli były BŁĘDNE** — dzieliła wartość przez
tempo, ignorując punkt 1: `military_presence` 2,5 → w rzeczywistości **3** lata cyw. (0,21 → **0,25**
wyświetlanego), `recent_war` 7,5 → **8** (0,63 → **0,667**). Pozostałe trzy wiersze zgadzały się.
Zbieżność wtórna, ale użyteczna: zmierzone życie w latach cyw. jest RÓWNE liczbie, którą UI już
pokazuje — `modifierYearsLeft` = `ceil(|value| / rate)` trafia co do punktu. **Etykieta nie kłamie
o liczbie, kłamie tylko o jednostce.**

### §B0 — pomiar, który zmienia PYTANIE (najważniejszy wynik)

```
flaga=false → envoy_goodwill NIE ZANIKA NIGDY (∞)
flaga=true  → envoy_goodwill zanika po 5 lat cyw.
```

W zaszytym stanie repo (`FEATURES.diplomacyDecay: false`) **decay modyfikatorów i decay reputacji
NIE DZIAŁAJĄ WCALE.** Ich dzisiejsze odczuwalne tempo to **∞ (nigdy nie zanika)**, a nie „0,42 roku
wyświetlanego" — ta liczba opisywała HIPOTEZĘ („co by robiły te tempa, gdyby flaga była włączona"),
nie zachowanie, które gracz kiedykolwiek widział. Konsekwencja dla decyzji 3 jest w §Rekomendacji.

### §B1 — życie modyfikatora: DZIŚ vs dwa warianty po unifikacji (zmierzone)

Warianty: **(a)** tempo ×12 ⇒ „na rok wyświetlany", odczuwalne tempo IDENTYCZNE jak dziś ·
**(b)** cyfry BEZ zmiany, reinterpretowane jako „na rok wyświetlany" ⇒ 12× wolniej.
Kadencja w obu wariantach zostaje 1 rok cyw. (dt = 1/12 roku wyświetlanego na wywołanie).

| modyfikator | wart. | tempo | DZIŚ (lata cyw.) | DZIŚ (wyświetlane) | UI dziś | **(a)** wyśw. | **(b)** wyśw. | UI po (b) |
|---|---|---|---|---|---|---|---|---|
| `envoy_goodwill` | +5 | 1 | 5 | 0,417 | „5 l." | 0,417 | **4,583** | „5 l." |
| `military_presence` | −5 | 2 | 3 | 0,25 | „3 l." | 0,25 | **2,333** | „3 l." |
| `recent_war` | −15 | 2 | 8 | 0,667 | „8 l." | 0,667 | **7,333** | „8 l." |
| `legacy_relations` (trust 80 ⇒ +30) | +30 | 2 | 15 | 1,25 | „15 l." | 1,25 | **14,75** | „15 l." |
| `their_envoy` | +3 | 1 | 3 | 0,25 | „3 l." | 0,25 | **2,5** | „3 l." |
| `research_intrusion` | −3 | 2 | 2 | 0,167 | „2 l." | 0,167 | **1,333** | „2 l." |
| `trespassing` | −5 | 2 | 3 | 0,25 | „3 l." | 0,25 | **2,333** | „3 l." |

⚠ **Wariant (a) zabija etykietę:** wszystkie życia mieszczą się w 0,17–1,25 roku wyświetlanego, więc
`ceil` daje **1 dla każdego wpisu** — „zanika za 1 rok" przy siedmiu różnych modyfikatorach. Ratunek
tylko przez podroczną precyzję („za 5 miesięcy"). W (b) liczby wychodzą całkowite i sensowne, a UI
zawyża o obcięcie epsilonem (pokazuje 5, faktycznie 4,58) — dokładnie tak samo jak dziś (3 vs 2,5).

### §B2 — mechanizmy ŻYWE dziś (NIE bramkowane flagą): (a) to TOŻSAMOŚĆ, nie zmiana

| mechanizm | DZIŚ | **(a)** ×12 | **(b)** bez zmian |
|---|---|---|---|
| `trade_partner` ramp 0→+50 (`rampPerYear` 1) | 50 lat cyw. = **4,167** wyśw. | **4,167** ← IDENTYCZNE | 50 wyśw. (12× dłużej) |
| napięcie 30→0 (`PEACE_DECAY` 5) | 6 lat cyw. = **0,5** wyśw. | **0,5** ← IDENTYCZNE | 6 wyśw. (12× dłużej) |

⚠ **Obawa z poprzedniej wersji planu („−60/rok wyświetlany — prawie na pewno za szybko") była
artefaktem jednostki, przed którą sama ostrzegała.** `PEACE_DECAY = 60` na rok wyświetlany to
DOKŁADNIE ta sama prędkość co dzisiejsze `5` na rok cyw. — zmierzone: 0,5 = 0,5 roku wyświetlanego.
Nowa cyfra wygląda drastycznie; zachowanie jest bitowo to samo.

### §B3 — pełna inwentaryzacja stałych czasowych dyplomacji (zakres E6)

Trzy klasy. Tylko klasa 1 wymaga PRZELICZENIA; klasy 2 i 3 są już w latach wyświetlanych.

**Klasa 1 — tempa na rok CYWILIZACYJNY (realna konwersja):**

| stała | wartość | gdzie | żywa dziś? |
|---|---|---|---|
| `OPINION_MODIFIERS[*].decayPerYear` (7 niezerowych) | 1–2 | `OpinionModifierData` | **NIE** — flaga OFF |
| `trade_partner.rampPerYear` (+1, `rampMax` +50) | 1 | `OpinionModifierData` | **TAK** — ramp nie jest bramkowany |
| `PEACE_DECAY` | 5,0 | `DiplomacySystem:54` | **TAK** — jawnie nie bramkowany |
| `DEFAULT_AGGRESSION_DECAY` (reputacja) | 1 | `ReputationLedger:22` | **NIE** — ta sama flaga |

**Klasa 2 — już lata wyświetlane, komentarz ZGODNY (tylko dokumentacja):**
`TRUCE_YEARS` 10 · `RECENT_REFUSAL_YEARS` 2 · `ERRATIC_EPOCH_YEARS` 10.

**Klasa 3 — już lata wyświetlane, ale komentarz KŁAMIE albo milczy (naprawa opisu, wartość bez zmian):**

| stała | wartość | komentarz mówi | jest naprawdę |
|---|---|---|---|
| `ULTIMATUM_GRACE_YEARS` | 3,0 | „lata cyw." | **3 lata wyświetlane = 36 cyw.** |
| `TRESPASS_YEARS` | 1,0 | „co ile lat cyw." | **1 rok wyświetlany = 12 cyw.** |
| `PEACE_QUIET_YEARS` | 2,0 | (nie podaje jednostki) | **2 lata wyświetlane = 24 cyw.** |
| `AI_ENVOY_COOLDOWN` (`AlienCivSystem:38`) | 15 | „civYears" | **15 lat wyświetlanych = 180 cyw.** |
| `modifierYearsLeft` (docstring) | — | „lat cyw." | zgodny DZIŚ; po klasie 1 staje się wyświetlanymi |
| `getTruceYearsLeft` (docstring) | — | „lat cyw." | **lata wyświetlane** (czyta `_year()`) |

⚠ **Dwie kopie stałych bez linku** (rozjadą się przy każdym strojeniu, w zakresie E6 jako higiena):
`DiplomacyOverlay:402` liczy licznik ultimatum z **literału `3`** zamiast importować
`ULTIMATUM_GRACE_YEARS`; `SaveMigration:2628` i `:2630` wpisują reputacyjne `decayPerYear: 1` drugi
raz, niepowiązane z `DEFAULT_AGGRESSION_DECAY`.
ℹ Poza zakresem, ale zauważone: `WarSystem:39 FLEET_AGGRO_INTERVAL = 5` jest MARTWE (jedyne
wystąpienie w `src/`; logika poszła do `MilitaryAI`) — kandydat do usunięcia, nie do konwersji.

### §B4 — pasmo czasów w zegarze GRACZA (zmierzone) i skala partii

| lata wyświetlane | co | stan |
|---|---|---|
| 15 | `AI_ENVOY_COOLDOWN` (odstęp delegacji AI) | żywe |
| 10 | `TRUCE_YEARS` (rozejm) · `ERRATIC_EPOCH_YEARS` (epoka humoru) | żywe |
| **7,33** | ślad po wojnie `recent_war` — **wariant (b)** | po E6 |
| **4,58** | dobra wola z emisariusza — **wariant (b)** | po E6 |
| 3 | `ULTIMATUM_GRACE_YEARS` | żywe |
| 2 | `RECENT_REFUSAL_YEARS` · `PEACE_QUIET_YEARS` | żywe |
| **0,67** | ślad po wojnie `recent_war` — **DZIŚ / wariant (a)** | dziś MARTWE (flaga OFF) |
| **0,42** | dobra wola z emisariusza — **DZIŚ / wariant (a)** | dziś MARTWE (flaga OFF) |

**Skala partii:** przebiegi botów w BALANS to **400 lat cyw. = 33 lata wyświetlane**
(`test-rule-bot` / `test-mcts-bot` / `test-detectors`; `test-random-bot` 200 = 16,7), a realny zapis
gracza z tego repo stoi na **roku 39** (`kosmos_..._r39_v90.json`). Czyli partia = **~30–40 lat
wyświetlanych**. W tej skali wariant (a) daje modyfikatorom 0,5–4% partii, wariant (b) 4–44% —
a KAŻDA stała, którą ktoś w tej fazie napisał świadomie, siedzi w pasmie 2–15 lat wyświetlanych.

### §B5 — test spójności, który rozstrzyga: dwie nogi emisariusza (zmierzone)

Misja emisariusza jest abstrakcyjna i trwa **5,0 lat wyświetlanych**: dotarcie w +2,5 (+5 opinii),
powrót w +5,0 (kolejne +5, tryb `accumulate`). `MissionSystem:52` obiecuje „tryb accumulate sumuje
je do +10". Odstęp między nogami: **2,5 roku wyświetlanego**.

| tempo | noga 1 w chwili powrotu | suma po obu nogach |
|---|---|---|
| DZIŚ (flaga ON) | **WYGASŁA** | **+5** — obietnica +10 niedowieziona |
| **(a)** tempo ×12 | **WYGASŁA** | **+5** — obietnica +10 niedowieziona |
| **(b)** bez zmian | **ŻYJE (+2,5)** | **+7,5** — nogi się SUMUJĄ, decay bierze swoje |

⚠ **Przy tempie (a) tryb `accumulate` jest arytmetycznie martwy dla emisariusza:** wkład każdej nogi
wygasa przed przybyciem następnej, więc „sumowanie" nie ma czego sumować — i to samo dotyczy dwóch
kolejnych MISJI (5 lat wyświetlanych odstępu przy życiu 0,42). Dokładnie ta obawa kazała D1 trzymać
flagę wyłączoną („emisariusze przestają wystarczać do sojuszu"); (b) ją usuwa, (a) zatwierdza.
ℹ Nawet (b) nie dowozi literalnych +10 (decay zjada 2,5 w czasie drogi powrotnej) — to jest POPRAWNE
zachowanie, ale komentarz `MissionSystem:52` („jak dotąd") przestaje być prawdziwy z chwilą zapalenia
flagi i w E6 wymaga sprostowania.

---

## Rekomendacja E6 — DO PODPISU (jedna decyzja)

**Mechanika unifikacji (bez wariantów):** kadencja ticku dyplomacji ZOSTAJE 1 rok cyw. — zmienia się
tylko JEDNOSTKA `dy` podawana konsumentom temp: `steps / CIV_TIME_SCALE` zamiast `steps`. Dzięki temu
rozdzielczość zostaje drobna (dt = 1/12 roku wyświetlanego), a `_tickTrespassing` / `_tickUltimatumExpiry`
/ `_tickTruces` (już na zegarze wyświetlanym) nie tracą reaktywności. Wzór z repo:
`DepositReadoutLogic` — dzielenie przez `CIV_TIME_SCALE` w czystym module ze skalą wstrzykniętą
przez `opts` (nie w widoku).

**Rekomendacja tempa — PODZIAŁ wzdłuż linii „żywe vs martwe", bo tak wypadł pomiar:**

1. **Mechanizmy ŻYWE dziś → tempo ×12 (odczuwalne tempo IDENTYCZNE).** `trade_partner.rampPerYear`
   1 → 12, `PEACE_DECAY` 5 → 60. Zmierzona tożsamość: 4,167 = 4,167 i 0,5 = 0,5 roku wyświetlanego
   (§B2). Klasa 3 (już wyświetlane, żywe) — **wartości nietknięte**, poprawiamy wyłącznie kłamiące
   komentarze.
2. **Mechanizmy MARTWE dziś (za flagą) → cyfry zostają, jednostką staje się rok wyświetlany.**
   Siedem `decayPerYear` w `OPINION_MODIFIERS` + `DEFAULT_AGGRESSION_DECAY`. Efekt zmierzony:
   życia 1,33–14,75 roku wyświetlanego (§B1), czyli **to samo pasmo, w którym siedzi każda świadomie
   napisana stała tej fazy** (2–15, §B4), plus działający `accumulate` emisariusza (§B5).
3. **`ERRATIC_EPOCH_YEARS` zostaje 10** — jest już w latach wyświetlanych, jest ŻYWA, a E5 przeszło
   gate z tą wartością. Zmierzone: przy epoce 10 partia 33–40 lat daje 3–4 zmiany humoru; liczba
   referencyjna z gate'u E5 (rok 0) przeżyłaby każdą zmianę epoki (`floor(0/10) = floor(0/3) = 0`),
   więc strojenie tej gałki jest bezpieczne — ale należy do BALANS/D4, nie do E6, żeby gate E6 miał
   jedną zmienną mniej.
4. **UI:** `diplo.fadesIn` podaje jednostkę w obu językach, z zachowanym `{0}` (pinowane przez
   `diplomacy_overlay_breakdown_smoke:195`; `check-i18n` sprawdza WYŁĄCZNIE istnienie klucza, nie
   placeholdery — więc pin w smoke jest tu jedyną realną bramką). Wzór nazewnictwa:
   `colonyInfo.depositEtaUnit` (komentarz przy kluczu nazywa zegar).

**Dlaczego nie (a) w całości:** bo (a) opisuje tempo, którego gra nigdy nie pokazała (§B0 — dziś nic
nie zanika), zabija etykietę (`ceil` = 1 dla wszystkich siedmiu wpisów, §B1), rozjeżdża decay z każdą
świadomie napisaną stałą o rząd wielkości (§B4) i zatwierdza arytmetycznie martwy `accumulate` (§B5).
**Dlaczego nie (b) w całości:** bo (b) na `PEACE_DECAY` i rampie to REALNE 12× zwolnienie mechanizmów,
które dziś żyją i których tempa nikt nie zgłosił jako problem — czyli dokładnie ta niejawna zmiana
balansu, przed którą decyzja 3 miała chronić.

### ⚠ Kolizja z podpisaną decyzją 3 i jej ZAWĘŻENIE (precedens: decyzja 6)

Decyzja 3 brzmi: „zapalić BEZ zmiany ODCZUWALNEGO tempa, zmierzyć, potem stroić". Czytana globalnie
nakazuje (a) dla wszystkiego. Pomiar §B0 pokazuje, że dla temp bramkowanych flagą ta lektura jest
**pusta**: ich dzisiejsze odczuwalne tempo to ∞, więc (a) też go NIE zachowuje — zachowuje tempo,
którego zaszyty build nigdy nie wykonał. Zgodnie z precedensem z decyzji 6 (kotwica parytetu E5)
własność nie zostaje poluzowana, tylko **zawężona do punktu odniesienia, który nadal jej dowodzi**:

> **Decyzja 3 (ZAWĘŻONA — do podpisu):** flip nie może zmienić odczuwalnego tempa żadnego mechanizmu
> dyplomacji **OBSERWOWALNEGO w zaszytym buildzie**. Punkty odniesienia, oba zmierzone jako identyczne
> przed i po: `trade_partner` ramp 0→+50 (**4,167** roku wyświetlanego) i decay napięcia 30→0
> (**0,5** roku wyświetlanego). Mechanizmy, które flaga trzyma dziś w ciemności, nie mają
> odczuwalnego tempa do zachowania — ich tempo jest ustalane RAZ, świadomie, w tym commicie, i pinowane
> pomiarem (tabela §B1 wchodzi do smoke jako oczekiwanie).

Zakaz, po który decyzja 3 była pisana, zostaje w mocy: żadna cicha zmiana tempa nie przechodzi pod
przykrywką konwersji jednostek — a to, co się zmienia, jest wymienione z liczbą przed i po.

### Konsekwencje dla testów (ZMIERZONE, nie przewidziane)

Różnicowy przebieg wszystkich **110** suite'ów, każdy dwa razy (flaga wstrzyknięta false vs true):
**dokładnie DWA** zmieniają wynik. Reszta 108 jest obojętna — w tym `diplomacy_d1_smoke` **83/83
w obie strony** (blok D4 ustawia flagę jawnie, więc kontrakt „obie gałęzie" przeżywa flip domyślnej
wartości — dokładnie jak wymaga plan), `acceptance_engine` 206/206, `diplomacy_opinion` 85/85,
`balans_diplomacy_telemetry` 54/54, `diplomacy_migration_v100` 57/57, `empire_objective` 30/30.

1. **`diplomacy_model_smoke` M10** czyta ZASZYTĄ domyślną (plik nie ustawia flagi przed linią 232)
   i asertuje `false`; po flipie ta asercja pada, a dwie linie dalej suite **twardo się wywala**
   (`TypeError` na `.find(...).value` po wygasłym wpisie, bez linii podsumowania ⇒ w sweepie
   „exit 1 (crash przed podsumowaniem)"). Naprawa: gałąź OFF ustawia flagę jawnie (wzór D4), a pin
   zaszytej domyślnej mówi prawdę o nowej wartości.
2. **`diplomacy_overlay_breakdown_smoke`** (36 asercji, NIE było na liście siedmiu w §Tests) nigdzie
   nie wspomina o `FEATURES`; jego fixture robi `tickModifiers(12)` po ramp, co przy decayu ON kasuje
   pięć krótkich modyfikatorów i zwija stos 7 → 2, wywracając trzy asercje layoutu („limit 5 +
   «+2 więcej»"). Naprawa: test layoutu UI pinuje flagę, której potrzebuje (precedens: trzy suite'y
   `acceptance_*` już to robią w nagłówku).

§Tests fazy trzeba więc rozszerzyć o `diplomacy_overlay_breakdown_smoke` — plan go nie wymieniał,
a jest flip-czuły.
