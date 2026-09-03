# OGNIWO Nt — kurier, który nie ma jak dolecieć (F1 + F2 PODPISANE 2026-09-03)

> Slice przekrojowy, **NIE należy** do arca Fe (`FE_SUPPLY_PLAN.md` — tamten zamknął się na §14).
> Rejestr findingów: `VESSEL_ORDERS_PLAN.md` §**239-244** (+ **227**, **153**, **213**).
> Fixture kanoniczny: **`GATE-S4-fresh-gy60`**. Save **v101, bez migracji**.

**Jedno zdanie:** stolica AI stoi na `Nt = 0`, mając **≈ 37,7 tys. Nt we własnych placówkach** —
bo trasy kurierskie powstają **bez terminu układu**, a kurier jest z projektu **in-system**.

---

## 1. Reguła wejścia — wykonana

`git log -S` na ścieżce tras/kurierów (`_advanceRouteCourier`, `_loadByRarity` → jeden commit
`adc4a5b`, Slice 2 S3; `_createRoute` **nie istnieje** — trasy powstają inline w `_runDispatcher`).
Keepery zielone PRZED czytaniem: sweep **200/200 OK, 0 FAIL** (w tym `empire_logistics_courier`,
`fe_supply`, `ai_order_demand`, `director_harness`, `ai_pop_gates`, `colony_auto_expander`,
`ai_labor_budget`, `ai_uniform_staffing`).

**Sondy (untracked, `src/testing/headless/`):** `probe-nt-link.mjs` (rozpoznanie) ·
`probe-nt-dispatcher-gate.mjs` (która bramka dyspozytora zatrzymuje) · `probe-nt-route-ab.mjs`
(**A/B zakresu układu** + shape-check jednolinijkowców L1-L5) · `probe-244-cargo-epsilon.mjs`
(resztka `cargoUsed` + tabela prawdy bramek).

---

## 2. Co zostało ZMIERZONE

### 2.1 A/B — jedyna różnica to układ placówki

Harness sam nie zakłada placówek (zmierzone: kolonie 4, **placówki 0** w 15 gy), więc oba warianty
zbudowano **ścieżką produkcyjną** `bootstrapAutonomousOutpost`, na jednym boocie.

| | A — placówka w układzie stolicy (`sys_061`) | B — placówka w innym układzie (`sys_001`) |
|---|---|---|
| dokuje? | **tak**, `dockedAt=entity_80` | **nie**, `dockedAt=null` |
| `isSameSystem(kurier, placówka)` | `true` | `false` |
| stan po 15 gy | krąży, `delivered 18` | **bez zmian**, `orbiting_body` |
| Nt placówki | 5000 → 4766 (drenuje) | **5000 → 5000** |
| Nt stolicy | **0 → 234** (= 18 × 13, co do sztuki) | — |
| krzyk guardu W3-4b | 0 | **2** (`missionType:'logistics'`) |

Przebieg 60 gy na tym samym fixturze: `built 4 · dispatched 56 · delivered 52`, stolica **Nt 676** —
trasa w układzie jest **zdrowa i pozostaje zdrowa**, trasa międzyukładowa nie ruszyła nigdy.

### 2.2 Żywa gra (`GATE-S4-fresh-gy60`, paste właściciela)

`built 10 · dispatched 26 · delivered 16`; wszystkie pięć placówek **ma trasę** (`maTrase:true` —
brak trzeciego mechanizmu przez `_hasDeposit`), `port:false` na wszystkich (→ **243**),
`popytNaRudy {}` (→ Nt bez priorytetu, rzadkościowy przebieg z capem **13 Nt/kurs**).
**Sześć z dziesięciu** kadłubów stoi w pozie 239 (trasy cross: `entity_403`/`401`/`490`).

### 2.3 ⚠ Co zostało OBALONE — resztka `cargoUsed` (kandydat 244)

Hipoteza brzmiała: „gdzieś w cyklu rozładunek/powrót porównanie z zerem nie odpala na resztce, więc
kurier zostaje `in_transit` na zawsze". **Pomiar rozdzielił to na dwie różne tezy:**

* **Resztka ISTNIEJE — POTWIERDZONE.** Cykl symetryczny daje **dokładnie 0** (`a+x−x===a`);
  resztkę produkuje dopiero **asymetria wielokursowa** (ten sam surowiec ładowany w DWÓCH
  przebiegach `_loadByRarity`, rozładowywany JEDNYM wywołaniem): 8 kursów → `7,105e-15`,
  pełny przebieg 60 gy → **`1,4210854715202004e-14` — wartość z żywej gry co do bitu**.
* **Resztka NIE ZAMRAŻA — OBALONE.** Tabela prawdy: resztka przewraca **dokładnie dwie** bramki,
  obie kształtu `cargoUsed > 0` (`EmpireLogisticsSystem:441` → jałowy kurs; `TransportOrderSystem:246`
  → zlecenie gracza uznaje pusty statek za załadowany). **Żadna nie trzyma statku w `in_transit`.**
  Ta sama poza (`in_transit` + `dockedAt=null` + **ta sama wartość resztki**) wystąpiła na trasie
  **koronnie zdrowej**: `spozniony:false`, `zostalo:+1,64` roku, `delivered 52`.

⚠ **Okno 3 gy nie jest dowodem zamrożenia.** Kadencja żywa: 26 dyspozycji / 60 gy / 4 kadłuby ≈
**jeden kurs na ~9 gy na kadłub** ⇒ wartość oczekiwana w oknie 3 gy to ~1,3 dyspozycji, a zero
obserwacji ma prawdopodobieństwo rzędu ¼. **Rozstrzyga zegar misji (L5), nie licznik w krótkim oknie.**

---

## 3. Dwa nazwane martwe ogniwa

1. **239 — trasa międzyukładowa jest POCHŁANIACZEM KURIERÓW.** Brak terminu układu przy tworzeniu
   trasy + zwolnienie AI z bramki przedstartowej (D-SS5b) + poprawny guard przylotu (W3-4b) = statek
   w pozie, z której **żadna gałąź maszyny stanów nie może go zdjąć**, a jego etat blokuje następcę.
2. **241 — dwie podpisane decyzje wykluczają się.** Ekspansja cross-system jest nagrodą za
   `warp_drive` (S3.2 S3); kurier jest in-system z wykluczonym warpem (S3.2 S1), bo warp wymaga
   `warp_cores` ⇐ Nt ⇐ kuriera. **Zamknięte koło. To jest decyzja zdolnościowa, nie poprawka.**

Drugorzędne, ale nazwane: **13 Nt/kurs** (cap `cargoMax/3` przy wadze 5,0 — Nt jest **najcięższą**
rudą, a w tierze rzadkości 5 **Xe sortuje się przed nim**) oraz **pusta unia popytu na rudy**
(`_capitalOreNeed` czyta stalle fabryki i koszty zleceń okrętowych; przy pustej kolejce Nt nie ma
tam czego zgłosić) ⇒ na trasach zdrowych Nt jedzie **bez priorytetu i w kroplach**.

---

## 4. PODPISANY SLICE — F1 + F2 (D-Nt-1…D-Nt-4)

**Zakres:** przestać produkować martwe trasy i umieć odzyskać kadłub, który już w takiej utknął.
**Poza zakresem:** cokolwiek, co zwiększa ZASIĘG logistyki AI (to jest 241 — §6).

* **D-Nt-1 (F1) = W1** — `_runDispatcher` dostaje **termin układu** przy doborze placówek.
  Porównanie przez `isSameSystem` (**fail-OPEN**, `SystemScope`) — celowo NIE `getByTypeInSystem`
  i NIE `isSameSystemStrict`: to bramka strony ROZKAZU, a fail-closed skasowałby dziś działające
  trasy domowe, gdyby ciału brakowało stempla (dokładnie argument D-SS2).
  Odmowa jest **słyszalna**: `logistics:routeUnreachable { empireId, outpostId, outSystemId,
  capitalSystemId }`, **raz na decyzję**, nie co tik.
* **D-Nt-2 (F2) = W1** — watchdog kluczuje się na **ZEGARZE MISJI**, nie na pozie:
  `now >= (phase==='returning' ? returnYear : arrivalYear)` **i** brak postępu ⇒ odzysk przez
  **`_sendCourierHome`** (reuse — zero nowej matematyki trasy). Emit `logistics:courierRecovered`.
  ⚠ **Poza jest dziś JEDNA** (239). Reguła zegarowa pokrywa obie kształty, gdyby druga się pojawiła,
  i — co ważniejsze — **nie może dotknąć statku w locie**, bo ten nie jest spóźniony.
* **D-Nt-3 = W1** — **jedna flaga `FEATURES.aiCourierRouteScope`** na C1 **i** C2. OFF = zachowanie
  sprzed slice'u **co do bitu**. Dwie flagi dałyby trzeci stan („bramka bez odzysku"), w którym
  martwe trasy nie powstają, ale stare kadłuby zostają uwięzione — czyli stan, którego nikt nie chce
  utrzymywać (wzór: jedna flaga na zamiatacz i filtr w `aiStrikeRecall`).
* **D-Nt-4 = W2** — poprawka **244** wchodzi w TEN slice, ale **osobnym commitem i BEZ flagi**:
  flaga na rekoncyliacji arytmetyki instytucjonalizowałaby rozjazd dwóch pól, które mają być jednym.

### Nowe powody odmowy → `DebugLog.TRACKED_EVENTS` w TYM SAMYM commicie
`logistics:routeUnreachable` (C1) · `logistics:courierRecovered` (C2). Reguła z W3: nowy powód
odmowy, którego nie ma na liście audytu, sprawia, że gate mierzy ciszę.

---

## 5. SPLIT COMMITÓW (proponowany, do wykonania po zielonym L5)

Kontyngencja pierwszego commitu **ROZSTRZYGNIĘTA**: `built 10 > 0` **i** `delivered 16 > 0`, więc blokada NIE jest
w ścieżce budowy — kurierzy POWSTAJĄ i kiedyś DOWOZIŁY ⇒ **C1 zostaje pierwszy**. ⚠ Odczyty `pendingBuildRoute` i kolejki stoczni NIE były w paste'cie i nie są tu twierdzone.

| commit | treść | keeper (fail-first + kontrola niejałowości) |
|---|---|---|
| **C1 — F1** | termin układu w `_runDispatcher` + `logistics:routeUnreachable` + `TRACKED_EVENTS` + flaga | `nt_route_scope_smoke`: **T1** dziś trasa cross POWSTAJE (pin defektu) · **T2** po naprawie NIE powstaje, z powodem · **T3 KONTROLA NIEJAŁOWOŚCI: trasa w układzie NADAL powstaje I NADAL dowozi** (`delivered > 0`, zasób stolicy rośnie) — bez tego C1 „przechodzi", wyciszając wszystko · **T4** flaga OFF = dziś co do bitu · **T5** pin źródłowy: powód jest w `TRACKED_EVENTS` |
| **C2 — F2** | watchdog na zegarze misji + `_sendCourierHome` + `logistics:courierRecovered` | `nt_courier_watchdog_smoke`: **T1** dziś kadłub w pozie 239 tkwi w niej bezterminowo · **T2** po naprawie wraca, etat trasy zwolniony · **T3 KONTROLA: zdrowy kurier W LOCIE — `spozniony:false`, Z RESZTKĄ `1,42e-14` — NIE jest ruszany** (fixture wprost z żywego paste'u) · **T4** flaga OFF = brak odzysku |
| **C3 — 244** | rekoncyliacja `cargoUsed` (jedno źródło: przelicz z `vessel.cargo`, ten sam helper w `loadCargo`/`unloadCargo`) | `cargo_used_reconcile_smoke`: **T1** dziś 8 kursów zostawia `7,105e-15` · **T2** po naprawie **dokładnie 0** + inwariant `cargoUsed === Σ qty·weight` po KAŻDEJ operacji · **T3** obie przewrócone bramki zachowują się poprawnie (brak jałowego kursu; `TransportOrderSystem:246` nie uznaje pustego statku za załadowany) · **T4** kontrola: cykle symetryczne dają wartości IDENTYCZNE z dzisiejszymi |

**Dlaczego C3 na końcu:** jego kontrolą regresji jest „keepery C1/C2 dalej zielone", a jego jedyny
behawioralny skutek (jałowy kurs) staje się obserwowalny dopiero, gdy trasy są już uczciwe.

---

## 6. FOLLOW-UP — 241 dostaje traktowanie S1/S4a: NAJPIERW TABELA (zaprojektowana, NIEURUCHOMIONA)

⚠ **Nic z tego nie jest podpisane.** To projekt pomiaru, który ma poprzedzić decyzję zdolnościową.

**Warianty:** **R0** dziś (po C1+C2) · **F3** kurier warp (silnik warpCapable + composite przez
`OrderService`; wymaga rozstrzygnięcia zamkniętego koła `warp_cores` — np. zwolnienie AI analogiczne
do dzisiejszej odporności paliwowej) · **F4** siting: nie zakładaj placówki, której nie obsłużysz
(zmiana w `EmpireStrategySystem`, kasuje część nagrody z S3.2 S3) · **F5** przepływ abstrakcyjny
outpost→stolica (wymaga rozstrzygnięcia **243**: albo placówki dostają port, albo warstwa 1 traci
jedyną bramkę fizyczności).

**Metryki (headline pierwszy):** `kadlubyZeSkokiem` · Nt w stolicy (stan **i** skumulowana dostawa) ·
`delivered`/`dispatched` · kadłuby czynne vs bezczynne · liczba placówek (kontrola: F4 nie ma prawa
jej zwiększyć) · **kontrola strony gracza: bez zmian** (żaden wariant nie ma dotykać logistyki gracza).

**Protokół:** dwa ziarna, horyzont ≥ 60 gy, **każdy wariant w OSOBNYM procesie** (Finding 228) —
tabela z jednego procesu jest podejrzana, dopóki pin izolacji nie mówi inaczej. Fixture: świeży boot
**plus** kontrola na `GATE-S4-fresh-gy60` (stan, w którym 6 kadłubów już utknęło).

**Co falsyfikuje który wariant:** F3 — jeśli po odblokowaniu warpu `kadlubyZeSkokiem` dalej 0, wąskim
gardłem nie był transport, tylko popyt/receptura; F4 — jeśli liczba placówek spada, a Nt w stolicy
nie rośnie, zapłaciliśmy ekspansją za nic; F5 — jeśli przepływ rusza, ale gracz zaczyna widzieć
teleportację towarów AI, cena fizyczności jest realna.

---

## 7. GATE (do wykonania PRZED zamknięciem slice'u — checklista powstaje TU, nie po fakcie)

Zgodnie z lekcją `FE_SUPPLY_PLAN` §14.0: protokół gate'u, który żyje tylko w rozmowie, nie jest
artefaktem. Jednolinijkowce **wykonane** na harnessie (`probe-nt-route-ab.mjs` §F).

1. **L1** — `logistics.stats` + liczba tras/kurierów/rezerwy + `pendingBuildRoute`.
2. **L2** — trasy: układ placówki vs układ stolicy + stan każdego kuriera.
3. **L3** — wszystkie placówki: `maTrase`, `port`, zapas Nt.
4. **L4** — `_capitalOreNeed`, poziom i kolejka stoczni.
5. **L5** — **zegar misji**: `faza`, `cel`, `zostalo`, `spozniony` per kurier.
   ⇒ `spozniony:true` przy braku postępu = poza do odzyskania (C2); `spozniony:false` = statek w locie,
   **niczego nie ruszamy**.

**Kryteria PASS:** (a) żadna nowa trasa do placówki spoza układu, z powodem w `debugLog`;
(b) kadłuby uwięzione w pozie 239 wracają i **etat trasy się zwalnia** (`built` znów może rosnąć);
(c) trasy w układzie **nadal dowożą** (`delivered` rośnie, Nt stolicy rośnie) — to jest kontrola,
bez której (a) można „zdać" przez wyciszenie wszystkiego; (d) flaga OFF przywraca zachowanie sprzed.

---

## 8. Granice dowodu i rzeczy świadomie otwarte

* **239 udowodnione WYKONANIEM** na **skonstruowanej** placówce cross-system; że żywe pięć jest
  cross-system, wynika z paste'u L2/L3 (`teSameUklady:false` na trzech trasach), nie z tego pomiaru.
* **244 — połowa obalona** (§2.3). Cztery kadłuby „home" z paste'u są kandydatami na „w locie";
  **L5 zamyka to jednym odczytem**. Gdyby któryś czytał `spozniony:true` — jest to poza dla C2
  i wtedy (i tylko wtedy) mówimy o drugim kształcie zamrożenia.
* **Nie ruszamy** `_findNearestFriendlyPlanet` (Finding 154), bramki przedstartowej gracza (D-SS5),
  ani zwolnienia AI (D-SS5b) — to ostatnie jest **przesłanką** 239, ale jego zniesienie zamieniłoby
  ciche zamrożenie w cichy zator logistyki AI, czyli regresję gorszą od naprawianego defektu.
* **213** (żaden szablon nie ma roli `courier`) i **214** (popyt na rudę w kanale, który jej nie
  produkuje) sąsiadują z tą ścieżką i **nie wchodzą** do slice'u.
