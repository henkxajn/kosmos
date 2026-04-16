// Test Step 10 — MCTSBot vs RuleBot vs RandomBot
import './env.js';
import { RandomBot } from '../bots/RandomBot.js';
import { RuleBot } from '../bots/RuleBot.js';
import { MCTSBot } from '../bots/MCTSBot.js';
import { Reporter } from '../analytics/Reporter.js';
import { runSingleGame } from '../runner/SingleGame.js';
import { createStandardDetectors } from '../analytics/BottleneckDetector.js';

console.log('─── MCTSBot Comparison Step 10 ───');

const N_GAMES = 10;
const CIV_YEARS = 400;

function runBatch(botFactory, name) {
  const r = new Reporter({ runName: name });
  for (let i = 1; i <= N_GAMES; i++) {
    const bot = botFactory();
    const { detectors } = createStandardDetectors();
    const rep = runSingleGame({
      bot, civYears: CIV_YEARS, decisionsPerCivYear: 1,
      gameId: `${name}_g${i}`, seed: `${name}_s${i}`,
      snapshotInterval: 50, detectors,
    });
    r.games.push(rep);
    process.stdout.write('.');
  }
  console.log(` ${name} done`);
  return r;
}

const t0 = Date.now();
const randRep = runBatch(() => new RandomBot(), 'random');
const ruleRep = runBatch(() => new RuleBot(), 'rule');
const mctsRep = runBatch(() => new MCTSBot({ iterations: 30 }), 'mcts');
const elapsed = Date.now() - t0;

function finalAvg(rep, key) {
  const vals = rep.games.map(g => g.finalState?.[key] ?? 0);
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function score(rep) {
  return finalAvg(rep, 'pop') * 40 + finalAvg(rep, 'buildings') * 20 + finalAvg(rep, 'techs') * 30 + finalAvg(rep, 'credits') * 0.1;
}

console.log(`\nTotal time: ${(elapsed/1000).toFixed(2)}s\n`);
console.log('─── Comparison ───');
console.log(`Metric         | Random      | Rule        | MCTS`);
for (const key of ['pop', 'buildings', 'techs', 'credits']) {
  const r = finalAvg(randRep, key).toFixed(1);
  const u = finalAvg(ruleRep, key).toFixed(1);
  const m = finalAvg(mctsRep, key).toFixed(1);
  console.log(`${key.padEnd(15)}| ${r.padStart(11)} | ${u.padStart(11)} | ${m.padStart(11)}`);
}
console.log(`${'Score'.padEnd(15)}| ${score(randRep).toFixed(1).padStart(11)} | ${score(ruleRep).toFixed(1).padStart(11)} | ${score(mctsRep).toFixed(1).padStart(11)}`);
console.log(`${'Crashes'.padEnd(15)}| ${randRep.getAggregate().crashed.toString().padStart(11)} | ${ruleRep.getAggregate().crashed.toString().padStart(11)} | ${mctsRep.getAggregate().crashed.toString().padStart(11)}`);

const tests = [];
tests.push(['MCTSBot nie crashuje', mctsRep.getAggregate().crashed === 0]);
tests.push(['MCTSBot ma score >= 80% RuleBot', score(mctsRep) >= score(ruleRep) * 0.8]);
tests.push(['MCTSBot bada technologie', finalAvg(mctsRep, 'techs') >= 3]);

console.log('');
let fail = 0;
for (const [name, ok] of tests) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) fail++;
}
console.log(`\n${fail === 0 ? '✅ STEP 10 SUCCESS' : `❌ STEP 10 FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
