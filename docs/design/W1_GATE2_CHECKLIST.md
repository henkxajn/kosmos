# W1 / GATE 2 — księgowanie wojny: potyczka vs wyczerpanie · checklista live

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** B · **Slice:** W1 · **Commit:** W1-4
**Poprzedzają:** `ee189ba` W1-0 · `1e67adf` W1-1 · `aad2f99` W1-2 · `9342aa3` W1-3 · `8f7be70` W1-3b · `6adec47` W1-3c
**Zapis:** v100, **bez zmian modelu zapisu** · **Sweep:** 127/127 OK, 0 FAIL · **check-i18n:** PASS
**GATE 1:** ✅ PASSED 2026-08-14 · **GATE 2:** ✅ PASSED 2026-08-14

> ⚠ **DOKUMENT ZAKTUALIZOWANY PO ZDANYM GATE 2** — o poprawki zgłoszone w przebiegu (batchowanie
> przylotów, odniesienie do E3 przy G2.3) oraz o **W1-4b**, który zmienił LICZBY: wyczerpanie jest
> teraz ASYMETRYCZNE (przegrany starcia płaci więcej). Kto powtarza ten gate — czyta tę wersję.

---

## Co ten gate ma ZOBACZYĆ (a nie tylko odhaczyć)

W1-4 niesie **PODPISANĄ ZMIANĘ ZACHOWANIA** (K-3): `EnemyAttackHandler` przestaje omijać
`recordBattle`. Skutek jest odczuwalny w rozgrywce, więc gate ma go **zobaczyć na ekranie**, a nie
wywnioskować z kodu:

> **wojny zaczynają się wyczerpywać od ataków orbitalnych** → rośnie `exhaustion` →
> **akceptacja pokoju się przesuwa** (a przy dużej liczbie starć auto-pokój przychodzi WCZEŚNIEJ).

Do W1-3 włącznie atak orbitalny w trakcie zadeklarowanej wojny naliczał **zero** wyczerpania
i **nie pojawiał się** w liście bitew wojny — był niewidoczny nawet w `WarOverlay`, który tę listę
czyta. Ponieważ wyczerpanie jest nośnym wejściem akceptacji pokoju (waga **55** na `offer_peace`),
D2 systematycznie **zaniżało cenę pokoju dokładnie w tych wojnach, które realnie się toczyły**.

---

## Zasady przebiegu (obowiązują, każda kupiona błędem)

- **NIE uruchamiaj gate'u równolegle z pracą CC.**
- Każdy jednolinijkowiec poniżej **WYKONANY na żywym silniku** przed wpisaniem tutaj.
- **Bez wieloliniowego kodu w blokach cytowanych.**
- `DebugLog` to bufor pierścieniowy **czyszczony przy przeładowaniu**.
- ⚠ **Wybór imperium** — jak w GATE 1: `emp_test_enemy` ze `spawnEnemyAttack` jest **w stanie wojny
  z definicji**, co tutaj akurat jest ZALETĄ (G2.2 potrzebuje wojny), ale do G2.1 (potyczka **bez**
  wojny) potrzebne jest imperium w stanie `peace`.

```
KOSMOS.empireRegistry.listAll().map(e => [e.id, KOSMOS.threatAssessment.getStrength(e.id), KOSMOS.diplomacySystem.getStatus(e.id)])
```

---

## G2.1 — POTYCZKA: napięcie i pamięć, ZERO wyczerpania

Potyczka = starcie **bez stanu wojny**. Weź imperium ze statusem `peace` i zapamiętaj napięcie:

```
KOSMOS.diplomacySystem.getTension('<ID_IMPERIUM>')
```

Doprowadź do starcia bez wojny — najprościej deep-space (statek gracza z bronią spotyka wrogi
statek poza wojną), albo zaobserwuj naturalne starcie. Po nim:

```
KOSMOS.diplomacySystem.getTension('<ID_IMPERIUM>')
```
**Oczekiwane:** napięcie **wzrosło o 12** (`SKIRMISH_TENSION`).

```
KOSMOS.diplomacySystem.relations.getMemory('player', '<ID_IMPERIUM>', 100).map(m => m.type)
```
**Oczekiwane:** na liście jest **`skirmish`**. ⚠ To musi być DOKŁADNIE ten typ — `border_pressure`
(nacisk militarny z Directora) to **inny incydent na innym kanale** (opinia, nie napięcie) i NIE
zaspokaja tego warunku.

```
Object.values(KOSMOS.gameState.get('wars') ?? {}).map(w => [w.id, w.active, JSON.stringify(w.exhaustion)])
```
**Oczekiwane:** **bez zmian** — potyczka NIE tworzy wojny i NIE nalicza wyczerpania.

W Dzienniku pojawia się wpis: **„⚔ Potyczka z … — bez stanu wojny (napięcie rośnie, wyczerpanie bez zmian)"**.

- [ ] napięcie +12
- [ ] wpis pamięci typu **`skirmish`** (nie `border_pressure`)
- [ ] rejestr wojen **bez zmian**, zero wyczerpania
- [ ] wpis w Dzienniku widoczny

---

## G2.2 — ⚠ ZMIANA ZACHOWANIA: atak orbitalny W WOJNIE wyczerpuje

To jest **rdzeń tego gate'u**. Wypuść wrogi atak i **poczekaj, aż doleci**:

```
KOSMOS.debug.spawnEnemyAttack({ etaYears: 20 })
```

⚠ **PUŁAPKA POMIARU: przyloty JEDNOCZESNE SKLEJAJĄ SIĘ W JEDNĄ BITWĘ.** `EnemyAttackHandler`
zbiera wrogów przybyłych w oknie `BATTLE_BATCH_WINDOW_MS = 500 ms` i rozstrzyga je jako JEDNO
starcie (zagregowane stats). Jeśli wypuścisz kilka ataków z tym samym ETA, dostaniesz **jedną**
bitwę zamiast kilku i policzysz wyczerpanie źle. **Spawnuj z odstępami** (różne `etaYears`, np.
20 / 24 / 28) albo czekaj na rozstrzygnięcie poprzedniej bitwy przed kolejnym spawnem.

Przed bitwą zanotuj stan wojny:

```
Object.values(KOSMOS.gameState.get('wars') ?? {}).filter(w => w.active).map(w => [w.id, w.battles.length, JSON.stringify(w.exhaustion)])
```

Po bitwie powtórz to samo.

**Zmierzone na żywym silniku PO W1-4b** (8 ataków orbitalnych, wojna `border_incident` rate 1.0,
WSZYSTKIE bitwy wygrane przez imperium):

| stan | `war.battles[]` | `exhaustion` | `offer_peace` |
|---|---|---|---|
| przed | 0 | `{emp:0, player:0}` | **odmowa** |
| po 8 bitwach | **8** | `{emp:16, **player:72**}` | **ZGODA** (wynik +2.3) |

⚠ **W1-4b — WYCZERPANIE JEST ASYMETRYCZNE.** Za bitwę: **baza +2 dla OBU** stron (wojna kosztuje
przez samo trwanie) **plus +7 dla PRZEGRANEGO** starcia ⇒ **zwycięzca +2, przegrany +9**, całość
skalowana `casusBelli.exhaustionRate`. Klasyfikacja idzie po polu `winner`, **NIGDY** po `lossesA/B`
(te niosą kolizję jednostek: delta HP w BattleSystem vs liczba statków w DSCS). Remis ⇒ obie strony
płacą samą bazę.

To bezpośrednia odpowiedź na obserwację z przebiegu 1: gracz wygrywał każde starcie 80:5 i męczył
się DOKŁADNIE tak samo jak rozbijany przeciwnik, co odwracało sens termu `war_status`. Teraz
wygrywający naciska przewagę, przegrywający szuka stołu — ta sama logika, co przy odwróceniu znaku
`relative_power` (W1-3b).

*(Pomiar sprzed W1-4b, dla porównania: 4 ataki ⇒ `{emp:60, player:60}`, symetrycznie po +15.)*

- [ ] licznik `war.battles[]` **rośnie** po każdym ataku orbitalnym (przed W1-4 stał w miejscu)
- [ ] `exhaustion` **rośnie** (przed W1-4 zostawało 0)
- [ ] ⚠ **przegrywający starcia męczy się WYRAŹNIE szybciej** — patrz OBIE liczby w `exhaustion`,
      nie tylko suma; to jest cała treść W1-4b
- [ ] bitwa jest **widoczna w panelu wojny** (klawisz **W**) — to ta sama tablica `war.battles[]`
- [ ] Dziennik pokazuje bitwę

---

## G2.3 — akceptacja pokoju SIĘ PRZESUWA

Sedno konsekwencji. Zaproponuj pokój **przed** serią ataków i **po** niej:

```
KOSMOS.acceptanceEngine.evaluateProposal('player', '<ID_IMPERIUM>', { verb: 'offer_peace' })
```
Czytaj `decision`, `score` oraz wiersz `war_status` w `breakdown`.

**Oczekiwane:** `war_status` przechodzi z **ujemnego** (wojna tańsza niż jej cena → pokój
przedwczesny) na **dodatni** (wyczerpanie przekroczyło cenę pokoju z casus belli), a `decision`
potrafi się odwrócić z `false` na `true`. Zmierzone (przebieg z W1-4b, `border_incident`):
`offer_peace` `false` → **`true`** po 8 przegranych przez gracza starciach.
Przebieg 1 (jeszcze symetryczny) dawał `war_status` **−16.5 → +16.5** — kierunek ten sam,
tempo inne, bo teraz zależy od tego, KTO przegrywa.

⚠ **Knock-on**: przy intensywnej walce orbitalnej **auto-pokój** może przyjść wcześniej niż dotąd.
Próg to `AUTO_PEACE_EXHAUSTION = 100`. Po W1-4b liczy się, KTO przegrywa: strona regularnie bita
dobija do 100 po ~11 przegranych starciach (9/bitwę przy rate 1.0), a strona wygrywająca — po ~50
(2/bitwę). Wojna kończy się więc, gdy PRZEGRYWAJĄCY ma dość, a nie gdy obaj zmęczą się równo.

⚠ **ODNIESIENIE DO E3 — przeczytaj, zanim uznasz brak auto-pokoju za błąd.** Wojny ze
`spawnEnemyAttack` niosą casus belli **`extermination`** (archetyp xenophage/swarm ⇒
`inferCasusBelli`), a ten ma `exhaustionRate 0.4` („walczą aż do końca") i **`peaceCost 100`**
(„praktycznie brak pokoju"). Konsekwencje, wszystkie ZAMIERZONE:
- wyczerpanie rośnie 2,5× wolniej (baza 0.8 / przegrany 3.6 za bitwę),
- `war_status = (min(exhaustion) − peaceCost) / 100` **nigdy nie wychodzi powyżej 0**,
- auto-pokój przy 100 zostaje **ODRZUCONY** przez silnik akceptacji, z wpisem w Dzienniku.
To jest funkcja z D2/E3 (pokój MOŻE zostać odmówiony), nie regresja W1. Chcąc zobaczyć normalną
dynamikę pokoju, użyj wojny o innym CB (`border_incident`, rate 1.0, peaceCost 30).

**Pełna tabela kursów** (`CasusBelliData.js`) — wyczerpanie za bitwę = wartość × `exhaustionRate`:

| casus belli | `exhaustionRate` | `peaceCost` | zwycięzca / przegrany za bitwę |
|---|---|---|---|
| `territorial_claim` | 1.2 | 50 | 2.4 / 10.8 |
| `border_incident` | 1.0 | 30 | 2 / 9 |
| `tech_theft` | 0.8 | 40 | 1.6 / 7.2 |
| `ideology` | 0.6 | 70 | 1.2 / 5.4 |
| `extermination` | 0.4 | 100 | 0.8 / 3.6 |

- [ ] `war_status` rośnie wraz z wyczerpaniem
- [ ] `offer_peace` potrafi zmienić decyzję z odmowy na zgodę
- [ ] auto-pokój przy ~100 wyczerpania **nie zaskakuje** (zachowanie zrozumiałe, nie bug)
- [ ] jeśli tempo wydaje się ZA SZYBKIE — to jest pozycja do **przestrojenia w tym commicie**,
      z dowodami w ręku (plan: „jeśli potrzebne jest retuningowanie, dzieje się TERAZ, nie później")

---

## G2.4 — widelec bez trzeciej ścieżki

```
Object.values(KOSMOS.gameState.get('battles') ?? {}).map(b => [b.id, b.warId ?? 'POTYCZKA'])
```
**Oczekiwane:** każdy wpis ma **albo** `warId`, **albo** jest potyczką. Nie ma wpisu „bez niczego".

- [ ] brak bitew nieprzypisanych
- [ ] brak błędów w konsoli przez cały przebieg
- [ ] zapis i wczytanie gry działa (v100, **bez migracji**)

---

## Materiał dowodowy dołączony do gate'u

| plik | co pokazuje |
|---|---|
| `…/diplomacy-telemetry-W1FLIP.json` | macierz E7 **przed** W1-4 |
| `…/diplomacy-telemetry-W1W4.json` | macierz E7 **po** W1-4 |

**Diff `payload.matrix.cells`: 0 / 210.** `nearThreshold` identyczny. `war_status` bez zmian
(status `live`, `probeMaxAbs` 55).

⚠ **I to jest POPRAWNY wynik, nie brak dowodu.** W1-4 zmienia **PRODUKCJĘ** wyczerpania w czasie
gry, a nie wagi ani progi. Macierz E7 z definicji trzyma wyczerpanie na sztywno (45/45 w kontekście
bazowym `offer_peace`), więc **nie może** zobaczyć zmiany w tym, jak szybko ta liczba rośnie.
Dowodem dla W1-4 jest pomiar RUNTIME z G2.2/G2.3 (0 → 60 wyczerpania, `offer_peace` `false` → `true`)
oraz keeper `war_skirmish_smoke`. To ta sama klasa ograniczenia, którą odnotowano przy W1-3b
(macierz jest ślepa na znak termu) — przyrząd E7 mierzy WAGI, nie DYNAMIKĘ.

---

## Wynik

- [x] **GATE 2 PASSED** — 2026-08-14, właściciel (Filip)

**Dowody:** ścieżka potyczki (+12 napięcia, wpis pamięci typu `skirmish`, ZERO wpływu na wojnę,
wpis w Dzienniku) · ataki orbitalne w zadeklarowanej wojnie produkują bitwy i wyczerpanie
**0 → 100 na ekranie** (19 bitew, widoczne w panelu **W** — przed W1-4 było TRWALE zero) ·
`war_status` monotoniczny z wyczerpaniem w pięciu zmierzonych punktach (−45.1 → −41.8 → … → 0),
spójnie z wagą 55 · widelec czysty na żywych danych (bitwy wojenne + dwa wpisy POTYCZKA obok
siebie — bez trzeciej ścieżki) · brak błędów w konsoli.

**„Brakujący" auto-pokój przy 100 to działający projekt E3:** wojny ze `spawnEnemyAttack` niosą
casus belli `extermination` (peaceCost 100 ⇒ `war_status` zatrzymuje się na 0, auto-pokój
ODRZUCONY z wpisem w Dzienniku). Gate spotkał funkcję E3 w naturze. `recent_refusal` poprawnie
ukarał powtarzane oferty pokoju (−20, 2 lata) — anty-spam z E4 zadziałał na GRACZU.

**Orzeczenie z przebiegu → W1-4b:** wyczerpanie ASYMETRYCZNE wg WYNIKU bitwy (gracz wygrywał
każde starcie 80:5 i męczył się tak samo jak przegrywający). Wdrożone, liczby w G2.2 wyżej.
