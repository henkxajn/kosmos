// StationPanel — lekki pływający panel informacyjny stacji orbitalnej (S4-2).
//
// Non-exclusive (wzór CombatHUD): trzymany BEZPOŚREDNIO przez UIManager, rysowany PO
// overlayManager → współistnieje z colony panelem i widokiem 3D (NIE w OverlayManager,
// który jest single-active). Self-managed: sam subskrybuje cykl życia (station:selected →
// open, body:deselected / station:destroyed → close). Pozycja ANCHORED do ekranowej
// pozycji stacji (podąża za orbitującym ciałem) z clampem do obszaru mapy.
//
// Zawartość: nazwa (+rename) / właściciel / orbita-tier-rok / depot (surowce vs towary) /
// handel (live snapshot statków) / placeholder modułów. Brak historii przepływów (audyt §4).

import { BaseOverlay }            from './BaseOverlay.js';
import { FloatingPanel }          from './FloatingPanel.js';
import { THEME, bgAlpha }         from '../config/ThemeConfig.js';
import EventBus                   from '../core/EventBus.js';
import EntityManager              from '../core/EntityManager.js';
import { t, getLocale }           from '../i18n/i18n.js';
import { showRenameModal }        from './ModalInput.js';
import { COMMODITIES }            from '../data/CommoditiesData.js';
import { STATION_MODULES }        from '../data/StationModuleData.js';
import { classifyStationDepot, gatherStationTraders } from './StationPanelLogic.js';

// Wymiary
const PW        = 440;   // C3 (S3.4b) — 2× szersza karta (dwie kolumny: właściciel/depot | handel/moduły)
const PAD       = 8;
const LH        = 15;    // wysokość wiersza
const HEADER_H  = 24;    // nazwa + przyciski
const SEP_H     = 7;     // wysokość separatora
const BTN_H     = 24;    // wysokość wiersza-przycisku (S3.4 FAZA 3 — „Zarządzaj")

// Mapowanie statusu kuriera → klucz i18n
const STATUS_KEY = {
  inbound:  'station.statusInbound',
  docked:   'station.statusDocked',
  outbound: 'station.statusOutbound',
};

export class StationPanel extends BaseOverlay {
  constructor() {
    super(null);
    this._stationId = null;
    this._float = new FloatingPanel();   // C1 (S3.4b) — drag za nagłówek
    this._lastRect = null;               // {px,py,PW,PH,b,dragZone} z ostatniego draw (drag hit-test)

    // Self-managed cykl życia (decyzja S4-2: wiring w panelu, nie w UIManager).
    EventBus.on('station:selected', (e) => {
      const nid = e?.stationId ?? null;
      if (nid !== this._stationId) this._float.reanchor();   // C1 — nowa stacja → wróć do kotwicy
      this._stationId = nid;
      this._float.minimized = false;   // C2 — pokazanie stacji un-minimizuje
      const dock = window.KOSMOS?.panelDock;
      if (nid && dock?.has?.('station:' + nid)) dock.unregister('station:' + nid);   // C2 — była zadokowana → zdejmij belkę
      this.show();
      this._markDirty();
    });
    EventBus.on('station:destroyed', (e) => {
      const sid = e?.stationId;
      window.KOSMOS?.panelDock?.unregister?.('station:' + sid);   // C2 — zdejmij belkę zniszczonej stacji
      if (sid === this._stationId) { this.hide(); this._float.minimized = false; this._markDirty(); }
    });
    EventBus.on('body:deselected', () => {
      if (this.visible) { this.hide(); this._markDirty(); }
    });
  }

  // ── Helpery stanu ─────────────────────────────────────────────────────────
  _station() {
    if (!this._stationId) return null;
    const s = EntityManager.get(this._stationId);
    return (s && s.type === 'station') ? s : null;
  }

  _markDirty() {
    const um = window.KOSMOS?.uiManager;
    if (um) um._dirty = true;
  }

  /** Lokalna nazwa towaru wg locale (surowce: id neutralny Fe/Ti/Si…). */
  _itemLabel(id) {
    const def = COMMODITIES[id];
    if (!def) return id;
    return getLocale() === 'en' ? (def.nameEN ?? def.namePL ?? id) : (def.namePL ?? id);
  }

  _fmt(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  }

  // ── Rysowanie ──────────────────────────────────────────────────────────────
  draw(ctx, W, H) {
    if (!this.visible) return;
    if (this._float.minimized) { this._hitZones = []; return; }   // C2 — zadokowana: karty nie rysujemy (belka w PanelDock)
    const station = this._station();
    if (!station) { this.hide(); return; }   // stacja zniknęła (destroy w trakcie) — self-heal
    this._hitZones = [];

    const C = THEME;
    const depot = classifyStationDepot([...(station.depot?.inventory ?? [])]);
    const traders = gatherStationTraders(this._stationId, {
      vesselManager: window.KOSMOS?.vesselManager,
      missionSystem: window.KOSMOS?.missionSystem,
    });
    const { left, right } = this._buildColumns(station, depot, traders);

    // Wysokość kolumny (sep=SEP_H, wiersz=LH); body = wyższa z dwóch kolumn.
    const colH  = (arr) => arr.reduce((h, ln) => h + (ln.sep ? SEP_H : LH), 0);
    const bodyH = Math.max(colH(left), colH(right));
    const PH = HEADER_H + PAD + bodyH + PAD + BTN_H + PAD;   // header + kolumny + „Zarządzaj"

    // Kotwica: ekranowa pozycja stacji + offset; null (za kamerą) → fallback lewy-górny róg mapy.
    const b  = this._getOverlayBounds(W, H);
    const sp = window.KOSMOS?.threeRenderer?.getStationScreenPosition?.(this._stationId);
    let ax, ay;
    if (sp) { ax = sp.x + 18;     ay = sp.y - PH / 2; }
    else    { ax = b.ox + 12;     ay = b.oy + 12; }
    // C1 (S3.4b) — drag override kotwicy; place() clampuje panel do obszaru mapy.
    const { px, py } = this._float.place(ax, ay, PW, PH, b);
    // Rect + strefa-drag (pas nagłówka POZA przyciskami [✏][▼][✕]) do przeciągania (tryBeginDrag).
    this._lastRect = { px, py, PW, PH, b, dragZone: { x: px, y: py, w: PW - 70, h: HEADER_H } };

    // Tło + ramka
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(px, py, PW, PH);
    ctx.strokeStyle = C.borderActive ?? C.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, PW - 1, PH - 1);

    // Header: nazwa + przyciski [✏][▼][✕]  (▼ = minimalizuj do doku, C2)
    const btn = 18;
    const closeX  = px + PW - btn - 4;
    const minX    = closeX - btn - 4;
    const renameX = minX - btn - 4;
    ctx.fillStyle = C.accent;
    ctx.font = `${C.fontSizeSmall + 1}px ${C.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(this._truncate(ctx, station.name ?? '—', renameX - (px + PAD) - 6), px + PAD, py + 16);
    this._drawIconBtn(ctx, '✏', renameX, py + 3, btn, 'rename');
    this._drawIconBtn(ctx, '▼', minX,    py + 3, btn, 'minimize');
    this._drawIconBtn(ctx, '✕', closeX,  py + 3, btn, 'close');

    // Separator pod headerem
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(px, py + HEADER_H); ctx.lineTo(px + PW, py + HEADER_H); ctx.stroke();

    // ── Dwie kolumny (C3): lewa = właściciel/orbita/depot, prawa = handel/moduły ──
    const colW = (PW - PAD * 3) / 2;
    const topY = py + HEADER_H + PAD;
    this._drawColumn(ctx, left,  px + PAD,            topY, colW);
    this._drawColumn(ctx, right, px + PAD * 2 + colW, topY, colW);
    // Pionowy separator między kolumnami
    ctx.strokeStyle = C.border;
    const sepX = px + PAD * 1.5 + colW;
    ctx.beginPath(); ctx.moveTo(sepX, topY - 2); ctx.lineTo(sepX, topY + bodyH); ctx.stroke();

    // Przycisk „Zarządzaj" (pełna szerokość, na dole) → ColonyOverlay w trybie stacji.
    const mby = py + HEADER_H + PAD + bodyH + PAD;
    const mbx = px + PAD, mbw = PW - PAD * 2, mbh = BTN_H - 4;
    const mHover = this._hoverZone?.type === 'manage';
    ctx.fillStyle = mHover ? 'rgba(0,255,180,0.14)' : 'rgba(0,255,180,0.07)';
    ctx.fillRect(mbx, mby, mbw, mbh);
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
    ctx.strokeRect(mbx + 0.5, mby + 0.5, mbw - 1, mbh - 1);
    ctx.fillStyle = C.accent; ctx.textAlign = 'center';
    ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
    ctx.fillText(`🛰 ${t('station.mgmt.manage')}`, px + PW / 2, mby + mbh / 2 + 4);
    ctx.textAlign = 'left';
    this._addHit(mbx, mby, mbw, mbh, 'manage');

    // Tło jako hit-zone NA KOŃCU — _hitTest=Array.find, przyciski (dodane wyżej) mają priorytet. S4-1 gotcha.
    this._addHit(px, py, PW, PH, 'bg');
  }

  // Rysuj jedną kolumnę listy wierszy (sep / text z indentem). C3.
  _drawColumn(ctx, lines, x, topY, colW) {
    const C = THEME;
    ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
    let cy = topY;
    for (const ln of lines) {
      if (ln.sep) {
        ctx.strokeStyle = C.border;
        ctx.beginPath(); ctx.moveTo(x, cy + 2); ctx.lineTo(x + colW, cy + 2); ctx.stroke();
        cy += SEP_H;
        continue;
      }
      const indent = ln.indent ?? 0;
      ctx.fillStyle = ln.color ?? C.textSecondary;
      ctx.textAlign = 'left';
      ctx.fillText(this._truncate(ctx, ln.text, colW - indent - 2), x + indent, cy + 11);
      cy += LH;
    }
  }

  /** Zbuduj treść dwóch kolumn (C3): { left, right }. Manage rysowany osobno (full-width). */
  _buildColumns(station, depot, traders) {
    const C = THEME;
    const left = [], right = [];

    // ── LEWA: właściciel + status + depot ──
    const owner = station.ownerEmpireId === 'player'
      ? t('station.ownerPlayer')
      : (window.KOSMOS?.empireRegistry?.get?.(station.ownerEmpireId)?.name ?? station.ownerEmpireId);
    left.push({ text: owner, color: C.textSecondary });
    const body = EntityManager.get(station.bodyId);
    left.push({ text: `${t('station.orbit')}: ${body?.name ?? station.bodyId ?? '—'}`, color: C.textSecondary });
    left.push({ text: `${t('station.system')}: ${station.systemId ?? '—'}`, color: C.textDim });
    left.push({ text: `${t('station.tier')}: ${station.tier ?? 1}`, color: C.textDim });
    left.push({ text: `${t('station.created')}: ${Math.round(station.createdYear ?? 0)}`, color: C.textDim });
    left.push({ sep: true });
    left.push({ text: t('station.depot'), color: C.accent });
    if (depot.resources.length === 0 && depot.commodities.length === 0) {
      left.push({ text: t('station.depotEmpty'), color: C.textDim, indent: 8 });
    } else {
      if (depot.resources.length) {
        left.push({ text: t('station.resources'), color: C.textDim, indent: 4 });
        for (const [id, amt] of depot.resources) {
          left.push({ text: `${this._itemLabel(id)}: ${this._fmt(amt)}`, color: C.textSecondary, indent: 12 });
        }
      }
      if (depot.commodities.length) {
        left.push({ text: t('station.commodities'), color: C.textDim, indent: 4 });
        for (const [id, amt] of depot.commodities) {
          left.push({ text: `${this._itemLabel(id)}: ${this._fmt(amt)}`, color: C.textSecondary, indent: 12 });
        }
      }
    }

    // ── PRAWA: handel + moduły ──
    right.push({ text: t('station.traders'), color: C.accent });
    if (traders.length === 0) {
      right.push({ text: t('station.tradersNone'), color: C.textDim, indent: 8 });
    } else {
      for (const tr of traders) {
        right.push({ text: `${tr.name} — ${t(STATUS_KEY[tr.status] ?? 'station.statusDocked')}`, color: C.textSecondary, indent: 8 });
      }
    }
    right.push({ sep: true });
    right.push({ text: t('station.modules'), color: C.accent });
    right.push({ text: `👥 ${station.pop ?? 0}/${station.popCapacity}   🛠 ${station.hasActiveShipyard ? '✓' : '—'}`, color: C.textSecondary, indent: 8 });
    const mods = station.modules ?? [];
    if (mods.length === 0) {
      right.push({ text: t('station.mgmt.noModules'), color: C.textDim, indent: 8 });
    } else {
      const lang = getLocale();
      for (const m of mods) {   // C3 — pełna lista (kolumna daje miejsce; brak „+N…")
        const def = STATION_MODULES[m.moduleType];
        const nm = (lang === 'en' ? def?.nameEN : def?.namePL) ?? m.moduleType;
        const badge = m.active === false ? (m.inactiveReason === 'no_crew' ? '👥✗' : '⚡✗') : '✓';
        right.push({ text: `${def?.icon ?? '▪'} ${nm} ${badge}`, color: m.active === false ? C.textDim : C.textSecondary, indent: 8 });
      }
    }

    return { left, right };
  }

  _drawIconBtn(ctx, glyph, x, y, size, type) {
    const hover = this._hoverZone?.type === type;
    ctx.strokeStyle = hover ? THEME.accent : THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size, size);
    ctx.fillStyle = hover ? THEME.accent : THEME.textSecondary;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(glyph, x + size / 2, y + size / 2 + 4);
    ctx.textAlign = 'left';
    this._addHit(x, y, size, size, type);
  }

  _truncate(ctx, text, maxW) {
    text = String(text ?? '');
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  // ── Interakcja ──────────────────────────────────────────────────────────────
  _onHit(zone) {
    if (!zone) return;
    if (zone.type === 'close') { this.hide(); this._markDirty(); return; }
    if (zone.type === 'minimize') { this._minimize(); return; }   // C2 — do doku
    if (zone.type === 'rename') {
      const st = this._station();
      if (!st) return;
      const sid = this._stationId;
      // Kanoniczny modal (mirror vessel rename) → event do StationSystem._renameStation.
      showRenameModal(st.name ?? '').then((n) => {
        const nm = n?.trim();
        if (nm) EventBus.emit('station:rename', { stationId: sid, name: nm });
        this._markDirty();
      });
      return;
    }
    if (zone.type === 'manage') {
      // S3.4 FAZA 3 — otwórz ColonyOverlay w TRYBIE STACJI (colonyId = fallback aktywnej kolonii gracza,
      // żeby tab bar/globus miały valid stan; render idzie ekranem stacji). Bez switchActiveColony.
      const st = this._station();
      if (!st) return;
      const colMgr = window.KOSMOS?.colonyManager;
      const colonyId = colMgr?.activePlanetId ?? window.KOSMOS?.homePlanet?.id ?? null;
      window.KOSMOS?.overlayManager?.openPanel?.('colony', { colonyId, stationMode: true, stationId: st.id });
      // B3 fix: schowaj pływający panel (nie wisi nad overlayem). Nie wróci sam — re-show tylko
      // przez station:selected (ponowny klik stacji na 3D po zamknięciu overlaya).
      this.hide();
      this._markDirty();
      return;
    }
    // 'bg' → swallow (klik w panel nie przelatuje niżej).
  }

  // ── Drag za nagłówek (C1, S3.4b) — router w UIManager woła mousedown/move/up ──
  tryBeginDrag(x, y) {
    const r = this._lastRect;
    if (!this.visible || this._float.minimized || !r) return false;
    const z = r.dragZone;
    if (x < z.x || x > z.x + z.w || y < z.y || y > z.y + z.h) return false;
    this._float.beginDrag(x, y, r.px, r.py);
    return true;
  }

  handleDragMove(x, y) {
    const r = this._lastRect;
    if (!r || !this._float.isDragging()) return false;
    const moved = this._float.updateDrag(x, y, r.PW, r.PH, r.b);
    if (moved) this._markDirty();
    return moved;
  }

  endDrag() { return this._float.endDrag(); }
  isDraggingPanel() { return this._float.isDragging(); }

  // ── Minimalizacja do doku (C2, S3.4b) — belka w PanelDock, restore = klik belki ──
  _minimize() {
    const st = this._station();
    const dock = window.KOSMOS?.panelDock;
    if (!st || !dock) return;
    const sid = this._stationId;
    this._float.minimized = true;
    dock.register('station:' + sid, {
      icon: '🛰',
      label: st.name ?? '—',
      restorePos: this._float.dragPos ? { ...this._float.dragPos } : null,   // przywróć na poprzednią pozycję
      onRestore: () => this._restoreFromDock(sid),
    });
    this._markDirty();
  }

  _restoreFromDock(sid) {
    const dock = window.KOSMOS?.panelDock;
    const entry = dock?.get?.('station:' + sid);
    this._stationId = sid;
    this._float.dragPos = entry?.restorePos ? { ...entry.restorePos } : null;
    this._float.minimized = false;
    this.show();
    dock?.unregister?.('station:' + sid);
    this._markDirty();
  }
}
