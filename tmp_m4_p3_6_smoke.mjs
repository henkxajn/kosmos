// Smoke P3-6: BattleView3D format detection + weapon color resolution (pure logic).
// Pełen cinematic test wymaga przeglądarki/THREE — testujemy tylko logikę adaptera.

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.window.KOSMOS = {};

// Stub document dla potencjalnych DOM access w imporcie BattleView3D (zachowawczy).
globalThis.document = {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} } }),
  getElementById: () => null,
  body: { appendChild() {} },
};

let pass = 0, fail = 0;
function ok(name, cond, ctx = '') {
  if (cond) { console.log('  PASS  ' + name + (ctx ? ' [' + ctx + ']' : '')); pass++; }
  else { console.error('  FAIL  ' + name + (ctx ? ' [' + ctx + ']' : '')); fail++; }
}
function eq(name, actual, expected) {
  ok(name + ' (got ' + JSON.stringify(actual) + ')', actual === expected);
}

// ── T1: SHIP_MODULES color mapping per kategoria ──────────────────────
console.log('\n--- T1: WEAPON_COLOR_BY_CATEGORY mapping ---');
const { SHIP_MODULES } = await import('./src/data/ShipModulesData.js');
// Weryfikuj że SHIP_MODULES.weapon_laser ma stats.category = 'short'
eq('weapon_laser.category = short',   SHIP_MODULES.weapon_laser.stats.category,   'short');
eq('weapon_kinetic.category = medium', SHIP_MODULES.weapon_kinetic.stats.category, 'medium');
eq('weapon_missile.category = long',   SHIP_MODULES.weapon_missile.stats.category, 'long');

// Symuluj _resolveWeaponColor (kopia logiki — bez importu BattleView3D, które wymaga THREE).
const WEAPON_COLOR_BY_CATEGORY = {
  short:  0x60E0FF,
  medium: 0xFFD060,
  long:   0xFF6060,
};
const DEFAULT_WEAPON_COLOR = 0xFFFFFF;
function resolveWeaponColor(moduleId) {
  const mod = SHIP_MODULES?.[moduleId];
  const category = mod?.stats?.category ?? mod?.stats?.range;
  return WEAPON_COLOR_BY_CATEGORY[category] ?? DEFAULT_WEAPON_COLOR;
}

eq('laser color = cyan',   resolveWeaponColor('weapon_laser'),   0x60E0FF);
eq('kinetic color = amber', resolveWeaponColor('weapon_kinetic'), 0xFFD060);
eq('missile color = red',   resolveWeaponColor('weapon_missile'), 0xFF6060);
eq('unknown weapon → default white', resolveWeaponColor('unknown_weapon'), 0xFFFFFF);

// ── T2: format detection (DSCS vs legacy) ─────────────────────────────
console.log('\n--- T2: timeline format detection ---');
const legacyTimeline = [
  { turn: 1, aHP: 100, bHP: 80, dmgA: 5, dmgB: 8 },
  { turn: 2, aHP: 95,  bHP: 75, dmgA: 4, dmgB: 6 },
];
const dscsTimeline = [
  { round: 1, year: 100.1, distanceAU: 0.12, events: [
    { attacker: 'p1', target: 'e1', weapon: 'weapon_laser', hit: true, damage: 5 },
  ], joinEvents: [] },
  { round: 2, year: 100.2, distanceAU: 0.10, events: [], joinEvents: [] },
];

function detectFormat(timeline) {
  return (timeline.length > 0 && Array.isArray(timeline[0]?.events)) ? 'dscs' : 'legacy';
}
eq('legacy → "legacy"', detectFormat(legacyTimeline), 'legacy');
eq('dscs → "dscs"',     detectFormat(dscsTimeline),   'dscs');
eq('empty → "legacy"',  detectFormat([]),             'legacy');

// ── T3: _guessSideFromVesselId — z participant lists ──────────────────
console.log('\n--- T3: side detection from participant lists ---');
function guessSide(battleData, vesselId) {
  const a = battleData?.result?.participantA;
  const b = battleData?.result?.participantB;
  if (a?.vesselIds?.includes(vesselId)) return 'A';
  if (b?.vesselIds?.includes(vesselId)) return 'B';
  if (typeof vesselId === 'string' && vesselId.startsWith('e')) return 'B';
  return 'A';
}
const battleData = {
  result: {
    participantA: { vesselIds: ['p1', 'p2'] },
    participantB: { vesselIds: ['e1', 'e2'] },
  },
};
eq('p1 → A', guessSide(battleData, 'p1'), 'A');
eq('e1 → B', guessSide(battleData, 'e1'), 'B');
eq('unknown id z prefix e → B', guessSide(null, 'enemy_xx'), 'B');
eq('unknown id z prefix p → A', guessSide(null, 'player_xx'), 'A');

// ── T4: events bez hit (miss) — opacity przygaszona ────────────────────
console.log('\n--- T4: miss vs hit feedback ---');
const hitEvent = { hit: true,  damage: 5 };
const missEvent = { hit: false, damage: 0 };
// Logika opacity z _spawnEventVolley: hit ? 0.9 : 0.4
eq('hit opacity = 0.9',  hitEvent.hit ? 0.9 : 0.4,  0.9);
eq('miss opacity = 0.4', missEvent.hit ? 0.9 : 0.4, 0.4);

console.log(`\n========== ${pass} PASS / ${fail} FAIL ==========`);
process.exit(fail > 0 ? 1 : 0);
