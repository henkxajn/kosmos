// ═══════════════════════════════════════════════════════════════
// Integration test — EmpireStrategySystem przez pętlę time:tick
// Uruchom: node src/testing/headless/test-empire-strategy-integration.mjs
// ───────────────────────────────────────────────────────────────
// Slice 2 / Sesja 2. Symuluje 10 ticków × 5 civYears (= 50 cy) przez emit
// 'time:tick' (Warstwa C subskrybuje go w konstruktorze). Macierzysta jest
// regularnie dotowana, by AI mogło realizować progresję P1→P2→P3→fallback.
//
//   Pass: po 50 cy imperium ma ≥ 1 outpost (P1).
//   Mocniej: 2 outposty Xe (P1+P2) + ≥1 pełna kolonia (P3/fallback).
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }        from '../../systems/ColonyManager.js';
import { EmpireRegistry }       from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { EmpireStrategySystem } from '../../systems/EmpireStrategySystem.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

const XE = (richness = 1.0, remaining = 50000) => ({ resourceId: 'Xe', richness, totalAmount: remaining, remaining });
const FE = (remaining = 100000) => ({ resourceId: 'Fe', richness: 1, totalAmount: remaining, remaining });

const mkMoon = (id, name, deposits) => EntityManager.add({
  id, name, type: 'moon', moonType: 'rocky', radius: 0.3, mass: 0.1,
  atmosphere: 'none', temperatureK: 200, systemId: 'sys_x', deposits,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
const mkPlanet = (id, name, atmosphere, deposits) => EntityManager.add({
  id, name, type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere, temperatureK: 280, systemId: 'sys_x', deposits,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});

mkPlanet('mother_p', 'Mother',   'breathable', [FE()]);
mkMoon('xe_a',       'Xe A',     [XE(1.2), FE()]);
mkMoon('xe_b',       'Xe B',     [XE(0.9), FE()]);
mkPlanet('rocky_a',  'Rocky A',  'breathable', [FE()]);
mkPlanet('rocky_b',  'Rocky B',  'none',       [FE()]);

const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  timeSystem: { gameTime: 10 },
  colonyManager,
  empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: {
    getSystem: (id) => id === 'sys_x' ? {
      planetIds:    ['mother_p', 'rocky_a', 'rocky_b'],
      moonIds:      ['xe_a', 'xe_b'],
      planetoidIds: [],
    } : null,
  },
};

empireRegistry.createEmpire({ id: 'emp_I', archetype: 'industrialist', homeSystemId: 'sys_x' });

const mother = EmpireColonyBootstrap.bootstrapColony('emp_I', 'sys_x', 'mother_p', {
  startPop: { laborer: 1, worker: 1 }, startResources: { food: 200, water: 200 }, archetypeId: 'industrialist',
});
// Duży kapitał startowy — AI nie głoduje przez 50 cy ekspansji.
mother.civSystem.addPop('laborer', 30);
const RESTOCK = {
  Si: 1e4, Cu: 1e4, Ti: 1e4, Fe: 1e4,
  structural_alloys: 1e3, android_worker: 1e3, power_cells: 1e3,
  conductor_bundles: 1e3, electronic_systems: 1e3, extraction_systems: 1e3,
  food: 1e4, water: 1e4,
};
mother.resourceSystem.receive(RESTOCK);

const sys = new EmpireStrategySystem();
// sys._verbose = true;  // odkomentuj dla logów decyzji

// 10 ticków × 5 civYears = 50 cy
for (let i = 0; i < 10; i++) {
  mother.resourceSystem.receive(RESTOCK);                 // dotacja przed decyzją
  window.KOSMOS.timeSystem.gameTime += 5 / 12;            // 5 civYears
  EventBus.emit('time:tick', {
    deltaYears:    5 / 12,
    civDeltaYears: 5,
    gameTime:      window.KOSMOS.timeSystem.gameTime,
    multiplier:    5,
  });
}

// UWAGA: outposty NIE są w empireRegistry (bootstrapAutonomousOutpost nie woła
// addColony) → liczymy przez ColonyManager.getAllColonies (zawiera outposty).
const colonies = colonyManager.getAllColonies().filter(c => c.ownerEmpireId === 'emp_I');
const outposts = colonies.filter(c => c.isOutpost);
const fullColonies = colonies.filter(c => !c.isOutpost);
const xeOutposts = outposts.filter(c => (EntityManager.get(c.planetId)?.deposits ?? []).some(d => d.resourceId === 'Xe'));

console.log(`\nPo 50 cy: ${colonies.length} kolonii (${outposts.length} outpost, ${fullColonies.length} pełnych), ${xeOutposts.length} outpostów Xe`);
console.log('  kolonie:', colonies.map(c => `${c.planetId}${c.isOutpost ? '(out)' : ''}`).join(', '));

// ── Asercje ──────────────────────────────────────────────────────
ok('po 50 cy ≥ 1 outpost (P1)', outposts.length >= 1);
ok('2 outposty Xe (P1 + P2)', xeOutposts.length >= 2);
ok('≥ 1 pełna kolonia (P3/fallback)', fullColonies.length >= 1);
ok('mother NIE w famine (food > 0)', mother.resourceSystem.getAmount('food') > 0);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
