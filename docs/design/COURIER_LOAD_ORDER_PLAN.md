# 178 / 208 — dlaczego AI nie buduje okrętów wojennych (⚠ NAZWA SLICE'U PONOWNIE OTWARTA)

> ## ⚠ KOREKTA 2026-08-31 — CZYTAJ PRZED CAŁĄ RESZTĄ
>
> **Ten dokument powstał jako plan slice'u „178 z gate'em 208 — kolejność ładowania kuriera".
> Pomiar tę ramę OBALIŁ, i to DWA RAZY. Poniżej zostały wyłącznie części zweryfikowane.**
>
> **Czego pomiar dowiódł:** `EmpireLogisticsSystem._loadByRarity` **NIE JEST WOŁANE ANI RAZU**
> (licznik `wywolan = 0` w każdym przebiegu, 25-35 gy). Kolejność ładowania nie może wiązać,
> skoro ładowanie nigdy nie następuje ⇒ **wycena wariantów V-A/V-B/V-C mierzyłaby CISZĘ**
> i nie została wykonana.
>
> **Prawdziwa przyczyna → Finding 215:** próg `freePops` jest dla AI **nieosiągalny z konstrukcji**,
> więc kurier **nigdy nie jest zamawiany**. Pełny łańcuch: brak kuriera ⇒ brak **Nt** w stolicy ⇒
> `quantum_cores` i `antimatter_cells` oba na „Nt 0/4” ⇒ `warp_cores` 0/2 ⇒ **208**.
>
> **⚠ TRZY KOLEJNE RAMY, KAŻDA OBALONA POMIAREM — i to jest lekcja tego dokumentu:**
> „głód komodytów" (wpis rejestru) → **„głód żelaza"** (mój §1.2, **artefakt niedoprecyzowanego
> fixture'u**) → **„`warp_cores`"** (odczyt pośredni) → **próg POP** (przyczyna, z kontrolą).
> ⇒ **Nie przepisujemy tego planu wokół czwartej ramy, dopóki nie ma podpisu właściciela.**
>
> **Co zostaje ważne:** §1 (mechanizm — **ale patrz etykieta**), §4 (instrument), §7 (findingi),
> lekcja o fixture. **Co zostało wycięte:** §1.2 (diagnoza „żelazo"), §3 (projekt wyceny wariantów),
> §5 D-178-1, §6 (gate) — wracają, gdy nazwa slice'u zostanie rozstrzygnięta.
>
> **Status:** 📋 **PODPISANE: D-178-2, D-178-3 (z poprawką), D-178-4, D-178-5, D-178-6.**
> **NAZWA SLICE'U: PONOWNIE OTWARTA** — kandydat: *„próg `freePops` dla AI" (215) z gate'em 208*.
> Save **v101, zero migracji**. **Rejestr macierzysty:** `VESSEL_ORDERS_PLAN.md` §178 · §208 · §215.
> Sondy: scratchpad, poza repo (`probe-208.mjs`, `probe-178-demand.mjs`, `probe-178-variants.mjs`,
> `probe-178-route.mjs`, `probe-178-three.mjs`, `probe-178-pops.mjs`).

---

## 0. Reguła wejścia

`git log -S "_loadByRarity"` → **jeden commit** (`adc4a5b`, Slice 2 S3), nigdy nierewidowany ·
`ORDER_TTL_DISPLAYED_YEARS` / `orderExpired` → jeden (`8006ceb`) · `queueWarships` → 5.
Keepery: `director_ai_production` 32/32 · `director_production_foundation` 54/54 ·
`empire_logistics_courier` 10/10 · `balans_ai_report` 35/35 · `acceptance_retrofit` 38/38 — **zielone**.

**Konsumenci `_loadByRarity`: JEDEN** (`EmpireLogisticsSystem:411`). Żadnej innej trasy.
`loadCargo` (`Vessel.js:616`) jest współdzielony z graczem/transportem/`TransportOrderSystem`
i **zostaje nietknięty** (D-178-2).

⚠ **Instrument tej rodziny NIE MÓGŁ zmierzyć 208 i mówi to o sobie wprost.**
`probe-ai-economy-health.mjs`: *„`GameCore.js` NIE montuje Directora, więc ścieżka OKRĘTÓW WOJENNYCH
jest tu z definicji niewidoczna"*. Dlatego 208 był **obserwacją**, nie pomiarem — patrz §4.

---

## 1. Mechanizm — ⚠ WYPROWADZONY ZE ŹRÓDŁA, NIGDY NIE ZAOBSERWOWANY W DZIAŁANIU

> ⚠ **Ta sekcja opisuje, co kod ZROBIŁBY, gdyby się wykonał.** `_loadByRarity` **nie zostało wywołane
> ani razu** w żadnym przebiegu (Finding 215), więc poniższe liczby są **teorią kodu, nie pomiarem
> zachowania**. Zostają, bo są poprawne co do źródła i będą potrzebne, gdy transport ożyje —
> ale **nie wolno ich cytować jako zmierzonej przyczyny czegokolwiek**.

`_loadByRarity` sortuje malejąco po `rarity` i woła `loadCargo(vessel, resId, **avail**, resSys)` —
**całą dostępną ilość, BEZ limitu per-surowiec**.

| | wartość | konsekwencja |
|---|---|---|
| `cargo_small.cargoAdd` | **200** | cała ładownia kuriera |
| `Fe.weight` | **2,0** | **100 Fe = 200 jednostek = DOKŁADNIE jedna pełna ładownia, bez niczego innego** |
| `Fe.rarity` | **1** (najniższa) | ładowany **ostatni** |
| `Xe`/`H`.weight | **0,1** | 2000 sztuk mieści się w jednej ładowni |
| `Xe`/`H`/`Nt`.rarity | **5** | ładowane **pierwsze** |

⇒ Jeden rzadki surowiec z dużym zapasem **wypełnia ładownię w całości**. Stolica dostaje to, czego
nie potrzebuje, i nie dostaje tego, z czego są kadłuby.

### 1.1 208 REPRODUKOWANY (2 imperia × 40 gy, `probe-208.mjs`)

| | emp_001 | emp_002 |
|---|---|---|
| próby `queueWarships` | `no_module` ×10 → **`queued` ×9** | `no_module` ×13 → **`queued` ×8** |
| pierwszy raz przez bramki | gy **11,0** | gy **14,0** |
| kolejka stoczni @ gy40 | **0** | **0** |
| **zbudowane okręty** | **0** | **0** |
| `director:orderExpired` | **15 łącznie** (po 3 lata) | |

Do gy 11-14 blokuje **tech** (`no_module`, slot 0, `engine_warp`) — udokumentowana konsekwencja **R-4**.
Po tym progu **każde** zamówienie ląduje w `pendingShipOrders` i **żadne nie startuje**.

### 1.2 · 1.3 — ⚠ WYCIĘTE 2026-08-31 (diagnoza „żelazo”)

> Stały tu dwie sekcje twierdzące, że 208 wiąże **Fe**, a nie komodyty (stan `Fe = 4` przy 2487 Ti,
> „Fe nie akumuluje się w ogóle: 0-49 przez 20 gy”). **Obie były ARTEFAKTEM NIEDOPRECYZOWANEGO
> FIXTURE'U.** Bootowałem `scenario: 'civilization', aiEmpires: 2` bez pozostałych parametrów
> `DRIVER_DEFAULTS` — w takim świecie AI **nie ma ani jednej placówki**, więc nie ma trasy, nie ma
> kuriera i nie ma dopływu rud. Po przejściu na boot skalibrowany (`civilization_boosted`, `solo`,
> `planetClass: 'REAL'`, przypięty `HEADLESS_GALAXY_SEED`) **Fe w stolicy wynosi 12 411 – 20 484**,
> a okrętów dalej jest **zero**. ⇒ żelazo nie było przyczyną, tylko objawem mojego stanowiska.
> **Zachowane jako ostrzeżenie, nie jako wynik** — patrz §4 (lekcja o fixture) i Finding 215.

## 2. ⚠ 178 i 180 to TEN SAM defekt z dwóch końców jednej linii

- **180** (zapisane): *„`H` ma `rarity: 5` ⇒ zwożony pierwszy i nieprzetwarzany"* — **nadmiar**.
- **178** (⚠ **wyprowadzone ze źródła, NIE zmierzone** — patrz etykieta §1): **`Fe` ma `rarity: 1`
  ⇒ byłby ładowany ostatni** — **niedobór**.

**Zapas H z Findingu 180 jest tym, co FIZYCZNIE wypycha Fe z ładowni.** Jedno sortowanie, dwie strony.

⇒ Wariant, który zmniejszy rare-first, powinien **obniżyć nadmiar rzadkich** (koniec 180) *jednocześnie*
z podniesieniem Fe. Ryzykiem nie jest „trade", tylko **przestrzelenie w drugą stronę**: `H` zasila
rafinerie paliwa (otwarty wątek 180), więc wariant nie może go zagłodzić. **Dlatego guard metric mierzy
deltę w OBIE strony, nie tylko spadek.**

> ⚠ **Cała ta sekcja jest hipotezą o kodzie, który się nie wykonuje.** Zostaje, bo związek
> `rarity`-sortowania z Findingiem 180 jest realny w źródle i wróci, gdy transport ożyje —
> ale **dopóki `_loadByRarity` nie jest wołane, ani 178, ani 180 nie mają tu zmierzonego skutku**.

---

## 3. ⚠ WYCIĘTE — projekt wyceny wariantów (V-A/V-B/V-C)

> Sekcja definiowała trzy warianty ładowania i ich metryki. **Nie została wykonana i nie powinna być,
> dopóki `_loadByRarity` się nie wykonuje**: wszystkie warianty dały identyczny wynik (`wywolan = 0`,
> `zaladowano = 0`), bo podmieniana funkcja nigdy nie jest wołana. ⚠ Zachowana jest jedna rzecz,
> która okazała się cenna niezależnie od losu wariantów: **luka V-A** — sygnał popytu na rudy
> **nie istnieje w żadnym kanale** (`pendingShipOrders[].cost` to jedyne miejsce, gdzie `Fe` w ogóle
> występuje, a `_feedCommodityDemand` karmi nim `FactorySystem`, który rud nie produkuje) →
> **Finding 214**. Wraca razem z rozstrzygnięciem nazwy slice'u.

## 4. Instrument — promocja do korpusu keeperów (D-178-3)

Złożone w audycie `GameCore + DirectorProduction + żeton stacji` wchodzi jako
**`src/testing/headless/DirectorHarness.js`** (`bootWithDirector({ aiEmpires, seed })`), używane
i przez sondy, i przez keeper.

⚠ **Dwie pułapki, które harness MUSI wnieść ze sobą — obie kosztowały przebieg:**
- **stub stacji musi mieć `serialize`/`restore`** — autozapis woła je co rok gry, bez nich `SaveSystem`
  rzuca co tik i zalewa wyjście;
- **`Ticker` z `balans-driver`, nigdy własna pętla** — `core.tick()` **nie istnieje**, więc mój pierwszy
  przebieg stał na roku 0,0 i zwrócił fałszywe „zero wygaśnięć".

⚠ **POPRAWKA WŁAŚCICIELA DO D-178-3 — HARNESS MA PIEC W SOBIE KALIBRACJĘ.** `bootWithDirector`
domyślnie ustawia **`DRIVER_DEFAULTS` + `aiEmpires: true` + przypięty `HEADLESS_GALAXY_SEED`**,
z **jawnym opt-outem** dla kogoś, kto naprawdę chce inny świat. Powód jest zmierzony i kosztował
całą rundę: `GameCore.boot({ scenario: 'civilization', aiEmpires: 2 })` daje świat, w którym AI
**nie ma ani jednej placówki**, a jego ekonomia wygląda na zepsutą w sposób, w jaki zepsuta nie jest
(patrz wycięte §1.2). **Harness, który nie niesie kalibracji, przewozi tę pułapkę dalej.**

⇒ „Director nie montuje się headless" przestaje być właściwością środowiska. **Ta luka kosztowała
CZTERY ślepe plamy: GATE B2, 199, 208 — i tabelę podaży Fe (2026-09-01).**

✅ **ZBUDOWANE 2026-09-01** (`src/testing/headless/DirectorHarness.js`, keeper
`director_harness_smoke` 17/17). ⚠ Przy budowie wyszło, że §4 nie wymieniał **czwartego**
prerekwizytu: `InfluenceMap` **żąda `TerritoryService`** (R12), a `new InfluenceMap()`
przechodzi bez niego i rzuca dopiero przy PIERWSZYM ODCZYCIE. Wykryte przy migracji
`probe-w3-targets`, która montowała oba ręcznie i miała to spisane w komentarzu — czyli
wiedza BYŁA w repo, tylko nie w planie. Dlatego keeper pinuje `InfluenceMap` **WYKONANIEM**
(`getBorderSystems`), nie istnieniem obiektu.

---

## 5. Decyzje

| # | decyzja | status |
|---|---|---|
| **D-178-1** | wariant ładowania | ⚠ **ZAWIESZONE — NIE DO PODPISU.** Wariantów nie da się wycenić, dopóki `_loadByRarity` się nie wykonuje (wszystkie dały `wywolan = 0`). Wraca po rozstrzygnięciu **215** |
| **D-178-2** | zakres: tylko kurier AI | ✅ `_loadByRarity` ma **jednego wołającego**; `loadCargo` (gracz/transport) **nietknięty** |
| **D-178-3** | promocja instrumentu | ✅ **PODPISANE 2026-08-31 — ZBUDOWANE 2026-09-01** (`src/testing/headless/DirectorHarness.js`, keeper `director_harness_smoke` 17/17). ⚠ **Przez życie trzech slice’ów ten wiersz miał ✅, a pliku NIE BYŁO** — `git log --all --diff-filter=AD` na nazwie zwracał pustkę. Slice, razem z którym instrument miał powstać, został wstrzymany (D-178-1 ZAWIESZONE), więc instrument nie powstał wraz z nim, a ✅ czytało się jak „istnieje”. **✅ w planie znaczy „ZDECYDOWANE”; o tym, czy coś ISTNIEJE, mówi repo** (lekcja: `FE_SUPPLY_PLAN.md` §9). Pierwotny zapis: `DirectorHarness.js` + keeper na jego **montażu**, **z `DRIVER_DEFAULTS` + `aiEmpires: true` + przypiętym seedem jako DOMYŚLNYMI** (jawny opt-out) — §4 |
| **D-178-4** | kill-switch | ✅ **`FEATURES.courierLoadOrder`** — osobna od `defenseScope` (inna domena, inny rollback) |
| **D-178-5** | **TTL nietknięty** | ✅ własny audyt: **objaw, nie przyczyna**. Przy Fe 4/100 żaden TTL nie pomoże; wydłużenie zamieniłoby 15 cichych wygaśnięć w **jedno wieczne zlecenie**. Zmiana TTL = osobny kandydat z własnym uzasadnieniem |
| **D-178-6** | 180 poza zakresem | ✅ ale guard metric **JEST** pomiarem końca 180 |

---

## 6. ⚠ ZAWIESZONE — GATE (LIVE)

> Gate mierzył `kadlubyZeSkokiem` 0 → ≥ 1 na realnej produkcji i `forceStrike` na kadłubach
> zbudowanych przez AI. **Zostaje w mocy jako WYPŁATA slice'u** — ale slice musi najpierw dostać
> nazwę: dopóki przyczyną jest **próg `freePops` (215)**, gate testowałby naprawę, której nie ma.
> ⚠ Zachowane rozróżnienie, bez którego gate zmierzy nie to: kurierzy też są `hull_small`
> z `startShipBuild`, więc potwierdzenie „to OKRĘT WOJENNY” wymaga `directorOrigin` + `hasWeapons`
> (**Finding 213** — `TEMPLATE_ROLES` zna rolę `courier`, ale żaden szablon jej nie ma).
> ⚠ Uchwyt flagi to `KOSMOS.gameConfig`, **nie** `GAME_CONFIG` (błąd złapany już na trzech gate'ach).

---

## 7. Nowe findingi z tego audytu

- **213** ⚪ — `TEMPLATE_ROLES` zawiera `'courier'`, ale **żaden szablon nie ma tej roli**; kurierzy
  powstają przez `startShipBuild(capital, 'hull_small', modules)` wprost (`EmpireLogisticsSystem:284`).
  Martwa wartość enuma. **Istotne dlatego, że rozróżnienie kurier↔okręt wojenny w gate'cie §G.2 się o nią
  opiera** — dopóki roli nie ma, jedynym pewnym znacznikiem jest `directorOrigin` + `hasWeapons`.
- **214** 🟠 — **sygnał popytu na Fe wpada w kanał, który nie może go zaspokoić.**
  `_feedCommodityDemand` przepuszcza `Fe` (bo `getSafetyStockTarget('Fe') = 1`) i woła
  `factorySystem.setDemandBonus('Fe', …)` — a **`FactorySystem` nie produkuje rud**. Sprzężenie
  ekonomiczne, które miało „wepchnąć brakujące komodyty w priorytety produkcji", dla surowca
  **wygląda na działające i nie robi nic**. Rodzina 180 („brak procesu"), ale tu proces nie istnieje
  **z definicji**: rudę daje kopalnia i kurier, nie fabryka. ⚠ Konsekwencja projektowa: **nie ma ŻADNEGO
  kanału popytu na rudy**, więc wariant „ładuj proporcjonalnie do popytu" nie miałby z czego czytać
  poza `pendingShipOrders[].cost`.
- **215** 🔴 — **PRÓG `freePops` JEST DLA AI NIEOSIĄGALNY Z KONSTRUKCJI, a Population 2.0 Faza 2
  usunęła dokładnie takie bramki i TE DWIE przeoczyła.** Patrz §7.1 — to jest **przyczyna** 208 i 178.

### 7.1 Finding 215 — przyczyna, z kontrolą

`freePops = population − (employedPops − syntheticJobs) − lockedPops`, przy czym `_employedPops` liczy
**ETATY zarejestrowane przez budynki, NIE pracowników** (`GameScene:537-542` mówi to wprost).
`ColonyAutoExpander` stawia u AI **więcej etatów niż jest POPów**, więc `freePops` klamruje się do **0
na stałe** — dosypanie ludności nic nie daje, bo ekspander natychmiast dostawia etaty.

`CivilizationSystem:384` mówi to samo od strony projektu: *„przy projektowanej równowadze AI
`freePops ≈ 0`, więc **NIE bramkujemy** na `freePops`"* — i **FIX A** z Fazy 2 zdjął gate'y POP z budowy
budynków. **Sweep nie objął ścieżki AI.**

**RODZINA — co przechodzi, a co nie** (odpowiedź na pytanie „jedna bramka czy rodzina"):

| bramka | próg | ścieżka | stan |
|---|---|---|---|
| `EmpireLogisticsSystem._enoughFreePops` | **0,05** | **kurier logistyczny** | 🔴 **MARTWA** — `logistics:shipBuildRequested = 0` |
| `EmpireStrategySystem:432` (`_canAffordFullColony`) | **8** | **pełna kolonia AI** | 🔴 **MARTWA** — AI nie zakłada pełnych kolonii |
| `_canAffordOutpost` | — | **placówka** | ✅ **PRZECHODZI** — nie jest bramkowana `freePops`, **i dlatego placówki istnieją** |

⚠ To jest **RODZINA, nie pojedyncza bramka**. Naprawa samego kuriera zostawiłaby **kolonizację AI** za tym
samym progiem. (`FleetActions:237` i `Vessel.js:814` czytają `freePops` na ścieżce **GRACZA** — poza zakresem.)

**ZMIERZONE** (boot skalibrowany, 35 gy, 2 imperia):
`freePops` **5,00 w gy 0 → 0,00 od gy ~6 i już zawsze** · `logistics:shipBuildRequested = 0` ·
`stats.built/dispatched/delivered = 0/0/0` · trasy **istnieją** (2 i 1) z `courierIds = []` ·
imperium ma **ZERO statków** w gy 35 · `_shipyardSlotFree` **true przez cały czas** (czyta `shipQueues`,
nie `pendingShipOrders`, więc moje zlecenia wojenne slotu nie zajmowały).
**KONTROLA:** przebieg **bez moich zamówień wojennych** daje identyczny wynik ⇒ **to nie jest artefakt pomiaru**.

**PEŁNY ŁAŃCUCH SKUTKU:**
brak kuriera ⇒ brak **Nt** w stolicy ⇒ `quantum_cores` **i** `antimatter_cells` oba na „Nt 0/4"
⇒ `warp_cores` 0/2 ⇒ fregata (`engine_warp`) nie ma za co powstać ⇒ **13 wygaśnięć, ZERO okrętów w 35 gy**
= **Finding 208**.
⚠ `isRecipeAvailable = true` i tryb `reactive` dla całego łańcucha — **`FactorySystem` działa poprawnie**,
po prostu nie ma z czego. To **nie** jest „fabryka nie wybiera receptury".

---

## 8. Granice dowodu

Pomiar audytowy: **1 seed, 2 imperia, 40 gy** (`GameCore` domyślny, nie panel BALANS),
`DirectorProduction` wstrzyknięty ręcznie, rytm zamówień z rocznego sondażu (w grze daje go
`pressureResponse`). Wycena wariantów podnosi to do **panelu wieloseedowego**.
Nie mierzono: czy `pressureResponse` w realnym rytmie daje inny obraz; czy `_feedCommodityDemand`
realnie podnosi produkcję `propulsion_systems`; **czy `freePops = 0` u AI jest stanem POŻĄDANYM**
(Population 2.0 mówi „tak", ale to jest pytanie projektowe, nie pomiarowe — decyduje właściciel).
**Nic nie uruchamiane w przeglądarce.**

### 8.1 ⚠ LEKCJA O FIXTURZE — wiążąca dla każdego przyszłego pomiaru AI

`GameCore.boot` **bez** parametrów `DRIVER_DEFAULTS` produkuje ekonomię AI, która **wygląda na zepsutą
w sposób, w jaki zepsuta nie jest**: zero placówek ⇒ zero tras ⇒ zero dopływu rud ⇒ „Fe = 4, głód
żelaza". Ta diagnoza przeżyła w tym dokumencie jedną rundę i **była fałszywa**.

⇒ **Każdy headless pomiar AI zaczyna się od `DRIVER_DEFAULTS` + `aiEmpires: true` + przypiętego
`HEADLESS_GALAXY_SEED`.** Egzekwuje to `DirectorHarness` (D-178-3) — **domyślnie**, z jawnym opt-outem.

⚠ **Druga strona tej samej lekcji, ważniejsza:** trzy kolejne ramy tego slice'u („komodyty" → „żelazo"
→ „`warp_cores`") były **odczytami POŚREDNIMI** — pytałem, **czego brakuje**, zamiast pytać, **co się
nie wykonuje**. Przełom dał dopiero **licznik wywołań** (`wywolan = 0`) i **kontrola** (przebieg bez
moich zamówień).
**Brakujący zasób mówi, GDZIE jesteś. Nieuruchomiona funkcja mówi, DLACZEGO.**
