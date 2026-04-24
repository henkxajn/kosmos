# Milestone 2a — Combat Core

**Status:** design approved (split from M2 master)
**Save version target:** v65 → v66
**Depends on:** M1 Targeting Foundation (save v65, tag `m1-complete`)
**Related:** [`milestone-2-combat-intelligence.md`](./milestone-2-combat-intelligence.md) (master), [`m2-reconnaissance.md`](./m2-reconnaissance.md)
**Next:** M2b Intelligence + POI → [`milestone-2b-intelligence-poi.md`](./milestone-2b-intelligence-poi.md)

---

## Scope

M2a dostarcza **deep-space vessel↔vessel combat** + materialized fleet
reconciliation + auto-retreat z bitwy + endurance drain multiplier dla pursue.
Zamyka krytyczne luki z `m2-reconnaissance.md`:

- §P4 "Pursue completion never triggers combat" → ProximitySystem + VesselCombatSystem
- §P2/P3 "Materialized fleet double-hit / total wipe" → Unified aggregator (skip _fleetArrived dla `materializationState='full'`)
- §BUG#4 "deep-space drift state" → Auto-retreat eliminuje potrzebę drift dla żywych vesseli

**M2a NIE obejmuje** (→ M2b): per-vessel intel contact state, prediction cone,
POI registry, nowe order types (goToPOI, patrol/escort runtime).

---

## §1. Weryfikacja kontekstu

Pełna weryfikacja w master `milestone-2-combat-intelligence.md §1`. Brak odchyleń.

Kluczowe fakty dla M2a:
- `SaveMigration.CURRENT_VERSION = 65` (`src/systems/SaveMigration.js:20`)
- `MovementOrderSystem._onVesselWrecked` istnieje (`:670-691`) — auto cancel ordery
- `EnemyAttackHandler._turnIntoWreck` (`:227-264`) — kontrakt wymaga `dockedAt`;
  fallback do null już działa (linia 234 `dockedAt ?? vessel.position.dockedAt ?? null`),
  ale bez `wreckLocation` pozycja wraku deep-space jest "zamrożona na position.x/y
  momentu wrecku" i nie jest re-serializowalna.
- `WarSystem._fleetArrived` (`:301-340`) — skip musi sprawdzić `materializationState`.
- `VesselManager._tickEndurance` (`:1100-1140`) — baseline drain, brak multipliera.

---

## §2. Schema danych

### 2.1. `vessel.wreckLocation` (nowe pole)

```js
vessel.wreckLocation = null | { x: number, y: number };
```

- `null` dla żywych vesseli i wraków orbitujących ciała.
- `{x, y}` tylko gdy `isWreck === true && position.dockedAt === null`.
- Miejsce: `src/entities/Vessel.js`, obok `position`.
- Serializacja: nowe pole w `VesselManager.serialize()`, restore `?? null`.

### 2.2. `battleRec.location` — string → object

```js
battleRec.location = {
  systemId: string,                // zawsze wymagane
  planetId: string | null,         // gdy bitwa nad planetą (ścieżka EnemyAttackHandler)
  point:    { x, y } | null,       // gdy deep-space (VesselCombatSystem)
};
```

Backward-compat: helper `src/utils/BattleLocation.js` z `normalize()` konwertuje
legacy string na obiekt; `isDeepSpace()` zwraca `point !== null`.

### 2.3. `vessel.movementOrder.retreatFromBattleId` (marker pole)

```js
vessel.movementOrder.retreatFromBattleId = string | null;
```

Ustawiane przez `AutoRetreatSystem` przy issue retreat order. Tylko metadata
(UI może pokazać "Retreating from battle X"). Migration default: null.

### 2.4. Feature flags (3 nowe dla M2a)

`src/config/GameConfig.js:41-44`:

```js
FEATURES: {
  // M1 existing
  movementOrders:       false,
  fleetMaterialization: false,
  // M2a NEW
  proximitySystem:      false,
  vesselCombat:         false,   // wymaga proximitySystem
  unifiedAggregator:    false,
}
```

M2b doda 3 kolejne (intelContactState, predictionCone, poiSystem) w swoim
milestonie.

### 2.5. Migracja v65 → v66

Plik: `src/systems/SaveMigration.js`.

**Bump:**
```js
export const CURRENT_VERSION = 66;
// w MIGRATIONS map:
65: _migrateV65toV66,
```

**Funkcja:**
```js
function _migrateV65toV66(data) {
  const c4x = data.civ4x ?? data.c4x;
  if (!c4x) return data;

  // (a) vessel.wreckLocation + movementOrder.retreatFromBattleId defaults
  const vessels = c4x.vesselManager?.vessels ?? [];
  for (const v of vessels) {
    if (v.wreckLocation === undefined) v.wreckLocation = null;
    if (v.movementOrder && v.movementOrder.retreatFromBattleId === undefined) {
      v.movementOrder.retreatFromBattleId = null;
    }
  }

  // (b) battleRec.location — string → object
  const gs = data.gameState ?? {};
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

Backup mechanizm (`kosmos_save_backup_v65`) — bez zmian, standard.

---

## §3. EventBus contract

### 3.1. ProximitySystem (NEW)
| Event | Payload | Subscribers |
|---|---|---|
| `vessel:proximityEnter` | `{ vesselAId, vesselBId, distanceAU, sameFaction }` | VesselCombatSystem |
| `vessel:proximityExit` | `{ vesselAId, vesselBId }` | (M2b: IntelSystem) |

W M2a `proximityEnter` konsumuje tylko VesselCombatSystem. M2b dodaje IntelSystem
jako dodatkowego subscribera.

### 3.2. VesselCombatSystem (NEW)
| Event | Payload | Subscribers |
|---|---|---|
| `vessel:engaged` | `{ sideA: vesselIds[], sideB: vesselIds[], location }` | UIManager (EventLog) |
| `battle:resolved` | `{ warId, battleId, result }` (extends existing M1 contract) | GameScene, AutoRetreatSystem, InvasionSystem |

### 3.3. AutoRetreatSystem (NEW)
| Event | Payload | Subscribers |
|---|---|---|
| `vessel:autoRetreatIssued` | `{ vesselId, battleId, destinationPlanetId, orderId }` | UIManager (EventLog) |
| `vessel:autoRetreatFailed` | `{ vesselId, battleId, reason }` | UIManager (EventLog) |

`reason` ∈ `'no_friendly_planet'` — retreat nieudany, vessel wrecked.

### 3.4. M1 kontrakty bez zmian

`vessel:orderIssued/Completed/Blocked/Cancelled`, `vessel:wrecked`,
`empire:fleetMaterialized/Dematerialized` — identyczne jak w M1.

---

## §4. Klasy i moduły

### 4.1. NEW

| Plik | Odpowiedzialność |
|---|---|
| `src/systems/ProximitySystem.js` | Per-tick O(n²) detection + hysteresis + budget; emit events |
| `src/systems/VesselCombatSystem.js` | Event-driven: nasłuchuje `proximityEnter`, team-up by ownerEmpireId, resolveBattle w deep-space |
| `src/systems/AutoRetreatSystem.js` | Event-driven: nasłuchuje `battle:resolved` z retreated; BFS najbliższej kolonii; issueOrder moveToPoint |
| `src/utils/BattleLocation.js` | `normalize(location)`, `isDeepSpace(location)` |

### 4.2. MOD

| Plik | Zakres |
|---|---|
| `src/systems/VesselManager.js` | `_tickEndurance` drain multiplier gdy `movementOrder.type ∈ ('pursue','intercept')`; serialize `wreckLocation` |
| `src/systems/EnemyAttackHandler.js` | `_turnIntoWreck` rozszerzenie — gdy `dockedAt` to obiekt `{x,y}`, ustaw `wreckLocation`; NIE wywołuj `orbitalSpaceSystem.transitionToWreck` |
| `src/systems/WarSystem.js` | `_fleetArrived` skip gdy `fleet.materializationState === 'full' && materializedVesselIds.length > 0` (z zerowaniem `destSystemId`/`etaYear`) |
| `src/systems/SaveMigration.js` | `_migrateV65toV66` + bump `CURRENT_VERSION=66` |
| `src/config/GameConfig.js` | 3 nowe FEATURES (proximitySystem, vesselCombat, unifiedAggregator) |
| `src/scenes/GameScene.js` | 3 lazy init (`_ensureProximitySystem`, etc.) + 3 debug hooks (`enableProximity`, `enableVesselCombat`, `enableUnifiedAggregator`) |
| `src/entities/Vessel.js` | `wreckLocation` default null; `movementOrder.retreatFromBattleId` pole marker |

### 4.3. Publiczne API

**ProximitySystem:**
```
constructor(vesselManager)
_tick(civDy)
destroy()
getProximityPairs() → [[vesselIdA, vesselIdB], ...]  // debug
```

**VesselCombatSystem:**
```
constructor(vesselManager, warSystem)
destroy()
resolveDeepSpaceBattle(teamA, teamB, location) → battleRec  // debug/force
```

**AutoRetreatSystem:**
```
constructor(vesselManager, colonyManager, movementOrderSystem)
destroy()
_findNearestFriendlyPlanet(vessel) → { colony, planet, distanceAU } | null
_issueRetreatOrder(vessel, battleId) → orderId | null
```

---

## §5. Tick loop integration

```
VesselManager._tick(civDy, physDy) {
  _tickRefueling(civDy);
  _tickRepair(civDy);
  _tickFullScans(civDy);
  _tickEndurance(civDy);                  // MOD — drain multiplier

  if (FEATURES.proximitySystem) {
    proximitySystem?._tick(civDy);        // NEW — emits events
  }
  // VesselCombatSystem reaguje event-driven (sync, bez własnego tick)
  // AutoRetreatSystem reaguje event-driven

  if (FEATURES.movementOrders) {
    movementOrderSystem?._tick(civDy);    // M1 — bez zmian w M2a
  }

  _updatePositions(civDy, physDy);
  _tickWreckCleanup(civDy);
}
```

**Uzasadnienie kolejności:**

1. **ProximitySystem PRZED MovementOrderSystem**: VesselCombatSystem może
   wreckować target pursue w tym ticku. `vessel:wrecked` emituje sync →
   `MovementOrderSystem._onVesselWrecked` (M1 handler `:670-691`) ustawia
   `blockReason='target_lost'` ZANIM MOS._tick iteruje po orderach. Eliminuje
   race condition.
2. **`_tickEndurance` PRZED ProximitySystem**: endurance może wyczerpać się —
   emit `vessel:enduranceLow` → UI alert. W M2a drain multiplier, ale brak logic
   hard-stop pursue (M3).
3. **MOS PO ProximitySystem + Combat**: gdy target wrecked, MOS już wie (order
   blocked). MOS nadal iteruje, ale blocked orders są skipnięte.

---

## §6. Performance budget (M2a)

### Założenia
- Typical: 10-30 vesseli
- Peak: 100 vesseli (z materializacją dev-mode)

### ProximitySystem
- O(n²/2) par, max 4950 par przy 100 vesseli
- MAX_PAIRS_PER_TICK = 500 → pełne skanowanie w ~10 ticków
- Per-pair: `Math.hypot` + ownerEmpireId check + Set.has ≈ 30-50 ns
- Budget 500 × 40 ns = 20 µs = 0.02 ms per tick

### VesselCombatSystem
- Event-driven: koszt 0 gdy brak engagement
- BattleSystem.resolveBattle: ~5-15 ms per bitwa (max 30 tur × vol. damage calc)
- Bitwa to wyjątkowe zdarzenie — frame drop akceptowalny (1-2 frames)

### AutoRetreatSystem
- Event-driven: koszt przy `battle:resolved` z retreated
- BFS najbliższej kolonii: O(colonies × log(colonies)) ≈ 50 µs przy 10 koloniach

### Endurance multiplier (MOD _tickEndurance)
- 1 extra branch per vessel per tick: 1-5 µs dla 100 vesseli

### Total M2a budget per tick (peak 100 vesseli, no active battle)
~0.1 ms — znikome w 16.67 ms frame budget.

---

## §7. ProximitySystem — szczegóły

### 7.1. Stałe

```js
const PROXIMITY_DETECTION_AU = 0.5;   // enter threshold
const PROXIMITY_EXIT_AU      = 0.6;   // exit (hysteresis +20%)
const COMBAT_ENGAGEMENT_AU   = 0.15;  // VesselCombatSystem trigger (reuse M1 THREAT_RADIUS)
const MAX_PAIRS_PER_TICK     = 500;
```

### 7.2. Algorithm (pseudokod)

```
_tick(civDy) {
  if (civDy <= 0) return;
  const vessels = [...this._vm._vessels.values()].filter(v =>
    !v.isWreck && v.position
  );
  const n = vessels.length;
  if (n < 2) return;

  let checked = 0;
  const startIdx = this._iterationOffset % n;

  // Rotujący offset — pełne skanowanie w ~ceil(n²/2 / MAX_PAIRS) ticków
  for (let i = startIdx; checked < MAX_PAIRS_PER_TICK && i < n; i++) {
    for (let j = i + 1; checked < MAX_PAIRS_PER_TICK && j < n; j++) {
      this._checkPair(vessels[i], vessels[j]);
      checked++;
    }
  }
  for (let i = 0; checked < MAX_PAIRS_PER_TICK && i < startIdx; i++) {
    for (let j = i + 1; checked < MAX_PAIRS_PER_TICK && j < n; j++) {
      this._checkPair(vessels[i], vessels[j]);
      checked++;
    }
  }
  this._iterationOffset = (this._iterationOffset + checked) % Math.max(1, n * n);
}

_checkPair(v1, v2) {
  const key = pairKey(v1.id, v2.id);
  const dist = Math.hypot(v1.position.x - v2.position.x,
                          v1.position.y - v2.position.y);
  const distAU = dist / AU_TO_PX;
  const sameFaction = v1.ownerEmpireId === v2.ownerEmpireId;
  const isPaired = this._activePairs.has(key);

  if (!isPaired && distAU < PROXIMITY_DETECTION_AU) {
    this._activePairs.add(key);
    EventBus.emit('vessel:proximityEnter', { vesselAId: v1.id, vesselBId: v2.id, distanceAU: distAU, sameFaction });
  } else if (isPaired && distAU >= PROXIMITY_EXIT_AU) {
    this._activePairs.delete(key);
    EventBus.emit('vessel:proximityExit', { vesselAId: v1.id, vesselBId: v2.id });
  }
}
```

### 7.3. Same-faction handling

Flag w payload, nie filtruj w ProximitySystem. VesselCombatSystem sam skipuje
same-faction (nie walczą). Rozdzielenie odpowiedzialności — przyszłe use cases
(rally accumulation w M2b, escort hand-off) potrzebują same-faction detection.

### 7.4. Orbiting vessels

Pozycja z `_updatePositions` synchronizacji (OrbitalSpaceSystem → `position.x/y`).
ProximitySystem widzi zaktualizowaną pozycję. Edge case: dwa vessele orbitujące
ten sam body w różnych miejscach orbity — mogą wpadać w proximity; akceptowalne
(patrz master §7.5).

---

## §8. Combat integration — szczegóły

### 8.1. VesselCombatSystem cooldown

```js
const ENGAGEMENT_COOLDOWN_YEARS = 2;  // civYears

class VesselCombatSystem {
  _recentlyEngaged;  // Map<pairKey, lastEngagedYear>

  _onProximityEnter({ vesselAId, vesselBId, distanceAU, sameFaction }) {
    if (sameFaction) return;
    if (distanceAU > COMBAT_ENGAGEMENT_AU) return;

    const key = pairKey(vesselAId, vesselBId);
    const now = gameYear();
    const last = this._recentlyEngaged.get(key);
    if (last != null && (now - last) < ENGAGEMENT_COOLDOWN_YEARS) return;

    this._recentlyEngaged.set(key, now);
    this._resolveEngagement(vesselAId, vesselBId);
  }
}
```

Cooldown zapobiega spam'owi gdy draw/retreat nie rozwiązuje proximity.

### 8.2. Team-up algorithm (player↔empire w M2a)

M2a ogranicza do starć `player ↔ empireId` (dowolny empire). Empire↔empire →
M3 (wymaga hostility matrix między empire).

```
_resolveEngagement(v1Id, v2Id) {
  const v1 = vm.getVessel(v1Id);
  const v2 = vm.getVessel(v2Id);
  if (!v1 || !v2 || v1.isWreck || v2.isWreck) return;

  const mid = { x: (v1.position.x + v2.position.x) / 2, y: (v1.position.y + v2.position.y) / 2 };

  // Zbierz wszystkie vessele w bufor-zasięgu wokół mid
  const nearby = [...vm._vessels.values()].filter(v =>
    !v.isWreck && v.position?.state !== 'docked' &&
    dist(v.position, mid) <= COMBAT_ENGAGEMENT_AU * 1.5 * AU_TO_PX
  );

  // Grupy by ownerEmpireId
  const groups = new Map();
  for (const v of nearby) {
    const owner = v.ownerEmpireId ?? v.owner ?? 'player';
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner).push(v);
  }

  if (groups.size < 2) return;

  // M2a: tylko player ↔ empire
  const playerGroup = groups.get('player');
  if (!playerGroup || playerGroup.length === 0) return;

  // Wybierz empire z highest hostility
  let bestEmpire = null, bestHostility = -1;
  for (const [ownerId, group] of groups) {
    if (ownerId === 'player') continue;
    const hostility = window.KOSMOS?.diplomacySystem?.getHostility(ownerId) ?? 50;
    if (hostility > bestHostility) {
      bestHostility = hostility;
      bestEmpire = [ownerId, group];
    }
  }
  if (!bestEmpire) return;

  this._battle(playerGroup, bestEmpire[1], mid, 'player', bestEmpire[0]);
}
```

### 8.3. BattleSystem call + deep-space wrak

```
_battle(sideA, sideB, mid, ownerA, ownerB) {
  const empireB = window.KOSMOS.empireRegistry?.get(ownerB);
  const unitA = playerVesselsToBattleUnit(sideA, HULLS, SHIP_MODULES, 'Gracz');
  const unitB = playerVesselsToBattleUnit(sideB, HULLS, SHIP_MODULES, empireB?.name ?? 'Wróg');

  const systemId = sideA[0].systemId ?? 'sys_home';
  const location = { systemId, planetId: null, point: { x: mid.x, y: mid.y } };

  const seed = (gameYear() * 7919 + sideA.length * 113 + sideB.length * 127) & 0x7FFFFFFF;
  const result = resolveBattle(unitA, unitB, { casusBelli: 'border_incident', location, seed });

  this._applyOutcome(sideA, sideB, result, location, [ownerA, ownerB]);
}

_applyOutcome(sideA, sideB, result, location, owners) {
  const mid = location.point;
  const { winner, retreated } = result;

  const wreckSide = (loser) => {
    for (const v of loser) {
      if (v.isWreck) continue;
      enemyAttackHandler._turnIntoWreck(v, mid, gameYear());  // deep-space path
    }
  };

  if (winner === 'A' && !retreated) wreckSide(sideB);
  else if (winner === 'B' && !retreated) wreckSide(sideA);
  else if (winner === 'draw') { wreckSide(sideA); wreckSide(sideB); }
  // retreat: AutoRetreatSystem słucha battle:resolved

  const battleRec = {
    ...result,
    id: `battle_ds_${gameYear().toFixed(2)}_${owners.join('_')}`.replace(/\./g, '_'),
    location,
    participantA: { type: 'vessel_group', empireId: owners[0], vesselIds: sideA.map(v => v.id) },
    participantB: { type: 'vessel_group', empireId: owners[1], vesselIds: sideB.map(v => v.id) },
  };
  gameState.set(`battles.${battleRec.id}`, battleRec, 'deep_space_combat');
  EventBus.emit('battle:resolved', { warId: null, battleId: battleRec.id, result: battleRec });
}
```

### 8.4. `_turnIntoWreck` rozszerzenie (EnemyAttackHandler)

Istniejący kontrakt akceptuje `dockedAt: string | null`. Rozszerzamy do
`dockedAtOrPoint: string | null | {x, y}`:

```js
_turnIntoWreck(vessel, dockedAtOrPoint, year) {
  if (!vessel || vessel.isWreck) return;

  const isDeepSpace = typeof dockedAtOrPoint === 'object' && dockedAtOrPoint !== null && !Array.isArray(dockedAtOrPoint);

  vessel.isWreck = true;
  vessel.status = 'destroyed';
  vessel.mission = null;
  vessel.wreckedAt = year;
  vessel.position.state = 'orbiting';

  if (isDeepSpace) {
    vessel.position.dockedAt = null;
    vessel.wreckLocation = { x: dockedAtOrPoint.x, y: dockedAtOrPoint.y };
    vessel.position.x = dockedAtOrPoint.x;
    vessel.position.y = dockedAtOrPoint.y;
    // NIE transitionToWreck — deep-space wrak statyczny
  } else {
    vessel.position.dockedAt = dockedAtOrPoint ?? vessel.position.dockedAt ?? null;
    // istniejąca logika orbital wrak (M1 kod linia 240-260)
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    if (orbital && vessel.position.dockedAt) {
      if (orbital.hasOrbit(vessel.id)) orbital.transitionToWreck(vessel.id, year);
      else orbital.assignOrbit(vessel.position.dockedAt, vessel.id, 'wreck');
    }
  }

  if (vessel.fuel) vessel.fuel.current = 0;
  EventBus.emit('vessel:wrecked', { vesselId: vessel.id, vessel });
}
```

### 8.5. Auto-retreat algorithm

```js
class AutoRetreatSystem {
  constructor(vm, colMgr, mos) {
    this._vm = vm; this._colMgr = colMgr; this._mos = mos;
    EventBus.on('battle:resolved', (e) => this._onBattleResolved(e));
  }

  _onBattleResolved({ battleId, result }) {
    if (!result?.retreated) return;
    const side = result.retreated === 'A' ? result.participantA : result.participantB;
    if (side?.type !== 'vessel_group') return;

    for (const vId of side.vesselIds ?? []) {
      const v = this._vm.getVessel(vId);
      if (!v || v.isWreck) continue;
      this._issueRetreatOrder(v, battleId);
    }
  }

  _issueRetreatOrder(vessel, battleId) {
    const dest = this._findNearestFriendlyPlanet(vessel);
    if (!dest) {
      // Retreat fail — wrak na miejscu
      const pos = { x: vessel.position.x, y: vessel.position.y };
      window.KOSMOS?.enemyAttackHandler?._turnIntoWreck(vessel, pos, this._year());
      EventBus.emit('vessel:autoRetreatFailed', {
        vesselId: vessel.id, battleId, reason: 'no_friendly_planet',
      });
      return null;
    }

    const res = this._mos.issueOrder(vessel.id, {
      type: 'moveToPoint',
      targetPoint: { x: dest.planet.x, y: dest.planet.y },
      issuedBy: 'auto_retreat',
    });
    if (res.ok) {
      vessel.movementOrder.retreatFromBattleId = battleId;
      EventBus.emit('vessel:autoRetreatIssued', {
        vesselId: vessel.id, battleId,
        destinationPlanetId: dest.planet.id, orderId: res.orderId,
      });
      return res.orderId;
    }
    return null;
  }

  _findNearestFriendlyPlanet(vessel) {
    const ownerId = vessel.ownerEmpireId ?? vessel.owner ?? 'player';
    const colonies = this._colMgr.getAllColonies().filter(c => {
      const cOwner = c.ownerEmpireId ?? 'player';
      if (cOwner !== ownerId) return false;
      if (ownerId === 'player' && c.isOutpost) return false;
      return !!EntityManager.get(c.planetId);
    });
    if (colonies.length === 0) return null;

    let best = null, bestDist = Infinity;
    for (const c of colonies) {
      const planet = EntityManager.get(c.planetId);
      const d = DistanceUtils.euclideanAU(vessel, planet);
      if (d < bestDist) { bestDist = d; best = { colony: c, planet, distanceAU: d }; }
    }
    return best;
  }

  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }
}
```

### 8.6. Unified aggregator (WarSystem._fleetArrived skip)

```js
// src/systems/WarSystem.js — modyfikacja w _fleetArrived (po linii 301)
_fleetArrived(war, empire, fleet) {
  // M2a: skip gdy flota jest w pełni zmaterializowana — konkretne vessele
  // walczą przez ProximitySystem/VesselCombatSystem lub EnemyAttackHandler.
  // Zapobiega double-hit (fleet strength liczony raz przez _fleetArrived,
  // a drugi raz przez EAH gdy materialized vessels arrive).
  if (window.KOSMOS?.gameConfig?.FEATURES?.unifiedAggregator) {
    if (fleet.materializationState === 'full' &&
        Array.isArray(fleet.materializedVesselIds) &&
        fleet.materializedVesselIds.length > 0) {
      const fleets = [...(empire.fleets ?? [])];
      const idx = fleets.findIndex(f => f.id === fleet.id);
      if (idx >= 0) {
        fleets[idx] = { ...fleets[idx], destSystemId: null, etaYear: null };
        gameState.set(`empires.${empire.id}.fleets`, fleets, 'fleet_arrived_skipped_materialized');
      }
      return;  // materialized vessele walczą swoją ścieżką
    }
  }
  // ... M1 logic bez zmian ...
}
```

### 8.7. Endurance drain multiplier

`src/systems/VesselManager.js:1100-1140` — modyfikacja `_tickEndurance`:

```js
const PURSUE_DRAIN_MULT = 3.0;  // konfigurowalne w GameConfig (M2b extension)

_tickEndurance(civDy) {
  if (!civDy) return;
  for (const vessel of this._vessels.values()) {
    if (vessel.isWreck) continue;
    const end = vessel.endurance;
    if (!end) continue;

    const state = vessel.position?.state;
    const orderType = vessel.movementOrder?.type;
    const isPursuing = orderType === 'pursue' || orderType === 'intercept';

    let drainMult = 1.0;
    if (isPursuing) drainMult = PURSUE_DRAIN_MULT;

    if (state === 'in_transit' || isPursuing) {
      end.current = Math.max(0, end.current - (end.drainPerYear ?? 0) * drainMult * civDy);
    } else if (state === 'docked') {
      end.current = Math.min(end.max, end.current + (end.regenPerYear ?? 0) * civDy);
    }
    // orbiting + !pursuing = neutral

    // ... istniejące emit enduranceLow/Depleted bez zmian ...
  }
}
```

---

## §9. Plan commitów M2a (8)

| # | Commit | Zakres | Smoke test |
|---|---|---|---|
| 1 | Schema + migration v65→v66 + 3 FEATURES | GameConfig flagi, SaveMigration `_migrateV65toV66`, Vessel `wreckLocation`/`retreatFromBattleId` defaults, BattleLocation util | Load save v65 → assert v66 + pola default |
| 2 | ProximitySystem scaffold | Nowy plik, instance w GameScene za `FEATURES.proximitySystem`, tick hook no-op | Flag ON → instance istnieje, zero errors |
| 3 | ProximitySystem detection logic | Hysteresis, budget, events `proximityEnter/Exit`, algorithm z §7.2 | Debug spawn 2 vesseli blisko → grep `proximityEnter` w console |
| 4 | VesselCombatSystem + deep-space battle | Event consumer, team-up (player↔empire), resolveBattle, battleRec.location z point | Spawn player + enemy vessel w 0.15 AU → auto combat + `battle:resolved` |
| 5 | Deep-space wreck handling | `_turnIntoWreck` rozszerzenie, `wreckLocation` serialize, ThreeRenderer renderuje wrak w `wreckLocation` | Combat → wrak pozycja stabilna w save/load |
| 6 | Unified aggregator | WarSystem._fleetArrived skip gdy `materializationState='full'` | Materialized fleet arrive → NO abstract battle (assert przez gameState.battles) |
| 7 | AutoRetreatSystem | Event listener `battle:resolved` z `retreated`, findNearest, issueOrder moveToPoint | Force retreat → `vessel:autoRetreatIssued` + vessel leci do home |
| 8 | Endurance drain multiplier + devtools | `_tickEndurance` z `PURSUE_DRAIN_MULT=3`, 3 enable/disable debug hooks | Pursue aktywny → drain 3× szybszy; `KOSMOS.debug.enableProximity()` działa |

**Dependencies:** #4 wymaga #3; #7 wymaga #4 i #5. Pozostałe niezależne.

---

## §10. Ryzyka

| # | Ryzyko | Severity | Mitigation |
|---|---|---|---|
| R1 | Performance przy >100 vesseli (O(n²)) | MEDIUM | MAX_PAIRS_PER_TICK budget; spatial hash → M3 |
| R2 | Auto-retreat loops (retreat → new proximity → retreat) | MEDIUM | Cooldown ENGAGEMENT_COOLDOWN_YEARS=2 w VesselCombatSystem |
| R3 | Deep-space wraki znikają z ThreeRenderer po load | LOW | `wreckLocation` sprawdzane przed `position` w `_syncVesselPositions` |
| R4 | Unified aggregator skip + MilitaryAI retry | LOW | `destSystemId/etaYear` zerowane; MilitaryAI znajdzie fleet z `destSystemId=null` jako "idle" — pozwoli na nowy attack_player, ale z materialized strength=0 → score=0 → nie atakuje |
| R5 | Endurance drain multiplier frustruje gracza | MEDIUM | Domyślny ×3 (nie ×4); playtest tuning |
| R6 | Same-system orbiting vessels w proximity | LOW | Akceptowalne — planetaryShield → M3 |
| R7 | 3-way combat team-up UX confusion | N/A w M2a | Empire↔empire → M3, M2a tylko player↔empire |
| R8 | VesselCombatSystem przed MOS race | LOW | Sync events: proximity → combat → vessel:wrecked → MOS cleanup → MOS._tick |

---

## §11. Przejście do M2b

**Po M2a merge do main + playtest + tag `m2a-complete`:**

- Save v66 jest baseline dla M2b.
- M2b dodaje: IntelSystem.vessels sub-domain, POIRegistry (5 typów),
  prediction cone (math + rendering), nowe order types (goToPOI, patrol/escort
  runtime).
- M2b bumpuje save do v67.

**Hooks left by M2a dla M2b:**
- `vessel:proximityEnter/Exit` emituje payload — M2b IntelSystem.vessels słucha
  dla contact state transitions.
- `movementOrder.predictionCone` pole **nie istnieje** w v66 (M2a nie dokłada).
  M2b dokłada w v67 migration.
- POI registry: brak w M2a. M2b tworzy `gameState.pois` od zera.
- Prediction cone rendering: brak w M2a. M2b dodaje ThreeRenderer hook.

---

**Koniec M2a design doc.**
Save target: v66. Estimated effort: 5-7 dni Claude Code + 1-2 dni playtest.

---

## Appendix A — Post-implementation notes (2026-04-24)

Rzeczywiste wartości i edge-case'y które wyszły podczas implementacji.
Pełny raport: [`milestone-2a-implementation-report.md`](./milestone-2a-implementation-report.md).

### A.1. Finalne stałe (bez zmian vs design doc)

| Stała | Wartość | Gdzie | Uwagi |
|---|---|---|---|
| PROXIMITY_DETECTION_AU | 0.5 | ProximitySystem.js | Enter threshold |
| PROXIMITY_EXIT_AU | 0.6 | ProximitySystem.js | Hysteresis +20% |
| COMBAT_ENGAGEMENT_AU | 0.15 | ProximitySystem.js | Deep-space combat trigger |
| MAX_PAIRS_PER_TICK | 500 | ProximitySystem.js | Budget rotation |
| ENGAGEMENT_COOLDOWN_YEARS | 2 | VesselCombatSystem.js | Blokada re-engagement tej pary |
| PURSUE_DRAIN_MULT | 3.0 | VesselManager.js | Endurance drain dla pursue/intercept |

**Wszystkie wartości zgodne z design doca.** Żadna nie zmieniona w trakcie implementacji.

### A.2. Edge case'y które wyszły w trakcie

1. **`battleRec.location === null` fresh state (commit 1)** — migracja dodaje
   fallback `{ systemId: 'sys_home', planetId: null, point: null }` gdy
   `location` jest null (nie tylko string). Design doc §2.5 zakładał string→object;
   null to runtime-possible edge-case.

2. **`_turnIntoWreck` z null + brak dockedAt (commit 5)** — rozszerzony kontrakt
   zamraża pozycję w `wreckLocation = current position.x/y`. Rozwiązuje BUG#P8
   z m2-reconnaissance.md (vessel w tranzycie wreckowany przez
   `_wreckPlayerVesselsInSystem` nie teleportuje do planety).

3. **AutoRetreat: player ma TYLKO outposty (commit 7)** — graceful fallback
   na outposty zamiast hard-filter + wrak. Rationale: wrak w early-game gdy
   gracz ma tylko outposty byłby zbyt surowy. Odchylenie od design doca §8.5.

4. **BattleSystem `winner='B', retreated='A'`** — gdy sideA spadnie poniżej
   20% HP, winner='B' + retreated='A'. W tym przypadku NIKT nie jest wrecked
   (retreat path). Test T1 w commit 4 wymagał poprawki — assercje rozdzielić
   na: retreat (0 wrecks), draw (2 wrecks), decisive (1 wreck).

5. **VesselCombatSystem `_inCombatState`** — explicit helper dodany (design doc
   §8.2 miał tylko inline filter). Definicja: `state='in_transit'` lub
   (`state='orbiting' && dockedAt==null`). Dokowane vessele w porcie NIE wchodzą
   do deep-space combat.

### A.3. Nowa metoda API która wyszła w trakcie

**`EnemyAttackHandler._turnIntoWreck` — rozszerzony kontrakt v66:**
```
_turnIntoWreck(vessel, dockedAtOrPoint, year)
  dockedAtOrPoint:
    string   → planetId (M1 legacy orbital graveyard)
    {x, y}   → deep-space point (NEW v66)
    null     → smart fallback:
                 jeśli vessel.position.dockedAt → orbital path
                 inaczej → freeze position w wreckLocation
```

### A.4. Pomijalne w M2a (przeniesione jako TODO)

- Hard-stop pursue przy endurance=0 (tylko drain 3× w M2a)
- Empire↔empire deep-space combat (tylko player↔empire w M2a)
- Abstract fleet retreat (AutoRetreatSystem filtruje `participantA.type !== 'vessel_group'`)
- Bidirectional materialize/dematerialize reconciliation (unified aggregator
  tylko w jedną stronę — skip abstract battle gdy materialized)
- UI polish dla deep-space battle cinematic (reuse generic; M2b)
- Prediction cone rendering (M2b)

### A.5. Known pre-existing issue ujawniony przez M2a

**`GameScene.js:726` EventLog handler `battle:resolved`** — czyta
`result.location` jako string. Gdy VesselCombatSystem emituje obiekt
`{systemId, planetId, point}`, handler zapisuje go do `sysName` zmiennej i
formatuje w tekst. Wynik: `[object Object]` w EventLog przy deep-space battles.

**Mitygacja:** użyć `BattleLocation.normalize(result.location).systemId` —
**odroczone jako post-playtest fix** (nie blokuje M2a, dotyka tylko tekstu UI).

### A.6. Performance note

Smoke sprawdził scale 35 vesseli (595 par). Design target 100 vesseli (4950 par,
pełny skan w ~10 ticków przy budżecie 500/tick). Żaden test nie ujawnił
degradacji performance; live test z 100+ vesseli wymaga manual benchmarka.

### A.7. Testy offline pokrycie

169 asercji PASS przez 8 smokeów offline. Każdy commit ma osobny test file
(tmp_*.mjs usuwany po commicie, nie w repo). Weryfikacja struktury kodu przez
`node --check` na wszystkich dotkniętych plikach produkcyjnych.

