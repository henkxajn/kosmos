// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — wspólny DRIVER panelu seedów
// ───────────────────────────────────────────────────────────────
// Jedna pętla „boot → bot → tick → próbkuj raz na GAME-YEAR", współdzielona przez
// WSZYSTKIE czujniki Phase 2 (POP, zasoby, kolejne metryki). Wyekstrahowana z
// `balans-pop-telemetry.mjs` — TA SAMA gra co gate2-report: identyczny boot
// (`civilization_boosted`, solo), ten sam RuleBot, ten sam budżet 4 akcji na civYear,
// ten sam `tickSize` — więc każda metryka mierzy DOKŁADNIE tę samą krzywą.
//
// Czujnik = obiekt z `sample(gy, ctx)` i `getSeries()` (kontrakt PopTelemetry /
// ResourceTelemetry). Driver nie wie nic o metryce — nie klasyfikuje, nie liczy.
//
// ⚠ Kolejność hooków jest KONTRAKTEM (parytet krzywej): najpierw `onCivYear`
// (decyzje bota), potem `onTick` (próbkowanie) — próbka widzi stan PO decyzjach roku.
// Zmiana kolejności zmienia mierzone liczby.
//
// Zero stałych balansu, zero wpływu na logikę gry/bota. Wszystko w GAME-YEARS (HARD #3).
// ═══════════════════════════════════════════════════════════════

import { reseed } from './env.js';
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';
import { ActionCatalog } from '../actions/ActionCatalog.js';
import ActionAdapter from '../actions/ActionAdapter.js';
import { RuleBot } from '../bots/RuleBot.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

export const CIV_PER_GY = GAME_CONFIG.CIV_TIME_SCALE;   // 1 gy = 12 civ-yr

// Parametry przebiegu referencyjnego (parytet z gate2-report / POP slice).
export const DRIVER_DEFAULTS = {
  scenario:          'civilization_boosted',
  solo:              true,
  // Slice AI: imperia + warstwa decyzyjna AI. Domyślnie OFF — panel referencyjny
  // (POP/ZASOBY/ROI/CENY) mierzy solo ekonomię gracza i ma zostać nietknięty.
  aiEmpires:         false,
  actionsPerCivYear: 4,
  tickSize:          1.0,
};

/**
 * Jedna gra: boot + bot + próbkowanie raz na pełny game-year.
 * @param {object}  o
 * @param {string}  o.seed          — seed PRNG (reseed przed bootem)
 * @param {string}  o.planetClass   — GOOD_FE/MEDIAN/POOR lub nieznany klucz (REAL = bez injekcji)
 * @param {number}  o.targetGy      — ile game-lat symulować
 * @param {object}  o.telemetry     — czujnik: { sample(gy, ctx), getSeries() }
 * @param {object} [o.opts]         — nadpisania DRIVER_DEFAULTS (parytet: nie ruszać)
 * @returns {{ seed, series, crashed, core, home }}
 */
export function runOneGame({ seed, planetClass, targetGy, telemetry, opts = {} }) {
  const cfg = { ...DRIVER_DEFAULTS, ...opts };

  reseed(seed);
  const core = new GameCore();
  core.boot({ quiet: true, scenario: cfg.scenario, solo: cfg.solo, aiEmpires: cfg.aiEmpires, planetClass });
  const K = window.KOSMOS;
  const home = core.colonyManager.getColony(K.homePlanet.id);

  const catalog = new ActionCatalog({
    colonyManager: core.colonyManager, techSystem: core.techSystem,
    resourceSystem: core.resourceSystem, buildingSystem: core.buildingSystem,
    vesselManager: core.vesselManager, civSystem: core.civSystem,
    starSystemManager: core.starSystemManager,
  });
  const bot = new RuleBot();

  // Kontekst czujnika — świadomie SZERSZY niż potrzebuje pojedyncza metryka
  // (każdy czujnik destrukturyzuje tylko swoje pola).
  const ctx = {
    home,
    colonyManager:  core.colonyManager,
    vesselManager:  core.vesselManager,
    resourceSystem: core.resourceSystem,
    techSystem:     core.techSystem,
    core,
  };

  telemetry.sample(0, ctx);   // baseline t=0
  let lastGy = 0;

  const ticker = new Ticker(core.timeSystem);
  // 1) decyzje bota (budżet akcji na civYear)
  ticker.onCivYear(() => {
    for (let d = 0; d < cfg.actionsPerCivYear; d++) {
      let a; try { a = bot.decideAction({ homeAlive: true }, catalog); } catch { continue; }
      if (a) { try { ActionAdapter.execute(a); } catch {} }
    }
  });
  // 2) próbkowanie raz na pełny GAME-YEAR (CIV_PER_GY civYear ticków = 1 gy)
  ticker.onTick(() => {
    const g = Math.floor(K.timeSystem.gameTime);
    if (g > lastGy) { lastGy = g; telemetry.sample(g, ctx); }
  });
  ticker.run(targetGy * CIV_PER_GY, { tickSize: cfg.tickSize });

  // `telemetry` zwracane dla czujników, które oprócz szeregu niosą stan boczny
  // (slice AI: dziennik decyzji) — istniejące metryki po prostu tego pola nie czytają.
  return { seed, series: telemetry.getSeries(), crashed: ticker._crashed, core, home, telemetry };
}

/**
 * Panel N seedów (`<prefix>_1`… `<prefix>_N`), każdy ze ŚWIEŻYM czujnikiem z fabryki.
 * @param {Function} o.makeTelemetry — () => czujnik (nowa instancja per seed)
 * @param {Function} [o.onSeed]      — (result, i) → dodatkowe pola wiersza seeda
 * @returns {Array<{seed, crashed, series}>}
 */
export function runSeedPanel({ seeds, seedPrefix, planetClass, targetGy, makeTelemetry, onSeed = null, opts = {} }) {
  const rows = [];
  for (let i = 1; i <= seeds; i++) {
    const seed = `${seedPrefix}_${i}`;
    const r = runOneGame({ seed, planetClass, targetGy, telemetry: makeTelemetry(), opts });
    const row = { seed: r.seed, crashed: r.crashed, series: r.series };
    if (onSeed) Object.assign(row, onSeed(r, i) ?? {});
    rows.push(row);
  }
  return rows;
}

export default runSeedPanel;
