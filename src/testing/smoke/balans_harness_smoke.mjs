// BALANS 1.0 — headless harness keeper. Chroni instrument (GameCore solo flag,
// parallel action budget, research-via-queueTech) przed cichą regresją — instrument
// nie ma browser live-gate, więc telemetria zepsuta bez śladu = najgorszy scenariusz.
//
//   T1  solo flag: solo→0 imperiów + brak RandomEventSystem; normal→imperia + eventy (regresja)
//   (T2/T3 dopisywane w kolejnych commitach BALANS — parallel budget, research queueTech)

import '../headless/env.js';           // MUST be first (mocki window/document/THREE + seeded RNG)
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── T1: solo flag ─────────────────────────────────────────────────
console.log('T1 — solo flag (neutralize AI aggression + RandomEventSystem off)');
{
  const solo = new GameCore();
  solo.boot({ quiet: true, scenario: 'civilization', solo: true });
  assert(solo.empireRegistry.listAll().length === 0, 'solo: 0 obcych imperiów (brak agresji AI)');
  assert(solo.randomEventSystem === null, 'solo: RandomEventSystem OFF (determinizm)');
  let crashed = false;
  try { new Ticker(solo.timeSystem).run(24, { tickSize: 1.0, stopOnCrash: true }); }
  catch { crashed = true; }
  assert(!crashed, 'solo: 24 civYears bez crasha (null RandomEventSystem bezpieczny)');

  const norm = new GameCore();
  norm.boot({ quiet: true, scenario: 'civilization', solo: false });
  assert(norm.empireRegistry.listAll().length > 0, 'normal: obce imperia spawnują się (brak regresji)');
  assert(norm.randomEventSystem !== null, 'normal: RandomEventSystem ON (brak regresji)');
}

// ── Wynik ─────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
