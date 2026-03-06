// FleetTabPanel — zakładka "Flota" w CivPanel (3-kolumnowy layout)
//
// Layout: LEFT (lista statków + katalog ciał) | CENTER (mapa schematyczna) | RIGHT (szczegóły/akcje/konfigurator)
// Logika misji delegowana do MissionSystem + FleetActions.

import { THEME } from '../config/ThemeConfig.js';
import { SHIPS }           from '../data/ShipsData.js';
import { getAvailableActions, FLEET_ACTIONS } from '../data/FleetActions.js';
import EntityManager       from '../core/EntityManager.js';
import EventBus            from '../core/EventBus.js';
import { DistanceUtils }   from '../utils/DistanceUtils.js';
import { showCargoLoadModal } from '../ui/CargoLoadModal.js';
import { showRenameModal }    from '../ui/ModalInput.js';
import { drawMiniBar }     from '../ui/CivPanelDrawer.js';

// ── Helper: znajdź ciało niebieskie po ID ────────────────────────────────────
const _BODY_TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];
function _findBody(id) {
  if (!id) return null;
  for (const t of _BODY_TYPES) {
    for (const b of EntityManager.getByType(t)) {
      if (b.id === id) return b;
    }
  }
  return null;
}

// ── Stałe layoutu ────────────────────────────────────────────────────────────
const LEFT_W    = 260;
const RIGHT_W   = 280;

// Kolory statusów statków
const STATUS_COLORS = {
  docked:     () => THEME.success,
  in_transit: () => THEME.warning,
  orbiting:   () => THEME.mint,
};

const STATUS_ICONS = {
  idle:       '✓',
  on_mission: '→',
  orbiting:   '⊙',
  refueling:  '⚡',
};

const FILTER_BTNS = [
  { id: 'all',    label: 'WSZYSTKIE' },
  { id: 'science_vessel', label: '🔬' },
  { id: 'cargo_ship',     label: '📦' },
  { id: 'colony_ship',    label: '🏠' },
  { id: 'here',           label: '• TU' },
];

// Kolory alias — krótsze odwołania do THEME
const C = {
  get bg()     { return THEME.bgPrimary; },
  get border() { return THEME.border; },
  get title()  { return THEME.accent; },
  get label()  { return THEME.textLabel; },
  get text()   { return THEME.textSecondary; },
  get bright() { return THEME.textPrimary; },
  get green()  { return THEME.success; },
  get red()    { return THEME.danger; },
  get orange() { return THEME.warning; },
  get yellow() { return THEME.yellow; },
  get blue()   { return THEME.info; },
  get mint()   { return THEME.mint; },
  get dim()    { return THEME.textDisabled; },
};

function _truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max - 1) + '…' : str;
}

function _shortYear(y) {
  if (y >= 1e9) return (y / 1e9).toFixed(1) + 'G';
  if (y >= 1e6) return (y / 1e6).toFixed(1) + 'M';
  if (y >= 1e4) return (y / 1e3).toFixed(0) + 'k';
  return String(Math.round(y));
}

function _actionStyle(actionId, ok) {
  if (!ok) return { bg: 'rgba(20,20,30,0.5)', fg: THEME.textDisabled, border: THEME.border };
  if (actionId === 'return_home') return { bg: 'rgba(100,40,20,0.5)', fg: THEME.warning, border: THEME.warning };
  if (actionId === 'abort_mission') return { bg: 'rgba(80,20,20,0.5)', fg: THEME.danger, border: THEME.danger };
  return { bg: 'rgba(20,40,60,0.7)', fg: THEME.textPrimary, border: THEME.borderActive };
}

// ══════════════════════════════════════════════════════════════════════════════
// FleetTabPanel
// ══════════════════════════════════════════════════════════════════════════════

export class FleetTabPanel {
  constructor() {
    this._filter  = 'all';
    this._shipScrollY = 0;        // scroll listy statków (LEFT góra)
    this._catalogScrollY = 0;     // scroll katalogu ciał (LEFT dół)
    this._selectedVesselId = null;
    this._hoverVesselId = null;
    this._missionConfig = null;   // null | { actionId, targetId, step:'select'|'confirm' }
    this._targetScrollOffset = 0; // scroll listy celów (RIGHT)
    this._rightScrollY = 0;       // scroll prawej kolumny
    this._mapToggles = { routes: true, range: false };
    this._hitZones = [];          // { x,y,w,h, type, data }
    this._bounds = null;          // { x,y,w,h } — cały panel
    this._cachedTargets = null;
    this._cachedTargetsKey = '';

    // Mapa — zoom i pan
    this._mapZoom = 1.0;
    this._mapPanX = 0;
    this._mapPanY = 0;
    this._mapBounds = null;       // { x,y,w,h } — bounds mapy

    // Tooltip ciała na mapie
    this._mapHoverBody = null;

    // Drag mapy
    this._mapDragging = false;
    this._mapDragStartX = 0;
    this._mapDragStartY = 0;
    this._mapDragWasDrag = false;

    // Cache katalogu
    this._catalogRowRects = [];
    this._catalogContentH = 0;
    this._catalogVisibleH = 0;

    // Cache statków
    this._shipContentH = 0;
    this._shipVisibleH = 0;

    // Wymiary sekcji lewej kolumny (do scroll dispatch)
    this._leftShipRect  = null;   // { y, h }
    this._leftCatRect   = null;   // { y, h }
  }

  // ── Reset stanu przy zmianie zakładki ──────────────────────────────────────
  reset() {
    this._missionConfig = null;
    this._mapHoverBody = null;
    this._mapDragging = false;
    this._mapDragWasDrag = false;
    this._catalogScrollY = 0;
    this._shipScrollY = 0;
    this._targetScrollOffset = 0;
    this._rightScrollY = 0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Główne rysowanie
  // ══════════════════════════════════════════════════════════════════════════
  draw(ctx, x, y, w, h) {
    this._bounds = { x, y, w, h };
    this._hitZones = [];

    const leftW = LEFT_W;
    const rightW = RIGHT_W;
    const centerW = Math.max(100, w - leftW - rightW);
    const leftX = x;
    const centerX = x + leftW;
    const rightX = x + leftW + centerW;

    const vMgr = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const allVessels = vMgr?.getAllVessels() ?? [];
    const filtered = this._filterVessels(allVessels, activePid);

    // ── LEFT: lista statków (góra) + katalog ciał (dół) ──
    this._drawLeft(ctx, leftX, y, leftW, h, filtered, activePid);

    // ── CENTER: mapa schematyczna ──
    this._drawCenter(ctx, centerX, y, centerW, h, allVessels);

    // ── RIGHT: szczegóły / konfigurator (lub pusty) ──
    this._drawRight(ctx, rightX, y, rightW, h);

    // Separatory kolumn
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(centerX, y); ctx.lineTo(centerX, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rightX, y); ctx.lineTo(rightX, y + h); ctx.stroke();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Obsługa zdarzeń
  // ══════════════════════════════════════════════════════════════════════════
  handleClick(mx, my) {
    if (!this._bounds) return false;
    const b = this._bounds;
    if (mx < b.x || mx > b.x + b.w || my < b.y || my > b.y + b.h) return false;

    for (let i = this._hitZones.length - 1; i >= 0; i--) {
      const z = this._hitZones[i];
      if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._handleHit(z);
        return true;
      }
    }
    return true;
  }

  handleScroll(delta, mx, my) {
    if (!this._bounds) return false;
    const b = this._bounds;
    if (mx < b.x || mx > b.x + b.w || my < b.y || my > b.y + b.h) return false;

    const leftW = LEFT_W;
    const rightW = RIGHT_W;
    const centerX = b.x + leftW;
    const rightX = b.x + b.w - rightW;

    // LEFT: dwie strefy scrollu
    if (mx < centerX) {
      // Strefa listy statków (góra)
      if (this._leftShipRect && my >= this._leftShipRect.y && my < this._leftShipRect.y + this._leftShipRect.h) {
        const maxScroll = Math.max(0, this._shipContentH - this._shipVisibleH);
        this._shipScrollY = Math.max(0, Math.min(maxScroll, this._shipScrollY + delta * 0.5));
        return true;
      }
      // Strefa katalogu (dół)
      if (this._leftCatRect && my >= this._leftCatRect.y && my < this._leftCatRect.y + this._leftCatRect.h) {
        const maxScroll = Math.max(0, this._catalogContentH - this._catalogVisibleH);
        this._catalogScrollY = Math.max(0, Math.min(maxScroll, this._catalogScrollY + delta * 0.5));
        return true;
      }
      return true;
    }

    // CENTER: zoom mapy
    if (mx >= centerX && mx < rightX) {
      const zoomFactor = delta > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.5, Math.min(8, this._mapZoom * zoomFactor));
      if (this._mapBounds) {
        const mb = this._mapBounds;
        const relX = (mx - mb.x) / mb.w - 0.5;
        const relY = (my - mb.y) / mb.h - 0.5;
        const dzoom = newZoom - this._mapZoom;
        const maxAU = this._getMaxOrbitalAU();
        this._mapPanX -= relX * maxAU * 2 * dzoom / newZoom * 0.3;
        this._mapPanY -= relY * maxAU * 2 * dzoom / newZoom * 0.3;
      }
      this._mapZoom = newZoom;
      return true;
    }

    // RIGHT: scroll
    if (mx >= rightX) {
      if (this._missionConfig?.step === 'select') {
        this._targetScrollOffset = Math.max(0, this._targetScrollOffset + delta * 0.5);
      } else {
        this._rightScrollY = Math.max(0, this._rightScrollY + delta * 0.5);
      }
      return true;
    }
    return true;
  }

  handleMouseDown(mx, my) {
    if (!this._bounds) return;
    if (this._mapBounds) {
      const mb = this._mapBounds;
      if (mx >= mb.x && mx <= mb.x + mb.w && my >= mb.y && my <= mb.y + mb.h) {
        this._mapDragging = true;
        this._mapDragStartX = mx;
        this._mapDragStartY = my;
        this._mapDragWasDrag = false;
      }
    }
  }

  handleMouseUp() {
    this._mapDragging = false;
  }

  handleMouseMove(mx, my) {
    if (!this._bounds) return;

    // Map drag
    if (this._mapDragging && this._mapBounds) {
      const dx = mx - this._mapDragStartX;
      const dy = my - this._mapDragStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._mapDragWasDrag = true;
      const maxAU = this._getMaxOrbitalAU();
      const mb = this._mapBounds;
      const scale = (maxAU * 2) / (mb.w * this._mapZoom);
      this._mapPanX += dx * scale;
      this._mapPanY += dy * scale;
      this._mapDragStartX = mx;
      this._mapDragStartY = my;
      return;
    }

    // Hover statek (LEFT)
    this._hoverVesselId = null;
    for (const z of this._hitZones) {
      if (z.type === 'vessel' && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._hoverVesselId = z.data.vesselId;
        break;
      }
    }

    // Hover ciało na mapie
    this._mapHoverBody = null;
    for (const z of this._hitZones) {
      if (z.type === 'map_body' && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._mapHoverBody = { body: z.data.body, screenX: z.x + z.w / 2, screenY: z.y };
        break;
      }
    }
  }

  // ── Tooltip katalogu ciał (dla UIManager) ────────────────────────────────
  detectCatalogTooltip(mx, my) {
    for (const row of (this._catalogRowRects ?? [])) {
      if (mx >= row.x && mx <= row.x + row.w && my >= row.y && my <= row.y + row.h) {
        return { type: 'catalogBody', data: { body: row.body, explored: row.explored } };
      }
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Hit zone dispatch
  // ══════════════════════════════════════════════════════════════════════════
  _handleHit(zone) {
    switch (zone.type) {
      case 'filter':
        this._filter = zone.data.filterId;
        this._shipScrollY = 0;
        break;

      case 'vessel':
        if (this._selectedVesselId === zone.data.vesselId) {
          this._selectedVesselId = null;
          this._missionConfig = null;
        } else {
          this._selectedVesselId = zone.data.vesselId;
          this._missionConfig = null;
          this._targetScrollOffset = 0;
          this._rightScrollY = 0;
        }
        break;

      case 'map_vessel':
        this._selectedVesselId = zone.data.vesselId;
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        this._rightScrollY = 0;
        break;

      case 'map_body':
      case 'map_planet':
      case 'catalog_body': {
        const body = zone.data.body;
        if (body) {
          EventBus.emit('body:selected', { entity: body });
          // Centruj mapę na wybranym ciele
          const bx = body.physics?.x ?? 0;
          const by = body.physics?.y ?? 0;
          this._mapPanX = -bx;
          this._mapPanY = -by;
        }
        break;
      }

      case 'map_toggle':
        this._mapToggles[zone.data.toggleId] = !this._mapToggles[zone.data.toggleId];
        break;

      case 'action':
        this._handleAction(zone.data);
        break;

      case 'select_target':
        this._missionConfig.targetId = zone.data.targetId;
        this._missionConfig.step = 'confirm';
        break;

      case 'confirm_mission':
        this._executeMission();
        break;

      case 'cancel_config':
        this._missionConfig = null;
        break;

      case 'change_target':
        this._missionConfig.step = 'select';
        this._missionConfig.targetId = null;
        break;

      case 'rename':
        this._renameVessel(zone.data.vesselId);
        break;

      case 'cargo_load':
        this._openCargoLoader(zone.data.vesselId);
        break;

      case 'build_ship':
        if (zone.data.enabled) EventBus.emit('fleet:buildRequest', { shipId: zone.data.shipId });
        break;

      case 'delete_trade_route':
        EventBus.emit('tradeRoute:delete', { routeId: zone.data.routeId });
        break;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Akcje misji
  // ══════════════════════════════════════════════════════════════════════════
  _handleAction(data) {
    const { actionId, vesselId } = data;
    const action = FLEET_ACTIONS[actionId];
    if (!action) return;
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(vesselId);
    if (!vessel) return;

    if (actionId === 'transport') {
      this._openCargoThenTarget(vessel);
      return;
    }
    if (action.requiresTarget) {
      this._missionConfig = { actionId, vesselId, targetId: null, step: 'select' };
      this._targetScrollOffset = 0;
      this._cachedTargets = null;
    } else {
      const state = this._buildActionState(vessel);
      action.execute(vessel, state);
      this._selectedVesselId = null;
      this._missionConfig = null;
    }
  }

  async _openCargoThenTarget(vessel) {
    const colony = this._getVesselColony(vessel);
    if (!colony) return;
    await showCargoLoadModal(vessel, colony);
    this._missionConfig = { actionId: 'transport', vesselId: vessel.id, targetId: null, step: 'select' };
    this._targetScrollOffset = 0;
    this._cachedTargets = null;
  }

  _openCargoLoader(vesselId) {
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(vesselId);
    if (!vessel) return;
    const colony = this._getVesselColony(vessel);
    if (colony) showCargoLoadModal(vessel, colony);
  }

  _getVesselColony(vessel) {
    const colMgr = window.KOSMOS?.colonyManager;
    const colonyId = (vessel.position?.state === 'orbiting')
      ? vessel.position.dockedAt : vessel.colonyId;
    return colMgr?.getColony(colonyId);
  }

  _executeMission() {
    const cfg = this._missionConfig;
    if (!cfg || !cfg.targetId) return;
    const action = FLEET_ACTIONS[cfg.actionId];
    if (!action) return;
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(cfg.vesselId);
    if (!vessel) return;
    const state = this._buildActionState(vessel);
    state.targetId = cfg.targetId;
    state.targetBody = _findBody(cfg.targetId);
    action.execute(vessel, state);
    this._selectedVesselId = null;
    this._missionConfig = null;
  }

  _buildActionState(vessel) {
    return {
      vesselManager: window.KOSMOS?.vesselManager,
      missionSystem: window.KOSMOS?.expeditionSystem ?? window.KOSMOS?.missionSystem,
      colonyManager: window.KOSMOS?.colonyManager,
      techSystem: window.KOSMOS?.techSystem,
      activePlanetId: window.KOSMOS?.colonyManager?.activePlanetId,
    };
  }

  async _renameVessel(vesselId) {
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(vesselId);
    if (!vessel) return;
    const newName = await showRenameModal(vessel.name);
    if (newName && newName.trim().length > 0) {
      EventBus.emit('vessel:rename', { vesselId, name: newName.trim() });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Filtrowanie statków
  // ══════════════════════════════════════════════════════════════════════════
  _filterVessels(allVessels, activePid) {
    if (this._filter === 'all') return allVessels;
    if (this._filter === 'here') return allVessels.filter(v => v.colonyId === activePid);
    return allVessels.filter(v => v.shipId === this._filter);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEFT — lista statków (góra ~50%) + katalog ciał (dół ~50%)
  // ══════════════════════════════════════════════════════════════════════════
  _drawLeft(ctx, x, y, w, h, vessels, activePid) {
    const PAD = 6;
    const LH = 14;

    // ── Nagłówek FLOTA ──
    let cy = y + 4;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.fillText('FLOTA', x + PAD, cy + 8);

    // Liczba statków
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.textAlign = 'right';
    ctx.fillText(`${vessels.length} statków`, x + w - PAD, cy + 8);
    ctx.textAlign = 'left';
    cy += LH + 2;

    // ── Filtry ──
    let fx = x + PAD;
    for (const fb of FILTER_BTNS) {
      const active = this._filter === fb.id;
      const tw = ctx.measureText(fb.label).width + 8;
      ctx.fillStyle = active ? 'rgba(136,255,204,0.15)' : 'rgba(20,30,40,0.6)';
      ctx.fillRect(fx, cy - 4, tw, 16);
      ctx.strokeStyle = active ? THEME.borderActive : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(fx, cy - 4, tw, 16);
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = active ? C.bright : C.text;
      ctx.fillText(fb.label, fx + 4, cy + 6);
      this._hitZones.push({ x: fx, y: cy - 4, w: tw, h: 16, type: 'filter', data: { filterId: fb.id } });
      fx += tw + 2;
    }
    cy += LH + 4;

    // ── Podsumowanie statusów ──
    const docked = vessels.filter(v => v.position.state === 'docked').length;
    const transit = vessels.filter(v => v.position.state === 'in_transit').length;
    const orbiting = vessels.filter(v => v.position.state === 'orbiting').length;
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText(`IDLE`, x + PAD, cy + 6);
    ctx.fillStyle = C.dim;
    ctx.fillText(`W MISJI`, x + PAD + 50, cy + 6);
    ctx.fillStyle = C.dim;
    ctx.fillText(`ORBITA`, x + PAD + 120, cy + 6);
    cy += 10;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.green;
    ctx.fillText(`${docked}`, x + PAD + 8, cy + 6);
    ctx.fillStyle = C.orange;
    ctx.fillText(`${transit}`, x + PAD + 62, cy + 6);
    ctx.fillStyle = C.mint;
    ctx.fillText(`${orbiting}`, x + PAD + 132, cy + 6);
    cy += LH + 2;

    // Separator
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 4;

    // ── Lista statków (scrollowalna — ~50% lewej kolumny) ──
    const splitY = y + Math.floor(h * 0.52); // podział na ~52% / 48%
    const shipListTop = cy;
    const shipListH = splitY - cy;
    this._leftShipRect = { y: shipListTop, h: shipListH };

    this._drawShipList(ctx, x, shipListTop, w, shipListH, vessels);

    // ── Separator sekcji ──
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, splitY); ctx.lineTo(x + w - PAD, splitY); ctx.stroke();

    // ── Katalog ciał (scrollowalny — ~48% lewej kolumny) ──
    const catTop = splitY + 2;
    const catH = h - (catTop - y);
    this._leftCatRect = { y: catTop, h: catH };

    this._drawBodyCatalog(ctx, x, catTop, w, catH);
  }

  // ── Lista statków (scrollowalna) ─────────────────────────────────────────
  _drawShipList(ctx, x, y, w, maxH, vessels) {
    const PAD = 6;
    const ROW_H = 34;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, maxH);
    ctx.clip();

    let ly = y - this._shipScrollY;
    this._shipContentH = vessels.length * ROW_H;
    this._shipVisibleH = maxH;

    for (const vessel of vessels) {
      if (ly + ROW_H < y - 2) { ly += ROW_H; continue; }
      if (ly > y + maxH + 2) break;

      const isSelected = this._selectedVesselId === vessel.id;
      const isHover = this._hoverVesselId === vessel.id;
      const sd = SHIPS[vessel.shipId];

      // Tło wiersza
      if (isSelected) {
        ctx.fillStyle = 'rgba(136,255,204,0.1)';
        ctx.fillRect(x + 1, ly, w - 2, ROW_H);
        ctx.fillStyle = THEME.borderActive;
        ctx.fillRect(x + 1, ly, 2, ROW_H);
      } else if (isHover) {
        ctx.fillStyle = 'rgba(80,120,160,0.08)';
        ctx.fillRect(x + 1, ly, w - 2, ROW_H);
      }

      // Ikona statusu
      const sColor = STATUS_COLORS[vessel.position.state]?.() ?? C.text;
      const sIcon = vessel.position.state === 'docked'
        ? (vessel.mission ? STATUS_ICONS.on_mission : STATUS_ICONS.idle)
        : vessel.position.state === 'orbiting' ? STATUS_ICONS.orbiting
        : STATUS_ICONS.on_mission;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = sColor;
      ctx.fillText(sIcon, x + PAD, ly + 12);

      // Ikona statku + nazwa
      ctx.fillStyle = isSelected ? C.bright : C.text;
      ctx.fillText(`${sd?.icon ?? '🚀'} ${_truncate(vessel.name, 14)}`, x + PAD + 12, ly + 12);

      // Pasek paliwa (miniaturka)
      const fuelFrac = vessel.fuel.max > 0 ? vessel.fuel.current / vessel.fuel.max : 0;
      const fuelColor = fuelFrac > 0.5 ? THEME.success : fuelFrac > 0.2 ? THEME.warning : THEME.danger;
      const barW = 40; const barH = 3;
      const barX = x + w - PAD - barW - 26; const barY = ly + 8;
      ctx.fillStyle = THEME.bgTertiary; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = fuelColor; ctx.fillRect(barX, barY, Math.round(barW * fuelFrac), barH);

      // Procent paliwa
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = fuelColor;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(fuelFrac * 100)}%`, x + w - PAD, ly + 11);
      ctx.textAlign = 'left';

      // Wiersz 2: status + lokalizacja
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      const statusLabel = vessel.position.state === 'docked' ? 'Bezczynny'
        : vessel.position.state === 'orbiting' ? 'Na orbicie'
        : 'W MISJI';
      ctx.fillStyle = sColor;
      ctx.fillText(statusLabel, x + PAD + 12, ly + 26);

      ctx.fillStyle = C.dim;
      ctx.fillText(`· ${this._getLocationText(vessel)}`, x + PAD + 76, ly + 26);

      this._hitZones.push({ x, y: ly, w, h: ROW_H, type: 'vessel', data: { vesselId: vessel.id } });
      ly += ROW_H;
    }
    ctx.restore();

    // Scrollbar
    if (this._shipContentH > maxH) {
      const sbH = Math.max(10, maxH * (maxH / this._shipContentH));
      const maxScroll = this._shipContentH - maxH;
      const frac = maxScroll > 0 ? Math.min(1, this._shipScrollY / maxScroll) : 0;
      ctx.fillStyle = 'rgba(100,140,180,0.3)';
      ctx.fillRect(x + w - 3, y + frac * (maxH - sbH), 3, sbH);
    }
  }

  _getLocationText(vessel) {
    if (vessel.position.state === 'docked') {
      const colMgr = window.KOSMOS?.colonyManager;
      const col = colMgr?.getColony(vessel.colonyId);
      return _truncate(col?.name ?? '?', 12);
    }
    if (vessel.position.state === 'orbiting') {
      const body = _findBody(vessel.position.dockedAt);
      return _truncate(body?.name ?? '?', 12);
    }
    const target = vessel.mission?.targetName ?? '?';
    return `→ ${_truncate(target, 12)}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Katalog ciał (dół lewej kolumny)
  // ══════════════════════════════════════════════════════════════════════════
  _drawBodyCatalog(ctx, x, y, w, h) {
    const PAD = 6;
    const ROW_H = 26;
    let cy = y + 6;
    this._catalogRowRects = [];

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.fillText('KATALOG CIAŁ', x + PAD, cy + 8);

    const entries = this._getAllCatalogBodies();
    const exploredCount = entries.filter(e => e.explored).length;
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.textAlign = 'right';
    ctx.fillText(`${exploredCount}/${entries.length}`, x + w - PAD, cy + 8);
    ctx.textAlign = 'left';
    cy += LH_CAT;

    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 4;

    if (entries.length === 0) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.dim;
      ctx.fillText('Brak ciał', x + PAD, cy + 8);
      this._catalogContentH = 0;
      this._catalogVisibleH = 0;
      return;
    }

    // Scroll + clip
    const visibleH = h - (cy - y) - 2;
    this._catalogVisibleH = visibleH;
    this._catalogContentH = entries.length * ROW_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, cy, w, visibleH);
    ctx.clip();

    const scrollY = this._catalogScrollY || 0;
    let ry = cy - scrollY;

    for (const entry of entries) {
      const { body, explored } = entry;
      const isMoon = !!entry.isMoon;
      const indent = isMoon ? 10 : 0;

      if (ry + ROW_H < cy - 2) { ry += ROW_H; continue; }
      if (ry > cy + visibleH + 2) break;

      // Hover highlight
      const isHover = this._mapHoverBody?.body?.id === body.id;
      if (isHover) {
        ctx.fillStyle = 'rgba(80,120,160,0.1)';
        ctx.fillRect(x + 1, ry, w - 2, ROW_H);
      }

      const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
      const orbA = body.orbital?.a ?? 0;
      const distHome = DistanceUtils.orbitalFromHomeAU(body);

      if (explored) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = isMoon ? C.label : C.bright;
        const namePrefix = isMoon ? '└ ' : '';
        ctx.fillText(`${namePrefix}${icon} ${_truncate(body.name, isMoon ? 8 : 12)}`, x + PAD + indent, ry + 10);

        ctx.fillStyle = C.dim;
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillText(`${orbA.toFixed(1)}AU`, x + PAD + indent, ry + 22);

        ctx.textAlign = 'right';
        ctx.fillStyle = C.label;
        ctx.fillText(`🏠${distHome.toFixed(1)}AU`, x + w - PAD, ry + 10);

        // Złoża (jeśli są)
        const deps = body.deposits ?? [];
        if (deps.length > 0) {
          const topDeps = [...deps].filter(d => d.remaining > 0).sort((a, b) => b.richness - a.richness).slice(0, 2);
          let depStr = topDeps.map(d => {
            const stars = d.richness >= 0.7 ? '★★★' : d.richness >= 0.4 ? '★★' : '★';
            return `${d.resourceId}${stars}`;
          }).join(' ');
          ctx.fillStyle = THEME.yellow;
          ctx.fillText(depStr, x + w - PAD, ry + 22);
        }
        ctx.textAlign = 'left';
      } else {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.dim;
        const namePrefix = isMoon ? '└ ' : '';
        ctx.fillText(`${namePrefix}${icon} ???`, x + PAD + indent, ry + 10);

        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.label;
        ctx.fillText(`${orbA.toFixed(1)}AU`, x + PAD + indent, ry + 22);

        ctx.textAlign = 'right';
        ctx.fillStyle = C.dim;
        ctx.fillText(`🏠${distHome.toFixed(1)}AU`, x + w - PAD, ry + 10);
        ctx.textAlign = 'left';
      }

      this._catalogRowRects.push({ x, y: ry, w, h: ROW_H, body, explored });
      this._hitZones.push({ x, y: ry, w, h: ROW_H, type: 'catalog_body', data: { body } });
      ry += ROW_H;
    }

    ctx.restore();

    // Scrollbar
    if (this._catalogContentH > visibleH) {
      const sbH = Math.max(10, visibleH * (visibleH / this._catalogContentH));
      const maxScroll = this._catalogContentH - visibleH;
      const sbY = cy + (scrollY / maxScroll) * (visibleH - sbH);
      ctx.fillStyle = 'rgba(100,140,180,0.3)';
      ctx.fillRect(x + w - 3, sbY, 3, sbH);
    }
  }

  _getAllCatalogBodies() {
    const homePl = window.KOSMOS?.homePlanet;
    const planets = [];
    for (const t of ['planet', 'planetoid']) {
      for (const body of EntityManager.getByType(t)) {
        if (body === homePl) continue;
        planets.push({ body, explored: !!body.explored });
      }
    }
    planets.sort((a, b) => {
      if (a.explored !== b.explored) return a.explored ? -1 : 1;
      return (a.body.orbital?.a ?? 0) - (b.body.orbital?.a ?? 0);
    });

    const moonsByParent = new Map();
    for (const moon of EntityManager.getByType('moon')) {
      const pid = moon.parentPlanetId;
      if (!moonsByParent.has(pid)) moonsByParent.set(pid, []);
      moonsByParent.get(pid).push({ body: moon, explored: !!moon.explored, isMoon: true });
    }
    for (const moons of moonsByParent.values()) {
      moons.sort((a, b) => (a.body.orbital?.a ?? 0) - (b.body.orbital?.a ?? 0));
    }

    const result = [];
    const homeMoons = homePl ? (moonsByParent.get(homePl.id) ?? []) : [];
    for (const m of homeMoons) result.push(m);
    if (homeMoons.length > 0) moonsByParent.delete(homePl.id);

    for (const entry of planets) {
      result.push(entry);
      const moons = moonsByParent.get(entry.body.id) ?? [];
      for (const m of moons) result.push(m);
    }
    return result;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CENTER — mapa schematyczna systemu
  // ══════════════════════════════════════════════════════════════════════════
  _drawCenter(ctx, x, y, w, h, allVessels) {
    const PAD = 4;
    let cy = y + 4;

    // Nagłówek z toggle'ami
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    const zoomPct = Math.round(this._mapZoom * 100);
    ctx.fillText(`WIDOK UKŁADU SŁONECZNEGO`, x + PAD + 4, cy + 8);

    // Togglei: TRASY, ZASIĘG
    let tx = x + w - PAD;
    for (const tid of ['range', 'routes']) {
      const label = tid === 'routes' ? 'TRASY' : 'ZASIĘG';
      const on = this._mapToggles[tid];
      const tw = ctx.measureText(label).width + 10;
      tx -= tw + 3;
      ctx.fillStyle = on ? 'rgba(136,255,204,0.15)' : 'rgba(20,30,40,0.6)';
      ctx.fillRect(tx, cy, tw, 16);
      ctx.strokeStyle = on ? THEME.borderActive : C.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, cy, tw, 16);
      ctx.fillStyle = on ? C.bright : C.dim;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillText(label, tx + 5, cy + 11);
      this._hitZones.push({ x: tx, y: cy, w: tw, h: 16, type: 'map_toggle', data: { toggleId: tid } });
    }
    cy += 20;

    // Obszar mapy
    const mapY = cy;
    const mapH = h - (cy - y) - 4;
    this._mapBounds = { x: x + PAD, y: mapY, w: w - PAD * 2, h: mapH };

    // Tło mapy — mniej przezroczyste (ciemne, gęste)
    ctx.fillStyle = 'rgba(4,8,16,0.92)';
    ctx.fillRect(x + PAD, mapY, w - PAD * 2, mapH);
    ctx.strokeStyle = 'rgba(40,60,80,0.4)';
    ctx.strokeRect(x + PAD, mapY, w - PAD * 2, mapH);

    this._drawSystemMap(ctx, x + PAD, mapY, w - PAD * 2, mapH, allVessels);

    // Tooltip ciała na mapie
    if (this._mapHoverBody) this._drawBodyTooltip(ctx, this._mapHoverBody);
  }

  _getMaxOrbitalAU() {
    let maxAU = 5;
    for (const p of EntityManager.getByType('planet')) {
      const a = p.orbital?.a ?? 0;
      if (a > maxAU) maxAU = a;
    }
    for (const p of EntityManager.getByType('planetoid')) {
      const a = p.orbital?.a ?? 0;
      if (a > maxAU) maxAU = a;
    }
    return maxAU * 1.15;
  }

  _drawSystemMap(ctx, x, y, w, h, allVessels) {
    const maxAU = this._getMaxOrbitalAU();
    const zoom = this._mapZoom;
    const panX = this._mapPanX;
    const panY = this._mapPanY;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const scale = Math.min(w, h) / (maxAU * 2) * zoom;

    const toScreen = (auX, auY) => ({
      sx: cx + (auX + panX) * scale,
      sy: cy + (auY + panY) * scale,
    });

    // Gwiazda
    const star = EntityManager.getByType('star')[0];
    const { sx: starSx, sy: starSy } = toScreen(0, 0);
    if (starSx >= x - 20 && starSx <= x + w + 20 && starSy >= y - 20 && starSy <= y + h + 20) {
      const grad = ctx.createRadialGradient(starSx, starSy, 0, starSx, starSy, 16);
      grad.addColorStop(0, 'rgba(255,200,80,0.6)');
      grad.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(starSx, starSy, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffc850';
      ctx.beginPath(); ctx.arc(starSx, starSy, 4, 0, Math.PI * 2); ctx.fill();
    }

    // Clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    // Orbity planet
    for (const p of EntityManager.getByType('planet')) {
      const a = p.orbital?.a ?? 0;
      if (a <= 0) continue;
      const r = a * scale;
      ctx.strokeStyle = 'rgba(60,80,100,0.3)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(starSx, starSy, r, 0, Math.PI * 2); ctx.stroke();
    }

    // Planety
    for (const p of EntityManager.getByType('planet')) {
      const px = p.physics?.x ?? 0; const py = p.physics?.y ?? 0;
      const { sx, sy } = toScreen(px, py);
      if (sx < x - 10 || sx > x + w + 10 || sy < y - 10 || sy > y + h + 10) continue;

      const r = Math.max(3, Math.min(8, scale * 0.15));
      const isGas = p.planetType === 'gas';
      // Kolory planet wg typu
      const planetColor = isGas ? '#6688bb'
        : p.explored ? (p.lifeScore > 50 ? '#55cc88' : '#aaccee')
        : '#556677';
      ctx.fillStyle = planetColor;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();

      // Etykieta
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = p.explored ? C.text : C.dim;
      ctx.fillText(_truncate(p.name, 8), sx + r + 3, sy + 3);

      this._hitZones.push({ x: sx - r - 2, y: sy - r - 2, w: r * 2 + 4, h: r * 2 + 4, type: 'map_body', data: { body: p } });
    }

    // Planetoidy
    for (const p of EntityManager.getByType('planetoid')) {
      const px = p.physics?.x ?? 0; const py = p.physics?.y ?? 0;
      const { sx, sy } = toScreen(px, py);
      if (sx < x - 4 || sx > x + w + 4 || sy < y - 4 || sy > y + h + 4) continue;
      ctx.fillStyle = p.explored ? '#887766' : '#554433';
      ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
      this._hitZones.push({ x: sx - 4, y: sy - 4, w: 8, h: 8, type: 'map_body', data: { body: p } });
    }

    // Księżyce
    for (const m of EntityManager.getByType('moon')) {
      const mx = m.physics?.x ?? 0; const my = m.physics?.y ?? 0;
      const { sx, sy } = toScreen(mx, my);
      if (sx < x - 4 || sx > x + w + 4 || sy < y - 4 || sy > y + h + 4) continue;
      ctx.fillStyle = m.explored ? '#99aacc' : '#445566';
      ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
      this._hitZones.push({ x: sx - 4, y: sy - 4, w: 8, h: 8, type: 'map_body', data: { body: m } });
    }

    // Trasy misji
    if (this._mapToggles.routes) {
      for (const v of allVessels) {
        if (v.position.state !== 'in_transit') continue;
        const vx = v.position?.x ?? 0; const vy = v.position?.y ?? 0;
        const { sx: vsx, sy: vsy } = toScreen(vx, vy);
        const target = v.mission?.targetBody ?? _findBody(v.mission?.targetId);
        if (target) {
          const tx = target.physics?.x ?? 0; const ty = target.physics?.y ?? 0;
          const { sx: tsx, sy: tsy } = toScreen(tx, ty);
          ctx.strokeStyle = v.mission?.phase === 'returning' ? 'rgba(136,255,204,0.4)' : 'rgba(255,180,60,0.4)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(vsx, vsy); ctx.lineTo(tsx, tsy); ctx.stroke();
          ctx.setLineDash([]);
          // Cel misji — okrąg
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath(); ctx.arc(tsx, tsy, 8, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    // Zasięg wybranego statku
    if (this._mapToggles.range && this._selectedVesselId) {
      const vMgr = window.KOSMOS?.vesselManager;
      const vessel = vMgr?.getVessel(this._selectedVesselId);
      if (vessel) {
        const rangeAU = vessel.fuel.consumption > 0 ? vessel.fuel.current / vessel.fuel.consumption : 50;
        const vx = vessel.position.state === 'docked'
          ? (_findBody(vessel.colonyId)?.physics?.x ?? 0)
          : (vessel.position?.x ?? 0);
        const vy = vessel.position.state === 'docked'
          ? (_findBody(vessel.colonyId)?.physics?.y ?? 0)
          : (vessel.position?.y ?? 0);
        const { sx, sy } = toScreen(vx, vy);
        const rPx = rangeAU * scale;
        ctx.strokeStyle = 'rgba(136,255,204,0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(sx, sy, rPx, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Statki na mapie
    for (const v of allVessels) {
      let vx, vy;
      if (v.position.state === 'docked') {
        const colBody = _findBody(v.colonyId);
        vx = colBody?.physics?.x ?? 0;
        vy = colBody?.physics?.y ?? 0;
      } else {
        vx = v.position?.x ?? 0;
        vy = v.position?.y ?? 0;
      }
      const { sx, sy } = toScreen(vx, vy);
      if (sx < x - 6 || sx > x + w + 6 || sy < y - 6 || sy > y + h + 6) continue;

      const isSelected = v.id === this._selectedVesselId;
      const sd = SHIPS[v.shipId];
      const color = v.position.state === 'docked' ? THEME.success
        : v.position.state === 'orbiting' ? THEME.mint : THEME.warning;

      // Ikona statku (trójkąt/kółko wg typu)
      ctx.fillStyle = color;
      const dotR = isSelected ? 4 : 3;
      ctx.beginPath(); ctx.arc(sx, sy, dotR, 0, Math.PI * 2); ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = THEME.borderActive;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.stroke();
      }

      // Etykieta statku (tylko gdy zoom > 1.5 lub selected)
      if (isSelected || this._mapZoom > 1.5) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = color;
        ctx.fillText(_truncate(v.name, 6), sx + dotR + 3, sy + 3);
      }

      this._hitZones.push({ x: sx - 5, y: sy - 5, w: 10, h: 10, type: 'map_vessel', data: { vesselId: v.id } });
    }

    ctx.restore(); // clip

    // Legenda
    const mb = this._mapBounds;
    const legX = mb.x + mb.w - 90;
    const legY = mb.y + mb.h - 44;
    ctx.fillStyle = 'rgba(6,10,20,0.85)';
    ctx.fillRect(legX, legY, 86, 40);
    ctx.strokeStyle = 'rgba(40,60,80,0.4)';
    ctx.strokeRect(legX, legY, 86, 40);
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.success;   ctx.fillText('● hangar', legX + 10, legY + 12);
    ctx.fillStyle = THEME.warning;   ctx.fillText('● w locie', legX + 10, legY + 24);
    ctx.fillStyle = THEME.mint;      ctx.fillText('● orbita', legX + 10, legY + 36);
  }

  _drawBodyTooltip(ctx, { body, screenX, screenY }) {
    if (!body) return;
    const lines = [];
    const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
    const name = body.explored ? body.name : '???';
    lines.push(`${icon} ${name}`);
    lines.push(`Typ: ${body.planetType ?? body.type}`);
    if (body.explored) {
      const tempC = body.temperatureK ? Math.round(body.temperatureK - 273) : null;
      if (tempC !== null) lines.push(`Temp: ${tempC > 0 ? '+' : ''}${tempC}°C`);
    }
    const orbA = body.orbital?.a ?? 0;
    lines.push(`Orbita: ${orbA.toFixed(2)} AU`);
    if (!body.explored) lines.push('Niezbadane');

    const ttW = 140; const ttH = lines.length * 13 + 8;
    let tx = screenX - ttW / 2; let ty = screenY - ttH - 8;
    if (tx < this._mapBounds.x) tx = this._mapBounds.x;
    if (ty < this._mapBounds.y) ty = this._mapBounds.y;

    ctx.fillStyle = 'rgba(6,10,20,0.95)';
    ctx.fillRect(tx, ty, ttW, ttH);
    ctx.strokeStyle = THEME.borderActive;
    ctx.strokeRect(tx, ty, ttW, ttH);

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    let ly = ty + 12;
    for (const line of lines) {
      ctx.fillStyle = C.text;
      ctx.fillText(line, tx + 5, ly);
      ly += 13;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RIGHT — szczegóły statku / konfigurator / stocznia
  // ══════════════════════════════════════════════════════════════════════════
  _drawRight(ctx, x, y, w, h) {
    // Tryb C: konfigurator misji
    if (this._missionConfig) {
      this._drawMissionConfig(ctx, x, y, w, h);
      return;
    }

    // Tryb B: statek wybrany → szczegóły + akcje
    if (this._selectedVesselId) {
      const vMgr = window.KOSMOS?.vesselManager;
      const vessel = vMgr?.getVessel(this._selectedVesselId);
      if (vessel) {
        this._drawVesselDetails(ctx, x, y, w, h, vessel);
        return;
      }
      this._selectedVesselId = null;
    }

    // Tryb A: brak selekcji → stocznia + info
    this._drawShipyard(ctx, x, y, w, h);
  }

  // ── Stocznia (prawa kolumna gdy brak selekcji) ────────────────────────────
  _drawShipyard(ctx, x, y, w, h) {
    const PAD = 8;
    const LH = 15;
    let cy = y + 12;

    const colMgr = window.KOSMOS?.colonyManager;
    const tSys = window.KOSMOS?.techSystem;
    const activePid = colMgr?.activePlanetId;
    const activeCol = colMgr?.getColony(activePid);

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.fillText('STOCZNIA', x + PAD, cy + 8);
    cy += LH + 6;

    const shipyardLevel = colMgr?._getShipyardLevel?.(activeCol) ?? (() => {
      if (!activeCol?.buildingSystem) return 0;
      let total = 0;
      for (const [, e] of activeCol.buildingSystem._active) {
        if (e.building?.id === 'shipyard') total += e.level ?? 1;
      }
      return total;
    })();
    const hasShipyard = shipyardLevel > 0;
    const hasExploration = tSys?.isResearched('exploration') ?? false;

    if (!hasExploration) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.orange;
      ctx.fillText('🔒 Wymaga: Eksploracja', x + PAD, cy + 8);
      return;
    }
    if (!hasShipyard) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.orange;
      ctx.fillText('⚓ Stocznia: ❌ (zbuduj)', x + PAD, cy + 8);
      return;
    }

    // Status stoczni
    const queues = colMgr?.getShipQueues(activePid) ?? [];
    const usedSlots = queues.length || 1;
    const speedBonus = Math.max(1, Math.floor(shipyardLevel / usedSlots));
    const bonusStr = speedBonus > 1 ? ` ×${speedBonus}⚡` : '';
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.green;
    ctx.fillText(`⚓ Sloty: ${queues.length}/${shipyardLevel}${bonusStr}`, x + PAD, cy + 8);
    cy += LH;

    // Aktywne budowy
    for (const q of queues) {
      const shipDef = SHIPS[q.shipId];
      const frac = q.buildTime > 0 ? q.progress / q.buildTime : 0;
      ctx.fillStyle = C.text;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillText(`${shipDef?.icon ?? '🚀'} ${_truncate(shipDef?.namePL ?? q.shipId, 12)}`, x + PAD, cy + 8);
      drawMiniBar(ctx, x + PAD + 100, cy + 2, w - PAD * 2 - 100, 6, frac, THEME.borderActive);
      cy += LH;
    }

    cy += 4;
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 8;

    // Przyciski budowy
    ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText('BUDOWA STATKU', x + PAD, cy + 8);
    cy += LH + 2;

    const canBuildAny = hasShipyard && queues.length < shipyardLevel;
    const inv = activeCol?.resourceSystem?.inventorySnapshot() ?? {};

    for (const ship of Object.values(SHIPS)) {
      if (cy > y + h - 22) break;
      const hasTech = !ship.requires || (tSys?.isResearched(ship.requires) ?? false);
      if (!hasTech) continue;
      const allCosts = { ...(ship.cost || {}), ...(ship.commodityCost || {}) };
      const canAfford = Object.entries(allCosts).every(([k, v]) => (inv[k] ?? 0) >= v);
      const canBuild = canBuildAny && canAfford;

      const btnH = 20;
      ctx.fillStyle = canBuild ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.5)';
      ctx.fillRect(x + PAD, cy, w - PAD * 2, btnH);
      ctx.strokeStyle = canBuild ? THEME.borderActive : C.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + PAD, cy, w - PAD * 2, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = canBuild ? C.bright : C.dim;
      ctx.textAlign = 'center';
      ctx.fillText(`${ship.icon} ${ship.namePL}`, x + w / 2, cy + 13);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: x + PAD, y: cy, w: w - PAD * 2, h: btnH, type: 'build_ship', data: { shipId: ship.id, enabled: canBuild } });
      cy += btnH + 3;
    }

    // Trasy handlowe
    const trMgr = window.KOSMOS?.tradeRouteManager;
    const vMgr = window.KOSMOS?.vesselManager;
    const trRoutes = trMgr?.getRoutes()?.filter(r => r.status === 'active' || r.status === 'paused') ?? [];
    if (trRoutes.length > 0 && cy < y + h - 20) {
      cy += 6;
      ctx.strokeStyle = C.border; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
      cy += 8;
      ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.title;
      ctx.fillText(`🔄 TRASY HANDLOWE (${trRoutes.length})`, x + PAD, cy + 8);
      cy += LH;
      for (const tr of trRoutes) {
        if (cy > y + h - 16) break;
        const vName = vMgr?.getVessel(tr.vesselId)?.name ?? '?';
        const statusIcon = tr.status === 'paused' ? '⏸' : '▶';
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = tr.status === 'paused' ? C.dim : C.mint;
        ctx.fillText(`${statusIcon} ${_truncate(vName, 8)} → ${_truncate(tr.targetBodyId, 8)}`, x + PAD, cy + 8);
        const delW = 14; const delX = x + w - PAD - delW;
        ctx.fillStyle = 'rgba(80,20,20,0.6)'; ctx.fillRect(delX, cy + 1, delW, 14);
        ctx.fillStyle = C.red; ctx.textAlign = 'center';
        ctx.fillText('✕', delX + delW / 2, cy + 11); ctx.textAlign = 'left';
        this._hitZones.push({ x: delX, y: cy + 1, w: delW, h: 14, type: 'delete_trade_route', data: { routeId: tr.id } });
        cy += LH;
      }
    }
  }

  // ── Szczegóły statku (tryb B) ──────────────────────────────────────────────
  _drawVesselDetails(ctx, x, y, w, h, vessel) {
    const PAD = 8;
    const LH = 16;
    let cy = y + 12;
    const sd = SHIPS[vessel.shipId];

    // Nagłówek: ikona + nazwa
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.bright;
    ctx.fillText(`${sd?.icon ?? '🚀'} ${vessel.name}`, x + PAD, cy + 8);

    // Przycisk rename
    const renW = 18;
    const renX = x + w - PAD - renW;
    ctx.fillStyle = 'rgba(30,50,70,0.6)'; ctx.fillRect(renX, cy, renW, 16);
    ctx.strokeStyle = C.border; ctx.strokeRect(renX, cy, renW, 16);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.text; ctx.textAlign = 'center';
    ctx.fillText('✏', renX + renW / 2, cy + 11); ctx.textAlign = 'left';
    this._hitZones.push({ x: renX, y: cy, w: renW, h: 16, type: 'rename', data: { vesselId: vessel.id } });
    cy += LH + 4;

    // Typ statku
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(`${sd?.namePL ?? vessel.shipId}`.toUpperCase(), x + PAD, cy + 8);
    cy += LH;

    // Status + Prędkość (inline)
    const sColor = STATUS_COLORS[vessel.position.state]?.() ?? C.text;
    const statusLabel = vessel.position.state === 'docked' ? 'W HANGARZE'
      : vessel.position.state === 'orbiting' ? 'NA ORBICIE'
      : 'W LOCIE';
    ctx.fillStyle = C.label; ctx.fillText('STATUS', x + PAD, cy + 8);
    ctx.fillStyle = C.label; ctx.fillText('PRĘDKOŚĆ', x + PAD + 140, cy + 8);
    cy += 12;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = sColor; ctx.fillText(statusLabel, x + PAD, cy + 8);
    ctx.fillStyle = C.bright; ctx.fillText(`${sd?.speedAU ?? '?'} AU/yr`, x + PAD + 140, cy + 8);
    cy += LH + 4;

    // Baza
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label; ctx.fillText('BAZA', x + PAD, cy + 8);
    cy += 12;
    const colMgr = window.KOSMOS?.colonyManager;
    const col = colMgr?.getColony(vessel.colonyId);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.bright; ctx.fillText(_truncate(col?.name ?? '?', 18), x + PAD, cy + 8);
    cy += LH + 2;

    // Separator
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 6;

    // Pasek paliwa
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText('PALIWO (OGNIWA ZASILAJĄCE)', x + PAD, cy + 8);
    const fuelFrac = vessel.fuel.max > 0 ? vessel.fuel.current / vessel.fuel.max : 0;
    const fuelColor = fuelFrac > 0.5 ? THEME.success : fuelFrac > 0.2 ? THEME.warning : THEME.danger;
    ctx.fillStyle = fuelColor;
    ctx.textAlign = 'right';
    ctx.fillText(`${vessel.fuel.current.toFixed(1)} / ${vessel.fuel.max}`, x + w - PAD, cy + 8);
    ctx.textAlign = 'left';
    cy += 14;
    drawMiniBar(ctx, x + PAD, cy, w - PAD * 2, 8, fuelFrac, fuelColor);
    cy += 14;

    // Przycisk Cargo
    if (sd?.cargoCapacity > 0) {
      const cargoUsed = vessel.cargoUsed ?? 0;
      const cbH = 18;
      ctx.fillStyle = 'rgba(30,60,40,0.6)';
      ctx.fillRect(x + PAD, cy, w - PAD * 2, cbH);
      ctx.strokeStyle = THEME.successDim;
      ctx.strokeRect(x + PAD, cy, w - PAD * 2, cbH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.successDim; ctx.textAlign = 'center';
      ctx.fillText(`📦 Cargo (${cargoUsed.toFixed(0)}/${sd.cargoCapacity}t)`, x + w / 2, cy + 12);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: x + PAD, y: cy, w: w - PAD * 2, h: cbH, type: 'cargo_load', data: { vesselId: vessel.id } });
      cy += cbH + 4;
    }

    // Separator
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 8;

    // Aktywna misja
    const activeMission = this._getActiveMission(vessel);
    if (activeMission) {
      cy = this._drawActiveMission(ctx, x + PAD, cy, w - PAD * 2, activeMission, vessel);
      cy += 4;
      ctx.strokeStyle = C.border; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
      cy += 8;
    }

    // Dostępne akcje
    ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText('DOSTĘPNE AKCJE', x + PAD, cy + 8);
    cy += LH + 2;

    const availableH = h - (cy - y) - 4;
    this._drawActions(ctx, x + PAD, cy, w - PAD * 2, Math.min(availableH, 200), vessel);
  }

  _getActiveMission(vessel) {
    const exSys = window.KOSMOS?.expeditionSystem;
    if (!exSys) return null;
    const active = exSys.getActive?.() ?? [];
    return active.find(e => e.vesselId === vessel.id) ?? null;
  }

  _drawActiveMission(ctx, x, y, w, exp, vessel) {
    const LH = 15;
    let cy = y;
    const typeNames = { recon: 'Rozpoznanie', mining: 'Wydobycie', scientific: 'Naukowa', transport: 'Transport', colony: 'Kolonizacja' };
    const typeName = typeNames[exp.type] ?? exp.type;

    ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText('AKTYWNA MISJA', x, cy + 8); cy += LH;

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.fillText(`🎯 ${typeName}: ${_truncate(exp.targetName ?? '?', 14)}`, x, cy + 8); cy += LH + 2;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    if (exp.status === 'orbiting') {
      ctx.fillStyle = C.label; ctx.fillText('FAZA:', x, cy + 8);
      ctx.fillStyle = C.mint; ctx.fillText('NA ORBICIE CELU', x + 45, cy + 8);
      cy += LH;
    } else if (exp.status === 'returning') {
      ctx.fillStyle = C.label; ctx.fillText('FAZA:', x, cy + 8);
      ctx.fillStyle = C.green; ctx.fillText('POWRÓT', x + 45, cy + 8);
      ctx.fillStyle = C.dim; ctx.textAlign = 'right';
      ctx.fillText(`ETA: rok ${_shortYear(exp.returnYear ?? 0)}`, x + w, cy + 8);
      ctx.textAlign = 'left';
      cy += LH;
    } else {
      ctx.fillStyle = C.label; ctx.fillText('FAZA:', x, cy + 8);
      ctx.fillStyle = C.orange; ctx.fillText('LOT DO CELU', x + 45, cy + 8);
      ctx.fillStyle = C.dim; ctx.textAlign = 'right';
      ctx.fillText(`ETA: rok ${_shortYear(exp.arrivalYear ?? 0)}`, x + w, cy + 8);
      ctx.textAlign = 'left';
      cy += LH;
    }

    return cy;
  }

  _drawActions(ctx, x, y, w, maxH, vessel) {
    const actions = getAvailableActions(vessel, this._buildActionState(vessel));
    const btnH = 24; const gap = 3;
    const cols = 2;
    const btnW = Math.floor((w - gap * (cols - 1)) / cols);
    let row = 0; let col = 0;

    for (const { action, ok, reason } of actions) {
      const bx = x + col * (btnW + gap);
      const by = y + row * (btnH + gap);
      if (by + btnH > y + maxH) break;

      const style = _actionStyle(action.id, ok);
      ctx.fillStyle = style.bg;
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.strokeStyle = style.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, btnW, btnH);

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = style.fg;
      ctx.textAlign = 'center';
      ctx.fillText(`${action.icon} ${action.label}`, bx + btnW / 2, by + 15);
      ctx.textAlign = 'left';

      if (ok) {
        this._hitZones.push({
          x: bx, y: by, w: btnW, h: btnH,
          type: 'action', data: { actionId: action.id, vesselId: vessel.id },
        });
      }

      col++;
      if (col >= cols) { col = 0; row++; }
    }
  }

  // ── Konfigurator misji (tryb C) ────────────────────────────────────────────
  _drawMissionConfig(ctx, x, y, w, h) {
    const cfg = this._missionConfig;
    if (!cfg) return;
    if (cfg.step === 'select') this._drawTargetPicker(ctx, x, y, w, h);
    else if (cfg.step === 'confirm') this._drawMissionConfirm(ctx, x, y, w, h);
  }

  _drawTargetPicker(ctx, x, y, w, h) {
    const PAD = 8;
    const LH = 14;
    const cfg = this._missionConfig;
    const action = FLEET_ACTIONS[cfg.actionId];
    let cy = y + 12;

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.fillText(`WYBIERZ CEL`, x + PAD, cy + 8);
    cy += 6;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText(`Misja: ${action?.label ?? cfg.actionId}`, x + PAD, cy + 8);
    cy += LH + 4;

    const targets = this._getValidTargets(cfg.vesselId, cfg.actionId);

    const listH = h - (cy - y) - 28;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, cy, w, listH);
    ctx.clip();

    const scrollY = this._targetScrollOffset;
    const btnH = 24; const gap = 2;
    let iy = cy - scrollY;

    for (const t of targets) {
      if (iy + btnH < cy - 2) { iy += btnH + gap; continue; }
      if (iy > cy + listH + 2) break;

      ctx.fillStyle = t.reachable ? 'rgba(20,40,60,0.7)' : 'rgba(20,15,15,0.5)';
      ctx.fillRect(x + PAD, iy, w - PAD * 2, btnH);
      ctx.strokeStyle = t.reachable ? THEME.borderActive : THEME.dangerDim;
      ctx.strokeRect(x + PAD, iy, w - PAD * 2, btnH);

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = t.reachable ? C.bright : C.dim;
      const icon = t.body?.type === 'planet' ? '🪐' : t.body?.type === 'moon' ? '🌙' : '🪨';
      const name = t.body?.explored ? _truncate(t.body.name, 10) : '???';
      ctx.fillText(`${icon} ${name}`, x + PAD + 4, iy + 10);

      ctx.fillStyle = t.reachable ? C.text : C.dim;
      ctx.textAlign = 'right';
      ctx.fillText(`${t.distAU.toFixed(1)}AU ⛽${t.fuelCost.toFixed(1)}`, x + w - PAD - 4, iy + 10);
      ctx.textAlign = 'left';

      if (!t.reachable) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.dangerDim;
        ctx.fillText('⛽ brak paliwa', x + PAD + 4, iy + 21);
      }

      if (t.reachable) {
        this._hitZones.push({
          x: x + PAD, y: iy, w: w - PAD * 2, h: btnH,
          type: 'select_target', data: { targetId: t.id },
        });
      }
      iy += btnH + gap;
    }
    ctx.restore();

    // Anuluj
    const cancelY = y + h - 22;
    ctx.fillStyle = 'rgba(60,20,20,0.6)';
    ctx.fillRect(x + PAD, cancelY, w - PAD * 2, 18);
    ctx.strokeStyle = THEME.dangerDim;
    ctx.strokeRect(x + PAD, cancelY, w - PAD * 2, 18);
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.danger; ctx.textAlign = 'center';
    ctx.fillText('✕ Anuluj', x + w / 2, cancelY + 12);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: x + PAD, y: cancelY, w: w - PAD * 2, h: 18, type: 'cancel_config' });
  }

  _drawMissionConfirm(ctx, x, y, w, h) {
    const PAD = 8;
    const LH = 15;
    const cfg = this._missionConfig;
    const action = FLEET_ACTIONS[cfg.actionId];
    const target = _findBody(cfg.targetId);
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(cfg.vesselId);
    let cy = y + 12;

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.fillText('POTWIERDŹ MISJĘ', x + PAD, cy + 8);
    cy += LH + 6;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label; ctx.fillText(`Typ: ${action?.label ?? cfg.actionId}`, x + PAD, cy + 8); cy += LH;

    const icon = target?.type === 'planet' ? '🪐' : target?.type === 'moon' ? '🌙' : '🪨';
    ctx.fillStyle = C.bright; ctx.fillText(`Cel: ${icon} ${target?.name ?? '???'}`, x + PAD, cy + 8); cy += LH;

    if (vessel && target) {
      const dist = Math.max(0.001, DistanceUtils.euclideanAU(_findBody(vessel.colonyId) ?? window.KOSMOS?.homePlanet, target));
      const fuelCost = dist * vessel.fuel.consumption;
      const sd = SHIPS[vessel.shipId];
      const eta = dist / (sd?.speedAU ?? 1.0);

      ctx.fillStyle = C.text;
      ctx.fillText(`Dystans: ${dist.toFixed(2)} AU`, x + PAD, cy + 8); cy += LH;
      ctx.fillStyle = fuelCost <= vessel.fuel.current ? THEME.successDim : THEME.danger;
      ctx.fillText(`Paliwo: ${fuelCost.toFixed(1)} / ${vessel.fuel.current.toFixed(1)} pc`, x + PAD, cy + 8); cy += LH;
      ctx.fillStyle = C.text;
      const etaStr = eta < 0.1 ? `${Math.round(eta * 365)}d` : `${eta.toFixed(1)} lat`;
      ctx.fillText(`ETA: ${etaStr}`, x + PAD, cy + 8); cy += LH;
    }

    cy += 10;

    // WYŚLIJ
    const btnH = 26;
    ctx.fillStyle = 'rgba(20,60,40,0.8)';
    ctx.fillRect(x + PAD, cy, w - PAD * 2, btnH);
    ctx.strokeStyle = THEME.success;
    ctx.strokeRect(x + PAD, cy, w - PAD * 2, btnH);
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.success; ctx.textAlign = 'center';
    ctx.fillText('✓ WYŚLIJ MISJĘ', x + w / 2, cy + 17);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: x + PAD, y: cy, w: w - PAD * 2, h: btnH, type: 'confirm_mission' });
    cy += btnH + 6;

    // Zmień cel | Anuluj
    const halfW = Math.floor((w - PAD * 2 - 4) / 2);
    ctx.fillStyle = 'rgba(20,40,60,0.7)';
    ctx.fillRect(x + PAD, cy, halfW, 20);
    ctx.strokeStyle = THEME.borderActive;
    ctx.strokeRect(x + PAD, cy, halfW, 20);
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.text; ctx.textAlign = 'center';
    ctx.fillText('← Zmień cel', x + PAD + halfW / 2, cy + 13);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: x + PAD, y: cy, w: halfW, h: 20, type: 'change_target' });

    ctx.fillStyle = 'rgba(60,20,20,0.6)';
    ctx.fillRect(x + PAD + halfW + 4, cy, halfW, 20);
    ctx.strokeStyle = THEME.dangerDim;
    ctx.strokeRect(x + PAD + halfW + 4, cy, halfW, 20);
    ctx.fillStyle = THEME.danger; ctx.textAlign = 'center';
    ctx.fillText('✕ Anuluj', x + PAD + halfW + 4 + halfW / 2, cy + 13);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: x + PAD + halfW + 4, y: cy, w: halfW, h: 20, type: 'cancel_config' });
  }

  // ── Obliczanie celów misji ─────────────────────────────────────────────────
  _getValidTargets(vesselId, actionId) {
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(vesselId);
    if (!vessel) return [];

    const key = `${vesselId}_${actionId}_${Math.floor(Date.now() / 2000)}`;
    if (this._cachedTargetsKey === key && this._cachedTargets) return this._cachedTargets;

    const action = FLEET_ACTIONS[actionId];
    if (!action) return [];

    const homePl = window.KOSMOS?.homePlanet;
    const colMgr = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const targets = [];

    const fromBody = vessel.position.state === 'orbiting'
      ? _findBody(vessel.position.dockedAt)
      : _findBody(vessel.colonyId) ?? homePl;

    for (const t of _BODY_TYPES) {
      for (const body of EntityManager.getByType(t)) {
        if (body.id === activePid) continue;

        if (actionId === 'survey' || actionId === 'deep_scan') {
          // dowolne
        } else if (actionId === 'scientific' || actionId === 'mining') {
          if (!body.explored) continue;
        } else if (actionId === 'colonize') {
          if (!body.explored) continue;
          if (colMgr?.hasColony(body.id)) continue;
          if (body.type === 'planet' && body.planetType !== 'rocky' && body.planetType !== 'ice') continue;
        } else if (actionId === 'transport' || actionId === 'redirect') {
          if (!body.explored && actionId === 'transport') continue;
        }

        const dist = fromBody ? Math.max(0.001, DistanceUtils.euclideanAU(fromBody, body)) : 99;
        const fuelMult = (actionId === 'survey') ? 2 : 1;
        const fuelCost = dist * vessel.fuel.consumption * fuelMult;
        const reachable = vessel.fuel.current >= fuelCost;

        targets.push({ id: body.id, body, distAU: dist, fuelCost, reachable });
      }
    }

    targets.sort((a, b) => {
      if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
      return a.distAU - b.distAU;
    });

    this._cachedTargets = targets;
    this._cachedTargetsKey = key;
    return targets;
  }
}

// ── Stała nagłówka katalogu ──
const LH_CAT = 16;
