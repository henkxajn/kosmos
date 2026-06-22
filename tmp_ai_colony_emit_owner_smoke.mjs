// Smoke: właściciel kolonii AI znany PRZY EMICIE 'colony:founded'/'outpost:founded'.
// Regresja przecieku: createColony/createOutpost emitowały zdarzenie z ownerEmpireId=null,
// a bootstrap AI ustawiał właściciela DOPIERO po powrocie → widoki gracza (auto-open panelu,
// EventLog) traktowały kolonię AI jak własną i ujawniały „okno nowej planety".
// Harness: realny ColonyManager + EntityManager (wzór test-bootstrap-colony.mjs).

import './src/testing/headless/env.js'; // MUST be first — shim localStorage/window/THREE
import EventBus      from './src/core/EventBus.js';
import EntityManager from './src/core/EntityManager.js';
import { ColonyManager }        from './src/systems/ColonyManager.js';
import { EmpireRegistry }       from './src/systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from './src/systems/EmpireColonyBootstrap.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

// Permisywny techStub (mnożniki=1, isResearched=true)
const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

const mkPlanet = (id, name) => EntityManager.add({
  id, name, type: 'planet', planetType: 'rocky',
  radius: 1.0, mass: 1.0, atmosphere: 'breathable',
  temperatureK: 280, deposits: [], systemId: 'sys_test',
  composition: { Fe: 0.3, Si: 0.3, O: 0.4 },
});
mkPlanet('p_player', 'Planeta Gracza');
mkPlanet('p_ai_col', 'Planeta AI Kolonia');
mkPlanet('p_ai_out', 'Planeta AI Outpost');
mkPlanet('p_ai_home', 'Planeta AI Stolica');

const colonyManager  = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
window.KOSMOS = {
  colonyManager, empireRegistry,
  timeSystem: { gameTime: 100 },
  activeSystemId: 'sys_test',
};
empireRegistry.createEmpire({ id: 'empire_7', name: 'Imperium 7', archetype: 'trader', homeSystemId: 'sys_test' });

// Łap ownerEmpireId DOKŁADNIE w chwili emitu (nie po powrocie z funkcji).
let foundedOwner = '__unset__';
let outpostOwner = '__unset__';
EventBus.on('colony:founded',  ({ colony }) => { foundedOwner = colony?.ownerEmpireId ?? null; });
EventBus.on('outpost:founded', ({ colony }) => { outpostOwner = colony?.ownerEmpireId ?? null; });

// T1 — kolonia gracza: brak ownerEmpireId → emit z null (gracz widzi).
colonyManager.createColony('p_player', { food: 200, water: 200 }, 2, 100);
ok(foundedOwner === null, `T1: kolonia gracza emit ownerEmpireId=null (jest ${foundedOwner})`);

// T2 — kolonia AI bezpośrednio: ownerEmpireId ustawiony PRZY emicie.
foundedOwner = '__unset__';
colonyManager.createColony('p_ai_col', { food: 200, water: 200 }, 2, 100, 'empire_7');
ok(foundedOwner === 'empire_7', `T2: kolonia AI emit ownerEmpireId=empire_7 (jest ${foundedOwner})`);
ok(ColonyManager.isPlayerColony(colonyManager.getColony('p_ai_col')) === false, 'T3: kolonia AI = nie-gracz (guard ukryje)');

// T4 — outpost AI bezpośrednio: ownerEmpireId ustawiony PRZY emicie.
colonyManager.createOutpost('p_ai_out', {}, 100, 'empire_7');
ok(outpostOwner === 'empire_7', `T4: outpost AI emit ownerEmpireId=empire_7 (jest ${outpostOwner})`);

// T5 — bootstrapColony (realna ścieżka AI): emit z właścicielem, nie null.
foundedOwner = '__unset__';
try {
  EmpireColonyBootstrap.bootstrapColony('empire_7', 'sys_test', 'p_ai_home', {
    startPop: { laborer: 1, worker: 1 },
    startResources: { food: 200, water: 200, Fe: 100 },
    archetypeId: 'trader',
  });
  ok(foundedOwner === 'empire_7', `T5: bootstrapColony emit ownerEmpireId=empire_7 (jest ${foundedOwner})`);
} catch (e) {
  ok(false, `T5: bootstrapColony rzucił: ${e.message}`);
}

console.log(`\n${pass}/${pass + fail} PASS` + (fail ? ` — ${fail} FAIL` : ''));
process.exit(fail ? 1 : 0);
