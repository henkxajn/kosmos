# Audyt systemu stacji orbitalnych (KOSMOS)

> **Status:** read-only audit, 2026-07-03. Żaden plik gry nie został zmieniony (jedyny utworzony plik to ten raport).
> **Cel:** fundament pod przeprojektowanie stacji w pełnoprawny ekran gracza, zintegrowany z widokiem *Colonies* (docelowo: stacja jako kolonia z POP, moduły stoczni, urządzenia badawcze/pomiarowe).
> **Metoda:** bezpośrednia lektura 7 plików rdzenia + 7 równoległych agentów mapujących powierzchnie integracji. Wszystkie ustalenia mają cytaty `plik:linia` + nazwę funkcji/klasy.

**Jednozdaniowy werdykt stanu:** Stacja orbitalna to dziś **osobna encja** (`Station extends CelestialBody`, `type:'station'`) w `EntityManager`, funkcjonalnie równa **pasywnemu magazynowi paliwa/towarów** kotwiczonemu na orbicie GEO — **bez POP, bez budynków, bez produkcji, bez utrzymania, bez AI, bez ekranu zarządzania**. Cała jej "ekonomia" to `StationDepot` (opakowana `Map`) + jednorazowy koszt budowy.

---

## Spis treści
1. [Model danych](#1-model-danych)
2. [Logika / mechaniki](#2-logika--mechaniki)
3. [Rendering / scena 3D](#3-rendering--scena-3d)
4. [UI](#4-ui)
5. [Punkty zaczepienia pod redesign](#5-punkty-zaczepienia-pod-redesign)
6. [TL;DR](#6-tldr)
7. [Otwarte pytania do decyzji designera](#7-otwarte-pytania-do-decyzji-designera)

---

## 1. MODEL DANYCH

### 1.1 Definicja encji — `Station`

`src/entities/Station.js` — `class Station extends CelestialBody` (`Station.js:9`). Konstruktor ustawia:

| Pole | Wartość / źródło | Cytat |
|------|------------------|-------|
| `type` | `'station'` (twardo) | `Station.js:13` |
| `mass` | `config.mass ?? 0.0001` (znikoma — fizyka nie tyka stacji) | `Station.js:14` |
| `visualRadius` | `|| 3` | `Station.js:15` |
| `color` | `|| 0x44aaff` (hardcode) | `Station.js:16` |
| `orbital` | **`null`** — brak komponentu Keplera; pozycją zarządza `OrbitalSpaceSystem` | `Station.js:21` |
| `bodyId` | `?? null` — ciało, wokół którego orbituje | `Station.js:23` |
| `ownerEmpireId` | `?? 'player'` | `Station.js:24` |
| `tier` | `?? 1` (jedyny istniejący poziom) | `Station.js:25` |
| `stationType` | `?? 'orbital_station'` | `Station.js:26` |
| `createdYear` | `?? 0` | `Station.js:27` |
| `depot` | `new StationDepot(config.depot)` — **jedyny "magazyn"** | `Station.js:32` |
| `systemId` | `?? 'sys_home'` | `Station.js:34` |
| `explored` | `true` (własna stacja zawsze "znana") | `Station.js:35` |

**Pola dziedziczone** z `CelestialBody` (`src/entities/CelestialBody.js:4-56`): `id`, `name`, `type`, `x`, `y` (piksele), `physics{mass,radius,density}`, `orbital`, `visual{color,glowColor,radius}`, `age`, `isSelected`, `lifeScore`, `explored`, `analyzed`, `deposits[]`, `updateAge()`, `getDisplayInfo()`.

⚠ **Uwaga o `x/y`:** `Station.x/y` to **statyczny snapshot** pozycji ciała z chwili utworzenia (`StationSystem.createStation` → `x: body.x, y: body.y`, `StationSystem.js:43-44`). Encja **nie aktualizuje** ich, gdy ciało się porusza — żywą pozycję daje wyłącznie `OrbitalSpaceSystem.getPosition` (renderer) albo widok `bodyId→body` (patrz §2.4). To znany trap opisany w CLAUDE.md jako "root bug#1".

⚠ Nagłówek `Station.js:3-4` wciąż wspomina placeholdery `fuelStore/fuelCapacity` — **komentarz nieaktualny** (usunięte w save v85; konstruktor używa `depot`).

### 1.2 `StationDepot` — cały "magazyn" stacji

`src/entities/StationDepot.js` — `class StationDepot` (`StationDepot.js:8`). Lekka fasada "resourceSystem-podobna":
- `inventory` = żywa `Map` (`StationDepot.js:12`) — jedyne źródło prawdy.
- `getAmount(id)` (`:16`), `receive(gains)` (`:21`), `spend(costs)→bool` (`:29`), `serialize()` (tylko niezerowe, `:40`).
- **Magazyn OGÓLNY:** przyjmuje/wydaje DOWOLNY towar, pojemność unlimited, sink **i** source.
- **Świadomie BEZ** `time:tick`, producentów, `legacyProxy` ResourceSystem — komentarz projektowy `StationDepot.js:5-6` ("ciągnęłyby tick co klatkę + listener leak per-stację").

### 1.3 Definicja danych — `StationData`

`src/data/StationData.js`:
- `STATIONS.orbital_station` (`StationData.js:5-30`): `tier:1`, **`requires:'orbital_construction'`** (bramka tech, `:11`), `cost:{Fe:2500,Ti:600,Cu:600,Si:400}` (`:14`), `commodityCost` (7 towarów: structural_alloys 250, reactive_armor 150, electronic_systems 120, conductor_bundles 100, pressure_modules 60, power_cells 50, plasma_cores 40, `:17-25`).
- **`buildTime:7` — MARTWE POLE** (nigdy nietykane; komentarz `:26-29`: "instant materialize, NIEUŻYWANE").
- `stationTotalCost(stationType)` (`:34`) — płaski koszt (cost + commodityCost) do `spend/canAfford`.
- **Jeden typ, jeden tier.** Brak pól produkcji / POP / housing / upkeep.

### 1.4 Tech-gate

`src/data/TechData.js:592-602` — `orbital_construction`: `branch:'space'`, `tier:3`, `cost:{research:350}`, `requires:['space_mining']`, `effects:[]`. **Brak efektu `unlockStation`** — bramka jest czysto przez `techSystem.isResearched('orbital_construction')` konsumowane w `StationData.requires` (komentarz w TechData to potwierdza).

### 1.5 Tworzenie, zapis, wczytanie, wersjonowanie

- **Create:** `StationSystem.createStation(bodyId, {...})` (`src/systems/StationSystem.js:22`) — `EntityManager.get(bodyId)` guard (`:24-27`), `id = station_${Date.now()}_${rand}` (`:31`), snapshot `x/y/systemId` z ciała (`:42-44`), `EntityManager.add` (`:46`), `orbital.assignOrbit(bodyId, id, 'station')` (`:51`), emit **`station:created`** (`:53`). ⚠ Jeśli `orbitalSpaceSystem` = null, stacja powstaje **bez orbity** (cicho, `:50`).
- **Destroy:** `destroyStation(id)` (`:58`) — `releaseOrbit` + `EntityManager.remove` + emit `station:destroyed`.
- **Serialize (encje):** `StationSystem.serialize()` (`:82`) → mapuje `EntityManager.getByType('station')` na 9 płaskich pól + `depot.serialize()`. **Rejestr = EntityManager, system bezstanowy.**
- **Restore:** `StationSystem.restore(data)` (`:96`) — guard `Array.isArray` (null = no-op), **idempotent** (`:101`), defensywny re-assign orbity gdy brak (`:106-108`), re-emit `station:created`.

**Rozmieszczenie w save (dwa osobne bloby + orders):**
- Encje stacji → `civ4x.stationSystem` (`SaveSystem._serializeCiv4x`, `SaveSystem.js:157`).
- Orbity stacji → `civ4x.orbitalSpace` (`SaveSystem.js:156`, przez `OrbitalSpaceSystem.serialize`).
- Zlecenia w toku → `civ4x.colonies[].pendingStationOrders` (per-kolonia; `ColonyManager.serialize:2045`, `restore:2154`).

**Wersjonowanie migracji** (`src/systems/SaveMigration.js`, `CURRENT_VERSION=89`, `:20`):
- **Stacje wprowadzono w save v84** — `_migrateV83toV84` (rejestr `:104`, definicja `:2174`): jedynie lazy-default `pendingStationOrders:[]` per kolonia. **Nie dotyka encji ani orbit** (round-trip przez własne serializery; `restore(null)` = no-op na starych save).
- **Reforma depotu v85** — `_migrateV84toV85` (rejestr `:105`, def `:2156`): konwersja usuniętych `fuelStore/fuelCapacity` → `depot`.
- Substrat orbitalny: `_migrateV63toV64` (`:1586`) już obsługiwał gałąź `role==='station'` (omega 0, anchored, `:1650-1651`).
- **Brak jakiejkolwiek pracy stacyjnej w v86→v89.**

### 1.6 Właściciel / stan / poziom / moduły / cargo — co jest rozszerzalne

| Aspekt | Stan dzisiaj |
|--------|--------------|
| **Właściciel** | `ownerEmpireId` (default `'player'`) — plumbing pełny (order → create → encja), ale **uśpiony**: żaden realny caller nie podaje wartości ≠ `'player'` (patrz §2.7). |
| **Stan** | Brak maszyny stanów. Encja istnieje albo nie. Brak fazy budowy (Wariant A "instant materialize"). |
| **Poziom** | `tier` plumbowany, ale **zawsze 1** — brak danych/logiki tier 2+. |
| **Moduły** | **Brak.** UI pokazuje placeholder "Stocznia orbitalna — wkrótce" (`StationPanel.js:201-203`). |
| **Cargo** | `depot` (StationDepot) — jedyny rozszerzalny magazyn, ale bez semantyki produkcji. |

### 1.7 Stacja vs Kolonia — różnice pól (czego brakuje, by traktować stację jak kolonię)

Kolonia to **zwykły obiekt-literał** (nie klasa) budowany w `ColonyManager.registerHomePlanet` (`:325-349`), `createColony` (`:398-422`), `createOutpost` (`:486-511`). Poniżej pola, których **stacja NIE ma**, a które definiują kolonię:

| Pole kolonii | Typ | Rola | Stacja ma? |
|--------------|-----|------|-----------|
| `planet` | `CelestialBody` | powierzchnia, atmosfera, złoża, temperatura | ❌ (stacja nie ma powierzchni) |
| `resourceSystem` | `ResourceSystem` | pełny magazyn z producentami/konsumentami, `canAfford/snapshot/getResourceBreakdown` | ❌ (ma `depot` — tylko `getAmount/receive/spend/serialize`) |
| `civSystem` | `CivilizationSystem` | model POP (7 strat), housing, morale, konsumpcja | ❌ |
| `buildingSystem` | `BuildingSystem` | budynki na hexach (`_active` Map + `_grid`) | ❌ |
| `factorySystem` | `FactorySystem` | produkcja towarów | ❌ |
| `prosperitySystem` | `ProsperitySystem` | prosperity 0-100 | ❌ |
| `grid` | `HexGrid` | mapa hex planety | ❌ |
| `credits` | number | skarbiec Kr (home=500) | ❌ |
| `fleet` / `shipQueues` / `groundUnitQueues` | array | hangar, kolejki budowy | ❌ |
| `tradeCapacity` / `activeTradeConnections` / `tradeOverrides` | — | handel cywilny | ❌ |
| `isHomePlanet` / `isOutpost` / `allowImmigration/Emigration` | flagi | typ kolonii, migracja | ❌ (ma `isOutpost:true` tylko w fasadzie EconomyOverlay) |

**Wniosek:** aby stacja "była kolonią", musi zyskać (a) namiastkę powierzchni/siatki modułów zamiast `planet+grid`, (b) `civSystem` (lub redukowany model POP), (c) `buildingSystem`/`factorySystem` (lub model modułów-produkcji), (d) pełny `resourceSystem` zamiast `depot`. To **cały quartet per-kolonia**, którego stacja dziś nie posiada.

### 1.8 ⚠ Landmina `ownerEmpireId` (kluczowa dla integracji)

- Kolonie **gracza** używają `ownerEmpireId = null` (`ColonyManager.js:329, 402`).
- `Station` domyślnie ustawia `ownerEmpireId = 'player'` — **truthy string** (`Station.js:24`).
- `ColonyManager.isPlayerColony` traktuje **oba** (`null` I `'player'`) jako gracza (`:227-229`), ale **~15 konsumentów** filtruje `if (col.ownerEmpireId) continue;` — czyli traktuje każdą prawdę jako AI.
- **Skutek:** gdyby stację wrzucić do list kolonii, `getPlayerColonies()`/Outliner/TopResourceDrawer by ją **włączyły**, a observatory/tax/topbar/trade by ją po cichu **wykluczyły**. Połowa kodu widzi, połowa nie. **Każdy redesign musi najpierw ujednolicić tę semantykę** (rekomendacja: player-station = `null`).

---

## 2. LOGIKA / MECHANIKI

### 2.1 Cykl życia budowy stacji (end-to-end)

```
TECH:   research 'orbital_construction' (space, tier 3, 350 rp; ← space_mining)
ORDER:  ColonyManager.addPendingStationOrder(planetId, {targetBodyId, ...})   [ColonyManager.js:1649]
          bramka tech (:1653-1662): STATIONS[type].requires → techSystem.isResearched? 
              nie → emit station:orderRejected {reason:'requiresTech'}, return null   (fail-closed)
          cost fallback (:1666-1670): pusty override → stationTotalCost()  (nie "za darmo")
          push order {id:pso_..., targetBodyId, cost, ownerEmpireId:'player', stationType, queuedAt}
              → colony.pendingStationOrders (per-kolonia, :1683-1685)  → emit station:orderQueued
TICK:   ColonyManager._tickPendingStationOrders()   [wpięte w time:tick @ :145; def :1709]
          canAfford(order.cost)? nie → czeka w kolejce (:1720)
          tak → pre-check (:1722-1731): stationSystem && EntityManager.get(targetBodyId)?
                   nie → usuń, emit station:buildFailed (body_lost | no_station_system)  [BEZ spend]
                   tak → resourceSystem.spend(order.cost)   [OD TĄD BRAK ZWROTU, :1733]
CREATE: StationSystem.createStation(targetBodyId, {ownerEmpireId, stationType})   → emit station:built
ORBIT:  OrbitalSpaceSystem.assignOrbit(bodyId, id, 'station')  → anchored GEO, omega 0
RENDER: ThreeRenderer._addStationMesh (na station:created)
SAVE/RESTORE: patrz §1.5
```

- `cancelPendingStationOrder(planetId, orderId)` (`:1688`) — splice, **bez zwrotu** (spend odroczony do materializacji; `:1694-1695`), emit `station:orderCancelled`.
- `getPendingStationOrders(planetId)` (`:1699`) → `colony.pendingStationOrders ?? []`.
- ⚠ Tech-gate sprawdzany **tylko przy zamówieniu**, nie przy materializacji. `spend` nie jest owinięty w check sukcesu (polega na `canAfford`).

### 2.2 `StationSystem` — create/destroy/persist (bez ticka)

`src/systems/StationSystem.js` — konstruktor subskrybuje **tylko** `station:rename` (`:14`). Metody: `createStation` (`:22`), `destroyStation` (`:58`), `getStationsAt(bodyId)` (`:69`), `_renameStation` (`:74`), `serialize` (`:82`), `restore` (`:96`). **Brak `_tick` — system jest bezstanowy nad EntityManager, tylko CRUD.**

### 2.3 Orbita — `OrbitalSpaceSystem`, rola `'station'`

`src/systems/OrbitalSpaceSystem.js`:
- `assignOrbit(bodyId, id, role)` (`:110`) — `anchored = opts.anchored ?? (role==='station')` (`:118-119`), `range` z `ORBITAL_ROLES.station`, slot (r,θ,φ) przez min-spacing. Rekord: `omega = anchored ? 0 : ...`, `anchored=true`, `theta0` stałe (`:144-154`). **Stacja podwójnie przypięta** (`omegaBase=0.0` też).
- `getPosition(id, planetWorldPos, tSec)` (`:196`) — pozycja **live** liczona co klatkę z **żywej** pozycji ciała + relatywnej orbity; dla anchored `theta=theta0`, ale x/z śledzą ciało → **stacja podąża za planetą**.
- `releaseOrbit` (`:167`), `hasOrbit` (`:236`), serialize/restore (`:300/317`).
- `ORBITAL_ROLES.station` (`src/data/OrbitalRolesData.js:57-62`): `rMinMult 4.0`, `rMaxMult 5.0`, `rMinAbs 0.14` (pas GEO), `omegaBase 0.0`. Resolver `resolveVesselOrbitalRole` (`:117-121`).

### 2.4 Cargo, dokowanie, misje transportu

- **`VesselManager.dockAtStation(vesselId, stationId)`** (`src/systems/VesselManager.js:645-665`) — **port uniwersalny**: brak bramki spaceport, **brak check właściciela**, pozycja kotwiczona do żywego `station.bodyId`, `position.dockedAt=stationId`, `status='idle'`, `mission=null`, **NIE zmienia `vessel.colonyId`** (dom zostaje). Kontrast: `dockAtColony` (`:535-581`) stosuje bramkę spaceport (`:545-563`) i **przepisuje** `vessel.colonyId` (`:565`).
- **`dockAtTarget(vesselId, id)`** (`:671-674`) — dispatch `isStationId(id) ? dockAtStation : dockAtColony`.
- **Tankowanie:** `_refuelTank` (`:1555-1584`, store-agnostic, `REFUEL_RATES[id] ?? 2`), `_tickRefueling` (`:1591-1635`) — gałąź stacji owija `{resourceSystem: st.depot}` (`:1613-1618`); `manualRefuel` (`:1726-1737`, `resolveTransferStore`). Flaga `refuelAutomatically` (serialize `:1120`, restore `:1246`).
- **Branże "static x/y":** `dispatchOnMission` start z ciała (`:337-341`), `_maybeNotifyStranded` **early-return dla stacji** (zakłada, że stacja zawsze zatankuje, `:454-460`), `_updatePositions` anchor (`:1795-1804`), `_predictPosition` przewiduje ciało (`:2867-2872`).
- **MissionSystem** (`src/systems/MissionSystem.js`): `_checkPadForVessel` — stacja = port uniwersalny → `true` (`:437-450`, `445-446`); `_findTarget` zwraca **kopię-widok** stacji z **żywą** pozycją `bodyId→body` (`:2450-2467`) — to fix "root bug#1"; `_processTransportArrival` rozładunek do depotu przez `store.receive` (`:1874-1947`, `:1890`), `trade:imported` i fleet-membership **tylko dla kolonii** (`:1894`, `:1943-1946`); `_continueTransportLoop` (`:1702-1735`), `_bestEffortLoad` (`:1744-1752`), `_tryResumeLoop` (`:1844-1871`).
- **`resolveTransferStore(id)`** (`src/utils/TransferStore.js:13-20`) — zwraca `colony.resourceSystem` **lub** `station.depot` (precedencja kolonia→stacja). `isStationId(id)` (`:23-25`).
- **`SpaceportCheck.hasSpaceportAt(bodyId)`** (`src/utils/SpaceportCheck.js:35-44`) — stacja → `true` (`:37-38`); `canLaunchFromCurrent` (`:54-62`).
- **`FleetActions.dock_station`** (`src/data/FleetActions.js:400-419`) — jedyne miejsce z **bramką właściciela** (`(s.ownerEmpireId ?? 'player') === 'player'`, `:409, 416`); `getAvailableActions` oferuje gdy `getStationsAt(dockedAt).length>0` (`:623-626`).
- **`FleetSystem`** (`src/systems/FleetSystem.js:674-678`) — `dockAtStation` przy przylocie.

### 2.5 Rola ekonomiczna — **stacja jest EKONOMICZNIE OBOJĘTNA**

Werdykt agenta ekonomii: **stacja nie generuje/nie konsumuje żadnych surowców, kredytów, produkcji ani utrzymania na żadnym ticku.** Jedyny cykliczny tick jej dotyczący to **jednorazowy spend budowy** w kolonii-fundatorze (`_tickPendingStationOrders`). Depot zmienia się **wyłącznie** gdy fizyczny statek dokuje i ręcznie transferuje cargo/paliwo.

- **Brak `_tick` w `StationSystem`** (cały plik `:1-112`); `StationDepot` bez ticka/producentów (`:5-6`).
- **`CivilianTradeSystem`** — **zero** referencji do stacji; iteruje tylko `getAllColonies()` (`:75`), a stacje są w `EntityManager`, nie w `_colonies` → strukturalnie wykluczone.
- **`TradeOrderBoard`** (cross-empire) — **zero** referencji do stacji.
- **`VesselManager._tickVesselMaintenance`** (`:1649-1680`) — iteruje **tylko** `_vessels`; stacje = zero utrzymania. Pay-home przez `homeColonyId`, nie `dockedAt` (`:1683-1688`) → dokowanie przy stacji jest niewidoczne dla sinka Kr.
- **`ResourceSystem`/`FactorySystem`/`CivilizationSystem`** — **zero** referencji do stacji (brak producenta/konsumenta/POP).

### 2.6 Ekonomia w UI (kosmetyka) — `EconomyOverlay` S4-3

- `_playerStationFacades()` (`src/ui/EconomyOverlay.js:95-106`) — fasady overlay-lokalne `{planetId:s.id, name, resourceSystem:s.depot, factorySystem:null, isOutpost:true, isStation:true}` (NIE rejestrowane nigdzie).
- `_getTabEntities()` (`:110-113`) merge kolonie gracza + fasady; `_resolveEntity` (`:117-121`).
- Stawki **puste** (`:501-504` — depot bez `_deltaTracker/_inventoryPerYear`), energy 0. Prefiks `🛰` (`:908`), nagłówek `stationLabel` (`:484`), pusty stan `stationNoProduction` (`:997-1001`), guard zarządzania `hasManagement = !isStation` (`:708`), tooltip guard `typeof rs.getResourceBreakdown !== 'function'` (`:312`).

### 2.7 AI / imperia — **stacje to funkcja WYŁĄCZNIE gracza**

Werdykt agenta AI: **żadne imperium AI nie buduje, nie posiada, nie używa stacji orbitalnych.**
- Wszystkie 2 call-sites `createStation` + 2 call-sites `addPendingStationOrder` → domyślnie `'player'`. Callerzy: `ColonyOverlay.js:3391` (UI gracza), `GameScene.js:812/801` (debug).
- Komentarz-dowód `ColonyManager.js:1654`: *"Tylko gracz buduje stacje"*; bramka konsultuje globalny (gracza) `window.KOSMOS.techSystem` — imperia go nie mają (fail-closed).
- `ownerEmpireId` plumbowany, ale **nigdy** wołany z wartością ≠ `'player'` (poza ręcznym `debug.spawnStation`).
- `_tickPendingStationOrders` pętla po **wszystkich** koloniach (też AI), ale żaden kod AI nie tworzy `pendingStationOrder` → nigdy nie odpala.
- **Dezambiguacja szumu:** `research_station` (`BuildingsData.js:217`) to **naziemny budynek naukowy** (🔬, kategoria `research`), NIE stacja orbitalna; `"stationary"` to zamrożone AI walki (`DeepSpaceCombatSystem`/`ProximitySystem`/`MovementOrderSystem`); `"Control Station"` to flavor komponentu Sfery Dysona (`DysonData.js:80`). Realną logikę stacji ma ~15 plików, zero to systemy AI imperiów.

---

## 3. RENDERING / SCENA 3D

### 3.1 `ThreeRenderer` — rdzeń renderu stacji

`src/renderer/ThreeRenderer.js`:
- Stan: `_stations` Map (`:274`, `stationId → {mesh, isModel3D, placeholder, tintedMats}`), `_focusStationId` (`:364`).
- Lifecycle event-driven (stacje **nigdy** nie budowane w `initSystem`): `station:created→_addStationMesh`, `station:destroyed→_removeStationMesh` (`:520-521`); teardown przy switch/warp (`:1079-1085`); tick z pętli render (`:2084`).
- **Stałe (hardcode, static)** (`:3560-3575`): `STATION_MODEL_MAP={orbital_station:'assets/models/stations/Ring_Station.glb'}` (`:3560`), `STATION_MODEL_DEFAULT` (`:3561`), `STATION_SCALE=0.015` (tuned live-gate, "STOP-IF-WRONG", `:3565`), `STATION_MODEL_ROT_X=π/2` (`:3568`), `STATION_EMISSIVE_INTENSITY=1.0` (`:3571`), `STATION_TINT=0x8899bb` (`:3575`).
- `_addStationMesh(station)` (`:4087-4131`) — **natychmiast placeholder** (Group: sfera-hub r=0.009 + torus-ring 0.02/0.006, `:4093-4106`), `userData={kosmosType:'station', stationId}` (`:4109`), potem async `_loadShipModel(path).then(_swapStationModel)` z **retry-once po 400 ms** (`:4117-4130`); porażka = placeholder zostaje (nigdy nie spada do sprite).
- `_loadShipModel(path)` (`:3846-3870`) — **reużywa cache modeli statków** (`_shipModelTemplates`/`_shipModelPromises`); `Ring_Station.glb` dzieli tę samą maszynerię co statki.
- `_swapStationModel(id, template, t0)` (`:4139-4182`) — `clone()` (współdzielona geometria), `scale 0.015`, `Box3` center, `rot.x=π/2` (ring płasko), **tint na KLONIE materiału** (`STATION_TINT`, okna nietknięte, `:4155-4165`), podmiana children Group, `entry.isModel3D=true`, `tintedMats=true`.
- `_removeStationMesh(id)` (`:4185-4205`) — czyści `_focusStationId` (self-heal), dispose geometrii (współdzielona → "benign re-upload") + materiału **tylko gdy `tintedMats`** (klon).
- `_tickOrbitingStations()` (`:4211-4232`) — pozycja z `orbitalSpace.getOrbit` + żywa pozycja ciała; **anchored GEO, brak rotacji/self-spin** (`:4230`).

### 3.2 Klikalność i kamera

- **`handleClick`** (`:2907-2946`) — stacje testowane **przed ciałami, po statkach** (`:2923-2937`); ray recursive, walk-up do `userData.stationId`; na trafienie **dual-emit** `station:focus` **i** `station:selected` (`:2933`), potem `return`. ⚠ Stacje **NIE są w `this._clickable`** → klik stacji **nigdy nie emituje `body:selected`/`body:deselected`** — stacja stoi **poza normalnym systemem selekcji ciał** (brak orbit-ring, glow, BottomContext).
- `station:focus` handler (`:917-928`) — czyści focus ciała/statku, `setMinDist(0.005)` (ekstremalny zoom), `focusOnInstant`, clamp dist ≤ 0.3.
- `_updateCameraFocus` (`:1893-1913`) — tracking stacji ma **priorytet** nad ciałem/statkiem (`:1904-1913`), co klatkę `focusOnSmooth`.
- `getAllVisibleLabels` (`:3079-3084`) — etykiety stacji w trybie CTRL (`kind:'station'`, `color:'#8fb8ff'`).
- `getStationScreenPosition(id)` (`:2964-2974`) — projekcja do px (null gdy za kamerą); konsumowana przez StationPanel.
- Kamera: `ThreeCameraController.focusOnInstant/focusOnSmooth/setMinDist/setTargetDist` (`:150/157/174/177`).

### 3.3 Inne widoki

- **2D taktyczna** (`FleetManagerOverlay`): `map_station` marker (`:3348-3364`); `TacticalRaycaster.findHitZone` akceptuje `'map_station'` (`:75`), `resolveTacticalTarget` → `{type:'station', entityId, planet:station}` (reuse pola `planet`, `:137-148`).
- **`GalacticMiniMap`** — **ZERO** stacji (grep bez trafień); renderuje tylko systemy/imperia/floty.
- **`StratcomGalaxyRenderer`** — **ZERO** stacji (grep bez trafień); tylko gwiazdy/systemy.
- ⇒ Jeśli redesign chce stacji na skali strategicznej, ten rendering trzeba **dopisać od zera**.

---

## 4. UI

### 4.1 `StationPanel` — jedyny dedykowany panel (pływający, szczątkowy)

`src/ui/StationPanel.js` — `class StationPanel extends BaseOverlay` (`:35`). Non-exclusive (wzór CombatHUD), **trzymany bezpośrednio przez UIManager, NIE w OverlayManager**:
- UIManager: import (`:44`), instancja + `window.KOSMOS.stationPanel` (`:288-291`), draw **PO** overlayManager gated `civMode && !globeOpen` (`:1725`), handleClick **PRZED** overlayManager (`:1427`), hit-test kamery (`:1364-1365`), `isPointerOverFloatingPanel` (`:1394-1399`), mousemove (`:1555`).
- Self-managed lifecycle: `station:selected→show`, `station:destroyed`/`body:deselected→hide` (`StationPanel.js:41-51`).
- Zawartość (`_buildLines`, `:151-206`): właściciel / orbita·układ·tier·rok / **depot** (surowce vs towary, przez `classifyStationDepot`) / **handel** (live snapshot statków przez `gatherStationTraders` — dokowane z VesselManager + inbound/outbound z MissionSystem) / **moduły = placeholder** "Stocznia orbitalna — wkrótce" (`:201-203`) + rename (`✏`, `:122`, `230-243`).
- **Brak historii przepływów** (komentarz `StationPanel.js:10`).
- Logika czysta: `src/ui/StationPanelLogic.js` — `classifyStationDepot(entries)` (`:14`), `gatherStationTraders(stationId, deps)` (`:37`).

### 4.2 `ColonyOverlay` — **budowa** stacji (nie zarządzanie)

`src/ui/ColonyOverlay.js`:
- Import `STATIONS` (`:12`), stan `_stationDialogOpen/_stationTargetId` (`:146-147`), 5 subskrypcji `station:*`→flash (`:148-152`), reset na switch (`:995`).
- **Przycisk nagłówka `🛰 Station`** (`:869-885`) — tylko kolonia gracza, gated `orbital_construction` (`:872`), label `🛰`/`🔒` (`:880-882`), hit `'station_open'` (`:884`).
- **Dialog budowy** `_drawStationDialog` (`:2926-3034`) — picker celu przy księżycach (`:2930-2939`), koszt have/need (`:2988-3001`), przycisk Buduj (`:3003-3012`), kolejka "W kolejce" + cancel (`:3014-3029`), gotcha `stationDialogBg` na końcu (`:3030-3032`). Routing `_handleHit` (`:3377-3399`): `station_open`/`station_build`→`addPendingStationOrder`/`station_cancel_order`→`cancelPendingStationOrder`.
- **To tylko buduje/kolejkuje — NIE jest managerem/edytorem stacji.**

### 4.3 `FleetManagerOverlay` — cele transportu + dok

- `map_station` render (`:3346-3364`), priorytet klik ciało/stacja > statek (`:638-646`), handler (`:1174-1187`).
- `_getValidTargets` — **tylko stacje GRACZA** jako cel transportu (`:8027-8040`, "Cudze stacje pominięte"); ikona `🛰` (`:7699`).
- `_getVesselColony` — fasada dok-przy-stacji `{planetId:st.id, resourceSystem:st.depot, isDepot:true}` dla CargoLoadModal (`:1788-1796`).
- Picker doku właściwy w `FleetCommandPanel.js:468` / `FleetGroupPanel.js:470` (via `getDockTargets`).

### 4.4 `BodyName` + inne

- `src/utils/BodyName.js`: `resolveBodyPos` — special-case stacji zwraca **żywą** pozycję ciała (`:26-38`); `getDockTargets()` — kolonie gracza **+ stacje gracza** (`🛰`, `hasPort:true`, `:47-62`).

### 4.5 Outliner, NavDrawer, BottomContext — **stacji BRAK**

- **Outliner** (`src/ui/Outliner.js`, instancja `UIManager.js:183`) — stan (`UIManager.js:1624-1687`) ma `colonies/expeditions/fleet/shipQueues/groundUnits/constructionQueue/...` ale **NIE ma pola `stations`**. Grep `Outliner.js` po "station" = zero. **Gracz nie ma rosteru swoich stacji.**
- **NavDrawer** — brak stacji (i sam martwy: nawigacja przeniesiona do `BottomNavBar`, `UIManager.js:58-60`).
- **BottomContext** — brak obsługi selekcji stacji (obsługuje ją StationPanel).
- **UIManager** — **zero** subskrypcji `station:*` (wiring żyje w StationPanel/ColonyOverlay); brak wpisu `station` w `overlayManager.register`.

### 4.6 i18n — pełny słownik

- **31 kluczy `station.*`** (`src/i18n/pl.js:695-726`, `en.js:694-725`): build dialog (`headerBtn/dialogTitle/target/cost/build/buildAfford/buildWait/pending/requiresTech` + 5× `flash*`) + panel info (`ownerPlayer/orbit/system/tier/created/depot/depotEmpty/resources/commodities/traders/tradersNone/status{Inbound,Docked,Outbound}/modules/moduleShipyardSoon/rename`).
- **2 klucze `econPanel.station*`**: `stationLabel` (`pl.js:1809`), `stationNoProduction` (`pl.js:1852`).
- ⚠ Klucz `station.rename` (`:726`) **nieużywany** (StationPanel woła `showRenameModal` z hardkodowanym `✏`).

### 4.7 Obecny ekran *Colonies* (`ColonyOverlay`) — czy da się rozszerzyć o stacje

`ColonyOverlay` to **edytor powierzchni hex**, twardo związany z encjami w `ColonyManager._colonies`:
- Subject: `getColony(_selectedColonyId)` (`:399`).
- **Siatka hex** = `_getGrid(colony)` → `PlanetMapGenerator.generate(colony.planet, isHome)` (`:401-418`) — **wymaga `colony.planet`**; stacja nie ma powierzchni → cały środkowy panel (mapa/hexy/jednostki/panel budowy/`_getMapBounds`/`_screenToTile`) jest bezużyteczny dla stacji.
- Nagłówek POP: `colony.civSystem.population/.housing` (`:916-922`); pasek budynków: `colony.buildingSystem._active` (`:1092, 1154-1165`); dossier + globus: `colony.planet` (`:1005-1075, 1207`); zakładki kolonii: `getPlayerColonies()` + `switchActiveColony` (`:928-1000`).
- **Aby renderować stację jak kolonię, ColonyOverlay potrzebuje albo (a) syntetycznej siatki modułów zamiast planety-hex, albo (b) osobnego trybu renderu stacji.** To najdroższa powierzchnia do retrofitu.

---

## 5. PUNKTY ZACZEPIENIA POD REDESIGN

### 5.1 Reużywalne (fundament do rozbudowy)

| Element | Cytat | Dlaczego reużywalne |
|---------|-------|---------------------|
| **Fasada stacja-jako-kolonia** | `EconomyOverlay.js:95-121` | **JEDYNY istniejący precedens** — stacja renderowana jak kolonia bez wchodzenia do `_colonies`. Kanoniczny kontrakt do powielenia. |
| `StationSystem` CRUD + serialize | `StationSystem.js` cały | Szkielet cyklu życia; dopisać `_tick` produkcji. |
| `StationDepot` kontrakt | `StationDepot.js` | Kompatybilny z cargo/fuel; można rozszerzyć o produkcję. |
| Rola orbitalna `'station'` | `OrbitalSpaceSystem.js:110-154`, `OrbitalRolesData.js:57-62` | Anchored GEO działa; render śledzi ciało. |
| Szablon pending-order | `ColonyManager._tickPendingStationOrders:1709` | Mirror `_tickPendingShipOrders`/`_tickPendingOutpostOrders` — gotowy wzór budowy-z-POP z fazą. |
| Render GLB + tint + placeholder | `ThreeRenderer._addStationMesh:4087` etc. | Cały pipeline modelu 3D gotowy. |
| Dual-emit selekcji + `StationPanel` | `ThreeRenderer.js:2933`, `StationPanel.js` | Baza pod bogatszy panel/ekran. |
| `resolveTransferStore` / `dockAtTarget` | `TransferStore.js:13`, `VesselManager.js:671` | Warstwa abstrakcji cargo kolonia↔stacja. |

### 5.2 Martwy kod / stuby

- `StationData.buildTime:7` (`StationData.js:29`) — nigdy nietykany (brak fazy budowy).
- Placeholder "moduły" (`StationPanel.js:201-203`).
- `STATION_MODEL_MAP` jednowpisowy → oba branche na ten sam plik (`ThreeRenderer.js:3560-3561`) — abstrakcja "per stationType" szczątkowa.
- Klucz i18n `station.rename` nieużywany (`pl.js:726`).
- Placeholder-render (hub+ring) transientny — do usunięcia przy preloadzie GLB.
- Nieaktualny komentarz `fuelStore/fuelCapacity` (`Station.js:3-4`).

### 5.3 Hardcode

- Pas GEO `rMinMult 4.0/rMaxMult 5.0/rMinAbs 0.14/omegaBase 0.0` (`OrbitalRolesData.js:57-62`).
- Encja: `mass 0.0001`, `visualRadius 3`, `color 0x44aaff` (`Station.js:14-16`).
- Render: `STATION_SCALE 0.015`, `ROT_X π/2`, `EMISSIVE 1.0`, `TINT 0x8899bb`, geometria placeholdera (`ThreeRenderer.js:3560-3575, 4096, 4102`).
- Magiczne liczby focus kamery (`min-dist 0.005`, `dist 0.3`) inline (`ThreeRenderer.js:917-928`).
- ID `station_${Date.now()}_${rand}` / `pso_${Date.now()}_${rand}` — kolizjo-ryzyko przy szybkiej kreacji (`StationSystem.js:31`, `ColonyManager.js:1672`).
- Fallback stawki tankowania `?? 2` (`VesselManager.js:1569`).

### 5.4 Ryzyka — gdzie dodanie POP/modułów rozbije systemy

**A. `getAllColonies()` — 31 konsumentów** (`ColonyManager.getAllColonies:221-223`; 71 wywołań w 38 plikach). Gdyby stacja trafiła na tę listę:
- **BREAKS (twarde):** `CivilianTradeSystem._halfYearlyTick:75` (gęste odczyty prosperity/buildingSystem/pop), `GameScene.js:1225` (`col.civSystem.forceConsumptionSync` → TypeError na load), `GameScene.js:2394` (`switchActiveColony(station)` → `window.KOSMOS.civSystem=undefined`).
- **NEEDS-GUARD (~13):** `ThreeRenderer` colony labels `:2113` + sensor overlay `:5324`, `AutoRetreatSystem:167`, `MovementOrderSystem:1680`, `UtilityAI:113` (+40 str/stację), `Outliner`/`UIManager:1630`, `TopResourceDrawer:93`, `InvasionSystem:171` (stacja jako cel desantu), `StarSystemManager.getSystemColonies:179`, `WarSystem:383`, `GalaxyMapScene:207/365`, `TradeOverlay:196`.
- **SAFE (dzięki guardom lub quirk `ownerEmpireId`):** Observatory (`:122/389/576`), TopBar `:739`, FactorySystem `:1236`, GroundUnitManager `:658`, ProsperitySystem `:496`, EmpireColonyMaintenance `:55`, migracje fleet.

**B. ⚠ Bezpośrednia iteracja `this._colonies.values()`** (omija `getAllColonies`, brak guardów) — **rozbija się niezależnie**:
- `ColonyManager.get totalPopulation:287` → `col.civSystem.population` **niezguardowane → BREAKS**.
- `ColonyManager.serialize:2032` → `col.civSystem.serialize()` **→ crash zapisu**.

**C. Landmina `ownerEmpireId`** (`'player'` vs `null`) — patrz §1.8. **Musi być rozstrzygnięta przed czymkolwiek.**

**D. `switchActiveColony`** (`ColonyManager.js:257-271`) — przełącza `window.KOSMOS.{resourceSystem,civSystem,buildingSystem,factorySystem,prosperitySystem}`; zakłada pełny kształt kolonii → stacja bez tych systemów rozbije globalny stan.

**E. `ColonyOverlay`** — sprzężenie z `colony.planet` + `PlanetMapGenerator` + `buildingSystem._active`; największy pojedynczy item pracy UI (§4.7).

**F. Kolejność restore** — `orbitalSpace.restore` **przed** `stationSystem.restore` (`GameScene.js:1267→1272`); każdy nowy pod-system stacji (resourceSystem/civSystem) dołoży zależności kolejności (po EntityManager, ew. po ColonyManager).

**G. Migracja save** — dodanie POP/modułów/produkcji = bump `CURRENT_VERSION` (89→90) + `_migrateV89toV90` z defaultami per stacja (patrz protokół w CLAUDE.md).

### 5.5 Warianty architektoniczne integracji stacja↔kolonia

#### Wariant A — **Fasada / kompozycja** (stacja zostaje osobną encją, poza `_colonies`) — REKOMENDOWANY
Stacja dostaje własne pod-systemy per-stację (model POP à la `civSystem`, model modułów-produkcji à la `buildingSystem/factorySystem`, pełny magazyn zamiast `depot`), a UI widzi ją przez **fasady** budowane na `getPlayerColonies()` — wzorem `EconomyOverlay`. **Nigdy** nie wchodzi do `getAllColonies()`.
- **+** Zero ryzyka z §5.4 A/B/D (żaden konsument kolonii nie widzi stacji). Zgodne z jedynym istniejącym precedensem. Izolowany save (własny serializer). Nie rusza ~40 konsumentów.
- **+** Może współistnieć z wariantem "stacje AI" bez landminy `ownerEmpireId`.
- **−** Duplikacja: potrzeba osobnych (lub współdzielonych przez interfejs) implementacji POP/produkcji. UI (Outliner, ColonyOverlay) musi jawnie mergować dwie listy. Więcej kodu fasadowego.

#### Wariant B — **Stacja jako podtyp Colony w `_colonies`**
Stacja rejestrowana w `ColonyManager._colonies` z pełnym quartetem systemów (syntetyczny `planet`, `grid` modułów, `civSystem`, `buildingSystem`).
- **+** "Za darmo" dostaje handel cywilny, prosperity, podatki, Outliner, switch, ColonyOverlay — jeśli kształt jest kompletny.
- **−** Dziedziczy **2 twarde crashe** (`totalPopulation:287`, `serialize:2032`), **2 crashe load/switch** (`GameScene:1225`, `:2394`), 1 poważny mis-behave (`CivilianTradeSystem:75`), ~13 NEEDS-GUARD. Wymaga najpierw naprawy landminy `ownerEmpireId`. Największa powierzchnia regresji. Ryzykowna migracja (stacja nagle w listach zapisywanych/tickowanych).

#### Wariant C — **Wspólny interfejs `ISettlement` (hybryda)**
Wydzielenie wspólnego kontraktu (np. `getPopulation()/getStore()/getModules()/getScreenSubject()`) implementowanego zarówno przez `Colony` jak i przez rozbudowaną `Station`; listy UI iterują po `ISettlement`, a `_colonies` zostaje czyste (tylko planetarne).
- **+** Brak duplikacji logiki produkcji/POP (współdzielone przez interfejs). Czysty rozdział "osada planetarna vs orbitalna". Ekran *Colonies* dostaje jeden abstrakcyjny subject → łatwiej dodać tryb renderu stacji.
- **−** Największy koszt refaktoru wstępnego (trzeba przepisać ~40 konsumentów na interfejs zamiast konkretnego kształtu). Ryzyko rozjazdu, jeśli refaktor niepełny. Najdłuższy czas do pierwszego widocznego efektu.

**Rekomendacja audytu:** **Wariant A** jako ścieżka pierwszego wdrożenia (najniższe ryzyko, zgodny z precedensem `EconomyOverlay`), z ewentualną ewolucją w stronę **C**, jeśli duplikacja POP/produkcji okaże się bolesna. **Wariant B odradzany** bez uprzedniego rozbrojenia landminy `ownerEmpireId` i twardych crashy §5.4 B.

### 5.6 Materiały referencyjne dla designera (POP)

Kierunek "stacja z POP" ma gotowe opracowania projektowe w repo — warto je uwzględnić przy modelu populacji stacji: `docs/pop-system-5-options.md`, `docs/pop-strata-loyalty-identity-plan.md`, `docs/pop-strata-synthetic-master-plan.md`, `docs/pop-strata-loyalty-identity-plan.md`, `docs/loyalty-identity-concepts.md`. **Nie istnieje** dedykowany dokument projektowy stacji — praca S3.3b była śledzona tylko w CLAUDE.md i `.claude/plans/`; ten audyt jest pierwszym skonsolidowanym fundamentem.

---

## 6. TL;DR

1. **Stacja = osobna encja** `Station extends CelestialBody` (`type:'station'`) w `EntityManager`, **nie** kolonia; pozycja przez `OrbitalSpaceSystem` (anchored GEO, `omega 0`).
2. **Cała "ekonomia" to `StationDepot`** (opakowana `Map`, sink+source, bez ticka/producentów) — stacja jest **ekonomicznie obojętna**: zero produkcji/konsumpcji/utrzymania; jedyny cykliczny tick to jednorazowy spend budowy.
3. **Brak POP, budynków, produkcji, prosperity, siatki hex, kredytów** — stacji brakuje **całego quartetu systemów per-kolonia** (`resourceSystem/civSystem/buildingSystem/factorySystem/prosperitySystem/grid`).
4. **Stacje to funkcja WYŁĄCZNIE gracza** — AI nigdy ich nie buduje/nie używa; `ownerEmpireId` plumbowany, ale uśpiony (zawsze `'player'`).
5. **Zapis:** encje w `civ4x.stationSystem`, orbity w `civ4x.orbitalSpace`, zlecenia w `colonies[].pendingStationOrders`; wprowadzone save **v84**, depot **v85**, `CURRENT_VERSION=89`. Restore: `orbitalSpace` **przed** `stationSystem`.
6. **Render 3D gotowy:** GLB `Ring_Station.glb` (reuse cache statków, placeholder→swap+tint); klik **dual-emituje** `station:focus`+`station:selected`, ale **nigdy** `body:selected` — stacja jest **poza normalnym systemem selekcji**. **Brak** stacji na `GalacticMiniMap`/`StratcomGalaxyRenderer`.
7. **Jedyne UI stacji:** pływający `StationPanel` (read-only info + rename, "moduły" = placeholder) + **budowa** w `ColonyOverlay` (dialog, nie manager). **Brak ekranu zarządzania.** **Brak w Outlinerze** — gracz nie ma rosteru stacji.
8. **Istnieje precedens fasady** — `EconomyOverlay` renderuje stacje jak kolonie-zakładki bez wchodzenia do `_colonies` (`_playerStationFacades`); to kanoniczny wzór do powielenia.
9. **Największe ryzyka redesignu:** landmina `ownerEmpireId` (`'player'` vs `null`), 31 konsumentów `getAllColonies` + **2 twarde crashe** przy bezpośredniej iteracji `_colonies` (`totalPopulation:287`, `serialize:2032`), oraz `ColonyOverlay` twardo związany z `colony.planet`+hex.
10. **Rekomendacja:** **Wariant A (fasada/kompozycja, stacja poza `_colonies`)** — najniższe ryzyko, zgodny z precedensem; ewolucja w stronę wspólnego interfejsu (**Wariant C**) opcjonalna; **Wariant B (stacja w `_colonies`) odradzany** bez uprzedniej naprawy landminy i crashy.

---

## 7. Otwarte pytania do decyzji designera

1. **Zasięg "stacja jako kolonia":** pełny POP + morale + strata (jak planeta), czy zredukowany model "załoga stacji" (liczba + zadowolenie bez 7 strat)? To determinuje, czy reużyć `CivilizationSystem`, czy pisać lżejszy model.
2. **Powierzchnia zarządzania:** stacja wchodzi do **istniejącego ekranu Colonies** (z syntetyczną siatką modułów zamiast hexów planety), czy dostaje **siostrzany ekran** dedykowany stacjom? (ColonyOverlay jest edytorem powierzchni hex — retrofit jest kosztowny.)
3. **Model modułów:** sloty modułów (stała siatka N slotów: stocznia / lab / mieszkania / produkcja) czy pełna mapa hex jak planeta? Sloty są tańsze i pasują do "stacji".
4. **`ownerEmpireId` dla stacji gracza:** ujednolicić na `null` (jak kolonie gracza) czy zostawić `'player'` i naprawić ~15 konsumentów? (Rekomendacja: `null`.)
5. **Stacje AI:** czy imperia mają w przyszłości budować/posiadać stacje (uśpiony `ownerEmpireId` sugeruje intencję), czy pozostają player-only? Wpływa na wybór architektury (A vs C) i na render/intel wroga.
6. **Ekonomia stacji:** stacja **produkuje** (moduły fabryczne, konsumuje surowce, generuje towary/energię) i **kosztuje utrzymanie** (nowy sink Kr w `_tickVesselMaintenance`-podobnym ticku), czy zostaje pasywnym hubem logistycznym? To największa zmiana mechaniczna.
7. **POP na stacji bez atmosfery:** stacja to z definicji środowisko sztuczne — czy POP wymaga "modułów mieszkalnych" (analog `habitatHousing`), i czy housing jest tam nielimitowany czy twardo zależny od modułów?
8. **Handel:** czy stacja wchodzi do `CivilianTradeSystem` jako węzeł auto-routingu (dziś strukturalnie wykluczona) i/lub do cross-empire `TradeOrderBoard`?
9. **Widoczność strategiczna:** czy stacje mają być na `GalacticMiniMap`/STRATCOM (dziś nieobecne), czy pozostają widoczne tylko na mapie systemu 3D/taktycznej?
10. **Faza budowy:** przywrócić `buildTime` (progresywna budowa z paskiem, jak budynki) czy zostać przy "instant materialize" (Wariant A)? Wpływa na cancel/refund i na odczucie skali.
11. **Migracja:** przy dodaniu POP/modułów bump save v89→v90 — jakie defaulty dla **istniejących** stacji w save (pusta załoga? zerowe moduły? auto-nadanie modułu-magazynu z obecnego depotu)?
