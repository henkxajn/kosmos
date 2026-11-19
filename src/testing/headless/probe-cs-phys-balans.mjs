// KOSMOS — CS-PHYS-a (plan COLONY_SPHERE §3.8): BALANS z klimatem dotychczasowym vs realistycznym.
//
// Cienka nakładka: ustawia FEATURES.realisticClimate PRZED importem istniejącego runnera BALANS (ten sam driver, bot,
// seedy i galaktyka HEADLESS_GALAXY_SEED), więc GameCore.boot stempluje świat (climateModel 2) albo nie. Klimat nie
// zużywa rzutów RNG, więc ten sam seed daje ten sam świat poza temperaturami — porównanie parami. Nic nie stroi.
//
// Uruchomienie: node src/testing/headless/probe-cs-phys-balans.mjs --climate=on|off --runner=ai|pop [--seeds=N] [--gy=G]
//   (pozostałe argumenty idą do runnera bez zmian; raport HTML runnera nadpisuje się — wynik czytamy z konsoli)

import './env.js';

const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const climateOn = process.argv.includes('--climate=on');
GAME_CONFIG.FEATURES.realisticClimate = climateOn;
const runner = process.argv.find(a => a.startsWith('--runner='))?.split('=')[1] ?? 'ai';
console.log(`[CS-PHYS-a BALANS] realisticClimate=${climateOn} runner=${runner}`);
await import(`./balans-${runner}-telemetry.mjs`);
