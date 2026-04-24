// Smoke test M2b Commit 0 fix — _inCombatState akceptuje orbiting
// niezależnie od dockedAt.
//
// Scenario: vessel A = orbiting+dockedAt='entity_7' (wrogi, symuluje spawn
// Combat Sandbox), vessel B = in_transit (gracz pursue). Cross-faction,
// odległość <0.15 AU (combat range). Emit vessel:combatRangeEnter →
// VCS powinien rozwiązać bitwę (battle_ds_ prefix) i wyemitować
// battle:resolved.
//
// Przed fixem: _inCombatState(v_A)=false (orbiting+dockedAt!=null) →
// _resolveEngagement bail → brak bitwy. FAIL.
// Po fixie: _inCombatState(v_A)=true (orbiting) → bitwa rozwiązana. PASS.

// Stub browser globals — ESM gra importuje i18n.js który używa localStorage.
const _lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => _lsStore.has(k) ? _lsStore.get(k) : null,
  setItem: (k, v) => _lsStore.set(k, String(v)),
  removeItem: (k) => _lsStore.delete(k),
  clear: () => _lsStore.clear(),
};
globalThis.window = globalThis.window ?? globalThis;

const { default: EventBus }         = await import('./src/core/EventBus.js');
const { GAME_CONFIG }               = await import('./src/config/GameConfig.js');
const { VesselCombatSystem }        = await import('./src/systems/VesselCombatSystem.js');

// Enable feature flag.
GAME_CONFIG.FEATURES.vesselCombat = true;

// Mock window.KOSMOS.timeSystem (gameTime consumed by _year()).
window.KOSMOS = window.KOSMOS ?? {};
window.KOSMOS.timeSystem = { gameTime: 100.5 };

// Build two vessels.
const AU = GAME_CONFIG.AU_TO_PX;

const enemyVessel = {
  id:          'v_enemy',
  name:        'Enemy Cruiser',
  shipId:      'hull_medium',
  hullId:      'hull_medium',
  modules:     [],
  isWreck:     false,
  ownerEmpireId: 'empire_xeno',
  owner:       'empire_xeno',
  isEnemy:     true,
  systemId:    'sys_home',
  position: {
    x:        0,
    y:        0,
    state:    'orbiting',
    dockedAt: 'entity_7',       // KLUCZ — przed fixem blokowało VCS
  },
};

const playerVessel = {
  id:          'v_player',
  name:        'Player Frigate',
  shipId:      'hull_small',
  hullId:      'hull_small',
  modules:     [],
  isWreck:     false,
  ownerEmpireId: 'player',
  owner:       'player',
  isEnemy:     false,
  systemId:    'sys_home',
  position: {
    x:        0.05 * AU,        // 0.05 AU od enemy — w combat range
    y:        0,
    state:    'in_transit',
    dockedAt: null,
  },
};

// Mock VesselManager — tylko _vessels Map (zgodnie z VCS usage).
const vesselManager = {
  _vessels: new Map([
    [enemyVessel.id,  enemyVessel],
    [playerVessel.id, playerVessel],
  ]),
};

const vcs = new VesselCombatSystem(vesselManager);

// Spy na battle:resolved.
let resolvedCount = 0;
let lastBattle = null;
EventBus.on('battle:resolved', (e) => {
  resolvedCount++;
  lastBattle = e;
});

// Emit combatRangeEnter — analog do tego co ProximitySystem emituje przy <0.15 AU.
EventBus.emit('vessel:combatRangeEnter', {
  vesselAId:  enemyVessel.id,
  vesselBId:  playerVessel.id,
  distanceAU: 0.05,
  sameFaction: false,
});

// ── Asercje ──────────────────────────────────────────────────────────
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else      { console.error(`  ✗ ${msg}`); process.exitCode = 1; }
}

console.log('M2b Commit 0 fix — _inCombatState smoke test:');
assert(resolvedCount === 1, `battle:resolved emitted exactly once (got ${resolvedCount})`);
assert(lastBattle != null, 'battle:resolved payload present');
assert(typeof lastBattle?.battleId === 'string' && lastBattle.battleId.startsWith('battle_ds_'),
       `battleId has battle_ds_ prefix (got: ${lastBattle?.battleId})`);
assert(lastBattle?.warId === null, 'warId === null (deep-space, not tied to war)');
assert(lastBattle?.result?.location?.point != null, 'result.location.point present');
assert(lastBattle?.result?.participantA?.empireId === 'player',
       'participantA.empireId === player');
assert(lastBattle?.result?.participantB?.empireId === 'empire_xeno',
       `participantB.empireId === empire_xeno (got: ${lastBattle?.result?.participantB?.empireId})`);

vcs.destroy();
GAME_CONFIG.FEATURES.vesselCombat = false;

if (process.exitCode === 1) {
  console.error('\nFAIL');
} else {
  console.log('\nPASS');
}
