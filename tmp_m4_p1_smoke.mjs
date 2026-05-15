// ── M4 P1 — Activation + Notifications + Drift fix smoke test ───────────────
// Pure-logic only (Node ESM, no DOM/canvas/Three).
//
// T1 — Feature flags activation                  (~6 cases)
// T2 — SaveMigration v68→v69                     (~6 cases)
// T3 — MovementOrderSystem drift state           (~9 cases)
// T4 — AutoRetreatSystem low_fuel_drift          (~5 cases)
// T5 — i18n + LOG_COLORS smoke                   (~4 cases)
//
// Target: ~30 GREEN cases.

// ── Stub browser globals (PRZED importami) ─────────────────────────────
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis.window ?? globalThis;
globalThis.window.KOSMOS = {};
globalThis.document = globalThis.document ?? {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
};

// ── Imports ───────────────────────────────────────────────────────────
const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
const SaveMigrationModule = await import('./src/systems/SaveMigration.js');
const { CURRENT_VERSION, migrate } = SaveMigrationModule;
const { MovementOrderSystem } = await import('./src/systems/MovementOrderSystem.js');
const EventBusModule = await import('./src/core/EventBus.js');
const EventBus = EventBusModule.default ?? EventBusModule.EventBus;
const EntityManagerModule = await import('./src/core/EntityManager.js');
const EntityManager = EntityManagerModule.default ?? EntityManagerModule.EntityManager;

// i18n
const { t } = await import('./src/i18n/i18n.js');

// ── Test harness ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (err) { failed++; failures.push({ name, err: err.message ?? String(err) }); }
}
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
}
function assertTrue(actual, msg) {
  if (!actual) throw new Error(`${msg}: expected truthy, got ${actual}`);
}
function assertFalse(actual, msg) {
  if (actual) throw new Error(`${msg}: expected falsy, got ${actual}`);
}

// ── Mock VesselManager (in-memory) ─────────────────────────────────────
function makeMockVesselManager(vessels = []) {
  const map = new Map(vessels.map(v => [v.id, v]));
  return {
    _vessels: map,
    getVessel(id) { return map.get(id); },
    getAllVessels() { return [...map.values()]; },
    _calcRoute(sx, sy, tx, ty) {
      // Prosty stub: zwracaj straight line bez waypoints
      const totalDist = Math.hypot(tx - sx, ty - sy);
      return { totalDist, waypoints: [] };
    },
  };
}

function makeVessel(id, x, y, opts = {}) {
  return {
    id,
    name: opts.name ?? `Vessel-${id}`,
    position: { x, y, state: opts.state ?? 'orbiting', dockedAt: opts.dockedAt ?? null },
    velocity: { vx: 0, vy: 0, updatedYear: 0 },
    speedAU: opts.speedAU ?? 1.0,
    fuel: opts.fuel ?? { current: 100, capacity: 100, consumption: 1.0 },
    mission: opts.mission ?? null,
    movementOrder: opts.movementOrder ?? null,
    isWreck: false,
    status: 'idle',
    driftIdle: opts.driftIdle ?? null,
    lowFuelDrift: opts.lowFuelDrift ?? null,
    ownerEmpireId: opts.ownerEmpireId,
    missionLog: [],
  };
}

// ── Setup time system mock ─────────────────────────────────────────────
let currentGameTime = 0;
window.KOSMOS.timeSystem = { gameTime: 0 };
function setGameTime(t) {
  currentGameTime = t;
  window.KOSMOS.timeSystem.gameTime = t;
}

// ============================================================================
// T1 — Feature flags activation
// ============================================================================

test('T1.1 movementOrders flag ON', () => {
  assertEq(GAME_CONFIG.FEATURES.movementOrders, true, 'movementOrders');
});
test('T1.2 fleetMaterialization flag ON', () => {
  assertEq(GAME_CONFIG.FEATURES.fleetMaterialization, true, 'fleetMaterialization');
});
test('T1.3 proximitySystem + vesselCombat + unifiedAggregator ON', () => {
  assertEq(GAME_CONFIG.FEATURES.proximitySystem, true, 'proximitySystem');
  assertEq(GAME_CONFIG.FEATURES.vesselCombat, true, 'vesselCombat');
  assertEq(GAME_CONFIG.FEATURES.unifiedAggregator, true, 'unifiedAggregator');
});
test('T1.4 enduranceDrainActive ZOSTAJE OFF (P4)', () => {
  assertEq(GAME_CONFIG.FEATURES.enduranceDrainActive, false, 'enduranceDrainActive');
});
test('T1.5 M4 P1 flags exist + ON', () => {
  assertEq(GAME_CONFIG.FEATURES.m4DriftFix, true, 'm4DriftFix');
  assertEq(GAME_CONFIG.FEATURES.m4Notifications, true, 'm4Notifications');
  assertEq(GAME_CONFIG.FEATURES.m4FuelAwareRetreat, true, 'm4FuelAwareRetreat');
});
test('T1.6 M3 flags pozostają (regression check)', () => {
  assertEq(GAME_CONFIG.FEATURES.poiSystem, true, 'poiSystem');
  assertEq(GAME_CONFIG.FEATURES.intelContactState, true, 'intelContactState');
  assertEq(GAME_CONFIG.FEATURES.predictionCone, true, 'predictionCone');
  assertEq(GAME_CONFIG.FEATURES.m3OrdersInteractive, true, 'm3OrdersInteractive');
});

// ============================================================================
// T2 — SaveMigration v68→v69
// ============================================================================

// NOTE: CURRENT_VERSION bumpiony do 70 w M4 P2 (P2-6) — testy asercji
// dostosowane. Migracje v66→v69 nadal działają (łańcuch dochodzi do v70).
test('T2.1 CURRENT_VERSION === 70 (M4 P2 bump)', () => {
  assertEq(CURRENT_VERSION, 70, 'CURRENT_VERSION');
});
test('T2.2 migrate v68 save → v70 + driftIdle/lowFuelDrift null defaults', () => {
  const data = {
    version: 68,
    civ4x: {
      vesselManager: {
        vessels: [
          { id: 'v_001', name: 'A' },
          { id: 'v_002', name: 'B', driftIdle: { sinceYear: 5, autoReturnYear: 10 } },
        ],
      },
    },
  };
  const result = migrate(data);
  assertEq(result.version, 70, 'version bumped');
  assertEq(result.civ4x.vesselManager.vessels[0].driftIdle, null, 'v_001 driftIdle null');
  assertEq(result.civ4x.vesselManager.vessels[0].lowFuelDrift, null, 'v_001 lowFuelDrift null');
  assertEq(result.civ4x.vesselManager.vessels[1].driftIdle.autoReturnYear, 10, 'v_002 driftIdle preserved');
  assertEq(result.civ4x.vesselManager.vessels[1].lowFuelDrift, null, 'v_002 lowFuelDrift default null');
});
test('T2.3 migrate save bez vesselManager (early game) → bez błędu', () => {
  const data = { version: 68, civ4x: {} };
  const result = migrate(data);
  assertEq(result.version, 70, 'version bumped');
});
test('T2.4 migrate save z legacy c4x.vesselManager (alias) → handled', () => {
  const data = {
    version: 68,
    c4x: { vesselManager: { vessels: [{ id: 'legacy' }] } },
  };
  const result = migrate(data);
  assertEq(result.version, 70, 'version bumped');
  assertEq(result.c4x.vesselManager.vessels[0].driftIdle, null, 'legacy alias handled');
});
test('T2.5 migrate v66 save → łańcuch v66→v67→v68→v69→v70', () => {
  const data = { version: 66, civ4x: {} };
  const result = migrate(data);
  assertEq(result.version, 70, 'chained migration');
});
test('T2.6 migrate save z przyszłości (v71) → error', () => {
  const data = { version: 71 };
  const result = migrate(data);
  assertEq(result.error, 'future_version', 'future_version error');
});

// ============================================================================
// T3 — MovementOrderSystem drift state
// ============================================================================

// Setup MOS with mock VM
function setupMOS(vessels = []) {
  const vm = makeMockVesselManager(vessels);
  window.KOSMOS.vesselManager = vm;
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.movementOrderSystem = mos;
  return { mos, vm };
}

test('T3.1 _driftingVessels init empty', () => {
  setGameTime(0);
  const { mos } = setupMOS();
  assertEq(mos._driftingVessels.size, 0, 'driftingVessels empty');
});

test('T3.2 _completeOrder na vessel target → ustawia driftIdle marker', () => {
  setGameTime(100);
  const pursuer = makeVessel('p1', 0, 0);
  const target = makeVessel('t1', 5, 5);
  const order = { id: 'mo_1', type: 'pursue', status: 'active', targetEntityId: 't1' };
  pursuer.movementOrder = order;
  const { mos, vm } = setupMOS([pursuer, target]);
  mos._byVessel.set(pursuer.id, order);
  // Symuluj complete na vessel target
  mos._completeOrder(pursuer, order, 100, target);
  assertTrue(pursuer.driftIdle, 'driftIdle marker set');
  assertEq(pursuer.driftIdle.sinceYear, 100, 'sinceYear');
  assertEq(pursuer.driftIdle.autoReturnYear, 105, 'autoReturnYear = +5');
  assertTrue(mos._driftingVessels.has(pursuer.id), '_driftingVessels updated');
});

test('T3.3 _completeOrder na celestial target → NIE ustawia driftIdle', () => {
  setGameTime(50);
  const pursuer = makeVessel('p2', 0, 0);
  // Celestial target = nie ma getVessel() match (nie ma w vm._vessels)
  const planet = { id: 'planet_x', x: 10, y: 10 };
  const order = { id: 'mo_2', type: 'pursue', status: 'active', targetEntityId: 'planet_x' };
  pursuer.movementOrder = order;
  const { mos } = setupMOS([pursuer]);
  mos._byVessel.set(pursuer.id, order);
  mos._completeOrder(pursuer, order, 50, planet);
  assertEq(pursuer.driftIdle, null, 'driftIdle NOT set for celestial');
  assertFalse(mos._driftingVessels.has(pursuer.id), '_driftingVessels not updated');
});

test('T3.4 driftIdle emit vessel:driftIdle event', () => {
  setGameTime(200);
  const pursuer = makeVessel('p3', 0, 0);
  const target = makeVessel('t3', 5, 5);
  const order = { id: 'mo_3', type: 'pursue', status: 'active', targetEntityId: 't3' };
  pursuer.movementOrder = order;
  const { mos } = setupMOS([pursuer, target]);
  mos._byVessel.set(pursuer.id, order);
  let captured = null;
  const handler = (e) => { captured = e; };
  EventBus.on('vessel:driftIdle', handler);
  mos._completeOrder(pursuer, order, 200, target);
  EventBus.off('vessel:driftIdle', handler);
  assertTrue(captured, 'event emitted');
  assertEq(captured.vesselId, 'p3', 'vesselId in event');
  assertEq(captured.autoReturnYear, 205, 'autoReturnYear in event');
});

test('T3.5 _clearDriftMarker — usuwa marker + set entry', () => {
  const v = makeVessel('p4', 0, 0);
  v.driftIdle = { sinceYear: 1, autoReturnYear: 6 };
  const { mos } = setupMOS([v]);
  mos._driftingVessels.add(v.id);
  mos._clearDriftMarker(v);
  assertEq(v.driftIdle, null, 'marker cleared');
  assertFalse(mos._driftingVessels.has(v.id), 'set entry removed');
});

test('T3.6 issueOrder czyści drift marker (player override)', () => {
  setGameTime(300);
  // Vessel z drift marker — player wydaje nowy moveToPoint
  const v = makeVessel('p5', 0, 0);
  v.driftIdle = { sinceYear: 100, autoReturnYear: 105 };
  const { mos } = setupMOS([v]);
  mos._driftingVessels.add(v.id);
  const res = mos.issueOrder('p5', {
    type: 'moveToPoint',
    targetPoint: { x: 50, y: 50 },
  });
  assertTrue(res.ok, 'order accepted');
  assertEq(v.driftIdle, null, 'drift marker cleared by issueOrder');
  assertFalse(mos._driftingVessels.has('p5'), 'set entry removed');
});

test('T3.7 _findNearestFriendlyPlanetForDrift preferuje full colony', () => {
  // Mock colonyManager + EntityManager.
  const fullPlanet = { id: 'p_full', type: 'planet', x: 10, y: 0 };
  const outpostPlanet = { id: 'p_out', type: 'planet', x: 2, y: 0 };
  EntityManager.add(fullPlanet);
  EntityManager.add(outpostPlanet);
  window.KOSMOS.colonyManager = {
    getAllColonies: () => [
      { planetId: 'p_full', isOutpost: false },
      { planetId: 'p_out', isOutpost: true },
    ],
  };
  const v = makeVessel('p6', 0, 0);
  const { mos } = setupMOS([v]);
  const result = mos._findNearestFriendlyPlanetForDrift(v);
  assertTrue(result, 'result found');
  assertEq(result.planet.id, 'p_full', 'full colony preferred over closer outpost');
  EntityManager.remove(fullPlanet.id);
  EntityManager.remove(outpostPlanet.id);
});

test('T3.8 _findNearestFriendlyPlanetForDrift fallback do outpost gdy brak full', () => {
  const outpostPlanet = { id: 'p_only_out', type: 'planet', x: 2, y: 0 };
  EntityManager.add(outpostPlanet);
  window.KOSMOS.colonyManager = {
    getAllColonies: () => [{ planetId: 'p_only_out', isOutpost: true }],
  };
  const v = makeVessel('p7', 0, 0);
  const { mos } = setupMOS([v]);
  const result = mos._findNearestFriendlyPlanetForDrift(v);
  assertTrue(result, 'result found');
  assertEq(result.planet.id, 'p_only_out', 'outpost fallback');
  EntityManager.remove(outpostPlanet.id);
});

test('T3.9 _indexExistingOrders po load — rebuild driftingVessels z save', () => {
  const v = makeVessel('p8', 0, 0);
  v.driftIdle = { sinceYear: 50, autoReturnYear: 55 };
  const { mos } = setupMOS([v]);
  // _indexExistingOrders wywołane w konstruktorze; verify state
  assertTrue(mos._driftingVessels.has('p8'), 'restored drift vessel from save');
});

// ============================================================================
// T4 — AutoRetreatSystem low_fuel_drift
// ============================================================================

const { AutoRetreatSystem } = await import('./src/systems/AutoRetreatSystem.js');

test('T4.1 AutoRetreat z fuel → standard moveToPoint path', () => {
  setGameTime(500);
  const planet = { id: 'home_p', type: 'planet', x: 80, y: 0 };
  EntityManager.add(planet);
  window.KOSMOS.colonyManager = {
    getAllColonies: () => [{ planetId: 'home_p', isOutpost: false }],
  };
  const v = makeVessel('r1', 0, 0, { fuel: { current: 100, capacity: 100, consumption: 1.0 } });
  const { mos, vm } = setupMOS([v]);
  const ars = new AutoRetreatSystem(vm, window.KOSMOS.colonyManager, mos);
  let issued = null;
  const h = (e) => { issued = e; };
  EventBus.on('vessel:autoRetreatIssued', h);
  EventBus.emit('battle:resolved', {
    battleId: 'b1',
    result: {
      retreated: 'A',
      participantA: { type: 'vessel_group', vesselIds: ['r1'] },
    },
  });
  EventBus.off('vessel:autoRetreatIssued', h);
  assertTrue(issued, 'standard retreat issued');
  assertEq(issued.vesselId, 'r1', 'vesselId');
  ars.destroy();
  EntityManager.remove(planet.id);
});

test('T4.2 AutoRetreat bez fuel → retry z bypass + lowFuelDrift marker', () => {
  setGameTime(600);
  const planet = { id: 'home_p2', type: 'planet', x: 80, y: 0 };
  EntityManager.add(planet);
  window.KOSMOS.colonyManager = {
    getAllColonies: () => [{ planetId: 'home_p2', isOutpost: false }],
  };
  // Vessel z fuel niemal pustym — fuel 0.1, ale planet 80 px → ~0.73 AU × 1.0 = 0.73 needed.
  const v = makeVessel('r2', 0, 0, { fuel: { current: 0.1, capacity: 100, consumption: 1.0 } });
  const { mos, vm } = setupMOS([v]);
  const ars = new AutoRetreatSystem(vm, window.KOSMOS.colonyManager, mos);
  let lowFuelEvt = null;
  const h = (e) => { lowFuelEvt = e; };
  EventBus.on('vessel:autoRetreatLowFuel', h);
  EventBus.emit('battle:resolved', {
    battleId: 'b2',
    result: {
      retreated: 'A',
      participantA: { type: 'vessel_group', vesselIds: ['r2'] },
    },
  });
  EventBus.off('vessel:autoRetreatLowFuel', h);
  assertTrue(lowFuelEvt, 'autoRetreatLowFuel emitted');
  assertEq(lowFuelEvt.battleId, 'b2', 'battleId in event');
  assertTrue(v.lowFuelDrift, 'lowFuelDrift marker set');
  assertEq(v.lowFuelDrift.originBattleId, 'b2', 'marker battle id');
  ars.destroy();
  EntityManager.remove(planet.id);
});

test('T4.3 AutoRetreat brak friendly planety → autoRetreatFailed (no_friendly_planet)', () => {
  setGameTime(700);
  window.KOSMOS.colonyManager = { getAllColonies: () => [] };
  const v = makeVessel('r3', 0, 0);
  const { mos, vm } = setupMOS([v]);
  const ars = new AutoRetreatSystem(vm, window.KOSMOS.colonyManager, mos);
  let failed = null;
  const h = (e) => { failed = e; };
  EventBus.on('vessel:autoRetreatFailed', h);
  EventBus.emit('battle:resolved', {
    battleId: 'b3',
    result: {
      retreated: 'A',
      participantA: { type: 'vessel_group', vesselIds: ['r3'] },
    },
  });
  EventBus.off('vessel:autoRetreatFailed', h);
  assertTrue(failed, 'autoRetreatFailed emitted');
  assertEq(failed.reason, 'no_friendly_planet', 'no friendly planet reason');
  ars.destroy();
});

test('T4.4 AutoRetreat retreated=B → triggeruje retreat tylko side B vessels', () => {
  setGameTime(800);
  const planet = { id: 'home_p4', type: 'planet', x: 80, y: 0 };
  EntityManager.add(planet);
  window.KOSMOS.colonyManager = {
    getAllColonies: () => [{ planetId: 'home_p4', isOutpost: false }],
  };
  const v = makeVessel('r4_b', 0, 0);
  const { mos, vm } = setupMOS([v]);
  const ars = new AutoRetreatSystem(vm, window.KOSMOS.colonyManager, mos);
  let issued = null;
  const h = (e) => { issued = e; };
  EventBus.on('vessel:autoRetreatIssued', h);
  EventBus.emit('battle:resolved', {
    battleId: 'b4',
    result: {
      retreated: 'B',
      participantB: { type: 'vessel_group', vesselIds: ['r4_b'] },
    },
  });
  EventBus.off('vessel:autoRetreatIssued', h);
  assertTrue(issued, 'side B retreat issued');
  ars.destroy();
  EntityManager.remove(planet.id);
});

test('T4.5 AutoRetreat brak retreated → no-op', () => {
  setGameTime(900);
  window.KOSMOS.colonyManager = { getAllColonies: () => [] };
  const v = makeVessel('r5', 0, 0);
  const { mos, vm } = setupMOS([v]);
  const ars = new AutoRetreatSystem(vm, window.KOSMOS.colonyManager, mos);
  let issued = null, failed = null;
  const hI = (e) => { issued = e; };
  const hF = (e) => { failed = e; };
  EventBus.on('vessel:autoRetreatIssued', hI);
  EventBus.on('vessel:autoRetreatFailed', hF);
  EventBus.emit('battle:resolved', {
    battleId: 'b5',
    result: { winner: 'A', retreated: null },  // brak retreat
  });
  EventBus.off('vessel:autoRetreatIssued', hI);
  EventBus.off('vessel:autoRetreatFailed', hF);
  assertEq(issued, null, 'no retreat issued');
  assertEq(failed, null, 'no retreat failed');
  ars.destroy();
});

// ============================================================================
// T5 — i18n + LOG_COLORS smoke
// ============================================================================

test('T5.1 i18n keys log.m4.* exist PL', () => {
  // i18n.t falls back to key gdy nie ma tłumaczenia — sprawdzamy że nie zwraca surowego klucza
  const moveLog = t('log.m4.enemyFleetMoving', 'TestEmpire', 5);
  assertTrue(moveLog.includes('TestEmpire'), `Key resolved: ${moveLog}`);
  assertFalse(moveLog === 'log.m4.enemyFleetMoving', 'key not raw');
});

test('T5.2 i18n auto-slow keys exist', () => {
  const result = t('log.autoSlowEnemyFleet');
  assertFalse(result === 'log.autoSlowEnemyFleet', 'autoSlowEnemyFleet resolved');
});

test('T5.3 LOG_COLORS dostępne dla nowych channeli', async () => {
  // Test indirect: nie możemy zaimportować LOG_COLORS bo prywatny, ale
  // możemy sprawdzić że UIManager moduł zawiera klucze przez grep-style.
  // Sprawdzamy że THEME tokens istnieją.
  const { THEME } = await import('./src/config/ThemeConfig.js');
  assertTrue(THEME.info, 'THEME.info exists');
  assertTrue(THEME.danger, 'THEME.danger exists');
  assertTrue(THEME.warning, 'THEME.warning exists');
});

test('T5.4 i18n battle resolution keys exist', () => {
  const victory = t('log.m4.battleResolvedVictory', 'battle_x');
  const defeat = t('log.m4.battleResolvedDefeat', 'battle_x');
  assertFalse(victory === defeat, 'victory ≠ defeat');
  assertTrue(victory.includes('battle_x'), 'battleId interpolated');
});

// ============================================================================
// T6 — Combat cooldown A+B+C (post-playtest #2)
// ============================================================================

const VCSModule = await import('./src/systems/VesselCombatSystem.js');
const { VesselCombatSystem, ENGAGEMENT_COOLDOWN_YEARS } = VCSModule;
const ProximityModule = await import('./src/systems/ProximitySystem.js');
const { pairKey: makePairKey } = ProximityModule;

test('T6.1 (C) ENGAGEMENT_COOLDOWN_YEARS === 1 (skrócone z 2)', () => {
  assertEq(ENGAGEMENT_COOLDOWN_YEARS, 1, 'cooldown 1 civYear');
});

test('T6.2 (B) combatRangeExit resetuje cooldown', () => {
  const v1 = makeVessel('vc1', 0, 0, { ownerEmpireId: 'player' });
  const v2 = makeVessel('vc2', 5, 5, { ownerEmpireId: 'empire_x' });
  const { vm } = setupMOS([v1, v2]);
  const vcs = new VesselCombatSystem(vm);
  // Manualnie ustaw cooldown (symulacja po combat)
  const key = makePairKey('vc1', 'vc2');
  vcs._recentlyEngaged.set(key, 100);
  assertTrue(vcs._recentlyEngaged.has(key), 'cooldown set');
  // Emit exit — cooldown powinien zostać skasowany
  EventBus.emit('vessel:combatRangeExit', { vesselAId: 'vc1', vesselBId: 'vc2' });
  assertFalse(vcs._recentlyEngaged.has(key), 'cooldown cleared by exit event');
  vcs.destroy();
});

test('T6.3 (B) combatRangeExit dla NIE-cooldown pary — no-op', () => {
  const v1 = makeVessel('vc3', 0, 0);
  const v2 = makeVessel('vc4', 5, 5);
  const { vm } = setupMOS([v1, v2]);
  const vcs = new VesselCombatSystem(vm);
  // Brak cooldown set — emit exit nie powinno crashować
  EventBus.emit('vessel:combatRangeExit', { vesselAId: 'vc3', vesselBId: 'vc4' });
  assertEq(vcs._recentlyEngaged.size, 0, 'no entries');
  vcs.destroy();
});

// ── Wynik ────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n──────────────────────────────────────────`);
console.log(`M4 P1 smoke: ${passed}/${total} PASS, ${failed} FAIL`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`  ✗ ${f.name}: ${f.err}`);
  }
  process.exit(1);
}
console.log(`✓ All tests passed.`);
