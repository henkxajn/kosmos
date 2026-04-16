// Test Step 3 — Ticker.run() przez 100 civYears, monitoruj zasoby i POP
import './env.js';
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';

console.log('─── Ticker Test Step 3 ───');

const core = new GameCore();
const state = core.boot({ quiet: true });
const ticker = new Ticker(core.timeSystem);

const logPoints = [];
ticker.onCivYear((civYear) => {
  if (civYear % 10 === 0 || civYear === 1) {
    const pop = core.civSystem?.population ?? 0;
    const fe = core.resourceSystem?.getAmount('Fe') ?? 0;
    const food = core.resourceSystem?.getAmount('food') ?? 0;
    const water = core.resourceSystem?.getAmount('water') ?? 0;
    const energy = core.resourceSystem?.getAmount('energy') ?? 0;
    const research = core.resourceSystem?.getAmount('research') ?? 0;
    logPoints.push({ civYear, pop, fe, food, water, energy, research });
  }
});

const t0 = Date.now();
const result = ticker.run(100, { tickSize: 1.0, stopOnCrash: false });
const elapsed = Date.now() - t0;

console.log(`\nSymulacja: 100 civYears w ${elapsed}ms (${(100/elapsed*1000).toFixed(1)} civYears/s)`);
console.log(`Ticks: ${result.ticks}, gameTime fizyczny: ${result.gameTime.toFixed(2)} lat`);
console.log(`Crashed: ${result.crashed ? 'TAK — '+result.error?.message : 'nie'}`);

console.log('\n── civYear | POP | Fe | food | water | energy | research ──');
for (const p of logPoints) {
  console.log(`  ${String(p.civYear).padStart(4)} | ${String(p.pop).padStart(4)} | ${String(Math.round(p.fe)).padStart(5)} | ${String(Math.round(p.food)).padStart(5)} | ${String(Math.round(p.water)).padStart(5)} | ${String(Math.round(p.energy)).padStart(6)} | ${String(Math.round(p.research)).padStart(6)}`);
}

// Asserts
const tests = [];
tests.push(['did not crash', !result.crashed]);
tests.push(['civYears elapsed', result.civYearsCompleted >= 99]);
tests.push(['gameTime advanced', result.gameTime > 0]);
tests.push(['log points recorded', logPoints.length > 0]);
tests.push(['research accumulated', (logPoints[logPoints.length-1]?.research ?? 0) > 100]);
tests.push(['POP reasonable', (() => {
  const p = logPoints[logPoints.length-1]?.pop;
  return p >= 1 && p <= 20; // sensowna populacja po 100 civYears bez interakcji
})()]);

console.log('');
let fail = 0;
for (const [name, ok] of tests) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) fail++;
}
console.log(`\n${fail === 0 ? '✅ STEP 3 SUCCESS' : `❌ STEP 3 FAILED (${fail}/${tests.length})`}`);
process.exit(fail === 0 ? 0 : 1);
