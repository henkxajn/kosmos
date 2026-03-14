// AudioSystem — proceduralne dźwięki SF przez Web Audio API + muzyka tła
//
// Podejście: efekty dźwiękowe generowane w locie (oscylatory + noise buffer)
// Muzyka: plik MP3 z assets/sounds/ ładowany i odtwarzany w pętli
//
// Inicjalizacja: AudioContext tworzony LAZILY (przy pierwszym call)
//   → wymóg Chrome autoplay policy (kontekst musi być z gestem użytkownika)
//
// Dwa osobne kanały:
//   _masterGain  → efekty dźwiękowe (toggle: [DZW])
//   _musicGain   → muzyka tła (toggle: [MUZ])
//
// Subskrybuje eventy przez EventBus — niezależny jak inne systemy

import EventBus from '../core/EventBus.js';

// ── Definicje ścieżek muzycznych ──────────────────────────────
const MUSIC_TRACKS = {
  main: 'assets/sounds/amber_terminals.mp3',
};

const MUSIC_FADE_IN  = 2.0;  // sekundy fade-in
const MUSIC_FADE_OUT = 1.5;  // sekundy fade-out

export class AudioSystem {
  constructor() {
    this._ctx         = null;   // AudioContext (lazy init)
    this._masterGain  = null;   // masterGain node (efekty)
    this._musicGain   = null;   // musicGain node (muzyka)
    this._volume      = 0.40;   // głośność efektów (0-1)
    this._musicVolume = 0.25;   // głośność muzyki (0-1) — cichsza niż efekty
    this._enabled     = true;   // false = mute efekty
    this._musicEnabled = true;  // false = mute muzyka

    // ── Stan muzyki ──────────────────────────────────────────────
    this._musicBuffer  = null;  // zdekodowany AudioBuffer
    this._musicSource  = null;  // aktywny BufferSourceNode
    this._musicLoaded  = false; // czy plik załadowany
    this._musicLoading = false; // guard — trwa ładowanie (zapobiega wielokrotnemu fetch)
    this._musicPlaying = false; // czy gra

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
    EventBus.on('music:toggle', () => this.toggleMusic());

    // Muzyka pauzuje się razem z grą
    EventBus.on('time:stateChanged', ({ isPaused }) => {
      if (isPaused && this._musicPlaying && this._ctx) {
        // Fade-out przy pauzie
        const now = this._ctx.currentTime;
        this._musicGain.gain.setValueAtTime(this._musicGain.gain.value || 0.001, now);
        this._musicGain.gain.exponentialRampToValueAtTime(0.001, now + MUSIC_FADE_OUT);
      } else if (!isPaused && this._musicPlaying && this._musicEnabled && this._ctx) {
        // Fade-in przy wznowieniu
        const now = this._ctx.currentTime;
        this._musicGain.gain.setValueAtTime(0.001, now);
        this._musicGain.gain.exponentialRampToValueAtTime(this._musicVolume, now + MUSIC_FADE_IN);
      }
    });
  }

  // ── Lazy init AudioContext ────────────────────────────────────
  _ensureContext() {
    if (this._ctx) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this._ctx        = new AudioCtx();

      // Kanał efektów dźwiękowych
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = this._volume;
      this._masterGain.connect(this._ctx.destination);

      // Kanał muzyki (osobny)
      this._musicGain = this._ctx.createGain();
      this._musicGain.gain.value = this._musicEnabled ? this._musicVolume : 0;
      this._musicGain.connect(this._ctx.destination);

      return true;
    } catch {
      return false;
    }
  }

  // ── Zmiana głośności efektów ────────────────────────────────
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._masterGain) {
      this._masterGain.gain.value = this._volume;
    }
  }

  // ── Zmiana głośności muzyki ─────────────────────────────────
  setMusicVolume(v) {
    this._musicVolume = Math.max(0, Math.min(1, v));
    if (this._musicGain && this._musicEnabled) {
      this._musicGain.gain.value = this._musicVolume;
    }
  }

  // ── Mute / unmute efektów ──────────────────────────────────
  toggle() {
    this._enabled = !this._enabled;
    if (this._masterGain) {
      this._masterGain.gain.value = this._enabled ? this._volume : 0;
    }
  }

  // ── Mute / unmute muzyki ───────────────────────────────────
  toggleMusic() {
    this._musicEnabled = !this._musicEnabled;
    if (this._musicGain) {
      const now = this._ctx.currentTime;
      if (this._musicEnabled) {
        // Fade-in
        this._musicGain.gain.setValueAtTime(0.001, now);
        this._musicGain.gain.exponentialRampToValueAtTime(this._musicVolume, now + MUSIC_FADE_IN);
        // Autostart jeśli nie gra
        if (!this._musicPlaying && this._musicLoaded) {
          this._startMusicPlayback();
        }
      } else {
        // Fade-out
        this._musicGain.gain.setValueAtTime(this._musicGain.gain.value || 0.001, now);
        this._musicGain.gain.exponentialRampToValueAtTime(0.001, now + MUSIC_FADE_OUT);
      }
    }
    EventBus.emit('music:toggled', { enabled: this._musicEnabled });
  }

  get isEnabled() { return this._enabled; }
  get isMusicEnabled() { return this._musicEnabled; }

  // ── Ładowanie i odtwarzanie muzyki ─────────────────────────

  /** Załaduj plik muzyczny i zacznij grać w pętli */
  async startMusic(trackId = 'main') {
    if (!this._ensureContext()) return;

    // Wznów suspended context (Chrome autoplay policy)
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }

    // Jeśli już gra lub trwa ładowanie — ignoruj
    if (this._musicPlaying || this._musicLoading) return;

    // Załaduj jeśli jeszcze nie załadowane
    if (!this._musicLoaded) {
      this._musicLoading = true;
      const path = MUSIC_TRACKS[trackId];
      if (!path) { console.warn(`[AudioSystem] Brak ścieżki muzycznej: ${trackId}`); return; }

      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        this._musicBuffer = await this._ctx.decodeAudioData(arrayBuffer);
        this._musicLoaded = true;
        console.log(`[AudioSystem] Muzyka załadowana: ${path} (${this._musicBuffer.duration.toFixed(1)}s)`);
      } catch (err) {
        console.warn('[AudioSystem] Nie udało się załadować muzyki:', err);
        this._musicLoading = false;
        return;
      }
      this._musicLoading = false;
    }

    if (this._musicEnabled) {
      this._startMusicPlayback();
    }
  }

  /** Wewnętrzne: uruchom playback (loop) */
  _startMusicPlayback() {
    if (!this._musicBuffer || !this._musicGain) return;

    // Zatrzymaj poprzedni source jeśli istnieje
    if (this._musicSource) {
      try { this._musicSource.stop(); } catch { /* ignoruj */ }
    }

    const source = this._ctx.createBufferSource();
    source.buffer = this._musicBuffer;
    source.loop = true;
    source.connect(this._musicGain);

    // Fade-in od ciszy
    const now = this._ctx.currentTime;
    this._musicGain.gain.setValueAtTime(0.001, now);
    this._musicGain.gain.exponentialRampToValueAtTime(this._musicVolume, now + MUSIC_FADE_IN);

    source.start(0);
    this._musicSource = source;
    this._musicPlaying = true;
  }

  /** Zatrzymaj muzykę z fade-out */
  stopMusic() {
    if (!this._musicPlaying || !this._musicSource || !this._ctx) return;
    const now = this._ctx.currentTime;
    this._musicGain.gain.setValueAtTime(this._musicGain.gain.value || 0.001, now);
    this._musicGain.gain.exponentialRampToValueAtTime(0.001, now + MUSIC_FADE_OUT);

    const src = this._musicSource;
    setTimeout(() => {
      try { src.stop(); } catch { /* ignoruj */ }
    }, MUSIC_FADE_OUT * 1000 + 100);

    this._musicSource = null;
    this._musicPlaying = false;
  }

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
