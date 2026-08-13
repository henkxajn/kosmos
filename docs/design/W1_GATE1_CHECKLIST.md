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

⚠ **Dwie pułapki, które inaczej zmarnują przebieg:**
1. Przyciski w panelu dyplomacji są bramkowane przez `canPropose` (kontakt / nie-wojna / brak traktatu)
   i **wyglądają identycznie przed i po** tej zmianie. Weryfikacja wymaga **faktycznego złożenia**
   propozycji i przeczytania modala.
2. Modal pokazuje **maksymalnie 6 wierszy** i tylko **niezerowe**. `relative_power` stoi w rozbiciu
   **jako pierwszy**, więc jest widoczny — ale **wypycha inny wiersz** poza listę. To jest oczekiwane.

Najpierw odczyt z silnika (bez UI):

```
KOSMOS.acceptanceEngine.evaluateProposal('player', KOSMOS.empireRegistry.listAll()[0].id, { verb: 'trade_agreement' }).breakdown.find(r => r.term === 'relative_power')
```
**Oczekiwane:** obiekt z **niezerowym** `value` (np. `{ term: 'relative_power', raw: 1, weight: 10, value: 10 }`).
Znak: **dodatni = OCENIAJĄCE IMPERIUM silniejsze od gracza**, ujemny = gracz silniejszy.

Potem to samo w UI: klawisz **Y** (dyplomacja) → wybierz imperium → złóż propozycję (Umowa handlowa /
Pakt o nieagresji / Sojusz) → przeczytaj modal.

- [ ] `breakdown` zawiera wiersz `relative_power` z wartością ≠ 0
- [ ] modal po **złożeniu** propozycji pokazuje ten wiersz (etykieta „Przewaga militarna" lub odpowiednik i18n)
- [ ] znak zgadza się z sytuacją: AI z flotą, gracz bez → **dodatni**
- [ ] po zbudowaniu własnej floty i ponownym złożeniu — wartość **maleje / zmienia znak**

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
2. **Kierunek wpływu termu.** Wagi są dodatnie na `trade_agreement`/`non_aggression`/`alliance`/`offer_peace`,
   a znak to „+1 = OCENIAJĄCY silniejszy" — czyli **militarnie dominujące AI jest BARDZIEJ skłonne**
   podpisać traktat i pokój z graczem, słabe **mniej**. Zmierzone: przy dominującym AI wszystkie trzy
   traktaty przechodzą (`decision: true`) samym wkładem tego termu. Czy to zamierzony kierunek — zwłaszcza
   dla `offer_peace` (waga 30: wygrywające imperium chętniej godzi się na pokój) — jest **decyzją balansową
   D4**, teraz po raz pierwszy widoczną w macierzach. Wagi są AUTORSKIE z D2 i nie były tu ruszane.

---

## Materiał dowodowy dołączony do gate'u

| plik | co pokazuje |
|---|---|
| `src/testing/reports/balans/diplomacy-telemetry-W1BEFORE.keep.json` | macierz E7 **przed** odblokowaniem (8 seedów × 45 gy) |
| `src/testing/reports/balans/diplomacy-telemetry-W1AFTER.json` | macierz E7 **po** |
| `src/testing/reports/balans/diplomacy-report-W1AFTER.html` | raport HTML z tabelą termów |
| `src/testing/reports/balans/diplomacy-telemetry-W1_PRE_BASELINE.json` | nieśledzony baseline sprzed W1, odłożony na bok (reguła V19) |

**Diff `payload.matrix.cells`: 0 / 210 zmienionych.** `nearThreshold` identyczny (392/2496).
Term: `stub → live`, `probeMaxAbs` 0 → 29.994, `cannotMove` true → false,
`probeByVerb` 9.998 / 19.996 / 19.996 / 29.994 (= wagi 10/20/20/30).

---

## Wynik

- [ ] **GATE 1 PASSED** — data, podpis:
- [ ] uwagi / rozbieżności:
