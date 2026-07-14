# S3.4c — Plan implementacji: unifikacja magazynu STACJA ↔ KOLONIA (Wariant B: depot-jako-proxy)

> **Status:** ZAPLANOWANE. Decyzje D1–D9 zatwierdzone przez Filipa. Implementacja NIEROZPOCZĘTA.
> **Ten dokument jest samowystarczalny** — świeża instancja Claude Code startuje wyłącznie z niego + repo.
> **Save bazowy:** v90 (bez bumpu — patrz D3). **Gałąź:** commit prosto na `main` (bez per-slice branchy).

---

## (a) KONTEKST

### Czym jest S3.4c
**Design ("orbitalna dzielnica"):** stacja orbitalna należąca do gracza, orbitująca ciało w systemie,
w którym gracz ma kolonię, przestaje mieć osobny magazyn — używa **magazynu kolonii macierzystej**
(`colony.resourceSystem`). Stacja staje się logistycznie „dzielnicą" swojej kolonii: budowa modułów,
budowa statków w stoczni, tankowanie i handel czerpią z jednego, wspólnego magazynu. Stacja **bez**
kolonii-matki w systemie (debug spawn, osierocona po zniszczeniu kolonii) zachowuje własny `StationDepot`.

**Implementacja: Wariant B (depot-jako-proxy).** `StationDepot` POZOSTAJE obiektem (inwariant
`station.depot instanceof StationDepot` zachowany), ale wewnętrznie **deleguje** `receive/spend/getAmount`
+ getter `inventory` do `colony.resourceSystem` kolonii-matki. Bezdomna stacja trzyma własną Mapę jak dziś.
Zaleta nad Wariantem A (getter zastępujący `depot`): brak pułapki serializacji (A: `s.depot.serialize()`
zwróciłby zagnieżdżony kształt kolonii → cicha korupcja save), zachowany inwariant typu, testowalność
w izolacji, transparentność dla `resolveTransferStore` i `StationSystem.serialize`.

### Lektura obowiązkowa PRZED kodem (w tej kolejności)
1. **`docs/audits/s34c-depot-unification-audit.md`** — PRZECZYTAĆ W CAŁOŚCI. Zawiera: porównanie kontraktów
   `StationDepot` vs `ResourceSystem` (zweryfikowane ręcznie + adwersaryjnie), mapy call-site (Obszary 1–6),
   ryzyka R1–R13 z mitygacją, tabelę A-vs-B. Każda decyzja D1–D9 poniżej ma tam uzasadnienie.
2. **`docs/plans/s34-stations-continuation.md`** — TWARDE OGRANICZENIA S3.4 obowiązują nadal:
   Wariant A architektury (stacja POZA `ColonyManager._colonies`), stacja NIGDY nie dotyka
   `CivilianTradeSystem`/`switchActiveColony`/`ColonyManager.serialize`; `Station` extends `CelestialBody`
   (type='station', orbital=null, x/y statyczne — anchored GEO); `StationDepot` = façade resSys-podobny.
3. **CLAUDE.md** — sekcja „S3.4 stacje — UKOŃCZONE" + konwencje (komentarze PL, nazwy EN, dwujęzyczność PL+EN
   ZAWSZE, migracje w `SaveMigration.js`, pliki krytyczne).

### Kluczowe fakty z audytu (skrót, ale czytaj pełny audyt)
- **Kontrakt zgodny:** `receive/spend/getAmount` + `inventory instanceof Map` funkcjonalnie równoważne dla
  realnych kluczy (Fe/Ti/Cu/Si/food/water/fuel/warp_cores/commodities). Podmiana store nie łamie call-site
  poza efektami ubocznymi. Metody nadmiarowe ResourceSystem (`canAfford`, `getResourceBreakdown`…) — zero
  call-site na braku depotu polega → zmiana addytywna.
- **Płatnik NIE jest zapisany na stacji:** `createStation` (`StationSystem.js:33`) zna `bodyId`+`systemId`,
  ale NIE `ownerColonyId`. Płatnik znany w `_tickPendingStationOrders` (`ColonyManager.js:1711/1734`).
- **`colony:destroyed` (`ColonyManager.js:593`) NIE czyści stacji** — żaden z 7 subskrybentów nie dotyka stacji.
- **Punkt dźwigni:** `resolveTransferStore` (`TransferStore.js:13`) + 6 fasad UI + tick płatności
  (`StationSystem.js:258/306`, `VesselManager.js:1617`) dziedziczą zmianę, gdy `station.depot` rozwiązuje się
  do kolonii.

---

## (b) DECYZJE D1–D9 (zatwierdzone przez Filipa — pełne brzmienie)

**D1 — Wyznaczenie kolonii-matki: stamp `ownerColonyId` przy budowie + fallbacki.**
Przy budowie stacji stampować na encji `station.ownerColonyId` = kolonia-płatnik (z
`_tickPendingStationOrders`, `ColonyManager.js:1711/1736`). Serializować (wzór `Vessel.homeColonyId`).
Rozwiązywanie matki (`resolveHomeColony(station)`), gdy `ownerColonyId` brak/nieaktualny — kolejność
fallbacków: **per-body** (kolonia gracza na `station.bodyId`) → **parent** (księżyc → `parentPlanetId` →
kolonia) → **jedyna** kolonia gracza w `station.systemId` (gdy dokładnie 1) → **depot** (brak matki →
własny depot). Guard: `ownerEmpireId !== 'player'` → od razu depot. **`debug.spawnStation` również
stampuje `ownerColonyId`** (gdy cel ma kolonię-matkę wg tej samej reguły), żeby ścieżka debug nie tworzyła
nienormalnych stanów.

**D2 — Proxy resolver wewnątrz `station.depot`; inwariant + serialize.**
`StationDepot` pozostaje obiektem — **inwariant `station.depot instanceof StationDepot` zachowany**.
Wewnątrz `receive/spend/getAmount` + getter `inventory` deleguje do `colony.resourceSystem` matki
(rozwiązanej przez `resolveHomeColony`), a dla stacji bezdomnej używa własnej Mapy. **`serialize()` NIE
zmienia kształtu** — nadal płaski `{goodId: amount}`: dla stacji z matką zwraca `{}` (delegat nie
przechowuje własnego stanu → nic do zapisania), dla sieroty zwraca własną Mapę jak dziś. `StationSystem.serialize`
(`StationSystem.js:108`) i `resolveTransferStore` pozostają **nietknięte** (proxy transparentny).

**D3 — Drain zawartości starych depotów do kolonii przy restore; idempotentny; save v90 bez bumpu; sieroty nietknięte.**
Migracja zawartości: NIE na surowym JSON. **Live-restore drain** w `StationSystem.restore` (po
`colonyManager.restore` — kolonie żyją, `GameScene.js:1292`): dla każdej odtworzonej stacji z matką
przelej `station.depot` (surowa Mapa z save) → `motherColony.resourceSystem.receive(...)` tym samym
resolverem co runtime, potem wyzeruj wewnętrzny stan depotu. **Idempotentny** — drugi przebieg drainu
NIE dubluje zasobów (po pierwszym drainie depot pusty → `receive({})` = no-op). **Save zostaje v90**
(round-trip, precedens S3.5b v86; brak wpisu w `MIGRATIONS`). **Stacje-sieroty NIETKNIĘTE** — ich depot
zostaje z zawartością (jedyny magazyn).

**D4 — Wspólny pool z `fuel`/`warp_cores`; auto-tankowanie z kolonii.**
Stacja z matką NIE ma osobnego mini-depotu paliwowego — `fuel`/`warp_cores` idą do wspólnego magazynu
kolonii (drain je również przelewa). Auto-tankowanie i ręczne tankowanie statków przy stacji
(`VesselManager.js:1573/1617/1729`) czerpią z puli kolonii-matki (statki stacyjne konkurują z hangarem
kolonii o to samo paliwo — zamierzone, jeden pool).

**D5 — Subskrybent `colony:destroyed` → osierocenie stacji (NIE zniszczenie).**
Dodać subskrybenta `colony:destroyed`: stacje, których matka (`ownerColonyId` lub rozwiązana) zniknęła,
zostają **osierocone** — przełączają się na własny `StationDepot` (nie są niszczone). Osierocenie „zamraża"
stację z pustym/własnym magazynem; moduły mogą głodować (brak zaopatrzenia). Stacja pozostaje encją gracza.

**D6 — `resource:changed` z operacji stacyjnych: POŻĄDANE.**
Efekty uboczne `ResourceSystem.receive/spend` (emisja `resource:changed` + `_deltaTracker`) z operacji na
stacji z matką są **pożądane** — semantycznie „operacja na stacji = operacja na kolonii". Bez cichego
write-path. Dostawy/budowa/tankowanie na stacji widoczne w bilansie i wykresach kolonii.

**D7 — `trade_module` → `tradeCapacity` kolonii-matki po `ownerColonyId`; bez capa; side-effect na migrację POP zaakceptowany.**
`trade_module` stacji dolicza `Station.tradeCapacity` (getter `Station.js:65`, aktywne moduły) do
`_tcPool` kolonii-matki — **atrybucja po `ownerColonyId`** (deterministyczna, zero double-count nawet przy
2+ koloniach w systemie). **Bez capa** na bonus. Wstrzyknięcie w `_allocateTC` (`CivilianTradeSystem.js:207/224`).
**Side-effect zaakceptowany:** `_tcPool` współdzielony z `_routeMigration` (`:478`) → bonus zwiększa też
budżet migracji cywilnej POPów.

**D8 — Self-cargo wykluczony w `FleetManagerOverlay:8108`; `transport_passenger` zostaje; sieroty legalnym celem.**
Stacja z matką (self-cargo — ten sam magazyn) **wykluczona z celów `transport`** w `_getValidTargets`
(`FleetManagerOverlay.js:8108`, rozbić filtr per-`actionId`). **`transport_passenger` ZOSTAJE** (POP →
habitat stacji, niezależny od depotu). **Stacje-sieroty pozostają legalnym celem `transport`** (mają osobny
magazyn → transport ma sens).

**D9 — UI: „Wspólny magazyn: <kolonia>"; pickery canAfford na rozwiązanym store; StationPanel linia zaopatrzenia; fasady depotowe w EconomyOverlay out; sierota = depot + „Odcięta od zaopatrzenia".**
- Sekcje Depot (StationManagementView `:290-315`, StationPanel `:98/209-225`) dla stacji z matką pokazują
  etykietę **„Wspólny magazyn: <nazwa kolonii>"** (zamiast duplikować listę).
- **Pickery canAfford (`StationManagementView.js:363/466`) — MUST-FIX** — czytać z rozwiązanego store
  (kolonia), nie surowo z `station.depot` (który i tak deleguje, ale must zapewnić poprawność).
- **StationPanel: linia zaopatrzenia** wskazująca kolonię-matkę.
- **Fasady depotowe w EconomyOverlay (`:95-105`) — OUT** dla stacji z matką (nie dodawać zakładki-fasady;
  duplikuje magazyn kolonii). Zostają dla sieroty.
- **Sierota:** sekcja Depot pokazuje własny depot + etykietę **„Odcięta od zaopatrzenia"**.

---

## (c) PLAN COMMITÓW (atomowe, prosto na `main`)

Kolejność zaprojektowana tak, by każdy commit był samodzielnie testowalny i nie zostawiał gry w stanie
niespójnym. Przy każdym: smoke MUSI być zielony przed przejściem dalej.

### Commit 1 — Proxy resolver + stamp `ownerColonyId` (D1, D2)
**Zmiany:**
- `Station.js` — pole `ownerColonyId` (konstruktor `config.ownerColonyId ?? null`; serializowane).
- Nowy helper `resolveHomeColony(station)` (kandydat: `StationSystem` lub `TransferStore`) — reguła D1
  (guard player → per-body → parent → jedyna → null) — JEDNO źródło prawdy dla magazynu I dla TC (D7).
- `StationDepot.js` — tryb proxy (D2): `receive/spend/getAmount` + getter `inventory` delegują do
  `resolveHomeColony(station).resourceSystem`, gdy matka istnieje; inaczej własna Mapa. `serialize()`
  bez zmiany kształtu (matka → `{}`, sierota → własna Mapa). Depot potrzebuje back-reference do stacji
  (przekazać przy konstrukcji `new StationDepot(config.depot, station)` lub late-bind w `Station` konstruktorze).
- `ColonyManager.js:1736` — stampować `ownerColonyId: colony.planetId` przy `createStation`.
- `StationSystem.createStation` — przyjąć + zapisać `ownerColonyId` z opts.
- `GameScene.js` debug `spawnStation` — stampować `ownerColonyId` wg reguły (D1).
- **Serialize `StationSystem.js:99-115` — dodać `ownerColonyId: s.ownerColonyId`** (L108 `depot.serialize()` bez zmian).
**Smoke:** proxy resolve (matka → deleguje do kolonii; sierota → własna Mapa); serialize kształt (matka `{}`,
sierota płaski); stamp przy budowie; fallbacki per-body/parent/jedyna/depot; guard AI → depot.
**Ryzyka adresowane:** R4 (guard AI), R6 (ownerColonyId determinizm), fundament R1/R7. Weryfikuje kontrakt
depot↔resourceSystem (audyt Fundament).

### Commit 2 — Drain przy restore + osierocenie (D3, D5)
**Zmiany:**
- `StationSystem.restore` — live-restore drain (D3): po odtworzeniu, dla stacji z matką przelej surowy
  `depot` z save → `motherColony.resourceSystem.receive(...)`, wyzeruj wewnętrzny stan. Idempotentny.
  ⚠ Uwaga na kolejność: drain PO `colonyManager.restore` (kolonie żyją — `GameScene.js:1292/1386`).
- Nowy subskrybent `colony:destroyed` (D5) — osierocenie stacji w zniszczonym systemie/po matce:
  przełącz na własny `StationDepot` (nie niszcz). Kandydat lokalizacji: `StationSystem` (własny `EventBus.on`).
**Smoke:** drain idempotentny (2× przebieg = ten sam stan kolonii, depot pusty); drain przelewa
`fuel`/`warp_cores` (D4); osierocenie po `colony:destroyed` (stacja żyje, depot własny, moduły bez zaopatrzenia);
save round-trip v90 (bez bumpu).
**Ryzyka adresowane:** R2 (colony:destroyed cleanup), R3 (migracja via live-restore, nie JSON), R11 (0 kolonii fallback).

### Commit 3 — Trade bonus + wykluczenie self-cargo (D7, D8)
**Zmiany:**
- `CivilianTradeSystem.js` — helper `_getStationTradeBonus(colony)` (wzór `_getBuildingBonus`): suma
  `st.tradeCapacity` po stacjach gracza z `ownerColonyId === colony.planetId` (atrybucja po ownerColonyId,
  D7 — zero double-count). Wstrzyknięcie w `_allocateTC` przed `return tc` (`:224`). Bez capa.
- `FleetManagerOverlay.js:8106-8120` — rozbić filtr per-`actionId` (D8): stacja z matką pominięta przy
  `'transport'`, zachowana przy `'transport_passenger'`; sierota (bez matki) legalnym celem `transport`.
**Smoke:** tc kolonii rośnie o bonus stacji (aktywny trade_module); double-count NIE występuje przy 2 koloniach
w systemie (atrybucja po ownerColonyId); wygaszony moduł (`active:false`) nie liczy; self-cargo wykluczony
(stacja z matką nie w celach `transport`); `transport_passenger` zachowany; sierota w celach `transport`.
**Ryzyka adresowane:** R5 (self-transfer jałowy), R6 (double-count via ownerColonyId), R9 (side-effect POP — zaakceptowany).

### Commit 4 — UI + i18n (D9)
**Zmiany:**
- StationManagementView `:290-315` — dla matki etykieta „Wspólny magazyn: <kolonia>"; sierota → depot +
  „Odcięta od zaopatrzenia". Pickery canAfford `:363/466` — czytać z rozwiązanego store (must-fix).
- StationPanel `:98/209-225` — linia zaopatrzenia (kolonia-matka) zamiast duplikatu listy depotu.
- EconomyOverlay `:95-113` — fasada/zakładka stacji z matką OUT (filtr w `_playerStationFacades`/`_getTabEntities`);
  sierota zostaje.
- i18n PL+EN — nowe klucze (`station.sharedStorage`, `station.supplyLine`, `station.cutOffFromSupply` itp.).
**Smoke/weryfikacja:** (UI głównie live-gate) — ewentualnie test logiki „czy fasada dodana" w
`_playerStationFacades` dla matki vs sieroty.
**Ryzyka adresowane:** R7 (redundancja UI + must-fix pickery canAfford).

### Commit 5 — Debug adjust + pełna regresja + docs
**Zmiany:**
- `GameScene.js:884` debug `stationFillDepot` — dla stacji z matką zasila magazyn kolonii (przez proxy),
  dla sieroty własny depot.
- Weryfikacja pominiętego konsumenta `loadOrbitalShells` (`Vessel.js:710-721` + `CargoLoadModal.js:462`) —
  dziedziczy proxy, potwierdzić że działa (R13).
- **Pełna regresja smoke S3.4/S3.4b + wszystkie nowe S3.4c** — wszystkie zielone.
- Docs: aktualizacja `s34-stations-continuation.md` (S3.4c DONE), CLAUDE.md, `memory/` wpis.
**Ryzyka adresowane:** R13 (loadOrbitalShells), R1 (potwierdzenie D6 pożądane), R8 (fuel pool), R10/R12 (benign — odnotować).

---

## (d) SMOKE DO NAPISANIA (`src/testing/smoke/`, trackowane — NIE `tmp_*` w root)

Konwencja: pliki w `src/testing/smoke/` są trackowane i uruchamiane w regresji (w przeciwieństwie do
jednorazowych `tmp_*.mjs` w root). Nazwa sugerowana: `s34c_depot_proxy_smoke.mjs` (+ ewentualny split per commit).

1. **Proxy resolve/fallback** — stacja z matką: `depot.receive/spend/getAmount` operuje na
   `colony.resourceSystem`; sierota: własna Mapa. Guard `ownerEmpireId !== 'player'` → depot.
2. **Stamp + fallbacki** — `ownerColonyId` stampowany przy budowie; `resolveHomeColony` fallbacki
   per-body → parent (księżyc) → jedyna-w-systemie → null (depot).
3. **Drain idempotentny** — 2× przebieg drainu = ten sam stan (kolonia +zawartość depotu RAZ, depot pusty).
   Osobno: drain przelewa `fuel`/`warp_cores` (D4).
4. **Osierocenie** — po `colony:destroyed` stacja żyje, przełączona na własny depot; moduły bez zaopatrzenia.
5. **TC z bonusem stacji** — `_allocateTC` kolonii rośnie o Σ aktywnych `trade_module`; double-count NIE
   przy 2 koloniach (atrybucja po `ownerColonyId`); wygaszony moduł nie liczy.
6. **Wykluczenie self-cargo** — stacja z matką poza celami `transport` (`_getValidTargets`);
   `transport_passenger` zachowany; sierota legalnym celem `transport`.
7. **Regresja stoczni/budowy na wspólnym magazynie** — budowa modułu (`StationSystem.js:306`) i statku
   (`:258`) spend z magazynu kolonii (nie osobnego depotu); canAfford na rozwiązanym store; serialize v90 round-trip.

⚠ Reguła projektu: **każda ścieżka rollbacku/failure = dedykowany test** (`testing-rollback-paths`) —
w szczególności: brak matki → depot, matka zniszczona → osierocenie, drain 2× → idempotencja.

---

## (e) LIVE-GATE (szkic dla Filipa — żywa gra OBOWIĄZKOWA przed raportem/commitem finalnym)

1. **Budowa modułu stacji** → zasoby schodzą z **górnej belki kolonii** (nie z osobnego depotu stacji).
2. **Stocznia stacyjna buduje statek BEZ `stationFillDepot`** — koszt pobrany z magazynu kolonii.
3. **Cargo do własnej stacji (z matką) znika z celów** transportu w panelu floty; **transport pasażerski
   pozostaje** (POP → habitat).
4. **Dok handlowy (trade_module) → `tradeCapacity` kolonii rośnie** (widoczne w zakładce Handel / TradeOverlay).
5. **Zniszczenie kolonii-matki** (np. kolizja/inwazja) → stacja **osierocona**, przełączona na własny depot,
   moduły **głodują** (brak zaopatrzenia), etykieta „Odcięta od zaopatrzenia".
6. **Round-trip save v90** — zapis → wczytanie → stan identyczny (drain idempotentny, brak dublowania zasobów).

---

## (f) PROTOKÓŁ STARTU (świeża sesja — wykonać po kolei)

1. **Przeczytaj TEN plik** (`docs/plans/s34c-depot-unification-plan.md`) w całości.
2. **Przeczytaj audyt** `docs/audits/s34c-depot-unification-audit.md` W CAŁOŚCI (uzasadnienia D1–D9, R1–R13).
3. **Przeczytaj continuation doc** `docs/plans/s34-stations-continuation.md` (twarde ograniczenia S3.4).
4. **`git log --oneline` od `1310312`** — sprawdź, czy stan repo się nie zmienił od zamrożenia.
5. **Odpal smoke S3.4/S3.4b z `src/testing/smoke/`** — WSZYSTKIE zielone przed dotknięciem kodu
   (baseline regresji). Uwaga: część historycznych smoke to `tmp_*.mjs` w root (untracked debris) — bazuj na
   trackowanych w `src/testing/smoke/`.
6. **Implementuj wg planu commitów (c)** — Commit 1 → 5, każdy z zielonym smoke przed następnym.
7. **STOP na live-gate (e)** — nie raportuj DONE bez żywej gry (reguła `live-game-mandatory-gate`).
   Pokaż dokładne edycje przed zastosowaniem, jeśli dotyczą współdzielonego configu/wartości wizualnych
   (`show-exact-edit-before-applying`, `confirm-shared-config-location-before-coding`).

---

## Mapa plików (dotknięte — z audytu)

| Plik | Rola w S3.4c |
|------|--------------|
| `src/entities/StationDepot.js` | **Proxy** (D2) — delegacja do kolonii / własna Mapa |
| `src/entities/Station.js` | `ownerColonyId` (D1); getter `tradeCapacity` (istnieje) |
| `src/systems/StationSystem.js` | `createStation` stamp (D1), `serialize` +ownerColonyId, `restore` drain (D3), subskrybent `colony:destroyed` (D5), `resolveHomeColony` |
| `src/utils/TransferStore.js` | (opcjonalnie) miejsce `resolveHomeColony`; `resolveTransferStore` transparentny |
| `src/systems/ColonyManager.js` | `:1736` stamp `ownerColonyId`; emiter `colony:destroyed` `:593` (bez zmian) |
| `src/systems/CivilianTradeSystem.js` | `_getStationTradeBonus` + wstrzyknięcie w `_allocateTC:224` (D7) |
| `src/ui/FleetManagerOverlay.js` | `:8108` filtr per-actionId (D8); `:1819` fasada dock (dziedziczy proxy) |
| `src/ui/StationManagementView.js` | `:290-315` etykieta wspólnego magazynu; `:363/466` pickery must-fix (D9) |
| `src/ui/StationPanel.js` | `:98/209-225` linia zaopatrzenia (D9) |
| `src/ui/EconomyOverlay.js` | `:95-113` fasada matki OUT (D9) |
| `src/scenes/GameScene.js` | `:884` debug `stationFillDepot` (D adjust), `spawnStation` stamp (D1) |
| `src/i18n/pl.js` + `en.js` | nowe klucze UI (D9) — PL+EN ZAWSZE |
| `src/testing/smoke/s34c_*.mjs` | smoke (d) |

**BEZ zmiany:** `SaveMigration.js` (save v90, round-trip — D3); `StationSystem.serialize:108` kształt depotu
(D2 transparentny); `resolveTransferStore` (proxy transparentny).
