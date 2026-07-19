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
import { toneColor }        from './FleetPictureLogic.js';
import {
  DOCK_TABS, DEFAULT_DOCK_TAB, computeDockLayout,
  buildDockRows, dockVisibleRowCount, clampDockScroll,
} from './TacticalDockLogic.js';

const DOCK_ROW_H      = 22;    // wysokość wiersza LISTY (px logiczne)
const DOCK_DBLCLICK_MS = 300;  // okno dwukliku wiersza → vessel:focus (inaczej select+ping)
const DOCK_ROW_FUEL_W = 44;    // mini-pasek paliwa w wierszu

// Kolor kropki alertu wg severity (1 krytyczny → 3 ostrzeżenie).
function _alertDotColor(severity) {
  if (severity <= 1) return THEME.danger;
  if (severity === 2) return '#ff8844';
  return THEME.warning;
}

export class TacticalDock extends BaseOverlay {
  constructor() {
    super(null);
    this._collapsed = false;
    this._tab       = DEFAULT_DOCK_TAB;   // 'list' | 'timeline'
    this._scroll    = 0;                  // offset scrolla LISTY (px)
    this._drawnRect = null;
    this._rowCount    = 0;                // z ostatniego draw (clamp scrolla w handleWheel)
    this._visibleRows = 0;
    this._lastRowClickMs = 0;            // detekcja dwukliku wiersza
    this._lastRowClickId = null;
    this._pendingScrollToId = null;      // auto-scroll do statku wybranego na mapie
    this._syncPrefs();

    // Self-managed widoczność: pas żyje TYLKO w trybie taktycznym Y i tylko gdy flaga ON.
    EventBus.on('tactical:modeChanged', (e) => {
      const active = !!e?.active && GAME_CONFIG.FEATURES?.tacticalDock === true;
      this.visible = active;
      if (active) this._syncPrefs();      // przy wejściu wczytaj świeże (restore save)
      else { this._hoverZone = null; this._clearHoverVid(); }
      this._markDirty();
    });

    // Selekcja dwustronna: klik statku na MAPIE 3D → dok przewija się do wiersza.
    EventBus.on('ui:selectionChanged', (e) => {
      if (!this.visible) return;
      const id = e?.vesselId ?? null;
      if (id) this._pendingScrollToId = id;   // draw doścignie scroll
      this._markDirty();
    });
  }

  _clearHoverVid() {
    window.KOSMOS?.threeRenderer?.setTacticalHoverVid?.(null);
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

    // Treść (tylko rozwinięty). LISTA = 4b; OŚ = placeholder do 4c; mini-panel = 4d.
    if (!this._collapsed) {
      // Przegroda lewy dok ┬ prawy mini-panel.
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L.panelRect.x + 0.5, L.y);
      ctx.lineTo(L.panelRect.x + 0.5, L.y + L.h);
      ctx.stroke();

      if (this._tab === 'list') {
        this._drawListRows(ctx, L);
      } else {
        this._rowCount = 0; this._visibleRows = 0;
        this._drawCenterHint(ctx, L.leftRect, t('tacticalDock.timelineSoon'));
      }
    } else {
      this._rowCount = 0; this._visibleRows = 0;
    }

    // Tło jako hit-zone NA KOŃCU — zony konkretne (zakładki/collapse/wiersze) mają priorytet
    // (_hitTest=find); tło konsumuje kliki/scroll w pas (nie przelatują do mapy 3D).
    this._addHit(L.x, L.y, L.w, L.h, 'bg', {});
  }

  // ── LISTA — dane + rysowanie wierszy ─────────────────────────────────────────
  // ctx dla czystej logiki (wpięcia świata jak FleetManagerOverlay._registryCtx).
  _dockCtx() {
    const K = window.KOSMOS;
    const vm = K?.vesselManager;
    const dscs = K?.deepSpaceCombatSystem;
    return {
      pictureCtx: {
        gameYear:      K?.timeSystem?.gameTime ?? 0,
        fleetSystem:   K?.fleetSystem ?? null,
        combatCheck:   dscs?._findActiveEncounterContaining
          ? (id) => !!dscs._findActiveEncounterContaining(id) : null,
        isImmobilized: vm?.isImmobilized ? (v) => vm.isImmobilized(v) : null,
      },
      activeSystemId: K?.activeSystemId ?? 'sys_home',
    };
  }

  _computeRows() {
    const vm = window.KOSMOS?.vesselManager;
    if (!vm?.getAllVessels) return [];
    return buildDockRows(vm.getAllVessels(), this._dockCtx());
  }

  _drawCenterHint(ctx, rect, text) {
    if (rect.h <= 16) return;
    ctx.fillStyle = THEME.textDim;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  _drawListRows(ctx, L) {
    const rect = L.leftRect;
    const rows = this._computeRows();
    this._rowCount = rows.length;
    const visible = dockVisibleRowCount(rect.h, DOCK_ROW_H);
    this._visibleRows = visible;

    if (rows.length === 0) { this._scroll = 0; this._drawCenterHint(ctx, rect, t('tacticalDock.empty')); return; }

    // Auto-scroll do statku wybranego na mapie (jednorazowo, gdy jest w bieżącej liście).
    if (this._pendingScrollToId) {
      const idx = rows.findIndex((r) => r.id === this._pendingScrollToId);
      if (idx >= 0) {
        const rowTop = idx * DOCK_ROW_H;
        const rowBot = rowTop + DOCK_ROW_H;
        if (rowTop < this._scroll) this._scroll = rowTop;
        else if (rowBot > this._scroll + rect.h) this._scroll = rowBot - rect.h;
      }
      this._pendingScrollToId = null;
    }
    this._scroll = clampDockScroll(this._scroll, rows.length, visible, DOCK_ROW_H);

    const leadId = window.KOSMOS?.uiManager?.getSelectedVesselId?.();
    ctx.save();
    ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
    for (let i = 0; i < rows.length; i++) {
      const ry = rect.y + i * DOCK_ROW_H - this._scroll;
      if (ry + DOCK_ROW_H < rect.y || ry > rect.y + rect.h) continue;   // poza widokiem
      this._drawRow(ctx, rows[i], rect.x, ry, rect.w, leadId);
      // Hit-zone przycięta do widocznego wycinka wiersza (klik tylko w widoczne).
      const visTop = Math.max(ry, rect.y);
      const visBot = Math.min(ry + DOCK_ROW_H, rect.y + rect.h);
      if (visBot > visTop) this._addHit(rect.x, visTop, rect.w, visBot - visTop, 'row', { id: rows[i].id });
    }
    ctx.restore();

    // Wskaźnik scrolla (gdy jest co przewijać).
    if (rows.length > visible) {
      const trackH = rect.h;
      const thumbH = Math.max(16, trackH * visible / rows.length);
      const maxScroll = (rows.length - visible) * DOCK_ROW_H;
      const thumbY = rect.y + (maxScroll > 0 ? (this._scroll / maxScroll) * (trackH - thumbH) : 0);
      ctx.fillStyle = 'rgba(0,255,180,0.20)';
      ctx.fillRect(rect.x + rect.w - 3, thumbY, 2, thumbH);
    }
  }

  _drawRow(ctx, row, x, ry, w, leadId) {
    const C = THEME;
    const isLead = row.id === leadId;
    const hover  = this._hoverZone?.type === 'row' && this._hoverZone?.data?.id === row.id;
    if (isLead)      { ctx.fillStyle = 'rgba(0,255,180,0.12)'; ctx.fillRect(x, ry, w, DOCK_ROW_H); }
    else if (hover)  { ctx.fillStyle = 'rgba(0,255,180,0.05)'; ctx.fillRect(x, ry, w, DOCK_ROW_H); }

    const midY = ry + DOCK_ROW_H / 2;
    const padL = x + 6;
    ctx.textBaseline = 'middle';

    // Glif (kolor tonu).
    ctx.fillStyle = toneColor(row.tone, C) ?? C.text ?? C.textPrimary;
    ctx.font = `${C.fontSizeMedium}px ${C.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(row.glyph, padL, midY + 1);

    // Prawy klaster: kropka alertu → pasek paliwa → ETA (od prawej).
    let rx = x + w - 8;
    if (row.alertCount > 0) {
      ctx.fillStyle = _alertDotColor(row.alerts[0].severity);
      ctx.beginPath(); ctx.arc(rx - 4, midY, 4, 0, Math.PI * 2); ctx.fill();
      rx -= 12;
      if (row.alertCount > 1) {
        ctx.fillStyle = C.textDim; ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`; ctx.textAlign = 'right';
        ctx.fillText(String(row.alertCount), rx, midY); rx -= 10;
      }
    }
    if (row.fuelPct !== null && row.fuelPct !== undefined) {
      const bw = DOCK_ROW_FUEL_W, bh = 5, bx = rx - bw, by = midY - bh / 2;
      const col = row.fuelPct > 0.3 ? (C.success ?? '#00ee88') : (C.warning ?? '#ffcc44');
      this._drawBar(ctx, bx, by, bw, bh, row.fuelPct, col, C.border);
      rx = bx - 8;
    }
    if (Number.isFinite(row.eta?.year)) {
      const moving = row.eta.confidence === 'moving';
      const txt = `${moving ? '~' : '⏱'}${Math.round(row.eta.year)}`;
      ctx.fillStyle = C.info; ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`; ctx.textAlign = 'right';
      ctx.fillText(txt, rx, midY); rx -= ctx.measureText(txt).width + 8;
    }

    // Nazwa (+⚠ gdy unieruchomiony) + aktywność (dim), do lewej.
    ctx.textAlign = 'left';
    let nameX = padL + 16;
    if (row.immobilized) {
      ctx.fillStyle = C.danger; ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
      ctx.fillText('⚠', nameX, midY); nameX += ctx.measureText('⚠ ').width;
    }
    ctx.fillStyle = isLead ? C.accent : C.textPrimary;
    ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
    const nameMaxW = Math.max(0, Math.min(150, rx - nameX - 6));
    const nameTxt = this._truncate(ctx, row.name, nameMaxW);
    ctx.fillText(nameTxt, nameX, midY);
    const actX = nameX + ctx.measureText(nameTxt).width + 10;
    if (actX < rx - 20) {
      ctx.fillStyle = C.textDim; ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
      const act = t(row.activityKey, ...(row.activityArgs ?? []));
      ctx.fillText(this._truncate(ctx, act, rx - actX - 6), actX, midY);
    }
    ctx.textBaseline = 'alphabetic';
  }

  _truncate(ctx, text, maxW) {
    text = String(text ?? '');
    if (maxW <= 0) return '';
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
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
      case 'row': {
        const id = zone.data?.id;
        if (!id) return;
        const um = window.KOSMOS?.uiManager;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const isDouble = (now - this._lastRowClickMs < DOCK_DBLCLICK_MS) && this._lastRowClickId === id;
        this._lastRowClickMs = now;
        this._lastRowClickId = id;
        if (isDouble) {
          EventBus.emit('vessel:focus', { vesselId: id });     // dwuklik → dolot kamery + śledzenie
        } else {
          um?.setSelectedVesselId?.(id);                        // klik → selekcja (współdzielona)
          window.KOSMOS?.threeRenderer?.pingVessel?.(id);       // + ping FX (kamera nietknięta)
        }
        this._markDirty();
        return;
      }
      // 'bg' → swallow (klik w pas nie przelatuje do mapy 3D).
    }
  }

  /** Hover wiersza → podgląd trasy/ducha statku (setTacticalHoverVid); niczego nie zaznacza. */
  handleMouseMove(x, y) {
    if (!this.visible) return;
    const prev = this._hoverZone;
    super.handleMouseMove(x, y);   // ustawia _hoverZone
    const z = this._hoverZone;
    const hoverVid = z?.type === 'row' ? (z.data?.id ?? null) : null;
    window.KOSMOS?.threeRenderer?.setTacticalHoverVid?.(hoverVid);
    if (prev !== z) this._markDirty();
  }

  /** Kółko nad pasem = scroll LISTY (blokuje zoom kamery). Poza pasem → false (zoom). */
  handleWheel(x, y, delta) {
    if (!this.visible) return false;
    if (!this._hitTest(x, y)) return false;   // poza pasem → nie konsumuj (zoom kamery)
    if (this._tab === 'list' && this._rowCount > this._visibleRows) {
      this._scroll = clampDockScroll(this._scroll + delta, this._rowCount, this._visibleRows, DOCK_ROW_H);
      this._markDirty();
    }
    return true;   // nad pasem ZAWSZE konsumuj (nawet gdy nie ma czego scrollować)
  }
}
