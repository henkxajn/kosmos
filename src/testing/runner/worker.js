// ═══════════════════════════════════════════════════════════════
// worker.js — uruchamia JEDNĄ grę w izolowanym procesie (fork mode)
// ─────────────────────────────────────────────────────────────
// Używany przez runner/run.js w --isolated mode. Każda gra = osobny proces
// Node.js → pełna izolacja state, żadnych pamięciowych wycieków między grami.
// IPC: rodzic wysyła config przez process.send lub argv. Worker odpowiada
// pełnym raportem gry.
// ═══════════════════════════════════════════════════════════════

import './../headless/env.js';
import { reseed } from '../headless/env.js';
import { runSingleGame } from './SingleGame.js';
import { RandomBot } from '../bots/RandomBot.js';
import { RuleBot } from '../bots/RuleBot.js';
import { MCTSBot } from '../bots/MCTSBot.js';
import { EvoBot } from '../bots/EvoBot.js';
import { ScriptedBot } from '../bots/ScriptedBot.js';
import { createStandardDetectors } from '../analytics/BottleneckDetector.js';
import { readFileSync } from 'node:fs';

function createBot(spec) {
  if (!spec || !spec.type) return new RandomBot();
  switch (spec.type) {
    case 'random': return new RandomBot(spec.opts ?? {});
    case 'rule':   return new RuleBot(spec.opts ?? {});
    case 'mcts':   return new MCTSBot(spec.opts ?? {});
    case 'evo':    return new EvoBot(spec.opts ?? {});
    case 'scripted': {
      const script = spec.script ?? (spec.scriptPath ? JSON.parse(readFileSync(spec.scriptPath, 'utf-8')) : { actions: [] });
      return new ScriptedBot({ script, fallback: spec.fallback ?? 'idle' });
    }
    default: return new RandomBot();
  }
}

function runWorker(config) {
  const { gameId, seed, bot: botSpec, civYears = 800, decisionsPerCivYear = 1, scenario = 'new-game', detectors: useDetectors = true } = config;

  // Re-seed PRNG dla tej gry
  reseed(seed);

  const bot = createBot(botSpec);
  const { detectors } = useDetectors ? createStandardDetectors() : { detectors: [] };

  const report = runSingleGame({
    bot,
    civYears,
    decisionsPerCivYear,
    gameId,
    seed,
    snapshotInterval: 100,
    detectors,
    scenario,
  });

  return report.toJSON();
}

// ── Entry: IPC mode (jeśli fork) lub standalone (jeśli node worker.js config.json) ──
if (process.send) {
  // IPC mode
  process.on('message', (msg) => {
    if (msg?.cmd === 'run') {
      try {
        const result = runWorker(msg.config);
        process.send({ ok: true, result });
      } catch (err) {
        process.send({ ok: false, error: err?.message ?? String(err), stack: err?.stack });
      }
      // Zakończ po jednej grze
      process.exit(0);
    }
  });
  // Daj znać rodzicowi że worker gotowy
  process.send({ ready: true });
} else if (process.argv[2]) {
  // Standalone mode: node worker.js config.json
  try {
    const config = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
    const result = runWorker(config);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('[worker] fatal:', err?.message);
    process.exit(1);
  }
}
