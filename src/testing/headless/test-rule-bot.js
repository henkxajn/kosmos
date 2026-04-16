// Test Step 8 — RuleBot vs RandomBot comparison
import './env.js';
import { RandomBot } from '../bots/RandomBot.js';
import { RuleBot } from '../bots/RuleBot.js';
import { Reporter } from '../analytics/Reporter.js';
import { runSingleGame } from '../runner/SingleGame.js';
import { createStandardDetectors } from '../analytics/BottleneckDetector.js';

console.log('─── RuleBot vs RandomBot Step 8 ───');

const N_GAMES = 10;
const CIV_YEARS = 400;

function runBatch(botFactory, name) {
  const reporter = new Reporter({ runName: name });
  for (let i = 1; i <= N_GAMES; i++) {
    const bot = botFactory();
    const { detectors } = createStandardDetectors();
    const rep = runSingleGame({
      bot, civYears: CIV_YEARS, decisionsPerCivYear: 1,
      gameId: `${name}_g${i}`, seed: `${name}_s${i}`,
      snapshotInterval: 50, detectors,
    });
    reporter.games.push(rep);
    process.stdout.write(`.`);
  }
  console.log(` ${name} DONE`);
  return reporter;
}

const t0 = Date.now();
const randomRep = runBatch(() => new RandomBot(), 'random');
const ruleRep   = runBatch(() => new RuleBot(),   'rule');
const elapsed = Date.now() - t0;

// Compare
const ra = randomRep.getAggregate();
const rb = ruleRep.getAggregate();
console.log(`\nTotal time: ${(elapsed/1000).toFixed(2)}s\n`);

function finalStat(rep, key) {
  const vals = rep.games.map(g => g.finalState?.[key] ?? 0);
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

console.log('─── Comparison ───');
console.log(`                    | Random Bot     | Rule Bot       | Δ`);
console.log(`${'avg pop'.padEnd(20)}| ${String(finalStat(randomRep, 'pop').toFixed(1)).padStart(14)} | ${String(finalStat(ruleRep, 'pop').toFixed(1)).padStart(14)} | ${(finalStat(ruleRep, 'pop') - finalStat(randomRep, 'pop')).toFixed(1)}`);
console.log(`${'avg buildings'.padEnd(20)}| ${String(finalStat(randomRep, 'buildings').toFixed(1)).padStart(14)} | ${String(finalStat(ruleRep, 'buildings').toFixed(1)).padStart(14)} | ${(finalStat(ruleRep, 'buildings') - finalStat(randomRep, 'buildings')).toFixed(1)}`);
console.log(`${'avg techs'.padEnd(20)}| ${String(finalStat(randomRep, 'techs').toFixed(1)).padStart(14)} | ${String(finalStat(ruleRep, 'techs').toFixed(1)).padStart(14)} | ${(finalStat(ruleRep, 'techs') - finalStat(randomRep, 'techs')).toFixed(1)}`);
console.log(`${'avg credits'.padEnd(20)}| ${String(finalStat(randomRep, 'credits').toFixed(1)).padStart(14)} | ${String(finalStat(ruleRep, 'credits').toFixed(1)).padStart(14)} | ${(finalStat(ruleRep, 'credits') - finalStat(randomRep, 'credits')).toFixed(1)}`);
console.log(`${'crash rate'.padEnd(20)}| ${ra.crashRate.padStart(14)} | ${rb.crashRate.padStart(14)} |`);

console.log(`\n── RandomBot flags ──`);
console.log(Object.entries(ra.flagHistogram).map(([f, c]) => `${f}:${c}`).join(', ') || 'brak');
console.log(`\n── RuleBot flags ──`);
console.log(Object.entries(rb.flagHistogram).map(([f, c]) => `${f}:${c}`).join(', ') || 'brak');

// Asserts — celem RuleBot w MVP jest "czytelne zachowanie, brak crashów, podobny score"
const rand = { pop: finalStat(randomRep, 'pop'), buildings: finalStat(randomRep, 'buildings'), techs: finalStat(randomRep, 'techs'), credits: finalStat(randomRep, 'credits') };
const rule = { pop: finalStat(ruleRep, 'pop'), buildings: finalStat(ruleRep, 'buildings'), techs: finalStat(ruleRep, 'techs'), credits: finalStat(ruleRep, 'credits') };

// Composite score: pop*40 + buildings*20 + techs*30 + credits*0.1
const scoreR = rand.pop * 40 + rand.buildings * 20 + rand.techs * 30 + rand.credits * 0.1;
const scoreB = rule.pop * 40 + rule.buildings * 20 + rule.techs * 30 + rule.credits * 0.1;
console.log(`\nComposite score — Random: ${scoreR.toFixed(1)}, RuleBot: ${scoreB.toFixed(1)}`);

// Action distribution — RuleBot powinien mieć inny pattern niż Random
const actR = ra.actionTotals;
const actB = rb.actionTotals;
const buildShareR = (actR.build ?? 0) / (Object.values(actR).reduce((s, v) => s + v, 0) || 1);
const buildShareB = (actB.build ?? 0) / (Object.values(actB).reduce((s, v) => s + v, 0) || 1);
console.log(`Build share — Random: ${(buildShareR*100).toFixed(0)}%, RuleBot: ${(buildShareB*100).toFixed(0)}%`);

const tests = [];
tests.push(['RuleBot nie crashuje', rb.crashed === 0]);
tests.push(['RuleBot badał więcej technologii', rule.techs >= rand.techs]);
tests.push(['Composite score RuleBot >= 80% RandomBot', scoreB >= scoreR * 0.8]);
tests.push(['RuleBot ma inny pattern akcji (build share differs > 5%)', Math.abs(buildShareR - buildShareB) > 0.05]);

console.log('');
let fail = 0;
for (const [name, ok] of tests) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) fail++;
}
console.log(`\n${fail === 0 ? '✅ STEP 8 SUCCESS' : `❌ STEP 8 FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
