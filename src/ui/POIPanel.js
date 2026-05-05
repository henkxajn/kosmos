// POIPanel — pełnoekranowy overlay listy POI (klawisz N)
//
// First P2 commit (M3 P2.1). Read-only consumer POIRegistry.
// Sort/filter/format → src/utils/POIPanelLogic.js (pure helpers).
// Live update przez EventBus (poi:created/updated/deleted) — invalidate cache.
//
// L23: rejestrowany w OverlayManager → one-at-a-time policy (Esc lub klawisz N zamyka).
// L31: per-type row format (icon + label + subtitle).
// L34: brak istniejącego POIPanel (V1 grep clean), budujemy od zera.

import { BaseOverlay }         from './BaseOverlay.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import EventBus                from '../core/EventBus.js';
import { t }                   from '../i18n/i18n.js';
import {
  sortPOIs, filterPOIs, formatPOIRow, getPOILocation,
  collectOwners, POI_TYPE_ORDER, TYPE_ICONS,
} from '../utils/POIPanelLogic.js';
import { showPOIModalCreate, showPOIModalEdit } from './POIModal.js';
import { showConfirmModal }                     from './ConfirmModal.js';

const HEADER_H = 36;
const FILTER_H = 32;
const SORT_H   = 28;
const ROW_H    = 44;

export class POIPanel extends BaseOverlay {
  constructor() {
    super(null);

    // Stan filtrów/sortu (efemerycznie — D2=A, save v67 unchanged)
    this._sortBy   = 'createdYear';
    this._sortDir  = 'desc';
    this._filterType  = 'all';
    this._filterOwner = 'all';
    this._scrollY = 0;

    // Cache list (invalidate on POI events)
    this._cachedRaw = null;
    this._cachedDirty = true;

    // EventBus subskrypcje — live update bez F5
    this._onPoiChanged = () => { this._cachedDirty = true; };
    EventBus.on('poi:created', this._onPoiChanged);
    EventBus.on('poi:updated', this._onPoiChanged);
    EventBus.on('poi:deleted', this._onPoiChanged);
  }

  // ── Pobierz aktualną listę POI z registry (z cache) ───────
  _getPois() {
    if (this._cachedDirty) {
      const reg = window.KOSMOS?.poiRegistry;
      this._cachedRaw = reg?.listPOIs?.() ?? [];
      this._cachedDirty = false;
    }
    return this._cachedRaw;
  }

  // ── Stan publiczny (devtools) ──────────────────────────────
  getState() {
    return {
      visible: this.visible,
      sortBy: this._sortBy,
      sortDir: this._sortDir,
      filterType: this._filterType,
      filterOwner: this._filterOwner,
      scrollY: this._scrollY,
      poiCount: this._getPois().length,
    };
  }

  // ── Rysowanie ──────────────────────────────────────────────
  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    // Tło
    ctx.fillStyle = bgAlpha(0.42);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, ow - 1, oh - 1);

    // Header
    this._drawHeader(ctx, ox, oy, ow);

    // Filter tabs (typ) + owner dropdown
    this._drawFilterBar(ctx, ox, oy + HEADER_H, ow);

    // Sort header (kolumny)
    this._drawSortBar(ctx, ox, oy + HEADER_H + FILTER_H, ow);

    // Lista POI
    const listY = oy + HEADER_H + FILTER_H + SORT_H;
    const listH = oh - HEADER_H - FILTER_H - SORT_H;
    this._drawList(ctx, ox, listY, ow, listH);
  }

  _drawHeader(ctx, x, y, w) {
    ctx.fillStyle = bgAlpha(0.55);
    ctx.fillRect(x, y, w, HEADER_H);

    ctx.font = `bold ${THEME.fontSizeMedium + 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'left';
    ctx.fillText(`📌 ${t('poi.panel.title')}`, x + 14, y + 24);

    // Liczba POI
    const total = this._getPois().length;
    const filtered = this._getFilteredSorted().length;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`${filtered}/${total}`, x + w - 80, y + 24);

    // [+ Dodaj POI] button (M3 P2.2 D3=a)
    const addBtnW = 110, addBtnH = 22;
    const addBtnX = x + w - 200, addBtnY = y + 7;
    const addHover = this._hoverZone?.type === 'add_poi';
    ctx.fillStyle = addHover ? 'rgba(0,255,180,0.12)' : 'rgba(0,255,180,0.05)';
    ctx.fillRect(addBtnX, addBtnY, addBtnW, addBtnH);
    ctx.strokeStyle = addHover ? THEME.accent : THEME.borderLight;
    ctx.lineWidth = 1;
    ctx.strokeRect(addBtnX + 0.5, addBtnY + 0.5, addBtnW - 1, addBtnH - 1);
    ctx.font = `${THEME.fontSizeSmall + 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = addHover ? THEME.accent : THEME.success;
    ctx.textAlign = 'center';
    ctx.fillText(t('poi.modal.btn.add'), addBtnX + addBtnW / 2, addBtnY + addBtnH / 2 + 4);
    ctx.textAlign = 'left';
    this._addHit(addBtnX, addBtnY, addBtnW, addBtnH, 'add_poi');

    // Close X
    const closeX = x + w - 24;
    const closeY = y + 6;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✕', closeX, closeY + 14);
    this._addHit(closeX - 4, closeY, 22, 22, 'close');
  }

  _drawFilterBar(ctx, x, y, w) {
    ctx.fillStyle = bgAlpha(0.35);
    ctx.fillRect(x, y, w, FILTER_H);

    const btnW = 38;
    const btnH = 22;
    const btnY = y + 5;
    let bx = x + 14;

    // [All] tab
    this._drawFilterBtn(ctx, bx, btnY, btnW + 8, btnH, t('poi.panel.filterAll'),
      this._filterType === 'all', { type: 'filter_type', val: 'all' });
    bx += btnW + 12;

    // 5 type icon tabs
    for (const type of POI_TYPE_ORDER) {
      this._drawFilterBtn(ctx, bx, btnY, btnW, btnH, TYPE_ICONS[type],
        this._filterType === type, { type: 'filter_type', val: type });
      bx += btnW + 4;
    }

    // Owner dropdown (right-aligned)
    const ownerW = 140;
    const ownerX = x + w - ownerW - 14;
    this._drawOwnerSelect(ctx, ownerX, btnY, ownerW, btnH);
  }

  _drawFilterBtn(ctx, x, y, w, h, label, active, hitData) {
    ctx.fillStyle = active ? 'rgba(0,255,180,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = active ? THEME.accent : THEME.borderLight;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 4);
    ctx.textAlign = 'left';
    this._addHit(x, y, w, h, hitData.type, { val: hitData.val });
  }

  _drawOwnerSelect(ctx, x, y, w, h) {
    const owners = collectOwners(this._getPois());
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.borderLight;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'left';
    const label = this._filterOwner === 'all'
      ? t('poi.panel.owner.all')
      : (this._filterOwner === 'player' ? t('poi.panel.owner.player') : this._filterOwner);
    ctx.fillText(label, x + 8, y + h / 2 + 4);

    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText('▼', x + w - 8, y + h / 2 + 4);
    ctx.textAlign = 'left';

    // Klik cyklicznie przełącza ('all' → owner1 → owner2 → ... → 'all')
    this._addHit(x, y, w, h, 'cycle_owner', { owners });
  }

  _drawSortBar(ctx, x, y, w) {
    ctx.fillStyle = bgAlpha(0.30);
    ctx.fillRect(x, y, w, SORT_H);

    const cols = [
      { key: 'name',        label: t('poi.panel.sortBy.name'),  x: x + 14,        w: 200 },
      { key: 'type',        label: t('poi.panel.sortBy.type'),  x: x + 220,       w: 120 },
      { key: 'createdYear', label: t('poi.panel.sortBy.year'),  x: x + w - 110,   w: 80  },
    ];

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    for (const c of cols) {
      const active = this._sortBy === c.key;
      ctx.fillStyle = active ? THEME.accent : THEME.textHeader;
      const arrow = active ? (this._sortDir === 'desc' ? ' ▼' : ' ▲') : '';
      ctx.fillText(c.label + arrow, c.x, y + 19);
      this._addHit(c.x - 4, y, c.w, SORT_H, 'sort', { key: c.key });
    }
  }

  _drawList(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const list = this._getFilteredSorted();

    // Clamp scrollY do [0, maxScroll] — fix dla pre-existing P2.1 bug:
    // gdy lista shrinks (delete/filter/sort), stary scrollY persystuje
    // → POI rendered poza viewport. Single source of truth w render.
    const totalRowsHeight = list.length * ROW_H + 6;  // +6 = top padding
    const maxScroll = Math.max(0, totalRowsHeight - h);
    this._maxScroll = maxScroll;  // cache dla handleScroll upper-bound clamp
    this._scrollY = Math.max(0, Math.min(this._scrollY, maxScroll));

    if (list.length === 0) {
      ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('poi.panel.empty'), x + w / 2, y + 60);
      ctx.textAlign = 'left';
      ctx.restore();
      return;
    }

    let ry = y + 6 - this._scrollY;
    for (const poi of list) {
      if (ry + ROW_H < y) { ry += ROW_H; continue; }
      if (ry > y + h)     break;

      this._drawRow(ctx, poi, x, ry, w);
      this._addHit(x + 4, ry, w - 8, ROW_H - 4, 'focus_poi', { poiId: poi.id });
      ry += ROW_H;
    }

    ctx.restore();
  }

  _drawRow(ctx, poi, x, y, w) {
    const row = formatPOIRow(poi, t);
    if (!row) return;

    // Bg (hover)
    const isHover = this._hoverZone?.type === 'focus_poi' &&
                    this._hoverZone?.data?.poiId === poi.id;
    if (isHover) {
      ctx.fillStyle = 'rgba(0,255,180,0.06)';
      ctx.fillRect(x + 4, y, w - 8, ROW_H - 4);
    }
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + ROW_H - 4);
    ctx.lineTo(x + w - 4, y + ROW_H - 4);
    ctx.stroke();

    // Icon + name
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${row.icon} ${poi.name}`, x + 14, y + 18);

    // Subtitle (per-type)
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(row.subtitle, x + 14, y + 34);

    // Type label (col 2)
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(row.label, x + 220, y + 18);
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(row.ownerLabel, x + 220, y + 34);

    // Year (right col)
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(row.meta, x + w - 14, y + 18);
    ctx.textAlign = 'left';

    // Pencil + trash icons (M3 P2.2 D4=a, D5=b dual)
    // Hit zones pushed PRZED focus_poi (które dodajemy w _drawList po _drawRow)
    // → _hitTest find() znajdzie ikony pierwsze.
    const editX  = x + w - 56;
    const trashX = x + w - 28;
    const iconY  = y + 28;
    const editHover  = this._hoverZone?.type === 'edit_poi'   && this._hoverZone?.data?.poiId === poi.id;
    const trashHover = this._hoverZone?.type === 'delete_poi' && this._hoverZone?.data?.poiId === poi.id;
    ctx.font = `14px ${THEME.fontFamily}`;
    ctx.fillStyle = editHover ? THEME.accent : THEME.textSecondary;
    ctx.fillText('✏', editX, iconY);
    ctx.fillStyle = trashHover ? THEME.danger : THEME.textSecondary;
    ctx.fillText('🗑', trashX, iconY);
    this._addHit(editX  - 4, y + 14, 20, 22, 'edit_poi',   { poiId: poi.id });
    this._addHit(trashX - 4, y + 14, 20, 22, 'delete_poi', { poiId: poi.id });
  }

  _getFilteredSorted() {
    const raw = this._getPois();
    const filtered = filterPOIs(raw, this._filterType, this._filterOwner);
    return sortPOIs(filtered, this._sortBy, this._sortDir);
  }

  // ── Klik handler ───────────────────────────────────────────
  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'filter_type':
        this._filterType = zone.data.val;
        break;
      case 'cycle_owner': {
        const owners = zone.data.owners ?? [];
        const list = ['all', ...owners];
        const i = list.indexOf(this._filterOwner);
        this._filterOwner = list[(i + 1) % list.length] ?? 'all';
        break;
      }
      case 'sort': {
        const key = zone.data.key;
        if (this._sortBy === key) {
          this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this._sortBy = key;
          this._sortDir = key === 'createdYear' ? 'desc' : 'asc';
        }
        break;
      }
      case 'focus_poi': {
        const poi = window.KOSMOS?.poiRegistry?.getPOI?.(zone.data.poiId);
        const loc = getPOILocation(poi);
        if (loc) {
          // M3 P2.3 — issue #5 fix: focusOnGameplayCoord konwertuje px → world.
          // Wcześniej focusOn(loc.x, loc.y) traktował px jako Three.js world coords
          // (mismatch — 1 AU = 110 px gameplay = 11 jednostek world; brak / WORLD_SCALE).
          const cc = window.KOSMOS?.threeRenderer?._cameraController;
          if (cc?.focusOnGameplayCoord) cc.focusOnGameplayCoord(loc);
          else if (cc?.focusOn) cc.focusOn(loc.x, loc.y);  // fallback (shouldn't trigger)
        }
        break;
      }
      // M3 P2.2 — modal CRUD routing
      case 'add_poi': {
        showPOIModalCreate('waypoint');  // EventBus poi:created → _onPoiChanged refresh
        break;
      }
      case 'edit_poi': {
        const poi = window.KOSMOS?.poiRegistry?.getPOI?.(zone.data.poiId);
        if (poi) showPOIModalEdit(poi);
        break;
      }
      case 'delete_poi': {
        const poi = window.KOSMOS?.poiRegistry?.getPOI?.(zone.data.poiId);
        if (!poi) break;
        showConfirmModal({
          title:        t('poi.confirm.delete.title'),
          message:      `${t('poi.confirm.delete.message')} "${poi.name}"?`,
          confirmLabel: t('poi.confirm.delete.confirmBtn'),
          danger:       true,
        }).then((ok) => {
          if (ok) window.KOSMOS?.poiRegistry?.deletePOI?.(poi.id);
        });
        break;
      }
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    // Upper-bound clamp używa _maxScroll cached w poprzednim _drawList.
    // Fallback Infinity przy pierwszym scroll przed render — render i tak clampuje.
    const max = this._maxScroll ?? Infinity;
    this._scrollY = Math.max(0, Math.min(this._scrollY + delta * 0.6, max));
    return true;
  }
}
