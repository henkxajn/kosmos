// PanelDock — wspólny pasek zadań zminimalizowanych pływających paneli (S3.4b C2).
//
// Współdzielony przez BottomContext („okno planety") i StationPanel. Panel minimalizuje się
// przez register() (belka trafia do doku, karta znika), a klik belki woła jej onRestore()
// (przywrócenie panelu na poprzednią pozycję). Belki stackują się pionowo w lewym-dolnym rogu
// nad paskiem nawigacji (geometria + kolejność w PanelDockLogic.computeDockSlots).
//
// Trzymany bezpośrednio przez UIManager (jak StationPanel): rysowany PO overlayManagerze,
// klikany PRZED nim, blokuje kamerę przez isOver w UIManager.isOverUI.

import { THEME, bgAlpha }   from '../config/ThemeConfig.js';
import { COSMIC }           from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W }    from './CivPanelDrawer.js';
import { computeDockSlots } from './PanelDockLogic.js';

const BAR_W = 156;
const BAR_H = 24;
const GAP   = 4;

export class PanelDock {
  constructor() {
    this._entries  = [];    // [{ key, icon, label, restorePos, onRestore }] — kolejność = stack (najstarszy najniżej)
    this._hitZones = [];    // [{ x, y, w, h, key }] z ostatniego draw
    this._hover    = null;  // key belki pod kursorem
  }

  /** Zadokuj (lub zaktualizuj) belkę. Idempotent po `key`. */
  register(key, { icon, label, restorePos = null, onRestore } = {}) {
    const ex = this._entries.find(e => e.key === key);
    if (ex) { ex.icon = icon; ex.label = label; ex.restorePos = restorePos; ex.onRestore = onRestore; return; }
    this._entries.push({ key, icon, label, restorePos, onRestore });
  }

  unregister(key) {
    const i = this._entries.findIndex(e => e.key === key);
    if (i >= 0) this._entries.splice(i, 1);
    if (this._hover === key) this._hover = null;
  }

  has(key)  { return this._entries.some(e => e.key === key); }
  get(key)  { return this._entries.find(e => e.key === key) ?? null; }
  count()   { return this._entries.length; }
  clear()   { this._entries = []; this._hitZones = []; this._hover = null; }

  // Geometria doku — lewy-dół obszaru mapy, nad paskiem nawigacji (civMode) / dolnym paskiem.
  _geom(W, H) {
    const civMode = window.KOSMOS?.civMode;
    const leftX = (civMode ? CIV_SIDEBAR_W : 0) + 8;
    const bottomReserved = civMode
      ? (COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H)
      : COSMIC.BOTTOM_BAR_H;
    return { H, barW: BAR_W, barH: BAR_H, gap: GAP, leftX, bottomReserved, topLimit: COSMIC.TOP_BAR_H };
  }

  draw(ctx, W, H) {
    this._hitZones = [];
    if (!this._entries.length) return;
    const slots = computeDockSlots(this._entries.length, this._geom(W, H));

    ctx.save();
    for (const s of slots) {
      const e = this._entries[s.index];
      const hover = this._hover === e.key;
      // Tło + ramka (brutalist terminal — jak pływające panele)
      ctx.fillStyle = bgAlpha(hover ? 0.95 : 0.85);
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeStyle = hover ? THEME.accent : (THEME.borderActive ?? THEME.accent);
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
      // Pasek akcentu (lewa krawędź — ikonografia „okno")
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(s.x + 1.5, s.y + 3, 2.5, s.h - 6);
      // Ikona + nazwa (ucięta do szerokości belki)
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = hover ? THEME.accent : THEME.textSecondary;
      const label = this._truncate(ctx, `${e.icon ?? '▪'} ${e.label ?? ''}`, s.w - 12);
      ctx.fillText(label, s.x + 8, s.y + s.h / 2 + 0.5);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();

    for (const s of slots) {
      this._hitZones.push({ x: s.x, y: s.y, w: s.w, h: s.h, key: this._entries[s.index].key });
    }
  }

  /** Klik belki → przywróć panel (onRestore). Zwraca true gdy trafiono. */
  handleClick(x, y) {
    const z = this._hitZones.find(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
    if (!z) return false;
    const e = this._entries.find(e => e.key === z.key);
    if (e?.onRestore) e.onRestore();
    return true;
  }

  isOver(x, y) {
    return this._hitZones.some(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  }

  handleMouseMove(x, y) {
    const z = this._hitZones.find(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
    this._hover = z ? z.key : null;
  }

  _truncate(ctx, text, maxW) {
    text = String(text ?? '');
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
}
