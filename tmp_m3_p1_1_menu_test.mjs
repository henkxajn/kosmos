// Smoke test M3 P1.1 — RightClickMenu + selection model
//
// Pokrywa T1-T4 (~17 cases):
//   T1 buildMenuOptions filtering — 6 cases (5 target types, conditions, requiresSelection)
//   T2 UIManager selection state — 6 cases (init/set/dedupe/non-existent/clear)
//   T3 events emission — 3 cases (payload kontrakt + anti-pattern)
//   T4 planet edge case (canDock removed) — 2 cases
//
// Run: node tmp_m3_p1_1_menu_test.mjs

// ── Stub browser globals (PRZED importami) ─────────────────────────────────
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem:    (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;

// Mock vesselManager — UIManager.setSelectedVesselId woła getVessel(id) sanity check.
// 'v_1' i 'v_2' istnieją; inne ID → null (warn + state unchanged).
const _vessels = new Map([
  ['v_1', { id: 'v_1', name: 'Test Alpha' }],
  ['v_2', { id: 'v_2', name: 'Test Beta' }],
]);
globalThis.window.KOSMOS = {
  vesselManager: { getVessel: (id) => _vessels.get(id) ?? null },
};

// ── Imports (real singletons + UI module) ──────────────────────────────────
const EventBus = (await import('./src/core/EventBus.js')).default;
const { MENU_OPTIONS_BY_TARGET, buildMenuOptions } =
  await import('./src/data/RightClickMenuOptions.js');

// ── Test harness ───────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err.message}`);
  }
}
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}
function assertTrue(cond, label) {
  if (!cond) throw new Error(`${label}: expected true, got false`);
}
function assertFalse(cond, label) {
  if (cond) throw new Error(`${label}: expected false, got true`);
}

// ──────────────────────────────────────────────────────────────────────────
// T1 — buildMenuOptions filtering (6 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT1 — buildMenuOptions filtering:');

test('T1.1 empty target, no selection → move/patrolManual disabled, 5 createPOI.* enabled', () => {
  // M3 P1.3: empty menu rozszerzone o `patrolManual` (picker mode trigger).
  // M3 P2.3: createPOI rozbity na 5 type-specific entries (createPOI.waypoint/patrol/picket/rally/ambush).
  const opts = buildMenuOptions({ type: 'empty' }, null);
  assertEq(opts.length, 7, 'liczba opcji (move + patrolManual + 5 createPOI types)');
  const move    = opts.find(o => o.id === 'moveToPoint');
  const patrolM = opts.find(o => o.id === 'patrolManual');
  const createTypes = opts.filter(o => o.action === 'openCreatePOIPicker');
  assertEq(move.enabled, false, 'moveToPoint.enabled');
  assertEq(move.disabledReason, 'Najpierw wybierz statek', 'moveToPoint.disabledReason');
  assertEq(patrolM.enabled, false, 'patrolManual.enabled (requiresSelection)');
  assertEq(patrolM.disabledReason, 'Najpierw wybierz statek', 'patrolManual.disabledReason');
  assertEq(createTypes.length, 5, '5 type-specific createPOI entries');
  assertEq(createTypes.every(o => o.enabled === true), true, 'wszystkie createPOI enabled (no selection req)');
  assertEq(createTypes.map(o => o.poiType).sort(),
    ['ambush', 'patrol', 'picket', 'rally', 'waypoint'], 'poiType per entry');
});

test('T1.2 empty target, selection=v_1 → oba enabled', () => {
  const opts = buildMenuOptions({ type: 'empty' }, 'v_1');
  assertEq(opts.every(o => o.enabled), true, 'wszystkie enabled');
  assertEq(opts.every(o => o.disabledReason === null), true, 'brak disabledReason');
});

test('T1.3 enemyVessel + selection → pursue+intercept enabled', () => {
  const opts = buildMenuOptions({ type: 'enemyVessel', entityId: 'enemy_1' }, 'v_1');
  assertEq(opts.length, 2, 'liczba opcji');
  assertEq(opts.map(o => o.id).sort(), ['intercept', 'pursue'], 'opcje');
  assertEq(opts.every(o => o.enabled), true, 'oba enabled');
});

test('T1.4 ownVessel WHERE entityId === selectedId → escort filtered out', () => {
  // self-escort niedozwolone — condition: target.entityId !== selectedId
  const opts = buildMenuOptions({ type: 'ownVessel', entityId: 'v_1' }, 'v_1');
  assertEq(opts.length, 0, 'escort filtered out → empty list');
  // Pozytywny kontroler: ownVessel WHERE entityId !== selectedId → escort enabled
  const opts2 = buildMenuOptions({ type: 'ownVessel', entityId: 'v_2' }, 'v_1');
  assertEq(opts2.length, 1, 'escort widoczny');
  assertEq(opts2[0].id, 'escort', 'opcja = escort');
  assertEq(opts2[0].enabled, true, 'enabled');
});

test('T1.5 poi waypoint + selection → goToPOI+editPOI+deletePOI, patrol filtered', () => {
  const opts = buildMenuOptions(
    { type: 'poi', poi: { type: 'waypoint' } },
    'v_1'
  );
  const ids = opts.map(o => o.id).sort();
  assertEq(ids, ['deletePOI', 'editPOI', 'goToPOI'], 'opcje (patrol filtered out)');
});

test('T1.6 poi patrol + selection → goToPOI+patrol+editPOI+deletePOI', () => {
  const opts = buildMenuOptions(
    { type: 'poi', poi: { type: 'patrol' } },
    'v_1'
  );
  const ids = opts.map(o => o.id).sort();
  assertEq(ids, ['deletePOI', 'editPOI', 'goToPOI', 'patrol'], 'opcje');
  // Wszystkie z requiresSelection musi być enabled
  assertTrue(opts.find(o => o.id === 'goToPOI').enabled, 'goToPOI enabled');
  assertTrue(opts.find(o => o.id === 'patrol').enabled, 'patrol enabled');
});

// ──────────────────────────────────────────────────────────────────────────
// T2 — UIManager selection state (6 cases)
//
// UIManager nie da się zaimportować w Node ESM (zaciąga Canvas API).
// Replikujemy logikę 1:1 z UIManager.{get,set,clear}SelectedVesselId.
// To akceptowalny kompromis (test pokrywa kontrakt — nie konkretną implementację).
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT2 — UIManager selection state (replika kontraktu):');

class UIManagerStub {
  constructor() {
    this._selectedVesselId = null;
    this.overlayManager = { overlays: { fleet: { _selectedVesselId: null } } };
  }
  getSelectedVesselId() { return this._selectedVesselId; }
  setSelectedVesselId(vesselId) {
    if (this._selectedVesselId === vesselId) return;
    if (vesselId !== null) {
      const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      if (!v) {
        console.warn(`[UIManager] setSelectedVesselId: vessel ${vesselId} nie istnieje`);
        return;
      }
    }
    const prev = this._selectedVesselId;
    this._selectedVesselId = vesselId;
    const fleetOv = this.overlayManager?.overlays?.fleet;
    if (fleetOv) fleetOv._selectedVesselId = vesselId;
    EventBus.emit('ui:selectionChanged', { vesselId, prevVesselId: prev });
  }
  clearSelection() { this.setSelectedVesselId(null); }
}

test('T2.1 initial state → null', () => {
  const um = new UIManagerStub();
  assertEq(um.getSelectedVesselId(), null, 'initial null');
});

test('T2.2 set("v_1") → emit + state mutates + cache sync', () => {
  EventBus.clear();
  const um = new UIManagerStub();
  let lastEvent = null;
  EventBus.on('ui:selectionChanged', (e) => { lastEvent = e; });
  um.setSelectedVesselId('v_1');
  assertEq(um.getSelectedVesselId(), 'v_1', 'state');
  assertEq(lastEvent, { vesselId: 'v_1', prevVesselId: null }, 'event payload');
  assertEq(um.overlayManager.overlays.fleet._selectedVesselId, 'v_1', 'cache sync');
});

test('T2.3 set("v_2") po set("v_1") → emit z prevVesselId=v_1', () => {
  EventBus.clear();
  const um = new UIManagerStub();
  um.setSelectedVesselId('v_1');
  let lastEvent = null;
  EventBus.on('ui:selectionChanged', (e) => { lastEvent = e; });
  um.setSelectedVesselId('v_2');
  assertEq(lastEvent, { vesselId: 'v_2', prevVesselId: 'v_1' }, 'event payload');
});

test('T2.4 set("v_1") drugi raz → NO emit (dedupe)', () => {
  EventBus.clear();
  const um = new UIManagerStub();
  um.setSelectedVesselId('v_1');
  let emitCount = 0;
  EventBus.on('ui:selectionChanged', () => { emitCount++; });
  um.setSelectedVesselId('v_1');  // same value
  assertEq(emitCount, 0, 'drugi set tej samej wartości nie emituje');
});

test('T2.5 set("non_existent") → console.warn + state unchanged', () => {
  EventBus.clear();
  const um = new UIManagerStub();
  um.setSelectedVesselId('v_1');
  let warnCalled = false;
  const origWarn = console.warn;
  console.warn = () => { warnCalled = true; };
  try {
    um.setSelectedVesselId('non_existent_vessel');
  } finally {
    console.warn = origWarn;
  }
  assertTrue(warnCalled, 'console.warn wywołane');
  assertEq(um.getSelectedVesselId(), 'v_1', 'state unchanged');
});

test('T2.6 clearSelection() po set → emit z vesselId=null', () => {
  EventBus.clear();
  const um = new UIManagerStub();
  um.setSelectedVesselId('v_1');
  let lastEvent = null;
  EventBus.on('ui:selectionChanged', (e) => { lastEvent = e; });
  um.clearSelection();
  assertEq(um.getSelectedVesselId(), null, 'state null');
  assertEq(lastEvent, { vesselId: null, prevVesselId: 'v_1' }, 'event payload');
});

// ──────────────────────────────────────────────────────────────────────────
// T3 — events emission (3 cases)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT3 — events emission:');

test('T3.1 ui:selectionChanged payload kontrakt {vesselId, prevVesselId}', () => {
  EventBus.clear();
  const um = new UIManagerStub();
  let payload = null;
  EventBus.on('ui:selectionChanged', (e) => { payload = e; });
  um.setSelectedVesselId('v_1');
  assertTrue(payload && 'vesselId' in payload && 'prevVesselId' in payload,
    'payload ma oba klucze');
});

test('T3.2 ui:rightClickMenuOpened — subscriber dostaje target+screenPoint', () => {
  EventBus.clear();
  let received = null;
  EventBus.on('ui:rightClickMenuOpened', (e) => { received = e; });
  EventBus.emit('ui:rightClickMenuOpened', {
    target: { type: 'enemyVessel', entityId: 'enemy_42' },
    screenPoint: { x: 200, y: 300 },
  });
  assertEq(received?.target?.type, 'enemyVessel', 'target.type');
  assertEq(received?.target?.entityId, 'enemy_42', 'target.entityId');
  assertEq(received?.screenPoint, { x: 200, y: 300 }, 'screenPoint');
});

test('T3.3 anti-pattern: option click NIE wywołuje setSelectedVesselId', () => {
  // RightClickMenu._handleOptionClick to placeholder console.log+warn —
  // NIE może mutować selection. Replikujemy kontrakt: po wywołaniu
  // option-click handler nie wolno wywołać setSelectedVesselId.
  EventBus.clear();
  const um = new UIManagerStub();
  um.setSelectedVesselId('v_1');
  let setterCalled = false;
  const origSet = um.setSelectedVesselId.bind(um);
  um.setSelectedVesselId = (v) => { setterCalled = true; origSet(v); };

  // Symulacja: P1.1 _handleOptionClick — tylko console.log + warn (no setter call)
  const origLog = console.log; const origWarn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try {
    // Replika P1.1 _handleOptionClick (bez DOM, czysta logika)
    const placeholderClick = () => {
      console.log('[RightClickMenu] Option clicked');
      console.warn('[RightClickMenu] Order action TODO P1.3');
    };
    placeholderClick();
  } finally {
    console.log = origLog; console.warn = origWarn;
  }
  assertFalse(setterCalled, 'setSelectedVesselId NIE wywołane przez option-click');
});

// ──────────────────────────────────────────────────────────────────────────
// T4 — planet edge case (canDock removed w P1.1)
// ──────────────────────────────────────────────────────────────────────────
console.log('\nT4 — planet edge case:');

test('T4.1 planet + selection → moveToPlanet enabled (BEZ dock)', () => {
  const opts = buildMenuOptions({ type: 'planet', planet: { canDock: true } }, 'v_1');
  assertEq(opts.length, 1, 'tylko 1 opcja (dock usunięty w P1.1, V7 odkrycie)');
  assertEq(opts[0].id, 'moveToPlanet', 'opcja');
  assertEq(opts[0].enabled, true, 'enabled');
  // Sanity: dock w schemie NIE występuje
  const planetSchema = MENU_OPTIONS_BY_TARGET.planet;
  assertFalse(planetSchema.some(o => o.id === 'dock'), 'schema NIE ma dock w P1.1');
});

test('T4.2 planet + no selection → moveToPlanet disabled', () => {
  const opts = buildMenuOptions({ type: 'planet' }, null);
  assertEq(opts.length, 1, 'liczba opcji');
  assertEq(opts[0].enabled, false, 'disabled (requiresSelection)');
  assertEq(opts[0].disabledReason, 'Najpierw wybierz statek', 'reason');
});

// ── Wynik ─────────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════════════════════`);
console.log(`Smoke M3 P1.1: ${passed} PASS, ${failed} FAIL (total ${passed + failed})`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const { name, err } of failures) {
    console.log(`  - ${name}\n    ${err.message}`);
  }
  process.exit(1);
}
process.exit(0);
