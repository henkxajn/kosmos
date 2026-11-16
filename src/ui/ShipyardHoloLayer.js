// ShipyardHoloLayer — osobna kanwa hologramu bohatera Stoczni (ARC KONSOLE, krok K1c-B; CONSOLES_PLAN.md §10.1).
//
// Kanwa `#holo-canvas` między sceną 3D (i `#hud-canvas`) a `#ui-canvas`, o rozmiarze prostokąta hologramu (krawędzie na całych
// px CSS — `snapRectToCss`). UI zostawia ten prostokąt przezroczysty (`clearRect` w rysunku bohatera), więc warstwa leży POD
// chromem i nigdy go nie zasłania; podpowiedzi rysowane przez UI później wychodzą nad hologram.
// Obracanie myszą i przenikanie modelu malują TYLKO tę kanwę (własna klatka `requestAnimationFrame`) — bez przerysowania całego UI.
// Widoczność: UIManager otwiera i zamyka klatkę UI (`beginFrame` / `endFrame`); klatka, w której bohater się nie narysował
// (zamknięta Stocznia, czysty widok, inna zakładka) chowa warstwę w tym samym zadaniu JS — bez migania.
// Świat (document, rAF) wstrzykiwany — keeper `console_shipyard_b_smoke` wykonuje klasę pod node z atrapą.

import { snapRectToCss } from '../renderer/ShipHologramLogic.js';

export const HOLO_LAYER_ID = 'holo-canvas';

export class ShipyardHoloLayer {
  /** Czy w dokumencie jest gdzie wstawić warstwę (`#ui-canvas` z rodzicem). */
  static available(doc = globalThis.document) {
    const ui = doc?.getElementById?.('ui-canvas');
    return !!(ui && ui.parentNode && typeof doc.createElement === 'function');
  }

  /**
   * @param {object} [o]
   * @param {Document} [o.doc]
   * @param {(cb:Function) => any} [o.raf]
   * @param {() => void} [o.onFrame] — malowanie na żądanie (przeciąganie, przenikanie, wczytany model)
   */
  constructor({ doc = globalThis.document ?? null, raf = null, onFrame = null } = {}) {
    this._doc = doc;
    this._raf = raf ?? ((cb) => (globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(cb) : setTimeout(cb, 16)));
    this.onFrame = onFrame;
    this.canvas = null; this.ctx = null;
    this.rect = null;                 // prostokąt (px log.) po wyrównaniu do px CSS
    this._k = 1;                      // px log. → px bufora
    this._key = '';
    this._shown = false; this._used = false; this._pending = false;
    this.stats = { paints: 0, places: 0, frames: 0, hides: 0 };
  }

  _ensure() {
    if (this.canvas) return this.canvas;
    const doc = this._doc, ui = doc?.getElementById?.('ui-canvas');
    if (!ui?.parentNode) return null;
    const cv = doc.createElement('canvas');
    cv.id = HOLO_LAYER_ID;
    const st = cv.style;
    st.position = 'absolute'; st.zIndex = '1'; st.pointerEvents = 'none'; st.display = 'none';
    ui.parentNode.insertBefore(cv, ui);
    this.canvas = cv;
    this.ctx = cv.getContext('2d');
    return cv;
  }

  /**
   * Ustawia położenie i rozmiar warstwy dla prostokąta `rect` (px log.).
   * @param {number} cssPerLogical — skala UI (px CSS na px log.)
   * @param {number} bufPerLogical — px bufora na px log. (transformacja `#ui-canvas`: UI_SCALE × DPR)
   * @returns {{x:number,y:number,w:number,h:number}|null} prostokąt po wyrównaniu (ten sam czyści UI)
   */
  place(rect, cssPerLogical, bufPerLogical) {
    if (!this._ensure() || !rect) return null;
    const snap = snapRectToCss(rect, cssPerLogical);
    const k = Number.isFinite(bufPerLogical) && bufPerLogical > 0 ? bufPerLogical : cssPerLogical;
    const dpr = k / cssPerLogical;
    const bw = Math.max(1, Math.round(snap.css.width * dpr)), bh = Math.max(1, Math.round(snap.css.height * dpr));
    const key = `${snap.css.left},${snap.css.top},${snap.css.width},${snap.css.height},${bw},${bh}`;
    if (key !== this._key) {
      const st = this.canvas.style;
      st.left = `${snap.css.left}px`; st.top = `${snap.css.top}px`;
      st.width = `${snap.css.width}px`; st.height = `${snap.css.height}px`;
      this.canvas.width = bw; this.canvas.height = bh;   // przypisanie czyści bufor
      this._key = key;
      this.stats.places++;
    }
    this.rect = { x: snap.x, y: snap.y, w: snap.w, h: snap.h };
    this._k = k;
    return this.rect;
  }

  /** Klatka UI: bohater się narysował (warstwa zostaje widoczna). */
  markUsed() {
    this._used = true;
    if (!this._shown && this.canvas) { this.canvas.style.display = ''; this._shown = true; }
  }
  beginFrame() { this._used = false; }
  /** Koniec klatki UI: bohater nienarysowany → warstwa ukryta. */
  endFrame() { if (!this._used) this.hide(); }
  hide() {
    if (this._shown && this.canvas) { this.canvas.style.display = 'none'; this._shown = false; this.stats.hides++; }
  }
  get shown() { return this._shown; }

  /** Maluje warstwę: czyści bufor, transformacja px log. → bufor, `fn(ctx, rect)`. */
  paint(fn) {
    if (!this.ctx || !this.rect) return false;
    const c = this.ctx, k = this._k, r = this.rect;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(k, 0, 0, k, -r.x * k, -r.y * k);
    try { fn(c, r); } finally { c.setTransform(1, 0, 0, 1, 0, 0); }
    this.stats.paints++;
    return true;
  }

  /** Prośba o malowanie w następnej klatce (żądania w jednej klatce łączone). */
  requestPaint() {
    if (this._pending) return;
    this._pending = true;
    this._raf(() => { this._pending = false; this.stats.frames++; if (this._shown) this.onFrame?.(); });
  }

  destroy() {
    this.canvas?.parentNode?.removeChild?.(this.canvas);
    this.canvas = null; this.ctx = null; this.rect = null; this._key = ''; this._shown = false; this._used = false;
  }
}
