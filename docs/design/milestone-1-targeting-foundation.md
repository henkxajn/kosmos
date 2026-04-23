# Milestone 1 — Fundacja systemu targetowania statków

Status: **design draft — not yet approved**
Save version target: **v64 → v65**
Related memory: `todo-next.md` pozycja #1 ("Fleet strength — materializacja flot AI").

---

## 1. Weryfikacja kontekstu

Sprawdzone w kodzie (stan w dniu pisania dokumentu):

| Fakt z briefu | Status | Uwagi |
|---|---|---|
| `SaveMigration.CURRENT_VERSION = 64` | ✓ potwierdzone | `src/systems/SaveMigration.js:20`. Ostatnia migracja v63→v64 to OrbitalSpaceSystem (dobry wzorzec). |
| Vessel nie ma `velocity` | ✓ potwierdzone | Nie ma pola w `createVessel()` (`src/entities/Vessel.js:99-187`) ani w `serialize()` (`VesselManager.js:801-846`). |
| 3 stany ruchu | ✓ potwierdzone | `'docked' \| 'in_transit' \| 'orbiting'` (`Vessel.js:111`). **Uwaga**: jest też orthogonalny `vessel.status` (`'idle' \| 'on_mission' \| 'refueling' \| 'damaged' \| 'destroyed'`) — nie mylić. |
| `EmpireRegistry.fleets` abstract | ✓ potwierdzone, z niuansem | `fleet = { id, strength, systemId, destSystemId, etaYear, morale, hasTroopTransport, troopCapacity, embarkedTroops[] }` (`EmpireRegistry.js:157-173`). Pola `embarkedTroops[]` i `hasTroopTransport` wprowadziły już częściową konkretyzację (save v59-v60) — nie jest to więc "czysty abstrakt". |
| Ruch mission-centric | ✓ potwierdzone | `VesselManager._updatePositions()` interpoluje pozycję z `mission.startX/Y`, `mission.targetX/Y`, `mission.waypoints`, `mission.arrivalYear` (`VesselManager.js:1218-1308`). `liveTargetX/Y` resync per tick (`:1324-1344`) obsługuje ruchome planety. |
| OrbitalSpaceSystem jako wzorzec | ✓ potwierdzone | `src/systems/OrbitalSpaceSystem.js` istnieje; migracja v63→v64 (`SaveMigration.js:1551-1623`) pokazuje kanon: iteracja, defensive defaults, deterministyczny hash. |

### Odchylenia / dodatkowe fakty, których brief nie pokrywał

1. **Wrogie statki na mapie już istnieją** przez debug tool `src/debug/SpawnTestEnemy.js`. Tworzy prawdziwe `Vessel` instancje z `isEnemy=true`, `ownerEmpireId`. To jest precedens i działająca ścieżka — pokazuje że VesselManager *już* obsługuje empire-owned vessels w jednym systemie.
2. **`EnemyAttackHandler` już obsługuje wrogi vessel→gracz**. Ścieżka: wrogi vessel z `mission.type='attack'` leci na planetę → `vessel:arrived` → batched battle (`EnemyAttackHandler.js:33-68`). Materializacja musi wyemitować tę samą ścieżkę, bez reinventingu combat path.
3. **VesselManager już serializuje ownership** (`isEnemy`, `owner`, `ownerEmpireId`, `isWreck`, `wreckedAt` — `VesselManager.js:832-836`). Nie trzeba migracji na te pola — są od dawna.
4. **`VesselManager._tick` używa `civDeltaYears`** (`:72`). Endurance jako mechanika militarno-operacyjna też powinna biec w skali civ (x12), a nie fizycznej.
5. **Precedens MAX_STEPS_PER_TICK=8** jest w `AlienCivSystem.js:46` — analogiczny budżet dla proximity/materialization należy wprowadzić.
6. **Brief zauważył jedną rzecz źle (mniej istotną)**: jeden z agentów stwierdził że "planety są statyczne" — kod temu zaprzecza (`_updateRouteLine` resync per tick, PhysicsSystem działa w scenariuszu Cywilizacja — wyłączone są tylko perturbacje/kolizje). Planety *się ruszają* wolno; intercept math będzie tym się musiało zajmować.

Plan idzie do przodu bez blokerów.

---

## 2. Schema danych

### 2.1. `vessel.velocity` (nowe pole)

```js
vessel.velocity = {
  vx: 0,                // AU/rok (uwaga: NIE px/tick — patrz §6)
  vy: 0,
  updatedYear: 0,       // gameYear ostatniej aktualizacji; bez tego post-load
                        //  pierwszy czyta stary wektor i nie wie że jest stale
}
```

Miejsce: `src/entities/Vessel.js`, wewnątrz obiektu zwracanego z `createVessel()`, obok `position`. Default: `{ vx: 0, vy: 0, updatedYear: 0 }`.

**Inwarianty**:
- `|v|` nigdy nie przekracza `vessel.speedAU × CIV_TIME_SCALE` (maksymalna prędkość interpolacji).
- Dla `state='docked'` i `state='orbiting'` zerowana w pierwszej kolejności (statek nie porusza się względem bazy; orbit pomijamy w M1 jako "efektywnie zero" — patrz §9).
- Wartość jest *efektywną* prędkością z tick-to-tick delty pozycji, nie zadaną prędkością misji. Różnica istotna dla statków wchodzących w waypoint corner.

**Serializacja**: **pomijamy velocity w save**. Po load pierwszy `_updatePositions` ustawi velocity w kolejnym ticku. Akceptowalna 1-klatka z `(0,0)` — żaden system nie podejmuje krytycznej decyzji na podstawie pierwszego ticka po load.

Uzasadnienie: serializacja velocity to zaprosić bug o `updatedYear` desync między save i restore. Łatwiej zostawić jako *derived state*.

### 2.2. `vessel.endurance` (nowe pole, stub)

```js
vessel.endurance = {
  current: 100,         // 0..100, procenty
  max:     100,
  drainPerYear:   0.0,  // civYears; zasypywane z hull/moduł defs przy create
  regenPerYear:   0.0,  // civYears; zasypywane j.w.
  lastDepleted:   null, // gameYear kiedy spadła pierwszy raz do 0 (UI/event)
}
```

Miejsce: `src/entities/Vessel.js`, obok `fuel`. W Milestone 1 ustawiane z hardcoded defaults (bo reforma fuel/endurance to Milestone 2+):

| Rola statku | drainPerYear (civ) baseline | regenPerYear (civ) |
|---|---:|---:|
| warship / assault | 2 | 20 |
| transport / cargo / colony | 2 | 20 |
| science / scout / explorer | 1 | 20 |

**Wyjaśnienie tempa (decyzja gracza z Q1)**: przy 1r/s (środkowa prędkość gry), warship z `drainPerYear=2` i `max=100` zeruje się po ~50 civYears ≈ **~4 sekundy real-time ciągłego transit**. To daje graczowi margines na sensowne manewry/rozkazy, a nie kill-switch po 1 sekundzie. Scout/explorer (drain=1) ma ~100 civYears ≈ ~8 s — zgodnie z rolą recon/długi zasięg.

**Pursuit multiplier — M2**: wprowadzimy `drainMultiplier` gdy `movementOrder.type ∈ ('pursue','intercept')`, nominalnie ×3-4. To przywróci "pursuit endurance" ~12-16 civYears (~1-1.5 s real-time przy 1r/s) jako oddzielny, świadomy koszt gonienia. Semantycznie rozdziela "cruise endurance" od "combat endurance" i daje dedykowany tuning knob. W M1 **tylko baseline drain** — multiplier nie aktywny.

Cyfry są **orientacyjne placeholdery** — balans w M2 razem z multiplierem.

**Inwarianty**:
- `0 ≤ current ≤ max`.
- `max` może być zmodyfikowany przez moduły kadłuba w M2+, w M1 stała 100.
- Drain aktywny gdy `state === 'in_transit'` LUB `movementOrder.type ∈ ('pursue','intercept')`. Regen aktywny gdy `state === 'docked'`. Stan `'orbiting'` = neutralny (no drain, no regen) — debatowalny, ale upraszcza logikę w M1.

**Serializacja**: `current`, `max`, `lastDepleted` zapisywane. `drainPerYear`/`regenPerYear` pochodne z hull/modułów przy restore (analogicznie jak `troopCapacity` w obecnym kodzie, `VesselManager.js:920-922`).

**Co endurance NIE jest w M1**:
- Nie jest fuel. Fuel istnieje, ma własną logikę tankowania, zostaje.
- Nie blokuje misji. Wyłącznie soft-signal: przy `current ≤ 20` emit `vessel:enduranceLow`. Sam fakt `current=0` w M1 **nie zmusza do powrotu** — tylko flaga (stub). Pełna logika pursuit-endurance-breaking w M2.

Uzasadnienie osobnego pola (vs reużywanie fuel): zob. §11, decyzja #2.

### 2.3. `vessel.movementOrder` (nowe pole, główny system)

```js
vessel.movementOrder = null | {
  id:             'mo_<nextId>',    // dla eventów i UI
  type:           'moveToPoint' | 'pursue' | 'intercept' | 'patrol' | 'escort',
  issuedYear:     number,           // gameYear wydania
  issuedBy:       'player' | 'ai:<empireId>' | 'system',

  // Targeting — jedno z poniższych, zależnie od type:
  targetEntityId: string | null,    // 'pursue', 'intercept', 'escort'
  targetPoint:    { x, y } | null,  // 'moveToPoint' (px)
  patrolRoute:    [{x,y}, ...] | null, // 'patrol' — M2 stub

  // Runtime (wypełniane co tick przez MovementOrderSystem)
  lastTargetPos:  { x, y } | null,  // cache pozycji celu w ostatnim tick
  interceptPoint: { x, y } | null,  // wyliczony punkt spotkania ('intercept')

  // Status
  status:         'active' | 'completed' | 'cancelled' | 'blocked',
  completedYear:  number | null,
  blockReason:    string | null,    // np. 'target_lost', 'out_of_range'
}
```

Miejsce: `src/entities/Vessel.js`, nowe top-level pole obok `mission`.

**Inwarianty**:
- Jednocześnie max jeden `movementOrder` aktywny. Kolejkowanie NIE w M1.
- `type='patrol'` i `type='escort'` w M1 istnieją jako wartości enumu i są akceptowane przez MovementOrderSystem *jako no-op stub* (UI pokazuje "zlecone", logika nic nie robi — placeholder pod M2).
- Gdy `movementOrder.status === 'active'`, resolver może modyfikować `vessel.mission.targetX/Y/waypoints` albo overridować je całkowicie (patrz §8).
- `movementOrder === null` to neutral state: ruch sterowany wyłącznie przez `mission` (legacy ścieżka).

**Serializacja (decyzja z Q-B)**: całe pole deep-copy (jak `mission` — `VesselManager.js:794-800`). Save podczas aktywnego `pursue` → po load statek kontynuuje pursuit od aktualnej pozycji. Recompute intercept point nastąpi w pierwszym `_tick` po restore, więc 1-klatka z nieaktualnym `interceptPoint` jest akceptowalna.

**Graceful degradation po load (decyzja z Q-B)**: w `MovementOrderSystem.restore()`, dla każdego orderu:
- Jeśli `targetEntityId` nie istnieje w VesselManager/EntityManager → ustaw `status='cancelled'`, `blockReason='target_lost_on_load'`, emit `vessel:orderCancelled` po pełnym restore wszystkich systemów. NIE rzucaj wyjątkiem.
- Jeśli `type='moveToPoint'` i `targetPoint` jest w obecnej strefie wykluczenia (patrz §8.5) → recompute waypoints; jeśli niemożliwe → cancel.
- Loguj warning per cancel żeby był ślad w konsoli. Player nie powinien ich klikać — UI po prostu pokaże że order zniknął.

### 2.4. Materializacja flot — nowe pola w `empire.fleets[]`

```js
// W każdym fleet object (EmpireRegistry.spawnFleet — rozszerzenie):
fleet.materializedVesselIds = [];   // nowo — lista vesselId (VesselManager)
fleet.materializationState  = 'abstract' | 'partial' | 'full';
                                    // abstract: tylko strength; partial: część w vessels;
                                    // full: cała strength reprezentowana przez vessels
fleet.lastMaterializedAt    = null; // gameYear ostatniej materializacji (cooldown)
```

Miejsce: `EmpireRegistry.spawnFleet()` ustawia defaults; `gameState.empires.<id>.fleets` jak dotąd.

**Inwarianty**:
- Jeśli `materializedVesselIds.length === 0` → `state='abstract'`.
- Strength a vessels są **równolegle** (shadow fleet — szczegóły w §7). Straty zmaterializowanych pomniejszają `fleet.strength` o proporcjonalną wartość.
- Jeśli `state !== 'abstract'`, przy save/load `VesselManager` dostarcza vessel-e, `fleet.materializedVesselIds` to referencje tylko do nich.

**Brak nowego pola na vessel** — ownership (`ownerEmpireId`) już istnieje i wystarcza do odwrotnego lookupu.

### 2.5. Migracja v64 → v65 (krok po kroku)

Plik: `src/systems/SaveMigration.js`.

1. **Bump**:
   ```js
   export const CURRENT_VERSION = 65;
   // w MIGRATIONS: 64: _migrateV64toV65,
   ```
2. **Funkcja `_migrateV64toV65(data)`** — iteruje `data.civ4x.vesselManager.vessels` i dodaje brakujące pola z bezpiecznymi defaultami:
   ```js
   function _migrateV64toV65(data) {
     const c4x = data.civ4x ?? data.c4x;
     if (!c4x) return data;

     // (a) vessel.endurance + vessel.movementOrder na istniejących statkach
     const vessels = c4x.vesselManager?.vessels ?? [];
     for (const v of vessels) {
       if (!v.endurance) {
         v.endurance = {
           current: 100,
           max:     100,
           lastDepleted: null,
           // drainPerYear/regenPerYear nie zapisujemy — restore pobiera z hull/modułów
         };
       }
       if (v.movementOrder === undefined) v.movementOrder = null;
       // velocity — celowo pomijamy (derived, patrz §2.1)
     }

     // (b) empire.fleets[].materializedVesselIds
     const empires = data.gameState?.empires ?? data.empires;
     if (empires && typeof empires === 'object') {
       for (const emp of Object.values(empires)) {
         if (!emp?.fleets) continue;
         for (const f of emp.fleets) {
           if (!Array.isArray(f.materializedVesselIds)) f.materializedVesselIds = [];
           if (!f.materializationState) f.materializationState = 'abstract';
           if (f.lastMaterializedAt === undefined) f.lastMaterializedAt = null;
         }
       }
     }

     return data;
   }
   ```
3. **Backup** — automatyczny dzięki istniejącej infrastrukturze (`migrate()` już backupuje przed łańcuchem).
4. **SaveSystem** — `SaveSystem.save()` importuje `CURRENT_VERSION`, więc sam bump migruje. W `VesselManager.serialize()` trzeba rozszerzyć o `endurance`, `movementOrder` (zachowują się jak reszta pól). W `VesselManager.restore()` dodać fallback `?? default`.

**Test migracji**: wczytać save v64 z istniejącej gry → oczekiwanie: wszystkie vessele mają `endurance = {current:100, max:100, ...}`, `movementOrder = null`, wszystkie fleets mają `materializedVesselIds=[]`. Żaden istniejący system nie powinien się wywrócić (endurance/order są opt-in consumowane).

### 2.6. Co świadomie **zostawiamy** poza M1

- `vessel.velocity` — jak wyżej, nie serializowane.
- Strength → vessel count mapping tuning — w M1 prosta formuła (§7), balans w M2.
- Pursuit endurance-breaking logic — M2.
- Proximity detection (`vessel:proximityEnter`) — M2.
- Pola `targetVesselId` na mission (hint z briefu) — NIE wprowadzamy, celowanie żyje wyłącznie w `movementOrder`.

---

## 3. EventBus contract

### 3.1. Nowe eventy

| Event | Payload | Emitter | Subscribers |
|---|---|---|---|
| `vessel:orderIssued` | `{ vesselId, order }` (pełny order object) | MovementOrderSystem (po walidacji z UI entry point) | UIManager (refresh fleet panel), VesselManager (może suspendować mission — patrz §8), EventLog (opcjonalny wpis) |
| `vessel:orderCompleted` | `{ vesselId, orderId, type, completedYear }` | MovementOrderSystem (gdy target reached / intercept hit) | UIManager, VesselManager (wznowi mission jeśli była suspendowana), EventLog |
| `vessel:orderCancelled` | `{ vesselId, orderId, reason }` | MovementOrderSystem | j.w. |
| `vessel:orderBlocked` | `{ vesselId, orderId, reason }` (`target_lost`/`out_of_range`/`endurance_zero`) | MovementOrderSystem | UIManager (alert), EventLog |
| `vessel:enduranceLow` | `{ vesselId, endurance }` (current ≤ 20%) | EnduranceTicker (w VesselManager) | UIManager (ikonka), EventLog. **Nie emitowany per tick** — tylko raz przy przekroczeniu progu (hysteresis: reset gdy current ≥ 40%). |
| `vessel:enduranceDepleted` | `{ vesselId }` (current === 0) | EnduranceTicker | j.w. (M1: informacja, M2: wymuszenie powrotu) |
| `empire:fleetMaterialized` | `{ empireId, fleetId, vesselIds[], strengthConsumed }` | EmpireFleetMaterializer | UIManager (GalaxyMap może zmienić ikonkę floty), IntelSystem (upgrade contact state) |
| `empire:fleetDematerialized` | `{ empireId, fleetId, reason }` (`vessels_destroyed`/`returned_home`/`fleet_disbanded`) | EmpireFleetMaterializer | j.w. |
| `empire:fleetMaterializedVesselLost` | `{ empireId, fleetId, vesselId, remainingStrength }` | EmpireFleetMaterializer (reakcja na `vessel:wrecked`) | WarSystem (exhaustion tracking), IntelSystem |

### 3.2. Istniejące eventy — modyfikacje

| Event | Zmiana | Backward compat |
|---|---|---|
| `vessel:positionUpdate` | Bez zmiany payloadu. Po _updatePositions velocity już jest świeża na vessel object — subskrybenci (ThreeRenderer) mogą opcjonalnie czytać. | ✓ zachowana |
| `vessel:launched` | Bez zmiany. Może być emitowany dodatkowo przez MovementOrderSystem gdy `moveToPoint` powoduje start ruchu z docked. | ✓ |
| `vessel:arrived` | Bez zmiany. MovementOrder-driven arrival powinien emitować ten sam event (żeby EnemyAttackHandler się podpiął) + dodatkowo `vessel:orderCompleted`. | ✓ |
| `empire:fleetSpawned` | Bez zmiany. Nowe pola w fleet object są opcjonalne (migracja defaults). | ✓ |
| `empire:fleetMoved` | Bez zmiany. Materializer będzie go nasłuchiwał (hook pod materializację gdy `destSystemId === 'sys_home'` i ETA krótka). | ✓ |

### 3.3. Eventy których celowo **nie dodajemy** w M1

- `vessel:proximityEnter` / `vessel:proximityExit` — to podstawa auto-engagement (M2).
- `vessel:velocityChanged` — zbyt spammy per tick; konsumenci odczytują `vessel.velocity` bezpośrednio po `vessel:positionUpdate`.
- `vessel:interceptComputed` — wewnętrzny, nie event.

---

## 4. Klasy i moduły

### 4.1. Nowe pliki

| Plik | Rola | Publiczne API |
|---|---|---|
| `src/systems/MovementOrderSystem.js` | Centralny rejestr + tick resolver movementOrderów. | `constructor()`, `issueOrder(vesselId, orderSpec) → { ok, reason?, orderId? }`, `cancelOrder(vesselId, reason) → bool`, `getOrder(vesselId) → order \| null`, `listActive() → Array<order>`, `_tick(civDeltaYears)` (private). Subskrybuje `time:tick`, `vessel:wrecked` (cancel order gdy target stał się wrakiem), `vessel:arrived`. |
| `src/systems/EmpireFleetMaterializer.js` | Szef kuchni od "strength → vessels". | `constructor()`, `materializeFleet(empireId, fleetId, { budget? }) → { vesselIds[], strengthConsumed }`, `dematerializeFleet(empireId, fleetId, reason) → void`, `onVesselWrecked(vesselId)` (wewn. reakcja na event), `serialize() / restore(data)`. Subskrybuje `empire:fleetMoved`, `vessel:wrecked`, `time:tick` (dla delayed materialization). |
| `src/systems/FleetCompositionPolicy.js` | Czysta biblioteka (bez stanu) — maps strength → [{hullId, modules[]}]. | Eksport `composeFromStrength(strength, empire) → Array<{hullId, modules}>`. W M1: prosty algorytm (§7). |
| `src/data/MovementOrderTypes.js` | Enum + walidacja per type. | Eksport `ORDER_TYPES = { moveToPoint, pursue, intercept, patrol, escort }`, `validateOrder(spec) → { valid, reason? }`. |
| `docs/design/milestone-1-targeting-foundation.md` | Ten dokument. | — |

### 4.2. Pliki modyfikowane

| Plik | Zmiana |
|---|---|
| `src/entities/Vessel.js` | `createVessel()` zwraca obiekt z nowymi polami: `velocity`, `endurance`, `movementOrder`. Dodać helper `getEnduranceDefaults(vessel) → { drain, regen }`. |
| `src/systems/VesselManager.js` | (a) `_tick()` woła nowe sub-ticki: `_tickEndurance(civDy)` przed `_updatePositions`. (b) `_updatePositions()` po aktualizacji `position.x/y` aktualizuje `vessel.velocity = { vx: (x-prevX)/dt_au, vy: (y-prevY)/dt_au }`. (c) `serialize()` + `restore()` — obsługa `endurance`, `movementOrder`. |
| `src/systems/SaveMigration.js` | Bump do 65 + funkcja `_migrateV64toV65`. |
| `src/systems/EmpireRegistry.js` | `spawnFleet()` inicjalizuje nowe pola (`materializedVesselIds=[]`, `materializationState='abstract'`, `lastMaterializedAt=null`). **Nie** dotyka logiki strength/growth. |
| `src/scenes/GameScene.js` | Inicjalizacja `MovementOrderSystem` i `EmpireFleetMaterializer` obok istniejących systemów; pin na `window.KOSMOS.movementOrderSystem` i `...empireFleetMaterializer`. |
| `src/ui/FleetManagerOverlay.js` | **M1 read-only** (decyzja Q5): dodać render label'u aktualnego `movementOrder` w prawym panelu obok mission state. Zero przycisków do wydawania orderów — devtools w zupełności. Format labela patrz §8.4. |
| `src/debug/SpawnTestEnemy.js` | Opcjonalnie: druga funkcja `spawnTestEnemyFleet(empireId, systemId)` która wywołuje `empireFleetMaterializer.materializeFleet` — do ręcznych testów. |

### 4.3. Relacje

```
                        ┌─────────────────────┐
                        │ MovementOrderSystem │
                        └────────┬────────────┘
                                 │ modifies
                                 ▼
   ┌────────────┐  tick  ┌──────────────┐  uses  ┌────────────────┐
   │ TimeSystem │───────▶│ VesselManager│───────▶│ OrbitalSpace... │
   └────────────┘        │  - _tickEnd. │        └────────────────┘
                         │  - _updatePos│                 
                         └──────┬───────┘
                                │ emits vessel:wrecked
                                ▼
                        ┌──────────────────────┐
                        │ EmpireFleetMaterial. │──▶ EmpireRegistry (read + update fleets[])
                        └──────────────────────┘
                                │ creates vessels
                                └──▶ VesselManager.createAndRegister
```

Komunikacja wyłącznie przez EventBus + `window.KOSMOS.*` service locator (wzorzec istniejący — nie wprowadzamy bezpośrednich importów między systemami).

---

## 5. Tick loop integration

### 5.1. Nowa sekwencja w `VesselManager._tick(civDeltaYears)`

```js
_tick(civDeltaYears) {
  this._tickRefueling(civDeltaYears);   // istniejące (1)
  this._tickRepair(civDeltaYears);      // istniejące (2)
  this._tickFullScans(civDeltaYears);   // istniejące (3)
  this._tickEndurance(civDeltaYears);   // NEW (4)
  // MovementOrderSystem tickuje SAM, na time:tick — resolve przed positions.
  // Tu synchronicznie go wołamy żeby mieć gwarantowaną kolejność:
  window.KOSMOS?.movementOrderSystem?._tick?.(civDeltaYears); // NEW (5)
  this._updatePositions(civDeltaYears); // istniejące (6) — po nim velocity świeża
  this._tickWreckCleanup();             // istniejące (7)
}
```

**Uzasadnienie kolejności**:

1. **Refueling/Repair PIERWSZE** — mogą zmienić `status` i `fuel.current` co jest wejściem dla innych mechanik.
2. **`_tickEndurance` PRZED MovementOrderSystem** — endurance ∈ [0..max] jest inputem do decyzji "czy kontynuuję pursuit?". M1: tylko monitoring + event; M2: block/cancel pursuit gdy endurance=0.
3. **MovementOrderSystem PRZED `_updatePositions`** — order może zmodyfikować `vessel.mission.targetX/Y/waypoints` (np. `intercept` przepisze target na intercept point). `_updatePositions` czyta mission — więc order musi być zresolvowany wcześniej.
4. **`_updatePositions` PRZED velocity update**: velocity jest pochodną delty pozycji (`velocity.vx = (x_after - x_before) / (civDeltaYears / CIV_TIME_SCALE)` — patrz §6 jednostki). Musi być po ustawieniu nowej pozycji.
5. **`_tickWreckCleanup` OSTATNIE** — usuwa wrakowaty; tu bezpiecznie po wszystkich operacjach.

### 5.2. `MovementOrderSystem._tick(civDy)` — kroki wewnątrz

Per order aktywny:
1. Sprawdź czy target istnieje (`EntityManager.get(targetEntityId)` lub vessel w `VesselManager._vessels`). Brak → emit `vessel:orderBlocked(target_lost)`, cancel.
2. Sprawdź endurance (soft w M1 — tylko log).
3. Dispatch per type:
   - `moveToPoint`: ustaw `vessel.mission` na prostą misję do punktu (synteza waypoints z `_calcRoute` jeśli potrzebne). **Jednorazowe** — po utworzeniu mission, następne ticki nic nie robią.
   - `pursue`: przepisuje `mission.targetX/Y` na `target.x/y` (lub `vessel.position` dla wroga); liczy nowe `arrivalYear` z dystansu + speed. Co tick re-run.
   - `intercept`: oblicza intercept point z `target.velocity` (wymaga żeby velocity była aktualna — patrz §6 about post-load). Ustawia mission. Co tick re-run (bo velocity target może się zmienić).
   - `patrol` / `escort`: **no-op stub w M1**, loguje `[MovementOrderSystem] stub: patrol/escort`.
4. Detekcja completed: dla `pursue`/`intercept`, gdy dystans do targetu < próg (np. 0.05 AU = 5.5 px), emit `vessel:orderCompleted`, wywołaj `EnemyAttackHandler` pośrednio przez standardowy `vessel:arrived` (jeśli to wroga planeta) lub emit dedykowany event ścinający bitwę vessel-vs-vessel (M2).

### 5.3. `EmpireFleetMaterializer` — nie własny tick loop

Reaktywny: subskrybuje `empire:fleetMoved`. Gdy `destSystemId === 'sys_home'`, planuje materializację z delay (np. gdy ETA - currentYear < 1 civYear). Dla uniknięcia spam: `fleet.lastMaterializedAt` jako cooldown.

Alternatywnie — timed check w własnym `_tick(civDy)` (listener `time:tick`) iterujący `empires` i sprawdzający pending materializations. Budżet: **MAX_MATERIALIZE_PER_TICK = 2** (precedens: `MAX_STEPS_PER_TICK=8` w AlienCivSystem). Gwarantuje brak spike'a przy wielu flotach wchodzących w system jednocześnie.

---

## 6. Performance budget

### 6.1. Per-system koszt

| System | Koszt per tick | Max vessel count przed problemem | Safeguard M1 |
|---|---|---:|---|
| velocity update (w `_updatePositions`) | O(n), n=#vessels. Dwa odejmowania + dzielenie per vessel. | ~1000+. Dominuje istniejące koszty interpolacji, nie dodaje znacznego narzutu. | Brak potrzeby. |
| `_tickEndurance` | O(n). Per vessel: state check + accumulate + threshold event (raz na hysteresis). | ~5000. | Brak. |
| `MovementOrderSystem._tick` | O(k), k=#aktywnych orderów. K ≤ n, zwykle k << n (mało statków ma order jednocześnie). Per order: lookup target (O(1)), route recompute (w `pursue`/`intercept` — koszt `_calcRoute` ~O(#planets) ≈ 10). | Limit: **MAX_ORDERS_PER_TICK = 50** (sensowny upper bound). Powyżej → kolejka round-robin. | Budżet stosowany jeśli test przekroczy 50 orderów. |
| `EmpireFleetMaterializer._tick` | O(f), f=#abstrakcyjnych flot. Per fleet: sprawdzenie progów. Materializacja to ciężka operacja (tworzenie 2-8 vessel instances + registracja w OrbitalSpaceSystem). | Dwa budżety (decyzja Q-C): **MAX_MATERIALIZE_PER_TICK = 2** (ile flot zmaterializować w jednym ticku) + **MAX_MATERIALIZED_VESSELS_PER_FLEET = 8** (cap per flota) + **MAX_TOTAL_MATERIALIZED_VESSELS = 40** (soft global cap, odraczający nowe materializacje gdy pełno). | Tak, jak wyżej. |
| `_updatePositions` proximity (NIE w M1) | O(n²) naive. Potrzebuje spatial hash. | <50 vessels naive → OK. Powyżej kłopot. | **M1 pomija, M2 wprowadza spatial hash**. |

### 6.2. Jednostki velocity — świadoma decyzja

Wybieramy **AU/rok** (gameYear), nie px/tick ani AU/s.

Powody:
1. `vessel.speedAU` jest w AU/rok — intercept math będzie mógł porównywać `|target.velocity|` ze `vessel.speedAU` bez konwersji.
2. Per-tick delta zależy od `civDeltaYears`, ale velocity powinna być niezależna od time scale. Gracz przełączający z 1d/s na 10r/s nie powinien widzieć różnego velocity number w UI.
3. Obliczenie: `velocity.vx = (new_x_px - old_x_px) / AU_TO_PX / (civDeltaYears)` — gdzie `civDeltaYears` to czas *gry*, nie rzeczywisty. Rezultat: stała w czasie gry, poprawna w intercept math.

**Alternatywa rozważona**: px/tick (łatwiejsze do UI kierunku strzałki). Odrzucone — narzędzie do intercept math ma pierwszeństwo, UI arrow dirty z normalizacji.

### 6.3. Hot spots do zapamiętania

- **`_updatePositions` już jest O(n)** i często dużą pętlą (Three.js sprites aktualizują się z jej emitowanego eventu). Jakikolwiek nowy kod w środku lub per-vessel callback jest drogi × n. Velocity update: 6 operacji arytmetycznych → akceptowalne.
- **`vessel:wrecked` spowoduje łańcuch**: `EmpireFleetMaterializer.onVesselWrecked` → strength recalc → potencjalnie `empire:fleetDematerialized`. Każdy taki event synchronicznie. W M1 batchowanie niepotrzebne (wraki rzadkie), ale zostawić jako hook na M2.

---

## 7. Materializacja enemy fleets — szczegóły

### 7.1. Alternatywy

**Alt A — Full materialization on spawn** (EmpireGenerator od razu tworzy vessele)
- Pros: pełna parity natychmiast. AI działa na tych samych instancjach co gracz.
- Cons: Wielki zakres — trzeba przepisać `MilitaryAI` z inkrementacji strength na budowę konkretnych statków. Save migracja bardzo trudna (trzeba zgadnąć skład dla istniejących abstraktów). TODO-next.md explicit oznacza to jako **20-30h task** i "osobną sesję". **Za drogie na M1**.

**Alt B — Lazy on moveFleet** (materializuje gdy flota rusza)
- Pros: ogranicza materializację do "gdy coś się dzieje".
- Cons: flota siedząca w homebase (np. IDLE empire) jest niewidoczna. Gracz widzi imperium jako "zero statków" — dysonans w UI.

**Alt C — JIT on enter sys_home** (materializuje tylko gdy leci na gracza)
- Pros: Minimalna liczba materializowanych statków w świecie. Bardzo tanio.
- Cons: Asymetria — flota wracająca do obcego systemu może zniknąć z mapy → niekonsystencja "gdzie ona właściwie jest".

**Alt D — Shadow fleet (materialized + strength shadow)** ⭐ **rekomendowane w M1**
- Fleet posiada **obydwoje równolegle**: `strength` (abstrakt) i `materializedVesselIds[]` (konkret).
- Materializacja jest **opcjonalna** — trigger na wybranych zdarzeniach (M1: głównie "flota wchodzi w sys_home").
- Straty zmaterializowanych pomniejszają strength proporcjonalnie. Strength nigdy nie rośnie od materializacji (jednokierunkowy synch: vessels → strength only).
- Niezmaterializowane floty w obcych systemach pozostają abstrakcyjne (galaktyka pokazuje ikonkę strength) — spójne z dotychczasowym UX.
- Pros: zero breakage istniejących save'ów; stopniowa migracja; testowalne przyrostowo. Pokrywa pragmatyczny zakres M1.
- Cons: dual-state accounting complexity. Trzeba ostrożnie przy save/load (vessel-e są w VesselManager, fleet trzyma tylko ID — klasyka: dangling references).

**Wybór: Alt D**, z ograniczeniem trigger'a w M1 (decyzja z Q2):

> Materializujemy flotę **tylko** gdy `destSystemId === 'sys_home'` i `(etaYear - gameYear) ≤ 2 civYears`. Dodatkowo ręczny trigger z debug/cheat.

Pozostałe przypadki (flota w obcym systemie, flota w tranzycie między obcymi, wejście floty do kolonii zamorskiej gracza) zostają abstraktowe w M1.

**Hook na rozszerzenie (M2+)** — w `EmpireFleetMaterializer._shouldMaterialize(fleet)`:
```js
// TODO M2: rozszerzyć warunek o obecność gracza:
//   - kolonie zamorskie gracza (systemId w player.ownedSystems[])
//   - systemy z aktywnym sensor coverage (ObservatorySystem rozszerzony)
//   Musi iść w parze z sensor range / intel contact state (M2),
//   inaczej flota "pojawia się znikąd" z perspektywy gracza.
return fleet.destSystemId === 'sys_home' && (fleet.etaYear - year) <= 2;
```

### 7.2. Mapping strength → vessel count + stats

Funkcja w `FleetCompositionPolicy.composeFromStrength(strength, empire)`:

```js
// W M1: prosty algorytm z hard capem (decyzja z Q-C)
const MAX_MATERIALIZED_VESSELS_PER_FLEET = 8;  // stała w FleetCompositionPolicy.js
const COUNT = clamp(2, Math.floor(strength / 50), MAX_MATERIALIZED_VESSELS_PER_FLEET);
// strength=100 → 2 statki; 200 → 4; 400 → 8; 1000 → 8 (cap)
// Cap=8 chroni przed spawn spam'em dla mega-flot.
```

**Globalny budżet (Q-C)**: poza capem per-flota, wprowadzamy **soft limit globalny** `GAME_CONFIG.MAX_TOTAL_MATERIALIZED_VESSELS = 40`. `EmpireFleetMaterializer._shouldMaterialize(fleet)` sprawdza sumę `materializedVesselIds.length` across all empires; gdy ≥ limit, materializacja jest **odroczona** (fleet pozostaje abstract, retry w kolejnym ticku gdy inne wraki się posprzątają). To ochrona przed scenariuszem "5 flot po 8 statków = +40 vesseli naraz" × z fleetą gracza (powiedzmy 10) = ~50 vesseli, co jest akceptowalne dla `_updatePositions` O(n) ale niewiele powyżej zaczyna piłować framerate na słabszych maszynach. Budżet jest tuning knob, nie hard guarantee — w M2 dołączy spatial hash i limit można podnieść.

Kompozycja — wybór hullów per empire.archetype:

| Archetype | Mix statków (w M1 uproszczenie) |
|---|---|
| `hegemon` / `xenophage` | 70% warship, 20% transport (gdy `hasTroopTransport`), 10% scout |
| `isolationist` | 50% warship, 50% scout |
| `trader` | 40% cargo, 40% scout, 20% warship |
| `swarm` | 90% scout, 10% warship |
| default | 50% warship, 25% transport, 25% scout |

"warship" → hull: `hull_frigate` + `weapon_railgun` (z HullsData/ShipModulesData, M1 lista placeholder; M2 doprecyzować).
"transport" → `hull_colonial` + `troop_bay_m` + `embarkedTroops` z `fleet.embarkedTroops[]` (które już istnieje od v60).
"scout" → `hull_explorer` + `deep_scanner`.

### 7.3. Synchronizacja state (abstract ↔ concrete)

**Reguła główna**: strength jest *potencjałem/rezerwą w homebase + in-flight*, vessels to *konkret w systemie docelowym*. Materializacja **konsumuje** część strength.

Algorytm materializacji:
```
1. targetCount = composeFromStrength(fleet.strength, empire).length
2. strengthPerVessel = fleet.strength / targetCount   // np. 400/8 = 50
3. stwórz vessele → fleet.materializedVesselIds = [v_101, v_102, ...]
4. fleet.strength = 0 (lub retained: fleet.strength -= strengthPerVessel × count)
5. fleet.materializationState = 'full' (gdy wszystko zmaterializowane)
6. emit empire:fleetMaterialized
```

Decyzja: w M1 **full consumption** — `fleet.strength = 0` po materializacji. Flota staje się de facto "tymi vesselami". Uproszczenie — upraszcza accounting strat. Wada: AI growth (`_growAll` w EmpireRegistry) dalej inkrementuje strength w tle → po czasie flota miałaby znów abstract. W M1 to akceptowalne (szybka reimaterializacja jako drugi event) — lub wykluczyć flotę zmaterializowaną z `_growAll`. Rekomenduję **wykluczenie**: `if (fleet.materializationState === 'full') continue;` w EmpireRegistry growth — hook minimalny, odwracalny.

Algorytm dematerializacji (gdy wszystkie vessele zginęły):
```
1. Ostatni vessel wrecked → EmpireFleetMaterializer.onVesselWrecked
2. fleet.materializedVesselIds -= vesselId
3. Jeśli empty i state === 'full' → destroyFleet(empireId, fleetId, 'all_vessels_lost')
4. emit empire:fleetDematerialized
```

Algorytm częściowej straty (M1 — tolerujemy asymetrię):
```
1. Jeden vessel wrecked (z 8) → materializedVesselIds.length = 7
2. state pozostaje 'full' (nie cofamy na 'partial')
3. fleet.strength pozostaje 0 — NIE rebuilduje abstraktu. Flota po prostu ma mniej statków.
4. emit empire:fleetMaterializedVesselLost (bez destroy)
```

**Świadoma asymetria M1 (decyzja z Q3, jawnie udokumentowana)**:

To jest **świadoma uproszczona asymetria, nie bug**. Gracz może zauważyć ciekawe zjawisko: "zestrzeliłem połowę zmaterializowanej floty, a strength floty w gameState dalej pokazuje 0 zamiast 50% oryginału". W M1 to nie ma praktycznego znaczenia, ponieważ:
- Flota jest consumowana full on materialize (strength → 0).
- Wszystkie zestrzelone → destroyFleet (prawidłowo).
- Częściowo zestrzelone, reszta dolatuje → bitwa na arrival z okrojoną liczebnością (prawidłowo odwzorowana przez `playerVesselsToBattleUnit`).

**Ograniczenie: retreat zablokowany dla zmaterializowanych flot w M1.**
Retreat mechanic (flota zawraca w trakcie lotu) istnieje tylko dla abstract fleets przez `AlienCivSystem` FSM. Dla floty z `materializationState === 'full'` w M1 **celowo blokujemy retreat** — AlienCivSystem/MilitaryAI nie będzie wywoływać `EmpireRegistry.moveFleet()` na cel powrotny dla takiej floty. Hook:

```js
// W MilitaryAI (albo AlienCivSystem) gdzie podejmowana jest decyzja retreat:
if (fleet.materializationState === 'full') {
  // TODO M2: full reconciliation strength↔vessels — wtedy retreat reactywuje abstract
  //   (vessele wracają do abstrakcyjnej puli strength w homebase). W M1 blokowane
  //   żeby uniknąć bugu "vessele odlatują, strength w tle rośnie z growth, spawn znów".
  return false;
}
```

M2 rozwiąże to przez **bidirectional reconciliation**: dematerializacja przy retreat zwraca strength proporcjonalną do `materializedVesselIds.length × strengthPerVessel`, abstract fleet żyje dalej jak wcześniej.

### 7.4. Kiedy gracz zniszczy vessel — czy fleet się zmniejsza?

Tak — przez `onVesselWrecked` handler. WarSystem powinien też dostać `exhaustion delta` (już istnieje mechanika). Szczegóły tam.

### 7.5. Save/load robustness

**Dangling reference protection**: `EmpireFleetMaterializer.restore()` iteruje floty i odfiltrowuje `materializedVesselIds` które nie istnieją w VesselManager (ten restoruje pierwszy, patrz §5 kolejność restore). Loguje warning. To defensywne, bo vessel mógł się wrecked+cleaned między save i load.

**Kolejność restore w SaveSystem**: najpierw `vesselManager.restore(...)`, potem `empireFleetMaterializer.restore(...)`. Dokumentuje to w pliku.

---

## 8. MovementOrder vs Mission — dokładny boundary

### 8.1. Definicje

- **Mission** (istniejący): "zadanie logistyczne z celem ekonomiczno-eksploracyjnym". Typy: `transport`, `colonize`, `recon`, `foreign_recon`, `interstellar_jump` itd. Żyje dopóki zadanie nie jest skończone (payload dostarczony, kolonia założona, ciało zbadane). Zarządza waypointami, paliwem, CIV_TIME_SCALE.
- **MovementOrder** (nowy): "rozkaz ruchu/pozycji militarnej". Typy: `moveToPoint`, `pursue`, `intercept`, `patrol` (stub), `escort` (stub). Żyje dopóki target się nie zrealizuje lub gracz nie odwoła.

### 8.2. Coexistence reguła

**Aktywny order ma priorytet przed mission w pętli ruchu.**

Konkret:
- Gdy `vessel.movementOrder?.status === 'active'`, MovementOrderSystem **przepisuje** `vessel.mission.targetX/Y/waypoints/arrivalYear` per tick (dla `pursue`/`intercept`).
- Mission nie jest usuwane — jedynie modyfikowane.
- Alternatywa (odrzucona): osobne "ruchowe" pola na vessel poza mission. Odrzucone bo `_updatePositions` już czyta `mission.*` — nieduplikujemy.

### 8.3. Co gdy vessel ma oboje (transport pod atakiem)?

Scenariusz: transport z mission `type='transport'` leci 3 AU po cargo. Gracz wydaje mu order `moveToPoint` żeby uciekł w bezpieczny punkt.

**Reguła**: **mission jest suspendowana**, nie usuwana.
- Przy `issueOrder()`: jeśli vessel ma aktywną mission z `phase ∈ ('outgoing', 'returning')`, ustaw `vessel.mission.suspended = true`, zachowaj `mission.targetId/cargo/phase` na później. MovementOrderSystem pisze nowe `mission.targetX/Y` ale zostawia `mission.suspended=true` jako marker.
- Przy `vessel:orderCompleted`: resume → clear `mission.suspended`, wyznacz nową trasę do oryginalnego mission.targetId (z aktualnej pozycji), kontynuuj.
- Przy `vessel:orderCancelled` (gracz cofnął): j.w. resume.

**Dodatkowe pole**: `mission.suspended: boolean` (default false) — **nie migracja**, bo undefined jest falsy w JS. Legacy mission nie ma — działają jako zawsze `suspended=false`. Bezpieczne.

**Edge case: order wydany podczas `mission.phase === 'returning'`** (Q-A):
- Scenariusz: transport dostarczył cargo, wraca do bazy. Gracz wydaje mu `moveToPoint` do bezpiecznego punktu (np. ucieka przed incomingiem).
- Reguła: `mission.suspended = true` **z dodatkowym snapshotem** `mission.suspendedDuringReturn = true`.
- Po `vessel:orderCompleted` resume: jeśli `suspendedDuringReturn === true`, wznów NA `mission.originId` (dom), nie na `mission.targetId` (cel misji — już odwiedzony). Recompute route `currentPos → originPos`.
- Bez tego marker'a resume leciałby do `targetId` (już załatwionego) → vessel zrobiłby niepotrzebną drugą wizytę.
- Clear `mission.suspendedDuringReturn` razem z `mission.suspended` przy resume.

**Edge case: order wydany gdy vessel już docked**:
- Dla `moveToPoint`: OK, vessel startuje jak nowa misja (launch sequence).
- Dla `pursue`/`intercept`: wymaga wystartowania z dock. Order tworzy implicit launch (ten sam co przy `mission:dispatch`).
- Jeśli `vessel.fuel.current < minimumFuelToReach(target)` → `issueOrder` zwraca `{ ok: false, reason: 'insufficient_fuel' }`, nic nie ustawione. UI pokaże error.

**Edge case: order wydany gdy vessel w `in_transit`**:
- Accept. MovementOrderSystem przepisze `mission.targetX/Y/waypoints` w najbliższym ticku; vessel płynnie skręci (bo interpolacja idzie od `vessel.position` do nowego targetu, nie od `mission.startX`).
- Tech detail: przy recompute trzeba zaktualizować `mission.startX/Y = vessel.position.{x,y}` i `mission.departYear = gameYear` żeby interpolacja nie była liczona od starej pozycji. Konkret dla implementatora.

### 8.4. UI state w FleetManagerOverlay

Co widzi gracz gdy vessel ma `movementOrder`:

| Stan vessel | UI label |
|---|---|
| mission=null, order=null | "Idle" (jak dziś) |
| mission aktywna, order=null | Mission info (jak dziś) |
| mission=null, order=`pursue`/`intercept` | "⚔ Pursuing: <target name>" / "⊕ Intercepting: <target name>" |
| mission aktywna (nie suspended), order=null | Mission (jak dziś) |
| **mission.suspended=true, order aktywny** | **"<order label> (mission paused)"** — dwulinijkowy label |
| order.status='blocked' | "⚠ Order blocked: <reason>" w kolorze ostrzeżenia |

Implementacja w M1 (decyzja z Q5 — rozszerzenie):
- **Read-only label w FleetManagerOverlay prawy panel** (obok istniejącego mission state). Wymagane dla widoczności podczas testów — devtools to za mało feedbacku.
- Format: ikona + label: `"⊕ Intercept: <target name>"`, `"⚔ Pursue: <target name>"`, `"→ MoveTo: (<x>,<y>)"`, `"⚠ Order blocked: <reason>"`.
- Target name resolution: dla vessela — `vessel.name`; dla entity (planeta/księżyc) — `entity.name`; dla pustego punktu — `"(x,y)"`.
- **Zero issue UI w M1** — devtools (`KOSMOS.debug.issueOrder(vesselId, spec)`) jest jedynym wejściem. Right-click context menu, issue buttons per akcja, intercept cone viz → M2.

### 8.5. `moveToPoint` w strefie wykluczenia (decyzja z Q4)

Gracz może kliknąć dowolny `(x,y)` na mapie, w tym na Słońcu, wewnątrz planety lub w strefie wykluczenia.

**Strategia: route around (preferowana nad reject/snap)**:
- `MovementOrderSystem` przy walidacji `moveToPoint` wywołuje `VesselManager._calcRoute(vessel.position, targetPoint)` (istniejący algorytm unikania Słońca i planet).
- Jeśli route zawraca waypointy → order zaakceptowany, vessel omija przeszkody standardowym flow.
- Jeśli `_calcRoute` nie może znaleźć trasy (np. punkt **wewnątrz** strefy wykluczenia Słońca, nie tylko "za nią") → reject: `issueOrder` zwraca `{ ok: false, reason: 'unreachable_target' }`. UI pokaże error "Punkt nieosiągalny".
- Po reject gracz musi kliknąć inny punkt. Nie dorabiamy snap-to-nearest w M1 (decyzja projektowa: nie zgadujemy intencji gracza; pokażemy że to invalid i pozwolimy poprawić).

**Hook na walidację**: `FleetCompositionPolicy` ani MovementOrderSystem nie reimplementują geometrii — reużywamy `VesselManager._calcRoute`. Jeśli w M2 pojawi się potrzeba lepszego pathfindingu (np. omijanie stref wojennych), rozszerzy się `_calcRoute`.

### 8.6. Priorytety anulowania

- Gracz może **anulować order** w każdym momencie przez UI → `MovementOrderSystem.cancelOrder(vesselId, 'player')`.
- **Mission NIE może być usunięte przez order** — order tylko suspenduje. (Jeśli gracz chce porzucić mission, musi wydać `mission:cancel` — istniejąca ścieżka.)
- **Endurance=0 w M1** — emit event, ale **nie anuluje orderu automatycznie**. To jest M2 design decision (pursuit-breaking logic).

---

## 9. Future work hooks

Każda sekcja poniżej to konkretne miejsce w kodzie M1 gdzie zostawimy `// TODO M2:` z nazwą przyszłej funkcji.

### 9.1. Pełna reforma fuel/endurance

Miejsce: `src/entities/Vessel.js` w `createVessel()`.

```js
// TODO M2: getEnduranceDefaults(vessel) → odczytuje z hull.enduranceSpec
//   + modułów (reactor_core, life_support, etc.) Obecnie hardcoded po rolach.
//   Patrz: reforma fuel — "Opcja C: endurance jako generalizacja fuel/crew/power".
const defaults = _getM1EnduranceDefaults(vessel);
```

Miejsce: `VesselManager._tickEndurance`.

```js
// TODO M2: enduranceBlockingPursuit() — gdy endurance<=5 i order.type='pursue',
//   auto-cancel order + force return. Obecnie tylko soft event.
```

### 9.2. Contact state w IntelSystem (M2)

Miejsce: `EmpireFleetMaterializer._onFleetMaterialized`.

```js
// TODO M2: upgrade IntelSystem contact state gdy flota zmaterializowana w sys_home.
//   Teraz: flota abstract → materialize → vessels widoczne. M2: per-vessel identification
//   (rumor/contact/detailed) wymaga dedykowanego sensor scan mechanic.
EventBus.emit('empire:fleetMaterialized', { ... });
```

### 9.3. Prediction cone (M2)

Miejsce: `MovementOrderSystem._computeInterceptPoint`.

```js
// TODO M2: rozszerzyć o prediction cone rendering w ThreeRenderer.
//   Obecnie zwraca punkt deterministyczny; cone reprezentuje niepewność
//   pomiarową (funkcja target.observationQuality z IntelSystem).
function _computeInterceptPoint(pursuer, target) {
  // wariant liniowy (stała velocity) — wystarczy na M1 dla ruchomej planety i vessel'a
  // w transit. Cone przychodzi gdy target manewruje.
}
```

### 9.4. Pursuit endurance-breaking (M2)

Miejsce: `MovementOrderSystem._tickOrder(order)`.

```js
// TODO M2: gdy vessel.endurance.current <= ENDURANCE_BREAK_THRESHOLD (np. 10):
//   - emit vessel:orderBlocked(reason='endurance_exhausted')
//   - force issue nowy orderType='moveToPoint' do home
//   - UI: "crew fatigue forced return"
// W M1 tylko monitoring.
```

### 9.5. POI typy (M2)

Nie wprowadzamy w M1. Placeholder: `MovementOrderTypes.js` zawiera komentarz:

```js
// TODO M2: rozszerzyć ORDER_TYPES o 'goToPOI' — POI (Point of Interest) to nazwana
//   lokacja z typem (anomaly / beacon / station / resource cluster). POI Registry
//   to osobny system M2. Obecnie targetEntityId ogranicza się do vessel + celestial body.
```

### 9.6. Proximity detection (M2)

Nie implementujemy w M1. Miejsce dla hooka: `VesselManager._updatePositions` na końcu pętli.

```js
// TODO M2: spatial hash + proximity scan.
//   for each vessel: sąsiedzi w r=0.5 AU → emit vessel:proximityEnter / proximityExit
//   Budżet: max 100 par / tick (PROXIMITY_BUDGET).
//   M1 pomija — nie ma auto-engagement na zasięg.
```

### 9.7. Vessel-vs-vessel combat trigger (M2)

Miejsce: `MovementOrderSystem._checkOrderCompletion` dla type='pursue'/'intercept'.

```js
// TODO M2: gdy dystans pursuer↔target < THREAT_RADIUS (0.05 AU) i target to wrogi vessel:
//   emit vessel:engageRequested { aggressorId, targetId } → nowy VesselDuelSystem
//   rozstrzyga mini-battle (podobnie jak EnemyAttackHandler ale 1:1).
// W M1 tylko emit orderCompleted — gracz manualnie wydaje attack mission albo
//   EnemyAttackHandler nie odpala bo target to nie planeta.
```

---

## 10. Plan commitów

Każdy commit atomowy, testowalny osobno.

### Commit 1 — Migracja v64→v65 + schema defaults
- `SaveMigration.js`: bump, `_migrateV64toV65`, tests manualny na save'ie v64.
- `Vessel.js`: dodaj pola `velocity`, `endurance`, `movementOrder` w `createVessel()` z defaultami.
- `VesselManager.js` `serialize()/restore()`: nowe pola.
- Test: stary save ładuje się, nowe pola mają sensowne wartości, żaden istniejący system nie crashuje.
- **Ryzyko**: niskie. Wszystkie nowe pola pasywne (nie są konsumowane przez nic).

### Commit 2 — Velocity update w `_updatePositions`
- `VesselManager._updatePositions`: po każdym update'cie pozycji, set `vessel.velocity.vx/vy/updatedYear`.
- Test manualny: vessel w transit → `vessel.velocity` jest niezerowa i proporcjonalna do `speedAU` po konwersji.
- **Ryzyko**: niskie. Czysta kalkulacja, nie modyfikuje pozycji, nie emituje eventów.

### Commit 3 — Endurance ticker
- `VesselManager._tickEndurance`: drain/regen logic. `getEnduranceDefaults()` helper (per rola: warship=2, transport=2, scout=1 baseline; regen=20). Emit `vessel:enduranceLow`/`vessel:enduranceDepleted` z hysteresis (próg low=20, reset=40).
- UI: dodać prostą ikonkę endurance w `FleetManagerOverlay` (może być kolejny pasek obok fuel).
- Test: warship w transit traci endurance ×2/civYear → ~50 civYears do zera. Po dock regen ×20/civYear → ~5 civYears do pełna. Event firing raz per threshold (nie spam).
- **Ryzyko**: średnie. Łatwe przeoczyć hysteresis i spamować event'y — konieczne test na manual run.

### Commit 4 — MovementOrderSystem (scaffold + moveToPoint) + feature flagi
- Nowy plik `MovementOrderSystem.js` z konstruktorem + subskrypcja `time:tick` (synchronous call z VesselManager).
- `GAME_CONFIG.FEATURES.movementOrders = false` (off-by-default) + dev-mode toggle w UI.
- Implementacja tylko `type='moveToPoint'` — reużywa `VesselManager._calcRoute` (route around przez §8.5).
- Read-only label w `FleetManagerOverlay` prawy panel (format z §8.4).
- `MovementOrderTypes.js` z enum i `validateOrder()`.
- Serializacja `movementOrder` w Vessel + graceful degradation po load.
- `GameScene.js`: instancjonowanie lazy (tylko gdy flag on) + pin w `window.KOSMOS.movementOrderSystem`.
- Devtools: `KOSMOS.debug.issueOrder(vesselId, spec)`.
- Test: włącz flag w UI → vessel z movementOrder `moveToPoint` → leci (w tym przez Słońce route-around) → arrive → order completed + label w FleetManagerOverlay widoczny.
- **Ryzyko**: średnie. Scaffold systemu; pierwszy raz gdy mission jest modyfikowane przez zewnętrzny system. Walić na suspended mission (nie w tym commicie).

### Commit 5 — MovementOrder: pursue + intercept
- Rozszerzenie `MovementOrderSystem._tick` o case'y `pursue`/`intercept`.
- `_computeInterceptPoint()` — liniowy.
- `patrol`/`escort` — no-op stub (loguje warning).
- Test: vessel z `pursue` na inny vessel → target się rusza → pursuer cały czas kieruje się na niego. Intercept → dociera szybciej niż pursue (dowód że intercept math działa).
- **Ryzyko**: średnie-wysokie. Intercept math może być buggy przy velocity=0 (stoj target); podział przez zero, NaN. Test edge case'ów.

### Commit 6 — Mission.suspended — koegzystencja z order
- `VesselManager` subskrybuje `vessel:orderIssued`: jeśli vessel ma aktywną mission, ustaw `mission.suspended=true`; jeśli `mission.phase==='returning'`, dodatkowo `mission.suspendedDuringReturn=true`.
- `vessel:orderCompleted`/`cancelled`: resume mission — recompute route; cel zależy od `suspendedDuringReturn` (`originId` vs `targetId`), patrz §8.3.
- UI update w FleetManagerOverlay: label "(mission paused)".
- Test scenariuszowy (tablica):
  - order issued during `phase='outgoing'` → after completed, wraca do oryginalnego targetId.
  - order issued during `phase='returning'` → after completed, leci do originId (nie do targetId).
  - order cancelled mid-flight → resume mission do oryginalnego celu.
  - order issued gdy vessel docked → launch sequence, mission=null więc nic nie suspenduje.
  - order issued gdy vessel in_transit → recompute mission.startX/Y = aktualna pozycja, smooth turn.
- **Ryzyko**: średnie. Najwięcej edge case'ów w tym commicie. Test tablicowy scenariuszy obowiązkowy.

### Commit 7 — EmpireFleetMaterializer (core) + feature flag
- Nowy plik `EmpireFleetMaterializer.js` + `FleetCompositionPolicy.js`.
- `GAME_CONFIG.FEATURES.fleetMaterialization = false` (off-by-default) + dev-mode toggle w UI.
- Capacity constants: `MAX_MATERIALIZE_PER_TICK=2`, `MAX_MATERIALIZED_VESSELS_PER_FLEET=8`, `MAX_TOTAL_MATERIALIZED_VESSELS=40`.
- Hook na `empire:fleetMoved` → delayed materialize gdy `destSystemId === 'sys_home'` + ETA≤2 civYears.
- Reakcja na `vessel:wrecked` → update `materializedVesselIds`, emit proper event, destroyFleet gdy empty.
- EmpireRegistry: pomiń `fleet.materializationState === 'full'` w `_growAll`.
- AlienCivSystem / MilitaryAI: **zablokowanie retreat** dla flot z `materializationState === 'full'` (patrz §7.3). Dodać guard clause.
- Test manualny: włącz flag w UI → debug spawn imperium + flota → sprovokować move do sys_home → sprawdzić że powstają vessele na mapie → zestrzelić → sprawdzić że fleet.strength=0 i `fleetDestroyed` event. Dodatkowo sprawdzić że flota w obcym systemie NIE materializuje się.
- **Ryzyko**: wysokie. Interakcja wielu systemów (WarSystem, EnemyAttackHandler już żyją). Ryzyko double-destroy, dangling references, "AI chciał retreat" corner case. Najwięcej test czasu.

### Commit 8 — Dokumentacja + memory updates
- Update `CLAUDE.md` sekcji "Kluczowe zdarzenia EventBus" o nowe eventy.
- Update `docs/design/milestone-1-targeting-foundation.md` o "implementation notes" (rzeczywistość vs plan).
- Update `memory/MEMORY.md` + `todo-next.md` — oznaczenie Milestone 1 jako done; częściowy mark na todo-next #1 "fleet strength" (M1 dostarczył MVP shadow fleet).
- **Ryzyko**: żadne (dokumentacja).

Całość szacunkowa: **commits 1-3 ~1 dzień**, **commits 4-6 ~2 dni**, **commit 7 ~1 dzień**, **commit 8 ~0.5 dnia** → ~4-5 dni roboczych (to estimate implementation, nie design).

---

## 11. Ryzyka i unknowns

### 11.1. Unknowns (rzeczy do zbadania podczas implementacji)

1. **Jak `_calcRoute()` zachowa się dla intercept point w ruchu**. Funkcja jest dostosowana do statycznych celów (planeta). Gdy target jest vessel-em ruchomym, intercept point zmienia się per tick. Czy recomputacja waypoints per tick jest stabilna (nie skacze zygzakiem), i czy liveOriginX/liveTargetX w `_updateRouteLine` nadążą. Do sprawdzenia empirycznie.
2. **Czy OrbitalSpaceSystem poprawnie obsłuży vessel pozostający orbitującym podczas wydanego orderu**. Jeśli vessel orbituje planetę X i gracz wydaje mu `pursue`, trzeba zwolnić jego orbitę (release w OrbitalSpaceSystem) i przełączyć na `in_transit`. Ten flow jest już obsłużony dla standardowych misji — warto potwierdzić że movementOrder nie obchodzi istniejącej ścieżki `vessel:launched → orbital.releaseOrbit`.
3. **`civDeltaYears` dla endurance** — mechanika militarna biegnie w skali civ (CIV_TIME_SCALE=12). Z `drainPerYear=2` warship zeruje się po ~50 civYears ≈ ~4 s real-time przy 1r/s (patrz §2.2). Balans potwierdzony przez gracza w iteracji; pursuit multiplier dojdzie w M2.

### 11.2. Ryzyka architektoniczne

| Ryzyko | Prawdop. | Skutek | Mitygacja |
|---|---|---|---|
| Materializacja tworzy vessele bez spójnych modułów (FleetCompositionPolicy) → crash w `calcShipStats` | średnie | BŁĄD RUNTIME | M1 policy używa tylko kanonicznych ID; dodać test-wizard na compose → vessel sanity |
| Intercept math NaN przy target.velocity≈0 i pursuer w tej samej pozycji | wysokie | crash lub dziwny ruch | Guard `if (|rel_v| < epsilon) return target position; // degenerate to pursue` |
| Dangling references: `fleet.materializedVesselIds` zawiera ID vessela który został cleaned | średnie | UI pokazuje nieistniejące, count zły | Defensive filter w restore + subskrypcja `vessel:destroyed` |
| `empire:fleetMoved` emitowany dla floty która już została zmaterializowana → podwójny spawn | niskie | dużo duplicate vessels | Cooldown `lastMaterializedAt` + check `materializationState !== 'abstract'` |
| Suspended mission — gracz ręcznie cancel order; mission cannot resume (waypoints stale) | średnie | vessel zostaje w limbo | Przy resume → `_calcRoute(current position → mission.targetId.position)`; reużyj istniejącej logiki; zawsze recompute nie cache |
| Stare save'y v64 — endurance = pełne po load (100) mimo że statek długo leciał. Soft inconsistency. | niskie | gracz dostaje "darmowe" refill | Akceptowalne — jednorazowe przy upgrade. Opcjonalnie: w migracji v64→v65 ustawić endurance=80 dla statków z `status='on_mission'`. Rezygnuję, to edge-tuning. |
| `_tickEndurance` event `vessel:enduranceLow` firing w pętli bo hysteresis źle zaimplementowane | średnie | log spam, event listener burn | Każdy vessel ma flagę `_enduranceLowFired=bool`; reset gdy current ≥ 40% |

### 11.3. Safety nets

**Feature flag** `GAME_CONFIG.FEATURES.movementOrders = false` (dodać w GameConfig.js) — **domyślnie OFF** (decyzja Q6):
- Gdy false: `MovementOrderSystem` nie instancjonuje się w `GameScene.start()`, `issueOrder` devtools zwraca `{ ok: false, reason: 'feature_disabled' }`. System wycofuje się do czystej mission-centric ścieżki.
- Gracz musi jawnie włączyć flagę żeby testować.

**Feature flag** `GAME_CONFIG.FEATURES.fleetMaterialization = false` — **domyślnie OFF** (decyzja Q6):
- Gdy false: `EmpireFleetMaterializer` nie łapie `empire:fleetMoved`. Wrogie floty pozostają abstrakty jak obecnie. Debug `SpawnTestEnemy` wciąż działa (to inna ścieżka — bezpośrednie tworzenie vesseli).
- Pozwala testować incrementally: włącz `fleetMaterialization`, sprawdź spawn; potem włącz `movementOrders`, sprawdź targeting.

**Powód OFF-by-default**: klasyczna higiena — nowe systemy nie modyfikują zachowania istniejących save'ów dopóki świadomie nie włączone. W M1 flagi są emergency killswitch bez konieczności reverta; dopiero po stabilizacji (koniec M1 / początek M2) można rozważyć flip na `true`.

**Dev mode toggle w UI** (decyzja Q6): nowy dev-only przycisk w existing Debug Panel (jeśli istnieje) lub nowa mini-sekcja w `DebugOverlay` z dwoma checkboxami `[ ] Movement orders` / `[ ] Fleet materialization`. Stan flag żyje w `GAME_CONFIG.FEATURES` w runtime (nie persystowany) — po reloadzie wraca do false. Zmiana flagi w locie: `movementOrders` off→on instancjonuje system lazily; on→off usuwa instancję i anuluje wszystkie aktywne ordery z `reason='feature_disabled'`. Dla `fleetMaterialization` off→on zaczyna nasłuchiwać; on→off zostawia istniejące zmaterializowane floty (nie resetuje ich — zbyt ryzykowne w dev session).

**Dev trace toggle**: `KOSMOS.debug.enableTargetingTrace = true` — verbose logging w MovementOrderSystem/EmpireFleetMaterializer. Zostaje jak wcześniej.

**Save backup** — istniejąca infrastruktura migracji już backupuje przed łańcuchem. W przypadku problemu z v65, gracz może ręcznie wrócić do `kosmos_save_backup_v64`.

### 11.4. Co **nie wejdzie** w M1 (i to trzeba powiedzieć jasno)

1. Automatyczny combat vessel↔vessel przy spotkaniu (proximity trigger) — dalej trzeba dotrzeć do planety żeby odpalić bitwę. Pursuit/intercept kończy się emit'em `orderCompleted` ale **nie strzela**.
2. UI intercept cone visualization.
3. Automatyczne rozkazy AI (wróg gonić gracza) — MilitaryAI dalej operuje na poziomie abstract fleets. Shadow fleet materialization to tylko wizualizacja + target vessel-level.
4. POI registry.
5. Battle groups (per todo-next #2) — pozostaje jak jest (gracz zaznacza pojedyńczo).
6. Pełna reforma fuel/endurance — endurance to dorzucony stub.

---

## Appendix A — Mapa plików

```
src/
  entities/
    Vessel.js                           [MOD] nowe pola velocity/endurance/movementOrder
  systems/
    VesselManager.js                    [MOD] _tickEndurance, velocity update, serialize
    SaveMigration.js                    [MOD] bump do 65, _migrateV64toV65
    MovementOrderSystem.js              [NEW] resolver orderów
    EmpireFleetMaterializer.js          [NEW] materializacja flot
    EmpireRegistry.js                   [MOD] spawnFleet defaults, growth skip gdy materialized
  data/
    MovementOrderTypes.js               [NEW] enum + validateOrder
    FleetCompositionPolicy.js           [NEW] strength → vessel composer
  config/
    GameConfig.js                       [MOD] FEATURES flagi
  scenes/
    GameScene.js                        [MOD] init + pin w window.KOSMOS
  ui/
    FleetManagerOverlay.js              [MOD] read-only label MovementOrder + dev-mode toggle flag
  debug/
    SpawnTestEnemy.js                   [MOD opcjonalny] testFleet spawn
docs/design/
  milestone-1-targeting-foundation.md   [NEW — ten plik]
```

## Appendix B — Rozwiązane decyzje (finalizacja iteracji)

Wszystkie pytania zamknięte w iteracji #2:

| # | Pytanie | Decyzja | Referencja w docu |
|---|---|---|---|
| Q1 | Endurance tick rate | `drainPerYear=2` dla warship, `=1` dla scout, baseline only w M1. Pursuit multiplier M2. | §2.2 |
| Q2 | Materializacja trigger | Tylko `destSystemId === 'sys_home'` w M1. TODO hook na extension. | §7.1 |
| Q3 | Asymetria strat | Akceptowana jako świadoma, udokumentowana jawnie. Retreat zablokowany dla zmaterializowanych w M1. | §7.3 |
| Q4 | `moveToPoint` w pustej przestrzeni | Dowolny (x,y); route around via `_calcRoute`; reject tylko gdy matematycznie nieosiągalne. | §8.5 |
| Q5 | UI orderów | Devtools + read-only label w FleetManagerOverlay. Zero issue UI. | §8.4, §4.2 |
| Q6 | Feature flagi | OFF-by-default (oba). Dev-mode toggle w UI (checkboxy). | §11.3 |
| Q-A | `mission.suspended` edge cases | Marker `suspendedDuringReturn`; resume na `originId` gdy było w returning phase. Dodatkowe edge cases udokumentowane. | §8.3 |
| Q-B | MovementOrder serializacja | TAK, serializowane (deep-copy jak mission). Graceful degradation na missing target (cancel + event, nie crash). | §2.3 |
| Q-C | Cap materializacji | `MAX_MATERIALIZED_VESSELS_PER_FLEET=8` + `MAX_TOTAL_MATERIALIZED_VESSELS=40` (soft global, odracza nowe). | §7.2, §6.1 |

---

*Koniec dokumentu. Design zatwierdzony do implementacji po final approve.*

---

## Appendix C — Implementation notes (post-commit)

Rzeczywistość vs plan — rzeczy odkryte w trakcie kodowania. Aktualizowane
po każdym commicie M1.

### Commit 1 — schema + migracja v64→v65

Bez niespodzianek. Wzorzec `_migrateV63toV64` był czystym przewodnikiem.

### Commit 2 — velocity update

Subtelność: `VesselManager._tick` przyjmuje parametr nazwany `deltaYears`, ale
z EventBus dostaje `civDeltaYears` (linia 71-72). Formuła
`(delta_px / AU_TO_PX) / deltaYears` działa poprawnie w civ-scale — zgodnie z
§6.2, velocity jest w AU/civYear.

### Commit 3 — endurance ticker

Hook `window.KOSMOS?.movementOrderSystem?._tick?.(deltaYears)` w
`VesselManager._tick` został dodany proaktywnie w tym commicie (no-op dopóki
system nie zostanie zainicjalizowany w Commit 4). Zamiast modyfikować pętlę
`_tick` dwa razy, wstawiono jeden trwały hook.

### Commit 4 — MovementOrderSystem scaffold

**Odchylenie od doca**: §11.3 mówił "nowa mini-sekcja w DebugOverlay z
checkboxami". Sprawdzone: ani `DebugOverlay` ani `DebugPanel` nie istnieją w
projekcie. **Decyzja**: feature flag realizowany przez devtools (`KOSMOS.debug.enableMovementOrders()` /
`disableMovementOrders()`) zamiast UI checkbox. Spójne z istniejącym wzorcem
`KOSMOS.debug.enableTargetingTrace`. TODO na przyszłość: stworzyć DebugOverlay
jako dedykowany panel.

Debug commands dodane w `GameScene.js`: `enableMovementOrders`, `disableMovementOrders`,
`issueOrder`, `cancelOrder`, `listOrders`.

### Commit 5 — pursue + intercept

**Bug znaleziony w trakcie**: proximity tail-chase. Sprawdzałem dystans tylko
PRZED ruchem — gdy pursuer catch-rate matchował target step dokładnie, pursuer
nigdy nie wchodził poniżej `THREAT_RADIUS_PX`. Fix: check dystans też PO ruchu
w `_moveTowardsAndMaybeComplete`.

**Architektura skip**: `VesselManager._updatePositions` skipuje interpolację
gdy `movementOrder.type ∈ ('pursue','intercept')` — MOS ma pełną kontrolę nad
pozycją i velocity. Istotne żeby `_updatePositions` nie zerował velocity dla
tych vessels (zrobiłby konflikt z MOS-set velocity).

**Jednostki velocity**: `target.velocity` w AU/civYear (Commit 2), konwersja do
px/gameYear w `_computeInterceptPoint` to `× AU_TO_PX × CIV_TIME_SCALE`.

### Commit 6 — mission.suspended koegzystencja

**Zmiana vs plan**: design doc §8.3 mówił o mutacji `mission.suspended=true` w
miejscu. W praktyce MOS nadpisuje `vessel.mission` (synthMission dla
moveToPoint), więc live flag znikałby. **Rozwiązanie**: marker = istnienie
`vessel._suspendedMission` (deep-copy snapshot). UI sprawdza `_suspendedMission`
zamiast `mission.suspended`.

`vessel._suspendedMission` serializowane/restore'owane w VesselManager — save
podczas aktywnego orderu nie gubi kontekstu resume.

Resume używa przybliżonego distance estimate (aktualna pos → current target
pos) do obliczenia arrivalYear, potem `_predictPosition` Keplera dla
waypoints. Spójne z wzorcem `dispatchOnMission`.

### Commit 7 — EmpireFleetMaterializer

**Odchylenie od doca §7.2**: Design doc wspominał `weapon_railgun` — **ten
moduł nie istnieje** w `ShipModulesData.js` (są: laser/kinetic/missile).
W `FleetCompositionPolicy` uproszczono do `modules: []` (bazowe statystyki
kadłuba wystarczą w M1). Doprecyzowanie w M2.

**Odchylenie od doca §7.3**: Design doc mówił o skipowaniu
`fleet.materializationState === 'full'` w `EmpireRegistry._growAll`. Sprawdzone:
`_growAll` **nie inkrementuje fleet.strength**, tylko `empire.military.power`.
Guard nie jest potrzebny aktualnie — zostawiono TODO gdy fleet-level growth
zostanie dodane.

**Retreat block**: zaimplementowane w `MilitaryAI.js` w `defend_home` action —
filter `f.materializationState !== 'full'` na `awayFleets`. Attack_player nie
wymaga guard (filter `!f.destSystemId` odfiltrowuje zmaterializowane floty
z ustawionym destSystemId).

Debug commands: `enableFleetMaterialization`, `disableFleetMaterialization`,
`materializeFleet(empireId, fleetId)` (force bypass ETA/trigger).

### Commit 8 — docs

CLAUDE.md rozszerzony o 9 nowych eventów M1. Ten appendix + memory update.

