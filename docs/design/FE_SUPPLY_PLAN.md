# 178 — PODAŻ Fe: trzy przebiegi, oś główna do podpisu z tabeli

> **Status:** 📋 **PODPISANE CZĘŚCIOWO 2026-09-01.** **D-Fe-1 = UNIA** (lista stalli ∪ luki rud
> z `pendingShipOrders[].cost`) · **D-Fe-2 = DO POMIARU, pole zawężone** (rezerwacja vs priorytet
> stoczni; „świadomie bez rezerwacji" **skreślone** — nie może wygrać pomiaru, patrz §4.2) ·
> **oś główna NIEWYBRANA** — rozstrzyga tabela §2.
> Numery **223** i **224** nadane niezależnie od wyniku. Zaparkowane: oś 2 (ratchet), oś 3
> (220 ×5), oś 4 (energia — **mierzona w każdym przebiegu, nie naprawiana**).
> Rejestr macierzysty: `VESSEL_ORDERS_PLAN.md` §178 · §180 · §214 · §220 · §223 · §224.
> Fixture'y: **`GATE-215-gy30`** (czysty punkt zerowy) i **`GATE-Fe-gy40`** (ten sam zapis
> przewinięty 10 gy z żywym naciskiem, bez spawnów).
> Poprzedni dokument rodziny: `AI_ORDER_DEMAND_PLAN.md` §11 (gate, który ten finding odsłonił).
> Sondy: scratchpad, poza repo (`probe-178-loads.mjs`, `axis1.mjs`, `w4-union.mjs`, `q-b2/q-b3.mjs`).

---

## 0. Reguła wejścia — wykonana

`git log -S "_loadByRarity"` → **6 commitów**, źródło **`adc4a5b`** (Slice 2 S3, route-based cargo).
`git log -S "createOrUpdate"` → **`a3810f5`** (Plan B, tablica zleceń cross-colony).
`git log -S "_getScaledRecipe"` → źródło **`bffa46f`** (scenariusz boosted) i — ważne dla osi 3 —
**`3a02f37`**, który **zwolnił droidy** z ×5, bo skalowanie wpychało je w perma-stall. Precedens
istnieje: ×5 było już raz uznane za zbyt kosztowne dla konkretnej klasy towarów.

Keepery przed audytem: `empire_logistics_courier` **10/10** · `balans_ai_report` **35/35** ·
`director_ai_production` **32/32** — zielone.

---

## 1. Co audyt USTALIŁ (produkcyjnymi funkcjami, nie rozumowaniem)

### 1.1 Kurier nigdy nie bierze Fe

`_loadByRarity` sortuje malejąco po rzadkości, a `Fe` jest **ostatnie**:

```
Xe(r5,w0.1) > Nt(r5,w5) > H(r5,w0.1) > Hv(r4) > Ti(r3) > Li(r3) > Si(r2) > Cu(r2) > C(r1) > Fe(r1)
```

| outpost | ładunek (200 t) | Fe zabrane |
|---|---|---|
| Xe (typowy P1/P2) | **Xe 2000 t** | **0** z 3000 |
| Nt (P5) | Xe 200 · Nt 36 | **0** z 2500 |
| ubogi w rzadkie | Xe 40 · Hv 60 · Ti 12 · Li 1 · C 1 | **0** z 2000 |

⚠ `loadCargo(v, id, avail, rs)` ładuje **CAŁĄ dostępną ilość**, bez capa; `Xe` waży 0,1, więc jeden
lekki i obfity surowiec zjada 100 % ładowni. ⇒ **Więcej kurierów nie pomoże: N × 0 = 0**, rośnie
wyłącznie hoard Xe (to jest koniec Findingu **180**, teraz zmierzony od strony przyczyny).

### 1.2 ⚠ DWA „OCZYWISTE" WARIANTY PADŁY — to jest główny wynik audytu

| wariant | Fe/kurs | Xe/kurs | kursów do 100 Fe |
|---|---|---|---|
| **W1 — dziś** (rarity, bez capa) | **0** | 2000 | **NIGDY** |
| **W2 — cap 1/3 na surowiec** | **0** | 666 | **NIGDY** |
| **W3 — rezerwacja ½ ładowni na pospolite** | **0** | 1000 | **NIGDY** |
| **W4 — popyt (lista stalli) + cap** | **60** | 666 | **2** |

- **Cap sam w sobie nie naprawia nic**: przy 10 rudach ładownia zapełnia się na siedmiu rzadszych,
  zanim dojdzie do Fe.
- **Rezerwacja pasma „pospolitych" też nie** — i to jest najciekawszy wynik: w paśmie `rarity ≤ 2`
  **Fe jest NADAL ostatnie**, więc C (w 0,5), Si i Cu zjadają zarezerwowaną połowę. W3 naprawia się
  dopiero przez uporządkowanie pasma **wg potrzeby** — czyli **zapada się w W4**.

⇒ **Tylko ładowanie sterowane popytem rusza Fe.** Trzy warianty odrzucone POMIAREM, nie opinią.

### 1.3 Drugi kanał ISTNIEJE i jest martwy z dwóch własnych powodów

`TRADEABLE_GOODS` ma **35 pozycji i zawiera wszystkie 9 rud** (`Fe, C, Si, Cu, Ti, Li, Hv, Xe, Nt`)
plus food/water. Handel cywilny **mógłby** wozić Fe między koloniami tego samego imperium AI —
córki 186-188 siedzą na **Fe ~3000 każda**. Nie wozi, i to z dwóch niezależnych powodów, którym
nadajemy numery **223** i **224** (§3).

⇒ **Fix kolejności ładowania NIE MA nieść tego ciężaru.** To są trzy osobne defekty; slice ma je
wycenić osobno, nie zlać w jedną naprawę.

---

## 2. TRZY PRZEBIEGI — oś główna wychodzi z TABELI, nie z rozumowania

Każdy na `GATE-Fe-gy40`, ten sam horyzont, **identyczne metryki**:

| | **R1** | **R2** | **R3** |
|---|---|---|---|
| zmiana | **W4 sam** (ładowanie wg popytu) | **223 + 224 same** | **oba** |
| natura | nowa logika ładowania | termin właściciela + termin konsumpcji | suma |

**Metryki OBOWIĄZKOWE w każdym przebiegu:**

| metryka | po co |
|---|---|
| `time-to-first-hull` (gy do `kadlubyZeSkokiem ≥ 1`) | headline — obserwabl §G.2 |
| `Fe` w stolicy w czasie (co 2 gy) | czy dostawa nadąża za pompą |
| **Δ nadwyżki rud rzadkich** (Xe/Nt na outpostach) | koniec **180** — czy nie kupujemy Fe hoardem Xe |
| **`getEnergyAvailability`** | **oś 4** — bez tego mierzymy fabrykę na 14 % i o tym nie wiemy |
| liczba wygasłych zleceń (`director:orderExpired`) | czy TTL przestaje zabijać |
| `getPerYear('Fe')` | ⚠ z zastrzeżeniem **224**: NIE widzi poboru receptur |

⚠ **DLACZEGO R2 MOŻE WYGRAĆ, MIMO ŻE JEST MNIEJSZE.** **223** to prawdopodobnie *jedna linia* —
termin właściciela w istniejącej bramce — otwierająca kanał **już zdolny** wozić rudy, przy córkach
siedzących na Fe ~3000. **W4 to nowa logika ładowania.** Jeśli R2 przewraca obserwabl, W4 może być
zbędne albo odłożone. **Nie zakładam wyniku i nie faworyzuję większej zmiany.**
⚠ **Jednolinijkowy filtr bijący nową politykę ładowania jest WYNIKIEM, nie wstydem.**

---

## 3. NOWE NUMERY — nadane teraz, niezależnie od wyniku tabeli

### 223 — 🔴 handel wewnętrzny AI bramkowany MGŁĄ WOJNY GRACZA

`CivilianTradeSystem:85-101` odsiewa z `tradingColonies` **każdą** kolonię z `ownerEmpireId`, jeśli
gracz nie zwiedził jej układu (`isSystemExploredId`) i imperium nie ma traktatu handlowego.

ZMIERZONE (3 kolonie **tego samego** imperium AI, stolica Fe 4, dwie córki po Fe 3000):

| stan | kolonii handlowych |
|---|---|
| układ **niezwiedzony** przez gracza, brak traktatu | **3 → 0** ⇒ `_halfYearlyTick` wychodzi na `length < 2` |
| układ **zwiedzony** | 3 → 3 |
| traktat handlowy (układ nadal ciemny) | 3 → 3 |

⇒ **imperium AI nie handluje SAMO ZE SOBĄ, dopóki gracz nie zajrzy do jego układu.** Komentarz przy
bramce mówi o „mechanizmie handlu z AI" (Slice 3) — a odcina przy okazji handel AI z samym sobą.
⚠ Naprawa jest prawdopodobnie **jednolinijkowa**: bramka ma dotyczyć par **gracz↔AI**, a nie par
**AI↔AI tego samego imperium**. To jest dokładnie ta klasa co „termin własności", którą arc BRAMKA
WŁASNOŚCI przerabiał po stronie gracza.

### 224 — 🟠 `_getConsumption` ślepy na pobór receptur

`CivilianTradeSystem:609-620` sumuje ujemne stawki **zarejestrowanych producentów** — ten sam
rejestr, z którego `_recalcPerYear` buduje `_inventoryPerYear`. `FactorySystem._consumeIngredients`
pisze do inventory **bezpośrednio** ⇒ dominujący konsument Fe (rzędu **1000/civY** przy 25 FP
i ×5) jest dla `_deficitScore` **niewidzialny**.

⚠ **To ta sama ślepota**, którą wpisaliśmy jako korektę do **216** (`getPerYear` nie widzi poboru
fabryki) — tu ma drugą, cięższą konsekwencję: **nawet po naprawie 223 deficyt stolicy będzie
zaniżony**, więc routing wyśle za mało i za późno. ⚠ Dlatego R2 to **223 + 224**, nie samo 223.

---

## 4. W4 — dwie decyzje

### 4.1 D-Fe-1 — ŹRÓDŁO POPYTU: **UNIA** ✅ PODPISANE

ZMIERZONE — koszt **rudowy** fregaty eskortowej (kadłub `hull_frigate` + moduły szablonu
`frigate_laser_escort`) to **`Fe 100, Ti 130, Cu 25, Hv 38`**, a receptura `structural_alloys` to
`{Fe 8, C 4}` ⇒ **Fe 40** przy skalowaniu ×5:

| źródło popytu | Fe/kurs | kursów na 300 Fe (3 fregaty) |
|---|---|---|
| **same stalle** (`Fe 40`) | 40 | **8** |
| **UNIA** (stalle ∪ luki rud z `pendingShipOrders[].cost`) | **60** | **5** |

⚠ **Liczba per-kurs jest DRUGORZĘDNA.** Rozstrzyga to, **NA CO** Fe jedzie: `Fe 100` fregaty jest
kosztem **stoczni**, nie recepturą, więc **na liście stalli nie pojawia się NIGDY** — przy samych
stallach kurier nie wozi dla stoczni w ogóle, a przywiezione 40 zjada produkcja stopów.

**Obie listy już istnieją i są prawdomówne:**
- `FactorySystem.getStallReason` → `missing_ingredient: [{ resId, need, have }]` — **prawdziwy,
  istniejący kanał popytu na RUDY**, który obchodzi **214** (tam kanał popytu nie ma czym opisać rud);
- luki rud z `pendingShipOrders[].cost` — ta sama lista, którą `director:commodityDemand` liczy
  i raportuje jako „Fe 114".

### 4.2 D-Fe-2 — KTO DOSTAJE Fe PIERWSZY: **pomiar, pole ZAWĘŻONE**

⚠ **„Świadomie bez rezerwacji" SKREŚLONE jako kandydat** — nie może wygrać pomiaru, bo
**fabryka wygrywa Z KONSTRUKCJI**:

| | jak pobiera | kadencja |
|---|---|---|
| `FactorySystem._update` → `_consumeIngredients` | **drobne kęsy** (40 Fe na sztukę) | co tik, ~0,005 civY/szt. przy 25 FP |
| `ColonyManager._tickPendingShipOrders` | **kwota ryczałtowa** `canAfford(order.cost)` (Fe 100 + Ti 130 + Cu 25 + Hv 38) **naraz** | co `civDt`, wszystko-albo-nic |

⇒ Fe dowożone po 60/kurs zostaje przerobione na stopy, **zanim uzbiera się 100**.

**Do wyceny w R1/R3 zostają DWA warianty:**
- **(a) REZERWACJA** — pula Fe odłożona pod `pendingShipOrders`, niewidoczna dla `_hasIngredients`.
- **(b) PRIORYTET STOCZNI** — `_tickPendingShipOrders` przed alokacją fabryki w tym samym ticku.

⚠ **KSZTAŁT REZERWACJI JEST PODPISANY: KSIĘGA PER ZLECENIE** (`Map<orderId, {resId: qty}>`,
zwalniana **na realizacji i na TTL**) — wzór `_orderDemand` z **217/D-217-2**. Powód jest
konkretny i wskazuje na oś 4: **rezerwacja pod martwym zleceniem głodzi stopy → brak elektrowni →
spadek energii**, czyli dokładnie pętla, którą oś 4 opisuje. Goły licznik z dwiema ścieżkami
zwalniania jest zapadką czekającą na trzeci przypadek; księga czyni resztkę niemożliwą
z kształtu danych, a rekoncyliacja z żywą listą zleceń domyka ścieżkę trzecią.

---

## 5. ZAPARKOWANE — z warunkami wznowienia

**Oś 2 — ratchet `Math.max` w `ProductionRequestBoard.createOrUpdate:62`: FILE-AND-PARK.**
Trzy fakty źródłowe zawężają osiągalność: `getAvailableFor` filtruje `requesterId !== colonyId`
(`:124-129`) ⇒ **kolonia NIGDY nie widzi własnego zlecenia**; `_tickExpiry` kasuje nieprzypisane po
**`EXPIRY_GAME_YEARS = 2`**; a czysty rerun właściciela dał `source: 'safety', qty 121` — **w granicy
≤ 130**, którą audyt wykluczył. ⇒ ratchet jest realny w kodzie, ale **jako źródło celu stolicy
nieosiągalny w normalnej grze**; **1239 pochodziło ze skażonej sesji** (12 współbieżnych zleceń —
`CivilianTradeSystem._getPendingDemand:593-603` **SUMUJE** `order.cost` po wszystkich — i/lub
zleceń droidów testowego imperium). ⚠ **Dren stoi niezależnie od pisarza:** 121 × Fe 40 ≈ **4 840 Fe**
przy stolicy na Fe 4 i −70/civY. **Warunek wznowienia:** zaobserwowanie celu > 130 w NIEskażonej sesji.

**Oś 3 — 220 (×5 na RECEPTURĘ, nie na POPYT): własny pomiar przed podpisem.**
Ustalone: `_getScaledRecipe:1790-1806` mnoży ×5 **tier 1** wyłącznie w `civilization_boosted`,
z **droidami zwolnionymi** (`3a02f37`); popyt (koszty budynków, `startingSafetyStocks`, cele
`targets/*.js`, koszty statków) **nietknięty**; **brak terminu właściciela ⇒ dotyczy tak samo GRACZA**.
⚠ **Brak liczb** dla „skaluj też popyt" vs „zdejmij ×5 z rud" — **nie do podpisania na rozumowaniu.**

**Oś 4 — energia: MIERZONA, nie naprawiana.**
`targets/industrialist.js` ma `solar_farm: { count: 5 }` na **wszystkich czterech** checkpointach
(`:59/89/123/154`), a bootstrap daje **6** ⇒ ekspander widzi cel jako osiągnięty i **nigdy nie
dostawi elektrowni**; konsumpcja rośnie sama (`POP_CONSUMPTION.energy 0,25 × POP`).
⚠ Podniesienie `count` **jest jedną liczbą, ale nie jest darmowe**: `solar_farm` kosztuje
`Fe 15, Si 20, Cu 8` **+ `structural_alloys 4`**, czyli **Fe**. Pętla: brak Fe → stopy stoją → brak
elektrowni → 14 % → mniej Fe; domyka ją projekt brownoutu (dławi **wyjście**, nie **pobór**).
⇒ **NIE składać do slice'u Fe** — po naprawie Fe może się okazać zbędne. `getEnergyAvailability`
**obowiązkowy odczyt w każdym przebiegu §2**; poniżej ~0,2 wynik Fe jest **warunkowy** i tak zapisany.

---

## 6. KEEPER — fail-first (`src/testing/smoke/fe_supply_smoke.mjs`)

Powstaje PRZED zmianą kodu; ma paść dokładnie na asercjach opisujących naprawę, a kontrole mają
świecić po OBU stronach.

| pin | co pinuje | dziś |
|---|---|---|
| **T1** | **FAIL-FIRST: W1 wozi `Fe 0`/kurs** na trzech realistycznych outpostach | ✗ |
| **T1k** | **NIEJAŁOWOŚĆ**: `Fe` **JEST** na outposcie (≥ 2000) **i** ładownia się **zapełnia** (`cargoUsed ≈ cargoMax`) — inaczej „0 Fe" znaczyłoby „pusty outpost" albo „kurier nie ładował" | ✓ |
| **T2** | **cap sam NIE wystarcza** (W2 → `Fe 0`) — pin przeciw naprawie pozornej | ✓ |
| **T3** | **rezerwacja pasma NIE wystarcza** (W3 → `Fe 0`), bo Fe jest ostatnie **także wśród pospolitych** | ✓ |
| **T4** | **UNIA > same stalle** (D-Fe-1): kurs wozi Fe także wtedy, gdy fabryka **nie stoi**, a czeka zlecenie okrętowe | ✗ |
| **T5** | **223**: kolonia AI w układzie niezwiedzonym wypada z `tradingColonies` (**3 → 0**) + **kontrola**: przy `explored` wraca **3 → 3** | ✗ |
| **T6** | **224**: `_getConsumption('Fe', stolica)` **nie widzi** poboru receptur + **kontrola**: zarejestrowanego konsumenta **widzi** | ✗ |
| **T7** | **brak regresji 180**: nadwyżka Xe na outposcie **nie rośnie** względem W1 | ✗ |

⚠ **T2 i T3 są zielone dziś i mają takie zostać** — pinują, że dwie kuszące, tańsze naprawy
**NIE działają**. Bez nich ktoś „uprości" W4 do capa i wróci defekt.

---

## 7. GATE (LIVE) — `GATE-Fe-gy40`

**§1 — tabela §2 wypełniona** (R1/R2/R3, komplet metryk, ta sama długość przebiegu).
**§2 — OBSERWABL:** `KOSMOS.debug.strikeReport(<emp>).kadlubyZeSkokiem` **0 → ≥ 1** z REALNEJ
produkcji, z kontrolą `directorOrigin` (**213**).
**§3 — D-Fe-2 rozstrzygnięte POMIAREM:** czy kadłub powstaje bez rezerwacji (R1/R3 pokażą to przez
`time-to-first-hull`); jeśli nie — który wariant, (a) czy (b).
**§4 — kontrola 180:** Xe/Nt na outpostach **nie rośnie szybciej** niż w W1.
**§5 — oś 4:** `getEnergyAvailability` zaraportowana w każdym przebiegu.
**§6 — kill-switch:** flaga slice'u OFF ⇒ zachowanie sprzed slice'u; uchwyt `KOSMOS.gameConfig`,
**nie** `GAME_CONFIG`.

⚠ **HORYZONT ZADEKLAROWANY JAKO NIEWIADOMA.** Przy `Fe 60`/kurs i `LOGISTICS_INTERVAL_CIVYEARS`
kurs trwa ~2 × dystans / `speedAU`, ale liczba kursów zależy od tego, ile Fe zdąży zjeść fabryka
(D-Fe-2). `time-to-first-hull` liczymy **z przebiegu**, nie z góry. Nie podaję szacunku, żeby gate
nie dostał liczby, której nie zmierzyłem.

---

## 8. Granice dowodu

- Wszystkie liczby §1 i §4.1 to **POJEDYNCZY KURS** na syntetycznych inwentarzach, nie przebieg
  wieloletni. **Δ nadwyżki rzadkich** i **`time-to-first-hull` NIE SĄ ZMIERZONE** — to jest właśnie
  praca §2 i one rozstrzygają oś główną.
- **223** zmierzone na atrapie kolonii; bramka jest czysto strukturalna, więc atrapa wystarcza.
  ⚠ W pierwszym fixture'cie `dist = Infinity` (brak encji w `EntityManager`) i dawał 0 połączeń
  **z innego powodu niż bramka** — artefakt stubu, poprawiony przed pomiarem. Odnotowane, bo bez tej
  poprawki wniosek byłby prawdziwy z fałszywego powodu.
- **224** wyprowadzone ze źródła i potwierdzone `deficitScore = 0` na atrapie bez zarejestrowanego
  konsumenta; **nie** zmierzone na żywej stolicy.
- **Osiągalność ratchetu (oś 2)** wyprowadzona z trzech faktów źródłowych — **nie odtworzona headless**.
- **Oś 3** — zero liczb, wyłącznie ustalenia o kształcie kodu.
- ⚠ Tabela §2 będzie pochodzić z **headless boot skalibrowany**, nie z wczytania zapisu
  `GATE-Fe-gy40` (harness nie importuje zapisów przeglądarki). Zapis pozostaje fixture'em
  **live-gate'u**; tabela jest **pomiarem porównawczym**, i tak ma być czytana.

---

## 9. ⚠ LEKCJA — podpisana decyzja to NIE zbudowany artefakt

Tabela §2 miała powstać na `src/testing/headless/DirectorHarness.js`. **Ten plik nie istniał** —
choć decyzja **D-178-3** (`COURIER_LOAD_ORDER_PLAN.md` §4) miała status **✅** i opisywała go
szczegółowo: `bootWithDirector({ aiEmpires, seed })`, stub stacji z `serialize`/`restore`, `Ticker`
z `balans-driver`, zapieczona kalibracja, a nawet dwie pułapki, które „kosztowały przebieg".

```
ls src/testing/headless/                          → 69 plików, brak DirectorHarness
grep -rn "bootWithDirector" src/                  → pusto
git log --all --diff-filter=AD *DirectorHarness*  → pusto (NIGDY nie istniał w historii)
```

**Mechanizm:** slice, razem z którym instrument miał powstać, został **wstrzymany** — D-178-1 ma
w tym samym dokumencie status **ZAWIESZONE — NIE DO PODPISU** (wariantów nie dało się wycenić,
dopóki `_loadByRarity` się nie wykonywało). Decyzja o instrumencie przeżyła, kod nie.

⚠ **REGUŁA: `✅` w planie znaczy „ZDECYDOWANE”. O tym, czy coś ISTNIEJE, mówi repo.**
To ta sama rodzina co `findings-index-row-may-be-closed` (pozycja rejestru bywa nieaktualna)
i `registry-may-describe-the-trap-not-the-bug` (wpis bywa opisem pułapki, nie stanu) — tylko
w drugą stronę: **wpis opisuje ZAMIAR, a czyta się jak STAN**.
⚠ Rachunek jest policzony w samym §4: brak tego harnessu kosztował **GATE B2, 199, 208** — a teraz
**czwartą** ślepą plamę, tę tabelę. ⇒ przy każdym „użyj instrumentu X, on już jest": **`ls` i
`git log -S` PRZED planowaniem wokół niego.**

⚠ **I drugi wniosek, tańszy, ale ostry:** przy budowie okazało się, że §4 nie wymieniał **czwartego**
prerekwizytu — `InfluenceMap` **żąda `TerritoryService`** (R12), a `new InfluenceMap()` przechodzi
bez niego i rzuca dopiero przy pierwszym odczycie. Wiedza **BYŁA w repo** (komentarz w
`probe-w3-targets`), tylko nie w planie. Dlatego keeper pinuje `InfluenceMap` **WYKONANIEM**
(`getBorderSystems`), nie istnieniem obiektu — mój pierwszy pin sprawdzał `!!K.influenceMap`
i przepuściłby harness, w którym każda sonda nacisku wywraca się przy pierwszym użyciu.

⚠ **Trzeci wniosek — korekta MOJEGO pina.** Pierwsza wersja T6 („żadna sonda nie montuje Directora
z ręki") łapała też `probe-130-z2`, która buduje **syntetyczny** `window.KOSMOS` (zero odwołań do
`GameCore`) i izoluje jedno zachowanie. Migracja takiej sondy na pełny, skalibrowany boot
**zmieniłaby to, co ona mierzy** — to nie deduplikacja, tylko zepsucie działającego przyrządu.
D-178-3 chroni przed ręcznym składaniem **pełnej gry**, więc pin łapie dokładnie to: sonda, która
**bootuje `GameCore` I montuje Director sama**. Zmigrowana została **jedna** (`probe-w3-targets`),
a `T6b` pinuje ZAKRES: sondy jednostkowe zostają nietknięte.

---

## 9a. ⚠ LEKCJA — SKAŻONY PRZYRZĄD PRODUKUJE PEWNE SIEBIE TABELE

Wpisana obok „**podpisana decyzja to nie zbudowany artefakt**" (§9), bo to jest ta sama rodzina:
**artefakt istnieje, wygląda na gotowy i nikt go nie sprawdził na własnym poziomie.**

`DirectorHarness` powstał po to, żeby przestać montować Director ręcznie w każdej sondzie — i tę
robotę wykonał. Ale **sam nie dostał testu na to, co robi między dwoma bootami**: `GameCore.boot`
czyści `EntityManager` i `EventBus`, więc wyglądał na czysty, a **nie reseeduje PRNG i nie resetuje
`gameState`**. Dwie kolumny R0/R4 puszczone w jednym procesie porównywały **dwie różne galaktyki**.
Wynik: tabela z ośmioma konkretnymi liczbami, wewnętrznie spójna, **z narracją, która się broniła**
(„mniej elektrowni = więcej energii — to jest cały dowód pętli") — i **cała nieprawdziwa**.

**Co ją złapało:** dane właściciela z żywej gry (R0/R4/R2 nierozróżnialne). Nie test, nie przegląd
kodu — **niezależny pomiar na innym przyrządzie**.

Trzy reguły, które z tego zostają:

1. **Nowy przyrząd pomiarowy dostaje pin na SWOJĄ nieinwazyjność w tym samym commicie, co pin na
   swoją funkcję.** `director_harness_smoke` pinował **MONTAŻ** (czy Director jest podpięty) —
   poprawnie i zgodnie z lekcją W3 „skonstruowany ≠ zamontowany" — ale nie pinował **IZOLACJI**.
   Teraz pinuje: **T7** (dwa boothy = identyczny świat) + **T7b** (pin źródłowy na oba przecieki).
2. **Dwa warianty w jednym procesie są dowodem dopiero wtedy, gdy istnieje pin, że proces ich nie
   miesza.** Do tego czasu porównania idą w **osobnych procesach**, choćby było wolniej.
3. **Kiedy pomiar właściciela z żywej gry rozjeżdża się z moją tabelą, to MOJA TABELA jest
   podejrzana.** Żywy silnik jest instancją referencyjną; harness jest jej modelem. Model, który
   nie zgadza się z referencją, jest hipotezą o modelu — nie o świecie.

⚠ **Zasięg szkody:** fałszywy wynik trafił do commitów `b712ee1` i `8226dcc`, do §10.5 tego planu
i do rejestru **225**/**226**. Wszystkie cztery miejsca są poprawione; **historia git zostaje
z fałszem i dlatego numer commita jest w rejestrze wprost** — żeby ktoś, kto trafi na `8226dcc`
przez `git log -S`, zobaczył sprostowanie zanim uwierzy w liczby.

## 10. R0 (live) + R4 — ⚠ DWIE PRZESŁANKI OBALONE, KORZEŃ OKAZAŁ SIĘ INNY

> 🔴 **KOREKTA 2026-09-01 — CZĘŚĆ LICZB W TEJ SEKCJI BYŁA FAŁSZYWA.** Tabela R4 w §10.5 i wyprowadzona z niej kolejność przyczynowa w §10.3 pochodziły z `DirectorHarness` **bez izolacji bootu** (Finding **228**); fałszywy wynik został zacommitowany w **`8226dcc`** (wcześniej `b712ee1`). Sekcje §10.1-§10.4 zostają **z oznaczeniami**, żeby był widoczny tok rozumowania, który padł; **obowiązujące liczby są w §10.5 i tylko tam**.

### 10.1 R0 — kolumna kontrolna z żywego silnika (`GATE-Fe-gy40` → gy 62,1)

```
gy 62,1 · Fe 0 · FePerYear −70,2 (STAŁE) · warp_cores 4 · energia 0 · kadlubyZeSkokiem 0
zlecenia 3 · wygasłe 27 · outposty: Fe 129 777 · Xe 20 967 · Nt 37 393
energy = {production: 0, consumption: 123,15, balance: −123,15, brownout: true}
```

⚠ **`production` DOKŁADNIE zero** — nie „mało". To jest wskazówka, która przewróciła cały plan.

### 10.2 Ciemna stolica — trzy odpowiedzi ze źródła

| pytanie | odpowiedź |
|---|---|
| stocznia potrzebuje `avail > 0`? | **NIE.** `ColonyManager._tickShipBuilds:1221` → `progress += deltaYears * speedBonus`; `startShipBuild`/`_tickPendingShipOrders` bramkują tylko `canAfford` |
| fabryka produkuje coś przy 0? | **NIE, i to na zawsze.** `FactorySystem:897` → `alloc.progress += deltaYears * avail`; przy zerze postęp nie akumuluje się **wcale** |
| kopalnie wydobywają przy 0? | **NIE.** `BuildingSystem:2519` → `extractFromDeposits(deps, _cachedMineLevelGrid * avail, …)`, komentarz: *„avail=0 → złoże NIETKNIĘTE"* |

⇒ **`Fe 0` to nie dren, tylko ZERO WYDOBYCIA.** Ciemna stolica nie blokuje budowy okrętów
bezpośrednio — **wygasza wszystko, co ją karmi**.

### 10.3 ⚠ ŁAŃCUCH PRZYCZYNOWY — zmierzony end-to-end na `DirectorHarness`

> ⚠ **KOLEJNOŚĆ W TYM ŁAŃCUCHU JEST ODWRÓCONA — patrz §10.5c.** Na czystym przyrządzie `food` spada do **0 w gy4**, gdy `avail` wynosi jeszcze **1,00**; kolaps energetyczny startuje dopiero w **gy7**. ⇒ pierwotna awaria to **ŻYWNOŚĆ**, a ciemność jest jej **następstwem**. Opis sprzężenia poniżej pozostaje trafny; **strzałka przyczynowa biegnie w drugą stronę**.

| gy | pop | laborer | demand | farm | solar | prod | avail | food/rok | głód | Fe |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 24 | 12 | 10 | 2 | 6 | 56,7 | 1,00 | **+17,6** | — | 200 |
| 5 | 23 | 9 | 30 | 2 | 12 | 74,8 | 1,00 | **+3,5** | — | 2046 |
| 10 | 19 | 7 | 36 | 2 | 12 | 104,8 | 1,00 | **−8,9** | **TAK** | 0 |
| 15 | 11 | **0** | 37 | 2 | 13 | **0** | **0** | −4,5 | TAK | 0 |
| 20 | **4** | 0 | 37 | 2 | 13 | 0 | 0 | +0,5 | — | 0 |

**farm stoi na 2** → `food/rok` spada wraz z populacją → **GŁÓD w gy 10** → populacja 24 → 4 →
**laborer 0** → `empPenalty = laborer/demand = 0/37` → **wszystkie 13 elektrowni produkuje ZERO**
→ `avail 0` → kopalnie nie wydobywają, fabryka nie postępuje → **Fe 0 na zawsze**.

### 10.4 ⚠ DWIE PRZESŁANKI PODPISANEGO R4 — OBALONE

1. **„Ekspander nie skaluje energii" — NIEPRAWDA.** Buduje **6 → 13** elektrowni przy celu 5
   (moduł survival, `ColonyAutoExpander:253-258`). **Dynamiczne skalowanie energii byłoby NO-OPEM**
   — i, co gorsza, wyglądałoby na naprawę. Dlatego R4 skaluje **wyłącznie żywność i wodę**.
2. **„Wystarczy skalować karmicieli" — NIEPRAWDA.** R4 z samym skalowaniem farm dał pop
   **27 → 16 → 3**: `empPenalty` dzieli produkcję WSZYSTKICH budynków, w tym nowych farm.

⇒ Prawdziwym korzeniem jest **Finding 226**: gałąź survival dokłada elektrownię przy każdym
ujemnym bilansie, a `solar_farm` ma `popCost 0.25`, więc **każda dokłada etat, którego nie ma kto
obsadzić** — produkuje zero i **podnosi mianownik** `empPenalty`. Bilans dalej ujemny ⇒ kolejna.

### 10.5 ⚠ R4 — WYNIK WYCOFANY I ZMIERZONY PONOWNIE NA CZYSTYM PRZYRZĄDZIE

> 🔴 **Tabela, która stała w tym miejscu, była FAŁSZYWA i została zacommitowana w `8226dcc`.**
> Mówiła: R4 daje `pop 36 · avail 0,99 · Fe 19 826 · solar 10` przeciw `pop 3 · avail 0,00` w R0.
> **Żadna z tych liczb nie jest prawdziwa.** Powstały, bo R0 i R4 biegły w JEDNYM procesie na
> harnessie **bez izolacji bootu** — drugi boot dziedziczył strumień PRNG i `gameState` po pierwszym
> (Finding **228**). Właściciel zgłosił z żywej gry, że R0, R4 i R2 są **nierozróżnialne**; jego dane
> były poprawne, **moja tabela była odstająca**. Poniżej pomiar po naprawie przyrządu.

**Instrument:** `DirectorHarness` z izolacją bootu (`reseed` + `gameState.restore(null)`), pin **T7**
w `director_harness_smoke`. Oba warianty w jednym procesie — **to jest teraz dozwolone i samo w sobie
jest testem izolacji**. Poprawka `_feederTarget` (niżej) w miejscu.

| gy | **R0** (`aiScaleBasicInfra` OFF) | **R4** (ON) |
|---|---|---|
| 0 | pop 24 · lab 12 · farm 2 · solar 6 · avail 1,00 · food 250 · Fe 200 | **identycznie** |
| 3 | pop 20 · lab 6 · avail 1,00 · **food 12** | identycznie |
| 4 | pop 20 · lab 5 · avail **1,00** · **food 0** | identycznie |
| 6 | pop 17 · lab 3 · solar 6 · avail 0,99 | identycznie |
| **7** | pop 17 · lab 3 · **solar 12** · avail **0,68** | pop 17 · lab 2 · **solar 6** · avail **0,64** ← **pierwsza rozbieżność** |
| 8 | pop 16 · lab 2 · solar 12 · avail **0,28** | pop 16 · lab **0** · solar 6 · avail **0,00** |
| 9 | pop 14 · lab 0 · avail 0,00 | pop 14 · lab 0 · avail 0,00 |
| 10 | pop 12 · solar 12 · food 0 · Fe 230 · plac 1 | pop 12 · solar **6** · food 0 · Fe 0 · plac 1 |
| 20 | pop 6 · well 2 · solar 12 | pop 6 · well 2 · solar **6** |
| 30 | pop 6 · solar 12 | pop 6 · solar **6** |
| 40 | pop 3 · well 4 · solar 12 | pop 3 · well 4 · solar **6** |
| 50 | pop 4 · well 4 · solar 12 · food 7 | pop 4 · well 4 · solar **6** · food 7 |

**Jedyna różnica na całym horyzoncie to `solar 12` vs `solar 6`.** Populacja, `food`, `avail`, `farm`,
`well` i liczba placówek są **identyczne co do jednostki** w każdym checkpoincie.
⚠ **Kontrola d44af5e (placówki): 1 vs 1** — nie 5 vs 1. Poprzednia liczba też pochodziła ze
skażonego przebiegu.

#### 10.5a ⚠ DLACZEGO bramka 226 nic nie daje — i dlaczego mechanizm mimo to jest prawdziwy

Pełny inwentarz stolicy w gy10 różni się **jednym wpisem**:

| | R0 | R4 |
|---|---|---|
| budynki | … `solar_farm: 12` … | … `solar_farm: 6` … (reszta **identyczna**) |
| `getSlotDemand('laborer')` | **36** | **24** |
| `strata.laborer` | **0** | **0** |

Bramka **działa** — obniża popyt na robotników o 12 etatów. Ale `empPenalty = laborer / demand`, więc
przy `laborer = 0` penalty wynosi **`0/36` i `0/24` — czyli zero w obu przypadkach**. Bramka może
pomóc **wyłącznie wtedy, gdy robotnicy jeszcze są**; w tym fixturze schodzą do zera w **gy9**,
a bramka zaczyna działać w **gy7** — dwa lata za późno.

⚠ **DRUGA TEZA WYCOFANA:** zdanie „**mniej elektrowni = więcej energii** — to jest cały dowód pętli"
**nie reprodukuje się**. Na czystym przyrządzie R4 ma w gy7-8 `avail` **niższe** (0,64 vs 0,68;
0,00 vs 0,28), bo sześć dodatkowych elektrowni R0 zdąży jeszcze coś wyprodukować, zanim ich etaty
zjedzą resztki załogi. Od gy9 obie kolumny siedzą na 0,00. **Mechanizm pętli 226 pozostaje prawdziwy
i jest potwierdzony ŹRÓDŁOWO** (`ColonyAutoExpander:253-258` buduje `solar_farm` przy każdym ujemnym
bilansie; `solar_farm.popCost 0.25` ⇒ każda sztuka dokłada etat) — **fałszywy był zmierzony ZYSK**,
nie opis mechanizmu.

#### 10.5b Poprawka `_feederTarget` — podpisana, wdrożona, ZMIERZONA jako niewystarczająca

Poprzednia wersja liczyła cel wobec **nominalnej** wydajności farmy (10 food/rok), ignorując
`empPenalty`. Zmierzone: przy pop 19 dawała `_feederTarget = 2` — **dokładnie tyle, ile cel statyczny**
⇒ 225 było **bezczynne**. Po poprawce cel liczy się wobec **realnego** wyjścia
(`perBuilding × max(FEEDER_STAFFING_FLOOR 0,25, staffing)`) i jest **przycięty do poziomu
obsadzalnego** — zgodnie z podpisanym warunkiem właściciela, że **bramka 226 musi objąć także
KARMICIELI** (farma niesie `popCost` tak samo jak elektrownia).

⚠ **I to jest powód, dla którego R4 milczy w tym fixturze:** przycięcie do obsady jest **poprawne**
i właśnie dlatego samoogranicza R4 w kryzysie, który R4 miał leczyć. Przy `laborer = 0` liczba
obsadzalnych farm wynosi `2 + floor(0/jobs) = 2` — czyli stan bieżący. **R4 jest STRAŻNIKIEM
(zapobiega dwóm pętlom śmierci), nie LEKARSTWEM.**

#### 10.5c ⚠ TRZECIA PRZESŁANKA OBALONA — głód wyprzedza ciemność

Łańcuch przyczynowy z §10.3 (`energia → produkcja → żywność`) **nie opisuje tego fixture'u**:
`food` spada do **0 w gy4**, kiedy `avail` wynosi jeszcze **1,00**; kolaps energetyczny zaczyna się
dopiero w **gy7**, gdy populacja spada już od trzech lat. ⇒ **pierwotna awaria to ŻYWNOŚĆ, a energia
jest jej NASTĘPSTWEM** (mniej ludzi → mniej rąk → mniej wydobycia → survival dosypuje elektrownie).
§10.3 zostaje jako opis sprzężenia, ale **kolejność była odwrócona**.

#### 10.5d Przewidywanie falsyfikowalne dla żywej tabeli

Skoro bramka działa wyłącznie przy `laborer > 0`, to na `GATE-215-gy30`:
**jeśli stolica ma jeszcze robotników — R4 pokaże realny efekt; jeśli `laborer = 0` — R4 będzie
milczeć dokładnie tak jak na harnessie** (rozbieżność tylko w liczbie elektrowni).
⇒ **`strata.laborer` w stolicy jest metryką rozstrzygającą, ważniejszą niż `solar`.**

### 10.6 Co to znaczy dla osi głównej

R1 i R2 leżą **w dole strumienia**: dowożą Fe do fabryki, która przy `avail = 0` mnoży postęp przez
zero, i do kopalń, które nie wydobywają. **Bez 225+226 żadna z nich nie może przewrócić obserwabla.**
Rekomendacja kolejności: **R4 → R2 → R1**. Oś główną sygnuje właściciel z pełnej tabeli.

### 10.7 Odpowiedzi na dwa pytania właściciela — HABITATY i ŻYWNOŚĆ (pełny tekst)

#### (a) Habitaty — czy mieszkania są wąskim gardłem?  **NIE, i to jest zmierzone**

Cel `habitat` jest **statyczny: 1** we wszystkich czterech checkpointach `targets/industrialist.js`
(dokładnie ta sama wada co `farm`/`mine` z Findingu 225 — habitat po prostu **nie był w zakresie R4**,
bo R4 objął karmicieli `farm`/`well`, a energię objęła bramka 226).

Zmierzony sufit mieszkaniowy stolicy AI: **32 miejsca, płaskie przez całe 50 gy** (`colony_base` 16 +
`habitat` 12 + `launch_pad` 4 — po redenominacji ×4 z Population 2.0 Fazy 1).

**Populacja nigdy się o ten sufit nie opiera.** Szczyt w całym przebiegu to **24 w gy0** (czyli stan
startowy z bootstrapu), potem monotoniczny spadek: 24 → 20 → 17 → 12 → 6 → 3. Wzrost logistyczny ma
człon `(1 − humans/capacity)`, więc przy `humans 12 / capacity 32` hamulec mieszkaniowy wynosi
`1 − 0,375 = 0,625` — **jest, ale nie jest wiążący**; wiążące jest to, że `food` = 0, a głodująca
kolonia nie rośnie niezależnie od tego, ile ma pustych łóżek.

⇒ **Mieszkania stoją W KOLEJCE ZA ŻYWNOŚCIĄ.** Skalowanie habitatów dziś byłoby **no-opem
wyglądającym na naprawę** — dokładnie ta sama klasa co „skalowanie energii" z §10.4, które obaliliśmy
pomiarem **przed** napisaniem kodu. ⚠ Habitaty **wracają na stół** dopiero wtedy, gdy populacja
realnie dobije do 32 — i wtedy jest to **własna, osobno podpisana decyzja**, nie dodatek do tego
slice'u.

#### (b) Żywność — czy AI powinno badać lepsze budynki żywnościowe?  **DZIŚ TO NIE MA JAK ZADZIAŁAĆ**

Sprawdzone w danych, nie wyrozumowane:

* `hydroponics` (`TechData:283`) **nie występuje w `researchQueue` archetypu Industrialist** — AI
  **nigdy** go nie zbada, niezależnie od ilości punktów badawczych. (Stolica ma 2 `research_station`
  i 3 naukowców, więc punkty **są** — nie ma tylko po nie wyciągniętej ręki.)
* `synthesized_food_plant` (`BuildingsData:386`, `food 6`, `popCost 0.5`) **wymaga właśnie tej,
  niewyuczonej technologii**.

⇒ Reguła „**preferuj lepsze budynki żywnościowe**" byłaby **martwa z konstrukcji**: preferencja bez
odblokowanego budynku nie ma czego preferować. ⚠ I nawet po odblokowaniu `synthesized_food_plant`
niesie `popCost 0.5` (= 2 etaty) wobec `farm` — czyli w kryzysie obsadowym jest **droższy w rękach**,
a to jest dokładnie ten zasób, którego brakuje.

⇒ **Kolejność jest wymuszona, nie preferowana: najpierw KOLEJKA BADAŃ AI (osobny kandydat na
decyzję), potem — i tylko potem — preferencja budynków.** Odwrotna kolejność produkuje kod, który
przechodzi testy i nic nie robi.

#### (c) ⚠ Czego brakuje, żeby stolica w ogóle mogła WSTAĆ — mechanizm, którego NIE MA

Właściciel poprosił, żeby przy braku mechanizmu **zgłosić finding, a nie projektować**. Zgłaszam:
z `laborer = 0` i `food = 0` **nie istnieje w grze żadna ścieżka powrotu**. Kolonia AI nie ma
(1) transferu POP **do** stolicy (kierunek jest tylko na zewnątrz — kolonizacja), (2) importu żywności
**bez portu** (Finding 227), (3) awaryjnego odblokowania etatów. Wzrost logistyczny ma człon
`× humans`, więc przy małym `humans` i zerowej żywności układ jest **absorbujący**.
⇒ **Zapisane jako obserwacja wymagająca własnego numeru przy następnym audycie AI** — nie projektuję
tu lekarstwa.
