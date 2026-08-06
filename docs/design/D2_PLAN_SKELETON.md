# PHASE D2 — Acceptance Engine + retrofit · plan SKELETON (draft, pre-gate)

**Status:** DRAFT — nie zatwierdzony, nie zacommitowany. Powstał podczas HOLD na live-gate D1.
**Arc:** WOJNA I POKÓJ 1.0 · **Parent:** `DIPLOMACY_BACKBONE.md` §2 + §5 (Phase D2)
**Zależy od:** D1 zamknięty live-gate'em (`docs/design/D1_LIVE_GATE_CHECKLIST.md`)
**Basis:** `docs/audit/COMBAT_DIPLO_AUDIT.md` §4.5 (tabela „always yes"), R2, R5

> Skeleton = kształt fazy, znane szwy, decyzje do podjęcia i ryzyka. Pełny plan (z tabelami
> wag i rozbiciem na commity co do pliku) powstaje PO gate'cie D1, kiedy będzie wiadomo,
> czy parytet się utrzymał.

---

## 0. Cel fazy

Koniec „always yes". Jeden evaluator dla KAŻDEJ propozycji, w obu kierunkach, z rozbiciem
widocznym dla gracza. D1 dał dane; D2 daje **decyzję**.

Kontrast z D1: **D2 JAWNIE zmienia zachowanie.** Reguła fazy jest odwrotna — każda zmiana
wyniku musi być zamierzona, zmierzona (macierze akceptacji w harnessie) i opisana.

---

## 1. Sześć akcji do retrofitu (audyt §4.5)

| # | akcja | stan dziś | co robi D2 |
|---|---|---|---|
| 1 | Wypowiedz wojnę | ✅ poprawnie jednostronna | bez zmian w D2 (CB + reputacja = **D4**) |
| 2 | **Zaproponuj pokój** | 🔴 **brak sprawdzenia** — `offerPeace` ustawia rozejm bezwarunkowo | pierwszy w historii szew oceny; konsumuje `casusBelli.peaceCost` (dziś martwy) + exhaustion + relative_power |
| 3 | **Wyślij emisariusza** | 🔴 **brak sprawdzenia** — `_launchEnvoy` waliduje tylko stronę gracza | cel MOŻE odmówić (i wtedy statek wraca bez efektu) |
| 4 | Umowa handlowa | ✅ próg `trade ≥ 0.5 && trustEq ≥ 60` | przez engine (`opinion`, `personality`, `objective`, `third_party`) |
| 5 | Pakt o nieagresji | ✅ próg `aggression ≤ 0.4 && trustEq ≥ 75` | j.w. + `tension` ze znakiem DODATNIM (napięcie SPRZYJA paktowi) |
| 6 | Sojusz | ✅ próg `aggression ≤ 0.3 && trustEq ≥ 80` | j.w. + `tension` ze znakiem UJEMNYM (napięcie SZKODZI sojuszowi) |

Plus siódma ścieżka, po stronie AI: `WarSystem._triggerAutoPeace` (exhaustion ≥ 100) — dziś
bezwarunkowy bypass, w D2 przechodzi przez engine, gdzie exhaustion jest wielkim TERMEM, a nie obejściem.

**Szwy w kodzie:**
- `DiplomacySystem.proposeTreaty` — jedyny istniejący choke point; jego inline'owe progi 60/75/80 znikają.
- `DiplomacySystem.offerPeace` — szwu NIE MA, trzeba go wprowadzić.
- `MissionSystem._launchEnvoy` — szwu NIE MA; uwaga: envoy jest ABSTRAKCYJNY (bez lotu), więc
  odmowa musi mieć sensowną fikcję („delegacja nie została przyjęta").
- `WarSystem._triggerAutoPeace` — zamienić bypass na wywołanie engine'u.

**Do usunięcia razem z engine'em:** mostek `getTrustEquivalent` — **dokładnie 3 wywołania**
(`proposeTreaty`, bramka AI-envoy w `AlienCivSystem`, bramki przycisków w `DiplomacyOverlay`).
Zniknięcie wszystkich trzech jest warunkiem zamknięcia D2.

---

## 2. Silnik — kształt

```js
evaluateProposal(fromId, toId, proposal) → {
  score, decision, breakdown: [{ term, label, value }], counterHint,
}
```
Term = czysta funkcja `(ctx, proposal) → {value, label}`. Czasownik wybiera termy i wagi;
archetyp + **objective** (z C3, dotąd bez konsumentów) nadpisują wagi.

Termy z backbone §2.1: `opinion` · `tension` (**znak zależny od czasownika**) · `relative_power` ·
`war_status` · `personality` · `reputation` · `offer` · `memory` · `recent_refusal` · `third_party` ·
`erratic_noise`.

**Reuse z D1 — nie budować od nowa:**
- `getOpinion` / `getOpinionBreakdown` → term `opinion` dosłownie.
- `getMemory(id, N)` → term `memory` (dowody; ten sam pierścień, z którego `inferCasusBelli` bierze okno 10).
- `getReputation` → term `reputation` (ledger istnieje i zanika; **nic go jeszcze nie podnosi** — raisery w D4,
  więc w D2 term jest strukturalnie gotowy ale liczbowo martwy; nie udawać, że działa).
- `OPINION_MODIFIERS` jako wzór dla katalogu wag: dane w `src/data/`, matematyka w `src/utils/`,
  stan w systemie. Rozbicie akceptacji budować helperem-bliźniakiem `buildBreakdown`.

---

## 3. Struktura commitów (propozycja, do domknięcia po gate'cie)

| # | commit | dlaczego osobno |
|---|---|---|
| **E1** | Engine + katalog termów + wagi (czysta logika, ZERO wpięć) + smoke | stoi samodzielnie, jak C1 w D1 |
| **E2** | Retrofit 3 traktatów (`proposeTreaty` → engine), usunięcie 1. z 3 wywołań mostka | pierwszy realny retrofit, ale wynik ma być ≈ dzisiejszy (progi przeliczone na wagi) |
| **E3** | **Pokój i emisariusz dostają pierwsze w historii sprawdzenie** + auto-peace przez engine | TU zmienia się rozgrywka; własny gate |
| **E4** | UI odmowy z rozbiciem + term `recent_refusal` (koniec spamowania przyciskiem) | UI + jedna mechanika |
| **E5** | `objective` jako nadpisania wag + rzut `traits: ['erratic']` + term `erratic_noise` | pierwsi konsumenci osi z C3 |
| **E6** | **Flip `FEATURES.diplomacyDecay` → true** | ⚠ osobny commit, osobny gate — patrz §4 |
| **E7** | `DiplomacyTelemetry` + `Report` + wpis w rejestrze `METRICS` launchera | instrument, nie mechanika |
| **E8** | Przeniesione z D1: bramka `ownerEmpireId` w `_onColonyFounded` | fix zachowania, w D1 świadomie odłożony |

---

## 4. Flip flagi zanikania — własny commit i własny gate (E6)

Najbardziej ryzykowna pojedyncza zmiana w D2, dlatego **nie wolno jej wpleść w żaden inny commit**.

Co się dzieje po zapaleniu `FEATURES.diplomacyDecay = true`:
- `envoy_goodwill` (1/rok) — +5 znika w ~5 lat cyw. ⇒ **emisariusze przestają być drogą do sojuszu**
  (dziś, przy decayu OFF, trzy misje = +30 i to zostaje).
- `legacy_relations` (2/rok) — kapitał dyplomatyczny ze STARYCH zapisów drenuje w ~15–25 lat cyw.
- Kary (`military_presence`, `research_intrusion`, `trespassing`, 2/rok) — przestają być wieczne;
  gracz może „odczekać" swoje przewinienia.
- `recent_war` (2/rok) — ślad po wojnie wreszcie blaknie.
- `trade_partner` — **bez zmian** (ramp nigdy nie był bramkowany flagą; persistent).
- `ReputationLedger.tick` — zanikanie agresji rusza (w praktyce no-op do D4, bo nic jej nie podnosi).

Uzbrojenie potrzasku: **`DIPLOMACY_FROZEN` w `BottleneckDetector` jest bramkowany tą samą flagą** i
zapala się razem z nią. Oba stany flagi są przypięte w `diplomacy_d1_smoke` (blok D4) — te asercje
MUSZĄ przeżyć flip (zmienia się tylko domyślna wartość, nie kontrakt).

**Decyzja do podjęcia:** czy flip idzie z REKALIBRACJĄ tempa (np. `envoy_goodwill` 1 → 0.5/rok, żeby
emisariusze dalej miały sens jako inwestycja), czy zapalamy tempa „jak w katalogu" i strojymy dopiero
po pomiarze z E7. **Rekomendacja: zapalić bez zmian, zmierzyć, potem stroić** — inaczej stroimy w ciemno,
a katalog jest jednym miejscem, więc korekta jest tania.

---

## 5. `threatened_by_you` — decyzja o wpięciu (i o skasowaniu)

Wpis siedzi w katalogu **nieuwiązany** (decyzja D1). W D2 trzeba wybrać JEDNO z dwóch — nie oba:

**(A) Term `tension` w engine** (zalecane wstępnie). Napięcie wchodzi do akceptacji BEZPOŚREDNIO,
ze znakiem zależnym od czasownika (sprzyja paktowi/pokojowi, szkodzi sojuszowi). Czysto, bez sprzężenia
zwrotnego, i naturalnie tłumaczy różnicę „opinia to co o nas myślą, napięcie to jak blisko wojny".

**(B) Modyfikator `threatened_by_you`** (−10 przy napięciu > 60, odświeżany w ticku). Widoczny w
rozbiciu opinii w panelu, czyli lepszy dla GRACZA — „czują się zagrożeni" to zrozumiały komunikat.

⚠ **Trzymanie obu = podwójne liczenie**: napięcie wchodziłoby do wyniku raz jako term, a raz przez
opinię, która sama jest termem. Jeśli wygra (A), wpis `threatened_by_you` w `OPINION_MODIFIERS`
i jego dwa klucze i18n (`diplo.mod.threatenedByYou` w pl i en) **stają się martwe i należy je usunąć** —
to jest ta „candidate for removal if tension term suffices" przeniesiona z D1. Nie zostawiać martwego
wpisu w katalogu (audyt R9: martwe dane czytają się jak zaimplementowana funkcja).

Wariant kompromisowy, jeśli (A) wygra mechanicznie ale (B) wygra komunikacyjnie: **term `tension`
liczy wynik, a panel dorysowuje wiersz informacyjny „Czują się zagrożeni" w rozbiciu AKCEPTACJI**
(nie opinii) — jeden wynik, dwa czytelne miejsca, zero podwójnego liczenia.

---

## 5a. UNIFIKACJA JEDNOSTEK CZASU — REGUŁA TWARDA (decyzja Filipa, live-gate D1)

Dyplomacja miesza dziś dwie jednostki, i to **wewnątrz jednej funkcji**:

| stała | jednostka DZIŚ | gdzie |
|---|---|---|
| `truceUntilYear` (rozejm 10) | lata **WYŚWIETLANE** (`gameTime`) | `offerPeace`, migracja v100 |
| `PEACE_QUIET_YEARS` (2) | lata **WYŚWIETLANE** (porównanie z `_year()`) | `_tickTensionDecay` |
| `ULTIMATUM_GRACE_YEARS` (3) | lata **WYŚWIETLANE** | `_tickUltimatumExpiry` |
| `PEACE_DECAY` (−5) | na rok **CYWILIZACYJNY** (tick dostaje `civDy`) | `_tickTensionDecay` — ta sama funkcja co wyżej! |
| `decayPerYear` modyfikatorów, `rampPerYear` | na rok **CYWILIZACYJNY** | `RelationsModel.tickModifiers` |

Przelicznik: `CIV_TIME_SCALE = 12` → 1 rok wyświetlany = 12 lat cyw.

**Decyzja: D2 ujednolica WSZYSTKIE stałe czasowe dyplomacji do LAT WYŚWIETLANYCH** (spójnie z regułą
raportowania BALANS), **z przestrojeniem wartości w tym samym przebiegu**. Naiwne przeliczenie tempa
decayu napięcia daje **−60 na rok wyświetlany** — prawie na pewno za szybko; to gałka do strojenia,
nie mechaniczna konwersja.

Zakres: stałe + `RelationsModel.tickModifiers` (dziś dostaje `civDy`) + `OPINION_MODIFIERS`
(`decayPerYear`, `rampPerYear`, `rampMax` do przeliczenia) + **etykieta UI**: `diplo.fadesIn`
(„zanika za N l.") musi po ujednoliceniu MÓWIĆ, o jakie lata chodzi, w obu językach.

⚠ To NIE była zmiana D1 — D1 poprawnie zachował zachowanie sprzed D1. **Ląduje razem z flipem flagi
zanikania (E6)**, bo obie rzeczy ruszają to samo tempo i jeden gate powinien je ocenić łącznie.
Testy do zaktualizowania: `diplomacy_opinion_smoke` (krzywe decayu/rampu), `diplomacy_d1_smoke`
D3/D4 (cykl rozejmu, obie gałęzie flagi), `diplomacy_model_smoke` M10.

## 6. `relative_power` — blokada, którą trzeba świadomie rozbroić (audyt R2)

Term `relative_power` potrzebuje oceny siły gracza. Dziś oba estymatory są **zepsute identycznie**:

```js
v.modules.some(m => /weapon_|armor_|shield_/.test(m?.id ?? ''))
```

`vessel.modules` jest `string[]`, więc `m?.id` = `undefined`, regex testuje `''` → **zawsze false**.
Kopie: `UtilityAI.estimatePlayerMilitary` i `AlienCivSystem._estimatePlayerMilitary`.

**Naprawa ZMIENIA istniejące zachowanie FSM**: `milRatio` skacze z ~0 na realne wartości, co może od
razu wepchnąć imperia w `AGGRESSIVE`/`WAR`. Dlatego:

**Decyzja:** czy `relative_power` wchodzi do D2 (i ciągnie za sobą naprawę R2 + rekalibrację progów FSM),
czy term ląduje w E1 jako **stub zwracający 0 z jawnym `PHASE_TODO`**, a naprawa R2 idzie do WAR_BACKBONE
razem z threat assessment (gdzie i tak jest zaplanowana jako „one shared module read by both war and
diplomacy"). **Rekomendacja: stub w D2, naprawa w WAR_BACKBONE** — inaczej D2 wchłania reformę AI
militarnego i przestaje być fazą o dyplomacji. Jeden estymator dla wojny i dyplomacji to cel
WAR_BACKBONE §4, nie D2.

---

## 7. `recent_refusal` — gdzie trzymać stan (pytanie o save)

Term wymaga pamięci „właśnie odmówiliśmy" (−20 na 2 lata, per para per czasownik).

- **NIE** jako modyfikator opinii — opinia jest już termem, byłoby podwójne liczenie (jak w §5).
- Propozycja: `verbCooldowns: { [verbId]: year }` na rekordzie pary.
- **Czy potrzebny bump save v100 → v101?** Prawdopodobnie **nie**: `GameState.restore` bierze
  `diplomacy` w całości, więc stare rekordy wrócą bez tego pola, a odczyt z `?? {}` to załatwia —
  dokładnie ten sam wzór, co `bordersOpen` w D1. Do potwierdzenia przy pisaniu pełnego planu; jeśli
  cokolwiek innego w D2 dotknie kształtu zapisu, i tak wypada zrobić jeden bump na całą fazę.

---

## 8. Harness — `DiplomacyTelemetry` + `Report` (E7)

Pierwsza para telemetria+raport w tym arcu (BALANS ma pięć: POP / RESOURCES / ROI / PRICES / AI).

**Wzór do skopiowania:** `src/testing/headless/AiTelemetry.js` + `balans-ai-telemetry.mjs` +
`balans_ai_telemetry_smoke.mjs`. Dodanie metryki = **jeden wpis w rejestrze `METRICS`** w
`balans-launcher.mjs`; kontraktem jest `prefix` i to, że runner przyjmuje `--class/--seeds/--gy`
i zapisuje `<prefix>-report-<CLASS>.html` do `REPORTS_DIR`.

**Artefakt docelowy: macierze akceptacji** — tabela `archetyp × objective × czasownik` z odsetkiem
akceptacji przy ustalonych warunkach (opinia, napięcie, siła). To jest instrument strojenia wag, więc
musi być czytelny jako TABELA, nie jako wykres.

Do mierzenia dodatkowo: rozkład `score` wokół progu (ile decyzji jest „na styk"), udział odmów z
`recent_refusal` (czy term nie blokuje gry), liczba wojen z drabiny vs z decyzji AI.

**Uwaga o metryce:** `DIPLOMACY_DEAD` opiera się na `maxTension`; po E3/E6 może zacząć się zapalać z
INNEGO powodu niż dotąd (napięcie rośnie, ale wojen nie ma, bo pokój jest łatwy). Przy E7 sprawdzić,
czy detektor nie zmienił znaczenia.

---

## 9. Przeniesione z D1

- **`_onColonyFounded` bez bramki `ownerEmpireId`** (E8). Kiedy AI zakłada kolonię w układzie INNEGO
  imperium, właściciel układu dostaje +30 napięcia **na gracza**, z powodem
  `player_colony_in_their_space`. W D1 świadomie nietknięte (to zmiana zachowania), a D1 dodatkowo
  uwidocznił błąd, bo incydent trafia teraz do czytelnej dla gracza listy pamięci. Fix: sprawdzić
  `colony.ownerEmpireId` i przy koloni AI albo pominąć, albo (docelowo, D5) zapisać napięcie na
  parze AI↔AI. Do decyzji: pominąć w D2, czy od razu przygotować ścieżkę AI↔AI.
- **`threatened_by_you` jako kandydat do usunięcia** — patrz §5.
- **Wycofanie `kosmos_save_backup_v{N}` z localStorage** (odroczone świadomie). Po wprowadzeniu
  kopii przedmigracyjnej DO PLIKU (`TitleScene._offerPreMigrationBackup`, przed gate'em D1) te klucze
  mają **zero czytelników w grze** (odzysk = DevTools), a każdy waży tyle co cały zapis — czyli zjadają
  dokładnie ten headroom quoty, przed którym ostrzega sekcja o localStorage w `CLAUDE.md` (gracz miał
  kiedyś 9 backupów = 4,4 MB). Zadanie osobne, **po** tym jak backup plikowy udowodni się w praktyce:
  usunąć zapis backupu w `migrate()` (`SaveMigration.js:221-226`), zostawić samo
  `pruneMigrationBackups()` jako sprzątanie po starych wersjach, i sprawdzić `save_file_smoke` T8
  (dziś pinuje prune). Nie łączyć z żadnym commitem D2 — to zmiana w ścieżce ratunkowej.

---

## 10. Ryzyka wstępne

| # | ryzyko | wstępne przeciwdziałanie |
|---|---|---|
| 1 | **E3 wywraca rozgrywkę** — pokój przestaje być darmowy, więc wojna może stać się nieodwracalna | macierze akceptacji z E7 PRZED strojeniem; `peaceCost` z `CasusBelliData` jako pierwsza gałka; osobny gate |
| 2 | **Podwójne liczenie napięcia** (§5) i opinii (§7) | jedna reguła: co jest TERMEM, nie może być jednocześnie modyfikatorem opinii; przypiąć asercją |
| 3 | **Naprawa R2 wchłania fazę** (§6) | term jako stub, naprawa w WAR_BACKBONE |
| 4 | **Flip decayu zmiesza się z retrofitem** i nie da się rozdzielić przyczyn regresji | E6 osobno, po E1–E5, z własnym gate'em |
| 5 | Strojenie wag bez pomiaru | E7 może wejść WCZEŚNIEJ niż numer sugeruje, jeśli E2/E3 wymagają liczb |
| 6 | Mostek `getTrustEquivalent` przeżyje fazę | warunek zamknięcia D2: `grep -rn "getTrustEquivalent" src/` puste |

---

## 11. Pytania do Filipa (przed pełnym planem)

1. **§5** — `tension` jako term (A), modyfikator `threatened_by_you` (B), czy kompromis
   (term liczy, panel pokazuje)? Od tego zależy, czy kasujemy wpis z katalogu i dwa klucze i18n.
2. **§6** — `relative_power` jako stub w D2 (rekomendacja) czy naprawa R2 w tej fazie?
3. **§4** — flip decayu „jak w katalogu" i strojenie po pomiarze (rekomendacja), czy od razu z rekalibracją tempa?
4. **§1** — odmowa emisariusza: statek wraca bez efektu, czy zostaje odesłany szybciej (i czy w ogóle
   gracz ma to widzieć jako osobne zdarzenie w Dzienniku)?
5. **§9** — `_onColonyFounded`: pominąć kolonie AI, czy od razu budować ścieżkę napięcia AI↔AI (D5)?
