// System czasu gry
// Kontroluje przepływ czasu symulacji i emituje ticki dla pozostałych systemów
// Komunikacja: nasłuchuje komend UI, emituje 'time:tick' i 'time:display'
//
// Auto-slow: automatyczne zwolnienie do 1d/s przy ważnych zdarzeniach
//   Zdarzenia wyzwalające: body:collision, life:emerged, life:evolved,
//     life:extinct, disk:phaseChanged, resource:shortage (krytyczny)
//   Toggle: time:autoSlowToggle — włącz/wyłącz auto-slow
//   Emituje: time:autoSlowed { reason } → EventLog informuje gracza

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

const CIV_TIME_SCALE = GAME_CONFIG.CIV_TIME_SCALE; // 12 — mechaniki 4X biegną szybciej

export class TimeSystem {
  constructor() {
    this.gameTime        = 0;     // całkowity czas gry (lata)
    this.multiplierIndex = 1;     // indeks w TIME_MULTIPLIERS (domyślnie 1 = 1d/s)
    this.multipliers     = GAME_CONFIG.TIME_MULTIPLIERS;
    this.isPaused        = false;

    // Auto-slow — domyślnie włączone
    this._autoSlowEnabled  = true;
    this._prevIndex        = 1;   // zapamiętany indeks przed auto-slow (do ewentualnego przywrócenia)

    EventBus.on('time:pause',           ()          => this.pause());
    EventBus.on('time:play',            ()          => this.play());
    EventBus.on('time:setMultiplier',   ({ index }) => this.setMultiplier(index));
    EventBus.on('time:faster',          ()          => this.faster());
    EventBus.on('time:slower',          ()          => this.slower());
    EventBus.on('time:autoSlowToggle',  ()          => this._toggleAutoSlow());

    // ── Zdarzenia wyzwalające auto-slow ────────────────────────────────────
    EventBus.on('body:collision', ({ type }) => {
      if (type !== 'absorb') return;  // tylko poważne kolizje (nie microimpact)
      this._triggerAutoSlow('Kolizja planetarna');
    });
    EventBus.on('life:emerged',       ({ planet }) =>
      this._triggerAutoSlow(`Pierwsze życie na ${planet?.name ?? 'planecie'}`));
    EventBus.on('life:evolved',       ({ planet }) =>
      this._triggerAutoSlow(`Ewolucja życia: ${planet?.name ?? ''}`));
    EventBus.on('life:extinct',       ({ planet }) =>
      this._triggerAutoSlow(`Wymieranie na ${planet?.name ?? 'planecie'}`));
    EventBus.on('disk:phaseChanged',  ({ newPhasePL }) =>
      this._triggerAutoSlow(`Faza dysku: ${newPhasePL}`));
    // resource:shortage — NIE zwalniaj czasu; gracz sam kontroluje prędkość
    // EventBus.on('resource:shortage', ...) — usunięte na życzenie gracza
  }

  get multiplier() {
    return this.multipliers[this.multiplierIndex];
  }

  // Wywoływane co klatkę przez Phaser (delta w milisekundach)
  update(deltaMs) {
    if (this.isPaused || this.multiplier === 0) return;

    // Przelicz: ms realnego czasu → lata gry
    const deltaYears = (deltaMs / 1000) * this.multiplier;
    this.gameTime += deltaYears;

    EventBus.emit('time:tick', {
      deltaYears,
      civDeltaYears: deltaYears * CIV_TIME_SCALE,
      gameTime:   this.gameTime,
      multiplier: this.multiplier,
    });

    // Przekazuj multiplierIndex (nie wartość float) — unikamy indexOf na floatach
    EventBus.emit('time:display', {
      gameTime:        this.gameTime,
      multiplierIndex: this.multiplierIndex,
      isPaused:        this.isPaused,
      autoSlow:        this._autoSlowEnabled,
      displayText:     this._formatTime(this.gameTime),
    });
  }

  // Formatuj czas gry do czytelnej postaci
  _formatTime(years) {
    // Duże skale czasowe — format skrócony
    if (years >= 1_000_000_000) {
      return `${(years / 1_000_000_000).toFixed(2)} mld lat`;
    }
    if (years >= 1_000_000) {
      return `${(years / 1_000_000).toFixed(2)} mln lat`;
    }
    if (years >= 10_000) {
      return `${Math.floor(years / 1000).toLocaleString('pl-PL')} tys. lat`;
    }
    // Format DD/MM/YYYY — czytelny jak kalendarz
    const totalDays = Math.floor(years * 365.25);
    const wholeYears = Math.floor(years);
    const dayOfYear = totalDays - Math.floor(wholeYears * 365.25);
    // Przybliżony dzień i miesiąc (30.44 dni/miesiąc)
    const month = Math.min(12, Math.floor(dayOfYear / 30.44) + 1);
    const day = Math.max(1, Math.min(30, dayOfYear - Math.floor((month - 1) * 30.44) + 1));
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    const yyyy = String(wholeYears).padStart(4, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  pause() {
    this.isPaused = true;
    EventBus.emit('time:stateChanged', { isPaused: true, multiplierIndex: this.multiplierIndex });
  }

  play() {
    this.isPaused = false;
    EventBus.emit('time:stateChanged', { isPaused: false, multiplierIndex: this.multiplierIndex });
  }

  setMultiplier(index) {
    if (index >= 0 && index < this.multipliers.length) {
      this.multiplierIndex = index;
      EventBus.emit('time:stateChanged', {
        isPaused:        this.isPaused,
        multiplierIndex: this.multiplierIndex,
        autoSlow:        this._autoSlowEnabled,
      });
    }
  }

  faster() {
    this.setMultiplier(Math.min(this.multiplierIndex + 1, this.multipliers.length - 1));
  }

  slower() {
    this.setMultiplier(Math.max(this.multiplierIndex - 1, 0));
  }

  // ── Auto-slow ─────────────────────────────────────────────────────────────

  _toggleAutoSlow() {
    this._autoSlowEnabled = !this._autoSlowEnabled;
    EventBus.emit('time:stateChanged', {
      isPaused:        this.isPaused,
      multiplierIndex: this.multiplierIndex,
      autoSlow:        this._autoSlowEnabled,
    });
  }

  // Zwolnij czas do 1d/s przy ważnym zdarzeniu (jeśli auto-slow włączone)
  _triggerAutoSlow(reason) {
    if (!this._autoSlowEnabled)  return;
    if (this.multiplierIndex <= 1) return;  // już powoli — nie ma co zwalniać
    this._prevIndex = this.multiplierIndex;
    this.setMultiplier(1);   // 1 = indeks trybu 1d/s (GAME_CONFIG.TIME_MULTIPLIERS[1])
    EventBus.emit('time:autoSlowed', { reason, prevIndex: this._prevIndex });
  }
}
