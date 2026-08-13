# W1 / GATE 2 — księgowanie wojny: potyczka vs wyczerpanie · checklista live

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** B · **Slice:** W1 · **Commit:** W1-4
**Poprzedzają:** `ee189ba` W1-0 · `1e67adf` W1-1 · `aad2f99` W1-2 · `9342aa3` W1-3 · `8f7be70` W1-3b · `6adec47` W1-3c
**Zapis:** v100, **bez zmian modelu zapisu** · **Sweep:** 127/127 OK, 0 FAIL · **check-i18n:** PASS
**GATE 1:** ✅ PASSED 2026-08-14

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

Przed bitwą zanotuj stan wojny:

```
Object.values(KOSMOS.gameState.get('wars') ?? {}).filter(w => w.active).map(w => [w.id, w.battles.length, JSON.stringify(w.exhaustion)])
```

Po bitwie powtórz to samo.

**Zmierzone na żywym silniku (4 kolejne ataki orbitalne w zadeklarowanej wojnie):**

| stan | `war.battles[]` | `exhaustion` | `offer_peace` |
|---|---|---|---|
| przed | 0 | `{emp:0, player:0}` | **odmowa** (wynik −6.5, `war_status` −16.5) |
| po 4 atakach | **4** | `{emp:60, player:60}` | **ZGODA** (wynik +26.5, `war_status` **+16.5**) |

Każda bitwa to **+15** wyczerpania dla OBU stron (skalowane `casusBelli.exhaustionRate`).

- [ ] licznik `war.battles[]` **rośnie** po każdym ataku orbitalnym (przed W1-4 stał w miejscu)
- [ ] `exhaustion` **rośnie** obu stronom (przed W1-4 zostawało 0)
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
potrafi się odwrócić z `false` na `true`. Zmierzone: **−16.5 → +16.5**, `false` → `true`.

⚠ **Knock-on do sprawdzenia w tym samym przebiegu** (plan wymienia to wprost): przy intensywnej
walce orbitalnej **auto-pokój** może przyjść WCZEŚNIEJ niż dotąd. Próg to `AUTO_PEACE_EXHAUSTION = 100`,
a każda bitwa daje +15 — czyli **~7 ataków orbitalnych** wystarcza, żeby wojna sama się skończyła.

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

- [ ] **GATE 2 PASSED** — data, podpis:
- [ ] uwagi / rozbieżności / decyzja o przestrojeniu tempa wyczerpania:
