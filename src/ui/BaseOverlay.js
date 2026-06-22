// BaseOverlay — klasa bazowa dla paneli overlay (Canvas 2D)
//
// Zapewnia wspólne API: toggle/show/hide, hitZones, helpers rysowania.
// Podklasy nadpisują draw(ctx, W, H) i _onHit(zone).

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC } from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W, getSubNavHeight } from './CivPanelDrawer.js';

// ── Standard nagłówka overlayu ──────────────────────────────────────────
// Wspólna wysokość pasma nagłówka (wzorzec: EconomyOverlay). Treść overlayu
// zaczyna się od oy + HEADER_H. Zmieniaj TYLKO tutaj — propaguje na wszystkie overlaye.
export const HEADER_H = 44;

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

  // ── Standardowy nagłówek overlayu ──────────────────────────────────────
  // Pasmo (HEADER_H) + tytuł (bold 13px accent, do lewej) + linia separatora
  // na dole pasma (borderLight). Wzorzec: EconomyOverlay._drawLeft.
  // Podtytuł / przycisk ✕ / treść rysuje overlay osobno PO tym wywołaniu.
  _drawOverlayHeader(ctx, ox, oy, ow, title) {
    // Pasmo nagłówka
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(ox, oy, ow, HEADER_H);
    // Tytuł — bold 13px accent, wyrównany do lewej
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, ox + 14, oy + 18);
    // Separator 1px pod tytułem (dół pasma)
    ctx.strokeStyle = THEME.borderLight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, oy + HEADER_H);
    ctx.lineTo(ox + ow, oy + HEADER_H);
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
    // +pas subnav, gdy aktywny overlay jest w grupie >1 (singletony → 0). Nav 14→7.
    // UI v3 — overlaye stykają się z dolną krawędzią górnej belki (TOP_BAND_H, nie TOP_BAR_H);
    // belka surowców rozwija się przy hoverze i zasłania górny skrawek overlayu (zamierzone).
    const topOffset = COSMIC.TOP_BAND_H + COSMIC.MAP_MODE_H + getSubNavHeight();
    // Slice 3 — zostaw miejsce na BottomResourceBar (cienki pasek nad BottomBar w civMode),
    // żeby overlay nie chował dolnej treści (np. bilansu energii) pod paskiem.
    const resBar = window.KOSMOS?.civMode ? (COSMIC.RESOURCE_BAR_H ?? 0) : 0;
    // UI v3 — rezerwa dolna w civMode = stały pasek nawigacji + listwa dziennika; poza
    // civMode (Generator) = dolny pasek.
    const bottomRes = window.KOSMOS?.civMode
      ? (COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H)
      : COSMIC.BOTTOM_BAR_H;
    return {
      ox: CIV_SIDEBAR_W,
      oy: topOffset,
      // Slice B — overlaye pełnoekranowe: bez rezerwy na Outliner (ten jest teraz
      // prawym wysuwanym drawerem rysowanym NA WIERZCHU overlayu, nie obok).
      ow: W - CIV_SIDEBAR_W,
      oh: H - topOffset - bottomRes - resBar,
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
