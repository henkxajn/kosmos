// BottomControlBar — mały pasek sterowania u DOŁU (UI v3): dzwonek + MENU + blok czasu
// (play / 6 prędkości / data). Przeniesione z górnego TopBaru. Pasek osobny, WYRÓWNANY DO
// PRAWEJ, tuż NAD dolnym paskiem nawigacji (BottomNavBar), między nawigacją a sceną 3D.
// Elementy ~25% mniejsze niż w TopBarze. Non-exclusive: rysowany PO overlayManager (na
// wierzchu, by sterowanie czasem było zawsze dostępne), klik routowany PRZED overlayManager.
//
// Czas: emituje EventBus (time:play/pause/setMultiplier) — jak dawny TopBar._hitTestTime.
// Bell: NotificationCenter + toggleNotificationDropdown (otwiera W GÓRĘ — bez topY).
// MENU: deleguje do BottomBar (menu DOM) — ustawia _menuClickBounds + toggleMenu().

import { THEME, bgAlpha, hexToRgb } from '../config/ThemeConfig.js';
import { COSMIC } from '../config/LayoutConfig.js';
import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';
import { toggleNotificationDropdown, isNotificationDropdownOpen } from './NotificationDropdown.js';
import { bottomNavBarRect, navSlotLayout } from './BottomNavBarLogic.js';
import { NAV_GROUPS } from './CivPanelDrawer.js';

// Metryki ~25% mniejsze od TopBaru (btnH 16→12, speedW 18→14, play 18→14, bell/MENU 30→22).
const STRIP_H = 20;
const PAD     = 6;
const BTN_H   = 12;
const PLAY_W  = 14;
const SPEED_W = 14;
const GAP     = 1;
const BELL_W  = 22;
const MENU_W  = 22;

export class BottomControlBar {
  constructor() {
    this._bgRect    = null;
    this._bellRect  = null;
    this._menuRect  = null;
    this._playRect  = null;
    this._speedRects = [];
    this._hover     = null;   // 'bell'|'menu'|'play'|`speed${i}`|null
  }

  _markDirty() { const um = window.KOSMOS?.uiManager; if (um) um._dirty = true; }

  _stripTop(H) {
    const navTop = H - COSMIC.BOTTOM_LOG_TRIG_H - COSMIC.BOTTOM_NAV_H;
    return navTop - STRIP_H;
  }

  // ── Rysowanie ───────────────────────────────────────────────────────────
  draw(ctx, W, H, timeState) {
    const ts = timeState ?? window.KOSMOS?.uiManager?._timeState ?? { isPaused: true, multiplierIndex: 1, displayText: '' };
    const { isPaused, multiplierIndex, displayText } = ts;

    const stripTop = this._stripTop(H);
    const cy = stripTop + STRIP_H / 2;
    const btnY = Math.round(cy - BTN_H / 2);

    // Klaster wyrównany do ostatniego slotu nawigacji ("Technologie"): ramka = pełny span
    // przycisku, treść JUSTOWANA — lewa grupa [bell][MENU][play] dosunięta do LEWEJ krawędzi
    // slotu, prawa grupa [speeds][data] do PRAWEJ. Dzwonek = lewa krawędź przycisku.
    const navRect = bottomNavBarRect(W, H);
    const navSlots = navSlotLayout(navRect, NAV_GROUPS.length);
    const lastSlot = navSlots.length ? navSlots[navSlots.length - 1] : { x: W - 200, w: 200 };
    const lastSlotX     = lastSlot.x;
    const lastSlotRight = lastSlot.x + lastSlot.w;   // = navRect.x + navRect.w (W - inset)

    // ── Lewa grupa: bell → MENU → play, od lewej krawędzi slotu ──
    const leftEdge = lastSlotX + PAD;
    this._bellRect = { x: leftEdge, y: btnY, w: BELL_W, h: BTN_H };
    this._menuRect = { x: this._bellRect.x + BELL_W + 3, y: btnY, w: MENU_W, h: BTN_H };
    this._playRect = { x: this._menuRect.x + MENU_W + 5, y: btnY, w: PLAY_W, h: BTN_H };

    // ── Prawa grupa: data dosunięta do prawej krawędzi slotu, prędkości tuż przed nią ──
    const right = lastSlotRight - PAD;
    const dateFont = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.font = dateFont;
    const dateW = displayText ? ctx.measureText(displayText).width : 0;
    const dateLeft = right - dateW;
    const sepX = dateLeft - 6;
    const speedsRight = sepX - 4;
    this._speedRects = [];
    for (let i = 5; i >= 0; i--) {
      const x = speedsRight - SPEED_W - (5 - i) * (SPEED_W + GAP);
      this._speedRects[i] = { x, y: btnY, w: SPEED_W, h: BTN_H };
    }

    const bgLeft = lastSlotX;
    const bgW = lastSlotRight - lastSlotX;
    this._bgRect = { x: bgLeft, y: stripTop, w: bgW, h: STRIP_H };

    // ── Tło paska + delikatna rama motywu (góra + boki), spójnie z dolnym nav ──
    ctx.fillStyle = bgAlpha(0.9);
    ctx.fillRect(bgLeft, stripTop, bgW, STRIP_H);
    const a = hexToRgb(THEME.accent);
    ctx.strokeStyle = `rgba(${a.r},${a.g},${a.b},0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bgLeft + 0.5, stripTop + STRIP_H);
    ctx.lineTo(bgLeft + 0.5, stripTop + 0.5);
    ctx.lineTo(bgLeft + bgW - 0.5, stripTop + 0.5);
    ctx.lineTo(bgLeft + bgW - 0.5, stripTop + STRIP_H);
    ctx.stroke();

    // ── Bell (🔔 + badge) ──
    this._drawBell(ctx, this._bellRect, cy);
    // ── MENU (☰) ──
    this._drawIconBtn(ctx, this._menuRect, cy, '☰', !!window.KOSMOS?.bottomBar?.menuOpen, this._hover === 'menu');
    // ── Play / Pause ──
    this._drawTextBtn(ctx, this._playRect, cy, isPaused ? '▶' : '⏸',
      isPaused ? THEME.accent : THEME.textDim, isPaused ? THEME.bgSecondary : null, this._hover === 'play');
    // ── Prędkości (6) ──
    const speedLabels = [t('speed.1d'), t('speed.1w'), t('speed.1m'), t('speed.1y'), t('speed.10y'), t('speed.10k')];
    for (let i = 0; i < 6; i++) {
      const isActive = !isPaused && multiplierIndex === i + 1;
      this._drawTextBtn(ctx, this._speedRects[i], cy, speedLabels[i],
        isActive ? THEME.bgPrimary : THEME.textDim, isActive ? THEME.accent : null, this._hover === `speed${i}`,
        THEME.fontSizeSmall - 3);
    }
    // ── Separator | data ──
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sepX, stripTop + 4); ctx.lineTo(sepX, stripTop + STRIP_H - 4); ctx.stroke();
    // ── Data (lewo-wyrównana tuż za separatorem, przylega do prędkości) ──
    ctx.font = dateFont;
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(displayText || '', dateLeft, cy + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  _drawTextBtn(ctx, rc, cy, label, textColor, bgColor, hover, fontSize) {
    if (bgColor) { ctx.fillStyle = bgColor; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); }
    else if (hover) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); }
    else { ctx.strokeStyle = THEME.border; ctx.lineWidth = 1; ctx.strokeRect(rc.x + 0.5, rc.y + 0.5, rc.w - 1, rc.h - 1); }
    ctx.font = `${fontSize ?? (THEME.fontSizeSmall - 2)}px ${THEME.fontFamily}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, rc.x + rc.w / 2, cy + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  _drawIconBtn(ctx, rc, cy, icon, active, hover) {
    if (hover && !active) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); }
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = active ? THEME.accent : THEME.textPrimary;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(icon, rc.x + rc.w / 2, cy + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  _drawBell(ctx, rc, cy) {
    const nc = window.KOSMOS?.notificationCenter;
    const count = nc?.getActiveCount?.() ?? 0;
    const open = isNotificationDropdownOpen();
    if (open || this._hover === 'bell') { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); }
    ctx.font = `${THEME.fontSizeNormal - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = count > 0 ? THEME.accent : THEME.textSecondary;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔔', rc.x + rc.w / 2, cy + 0.5);
    if (count > 0) {
      const bx = rc.x + rc.w - 5, by = rc.y + 2, r = 6;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = THEME.danger; ctx.fill();
      ctx.fillStyle = THEME.textPrimary;
      ctx.font = `bold ${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillText(count > 99 ? '99+' : String(count), bx, by + 0.5);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── Hit / zdarzenia ─────────────────────────────────────────────────────
  _in(rc, x, y) { return rc && x >= rc.x && x <= rc.x + rc.w && y >= rc.y && y <= rc.y + rc.h; }

  handleClick(x, y) {
    if (!this._bgRect) return false;
    // Bell → dropdown powiadomień (otwiera W GÓRĘ: bez topY, barH = wys. od dołu ekranu do paska)
    if (this._in(this._bellRect, x, y)) {
      const scale = window.KOSMOS?.uiScale ?? 1;
      const stripTopScreen = this._bgRect.y * scale;
      toggleNotificationDropdown({
        anchorX: this._bellRect.x + this._bellRect.w / 2,
        scale,
        barH: Math.max(0, window.innerHeight - stripTopScreen),   // dropdown nad paskiem
        bellRect: { x: this._bellRect.x, y: this._bellRect.y, w: this._bellRect.w, h: this._bellRect.h },
      });
      this._markDirty();
      return true;
    }
    // MENU → menu DOM BottomBaru (ustaw bounds w bieżącym miejscu, otworzy się W GÓRĘ)
    if (this._in(this._menuRect, x, y)) {
      const bb = window.KOSMOS?.bottomBar;
      if (bb) { bb._menuClickBounds = { ...this._menuRect }; bb.toggleMenu(); }
      this._markDirty();
      return true;
    }
    // Play / Pause
    if (this._in(this._playRect, x, y)) {
      const isPaused = window.KOSMOS?.timeSystem?.isPaused ?? false;
      isPaused ? EventBus.emit('time:play') : EventBus.emit('time:pause');
      return true;
    }
    // Prędkości
    for (let i = 0; i < 6; i++) {
      if (this._in(this._speedRects[i], x, y)) {
        EventBus.emit('time:setMultiplier', { index: i + 1 });
        EventBus.emit('time:play');
        return true;
      }
    }
    // Klik w tło paska — pochłoń (nie spadaj na overlay/3D)
    return this._in(this._bgRect, x, y);
  }

  handleMouseMove(x, y) {
    let h = null;
    if (this._in(this._bellRect, x, y)) h = 'bell';
    else if (this._in(this._menuRect, x, y)) h = 'menu';
    else if (this._in(this._playRect, x, y)) h = 'play';
    else { for (let i = 0; i < 6; i++) if (this._in(this._speedRects[i], x, y)) { h = `speed${i}`; break; } }
    if (h !== this._hover) { this._hover = h; this._markDirty(); }
  }

  isOver(x, y) { return this._in(this._bgRect, x, y); }
}
