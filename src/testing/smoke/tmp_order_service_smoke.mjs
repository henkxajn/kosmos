// Slice B/C/E — OrderService (zunifikowana fasada rozkazów) — offline smoke.
//
// Pokrycie:
//   T1  issueTransport same-system → dokładnie 1× expedition:transportRequest, brak pendingOrder
//   T2  issueTransport cross-system → beginJourney(spy) + pendingOrder ustawiony, brak eventu transport
//   T3  issueWarp forward do beginJourney; issueMove forward do issueOrder
//   T4  _maybeDeliver single-hop: interstellar:arrived w celu → 1× transport, pendingOrder clear
//   T5  _maybeDeliver multi-hop: warpRoute!=null → 0 dostaw; po completed → dokładnie 1
//   T6  warpRoute:aborted → pendingOrder clear, 0 dostaw (compositeFailed)
//   T7  target lost (kolonia zniknęła) → 0 dostaw + compositeFailed(target_lost)
//   T8  issuePassenger cross-system → composite; single-hop arrival → expedition:passengerRequest
//   T9  getTraffic — bucket po systemId + inTransit (warp_transit) + missions origin/dest
//   T10 _resumePendingOrders — statek w celu bez warpRoute → dostawa po load

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);},
  removeItem(k){delete this._store[k];}, key(i){return Object.keys(this._store)[i]??null;},
  get length(){return Object.keys(this._store).length;},
};
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const EventBus = (await import('../../core/EventBus.js')).default;
const { OrderService } = await import('../../systems/OrderService.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// ── Mock świata ──────────────────────────────────────────────────────────────
let transportEvents = [], passengerEvents = [], compositeFailed = [];
let beginJourneyCalls = [], issueOrderCalls = [];

function makeVessel(over = {}) {
  return { id:'v_1', name:'Test', systemId:'sys_home', warpFuel:{max:5,consumption:0.5,current:5},
    cargo:{ Fe: 10 }, colonyId:'planet_home', pendingOrder:null, warpRoute:null, position:{state:'docked'}, mission:null, ...over };
}
const world = {
  vessels: new Map(),
  makeKOSMOS(opts = {}) {
    const self = this;
    window.KOSMOS = {
      timeSystem: { gameTime: 100 },
      galaxyData: { systems: [ {id:'sys_home', name:'Dom'}, {id:'sys_beta', name:'Beta'} ] },
      vesselManager: {
        getVessel: (id) => self.vessels.get(id),
        getAllVessels: () => [...self.vessels.values()],
        getVesselsInSystem: (sid) => [...self.vessels.values()].filter(v => (v.systemId ?? 'sys_home') === sid),
        getInterstellarVessels: () => [...self.vessels.values()].filter(v => v.mission?.type === 'interstellar_jump'),
        _findEntity: (id) => ({ id, systemId: 'sys_home' }),
        startReturn: () => {},
        dispatchInterstellar: () => true,
      },
      warpRouteSystem: {
        beginJourney: (vid, sid) => { beginJourneyCalls.push({vid, sid}); return { ok: opts.warpOk !== false }; },
      },
      movementOrderSystem: {
        issueOrder: (vid, spec, o) => { issueOrderCalls.push({vid, spec, o}); return { ok:true }; },
      },
      colonyManager: { hasColony: (id) => opts.colonies?.includes(id) ?? true },
      stationSystem: { getStation: () => null },
      missionSystem: { getActive: () => opts.missions ?? [] },
    };
  },
};
EventBus.on('expedition:transportRequest', (d) => transportEvents.push(d));
EventBus.on('expedition:passengerRequest', (d) => passengerEvents.push(d));
EventBus.on('order:compositeFailed', (d) => compositeFailed.push(d));
function reset() { transportEvents=[]; passengerEvents=[]; compositeFailed=[]; beginJourneyCalls=[]; issueOrderCalls=[]; world.vessels.clear(); }

// ── T1 — same-system transport ───────────────────────────────────────────────
header('T1 same-system transport');
reset(); world.makeKOSMOS(); const os = new OrderService();
world.vessels.set('v_1', makeVessel());
let r = os.issueTransport('v_1', { targetId:'planet_x', targetSystemId:'sys_home', cargo:{Fe:10} });
assert(r.ok && !r.composite, 'issueTransport ok, nie composite');
assert(transportEvents.length === 1, 'dokładnie 1× expedition:transportRequest');
assert(transportEvents[0].targetId === 'planet_x' && transportEvents[0].cargoPreloaded === true, 'payload poprawny');
assert(world.vessels.get('v_1').pendingOrder === null, 'brak pendingOrder (same-system)');

// systemId null (targetSystemId nie podany) → też same-system
reset(); world.vessels.set('v_1', makeVessel());
os.issueTransport('v_1', { targetId:'planet_x' });
assert(transportEvents.length === 1, 'brak targetSystemId → same-system (1 event)');

// ── T2 — cross-system transport → composite ──────────────────────────────────
header('T2 cross-system transport');
reset(); world.vessels.set('v_1', makeVessel({ systemId:'sys_home' }));
r = os.issueTransport('v_1', { targetId:'planet_b', targetSystemId:'sys_beta', cargo:{Fe:5} });
assert(r.ok && r.composite === true, 'issueTransport composite=true');
assert(beginJourneyCalls.length === 1 && beginJourneyCalls[0].sid === 'sys_beta', 'beginJourney(sys_beta) wołany');
assert(transportEvents.length === 0, 'BRAK natychmiastowego transport eventu (czeka na warp)');
const po = world.vessels.get('v_1').pendingOrder;
assert(po && po.kind === 'transport' && po.targetSystemId === 'sys_beta' && po.targetId === 'planet_b', 'pendingOrder ustawiony');

// ── T3 — forwardy issueWarp/issueMove ────────────────────────────────────────
header('T3 forwardy warp/move');
reset(); world.vessels.set('v_1', makeVessel());
os.issueWarp('v_1', 'sys_beta');
assert(beginJourneyCalls.length === 1 && beginJourneyCalls[0].sid === 'sys_beta', 'issueWarp → beginJourney');
os.issueMove('v_1', { type:'moveToPoint', targetPoint:{x:1,y:2} });
assert(issueOrderCalls.length === 1 && issueOrderCalls[0].spec.type === 'moveToPoint', 'issueMove → issueOrder');

// ── T4 — single-hop delivery ─────────────────────────────────────────────────
header('T4 single-hop delivery');
reset(); world.makeKOSMOS({ colonies:['planet_b'] }); os.destroy(); const os4 = new OrderService();
const v4 = makeVessel({ systemId:'sys_home', warpRoute:null });
world.vessels.set('v_1', v4);
os4.issueTransport('v_1', { targetId:'planet_b', targetSystemId:'sys_beta', cargo:{Fe:5} });
assert(transportEvents.length === 0, 'przed przylotem: 0 dostaw');
// symulacja przylotu: systemId zmienia się na cel, brak warpRoute
v4.systemId = 'sys_beta'; v4.warpRoute = null;
EventBus.emit('interstellar:arrived', { vessel: v4, systemId:'sys_beta' });
assert(transportEvents.length === 1, 'po przylocie: dokładnie 1 dostawa');
assert(world.vessels.get('v_1').pendingOrder === null, 'pendingOrder wyczyszczony po dostawie');

// ── T5 — multi-hop delivery (guard warpRoute) ────────────────────────────────
header('T5 multi-hop delivery');
reset(); world.makeKOSMOS({ colonies:['planet_b'] }); os4.destroy(); const os5 = new OrderService();
const v5 = makeVessel({ systemId:'sys_home' });
world.vessels.set('v_1', v5);
os5.issueTransport('v_1', { targetId:'planet_b', targetSystemId:'sys_beta', cargo:{Fe:5} });
// pośredni hop: warpRoute wciąż aktywny, arrival do układu pośredniego
v5.systemId = 'sys_mid'; v5.warpRoute = { hops:['a','b','c'], legIndex:1 };
EventBus.emit('interstellar:arrived', { vessel: v5, systemId:'sys_mid' });
assert(transportEvents.length === 0, 'hop pośredni (warpRoute!=null): 0 dostaw');
// finał: warpRoute wynulowany, jesteśmy w celu, completed
v5.systemId = 'sys_beta'; v5.warpRoute = null;
EventBus.emit('warpRoute:completed', { vesselId:'v_1', finalSystemId:'sys_beta' });
assert(transportEvents.length === 1, 'po completed: dokładnie 1 dostawa');

// ── T6 — abort (redirect) ────────────────────────────────────────────────────
header('T6 abort composite');
reset(); world.makeKOSMOS({ colonies:['planet_b'] }); os5.destroy(); const os6 = new OrderService();
const v6 = makeVessel({ systemId:'sys_home' });
world.vessels.set('v_1', v6);
os6.issueTransport('v_1', { targetId:'planet_b', targetSystemId:'sys_beta' });
EventBus.emit('warpRoute:aborted', { vesselId:'v_1', reason:'diverted' });
assert(world.vessels.get('v_1').pendingOrder === null, 'abort → pendingOrder clear');
assert(compositeFailed.length === 1 && compositeFailed[0].reason === 'diverted', 'compositeFailed(diverted)');
// kolejny arrival nie dostarcza
v6.systemId = 'sys_beta';
EventBus.emit('interstellar:arrived', { vessel: v6, systemId:'sys_beta' });
assert(transportEvents.length === 0, 'po abort: brak dostawy przy przylocie');

// ── T7 — target lost ─────────────────────────────────────────────────────────
header('T7 target lost');
reset(); world.makeKOSMOS({ colonies:[] }); os6.destroy(); const os7 = new OrderService();  // kolonia NIE istnieje
const v7 = makeVessel({ systemId:'sys_home' });
world.vessels.set('v_1', v7);
os7.issueTransport('v_1', { targetId:'planet_gone', targetSystemId:'sys_beta' });
v7.systemId = 'sys_beta'; v7.warpRoute = null;
EventBus.emit('interstellar:arrived', { vessel: v7, systemId:'sys_beta' });
assert(transportEvents.length === 0, 'cel zniknął → 0 dostaw');
assert(compositeFailed.some(e => e.reason === 'target_lost'), 'compositeFailed(target_lost)');
assert(world.vessels.get('v_1').pendingOrder === null, 'pendingOrder clear po target_lost');

// ── T8 — passenger cross-system ──────────────────────────────────────────────
header('T8 passenger cross-system');
reset(); world.makeKOSMOS({ colonies:['planet_b'] }); os7.destroy(); const os8 = new OrderService();
const v8 = makeVessel({ systemId:'sys_home' });
world.vessels.set('v_1', v8);
r = os8.issuePassenger('v_1', { targetId:'planet_b', targetSystemId:'sys_beta' });
assert(r.composite === true && passengerEvents.length === 0, 'passenger cross-system → composite, brak natychmiast');
v8.systemId = 'sys_beta'; v8.warpRoute = null;
EventBus.emit('interstellar:arrived', { vessel: v8, systemId:'sys_beta' });
assert(passengerEvents.length === 1 && passengerEvents[0].targetId === 'planet_b', 'po przylocie: passengerRequest');

// ── T9 — getTraffic ──────────────────────────────────────────────────────────
header('T9 getTraffic');
reset();
world.makeKOSMOS({ missions: [ { id:'m1', vesselId:'v_1', type:'transport', targetId:'planet_b', originSystemId:'sys_home', destSystemId:'sys_beta', status:'en_route' } ] });
os8.destroy(); const os9 = new OrderService();
world.vessels.set('v_1', makeVessel({ systemId:'sys_beta' }));
world.vessels.set('v_2', makeVessel({ id:'v_2', systemId:null, mission:{ type:'interstellar_jump', phase:'warp_transit', fromSystemId:'sys_home', toSystemId:'sys_beta', arrivalYear:120, galProgress:0.4 } }));
const traffic = os9.getTraffic();
assert(traffic.bySystem.get('sys_beta').some(v => v.id === 'v_1'), 'v_1 w buckecie sys_beta');
assert(traffic.inTransit.length === 1 && traffic.inTransit[0].toSystemId === 'sys_beta', 'v_2 w inTransit → sys_beta');
assert(traffic.missions[0].originSystemId === 'sys_home' && traffic.missions[0].destSystemId === 'sys_beta', 'mission origin/dest w traffic');

// ── T10 — _resumePendingOrders ───────────────────────────────────────────────
header('T10 resume po load');
reset(); world.makeKOSMOS({ colonies:['planet_b'] }); os9.destroy(); const os10 = new OrderService();
const v10 = makeVessel({ systemId:'sys_beta', warpRoute:null, pendingOrder:{ kind:'transport', targetId:'planet_b', targetSystemId:'sys_beta', cargo:{Fe:5} } });
world.vessels.set('v_1', v10);
os10._resumePendingOrders();
assert(transportEvents.length === 1, 'resume: statek w celu → dostawa po load');
os10.destroy();

// ── Podsumowanie ─────────────────────────────────────────────────────────────
console.log(`\n=== OrderService: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
