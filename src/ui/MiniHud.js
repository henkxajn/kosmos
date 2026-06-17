// MiniHud — stały mini-panel aktywnej kolonii w lewym dolnym rogu (redesign UI v1, Slice 2).
//
// Zawsze widoczny w civMode (non-exclusive jak CombatHUD/StationPanel — rysowany PO
// overlayManager, klik obsługiwany PRZED nim). Pokazuje: nazwa aktywnej kolonii ·
// alert brownout (gdy deficyt energii) · Pop · Kr. Klik → otwiera pełny panel kolonii
// (overlayManager 'colony', jak klawisz C). Read-only z window.KOSMOS + energyFlow z UIManager.

import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { COSMIC }       from '../config/LayoutConfig.js';
import EntityManager    from '../core/EntityManager.js';
import { t }            from '../i18n/i18n.js';

const PAD    = 8;
const MARGIN = 12;   // odstęp od krawędzi ekranu
const MIN_W  = 140;
const MAX_W  = 260;

export class MiniHud {
  constructor() {
    this._rect = null; // {x,y,w,h} ostatnio narysowany — hit-test
  }

  _fmtPop(p) {
    if (!p) return '0';
    return Number.isInteger(p) ? String(p) : p.toFixed(1);
  }

  _fmtKr(n) {
    const a = Math.abs(n);
    if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (a >= 10_000)    return `${(n / 1_000).toFixed(1)}k`;
    return String(Math.round(n));
  }

  _truncate(ctx, text, maxW) {
    text = String(text ?? '');
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  // energyFlow przekazywany przez UIManager (właściciel _energyFlow aktywnej kolonii).
  draw(ctx, W, H, energyFlow) {
    const colony = window.KOSMOS?.colonyManager?.getActiveColony?.();
    if (!colony) { this._rect = null; return; }

    const name     = colony.name ?? EntityManager.get(colony.planetId)?.name ?? colony.planetId ?? '—';
    const pop      = colony.civSystem?.population ?? 0;
    const credits  = colony.credits ?? 0;
    const brownout = !!energyFlow?.brownout;

    const brownoutLine = brownout ? t('econPanel.brownout') : null;
    const statsLine    = `👤 ${this._fmtPop(pop)}  ·  ${this._fmtKr(credits)} Kr`;

    // Szerokość z najszerszej linii (clamp MIN..MAX)
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    let maxTextW = ctx.measureText(name).width;
    if (brownoutLine) maxTextW = Math.max(maxTextW, ctx.measureText(brownoutLine).width);
    maxTextW = Math.max(maxTextW, ctx.measureText(statsLine).width);
    const hudW = Math.max(MIN_W, Math.min(MAX_W, Math.ceil(maxTextW) + PAD * 2));
    const hudH = PAD * 2 + 16 + (brownoutLine ? 14 : 0) + 14;

    const px = MARGIN;
    const py = H - COSMIC.BOTTOM_BAR_H - hudH - 8;
    this._rect = { x: px, y: py, w: hudW, h: hudH };

    // Tło + ramka (ramka czerwona przy brownout — sygnał krytyczny)
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(px, py, hudW, hudH);
    ctx.strokeStyle = brownout ? THEME.danger : GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, hudW - 1, hudH - 1);

    let cy = py + PAD;
    ctx.textAlign = 'left';

    // Nazwa kolonii
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(this._truncate(ctx, name, hudW - PAD * 2), px + PAD, cy + 12);
    cy += 16;

    // Brownout (gdy deficyt energii)
    if (brownoutLine) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText(brownoutLine, px + PAD, cy + 11);
      cy += 14;
    }

    // Pop · Kr
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(statsLine, px + PAD, cy + 11);
  }

  // Klik → otwórz panel kolonii (jak klawisz C). Zwraca true gdy zjadł klik.
  handleClick(x, y) {
    if (!this._rect) return false;
    const r = this._rect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      window.KOSMOS?.overlayManager?.openPanel?.('colony');
      return true;
    }
    return false;
  }
}
