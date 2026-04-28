# KOSMOS — M3 P1.1: RightClickMenu + selection model

## Kontekst

- **Tag startowy:** `m2b-complete` (po fix POI_SPRITE_SIZE=8)
- **Design doc:** `docs/design/milestone-3-runtime-and-ui.md` — sekcje §2.1 (UI state), §2.4 (RightClickMenu schema), §3.1 (events), §5.1 (selection model), §5.2 (menu component), §6 row #P1.1, §13 (ryzyka R1, R2, R9)
- **Plan:** §6 P1.1 z 10-12 commitów. Po P1.1 idzie P1.2 (tactical map mouse interactions z raycaster), P1.3 (order issue handlers), P1.4 (cancel order button), P1.5 (tooltips).

P1.1 to **fundament UI dla całego M3**. Wprowadza:
- **UIManager extension** dla selection state (`selectedVesselId`)
- **RightClickMenu component** — context menu z dynamic options per target type
- **MENU_OPTIONS_BY_TARGET schema** — declarative lista opcji per kontekst
- **FleetManagerOverlay click handler** — lewy klik na vessel row → selection
- **3 nowe events** — `ui:selectionChanged`, `ui:rightClickMenuOpened`, `ui:rightClickMenuClosed`

**P1.1 nie wykonuje jeszcze orderów** — to jest tylko **infrastruktura UI**:
- Menu pojawia się po right-click, options są filtrowane per kontekst
- Klikając opcję — log do console + `console.warn("Order action TODO P1.3")` placeholder
- P1.3 doda real order issue logic

**Scope intentionally narrow** — zgodnie z M2b lessons, atomic commits są łatwiejsze. UI infrastructure first, action wiring później.

---

## Lekcje L1-L14 z M2b (CHECK PRZED KODEM)

M2b zostawił 14 lekcji. Najważniejsze dla P1.1:

**L1. Real-flow ≠ smoke.** UI work jest jeszcze trudniejsze offline (DOM events, mouse handlers). **Smoke pokrywa tylko pure logic** (menu builder filter, state mutation). **Real-flow krytyczny** — Filip klika rękami i ocenia visual + behavior.

**L2. Init timing.** Jeśli P1.1 dodaje `gameState.ui` domain → potrzebne TRZY bootstrap points (lekcja L11). **Decyzja w plan mode (D1):** czy selection state idzie do gameState (persistence) czy efemerycznie w UIManager (zalecane: efemerycznie — selection to user action, nie game state).

**L3. ProximitySystem dual-threshold.** N/A dla P1.1.

**L4. Imported `GAME_CONFIG`.** N/A dla P1.1 (selection nie jest gated flag'iem). Ale **W KOLEJNYCH P1.x** flag `uiInteraction: false` może być ostrożnym OFF-by-default toggle dla całego M3 UI. **Decyzja w plan mode (D2):** czy P1.1 wprowadza `FEATURES.uiInteraction` flag (rollback safety) czy idzie bez gate.

**L5. Time units.** N/A.

**L6. Spec design docs mogą mieć bugi.** §2.4 schema MENU_OPTIONS_BY_TARGET wygląda OK ale weryfikacja w plan mode: czy `'planet'` ma w obecnym entityManager flag `canDock` (potrzebny dla `condition: planet => planet.canDock`)? Jeśli nie — drobna korekta.

**L7. Imported singleton w testach.** Setup helper testów importuje module-level state z UIManager / RightClickMenu module.

**L8. KOSMOS jest 3D scene XZ plane.** N/A bezpośrednio dla P1.1 (right-click menu to DOM overlay, nie 3D mesh). P1.2 używa raycaster.

**L9. Hook do istniejącego event handler vs nowy subscriber.** UI components subskrybują existing events (`vessel:orderIssued`, `intel:vesselContactChanged`). Nowe events (`ui:selectionChanged` itd.) tworzymy w P1.1.

**L10. Test convention dla rendering.** UI components — DOM testing nie jest w naszej konwencji testów Node ESM. Smoke testuje pure logic helpery (menu builder, state mutations). Visual review przez Filipa pokrywa renderowanie.

**L11. Nowa domena gameState wymaga TRZECH bootstrap points.** N/A jeśli D1 = efemerycznie.

**L12. Proactive defensive handler.** N/A dla P1.1.

**L13. Console scoping w real-flow.** UI sesja będzie miała mniej console queries (więcej click-based weryfikacji), ale w P1.1 sprawdzamy state przez `KOSMOS.uiManager.getSelectedVesselId()` — wymaga explicit declaration `const um = KOSMOS.uiManager`.

**L14. POI ID enumeracja zakłada zerowy initial state.** N/A.

**Plan mode — pokaż 7 verifications PRZED kodem:**

1. **Cytat z `UIManager.js`** (linia ~213 z startup log) — czy jest klasa, jak jest instantiated, czy ma już subskrypcje EventBus? Czy istnieje `gameState.ui` lub coś podobnego?
2. **Cytat z `OverlayManager.js`** (precedens M1 z startup log: `_showOverlay`, `openPanel`) — generic API do render UI overlays. Czy RightClickMenu może użyć tego patternu, czy potrzebuje własnego rendering layer'a?
3. **Cytat z `FleetManagerOverlay.js`** — gdzie żyje render lista vesseli (z C6 wiemy linia ~3975 ma switch po `order.type`). Pokaż 10-15 linii row rendering. Czy jest już jakiś click handler na row (np. focus/scroll-to)?
4. **Cytat z `THEME` const** — z istniejących plików (C6 FleetOverlay use `THEME.accent`, `THEME.danger`). Pokaż gdzie THEME jest defined + listę colors.
5. **Cytat z `EventBus.js` API** — `EventBus.on(event, handler)` + `EventBus.emit(event, payload)`. Pokaż gdzie subscribers cleanup się dzieje (jeśli applicable — w M3 będzie ważne, bo UI components mogą być re-instantiated).
6. **Sprawdź `entity` schemas** — czy planet ma flag `canDock`? Wybór dla §2.4 menu option `planet.dock` z condition. Pokaż 5-10 linii Planet/Entity defs.
7. **Cytat z istniejącego `addEventListener('contextmenu', ...)`** w repo — czy jest już handler dla browser context menu, czy P1.1 wprowadza go pierwszy raz? Risk R1 (browser context menu konflikt) wymaga `e.preventDefault()`.

---

## Zakres zmian

### 1. `src/data/RightClickMenuOptions.js` (NEW, ~80 LoC)

Schema declarative dla menu options per target type. Pure data, brak logic.

```js
// Każda opcja ma:
//   id: unique identifier
//   label: PL display string
//   icon: emoji/symbol (matching M2b convention dla FleetOverlay labels)
//   orderType: M1 ORDER_TYPES key (jeśli action='issueOrder')
//   action: 'issueOrder' | 'openCreatePOIModal' | 'openEditPOIModal' | 'deletePOI'
//   condition?: function(target) → boolean (filter dynamiczny)
//   requiresSelection: boolean (czy wymagany selectedVesselId !== null)

export const MENU_OPTIONS_BY_TARGET = Object.freeze({
  empty: [
    { id: 'moveToPoint', label: 'Lecisz tutaj', icon: '→',
      action: 'issueOrder', orderType: 'moveToPoint', requiresSelection: true },
    { id: 'createPOI', label: 'Utwórz POI...', icon: '⌖',
      action: 'openCreatePOIModal', requiresSelection: false },
  ],
  enemyVessel: [
    { id: 'pursue', label: 'Ścigaj', icon: '⚔',
      action: 'issueOrder', orderType: 'pursue', requiresSelection: true },
    { id: 'intercept', label: 'Przechwyć', icon: '⊕',
      action: 'issueOrder', orderType: 'intercept', requiresSelection: true },
  ],
  ownVessel: [
    { id: 'escort', label: 'Eskortuj', icon: '🛡',
      action: 'issueOrder', orderType: 'escort', requiresSelection: true,
      condition: (target, selectedId) => target.entityId !== selectedId },  // nie self-escort
  ],
  poi: [
    { id: 'goToPOI', label: 'Lecisz do POI', icon: '→',
      action: 'issueOrder', orderType: 'goToPOI', requiresSelection: true },
    { id: 'patrol', label: 'Patroluj', icon: '↻',
      action: 'issueOrder', orderType: 'patrol', requiresSelection: true,
      condition: (target) => target.poi?.type === 'patrol' },
    { id: 'editPOI', label: 'Edytuj...', icon: '✎',
      action: 'openEditPOIModal', requiresSelection: false },
    { id: 'deletePOI', label: 'Usuń POI', icon: '✕',
      action: 'deletePOI', requiresSelection: false },
  ],
  planet: [
    // P1.1 placeholder — kompletna lista w P1.3 (gdy mamy resolveTarget logic)
    { id: 'moveToPlanet', label: 'Lecisz do planety', icon: '→',
      action: 'issueOrder', orderType: 'moveToPoint', requiresSelection: true },
    // dock option — sprawdź w plan mode czy planet.canDock istnieje
    // jeśli nie, USUŃ tę opcję na ten commit (P1.3 wprowadzi jak mamy logic)
    { id: 'dock', label: 'Dokuj', icon: '⚓',
      action: 'issueOrder', orderType: 'dock', requiresSelection: true,
      condition: (target) => target.planet?.canDock === true },
  ],
});

/**
 * Build menu options dla given target + selection state.
 * @param target {type, entityId?, worldPoint?, poi?, planet?}
 * @param selectedVesselId string | null
 * @returns Array<MenuOption> (filtered)
 */
export function buildMenuOptions(target, selectedVesselId) {
  const baseOptions = MENU_OPTIONS_BY_TARGET[target.type] ?? [];
  return baseOptions
    .filter(opt => !opt.condition || opt.condition(target, selectedVesselId))
    .map(opt => ({
      ...opt,
      enabled: !opt.requiresSelection || selectedVesselId !== null,
      disabledReason: opt.requiresSelection && !selectedVesselId
        ? 'Najpierw wybierz statek'
        : null,
    }));
}
```

### 2. `src/ui/UIManager.js` (EXTENDED, ~50 LoC dodanych)

Add selection state + getter/setter + emit `ui:selectionChanged`.

**Decyzja w plan mode:** czy UIManager już istnieje jako klasa (zgodnie z V1 verification), czy jest module-level state. Dopasuj implementację.

```js
// Jeśli klasa UIManager (zgodnie z V1):
class UIManager {
  constructor() {
    this._selectedVesselId = null;
    // ... existing M1/M2a state ...
  }
  
  getSelectedVesselId() {
    return this._selectedVesselId;
  }
  
  setSelectedVesselId(vesselId) {
    if (this._selectedVesselId === vesselId) return;  // no-op
    
    // Sanity check: vessel exists
    if (vesselId !== null) {
      const v = window.KOSMOS?.vesselManager?.getVessel(vesselId);
      if (!v) {
        console.warn(`[UIManager] setSelectedVesselId: vessel ${vesselId} not found`);
        return;
      }
    }
    
    const prev = this._selectedVesselId;
    this._selectedVesselId = vesselId;
    EventBus.emit('ui:selectionChanged', { vesselId, prevVesselId: prev });
  }
  
  clearSelection() {
    this.setSelectedVesselId(null);
  }
}
```

### 3. `src/ui/RightClickMenu.js` (NEW, ~150 LoC)

Component renderujący context menu jako DOM overlay (NIE 3D mesh).

```js
export class RightClickMenu {
  constructor() {
    this._isOpen = false;
    this._target = null;
    this._element = null;  // DOM element
    
    this._setupEventBus();
  }
  
  _setupEventBus() {
    EventBus.on('ui:rightClickMenuOpened', ({ target, screenPoint }) => {
      this.show(target, screenPoint);
    });
    EventBus.on('ui:rightClickMenuClosed', () => {
      this.hide();
    });
  }
  
  show(target, screenPoint) {
    this.hide();  // clear previous
    
    this._target = target;
    const selectedVesselId = window.KOSMOS?.uiManager?.getSelectedVesselId() ?? null;
    const options = buildMenuOptions(target, selectedVesselId);
    
    if (options.length === 0) return;  // empty menu = no show
    
    // Create DOM element
    const menu = document.createElement('div');
    menu.className = 'kosmos-rcm';
    menu.style.cssText = `
      position: fixed;
      left: ${screenPoint.x + 5}px;
      top: ${screenPoint.y + 5}px;
      background: ${THEME.bgPrimary};
      border: 1px solid ${THEME.borderPrimary};
      border-radius: 4px;
      padding: 4px 0;
      z-index: 9999;
      font-family: ${THEME.fontMono};
      min-width: 180px;
    `;
    
    // Boundary check: jeśli wystaje poza viewport → flip
    // (po appendChild żeby zmierzyć wymiary)
    
    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'kosmos-rcm-item';
      item.style.cssText = `
        padding: 6px 12px;
        cursor: ${opt.enabled ? 'pointer' : 'not-allowed'};
        color: ${opt.enabled ? THEME.textPrimary : THEME.textDim};
        opacity: ${opt.enabled ? 1 : 0.5};
        display: flex;
        gap: 8px;
        align-items: center;
      `;
      item.textContent = `${opt.icon}  ${opt.label}`;
      
      if (opt.disabledReason) {
        item.title = opt.disabledReason;
      }
      
      if (opt.enabled) {
        item.addEventListener('mouseenter', () => {
          item.style.background = THEME.bgHover;
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'transparent';
        });
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this._handleOptionClick(opt, target);
        });
      }
      
      menu.appendChild(item);
    });
    
    document.body.appendChild(menu);
    this._element = menu;
    this._isOpen = true;
    
    // Boundary check po insertcie
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${screenPoint.x - rect.width - 5}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${screenPoint.y - rect.height - 5}px`;
    }
    
    // Click outside → close
    setTimeout(() => {  // delay żeby sam click otwierający nie zamknął
      document.addEventListener('click', this._onDocumentClick = () => this.hide(), { once: true });
    }, 0);
  }
  
  hide() {
    if (!this._isOpen) return;
    if (this._element) {
      this._element.remove();
      this._element = null;
    }
    if (this._onDocumentClick) {
      document.removeEventListener('click', this._onDocumentClick);
      this._onDocumentClick = null;
    }
    this._isOpen = false;
    this._target = null;
  }
  
  _handleOptionClick(option, target) {
    this.hide();
    
    // P1.1 placeholder — pełna logika w P1.3
    console.log('[RightClickMenu] Option clicked:', option.id, 'target:', target);
    console.warn('[RightClickMenu] Order action TODO P1.3 — wiring to MOS.issueOrder');
    
    // P1.3 doda routing:
    // if (option.action === 'issueOrder') → call mos.issueOrder
    // if (option.action === 'openCreatePOIModal') → emit ui:openPOIModal
    // etc.
  }
  
  isOpen() { return this._isOpen; }
}
```

### 4. `src/ui/FleetManagerOverlay.js` (EXTENDED, ~30 LoC)

Lewy klik na row vessela → emit `ui:selectionChanged`.

**W plan mode V3 verification powiedz gdzie row rendering się dzieje.** Dodaj click handler:

```js
// W row rendering (gdzie się tworzy element vessel-row):
row.addEventListener('click', (e) => {
  e.stopPropagation();
  const um = window.KOSMOS?.uiManager;
  if (!um) return;
  um.setSelectedVesselId(vessel.id);
});

// Highlight selected — subscribe do ui:selectionChanged:
EventBus.on('ui:selectionChanged', ({ vesselId }) => {
  // Re-render rows lub mutuj inline styles
  // Selected row: border-left: 2px solid THEME.accent
});
```

### 5. `src/scenes/GameScene.js` — instantiation + global access

```js
// Po istniejącym this.uiManager = new UIManager(...) (lub gdzie żyje):
this.rightClickMenu = new RightClickMenu();
window.KOSMOS.rightClickMenu = this.rightClickMenu;

// Devtools (dla M3 P1.1 testowanie):
KOSMOS.debug.openRightClickMenu = (targetType = 'empty', screenPoint = {x: 100, y: 100}) => {
  EventBus.emit('ui:rightClickMenuOpened', {
    target: { type: targetType },
    screenPoint,
  });
};
KOSMOS.debug.selectVessel = (vId) => {
  return KOSMOS.uiManager.setSelectedVesselId(vId);
};
KOSMOS.debug.clearSelection = () => {
  return KOSMOS.uiManager.clearSelection();
};
KOSMOS.debug.getSelectedVesselId = () => {
  return KOSMOS.uiManager.getSelectedVesselId();
};
```

---

## NIE ROBIĆ w P1.1

- ❌ Nie wykonywać orderów po kliknięciu opcji menu — tylko `console.log + warn`. Real wiring w P1.3.
- ❌ Nie dodawać raycaster ani 3D map mouse handler — to P1.2.
- ❌ Nie tworzyć tooltipów (P1.5).
- ❌ Nie dodawać cancel order button (P1.4).
- ❌ Nie tworzyć POI panel (P2.*).
- ❌ Nie dodawać picker mode dla patrol waypoints (P1.3).
- ❌ Nie ruszać MovementOrderSystem, ThreeRenderer (poza highlight selected vessel jeśli zrobione w FleetOverlay), POIRegistry.
- ❌ Nie dodawać persistence selection state w gameState (efemerycznie).
- ❌ Nie obsługiwać `ui:rightClickMenuClosed` z innych miejsc niż `RightClickMenu.hide()` self-call.

---

## Smoke testy (`tmp_m3_p1_1_menu_test.mjs`)

Standalone Node ESM, wzorzec z M2b. Mock EventBus, mock KOSMOS, mock vesselManager. **DOM nie jest dostępny w Node** — testujemy tylko **pure logic**:

### T1 — `buildMenuOptions` filtering (~6 cases)

```
T1.1 target.type='empty', selectedVesselId=null → opcja moveToPoint disabled (requiresSelection=true), createPOI enabled
T1.2 target.type='empty', selectedVesselId='v_1' → moveToPoint enabled, createPOI enabled
T1.3 target.type='enemyVessel', selectedVesselId='v_1' → pursue+intercept enabled
T1.4 target.type='ownVessel' WHERE entityId === selectedVesselId → escort filtered out (condition: target !== self)
T1.5 target.type='poi', poi.type='waypoint', selectedVesselId='v_1' → goToPOI enabled, patrol filtered out (condition wymaga patrol type)
T1.6 target.type='poi', poi.type='patrol', selectedVesselId='v_1' → goToPOI + patrol enabled
```

### T2 — UIManager selection state (~5 cases)

```
T2.1 initial state → getSelectedVesselId() === null
T2.2 setSelectedVesselId('v_1') → emit ui:selectionChanged {vesselId: 'v_1', prevVesselId: null}, get returns 'v_1'
T2.3 setSelectedVesselId('v_2') → emit z prevVesselId='v_1', new vesselId='v_2'
T2.4 setSelectedVesselId('v_1') drugi raz (same value) → NO emit (dedupe)
T2.5 setSelectedVesselId('non_existent') → console.warn + state unchanged
T2.6 clearSelection() → emit z vesselId=null
```

### T3 — events emission (~3 cases)

```
T3.1 ui:selectionChanged payload {vesselId, prevVesselId}
T3.2 ui:rightClickMenuOpened/Closed events listening: subscriber receives correct payload
T3.3 (anti-pattern check) — RightClickMenu nie wywołuje setSelectedVesselId (selection to osobny concern)
```

### T4 — menu options dla planet edge case (~2 cases)

```
T4.1 target.type='planet', target.planet={canDock: true}, selectedVesselId='v_1' → moveToPlanet + dock enabled
T4.2 target.type='planet', target.planet={canDock: false} → tylko moveToPlanet (dock filtered out)
```

**Cel:** ~16 cases + 168/168 z M2b GREEN.

---

## Manual integration test (real-flow w Combat Sandbox)

### Setup wspólny

**Krok 0.1.** F5 + Świeża gra + Combat Sandbox.

**Krok 0.2.** Pre-state:
```
KOSMOS.uiManager
KOSMOS.rightClickMenu
KOSMOS.debug.getSelectedVesselId()
```
Oczekiwane: oba istnieją (instances), selection === null.

### Scenario A — Selection przez FleetOverlay click (3 min)

**Krok A.1.** Lewy klik na row "Obrońca Alfa" w FleetManagerOverlay (panel po lewej).

**Oczekiwane:**
- Row visually highlighted (border-left lub background change)
- Console log: brak (cicha akcja)

**Krok A.2.** Sprawdź state:
```
KOSMOS.debug.getSelectedVesselId()
```
Oczekiwane: `'v_1'` (lub odpowiedni ID).

**Krok A.3.** Lewy klik na row "Obrońca Beta":
```
KOSMOS.debug.getSelectedVesselId()
```
Oczekiwane: `'v_2'`. Highlight przesunął się na Betę, Alfa już bez highlight.

**Krok A.4.** Lewy klik **ponownie** na Beta (already selected):
```
KOSMOS.debug.getSelectedVesselId()
```
Oczekiwane: `'v_2'` (no change). EventBus subscriber NIE dostał drugiego eventu — sprawdź w console jeśli widać emit logs.

**Krok A.5.** Clear:
```
KOSMOS.debug.clearSelection()
```
Highlight zniknął z Bety. `getSelectedVesselId()` → `null`.

### Scenario B — Right-click menu w pustym kontekście (3 min)

**Krok B.1.** Bez selection (`clearSelection`):
```
KOSMOS.debug.openRightClickMenu('empty', {x: 400, y: 300})
```

**Oczekiwane na ekranie:**
- DOM menu pojawia się w (~405, 305) — 5px offset od podanego punktu
- Lista opcji:
  - "→  Lecisz tutaj" (DISABLED, opacity ~50%, tooltip "Najpierw wybierz statek")
  - "⌖  Utwórz POI..." (ENABLED, normal opacity)

**Krok B.2.** Najedź na disabled "Lecisz tutaj" — nie powinno highlight'ować, cursor `not-allowed`.

**Krok B.3.** Kliknij "Utwórz POI..." — menu zamyka się, console log:
```
[RightClickMenu] Option clicked: createPOI target: ...
[RightClickMenu] Order action TODO P1.3 — wiring to MOS.issueOrder
```

### Scenario C — Right-click menu z selection (3 min)

**Krok C.1.** Wybierz vessel:
```
KOSMOS.debug.selectVessel('v_1')
```

**Krok C.2.** Otwórz menu:
```
KOSMOS.debug.openRightClickMenu('empty', {x: 400, y: 300})
```

**Oczekiwane:**
- Obie opcje teraz **enabled** (full opacity, click handler aktywny)
- "Lecisz tutaj" już nie ma `not-allowed` cursor, hover daje highlight

**Krok C.3.** Kliknij "Lecisz tutaj" — menu zamyka, console log z option.id='moveToPoint', warn TODO P1.3.

### Scenario D — Right-click menu na różne target types (5 min)

**Krok D.1.** Z selection aktywnym, otwórz menu dla różnych target types przez devtools:

```
KOSMOS.debug.openRightClickMenu('enemyVessel', {x: 400, y: 300})
```
Oczekiwane: opcje "⚔ Ścigaj" + "⊕ Przechwyć", obie enabled.

```
KOSMOS.debug.openRightClickMenu('ownVessel', {x: 400, y: 300})
```
Oczekiwane: opcja "🛡 Eskortuj" enabled.

```
KOSMOS.debug.openRightClickMenu('poi', {x: 400, y: 300})
```
Oczekiwane: opcje "→ Lecisz do POI" + "✎ Edytuj..." + "✕ Usuń POI" widoczne. **patrol** może być filtered out jeśli devtools nie passuje target.poi info (dla P1.1 OK — P1.2 doda real target resolution).

```
KOSMOS.debug.openRightClickMenu('planet', {x: 400, y: 300})
```
Oczekiwane: "→ Lecisz do planety" enabled. **Dock** może być filtered out jeśli planet.canDock nie istnieje na mock target — to OK.

### Scenario E — Boundary check (menu wystaje) (2 min)

**Krok E.1.** Otwórz menu w prawym dolnym rogu:
```
KOSMOS.debug.openRightClickMenu('empty', {x: window.innerWidth - 50, y: window.innerHeight - 50})
```

**Oczekiwane:** menu pojawia się **na lewo i w górę** od kursora (flip), nie wystaje poza viewport.

### Scenario F — Click outside zamyka menu (1 min)

**Krok F.1.** Otwórz menu:
```
KOSMOS.debug.openRightClickMenu('empty', {x: 400, y: 300})
```

**Krok F.2.** Kliknij gdzieś poza menu (np. prawa strona ekranu).

**Oczekiwane:** menu znika.

```
KOSMOS.rightClickMenu.isOpen()
```
Oczekiwane: `false`.

### Pass criteria

- ✓ A: selection state mutuje + highlight w FleetOverlay updates
- ✓ B: menu pokazuje disabled options gdy brak selection, enabled createPOI
- ✓ C: po selection, enabled options działają
- ✓ D: 4 target types renderują różne option lists
- ✓ E: menu nie wystaje poza viewport (flip działa)
- ✓ F: click outside zamyka menu

### Fail → STOP, raport

- **A:** highlight nie pojawia się → FleetOverlay click handler broken lub nie subscribe `ui:selectionChanged`
- **B:** disabled options są fully clickable → `enabled` flag nie respektowany w event listener attachment
- **C:** options nadal disabled mimo selection → `buildMenuOptions` nie czyta latest state
- **D:** wszystkie targets pokazują tę samą listę → MENU_OPTIONS_BY_TARGET dispatch broken
- **E:** menu wystaje poza viewport → boundary check nie wykonuje się lub źle mierzy `getBoundingClientRect()`
- **F:** menu nie zamyka po click outside → `_onDocumentClick` listener nie zarejestrowany lub `removeEventListener` nie pasuje (function reference issue)

---

## Protokół

1. **Plan mode** — pokaż:
   - 7 verifications z lekcji
   - 2 decyzje:
     - **D1:** selection state w gameState (persistence) vs efemerycznie w UIManager (preferowane: efemerycznie)
     - **D2:** czy `FEATURES.uiInteraction` flag rollback safety, czy bez gate (preferowane: bez gate, P1.x to additive UI infrastructure, można cofnąć przez git revert)
   - Diff dla 5 plików (RightClickMenuOptions NEW, UIManager extend, RightClickMenu NEW, FleetManagerOverlay extend, GameScene init)
   - Test cases T1-T4 outline
   - Devtools list (4: selectVessel, clearSelection, getSelectedVesselId, openRightClickMenu)

2. **Aprobata** — czekam na "GO". Jeśli któreś verification ujawnia niespójność (np. UIManager nie istnieje jako klasa, lub THEME stałe są w innym miejscu), zapytaj.

3. **Atomic commit:**
   ```
   M3 P1.1: RightClickMenu + selection model

   - data/RightClickMenuOptions.js (NEW): MENU_OPTIONS_BY_TARGET schema
     dla 5 target types (empty/enemyVessel/ownVessel/poi/planet) +
     buildMenuOptions(target, selectedVesselId) helper z conditions
   - ui/UIManager.js: selection state (selectedVesselId) + 
     setSelectedVesselId/clearSelection/getSelectedVesselId API,
     emit ui:selectionChanged
   - ui/RightClickMenu.js (NEW): DOM overlay component, builds options,
     boundary check, click outside close, keyboard ESC support
   - ui/FleetManagerOverlay.js: lewy klik na row vessel → setSelectedVesselId,
     subscribe ui:selectionChanged dla highlight render
   - scenes/GameScene.js: instantiation + window.KOSMOS.rightClickMenu
     + 4 devtools (selectVessel/clearSelection/getSelectedVesselId/
     openRightClickMenu)
   - 3 nowe events: ui:selectionChanged, ui:rightClickMenuOpened, 
     ui:rightClickMenuClosed
   - Test: tmp_m3_p1_1_menu_test.mjs (T1-T4, ~16 cases)

   P1.1 to UI infrastructure tylko — kliknięcie opcji menu loguje
   placeholder "TODO P1.3" do console. Real wiring do MOS.issueOrder
   przyjdzie w P1.3. Selection state efemerycznie (no gameState
   persistence — D1 decyzja).

   Refs: docs/design/milestone-3-runtime-and-ui.md §2.1, §2.4, §3.1, 
   §5.1, §5.2, §6 P1.1
   Predecessor: m2b-complete
   ```

4. **Raport po commit:**
   - Files + LoC
   - Smoke result
   - Verifications (7) + decyzje (2) rozstrzygnięte
   - Off-spec / odkrycia (np. THEME color names, UIManager actual structure)
   - "Real-flow do wykonania przez Filipa: 6 scenariuszy A-F (~15 min)"

5. **Po raporcie ja robię real-flow** (~15 min). Pass → tag `m3-commit-p1-1-complete` + snapshot. Lecimy do **P1.2 (tactical map mouse interactions z raycaster)**.

---

## Limity

- **Maks. 5 plików źródłowych** zmienionych: RightClickMenuOptions (NEW), UIManager (extend), RightClickMenu (NEW), FleetManagerOverlay (extend), GameScene (init + devtools). Plus test.
- **Maks. ~400 LoC** dodanych łącznie z testem (Schema ~80, UIManager ~50, RightClickMenu ~150, FleetOverlay ~30, GameScene ~30, test ~80).
- **Zero zmian w MovementOrderSystem, ThreeRenderer, POIRegistry, IntelSystem, GameConfig, GameState.**
- **DOM only** dla RightClickMenu — żaden 3D mesh, żaden raycaster (P1.2).
- **Selection efemerycznie** — `gameState.ui` nie wprowadzane w P1.1 (ewentualnie M4 jeśli persistence wymagana).
- **Console placeholder** dla option click — real wiring P1.3.

---

## Kontekst dla decyzji projektowych

- **Dlaczego DOM overlay zamiast 3D mesh dla menu?** Menu to UI affordance, nie game world entity. DOM ma natywne event handling (click, hover, keyboard), boundary detection, flexbox layout — wszystko wbudowane. 3D mesh wymagałby raycaster + manual hover detection + custom layout. DOM standardowy w UI Stellaris-like games.
- **Dlaczego placeholder console.log+warn dla click handlers?** Bo P1.1 to **UI infrastructure**. Próba wiring do MOS.issueOrder w P1.1 wymagałaby też resolveTarget logic (vessel coords, POI lookup, planet handling) — to P1.3 scope. Atomic commits = mniej ryzyka regression. Plus pozwala Filipowi zobaczyć menu visual + behavior bez wykonywania faktycznych orderów (sandbox dla UI feedback).
- **Dlaczego selection efemerycznie?** Selection to per-session user action ("klikam na vessel żeby wydać mu order"). Po reload load save — gracz na nowo wybiera vessel'a do interakcji. Persistence selection w gameState dodawałaby noise (każdy save zawiera "akurat zaznaczony statek") bez wartości gameplay. Jeśli w przyszłości graczom brakuje "remember last selection between sessions" → M4 doda jako user preference (gameState.ui.lastSelectedVesselId).
- **Dlaczego MENU_OPTIONS_BY_TARGET to declarative schema?** Bo dodawanie nowych opcji w P1.3+ (cancel, more order types, dock) jest tylko data change, nie code change. Plus testowalne pure logic (buildMenuOptions = filter + map). Plus future M4+ może mieć dynamic options based on vessel capabilities (np. "tylko vessele z hangar mogą deploy ground unit").
- **Dlaczego P1.1 nie używa raycaster?** Bo raycaster (mouse → world coords + sprite hit detection) to nontrivial — wymaga camera matrix transformations, sprite userData filter (precedens C7), boundary cases (sprite occlusion). To dedykowane P1.2. P1.1 testuje menu **przez devtools** (`openRightClickMenu(targetType, screenPoint)`), real mouse events w P1.2.
- **Dlaczego cancel/options pominięte (np. cancel order, deselect via ESC)?** Bo każdy z nich wymaga wiring do osobnego subsystemu (cancel = MOS.cancelOrder API, ESC = global keyboard handler). P1.1 atomic = tylko menu + selection. ESC dodajemy w P1.3 jako część keyboard interaction layer.

---

## TL;DR

**Pierwszy commit M3.** Wprowadza fundament UI (selection state, right-click menu DOM component, MENU_OPTIONS_BY_TARGET schema). **Nie wykonuje jeszcze orderów** — placeholder console log. Selection przez lewy klik FleetOverlay row, menu przez devtools `openRightClickMenu(targetType, screenPoint)`. Real mouse events na mapie 3D w P1.2 (z raycaster). Real order wiring w P1.3.

**Predecessor:** `m2b-complete`
**Successor target:** `m3-commit-p1-1-complete`
**After this:** P1.2 — Tactical map mouse interactions (raycaster, sprite click, target type resolution).
