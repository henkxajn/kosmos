# Milestone 2 — Combat & Intelligence (MASTER PLAN)

> **⚠ SPLIT APPROVED — 2026-04-23.** Milestone 2 podzielony na dwa osobne
> milestony implementacyjne. Ten dokument pozostaje jako **master reference**
> (decyzje architektoniczne, scope analysis, performance budget w całości).
> Implementację prowadź według dedykowanych slice-docs:
>
> - **M2a** — Combat Core, save v65→v66, commits 1-8 → [`milestone-2a-combat-core.md`](./milestone-2a-combat-core.md)
> - **M2b** — Intelligence + POI, save v66→v67, commits 1-7 → [`milestone-2b-intelligence-poi.md`](./milestone-2b-intelligence-poi.md)
>
> Rozszczepienie migracji: M2a bumpuje save do v66 (wreckLocation, battleRec.location,
> movementOrder.retreatFromBattleId), M2b bumpuje do v67 (gameState.pois,
> gameState.intel.vessels, movementOrder.poiId, movementOrder.predictionCone).
> Feature flagi rozdzielone — M2a daje 3 (proximitySystem, vesselCombat,
> unifiedAggregator), M2b dokłada 3 (intelContactState, predictionCone, poiSystem).

**Status:** design approved — split into M2a + M2b
**Save version target:** v65 → v66 (M2a) → v67 (M2b)
**Dependencies:** M1 Targeting Foundation (save v65, tag `m1-complete`)
**Related:** `docs/design/m2-reconnaissance.md`, `docs/design/milestone-1-targeting-foundation.md`

---

## 1. Weryfikacja kontekstu

Fakty z `m2-reconnaissance.md` zweryfikowane w kodzie (stan w dniu pisania —
save v65, branch `main`, commit `89738b9`):

| Fakt | Status | Referencja |
|---|---|---|
| `SaveMigration.CURRENT_VERSION = 65` | ✓ | `src/systems/SaveMigration.js:20` |
| 3 combat triggery: EnemyAttackHandler / WarSystem._fleetArrived / WarSystem.forceBattle | ✓ | `EnemyAttackHandler.js:141`, `WarSystem.js:322`, `WarSystem.js:212` |
| TODO M2 linia 516 w MOS dla vessel-vs-vessel | ✓ | `MovementOrderSystem.js:516-517` |
| `MovementOrderSystem._onVesselWrecked` z `blockReason='target_lost'` | ✓ | `MovementOrderSystem.js:670-691` |
| IntelSystem jest per-empire (`gameState.intel[empireId]`) | ✓ | `IntelSystem.js:68`, levels unknown/rumor/contact/detailed |
| `MovementOrderTypes` ma `patrol`/`escort` stuby + TODO `goToPOI` | ✓ | `MovementOrderTypes.js:14-20`, komentarz linia 10-12 |
| Feature flag `fleetMaterialization=false` (OFF by default) | ✓ | `GameConfig.js:43` |
| Endurance drain multiplier nie istnieje (baseline tylko) | ✓ | `VesselManager.js:1100-1140` |
| BUG#4 "deep-space drift state" udokumentowany | ✓ | `MovementOrderSystem.js:493-502` |
| `vessel:arrived` emit tylko w dwóch miejscach | ✓ | `VesselManager.js:395`, `:1467` |
| `EnemyAttackHandler._turnIntoWreck` wymaga `dockedAt` | ✓ | `EnemyAttackHandler.js:227-264` |
| `empireFleetToBattleUnit` vs `playerVesselsToBattleUnit` — dwa agregatory | ✓ | `BattleSystem.js:177`, `:219` |

### 1.1. Odchylenia / dodatkowe fakty nieudokumentowane w raportach

1. **`transitionToWreck` wymaga `planetId`** (`OrbitalSpaceSystem.js:182` → `assignOrbit(planetId, ...)`).
   Deep-space wrak (po bitwie vessel↔vessel z dala od ciał) NIE ma natural planetId.
   Raport `m2-reconnaissance.md` tego nie wspomniał. Decyzja w §8.3 (statyczny wrak
   bez orbital assignment) — wymaga rozszerzenia kontraktu `_turnIntoWreck` lub
   osobnej ścieżki `_turnIntoDeepSpaceWreck`.
2. **`_turnIntoWreck` ustawia `vessel.position.dockedAt = dockedAt ?? vessel.position.dockedAt ?? null`**
   — fallback na null już istnieje, więc "dockedAt=null wrak" nie jest zabronione, ale
   wtedy orbital assignment jest pomijany (linia 240 `if (orbital && vessel.position.dockedAt)`).
   Oznacza to że deep-space wrak *technicznie* może istnieć w save'ach już teraz —
   potrzebujemy tylko dodać `vessel.wreckLocation` dla persystencji pozycji.
3. **`GameConfig.FEATURES` ma tylko 2 flagi** (`movementOrders`, `fleetMaterialization`).
   M2 dokłada 6 — struktura zostaje płaska `FEATURES: { ... }` bez nested namespace.
4. **`VesselManager._tick` budżet ticka**: brak formalnego limitu iteracji w obecnym
   `_tickEndurance`/`_updatePositions` (każdy vessel przetwarzany co tick). Dodajemy
   budget TYLKO w ProximitySystem (nowy system) — reszta zachowuje się jak w M1.

Brak odchyleń które blokują plan. Idziemy do przodu.

---

## 2. Schema danych

### 2.1. `vessel.wreckLocation` (nowe pole)

```js
vessel.wreckLocation = null | { x: number, y: number };
```

**Miejsce:** `src/entities/Vessel.js`, w obiekcie zwracanym z `createVessel()`,
obok `position`.

**Inwarianty:**
- `null` dla żywych vesseli i wraków orbitujących ciała (dockedAt ≠ null).
- `{x, y}` tylko gdy `isWreck === true && position.dockedAt === null` (deep-space wrak).
- Pozycja zamrożona w momencie `_turnIntoWreck` — nigdy później nie aktualizowana.

**Serializacja:** serialize tylko gdy `!= null`. Nowe pole w
`VesselManager.serialize()` obok `wreckedAt`. Restore: `vd.wreckLocation ?? null`.

### 2.2. `vessel.movementOrder` — rozszerzenie

M1 definiował `{ type, targetEntityId, targetPoint, patrolRoute, lastTargetPos,
interceptPoint, status, blockReason, ... }` (`MovementOrderSystem.js:195-208`).
M2 dokłada:

```js
vessel.movementOrder = {
  // ... istniejące pola M1 ...

  // NEW (M2):
  poiId:          string | null,       // dla type='goToPOI'
  predictionCone: null | {             // dla type='intercept', updated per tick
    originX, originY,                  // pursuer position
    dirX, dirY,                        // unit vector do interceptPoint
    angleWidth,                        // radians, półkąt stożka
    rangeAU,                           // długość stożka w AU (dist-to-intercept)
    confidence,                        // 0..1 z obs. quality
    updatedYear,                       // gameYear
  },
  retreatFromBattleId: string | null,  // dla auto-retreat orderów (issuedBy='auto_retreat')
}
```

**Order types enum — rozszerzenie** (`MovementOrderTypes.js`):
```js
export const ORDER_TYPES = Object.freeze({
  moveToPoint: 'moveToPoint',
  pursue:      'pursue',
  intercept:   'intercept',
  patrol:      'patrol',     // M1: stub; M2: runtime impl
  escort:      'escort',     // M1: stub; M2: runtime impl
  goToPOI:     'goToPOI',    // M2 NEW
});
```

`TYPES_WITH_POI_TARGET = new Set([ORDER_TYPES.goToPOI])` — nowy set w validatorze.
Escort dołącza do `TYPES_WITH_ENTITY_TARGET` (target = vessel do eskorty).

### 2.3. `gameState.pois` (nowa domena)

```js
gameState.pois = {
  [poiId]: {
    id:         string,        // 'poi_<nextId>'
    type:       'waypoint' | 'patrol' | 'picket' | 'rally' | 'ambush',
    name:       string,        // edytowalne
    ownerEmpireId: string | 'player',
    createdYear: number,

    // Per-type specific (discriminated union po `type`):

    // waypoint:
    point:      { x, y },

    // patrol:
    waypoints:  [{x,y}, ...],   // min 2
    loopMode:   'loop' | 'ping_pong',

    // picket:
    center:     { x, y },
    rangePxLocal: number,        // zasięg alarmu (px)
    alertOnEmpireIds: string[] | null,  // null = każdy wrogi

    // rally:
    center:     { x, y },
    waitForCount: number,
    memberVesselIds: string[],   // vessel które już dotarły

    // ambush:
    center:     { x, y },
    rangePxLocal: number,
    triggerOnEmpireIds: string[] | null,
    hidden:     bool,            // czy emituje signature (rumor quality dla obcych)
  },
};
```

**Miejsce:** `src/core/GameState.js` domena — mutacje tylko przez
`POIRegistry.createPOI/updatePOI/deletePOI` (intent methods).

**Serializacja:** całość `gameState.pois` jako obiekt; każdy POI self-contained.

**Limit:** soft cap 100 POI per scenariusz (warning w konsoli przy 90+). Brak
hard limit w M2.

### 2.4. `gameState.intel.vessels` (nowa sub-domena)

Rozszerzenie `IntelSystem` (nie nowy system — §2.9 decyzja Alt-B). Istniejąca
struktura `gameState.intel[empireId]` pozostaje nietknięta; dokładamy
równoległą `gameState.intel.vessels[vesselId]`:

```js
gameState.intel.vessels = {
  [vesselId]: {
    quality:       'rumor' | 'contact' | 'detailed',
    firstSeenYear: number,
    lastSeenYear:  number,
    positionKnown: bool,              // true gdy w zasięgu proximity
    positionLastKnown: { x, y },      // stale jeśli positionKnown=false
    strengthEstimate: number | null,  // np. hp aggregate — tylko dla rumor+
    hullKnown:    bool,               // czy znamy dokładny hullId
    modulesKnown: bool,               // czy znamy listę modułów
  },
};
```

**Semantic:**
- `rumor`: wiemy że *coś* tam jest, strength ±50%, brak position (tylko general direction).
- `contact`: dokładna pozycja + strength. Brak modułów.
- `detailed`: wszystko + modules + hull. Wymaga away team lub long observation.

**Mutacje:** tylko przez `IntelSystem.advanceVesselContact(vesselId, quality, reason)`.

### 2.5. `battleRec.location` — rozszerzenie

M1 (i obecny kod): `location` to string (systemId lub planetId). M2 rozszerza do
obiektu:

```js
battleRec.location = {
  systemId: string,                   // zawsze wymagane
  planetId: string | null,            // gdy bitwa nad planetą
  point:    { x, y } | null,          // gdy deep-space (engagement vessel↔vessel)
};
```

**Backward-compat:** UI i handlery (`GameScene.js:684, 710`, `BattleIntroModal`)
sprawdzają `typeof battleRec.location === 'string'` i opakują do
`{ systemId: string }`. Konwerter helper w `src/utils/BattleLocation.js` (nowy
moduł — 20 linii).

### 2.6. Feature flags (6 nowych)

`src/config/GameConfig.js:41-44`:

```js
FEATURES: {
  movementOrders:       false,  // M1
  fleetMaterialization: false,  // M1

  // M2 — wszystkie OFF by default
  proximitySystem:      false,  // ProximitySystem
  vesselCombat:         false,  // VesselCombatSystem (wymaga proximitySystem)
  unifiedAggregator:    false,  // WarSystem._fleetArrived skip dla materialized
  intelContactState:    false,  // IntelSystem.vessels sub-domain + degradation
  predictionCone:       false,  // prediction cone math + rendering
  poiSystem:            false,  // POIRegistry + goToPOI/patrol/escort runtime
},
```

**Dependencies:** `vesselCombat` implicitly wymaga `proximitySystem` (combat trigger
słucha proximity events). GameScene podczas init sprawdza i wypisuje warning przy
konflikcie.

### 2.7. Migracja v65 → v66

Plik: `src/systems/SaveMigration.js`.

**Bump:**
```js
export const CURRENT_VERSION = 66;
// ... w MIGRATIONS map:
65: _migrateV65toV66,
```

**Funkcja:**
```js
function _migrateV65toV66(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (!c4x) return data;

  // (a) vessel.wreckLocation default null
  const vessels = c4x.vesselManager?.vessels ?? [];
  for (const v of vessels) {
    if (v.wreckLocation === undefined) v.wreckLocation = null;

    // movementOrder extension: poiId + predictionCone + retreatFromBattleId
    if (v.movementOrder) {
      if (v.movementOrder.poiId === undefined) v.movementOrder.poiId = null;
      if (v.movementOrder.predictionCone === undefined) v.movementOrder.predictionCone = null;
      if (v.movementOrder.retreatFromBattleId === undefined) v.movementOrder.retreatFromBattleId = null;
    }
  }

  // (b) gameState.pois — nowa domena
  const gs = data.gameState ?? {};
  if (!gs.pois) gs.pois = {};

  // (c) gameState.intel.vessels — nowa sub-domena
  if (!gs.intel) gs.intel = {};
  if (!gs.intel.vessels) gs.intel.vessels = {};

  // (d) battleRec.location — string → object
  if (gs.battles && typeof gs.battles === 'object') {
    for (const br of Object.values(gs.battles)) {
      if (typeof br.location === 'string') {
        br.location = { systemId: br.location, planetId: null, point: null };
      } else if (!br.location) {
        br.location = { systemId: 'sys_home', planetId: null, point: null };
      }
    }
  }

  data.version = 66;
  return data;
}
```

**Backup:** istniejący mechanizm `kosmos_save_backup_v65` w localStorage przed
migracją. Brak zmian w backup logic.

**Post-migration check:** vessele `dockedAt===null && !isWreck && movementOrder===null`
(BUG#4 residuum) pozostają w drifcie — AutoRetreatSystem **nie** obsługuje tego case
przy restore (BUG#4 nie jest "bitwą"). Opcja: po migracji emit
`vessel:postRestoreCheck` → dla każdego drift vessela emit
`vessel:driftDetected` → UI pokaże ostrzeżenie. **Decyzja: NIE** (komplikuje
migrację). Drift vessele po load po prostu stoją; gracz wyda manual order.

---

## 3. EventBus contract

### 3.1. ProximitySystem (NEW)
| Event | Emitter | Payload | Subscribers |
|---|---|---|---|
| `vessel:proximityEnter` | ProximitySystem | `{ vesselAId, vesselBId, distanceAU, sameFaction: bool }` | VesselCombatSystem, IntelSystem |
| `vessel:proximityExit` | ProximitySystem | `{ vesselAId, vesselBId }` | IntelSystem |

### 3.2. VesselCombatSystem (NEW)
| Event | Emitter | Payload | Subscribers |
|---|---|---|---|
| `vessel:engaged` | VesselCombatSystem | `{ sideA: vesselIds[], sideB: vesselIds[], location: {systemId, point} }` | UIManager (notification), IntelSystem |
| `battle:deepSpaceResolved` | VesselCombatSystem | `{ battleId, result, participantA, participantB }` (variant `battle:resolved`) | GameScene, InvasionSystem |

**Uwaga:** `battle:resolved` emitowany tak jak w M1 (backward-compat). Dodanie
`battle:deepSpaceResolved` opcjonalne — UI może słuchać tylko `battle:resolved`
i sprawdzać `result.location.point !== null`.

### 3.3. AutoRetreatSystem (NEW)
| Event | Emitter | Payload | Subscribers |
|---|---|---|---|
| `vessel:autoRetreatIssued` | AutoRetreatSystem | `{ vesselId, battleId, destinationPlanetId, orderId }` | UIManager (EventLog), IntelSystem |
| `vessel:autoRetreatFailed` | AutoRetreatSystem | `{ vesselId, battleId, reason }` (`reason` ∈ 'no_friendly_planet', 'all_outposts_blocked') | UIManager (EventLog) |

### 3.4. IntelSystem (MOD — new events dla vessel sub-domain)
| Event | Emitter | Payload | Subscribers |
|---|---|---|---|
| `intel:vesselContactChanged` | IntelSystem | `{ vesselId, oldQuality, newQuality, reason }` | UIManager (FleetOverlay) |
| `intel:vesselContactLost` | IntelSystem | `{ vesselId, lastKnownPosition, reason }` | UIManager, ThreeRenderer (sprite dim) |

### 3.5. POIRegistry (NEW)
| Event | Emitter | Payload | Subscribers |
|---|---|---|---|
| `poi:created` | POIRegistry | `{ poi }` | UIManager, MovementOrderSystem |
| `poi:updated` | POIRegistry | `{ poiId, poi }` | UIManager, MovementOrderSystem |
| `poi:deleted` | POIRegistry | `{ poiId }` | MovementOrderSystem (cancel orders), UIManager |
| `poi:vesselReached` | MovementOrderSystem | `{ vesselId, poiId }` | POIRegistry (rally tracker), IntelSystem |

### 3.6. MovementOrderSystem (MOD — new events dla M2 order types)
| Event | Emitter | Payload | Subscribers |
|---|---|---|---|
| `vessel:goToPOIIssued` | MovementOrderSystem | `{ vesselId, orderId, poiId }` | UIManager |
| `vessel:patrolStarted` | MovementOrderSystem | `{ vesselId, orderId, poiId, waypointIndex }` | UIManager, ProximitySystem |
| `vessel:patrolWaypointReached` | MovementOrderSystem | `{ vesselId, orderId, waypointIndex }` | UIManager |
| `vessel:escortStarted` | MovementOrderSystem | `{ vesselId, orderId, escorteeId }` | UIManager |
| `vessel:escortLost` | MovementOrderSystem | `{ vesselId, orderId, reason }` (`escortee_lost`, `escortee_wrecked`) | UIManager |

### 3.7. Backward compat — żadne M1 eventy nie zmieniają payloadu

- `vessel:orderIssued`, `vessel:orderCompleted`, `vessel:orderBlocked`,
  `vessel:orderCancelled` — identyczne jak w M1
- `vessel:wrecked` — identyczne (ale nowy kontekst: wrak deep-space)
- `battle:resolved` — identyczne, z `location` jako obiekt (post-migracja)

---

## 4. Klasy i moduły

### 4.1. NEW files

| Plik | Odpowiedzialność |
|---|---|
| `src/systems/ProximitySystem.js` | Per-tick proximity detection, emit enter/exit events |
| `src/systems/VesselCombatSystem.js` | Słucha proximityEnter, resolve deep-space battles |
| `src/systems/AutoRetreatSystem.js` | Słucha `battle:resolved` z `retreated`, wydaje moveToPoint orders |
| `src/systems/POIRegistry.js` | CRUD POI + validation per type |
| `src/utils/PredictionConeMath.js` | `computeCone(pursuer, target, obsQuality)` → cone geometry |
| `src/utils/BattleLocation.js` | Helper konwersji `location: string | object` |
| `src/data/POITypes.js` | Enum typów POI + validator per-type schema |

### 4.2. MOD files

| Plik | Zakres zmian |
|---|---|
| `src/systems/MovementOrderSystem.js` | Dodaj `_issueGoToPOI`, `_issuePatrol`, `_issueEscort` (zastąpienie stub M1); `_tickPatrolOrder`, `_tickEscortOrder`; prediction cone updater w `_tickInterceptOrder` |
| `src/data/MovementOrderTypes.js` | Dodaj `goToPOI` do enum; `TYPES_WITH_POI_TARGET` set; walidator dla goToPOI |
| `src/systems/VesselManager.js` | `_tickEndurance` drain multiplier (×3-4 dla pursue/intercept); serialize `wreckLocation` |
| `src/systems/IntelSystem.js` | `advanceVesselContact`, `getVesselContact`, `_tickVesselDegradation` (nowy passive ticker), subskrypcja `vessel:proximityEnter/Exit` |
| `src/systems/WarSystem.js` | `_fleetArrived` sprawdza `fleet.materializationState === 'full' && materializedVesselIds.length > 0` → skip |
| `src/systems/EnemyAttackHandler.js` | `_turnIntoWreck` wywoływany przez VesselCombatSystem z deep-space location — rozszerzenie by akceptowało `wreckLocation` zamiast `dockedAt` (gdy `dockedAt===null`, użyj `wreckLocation`) |
| `src/renderer/ThreeRenderer.js` | Prediction cone mesh (ConeGeometry/TubeGeometry); deep-space wrak sprite z wreckLocation |
| `src/systems/SaveMigration.js` | `_migrateV65toV66` + bump `CURRENT_VERSION=66` |
| `src/config/GameConfig.js` | 6 nowych FEATURES flagów |
| `src/scenes/GameScene.js` | `_ensureProximitySystem`, `_ensureVesselCombatSystem`, etc. (6 lazy init); debug hooks `enableProximity`, `enableVesselCombat`, ... |
| `src/entities/Vessel.js` | `wreckLocation` default null; movementOrder extension (poiId, predictionCone, retreatFromBattleId) |

### 4.3. Publiczne API (signatures)

**ProximitySystem:**
```
constructor(vesselManager)
_tick(civDy)  — wywoływane z VesselManager._tick
destroy()
getProximityPairs() → Iterable<[vesselIdA, vesselIdB]>  — debug
```

**VesselCombatSystem:**
```
constructor(vesselManager, warSystem)
destroy()
_onProximityEnter({vesselAId, vesselBId, distanceAU, sameFaction})  — private
resolveDeepSpaceBattle(teamA, teamB, location) → battleRec  — public (debug)
```

**AutoRetreatSystem:**
```
constructor(vesselManager, colonyManager, movementOrderSystem)
destroy()
_findNearestFriendlyPlanet(vessel) → {colony, planet, distanceAU} | null
_issueRetreatOrder(vessel, battleId) → orderId | null
```

**POIRegistry:**
```
constructor()
createPOI(spec) → {ok, poiId?, reason?}
updatePOI(poiId, changes) → {ok, reason?}
deletePOI(poiId) → {ok, reason?}
getPOI(poiId) → poi | null
listPOIs(filter?) → poi[]
listByType(type) → poi[]
vesselReachedPOI(vesselId, poiId)  — called by MOS on arrival
destroy()
```

**PredictionConeMath (pure functions):**
```
computeCone(pursuerPos, targetPos, targetVelocity, pursuerSpeedAU, obsQuality) → cone
qualityToAngleMultiplier(quality) → number  // 'detailed'=0.2, 'contact'=0.6, 'rumor'=1.5
```

**BattleLocation (pure utils):**
```
normalize(location) → {systemId, planetId: null, point: null}
isDeepSpace(location) → bool
```

### 4.4. Relacje (depth-first)

```
VesselManager._tick (coordinator)
  → _tickEndurance (MOD: uses movementOrder.type for drain multiplier)
  → ProximitySystem._tick (NEW)
    → emit vessel:proximityEnter/Exit
      ← VesselCombatSystem consumes (NEW)
        → VesselCombatSystem.resolveDeepSpaceBattle
          → BattleSystem.resolveBattle (unchanged, pure fn)
          → emit battle:resolved
            ← AutoRetreatSystem consumes (NEW)
              → AutoRetreatSystem._issueRetreatOrder
                → MovementOrderSystem.issueOrder (MOD: moveToPoint issuedBy='auto_retreat')
      ← IntelSystem._onVesselProximityEnter (MOD: advanceVesselContact)
  → MovementOrderSystem._tick (MOD: +patrol, +escort, +goToPOI)
    → _tickInterceptOrder (MOD: compute predictionCone)
    → _tickPatrolOrder (NEW)
    → _tickEscortOrder (NEW)
  → _updatePositions (unchanged)
  → _tickWreckCleanup (unchanged)

time:tick (1 civYear accumulator)
  → IntelSystem._passiveTick (MOD: +_tickVesselDegradation)
  → POIRegistry — no tick, event-driven

EventBus standalone:
  → battle:resolved → AutoRetreatSystem (already described)
  → poi:deleted → MovementOrderSystem (cancel orders with poiId = deletedId)
  → vessel:wrecked → POIRegistry (remove from rally.memberVesselIds)
```

---

## 5. Tick loop integration

### 5.1. Diagram kolejności w VesselManager._tick

```
VesselManager._tick(civDy, physDy) {
  this._tickRefueling(civDy);
  this._tickRepair(civDy);
  this._tickFullScans(civDy);
  this._tickEndurance(civDy);                    // MOD — drain multiplier

  if (FEATURES.proximitySystem) {
    this.proximitySystem?._tick(civDy);          // NEW — emit events
  }
  // vesselCombatSystem działa EVENT-DRIVEN (nie ma własnego tick)
  // autoRetreatSystem działa EVENT-DRIVEN

  if (FEATURES.movementOrders) {
    this.movementOrderSystem?._tick(civDy);      // MOD — patrol, escort, goToPOI
  }

  this._updatePositions(civDy, physDy);
  this._tickWreckCleanup(civDy);
}
```

### 5.2. Uzasadnienie kolejności

1. **`_tickEndurance` PRZED `ProximitySystem`**: endurance może wyczerpać się
   w trakcie pursue; jeśli vessel przekroczy threshold = 0, event
   `vessel:enduranceDepleted` może w przyszłości (M3) forcować return. W M2 tylko
   emit event, nie blokuje. Kolejność bezpieczna.

2. **`ProximitySystem` PRZED `MovementOrderSystem`**: krytyczne. VesselCombatSystem
   konsumuje `vessel:proximityEnter` SYNCHRONICZNIE (EventBus). Jeśli combat
   wrecka targeta Bellatora, `vessel:wrecked` emituje przed MOS._tick → MOS
   `_onVesselWrecked` już ustawi blockReason. Dzięki temu unikamy race: MOS
   widzi pursue na "zniszczony w tym ticku" target.

3. **`MovementOrderSystem` PRZED `_updatePositions`**: zachowane z M1 (M1 §5.1).
   MOS modyfikuje `vessel.position.x/y` bezpośrednio dla pursue/intercept; nowe
   patrol/escort/goToPOI używają `vessel.mission` (syntezowanej) więc
   `_updatePositions` interpoluje je standardowo.

4. **`_updatePositions` PRZED `_tickWreckCleanup`**: zachowane z M1.

5. **`time:tick` ticker (1 civYear accumulator)**: IntelSystem._passiveTick
   dodaje `_tickVesselDegradation` jako dodatkowa faza. POIRegistry nie ma tick'a
   — jest event-driven + read-only queries z MOS.

### 5.3. Event handling (synchronous vs deferred)

Wszystkie eventy w M2 są **synchronous** (EventBus.emit → subscribers odpalają
w stack). **Wyjątek:** `battle:resolved` w dłuższym battle timeline → UI
animuje cinematic asynchronously, ale sam `battle:resolved` jest sync —
AutoRetreatSystem dostaje go natychmiast, zanim cinematic się zaczyna.

**Risk:** dla cinematic-based UX, auto-retreat order jest wydany zanim gracz
zobaczy ekran "ZWYCIĘSTWO/RETREAT". UI pokazuje order po zamknięciu cinematic
— sprawdzone że `vessel:orderIssued` jest w logu BEFORE cinematic close.

### 5.4. POI → MOS integration

POI nie ma tick'a. Gdy:
- `MovementOrderSystem.issueOrder(vesselId, {type:'goToPOI', poiId})` → MOS
  resolve'uje POI przez `POIRegistry.getPOI(poiId)`, używa `poi.point` (waypoint)
  lub `poi.waypoints[0]` (patrol starting point) jako targetPoint → deleguje do
  moveToPoint logic.
- `MovementOrderSystem._tickPatrolOrder` → sprawdza czy vessel dotarł do current
  waypoint (proximity check); jeśli tak, advance do next waypoint.
- `poi:deleted` → MOS iteruje `_byVessel`, dla każdego orderu z `poiId ===
  deletedId` → `_blockAndCancel(..., 'poi_deleted')`.

---

## 6. Performance budget

### 6.1. Założenia scale

- **Typical game**: 10-30 vesseli (gracz 5-15, materializacja 5-15 gdy feature on).
- **Peak**: 100 vesseli (gracz 20, materialized 40, enemy_test/dev 40).
- **Max projected**: 150 vesseli (M3 scale).

### 6.2. ProximitySystem cost

- **O(n²/2) par**: 100 vesseli = 4950 par. 150 = 11175 par.
- **Per-pair cost**: `Math.hypot(dx, dy)` + ownerEmpireId check + hysteresis
  Set.has + map bookkeeping ≈ 20-50 ns w V8.
- **Pełna iteracja**: 100 vesseli × 50 ns/par = ~250 µs = 0.25 ms.
- **Budget MAX_PAIRS_PER_TICK = 500**: przy 100 vesseli pełne skanowanie
  potrzebuje 10 ticków = 10 frames = ~160ms przy 60fps. Przy 150 vesseli: ~22
  ticków = ~360ms (ok).
- **Decision**: O(n²) naiwny jest wystarczający dla M2. Spatial hash upgrade →
  M3 jeśli peak > 150.

### 6.3. IntelSystem.vessels cost

- **Degradation tick**: O(n) gdzie n = |intel.vessels|. Dla n ≤ 100, ~100 × 10 ns
  = 1 µs per tick. Znikome.
- **proximityEnter handler**: O(1) per event.

### 6.4. VesselCombatSystem cost

- **Event-driven**: koszt tylko gdy `vessel:proximityEnter` faktycznie odpala
  (rzadko). BattleSystem.resolveBattle to czysta funkcja z max 30 turnami; ~5-15
  ms per battle (dominuje `resolveVolley` × `weapons.length` per turn). Nie
  mieści się w 1 ticku przy 60fps, ale bitwa to exception, nie norma —
  akceptowalne.

### 6.5. POIRegistry cost

- **createPOI / deletePOI**: O(n_orders) dla cleanup przy delete. n_orders ≤ |vessels|.
- **goToPOI order resolve**: O(1) lookup.
- **_tickPatrolOrder**: O(1) per vessel z aktywnym patrol.

### 6.6. Prediction cone cost

- **computeCone**: O(1) — kilka mnożeń + trig. <1 µs per vessel z intercept.
- **Rendering**: Three.js ConeGeometry per aktywny intercept order. Max ~20
  simultaneous intercepts → 20 mesh updates per frame. Każdy ~0.5 ms
  (ConeGeometry dispose + create). Suma: ~10ms — niebezpieczne przy 60fps.
- **Mitigation**: reuse single ConeGeometry instance, mutate `mesh.scale` i
  `mesh.rotation` zamiast regenerować geometry. Koszt spada do ~0.05 ms per
  cone.

### 6.7. Całkowity budget per tick przy peak 100 vesseli

| Faza | Koszt (ms) |
|---|---:|
| _tickEndurance | 0.05 |
| ProximitySystem._tick (500 pairs budget) | 0.025 |
| VesselCombatSystem events (zero-średni) | 0.0 |
| MOS._tick (30 active orders) | 0.3 |
| _updatePositions | 0.5 |
| IntelSystem vessel degradation | 0.001 |
| Prediction cone updates (20 intercepts) | 1.0 |
| **Total target** | **~2 ms** |

Przy 16.67 ms budget na frame (60fps) — mieścimy się z dużym zapasem.
Bitwa (5-15ms) to pojedyncze zdarzenie, nie co-frame.

---

## 7. ProximitySystem — szczegóły

### 7.1. Data structures

```js
class ProximitySystem {
  _vm;                        // VesselManager
  _activePairs;               // Set<string> "idA|idB" (sorted)
  _iterationOffset;           // int — rotujący start iteracji dla budget
  _pairCache;                 // WeakMap<vessel, idx> — przyspiesza stable ordering
}
```

### 7.2. Algorithm (pseudokod)

```
_tick(civDy) {
  if (civDy <= 0) return;
  if (!this._vm._vessels.size) return;

  const vessels = [...this._vm._vessels.values()].filter(v =>
    !v.isWreck && v.position  // skip wraki i undefined position
  );

  const n = vessels.length;
  const maxPairs = MAX_PAIRS_PER_TICK;  // 500

  // Rotujący offset zapewnia że w ciągu ~10 ticków wszystkie pary są sprawdzone.
  let checked = 0;
  const startIdx = this._iterationOffset % n;

  for (let i = startIdx; checked < maxPairs && i < n; i++) {
    for (let j = i + 1; checked < maxPairs && j < n; j++) {
      this._checkPair(vessels[i], vessels[j]);
      checked++;
    }
  }
  // Dokończyć od 0 do startIdx gdyby budget starczył
  for (let i = 0; checked < maxPairs && i < startIdx; i++) {
    for (let j = i + 1; checked < maxPairs && j < n; j++) {
      this._checkPair(vessels[i], vessels[j]);
      checked++;
    }
  }

  this._iterationOffset = (this._iterationOffset + checked) % (n * n);
}

_checkPair(v1, v2) {
  const key = pairKey(v1.id, v2.id);
  const dist = Math.hypot(v1.position.x - v2.position.x,
                          v1.position.y - v2.position.y);
  const distAU = dist / AU_TO_PX;
  const sameFaction = v1.ownerEmpireId === v2.ownerEmpireId;
  const currentlyPaired = this._activePairs.has(key);

  if (!currentlyPaired && distAU < PROXIMITY_DETECTION_AU) {
    this._activePairs.add(key);
    EventBus.emit('vessel:proximityEnter', {
      vesselAId: v1.id, vesselBId: v2.id, distanceAU: distAU, sameFaction,
    });
  } else if (currentlyPaired && distAU >= PROXIMITY_EXIT_AU) {
    this._activePairs.delete(key);
    EventBus.emit('vessel:proximityExit', {
      vesselAId: v1.id, vesselBId: v2.id,
    });
  }
}
```

### 7.3. Stałe

```js
const PROXIMITY_DETECTION_AU = 0.5;   // enter threshold
const PROXIMITY_EXIT_AU      = 0.6;   // exit threshold (hysteresis +20%)
const COMBAT_ENGAGEMENT_AU   = 0.15;  // VesselCombatSystem trigger (uses same
                                      // THREAT_RADIUS_AU z MOS)
const MAX_PAIRS_PER_TICK     = 500;
```

### 7.4. Same-faction handling

`sameFaction: true` ląduje w payload (wstępnie nie filtruje). VesselCombatSystem
skipuje same-faction pairs (nie walczą ze sobą). IntelSystem też skipuje
(same-faction = nie wymaga contact update — vessele gracza widzą się zawsze
detailed).

**Dlaczego zwracać payload z flag zamiast skipować już w ProximitySystem?**
Przyszłe use-cases (rally point accumulation: "N own vessels gathered"; escort
hand-off) potrzebują same-faction proximity. Separacja odpowiedzialności.

### 7.5. Orbiting + dockedAt handling

Vessele z `position.state === 'orbiting' && position.dockedAt !== null` mają
pozycję synchronizowaną w `_updatePositions` z OrbitalSpaceSystem (znajduje je
w orbit wokół ciała). ProximitySystem widzi ich aktualny `position.x/y` — OK.

**Edge case:** dwa vessele orbitujące **to samo** ciało w różnych miejscach orbity.
Są w proximity (dystans < 0.5 AU gdy planeta ma promień orbital < 0.5 AU).
Obaj own → skip combat. Jeden wróg → combat triggered. Jak powinno być? Akceptowalne:
gracz musi aktywnie bronić. Jeśli zbyt agresywne, w M3 można dodać
`planetaryShield` flag per colony (orbital combat wstrzymany w zasięgu obrony).

### 7.6. Integracja z MOS (race condition)

ProximitySystem odpala się PRZED MOS._tick. Jeśli Bellator pursue → osiąga
proximity ≤ 0.15 AU → ProximitySystem emituje `vessel:proximityEnter` →
VesselCombatSystem sprawdza `distanceAU ≤ COMBAT_ENGAGEMENT_AU` → resolveBattle.
Ale MOS jeszcze nie zobaczył tego targeta jako "reached" (to jest w jego
`_tickPursueOrder` który odpali SIĘ później w tym samym ticku).

**Scenariusze:**
1. Target ginie w bitwie → `vessel:wrecked` → MOS._onVesselWrecked → blocks
   orders PRZED MOS._tick pętla po orderach. OK.
2. Target retreatuje → żyje, auto-retreat order issued → ale ma nowy
   `movementOrder` (retreat). Co z Bellatorem? Jeszcze aktywny pursue. MOS
   przy _tickPursueOrder znajduje target żywy → kontynuuje pursue (cel leci teraz
   w inne miejsce). Gracz widzi "Pursue: X" → "Target retreats" w logu.
   Akceptowalne — naturalna kontynuacja.
3. Obie strony przeżywają + draw (brak retreat) → proximity pozostaje, więc
   VesselCombatSystem może odpalić PONOWNIE w następnym ticku (no cooldown).
   **BAD.** Dodaj `VesselCombatSystem._recentlyEngagedPairs` z cooldown.

### 7.7. Cooldown dla VesselCombatSystem

```js
const ENGAGEMENT_COOLDOWN_YEARS = 2;  // civYears

class VesselCombatSystem {
  _recentlyEngaged;  // Map<pairKey, lastEngagedYear>

  _onProximityEnter({vesselAId, vesselBId, distanceAU, sameFaction}) {
    if (sameFaction) return;
    if (distanceAU > COMBAT_ENGAGEMENT_AU) return;

    const key = pairKey(vesselAId, vesselBId);
    const lastYear = this._recentlyEngaged.get(key);
    const now = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    if (lastYear != null && (now - lastYear) < ENGAGEMENT_COOLDOWN_YEARS) {
      return;  // cooldown
    }

    this._recentlyEngaged.set(key, now);
    this._resolveEngagement(vesselAId, vesselBId);
  }
}
```

Cooldown → para może stoczyć drugą bitwę dopiero po 2 civYearach. Zapobiega
spam'owi gdy draw/retreat nie rozwiązuje proximity.

---

## 8. Combat integration — szczegóły

### 8.1. Team-up algorithm

Gdy `vessel:proximityEnter` odpala VesselCombatSystem, zbiera wszystkie vessele
w zasięgu COMBAT_ENGAGEMENT_AU od punktu spotkania (midpoint v1+v2):

```
_resolveEngagement(v1Id, v2Id) {
  const v1 = this._vm.getVessel(v1Id);
  const v2 = this._vm.getVessel(v2Id);
  if (!v1 || !v2 || v1.isWreck || v2.isWreck) return;

  const mid = {
    x: (v1.position.x + v2.position.x) / 2,
    y: (v1.position.y + v2.position.y) / 2,
  };

  // Zbierz wszystkie vessele w zasięgu COMBAT_ENGAGEMENT_AU od mid
  const nearby = [...this._vm._vessels.values()].filter(v => {
    if (v.isWreck) return false;
    if (v.position?.state !== 'in_transit' && v.position?.state !== 'orbiting') return false;
    const d = Math.hypot(v.position.x - mid.x, v.position.y - mid.y) / AU_TO_PX;
    return d <= COMBAT_ENGAGEMENT_AU * 1.5;  // mały bufor
  });

  // Grupy by ownerEmpireId
  const groups = new Map();  // ownerId → vessel[]
  for (const v of nearby) {
    const owner = v.ownerEmpireId ?? v.owner ?? 'player';
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner).push(v);
  }

  // Znajdź parę o najwyższej wzajemnej hostility
  const ownerIds = [...groups.keys()];
  if (ownerIds.length < 2) return;  // tylko jedna frakcja
  const pair = findHighestHostilityPair(ownerIds);  // DiplomacySystem lookup
  if (!pair) return;

  const sideA = groups.get(pair[0]);
  const sideB = groups.get(pair[1]);
  this._battle(sideA, sideB, mid, pair);
}
```

**`findHighestHostilityPair`**: iteruje pary `(ownerA, ownerB)` z różnymi empire ID,
bierze `dipl.getHostility(ownerA, ownerB)`. Player vs empire: `getHostility(empireId)`.
Empire vs empire: `dipl.getRelation(ownerA, ownerB).hostility` (wymaga rozszerzenia
DiplomacySystem w przyszłości — M2 pragmatycznie sprawdza tylko player vs empire;
empire vs empire zawsze "neutral" = nie walczą w M2). Upraszczamy scope.

**M2 upraszczenie:** tylko `player ↔ empire` combat triggery. Empire↔empire
starcia poza scope (planowane w M3 z pełnym systemem diplomacji obcych).

### 8.2. BattleSystem call

```
_battle(sideA, sideB, mid, [ownerA, ownerB]) {
  const empireA = window.KOSMOS.empireRegistry?.get(ownerA);
  const empireB = window.KOSMOS.empireRegistry?.get(ownerB);
  const playerSide = ownerA === 'player' ? 'A' : 'B';

  const unitA = playerVesselsToBattleUnit(sideA, HULLS, SHIP_MODULES,
    empireA?.name ?? 'Gracz');
  const unitB = playerVesselsToBattleUnit(sideB, HULLS, SHIP_MODULES,
    empireB?.name ?? 'Gracz');

  const systemId = sideA[0].systemId ?? 'sys_home';
  const location = { systemId, planetId: null, point: { x: mid.x, y: mid.y } };

  const seed = computeSeed(mid, sideA.length, sideB.length, this._gameYear());
  const result = resolveBattle(unitA, unitB, { casusBelli: 'border_incident', location, seed });

  this._applyBattleOutcome(sideA, sideB, result, location);
}
```

### 8.3. Battle outcome + wrak placement

```
_applyBattleOutcome(sideA, sideB, result, location) {
  const mid = location.point;
  const { winner, retreated, lossesA, lossesB } = result;

  const wreckSide = (loser) => {
    for (const v of loser) {
      // Każdy wrecked vessel z deep-space location:
      this._turnIntoDeepSpaceWreck(v, mid, this._gameYear());
    }
  };

  if (winner === 'A' && !retreated) wreckSide(sideB);
  else if (winner === 'B' && !retreated) wreckSide(sideA);
  else if (winner === 'draw')      { wreckSide(sideA); wreckSide(sideB); }

  // Retreat: AutoRetreatSystem obsługuje przez battle:resolved event
  const battleRec = {
    ...result,
    id: `battle_ds_${this._gameYear().toFixed(2)}_${pairKey(sideA[0].id, sideB[0].id)}`.replace(/\./g, '_'),
    location,
    participantA: { type: 'vessel_group', empireId: sideA[0].ownerEmpireId, vesselIds: sideA.map(v => v.id) },
    participantB: { type: 'vessel_group', empireId: sideB[0].ownerEmpireId, vesselIds: sideB.map(v => v.id) },
  };

  gameState.set(`battles.${battleRec.id}`, battleRec, 'deep_space_combat');
  EventBus.emit('battle:resolved', { warId: null, battleId: battleRec.id, result: battleRec });
}
```

### 8.4. `_turnIntoDeepSpaceWreck` (rozszerzenie)

`EnemyAttackHandler._turnIntoWreck(vessel, dockedAt, year)` — rozszerzamy
semantykę: gdy `dockedAt === null && position.point`, używamy deep-space path:

```js
_turnIntoWreck(vessel, dockedAtOrPoint, year) {
  if (!vessel || vessel.isWreck) return;

  const isDeepSpace = typeof dockedAtOrPoint === 'object' && dockedAtOrPoint !== null;

  vessel.isWreck = true;
  vessel.status  = 'destroyed';
  vessel.mission = null;
  vessel.wreckedAt = year;
  vessel.position.state = 'orbiting';

  if (isDeepSpace) {
    vessel.position.dockedAt = null;
    vessel.wreckLocation = { x: dockedAtOrPoint.x, y: dockedAtOrPoint.y };
    vessel.position.x = dockedAtOrPoint.x;
    vessel.position.y = dockedAtOrPoint.y;
    // NIE wywołujemy orbitalSpaceSystem.transitionToWreck
  } else {
    vessel.position.dockedAt = dockedAtOrPoint ?? vessel.position.dockedAt ?? null;
    // istniejąca logika orbital wrak (linia 240-260 w M1)
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    if (orbital && vessel.position.dockedAt) {
      if (orbital.hasOrbit(vessel.id)) orbital.transitionToWreck(vessel.id, year);
      else orbital.assignOrbit(vessel.position.dockedAt, vessel.id, 'wreck');
    }
  }

  vessel.fuel && (vessel.fuel.current = 0);
  EventBus.emit('vessel:wrecked', { vesselId: vessel.id, vessel });
}
```

### 8.5. Auto-retreat algorithm

AutoRetreatSystem słucha `battle:resolved`. Gdy `result.retreated === 'A' || 'B'`,
znajduje vessele strony retreatującej i wydaje każdemu moveToPoint order.

```js
_onBattleResolved({ battleId, result }) {
  if (!result.retreated) return;
  const retreatingSide = result.retreated === 'A' ? result.participantA : result.participantB;
  if (retreatingSide?.type !== 'vessel_group') return;
  const vesselIds = retreatingSide.vesselIds ?? [];

  for (const vId of vesselIds) {
    const v = this._vm.getVessel(vId);
    if (!v || v.isWreck) continue;
    this._issueRetreatOrder(v, battleId);
  }
}

_issueRetreatOrder(vessel, battleId) {
  const dest = this._findNearestFriendlyPlanet(vessel);
  if (!dest) {
    // Retreat fail — wreck i'l vessel
    this._turnIntoWreck(vessel, vessel.wreckLocation ?? vessel.position, this._gameYear());
    EventBus.emit('vessel:autoRetreatFailed', {
      vesselId: vessel.id, battleId, reason: 'no_friendly_planet',
    });
    return null;
  }

  const mos = window.KOSMOS?.movementOrderSystem;
  if (!mos) return null;

  const res = mos.issueOrder(vessel.id, {
    type: 'moveToPoint',
    targetPoint: { x: dest.planet.x, y: dest.planet.y },
    issuedBy: 'auto_retreat',
  });

  if (res.ok) {
    vessel.movementOrder.retreatFromBattleId = battleId;
    EventBus.emit('vessel:autoRetreatIssued', {
      vesselId: vessel.id, battleId, destinationPlanetId: dest.planet.id, orderId: res.orderId,
    });
    return res.orderId;
  }
  return null;
}

_findNearestFriendlyPlanet(vessel) {
  const colMgr = window.KOSMOS?.colonyManager;
  if (!colMgr) return null;

  const ownerId = vessel.ownerEmpireId ?? vessel.owner ?? 'player';
  const colonies = colMgr.getAllColonies().filter(c => {
    const cOwner = c.ownerEmpireId ?? 'player';
    if (cOwner !== ownerId) return false;
    if (ownerId === 'player' && c.isOutpost) return false;  // player preferuje full colonies
    const planet = EntityManager.get(c.planetId);
    return !!planet;
  });

  if (colonies.length === 0) return null;

  let bestColony = null;
  let bestDistAU = Infinity;
  for (const c of colonies) {
    const planet = EntityManager.get(c.planetId);
    const distAU = DistanceUtils.euclideanAU(vessel, planet);
    if (distAU < bestDistAU) {
      bestDistAU = distAU;
      bestColony = { colony: c, planet, distanceAU: distAU };
    }
  }
  return bestColony;
}
```

### 8.6. Unified aggregator (WarSystem skip dla materialized)

`src/systems/WarSystem.js:301` — `_fleetArrived(war, empire, fleet)`:

```js
_fleetArrived(war, empire, fleet) {
  // M2 UNIFIED AGGREGATOR — §2.7 alt-B
  if (FEATURES.unifiedAggregator) {
    if (fleet.materializationState === 'full' &&
        Array.isArray(fleet.materializedVesselIds) &&
        fleet.materializedVesselIds.length > 0) {
      // Fleet reprezentowana przez konkretne vessele — walczą przez
      // ProximitySystem/VesselCombatSystem lub EnemyAttackHandler (ścieżka A).
      // _fleetArrived SKIPUJE abstract battle. Czyść destSystemId + etaYear.
      const fleets = [...(empire.fleets ?? [])];
      const idx = fleets.findIndex(f => f.id === fleet.id);
      if (idx >= 0) {
        fleets[idx] = { ...fleets[idx], destSystemId: null, etaYear: null };
        gameState.set(`empires.${empire.id}.fleets`, fleets, 'fleet_arrived_skipped_materialized');
      }
      return;
    }
  }
  // ... istniejąca logika _fleetArrived (M1) ...
}
```

---

## 9. POI + IntelSystem — szczegóły

### 9.1. POI lifecycle per type

**waypoint:**
- create: `{type:'waypoint', name, point: {x,y}}` → persist, emit poi:created
- update: tylko `name`, `point`. emit poi:updated
- delete: cancel all goToPOI orders targeting this POI. emit poi:deleted

**patrol:**
- create: `{type:'patrol', name, waypoints: [{x,y}, ...], loopMode}` → validate `waypoints.length >= 2`
- update: modyfikacja waypoints przeładowuje aktywny patrol order (teleport do najbliższego waypoint)
- delete: cancel patrol orders

**picket:**
- create: `{type:'picket', name, center, rangePxLocal, alertOnEmpireIds}` → vessel z patrol order na tym POI stoi w center i obserwuje
- runtime: ProximitySystem emit `vessel:proximityEnter` → picket POI sprawdza czy wrogi enter → emit `poi:pickeTriggered` (NEW event, dodaj w §3.5)
- update: range/alerts
- delete: cancel escort orders

**rally:**
- create: `{type:'rally', name, center, waitForCount, memberVesselIds: []}`
- runtime: gdy vessel z goToPOI kończy trip → `POIRegistry.vesselReachedPOI(vesselId, poiId)` → add do `memberVesselIds`; gdy length >= waitForCount → emit `poi:rallyComplete`
- update/delete: standard

**ambush:**
- create: `{type:'ambush', name, center, rangePxLocal, triggerOnEmpireIds, hidden}`
- runtime: vessel z patrol/escort order na tym POI jest w `hidden` state (emits `rumor` quality intel do obcych, nie `contact`); gdy wroga obserwacja przekroczy detection range → ujawnij
- update: standard
- delete: standard

**M2 scope stubbing:** picket/rally/ambush mają schema + validation, ale
runtime behavior reimplementowany jako **stuby** (no-op). Tylko waypoint
(+ goToPOI order) i patrol (runtime) w pełnej implementacji. Picket/rally/ambush
runtime → M3.

### 9.2. POI UI w M2

**Decyzja §2.13 Alt-A**: zero UI. Tylko devtools:
- `KOSMOS.debug.createPOI(spec)` → `{ok, poiId}`
- `KOSMOS.debug.listPOIs(filter?)` → poi[]
- `KOSMOS.debug.deletePOI(poiId)` → bool
- `KOSMOS.debug.issueGoToPOI(vesselId, poiId)` → wrapper nad MOS.issueOrder

Rendering POI na mapie 3D: sprite z kolorem per-type (blue waypoint, green
patrol, red picket, yellow rally, purple ambush), tooltip na hover. Minimalny.

### 9.3. IntelSystem.vessels — sub-domain

`IntelSystem` rozszerzony:

```js
// nowe metody (publiczne API):
getVesselContact(vesselId) → { quality, lastSeenYear, ... } | null
advanceVesselContact(vesselId, quality, reason) → bool
degradeVesselContact(vesselId, toQuality, reason) → bool  // internal + test
```

**Transitions:**
- proximity enter (w zasięgu detection) → gdy quality < 'contact', advance to 'contact'
- proximity exit → set `positionKnown = false`, ale quality pozostaje
- timer `_tickVesselDegradation`: jeśli `gameYear - lastSeenYear > TIMEOUT_YEARS`,
  degrade: detailed→contact→rumor→remove entry

**Per-tick degradation** (co 1 civYear):
```js
_tickVesselDegradation(yearsPassed) {
  const vessels = gameState.get('intel.vessels') ?? {};
  const now = this._year();
  const updates = {};
  for (const [vId, rec] of Object.entries(vessels)) {
    if (rec.positionKnown) continue;  // w zasięgu, nie degraduje
    const age = now - (rec.lastSeenYear ?? 0);
    if (age < TIMEOUT_YEARS_FIRST) continue;  // 5 civYears = contact→rumor
    if (rec.quality === 'detailed' && age >= TIMEOUT_YEARS_FIRST)
      updates[vId] = { ...rec, quality: 'contact' };
    else if (rec.quality === 'contact' && age >= TIMEOUT_YEARS_SECOND)
      updates[vId] = { ...rec, quality: 'rumor' };
    else if (rec.quality === 'rumor' && age >= TIMEOUT_YEARS_THIRD)
      updates[vId] = null;  // remove
  }
  // apply updates via gameState.set
  for (const [vId, rec] of Object.entries(updates)) {
    if (rec === null) {
      const copy = { ...vessels };
      delete copy[vId];
      gameState.set('intel.vessels', copy, 'vessel_contact_lost');
    } else {
      gameState.set(`intel.vessels.${vId}`, rec, 'vessel_contact_degraded');
    }
    EventBus.emit('intel:vesselContactChanged', { vesselId: vId, oldQuality: vessels[vId].quality, newQuality: rec?.quality ?? 'unknown', reason: 'timeout' });
  }
}
```

**Stałe:**
```js
const TIMEOUT_YEARS_FIRST  = 5;   // detailed→contact
const TIMEOUT_YEARS_SECOND = 10;  // contact→rumor
const TIMEOUT_YEARS_THIRD  = 20;  // rumor→remove
```

### 9.4. Quality → obs quality dla prediction cone

`PredictionConeMath.qualityToAngleMultiplier(quality)`:
- `detailed` → 0.2 (cone wąski, ~12°)
- `contact` → 0.6 (cone średni, ~36°)
- `rumor` → 1.5 (cone szeroki, ~90°)
- `unknown` → 3.0 (kompletna niepewność, cone prawie 180° — prediction irrelevant)

---

## 10. Prediction cone — szczegóły

### 10.1. Math formula

```
function computeCone(pursuerPos, targetPos, targetVelocity, pursuerSpeedAU, obsQuality) {
  const dx = targetPos.x - pursuerPos.x;
  const dy = targetPos.y - pursuerPos.y;
  const distPx = Math.hypot(dx, dy);
  const distAU = distPx / AU_TO_PX;

  // Intercept time: rozwiązanie kwadratowe (analog do MOS._computeInterceptPoint)
  // Uproszczenie: użyj liniowej aproksymacji dla cone range.
  const timeToIntercept = distAU / Math.max(0.01, pursuerSpeedAU);  // lat

  // Base angle — szerokość zależy od obsQuality i prędkości targetu
  const BASE_ANGLE_RAD = 0.1;  // ~5.7°
  const velMagnitude = Math.hypot(targetVelocity?.vx ?? 0, targetVelocity?.vy ?? 0);
  const velocityFactor = 1 + velMagnitude * timeToIntercept;  // więcej niepewności gdy szybki target
  const qualityMult = qualityToAngleMultiplier(obsQuality);

  const angleWidth = BASE_ANGLE_RAD * velocityFactor * qualityMult;

  return {
    originX: pursuerPos.x,
    originY: pursuerPos.y,
    dirX: dx / distPx,
    dirY: dy / distPx,
    angleWidth,
    rangeAU: distAU,
    confidence: 1 / (1 + qualityMult),
    updatedYear: window.KOSMOS?.timeSystem?.gameTime ?? 0,
  };
}
```

### 10.2. Integration z MOS._tickInterceptOrder

```js
_tickInterceptOrder(vessel, order, dPhysicsYear, gameYear) {
  const target = this._resolveTarget(order.targetEntityId);
  if (!target || target.isWreck) {
    this._blockAndCancel(vessel, order, 'target_lost');
    return;
  }

  const ip = this._computeInterceptPoint(vessel, target);
  order.interceptPoint = ip;
  order.lastTargetPos = { x: target.x ?? target.position?.x ?? 0, y: target.y ?? target.position?.y ?? 0 };

  // M2: update prediction cone
  if (FEATURES.predictionCone) {
    const intelSys = window.KOSMOS?.intelSystem;
    const contact = intelSys?.getVesselContact(target.id);
    const obsQuality = contact?.quality ?? 'rumor';
    order.predictionCone = PredictionConeMath.computeCone(
      vessel.position,
      { x: order.lastTargetPos.x, y: order.lastTargetPos.y },
      target.velocity,
      vessel.speedAU ?? 1.0,
      obsQuality
    );
  }

  this._moveTowardsAndMaybeComplete(vessel, order, ip.x, ip.y, dPhysicsYear, gameYear, target);
}
```

### 10.3. Rendering

**Decision:** Three.js mesh (nie Canvas 2D overlay) — spójne z orbit lines
(`TubeGeometry` precedent w ThreeRenderer).

```js
// src/renderer/ThreeRenderer.js — rozszerzenie
_syncPredictionCones() {
  if (!FEATURES.predictionCone) return;

  const vMgr = window.KOSMOS?.vesselManager;
  if (!vMgr) return;

  // Per vessel z aktywnym intercept order
  for (const v of vMgr._vessels.values()) {
    const cone = v.movementOrder?.predictionCone;
    if (!cone || v.movementOrder?.type !== 'intercept') {
      this._removePredictionConeMesh(v.id);
      continue;
    }
    this._updatePredictionConeMesh(v.id, cone);
  }
}

_updatePredictionConeMesh(vesselId, cone) {
  let mesh = this._predictionConeMeshes.get(vesselId);
  if (!mesh) {
    const geometry = new THREE.ConeGeometry(1, 1, 16, 1, true);  // open cone
    const material = new THREE.MeshBasicMaterial({
      color: 0x8a5cff, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
    });
    mesh = new THREE.Mesh(geometry, material);
    this._scene.add(mesh);
    this._predictionConeMeshes.set(vesselId, mesh);
  }
  // Reuse mesh — update transform
  const halfAngle = cone.angleWidth;
  const halfWidth = Math.sin(halfAngle) * cone.rangeAU * AU_TO_PX;
  mesh.scale.set(halfWidth, cone.rangeAU * AU_TO_PX, halfWidth);
  mesh.position.set(cone.originX / 10, 0, cone.originY / 10);  // WORLD_SCALE
  const angle = Math.atan2(cone.dirY, cone.dirX);
  mesh.rotation.z = angle - Math.PI / 2;
}
```

**Koszt:** zob. §6.6 — reuse mesh, ~0.05 ms per cone.

### 10.4. UI visibility

Cone widoczny zawsze gdy aktywny intercept order (§2.11 Alt-A). Opacity 25%.
Gracz może ukryć przez toggle w devtools (`KOSMOS.debug.togglePredictionCones()`).

---

## 11. Future work hooks (M3+)

| Element | M3 plan |
|---|---|
| POI UI | Right-click menu na mapie → "Utwórz punkt orientacyjny" modal z wyborem typu; panel listy POI; edit modal |
| Fuel reforma | Unifikacja fuel + endurance → jeden "operational budget" system; nowy model zużycia zależny od commodity type |
| 3D wrak animacja | Slow rotation wraków deep-space; debris field effect |
| Diplomacy integration dla retreat | Ally treaties, retreat do allied empire planets |
| Full fleet reconciliation | Bidirectional: materializacja ↔ abstract; retreat zmaterializowanej floty dematerializuje ją i odtwarza abstract strength |
| Spatial hash dla ProximitySystem | Uniform grid 8×8 AU przy >150 vesseli |
| Cinematic vessel↔vessel | Dedicated `BattleView3D` mode dla deep-space (kamera na punkcie spotkania); Obecnie używa generic cinematic |
| POI picket/rally/ambush runtime | Pełna implementacja behavior dla 3 typów (M2 stub-only) |
| Empire↔empire combat | VesselCombatSystem obsługuje 3-way+ team-up po wprowadzeniu empire hostility matrix |
| Prediction cone hover | Cone tylko na hover targetu dla mniejszej wizualnej chaos |
| Escort multi-target | Order escort z grupą vesseli |
| Contact state z obserwatorium | Obserwatorium w zasięgu: utrzymuje contact długotrwale bez degradacji |

---

## 12. Plan commitów

15 atomowych commitów. Każdy testowalny: gra się ładuje, save/load działa.
Feature flagi pozwalają na sekwencyjne aktywowanie.

| # | Commit | Zakres | Test |
|---|---|---|---|
| 1 | Schema + migration + 6 FEATURES | GameConfig.js +6 flagów, SaveMigration v65→v66, Vessel default fields, GameState.pois/intel.vessels defaults | Load v65 save → migrate → assert v66, nowe pola default |
| 2 | ProximitySystem scaffold | Nowy plik, instance w GameScene za flagą, tick hook no-op logika | Flag on → class instanced, zero errors |
| 3 | ProximitySystem detection logic | Hysteresis, budget, events `proximityEnter/Exit` | Debug: manual proximity check, grep log for events |
| 4 | VesselCombatSystem + BattleLocation util | Event consumer, team-up, deep-space resolveBattle | Spawn 2 enemy vessels w 0.15 AU → automat combat |
| 5 | Deep-space wreck handling | `_turnIntoWreck` extension, wreckLocation field, ThreeRenderer sprite | Manual wreck → pozycja stabilna w save/load |
| 6 | Unified aggregator | WarSystem._fleetArrived skip gdy materialized | Test: materialized fleet arrives → no double-battle |
| 7 | AutoRetreatSystem | Event listener battle:resolved, findNearest, issueOrder | Force retreat → vessel leci do home |
| 8 | Endurance drain multiplier | VesselManager._tickEndurance cheks movementOrder.type | Pursue → drain 3-4× szybszy |
| 9 | IntelSystem.vessels sub-domain | advanceVesselContact, timer degradation, subscriptions | Proximity → contact; timeout → degrade |
| 10 | Prediction cone math | PredictionConeMath util, movementOrder.predictionCone field, MOS integration | Intercept → cone populated |
| 11 | Prediction cone rendering | ThreeRenderer mesh, reuse via scale | Visual test — widoczny cone |
| 12 | POIRegistry core | gameState.pois, create/update/delete/list, POITypes enum | devtools createPOI + listPOIs |
| 13 | MOS goToPOI + validator | _issueGoToPOI, MovementOrderTypes rozszerzenie, poi:deleted handler | issueOrder goToPOI → vessel leci do POI |
| 14 | POI patrol + escort runtime | _tickPatrolOrder, _tickEscortOrder, waypoint progression | Patrol → vessel krąży |
| 15 | Devtools + cleanup | 6 debug enable/disable, dokumentacja w CLAUDE.md, memory/milestone-2.md | Playtest full M2 stack |

**Dependencies:** commit #4 wymaga #3; #7 wymaga #4 i #5; #13 wymaga #12; #14 wymaga #13.

Pozostałe można w dowolnej kolejności (1-2-3 fundament; 6/8/9/10 niezależne od głównego
combat flow; 11 po 10).

---

## 13. Ryzyka i unknowns

| # | Ryzyko | Severity | Mitigation |
|---|---|---|---|
| R1 | **Scope creep** — 8 elementów w jednym M2 to 2.5× M1. Design doc już 700+ linii. | **HIGH** | Podział M2a/M2b w rezerwie (commity 1-8 vs 9-15). Monitor po commit #8 — jeśli burn rate OK, kontynuuj; jeśli nie, split. |
| R2 | **Performance przy 150+ vesseli** — O(n²) może dać 20ms+ ticki | MEDIUM | MAX_PAIRS_PER_TICK budget, spatial hash upgrade plan w M3 |
| R3 | **Auto-retreat loops** — vessel retreatuje do planety, po drodze trafia w nową proximity, ginie lub retreatuje znowu | MEDIUM | Cooldown `ENGAGEMENT_COOLDOWN_YEARS=2` w VesselCombatSystem |
| R4 | **POI cancellation przy delete** — dangling orders | MEDIUM | poi:deleted → MOS iteracja _byVessel → _blockAndCancel; test w commit #12 |
| R5 | **Deep-space wraki znikają z save/load** — gdy ThreeRenderer nie wie jak ich renderować bez dockedAt | LOW | wreckLocation field + ThreeRenderer.syncVesselPositions sprawdza wreckLocation przed position |
| R6 | **Contact state degradation balance** — TIMEOUT_YEARS za krótkie/długie | MEDIUM | Konfigurowalne w GameConfig, tuning w playtest |
| R7 | **3-way combat team-up UX confusion** | MEDIUM | M2 ogranicza do player↔empire; empire↔empire → M3 |
| R8 | **Prediction cone rendering conflict** — przesłania UI/inne warstwy | LOW | Opacity 25%, toggle off w devtools |
| R9 | **Save v66 niekompatybilne z v65** | LOW | Standard — SaveMigration backup pattern |
| R10 | **VesselCombatSystem odpalony przed MOS._onVesselWrecked** — race condition targetu w pursue | LOW | Kolejność tick: Proximity → Combat (sync) → vessel:wrecked (sync) → MOS cleanup, potem MOS._tick. Sync events eliminuje race. |
| R11 | **Unified aggregator skip a `spawnEnemyFleet` debug** — flota nigdy nie jest materialized (bo spawnEnemyFleet nie używa materializera), więc _fleetArrived nadal triggeruje na abstract. Dla materialized path dev must use `enableFleetMaterialization`. | LOW | Dokumentacja w debug help |
| R12 | **Endurance drain multiplier a fuel balance** — pursue kosztuje drastycznie więcej, może frustrować gracza | MEDIUM | Domyślny ×3 (nie 4); playtest tuning |
| R13 | **Prediction cone stale after order cancelled** — mesh pozostaje | LOW | `_syncPredictionCones` sprawdza `movementOrder?.type === 'intercept' && status === 'active'` |

### 13.1. Scope alert (R1 deep-dive)

M2 design doc osiąga 700+ linii. Implementacja ~15 commitów × średnio 3-5 dni
Claude Code = **10-15 dni total** (plus buffer 2 dni na playtest bugi = 12-17 dni).

**Jeśli user chce szybciej:** rekomendowany podział:

**M2a (Combat Core)** — commits 1-8, ~5-7 dni:
- Scaffolding + migration
- ProximitySystem + VesselCombatSystem
- Deep-space wraki
- Unified aggregator
- AutoRetreatSystem
- Endurance drain multiplier

Playtest → ship M2a jako samodzielny milestone z save v66.

**M2b (Intelligence + POI)** — commits 9-15, ~5-7 dni:
- IntelSystem.vessels
- Prediction cone math + rendering
- POIRegistry + goToPOI/patrol/escort
- Devtools

Uruchamiany z save v66 lub v67 (bump przy M2b gdyby potrzebny).

**Rekomendacja:** **podziel**. Design doc jest duży, ale jego **implementacja**
jako jeden milestone ma wysokie ryzyko (R1). M2a-first daje szybsze wartościowe
iteracje i playtest-driven tuning przed dodawaniem intel layer.

Decyzja pozostawiona userowi (patrz meta-output pytania).

---

**Koniec design doc M2.**

Autor: Claude Opus 4.7 (design only, brak implementacji w tej sesji).
Data: 2026-04-23. Save target: v66. Estimated effort: 10-17 dni Claude Code
(z rekomendowanym podziałem na M2a+M2b).
