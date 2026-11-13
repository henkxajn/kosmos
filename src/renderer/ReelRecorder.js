// ReelRecorder — NAGRYWARKA ROLEK (narzędzie właściciela do TikToka / Reels; ARC COMBAT VISUALS, krok CV-7 — zmiana 2 po kontroli
// właściciela 2026-11-13; flaga `cvDirector`). Klawisz F10 albo `KOSMOS.debug.cvRecord(1|0)` — start / stop.
//
// Nagrywa WYŁĄCZNIE płótno 3D (`#three-canvas`: scena i efekty walki — interfejs DOM i warstwa HUD nigdy nie trafiają do pliku;
// z trybem nagrywania F9 kadr jest czysty także na ekranie). Przy przewodniku 9:16 — wycinek kadru 9:16 skalowany do płótna
// 1080 × 1920; bez przewodnika — całe płótno (wymiary parzyste). Kopia klatki w pętli renderu TUŻ PO `render()` (bufor WebGL jest
// jeszcze ważny w tym samym zadaniu — bez `preserveDrawingBuffer`), jedna klatka nagrania na klatkę gry (`requestFrame`, zapas
// `captureStream(60)`). MediaRecorder: `video/mp4` (H.264), gdy przeglądarka umie, inaczej `video/webm` VP9; wysoka przepływność.
// Plik pobiera się sam: `kosmos_reel_RRRRMMDD_GGMMSS.mp4` / `.webm`. Czerwony wskaźnik „● REC m:ss” to element DOM — NIE jest
// w nagraniu (widoczny także w trybie nagrywania). Działa ze zwolnionym tempem efektów (`FX_TIME_SCALE`) i z reżyserem (nagrywa
// to, co rysuje pętla). Nic nie trafia do zapisu gry. Na klatkę: `drawImage` + `requestFrame`, bez alokacji (wycinek liczony tylko
// przy zmianie rozmiaru okna / płótna; wskaźnik — 4 razy na sekundę).
// Czyste pomocniki (nazwa pliku, wybór formatu, wycinek, rozmiar) — keeper `cv_director_logic_smoke` (K14). Kod warstwy wizualnej
// nigdy nie woła `Math.random`.

import { t } from '../i18n/i18n.js';

/** Stałe nagrywarki. */
export const REEL = Object.freeze({
  W: 1080, H: 1920,        // [px] płótno nagrania przy przewodniku 9:16
  FPS: 60,                 // [kl./s] zapas `captureStream`, gdy przeglądarka nie ma `requestFrame`
  BITRATE: 24_000_000,     // [b/s] przepływność (1080 × 1920 przy 60 kl./s)
  TIMESLICE_MS: 1000,      // [ms] kawałki MediaRecorder
  KEY: 'F10',
  INDICATOR_ID: 'cv-rec-indicator',
});

/** Kolejność formatów: MP4 (H.264) przed WebM (VP9). */
export const REEL_MIME_ORDER = Object.freeze([
  'video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.4D401F', 'video/mp4;codecs=avc1.42E01E', 'video/mp4',
  'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm',
]);

/** Pierwszy obsługiwany format → { mime, ext } albo null. */
export function pickReelMime(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return null;
  for (const mime of REEL_MIME_ORDER) {
    let okType = false;
    try { okType = !!isTypeSupported(mime); } catch { okType = false; }
    if (okType) return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }
  return null;
}

/** Nazwa pliku z chwili startu (czas lokalny): kosmos_reel_RRRRMMDD_GGMMSS.<ext>. */
export function reelFileName(date, ext) {
  const d = date instanceof Date ? date : new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `kosmos_reel_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

/** Rozmiar płótna nagrania: 9:16 — 1080 × 1920; bez przewodnika — płótno 3D (wymiary parzyste — wymóg H.264). */
export function reelOutputSize({ promo = false, canvasW = 0, canvasH = 0 } = {}) {
  if (promo) return { w: REEL.W, h: REEL.H };
  const even = (n) => Math.max(2, Math.floor(Math.max(0, n) / 2) * 2);
  return { w: even(canvasW), h: even(canvasH) };
}

/**
 * Wycinek płótna 3D [px bufora] do nagrania — zapis do `out` (bez alokacji): 9:16 — kadr 9:16 wyśrodkowany na pełnej wysokości
 * (jak przewodnik `promoRect916`, w px CSS przeliczony na px bufora), bez przewodnika — całe płótno.
 */
export function reelSourceRect({ promo = false, canvasW = 0, canvasH = 0, cssW = 0, cssH = 0 } = {}, out = {}) {
  if (!promo || !(cssW > 0) || !(cssH > 0)) { out.sx = 0; out.sy = 0; out.sw = canvasW; out.sh = canvasH; return out; }
  let h = cssH, w = cssH * 9 / 16;
  if (w > cssW) { w = cssW; h = cssW * 16 / 9; }
  const kx = canvasW / cssW, ky = canvasH / cssH;
  out.sx = (cssW - w) / 2 * kx; out.sy = (cssH - h) / 2 * ky; out.sw = w * kx; out.sh = h * ky;
  return out;
}

/** Klawisz nagrywarki (F10, bez modyfikatorów). */
export function isReelKey(e) {
  return !!e && (e.key === REEL.KEY || e.code === REEL.KEY) && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
}

/** Czas nagrania „m:ss”. */
export function reelClock(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class ReelRecorder {
  /**
   * @param {object} renderer — `ThreeRenderer` (płótno `renderer.renderer.domElement`)
   * @param {{ promo?: () => boolean }} [opts] — czy przewodnik 9:16 jest włączony (w chwili startu)
   */
  constructor(renderer, { promo = () => false } = {}) {
    this.r = renderer;
    this._promo = promo;
    this._mr = null;
    this._stream = null;
    this._track = null;
    this._canvas = null;   // płótno nagrania (poza DOM)
    this._ctx = null;
    this._chunks = [];
    this._src = { sx: 0, sy: 0, sw: 0, sh: 0 };
    this._srcKey = '';
    this._mode = null;     // { promo, w, h, mime, ext, file, startedAt }
    this._indAt = 0;
    this.frames = 0;
    this.lastBlob = null;
    this.lastFile = null;
    this.lastError = null;
  }

  get recording() { return !!this._mr && this._mr.state === 'recording'; }

  /** Start — { ok, file, mime, w, h } albo { ok: false, reason }. */
  start() {
    if (this.recording) return { ok: false, reason: 'already_recording' };
    if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') return this._fail('unsupported');
    const src = this.r?.renderer?.domElement;
    if (!src) return this._fail('no_canvas');
    const pick = pickReelMime((m) => MediaRecorder.isTypeSupported(m));
    if (!pick) return this._fail('unsupported');
    const promo = !!this._promo();
    const size = reelOutputSize({ promo, canvasW: src.width, canvasH: src.height });
    const cv = this._canvas ?? (this._canvas = document.createElement('canvas'));
    cv.width = size.w; cv.height = size.h;
    this._ctx = cv.getContext('2d', { alpha: false });
    this._ctx.fillStyle = '#000'; this._ctx.fillRect(0, 0, size.w, size.h);
    this._ctx.imageSmoothingEnabled = true;
    this._ctx.imageSmoothingQuality = 'high';
    let stream;
    try { stream = cv.captureStream(0); } catch { stream = null; }
    let track = stream?.getVideoTracks?.()[0] ?? null;
    if (!track || typeof track.requestFrame !== 'function') { stream = cv.captureStream(REEL.FPS); track = stream.getVideoTracks()[0] ?? null; }
    let mr;
    try { mr = new MediaRecorder(stream, { mimeType: pick.mime, videoBitsPerSecond: REEL.BITRATE }); }
    catch (e) { return this._fail('recorder_error', e); }
    this._chunks = [];
    mr.ondataavailable = (e) => { if (e.data?.size) this._chunks.push(e.data); };
    const startedAt = Date.now();
    const file = reelFileName(new Date(startedAt), pick.ext);
    this._mode = { promo, w: size.w, h: size.h, mime: pick.mime, ext: pick.ext, file, startedAt };
    this._stream = stream; this._track = track; this._mr = mr;
    this._srcKey = ''; this.frames = 0; this.lastError = null;
    mr.start(REEL.TIMESLICE_MS);
    this._indicator(true);
    return { ok: true, file, mime: pick.mime, w: size.w, h: size.h, promo };
  }

  /** Stop — plik pobiera się sam; zwraca Promise z { ok, file, bytes } (blob także w `lastBlob`). */
  stop() {
    const mr = this._mr;
    if (!mr) return Promise.resolve({ ok: false, reason: 'not_recording' });
    const mode = this._mode;
    return new Promise((resolve) => {
      mr.onstop = () => {
        const blob = new Blob(this._chunks, { type: mode?.mime?.split(';')[0] ?? 'video/webm' });
        this._chunks = [];
        try { this._stream?.getTracks?.().forEach((tr) => tr.stop()); } catch { /* nic */ }
        this._mr = null; this._stream = null; this._track = null;
        this.lastBlob = blob; this.lastFile = mode?.file ?? null;
        this._download(blob, mode?.file ?? 'kosmos_reel.webm');
        this._indicator(false, mode?.file);
        resolve({ ok: true, file: mode?.file, bytes: blob.size, frames: this.frames, mime: mode?.mime });
      };
      try { mr.stop(); } catch (e) { this.lastError = String(e); resolve({ ok: false, reason: 'stop_error' }); }
    });
  }

  toggle() { return this.recording ? this.stop() : Promise.resolve(this.start()); }

  /** Raz na klatkę, TUŻ PO `render()` w pętli renderu: kopia wycinka płótna 3D do płótna nagrania (bez alokacji). */
  onFrame() {
    if (!this._mr || this._mr.state !== 'recording') return;
    const src = this.r?.renderer?.domElement;
    if (!src) return;
    const cw = src.width, ch = src.height, vw = src.clientWidth || cw, vh = src.clientHeight || ch;
    if (cw !== this._kcw || ch !== this._kch || vw !== this._kvw || vh !== this._kvh) {   // wycinek — tylko przy zmianie rozmiaru
      this._kcw = cw; this._kch = ch; this._kvw = vw; this._kvh = vh;
      reelSourceRect({ promo: this._mode.promo, canvasW: cw, canvasH: ch, cssW: vw, cssH: vh }, this._src);
    }
    const s = this._src, m = this._mode;
    this._ctx.drawImage(src, s.sx, s.sy, s.sw, s.sh, 0, 0, m.w, m.h);
    this._track?.requestFrame?.();
    this.frames++;
    const now = Date.now();
    if (now - this._indAt >= 250) { this._indAt = now; this._indicatorText(now - m.startedAt); }
  }

  _fail(reason, e = null) {
    this.lastError = e ? String(e) : reason;
    this._indicator(false, null, t('reel.unsupported'));
    return { ok: false, reason };
  }

  _download(blob, name) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (e) { this.lastError = String(e); }
  }

  _el() {
    let el = document.getElementById(REEL.INDICATOR_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = REEL.INDICATOR_ID;
      const s = el.style;
      s.position = 'fixed'; s.top = '6px'; s.left = '50%'; s.transform = 'translateX(-50%)'; s.zIndex = '200'; s.pointerEvents = 'none';
      s.font = '600 12px monospace'; s.padding = '2px 8px'; s.background = 'rgba(0,0,0,0.6)'; s.borderRadius = '3px'; s.display = 'none';
      document.body.appendChild(el);
    }
    return el;
  }

  _indicatorText(ms) {
    if (typeof document === 'undefined') return;
    const el = this._el();
    el.textContent = t('reel.rec', reelClock(ms));
  }

  _indicator(on, file = null, msg = null) {
    if (typeof document === 'undefined') return;
    const el = this._el();
    clearTimeout(this._indTimer);
    if (on) { el.style.color = '#ff3040'; el.style.display = 'block'; this._indicatorText(0); return; }
    const text = msg ?? (file ? t('reel.saved', file) : null);
    if (!text) { el.style.display = 'none'; return; }
    el.style.color = msg ? '#ffb000' : '#7dff9a'; el.textContent = text; el.style.display = 'block';
    this._indTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  info() {
    const m = this._mode;
    return { recording: this.recording, frames: this.frames, file: this.recording ? m?.file : this.lastFile, mime: m?.mime ?? null,
      size: m ? `${m.w}x${m.h}` : null, promo: !!m?.promo, seconds: this.recording && m ? +((Date.now() - m.startedAt) / 1000).toFixed(1) : null,
      lastBytes: this.lastBlob?.size ?? null, lastError: this.lastError };
  }
}
