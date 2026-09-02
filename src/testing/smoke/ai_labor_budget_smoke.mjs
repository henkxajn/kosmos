// KEEPER — S4a / Finding 233: BUDŻET PRACY ekspandera (D-S4-1: odczyt „workers", margines +2).
// Uruchom: node src/testing/smoke/ai_labor_budget_smoke.mjs
//
// REGUŁA: nie buduj i nie ulepszaj, jeśli WYNIKOWE job-units warstwy (`getSlotDemand` = jobs × level)
// przekroczyłyby pracowników TEJ WARSTWY + 2.
//
//   T1  NIEJAŁOWOŚĆ — fixture MUSI być realnie ponad budżetem (popyt > workers + 2), inaczej
//       T3/T6 porównują „przeszło" z „przeszło".
//   T2  KONTROLA PINU — flaga OFF: budowa i ulepszenie dochodzą do BuildingSystem (stan sprzed S4).
//   T3  NAPRAWA — flaga ON + ponad budżetem: BUDOWA zablokowana, outcome `no_labor`.
//   T6  POMPA — flaga ON + ponad budżetem: ULEPSZENIE zablokowane (to ~98 % realnych blokad).
//   T4  NIE JEST ŚLEPA — w granicach budżetu przechodzi (reguła nie jest po prostu „nigdy").
//   T5  HOUSING POZA REGUŁĄ — habitat (jobs=0) przechodzi nawet przy ZERO robotnikach; inaczej
//       zamroziłby wzrost populacji, czyli jedyne źródło przyszłych rąk.
//   T7  FAIL-OPEN — kolonia o nierozpoznanym kształcie (bez buildingSystem/strat) nie jest blokowana.
//   T8  PIN ŹRÓDŁOWY — margines jest NAZWANĄ STAŁĄ (=2), nie liczbą wklejoną w warunek.
//   T9  KONTRAKT WYNIKU — `no_labor` NIE jest sukcesem i NIE jest `fail`, więc wołający próbuje
//       następny budynek i NIE nakłada 30-letniego backoffu unreachable.
//
// ⚠ AI-ONLY Z KONSTRUKCJI, i to jest pinowane GDZIE INDZIEJ: `_managedColonies` odsiewa kolonie
//   gracza i placówki (`colony_auto_expander_smoke` A-D). Ta reguła nie ma i nie potrzebuje
//   terminu własności — inaczej niż S1.

import '../headless/env.js'; // MUST be first
import { readFileSync } from 'node:fs';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { EmpireRegistry } from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { ColonyAutoExpander } from '../../systems/ColonyAutoExpander.js';
import { INDUSTRIALIST } from '../../data/EmpireArchetypeIndustrialist.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { BUILDINGS } from '../../data/BuildingsData.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const F = () => GAME_CONFIG.FEATURES;

const dep = (resourceId, remaining, richness = 0.6) => ({ resourceId, richness, totalAmount: remaining, remaining });
const techStub = new Proxy({}, { get: (_t, p) => p === 'getTerrainUnlocks' ? () => [] : p === 'isResearched' ? () => true : () => 1 });

EntityManager.add({
  id: 'cap', name: 'Stolica', type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 288, temperatureC: 15, surfaceGravity: 1.0,
  deposits: [dep('Fe', 9e5), dep('Si', 9e5), dep('Cu', 5e5), dep('C', 9e5)],
  systemId: 'sys', composition: { Fe: 0.25, Si: 0.2, Cu: 0.05, C: 0.2, O: 0.25 },
});
const colonyManager = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  civMode: true, timeSystem: { gameTime: 5 }, colonyManager, empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: { getSystem: (id) => id === 'sys' ? { planetIds: ['cap'], moonIds: [], planetoidIds: [] } : null },
  galaxyData: { seed: 1, systems: [{ id: 'sys', x: 0, y: 0, z: 0 }] },
};
empireRegistry.createEmpire({ id: 'emp_001', archetype: 'industrialist', homeSystemId: 'sys' });
EmpireColonyBootstrap.bootstrapHomeColony('emp_001', INDUSTRIALIST, 'sys');

const expander = new ColonyAutoExpander();
const colony = colonyManager.getColony('cap');
const bs = colony.buildingSystem, civ = colony.civSystem;

/** Ile razy decyzja doszła do BuildingSystem (szpieg — mierzy MECHANIZM, nie skutek uboczny). */
function callsWith(fn) {
  let b = 0, u = 0;
  const oB = bs._build.bind(bs), oU = bs._upgrade.bind(bs);
  bs._build = (...a) => { b++; return oB(...a); };
  bs._upgrade = (...a) => { u++; return oU(...a); };
  const r = fn();
  bs._build = oB; bs._upgrade = oU;
  return { builds: b, upgrades: u, ret: r };
}
const setWorkers = (n) => { for (const s of Object.values(civ.strata)) s.count = 0; civ.strata.laborer.count = n; civ._unemployed = 0; bs._reapplyAllRates(); };

// ════════════════════════════════════════════════════════════════════════════
console.log('--- T1: NIEJALOWOSC — fixture realnie PONAD budzetem ---');
setWorkers(0);
const dem = bs.getSlotDemand('laborer');
const solarJobs = BUILDINGS['solar_farm'].jobs ?? 0;
ok('T1a warstwa laborer ma popyt > 0 (' + dem + ')', dem > 0);
ok('T1b przy 0 robotnikach wynikowy popyt (' + (dem + solarJobs) + ') PRZEKRACZA budzet workers+2 (2)',
   (dem + solarJobs) > (0 + 2));
ok('T1c solar_farm realnie niesie etat (inaczej regula go nie widzi)', solarJobs > 0);

console.log('--- T2: KONTROLA PINU — flaga OFF = stan sprzed S4 ---');
F().aiLaborBudget = false;
{
  const a = callsWith(() => expander._tryBuild(colony, 'solar_farm', { civYear: 60 }));
  const b = callsWith(() => expander._tryUpgrade(colony, 'solar_farm', 3, { civYear: 60 }));
  ok('T2a flaga OFF: BUDOWA dochodzi do BuildingSystem', a.builds === 1);
  ok('T2b flaga OFF: ULEPSZENIE dochodzi do BuildingSystem', b.upgrades === 1);
}

console.log('--- T3/T6: NAPRAWA — flaga ON, ponad budzetem: budowa I ulepszenie zablokowane ---');
F().aiLaborBudget = true;
setWorkers(0);
{
  const a = callsWith(() => expander._tryBuild(colony, 'solar_farm', { civYear: 60 }));
  ok('T3a BUDOWA nie dochodzi do BuildingSystem', a.builds === 0);
  ok('T3b outcome = no_labor (powod nazwany, nie udawany brak kafelka)', a.ret === 'no_labor');
  const b = callsWith(() => expander._tryUpgrade(colony, 'solar_farm', 3, { civYear: 60 }));
  ok('T6a ULEPSZENIE nie dochodzi do BuildingSystem (~98% realnych blokad)', b.upgrades === 0);
  ok('T6b outcome = no_labor', b.ret === 'no_labor');
}

console.log('--- T4: REGULA NIE JEST SLEPA — w granicach budzetu przechodzi ---');
{
  setWorkers(bs.getSlotDemand('laborer') + 5);   // robotnikow z zapasem ponad popyt
  const a = callsWith(() => expander._tryBuild(colony, 'solar_farm', { civYear: 60 }));
  ok('T4 przy nadmiarze robotnikow BUDOWA przechodzi mimo flagi ON', a.builds === 1);
}

console.log('--- T5: HOUSING POZA REGULA (habitat jobs=0) ---');
{
  setWorkers(0);
  ok('T5-kontrola pinu: habitat naprawde ma jobs === 0', (BUILDINGS['habitat'].jobs ?? -1) === 0);
  const a = callsWith(() => expander._tryBuild(colony, 'habitat', { civYear: 60 }));
  ok('T5 habitat przechodzi przy ZERO robotnikow — wzrost populacji nie jest zamrazany', a.builds === 1);
}

console.log('--- T7: FAIL-OPEN dla nierozpoznanego ksztaltu koloni ---');
{
  ok('T7a kolonia bez buildingSystem NIE jest blokowana',
     expander._overLaborBudget({ civSystem: civ }, 'solar_farm') === false);
  ok('T7b kolonia bez strat NIE jest blokowana',
     expander._overLaborBudget({ buildingSystem: bs }, 'solar_farm') === false);
  ok('T7c nieznany budynek NIE jest blokowany', expander._overLaborBudget(colony, 'nie_ma_takiego') === false);
}

console.log('--- T8/T9: PIN ZRODLOWY marginesu + KONTRAKT WYNIKU ---');
{
  const src = readFileSync(new URL('../../systems/ColonyAutoExpander.js', import.meta.url), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('T8-kontrola pinu: zrodlo po zdjeciu komentarzy zawiera _overLaborBudget', /_overLaborBudget/.test(src));
  ok('T8 margines jest NAZWANA STALA = 2 (miejsce do strojenia jest jedno)',
     /const\s+LABOR_BUDGET_MARGIN\s*=\s*2\s*;/.test(src));
  ok('T8b warunek uzywa stalej, nie wklejonej liczby', /workers\s*\+\s*LABOR_BUDGET_MARGIN/.test(src));
  ok('T9a no_labor NIE jest sukcesem budowy', expander._isBuildSuccess('no_labor') === false);
  // ⚠ PIERWSZA WERSJA T9b BYLA TAUTOLOGIA ('no_labor' !== 'fail') — pin, ktory nie moze paść,
  //   nie jest pinem. Pytanie brzmi: czy WOLAJACY nakłada backoff wylacznie na 'fail'?
  ok('T9b wolajacy nakłada backoff unreachable WYLACZNIE na outcome "fail" (a nasz jest inny)',
     /outcome\s*===\s*'fail'/.test(src) && !/outcome\s*===\s*'no_labor'/.test(src));
  ok('T9c ... i jest to sprawdzalne: markUnreachable wystepuje w zrodle (kontrola pinu)',
     /_markUnreachable\s*\(/.test(src));
}

F().aiLaborBudget = true;
console.log('\n=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail ? 1 : 0);
