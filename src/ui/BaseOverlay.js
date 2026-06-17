// BaseOverlay — klasa bazowa dla paneli overlay (Canvas 2D)
//
// Zapewnia wspólne API: toggle/show/hide, hitZones, helpers rysowania.
// Podklasy nadpisują draw(ctx, W, H) i _onHit(zone).

import { THEME }  from '../config/ThemeConfig.js';
import { COSMIC } from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W } from './CivPanelDrawer.js';

export class BaseOverlay {
  constructor(state) {
    this.state = state;
    this.visible = false;
    this._hitZones = [];     // reset co draw() — [{ x,y,w,h, type, data }]
    this._hoverZone = null;

    // Rect-select (LMB drag) — współdzielona mechanika dla overlayów.
    // Subklasa opt-inuje przez nadpisanie _canStartRectSelect() + _onRectSelectComplete().
    this._rectSelect = {
      active: false,
      startX: 0, startY: 0,
      curX:   0, curY:   0,
      mods: { shift: false, ctrl: false }, // snapshot przy starcie
    };
  }

  toggle() { this.visible = !this.visible; }
  show()   { this.visible = true; }
  hide()   { this.visible = false; this._hoverZone = null; this._rectSelect.active = false; }

  // Override w podklasie
  draw(ctx, W, H) {}
  _onHit(zone) {}

  // ── Rect-select hooks (override w subklasie, domyślnie no-op / disabled) ──
  /** Czy LMB down w (x,y) powinien rozpocząć rect-select? Domyślnie false (opt-in). */
  _canStartRectSelect(x, y) { return false; }
  /** Wywoływane po zwolnieniu LMB — wykonaj selekcję. bounds = {minX,minY,maxX,maxY,w,h}. */
  _onRectSelectComplete(bounds, mods) {}
  /** Opcjonalny live-preview: zwróć Set id-ków które byłyby zaznaczone. */
  _onRectSelectPreview(bounds) { return null; }

  handleClick(x, y) {
    if (!this.visible) return false;
    const hit = this._hitTest(x, y);
    if (!hit) return false;
    this._onHit(hit);
    return true; // zatrzymaj propagację do reszty UI
  }

  handleMouseMove(x, y) {
    if (!this.visible) return;
    this._hoverZone = this._hitTest(x, y);
    if (this._rectSelect.active) {
      this._rectSelect.curX = x;
      this._rectSelect.curY = y;
    }
  }

  // ── Rect-select: default mousedown/up handlery (subklasa może override + super) ──
  handleMouseDown(x, y, button = 0) {
    if (!this.visible) return;
    if (button !== 0) return; // tylko LMB startuje rect-select
    if (!this._canStartRectSelect(x, y)) return;
    const mods = this._lastMouseMods ?? { shift: false, ctrl: false };
    this._rectSelect.active = true;
    this._rectSelect.startX = x;
    this._rectSelect.startY = y;
    this._rectSelect.curX   = x;
    this._rectSelect.curY   = y;
    this._rectSelect.mods   = { shift: !!mods.shift, ctrl: !!mods.ctrl };
  }

  handleMouseUp(x, y, button = 0) {
    if (!this.visible) return;
    if (!this._rectSelect.active) return;
    if (button !== 0) { this._rectSelect.active = false; return; }

    const minX = Math.min(this._rectSelect.startX, this._rectSelect.curX);
    const minY = Math.min(this._rectSelect.startY, this._rectSelect.curY);
    const maxX = Math.max(this._rectSelect.startX, this._rectSelect.curX);
    const maxY = Math.max(this._rectSelect.startY, this._rectSelect.curY);
    const w = maxX - minX, h = maxY - minY;

    this._rectSelect.active = false;

    // Poniżej progu — traktuj jako klik, niech handleClick zrobi swoje
    if (w < 6 && h < 6) return;

    this._onRectSelectComplete({ minX, minY, maxX, maxY, w, h }, this._rectSelect.mods);
  }

  /** Aktualny prostokąt selekcji (znormalizowany) lub null gdy nieaktywny. */
  _getRectSelectBounds() {
    if (!this._rectSelect.active) return null;
    const minX = Math.min(this._rectSelect.startX, this._rectSelect.curX);
    const minY = Math.min(this._rectSelect.startY, this._rectSelect.curY);
    const maxX = Math.max(this._rectSelect.startX, this._rectSelect.curX);
    const maxY = Math.max(this._rectSelect.startY, this._rectSelect.curY);
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  _addHit(x, y, w, h, type, data = {}) {
    this._hitZones.push({ x, y, w, h, type, data });
  }

  _hitTest(x, y) {
    return this._hitZones.find(
      z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h
    ) ?? null;
  }

  // ── Wspólne helpers rysowania ──────────────────────────────────────────

  _drawRect(ctx, x, y, w, h, fillColor, strokeColor = null) {
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, w, h);
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }

  _drawText(ctx, text, x, y, color, sizePx, align = 'left') {
    ctx.fillStyle = color;
    ctx.font = `${sizePx}px ${THEME.fontFamily}`;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }

  _drawBar(ctx, x, y, w, h, pct, fillColor, bgColor) {
    ctx.fillStyle = bgColor ?? THEME.border;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fillColor ?? THEME.accent;
    ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, pct))), h);
  }

  _drawSeparator(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // style: 'primary' | 'secondary' | 'danger' | 'unique' | 'disabled'
  _drawButton(ctx, label, x, y, w, h, style = 'secondary') {
    const isHover = this._hoverZone?.data?.label === label &&
                    this._hoverZone?.x === x;
    const S = {
      primary:   { b: THEME.accent,       t: THEME.accent,         bg: isHover ? 'rgba(0,255,180,0.08)' : 'transparent' },
      secondary: { b: THEME.borderLight,  t: THEME.textSecondary,  bg: isHover ? 'rgba(0,255,180,0.04)' : 'transparent' },
      danger:    { b: 'rgba(255,51,68,0.4)', t: THEME.danger,      bg: isHover ? 'rgba(255,51,68,0.08)' : 'transparent' },
      unique:    { b: 'rgba(0,255,180,0.4)', t: THEME.accent,      bg: isHover ? 'rgba(0,255,180,0.08)' : 'transparent' },
      disabled:  { b: THEME.border,       t: THEME.textDim,        bg: 'transparent' },
    }[style] ?? { b: THEME.border, t: THEME.textDim, bg: 'transparent' };

    ctx.fillStyle = S.bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = S.b;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = S.t;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 4);
    ctx.textAlign = 'left';
  }

  // Pomocniczy — oblicz wymiary overlay na podstawie canvas
  _getOverlayBounds(W, H) {
    const topOffset = COSMIC.TOP_BAR_H + COSMIC.MAP_MODE_H;
    // Slice 3 — zostaw miejsce na BottomResourceBar (cienki pasek nad BottomBar w civMode),
    // żeby overlay nie chował dolnej treści (np. bilansu energii) pod paskiem.
    const resBar = window.KOSMOS?.civMode ? (COSMIC.RESOURCE_BAR_H ?? 0) : 0;
    return {
      ox: CIV_SIDEBAR_W,
      oy: topOffset,
      ow: W - COSMIC.OUTLINER_W - CIV_SIDEBAR_W,
      oh: H - topOffset - COSMIC.BOTTOM_BAR_H - resBar,
    };
  }

  // ── Rect-select rendering ─────────────────────────────────────────────────
  // Spójny styl prostokąta selekcji dla wszystkich overlayów (mint accent).
  // Wywołuj z draw() gdy _rectSelect.active jest true (overlay decyduje).
  _drawRectSelect(ctx) {
    const b = this._getRectSelectBounds();
    if (!b) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 255, 180, 0.10)';
    ctx.fillRect(b.minX, b.minY, b.w, b.h);
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(b.minX + 0.5, b.minY + 0.5, b.w - 1, b.h - 1);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Cienka obwódka (live-preview) wokół punktu (x, y) — np. wokół sprite'a jednostki.
  _drawRectSelectPreviewOutline(ctx, cx, cy, radius = 14) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.65)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.setLineDash([]);
    ctx.restore();
  }
}
