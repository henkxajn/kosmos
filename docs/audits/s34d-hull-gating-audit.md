# S3.4d — Gating kadłubów (stocznie naziemne = tylko small; orbitalne = wszystko)
## AUDYT (read-only) + PLAN — DO ZATWIERDZENIA PRZEZ FILIPA

> Status: **audyt + plan ukończony. NIC nie zaimplementowano.** STOP przed implementacją.
> Baza: S3.4c zamknięty (`2a0c01b`). Save aktualny: **v90** (`SaveMigration.js:21`).
> Wszystkie odniesienia w formacie `plik:linia`, zweryfikowane w źródle.

---

## 0. TL;DR (streszczenie decyzyjne)

**Cel:** twardy gate — stocznia **naziemna (kolonijna)** buduje **tylko `hull_small`** (+ podstawowe
cywilne kadłuby), stocznia **orbitalna (stacja)** buduje **wszystko**. Gracz nie ma floty wojennej
(frigate/destroyer/cruiser) ani kadłubów medium/large bez stoczni orbitalnej. **AI zwolnione z gatingu.**

**Cztery fakty kluczowe z audytu:**
1. **Pole `size` ISTNIEJE** na każdym kadłubie (`'small'`/`'medium'`/`'large'`), ale **NIE wystarcza**:
   `hull_frigate` ma `size:'small'` (`HullsData.js:158`) a jest okrętem wojennym → musi być orbital-only.
   Konieczne **jawne pole danych** (rekomendacja: `groundBuildable: true`).
2. **Dwa chokepointy budowy gracza** — `ColonyManager.startShipBuild` (`:753`, naziemna) i
   `StationSystem.queueStationShip` (`:320`, orbitalna). Gate na tych dwóch punktach jest szczelny dla
   normalnej ekonomii. Reszta ścieżek gracza to **narzędzia dev/test** (debug helpers, Power Test,
   CombatSandbox) — poza normalną rozgrywką.
3. **AI dotyka gated funkcji tylko w jednym miejscu**: `EmpireLogisticsSystem.js:209`
   (`startShipBuild(..., 'hull_small', ...)`). Dyskryminator gracz/AI: **`colony.ownerEmpireId`**
   (`null`=gracz) via kanoniczny helper `ColonyManager.isPlayerColony` (`:225-228`).
4. **Brak migracji save** — gate nie zmienia żadnego kształtu danych; `CURRENT_VERSION` zostaje **v90**.
   Stare kolejki i floty **nietknięte** (tick ukończenia nie rewaliduje budowy).

**Decyzje wymagające zatwierdzenia — patrz §DECYZJE na końcu (5 pozycji).**

---

## A1. Taksonomia kadłubów + tabela klasyfikacji

### A1.1 Dwa źródła danych statków

| Źródło | Plik | Zawiera | Pole rozmiaru? |
|--------|------|---------|----------------|
| **`HULLS`** (system modułowy — projektant) | `src/data/HullsData.js:11` | 6 kadłubów uniwersalnych/bojowych | **TAK — `size`** |
| **`SHIPS`** (legacy, stałe projekty) | `src/data/ShipsData.js:18` | 3 kadłuby cywilne (science/cargo/supply) | **NIE** (tylko `hullType`) |

Oba konsumowane przez ten sam chokepoint: `const ship = SHIPS[shipId] ?? HULLS[shipId]`
(`ColonyManager.js:760`, `StationSystem.js:325`).

### A1.2 `frigate/destroyer/battleship` — osobne hullId, nie projekty

Okręty bojowe to **osobne wpisy `HULLS`** (nie projekty na wspólnym kadłubie):
`hull_frigate` (`:153`), `hull_destroyer` (`:192`), `hull_cruiser` (`:233`).
**„Battleship" NIE ISTNIEJE** — najcięższy kadłub to `hull_cruiser` (opis: „Ciężki okręt desantowy").
Klasy okrętów są emergentne z modułów (broń/pancerz/troop_bay), nie z podtypów kadłuba.

### A1.3 Pole `size` istnieje, ale jest niewystarczające

Każdy kadłub `HULLS` ma `size`:

| hullId | `size` | `requires` | rola | plik:linia (def / size) |
|--------|--------|-----------|------|--------------------------|
| `hull_small` | `small` | `exploration` | zwiadowca/uniwersalny | `:17` / `:22` |
| `hull_frigate` | **`small`** ⚠ | `point_defense` | **OKRĘT WOJENNY** | `:153` / `:158` |
| `hull_medium` | `medium` | `exploration` | uniwersalny | `:60` / `:65` |
| `hull_destroyer` | `medium` | `point_defense` | **OKRĘT WOJENNY** | `:192` / `:197` |
| `hull_large` | `large` | `exploration` | uniwersalny/transport | `:105` / `:110` |
| `hull_cruiser` | `large` | `point_defense` | **OKRĘT WOJENNY/desant** | `:233` / `:238` |

**Problem:** reguła „`size==='small'` → naziemna" przepuściłaby `hull_frigate` (fregata bojowa) na
stocznię kolonijną — sprzeczne z „gracz NIE MA floty wojennej bez orbity". Reguła „`size==='small' &&
requires!=='point_defense'`" działa, ale to **kruchy heurystyk** sprzęgający gate z drzewem tech i
łamiący „jedno źródło prawdy w danych". **Wniosek: DODAĆ jawne pole `groundBuildable`.**

### A1.4 Kadłuby cywilne (SHIPS) — bez `size`, klasyfikacja per sztuka

| shipId | `hullType` | sloty | `requires` | rola | plik:linia |
|--------|-----------|-------|-----------|------|------------|
| `science_vessel` | `science` | 4 | `exploration` | recon/survey | `ShipsData.js:24` |
| `cargo_ship` | `transport` | 6 | `exploration` | fracht | `:63` |
| `space_supply_ship` | `logistics` | 5 | `fleet_logistics` | zaopatrzenie floty (placeholder) | `:106` |

**Uwaga architektoniczna:** projektant kolonijny (`FleetTabPanel._drawDesignHull:1632-1639`) **już ukrywa
legacy SHIPS** — rola cywilna osiągana przez moduły na `HULLS`. Ale `startShipBuild` (`:760`) wciąż je
akceptuje po ID, więc muszą mieć jednoznaczną klasyfikację (żeby default-deny ich nie zablokował, jeśli
gdziekolwiek są budowalne). „Colony ship" **nie istnieje jako stały statek** — to projekt z modułem
`slotType:'habitat'` na dowolnym kadłubie (kanon: `Vessel.canColonize`). Colony-ship na `hull_small` →
naziemny; na `hull_medium/large` → orbitalny (gate jest na kadłubie, nie na roli).

### A1.5 ★ TABELA KLASYFIKACJI — DO ZATWIERDZENIA ★

Rekomendacja: **default-deny na ziemi** (bez flagi = orbital-only; „bez furtek" — nowy kadłub domyślnie
tylko orbita). Flaga `groundBuildable: true` TYLKO na wpisach naziemnych:

| Kadłub / statek | `groundBuildable` | Naziemna | Orbitalna | Uzasadnienie |
|-----------------|:-----------------:|:--------:|:---------:|--------------|
| `hull_small` | ✅ **true** | ✅ | ✅ | Small, niebojowy — bazowy dostęp gracza |
| `hull_frigate` | — (brak) | ❌ | ✅ | Okręt wojenny (mimo `size:small`) |
| `hull_medium` | — | ❌ | ✅ | Medium |
| `hull_destroyer` | — | ❌ | ✅ | Okręt wojenny |
| `hull_large` | — | ❌ | ✅ | Large |
| `hull_cruiser` | — | ❌ | ✅ | Okręt wojenny/desant |
| `science_vessel` | ✅ **true** | ✅ | ✅ | Cywilny lekki — potrzebny wcześnie (recon) |
| `cargo_ship` | ✅ **true** ⚠ | ✅ | ✅ | Cywilny fracht — potrzebny wcześnie (ekspansja) |
| `space_supply_ship` | ✅ **true** ⚠ | ✅ | ✅ | Cywilny zaopatrzeniowiec (placeholder) |

**Pozycje niejednoznaczne (⚠) — rekomendacja + prośba o decyzję:**
- `cargo_ship` (6 slotów, „medium-rozmiarowy") — **rekomenduję naziemny**: to podstawowy statek cywilny;
  zablokowanie go przed stocznią orbitalną sparaliżowałoby wczesną ekspansję/logistykę (nie o to chodzi
  w designie — cel to flota **wojenna**). Alternatywa: orbital-only jeśli Filip chce ostrzejszą presję.
- `space_supply_ship` — **rekomenduję naziemny** (analogicznie, statek cywilny/logistyczny, w dodatku
  placeholder). Alternatywa: orbital-only.
- `science_vessel` — **jednoznacznie naziemny** (lekki recon, konieczny od startu).

---

## A2. Ścieżki budowy statków

### A2.1 Chokepointy (architektura)

```
GRACZ (UI) ──fleet:buildRequest──► ColonyManager.startShipBuild (:753)  [NAZIEMNA]  ─┐
GRACZ (UI stacji) ──────────────► StationSystem.queueStationShip (:320) [ORBITALNA] ─┤
AI logistyka ───────────────────► ColonyManager.startShipBuild (:209 wywołanie)  ────┘
                                          │
                             (kolejka → tick → spawn)
                                          ▼
                    VesselManager.createAndRegister (:148)  ← BRAK walidacji (czysta fabryka)
```

### A2.2 ⓐ Stocznia kolonijna (naziemna) — GŁÓWNA ŚCIEŻKA GRACZA

**Wyzwalacze UI** (wszystkie emitują `fleet:buildRequest { shipId, modules }`; jedyny subskrybent:
`ColonyManager.js:117`):

| plik:linia | akcja | pre-check UI |
|-----------|-------|--------------|
| `FleetTabPanel.js:521` | `build_ship` (lista statków) | `if (zone.data.enabled)` |
| `FleetTabPanel.js:566` | `design_build` (projektant inline) | brak (przycisk tylko w kroku summary) |
| `FleetManagerOverlay.js:1085` | `build_ship` | `if (zone.data.enabled)` |
| `FleetManagerOverlay.js:1090` | `build_template` (zapisany projekt) | `if (zone.data.enabled)` |

**Walidacja — `startShipBuild` (`ColonyManager.js:753-852`):**

| # | check | linia | reason |
|---|-------|-------|--------|
| 1 | kolonia istnieje | `:755` | `fleet.colonyNotFound` |
| 2 | statek istnieje (`SHIPS ?? HULLS`) | `:760-764` | `fleet.unknownShip` |
| 3 | **tech-gate** (`ship.requires`, `colony.techSystem ?? this.techSystem`) | `:770-775` | `fleet.requiresTech` |
| — | **⟵ TU wpiąć facility-gate (§A3)** | (po `:775`) | `fleet.requiresOrbitalShipyard` |
| 4 | stocznia istnieje (`_getShipyardLevel===0`) | `:778-783` | `fleet.noShipyard` |
| 5 | wolne sloty | `:787-791` | `fleet.shipyardFull` |
| 6 | POPy załogi | `:794-808` | `fleet.noCrewPops` |
| 7 | stać (surowce+towary+moduły); brak → **pending order** | `:818-831` | — |

Kolejka: push do `colony.shipQueues` (`:843-848`, kształt `{shipId, progress, buildTime, modules}`).
Ukończenie: `_tickShipBuilds` (`:856-880`) → `fleet:shipCompleted` (`:876`) →
`VesselManager._onShipCompleted` (`:1375`) → `createAndRegister` (`:1376`) → `colony.fleet.push` (`:1381`).

**Ścieżka odroczona (pending):** `_tickPendingShipOrders` (`ColonyManager.js:1485`) re-sprawdza POPy
(`:1505`) i surowce (`:1511`), po czym push do `shipQueues` (`:1525`) — **BEZ re-checku kadłuba**. Nowy
gated kadłub nigdy tu nie trafi (gate jest wyżej, w `startShipBuild`), więc ta ścieżka nie wymaga gate'u
dla NOWYCH zleceń. (Stare save — patrz §A4.)

### A2.3 ⓑ Stocznia stacyjna (orbitalna) — GRACZ, buduje WSZYSTKO

**Wyzwalacz UI:** `ColonyOverlay.js:3520` (`station_mgmt_buildship`) → `queueStationShip`.
Picker: `StationManagementView.drawShipPicker` (`:436`).

**Walidacja — `queueStationShip` (`StationSystem.js:320-355`):**

| check | linia | reason |
|-------|-------|--------|
| stacja + `type==='station'` | `:322` | `no_station` |
| `hasActiveShipyard` | `:323` | `no_shipyard` |
| statek istnieje (`SHIPS ?? HULLS`) | `:325-326` | `unknown_ship` |
| **tech-gate** (`ship.requires`, **globalny** `window.KOSMOS.techSystem`) | `:330-333` | `requiresTech` |
| koszt z depotu (`station.depot.spend`) | `:341-350` | `insufficient_resources` |

Kolejka: `station.shipQueues.push` (`:352`). Ukończenie: `_tickShipQueues` (`:474-487`) →
`_spawnStationShip` (`:490`) → `createAndRegister` (`:496`).

**Gate orbitalny = no-op** (stacja buduje wszystko). Rekomendacja: **wpiąć symetryczne wywołanie
`canBuildHullAt(ship.id, 'orbital')` (zawsze `true`)** jako self-dokumentujący punkt jednego źródła
prawdy — patrz §A3.4.

### A2.4 ⓒ Projektant (Command / Shipyard) — projekt ≠ budowa

**Dwa projektanty; tworzenie projektu jest ODDZIELONE od budowy** (potwierdza A5 — gate na budowie, nie na
projektowaniu):

- **`UnitDesignOverlay.js` (klawisz `U`) — TYLKO projekt/szablon, ZERO walidacji, ZERO budowy.**
  Lista **wszystkich** kadłubów: `Object.keys(HULLS)` (`:189`). Zapis: `_saveTemplate` (`:635-669`) →
  push `{id, name, hullId, modules}` do `window.KOSMOS.unitDesigns[]` (`:662-668`). **Nie emituje
  `fleet:buildRequest`.** → Projekt medium+/wojenny **można stworzyć zawsze** (zgodne z A5).
- **Projektant inline w `FleetTabPanel._drawDesignHull` (`:1621-1684`) — projekt + budowa.**
  ⚠ **Już ukrywa** okręty: `LEGACY_HIDDEN_HULLS = Set(['hull_frigate','hull_destroyer','hull_cruiser'])`
  (`:1637`) + `continue` (`:1639`). Oferuje więc `hull_small/medium/large`. **`hull_medium` i `hull_large`
  są dziś budowalne na kolonii tą ścieżką** → gate musi je zablokować (i objąć UX-em).
  Budowa: `design_build` (`:566`) → `fleet:buildRequest` → `startShipBuild`.

### A2.5 ⓓ Ścieżki poboczne gracza (dev/test) — POZA normalną ekonomią

| ścieżka | plik:linia | walidacja | przez chokepoint? |
|---------|-----------|-----------|-------------------|
| `KOSMOS.debug.spawnMyVessel` | `GameScene.js:656-707` (spawn `:698`) | BRAK — direct `createAndRegister`, auto-unlock tech | ❌ omija `startShipBuild` |
| `KOSMOS.debug.stationBuildShip` | `GameScene.js:926-933` (`:930`) | wypełnia depot → `queueStationShip` | ⚠ przez gate stacji, ale force-fill depotu |
| Power Test flota startowa (`science_vessel`, `cargo_ship`, `hull_frigate`) | `GameScene.js:3258-3276` (`:3264/:3268`) | BRAK — direct `createAndRegister` | ❌ scenariusz-only |
| CombatSandbox floty gracza | `CombatSandbox.js:315-351` (`:322` `createVessel` + `:341` raw `_vessels.set`) | BRAK | ❌ omija fabrykę i chokepoint |
| CombatSandbox explorer | `CombatSandbox.js:174` | BRAK | ❌ scenariusz-only |

**Scenariusz „Cywilizacja" (normalna gra): BRAK floty startowej** — gracz MUSI zbudować stocznię
(potwierdzone, brak spawnu). To zgodne z designem: żadnej furtki w normalnej rozgrywce.

**Misje/ekspedycje/eventy/prefaby — NIE tworzą statków:** `fleet.push` w
`MissionSystem`/`ExpeditionSystem` **przenosi istniejący** `exp.vesselId` do nowej floty (nie tworzy);
`colony_ship` **konsumuje** statek; prefaby deployują budynki. Zero nowego spawnu statku.

### A2.6 Ścieżki AI — TYLKO ZIDENTYFIKOWAĆ (gate ich NIE dotyka)

| # | ścieżka AI | plik:linia | przez gated funkcję? |
|---|-----------|-----------|----------------------|
| 1 | **kurier logistyczny AI** (`startShipBuild(..., 'hull_small', ...)`) | `EmpireLogisticsSystem.js:209` | **TAK** — musi być wykluczony przez `isPlayerColony` |
| 2 | materializacja floty wojennej AI (`createVessel` direct) | `EmpireFleetMaterializer.js:71/105/122`, tag `ownerEmpireId/isEnemy` `:115-117` | NIE (omija chokepoint z natury) |
| 3 | abstrakcyjny spawn floty (strength, bez statków) | `MilitaryAI.js:145` | NIE |

Negatywne (nie budują): `EmpireStrategySystem` (grep pusty), `AlienCivSystem` (tylko czyta `:236-242`),
`EnemyAttackHandler` (reaguje na `isEnemyVessel`). Wróg testowy: `SpawnTestEnemy.js:448/591/682` (enemy-only).

**Dyskryminator gracz/AI (potwierdzony):** `ColonyManager.isPlayerColony(c)` (`:225-228`):
```js
static isPlayerColony(c) { return !!c && (!c.ownerEmpireId || c.ownerEmpireId === 'player'); }
```
Kolonia gracza: `ownerEmpireId: null` (`createColony :329/:361`, `createOutpost :434/:491`).
Kolonia AI: `ownerEmpireId = empire_xxx`. Korroboracja: `EmpireLogisticsSystem.js:408`
(`if (!empId || empId === 'player') return; // gracz: ownerEmpireId null`).

---

## A3. Miejsce gatingu — jedno źródło prawdy

### A3.1 Nowy helper (jedyne źródło prawdy) — `src/data/ShipBuildRules.js` (NOWY plik)

```js
// ShipBuildRules — gdzie można zbudować dany kadłub (S3.4d).
// Stacja orbitalna buduje WSZYSTKO; stocznia naziemna — tylko kadłuby z groundBuildable:true.
// Default-deny na ziemi: nowy kadłub bez flagi = tylko orbita (twardy gate, bez furtek).
import { HULLS } from './HullsData.js';
import { SHIPS } from './ShipsData.js';

export function getShipSpec(shipId) {
  return SHIPS[shipId] ?? HULLS[shipId] ?? null;   // parytet z ColonyManager:760 / StationSystem:325
}

/** facilityType: 'ground' (stocznia kolonijna) | 'orbital' (stocznia stacji). */
export function canBuildHullAt(shipId, facilityType) {
  if (facilityType === 'orbital') return true;      // orbita buduje wszystko
  const spec = getShipSpec(shipId);
  return !!spec && spec.groundBuildable === true;   // naziemna: tylko jawnie dozwolone
}
```
Import obu (`HULLS`+`SHIPS`) w dedykowanym module-liściu unika cyklu importów (HullsData nie importuje
ShipsData). Logika data-driven, konwencja „definicje w `src/data`".

### A3.2 Punkt wpięcia #1 — stocznia naziemna (LOGIKA, szczelny)

`ColonyManager.startShipBuild`, **po tech-gate (`:775`), przed shipyard-check (`:778`)**:
```js
// Gate kadłubowy (S3.4d) — stocznia naziemna buduje tylko small; medium+/wojenne → stacja orbitalna.
// TYLKO kolonie gracza; AI zwolnione z gatingu (buduje po staremu).
if (ColonyManager.isPlayerColony(colony) && !canBuildHullAt(ship.id, 'ground')) {
  const reason = t('fleet.requiresOrbitalShipyard');
  EventBus.emit('fleet:buildFailed', { reason });
  return { ok: false, reason };
}
```
Kolejność zgodna z istniejącymi gate'ami (unknown → tech → **facility** → shipyard → sloty → crew →
koszt). Objęte OBIE pod-ścieżki (natychmiast I pending), bo pending tworzony jest DOPIERO po gate (`:820`).

### A3.3 Punkt wpięcia #2 — stocznia orbitalna (LOGIKA, self-dokumentujący no-op)

`StationSystem.queueStationShip`, po ship-resolve (`:326`):
```js
// Stacja orbitalna buduje wszystko — jawne wywołanie dla symetrii/jednego źródła prawdy (zawsze true).
if (!canBuildHullAt(ship.id, 'orbital')) {
  return { ok: false, reason: 'facility_restricted' };   // martwa gałąź — dokumentuje intencję
}
```
(Opcjonalne — patrz DECYZJA #4. Funkcjonalnie zbędne, ale spina oba pickery na jednym helperze.)

### A3.4 Konsumpcja w pickerach (UX — patrz §A5)

`canBuildHullAt(tpl.hullId, 'ground')` w pickerach kolonijnych (`FleetManagerOverlay:6971`,
`FleetTabPanel._drawDesignHull:1638`) — do renderu „widoczny + zablokowany" (obejście UI jest nieszkodliwe,
bo LOGIKA i tak blokuje w `startShipBuild`).

**Szczelność:** LOGIKA gate = 2 punkty (`startShipBuild` + `queueStationShip`). Nawet gdyby picker miał
błąd i wysłał `fleet:buildRequest` dla cruisera, `startShipBuild` odrzuci. Pickery = tylko UX.

---

## A4. Save / kompatybilność

### A4.1 Kształty danych — BEZ ZMIAN, BEZ migracji

| Kolejka | Kształt wpisu | serialize | restore |
|---------|--------------|-----------|---------|
| `colony.shipQueues[]` | `{shipId, progress, buildTime, modules}` (`ColonyManager.js:843`) | `:2053` (`?? []`) | `:2162` (`?? []`) |
| `colony.pendingShipOrders[]` | `{id, shipId, cost, crewCost, modules, queuedAt}` (`:822`) | `:2055` | `:2164` |
| `station.shipQueues[]` | `{shipId, modules, progress, buildTime}` (`StationSystem.js:352`) | `StationSystem.js:123` | `Station.js:59` (`?? []`) |

Gate **wprowadza `groundBuildable` do DANYCH statycznych** (HullsData/ShipsData), które NIE są
serializowane, oraz **odrzuca zlecenia przy enqueue** — zero nowych pól persystowanych.
**`CURRENT_VERSION` zostaje v90** (`SaveMigration.js:21`). **Migracja NIEPOTRZEBNA.** ✅

### A4.2 Stare kolejki DOKAŃCZAJĄ (potwierdzone)

Tick ukończenia **NIE rewaliduje** budowalności:
- Kolonia: `_tickShipBuilds` (`:856-880`) — `progress += ...` (`:867`), przy `>= buildTime` (`:868`)
  splice (`:875`) + `fleet:shipCompleted` (`:876`). **Brak re-checku tech/kadłuba/facility.**
- Stacja: `_tickShipQueues` (`:474-487`) — jedyny warunek `hasActiveShipyard` (`:477`, moc/załoga).

**Rekomendacja (zgodna z briefem): DOKOŃCZYĆ, nie konfiskować.** Stary save z `hull_cruiser` w kolejce
naziemnej **dokończy budowę** — gate dotyczy tylko NOWYCH zleceń.

### A4.3 Stare pending orders (edge-case)

`_tickPendingShipOrders` (`:1497-1534`) re-sprawdza POPy/surowce, **nie kadłub** → stary
`pendingShipOrders` z gated kadłubem **awansuje do `shipQueues` i dokończy**. Nowe pending nie powstaną
(gate wyżej). **Rekomendacja: NIE gate'ować `_tickPendingShipOrders`** (pending = niezapłacone, ale to
istniejąca intencja gracza; edge-case znikomy; spójne z „nie karzemy istniejącego stanu"). Alternatywa
belt-and-suspenders (DECYZJA #5): dodać ten sam check przy `:1524`, blokując stare pending gated.

### A4.4 Istniejące floty — NIETKNIĘTE

Gate działa **wyłącznie przy kolejkowaniu budowy** (`startShipBuild` / `queueStationShip`). Zbudowane
statki (`colony.fleet`, `VesselManager._vessels`) nie są nigdzie rewalidowane pod kątem kadłuba.
**Potwierdzone: gating dotyka wyłącznie enqueue budowy.** ✅

---

## A5. UX odmowy + i18n + projektant

### A5.1 Wzorzec „widoczny + zablokowany" (precedensy w kodzie)

Najsilniejszy precedens: **lista szablonów w `FleetManagerOverlay.js:6971-7063`** — łączy (a) ikonę `🔒`,
(b) zlokalizowany powód `t('fleet.requiresTech', ...)`, (c) wyszarzenie wiersza, (d) zdjęcie hit-zone:

| element | linia |
|---------|-------|
| `hasTech = !hull.requires || isResearched(...)` | `:6990` |
| stany `canBuildNow/canQueue/canClick` | `:7000-7002` |
| **łańcuch powodów** (`🔒 requiresTech` / `👥 noCrewPops` / `⏳ shipyardFull`) | `:7008-7019` |
| wyszarzenie tła/ramki/tekstu | `:7025-7034` |
| powód jako 3. linia | `:7042-7046` |
| przycisk `🔒`/`⏳`/`—` | `:7049` |
| **hit-zone tylko gdy `canClick`** | `:7058-7061` |
| komentarz-intencja („gracz nie wiedział CZEGO brakuje") | `:7004-7007` |

Bliźniacze precedensy: `StationManagementView.drawShipPicker` (`locked` `:477`, przycisk `🔒` `:517`,
hit tylko gdy `canBuild` `:519`); `FleetTabPanel._drawDesignHull` (`🔒 ${ship.requires}` badge `:1670-1674`).

### A5.2 Zmiany UX (per picker)

1. **`FleetManagerOverlay.js:6971-7063` (lista szablonów, główny cel):** dodać gałąź do łańcucha powodów
   (przy `:7008-7019`):
   ```js
   const canBuildFacility = canBuildHullAt(hull.id, 'ground');
   ...
   else if (!canBuildFacility) { blockReason = `🛰 ${t('fleet.requiresOrbitalShipyard')}`; blockColor = THEME.textDim; }
   ```
   Uwzględnić `canBuildFacility` w `canClick` (`:7000-7002`). Wiersz zostaje **widoczny, wyszarzony, z
   powodem** → gracz odkrywa progresję.
2. **`FleetTabPanel._drawDesignHull:1637`:** zamienić „ukrywanie" na „blokowanie" dla spójności:
   - Rekomendacja: **usunąć `hull_medium`/`hull_large` z listy budowalnych naziemnie przez lock**
     (wyszarzenie + `🔒`/`🛰` + powód), zamiast dopuszczać budowę.
   - `LEGACY_HIDDEN_HULLS` (frigate/destroyer/cruiser) — **DECYZJA #3**: (a) zostawić ukryte
     (status quo, ale „ukrywa progresję"), albo (b) pokazać jako zablokowane z powodem (spójne z A5:
     „gracz ma ODKRYĆ progresję"). Rekomendacja: **(b)** — pokaż wojenne jako `🔒 wymaga stoczni
     orbitalnej`, spójnie z medium/large.
3. **`StationManagementView.drawShipPicker`:** **BEZ ZMIAN** (orbita buduje wszystko — nic nie blokujemy).

### A5.3 i18n (PL + EN) — nowy klucz

Klucze i18n to **płaskie stringi z kropkami**; `fleet.*` = powody budowy kolonijnej zwracane jako
`reason` (`pl.js:978-996` / `en.js:976-991`). Wzorce do naśladowania:

| klucz | PL | EN | plik:linia |
|-------|----|----|------------|
| `fleet.requiresTech` | `Wymaga technologii: {0}` | `Requires technology: {0}` | `pl.js:981`/`en.js:979` |
| `fleet.noShipyard` | `Brak Stoczni w tej kolonii` | `No Shipyard in this colony` | `pl.js:982`/`en.js:980` |
| `fleet.shipyardFull` | `Stocznia pełna: {0}/{1} slotów` | `Shipyard full: {0}/{1} slots` | `pl.js:983`/`en.js:981` |
| `station.requiresTech` | `Wymaga: Konstrukcja Orbitalna` | `Requires: Orbital Construction` | `pl.js:703`/`en.js:702` |

**NOWY klucz** — obok `fleet.noShipyard`/`fleet.shipyardFull` (`pl.js` ~982-983, `en.js` ~980-981):
```js
'fleet.requiresOrbitalShipyard': 'Wymaga stoczni orbitalnej (kadłub medium+/wojenny)'   // pl
'fleet.requiresOrbitalShipyard': 'Requires orbital shipyard (medium+/warship hull)'      // en
```
(Opcjonalnie dekoracyjny `station.requiresOrbitalShipyard` — niepotrzebny, bo stacja nic nie odrzuca.)

### A5.4 Projektant a gate — spójność potwierdzona

„Projekt medium+ MOŻNA tworzyć zawsze" jest **spójne z obecnym flow**: `UnitDesignOverlay._saveTemplate`
(`:635-669`) nie waliduje niczego i nie buduje. Gate jest **na budowie** (`startShipBuild` /
`queueStationShip`), nie na projektowaniu. Gracz projektuje cruisera swobodnie, ale zbuduje go dopiero na
stacji orbitalnej. ✅

---

## PLAN IMPLEMENTACJI (kolejność atomowa; NIC jeszcze nie zrobione)

> Każdy krok pokazuje edycję (plik:linia + wartość) do akceptacji PRZED zastosowaniem (konwencja Filipa).

**Krok 1 — Dane (klasyfikacja):**
- `HullsData.js` — `groundBuildable: true` w `hull_small` (przy `:22`).
- `ShipsData.js` — `groundBuildable: true` w `science_vessel` (`:24`), `cargo_ship` (`:63`),
  `space_supply_ship` (`:106`). *(zależne od DECYZJI #1)*

**Krok 2 — Helper (jedno źródło prawdy):**
- Nowy `src/data/ShipBuildRules.js` — `getShipSpec` + `canBuildHullAt` (§A3.1).

**Krok 3 — Gate LOGIKI naziemnej:**
- `ColonyManager.js` — import `canBuildHullAt`; wpięcie po `:775` (§A3.2), guard `isPlayerColony`.

**Krok 4 — Gate LOGIKI orbitalnej (opcjonalny no-op):**
- `StationSystem.js` — wywołanie symetryczne po `:326` (§A3.3). *(zależne od DECYZJI #4)*

**Krok 5 — i18n:**
- `pl.js`/`en.js` — `fleet.requiresOrbitalShipyard` (§A5.3).

**Krok 6 — UX pickery kolonijne:**
- `FleetManagerOverlay.js:7008-7019` — gałąź `!canBuildFacility` w łańcuchu powodów + `canClick`.
- `FleetTabPanel.js:1637` — lock zamiast hide dla medium/large (+ wojenne wg DECYZJI #3).

**Krok 7 — Smoke + live-gate** (niżej).

**Krok 8 — Dokumentacja:** CLAUDE.md (sekcja S3.4d) + MEMORY.md + memory file.

---

## SMOKE TESTY (node, offline — wzór `src/testing/smoke/s34c_*`)

| # | test | oczekiwanie |
|---|------|-------------|
| G1 | `canBuildHullAt('hull_small','ground')` | `true` |
| G2 | `canBuildHullAt('hull_medium'/'hull_large'/'hull_frigate'/'hull_destroyer'/'hull_cruiser','ground')` | `false` (×5) |
| G3 | `canBuildHullAt(<każdy>, 'orbital')` | `true` |
| G4 | `canBuildHullAt('science_vessel'/'cargo_ship'/'space_supply_ship','ground')` | `true` (wg DECYZJI #1) |
| G5 | `canBuildHullAt('nieznany_id','ground')` | `false` (default-deny, bez crasha) |
| P1 | **picker gate**: `startShipBuild(playerColony,'hull_cruiser')` | `{ok:false, reason:fleet.requiresOrbitalShipyard}`, `fleet:buildFailed` |
| P2 | `startShipBuild(playerColony,'hull_small')` | `{ok:true}` (przy stoczni+surowcach) |
| P3 | `queueStationShip(station,'hull_cruiser')` | `{ok:true}` (orbita buduje wszystko) |
| AI1 | **AI zwolnione**: `startShipBuild(aiColony{ownerEmpireId:'e1'},'hull_cruiser')` | NIE `requiresOrbitalShipyard` (przechodzi gate kadłuba) |
| AI2 | kurier AI `EmpireLogisticsSystem` (`hull_small`) | działa jak dotąd |
| OLD1 | **stara kolejka**: seed `colony.shipQueues=[{shipId:'hull_cruiser',...}]` → `_tickShipBuilds` | dokańcza → `fleet:shipCompleted` |
| OLD2 | **stare pending**: seed `pendingShipOrders=[{shipId:'hull_medium',...}]` → `_tickPendingShipOrders` | awansuje/dokańcza (wg DECYZJI #5) |
| FLEET1 | istniejący `hull_cruiser` we `fleet` | nietknięty (brak rewalidacji) |
| UX1 | picker: `hull_cruiser` w kolonii | `canClick=false`, widoczny, powód `requiresOrbitalShipyard` |
| REG | regresja: `s34c_*`, build kolonijny/stacyjny | 0 FAIL |

## LIVE-GATE (żywa gra — OBOWIĄZKOWA przed commitem)

1. Kolonia gracza: zbuduj `hull_small` scout → **działa**.
2. Zaprojektuj cruisera w `U` (Command) → **projekt się zapisuje** (projektowanie bez gate).
3. Kolonia: cruiser na liście szablonów → **widoczny, wyszarzony, `🛰 Wymaga stoczni orbitalnej`**, klik
   nieaktywny.
4. Zbuduj stację ze stocznią → zbuduj cruisera na stacji → **działa**.
5. (Regresja AI) AI w tle dalej buduje/kolonizuje (kurier `hull_small`) — brak nowych błędów.

---

## BACKLOG / POZA ZAKRESEM (odnotowane, nie projektowane)

- **Skryptowanie budowy statków AI** — gdy AI dostanie realną budowę floty wojennej, wróci temat gatingu
  AI (obecnie AI zwolnione; kurier `hull_small` i tak przechodzi). Rozważyć wtedy `canBuildHullAt` również
  dla AI + stacje AI.
- **Furtki dev/test** (`spawnMyVessel`, Power Test, CombatSandbox, `stationBuildShip`) — celowo nietknięte
  (narzędzia deweloperskie/scenariusze testowe, nieosiągalne w normalnej grze). Airtight-owy wariant
  (gate w `createVessel` z `opts.bypassHullGate`) = DECYZJA #2, jeśli Filip chce 100% szczelności.
- „Battleship" jako osobny kadłub — nie istnieje (najcięższy = `hull_cruiser`).

---

## ★ DECYZJE WYMAGAJĄCE ZATWIERDZENIA FILIPA ★

| # | Decyzja | Rekomendacja |
|---|---------|--------------|
| **1** | Klasyfikacja `cargo_ship` i `space_supply_ship` (medium-rozmiarowe cywilne) — naziemne czy orbital-only? | **Naziemne** (cywilna logistyka konieczna wcześnie; design celuje we flotę WOJENNĄ). `science_vessel` jednoznacznie naziemny. |
| **2** | Furtki dev/test (debug/Power Test/CombatSandbox) — gate'ować (Opcja B: `createVessel` + `bypassHullGate`) czy zostawić? | **Zostawić** (Opcja A: 2 chokepointy). Nieosiągalne w normalnej grze; gate w fabryce = inwazyjny, ryzyko regresji. |
| **3** | `LEGACY_HIDDEN_HULLS` (frigate/destroyer/cruiser w projektancie inline) — ukrywać dalej czy pokazać zablokowane? | **Pokazać zablokowane** (spójne z A5 „gracz ODKRYWA progresję"). |
| **4** | Symetryczny no-op `canBuildHullAt(...,'orbital')` w `queueStationShip` — dodać czy pominąć? | **Dodać** (jedno źródło prawdy, self-dokumentacja; koszt zerowy). |
| **5** | Stare pending orders z gated kadłubem — dokańczać czy blokować? | **Dokańczać** (nie gate'ować `_tickPendingShipOrders`; edge-case znikomy). |
| **6** | Nazwa pola danych: `groundBuildable` (rekomendacja) czy inna (`orbitalOnly` deny-list, `buildFacility`)? | **`groundBuildable` + default-deny** (bez furtek: nowy kadłub domyślnie orbita). |

---

*Audyt read-only. Zero modyfikacji plików źródłowych. Implementacja czeka na zatwierdzenie tabeli
klasyfikacji (A1.5) i decyzji 1-6.*
