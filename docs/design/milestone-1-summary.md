# Milestone 1 — Targeting Foundation: kompleksowe podsumowanie

Status: **ukończony 2026-04-23** (save version 65).
Powiązane dokumenty:
- `docs/design/milestone-1-targeting-foundation.md` — pełny design doc + Appendix C implementation notes
- `memory/milestone-1-targeting.md` — skrócone memory dla przyszłych sesji
- `memory/todo-next.md` — roadmap po M1

---

## 1. Streszczenie — co dostarczono

Milestone 1 dodaje **warstwę targetowania statków** równoległą do istniejących misji (transport/recon/colonize). Dwie duże mechaniki + supporting changes:

1. **MovementOrder system** — rozkazy ruchu militarnego (moveToPoint / pursue / intercept / patrol / escort). Oddzielny od misji logistycznych.
2. **Shadow fleet materialization** — wrogie floty AI były abstraktami (`fleet.strength: number`); teraz gdy flota zbliża się do gracza, materializuje się do konkretnych `Vessel` instancji na mapie.
3. **Endurance** — stamina operacyjna statku, stub pod reformę fuel/crew/power w M2.
4. **Velocity tracking** — wektor prędkości per-vessel (derived), potrzebny do intercept math.

Wszystko **OFF by default** za feature flagami — nie psuje istniejącej rozgrywki do czasu ręcznego włączenia.

---

## 2. Co dokładnie zrobione (mapa per-system)

### 2.1. Schema danych (nowe pola)

**`vessel` (w `src/entities/Vessel.js`)**:
```js
velocity:       { vx, vy, updatedYear }       // AU/civYear, derived — NIE serializowane
endurance:      { current, max, drainPerYear, regenPerYear, lastDepleted }
movementOrder:  null | {id, type, targetEntityId, targetPoint, status, ...}
_suspendedMission: undefined | deep-copy oryginalnej mission (marker "mission paused")
```

**`fleet` w `gameState.empires.<id>.fleets[]`**:
```js
materializedVesselIds: []           // ID vesseli z VesselManager
materializationState:  'abstract' | 'full'
lastMaterializedAt:    gameYear | null
```

**Save version**: `64 → 65`, migracja `_migrateV64toV65` (centralna w `SaveMigration.js`).
- Vessel bez `endurance` → defaults `{current:100, max:100, lastDepleted:null}`
- Vessel bez `movementOrder` → `null`
- Fleet bez nowych pól → `[]`, `'abstract'`, `null`
- `velocity` nie migrowane (derived; resync w pierwszym `_updatePositions`)

### 2.2. Systemy (nowe)

**`MovementOrderSystem`** (`src/systems/MovementOrderSystem.js` — 384 linii):
- API: `issueOrder(vesselId, spec)`, `cancelOrder(vesselId, reason)`, `getOrder(vesselId)`, `listActive()`, `destroy()`
- Tick synchronicznie wywoływany z `VesselManager._tick` (przed `_updatePositions`)
- Typ `moveToPoint`: pełny (route-around Słońca, fuel gatekeeping, mission-based interpolation)
- Typy `pursue`/`intercept`: pełne, MOS zarządza pozycją bezpośrednio (`_updatePositions` skipuje interpolację)
- `_computeInterceptPoint`: linear intercept math z `target.velocity`, fallback na pursue gdy brak rozwiązania (target szybszy / stacjonarny / degenerate)
- Typy `patrol`/`escort`: no-op stub (M2)
- Proximity check przed i po ruchu dla pursue/intercept (krytyczne dla tail-chase)
- Graceful degradation po restore: orderów z missing target są cancellowane z `blockReason='target_lost_on_load'`

**`EmpireFleetMaterializer`** (`src/systems/EmpireFleetMaterializer.js` — 227 linii):
- API: `materializeFleet(empireId, fleetId)`, `dematerializeFleet(...)`, `destroy()`
- Handlery: `empire:fleetMoved` (trigger), `vessel:wrecked` (cleanup), `time:tick` (budget loop)
- Trigger: `destSystemId === 'sys_home'` AND `etaYear - gameYear ≤ 2 civYears`
- Budżet: `MAX_MATERIALIZE_PER_TICK=2`, `MAX_TOTAL_MATERIALIZED_VESSELS=40` (soft cap odracza)
- Full consumption: `fleet.strength=0` po materializacji (§7.3)
- Rebuild `_totalMaterialized` po load (soft cap correctness)

**`FleetCompositionPolicy`** (`src/data/FleetCompositionPolicy.js` — 84 linii, czysta funkcja bez stanu):
- `composeFromStrength(strength, empire)` → `[{hullId, modules, role}]`
- `count = clamp(2, floor(strength/50), 8)` — cap per-flota
- Mix per archetyp: hegemon/xenophage (warship-heavy), isolationist, trader (cargo+scout), swarm (scout-heavy), default
- Mapowanie rola → hullId: warship→`hull_frigate`, transport→`hull_large`, scout→`hull_small`, cargo→`hull_medium`
- W M1 `modules: []` — bazowe statystyki kadłuba (weapon_railgun z design doca nie istnieje w ShipModulesData)

**`MovementOrderTypes`** (`src/data/MovementOrderTypes.js` — 57 linii):
- `ORDER_TYPES` enum (Object.freeze)
- `validateOrder(spec)` → `{valid, reason?}` — 6 przypadków walidacji per typ

### 2.3. Systemy zmodyfikowane

**`VesselManager`** (`src/systems/VesselManager.js`):
- `_tick` dispatch'uje: `_tickEndurance` + `movementOrderSystem._tick` (synchr.) + `_updatePositions`
- `_tickEndurance(civDy)` — drain gdy `in_transit`, regen gdy `docked`, neutral `orbiting`. Hysteresis (`_enduranceLowFired`), events `vessel:enduranceLow`/`enduranceDepleted`
- `_updatePositions` — skip interpolation dla vessel z pursue/intercept order (MOS rządzi pozycją), velocity update post-move via `_updateVelocityFromDelta`
- `_resumeMissionAfterOrder(vesselId)` — subskrybuje `vessel:orderCompleted`/`orderCancelled`, recompute route od aktualnej pozycji do mission.targetId (outgoing) lub originId (returning)
- serialize/restore: `endurance`, `movementOrder`, `_suspendedMission` (deep copy z waypoints)
- `velocity` nie serializowane — derived

**`SaveMigration`** (`src/systems/SaveMigration.js`):
- Bump `CURRENT_VERSION: 64 → 65`
- `_migrateV64toV65` w mapie MIGRATIONS

**`GameScene`** (`src/scenes/GameScene.js`):
- Import `MovementOrderSystem`, `EmpireFleetMaterializer`
- Lazy init helpers: `_ensureMovementOrderSystem`/`_disable...`, `_ensureEmpireFleetMaterializer`/`_disable...`
- Pin w `window.KOSMOS.movementOrderSystem` i `empireFleetMaterializer` (null gdy OFF)
- 8 nowych debug commands (patrz sekcja 2.5)

**`MilitaryAI`** (`src/systems/ai/MilitaryAI.js`):
- `defend_home` filtruje `f.materializationState !== 'full'` (retreat blocked dla zmaterializowanych flot)

**`FleetManagerOverlay`** (`src/ui/FleetManagerOverlay.js`):
- Pasek endurance pod paskiem fuel (kolor wg %, success/warning/danger)
- `_drawMovementOrderLabel` — read-only label w prawym panelu: `→ MoveTo: (x,y)`, `⚔ Pursue: <name>`, `⊕ Intercept: <name>`, `⚠ Order blocked: <reason>`, dopisek `(mission paused)` gdy `_suspendedMission`

**`i18n`** (`src/i18n/pl.js`, `en.js`):
- Nowy klucz `fleet.labelEndurance` (WYTRZYMAŁOŚĆ / ENDURANCE)

**`GameConfig`** (`src/config/GameConfig.js`):
- Sekcja `GAME_CONFIG.FEATURES = { movementOrders, fleetMaterialization }` — OFF by default

### 2.4. EventBus — nowe eventy (9)

Zarejestrowane w `CLAUDE.md`:
- `vessel:orderIssued { vesselId, order }`
- `vessel:orderCompleted { vesselId, orderId, type, completedYear }`
- `vessel:orderCancelled { vesselId, orderId, reason }`
- `vessel:orderBlocked { vesselId, orderId, reason }` (`target_lost`/`out_of_range`/`endurance_zero`)
- `vessel:enduranceLow { vesselId, endurance }` (hysteresis)
- `vessel:enduranceDepleted { vesselId }`
- `empire:fleetMaterialized { empireId, fleetId, vesselIds, strengthConsumed }`
- `empire:fleetDematerialized { empireId, fleetId, reason }`
- `empire:fleetMaterializedVesselLost { empireId, fleetId, vesselId, remainingStrength }`

### 2.5. Devtools (konsola)

8 nowych komend w `window.KOSMOS.debug`:
```
enableMovementOrders()                   // włącz MOS (lazy init)
disableMovementOrders()                  // wyłącz + cancel active orders
issueOrder(vesselId, spec)               // ręczne wydanie orderu
cancelOrder(vesselId)                    // anuluj aktywny
listOrders()                             // console.table aktywnych
enableFleetMaterialization()             // włącz EFM
disableFleetMaterialization()            // wyłącz (istniejące floty zostają)
materializeFleet(empireId, fleetId)      // force bypass ETA trigger
```

---

## 3. Co nie zrobione (świadomie zostawione na M2+)

### 3.1. Zapisane w design docu §9 (future work hooks z `// TODO M2:`)

Wszystkie te hooki są w kodzie jako komentarze — punkty wejścia dla M2:

1. **Pełna reforma fuel/endurance** — endurance w M1 to stub z hardcoded drain=2 (warship) / 1 (scout). M2: `getEnduranceDefaults(vessel)` odczytuje z `hull.enduranceSpec` + modułów (reactor_core, life_support).
2. **Pursuit endurance-breaking** — w M1 gdy `endurance.current=0` tylko event, brak konsekwencji. M2: auto-cancel pursuit order + force return home.
3. **Pursuit drain multiplier** — design doc §2.2 zapowiadał `drainMultiplier ×3-4` gdy `order.type ∈ (pursue/intercept)`. W M1 tylko baseline.
4. **Contact state w IntelSystem** — materialized vessels są widoczne na mapie, ale bez per-vessel identification (`rumor/contact/detailed`). Wymaga dedykowanego sensor scan mechanic.
5. **Prediction cone visualization** — `_computeInterceptPoint` zwraca punkt deterministyczny. M2: cone reprezentujący niepewność pomiarową (zależność od `target.observationQuality` z IntelSystem).
6. **POI registry** — Points of Interest (anomaly/beacon/station/resource cluster) jako nazwane lokacje. Placeholder w `MovementOrderTypes.js`: `TODO M2: ORDER_TYPES.goToPOI`.
7. **Proximity detection** — `vessel:proximityEnter/Exit` dla auto-engagement. Budżet: max 100 par/tick (spatial hash). W M1 completnie pominięte.
8. **Vessel-vs-vessel combat trigger** — obecnie pursue completion emit `vessel:orderCompleted` ale NIE strzela. M2: emit `vessel:engageRequested` → `VesselDuelSystem` (mini-battle 1:1).

### 3.2. Asymetrie i uproszczenia (świadome, udokumentowane)

**Shadow fleet asymmetry (§7.3)**:
- Obecnie `fleet.strength=0` po full materialization (pełne konsumpcja)
- Częściowa utrata vesseli (np. 4 z 8 zestrzelone) → strength pozostaje 0, nie rebuilduje abstraktu
- Konsekwencja: gdy gracz zestrzeli 4 statki a 4 dolecą, bitwa jest na 4 vesselach (poprawnie), ale `fleet.strength` dalej pokazuje 0 zamiast 50% oryginału

**Retreat block dla materialized flot (§7.3)**:
- `MilitaryAI.defend_home` filtruje `materializationState !== 'full'`
- Konsekwencja: zmaterializowana flota raz zostaje konkretem — nie wraca do abstraktu nawet gdy AI chce retreat
- M2: **bidirectional reconciliation** — dematerializacja przy retreat zwraca strength proporcjonalną do pozostałych vesseli

**Materializacja tylko dla `sys_home` (§7.1)**:
- Flota lecąca do kolonii-zamorskiej gracza NIE jest materializowana (pozostaje abstract)
- Flota w obcym systemie (IDLE empire) niewidoczna jako konkret — galaktyka pokazuje ikonkę strength
- Hook na rozszerzenie: `EmpireFleetMaterializer._shouldMaterialize(fleet)` z komentarzem `// TODO M2: rozszerzyć warunek`

**Dev-mode UI (§11.3)**:
- Design doc zakładał checkboxy w DebugOverlay — **ten panel nie istnieje** w projekcie
- Zastąpione przez devtools console (`KOSMOS.debug.enable...`)
- TODO: stworzyć DebugOverlay jako dedykowany panel (osobna inwestycja ~1-2h)

**UI issue orderów — ZERO w M1 (§4.2, §8.4)**:
- Label movementOrder jest **read-only** w FleetManagerOverlay
- Jedyne wejście: devtools `KOSMOS.debug.issueOrder(vesselId, spec)`
- Brak: right-click context menu na mapie, buttons "Attack" / "Intercept" / "MoveTo" w fleet panel, intercept cone viz, selekcja celu myszką

**`FleetCompositionPolicy` uproszczenie**:
- W M1 `modules: []` — vessele materializowane bez wyposażenia
- Bazowe statystyki kadłuba wystarczą do M1 (hull_frigate/hull_large/hull_small/hull_medium)
- M2: pełne mix modułów per archetyp (weapon + engine + defense + sensor)

### 3.3. Co opisuje design doc §11.4 jako "NIE wejdzie w M1" (jasne czerwone linie)

1. Automatyczny combat vessel↔vessel przy spotkaniu (proximity trigger)
2. UI intercept cone visualization
3. Automatyczne rozkazy AI (wróg gonić gracza) — MilitaryAI operuje wyłącznie na abstract fleets
4. POI registry
5. Battle groups (todo-next #2)
6. Pełna reforma fuel/endurance

---

## 4. Co powinno być zrobione (odchylenia i dług techniczny)

### 4.1. Odchylenia implementacyjne od design doca

**`weapon_railgun` nie istnieje** (§7.2 design doc vs reality):
- Design doc wspominał `weapon_railgun` jako moduł dla warship mix
- W `ShipModulesData.js` są tylko: weapon_laser, weapon_kinetic, weapon_missile
- **Rozwiązanie M1**: `modules: []` w FleetCompositionPolicy — kadłuby bez broni
- **Wymagane w M2**: doprecyzować mix modułów, użyć istniejących ID (weapon_kinetic / weapon_missile dla warship)

**`EmpireRegistry._growAll` nie inkrementuje `fleet.strength`** (§7.3 vs reality):
- Design doc zakładał że growth w tle zwiększa strength zmaterializowanej floty i mówił o guardzie
- W rzeczywistości `_growAll` zwiększa tylko `empire.military.power` (globalny metric)
- **Rozwiązanie M1**: guard w `_growAll` pominięty (nic nie robi)
- **Wymagane w M2**: gdy dojdzie fleet-level growth, dodać `if (fleet.materializationState === 'full') continue;`

**`DebugOverlay` nie istnieje** (§11.3 vs reality):
- Design doc mówił "nowa mini-sekcja w DebugOverlay z checkboxami"
- **Rozwiązanie M1**: devtools console
- **Wymagane w przyszłości**: stworzyć `src/ui/DebugOverlay.js` jako dedykowany panel (hotkey + canvas draw + hit zones). Nie blocker M1, ale wartościowy QoL do testowania feature flag.

**`mission.suspended` flag vs `_suspendedMission` marker** (§8.3 decyzja zmieniona):
- Design doc §8.3 mówił o mutacji `vessel.mission.suspended=true` w miejscu
- W praktyce MOS nadpisuje `vessel.mission` (synthMission dla moveToPoint) → live flag znikałby
- **Rozwiązanie M1**: marker = istnienie `vessel._suspendedMission` (deep-copy snapshot)
- UI sprawdza `vessel._suspendedMission` zamiast `vessel.mission.suspended`
- **Stan obecny spójny** — nie wymaga naprawy, ale warto zauważyć w M2 że design doc mówił co innego

### 4.2. Znane luki (dług techniczny do M2)

**Resume mission approximation**:
- `_resumeMissionAfterOrder` używa prostego distance estimate (aktualna pos → current target pos) dla `arrivalYear`
- Potem `_predictPosition` Keplera dla waypoints. Mały chicken-and-egg — predict wymaga arrivalYear, arrivalYear wymaga predict
- W praktyce wystarczy (vessel dojedzie iteracyjnie), ale nie jest to optymalne
- **TODO M2**: iterative predict (2-3 iteracje dla stabilności przy ruchomych planetach)

**Mission resume w stan returning**:
- `mission.phase='returning'` + order + completed → recompute route do `originId`
- Flaga `suspendedDuringReturn` jest w snapshocie — czyta się przy resume
- **Problem**: `m.returnWaypoints` / `m.returnStartX` itp. są teraz rebudowane; oryginalne dane powrotu (sprzed orderu) tracone
- Dla M1 akceptowalne — route zostanie przekalkulowana od nowej pozycji
- **TODO M2**: verify tego flow w prawdziwym save/load scenariuszu (smoke testy M1 testowały suspend ale nie pełen resume→arrive)

**`_updatePositions` skip dla pursue/intercept**:
- Branch `if (isOrderControlled) { moving.push(vessel); continue; }` (Commit 5)
- Konsekwencja: pozycja zarządzana wyłącznie przez MOS, ale inne rzeczy które robi `_updatePositions` (np. proximity triggers w M2, route line updates) też są pomijane
- **TODO M2**: gdy przyjdzie proximity detection, wyciągnąć ją przed branch skip, albo przenieść ruch pursue/intercept do `_updatePositions`

**Brak materializacji dla flot wracających do home-empire**:
- `EmpireFleetMaterializer._onFleetMoved` filtruje `destSystemId === 'sys_home'`
- Flota wracająca z sys_home → sys_home_empire (po przegranej bitwie) nie jest materialized
- Ale jeśli była już materialized, jej `materializationState='full'` — `destroyFleet` przy stracie vesseli ok
- Edge case: flota zmaterializowana w sys_home, potem AI chce retreat — blocked. Vessele dryfują. Unclear lifecycle.
- **TODO M2**: verify lifecycle w scenariuszach (a) zmaterializowana flota wygrywa, (b) przegrywa całkowicie, (c) przegrywa częściowo — co się dzieje z nią dalej?

**Velocity serialization**:
- Commit 2 decyzja: nie serializujemy velocity (derived state)
- Pierwszy tick po load ma `velocity=0`
- Dla pursue/intercept (bazującego na velocity do intercept math) może to być problem jeśli gracz zapisze w trakcie aktywnego intercept z ruchomym celem
- Stan M1: `_computeInterceptPoint` z `target.velocity={vx:0,vy:0}` → fallback do pursue (target pos). Akceptowalne jedna klatka.
- **TODO M2**: monitor czy to realnie boli w practice

### 4.3. Testy nieukończone (ważne przed szerszym użyciem)

M1 ma smoke testy per-commit (wszystkie zielone w izolacji), ale **brak integracji end-to-end**:

1. ❌ Test scenariuszowy **w pełnym grze** — rozpoczęcie save v64, load → migrate v65 → `enableMovementOrders` → `issueOrder` → zobaczenie ruchu na mapie 3D. Nie testowane w przeglądarce.
2. ❌ Test save/load round-trip w środku aktywnego pursue — serialize z `_suspendedMission`, load, weryfikacja że resume działa.
3. ❌ Test UI label renderowania w FleetManagerOverlay — czy format jest czytelny, czy "(mission paused)" się mieści.
4. ❌ Test pasek endurance w UI — czy kolor się zmienia, czy wartości się aktualizują.
5. ❌ Test EmpireFleetMaterializer z **prawdziwym ThreeRenderer** — czy sprite wrogich statków się pojawia na mapie (pattern z `SpawnTestEnemy` używany — powinno działać, ale nie testowane przed-to-end).
6. ❌ Performance — przy `MAX_TOTAL_MATERIALIZED_VESSELS=40` + `_updatePositions` O(n) + skip branch dla pursue. Nie mierzone pod obciążeniem.

**To nie są failure'y**, ale **luki weryfikacyjne** — blokada na "M1 z full confidence ON by default".

---

## 5. Roadmap — co dalej (sugerowana kolejność)

### Priorytet A — Stabilizacja M1 (1-2 sesje, przed włączeniem on by default)

1. **Uruchomić grę, enable feature flags, smoke-test end-to-end** — ~2h
   - Nowa gra → enableMovementOrders → issueOrder moveToPoint → weryfikacja ruchu
   - Spawn enemy (`SpawnTestEnemy`) → issueOrder pursue na niego → weryfikacja tail-chase + completion
   - Save w trakcie orderu → load → weryfikacja resume
2. **Naprawić odkryte bugi** — ~2-4h w zależności od skali
3. **DebugOverlay** (nowy plik `src/ui/DebugOverlay.js`) — checkbox toggle dla feature flag, QoL — ~2h

### Priorytet B — M2 critical path (największy dług)

Trzy rzeczy które w naturalny sposób rozszerzają M1:

4. **UI issue orderów** (§4.2, §8.4 design M1 mówił "Zero issue UI w M1") — ~6-10h
   - Right-click context menu na vessel (pursue/intercept/moveTo)
   - Buttons w FleetManagerOverlay
   - Click-on-map dla moveToPoint target point picker
   - Bez tego M1 jest użyteczne tylko z devtools

5. **Proximity detection + auto-engagement** (§9.6, §9.7) — ~8-12h
   - Spatial hash dla O(n) scan zamiast O(n²)
   - Budżet `PROXIMITY_BUDGET=100 par/tick`
   - Events `vessel:proximityEnter/Exit`
   - VesselDuelSystem — mini-battle 1:1 przy proximity z wrogą jednostką
   - Bez tego pursue completion jest pusta (dociera, nie strzela)

6. **Pursuit endurance-breaking + drain multiplier** (§9.1, §9.4) — ~3-5h
   - `drainMultiplier ×3-4` dla pursue/intercept
   - Gdy `endurance.current ≤ threshold` → force cancel order + return home
   - UI: "crew fatigue forced return"

### Priorytet C — M2 nice-to-have

7. **Bidirectional reconciliation fleet abstract↔concrete** — ~4-6h
   - Retreat zmaterializowanej floty: dematerializacja zwraca strength
   - Abstract fleet żyje dalej

8. **Materializacja dla więcej systemów** (kolonie gracza, sensor coverage) — ~3-5h

9. **Full module mix w FleetCompositionPolicy** — ~2-4h
   - Weapon + engine + defense per archetyp
   - Tech level scaling (tech=1 → basic, tech=5 → advanced modules)

10. **Contact state w IntelSystem** — ~10-15h (większa inwestycja)
   - Per-vessel rumor/contact/detailed
   - Sensor scan mechanic
   - Integracja z materializacją (flota in sys_home → instant contact)

### Priorytet D — spoza M1 (z todo-next.md)

11. **Battle groups** (ground + space) — ~8-15h
12. **Karta jednostki (unit card)** — ~4-8h
13. **Pełna reforma fuel/endurance** (endurance wymienia fuel jako single stat) — ~15-25h

---

## 6. Stan plików (inwentarz)

### Nowe pliki (4)
```
src/data/MovementOrderTypes.js             57 linii
src/data/FleetCompositionPolicy.js         84 linii
src/systems/MovementOrderSystem.js        384 linii
src/systems/EmpireFleetMaterializer.js    227 linii
```

### Zmodyfikowane pliki (11)
```
src/config/GameConfig.js                   +10 linii (FEATURES section)
src/entities/Vessel.js                     +76 linii (endurance helper + 3 pola w createVessel)
src/systems/SaveMigration.js               +45 linii (bump + _migrateV64toV65)
src/systems/VesselManager.js              +200 linii (endurance, velocity, _resumeMission, skip branch, serialize)
src/systems/ai/MilitaryAI.js                +8 linii (retreat block guard)
src/scenes/GameScene.js                    +87 linii (lazy init + 8 debug commands)
src/ui/FleetManagerOverlay.js              +90 linii (pasek endurance + label movementOrder)
src/i18n/pl.js                              +1 linia (fleet.labelEndurance)
src/i18n/en.js                              +1 linia (fleet.labelEndurance)
CLAUDE.md                                  +10 linii (9 nowych eventów)
docs/design/milestone-1-targeting-foundation.md  +90 linii (Appendix C)
```

### Memory
```
memory/milestone-1-targeting.md            (nowy, 95 linii)
memory/MEMORY.md                           (update save version, referencja)
memory/todo-next.md                        (update status #1 — MVP dostarczony)
```

---

## 7. Feature flagi — stan

```js
GAME_CONFIG.FEATURES = {
  movementOrders:       false,  // OFF — wymaga KOSMOS.debug.enableMovementOrders()
  fleetMaterialization: false,  // OFF — wymaga KOSMOS.debug.enableFleetMaterialization()
};
```

**Gdy OFF**: zero wpływu na istniejące save'y. MovementOrderSystem i EmpireFleetMaterializer nie są instancjonowane. VesselManager widzi `window.KOSMOS.movementOrderSystem?._tick` jako undefined i pomija. Subskrybenty bez systemu to no-op.

**Gdy ON**: pełne M1 capabilities. Brak mechanizmu "gradual rollout" — wszystko włączone lub wszystko wyłączone.

---

## 8. Kluczowe referencje (do nawigacji)

| Temat | Lokalizacja |
|---|---|
| Pełny design M1 | `docs/design/milestone-1-targeting-foundation.md` |
| Implementation notes (rzeczywistość vs plan) | tamże, Appendix C |
| Memory scrap M1 | `memory/milestone-1-targeting.md` |
| Eventy M1 | `CLAUDE.md` sekcja "Kluczowe zdarzenia EventBus" |
| Debug commands | `src/scenes/GameScene.js`, szukaj `M1 Targeting` |
| Save migration v64→v65 | `src/systems/SaveMigration.js`, funkcja `_migrateV64toV65` |
| Velocity math | `src/systems/VesselManager.js`, `_updateVelocityFromDelta` |
| Endurance tick | `src/systems/VesselManager.js`, `_tickEndurance` |
| Intercept math | `src/systems/MovementOrderSystem.js`, `_computeInterceptPoint` |
| Fleet composition | `src/data/FleetCompositionPolicy.js`, `composeFromStrength` |
| Retreat block | `src/systems/ai/MilitaryAI.js`, `defend_home` action |
| UI label orderu | `src/ui/FleetManagerOverlay.js`, `_drawMovementOrderLabel` |

---

*Koniec. Dokument może zostać rozszerzony o wyniki testów end-to-end gdy zostaną przeprowadzone (Priorytet A powyżej).*
