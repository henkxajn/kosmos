// SONDA fail-first dla 130 + Z2. Mierzy WYKONANIEM, nie odczytem.
import './env.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { DirectorOffensive } from '../../systems/director/DirectorOffensive.js';

const mkV = (id, enemy, mission) => ({
  id, name: id, ownerEmpireId: enemy ? 'emp_001' : undefined, owner: enemy ? 'emp_001' : 'player',
  isWreck: false, systemId: 'sys_home', serviceState: 'active',
  hp: 100, maxHp: 100, shield: 0, armor: 0,
  warpFuel: { current: 5, max: 10 }, fuel: { current: 5, max: 10 },
  modules: ['weapon_laser'],
  mission, position: { state: 'in_transit', dockedAt: null, x: 1, y: 1 },
});

const raider = mkV('v_ai', true,  { type: 'attack', targetId: 'p_home', phase: 'in_system' });
const mine   = mkV('v_me', false, { type: 'recon',  targetId: 'p_x',    phase: 'in_system' });
const vessels = new Map([[raider.id, raider], [mine.id, mine]]);

window.KOSMOS = {
  vesselManager: { _vessels: vessels, getVessel: (id) => vessels.get(id),
                   getAllVessels: () => [...vessels.values()], _findEntity: () => null },
  movementOrderSystem: {
    _suspendMissionIfAny: (v) => { if (!v.mission) return false; v._suspendedMission = v.mission; return true; },
  },
  debug: { combatTrace: true },
  empireRegistry: { get: () => ({ id: 'emp_001' }), listAll: () => [{ id: 'emp_001' }] },
};

const dscs = new DeepSpaceCombatSystem(window.KOSMOS.vesselManager);
const off  = new DirectorOffensive();

const show = (tag) => {
  console.log(`  ${tag}`);
  for (const v of [raider, mine]) {
    const who = v === raider ? 'rajder AI ' : 'statek gracza';
    console.log(`     ${who}  mission=${v.mission ? v.mission.type : 'null'}` +
                `  _suspendedMission=${v._suspendedMission ? v._suspendedMission.type : 'BRAK'}` +
                `  dockedAt=${v.position.dockedAt}`);
  }
};

console.log('=== A. PRZED starciem ===');
show('stan poczatkowy:');
console.log(`     strikeReadyVessels(emp_001) = [${off.strikeReadyVessels('emp_001').map(v=>v.id)}]  <- ma misje, wiec poza pula`);

console.log('\n=== B. DSCS startEngagement (Finding 130) ===');
try { dscs.startEngagement(raider.id, mine.id); } catch (e) { console.log('  (startEngagement:', e.message, ')'); }
show('po zaangazowaniu:');
console.log(`     strikeReadyVessels(emp_001) = [${off.strikeReadyVessels('emp_001').map(v=>v.id)}]  <- WROCIL do puli`);

console.log('\n=== C. Czy misja ataku zawiera noge POWROTNA? ===');
const snap = raider._suspendedMission ?? raider.mission;
console.log('  snapshot rajdera:', JSON.stringify(snap));
console.log('  -> nawet gdyby BYL snapshot, to bilet w JEDNA strone (moveToPoint przemianowany na attack).');
