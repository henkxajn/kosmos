// ═══════════════════════════════════════════════════════════════
// Smoke test — EmpireLogisticsSystem (Warstwa 2: logistyka kurierska AI)
// Uruchom: node src/testing/headless/test-empire-logistics.mjs
// ───────────────────────────────────────────────────────────────
// Slice 2 / Sesja 3. Harness jak test-empire-strategy.mjs + REALNY VesselManager.
// Model ROUTE-BASED: 2 kurierzy/route (stolica↔outpost), krążą póki route żyje.
//
//   T1     — pusty empire (brak stolicy) → dispatcher no-op
//   T2     — outpost ale brak stoczni @stolica → brak budowy/trasy (czeka)
//   T3     — outpost Xe + stocznia → route + build #1 (pendingBuildRoute)
//   T4     — sloty stoczni zajęte → no build
//   T5     — ship completed → claim do route.courierIds + tag (owner/isEnemy/assignedRouteId)
//   T6     — state machine cykl IDLE→OUTBOUND→LOADING→RETURNING→AT_MOTHER→IDLE
//   T7/T20 — cargo rare-first (Xe przed Fe; waga uwzględniona)
//   T8     — return → unload do stolicy → dock → re-dispatch (pętla)
//   T9/T18 — outpost destroyed → kurierzy→reserve, route usunięty
//   T10    — vessel wrecked → usunięty z route (dispatcher odbuduje)
//   T11    — 4 outposty → 4 routes (→stolica)
//   T12    — multi-kolonia: tylko stolica = macierzysta
//   T14    — deposit <10% → _checkDepletion zwraca złoże
//   T15    — broke capital → queued build, pendingBuildRoute spójny (no double)
//   T16    — player isolation: gracz hull_small NIE claimowany
//   T17    — route invariant: NIGDY >couriersPerRoute
//   T19    — fuel sanity: stolica bez power_cells → dispatch i tak (clamp)
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first — shim localStorage/window/THREE
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }         from '../../systems/ColonyManager.js';
import { EmpireRegistry }        from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { EmpireLogisticsSystem } from '../../systems/EmpireLogisticsSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

// ── Permisywny techStub (mnożniki=1, isResearched=true) ──────────
const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

// ── Deposit helpers ──────────────────────────────────────────────
const XE = (richness = 1.0, remaining = 50000) => ({ resourceId: 'Xe', richness, totalAmount: remaining, remaining });
const NT = (richness = 0.3, remaining = 10000) => ({ resourceId: 'Nt', richness, totalAmount: remaining, remaining });
const FE = (remaining = 100000) => ({ resourceId: 'Fe', richness: 1, totalAmount: remaining, remaining });

let _bodyCounter = 0;
const uid = (prefix) => `${prefix}_${++_bodyCounter}`;

// Planeta rocky (kandydat na stolicę) z jawnym x/y (1 AU ≈ 110 px).
const mkPlanet = (id, x, y, deposits = [FE()]) => EntityManager.add({
  id, name: id, type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 280, systemId: 'sys_x', x, y, deposits,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
// Księżyc (kandydat na outpost) z jawnym x/y.
const mkMoon = (id, x, y, deposits) => EntityManager.add({
  id, name: id, type: 'moon', moonType: 'rocky', radius: 0.3, mass: 0.1,
  atmosphere: 'none', temperatureK: 200, systemId: 'sys_x', x, y, deposits,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});

// Gwiazda w (0,0) — _calcRoute liczy strefę wykluczenia wokół niej.
EntityManager.add({ id: 'star_x', name: 'Star X', type: 'star', x: 0, y: 0, mass: 1, systemId: 'sys_x' });

// ── Realne systemy + window.KOSMOS ───────────────────────────────
const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
const vesselManager  = new VesselManager();

// Dynamiczny rejestr ciał systemu (testy dodają outposty w locie).
const SYS_BODIES = { planetIds: [], moonIds: [], planetoidIds: [] };

globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  timeSystem: { gameTime: 100 },
  scenario: 'civilization',
  star: EntityManager.get('star_x'),
  colonyManager,
  empireRegistry,
  vesselManager,
  techSystem: techStub,  // GLOBALNY (gracz) — AI używa colony.techSystem
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: {
    getSystem: (id) => id === 'sys_x' ? {
      planetIds:    [...SYS_BODIES.planetIds],
      moonIds:      [...SYS_BODIES.moonIds],
      planetoidIds: [...SYS_BODIES.planetoidIds],
    } : null,
  },
  homePlanet: null,
};

const logi = new EmpireLogisticsSystem();
const gt = () => window.KOSMOS.timeSystem.gameTime;
const setGt = (v) => { window.KOSMOS.timeSystem.gameTime = v; };

// ── Helpery setupu ───────────────────────────────────────────────
// Stolica (pełna kolonia AI) ze stocznią. broke=true → bez surowców na statki.
function mkCapital(empireId, planetX, planetY, opts = {}) {
  const planetId = uid('cap');
  mkPlanet(planetId, planetX, planetY);
  SYS_BODIES.planetIds.push(planetId);
  empireRegistry.createEmpire({ id: empireId, archetype: 'industrialist', homeSystemId: 'sys_x' });
  const cap = EmpireColonyBootstrap.bootstrapColony(empireId, 'sys_x', planetId, {
    startPop:       { laborer: 12, worker: 3 },
    startResources: { food: 500, water: 500 },
    startBuildings: opts.noShipyard
      ? ['colony_base', 'solar_farm', 'mine']
      : ['colony_base', 'shipyard', 'solar_farm', 'mine'],
    archetypeId: 'industrialist',
  });
  if (!opts.broke) {
    // Hojny zapas — startShipBuild buduje natychmiast (hull_small+engine+cargo_small).
    cap.resourceSystem.receive({
      Fe: 5000, Ti: 500, Cu: 500, Si: 500, Hv: 200,
      structural_alloys: 200, polymer_composites: 100, power_cells: 100,
      propulsion_systems: 50, plasma_cores: 50, warp_cores: 50,
      metamaterials: 50, quantum_processors: 50,
    });
  }
  return { empireId, capital: cap, planetId };
}

// Outpost Xe (autonom. solar+mine) z zapasem surowca w resourceSystem.
function mkXeOutpost(empireId, x, y, stock = { Xe: 6000, Fe: 600 }, deposits = [XE(1.2), FE()]) {
  const bodyId = uid('xeo');
  mkMoon(bodyId, x, y, deposits);
  SYS_BODIES.moonIds.push(bodyId);
  EmpireColonyBootstrap.bootstrapAutonomousOutpost(empireId, 'sys_x', bodyId, 'autonomous_solar_farm');
  EmpireColonyBootstrap.bootstrapAutonomousOutpost(empireId, 'sys_x', bodyId, 'autonomous_mine');
  const op = colonyManager.getColony(bodyId);
  if (stock) op.resourceSystem.receive(stock);
  return { bodyId, outpost: op };
}

// Symuluj ruch statków do gameTime t (auto-arrival outbound w _updatePositions).
function flyTo(t) { setGt(t); vesselManager._updatePositions(0.1); }

// ═══════════════════════════════════════════════════════════════
console.log('--- T1: pusty empire (brak stolicy) → dispatcher no-op ---');
{
  empireRegistry.createEmpire({ id: 'emp_empty', archetype: 'industrialist', homeSystemId: 'sys_x' });
  const emp = empireRegistry.get('emp_empty');
  let threw = false;
  try { logi._runDispatcher(emp); } catch (_e) { threw = true; }
  ok('dispatcher nie rzuca', !threw);
  ok('brak routes (logistics lazy lub puste)', !(emp.logistics?.routes?.length));
}

console.log('--- T2: outpost ale brak stoczni @stolica → brak budowy ---');
{
  const { empireId, capital } = mkCapital('emp_noyard', 400, 0, { noShipyard: true });
  mkXeOutpost(empireId, 700, 0);
  const emp = empireRegistry.get(empireId);
  ok('stolica faktycznie bez stoczni', colonyManager._getShipyardLevel(capital) === 0);
  logi._runDispatcher(emp);
  ok('brak pendingBuildRoute (czeka na stocznię)', (emp.logistics?.pendingBuildRoute ?? null) === null);
  ok('brak buildu (stats.built=0)', (emp.logistics?.stats?.built ?? 0) === 0);
}

console.log('--- T3: outpost Xe + stocznia → route + build #1 ---');
const T3 = mkCapital('emp_main', 400, 300);
const T3out = mkXeOutpost('emp_main', 700, 300);
const empMain = empireRegistry.get('emp_main');
{
  ok('stolica MA stocznię', colonyManager._getShipyardLevel(T3.capital) >= 1);
  logi._runDispatcher(empMain);
  const route = empMain.logistics.routes.find(r => r.outpostId === T3out.bodyId);
  ok('route utworzony (→ stolica)', !!route && route.motherId === T3.planetId);
  ok('pendingBuildRoute = routeId', empMain.logistics.pendingBuildRoute === route?.routeId);
  ok('stats.built === 1', empMain.logistics.stats.built === 1);
}

console.log('--- T4: sloty stoczni zajęte → no build ---');
{
  const { empireId, capital } = mkCapital('emp_full', 400, 600);
  mkXeOutpost(empireId, 700, 600);
  const emp = empireRegistry.get(empireId);
  // Zapełnij wszystkie sloty stoczni (shipyardLevel) pseudo-buildami.
  const lvl = colonyManager._getShipyardLevel(capital);
  capital.shipQueues = Array.from({ length: lvl }, () => ({ shipId: 'hull_small', progress: 0, buildTime: 3 }));
  logi._runDispatcher(emp);
  ok('brak buildu gdy sloty pełne', (emp.logistics.pendingBuildRoute ?? null) === null && emp.logistics.stats.built === 0);
}

console.log('--- T5: ship completed → claim do route.courierIds + tag ---');
{
  // empMain ma pendingBuildRoute z T3 — symuluj ukończenie statku w stoczni stolicy.
  const route = empMain.logistics.routes[0];
  EventBus.emit('fleet:shipCompleted', { planetId: T3.planetId, shipId: 'hull_small', modules: ['engine_chemical', 'cargo_small'] });
  const cid = route.courierIds[0];
  const v = vesselManager.getVessel(cid);
  ok('kurier dopięty do route.courierIds', route.courierIds.length === 1 && !!v);
  ok('ownerEmpireId = emp_main', v?.ownerEmpireId === 'emp_main');
  ok('isEnemy = true', v?.isEnemy === true);
  ok('assignedRouteId = routeId', v?.assignedRouteId === route.routeId);
  ok('homed @stolica (colonyId)', v?.colonyId === T3.planetId);
  ok('pendingBuildRoute wyczyszczony', empMain.logistics.pendingBuildRoute === null);
}

console.log('--- T6: state machine cykl IDLE→OUTBOUND→LOADING→RETURNING→dock ---');
{
  const route = empMain.logistics.routes[0];
  const cid = route.courierIds[0];
  const v = vesselManager.getVessel(cid);
  const capRes = T3.capital.resourceSystem;
  const xeBefore = capRes.getAmount('Xe');

  // (a) IDLE@stolica → dispatch outbound
  logi._advanceAllCouriers();
  ok('po dispatch: in_transit', v.position.state === 'in_transit');
  ok('mission.targetId = outpost', v.mission?.targetId === T3out.bodyId);
  ok('stats.dispatched >= 1', empMain.logistics.stats.dispatched >= 1);

  // (b) lot do outpostu → auto-arrival (orbiting)
  flyTo(v.mission.arrivalYear + 0.5);
  ok('orbiting @outpost', v.position.state === 'orbiting' && v.position.dockedAt === T3out.bodyId);

  // (c) LOADING → loadByRarity do pełna → startReturn
  logi._advanceAllCouriers();
  ok('cargo załadowany (cargoUsed>0)', (v.cargoUsed ?? 0) > 0);
  ok('faza returning po pełnym załadunku', v.mission?.phase === 'returning');

  // (d) powrót → past returnYear → deliver + dock
  flyTo(v.mission.returnYear + 0.5);
  logi._advanceAllCouriers();
  ok('zadokowany @stolica (idle+docked)', v.status === 'idle' && v.position.state === 'docked' && v.position.dockedAt === T3.planetId);
  ok('cargo rozładowany (cargoUsed=0)', (v.cargoUsed ?? 0) === 0);
  ok('Xe dostarczony do stolicy', capRes.getAmount('Xe') > xeBefore);
  ok('stats.delivered >= 1', empMain.logistics.stats.delivered >= 1);
}

console.log('--- T8: re-dispatch po dokowaniu (pętla nieskończona) ---');
{
  const route = empMain.logistics.routes[0];
  const cid = route.courierIds[0];
  const v = vesselManager.getVessel(cid);
  logi._advanceAllCouriers();   // idle@stolica → ponowny dispatch
  ok('ponowny dispatch (in_transit)', v.position.state === 'in_transit' && v.mission?.targetId === T3out.bodyId);
}

console.log('--- T7/T20: cargo rare-first (Xe przed Fe; waga uwzględniona) ---');
{
  // hull_small + cargo_small → cargoMax 200t. Outpost: 1000 Xe (w 0.1t=100t) + 1000 Fe (w 2t).
  // Rare-first: Xe (rarity 5) ładowany w całości (1000 szt = 100t), Fe (rarity 1) wypełnia
  // resztę: (200-100)/2.0 = 50 szt. Cu=0 (brak). Asercja: Xe pełny, Fe tylko filler.
  const v = vesselManager.createAndRegister('hull_small', T3.planetId, { modules: ['engine_chemical', 'cargo_small'] });
  const rs = colonyManager.getColony(T3out.bodyId).resourceSystem;
  // Wyzeruj i ustaw dokładny stan
  for (const r of ['Xe', 'Fe', 'Cu', 'Si', 'Ti', 'Li', 'Hv', 'C', 'Nt']) {
    const cur = rs.getAmount(r); if (cur > 0) rs.spend({ [r]: cur });
  }
  rs.receive({ Xe: 1000, Fe: 1000 });
  logi._loadByRarity(v, rs);
  ok('Xe załadowany w całości (1000)', (v.cargo.Xe ?? 0) === 1000);
  ok('Fe tylko filler (50, po Xe)', (v.cargo.Fe ?? 0) === 50);
  ok('cargoUsed = 200t (pełny)', Math.abs((v.cargoUsed ?? 0) - 200) < 1e-6);
  vesselManager.removeVessel?.(v.id);
}

console.log('--- T11: 4 outposty Xe → 4 routes (→ stolica) ---');
{
  const { empireId, capital } = mkCapital('emp_four', -400, 0);
  mkXeOutpost(empireId, -700, 0);
  mkXeOutpost(empireId, -400, 300);
  mkXeOutpost(empireId, -700, 300);
  mkXeOutpost(empireId, -400, -300);
  const emp = empireRegistry.get(empireId);
  // Kilka przebiegów (1 build/empire na raz nie ogranicza liczby ROUTES — tylko buildów).
  for (let i = 0; i < 6; i++) logi._runDispatcher(emp);
  ok('4 routes', emp.logistics.routes.length === 4);
  ok('wszystkie route → stolica', emp.logistics.routes.every(r => r.motherId === capital.planetId));
}

console.log('--- T12: multi-kolonia — tylko stolica jest macierzysta ---');
{
  const { empireId, capital } = mkCapital('emp_multi', 0, 500);
  // Druga PEŁNA kolonia (nie outpost) tego imperium
  const col2Id = uid('cap2'); mkPlanet(col2Id, 0, 800); SYS_BODIES.planetIds.push(col2Id);
  EmpireColonyBootstrap.bootstrapColony(empireId, 'sys_x', col2Id, {
    startPop: { laborer: 3, worker: 1 }, startResources: { food: 200, water: 200 },
    startBuildings: ['colony_base', 'shipyard', 'solar_farm', 'mine'], archetypeId: 'industrialist',
  });
  mkXeOutpost(empireId, 300, 500);
  const emp = empireRegistry.get(empireId);
  for (let i = 0; i < 3; i++) logi._runDispatcher(emp);
  ok('route motherId === stolica (pierwsza pełna)', emp.logistics.routes.every(r => r.motherId === capital.planetId));
  ok('1 route (1 outpost, nie 2 macierzyste)', emp.logistics.routes.length === 1);
}

console.log('--- T9/T18: outpost destroyed → kurierzy→reserve, route usunięty ---');
{
  const { empireId } = mkCapital('emp_destroy', 800, 0);
  const out = mkXeOutpost(empireId, 1000, 0);
  const emp = empireRegistry.get(empireId);
  logi._runDispatcher(emp);
  const route = emp.logistics.routes[0];
  EventBus.emit('fleet:shipCompleted', { planetId: emp.logistics.routes[0].motherId, shipId: 'hull_small', modules: ['engine_chemical', 'cargo_small'] });
  const cid = route.courierIds[0];
  ok('kurier istnieje przed destroy', !!vesselManager.getVessel(cid));
  // Zniszcz outpost
  EventBus.emit('colony:destroyed', { planetId: out.bodyId, destroyedVesselIds: [] });
  ok('route usunięty', !emp.logistics.routes.find(r => r.outpostId === out.bodyId));
  ok('kurier w reserve', emp.logistics.reserve.includes(cid));
  ok('kurier assignedRouteId=null', vesselManager.getVessel(cid)?.assignedRouteId === null);
}

console.log('--- T10: vessel wrecked → usunięty z route ---');
{
  const { empireId } = mkCapital('emp_wreck', 800, 400);
  mkXeOutpost(empireId, 1000, 400);
  const emp = empireRegistry.get(empireId);
  logi._runDispatcher(emp);
  const route = emp.logistics.routes[0];
  EventBus.emit('fleet:shipCompleted', { planetId: route.motherId, shipId: 'hull_small', modules: ['engine_chemical', 'cargo_small'] });
  const cid = route.courierIds[0];
  ok('kurier w route przed wreck', route.courierIds.includes(cid));
  EventBus.emit('vessel:wrecked', { vesselId: cid, vessel: vesselManager.getVessel(cid) });
  ok('kurier usunięty z route', !route.courierIds.includes(cid));
}

console.log('--- T14: deposit <10% → _checkDepletion zwraca złoże ---');
{
  // Outpost z prawie wyczerpanym Xe (remaining/total < 0.1)
  const { empireId } = mkCapital('emp_deplete', -800, 0);
  const out = mkXeOutpost(empireId, -1000, 0, { Xe: 100 }, [{ resourceId: 'Xe', richness: 1, totalAmount: 1000, remaining: 50 }, FE()]);
  const low = logi._checkDepletion(out.outpost);
  ok('Xe na liście wyczerpanych (<10%)', low.includes('Xe'));
  ok('Fe NIE wyczerpany', !low.includes('Fe'));
}

console.log('--- T15: broke capital → queued build, pendingBuildRoute spójny ---');
{
  const { empireId } = mkCapital('emp_broke', -800, 400, { broke: true });
  // Wyzeruj surowce stolicy → startShipBuild zwróci {ok,queued}
  const emp = empireRegistry.get(empireId);
  const cap = empireRegistry.getColoniesByEmpire(empireId)[0];
  for (const r of ['Fe', 'Ti', 'Cu', 'Si', 'Hv', 'structural_alloys', 'polymer_composites', 'power_cells']) {
    const cur = cap.resourceSystem.getAmount(r); if (cur > 0) cap.resourceSystem.spend({ [r]: cur });
  }
  mkXeOutpost(empireId, -1000, 400);
  logi._runDispatcher(emp);
  const pending1 = emp.logistics.pendingBuildRoute;
  ok('queued build → pendingBuildRoute SET', pending1 !== null);
  const built1 = emp.logistics.stats.built;
  // Drugi przebieg NIE może wystartować kolejnego buildu (1 na raz/empire)
  logi._runDispatcher(emp);
  ok('brak double-build (pendingBuildRoute bez zmian)', emp.logistics.pendingBuildRoute === pending1);
  ok('stats.built bez zmian (no double)', emp.logistics.stats.built === built1);
}

console.log('--- T16: player isolation — gracz hull_small NIE claimowany ---');
{
  // Kolonia GRACZA (ownerEmpireId null/undefined) buduje hull_small.
  const playerPid = uid('player'); mkPlanet(playerPid, 1200, 0);
  const pcol = colonyManager.createColony(playerPid, { Fe: 100 }, 0, 100);
  // createColony NIE ustawia ownerEmpireId → null/undefined (gracz)
  ok('kolonia gracza bez ownerEmpireId', !pcol.ownerEmpireId);
  const v = vesselManager.createAndRegister('hull_small', playerPid, { modules: ['engine_chemical', 'cargo_small'] });
  ok('gracz hull_small NIE ma assignedRouteId', (v.assignedRouteId ?? null) === null);
  ok('gracz hull_small NIE isEnemy', v.isEnemy !== true);
}

console.log('--- T17: route invariant — NIGDY >couriersPerRoute (claim overflow → reserve) ---');
{
  const { empireId } = mkCapital('emp_inv', 1200, 400);
  const out = mkXeOutpost(empireId, 1400, 400);
  const emp = empireRegistry.get(empireId);
  logi._runDispatcher(emp);
  const route = emp.logistics.routes[0];
  const cap = route.motherId;
  // Wypchnij 3 statki przez claim (3× pendingBuildRoute + completion) — couriersPerRoute=2.
  for (let i = 0; i < 3; i++) {
    emp.logistics.pendingBuildRoute = route.routeId;  // wymuś claim na tej trasie
    EventBus.emit('fleet:shipCompleted', { planetId: cap, shipId: 'hull_small', modules: ['engine_chemical', 'cargo_small'] });
  }
  ok('route.courierIds ≤ 2 (couriersPerRoute)', route.courierIds.length <= 2);
  ok('nadmiar w reserve', emp.logistics.reserve.length >= 1);
}

console.log('--- T19: fuel sanity — stolica bez power_cells → dispatch i tak (clamp) ---');
{
  const { empireId, capital } = mkCapital('emp_fuel', 1200, 800);
  const out = mkXeOutpost(empireId, 1400, 800);
  const emp = empireRegistry.get(empireId);
  logi._runDispatcher(emp);
  EventBus.emit('fleet:shipCompleted', { planetId: capital.planetId, shipId: 'hull_small', modules: ['engine_chemical', 'cargo_small'] });
  const route = emp.logistics.routes[0];
  const v = vesselManager.getVessel(route.courierIds[0]);
  // Opróżnij paliwo statku
  v.fuel.current = 0;
  let threw = false;
  try { logi._advanceAllCouriers(); } catch (_e) { threw = true; }
  ok('advance nie rzuca przy 0 paliwa', !threw);
  ok('kurier i tak wysłany (in_transit)', v.position.state === 'in_transit');
  ok('fuel sclampowany do 0 (nie ujemny)', v.fuel.current >= 0);
}

console.log('--- T21: _bestEngine NIGDY nie wybiera warp (kurier in-system) — S3.2 S1 ---');
{
  // techStub.isResearched → true dla WSZYSTKIEGO (warp "odblokowany") = najgorszy
  // przypadek po wejściu modelu badań AI (S3.2 S2). Kurier jest in-system + fuel-immune
  // → nigdy nie skacze; budowa warp wymaga warp_cores (T5) → wieczny queue. _bestEngine
  // musi pomijać silniki warpCapable mimo że tech "zbadany".
  const eng = logi._bestEngine(techStub);
  ok('_bestEngine != engine_warp (mimo "warp researched")', eng !== 'engine_warp');
  ok('_bestEngine != engine_warp_mk2', eng !== 'engine_warp_mk2');
  ok('_bestEngine = engine_fusion (najlepszy non-warp gdy wszystko zbadane)', eng === 'engine_fusion');
  // Regresja: realny aiTech (tylko startingTechs, brak ion/fusion) → engine_chemical bez zmian.
  const aiTech = T3.capital.techSystem;
  ok('aiTech bez ion/fusion → engine_chemical (bez regresji)', logi._bestEngine(aiTech) === 'engine_chemical');
}

// ═══════════════════════════════════════════════════════════════
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
