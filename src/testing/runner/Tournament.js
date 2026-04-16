// ═══════════════════════════════════════════════════════════════
// Tournament — trening EvoBot przez selekcję + mutację
// ─────────────────────────────────────────────────────────────
// Dla każdego pokolenia:
//   1. Każdy osobnik gra N gier, liczony score
//   2. Sortowanie po score
//   3. Top elite przechodzi bez zmian
//   4. Reszta: crossover(2 losowych z top 50%) + mutacja
// Zapisuje historię do JSON.
// ═══════════════════════════════════════════════════════════════

import { EvoBot, DEFAULT_EVO_WEIGHTS, randomWeights, mutateWeights, crossoverWeights } from '../bots/EvoBot.js';
import { runSingleGame } from './SingleGame.js';

export class Tournament {
  constructor({ popSize = 10, gamesPerInd = 3, civYears = 300, elite = 2, mutationRate = 0.2, mutationSigma = 0.12, verbose = true } = {}) {
    this.popSize = popSize;
    this.gamesPerInd = gamesPerInd;
    this.civYears = civYears;
    this.elite = elite;
    this.mutationRate = mutationRate;
    this.mutationSigma = mutationSigma;
    this.verbose = verbose;
    this.history = [];
  }

  initialize() {
    // Pierwsze pokolenie: 50% losowe + 50% baseline (DEFAULT + małe mutacje)
    this.population = [];
    for (let i = 0; i < this.popSize; i++) {
      if (i < this.popSize / 2) {
        this.population.push({ weights: randomWeights(), score: 0 });
      } else {
        this.population.push({ weights: mutateWeights(DEFAULT_EVO_WEIGHTS, { rate: 0.5, sigma: 0.1 }), score: 0 });
      }
    }
  }

  _scoreIndividual(weights, gen, idx) {
    let totalScore = 0;
    const details = [];
    for (let g = 0; g < this.gamesPerInd; g++) {
      const bot = new EvoBot({ weights });
      const rep = runSingleGame({
        bot,
        civYears: this.civYears,
        decisionsPerCivYear: 1,
        gameId: `evo_g${gen}_i${idx}_${g}`,
        seed: `evo_g${gen}_i${idx}_${g}`,
      });
      const f = rep.finalState ?? {};
      const score = (f.pop ?? 0) * 40 + (f.buildings ?? 0) * 20 + (f.techs ?? 0) * 30 + (f.credits ?? 0) * 0.1
                  - (rep.errors?.length ?? 0) * 50; // kara za błędy
      totalScore += score;
      details.push({ game: g, score: Math.round(score), outcome: rep.outcome });
    }
    return { avgScore: totalScore / this.gamesPerInd, details };
  }

  evolve(generations = 3) {
    if (!this.population) this.initialize();

    for (let gen = 0; gen < generations; gen++) {
      const t0 = Date.now();
      // Oceń każdy osobnik
      for (let i = 0; i < this.population.length; i++) {
        const { avgScore } = this._scoreIndividual(this.population[i].weights, gen, i);
        this.population[i].score = avgScore;
      }
      // Sortuj malejąco
      this.population.sort((a, b) => b.score - a.score);
      const elapsed = Date.now() - t0;

      // Zapisz historię
      const best = this.population[0];
      const avg = this.population.reduce((s, p) => s + p.score, 0) / this.population.length;
      this.history.push({
        gen,
        bestScore: Math.round(best.score),
        avgScore: Math.round(avg),
        bestWeights: best.weights,
        timeMs: elapsed,
      });

      if (this.verbose) {
        console.log(`  Gen ${gen}: best=${Math.round(best.score)}, avg=${Math.round(avg)}, time=${elapsed}ms`);
      }

      // Utwórz następne pokolenie (oprócz ostatniego generowania)
      if (gen < generations - 1) {
        this.population = this._nextGeneration();
      }
    }

    return {
      best: this.population[0],
      history: this.history,
    };
  }

  _nextGeneration() {
    const next = [];
    // Elitism: top N
    for (let i = 0; i < this.elite; i++) {
      next.push({ weights: { ...this.population[i].weights }, score: 0 });
    }
    // Reszta: crossover + mutacja
    const parentPool = this.population.slice(0, Math.max(2, Math.floor(this.popSize / 2)));
    while (next.length < this.popSize) {
      const p1 = parentPool[Math.floor(Math.random() * parentPool.length)];
      const p2 = parentPool[Math.floor(Math.random() * parentPool.length)];
      let child = crossoverWeights(p1.weights, p2.weights);
      child = mutateWeights(child, { rate: this.mutationRate, sigma: this.mutationSigma });
      next.push({ weights: child, score: 0 });
    }
    return next;
  }
}
