// System akcji gracza — zarządza energią wpływu i akcjami na planetach
// Komunikacja: nasłuchuje 'body:selected', 'action:stabilize', 'action:nudgeToHz', 'action:bombard'
// Emituje: 'player:energyChanged', 'player:actionResult', 'player:planetUpdated'

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { KeplerMath } from '../utils/KeplerMath.js';
import { COMET_COMPOSITION, normalizeComposition } from '../data/ElementsData.js';

// Koszty energii wpływu
export const ACTION_COSTS = {
  stabilize: 25,   // stabilizacja orbity
  nudgeToHz: 35,   // pchnięcie ku strefie HZ
  bombard:   20,   // bombardowanie asteroidami
};

// Regeneracja: punkty na sekundę realnego czasu
const ENERGY_REGEN_PER_SEC = 6;
export const ENERGY_MAX    = 100;

export class PlayerActionSystem {
  constructor(star) {
    this.star           = star;
    this.energy         = ENERGY_MAX;   // startujemy z pełną energią
    this.selectedPlanet = null;

    // Zaznaczenie planety z GameScene
    EventBus.on('body:selected', ({ entity }) => {
      this.selectedPlanet = entity;
      this._emitEnergy();
    });

    // Usuń zaznaczenie gdy planeta znika
    EventBus.on('entity:removed', ({ entity }) => {
      if (this.selectedPlanet && this.selectedPlanet.id === entity.id) {
        this.selectedPlanet = null;
        this._emitEnergy();
      }
    });

    // Komendy z panelu UI lub klawiatury
    EventBus.on('action:stabilize', () => this.stabilize());
    EventBus.on('action:nudgeToHz', () => this.nudgeToHz());
    EventBus.on('action:bombard',   () => this.bombard());
  }

  // Wywoływane co klatkę (delta w ms realnego czasu)
  update(deltaMs) {
    const prev  = Math.floor(this.energy);
    this.energy = Math.min(ENERGY_MAX, this.energy + (deltaMs / 1000) * ENERGY_REGEN_PER_SEC);

    // Emituj tylko gdy zmienia się wartość całkowita — odciążamy EventBus
    if (Math.floor(this.energy) !== prev) {
      this._emitEnergy();
    }
  }

  // ── Akcja 1: Stabilizuj orbitę ───────────────────────────────
  // Redukuje mimośród o 0.06, poprawia orbitalStability planety
  stabilize() {
    const check = this._canAct('stabilize');
    if (!check.ok) {
      EventBus.emit('player:actionResult', { action: 'stabilize', success: false, reason: check.reason });
      return;
    }

    const p = this.selectedPlanet;
    p.orbital.e        = Math.max(0.001, p.orbital.e - 0.06);
    p.orbitalStability = Math.min(1.0, p.orbitalStability + 0.15);

    this._spend('stabilize');

    EventBus.emit('orbits:stabilityChanged', { planets: EntityManager.getByType('planet') });
    EventBus.emit('player:actionResult', { action: 'stabilize', success: true, planet: p.name });
    EventBus.emit('player:planetUpdated', { planet: p });
  }

  // ── Akcja 2: Pchnij ku strefie HZ ────────────────────────────
  // Przesuwa półoś ku środkowi strefy zamieszkiwalnej gwiazdy (maks. 0.25 AU na kliknięcie)
  nudgeToHz() {
    const check = this._canAct('nudgeToHz');
    if (!check.ok) {
      EventBus.emit('player:actionResult', { action: 'nudgeToHz', success: false, reason: check.reason });
      return;
    }

    const p     = this.selectedPlanet;
    const hz    = this.star.habitableZone;
    const hzMid = (hz.min + hz.max) / 2;

    // Przesuń 25% pozostałej odległości, ale nie więcej niż 0.25 AU
    const diff  = hzMid - p.orbital.a;
    const shift = Math.sign(diff) * Math.min(Math.abs(diff) * 0.25, 0.25);
    p.orbital.a = Math.max(0.1, p.orbital.a + shift);

    // Przelicz okres orbitalny po zmianie półosi (prawo Keplera: T = √(a³/M_gwiazdowej))
    p.orbital.T = KeplerMath.orbitalPeriod(p.orbital.a, this.star.physics.mass);

    // Pchnięcie lekko destabilizuje orbitę — realistyczne zachowanie
    p.orbital.e = Math.min(0.85, p.orbital.e + 0.02);

    this._spend('nudgeToHz');

    const direction = diff > 0 ? 'dalej od gwiazdy' : 'bliżej gwiazdy';
    EventBus.emit('orbits:stabilityChanged', { planets: EntityManager.getByType('planet') });
    EventBus.emit('player:actionResult', { action: 'nudgeToHz', success: true, planet: p.name, detail: direction });
    EventBus.emit('player:planetUpdated', { planet: p });
  }

  // ── Akcja 3: Bombarduj ────────────────────────────────────────
  // Wysyła rój komet/asteroid — planeta rośnie, dostaje skład kometarny, mała destabilizacja
  bombard() {
    const check = this._canAct('bombard');
    if (!check.ok) {
      EventBus.emit('player:actionResult', { action: 'bombard', success: false, reason: check.reason });
      return;
    }

    const p = this.selectedPlanet;

    // +0.5 mas Ziemi (przelicznik: 1 M_Ziemi ≈ 3×10⁻⁶ M_Słońca)
    p.physics.mass  += 0.5 * 3e-6;
    p.visual.radius  = Math.min(p.visual.radius + 1, 24);
    p.orbital.e      = Math.min(0.85, p.orbital.e + 0.015);

    // Transfer składu kometarnego: 2% masy planety dodane jako kometa
    // Mieszamy obecny skład z kometarnym (kometa = 2% wagi całości)
    if (p.composition) {
      const transferFrac = 0.02;  // kometa = 2% docelowej masy
      const newComp = { ...p.composition };
      for (const [el, pct] of Object.entries(COMET_COMPOSITION)) {
        newComp[el] = (newComp[el] || 0) + pct * transferFrac;
      }
      p.composition = normalizeComposition(newComp);

      // Aktualizuj flagę wody gdy H₂O przekroczy 3%
      if (p.composition.H2O >= 3 && !p.surface.hasWater) {
        p.surface.hasWater = true;
      }

      EventBus.emit('planet:compositionChanged', { planet: p });
    }

    this._spend('bombard');

    EventBus.emit('player:actionResult', { action: 'bombard', success: true, planet: p.name,
      detail: 'H₂O+C+N+P' });
    EventBus.emit('player:planetUpdated', { planet: p });
  }

  // ── Pomocnicze ────────────────────────────────────────────────
  _canAct(_actionName) {
    if (!this.selectedPlanet)                       return { ok: false, reason: 'Zaznacz planetę' };
    if (!EntityManager.get(this.selectedPlanet.id)) return { ok: false, reason: 'Planeta nie istnieje' };
    // Energia wyłączona — akcje zawsze dostępne gdy planeta zaznaczona
    return { ok: true };
  }

  _spend(_actionName) {
    // Energia wyłączona — nie pobieramy kosztu
  }

  _emitEnergy() {
    EventBus.emit('player:energyChanged', {
      energy:    Math.floor(this.energy),
      max:       ENERGY_MAX,
      costs:     ACTION_COSTS,
      hasTarget: !!(this.selectedPlanet && EntityManager.get(this.selectedPlanet.id)),
    });
  }
}
