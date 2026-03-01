// System stabilności — oblicza globalny wynik stabilności układu (0–100)
// Komunikacja: nasłuchuje 'physics:updated', 'body:collision', 'planet:ejected',
//              'accretion:newPlanet', 'time:tick'
// Emituje: 'system:stabilityChanged' { score, trend, details }

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';

// Idealna liczba planet (najstabilniejszy układ)
const IDEAL_PLANET_COUNT = 4;

// Przedziały punktacji
const SCORE_COLLISION_PENALTY  = 12;   // kara za kolizję (jednorazowa)
const SCORE_EJECTION_PENALTY   = 18;   // kara za ejekcję (jednorazowa)
const SCORE_NEW_PLANET_BONUS   = 6;    // bonus za uformowanie nowej planety
const SCORE_HZ_BONUS_PER_BODY  = 8;    // bonus za planetę w strefie HZ

export class StabilitySystem {
  constructor(star) {
    this.star      = star;
    this.score     = 50;   // start: neutralna stabilność
    this.prevScore = 50;
    this._eventPenalties = 0;  // skumulowane kary z zdarzeń (rozładowywane co tick)

    // Nasłuchuj fizycznych zdarzeń
    EventBus.on('body:collision', ({ type }) => {
      // Destrukcja karze bardziej niż wchłonięcie
      this._eventPenalties += (type === 'destroy')
        ? SCORE_COLLISION_PENALTY
        : SCORE_COLLISION_PENALTY * 0.5;
    });

    EventBus.on('planet:ejected', () => {
      this._eventPenalties += SCORE_EJECTION_PENALTY;
    });

    EventBus.on('accretion:newPlanet', () => {
      // Nowa planeta = układ ewoluuje → lekki bonus
      this._eventPenalties -= SCORE_NEW_PLANET_BONUS;
    });

    // Oblicz stabilność co tick (synchronicznie z fizyką)
    EventBus.on('time:tick', () => this._recalculate());
  }

  _recalculate() {
    const planets = EntityManager.getByType('planet');
    if (planets.length === 0) {
      this.score = 0;
      this._emit();
      return;
    }

    // ── 1. Składowa: liczba planet ──────────────────────────────
    // Optymum: IDEAL_PLANET_COUNT planet → 30 pkt
    const countDiff  = Math.abs(planets.length - IDEAL_PLANET_COUNT);
    const countScore = Math.max(0, 30 - countDiff * 7);

    // ── 2. Składowa: mimośrody orbit ────────────────────────────
    // Okrągłe orbity (e ≈ 0) → 30 pkt; silnie eliptyczne → 0
    const avgE       = planets.reduce((s, p) => s + p.orbital.e, 0) / planets.length;
    const eccScore   = Math.max(0, 30 * (1 - avgE / 0.7));

    // ── 3. Składowa: planety w strefie zamieszkiwalnej ──────────
    const hz    = this.star.habitableZone;
    const inHZ  = planets.filter(p => p.orbital.a >= hz.min && p.orbital.a <= hz.max).length;
    const hzScore = Math.min(20, inHZ * SCORE_HZ_BONUS_PER_BODY);

    // ── 4. Składowa: separacja orbit (unikaj ciasnych skupisk) ──
    // Sortuj po półosi — duże odstępy = 20 pkt
    const sorted  = [...planets].sort((a, b) => a.orbital.a - b.orbital.a);
    let sepScore  = 20;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].orbital.a - sorted[i - 1].orbital.a;
      if (gap < 0.2) sepScore -= 5;   // za bliskie sąsiedztwo
    }
    sepScore = Math.max(0, sepScore);

    // ── 5. Suma bazowa ──────────────────────────────────────────
    const baseScore = countScore + eccScore + hzScore + sepScore;

    // ── 6. Zastosuj skumulowane kary z zdarzeń ──────────────────
    const rawScore = baseScore - this._eventPenalties;

    // Kary rozładowują się powoli (20% zostaje do następnego tiku)
    this._eventPenalties *= 0.20;

    // Wygładź zmianę (lerp 15%) — unikamy skokowych zmian UI
    this.score = Math.round(
      this.score * 0.85 + Math.max(0, Math.min(100, rawScore)) * 0.15
    );

    this._emit();
  }

  _emit() {
    // Oblicz trend (rośnie / spada / stabilny)
    const delta = this.score - this.prevScore;
    const trend = delta > 1 ? 'up' : delta < -1 ? 'down' : 'stable';
    this.prevScore = this.score;

    EventBus.emit('system:stabilityChanged', {
      score: this.score,
      trend,
      details: {
        planets: EntityManager.getByType('planet').length,
      },
    });
  }
}
