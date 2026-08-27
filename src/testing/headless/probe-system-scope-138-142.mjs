// SONDA (read-only) — Findingi 138 + 142: brak granicy układu przy wyborze celu.
// Uruchom: node src/testing/headless/probe-system-scope-138-142.mjs
//
// NIE jest keeperem — dowód liczbowy do audytu docs/audit/SYSTEM_SCOPE_138_142_AUDIT.md.
// Nie wpinać do run-all.mjs (pilnuje tego keeper `system_scope_orders_smoke`).
//
// ⚠ PO NAPRAWIE (D-SS1..D-SS5) sonda pokazuje OBIE ścieżki obok siebie: wywołanie BEZ `vessel`
//   odtwarza zachowanie sprzed naprawy (zakres galaktyczny — świadomie zachowany jako zgodność
//   wstecz), a wywołanie Z `vessel` pokazuje stan dzisiejszy. Kolumny „skala" z §2 to nadal
//   pomiar SPRZED naprawy i tak należy je czytać: opisują, jak duży był defekt, a nie jak jest.
//
//   §1  _findBodyNearPoint bierze ciało z OBCEGO układu                (Finding 138)
//   §2  skala defektu 138 vs liczba wygenerowanych układów
//   §3  getByTypeInSystem jest fail-CLOSED (pułapka „oczywistej" naprawy)
//   §4  _getValidTargets: fałszywy POZYTYW i fałszywy NEGATYW           (Finding 142)
//   §5  cel cross-system realnie STARTUJE i leci w pustkę własnego układu
//   §6  _findNearestUnexplored — ten sam defekt, NIEZAREJESTROWANY

import './env.js';
import EntityManager from '../../core/EntityManager.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { MissionSystem } from '../../systems/MissionSystem.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { SystemGenerator } from '../../generators/SystemGenerator.js';
import { KeplerMath } from '../../utils/KeplerMath.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

const AU = GAME_CONFIG.AU_TO_PX;
const H = (s) => console.log('\n== ' + s + ' ' + '='.repeat(Math.max(0, 66 - s.length)));

const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });
const mkStar = (sys) => ({ id: 'star_' + sys, type: 'star', systemId: sys, name: 'Gwiazda ' + sys, x: 0, y: 0, mass: 1 });
const mkP = (id, sys, a, name, explored = false) => ({
  id, type: 'planet', systemId: sys, name, x: a * AU, y: 0,
  explored, analyzed: explored, planetType: 'rocky', orbital: orb(a), deposits: [],
});

/** Ustaw x/y z elementow orbitalnych — to, co robi PhysicsSystem po pierwszym tiku. */
function place(b) {
  const o = b.orbital; if (!o) return;
  const E  = KeplerMath.solveKepler(o.M, o.e);
  const th = KeplerMath.eccentricToTrueAnomaly(E, o.e);
  const r  = KeplerMath.orbitalRadius(o.a, o.e, th);
  const ang = th + (o.inclinationOffset ?? 0);
  if (b.type === 'moon') {
    const p = EntityManager.get(b.parentPlanetId);
    b.x = (p?.x ?? 0) + r * Math.cos(ang) * AU; b.y = (p?.y ?? 0) + r * Math.sin(ang) * AU;
  } else { b.x = r * Math.cos(ang) * AU; b.y = r * Math.sin(ang) * AU; }
}

function genSystems(n) {
  EntityManager.clear();
  const gen = new SystemGenerator();
  for (let i = 0; i < n; i++) {
    const sysId = i === 0 ? 'sys_home' : `sys_${String(i).padStart(3, '0')}`;
    const r = gen.generateForStar({ id: sysId, name: 'S' + i, spectralType: 'G', mass: 1, luminosity: 1, x: i * 3, y: 0, z: 0 });
    r.star.systemId = sysId; r.star.x = 0; r.star.y = 0;
    r.planets.forEach(p => p.systemId = sysId);
    r.moons.forEach(m => m.systemId = sysId);
    r.planetoids.forEach(p => p.systemId = sysId);
  }
  for (const t of ['planet', 'planetoid']) for (const b of EntityManager.getByType(t)) place(b);
  for (const b of EntityManager.getByType('moon')) place(b);
}

// -- §1 ---------------------------------------------------------------------
H('§1  _findBodyNearPoint — snap przez granice ukladu');
EntityManager.clear();
[mkStar('sys_home'), mkStar('sys_061')].forEach(s => EntityManager.add(s));
[mkP('h1', 'sys_home', 1.00, 'Dom'), mkP('f1', 'sys_061', 1.02, 'Obca'), mkP('h2', 'sys_home', 3.0, 'Dom II')]
  .forEach(b => EntityManager.add(b));
{
  const vm = new VesselManager();
  const v  = { id: 'v_probe', systemId: 'sys_home', position: { x: AU, y: 0 } };
  const fmt = (b) => b ? `${b.id} [${b.systemId}]` : 'null (dryf)';
  console.log('  BEZ zakresu (jak przed naprawa):');
  console.log('    punkt na wlasnej planecie (1,00 AU) ->', fmt(vm._findBodyNearPoint(1.00 * AU, 0)));
  const r0 = vm._findBodyNearPoint(1.015 * AU, 0);
  console.log('    punkt 1,015 AU (blizej obcej)       ->', fmt(r0),
    r0?.systemId !== 'sys_home' ? '<- OBCE => target_other_system' : '');
  console.log('  Z zakresem statku (sciezka produkcyjna po naprawie):');
  console.log('    punkt na wlasnej planecie (1,00 AU) ->', fmt(vm._findBodyNearPoint(1.00 * AU, 0, undefined, v)));
  console.log('    punkt 1,015 AU (blizej obcej)       ->', fmt(vm._findBodyNearPoint(1.015 * AU, 0, undefined, v)));
  console.log('    punkt przy SAMYM obcym (9,00 AU)    ->', fmt(vm._findBodyNearPoint(9.00 * AU, 0, undefined, v)));
}

// -- §2 ---------------------------------------------------------------------
H('§2  skala 138 (POMIAR SPRZED NAPRAWY — wywolania BEZ zakresu)');
console.log('  ukladow | ciala obce | klikow snapujacych | z tego OBCE |  % snapow |  % wszystkich klikow');
for (const N of [1, 2, 3, 5, 8, 12, 20]) {
  genSystems(N);
  const all = ['planet', 'moon', 'planetoid'].flatMap(t => EntityManager.getByType(t));
  const foreignBodies = all.filter(b => b.systemId !== 'sys_home').length;
  const vm = new VesselManager();
  let hits = 0, foreign = 0, grid = 0;
  for (let gx = -25; gx <= 25; gx += 0.5) for (let gy = -25; gy <= 25; gy += 0.5) {
    grid++; const g = vm._findBodyNearPoint(gx * AU, gy * AU);
    if (g) { hits++; if (g.systemId !== 'sys_home') foreign++; }
  }
  console.log(`  ${String(N).padStart(7)} | ${String(foreignBodies).padStart(10)} | ${String(hits).padStart(18)} | ${String(foreign).padStart(11)} | ${(100 * foreign / Math.max(1, hits)).toFixed(1).padStart(8)}% | ${(100 * foreign / grid).toFixed(1).padStart(19)}%`);
}
{
  genSystems(12);
  const all = ['planet', 'moon', 'planetoid'].flatMap(t => EntityManager.getByType(t));
  const home = all.filter(b => b.systemId === 'sys_home');
  const vm = new VesselManager();
  const onOwn = home.filter(b => vm._findBodyNearPoint(b.x, b.y)?.systemId !== 'sys_home').length;
  const shadowed = home.filter(b => all.some(o => o.systemId !== 'sys_home' && Math.hypot(o.x - b.x, o.y - b.y) <= 0.5 * AU)).length;
  console.log(`\n  klik DOKLADNIE na wlasnym ciele -> obce wygrywa: ${onOwn}/${home.length} (dystans 0 jest nie do pobicia)`);
  console.log(`  wlasnych cial z OBCYM rywalem w promieniu 0,5 AU: ${shadowed}/${home.length}`);
}

// -- §3 ---------------------------------------------------------------------
H('§3  getByTypeInSystem jest fail-CLOSED (pulapka naprawy)');
EntityManager.clear();
EntityManager.add({ id: 'p_nosys', type: 'planet', name: 'BezStempla', x: AU, y: 0 });
console.log('  getByType("planet")                    ->', EntityManager.getByType('planet').length);
console.log('  getByTypeInSystem("planet","sys_home")  ->', EntityManager.getByTypeInSystem('planet', 'sys_home').length, '<- cialo bez stempla ZNIKA');
console.log('  getByTypeInSystem("planet", null)       ->', EntityManager.getByTypeInSystem('planet', null).length, '<- statek w tranzycie warp: pusty zbior');
{
  genSystems(12);
  let bodies = 0, noStamp = 0;
  for (const t of ['planet', 'moon', 'planetoid']) for (const b of EntityManager.getByType(t)) { bodies++; if (b.systemId == null) noStamp++; }
  console.log(`  kontrola: swiezo wygenerowane ciala bez systemId: ${noStamp}/${bodies}`);
}

// -- §4 ---------------------------------------------------------------------
H('§4  _getValidTargets — klucz na OGLADANYM ukladzie, nie na statku');
EntityManager.clear();
[mkP('h1', 'sys_home', 1, 'Dom I', true), mkP('h2', 'sys_home', 2, 'Dom II', true), mkP('h3', 'sys_home', 3, 'Dom III', true),
 mkP('f1', 'sys_061', 1, 'Obca I', true), mkP('f2', 'sys_061', 2, 'Obca II', true)].forEach(b => EntityManager.add(b));
{
  const vessel = {
    id: 'v_1', name: 'Probka', systemId: 'sys_home',
    position: { x: 0, y: 0, state: 'docked', dockedAt: null },
    fuel: { current: 100, max: 100, consumption: 0.1 }, warpFuel: { current: 0, max: 0 },
    colonyId: null, homeColonyId: null, speedAU: 1.0,
  };
  window.KOSMOS = {
    homePlanet: EntityManager.get('h1'),
    colonyManager: { getColony: () => null, hasColony: () => false },
    galaxyData: { systems: [{ id: 'sys_home', name: 'Dom', x: 0, y: 0, z: 0 }, { id: 'sys_061', name: 'Obcy', x: 5, y: 0, z: 0 }] },
    activeSystemId: 'sys_home',
  };
  const fmo = Object.create(FleetManagerOverlay.prototype);
  fmo._getVesselColony = () => null;
  const run = (sys) => {
    window.KOSMOS.activeSystemId = sys;
    fmo._cachedTargetsKey = null; fmo._cachedTargets = null;
    return fmo._getValidTargets(vessel, 'survey');
  };
  for (const sys of ['sys_home', 'sys_061']) {
    const t = run(sys);
    const own = t.filter(x => x.id.startsWith('h')).length;
    const badSame = t.filter(x => x.sameSystem && x.id.startsWith('f')).length;
    console.log(`  activeSystemId=${sys} (statek w sys_home): ${t.length} celow  [${t.map(x => x.id + (x.sameSystem ? '.same' : '.warp') + (x.reachable ? '.reach' : '')).join(' ')}]`);
    console.log(`     wlasne ciala statku widoczne: ${own}/3   |   obce oznaczone sameSystem+reachable: ${badSame}/2`);
  }
}

// -- §5 ---------------------------------------------------------------------
H('§5  cel cross-system realnie STARTUJE (sciezka FLEET_ACTIONS.survey.execute)');
EntityManager.clear();
[mkStar('sys_home'), mkStar('sys_061')].forEach(s => EntityManager.add(s));
const home5 = mkP('h1', 'sys_home', 1, 'Dom', true);
const far5  = mkP('f1', 'sys_061', 9, 'Obca I', false);
[home5, far5].forEach(b => EntityManager.add(b));
{
  const vm = new VesselManager();
  const ms = new MissionSystem();
  ms.resourceSystem = { canAfford: () => true, spend: () => true, add: () => {} };
  window.KOSMOS = {
    vesselManager: vm, missionSystem: ms, homePlanet: home5,
    techSystem: { isResearched: () => true, getShipSpeedMultiplier: () => 1, getFuelEfficiency: () => 1, getMultiplier: () => 1, getShipRangeMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'h1', getColony: () => null, hasColony: () => false, getAllColonies: () => [] },
    timeSystem: { gameTime: 0 }, activeSystemId: 'sys_home',
  };
  const v = vm.createAndRegister('hull_small', 'h1');
  v.systemId = 'sys_home';
  v.position.x = home5.x; v.position.y = home5.y;
  v.position.state = 'docked'; v.position.dockedAt = 'h1'; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999;
  const fuel0 = v.fuel.current;
  ms.createMission('survey', v.id, { targetId: 'f1' });          // dokladnie jak survey.execute
  const m = v.mission ?? {};
  const mis = ms.getActive()[0];
  if (!mis) {
    console.log('  misji przed/po: 0 / 0  => ODMOWA DZIALA (D-SS5)');
    console.log(`  paliwo nietkniete: ${fuel0} -> ${v.fuel.current}`);
    console.log('  statek: status=%s state=%s', v.status, v.position.state);
  } else {
  console.log('  misji przed/po: 0 /', ms.getActive().length, ' => ODMOWY NIE MA');
  console.log('  cel f1: systemId=sys_061, a=9 AU (od SWOJEJ gwiazdy)');
  console.log(`  lot: start (${(m.startX / AU).toFixed(2)}, ${(m.startY / AU).toFixed(2)}) AU -> cel (${(m.targetX / AU).toFixed(2)}, ${(m.targetY / AU).toFixed(2)}) AU  <- WEWNATRZ sys_home`);
  console.log(`  dystans rekordu: ${mis?.distance} AU (fikcja — dwie ramki)   paliwo pobrane: ${(fuel0 - v.fuel.current).toFixed(2)}`);
  const anyBody = EntityManager.getByTypeInSystem('planet', 'sys_home').some(b => Math.hypot(b.x - m.targetX, b.y - m.targetY) < AU);
  console.log('  czy cos tam jest w sys_home?', anyBody ? 'TAK' : 'NIE — statek leci w pustke');
  console.log('  _vesselIsAtTarget(cross-system) =', ms._vesselIsAtTarget(mis), '<- przylot ZOSTANIE PRZYJETY');
  }
}

// -- §6 ---------------------------------------------------------------------
H('§6  _findNearestUnexplored (ZYWY) — ten sam defekt, niezarejestrowany');
EntityManager.clear();
const home6 = mkP('h1', 'sys_home', 1, 'Dom', true);
[home6, mkP('h2', 'sys_home', 2, 'Dom-niezbadana', false), mkP('f1', 'sys_061', 3, 'Obca-niezbadana', false)]
  .forEach(b => EntityManager.add(b));
{
  const ms = new MissionSystem();
  window.KOSMOS = { homePlanet: home6, activeSystemId: 'sys_home', timeSystem: { gameTime: 0 }, colonyManager: { activePlanetId: 'h1', getAllColonies: () => [] } };
  console.log('  activeSystemId=sys_home -> cel:', ms._findNearestUnexplored()?.id, ' | getUnexploredCount:', JSON.stringify(ms.getUnexploredCount()));
  window.KOSMOS.activeSystemId = 'sys_061';
  const vr = { id: 'v_recon', systemId: 'sys_home', position: { x: AU, y: 0 } };
  console.log('  activeSystemId=sys_061, BEZ vessel -> cel:', ms._findNearestUnexplored()?.id, '(zgodnosc wstecz = kamera)');
  console.log('  activeSystemId=sys_061, Z  vessel  -> cel:', ms._findNearestUnexplored(null, vr)?.id, '<- uklad STATKU (D-SS4)');
  console.log('  getUnexploredCount(vessel):', JSON.stringify(ms.getUnexploredCount(vr)));
}
console.log();
