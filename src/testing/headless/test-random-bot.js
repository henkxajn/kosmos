// Test Step 5 — RandomBot na 10 grach × 200 civYears, Reporter
import './env.js';
import { RandomBot } from '../bots/RandomBot.js';
import { Reporter } from '../analytics/Reporter.js';
import { runSingleGame } from '../runner/SingleGame.js';

console.log('─── RandomBot Test Step 5 ───');

const N_GAMES = 10;
const CIV_YEARS = 200;
const reporter = new Reporter({ runName: `step5-random-${N_GAMES}x${CIV_YEARS}y` });

const t0 = Date.now();
for (let i = 1; i <= N_GAMES; i++) {
  const bot = new RandomBot();
  const report = runSingleGame({
    bot,
    civYears: CIV_YEARS,
    decisionsPerCivYear: 2,
    gameId: `game_${i}`,
    seed: `seed_${i}`,
    snapshotInterval: 50,
  });
  reporter.games.push(report);

  const actionTotal = Object.values(report.actions).reduce((s, v) => s + v, 0);
  console.log(`  Game ${i}: outcome=${report.outcome.padEnd(10)} years=${report.civYearsCompleted.toFixed(0).padStart(4)} actions=${String(actionTotal).padStart(4)} errors=${report.errors.length} time=${report.elapsedMs}ms`);
}
const elapsed = Date.now() - t0;

console.log(`\n${reporter.toSummary()}`);
console.log(`\nTotal time: ${(elapsed/1000).toFixed(2)}s (${(N_GAMES/elapsed*1000).toFixed(1)} games/s)`);

// Save JSON report
import('node:fs').then(fs => {
  const reportsDir = 'E:/programy/claude_kody/kosmos/src/testing/reports';
  try { fs.mkdirSync(reportsDir, { recursive: true }); } catch {}
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = `${reportsDir}/step5-${ts}.json`;
  fs.writeFileSync(file, JSON.stringify(reporter.toJSON(), null, 2));
  console.log(`\nRaport JSON: ${file}`);

  // Asserts
  const tests = [];
  const agg = reporter.getAggregate();
  tests.push(['10 games ran', agg.games === N_GAMES]);
  tests.push(['avg years > 0', agg.avgYears > 0]);
  tests.push(['some actions emitted', Object.values(agg.actionTotals).reduce((s, v) => s + v, 0) > 0]);

  console.log('');
  let fail = 0;
  for (const [name, ok] of tests) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
    if (!ok) fail++;
  }
  console.log(`\n${fail === 0 ? '✅ STEP 5 SUCCESS' : `❌ STEP 5 FAILED`}`);
  process.exit(fail === 0 ? 0 : 1);
});
