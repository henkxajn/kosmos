// MapModeBar — dyskretny przełącznik trybu mapy
// Pływa nad Three.js poniżej TopBar, wyśrodkowany
// Tryby: 'galaxy' | 'system' | 'body'

import { THEME, GLASS_BG_ALPHA, GLASS_BORDER, hexToRgb } from '../config/ThemeConfig.js';
import { COSMIC } from '../config/LayoutConfig.js';

const MODES = [
  { id: 'galaxy', labelPL: 'Galaktyka', labelEN: 'Galaxy',  icon: '\u2726' },
  { id: 'system', labelPL: 'Uk\u0142ad',     labelEN: 'System',  icon: '\u25CE' },
  { id: 'body',   labelPL: 'Cia\u0142o',     labelEN: 'Body',    icon: '\u2299' },
];

const BAR_H   = 24;    // wysokość paska
const BTN_W   = 52;    // szerokość jednego przycisku
const BTN_GAP = 2;     // odstęp między przyciskami
const BAR_W   = MODES.length * BTN_W + (MODES.length - 1) * BTN_GAP + 12; // padding 6 z każdej strony
const BAR_Y_OFFSET = 4; // odstęp od TopBar

export class MapModeBar {
  constructor() {
    this._mode = 'system'; // domyślny tryb
    this._hovered = null;
    this._hitRects = []; // [{id, x, y, w, h}] w logicznych koordynatach
  }

  get mode() { return this._mode; }
  set mode(v) { this._mode = v; }

  // Rysuje pasek w logicznych koordynatach (W = szerokość logiczna)
  draw(ctx, W, H) {
    const barX = Math.round((W - BAR_W) / 2);
    const barY = COSMIC.TOP_BAR_H + BAR_Y_OFFSET;

    this._hitRects = [];

    // Tło glass panelu
    const { r, g, b } = hexToRgb(THEME.bgPrimary);
    ctx.fillStyle = `rgba(${r},${g},${b},${GLASS_BG_ALPHA * 0.85})`;
    _roundRect(ctx, barX, barY, BAR_W, BAR_H, 4);
    ctx.fill();

    // Obramowanie
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    _roundRect(ctx, barX, barY, BAR_W, BAR_H, 4);
    ctx.stroke();

    // Przyciski
    MODES.forEach((mode, i) => {
      const bx = barX + 6 + i * (BTN_W + BTN_GAP);
      const by = barY + 2;
      const bw = BTN_W;
      const bh = BAR_H - 4;
      const isActive  = this._mode === mode.id;
      const isHovered = this._hovered === mode.id;

      // Tło przycisku
      if (isActive) {
        ctx.fillStyle = `rgba(0,255,180,0.18)`;
        _roundRect(ctx, bx, by, bw, bh, 3);
        ctx.fill();
        // Aktywna krawędź
        ctx.strokeStyle = THEME.borderActive;
        ctx.lineWidth = 1;
        _roundRect(ctx, bx, by, bw, bh, 3);
        ctx.stroke();
      } else if (isHovered) {
        ctx.fillStyle = `rgba(0,255,180,0.08)`;
        _roundRect(ctx, bx, by, bw, bh, 3);
        ctx.fill();
      }

      // Ikona
      ctx.font = `13px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isActive ? THEME.accent : (isHovered ? THEME.textPrimary : THEME.textSecondary);
      ctx.fillText(mode.icon, bx + bw / 2, by + bh / 2 - 4);

      // Etykieta tekstowa (mała)
      const lang = window.KOSMOS?.lang ?? 'pl';
      ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
      ctx.fillStyle = isActive ? THEME.accent : THEME.textDim;
      const label = lang === 'pl' ? mode.labelPL : mode.labelEN;
      ctx.fillText(label, bx + bw / 2, by + bh - 3);

      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';

      this._hitRects.push({ id: mode.id, x: bx, y: by, w: bw, h: bh });
    });
  }

  // Zwraca id trybu pod kursorem lub null
  hitTest(lx, ly) {
    for (const r of this._hitRects) {
      if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) return r.id;
    }
    return null;
  }

  onMouseMove(lx, ly) { this._hovered = this.hitTest(lx, ly); }

  onClick(lx, ly) {
    const hit = this.hitTest(lx, ly);
    if (hit) { this._mode = hit; return hit; }
    return null;
  }
}

// Helpers
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
