// Smoke P3-2: DSCS skeleton + VCS delegation + feature flag wiring.
// Headless — stub'uje window/localStorage + EventBus + minimal VesselManager.

import { strict as assert } from 'node:assert';

// ── Globals shim ─────────────────────────────────────────────────────────
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.KOSMOS = { debug: {}, timeSystem: { gameTime: 100.0 } };

// EventBus (singleton z systemu)
const { default: EventBus } = await import('./src/core/EventBus.js');

// GameState
const { default: gameState } = await import('./src/core/GameState.js');

// GAME_CONFIG
const { GAME_CONFIG } = await import('./src/config/GameConfig.js');

// DSCS + helpers
const { DeepSpaceCombatSystem } = await import('./src/systems/DeepSpaceCombatSystem.js');
const { COMBAT_ENGAGEMENT_AU } = await import('./src/systems/ProximitySystem.js');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
}
function eq(name, actual, expected) {
  ok(name + ' (got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected) + ')',
     actual === expected);
}

// ── Minimal VesselManager stub ──────────────────────────────────────────
class FakeVM {
  constructor() { this._vessels = new Map(); }
  addVessel(id, opts = {}) {
    const v = {
      id,
      name:           opts.name ?? id,
      shipId:         opts.shipId ?? 'hull_frigate',
      hullId:         opts.hullId ?? 'hull_frigate',
      modules:        opts.modules ?? ['weapon_laser'],
      position:       { x: opts.x ?? 0, y: opts.y ?? 0, state: opts.state ?? 'in_transit', dockedAt: null },
      isWreck:        false,
      status:         'in_flight',
      mission:        opts.mission ?? null,
      ownerEmpireId:  opts.ownerEmpireId ?? null,
      isEnemy:        opts.isEnemy ?? false,
      owner:          opts.owner ?? null,
    };
    this._vessels.set(id, v);
    return v;
  }
}

// ── T1: instance + EventBus subscription ────────────────────────────────
console.log('\n--- T1: DSCS instance + EventBus subscribers ---');
const vm = new FakeVM();
const dscs = new DeepSpaceCombatSystem(vm);
ok('DSCS instance exists', dscs instanceof DeepSpaceCombatSystem);
ok('_activeEncounters jest Map', dscs._activeEncounters instanceof Map);
eq('_activeEncounters startuje pusty', dscs._activeEncounters.size, 0);

// ── T2: startEngagement player vs empire — encounter w _activeEncounters ─
console.log('\n--- T2: startEngagement + EncounterState ---');
window.KOSMOS.deepSpaceCombatSystem = dscs;

const player1 = vm.addVessel('p1', { x: 0,  y: 0,  modules: ['weapon_laser', 'weapon_kinetic'] });
const enemy1  = vm.addVessel('e1', { x: 10, y: 0,  ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_missile'] });

let engagedEvents = [];
const subEng = (e) => engagedEvents.push(e);
EventBus.on('vessel:engaged', subEng);

const enc = dscs.startEngagement('p1', 'e1');
ok('startEngagement zwraca encounter', !!enc && enc.isActive);
eq('encounter dodany do _activeEncounters', dscs._activeEncounters.size, 1);
eq('sideA.vesselIds zawiera p1', enc.sideA.vesselIds[0], 'p1');
eq('sideA.ownerEmpireId = player', enc.sideA.ownerEmpireId, 'player');
eq('sideB.vesselIds zawiera e1', enc.sideB.vesselIds[0], 'e1');
eq('sideB.ownerEmpireId = empire_alpha', enc.sideB.ownerEmpireId, 'empire_alpha');
eq('sideA.joinedVesselIds pusty', enc.sideA.joinedVesselIds.length, 0);
ok('vesselStates ma p1 + e1', enc.vesselStates.has('p1') && enc.vesselStates.has('e1'));
ok('p1.weapons.length === 2', enc.vesselStates.get('p1').weapons.length === 2);
ok('e1.weapons.length === 1', enc.vesselStates.get('e1').weapons.length === 1);
eq('p1.weapon_laser.rangeAU', enc.vesselStates.get('p1').weapons[0].rangeAU, 0.05);
eq('p1.weapon_laser.category', enc.vesselStates.get('p1').weapons[0].category, 'short');
eq('e1.weapon_missile.rangeAU', enc.vesselStates.get('e1').weapons[0].rangeAU, 0.30);
ok('location.point ustawiony (midpoint)', enc.location.point.x === 5 && enc.location.point.y === 0);
ok('currentRound = 0', enc.currentRound === 0);
ok('isActive = true', enc.isActive === true);
ok('vessel:engaged event emitted', engagedEvents.length === 1);
EventBus.off('vessel:engaged', subEng);

// Stationary AI — enemy.mission=null, position.state='orbiting'
eq('enemy.mission = null (stationary AI)', enemy1.mission, null);
eq('enemy.position.state = orbiting', enemy1.position.state, 'orbiting');

// ── T3: handleCombatRangeEnter dispatch (existing → _joinEncounter) ─────
console.log('\n--- T3: handleCombatRangeEnter dispatch ---');
let joinedEvents = [];
const subJoin = (e) => joinedEvents.push(e);
EventBus.on('vessel:joinedCombat', subJoin);

const enemy2 = vm.addVessel('e2', { x: 12, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_missile'] });

// e2 nie w encounter, e1 w encounter → handleCombatRangeEnter(e1, e2) → _joinEncounter(enc, e2)
// Ale e2 jest tej samej strony co e1 (same empire_alpha) — handleCombatRangeEnter musi sprawdzić
// czy e2 należy do strony A czy B. Reinforcement do sideB.
const sizeBefore = dscs._activeEncounters.size;
dscs.handleCombatRangeEnter('e1', 'e2', /*sameFaction*/ true);
// sameFaction=true → handleCombatRangeEnter return; _joinEncounter NIE wołany.
eq('sameFaction=true → no-op', joinedEvents.length, 0);

// Spawn third party — player vessel p2 dochodzi, nie był w encounter
const player2 = vm.addVessel('p2', { x: 3, y: 1, modules: ['weapon_kinetic'] });
dscs.handleCombatRangeEnter('p1', 'p2', false);
// p1 w encounter, p2 nie → _joinEncounter(enc, p2) do sideA
eq('p2 dołączył do encounter', joinedEvents.length, 1);
eq('p2 w sideA.joinedVesselIds', enc.sideA.joinedVesselIds[0], 'p2');
ok('p2 w vesselStates', enc.vesselStates.has('p2'));
ok('p2.joinedAtRound = 0', enc.vesselStates.get('p2').joinedAtRound === 0);

// timeline ma joinEvent
ok('encounter.timeline ma joinEvent dla p2',
   enc.timeline.length > 0 && enc.timeline[0].joinEvents.some(j => j.vesselId === 'p2'));

EventBus.off('vessel:joinedCombat', subJoin);

// ── T4: _tickEncounter STUB (increment round) ───────────────────────────
console.log('\n--- T4: _tickEncounter STUB ---');
const roundBefore = enc.currentRound;
dscs._tick(0.1);
eq('round inkrementowany po _tick',  enc.currentRound, roundBefore + 1);
ok('encounter wciąż active (stub nie kończy)', enc.isActive);

// ── T5: _finalizeBattle z winner='A' → battle:resolved emit + wreck sideB ─
console.log('\n--- T5: _finalizeBattle pełna semantyka ---');
let battleResolved = [];
const subBattle = (e) => battleResolved.push(e);
EventBus.on('battle:resolved', subBattle);
let wreckEvents = [];
const subWreck = (e) => wreckEvents.push(e);
EventBus.on('vessel:wrecked', subWreck);

dscs._finalizeBattle(enc, 'A', null);  // winner=A, brak retreat → wreck żywych sideB
eq('battle:resolved emitted', battleResolved.length, 1);
ok('payload ma warId=null', battleResolved[0].warId === null);
ok('payload.battleId zaczyna od battle_ds_', battleResolved[0].battleId.startsWith('battle_ds_'));
eq('payload.result.winner', battleResolved[0].result.winner, 'A');
eq('payload.result.location systemId', battleResolved[0].result.location.systemId, 'sys_home');

// sideB enemy1 powinien być wreck (side-level, żywy z hp > 0)
ok('enemy1 jest wreck po finalize (side-level)', enemy1.isWreck === true);
ok('vessel:wrecked event dla e1', wreckEvents.some(w => w.vesselId === 'e1'));

// encounter.isActive = false
ok('encounter.isActive = false po finalize', enc.isActive === false);

// Cleanup w next tick
dscs._tick(0.1);
eq('encounter usunięty z _activeEncounters po cleanup', dscs._activeEncounters.size, 0);

EventBus.off('battle:resolved', subBattle);
EventBus.off('vessel:wrecked', subWreck);

// ── T6: _finalizeBattle z retreated='B' → żywi sideB pozostają ──────────
console.log('\n--- T6: _finalizeBattle retreat (żywi pozostają) ---');
// Świeży encounter z 2 nowymi vesselami
const p3 = vm.addVessel('p3', { x: 100, y: 100 });
const e3 = vm.addVessel('e3', { x: 110, y: 100, ownerEmpireId: 'empire_alpha', isEnemy: true });

const enc2 = dscs.startEngagement('p3', 'e3');
ok('drugi encounter utworzony', !!enc2);

const sub2 = (e) => {};
EventBus.on('battle:resolved', sub2);
dscs._finalizeBattle(enc2, 'A', 'B');  // sideB retreat — e3 nie wreck
ok('e3 NIE jest wreck (retreated B)', e3.isWreck !== true);
EventBus.off('battle:resolved', sub2);

// ── T7: VCS delegation — z FEATURES.m4DeepSpaceCombat ON → DSCS.handle... ─
console.log('\n--- T7: VCS delegation flag ---');
GAME_CONFIG.FEATURES.m4DeepSpaceCombat = true;
GAME_CONFIG.FEATURES.vesselCombat = true;
// Reset DSCS state
dscs._activeEncounters.clear();

const { VesselCombatSystem } = await import('./src/systems/VesselCombatSystem.js');
const vcs = new VesselCombatSystem(vm);

const p4 = vm.addVessel('p4', { x: 200, y: 200 });
const e4 = vm.addVessel('e4', { x: 210, y: 200, ownerEmpireId: 'empire_alpha', isEnemy: true });

// Symuluj combatRangeEnter event — VCS powinien delegować do DSCS
EventBus.emit('vessel:combatRangeEnter', { vesselAId: 'p4', vesselBId: 'e4', sameFaction: false });

eq('encounter utworzony przez VCS delegation', dscs._activeEncounters.size, 1);

// Wyłącz flag — VCS używa starej instant path (BattleSystem)
GAME_CONFIG.FEATURES.m4DeepSpaceCombat = false;
const sizeBeforeInstant = dscs._activeEncounters.size;
// Świeży pair żeby ominąć cooldown
const p5 = vm.addVessel('p5', { x: 300, y: 300 });
const e5 = vm.addVessel('e5', { x: 310, y: 300, ownerEmpireId: 'empire_alpha', isEnemy: true });
EventBus.emit('vessel:combatRangeEnter', { vesselAId: 'p5', vesselBId: 'e5', sameFaction: false });
eq('z flag OFF → DSCS NIE utworzył nowego encounter', dscs._activeEncounters.size, sizeBeforeInstant);

vcs.destroy();
dscs.destroy();

console.log(`\n========== ${pass} PASS / ${fail} FAIL ==========`);
process.exit(fail > 0 ? 1 : 0);
