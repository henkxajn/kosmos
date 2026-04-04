// FleetManagerOverlay — trójdzielny overlay zarządzania flotą
//
// Otwierany klawiszem F lub kliknięciem FLOTA w Outlinerze.
// Layout: LEFT (lista statków) | CENTER (mapa schematyczna) | RIGHT (szczegóły + akcje)
// Rysowany na Canvas 2D (#ui-canvas), NA WIERZCHU istniejącego UI.
// Logika misji delegowana do MissionSystem + FleetActions.

import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { COSMIC }          from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W }  from './CivPanelDrawer.js';
import { SHIPS }           from '../data/ShipsData.js';
import { HULLS }           from '../data/HullsData.js';
import { SHIP_MODULES, calcShipStats, calcShipCost, countModuleSlots, getModuleCapabilities } from '../data/ShipModulesData.js';
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
import { showReturnCargoModal } from '../ui/ReturnCargoModal.js';
import { OutpostBuildingPicker } from '../ui/OutpostBuildingPicker.js';
import { t, getName } from '../i18n/i18n.js';

// ── Helper: znajdź ciało niebieskie po ID ────────────────────────────────────
const _BODY_TYPES = ['star', 'planet', 'moon', 'asteroid', 'comet', 'planetoid'];
function _findBody(id) {
  if (!id) return null;
  for (const btype of _BODY_TYPES) {
    for (const b of EntityManager.getByType(btype)) {
      if (b.id === id) return b;
    }
  }
  return null;
}

// Helper: rozwiąż czytelną nazwę ciała/kolonii po ID (fallback ColonyManager)
function _resolveName(id) {
  if (!id) return '???';
  const body = _findBody(id);
  if (body?.name) return body.name;
  const colony = window.KOSMOS?.colonyManager?.getColony(id);
  if (colony?.name) return colony.name;
  return id;
}

// ── Stałe layoutu ────────────────────────────────────────────────────────────
const LEFT_W    = 170;
const RIGHT_W   = 200;
const TOP_PAD   = COSMIC.TOP_BAR_H + COSMIC.MAP_MODE_H;   // pod MapModeBar
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

// Filtr — labele dynamiczne (i18n)
function _getFilterBtns() {
  return [
    { id: 'all',             label: t('fleet.filterAll') },
    { id: 'science_vessel',  label: '🛸' },
    { id: 'cargo_ship',      label: '📦' },
    { id: 'here',            label: t('fleet.filterHere') },
  ];
}

// ── Formatowanie roku gry ────────────────────────────────────────────────────
function _fmtYear(y) {
  if (y == null) return '?';
  if (y >= 1e9) return (y / 1e9).toFixed(1) + 'G';
  if (y >= 1e6) return (y / 1e6).toFixed(1) + 'M';
  if (y >= 1e4) return (y / 1e3).toFixed(0) + 'k';
  return String(Math.round(y));
}

// ── Ikona i label typu misji (do sekcji W LOCIE) ────────────────────────────
function _missionTypeIcon(type) {
  switch (type) {
    case 'recon': case 'survey': case 'deep_scan': return '🔭';
    case 'transport': return '📦';
    case 'colony': return '🏗';
    case 'mining': return '⛏';
    case 'trade_route': return '🔄';
    case 'interstellar_jump': return '🌀';
    default: return '🚀';
  }
}

function _missionTypeLabel(type) {
  const key = {
    recon: 'fleet.missionTypeRecon', survey: 'fleet.missionTypeSurvey',
    deep_scan: 'fleet.missionTypeDeepScan',
    mining: 'fleet.missionTypeMining', colony: 'fleet.missionTypeColony',
    transport: 'fleet.missionTypeTransport', trade_route: 'fleet.missionTypeTransport',
    interstellar_jump: 'fleet.missionTypeInterstellar',
  }[type];
  return key ? t(key) : type || '';
}

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
    this._showCluster = false;    // toggle: mapa ↔ star cluster (pobliskie gwiazdy)
    this._atlasScrollY = 0;       // scroll katalogu ciał
    this._atlasContentH = 0;      // wysokość zawartości katalogu
    this._atlasVisibleH = 0;      // widoczna wysokość katalogu

    // Star Cluster — zoom, pan, selekcja
    this._clusterZoom = 1;
    this._clusterPanX = 0;
    this._clusterPanY = 0;
    this._selectedClusterSystem = null;
    this._clusterHoverSystem = null;
    this._hitZones = [];          // { x,y,w,h, type, data }
    this._bounds = null;          // { x,y,w,h } — cały overlay

    this._cachedTargets = null;   // cache celów misji
    this._cachedTargetsKey = '';   // klucz walidacji cache
    this._pendingSendSystemId = null; // ID systemu do wysyłki — pokazuje ship picker w prawym panelu

    // Mapa — zoom i pan
    this._mapZoom = 1.0;          // 1.0 = fit all, >1 = zoom in
    this._mapPanX = 0;            // pan offset w px
    this._mapPanY = 0;
    this._mapBounds = null;       // { x,y,w,h } — bounds obszaru mapy (do scroll detect)
    this._mapFocusBodyId = null;  // null = gwiazda, inaczej body.id — zoom utrzymuje focus

    // Tooltip ciała na mapie
    this._mapHoverBody = null;    // { body, screenX, screenY } — hover info

    // Drag do przesuwania mapy / cluster
    this._mapDragging = false;
    this._mapDragStartX = 0;
    this._mapDragStartY = 0;
    this._mapDragWasDrag = false; // odróżnienie klik od drag
    this._clusterDrag = false;   // czy drag dotyczy cluster (nie tactical map)
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
    this._mapFocusBodyId = null;
    this._mapHoverBody = null;
    this._mapDragging = false;
    this._mapDragWasDrag = false;
    this._showCluster = false;
    this._clusterZoom = 1;
    this._clusterPanX = 0;
    this._clusterPanY = 0;
    this._selectedClusterSystem = null;
    this._clusterHoverSystem = null;
    this._pendingSendSystemId = null;
  }

  // Centruj mapę na ciele (AU → px pan offset)
  // Oblicz maxOrbitAU (do skali mapy)
  _getMaxOrbitAU() {
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    let maxAU = 1;
    for (const p of (EntityManager.getByTypeInSystem('planet', sysId))) {
      const a = p.orbital?.a ?? 0; if (a > maxAU) maxAU = a;
    }
    for (const pd of (EntityManager.getByTypeInSystem('planetoid', sysId))) {
      const a = pd.orbital?.a ?? 0; if (a > maxAU) maxAU = a;
    }
    return maxAU * 1.15;
  }

  // Pozycja ciała w AU (body.x/y to px, trzeba przeliczyć)
  _bodyAU(body) {
    const bx = (body?.x ?? 0) / GAME_CONFIG.AU_TO_PX;
    const by = (body?.y ?? 0) / GAME_CONFIG.AU_TO_PX;
    return { x: bx, y: by };
  }

  _centerMapOnBody(body) {
    const mb = this._mapBounds;
    if (!mb) return;
    const maxAU = this._getMaxOrbitAU();
    const baseR = Math.min(mb.w / 2, mb.h / 2) - 20;
    const auPx = baseR * this._mapZoom / maxAU;
    const { x: bx, y: by } = this._bodyAU(body);
    this._mapPanX = -bx * auPx;
    this._mapPanY = -by * auPx;
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
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(ox, oy, ow, oh);

    // Obramowanie glass
    ctx.strokeStyle = GLASS_BORDER;
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
      // Pomiń map_vessel — wybór statku tylko z listy po lewej
      if (z.type === 'map_vessel') continue;
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
      if (this._showCluster) {
        // Zoom star cluster
        const zf = delta > 0 ? 0.85 : 1.18;
        this._clusterZoom = Math.max(0.3, Math.min(8, this._clusterZoom * zf));
      } else if (this._showAtlas) {
        // Scroll katalogu ciał
        const maxScroll = Math.max(0, this._atlasContentH - this._atlasVisibleH);
        this._atlasScrollY = Math.max(0, Math.min(maxScroll, this._atlasScrollY + delta * 0.5));
      } else {
        // Zoom mapy — utrzymaj focus na wybranym ciele (domyślnie gwiazda)
        const zoomFactor = delta > 0 ? 0.85 : 1.18;
        const oldZoom = this._mapZoom;
        this._mapZoom = Math.max(0.3, Math.min(80, this._mapZoom * zoomFactor));
        const focusBody = this._mapFocusBodyId ? _findBody(this._mapFocusBodyId) : null;
        const { x: fAUx, y: fAUy } = this._bodyAU(focusBody);
        const maxAU = this._getMaxOrbitAU();
        const baseR = Math.min(mb.w / 2, mb.h / 2) - 20;
        const dZoom = oldZoom - this._mapZoom;
        this._mapPanX += fAUx * baseR * dZoom / maxAU;
        this._mapPanY += fAUy * baseR * dZoom / maxAU;
      }
      return true;
    }
    return true;
  }

  handleMouseDown(mx, my) {
    if (!this._visible) return false;
    const mb = this._mapBounds;
    if (mb && !this._showAtlas && mx >= mb.x && mx <= mb.x + mb.w && my >= mb.y && my <= mb.y + mb.h) {
      this._clusterDrag = this._showCluster; // zapamiętaj, który tryb dragujemy
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

    // Drag mapy / cluster
    if (this._mapDragging) {
      const dx = mx - this._mapDragStartX;
      const dy = my - this._mapDragStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._mapDragWasDrag = true;
      if (this._clusterDrag) {
        this._clusterPanX += dx;
        this._clusterPanY += dy;
      } else {
        this._mapPanX += dx;
        this._mapPanY += dy;
      }
      this._mapDragStartX = mx;
      this._mapDragStartY = my;
      return;
    }

    // Hover na statku w LEFT
    this._hoverVesselId = null;
    this._hoverShipId = null;
    this._hoverPendingOrder = null;
    for (const z of this._hitZones) {
      if (mx < z.x || mx > z.x + z.w || my < z.y || my > z.y + z.h) continue;
      if (z.type === 'vessel') { this._hoverVesselId = z.data.vesselId; break; }
      if (z.type === 'build_ship') { this._hoverShipId = z.data.shipId; break; }
      if (z.type === 'pending_ship_hover') { this._hoverPendingOrder = z.data.order; break; }
    }
    // Hover na ciele na mapie
    this._mapHoverBody = null;
    this._clusterHoverSystem = null;
    for (const z of this._hitZones) {
      if (z.type === 'map_body' && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._mapHoverBody = { bodyId: z.data.bodyId, screenX: z.x + z.w / 2, screenY: z.y + z.h };
        break;
      }
      if (z.type === 'cluster_star' && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._clusterHoverSystem = z.data.systemId;
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
          const shipDef = SHIPS[zone.data.shipId] ?? HULLS[zone.data.shipId];
          const modules = zone.data.modules ?? shipDef?.defaultModules ?? [];
          EventBus.emit('fleet:buildRequest', { shipId: zone.data.shipId, modules });
        }
        break;
      case 'build_template':
        if (zone.data.enabled) {
          EventBus.emit('fleet:buildRequest', { shipId: zone.data.hullId, modules: zone.data.modules });
        }
        break;
      case 'cancel_pending_ship': {
        const colMgr = window.KOSMOS?.colonyManager;
        if (colMgr) colMgr.cancelPendingShip(zone.data.planetId, zone.data.orderId);
        break;
      }
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
        // Gdy konfigurator aktywny i czeka na cel → wybierz cel z mapy
        if (this._missionConfig?.step === 'select') {
          this._missionConfig.targetId = zone.data.bodyId;
          this._missionConfig.step = 'confirm';
          this._mapHoverBody = null;
          break;
        }
        // Ustaw focus na klikniętym ciele (zoom + centruj mapę)
        this._mapFocusBodyId = zone.data.bodyId;
        const bodyEntity = _findBody(zone.data.bodyId);
        if (bodyEntity) {
          EventBus.emit('body:selected', { entity: bodyEntity });
          this._centerMapOnBody(bodyEntity);
        }
        break;
      }
      case 'atlas_report': {
        // Ikona raportu 📋 w Star Atlas — otwórz modal ze szczegółami
        const reportBody = _findBody(zone.data.bodyId);
        if (reportBody) {
          showBodyDetailModal(reportBody);
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
        this._showCluster = false;
        this._atlasScrollY = 0;
        break;
      case 'cluster_toggle':
        this._showCluster = !this._showCluster;
        this._showAtlas = false;
        this._selectedClusterSystem = null;
        break;
      case 'cluster_star':
        this._selectedClusterSystem = zone.data.systemId;
        break;
      case 'cluster_switch': {
        const ssMgr = window.KOSMOS?.starSystemManager;
        if (ssMgr && zone.data.systemId) {
          ssMgr.switchActiveSystem(zone.data.systemId);
          // Reset tactical map po przełączeniu układu
          this._mapZoom = 1.0;
          this._mapPanX = 0;
          this._mapPanY = 0;
          this._mapFocusBodyId = null;
          this._mapHoverBody = null;
          // Przełącz na tactical map żeby gracz widział nowy układ
          this._showCluster = false;
          this._showAtlas = false;
        }
        break;
      }
      case 'cluster_send': {
        // Wysyłka statku międzygwiezdnego — jeśli wybrany statek jest warp-capable, wyślij go
        const vMgr2 = window.KOSMOS?.vesselManager;
        if (!vMgr2 || !zone.data.systemId) break;

        if (this._selectedVesselId) {
          const selV = vMgr2.getVessel(this._selectedVesselId);
          const selDef = selV ? (SHIPS[selV.shipId] ?? HULLS[selV.shipId]) : null;
          if (selV && selDef?.fuelPerLY > 0 &&
              selV.position.state === 'docked' &&
              (selV.status === 'idle' || selV.status === 'refueling')) {
            vMgr2.dispatchInterstellar(selV.id, zone.data.systemId);
            break;
          }
        }
        // Brak wybranego statku lub nie spełnia wymagań → pokaż ship picker
        this._pendingSendSystemId = zone.data.systemId;
        break;
      }
      case 'cluster_send_pick': {
        // Wybór konkretnego statku z pickera
        const vMgr2b = window.KOSMOS?.vesselManager;
        if (vMgr2b && zone.data.vesselId && zone.data.systemId) {
          vMgr2b.dispatchInterstellar(zone.data.vesselId, zone.data.systemId);
          this._pendingSendSystemId = null;
        }
        break;
      }
      case 'cluster_send_cancel': {
        this._pendingSendSystemId = null;
        break;
      }
      case 'cluster_beacon': {
        EventBus.emit('orbital:buildBeacon', { systemId: zone.data.systemId });
        break;
      }
      case 'cluster_gate': {
        EventBus.emit('orbital:buildJumpGate', { systemId: zone.data.systemId });
        break;
      }
      case 'interstellar_redirect': {
        EventBus.emit('vessel:interstellarRedirect', {
          vesselId: zone.data.vesselId,
          targetId: zone.data.targetId,
        });
        break;
      }
      case 'interstellar_return': {
        // Powrót międzygwiezdny do macierzystego układu
        const vMgr3 = window.KOSMOS?.vesselManager;
        const v = vMgr3?.getVessel(zone.data.vesselId);
        if (v) {
          // Reset statusu — dispatchInterstellar wymaga idle+docked
          v.status = 'idle';
          v.position.state = 'docked';
          v.mission = null;
          vMgr3.dispatchInterstellar(zone.data.vesselId, zone.data.fromSystemId);
        }
        break;
      }
      case 'foreign_recon_body': {
        EventBus.emit('expedition:foreignRecon', {
          vesselId: zone.data.vesselId,
          targetId: zone.data.targetId,
          scope: 'target',
        });
        break;
      }
      case 'foreign_recon_system': {
        EventBus.emit('expedition:foreignRecon', {
          vesselId: zone.data.vesselId,
          targetId: null,
          scope: 'full_system',
        });
        break;
      }
      case 'foreign_colonize': {
        EventBus.emit('expedition:foreignColonize', {
          vesselId: zone.data.vesselId,
          targetId: zone.data.targetId,
        });
        this._selectedVesselId = null;
        break;
      }
      case 'foreign_unload': {
        EventBus.emit('expedition:foreignUnload', {
          vesselId: zone.data.vesselId,
          targetId: zone.data.targetId,
        });
        break;
      }
      case 'foreign_redirect': {
        // Redirect do innego ciała w tym samym układzie (reuse interstellar redirect)
        EventBus.emit('vessel:interstellarRedirect', {
          vesselId: zone.data.vesselId,
          targetId: zone.data.targetId,
        });
        break;
      }
      case 'foreign_return':
      case 'foreign_return_from_recon': {
        // Powrót do macierzystego układu (skok warp)
        const vMgr4 = window.KOSMOS?.vesselManager;
        const v2 = vMgr4?.getVessel(zone.data.vesselId);
        if (v2) {
          // Przerwij rekon jeśli aktywny
          if (v2.mission?.type === 'foreign_recon') {
            vMgr4.abortForeignRecon(zone.data.vesselId);
          }
          v2.status = 'idle';
          v2.position.state = 'docked';
          v2.mission = null;
          vMgr4.dispatchInterstellar(zone.data.vesselId, zone.data.fromSystemId);
        }
        break;
      }
      case 'abort_foreign_recon': {
        const vMgr5 = window.KOSMOS?.vesselManager;
        vMgr5?.abortForeignRecon(zone.data.vesselId);
        break;
      }
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
      // (duplikat map_body usunięty — obsługa w pierwszym case powyżej)
      case 'map_planet': {
        this._mapFocusBodyId = zone.data.planetId;
        const planetEntity = _findBody(zone.data.planetId);
        if (planetEntity) this._centerMapOnBody(planetEntity);
        EventBus.emit('camera:focusTarget', { targetId: zone.data.planetId });
        break;
      }
      case 'cargo_load':
        this._openCargoLoader(zone.data.vesselId);
        break;
      case 'toggle_repeat':
        if (this._missionConfig) {
          this._missionConfig.repeat = !this._missionConfig.repeat;
        }
        break;
      case 'set_return_cargo':
        this._openReturnCargoModal();
        break;
      case 'delete_trade_route':
        EventBus.emit('tradeRoute:delete', { routeId: zone.data.routeId });
        break;
      case 'disband':
        EventBus.emit('fleet:disbandRequest', { vesselId: zone.data.vesselId });
        this._selectedVesselId = null;
        this._missionConfig = null;
        break;
    }
  }

  async _openReturnCargoModal() {
    const cfg = this._missionConfig;
    if (!cfg || !cfg.targetId) return;
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(this._selectedVesselId);
    if (!vessel) return;
    const colMgr = window.KOSMOS?.colonyManager;
    const targetColony = colMgr?.getColony(cfg.targetId) ?? null;
    if (!targetColony) return;
    const result = await showReturnCargoModal(targetColony, vessel);
    if (result) {
      cfg.returnCargo = result.returnCargo;
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

    // Założenie placówki — teraz standardowy target picker (building picker po wyborze celu)
    // Flow obsługiwany w _executeMission()

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
   * Założenie placówki (krok 2): po wyborze celu → otwórz OutpostBuildingPicker.
   * Jeśli gracz może sobie pozwolić → launch. Jeśli nie → pending order.
   */
  async _openOutpostBuildingPicker(targetId, vessel) {
    try {
      const colony = this._getVesselColony(vessel);
      if (!colony) return;

      // Znajdź encję ciała docelowego
      const body = _findBody(targetId);
      if (!body) return;

      const picker = OutpostBuildingPicker.getInstance();
      const result = await picker.show(colony.resourceSystem, body);
      if (!result) return; // anulowano

      const { buildingId, pending } = result;

      if (pending) {
        // Brak surowców — dodaj do pending outpost orders (fabryki wyprodukują)
        const bDef = window.KOSMOS?.buildingsData?.[buildingId]
                  ?? (await import('../data/BuildingsData.js')).BUILDINGS[buildingId];
        const totalCost = {};
        for (const [resId, qty] of Object.entries(bDef?.cost ?? {})) {
          totalCost[resId] = (totalCost[resId] ?? 0) + qty;
        }
        for (const [comId, qty] of Object.entries(bDef?.commodityCost ?? {})) {
          totalCost[comId] = (totalCost[comId] ?? 0) + qty;
        }

        const colMgr = window.KOSMOS?.colonyManager;
        colMgr?.addPendingOutpostOrder(vessel.colonyId, {
          targetId,
          buildingId,
          vesselId: vessel.id,
          cost: totalCost,
        });
      } else {
        // Ma surowce — od razu launch
        EventBus.emit('expedition:foundOutpostRequest', {
          targetId,
          buildingId,
          vesselId: vessel.id,
        });
      }
    } catch {
      // anulowano
    }
    this._missionConfig = null;
    this._targetScrollOffset = 0;
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

    // Założenie placówki — po wyborze celu otwórz building picker (async)
    if (actionId === 'found_outpost') {
      this._openOutpostBuildingPicker(targetId, vessel);
      return;
    }

    // Transport z powtarzaniem → utwórz trasę handlową
    if (actionId === 'transport' && this._missionConfig.repeat) {
      EventBus.emit('tradeRoute:create', {
        vesselId: vessel.id,
        sourceColonyId: vessel.colonyId,
        targetBodyId: targetId,
        cargo: vessel.cargo ?? {},
        returnCargo: this._missionConfig.returnCargo ?? {},
        tripsTotal: null, // nieskończone
      });
    }

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
      const newName = await showRenameModal(t('fleetPanel.rename'));
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
    const ROW_HANGAR = 34;  // kompaktowy wiersz: nazwa + paliwo + lokalizacja
    const ROW_ORBIT  = 34;
    const ROW_FLIGHT = 52;  // wyższy: nazwa + paliwo + cel + typ misji + ETA
    const SECTION_H  = 20;

    // ── Nagłówek (h=36) ──────────────────────────────────────
    ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('fleet.header') + ` [${vessels.length}]`, x + pad, y + 22);

    // ── Filtry (h=28) ────────────────────────────────────────
    const filterY = y + 36;
    let fx = x + pad;
    for (const btn of _getFilterBtns()) {
      const active = this._filter === btn.id;
      const tw = ctx.measureText(btn.label).width + 8;
      const bw = Math.max(tw, 22);
      if (fx + bw > x + w - pad) break;

      ctx.fillStyle = active ? 'rgba(0,255,180,0.12)' : THEME.bgTertiary;
      ctx.fillRect(fx, filterY, bw, 18);
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(fx, filterY, bw, 18);

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
      ctx.fillText(btn.label, fx + 4, filterY + 13);

      this._hitZones.push({ x: fx, y: filterY, w: bw, h: 18, type: 'filter', data: { filterId: btn.id } });
      fx += bw + 2;
    }

    // ── Grupowanie statków wg stanu ──────────────────────────
    const hangar  = vessels.filter(v => v.position.state === 'docked');
    const orbiting = vessels.filter(v => v.position.state === 'orbiting');
    const inFlight = vessels.filter(v => v.position.state === 'in_transit');

    const sections = [
      { key: 'hangar', label: t('fleet.sectionHangar'), color: THEME.success,  vessels: hangar,   rowH: ROW_HANGAR },
      { key: 'orbit',  label: t('fleet.sectionOrbit'),  color: THEME.mint,     vessels: orbiting, rowH: ROW_ORBIT },
      { key: 'flight', label: t('fleet.sectionFlight'), color: THEME.warning,  vessels: inFlight, rowH: ROW_FLIGHT },
    ];

    // Oblicz łączną wysokość contentu
    let totalContentH = 0;
    for (const sec of sections) {
      if (sec.vessels.length === 0) continue;
      totalContentH += SECTION_H + sec.vessels.length * sec.rowH;
    }

    // ── Lista scrollowalna ───────────────────────────────────
    const listY = filterY + 28;
    const listH = h - (listY - y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY - this._scrollOffset;

    for (const sec of sections) {
      if (sec.vessels.length === 0) continue;
      const rH = sec.rowH;

      // ── Nagłówek sekcji ──
      if (ry + SECTION_H > listY - 2 && ry < listY + listH + 2) {
        ctx.fillStyle = 'rgba(20,30,45,0.8)';
        ctx.fillRect(x, ry, w, SECTION_H);
        ctx.strokeStyle = sec.color; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.moveTo(x + pad, ry + SECTION_H - 1); ctx.lineTo(x + w - pad, ry + SECTION_H - 1); ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = sec.color;
        ctx.fillText(`▸ ${sec.label}`, x + pad, ry + 14);
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(`${sec.vessels.length}`, x + w - pad, ry + 14);
        ctx.textAlign = 'left';
      }
      ry += SECTION_H;

      // ── Wiersze statków ──
      for (const vessel of sec.vessels) {
        if (ry + rH < listY) { ry += rH; continue; }
        if (ry > listY + listH) { ry += rH; continue; }

        const selected = vessel.id === this._selectedVesselId;
        const hovered  = vessel.id === this._hoverVesselId;

        if (selected) {
          ctx.fillStyle = 'rgba(0,255,180,0.06)';
          ctx.fillRect(x, ry, w, rH);
          ctx.fillStyle = THEME.accent;
          ctx.fillRect(x, ry, 2, rH);
        } else if (hovered) {
          ctx.fillStyle = 'rgba(0,255,180,0.03)';
          ctx.fillRect(x, ry, w, rH);
        }

        const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
        const icon = ship?.icon ?? '🚀';

        // ── Wiersz 1: ikona + nazwa + paliwo ──
        ctx.font = `13px ${THEME.fontFamily}`;
        ctx.fillStyle = selected ? THEME.textPrimary : THEME.textSecondary;
        const vName = vessel.name.length > 11 ? vessel.name.slice(0, 10) + '…' : vessel.name;
        ctx.fillText(`${icon} ${vName}`, x + pad, ry + 14);

        // Pasek paliwa
        const fuelPct = vessel.fuel.max > 0 ? vessel.fuel.current / vessel.fuel.max : 0;
        const fuelColor = fuelPct > 0.5 ? THEME.success : fuelPct > 0.2 ? THEME.warning : THEME.danger;
        const barW = 26; const barH = 3;
        const barX = x + w - pad - barW - 24; const barBY = ry + 9;
        ctx.fillStyle = THEME.bgTertiary; ctx.fillRect(barX, barBY, barW, barH);
        ctx.fillStyle = fuelColor; ctx.fillRect(barX, barBY, Math.round(barW * fuelPct), barH);
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = fuelColor;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(fuelPct * 100)}%`, x + w - pad, ry + 13);
        ctx.textAlign = 'left';

        // ── Wiersz 2: lokalizacja / cel ──
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        if (sec.key === 'hangar') {
          ctx.fillStyle = THEME.success;
          const locName = _resolveName(vessel.position.dockedAt);
          ctx.fillText(`◈ ${locName.length > 18 ? locName.slice(0, 17) + '…' : locName}`, x + pad + 2, ry + 28);
        } else if (sec.key === 'orbit') {
          ctx.fillStyle = THEME.mint;
          const locName = _resolveName(vessel.position.dockedAt);
          ctx.fillText(`⊙ ${locName.length > 18 ? locName.slice(0, 17) + '…' : locName}`, x + pad + 2, ry + 28);
        } else {
          // W locie: → cel + typ misji
          const targetName = vessel.mission?.targetName ?? _resolveName(vessel.mission?.targetId);
          const mType = vessel.mission?.type ?? '';
          const mIcon = _missionTypeIcon(mType);
          const mLabel = _missionTypeLabel(mType);
          ctx.fillStyle = THEME.warning;
          ctx.fillText(`→ ${(targetName ?? '?').slice(0, 12)}`, x + pad + 2, ry + 28);
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`${mIcon} ${mLabel}`, x + pad + 95, ry + 28);

          // ── Wiersz 3 (tylko flight): ETA ──
          const m = vessel.mission;
          const isReturning = m?.phase === 'returning';
          const etaYear = isReturning
            ? (m?.returnYear ?? m?.arrivalYear)
            : (m?.arrivalYear ?? m?.returnYear);
          ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          const etaLabel = isReturning ? '↩ ETA' : '⏱ ETA';
          if (etaYear != null && etaYear > 0) {
            ctx.fillStyle = THEME.warning;
            ctx.fillText(`${etaLabel}: rok ${_fmtYear(etaYear)}`, x + pad + 2, ry + 43);
          } else {
            ctx.fillStyle = THEME.textSecondary;
            ctx.fillText(`${etaLabel}: —`, x + pad + 2, ry + 43);
          }
        }

        // Separator
        ctx.strokeStyle = 'rgba(0,255,180,0.05)';
        ctx.beginPath(); ctx.moveTo(x + pad, ry + rH - 1); ctx.lineTo(x + w - pad, ry + rH - 1); ctx.stroke();

        this._hitZones.push({ x, y: Math.max(ry, listY), w, h: rH, type: 'vessel', data: { vesselId: vessel.id } });
        ry += rH;
      }
    }

    // Ograniczenie scrollu
    const maxScroll = Math.max(0, totalContentH - listH);
    if (this._scrollOffset > maxScroll) this._scrollOffset = maxScroll;

    ctx.restore();

    // Scroll indicator
    if (totalContentH > listH) {
      const thumbH = Math.max(20, (listH / totalContentH) * listH);
      const thumbY = listY + (this._scrollOffset / totalContentH) * listH;
      ctx.fillStyle = 'rgba(0,255,180,0.15)';
      ctx.fillRect(x + w - 4, thumbY, 3, thumbH);
    }
  }

  _getLocationText(vessel) {
    if (vessel.position.state === 'docked') {
      return t('fleet.locationHangar', _resolveName(vessel.position.dockedAt));
    }
    if (vessel.position.state === 'orbiting') {
      return t('fleet.locationOrbit', _resolveName(vessel.position.dockedAt));
    }
    if (vessel.mission?.targetId) {
      return `→ ${vessel.mission.targetName ?? _resolveName(vessel.mission.targetId)}`;
    }
    return t('fleet.locationInFlight');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CENTER — mapa schematyczna
  // ══════════════════════════════════════════════════════════════════════════

  _drawCenter(ctx, x, y, w, h, allVessels, ms) {
    const pad = 8;

    // ── Nagłówek (h=32) ──────────────────────────────────────
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    const centerTitle = this._showCluster ? t('fleet.starCluster') : this._showAtlas ? t('fleet.starAtlas') : t('fleet.tacticalMap');
    ctx.fillText(centerTitle, x + pad, y + 20);

    // Zoom label — tylko w trybie mapy lub cluster
    if (!this._showAtlas) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      const zoomVal = this._showCluster ? this._clusterZoom : this._mapZoom;
      ctx.fillText(`×${zoomVal.toFixed(1)}`, x + pad + 110, y + 20);
    }

    // Toggle: STAR ATLAS / TRASY / ZASIĘG
    const toggleY = y + 6;
    let tbx = x + w - pad;

    // TRASY / ZASIĘG — widoczne tylko w trybie tactical map
    if (!this._showAtlas && !this._showCluster) {
      for (const key of ['range', 'routes']) {
        const label = key === 'routes' ? t('fleet.toggleRoutes') : t('fleet.toggleRange');
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

    // Przycisk STAR CLUSTER (mapa pobliskich gwiazd)
    {
      const clTw = 86;
      tbx -= clTw + 4;
      const clOn = this._showCluster;
      ctx.fillStyle = clOn ? 'rgba(170,136,255,0.15)' : 'transparent';
      ctx.fillRect(tbx, toggleY, clTw, 18);
      ctx.strokeStyle = clOn ? THEME.purple : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(tbx, toggleY, clTw, 18);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = clOn ? THEME.purple : THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.starCluster'), tbx + clTw / 2, toggleY + 13);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: tbx, y: toggleY, w: clTw, h: 18, type: 'cluster_toggle', data: {} });
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
      ctx.fillText(t('fleet.starAtlas'), tbx + atlasTw / 2, toggleY + 13);
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

    // Tryb STAR CLUSTER — mapa pobliskich gwiazd
    if (this._showCluster) {
      this._drawStarCluster(ctx, x, mapY, w, mapH);
      return;
    }

    const mapCx = x + w / 2 + this._mapPanX;
    const mapCy = mapY + mapH / 2 + this._mapPanY;
    const baseRadius = Math.min(w / 2, mapH / 2) - 20;
    const mapRadius = baseRadius * this._mapZoom;

    // Tło mapy — nieprzezroczyste
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(x + 1, mapY, w - 2, mapH - 1);

    // Clip do obszaru mapy
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, mapY, w - 2, mapH - 1);
    ctx.clip();

    // ── Zbierz ciała AKTYWNEGO układu ──────────────────────────
    const sysId      = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const planets    = EntityManager.getByTypeInSystem('planet', sysId);
    const moons      = EntityManager.getByTypeInSystem('moon', sysId);
    const planetoids = EntityManager.getByTypeInSystem('planetoid', sysId);
    const asteroids  = EntityManager.getByTypeInSystem('asteroid', sysId);
    const comets     = EntityManager.getByTypeInSystem('comet', sysId);
    const stars      = EntityManager.getByType('star')?.filter(s => s.systemId === sysId) ?? [];

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
      ctx.fillStyle = pd.explored ? 'rgba(255,230,100,0.8)' : 'rgba(100,136,170,0.3)';
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
      ctx.fillStyle = m.explored ? 'rgba(255,230,100,0.8)' : 'rgba(120,150,180,0.4)';
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
      ctx.fillStyle = isHome ? THEME.accent : hasColony ? THEME.mint : p.explored ? 'rgba(255,230,100,0.8)' : THEME.textSecondary;
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
      // Pokaż tylko misje statków w aktywnym układzie
      if ((vessel.systemId ?? 'sys_home') !== sysId) continue;

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

    // ── Statki (kropki — na wierzchu) — tylko z aktywnego układu ──
    for (const v of allVessels) {
      if ((v.systemId ?? 'sys_home') !== sysId) continue;
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
    ctx.fillStyle = bgAlpha(0.65);
    ctx.fillRect(legX, legY2, 132, 90);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(legX, legY2, 132, 90);

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    const legendItems = [
      { color: THEME.accent,        label: t('fleet.legendHomePlanet') },
      { color: THEME.mint,          label: t('fleet.legendColony') },
      { color: THEME.textSecondary, label: t('fleet.legendPlanet') },
      { color: THEME.success,       label: t('fleet.legendShipHangar') },
      { color: THEME.warning,       label: t('fleet.legendShipFlight') },
      { color: THEME.mint,          label: t('fleet.legendShipOrbit') },
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
    const ROW_H = 38;
    let cy = y + 6;

    // Tło
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(x + 1, y, w - 2, h - 1);

    // Nagłówek
    const entries = this._getAllCatalogBodies();
    const exploredCount = entries.filter(e => e.explored).length;

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('fleet.catalogHeaderFull'), x + PAD, cy + 10);

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(t('fleet.catalogExplored', exploredCount, entries.length), x + w - PAD, cy + 10);
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
      ctx.fillText(t('fleet.catalogNoBodiesInSystem'), x + PAD, cy + 12);
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
      let _reportX = null;

      if (explored) {
        // Nazwa
        ctx.font = `${THEME.fontSizeSmall + 1}px ${THEME.fontFamily}`;
        const isHome = !!entry.isHome;
        ctx.fillStyle = isHome ? THEME.accent : hasColony ? THEME.mint : isMoon ? THEME.textSecondary : THEME.textPrimary;
        const namePrefix = isMoon ? '└ ' : '';
        const homeMark = isHome ? '🏛 ' : '';
        const targetMark = body._markedAsTarget ? ' 🎯' : '';
        const maxNameLen = isMoon ? 14 : 20;
        const rawName = body.name ?? body.id;
        const truncName = rawName.length > maxNameLen ? rawName.slice(0, maxNameLen) + '…' : rawName;
        const nameStr = `${namePrefix}${icon} ${homeMark}${truncName}${targetMark}`;
        ctx.fillText(nameStr, x + PAD + indent, ry + 14);

        // Ikona raportu 📋 — obok nazwy (hit zone dodana po map_body)
        const nameTextW = ctx.measureText(nameStr).width;
        _reportX = x + PAD + indent + nameTextW + 8;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('📋', _reportX, ry + 14);

        // Kolonia badge — pod nazwą, obok typu
        let typeLineStr = '';
        const typeStr = body.planetType ?? body.subType ?? body.type;
        const tempStr = (body.temperatureC != null || body.temperatureK) ? ` ${Math.round(body.temperatureC ?? (body.temperatureK - 273))}°C` : '';
        typeLineStr = `${typeStr}${tempStr}`;

        if (hasColony) {
          const col = colMgr.getColony(body.id);
          const pop = col?.civSystem?.population ?? 0;
          typeLineStr += `  ● ${pop} POP`;
        }

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = hasColony ? THEME.mint : THEME.textDim;
        ctx.fillText(typeLineStr, x + PAD + indent, ry + 28);

        // Odległości (prawo)
        ctx.textAlign = 'right';
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`${orbA.toFixed(2)} AU`, x + w - PAD, ry + 14);

        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`🏠 ${distHome.toFixed(1)} AU`, x + w - PAD, ry + 28);

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
          ctx.fillText(depStr, depX, ry + 28);
        }

        ctx.textAlign = 'left';
      } else {
        // Niezbadane
        ctx.font = `${THEME.fontSizeSmall + 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        const namePrefix = isMoon ? '└ ' : '';
        ctx.fillText(`${namePrefix}${icon} ???`, x + PAD + indent, ry + 14);

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(body.type === 'planet' ? t('fleet.bodyTypePlanet') : body.type === 'moon' ? t('fleet.bodyTypeMoon') : t('fleet.bodyTypePlanetoid'), x + PAD + indent, ry + 28);

        ctx.textAlign = 'right';
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`${orbA.toFixed(2)} AU`, x + w - PAD, ry + 14);
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`🏠 ${distHome.toFixed(1)} AU`, x + w - PAD, ry + 28);
        ctx.textAlign = 'left';
      }

      // Hit zone — cały wiersz do hover/tooltip i wyboru celu
      this._hitZones.push({
        x: x + 1, y: ry, w: w - 2, h: ROW_H,
        type: 'map_body', data: { bodyId: body.id },
      });

      // Hit zone raportu — NA WIERZCHU (po map_body, wyższy index = sprawdzany pierwszy w reverse)
      if (_reportX !== null) {
        this._hitZones.push({
          x: _reportX - 2, y: ry + 4, w: 20, h: 16,
          type: 'atlas_report', data: { bodyId: body.id },
        });
      }

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
    const sysId  = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const planets = [];
    for (const btype of ['planet', 'planetoid']) {
      for (const body of EntityManager.getByTypeInSystem(btype, sysId)) {
        if (body === homePl) continue; // planeta macierzysta dodana osobno na górze
        planets.push({ body, explored: !!body.explored });
      }
    }
    planets.sort((a, b) => {
      if (a.explored !== b.explored) return a.explored ? -1 : 1;
      return (a.body.orbital?.a ?? 0) - (b.body.orbital?.a ?? 0);
    });

    const moonsByParent = new Map();
    for (const moon of EntityManager.getByTypeInSystem('moon', sysId)) {
      const pid = moon.parentPlanetId;
      if (!moonsByParent.has(pid)) moonsByParent.set(pid, []);
      moonsByParent.get(pid).push({ body: moon, explored: !!moon.explored, isMoon: true });
    }
    for (const moons of moonsByParent.values()) {
      moons.sort((a, b) => (a.body.orbital?.a ?? 0) - (b.body.orbital?.a ?? 0));
    }

    const result = [];
    // Planeta macierzysta + jej księżyce na górze (tylko jeśli w aktywnym układzie)
    const homeInSystem = homePl && (homePl.systemId === sysId);
    if (homeInSystem) {
      result.push({ body: homePl, explored: true, isHome: true });
    }
    const homeMoons = homeInSystem ? (moonsByParent.get(homePl.id) ?? []) : [];
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
  // STAR CLUSTER — minimapa pobliskich gwiazd (2D Canvas)
  // ══════════════════════════════════════════════════════════════════════════

  _drawStarCluster(ctx, x, y, w, h) {
    const PAD = 10;

    // Tło
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(x + 1, y, w - 2, h - 1);

    const gd = window.KOSMOS?.galaxyData;
    if (!gd?.systems?.length) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('No galaxy data', x + PAD, y + 20);
      return;
    }

    const systems = gd.systems;
    const ssMgr = window.KOSMOS?.starSystemManager;
    const vMgr  = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;

    // Clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y, w - 2, h - 1);
    ctx.clip();

    // Oblicz skalę — zmieść wszystkie gwiazdy w widoku
    let maxLY = 1;
    for (const s of systems) {
      const d = Math.sqrt(s.x * s.x + s.y * s.y);
      if (d > maxLY) maxLY = d;
    }
    maxLY *= 1.15;

    const cx = x + w / 2 + this._clusterPanX;
    const cy = y + h / 2 + this._clusterPanY;
    const baseR = Math.min(w / 2, h / 2) - 20;
    const scale = (baseR * this._clusterZoom) / maxLY; // px per LY

    // Pomocnicza: LY → px
    const toSx = (lx) => cx + lx * scale;
    const toSy = (ly) => cy + ly * scale;

    // ── Jump gate lines (fioletowe) ──
    const gates = systems.filter(s => s.jumpGate);
    for (const g of gates) {
      // Szukaj sparowanego gate w innym systemie
      const sys = ssMgr?.getSystem(g.id);
      const connTo = sys?.jumpGate?.connectedTo;
      if (connTo) {
        const other = systems.find(s => s.id === connTo);
        if (other) {
          ctx.strokeStyle = 'rgba(170,136,255,0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(toSx(g.x), toSy(g.y));
          ctx.lineTo(toSx(other.x), toSy(other.y));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ── Interstellar transit lines (pomarańczowe) ──
    const interVessels = vMgr?.getInterstellarVessels() ?? [];
    for (const v of interVessels) {
      const m = v.mission;
      if (!m || m.phase !== 'warp_transit') continue;
      const fromS = systems.find(s => s.id === m.fromSystemId);
      const toS   = systems.find(s => s.id === m.toSystemId);
      if (!fromS || !toS) continue;

      // Linia trasy
      ctx.strokeStyle = 'rgba(255,170,50,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(toSx(fromS.x), toSy(fromS.y));
      ctx.lineTo(toSx(toS.x), toSy(toS.y));
      ctx.stroke();
      ctx.setLineDash([]);

      // Punkt pozycji statku
      const vsx = toSx(m.currentGalX ?? fromS.x);
      const vsy = toSy(m.currentGalY ?? fromS.y);
      ctx.fillStyle = THEME.warning;
      ctx.beginPath();
      ctx.arc(vsx, vsy, 3, 0, Math.PI * 2);
      ctx.fill();

      // Etykieta statku
      if (this._clusterZoom > 1.5) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.warning;
        ctx.fillText(v.name, vsx + 5, vsy - 3);
      }
    }

    // ── Gwiazdy ──
    const selSys = this._selectedClusterSystem;
    for (const s of systems) {
      const sx = toSx(s.x);
      const sy = toSy(s.y);

      // Cull poza widocznością
      if (sx < x - 20 || sx > x + w + 20 || sy < y - 20 || sy > y + h + 20) continue;

      const isHome = !!s.isHome;
      const isExplored = !!s.explored;
      const isSelected = selSys === s.id;
      const isHover = this._clusterHoverSystem === s.id;
      const hasCol = colMgr?.getAllColonies().some(c => {
        const body = EntityManager.get(c.planetId);
        return body?.systemId === s.id;
      }) ?? false;

      // Promień gwiazdy
      let r = isHome ? 6 : isExplored ? 4 : 3;
      if (isSelected || isHover) r += 1;

      // Glow
      if (isHome || isSelected) {
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
        grad.addColorStop(0, isHome ? 'rgba(255,204,68,0.3)' : 'rgba(170,136,255,0.3)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Kolor gwiazdy
      ctx.fillStyle = s.colorHex ?? (isExplored ? THEME.accent : THEME.textDim);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      // Obwódka selekcji
      if (isSelected) {
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Ikony infrastruktury
      const sysData = ssMgr?.getSystem(s.id);
      if (hasCol) {
        ctx.font = `8px ${THEME.fontFamily}`;
        ctx.fillText('🏗', sx + r + 2, sy - r);
      }
      if (sysData?.warpBeacon || s.warpBeacon) {
        ctx.font = `7px ${THEME.fontFamily}`;
        ctx.fillText('📡', sx + r + 2, sy + 2);
      }
      if (sysData?.jumpGate || s.jumpGate) {
        ctx.font = `7px ${THEME.fontFamily}`;
        ctx.fillText('🌀', sx + r + 2, sy + 10);
      }

      // Nazwa (widoczna przy bliskim zoom lub dla wybranych/home)
      if (this._clusterZoom > 0.8 || isHome || isSelected || isHover) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = isHome ? THEME.yellow : isExplored ? THEME.textPrimary : THEME.textDim;
        ctx.textAlign = 'center';
        ctx.fillText(s.name, sx, sy + r + 12);
        ctx.textAlign = 'left';
      }

      // Hit zone
      const hitR = Math.max(r + 4, 10);
      this._hitZones.push({
        x: sx - hitR, y: sy - hitR, w: hitR * 2, h: hitR * 2,
        type: 'cluster_star', data: { systemId: s.id },
      });
    }

    // ── Panel inline: info o zaznaczonym systemie ──
    if (selSys) {
      const selData = systems.find(s => s.id === selSys);
      if (selData) {
        this._drawClusterInfoPanel(ctx, x, y, w, h, selData, ssMgr, vMgr, colMgr);
      }
    }

    // ── Legenda (lewy-dolny) ──
    {
      const lx = x + PAD;
      let ly = y + h - 60;
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      const items = [
        { color: THEME.yellow, label: t('fleet.clusterHome') },
        { color: THEME.accent, label: t('fleet.clusterExplored') },
        { color: THEME.textDim, label: t('fleet.clusterUnexplored') },
      ];
      for (const it of items) {
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(lx + 4, ly + 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(it.label, lx + 12, ly + 7);
        ly += 14;
      }
    }

    ctx.restore();
  }

  // Panel informacyjny o zaznaczonym systemie w star cluster
  _drawClusterInfoPanel(ctx, areaX, areaY, areaW, areaH, sys, ssMgr, vMgr, colMgr) {
    const panelW = 200;
    const panelH = 160;
    const px = areaX + areaW - panelW - 8;
    const py = areaY + 8;
    const PAD = 8;

    // Tło panelu
    ctx.fillStyle = 'rgba(8,12,18,0.92)';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, panelW, panelH);

    let iy = py + PAD;

    // Nazwa gwiazdy
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = sys.colorHex ?? THEME.textPrimary;
    ctx.fillText(`⭐ ${sys.name}`, px + PAD, iy + 12);
    iy += 20;

    // Typ, masa, odległość
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(t('fleet.clusterSpectral', sys.spectralType ?? '?'), px + PAD, iy + 10);
    iy += 14;
    ctx.fillText(t('fleet.clusterMass', (sys.mass ?? 1).toFixed(2)), px + PAD, iy + 10);
    iy += 14;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.clusterDistance', (sys.distanceLY ?? 0).toFixed(1)), px + PAD, iy + 10);
    iy += 18;

    // Status
    const sysReg = ssMgr?.getSystem(sys.id);
    const isExplored = !!sysReg?.explored || !!sys.explored;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = isExplored ? THEME.success : THEME.textDim;
    ctx.fillText(isExplored ? t('fleet.clusterExplored') : t('fleet.clusterUnexplored'), px + PAD, iy + 10);
    iy += 16;

    // Przyciski akcji
    const btnW = panelW - PAD * 2;
    const btnH = 18;

    // Przycisk: Wyślij statek (jeśli tech + statek)
    if (!sys.isHome) {
      const canSend = vMgr && colMgr;
      const activePid = colMgr?.activePlanetId;
      const avail = activePid ? (vMgr?.getAvailable(activePid) ?? []) : [];
      const hasWarpShip = avail.some(v => (SHIPS[v.shipId] ?? HULLS[v.shipId])?.fuelPerLY > 0);

      ctx.fillStyle = hasWarpShip ? 'rgba(0,255,180,0.08)' : 'rgba(60,60,60,0.3)';
      ctx.fillRect(px + PAD, iy, btnW, btnH);
      ctx.strokeStyle = hasWarpShip ? THEME.accent : THEME.border;
      ctx.strokeRect(px + PAD, iy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = hasWarpShip ? THEME.accent : THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.clusterSend'), px + PAD + btnW / 2, iy + 13);
      ctx.textAlign = 'left';
      if (hasWarpShip) {
        this._hitZones.push({ x: px + PAD, y: iy, w: btnW, h: btnH, type: 'cluster_send', data: { systemId: sys.id } });
      }
      iy += btnH + 4;
    }

    // Przycisk: Przełącz widok (jeśli odwiedzony)
    if (isExplored && sysReg) {
      ctx.fillStyle = 'rgba(0,255,180,0.08)';
      ctx.fillRect(px + PAD, iy, btnW, btnH);
      ctx.strokeStyle = THEME.accent;
      ctx.strokeRect(px + PAD, iy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.clusterSwitch'), px + PAD + btnW / 2, iy + 13);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: px + PAD, y: iy, w: btnW, h: btnH, type: 'cluster_switch', data: { systemId: sys.id } });
      iy += btnH + 4;
    }
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
        { text: `⭐ ${star.name ?? t('fleet.tooltipStarName')}`, color: THEME.yellow, bold: true },
        { text: t('fleet.tooltipStarType', star.spectralType ?? star.starType ?? '?'), color: THEME.textSecondary },
        { text: t('fleet.tooltipStarMass', (star.mass ?? 0).toFixed(2)), color: THEME.textSecondary },
        { text: t('fleet.tooltipStarTemp', Math.round(star.temperatureK ?? 0)), color: THEME.textSecondary },
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
    lines.push({ text: t('fleet.tooltipType', body.planetType ?? body.subType ?? body.type), color: THEME.textSecondary });
    lines.push({ text: t('fleet.tooltipDistance', distAU.toFixed(2)), color: THEME.textSecondary });

    if (explored) {
      lines.push({ text: t('fleet.tooltipStatusExplored'), color: THEME.success });
      if (body.temperatureC != null || body.temperatureK) {
        const tempC = Math.round(body.temperatureC ?? (body.temperatureK - 273));
        lines.push({ text: t("fleet.tooltipTemp", `${tempC > 0 ? "+" : ""}${tempC}`), color: THEME.textSecondary });
      }
      if (body.orbital?.a) {
        lines.push({ text: t('fleet.tooltipOrbit', body.orbital.a.toFixed(2)), color: THEME.textSecondary });
      }
      // Atmosfera
      const atm = body.atmosphere || 'none';
      const atmLabels = { dense: t('fleet.atmDense'), thick: t('fleet.atmDense'), thin: t('fleet.atmThin'), breathable: t('fleet.atmBreathable'), none: t('fleet.atmNone') };
      let atmText = atmLabels[atm] || atm;
      if (atm === 'breathable' || body.breathableAtmosphere) atmText += ' ✅';
      const atmIcon = atm === 'none' ? '' : '☁ ';
      const atmColor = atm === 'none' ? THEME.textDim : (atm === 'breathable' || body.breathableAtmosphere) ? THEME.success : THEME.textSecondary;
      lines.push({ text: `${atmIcon}${t('fleet.tooltipAtmosphere', atmText)}`, color: atmColor });
      if (hasColony) {
        const col = colMgr.getColony(body.id);
        const pop = col?.civSystem?.population ?? 0;
        lines.push({ text: t('fleet.tooltipColony', pop), color: THEME.mint });
      }
      // Pełna lista złóż
      const deps = body.deposits ?? [];
      const activeDeps = deps.filter(d => d.remaining > 0).sort((a, b) => b.richness - a.richness);
      if (activeDeps.length > 0) {
        lines.push({ text: t('fleet.tooltipDepositsHeader'), color: THEME.textDim });
        for (const d of activeDeps) {
          const stars = d.richness >= 0.7 ? '★★★' : d.richness >= 0.4 ? '★★' : '★';
          const pct = Math.round((d.remaining / d.totalAmount) * 100);
          lines.push({ text: `  ${d.resourceId} ${stars}  ${pct}% (${d.remaining}/${d.totalAmount})`, color: THEME.yellow });
        }
      } else if (deps.length > 0) {
        lines.push({ text: t('fleet.tooltipDepositsExhausted'), color: THEME.textDim });
      } else {
        lines.push({ text: t('fleet.tooltipDepositsNone'), color: THEME.textDim });
      }
    } else {
      lines.push({ text: t('fleet.tooltipStatusUnexplored'), color: THEME.warning });
      lines.push({ text: t('fleet.tooltipData'), color: THEME.textDim });
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
    ctx.fillStyle = bgAlpha(0.38);
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
    const pad = 8;

    // Tryb ship picker — wybór statku do wysyłki międzygwiezdnej
    if (this._pendingSendSystemId) {
      this._drawShipPicker(ctx, x, y, w, h, vMgr, colMgr, activePid);
      return;
    }

    if (!this._selectedVesselId) {
      this._drawShipyard(ctx, x, y, w, h, colMgr, activePid);
      return;
    }

    const vessel = vMgr?.getVessel(this._selectedVesselId);
    if (!vessel) {
      this._selectedVesselId = null;
      return;
    }

    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    let cy = y + pad;

    // ── Przycisk powrotu do Stoczni ────────────────────────
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const backLabel = t('fleet.backToShipyard');
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
    const nameText = vessel.name.length > 12 ? vessel.name.slice(0, 11) + '…' : vessel.name;
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
    ctx.fillText(ship ? getName(ship, 'ship') : vessel.shipId, x + pad + 24, cy + 32);

    cy += 44;

    // ── Ship specs panel ─────────────────────────────────────
    if (ship) {
      cy = this._drawShipSpecs(ctx, x, cy, w, pad, ship, vessel);
    }

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    // ── Stats grid (2×2) ─────────────────────────────────────
    const gridW = (w - pad * 2) / 2;
    const gridH = 30;
    const stats = [
      { label: t('fleet.labelStatus'), value: this._statusText(vessel), color: (STATUS_COLORS[vessel.position.state] ?? (() => THEME.textSecondary))() },
      { label: t('fleet.labelSpeed'),  value: `${((vessel.speedAU ?? ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1)).toFixed(1)} AU/r`, color: THEME.textPrimary },
      { label: t('fleet.labelBase'),   value: this._baseText(vessel), color: THEME.textPrimary },
      { label: t('fleet.labelExperience'), value: this._xpStars(vessel), color: THEME.yellow },
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
    ctx.fillText(t('fleet.labelFuel'), x + pad, cy + 10);

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
    if (ship?.cargoCapacity > 0 && (vessel.position.state === 'docked' || vessel.position.state === 'orbiting')) {
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

    // ── Panel po przylecie międzygwiezdnym ────────────────────
    const isMission = vessel.mission;
    if (isMission?.type === 'interstellar_jump' && isMission.phase === 'in_system') {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 8;

      // Nagłówek
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.purple;
      ctx.fillText(`🌟 ${t('fleet.interstellarArrival')}`, x + pad, cy + 10);
      cy += 18;

      // Info: dotarł do układu
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(t('fleet.arrivedAt', isMission.targetName ?? isMission.toSystemId), x + pad, cy + 10);
      cy += 16;

      // Przycisk: Przełącz widok
      const ssMgr = window.KOSMOS?.starSystemManager;
      const sysReg = ssMgr?.getSystem(isMission.toSystemId);
      if (sysReg) {
        const switchBtnW = w - pad * 2;
        const switchBtnH = 22;
        ctx.fillStyle = 'rgba(0,255,180,0.08)';
        ctx.fillRect(x + pad, cy, switchBtnW, switchBtnH);
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, switchBtnW, switchBtnH);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.accent;
        ctx.textAlign = 'center';
        ctx.fillText(t('fleet.clusterSwitch'), x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        this._hitZones.push({ x: x + pad, y: cy, w: switchBtnW, h: switchBtnH, type: 'cluster_switch', data: { systemId: isMission.toSystemId } });
        cy += switchBtnH + 4;
      }

      // Lista planet w nowym układzie — redirect
      const planets = EntityManager.getByType('planet')?.filter(p => p.systemId === isMission.toSystemId) ?? [];
      if (planets.length > 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('fleet.systemPlanets'), x + pad, cy + 10);
        cy += 16;

        for (const planet of planets.slice(0, 6)) {
          const pBtnW = w - pad * 2;
          const pBtnH = 20;
          if (cy + pBtnH > y + h - 40) break; // nie wychodź poza panel

          ctx.fillStyle = 'rgba(170,136,255,0.06)';
          ctx.fillRect(x + pad, cy, pBtnW, pBtnH);
          ctx.strokeStyle = THEME.border;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + pad, cy, pBtnW, pBtnH);
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textPrimary;
          ctx.fillText(`🪐 ${planet.name ?? planet.id}`, x + pad + 6, cy + 14);

          // Odległość od gwiazdy
          ctx.textAlign = 'right';
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`${(planet.orbital?.a ?? 0).toFixed(1)} AU`, x + w - pad - 4, cy + 14);
          ctx.textAlign = 'left';

          this._hitZones.push({
            x: x + pad, y: cy, w: pBtnW, h: pBtnH,
            type: 'interstellar_redirect', data: { vesselId: vessel.id, targetId: planet.id },
          });
          cy += pBtnH + 2;
        }
      }

      // Przycisk: Powrót do bazy
      cy += 4;
      const retBtnW = w - pad * 2;
      const retBtnH = 22;
      ctx.fillStyle = 'rgba(255,51,68,0.08)';
      ctx.fillRect(x + pad, cy, retBtnW, retBtnH);
      ctx.strokeStyle = THEME.danger;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, retBtnW, retBtnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.clusterReturn'), x + w / 2, cy + 15);
      ctx.textAlign = 'left';
      this._hitZones.push({
        x: x + pad, y: cy, w: retBtnW, h: retBtnH,
        type: 'interstellar_return', data: { vesselId: vessel.id, fromSystemId: isMission.fromSystemId },
      });
      cy += retBtnH + 8;
    }

    // ── Panel orbiting_body — rozkazy kontekstowe w obcym układzie ──
    if (isMission?.type === 'exploration' && isMission.phase === 'orbiting_body') {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 8;

      // Nagłówek — na orbicie ciała
      const orbitBody = _findBody(isMission.targetId);
      const orbitName = orbitBody ? getName(orbitBody) : isMission.targetId;
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.purple;
      ctx.fillText(`🌍 ${t('fleet.orbitingBody', orbitName)}`, x + pad, cy + 10);
      cy += 18;

      const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
      // Zdolności z kadłuba + modułów
      const hullCaps = ship?.capabilities ?? [];
      const modCaps = vessel.modules?.length ? getModuleCapabilities(vessel.modules) : new Set();
      // Każdy statek z napędem może recon
      if (vessel.modules?.some(m => SHIP_MODULES[m]?.slotType === 'propulsion')) {
        modCaps.add('recon'); modCaps.add('survey');
      }
      const caps = { has: c => hullCaps.includes(c) || modCaps.has(c) };
      const btnW = w - pad * 2;
      const btnH = 22;

      // ── Recon ciała (recon cap) ──
      if (caps.has('recon')) {
        const isExplored = orbitBody?.explored ?? false;
        ctx.fillStyle = isExplored ? 'rgba(100,100,100,0.08)' : 'rgba(0,180,255,0.08)';
        ctx.fillRect(x + pad, cy, btnW, btnH);
        ctx.strokeStyle = isExplored ? THEME.textDim : THEME.info;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, btnW, btnH);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = isExplored ? THEME.textDim : THEME.info;
        ctx.textAlign = 'center';
        ctx.fillText(t('fleet.foreignReconBody'), x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        if (!isExplored) {
          this._hitZones.push({ x: x + pad, y: cy, w: btnW, h: btnH,
            type: 'foreign_recon_body', data: { vesselId: vessel.id, targetId: isMission.targetId } });
        }
        cy += btnH + 4;

        // Recon układu
        ctx.fillStyle = 'rgba(0,180,255,0.08)';
        ctx.fillRect(x + pad, cy, btnW, btnH);
        ctx.strokeStyle = THEME.info;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, btnW, btnH);
        ctx.fillStyle = THEME.info;
        ctx.textAlign = 'center';
        ctx.fillText(t('fleet.foreignReconSystem'), x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        this._hitZones.push({ x: x + pad, y: cy, w: btnW, h: btnH,
          type: 'foreign_recon_system', data: { vesselId: vessel.id } });
        cy += btnH + 4;
      }

      // ── Kolonizacja (colony cap) ──
      if (caps.has('colony')) {
        const colMgr4 = window.KOSMOS?.colonyManager;
        const isExploredCol = orbitBody?.explored ?? false;
        const isColonized = colMgr4?.getColony(isMission.targetId) != null;
        const validType = orbitBody && (
          ['rocky', 'ice'].includes(orbitBody.planetType) || orbitBody.type === 'planetoid'
        );
        const canColonize = isExploredCol && !isColonized && validType;

        ctx.fillStyle = canColonize ? 'rgba(0,255,120,0.08)' : 'rgba(100,100,100,0.08)';
        ctx.fillRect(x + pad, cy, btnW, btnH);
        ctx.strokeStyle = canColonize ? THEME.accent : THEME.textDim;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, btnW, btnH);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = canColonize ? THEME.accent : THEME.textDim;
        ctx.textAlign = 'center';
        let colLabel = t('fleet.foreignColonize');
        if (!isExploredCol) colLabel += ` (${t('fleet.requiresExplored')})`;
        else if (isColonized) colLabel += ` (${t('fleet.alreadyColonized')})`;
        ctx.fillText(colLabel, x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        if (canColonize) {
          this._hitZones.push({ x: x + pad, y: cy, w: btnW, h: btnH,
            type: 'foreign_colonize', data: { vesselId: vessel.id, targetId: isMission.targetId } });
        }
        cy += btnH + 4;
      }

      // ── Rozładunek cargo ──
      if (caps.has('cargo') && (vessel.cargoUsed ?? 0) > 0) {
        ctx.fillStyle = 'rgba(255,204,68,0.08)';
        ctx.fillRect(x + pad, cy, btnW, btnH);
        ctx.strokeStyle = THEME.warning;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, btnW, btnH);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.warning;
        ctx.textAlign = 'center';
        ctx.fillText(`${t('fleet.foreignUnload')} (${Math.round(vessel.cargoUsed ?? 0)}t)`, x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        this._hitZones.push({ x: x + pad, y: cy, w: btnW, h: btnH,
          type: 'foreign_unload', data: { vesselId: vessel.id, targetId: isMission.targetId } });
        cy += btnH + 4;
      }

      // ── Separator ──
      cy += 2;

      // ── Leć do innego ciała (lista planet) ──
      const sysId = vessel.systemId;
      const planetsOrbit = EntityManager.getByType('planet')?.filter(p => p.systemId === sysId && p.id !== isMission.targetId) ?? [];
      if (planetsOrbit.length > 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('fleet.foreignRedirect'), x + pad, cy + 10);
        cy += 16;

        for (const planet of planetsOrbit.slice(0, 6)) {
          const pBtnH2 = 20;
          if (cy + pBtnH2 > y + h - 40) break;
          ctx.fillStyle = 'rgba(170,136,255,0.06)';
          ctx.fillRect(x + pad, cy, btnW, pBtnH2);
          ctx.strokeStyle = THEME.border;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + pad, cy, btnW, pBtnH2);
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textPrimary;
          ctx.fillText(`🪐 ${getName(planet)}`, x + pad + 6, cy + 14);
          ctx.textAlign = 'right';
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`${(planet.orbital?.a ?? 0).toFixed(1)} AU`, x + w - pad - 4, cy + 14);
          ctx.textAlign = 'left';
          this._hitZones.push({
            x: x + pad, y: cy, w: btnW, h: pBtnH2,
            type: 'foreign_redirect', data: { vesselId: vessel.id, targetId: planet.id },
          });
          cy += pBtnH2 + 2;
        }
      }

      // ── Powrót do bazy ──
      cy += 4;
      ctx.fillStyle = 'rgba(255,51,68,0.08)';
      ctx.fillRect(x + pad, cy, btnW, btnH);
      ctx.strokeStyle = THEME.danger;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.foreignReturn'), x + w / 2, cy + 15);
      ctx.textAlign = 'left';
      this._hitZones.push({
        x: x + pad, y: cy, w: btnW, h: btnH,
        type: 'foreign_return', data: { vesselId: vessel.id, fromSystemId: isMission.originId },
      });
      cy += btnH + 8;
    }

    // ── Panel foreign_recon w trakcie ──
    if (isMission?.type === 'foreign_recon') {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 8;

      if (isMission.scope === 'target') {
        const scanBody = _findBody(isMission.targetId);
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.info;
        ctx.fillText(t('fleet.foreignScanning', scanBody ? (scanBody.name ?? scanBody.id) : '...'), x + pad, cy + 10);
        cy += 18;
      } else if (isMission.scope === 'full_system') {
        const curId = isMission.targets?.[isMission.currentIdx];
        const curBody = curId ? _findBody(curId) : null;
        const curName = curBody ? (curBody.name ?? curBody.id) : '...';
        const label = isMission.phase === 'scanning'
          ? t('fleet.foreignScanning', curName)
          : t('fleet.foreignTraveling', curName);
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.info;
        ctx.fillText(label, x + pad, cy + 10);
        cy += 14;
        // Postęp
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`${(isMission.currentIdx ?? 0) + 1} / ${isMission.targets?.length ?? '?'}`, x + pad, cy + 10);
        cy += 18;
      }

      // ── Przyciski akcji dla foreign_recon ──
      cy += 4;
      const abortBtnW = w - pad * 2;

      // Przerwij rekon → statek przechodzi do orbiting_body z pełnymi akcjami
      ctx.fillStyle = THEME.warning;
      ctx.fillRect(x + pad, cy, abortBtnW, btnH);
      ctx.fillStyle = '#000';
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillText('⏹ ' + t('fleet.abortRecon'), x + pad + 8, cy + btnH / 2 + 4);
      this._hitZones.push({ x: x + pad, y: cy, w: abortBtnW, h: btnH, type: 'abort_foreign_recon', data: { vesselId: vessel.id } });
      cy += btnH + 4;

      // Powrót do macierzystego układu (skok warp)
      const homeCol = window.KOSMOS?.colonyManager?.getColony(vessel.colonyId);
      const fromSysId = vessel.systemId;
      if (fromSysId && fromSysId !== (homeCol?.systemId ?? 'sys_home')) {
        ctx.fillStyle = THEME.danger;
        ctx.fillRect(x + pad, cy, abortBtnW, btnH);
        ctx.fillStyle = '#fff';
        ctx.fillText('🏠 ' + t('fleet.returnHomeSystem'), x + pad + 8, cy + btnH / 2 + 4);
        this._hitZones.push({
          x: x + pad, y: cy, w: abortBtnW, h: btnH,
          type: 'foreign_return_from_recon',
          data: { vesselId: vessel.id, fromSystemId: homeCol?.systemId ?? 'sys_home' },
        });
        cy += btnH + 4;
      }
    }

    // ── Aktywna trasa handlowa ────────────────────────────────
    const trMgr = window.KOSMOS?.tradeRouteManager;
    const activeRoute = trMgr?.getRoutes()?.find(r => r.vesselId === vessel.id && (r.status === 'active' || r.status === 'paused'));
    if (activeRoute) {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 8;

      // Nagłówek trasy
      const routeIcon = activeRoute.status === 'paused' ? '⏸' : '🔄';
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.fillText(`${routeIcon} ${t('fleet.activeRouteLabel')}`, x + pad, cy + 10);
      cy += 18;

      // Cel trasy
      const routeTarget = _findBody(activeRoute.targetBodyId);
      const routeTargetName = routeTarget?.name ?? activeRoute.targetBodyId;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`→ ${routeTargetName}  (${t('fleet.tripsLabel', activeRoute.tripsCompleted)})`, x + pad, cy + 10);
      cy += 16;

      // Przycisk ZATRZYMAJ
      const stopW = w - pad * 2;
      const stopH = 22;
      ctx.fillStyle = 'rgba(80,20,20,0.5)';
      ctx.fillRect(x + pad, cy, stopW, stopH);
      ctx.strokeStyle = THEME.danger;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, stopW, stopH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.stopRoute'), x + w / 2, cy + 15);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: x + pad, y: cy, w: stopW, h: stopH, type: 'delete_trade_route', data: { routeId: activeRoute.id } });
      cy += stopH + 6;
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

  // ── Ship picker (prawy panel — wybór statku do wysyłki warp) ───────────────

  _drawShipPicker(ctx, x, y, w, h, vMgr, colMgr, activePid) {
    const PAD = 8;
    let cy = y + PAD;

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`🚀 ${t('fleet.selectShipToSend')}`, x + PAD, cy + 12);
    cy += 22;

    // Info o celu
    const galaxyData = window.KOSMOS?.galaxyData;
    const targetStar = galaxyData?.systems?.find(s => s.id === this._pendingSendSystemId);
    if (targetStar) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`→ ${targetStar.name}  (${targetStar.distanceLY} LY)`, x + PAD, cy + 10);
      cy += 18;
    }

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 8;

    // Pobierz dostępne statki warp
    const allVessels = vMgr?.getAllVessels() ?? [];
    const warpShips = allVessels.filter(v => {
      if (v.position.state !== 'docked') return false;
      if (v.status !== 'idle' && v.status !== 'refueling') return false;
      const def = SHIPS[v.shipId] ?? HULLS[v.shipId];
      return def?.fuelPerLY > 0;
    });

    if (warpShips.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.noWarpShipsAvailable'), x + PAD, cy + 10);
      cy += 20;
    } else {
      // Lista statków — klikalne
      const btnW = w - PAD * 2;
      const btnH = 36;
      for (const v of warpShips) {
        if (cy + btnH > y + h - 40) break;

        const shipDef = SHIPS[v.shipId] ?? HULLS[v.shipId];
        const rangeLY = shipDef?.fuelPerLY ? (v.fuel.current / shipDef.fuelPerLY).toFixed(1) : '?';
        const fuelPct = v.fuel.max > 0 ? v.fuel.current / v.fuel.max : 0;

        // Sprawdź czy starczy paliwa
        let hasFuel = true;
        if (targetStar) {
          const fromStar = galaxyData.systems.find(s => s.id === (v.systemId ?? 'sys_home'));
          if (fromStar) {
            const dx = targetStar.x - fromStar.x;
            const dy = targetStar.y - fromStar.y;
            const dz = (targetStar.z ?? 0) - (fromStar.z ?? 0);
            const distLY = Math.sqrt(dx * dx + dy * dy + dz * dz);
            hasFuel = v.fuel.current >= distLY * (shipDef?.fuelPerLY ?? 0.5);
          }
        }

        // Tło
        ctx.fillStyle = hasFuel ? 'rgba(0,255,180,0.06)' : 'rgba(60,60,60,0.15)';
        ctx.fillRect(x + PAD, cy, btnW, btnH);
        ctx.strokeStyle = hasFuel ? THEME.accent : THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + PAD, cy, btnW, btnH);

        // Ikona + nazwa
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = hasFuel ? THEME.textPrimary : THEME.textDim;
        const icon = shipDef?.icon ?? '🚀';
        const name = v.name.length > 14 ? v.name.slice(0, 13) + '…' : v.name;
        ctx.fillText(`${icon} ${name}`, x + PAD + 4, cy + 14);

        // Zasięg + paliwo
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = hasFuel ? THEME.textSecondary : THEME.textDim;
        ctx.fillText(`⛽ ${rangeLY} LY  (${(fuelPct * 100).toFixed(0)}%)`, x + PAD + 4, cy + 28);

        if (!hasFuel) {
          ctx.fillStyle = THEME.danger;
          ctx.textAlign = 'right';
          ctx.fillText(t('fleet.fuelInsufficient'), x + w - PAD - 4, cy + 14);
          ctx.textAlign = 'left';
        }

        if (hasFuel) {
          this._hitZones.push({
            x: x + PAD, y: cy, w: btnW, h: btnH,
            type: 'cluster_send_pick',
            data: { vesselId: v.id, systemId: this._pendingSendSystemId },
          });
        }

        cy += btnH + 4;
      }
    }

    // Przycisk Anuluj
    cy += 4;
    const cancelW = w - PAD * 2;
    const cancelH = 22;
    ctx.fillStyle = 'rgba(255,51,68,0.08)';
    ctx.fillRect(x + PAD, cy, cancelW, cancelH);
    ctx.strokeStyle = THEME.danger;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + PAD, cy, cancelW, cancelH);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.danger;
    ctx.textAlign = 'center';
    ctx.fillText(t('fleet.cancelSend'), x + w / 2, cy + 15);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: x + PAD, y: cy, w: cancelW, h: cancelH, type: 'cluster_send_cancel', data: {} });
  }

  // ── Specyfikacja statku (panel prawy) ──────────────────────────────────────

  _drawShipSpecs(ctx, x, cy, w, pad, ship, vessel) {
    const specFont = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    const valFont  = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const lineH = 14;
    const labelX = x + pad;
    const valX   = x + pad + 58;
    const maxW   = w - pad * 2;

    // Opis statku (wrapped, dimmed)
    if (ship.description) {
      ctx.font = specFont;
      ctx.fillStyle = THEME.textDim;
      const descLines = this._wrapTextWidth(ctx, ship.description, maxW);
      for (const line of descLines) {
        ctx.fillText(line, labelX, cy + 10);
        cy += lineH;
      }
      cy += 4;
    }

    // Generacja
    const genLabels = ['', 'I', 'II', 'III', 'IV', 'V'];
    ctx.font = specFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.shipGeneration'), labelX, cy + 10);
    ctx.font = valFont;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`Gen ${genLabels[ship.generation] ?? ship.generation}`, valX, cy + 10);
    cy += lineH;

    // Typ paliwa
    const fuelComm = COMMODITIES[ship.fuelType];
    const fuelName = fuelComm ? (COMMODITY_SHORT[ship.fuelType] ?? fuelComm.namePL ?? ship.fuelType) : ship.fuelType;
    ctx.font = specFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.shipFuelType'), labelX, cy + 10);
    ctx.font = valFont;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(fuelName, valX, cy + 10);
    cy += lineH;

    // Prędkość (z vessel jeśli dostępna, fallback na ship)
    const vesselSpeed = vessel?.speedAU ?? ship.speedAU ?? ship.baseSpeedAU ?? 1.0;
    ctx.font = specFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.designSpeed'), labelX, cy + 10);
    ctx.font = valFont;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${vesselSpeed.toFixed(1)} AU/y`, valX, cy + 10);
    cy += lineH;

    // Zasięg (z vessel jeśli dostępna)
    const vesselFuelPerAU = vessel?.fuel?.consumption ?? ship.fuelPerAU ?? 0.5;
    const vesselFuelCap = vessel?.fuel?.max ?? ship.fuelCapacity ?? 10;
    const range = vesselFuelPerAU > 0 ? vesselFuelCap / vesselFuelPerAU : (ship.range ?? 20);
    ctx.font = specFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.shipRange'), labelX, cy + 10);
    ctx.font = valFont;
    ctx.fillStyle = THEME.textPrimary;
    let rangeText = `${range.toFixed(1)} AU`;
    if (ship.warpCapable && ship.fuelPerLY) {
      const rangeLY = (vesselFuelCap / ship.fuelPerLY).toFixed(1);
      rangeText += ` / ${rangeLY} LY`;
    }
    ctx.fillText(rangeText, valX, cy + 10);
    cy += lineH;

    // Masa
    const totalMass = vessel?.totalMass ?? ship.baseMass ?? 0;
    if (totalMass > 0) {
      ctx.font = specFont;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.designMass'), labelX, cy + 10);
      ctx.font = valFont;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${totalMass} t`, valX, cy + 10);
      cy += lineH;
    }

    // Ładownia (jeśli > 0)
    const cargoCapacity = vessel?.cargoMax ?? ship.cargoCapacity ?? 0;
    if (cargoCapacity > 0) {
      ctx.font = specFont;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.shipCargo'), labelX, cy + 10);
      ctx.font = valFont;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${cargoCapacity} t`, valX, cy + 10);
      cy += lineH;
    }

    // Załoga
    ctx.font = specFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.shipCrew'), labelX, cy + 10);
    ctx.font = valFont;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${ship.crewCost} POP`, valX, cy + 10);
    cy += lineH;

    // Zdolności
    if (ship.capabilities?.length > 0) {
      ctx.font = specFont;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.shipCapabilities'), labelX, cy + 10);
      ctx.font = valFont;
      ctx.fillStyle = THEME.mint ?? THEME.accent;
      const capIcons = {
        recon: '🔭', survey: '📡', deep_scan: '🛰',
        colony: '🏗', cargo: '📦',
      };
      const capText = ship.capabilities.map(c => capIcons[c] ?? c).join(' ');
      ctx.fillText(capText, valX, cy + 10);
      cy += lineH;
    }

    cy += 6;
    return cy;
  }

  // Helper: wrap text do zadanej szerokości (piksele)
  _wrapTextWidth(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
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
    ctx.fillText(t('fleet.shipyardAnchor'), x + PAD, cy + 10);
    cy += LH + 8;

    // Sprawdź warunki wstępne
    const hasExploration = tSys?.isResearched('exploration') ?? false;
    if (!hasExploration) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(t('fleet.shipyardRequiresTech'), x + PAD, cy + 8);
      cy += LH + 8;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.shipyardSelectFromList'), x + PAD, cy + 8);
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
      ctx.fillText(t('fleet.shipyardNoBuild'), x + PAD, cy + 8);
      cy += LH + 8;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.shipyardSelectFromList'), x + PAD, cy + 8);
      return;
    }

    // Status stoczni — sloty
    const queues = colMgr?.getShipQueues(activePid) ?? [];
    const usedSlots = queues.length || 1;
    const speedBonus = Math.max(1, Math.floor(shipyardLevel / usedSlots));
    const bonusStr = speedBonus > 1 ? ` ×${speedBonus}⚡` : '';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.success;
    ctx.fillText(t('fleet.shipyardSlotsShort', `${queues.length}/${shipyardLevel}`) + bonusStr, x + PAD, cy + 8);
    cy += LH;

    // Aktywne budowy — paski progresu
    if (queues.length > 0) {
      for (const q of queues) {
        if (cy > y + h - 30) break;
        const shipDef = SHIPS[q.shipId] ?? HULLS[q.shipId];
        const frac = q.buildTime > 0 ? Math.min(1, q.progress / q.buildTime) : 0;
        const eta = q.buildTime > 0 ? ((q.buildTime - q.progress) / speedBonus).toFixed(1) : '?';

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(`${shipDef?.icon ?? '🚀'} ${shipDef ? getName(shipDef, 'ship') : q.shipId}`, x + PAD, cy + 8);

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

    const canBuildAny = queues.length < shipyardLevel;
    const inv = activeCol?.resourceSystem?.inventorySnapshot() ?? {};

    // ── Lista szablonów z Unit Design ──────────────────────────────────────
    const templates = window.KOSMOS?.unitDesigns ?? [];

    if (templates.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('unitDesign.noDesigns'), x + PAD, cy + 8);
      cy += LH + 8;
    } else {
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textHeader;
      ctx.fillText(t('unitDesign.savedTemplates'), x + PAD, cy + 8);
      cy += LH + 4;

      for (const tpl of templates) {
        if (cy > y + h - 80) break;
        const hull = HULLS[tpl.hullId];
        if (!hull) continue;

        const hasTech = !hull.requires || (tSys?.isResearched(hull.requires) ?? false);
        if (!hasTech) continue;

        const mods = (tpl.modules ?? []).filter(Boolean);
        const stats = calcShipStats(hull, mods);
        const { cost: rawC, commodityCost: comC } = calcShipCost(hull, mods);
        const allCosts = { ...rawC, ...comC };
        const allAfford = Object.entries(allCosts).every(([k, need]) => (inv[k] ?? 0) >= need);
        const crewCost = hull.crewCost ?? 0;
        const hasCrew = crewCost <= 0 || (activeCol?.civSystem?.freePops ?? 0) >= crewCost;

        const btnH = 42;
        const bx = x + PAD, bw = w - PAD * 2;

        // Tło
        const canBuildNow = canBuildAny && allAfford && hasCrew;
        const canQueue = hasCrew && !allAfford;
        const canClick = canBuildNow || canQueue;
        ctx.fillStyle = canClick ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.5)';
        ctx.fillRect(bx, cy, bw, btnH);
        ctx.strokeStyle = canBuildNow ? THEME.borderActive : canQueue ? THEME.warning : THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, cy, bw, btnH);

        // Ikona kadłuba + nazwa szablonu
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = canClick ? THEME.accent : THEME.textDim;
        ctx.fillText(`${hull.icon} ${tpl.name}`, bx + 6, cy + 14);

        // Szybkie staty
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`⚡${stats.speed.toFixed(1)} AU/y  📦${stats.cargo}t  🎯${Math.round(stats.range)} AU  ⚖${stats.totalMass}t`, bx + 6, cy + 28);

        // Przycisk BUDUJ / KOLEJKA
        const buildLabel = canBuildNow ? '🚀' : canQueue ? '⏳' : '—';
        const buildBtnW = 28;
        const buildBtnX = bx + bw - buildBtnW - 4;
        ctx.fillStyle = canBuildNow ? THEME.accent : canQueue ? THEME.warning : THEME.textDim;
        ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText(buildLabel, buildBtnX + buildBtnW / 2, cy + btnH / 2 + 5);
        ctx.textAlign = 'left';

        if (canClick) {
          this._hitZones.push({ x: bx, y: cy, w: bw, h: btnH,
            type: 'build_template', data: { templateId: tpl.id, hullId: tpl.hullId, modules: mods, enabled: true } });
        }

        cy += btnH + 4;
      }
    }

    // Oczekujące zamówienia (pending ship orders)
    const pendingOrders = activeCol?.pendingShipOrders ?? [];
    if (pendingOrders.length > 0) {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
      cy += 10;

      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`⏳ ${t('fleet.pendingOrders')} (${pendingOrders.length})`, x + PAD, cy + 8);
      cy += LH + 2;

      for (const order of pendingOrders) {
        if (cy > y + h - 30) break;
        const shipDef = SHIPS[order.shipId] ?? HULLS[order.shipId];
        const rowH = 34;

        // Brakujące zasoby — lista z ikonami i ilościami
        const missingItems = [];
        for (const [k, need] of Object.entries(order.cost)) {
          const have = inv[k] ?? 0;
          if (have < need) {
            const icon = RESOURCE_ICONS[k] ?? COMMODITIES[k]?.icon ?? '';
            const shortName = COMMODITY_SHORT[k] ?? k;
            missingItems.push({ icon, name: shortName, have: Math.floor(have), need });
          }
        }

        // Tło
        ctx.fillStyle = 'rgba(60,40,5,0.5)';
        ctx.fillRect(x + PAD, cy, w - PAD * 2, rowH);
        ctx.strokeStyle = 'rgba(255,180,0,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + PAD, cy, w - PAD * 2, rowH);

        // Nazwa statku
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.warning;
        ctx.fillText(`${shipDef?.icon ?? '🚀'} ${shipDef ? getName(shipDef, 'ship') : order.shipId}`, x + PAD + 4, cy + 12);

        // Brakujące zasoby — czytelna lista pod nazwą
        if (missingItems.length > 0) {
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          const parts = missingItems.slice(0, 4).map(m => `${m.icon}${m.have}/${m.need}`);
          ctx.fillStyle = '#ff8844';
          ctx.fillText(parts.join('  '), x + PAD + 4, cy + 26);
        }

        // Przycisk anulowania (×)
        const cancelX = x + w - PAD - 22;
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = '#ff6666';
        ctx.fillText('×', cancelX + 6, cy + 15);
        this._hitZones.push({
          x: cancelX, y: cy, w: 22, h: rowH,
          type: 'cancel_pending_ship', data: { planetId: activePid, orderId: order.id },
        });

        // Hit zone dla tooltipu (cały wiersz)
        this._hitZones.push({
          x: x + PAD, y: cy, w: w - PAD * 2 - 24, h: rowH,
          type: 'pending_ship_hover', data: { order },
        });

        cy += rowH + 2;
      }
    }

    // Wskazówka na dole
    if (cy < y + h - 20) {
      cy += 8;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
      cy += 12;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.selectFromList'), x + PAD, cy + 4);
    }

    // Tooltip kosztów budowy — rysowany NA KOŃCU (z-order najwyższy)
    if (this._hoverShipId) {
      this._drawShipCostTooltip(ctx, x, y, w, h, this._hoverShipId, inv, canBuildAny, activeCol);
    }

    // Tooltip pending order — pełna lista kosztów z brakami
    if (this._hoverPendingOrder) {
      this._drawPendingOrderTooltip(ctx, x, y, w, h, this._hoverPendingOrder, inv);
    }
  }

  // ── Tooltip kosztów budowy statku ───────────────────────────────────────────

  _drawShipCostTooltip(ctx, panelX, panelY, panelW, panelH, shipId, inv, slotsOk, activeCol) {
    const ship = SHIPS[shipId] ?? HULLS[shipId];
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
    lines.push({ text: t('fleet.buildTimeLabel', ship.buildTime), ok: true, dim: true });
    // Załoga (POPy)
    const crewCost = ship.crewCost ?? 0;
    if (crewCost > 0) {
      const freePops = activeCol?.civSystem?.freePops ?? 0;
      const ok = freePops >= crewCost;
      lines.push({ text: t('fleet.crewLabel', freePops.toFixed(2), crewCost), ok });
    }
    // Sloty
    if (!slotsOk) {
      lines.push({ text: t('fleet.noFreeSlots'), ok: false });
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
    ctx.fillText(`${ship.icon} ${getName(ship, 'ship')}`, tipX + PAD, ty + 10);
    ty += 18;

    // Linie kosztów
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    for (const line of lines) {
      ctx.fillStyle = line.dim ? THEME.textSecondary : (line.ok ? THEME.success : THEME.danger);
      ctx.fillText(line.text, tipX + PAD, ty + 8);
      ty += LH;
    }
  }

  // ── Tooltip pending ship order — pełna lista kosztów ─────────────────────
  _drawPendingOrderTooltip(ctx, panelX, panelY, panelW, panelH, order, inv) {
    const ship = SHIPS[order.shipId] ?? HULLS[order.shipId];
    if (!ship) return;

    const PAD = 8;
    const LH = 14;

    // Zbierz linie kosztów
    const lines = [];
    for (const [k, need] of Object.entries(order.cost)) {
      const have = Math.floor(inv[k] ?? 0);
      const ok = have >= need;
      const icon = RESOURCE_ICONS[k] ?? COMMODITIES[k]?.icon ?? '';
      const name = COMMODITY_SHORT[k] ?? k;
      lines.push({ text: `${icon} ${name}: ${have}/${need}`, ok });
    }
    if (order.crewCost > 0) {
      const freePops = window.KOSMOS?.civSystem?.freePops ?? 0;
      lines.push({ text: `👤 ${freePops.toFixed(1)}/${order.crewCost} POP`, ok: freePops >= order.crewCost });
    }

    // Wymiary
    const tipW = 200;
    const tipH = 22 + lines.length * LH + 8;

    // Pozycja: po lewej od panelu
    let tipX = panelX - tipW - 6;
    if (tipX < 4) tipX = panelX + 4;
    // Znajdź pozycję Y z hit zone
    const zone = this._hitZones.find(z => z.type === 'pending_ship_hover' && z.data.order?.id === order.id);
    let tipY = zone ? zone.y : panelY + 100;
    if (tipY + tipH > panelY + panelH) tipY = panelY + panelH - tipH - 4;

    // Tło
    ctx.fillStyle = 'rgba(6,12,20,0.96)';
    ctx.fillRect(tipX, tipY, tipW, tipH);
    ctx.strokeStyle = THEME.warning;
    ctx.lineWidth = 1;
    ctx.strokeRect(tipX, tipY, tipW, tipH);

    // Nagłówek
    let ty = tipY + 6;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.warning;
    ctx.fillText(`⏳ ${ship.icon} ${getName(ship, 'ship')}`, tipX + PAD, ty + 10);
    ty += 18;

    // Linie kosztów
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    for (const line of lines) {
      ctx.fillStyle = line.ok ? THEME.success : THEME.danger;
      ctx.fillText(line.text, tipX + PAD, ty + 8);
      ty += LH;
    }
  }

  _statusText(vessel) {
    if (vessel.position.state === 'docked') return vessel.status === 'idle' ? t('fleet.statusTextHangar') : t('fleet.statusTextRefueling');
    if (vessel.position.state === 'orbiting') return t('fleet.statusTextOrbiting');
    return t('fleet.statusTextInFlight');
  }

  _baseText(vessel) {
    return _resolveName(vessel.homeColonyId ?? vessel.colonyId);
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
    ctx.fillText(t('fleet.activeMission'), x + pad, cy + 10);

    const targetName = mission.targetName ?? _resolveName(mission.targetId);
    const typeName = this._missionTypeName(mission.type);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    let missionLabel = `${typeName} → ${targetName}`;
    const maxMissionW = w - pad * 2;
    while (missionLabel.length > 6 && ctx.measureText(missionLabel).width > maxMissionW) {
      missionLabel = missionLabel.slice(0, -2) + '…';
    }
    ctx.fillText(missionLabel, x + pad, cy + 26);

    // Faza + ETA
    const phase = mission.status ?? 'transit';
    const phasePL = phase === 'returning' ? t('fleet.phaseReturn') : phase === 'orbiting' ? t('fleet.phaseOrbiting') : phase === 'working' ? t('fleet.phaseWorking') : t('fleet.phaseTransit');
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    const eta = mission.arrivalYear ? t('fleet.etaYearLabel', Math.ceil(mission.arrivalYear)) : '';
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
      recon: t('fleet.missionTypeRecon'), survey: t('fleet.missionTypeSurvey'), deep_scan: t('fleet.missionTypeDeepScan'),
      mining: t('fleet.missionTypeMining'), colony: t('fleet.missionTypeColony'),
      transport: t('fleet.missionTypeTransport'), transit: t('fleet.missionTypeTransit'),
      foreign_recon: t('fleet.missionTypeForeignRecon'),
      exploration: t('fleet.missionTypeExploration'),
      interstellar_jump: t('fleet.missionTypeInterstellar'),
    };
    return names[type] ?? type;
  }

  // ── Akcje ─────────────────────────────────────────────────────────────────

  _drawActions(ctx, x, cy, w, pad, vessel, ms, colMgr, activePid) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.actionsHeader'), x + pad, cy + 10);
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
      ctx.fillText(t('fleet.noAvailableActions'), x + pad, cy + 12);
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

      // Tekst (obcinaj jeśli nie mieści się w przycisku)
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = style.fg;
      let aLabel = `${action.icon} ${action.label}`;
      const maxLabelW = btnW - 12;
      while (aLabel.length > 4 && ctx.measureText(aLabel).width > maxLabelW) {
        aLabel = aLabel.slice(0, -2) + '…';
      }
      ctx.fillText(aLabel, bx + 6, by + 18);

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

    // ── Przycisk DISBAND (tylko zadokowany w kolonii ze stocznią) ──
    cy += 4;
    const isDocked = vessel.position.state === 'docked';
    const colonyId = vessel.colonyId;
    const colony = colonyId ? colMgr?.getColony(colonyId) : null;
    const hasShipyard = colony ? colMgr._getShipyardLevel(colony) > 0 : false;
    const canDisband = isDocked && hasShipyard;

    const disbandW = w - pad * 2;
    const disbandH = 24;
    const dbx = x + pad;

    if (canDisband) {
      ctx.fillStyle = 'rgba(255,60,60,0.10)';
      ctx.fillRect(dbx, cy, disbandW, disbandH);
      ctx.strokeStyle = THEME.danger ?? '#ff4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(dbx, cy, disbandW, disbandH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger ?? '#ff4444';
      ctx.fillText(t('fleet.disbandReturn'), dbx + 8, cy + 16);
      this._hitZones.push({
        x: dbx, y: cy, w: disbandW, h: disbandH,
        type: 'disband', data: { vesselId: vessel.id },
      });
    } else if (isDocked && !hasShipyard) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.disbandRequiresShipyard'), dbx, cy + 14);
    }
    cy += disbandH + 4;

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
    ctx.fillText(t('fleet.selectTargetFor', action.label.toUpperCase()), x + pad, cy + 14);
    cy += 16;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.clickBodyOnMap'), x + pad, cy + 8);
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
    for (const tgt of targets) {
      if (ry + rowH < cy) { ry += rowH; continue; }
      if (ry > cy + listH) break;

      // Ikona + nazwa + odległość
      const icon = tgt.type === 'planet' ? '🌍' : tgt.type === 'moon' ? '🌙' : tgt.type === 'planetoid' ? '🪨' : '☄';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = tgt.reachable ? THEME.textPrimary : THEME.textDim;
      ctx.fillText(`${icon} ${(tgt.name ?? '?').slice(0, 10)}`, x + pad, ry + 16);

      // Odległość
      ctx.textAlign = 'right';
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${tgt.distAU.toFixed(1)} AU`, x + w - pad - 60, ry + 16);

      // Badge
      let badge = '', badgeColor = THEME.textDim;
      if (!tgt.reachable) { badge = t('fleet.badgeTooFar'); badgeColor = THEME.danger; }
      else if (!tgt.explored) { badge = t('fleet.badgeUnexplored'); badgeColor = THEME.accent; }
      else { badge = t('fleet.badgeExplored'); badgeColor = THEME.textDim; }

      ctx.fillStyle = badgeColor;
      ctx.fillText(badge, x + w - pad, ry + 16);
      ctx.textAlign = 'left';

      if (tgt.reachable) {
        this._hitZones.push({
          x, y: Math.max(ry, cy), w, h: rowH,
          type: 'select_target',
          data: { targetId: tgt.id },
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
    ctx.fillText(t('fleet.cancel'), cancelX + cancelW / 2, cancelY + 16);
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
    ctx.fillText(t('fleet.changeTargetBracket'), chgX, cy + 14);
    this._hitZones.push({ x: chgX - 2, y: cy, w: 54, h: 18, type: 'change_target', data: {} });
    cy += 24;

    // Tabela: odległość, czas lotu, paliwo
    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    const distAU = this._calcDistAU(vessel, target);
    const effectiveSpeed = (vessel.speedAU ?? ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
    const travelYears = effectiveSpeed > 0 ? distAU / effectiveSpeed : Infinity;
    const fuelCost = distAU * (vessel.fuel.consumption ?? 0);

    const tableData = [
      [t('fleet.distanceLabel'), `${distAU.toFixed(2)} AU`],
      [t('fleet.travelTime'), travelYears < 1 ? t('fleet.etaDays', Math.ceil(travelYears * 365)) : t('fleet.etaYears', travelYears.toFixed(1))],
      [t('fleet.fuelOneWay'), `${fuelCost.toFixed(1)} pc`],
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
    ctx.fillText(t('fleet.etaYearLabel', Math.ceil(eta)), x + w / 2, cy + 22);
    ctx.textAlign = 'left';
    cy += 34;

    // Checkbox "Powtarzaj" — dla transportu ze statkami z ładownią
    const config = this._missionConfig;
    if (config.actionId === 'transport' && vessel && (ship?.cargoCapacity ?? 0) > 0) {
      const cbSize = 14;
      const cbX = x + pad;
      const cbY = cy;
      const checked = config.repeat ?? false;
      ctx.fillStyle = checked ? 'rgba(20,60,40,0.8)' : 'rgba(20,20,30,0.5)';
      ctx.fillRect(cbX, cbY, cbSize, cbSize);
      ctx.strokeStyle = checked ? THEME.success : THEME.border;
      ctx.strokeRect(cbX, cbY, cbSize, cbSize);
      if (checked) {
        ctx.font = `bold ${cbSize - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.success; ctx.textAlign = 'center';
        ctx.fillText('✓', cbX + cbSize / 2, cbY + cbSize - 2); ctx.textAlign = 'left';
      }
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(t('fleet.repeatAuto'), cbX + cbSize + 6, cbY + 11);
      this._hitZones.push({ x: cbX, y: cbY, w: w - pad * 2, h: cbSize, type: 'toggle_repeat', data: {} });
      cy += cbSize + 8;

      // Przycisk "Ustaw ładunek powrotny" — gdy repeat zaznaczony i cel ma kolonię
      if (checked) {
        const colMgr = window.KOSMOS?.colonyManager;
        const targetColony = colMgr?.getColony(config.targetId) ?? null;
        if (targetColony) {
          const rcCount = config.returnCargo ? Object.keys(config.returnCargo).length : 0;
          const rcLabel = rcCount > 0
            ? t('fleet.returnCargoStatus', rcCount)
            : t('fleet.returnCargoNone');
          const btnRetH = 22;
          ctx.fillStyle = 'rgba(20,40,60,0.7)';
          ctx.fillRect(cbX, cy, w - pad * 2, btnRetH);
          ctx.strokeStyle = THEME.borderActive;
          ctx.strokeRect(cbX, cy, w - pad * 2, btnRetH);
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.accent; ctx.textAlign = 'center';
          ctx.fillText(t('fleet.setReturnCargo'), x + w / 2, cy + 15);
          ctx.textAlign = 'left';
          this._hitZones.push({ x: cbX, y: cy, w: w - pad * 2, h: btnRetH, type: 'set_return_cargo', data: {} });
          cy += btnRetH + 4;
          // Status ładunku powrotnego
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(rcLabel, cbX, cy + 8);
          cy += 14;
        }
      }
    }

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
    ctx.fillText(t('fleet.sendMission'), x + w / 2, cy + 20);
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
    ctx.fillText(t('fleet.cancel'), cancelX + cancelW / 2, cy + 16);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: cancelX, y: cy, w: cancelW, h: 24, type: 'cancel_config', data: {} });
  }

  // ── Log misji ─────────────────────────────────────────────────────────────

  _drawMissionLog(ctx, x, cy, w, maxH, pad, vessel) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.missionLog'), x + pad, cy + 10);
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
      const text = (entry.text ?? '').slice(0, 18);
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

    // Zbierz ciała aktywnego układu
    const activeSysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const bodies = [
      ...EntityManager.getByTypeInSystem('planet', activeSysId),
      ...EntityManager.getByTypeInSystem('moon', activeSysId),
      ...EntityManager.getByTypeInSystem('planetoid', activeSysId),
      ...EntityManager.getByTypeInSystem('asteroid', activeSysId),
      ...EntityManager.getByTypeInSystem('comet', activeSysId),
    ];

    for (const body of bodies) {
      // Nie pokazuj ciała, na którym statek aktualnie stoi (docked)
      if (body.id === vessel.position.dockedAt && vessel.position.state === 'docked') continue;

      // Transport — tylko ciała z kolonią/outpostem
      if (actionId === 'transport') {
        if (!colMgr?.hasColony(body.id)) continue;
      }
      // Kolonizacja — nie pokazuj pełnych kolonii (outposty można upgrade'ować)
      if (actionId === 'colonize') {
        const col = colMgr?.getColony(body.id);
        if (col && !col.isOutpost) continue;
      }
      // Założenie placówki — tylko zbadane ciała bez kolonii/outpostu
      if (actionId === 'found_outpost') {
        if (!body.explored) continue;
        if (colMgr?.hasColony(body.id)) continue;
        // Tylko odpowiednie typy (rocky, ice, moon, planetoid)
        const pType = body.planetType ?? body.type;
        const okTypes = ['rocky', 'ice', 'iron', 'volcanic', 'moon', 'planetoid'];
        if (!okTypes.includes(pType) && body.type !== 'moon' && body.type !== 'planetoid') continue;
      }
      // Survey/deep_scan — wszystkie ciała (zbadane i niezbadane)
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
