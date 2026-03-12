// DeathSpiralDetector — wykrywa nieodwracalne pętle negatywne

export class DeathSpiralDetector {
  analyze(results) {
    const n = results.length;
    if (n === 0) return { spirals: [], overallRate: 0 };

    const spiralTypes = {
      unrest_cascade: { count: 0, years: [], description: 'Kaskada niepokojów: morale < 30 → unrest → -30% produkcji → pogłębienie kryzysu' },
      starvation_loop: { count: 0, years: [], description: 'Pętla głodu: brak food → pop death → employment penalty → mniej produkcji' },
      population_collapse: { count: 0, years: [], description: 'Kolaps populacji: wiele zgonów POP + spadek morale' },
    };

    for (const run of results) {
      // Unrest cascade: crisisUnrest > 0 AND popDeaths > 0
      if (run.counters.crisisUnrest > 0 && run.counters.popDeaths > 1) {
        spiralTypes.unrest_cascade.count++;
        if (run.milestones.firstCrisis) spiralTypes.unrest_cascade.years.push(run.milestones.firstCrisis);
      }

      // Starvation loop: famine AND popDeaths
      if (run.counters.crisisFamine > 0 && run.counters.popDeaths > 0) {
        spiralTypes.starvation_loop.count++;
        if (run.milestones.firstFamine) spiralTypes.starvation_loop.years.push(run.milestones.firstFamine);
      }

      // Population collapse: popDeaths > 3
      if (run.counters.popDeaths > 3) {
        spiralTypes.population_collapse.count++;
      }
    }

    const spirals = Object.entries(spiralTypes)
      .filter(([, data]) => data.count > 0)
      .map(([type, data]) => ({
        type,
        description: data.description,
        frequency: Math.round((data.count / n) * 100),
        avgOnsetYear: data.years.length > 0
          ? Math.round(data.years.reduce((a, b) => a + b, 0) / data.years.length)
          : null,
      }))
      .sort((a, b) => b.frequency - a.frequency);

    const anySpiral = results.filter(r =>
      r.counters.crisisUnrest > 0 || r.counters.crisisFamine > 0 || r.counters.popDeaths > 3
    ).length;

    return {
      spirals,
      overallRate: Math.round((anySpiral / n) * 100),
    };
  }
}
