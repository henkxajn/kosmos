// FleetManagerOverlay — trójdzielny overlay zarządzania flotą
//
// Otwierany klawiszem F lub kliknięciem FLOTA w Outlinerze.
// Layout: LEFT (lista statków) | CENTER (mapa schematyczna) | RIGHT (szczegóły + akcje)
// Rysowany na Canvas 2D (#ui-canvas), NA WIERZCHU istniejącego UI.
// Logika misji delegowana do MissionSystem + FleetActions.

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }          from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W }  from './CivPanelDrawer.js';
import { SHIPS }           from '../data/ShipsData.js';
import { RESOURCE_ICONS }  from '../data/BuildingsData.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { effectiveRange }  from '../entities/Vessel.js';
import { getAvailableActions, FLEET_ACTIONS } from '../data/FleetActions.js';
import EntityManager       from '../core/EntityManager.js';
import EventBus            from '../core/EventBus.js';
import { GAME_CONFIG }     from '../config/GameConfig.js';
import { DistanceUtils }   from '../utils/DistanceUtils.js';
import { showCargoLoadModal } from '../ui/CargoLoadModal.js';
import { showBodyDetailModal } from '../ui/BodyDetailModal.js';

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
const LEFT_W    = 280;
const RIGHT_W   = 300;
const TOP_PAD   = COSMIC.TOP_BAR_H;   // 50
const BOTTOM_PAD = COSMIC.BOTTOM_BAR_H; // 30
const OUTLINER_W = COSMIC.OUTLINER_W;  // 180

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
  damaged:    '!',
};

const FILTER_BTNS = [
  { id: 'all',             label: 'WSZYSTKIE' },
  { id: 'science_vessel',  label: '🛸' },
  { id: 'cargo_ship',      label: '📦' },
  { id: 'colony_ship',     label: '🚢' },
  { id: 'here',            label: '◈ TU' },
];

// ── Styl akcji wg typu ──────────────────────────────────────────────────────
function _actionStyle(actionId, ok) {
  if (!ok) return { bg: THEME.bgTertiary, fg: THEME.textDim, border: THEME.border };
  if (actionId === 'return_home') return { bg: 'rgba(255,51,68,0.12)', fg: THEME.danger, border: THEME.dangerDim };
  if (actionId === 'colonize')    return { bg: 'rgba(170,136,255,0.12)', fg: THEME.purple, border: THEME.purple };
  return { bg: 'rgba(0,255,180,0.06)', fg: THEME.accent, border: THEME.borderActive };
}

// ══════════════════════════════════════════════════════════════════════════════
// FleetManagerOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class FleetManagerOverlay {
  constructor() {
    this._visible = false;
    this._filter  = 'all';
    this._scrollOffset = 0;       // scroll listy statków (LEFT)
    this._selectedVesselId = null;
    this._hoverVesselId = null;
    this._hoverShipId = null;       // hover na przycisku budowy statku → tooltip kosztów
    this._missionConfig = null;   // null | { actionId, targetId, step:'select'|'confirm' }
    this._targetScrollOffset = 0; // scroll listy celów
    this._mapToggles = { routes: true, range: false };
    this._showAtlas = false;      // toggle: mapa ↔ katalog ciał
    this._atlasScrollY = 0;       // scroll katalogu ciał
    this._atlasContentH = 0;      // wysokość zawartości katalogu
    this._atlasVisibleH = 0;      // widoczna wysokość katalogu
    this._hitZones = [];          // { x,y,w,h, type, data }
    this._bounds = null;          // { x,y,w,h } — cały overlay
    this._cachedTargets = null;   // cache celów misji
    this._cachedTargetsKey = '';   // klucz walidacji cache

    // Mapa — zoom i pan
    this._mapZoom = 1.0;          // 1.0 = fit all, >1 = zoom in
    this._mapPanX = 0;            // pan offset w AU
    this._mapPanY = 0;
    this._mapBounds = null;       // { x,y,w,h } — bounds obszaru mapy (do scroll detect)

    // Tooltip ciała na mapie
    this._mapHoverBody = null;    // { body, screenX, screenY } — hover info

    // Drag do przesuwania mapy
    this._mapDragging = false;
    this._mapDragStartX = 0;
    this._mapDragStartY = 0;
    this._mapDragWasDrag = false; // odróżnienie klik od drag
  }

  // ── API publiczne ──────────────────────────────────────────────────────────

  toggle() { this._visible = !this._visible; if (!this._visible) this._close(); }
  open()   { this._visible = true; }
  close()  { this._visible = false; this._close(); }
  get isVisible() { return this._visible; }

  _close() {
    this._missionConfig = null;
    this._targetScrollOffset = 0;
    this._cachedTargets = null;
    this._mapZoom = 1.0;
    this._mapPanX = 0;
    this._mapPanY = 0;
    this._mapHoverBody = null;
    this._mapDragging = false;
    this._mapDragWasDrag = false;
  }

  // ── Główna metoda rysowania ────────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this._visible) return;

    this._hitZones = [];

    // Bounds overlay — nie nakrywamy TopBar, BottomBar, Outliner, Sidebar
    const ox = CIV_SIDEBAR_W;
    const oy = TOP_PAD;
    const ow = W - OUTLINER_W - CIV_SIDEBAR_W;
    const oh = H - TOP_PAD - BOTTOM_PAD;
    this._bounds = { x: ox, y: oy, w: ow, h: oh };

    const centerW = ow - LEFT_W - RIGHT_W;

    // ── Tło ──────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(2,4,5,0.97)';
    ctx.fillRect(ox, oy, ow, oh);

    // Obramowanie
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Separatory kolumn
    ctx.beginPath();
    ctx.moveTo(ox + LEFT_W, oy); ctx.lineTo(ox + LEFT_W, oy + oh);
    ctx.moveTo(ox + ow - RIGHT_W, oy); ctx.lineTo(ox + ow - RIGHT_W, oy + oh);
    ctx.stroke();

    // Przycisk zamknięcia [X] — prawy górny róg
    const closeX = ox + ow - 24;
    const closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✕', closeX, closeY + 14);
    this._hitZones.push({ x: closeX - 4, y: closeY, w: 22, h: 22, type: 'close', data: {} });

    // ── Pobierz dane ────────────────────────────────────────
    const vMgr = window.KOSMOS?.vesselManager;
    const ms   = window.KOSMOS?.missionSystem ?? window.KOSMOS?.expeditionSystem;
    const colMgr = window.KOSMOS?.colonyManager;
    const allVessels = vMgr?.getAllVessels() ?? [];
    const activePid = colMgr?.activePlanetId;

    // Filtruj statki
    const vessels = this._filterVessels(allVessels, activePid);

    // ── Trzy kolumny ────────────────────────────────────────
    this._drawLeft(ctx, ox, oy, LEFT_W, oh, vessels, ms);
    this._drawCenter(ctx, ox + LEFT_W, oy, centerW, oh, allVessels, ms);
    this._drawRight(ctx, ox + ow - RIGHT_W, oy, RIGHT_W, oh, vMgr, ms, colMgr, activePid);
  }

  // ── Obsługa kliknięć ──────────────────────────────────────────────────────

  handleClick(mx, my) {
    if (!this._visible) return false;
    if (!this._bounds) return false;
    // Blokuj kliknięcia gdy DOM modal jest na wierzchu (MissionEventModal, BodyDetailModal itp.)
    if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return false;
    const b = this._bounds;
    if (mx < b.x || mx > b.x + b.w || my < b.y || my > b.y + b.h) return false;

    // Jeśli to był drag mapy — nie dispatch kliknięcia
    if (this._mapDragWasDrag) {
      this._mapDragWasDrag = false;
      return true;
    }

    // Szukaj hit zone (reverse — top-most first)
    for (let i = this._hitZones.length - 1; i >= 0; i--) {
      const z = this._hitZones[i];
      if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._handleHit(z);
        return true;
      }
    }
    return true; // pochłoń klik w overlayu
  }

  handleScroll(delta, mx, my) {
    if (!this._visible || !this._bounds) return false;
    const b = this._bounds;
    if (mx < b.x || mx > b.x + b.w || my < b.y || my > b.y + b.h) return false;

    // Scroll w LEFT (lista statków)
    if (mx < b.x + LEFT_W) {
      this._scrollOffset = Math.max(0, this._scrollOffset + delta * 0.5);
      return true;
    }
    // Scroll w RIGHT (konfigurator celów)
    if (mx > b.x + b.w - RIGHT_W && this._missionConfig?.step === 'select') {
      this._targetScrollOffset = Math.max(0, this._targetScrollOffset + delta * 0.5);
      return true;
    }
    // Scroll w CENTER
    const mb = this._mapBounds;
    if (mb && mx >= mb.x && mx <= mb.x + mb.w && my >= mb.y && my <= mb.y + mb.h) {
      if (this._showAtlas) {
        // Scroll katalogu ciał
        const maxScroll = Math.max(0, this._atlasContentH - this._atlasVisibleH);
        this._atlasScrollY = Math.max(0, Math.min(maxScroll, this._atlasScrollY + delta * 0.5));
      } else {
        // Zoom mapy
        const zoomFactor = delta > 0 ? 0.85 : 1.18;
        const oldZoom = this._mapZoom;
        this._mapZoom = Math.max(0.3, Math.min(30, this._mapZoom * zoomFactor));
        const ratio = this._mapZoom / oldZoom;
        const cx = mb.x + mb.w / 2;
        const cy = mb.y + mb.h / 2;
        this._mapPanX = (this._mapPanX + (mx - cx)) * ratio - (mx - cx);
        this._mapPanY = (this._mapPanY + (my - cy)) * ratio - (my - cy);
      }
      return true;
    }
    return true;
  }

  handleMouseDown(mx, my) {
    if (!this._visible) return false;
    const mb = this._mapBounds;
    if (mb && !this._showAtlas && mx >= mb.x && mx <= mb.x + mb.w && my >= mb.y && my <= mb.y + mb.h) {
      this._mapDragging = true;
      this._mapDragStartX = mx;
      this._mapDragStartY = my;
      this._mapDragWasDrag = false;
      return true;
    }
    return false;
  }

  handleMouseUp(mx, my) {
    if (this._mapDragging) {
      this._mapDragging = false;
      // Jeśli to był drag (nie klik) — pochłoń event
      if (this._mapDragWasDrag) return true;
    }
    return false;
  }

  handleMouseMove(mx, my) {
    if (!this._visible) return;

    // Drag mapy
    if (this._mapDragging) {
      const dx = mx - this._mapDragStartX;
      const dy = my - this._mapDragStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._mapDragWasDrag = true;
      this._mapPanX += dx;
      this._mapPanY += dy;
      this._mapDragStartX = mx;
      this._mapDragStartY = my;
      return;
    }

    // Hover na statku w LEFT
    this._hoverVesselId = null;
    this._hoverShipId = null;
    for (const z of this._hitZones) {
      if (mx < z.x || mx > z.x + z.w || my < z.y || my > z.y + z.h) continue;
      if (z.type === 'vessel') { this._hoverVesselId = z.data.vesselId; break; }
      if (z.type === 'build_ship') { this._hoverShipId = z.data.shipId; break; }
    }
    // Hover na ciele na mapie
    this._mapHoverBody = null;
    for (const z of this._hitZones) {
      if (z.type === 'map_body' && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._mapHoverBody = { bodyId: z.data.bodyId, screenX: z.x + z.w / 2, screenY: z.y + z.h };
        break;
      }
    }
  }

  // ── Hit dispatch ──────────────────────────────────────────────────────────

  _handleHit(zone) {
    switch (zone.type) {
      case 'close':
        this.close();
        break;
      case 'build_ship':
        if (zone.data.enabled) {
          EventBus.emit('fleet:buildRequest', { shipId: zone.data.shipId });
        }
        break;
      case 'filter':
        this._filter = zone.data.filterId;
        this._scrollOffset = 0;
        break;
      case 'vessel':
        // Toggle — kliknięcie tego samego statku odznacza go
        if (this._selectedVesselId === zone.data.vesselId) {
          this._selectedVesselId = null;
        } else {
          this._selectedVesselId = zone.data.vesselId;
        }
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        this._cachedTargets = null;
        break;
      case 'back_to_shipyard':
        this._selectedVesselId = null;
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        this._cachedTargets = null;
        break;
      case 'map_body': {
        const bodyEntity = _findBody(zone.data.bodyId);
        if (bodyEntity) {
          EventBus.emit('body:selected', { entity: bodyEntity });
          showBodyDetailModal(bodyEntity);
        }
        break;
      }
      case 'map_vessel':
        this._selectedVesselId = zone.data.vesselId;
        this._missionConfig = null;
        break;
      case 'map_toggle':
        this._mapToggles[zone.data.key] = !this._mapToggles[zone.data.key];
        break;
      case 'atlas_toggle':
        this._showAtlas = !this._showAtlas;
        this._atlasScrollY = 0;
        break;
      case 'action':
        this._handleAction(zone.data);
        break;
      case 'select_target':
        if (this._missionConfig) {
          this._missionConfig.targetId = zone.data.targetId;
          this._missionConfig.step = 'confirm';
        }
        break;
      case 'confirm_mission':
        this._executeMission();
        break;
      case 'cancel_config':
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        break;
      case 'change_target':
        if (this._missionConfig) {
          this._missionConfig.step = 'select';
          this._missionConfig.targetId = null;
        }
        break;
      case 'rename':
        this._renameVessel(zone.data.vesselId);
        break;
      case 'map_body':
        // Gdy konfigurator aktywny i czeka na cel → wybierz cel z mapy
        if (this._missionConfig?.step === 'select') {
          this._missionConfig.targetId = zone.data.bodyId;
          this._missionConfig.step = 'confirm';
          this._mapHoverBody = null;
          break;
        }
        // Klik na ciało — pokaż/ukryj tooltip
        if (this._mapHoverBody?.bodyId === zone.data.bodyId) {
          this._mapHoverBody = null;
        } else {
          this._mapHoverBody = { bodyId: zone.data.bodyId, screenX: zone.x + zone.w / 2, screenY: zone.y + zone.h };
        }
        break;
      case 'map_planet':
        EventBus.emit('camera:focusTarget', { targetId: zone.data.planetId });
        break;
      case 'cargo_load':
        this._openCargoLoader(zone.data.vesselId);
        break;
    }
  }

  _handleAction(data) {
    const { actionId, vessel } = data;
    const action = FLEET_ACTIONS[actionId];
    if (!action) return;

    // Transport — otwórz CargoLoadModal PRZED target pickerem
    if (actionId === 'transport') {
      this._openCargoThenTarget(vessel);
      return;
    }

    if (action.requiresTarget) {
      // Otwórz target picker
      this._missionConfig = { actionId, targetId: null, step: 'select' };
      this._targetScrollOffset = 0;
      this._cachedTargets = null;
    } else {
      // Wykonaj od razu (np. deep_scan, return_home)
      const ms = window.KOSMOS?.missionSystem ?? window.KOSMOS?.expeditionSystem;
      const colMgr = window.KOSMOS?.colonyManager;
      const state = {
        missionSystem: ms,
        vesselManager: window.KOSMOS?.vesselManager,
        colonyManager: colMgr,
        techSystem: window.KOSMOS?.techSystem,
        activePlanetId: colMgr?.activePlanetId,
      };
      action.execute(vessel, state);
      this._missionConfig = null;
    }
  }

  /**
   * Transport: otwórz modal cargo → po zamknięciu otwórz target picker.
   */
  async _openCargoThenTarget(vessel) {
    try {
      const colony = this._getVesselColony(vessel);
      if (!colony) return;
      await showCargoLoadModal(vessel, colony);
      // Po zamknięciu modal — otwórz target picker
      this._missionConfig = { actionId: 'transport', targetId: null, step: 'select' };
      this._targetScrollOffset = 0;
      this._cachedTargets = null;
    } catch {
      // Anulowano — nic nie rób
    }
  }

  /**
   * Otwórz modal cargo dla statku (przycisk 📦 w RIGHT).
   */
  async _openCargoLoader(vesselId) {
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(vesselId);
    if (!vessel) return;
    const colony = this._getVesselColony(vessel);
    if (!colony) return;
    try { await showCargoLoadModal(vessel, colony); } catch { /* anulowano */ }
  }

  /**
   * Pobierz kolonię statku (do CargoLoadModal).
   */
  _getVesselColony(vessel) {
    const colMgr = window.KOSMOS?.colonyManager;
    return colMgr?.getColony(vessel.colonyId ?? vessel.homeColonyId) ?? null;
  }

  _executeMission() {
    if (!this._missionConfig) return;
    const { actionId, targetId } = this._missionConfig;
    const action = FLEET_ACTIONS[actionId];
    if (!action || !targetId) return;

    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(this._selectedVesselId);
    if (!vessel) return;

    const ms = window.KOSMOS?.missionSystem ?? window.KOSMOS?.expeditionSystem;
    const colMgr = window.KOSMOS?.colonyManager;
    const state = {
      missionSystem: ms,
      vesselManager: vMgr,
      colonyManager: colMgr,
      techSystem: window.KOSMOS?.techSystem,
      activePlanetId: colMgr?.activePlanetId,
      targetId,
      cargo: vessel.cargo ?? {},
    };
    action.execute(vessel, state);
    this._missionConfig = null;
    this._targetScrollOffset = 0;
  }

  async _renameVessel(vesselId) {
    try {
      const { showRenameModal } = await import('../ui/ModalInput.js');
      const newName = await showRenameModal('Zmień nazwę statku');
      if (newName) {
        EventBus.emit('vessel:rename', { vesselId, name: newName });
      }
    } catch { /* anulowano */ }
  }

  // ── Filtrowanie statków ───────────────────────────────────────────────────

  _filterVessels(allVessels, activePid) {
    if (this._filter === 'all') return allVessels;
    if (this._filter === 'here') {
      return allVessels.filter(v => v.colonyId === activePid);
    }
    return allVessels.filter(v => v.shipId === this._filter);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEFT — lista statków
  // ══════════════════════════════════════════════════════════════════════════

  _drawLeft(ctx, x, y, w, h, vessels, ms) {
    const pad = 8;

    // ── Nagłówek (h=36) ──────────────────────────────────────
    ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`FLOTA [${vessels.length}]`, x + pad, y + 22);

    // Podsumowanie statusów
    let idle = 0, mission = 0, orbit = 0;
    for (const v of vessels) {
      if (v.position.state === 'docked' && v.status === 'idle') idle++;
      else if (v.position.state === 'in_transit') mission++;
      else if (v.position.state === 'orbiting') orbit++;
    }
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const summary = `✓${idle}  →${mission}  ⊙${orbit}`;
    ctx.textAlign = 'right';
    ctx.fillText(summary, x + w - pad, y + 22);
    ctx.textAlign = 'left';

    // ── Filtry (h=28) ────────────────────────────────────────
    const filterY = y + 36;
    let fx = x + pad;
    for (const btn of FILTER_BTNS) {
      const active = this._filter === btn.id;
      const tw = ctx.measureText(btn.label).width + 12;
      const bw = Math.max(tw, 28);

      ctx.fillStyle = active ? 'rgba(0,255,180,0.12)' : THEME.bgTertiary;
      ctx.fillRect(fx, filterY, bw, 20);
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(fx, filterY, bw, 20);

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
      ctx.fillText(btn.label, fx + 6, filterY + 14);

      this._hitZones.push({ x: fx, y: filterY, w: bw, h: 20, type: 'filter', data: { filterId: btn.id } });
      fx += bw + 4;
    }

    // ── Lista statków (scrollowalna) ─────────────────────────
    const listY = filterY + 28;
    const listH = h - (listY - y);
    const rowH = 52;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY - this._scrollOffset;
    for (const vessel of vessels) {
      if (ry + rowH < listY) { ry += rowH; continue; }
      if (ry > listY + listH) break;

      const selected = vessel.id === this._selectedVesselId;
      const hovered  = vessel.id === this._hoverVesselId;

      // Tło wiersza
      if (selected) {
        ctx.fillStyle = 'rgba(0,255,180,0.06)';
        ctx.fillRect(x, ry, w, rowH);
        // Border-left accent
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(x, ry, 2, rowH);
      } else if (hovered) {
        ctx.fillStyle = 'rgba(0,255,180,0.03)';
        ctx.fillRect(x, ry, w, rowH);
      }

      // Ikona statku
      const ship = SHIPS[vessel.shipId];
      const icon = ship?.icon ?? '🚀';
      ctx.font = `14px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(icon, x + pad, ry + 20);

      // Ikona statusu
      const stateIcon = STATUS_ICONS[vessel.status] ?? STATUS_ICONS[vessel.position.state] ?? '?';
      const stateColor = (STATUS_COLORS[vessel.position.state] ?? (() => THEME.textSecondary))();
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = stateColor;
      ctx.fillText(stateIcon, x + pad + 20, ry + 20);

      // Nazwa statku
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      const vName = vessel.name.length > 16 ? vessel.name.slice(0, 15) + '…' : vessel.name;
      ctx.fillText(vName, x + pad + 32, ry + 18);

      // Lokalizacja (mniejszy tekst)
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      const locText = this._getLocationText(vessel);
      ctx.fillText(locText, x + pad + 32, ry + 32);

      // Pasek paliwa (60px)
      const fuelPct = vessel.fuel.max > 0 ? vessel.fuel.current / vessel.fuel.max : 0;
      const barX = x + w - pad - 64;
      const barY = ry + 14;
      const barW = 56;
      const barH = 6;
      ctx.fillStyle = THEME.bgTertiary;
      ctx.fillRect(barX, barY, barW, barH);
      const fuelColor = fuelPct > 0.5 ? THEME.success : fuelPct > 0.2 ? THEME.warning : THEME.danger;
      ctx.fillStyle = fuelColor;
      ctx.fillRect(barX, barY, Math.round(barW * fuelPct), barH);
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      // Fuel text
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      ctx.fillText(`${vessel.fuel.current.toFixed(1)}/${vessel.fuel.max}`, barX + barW, ry + 34);
      ctx.textAlign = 'left';

      // Separator
      ctx.strokeStyle = 'rgba(0,255,180,0.07)';
      ctx.beginPath(); ctx.moveTo(x + pad, ry + rowH - 1); ctx.lineTo(x + w - pad, ry + rowH - 1); ctx.stroke();

      this._hitZones.push({ x, y: Math.max(ry, listY), w, h: rowH, type: 'vessel', data: { vesselId: vessel.id } });
      ry += rowH;
    }

    // Ograniczenie scrollu
    const maxScroll = Math.max(0, vessels.length * rowH - listH);
    if (this._scrollOffset > maxScroll) this._scrollOffset = maxScroll;

    ctx.restore();

    // Scroll indicator
    if (vessels.length * rowH > listH) {
      const totalContentH = vessels.length * rowH;
      const thumbH = Math.max(20, (listH / totalContentH) * listH);
      const thumbY = listY + (this._scrollOffset / totalContentH) * listH;
      ctx.fillStyle = 'rgba(0,255,180,0.15)';
      ctx.fillRect(x + w - 4, thumbY, 3, thumbH);
    }
  }

  _getLocationText(vessel) {
    if (vessel.position.state === 'docked') {
      const body = _findBody(vessel.position.dockedAt);
      return `Hangar: ${body?.name ?? vessel.position.dockedAt}`;
    }
    if (vessel.position.state === 'orbiting') {
      const body = _findBody(vessel.position.dockedAt);
      return `Orbita: ${body?.name ?? '?'}`;
    }
    // W locie — pokaż cel
    if (vessel.mission?.targetId) {
      const target = _findBody(vessel.mission.targetId);
      return `→ ${target?.name ?? vessel.mission.targetId}`;
    }
    return 'W locie';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CENTER — mapa schematyczna
  // ══════════════════════════════════════════════════════════════════════════

  _drawCenter(ctx, x, y, w, h, allVessels, ms) {
    const pad = 8;

    // ── Nagłówek (h=32) ──────────────────────────────────────
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(this._showAtlas ? 'STAR ATLAS' : 'WIDOK UKŁADU', x + pad, y + 20);

    // Zoom label — tylko w trybie mapy
    if (!this._showAtlas) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`×${this._mapZoom.toFixed(1)}`, x + pad + 100, y + 20);
    }

    // Toggle: STAR ATLAS / TRASY / ZASIĘG
    const toggleY = y + 6;
    let tbx = x + w - pad;

    // TRASY / ZASIĘG — widoczne tylko w trybie mapy
    if (!this._showAtlas) {
      for (const key of ['range', 'routes']) {
        const label = key === 'routes' ? 'TRASY' : 'ZASIĘG';
        const active = this._mapToggles[key];
        const tw = 50;
        tbx -= tw + 4;
        ctx.fillStyle = active ? 'rgba(0,255,180,0.12)' : 'transparent';
        ctx.fillRect(tbx, toggleY, tw, 18);
        ctx.strokeStyle = active ? THEME.accent : THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(tbx, toggleY, tw, 18);
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = active ? THEME.accent : THEME.textDim;
        ctx.textAlign = 'center';
        ctx.fillText(label, tbx + tw / 2, toggleY + 13);
        ctx.textAlign = 'left';
        this._hitZones.push({ x: tbx, y: toggleY, w: tw, h: 18, type: 'map_toggle', data: { key } });
      }
    }

    // Przycisk STAR ATLAS
    {
      const atlasTw = 76;
      tbx -= atlasTw + 4;
      const atOn = this._showAtlas;
      ctx.fillStyle = atOn ? 'rgba(0,255,180,0.15)' : 'transparent';
      ctx.fillRect(tbx, toggleY, atlasTw, 18);
      ctx.strokeStyle = atOn ? THEME.accent : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(tbx, toggleY, atlasTw, 18);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = atOn ? THEME.accent : THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('STAR ATLAS', tbx + atlasTw / 2, toggleY + 13);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: tbx, y: toggleY, w: atlasTw, h: 18, type: 'atlas_toggle', data: {} });
    }

    // ── Obszar mapy / katalogu (clip) ───────────────────────
    const mapY = y + 32;
    const mapH = h - 32;
    this._mapBounds = { x, y: mapY, w, h: mapH };

    // Tryb STAR ATLAS — katalog ciał zamiast mapy
    if (this._showAtlas) {
      this._drawAtlasCatalog(ctx, x, mapY, w, mapH, allVessels);
      return;
    }

    const mapCx = x + w / 2 + this._mapPanX;
    const mapCy = mapY + mapH / 2 + this._mapPanY;
    const baseRadius = Math.min(w / 2, mapH / 2) - 20;
    const mapRadius = baseRadius * this._mapZoom;

    // Tło mapy — nieprzezroczyste
    ctx.fillStyle = 'rgba(2,4,5,0.97)';
    ctx.fillRect(x + 1, mapY, w - 2, mapH - 1);

    // Clip do obszaru mapy
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, mapY, w - 2, mapH - 1);
    ctx.clip();

    // ── Zbierz WSZYSTKIE ciała ──────────────────────────────
    const planets    = EntityManager.getByType('planet') ?? [];
    const moons      = EntityManager.getByType('moon') ?? [];
    const planetoids = EntityManager.getByType('planetoid') ?? [];
    const asteroids  = EntityManager.getByType('asteroid') ?? [];
    const comets     = EntityManager.getByType('comet') ?? [];
    const stars      = EntityManager.getByType('star') ?? [];

    // Skala: max orbit AU → mapRadius (base, bez zoom)
    let maxOrbitAU = 1;
    for (const p of planets) {
      const a = p.orbital?.a ?? 0;
      if (a > maxOrbitAU) maxOrbitAU = a;
    }
    for (const pd of planetoids) {
      const a = pd.orbital?.a ?? 0;
      if (a > maxOrbitAU) maxOrbitAU = a;
    }
    maxOrbitAU *= 1.15;
    const auToPx = mapRadius / maxOrbitAU;

    // Helper: AU coords → screen px
    const toSx = (bodyX) => (bodyX ?? 0) / GAME_CONFIG.AU_TO_PX * auToPx + mapCx;
    const toSy = (bodyY) => (bodyY ?? 0) / GAME_CONFIG.AU_TO_PX * auToPx + mapCy;

    const homePid = window.KOSMOS?.homePlanet?.id;
    const colMgr  = window.KOSMOS?.colonyManager;

    // ── Gwiazda ─────────────────────────────────────────────
    const starR = Math.max(3, 5 * this._mapZoom);
    ctx.beginPath();
    ctx.arc(mapCx, mapCy, starR, 0, Math.PI * 2);
    ctx.fillStyle = THEME.yellow;
    ctx.fill();
    // Glow
    const grad = ctx.createRadialGradient(mapCx, mapCy, starR, mapCx, mapCy, starR * 3);
    grad.addColorStop(0, 'rgba(255,200,60,0.25)');
    grad.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(mapCx, mapCy, starR * 3, 0, Math.PI * 2); ctx.fill();

    if (stars[0]) {
      this._hitZones.push({
        x: mapCx - 10, y: mapCy - 10, w: 20, h: 20,
        type: 'map_body', data: { bodyId: stars[0].id },
      });
    }

    // ── Orbity planet ───────────────────────────────────────
    ctx.strokeStyle = 'rgba(0,255,180,0.055)';
    ctx.lineWidth = 1;
    for (const p of planets) {
      const orbitR = (p.orbital?.a ?? 0) * auToPx;
      if (orbitR > 2) {
        ctx.beginPath();
        ctx.arc(mapCx, mapCy, orbitR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ── Wszystkie ciała — rysuj i rejestruj hit zones ───────

    // Planetoidy
    for (const pd of planetoids) {
      const px = toSx(pd.x), py = toSy(pd.y);
      const r = Math.max(2, 2.5 * Math.min(this._mapZoom, 2));
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = pd.explored ? 'rgba(160,180,200,0.6)' : 'rgba(100,136,170,0.3)';
      ctx.fill();
      this._hitZones.push({ x: px - 8, y: py - 8, w: 16, h: 16, type: 'map_body', data: { bodyId: pd.id } });
    }

    // Asteroidy
    for (const a of asteroids) {
      const px = toSx(a.x), py = toSy(a.y);
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(140,120,100,0.4)';
      ctx.fill();
      this._hitZones.push({ x: px - 6, y: py - 6, w: 12, h: 12, type: 'map_body', data: { bodyId: a.id } });
    }

    // Komety
    for (const c of comets) {
      const px = toSx(c.x), py = toSy(c.y);
      ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,200,255,0.5)';
      ctx.fill();
      this._hitZones.push({ x: px - 6, y: py - 6, w: 12, h: 12, type: 'map_body', data: { bodyId: c.id } });
    }

    // Księżyce
    for (const m of moons) {
      const px = toSx(m.x), py = toSy(m.y);
      const r = Math.max(2, 2.5 * Math.min(this._mapZoom, 2));
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = m.explored ? 'rgba(180,200,220,0.7)' : 'rgba(120,150,180,0.4)';
      ctx.fill();
      if (this._mapZoom >= 2) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText((m.name ?? '').slice(0, 5), px + r + 2, py + 3);
      }
      this._hitZones.push({ x: px - 8, y: py - 8, w: 16, h: 16, type: 'map_body', data: { bodyId: m.id } });
    }

    // Planety (na wierzchu)
    for (const p of planets) {
      const px = toSx(p.x), py = toSy(p.y);
      const isHome = p.id === homePid;
      const hasColony = colMgr?.hasColony(p.id);
      const r = Math.max(3, (isHome ? 5 : hasColony ? 4 : 3) * Math.min(this._mapZoom, 2.5));

      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = isHome ? THEME.accent : hasColony ? THEME.mint : THEME.textSecondary;
      ctx.fill();

      // Label — widoczny zawsze
      const label = (p.name ?? p.id).slice(0, this._mapZoom >= 1.5 ? 8 : 3);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(label, px + r + 2, py + 3);

      this._hitZones.push({ x: px - 10, y: py - 10, w: 20, h: 20, type: 'map_body', data: { bodyId: p.id } });
    }

    // ── Misje aktywne (linie + ikona misji) ─────────────────
    const missions = ms?.getActive?.() ?? [];
    for (const m of missions) {
      if (!m.vesselId) continue;
      const vMgr = window.KOSMOS?.vesselManager;
      const vessel = vMgr?.getVessel(m.vesselId);
      if (!vessel) continue;

      const vx = toSx(vessel.position.x), vy = toSy(vessel.position.y);
      const target = _findBody(m.targetId);

      // Linia misji: statek → cel
      if (target) {
        const tpx = toSx(target.x), tpy = toSy(target.y);
        const isSel = vessel.id === this._selectedVesselId;

        // Kolor wg typu misji
        let routeColor = 'rgba(255,204,68,0.4)';
        if (m.type === 'recon' || m.type === 'survey' || m.type === 'deep_scan')
          routeColor = 'rgba(0,204,255,0.5)';
        else if (m.type === 'colony') routeColor = 'rgba(170,136,255,0.5)';
        else if (m.type === 'transport') routeColor = 'rgba(255,204,68,0.5)';
        else if (m.type === 'scientific') routeColor = 'rgba(0,238,136,0.5)';
        if (isSel) routeColor = THEME.accent;

        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = routeColor;
        ctx.lineWidth = isSel ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(tpx, tpy); ctx.stroke();
        ctx.setLineDash([]);

        // Ikona misji (połowa drogi)
        if (vessel.position.state === 'in_transit') {
          const midX = (vx + tpx) / 2, midY = (vy + tpy) / 2;
          const mIcon = m.type === 'recon' || m.type === 'survey' ? '🔭'
            : m.type === 'scientific' ? '🔬'
            : m.type === 'colony' ? '🚢'
            : m.type === 'transport' ? '📦'
            : m.type === 'mining' ? '⛏' : '→';
          ctx.font = `10px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textPrimary;
          ctx.fillText(mIcon, midX - 5, midY + 4);
        }
      }

      // Status badge na orbicie
      if (vessel.position.state === 'orbiting' && target) {
        const tpx = toSx(target.x), tpy = toSy(target.y);
        ctx.strokeStyle = THEME.mint;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.arc(tpx, tpy, 10 * Math.min(this._mapZoom, 2), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── Zasięg wybranego statku ─────────────────────────────
    if (this._mapToggles.range && this._selectedVesselId) {
      const vMgr = window.KOSMOS?.vesselManager;
      const selV = vMgr?.getVessel(this._selectedVesselId);
      if (selV) {
        const range = effectiveRange(selV);
        const rangeR = range * auToPx;
        const svx = toSx(selV.position.x), svy = toSy(selV.position.y);
        ctx.setLineDash([6, 3]);
        ctx.strokeStyle = 'rgba(0,255,180,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(svx, svy, rangeR, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── Statki (kropki — na wierzchu) ───────────────────────
    for (const v of allVessels) {
      const vx = toSx(v.position.x), vy = toSy(v.position.y);
      const isSel = v.id === this._selectedVesselId;
      const r = isSel ? 4 : 3;
      const color = isSel ? THEME.accent
        : v.position.state === 'docked' ? THEME.success
        : v.position.state === 'orbiting' ? THEME.mint
        : THEME.warning;

      ctx.beginPath(); ctx.arc(vx, vy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSel) {
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(vx, vy, r + 2, 0, Math.PI * 2); ctx.stroke();
      }

      // Label statku przy zoom
      if (this._mapZoom >= 2) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = color;
        ctx.fillText((v.name ?? '').slice(0, 8), vx + r + 3, vy + 3);
      }

      this._hitZones.push({
        x: vx - 10, y: vy - 10, w: 20, h: 20,
        type: 'map_vessel', data: { vesselId: v.id },
      });
    }

    ctx.restore(); // koniec clip

    // ── Legenda (poza clip) ─────────────────────────────────
    const legX = x + w - 140;
    const legY2 = mapY + 8;
    ctx.fillStyle = 'rgba(2,4,5,0.88)';
    ctx.fillRect(legX, legY2, 132, 90);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(legX, legY2, 132, 90);

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    const legendItems = [
      { color: THEME.accent,        label: '● Planeta macierzysta' },
      { color: THEME.mint,          label: '● Kolonia' },
      { color: THEME.textSecondary, label: '● Planeta' },
      { color: THEME.success,       label: '● Statek (hangar)' },
      { color: THEME.warning,       label: '● Statek (w locie)' },
      { color: THEME.mint,          label: '● Statek (orbita)' },
    ];
    let ly = legY2 + 12;
    for (const item of legendItems) {
      ctx.fillStyle = item.color;
      ctx.fillText(item.label, legX + 6, ly);
      ly += 13;
    }

    // ── Tooltip ciała (na hover/klik) ───────────────────────
    if (this._mapHoverBody) {
      this._drawBodyTooltip(ctx, x, mapY, w, mapH);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STAR ATLAS — katalog ciał niebieskich (zamiast mapy schematycznej)
  // ══════════════════════════════════════════════════════════════════════════

  _drawAtlasCatalog(ctx, x, y, w, h) {
    const PAD = 10;
    const ROW_H = 32;
    let cy = y + 6;

    // Tło
    ctx.fillStyle = 'rgba(2,4,5,0.97)';
    ctx.fillRect(x + 1, y, w - 2, h - 1);

    // Nagłówek
    const entries = this._getAllCatalogBodies();
    const exploredCount = entries.filter(e => e.explored).length;

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText('KATALOG CIAŁ NIEBIESKICH', x + PAD, cy + 10);

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(`Zbadane: ${exploredCount}/${entries.length}`, x + w - PAD, cy + 10);
    ctx.textAlign = 'left';
    cy += 18;

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 4;

    if (entries.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Brak ciał w układzie', x + PAD, cy + 12);
      this._atlasContentH = 0;
      this._atlasVisibleH = 0;
      return;
    }

    // Scroll + clip
    const visibleH = h - (cy - y) - 2;
    this._atlasVisibleH = visibleH;
    this._atlasContentH = entries.length * ROW_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, cy, w, visibleH);
    ctx.clip();

    const scrollY = this._atlasScrollY || 0;
    let ry = cy - scrollY;

    const colMgr = window.KOSMOS?.colonyManager;

    for (const entry of entries) {
      const { body, explored } = entry;
      const isMoon = !!entry.isMoon;
      const indent = isMoon ? 14 : 0;

      // Cull poza widocznością
      if (ry + ROW_H < cy - 2) { ry += ROW_H; continue; }
      if (ry > cy + visibleH + 2) break;

      // Hover highlight
      const isHover = this._mapHoverBody?.bodyId === body.id;
      if (isHover) {
        ctx.fillStyle = 'rgba(0,255,180,0.06)';
        ctx.fillRect(x + 1, ry, w - 2, ROW_H);
      }

      // Kolonia marker
      const hasColony = colMgr?.hasColony(body.id);

      const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
      const orbA = body.orbital?.a ?? 0;
      const distHome = DistanceUtils.orbitalFromHomeAU(body);

      if (explored) {
        // Nazwa
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = hasColony ? THEME.mint : isMoon ? THEME.textSecondary : THEME.textPrimary;
        const namePrefix = isMoon ? '└ ' : '';
        const targetMark = body._markedAsTarget ? '🎯' : '';
        const nameStr = `${namePrefix}${icon} ${(body.name ?? body.id).slice(0, isMoon ? 10 : 16)}${targetMark}`;
        ctx.fillText(nameStr, x + PAD + indent, ry + 12);

        // Typ + temperatura
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        const typeStr = body.planetType ?? body.subType ?? body.type;
        const tempStr = body.temperatureK ? ` ${Math.round(body.temperatureK - 273)}°C` : '';
        ctx.fillText(`${typeStr}${tempStr}`, x + PAD + indent, ry + 25);

        // Odległości (prawo)
        ctx.textAlign = 'right';
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`${orbA.toFixed(2)} AU`, x + w - PAD, ry + 12);

        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`🏠 ${distHome.toFixed(1)} AU`, x + w - PAD, ry + 25);

        // Złoża (środek-prawo)
        const deps = body.deposits ?? [];
        if (deps.length > 0) {
          const topDeps = [...deps].filter(d => d.remaining > 0).sort((a, b) => b.richness - a.richness).slice(0, 3);
          const depStr = topDeps.map(d => {
            const stars = d.richness >= 0.7 ? '★★★' : d.richness >= 0.4 ? '★★' : '★';
            return `${d.resourceId}${stars}`;
          }).join(' ');
          ctx.fillStyle = THEME.yellow;
          const depX = x + w / 2 + 30;
          ctx.textAlign = 'left';
          ctx.fillText(depStr, depX, ry + 25);
        }

        ctx.textAlign = 'left';

        // Kolonia badge
        if (hasColony) {
          const col = colMgr.getColony(body.id);
          const pop = col?.civSystem?.population ?? 0;
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.mint;
          ctx.fillText(`● ${pop} POP`, x + PAD + indent + ctx.measureText(nameStr).width + 6, ry + 12);
        }
      } else {
        // Niezbadane
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        const namePrefix = isMoon ? '└ ' : '';
        ctx.fillText(`${namePrefix}${icon} ???`, x + PAD + indent, ry + 12);

        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(body.type === 'planet' ? 'planeta' : body.type === 'moon' ? 'księżyc' : 'planetoid', x + PAD + indent, ry + 25);

        ctx.textAlign = 'right';
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`${orbA.toFixed(2)} AU`, x + w - PAD, ry + 12);
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`🏠 ${distHome.toFixed(1)} AU`, x + w - PAD, ry + 25);
        ctx.textAlign = 'left';
      }

      // Hit zone — do hover/tooltip i wyboru celu
      this._hitZones.push({
        x: x + 1, y: ry, w: w - 2, h: ROW_H,
        type: 'map_body', data: { bodyId: body.id },
      });

      // Separator wierszy
      ctx.strokeStyle = 'rgba(40,60,80,0.2)';
      ctx.beginPath(); ctx.moveTo(x + PAD, ry + ROW_H - 1); ctx.lineTo(x + w - PAD, ry + ROW_H - 1); ctx.stroke();

      ry += ROW_H;
    }

    ctx.restore();

    // Scrollbar
    if (this._atlasContentH > visibleH) {
      const sbH = Math.max(10, visibleH * (visibleH / this._atlasContentH));
      const maxScroll = this._atlasContentH - visibleH;
      const sbY = cy + (scrollY / maxScroll) * (visibleH - sbH);
      ctx.fillStyle = 'rgba(0,255,180,0.25)';
      ctx.fillRect(x + w - 4, sbY, 3, sbH);
    }

    // Tooltip ciała (na hover)
    if (this._mapHoverBody) {
      this._drawBodyTooltip(ctx, x, y, w, h);
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
    // Księżyce planety macierzystej na górze
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

  // ── Tooltip informacji o ciele niebieskim ─────────────────────────────────

  _drawBodyTooltip(ctx, areaX, areaY, areaW, areaH) {
    const { bodyId, screenX, screenY } = this._mapHoverBody;
    const body = _findBody(bodyId);
    // Gwiazda
    if (!body) {
      const stars = EntityManager.getByType('star') ?? [];
      const star = stars.find(s => s.id === bodyId);
      if (!star) { this._mapHoverBody = null; return; }
      return this._drawTooltipBox(ctx, screenX, screenY, areaX, areaY, areaW, areaH, [
        { text: `⭐ ${star.name ?? 'Gwiazda'}`, color: THEME.yellow, bold: true },
        { text: `Typ: ${star.spectralType ?? star.starType ?? '?'}`, color: THEME.textSecondary },
        { text: `Masa: ${(star.mass ?? 0).toFixed(2)} M☉`, color: THEME.textSecondary },
        { text: `T: ${Math.round(star.temperatureK ?? 0)} K`, color: THEME.textSecondary },
      ]);
    }

    const explored = body.explored ?? false;
    const colMgr = window.KOSMOS?.colonyManager;
    const hasColony = colMgr?.hasColony(body.id);
    const distAU = this._bodyDistFromStar(body);

    // Ikona wg typu
    const icons = { planet: '🌍', moon: '🌙', planetoid: '🪨', asteroid: '☄', comet: '💫' };
    const icon = icons[body.type] ?? '?';

    const lines = [];
    lines.push({ text: `${icon} ${body.name ?? body.id}`, color: THEME.textPrimary, bold: true });
    lines.push({ text: `Typ: ${body.planetType ?? body.subType ?? body.type}`, color: THEME.textSecondary });
    lines.push({ text: `Odległość: ${distAU.toFixed(2)} AU`, color: THEME.textSecondary });

    if (explored) {
      lines.push({ text: `Status: zbadane ✓`, color: THEME.success });
      if (body.temperatureK) {
        const tempC = Math.round(body.temperatureK - 273);
        lines.push({ text: `Temp: ${tempC > 0 ? '+' : ''}${tempC}°C`, color: THEME.textSecondary });
      }
      if (body.orbital?.a) {
        lines.push({ text: `Orbita: ${body.orbital.a.toFixed(2)} AU`, color: THEME.textSecondary });
      }
      // Atmosfera
      const atm = body.atmosphere || 'none';
      const atmLabels = { dense: 'Gęsta', thick: 'Gęsta', thin: 'Cienka', none: 'Brak' };
      let atmText = atmLabels[atm] || atm;
      if (body.breathableAtmosphere) atmText += ' ✅';
      const atmIcon = atm === 'none' ? '' : '☁ ';
      const atmColor = atm === 'none' ? THEME.textDim : body.breathableAtmosphere ? THEME.success : THEME.textSecondary;
      lines.push({ text: `${atmIcon}Atmosfera: ${atmText}`, color: atmColor });
      if (hasColony) {
        const col = colMgr.getColony(body.id);
        const pop = col?.civSystem?.population ?? 0;
        lines.push({ text: `Kolonia: ${pop} POP`, color: THEME.mint });
      }
      // Pełna lista złóż
      const deps = body.deposits ?? [];
      const activeDeps = deps.filter(d => d.remaining > 0).sort((a, b) => b.richness - a.richness);
      if (activeDeps.length > 0) {
        lines.push({ text: `── Złoża ──`, color: THEME.textDim });
        for (const d of activeDeps) {
          const stars = d.richness >= 0.7 ? '★★★' : d.richness >= 0.4 ? '★★' : '★';
          const pct = Math.round((d.remaining / d.totalAmount) * 100);
          lines.push({ text: `  ${d.resourceId} ${stars}  ${pct}% (${d.remaining}/${d.totalAmount})`, color: THEME.yellow });
        }
      } else if (deps.length > 0) {
        lines.push({ text: `Złoża: wyczerpane`, color: THEME.textDim });
      } else {
        lines.push({ text: `Złoża: brak`, color: THEME.textDim });
      }
    } else {
      lines.push({ text: `Status: niezbadane`, color: THEME.warning });
      lines.push({ text: `Dane: ???`, color: THEME.textDim });
    }

    this._drawTooltipBox(ctx, screenX, screenY, areaX, areaY, areaW, areaH, lines);
  }

  _drawTooltipBox(ctx, sx, sy, areaX, areaY, areaW, areaH, lines) {
    const padX = 8, padY = 6, lineH = 14;
    const boldFont  = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const normFont  = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;

    // Mierz szerokość
    let maxW = 0;
    for (const l of lines) {
      ctx.font = l.bold ? boldFont : normFont;
      maxW = Math.max(maxW, ctx.measureText(l.text).width);
    }
    const ttW = maxW + padX * 2 + 4;
    const ttH = padY * 2 + lines.length * lineH;

    // Pozycja — pod/obok klikniętego ciała, w granicach mapy
    let ttX = sx - ttW / 2;
    let ttY = sy + 12;
    if (ttX < areaX + 4) ttX = areaX + 4;
    if (ttX + ttW > areaX + areaW - 4) ttX = areaX + areaW - ttW - 4;
    if (ttY + ttH > areaY + areaH - 4) ttY = sy - ttH - 12;
    if (ttY < areaY + 4) ttY = areaY + 4;

    // Tło
    ctx.fillStyle = 'rgba(2,4,5,0.95)';
    ctx.fillRect(ttX, ttY, ttW, ttH);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(ttX, ttY, ttW, ttH);

    // Linie
    let ty = ttY + padY;
    for (const l of lines) {
      ctx.font = l.bold ? boldFont : normFont;
      ctx.fillStyle = l.color ?? THEME.textSecondary;
      ctx.textAlign = 'left';
      ctx.fillText(l.text, ttX + padX, ty + 10);
      ty += lineH;
    }
  }

  _bodyDistFromStar(body) {
    const bx = (body.x ?? 0) / GAME_CONFIG.AU_TO_PX;
    const by = (body.y ?? 0) / GAME_CONFIG.AU_TO_PX;
    return Math.sqrt(bx * bx + by * by);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RIGHT — szczegóły statku + akcje + konfigurator
  // ══════════════════════════════════════════════════════════════════════════

  _drawRight(ctx, x, y, w, h, vMgr, ms, colMgr, activePid) {
    const pad = 10;

    if (!this._selectedVesselId) {
      this._drawShipyard(ctx, x, y, w, h, colMgr, activePid);
      return;
    }

    const vessel = vMgr?.getVessel(this._selectedVesselId);
    if (!vessel) {
      this._selectedVesselId = null;
      return;
    }

    const ship = SHIPS[vessel.shipId];
    let cy = y + pad;

    // ── Przycisk powrotu do Stoczni ────────────────────────
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const backLabel = '← Stocznia';
    ctx.fillText(backLabel, x + pad, cy + 10);
    const backW = ctx.measureText(backLabel).width + 4;
    this._hitZones.push({ x: x + pad - 2, y: cy, w: backW, h: 16, type: 'back_to_shipyard', data: {} });
    cy += 18;

    // ── Nagłówek ──────────────────────────────────────
    // Ikona + nazwa + typ
    ctx.font = `16px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(ship?.icon ?? '🚀', x + pad, cy + 18);

    ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    const nameText = vessel.name.length > 18 ? vessel.name.slice(0, 17) + '…' : vessel.name;
    ctx.fillText(nameText, x + pad + 24, cy + 16);

    // Przycisk rename (✎)
    const renX = x + pad + 24 + ctx.measureText(nameText).width + 6;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✎', renX, cy + 16);
    this._hitZones.push({ x: renX - 2, y: cy + 4, w: 14, h: 16, type: 'rename', data: { vesselId: vessel.id } });

    // Typ statku
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(ship?.namePL ?? vessel.shipId, x + pad + 24, cy + 32);

    cy += 44;

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    // ── Stats grid (2×2) ─────────────────────────────────────
    const gridW = (w - pad * 2) / 2;
    const gridH = 30;
    const stats = [
      { label: 'STATUS',      value: this._statusText(vessel), color: (STATUS_COLORS[vessel.position.state] ?? (() => THEME.textSecondary))() },
      { label: 'PRĘDKOŚĆ',    value: `${((ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1)).toFixed(1)} AU/r`, color: THEME.textPrimary },
      { label: 'BAZA',        value: this._baseText(vessel), color: THEME.textPrimary },
      { label: 'DOŚWIADCZENIE', value: this._xpStars(vessel), color: THEME.yellow },
    ];
    for (let i = 0; i < stats.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = x + pad + col * gridW;
      const sy = cy + row * gridH;

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(stats[i].label, sx, sy + 10);

      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = stats[i].color;
      ctx.fillText(stats[i].value, sx, sy + 24);
    }
    cy += gridH * 2 + 4;

    // ── Pasek paliwa (h=36) ──────────────────────────────────
    const fuelPct = vessel.fuel.max > 0 ? vessel.fuel.current / vessel.fuel.max : 0;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('PALIWO', x + pad, cy + 10);

    ctx.fillStyle = THEME.textPrimary;
    ctx.textAlign = 'right';
    ctx.fillText(`${vessel.fuel.current.toFixed(1)} / ${vessel.fuel.max} pc`, x + w - pad, cy + 10);
    ctx.textAlign = 'left';

    const fBarX = x + pad;
    const fBarY = cy + 16;
    const fBarW = w - pad * 2;
    const fBarH = 8;
    ctx.fillStyle = THEME.bgTertiary;
    ctx.fillRect(fBarX, fBarY, fBarW, fBarH);
    const fColor = fuelPct > 0.5 ? THEME.success : fuelPct > 0.2 ? THEME.warning : THEME.danger;
    ctx.fillStyle = fColor;
    ctx.fillRect(fBarX, fBarY, Math.round(fBarW * fuelPct), fBarH);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(fBarX, fBarY, fBarW, fBarH);

    cy += 32;

    // ── Przycisk Cargo (dla statków z ładownią) ──────────────
    if (ship?.cargoCapacity > 0 && vessel.position.state === 'docked') {
      const cargoUsed = vessel.cargoUsed ?? 0;
      const cargoBtnW = w - pad * 2;
      const cargoBtnH = 24;
      ctx.fillStyle = 'rgba(255,204,68,0.08)';
      ctx.fillRect(x + pad, cy, cargoBtnW, cargoBtnH);
      ctx.strokeStyle = THEME.warning;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, cargoBtnW, cargoBtnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`📦 Cargo: ${Math.round(cargoUsed)} / ${ship.cargoCapacity} t`, x + pad + 8, cy + 16);
      this._hitZones.push({
        x: x + pad, y: cy, w: cargoBtnW, h: cargoBtnH,
        type: 'cargo_load', data: { vesselId: vessel.id },
      });
      cy += cargoBtnH + 6;
    }

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    // ── Aktywna misja (h=~80) ────────────────────────────────
    const activeMissions = ms?.getActive?.() ?? [];
    const mission = activeMissions.find(m => m.vesselId === vessel.id);
    if (mission) {
      cy = this._drawActiveMission(ctx, x, cy, w, pad, mission, vessel);
    }

    // ── Konfigurator misji (jeśli aktywny) ───────────────────
    if (this._missionConfig) {
      this._drawMissionConfig(ctx, x, cy, w, h - (cy - y), pad, vessel, ms, colMgr);
      return; // Konfigurator zastępuje akcje i log
    }

    // ── Akcje ────────────────────────────────────────────────
    cy = this._drawActions(ctx, x, cy, w, pad, vessel, ms, colMgr, activePid);

    // ── Log misji ────────────────────────────────────────────
    const logSpace = h - (cy - y);
    if (logSpace > 30 && vessel.missionLog.length > 0) {
      this._drawMissionLog(ctx, x, cy, w, logSpace, pad, vessel);
    }
  }

  // ── Stocznia (prawa kolumna gdy brak selekcji) ─────────────────────────────

  _drawShipyard(ctx, x, y, w, h, colMgr, activePid) {
    const PAD = 10;
    const LH = 16;
    let cy = y + 12;

    const tSys = window.KOSMOS?.techSystem;
    const activeCol = colMgr?.getColony(activePid);

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText('⚓ STOCZNIA', x + PAD, cy + 10);
    cy += LH + 8;

    // Sprawdź warunki wstępne
    const hasExploration = tSys?.isResearched('exploration') ?? false;
    if (!hasExploration) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText('🔒 Wymaga technologii: Eksploracja', x + PAD, cy + 8);
      cy += LH + 8;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Wybierz statek z listy po lewej', x + PAD, cy + 8);
      return;
    }

    // Oblicz poziom stoczni
    let shipyardLevel = 0;
    if (activeCol?.buildingSystem) {
      for (const [, e] of activeCol.buildingSystem._active) {
        if (e.building?.id === 'shipyard') shipyardLevel += e.level ?? 1;
      }
    }

    if (shipyardLevel === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText('⚓ Brak stoczni — zbuduj na planecie', x + PAD, cy + 8);
      cy += LH + 8;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Wybierz statek z listy po lewej', x + PAD, cy + 8);
      return;
    }

    // Status stoczni — sloty
    const queues = colMgr?.getShipQueues(activePid) ?? [];
    const usedSlots = queues.length || 1;
    const speedBonus = Math.max(1, Math.floor(shipyardLevel / usedSlots));
    const bonusStr = speedBonus > 1 ? ` ×${speedBonus}⚡` : '';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.success;
    ctx.fillText(`Sloty: ${queues.length}/${shipyardLevel}${bonusStr}`, x + PAD, cy + 8);
    cy += LH;

    // Aktywne budowy — paski progresu
    if (queues.length > 0) {
      for (const q of queues) {
        if (cy > y + h - 30) break;
        const shipDef = SHIPS[q.shipId];
        const frac = q.buildTime > 0 ? Math.min(1, q.progress / q.buildTime) : 0;
        const eta = q.buildTime > 0 ? ((q.buildTime - q.progress) / speedBonus).toFixed(1) : '?';

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(`${shipDef?.icon ?? '🚀'} ${shipDef?.namePL ?? q.shipId}`, x + PAD, cy + 8);

        // Pasek progresu
        const barX = x + PAD;
        const barY = cy + 13;
        const barW = w - PAD * 2 - 50;
        const barH = 6;
        ctx.fillStyle = THEME.bgTertiary;
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(barX, barY, Math.round(barW * frac), barH);
        ctx.strokeStyle = THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        // Procent + ETA
        ctx.fillStyle = THEME.textSecondary;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(frac * 100)}%`, x + w - PAD, cy + 8);
        ctx.textAlign = 'left';

        cy += LH + 8;
      }
    }

    // Separator
    cy += 4;
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 10;

    // Nagłówek budowy
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText('BUDOWA STATKU', x + PAD, cy + 8);
    cy += LH + 4;

    const canBuildAny = queues.length < shipyardLevel;
    const inv = activeCol?.resourceSystem?.inventorySnapshot() ?? {};

    // Przyciski budowy statków
    for (const ship of Object.values(SHIPS)) {
      if (cy > y + h - 26) break;
      const hasTech = !ship.requires || (tSys?.isResearched(ship.requires) ?? false);
      if (!hasTech) continue;

      const allCosts = { ...(ship.cost || {}), ...(ship.commodityCost || {}) };
      const canAfford = Object.entries(allCosts).every(([k, v]) => (inv[k] ?? 0) >= v);
      const canBuild = canBuildAny && canAfford;

      const btnH = 24;
      ctx.fillStyle = canBuild ? 'rgba(0,255,180,0.06)' : 'rgba(20,20,30,0.5)';
      ctx.fillRect(x + PAD, cy, w - PAD * 2, btnH);
      ctx.strokeStyle = canBuild ? THEME.borderActive : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + PAD, cy, w - PAD * 2, btnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = canBuild ? THEME.accent : THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(`${ship.icon} ${ship.namePL}`, x + w / 2, cy + 16);
      ctx.textAlign = 'left';

      this._hitZones.push({
        x: x + PAD, y: cy, w: w - PAD * 2, h: btnH,
        type: 'build_ship', data: { shipId: ship.id, enabled: canBuild },
      });
      cy += btnH + 4;
    }

    // Wskazówka na dole
    if (cy < y + h - 20) {
      cy += 8;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
      cy += 12;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('← Wybierz statek z listy', x + PAD, cy + 4);
    }

    // Tooltip kosztów budowy — rysowany NA KOŃCU (z-order najwyższy)
    if (this._hoverShipId) {
      this._drawShipCostTooltip(ctx, x, y, w, h, this._hoverShipId, inv, canBuildAny);
    }
  }

  // ── Tooltip kosztów budowy statku ───────────────────────────────────────────

  _drawShipCostTooltip(ctx, panelX, panelY, panelW, panelH, shipId, inv, slotsOk) {
    const ship = SHIPS[shipId];
    if (!ship) return;

    // Znajdź pozycję hovered buttona
    const btnZone = this._hitZones.find(z => z.type === 'build_ship' && z.data.shipId === shipId);
    if (!btnZone) return;

    const PAD = 8;
    const LH = 14;

    // Zbierz linie kosztów
    const lines = [];
    // Surowce
    if (ship.cost) {
      for (const [k, v] of Object.entries(ship.cost)) {
        const have = Math.floor(inv[k] ?? 0);
        const ok = have >= v;
        const icon = RESOURCE_ICONS[k] ?? k;
        lines.push({ text: `${icon} ${k}: ${have}/${v}`, ok });
      }
    }
    // Commodities
    if (ship.commodityCost) {
      for (const [k, v] of Object.entries(ship.commodityCost)) {
        const have = Math.floor(inv[k] ?? 0);
        const ok = have >= v;
        const comDef = COMMODITIES[k];
        const icon = comDef?.icon ?? '📦';
        const name = COMMODITY_SHORT[k] ?? k;
        lines.push({ text: `${icon} ${name}: ${have}/${v}`, ok });
      }
    }
    // Czas budowy
    lines.push({ text: `⏱ Budowa: ${ship.buildTime} lat`, ok: true, dim: true });
    // Sloty
    if (!slotsOk) {
      lines.push({ text: '⚠ Brak wolnych slotów', ok: false });
    }

    // Wymiary tooltipa
    const tipW = 200;
    const tipH = 22 + lines.length * LH + 8;

    // Pozycja: po lewej od panelu (lub wewnątrz jeśli nie mieści się)
    let tipX = panelX - tipW - 6;
    if (tipX < 4) tipX = panelX + 4;
    let tipY = btnZone.y;
    if (tipY + tipH > panelY + panelH) tipY = panelY + panelH - tipH - 4;

    // Tło
    ctx.fillStyle = 'rgba(6,12,20,0.96)';
    ctx.fillRect(tipX, tipY, tipW, tipH);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(tipX, tipY, tipW, tipH);

    // Nagłówek
    let ty = tipY + 6;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`${ship.icon} ${ship.namePL}`, tipX + PAD, ty + 10);
    ty += 18;

    // Linie kosztów
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    for (const line of lines) {
      ctx.fillStyle = line.dim ? THEME.textSecondary : (line.ok ? THEME.success : THEME.danger);
      ctx.fillText(line.text, tipX + PAD, ty + 8);
      ty += LH;
    }
  }

  _statusText(vessel) {
    if (vessel.position.state === 'docked') return vessel.status === 'idle' ? 'Hangar' : 'Tankowanie';
    if (vessel.position.state === 'orbiting') return 'Na orbicie';
    return 'W locie';
  }

  _baseText(vessel) {
    const body = _findBody(vessel.homeColonyId ?? vessel.colonyId);
    return body?.name ?? vessel.colonyId;
  }

  _xpStars(vessel) {
    const xp = vessel.experience ?? 0;
    const level = Math.min(5, Math.floor(xp / 3));
    return '★'.repeat(level) + '☆'.repeat(5 - level);
  }

  // ── Aktywna misja ─────────────────────────────────────────────────────────

  _drawActiveMission(ctx, x, cy, w, pad, mission, vessel) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('AKTYWNA MISJA', x + pad, cy + 10);

    const target = _findBody(mission.targetId);
    const typeName = this._missionTypeName(mission.type);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${typeName} → ${target?.name ?? mission.targetId ?? '?'}`, x + pad, cy + 26);

    // Faza + ETA
    const phase = mission.status ?? 'transit';
    const phasePL = phase === 'returning' ? 'Powrót' : phase === 'orbiting' ? 'Na orbicie' : phase === 'working' ? 'Praca' : 'Tranzyt';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    const eta = mission.arrivalYear ? `ETA: rok ${Math.ceil(mission.arrivalYear)}` : '';
    ctx.fillText(`${phasePL}  ${eta}`, x + pad, cy + 42);

    // Pasek postępu
    const pct = mission.progressPct ?? 0;
    if (pct > 0) {
      const barX = x + pad;
      const barY = cy + 48;
      const barW = w - pad * 2;
      const barH = 5;
      ctx.fillStyle = THEME.bgTertiary;
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(barX, barY, Math.round(barW * Math.min(1, pct)), barH);
    }

    // Separator
    cy += 62;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    return cy;
  }

  _missionTypeName(type) {
    const names = {
      recon: 'Rozpoznanie', survey: 'Rozpoznanie', deep_scan: 'Skan układu',
      scientific: 'Naukowa', mining: 'Wydobycie', colony: 'Kolonizacja',
      transport: 'Transport', transit: 'Tranzyt',
    };
    return names[type] ?? type;
  }

  // ── Akcje ─────────────────────────────────────────────────────────────────

  _drawActions(ctx, x, cy, w, pad, vessel, ms, colMgr, activePid) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('AKCJE', x + pad, cy + 10);
    cy += 18;

    const state = {
      missionSystem: ms,
      vesselManager: window.KOSMOS?.vesselManager,
      colonyManager: colMgr,
      techSystem: window.KOSMOS?.techSystem,
      activePlanetId: activePid,
    };

    const actions = getAvailableActions(vessel, state);
    if (actions.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Brak dostępnych akcji', x + pad, cy + 12);
      return cy + 20;
    }

    // Grid 2×N
    const btnW = (w - pad * 2 - 6) / 2;
    const btnH = 28;
    const gap = 4;

    // Zbierz powody blokad (do wyświetlenia pod przyciskami)
    const disabledReasons = [];

    for (let i = 0; i < actions.length; i++) {
      const { action, ok, reason } = actions[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = x + pad + col * (btnW + gap);
      const by = cy + row * (btnH + gap);

      const style = _actionStyle(action.id, ok);

      // Tło przycisku
      ctx.fillStyle = style.bg;
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.strokeStyle = style.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, btnW, btnH);

      // Tekst
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = style.fg;
      ctx.fillText(`${action.icon} ${action.label}`, bx + 6, by + 18);

      if (ok) {
        this._hitZones.push({
          x: bx, y: by, w: btnW, h: btnH,
          type: 'action',
          data: { actionId: action.id, vessel },
        });
      } else if (reason) {
        // Zbierz unikalne powody blokad
        if (!disabledReasons.includes(reason)) disabledReasons.push(reason);
      }
    }

    const rows = Math.ceil(actions.length / 2);
    cy += rows * (btnH + gap) + 4;

    // Wyświetl powody blokad pod przyciskami
    if (disabledReasons.length > 0) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger ?? '#ff4444';
      for (const reason of disabledReasons) {
        ctx.fillText(`⚠ ${reason}`, x + pad, cy + 10);
        cy += 14;
      }
      cy += 4;
    }

    return cy;
  }

  // ── Konfigurator misji ────────────────────────────────────────────────────

  _drawMissionConfig(ctx, x, cy, w, maxH, pad, vessel, ms, colMgr) {
    const config = this._missionConfig;
    const action = FLEET_ACTIONS[config.actionId];
    if (!action) return;

    if (config.step === 'select') {
      this._drawTargetPicker(ctx, x, cy, w, maxH, pad, vessel, action, ms);
    } else if (config.step === 'confirm') {
      this._drawMissionConfirm(ctx, x, cy, w, maxH, pad, vessel, action);
    }
  }

  _drawTargetPicker(ctx, x, cy, w, maxH, pad, vessel, action, ms) {
    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`WYBIERZ CEL — ${action.label.toUpperCase()}`, x + pad, cy + 14);
    cy += 16;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('lub kliknij ciało na mapie ←', x + pad, cy + 8);
    cy += 14;

    // Lista celów
    const targets = this._getValidTargets(vessel, this._missionConfig.actionId);
    const rowH = 24;
    const listH = maxH - 50; // Zostaw miejsce na ANULUJ

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, cy, w, listH);
    ctx.clip();

    let ry = cy - this._targetScrollOffset;
    for (const t of targets) {
      if (ry + rowH < cy) { ry += rowH; continue; }
      if (ry > cy + listH) break;

      // Ikona + nazwa + odległość
      const icon = t.type === 'planet' ? '🌍' : t.type === 'moon' ? '🌙' : t.type === 'planetoid' ? '🪨' : '☄';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = t.reachable ? THEME.textPrimary : THEME.textDim;
      ctx.fillText(`${icon} ${(t.name ?? '?').slice(0, 14)}`, x + pad, ry + 16);

      // Odległość
      ctx.textAlign = 'right';
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${t.distAU.toFixed(1)} AU`, x + w - pad - 60, ry + 16);

      // Badge
      let badge = '', badgeColor = THEME.textDim;
      if (!t.reachable) { badge = 'za daleko'; badgeColor = THEME.danger; }
      else if (!t.explored) { badge = 'niezbadane'; badgeColor = THEME.accent; }
      else { badge = 'zbadane'; badgeColor = THEME.textDim; }

      ctx.fillStyle = badgeColor;
      ctx.fillText(badge, x + w - pad, ry + 16);
      ctx.textAlign = 'left';

      if (t.reachable) {
        this._hitZones.push({
          x, y: Math.max(ry, cy), w, h: rowH,
          type: 'select_target',
          data: { targetId: t.id },
        });
      }

      // Separator
      ctx.strokeStyle = 'rgba(0,255,180,0.07)';
      ctx.beginPath(); ctx.moveTo(x + pad, ry + rowH - 1); ctx.lineTo(x + w - pad, ry + rowH - 1); ctx.stroke();

      ry += rowH;
    }

    // Ograniczenie scroll
    const maxScroll = Math.max(0, targets.length * rowH - listH);
    if (this._targetScrollOffset > maxScroll) this._targetScrollOffset = maxScroll;

    ctx.restore();

    // Przycisk ANULUJ
    const cancelY = cy + listH + 4;
    const cancelW = 80;
    const cancelX = x + w / 2 - cancelW / 2;
    ctx.fillStyle = THEME.bgTertiary;
    ctx.fillRect(cancelX, cancelY, cancelW, 24);
    ctx.strokeStyle = THEME.border;
    ctx.strokeRect(cancelX, cancelY, cancelW, 24);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText('ANULUJ', cancelX + cancelW / 2, cancelY + 16);
    ctx.textAlign = 'left';

    this._hitZones.push({ x: cancelX, y: cancelY, w: cancelW, h: 24, type: 'cancel_config', data: {} });
  }

  _drawMissionConfirm(ctx, x, cy, w, maxH, pad, vessel, action) {
    const targetId = this._missionConfig.targetId;
    const target = _findBody(targetId);
    if (!target) { this._missionConfig = null; return; }

    // Cel
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`${action.icon} ${action.label.toUpperCase()}`, x + pad, cy + 14);
    cy += 22;

    // Cel: ikona+nazwa + [ZMIEŃ]
    const targetIcon = target.type === 'planet' ? '🌍' : target.type === 'moon' ? '🌙' : '🪨';
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${targetIcon} ${target.name ?? targetId}`, x + pad, cy + 14);

    // Przycisk [ZMIEŃ]
    const chgX = x + w - pad - 50;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('[ZMIEŃ]', chgX, cy + 14);
    this._hitZones.push({ x: chgX - 2, y: cy, w: 54, h: 18, type: 'change_target', data: {} });
    cy += 24;

    // Tabela: odległość, czas lotu, paliwo
    const ship = SHIPS[vessel.shipId];
    const distAU = this._calcDistAU(vessel, target);
    const effectiveSpeed = (ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
    const travelYears = effectiveSpeed > 0 ? distAU / effectiveSpeed : Infinity;
    const fuelCost = distAU * (vessel.fuel.consumption ?? 0);

    const tableData = [
      ['Odległość', `${distAU.toFixed(2)} AU`],
      ['Czas lotu', travelYears < 1 ? `${Math.ceil(travelYears * 365)} dni` : `${travelYears.toFixed(1)} lat`],
      ['Paliwo (w jedną stronę)', `${fuelCost.toFixed(1)} pc`],
    ];

    for (const [label, value] of tableData) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(label, x + pad, cy + 12);
      ctx.fillStyle = THEME.textPrimary;
      ctx.textAlign = 'right';
      ctx.fillText(value, x + w - pad, cy + 12);
      ctx.textAlign = 'left';
      cy += 18;
    }

    // ETA (duże)
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const eta = gameYear + travelYears;
    ctx.font = `bold ${THEME.fontSizeTitle}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'center';
    ctx.fillText(`ETA: rok ${Math.ceil(eta)}`, x + w / 2, cy + 22);
    ctx.textAlign = 'left';
    cy += 34;

    // Przycisk ▶ WYŚLIJ MISJĘ
    const sendW = w - pad * 2;
    const sendH = 30;
    ctx.fillStyle = 'rgba(0,255,180,0.12)';
    ctx.fillRect(x + pad, cy, sendW, sendH);
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad, cy, sendW, sendH);
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'center';
    ctx.fillText('▶ WYŚLIJ MISJĘ', x + w / 2, cy + 20);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: x + pad, y: cy, w: sendW, h: sendH, type: 'confirm_mission', data: {} });
    cy += sendH + 8;

    // Przycisk ANULUJ
    const cancelW = 80;
    const cancelX = x + w / 2 - cancelW / 2;
    ctx.fillStyle = THEME.bgTertiary;
    ctx.fillRect(cancelX, cy, cancelW, 24);
    ctx.strokeStyle = THEME.border;
    ctx.strokeRect(cancelX, cy, cancelW, 24);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText('ANULUJ', cancelX + cancelW / 2, cy + 16);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: cancelX, y: cy, w: cancelW, h: 24, type: 'cancel_config', data: {} });
  }

  // ── Log misji ─────────────────────────────────────────────────────────────

  _drawMissionLog(ctx, x, cy, w, maxH, pad, vessel) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('DZIENNIK', x + pad, cy + 10);
    cy += 16;

    const entries = vessel.missionLog.slice(-8).reverse();
    const lineH = 14;
    const colors = {
      info: THEME.textSecondary, success: THEME.success,
      warning: THEME.warning, danger: THEME.danger,
    };

    for (const entry of entries) {
      if (cy + lineH > x + maxH) break; // wyjdź poza przestrzeń
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      const yearStr = entry.year ? `[${Math.floor(entry.year)}]` : '';
      ctx.fillText(yearStr, x + pad, cy + 10);

      ctx.fillStyle = colors[entry.type] ?? THEME.textSecondary;
      const text = (entry.text ?? '').slice(0, 32);
      ctx.fillText(text, x + pad + 40, cy + 10);
      cy += lineH;
    }
  }

  // ── Pobieranie celów ──────────────────────────────────────────────────────

  _getValidTargets(vessel, actionId) {
    // Cache: unikamy ponownego obliczania co klatkę
    const key = `${vessel.id}_${actionId}_${Math.floor(Date.now() / 2000)}`;
    if (this._cachedTargetsKey === key && this._cachedTargets) return this._cachedTargets;

    const targets = [];
    const homePid = window.KOSMOS?.homePlanet?.id;
    const colMgr  = window.KOSMOS?.colonyManager;

    // Zbierz wszystkie ciała
    const bodies = [
      ...EntityManager.getByType('planet'),
      ...EntityManager.getByType('moon'),
      ...EntityManager.getByType('planetoid'),
      ...EntityManager.getByType('asteroid'),
      ...EntityManager.getByType('comet'),
    ];

    for (const body of bodies) {
      // Nie pokazuj ciała, na którym statek aktualnie stoi (docked)
      if (body.id === vessel.position.dockedAt && vessel.position.state === 'docked') continue;

      // Transport — tylko ciała z kolonią/outpostem
      if (actionId === 'transport') {
        if (!colMgr?.hasColony(body.id)) continue;
      }
      // Kolonizacja — nie pokazuj istniejących kolonii
      if (actionId === 'colonize' && colMgr?.hasColony(body.id)) continue;
      // Survey/scientific — wszystkie ciała (zbadane i niezbadane)
      // Mining — tylko zbadane (ale pokazuj wszystkie, badge powie)

      const distAU = this._calcDistAU(vessel, body);
      const range = effectiveRange(vessel);
      const reachable = distAU <= range;

      targets.push({
        id: body.id,
        name: body.name ?? body.id,
        type: body.type,
        distAU,
        explored: body.explored ?? false,
        reachable,
      });
    }

    // Sortuj: reachable najpierw, potem po odległości
    targets.sort((a, b) => {
      if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
      return a.distAU - b.distAU;
    });

    this._cachedTargets = targets;
    this._cachedTargetsKey = key;
    return targets;
  }

  _calcDistAU(vessel, target) {
    const vx = (vessel.position.x ?? 0) / GAME_CONFIG.AU_TO_PX;
    const vy = (vessel.position.y ?? 0) / GAME_CONFIG.AU_TO_PX;
    const tx = (target.x ?? 0) / GAME_CONFIG.AU_TO_PX;
    const ty = (target.y ?? 0) / GAME_CONFIG.AU_TO_PX;
    return Math.sqrt((vx - tx) ** 2 + (vy - ty) ** 2);
  }
}
