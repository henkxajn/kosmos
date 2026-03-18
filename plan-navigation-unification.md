# Plan: Unifikacja nawigacji statków

## Problem

Logika nawigacji (odległość, prędkość, czas podróży, paliwo, trasa) jest zdublowana między `ExpeditionSystem` i `VesselManager`:

| Aspekt | ExpeditionSystem | VesselManager |
|--------|-----------------|---------------|
| Prędkość | `_getShipSpeed()` → `base * techMult * CIV_TIME_SCALE` | `(speedAU) * techMult` (bez CIV_TIME_SCALE) |
| Odległość | `_calcDistance(target, from)` → `euclideanAU()` | `Math.hypot((tx-vx)/AU_TO_PX, ...)` ręcznie |
| Czas | `distance / _getShipSpeed()` | `distAU / speedAU` |
| Paliwo | `distance * vessel.fuel.consumption` | `distAU * fuelPerAU * fuelEffMult` |
| Trasa | brak (prostoliniowe) | `_calcRoute()` z unikaniem Słońca i ciał |

Skutki:
- Ta sama misja ma inną prędkość w home vs obcym układzie (×12 różnicy przez CIV_TIME_SCALE)
- Czas podróży w ExpeditionSystem nie uwzględnia waypointów (trasa prostolinowa vs zakrzywiona)
- Paliwo liczone od prostej odległości, nie od faktycznej trasy z waypointami
- Duplikacja kodu → rozbieżności i bugi

## Cel

Wyciągnąć CAŁĄ logikę nawigacyjną do jednego modułu. ExpeditionSystem i VesselManager będą z niego korzystać zamiast własnych implementacji.

## Zasady

- Nie zmieniamy kontraktów EventBus (żadnych nowych/usuniętych eventów)
- Nie zmieniamy cyklu życia misji (ExpeditionSystem nadal tworzy expedition, VesselManager nadal zarządza vessel.mission)
- Nie zmieniamy formatu save'a (nie wymaga migracji)
- Nie dodajemy nowych funkcjonalności — tylko refaktor istniejącego kodu

---

## Krok 1: Utworzenie `NavigationUtils.js`

**Plik:** `src/utils/NavigationUtils.js`

Moduł eksportuje statyczne metody:

### 1.1 `calcDistance(from, to)`
Przeniesiona logika z `ExpeditionSystem._calcDistance()`:
```
static calcDistance(from, to) {
  if (!from || !to) return 0.1;
  return Math.max(0.001, DistanceUtils.euclideanAU(from, to));
}
```

### 1.2 `getShipSpeed(vesselId)`
Przeniesiona logika z `ExpeditionSystem._getShipSpeed()`.

**DECYZJA o CIV_TIME_SCALE:** Zachowujemy CIV_TIME_SCALE w prędkości. Powód: mechaniki 4X tickują z `civDeltaYears` = `deltaYears × 12`. Podróż statku musi być proporcjonalna do tempa cywilizacyjnego. Prędkość w home systemie (z CIV_TIME_SCALE) jest odczuwalnie dobra — potwierdzone przez gracza. VesselManager w obcych układach NIE używał CIV_TIME_SCALE — po unifikacji będą mieć tę samą prędkość co w home (spójność).

```
static getShipSpeed(vesselId) {
  // base → shipDef.speedAU ?? 1.0
  // warpCapable → 99999
  // damaged → ×0.5
  // techMult → techSystem.getShipSpeedMultiplier() ?? 1.0
  // × CIV_TIME_SCALE
  return base * techMult * CIV_TIME_SCALE;
}
```

### 1.3 `calcTravelTime(distance, vesselId, minTravel = MIN_TRAVEL_YEARS)`
```
static calcTravelTime(distance, vesselId, minTravel = 0.008) {
  const speed = NavigationUtils.getShipSpeed(vesselId);
  return parseFloat(Math.max(minTravel, distance / speed).toFixed(3));
}
```

### 1.4 `calcFuelCost(distance, vesselId)`
```
static calcFuelCost(distance, vesselId) {
  const vMgr = window.KOSMOS?.vesselManager;
  const vessel = vMgr?.getVessel(vesselId);
  if (!vessel) return 0;
  return distance * (vessel.fuel?.consumption ?? 0);
}
```

### 1.5 `getVesselOrigin(vesselId)`
Przeniesiona logika z `ExpeditionSystem._getVesselOrigin()`:
```
static getVesselOrigin(vesselId) {
  // vessel.position.dockedAt → EntityManager.get() → entity
  // fallback: { x: vessel.position.x, y: vessel.position.y }
}
```

### 1.6 `getEffectiveSpeed(shipId)` (bez vesselId — do UI/szacunków)
Uproszczona wersja bez danych vessel (damage, fuel):
```
static getEffectiveSpeed(shipId) {
  const ship = SHIPS[shipId];
  if (!ship) return 1.0;
  if (ship.warpCapable) return 99999;
  const techMult = window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1.0;
  return (ship.speedAU ?? 1.0) * techMult * CIV_TIME_SCALE;
}
```

---

## Krok 2: ExpeditionSystem — zamiana na NavigationUtils

### 2.1 Usunięcie zdublowanych metod

Usuwamy z `ExpeditionSystem`:
- `_calcDistance(target, from)` → zastąpiony `NavigationUtils.calcDistance(from, target)`
- `_getShipSpeed(vesselId)` → zastąpiony `NavigationUtils.getShipSpeed(vesselId)`
- `_getVesselOrigin(vesselId)` → zastąpiony `NavigationUtils.getVesselOrigin(vesselId)`

### 2.2 Aktualizacja wszystkich wywołań

Poniżej PEŁNA lista miejsc do zmiany (numery linii przybliżone — odnoszą się do obecnego stanu pliku):

**`getReconTime(scope, vesselId)`** (linie ~190-213):
- `_getShipSpeed(vesselId)` → `NavigationUtils.getShipSpeed(vesselId)`
- `_findNearestUnexplored(null, origin)` — origin z `NavigationUtils.getVesselOrigin(vesselId)`
- `_calcDistance(nearest, origin)` → `NavigationUtils.calcDistance(origin, nearest)`
- `_calcDistance(target, origin)` → `NavigationUtils.calcDistance(origin, target)`

**`_launch()` — mining/scientific** (linie ~330-420):
- `_getVesselOrigin(assignedVesselId)` → `NavigationUtils.getVesselOrigin(assignedVesselId)`
- `_calcDistance(target, vesselOrigin)` → `NavigationUtils.calcDistance(vesselOrigin, target)`
- `distance * vessel.fuel.consumption` → `NavigationUtils.calcFuelCost(distance, assignedVesselId)`
- `_getShipSpeed(assignedVesselId)` → `NavigationUtils.getShipSpeed(assignedVesselId)`
- `Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed)` → `NavigationUtils.calcTravelTime(distance, assignedVesselId)`

**`_launchColonyExpedition()`** (linie ~445-540):
- `_getVesselOrigin(vesselId)` → `NavigationUtils.getVesselOrigin(vesselId)`
- `_calcDistance(target, colVesselOrigin)` → `NavigationUtils.calcDistance(colVesselOrigin, target)`
- `baseColSpeed * techMult * CIV_TIME_SCALE` → `NavigationUtils.getShipSpeed(vesselId)` (ujednolicenie — kolonia używała ręcznej formuły)
- `distance * vessel.fuel.consumption` → `NavigationUtils.calcFuelCost(distance, vesselId)`

**`_launchTransport()`** (linie ~543-750):
- Wariant trade route (linia ~577-600): `DistanceUtils.euclideanAU(vessel.position, target)` → `NavigationUtils.calcDistance({x: vessel.position.x, y: vessel.position.y}, targetEntity)`
- `_getShipSpeed(vesselId)` → `NavigationUtils.getShipSpeed(vesselId)`
- `distance * vessel.fuel.consumption` → `NavigationUtils.calcFuelCost(distance, vesselId)`
- Wariant standard (linia ~679-684): `_getVesselOrigin(vesselId)` → `NavigationUtils.getVesselOrigin(vesselId)`
- `_calcDistance(target, transportOrigin)` → `NavigationUtils.calcDistance(transportOrigin, target)`

**`_orderReturn()`** (linie ~770-800):
- `_getShipSpeed(vesselId)` → `NavigationUtils.getShipSpeed(vesselId)`

**`_orderRedirect()`** (linie ~806-860):
- `_getVesselOrigin(exp.vesselId)` → `NavigationUtils.getVesselOrigin(exp.vesselId)`
- `_calcDistance(target, redirectOrigin)` → `NavigationUtils.calcDistance(redirectOrigin, target)`
- `dist * vessel.fuel.consumption` → `NavigationUtils.calcFuelCost(dist, exp.vesselId)`
- `_getShipSpeed(exp.vesselId)` → `NavigationUtils.getShipSpeed(exp.vesselId)`

**`_launchRecon()`** (linie ~870-1000):
- `_getVesselOrigin(vesselId)` → `NavigationUtils.getVesselOrigin(vesselId)`
- `_findNearestUnexplored(null, reconOrigin)` — origin z `NavigationUtils.getVesselOrigin(vesselId)`
- `_calcDistance(firstTarget, reconOrigin)` → `NavigationUtils.calcDistance(reconOrigin, firstTarget)`
- `_getShipSpeed(vesselId)` → `NavigationUtils.getShipSpeed(vesselId)`
- `distance * vessel.fuel.consumption` → `NavigationUtils.calcFuelCost(distance, vesselId)`

**`_launchReconTarget()`** (linie ~1010-1095):
- `_getVesselOrigin(vesselId)` → `NavigationUtils.getVesselOrigin(vesselId)`
- `_calcDistance(target, reconTgtOrigin)` → `NavigationUtils.calcDistance(reconTgtOrigin, target)`
- `distance * 2 * vessel.fuel.consumption` → `NavigationUtils.calcFuelCost(distance * 2, vesselId)`
- `_getShipSpeed(vesselId)` → `NavigationUtils.getShipSpeed(vesselId)`

**Sekwencyjny recon — kontynuacja** (linie ~1564-1590):
- `DistanceUtils.euclideanAU(target, nextTarget)` → `NavigationUtils.calcDistance(target, nextTarget)`
- `DistanceUtils.euclideanAU(nextTarget, originEntity)` → `NavigationUtils.calcDistance(nextTarget, originEntity)`
- `(distNext + distReturn) * vessel.fuel.consumption` — tu pozostaje ręcznie (2 odcinki)
- `_getShipSpeed(exp.vesselId)` → `NavigationUtils.getShipSpeed(exp.vesselId)`

**`_findNearestUnexplored()`** (linie ~1630-1655):
- `_calcDistance(a, from)` → `NavigationUtils.calcDistance(from, a)` (uwaga: kolejność parametrów from, to)
- analogicznie `_calcDistance(b, from)` → `NavigationUtils.calcDistance(from, b)`

**`_getDisasterChance()`** (linia ~1800+):
- Nie używa nawigacji — bez zmian.

### 2.3 Aktualizacja `_isInRange()`

Sprawdzić: `_isInRange(target, shipId)` — jeśli używa `_calcDistance` lub `orbitalFromHomeAU`, zamienić na `NavigationUtils.calcDistance()`.

---

## Krok 3: VesselManager — zamiana na NavigationUtils

### 3.1 `_redirectInterstellarVessel()` (linia ~1226)

Obecny kod:
```javascript
const speedAU = (ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
const dx = (target.x - vessel.position.x) / AU_TO_PX;
const dy = (target.y - vessel.position.y) / AU_TO_PX;
const distAU = Math.sqrt(dx * dx + dy * dy);
const travelYears = distAU / speedAU;
```

Zamienić na:
```javascript
const distAU = NavigationUtils.calcDistance(
  { x: vessel.position.x, y: vessel.position.y }, target
);
const travelYears = NavigationUtils.calcTravelTime(distAU, vesselId);
```

Paliwo (linia ~1237-1239):
```javascript
const fuelEffMult = window.KOSMOS?.techSystem?.getFuelEfficiency?.() ?? 1.0;
const fuelPerAU = (ship?.fuelPerAU ?? 1) * fuelEffMult;
const fuelCost = distAU * fuelPerAU;
```
Tu `NavigationUtils.calcFuelCost(distAU, vesselId)` powinien uwzględniać `fuelEffMult`.
**UWAGA:** Obecna `vessel.fuel.consumption` w Vessel.js jest ustawiana w `dispatchOnMission()` (linia ~230):
```javascript
vessel.fuel.consumption = (SHIPS[vessel.shipId]?.fuelPerAU ?? vessel.fuel.consumption) * fuelEffMult;
```
Ale `_redirectInterstellarVessel()` liczy paliwo ręcznie z `fuelPerAU * fuelEffMult`.

Rozwiązanie: `NavigationUtils.calcFuelCost()` powinien ZAWSZE używać `vessel.fuel.consumption` (która jest już przeliczona z techMult w `dispatchOnMission`). Dla `_redirectInterstellarVessel()` trzeba najpierw ustawić `vessel.fuel.consumption` jeśli nie jest ustawiona.

### 3.2 `_startForeignRecon()` — full_system (linia ~1334)

Obecny kod:
```javascript
const speedAU = (ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
const distAU = Math.hypot(
  (firstTarget.x - vessel.position.x) / AU_TO_PX,
  (firstTarget.y - vessel.position.y) / AU_TO_PX
);
const travelYears = distAU / speedAU;
```

Zamienić na:
```javascript
const distAU = NavigationUtils.calcDistance(
  { x: vessel.position.x, y: vessel.position.y }, firstTarget
);
const travelYears = NavigationUtils.calcTravelTime(distAU, vesselId);
```

### 3.3 `_tickForeignRecon()` — przejście do następnego ciała (linia ~1469)

Obecny kod:
```javascript
const ship = SHIPS[vessel.shipId];
const speedAU2 = (ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
const d2 = Math.hypot(
  (nextBody.x - vessel.position.x) / AU_TO_PX,
  (nextBody.y - vessel.position.y) / AU_TO_PX
);
const travelYears2 = d2 / speedAU2;
```

Zamienić na:
```javascript
const d2 = NavigationUtils.calcDistance(
  { x: vessel.position.x, y: vessel.position.y }, nextBody
);
const travelYears2 = NavigationUtils.calcTravelTime(d2, vesselId);
```

### 3.4 Greedy nearest neighbor w `_startForeignRecon()` (linia ~1320-1329)

Obecny kod używa `Math.hypot(remaining[i].x - cx, remaining[i].y - cy)` w pikselach.
To nie wymaga konwersji na AU — to porównanie relatywne (sortowanie). Można zostawić lub zamienić na `NavigationUtils.calcDistance()` dla spójności. **Zalecenie: zostawić** — to hot loop, konwersja na AU jest niepotrzebna.

### 3.5 NIE ZMIENIAMY: Interstellar jump (`launchInterstellarMission`)

Logika skoków międzygwiezdnych operuje w **latach świetlnych** (LY), nie w AU. Prędkość wyrażona w LY/rok. To inny model nawigacji (galaktyczny). `NavigationUtils` operuje w AU (in-system). **Bez zmian.**

### 3.6 NIE ZMIENIAMY: `_calcRoute()`, `_interpolateWaypoints()`, `_avoidBodies()`

Te metody pozostają w VesselManager — dotyczą routingu (geometria trasy), nie nawigacji (prędkość/czas). Są wywoływane dopiero w `dispatchOnMission()` / `redispatchFromOrbit()` po obliczeniu czasu podróży.

---

## Krok 4: UI — zamiana na NavigationUtils

### 4.1 `ExpeditionPanel._getTargets()` (src/ui/ExpeditionPanel.js)

Obecny kod:
```javascript
const dist = exSys?._calcDistance(body, activeColonyPlanet) ?? Math.abs(body.orbital.a - 1.0);
```

Zamienić na:
```javascript
const dist = NavigationUtils.calcDistance(activeColonyPlanet, body);
```
Usunąć fallback `?? Math.abs(body.orbital.a - 1.0)` — `calcDistance` ma własny fallback (0.1).

### 4.2 `FleetManagerOverlay._calcDistAU()` (src/ui/FleetManagerOverlay.js:3476)

Obecny kod:
```javascript
_calcDistAU(vessel, target) {
  const vx = (vessel.position.x ?? 0) / GAME_CONFIG.AU_TO_PX;
  const vy = (vessel.position.y ?? 0) / GAME_CONFIG.AU_TO_PX;
  const tx = (target.x ?? 0) / GAME_CONFIG.AU_TO_PX;
  const ty = (target.y ?? 0) / GAME_CONFIG.AU_TO_PX;
  return Math.sqrt((vx - tx) ** 2 + (vy - ty) ** 2);
}
```

Zamienić na:
```javascript
_calcDistAU(vessel, target) {
  return NavigationUtils.calcDistance(
    { x: vessel.position.x, y: vessel.position.y }, target
  );
}
```

### 4.3 `FleetManagerOverlay` — wyświetlanie prędkości (linia ~2058)

Obecny kod:
```javascript
`${((ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1)).toFixed(1)} AU/r`
```

Zamienić na:
```javascript
`${NavigationUtils.getEffectiveSpeed(ship?.id ?? vessel.shipId).toFixed(1)} AU/r`
```

### 4.4 `FleetManagerOverlay` — czas podróży w panelu szczegółów (linia ~3271-3274)

Obecny kod:
```javascript
const distAU = this._calcDistAU(vessel, target);
const effectiveSpeed = (ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
const travelYears = effectiveSpeed > 0 ? distAU / effectiveSpeed : Infinity;
const fuelCost = distAU * (vessel.fuel.consumption ?? 0);
```

Zamienić na:
```javascript
const distAU = this._calcDistAU(vessel, target);
const travelYears = NavigationUtils.calcTravelTime(distAU, vessel.id);
const fuelCost = NavigationUtils.calcFuelCost(distAU, vessel.id);
```

---

## Krok 5: Weryfikacja spójności CIV_TIME_SCALE

Po unifikacji sprawdzamy:

1. **VesselManager._updatePositions()** (linia ~776): interpolacja pozycji używa `gameYear` (czas fizyczny) i `departYear/arrivalYear` (też czas fizyczny). Czas podróży z `NavigationUtils.calcTravelTime()` (z CIV_TIME_SCALE) daje krótszy travelTime → `arrivalYear` bliższy → interpolacja zakończy się szybciej. To jest spójne z `civDeltaYears` tickiem VesselManager (linia 62).

2. **VesselManager._tickForeignRecon()** — teraz też używa CIV_TIME_SCALE → podróże w obcych układach będą 12× szybsze niż wcześniej. To jest POŻĄDANE (spójność z home system).

3. **ExpeditionSystem._checkArrivals()** — porównuje `_gameYear >= arrivalYear` gdzie `_gameYear` = `gameTime` (physics). Z CIV_TIME_SCALE w prędkości: `arrivalYear = gameYear + (dist / (speed * 12))` → mniejszy offset → szybsze przybycie. Spójne.

---

## Krok 6: Testy manualne

Po wdrożeniu:

1. **Home system — recon z homePlanet:**
   - Wysłać statek na recon → sprawdzić czas podróży
   - Porównać z odległością w AU (powinno być proporcjonalne)

2. **Home system — misja z drugiej kolonii:**
   - Mieć kolonię na innej planecie
   - Wysłać statek z Colony B → sprawdzić czy odległość jest od Colony B (nie homePlanet)

3. **Obcy układ — foreign recon:**
   - Przylecieć do obcego układu
   - Redirectować statek na planetę → sprawdzić czas podróży
   - Powinien być proporcjonalny do odległości (nie 12× za wolny jak wcześniej)

4. **Trade route:**
   - Uruchomić trasę handlową między koloniami
   - Sprawdzić czy cargo ship dociera w rozsądnym czasie

5. **Save/Load:**
   - Zapisać w trakcie misji → załadować → misja kontynuuje poprawnie
   - Format save się NIE ZMIENIA — ten refaktor nie dotyka danych

---

## Checklist zależności

- [x] `DistanceUtils.js` — NavigationUtils importuje i deleguje `euclideanAU`; DistanceUtils bez zmian
- [x] `GameConfig.js` — NavigationUtils importuje `CIV_TIME_SCALE`, `AU_TO_PX`; bez zmian
- [x] `ShipsData.js` — NavigationUtils importuje `SHIPS`; bez zmian
- [x] `Vessel.js` — `vessel.fuel.consumption` używany przez `calcFuelCost()`; bez zmian
- [x] `EntityManager.js` — `getVesselOrigin()` używa `EntityManager.get()`; bez zmian
- [x] `TechSystem.js` — `getShipSpeedMultiplier()`, `getFuelEfficiency()` wywoływane; bez zmian
- [x] `EventBus` — żadne eventy nie są dodawane/usuwane/zmieniane
- [x] `SaveSystem` / `SaveMigration` — format save bez zmian (nie dotykamy danych)
- [x] `ThreeRenderer.js` — renderuje pozycje z `vessel:positionUpdate`; bez zmian
- [x] `ColonyManager.js` — nie dotykamy (budowa statków, kolonie)
- [x] `TradeRouteManager.js` — nie dotykamy (cargo delivery on docked)
- [x] `MissionEventModal.js` — nie dotykamy (popupy)
- [x] `BottomContext.js` — nie dotykamy (informacyjne, używa DistanceUtils bezpośrednio)
- [x] `BodyDetailModal.js` — nie dotykamy (używa DistanceUtils bezpośrednio)
- [x] `FleetPanel.js` — nie dotykamy (wyświetla range z Vessel.js, nie oblicza nawigacji)
- [x] `PlanetGlobeScene.js` — nie dotykamy (mapa planety, nie nawigacja)
- [x] Interstellar jump (VesselManager) — NIE dotykamy (LY, inny model)
- [x] `_calcRoute()`, `_interpolateWaypoints()` — NIE dotykamy (routing, nie nawigacja)
- [x] `_findNearestUnexplored()` — zostaje w ExpeditionSystem (logika recon, nie nawigacja), ale używa `NavigationUtils.calcDistance` do sortowania
- [x] `_findNearestUnexploredFrom()` — jak wyżej

## Checklist: co się zmienia

| Plik | Zmiana |
|------|--------|
| `src/utils/NavigationUtils.js` | **NOWY** — 6 statycznych metod |
| `src/systems/ExpeditionSystem.js` | Usunięcie `_calcDistance`, `_getShipSpeed`, `_getVesselOrigin`; import NavigationUtils; zamiana ~30 wywołań |
| `src/systems/VesselManager.js` | Import NavigationUtils; zamiana ~3 bloków ręcznych obliczeń na NavigationUtils |
| `src/ui/ExpeditionPanel.js` | Import NavigationUtils; zamiana 1 wywołania `_calcDistance` |
| `src/ui/FleetManagerOverlay.js` | Import NavigationUtils; zamiana `_calcDistAU`, prędkość w panelu, czas podróży |

## Czego NIE robimy

- Nie zmieniamy EventBus kontraktów
- Nie zmieniamy formatu save
- Nie zmieniamy cyklu życia misji (kto tworzy expedition, kto dispatches vessel)
- Nie zmieniamy UI layoutu
- Nie dotykamy interstellar jumps (model LY)
- Nie dotykamy routingu (_calcRoute, waypoints, unikanie Słońca)
- Nie dodajemy nowych funkcjonalności
- Nie zmieniamy `_findNearestUnexplored` / `_findNearestUnexploredFrom` — tylko delegują do NavigationUtils
