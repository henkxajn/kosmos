// ═══════════════════════════════════════════════════════════════
// Reporter — zbieranie metryk per-gra + agregacja
// ─────────────────────────────────────────────────────────────
// Raport per-gra: outcome, years, crashes, actions, metryki końcowe.
// Raport zbiorczy: średnie, crash rate, top flagi.
// Eksport: JSON + human-readable summary.
// ═══════════════════════════════════════════════════════════════

import { generateConclusions, summaryText } from './ConclusionsEngine.js';

export class GameReport {
  constructor({ id, seed, bot, scenario }) {
    this.id = id;
    this.seed = seed;
    this.bot = bot;
    this.scenario = scenario;
    this.startedAt = Date.now();
    this.actions = {};             // {actionType: count}
    this.successActions = {};      // {actionType: successCount}
    this.errors = [];              // [{civYear, message, stack, lastAction}]
    this.metricsSnapshots = [];    // [{civYear, ...metrics}]
    this.flags = [];               // np. ['POP_STAGNATION']
    this.outcome = null;           // 'finished' | 'crash' | 'game_over' | 'timeout'
    this.civYearsCompleted = 0;
    this.finalState = null;
    this.elapsedMs = 0;
  }

  recordAction(actionType, success = null) {
    this.actions[actionType] = (this.actions[actionType] ?? 0) + 1;
    if (success === true) {
      this.successActions[actionType] = (this.successActions[actionType] ?? 0) + 1;
    }
  }

  recordError(civYear, err, lastAction = null) {
    this.errors.push({
      civYear,
      message: err?.message ?? String(err),
      stack: err?.stack?.split('\n').slice(0, 6).join('\n') ?? null,
      lastAction: lastAction ? { type: lastAction.type, ...(lastAction.buildingId ? { buildingId: lastAction.buildingId } : {}) } : null,
    });
  }

  snapshotMetrics(civYear, metrics) {
    this.metricsSnapshots.push({ civYear, ...metrics });
  }

  addFlag(flag) {
    if (!this.flags.includes(flag)) this.flags.push(flag);
  }

  finish(outcome, civYearsCompleted, finalState = null) {
    this.outcome = outcome;
    this.civYearsCompleted = civYearsCompleted;
    this.finalState = finalState;
    this.elapsedMs = Date.now() - this.startedAt;
  }

  toJSON() {
    return {
      id: this.id,
      seed: this.seed,
      bot: this.bot,
      scenario: this.scenario,
      outcome: this.outcome,
      civYearsCompleted: Math.round(this.civYearsCompleted * 100) / 100,
      elapsedMs: this.elapsedMs,
      actions: this.actions,
      successActions: this.successActions,
      errors: this.errors.slice(0, 5), // top 5 błędów
      errorCount: this.errors.length,
      flags: this.flags,
      finalState: this.finalState,
      metricsSnapshots: this.metricsSnapshots,
      // Nowe pola — event tracking (dodawane przez SingleGame)
      events: this.events ?? [],
      eventSummary: this.eventSummary ?? {},
    };
  }
}

export class Reporter {
  constructor({ runName = 'kosmos-qa' } = {}) {
    this.runName = runName;
    this.games = [];
    this.startedAt = Date.now();
  }

  addGame(report) {
    this.games.push(report);
    return report;
  }

  newGame({ id, seed, bot, scenario }) {
    const r = new GameReport({ id, seed, bot, scenario });
    this.games.push(r);
    return r;
  }

  getAggregate() {
    const n = this.games.length;
    if (n === 0) return { games: 0 };

    const crashed = this.games.filter(g => g.outcome === 'crash').length;
    const finished = this.games.filter(g => g.outcome === 'finished').length;
    const gameOver = this.games.filter(g => g.outcome === 'game_over').length;
    const avgYears = this.games.reduce((s, g) => s + g.civYearsCompleted, 0) / n;
    const totalErrors = this.games.reduce((s, g) => s + g.errors.length, 0);
    const avgMs = this.games.reduce((s, g) => s + g.elapsedMs, 0) / n;

    // Top działania
    const actionTotals = {};
    const actionSuccessTotals = {};
    for (const g of this.games) {
      for (const [k, v] of Object.entries(g.actions)) {
        actionTotals[k] = (actionTotals[k] ?? 0) + v;
      }
      for (const [k, v] of Object.entries(g.successActions)) {
        actionSuccessTotals[k] = (actionSuccessTotals[k] ?? 0) + v;
      }
    }

    // Flagi — histogram
    const flagHist = {};
    for (const g of this.games) {
      for (const f of g.flags) flagHist[f] = (flagHist[f] ?? 0) + 1;
    }

    // Unikalne crash'e (po message)
    const crashMap = new Map();
    for (const g of this.games) {
      for (const err of g.errors) {
        const key = err.message.slice(0, 120);
        if (!crashMap.has(key)) crashMap.set(key, { message: err.message, count: 0, firstGame: g.id, lastAction: err.lastAction, civYear: err.civYear, stack: err.stack });
        crashMap.get(key).count++;
      }
    }
    const uniqueCrashes = Array.from(crashMap.values()).sort((a, b) => b.count - a.count);

    // ── Event summary aggregation ──
    const evAgg = {};
    const shortByRes = {};
    const techByBranch = {};
    const shipsByType = {};
    for (const g of this.games) {
      const es = g.eventSummary ?? {};
      for (const [k, v] of Object.entries(es)) {
        if (typeof v === 'number') evAgg[k] = (evAgg[k] ?? 0) + v;
        else if (k === 'shortagesByResource' && v) {
          for (const [r, c] of Object.entries(v)) shortByRes[r] = (shortByRes[r] ?? 0) + c;
        }
        else if (k === 'techsByBranch' && v) {
          for (const [b, c] of Object.entries(v)) techByBranch[b] = (techByBranch[b] ?? 0) + c;
        }
        else if (k === 'shipsBuiltByType' && v) {
          for (const [s, c] of Object.entries(v)) shipsByType[s] = (shipsByType[s] ?? 0) + c;
        }
      }
    }

    // Średnie key metrics z finalState
    const finalStats = {};
    const statKeys = ['pop', 'housing', 'prosperity', 'morale', 'colonies', 'techs', 'credits', 'buildings'];
    for (const key of statKeys) {
      const vals = this.games.map(g => g.finalState?.[key] ?? 0).filter(v => typeof v === 'number');
      if (vals.length > 0) finalStats[`avg_${key}`] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10;
    }
    // Vessels (nested)
    const vesselTotals = this.games.map(g => g.finalState?.vessels?.total ?? 0);
    if (vesselTotals.length > 0) finalStats.avg_vessels = Math.round(vesselTotals.reduce((s, v) => s + v, 0) / vesselTotals.length * 10) / 10;

    // Budujemy baseAgg bez conclusions — by ConclusionsEngine mógł go sprawdzić
    const baseAggNoConclusions = {
      runName: this.runName, games: n, crashed, finished, gameOver,
      crashRate: (crashed / n * 100).toFixed(1) + '%',
      avgYears: Math.round(avgYears), avgMs: Math.round(avgMs),
      eventTotals: evAgg, shortageByResource: shortByRes,
      techsByBranch: techByBranch, shipsBuiltByType: shipsByType,
      finalStats, flagHistogram: flagHist, actionTotals,
    };

    return {
      runName: this.runName,
      games: n,
      crashed,
      finished,
      gameOver,
      crashRate: (crashed / n * 100).toFixed(1) + '%',
      avgYears: Math.round(avgYears),
      avgMs: Math.round(avgMs),
      totalErrors,
      actionTotals,
      actionSuccessTotals,
      flagHistogram: flagHist,
      uniqueCrashes,
      elapsedMs: Date.now() - this.startedAt,
      // Nowe: agregacje z event summary + final stats
      eventTotals: evAgg,
      shortageByResource: shortByRes,
      techsByBranch: techByBranch,
      shipsBuiltByType: shipsByType,
      finalStats,
      conclusions: this._generateConclusionsSafe(baseAggNoConclusions),
    };
  }

  _generateConclusionsSafe(baseAgg) {
    try {
      const gamesJson = this.games.map(g => typeof g.toJSON === 'function' ? g.toJSON() : g);
      return generateConclusions(baseAgg, gamesJson);
    } catch (err) {
      return [{ severity: 'info', category: 'game', title: 'ConclusionsEngine error', evidence: err?.message ?? String(err), suggestion: 'Zgłoś buga' }];
    }
  }

  toJSON() {
    return {
      runName: this.runName,
      aggregate: this.getAggregate(),
      games: this.games.map(g => g.toJSON()),
    };
  }

  /** Human-readable summary */
  toSummary() {
    const a = this.getAggregate();
    const lines = [];
    lines.push(`══ KOSMOS QA Run: ${a.runName} ══`);
    lines.push(`Games: ${a.games}  Crashed: ${a.crashed} (${a.crashRate})  Finished: ${a.finished}  GameOver: ${a.gameOver}`);
    lines.push(`Avg civYears: ${a.avgYears}  Avg time/game: ${a.avgMs}ms  Total run: ${(a.elapsedMs/1000).toFixed(1)}s`);
    lines.push('');
    lines.push('── Actions ──');
    const actionRows = Object.entries(a.actionTotals).sort((x, y) => y[1] - x[1]);
    for (const [type, count] of actionRows) {
      const ok = a.actionSuccessTotals[type] ?? '?';
      lines.push(`  ${type.padEnd(20)} ${String(count).padStart(6)} (success≈${ok})`);
    }
    if (Object.keys(a.flagHistogram).length > 0) {
      lines.push('');
      lines.push('── Bottleneck Flags ──');
      const flagRows = Object.entries(a.flagHistogram).sort((x, y) => y[1] - x[1]);
      for (const [f, c] of flagRows) {
        lines.push(`  ${f.padEnd(22)} ${c}/${a.games} (${(c/a.games*100).toFixed(0)}%)`);
      }
    }

    if (a.finalStats && Object.keys(a.finalStats).length > 0) {
      lines.push('');
      lines.push('── Final Stats (avg) ──');
      for (const [k, v] of Object.entries(a.finalStats)) {
        lines.push(`  ${k.padEnd(22)} ${v}`);
      }
    }

    if (a.eventTotals && Object.keys(a.eventTotals).length > 0) {
      lines.push('');
      lines.push('── Event Totals (across all games) ──');
      const rows = Object.entries(a.eventTotals).sort((x, y) => y[1] - x[1]);
      for (const [k, v] of rows) {
        if (typeof v === 'number' && v > 0) lines.push(`  ${k.padEnd(22)} ${v}`);
      }
    }

    if (a.shortageByResource && Object.keys(a.shortageByResource).length > 0) {
      lines.push('');
      lines.push('── Resource Shortages ──');
      const rows = Object.entries(a.shortageByResource).sort((x, y) => y[1] - x[1]);
      for (const [r, c] of rows) lines.push(`  ${r.padEnd(22)} ${c}`);
    }

    if (a.shipsBuiltByType && Object.keys(a.shipsBuiltByType).length > 0) {
      lines.push('');
      lines.push('── Ships Built ──');
      for (const [s, c] of Object.entries(a.shipsBuiltByType)) lines.push(`  ${s.padEnd(22)} ${c}`);
    }

    if (a.conclusions && a.conclusions.length > 0) {
      lines.push('');
      lines.push(summaryText(a.conclusions));
    }
    if (a.uniqueCrashes.length > 0) {
      lines.push('');
      lines.push('── Unique Crashes (top 10) ──');
      for (const c of a.uniqueCrashes.slice(0, 10)) {
        lines.push(`  [${c.count}×] ${c.message}`);
        if (c.lastAction) lines.push(`        lastAction: ${c.lastAction.type}${c.lastAction.buildingId ? ' '+c.lastAction.buildingId : ''}`);
        if (c.civYear != null) lines.push(`        civYear: ${c.civYear.toFixed?.(1) ?? c.civYear}  (firstGame: ${c.firstGame})`);
      }
    }
    return lines.join('\n');
  }
}
