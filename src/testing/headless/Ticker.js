// ═══════════════════════════════════════════════════════════════
// Ticker — ręczna pętla tick'ów dla testów headless
// ─────────────────────────────────────────────────────────────
// Zastępuje requestAnimationFrame loop z GameScene. Wywołuje
// timeSystem.update(deltaMs) dla określonej liczby civYears.
//
// CIV_TIME_SCALE = 12 (z GameConfig) → 1 civYear = 1/12 fizycznego roku
// Przy multiplier=1 (1d/s): deltaMs = (1/12) * 1000 = ~83.33ms daje 1 civYear/tick
// ═══════════════════════════════════════════════════════════════

import EventBus from '../../core/EventBus.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

const CIV_TIME_SCALE = GAME_CONFIG.CIV_TIME_SCALE; // 12

export class Ticker {
  constructor(timeSystem) {
    this.timeSystem = timeSystem;
    this._onTickHooks = [];       // callbacks wykonywane po każdym time:tick
    this._onCivYearHooks = [];    // callbacks co pełny civYear
    this._crashed = false;
    this._crashError = null;
    this._civYearsElapsed = 0;

    // Przechwytuj błędy w handlerach EventBus, żeby crash nie zatrzymał pętli cicho
    // EventBus już ma try/catch w emit, więc błędy są logowane do console — my je zbieramy
    const origConsoleError = console.error;
    this._consoleErrorPatched = false;
  }

  /** Dodaj hook wywoływany po każdym ticku (fizycznym) */
  onTick(cb) {
    this._onTickHooks.push(cb);
    return this;
  }

  /** Dodaj hook wywoływany raz per civYear (po przekroczeniu granicy) */
  onCivYear(cb) {
    this._onCivYearHooks.push(cb);
    return this;
  }

  /**
   * Uruchom pętlę na określoną liczbę civYears.
   * @param {number} targetCivYears — ile civ-lat zasymulować
   * @param {object} opts
   * @param {number} opts.tickSize — ile civYears per tick (domyślnie 1.0)
   * @param {boolean} opts.stopOnCrash — zatrzymaj przy pierwszym błędzie (domyślnie false)
   * @param {Function} opts.shouldStop — (state) → bool, wczesne zakończenie
   * @returns {object} statystyki: { civYearsCompleted, crashed, error, ticks }
   */
  run(targetCivYears, opts = {}) {
    const tickSize = opts.tickSize ?? 1.0; // civYears per tick
    const stopOnCrash = opts.stopOnCrash ?? false;
    const shouldStop = opts.shouldStop ?? null;

    // deltaMs taki, żeby civDeltaYears = tickSize przy multiplier=1
    // deltaYears = deltaMs/1000 * multiplier → civDeltaYears = deltaYears * 12
    // Chcemy civDeltaYears = tickSize → deltaMs = tickSize / 12 * 1000
    this.timeSystem.multiplierIndex = 5; // 1 rok/s (indeks 5 w TIME_MULTIPLIERS)
    const multiplier = this.timeSystem.multipliers[5]; // =1
    const deltaMs = (tickSize / CIV_TIME_SCALE / multiplier) * 1000;

    const totalTicks = Math.ceil(targetCivYears / tickSize);
    let civYearFloor = Math.floor(this._civYearsElapsed);

    let tick = 0;
    let lastError = null;

    for (; tick < totalTicks; tick++) {
      // Force unpause — nawet jeśli popupy/zdarzenia emitowały time:pause
      this.timeSystem.isPaused = false;

      try {
        this.timeSystem.update(deltaMs);
      } catch (err) {
        lastError = err;
        this._crashed = true;
        this._crashError = err;
        if (stopOnCrash) break;
      }

      this._civYearsElapsed += tickSize;

      // Hook per-tick
      for (const hook of this._onTickHooks) {
        try { hook(this._civYearsElapsed, tick); } catch (err) {
          lastError = err;
          this._crashed = true;
          this._crashError = err;
          if (stopOnCrash) break;
        }
      }

      // Hook per civYear (gdy przekroczono granicę integer civYear)
      const newFloor = Math.floor(this._civYearsElapsed);
      if (newFloor > civYearFloor) {
        for (const hook of this._onCivYearHooks) {
          try { hook(newFloor); } catch (err) {
            lastError = err;
            this._crashed = true;
            this._crashError = err;
            if (stopOnCrash) break;
          }
        }
        civYearFloor = newFloor;
      }

      // Wczesne zakończenie
      if (shouldStop && shouldStop({ civYears: this._civYearsElapsed, tick })) break;
      if (this._crashed && stopOnCrash) break;
    }

    return {
      civYearsCompleted: this._civYearsElapsed,
      ticks: tick,
      crashed: this._crashed,
      error: lastError,
      gameTime: this.timeSystem.gameTime,
    };
  }

  /** Reset — zdjęcie stanu crash + licznika */
  reset() {
    this._crashed = false;
    this._crashError = null;
    this._civYearsElapsed = 0;
  }
}
