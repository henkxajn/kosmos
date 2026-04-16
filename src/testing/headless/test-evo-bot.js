// Test Step 11 — EvoBot tournament (malý trening)
import './env.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Tournament } from '../runner/Tournament.js';
import { EvoBot, DEFAULT_EVO_WEIGHTS } from '../bots/EvoBot.js';
import { runSingleGame } from '../runner/SingleGame.js';

console.log('─── EvoBot Tournament Step 11 ───');

// Mini-trening: 4 osobniki × 2 gry × 150 civYears × 3 generacje = 24 gier + baseline
const tournament = new Tournament({
  popSize: 6,
  gamesPerInd: 2,
  civYears: 150,
  elite: 2,
  mutationRate: 0.25,
  mutationSigma: 0.15,
  verbose: true,
});

const t0 = Date.now();
const { best, history } = tournament.evolve(3);
const trainElapsed = Date.now() - t0;

console.log(`\nTrening zakończony w ${(trainElapsed/1000).toFixed(2)}s`);
console.log(`Najlepszy osobnik score: ${Math.round(best.score)}`);
console.log(`Wagi:`, JSON.stringify(best.weights, null, 2));

// Zapisz wagi do JSON
const REPORTS_DIR = 'E:/programy/claude_kody/kosmos/src/testing/reports';
try { mkdirSync(REPORTS_DIR, { recursive: true }); } catch {}
const weightsFile = `${REPORTS_DIR}/evo_weights.json`;
writeFileSync(weightsFile, JSON.stringify({
  trainedAt: new Date().toISOString(),
  score: Math.round(best.score),
  weights: best.weights,
  history,
}, null, 2));
console.log(`\nZapisano wagi: ${weightsFile}`);

// Porównaj: best-EvoBot vs default-EvoBot vs baseline (single game each)
console.log('\n── EvoBot evaluation (3 games każdy) ──');

function scoreOf(rep) {
  const f = rep.finalState ?? {};
  return (f.pop ?? 0) * 40 + (f.buildings ?? 0) * 20 + (f.techs ?? 0) * 30 + (f.credits ?? 0) * 0.1;
}

function avgScore(weightsOrNull, label) {
  const weights = weightsOrNull ?? DEFAULT_EVO_WEIGHTS;
  let total = 0;
  for (let i = 0; i < 3; i++) {
    const bot = new EvoBot({ weights });
    const rep = runSingleGame({ bot, civYears: 200, decisionsPerCivYear: 1, gameId: `eval_${label}_${i}`, seed: `eval_${label}_${i}` });
    total += scoreOf(rep);
  }
  return total / 3;
}

const scoreDefault = avgScore(null, 'default');
const scoreBest = avgScore(best.weights, 'best');
console.log(`Default EvoBot avg score: ${scoreDefault.toFixed(1)}`);
console.log(`Best-evolved EvoBot avg score: ${scoreBest.toFixed(1)}`);
console.log(`Poprawa: ${((scoreBest - scoreDefault) / Math.max(1, scoreDefault) * 100).toFixed(1)}%`);

// Asserts
const tests = [];
tests.push(['Tournament zakończony', history.length === 3]);
tests.push(['wagi zapisane', best.weights !== null]);
tests.push(['Żadne pokolenie nie score=0', history.every(h => h.bestScore > 0)]);
// Poprawa nie zawsze gwarantowana przy małym treningu, ale spodziewamy się nie-znacząca regresja
tests.push(['best-evolved ≥ 70% default (brak dramatycznej regresji)', scoreBest >= scoreDefault * 0.7]);

console.log('');
let fail = 0;
for (const [n, ok] of tests) {
  console.log(`  ${ok ? '✅' : '❌'} ${n}`);
  if (!ok) fail++;
}
console.log(`\n${fail === 0 ? '✅ STEP 11 SUCCESS' : `❌ STEP 11 FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
