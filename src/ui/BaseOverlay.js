// BaseOverlay — klasa bazowa dla paneli overlay (Canvas 2D)
//
// Zapewnia wspólne API: toggle/show/hide, hitZones, helpers rysowania.
// Podklasy nadpisują draw(ctx, W, H) i _onHit(zone).

import { THEME }  from '../config/ThemeConfig.js';
import { COSMIC } from '../config/LayoutConfig.js';

export class BaseOverlay {
  constructor(state) {
    this.state = state;
    this.visible = false;
    this._hitZones = [];     // reset co draw() — [{ x,y,w,h, type, data }]
    this._hoverZone = null;
  }

  toggle() { this.visible = !this.visible; }
  show()   { this.visible = true; }
  hide()   { this.visible = false; this._hoverZone = null; }

  // Override w podklasie
  draw(ctx, W, H) {}
  _onHit(zone) {}

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
    return {
      ox: 0,
      oy: COSMIC.TOP_BAR_H,
      ow: W - COSMIC.OUTLINER_W,
      oh: H - COSMIC.TOP_BAR_H - COSMIC.BOTTOM_BAR_H,
    };
  }
}
