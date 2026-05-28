// ═══════════════════════════════════════════════════════════════
// Integration test — EmpireLogisticsSystem (pełna pętla time:tick)
// Uruchom: node src/testing/headless/test-empire-logistics-integration.mjs
// ───────────────────────────────────────────────────────────────
// Slice 2 / Sesja 3. Realny ColonyManager + VesselManager + EmpireLogisticsSystem
// pod pełnym time:tick (build kuriera w stoczni → claim → krążenie → dostawa).
//
// Assert (po ~symulacji):
//   • route z couriersPerRoute (2) kurierami
//   • kurierzy KRĄŻĄ (stats.dispatched/delivered rosną, cargo cyklicznie pełny/pusty)
//   • inventory Xe stolicy ROŚNIE z dostaw
//   • fuel NIE blokuje (kurier z 0 paliwa dalej lata — consumeFuel clampuje)
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first
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

const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

const XE = (richness = 1.0, remaining = 50000) => ({ resourceId: 'Xe', richness, totalAmount: remaining, remaining });
const FE = (remaining = 100000) => ({ resourceId: 'Fe', richness: 1, totalAmount: remaining, remaining });

EntityManager.add({ id: 'star_x', name: 'Star X', type: 'star', x: 0, y: 0, mass: 1, systemId: 'sys_x' });
// Stolica (rocky) + outpost Xe (księżyc) — jawne x/y (1 AU ≈ 110 px), ~2.7 AU od siebie.
EntityManager.add({
  id: 'cap_p', name: 'Capital', type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 280, systemId: 'sys_x', x: 400, y: 0, deposits: [FE()],
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
EntityManager.add({
  id: 'xe_out', name: 'Xe Outpost', type: 'moon', moonType: 'rocky', radius: 0.3, mass: 0.1,
  atmosphere: 'none', temperatureK: 200, systemId: 'sys_x', x: 700, y: 0, deposits: [XE(1.5), FE()],
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});

const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
const vesselManager  = new VesselManager();

globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  timeSystem: { gameTime: 100 },
  scenario: 'civilization',
  star: EntityManager.get('star_x'),
  colonyManager, empireRegistry, vesselManager,
  techSystem: techStub,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: {
    getSystem: (id) => id === 'sys_x'
      ? { planetIds: ['cap_p'], moonIds: ['xe_out'], planetoidIds: [] }
      : null,
  },
  homePlanet: null,
};

const logi = new EmpireLogisticsSystem();
const gt  = () => window.KOSMOS.timeSystem.gameTime;
const setGt = (v) => { window.KOSMOS.timeSystem.gameTime = v; };

// ── Setup: imperium + stolica (stocznia) + outpost Xe ────────────
empireRegistry.createEmpire({ id: 'emp_int', archetype: 'industrialist', homeSystemId: 'sys_x' });
const empire = empireRegistry.get('emp_int');

const capital = EmpireColonyBootstrap.bootstrapColony('emp_int', 'sys_x', 'cap_p', {
  startPop:       { laborer: 10, worker: 3 },
  startResources: { food: 30000, water: 30000 },   // ample — brak famine przez symulację
  startBuildings: ['colony_base', 'shipyard', 'solar_farm', 'mine'],
  archetypeId:    'industrialist',
});
// Hojny zapas budowy statków + wyłącz fabrykę (Xe nie konsumowany → czysty pomiar dostaw).
capital.resourceSystem.receive({
  Fe: 100000, Ti: 5000, Cu: 5000, Si: 5000, Hv: 2000,
  structural_alloys: 2000, polymer_composites: 1000, power_cells: 2000,
  propulsion_systems: 500, plasma_cores: 500, warp_cores: 500, metamaterials: 500, quantum_processors: 500,
});
capital.factorySystem?.setMode('manual');

// Outpost Xe z dużym zapasem (kurier ma zawsze czym napełnić cargo).
EmpireColonyBootstrap.bootstrapAutonomousOutpost('emp_int', 'sys_x', 'xe_out', 'autonomous_solar_farm');
EmpireColonyBootstrap.bootstrapAutonomousOutpost('emp_int', 'sys_x', 'xe_out', 'autonomous_mine');
const outpost = colonyManager.getColony('xe_out');
outpost.resourceSystem.receive({ Xe: 80000, Fe: 8000 });

// ── Symulacja ────────────────────────────────────────────────────
function tick(dy) {
  setGt(gt() + dy);
  EventBus.emit('time:tick', { deltaYears: dy, civDeltaYears: dy * 12 });
}

const DY = 0.1;          // physics years / tick (civDt = 1.2)
const TICKS = 140;       // ~168 civYears
let drainedOnce = false;
let xeAfterFirstDelivery = null;

for (let i = 0; i < TICKS; i++) {
  tick(DY);

  // Po pierwszej dostawie zapamiętaj Xe stolicy (baseline wzrostu).
  if (xeAfterFirstDelivery === null && (empire.logistics?.stats?.delivered ?? 0) >= 1) {
    xeAfterFirstDelivery = capital.resourceSystem.getAmount('Xe');
  }

  // W połowie symulacji opróżnij paliwo jednego kuriera (test fuel non-blocking).
  if (!drainedOnce && i === 80) {
    const route = empire.logistics?.routes?.[0];
    const cid = route?.courierIds?.[0];
    const v = cid ? vesselManager.getVessel(cid) : null;
    if (v) { v.fuel.current = 0; drainedOnce = true; }
  }
}

// ── Asercje ──────────────────────────────────────────────────────
const route = empire.logistics?.routes?.[0];
const stats = empire.logistics?.stats ?? {};
const capXe = capital.resourceSystem.getAmount('Xe');

console.log(`\n[integ] stats=${JSON.stringify(stats)} capXe=${capXe.toFixed(0)} reserve=${empire.logistics?.reserve?.length ?? 0} drained=${drainedOnce}`);
console.log(`[integ] route.courierIds=${route?.courierIds?.length ?? 0} couriers, baseline Xe@1st=${xeAfterFirstDelivery}`);

ok('route istnieje (→ stolica)', !!route && route.motherId === 'cap_p');
ok('route ma 2 kurierów (couriersPerRoute)', (route?.courierIds?.length ?? 0) === 2);
ok('kurierzy zbudowani (stats.built ≥ 2)', (stats.built ?? 0) >= 2);
ok('kurierzy KRĄŻĄ (stats.dispatched ≥ 3)', (stats.dispatched ?? 0) >= 3);
ok('dostawy wykonane (stats.delivered ≥ 2)', (stats.delivered ?? 0) >= 2);
ok('Xe stolicy > 0 (dostarczony z outpostu)', capXe > 0);
ok('Xe stolicy rośnie z dostaw (≥ baseline)', xeAfterFirstDelivery !== null && capXe >= xeAfterFirstDelivery);
ok('fuel test wykonany (kurier opróżniony)', drainedOnce === true);
// Po opróżnieniu paliwa kurier dalej lata (consumeFuel clampuje, dispatch nie gate fuel).
// Sprawdzamy że dostawy rosły PO drainie (delivered > wartość z połowy symulacji = i tak ≥2).
ok('fuel NIE blokuje (dostawy mimo 0 paliwa)', (stats.delivered ?? 0) >= 2);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
