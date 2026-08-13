# W1 / GATE 3 — doktryny: garnizon trzyma, patrol rusza · checklista live · **FINAŁ W1**

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** B · **Slice:** W1 (finał) · **Commity:** W1-5 `49f1cff` + fix rozłączności ról
**Poprzedzają:** `ee189ba` · `1e67adf` · `aad2f99` · `9342aa3` · `8f7be70` · `6adec47` · `c4a41ea` · `12402b8` · `45b3135` (W1-6) · `2936bcf` (W1-7)
**Zapis:** v100, **bez zmian modelu zapisu** · **Sweep:** 129/129 OK, 0 FAIL · **check-i18n:** PASS
**GATE 1:** ✅ PASSED · **GATE 2:** ✅ PASSED

---

## Co ten gate ma ZOBACZYĆ

Okręty z nacisku L1/L2 lądowały zadokowane przy stolicy AI i **nic ich nigdy nie ruszało** (V15).
Doktryny nadają im rolę:

> **garnizon TRZYMA** pozycję przy stolicy · **patrol RUSZA** po zewnętrznych orbitach własnego
> układu AI · i przeżywa to **wczytanie zapisu**.

---

## Zasady przebiegu

- **NIE uruchamiaj gate'u równolegle z pracą CC.** · Jedna linia = jedno wklejenie.
- Jednolinijkowce **WYKONANE na żywym silniku** przed wpisaniem tutaj.
- Stolica **WYŁĄCZNIE** przez `KOSMOS.directorProduction.capitalOf(empireId)`.
- `DebugLog` to bufor pierścieniowy **czyszczony przy przeładowaniu**.

---

## Przygotowanie — potrzebne okręty AI przy stolicy

Doktryny konsumują **bezczynne, UZBROJONE** okręty AI zadokowane przy stolicy imperium. Najprościej
wywołać je naciskiem militarnym (armed player vessel w powłoce granicznej AI → L1/L2 budują fregaty).
Sprawdź, czy imperium je ma:

```
KOSMOS.empireRegistry.listAll().map(e => [e.id, KOSMOS.directorDoctrine.countIdleArmedAtCapital(e.id)])
```
**Oczekiwane:** co najmniej jedno imperium z liczbą ≥ 1. Jeśli wszędzie 0 — najpierw wywołaj nacisk
(patrz checklista GATE 3 Slice'u 1) i wróć tutaj.

---

## G3.1 — doktryna zostaje PRZYPISANA

```
KOSMOS.gameState.get('director.doctrine')
```
**Oczekiwane:** obiekt `empireId → { defend_home: [...], patrol_border: [...], lastAssignedYear }`.
⚠ Na **nowej grze** klucz może nie istnieć, dopóki żadna reguła nie odpaliła — to poprawne
(`initSubdomain` biegnie tylko przy wczytaniu zapisu).

- [ ] po odpaleniu reguł `director.doctrine` ma wpisy
- [ ] listy `defend_home` i `patrol_border` są **ROZŁĄCZNE** (żaden okręt w obu naraz)

---

## G3.2 — garnizon TRZYMA pozycję

```
Object.entries(KOSMOS.gameState.get('director.doctrine') ?? {}).flatMap(([e, d]) => (d.defend_home ?? []).map(id => [e, id, KOSMOS.vesselManager.getVessel(id)?.position?.dockedAt, !!KOSMOS.vesselManager.getVessel(id)?.movementOrder]))
```
**Oczekiwane:** każdy okręt garnizonu ma `dockedAt` = ciało stolicy i **`false`** w ostatniej kolumnie
(brak rozkazu ruchu).

⚠ **To NIE jest „doktryna nie zadziałała".** Trzymanie pozycji to **brak ruchu**, nie rozkaz „stój" —
wydanie garnizonowi `moveToPoint` na własną orbitę zwolniłoby orbitę w `OrbitalSpaceSystem`
i wywołało desync sprite'a znany z Engage.

- [ ] okręty garnizonu **stoją** przy stolicy, bez rozkazu ruchu
- [ ] nie dryfują i nie znikają z mapy 3D

---

## G3.3 — patrol RUSZA

```
KOSMOS.vesselManager.getAllVessels().filter(v => v.movementOrder?.issuedBy?.startsWith('doctrine_')).map(v => [v.name, v.movementOrder.issuedBy, v.position.state])
```
**Oczekiwane:** co najmniej jeden wiersz z `doctrine_patrol_border`. Stan przechodzi z `orbiting`
w `in_transit`, a na mapie 3D okręt **widocznie się przemieszcza**.

⚠ **Gdzie ma lecieć:** na jedną z **najdalszych PLANET własnego układu AI** — czyli po stronie,
z której nadlatuje gracz (K-4). **Nie** poza układ. Jeśli zobaczysz kurs na dziesiątki AU od
gwiazdy — to regresja (pierwsza wersja celowała w wolny punkt, a MOS przyciągał go do KOMETY
i patrol dostawał kurs na 102 AU).

⚠ **Paliwo:** rozkaz idzie z `bypassFuelCheck` (decyzja 12) — kolonie AI nie trzymają paliwa, więc
bez tego patrol zostałby prędzej czy później odrzucony. To konsekwencja **zadeklarowana**, nie ukryta.

- [ ] okręt z `issuedBy = doctrine_patrol_border` faktycznie **się przemieszcza**
- [ ] cel leży **wewnątrz układu planetarnego**, nie na peryferiach
- [ ] w konsoli **nie ma** ostrzeżeń `[DirectorDoctrine] rozkaz odrzucony`

---

## G3.4 — przeżywa ZAPIS i WCZYTANIE

Zapisz grę, przeładuj (F5), wczytaj.

```
KOSMOS.gameState.get('director.doctrine')
```
**Oczekiwane:** te same rostery co przed zapisem (save v100, **bez migracji**).

⚠ **Dwie pułapki wymienione w planie — sprawdź jawnie:**
1. Okręt AI ruszony poza `VesselManager` musi po wczytaniu **wrócić na mapę 3D** (sprite nie może
   zniknąć — precedens: `DirectorFirstContact` i `vessel:positionUpdate`).
2. Okręt w ruchu sterowanym przez MOS z `dockedAt == null` **nie może** wpaść w desync przypięcia
   do orbity (udokumentowany dla gracza przy Engage).

- [ ] rostery doktryn identyczne po wczytaniu
- [ ] patrolujący okręt **jest widoczny na mapie 3D** po wczytaniu
- [ ] leci dalej / dolatuje, zamiast przyklejać się do orbity macierzystej

---

## G3.5 — kontrola braku regresji (finał W1)

- [ ] brak błędów w konsoli przez cały przebieg
- [ ] nacisk militarny L1/L2 działa jak dotąd (doktryny **konsumują** jego okręty, nie zastępują go)
- [ ] potyczki i wyczerpanie z GATE 2 nadal działają
- [ ] panel intelu nadal pokazuje siłę i „Układ sił" (GATE 1 / W1-3c)

---

## Materiał dowodowy

Sweep **129/129 OK, 0 FAIL** · `check-i18n` **PASS** · save **v100 bez migracji przez cały W1**.
Keepery W1: `war_seams` 24 · `threat_assessment` 50 · `acceptance_relpower` 51 · `war_skirmish` 32 ·
`war_doctrine` 29 · `empire_logistics_courier` 10.

⚠ **Ograniczenie, o którym warto wiedzieć przy ocenie:** E7/BALANS **nie jest** instrumentem dla
W1-4/W1-4b/W1-5 — macierz mierzy WAGI przy ustalonym kontekście, a te commity zmieniają DYNAMIKĘ
(tempo narastania wyczerpania, ruch okrętów). Stąd 0/210 w każdym porównaniu; dowodami są pomiary
runtime w checklistach GATE 2/3 i keepery.

---

## Wynik

- [ ] **GATE 3 PASSED — W1 ZAMKNIĘTY** — data, podpis:
- [ ] uwagi / rozbieżności:
