// AudioSystem — proceduralne dźwięki SF przez Web Audio API
//
// Podejście: zero plików audio — wszystkie dźwięki generowane w locie
//   - oscylatory (sine/square/sawtooth) dla tonów i beepów
//   - noise buffer z filtrem low-pass dla boomów/cracków kolizji
//   - staggerowane serie tonów dla chimes życia
//
// Inicjalizacja: AudioContext tworzony LAZILY (przy pierwszym call)
//   → wymóg Chrome autoplay policy (kontekst musi być z gestem użytkownika)
//
// Subskrybuje eventy przez EventBus — niezależny jak inne systemy

import EventBus from '../core/EventBus.js';

export class AudioSystem {
  constructor() {
    this._ctx         = null;   // AudioContext (lazy init)
    this._masterGain  = null;   // masterGain node
    this._volume      = 0.40;   // głośność domyślna (0-1)
    this._enabled     = true;   // false = mute

    // ── Subskrypcje ──────────────────────────────────────────────
    EventBus.on('body:collision', ({ type }) => {
      if (type === 'absorb') {
        this._playCollisionBoom();
      } else {
        this._playCollisionCrack();
      }
    });

    EventBus.on('life:emerged', () => this._playLifeEmerged());
    EventBus.on('life:evolved', () => this._playLifeEvolved());
    EventBus.on('life:extinct', () => this._playLifeExtinct());

    EventBus.on('player:actionResult', ({ success }) => {
      if (success) {
        this._playActionSuccess();
      } else {
        this._playActionFail();
      }
    });

    EventBus.on('time:stateChanged', () => this._playClick());

    EventBus.on('audio:toggle', () => this.toggle());
  }

  // ── Lazy init AudioContext ────────────────────────────────────
  _ensureContext() {
    if (this._ctx) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this._ctx        = new AudioCtx();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = this._volume;
      this._masterGain.connect(this._ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  // ── Zmiana głośności ─────────────────────────────────────────
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._masterGain) {
      this._masterGain.gain.value = this._volume;
    }
  }

  // ── Mute / unmute ─────────────────────────────────────────────
  toggle() {
    this._enabled = !this._enabled;
    if (this._masterGain) {
      this._masterGain.gain.value = this._enabled ? this._volume : 0;
    }
  }

  get isEnabled() { return this._enabled; }

  // ── Prymitywy dźwiękowe ──────────────────────────────────────

  // Oscylator: pojedynczy ton (sine/square/sawtooth/triangle)
  _playTone(freq, type, duration, gain = 0.25) {
    if (!this._enabled || !this._ensureContext()) return;
    const ctx      = this._ctx;
    const osc      = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(this._masterGain);

    osc.type          = type;
    osc.frequency.value = freq;

    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(gain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  // Szum biały z filtrem low-pass (boom, crash, percussion)
  _playNoise(duration, gain = 0.25, filterHz = 800) {
    if (!this._enabled || !this._ensureContext()) return;
    const ctx        = this._ctx;
    const sampleRate = ctx.sampleRate;
    const bufSize    = Math.ceil(sampleRate * duration);
    const buffer     = ctx.createBuffer(1, bufSize, sampleRate);
    const data       = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source   = ctx.createBufferSource();
    source.buffer  = buffer;

    const filter        = ctx.createBiquadFilter();
    filter.type         = 'lowpass';
    filter.frequency.value = filterHz;

    const gainNode = ctx.createGain();
    const now      = ctx.currentTime;
    gainNode.gain.setValueAtTime(gain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this._masterGain);
    source.start(now);
  }

  // ── Konkretne dźwięki ────────────────────────────────────────

  // Kolizja absorpcja (mała planeta wchłonięta przez dużą) — głęboki boom
  _playCollisionBoom() {
    this._playNoise(0.55, 0.50, 200);          // boom szumowy
    this._playTone(55, 'sine', 0.50, 0.20);    // subbasowy rumble
    this._playTone(110, 'sine', 0.30, 0.15);   // głęboki ton
  }

  // Kolizja defleksja/wyrzucenie — krótszy crack
  _playCollisionCrack() {
    this._playNoise(0.25, 0.30, 500);           // krótszy szum
    this._playTone(220, 'sawtooth', 0.20, 0.12); // chropowaty ton
  }

  // Życie się pojawiło — wstępujące 3-tonowe chime
  _playLifeEmerged() {
    const freqs = [440, 550, 660];
    freqs.forEach((f, i) => {
      setTimeout(() => this._playTone(f, 'sine', 0.45, 0.18), i * 160);
    });
  }

  // Życie ewoluowało do wyższego etapu — 4-tonowy chord
  _playLifeEvolved() {
    const freqs = [330, 440, 550, 660];
    freqs.forEach((f, i) => {
      setTimeout(() => this._playTone(f, 'sine', 0.35, 0.14), i * 110);
    });
  }

  // Życie wymarło — schodzące smutne 3 tony
  _playLifeExtinct() {
    const freqs = [440, 330, 220];
    freqs.forEach((f, i) => {
      setTimeout(() => this._playTone(f, 'sine', 0.45, 0.14), i * 210);
    });
  }

  // Akcja gracza — sukces (króki jasny beep)
  _playActionSuccess() {
    this._playTone(660, 'square', 0.12, 0.10);
  }

  // Akcja gracza — niepowodzenie (niski buzz)
  _playActionFail() {
    this._playTone(180, 'square', 0.20, 0.14);
  }

  // Zmiana stanu czasu (play/pause/speed) — krótki klik
  _playClick() {
    this._playTone(880, 'square', 0.06, 0.08);
  }
}
