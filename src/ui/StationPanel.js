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
const PW        = 220;   // szerokość karty
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
      this.show();
      this._markDirty();
    });
    EventBus.on('station:destroyed', (e) => {
      if (e?.stationId === this._stationId) { this.hide(); this._markDirty(); }
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
    const station = this._station();
    if (!station) { this.hide(); return; }   // stacja zniknęła (destroy w trakcie) — self-heal
    this._hitZones = [];

    const C = THEME;
    const depot = classifyStationDepot([...(station.depot?.inventory ?? [])]);
    const traders = gatherStationTraders(this._stationId, {
      vesselManager: window.KOSMOS?.vesselManager,
      missionSystem: window.KOSMOS?.missionSystem,
    });
    const lines = this._buildLines(station, depot, traders);

    // Wysokość karty z treści (separatory + przyciski liczone osobno).
    let bodyH = 0;
    for (const ln of lines) bodyH += ln.sep ? SEP_H : (ln.btn ? BTN_H : LH);
    const PH = HEADER_H + PAD + bodyH + PAD;

    // Kotwica: ekranowa pozycja stacji + offset; null (za kamerą) → fallback lewy-górny róg mapy.
    const b  = this._getOverlayBounds(W, H);
    const sp = window.KOSMOS?.threeRenderer?.getStationScreenPosition?.(this._stationId);
    let ax, ay;
    if (sp) { ax = sp.x + 18;     ay = sp.y - PH / 2; }
    else    { ax = b.ox + 12;     ay = b.oy + 12; }
    // C1 (S3.4b) — drag override kotwicy; place() clampuje panel do obszaru mapy.
    const { px, py } = this._float.place(ax, ay, PW, PH, b);
    // Rect + strefa-drag (pas nagłówka POZA przyciskami [✏][✕]) do przeciągania (tryBeginDrag).
    this._lastRect = { px, py, PW, PH, b, dragZone: { x: px, y: py, w: PW - 46, h: HEADER_H } };

    // Tło + ramka
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(px, py, PW, PH);
    ctx.strokeStyle = C.borderActive ?? C.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, PW - 1, PH - 1);

    // Header: nazwa + przyciski [✏][✕]
    const btn = 18;
    const closeX  = px + PW - btn - 4;
    const renameX = closeX - btn - 4;
    ctx.fillStyle = C.accent;
    ctx.font = `${C.fontSizeSmall + 1}px ${C.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(this._truncate(ctx, station.name ?? '—', renameX - (px + PAD) - 6), px + PAD, py + 16);
    this._drawIconBtn(ctx, '✏', renameX, py + 3, btn, 'rename');
    this._drawIconBtn(ctx, '✕', closeX,  py + 3, btn, 'close');

    // Separator pod headerem
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(px, py + HEADER_H); ctx.lineTo(px + PW, py + HEADER_H); ctx.stroke();

    // Wiersze
    let cy = py + HEADER_H + PAD;
    ctx.font = `${C.fontSizeSmall}px ${C.fontFamily}`;
    for (const ln of lines) {
      if (ln.sep) {
        ctx.strokeStyle = C.border;
        ctx.beginPath(); ctx.moveTo(px + PAD, cy + 2); ctx.lineTo(px + PW - PAD, cy + 2); ctx.stroke();
        cy += SEP_H;
        continue;
      }
      if (ln.btn) {
        // Przycisk pełnej szerokości (S3.4 FAZA 3 — „Zarządzaj" → ColonyOverlay w trybie stacji).
        const bx = px + PAD, bw = PW - PAD * 2, bh = BTN_H - 4;
        const hover = this._hoverZone?.type === ln.type;
        ctx.fillStyle = hover ? 'rgba(0,255,180,0.14)' : 'rgba(0,255,180,0.07)';
        ctx.fillRect(bx, cy, bw, bh);
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, cy + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = C.accent; ctx.textAlign = 'center';
        ctx.fillText(ln.text, px + PW / 2, cy + bh / 2 + 4);
        ctx.textAlign = 'left';
        this._addHit(bx, cy, bw, bh, ln.type);
        cy += BTN_H;
        continue;
      }
      const indent = ln.indent ?? 0;
      ctx.fillStyle = ln.color ?? C.textSecondary;
      ctx.fillText(this._truncate(ctx, ln.text, PW - PAD * 2 - indent), px + PAD + indent, cy + 11);
      cy += LH;
    }

    // Tło jako hit-zone NA KOŃCU — _hitTest=Array.find, przyciski (dodane wyżej) mają priorytet;
    // tło tylko konsumuje kliki w panel (nie przelatują do 3D/overlay pod spodem). S4-1 gotcha.
    this._addHit(px, py, PW, PH, 'bg');
  }

  /** Zbuduj listę wierszy treści (sekcje + dane). */
  _buildLines(station, depot, traders) {
    const C = THEME;
    const lines = [];

    // Właściciel
    const owner = station.ownerEmpireId === 'player'
      ? t('station.ownerPlayer')
      : (window.KOSMOS?.empireRegistry?.get?.(station.ownerEmpireId)?.name ?? station.ownerEmpireId);
    lines.push({ text: owner, color: C.textSecondary });
    lines.push({ sep: true });

    // Status: orbita / układ / tier / rok
    const body = EntityManager.get(station.bodyId);
    lines.push({ text: `${t('station.orbit')}: ${body?.name ?? station.bodyId ?? '—'}`, color: C.textSecondary });
    lines.push({ text: `${t('station.system')}: ${station.systemId ?? '—'}`, color: C.textDim });
    lines.push({ text: `${t('station.tier')}: ${station.tier ?? 1}`, color: C.textDim });
    lines.push({ text: `${t('station.created')}: ${Math.round(station.createdYear ?? 0)}`, color: C.textDim });
    lines.push({ sep: true });

    // Depot
    lines.push({ text: t('station.depot'), color: C.accent });
    if (depot.resources.length === 0 && depot.commodities.length === 0) {
      lines.push({ text: t('station.depotEmpty'), color: C.textDim, indent: 8 });
    } else {
      if (depot.resources.length) {
        lines.push({ text: t('station.resources'), color: C.textDim, indent: 4 });
        for (const [id, amt] of depot.resources) {
          lines.push({ text: `${this._itemLabel(id)}: ${this._fmt(amt)}`, color: C.textSecondary, indent: 12 });
        }
      }
      if (depot.commodities.length) {
        lines.push({ text: t('station.commodities'), color: C.textDim, indent: 4 });
        for (const [id, amt] of depot.commodities) {
          lines.push({ text: `${this._itemLabel(id)}: ${this._fmt(amt)}`, color: C.textSecondary, indent: 12 });
        }
      }
    }
    lines.push({ sep: true });

    // Handel (live snapshot)
    lines.push({ text: t('station.traders'), color: C.accent });
    if (traders.length === 0) {
      lines.push({ text: t('station.tradersNone'), color: C.textDim, indent: 8 });
    } else {
      for (const tr of traders) {
        lines.push({ text: `${tr.name} — ${t(STATUS_KEY[tr.status] ?? 'station.statusDocked')}`, color: C.textSecondary, indent: 8 });
      }
    }
    lines.push({ sep: true });

    // Moduły — podsumowanie (S3.4 FAZA 3): POP + lista aktywnych modułów + przycisk „Zarządzaj".
    lines.push({ text: t('station.modules'), color: C.accent });
    lines.push({ text: `👥 ${station.pop ?? 0}/${station.popCapacity}   🛠 ${station.hasActiveShipyard ? '✓' : '—'}`, color: C.textSecondary, indent: 8 });
    const mods = station.modules ?? [];
    if (mods.length === 0) {
      lines.push({ text: t('station.mgmt.noModules'), color: C.textDim, indent: 8 });
    } else {
      const lang = getLocale();
      for (const m of mods.slice(0, 6)) {
        const def = STATION_MODULES[m.moduleType];
        const nm = (lang === 'en' ? def?.nameEN : def?.namePL) ?? m.moduleType;
        const badge = m.active === false ? (m.inactiveReason === 'no_crew' ? '👥✗' : '⚡✗') : '✓';
        lines.push({ text: `${def?.icon ?? '▪'} ${nm} ${badge}`, color: m.active === false ? C.textDim : C.textSecondary, indent: 8 });
      }
      if (mods.length > 6) lines.push({ text: `+${mods.length - 6}…`, color: C.textDim, indent: 8 });
    }
    lines.push({ btn: true, text: `🛰 ${t('station.mgmt.manage')}`, type: 'manage' });

    return lines;
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
}
