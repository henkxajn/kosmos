// PanelDock — wspólny dok zminimalizowanych pływających paneli (S3.4b C2; ARKUSZ UI U4-3 — chipy na pasie dolnym).
//
// Współdzielony przez BottomContext („okno planety") i StationPanel. Panel minimalizuje się przez register() (chip trafia
// do doku, karta znika), a klik chipa woła jego onRestore() (przywrócenie panelu na poprzednią pozycję).
//
// ARKUSZ UI U4-3 (UI_PLAN §4.5, decyzja (c)): chipy 16 px w JEDNYM rzędzie na pasie dolnym, od lewego końca pasa —
// prostokąt rzędu daje `BottomControlBar.getDockSpan()` (pas zaczyna się przy prawej krawędzi lewego outlinera, rząd
// kończy się przed klastrem po prawej). Szerokość chipa = ikona + skrócona nazwa (do `DOCK_CHIP_MAX_W`), odstęp 4 px;
// gdy wszystkie się nie mieszczą — ostatni chip „+N” z listą niewidocznych w podpowiedzi (klik w „+N” przywraca pierwszy
// niewidoczny panel). Bez pasa (Generator, wywołanie bez prostokąta) — ten sam rząd nad dolną krawędzią obszaru mapy
// (`MapInsets`). Dawniej belki 156 × 24 px w stosie pionowym w lewym dolnym rogu mapy (koniec stosu — decyzja (c)).
//
// Trzymany bezpośrednio przez UIManager (jak StationPanel): rysowany PO overlayManagerze, klikany PRZED nim, blokuje
// kamerę przez isOver w UIManager.isOverUI.

import { THEME, bgAlpha }   from '../config/ThemeConfig.js';
import { getMapInsets }     from './MapInsets.js';   // ARKUSZ UI U2-2 — jedno źródło wcięć obszaru mapy
import { layoutDockChips, DOCK_CHIP_H, DOCK_CHIP_GAP, DOCK_CHIP_MAX_W } from './PanelDockLogic.js';

const CHIP_PAD_X = 6;          // px — margines tekstu w chipie
const TIP_LINE_H = 13;         // px — wiersz podpowiedzi „+N”
const MORE_KEY   = '__more__'; // klucz trafienia chipa „+N”

export class PanelDock {
  constructor() {
    this._entries  = [];    // [{ key, icon, label, restorePos, onRestore }] — kolejność = rząd (najstarszy pierwszy)
    this._hitZones = [];    // [{ x, y, w, h, key, first? }] z ostatniego draw (`first` — chip „+N”)
    this._hover    = null;  // key chipa pod kursorem (`MORE_KEY` — „+N”)
  }

  /** Zadokuj (lub zaktualizuj) chip. Idempotent po `key`. */
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

  // Bez pasa dolnego (Generator; wywołanie bez prostokąta) — rząd nad dolną krawędzią obszaru mapy (`MapInsets`).
  _fallbackSpan(W, H) {
    const ins = getMapInsets();
    return { x0: ins.left + 8, x1: W - ins.right - 8, y: H - ins.bottom - DOCK_CHIP_H - 6, h: DOCK_CHIP_H };
  }

  /**
   * @param {{x0:number, x1:number, y:number, h:number}|null} [span] — rząd chipów na pasie dolnym
   *   (`BottomControlBar.getDockSpan()`); bez niego — `_fallbackSpan`
   */
  draw(ctx, W, H, span = null) {
    this._hitZones = [];
    if (!this._entries.length) return;
    const row = span ?? this._fallbackSpan(W, H);
    ctx.save();
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const labels = this._entries.map(e => this._truncate(ctx, `${e.icon ?? '▪'} ${e.label ?? ''}`, DOCK_CHIP_MAX_W - 2 * CHIP_PAD_X));
    const widths = labels.map(s => Math.ceil(Math.min(DOCK_CHIP_MAX_W, ctx.measureText(s).width + 2 * CHIP_PAD_X)));
    // „+N” liczony dla najszerszego możliwego licznika (wszystkie wpisy) — rzeczywisty N jest mniejszy.
    const moreW = Math.ceil(ctx.measureText(`+${this._entries.length}`).width + 2 * CHIP_PAD_X);
    const { chips, more } = layoutDockChips(widths, { x0: row.x0, x1: row.x1, y: row.y, h: row.h ?? DOCK_CHIP_H, gap: DOCK_CHIP_GAP, moreW });
    for (const c of chips) {
      const e = this._entries[c.index];
      this._drawChip(ctx, c, labels[c.index], this._hover === e.key);
      this._hitZones.push({ x: c.x, y: c.y, w: c.w, h: c.h, key: e.key });
    }
    if (more) {
      const hover = this._hover === MORE_KEY;
      this._drawChip(ctx, more, `+${more.count}`, hover);
      this._hitZones.push({ x: more.x, y: more.y, w: more.w, h: more.h, key: MORE_KEY, first: more.first });
      if (hover) this._drawMoreTip(ctx, W, more, this._entries.slice(more.first));
    }
    ctx.restore();
  }

  // Chip — tło i ramka jak dawna belka (brutalist terminal — jak pływające panele), tekst ikona + nazwa.
  _drawChip(ctx, r, label, hover) {
    ctx.fillStyle = bgAlpha(hover ? 0.95 : 0.85);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = hover ? THEME.accent : (THEME.borderActive ?? THEME.accent);
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillStyle = hover ? THEME.accent : THEME.textSecondary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + CHIP_PAD_X, r.y + r.h / 2 + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  // Podpowiedź „+N” — lista niewidocznych paneli nad pasem, przy chipie „+N” (w granicach ekranu).
  _drawMoreTip(ctx, W, more, hidden) {
    const lines = hidden.map(e => `${e.icon ?? '▪'} ${e.label ?? ''}`);
    const w = Math.ceil(Math.max(0, ...lines.map(s => ctx.measureText(s).width))) + 2 * CHIP_PAD_X;
    const h = lines.length * TIP_LINE_H + 8;
    const x = Math.max(4, Math.min(W - w - 4, more.x));
    const y = more.y - 4 - h;
    ctx.fillStyle = bgAlpha(0.95);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.borderActive ?? THEME.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((s, i) => ctx.fillText(s, x + CHIP_PAD_X, y + 4 + i * TIP_LINE_H + TIP_LINE_H / 2));
    ctx.textBaseline = 'alphabetic';
  }

  _zoneAt(x, y) {
    return this._hitZones.find(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null;
  }

  /** Klik chipa → przywróć panel (onRestore); „+N” → pierwszy niewidoczny. Zwraca true gdy trafiono. */
  handleClick(x, y) {
    const z = this._zoneAt(x, y);
    if (!z) return false;
    const e = z.key === MORE_KEY ? this._entries[z.first] : this._entries.find(e => e.key === z.key);
    if (e?.onRestore) e.onRestore();
    return true;
  }

  isOver(x, y) { return !!this._zoneAt(x, y); }

  handleMouseMove(x, y) {
    const z = this._zoneAt(x, y);
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
