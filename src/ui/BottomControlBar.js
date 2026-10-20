// BottomControlBar — mały pasek sterowania u DOŁU (UI v3): dzwonek + MENU + blok czasu
// (play / 6 prędkości / data). Przeniesione z górnego TopBaru. Pasek osobny, WYRÓWNANY DO
// PRAWEJ, tuż NAD dolnym paskiem nawigacji (BottomNavBar), między nawigacją a sceną 3D.
// Elementy ~25% mniejsze niż w TopBarze. Non-exclusive: rysowany PO overlayManager (na
// wierzchu, by sterowanie czasem było zawsze dostępne), klik routowany PRZED overlayManager.
//
// Czas: emituje EventBus (time:play/pause/setMultiplier) — jak dawny TopBar._hitTestTime.
// Bell: NotificationCenter + toggleNotificationDropdown (otwiera W GÓRĘ — bez topY).
// MENU: deleguje do BottomBar (menu DOM) — ustawia _menuClickBounds + toggleMenu().
// Czip walk (ARKUSZ UI, U0-3): przy zminimalizowanym HUD walki — na lewo od paska, z własnym hit-testem (482).
// Rząd paska i czipu stały — bez karty peek (ARKUSZ UI U3-0b).
// PAS NA CAŁĄ SZEROKOŚĆ (ARKUSZ UI U4-3, UI_PLAN §4.5 — decyzje 1, (a), (b)): w trybie MAPY (bez overlayu pełnoekranowego)
// tło pasa biegnie od prawej krawędzi lewego outlinera (`MapInsets.left`; 0 przy schowanym) do prawej krawędzi ekranu,
// a od lewego końca — rząd chipów doku (`getDockSpan` → `PanelDock`); pod overlayem — jak dotąd: sam klaster zegara
// nad ostatnim slotem nawigacji i czip ⚔ (chipy doku chowają się jak outlinery — decyzja 4).
// SUWAK ZOOMU (ARKUSZ UI U4-4, decyzja (d)): nad mapą, tuż na lewo od 🔔 (czip ⚔ na lewo od suwaka); skala logarytmiczna
// dystansu kamery od jej celu, LEWO = DALEKO, zakres `_minDist` (jedzie z fokusem) – `maxDist`; gałka co klatkę z
// `_targetDist` (kółko i auto-zoom fokusu ją przesuwają), zapis wyłącznie `setTargetDist` (cel kamery nietknięty);
// przeciąganie przez `UIManager.handleMouseDown/Move/Up`, kółko nad suwakiem — ten sam krok co nad mapą (`wheelZoom`).

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC } from '../config/LayoutConfig.js';
import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';
import { toggleNotificationDropdown, isNotificationDropdownOpen } from './NotificationDropdown.js';
import { bottomNavBarRect, navSlotLayout } from './BottomNavBarLogic.js';
import { NAV_GROUPS } from './CivPanelDrawer.js';
import { BOTTOM_STRIP_H } from './MapInsets.js';   // ARKUSZ UI U3-2 — jedno źródło wysokości pasa dolnego
import { DOCK_CHIP_H, DOCK_CHIP_GAP } from './PanelDockLogic.js';   // ARKUSZ UI U4-3 — rząd chipów doku na pasie
import { distToPos, posToDist, xToPos, posToX } from './ZoomSliderLogic.js';   // ARKUSZ UI U4-4 — suwak zoomu

// Metryki kompaktowe — cały klaster (bell/menu/play/5×speed/data) musi zmieścić się w
// JEDNYM slocie nawigacji ("Technologie"), więc bell/menu są wąskie (16) a reszta drobna.
const STRIP_H = BOTTOM_STRIP_H;   // 20 px — pas dolny (`MapInsets`); outlinery kończą się nad nim (U3-2)
const PAD     = 5;
const BTN_H   = 12;
const PLAY_W  = 13;
const SPEED_W = 13;
const GAP     = 1;
const BELL_W  = 16;
const MENU_W  = 16;
// Czip „⚔ Walki [N]" (ARKUSZ UI, U0-3 — decyzja właściciela 2026-10-18, opcja 1; Findingi 481 / 482): widoczny przy
// zminimalizowanym HUD walki w trakcie starć, TUŻ NA LEWO od paska zegara, w tym samym rzędzie (nad przedostatnim
// slotem nawigacji). Dawniej rysował go BottomBar w prawym końcu górnej belki — tam pasmo surowców pochłaniało klik
// (482: `UIManager` woła belkę przed `_hitTestTopButtons`), a D-UI-12 przypina tam kredyty. Tu ma własny hit-test,
// wołany w łańcuchu UIManagera PRZED pasmem belki. W samym pasku zegara miejsca nie ma (klaster zajmuje 159–172 px
// z 182 px slotu — pomiar U0, `kosmos-handover/ui-u0/STOP_U0_CHIP.md`).
const CHIP_PAD_X = 14;   // szerokość czipu = tekst + 14 (jak dawny czip w BottomBar)
const CHIP_GAP   = 4;    // odstęp czipu od lewej krawędzi paska zegara (nad mapą — od suwaka zoomu)
// Suwak zoomu (U4-4, decyzja (d)) — tylko kreski i prostokąty z `fillRect` (pas bez ram i obrysów — U0-1).
const ZOOM_W     = 100;  // px — szerokość suwaka (z końcówkami „−” / „+”)
const ZOOM_GAP   = 6;    // px — odstęp od 🔔
const ZOOM_END_W = 10;   // px — końcówka „−” (lewo, daleko) / „+” (prawo, blisko)
const TRACK_H    = 2;    // px — tor
const KNOB_W     = 6;    // px — gałka
const KNOB_H     = 12;

export class BottomControlBar {
  constructor() {
    this._bgRect    = null;
    this._bellRect  = null;
    this._menuRect  = null;
    this._playRect  = null;
    this._speedRects = [];
    this._chipRect  = null;   // U0-3: czip walk {x,y,w,h,label} albo null (niewidoczny)
    this._dockSpan  = null;   // U4-3: rząd chipów doku {x0,x1,y,h} w trybie mapy; null pod overlayem
    this._zoomRect  = null;   // U4-4: suwak zoomu {x,y,w,h} nad mapą; null pod overlayem / bez kamery
    this._zoomTrack = null;   // U4-4: tor suwaka {x,w}
    this._zoomDragging = false;
    this._zoomDragMoved = false;
    this._hover     = null;   // 'bell'|'menu'|'play'|`speed${i}`|null
  }

  _markDirty() { const um = window.KOSMOS?.uiManager; if (um) um._dirty = true; }

  // Kontroler kamery (U4-4) — ta sama droga co `TacticalModeController` / `POIPanel`.
  _cam() { return window.KOSMOS?.threeRenderer?._cameraController ?? null; }

  // Górna krawędź rzędu tuż nad paskiem nawigacji — STAŁA (ARKUSZ UI U3-0b, decyzja właściciela 2026-10-19: karta peek
  // nad slotem wyłączona, więc pasek zegara i czip walk nie „jeżdżą” już za nią). Jeden rząd dla obu: pasek zegara nad
  // ostatnim slotem, czip walk (U0-3) — na lewo od niego.
  _stripTop(H) {
    return H - COSMIC.BOTTOM_LOG_TRIG_H - COSMIC.BOTTOM_NAV_H - STRIP_H;
  }

  // ── Rysowanie ───────────────────────────────────────────────────────────
  /**
   * @param {{left:number}|null} [strip] — ARKUSZ UI U4-3: tryb MAPY — pas od `strip.left` (prawa krawędź lewego
   *   outlinera, `MapInsets.left`) do prawej krawędzi ekranu, z rzędem chipów doku; `null` (pod overlayem
   *   pełnoekranowym, decyzja (b)) — tło = ostatni slot nawigacji, bez rzędu doku (jak dotąd)
   */
  draw(ctx, W, H, timeState, strip = null) {
    const ts = timeState ?? window.KOSMOS?.uiManager?._timeState ?? { isPaused: true, multiplierIndex: 1, displayText: '' };
    const { isPaused, multiplierIndex, displayText } = ts;

    const stripTop = this._stripTop(H);
    const cy = stripTop + STRIP_H / 2;
    const btnY = Math.round(cy - BTN_H / 2);

    // Klaster ZAKOTWICZONY w ostatnim slocie nawigacji ("Technologie"): tło = DOKŁADNIE ten
    // slot (równo z przyciskiem poniżej), treść CIĄGŁA dosunięta do prawej, liczona od prawej
    // do lewej: [data] | [prędkości][▶][☰][🔔]. Klamra nie pozwala dzwonkowi wyjść poza lewą
    // krawędź slotu (przy wąskim oknie treść jest przesuwana w prawo, zamiast wystawać w lewo).
    const navRect = bottomNavBarRect(W, H);
    const navSlots = navSlotLayout(navRect, NAV_GROUPS.length);
    const lastSlot = navSlots.length ? navSlots[navSlots.length - 1] : { x: W - 200, w: 200 };
    const lastSlotX     = lastSlot.x;
    const lastSlotRight = lastSlot.x + lastSlot.w;   // = navRect.x + navRect.w (W - inset)

    // ── Od prawej: data → separator → prędkości → play → menu → bell ──
    const right = lastSlotRight - PAD;
    const dateFont = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.font = dateFont;
    const dateW = displayText ? ctx.measureText(displayText).width : 0;
    let dateLeft = right - dateW;
    let sepX = dateLeft - 5;
    const speedsRight = sepX - 3;
    this._speedRects = [];
    for (let i = 4; i >= 0; i--) {
      const x = speedsRight - SPEED_W - (4 - i) * (SPEED_W + GAP);
      this._speedRects[i] = { x, y: btnY, w: SPEED_W, h: BTN_H };
    }
    // play → menu → bell, każdy na lewo od poprzedniego (treść ciągła, bez nakładania)
    this._playRect = { x: this._speedRects[0].x - 3 - PLAY_W, y: btnY, w: PLAY_W, h: BTN_H };
    this._menuRect = { x: this._playRect.x - 2 - MENU_W, y: btnY, w: MENU_W, h: BTN_H };
    this._bellRect = { x: this._menuRect.x - 2 - BELL_W, y: btnY, w: BELL_W, h: BTN_H };

    // Klamra anti-overflow: dzwonek nie wychodzi poza lewą krawędź slotu (z wcięciem PAD).
    const shift = Math.max(0, (lastSlotX + PAD) - this._bellRect.x);
    if (shift) {
      this._bellRect.x += shift; this._menuRect.x += shift; this._playRect.x += shift;
      for (const r of this._speedRects) r.x += shift;
      dateLeft += shift; sepX += shift;
    }

    // U4-3: tryb mapy — tło od prawej krawędzi lewego outlinera do prawej krawędzi ekranu; pod overlayem — ostatni slot.
    const mapMode = Number.isFinite(strip?.left);
    const bgLeft = mapMode ? Math.max(0, strip.left) : lastSlotX;
    const bgW = (mapMode ? W : lastSlotRight) - bgLeft;
    this._bgRect = { x: bgLeft, y: stripTop, w: bgW, h: STRIP_H };

    // ── Tło paska — BEZ ramy (ARKUSZ UI, U0-1: spójnie z dolnym nav bez ram, D-UI-13 / §7.15); obrysy
    //    przycisków prędkości zostają (`_drawTextBtn`) ──
    ctx.fillStyle = bgAlpha(0.9);
    ctx.fillRect(bgLeft, stripTop, bgW, STRIP_H);

    // ── Bell (🔔 + badge) ──
    this._drawBell(ctx, this._bellRect, cy);
    // ── MENU (☰) ──
    this._drawIconBtn(ctx, this._menuRect, cy, '☰', !!window.KOSMOS?.bottomBar?.menuOpen, this._hover === 'menu');
    // ── Play / Pause ──
    this._drawTextBtn(ctx, this._playRect, cy, isPaused ? '▶' : '⏸',
      isPaused ? THEME.accent : THEME.textDim, isPaused ? THEME.bgSecondary : null, this._hover === 'play');
    // ── Prędkości (5) ──
    const speedLabels = [t('speed.1d'), t('speed.3d'), t('speed.1w'), t('speed.1m'), t('speed.1y')];
    for (let i = 0; i < 5; i++) {
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

    // ── Suwak zoomu (U4-4, decyzja (d)): nad mapą, tuż na lewo od 🔔; pod overlayem — brak (sterowanie mapą) ──
    this._zoomRect = null;
    this._zoomTrack = null;
    const cam = mapMode ? this._cam() : null;
    if (cam) {
      this._zoomRect = { x: this._bellRect.x - ZOOM_GAP - ZOOM_W, y: stripTop, w: ZOOM_W, h: STRIP_H };
      this._zoomTrack = { x: this._zoomRect.x + ZOOM_END_W, w: ZOOM_W - 2 * ZOOM_END_W };
      this._drawZoomSlider(ctx, cam, cy);
    }

    // ── Czip walk (U0-3, opcja 1): na lewo od paska zegara, w rzędzie nad PRZEDOSTATNIM slotem nawigacji; nad mapą —
    //    na lewo od suwaka zoomu (U4-4) ──
    this._chipRect = null;
    const hud = window.KOSMOS?.combatHud;
    if (hud?.isMinimized?.() && hud?.hasActiveEncounters?.()) {
      const n = window.KOSMOS?.deepSpaceCombatSystem?.listActive?.()?.length ?? 0;
      const label = n > 1 ? t('combat.hudChipN', n) : t('combat.hudChip');
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const w = Math.ceil(ctx.measureText(label).width) + CHIP_PAD_X;
      const top = this._stripTop(H);
      this._chipRect = { x: (this._zoomRect ? this._zoomRect.x : lastSlotX) - CHIP_GAP - w, y: top, w, h: STRIP_H, label };
      this._drawCombatChip(ctx, this._chipRect);
    }

    // ── Rząd chipów doku (U4-3, decyzja (c)): od lewego końca pasa do lewej krawędzi klastra po prawej (czip ⚔, suwak
    //    zoomu albo 🔔); tylko w trybie mapy — pod overlayem chipy chowają się jak outlinery (decyzja 4). ──
    this._dockSpan = null;
    if (mapMode) {
      const right = (this._chipRect?.x ?? this._zoomRect?.x ?? this._bellRect.x) - DOCK_CHIP_GAP;
      this._dockSpan = { x0: bgLeft + DOCK_CHIP_GAP, x1: right, y: stripTop + (STRIP_H - DOCK_CHIP_H) / 2, h: DOCK_CHIP_H };
    }

    // Podpowiedź suwaka zoomu (U4-4) — nad pasem, przy suwaku.
    if (this._zoomRect && this._hover === 'zoom' && !this._zoomDragging) this._drawZoomTip(ctx, W);
  }

  // Suwak zoomu (U4-4): końcówki „−” (daleko) / „+” (blisko), tor i gałka — wyłącznie `fillRect` (bez obrysów).
  _drawZoomSlider(ctx, cam, cy) {
    const z = this._zoomRect, tr = this._zoomTrack;
    const active = this._hover === 'zoom' || this._zoomDragging;
    if (active) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(z.x, z.y, z.w, z.h); }
    const gy = Math.round(cy);
    const mx = z.x + ZOOM_END_W / 2, px = z.x + z.w - ZOOM_END_W / 2;
    ctx.fillStyle = THEME.textDim;
    ctx.fillRect(mx - 2.5, gy - 0.5, 5, 1);                               // „−”
    ctx.fillRect(px - 2.5, gy - 0.5, 5, 1); ctx.fillRect(px - 0.5, gy - 2.5, 1, 5);   // „+”
    ctx.fillStyle = THEME.border;
    ctx.fillRect(tr.x, gy - TRACK_H / 2, tr.w, TRACK_H);                  // tor
    // Gałka — co klatkę z bieżącego `_targetDist` (kółko i auto-zoom fokusu przesuwają suwak).
    const kx = posToX(distToPos(cam._targetDist, cam._minDist, cam.maxDist), tr.x, tr.w);
    ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
    ctx.fillRect(Math.round(kx - KNOB_W / 2), Math.round(cy - KNOB_H / 2), KNOB_W, KNOB_H);
  }

  _drawZoomTip(ctx, W) {
    const text = t('bottomBar.zoomHint');
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const w = Math.ceil(ctx.measureText(text).width) + 12, h = 16;
    const z = this._zoomRect;
    const x = Math.max(4, Math.min(W - w - 4, z.x + z.w / 2 - w / 2));
    const y = z.y - 4 - h;
    ctx.fillStyle = bgAlpha(0.95);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 6, y + h / 2 + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  /** ARKUSZ UI U4-4 — dystans kamery z pozycji x na torze (zapis wyłącznie `setTargetDist`). */
  _zoomFromX(x) {
    const cam = this._cam(), tr = this._zoomTrack;
    if (!cam || !tr) return;
    cam.setTargetDist(posToDist(xToPos(x, tr.x, tr.w), cam._minDist, cam.maxDist));
    this._markDirty();
  }

  /** Wciśnięcie LPM na suwaku — początek przeciągania (dystans od razu z pozycji kursora). */
  tryBeginZoomDrag(x, y) {
    if (!this._in(this._zoomRect, x, y) || !this._cam()) return false;
    this._zoomDragging = true;
    this._zoomDragMoved = false;
    this._zoomFromX(x);
    return true;
  }

  /** Ruch myszy w trakcie przeciągania (także poza suwakiem — klamra toru). */
  handleZoomDrag(x) {
    if (!this._zoomDragging) return false;
    this._zoomDragMoved = true;
    this._zoomFromX(x);
    return true;
  }

  /** Koniec przeciągania — true, gdy suwak się ruszył (UIManager pochłania wtedy nadchodzący klik). */
  endZoomDrag() {
    const moved = this._zoomDragging && this._zoomDragMoved;
    this._zoomDragging = false;
    this._zoomDragMoved = false;
    return moved;
  }

  isDraggingZoom() { return this._zoomDragging === true; }

  /** Kółko nad suwakiem — ten sam krok co nad mapą (`wheelZoom` kontrolera, surowe `deltaY`). */
  handleZoomWheel(x, y, rawDeltaY) {
    if (!this._in(this._zoomRect, x, y)) return false;
    const cam = this._cam();
    if (!cam?.wheelZoom) return false;
    cam.wheelZoom(rawDeltaY);
    this._markDirty();
    return true;
  }

  /** ARKUSZ UI U4-3 — rząd chipów doku z ostatniej klatki (`PanelDock.draw`); null pod overlayem. */
  getDockSpan() { return this._dockSpan; }

  // Czip walk — własne tło i ramka jak dawny czip w górnej belce (ciemny podkład + akcent, czerwona ramka i tekst).
  _drawCombatChip(ctx, b) {
    ctx.fillStyle = bgAlpha(0.9);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = THEME.accentMed ?? 'rgba(60, 60, 60, 0.6)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = THEME.danger ?? '#ff4466';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.danger ?? '#ff4466';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
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
    // Czip walk (U0-3, Finding 482) — przywraca zminimalizowany HUD walki; własny prostokąt, przed resztą paska.
    if (this._in(this._chipRect, x, y)) {
      window.KOSMOS?.combatHud?.toggleMinimize?.();
      this._markDirty();
      return true;
    }
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
    for (let i = 0; i < 5; i++) {
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
    else if (this._in(this._zoomRect, x, y)) h = 'zoom';   // U4-4 — suwak zoomu
    else { for (let i = 0; i < 5; i++) if (this._in(this._speedRects[i], x, y)) { h = `speed${i}`; break; } }
    if (h !== this._hover) { this._hover = h; this._markDirty(); }
  }

  isOver(x, y) { return this._in(this._bgRect, x, y) || this._in(this._chipRect, x, y); }
}
