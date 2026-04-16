// Test Step 9 — ScriptedBot z 2 skryptami
import './env.js';
import { readFileSync } from 'node:fs';
import { ScriptedBot } from '../bots/ScriptedBot.js';
import { Reporter } from '../analytics/Reporter.js';
import { runSingleGame } from '../runner/SingleGame.js';
import { createStandardDetectors } from '../analytics/BottleneckDetector.js';

console.log('─── ScriptedBot Test Step 9 ───');

const SCRIPTS_DIR = 'E:/programy/claude_kody/kosmos/src/testing/scripts';

function loadScript(name) {
  return JSON.parse(readFileSync(`${SCRIPTS_DIR}/${name}.json`, 'utf-8'));
}

const scripts = [
  'example_rush_shipyard',
  'example_stress_demolish',
];

const reporter = new Reporter({ runName: 'step9-scripted' });

for (const name of scripts) {
  const script = loadScript(name);
  console.log(`\n── Running script: ${script.name} ──`);
  console.log(`   ${script.description}`);

  const bot = ScriptedBot.fromJSON(script, script.fallback);
  const { detectors } = createStandardDetectors();
  const rep = runSingleGame({
    bot,
    civYears: 100,
    decisionsPerCivYear: 1,
    gameId: `scripted_${name}`,
    seed: `scripted_${name}`,
    snapshotInterval: 25,
    detectors,
  });
  reporter.games.push(rep);

  console.log(`   Outcome: ${rep.outcome}  Years: ${rep.civYearsCompleted.toFixed(0)}  Errors: ${rep.errors.length}`);
  console.log(`   Actions:`, JSON.stringify(rep.actions));
  console.log(`   Flags: ${rep.flags.join(', ') || 'brak'}`);
  console.log(`   Final: pop=${rep.finalState?.pop}, buildings=${rep.finalState?.buildings}, techs=${rep.finalState?.techs}`);
}

console.log(`\n${reporter.toSummary()}`);

// Asserts
const tests = [];
tests.push(['2 scripts ran', reporter.games.length === 2]);
tests.push(['no crashes', reporter.games.every(g => g.outcome !== 'crash')]);
tests.push(['scripts produced actions', reporter.games.every(g => Object.values(g.actions).reduce((s, v) => s + v, 0) > 0)]);
tests.push(['rush_shipyard researched things', reporter.games[0].actions.research > 0]);

console.log('');
let fail = 0;
for (const [name, ok] of tests) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) fail++;
}
console.log(`\n${fail === 0 ? '✅ STEP 9 SUCCESS' : `❌ STEP 9 FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
