# Milestone 3: Runtime systems + Full UI

**Status:** design doc draft
**Predecessor:** `m2b-complete` (commit po `m2b-commit-7-complete` + post-fix POI_SPRITE_SIZE=8)
**Save target:** v68 (jeśli Picket/rally/ambush runtime dodaje state, ale prawdopodobnie nie potrzebne — schema już w v67 z C1)
**Estimated effort:** 6-8 sesji Claude Code + 1-2 sesje playtest. Łącznie ~10-12 atomic commitów.

---

## §0. Cel M3

M2b dostarczyło **runtime + data layer** (intel, prediction cone, POI CRUD, 3 nowe order types). Ale **całość była dostępna tylko przez `KOSMOS.debug.*`** w konsoli. Gracz nie miał UI do wydawania rozkazów ani interakcji z POI.

M3 dostarcza:

1. **Pełny UI dla wydawania rozkazów** — right-click context menu na mapie taktycznej, kontekst-aware (target type określa dostępne opcje), selection model "lewy klik FleetOverlay → prawy klik mapy"
2. **Pełny UI dla POI** — tooltip on hover, right-click menu, panel listy w sidebar (sortable, filter), edit modal, create POI mode
3. **Tooltips dla wszystkich entities** — vessels, planets, POI (ujednolicone)
4. **Picket/rally/ambush runtime** — 3 typy POI z M2b dostają faktyczne behaviors (alert/tracker/hidden trigger)
5. **EventLog UX polish** — channel filter UI, brakujące handlery (`vessel:orderBlocked`, `poi:vesselReached`)

Po M3 gracz może grać KOSMOS **w pełni przez UI** bez devtools. Devtools zostają jako alternatywa power-user / scripting / testowanie.

---

## §0.5. Lessons from M2b (L1-L14 dziedziczone)

M2b zostawił 14 lekcji. Wszystkie applicable dla M3, najważniejsze:

- **L1** — real-flow ≠ smoke. UI work ma jeszcze trudniejszą weryfikację offline (DOM events, mouse handlers nie testowalne w Node). Visual review per-commit krytyczny.
- **L2** — `initSubdomain()` dla każdej nowej domeny gameState. M3 może potrzebować `gameState.ui` (selection state, panel toggles) — wtedy stosować pattern.
- **L8** — KOSMOS jest 3D scene XZ plane. UI nie zmienia tego, ale picker mode (klik mapy → world coords) wymaga raycaster (precedens C7 sprite userData).
- **L11** — nowa domena gameState wymaga TRZECH bootstrap points (createDefaultState defaults + migration + initSubdomain). Jeśli M3 dodaje persistent UI state.
- **L13** — console scoping w real-flow. UI sesja będzie miała mniej console-driven verifications, więcej click-based, więc L13 mniej krytyczne.

**Nowa lekcja przewidywana dla M3 (L15):** UI state vs gameState boundary. Selection (który vessel jest currently zaznaczony) NIE idzie do gameState (efemeryczne, nie wymaga persistence). Ale visibility panels (panel listy POI otwarty/zamknięty per user preference) MOŻE iść do `gameState.ui` jeśli chcemy persistence między save/load. Decyzja per panel.

---

## §1. Weryfikacja kontekstu

### Stan KOSMOS po M2b

**Działające systemy:**
- ProximitySystem dual-threshold (C0)
- IntelSystem.vessels z degradation ticker (C2)
- PredictionCone math + rendering (C3+C4)
- POIRegistry z 5 typami POI + CRUD + cancel-dangling (C5)
- MOS order types: moveToPoint, pursue, intercept, patrol, escort, goToPOI (M1 + C6 + C7)
- POI sprites na mapie 3D z symbolami per typ (C7)
- Devtools API: `KOSMOS.debug.{createPOI,listPOIs,deletePOI,issueOrder,issueGoToPOI,issuePatrol,issueEscort}`

**Istniejące UI (z M1/M2a):**
- FleetManagerOverlay (panel po lewej z listą vesseli + filter)
- TacticalMap (3D scene z vesselami, planetami, POI sprites)
- EventLogSystem (panel po prawej z historią events, channel field istnieje ale brak filter UI)
- HUD top bar (czas, pause/play, FPS)

**Brakujące UI (target M3):**
- Right-click context menu na mapie
- Tooltip on hover dla vessels/planets/POI
- Panel listy POI w sidebar
- Edit modal POI
- Create POI mode
- Cancel order button w FleetOverlay
- EventLog channel filter UI

### Existing UI infrastructure do reuse

W planie sprawdzić w plan mode:

- **OverlayManager** (precedens M1) — czy ma generic API do otwierania paneli/modals?
- **UIManager** (precedens M1) — czy zarządza global UI state?
- **THEME** stałe (kolory, fonty) — używane już w FleetManagerOverlay z C6 (`THEME.accent`, `THEME.danger`, etc.)
- **safe(handler)** wrapper z ThreeRenderer (event subscriptions defensive)
- **`window.KOSMOS?.X`** lookup pattern dla cross-system communication

Na pewno reuse'ujemy: THEME, EventBus, safe wrapper, ThreeRenderer raycaster (dla mouse → world coords)

---

## §2. Schema danych

### 2.1. UI state (efemeryczne, brak persistence)

```js
// Nie w gameState. Module-level w UIManager lub class field.
ui = {
  selectedVesselId: string | null,    // currently selected vessel (lewy klik)
  contextMenuOpen: boolean,           // right-click menu visibility
  contextMenuTarget: {                // co kliknięto prawym
    type: 'vessel' | 'poi' | 'planet' | 'empty',
    entityId: string | null,
    worldPoint: {x, y} | null,        // dla 'empty' / planet click
    screenPoint: {x, y},              // do pozycjonowania menu
  } | null,
  tooltipVisible: boolean,
  tooltipTarget: {type, entityId, screenPoint} | null,
  pickerMode: null | 'targetEntity' | 'targetPoint' | 'patrolWaypoints',  // np. wybieranie targetu po wybraniu "pursue" z menu
  pickerCallback: function | null,    // co zrobić po wybraniu targetu
  panels: {
    poiListOpen: false,
    eventLogChannelFilters: { fleet: true, intel: true, combat: true, poi: true },
  },
}
```

### 2.2. POI panel state (jeśli persistence wymagane)

```js
// gameState.ui (NEW domain, jeśli persistence)
ui: {
  poiPanel: {
    isOpen: boolean,
    sortBy: 'name' | 'type' | 'createdYear',
    sortDir: 'asc' | 'desc',
    filterType: 'all' | POI_TYPES[i],
    filterOwner: 'all' | empireId,
  },
  eventLogChannelFilters: { fleet, intel, combat, poi: boolean }
}
```

**Decyzja w plan mode:** czy panel state idzie do gameState (persistence) czy zostaje efemerycznie (zniknie po reload). Preferencja: **efemerycznie** — panel state to user preference per session, nie game state. Jeśli po feedback'cie graczy chcą persistence → M4 dodaje.

### 2.3. Picket/rally/ambush state extensions

```js
// gameState.pois.poi_X (existing schema z C5, dodajemy runtime fields)

// Picket — alert tracking:
poi.lastAlertYear: number | null,        // gdy ostatni raz triggered
poi.alertCount: number,                  // ile razy total triggered

// Rally — member tracking:
poi.memberVesselIds: string[],            // już w schema C5, runtime fill
poi.completedYear: number | null,         // gdy waitForCount osiągnięty

// Ambush — trigger state:
poi.isTriggered: boolean,                 // czy ujawniony
poi.triggeredYear: number | null,
poi.triggeredByVesselId: string | null,
poi.triggeredByEmpireId: string | null,
```

**Brak migracji:** te pola dodajemy lazy (`poi.lastAlertYear ?? 0` patterny). Schema v67 zostaje.

### 2.4. RightClickMenu options schema

```js
// data/RightClickMenuOptions.js (NEW)

// Per-target-type, lista dostępnych orderów:
const MENU_OPTIONS_BY_TARGET = {
  empty: [    // klik na pusty punkt mapy
    { id: 'moveToPoint', label: 'Lecisz tutaj', icon: '→', orderType: 'moveToPoint' },
    { id: 'createPOI',    label: 'Utwórz POI...', icon: '⌖', action: 'openCreatePOIModal' },
  ],
  enemyVessel: [
    { id: 'pursue',     label: 'Ścigaj', icon: '⚔', orderType: 'pursue' },
    { id: 'intercept',  label: 'Przechwyć', icon: '⊕', orderType: 'intercept' },
  ],
  ownVessel: [
    { id: 'escort',     label: 'Eskortuj', icon: '🛡', orderType: 'escort' },
  ],
  poi: [   // klik na POI sprite
    { id: 'goToPOI',    label: 'Lecisz do POI', icon: '→', orderType: 'goToPOI' },
    // patrol-specific (tylko dla type='patrol'):
    { id: 'patrol',     label: 'Patroluj',     icon: '↻', orderType: 'patrol', condition: poi => poi.type === 'patrol' },
    { id: 'editPOI',    label: 'Edytuj...', icon: '✎', action: 'openEditPOIModal' },
    { id: 'deletePOI',  label: 'Usuń POI', icon: '✕', action: 'deletePOI' },
  ],
  planet: [
    { id: 'moveToPlanet', label: 'Lecisz do planety', icon: '→', orderType: 'moveToPoint', resolveTarget: planet => planet.position },
    { id: 'dock',         label: 'Dokuj', icon: '⚓', orderType: 'dock', condition: planet => planet.canDock },
  ],
};
```

**Logic:** menu builder filtuje opcje po `selectedVesselId !== null` (jeśli brak selection — wszystkie order options są disabled), per-target-type, plus per-option `condition` (np. patrol option tylko dla patrol POI).

---

## §3. EventBus contract

### 3.1. Nowe events (M3)

| Event | Payload | Subscribers |
|-------|---------|-------------|
| `ui:selectionChanged` | `{ vesselId: string \| null }` | UIManager (right-click menu state), TacticalMap (highlight selected) |
| `ui:rightClickMenuOpened` | `{ target, screenPoint, vesselId }` | RightClickMenuComponent |
| `ui:rightClickMenuClosed` | `{}` | RightClickMenuComponent |
| `ui:pickerModeStarted` | `{ pickerType, callback }` | TacticalMap (cursor change), HUD (info banner) |
| `ui:pickerModeEnded` | `{ result }` | TacticalMap, HUD |
| `ui:tooltipRequested` | `{ entityType, entityId, screenPoint }` | TooltipComponent |
| `ui:tooltipHidden` | `{}` | TooltipComponent |
| `ui:openPOIModal` | `{ mode: 'create' \| 'edit', poiId? }` | POIModalComponent |
| `ui:openPOIPanel` | `{}` | POIPanelComponent |

### 3.2. Picket/rally/ambush events (M3 P3)

| Event | Payload | Subscribers |
|-------|---------|-------------|
| `poi:picketAlerted` | `{ poiId, enemyVesselId, alertYear }` | UIManager (EventLog), IntelSystem (rumor upgrade) |
| `poi:rallyConditionMet` | `{ poiId, memberVesselIds, completedYear }` | UIManager (EventLog), gameplay logic |
| `poi:ambushTriggered` | `{ poiId, triggeredByVesselId, triggeredByEmpireId, triggeredYear }` | UIManager (EventLog), IntelSystem (passive intel) |
| `poi:vesselReached` | `{ vesselId, poiId }` | RallyTracker, UIManager (EventLog handler M3) |
| `vessel:orderBlocked` | `{ vesselId, orderId, reason }` | UIManager (EventLog handler M3 — emit już istnieje z M1) |

**Note:** `poi:vesselReached` istnieje od M2b C5 jako emit-only placeholder. M3 dodaje subscriberów.

### 3.3. Existing events (M2b) reused dla UI

UI components subskrybują existing events dla reactive updates:

- `vessel:orderIssued`, `vessel:orderCompleted`, `vessel:orderBlocked` → FleetManagerOverlay update
- `poi:created`, `poi:deleted`, `poi:updated` → POIPanel update + ThreeRenderer (już z C7)
- `intel:vesselContactChanged` → tooltip data dla vessels (quality indicator)

---

## §4. Klasy i moduły (NEW + EXTENDED)

### NEW

- **`src/ui/RightClickMenu.js`** — context menu component, builds options from `MENU_OPTIONS_BY_TARGET` schema
- **`src/ui/Tooltip.js`** — universal tooltip dla vessels/planets/POI
- **`src/ui/POIPanel.js`** — panel listy POI w sidebar (sortable, filter)
- **`src/ui/POIModal.js`** — create/edit modal dla POI
- **`src/ui/EventLogChannelFilter.js`** — toggle UI dla EventLog channels
- **`src/ui/PickerMode.js`** — state machine dla "select target" mode (np. po wyborze "Patrol" z menu, gracz musi wskazać waypointy)
- **`src/data/RightClickMenuOptions.js`** — schema MENU_OPTIONS_BY_TARGET (§2.4)
- **`src/systems/PicketAlertSystem.js`** — runtime dla picket POI (subscribe `vessel:proximityEnter`, check pickets)
- **`src/systems/RallyTrackerSystem.js`** — runtime dla rally POI (subscribe `poi:vesselReached`, track members)
- **`src/systems/AmbushTriggerSystem.js`** — runtime dla ambush POI (subscribe `vessel:proximityEnter`, check ambushes)

### EXTENDED

- **`src/scenes/GameScene.js`** — instantiacja nowych systemów + UI components, EventLog handlers dla `poi:picketAlerted`, `poi:rallyConditionMet`, `poi:ambushTriggered`, `vessel:orderBlocked`, `poi:vesselReached`
- **`src/ui/FleetManagerOverlay.js`** — selection click handler (lewy klik na vessel row → emit `ui:selectionChanged`), cancel order button
- **`src/renderer/ThreeRenderer.js`** — raycaster dla mouse → world coords, sprite hover detection (precedens C7 userData), highlight selected vessel
- **`src/ui/UIManager.js`** — global UI state coordinator (selection, picker mode)
- **`src/systems/IntelSystem.js`** — picket alert → rumor upgrade integration (intel:vesselContactChanged emit gdy picket triggers)

---

## §5. UI architecture

### 5.1. Selection model (Filip's choice: A3 combo)

**Primary flow (preferred):**
1. **Lewy klik na vessel row w FleetManagerOverlay** → `ui:selectionChanged { vesselId }`
2. **Prawy klik na tactical map** → kontekst zależnie od target:
   - Empty space → `MENU_OPTIONS_BY_TARGET.empty` (moveToPoint, createPOI)
   - Vessel sprite → ownVessel (escort) lub enemyVessel (pursue/intercept)
   - POI sprite → `MENU_OPTIONS_BY_TARGET.poi`
   - Planet sprite → `MENU_OPTIONS_BY_TARGET.planet`
3. Wybór opcji z menu → wykonaj order (jeśli trzeba target picker — entry pickerMode)

**Secondary flow (combo wsparcie):**
- Lewy klik na vessel sprite na mapie → też selection (jak FleetOverlay)
- Lewy klik na puste miejsce mapy → deselect

### 5.2. Right-click menu component

**Visual style:** match z istniejącym FleetManagerOverlay (THEME colors, dark sci-fi). Lista opcji vertical, hover highlight, kliknięcie wybiera + zamyka menu. Click outside → close.

**Pozycjonowanie:** `screenPoint` z mouse event. Menu pojawia się tuż obok kursora (offset 5px), boundary check (jeśli menu wystaje poza viewport — flip do lewej/góry).

**Disabled state:** jeśli `selectedVesselId === null`, opcje order'owe są **wizualnie disabled** (szare, no click handler) — pokazane ale niewybieralne. Z tooltip "Najpierw wybierz statek".

### 5.3. Picker mode

**Use case:** patrol order wymaga sequence waypointów. Po kliknięciu "Patroluj" w menu (kontekst pusty/POI):

1. Menu zamyka się
2. Picker mode aktywuje (`ui:pickerModeStarted` event)
3. HUD pokazuje banner: *"Klikaj waypointy patrolu (min 2). ESC aby anulować, ENTER żeby zakończyć."*
4. Cursor zmienia się na crosshair
5. Każdy lewy klik na mapie → dodaj waypoint do lista
6. ESC → cancel, ENTER (lub min 2 waypoints + drugi klik prawym?) → finalize → execute order

**Inne picker modes:**
- `targetEntity` — wybierz vessel (do escort lub pursue z mapy bez prawego klika na enemy direct)
- `targetPoint` — wybierz pojedynczy punkt (do moveToPoint przy tworzeniu POI mode)
- `patrolWaypoints` — sekwencja punktów (jak wyżej)

### 5.4. Tooltip system

**Trigger:** mouse hover nad sprite/element 500ms (delay) → show. Mouse out → hide immediately.

**Content per type:**

```
Vessel tooltip:
  [name]
  Empire: [empireName]
  HP: [current]/[max] ([percent]%)
  Fuel: [current]/[max]
  Order: [type, target jeśli jest]
  Mission: [type, target]
  Position: [x, y] AU

Planet tooltip:
  [name]
  Type: [planet type]
  System: [systemName]
  Owner: [empireName lub "neutral"]
  Population: [if colony]
  Resources: [if scanned]

POI tooltip:
  [name]
  Type: [waypoint/patrol/picket/rally/ambush]
  Owner: [empireName]
  Created: [year]
  -- per type:
  waypoint: Position [x,y]
  patrol: [N] waypoints, mode [loop/ping_pong]
  picket: Range [X] AU, alerts [count]
  rally: [members]/[required]
  ambush: [hidden/triggered]
```

**Pozycjonowanie:** floating obok cursora, transparent dark background, font subtle.

---

## §6. Plan commitów M3 (10-12)

| # | Phase | Commit | Zakres | Smoke test |
|---|-------|--------|--------|------------|
| **P1.1** | UI base | RightClickMenu + selection model | UIManager state, RightClickMenu component, MENU_OPTIONS_BY_TARGET schema, FleetOverlay click handler | Selection events emit, menu shows/hides, options filtered correctly |
| **P1.2** | UI base | Tactical map mouse interactions | ThreeRenderer raycaster, sprite click detection, target type resolution (empty/vessel/poi/planet) | Click coords → world point conversion, sprite hover detection, hover delay |
| **P1.3** | Orders UI | Order issue handlers w menu | onClick options → call MOS.issueOrder z context, picker mode dla orderów wymagających targetu (patrol waypoints) | Każda opcja z menu → odpowiedni order issued |
| **P1.4** | Orders UI | Cancel order button + FleetOverlay extensions | Cancel button per vessel row, status badge update | Cancel → blocked status, EventLog wpis |
| **P1.5** | Tooltips | Tooltip component + integration | Universal Tooltip dla vessels/planets/POI, ThreeRenderer hover events | Tooltip pokazuje się po 500ms, content correct per type |
| **P2.1** | POI UI | POI panel listy w sidebar | POIPanel component, sortable list, filter per type/owner | Panel pokazuje wszystkie POI, sort/filter działają |
| **P2.2** | POI UI | POI create/edit modal | POIModal component, form per typ, validation | Modal otwiera się z menu, create/edit działa, validation reject |
| **P2.3** | POI UI | Create POI mode (mouse) | Picker mode dla create POI, klik na mapie → coords → modal pre-fill | Klik mapy + typ POI → POI utworzony |
| **P3.1** | Runtime | Picket runtime + IntelSystem integration | PicketAlertSystem, alert range check, rumor upgrade na enemy detect | Mock vessel w pobliżu picket → alert + intel rumor upgrade |
| **P3.2** | Runtime | Rally + Ambush runtime | RallyTrackerSystem (memberVesselIds), AmbushTriggerSystem (hidden + reveal) | Mock vesselReachedPOI → tracker; enemy w ambush range → trigger |
| **P4** | Polish | EventLog filter UI + missing handlers | EventLogChannelFilter component, vessel:orderBlocked handler, poi:vesselReached handler | Filter toggles, brakujące wpisy widoczne |

**Dependencies:** P1.1 → P1.2 → P1.3 → P1.4. P1.5 niezależne (po P1.2). P2.* niezależne od P1 (poza tooltip). P3.* niezależne. P4 ostatni.

**Naturalna kolejność wykonania:** P1.1 → P1.2 → P1.3 → P1.4 → P1.5 → P2.1 → P2.2 → P2.3 → P3.1 → P3.2 → P4.

---

## §7. UI deliverables M3 — minimum viable

Każdy phase dostarcza minimum interakcji:

### P1 — Movement Orders UI
- Right-click menu z kontekst-aware opcjami
- Selection model (FleetOverlay + map click)
- Picker mode dla patrol waypoints
- Cancel order button
- Tooltips dla vessels/planets

### P2 — POI UI
- Panel listy POI w sidebar
- Right-click menu na POI sprite
- Edit modal (waypoints, name, loopMode)
- Create POI mode (mapa + typ + szczegóły)
- Tooltips dla POI (rozszerzenie z P1)

### P3 — Runtime
- Picket alerts gdy enemy w `rangePxLocal`
- Rally completion gdy `waitForCount` osiągnięty
- Ambush trigger gdy enemy w `rangePxLocal` (hidden ujawnia się)

### P4 — UX Polish
- Channel filter toggle UI w EventLog
- Brakujące handlery dla `vessel:orderBlocked`, `poi:vesselReached`

---

## §8. Picket runtime (P3.1)

### 8.1. Subscription + alert check

```js
// src/systems/PicketAlertSystem.js
export class PicketAlertSystem {
  constructor() {
    EventBus.on('vessel:proximityEnter', e => this._checkPicketAlert(e));
  }

  _checkPicketAlert({ vesselId, otherVesselId }) {
    const vessel = window.KOSMOS?.vesselManager?.getVessel(vesselId);
    const other = window.KOSMOS?.vesselManager?.getVessel(otherVesselId);
    if (!vessel || !other) return;
    
    // Skip same-empire
    if (vessel.ownerEmpireId === other.ownerEmpireId) return;
    
    const pois = window.KOSMOS?.gameState?.get('pois') ?? {};
    
    for (const poi of Object.values(pois)) {
      if (poi.type !== 'picket') continue;
      
      // Filter alertOnEmpireIds
      const alertList = poi.alertOnEmpireIds;
      if (alertList && Array.isArray(alertList)) {
        if (!alertList.includes(other.ownerEmpireId) && !alertList.includes(vessel.ownerEmpireId)) continue;
      }
      
      // Check range — który z vesseli jest w rangePxLocal od POI center?
      for (const v of [vessel, other]) {
        const dx = v.position.x - poi.center.x;
        const dy = v.position.y - poi.center.y;
        const distPx = Math.hypot(dx, dy);
        if (distPx <= poi.rangePxLocal) {
          this._triggerPicketAlert(poi, v);
        }
      }
    }
  }

  _triggerPicketAlert(poi, enemyVessel) {
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    
    // Throttle: nie alertuj częściej niż raz na 0.5 civYear per (poi, vessel)
    const lastKey = `${poi.id}_${enemyVessel.id}`;
    if (this._lastAlerts.has(lastKey)) {
      const prev = this._lastAlerts.get(lastKey);
      if (gameYear - prev < 0.5) return;
    }
    this._lastAlerts.set(lastKey, gameYear);
    
    // Update POI state
    const updates = {
      lastAlertYear: gameYear,
      alertCount: (poi.alertCount ?? 0) + 1,
    };
    window.KOSMOS?.poiRegistry?.updatePOI(poi.id, updates);
    
    EventBus.emit('poi:picketAlerted', {
      poiId: poi.id,
      enemyVesselId: enemyVessel.id,
      alertYear: gameYear,
    });
    
    // Intel rumor upgrade: jeśli enemy nie ma już contact, dodaj rumor
    const intelSys = window.KOSMOS?.intelSystem;
    if (intelSys) {
      const contact = intelSys.getVesselContact(enemyVessel.id);
      if (!contact) {
        intelSys.advanceVesselContact(enemyVessel.id);  // null → rumor
      }
    }
  }
}
```

### 8.2. UI integration

EventLog wpis: `Picket '[poi name]' wykrył wroga: [enemy name]` (channel intel, severity warn).

---

## §9. Rally runtime (P3.2)

### 9.1. Member tracking

```js
// src/systems/RallyTrackerSystem.js
export class RallyTrackerSystem {
  constructor() {
    EventBus.on('poi:vesselReached', e => this._handleVesselReached(e));
  }

  _handleVesselReached({ vesselId, poiId }) {
    const poi = window.KOSMOS?.poiRegistry?.getPOI(poiId);
    if (!poi || poi.type !== 'rally') return;
    if (poi.completedYear !== null && poi.completedYear !== undefined) return;  // already complete
    
    const members = poi.memberVesselIds ?? [];
    if (members.includes(vesselId)) return;  // duplicate
    
    const newMembers = [...members, vesselId];
    const updates = { memberVesselIds: newMembers };
    
    if (newMembers.length >= poi.waitForCount) {
      const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      updates.completedYear = gameYear;
      
      EventBus.emit('poi:rallyConditionMet', {
        poiId: poi.id,
        memberVesselIds: newMembers,
        completedYear: gameYear,
      });
    }
    
    window.KOSMOS?.poiRegistry?.updatePOI(poi.id, updates);
  }
}
```

### 9.2. UI integration

EventLog wpis przy add member: `[vessel name] dotarł do rally '[poi name]' ([N]/[required])`. Przy condition met: `Rally '[poi name]' zakończony: [N] vesseli zebranych` (severity success).

---

## §10. Ambush runtime (P3.2)

### 10.1. Hidden state + trigger

```js
// src/systems/AmbushTriggerSystem.js
export class AmbushTriggerSystem {
  constructor() {
    EventBus.on('vessel:proximityEnter', e => this._checkAmbushTrigger(e));
  }

  _checkAmbushTrigger({ vesselId, otherVesselId }) {
    const vessel = window.KOSMOS?.vesselManager?.getVessel(vesselId);
    if (!vessel) return;
    
    const pois = window.KOSMOS?.gameState?.get('pois') ?? {};
    
    for (const poi of Object.values(pois)) {
      if (poi.type !== 'ambush') continue;
      if (poi.isTriggered) continue;
      
      // Filter triggerOnEmpireIds
      if (poi.triggerOnEmpireIds && Array.isArray(poi.triggerOnEmpireIds)) {
        if (!poi.triggerOnEmpireIds.includes(vessel.ownerEmpireId)) continue;
      }
      // Skip own empire (ambush nie triggers na swoich)
      if (vessel.ownerEmpireId === poi.ownerEmpireId) continue;
      
      const dx = vessel.position.x - poi.center.x;
      const dy = vessel.position.y - poi.center.y;
      const distPx = Math.hypot(dx, dy);
      
      if (distPx <= poi.rangePxLocal) {
        this._triggerAmbush(poi, vessel);
      }
    }
  }

  _triggerAmbush(poi, enemyVessel) {
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    
    const updates = {
      isTriggered: true,
      triggeredYear: gameYear,
      triggeredByVesselId: enemyVessel.id,
      triggeredByEmpireId: enemyVessel.ownerEmpireId,
      hidden: false,  // ujawniony
    };
    window.KOSMOS?.poiRegistry?.updatePOI(poi.id, updates);
    
    EventBus.emit('poi:ambushTriggered', {
      poiId: poi.id,
      triggeredByVesselId: enemyVessel.id,
      triggeredByEmpireId: enemyVessel.ownerEmpireId,
      triggeredYear: gameYear,
    });
    
    // Passive intel: detailed contact dla triggering vessel (ambush "rozgląda się")
    const intelSys = window.KOSMOS?.intelSystem;
    if (intelSys) {
      // Force detailed contact
      const contact = intelSys.getVesselContact(enemyVessel.id);
      if (!contact || contact.quality !== 'detailed') {
        intelSys.advanceVesselContact(enemyVessel.id);
        intelSys.advanceVesselContact(enemyVessel.id);  // rumor → contact → detailed
      }
    }
  }
}
```

### 10.2. UI integration

EventLog wpis: `Ambush '[poi name]' aktywowany! Cel: [enemy name]` (severity warn). Sprite POI widoczny po triggered (był hidden, teraz visible — ThreeRenderer subscribe `poi:updated` już z C7).

---

## §11. EventLog channel filter (P4)

### 11.1. Filter component

```js
// src/ui/EventLogChannelFilter.js
// Toggle buttons w panelu EventLog header

const CHANNELS = [
  { id: 'fleet',  label: '🚀 Flota',     color: THEME.accent },
  { id: 'intel',  label: '👁 Wywiad',    color: THEME.intel },
  { id: 'combat', label: '⚔ Walka',     color: THEME.danger },
  { id: 'poi',    label: '⌖ POI',       color: THEME.warning },
];

// Render: 4 toggles, each → ui.panels.eventLogChannelFilters[channel] = true/false
// EventLog UI filtruje entries po channel
```

### 11.2. Brakujące handlery

```js
// vessel:orderBlocked — emit już z M1, brak handler. M3 dodaje:
EventBus.on('vessel:orderBlocked', ({ vesselId, orderId, reason }) => {
  const v = window.KOSMOS?.vesselManager?.getVessel(vesselId);
  const vLabel = v?.name ?? vesselId;
  const reasonLabels = {
    'target_lost': 'cel utracony',
    'patrol_invalid_waypoint': 'błędny waypoint patrolu',
    'escortee_lost': 'cel eskorty utracony',
    'poi_deleted': 'POI usunięty',
  };
  KOSMOS.eventLogSystem?.push({
    text: `Zablokowano rozkaz ${vLabel}: ${reasonLabels[reason] ?? reason}`,
    channel: 'fleet',
    severity: 'warn',
    entityRef: vesselId,
  });
});

// poi:vesselReached — emit z M2b C5/C6, brak handler. M3 dodaje:
EventBus.on('poi:vesselReached', ({ vesselId, poiId }) => {
  const v = window.KOSMOS?.vesselManager?.getVessel(vesselId);
  const poi = window.KOSMOS?.poiRegistry?.getPOI(poiId);
  const vLabel = v?.name ?? vesselId;
  const pLabel = poi?.name ?? poiId;
  KOSMOS.eventLogSystem?.push({
    text: `${vLabel} dotarł do POI '${pLabel}'`,
    channel: 'fleet',
    severity: 'info',
    entityRef: vesselId,
  });
});
```

---

## §12. Performance budget M3

UI work nie ma znaczącego runtime cost (event-driven, lazy). Główne potencjalne hotspoty:

| Operacja | Częstotliwość | Estymacja |
|----------|--------------|-----------|
| Mouse hover detection (raycaster) | per mouse move (~60Hz max) | ~50µs per call (Three.js raycaster z ~150 sprites) |
| Right-click menu builder | per right-click | ~5µs (linear filter ~10 options) |
| EventLog filter render | per filter toggle | ~1ms (re-render ~50 entries) |
| Picket alert check | per `vessel:proximityEnter` (~rare) | ~10µs per active picket |
| Tooltip render | per hover (debounced 500ms) | ~2ms (DOM update) |

Total: pomijalne. UI patterns w Stellaris/HOI4 wskazują że ~100-200 sprites + raycaster + tooltips + filters jest comfortable na średnim sprzęcie.

---

## §13. Ryzyka

| ID | Ryzyko | Severity | Mitigacja |
|----|--------|----------|-----------|
| R1 | Right-click konflikt z istniejącym browser context menu | HIGH | `e.preventDefault()` na canvas mousedown event z button=2 |
| R2 | Selection state dezynchronizacja (FleetOverlay vs map) | MEDIUM | Single source of truth = UIManager.selectedVesselId, oba miejsca subscribe `ui:selectionChanged` |
| R3 | Picker mode "stuck" gdy gracz zapomni ESC/ENTER | MEDIUM | ESC global handler, plus visible HUD banner z explicit "ESC anuluj" |
| R4 | Tooltip flicker gdy mouse szybko porusza się między sprite'ami | LOW | Debounce 500ms entry + immediate hide on out, single tooltip instance |
| R5 | POIPanel re-render performance przy 100+ POI | LOW | Soft cap 100 z M2b — w praktyce M3 testowanie ~5-20 POI |
| R6 | Picket false-positives (alert na każdy proximity event) | MEDIUM | Throttle 0.5 civYear per (poi, vessel) pair (§8.1) |
| R7 | Ambush trigger reveals position w wronej sytuacji (np. own scout enters) | MEDIUM | `triggerOnEmpireIds` filter + skip own-empire (§10.1) |
| R8 | Modal POI form — validation reject bez clear feedback | MEDIUM | Inline error messages per field, disable submit gdy invalid |
| R9 | Right-click menu wystaje poza viewport | LOW | Boundary check + flip do lewej/góry (§5.2) |
| R10 | Tactical map hover detection nie wykrywa POI sprite (occlusion) | MEDIUM | Raycaster z `recursive: false` na poziomie scene, plus userData filter |
| R11 | Empire↔empire combat (`_makeBattleId` collision) — z M2b debt | LOW | M3 NIE rozwiązuje (deferred do M4 lub kiedyś indziej) |
| R12 | Endurance drain unfreeze + BUG#4 drift — z M2b debt | LOW | M3 NIE rozwiązuje (deferred) |

---

## §14. Future work (M4+)

| Element | M4+ plan |
|---------|----------|
| Battle groups (multi-vessel selection + group orders) | Selection list + "Add to group" + group order issue, persistent w gameState |
| Bug fix `_makeBattleId` collision | Sequence/counter w battleId dla empire↔empire combat |
| Bug fix BUG#4 drift state | Reform fuel/power cells + manual "Re-dock to colony" UI |
| Endurance drain unfreeze | Po fuel/power cells reform |
| Empire↔empire intel sharing | Treaties dają partial intel z allied empire's knowledge |
| Detailed quality reveal hull + modules | UI pokazuje dokładny statek, moduły |
| Away team / `groundUnit:surveyComplete` → detailed contact | Ground troop interaction z vessel |
| Obserwatorium contact (long-term hold) | Obserwatorium w zasięgu utrzymuje contact bez degradacji |
| Prediction cone hover mode | Toggle "show only on hover target" |
| Origin offset wszystkich linii względem dziobu vessela | Visual polish dla route/cone/escort tether |
| Subtelna ping animation dla nowych POI | UX feedback przy create |
| `vessel:patrolWaypointReached` throttle / filter UI | Mniej EventLog spam'u |
| ProximitySystem awareness w UI | Warning banner gdy enemy zbliża się do patrol |

---

## §15. Plan walidacji M3

Każdy commit ma 3-tier verification (analogicznie do M2b):

1. **Smoke offline** — pure logic functions (e.g. menu builder, picket alert math). UI komponenty tylko poprzez data layer (events emitted, state changes).
2. **Real-flow w Combat Sandbox** — visual review per phase. Najwiekszy mass post-P1.4 (cancel button + tooltips razem).
3. **End-to-end retrospective po wszystkich phases** — narrative scenariusz testujący pełen UI flow:
   - Otwórz POI panel → utwórz patrol POI przez modal
   - Lewy klik na vessel w FleetOverlay → prawy klik na nowy POI → "Patroluj"
   - Spawn enemy → picket POI alerts → EventLog wpis
   - Lewy klik na 2-gi vessel → prawy klik na enemy → "Intercept"
   - Tooltip on hover prediction cone → szczegóły obs quality
   - Cancel intercept order → blocked
   - DeletePOI mid-patrol → blocked patrol order
   - Save + reload → state preserved
   - End-to-end weryfikacja że wszystko działa razem

---

## §16. Open questions (do rozstrzygnięcia w plan mode per commit)

1. **POIPanel persistence:** state w gameState czy efemerycznie? (preferencja: efemerycznie, M4 może dodać)
2. **Tooltip delay value:** 500ms standard, ale czy konfigurowalne per gracz?
3. **Right-click menu vs hover preview:** czy hover sprite pokazuje też mini-preview z menu options (jak Stellaris)?
4. **Picker mode UI:** banner w HUD czy floating tooltip przy cursor?
5. **POI deletion confirmation:** modal "Czy na pewno?" czy direct delete (z undo via EventLog)?
6. **Selection deselect:** ESC kasuje selection, lub klik w pusty obszar? (oba?)
7. **Empire↔empire intel sharing dla pickets:** picket triggers mogą upgrade intel dla allied empires (treaties M4+)?

---

**Koniec M3 design doc.**

Save target: v67 (zostaje, brak nowych domain). Estimated effort: 6-8 sesji Claude Code + 1-2 sesje playtest. Łącznie ~10-12 atomic commitów. Kolejność: P1 → P2 → P3 → P4.

**Predecessor:** `m2b-complete`
**Successor target:** `m3-complete` (po pełnym UI deliverable)
