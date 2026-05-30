// ═══════════════════════════════════════════════════════════════
// Smoke test — S3.1b: breathable home AI (fix bug B u źródła)
// Uruchom: node src/testing/headless/test-breathable-home.mjs
// ───────────────────────────────────────────────────────────────
//   A: SystemGenerator.makeHomeworldBreathable — unit (atmosfera + temp)
//   B: CivilizationSystem._updatePopGrowth — wzrost ZAMROŻONY na non-breathable
//      (pop≥housing), ODBLOKOWANY po makeHomeworldBreathable (canLiveOutside)
//   C: EmpireColonyBootstrap.bootstrapHomeColony — home AI założony na planecie
//      'none' wychodzi jako breathable (parytet z sys_home gracza)
//
// Harness jak test-bootstrap-colony / test-multi-ai-spawn: realny
//   EntityManager + ColonyManager + EmpireRegistry + permisywny techStub +
//   STUB starSystemManager (getSystem fast-path → bez heavy SystemGenerator).
// Per [[live-game-mandatory-gate]] — smoke gate'uje logikę; żywa gra osobno.
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first — shim localStorage/window/THREE
import EntityManager from '../../core/EntityManager.js';
import { SystemGenerator }       from '../../generators/SystemGenerator.js';
import { CivilizationSystem }     from '../../systems/CivilizationSystem.js';
import { ColonyManager }          from '../../systems/ColonyManager.js';
import { EmpireRegistry }         from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap }  from '../../systems/EmpireColonyBootstrap.js';
import { INDUSTRIALIST }          from '../../data/EmpireArchetypeIndustrialist.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};

// ── Permisywny techStub (mnożniki=1, isResearched=true) ───────────
const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

// ═══════════════════════════════════════════════════════════════
// A — makeHomeworldBreathable (unit, deterministyczny zakres temp)
// ═══════════════════════════════════════════════════════════════
console.log('--- A: makeHomeworldBreathable wymusza breathable + temp Earth-like ---');

const p1 = { atmosphere: 'none', temperatureK: 240 };        // zimna, brak atmo
SystemGenerator.makeHomeworldBreathable(p1);
ok('A1 none→breathable + flaga', p1.atmosphere === 'breathable' && p1.breathableAtmosphere === true);
ok('A1 temp Earth-like [5,30]°C', p1.temperatureC >= 5 && p1.temperatureC <= 30);
ok('A1 temperatureK spójne z C', Math.abs(p1.temperatureK - (p1.temperatureC + 273.15)) < 0.001);
ok('A1 surface.temperature ustawione', p1.surface?.temperature === p1.temperatureC);

const p2 = { atmosphere: 'thin', temperatureK: 290 };        // umiarkowana
SystemGenerator.makeHomeworldBreathable(p2);
ok('A2 thin→breathable + temp [5,30]', p2.atmosphere === 'breathable' && p2.temperatureC >= 5 && p2.temperatureC <= 30);

const p3 = { atmosphere: 'dense', temperatureK: 350 };       // gorąca (greenhouse 60)
SystemGenerator.makeHomeworldBreathable(p3);
ok('A3 dense(hot)→breathable + clamp [5,30]', p3.atmosphere === 'breathable' && p3.temperatureC >= 5 && p3.temperatureC <= 30);

const p4 = { atmosphere: 'none' };                           // brak temperatureK → fallback 15°C
SystemGenerator.makeHomeworldBreathable(p4);
ok('A4 brak temperatureK → 15°C / 288.15K', p4.atmosphere === 'breathable' && p4.temperatureC === 15 && p4.temperatureK === 288.15);

const p5 = { atmosphere: 'none', temperatureK: 300 };        // brak surface → utworzone
SystemGenerator.makeHomeworldBreathable(p5);
ok('A5 surface utworzone gdy brak', !!p5.surface && typeof p5.surface.temperature === 'number');

const p6 = { atmosphere: 'none', temperatureK: 260 };        // idempotencja
SystemGenerator.makeHomeworldBreathable(p6);
SystemGenerator.makeHomeworldBreathable(p6);
ok('A6 idempotent (zostaje breathable, temp w zakresie)',
   p6.atmosphere === 'breathable' && p6.temperatureC >= 5 && p6.temperatureC <= 30);

ok('A7 null-safe (brak throw)', (() => {
  try { SystemGenerator.makeHomeworldBreathable(null); return true; } catch { return false; }
})());

// ═══════════════════════════════════════════════════════════════
// B — wzrost: non-breathable ZAMROŻONY → breathable ODBLOKOWANY
// ═══════════════════════════════════════════════════════════════
console.log('--- B: _updatePopGrowth — guard canLiveOutside (pop≥housing) ---');

globalThis.window = globalThis.window ?? {};
window.KOSMOS = { timeSystem: { gameTime: 0 } };  // minimal — optional chaining w growth

const planetNB = { id: 'p_nb', atmosphere: 'none', temperatureK: 250 };
const civ = new CivilizationSystem({ population: 5, housing: 5 }, techStub, planetNB);
ok('B0 population===5, housing===5', civ.population === 5 && civ.housing === 5);
ok('B0b effectiveHousing===5 (nie home)', civ.effectiveHousing === 5);

const gp0 = civ._growthProgress;
civ._updatePopGrowth(1.0);  // dobry foodRatio (1.0)
ok('B1 non-breathable + pop≥housing → wzrost ZAMROŻONY (progress bez zmian, _lastGrowth=0)',
   civ._growthProgress === gp0 && civ._lastGrowth === 0);

SystemGenerator.makeHomeworldBreathable(planetNB);  // FIX in-place na tej samej ref
ok('B2 planeta po fixie → breathable (civ.planet ta sama ref)',
   planetNB.atmosphere === 'breathable' && civ.planet.atmosphere === 'breathable');

const gp1 = civ._growthProgress;
civ._updatePopGrowth(1.0);
ok('B3 breathable → wzrost ODBLOKOWANY (_growthProgress rośnie)', civ._growthProgress > gp1);

// ═══════════════════════════════════════════════════════════════
// C — integracja: bootstrapHomeColony na planecie 'none' → breathable
// ═══════════════════════════════════════════════════════════════
console.log('--- C: bootstrapHomeColony — home AI none → breathable ---');

const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();

EntityManager.add({
  id: 'home_nb', name: 'NonBreath I', type: 'planet', planetType: 'rocky',
  radius: 1, mass: 1, atmosphere: 'none', temperatureK: 240, deposits: [],
  systemId: 'sys_nb', composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
const sysData = { planetIds: ['home_nb'], moonIds: [], planetoidIds: [] };

window.KOSMOS = {
  timeSystem: { gameTime: 0 },
  colonyManager,
  empireRegistry,
  starSystemManager: { getSystem: (id) => (id === 'sys_nb' ? sysData : null) },
};

empireRegistry.createEmpire({ id: 'emp_nb', archetype: 'industrialist', homeSystemId: 'sys_nb' });
const colId = EmpireColonyBootstrap.bootstrapHomeColony('emp_nb', INDUSTRIALIST, 'sys_nb');
ok('C1 bootstrapHomeColony zwrócił colonyId', !!colId);

const homeEnt = EntityManager.get('home_nb');
ok('C2 home planet atmosphere none → breathable', homeEnt.atmosphere === 'breathable');
ok('C3 home planet temp Earth-like [5,30]°C', homeEnt.temperatureC >= 5 && homeEnt.temperatureC <= 30);

const col = colonyManager.getColony('home_nb');
ok('C4 kolonia istnieje + civSystem.planet widzi breathable',
   !!col && col.civSystem?.planet?.atmosphere === 'breathable');

// ═══════════════════════════════════════════════════════════════
// D — regresja ścieżki gracza: dedup helpera NIE zepsuł generateCivScenario.
//     (test-boot.js nie biega headless — ciągnie 'three' przez renderer chain;
//      tu pokrywamy player breathable+lifeScore bez rendererów.)
// ═══════════════════════════════════════════════════════════════
console.log('--- D: generateCivScenario (gracz) nadal breathable + lifeScore=100 ---');
{
  const gen = new SystemGenerator();
  const result = gen.generateCivScenario();
  const civPlanet = result.planets.find(p => p.id === result.civPlanetId);
  ok('D1 civPlanetId wskazuje planetę', !!civPlanet);
  ok('D2 planeta cyw. breathable (przez helper)', civPlanet?.atmosphere === 'breathable');
  ok('D3 lifeScore===100 (zachowane poza helperem)', civPlanet?.lifeScore === 100);
  ok('D4 temp Earth-like [5,30]°C', civPlanet?.temperatureC >= 5 && civPlanet?.temperatureC <= 30);
}

// ═══════════════════════════════════════════════════════════════
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
