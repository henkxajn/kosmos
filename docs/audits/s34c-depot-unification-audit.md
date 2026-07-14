# AUDYT S3.4c — Unifikacja magazynu: STACJA ↔ KOLONIA (wspólne inventory)

> **Status:** READ-ONLY. Nic nie zaimplementowano. Dokument decyzyjny.
> **Data:** 2026-07-14 · **Save bazowy:** v90 · **Metoda:** wielo-agentowy audyt (6 obszarów +
> adwersaryjny krytyk kompletności census + synteza) z ręczną weryfikacją kluczowych twierdzeń
> przez prowadzącego (kontrakt ResourceSystem, płatnik stacji, `colony:destroyed` cleanup,
> serialize L108, `FleetManagerOverlay` L8108).

**Kontekst decyzji:** rozważamy, by stacja orbitująca ciało w systemie z kolonią GRACZA używała
BEZPOŚREDNIO magazynu kolonii macierzystej (`colony.resourceSystem`) zamiast własnego `StationDepot`;
depot pozostawałby tylko dla stacji **bez** kolonii-matki. Dodatkowo `trade_module` stacji dodawałby
`tradeCapacity` do kolonii macierzystej zamiast wystawiać własną (dziś martwą) pojemność.

---

## TL;DR (8 punktów)

1. **Kontrakt jest zgodny.** `receive/spend/getAmount` + `inventory instanceof Map` w `StationDepot`
   vs `ResourceSystem` są funkcjonalnie równoważne dla realnych kluczy (Fe/Ti/Cu/Si/food/water/fuel/
   warp_cores/commodities). Mechaniczna podmiana store **nie łamie żadnego call-site** poza efektami
   ubocznymi (poniżej). Metody, których depot nie ma (`canAfford`, `snapshot`, `getResourceBreakdown`…)
   — zero call-site na nich polega → unifikacja addytywna.
2. **Punkt dźwigni:** uczynić `station.depot` rozwiązywalnym do `colony.resourceSystem`. Wtedy resolver
   `resolveTransferStore` (`TransferStore.js:13`) + 6 fasad + tick płatności dziedziczą zmianę za darmo.
3. **Największa zmiana behawioralna (R1, WYSOKA):** `ResourceSystem.receive/spend` emitują
   `resource:changed` i zasilają `_deltaTracker` (`ResourceSystem.js:169-170, 186-187`). Depot jest
   **celowo cichy** — po unifikacji dostawy/tankowanie/budowa na stacji zabrudzą wykresy/alerty kolonii.
4. **Self-transfer (R5, ŚREDNIA):** pętla cargo kolonia↔stacja-zunifikowana to jałowy bieg (net-zero na
   stanie, ale pali paliwo + utrzymanie Kr + oscyluje dostępnością; alert bezproduktywności zamaskowany).
   Blokować u źródła: `FleetManagerOverlay.js:8108` — pominąć stację przy `'transport'`, **zachować**
   przy `'transport_passenger'`. To JEDYNY punkt UI; brak automatu (CivilianTradeSystem 0 trafień na stację).
5. **Kolonia-matka nie jest zapisana na stacji.** Stacja zna `bodyId`+`systemId`, ale NIE `ownerColonyId`
   (kontrast: `Vessel.homeColonyId`). Płatnik jest znany przy budowie (`ColonyManager.js:1734`) — należy
   go stampować. Fallback na własny depot dla 0/2+/AI/osieroconych stacji jest REALNY i wymagany.
6. **`colony:destroyed` NIE czyści stacji (R2, WYSOKA).** `ColonyManager.js:593` bez subskrybenta stacji;
   `removeColony` niszczy hangar+trasy, nie stacje. Dziś działa „przypadkiem" przez globalny
   `_resolveHomeColony` → `homePlanet`. Po unifikacji trzeba domknąć osierocenie.
7. **Migracja: NIE na surowym JSON (R3, WYSOKA).** `ownerEmpireId` brak w `ColonyManager.serialize`
   (nie odróżnisz kolonii gracza od AI na gołym JSON), shape mismatch depot↔resourceSystem, ryzyko
   rozjazdu reguły matki. **Zamiast tego:** live-restore drain w `StationSystem.restore` tym samym
   resolverem co runtime. **Save zostaje v90** (precedens round-trip S3.5b v86).
8. **Rekomendacja kodu: Wariant B (depot-jako-proxy)** — mniejszy/bezpieczniejszy diff, brak pułapki
   serialize (którą wprowadza Wariant A), testowalny w izolacji, rozszerza istniejącą fasadę.
   `trade_module → _tcPool` kolonii = czysty add (mapować **per-body**, uwaga na side-effect migracji POP).

---

## Pytania do decyzji (Filip)

| # | Pytanie | Rekomendacja audytu |
|---|---------|---------------------|
| 1 | **Reguła 2+ kolonii w systemie** — stampować `ownerColonyId = płatnik` przy budowie i użyć jako źródła prawdy? | TAK — deterministyczne, zgodne z zakresem UI (build dialog dopuszcza tylko własną planetę/księżyc kolonii). Fallback dla starych save: preferuj kolonię na `bodyId`/`parentPlanetId`; przy nadal ≥2 → własny depot. |
| 2 | **Migracja zawartości depotów** — przelać do kolonii-matek czy zostawić jako stranded? | Live-restore drain w `StationSystem.restore`, **save v90 bez bumpu**. |
| 3 | **Los stacji po zniszczeniu kolonii-matki** — przejść na własny depot (nowy subskrybent `colony:destroyed`) czy zniszczyć stację z kolonią? | Osierocenie → własny depot (mniej destrukcyjne, zachowuje inwestycję gracza). Wymaga nowego subskrybenta (dziś brak). |
| 4 | **`fuel`/`warp_cores` z depotu** — kolonia przyjmuje je do wspólnego poola (statki stacyjne konkurują z hangarem), czy stacja trzyma mini-depot paliwowy? | Do rozstrzygnięcia — wpływa na R8 i na to, czy drain jest all-or-partial. |
| 5 | **`trade_module` bonus** — mapowanie per-body czy per-system? Cap? Akceptacja side-effectu na migrację POP (`_tcPool` współdzielony)? | **Per-body** (`getStationsAt(colony.planetId)`, zero double-count). Side-effect na migrację POP — świadoma akceptacja lub cap. |
| 6 | **Eventy `resource:changed` z operacji stacyjnych** — pożądane (semantycznie „to jest kolonia") czy tłumione (cichy write-path)? | Domyślnie: akceptacja (semantyka poprawna). Tłumienie = większy diff. |
| 7 | **Redundancja UI** — ukryć zakładkę-fasadę + sekcje Depot, czy przekierować z etykietą „magazyn wspólny z kolonią X"? | Do rozstrzygnięcia. Pickery canAfford (`StationManagementView.js:363/466`) to **must-fix niezależnie**. |
| 8 | **Wersja save** — zostać na v90 (round-trip) czy pusty `_migrateV90toV91` dla higieny łańcucha? | v90 wystarcza; bump opcjonalny. |

---

## Fundament — porównanie kontraktów (zweryfikowane ręcznie + adwersaryjnie)

### `StationDepot` (`src/entities/StationDepot.js`) — baseline

| Metoda | Zachowanie | Zwrot |
|---|---|---|
| `getAmount(id)` (L16) | `inventory.get(id) ?? 0` — surowy klucz, DOWOLNY towar | number |
| `receive(gains)` (L21) | pomija `amount<=0`; dodaje DOWOLNY klucz do Map; **BEZ eventów** | void |
| `spend(costs)` (L29) | weryfikuje wszystko → potem odejmuje; all-or-nothing. **BRAK guardu `amount<=0`** | **bool** |
| `serialize()` (L40) | `Object.fromEntries` niezerowych wpisów — **płaski** `{Fe:.., fuel:..}` | obiekt |
| `inventory` | żywa `Map` = jedyne źródło prawdy | Map |

Brak: pojemności, `_deltaTracker`, producentów, `time:tick`, remapowania kluczy, specjalnego
traktowania energy/research, `canAfford`/`snapshot`/`getResourceBreakdown`.

### `ResourceSystem` (`src/systems/ResourceSystem.js`) — cel unifikacji, RÓŻNICE

| Aspekt | ResourceSystem | Skutek dla użycia jako magazyn stacji |
|---|---|---|
| **efekty uboczne** receive/spend (L169-170, 186-187) | `_syncLegacyProxy()` + `_emitChanged()` (`resource:changed`) + `_deltaTracker` obserwuje delty | **R1 — NAJWIĘKSZA ZMIANA.** Ruch „na stacji" trafi do statystyk/alertów kolonii. Depot był cichy. |
| **energy w receive** (L178) | **POMIJANE** (flow, nie zapisywane) | Energy jako cargo **znika** (R10, NISKA — nikt nie wozi energy). |
| **energy/research w spend** (L161-165) | energy = no-op (nie odejmuje); research z osobnej puli | Koszty stacji nie zawierają energy → benign. |
| **research/energy w getAmount** (L241-242) | zwraca `energy.balance` / `research.amount` (NIE z Map) | `[...inventory]` nie pokaże energy/research — depot i tak ich nie trzyma. |
| **remap kluczy** `_mapLegacyKey` (L398-403) | `minerals→Fe`, `organics→food` | Depot używa kluczy kanonicznych → realnie irrelewantne. |
| **whitelist towarów** | **BRAK** — dowolny klucz → Map (poza energy/research) | `structural_alloys`/`warp_cores`/`polymer_composites` przechodzą **identycznie** — NIE odrzucane. |
| **`spend` zwrot** | **bool** (L171) — identyczny | `_refuelTank`/`_bestEffortLoad`/`queueStationShip` działają bez zmian. |
| **`spend` guard `amount<=0`** (L153/160) | pomija (`continue`) | Depot NIE guarduje → dywergencja (R12, NISKA, benign dla dodatnich kosztów). |
| **`inventory instanceof Map`** | TAK | `_getAvailable` (`Vessel.js:551`) działa bez zmian. |
| **metody nadmiarowe** (`canAfford` L191, `getResourceBreakdown` L286, `snapshot`, …) | istnieją | **Zero call-site polega na braku tych metod** (poza guardem `EconomyOverlay.js:312`). Unifikacja addytywna. |
| **serialize** (L372) | `{inventory:{...}, research:N}` — **zagnieżdżony** | Shape mismatch vs płaski depot → istotne dla Wariantu A serialize (patrz Rekomendacja). |

> **Wniosek fundamentalny:** podmiana `depot → colony.resourceSystem` jest kontraktowo bezpieczna dla
> wszystkich realnych kluczy. Jedyne prawdziwe ryzyka to (1) efekty uboczne eventów/`_deltaTracker`
> (R1), (2) semantyka/redundancja UI (R7), (3) shape serializacji (przy Wariancie A).

---

## Obszar 1 — Konsumenci depotu (mapa call-site + skutek unifikacji)

**Punkt centralny:** `resolveTransferStore(id)` (`src/utils/TransferStore.js:13-20`) — kolonia →
`colony.resourceSystem`, stacja → `station.depot`. **Jedyny wspólny resolver** dla MissionSystem (cargo)
i VesselManager (refuel). Zmiana tu propaguje się automatycznie.

| # | plik:linia | kier. | opis | skutek po unifikacji |
|---|---|---|---|---|
| §1 | `TransferStore.js:13-20` | READ | resolver magazynu (fallback `ent.depot` L18) | **główny punkt zmiany**: dla stacji z matką zwracać `colony.resourceSystem` |
| §2 | `StationSystem.js:306` | WRITE | `_tickModuleOrders`: `station.depot.spend(o.cost)` | bool zgodny; **emisja `resource:changed` co budowę** |
| §3 | `StationSystem.js:258` | WRITE | `queueStationShip`: `station.depot.spend(cost)` | jw.; koszt kanoniczny (Fe/Ti + polymer_composites/Xe) |
| §3 | `StationSystem.js:262` | READ | pętla `missing`: `station.depot.getAmount(id)` | zgodny |
| §4 | `GameScene.js:884` | WRITE | debug `stationFillDepot`: `st.depot.receive(fill)` | dosypywałby do kolonii (lub zostawić dla sierot) |
| §5 | `VesselManager.js:1614-1618` | READ | `_tickRefueling`: `getColony` null → `{resourceSystem: st.depot}` | statek tankuje z puli kolonii (R8 — jeden pool) |
| §5 | `VesselManager.js:1573` | WRITE | `_refuelTank`: `spend({[fuel]: canFuel})` — bool gate | zgodny (`fuel`/`warp_cores` zwykłe klucze) |
| §5 | `VesselManager.js:1729-1735` | R+W | `manualRefuel`: `resolveTransferStore(dockedAt)` | dziedziczy §1 |
| §6 | `MissionSystem.js:2004→2015` | R→W | `_processTransportArrival`: `store.receive(deliverable)` | dostawa → kolonia; **eventy** |
| §6 | `MissionSystem.js:1983/1990` | WRITE | `_tryResumeLoop`: `_bestEffortLoad(v, resolveTransferStore(...))` | dziedziczy §1 |
| §6 | `Vessel.js:550-579, 737` | R+W | `_getAvailable`/`loadCargo`/`unloadCargo` (store-agnostyczne) | `inventory` Map + spend/receive zgodne |
| §7 | `EconomyOverlay.js:101` | READ | fasada zakładki: `resourceSystem: s.depot` | **redundancja** — patrz R7 |
| §7 | `EconomyOverlay.js:312` | READ | guard `getResourceBreakdown` brak → skip | guard przestaje chronić → odsłania breakdown kolonii |
| §8 | `StationManagementView.js:291` | READ | panel Depot: `classifyStationDepot([...depot.inventory])` | pokaże pool kolonii |
| §8 | `StationManagementView.js:363/466` | READ | pickery canAfford: `station.depot?.getAmount?.(id)` | **MUST-FIX** — musi liczyć z efektywnego store |
| §9 | `StationPanel.js:98` | READ | sekcja Depot panelu: `[...depot.inventory]` | pokaże pool kolonii |
| §10 | `StationSystem.js:108` | SER. | `depot: s.depot.serialize()` | linchpin Wariantu A (patrz Rekomendacja) |
| §10 | `Station.js:34` | INIT | `this.depot = new StationDepot(config.depot)` | zostaje (fallback dla sierot) |
| §11 | `FleetManagerOverlay.js:1819-1820` | R+W | `_getVesselColony`: dock@stacja → `{resourceSystem: st.depot, isDepot:true}` | ręczny load/unload → pool kolonii |
| ⚠A1 | `Vessel.js:710-721` + `CargoLoadModal.js:462` | R+W | `loadOrbitalShells` — spend `orbital_shells` z depotu (przez fasadę §11) | **pominięty w census** — spend→bool, dziedziczy zmianę |

**`trade_module`/`tradeCapacity` — dziś MARTWY:** `Station.tradeCapacity` getter (`Station.js:65`) sumuje
aktywne moduły, ale `CivilianTradeSystem` go NIE czyta (2 konsumentów: panel display `StationManagementView.js:95`
+ debug `GameScene.js:925`). Wpięcie = czysty add. Szczegóły w Obszarze 4.

---

## Obszar 2 — Wyznaczenie kolonii macierzystej

**Jak tworzona jest stacja:** `createStation(bodyId, opts)` (`StationSystem.js:33`) bierze
`systemId = body.systemId ?? 'sys_home'` (L53). **`bodyId` NIE musi mieć kolonii** — jedyny wymóg to
istnienie encji ciała (L34). **Stacja NIE zapisuje płatnika** — brak `ownerColonyId`/`homeColonyId`
(kontrast: `Vessel.homeColonyId` `Vessel.js:151`).

**Kto płaci:** `_tickPendingStationOrders` (`ColonyManager.js:1709`) iteruje `_colonies`, `canAfford`
(L1720) → `spend` (L1734) → `createStation(order.targetBodyId, …)` (L1736). **Płatnik jest znany, ale
`createStation` go nie dostaje — informacja o macierzy ginie.**

**Obecne „home colony" jest GLOBALNE, nie per-stacja:** `_resolveHomeColony` (`StationSystem.js:425`)
→ `KOSMOS.homePlanet` → pierwsza kolonia gracza (L428-432). Używane do sink researchu z lab
(L385-387) i `colonyId` statków stoczni (L411). **Każda stacja kieruje research do TEJ SAMEJ home
planety — to już dziś niepoprawne dla stacji w innym systemie.**

**Zakres celów z UI:** build dialog (`ColonyOverlay.js:3008-3012`) dopuszcza WYŁĄCZNIE `colony.planet`
+ jej księżyce (`parentPlanetId === colony.planetId`). Czyli **przez UI macierz = płatnik, jednoznacznie**.

### Rekomendowana reguła (dwustopniowa)

**Krok A (preferowany):** stampować `ownerColonyId = colony.planetId` przy budowie (płatnik z
`ColonyManager.js:1736`), serializować na encji (wzór `Vessel.homeColonyId`). Zero dwuznaczności.

**Krok B (fallback dla starych save / debug spawn):** resolver `resolveHomeColony(station)`:
1. kolonia gracza na `station.bodyId` (`getColony`);
2. kolonia gracza na ciele-rodzicu (księżyc → `parentPlanetId` → `getColony`);
3. **jedyna** kolonia gracza w `station.systemId` (`getColoniesInSystem` L238 + `isPlayerColony`) gdy dokładnie 1;
4. inaczej (0 lub ≥2 nierozstrzygalne) → **brak macierzy → własny `depot`**.

**Guard:** `if (station.ownerEmpireId !== 'player') return null` jako PIERWSZA linia (stacje AI
nigdy nie sięgają magazynu gracza — Wariant A + mgła wojny).

### Reality check — czy powstają bezdomne stacje?

| Ścieżka | Ograniczenie celu | Bezdomna? |
|---|---|---|
| Build dialog UI (`ColonyOverlay.js:3008-3012`) | tylko `colony.planet` + księżyce | **Nie** |
| `queueStationOrder` debug (`GameScene.js:840`) | `targetBodyId` dowolny | Tak (celowo) |
| `spawnStation` debug (`GameScene.js:829-836`) | dowolne ciało, pomija pending/tech | **Tak** |
| **Zniszczenie kolonii-matki** (`colony:destroyed`) | — | **Tak (patrz R2)** |

> **KRYTYCZNE (zweryfikowane ręcznie):** `colony:destroyed` (`ColonyManager.js:593`) ma subskrybentów
> w GameScene/UIManager/MissionSystem/ColonyManager/VesselManager/EmpireLogisticsSystem/SingleGame —
> **żaden nie czyści stacji**. `removeColony` (L553) niszczy hangar+trasy, nie stacje. Stacja przeżywa
> jako sierota. **Fallback „depot dla bezdomnych" jest realny i wymagany.**

**`ownerEmpireId`:** brak jakiejkolwiek ścieżki tworzenia stacji AI (wszystkie `createStation` = gracz).
Reguła unifikacji obejmuje wyłącznie `ownerEmpireId === 'player'`.

---

## Obszar 3 — Pętla cargo po unifikacji (self-transfer)

**Pełna pętla:** gracz konfiguruje `transport` w `FleetManagerOverlay` → `expedition:transportRequest`
(`FleetActions.js:150`) → `MissionSystem._launchTransport` (L761). Stacja staje się `loopTargetId`
(L867-872). Magazyn rozwiązywany przy przylocie: `_processTransportArrival` → `resolveTransferStore`
(L2004) → `store.receive` (L2015). Pętla: `_continueTransportLoop` (L1827), `_bestEffortLoad` (L1869),
`_tryResumeLoop` (L1969).

**Mechanika `source === dest` (ten sam obiekt):** prześledzony cykl Fe/Ti →
**NIE no-op, NIE runaway, NIE bug księgowy** (ilości zachowane: `spend` przed load `Vessel.js:578`,
`receive` raz `MissionSystem.js:2015`, cargo czyszczone). Ale to **jałowy bieg z realnymi kosztami**:

1. **Marnowane paliwo** (`MissionSystem.js:1909`) + **utrzymanie Kr** (S3.5a-1) — gracz płaci za pętlę bez transferu.
2. **Fantomowy niedobór** — towar znika ze wspólnego magazynu na czas legu (`spend`), wraca na przylocie
   (`receive`) → oscylacja −100/+100 może fałszywie ruszać `scarcityMultiplier`/`resource:shortage`/ceny cross-empire.
3. **Alert bezproduktywności zamaskowany** — `_evaluateLoopProductivity` (`MissionSystem.js:1882`) zawsze
   widzi „produktywny" (`_lastOutLoaded>0`) → gracz nie dostanie ostrzeżenia.
4. **Trwałe uwięzienie towaru** — statek utknięty na brak paliwa (`waiting_reload` L1912) trzyma spent-cargo
   zdjęte ze wspólnego magazynu bezterminowo.

**Co wyłączyć (JEDYNY punkt UI):** `FleetManagerOverlay.js:8106-8120` — rozbić filtr per-`actionId`:
pominąć stację przy `'transport'` (cargo bez sensu), **ZACHOWAĆ przy `'transport_passenger'`** (POP →
habitat stacji, `_processPassengerArrival` L2156, niezależny od depotu).

**Brak automatu obchodzącego filtr (zweryfikowane negatywnie):** `RightClickMenuOptions.js` 0 trafień,
`CargoLoadModal.js` 0 trafień, `TradeRouteModal`/`TradeRouteManager` **plik nie istnieje** (pętle
wchłonięte do MissionSystem), `CivilianTradeSystem` 0 trafień na stację (Wariant A — stacja poza
auto-routingiem cywilnym). Zablokowanie u źródła jest szczelne.

**Tankowanie po unifikacji: TAK, poprawne i spójniejsze.** Statek przy stacji tankuje z tej samej puli
co hangar kolonii; brak podwójnego pobrania (każdy statek zadokowany w jednym miejscu, drenuje pulę raz/tick).
Motywacja wyłączania `refuelAutomatically` dla kurierów (`VesselManager.js:1600`) częściowo się dezaktualizuje.

---

## Obszar 4 — `trade_module` → `tradeCapacity` kolonii

**Gdzie liczony `tc`:** `_allocateTC(colony)` (`CivilianTradeSystem.js:207`):

```
TC(colony) = 200*pop + floor(prosperity/20)*50 + Σ (BUILDINGS[b].tcBonus × level)   [b ∈ _active]
             └─ L219 (baza pop+prosperity) ──┘   └─ _getBuildingBonus L676-690 (trade_hub/free_market) ─┘
```
(Outpost: TC wyłącznie z budynków, bez bazy pop — L210-213.)

**Cache czy na żywo?** **NA ŻYWO co 0.5 civY.** `_halfYearlyTick` (L74) przelicza `_tcPool` od zera
każdy tick: `col._tcPool = _allocateTC(col)` (L105-108); pola tymczasowe kasowane na końcu (`delete`
L838-839). `col.tradeCapacity` (L816) to tylko **echo do UI**. **Realny gating handlu = `_tcPool`**
(`_routeGoods` L275, migracja POP L478). Bonus trzeba doliczać w `_allocateTC` (każdy tick, bez ryzyka nadpisania).

**Najtańszy punkt wstrzyknięcia:** tuż przed `return tc` w `_allocateTC` (L224):
```js
tc += this._getStationTradeBonus(colony);   // nowy helper wzór _getBuildingBonus
```
Helper sumuje `st.tradeCapacity` (getter `Station.js:65`, poprawnie sumuje aktywne moduły
`tradeCapacityByLevel=[200,400,600]`) po stacjach gracza. **JEDNO miejsce** obsługuje routing (`_tcPool`),
UI (echo), outpost i migrację.

**⚠ Mapowanie kolonia→stacje (double-count):** `getStationsAt(bodyId)` (`StationSystem.js:81`) filtruje
per-body; brak helpera „stacje kolonii". **Wariant per-system: jeśli ≥2 kolonie gracza w systemie, każda
dostanie CAŁY bonus → wielokrotne liczenie.** Rekomendacja: **per-body** (`getStationsAt(colony.planetId)`),
ewentualnie + stacje na księżycach planety.

**Efekty uboczne:** (1) większy wolumen handlu (zamierzone); (2) **większy budżet migracji POP** —
`_routeMigration` (L478) używa TEGO SAMEGO `_tcPool` (uboczne, do akceptacji lub cap). **Bez wpływu**
na liczbę połączeń (`_calcAllConnections` L144 — niezależna od TC) ani trade-network prosperity bonus.

---

## Obszar 5 — Save / migracja

**Obecny serialize/restore:** `SaveSystem._serializeCiv4x` (`SaveSystem.js:157`) → `civ4x.stationSystem`.
`StationSystem.serialize` (L99-115) mapuje stacje; depot pod kluczem `depot: s.depot.serialize()` (**L108**,
zweryfikowane ręcznie) → **płaski** `{goodId: amount}`. Restore: `new Station({...sd})` (L123) →
`new StationDepot(config.depot)` (`Station.js:34`) → `new Map(Object.entries(data ?? {}))` (`StationDepot.js:12`).
Kolejność w GameScene: `colonyManager.restore` (L1292) → `stationSystem.restore` (L1386) — **gdy restore
stacji rusza, kolonie z `resourceSystem` JUŻ żyją.**

**Protokół:** `CURRENT_VERSION=90` (`SaveMigration.js:21`); wzór `_migrateV89toV90` (L2118): guard
`Array.isArray(stations)`, lazy-default per-stacja, `return data`. Precedens manipulacji depotem na JSON:
`_migrateV84toV85` (L2182, `s.fuelStore → s.depot`).

### Wariant (a) JSON-merge vs (b) live-restore drain

**Wariant (a) — wlanie depotu do kolonii na poziomie JSON — RYZYKOWNE:**
- **`ownerEmpireId` NIE jest w `ColonyManager.serialize`** (L2024-2054) → nie odróżnisz kolonii gracza od AI na gołym JSON.
- Reguła matki musiałaby być re-implementowana 1:1 z runtime → inaczej **cichy rozjazd zasobów**.
- **Shape mismatch:** depot płaski vs ResourceSystem zagnieżdżony.
- Orphan keys `fuel`/`warp_cores`; nieodwracalność.

**Wariant (b) — depot uśpiony, runtime czyta kolonię — REKOMENDOWANY:**
- **Zero manipulacji JSON.** Depot round-tripuje bez migracji. Precedens: S3.5b `tradeOrders`/`crossEmpireTrade`
  zostały **v86 bez migracji** (`GameState.js:30`); `shipQueues`/`refuelAutomatically` stacji też.
- Runtime: rozszerzyć `resolveTransferStore` (dla stacji z matką → `colony.resourceSystem`).
- **Jedyne ryzyko (stranded goods):** zawartość starych depotów niewidoczna. **Mitygacja: live-restore drain**
  w `StationSystem.restore` (kolonie żyją) — `station.depot.spend(...) → col.resourceSystem.receive(...)`
  TYM SAMYM resolverem co runtime (zero rozjazdu). Po wlaniu depot pusty/uśpiony.

**Rekomendacja: Wariant (b), save v90.** Bezpieczniejszy (bez JSON-owej rekonstrukcji własności/matki),
silny precedens, odwracalny.

---

## Obszar 6 — Powierzchnie UI

**Kto płaci za co dziś (kluczowe rozgraniczenie):**

| Koszt | Płacony z | Dowód |
|---|---|---|
| Budowa samej stacji | **magazyn kolonii** | `ColonyManager.js:1720/1734`; dialog `ColonyOverlay.js:3070` — **bez zmian** |
| Budowa modułu stacji | **depot** | `StationSystem.js:306`; UI `StationManagementView.js:363` |
| Budowa statku w stoczni | **depot** | `StationSystem.js:258`; UI `StationManagementView.js:466` |
| Tankowanie przy stacji | **depot** (fasada) | `VesselManager.js:1617` |

| Widok | plik:linia | Zmiana po unifikacji |
|---|---|---|
| EconomyOverlay — fasada stacji | `EconomyOverlay.js:95-105` | **Ukryć** dla zunifikowanej (duplikuje magazyn kolonii); zostaje dla bezdomnej |
| EconomyOverlay — guard breakdown / empty-state | `:312`, `:995-1001` | guard traci sens; „brak produkcji" sprzeczne — znika z fasadą |
| StationManagementView — panel Depot | `:290-315` | przekierować na magazyn kolonii lub ukryć |
| StationManagementView — pickery canAfford | `:363`, `:466` | **MUST-FIX** — czytać efektywny store (kolonię), inaczej Buduj gated na złym magazynie |
| StationPanel — sekcja Depot | `:98`, `:209-225` | przekierować lub oznaczyć „magazyn wspólny" |
| StationPanelLogic — `classifyStationDepot` | `:14-23` | bez zmian logiki; zmienia się tylko argument wejściowy |
| ColonyOverlay — dialog budowy stacji | `:3065-3076` | **bez zmian** (już płaci z kolonii) |

**Rekomendacja:** JEDNO źródło prawdy (np. `station.depot` rozwiązuje się do kolonii gdy zunifikowana) —
żeby UI (czyta depot) i tick płatności (`StationSystem.js:258/306`) nie rozjechały się.

---

## Weryfikacja kompletności census (adwersaryjny krytyk)

Werdykt: census **~95% kompletny, cytaty POPRAWNE**. Znaleziska:

- **A. Pominięty konsument:** `loadOrbitalShells` (`Vessel.js:710-721`) + `CargoLoadModal.js:462` — spend
  `orbital_shells` z depotu przez fasadę `_getVesselColony` (`FleetManagerOverlay.js:1819`). Store-agnostyczny
  (spend→bool), dziedziczy zmianę. Waga: niska, ale realny (R13).
- **B. Błędne cyt aty:** BRAK — wszystkie kluczowe linie trafiają w kod.
- **C. Dywergencja kontraktu (przeoczona w baseline):** `StationDepot.spend` NIE guarduje `amount<=0`
  (`StationDepot.js:29-37`) — inaczej niż `ResourceSystem.spend` (L153/160). Benign dla dodatnich kosztów (R12).
- **C. Wzmocnienie tezy:** brakujące metody depotu (`canAfford`, `snapshot`, `getResourceBreakdown`…) —
  **zero call-site polega na ich braku** (poza guardem `EconomyOverlay.js:312`) → unifikacja addytywna, bezpieczna.
- **C. Potwierdzenia:** efekty uboczne receive/spend (R1), energy-jako-cargo, research z osobnej puli,
  brak whitelisty — wszystkie **zweryfikowane jako POPRAWNE**.

---

## Ryzyka (R1–R13, wg dotkliwości)

| # | Ryzyko | Dotkliwość | Mitygacja |
|---|--------|:---:|-----------|
| R1 | Eventy `resource:changed` + `_deltaTracker` zabrudzą statystyki kolonii (`ResourceSystem.js:169-170,186-187`) | **WYSOKA** | Decyzja projektowa (semantyka poprawna) lub cichy write-path (większy diff) |
| R2 | Osierocenie stacji po `colony:destroyed` — brak cleanup (`ColonyManager.js:593`) | **WYSOKA** | Nowy subskrybent `colony:destroyed` → przełączenie na własny depot |
| R3 | Migracja na surowym JSON — `ownerEmpireId` brak w serialize, shape mismatch, rozjazd matki | **WYSOKA** | NIE migrować na JSON; live-restore drain; save v90 |
| R4 | Stacje AI sięgające magazynu gracza | **WYSOKA (bez guardu)** | Guard `ownerEmpireId !== 'player'` jako pierwsza linia resolvera |
| R5 | Self-transfer — jałowa pętla cargo (paliwo/Kr/oscylacja/maska alertu) | ŚREDNIA | Blokada u źródła `FleetManagerOverlay.js:8108` (pominąć `transport`, zachować `transport_passenger`) |
| R6 | 2+ kolonii w systemie — niejednoznaczność matki + double-count TC | ŚREDNIA | Stampować `ownerColonyId=płatnik`; TC mapować per-body |
| R7 | Redundancja UI (fasada + 2× sekcja Depot) | ŚREDNIA | Ukryć/przekierować; **must-fix pickery canAfford** `:363/466` |
| R8 | Współdzielenie paliwa kolonii (statki stacyjne vs hangar) | ŚREDNIA | Akceptacja (jeden pool) + przegląd `refuelAutomatically` kurierów |
| R9 | Bonus TC → side-effect na migrację POP (`_tcPool` współdzielony `:478`) | ŚREDNIA | Akceptacja lub cap |
| R10 | Energy jako cargo znika (`ResourceSystem.js:178`) | NISKA | Brak realnej potrzeby (energy nie jest towarem) |
| R11 | 0 kolonii (debug/obcy system) | NISKA | Fallback na własny depot = domyślna gałąź |
| R12 | Dywergencja `spend` guard `amount<=0` | NISKA | Odnotować (benign) |
| R13 | Pominięty konsument `loadOrbitalShells` | NISKA | Uzupełnić spis (dziedziczy zmianę) |

---

## Rekomendacja wariantu implementacji

**Fundament wspólny:** uczynić `station.depot` rozwiązywalnym do `colony.resourceSystem` — resolver +
6 fasad + tick płatności dziedziczą zmianę za darmo. Odrzucamy trzecią opcję („nowy getter
`effectiveStore` + zmiana ~13 call-site") jako większy diff.

| Kryterium | **A: getter zastępuje `depot`** | **B: depot-jako-proxy** |
|---|---|---|
| Rozmiar diffu | ~3–4 pliki | ~2–3 pliki |
| Call-sites czytające | 0 (transparentny) | 0 (transparentny) |
| **Serialize** | `StationSystem.js:108` **MUSI** zmienić na `_ownDepot.serialize()` — inaczej getter zwraca `colony.resourceSystem` → `.serialize()` daje `{inventory,research}` → restore = **cicha korupcja** | Bez zmian: proxy sam włada semantyką serialize |
| Ryzyko regresji | **Pułapka serialize** (cicha korupcja save) | Niskie |
| Bezdomne stacje | getter → `_ownDepot` | resolver→null → własna Map |
| Testowalność | Trudna (mock service locatora) | Łatwa (fake resolver vs null, izolacja) |
| Inwariant `depot instanceof StationDepot` | Złamany (`depot === colony.resourceSystem`) | **Zachowany** |
| Zgodność ze wzorcem | Rozpuszcza fasadę | **Rozszerza** istniejącą fasadę (CLAUDE.md: „StationDepot façade resSys-podobny") |

### ZWYCIĘZCA: **Wariant B (depot-jako-proxy)**

`StationDepot` pozostaje obiektem, ale wewnętrznie deleguje `receive/spend/getAmount` + getter `inventory`
do `colony.resourceSystem` matki (przez wspólny `resolveHomeColony`); bezdomne stacje trzymają własną Mapę.

**Uzasadnienie:**
1. **Brak pułapki serialize** — Wariant A wprowadza cichą korupcję save, jeśli ktokolwiek zostawi
   `StationSystem.js:108` jako `s.depot.serialize()`. B strukturalnie nie może tego popełnić.
2. **Zachowuje inwariant** „`station.depot` jest instancją `StationDepot`" (zakładany w `Station.js:34`,
   `StationSystem.js:108/123`, wszędzie w UI przez `[...station.depot.inventory]`). Zero zmian call-site.
3. **Testowalność** (reguła „każda ścieżka rollbacku = dedykowany test"): proxy w izolacji —
   resolver→fake ResourceSystem (delegacja) vs resolver→null (własna Mapa).
4. **Mniejszy diff** — logika unified-vs-homeless w JEDNEJ klasie; `StationSystem.serialize` +
   `resolveTransferStore` nietknięte (proxy transparentny).
5. **Odwracalność** — proxy z resolverem zawsze-null = powrót do dzisiejszego zachowania; dane depotu nietknięte.

**Koszt B:** proxy potrzebuje `resolveHomeColony` (potrzebny w OBU wariantach — koszt wspólny) + getter
`inventory` zwracający `target.inventory` lub własną Mapę.

---

## Świadomie POZA zakresem audytu (do planu implementacji)

- Dokładny kształt `resolveHomeColony` (Obszar 2 Krok A→B) i miejsce stampowania `ownerColonyId`.
- Decyzja o `fuel`/`warp_cores` (wspólny pool vs mini-depot paliwowy) — wpływa na drain all-or-partial.
- Subskrybent `colony:destroyed` osieracający stacje (R2) — dziś całkowicie brak.
- Rozstrzygnięcie redundancji UI (ukryć vs przekierować) + must-fix pickerów canAfford.
