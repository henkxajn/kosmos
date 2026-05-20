# Plan implementacji: Player Fleet Groups (Opcja C — Fleet Hub)

Status: zatwierdzony do implementacji (2026-05-20).
Save target: v72.
Trzy etapy (P1 Foundation, P2 Orders, P3 Doctrine), każdy z własnym tagiem + smoke testem.

---

## 1. Cele i zakres

Gracz może grupować statki w nazwane floty i wydawać im rozkazy zbiorczo.
Floty są **logicznymi grupami z doktryną i dispatcherem rozkazów**, nie nowymi
statkami z własną pozycją/HP. Pozycja floty = centroid członków. Status =
agregat statusów członków.

### Co dostaje gracz
- Tworzenie/usuwanie/zmiana nazwy floty
- Przypisywanie statków do floty (multi-select w FleetManagerOverlay)
- 1 doktryna na flotę (4 typy: engage_in_range / kite / hold_position / retreat_at_50)
- Rozkazy flotowe: Move / Pursue / Engage / Return to base
- Synchronizacja: dla `moveToPoint` wszyscy lądują w tej samej chwili (sync ETA);
  dla `pursue/engage` clamp do min(memberSpeeds)
- Auto-retreat całej floty przy 50% aggregate HP (doktryna)

### Czego NIE dostaje (świadome wykluczenia)
- Formacji geometrycznych (offsety członków względem flagowca — to Opcja B)
- Flagowca/hierarchii (śmierć flagowca = degradacja grupy)
- Hotkeyów Ctrl+1..9 (control groups) — odłożone
- Wizualnego clustra na mapie 3D (label/lines w centroidzie) — opcjonalny stretch
- Fleet templates (presety składów)
- Per-fleet shared cargo pool
- POI Rally jako fleet target (rally pozostaje per-vessel)
- Unifikacji z `empire.fleets` (refactor enemy fleets do tej samej encji) —
  osobny milestone w przyszłości

---

## 2. Decyzje architektoniczne (cementing)

### 2.1 Źródło prawdy o członkostwie
- **Authoritative:** `Fleet.memberIds[]` (serializowane w save)
- **Reactive in-memory:** `vessel.fleetId` (odbudowywane przy restore z member list)
- Wszystkie mutacje przez `FleetSystem.addMember/removeMember` — aktualizują OBA atomowo

### 2.2 Fleet order = N MOS orderów z tagiem
Rozkaz flotowy NIE jest nowym typem orderu nad MOS. To pętla:
```
for memberId in fleet.memberIds:
  MOS.issueOrder(memberId, applyDoctrine(spec), { fromFleet: fleetId })
```
MOS pozostaje single source of truth dla per-vessel movement. Fleet tylko orchestruje.

### 2.3 Synchronizacja prędkości — dwa tryby

| Order type | Mechanizm | Zachowanie |
|---|---|---|
| `moveToPoint` | **Sync ETA** (arrival time matching) | Wszyscy lądują w tej samej chwili. Najwolniejszy leci na max, szybsi spowolnieni. |
| `pursue`, `intercept`, `engage` | **Speed cap** clamp do `min(memberSpeeds)` | Szybsi nie wyprzedzają wolnych, ale jeśli startowali rozproszeni, tak zostają. |
| `return_to_base` | jak `moveToPoint` (sync ETA) | Wszyscy razem przy bazie |

**Algorytm Sync ETA (moveToPoint):**
```
distance_i = |target - pos_i|             // per member
native_eta_i = distance_i / v_max_i
fleet_eta = max(native_eta_i)
spec_i._arrivalSyncYear = currentYear + fleet_eta
// MOS _tick:
remaining_time = _arrivalSyncYear - currentYear
v_eff_i = min(v_max_i, remaining_distance_i / remaining_time)
```
Self-correcting: jeśli statek spowolniony (np. omijanie strefy Słońca),
formuła automatycznie podnosi v_eff (klampowane do v_max). Jeśli nie zdąży —
flag `lagging` w UI.

### 2.4 Doktryna — gdzie się objawia

| Doktryna | Gdzie sprawdzana | Co robi |
|---|---|---|
| `engage_in_range` (default) | `applyDoctrine(spec)` przy issue | Pass-through, vanilla |
| `kite` | `applyDoctrine(spec)` przy issue | Dla `engage` ustawia `spec.preferMaxRange=true` → MOS `_tickEngageOrder` używa max weapon range zamiast optimal |
| `hold_position` | `applyDoctrine(spec)` przy issue | REJECT dla pursue/intercept/engage z reason='doctrine_hold_position'. moveToPoint OK. Vessel dalej broni się reaktywnie (DSCS auto-engage on proximity normalnie) |
| `retreat_at_50` | `FleetSystem._tickCivYears` | Co 0.5 civYear: agreguj HP, gdy `aggregateHp/aggregateMaxHp < 0.5` → issue moveToPoint do najbliższej friendly planet dla każdego żywego membera |

**Nie zmieniamy DSCS team-up logic** — pozostaje by `ownerEmpireId`. Doktryna
kształtuje rozkazy wejściowe, nie matematykę walki.

### 2.5 Auto-cleanup
- Hook `vessel:wrecked` w FleetSystem → `removeMember`
- Jeśli fleet.memberIds.length === 0 i `autoDisbandWhenEmpty === true` (default
  i jedyne ustawienie wg decyzji gracza) → `disbandFleet`

### 2.6 Edge cases (zebrane decyzje)

| Sytuacja | Zachowanie |
|---|---|
| Vessel docked w trakcie fleet move issue | MOS undockuje normalnie; sync ETA liczy `distance_i` od pozycji docked (orbita planety) |
| Player issues per-vessel order na fleet member | MOS replace'uje order; UI oznacza membera badge `diverged`; fleet.activeOrder pomija tego membera w trackingu |
| Mixed states przy fleet issue (część docked, część w transit) | Per-vessel; rejected reasons agregowane; toast `Fleet Alpha: 3/5 issued, 2 rejected` |
| Engage bez weapons | Per-vessel reject `no_weapons`; reszta floty engaguje |
| Remove member w trakcie active order | vessel.movementOrder pozostaje (decoupled); fleet.activeOrder.memberOrderIds traci entry |
| Save w trakcie active order | activeOrder.memberOrderIds serializowane; po restore odtworzone z vessel.movementOrder.orderId |
| Add member w trakcie active order | Nowy member NIE dziedziczy active order (konserwatywnie); UI informuje |
| Fleet pusty po disband flag | autoDisbandWhenEmpty=true → fleet usunięty, `fleet:disbanded` emit |
| Vessel cross-system (out of sys_home) | Fleet membership persists; fleet order range-checked per-vessel; out-of-range rejected |

---

## 3. Data model

### 3.1 Fleet entity (`src/entities/Fleet.js`)
```js
{
  id: 'fleet_001',
  name: 'Strike Alpha',
  doctrine: 'engage_in_range',  // FLEET_DOCTRINES enum
  memberIds: ['v_001', 'v_002', 'v_003'],
  activeOrder: null | {
    type: 'moveToPoint' | 'pursue' | ... ,
    targetId: string | null,
    targetPoint: {x, y} | null,
    issuedYear: number,
    arrivalSyncYear: number | null,
    speedCapAU: number | null,
    memberOrderIds: { 'v_001': 'order_42', ... },
    _retreatTriggered: false,  // dla retreat_at_50
    _inCombat: false,           // updated by combat hooks
  },
  createdYear: number,
  autoDisbandWhenEmpty: true,  // const, decyzja gracza
}
```

### 3.2 Vessel addition
```js
v.fleetId = null  // lazy default; set/cleared przez FleetSystem
```

### 3.3 GameState / save root
```js
data.c4x.playerFleets = {
  fleets: [Fleet, ...],
  nextId: number,
}
data.c4x.uiPrefs.selectedFleetId = null
```

### 3.4 FleetDoctrines (`src/data/FleetDoctrines.js`)
```js
export const FLEET_DOCTRINES = {
  ENGAGE_IN_RANGE: 'engage_in_range',
  KITE: 'kite',
  HOLD_POSITION: 'hold_position',
  RETREAT_AT_50: 'retreat_at_50',
};
export const DEFAULT_DOCTRINE = FLEET_DOCTRINES.ENGAGE_IN_RANGE;
```

---

## 4. Save migration (v71 → v72)

Centralna `_migrateV71toV72` w `SaveMigration.js`:
```js
- data.c4x.playerFleets ??= { fleets: [], nextId: 1 }
- per vessel: v.fleetId ??= null
- data.c4x.uiPrefs.selectedFleetId ??= null
- backup → kosmos_save_backup_v71
```

**Restore order w `GameScene._restoreSystem`:**
1. VesselManager.restore (vessels z `fleetId`)
2. MovementOrderSystem.restore (re-index existing orders)
3. **FleetSystem.restore** — czyta `playerFleets.fleets`, walidacja:
   - Każdy memberId istnieje w VesselManager? Nie → orphan, drop z memberIds
   - Każdy activeOrder.memberOrderIds[vesselId] = istniejący orderId w MOS? Nie → drop entry
   - Ustaw `vessel.fleetId = fleet.id` per member
4. SaveSystem._serializeCiv4x dodaje `fleetSystem.serialize()`

---

## 5. ETAP P1 — Foundation (CRUD + UI + save)

**Cel:** gracz może utworzyć/nazwać/usunąć flotę, dodać/usunąć statki, zobaczyć
skład w UI. Save round-trip działa. Brak rozkazów flotowych jeszcze.

### Pliki nowe
- `src/data/FleetDoctrines.js`
- `src/entities/Fleet.js` — factory + serializer
- `src/systems/FleetSystem.js` — CRUD API + subskrypcja vessel:wrecked

### Pliki modyfikowane
- `src/entities/Vessel.js` — pole `fleetId: null` w factory + serializer
- `src/systems/SaveMigration.js` — `_migrateV71toV72`
- `src/scenes/GameScene.js` — instancjacja FleetSystem, restore order, `window.KOSMOS.fleetSystem`
- `src/systems/SaveSystem.js` — serializuj fleetSystem w `_serializeCiv4x`
- `src/config/GameConfig.js` — `FEATURES.playerFleets = false` (flip ON na końcu P1 c5)
- `src/ui/FleetManagerOverlay.js` — nowa zakładka „Floty":
  - lista flot (name + member count + doctrine badge)
  - przyciski: Nowa flota (modal nazwy) / Zmień nazwę / Rozwiąż (confirm)
  - klik fleet → detail panel: lista members, dropdown doctrine (zapis-only w P1), „Dodaj statek"
- Zakładka „Statki" w FleetManagerOverlay: multi-select checkbox + dropdown „Przypisz do floty"
- `src/data/i18n/pl.js` + `en.js` — ~30 stringów (fleet_*, doctrine_*, modale)
- `src/utils/DebugLog.js` calls
- `KOSMOS.debug.{createFleet, addToFleet, listFleets, dumpFleet}`

### API FleetSystem (P1)
```js
createFleet(name) → fleet
disbandFleet(id) → bool
setName(id, name) → bool
setDoctrine(id, doctrine) → bool
addMember(fleetId, vesselId) → { ok, reason? }
removeMember(vesselId) → bool
getFleet(id) → fleet | null
listFleets() → fleet[]
getVesselFleet(vesselId) → fleet | null
serialize() / restore(data, vesselManager)
```

### Events
- `fleet:created { fleet }`
- `fleet:disbanded { fleetId, reason }` (reason: 'manual' | 'empty')
- `fleet:memberAdded { fleetId, vesselId }`
- `fleet:memberRemoved { fleetId, vesselId, reason }` (reason: 'manual' | 'wrecked' | 'transferred')
- `fleet:renamed { fleetId, oldName, newName }`
- `fleet:doctrineChanged { fleetId, oldDoctrine, newDoctrine }`

### Smoke test `tmp_fleet_p1_smoke.mjs` (~15-20 asercji)
- create + listFleets contains
- addMember → vessel.fleetId set + fleet.memberIds zawiera
- removeMember → oba wyczyszczone
- duplicate addMember → idempotent (no-op lub jasny error)
- vessel:wrecked → auto-remove + empty fleet auto-disband
- serialize → restore: vessel.fleetId + memberIds odtworzone identycznie
- rename, setDoctrine round-trip
- disbandFleet z 3 members → wszystkim vessel.fleetId=null

### Commits (5)
1. `feat(fleet): FleetSystem core + Fleet entity + FleetDoctrines`
2. `feat(fleet): SaveMigration v71→v72 + serialize/restore`
3. `feat(fleet): FleetManagerOverlay — Fleets tab CRUD UI`
4. `feat(fleet): vessel multi-select + assign to fleet from Vessels tab`
5. `feat(fleet): i18n + debug helpers + smoke test + flip FEATURES.playerFleets ON`

### Tag: `fleet-p1-complete`

**Punkt kontrolny:** floty się tworzą, statki przypisują, save działa. Statki
nadal latają osobno.

---

## 6. ETAP P2 — Orders (dispatch + sync ETA + speed cap)

**Cel:** rozkaz „Move / Pursue / Engage / Return" wydany do floty fan-outuje do
members przez MOS. Sync ETA dla moveToPoint (wszyscy lądują razem). Speed cap
dla pursue/engage. Agregowane raportowanie wyników.

### Pliki modyfikowane

**`src/systems/MovementOrderSystem.js`:**
- `issueOrder(vesselId, spec, opts?)` — `opts.fromFleet` tag (informacyjny)
- Nowe pola w `spec`:
  - `_speedCapAU` (number) — clamp v_eff do tej wartości w `_tick`
  - `_arrivalSyncYear` (number) — dla moveToPoint, używane do liczenia
    `v_eff = remaining_distance / (syncYear - currentYear)`, klampowane do v_max
  - `preferMaxRange` (boolean) — dla engage, `_tickEngageOrder` używa max weapon range zamiast optimal
- W `_tick`: jeśli `_arrivalSyncYear` set → liczy v_eff per remaining_time;
  jeśli tylko `_speedCapAU` → klampuje stałą wartością;
  oba mechanizmy współistnieją (sync ETA ma priorytet)
- Event `vessel:orderIssued` payload dodaje `fromFleet` jeśli był

**`src/systems/FleetSystem.js`** — dodać:
- `issueFleetOrder(fleetId, spec) → { ok, accepted: [], rejected: [], orderId }`
  - applyDoctrine(spec) → możliwie zmodyfikowany spec (w P2: pass-through, P3 wypełnia)
  - **Compute sync ETA dla moveToPoint:**
    - `distance_i = euclidean(vessel_i.pos, target)` per member
    - `native_eta_i = distance_i / vessel_i.maxSpeedAU`
    - `fleet_eta = max(native_eta_i)`
    - dla każdego members: `spec_i._arrivalSyncYear = currentYear + fleet_eta`
  - **Compute speed cap dla pursue/intercept/engage:**
    - `spec._speedCapAU = min(memberSpeeds wśród in_transit-able)`
  - dla każdego memberId: MOS.issueOrder(memberId, spec_i, { fromFleet: fleetId })
  - agreguj: accepted/rejected; ustaw fleet.activeOrder z memberOrderIds
  - emit `fleet:orderIssued { fleetId, type, accepted, rejected, fleetEta? }`
- `cancelFleetOrder(fleetId, reason)` — cancel per-member; clear activeOrder
- Subskrypcja `vessel:orderCompleted/Cancelled/Blocked`:
  - znajdź fleet posiadającą ten orderId; usuń z `memberOrderIds`
  - jeśli `memberOrderIds` pusty → emit `fleet:orderCompleted`, clear activeOrder

**`src/ui/FleetManagerOverlay.js`** — fleet detail panel:
- Przyciski rozkazów: Move to (entry mode wyboru punktu na mapie 3D — reuse
  OrderDispatcher pattern) / Engage (target picker z PPM lub listy) / Return to
  base (auto-target nearest friendly planet) / Cancel order
- Status floty: state ('idle'/'moving'/'engaging'/'mixed'/'diverged') wyliczany
  z member states
- Lista members z badge `[fleet order]` lub `[own order]` (diverged) lub `[lagging]`
  (jeśli `vessel.pos` daleko od expected)

**`src/ui/RightClickMenuOptions.js`** — gdy selectedFleet (nowy tryb selekcji):
- enemy vessel/planet → opcja `Engage (Fleet Alpha)` / `Move (Fleet Alpha)`
- pusty kosmos → `Move here (Fleet Alpha)`
- friendly planet → `Return to base (Fleet Alpha)`

**`src/scenes/UIManager.js`** — EventLog + selection state:
- Nowy tryb selekcji `selectedFleetId` (obok `selectedVesselId`); FleetManagerOverlay
  to ustawia
- `fleet:orderIssued` → log entry: `Fleet Alpha → moveTo (5/5 issued)` lub
  `(3/5 issued, 2 rejected: no_weapons)`
- `fleet:orderCompleted` → log entry
- `fleet:retreatTriggered` (P3) → log + auto-slow

**`KOSMOS.debug`** — `issueFleetOrder(fleetId, spec)`, `dumpFleetStatus(fleetId)`,
`simulateFleetMove(fleetId, x, y)`

### Smoke test `tmp_fleet_p2_smoke.mjs` (~25 asercji)
- issueFleetOrder moveToPoint: każdy member ma vessel.movementOrder + `_arrivalSyncYear` set
- Sync ETA test: 2 vessele z różnych pozycji (dist 5 AU vs 10 AU) + różne maxSpeed (1 vs 2 AU/yr); po 1 civYear pozycje na trajektorii zgodne z fleet_eta = 5y (najszybszy z fast vessel 10 AU/2 = 5y; slow vessel 5 AU/1 = 5y); oba arrive at year 5
- Sync ETA self-correction: vessel temporarily slowed (force v=0.5 mid-flight) → MOS recompute v_eff = remaining_d / remaining_time; klampuje do v_max
- pursue speed cap: 3 vessele z maxSpeed 1/2/3 → wszystkie effective 1 AU/yr
- engage `preferMaxRange=true` → MOS `_tickEngageOrder` używa max weapon range
- Mixed states: 2 docked + 3 in-flight → rejected list 2-elementowa (docked nie może engage bez undock — albo undock counts as in-transit-able? — sprawdzić w impl)
- engage bez weapons → rejected `no_weapons` per vessel
- removeMember w trakcie active order → vessel.movementOrder pozostaje; fleet.activeOrder.memberOrderIds traci entry
- player override (manual issueOrder per vessel) na member → diverged badge; fleet.activeOrder pomija tego membera
- fleet:orderCompleted po ostatnim member done
- cancelFleetOrder → wszyscy members vessel.movementOrder.status='cancelled'
- save/restore w trakcie active order: activeOrder odtworzony z istniejących orderId w MOS

### Commits (5)
1. `feat(fleet): MOS _arrivalSyncYear + _speedCapAU + preferMaxRange support`
2. `feat(fleet): FleetSystem.issueFleetOrder + sync ETA / speed cap dispatch`
3. `feat(fleet): FleetManagerOverlay order buttons + fleet status panel`
4. `feat(fleet): RightClickMenuOptions fleet-context entries + selectedFleetId`
5. `feat(fleet): EventLog + UIManager integration + smoke test`

### Tag: `fleet-p2-complete`

**Punkt kontrolny:** wybierasz flotę, klikasz „Move here" PPM na mapie, wszyscy
lecą synchronicznie i lądują w tej samej chwili. Raport w EventLog.

---

## 7. ETAP P3 — Doctrine (emergent combat behavior)

**Cel:** doktryna realnie wpływa na zachowanie. 4 typy działają end-to-end.
Auto-retreat fleet-wide przy 50% aggregate HP.

### Pliki modyfikowane

**`src/systems/FleetSystem.js`** — wypełnij `applyDoctrine(fleet, spec)`:
- `engage_in_range`: pass-through
- `kite`: jeśli spec.type === 'engage' → `spec.preferMaxRange = true`
- `hold_position`: jeśli spec.type ∈ ('pursue', 'intercept', 'engage') →
  return `{ rejected: true, reason: 'doctrine_hold_position' }`
- `retreat_at_50`: pass-through (flag, nie zmienia spec)

Dodać `_tickCivYears(civDy)` (subscribe `time:civTick`):
- accumulator co 0.5 civYear
- per fleet z `doctrine === 'retreat_at_50'` i `activeOrder._inCombat === true`
  i `!activeOrder._retreatTriggered`:
  - `aggregateHp = sum(member.hp for alive)`
  - `aggregateMaxHp = sum(member.hp_max for alive)`
  - jeśli `aggregateHp / aggregateMaxHp < 0.5`:
    - mark `_retreatTriggered = true`
    - dla każdego żywego membera:
      - `target = AutoRetreatSystem._findNearestFriendlyPlanet(vessel)` (refactor do exported helper)
      - `MOS.issueOrder(memberId, { type: 'moveToPoint', target, bypassFuelCheck: true }, { fromFleet: fleetId })`
    - emit `fleet:retreatTriggered { fleetId, aggregateHpPct, memberCount }`

Hook na `vessel:proximityEnter` dla aktualizacji `_inCombat`:
- jeśli member fleet z activeOrder → mark `activeOrder._inCombat = true`
- na `vessel:proximityExit` → check czy wszyscy members poza combat range → clear

Hook na `vessel:hpChanged` (lub poll w `_tickCivYears` jeśli event nie istnieje —
sprawdzić podczas impl):
- triggeruje recalc aggregate HP dla retreat_at_50

**`src/systems/AutoRetreatSystem.js`** — extract `_findNearestFriendlyPlanet`
do exported helper (lub do `src/utils/RetreatUtils.js`); FleetSystem reuse.

**`src/ui/FleetManagerOverlay.js`** — doctrine dropdown aktywny (nie zapis-only);
tooltip per opcja wyjaśnia mechanikę:
- engage_in_range: „Standardowo — strzelają gdy w zasięgu"
- kite: „Trzymają max dystans (engage z preferencją max range)"
- hold_position: „Nie ścigają wroga, ale bronią się reaktywnie"
- retreat_at_50: „Auto-wycofanie do bazy przy 50% aggregate HP"

**`src/data/i18n/pl.js` + `en.js`** — opisy doktryn + log strings:
- `fleet_retreat_triggered_pl: 'Flota {name} wycofuje się ({hp}% aggregate HP)'`
- `doctrine_hold_position_reject_pl: 'Doktryna Hold Position blokuje atakujące rozkazy'`

**`src/scenes/UIManager.js`** — `fleet:retreatTriggered`:
- log entry z LOG_COLORS.combat
- auto-slow reuse (jak `vessel:enduranceLow`)

### Smoke test `tmp_fleet_p3_smoke.mjs` (~20 asercji)
- doctrine setDoctrine round-trip + serialize
- `engage_in_range` baseline (vanilla preserved)
- `kite`: issueFleetOrder engage → każdy member spec.preferMaxRange === true
- `hold_position`: issueFleetOrder pursue → all rejected `doctrine_hold_position`
- `hold_position`: issueFleetOrder moveToPoint → OK (defense-only)
- `hold_position`: proximity attack na membera → DSCS engage normalnie (auto-defense działa)
- `retreat_at_50`: simulate 3 vessels w combat, manual damage do 49% aggregate
  → tick → fleet:retreatTriggered emit
- `retreat_at_50`: każdy żywy member dostaje moveToPoint do nearest friendly planet (przez findNearestFriendlyPlanet)
- `retreat_at_50` idempotent: drugi tick poniżej 50% nie wyzwala ponownie (`_retreatTriggered` flag)
- Po retreat: aggregateHp regen >50% nie resetuje flagi w current order; nowy order = reset

### Commits (5)
1. `feat(fleet): applyDoctrine — kite + hold_position rejects`
2. `feat(fleet): retreat_at_50 tick + aggregate HP + reuse findNearestFriendlyPlanet`
3. `feat(fleet): doctrine dropdown active + tooltips i18n`
4. `feat(fleet): UIManager log + auto-slow for retreatTriggered`
5. `feat(fleet): doctrine smoke test + CLAUDE.md/MEMORY.md update`

### Tag: `fleet-p3-complete`

**Punkt kontrolny:** doktryny mają mierzalny wpływ; flota z `retreat_at_50` sama
się wycofuje gdy traci pojedynki.

---

## 8. Testing strategy

### Per-stage smoke (offline, headless)
- `tmp_fleet_p1_smoke.mjs` — CRUD + save round-trip
- `tmp_fleet_p2_smoke.mjs` — order dispatch + sync ETA + speed cap
- `tmp_fleet_p3_smoke.mjs` — doctrine effects + retreat

### Per-stage regression
- Po P1: `tmp_m4_p3_smoke.mjs` + `tmp_m4_p2_smoke.mjs` PASS (no break w combat)
- Po P2: jak wyżej + sprawdzenie że MOS pojedyncze rozkazy graczowi działają jak dawniej
- Po P3: jak wyżej + retreat_at_50 nie koliduje z player manual retreat order

### Manual playtest checklist (per stage)
- P1: utworz flotę z 3 statków, save+load, zmień nazwę, rozwiąż, vessel destruction → auto-remove
- P2: fleet move z 3 koloniami startowymi → wszyscy lądują w tej samej chwili;
  fleet engage na wroga → wszyscy strzelają; cancel order → wszyscy cancel
- P3: fleet retreat_at_50 → załatw walkę gdzie traci HP, sprawdź auto-wycofanie;
  fleet kite vs zwykła engage → różne kiting behavior

---

## 9. Pytania do gracza — ROZSTRZYGNIĘTE (2026-05-20)

1. **Klawisz skrótu:** brak — dostęp tylko przez FleetManagerOverlay (F)
2. **autoDisbandWhenEmpty:** true (const, nie konfigurowalne per fleet)
3. **Multi-doctrine na flocie:** nie — max 1 doktryna
4. **Feature flag:** `FEATURES.playerFleets` flip ON na końcu P1 c5 (po smoke teście)
5. **Plan saved:** `docs/plan-fleet-groups.md` (ten plik)
6. **Sync prędkości:** Sync ETA dla moveToPoint (wszyscy lądują razem),
   speed cap dla pursue/engage (kompromis ze względu na ruchomy cel)

---

## 10. Ryzyka i mitygacja

| Ryzyko | Prawdopodobieństwo | Mitygacja |
|---|---|---|
| MOS `_arrivalSyncYear` matematyka edge case (vessel = 0 distance from target) | Średnie | Guard `if (distance < EPS) → instant arrive`; smoke test |
| Sync ETA klampowany do v_max gdy fleet_eta tooshort | Niskie | Sanity check w issueFleetOrder: fleet_eta >= max(native_eta) by construction; nie powinno wystąpić |
| `hold_position` blokuje gracza w niepotrzebnych sytuacjach (np. retaliation pursue) | Średnie | UI ostrzega: „Doktryna blokuje pursue — zmień doktrynę przed atakiem" |
| `retreat_at_50` triggeruje gdy fleet jest passive (nie w combat) | Niskie | Wymóg `activeOrder._inCombat === true` przed triggerem |
| Save migration psuje istniejące zapisy | Niskie | Backup `kosmos_save_backup_v71`; lazy defaults wszystkie nullable |
| Diverged badge UI clutter gdy gracz dużo modyfikuje per-vessel | Niskie | Tooltip wyjaśnia; nie blokuje gameplay |
| Sync ETA przy bardzo długich misjach (>50 civYears) → numerical drift | Niskie | civYear floating point precision OK do 1000+ years; brak akcji |
| Empire fleets (AI) ignorują player fleet abstraction | – | Out of scope; AI dalej używa empire.fleets osobno |

---

## 11. Po P3 (potencjalne P4+)

- Visual cluster label/lines na mapie 3D (centroid + connection lines gdy zoom < threshold)
- Hotkey Ctrl+1..9 control groups (selectedFleetId quick-switch)
- Fleet templates (zapisane presety składów per nazwa)
- POI rally jako fleet target (rally point assignment do floty zamiast per-vessel)
- Unification z empire.fleets (refactor enemy fleets do tej samej Fleet entity)
- Per-fleet shared cargo pool (auto-redistribute między members)
- Fleet auto-formation (light geometry, opt-in — częściowy ukłon w stronę Opcji B)
- AI doctrine auto-tuning (NotificationCenter sugeruje zmianę doktryny po porażce)
