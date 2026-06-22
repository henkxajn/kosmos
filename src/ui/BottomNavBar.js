// BottomNavBar — STAŁY poziomy pasek nawigacji u dołu ekranu (UI v3).
//
// Zastępuje lewy wysuwany NavDrawer: 7 grup (NAV_GROUPS) jako stałe sloty z gotową ikoną PNG
// (assets/icons/nav/{primary}_symbol.png — te same co NavDrawer) + etykietą. Dobity w dół do
// listwy schowanego dziennika (BOTTOM_LOG_TRIG_H). Klik slotu → openPanel(primary) (toggle: klik
// aktywnej grupy zamyka overlay). Rodzeństwo grupy (>1 członek) pokazuje istniejący pas subnav
// pod TopBarem. Non-exclusive: trzymany bezpośrednio przez UIManager, rysowany PO overlayManager
// (na wierzchu canvasowych overlayów), klik routowany PRZED overlayManager. Substrat Canvas 2D.
//
// Brak animacji (pasek stały) → brak isAnimating. Czysta geometria/layout/hit → BottomNavBarLogic.
// Ładowanie PNG (leniwe, raz; fallback emoji) — port z NavDrawer._ensureIcons/_drawTile.

import { THEME, bgAlpha, hexToRgb } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';
import { NAV_GROUPS, CIV_TABS, getNavGroup } from './CivPanelDrawer.js';
import { bottomNavBarRect, navSlotLayout, hitNavSlot, pointInRect } from './BottomNavBarLogic.js';
import { NAV_TILE_FILES, NAV_ICON_DIR } from './NavDrawerLogic.js';

export class BottomNavBar {
  constructor() {
    this._hoverSlot = -1;     // indeks slotu pod kursorem (-1 = żaden)
    this._rect      = null;   // ostatnio policzony prostokąt paska
    this._imgCache  = new Map();   // primary → HTMLImageElement (po onload)
    this._imgFailed = new Set();
    this._loadStarted = false;
    this._hoverP    = [];     // per-slot progres hovera 0..1 (animacja 150ms)
    this._lastMs    = 0;      // znacznik czasu ostatniej klatki (dt animacji)
    this._anim      = false;  // czy któryś slot jest w trakcie animacji
  }

  _markDirty() { const um = window.KOSMOS?.uiManager; if (um) um._dirty = true; }
  isAnimating() { return this._anim; }   // UIManager kontynuuje redraw póki hover animuje

  _tabFor(primary) { return CIV_TABS.find(tb => tb.id === primary) ?? null; }

  // ── Ładowanie grafik PNG (leniwe, raz; wzór NavDrawer/ResourceIcons) ──────
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

  // ── Rysowanie ───────────────────────────────────────────────────────────
  draw(ctx, W, H) {
    this._ensureIcons();
    const rect = bottomNavBarRect(W, H);
    this._rect = rect;

    // Tło paska
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const activeGrp = getNavGroup(window.KOSMOS?.overlayManager?.active);
    const activePrimary = activeGrp?.primary ?? null;

    // Animacja hovera (150ms): progres każdego slotu pełznie do 1 (hover) lub 0 (poza).
    const now = Date.now();
    const dt = this._lastMs ? Math.min(now - this._lastMs, 100) : 16;
    this._lastMs = now;
    const step = dt / 150;
    this._anim = false;

    const slots = navSlotLayout(rect, NAV_GROUPS.length);
    for (const slot of slots) {
      const i = slot.index;
      const target = this._hoverSlot === i ? 1 : 0;
      let p = this._hoverP[i] ?? 0;
      if (p < target)      p = Math.min(target, p + step);
      else if (p > target) p = Math.max(target, p - step);
      this._hoverP[i] = p;
      if (p > 0.001 && p < 0.999) this._anim = true;
      const grp = NAV_GROUPS[i];
      this._drawSlot(ctx, grp, slot.x, rect.y, slot.w, rect.h, activePrimary === grp.primary, p);
    }

    // ── Delikatna rama w kolorze motywu: GÓRA + BOKI (bez dołu — pasek siedzi na listwie
    //    dziennika) + cienkie linie MIĘDZY przyciskami. Rysowane NA WIERZCHU kafli (crisp). ──
    const a = hexToRgb(THEME.accent);
    ctx.lineWidth = 1;
    // Separatory między przyciskami — cienka linia 1px THEME.accent @0.3 na pełną wysokość paska
    ctx.strokeStyle = `rgba(${a.r},${a.g},${a.b},0.3)`;
    ctx.beginPath();
    for (let i = 1; i < slots.length; i++) {
      const lx = Math.round(slots[i].x) + 0.5;
      ctx.moveTo(lx, rect.y); ctx.lineTo(lx, rect.y + rect.h);
    }
    ctx.stroke();
    // Boki ramy (lewy + prawy, bez dołu) — cienkie 1px
    ctx.strokeStyle = `rgba(${a.r},${a.g},${a.b},0.55)`;
    ctx.beginPath();
    ctx.moveTo(rect.x + 0.5, rect.y + rect.h);
    ctx.lineTo(rect.x + 0.5, rect.y + 0.5);
    ctx.moveTo(rect.x + rect.w - 0.5, rect.y + rect.h);
    ctx.lineTo(rect.x + rect.w - 0.5, rect.y + 0.5);
    ctx.stroke();
    // GÓRNA ramka — pogrubiona (pasek na całej szerokości)
    const TOP_BORDER_H = 2.4;
    ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},0.55)`;
    ctx.fillRect(rect.x, rect.y, rect.w, TOP_BORDER_H);
  }

  // Slot = gotowa ikona PNG w wielkości przycisku (center-crop do slotu) + dolny pasek etykiety.
  // Fallback emoji z CIV_TABS dopóki PNG się nie załaduje. Port z NavDrawer._drawTile (poziomo).
  // p = progres hovera 0..1 (animowany). Jasność miniaturki przez globalAlpha 0.7→1.0,
  // górna linia akcentu fade-in z p (zawsze widoczna na aktywnym). Aktywny = pełny kolor.
  _drawSlot(ctx, grp, x, y, w, h, isActive, p) {
    const tab = this._tabFor(grp.primary);

    // Tło kafla (na wypadek braku grafiki / alfy w PNG)
    ctx.fillStyle = bgAlpha(0.6);
    ctx.fillRect(x, y, w, h);

    const img = this._imgCache.get(grp.primary);
    if (img && img.width > 0 && img.height > 0) {
      // center-crop źródła do proporcji slotu (gdy proporcje równe = brak cropu)
      const srcAR = img.width / img.height, dstAR = w / h;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcAR > dstAR)      { sw = img.height * dstAR; sx = (img.width - sw) / 2; }
      else if (srcAR < dstAR) { sh = img.width / dstAR;  sy = (img.height - sh) / 2; }
      // Monochrom terminala (idle/hover szarość; aktywny pełny kolor) + ROZJAŚNIENIE przez
      // globalAlpha 0.7→1.0 wraz z p (hover) — aktywny zawsze 1.0.
      ctx.filter = isActive ? 'none' : 'grayscale(1) contrast(0.85)';
      ctx.globalAlpha = isActive ? 1 : (0.7 + 0.3 * p);
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
      // Subtelny duotone-tint akcentu na nieaktywnych (słabnie przy hoverze)
      if (!isActive) {
        const a = hexToRgb(THEME.accent);
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},${0.16 - 0.06 * p})`;
        ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // Fallback: emoji grupy wyśrodkowane (lekko wyżej — miejsce na etykietę u dołu)
      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${Math.round(h * 0.42)}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tab?.icon ?? '?', x + w / 2, y + h / 2 - 5);
    }

    // Etykieta BEZ ciemnego tła — subtelny cień daje czytelność na zróżnicowanym obrazie.
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = isActive ? THEME.accent : THEME.textPrimary;
    ctx.fillText(t(tab?.labelKey ?? grp.primary), x + w / 2, y + h - 8);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // ── GÓRNA linia akcentu 2px: zawsze na aktywnym, fade-in (p) na hover ──
    const lineOp = Math.max(isActive ? 1 : 0, p);
    if (lineOp > 0.001) {
      const a = hexToRgb(THEME.accent);
      ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},${lineOp})`;
      ctx.fillRect(x, y, w, 2);
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── Hit / zdarzenia ─────────────────────────────────────────────────────
  handleMouseMove(x, y) {
    if (!this._rect) return;
    const idx = hitNavSlot(this._rect, NAV_GROUPS.length, x, y);
    if (idx !== this._hoverSlot) { this._hoverSlot = idx; this._markDirty(); }
  }

  handleClick(x, y) {
    if (!this._rect) return false;
    const idx = hitNavSlot(this._rect, NAV_GROUPS.length, x, y);
    if (idx < 0) {
      // Klik w pasek poza slotem — pochłoń (nie spadaj na overlay/3D).
      return pointInRect(this._rect, x, y);
    }
    const grp = NAV_GROUPS[idx];
    const om = window.KOSMOS?.overlayManager;
    if (om && grp) {
      // Toggle TYLKO gdy otwarty jest dokładnie primary grupy → zamknij. Gdy otwarte
      // rodzeństwo (sibling) lub inny overlay → otwórz primary (przełącz).
      if (om.active === grp.primary) om.closeActive();
      else om.openPanel(grp.primary);
      this._markDirty();
    }
    return true;
  }

  // Blokada kamery — punkt nad paskiem.
  isOver(x, y) { return pointInRect(this._rect, x, y); }
}
