// ═══════════════════════════════════════════════════════════════
// crewlock_unemployed_invariant_smoke.mjs (Slice 5D INVESTIGATE B — pin)
// Uruch: node src/testing/smoke/crewlock_unemployed_invariant_smoke.mjs
// ───────────────────────────────────────────────────────────────
// Pin inwariantu Phase-2/5C: crew-lock (załoga statku) = employed-and-paid, NIGDY unemployed.
//   population === employed + unemployed  (dokładnie, całkowite)
//   locked ⊆ employed  (_lockedPops ≤ Σstrata)
//   unemployed === population − Σstrata  (locked jest W Σstrata, NIE w unemployed)
// Przez REALNY crew-lock (civ.lockPops), w scenariuszach: pełne zatrudnienie, nadwyżka+mix-lock,
// eviction (roczna realokacja). Filip 5D: podejrzenie „crew wycieka do unemployed" — pin przeciw regresji.
// ═══════════════════════════════════════════════════════════════
import '../headless/env.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }         from '../../systems/ColonyManager.js';
import { EmpireRegistry }        from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { INDUSTRIALIST }         from '../../data/EmpireArchetypeIndustrialist.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

const dep = (resourceId, remaining) => ({ resourceId, richness: 0.6, totalAmount: remaining, remaining });
const techStub = new Proxy({}, { get: (_t, p) => {
  if (p === 'getTerrainUnlocks') return () => [];
  if (p === 'isResearched')      return () => true;
  return () => 1;
}});

const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
const SYSTEMS = { sys_h: { planetIds: ['home_h'], moonIds: [], planetoidIds: [] } };
window.KOSMOS = {
  civMode: true, timeSystem: { gameTime: 0 }, colonyManager, empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: { getSystem: (id) => SYSTEMS[id] ?? null },
  galaxyData: { seed: 1, systems: [{ id: 'sys_h', x: 0, y: 0, z: 0 }] },
};
EntityManager.add({
  id: 'home_h', name: 'Home', type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 280,
  deposits: [dep('Fe', 9e5), dep('Si', 9e5), dep('Cu', 5e5), dep('Ti', 4e5), dep('C', 9e5)],
  systemId: 'sys_h', composition: { Fe: 0.25, Si: 0.2, Cu: 0.05, C: 0.2, O: 0.25 },
});
empireRegistry.createEmpire({ id: 'emp_h', archetype: 'industrialist', homeSystemId: 'sys_h' });
EmpireColonyBootstrap.bootstrapHomeColony('emp_h', INDUSTRIALIST, 'sys_h');
const civ = colonyManager.getColony('home_h').civSystem;
window.KOSMOS.civSystem = civ;

// Trzy inwarianty na bieżącym stanie.
function invariants(tag) {
  const pop = civ.population, sc = civ._strataCount, lp = civ._lockedPops;
  const emp = civ.employed, un = civ.unemployed;
  ok(`${tag}: population === employed + unemployed (${pop}===${emp}+${un})`, pop === emp + un);
  ok(`${tag}: locked ⊆ employed (${lp.toFixed(2)} ≤ ${emp})`, lp <= emp + 1e-9);
  ok(`${tag}: unemployed === pop − Σstrata (crew POZA unemployed)`, un === pop - sc);
  return { pop, sc, lp, emp, un, fp: civ.freePops };
}

// ── Scenariusz 1: pełne zatrudnienie + lock(3, laborer) ──
civ._allocateWorkforce();
const a0 = invariants('S1 przed lock');
civ.lockPops(3, 'laborer');
invariants('S1 po lock(3)');
civ._allocateWorkforce();
const a1 = invariants('S1 po realloc');
ok('S1: lock NIE zmienił unemployed (crew nie wyciekł)', a1.un === a0.un);
ok('S1: freePops SPADŁO o ~lock (crew niedostępny do rekrutacji)', a1.fp <= a0.fp);

// ── Scenariusz 2: nadwyżka populacji (bezrobocie) + mix-lock(7) + eviction ──
civ.unlockPops(3, 'laborer');
civ.setPopulation(30);
civ._allocateWorkforce();
const b0 = invariants('S2 pop=30 przed lock (bezrobocie>0)');
ok('S2: jest realne bezrobocie (un>0)', b0.un > 0);
civ.lockPops(7, 'mix');                 // ułamkowy rozkład przez _distributeLock
const b1 = invariants('S2 po mix-lock(7)');
civ._allocateWorkforce();               // eviction + floor-normalizacja (Phase-3 BUG3 ścieżka)
const b2 = invariants('S2 po realloc (eviction)');
ok('S2: unemployed NIEZMIENIONY przez lock (11→11 — crew nie wyciekł)', b1.un === b0.un && b2.un === b0.un);
ok('S2: locked ⊆ employed po eviction (crew nie eksmitowany)', b2.lp <= b2.emp + 1e-9);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
