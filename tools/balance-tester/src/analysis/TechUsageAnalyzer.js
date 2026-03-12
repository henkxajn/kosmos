// TechUsageAnalyzer — które techy są zawsze/nigdy badane, OP/dead techy

export class TechUsageAnalyzer {
  analyze(results) {
    const n = results.length;
    if (n === 0) return { techs: [], deadTechs: [], opTechs: [] };

    // Zbierz usage per tech
    const techUsage = {};
    for (const run of results) {
      const researched = run.finalState.techsResearched ?? [];
      for (const techId of researched) {
        if (!techUsage[techId]) techUsage[techId] = { count: 0, scores: [], timings: [] };
        techUsage[techId].count++;

        // Score runu
        const score = run.finalState.population * 10 +
          (run.finalState.techsResearched?.length ?? 0) * 20 +
          (run.finalState.colonyCount ?? 1) * 50 +
          run.finalState.morale;
        techUsage[techId].scores.push(score);
      }
    }

    // Timing z milestones (tylko dla trackowanych)
    const milestoneMap = {
      metallurgy: 'techMetallurgy',
      rocketry: 'techRocketry',
      exploration: 'techExploration',
      colonization: 'techColonization',
    };
    for (const run of results) {
      for (const [techId, milestoneKey] of Object.entries(milestoneMap)) {
        if (run.milestones[milestoneKey] !== null) {
          if (!techUsage[techId]) techUsage[techId] = { count: 0, scores: [], timings: [] };
          techUsage[techId].timings.push(run.milestones[milestoneKey]);
        }
      }
    }

    // Średni score BEZ techu (do porównania impact)
    const allScores = results.map(r =>
      r.finalState.population * 10 +
      (r.finalState.techsResearched?.length ?? 0) * 20 +
      (r.finalState.colonyCount ?? 1) * 50 +
      r.finalState.morale
    );
    const avgAllScore = allScores.reduce((a, b) => a + b, 0) / n;

    const techs = Object.entries(techUsage).map(([techId, data]) => {
      const usagePct = Math.round((data.count / n) * 100);
      const avgScore = data.scores.length > 0
        ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        : 0;
      const impactPct = avgAllScore > 0
        ? Math.round(((avgScore - avgAllScore) / avgAllScore) * 100)
        : 0;
      const avgTiming = data.timings.length > 0
        ? Math.round(data.timings.reduce((a, b) => a + b, 0) / data.timings.length)
        : null;

      return {
        techId,
        usagePct,
        avgScore: Math.round(avgScore),
        impactPct,
        avgTiming,
        isDead: usagePct < 10,
        isOP: impactPct > 20,
      };
    }).sort((a, b) => b.usagePct - a.usagePct);

    return {
      techs,
      deadTechs: techs.filter(t => t.isDead),
      opTechs: techs.filter(t => t.isOP),
    };
  }
}
