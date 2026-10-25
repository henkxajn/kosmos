// OutlinerColumn — ARKUSZ UI, U3-2 (UI_PLAN §4.4): wspólny szkielet OBU outlinerów nad mapą 3D (D-UI-1) — lewego
// (układy i ciała, `LeftOutliner`, U2) i prawego (statki gracza, `Outliner`, U3). Wydzielony z `LeftOutliner`, żeby prawy
// nie był jego kopią: geometria kolumny, widoczność, tło półprzezroczyste z cieniem tekstu, nagłówek z klawiszem,
// przewijana lista wierszy z clipem, pasek przewijania, stan zwinięcia układów, prostokąty trafień, kółko, podpowiedź.
//
//   • Geometria (§7.17; U3): kolumna 150 px przy SWOJEJ krawędzi (lewy — x 0, prawy — x W − 150), od dolnej krawędzi
//     górnej belki w dół: PRAWA — do górnej krawędzi PASA DOLNEGO (`outlinerBottomInset`), LEWA — do górnej krawędzi
//     paska nawigacji (`leftColumnBottomInset`; ARKUSZ UI U4-3, decyzja (a) — pas na całą szerokość zaczyna się przy
//     jej prawej krawędzi). Krawędź od strony mapy — linia.
//   • Widoczność (decyzja 4): tylko nad mapą — ukryta przy otwartym overlayu pełnoekranowym, przy rozwiniętym Doku
//     taktycznym i przy podglądzie globusa; poza trybem cywilizacji nic. `visible` — stan użytkownika (klawisze §7.16,
//     sesja). Tło `bgAlpha(0.6)` + cień tekstu — strojenie na bramce (`KOSMOS.leftOutliner` / `KOSMOS.rightOutliner`).
//   • Zwijanie (D-UI-4, §7.5): jawny stan tylko tam, gdzie różni się od domyślnego (rozwinięty = bieżący układ).
//   • Podklasa daje model listy (`_model` → `{ title, keyHint, items, result }`, wiersz `{ kind, key, h }`), rysowanie
//     wiersza (`_drawItem`), obsługę trafienia (`_onHit`), klucz najechania (`_hoverKeyOf`) i podpowiedź (`_hoverTip`).
//   • Podpowiedź: `{ text }` — jedna linia (jak w U2); `{ lines }` — wiele linii (`{ text, color?, header? }` albo
//     `{ segments: [{ label, color }] }`), rysowana po stronie mapy, gdy przy kursorze brakuje miejsca.
//
// Importuje się pod node (keepery `left_outliner_smoke`, `right_outliner_smoke` — prawdziwy `draw` / `hitTest` na
// atrapie ctx).

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }          from '../config/LayoutConfig.js';
import EventBus            from '../core/EventBus.js';
import { t }               from '../i18n/i18n.js';
import { isSystemExpanded } from './SystemTreeLogic.js';
import { getMapInsets, outlinerBottomInset, leftColumnBottomInset } from './MapInsets.js';

export const OUTLINER_COLUMN_W     = COSMIC.OUTLINER_W;   // 150 px — §7.17 (oba outlinery po 150 px)
export const OUTLINER_BG_ALPHA     = 0.6;                 // §7.17 — strojenie na bramce
export const OUTLINER_TEXT_SHADOW  = 3;                   // px rozmycia cienia tekstu — strojenie na bramce

export const OUTLINER_HDR_H = 18;   // nagłówek kolumny (stały — poza przewijaniem)
export const OUTLINER_PAD   = 5;

/**
 * Decyzja 4 (UI_PLAN §5): outliner tylko nad mapą — wspólna reguła obu kolumn.
 * @returns {boolean}
 */
export function outlinerShown({ civMode = false, globeOpen = false, userVisible = true, overlayOpen = false, dockExpanded = false } = {}) {
  return civMode === true && !globeOpen && userVisible !== false && !overlayOpen && !dockExpanded;
}

export class OutlinerColumn {
  /** @param {'left'|'right'} side */
  constructor(side = 'left') {
    this.side           = side === 'right' ? 'right' : 'left';
    this.visible        = true;                        // stan użytkownika (sesja)
    this.bgAlpha        = OUTLINER_BG_ALPHA;
    this.textShadowBlur = OUTLINER_TEXT_SHADOW;
    this._expanded      = new Map();                   // systemId → bool (jawny stan zwinięcia; sesja, nie zapis)
    this._scrollY       = 0;
    this._maxScroll     = 0;
    this._clickTargets  = [];
    this._hoverKey      = null;                        // `typ:id` najechanego wiersza
    this._revealKey     = null;                        // klucz wiersza do przewinięcia w widok (zaznaczenie z mapy)
    this._rect          = null;                        // ostatnio narysowana kolumna {x,y,w,h}
    // REFORMA ZAKŁADEK T3 — układ listy z ostatniej klatki: okno listy (`contentTop`, `viewH`), przewinięcie i położenie
    // wierszy w treści (klucz → { y, h }) + wynik modelu; null, gdy kolumna ukryta. Czyta go panel statku przy wierszu
    // prawego outlinera (`ShipPanelAnchorLogic.resolveRowAnchor`) w tej samej klatce (`UIManager._draw`: outliner przed panelem).
    this._layout        = null;
    this._tip           = null;                        // podpowiedź najechania { text | lines, x, y }
  }

  _K() { return typeof window !== 'undefined' ? window.KOSMOS : null; }
  _markDirty() { const um = this._K()?.uiManager; if (um) um._dirty = true; }
  _active(K) { return K?.activeSystemId ?? K?.starSystemManager?.activeSystemId ?? 'sys_home'; }
  _env(K) { return { K, emit: (n, p) => EventBus.emit(n, p) }; }

  // ── Widoczność i rezerwa (decyzja 4, `MapInsets`) ──────────────────────────────────────────────────────────────
  isShown(K = this._K()) {
    return outlinerShown({
      civMode:      !!K?.civMode,
      globeOpen:    !!K?.planetGlobeOpen,
      userVisible:  this.visible !== false,
      overlayOpen:  !!K?.uiManager?.overlayManager?.isAnyOpen?.(),
      dockExpanded: !!K?.tacticalDock?.isExpanded?.(),
    });
  }

  /** Szerokość zajmowana nad mapą — wcięcie `left` / `right` w `MapInsets` (0 gdy ukryta). */
  getReservedWidth(K = this._K()) { return this.isShown(K) ? OUTLINER_COLUMN_W : 0; }

  _geom(W, H, K) {
    const ins = getMapInsets(K);
    // U4-3 (decyzja (a)): lewa kolumna schodzi do paska nawigacji (nad Dokiem taktycznym, gdy widoczny), prawa — nad pas.
    const bottom = this.side === 'left'
      ? leftColumnBottomInset({ civMode: !!K?.civMode, dockH: K?.tacticalDock?.getReservedHeight?.() ?? 0 })
      : outlinerBottomInset(ins, !!K?.civMode);
    return {
      x: this.side === 'right' ? W - OUTLINER_COLUMN_W : 0,
      y: ins.top,
      w: OUTLINER_COLUMN_W,
      h: Math.max(0, H - bottom - ins.top),
    };
  }

  // ── Zwijanie (D-UI-4, §7.5) ──────────────────────────────────────────────────────────────────────────────────
  isExpanded(systemId, activeSystemId = this._active(this._K())) {
    return isSystemExpanded(systemId, activeSystemId, this._expanded);
  }

  toggleExpanded(systemId, activeSystemId = this._active(this._K())) {
    this._setExpanded(systemId, !this.isExpanded(systemId, activeSystemId), activeSystemId);
  }

  // Jawny stan zwinięcia trzymany tylko wtedy, gdy różni się od domyślnego (rozwinięty = bieżący układ): ▸ i ▾ na innym
  // układzie nie zostawiają śladu (po przejściu do niego jest rozwinięty), zwinięcie bieżącego układu zostaje.
  _setExpanded(systemId, value, activeSystemId = this._active(this._K())) {
    if (value === (systemId === activeSystemId)) this._expanded.delete(systemId);
    else this._expanded.set(systemId, value);
  }

  // ── Rysowanie ─────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * Szablon klatki: tło, nagłówek, lista (clip, przewijanie, przewinięcie do `_revealKey`), pasek przewijania.
   * @returns {*} `model.result` z tej klatki (null — kolumna ukryta)
   */
  draw(ctx, W, H, input = {}) {
    const K = input.K ?? this._K();
    this._clickTargets = [];
    if (!this.isShown(K)) { this._rect = null; this._layout = null; return null; }
    const g = this._geom(W, H, K);
    this._rect = g;
    const model = this._model(K, input, g);

    ctx.save();
    this._drawFrame(ctx, g, model.title, model.keyHint);

    // Układ treści (współrzędne treści, przed przewinięciem).
    let cy = 0;
    for (const it of model.items) { it.y = cy; cy += it.h; }
    const contentTop = g.y + OUTLINER_HDR_H + 2;
    const viewH = Math.max(0, g.y + g.h - contentTop);
    this._maxScroll = Math.max(0, cy - viewH);
    // §7.12 — przewinięcie do wiersza zaznaczonego obiektu (raz, po zaznaczeniu).
    if (this._revealKey) {
      const it = model.items.find((i) => i.key === this._revealKey);
      if (it) {
        if (it.y < this._scrollY) this._scrollY = it.y - 2;
        else if (it.y + it.h > this._scrollY + viewH) this._scrollY = it.y + it.h - viewH + 2;
      }
      this._revealKey = null;
    }
    this._scrollY = Math.max(0, Math.min(this._maxScroll, this._scrollY));
    this._layout = {
      contentTop, viewH, scrollY: this._scrollY,
      rows: new Map(model.items.map((it) => [it.key, { y: it.y, h: it.h }])),
      result: model.result ?? null,
    };

    ctx.save();
    ctx.beginPath(); ctx.rect(g.x, contentTop, g.w, viewH); ctx.clip();
    for (const it of model.items) {
      const iy = contentTop + it.y - this._scrollY;
      if (iy + it.h < contentTop || iy > contentTop + viewH) continue;   // poza widokiem — bez rysowania i bez trafień
      this._drawItem(ctx, g, iy, it, model);
    }
    ctx.restore();
    const contentH = cy;

    // Pasek przewijania (po stronie mapy kolumny prawej — przy jej lewej krawędzi; lewej — przy prawej).
    if (this._maxScroll > 0 && viewH > 0) {
      const thumbH = Math.max(20, viewH * (viewH / (contentH || 1)));
      const thumbY = contentTop + (viewH - thumbH) * (this._scrollY / this._maxScroll);
      ctx.fillStyle = THEME.accentMed ?? 'rgba(0,255,180,0.35)';
      ctx.fillRect(this.side === 'right' ? g.x + 1 : g.x + g.w - 3, thumbY, 2, thumbH);
    }
    ctx.restore();
    return model.result ?? null;
  }

  // Tło (półprzezroczyste — mapa prześwituje), krawędź od strony mapy, nagłówek z tytułem i klawiszem.
  _drawFrame(ctx, g, title, keyHint) {
    ctx.fillStyle = bgAlpha(this.bgAlpha);
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    const ex = this.side === 'right' ? g.x + 0.5 : g.x + g.w - 0.5;
    ctx.beginPath(); ctx.moveTo(ex, g.y); ctx.lineTo(ex, g.y + g.h); ctx.stroke();

    ctx.fillStyle = THEME.accentDim ?? 'rgba(0,255,180,0.07)';
    ctx.fillRect(g.x, g.y, g.w, OUTLINER_HDR_H);
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(g.x, g.y + OUTLINER_HDR_H + 0.5); ctx.lineTo(g.x + g.w, g.y + OUTLINER_HDR_H + 0.5); ctx.stroke();
    ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    ctx.fillText(String(title ?? '').toUpperCase(), g.x + OUTLINER_PAD, g.y + OUTLINER_HDR_H / 2 + 3);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    // Klawisz zwijania przy nagłówku (pełna podpowiedź po najechaniu — `leftOutliner.keyHint`).
    if (keyHint) {
      ctx.textAlign = 'right';
      ctx.fillText(keyHint, g.x + g.w - OUTLINER_PAD, g.y + OUTLINER_HDR_H / 2 + 3);
      ctx.textAlign = 'left';
    }
    this._clickTargets.push({ type: 'header', x: g.x, y: g.y, w: g.w, h: OUTLINER_HDR_H });
  }

  _shadow(ctx, on) {
    if (on) { ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = this.textShadowBlur; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1; }
    else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  }

  _fit(ctx, text, maxW) {
    text = String(text ?? '');
    if (maxW <= 0) return '';
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  /** Podpowiedź najechania — rysowana na wierzchu, z tooltipami innych powierzchni. */
  drawTooltip(ctx, W, H, K = this._K()) {
    const tip = this._tip;
    if (!tip || !this.isShown(K)) return;
    if (Array.isArray(tip.lines) && tip.lines.length) { this._drawTooltipLines(ctx, W, H, tip); return; }
    if (!tip.text) return;
    ctx.save();
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const tw = ctx.measureText(tip.text).width + 12, th = 18;
    let tx = tip.x + 12, ty = tip.y + 14;
    if (tx + tw > W - 4) tx = W - tw - 4;
    if (ty + th > H - 4) ty = tip.y - th - 6;
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = THEME.borderActive ?? THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    ctx.fillStyle = THEME.textPrimary;
    ctx.textAlign = 'left';
    ctx.fillText(tip.text, tx + 6, ty + 12);
    ctx.restore();
  }

  // Podpowiedź wielowierszowa (wzór podpowiedzi kolonii prawego Outlinera sprzed U3): nagłówek, linie, linie
  // wielokolorowe (segmenty). Przy kursorze, a gdy brak miejsca — po stronie mapy.
  _drawTooltipLines(ctx, W, H, tip) {
    const lines = tip.lines;
    const lineH = 13, padX = 8, padY = 6;
    const smallFont  = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    const headerFont = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.save();
    let maxW = 0;
    for (const ln of lines) {
      if (ln.segments) {
        ctx.font = smallFont;
        let sw = 0;
        for (const seg of ln.segments) sw += ctx.measureText(seg.label).width + 6;
        maxW = Math.max(maxW, sw);
      } else {
        ctx.font = ln.header ? headerFont : smallFont;
        maxW = Math.max(maxW, ctx.measureText(String(ln.text ?? '')).width);
      }
    }
    const tw = Math.min(480, maxW + padX * 2 + 8);
    const th = padY * 2 + lines.length * lineH + 2;
    let tx = tip.x + 12;
    if (tx + tw > W - 4) tx = Math.max(4, tip.x - tw - 8);
    let ty = tip.y - 10;
    if (ty + th > H - 4) ty = H - th - 4;
    if (ty < 4) ty = 4;
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = THEME.borderActive ?? THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    ctx.textAlign = 'left';
    let ly = ty + padY;
    for (const ln of lines) {
      if (ln.segments) {
        ctx.font = smallFont;
        let sx = tx + padX;
        for (const seg of ln.segments) {
          ctx.fillStyle = seg.color ?? THEME.textSecondary;
          ctx.fillText(seg.label, sx, ly + 10);
          sx += ctx.measureText(seg.label).width + 6;
        }
      } else {
        ctx.font = ln.header ? headerFont : smallFont;
        ctx.fillStyle = ln.header ? THEME.textPrimary : (ln.color ?? THEME.textSecondary);
        ctx.fillText(String(ln.text ?? ''), tx + padX, ly + 10);
      }
      ly += lineH;
    }
    ctx.restore();
  }

  // ── Wejście ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** Czy punkt (px logiczne) jest nad kolumną — blokada kamery (`UIManager.isOverUI`). */
  isOver(x, y, W, H, K = this._K()) {
    if (!this.isShown(K)) return false;
    const g = this._geom(W, H, K);
    return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
  }

  _targetAt(x, y) {
    return this._clickTargets.find((z) => z.type !== 'header' && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null;
  }

  /** Klik (px logiczne). `true` = pochłonięty (każdy klik w kolumnę). */
  hitTest(x, y, W, H, K = this._K()) {
    if (!this.isOver(x, y, W, H, K)) return false;
    const z = this._targetAt(x, y);
    if (!z) return true;
    this._onHit?.(z, x, y, K);
    return true;
  }

  handleWheel(x, y, delta, W, H, K = this._K()) {
    if (!this.isOver(x, y, W, H, K)) return false;
    if (this._maxScroll <= 0) return false;   // nic do przewijania — kamera i tak zablokowana przez `isOverUI`
    this._scrollY = Math.max(0, Math.min(this._maxScroll, this._scrollY + delta));
    return true;
  }

  updateHover(x, y, W, H, K = this._K()) {
    const prev = this._hoverKey, prevTip = this._tipSig(this._tip);
    this._tip = null;
    if (!this.isOver(x, y, W, H, K)) this._hoverKey = null;
    else {
      const z = this._targetAt(x, y);
      this._hoverKey = z ? this._hoverKeyOf(z) : null;
      const hd = this._clickTargets.find((h) => h.type === 'header' && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
      if (hd) this._tip = { text: t('leftOutliner.keyHint'), x, y };
      else if (z) this._tip = this._hoverTip?.(z, x, y, K) ?? null;
    }
    if (prev !== this._hoverKey || prevTip !== this._tipSig(this._tip)) this._markDirty();
  }

  _tipSig(tip) {
    if (!tip) return null;
    if (tip.text) return tip.text;
    return Array.isArray(tip.lines) ? tip.lines.map((l) => l.text ?? (l.segments ?? []).map((s) => s.label).join(' ')).join('\n') : null;
  }

  /** Klucz najechania wiersza (`typ:id`) — podklasa nadpisuje. */
  _hoverKeyOf(z) { return `${z.type}:${z.id ?? ''}`; }
}
