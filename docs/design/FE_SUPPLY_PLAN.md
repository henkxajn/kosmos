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
