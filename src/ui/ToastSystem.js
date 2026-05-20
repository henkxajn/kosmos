// ToastSystem — proste transient powiadomienia DOM (top-right).
//
// Konsumuje EventBus 'ui:toast' { text, color?, durationMs? }. Każdy toast =
// element DOM z auto-fade po durationMs (default 2500). Stack vertical, max 5
// na raz (starsze zanikają wcześniej).
//
// Niezależny od overlay'i — używa fixed positioning, z-index 5000 (wyżej niż
// modals=1000, niżej niż confirm=1000). Wzór: ModalInput.js DOM styling.

import EventBus from '../core/EventBus.js';
import { THEME, hexToRgb } from '../config/ThemeConfig.js';

const Z_INDEX = 5000;
const MAX_STACK = 5;
const DEFAULT_DURATION_MS = 2500;
const FADE_MS = 200;

export class ToastSystem {
  constructor() {
    this._container = null;
    this._stack = [];  // [{ el, timer }]
    this._ensureContainer();
    EventBus.on('ui:toast', (payload) => this._showToast(payload));
  }

  _ensureContainer() {
    if (this._container) return;
    const c = document.createElement('div');
    c.className = 'kosmos-toast-container';
    Object.assign(c.style, {
      position: 'fixed',
      top: '60px',
      right: '12px',
      zIndex: String(Z_INDEX),
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      pointerEvents: 'none',  // toasty nie blokują klików
      maxWidth: '380px',
    });
    document.body.appendChild(c);
    this._container = c;
  }

  _showToast({ text, color, durationMs } = {}) {
    if (!text) return;
    this._ensureContainer();
    const accent = color || THEME.accent;
    const rgb = hexToRgb(accent);
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      background: THEME.bgSecondary,
      border: `1px solid ${accent}`,
      borderLeft: `4px solid ${accent}`,
      borderRadius: '4px',
      padding: '10px 14px',
      color: THEME.textPrimary,
      fontFamily: THEME.fontFamily,
      fontSize: `${THEME.fontSizeNormal}px`,
      boxShadow: `0 4px 16px rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`,
      opacity: '0',
      transform: 'translateX(20px)',
      transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
    });
    this._container.appendChild(el);

    // Trim stack
    if (this._stack.length >= MAX_STACK) {
      const oldest = this._stack.shift();
      this._fadeOut(oldest.el);
      clearTimeout(oldest.timer);
    }

    // Fade in (next frame)
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });

    const dur = typeof durationMs === 'number' ? durationMs : DEFAULT_DURATION_MS;
    const timer = setTimeout(() => this._fadeOut(el), dur);
    this._stack.push({ el, timer });
  }

  _fadeOut(el) {
    if (!el || !el.parentNode) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
      this._stack = this._stack.filter(s => s.el !== el);
    }, FADE_MS);
  }
}
