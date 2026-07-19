// TacticalDock — „Dok taktyczny" (Faza 4 Obrazu Operacyjnego). Półprzezroczysty pas
// dowodzenia na dole ekranu, WYŁĄCZNIE w trybie taktycznym Y (gate FEATURES.tacticalDock).
//
// Non-exclusive (wzór FleetGroupPanel/StationPanel/CombatHUD): trzymany BEZPOŚREDNIO przez
// UIManager, rysowany PRZED dolnymi paskami (nav/control na wierzchu), klik/scroll/hover
// obsługiwane PRZED overlayManager. Widoczność = tryb Y (self-managed przez tactical:modeChanged).
//
// Cztery soczewki FleetPictureLogic; dok to CZWARTA — „co się dzieje TERAZ, tutaj" (bieżący
// układ + tranzyt). Lewy dok [LISTA]/[OŚ] + prawy mini-panel wybranego statku. Świadomie BEZ
// szukajki/wraków/kontaktów/grupowania — pełny audyt zostaje w Command/REJESTR.
//
// Slice 4a = szkielet: pas, zakładki, zwijanie ▾, persist w uiPrefs, konsumpcja wejścia
// myszy (blokada kamery), rezerwa dla pływających paneli. LISTA/OŚ/mini-panel = 4b/4c/4d.

import { BaseOverlay }      from './BaseOverlay.js';
import EventBus             from '../core/EventBus.js';
import { THEME, bgAlpha }   from '../config/ThemeConfig.js';
import { GAME_CONFIG }      from '../config/GameConfig.js';
import {
  BOTTOM_RESERVED, TACTICAL_DOCK_H, TACTICAL_DOCK_PANEL_W, TACTICAL_DOCK_TAB_H, COSMIC,
} from '../config/LayoutConfig.js';
import { t }                from '../i18n/i18n.js';
import { DOCK_TABS, DEFAULT_DOCK_TAB, computeDockLayout } from './TacticalDockLogic.js';

export class TacticalDock extends BaseOverlay {
  constructor() {
    super(null);
    this._collapsed = false;
    this._tab       = DEFAULT_DOCK_TAB;   // 'list' | 'timeline'
    this._scroll    = 0;                  // offset scrolla LISTY (4b)
    this._drawnRect = null;
    this._syncPrefs();

    // Self-managed widoczność: pas żyje TYLKO w trybie taktycznym Y i tylko gdy flaga ON.
    EventBus.on('tactical:modeChanged', (e) => {
      const active = !!e?.active && GAME_CONFIG.FEATURES?.tacticalDock === true;
      this.visible = active;
      if (active) this._syncPrefs();      // przy wejściu wczytaj świeże (restore save)
      else this._hoverZone = null;
      this._markDirty();
    });
  }

  _syncPrefs() {
    const p = window.KOSMOS?.uiPrefs;
    this._collapsed = p?.tacticalDockCollapsed === true;
    const tab = p?.tacticalDockTab;
    this._tab = DOCK_TABS.includes(tab) ? tab : DEFAULT_DOCK_TAB;
  }

  _writePref(key, val) {
    const K = window.KOSMOS;
    if (!K) return;
    K.uiPrefs = K.uiPrefs ?? {};
    K.uiPrefs[key] = val;
  }

  _markDirty() {
    const um = window.KOSMOS?.uiManager;
    if (um) um._dirty = true;
  }

  // ── Stan widoczności / rezerwa dla paneli ────────────────────────────────────
  /** Czy pas jest obecnie pokazywany (tryb Y + flaga). */
  isShowing() { return this.visible === true; }

  /** Czy rozwinięty (pokazywany i niezwinięty) — Outliner chowa się gdy true. */
  isExpanded() { return this.visible === true && !this._collapsed; }

  /**
   * Wysokość zajęta przez pas u dołu — JEDNO źródło prawdy dla podnoszenia pływających
   * paneli (FleetGroupPanel/FleetCommandPanel/CombatHUD/PanelDock/StationPanel). 0 gdy ukryty.
   */
  getReservedHeight() {
    if (!this.visible) return 0;
    return this._collapsed ? TACTICAL_DOCK_TAB_H : TACTICAL_DOCK_H;
  }

  _layout(W, H) {
    return computeDockLayout(W, H, {
      collapsed:      this._collapsed,
      dockH:          TACTICAL_DOCK_H,
      panelW:         TACTICAL_DOCK_PANEL_W,
      tabH:           TACTICAL_DOCK_TAB_H,
      bottomReserved: BOTTOM_RESERVED,
      topLimit:       COSMIC.TOP_BAND_H + 8,
    });
  }

  // ── Rysowanie ────────────────────────────────────────────────────────────────
  draw(ctx, W, H) {
    if (!this.visible) { this._drawnRect = null; return; }
    this._hitZones = [];
    const C = THEME;
    const L = this._layout(W, H);
    this._drawnRect = { x: L.x, y: L.y, w: L.w, h: L.h };

    // Tło pasa (półprzezroczyste) + górna krawędź.
    ctx.fillStyle = bgAlpha(0.82);
    ctx.fillRect(L.x, L.y, L.w, L.h);
    ctx.strokeStyle = C.borderActive ?? C.accent;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.x, L.y + 0.5); ctx.lineTo(L.x + L.w, L.y + 0.5); ctx.stroke();

    // Pasek zakładek — tło + separator dolny.
    ctx.fillStyle = bgAlpha(0.35);
    ctx.fillRect(L.tabBar.x, L.tabBar.y, L.tabBar.w, L.tabBar.h);

    // Zakładki [LISTA] [OŚ].
    const TAB_KEYS = { list: 'tacticalDock.tabList', timeline: 'tacticalDock.tabTimeline' };
    for (const tab of L.tabs) {
      const active = this._tab === tab.id;
      const hover  = this._hoverZone?.type === 'tab' && this._hoverZone?.data?.id === tab.id;
      ctx.fillStyle = active ? 'rgba(0,255,180,0.10)' : (hover ? 'rgba(0,255,180,0.04)' : 'transparent');
      ctx.fillRect(tab.x, tab.y + 2, tab.w, tab.h - 4);
      ctx.strokeStyle = active ? (C.borderActive ?? C.accent) : C.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(tab.x + 0.5, tab.y + 2.5, tab.w - 1, tab.h - 5);
      ctx.fillStyle = active ? C.accent : (hover ? C.textPrimary : C.textSecondary);
      ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t(TAB_KEYS[tab.id] ?? 'tacticalDock.tabList'), tab.x + tab.w / 2, tab.y + tab.h / 2 + 1);
      this._addHit(tab.x, tab.y, tab.w, tab.h, 'tab', { id: tab.id });
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Przycisk zwijania ▾/▴ (prawy koniec lewego regionu, w pasku zakładek).
    const cb = L.collapseBtn;
    if (cb.x > (L.tabs[1]?.x + L.tabs[1]?.w ?? 0)) {   // rysuj tylko gdy jest miejsce
      const hover = this._hoverZone?.type === 'collapse';
      ctx.strokeStyle = hover ? C.accent : C.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(cb.x + 0.5, cb.y + 2.5, cb.w - 1, cb.h - 5);
      ctx.fillStyle = hover ? C.accent : C.textSecondary;
      ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this._collapsed ? '▴' : '▾', cb.x + cb.w / 2, cb.y + cb.h / 2 + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      this._addHit(cb.x, cb.y, cb.w, cb.h, 'collapse', {});
    }

    // Treść (tylko rozwinięty) — 4a: puste ramki + hint (LISTA/OŚ w 4b/4c, mini-panel w 4d).
    if (!this._collapsed) {
      // Przegroda lewy dok ┬ prawy mini-panel.
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L.panelRect.x + 0.5, L.y);
      ctx.lineTo(L.panelRect.x + 0.5, L.y + L.h);
      ctx.stroke();

      // Hint w centrum lewego regionu (placeholder do slice 4b/4c).
      if (L.leftRect.h > 16) {
        ctx.fillStyle = C.textDim;
        ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('tacticalDock.empty'),
          L.leftRect.x + L.leftRect.w / 2, L.leftRect.y + L.leftRect.h / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }

    // Tło jako hit-zone NA KOŃCU — zony konkretne (zakładki/collapse) mają priorytet
    // (_hitTest=find); tło konsumuje kliki/scroll w pas (nie przelatują do mapy 3D).
    this._addHit(L.x, L.y, L.w, L.h, 'bg', {});
  }

  // ── Interakcja ───────────────────────────────────────────────────────────────
  _onHit(zone) {
    if (!zone) return;
    switch (zone.type) {
      case 'tab':
        if (zone.data?.id && DOCK_TABS.includes(zone.data.id) && this._tab !== zone.data.id) {
          this._tab = zone.data.id;
          this._scroll = 0;
          this._writePref('tacticalDockTab', this._tab);
          this._markDirty();
        }
        return;
      case 'collapse':
        this._collapsed = !this._collapsed;
        this._writePref('tacticalDockCollapsed', this._collapsed);
        this._markDirty();
        return;
      // 'bg' → swallow (klik w pas nie przelatuje do mapy 3D).
    }
  }

  /** Scroll listy nad pasem (konsumuje kółko → kamera nie zoomuje). 4a: brak listy → tylko blokada. */
  handleWheel(x, y, delta) {
    if (!this.visible) return false;
    if (!this._hitTest(x, y)) return false;   // poza pasem → nie konsumuj (zoom kamery)
    // 4b doda faktyczny scroll offsetu LISTY; teraz sam fakt bycia nad pasem blokuje zoom.
    return true;
  }
}
