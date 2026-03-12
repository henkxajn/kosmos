// PacingAnalyzer — analiza tempa gry (idle time, tech timing, milestones)

export class PacingAnalyzer {
  analyze(results, milestoneStats) {
    const n = results.length;
    if (n === 0) return {};

    // Idle years
    const idleYears = results.map(r => r.decisionSummary.idleYears);
    const avgIdle = idleYears.reduce((a, b) => a + b, 0) / n;

    // Ideal timing windows (oczekiwane pacing)
    const idealTimings = {
      firstFarm: { min: 0, max: 5, label: 'Pierwsza farma' },
      firstMine: { min: 2, max: 20, label: 'Pierwsza kopalnia' },
      firstFactory: { min: 15, max: 60, label: 'Pierwsza fabryka' },
      techMetallurgy: { min: 8, max: 40, label: 'Metalurgia' },
      techRocketry: { min: 50, max: 200, label: 'Rakietowość' },
      pop10: { min: 40, max: 150, label: '10 POPów' },
      firstColony: { min: 150, max: 400, label: 'Pierwsza kolonia' },
    };

    const pacingIssues = [];
    for (const [key, ideal] of Object.entries(idealTimings)) {
      const stat = milestoneStats?.[key];
      if (!stat || stat.reachedPct === 0) {
        if (stat?.reachedPct === 0) {
          pacingIssues.push({
            milestone: key,
            label: ideal.label,
            severity: 'WARNING',
            message: `${ideal.label} nigdy nie osiągnięto w żadnym runie`,
          });
        }
        continue;
      }
      if (stat.median > ideal.max * 1.5) {
        pacingIssues.push({
          milestone: key,
          label: ideal.label,
          severity: 'WARNING',
          message: `${ideal.label} za późno: mediana ${stat.median} lat (ideał: ${ideal.min}-${ideal.max})`,
        });
      }
      if (stat.median < ideal.min * 0.5 && stat.reachedPct > 50) {
        pacingIssues.push({
          milestone: key,
          label: ideal.label,
          severity: 'INFO',
          message: `${ideal.label} za wcześnie: mediana ${stat.median} lat (ideał: ${ideal.min}-${ideal.max})`,
        });
      }
    }

    return {
      avgIdleYears: Number(avgIdle.toFixed(1)),
      idlePct: Number(((avgIdle / (results[0]?.finalState?.gameYear ?? 200)) * 100).toFixed(1)),
      pacingIssues,
      idealTimings,
    };
  }
}
