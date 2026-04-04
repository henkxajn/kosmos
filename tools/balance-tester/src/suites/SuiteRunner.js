// SuiteRunner — orkiestracja testów: inicjalizuje runtime, bota, metryki, tickuje grę

import { HeadlessRuntime } from '../headless/HeadlessRuntime.js';
import { EventBusBridge } from '../headless/EventBusBridge.js';
import { MetricsCollector } from '../metrics/MetricsCollector.js';

import { BalancedBot } from '../bots/BalancedBot.js';
import { RushBot } from '../bots/RushBot.js';
import { TurtleBot } from '../bots/TurtleBot.js';
import { GreedyMinerBot } from '../bots/GreedyMinerBot.js';
import { ScienceBot } from '../bots/ScienceBot.js';
import { RandomBot } from '../bots/RandomBot.js';

const BOT_CLASSES = {
  BalancedBot,
  RushBot,
  TurtleBot,
  GreedyMinerBot,
  ScienceBot,
  RandomBot,
};

/**
 * Uruchom pojedynczy run gry.
 * @param {object} options
 * @param {string} options.botName — nazwa klasy bota
 * @param {number} options.seed — seed PRNG
 * @param {number} options.years — ile lat symulować
 * @param {string} options.runId — unikalny ID
 * @param {boolean} options.verbose — szczegółowy output
 * @param {Function} options.runtimeOverride — callback(runtime) do modyfikacji stanu po init
 * @param {string} options.scenario — 'civilization' lub 'civilization_boosted'
 * @returns {object} — sfinalizowane metryki runu
 */
export async function runSingle({ botName, seed, years, runId, verbose = false, runtimeOverride = null, scenario = 'civilization' }) {
  const runtime = new HeadlessRuntime();
  await runtime.init(seed, { scenario });

  // Aplikuj override scenariusza (stress test)
  if (runtimeOverride) {
    runtimeOverride(runtime);
  }

  const BotClass = BOT_CLASSES[botName];
  if (!BotClass) throw new Error(`Nieznany bot: ${botName}`);
  const bot = new BotClass(runtime);

  const collector = new MetricsCollector(runId, botName, seed);
  const bridge = new EventBusBridge(runtime.getEventBus(), collector);
  bridge.attach();

  const TICK_YEARS = 0.1; // Bot podejmuje decyzję co 0.1 roku gry (= 1.2 civYear)
  let year = 0;

  while (year < years && !runtime.isGameOver()) {
    // Bot podejmuje decyzję
    const state = runtime.getState();
    collector.updateState(state);

    // Factory allocation AUTOMATYCZNA (nie blokuje decyzji bota)
    if (state.factory.totalPoints > 0) {
      bot._autoAllocateFactory(runtime, state);
    }

    const decision = bot.decide(state);
    if (decision) {
      collector.recordDecision(decision.type);
      if (verbose && year % 50 === 0) {
        process.stdout.write(
          `  [${runId}] Rok ${Math.round(year)}: ${decision.name ?? decision.type} ` +
          `| pop=${state.colony.population} morale=${Math.round(state.colony.morale)} ` +
          `| food=${Math.round(state.resources.inventory.food ?? 0)} ` +
          `| energy=${(state.resources.energyBalance ?? 0).toFixed(1)}\n`
        );
      }
      // DEBUG: pokaż decyzje w pierwszych 30 latach (tylko verbose)
      if (verbose && year < 40) {
        const priorities = bot.evaluatePriorities(state);
        priorities.sort((a, b) => b.score - a.score);
        const top5 = priorities.slice(0, 5).map(p => `${p.name}=${p.score}`).join(', ');
        const inv = state.resources.inventory;
        const bldgs = state.buildings.active.map(b => `${b.buildingId}${b.level > 1 ? `(${b.level})` : ''}`).join(',');
        const famine = state.colony.isFamine ? ' FAMINE' : '';
        const unrest = state.colony.isUnrest ? ' UNREST' : '';
        const foodRate = (state.resources.perYear.food ?? 0).toFixed(1);
        const waterRate = (state.resources.perYear.water ?? 0).toFixed(1);
        const constr = state.buildings.constructionQueue?.length ?? 0;
        process.stdout.write(
          `    [yr${Math.round(year)}] pop=${state.colony.population} housing=${state.colony.housing} energy=${(state.resources.energyBalance ?? 0).toFixed(1)} | ` +
          `Fe=${Math.round(inv.Fe ?? 0)} Si=${Math.round(inv.Si ?? 0)} Cu=${Math.round(inv.Cu ?? 0)} steel=${inv.steel_plates ?? 0}${famine}${unrest}\n` +
          `             bldgs=[${bldgs}] constr=${constr} fac=${state.factory.totalPoints}pt | ${decision.name}: ${top5}\n`
        );
      }
    } else {
      collector.recordDecision('idle');
      // DEBUG: pokaż idle ticki gdy verbose — z priorytetami i zasobami
      if (verbose && year < 50) {
        const inv = state.resources.inventory;
        const famine = state.colony.isFamine ? ' FAMINE' : '';
        const unrest = state.colony.isUnrest ? ' UNREST' : '';
        const bldgs = state.buildings.active.map(b => `${b.buildingId}${b.level > 1 ? `(${b.level})` : ''}`).join(',');
        // Priorytety i lastBuildFail
        const priorities = bot.evaluatePriorities(state);
        priorities.sort((a, b) => b.score - a.score);
        const top5 = priorities.slice(0, 5).map(p => `${p.name}=${p.score}`).join(', ');
        const lastFail = bot._lastBuildFail ?? '?';
        const freeTiles = state.grid?.freeBuildable ?? '?';
        process.stdout.write(
          `    [yr${Math.round(year)}] pop=${state.colony.population} housing=${state.colony.housing} energy=${(state.resources.energyBalance ?? 0).toFixed(1)} | ` +
          `Fe=${Math.round(inv.Fe ?? 0)} Si=${Math.round(inv.Si ?? 0)} Cu=${Math.round(inv.Cu ?? 0)} steel=${inv.steel_plates ?? 0} drills=${inv.mining_drills ?? 0} hab=${inv.habitat_modules ?? 0}${famine}${unrest}\n` +
          `             bldgs=[${bldgs}] tiles=${freeTiles} fac=${state.factory.totalPoints}pt\n` +
          `             IDLE: [${top5}] lastFail=${lastFail}\n`
        );
      }
    }

    // Advance 1 rok
    runtime.tick(TICK_YEARS);
    year += TICK_YEARS;
  }

  // Finalizuj
  const finalState = runtime.getState();
  collector.updateState(finalState);
  const result = collector.finalize(finalState);

  bridge.detach();

  if (verbose) {
    console.log(
      `  [${runId}] KONIEC rok ${Math.round(finalState.gameYear)}: ` +
      `pop=${finalState.colony.population}, morale=${Math.round(finalState.colony.morale)}, ` +
      `techs=${finalState.tech.researched.length}, buildings=${finalState.buildings.active.length}`
    );
  }

  return result;
}

/**
 * Uruchom suite testowy (wiele runów).
 * @param {object} config
 * @param {Array<{botName, runs}>} config.bots — lista botów z liczbą runów
 * @param {number} config.years — lat per run
 * @param {boolean} config.verbose
 * @param {Function} config.runtimeOverride — callback(runtime) dla stress scenarios
 * @param {string} config.scenario — 'civilization' lub 'civilization_boosted'
 * @returns {Array<object>} — tablica wyników
 */
export async function runSuite({ bots, years, verbose = false, runtimeOverride = null, scenario = 'civilization' }) {
  const results = [];
  let runIndex = 0;

  for (const { botName, runs } of bots) {
    console.log(`\n── ${botName}: ${runs} runów × ${years} lat ──`);

    for (let i = 0; i < runs; i++) {
      const seed = 1000 + runIndex * 7919; // deterministyczne różne seedy
      const runId = `${botName}_${String(i + 1).padStart(3, '0')}`;

      try {
        const result = await runSingle({ botName, seed, years, runId, verbose, runtimeOverride, scenario });
        results.push(result);

        if (!verbose) {
          // Pasek postępu
          const pct = Math.round(((i + 1) / runs) * 100);
          process.stdout.write(`\r  Postęp: ${i + 1}/${runs} (${pct}%)`);
        }
      } catch (err) {
        console.error(`\n  BŁĄD w ${runId}:`, err.message);
        if (verbose) console.error(err.stack);
      }

      runIndex++;
    }
    if (!verbose) console.log(''); // nowa linia po pasku postępu
  }

  return results;
}
