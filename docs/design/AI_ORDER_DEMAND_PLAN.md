# 217 — KANAŁ POPYTU ZAMÓWIENIOWEGO: Director dostaje własny człon, ekspander zachowuje swoje pole

> **Status:** 📋 **PODPISANE 2026-09-01.** **D-217-1 = V-SPLIT** (separacja kanałów; `rich`
> i próg 20 000 **POZA ZAKRESEM** → rodzina 182) · **D-217-2 = KSIĘGA PER ZLECENIE**
> (klucz = id zlecenia, człon sumowany jest POCHODNY; „czyszczenie" = **usunięcie wpisu**) ·
> **D-217-3** persystencja `?? {}` ⇒ **v101 bez migracji** · **D-217-4** likwidacja podwójnego
> liczenia `cur + gap` · **D-217-5** flaga `FEATURES.aiOrderDemandChannel`.
> **Fixture gate'u:** zapis **`GATE-215-gy30`**. **Rejestr macierzysty:** `VESSEL_ORDERS_PLAN.md`
> §217 (+ **218**, **219**, **220** z tej samej rundy). Poprzedni dokument rodziny:
> `AI_POP_GATES_PLAN.md` §9-10 (gate 215, który ten finding nazwał).
> Sondy: scratchpad, poza repo (`probe-factory-warp.mjs`, `probe-factory-warp2.mjs`,
> `probe-217-variants.mjs`, `probe-217-horizon.mjs`).

---

## 0. Reguła wejścia

`git log -S "_syncTier3SafetyDemand"` → **DWA commity**, oba istotne: **`d44af5e`**
(*„balance(ai): cel zapasu tier 3+ = 50 z bramka zamoznosci (Finding 182, plan podpisany)"*) —
czyli funkcja powstała **w tym samym commicie co same cele tier-3+** — oraz `228cde8` (docs).
`git log -S "setDemandBonus"` → 17 commitów; pisarzy pola jest **trzech**: `ColonyAutoExpander`
(×2 miejsca), `DirectorProduction._feedCommodityDemand`, `EconomyOverlay` (przyciski gracza),
plus `EmpireColonyBootstrap` przy zasiewie.

Keepery przed audytem: **`director_ai_production` 32/32** · **`balans_ai_report` 35/35** — zielone.

---

## 1. CO USTALIŁA REGUŁA WEJŚCIA — i dlaczego zmienia kształt slice'u

⚠ **Bramka zamożności NIE JEST przeoczeniem. Jest decyzją, i to ZMIERZONĄ NA PANELU.**
Komunikat `d44af5e` wycenia ją wprost:

> ZMIANA 2 (D3, bramka zamożności w ColonyAutoExpander — AI-only z konstrukcji). **Konieczna, bo
> sama zmiana 1 KOSZTOWAŁA ekspansję**, i to potwierdzone na większej próbie, nie szumem: panel
> **16 seedów**, imperia bez żadnej placówki **1/32 → 3/32**, obsada etatów **97% → 94%**,
> nieobsadzone etaty **4 → 6.5**.

Bramka przywróciła wszystkie trzy metryki do baseline'u, zachowując zysk (`plasma_cores` 0 → 50,
`quantum_cores` 0 → 17, `quantum_processors` 0 → 30). Intencja jest w komunikacie nazwana:
*„ubogie imperium chronione zgodnie z projektem — bramka zamknięta, więc nie goni tier 3+"*.

⇒ **KOREKTA WPISU §217 (podpisana):** sformułowanie *„`rich` jest w praktyce nieosiągalny"*
opisuje **projekt, nie defekt**. Poprawne brzmienie: **bramka jest ZAMKNIĘTA Z PROJEKTU,
zmierzona panelowo w `d44af5e`; defekt jest KOMPOZYCYJNY — F3 (gałąź fuzji) rozszerzył listę
objętą tą bramką o `antimatter_cells` i `warp_cores`, nie mierząc ponownie kompozycji.**

To jest cała anatomia błędu i nie da się jej zobaczyć w żadnym z commitów osobno:
- w `d44af5e` `warp_cores` był **świadomie WYKLUCZONY** z listy Industrialisty
  (*„świadomie POMINIĘTE: antimatter_cells i warp_cores (nieosiągalne, Finding 181)"*),
- F3 usunął powód wykluczenia (fuzja odblokowała oba półprodukty) i **słusznie** dopisał je do
  `startingSafetyStocks` — z komentarzem, że inaczej powtórzyłby Finding 182 na świeżej gałęzi,
- ale razem z wpisem odziedziczyły **bramkę napisaną dla innego zbioru towarów**, a przede
  wszystkim bramkę, która **ZERUJE**, zamiast po prostu „nie podnosić".

⚠ I dopiero na to nakłada się druga połowa: `DirectorProduction._feedCommodityDemand` pisze do
**tego samego pola** popyt zupełnie innej natury — **zobowiązanie już zaciągnięte** (zamówienie
okrętowe czeka na komodyt), a nie **politykę min-zapasu**. Pole ma jednego integera i zero
proweniencji, więc polityka po cichu wygrywa ze zobowiązaniem.

---

## 2. WYCENA WARIANTÓW — na liczbach `GATE-215-gy30`

Sonda buduje **prawdziwy** `FactorySystem` na inwentarzu z gy 30 (25 FP, `civilization_boosted`,
`avail 0.42`), po czym uruchamia produkcyjne `_reactiveAllocate()` + `_autoConsolidate()`.

| wariant | co REALNIE pracuje po konsolidacji | FP na łańcuch warp | czas łańcucha |
|---|---|---|---|
| **V0 — dziś** | *(nic)* | **0 / 25** | ∞ |
| **V-FLOOR** | `quantum_cores:13` `antimatter_cells:12` | **25 / 25** | 1,82 civY |
| **V-RICH** | `plasma_cores:4` `quantum_processors:4` `semiconductor_arrays:4` `metamaterials:4` `propulsion_systems:3` `quantum_cores:3` `antimatter_cells:3` | **6 / 25** | 4,99 civY |
| **V-SPLIT** ✅ | `quantum_cores:13` `antimatter_cells:12` | **25 / 25** | 1,82 civY |

### 2.1 V-RICH — to jest cofnięcie balansu, i przy okazji NAJWOLNIEJSZE odblokowanie

Otwarcie bramki cofa podpisaną, 16-seedowo zmierzoną decyzję z `d44af5e`, a na fixture'cie
**rozcieńcza łańcuch warp z 25 FP do 6** — obserwabl przychodzi **2,7× później**, bo budzi się
równocześnie pięć innych towarów tier-3+.
**Odblokowywanie przez otwarcie bramki, która istnieje po to, żeby chronić ubogie imperia, jest
najgorszym z obu światów: płacimy zmierzoną cenę ekspansji (placówki, obsada etatów) i dostajemy
za to wolniejszy skutek na tym jednym łańcuchu, o który nam chodzi.**

### 2.2 V-FLOOR i V-SPLIT są DZIŚ NIEODRÓŻNIALNE — i właśnie dlatego floor jest pułapką

Obie dają identyczną alokację na fixture'cie, więc **sam fixture ich nie rozstrzyga**.
Rozstrzyga **proweniencja i zachowanie w czasie**:

`_demandBonus` **nie ma proweniencji** — pole nie potrafi odróżnić zapisu Directora od zapisu
ekspandera od kliknięcia gracza w `EconomyOverlay`. `Math.max(bieżący, celEkspandera)` czyni więc
z bonusu **zapadkę jednokierunkową**, a `_feedCommodityDemand` już dziś pisze `cur + gap`, czyli
**dolicza bazę przy każdym zamówieniu** (11 sygnałów z twojej sesji skumulowałoby się do ~22).
**W długiej partii zapadka ZBIEGA DO ZACHOWANIA V-RICH — czyli ponownie ściąga na nas dokładnie
ten koszt, który `d44af5e` usunął, tylko na tyle wolno, że nikt tych dwóch rzeczy ze sobą nie
powiąże. Floor jest łatką na cudzym polu, nie naprawą.**

### 2.3 V-SPLIT — jedyny wariant, który NIE WYMAGA POWTÓRZENIA POMIARU

Popyt Directora staje się **własnym członem addytywnym** (`_orderDemand`), sumowanym wewnątrz
`getSafetyStockTarget`; `_demandBonus` zostaje **wyłącznie** polem ekspandera (i gracza), z
zerowaniem **bit w bit** takim jak dziś. ⇒ **panelowy wynik `d44af5e` jest zachowany
Z KONSTRUKCJI** — nic, co ten panel mierzył, nie jest ruszane, więc nie ma czego mierzyć ponownie.
A sam pull jest **ograniczony zamówieniem** (gap 1 ⇒ cel 3), nie stałym 50 — i dlatego łańcuch
warp dostaje wszystkie 25 FP, nie budząc ani jednego innego towaru.

**Argumentem jest różnica semantyczna, nie wygoda implementacji:** stały cel min-zapasu i
zamówieniowy pull to **dwa różne rodzaje popytu**. Pierwszy jest polityką, którą ekspander ma
prawo wyłączyć; drugi jest zobowiązaniem, które Director już zaciągnął. Dziś dzielą jednego
integera i polityka po cichu wygrywa.

---

## 3. PROMIEŃ RAŻENIA — ZMIERZONY, nie wyliczony z dokumentacji

Sonda czyta `ARCHETYPES` **wykonaniem** (nie regexem po źródle — lekcja z `AI_SAFETY_STOCK_PLAN`).

| archetyp | tier 3+ **w zasięgu zerowania** (`rich === false` ⇒ każdy na 0) | tier 1-2 (NIETKNIĘTE) |
|---|---|---|
| **industrialist** | `plasma_cores` `quantum_cores` `quantum_processors` `semiconductor_arrays` `propulsion_systems` `antimatter_cells` `warp_cores` `metamaterials` — **8, każdy cel 50** | `structural_alloys 30` `polymer_composites 20` `conductor_bundles 20` `extraction_systems 15` `basic_supplies 10` `civilian_goods 10` |
| **expansionist** | **identyczne 8** | identyczne 6 |
| xenophage · isolationist · trader · hegemon · swarm | — brak `startingSafetyStocks` ⇒ **poza mechanizmem w całości** | — |

⚠ **Opis „Industrialist 5 pozycji / Expansionist 7" z `d44af5e` jest NIEAKTUALNY** — listy zrosły
się do tych samych ośmiu, gdy weszły F3 (fuzja) i korekta `metamaterials`. To jest ta sama klasa,
co pułapka w tamtym commicie: **listę czytamy wykonaniem, nie z komunikatu**.

**Skutek per wariant dla WSZYSTKICH ośmiu** (fixture; stany nieznane z odczytu przyjęte jako **0**,
jawnie i na niekorzyść tezy):
- **V0** — wszystkie osiem na celu 1; sześć z nich stoi na zapasie 0, więc mają deficyt 1, ale
  przegrywają priorytetem źródła ze `structural_alloys` i giną na konsolidacji. Netto: **zero produkcji**.
- **V-RICH** — wszystkie osiem dostaje cel 50 ⇒ **siedem alokowanych równocześnie** (zmierzone),
  po 3-4 FP każdy. To jest dokładnie stan, który `d44af5e` zmierzył jako koszt ekspansji.
- **V-FLOOR / V-SPLIT** — **wyłącznie `warp_cores` + jego dwoje dzieci łańcucha**. Pozostała piątka
  zostaje na celu 1 i **nigdy nie wchodzi do `sorted`**. Zmierzone, nie zawnioskowane.

### 3.1 Kolonie GRACZA — nieosiągalne, i to na SELEKTORZE, nie na wewnętrznym guardzie

`ColonyAutoExpander._managedColonies():193-198` odsiewa `if (!c || c.ownerEmpireId == null) return false`
**zanim** cokolwiek się wykona, więc **obaj** pisarze (`_applySafetyStocks:342` i
`_syncTier3SafetyDemand:222`) są AI-only **z konstrukcji selektora**; wewnętrzne `if (!empId) return`
w `:647` jest obroną w głąb i jego własny komentarz to mówi (*„paranoja: kolonia gracza tu nie trafia"*).
Pole `_demandBonus` kolonii gracza pisze **wyłącznie** `EconomyOverlay` (przyciski `+`/`−` gracza),
a czyta ten sam `getSafetyStockTarget`.

**Pełne brzmienie wniosku:** ⇒ **V-SPLIT dokłada człon, który kolonie GRACZA będą zawsze widziały
jako 0**, ponieważ `_feedCommodityDemand` jest wywoływane wyłącznie ze ścieżki Directora
(`queueWarships` → tylko imperia AI). **Promień rażenia po stronie gracza jest ZEROWY — i keeper
ma to pinować**, żeby przyszła zmiana nie wpuściła tu ścieżki gracza po cichu.

---

## 4. KSZTAŁT NAPRAWY — księga per zlecenie

```
FactorySystem
  _orderDemand : Map<orderId, { [commodityId]: gap }>     // KSIĘGA, nie licznik
  setOrderDemand(orderId, gapsByCommodity)                 // zapis Directora
  clearOrderDemand(orderId)                                // USUNIĘCIE wpisu
  getOrderDemand(commodityId) → Σ po wpisach księgi        // człon POCHODNY
  getSafetyStockTarget(cid) = base + getDemandBonus(cid) + getOrderDemand(cid)
```

⚠ **Dlaczego KSIĘGA, a nie licznik (D-217-2, poprawka właściciela).** Goły licznik z dwiema
ścieżkami czyszczenia **jest zapadką czekającą na trzeci przypadek**: częściowe realizacje, kilka
równoległych zamówień na ten sam towar i każda trzecia ścieżka cyklu życia (śmierć kolonii, reset
stoczni, `transferColony`) zostawiłyby resztkę, której nikt nie odejmie. Przy księdze „wyczyszczenie"
znaczy **skasowanie wpisu**, więc reszta jest niemożliwa **z kształtu danych**, a nie z dyscypliny
wołających.

⚠ **I to właśnie klucz zlecenia daje trzeci, DARMOWY mechanizm domknięcia:** księgę można
**rekoncyliować** z żywą listą `colony.pendingShipOrders` — każdy wpis o id, którego nie ma już na
liście, jest z definicji martwy i wypada. Dzięki temu „brak resztek" jest **własnością sprawdzalną**,
a nie obietnicą złożoną przez trzech wołających.

**Punkty wpięcia:**
| gdzie | co |
|---|---|
| `DirectorProduction._feedCommodityDemand:313` | zamiast `setDemandBonus(id, cur + gap)` → zbiera `{cid: gap}` i woła `setOrderDemand(order.id, …)`; `order` już mamy z `_stampTtl` (ma `.id`) |
| `DirectorProduction._sweepExpiredOrders:277` | po `list.splice` → `clearOrderDemand(o.id)` |
| ukończenie zlecenia (`pendingShipOrders` → `shipQueues`) | `clearOrderDemand(o.id)` |
| `FactorySystem._reactiveAllocate` (albo `_update`) | rekoncyliacja księgi z listą pending — sprzątaczka trzeciej ścieżki |
| `FactorySystem.serialize/restore` | `orderDemand: {…}` / `?? {}` ⇒ **v101 bez migracji** |

⚠ **D-217-4 — znika podwójne liczenie.** Dzisiejsze `cur + gap` dolicza **bazę** przy każdym
zamówieniu (`cur = getSafetyStockTarget`, czyli `base + bonus`). W księdze zapisujemy **sam `gap`**.
To nie jest kosmetyka: fakt, że produkcyjny kod dolicza bazę do bonusu, jest **dowodem, że ten zapis
myli się co do pola, do którego pisze**.

⚠ **D-217-5 — kill-switch `FEATURES.aiOrderDemandChannel`** (default ON), JEDNA flaga.
OFF ⇒ `_feedCommodityDemand` pisze `setDemandBonus` dokładnie jak dziś **i** `getSafetyStockTarget`
ignoruje `_orderDemand` ⇒ produkcja AI zachowuje się **bit w bit jak przed slice'em**.

---

## 5. Decyzje

| # | decyzja | status |
|---|---|---|
| **D-217-1** | wariant naprawy | ✅ **V-SPLIT** (separacja kanałów). `rich` i próg 20 000 **POZA ZAKRESEM** → rodzina **182**, osobne pytanie balansowe. Korekta wpisu §217: bramka zamknięta **z projektu**, panelowo zmierzona w `d44af5e`; defekt jest **kompozycyjny** — F3 rozszerzył listę objętą bramką, nie mierząc ponownie kompozycji |
| **D-217-2** | cykl życia popytu zamówieniowego | ✅ **KSIĘGA PER ZLECENIE** (klucz = id zlecenia, wartość = gapy tego zlecenia; człon sumowany **pochodny**). „Czyszczenie na realizacji i na wygaśnięciu TTL" = **usunięcie wpisu**, nie odejmowanie. Rekoncyliacja z `pendingShipOrders` domyka trzecią ścieżkę |
| **D-217-3** | persystencja | ✅ `orderDemand` w `serialize`/`restore` z `?? {}` ⇒ **v101, zero migracji** |
| **D-217-4** | podwójne liczenie | ✅ księga zapisuje **sam `gap`**; `cur + gap` znika razem ze starym zapisem |
| **D-217-5** | kill-switch | ✅ **`FEATURES.aiOrderDemandChannel`**, jedna flaga, rollback = dzisiejsze zachowanie |

---

## 6. KEEPER — szkic (`src/testing/smoke/ai_order_demand_smoke.mjs`)

**Commit 1 = FAIL-FIRST.** Keeper powstaje PRZED naprawą i ma paść dokładnie na asercjach
opisujących naprawę; kontrole mają świecić na zielono po OBU stronach.

| pin | co pinuje | dziś |
|---|---|---|
| **T1** | **fail-first na V0** — przy zerowanym `_demandBonus` łańcuch warp NIE dostaje alokacji mimo kompletu surowców i 25 wolnych FP; po naprawie dostaje | ✗ **pada** |
| **T1k** | **kontrola niejałowości T1**: surowce SĄ (`_hasIngredients` dla QC/AC = `true`), FP > 0, `isRecipeAvailable` = `true` — inaczej T1 mierzyłby brak surowca, nie brak popytu | ✓ |
| **T2** | **INWARIANCJA — pinujemy POLE, nie skutek**: przy fladze ON zerowanie `_demandBonus` przez `_syncTier3SafetyDemand` jest **bit w bit** dzisiejsze; po przejściu ekspandera `getDemandBonus(cid) === 0` dla **wszystkich ośmiu** tier-3+ | ✓ (musi zostać ✓) |
| **T3** | **promień rażenia z NIEJAŁOWOŚCIĄ**: pozostała piątka (`plasma_cores`, `quantum_processors`, `semiconductor_arrays`, `propulsion_systems`, `metamaterials`) przy zapasie 0 **NIE dostaje alokacji** — asertowane **przeciw lustru V-RICH**, w którym te same towary alokację **DOSTAJĄ**. Bez lustra pin byłby pusty | ✗ (część po naprawie) |
| **T4** | **kolonie gracza nieosiągalne**: `_managedColonies` odrzuca kolonię bez `ownerEmpireId`; `_orderDemand` kolonii gracza pozostaje pustą księgą | ✓ |
| **T5a** | księga **czyści się na REALIZACJI** — `clearOrderDemand(id)` usuwa wpis, człon pochodny wraca do 0 | ✗ |
| **T5b** | księga **czyści się na WYGAŚNIĘCIU TTL** — osobny pin, osobna ścieżka | ✗ |
| **T5c** | **brak resztki przy dwóch równoległych zleceniach na ten sam towar**: usunięcie jednego zostawia dokładnie gap drugiego (to jest test kształtu KSIĘGI — licznik by tu padł) | ✗ |
| **T6** | flaga OFF ⇒ `getSafetyStockTarget` ignoruje księgę i zachowanie jest dzisiejsze | ✗ |

⚠ **T3 bez lustra V-RICH byłby pinem pustym** — „piątka nie dostała alokacji" jest prawdą także
wtedy, gdy alokator w ogóle nie wystartował. Lustro dowodzi, że w tym samym fixture'cie te towary
**potrafią** dostać FP, więc ich nieobecność w V-SPLIT jest wynikiem, a nie ciszą.

---

## 7. GATE (LIVE) — na fixture `GATE-215-gy30`

**Warunki startowe fixture'u:** nacisk żywy (L1/L2 odpalały), komplet surowców łańcucha w magazynie
(Si 18580 · Nt 214 · Hv 6002 · Xe 4831 · Ti 8174 · Li 589), **25 FP bezczynnych**, `avail 0.42`.
⚠ **`pendingShipOrders` jest PUSTE** — para z 27,10 wygasła w 30,10. Łańcuch ruszy dopiero po
**kolejnym incydencie nacisku**: L1 wraca po cooldownie ~**30,93**, L2 ~**32,1**.

**§1 — PARA DOWODOWA (flaga), `fabryka('entity_185')`:**

| | PRZED (flaga OFF / stan dzisiejszy) | PO (flaga ON) |
|---|---|---|
| alokacje | tylko `structural_alloys`, `fp 0`, `paused` | `quantum_cores(fp 13)` · `antimatter_cells(fp 12)` |
| `used / free` | **0 / 25** | **25 / 0** |
| cel `warp_cores` | 1 (= zapas ⇒ deficyt 0) | 3 |

⚠ Ta połowa dowodu odpala **w jednym przebiegu planisty (0,1 civY ≈ 3 dni wyświetlane)** od
najbliższego zamówienia Directora. **Brak wyniku tutaj po ~0,5 roku wyświetlanego JEST porażką.**

**§2 — OBSERWABL:** `KOSMOS.debug.strikeReport('emp_002').kadlubyZeSkokiem` **0 → ≥ 1**
z REALNEJ produkcji (bez `spawnEnemyRaider`), z kontrolą `directorOrigin` (Finding 213).

**§3 — HORYZONT** (liczony z `timePerUnit` SILNIKA, nie ręcznie):

| etap | civY | wyświetlane |
|---|---|---|
| QC + AC równolegle (13 / 12 FP, `avail 0.42`) | 1,06 | ~1 miesiąc |
| `warp_cores` @ 25 FP | 0,76 | ~3 tygodnie |
| fregata `buildTime 5.0` (`_tickShipBuilds` na `civDt`) | 5,0 | 5 miesięcy |
| mobilizacja `DEPLOY_DURATION_CIVYEARS 1.0` | 1,0 | 1 miesiąc |
| **razem od zamówienia** | **7,8** | **~0,65 roku** |

⇒ **pierwszy kadłub ze skokiem w służbie ok. gy 32-33. BRAK WYNIKU W gy 34 JEST WYNIKIEM.**
Dla porównania V-RICH dałby **≥ 0,92 roku** i to jest **podłoga**, bo pozostała piątka konkuruje
o FP także po etapie 1.

**§4 — kill-switch:** `KOSMOS.gameConfig.FEATURES.aiOrderDemandChannel = false` ⇒ para dowodowa
wraca do kolumny PRZED **bez przeładowania strony**. ⚠ Uchwyt to `KOSMOS.gameConfig`, **nie**
`GAME_CONFIG`.

**§5 — kontrola nieregresji ekspandera:** po włączeniu flagi `getDemandBonus` dla wszystkich ośmiu
tier-3+ nadal **0** (bramka `rich` zamknięta jak dziś) — dowód, że dołożyliśmy człon, a nie otworzyliśmy
bramkę.

---

## 8. Granice dowodu

- Tabele §2 i §3 pochodzą z **jednego** stanu (`GATE-215-gy30`), nie z panelu wieloseedowego.
  Świadomie: V-SPLIT **nie rusza pola, które panel `d44af5e` mierzył**, więc panel nie ma tu czego
  potwierdzać. Gdyby podpis padł na V-RICH albo V-FLOOR, **panel 16 seedów byłby obowiązkowy**.
- **Nie zmierzone:** zachowanie księgi przy > 2 równoległych zleceniach w żywej grze (keeper pinuje
  kształt, nie skalę); czy rekoncyliacja z `pendingShipOrders` jest potrzebna w praktyce, czy tylko
  jako obrona w głąb; wpływ na archetypy bez `startingSafetyStocks` (z definicji żaden — ale to
  wniosek ze źródła, nie pomiar).
- **Nie zmierzone (świadomie POZA zakresem):** czy po odblokowaniu łańcucha AI faktycznie dowozi
  okręt w oknie TTL — to jest właśnie obserwabl §2 gate'u, nie przesłanka planu.
- Reprodukcja V0 (sonda `probe-factory-warp2.mjs`) odtwarza stan z gry **bit w bit** (jedna alokacja,
  `fp 0`, `used 0`, `free 25`) — to jest najmocniejszy dowód w tym dokumencie i on JEST pomiarem.

---

## 9. Świadomie poza zakresem

- **`rich` i próg 20 000** → rodzina **182**. To pytanie balansowe z własnym panelem, nie higiena.
  ⚠ Gdyby kiedyś wracało: `d44af5e` zmierzył, że otwarcie bramki kosztuje **placówki (1/32 → 3/32)**
  i **obsadę etatów (97% → 94%)**.
- **Finding 218** (`_feedCommodityDemand` ślepy na półprodukty) — ten slice go **nie zamyka**, tylko
  czyni nieszkodliwym: skoro pull dociera do `warp_cores`, `_resolveChainNeeds` sam schodzi w łańcuch.
  Wpis zostaje otwarty jako defekt **przyrządu**.
- **Finding 219** (cicha częściowa realizacja `queueWarships`) i **220** (dren Fe / skalowanie ×5) —
  osobne, niezależne od tego slice'u.
- **216 / woda** — następna pozycja kolejki, poza tym slice'em.

---

## 10. ⚠ FINDING 221 — DRUGA BLOKADA, ODSŁONIĘTA PRZEZ WDROŻENIE (commit 3/3)

Wdrożenie księgi zadziałało zgodnie z podpisem, ale keeper został na **22/5**: łańcuch nadal
nie powstawał. Przyczyna okazała się **osobnym, starszym defektem** na tej samej ścieżce.

**Mechanizm.** `_addChainFor` liczy `deficit = qty × ingQty − stock` i **taką wartość** wkłada do
`chainMap`. Obie pętle alokacyjne odejmują zapas **ponownie**:

```
_reactiveAllocate:  if (stock >= ch.qty) continue;   …  targetQty: ch.qty − stock
_priorityAllocate:  stillNeeded = ch.qty − stock;    …  (bliźniak)
```

ZMIERZONE: `warp_cores` cost 2, zapas 1 ⇒ deficyt 1 ⇒ `_addChainFor` zwraca `quantum_cores qty 1`
(poprawnie — brakuje jednego), a pętla liczy `stock(1) >= ch.qty(1)` i **pomija ogniwo**. Rodzic
zostaje zaalokowany, ale bez składników ⇒ `_autoConsolidate` zeruje wszystko ⇒ **used 0/25**.
Drugi, cichszy skutek: gdy ogniwo przechodzi, `targetQty` jest zaniżony **dokładnie o `stock`**.

### 10.1 Przebieg kontrolny, który ODDZIELA 221 od 217

**Żywe** zlecenie w `pendingShipOrders`, księga PUSTA, `_demandBonus` PUSTY:

```
scan:      build:warp_cores=2 | safety:warp_cores=1
alokacje:  warp_cores:0        | used 0
```

⇒ w oknie TTL popyt **BYŁ dostarczany przez cały czas** (`_scanBuildDemand` czyta zlecenia
oczekujące), a łańcuch i tak nie powstawał. Na tej ścieżce były więc **DWIE niezależne blokady**:

| | kiedy bije | mechanizm |
|---|---|---|
| **217** | **po** wygaśnięciu TTL | ekspander zeruje popyt Directora (własność pola) |
| **221** | **w trakcie** TTL | ogniwo łańcucha nigdy nie alokowane (podwójne odjęcie) |

**I to 221 tłumaczy to, czego 217 wytłumaczyć nie mógł:** dlaczego pięć zleceń wygasło, choć każde
zgłaszało popyt przez trzy lata.

⚠ **Dlaczego 221 przeżył tak długo:** przy celach min-zapasu rzędu **50** deficyt jest duży
(`1 >= 97` fałsz), więc defekt **nie bije**. Maskowały go dokładnie te cele, które 217 zastępuje
**ograniczonym pullem**. Zaleta nowego projektu odsłoniła starą wadę — dlatego oba findingi należą
do jednego slice'u, choć są niezależne.

### 10.2 Strona GRACZA — ZMIERZONA PRZED decyzją o fladze

`_reactiveAllocate` / `_priorityAllocate` są **współdzielone**: kolonia gracza używa tych samych
pętli. Sonda `probe-221-player.mjs` (kolonia **bez** `ownerEmpireId`, scenariusz `civilization`,
6 FP, `avail 1.0`):

| przypadek | PRZED | PO | ocena |
|---|---|---|---|
| min-zapas 1 ponad stan, półprodukty na poziomie deficytu | **brak łańcucha** (`warp_cores fp0`) | `quantum_cores cel 1` · `antimatter_cells cel 1` | ✅ **koniec cichego zatrzymania** |
| ten sam deficyt, półprodukty **0** | `cel 2` | `cel 2` | bez zmian |
| duży min-zapas (cel 20) | `cel 36` | **`cel 37`** | ✅ korekta o zaniżony zapas |
| łańcuch płytki (`electronic_systems`) | `fp6, cel 3` | `fp6, cel 3` | bez zmian |

**Nazwana zmiana zachowania widoczna dla gracza:** ustawienie minimalnego zapasu **jeden ponad stan**
dla towaru z łańcuchem **nie produkowało dotąd NICZEGO**, jeśli półprodukty leżały na poziomie
deficytu — fabryka wyglądała na sprawną i stała. Po naprawie produkuje. **Żaden zmierzony przypadek
nie produkuje WIĘCEJ, niż realnie brakuje** — obie zmiany są korektami w tę samą stronę.

⇒ **BEZ FLAGI** (precedens `normalizeFleet`, Finding 200): poprawka poprawności we współdzielonym
kodzie, bez niespodzianek w pomiarze. Pin: `ai_order_demand_smoke` **T8a-d** (w tym kontrola T8c —
ścieżka, której 221 NIE zmienia).

### 10.3 T6b przeformułowany

Stary pin żądał, żeby przy fladze OFF łańcuch **nie był** alokowany. Po naprawie 221 popyt płynie
też z `_scanBuildDemand` żywego zlecenia, więc łańcuch alokuje się **niezależnie od flagi** — i to
jest poprawne, bo 221 to inny defekt i jego naprawa legalnie zmienia zachowanie w **obu** stanach
flagi. Kontrakt kill-switcha dotyczy **księgi**, więc pin dotyczy teraz **wpływu księgi**:
`T6b` (Director nie pisze do księgi), `T6c` (pisze do `_demandBonus`, ekspander to kasuje, cel wraca
do bazy = defekt sprzed slice'u odtworzony), `T6d` (flaga OFF nie otwiera bramki `rich`).

### 10.4 ⚠ LEKCJA — trzeci raz: `node --check` NIE JEST TESTEM

Pierwsza wersja poprawki 221 usunęła `const stock`, zostawiając jego użycie **piętnaście linii
niżej** (`qty: ch.qty − stock` w `newAutoChain.push`). **Składnia była poprawna**, `node --check`
przeszedł, a moduł wywracał się przy pierwszym wywołaniu (`ReferenceError: stock is not defined`).
Złapane URUCHOMIENIEM. To trzecie udokumentowane wystąpienie tej klasy w projekcie —
po `d44af5e` (`export` odcięty od stałej ⇒ cała telemetria padała na imporcie) i po regule z arca
BRAMKA WŁASNOŚCI (`ordersOk` używane bez deklaracji w żywej gałęzi UI).

⚠ **I drugi near-miss w tej samej rundzie, tej samej klasy:** dodanie `import { GAME_CONFIG }` do
`FactorySystem` przeszło `node --check` i wywróciło `factory_production_toggle_smoke` — `GameConfig`
ciągnie `i18n`, a ten sięga po `localStorage` **przy ładowaniu modułu**. `FactorySystem` jest
importowany przez lekkie keepery bez pełnego środowiska. ⇒ flaga czytana jest przez lokator
(`KOSMOS.gameConfig`), a nie importem — ten sam uchwyt, którego używa live-gate.
