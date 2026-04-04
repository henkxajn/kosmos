#!/usr/bin/env node
// KOSMOS Balance Tester — CLI entry point
// Użycie:
//   node run.js --suite quick          → 50 runów BalancedBot × 200 lat
//   node run.js --suite full           → 550 runów × 500 lat (pełna walidacja)
//   node run.js --suite stress         → 350 runów × 300 lat (edge cases)
//   node run.js --bot BalancedBot --runs 10 --years 100   → custom run
//   node run.js --suite quick --verbose   → szczegółowy output
//   node run.js --seed 42 --bot BalancedBot --runs 1 --years 50 --verbose   → debug single run

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

import { runSuite, runSingle } from './src/suites/SuiteRunner.js';
import { QuickSuite } from './src/suites/QuickSuite.js';
import { FullSuite } from './src/suites/FullSuite.js';
import { StressSuite } from './src/suites/StressSuite.js';
import { BoostedSuite } from './src/suites/BoostedSuite.js';
import { Boosted40Suite } from './src/suites/Boosted40Suite.js';

import { StatisticalAnalyzer } from './src/analysis/StatisticalAnalyzer.js';
import { BottleneckDetector } from './src/analysis/BottleneckDetector.js';
import { DeathSpiralDetector } from './src/analysis/DeathSpiralDetector.js';
import { DominantStrategyDetector } from './src/analysis/DominantStrategyDetector.js';
import { PacingAnalyzer } from './src/analysis/PacingAnalyzer.js';
import { TechUsageAnalyzer } from './src/analysis/TechUsageAnalyzer.js';
import { ReportGenerator } from './src/report/ReportGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Parsuj argumenty CLI ──
function parseArgs(argv) {
  const args = {
    suite: null,
    bot: null,
    runs: null,
    years: null,
    seed: null,
    verbose: false,
    output: join(__dirname, 'reports'),
    jsonOnly: false,
    scenario: 'civilization',
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--suite': case '-s':
        args.suite = argv[++i]; break;
      case '--bot': case '-b':
        args.bot = argv[++i]; break;
      case '--runs': case '-r':
        args.runs = parseInt(argv[++i], 10); break;
      case '--years': case '-y':
        args.years = parseInt(argv[++i], 10); break;
      case '--seed':
        args.seed = parseInt(argv[++i], 10); break;
      case '--verbose': case '-v':
        args.verbose = true; break;
      case '--output': case '-o':
        args.output = argv[++i]; break;
      case '--json':
        args.jsonOnly = true; break;
      case '--scenario':
        args.scenario = argv[++i]; break;
      case '--help': case '-h':
        printHelp(); process.exit(0); break;
      default:
        console.error(`Nieznana opcja: ${argv[i]}`);
        printHelp(); process.exit(1);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║            KOSMOS Balance Tester — CLI                      ║
╚══════════════════════════════════════════════════════════════╝

Użycie:
  node run.js [opcje]

Opcje:
  --suite, -s <nazwa>   Suite testowy: quick | full | stress
  --bot, -b <nazwa>     Bot: BalancedBot | RushBot | TurtleBot | GreedyMinerBot | ScienceBot | RandomBot
  --runs, -r <N>        Liczba runów (domyślnie: wg suite)
  --years, -y <N>       Lat per run (domyślnie: wg suite)
  --seed <N>            Seed PRNG (dla single run)
  --verbose, -v         Szczegółowy output
  --output, -o <dir>    Katalog na raporty (domyślnie: ./reports)
  --json                Tylko JSON (bez raportu HTML)
  --help, -h            Pomoc

Przykłady:
  node run.js --suite quick              50 runów BalancedBot × 200 lat
  node run.js --suite full               550 runów × 500 lat (pełna walidacja)
  node run.js --suite stress             Edge cases
  node run.js -b BalancedBot -r 5 -y 100 -v   Custom test
  node run.js --seed 42 -b BalancedBot -r 1 -y 50 -v   Debug single run
`);
}

// ── Suites ──
const SUITES = {
  quick: QuickSuite,
  full: FullSuite,
  stress: StressSuite,
  boosted: BoostedSuite,
  boosted40: Boosted40Suite,
};

// ── Main ──
async function main() {
  const args = parseArgs(process.argv);
  const startTime = Date.now();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║            KOSMOS Balance Tester v1.0                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  let suiteConfig;

  if (args.suite) {
    // Predefiniowany suite
    suiteConfig = SUITES[args.suite];
    if (!suiteConfig) {
      console.error(`Nieznany suite: ${args.suite}. Dostępne: ${Object.keys(SUITES).join(', ')}`);
      process.exit(1);
    }
    console.log(`Suite: ${suiteConfig.name} — ${suiteConfig.description}`);
  } else if (args.bot) {
    // Custom configuration
    suiteConfig = {
      name: 'custom',
      description: `Custom: ${args.runs ?? 10} runów ${args.bot} × ${args.years ?? 200} lat`,
      bots: [{ botName: args.bot, runs: args.runs ?? 10 }],
      years: args.years ?? 200,
    };
    console.log(`Custom test: ${suiteConfig.description}`);
  } else {
    // Default: quick suite
    suiteConfig = QuickSuite;
    console.log(`Suite: ${suiteConfig.name} — ${suiteConfig.description} (domyślny)`);
  }

  // ── Uruchom testy ──
  let results;

  if (args.suite === 'stress' && StressSuite.scenarios) {
    // Stress suite: uruchom każdy scenariusz osobno
    results = await runStressSuite(StressSuite, args);
  } else {
    const effectiveScenario = suiteConfig.scenario ?? args.scenario;
    const scenarioLabel = effectiveScenario !== 'civilization' ? ` [${effectiveScenario}]` : '';
    console.log(`\nRozpoczynam symulację: ${suiteConfig.bots.map(b => `${b.botName}×${b.runs}`).join(', ')} × ${suiteConfig.years} lat${scenarioLabel}\n`);
    const scenario = suiteConfig.scenario ?? args.scenario;
    results = await runSuite({
      bots: suiteConfig.bots,
      years: suiteConfig.years,
      verbose: args.verbose,
      scenario,
    });
  }

  if (results.length === 0) {
    console.error('\nBrak wyników — żaden run nie zakończył się sukcesem.');
    process.exit(1);
  }

  const simTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n── Symulacja zakończona: ${results.length} runów w ${simTime}s ──\n`);

  // ── Analiza ──
  console.log('Analiza statystyczna...');
  const analyzer = new StatisticalAnalyzer(results);
  const analysis = analyzer.analyze();

  console.log('Detekcja bottlenecków...');
  const bottleneckDetector = new BottleneckDetector();
  const bottlenecks = bottleneckDetector.analyze(results);

  console.log('Detekcja death spirals...');
  const deathSpiralDetector = new DeathSpiralDetector();
  const spirals = deathSpiralDetector.analyze(results);

  console.log('Analiza strategii dominujących...');
  const dominantDetector = new DominantStrategyDetector();
  const dominant = dominantDetector.analyze(analysis._comparison);

  console.log('Analiza pacing...');
  const pacingAnalyzer = new PacingAnalyzer();
  const pacing = pacingAnalyzer.analyze(results, analysis._overall?.milestones);

  console.log('Analiza użycia technologii...');
  const techUsageAnalyzer = new TechUsageAnalyzer();
  const techUsage = techUsageAnalyzer.analyze(results);

  // ── Zapisz surowe dane JSON ──
  mkdirSync(args.output, { recursive: true });
  const jsonPath = join(args.output, `data_${suiteConfig.name}_${Date.now()}.json`);
  const jsonData = {
    config: { suite: suiteConfig.name, timestamp: new Date().toISOString(), simTimeSeconds: parseFloat(simTime) },
    analysis,
    bottlenecks,
    spirals,
    dominant,
    pacing,
    techUsage,
    rawResults: results,
  };
  writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf-8');
  console.log(`\nDane JSON: ${jsonPath}`);

  // ── Generuj raport HTML ──
  if (!args.jsonOnly) {
    console.log('Generowanie raportu HTML...');
    const reportGen = new ReportGenerator(
      analysis, bottlenecks, spirals, dominant, pacing, techUsage,
      { suite: suiteConfig.name, simTimeSeconds: parseFloat(simTime), timestamp: new Date().toISOString(), years: suiteConfig.years ?? args.years },
      results
    );
    const htmlPath = reportGen.generate(args.output);
    console.log(`Raport HTML: ${htmlPath}`);
  }

  // ── Podsumowanie w konsoli ──
  printConsoleSummary(analysis, bottlenecks, spirals, dominant, pacing, techUsage);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n── Całkowity czas: ${totalTime}s ──\n`);
}

/**
 * Uruchom stress suite z scenariuszami
 */
async function runStressSuite(suite, args) {
  const allResults = [];

  for (const scenario of suite.scenarios) {
    console.log(`\n═══ Scenariusz: ${scenario.name} ═══`);
    console.log(`    ${scenario.description}`);

    const results = await runSuite({
      bots: suite.bots,
      years: suite.years,
      verbose: args.verbose,
      // Scenariusz override przekazany jako callback
      runtimeOverride: scenario.override,
    });

    // Taguj wyniki scenariuszem
    for (const r of results) {
      r.scenario = scenario.name;
    }
    allResults.push(...results);
  }

  return allResults;
}

/**
 * Wydrukuj podsumowanie w konsoli
 */
function printConsoleSummary(analysis, bottlenecks, spirals, dominant, pacing, techUsage) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    PODSUMOWANIE                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const overall = analysis._overall;
  if (overall) {
    console.log(`\n  Runów: ${overall.runCount}`);
    console.log(`  Przeżywalność: ${overall.aliveRate}%`);
    console.log(`  Stabilność: ${overall.stableRate}%`);
    console.log(`  Populacja (mediana): ${overall.finalPopulation?.median ?? '?'}`);
    console.log(`  Morale (mediana): ${overall.finalMorale?.median ?? '?'}`);
    console.log(`  Technologie (mediana): ${overall.finalTechs?.median ?? '?'}`);
    console.log(`  Composite score: ${overall.compositeScore?.mean?.toFixed(0) ?? '?'} (±${overall.compositeScore?.stddev?.toFixed(0) ?? '?'})`);
  }

  // Bottlenecki
  if (bottlenecks.length > 0) {
    console.log('\n  ── Bottlenecki (top 3) ──');
    for (const b of bottlenecks.slice(0, 3)) {
      console.log(`    ${b.resource}: ${b.runsAffectedPct}% runów, avg ${b.avgEventsPerRun} zdarzeń/run`);
    }
  }

  // Death spirals
  if (spirals.overallRate > 0) {
    console.log(`\n  ── Death spirals: ${spirals.overallRate}% runów ──`);
    for (const s of spirals.spirals) {
      console.log(`    ${s.type}: ${s.frequency}% (onset: rok ${s.avgOnsetYear ?? '?'})`);
    }
  }

  // Dominant strategy
  if (dominant.findings?.length > 0) {
    console.log('\n  ── Strategia dominująca ──');
    for (const f of dominant.findings) {
      const icon = f.severity === 'CRITICAL' ? '!!!' : f.severity === 'WARNING' ? '!!' : 'i';
      console.log(`    [${icon}] ${f.message}`);
    }
  }

  // Pacing issues
  if (pacing.pacingIssues?.length > 0) {
    console.log('\n  ── Pacing ──');
    console.log(`    Idle years: ${pacing.avgIdleYears} (${pacing.idlePct}%)`);
    for (const p of pacing.pacingIssues.slice(0, 3)) {
      console.log(`    [${p.severity}] ${p.message}`);
    }
  }

  // Dead/OP techs
  if (techUsage.deadTechs?.length > 0) {
    console.log(`\n  ── Martwe technologie: ${techUsage.deadTechs.map(t => t.techId).join(', ')} ──`);
  }
  if (techUsage.opTechs?.length > 0) {
    console.log(`  ── OP technologie: ${techUsage.opTechs.map(t => t.techId).join(', ')} ──`);
  }

  // Strategy comparison
  const comparison = analysis._comparison;
  if (comparison && comparison.length > 1) {
    console.log('\n  ── Ranking strategii ──');
    for (let i = 0; i < comparison.length; i++) {
      const c = comparison[i];
      console.log(`    ${i + 1}. ${c.botName}: score=${c.score.mean.toFixed(0)} pop=${c.avgPop.toFixed(0)} techs=${c.avgTechs.toFixed(1)} alive=${c.aliveRate}%`);
    }
  }
}

// ── Run ──
main().catch(err => {
  console.error('\n BŁĄD KRYTYCZNY:', err.message);
  console.error(err.stack);
  process.exit(1);
});
