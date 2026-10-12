// ═══════════════════════════════════════════════════════════════════════════════
// sb3_group_arrival_smoke — KEEPER SB54 / Findingu 420 (AI STRIKES BACK S3)
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (420); decyzje SB45, SB54.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: (1) punkt przylotu po skoku losowany OSOBNO dla każdego statku (`VesselManager._tickInterstellar`,
//   `Math.random()`), a odcinek w układzie celu wydawany każdemu osobno (`OrderService._maybeDeliver`) — S2b, część F3:
//   rozrzut przylotów eskorty i transportowca 3,96–4,47 roku, transportowiec przylatywał sam i ginął; (2) Finding 420 —
//   synchronizacja floty gracza liczona z trasy do BIEŻĄCEJ pozycji ciała: przy ciele szybszym od statków członkowie
//   lądowali w kilku chwilach.
// SB54: grupa ma JEDEN punkt przylotu po skoku i JEDNĄ chwilę przylotu do ciała, ustalaną przez najwolniejszego;
//   transportowiec nigdy nie przylatuje przed eskortą; ten sam pomocnik (`GroupArrival`) dla flot gracza (SB45).
//
// ⚠ Świat lekki (wzór `sb2b_body_intercept_smoke`): dwa układy, ciała na orbitach Keplera (`PhysicsSystem`), PRAWDZIWE
//   `VesselManager` + `MovementOrderSystem` + `OrderService` + `FleetSystem`, czas — zdarzenia `time:tick`. Bez
//   `EnemyAttackHandler` (przylot `attack` nie otwiera bitwy — keeper mierzy lot, nie walkę).
// ⚠ Brak metody na kodzie sprzed SB54 (`issueGroupAttack`) ⇒ scena grupy degraduje do czerwieni (`?.`), nie wywraca się.
//
// PINY:
//   T1  dwie eskorty (6,156 AU/rok) i transportowiec (42,894 AU/rok) wysłane RAZEM z innego układu: (a) po skoku stoją
//       w JEDNYM punkcie na okręgu 30 AU; (b) jedna chwila przylotu w rozkazach; (c) przylatują do ciała w tym samym ticku;
//       (d) transportowiec nie przed eskortą; (e) ciało w zasięgu przy przylocie (bez przeskoku)
//   T2  flota gracza o różnych prędkościach na ciało krążące szybciej niż statki: jedna chwila w rozkazach i przylot
//       w tym samym ticku (Finding 420; na kodzie sprzed SB54 ta sama scena: 102,417 / 101,795 / 101,795 roku);
//       KONTROLA — przy przylocie ciało w zasięgu (zielone po obu stronach)
//   T3  zapis i wczytanie w locie: (a) w trakcie skoku — wspólny punkt przylotu przeżywa; (b) w trakcie odcinka — wspólna
//       chwila przeżywa, przylot razem
//   T4  KONTROLA: lot pojedynczego statku bez zmian — skok bez wspólnego kąta (punkt z `Math.random`), odcinek po skoku
//       = własne przechwycenie; `moveToPoint` na ciało — przechwycenie jak dotąd
//   T5  bitwa w locie: członek wznowiony osobno (`_resumeMissionAfterOrder`) — po `battle:resolved` grupa znowu ma jedną
//       chwilę, transportowiec nie przed eskortą
//   T6  piny źródłowe: kąt z misji w `_tickInterstellar`; `issueFleetOrder` liczy chwilę ciała pomocnikiem (linia
//       `_arrivalSyncYear: gameYear + fleetEta` zostaje); `_maybeDeliver` oddaje członka grupy grupie
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { PhysicsSystem }       from '../../systems/PhysicsSystem.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService }        from '../../systems/OrderService.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { KeplerMath }          from '../../utils/KeplerMath.js';
import { readFileSync }        from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

const AU  = GAME_CONFIG.AU_TO_PX;
const CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const DT  = 0.002;                    // rok gry na tik
const SA = 'sys_a', SB = 'sys_b';
const T0 = 100;
const EMP = 'emp_t';
const ESCORT_SPEED = 6.156, TRANSPORT_SPEED = 42.894, FRIGATE_SPEED = 1.1139813200670667;
const ESCORT_MODS = ['engine_warp', 'warp_tank', 'weapon_missile'];
const TRANSPORT_MODS = ['engine_warp', 'engine_warp', 'warp_tank', 'troop_bay_l', 'drop_pods'];

let W = null;   // bieżący świat

function bodyFromOrbit(id, sys, orb) {
  const E = KeplerMath.solveKepler(orb.M, orb.e);
  const th = KeplerMath.eccentricToTrueAnomaly(E, orb.e);
  const r = KeplerMath.orbitalRadius(orb.a, orb.e, th);
  const ang = th + orb.inclinationOffset;
  return { id, type: 'planet', name: id, systemId: sys, radius: 4, mass: 1, visual: { radius: 4 },
           orbital: { ...orb, theta: th }, x: r * Math.cos(ang) * AU, y: r * Math.sin(ang) * AU };
}

function kosmosBase() {
  return {
    timeSystem: { gameTime: T0 }, activeSystemId: SB,
    galaxyData: { systems: [{ id: SA, name: 'Alfa', x: 0, y: 0, z: 0 }, { id: SB, name: 'Beta', x: 4, y: 0, z: 0 }] },
    starSystemManager: { getSystem: (id) => (id === SA || id === SB) ? { starEntityId: `star_${id}` } : null, hasBeacon: () => false, generateAndRegister: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    eventLogSystem: { push: () => {} },
    debug: { combatTrace: false },
  };
}

/** Systemy na ŻYWYCH encjach (po `EventBus.clear()` — także po wczytaniu zapisu). */
function mountSystems(vmData = null) {
  const K = window.KOSMOS;
  new PhysicsSystem();
  const vm = new VesselManager();
  if (vmData) vm.restore(vmData);
  const mos = new MovementOrderSystem(vm);
  const os = new OrderService();
  const fs = new FleetSystem(vm);
  const dscs = new DeepSpaceCombatSystem(vm);
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(K, {
    civMode: true, vesselManager: vm, movementOrderSystem: mos, orderService: os, fleetSystem: fs, deepSpaceCombatSystem: dscs,
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
  });
  const w = { vm, mos, os, fs, dscs, arrived: [], jumped: [], legs: [] };
  // przeskok przy przylocie = odległość punktu, do którego statek leciał (`mission.targetX/Y`), od ŻYWEJ pozycji ciała
  //   w chwili przylotu (detekcja przylotu przestawia statek na żywe ciało) — mierzone w zdarzeniu, nie po scenie
  EventBus.on('vessel:arrived', ({ vessel, mission }) => {
    const b = mission?.targetId ? EntityManager.get(mission.targetId) : null;
    const gap = (b && Number.isFinite(mission?.targetX)) ? Math.hypot(mission.targetX - b.x, mission.targetY - b.y) / AU : NaN;
    w.arrived.push({ id: vessel.id, type: mission?.type, gy: K.timeSystem.gameTime, x: vessel.position.x, y: vessel.position.y, gap });
  });
  EventBus.on('interstellar:arrived', ({ vessel }) => w.jumped.push({ id: vessel.id, gy: K.timeSystem.gameTime, x: vessel.position.x, y: vessel.position.y }));
  EventBus.on('order:groupLegIssued', (e) => w.legs.push(e));
  return w;
}

function world() {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = kosmosBase();
  EntityManager.add({ id: `star_${SA}`, type: 'star', name: 'A', systemId: SA, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: `star_${SB}`, type: 'star', name: 'B', systemId: SB, x: 0, y: 0, mass: 1 });
  EntityManager.add(bodyFromOrbit('p_cap', SA, { a: 6, e: 0.02, T: 14.7, M: 1.0, inclinationOffset: 0 }));
  // szybkie ciało — jak stolica emp_001 w fixturze (a 1,443 AU, T 1,406 roku) ⇒ ~6,45 AU / rok
  EntityManager.add(bodyFromOrbit('p_fast', SB, { a: 1.443, e: 0.03, T: 1.406, M: 0.4, inclinationOffset: 0.7 }));
  EntityManager.add(bodyFromOrbit('p_home', SB, { a: 9, e: 0.01, T: 27, M: 2.0, inclinationOffset: 0 }));
  W = mountSystems();
  return W;
}

function aiShip(name, { speed = ESCORT_SPEED, modules = ESCORT_MODS, hull = 'hull_frigate' } = {}) {
  const cap = EntityManager.get('p_cap');
  const v = W.vm.createAndRegister(hull, 'p_cap', { name, modules });
  v.position.x = cap.x; v.position.y = cap.y; v.position.state = 'docked'; v.position.dockedAt = 'p_cap';
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.speedAU = speed; v.systemId = SA;
  v.ownerEmpireId = EMP; v.owner = EMP; v.isEnemy = true; v.serviceState = 'active';
  return v;
}
function playerShip(name, { x, y, speed = FRIGATE_SPEED } = {}) {
  const v = W.vm.createAndRegister('hull_frigate', 'p_home', { name, modules: ['weapon_laser', 'engine_ion'] });
  v.position.x = x; v.position.y = y; v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.speedAU = speed; v.systemId = SB;
  return v;
}
function tick(n = 1) {
  const K = window.KOSMOS;
  for (let i = 0; i < n; i++) {
    K.timeSystem.gameTime += DT;
    EventBus.emit('time:tick', { deltaYears: DT, civDeltaYears: DT * CIV, gameTime: K.timeSystem.gameTime, multiplier: 1 });
  }
}
/** Tikaj, aż `pred()` albo limit lat. */
function until(pred, years) { const n = Math.ceil(years / DT); for (let i = 0; i < n && !pred(); i++) tick(); return pred(); }
const arrivalOf = (w, id) => w.arrived.find(a => a.id === id && (a.type === 'attack' || a.type === 'move_to_point')) ?? null;
const jumpOf = (w, id) => w.jumped.find(j => j.id === id) ?? null;
const sameXY = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
const bodyGap = (w, id) => arrivalOf(w, id)?.gap ?? NaN;

function group(w) {
  const e1 = aiShip('E1'), e2 = aiShip('E2');
  const tr = aiShip('T', { speed: TRANSPORT_SPEED, modules: TRANSPORT_MODS, hull: 'hull_large' });
  const res = w.os.issueGroupAttack?.([e1.id, e2.id, tr.id], { targetBodyId: 'p_fast', groupId: 'grp_keeper' });
  return { e1, e2, tr, ids: [e1.id, e2.id, tr.id], res };
}

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  dwie eskorty i transportowiec wysłane RAZEM z innego układu');
{
  const w = world();
  const g = group(w);
  const jumpedAll = until(() => g.ids.every(id => jumpOf(w, id)), 2);
  const arrivedAll = until(() => g.ids.every(id => arrivalOf(w, id)), 30);
  const j = g.ids.map(id => jumpOf(w, id));
  const a = g.ids.map(id => arrivalOf(w, id));
  const legT = w.legs[0]?.arrivalYear;
  const missionT = g.ids.map(id => w.vm.getVessel(id)?.mission?.arrivalYear);
  console.log(`     skok: ${j.map(x => x ? `(${fmt(x.x / AU, 2)},${fmt(x.y / AU, 2)})@${fmt(x.gy)}` : '—').join(' ')}`);
  console.log(`     przylot: ${a.map(x => x ? fmt(x.gy, 4) : '—').join(' / ')} (chwila grupy ${fmt(legT, 4)}); przeskok przy przylocie ${g.ids.map(id => fmt(bodyGap(w, id), 4)).join(' / ')} AU`);
  assert(g.res?.ok === true && g.res?.composite === true, `T1-0 scena: grupa przyjęta, skok (composite) —${JSON.stringify(g.res ?? null)}`);
  assert(jumpedAll && sameXY(j[0], j[1]) && sameXY(j[0], j[2]) && Math.abs(Math.hypot(j[0].x, j[0].y) / AU - 30) < 1e-6,
    'T1a po skoku wszyscy trzej w JEDNYM punkcie na okręgu 30 AU');
  assert(arrivedAll && Number.isFinite(legT) && w.legs.length === 1, 'T1b jeden odcinek grupy w układzie celu, jedna chwila przylotu');
  assert(arrivedAll && a.every(x => x.gy === a[0].gy), 'T1c przylot do ciała w TYM SAMYM ticku');
  assert(arrivedAll && a[2].gy >= a[0].gy && a[2].gy >= a[1].gy, 'T1d transportowiec nie przed eskortą');
  assert(arrivedAll && g.ids.every(id => bodyGap(w, id) <= 0.06), 'T1e przy przylocie ciało w zasięgu (przeskok ≤ 0,06 AU — SB39)');
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  flota gracza o różnych prędkościach na ciało krążące szybciej niż statki (Finding 420)');
{
  const w = world();
  const b = EntityManager.get('p_fast');
  const ships = [
    playerShip('P1', { x: b.x + 2.0 * AU, y: b.y, speed: FRIGATE_SPEED }),
    playerShip('P2', { x: b.x - 1.0 * AU, y: b.y + 2.5 * AU, speed: 2.0 }),
    playerShip('P3', { x: b.x, y: b.y - 3.0 * AU, speed: 3.5 }),
  ];
  const fleet = w.fs.createFleet('Keeper');
  for (const s of ships) w.fs.addMember(fleet.id, s.id);
  const r = w.fs.issueFleetOrder(fleet.id, { type: 'moveToPoint', targetBodyId: 'p_fast', targetPoint: { x: b.x, y: b.y } });
  const etas = ships.map(s => s.mission?.arrivalYear);
  const arrived = until(() => ships.every(s => arrivalOf(w, s.id)), 30);
  const a = ships.map(s => arrivalOf(w, s.id));
  console.log(`     rozkazy: ${etas.map(x => fmt(x, 4)).join(' / ')}; przylot: ${a.map(x => x ? fmt(x.gy, 4) : '—').join(' / ')}; przeskok ${ships.map(s => fmt(bodyGap(w, s.id), 4)).join(' / ')} AU`);
  assert(r?.ok === true && r.accepted?.length === 3, 'T2-0 KONTROLA: rozkaz floty przyjęty dla trzech członków');
  assert(etas.every(t => Number.isFinite(t) && Math.abs(t - etas[0]) < 1e-9), 'T2a jedna chwila przylotu w rozkazach członków');
  assert(arrived && a.every(x => x.gy === a[0].gy), 'T2b przylot w tym samym ticku');
  assert(arrived && ships.every(s => bodyGap(w, s.id) <= 0.06), 'T2c KONTROLA: przy przylocie ciało w zasięgu (bez przeskoku)');
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  zapis i wczytanie w locie');
function reload() {
  const data = JSON.parse(JSON.stringify(W.vm.serialize()));
  EventBus.clear();                       // encje (ciała, ich orbity) zostają — jak przy wczytaniu tego samego świata
  W = mountSystems(data);
  return W;
}
{
  // (a) w trakcie skoku
  let w = world();
  const g = group(w);
  tick(20);                                // skok trwa 4 / 18 roku ≈ 0,22 roku
  const angle = w.vm.getVessel(g.e1.id)?.mission?.arrivalAngle;
  const midJump = g.ids.every(id => w.vm.getVessel(id)?.mission?.phase === 'warp_transit');
  w = reload();
  const jumped = until(() => g.ids.every(id => jumpOf(w, id)), 2);
  const j = g.ids.map(id => jumpOf(w, id));
  const expect = Number.isFinite(angle) ? { x: Math.cos(angle) * 30 * AU, y: Math.sin(angle) * 30 * AU } : null;
  assert(midJump && Number.isFinite(angle), 'T3-0 scena: zapis w trakcie skoku (wszyscy `warp_transit`, kąt w misji)');
  assert(jumped && sameXY(j[0], j[1]) && sameXY(j[0], j[2]) && sameXY(j[0], expect), 'T3a po wczytaniu w skoku: wspólny punkt przylotu = kąt z zapisu');
  const arrived = until(() => g.ids.every(id => arrivalOf(w, id)), 30);
  const a = g.ids.map(id => arrivalOf(w, id));
  assert(arrived && a.every(x => x.gy === a[0].gy), 'T3b … i przylot do ciała razem');
  // (b) w trakcie odcinka
  w = world();
  const g2 = group(w);
  until(() => w.legs.length > 0, 2);
  tick(100);
  const T = w.vm.getVessel(g2.e1.id)?.mission?.arrivalYear;
  const inLeg = g2.ids.every(id => w.vm.getVessel(id)?.mission?.type === 'attack' && w.vm.getVessel(id)?.position?.state === 'in_transit');
  w = reload();
  const arrived2 = until(() => g2.ids.every(id => arrivalOf(w, id)), 30);
  const a2 = g2.ids.map(id => arrivalOf(w, id));
  assert(inLeg && Number.isFinite(T), 'T3-0b scena: zapis w trakcie odcinka (wszyscy `attack`, `in_transit`)');
  assert(arrived2 && a2.every(x => x.gy === a2[0].gy) && a2[0].gy >= T - 1e-9 && a2[0].gy < T + 2 * DT, 'T3c po wczytaniu w odcinku: przylot razem, w chwili grupy z zapisu');
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════
header('T4  KONTROLA: lot pojedynczego statku bez zmian');
{
  const w = world();
  const v = aiShip('Solo');
  const r = w.os.issueAttack(v.id, { targetBodyId: 'p_fast' });
  const noAngle = v.mission && !('arrivalAngle' in v.mission) && !('groupId' in (v.pendingOrder ?? {}));
  const r0 = Math.random;
  Math.random = () => 0.25;                                   // kąt przy przylocie: 0,25 × 2π = π/2
  const jumped = until(() => !!jumpOf(w, v.id), 2);
  Math.random = r0;
  const j = jumpOf(w, v.id);
  assert(r?.ok === true && r.composite === true && noAngle, 'T4a pojedynczy skok: misja bez kąta wspólnego, `pendingOrder` bez grupy');
  assert(jumped && Math.abs(j.x) < 1e-6 && Math.abs(j.y - 30 * AU) < 1e-6, 'T4b punkt przylotu z `Math.random` przy przylocie (jak dotąd)');
  const own = w.vm._interceptBody('p_fast', v.position.x, v.position.y, Math.max(0.01, v.speedAU), { systemId: SB })?.arrivalYear;
  assert(Number.isFinite(own) && Math.abs((v.mission?.arrivalYear ?? NaN) - own) < 1e-9, 'T4c odcinek po skoku = własne przechwycenie');
  // pojedynczy rozkaz ruchu gracza na ciało
  const b = EntityManager.get('p_fast');
  const p = playerShip('Solo2', { x: b.x + 2 * AU, y: b.y });
  const ownP = w.vm._interceptBody('p_fast', p.position.x, p.position.y, Math.max(0.01, p.speedAU), { systemId: SB })?.arrivalYear;
  const rp = w.mos.issueOrder(p.id, { type: 'moveToPoint', targetBodyId: 'p_fast', targetPoint: { x: b.x, y: b.y } });
  assert(rp?.ok === true && Math.abs((p.mission?.arrivalYear ?? NaN) - ownP) < 1e-9, 'T4d `moveToPoint` pojedynczego statku na ciało — przechwycenie jak dotąd');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  bitwa w locie: członek wznowiony osobno → grupa znowu razem');
{
  const w = world();
  const g = group(w);
  until(() => w.legs.length > 0, 2);
  tick(50);
  const e1 = g.e1;
  const snapped = w.mos._suspendMissionIfAny(e1, { forCombat: true });   // to, co robi DSCS przy starcie starcia
  w.dscs._freezeAsStationary(e1, null);
  tick(25);                                                               // reszta grupy leci dalej
  w.vm._resumeMissionAfterOrder(e1.id);                                   // to, co robi DSCS po bitwie
  const before = g.ids.map(id => w.vm.getVessel(id)?.mission?.arrivalYear);
  EventBus.emit('battle:resolved', { warId: null, battleId: 'battle_keeper', result: {
    winner: 'B', participantA: { type: 'vessel_group', empireId: 'player', vesselIds: [] },
    participantB: { type: 'vessel_group', empireId: EMP, vesselIds: [e1.id] } } });
  const after = g.ids.map(id => w.vm.getVessel(id)?.mission?.arrivalYear);
  console.log(`     chwile przed: ${before.map(x => fmt(x, 4)).join(' / ')} · po: ${after.map(x => fmt(x, 4)).join(' / ')}`);
  assert(snapped && Number.isFinite(before[0]) && Math.abs(before[0] - before[1]) > 1e-6, 'T5-0 scena: wznowiony członek ma WŁASNĄ chwilę (rozjazd przed synchronizacją)');
  assert(after.every(t => Number.isFinite(t) && Math.abs(t - after[0]) < 1e-9), 'T5a po `battle:resolved` jedna chwila dla całej grupy');
  const arrived = until(() => g.ids.every(id => arrivalOf(w, id)), 30);
  const a = g.ids.map(id => arrivalOf(w, id));
  assert(arrived && a.every(x => x.gy === a[0].gy) && a[2].gy >= a[0].gy, 'T5b przylot razem, transportowiec nie przed eskortą');
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════
header('T6  piny źródłowe');
{
  const vmSrc = strip(readFileSync(new URL('../../systems/VesselManager.js', import.meta.url), 'utf8'));
  const fsSrc = strip(readFileSync(new URL('../../systems/FleetSystem.js', import.meta.url), 'utf8'));
  const osSrc = strip(readFileSync(new URL('../../systems/OrderService.js', import.meta.url), 'utf8'));
  assert(/const angle = Number\.isFinite\(m\.arrivalAngle\) \? m\.arrivalAngle : Math\.random\(\) \* Math\.PI \* 2;/.test(vmSrc),
    'T6a `_tickInterstellar`: kąt z misji, bez niego — `Math.random` (jak dotąd)');
  const issueBody = fsSrc.slice(fsSrc.indexOf('  issueFleetOrder(fleetId, spec) {'), fsSrc.indexOf('  _bodyGroupArrival('));
  assert(/this\._bodyGroupArrival\(spec, eligible, gameYear\)/.test(issueBody) && /_arrivalSyncYear: gameYear \+ fleetEta/.test(issueBody)
    && /groupArrivalYear\(vm, bodyId, members, \{ now: gameYear, maxBoost: MAX_SYNC_BOOST_FACTOR \}\)/.test(fsSrc),
    'T6b `issueFleetOrder`: cel-ciało liczony `GroupArrival` z klamrą 10×; linia `_arrivalSyncYear: gameYear + fleetEta` zostaje');
  const attackBranch = osSrc.slice(osSrc.indexOf("if (po.kind === 'attack') {"), osSrc.indexOf("if (po.kind === 'move') {"));
  assert(/if \(po\.groupId\) \{ this\._maybeDeliverGroup\(po\.groupId, po\.targetId, po\.targetSystemId\); return; \}/.test(attackBranch),
    'T6c `_maybeDeliver`: członek grupy oddany grupie (odcinek, gdy w układzie cała grupa)');
  const dlSrc = strip(readFileSync(new URL('../../core/DebugLog.js', import.meta.url), 'utf8'));
  const tracked = dlSrc.slice(dlSrc.indexOf('TRACKED_EVENTS'), dlSrc.indexOf('class DebugLog'));
  assert(/'order:groupLegIssued'/.test(tracked) && /'fleetGuard:dissolved'/.test(tracked),
    'T6d odcinek grupy (z odmowami członków) w `DebugLog.TRACKED_EVENTS` (sprawdzenie metody: wpis S2 widoczny)');
}

console.log(`\n═══ sb3_group_arrival_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
