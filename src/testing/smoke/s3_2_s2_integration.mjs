// S3.2 S2 — integracja REAL-SYSTEM (proxy live-game gate, [[live-game-mandatory-gate]]).
//
// Bootstrap REALNEJ kolonii AI (EmpireColonyBootstrap.bootstrapHomeColony) → realny
// BuildingSystem + ResourceSystem + per-empire TechSystem (aiTech). Następnie
// EmpireResearchSystem tickuje i dowodzi END-TO-END z prawdziwymi systemami:
//   (1) research_station faktycznie postawiona z startingBuildings,
//   (2) capital.resourceSystem.getGrossPerYear('research') > 0 (linchpin audytu B),
//   (3) AI realnie odblokowuje data_networks → efficient_solar przez tyk badań.
// Smoke mock-owy (tmp_s3_2_s2_smoke.mjs) gate'uje LOGIKĘ; ten test gate'uje WIRING.

import '../../testing/headless/env.js'; // MUST be first — shim window/document/THREE
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { EmpireRegistry } from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { EmpireResearchSystem } from '../../systems/EmpireResearchSystem.js';
import { ARCHETYPES } from '../../data/EmpireData.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  ✓ ' + n); pass++; } else { console.log('  ✗ ' + n); fail++; } };
const header = (t) => console.log('\n--- ' + t + ' ---');

// ── Real world: home planet (rocky/breathable) + stub starSystemManager ──
const mkPlanet = (id, name, systemId) => EntityManager.add({
  id, name, type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 280, deposits: [], systemId,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
mkPlanet('planet_ind', 'Ind Home', 'sys_ind');
const SYSTEMS = { sys_ind: { planetIds: ['planet_ind'], moonIds: [], planetoidIds: [] } };

// techStub TYLKO dla ctora ColonyManager — bootstrap nadpisuje colony.techSystem realnym aiTech.
const techStub = new Proxy({}, {
  get: (_t, p) => { if (p === 'getTerrainUnlocks') return () => []; if (p === 'isResearched') return () => true; return () => 1; },
});
const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
window.KOSMOS = {
  timeSystem: { gameTime: 0 },
  colonyManager,
  empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: { getSystem: (id) => SYSTEMS[id] ?? null },
};

empireRegistry.createEmpire({ id: 'emp_ind', archetype: 'industrialist', homeSystemId: 'sys_ind' });
const colonyId = EmpireColonyBootstrap.bootstrapHomeColony('emp_ind', ARCHETYPES.industrialist, 'sys_ind');

// ════════════════════════════════════════════════════════════════════════
header('1) Bootstrap REALNEJ kolonii AI (real ColonyManager/BuildingSystem)');
// ════════════════════════════════════════════════════════════════════════
ok('bootstrapHomeColony zwrócił colonyId', !!colonyId);
const capital = empireRegistry.getColoniesByEmpire('emp_ind').find(c => c && !c.isOutpost) ?? null;
ok('stolica zarejestrowana w EmpireRegistry', !!capital);
ok('stolica ma realny resourceSystem.getGrossPerYear', typeof capital?.resourceSystem?.getGrossPerYear === 'function');
ok('stolica ma realny aiTech (isResearched+grantTechs, nie stub)',
   typeof capital?.techSystem?.isResearched === 'function' && typeof capital?.techSystem?.grantTechs === 'function');

// ════════════════════════════════════════════════════════════════════════
header('2) research_station postawiona + realny output research (linchpin B)');
// ════════════════════════════════════════════════════════════════════════
let hasStation = false;
for (const e of (capital?.buildingSystem?._active?.values?.() ?? [])) {
  if (e?.building?.id === 'research_station') hasStation = true;
}
ok('research_station w _active stolicy (postawiona z startingBuildings)', hasStation);
const rate = capital?.resourceSystem?.getGrossPerYear?.('research') ?? 0;
ok(`getGrossPerYear('research') > 0 (realny rate = ${typeof rate === 'number' ? rate.toFixed(2) : rate})`, rate > 0);

// ════════════════════════════════════════════════════════════════════════
header('3) aiTech seedowany startingTechs; kolejka jeszcze nie ruszona');
// ════════════════════════════════════════════════════════════════════════
ok('automation zbadane (tech startowy)', capital.techSystem.isResearched('automation'));
ok('data_networks NIE zbadane (pierwszy w kolejce — przed tikiem)', !capital.techSystem.isResearched('data_networks'));

// ════════════════════════════════════════════════════════════════════════
header('4) EmpireResearchSystem END-TO-END — AI realnie bada kolejkę w czasie');
// ════════════════════════════════════════════════════════════════════════
const sys = new EmpireResearchSystem();
window.KOSMOS.empireResearchSystem = sys;
const emp = empireRegistry.get('emp_ind');

// data_networks cost 150; rate≈10/rok → ~15cy. Tickujemy z zapasem (guard MAX).
let years = 0; const STEP = 5, MAX = 600;
while (!capital.techSystem.isResearched('data_networks') && years < MAX) { sys._tick(STEP); years += STEP; }
ok(`data_networks zbadane przez tyk badań (~${years}cy @rate≈${typeof rate === 'number' ? rate.toFixed(1) : rate}/rok)`,
   capital.techSystem.isResearched('data_networks'));
ok('empire.research istnieje (lazy-init na obiekcie imperium)', !!emp?.research);
ok('empire.research.queueIndex ≥ 1 (kolejka ruszyła)', (emp?.research?.queueIndex ?? 0) >= 1);

// Kontynuacja — drugi tech efficient_solar (cost 70)
years = 0;
while (!capital.techSystem.isResearched('efficient_solar') && years < MAX) { sys._tick(STEP); years += STEP; }
ok('efficient_solar zbadane (kolejka kontynuuje)', capital.techSystem.isResearched('efficient_solar'));
ok('empire.research.queueIndex ≥ 2', (emp?.research?.queueIndex ?? 0) >= 2);

// ── Podsumowanie ─────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════`);
console.log(`  PASS: ${pass}   FAIL: ${fail}`);
console.log(`════════════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);
