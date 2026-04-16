#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// run.js — główny CLI runner dla KOSMOS QA testów
// ─────────────────────────────────────────────────────────────
// Użycie:
//   node src/testing/runner/run.js [flags]
//
// Flagi:
//   --mode=quick|normal|deep      Preset długości (quick=100g×300y, normal=500g×800y, deep=100g×3000y)
//   --games=N                     Liczba gier (override mode)
//   --years=N                     Liczba civYears (override mode)
//   --bot=random|rule|mcts|evo|scripted   Typ bota (default: random)
//   --script=path/to.json         Skrypt dla bot=scripted
//   --evo-weights=path/to.json    Wagi dla bot=evo (z evo_weights.json)
//   --seed=prefix                 Prefix seed'a (seed per-gra = seed_<i>)
//   --isolated                    Fork per-gra (wolniej ale 100% izolacja)
//   --concurrency=N               Parallel workers w --isolated (default: 1)
//   --scenario=new-game|first-contact|war   (default: new-game)
//   --out=path/reports            Folder na raporty (default: src/testing/reports)
//   --quiet                       Mniej logów
//
// Przykłady:
//   node src/testing/runner/run.js --mode=quick --bot=rule
//   node src/testing/runner/run.js --games=50 --years=500 --bot=mcts
//   node src/testing/runner/run.js --bot=evo --evo-weights=src/testing/reports/evo_weights.json
// ═══════════════════════════════════════════════════════════════

import './../headless/env.js';
import { reseed } from '../headless/env.js';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { Reporter } from '../analytics/Reporter.js';
import { runSingleGame } from './SingleGame.js';
import { createStandardDetectors } from '../analytics/BottleneckDetector.js';
import { RandomBot } from '../bots/RandomBot.js';
import { RuleBot } from '../bots/RuleBot.js';
import { MCTSBot } from '../bots/MCTSBot.js';
import { EvoBot } from '../bots/EvoBot.js';
import { ScriptedBot } from '../bots/ScriptedBot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Parse CLI args ─────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=');
      out[k] = v === undefined ? true : v;
    }
  }
  return out;
}

const MODE_PRESETS = {
  quick:  { games: 100, years: 300 },
  normal: { games: 500, years: 800 },
  deep:   { games: 100, years: 3000 },
};

function resolveConfig(args) {
  const mode = args.mode ?? 'normal';
  const preset = MODE_PRESETS[mode] ?? MODE_PRESETS.normal;
  const games = parseInt(args.games ?? preset.games);
  const years = parseInt(args.years ?? preset.years);
  const botType = args.bot ?? 'random';
  const seedPrefix = args.seed ?? `kosmos-${Date.now()}`;
  const isolated = !!args.isolated;
  const concurrency = parseInt(args.concurrency ?? 1);
  const quiet = !!args.quiet;
  const outDir = args.out ?? `${__dirname}/../reports`;
  const scenario = args.scenario ?? 'new-game';

  const botSpec = { type: botType };
  if (botType === 'scripted' && args.script) {
    botSpec.script = JSON.parse(readFileSync(args.script, 'utf-8'));
    botSpec.scriptPath = args.script;
  }
  if (botType === 'evo' && args['evo-weights']) {
    try {
      const weightsData = JSON.parse(readFileSync(args['evo-weights'], 'utf-8'));
      botSpec.opts = { weights: weightsData.weights ?? weightsData };
    } catch (err) {
      console.warn(`[run] Nie wczytano wag evo: ${err.message}`);
    }
  }

  return { mode, games, years, botType, seedPrefix, isolated, concurrency, quiet, outDir, scenario, botSpec };
}

function createLocalBot(spec) {
  switch (spec.type) {
    case 'random': return new RandomBot(spec.opts ?? {});
    case 'rule':   return new RuleBot(spec.opts ?? {});
    case 'mcts':   return new MCTSBot(spec.opts ?? {});
    case 'evo':    return new EvoBot(spec.opts ?? {});
    case 'scripted': return new ScriptedBot({ script: spec.script ?? { actions: [] }, fallback: spec.fallback ?? 'idle' });
    default:       return new RandomBot();
  }
}

// ── In-process runner (default, fast) ──────────────────────────────
async function runInProcess(cfg, reporter) {
  for (let i = 1; i <= cfg.games; i++) {
    const seed = `${cfg.seedPrefix}_${i}`;
    reseed(seed);

    const bot = createLocalBot(cfg.botSpec);
    const { detectors } = createStandardDetectors();
    const rep = runSingleGame({
      bot,
      civYears: cfg.years,
      decisionsPerCivYear: 1,
      gameId: `game_${i}`,
      seed,
      snapshotInterval: 100,
      detectors,
      scenario: cfg.scenario,
    });
    reporter.games.push(rep);

    if (!cfg.quiet) {
      const dot = rep.outcome === 'crash' ? '!' : rep.outcome === 'game_over' ? 'x' : '.';
      process.stdout.write(dot);
      if (i % 50 === 0) process.stdout.write(` ${i}\n`);
    }
  }
  if (!cfg.quiet) process.stdout.write('\n');
}

// ── Fork-based runner (--isolated, slower, 100% isolated) ──────────
async function runWithWorkers(cfg, reporter) {
  const workerPath = pathResolve(__dirname, 'worker.js');
  const pool = [];
  let nextId = 1;
  let activeJobs = 0;
  const concurrency = Math.max(1, cfg.concurrency);

  return new Promise((resolveOut) => {
    const tryLaunch = () => {
      while (activeJobs < concurrency && nextId <= cfg.games) {
        const gameId = `game_${nextId}`;
        const seed = `${cfg.seedPrefix}_${nextId}`;
        nextId++;
        activeJobs++;

        const child = fork(workerPath, [], { env: { ...process.env, KOSMOS_SEED: seed, KOSMOS_QUIET: '1' }, silent: true });
        child.on('message', (msg) => {
          if (msg?.ready) {
            child.send({ cmd: 'run', config: {
              gameId,
              seed,
              bot: cfg.botSpec,
              civYears: cfg.years,
              decisionsPerCivYear: 1,
              scenario: cfg.scenario,
              detectors: true,
            }});
          } else if (msg?.ok) {
            // Rekonstruuj report z JSON
            const rep = msg.result;
            rep.toJSON = () => rep;
            reporter.games.push(rep);
            if (!cfg.quiet) {
              const dot = rep.outcome === 'crash' ? '!' : rep.outcome === 'game_over' ? 'x' : '.';
              process.stdout.write(dot);
              if ((nextId - 1) % 50 === 0) process.stdout.write(` ${nextId-1}\n`);
            }
          } else if (msg?.error) {
            reporter.games.push({ id: gameId, seed, outcome: 'crash', errors: [{ message: msg.error, stack: msg.stack }], toJSON: () => ({ id: gameId, outcome: 'crash', error: msg.error }) });
            if (!cfg.quiet) process.stdout.write('!');
          }
        });
        child.on('exit', () => {
          activeJobs--;
          if (nextId > cfg.games && activeJobs === 0) {
            resolveOut();
          } else {
            tryLaunch();
          }
        });
      }
    };
    tryLaunch();
  });
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  const cfg = resolveConfig(args);

  console.log(`═══ KOSMOS QA Runner ═══`);
  console.log(`Mode: ${cfg.mode}  Games: ${cfg.games}  Years: ${cfg.years}  Bot: ${cfg.botType}`);
  console.log(`Scenario: ${cfg.scenario}  Seed prefix: ${cfg.seedPrefix}`);
  console.log(`Isolated: ${cfg.isolated}${cfg.isolated ? ` (concurrency=${cfg.concurrency})` : ''}`);
  console.log('');

  const reporter = new Reporter({ runName: `kosmos-qa-${cfg.mode}-${cfg.botType}` });
  const t0 = Date.now();

  if (cfg.isolated) {
    await runWithWorkers(cfg, reporter);
  } else {
    await runInProcess(cfg, reporter);
  }

  const elapsed = Date.now() - t0;
  console.log(reporter.toSummary());
  console.log(`\nCzas: ${(elapsed/1000).toFixed(2)}s (${(cfg.games/elapsed*1000).toFixed(1)} gier/s)`);

  // Zapis raportu
  try { mkdirSync(cfg.outDir, { recursive: true }); } catch {}
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonFile = `${cfg.outDir}/run-${ts}.json`;
  writeFileSync(jsonFile, JSON.stringify(reporter.toJSON(), null, 2));
  const summaryFile = `${cfg.outDir}/run-${ts}.md`;
  writeFileSync(summaryFile, reporter.toSummary());
  console.log(`\nRaporty:\n  ${jsonFile}\n  ${summaryFile}`);

  process.exit(reporter.getAggregate().crashed > 0 ? 1 : 0);
}

main().catch(err => { console.error('[run]', err); process.exit(1); });
