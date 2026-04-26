// Smoke test M2b Commit 5 — POIRegistry CRUD + validation + flag gate + lifecycle + MOS handler
//
// Pokrywa T1-T7 (~30 cases):
//   T1 validatePOISpec — 10 cases per type
//   T2 POIRegistry CRUD — 8 cases (create/get/list/listByType/delete + emit events)
//   T3 feature flag gate — 3 cases (anti-pattern proof per L1 z C2)
//   T4 initPOISubdomain lifecycle — 3 cases (fresh/load/idempotent)
//   T5 MOS _onPOIDeletedHandler — 3 cases (replika logic, mock _byVessel + _blockAndCancel)
//   T6 soft cap warning — 1 case z console.warn capture (try/finally restore)
//   T7 events payload — 3 cases (poi:created/updated/deleted z {poiId, name})
//
// Run: node tmp_m2b_c5_poi_test.mjs

// ── Stub browser globals (PRZED importami) ─────────────────────────────────
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem:    (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {
  timeSystem: { gameTime: 0 },
};

// ── Imports (real singletons — anti-pattern proof per L1 z C2) ─────────────
const EventBus              = (await import('./src/core/EventBus.js')).default;
const gameState             = (await import('./src/core/GameState.js')).default;
const { GAME_CONFIG }       = await import('./src/config/GameConfig.js');
const { POIRegistry }       = await import('./src/systems/POIRegistry.js');
const { validatePOISpec }   = await import('./src/data/POITypes.js');

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
function assertNull(val, label) {
  if (val !== null && val !== undefined) {
    throw new Error(`${label}: expected null/undefined, got ${JSON.stringify(val)}`);
  }
}

// EventBus capture helper — łapie 1 emit per event name dla okresu testu
function captureEvent(eventName) {
  const captured = [];
  const handler = (payload) => captured.push(payload);
  EventBus.on(eventName, handler);
  return {
    captured,
    detach: () => {
      const arr = EventBus.listeners.get(eventName);
      if (!arr) return;
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    },
  };
}

// Reset state przed każdym testem (świeża gra symulacja)
function resetState() {
  gameState.reset();
  GAME_CONFIG.FEATURES.poiSystem = true;
}

// ──────────────────────────────────────────────────────────────────────────
// T1 — validatePOISpec per type
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T1 — validatePOISpec per type]');

test('T1.1 invalid type → reason=invalid_type', () => {
  assertEq(validatePOISpec({ type: 'unknown', name: 'X' }), { ok: false, reason: 'invalid_type' }, 'result');
});

test('T1.2 missing name → reason=name_required', () => {
  assertEq(validatePOISpec({ type: 'waypoint', point: {x:0,y:0} }), { ok: false, reason: 'name_required' }, 'result');
});

test('T1.3 waypoint OK', () => {
  assertEq(validatePOISpec({ type: 'waypoint', name: 'A', point: {x:1, y:2} }), { ok: true }, 'result');
});

test('T1.4 waypoint bez point → point_required', () => {
  assertEq(validatePOISpec({ type: 'waypoint', name: 'A' }), { ok: false, reason: 'point_required' }, 'result');
});

test('T1.5 patrol z 1 waypoint → waypoints_min_2', () => {
  assertEq(
    validatePOISpec({ type: 'patrol', name: 'P', waypoints: [{x:0,y:0}], loopMode: 'loop' }),
    { ok: false, reason: 'waypoints_min_2' }, 'result',
  );
});

test('T1.6 patrol bez loopMode → loopMode_invalid', () => {
  assertEq(
    validatePOISpec({ type: 'patrol', name: 'P', waypoints: [{x:0,y:0}, {x:1,y:1}] }),
    { ok: false, reason: 'loopMode_invalid' }, 'result',
  );
});

test('T1.7 patrol OK (2 wp + loopMode=loop)', () => {
  assertEq(
    validatePOISpec({ type: 'patrol', name: 'P', waypoints: [{x:0,y:0}, {x:1,y:1}], loopMode: 'loop' }),
    { ok: true }, 'result',
  );
});

test('T1.8 picket z negative rangePxLocal → rangePxLocal_invalid', () => {
  assertEq(
    validatePOISpec({ type: 'picket', name: 'P', center: {x:0,y:0}, rangePxLocal: -100 }),
    { ok: false, reason: 'rangePxLocal_invalid' }, 'result',
  );
});

test('T1.9 rally OK', () => {
  assertEq(
    validatePOISpec({ type: 'rally', name: 'R', center: {x:0,y:0}, waitForCount: 3 }),
    { ok: true }, 'result',
  );
});

test('T1.10 ambush bez hidden → hidden_required', () => {
  assertEq(
    validatePOISpec({ type: 'ambush', name: 'A', center: {x:0,y:0}, rangePxLocal: 100 }),
    { ok: false, reason: 'hidden_required' }, 'result',
  );
});

// ──────────────────────────────────────────────────────────────────────────
// T2 — POIRegistry CRUD
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T2 — POIRegistry CRUD]');

test('T2.1 createPOI waypoint → ok, poiId=poi_1, emit poi:created', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  const cap = captureEvent('poi:created');
  try {
    const r = reg.createPOI({ type: 'waypoint', name: 'Alfa', point: {x:100,y:200} });
    assertEq(r, { ok: true, poiId: 'poi_1' }, 'result');
    assertEq(cap.captured.length, 1, 'emit count');
    assertEq(cap.captured[0].poi.name, 'Alfa', 'poi.name w emit');
    assertEq(cap.captured[0].poi.id, 'poi_1', 'poi.id w emit');
  } finally {
    cap.detach();
  }
});

test('T2.2 createPOI patrol → ok, poiId=poi_2', () => {
  // Continuation from T2.1 — same registry would give poi_2; ale resetState wipes
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  reg.createPOI({ type: 'waypoint', name: 'A', point: {x:0,y:0} });
  const r = reg.createPOI({ type: 'patrol', name: 'P', waypoints: [{x:0,y:0},{x:1,y:1}], loopMode: 'loop' });
  assertEq(r, { ok: true, poiId: 'poi_2' }, 'result');
});

test('T2.3 createPOI z invalid spec → ok:false, reason', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  const r = reg.createPOI({ type: 'waypoint', name: 'A' });
  assertEq(r, { ok: false, reason: 'point_required' }, 'result');
});

test('T2.4 getPOI(istniejący) → poi object', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  const c = reg.createPOI({ type: 'waypoint', name: 'A', point: {x:1,y:2} });
  const poi = reg.getPOI(c.poiId);
  assertEq(poi.id, c.poiId, 'id');
  assertEq(poi.name, 'A', 'name');
  assertEq(poi.point, {x:1,y:2}, 'point');
});

test('T2.5 getPOI(nieistniejący) → null', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  assertNull(reg.getPOI('poi_999'), 'result');
});

test('T2.6 listPOIs() → wszystkie utworzone', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  reg.createPOI({ type: 'waypoint', name: 'A', point: {x:0,y:0} });
  reg.createPOI({ type: 'waypoint', name: 'B', point: {x:1,y:1} });
  reg.createPOI({ type: 'patrol', name: 'P', waypoints: [{x:0,y:0},{x:1,y:1}], loopMode: 'loop' });
  assertEq(reg.listPOIs().length, 3, 'list size');
});

test('T2.7 listByType(waypoint) → tylko waypoint', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  reg.createPOI({ type: 'waypoint', name: 'A', point: {x:0,y:0} });
  reg.createPOI({ type: 'patrol', name: 'P', waypoints: [{x:0,y:0},{x:1,y:1}], loopMode: 'loop' });
  const wps = reg.listByType('waypoint');
  assertEq(wps.length, 1, 'waypoint list size');
  assertEq(wps[0].name, 'A', 'waypoint name');
});

test('T2.8 deletePOI → ok, emit poi:deleted z {poiId, name}, getPOI=null', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  const c = reg.createPOI({ type: 'waypoint', name: 'Alfa', point: {x:0,y:0} });
  const cap = captureEvent('poi:deleted');
  try {
    const d = reg.deletePOI(c.poiId);
    assertEq(d, { ok: true }, 'delete result');
    assertEq(cap.captured.length, 1, 'emit count');
    assertEq(cap.captured[0], { poiId: 'poi_1', name: 'Alfa' }, 'emit payload');
    assertNull(reg.getPOI(c.poiId), 'getPOI after delete');
  } finally {
    cap.detach();
  }
});

// ──────────────────────────────────────────────────────────────────────────
// T3 — Feature flag gate (anti-pattern proof per L1)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T3 — Feature flag gate]');

test('T3.1 poiSystem=false → createPOI feature_disabled, brak emit', () => {
  resetState();
  GAME_CONFIG.FEATURES.poiSystem = false;
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  const cap = captureEvent('poi:created');
  try {
    const r = reg.createPOI({ type: 'waypoint', name: 'X', point: {x:0,y:0} });
    assertEq(r, { ok: false, reason: 'feature_disabled' }, 'result');
    assertEq(cap.captured.length, 0, 'no emit');
  } finally {
    cap.detach();
    GAME_CONFIG.FEATURES.poiSystem = true;
  }
});

test('T3.2 poiSystem=false → deletePOI feature_disabled, brak emit', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  reg.createPOI({ type: 'waypoint', name: 'X', point: {x:0,y:0} });  // Setup z flag=true
  GAME_CONFIG.FEATURES.poiSystem = false;
  const cap = captureEvent('poi:deleted');
  try {
    const r = reg.deletePOI('poi_1');
    assertEq(r, { ok: false, reason: 'feature_disabled' }, 'result');
    assertEq(cap.captured.length, 0, 'no emit');
  } finally {
    cap.detach();
    GAME_CONFIG.FEATURES.poiSystem = true;
  }
});

test('T3.3 anti-pattern proof — imported GAME_CONFIG mutation widoczna w POIRegistry', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  // Mutuj imported singleton — POIRegistry musi to widzieć (nie window.GAME_CONFIG)
  GAME_CONFIG.FEATURES.poiSystem = false;
  const r1 = reg.createPOI({ type: 'waypoint', name: 'X', point: {x:0,y:0} });
  assertEq(r1.reason, 'feature_disabled', 'OFF widoczne');
  GAME_CONFIG.FEATURES.poiSystem = true;
  const r2 = reg.createPOI({ type: 'waypoint', name: 'X', point: {x:0,y:0} });
  assertEq(r2.ok, true, 'ON znów działa');
});

// ──────────────────────────────────────────────────────────────────────────
// T4 — initPOISubdomain lifecycle
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T4 — initPOISubdomain lifecycle]');

test('T4.1 świeża gra (pois undefined) → init creates {}, _nextId=1', () => {
  resetState();
  // Reset wpisuje pois:{} (z createDefaultState po D3 fix). Symuluj świeższy stan przed D3:
  delete gameState._state.pois;
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  assertEq(gameState.get('pois'), {}, 'pois w state');
  assertEq(reg._nextId, 1, '_nextId');
});

test('T4.2 load save (pois preset) → init NIE nadpisuje, _nextId reconstructed', () => {
  resetState();
  // Symuluj load: gameState.set z istniejącymi POI (poi_1, poi_5)
  gameState.set('pois', {
    poi_1: { id: 'poi_1', type: 'waypoint', name: 'A', point: {x:0,y:0} },
    poi_5: { id: 'poi_5', type: 'waypoint', name: 'E', point: {x:5,y:5} },
  }, 'load_test');
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  // POI nie zostały nadpisane
  const pois = gameState.get('pois');
  assertEq(Object.keys(pois).sort(), ['poi_1','poi_5'], 'keys preserved');
  // _nextId = max(1,5) + 1 = 6
  assertEq(reg._nextId, 6, '_nextId reconstructed');
});

test('T4.3 idempotency — drugi call init bez efektu', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  reg.createPOI({ type: 'waypoint', name: 'A', point: {x:0,y:0} });
  const stateBefore = JSON.stringify(gameState.get('pois'));
  const nextIdBefore = reg._nextId;
  reg.initPOISubdomain();  // 2nd call
  assertEq(JSON.stringify(gameState.get('pois')), stateBefore, 'state unchanged');
  // _nextId reconstructed z istniejącego poi_1 → max=1, +1 = 2 (== nextIdBefore)
  assertEq(reg._nextId, nextIdBefore, '_nextId stable');
});

// ──────────────────────────────────────────────────────────────────────────
// T5 — MOS _onPOIDeletedHandler (replika logic z mock _byVessel)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T5 — MOS _onPOIDeletedHandler]');

// Replika logic z MOS._onPOIDeletedHandler — instancjacja real MOS wymaga vesselManager DI,
// prościej standalone z trzymanym shape.
function makeMosShadow() {
  const blockedCalls = [];
  const byVessel = new Map();
  return {
    _byVessel: byVessel,
    _blockAndCancel: (vessel, order, reason) => {
      blockedCalls.push({ vesselId: vessel.id, orderId: order.id, reason });
      order.status = 'blocked';
      order.blockReason = reason;
      byVessel.delete(vessel.id);
    },
    _vm: {
      getVessel: (vId) => byVessel.has(vId) ? { id: vId } : null,
    },
    _blockedCalls: blockedCalls,
    onPOIDeleted(poiId) {
      if (!GAME_CONFIG.FEATURES.poiSystem) return;
      for (const [vId, order] of [...this._byVessel.entries()]) {
        if (order.poiId === poiId && order.status === 'active') {
          const vessel = this._vm.getVessel?.(vId);
          if (vessel) this._blockAndCancel(vessel, order, 'poi_deleted');
        }
      }
    },
  };
}

test('T5.1 deletePOI(poi_5) gdy vessel ma order.poiId=poi_5 active → blocked', () => {
  GAME_CONFIG.FEATURES.poiSystem = true;
  const mos = makeMosShadow();
  mos._byVessel.set('v_1', { id: 'mo_1', poiId: 'poi_5', status: 'active' });
  mos.onPOIDeleted('poi_5');
  assertEq(mos._blockedCalls.length, 1, 'blocked count');
  assertEq(mos._blockedCalls[0].reason, 'poi_deleted', 'reason');
});

test('T5.2 deletePOI(poi_5) gdy order.poiId=poi_3 (inny) → NIE blocked', () => {
  GAME_CONFIG.FEATURES.poiSystem = true;
  const mos = makeMosShadow();
  mos._byVessel.set('v_1', { id: 'mo_1', poiId: 'poi_3', status: 'active' });
  mos.onPOIDeleted('poi_5');
  assertEq(mos._blockedCalls.length, 0, 'no block');
});

test('T5.3 deletePOI(poi_5) gdy poiId=poi_5 ale status=completed → NIE blocked', () => {
  GAME_CONFIG.FEATURES.poiSystem = true;
  const mos = makeMosShadow();
  mos._byVessel.set('v_1', { id: 'mo_1', poiId: 'poi_5', status: 'completed' });
  mos.onPOIDeleted('poi_5');
  assertEq(mos._blockedCalls.length, 0, 'no block (completed status)');
});

// ──────────────────────────────────────────────────────────────────────────
// T6 — soft cap warning (console.warn capture, try/finally restore)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T6 — soft cap warning]');

test('T6.1 createPOI 101× → console.warn called dla 101st', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args);
  try {
    for (let i = 0; i < 101; i++) {
      reg.createPOI({ type: 'waypoint', name: `WP_${i}`, point: {x:i,y:i} });
    }
    assertTrue(warns.length >= 1, 'console.warn wołane co najmniej raz');
    const lastWarn = warns[warns.length - 1].join(' ');
    assertTrue(/POI count exceeded/.test(lastWarn), `last warn message zawiera 'POI count exceeded': ${lastWarn}`);
  } finally {
    console.warn = origWarn;  // restore even on throw
  }
});

// ──────────────────────────────────────────────────────────────────────────
// T7 — events payload verification
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[T7 — events payload]');

test('T7.1 poi:created payload zawiera całe poi (id, type, name, ownerEmpireId, createdYear, point)', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  const cap = captureEvent('poi:created');
  try {
    reg.createPOI({ type: 'waypoint', name: 'X', point: {x:5,y:7} });
    assertEq(cap.captured.length, 1, 'emit count');
    const poi = cap.captured[0].poi;
    assertEq(poi.id, 'poi_1', 'id');
    assertEq(poi.type, 'waypoint', 'type');
    assertEq(poi.name, 'X', 'name');
    assertEq(poi.ownerEmpireId, 'player', 'default ownerEmpireId');
    assertEq(typeof poi.createdYear, 'number', 'createdYear is number');
    assertEq(poi.point, {x:5,y:7}, 'point per-type field');
  } finally {
    cap.detach();
  }
});

test('T7.2 poi:updated payload {poiId, poi:merged}', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  const c = reg.createPOI({ type: 'waypoint', name: 'X', point: {x:0,y:0} });
  const cap = captureEvent('poi:updated');
  try {
    reg.updatePOI(c.poiId, { name: 'X2' });
    assertEq(cap.captured.length, 1, 'emit count');
    assertEq(cap.captured[0].poiId, c.poiId, 'poiId');
    assertEq(cap.captured[0].poi.name, 'X2', 'merged name');
    assertEq(cap.captured[0].poi.id, c.poiId, 'id preserved');
  } finally {
    cap.detach();
  }
});

test('T7.3 poi:deleted payload {poiId, name} (D1 verification)', () => {
  resetState();
  const reg = new POIRegistry();
  reg.initPOISubdomain();
  const c = reg.createPOI({ type: 'waypoint', name: 'NameToCapture', point: {x:0,y:0} });
  const cap = captureEvent('poi:deleted');
  try {
    reg.deletePOI(c.poiId);
    assertEq(cap.captured.length, 1, 'emit count');
    assertEq(cap.captured[0], { poiId: c.poiId, name: 'NameToCapture' }, 'payload {poiId, name}');
  } finally {
    cap.detach();
  }
});

// ──────────────────────────────────────────────────────────────────────────
// SUMMARY
// ──────────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
if (failures.length > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`  - ${f.name}`);
    console.log(`    ${f.err.stack ?? f.err.message}`);
  }
  process.exit(1);
}
console.log('All M2b C5 smoke tests PASSED ✅');
