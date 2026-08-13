# W1 / GATE 1 — liczby zagrożenia i żywy `relative_power` · checklista live

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** B · **Slice:** W1 · **Commit:** `9342aa3` (W1-3)
**Poprzedzają:** `ee189ba` (W1-0) · `1e67adf` (W1-1) · `aad2f99` (W1-2)
**Zapis:** v100, **bez zmian modelu zapisu** · **Sweep:** 126/126 OK, 0 FAIL · **check-i18n:** PASS

---

## Zasady przebiegu (wszystkie kupione błędem — obowiązują)

- **NIE uruchamiaj gate'u równolegle z pracą CC.**
- Każdy jednolinijkowiec poniżej **został WYKONANY na żywym silniku** przed wpisaniem tutaj
  (memory `validate-gate-oneliners-on-live-engine`). Dwa z nich w pierwszej wersji **NIE DZIAŁAŁY**:
  `intelSystem.setLevel` nie istnieje (poprawne: `advanceIntel`), a sprawdzenie dominacji wymaga
  **czystego układu** — dlatego G3 zaczyna się od świeżej partii.
- **Bez wieloliniowego kodu w blokach cytowanych.** Jedna linia = jedno wklejenie do konsoli.
- `DebugLog` to bufor pierścieniowy **czyszczony przy przeładowaniu**.
- Stan zmieniaj **wyłącznie** narzędziami z `KOSMOS.debug`.

---

## ⚠ WYBÓR IMPERIUM — przeczytaj PRZED G2 i G4 (poprawka po przebiegu 2026-08-14)

`KOSMOS.debug.spawnEnemyAttack(...)` tworzy `emp_test_enemy`, które **jest W STANIE WOJNY z definicji**.
To imperium nadaje się do **G1 i G3** (ma flotę, leci na gracza) i **NIE nadaje się do G4**:
`evaluateProposal` zwróci wtedy `blocked: diplo.reject.atWar` z **pustym `breakdown`** — poprawne
zachowanie D2 (podczas wojny nie negocjuje się traktatów), ale wygląda jak brak wiersza `relative_power`.
Pierwszy przebieg gate'u stracił na tym czas.

**Zawsze zacznij G2 i G4 od wskazania imperium, które (a) ma siłę > 0 i (b) NIE jest w stanie wojny:**

```
KOSMOS.empireRegistry.listAll().map(e => [e.id, KOSMOS.threatAssessment.getStrength(e.id), KOSMOS.diplomacySystem.getStatus(e.id)])
```
Wybierz wpis z **siłą > 0** i statusem **`peace`**. Jeśli takiego nie ma — najpierw doprowadź do kontaktu
z imperium, które ma flotę (albo poczekaj, aż AI zbuduje okręty), i dopiero wtedy rób G2/G4.

---

## Przygotowanie

1. Odpal grę (Live Server), **Nowa gra**, scenariusz „Cywilizacja". Poczekaj, aż wejdziesz w tryb 4X.
2. Otwórz konsolę (F12).
3. Sprawdź, że moduł w ogóle jest wpięty:

```
!!KOSMOS.threatAssessment
```
**Oczekiwane:** `true`. Jeśli `false` — STOP, błąd wpięcia, nie testuj dalej.

---

## G1 — odczyty siły są NIEZEROWE i SENSOWNE

Potrzebny wrogi okręt. Najprościej — cheat debugowy:

```
KOSMOS.debug.spawnEnemyAttack({ etaYears: 20 })
```

Potem:

```
[...KOSMOS.threatAssessment.getAllStrengths()]
```
**Oczekiwane:** tablica par `[właściciel, liczba]`, np. `[["emp_001", 744]]`. Liczby w skali HP —
goła fregata ≈ 156, bojowa ≈ 248, krążownik ≈ 413. **Nie mogą** to być zera dla imperium, które ma okręty.

```
KOSMOS.threatAssessment.getPlayerStrength()
```
**Oczekiwane:** 0 na starcie (gracz nie ma okrętów bojowych) — i **rośnie**, gdy zbudujesz okręt z bronią.

**⚠ Test „sensowności" (rdzeń G1):** imperium z trzema fregatami MUSI stać wyżej niż imperium bez okrętów.
Jeśli masz dwa imperia w kontakcie:

```
KOSMOS.empireRegistry.listAll().map(e => [e.id, KOSMOS.threatAssessment.getStrength(e.id)])
```
**Oczekiwane:** imperium z widocznymi okrętami ma wartość > 0, imperium bez nich ma dokładnie 0.

- [ ] wartości niezerowe dla imperium z flotą
- [ ] imperium z większą flotą ma **wyższą** liczbę
- [ ] `getPlayerStrength()` rośnie po zbudowaniu własnego okrętu z bronią

---

## G2 — panel intelu przestaje pokazywać „Siła wojskowa ≈ 0"

⚠ **Najpierw wybierz imperium wg sekcji „WYBÓR IMPERIUM" wyżej** (siła > 0, status `peace`).
Poniższe jednolinijkowce biorą pierwsze imperium z rejestru — jeśli to `emp_test_enemy`, podstaw
ręcznie właściwe id zamiast `KOSMOS.empireRegistry.listAll()[0].id`.

Podnieś intel do `detailed` (poziom, na którym gra ujawnia siłę):

```
KOSMOS.intelSystem.advanceIntel(KOSMOS.empireRegistry.listAll()[0].id, 'detailed', 'gate1')
```
**Oczekiwane:** `true`.

```
KOSMOS.gameState.get('intel.' + KOSMOS.empireRegistry.listAll()[0].id).knownMilitary
```
**Oczekiwane:** liczba **> 0** (np. `744`). Przed W1-3 było tu **zawsze 0**, dla każdego imperium.

Następnie otwórz panel intelu (klawisz **I**) i znajdź to imperium.

- [ ] `knownMilitary` w stanie gry to liczba > 0
- [ ] panel **I** pokazuje pasek/liczbę siły, a nie „≈ 0"
- [ ] imperium BEZ okrętów nadal pokazuje 0 (to poprawne, nie regresja)

**W1-3c — nowy wiersz w tym samym bloku:** pod paskiem siły panel pokazuje teraz **„Układ sił"**
(np. `są silniejsi (+200%)` / `równowaga` / `miażdżysz ich (+300%)`) oraz `twoja siła: N`.
To jest CIĄGŁY odczyt strategiczny — odpowiada na pytanie „czy mam z czym prosić" **przed** decyzją,
a nie dopiero w rozbiciu odmowy. Ta sama bramka intelu (`detailed`), te same dane.

- [ ] wiersz „Układ sił" widoczny przy intel `detailed`
- [ ] kolor zgadza się z sensem (zielony = przewaga gracza, czerwony = przewaga AI, szary = równowaga)
- [ ] po zbudowaniu własnej floty odczyt **przesuwa się na korzyść gracza** (bez przeładowania gry)
- [ ] imperium BEZ rozpoznania `detailed` nadal nie pokazuje ani siły, ani układu sił

---

## G3 — wrogi okręt na orbicie ODBIERA dominację orbitalną (V22)

⚠ **Zacznij od czystego układu** — sprawdzenie działa **na poziomie UKŁADU**, nie pojedynczej orbity
(taka była też stara semantyka), więc dowolny wrogi okręt w `sys_home` odbiera dominację.

```
KOSMOS.warSystem.playerHasOrbitalDominance(KOSMOS.homePlanet.id)
```
**Oczekiwane PRZED:** `true` (nikogo wrogiego w układzie).

Teraz wpuść wrogi okręt (`spawnEnemyAttack` jak w G1) i **poczekaj, aż doleci** (ETA widoczna w rejestrze floty).
Po jego przybyciu powtórz to samo wywołanie.

**Oczekiwane PO:** `false`.

Zweryfikowane headless — pełna sekwencja: `true` → (wrogi **bezbronny** transportowiec) `true`
→ (wrogi **uzbrojony** okręt) **`false`** → (po zestrzeleniu, wrak) `true`.

- [ ] przed przylotem: `true`
- [ ] po przylocie uzbrojonego wroga: `false`
- [ ] **UI desantu** (ColonyOverlay, tryb zrzutu / uderzenie orbitalne) jest **zablokowane**, gdy powyższe daje `false`
- [ ] po zniszczeniu wroga wraca `true`

---

## G4 — wiersz `relative_power` w rozbiciu akceptacji

⚠ **ZERO: wybierz imperium NIE-W-WOJNIE** (sekcja „WYBÓR IMPERIUM" wyżej). Na imperium w stanie
wojny — a takim JEST `emp_test_enemy` z `spawnEnemyAttack` — `evaluateProposal` zwraca
`blocked: diplo.reject.atWar` z PUSTYM `breakdown`. To poprawne zachowanie D2, nie regresja W1;
po prostu ten test na tym imperium nie ma sensu.

⚠ **Dwie kolejne pułapki, które inaczej zmarnują przebieg:**
1. Przyciski w panelu dyplomacji są bramkowane przez `canPropose` (kontakt / nie-wojna / brak traktatu)
   i **wyglądają identycznie przed i po** tej zmianie. Weryfikacja wymaga **faktycznego złożenia**
   propozycji i przeczytania modala.
2. Modal pokazuje **maksymalnie 6 wierszy** i tylko **niezerowe**. `relative_power` stoi w rozbiciu
   **jako pierwszy**, więc jest widoczny — ale **wypycha inny wiersz** poza listę. To jest oczekiwane.

Najpierw odczyt z silnika (bez UI):

```
KOSMOS.acceptanceEngine.evaluateProposal('player', KOSMOS.empireRegistry.listAll()[0].id, { verb: 'trade_agreement' }).breakdown.find(r => r.term === 'relative_power')
```
**Oczekiwane:** obiekt z **niezerowym** `value`.

⚠ **ZNAK — semantyka poprawiona w W1-3b** (orzeczenie orkiestratora; `DIPLOMACY_BACKBONE §2.1`
„słabsza strona bardziej ugodowa"):
**`+` = OCENIAJĄCE IMPERIUM jest SŁABSZE** (i przez to bardziej ugodowe) · **`−` = imperium jest
SILNIEJSZE** (naciska przewagę, mniej skłonne do układu).
W1-3 wypuścił znak odwrotny; jeśli zobaczysz odwrotność poniższych wartości — to REGRESJA, STOP.

Zmierzone na żywym silniku (etykieta wiersza: **„Układ sił"**):

| sytuacja | siła AI | siła gracza | `raw` | `value` (waga 10) | decyzja |
|---|---|---|---|---|---|
| AI ma 3 fregaty, gracz **bez floty** | 744 | 0 | **−1** | **−10** | **odmowa** |
| gracz dobudował 4 krążowniki | 744 | 2276 | **+0.507** | **+5.07** | **zgoda** |

Potem to samo w UI: klawisz **Y** (dyplomacja) → wybierz imperium → złóż propozycję (Umowa handlowa /
Pakt o nieagresji / Sojusz) → przeczytaj modal.

- [ ] `breakdown` zawiera wiersz `relative_power` z wartością ≠ 0
- [ ] modal po **złożeniu** propozycji pokazuje wiersz **„Układ sił"**
- [ ] AI z flotą, gracz bez → wartość **UJEMNA**, propozycja **odrzucona**
- [ ] po zbudowaniu własnej floty i ponownym złożeniu — wartość **rośnie ku dodatniej**, AI staje się ugodowsze
- [ ] kolor wiersza w modalu zgadza się ze znakiem (ujemny = negatywny, dodatni = pozytywny)

---

## G5 — kontrola „nic się nie zepsuło"

- [ ] brak błędów w konsoli przez cały przebieg
- [ ] zapis i wczytanie gry działa (save v100, **bez migracji**)
- [ ] FSM obcych nie wpadł masowo w wojnę na starcie (patrz ⚠ niżej)

```
KOSMOS.empireRegistry.listAll().map(e => [e.id, e.fsm && e.fsm.state, KOSMOS.diplomacySystem.getStatus(e.id)])
```
**Oczekiwane:** stany typu `IDLE` / `EXPANDING`, status `peace`. **Nie** `WAR` na starcie partii.

---

## ⚠ DO ROZSTRZYGNIĘCIA PRZEZ ORKIESTRATORA (nie blokuje gate'u)

1. **`PLAYER_DEFENSE_BASELINE_HP = 250`** (`src/data/CombatValueData.js`) — podłoga obrony planetarnej
   w mianowniku `milRatio`. Weszła z konieczności strukturalnej (bez niej gracz bez floty daje mianownik 0
   ⇒ `milRatio = 1.0` ⇒ powyżej progu wojny), ale **wartość jest gałką balansu**, nie pomiarem.
   Pełne uzasadnienie w commicie `9342aa3` i w komentarzu przy stałej.
2. ~~**Kierunek wpływu termu.**~~ **ROZSTRZYGNIĘTE — orzeczenie orkiestratora 2026-08-14, wdrożone
   w W1-3b.** To nie była gałka balansu, tylko **sprzeczność ze specyfikacją**: `DIPLOMACY_BACKBONE §2.1`
   definiuje term jako „weaker side more agreeable", a W1-3 wypuścił znak odwrotny. Wagi z D2 powstały
   przeciw stubowi zwracającemu 0, więc kierunku nikt nigdy nie zwalidował. Znak odwrócony, **magnitudy
   wag nietknięte** (pozostają domeną D4). Oczekiwania G4 wyżej opisują JUŻ poprawioną semantykę.

---

## ⚠ ZNANE OGRANICZENIE KANAŁU ROZBICIA (zgłoszone przez właściciela w przebiegu 1)

Rozbicie akceptacji (E4) jest **REAKTYWNE i jednostronne** — modal pokazuje się WYŁĄCZNIE przy
ODMOWIE. Gdy propozycja przechodzi (a przy odblokowanym `relative_power` przechodzi częściej),
gracz nie dowiaduje się NIC o tym, dlaczego. W1-3c odpowiada na to **poza modalem**: ciągły odczyt
„Układ sił" w panelu intelu (patrz G2), bo pytanie „czy warto prosić" pada PRZED kliknięciem,
a nie po nim. Symetryczny jednowierszowy „dlaczego tak" w modalu akceptacji pozostaje **opcją
odłożoną** (kandydat do prac UI przy W2) — nie wchodził do W1, żeby nie ruszać kanału E4.

---

## Materiał dowodowy dołączony do gate'u

| plik | co pokazuje |
|---|---|
| `…/diplomacy-telemetry-W1BEFORE.keep.json` | macierz E7 **przed** odblokowaniem — term jako STUB (8 seedów × 45 gy) |
| `…/diplomacy-telemetry-W1AFTER.json` | po odblokowaniu, **przed** odwróceniem znaku (W1-3) |
| `…/diplomacy-telemetry-W1FLIP.json` | **stan finalny** — po odwróceniu znaku (W1-3b) |
| `…/diplomacy-report-W1FLIP.html` | raport HTML z tabelą termów (stan finalny) |
| `…/diplomacy-telemetry-W1_PRE_BASELINE.json` | nieśledzony baseline sprzed W1, odłożony na bok (reguła V19) |

**Diff `payload.matrix.cells`:**
- STUB → FINAŁ: **0 / 210** zmienionych · `nearThreshold` identyczny (392/2496) — kotwice parytetu E2
  nietknięte **na finalnej semantyce**, nie tylko na tej z W1-3.
- przed-odwróceniem → po-odwróceniu: **0 / 210**.

Term: `stub → live` · `probeMaxAbs` 0 → **29.994** · `cannotMove` true → false ·
`probeByVerb` **9.998 / 19.996 / 19.996 / 29.994** (= wagi 10/20/20/30).

⚠ **OGRANICZENIE PRZYRZĄDU, warte zapisania.** Drugi diff (0/210) **nie jest dowodem poprawności
odwrócenia** — macierz E7 **nie widzi znaku tego termu w ogóle**. Kontekst bazowy trzyma siły RÓWNE
(raw = 0 w obie strony), a `probeByVerb` przechowuje wartość BEZWZGLĘDNĄ. Macierz jest więc
ślepa na kierunek i nie wykryłaby ponownej regresji znaku. Kierunku pilnują wyłącznie:
`acceptance_relpower_smoke` T1/T4/T5 (piny kierunku) oraz tabela pomiarowa w G4 wyżej.
Jeśli kierunek ma być bronion także przez BALANS, macierz potrzebuje kolumny z asymetrycznym
układem sił — pozycja do rozważenia przy D4.

---

## Wynik

- [x] **GATE 1 PASSED** — 2026-08-14, właściciel (Filip)

**Dowody:** liczby zagrożenia niezerowe i sensowne (`emp_test_enemy` 522 w skali HP) · potok intelu
żywy (`knownMilitary` 522 po `advanceIntel`; zera dla imperiów bez floty rozpoznane jako POPRAWNE,
nie regresja) · pełna sekwencja dominacji orbitalnej (true → przylot uzbrojonego → false →
zniszczony → true) z zablokowanym UI desantu · `relative_power` żywy z POPRAWIONĄ semantyką
na prawdziwych danych: gracz z kadłubami vs oceniające imperium BEZ floty → `raw: 1`, wkład **+10**
(słabszy oceniający bardziej ugodowy) — cały łańcuch realne kadłuby → siła wyprowadzona →
naprawiony estymator → term → rozbicie działa. G5 czysty.

**Dwa znaleziska z przebiegu, oba zamknięte:** (1) `emp_test_enemy` jest w stanie wojny z definicji,
więc `evaluateProposal` zwraca `blocked: diplo.reject.atWar` z pustym rozbiciem — poprawne
zachowanie D2; checklista wysyłała tam do G4 i dlatego dostała sekcję „WYBÓR IMPERIUM".
(2) Luka UI kanału rozbicia (widoczny tylko przy ODMOWIE) — odpowiedź w **W1-3c**: ciągły odczyt
„Układ sił" w panelu intelu.
