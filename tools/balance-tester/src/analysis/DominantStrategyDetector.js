// DominantStrategyDetector — porównuje wyniki botów

export class DominantStrategyDetector {
  analyze(comparison) {
    if (!comparison || comparison.length <= 1) return { findings: [] };

    const findings = [];

    // Znajdź najlepszego i najgorszego
    const best = comparison[0]; // already sorted by score
    const worst = comparison[comparison.length - 1];

    // Czy jest dominant strategy?
    if (comparison.length >= 2) {
      const second = comparison[1];
      const gap = best.score.mean - second.score.mean;
      const avgStddev = (best.score.stddev + second.score.stddev) / 2;

      if (gap > avgStddev * 2) {
        findings.push({
          severity: 'WARNING',
          message: `${best.botName} dominuje — score ${best.score.mean} vs ${second.botName} ${second.score.mean} (gap > 2σ)`,
          recommendation: 'Strategia ta jest zbyt skuteczna — rozważ osłabienie jej kluczowej mechaniki',
        });
      }
    }

    // Czy RandomBot jest zbyt dobry?
    const random = comparison.find(c => c.botName === 'RandomBot');
    const balanced = comparison.find(c => c.botName === 'BalancedBot');
    if (random && balanced) {
      const ratio = random.score.mean / balanced.score.mean;
      if (ratio > 0.8) {
        findings.push({
          severity: 'CRITICAL',
          message: `RandomBot osiąga ${Math.round(ratio * 100)}% wyniku BalancedBot — gra brakuje strategic depth`,
          recommendation: 'Decyzje gracza nie mają wystarczającego wpływu na wynik',
        });
      }
    }

    // Czy jakiś bot nie radzi sobie?
    for (const bot of comparison) {
      if (bot.aliveRate < 80) {
        findings.push({
          severity: 'INFO',
          message: `${bot.botName} ma survival rate ${bot.aliveRate}% — strategia ta jest ryzykowna`,
        });
      }
    }

    return { findings, ranking: comparison };
  }
}
