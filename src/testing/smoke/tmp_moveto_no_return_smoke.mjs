// Fix "statek wraca na stare miejsce po rozkazie lec-do-X" — offline smoke.
//
// Bug: statek który DOLECIAŁ (orbiting) trzymał martwą misję (arriveAtTarget nie czyści
// vessel.mission). moveToPoint robił snapshot tej misji → _suspendedMission → po dotarciu
// _resumeMissionAfterOrder "wznawiał" ją → statek wracał do targetId starej misji.
//
// Fix (MovementOrderSystem.js):
//   1. _suspendMissionIfAny suspenduje TYLKO misję in_transit (arrived/orbiting → nic).
//   2. _issueMoveToPoint jest TERMINALNY — kasuje _suspendedMission, nie tworzy nowego.
//
// Pokrycie:
//   T1  arrived/orbiting + martwa misja → _suspendMissionIfAny NIE snapshotuje (root cause)
//   T2  in_transit + żywa misja → _suspendMissionIfAny snapshotuje (intencja zachowana)
//   T3  in_transit + misja move_to_point (synth) → brak snapshotu
//   T4  już zawieszona → no-op
//   T5  moveToPoint z orbiting + wcześniejszy _suspendedMission → wyczyszczone (terminalny)
//   T6  moveToPoint z in_transit + _suspendedMission → też wyczyszczone (nigdy nie wraca)

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);},
  removeItem(k){delete this._store[k];}, key(i){return Object.keys(this._store)[i]??null;},
  get length(){return Object.keys(this._store).length;},
};
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const EventBus = (await import('../../core/EventBus.js')).default;
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { MovementOrderSystem } = await import('../../systems/MovementOrderSystem.js');
const { ORDER_TYPES } = await import('../../data/MovementOrderTypes.js');

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// ── Mock świata ──────────────────────────────────────────────────────────────
const vessels = new Map();
window.KOSMOS = { timeSystem: { gameTime: 100 } };
const vm = {
  getAllVessels: () => [...vessels.values()],
  getVessel: (id) => vessels.get(id),
  isImmobilized: () => false,
  _findEntity: () => null,
  _predictPosition: () => null,
  _calcRoute: (sx, sy, tx, ty) => ({ waypoints: [], totalDist: Math.hypot(tx - sx, ty - sy) }),
};

function makeVessel(over = {}) {
  const state = over.state ?? 'orbiting';
  return {
    id: 'v_1', name: 'Test', shipId: 'hull_small', systemId: 'sys_foreign',
    speedAU: 1.5, colonyId: 'planet_home',
    fuel: { current: 9999, consumption: 0 },
    velocity: { vx: 0, vy: 0, updatedYear: 0 },
    missionLog: [],
    position: { state, dockedAt: state === 'orbiting' ? 'body_b' : null, x: 1 * AU_TO_PX, y: 0 },
    mission: over.mission ?? null,
    _suspendedMission: over._suspendedMission,
    ...over,
  };
}

const mos = new MovementOrderSystem(vm);
// Odległy punkt poza strefą wykluczenia Słońca (0.3 AU).
const FAR = { x: 5 * AU_TO_PX, y: 0 };

// ── T1 — root cause: arrived/orbiting nie snapshotuje ─────────────────────────
header('T1 arrived/orbiting + martwa misja → brak snapshotu');
{
  const v = makeVessel({ state: 'orbiting', mission: { type: 'recon', targetId: 'body_b', targetName: 'Beta' } });
  const suspended = mos._suspendMissionIfAny(v);
  assert(suspended === false, '_suspendMissionIfAny zwraca false dla statku który doleciał');
  assert(v._suspendedMission === undefined, 'BRAK _suspendedMission (nie ożyje po moveToPoint)');
}

// ── T2 — intencja zachowana: in_transit snapshotuje ──────────────────────────
header('T2 in_transit + żywa misja → snapshot (intencja pursue/intercept)');
{
  const v = makeVessel({ state: 'in_transit', mission: { type: 'transport', targetId: 'planet_x', phase: 'outgoing' } });
  const suspended = mos._suspendMissionIfAny(v);
  assert(suspended === true, '_suspendMissionIfAny zwraca true dla statku w locie');
  assert(v._suspendedMission?.type === 'transport', '_suspendedMission zachowany (resume po pursue)');
  assert(v._suspendedMission?.suspendedDuringReturn === false, 'suspendedDuringReturn=false (outgoing)');
}

// ── T3 — synth move_to_point nie jest suspendowany ───────────────────────────
header('T3 in_transit + misja move_to_point (synth) → brak snapshotu');
{
  const v = makeVessel({ state: 'in_transit', mission: { type: 'move_to_point', targetX: 0, targetY: 0 } });
  const suspended = mos._suspendMissionIfAny(v);
  assert(suspended === false, 'move_to_point mission NIE suspendowana');
  assert(v._suspendedMission === undefined, 'brak snapshotu synth misji');
}

// ── T4 — już zawieszona → no-op ──────────────────────────────────────────────
header('T4 już zawieszona → no-op');
{
  const preset = { type: 'transport', targetId: 'planet_x' };
  const v = makeVessel({ state: 'in_transit', mission: { type: 'recon', targetId: 'body_c' }, _suspendedMission: preset });
  const suspended = mos._suspendMissionIfAny(v);
  assert(suspended === false, 'no-op gdy już zawieszona');
  assert(v._suspendedMission === preset, 'istniejący snapshot nietknięty');
}

// ── T5 — moveToPoint terminalny (orbiting): kasuje stary snapshot ────────────
header('T5 moveToPoint z orbiting + wcześniejszy _suspendedMission → wyczyszczone');
{
  const v = makeVessel({
    state: 'orbiting',
    mission: { type: 'recon', targetId: 'body_b', targetName: 'Beta' },
    _suspendedMission: { type: 'transport', targetId: 'planet_x', suspendedDuringReturn: true },
  });
  vessels.set('v_1', v);
  const r = mos.issueOrder('v_1', { type: ORDER_TYPES.moveToPoint, targetPoint: FAR });
  assert(r.ok === true, 'moveToPoint wydany OK');
  assert(v._suspendedMission === undefined, '_suspendedMission WYCZYSZCZONY (statek nie wróci)');
  assert(v.mission?.type === 'move_to_point', 'nowa misja = move_to_point');
  assert(v.mission?.targetId == null, 'mission.targetId=null → drift/idle w punkcie po dotarciu');
  vessels.delete('v_1');
}

// ── T6 — moveToPoint terminalny (in_transit): też kasuje snapshot ────────────
header('T6 moveToPoint z in_transit + _suspendedMission → też wyczyszczone');
{
  const v = makeVessel({
    state: 'in_transit',
    mission: { type: 'transport', targetId: 'planet_x', phase: 'outgoing' },
    _suspendedMission: { type: 'transport', targetId: 'planet_x' },
  });
  vessels.set('v_1', v);
  const r = mos.issueOrder('v_1', { type: ORDER_TYPES.moveToPoint, targetPoint: FAR });
  assert(r.ok === true, 'moveToPoint wydany OK (in_transit)');
  assert(v._suspendedMission === undefined, '_suspendedMission WYCZYSZCZONY — brak powrotu nawet z lotu');
  vessels.delete('v_1');
}

console.log(`\n=== moveTo no-return smoke: ${pass} PASS / ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
