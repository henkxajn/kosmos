# Milestone 2b — Intelligence + POI

**Status:** design approved (split from M2 master)
**Save version target:** v66 → v67
**Depends on:** **M2a Combat Core** (save v66, tag `m2a-complete`)
**Related:** [`milestone-2-combat-intelligence.md`](./milestone-2-combat-intelligence.md) (master), [`milestone-2a-combat-core.md`](./milestone-2a-combat-core.md)

---

## Scope

M2b dostarcza trzy warstwy "quality of life" nad M2a combat core:

1. **IntelSystem.vessels** — per-vessel observation quality (rumor/contact/detailed)
   + timer degradation (contact tracnie stopniowo gdy vessel znika z sensorów).
2. **Prediction cone** — math + rendering stożka niepewności dla intercept ordera;
   szerokość zależna od obs quality i volatility targetu.
3. **POI Registry** — nazwane punkty: 5 typów (waypoint/patrol/picket/rally/ambush).
   Nowe order types: `goToPOI`, `patrol` (M1 stub → runtime), `escort`
   (M1 stub → runtime). Picket/rally/ambush runtime → **stub-only w M2b**, pełna
   implementacja → M3.

M2b zakłada M2a działa w trybie produkcyjnym — VesselCombatSystem emituje
`vessel:proximityEnter`, `battle:resolved` z `location.point` (deep-space).

---

## §1. Weryfikacja kontekstu

M2a merged do main, save v66, feature flagi M2a przetestowane. Brak odchyleń od
master doc §1.

Kluczowe zewnętrzne hooki dla M2b:
- `vessel:proximityEnter` — emitowany przez ProximitySystem (M2a §7.2).
  M2b IntelSystem subskrybuje → advance contact state.
- `MovementOrderSystem._tickInterceptOrder` (`:414-428`) — M2b dokłada
  prediction cone update w tym tick.
- `MovementOrderTypes.js` — M2b rozszerza enum o `goToPOI`.
- `vessel.movementOrder.patrolRoute` — pole już istnieje (M1 stub), M2b dodaje
  runtime `_tickPatrolOrder`.

---

## §2. Schema danych

### 2.1. `gameState.intel.vessels` (nowa sub-domena)

Rozszerzenie istniejącego `IntelSystem` (decyzja §2.9 master — wariant B).

```js
gameState.intel.vessels = {
  [vesselId]: {
    quality:          'rumor' | 'contact' | 'detailed',
    firstSeenYear:    number,
    lastSeenYear:     number,
    positionKnown:    bool,           // true gdy w zasięgu PROXIMITY_DETECTION_AU
    positionLastKnown: { x, y },      // stale jeśli positionKnown=false
    strengthEstimate: number | null,  // tylko w rumor (±50%); null gdy contact+
    hullKnown:        bool,           // czy znamy hullId (detailed tylko)
    modulesKnown:     bool,           // czy znamy listę modułów (detailed tylko)
  },
};
```

Mutacje tylko przez `IntelSystem.advanceVesselContact(vesselId, quality, reason)` /
`degradeVesselContact(...)`.

### 2.2. `gameState.pois` (nowa domena)

```js
gameState.pois = {
  [poiId]: {
    id:             string,        // 'poi_<nextId>'
    type:           'waypoint' | 'patrol' | 'picket' | 'rally' | 'ambush',
    name:           string,
    ownerEmpireId:  string | 'player',
    createdYear:    number,

    // Per-type (discriminated union po `type`):

    // waypoint:
    point:          { x, y },

    // patrol:
    waypoints:      [{x,y}, ...],   // min 2
    loopMode:       'loop' | 'ping_pong',

    // picket: (STUB w M2b)
    center:         { x, y },
    rangePxLocal:   number,
    alertOnEmpireIds: string[] | null,

    // rally: (STUB w M2b)
    center:         { x, y },
    waitForCount:   number,
    memberVesselIds: string[],

    // ambush: (STUB w M2b)
    center:         { x, y },
    rangePxLocal:   number,
    triggerOnEmpireIds: string[] | null,
    hidden:         bool,
  },
};
```

Limit: soft cap 100 POI (warning w konsoli); brak hard limit w M2b.

### 2.3. `vessel.movementOrder` — rozszerzenia M2b

```js
vessel.movementOrder = {
  // ... M1 + M2a pola (type, targetEntityId, targetPoint, patrolRoute, ...)

  poiId:          string | null,   // dla type='goToPOI', type='patrol' gdy POI-based
  predictionCone: null | {
    originX, originY,
    dirX, dirY,                    // unit vector
    angleWidth,                    // radians (półkąt stożka)
    rangeAU,                       // długość stożka (dist do IP)
    confidence,                    // 0..1 (im mniejsza niepewność, tym wyższa)
    updatedYear,
  },
  // patrolRoute już istnieje w M1 stub
  patrolWaypointIndex: number,     // current waypoint (0-indexed)
  patrolDirection: 1 | -1,         // dla ping_pong mode
  escorteeId:     string | null,   // dla type='escort'
};
```

### 2.4. `MovementOrderTypes` rozszerzenie

`src/data/MovementOrderTypes.js`:

```js
export const ORDER_TYPES = Object.freeze({
  moveToPoint: 'moveToPoint',
  pursue:      'pursue',
  intercept:   'intercept',
  patrol:      'patrol',     // M2b: runtime (M1 stub)
  escort:      'escort',     // M2b: runtime (M1 stub)
  goToPOI:     'goToPOI',    // M2b NEW
});

const TYPES_WITH_POI_TARGET = new Set([ORDER_TYPES.goToPOI]);

// validateOrder — dodaj walidację goToPOI (wymaga poiId) i escort (targetEntityId = vesselId)
```

### 2.5. Feature flags (3 nowe dla M2b)

```js
FEATURES: {
  // ... M1 + M2a (5 flagów)
  // M2b NEW
  intelContactState: false,   // IntelSystem.vessels sub-domain + degradation
  predictionCone:    false,   // prediction cone math + rendering
  poiSystem:         false,   // POIRegistry + goToPOI/patrol/escort runtime
}
```

### 2.6. Migracja v66 → v67

```js
export const CURRENT_VERSION = 67;
// w MIGRATIONS:
66: _migrateV66toV67,

function _migrateV66toV67(data) {
  const gs = data.gameState ?? {};

  // (a) POI registry init
  if (!gs.pois) gs.pois = {};

  // (b) IntelSystem.vessels sub-domain init
  if (!gs.intel) gs.intel = {};
  if (!gs.intel.vessels) gs.intel.vessels = {};

  // (c) vessel.movementOrder extensions
  const c4x = data.civ4x ?? data.c4x;
  const vessels = c4x?.vesselManager?.vessels ?? [];
  for (const v of vessels) {
    if (!v.movementOrder) continue;
    if (v.movementOrder.poiId === undefined) v.movementOrder.poiId = null;
    if (v.movementOrder.predictionCone === undefined) v.movementOrder.predictionCone = null;
    if (v.movementOrder.patrolWaypointIndex === undefined) v.movementOrder.patrolWaypointIndex = 0;
    if (v.movementOrder.patrolDirection === undefined) v.movementOrder.patrolDirection = 1;
    if (v.movementOrder.escorteeId === undefined) v.movementOrder.escorteeId = null;
  }

  data.version = 67;
  return data;
}
```

---

## §3. EventBus contract

### 3.1. IntelSystem (MOD — nowe vessel events)

| Event | Payload | Subscribers |
|---|---|---|
| `intel:vesselContactChanged` | `{ vesselId, oldQuality, newQuality, reason }` | UIManager (FleetOverlay color/label update) |
| `intel:vesselContactLost` | `{ vesselId, lastKnownPosition, reason }` | ThreeRenderer (sprite dim / question mark overlay) |

### 3.2. POIRegistry (NEW)

| Event | Payload | Subscribers |
|---|---|---|
| `poi:created` | `{ poi }` | UIManager, MovementOrderSystem |
| `poi:updated` | `{ poiId, poi }` | UIManager, MovementOrderSystem |
| `poi:deleted` | `{ poiId }` | MovementOrderSystem (cancel orders z tym poiId), UIManager |
| `poi:vesselReached` | `{ vesselId, poiId }` | POIRegistry (rally tracker — stub), IntelSystem |

### 3.3. MovementOrderSystem (MOD — new order types)

| Event | Payload | Subscribers |
|---|---|---|
| `vessel:goToPOIIssued` | `{ vesselId, orderId, poiId }` | UIManager (EventLog) |
| `vessel:patrolStarted` | `{ vesselId, orderId, poiId, waypointIndex }` | UIManager, (M3: ProximitySystem awareness) |
| `vessel:patrolWaypointReached` | `{ vesselId, orderId, waypointIndex }` | UIManager |
| `vessel:escortStarted` | `{ vesselId, orderId, escorteeId }` | UIManager |
| `vessel:escortLost` | `{ vesselId, orderId, reason }` | UIManager |

`reason` ∈ `'escortee_lost'` (target wreck/destroyed) | `'escortee_out_of_range'`.

### 3.4. M2a kontrakty bez zmian

`vessel:proximityEnter/Exit`, `battle:resolved`, `vessel:autoRetreatIssued/Failed`
— identyczne jak w M2a.

---

## §4. Klasy i moduły

### 4.1. NEW

| Plik | Odpowiedzialność |
|---|---|
| `src/systems/POIRegistry.js` | CRUD POI + per-type validation + cancel dangling orders przy delete |
| `src/utils/PredictionConeMath.js` | `computeCone()`, `qualityToAngleMultiplier()` — pure fn |
| `src/data/POITypes.js` | Enum typów POI + per-type schema validator |

### 4.2. MOD

| Plik | Zakres |
|---|---|
| `src/systems/IntelSystem.js` | `getVesselContact`, `advanceVesselContact`, `degradeVesselContact`, `_tickVesselDegradation` (nowa faza w `_passiveTick`), subskrypcja `vessel:proximityEnter/Exit` |
| `src/systems/MovementOrderSystem.js` | `_issueGoToPOI`, `_issuePatrol` (M1 stub → runtime), `_issueEscort` (M1 stub → runtime); `_tickPatrolOrder`, `_tickEscortOrder`; prediction cone updater w `_tickInterceptOrder`; handler `poi:deleted` → cancel orders |
| `src/data/MovementOrderTypes.js` | `goToPOI` w enum; `TYPES_WITH_POI_TARGET`; walidator goToPOI + escort |
| `src/renderer/ThreeRenderer.js` | Prediction cone mesh (`ConeGeometry` reuse + scale/rotation); POI sprites (per-type kolor + tooltip) |
| `src/systems/SaveMigration.js` | `_migrateV66toV67` + bump `CURRENT_VERSION=67` |
| `src/config/GameConfig.js` | 3 nowe FEATURES (intelContactState, predictionCone, poiSystem) |
| `src/scenes/GameScene.js` | 3 lazy init + 3 debug hooks |
| `src/entities/Vessel.js` | movementOrder pola: poiId, predictionCone, patrolWaypointIndex/Direction, escorteeId |

### 4.3. Publiczne API

**POIRegistry:**
```
constructor()
createPOI(spec) → { ok, poiId?, reason? }
updatePOI(poiId, changes) → { ok, reason? }
deletePOI(poiId) → { ok, reason? }
getPOI(poiId) → poi | null
listPOIs(filter?) → poi[]
listByType(type) → poi[]
vesselReachedPOI(vesselId, poiId)  // internal trigger
destroy()
```

**IntelSystem (nowe metody):**
```
getVesselContact(vesselId) → record | null
advanceVesselContact(vesselId, quality, reason) → bool
degradeVesselContact(vesselId, toQuality, reason) → bool
```

**PredictionConeMath (pure):**
```
computeCone(pursuerPos, targetPos, targetVelocity, pursuerSpeedAU, obsQuality)
  → { originX, originY, dirX, dirY, angleWidth, rangeAU, confidence, updatedYear }
qualityToAngleMultiplier(quality) → number
```

---

## §5. Tick loop integration (M2b additions)

```
VesselManager._tick (kolejność jak w M2a)
  + MOS._tickPatrolOrder / _tickEscortOrder / _tickInterceptOrder (cone update)
  dodane w MOS._tick pętli po orderach.

time:tick (1 civYear accumulator)
  → IntelSystem._passiveTick:
     - istniejący "obserwatorium → rumor" (M1)
     - NOWE: _tickVesselDegradation — dla gameState.intel.vessels
             gdzie positionKnown=false i lastSeenYear stary
  → POIRegistry — brak tick'a, event-driven
```

---

## §6. Performance budget M2b

### IntelSystem.vessels degradation
- O(n) per civYear gdzie n = |intel.vessels|. Max ~100 × 10 ns = 1 µs. Znikome.

### Prediction cone
- `computeCone`: 5 mnożeń + trig = <1 µs per vessel z intercept.
- Rendering: Three.js `ConeGeometry` **reused** (nie regenerowany). Per mesh:
  `mesh.scale.set()` + `mesh.rotation.z =` ≈ 0.05 ms. Przy 20 aktywnych intercept:
  ~1 ms per frame.

### POI lookup (goToPOI issue)
- O(1) Map.get.

### _tickPatrolOrder
- O(1) per vessel z active patrol. Przy max 50 aktywnych patroli: 50 µs.

**Suma M2b per tick**: ~1-2 ms (prediction cone dominuje).

---

## §7. IntelSystem — vessel sub-domain

### 7.1. Transitions

| From → To | Trigger |
|---|---|
| `unknown → rumor` | proximity enter w zasięgu detection (0.5 AU), pierwszy raz |
| `rumor → contact` | proximity enter przy `distanceAU < 0.3 AU` (bliżej) LUB away team survey |
| `contact → detailed` | away team / `groundUnit:surveyComplete` na vessel (przyszłość M3) |
| `detailed → contact` | timer: `lastSeenYear` starsze niż TIMEOUT_YEARS_FIRST (5 civYears) |
| `contact → rumor` | timer: TIMEOUT_YEARS_SECOND (10 civYears) |
| `rumor → removed` | timer: TIMEOUT_YEARS_THIRD (20 civYears) |

### 7.2. positionKnown flag

- `true` gdy vessel w zasięgu jakiegokolwiek własnego vessela w proximity AND
  tamten vessel nie jest wreckiem.
- `false` gdy wypadł z zasięgu (`vessel:proximityExit`). Quality pozostaje (nie
  degraduje natychmiast), ale `positionLastKnown` zamraża się.

### 7.3. Subskrypcje EventBus

```js
constructor() {
  // ... istniejące M1 subskrypcje ...
  EventBus.on('vessel:proximityEnter', (e) => this._onVesselProximityEnter(e));
  EventBus.on('vessel:proximityExit',  (e) => this._onVesselProximityExit(e));
  EventBus.on('vessel:wrecked',        (e) => this._onVesselWrecked(e));
}

_onVesselProximityEnter({ vesselAId, vesselBId, distanceAU, sameFaction }) {
  if (sameFaction) return;

  // Określ który vessel "widzi" którego — player side widzi enemy side
  const vA = this._vm.getVessel(vesselAId);
  const vB = this._vm.getVessel(vesselBId);
  const playerIsA = (vA?.ownerEmpireId === 'player' || vA?.owner === 'player');
  const playerIsB = (vB?.ownerEmpireId === 'player' || vB?.owner === 'player');

  if (playerIsA && !playerIsB) this._observeVessel(vB, distanceAU);
  if (playerIsB && !playerIsA) this._observeVessel(vA, distanceAU);
}

_observeVessel(enemyVessel, distanceAU) {
  const rec = this._getOrInitVesselRecord(enemyVessel.id);
  const now = this._year();
  const newQuality = distanceAU < 0.3 ? 'contact' : 'rumor';
  const shouldAdvance = LEVEL_RANK[newQuality] > LEVEL_RANK[rec.quality];

  const updated = {
    ...rec,
    quality:          shouldAdvance ? newQuality : rec.quality,
    lastSeenYear:     now,
    positionKnown:    true,
    positionLastKnown: { x: enemyVessel.position.x, y: enemyVessel.position.y },
    strengthEstimate: shouldAdvance && newQuality === 'rumor'
                      ? this._estimateStrength(enemyVessel)
                      : rec.strengthEstimate,
  };
  gameState.set(`intel.vessels.${enemyVessel.id}`, updated, 'proximity_observation');

  if (shouldAdvance) {
    EventBus.emit('intel:vesselContactChanged', {
      vesselId: enemyVessel.id,
      oldQuality: rec.quality,
      newQuality,
      reason: 'proximity',
    });
  }
}
```

### 7.4. Degradation ticker (w `_passiveTick`)

```js
const TIMEOUT_YEARS_FIRST  = 5;   // detailed → contact
const TIMEOUT_YEARS_SECOND = 10;  // contact → rumor
const TIMEOUT_YEARS_THIRD  = 20;  // rumor → removed

_tickVesselDegradation(yearsPassed) {
  const vessels = gameState.get('intel.vessels') ?? {};
  const now = this._year();

  for (const [vId, rec] of Object.entries(vessels)) {
    if (rec.positionKnown) continue;  // w zasięgu, nie degraduje
    const age = now - (rec.lastSeenYear ?? 0);
    let newQuality = rec.quality;
    let removed = false;

    if (rec.quality === 'detailed' && age >= TIMEOUT_YEARS_FIRST)  newQuality = 'contact';
    else if (rec.quality === 'contact' && age >= TIMEOUT_YEARS_SECOND) newQuality = 'rumor';
    else if (rec.quality === 'rumor' && age >= TIMEOUT_YEARS_THIRD) removed = true;

    if (removed) {
      const copy = { ...vessels };
      delete copy[vId];
      gameState.set('intel.vessels', copy, 'vessel_contact_aged_out');
      EventBus.emit('intel:vesselContactLost', {
        vesselId: vId, lastKnownPosition: rec.positionLastKnown, reason: 'timeout',
      });
    } else if (newQuality !== rec.quality) {
      gameState.set(`intel.vessels.${vId}`, { ...rec, quality: newQuality }, 'vessel_contact_degraded');
      EventBus.emit('intel:vesselContactChanged', {
        vesselId: vId, oldQuality: rec.quality, newQuality, reason: 'timeout',
      });
    }
  }
}
```

---

## §8. Prediction cone — szczegóły

### 8.1. Math

```js
function computeCone(pursuerPos, targetPos, targetVelocity, pursuerSpeedAU, obsQuality) {
  const dx = targetPos.x - pursuerPos.x;
  const dy = targetPos.y - pursuerPos.y;
  const distPx = Math.hypot(dx, dy);
  if (distPx < 1) return null;  // degenerate

  const distAU = distPx / AU_TO_PX;
  const timeToIntercept = distAU / Math.max(0.01, pursuerSpeedAU);

  const BASE_ANGLE_RAD = 0.1;  // ~5.7° dla detailed+static target
  const velMag = Math.hypot(targetVelocity?.vx ?? 0, targetVelocity?.vy ?? 0);
  const velocityFactor = 1 + velMag * timeToIntercept;
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

function qualityToAngleMultiplier(quality) {
  switch (quality) {
    case 'detailed': return 0.2;   // ~1.1° z BASE
    case 'contact':  return 0.6;   // ~3.4°
    case 'rumor':    return 1.5;   // ~8.6°
    default:         return 3.0;   // unknown — prawie 180°, prediction irrelevant
  }
}
```

### 8.2. MOS integration

`MovementOrderSystem._tickInterceptOrder` — update prediction cone co tick:

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

  // M2b: prediction cone update
  if (window.KOSMOS?.gameConfig?.FEATURES?.predictionCone) {
    const contact = window.KOSMOS?.intelSystem?.getVesselContact?.(target.id);
    const obsQuality = contact?.quality ?? (target.ownerEmpireId ? 'rumor' : 'detailed');
    //                 ^ dla planet/moonów bez IntelSystem entry: detailed (always known)
    order.predictionCone = PredictionConeMath.computeCone(
      vessel.position,
      order.lastTargetPos,
      target.velocity,
      vessel.speedAU ?? 1.0,
      obsQuality
    );
  }

  this._moveTowardsAndMaybeComplete(vessel, order, ip.x, ip.y, dPhysicsYear, gameYear, target);
}
```

### 8.3. Rendering (ThreeRenderer)

Mesh reuse pattern:

```js
// src/renderer/ThreeRenderer.js
_predictionConeMeshes = new Map();  // vesselId → mesh

_syncPredictionCones() {
  if (!window.KOSMOS?.gameConfig?.FEATURES?.predictionCone) return;
  const vMgr = window.KOSMOS?.vesselManager;
  if (!vMgr) return;

  const activeIds = new Set();
  for (const v of vMgr._vessels.values()) {
    const cone = v.movementOrder?.predictionCone;
    if (!cone || v.movementOrder?.type !== 'intercept' || v.movementOrder?.status !== 'active') continue;
    activeIds.add(v.id);
    this._updatePredictionConeMesh(v.id, cone);
  }
  // Cleanup dla cones których nie powinno już być
  for (const id of [...this._predictionConeMeshes.keys()]) {
    if (!activeIds.has(id)) this._removePredictionConeMesh(id);
  }
}

_updatePredictionConeMesh(vesselId, cone) {
  let mesh = this._predictionConeMeshes.get(vesselId);
  if (!mesh) {
    const geo = new THREE.ConeGeometry(1, 1, 16, 1, true);  // open base
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8a5cff, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
    });
    mesh = new THREE.Mesh(geo, mat);
    this._scene.add(mesh);
    this._predictionConeMeshes.set(vesselId, mesh);
  }
  const halfWidth = Math.tan(cone.angleWidth) * cone.rangeAU * AU_TO_PX;
  mesh.scale.set(halfWidth, cone.rangeAU * AU_TO_PX, halfWidth);
  mesh.position.set(cone.originX / 10, 0, cone.originY / 10);  // WORLD_SCALE
  mesh.rotation.z = Math.atan2(cone.dirY, cone.dirX) - Math.PI / 2;
}
```

Wywołanie `_syncPredictionCones` z `physics:updated` handler (per frame).

---

## §9. POI Registry — szczegóły

### 9.1. Lifecycle per type

**waypoint** (prosty punkt):
- create: `{type:'waypoint', name, point: {x,y}}` → validate point → persist
- runtime: `MovementOrderSystem._issueGoToPOI` resolve point → delegate do
  `_issueMoveToPoint` (reuse M1 logic)
- vesselReachedPOI → `poi:vesselReached` event (dla innych systemów, POI samo nie reaguje)

**patrol** (obchód):
- create: `{type:'patrol', name, waypoints: [...], loopMode}` → validate min 2 waypoints
- runtime: `MovementOrderSystem._tickPatrolOrder` — gdy vessel blisko current
  waypoint (<0.15 AU), advance index. Loop/ping_pong semantyka.
- update: modyfikacja waypoints → `poi:updated` → aktywne patrols teleportują do
  nowego closest waypoint (nie reset)

**picket** (obserwacyjny — STUB M2b):
- create: `{type:'picket', name, center, rangePxLocal, alertOnEmpireIds}`
- runtime M3: vessel z patrol-on-picket order stoi w center, nasłuchuje
  proximity events w range → emit `poi:pickeTriggered`
- M2b: tylko schema + validation, brak runtime

**rally** (zbiórka — STUB M2b):
- create: `{type:'rally', name, center, waitForCount, memberVesselIds: []}`
- runtime M3: goToPOI na rally point → `vesselReachedPOI` → add do memberVesselIds
  → gdy `length >= waitForCount` → emit `poi:rallyComplete`
- M2b: schema tylko

**ambush** (zasadzka — STUB M2b):
- create: `{type:'ambush', name, center, rangePxLocal, triggerOnEmpireIds, hidden}`
- runtime M3: vessel w ambush mode ma `hidden=true` → IntelSystem emit tylko
  `rumor` quality dla obcych; gdy enemy w range → reveal
- M2b: schema tylko

### 9.2. POI deletion + dangling orders

`poi:deleted` event → `MovementOrderSystem` handler:

```js
constructor() {
  // ... M1 subskrypcje ...
  EventBus.on('poi:deleted', ({ poiId }) => this._onPOIDeleted(poiId));
}

_onPOIDeleted(poiId) {
  for (const [vId, order] of [...this._byVessel.entries()]) {
    if (order.poiId === poiId && order.status === 'active') {
      const vessel = this._vm.getVessel(vId);
      if (vessel) this._blockAndCancel(vessel, order, 'poi_deleted');
    }
  }
}
```

### 9.3. UI w M2b (zero — tylko devtools)

```js
KOSMOS.debug.createPOI(spec)       → { ok, poiId }
KOSMOS.debug.listPOIs(filter?)     → poi[]
KOSMOS.debug.deletePOI(poiId)      → bool
KOSMOS.debug.issueGoToPOI(vId, poiId) → wrapper nad MOS.issueOrder
KOSMOS.debug.issuePatrol(vId, poiId)  → wrapper
KOSMOS.debug.issueEscort(vId, escorteeId) → wrapper
```

Rendering POI na mapie 3D: sprite per-type (blue waypoint, green patrol, red
picket, yellow rally, purple ambush) + tooltip na hover. Minimalny UI.

Pełny right-click menu + panel listy → M3.

---

## §10. MOS order type extensions

### 10.1. `_issueGoToPOI`

```js
_issueGoToPOI(vessel, spec) {
  const poi = window.KOSMOS?.poiRegistry?.getPOI(spec.poiId);
  if (!poi) return { ok: false, reason: 'poi_not_found' };

  // Resolve target point (per type)
  let targetPoint = null;
  if (poi.type === 'waypoint')         targetPoint = poi.point;
  else if (poi.type === 'patrol')      targetPoint = poi.waypoints?.[0];
  else if (poi.type === 'rally')       targetPoint = poi.center;
  else if (poi.type === 'picket')      targetPoint = poi.center;
  else if (poi.type === 'ambush')      targetPoint = poi.center;
  if (!targetPoint) return { ok: false, reason: 'poi_no_target_point' };

  // Delegate do _issueMoveToPoint z poiId ustawionym
  const result = this._issueMoveToPoint(vessel, {
    type: 'moveToPoint',
    targetPoint,
    issuedBy: spec.issuedBy ?? 'player',
  });
  if (result.ok) {
    // Nadpisz order.type i dodaj poiId
    const order = vessel.movementOrder;
    order.type = ORDER_TYPES.goToPOI;
    order.poiId = spec.poiId;
    EventBus.emit('vessel:goToPOIIssued', {
      vesselId: vessel.id, orderId: order.id, poiId: spec.poiId,
    });
  }
  return result;
}
```

### 10.2. `_issuePatrol` (M1 stub → runtime)

```js
_issuePatrol(vessel, spec) {
  // spec: { type:'patrol', patrolRoute?: [{x,y},...] | poiId: string, issuedBy }
  let waypoints = spec.patrolRoute;
  let poiId = null;
  if (spec.poiId) {
    const poi = window.KOSMOS?.poiRegistry?.getPOI(spec.poiId);
    if (poi?.type !== 'patrol') return { ok: false, reason: 'poi_not_patrol_type' };
    waypoints = poi.waypoints;
    poiId = spec.poiId;
  }
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { ok: false, reason: 'patrol_needs_2_points' };
  }

  const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
  const orderId = `mo_${_nextOrderId++}`;
  const order = {
    id: orderId, type: ORDER_TYPES.patrol,
    issuedYear: gameYear, issuedBy: spec.issuedBy ?? 'player',
    targetEntityId: null, targetPoint: null,
    patrolRoute: waypoints.map(w => ({ ...w })),
    poiId,
    patrolWaypointIndex: 0,
    patrolDirection: 1,
    lastTargetPos: null, interceptPoint: null,
    status: 'active', completedYear: null, blockReason: null,
    predictionCone: null, retreatFromBattleId: null,
    escorteeId: null,
  };

  this._suspendMissionIfAny(vessel);
  vessel.movementOrder = order;
  this._byVessel.set(vessel.id, order);

  EventBus.emit('vessel:orderIssued', { vesselId: vessel.id, order });
  EventBus.emit('vessel:patrolStarted', {
    vesselId: vessel.id, orderId, poiId, waypointIndex: 0,
  });
  return { ok: true, orderId };
}

_tickPatrolOrder(vessel, order, dPhysicsYear, gameYear) {
  const wp = order.patrolRoute[order.patrolWaypointIndex];
  if (!wp) { this._blockAndCancel(vessel, order, 'patrol_invalid_waypoint'); return; }

  const dx = wp.x - vessel.position.x;
  const dy = wp.y - vessel.position.y;
  const distPx = Math.hypot(dx, dy);
  const WAYPOINT_REACHED_PX = THREAT_RADIUS_PX;  // 16.5 px = 0.15 AU

  if (distPx <= WAYPOINT_REACHED_PX) {
    // Reached — advance
    EventBus.emit('vessel:patrolWaypointReached', {
      vesselId: vessel.id, orderId: order.id, waypointIndex: order.patrolWaypointIndex,
    });
    this._advancePatrolIndex(order);
    return;
  }

  // Move towards current waypoint (analogicznie do _moveTowardsAndMaybeComplete, bez completion)
  const speedPxPerYear = (vessel.speedAU ?? 1.0) * AU_TO_PX;
  const stepPx = Math.min(distPx, speedPxPerYear * Math.max(0, dPhysicsYear));
  vessel.position.x += (dx / distPx) * stepPx;
  vessel.position.y += (dy / distPx) * stepPx;
  if (vessel.velocity) {
    const speedCiv = (vessel.speedAU ?? 1.0) / CIV_TIME_SCALE;
    vessel.velocity.vx = (dx / distPx) * speedCiv;
    vessel.velocity.vy = (dy / distPx) * speedCiv;
    vessel.velocity.updatedYear = gameYear;
  }
}

_advancePatrolIndex(order) {
  const n = order.patrolRoute.length;
  const poi = order.poiId ? window.KOSMOS?.poiRegistry?.getPOI(order.poiId) : null;
  const loopMode = poi?.loopMode ?? 'loop';

  if (loopMode === 'ping_pong') {
    let next = order.patrolWaypointIndex + order.patrolDirection;
    if (next >= n) { next = n - 2; order.patrolDirection = -1; }
    else if (next < 0) { next = 1; order.patrolDirection = 1; }
    order.patrolWaypointIndex = next;
  } else {
    // loop
    order.patrolWaypointIndex = (order.patrolWaypointIndex + 1) % n;
  }
}
```

### 10.3. `_issueEscort` (M1 stub → runtime)

```js
_issueEscort(vessel, spec) {
  const escortee = this._resolveTarget(spec.targetEntityId);
  if (!escortee) return { ok: false, reason: 'escortee_not_found' };
  if (escortee.isWreck) return { ok: false, reason: 'escortee_is_wreck' };
  if (escortee === vessel) return { ok: false, reason: 'escortee_self' };
  const isVessel = !!this._vm.getVessel?.(spec.targetEntityId);
  if (!isVessel) return { ok: false, reason: 'escortee_not_vessel' };

  const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
  const orderId = `mo_${_nextOrderId++}`;
  const order = {
    id: orderId, type: ORDER_TYPES.escort,
    issuedYear: gameYear, issuedBy: spec.issuedBy ?? 'player',
    targetEntityId: spec.targetEntityId,
    escorteeId: spec.targetEntityId,
    patrolRoute: null, targetPoint: null, poiId: null,
    lastTargetPos: null, interceptPoint: null,
    status: 'active', completedYear: null, blockReason: null,
    predictionCone: null, patrolWaypointIndex: 0, patrolDirection: 1,
    retreatFromBattleId: null,
  };

  this._suspendMissionIfAny(vessel);
  vessel.movementOrder = order;
  this._byVessel.set(vessel.id, order);

  EventBus.emit('vessel:orderIssued', { vesselId: vessel.id, order });
  EventBus.emit('vessel:escortStarted', {
    vesselId: vessel.id, orderId, escorteeId: spec.targetEntityId,
  });
  return { ok: true, orderId };
}

_tickEscortOrder(vessel, order, dPhysicsYear, gameYear) {
  const escortee = this._resolveTarget(order.escorteeId);
  if (!escortee || escortee.isWreck) {
    EventBus.emit('vessel:escortLost', {
      vesselId: vessel.id, orderId: order.id, reason: 'escortee_lost',
    });
    this._blockAndCancel(vessel, order, 'escortee_lost');
    return;
  }

  // Trzymaj się blisko escortee (target offset = 0, tj. dogoń)
  // Analogicznie do _tickPursueOrder, ale bez completion — escort trwa aż do cancel
  const tx = escortee.x ?? escortee.position?.x ?? 0;
  const ty = escortee.y ?? escortee.position?.y ?? 0;
  const ESCORT_DISTANCE_PX = THREAT_RADIUS_PX;  // utrzymuj 0.15 AU

  const dx = tx - vessel.position.x;
  const dy = ty - vessel.position.y;
  const distPx = Math.hypot(dx, dy);

  if (distPx <= ESCORT_DISTANCE_PX) return;  // wystarczająco blisko, stój

  const speedPxPerYear = (vessel.speedAU ?? 1.0) * AU_TO_PX;
  const stepPx = Math.min(distPx - ESCORT_DISTANCE_PX * 0.5, speedPxPerYear * Math.max(0, dPhysicsYear));
  vessel.position.x += (dx / distPx) * stepPx;
  vessel.position.y += (dy / distPx) * stepPx;
  // velocity update analogicznie jak w patrol
}
```

### 10.4. Walidator update

`src/data/MovementOrderTypes.js`:

```js
const TYPES_WITH_POI_TARGET = new Set([ORDER_TYPES.goToPOI]);
const TYPES_WITH_ENTITY_TARGET = new Set([
  ORDER_TYPES.pursue, ORDER_TYPES.intercept, ORDER_TYPES.escort,
]);

export function validateOrder(spec) {
  // ... existing checks ...

  if (TYPES_WITH_POI_TARGET.has(spec.type)) {
    if (!spec.poiId || typeof spec.poiId !== 'string') {
      return { valid: false, reason: 'missing_poi_id' };
    }
  }
  // ... pozostałe bez zmian ...
}
```

---

## §11. Plan commitów M2b (7)

| # | Commit | Zakres | Smoke test |
|---|---|---|---|
| 1 | Schema + migration v66→v67 + 3 FEATURES | GameConfig 3 flagi, SaveMigration `_migrateV66toV67`, Vessel.movementOrder extensions defaults | Load save v66 → assert v67 + pola default |
| 2 | IntelSystem.vessels sub-domain | `gameState.intel.vessels` init, subskrypcje `vessel:proximityEnter/Exit/wrecked`, degradation ticker w `_passiveTick` | Spawn enemy vessel → proximity → `intel:vesselContactChanged`; timer → degrade |
| 3 | Prediction cone math + MOS integration | `PredictionConeMath.computeCone` pure fn, `_tickInterceptOrder` update `order.predictionCone` | Issue intercept → inspect vessel.movementOrder.predictionCone |
| 4 | Prediction cone rendering | ThreeRenderer `_syncPredictionCones` + mesh reuse + `physics:updated` hook | Visual test — cone widoczny, szerokość zmienia się z obs quality |
| 5 | POIRegistry core + POITypes | `gameState.pois` init, CRUD methods, per-type schema validator, dangling orders cleanup | `KOSMOS.debug.createPOI({type:'waypoint', ...})` → listPOIs, delete → cancel orders |
| 6 | MOS goToPOI + patrol runtime | `_issueGoToPOI`, `_tickPatrolOrder`, enum extension, validator update | `issueGoToPOI` vessel → leci do POI; patrol → loopuje waypoints |
| 7 | MOS escort runtime + devtools | `_issueEscort`, `_tickEscortOrder`, devtools debug wrappers (6) + POI sprites w ThreeRenderer | Escort → vessel trzyma się escortee; POI sprites widoczne |

**Dependencies:** #3 → #4; #5 → #6; #6 → #7. Pozostałe niezależne.

Stubs (runtime → M3): picket, rally, ambush behavior. Schema w #5.

---

## §12. Ryzyka

| # | Ryzyko | Severity | Mitigation |
|---|---|---|---|
| R1 | Prediction cone rendering kosztowny | MEDIUM | Mesh reuse (scale/rotation only); max ~20 aktywnych intercept |
| R2 | Contact state degradation balance (za szybkie/wolne timeout) | MEDIUM | TIMEOUT_YEARS konfigurowalne w GameConfig; playtest tuning |
| R3 | POI cancellation race (delete POI w trakcie tick_patrol) | LOW | `poi:deleted` handler sync cancel przed next MOS._tick |
| R4 | Patrol waypoint arrival false positive (przy bardzo szybkim vessel) | LOW | `WAYPOINT_REACHED_PX = THREAT_RADIUS_PX = 16.5 px` bezpieczny |
| R5 | Escort lost przy escortee retreat (escortee dostaje auto-retreat z M2a, escort się gubi) | MEDIUM | Escort cancellation z `reason='escortee_lost'` — UX info |
| R6 | Prediction cone zalewa mapę przy wielu intercepts | LOW | Toggle w devtools (`KOSMOS.debug.togglePredictionCones()`) |
| R7 | `stale predictionCone` po cancel orderu (mesh pozostaje) | LOW | `_syncPredictionCones` sprawdza `status==='active' && type==='intercept'` |
| R8 | POI sprite w ThreeRenderer przesłania inne UI | LOW | Małe sprites (16px), transparent background |
| R9 | IntelSystem `_observeVessel` missed edge case (target vessel == player vessel) | LOW | `sameFaction` check w event payload — nie wywołujemy `_observeVessel` |

---

## §13. Future work (M3+)

| Element | M3 plan |
|---|---|
| POI UI | Right-click menu "Utwórz punkt orientacyjny"; modal z wyborem typu; panel listy POI; edit modal |
| Picket/rally/ambush runtime | Pełna implementacja behavior dla 3 typów |
| Contact state z obserwatorium | Obserwatorium w zasięgu utrzymuje contact długotrwale bez degradacji |
| Prediction cone hover | Tryb "tylko na hover targetu" dla mniej wizualnego chaos |
| Escort multi-target (formation) | Order escort z grupą vesseli |
| IntelSystem.vessels deep-scan (away team) | `groundUnit:surveyComplete` na vessel → detailed contact |
| Empire↔empire intel sharing | Treaties dają partial intel z allied empire's knowledge |
| `detailed` quality reveal hull + modules | UI pokazuje dokładny statek, moduły — info advantage w combat decisions |

---

**Koniec M2b design doc.**
Save target: v67. Estimated effort: 5-7 dni Claude Code + 1-2 dni playtest.
Depends on M2a production-ready.
