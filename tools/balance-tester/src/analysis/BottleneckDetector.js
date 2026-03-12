// BottleneckDetector — identyfikuje które surowce blokują postęp najczęściej

export class BottleneckDetector {
  analyze(results) {
    const n = results.length;
    if (n === 0) return [];

    // Zbierz shortage events ze wszystkich runów
    const resourceShortages = {};

    for (const run of results) {
      for (const [resource, count] of Object.entries(run.counters.shortageEvents ?? {})) {
        if (!resourceShortages[resource]) {
          resourceShortages[resource] = { totalEvents: 0, runsAffected: 0, runs: [] };
        }
        resourceShortages[resource].totalEvents += count;
        resourceShortages[resource].runsAffected++;
        resourceShortages[resource].runs.push(count);
      }
    }

    // Ranking
    const ranking = Object.entries(resourceShortages)
      .map(([resource, data]) => ({
        resource,
        totalEvents: data.totalEvents,
        runsAffectedPct: Math.round((data.runsAffected / n) * 100),
        avgEventsPerRun: Number((data.totalEvents / n).toFixed(1)),
        severity: this._calcSeverity(data, n),
      }))
      .sort((a, b) => b.severity - a.severity);

    return ranking;
  }

  _calcSeverity(data, totalRuns) {
    // Severity = runsAffected% × avgEvents (weighted)
    const pct = data.runsAffected / totalRuns;
    const avg = data.totalEvents / totalRuns;
    return pct * avg * 100;
  }
}
