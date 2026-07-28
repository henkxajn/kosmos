// vessel:orderBlocked → _resumeMissionAfterOrder — offline smoke (pre-existing order-layer bug fix).
//
// Bug: MOS._blockAndCancel (np. pursue/engage target_lost gdy cel-wróg zginął w bitwie) emituje
// vessel:orderBlocked, ale VesselManager subskrybował TYLKO orderCompleted + orderCancelled.
// _suspendMissionIfAny snapshotuje misję do _suspendedMission ALE NIE czyści vessel.mission
// (pursue/engage prowadzą pozycję bezpośrednio). Efekt po bloku: OSIEROCONE _suspendedMission
// OBOK niewyczyszczonej vessel.mission (oba set, ten sam targetId) — dokładnie stan "Smok II".
//
// Fix: EventBus.on('vessel:orderBlocked', ({vesselId}) => this._resumeMissionAfterOrder(vesselId)).
// _resumeMissionAfterOrder rebuilduje vessel.mission z _suspendedMission i USUWA _suspendedMission
// → zostaje JEDNA misja. driftIdle jest set tylko na COMPLETION (nie block) i czyszczony przy
// issueOrder → brak konfliktu z drift auto-return (potwierdzone osobno).
//
// Pokrycie:
//   T1  wiring — emit vessel:orderBlocked woła _resumeMissionAfterOrder z vesselId
//   T2  end-to-end — orphan (_suspendedMission + vessel.mission) → resume: jedna misja, snapshot usunięty
//   T3  brak _suspendedMission → no-op (nie psuje statku bez zawieszonej misji)
//   T4  idempotencja — drugi orderBlocked po resume = no-op (snapshot już zjedzony)

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);},
  removeItem(k){delete this._store[k];}, key(i){return Object.keys(this._store)[i]??null;},
  get length(){return Object.keys(this._store).length;},
};
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const EventBus = (await import('../../core/EventBus.js')).default;
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { VesselManager } = await import('../../systems/VesselManager.js');

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

window.KOSMOS = { timeSystem: { gameTime: 100 } };

// Realny konstruktor → wiring EventBus (to jest kod pod testem).
const vm = new VesselManager();

// ── T1 — wiring: orderBlocked woła _resumeMissionAfterOrder ───────────────────
header('T1 wiring: emit vessel:orderBlocked → _resumeMissionAfterOrder');
{
  const calls = [];
  const orig = vm._resumeMissionAfterOrder.bind(vm);
  vm._resumeMissionAfterOrder = (id) => calls.push(id);
  EventBus.emit('vessel:orderBlocked', { vesselId: 'v_wire', orderId: 'o1', reason: 'target_lost' });
  assert(calls.length === 1 && calls[0] === 'v_wire', '_resumeMissionAfterOrder wywołany z vesselId');
  vm._resumeMissionAfterOrder = orig;  // przywróć realną metodę
}

// Stuby świata dla realnego _resumeMissionAfterOrder (cel = ciało z pozycją).
const BODY = { id: 'body_x', name: 'Beta', x: 4 * AU_TO_PX, y: 0, systemId: 'sys_home' };
vm._findEntity      = (id) => (id === 'body_x' ? BODY : null);
vm._predictPosition = () => ({ x: BODY.x, y: BODY.y });
vm._calcRoute       = (sx, sy, tx, ty) => ({ waypoints: [], totalDist: Math.hypot(tx - sx, ty - sy) });

function makeOrphanVessel() {
  // Statek w stanie "Smok II": pursue zawiesiło misję (snapshot) ale nie wyczyściło vessel.mission.
  const mission = { type: 'transport', targetId: 'body_x', targetName: 'Beta', phase: 'outgoing' };
  return {
    id: 'v_orphan', name: 'Smok II', shipId: 'hull_frigate', systemId: 'sys_home',
    speedAU: 1.5, colonyId: 'planet_home', unpaidYears: 0,
    fuel: { current: 9999, consumption: 0 },
    velocity: { vx: 0, vy: 0, updatedYear: 0 },
    missionLog: [],
    position: { state: 'orbiting', dockedAt: null, x: 1 * AU_TO_PX, y: 0 },
    mission: { ...mission },                               // NIEwyczyszczona (pursue nie kasuje)
    _suspendedMission: { ...mission, suspendedDuringReturn: false },  // snapshot
    movementOrder: { type: 'pursue', status: 'blocked' },  // stale marker (deviation #3, inert)
  };
}

// ── T2 — end-to-end: orphan → resume czyści snapshot i zostawia jedną misję ──
header('T2 end-to-end: orphan (_suspendedMission + vessel.mission) → jedna misja');
{
  const v = makeOrphanVessel();
  vm._vessels.set('v_orphan', v);
  EventBus.emit('vessel:orderBlocked', { vesselId: 'v_orphan', orderId: 'o2', reason: 'target_lost' });
  assert(v._suspendedMission === undefined, '_suspendedMission USUNIĘTY (koniec osierocenia)');
  assert(v.mission != null, 'vessel.mission nadal ustawiona (jedna, wznowiona)');
  assert(v.mission.targetId === 'body_x', 'wznowiona misja celuje w oryginalny target');
  assert(v.position.state === 'in_transit', 'statek znów w locie (resume in_transit)');
  vm._vessels.delete('v_orphan');
}

// ── T3 — brak snapshotu → no-op ──────────────────────────────────────────────
header('T3 brak _suspendedMission → no-op (statek bez zawieszonej misji nietknięty)');
{
  const v = makeOrphanVessel();
  delete v._suspendedMission;
  v.mission = { type: 'recon', targetId: 'body_x', phase: 'outgoing' };
  v.position.state = 'orbiting';
  vm._vessels.set('v_orphan', v);
  EventBus.emit('vessel:orderBlocked', { vesselId: 'v_orphan', orderId: 'o3', reason: 'target_lost' });
  assert(v.mission?.type === 'recon', 'misja bez snapshotu nietknięta (no-op)');
  assert(v.position.state === 'orbiting', 'stan nietknięty (nie wznawia bez _suspendedMission)');
  vm._vessels.delete('v_orphan');
}

// ── T4 — idempotencja: drugi orderBlocked po resume = no-op ───────────────────
header('T4 idempotencja: drugi orderBlocked po resume = no-op');
{
  const v = makeOrphanVessel();
  vm._vessels.set('v_orphan', v);
  EventBus.emit('vessel:orderBlocked', { vesselId: 'v_orphan', orderId: 'o4a', reason: 'target_lost' });
  const missionAfterFirst = v.mission;
  EventBus.emit('vessel:orderBlocked', { vesselId: 'v_orphan', orderId: 'o4b', reason: 'target_lost' });
  assert(v._suspendedMission === undefined, 'nadal brak _suspendedMission');
  assert(v.mission === missionAfterFirst, 'druga emisja nie przebudowała misji (snapshot już zjedzony)');
  vm._vessels.delete('v_orphan');
}

console.log(`\n=== orderBlocked→resume smoke: ${pass} PASS / ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
