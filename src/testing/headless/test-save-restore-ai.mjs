// ═══════════════════════════════════════════════════════════════
// Save/restore AI test — TechDebt Faza 1 (#2 + #14)
// Uruchom: node src/testing/headless/test-save-restore-ai.mjs
// ───────────────────────────────────────────────────────────────
// #14: outpost trafia do emp.colonies (addColony) → getColoniesByEmpire go zwraca.
// #2:  re-link po load przywraca colony.ownerEmpireId + per-empire aiTech
//      (z empireTech LUB fallback archetype.startingTechs). EmpireStrategySystem
//      blacklist round-trip. _findEmpireTechSystem pomija outposty.
//      SaveSystem._serializeEmpireTech snapshotuje researched stolicy.
// Per [[testing-rollback-paths]] — osobne case'y dla obu ścieżek re-linku.
// ═══════════════════════════════════════════════════════════════

import './env.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { EmpireRegistry } from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { EmpireStrategySystem } from '../../systems/EmpireStrategySystem.js';
import { SaveSystem } from '../../systems/SaveSystem.js';
import { ARCHETYPES } from '../../data/EmpireData.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

// Permisywny techStub (global gracza — co createOutpost/restore wstrzykuje)
const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

const FE = (rem = 100000) => ({ resourceId: 'Fe', richness: 1, totalAmount: rem, remaining: rem });
const XE = (rich = 1.0, rem = 50000) => ({ resourceId: 'Xe', richness: rich, totalAmount: rem, remaining: rem });

EntityManager.add({
  id: 'mother_r', name: 'Mother R', type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 280, systemId: 'sys_r', deposits: [FE()],
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
EntityManager.add({
  id: 'xe_r', name: 'Xe R', type: 'moon', moonType: 'rocky', radius: 0.3, mass: 0.1,
  atmosphere: 'none', temperatureK: 200, systemId: 'sys_r', deposits: [XE(1.2), FE()],
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});

const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
window.KOSMOS = {
  timeSystem: { gameTime: 10 },
  colonyManager,
  empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: {
    getSystem: (id) => id === 'sys_r'
      ? { planetIds: ['mother_r'], moonIds: ['xe_r'], planetoidIds: [] }
      : null,
  },
};

empireRegistry.createEmpire({ id: 'emp_R', archetype: 'industrialist', homeSystemId: 'sys_r' });

// Mother = home colony (jak EmpireGenerator → bootstrapHomeColony tworzy per-empire
//   aiTech + ustawia colony.techSystem). bootstrapColony NIE tworzy aiTech (tylko reuse
//   przez _findEmpireTechSystem), więc pierwsza kolonia MUSI być home — inaczej zostaje
//   globalny tech (jak w żywej grze: home pierwszy, ekspansja reuse).
const motherId = EmpireColonyBootstrap.bootstrapHomeColony('emp_R', ARCHETYPES.industrialist, 'sys_r');
const mother   = colonyManager.getColony(motherId);
const outpost  = EmpireColonyBootstrap.bootstrapAutonomousOutpost('emp_R', 'sys_r', 'xe_r', 'autonomous_solar_farm');

// ═══════════════════════════════════════════════════════════════
// #14 — outpost zarejestrowany w EmpireRegistry
// ═══════════════════════════════════════════════════════════════
console.log('--- #14: outpost w getColoniesByEmpire (addColony) ---');
const cols = empireRegistry.getColoniesByEmpire('emp_R');
ok('getColoniesByEmpire = 2 (mother + outpost)', cols.length === 2);
ok('zawiera outpost xe_r', cols.some(c => c.planetId === 'xe_r' && c.isOutpost === true));
ok('zawiera mother (pełna)', cols.some(c => c.planetId === 'mother_r' && !c.isOutpost));

// ═══════════════════════════════════════════════════════════════
// _findEmpireTechSystem pomija outposty (anchor = stolica)
// ═══════════════════════════════════════════════════════════════
console.log('--- _findEmpireTechSystem zwraca aiTech stolicy, nie outpostu ---');
const found = EmpireColonyBootstrap._findEmpireTechSystem('emp_R');
ok('zwraca techSystem stolicy', found === mother.techSystem);
ok('aiTech ma robotics (industrialist startingTechs)', found?.isResearched?.('robotics') === true);

// ═══════════════════════════════════════════════════════════════
// SaveSystem._serializeEmpireTech — snapshot researched per imperium
// (metoda nie używa `this` → wołamy na prototypie bez konstrukcji SaveSystem)
// ═══════════════════════════════════════════════════════════════
console.log('--- SaveSystem._serializeEmpireTech ---');
const empireTech = SaveSystem.prototype._serializeEmpireTech.call(null);
ok('empireTech ma wpis emp_R', Array.isArray(empireTech.emp_R) && empireTech.emp_R.length > 0);
ok('researched zawiera robotics', empireTech.emp_R.includes('robotics'));

// ═══════════════════════════════════════════════════════════════
// EmpireStrategySystem blacklist — serialize/restore round-trip
// ═══════════════════════════════════════════════════════════════
console.log('--- EmpireStrategySystem serialize/restore blacklist ---');
const ess = new EmpireStrategySystem();
ess._blacklistPlanet('blk_body', 100, ess._config(empireRegistry.get('emp_R')));
const essData = ess.serialize();
ok('serialize.blacklist ma wpis blk_body', essData.blacklist.length === 1 && essData.blacklist[0][0] === 'blk_body');
const ess2 = new EmpireStrategySystem();
ess2.restore(essData);
ok('restore → Map z blk_body', ess2._blacklist instanceof Map && ess2._blacklist.has('blk_body'));
ok('retryAtCivYear zachowany', ess2._blacklist.get('blk_body')?.retryAtCivYear === ess._blacklist.get('blk_body')?.retryAtCivYear);
ess.stop(); ess2.stop();

// Helper: symuluj stan PO ColonyManager.restore (globalny tech, brak ownerEmpireId)
const corrupt = () => {
  for (const c of empireRegistry.getColoniesByEmpire('emp_R')) {
    c.ownerEmpireId = undefined;
    c.techSystem = undefined;
    if (c.buildingSystem) c.buildingSystem.techSystem = techStub;
  }
};

// ═══════════════════════════════════════════════════════════════
// #2 — re-link z empireTech (ścieżka v78: zapisane researched)
// ═══════════════════════════════════════════════════════════════
console.log('--- #2: relinkColoniesAfterRestore(empireTech) ---');
corrupt();
EmpireColonyBootstrap.relinkColoniesAfterRestore(empireTech);
ok('mother.ownerEmpireId === emp_R', mother.ownerEmpireId === 'emp_R');
ok('outpost.ownerEmpireId === emp_R', outpost.ownerEmpireId === 'emp_R');
ok('mother.techSystem ma robotics', mother.techSystem?.isResearched?.('robotics') === true);
ok('mother.buildingSystem.techSystem === mother.techSystem', mother.buildingSystem.techSystem === mother.techSystem);
ok('outpost NIE dostaje aiTech (parytet — outpost tech globalny)', outpost.techSystem == null);

// ═══════════════════════════════════════════════════════════════
// #2 — re-link fallback z archetype.startingTechs (ścieżka stary save: empireTech puste)
// ═══════════════════════════════════════════════════════════════
console.log('--- #2: relink fallback archetype.startingTechs (puste empireTech) ---');
corrupt();
EmpireColonyBootstrap.relinkColoniesAfterRestore({});
const archTechs = ARCHETYPES.industrialist.startingTechs ?? [];
ok('fallback: mother.ownerEmpireId === emp_R', mother.ownerEmpireId === 'emp_R');
ok('fallback: outpost.ownerEmpireId === emp_R', outpost.ownerEmpireId === 'emp_R');
ok('fallback: mother.techSystem ma WSZYSTKIE startingTechs',
   archTechs.length > 0 && archTechs.every(tch => mother.techSystem?.isResearched?.(tch)));

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
