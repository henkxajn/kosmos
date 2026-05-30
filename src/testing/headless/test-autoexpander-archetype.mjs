// ═══════════════════════════════════════════════════════════════
// Test regresji — ColonyAutoExpander obsługuje archetyp 'expansionist'
// Uruchom: node src/testing/headless/test-autoexpander-archetype.mjs
// ───────────────────────────────────────────────────────────────
// Reprodukuje bug S3.1b: Expansionist (klon Industrialist) NIE rozbudowywał
//   kolonii (np. nie stawiał habitatu mimo housing<pop), bo ARCHETYPE_DATA
//   ColonyAutoExpandera zawierał TYLKO 'industrialist' → _managedColonies()
//   filtrował kolonię Expansionisty PRZED ewaluacją jakiejkolwiek reguły.
//
// Po fixie: 'expansionist' zmapowany na te same targets/survival co Industrialist
//   (klon behawioralny rozbudowy kolonii) → kolonia jest obsługiwana.
//
// Harness jak test-multi-ai-spawn: realny ColonyManager + EmpireRegistry +
//   EntityManager + permisywny techStub + STUB starSystemManager.
// ═══════════════════════════════════════════════════════════════

import './env.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }  from '../../systems/ColonyManager.js';
import { EmpireRegistry } from '../../systems/EmpireRegistry.js';
import { EmpireGenerator } from '../../generators/EmpireGenerator.js';
import { ColonyAutoExpander } from '../../systems/ColonyAutoExpander.js';
import EventBus from '../../core/EventBus.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

// ── Harness ──────────────────────────────────────────────────────────────
const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

const mkPlanet = (id, name, systemId) => EntityManager.add({
  id, name, type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 280, deposits: [], systemId,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
mkPlanet('planet_a', 'Alpha I', 'sys_a');
mkPlanet('planet_b', 'Beta I',  'sys_b');

const SYSTEMS = {
  sys_a: { planetIds: ['planet_a'], moonIds: [], planetoidIds: [] },
  sys_b: { planetIds: ['planet_b'], moonIds: [], planetoidIds: [] },
};

const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  timeSystem: { gameTime: 5 },   // gameYear 5 → civYear 60
  colonyManager,
  empireRegistry,
  starSystemManager: { getSystem: (id) => SYSTEMS[id] ?? null },
};

const galaxyData = {
  seed: 4242,
  systems: [
    { id: 'sys_home', isHome: true, x: 0, y: 0,  z: 0, name: 'Dom'   },
    { id: 'sys_a',                  x: 10, y: 0,  z: 0, name: 'Alpha' },
    { id: 'sys_b',                  x: 0,  y: 12, z: 0, name: 'Beta'  },
  ],
};

EmpireGenerator.generate(galaxyData, empireRegistry);
const empires = empireRegistry.listAll();
const indEmp  = empires.find(e => e.archetype === 'industrialist');
const expEmp  = empires.find(e => e.archetype === 'expansionist');

// ═══════════════════════════════════════════════════════════════
// A — _managedColonies() obejmuje OBA archetypy (rdzeń fixu)
// ═══════════════════════════════════════════════════════════════
console.log('--- A: _managedColonies() obejmuje industrialist + expansionist ---');
const expander = new ColonyAutoExpander();
const managed  = expander._managedColonies();
const managedEmpIds = managed.map(c => c.ownerEmpireId);

ok('AutoExpander zarządza dokładnie 2 koloniami AI', managed.length === 2);
ok('kolonia Industrialist (emp_001) jest zarządzana', managedEmpIds.includes(indEmp.id));
ok('kolonia Expansionist (emp_002) jest zarządzana (REGRESJA bug S3.1b)',
   managedEmpIds.includes(expEmp.id));

// ═══════════════════════════════════════════════════════════════
// B — ARCHETYPE_DATA / COOLDOWN: expansionist współdzieli dane Industrialist
// ═══════════════════════════════════════════════════════════════
console.log('--- B: expansionist mapuje na targets/survival Industrialist ---');
const expArch = expander._archetypeOf(expEmp.colonies?.[0] ? colonyManager.getColony(expEmp.colonies[0]) : null);
ok('_archetypeOf zwraca "expansionist" dla kolonii emp_002', expArch === 'expansionist');

// Reflektuj prywatne stałe przez zachowanie: kolonia expansionist po tick dostaje
//   akcję survival/target (czyli reguły są ewaluowane — nie odfiltrowana).
console.log('--- C: tick faktycznie przetwarza kolonię Expansionist ---');
const expColony = colonyManager.getColony(expEmp.colonies[0]);
const indColony = colonyManager.getColony(indEmp.colonies[0]);
// reset markerów akcji (gdyby bootstrap coś ustawił)
delete expColony._caeLastSurvivalAction;
delete expColony._caeLastTargetAction;

EventBus.emit('time:tick', { civDeltaYears: 3, deltaYears: 0.25 });

const expProcessed = !!expColony._caeLastSurvivalAction || !!expColony._caeLastTargetAction
  || !!expColony._caePendingBuilds?.size || !!expColony._caeStockCache;
ok('kolonia Expansionist przetworzona po tick (jakakolwiek akcja AutoExpandera)', expProcessed);

// ═══════════════════════════════════════════════════════════════
// D — Guard nadal działa: nieznany archetyp jest WYKLUCZANY
// ═══════════════════════════════════════════════════════════════
console.log('--- D: filtr nadal odrzuca nieznany archetyp ---');
// Kolonia z ownerEmpireId wskazującym imperium spoza rejestru → archetype undefined.
mkPlanet('planet_x', 'Xeno I', 'sys_a');
colonyManager.colonies = colonyManager.colonies ?? colonyManager._colonies;
const ghostColony = { planetId: 'planet_x', name: 'Xeno I', ownerEmpireId: 'emp_ghost', isOutpost: false };
// Wstrzyknij bez rejestru imperium (reg.get('emp_ghost') === undefined).
const allBefore = colonyManager.getAllColonies();
const origGetAll = colonyManager.getAllColonies.bind(colonyManager);
colonyManager.getAllColonies = () => [...allBefore, ghostColony];
const managed2 = expander._managedColonies();
colonyManager.getAllColonies = origGetAll;  // restore
ok('kolonia o nieznanym archetypie NIE jest zarządzana (guard żyje)',
   !managed2.some(c => c.ownerEmpireId === 'emp_ghost'));
ok('po wstrzyknięciu duch NIE zwiększył liczby zarządzanych (nadal 2)', managed2.length === 2);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
