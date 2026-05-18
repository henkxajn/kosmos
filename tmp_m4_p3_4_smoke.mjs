// Smoke P3-4: battle conclude — winner/retreat threshold dynamic/time-out/combatRangeExit draw.

import { strict as assert } from 'node:assert';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.KOSMOS = { debug: {}, timeSystem: { gameTime: 100.0 } };

const { default: EventBus } = await import('./src/core/EventBus.js');
const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
const { DeepSpaceCombatSystem, RETREAT_THRESHOLD, MAX_ROUNDS } = await import('./src/systems/DeepSpaceCombatSystem.js');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
}
function eq(name, actual, expected) {
  ok(name + ' (got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected) + ')',
     actual === expected);
}

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

class FakeVM {
  constructor() { this._vessels = new Map(); }
  addVessel(id, opts = {}) {
    const v = {
      id,
      name:           opts.name ?? id,
      shipId:         opts.shipId ?? 'hull_frigate',
      hullId:         opts.hullId ?? 'hull_frigate',
      modules:        opts.modules ?? ['weapon_laser'],
      position:       { x: opts.x ?? 0, y: opts.y ?? 0, state: 'in_transit', dockedAt: null },
      isWreck:        false,
      status:         'in_flight',
      mission:        null,
      movementOrder:  null,
      ownerEmpireId:  opts.ownerEmpireId ?? null,
      isEnemy:        opts.isEnemy ?? false,
      owner:          opts.owner ?? null,
    };
    this._vessels.set(id, v);
    return v;
  }
}

function newSetup(vesselsOpts) {
  const vm = new FakeVM();
  for (const o of vesselsOpts) vm.addVessel(o.id, o);
  const dscs = new DeepSpaceCombatSystem(vm);
  globalThis.window.KOSMOS.deepSpaceCombatSystem = dscs;
  return { vm, dscs };
}

// ── T1: Kill condition — sideA hp=0 → winner='B', wreck per-vessel ────
console.log('\n--- T1: Kill condition ---');
{
  const dist = 0.04 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_laser'] },
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_missile', 'weapon_missile'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  // Force p1.hp = 0 by symulować wybicie
  enc.vesselStates.get('p1').hp = 0;
  const battleEvents = [];
  const sub = (e) => battleEvents.push(e);
  EventBus.on('battle:resolved', sub);
  dscs._tick(0.1);
  ok('battle:resolved emitted', battleEvents.length === 1);
  eq('winner = B', battleEvents[0].result.winner, 'B');
  eq('retreated = null', battleEvents[0].result.retreated, null);
  ok('p1 wreck (per-vessel pass)', vm._vessels.get('p1').isWreck === true);
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}

// ── T2: Retreat threshold static — sideA 15% aggregate → retreat ──────
console.log('\n--- T2: Retreat threshold static ---');
{
  const dist = 0.04 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_laser'] },
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  const p1State = enc.vesselStates.get('p1');
  const e1State = enc.vesselStates.get('e1');
  // Forge: p1 15% hp, e1 80% — p1 retreat
  p1State.hp = p1State.hpStart * 0.15;
  e1State.hp = e1State.hpStart * 0.80;
  const battleEvents = [];
  const sub = (e) => battleEvents.push(e);
  EventBus.on('battle:resolved', sub);
  dscs._tick(0.1);
  ok('battle:resolved emitted', battleEvents.length === 1);
  eq('retreated = A',   battleEvents[0].result.retreated, 'A');
  eq('winner = B',      battleEvents[0].result.winner, 'B');
  ok('p1 NIE wreck (retreated, hp > 0)', vm._vessels.get('p1').isWreck !== true);
  ok('e1 NIE wreck (winner side, hp > 0)', vm._vessels.get('e1').isWreck !== true);
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}

// ── T3: Reinforcement raises retreat threshold ─────────────────────────
console.log('\n--- T3: Reinforcement aggregate hpStart ---');
{
  const dist = 0.04 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_laser'] },
    // p2 daleko od midpoint (5, 0) — poza team-up bufferem 24.75 px
    { id: 'p2', x: 500, y: 500, modules: ['weapon_laser'] },
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  const hpStartBefore = dscs._sideAggregateHpStart(enc, 'A');
  // Teraz p2 dochodzi w pobliże (symulacja ruchu) i triggeruje reinforcement
  vm._vessels.get('p2').position.x = 4;
  vm._vessels.get('p2').position.y = 0;
  dscs.handleCombatRangeEnter('p1', 'p2', false);  // p2 joinuje sideA
  const hpStartAfter = dscs._sideAggregateHpStart(enc, 'A');
  ok('sideAggregateHpStart wzrósł po reinforcement', hpStartAfter > hpStartBefore);
  eq('hpStart = 2 × baseHP (p1 + p2)', hpStartAfter, hpStartBefore * 2);
  dscs.destroy();
}

// ── T4: Time-out → highest aggregate HP wins ───────────────────────────
console.log('\n--- T4: Time-out MAX_ROUNDS ---');
{
  const dist = 0.04 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_laser'] },
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  // Hp wysokie obu — żaden nie padnie szybko
  enc.vesselStates.get('p1').hp = 1000;
  enc.vesselStates.get('p1').hpStart = 1000;
  enc.vesselStates.get('e1').hp = 800;  // p1 ma więcej hp przy time-out
  enc.vesselStates.get('e1').hpStart = 1000;

  // Force currentRound = MAX_ROUNDS - 1, jeszcze jeden tick → time-out
  enc.currentRound = MAX_ROUNDS - 1;
  const battleEvents = [];
  const sub = (e) => battleEvents.push(e);
  EventBus.on('battle:resolved', sub);
  dscs._tick(0.1);
  ok('battle:resolved emitted po MAX_ROUNDS', battleEvents.length === 1);
  // p1 ma więcej hp → winner='A'
  eq('time-out winner = A (highest HP)', battleEvents[0].result.winner, 'A');
  eq('retreated = null', battleEvents[0].result.retreated, null);
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}

// ── T5: combatRangeExit draw — wszyscy żywi sideA poza COMBAT_DISENGAGE_AU ─
console.log('\n--- T5: combatRangeExit draw ---');
{
  const dist = 0.04 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_laser'] },
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  // p1 oddala się daleko (> COMBAT_DISENGAGE_AU = 0.50)
  vm._vessels.get('p1').position.x = enc.location.point.x + 1.0 * AU_TO_PX;
  const battleEvents = [];
  const sub = (e) => battleEvents.push(e);
  EventBus.on('battle:resolved', sub);
  // Emit combatRangeExit dla pair (p1, e1)
  EventBus.emit('vessel:combatRangeExit', { vesselAId: 'p1', vesselBId: 'e1' });
  ok('battle:resolved emitted po combatRangeExit', battleEvents.length === 1);
  eq('winner = null (draw)', battleEvents[0].result.winner, null);
  eq('retreated = null (draw)', battleEvents[0].result.retreated, null);
  ok('p1 NIE wreck (draw, alive)', vm._vessels.get('p1').isWreck !== true);
  ok('e1 NIE wreck (draw, alive)', vm._vessels.get('e1').isWreck !== true);
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}

// ── T6: combatRangeExit partial — tylko niektóre vessele rozeszły się ─
console.log('\n--- T6: combatRangeExit partial → kontynuacja ---');
{
  const dist = 0.04 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_laser'] },
    { id: 'p2', x: 1,    y: 1, modules: ['weapon_laser'] },  // pozostaje
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  dscs.handleCombatRangeEnter('p1', 'p2', false);
  // Tylko p1 oddala się daleko, p2 zostaje
  vm._vessels.get('p1').position.x = enc.location.point.x + 1.0 * AU_TO_PX;
  // p2 zostaje blisko midpoint (dist 1px)
  const battleEvents = [];
  const sub = (e) => battleEvents.push(e);
  EventBus.on('battle:resolved', sub);
  EventBus.emit('vessel:combatRangeExit', { vesselAId: 'p1', vesselBId: 'e1' });
  ok('NIE finalizowane (p2 wciąż w zasięgu)', battleEvents.length === 0);
  ok('encounter wciąż active', enc.isActive);
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}

// ── T7: Hard kill — dead vessel z retreated side wreck always ──────────
console.log('\n--- T7: Per-vessel wreck always (dead z retreated side) ---');
{
  const dist = 0.04 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,  y: 0, modules: ['weapon_laser'] },
    { id: 'p2', x: 1,  y: 1, modules: ['weapon_laser'] },
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  dscs.handleCombatRangeEnter('p1', 'p2', false);  // p2 joinuje sideA

  const p1State = enc.vesselStates.get('p1');
  const p2State = enc.vesselStates.get('p2');
  // p1 dead, p2 żyje 10% → sideA retreat (p2)
  p1State.hp = 0;
  p2State.hp = p2State.hpStart * 0.10;
  enc.vesselStates.get('e1').hp = enc.vesselStates.get('e1').hpStart * 0.80;

  const battleEvents = [];
  const sub = (e) => battleEvents.push(e);
  EventBus.on('battle:resolved', sub);
  dscs._tick(0.1);
  ok('battle:resolved emitted', battleEvents.length === 1);
  eq('retreated = A',   battleEvents[0].result.retreated, 'A');
  ok('p1 wreck (dead always, mimo retreat)', vm._vessels.get('p1').isWreck === true);
  ok('p2 NIE wreck (żywy z retreated side)', vm._vessels.get('p2').isWreck !== true);
  ok('e1 NIE wreck (winner side, alive)', vm._vessels.get('e1').isWreck !== true);
  EventBus.off('battle:resolved', sub);
  dscs.destroy();
}

console.log(`\n========== ${pass} PASS / ${fail} FAIL ==========`);
process.exit(fail > 0 ? 1 : 0);
