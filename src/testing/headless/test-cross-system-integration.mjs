// ═══════════════════════════════════════════════════════════════
// Integration test — Slice 3.1b: kolonizacja cross-system przez REALNĄ generację
// Uruchom: node src/testing/headless/test-cross-system-integration.mjs
// ───────────────────────────────────────────────────────────────
// Smoke testy (test-empire-strategy.mjs) STUB-ują starSystemManager.getSystem →
// nigdy nie ćwiczą REALNEJ ścieżki _ensureSystemGenerated → generateAndRegister →
// SystemGenerator. Ten test używa REALNYCH: GalaxyGenerator + StarSystemManager +
// SystemGenerator + EmpireColonyBootstrap + EmpireStrategySystem (wszystkie three-free).
// GameCore NIE działa headless (GroundUnitManager→GlbSnapshotRenderer importuje 'three'),
// więc składamy minimalny realny harness ręcznie.
//
//   T1: bootstrapHomeColony → REALNA generacja home systemu (systemId stamp + fog reset)
//   T2: _ensureSystemGenerated na NIEwygenerowanym systemie galaktyki (real + idempotencja)
//   T3: _pickTargetSystem na REALNEJ galaktyce (wyklucza home/AI/owned)
//   T4: PEŁNA ścieżka cross-system — real generacja celu + realne createColony/Outpost
//       w nie-home systemie + poprawny systemId + distinct=2
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first — shim localStorage/window/THREE
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }         from '../../systems/ColonyManager.js';
import { EmpireRegistry }        from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { EmpireStrategySystem }  from '../../systems/EmpireStrategySystem.js';
import { StarSystemManager }     from '../../systems/StarSystemManager.js';
import { GalaxyGenerator }       from '../../generators/GalaxyGenerator.js';
import { ARCHETYPES }            from '../../data/EmpireData.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

// Permisywny techStub dla ColonyManager (bootstrap nadpisze buildingSystem.techSystem
// per-empire aiTech z archetype.startingTechs — jak w żywej grze).
const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

// ── Realna galaktyka + realny StarSystemManager ────────────────────
const galaxyData     = GalaxyGenerator.generate('sys_home', 'Sol', 'G');
const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
const starSystemManager = new StarSystemManager();   // REALNY (generateAndRegister → SystemGenerator)

globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  timeSystem: { gameTime: 10 },
  colonyManager,
  empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager,
  galaxyData,
};

ok('galaxyData ma systemy (real GalaxyGenerator)', Array.isArray(galaxyData.systems) && galaxyData.systems.length > 2);

// ── Expansionist z REALNĄ home kolonią (bootstrapHomeColony → real generacja) ──
const expHome = galaxyData.systems.find(s => !s.isHome);
empireRegistry.createEmpire({ id: 'emp_exp', archetype: 'expansionist', homeSystemId: expHome.id });
expHome.empireId = 'emp_exp';   // jak EmpireGenerator (homeSys.empireId = empireId)
const homeColId = EmpireColonyBootstrap.bootstrapHomeColony('emp_exp', ARCHETYPES.expansionist, expHome.id);
const empExp = empireRegistry.get('emp_exp');
const sys = new EmpireStrategySystem();

console.log('--- T1: bootstrapHomeColony → REALNA generacja home systemu ---');
{
  ok('bootstrapHomeColony zwrócił colonyId', !!homeColId);
  const sd = starSystemManager.getSystem(expHome.id);
  ok('home system zarejestrowany w StarSystemManager', !!sd && Array.isArray(sd.planetIds) && sd.planetIds.length > 0);
  ok('encje home mają systemId stamped', EntityManager.get(sd.planetIds[0])?.systemId === expHome.id);
  ok('fog gate: home galaxyStar.explored=false', expHome.explored === false);
  const homeColony = colonyManager.getColony(homeColId);
  ok('home kolonia ownerEmpireId=emp_exp, systemId=home', !!homeColony && homeColony.ownerEmpireId === 'emp_exp' && homeColony.systemId === expHome.id);
}

console.log('--- T2: _ensureSystemGenerated na NIEwygenerowanym systemie (real + idempotencja) ---');
{
  const ungen = galaxyData.systems.find(s => !s.isHome && !s.empireId && !starSystemManager.getSystem(s.id));
  ok('istnieje niewygenerowany system-kandydat', !!ungen);
  const gen1 = EmpireColonyBootstrap._ensureSystemGenerated(ungen.id);
  ok('real generacja: planetIds niepuste', !!gen1 && Array.isArray(gen1.planetIds) && gen1.planetIds.length > 0);
  ok('real generacja: encje systemId stamped', EntityManager.get(gen1.planetIds[0])?.systemId === ungen.id);
  ok('fog gate: explored=false po generacji', ungen.explored === false);
  const gen2 = EmpireColonyBootstrap._ensureSystemGenerated(ungen.id);
  ok('idempotencja: 2. wywołanie ten sam sysData (fast-path)', gen1 === gen2);
}

console.log('--- T3: _pickTargetSystem na REALNEJ galaktyce ---');
{
  const motherExp = sys._pickMotherColony(empExp);
  ok('_pickMotherColony zwraca home kolonię', !!motherExp);
  const target = sys._pickTargetSystem(empExp, motherExp, 100);
  ok('picker zwraca system', !!target);
  ok('picker: nie home gracza, nie home AI, nie własny home',
     !!target && !target.isHome && !target.empireId && target.id !== expHome.id);
}

console.log('--- T4: PEŁNA ścieżka cross-system — real generacja celu + real founding ---');
{
  const motherExp = sys._pickMotherColony(empExp);
  // Subsydia: AI nie głoduje (POP + zasoby na outpost LUB pełną kolonię).
  motherExp.civSystem.addPop('laborer', 30);
  const RESTOCK = {
    Si: 1e4, Cu: 1e4, Ti: 1e4, Fe: 1e4,
    structural_alloys: 1e3, android_worker: 1e3, power_cells: 1e3,
    conductor_bundles: 1e3, electronic_systems: 1e3, extraction_systems: 1e3,
    food: 1e4, water: 1e4,
  };
  motherExp.resourceSystem.receive(RESTOCK);

  // Znajdź realny cel z kandydatem (rocky LUB Xe) — generacja idempotentna.
  const owned = new Set(empireRegistry.getColoniesByEmpire('emp_exp').map(c => c.systemId));
  let tgt = null, bodyIds = null;
  for (const s of galaxyData.systems) {
    if (s.isHome || s.empireId || s.id === expHome.id || owned.has(s.id)) continue;
    const sd = EmpireColonyBootstrap._ensureSystemGenerated(s.id);
    const bids = sys._systemBodyIds(sd);
    const hasCandidate = bids.some(id => {
      const e = EntityManager.get(id);
      return e?.planetType === 'rocky' || (e?.deposits ?? []).some(d => d.resourceId === 'Xe' && d.remaining > 0);
    });
    if (hasCandidate) { tgt = s; bodyIds = bids; break; }
  }
  ok('znaleziono realny cel z kandydatem (rocky/Xe)', !!tgt);

  const distinctBefore = new Set(empireRegistry.getColoniesByEmpire('emp_exp').map(c => c.systemId)).size;
  const acted = sys._runColonizationTree(empExp, motherExp, tgt.id, bodyIds, 100, sys._config(empExp));
  ok('real cross-system: drzewo założyło placówkę (outpost lub kolonia)', acted === true);

  const inTarget = empireRegistry.getColoniesByEmpire('emp_exp').filter(c => c.systemId === tgt.id);
  ok('real cross-system: placówka w systemie-celu z poprawnym systemId', inTarget.length >= 1);
  const distinctAfter = new Set(empireRegistry.getColoniesByEmpire('emp_exp').map(c => c.systemId)).size;
  ok('real cross-system: distinct systemy = before+1', distinctAfter === distinctBefore + 1);
  ok('real cross-system: emp_exp w ≥2 systemach', distinctAfter >= 2);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
