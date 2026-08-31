# 215 — bramki `freePops` na ścieżce AI, z gate'em 208

> **Status:** 📋 **PODPISANE 2026-08-31.** **D-215-1 = obie postacie** (kolonia → ZASTĄPIENIE
> predykatu, kurier → USUNIĘCIE pre-checku) · **D-215-1b = rezerwa 4** · **D-215-2 = JEDNA flaga
> `aiPopGates`** · **D-215-1c = pytanie WYMAGANE, nierozstrzygnięte** (krzywa `popTransferSize`).
> **Dwa commity, wzór DEFENSE_SCOPE:** C1 = predykaty (higiena + mała zmiana balansu),
> **C2 = `popTransferSize` dla AI, ląduje WYŁĄCZNIE po podpisie wartości przez właściciela.**
> Save **v101, zero migracji**. **Rejestr macierzysty:** `VESSEL_ORDERS_PLAN.md` §215 · §208 · §178.
> Poprzedni dokument tej rodziny: `COURIER_LOAD_ORDER_PLAN.md` (rama obalona pomiarem).
> Sondy: scratchpad, poza repo (`probe-178-pops.mjs`, `probe-178-three.mjs`, `probe-215-colony.mjs`).

---

## 0. Reguła wejścia

`git log -S "_enoughFreePops"` → **jeden commit** (`adc4a5b`, Slice 2 S3) · `git log -S "minFreePops"`
→ **`adc4a5b` + `8df4ac1`** (Slice 2 S2). **Żadna z bramek nie była nigdy rewidowana** i obie
powstały **na długo przed** Population 2.0.

`git log -S "freePops < jobs"` wskazuje **FIX A**: **`d95d9b8`** (Population 2.0 **Faza 2** — zdjęcie
gate'ów POP z budowy budynków), przy czym `popTransferSize` 2→8 przyszło commit wcześniej
(**`bc87846`**, Faza 1). ⇒ **Obie połowy niedopasowania wjechały w sąsiednich commitach, i żaden
nie tknął ścieżki AI.**

Keepery przed audytem: `director_ai_production` 32/32 · `director_production_foundation` 54/54 ·
`empire_logistics_courier` 10/10 · `balans_ai_report` 35/35 · `acceptance_retrofit` 38/38 — **zielone**.

---

## 1. PYTANIE ROZSTRZYGAJĄCE: bramka PRACY czy bramka KOSZTU?

**Odpowiedź jest RÓŻNA dla obu połówek — i dlatego kształt naprawy jest różny.**

### 1.1 Kolonia — **KOSZT, ŹLE ZMIERZONY** ⇒ ZASTĄPIENIE

```js
const popN = cfg.popTransferSize;      // 8   (Population 2.0 Faza 1: ×4, było 2)
civ.removePop('laborer', popN);        // ← REALNA strata na macierzystej
eb.bootstrapColony(..., { startPop: { laborer: popN }, ... });
```

Próg **`minFreePops: 8` jest DOKŁADNIE równy `popTransferSize: 8`** — napisano go jako „czy stać mnie
na wysłanie ośmiu?", tylko zmierzono względem `freePops`, które Population 2.0 przedefiniowało
w wielkość strukturalnie zerową dla AI.

⚠ **USUNIĘCIE tej bramki (FIX A verbatim) byłoby BŁĘDEM**: `removePop('laborer', 8)` pobiegłoby wobec
matki, która ośmiu robotników mieć nie musi ⇒ **populacja z niczego albo warstwa zepchnięta poniżej
zera**. Naprawa musi mierzyć **tę pulę, z której akcja NAPRAWDĘ płaci**.

### 1.2 Kurier — **KOSZT, ale STRAŻNIK JEST NIŻEJ I LEPSZY** ⇒ USUNIĘCIE

Budowa kuriera **nie kosztuje POP** (W2-4 zdjęło załogę z budowy). Koszt płaci **rozmieszczenie**:
`EmpireLogisticsSystem:373-376` woła `deployVessel`, a ta pobiera `crewCost` **`hull_small` = 0,2**
przez `commitCrew`.

⚠ **`commitCrew` NIE POTRZEBUJE `freePops`**: jego pojemność to `_unemployed` **+ Σ `_hostableIn(type)`
po warstwach** — czyli **zatrudnieni też mogą unieść blokadę**. Przy `freePops = 0` i zaludnionej
koloni `commitCrew(0,2)` **przechodzi**.

⇒ Pre-check żąda **0,05** z puli strukturalnie **zerowej**, stojąc przed prawdziwym strażnikiem, który
**stać na 0,2**. To jest **słabszy duplikat przed silniejszym oryginałem**.

### 1.3 ⚠ ŚCIEŻKA PORAŻKI — ZMIERZONA, I TO ONA ROZSTRZYGA NA KORZYŚĆ USUNIĘCIA

Wymóg właściciela: sprawdzić, **co się dzieje, gdy `deployVessel` odmówi PO zbudowaniu kadłuba**.

| pytanie | odpowiedź (źródło) |
|---|---|
| osierocony kadłub? | **NIE** — zostaje poprawnym kadłubem w REZERWIE, `serviceState` nietknięty |
| zmarnowane surowce? | **NIE** — `commitCrew` przy odmowie **nie mutuje niczego** (`crewLocked` nieustawione) |
| cicha awaria? | **NIE** — `EmpireLogisticsSystem:377-383` emituje `director:mobilizeRejected` z `reason: 'courier_deploy_refused'` |
| retry co tik? | **NIE** — ponowienie przy kolejnym przebiegu dyspozytora (`LOGISTICS_INTERVAL_CIVYEARS`) |

⇒ **Porażka jest czysta i tania** ⇒ **usunięcie pre-checku, zgodnie z regułą właściciela.**
⚠ Ironia do zapisania: **W2-7 zbudowało tę obsługę porażki dla ścieżki, która nigdy się nie
wykonuje** — kurier nie dociera do `deployVessel`, bo nie zostaje ZBUDOWANY. Kolejny fix za martwą bramką.

---

## 2. ZMIERZONA TABELA TEMPA — połowa kolonizacyjna

Boot **skalibrowany** (`civilization_boosted`, `solo`, `planetClass: 'REAL'`, przypięty
`HEADLESS_GALAXY_SEED`), 100 gy, 2 imperia. Podmieniany **wyłącznie człon populacyjny**
`_canAffordFullColony`; reszta bramki (food/water/zasoby) produkcyjna i nietknięta.

| wariant | pełnych kolonii AI / 100 gy | pierwsza | matka: laborer/pop (emp_001 · emp_002) |
|---|---|---|---|
| **T0 — dziś, `freePops ≥ 8`** | **0** | — | 0/3 · 0/3 |
| **T1 — `laborer ≥ 8`, bez rezerwy** | **1** | gy 0,4 | 0/3 · 0/3 |
| **T2 — `laborer ≥ 8 + 4`** ✅ **PODPISANE** | **1** | gy **4,2** | **4/8** · 0/6 |
| **T3 — `laborer ≥ 8 + 8`** | **0** | — | 0/2 · 0/3 |
| **T4 — `laborer ≥ 8 + 16`** | **0** | — | 0/6 · 0/3 |

**Trzy odczyty:**
1. **T0 potwierdza martwą bramkę: ZERO pełnych kolonii AI w 100 gy.**
2. **Okno użytecznej rezerwy to 0-4.** Przy 8+ bramka zamyka się z powrotem, bo populacja matki AI
   dobija najwyżej do 3-8.
3. **Rezerwa robi dokładnie to, po co jest** (D-215-1b): T2 zakłada **później** (gy 4,2 zamiast 0,4)
   i zostawia matkę **mierzalnie zdrowszą** (4/8 zamiast 0/3). Cztery lata zwłoki za zdrową matkę.

### 2.1 ⚠ WIERSZE ODRZUCONE — „lekcja jałowego przejścia", zastosowana do TABELI

Uruchomiłem też dwa wiersze `popTransferSize` (P4: transfer 4, P2: transfer 2) i **wyrzuciłem oba**.
Sygnał ostrzegawczy był arytmetyczny: **P4 miał WYŻSZY próg i dał WIĘCEJ kolonii (12) niż P2
z progiem NIŻSZYM (1)** — wynik odwrotny do możliwego.

**Przyczyna, sprawdzona w źródle:** `EmpireStrategySystem._config(empire)` czyta
**`ARCHETYPES[empire.archetype].strategicColonization` scalone nad modułowym `DEFAULTS`**.
Podstawiałem `emp.strategyConfig` i `ess._defaults` — **żadne z tych pól nie istnieje**, więc
`popTransferSize` **nigdy się nie zmienił**, a oba wiersze różniły się wyłącznie progiem z `fn`.

⚠ **To jest ta sama klasa, którą pinujemy w keeperach — tyle że w TABELI POMIAROWEJ.** Gdyby nie
odwrócona arytmetyka, wpisałbym „transfer 4 daje 12 kolonii" jako wynik i cały commit 2 stanąłby na
liczbie z fikcyjnego override'u. ⇒ **Dziura w tabeli zostaje ZAETYKIETOWANA, nie zalepiona** (D-215-1c).

---

## 3. Kształt naprawy — COMMIT 1 (predykaty)

**(a) Kolonia — ZASTĄPIENIE** w `EmpireStrategySystem._canAffordFullColony`:
```
było:  freePops < cfg.minFreePops                       → odmowa
jest:  laborerCount < cfg.popTransferSize + MOTHER_RESERVE → odmowa
```
`MOTHER_RESERVE = 4` (D-215-1b, podpisane). Mierzymy **tę samą pulę, z której płaci
`removePop('laborer', popN)`** — koniec rozjazdu „sprawdzam A, płacę z B".

**(b) Kurier — USUNIĘCIE** pre-checku `_enoughFreePops` z `EmpireLogisticsSystem`.
Prawdziwy strażnik (`deployVessel` → `commitCrew`) zostaje **nietknięty**, a jego ścieżka porażki
jest czysta (§1.3).

⚠ **`minFreePopsForCourier` i `minFreePops` znikają z konfiguracji razem z czytelnikami** —
martwy knob to knob, który kłamie (lekcja `SQUADRON_VS_DEFENDED` z DEFENSE_SCOPE C2).
⚠ **`_enoughFreePops` jako metoda też znika** — zostawiona byłaby gotową miną („czy AI ma wolnych
ludzi") dla następnej osoby, przy pojęciu, które dla AI nie znaczy tego, co brzmi.

---

## 4. COMMIT 2 — `popTransferSize` dla AI (⚠ TYLKO PO PODPISIE WARTOŚCI)

**Hipoteza do zmierzenia, NIE do założenia:** `popTransferSize = 8` to ~cała populacja matki AI
(3-8), bo Faza 1 ×4 podniosła koszt, a populacja AI nigdy nie urosła do tej skali. Jeśli tak,
**to koszt, a nie predykat, jest dominującą dźwignią** — T1/T2 dają 1 kolonię/100 gy, co przy
live-gate'cie przeczyta się jak „bez zmian".

**Pomiar (krzywa, wzór tabeli 199/210):** `popTransferSize` ∈ **{2, 4, 6, 8}** przy **rezerwie 4**,
boot skalibrowany, 100 gy, panel wieloseedowy.
**Metryki:** *kolonie/100 gy* (headline) · **krzywa drenażu matki** (laborer i pop w czasie, nie
tylko na końcu — bo „matka zdrowa na końcu" może ukrywać zapaść w środku) · liczba placówek
(kontrola: czy nie przesuwamy ekspansji z placówek na kolonie).

⚠ **OVERRIDE MUSI IŚĆ PRAWDZIWĄ ŚCIEŻKĄ**: `ARCHETYPES[<archetyp>].strategicColonization.popTransferSize`.
Każda inna droga da wynik jak w §2.1. **Sonda ma to pinować kontrolą: odczytać `_config(empire).popTransferSize`
po podmianie i porównać z zamierzoną wartością**, zanim policzy cokolwiek.

⚠ **Zmiana dotyczy WYŁĄCZNIE AI** (`ARCHETYPES`), nie gracza — `popTransferSize` gracza nie istnieje
na tej ścieżce, ale keeper ma to pinować, żeby nikt nie „ujednolicił" tego później.

---

## 5. Decyzje

| # | decyzja | status |
|---|---|---|
| **D-215-1** | kształt obu połówek | ✅ **kolonia = ZASTĄPIENIE, kurier = USUNIĘCIE** (§1) |
| **D-215-1b** | rezerwa matki | ✅ **4** — zmierzone: T2 matka 4/8 vs T1 0/3, koszt = 3,8 roku zwłoki |
| **D-215-1c** | `popTransferSize` | ⚠ **PYTANIE WYMAGANE, NIEROZSTRZYGNIĘTE** — krzywa z §4, wartość **podpisuje właściciel**, commit 2 nie ląduje bez podpisu |
| **D-215-2** | kill-switch | ✅ **JEDNA flaga `aiPopGates`** dla OBU commitów |
| **D-215-3** | martwe knoby | ✅ `minFreePops`, `minFreePopsForCourier`, `_enoughFreePops` — **usunięte razem z czytelnikami** |

### 5.1 Dlaczego JEDNA flaga (D-215-2), a nie dwie

Dwie flagi dałyby **stan, którego nikt nigdy nie wypuścił**: AI zakładające kolonie **bez logistyki**
albo kurierów latających do kolonii, **które nie powstają**. Obie bramki siedzą na **jednym łańcuchu
przyczynowym** (kurier → Nt → komponenty → okręt; kolonia → więcej stolic → więcej wszystkiego),
a kontrakt rollbacku ma znaczyć **„ekspansja AI zachowuje się dokładnie jak przed slice'em"**.
To ta sama argumentacja co `aiStrikeRecall` (Z2, D-Z2) i `defenseScope` (D-210-5).

---

## 6. GATE (LIVE) — dwa obserwable, po jednym na połowę

**§G.1 — połowa KOLONIZACYJNA: pierwsza pełna kolonia AI.**
Odczyt: liczba nie-placówkowych kolonii imperium rośnie; `ai:strategyColonyFounded` w `debugLog`.
**Horyzont: WCZESNY — pierwsza dekada.** Zmierzone headless: **gy 4,2** przy rezerwie 4.
Bramkowane tylko afordancją POP, więc nie czeka na tech ani na logistykę.

**§G.2 — połowa KURIERSKA → gate 208: pierwszy okręt wojenny zbudowany przez AI.**
Odczyt: `KOSMOS.debug.strikeReport('emp_001')` → **`kadlubyZeSkokiem` 0 → ≥ 1** na realnej produkcji,
bez `spawnEnemyRaider`.
**Horyzont: PÓŹNY — łańcuch jest długi i każde ogniwo dokłada czas:**
bramka techu (`engine_warp` ← `ion_drives`) **gy 11-14** *(zmierzone)* → kurier zbudowany i
zmobilizowany (mobilizacja **1 miesiąc wyświetlany**) → kursy po **Nt** → `quantum_cores`
i `antimatter_cells` (po 2) → `warp_cores` (2) → budowa fregaty.
⇒ **Nie oczekiwać okrętu przed gy ~20; gate ma mieć zapas do gy 40-60.**
⚠ **`ORDER_TTL_DISPLAYED_YEARS = 3` nie jest ruszany** (D-178-5), więc zlecenia w tym oknie będą
dalej wygasać i **wygaśnięcia NIE SĄ porażką gate'u** — liczy się pierwszy zbudowany kadłub.
⚠ Rozróżnienie kurier↔okręt wojenny: `kadlubyZeSkokiem` filtruje `warpFuel.max > 0` **i** `hasWeapons`,
ale potwierdzenie ma czytać też `directorOrigin` (**Finding 213**).

**§G.3 — kill-switch:** `KOSMOS.gameConfig.FEATURES.aiPopGates = false` ⇒ obie bramki wracają.
⚠ Uchwyt to `KOSMOS.gameConfig`, **nie** `GAME_CONFIG` (błąd złapany już na trzech gate'ach).

---

## 7. Świadomie poza zakresem

**Wielki slot kolonizacyjny 98-107 — NAZWANY, NIE WCIĄGANY.** Dotyka `createMission('colonize')`
(**100**: zero produkcyjnych wołających), trasy „obcej" blokującej POPy załogi **na zawsze** (**102**)
i osieroconych jednostek z `troop_bay` (**107**).
⚠ **215 rusza WŁASNĄ ścieżkę bootstrapową AI (`EmpireStrategySystem` → `bootstrapColony`), a nie
ścieżkę misji** — dziś się nie zderzają. Ale **oba piszą do tej samej księgowości populacji**, a
„POPy załogi zablokowane na zawsze" z **102** to **ten sam człon `lockedPods`**, który współtworzy
zerowy `freePops`. ⇒ **sąsiedztwo odnotowane, zakres rozłączny.**

Poza zakresem także: **180** (nadmiar rud rzadkich), **178 jako kolejność ładowania** (wraca dopiero,
gdy kurier zacznie latać — dopiero wtedy `_loadByRarity` w ogóle się wykona), **214** (brak kanału
popytu na rudy), **TTL** (D-178-5).

---

## 8. Granice dowodu

Tabela §2 to **1 seed, 2 imperia, 100 gy** — commit 2 podnosi to do panelu wieloseedowego.
`popTransferSize` **NIE ZMIERZONE** (§2.1). Nie mierzono: czy rezerwa 4 zachowuje się tak samo przy
większej liczbie imperiów; czy pierwsza kolonia AI utrzymuje się (nie mierzyłem jej przeżywalności,
tylko fakt założenia); czy `deployVessel` odmawia w praktyce po zdjęciu pre-checku (ścieżka porażki
sprawdzona **w źródle**, nie wywołana). **Nic nie uruchamiane w przeglądarce.**

⚠ **Lekcja z §2.1 wiążąca dla przyszłych pomiarów:** override w sondzie wymaga **kontroli, że wszedł**
— odczytania podmienionej wartości produkcyjną drogą przed policzeniem czegokolwiek. Bez niej tabela
pomiarowa może przejść **jałowo**, dokładnie jak pin.
