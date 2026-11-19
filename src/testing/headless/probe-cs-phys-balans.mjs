// KOSMOS — CS-PHYS-a / CS-PHYS-b3 (plan COLONY_SPHERE §3.8, §3.9.2): BALANS z klimatem / orbitami dotychczasowymi vs
// realistycznymi.
//
// Cienka nakładka: ustawia FEATURES.realisticClimate i FEATURES.scaledOrbits PRZED importem istniejącego runnera BALANS
// (ten sam driver, bot, seedy i galaktyka HEADLESS_GALAXY_SEED), więc GameCore.boot stempluje świat (climateModel 2,
// orbitModel 2) albo nie. Nic nie stroi.
//
// CS-PHYS-b3: raporty runnera (`<prefix>-telemetry-REAL.json` / `<prefix>-report-REAL.html`) NIE są już nadpisywane —
// z `--tag=X` zapis idzie do `<prefix>-telemetry-REAL.X.json` / `.X.html` (przekierowanie fs.writeFileSync +
// syncBuiltinESMExports, zanim runner zaimportuje `node:fs`). Bez `--tag` zachowanie jak dawniej (nadpisuje).
//
// Uruchomienie: node src/testing/headless/probe-cs-phys-balans.mjs --climate=on|off [--orbits=on|off] --runner=ai|pop
//   [--tag=X] [--seeds=N] [--gy=G]   (pozostałe argumenty idą do runnera bez zmian)

import './env.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const climateOn = process.argv.includes('--climate=on');
const orbitsOn = process.argv.includes('--orbits=on');
GAME_CONFIG.FEATURES.realisticClimate = climateOn;
GAME_CONFIG.FEATURES.scaledOrbits = orbitsOn;
const runner = process.argv.find(a => a.startsWith('--runner='))?.split('=')[1] ?? 'ai';
const tag = process.argv.find(a => a.startsWith('--tag='))?.split('=')[1] ?? null;

if (tag) {
  // Przekierowanie zapisu raportów runnera na nazwy z tagiem (równoległe przebiegi nie kolidują).
  const origWrite = fs.writeFileSync;
  fs.writeFileSync = function (path, ...rest) {
    let p = path;
    if (typeof p === 'string') p = p.replace(/-(REAL|[A-Z_]+)\.(json|html)$/, (m, cls, ext) => `-${cls}.${tag}.${ext}`);
    return origWrite.call(this, p, ...rest);
  };
  syncBuiltinESMExports();
}

console.log(`[CS-PHYS BALANS] realisticClimate=${climateOn} scaledOrbits=${orbitsOn} runner=${runner} tag=${tag ?? '—'}`);
await import(`./balans-${runner}-telemetry.mjs`);
