// NavDrawer — lewy wysuwany pasek nawigacji (redesign UI v1, Slice A)
//
// Zastępuje poziomy pasek nav (14 ikon emoji) w TopBarze 7 dużymi kaflami grup
// (NAV_GROUPS). Wzorce: slide jak BottomContext (_slideProgress + ANIM_SPEED),
// hit-zony jak StationPanel (tło dodawane NA KOŃCU = priorytet kafli). Non-exclusive:
// trzymany bezpośrednio przez UIManager, rysowany PO overlayManager (na wierzchu
// overlay'i), klik routowany PRZED overlayManager. Substrat Canvas 2D (#ui-canvas);
// zdarzenia z window → UIManager → tu.
//
// Grafiki: assets/icons/nav/{primary}.png (fotorealistyczne 1280×256, 5:1), center-crop
// do kafla. Fallback: emoji z CIV_TABS dopóki PNG się nie załaduje (wzór ResourceIcons).
// Czysta logika (geometria/layout/slide/scroll/hit) → NavDrawerLogic.js (headless smoke).

import { THEME, bgAlpha, hexToRgb } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';
import { NAV_GROUPS, CIV_TABS, getNavGroup } from './CivPanelDrawer.js';
import {
  NAV_TRIGGER_W, NAV_HIDE_DELAY, NAV_PANEL_PAD, NAV_HEADER_H, NAV_LABEL_BAND,
  NAV_TILE_FILES, NAV_ICON_DIR,
  navPanelWidth, navPanelVBounds, stepSlide, navIsAnimating, clampScroll,
  navTileLayout, findZone, pointInRect,
} from './NavDrawerLogic.js';

export class NavDrawer {
  constructor() {
    this._slideProgress = 0;       // 0=schowany, 1=w pełni wysunięty
    this._hovered       = false;   // kursor nad triggerem lub panelem
    this._hideAt        = 0;       // ms timestamp zaplanowanego schowania (0=brak)
    this._scrollY       = 0;
    this._maxScroll     = 0;
    this._hitZones      = [];      // [{x,y,w,h,type,id}]
    this._hoverTile     = null;    // primary id kafla pod kursorem
    this._panelRect     = null;    // {x,y,w,h} ostatnio narysowanego panelu
    this._imgCache      = new Map(); // primary → HTMLImageElement (po onload)
    this._imgFailed     = new Set();
    this._loadStarted   = false;
  }

  // ── Ładowanie grafik (leniwe, raz; wzór ResourceIcons) ──────────────────
  _ensureIcons() {
    if (this._loadStarted) return;
    this._loadStarted = true;
    for (const grp of NAV_GROUPS) {
      const id = grp.primary;
      const file = NAV_TILE_FILES[id];
      if (!file) continue;
      try {
        const img = new Image();
        img.onload  = () => { this._imgCache.set(id, img); this._markDirty(); };
        img.onerror = () => { this._imgFailed.add(id); };  // zostaje fallback emoji
        img.src = NAV_ICON_DIR + file;
      } catch (_) { /* brak Image (headless) — fallback emoji */ }
    }
  }

  _markDirty() {
    const um = window.KOSMOS?.uiManager;
    if (um) um._dirty = true;
  }

  isAnimating() { return navIsAnimating(this._slideProgress, this._hideAt); }
  isOpen()      { return this._slideProgress > 0.001; }

  // ── Rysowanie ───────────────────────────────────────────────────────────
  draw(ctx, W, H) {
    this._ensureIcons();

    // Timer schowania (po opuszczeniu hovera, opóźnienie NAV_HIDE_DELAY)
    if (this._hideAt > 0 && Date.now() >= this._hideAt) { this._hideAt = 0; this._hovered = false; }

    // Krok slide w stronę stanu hover
    this._slideProgress = stepSlide(this._slideProgress, this._hovered ? 1 : 0);

    const panelW = navPanelWidth(W);
    const vb = navPanelVBounds(H);
    const top = vb.top, panelH = vb.height;

    this._hitZones = [];

    // ── Trigger (pasek lewej krawędzi, zawsze widoczny) ──
    const a = hexToRgb(THEME.accent);
    const trigActive = this._hovered || this._slideProgress > 0.001;
    ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},${trigActive ? 0.85 : 0.4})`;
    ctx.fillRect(0, top, NAV_TRIGGER_W, panelH);
    this._addHit(0, top, NAV_TRIGGER_W + 2, panelH, 'trigger', null);

    if (this._slideProgress <= 0.001) { this._panelRect = null; return; }

    // ── Panel (wysuwa się z lewej: px od -panelW do 0) ──
    const px = Math.round(-panelW + panelW * this._slideProgress);
    const py = top;
    this._panelRect = { x: px, y: py, w: panelW, h: panelH };

    ctx.save();

    // Tło panelu (glass) + prawa krawędź akcentu
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(px, py, panelW, panelH);
    ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},0.5)`;
    ctx.fillRect(px + panelW - 2, py, 2, panelH);

    // Nagłówek
    ctx.fillStyle = THEME.accent;
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('navDrawer.title'), px + NAV_PANEL_PAD, py + NAV_HEADER_H / 2);

    // Layout kafli + clamp scrolla
    const lay = navTileLayout({ panelTop: py, panelW, panelH, count: NAV_GROUPS.length, scrollY: this._scrollY });
    this._maxScroll = lay.maxScroll;
    this._scrollY = lay.scrollY;

    const activeGrp = getNavGroup(window.KOSMOS?.overlayManager?.active);
    const activePrimary = activeGrp?.primary ?? null;

    // Clip listy (kafle nie wychodzą poza pas)
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, lay.listTop, panelW, lay.listH);
    ctx.clip();

    for (const row of lay.rows) {
      const grp = NAV_GROUPS[row.index];
      const tx = px + NAV_PANEL_PAD;
      if (row.visible) {
        this._drawTile(ctx, grp.primary, tx, row.y, lay.tileW, lay.tileH, activePrimary === grp.primary);
        this._addHit(tx, row.y, lay.tileW, lay.tileH, 'tile', grp.primary);
      }
    }
    ctx.restore(); // clip

    // Tło-absorber NA KOŃCU (priorytet kafli — wzór StationPanel/S4-1 gotcha)
    this._addHit(px, py, panelW, panelH, 'bg', null);

    ctx.restore();
  }

  _drawTile(ctx, id, x, y, w, h, isActive) {
    // Tło kafla (na wypadek braku grafiki / alfy w PNG)
    ctx.fillStyle = bgAlpha(0.6);
    ctx.fillRect(x, y, w, h);

    const img = this._imgCache.get(id);
    if (img && img.width > 0 && img.height > 0) {
      // center-crop źródła do proporcji kafla (gdy proporcje równe = brak cropu)
      const srcAR = img.width / img.height, dstAR = w / h;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcAR > dstAR)      { sw = img.height * dstAR; sx = (img.width - sw) / 2; }
      else if (srcAR < dstAR) { sh = img.width / dstAR;  sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    } else {
      // Fallback: emoji grupy (z CIV_TABS) wyśrodkowane
      const tab = CIV_TABS.find(tb => tb.id === id);
      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${Math.round(h * 0.5)}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tab?.icon ?? '?', x + w / 2, y + h / 2);
    }

    // Dolny pasek etykiety (gradient-backing dla czytelności)
    const tab = CIV_TABS.find(tb => tb.id === id);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y + h - NAV_LABEL_BAND, w, NAV_LABEL_BAND);
    ctx.fillStyle = isActive ? THEME.accent : THEME.textPrimary;
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(t(tab?.labelKey ?? id), x + 8, y + h - NAV_LABEL_BAND / 2);

    // Hover rozjaśnienie
    if (this._hoverTile === id) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, y, w, h);
    }
    // Aktywny → obramowanie accent, inaczej cienka ramka
    if (isActive) {
      ctx.strokeStyle = THEME.accent; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    } else {
      ctx.strokeStyle = THEME.border; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── Hit / zdarzenia ─────────────────────────────────────────────────────
  _addHit(x, y, w, h, type, id) { this._hitZones.push({ x, y, w, h, type, id }); }

  handleMouseMove(x, y) {
    const z = findZone(this._hitZones, x, y);
    const over = (z?.type === 'trigger') || pointInRect(this._panelRect, x, y);

    if (over) {
      if (!this._hovered) this._markDirty();
      this._hovered = true;
      this._hideAt = 0;
    } else if (this._hovered && this._hideAt === 0) {
      this._hideAt = Date.now() + NAV_HIDE_DELAY;   // zaplanuj schowanie
    }

    const newHover = (z?.type === 'tile') ? z.id : null;
    if (newHover !== this._hoverTile) { this._hoverTile = newHover; this._markDirty(); }
  }

  handleClick(x, y) {
    const z = findZone(this._hitZones, x, y);
    if (!z) return false;

    if (z.type === 'trigger') {
      // Klik triggera = wymuś otwarcie (hover steruje płynnie; klik = pewne).
      this._hovered = true; this._hideAt = 0; this._markDirty();
      return true;
    }
    if (z.type === 'tile') {
      const om = window.KOSMOS?.overlayManager;
      // openPanel zamyka poprzedni overlay (też DOM Tech/Observatory — edge-shim w B+C).
      if (om && z.id) om.openPanel(z.id);
      this._hovered = false; this._hideAt = 0; this._slideProgress = 0;
      this._scrollY = 0; this._hoverTile = null;
      this._markDirty();
      return true;
    }
    if (z.type === 'bg') return true; // absorbuj klik w panel (nie spadaj na overlay/3D)
    return false;
  }

  handleWheel(x, y, deltaY) {
    if (this._slideProgress <= 0.001 || !pointInRect(this._panelRect, x, y)) return false;
    const prev = this._scrollY;
    this._scrollY = clampScroll(this._scrollY + deltaY, this._maxScroll);
    if (this._scrollY !== prev) this._markDirty();
    return true; // konsumuj scroll nad panelem
  }
}
