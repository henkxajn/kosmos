// Smoke test M2b Commit 2 — IntelSystem.vessels sub-domain + intelContactState=true
//
// Pokrywa T1-T6 (~22 cases):
//   T1 _observeVessel transitions (rumor@>=0.3, contact@<0.3, no-downgrade, sameFaction, direction)
//   T2 _onVesselProximityExit (single observer, multi-observer)
//   T3 _tickVesselDegradation (5/10/20 civYears, positionKnown skip, below threshold)
//   T4 feature flag OFF gate (handlery + ticker NO-OP)
//   T5 public API (getVesselContact, advance/degrade success+invalid)
//   T6 _onVesselWrecked (with/without record)
//
// Run: node tmp_m2b_c2_intel_test.mjs

// ── Stub browser globals (PRZED importami) ─────────────────────────────────
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => (_lsStore.has(k) ? _lsStore.get(k) : null),
  setItem:    (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;
// IntelSystem (post-fix) używa `import { GAME_CONFIG }` — mutujemy imported
// singleton w setup(). window.GAME_CONFIG zostawiamy undefined żeby T7.1
// mogło asercjonować że pre-fix pattern (window-based) NIE jest używany.
globalThis.window.KOSMOS = {
  timeSystem: { gameTime: 0 },
  vesselManager: null,    // zostanie ustawiony per test
  proximitySystem: null,  // zostanie ustawiony per test
  empireRegistry: { get: () => null, listAll: () => [] },
  homePlanet: null,
  galaxyData: null,
};

// Math.random fix dla deterministycznego _estimateStrength (noise = 0.5+random → 1.0)
const _origRandom = Math.random;
Math.random = () => 0.5;

// ── Imports (real singletons) ──────────────────────────────────────────────
const EventBus  = (await import('./src/core/EventBus.js')).default;
const gameState = (await import('./src/core/GameState.js')).default;
const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
const { IntelSystem } = await import('./src/systems/IntelSystem.js');

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

function assertNull(val, label) {
  if (val !== null && val !== undefined) {
    throw new Error(`${label}: expected null/undefined, got ${JSON.stringify(val)}`);
  }
}

// ── Setup helper ───────────────────────────────────────────────────────────
let intelSys = null;
let emittedEvents = [];

function setup({ vessels = {}, pairs = {}, gameYear = 0, flag = true } = {}) {
  // Reset singletons
  EventBus.clear();
  gameState.reset();

  // Mutuj imported GAME_CONFIG singleton (live reference — IntelSystem czyta z importu)
  GAME_CONFIG.FEATURES.intelContactState = flag;

  // Mock KOSMOS
  globalThis.window.KOSMOS.timeSystem.gameTime = gameYear;
  globalThis.window.KOSMOS.vesselManager = {
    getVessel: (id) => vessels[id] ?? null,
  };
  globalThis.window.KOSMOS.proximitySystem = {
    getActivePairsFor: (id) => pairs[id] ?? [],
  };

  // Świeża instancja systemu (subskrybuje na czystym EventBus)
  intelSys = new IntelSystem();

  // Capture emitów po instancjacji systemu (jego subskrypcje już są zarejestrowane)
  emittedEvents = [];
  EventBus.on('intel:vesselContactChanged', (e) => emittedEvents.push({ name: 'intel:vesselContactChanged', data: e }));
  EventBus.on('intel:vesselContactLost',    (e) => emittedEvents.push({ name: 'intel:vesselContactLost', data: e }));
}

function emitsOf(name) {
  return emittedEvents.filter(e => e.name === name).map(e => e.data);
}

// ──────────────────────────────────────────────────────────────────────────
// T1 — _observeVessel transitions
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T1: _observeVessel transitions ===');

test('T1.1 unknown → rumor przy distanceAU=0.5 (>=0.3)', () => {
  setup({
    vessels: {
      v_p: { ownerEmpireId: 'player', position: { x: 0, y: 0 } },
      v_e: { ownerEmpireId: 'enemy_1', position: { x: 5, y: 5 }, combatStrength: 100 },
    },
    gameYear: 10,
  });
  EventBus.emit('vessel:proximityEnter', {
    vesselAId: 'v_p', vesselBId: 'v_e', distanceAU: 0.5, sameFaction: false,
  });
  const rec = gameState.get('intel.vessels.v_e');
  assertEq(rec.quality, 'rumor', 'quality');
  assertEq(rec.positionKnown, true, 'positionKnown');
  assertEq(rec.positionLastKnown, { x: 5, y: 5 }, 'positionLastKnown');
  assertTrue(typeof rec.strengthEstimate === 'number', 'strengthEstimate is number');
  const emits = emitsOf('intel:vesselContactChanged');
  assertEq(emits.length, 1, 'emit count');
  assertEq(emits[0].oldQuality, 'unknown', 'oldQuality');
  assertEq(emits[0].newQuality, 'rumor',   'newQuality');
});

test('T1.2 rumor → contact przy distanceAU=0.2 (<0.3)', () => {
  setup({
    vessels: {
      v_p: { ownerEmpireId: 'player', position: { x: 0, y: 0 } },
      v_e: { ownerEmpireId: 'enemy_1', position: { x: 1, y: 1 }, combatStrength: 50 },
    },
    gameYear: 5,
  });
  // Pre-state: rumor (observe at 0.5)
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_p', vesselBId: 'v_e', distanceAU: 0.5, sameFaction: false });
  emittedEvents = []; // clear baseline
  // Now closer
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_p', vesselBId: 'v_e', distanceAU: 0.2, sameFaction: false });
  const rec = gameState.get('intel.vessels.v_e');
  assertEq(rec.quality, 'contact', 'quality');
  const emits = emitsOf('intel:vesselContactChanged');
  assertEq(emits.length, 1, 'emit count after upgrade');
  assertEq(emits[0].oldQuality, 'rumor',   'oldQuality');
  assertEq(emits[0].newQuality, 'contact', 'newQuality');
});

test('T1.3 contact NIE downgrade przy distanceAU=0.5 (lastSeenYear updated, no emit)', () => {
  setup({
    vessels: {
      v_p: { ownerEmpireId: 'player', position: { x: 0, y: 0 } },
      v_e: { ownerEmpireId: 'enemy_1', position: { x: 1, y: 1 }, combatStrength: 50 },
    },
    gameYear: 5,
  });
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_p', vesselBId: 'v_e', distanceAU: 0.1, sameFaction: false });
  emittedEvents = [];
  globalThis.window.KOSMOS.timeSystem.gameTime = 20; // czas się przesunął
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_p', vesselBId: 'v_e', distanceAU: 0.5, sameFaction: false });
  const rec = gameState.get('intel.vessels.v_e');
  assertEq(rec.quality, 'contact', 'quality unchanged');
  assertEq(rec.lastSeenYear, 20, 'lastSeenYear updated');
  assertEq(rec.positionKnown, true, 'positionKnown true');
  const emits = emitsOf('intel:vesselContactChanged');
  assertEq(emits.length, 0, 'no emit for no-quality-change');
});

test('T1.4 sameFaction skip — record nie utworzony, brak emit', () => {
  setup({
    vessels: {
      v_p1: { ownerEmpireId: 'player', position: { x: 0, y: 0 } },
      v_p2: { ownerEmpireId: 'player', position: { x: 1, y: 1 } },
    },
  });
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_p1', vesselBId: 'v_p2', distanceAU: 0.2, sameFaction: true });
  assertNull(gameState.get('intel.vessels.v_p2'), 'no record');
  assertEq(emitsOf('intel:vesselContactChanged').length, 0, 'no emit');
});

test('T1.5 player observuje enemy, niezależnie od kolejności A/B', () => {
  setup({
    vessels: {
      v_p: { ownerEmpireId: 'player', position: { x: 0, y: 0 } },
      v_e: { ownerEmpireId: 'enemy_1', position: { x: 1, y: 1 }, combatStrength: 30 },
    },
  });
  // Case 1: enemy=A, player=B → observed=enemy
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_e', vesselBId: 'v_p', distanceAU: 0.4, sameFaction: false });
  assertTrue(!!gameState.get('intel.vessels.v_e'), 'record for enemy (A)');
  assertNull(gameState.get('intel.vessels.v_p'), 'no record for player');

  // Reset i case 2: player=A, enemy=B → observed=enemy
  setup({
    vessels: {
      v_p: { ownerEmpireId: 'player', position: { x: 0, y: 0 } },
      v_e: { ownerEmpireId: 'enemy_1', position: { x: 1, y: 1 }, combatStrength: 30 },
    },
  });
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_p', vesselBId: 'v_e', distanceAU: 0.4, sameFaction: false });
  assertTrue(!!gameState.get('intel.vessels.v_e'), 'record for enemy (B)');
  assertNull(gameState.get('intel.vessels.v_p'), 'no record for player');
});

// ──────────────────────────────────────────────────────────────────────────
// T2 — _onVesselProximityExit
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T2: _onVesselProximityExit ===');

test('T2.1 single observer exit → positionKnown=false, positionLastKnown UNCHANGED', () => {
  setup({
    vessels: {
      v_p: { ownerEmpireId: 'player', position: { x: 0, y: 0 } },
      v_e: { ownerEmpireId: 'enemy_1', position: { x: 5, y: 7 }, combatStrength: 100 },
    },
    pairs: {}, // żadnych aktywnych par po exit
  });
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_p', vesselBId: 'v_e', distanceAU: 0.5, sameFaction: false });
  const before = gameState.get('intel.vessels.v_e');
  assertEq(before.positionLastKnown, { x: 5, y: 7 }, 'pre-exit positionLastKnown');

  EventBus.emit('vessel:proximityExit', { vesselAId: 'v_p', vesselBId: 'v_e', sameFaction: false });
  const after = gameState.get('intel.vessels.v_e');
  assertEq(after.positionKnown, false, 'positionKnown false');
  assertEq(after.positionLastKnown, { x: 5, y: 7 }, 'positionLastKnown frozen');
  assertEq(after.quality, 'rumor', 'quality unchanged');
});

test('T2.2 multi-observer: jeden exit, drugi player observer trzyma → positionKnown stays true', () => {
  setup({
    vessels: {
      v_p1: { ownerEmpireId: 'player', position: { x: 0, y: 0 } },
      v_p2: { ownerEmpireId: 'player', position: { x: 0, y: 1 } },
      v_e:  { ownerEmpireId: 'enemy_1', position: { x: 5, y: 7 }, combatStrength: 100 },
    },
    // Po proximityExit (v_p1↔v_e), v_e ma jeszcze parę z v_p2
    pairs: { v_e: ['v_p2'], v_p2: ['v_e'] },
  });
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_p1', vesselBId: 'v_e', distanceAU: 0.4, sameFaction: false });
  EventBus.emit('vessel:proximityExit',  { vesselAId: 'v_p1', vesselBId: 'v_e', sameFaction: false });
  const rec = gameState.get('intel.vessels.v_e');
  assertEq(rec.positionKnown, true, 'positionKnown stays true (v_p2 still observes)');
});

// ──────────────────────────────────────────────────────────────────────────
// T3 — _tickVesselDegradation
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T3: _tickVesselDegradation ===');

test('T3.1 detailed → contact po 5 civYears', () => {
  setup({ gameYear: 5 });
  gameState.set('intel.vessels.v_x', {
    quality: 'detailed', firstSeenYear: 0, lastSeenYear: 0,
    positionKnown: false, positionLastKnown: { x: 1, y: 2 },
    strengthEstimate: 50, hullKnown: true, modulesKnown: true,
  }, 'test_setup');
  emittedEvents = [];
  intelSys._tickVesselDegradation(1);
  const rec = gameState.get('intel.vessels.v_x');
  assertEq(rec.quality, 'contact', 'quality');
  const emits = emitsOf('intel:vesselContactChanged');
  assertEq(emits.length, 1, 'emit count');
  assertEq(emits[0].newQuality, 'contact', 'newQuality');
  assertEq(emits[0].reason, 'vessel_contact_aged_out', 'reason');
});

test('T3.2 contact → rumor po 10 civYears', () => {
  setup({ gameYear: 10 });
  gameState.set('intel.vessels.v_x', {
    quality: 'contact', firstSeenYear: 0, lastSeenYear: 0,
    positionKnown: false, positionLastKnown: null,
    strengthEstimate: 50, hullKnown: false, modulesKnown: false,
  }, 'test_setup');
  emittedEvents = [];
  intelSys._tickVesselDegradation(1);
  const rec = gameState.get('intel.vessels.v_x');
  assertEq(rec.quality, 'rumor', 'quality');
  assertEq(emitsOf('intel:vesselContactChanged').length, 1, 'emit count');
});

test('T3.3 rumor → removed po 20 civYears + emit vesselContactLost reason:timeout', () => {
  setup({ gameYear: 20 });
  gameState.set('intel.vessels.v_x', {
    quality: 'rumor', firstSeenYear: 0, lastSeenYear: 0,
    positionKnown: false, positionLastKnown: { x: 9, y: 9 },
    strengthEstimate: 30, hullKnown: false, modulesKnown: false,
  }, 'test_setup');
  emittedEvents = [];
  intelSys._tickVesselDegradation(1);
  assertNull(gameState.get('intel.vessels.v_x'), 'record removed');
  const emits = emitsOf('intel:vesselContactLost');
  assertEq(emits.length, 1, 'emit count');
  assertEq(emits[0].reason, 'timeout', 'reason');
  assertEq(emits[0].lastKnownPosition, { x: 9, y: 9 }, 'lastKnownPosition forwarded');
});

test('T3.4 positionKnown=true skip degradation (vessel w zasięgu)', () => {
  setup({ gameYear: 100 });
  gameState.set('intel.vessels.v_x', {
    quality: 'detailed', firstSeenYear: 0, lastSeenYear: 0,
    positionKnown: true, positionLastKnown: { x: 1, y: 2 },
    strengthEstimate: 50, hullKnown: true, modulesKnown: true,
  }, 'test_setup');
  emittedEvents = [];
  intelSys._tickVesselDegradation(1);
  const rec = gameState.get('intel.vessels.v_x');
  assertEq(rec.quality, 'detailed', 'quality unchanged (positionKnown skip)');
  assertEq(emitsOf('intel:vesselContactChanged').length, 0, 'no emit');
});

test('T3.5 below threshold (4 civYears) → no change for detailed', () => {
  setup({ gameYear: 4 });
  gameState.set('intel.vessels.v_x', {
    quality: 'detailed', firstSeenYear: 0, lastSeenYear: 0,
    positionKnown: false, positionLastKnown: null,
    strengthEstimate: 50, hullKnown: false, modulesKnown: false,
  }, 'test_setup');
  emittedEvents = [];
  intelSys._tickVesselDegradation(1);
  assertEq(gameState.get('intel.vessels.v_x').quality, 'detailed', 'quality unchanged');
  assertEq(emitsOf('intel:vesselContactChanged').length, 0, 'no emit');
});

// ──────────────────────────────────────────────────────────────────────────
// T4 — feature flag gate (intelContactState=false → NO-OP)
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T4: feature flag gate OFF ===');

test('T4.1 flag=false → handlery NO-OP (record nie utworzony, brak emit)', () => {
  setup({
    flag: false,
    vessels: {
      v_p: { ownerEmpireId: 'player', position: { x: 0, y: 0 } },
      v_e: { ownerEmpireId: 'enemy_1', position: { x: 1, y: 1 } },
    },
  });
  EventBus.emit('vessel:proximityEnter', { vesselAId: 'v_p', vesselBId: 'v_e', distanceAU: 0.2, sameFaction: false });
  assertNull(gameState.get('intel.vessels.v_e'), 'no record');
  assertEq(emitsOf('intel:vesselContactChanged').length, 0, 'no emit');
});

test('T4.2 flag=false → _tickVesselDegradation NO-OP (z _passiveTick path)', () => {
  setup({ flag: false, gameYear: 100 });
  gameState.set('intel.vessels.v_x', {
    quality: 'detailed', firstSeenYear: 0, lastSeenYear: 0,
    positionKnown: false, positionLastKnown: null,
    strengthEstimate: 50, hullKnown: false, modulesKnown: false,
  }, 'test_setup');
  // _passiveTick wczyta flagę — gdy false, nie wywoła _tickVesselDegradation.
  // (Test ścieżki: gdy explicite woła _tickVesselDegradation z poziomu testu,
  //  ticker NIE ma własnego gate'u — to gate w _passiveTick. Sprawdzamy że
  //  IntelSystem nie wywoła ticker'a sam z czasem.)
  intelSys._passiveTick(50); // > wszystkich timeoutów
  const rec = gameState.get('intel.vessels.v_x');
  // _passiveTick przy braku homePlanet/galaxyData wraca wcześnie — vessel ticker
  // jest w nim za if(flag). Z flagą false → nie powinien zostać wywołany.
  assertEq(rec?.quality, 'detailed', 'quality unchanged (flag OFF blocks ticker in _passiveTick)');
});

// ──────────────────────────────────────────────────────────────────────────
// T5 — Public API
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T5: Public API ===');

test('T5.1 getVesselContact zwraca record lub null', () => {
  setup();
  assertNull(intelSys.getVesselContact('v_missing'), 'missing → null');
  gameState.set('intel.vessels.v_x', { quality: 'rumor' }, 'test');
  assertEq(intelSys.getVesselContact('v_x').quality, 'rumor', 'existing → record');
});

test('T5.2 advanceVesselContact rumor → contact: emit + return true', () => {
  setup({ gameYear: 5 });
  gameState.set('intel.vessels.v_x', {
    quality: 'rumor', firstSeenYear: 0, lastSeenYear: 0,
    positionKnown: false, positionLastKnown: null,
    strengthEstimate: 30, hullKnown: false, modulesKnown: false,
  }, 'test');
  emittedEvents = [];
  const result = intelSys.advanceVesselContact('v_x', 'contact', 'manual_test');
  assertEq(result, true, 'returns true');
  assertEq(gameState.get('intel.vessels.v_x').quality, 'contact', 'quality');
  assertEq(emitsOf('intel:vesselContactChanged').length, 1, 'emit count');
});

test('T5.3 advanceVesselContact contact → rumor: NO-OP, return false', () => {
  setup();
  gameState.set('intel.vessels.v_x', { quality: 'contact' }, 'test');
  emittedEvents = [];
  const result = intelSys.advanceVesselContact('v_x', 'rumor', 'bad_downgrade');
  assertEq(result, false, 'returns false');
  assertEq(gameState.get('intel.vessels.v_x').quality, 'contact', 'unchanged');
  assertEq(emitsOf('intel:vesselContactChanged').length, 0, 'no emit');
});

test('T5.4 degradeVesselContact contact → rumor: emit + return true', () => {
  setup();
  gameState.set('intel.vessels.v_x', { quality: 'contact' }, 'test');
  emittedEvents = [];
  const result = intelSys.degradeVesselContact('v_x', 'rumor', 'manual_test');
  assertEq(result, true, 'returns true');
  assertEq(gameState.get('intel.vessels.v_x').quality, 'rumor', 'quality');
  assertEq(emitsOf('intel:vesselContactChanged').length, 1, 'emit count');
});

test('T5.5 degradeVesselContact rumor → contact: NO-OP (no upgrade), return false', () => {
  setup();
  gameState.set('intel.vessels.v_x', { quality: 'rumor' }, 'test');
  emittedEvents = [];
  const result = intelSys.degradeVesselContact('v_x', 'contact', 'bad_upgrade');
  assertEq(result, false, 'returns false');
  assertEq(gameState.get('intel.vessels.v_x').quality, 'rumor', 'unchanged');
  assertEq(emitsOf('intel:vesselContactChanged').length, 0, 'no emit');
});

test('T5.6 invalid quality string → return false (no crash)', () => {
  setup();
  gameState.set('intel.vessels.v_x', { quality: 'rumor' }, 'test');
  assertEq(intelSys.advanceVesselContact('v_x', 'bogus', 'test'), false, 'advance invalid');
  assertEq(intelSys.degradeVesselContact('v_x', 'bogus', 'test'), false, 'degrade invalid');
  assertEq(gameState.get('intel.vessels.v_x').quality, 'rumor', 'unchanged');
});

// ──────────────────────────────────────────────────────────────────────────
// T6 — _onVesselWrecked
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T6: _onVesselWrecked ===');

test('T6.1 wrecked z istniejącym record → removed + emit vesselContactLost reason:wrecked', () => {
  setup();
  gameState.set('intel.vessels.v_x', {
    quality: 'contact', firstSeenYear: 0, lastSeenYear: 0,
    positionKnown: false, positionLastKnown: { x: 4, y: 8 },
    strengthEstimate: 50, hullKnown: false, modulesKnown: false,
  }, 'test');
  emittedEvents = [];
  EventBus.emit('vessel:wrecked', { vesselId: 'v_x' });
  assertNull(gameState.get('intel.vessels.v_x'), 'record removed');
  const emits = emitsOf('intel:vesselContactLost');
  assertEq(emits.length, 1, 'emit count');
  assertEq(emits[0].reason, 'wrecked', 'reason');
  assertEq(emits[0].lastKnownPosition, { x: 4, y: 8 }, 'lastKnownPosition');
});

test('T6.2 wrecked bez record → no-op, no crash, no emit', () => {
  setup();
  emittedEvents = [];
  EventBus.emit('vessel:wrecked', { vesselId: 'v_unknown' });
  assertEq(emitsOf('intel:vesselContactLost').length, 0, 'no emit');
});

// ──────────────────────────────────────────────────────────────────────────
// T7 — Post-playtest fix: imported GAME_CONFIG (regression proof) + fresh-game init
// ──────────────────────────────────────────────────────────────────────────

console.log('\n=== T7: imported GAME_CONFIG + fresh-game init ===');

test('T7.1 IntelSystem używa imported GAME_CONFIG (window.GAME_CONFIG=undefined → handler nadal działa)', () => {
  setup({
    vessels: {
      v_p: { ownerEmpireId: 'player', position: { x: 0, y: 0 } },
      v_e: { ownerEmpireId: 'enemy_1', position: { x: 1, y: 1 }, combatStrength: 50 },
    },
  });
  // Symulacja braku window.GAME_CONFIG (jak w real-flow świeżej gry).
  // GAME_CONFIG.FEATURES.intelContactState pozostaje true (imported singleton, set w setup()).
  delete globalThis.window.GAME_CONFIG;

  EventBus.emit('vessel:proximityEnter', {
    vesselAId: 'v_p', vesselBId: 'v_e', distanceAU: 0.4, sameFaction: false,
  });

  // PRE-FIX BEHAVIOR: handler patrzy `!window.GAME_CONFIG?.FEATURES?.intelContactState`
  //   → window.GAME_CONFIG=undefined → !undefined → true → return → NO-OP → record null
  // POST-FIX BEHAVIOR: handler patrzy `!GAME_CONFIG.FEATURES.intelContactState`
  //   → false (bo true) → no early return → record utworzony
  const rec = gameState.get('intel.vessels.v_e');
  if (!rec) {
    throw new Error('record nie utworzony — handler najpewniej używa window.GAME_CONFIG zamiast importu');
  }
  assertEq(rec.quality, 'rumor', 'quality');
});

test('T7.2 initVesselSubdomain() inicjalizuje intel.vessels = {} dla świeżej gry', () => {
  // Świeża gra symulacja: gameState.reset() zostawia intel jako {} (z createDefaultState),
  // bez sub-key 'vessels'. GameScene wywołuje initVesselSubdomain() po reset/restore.
  // (Constructor IntelSystem byłby bezskuteczny — GameScene resetuje state po
  // instancjacji systemu.)
  EventBus.clear();
  gameState.reset();
  GAME_CONFIG.FEATURES.intelContactState = true;
  globalThis.window.KOSMOS = {
    timeSystem: { gameTime: 0 }, vesselManager: null, proximitySystem: null,
    empireRegistry: { get: () => null, listAll: () => [] },
    homePlanet: null, galaxyData: null,
  };
  const sys = new IntelSystem();
  // Pre-init (po samym new IntelSystem) — intel.vessels NIE istnieje (constructor
  // nie inicjalizuje, to jest właśnie pointa)
  const beforeInit = gameState.get('intel.vessels');
  if (beforeInit !== undefined) {
    throw new Error(`oczekiwano undefined intel.vessels po samym new IntelSystem (constructor nie powinien init'ować — robi to GameScene), got ${JSON.stringify(beforeInit)}`);
  }
  // Symulacja wywołania z GameScene
  sys.initVesselSubdomain();
  assertEq(gameState.get('intel.vessels'), {}, 'intel.vessels initialized to empty object');
});

test('T7.3 initVesselSubdomain() NIE nadpisuje istniejącego intel.vessels (idempotent)', () => {
  EventBus.clear();
  gameState.reset();
  // Pre-state: intel.vessels już istnieje (np. z migracji v66→v67 + load)
  gameState.set('intel.vessels.v_legacy', { quality: 'detailed' }, 'pre_existing');
  GAME_CONFIG.FEATURES.intelContactState = true;
  globalThis.window.KOSMOS = {
    timeSystem: { gameTime: 0 }, vesselManager: null, proximitySystem: null,
    empireRegistry: { get: () => null, listAll: () => [] },
    homePlanet: null, galaxyData: null,
  };
  const sys = new IntelSystem();
  sys.initVesselSubdomain();  // powinno zachować v_legacy
  const rec = gameState.get('intel.vessels.v_legacy');
  assertEq(rec?.quality, 'detailed', 'pre-existing v_legacy preserved');
});

// ──────────────────────────────────────────────────────────────────────────
// Wynik
// ──────────────────────────────────────────────────────────────────────────

// Cleanup — przywróć default (test T4 mutował przez setup())
GAME_CONFIG.FEATURES.intelContactState = true;
Math.random = _origRandom; // restore

console.log(`\n======================================`);
console.log(`Wynik: ${passed} PASS, ${failed} FAIL  (łącznie ${passed + failed})`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const { name, err } of failures) {
    console.log(`  - ${name}\n    ${err.message}`);
  }
  process.exit(1);
}
console.log('Wszystkie smoke testy GREEN.');
process.exit(0);
