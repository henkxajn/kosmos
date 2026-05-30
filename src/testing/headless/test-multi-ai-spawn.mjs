// ═══════════════════════════════════════════════════════════════
// Smoke test — Slice 3.1a: Multi-AI spawn + szkielet Expansionist
// Uruchom: node src/testing/headless/test-multi-ai-spawn.mjs
// ───────────────────────────────────────────────────────────────
//   A: Expansionist = KLON Industrialist (różni się tylko tożsamością)
//   B: rejestracja archetypu (ARCHETYPES, NAME_PREFIXES, AI_ARCHETYPE_SEQUENCE)
//   C: EmpireGenerator.generate → 2 imperia AI, różne archetypy, różne home-systemy
//
// Harness jak test-bootstrap-colony: realny ColonyManager + EmpireRegistry +
//   EntityManager + permisywny techStub + STUB starSystemManager (getSystem
//   idempotent fast-path → bez heavy SystemGenerator).
// Per [[live-game-mandatory-gate]] — smoke gate'uje logikę; żywa gra osobno.
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first — shim localStorage/window/THREE
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager }  from '../../systems/ColonyManager.js';
import { EmpireRegistry } from '../../systems/EmpireRegistry.js';
import { EmpireGenerator, AI_ARCHETYPE_SEQUENCE } from '../../generators/EmpireGenerator.js';
import { ARCHETYPES, NAME_PREFIXES_PL, NAME_PREFIXES_EN } from '../../data/EmpireData.js';
import { INDUSTRIALIST } from '../../data/EmpireArchetypeIndustrialist.js';
import { EXPANSIONIST }  from '../../data/EmpireArchetypeExpansionist.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

// ═══════════════════════════════════════════════════════════════
// A — Expansionist = klon Industrialist (różni się TYLKO tożsamością)
// ═══════════════════════════════════════════════════════════════
console.log('--- A: Expansionist = klon Industrialist POZA maxExtraSystems (S3.1b) ---');
const IDENTITY = new Set(['id', 'namePL', 'nameEN', 'descPL', 'descEN', 'color']);
const behavioralKeys = Object.keys(INDUSTRIALIST).filter(k => !IDENTITY.has(k));

// S3.1b: jedyna RÓŻNICA behawioralna to strategicColonization.maxExtraSystems (Exp=2, Ind=0).
//   Reszta pól (w tym pozostałe klucze strategicColonization) IDENTYCZNA z klona S3.1a.
let allBehavioralEqual = true;
for (const k of behavioralKeys) {
  let expVal = EXPANSIONIST[k];
  let indVal = INDUSTRIALIST[k];
  if (k === 'strategicColonization') {
    const { maxExtraSystems: _e, ...expRest } = expVal ?? {};
    const { maxExtraSystems: _i, ...indRest } = indVal ?? {};
    expVal = expRest; indVal = indRest;   // porównaj POZA maxExtraSystems
  }
  if (JSON.stringify(expVal) !== JSON.stringify(indVal)) {
    allBehavioralEqual = false;
    console.error(`     różnica w polu behawioralnym: ${k}`);
  }
}
ok('pola behawioralne identyczne z Industrialist POZA maxExtraSystems', allBehavioralEqual);
ok('strategicColonization.maxExtraSystems: Exp=2, Ind=0',
   EXPANSIONIST.strategicColonization.maxExtraSystems === 2 &&
   INDUSTRIALIST.strategicColonization.maxExtraSystems === 0);
ok('te same klucze co INDUSTRIALIST',
   JSON.stringify(Object.keys(EXPANSIONIST).sort()) === JSON.stringify(Object.keys(INDUSTRIALIST).sort()));
ok('id === expansionist', EXPANSIONIST.id === 'expansionist');
ok('namePL/nameEN różne od Industrialist',
   EXPANSIONIST.namePL !== INDUSTRIALIST.namePL && EXPANSIONIST.nameEN !== INDUSTRIALIST.nameEN);
ok('color różny od Industrialist (odróżnialny w UI)', EXPANSIONIST.color !== INDUSTRIALIST.color);
// Deep clone (NIE shared ref) — forward-safe pod S3.1b/S3.2 (tweaki nie mutują Industrialist)
ok('strategicColonization to NIEZALEŻNY obiekt (deep clone)',
   EXPANSIONIST.strategicColonization !== INDUSTRIALIST.strategicColonization);
ok('personality to NIEZALEŻNY obiekt (deep clone)',
   EXPANSIONIST.personality !== INDUSTRIALIST.personality);
ok('startingBuildings to NIEZALEŻNA tablica (deep clone)',
   EXPANSIONIST.startingBuildings !== INDUSTRIALIST.startingBuildings);

// ═══════════════════════════════════════════════════════════════
// B — rejestracja archetypu + sekwencja AI
// ═══════════════════════════════════════════════════════════════
console.log('--- B: rejestracja ARCHETYPES + AI_ARCHETYPE_SEQUENCE ---');
ok('ARCHETYPES.expansionist === EXPANSIONIST', ARCHETYPES.expansionist === EXPANSIONIST);
ok('ARCHETYPES.industrialist === INDUSTRIALIST', ARCHETYPES.industrialist === INDUSTRIALIST);
ok('AI_ARCHETYPE_SEQUENCE = [industrialist, expansionist]',
   JSON.stringify(AI_ARCHETYPE_SEQUENCE) === JSON.stringify(['industrialist', 'expansionist']));
ok('NAME_PREFIXES_PL.expansionist istnieje (≥1)',
   Array.isArray(NAME_PREFIXES_PL.expansionist) && NAME_PREFIXES_PL.expansionist.length > 0);
ok('NAME_PREFIXES_EN.expansionist istnieje (≥1)',
   Array.isArray(NAME_PREFIXES_EN.expansionist) && NAME_PREFIXES_EN.expansionist.length > 0);

// ═══════════════════════════════════════════════════════════════
// C — EmpireGenerator.generate → 2 imperia AI (różne archetypy + home)
// ═══════════════════════════════════════════════════════════════
console.log('--- C: EmpireGenerator.generate → 2 imperia AI ---');

const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

// Planeta home (rocky → _pickHomePlanet preferuje) per kandydat
const mkPlanet = (id, name, systemId) => EntityManager.add({
  id, name, type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 280, deposits: [], systemId,
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
mkPlanet('planet_a', 'Alpha I', 'sys_a');
mkPlanet('planet_b', 'Beta I',  'sys_b');

// Stub starSystemManager — getSystem zwraca pre-registered system (idempotent
//   fast-path w _ensureSystemGenerated → generateAndRegister NIE wołane).
const SYSTEMS = {
  sys_a: { planetIds: ['planet_a'], moonIds: [], planetoidIds: [] },
  sys_b: { planetIds: ['planet_b'], moonIds: [], planetoidIds: [] },
};

const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  timeSystem: { gameTime: 0 },
  colonyManager,
  empireRegistry,
  starSystemManager: { getSystem: (id) => SYSTEMS[id] ?? null },
};

// Minimal galaktyka: home + 2 kandydaci w MIN_LY(5)..MAX_LY(30)
const galaxyData = {
  seed: 4242,
  systems: [
    { id: 'sys_home', isHome: true, x: 0, y: 0,  z: 0, name: 'Dom'   },
    { id: 'sys_a',                  x: 10, y: 0,  z: 0, name: 'Alpha' },  // 10 LY
    { id: 'sys_b',                  x: 0,  y: 12, z: 0, name: 'Beta'  },  // 12 LY
  ],
};

const createdIds = EmpireGenerator.generate(galaxyData, empireRegistry);
ok('utworzono 2 imperia AI', createdIds.length === 2);

const empires    = empireRegistry.listAll();
const archetypes = empires.map(e => e.archetype).sort();
ok('archetypy = [expansionist, industrialist] (po jednym z każdego)',
   JSON.stringify(archetypes) === JSON.stringify(['expansionist', 'industrialist']));

const homes = empires.map(e => e.homeSystemId);
ok('różne homeSystemId (2 odrębne układy)', new Set(homes).size === 2);
ok('home-systemy ∈ {sys_a, sys_b}', homes.every(h => h === 'sys_a' || h === 'sys_b'));

// Każde imperium ma realną kolonię (owner + systemId zgodne z home)
let allHaveColony = true;
for (const e of empires) {
  const colId = e.colonies?.[0];
  const col   = colId ? colonyManager.getColony(colId) : null;
  if (!col || col.ownerEmpireId !== e.id || col.systemId !== e.homeSystemId) {
    allHaveColony = false;
    console.error(`     ${e.id} (${e.archetype}): kolonia=${!!col} owner=${col?.ownerEmpireId} sys=${col?.systemId} home=${e.homeSystemId}`);
  }
}
ok('każde imperium ma kolonię (ownerEmpireId + systemId zgodne)', allHaveColony);

// Expansionist faktycznie zbootstrapował się z klonowanego archetypu
const expEmp = empires.find(e => e.archetype === 'expansionist');
ok('Expansionist ma kolonię (bootstrap z ARCHETYPES.expansionist)',
   !!expEmp && (expEmp.colonies?.length ?? 0) >= 1);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
