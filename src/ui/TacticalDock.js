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
  DOCK_SIDE_GAP_FRAC, TACTICAL_DOCK_CLOCK_CLEARANCE,
} from '../config/LayoutConfig.js';
import { t }                from '../i18n/i18n.js';
import { toneColor, buildTimelineRows, buildShipEntry } from './FleetPictureLogic.js';
import {
  DOCK_TABS, DEFAULT_DOCK_TAB, computeDockLayout,
  buildDockRows, filterDockVessels, dockVisibleRowCount, clampDockScroll,
  computePanelMode, canCancelOrder,
} from './TacticalDockLogic.js';
import {
  defaultViewport, yearToX, xToYear, layoutTimelineRows, nowLineX, timelineTicks,
  TIMELINE_MIN_SPAN_YEARS,
} from './TimelineLayout.js';

// 4f-1b — alfa tła pasa (0..1). Niższa = mapa mocniej prześwituje. 0.82→0.55→0.32: pas „niemal
// pływa"; separację od mapy robi samo delikatne przyciemnienie + typografia (BEZ ramki, niżej).
const TACTICAL_DOCK_BG_ALPHA = 0.32;

const DOCK_ROW_H      = 22;    // wysokość wiersza LISTY / lane'u OSI (px logiczne)
const DOCK_DBLCLICK_MS = 300;  // okno dwukliku wiersza → vessel:focus (inaczej select+ping)
const DOCK_ROW_FUEL_W = 44;    // mini-pasek paliwa w wierszu
const DOCK_TL_GUTTER  = 128;   // szerokość lewej rynny OSI (glif + nazwa)
const DOCK_TL_HEADER  = 14;    // pasek podziałki lat OSI (nad lane'ami)
const DOCK_TL_MAX_SPAN = 40;   // maks. zakres osi (lata) — auto-fit clampowany do tego
const DOCK_TL_BAR_H   = 8;     // wysokość paska misji w lane

// Kolor kropki alertu wg severity (1 krytyczny → 3 ostrzeżenie).
function _alertDotColor(severity) {
  if (severity <= 1) return THEME.danger;
  if (severity === 2) return '#ff8844';
  return THEME.warning;
}

// Kolor paska osi wg rodzaju (mission-*/return/warp).
function _barKindColor(kind) {
  if (kind === 'warp')   return '#cc88ff';
  if (kind === 'return') return THEME.info ?? '#00ccff';
  if (typeof kind === 'string' && kind.startsWith('mission-')) return THEME.success ?? '#00ee88';
  return THEME.textSecondary;
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
    const tr = window.KOSMOS?.threeRenderer;
    tr?.setTacticalHoverVid?.(null);
    tr?.setTacticalHoverYear?.(null);
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
    // 4f-1 — pas podniesiony o TACTICAL_DOCK_CLOCK_CLEARANCE nad zegar → pływające panele muszą
    // podnieść się o (wysokość pasa + prześwit), by usiąść dokładnie NAD górną krawędzią pasa.
    const barH = this._collapsed ? TACTICAL_DOCK_TAB_H : TACTICAL_DOCK_H;
    return barH + TACTICAL_DOCK_CLOCK_CLEARANCE;
  }

  _layout(W, H) {
    return computeDockLayout(W, H, {
      collapsed:      this._collapsed,
      dockH:          TACTICAL_DOCK_H,
      panelW:         TACTICAL_DOCK_PANEL_W,
      tabH:           TACTICAL_DOCK_TAB_H,
      sideGapFrac:    DOCK_SIDE_GAP_FRAC,                              // 4f-1: wycentrowanie ~90%
      bottomReserved: BOTTOM_RESERVED + TACTICAL_DOCK_CLOCK_CLEARANCE, // 4f-1: podniesienie nad zegar
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

    // Tło pasa — BARDZO półprzezroczyste (4f-1b: „niemal pływa"). BEZ górnej krawędzi/konturu:
    // separację od mapy robi samo przyciemnienie tła + typografia.
    ctx.fillStyle = bgAlpha(TACTICAL_DOCK_BG_ALPHA);
    ctx.fillRect(L.x, L.y, L.w, L.h);

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
      // 4f-1b — BEZ przegrody lewy dok ┬ mini-panel: separację robi układ treści, nie linia konturu.
      if (this._tab === 'list') { this._timelineVp = null; this._drawListRows(ctx, L); }
      else                      { this._drawTimeline(ctx, L); }

      // Prawy mini-panel wybranego statku (4d).
      this._drawPanel(ctx, L.panelRect);
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

  // ── OŚ — reuse TimelineLayout/buildTimelineRows (ten sam zbiór co LISTA) ──────
  _computeTimelineRows() {
    const K = window.KOSMOS;
    const vm = K?.vesselManager;
    if (!vm?.getAllVessels) return { ordered: [], meta: new Map(), gameYear: 0 };
    const all = vm.getAllVessels();
    const ctx = this._dockCtx();
    const listRows = buildDockRows(all, ctx);                         // kanoniczna kolejność (alerty→ETA)
    const dockVessels = filterDockVessels(all, ctx.activeSystemId);   // TEN SAM zbiór co LISTA
    const fleets = K?.fleetSystem?.listFleets?.() ?? [];
    const gameYear = ctx.pictureCtx.gameYear;
    const tl = buildTimelineRows(dockVessels, fleets, gameYear);
    const byId = new Map(tl.map((r) => [r.entryId, r]));
    // Kolejność lane'ów = kolejność LISTY (spójność tabela↔oś); statek bez paska = pusty lane.
    const ordered = listRows.map((r) => byId.get(r.id) ?? { entryId: r.id, confidence: 'firm', bars: [] });
    const meta = new Map(listRows.map((r) => [r.id, r]));             // glif/nazwa/tone do rynny
    return { ordered, meta, gameYear };
  }

  _drawTimeline(ctx, L) {
    const C = THEME;
    const rect = L.leftRect;
    const { ordered, meta, gameYear } = this._computeTimelineRows();
    this._rowCount = ordered.length;

    const laneTop = rect.y + DOCK_TL_HEADER;
    const laneH = Math.max(0, rect.h - DOCK_TL_HEADER);
    const visible = dockVisibleRowCount(laneH, DOCK_ROW_H);
    this._visibleRows = visible;

    if (ordered.length === 0) { this._scroll = 0; this._timelineVp = null; this._drawCenterHint(ctx, rect, t('tacticalDock.empty')); return; }

    // Viewport: teraz → auto-fit najdalszego paska (clamp 4..MAX lat).
    let maxEnd = gameYear + TIMELINE_MIN_SPAN_YEARS;
    for (const r of ordered) for (const b of r.bars) if (Number.isFinite(b.t1)) maxEnd = Math.max(maxEnd, b.t1);
    const span = Math.max(4, Math.min(DOCK_TL_MAX_SPAN, (maxEnd - gameYear) * 1.1 + 0.5));
    const tlX0 = rect.x + DOCK_TL_GUTTER;
    const tlX1 = rect.x + rect.w - 8;
    const vp = defaultViewport(gameYear, tlX0, tlX1, span);
    this._timelineVp = vp;
    this._timelineArea = { x: tlX0, y: laneTop, w: tlX1 - tlX0, h: laneH };

    // Podziałka lat + linie pionowe przez region lane'ów.
    ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
    ctx.textBaseline = 'middle';
    for (const tick of timelineTicks(vp, 6)) {
      if (tick.x < tlX0 - 1 || tick.x > tlX1 + 1) continue;
      ctx.strokeStyle = 'rgba(0,255,180,0.06)';
      ctx.beginPath(); ctx.moveTo(tick.x + 0.5, laneTop); ctx.lineTo(tick.x + 0.5, rect.y + rect.h); ctx.stroke();
      ctx.fillStyle = C.textDim; ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(tick.year)), tick.x, rect.y + DOCK_TL_HEADER / 2);
    }
    const nx = nowLineX(gameYear, vp);
    if (nx !== null) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(nx + 0.5, laneTop); ctx.lineTo(nx + 0.5, rect.y + rect.h); ctx.stroke();
    }

    // Auto-scroll do wybranego (jak LISTA).
    if (this._pendingScrollToId) {
      const idx = ordered.findIndex((r) => r.entryId === this._pendingScrollToId);
      if (idx >= 0) {
        const rowTop = idx * DOCK_ROW_H, rowBot = rowTop + DOCK_ROW_H;
        if (rowTop < this._scroll) this._scroll = rowTop;
        else if (rowBot > this._scroll + laneH) this._scroll = rowBot - laneH;
      }
      this._pendingScrollToId = null;
    }
    this._scroll = clampDockScroll(this._scroll, ordered.length, visible, DOCK_ROW_H);

    const leadId = window.KOSMOS?.uiManager?.getSelectedVesselId?.();
    const laid = layoutTimelineRows(ordered, vp);

    ctx.save();
    ctx.beginPath(); ctx.rect(rect.x, laneTop, rect.w, laneH); ctx.clip();
    for (let i = 0; i < laid.length; i++) {
      const ry = laneTop + i * DOCK_ROW_H - this._scroll;
      if (ry + DOCK_ROW_H < laneTop || ry > laneTop + laneH) continue;
      this._drawTimelineLane(ctx, laid[i], meta.get(laid[i].entryId), rect, ry, leadId);
      const visTop = Math.max(ry, laneTop), visBot = Math.min(ry + DOCK_ROW_H, laneTop + laneH);
      if (visBot > visTop) this._addHit(rect.x, visTop, rect.w, visBot - visTop, 'row', { id: laid[i].entryId });
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';

    if (ordered.length > visible) {
      const thumbH = Math.max(16, laneH * visible / ordered.length);
      const maxScroll = (ordered.length - visible) * DOCK_ROW_H;
      const thumbY = laneTop + (maxScroll > 0 ? (this._scroll / maxScroll) * (laneH - thumbH) : 0);
      ctx.fillStyle = 'rgba(0,255,180,0.20)'; ctx.fillRect(rect.x + rect.w - 3, thumbY, 2, thumbH);
    }
  }

  _drawTimelineLane(ctx, laid, meta, rect, ry, leadId) {
    const C = THEME;
    const x = rect.x;
    const isLead = laid.entryId === leadId;
    const hover  = this._hoverZone?.type === 'row' && this._hoverZone?.data?.id === laid.entryId;
    if (isLead)     { ctx.fillStyle = 'rgba(0,255,180,0.12)'; ctx.fillRect(x, ry, rect.w, DOCK_ROW_H); }
    else if (hover) { ctx.fillStyle = 'rgba(0,255,180,0.05)'; ctx.fillRect(x, ry, rect.w, DOCK_ROW_H); }

    const midY = ry + DOCK_ROW_H / 2;
    // Rynna: glif (kolor tonu) + nazwa.
    if (meta) {
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = toneColor(meta.tone, C) ?? C.textPrimary;
      ctx.font = `${C.fontSizeMedium}px ${C.fontFamily}`;
      ctx.fillText(meta.glyph, x + 6, midY + 1);
      ctx.fillStyle = isLead ? C.accent : C.textPrimary;
      ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
      ctx.fillText(this._truncate(ctx, meta.name, DOCK_TL_GUTTER - 26), x + 22, midY);
    }
    // Paski misji (kolor wg rodzaju; 'moving' półprzezroczysty).
    const barY = midY - DOCK_TL_BAR_H / 2;
    for (const b of laid.bars) {
      const bw = Math.max(2, b.x1 - b.x0);
      ctx.fillStyle = _barKindColor(b.kind);
      ctx.globalAlpha = laid.confidence === 'moving' ? 0.6 : 0.9;
      ctx.fillRect(b.x0, barY, bw, DOCK_TL_BAR_H);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ── Mini-panel (4d) — karta wybranego statku / agregat multi/flota ───────────
  _drawPanel(ctx, rect) {
    const C = THEME;
    const K = window.KOSMOS;
    const um = K?.uiManager;
    const leadId = um?.getSelectedVesselId?.() ?? null;
    const ids = um?.getSelectedVesselIds?.() ?? (leadId ? [leadId] : []);
    const fleetId = um?.getSelectedFleetId?.() ?? null;
    const mode = computePanelMode({ leadId, selectedCount: ids.length, fleetId });

    const pad = 8;
    const x = rect.x + pad, w = rect.w - pad * 2;
    let cy = rect.y + pad + 10;

    if (mode === 'none') { this._drawCenterHint(ctx, rect, t('tacticalDock.selectHint')); return; }

    // Ustępowanie panelom (§1.7): flota→FleetCommandPanel, multi→FleetGroupPanel.
    if (mode === 'fleet') {
      const fleet = K?.fleetSystem?.getFleet?.(fleetId);
      this._panelHeader(ctx, x, cy, w, '⚑', fleet?.name ?? t('tacticalDock.fleetLabel'), C.accent);
      this._panelSub(ctx, x, cy + 18, w, t('tacticalDock.fleetHint'));
      return;
    }
    if (mode === 'multi') {
      this._panelHeader(ctx, x, cy, w, '⛬', t('tacticalDock.selectedN', ids.length), C.accent);
      this._panelSub(ctx, x, cy + 18, w, t('tacticalDock.multiHint'));
      return;
    }

    // single — karta statku.
    const v = K?.vesselManager?.getVessel?.(leadId);
    if (!v) { this._drawCenterHint(ctx, rect, t('tacticalDock.selectHint')); return; }
    const e = buildShipEntry(v, this._dockCtx().pictureCtx);
    if (!e) return;

    this._panelHeader(ctx, x, cy, w, e.glyph, e.name, toneColor(e.tone, C) ?? C.textPrimary);
    cy += 20;
    ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.textSecondary;
    ctx.fillText(this._truncate(ctx, `${t(`fleetPicture.role.${e.role}`)} · ${t(e.activityKey, ...(e.activityArgs ?? []))}`, w), x, cy);
    cy += 15;
    if (Number.isFinite(e.eta?.year)) {
      ctx.fillStyle = C.info;
      ctx.fillText(`${e.eta.confidence === 'moving' ? '~' : '⏱'}${Math.round(e.eta.year)}`, x, cy);
      cy += 15;
    }
    cy += 2;
    if (e.fuelPct !== null && e.fuelPct !== undefined) {
      cy = this._panelBar(ctx, x, cy, w, t('tacticalDock.fuel'), e.fuelPct,
        e.fuelPct > 0.3 ? (C.success ?? '#00ee88') : (C.warning ?? '#ffcc44'));
    }
    if (e.warpFuelPct !== null && e.warpFuelPct !== undefined) {
      cy = this._panelBar(ctx, x, cy, w, t('tacticalDock.warp'), e.warpFuelPct, '#cc88ff');
    }
    if (e.alerts?.length) {
      cy += 2;
      for (const a of e.alerts) {
        ctx.fillStyle = _alertDotColor(a.severity);
        ctx.beginPath(); ctx.arc(x + 4, cy - 3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.textSecondary; ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`; ctx.textAlign = 'left';
        ctx.fillText(this._truncate(ctx, t(`fleetPicture.alert.${a.kind}`), w - 12), x + 12, cy);
        cy += 13;
      }
    }

    // Akcje (DOKŁADNIE dwie): [✕ Anuluj rozkaz] (gdy active/blocked) + [🎯 Rejestr].
    const btnH = 20, gap = 6;
    const by = rect.y + rect.h - btnH - pad;
    const showCancel = canCancelOrder(v);
    let bx = x;
    if (showCancel) {
      const bw = (w - gap) / 2;
      this._drawButton(ctx, t('tacticalDock.cancelOrder'), bx, by, bw, btnH, 'danger');
      this._addHit(bx, by, bw, btnH, 'panelCancel', { id: v.id, label: t('tacticalDock.cancelOrder') });
      bx += bw + gap;
      this._drawButton(ctx, t('tacticalDock.showInRegistry'), bx, by, bw, btnH, 'secondary');
      this._addHit(bx, by, bw, btnH, 'panelRegistry', { id: v.id, label: t('tacticalDock.showInRegistry') });
    } else {
      this._drawButton(ctx, t('tacticalDock.showInRegistry'), bx, by, w, btnH, 'secondary');
      this._addHit(bx, by, w, btnH, 'panelRegistry', { id: v.id, label: t('tacticalDock.showInRegistry') });
    }
  }

  _panelHeader(ctx, x, y, w, glyph, name, glyphColor) {
    const C = THEME;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = glyphColor;
    ctx.font = `${C.fontSizeMedium}px ${C.fontFamily}`;
    ctx.fillText(glyph, x, y);
    ctx.fillStyle = C.accent;
    ctx.fillText(this._truncate(ctx, name, w - 18), x + 16, y);
  }

  _panelSub(ctx, x, y, w, text) {
    ctx.fillStyle = THEME.textDim; ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const words = String(text).split(' ');
    let line = '', yy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > w && line) { ctx.fillText(line, x, yy); yy += 13; line = word; }
      else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  _panelBar(ctx, x, y, w, label, pct, color) {
    const C = THEME;
    ctx.fillStyle = C.textDim; ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, y);
    const barX = x + 40, barW = Math.max(10, w - 40 - 34), barY = y - 6;
    this._drawBar(ctx, barX, barY, barW, 6, pct, color, C.border);
    ctx.fillStyle = C.textSecondary; ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(pct * 100)}%`, x + w, y);
    ctx.textAlign = 'left';
    return y + 14;
  }

  // ── Interakcja ───────────────────────────────────────────────────────────────
  _onHit(zone) {
    if (!zone) return;
    switch (zone.type) {
      case 'tab':
        if (zone.data?.id && DOCK_TABS.includes(zone.data.id) && this._tab !== zone.data.id) {
          this._tab = zone.data.id;
          this._scroll = 0;
          window.KOSMOS?.threeRenderer?.setTacticalHoverYear?.(null);   // opuszczamy OŚ → brak markera roku
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
        // 4f-3 — CTRL+klik = toggleSelection (spójnie z Outlinerem/mapą); zwykły klik = pojedyncza
        // selekcja jak dotąd. Przy ≥2 zaznaczonych mini-panel pokazuje agregat (computePanelMode),
        // a akcje zbiorcze ma FleetGroupPanel (wisi nad pasem).
        if (this._lastMouseMods?.ctrl && um?.toggleSelection) {
          um.toggleSelection(id);
          this._lastRowClickMs = 0; this._lastRowClickId = null;   // CTRL nie liczy się do dwukliku
          this._markDirty();
          return;
        }
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
      case 'panelCancel': {
        // ✕ Anuluj — TYLKO warstwa rozkazu ruchu (istniejący kanał; misje/pętle zostają w Command).
        const id = zone.data?.id;
        if (id) window.KOSMOS?.movementOrderSystem?.cancelOrder?.(id, 'player');
        this._markDirty();
        return;
      }
      case 'panelRegistry': {
        // 🎯 Pokaż w rejestrze — pomost mostek→biuro (otwarcie overlaya auto-wyłącza tryb Y).
        const id = zone.data?.id;
        const om = window.KOSMOS?.overlayManager;
        if (id && om?.openPanel) {
          window.KOSMOS?.uiManager?.setSelectedVesselId?.(id);
          om.openPanel('fleet', { view: 'registry', focusVesselId: id });
        }
        return;
      }
      // 'bg' → swallow (klik w pas nie przelatuje do mapy 3D).
    }
  }

  /** Hover wiersza → podgląd trasy/ducha (setTacticalHoverVid); hover OSI → rok→marker planety. */
  handleMouseMove(x, y) {
    if (!this.visible) return;
    const prev = this._hoverZone;
    super.handleMouseMove(x, y);   // ustawia _hoverZone
    const z = this._hoverZone;
    const hoverVid = z?.type === 'row' ? (z.data?.id ?? null) : null;
    const tr = window.KOSMOS?.threeRenderer;
    tr?.setTacticalHoverVid?.(hoverVid);
    // OŚ: rok pod kursorem (nad obszarem osi) → marker „gdzie będzie planeta celu w roku X".
    let hoverYear = null;
    if (this._tab === 'timeline' && this._timelineVp && this._timelineArea) {
      const a = this._timelineArea;
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) hoverYear = xToYear(x, this._timelineVp);
    }
    tr?.setTacticalHoverYear?.(hoverYear);
    if (prev !== z) this._markDirty();
  }

  /** Kółko nad pasem = scroll LISTY/OSI (blokuje zoom kamery). Poza pasem → false (zoom). */
  handleWheel(x, y, delta) {
    if (!this.visible) return false;
    if (!this._hitTest(x, y)) return false;   // poza pasem → nie konsumuj (zoom kamery)
    if (this._rowCount > this._visibleRows) {  // scroll wspólny dla LISTY i OSI
      this._scroll = clampDockScroll(this._scroll + delta, this._rowCount, this._visibleRows, DOCK_ROW_H);
      this._markDirty();
    }
    return true;   // nad pasem ZAWSZE konsumuj (nawet gdy nie ma czego scrollować)
  }
}
