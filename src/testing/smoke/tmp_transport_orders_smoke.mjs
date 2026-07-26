// MVP Zlecenia Transportowe — headless smoke na REALnych systemach.
// Uruchom: node src/testing/smoke/tmp_transport_orders_smoke.mjs
//
// Pokrycie (plan §Testy+gate):
//   T1  createOrder — walidacja (route/kolonia/AI/cross-system/goods) + happy path
//   T2  pula: opt-in gracza, ODRZUCA statek AI, _freePoolVessels filtry
//   T3  dispatch: mix DWÓCH dóbr w JEDNYM kursie (cargoMax mieści wg WAGI) → inFlight
//   T4  wiele statków na jedno zlecenie (2 statki, brak over-assign 3.)
//   T5  anty-nadmiar (inFlight nigdy > goods; drugi statek ładuje tylko resztę)
//   T6  FIFO: 1 wolny statek + 2 zlecenia → starsze pierwsze
//   T7  end-to-end (pełny lot): podział na kursy wg cargoMax/wagi + pusty powrót do F,
//       dostawa do T, zamknięcie, zwrot do puli, transportOrder:completed
//   T8  cleanup vessel:wrecked (usuń z puli/przydziału, zwolnij inFlight)
//   T9  cleanup colony:destroyed (anuluj zlecenie, transportOrder:cancelled)
//   T10 cancelOrder (statki wolne, zlecenie znika)
//   T11 round-trip GameState (orders/pool/nextId przez serialize/restore)
//
// Wagi (ResourcesData): Fe=2.0, Cu=1.8 t/szt → cargoMax 100 t mieści 50 Fe LUB mix.

import '../headless/env.js'; // MUST be first

import EventBus            from '../../core/EventBus.js';
import EntityManager       from '../../core/EntityManager.js';
import gameState           from '../../core/GameState.js';
import { ResourceSystem }  from '../../systems/ResourceSystem.js';
import { TechSystem }      from '../../systems/TechSystem.js';
import { MissionSystem }   from '../../systems/MissionSystem.js';
import { ColonyManager }   from '../../systems/ColonyManager.js';
import { VesselManager }   from '../../systems/VesselManager.js';
import { OrderService }    from '../../systems/OrderService.js';
import { TransportOrderSystem } from '../../systems/TransportOrderSystem.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else      { console.error('  FAIL  ' + name); fail++; }
};
const header = (t) => console.log('\n--- ' + t + ' ---');

// ── Świat: gwiazda + kolonie w sys_home ───────────────────────────────────────
EntityManager.add({ id: 'star_h', name: 'Sol', type: 'star', x: 0, y: 0, mass: 1, systemId: 'sys_home' });
function addPlanet(id, x) {
  EntityManager.add({
    id, name: id, type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
    atmosphere: 'breathable', temperatureK: 280, systemId: 'sys_home', x, y: 0, explored: true,
    deposits: [{ resourceId: 'Fe', richness: 1, totalAmount: 99999, remaining: 99999 }],
    composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
  });
}
addPlanet('F',  400);   // źródło
addPlanet('T',  700);   // cel
addPlanet('T2', 250);   // drugi cel (FIFO)
addPlanet('AI', 550);   // kolonia AI

const resourceSystem = new ResourceSystem();
const techSystem     = new TechSystem(resourceSystem);
const missionSystem  = new MissionSystem(resourceSystem);   // time:tick PRZED TransportOrderSystem
const colonyManager  = new ColonyManager(techSystem);
const vesselManager  = new VesselManager();
const orderService   = new OrderService();

globalThis.window = globalThis;
window.KOSMOS = {
  ...window.KOSMOS,
  scenario: 'civilization', civMode: true, activeSystemId: 'sys_home',
  timeSystem: { gameTime: 100 },
  galaxyData: { systems: [{ id: 'sys_home', name: 'Sol', x: 0, y: 0, z: 0 }] },
  star: EntityManager.get('star_h'),
  resourceSystem, techSystem, missionSystem, expeditionSystem: missionSystem,
  colonyManager, vesselManager, orderService,
  gameState,
  homePlanet: EntityManager.get('F'),
};

gameState.reset();
const tos = new TransportOrderSystem();   // po reset — subskrybuje eventy
window.KOSMOS.transportOrderSystem = tos;

// Kolonie gracza F/T/T2 + kolonia AI (Fe/Cu obfite na źródle).
const colF  = colonyManager.createColony('F',  { Fe: 5000, Cu: 5000, food: 5000, water: 5000 }, 2, 100);
const colT  = colonyManager.createColony('T',  { food: 5000, water: 5000 }, 2, 100);
const colT2 = colonyManager.createColony('T2', { food: 5000, water: 5000 }, 2, 100);
const colAI = colonyManager.createColony('AI', { food: 5000, water: 5000 }, 2, 100, 'emp_ai');
colonyManager.switchActiveColony('F');

// Zdarzenia do obserwacji.
let evCreated = [], evCompleted = [], evCancelled = [], evPool = [];
EventBus.on('transportOrder:created',   d => evCreated.push(d));
EventBus.on('transportOrder:completed', d => evCompleted.push(d));
EventBus.on('transportOrder:cancelled', d => evCancelled.push(d));
EventBus.on('transportOrder:poolChanged', d => evPool.push(d));
const resetEvents = () => { evCreated = []; evCompleted = []; evCancelled = []; evPool = []; };

// Helpery.
let _vn = 0;
function mkVessel(colonyId, opts = {}) {
  return vesselManager.createAndRegister('hull_small', colonyId,
    { name: `Cargo${++_vn}`, cargoMax: 100, fuelMax: 1000, fuel: 1000, ...opts });
}
// Hermetyczny reset MIĘDZY testami: czyści zlecenia/pulę + zaległe misje + resetuje
// wszystkie statki do doku macierzystego (inaczej statki z poprzednich testów zalegają
// w locie i dostarczają ładunek podczas długiej pętli T7).
function clearState() {
  const st = gameState.get('transportOrders');
  st.orders.length = 0; st.pool.length = 0; st.nextId = 1;
  missionSystem._missions.length = 0;
  for (const v of vesselManager.getAllVessels()) {
    v.mission = null; v.movementOrder = null; v.cargo = {}; v.cargoUsed = 0;
    v.position.state = 'docked'; v.position.dockedAt = v.colonyId;
    v.status = 'idle'; v.fuel.current = v.fuel.max;
  }
  resetEvents();
}
function syncYear() { EventBus.emit('time:display', { gameTime: window.KOSMOS.timeSystem.gameTime }); }
function tick(dy) {
  window.KOSMOS.timeSystem.gameTime += dy;
  EventBus.emit('time:display', { gameTime: window.KOSMOS.timeSystem.gameTime });
  EventBus.emit('time:tick', { deltaYears: dy, civDeltaYears: dy * 12 });
}
syncYear();

// ── T1 — createOrder walidacja ────────────────────────────────────────────────
header('T1 createOrder walidacja');
clearState();
ok('invalid_route (F==F)',      tos.createOrder({ fromColonyId: 'F', toColonyId: 'F', goods: { Fe: 10 } }).reason === 'invalid_route');
ok('colony_missing (brak celu)', tos.createOrder({ fromColonyId: 'F', toColonyId: 'NOPE', goods: { Fe: 10 } }).reason === 'colony_missing');
ok('not_player_colony (AI cel)', tos.createOrder({ fromColonyId: 'F', toColonyId: 'AI', goods: { Fe: 10 } }).reason === 'not_player_colony');
ok('no_goods (puste)',           tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: {} }).reason === 'no_goods');
ok('no_goods (zero/ujemne)',     tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 0, Cu: -5 } }).reason === 'no_goods');
const r1 = tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 10 } });
ok('happy path → ok + orderId', r1.ok === true && typeof r1.orderId === 'number');
ok('created event 1×',          evCreated.length === 1 && evCreated[0].orderId === r1.orderId);
const o1 = tos.getOrder(r1.orderId);
ok('order w stanie: goods/delivered{}/inFlight{}', !!o1 && o1.goods.Fe === 10 && typeof o1.delivered === 'object' && typeof o1.inFlight === 'object');

// ── T2 — pula (opt-in gracza, odrzuca AI) ─────────────────────────────────────
header('T2 pula logistyczna');
clearState();
const vPlayer = mkVessel('F');
const vAI     = mkVessel('F'); vAI.ownerEmpireId = 'emp_ai';
ok('addToPool(gracz) → true',   tos.addToPool(vPlayer.id) === true && tos.isInPool(vPlayer.id));
ok('poolChanged event',         evPool.length === 1 && evPool[0].inPool === true);
ok('addToPool(AI) → false',     tos.addToPool(vAI.id) === false && !tos.isInPool(vAI.id));
ok('removeFromPool',            tos.removeFromPool(vPlayer.id) === true && !tos.isInPool(vPlayer.id));
// _freePoolVessels filtry: wreck / cargoMax=0 odrzucone
tos.addToPool(vPlayer.id);
const vWreck = mkVessel('F'); vWreck.isWreck = true; tos.addToPool(vWreck.id);
const vNoCargo = mkVessel('F', { cargoMax: 0 }); tos.addToPool(vNoCargo.id);
const free = tos._freePoolVessels();
ok('_freePoolVessels: tylko zdatny gracz', free.length === 1 && free[0].id === vPlayer.id);

// ── T3 — mix dwóch dóbr w jednym kursie ───────────────────────────────────────
header('T3 mix dwóch dóbr / kurs');
clearState();
const feBefore3 = colF.resourceSystem.getAmount('Fe');
const cuBefore3 = colF.resourceSystem.getAmount('Cu');
const v3 = mkVessel('F', { cargoMax: 100 }); tos.addToPool(v3.id);
// Fe=30 (60 t) + Cu=20 (36 t) = 96 t ≤ 100 → jeden kurs mieści oba.
tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 30, Cu: 20 } });
const o3 = tos.getOrders()[0];
const a3 = o3.assignments[0];
ok('statek przypisany + hauling',    !!a3 && a3.phase === 'hauling' && a3.vesselId === v3.id);
ok('courseCargo ma OBA dobra',       (a3.courseCargo.Fe ?? 0) === 30 && (a3.courseCargo.Cu ?? 0) === 20);
ok('inFlight = załadowane (30/20)',  (o3.inFlight.Fe ?? 0) === 30 && (o3.inFlight.Cu ?? 0) === 20);
ok('statek wystartował (in_transit)', v3.position.state === 'in_transit');
ok('surowiec zdjęty ze źródła F',    (feBefore3 - colF.resourceSystem.getAmount('Fe')) === 30 && (cuBefore3 - colF.resourceSystem.getAmount('Cu')) === 20);

// ── T4 — wiele statków na jedno zlecenie (bez over-assign) ────────────────────
header('T4 wiele statków / zlecenie');
clearState();
const v4a = mkVessel('F'), v4b = mkVessel('F'), v4c = mkVessel('F');
[v4a, v4b, v4c].forEach(v => tos.addToPool(v.id));
// Fe=100 (200 t); cargoMax 100 t = 50 Fe/statek → 2 statki, 3. zbędny.
tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 100 } });
const o4 = tos.getOrders()[0];
ok('2 statki przypisane (100/50)',   o4.assignments.length === 2);
ok('3. statek NIE przypisany (brak over-assign)', o4.assignments.every(a => a.vesselId !== v4c.id) && tos._freePoolVessels().some(v => v.id === v4c.id));
ok('inFlight = 100 (pełne pokrycie)', (o4.inFlight.Fe ?? 0) === 100);

// ── T5 — anty-nadmiar (inFlight ≤ goods) ──────────────────────────────────────
header('T5 anty-nadmiar inFlight');
clearState();
const v5a = mkVessel('F'), v5b = mkVessel('F');
[v5a, v5b].forEach(v => tos.addToPool(v.id));
// Fe=60 (120 t); v1 ładuje 50 (100 t), v2 ładuje tylko resztę 10 → inFlight 60, nie 100.
tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 60 } });
const o5 = tos.getOrders()[0];
ok('inFlight === goods (60, nie 100)', (o5.inFlight.Fe ?? 0) === 60);
ok('drugi statek załadował tylko resztę (10)', o5.assignments.some(a => (a.courseCargo.Fe ?? 0) === 10));

// ── T6 — FIFO ─────────────────────────────────────────────────────────────────
header('T6 FIFO (starsze pierwsze)');
clearState();
window.KOSMOS.timeSystem.gameTime = 100; syncYear();
const rOld = tos.createOrder({ fromColonyId: 'F', toColonyId: 'T',  goods: { Fe: 20 } });   // starsze
window.KOSMOS.timeSystem.gameTime = 105; syncYear();
const rNew = tos.createOrder({ fromColonyId: 'F', toColonyId: 'T2', goods: { Fe: 20 } });   // nowsze
// Dopiero teraz jeden wolny statek → powinien pójść do STARSZEGO (addToPool woła _pump).
const v6 = mkVessel('F'); tos.addToPool(v6.id);
const oOld = tos.getOrder(rOld.orderId), oNew = tos.getOrder(rNew.orderId);
ok('starsze zlecenie dostało statek', oOld.assignments.length === 1);
ok('nowsze zlecenie CZEKA (0 statków)', oNew.assignments.length === 0);

// ── T7 — end-to-end pełny lot ─────────────────────────────────────────────────
header('T7 end-to-end (kursy + pusty powrót + dostawa + zamknięcie)');
clearState();
window.KOSMOS.timeSystem.gameTime = 200; syncYear();
const feBeforeT = colT.resourceSystem.getAmount('Fe');
const v7 = mkVessel('F', { cargoMax: 100 }); tos.addToPool(v7.id);
// Fe=150 (300 t); 50 Fe/kurs → 3 kursy (z pustymi powrotami do F pomiędzy).
const r7 = tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 150 } });
let guard = 0;
while (tos.getOrder(r7.orderId) && guard++ < 300) tick(0.5);
ok('zlecenie zamknięte (usunięte)',       tos.getOrder(r7.orderId) === null);
ok('transportOrder:completed wyemitowane', evCompleted.some(e => e.orderId === r7.orderId));
ok('CAŁE 150 Fe dostarczone do T',        colT.resourceSystem.getAmount('Fe') - feBeforeT === 150);
ok('statek wolny (idle/refueling, docked)', (v7.status === 'idle' || v7.status === 'refueling') && v7.position.state === 'docked');
ok('statek nadal w puli (zwrot)',          tos.isInPool(v7.id));
ok('statek zadokowany w T (ostatnia dostawa)', v7.position.dockedAt === 'T');

// ── T8 — cleanup vessel:wrecked ───────────────────────────────────────────────
header('T8 cleanup vessel:wrecked');
clearState();
const v8 = mkVessel('F'); tos.addToPool(v8.id);
tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 40 } });
const o8 = tos.getOrders()[0];
ok('przed: statek przypisany + inFlight>0', o8.assignments.length === 1 && (o8.inFlight.Fe ?? 0) > 0);
EventBus.emit('vessel:wrecked', { vesselId: v8.id });
ok('po wraku: usunięty z puli',      !tos.isInPool(v8.id));
ok('po wraku: usunięty z przydziału', o8.assignments.every(a => a.vesselId !== v8.id));
ok('po wraku: inFlight zwolniony',   (o8.inFlight.Fe ?? 0) === 0);

// ── T9 — cleanup colony:destroyed ─────────────────────────────────────────────
header('T9 cleanup colony:destroyed');
clearState();
const v9 = mkVessel('F'); tos.addToPool(v9.id);
const r9 = tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 40 } });
EventBus.emit('colony:destroyed', { planetId: 'T' });
ok('zlecenie anulowane (cel zniszczony)', tos.getOrder(r9.orderId) === null);
ok('transportOrder:cancelled(colony_lost)', evCancelled.some(e => e.orderId === r9.orderId && e.reason === 'colony_lost'));

// ── T10 — cancelOrder ─────────────────────────────────────────────────────────
header('T10 cancelOrder');
clearState();
const v10 = mkVessel('F'); tos.addToPool(v10.id);
const r10 = tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 40 } });
ok('cancelOrder → true',        tos.cancelOrder(r10.orderId) === true);
ok('zlecenie znika',            tos.getOrder(r10.orderId) === null);
ok('transportOrder:cancelled(player)', evCancelled.some(e => e.orderId === r10.orderId && e.reason === 'player'));
ok('statek nadal w puli (wolny)', tos.isInPool(v10.id));

// ── T11 — round-trip GameState ────────────────────────────────────────────────
header('T11 round-trip GameState');
clearState();
const v11 = mkVessel('F'); tos.addToPool(v11.id);
tos.createOrder({ fromColonyId: 'F', toColonyId: 'T', goods: { Fe: 33, Cu: 7 } });
const snapshot = JSON.parse(JSON.stringify(gameState.serialize().transportOrders));
gameState.restore({ transportOrders: snapshot });
const st11 = gameState.get('transportOrders');
ok('orders round-trip',   st11.orders.length === 1 && st11.orders[0].goods.Fe === 33 && st11.orders[0].goods.Cu === 7);
ok('pool round-trip',     st11.pool.includes(v11.id));
ok('nextId round-trip',   st11.nextId === snapshot.nextId && st11.nextId >= 2);

// ── T12 — cross-system (warp): dobór statku + leg target ─────────────────────
header('T12 cross-system (warp)');
clearState();
// Drugi układ + kolonia B w nim (5 ly od domu).
EntityManager.add({ id: 'star_b', name: 'Beta', type: 'star', x: 550, y: 550, mass: 1, systemId: 'sys_beta' });
EntityManager.add({
  id: 'B', name: 'Beta-1', type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 280, systemId: 'sys_beta', x: 600, y: 550, explored: true,
  deposits: [], composition: { Fe: 0.3 },
});
window.KOSMOS.galaxyData.systems.push({ id: 'sys_beta', name: 'Beta', x: 5, y: 0, z: 0 });
const colB = colonyManager.createColony('B', { food: 5000, water: 5000 }, 2, 100);

// Spy na OrderService.issueTransport — rejestruje leg target.
const issueCalls = [];
const origIssue = orderService.issueTransport.bind(orderService);
orderService.issueTransport = (id, opts) => { issueCalls.push({ id, opts }); return origIssue(id, opts); };

const warpShip = mkVessel('F', { warpFuelMax: 100, warpFuelCurrent: 100, warpFuelPerLY: 0.5 });
const plainShip = mkVessel('F');   // bez warp (warpFuel.max=0)

// createOrder cross-system dozwolone (brak odrzucenia cross_system).
const rc = tos.createOrder({ fromColonyId: 'F', toColonyId: 'B', goods: { Fe: 40 } });
ok('cross-system createOrder → ok (bez bramki)', rc.ok === true);
const oc = tos.getOrder(rc.orderId);
ok('_isCrossSystem(order) === true', tos._isCrossSystem(oc) === true);
ok('_canServe: warp ship → true',  tos._canServe(warpShip, oc) === true);
ok('_canServe: non-warp ship → false', tos._canServe(plainShip, oc) === false);

// Dispatch: tylko statek warp przypisany.
tos.addToPool(plainShip.id);
tos.addToPool(warpShip.id);
tos._pump();
const oc2 = tos.getOrder(rc.orderId);
ok('cross-system: statek WARP przypisany', (oc2.assignments ?? []).some(a => a.vesselId === warpShip.id));
ok('cross-system: statek non-warp NIE przypisany', !(oc2.assignments ?? []).some(a => a.vesselId === plainShip.id));
ok('leg haul wysłany z targetSystemId=sys_beta', issueCalls.some(c => c.id === warpShip.id && c.opts?.targetId === 'B' && c.opts?.targetSystemId === 'sys_beta'));

// ── T13 — cross-system bez statku warp → czeka ───────────────────────────────
header('T13 cross-system bez statku warp');
clearState();
const plain2 = mkVessel('F');   // tylko non-warp w puli
tos.addToPool(plain2.id);
const rc3 = tos.createOrder({ fromColonyId: 'F', toColonyId: 'B', goods: { Fe: 30 } });
ok('zlecenie cross-system utworzone', tos.getOrder(rc3.orderId) !== null);
ok('brak statku warp → 0 przydziałów (czeka)', (tos.getOrder(rc3.orderId).assignments ?? []).length === 0);
orderService.issueTransport = origIssue;   // przywróć

// ── Podsumowanie ────────────────────────────────────────────────────────────
console.log(`\n=== TransportOrderSystem smoke: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
