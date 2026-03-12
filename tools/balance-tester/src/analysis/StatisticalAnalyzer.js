// StatisticalAnalyzer — agregacja statystyk z wielu runów

export class StatisticalAnalyzer {
  /**
   * @param {Array<object>} results — wyniki z SuiteRunner
   */
  constructor(results) {
    this.results = results;
    this.byBot = this._groupByBot(results);
  }

  _groupByBot(results) {
    const groups = {};
    for (const r of results) {
      if (!groups[r.botName]) groups[r.botName] = [];
      groups[r.botName].push(r);
    }
    return groups;
  }

  /** Statystyki per bot */
  analyze() {
    const analysis = {};
    for (const [botName, runs] of Object.entries(this.byBot)) {
      analysis[botName] = this._analyzeGroup(runs);
    }
    analysis._overall = this._analyzeGroup(this.results);
    analysis._comparison = this._compareStrategies();
    return analysis;
  }

  _analyzeGroup(runs) {
    const n = runs.length;
    if (n === 0) return null;

    // Final state metrics
    const finalPop = runs.map(r => r.finalState.population);
    const finalMorale = runs.map(r => r.finalState.morale);
    const finalTechs = runs.map(r => r.finalState.techsResearched?.length ?? 0);
    const finalBuildings = runs.map(r =>
      Object.values(r.finalState.buildings).reduce((a, b) => a + b, 0)
    );

    // Composite score
    const scores = runs.map(r =>
      r.finalState.population * 10 +
      (r.finalState.techsResearched?.length ?? 0) * 20 +
      (r.finalState.colonyCount ?? 1) * 50 +
      r.finalState.morale
    );

    // Milestones
    const milestoneStats = {};
    const milestoneKeys = Object.keys(runs[0]?.milestones ?? {});
    for (const key of milestoneKeys) {
      const values = runs.map(r => r.milestones[key]).filter(v => v !== null);
      milestoneStats[key] = {
        reachedPct: Math.round((values.length / n) * 100),
        ...this._stats(values),
      };
    }

    // Counters aggregate
    const counterAgg = {};
    const counterKeys = Object.keys(runs[0]?.counters ?? {});
    for (const key of counterKeys) {
      if (key === 'shortageEvents') continue;
      const values = runs.map(r => r.counters[key] ?? 0);
      counterAgg[key] = this._stats(values);
    }

    // Shortage events aggregate
    const shortageAgg = {};
    for (const r of runs) {
      for (const [resource, count] of Object.entries(r.counters.shortageEvents ?? {})) {
        if (!shortageAgg[resource]) shortageAgg[resource] = [];
        shortageAgg[resource].push(count);
      }
    }
    const shortageStats = {};
    for (const [resource, counts] of Object.entries(shortageAgg)) {
      shortageStats[resource] = {
        runsAffected: counts.length,
        runsAffectedPct: Math.round((counts.length / n) * 100),
        ...this._stats(counts),
      };
    }

    // Time series aggregate (mean + P10/P90 bands)
    const tsKeys = Object.keys(runs[0]?.timeSeries ?? {}).filter(k => k !== 'gameYear');
    const tsAgg = { gameYear: runs[0]?.timeSeries?.gameYear ?? [] };
    for (const key of tsKeys) {
      const maxLen = Math.max(...runs.map(r => r.timeSeries[key]?.length ?? 0));
      const mean = [], p10 = [], p90 = [];
      for (let i = 0; i < maxLen; i++) {
        const vals = runs.map(r => r.timeSeries[key]?.[i] ?? 0).sort((a, b) => a - b);
        mean.push(Number(this._mean(vals).toFixed(1)));
        p10.push(Number(this._percentile(vals, 10).toFixed(1)));
        p90.push(Number(this._percentile(vals, 90).toFixed(1)));
      }
      tsAgg[key] = { mean, p10, p90 };
    }

    return {
      runCount: n,
      finalPopulation: this._stats(finalPop),
      finalMorale: this._stats(finalMorale),
      finalTechs: this._stats(finalTechs),
      finalBuildings: this._stats(finalBuildings),
      compositeScore: this._stats(scores),
      milestones: milestoneStats,
      counters: counterAgg,
      shortages: shortageStats,
      timeSeriesAgg: tsAgg,
      aliveRate: Math.round((runs.filter(r => r.finalState.isAlive).length / n) * 100),
      stableRate: Math.round((runs.filter(r => r.finalState.isStable).length / n) * 100),
    };
  }

  /** Porównanie strategii botów */
  _compareStrategies() {
    const comparison = [];
    for (const [botName, runs] of Object.entries(this.byBot)) {
      const scores = runs.map(r =>
        r.finalState.population * 10 +
        (r.finalState.techsResearched?.length ?? 0) * 20 +
        (r.finalState.colonyCount ?? 1) * 50 +
        r.finalState.morale
      );
      comparison.push({
        botName,
        runCount: runs.length,
        score: this._stats(scores),
        avgPop: this._mean(runs.map(r => r.finalState.population)),
        avgTechs: this._mean(runs.map(r => r.finalState.techsResearched?.length ?? 0)),
        avgMorale: this._mean(runs.map(r => r.finalState.morale)),
        aliveRate: Math.round((runs.filter(r => r.finalState.isAlive).length / runs.length) * 100),
      });
    }
    comparison.sort((a, b) => b.score.mean - a.score.mean);
    return comparison;
  }

  // ── Math utilities ──

  _stats(values) {
    if (!values || values.length === 0) return { mean: 0, median: 0, stddev: 0, min: 0, max: 0, p10: 0, p25: 0, p75: 0, p90: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const mean = this._mean(sorted);
    return {
      mean: Number(mean.toFixed(1)),
      median: Number(this._percentile(sorted, 50).toFixed(1)),
      stddev: Number(this._stddev(sorted, mean).toFixed(1)),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p10: Number(this._percentile(sorted, 10).toFixed(1)),
      p25: Number(this._percentile(sorted, 25).toFixed(1)),
      p75: Number(this._percentile(sorted, 75).toFixed(1)),
      p90: Number(this._percentile(sorted, 90).toFixed(1)),
    };
  }

  _mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  _stddev(sorted, mean) {
    if (sorted.length <= 1) return 0;
    const variance = sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sorted.length;
    return Math.sqrt(variance);
  }

  _percentile(sorted, pct) {
    if (sorted.length === 0) return 0;
    const idx = (pct / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }
}
