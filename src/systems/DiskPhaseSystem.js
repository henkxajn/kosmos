// DiskPhaseSystem — ewolucja protoplanetarnego dysku akrecyjnego
//
// Trzy fazy układu planetarnego (wg czasu gry):
//   DISK      (0 – 1 Mln lat):   aktywny dysk, wiele kolizji i impaktów
//   CLEARING  (1–5 Mln lat):     oczyszczanie orbit, rezonanse Kirkwooda
//   MATURE    (> 5 Mln lat):     układ stabilny, życie w pełni możliwe
//
// Efekty mechaniczne:
//   DISK:     pas asteroid generuje 30% więcej uderzeń (mnożnik kolizji)
//   CLEARING: co 50 000 lat gry — ciała o e>0.7 dostają +0.03 e (torowanie ku ejekcji)
//   MATURE:   układ stabilny, brak dodatkowych efektów
//
// Komunikacja:
//   Nasłuchuje: 'time:tick'
//   Emituje:    'disk:phaseChanged' { oldPhase, newPhase, gameTime }
//
// Stan jest dostępny globalnie przez window.KOSMOS.diskPhase

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';

// ── Progi czasowe przejść między fazami (lata gry) ────────────────────────────
const DISK_END     = 1_000_000;   // 1 milion lat → koniec fazy DISK
const CLEARING_END = 5_000_000;   // 5 milionów lat → koniec fazy CLEARING

// ── Definicje faz ─────────────────────────────────────────────────────────────
export const DISK_PHASES = {
  DISK:     { id: 'DISK',     namePL: 'Dysk protoplanetarny', color: '#cc4422', icon: '🌑' },
  CLEARING: { id: 'CLEARING', namePL: 'Oczyszczanie orbit',   color: '#ccaa22', icon: '🌓' },
  MATURE:   { id: 'MATURE',   namePL: 'Układ dojrzały',       color: '#44cc66', icon: '🌍' },
};

// Co ile lat gry sprawdzamy efekty fazowe (CLEARING)
const CLEARING_CHECK_INTERVAL = 50_000;  // lat

export class DiskPhaseSystem {
  constructor(timeSystem) {
    this.timeSystem = timeSystem;

    // Faza na starcie — scenariusz Eden zaczyna w MATURE (brak blokerów życia)
    // Normalny start: faza zależy od gameTime (wczytany save może być w MATURE)
    this._currentPhase  = window.KOSMOS?.edenScenario
      ? 'MATURE'
      : this._phaseForTime(timeSystem.gameTime);
    this._clearingAccum = 0;

    // Udostępnij globalnie
    window.KOSMOS.diskPhase = this._currentPhase;

    // Pętla czasu
    EventBus.on('time:tick', ({ deltaYears, gameTime }) => this._update(deltaYears, gameTime));
  }

  get currentPhase() { return this._currentPhase; }

  // ── Prywatne ──────────────────────────────────────────────────────────────

  _phaseForTime(gameTime) {
    if (gameTime < DISK_END)     return 'DISK';
    if (gameTime < CLEARING_END) return 'CLEARING';
    return 'MATURE';
  }

  _update(deltaYears, gameTime) {
    const newPhase = this._phaseForTime(gameTime);

    // Wykryj przejście fazy
    if (newPhase !== this._currentPhase) {
      const oldPhase = this._currentPhase;
      this._currentPhase       = newPhase;
      window.KOSMOS.diskPhase  = newPhase;
      EventBus.emit('disk:phaseChanged', {
        oldPhase, newPhase, gameTime,
        oldPhasePL: DISK_PHASES[oldPhase].namePL,
        newPhasePL: DISK_PHASES[newPhase].namePL,
      });
    }

    // Efekt CLEARING: asteroidy/planetoidy o wysokiej ekscentryczności
    // stopniowo tracą stabilność orbitalną (zbliżają się ku ejekcji)
    if (this._currentPhase === 'CLEARING') {
      this._clearingAccum += deltaYears;
      if (this._clearingAccum >= CLEARING_CHECK_INTERVAL) {
        this._clearingAccum = 0;
        this._applyOrbitalClearing();
      }
    }
  }

  // Destabilizuj niestabilne małe ciała w fazie CLEARING
  _applyOrbitalClearing() {
    const smallBodies = [
      ...EntityManager.getByType('asteroid'),
      ...EntityManager.getByType('comet'),
      ...EntityManager.getByType('planetoid'),
    ];

    let ejected = 0;
    for (const body of smallBodies) {
      if (!body.orbital) continue;
      // Ciała o dużej ekscentryczności dostają dodatkowego kopa
      if (body.orbital.e > 0.70) {
        body.orbital.e = Math.min(0.99, body.orbital.e + 0.03);
        // Jeśli orbit stał się hiperboliczny — usuń
        if (body.orbital.e >= 0.97) {
          EntityManager.remove(body.id);
          ejected++;
        }
      }
    }
    if (ejected > 0) {
      EventBus.emit('disk:bodiesEjected', { count: ejected });
    }
  }
}
