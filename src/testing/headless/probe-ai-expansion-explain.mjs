// ═══════════════════════════════════════════════════════════════
// PROBE (weryfikacja narzędzia) — explainColonization / debug.aiExpansion (Plan 1 CASE A)
// Uruchom: node src/testing/headless/probe-ai-expansion-explain.mjs
// ───────────────────────────────────────────────────────────────
// CASE A (Konsorcjum): android_mag=6, canAffordOutpost=TAK, a mimo to BRAK outpostu.
// Blokada jest DOWNSTREAM affordability w _runColonizationTree. Tu odtwarzamy dwie
// przewidziane przyczyny + pasywność i sprawdzamy, że explainColonization podaje POWÓD:
//   S1 — cele outpostów OSIĄGNIĘTE (2 Xe outposty) → pełna kolonia (nie bug)
//   S2 — ciało Xe SKOLONIZOWANE pełną kolonią (fallback zjadł kandydata) → brak wolnego Xe
//   S3 — imperium bez macierzystej (pełnej) kolonii → PASYWNE (jak rzekomo emp_002)
// ═══════════════════════════════════════════════════════════════

import './env.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }          from '../../systems/ColonyManager.js';
import { EmpireRegistry }         from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap }  from '../../systems/EmpireColonyBootstrap.js';
import { EmpireStrategySystem }   from '../../systems/EmpireStrategySystem.js';
import { INDUSTRIALIST }          from '../../data/EmpireArchetypeIndustrialist.js';

const dep = (resourceId, remaining, richness = 0.6) => ({ resourceId, richness, totalAmount: remaining, remaining });
const mk = (id, name, sys, atm, deposits, extra = {}) => EntityManager.add({
  id, name, type: 'planet', planetType: 'rocky', radius: 1, mass: 1, atmosphere: atm,
  temperatureK: 280, deposits, systemId: sys, composition: { Fe: 0.25, Si: 0.2, Cu: 0.05, C: 0.2, O: 0.25 }, ...extra,
});

// S1 (targets-met): home + 2 ciała Xe + 1 ciało Nt (wszystkie staną się outpostami → cele OK)
mk('s1_home', 'S1 Home', 'sys_s1', 'breathable', [dep('Fe', 9e5), dep('Xe', 2e5)]);
mk('s1_xeA',  'S1 XeA',  'sys_s1', 'none',       [dep('Xe', 3e5), dep('Fe', 3e5)], { planetoidType: 'metallic' });
mk('s1_xeB',  'S1 XeB',  'sys_s1', 'none',       [dep('Xe', 3e5), dep('Fe', 3e5)], { planetoidType: 'metallic' });
mk('s1_nt',   'S1 Nt',   'sys_s1', 'none',       [dep('Nt', 1e5), dep('Fe', 2e5)], { planetoidType: 'metallic' });
// S2 (no-free-candidate): home + 1 ciało Xe które skolonizujemy PEŁNĄ kolonią
mk('s2_home', 'S2 Home', 'sys_s2', 'breathable', [dep('Fe', 9e5), dep('Xe', 2e5)]);
mk('s2_xe',   'S2 Xe',   'sys_s2', 'none',       [dep('Xe', 3e5), dep('Fe', 3e5)], { planetoidType: 'metallic' });
// S3 (passive): home istnieje jako ENCJA, ale NIE bootstrapujemy pełnej kolonii
mk('s3_home', 'S3 Home', 'sys_s3', 'breathable', [dep('Fe', 9e5)]);

const SYSTEMS = {
  sys_s1: { planetIds: ['s1_home', 's1_xeA', 's1_xeB', 's1_nt'], moonIds: [], planetoidIds: [] },
  sys_s2: { planetIds: ['s2_home', 's2_xe'], moonIds: [], planetoidIds: [] },
  sys_s3: { planetIds: ['s3_home'], moonIds: [], planetoidIds: [] },
};
const techStub = new Proxy({}, { get: (_t, p) => p === 'getTerrainUnlocks' ? () => [] : p === 'isResearched' ? () => true : () => 1 });
const colonyManager = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  civMode: true, timeSystem: { gameTime: 5 }, colonyManager, empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: { getSystem: (id) => SYSTEMS[id] ?? null },
  galaxyData: { seed: 1, systems: [{ id: 'sys_s1', x: 0, y: 0, z: 0 }, { id: 'sys_s2', x: 8, y: 0, z: 0 }, { id: 'sys_s3', x: 16, y: 0, z: 0 }] },
};

empireRegistry.createEmpire({ id: 'emp_s1', archetype: 'industrialist', homeSystemId: 'sys_s1' });
empireRegistry.createEmpire({ id: 'emp_s2', archetype: 'industrialist', homeSystemId: 'sys_s2' });
empireRegistry.createEmpire({ id: 'emp_s3', archetype: 'industrialist', homeSystemId: 'sys_s3' });
EmpireColonyBootstrap.bootstrapHomeColony('emp_s1', INDUSTRIALIST, 'sys_s1');
EmpireColonyBootstrap.bootstrapHomeColony('emp_s2', INDUSTRIALIST, 'sys_s2');
// emp_s3: BEZ bootstrapu pełnej kolonii → brak macierzystej (pasywne)

const strat = new EmpireStrategySystem();
window.KOSMOS.empireStrategySystem = strat;

// Nakarm mother S1/S2 pełnym zestawem outpostu (canAffordOutpost=TAK — jak CASE A).
const KIT = { Fe: 500, Si: 500, Cu: 200, Ti: 200, structural_alloys: 50, extraction_systems: 20, power_cells: 20, conductor_bundles: 20, electronic_systems: 20, android_worker: 12 };
colonyManager.getColony('s1_home').resourceSystem.receive({ ...KIT });
colonyManager.getColony('s2_home').resourceSystem.receive({ ...KIT });

// S1: załóż 2 outposty Xe + 1 Nt (WSZYSTKIE cele osiągnięte). createOutpost + rejestracja.
for (const pid of ['s1_xeA', 's1_xeB', 's1_nt']) {
  const o = colonyManager.createOutpost(pid, {}, 5, 'emp_s1');
  if (o) { o.ownerEmpireId = 'emp_s1'; empireRegistry.addColony('emp_s1', pid); }
}
// S2: skolonizuj ciało Xe PEŁNĄ kolonią (fallback-consumed) → nie liczy się jako outpost Xe,
//   ale getColony(s2_xe)≠null → _pickXeBody zwróci null.
EmpireColonyBootstrap.bootstrapColony('emp_s2', 'sys_s2', 's2_xe', { startPop: { laborer: 4 }, startResources: { food: 200, water: 200 }, archetypeId: 'industrialist' });

// ── Weryfikacja ──
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { console.log(`  PASS  ${n}`); pass++; } else { console.error(`  FAIL  ${n} — got: ${got}`); fail++; } };

const e1 = strat.explainColonization(empireRegistry.listAll().find(e => e.id === 'emp_s1'));
const e2 = strat.explainColonization(empireRegistry.listAll().find(e => e.id === 'emp_s2'));
const e3 = strat.explainColonization(empireRegistry.listAll().find(e => e.id === 'emp_s3'));

console.log('\n── explainColonization output ──');
console.log('S1:', JSON.stringify({ active: e1.active, xe: e1.xeOutposts, freeXe: e1.freeXeBody, canOut: e1.canOutpost, decision: e1.decision, reason: e1.reason }));
console.log('S2:', JSON.stringify({ active: e2.active, xe: e2.xeOutposts, freeXe: e2.freeXeBody, canOut: e2.canOutpost, decision: e2.decision, reason: e2.reason }));
console.log('S3:', JSON.stringify({ active: e3.active, mother: e3.mother, reason: e3.reason }));

console.log('\n── asercje ──');
ok('S1 canOutpost=TAK ale cele osiągnięte (Xe 2/2) → NIE bug', e1.canOutpost === true && e1.xeOutposts === '2/2' && /osiągnięte/i.test(e1.reason), e1.reason);
ok('S2 canOutpost=TAK ale brak wolnego ciała Xe (fallback zjadł kandydata)', e2.canOutpost === true && e2.freeXeBody === '—' && /BRAK wolnego ciała Xe/i.test(e2.reason), e2.reason);
ok('S3 PASYWNE — brak macierzystej kolonii (jak rzekomo emp_002)', e3.active === false && /PASYWNE/i.test(e3.reason), e3.reason);

console.log(`\n═══ WYNIK: ${pass} PASS / ${fail} FAIL ═══`);
console.log('Wniosek: explainColonization podaje DOKŁADNY powód „affordable ale brak outpostu" —');
console.log('gracz odpala KOSMOS.debug.aiExpansion(\'emp_001\') na żywym save by poznać powód CASE A.');
process.exit(fail === 0 ? 0 : 1);
