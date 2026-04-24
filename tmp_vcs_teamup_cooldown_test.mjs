// Smoke test M2b Commit 0 finalize — team-up cooldown fill w VCS _applyOutcome.
//
// Bug (real-flow playtest Combat Sandbox):
//   Pursue v_1 → v_5 (ciasno orbitujące 3 wrogi vessele wokół entity_7, wszystkie
//   w COMBAT_ENGAGEMENT_AU od v_1). ProximitySystem emituje 3× combatRangeEnter
//   w tym samym ticku. VCS reaguje 3 osobnymi bitwami zamiast 1 z team-up.
//
// Root cause: _handleCombatRangeEnter zapisuje cooldown tylko dla triggering pair.
// _resolveEngagement robi team-up (zbiera wszystkie cross-faction w buforze),
// bitwa ma [v_5,v_6,v_7] jako sideB. Ale cooldown dotyczy tylko v_1|v_5. Drugi
// event (v_1|v_6) → brak cooldown → nowa bitwa z identycznym team-up.
//
// Fix: _applyOutcome po emit battle:resolved wypełnia cooldown dla WSZYSTKICH
// par sideA × sideB (nie tylko triggering).
//
// Scenariusze:
//   T1 — 1v3 team-up: 1 player vs 3 wrogi ciasno, 3× emit → 1 bitwa, 3 pary cooldown
//   T2 — 1v1 regresja: pojedyncza para → 1 bitwa, 1 para cooldown
//   T3 — cooldown respect: po bitwie drugi combatRangeEnter → skip (bez nowej bitwy)

const _lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => _lsStore.has(k) ? _lsStore.get(k) : null,
  setItem: (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear: () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;

const { default: EventBus }          = await import('./src/core/EventBus.js');
const { GAME_CONFIG }                = await import('./src/config/GameConfig.js');
const { VesselCombatSystem, ENGAGEMENT_COOLDOWN_YEARS } = await import('./src/systems/VesselCombatSystem.js');
const { pairKey }                    = await import('./src/systems/ProximitySystem.js');

GAME_CONFIG.FEATURES.vesselCombat = true;

const AU = GAME_CONFIG.AU_TO_PX;

function mkVessel(id, owner, x, y, state = 'orbiting', dockedAt = null) {
  return {
    id,
    name:          id,
    shipId:        'hull_small',
    hullId:        'hull_small',
    modules:       [],
    isWreck:       false,
    ownerEmpireId: owner,
    owner,
    isEnemy:       owner !== 'player',
    systemId:      'sys_home',
    position:      { x, y, state, dockedAt },
  };
}

function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else      { console.error(`  ✗ ${msg}`); process.exitCode = 1; }
}

// ── T1 — 1v3 team-up: 3 emity w tym samym ticku → 1 bitwa ──────────────
console.log('\nT1 — 1v3 team-up, 3× combatRangeEnter w tym samym ticku:');
{
  window.KOSMOS = window.KOSMOS ?? {};
  window.KOSMOS.timeSystem = { gameTime: 10.0 };

  // 3 wrogi vessele w ciasnej grupie wokół punktu (0,0); gracz 0.05 AU obok.
  const v1 = mkVessel('v_1', 'player',     0.05 * AU, 0, 'in_transit', null);
  const v5 = mkVessel('v_5', 'empire_xeno', 0,          0,         'orbiting', 'entity_7');
  const v6 = mkVessel('v_6', 'empire_xeno', 0.01 * AU,  0.01 * AU, 'orbiting', 'entity_7');
  const v7 = mkVessel('v_7', 'empire_xeno', -0.01 * AU, 0.01 * AU, 'orbiting', 'entity_7');

  const vm = { _vessels: new Map([[v1.id, v1], [v5.id, v5], [v6.id, v6], [v7.id, v7]]) };
  const vcs = new VesselCombatSystem(vm);

  let resolvedCount = 0;
  const battleIds = [];
  const handler = (e) => { resolvedCount++; battleIds.push(e.battleId); };
  EventBus.on('battle:resolved', handler);

  // 3× emit — symuluje ProximitySystem detection w tym samym ticku.
  for (const bId of ['v_5', 'v_6', 'v_7']) {
    EventBus.emit('vessel:combatRangeEnter', {
      vesselAId:   'v_1',
      vesselBId:   bId,
      distanceAU:  0.05,
      sameFaction: false,
    });
  }

  assert(resolvedCount === 1, `battle:resolved emitted exactly 1× (got ${resolvedCount})`);
  assert(battleIds.length === 1, `battleIds.length === 1 (got ${battleIds.length})`);
  // Wszystkie 3 pary powinny być w cooldown (triggering + 2 dodatkowe z team-up).
  assert(vcs._recentlyEngaged.has(pairKey('v_1', 'v_5')), 'cooldown dla pary v_1|v_5 (triggering)');
  assert(vcs._recentlyEngaged.has(pairKey('v_1', 'v_6')), 'cooldown dla pary v_1|v_6 (team-up)');
  assert(vcs._recentlyEngaged.has(pairKey('v_1', 'v_7')), 'cooldown dla pary v_1|v_7 (team-up)');
  assert(vcs._recentlyEngaged.size === 3, `_recentlyEngaged.size === 3 (got ${vcs._recentlyEngaged.size})`);

  EventBus.off('battle:resolved', handler);
  vcs.destroy();
}

// ── T2 — 1v1 regresja M2a flow ─────────────────────────────────────────
console.log('\nT2 — 1v1 cross-faction (regresja M2a):');
{
  window.KOSMOS = window.KOSMOS ?? {};
  window.KOSMOS.timeSystem = { gameTime: 20.0 };

  const vA = mkVessel('v_a', 'player',      0.05 * AU, 0, 'in_transit', null);
  const vB = mkVessel('v_b', 'empire_xeno', 0,         0, 'orbiting',   null);

  const vm = { _vessels: new Map([[vA.id, vA], [vB.id, vB]]) };
  const vcs = new VesselCombatSystem(vm);

  let resolvedCount = 0;
  const handler = () => resolvedCount++;
  EventBus.on('battle:resolved', handler);

  EventBus.emit('vessel:combatRangeEnter', {
    vesselAId:   vA.id,
    vesselBId:   vB.id,
    distanceAU:  0.05,
    sameFaction: false,
  });

  assert(resolvedCount === 1, `battle:resolved emitted 1× (got ${resolvedCount})`);
  assert(vcs._recentlyEngaged.has(pairKey(vA.id, vB.id)), 'cooldown dla pary v_a|v_b');
  assert(vcs._recentlyEngaged.size === 1, `_recentlyEngaged.size === 1 (got ${vcs._recentlyEngaged.size})`);

  EventBus.off('battle:resolved', handler);
  vcs.destroy();
}

// ── T3 — cooldown respect ──────────────────────────────────────────────
console.log('\nT3 — cooldown respect: drugi combatRangeEnter < ENGAGEMENT_COOLDOWN_YEARS → skip:');
{
  window.KOSMOS = window.KOSMOS ?? {};
  window.KOSMOS.timeSystem = { gameTime: 30.0 };

  const vA = mkVessel('v_x', 'player',      0.05 * AU, 0, 'in_transit', null);
  const vB = mkVessel('v_y', 'empire_xeno', 0,         0, 'orbiting',   null);

  const vm = { _vessels: new Map([[vA.id, vA], [vB.id, vB]]) };
  const vcs = new VesselCombatSystem(vm);

  let resolvedCount = 0;
  const handler = () => resolvedCount++;
  EventBus.on('battle:resolved', handler);

  // Bitwa #1
  EventBus.emit('vessel:combatRangeEnter', {
    vesselAId: vA.id, vesselBId: vB.id, distanceAU: 0.05, sameFaction: false,
  });
  assert(resolvedCount === 1, `po pierwszym emit — 1 bitwa (got ${resolvedCount})`);

  // Advance czas o < ENGAGEMENT_COOLDOWN_YEARS — cooldown nadal aktywny.
  window.KOSMOS.timeSystem.gameTime = 30.0 + ENGAGEMENT_COOLDOWN_YEARS - 0.5;
  // Reset vessel state (w prawdziwym flow vessele mogą żyć po retreat).
  vA.isWreck = false; vA.position.state = 'in_transit'; vA.status = 'active'; vA.mission = null;
  vB.isWreck = false; vB.position.state = 'orbiting';   vB.status = 'active'; vB.mission = null;

  EventBus.emit('vessel:combatRangeEnter', {
    vesselAId: vA.id, vesselBId: vB.id, distanceAU: 0.05, sameFaction: false,
  });
  assert(resolvedCount === 1, `w cooldown — brak drugiej bitwy (got ${resolvedCount})`);

  // Advance poza cooldown — powinno znów rozwiązać.
  window.KOSMOS.timeSystem.gameTime = 30.0 + ENGAGEMENT_COOLDOWN_YEARS + 0.5;
  vA.isWreck = false; vA.position.state = 'in_transit'; vA.status = 'active'; vA.mission = null;
  vB.isWreck = false; vB.position.state = 'orbiting';   vB.status = 'active'; vB.mission = null;

  EventBus.emit('vessel:combatRangeEnter', {
    vesselAId: vA.id, vesselBId: vB.id, distanceAU: 0.05, sameFaction: false,
  });
  assert(resolvedCount === 2, `po cooldown — druga bitwa (got ${resolvedCount})`);

  EventBus.off('battle:resolved', handler);
  vcs.destroy();
}

GAME_CONFIG.FEATURES.vesselCombat = false;

if (process.exitCode === 1) {
  console.error('\nFAIL');
} else {
  console.log('\nPASS');
}
