// System czasu gry
// Kontroluje przepływ czasu symulacji i emituje ticki dla pozostałych systemów
// Komunikacja: nasłuchuje komend UI, emituje 'time:tick' i 'time:display'
//
// Auto-slow: automatyczne zwolnienie do 1d/s przy ważnych zdarzeniach
//   Zdarzenia wyzwalające: body:collision, life:emerged, life:evolved,
//     life:extinct, disk:phaseChanged, resource:shortage (krytyczny)
//   Toggle: time:autoSlowToggle — włącz/wyłącz auto-slow
//   Emituje: time:autoSlowed { reason } → EventLog informuje gracza
//
// POLISH P1 (CP1, CP3, CP4, CP5) — ZEGAR STARCIA (siatka). Plan i decyzje: `docs/design/POLISH_PLAN.md`.
//   Gdy trwa starcie `DeepSpaceCombatSystem`, `update()` nie mnoży czasu realnego przez prędkość gracza: świat tyka
//   klatkami SIATKI — 16 ms przy 1 d/s (dzisiejsza klatka 60 FPS przy auto-slow), niezależnie od prędkości i FPS — a czas
//   realny decyduje wyłącznie o tempie odtwarzania siatki: starcie oglądane — `combatRoundMs()` ms na rundę, starcie
//   w innym układzie — dzisiejsze 110 ms (`CombatPaceData`). Runda pada co 110 ms zegara starcia (reguła DSCS).
//   `simClockMs` — zegar klatek symulacji (ms): przyrasta tylko, gdy gra tyka (poza starciem o czas realny klatki,
//   w starciu o klatkę siatki); pauza go zatrzymuje, po odpauzowaniu nic nie nadrabia. Czytają go rundy DSCS i kąt
//   orbit statków (`src/utils/SimClock.js`). Nie jedzie w zapisie (jak dotąd `performance.now`).

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { t } from '../i18n/i18n.js';
import {
  COMBAT_ROUND_RULE_MS, COMBAT_GRID_FRAME_MS, COMBAT_GRID_SPEED_INDEX, COMBAT_GRID_MAX_FRAMES,
  COMBAT_UNWATCHED_ROUND_MS, COMBAT_WATCHED_ROUND_MS,
} from '../data/CombatPaceData.js';

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

    // POLISH P1 — zegar klatek symulacji (ms); `null` do pierwszego tiku (kotwica w czasie realnym — dzisiejszy kąt orbit).
    this.simClockMs        = null;
    this._combatGridAccMs  = 0;   // zaległość siatki starcia (ms zegara starcia), najwyżej COMBAT_GRID_MAX_FRAMES klatek

    EventBus.on('time:pause',           ()          => this.pause());
    EventBus.on('time:play',            ()          => this.play());
    EventBus.on('time:resume',          ()          => this.play());  // alias dla play (używany przez ConsulElectionModal, GameScene movements)
    EventBus.on('time:setMultiplier',   ({ index }) => this.setMultiplier(index));
    EventBus.on('time:faster',          ()          => this.faster());
    EventBus.on('time:slower',          ()          => this.slower());
    EventBus.on('time:autoSlowToggle',  ()          => this._toggleAutoSlow());

    // ── Zdarzenia wyzwalające auto-slow ────────────────────────────────────
    EventBus.on('body:collision', ({ type }) => {
      if (type !== 'absorb') return;  // tylko poważne kolizje (nie microimpact)
      this._triggerAutoSlow(t('log.autoSlowCollision'));
    });
    EventBus.on('life:emerged',       ({ planet }) =>
      this._triggerAutoSlow(t('log.autoSlowLifeEmerged', planet?.name ?? '?')));
    EventBus.on('life:evolved',       ({ planet }) =>
      this._triggerAutoSlow(t('log.autoSlowLifeEvolved', planet?.name ?? '?')));
    EventBus.on('life:extinct',       ({ planet }) =>
      this._triggerAutoSlow(t('log.autoSlowLifeExtinct', planet?.name ?? '?')));
    EventBus.on('disk:phaseChanged',  ({ newPhase, newPhasePL }) =>
      this._triggerAutoSlow(t('log.autoSlowDiskPhase', newPhasePL ?? newPhase)));
    // Fleet Command Console (Slice 1) — auto-slow gdy gracz wchodzi w starcie floty
    // (bitwa deep-space rozgrywa się na żywo na mapie; daj czas obejrzeć/zoomować).
    EventBus.on('vessel:engaged', ({ sideA = [], sideB = [] }) => {
      const vm = window.KOSMOS?.vesselManager;
      if (!vm) return;
      const isOwn = (v) => v && !(v.isEnemy === true
        || (v.owner && v.owner !== 'player')
        || (v.ownerEmpireId && v.ownerEmpireId !== 'player'));
      const playerIn = [...sideA, ...sideB].some(id => isOwn(vm.getVessel?.(id)));
      if (playerIn) this._triggerAutoSlow(t('log.autoSlowCombat'));
    });
    // resource:shortage — NIE zwalniaj czasu; gracz sam kontroluje prędkość
    // EventBus.on('resource:shortage', ...) — usunięte na życzenie gracza
  }

  get multiplier() {
    return this.multipliers[this.multiplierIndex];
  }

  // Wywoływane co klatkę przez Phaser (delta w milisekundach)
  update(deltaMs) {
    if (this.isPaused || this.multiplier === 0) return;

    // POLISH P1 — kotwica zegara klatek przy pierwszym tiku: czas realny tej chwili (już zawiera bieżącą klatkę).
    const anchored = this.simClockMs != null;
    if (!anchored) this.simClockMs = _realNowMs();

    // POLISH P1 (CP1, CP4) — trwa starcie DSCS: świat tyka siatką starcia; prędkość gracza czeka do końca starcia.
    const view = this._combatView();
    if (view) { this._updateCombatGrid(deltaMs, view); return; }
    this._combatGridAccMs = 0;
    if (anchored) this.simClockMs += deltaMs;

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

  /**
   * POLISH P1 (CP1, CP2) — czas REALNY jednej rundy starcia OGLĄDANEGO (ms): tempo odtwarzania siatki starcia.
   * Czytane w chwili użycia. Wynik starcia od tej wartości nie zależy.
   */
  combatRoundMs() {
    return COMBAT_WATCHED_ROUND_MS;
  }

  /**
   * POLISH P1 (CP4) — czy trwa starcie DSCS i czy gracz je ogląda (oglądany układ = `activeSystemId`).
   * @returns {'watched'|'unwatched'|null}
   */
  _combatView() {
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    return K?.deepSpaceCombatSystem?.engagementView?.(K?.activeSystemId ?? 'sys_home') ?? null;
  }

  /**
   * POLISH P1 (CP1, CP3, CP4) — klatka gry w trakcie starcia: zaległość siatki rośnie o czas realny klatki w skali
   * reguła rundy / tempo rundy; każda pełna klatka siatki = jeden tik 16 ms przy 1 d/s (zegar klatek +16 ms). Pauza
   * w trakcie tiku (okno wyniku bitwy, zdarzenie) albo koniec ostatniego starcia — reszta zaległości przepada.
   */
  _updateCombatGrid(deltaMs, view) {
    const roundMs = view === 'watched' ? this.combatRoundMs() : COMBAT_UNWATCHED_ROUND_MS;
    this._combatGridAccMs += deltaMs * (COMBAT_ROUND_RULE_MS / roundMs);
    const gridMult = this.multipliers[COMBAT_GRID_SPEED_INDEX];
    const dy = (COMBAT_GRID_FRAME_MS / 1000) * gridMult;
    let frames = 0;
    while (this._combatGridAccMs >= COMBAT_GRID_FRAME_MS && frames < COMBAT_GRID_MAX_FRAMES) {
      this._combatGridAccMs -= COMBAT_GRID_FRAME_MS;
      frames++;
      this.simClockMs += COMBAT_GRID_FRAME_MS;
      this.gameTime += dy;
      EventBus.emit('time:tick', {
        deltaYears:    dy,
        civDeltaYears: dy * CIV_TIME_SCALE,
        gameTime:      this.gameTime,
        multiplier:    gridMult,
      });
      if (this.isPaused || !this._combatView()) { this._combatGridAccMs = 0; break; }
    }
    const cap = COMBAT_GRID_FRAME_MS * COMBAT_GRID_MAX_FRAMES;
    if (this._combatGridAccMs > cap) this._combatGridAccMs = cap;

    EventBus.emit('time:display', {
      gameTime:        this.gameTime,
      multiplierIndex: this.multiplierIndex,
      isPaused:        this.isPaused,
      autoSlow:        this._autoSlowEnabled,
      displayText:     this._formatTime(this.gameTime),
    });
  }

  /**
   * Data gry w formacie zegara (DD/MM/RRRR) — publiczny odczyt dla meldunków z terminem (G2-4: termin wycofania
   * wojsk po pokoju w Dzienniku, dzwonku i na karcie jednostki). Jedno źródło formatu z wyświetlaczem czasu.
   * @param {number} years — czas gry w latach WYŚWIETLANYCH (`gameTime`)
   */
  formatTime(years) { return this._formatTime(years); }

  // Formatuj czas gry do czytelnej postaci
  _formatTime(years) {
    // Duże skale czasowe — format skrócony (i18n)
    if (years >= 1_000_000_000) {
      return t('time.billionYears', (years / 1_000_000_000).toFixed(2));
    }
    if (years >= 1_000_000) {
      return t('time.millionYears', (years / 1_000_000).toFixed(2));
    }
    if (years >= 10_000) {
      return t('time.thousandYears', Math.floor(years / 1000).toLocaleString());
    }
    // Format DD/MM/YYYY — czytelny jak kalendarz
    const totalDays = Math.floor(years * 365.25);
    const wholeYears = Math.floor(years);
    const dayOfYear = totalDays - Math.floor(wholeYears * 365.25);
    // Przybliżony dzień i miesiąc (30.44 dni/miesiąc)
    const month = Math.min(12, Math.floor(dayOfYear / 30.44) + 1);
    const day = Math.max(1, Math.min(30, dayOfYear - Math.floor((month - 1) * 30.44) + 1));
    // UI v3 — krótsza forma: rok bez zer wiodących (np. „01/01/7" zamiast „01/01/0007"),
    // żeby data mieściła się w bloku czasu bez obcinania.
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    return `${dd}/${mm}/${wholeYears}`;
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

// Czas realny (ms) — wyłącznie kotwica zegara klatek przy pierwszym tiku (performance.now w przeglądarce, Date.now rezerwa).
function _realNowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
