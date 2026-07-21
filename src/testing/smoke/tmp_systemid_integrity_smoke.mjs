// Slice A — integralność vessel.systemId (offline smoke).
//
// Inwariant: systemId===null TYLKO w prawdziwym tranzycie warp
// (mission.type==='interstellar_jump' && phase==='warp_transit'); w każdym innym
// stanie konkretny id, a dla misji międzygwiezdnej po tranzycie == mission.toSystemId.
//
// Pokrycie:
//   T1  _resolveSystemId — tranzyt→null; in_system→toSystemId; brak misji→systemId/home
//   T2  _reconcileSystemId — leczy mis-homed arrived; NIE rusza tranzytu (null)
//   T3  serialize zachowuje null (mid-warp) — nie zwija do 'sys_home'
//   T4  restore zachowuje null; reconcile na końcu leczy mis-homed arrived
//   T5  migracja v91→v92: warp_transit→null, arrived mis-homed→toSystemId, pendingOrder=null

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);},
  removeItem(k){delete this._store[k];}, key(i){return Object.keys(this._store)[i]??null;},
  get length(){return Object.keys(this._store).length;},
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {}, timeSystem: { gameTime: 100 } };
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { VesselManager } = await import('../../systems/VesselManager.js');
const { migrate, CURRENT_VERSION } = await import('../../systems/SaveMigration.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// Bare instancja (bez konstruktora → bez subskrypcji EventBus).
function bareVM() {
  const vm = Object.create(VesselManager.prototype);
  vm._vessels = new Map();
  return vm;
}
// Minimalny vessel — reszta pól przez ?? default w serialize/restore.
function mkVessel(over = {}) {
  return {
    id: 'v_1', shipId: 'hull_small', name: 'Test',
    colonyId: 'planet_home', homeColonyId: 'planet_home', systemId: 'sys_home',
    position: { state: 'orbiting', x: 0, y: 0, dockedAt: null },
    fuel: { current: 10, max: 10, consumption: 0.5 },
    warpFuel: { current: 5, max: 5, consumption: 0.5, fuelType: 'warp_cores' },
    mission: null, status: 'idle', modules: [], cargo: {},
    ...over,
  };
}

const vm = bareVM();

// ── T1 — _resolveSystemId ────────────────────────────────────────────────────
header('T1 _resolveSystemId');
assert(vm._resolveSystemId(mkVessel({ mission: { type:'interstellar_jump', phase:'warp_transit', toSystemId:'sys_beta' } })) === null,
  'warp_transit → null (znacznik tranzytu)');
assert(vm._resolveSystemId(mkVessel({ systemId:'sys_home', mission: { type:'interstellar_jump', phase:'in_system', toSystemId:'sys_beta' } })) === 'sys_beta',
  'in_system → mission.toSystemId (nawet gdy systemId stale=home)');
assert(vm._resolveSystemId(mkVessel({ systemId:'sys_gamma', mission: null })) === 'sys_gamma',
  'brak misji → v.systemId');
assert(vm._resolveSystemId(mkVessel({ systemId: undefined, mission: null })) === 'sys_home',
  'brak misji + undefined → sys_home');

// ── T2 — _reconcileSystemId ──────────────────────────────────────────────────
header('T2 _reconcileSystemId');
const arrived = mkVessel({ systemId:'sys_home', mission:{ type:'interstellar_jump', phase:'in_system', toSystemId:'sys_beta' } });
const changed = vm._reconcileSystemId(arrived);
assert(changed === true && arrived.systemId === 'sys_beta', 'mis-homed arrived → naprawiony na sys_beta');
assert(vm._reconcileSystemId(arrived) === false, 'idempotentne (drugi przebieg = brak zmian)');
const transit = mkVessel({ systemId:null, mission:{ type:'interstellar_jump', phase:'warp_transit', toSystemId:'sys_beta' } });
assert(vm._reconcileSystemId(transit) === false && transit.systemId === null, 'tranzyt (null) NIE ruszony');

// ── T3 — serialize zachowuje null ────────────────────────────────────────────
header('T3 serialize preserves null');
const vmS = bareVM();
vmS._vessels.set('v_1', mkVessel({ id:'v_1', systemId:null, position:{ state:'in_transit', x:5, y:5, dockedAt:null },
  mission:{ type:'interstellar_jump', phase:'warp_transit', toSystemId:'sys_beta', fromSystemId:'sys_home' } }));
const ser = vmS.serialize();
assert(ser.vessels[0].systemId === null, 'mid-warp systemId serializowany jako null (nie sys_home)');
vmS._vessels.set('v_2', mkVessel({ id:'v_2', systemId:'sys_beta' }));
const ser2 = vmS.serialize();
assert(ser2.vessels.find(v=>v.id==='v_2').systemId === 'sys_beta', 'zwykły statek: systemId zachowany');
assert('pendingOrder' in ser.vessels[0] && ser.vessels[0].pendingOrder === null, 'pendingOrder serializowany (null default)');

// ── T4 — restore zachowuje null + reconcile leczy ────────────────────────────
header('T4 restore preserves null + heals');
const vmR = bareVM();
vmR.restore({ vessels: [
  { id:'v_1', shipId:'hull_small', name:'T', colonyId:'p', systemId:null, position:{state:'in_transit'}, fuel:{},
    mission:{ type:'interstellar_jump', phase:'warp_transit', toSystemId:'sys_beta' } },
  { id:'v_2', shipId:'hull_small', name:'T2', colonyId:'p', systemId:'sys_home', position:{state:'orbiting'}, fuel:{},
    mission:{ type:'interstellar_jump', phase:'in_system', toSystemId:'sys_beta' } },
], nextId: 3 });
assert(vmR._vessels.get('v_1').systemId === null, 'restore: mid-warp zostaje null');
assert(vmR._vessels.get('v_2').systemId === 'sys_beta', 'restore: mis-homed arrived (home) uleczony → sys_beta');

// ── T5 — migracja v91→v92 ────────────────────────────────────────────────────
header('T5 migracja v91→v92');
const save = {
  version: 91,
  civ4x: {
    vesselManager: { vessels: [
      { id:'v_1', systemId:'sys_home', mission:{ type:'interstellar_jump', phase:'warp_transit', toSystemId:'sys_beta' } },
      { id:'v_2', systemId:'sys_home', mission:{ type:'interstellar_jump', phase:'in_system', toSystemId:'sys_beta' } },
      { id:'v_3', systemId:'sys_home', mission:null },
    ] },
    missions: { missions: [ { id:'m_1', type:'transport', targetId:'planet_x' } ] },
  },
};
const out = migrate(save);
assert(!out.error, 'migracja bez błędu');
assert(out.version === CURRENT_VERSION && CURRENT_VERSION === 92, 'wersja → 92');
const mv = (id) => out.civ4x.vesselManager.vessels.find(v => v.id === id);
assert(mv('v_1').systemId === null, 'v_1 warp_transit → null (przywrócony tranzyt)');
assert(mv('v_2').systemId === 'sys_beta', 'v_2 arrived mis-homed → toSystemId');
assert(mv('v_3').systemId === 'sys_home', 'v_3 bez misji → bez zmian');
assert(mv('v_1').pendingOrder === null && mv('v_3').pendingOrder === null, 'pendingOrder default null');
assert(out.civ4x.missions.missions[0].originSystemId === 'sys_home' && out.civ4x.missions.missions[0].destSystemId === 'sys_home',
  'mission origin/dest default sys_home');

// ── Podsumowanie ─────────────────────────────────────────────────────────────
console.log(`\n=== Slice A: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
