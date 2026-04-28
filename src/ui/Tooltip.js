// ── M3 P1.5 — Universal Tooltip (DOM component) ────────────────────────
// Single instance globalny. Dwa źródła hover (flag #4: shared state, last
// hover wins, brak double-tooltip):
//   1. Canvas hover — GameScene mousemove → raycaster (P1.2/P1.3.5) →
//      schedule(content, screenPoint) z 500ms delay.
//   2. DOM hover — global mouseover/mouseout (bubble phase) na elementach
//      z `data-tooltip="text"`. Pattern α (Filip D6).
//
// Architektura:
//   - <div id="kosmos-tooltip">, position:fixed, z=99999 (nad picker-banner z=9998
//     i RightClickMenu z=9999), pointer-events:none (L23 — nie blokuje kliknięć).
//   - show(content, screenPoint) z boundary flip (L22) gdy tooltip wystaje
//     poza viewport (right/bottom) → przesuwamy w lewo/górę.
//   - hide() instant (mouse out → no flicker).
//   - schedule(content, screenPoint, key?) — start 500ms timer; reset gdy key
//     się zmienia. Same key → keep timer (no flicker).
//
// Dual-source coexistence: GameScene canvas hover wywołuje schedule(...) z key
// = entityId; DOM mouseover wywołuje schedule(...) z key = data-tooltip text.
// Każde nowe wywołanie z DIFFERENT key resetuje timer i replaces content.

import { GAME_CONFIG } from '../config/GameConfig.js';
import { THEME } from '../config/ThemeConfig.js';

export class Tooltip {
  constructor() {
    this._el = null;
    this._timerId = null;
    this._currentKey = null;   // discriminator dla schedule (same-key → keep timer)
    this._domListenerInstalled = false;

    this._ensureElement();
    this._installDomListener();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Pokaż tooltip natychmiast (omija delay).
   * @param {{ title?: string, lines: string[] } | string} content
   * @param {{ x: number, y: number }} screenPoint — clientX/clientY
   */
  show(content, screenPoint) {
    if (!this._el) return;
    if (!content) return;

    const html = _renderContent(content);
    if (!html) { this.hide(); return; }

    this._el.innerHTML = html;
    this._el.style.display = 'block';
    this._positionWithFlip(screenPoint);
  }

  /**
   * Schedule pokaz po `delayMs` (default GAME_CONFIG.UI.tooltipDelayMs).
   * Same `key` jak poprzednio → keep timer (no flicker przy mousemove
   * w obrębie tego samego entity). Different key → reset + restart.
   *
   * @param {{ title?: string, lines: string[] } | string} content
   * @param {{ x: number, y: number }} screenPoint
   * @param {string|null} [key] — entity id lub data-tooltip text (discriminator)
   */
  schedule(content, screenPoint, key = null) {
    if (!content) { this.cancelSchedule(); this.hide(); return; }
    if (key !== null && key === this._currentKey && this._timerId !== null) {
      // Same target — nie restartuj timera (no flicker), ale jeśli już widoczny,
      // pozwól pozycjonować się przy bieżącym cursorze.
      return;
    }
    this.cancelSchedule();
    this.hide();
    this._currentKey = key;
    const delay = GAME_CONFIG?.UI?.tooltipDelayMs ?? 500;
    this._timerId = setTimeout(() => {
      this._timerId = null;
      this.show(content, screenPoint);
    }, delay);
  }

  /** Cancel pending schedule (mouse out PRZED expiry timera). */
  cancelSchedule() {
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  hide() {
    this.cancelSchedule();
    this._currentKey = null;
    if (this._el) this._el.style.display = 'none';
  }

  // ── Internal ────────────────────────────────────────────────────────────

  _ensureElement() {
    if (this._el) return;
    let el = document.getElementById('kosmos-tooltip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kosmos-tooltip';
      document.body.appendChild(el);
    }
    el.style.cssText = `
      position: fixed;
      z-index: 99999;
      pointer-events: none;
      display: none;
      max-width: 320px;
      padding: 6px 9px;
      background: rgba(8, 14, 22, 0.96);
      border: 1px solid ${THEME.borderActive ?? '#5a8a52'};
      border-radius: 4px;
      font-family: ${THEME.fontFamily ?? "'Courier New', monospace"};
      font-size: ${(THEME.fontSizeSmall ?? 11)}px;
      color: ${THEME.textPrimary ?? '#dfeacb'};
      line-height: 1.45;
      white-space: pre;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.55);
    `;
    this._el = el;
  }

  _positionWithFlip(screenPoint) {
    if (!this._el) return;
    const offsetX = 14;
    const offsetY = -10;
    // Wstępna pozycja: prawo-góra od cursora
    let left = screenPoint.x + offsetX;
    let top  = screenPoint.y + offsetY;

    // Po wstawieniu treści mierzymy wymiary (display:block już ustawiony przez show)
    const rect = this._el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Flip horizontal — gdy tooltip wystaje poza prawą krawędź
    if (left + rect.width > vw - 4) {
      left = screenPoint.x - rect.width - offsetX;
    }
    // Flip vertical — gdy wystaje poza dolną krawędź
    if (top + rect.height > vh - 4) {
      top = screenPoint.y - rect.height - 4;
    }
    // Clamp do non-negative (gdy mouse blisko lewej/górnej krawędzi po flip'ie)
    if (left < 4) left = 4;
    if (top  < 4) top  = 4;

    this._el.style.left = `${left}px`;
    this._el.style.top  = `${top}px`;
  }

  // Global mouseover/mouseout (capture=false → bubble) na document.body —
  // wykrywa elementy z `data-tooltip` (Filip D6=α). Single instance, capture=false
  // żeby move w obrębie elementu nie spamował restartów.
  _installDomListener() {
    if (this._domListenerInstalled) return;
    this._domListenerInstalled = true;

    document.addEventListener('mouseover', (e) => {
      const el = e.target?.closest?.('[data-tooltip]');
      if (!el) return;
      const text = el.dataset.tooltip;
      if (!text) return;
      this.schedule(text, { x: e.clientX, y: e.clientY }, `dom:${text}`);
    });
    document.addEventListener('mouseout', (e) => {
      const el = e.target?.closest?.('[data-tooltip]');
      if (!el) return;
      // mouseout odpala się też przy ruchu między dziećmi tego samego elementu —
      // sprawdzamy relatedTarget żeby uniknąć false-hide (relatedTarget też w el).
      if (el.contains?.(e.relatedTarget)) return;
      this.cancelSchedule();
      this.hide();
    });
  }
}

// ── Render helpers ────────────────────────────────────────────────────────

function _renderContent(content) {
  if (typeof content === 'string') {
    return _escapeHtml(content);
  }
  if (!content || typeof content !== 'object') return '';
  const parts = [];
  if (content.title) {
    parts.push(`<div style="font-weight:bold;color:${THEME.accent ?? '#9bdc6f'};margin-bottom:3px;">${_escapeHtml(content.title)}</div>`);
  }
  if (Array.isArray(content.lines) && content.lines.length > 0) {
    parts.push(content.lines.map(l => _escapeHtml(String(l))).join('<br>'));
  }
  return parts.join('');
}

function _escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
