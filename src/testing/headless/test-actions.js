// Test Step 4 — ActionAdapter + ActionCatalog
import './env.js';
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';
import { ActionCatalog } from '../actions/ActionCatalog.js';
import ActionAdapter, { ACTION_TYPES } from '../actions/ActionAdapter.js';

console.log('─── ActionCatalog/Adapter Test Step 4 ───');

const core = new GameCore();
core.boot({ quiet: true });

const catalog = new ActionCatalog({
  colonyManager: core.colonyManager,
  techSystem: core.techSystem,
  resourceSystem: core.resourceSystem,
  buildingSystem: core.buildingSystem,
  vesselManager: core.vesselManager,
  civSystem: core.civSystem,
  starSystemManager: core.starSystemManager,
});

// Licz akcje na starcie
const counts0 = catalog.getCounts();
console.log(`\nAkcje na starcie (civYear 0):`);
for (const [k, v] of Object.entries(counts0)) console.log(`  ${k}: ${v}`);

// Zasymuluj 30 civYears żeby zobaczyć jak zmieniają się akcje
const ticker = new Ticker(core.timeSystem);
ticker.run(30, { tickSize: 1.0 });

const counts30 = catalog.getCounts();
console.log(`\nAkcje po 30 civYears:`);
for (const [k, v] of Object.entries(counts30)) console.log(`  ${k}: ${v}`);

// Test: wykonaj akcję build (pierwsza legalna) — sprawdź czy handler zadziała
let buildResult = null;
const unsub = () => {};
import('../../core/EventBus.js').then(mod => {
  const EventBus = mod.default;
  EventBus.on('planet:buildResult', (data) => { buildResult = data; });

  const buildActions = catalog.listBuildActions({ limit: 5 });
  console.log(`\nPrzykładowe legalne akcje build (${buildActions.length}):`);
  for (const a of buildActions) {
    console.log(`  build ${a.buildingId} na ${a.tile.key} (${a.tile.type})`);
  }

  if (buildActions.length > 0) {
    const result = ActionAdapter.execute(buildActions[0]);
    console.log(`\nExecute pierwszej akcji: ${JSON.stringify(result)}`);
    console.log(`Odpowiedź z BuildingSystem: ${JSON.stringify(buildResult)}`);
  }

  // Test sample() — powinien zwrócić różne akcje
  console.log(`\nPróbkowanie 10 losowych akcji (sample):`);
  const sampled = [];
  for (let i = 0; i < 10; i++) {
    const a = catalog.sample();
    sampled.push(a.type);
  }
  console.log(`  ${sampled.join(', ')}`);

  // Asserts
  const tests = [];
  tests.push(['build actions available', counts0.build > 0]);
  tests.push(['research actions available', counts0.research > 0]);
  tests.push(['build action executed', buildResult !== null]);
  tests.push(['sample returns varied', new Set(sampled).size >= 2]);
  tests.push(['can execute WAIT', ActionAdapter.execute({ type: ACTION_TYPES.WAIT }).emitted]);

  console.log('');
  let fail = 0;
  for (const [name, ok] of tests) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
    if (!ok) fail++;
  }
  console.log(`\n${fail === 0 ? '✅ STEP 4 SUCCESS' : `❌ STEP 4 FAILED (${fail}/${tests.length})`}`);
  process.exit(fail === 0 ? 0 : 1);
});
