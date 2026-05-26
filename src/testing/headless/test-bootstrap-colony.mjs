// ═══════════════════════════════════════════════════════════════
// Smoke test — EmpireColonyBootstrap.bootstrapColony + bootstrapAutonomousOutpost
// Uruchom: node src/testing/headless/test-bootstrap-colony.mjs
// ───────────────────────────────────────────────────────────────
// Slice 2 / Sesja 1: dwie ścieżki kolonizacji AI (mechanizm, bez decyzji
// Warstwy C). Harness buduje REALNY ColonyManager + EmpireRegistry +
// EntityManager (wszystkie three-free) + permisywny techStub.
//
//   T1-T10:  bootstrapColony (pełna kolonia, 2 POP, 4 budynki, shared tech)
//   T11-T18: bootstrapAutonomousOutpost (per-budynek, 0 POP, ownerEmpireId)
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first — shim localStorage/window/THREE
import EventBus     from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }       from '../../systems/ColonyManager.js';
import { EmpireRegistry }      from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { ColonyAutoExpander }  from '../../systems/ColonyAutoExpander.js';
import { BUILDINGS }           from '../../data/BuildingsData.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};
// Łapie throw — zwraca true jeśli fn rzuciło (opcjonalnie z fragmentem msg).
const throws = (fn, msgFrag = null) => {
  try { fn(); return false; }
  catch (e) { return msgFrag ? String(e.message).includes(msgFrag) : true; }
};
const buildingCount = (colony) => colony.buildingSystem._active.size;

// ── Permisywny techStub (mnożniki=1, isResearched=true) ───────────
const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

// ── Rejestracja encji planet (EntityManager) ──────────────────────
const mkPlanet = (id, name) => EntityManager.add({
  id, name, type: 'planet', planetType: 'rocky',
  radius: 1.0, mass: 1.0, atmosphere: 'breathable',
  temperatureK: 280, deposits: [], systemId: 'sys_061',
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
mkPlanet('thuban_c', 'Thuban C');
mkPlanet('thuban_b', 'Thuban B');
mkPlanet('thuban_d_moon', 'Thuban D Moon');

// ── Realny ColonyManager + EmpireRegistry ─────────────────────────
const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  timeSystem: { gameTime: 10 },
  colonyManager,
  empireRegistry,
};

empireRegistry.createEmpire({ id: 'emp_001', archetype: 'industrialist', homeSystemId: 'sys_061' });

const validOpts = {
  startPop: { laborer: 1, worker: 1 },
  startResources: { food: 200, water: 200 },
  startBuildings: ['colony_base', 'solar_farm', 'solar_farm', 'mine'],
  archetypeId: 'industrialist',
};

// ═══════════════════════════════════════════════════════════════
// bootstrapColony (T1-T10)
// ═══════════════════════════════════════════════════════════════
console.log('--- T1: bootstrapColony powstaje, ownerEmpireId, name ---');
const c1 = EmpireColonyBootstrap.bootstrapColony('emp_001', 'sys_061', 'thuban_c', validOpts);
ok('kolonia powstała', !!c1);
ok('ownerEmpireId === emp_001', c1.ownerEmpireId === 'emp_001');
ok('name === planet.name (1:1 planeta↔kolonia)', c1.name === 'Thuban C');

console.log('--- T2: idempotencja (drugi call tego samego planetId) ---');
const c1b = EmpireColonyBootstrap.bootstrapColony('emp_001', 'sys_061', 'thuban_c', validOpts);
ok('zwraca tę samą kolonię (referencyjnie)', c1b === c1);

console.log('--- T3: startPop total = 1 → throw ---');
ok('throw przy popTotal < 2', throws(
  () => EmpireColonyBootstrap.bootstrapColony('emp_001', 'sys_061', 'thuban_b', { ...validOpts, startPop: { laborer: 1 } }),
  '< 2'));

console.log('--- T4: food = 100 → throw ---');
ok('throw przy food < 200', throws(
  () => EmpireColonyBootstrap.bootstrapColony('emp_001', 'sys_061', 'thuban_b', { ...validOpts, startResources: { food: 100, water: 200 } }),
  'food'));

console.log('--- T5: nieistniejący empireId → throw ---');
ok('throw przy nieznanym empireId', throws(
  () => EmpireColonyBootstrap.bootstrapColony('emp_999', 'sys_061', 'thuban_b', validOpts),
  'emp_999'));

console.log('--- T6: shared TechSystem (2. kolonia === 1.) ---');
const c2 = EmpireColonyBootstrap.bootstrapColony('emp_001', 'sys_061', 'thuban_b', validOpts);
ok('2. kolonia powstała', !!c2);
ok('techSystem współdzielony (buildingSystem.techSystem === )',
   c2.buildingSystem.techSystem === c1.buildingSystem.techSystem);

console.log('--- T7: population === 2 ---');
ok('c1.civSystem.population === 2', c1.civSystem.population === 2);

console.log('--- T8: >= 4 budynki w _active ---');
ok('c1 buildingSystem._active.size >= 4', buildingCount(c1) >= 4);

console.log('--- T9: żaden z 4 startowych budynków NIE na biegunie ---');
{
  const grid = c1.buildingSystem._grid;
  const rows = grid.height ?? 10;
  let onPole = 0;
  grid.forEach(tile => {
    if ((tile.buildingId || tile.capitalBase) && (tile.r === 0 || tile.r === rows - 1)) onPole++;
  });
  ok('0 budynków na biegunie', onPole === 0);
}

console.log('--- T10: getColoniesByEmpire(emp_001).length === 2 ---');
ok('imperium ma 2 kolonie', empireRegistry.getColoniesByEmpire('emp_001').length === 2);

// ═══════════════════════════════════════════════════════════════
// bootstrapAutonomousOutpost (T11-T18)
// ═══════════════════════════════════════════════════════════════
console.log('--- T11: pierwszy call → outpost, isOutpost, pop 0, 1 budynek ---');
const o1 = EmpireColonyBootstrap.bootstrapAutonomousOutpost('emp_001', 'sys_061', 'thuban_d_moon', 'autonomous_solar_farm');
ok('outpost powstał', !!o1);
ok('isOutpost === true', o1.isOutpost === true);
ok('population === 0', o1.civSystem.population === 0);
ok('1 budynek', buildingCount(o1) === 1);

// Wstrzyknij góry w grid outpostu (non-pole) — gwarancja terenu dla autonomous_mine.
{
  const grid = o1.buildingSystem._grid;
  const rows = grid.height ?? 10;
  let added = 0;
  grid.forEach(tile => {
    if (added < 3 && !tile.buildingId && tile.r > 1 && tile.r < rows - 2) {
      tile.type = 'mountains'; added++;
    }
  });
}

console.log('--- T12: drugi call (mine) → ten sam outpost, 2 budynki ---');
const o2 = EmpireColonyBootstrap.bootstrapAutonomousOutpost('emp_001', 'sys_061', 'thuban_d_moon', 'autonomous_mine');
ok('ten sam outpost (referencyjnie)', o2 === o1);
ok('2 budynki', buildingCount(o2) === 2);

console.log('--- T13: trzeci call (solar) → 3 budynki ---');
const o3 = EmpireColonyBootstrap.bootstrapAutonomousOutpost('emp_001', 'sys_061', 'thuban_d_moon', 'autonomous_solar_farm');
ok('3 budynki', buildingCount(o3) === 3);

console.log('--- T14: wszystkie 3 budynki NIE na biegunie (regresja d848417) ---');
{
  const grid = o1.buildingSystem._grid;
  const rows = grid.height ?? 10;
  let onPole = 0;
  grid.forEach(tile => {
    if (tile.buildingId && (tile.r === 0 || tile.r === rows - 1)) onPole++;
  });
  ok('0 budynków na biegunie', onPole === 0);
}

console.log('--- T15: autonomous_mine na mountains lub crater (hard rule) ---');
{
  const grid = o1.buildingSystem._grid;
  let mineOk = true, mineFound = false;
  grid.forEach(tile => {
    if (tile.buildingId === 'autonomous_mine') {
      mineFound = true;
      if (tile.type !== 'mountains' && tile.type !== 'crater') mineOk = false;
    }
  });
  ok('autonomous_mine istnieje', mineFound);
  ok('autonomous_mine na mountains/crater', mineOk);
}

console.log('--- T16: outpost.ownerEmpireId === emp_001 ---');
ok('ownerEmpireId === emp_001', o1.ownerEmpireId === 'emp_001');

console.log('--- T17: colony_base (nie-autonomiczny) → throw ---');
ok('throw przy nie-autonomicznym budynku', throws(
  () => EmpireColonyBootstrap.bootstrapAutonomousOutpost('emp_001', 'sys_061', 'thuban_d_moon', 'colony_base'),
  'autonomiczny'));

console.log('--- T18: AutoExpander NIE bierze outpostu (filtr !isOutpost) ---');
{
  const expander = new ColonyAutoExpander();
  const managed = expander._managedColonies();
  const hasOutpost = managed.some(c => c.planetId === 'thuban_d_moon');
  ok('outpost NIE w _managedColonies', !hasOutpost);
}

// ═══════════════════════════════════════════════════════════════
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
