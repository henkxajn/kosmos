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
import { NAV_TILE_FILES, NAV_ICON_DIR, NAV_LABEL_BAND } from './NavDrawerLogic.js';

export class BottomNavBar {
  constructor() {
    this._hoverSlot = -1;     // indeks slotu pod kursorem (-1 = żaden)
    this._rect      = null;   // ostatnio policzony prostokąt paska
    this._imgCache  = new Map();   // primary → HTMLImageElement (po onload)
    this._imgFailed = new Set();
    this._loadStarted = false;
  }

  _markDirty() { const um = window.KOSMOS?.uiManager; if (um) um._dirty = true; }

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

    const slots = navSlotLayout(rect, NAV_GROUPS.length);
    for (const slot of slots) {
      const grp = NAV_GROUPS[slot.index];
      this._drawSlot(ctx, grp, slot.x, rect.y, slot.w, rect.h,
        activePrimary === grp.primary, this._hoverSlot === slot.index);
    }

    // ── Delikatna rama w kolorze motywu: GÓRA + BOKI (bez dołu — pasek siedzi na listwie
    //    dziennika) + cienkie linie MIĘDZY przyciskami. Rysowane NA WIERZCHU kafli (crisp). ──
    const a = hexToRgb(THEME.accent);
    ctx.lineWidth = 1;
    // Separatory między przyciskami (subtelniejsze niż rama)
    ctx.strokeStyle = `rgba(${a.r},${a.g},${a.b},0.35)`;
    ctx.beginPath();
    for (let i = 1; i < slots.length; i++) {
      const lx = Math.round(slots[i].x) + 0.5;
      ctx.moveTo(lx, rect.y + 4); ctx.lineTo(lx, rect.y + rect.h - 4);
    }
    ctx.stroke();
    // Rama: lewy bok → góra → prawy bok (bez dołu)
    ctx.strokeStyle = `rgba(${a.r},${a.g},${a.b},0.55)`;
    ctx.beginPath();
    ctx.moveTo(rect.x + 0.5, rect.y + rect.h);
    ctx.lineTo(rect.x + 0.5, rect.y + 0.5);
    ctx.lineTo(rect.x + rect.w - 0.5, rect.y + 0.5);
    ctx.lineTo(rect.x + rect.w - 0.5, rect.y + rect.h);
    ctx.stroke();
  }

  // Slot = gotowa ikona PNG w wielkości przycisku (center-crop do slotu) + dolny pasek etykiety.
  // Fallback emoji z CIV_TABS dopóki PNG się nie załaduje. Port z NavDrawer._drawTile (poziomo).
  _drawSlot(ctx, grp, x, y, w, h, isActive, isHover) {
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
      // ── Monochrom terminala: idle = szarość + przygaszenie (wtapia w ciemne UI);
      //    hover = jaśniejsza szarość; aktywny = PEŁNY KOLOR (jedyny kolorowy = sygnał). ──
      ctx.filter = isActive ? 'none'
        : isHover ? 'grayscale(1) brightness(0.95) contrast(0.9)'
        : 'grayscale(1) brightness(0.6) contrast(0.85)';
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
      ctx.filter = 'none';
      // Subtelny duotone-tint akcentu na nieaktywnych (nudge w stronę palety motywu)
      if (!isActive) {
        const a = hexToRgb(THEME.accent);
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},${isHover ? 0.10 : 0.16})`;
        ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // Fallback: emoji grupy wyśrodkowane
      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${Math.round(h * 0.42)}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tab?.icon ?? '?', x + w / 2, y + h / 2 - NAV_LABEL_BAND / 2);
    }

    // Dolny pasek etykiety (gradient-backing dla czytelności)
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y + h - NAV_LABEL_BAND, w, NAV_LABEL_BAND);
    ctx.fillStyle = isActive ? THEME.accent : THEME.textPrimary;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t(tab?.labelKey ?? grp.primary), x + w / 2, y + h - NAV_LABEL_BAND / 2);

    // Hover rozjaśnienie
    if (isHover && !isActive) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, y, w, h);
    }
    // Aktywny → dolny pasek akcentu (sygnał wyboru). Ramę całego paska i separatory
    // między przyciskami rysuje draw() — kafle nie mają już własnych pełnych ramek.
    if (isActive) {
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(x, y + h - 3, w, 3);
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
