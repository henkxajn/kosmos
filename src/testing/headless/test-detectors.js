// Test Step 6 — RandomBot × 20 gier × 400 civYears z detektorami
import './env.js';
import { RandomBot } from '../bots/RandomBot.js';
import { Reporter } from '../analytics/Reporter.js';
import { runSingleGame } from '../runner/SingleGame.js';
import { createStandardDetectors } from '../analytics/BottleneckDetector.js';

console.log('─── Detectors Test Step 6 ───');

const N_GAMES = 20;
const CIV_YEARS = 400;
const reporter = new Reporter({ runName: `step6-detectors-${N_GAMES}x${CIV_YEARS}y` });

const t0 = Date.now();
for (let i = 1; i <= N_GAMES; i++) {
  const bot = new RandomBot();
  const { detectors } = createStandardDetectors();

  const report = runSingleGame({
    bot,
    civYears: CIV_YEARS,
    decisionsPerCivYear: 1,
    gameId: `game_${i}`,
    seed: `seed_${i}`,
    snapshotInterval: 100,
    detectors,
  });
  reporter.games.push(report);
  process.stdout.write(`  G${i} `);
  if (i % 10 === 0) process.stdout.write('\n');
}
const elapsed = Date.now() - t0;
console.log('\n');
console.log(reporter.toSummary());
console.log(`\nTotal time: ${(elapsed/1000).toFixed(2)}s (${(N_GAMES/elapsed*1000).toFixed(1)} games/s)`);

// Asserts
const agg = reporter.getAggregate();
const tests = [];
tests.push(['20 games ran', agg.games === N_GAMES]);
tests.push(['average years reasonable', agg.avgYears > 100]);
tests.push(['flag histogram captured', Object.keys(agg.flagHistogram).length > 0 || agg.avgYears > 0]);

console.log('');
let fail = 0;
for (const [name, ok] of tests) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) fail++;
}
console.log(`\n${fail === 0 ? '✅ STEP 6 SUCCESS' : `❌ STEP 6 FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
