// UIManager — zarządzanie interfejsem gry na Canvas 2D
// Redesign Stellaris-inspired: TopBar, Outliner, BottomContext, BottomBar, CivPanel
//
// Rysuje na #ui-canvas nakładanym nad Three.js.
// Obsługuje kliknięcia przez metodę handleClick(x, y) zwracającą true/false.
// Wszystkie dane UI aktualizowane przez EventBus.

import EventBus    from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import {
  createPickerState as _createPickerState,
  startPicker as _startPicker,
  addWaypoint as _addPickerWaypoint,
  finalizePicker as _finalizePicker,
  cancelPicker as _cancelPicker,
} from '../utils/PickerStateMachine.js';
import { TECHS } from '../data/TechData.js';
import { BUILDINGS, RESOURCE_ICONS, formatRates, formatCost } from '../data/BuildingsData.js';
import { SHIPS } from '../data/ShipsData.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { DistanceUtils }     from '../utils/DistanceUtils.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { COSMIC }          from '../config/LayoutConfig.js';
import { OverlayManager }  from '../ui/OverlayManager.js';
import { FleetManagerOverlay } from '../ui/FleetManagerOverlay.js';
import { EventLogOverlay }    from '../ui/EventLogOverlay.js';
import { PopulationOverlay }   from '../ui/PopulationOverlay.js';
import { EconomyOverlay }      from '../ui/EconomyOverlay.js';
import { TechOverlay }         from '../ui/TechOverlay.js';
import { ColonyOverlay }       from '../ui/ColonyOverlay.js';
import { ObservatoryOverlay }  from '../ui/ObservatoryOverlay.js';
import { TradeOverlay }        from '../ui/TradeOverlay.js';
import { CivilizationOverlay } from '../ui/CivilizationOverlay.js';
import { DysonOverlay }        from '../ui/DysonOverlay.js';
import { GalaxyMapScene }      from './GalaxyMapScene.js';
import { UnitDesignOverlay }   from '../ui/UnitDesignOverlay.js';
import { IntelOverlay }        from '../ui/IntelOverlay.js';
import { DiplomacyOverlay }    from '../ui/DiplomacyOverlay.js';
import { WarOverlay }          from '../ui/WarOverlay.js';
import { POIPanel }            from '../ui/POIPanel.js';
import { GalacticMiniMap }     from '../ui/GalacticMiniMap.js';
import { StationPanel }        from '../ui/StationPanel.js';
import { CombatHUD }           from '../ui/CombatHUD.js';
import { TopResourceDrawer }   from '../ui/TopResourceDrawer.js';
import { EventLogDrawer }      from '../ui/EventLogDrawer.js';
import { t, getName }          from '../i18n/i18n.js';

// Nowe komponenty UI
import { TopBar }        from '../ui/TopBar.js';
import { BottomBar }     from '../ui/BottomBar.js';
import { BottomContext }  from '../ui/BottomContext.js';
import { Outliner }       from '../ui/Outliner.js';
// UI v3 — nawigacja przeniesiona z lewej krawędzi (NavDrawer) na STAŁY dolny pasek.
// NavDrawer.js/NavEdgeShim.js zostają na dysku (łatwy powrót), ale nie są już wpinane.
import { BottomNavBar }   from '../ui/BottomNavBar.js';
import {
  CIV_SIDEBAR_W, CIV_SIDEBAR_BTN, CIV_SIDEBAR_GAP, CIV_SIDEBAR_PAD,
  CIV_TABS,
  drawCivPanelSidebar,
  hitTestSidebar,
  drawSubNav,
  hitTestSubNav,
} from '../ui/CivPanelDrawer.js';

// Wymiary fizyczne canvas (piksele urządzenia) — aktualizowane przy resize/fullscreen
let _PW = window.innerWidth;
let _PH = window.innerHeight;
// Skala UI względem bazowego 1280×720 — automatycznie skaluje tekst i panele
let UI_SCALE = Math.min(_PW / 1280, _PH / 720);
// Wymiary logiczne (używane w kodzie rysującym — niezależne od DPI/rozdzielczości)
let W = Math.round(_PW / UI_SCALE);
let H = Math.round(_PH / UI_SCALE);

// Przelicz wymiary przy zmianie rozmiaru okna / fullscreen
function _recalcDimensions() {
  _PW = window.innerWidth;
  _PH = window.innerHeight;
  UI_SCALE = Math.min(_PW / 1280, _PH / 720);
  W = Math.round(_PW / UI_SCALE);
  H = Math.round(_PH / UI_SCALE);
  // Wystaw skalę logiczne→ekran dla DOM overlay'i (menu/dropdown pozycjonują się w px ekranu).
  if (typeof window !== 'undefined' && window.KOSMOS) window.KOSMOS.uiScale = UI_SCALE;
}

// ── Kolory i style UI ────────────────────────────────────────
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
  get purple() { return THEME.purple; },
  get mint()   { return THEME.mint; },
  get dim()    { return THEME.textDim; },
};

// ── Formatowanie liczb ──────────────────────────────────────────────
function _fmtNum(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
}

// Kolory zdarzeń EventLog
const LOG_COLORS = {
  get collision_absorb()   { return THEME.yellow; },
  get collision_destroy()  { return THEME.danger; },
  get collision_redirect() { return THEME.warning; },
  get ejection()           { return THEME.purple; },
  get new_planet()         { return THEME.accent; },
  get life_good()          { return THEME.success; },
  get life_bad()           { return THEME.danger; },
  get info()               { return THEME.textSecondary; },
  get auto_slow()          { return THEME.warning; },
  get disk_phase()         { return THEME.info; },
  get civ_epoch()          { return THEME.yellow; },
  get civ_unrest()         { return THEME.danger; },
  get civ_famine()         { return THEME.warning; },
  get expedition_ok()      { return THEME.mint; },
  get expedition_fail()    { return THEME.danger; },
  get pop_born()           { return THEME.success; },
  get pop_died()           { return THEME.danger; },
  get fleet()              { return THEME.info; },
  // M3 P3.1 post-fix #1 — POI runtime events
  get poi_alert()          { return THEME.danger; },
  get poi_rally()          { return THEME.mint; },
  // M4 P1 — channele dla nowych notyfikacji
  get intel()              { return THEME.info; },       // wykrycia, kontakty, predykcje
  get combat()             { return THEME.danger; },     // bitwy, retreaty, wraki
  get diplomacy()          { return THEME.warning; },    // wojny, ultimatums, hostility
};

// Koszty akcji gracza (zsynchronizowane z PlayerActionSystem)
const ACTION_COSTS = { stabilize: 25, nudgeToHz: 35, bombard: 20 };

// Pozycja CivPanel (pod TopBar)
const CIV_PANEL_Y = COSMIC.TOP_BAR_H;

// ── Tooltip CivPanel ────────────────────────────────────────────
const TOOLTIP_PAD    = 8;
const TOOLTIP_MAX_W  = 260;
const TOOLTIP_LINE_H = 13;
const TOOLTIP_HDR_H  = 16;
const TOOLTIP_SEP_H  = 8;
const TOOLTIP_WRAP   = 30;
const TOOLTIP_OFS    = 14;


export class UIManager {
  constructor(uiCanvas) {
    uiCanvas.width  = _PW;
    uiCanvas.height = _PH;
    this.canvas = uiCanvas;
    this.ctx    = uiCanvas.getContext('2d');

    // Resize handler — aktualizuj wymiary canvas przy fullscreen / resize
    window.addEventListener('resize', () => {
      _recalcDimensions();
      this.canvas.width  = _PW;
      this.canvas.height = _PH;
      this._dirty = true;
    });

    // ── Nowe komponenty UI ───────────────────────────────
    this._topBar       = new TopBar();
    this._bottomBar    = new BottomBar();
    this._bottomContext = new BottomContext();
    this._outliner     = new Outliner();

    // ── Stan UI ───────────────────────────────────────────────
    this._selectedEntity  = null;
    this._infoPanelTab    = 'orbit';
    // M3 P1.1 — selection model dla orderów (single source of truth).
    // FleetManagerOverlay._selectedVesselId pełni rolę cache rendering.
    this._selectedVesselId = null;
    // Player Fleet Groups (P2) — analogiczne selektor floty (single source of truth).
    // RightClickMenu czyta przez getSelectedFleetId() żeby pokazywać fleet-context
    // entries. FleetManagerOverlay._selectedFleetId pełni rolę cache rendering.
    this._selectedFleetId = null;
    // M3 P1.3 — picker mode state (np. patrol waypoints; future: targetEntity / targetPoint).
    // null gdy idle; { mode, callback, waypoints, metadata } gdy active.
    this._pickerState = null;
    this._stability       = { score: 50, trend: 'stable' };
    this._timeState       = { isPaused: false, multiplierIndex: 1, displayText: '', autoSlow: true };
    this._diskPhase       = 'DISK';
    this._diskPhasePL     = t('disk.protoplanetary');
    this._energy          = 0;
    this._energyMax       = 100;
    this._hoverAction     = null;
    this._audioEnabled    = true;
    this._musicEnabled    = window.KOSMOS?.audioSystem?.isMusicEnabled ?? true;
    this._notifications   = [];
    this._confirmDialog   = null;
    this._gameOverData    = null;   // { reason, planetName } — ekran końca gry

    // ── Stan zasobów (4X) ─────────────────────────────────────
    this._resources = { minerals: 0, energy: 0, organics: 0, water: 0, research: 0 };
    this._resCap    = { minerals: 99999, energy: 99999, organics: 99999, water: 99999, research: 99999 };
    this._resDelta  = { minerals: 0, energy: 0, organics: 0, water: 0, research: 0 };
    this._inventory = {};
    this._invPerYear = {};
    this._energyFlow = { production: 0, consumption: 0, balance: 0, brownout: false };
    this._wasBrownout = false;

    // ── Stan ekspedycji ───────────────────────────────────────
    this._expeditions = [];
    this._expPanelOpen = false;

    // ── Stan fabryk ────────────────────────────────────────────
    this._factoryData = null;

    // ── Stan CivPanel ──────
    this._civData     = null;
    this._prosperityData = null;

    // ── EventLog ──────────────────────────────────────────────
    this._logEntries = [];
    this._logYear    = 0;

    // ── Hover buttonów ────────────────────────────────────────
    this._hoveredBtn = null;

    // ── Tooltip CivPanel ────────────────────────────────────
    this._tooltip       = null;
    this._tooltipMouseX = 0;
    this._tooltipMouseY = 0;

    // ── Dirty flag — optymalizacja renderingu ──────────────
    this._dirty        = true;   // wymuszaj pierwszy frame
    this._animating    = false;  // ciągły redraw dla animacji (notifications, gameOver)
    this._lastDrawTime = 0;      // timestamp ostatniego renderowania (ms)
    this._coloniesDirty  = true; // invalidacja cache getAllColonies()
    this._cachedColonies = [];   // cache wyników getAllColonies()

    // ── OverlayManager (panele pełnoekranowe) ─────────────
    this.overlayManager = new OverlayManager();
    this.overlayManager.register('fleet', new FleetManagerOverlay());
    this.overlayManager.register('population', new PopulationOverlay());
    this.overlayManager.register('economy', new EconomyOverlay());
    this.overlayManager.register('tech', new TechOverlay());
    this.overlayManager.register('colony', new ColonyOverlay());
    this.overlayManager.register('observatory', new ObservatoryOverlay());
    this.overlayManager.register('trade', new TradeOverlay());
    this.overlayManager.register('civilization', new CivilizationOverlay());
    this.overlayManager.register('unit_design', new UnitDesignOverlay());
    this.overlayManager.register('dyson', new DysonOverlay());
    this.overlayManager.register('galaxy', new GalaxyMapScene());
    this.overlayManager.register('intel', new IntelOverlay());
    this.overlayManager.register('diplomacy', new DiplomacyOverlay());
    this.overlayManager.register('war', new WarOverlay());
    this.overlayManager.register('eventLog', new EventLogOverlay());
    this.overlayManager.register('poi', new POIPanel());
    this.overlayManager.register('minimap', new GalacticMiniMap());
    // M4 P3 polish — live combat HP HUD. Always-on (auto-show gdy DSCS ma active
    // encounters). Renderowany BEZPOŚREDNIO z _draw() (po overlayManager) bo
    // OverlayManager rysuje tylko jeden active overlay — CombatHUD musi być
    // widoczny niezależnie od tego co player ma otwarte.
    this.combatHud = new CombatHUD();
    // Expose dla BottomBar (chip „⚔ Walki") + click handler.
    window.KOSMOS.combatHud = this.combatHud;

    // S4-2 — StationPanel: lekki pływający panel info stacji. Non-exclusive (jak CombatHUD):
    // trzymany bezpośrednio, rysowany PO overlayManager, coexist z colony panelem i widokiem 3D.
    this.stationPanel = new StationPanel();
    window.KOSMOS.stationPanel = this.stationPanel;

    // Redesign UI — TopResourceDrawer: górny wysuwany pasek surowców (zastąpił dolny
    // BottomResourceBar). Trigger 6px od górnej krawędzi (y=0); hover → panel z wierszem na kolonię.
    // Non-exclusive: rysowany PO overlayManager (nad overlay'em), klik PRZED overlayManager.
    this._topResourceDrawer = new TopResourceDrawer();
    window.KOSMOS.topResourceDrawer = this._topResourceDrawer;

    // Redesign UI — EventLogDrawer: dziennik zdarzeń jako hover-drawer dolnej krawędzi
    // (środek). Zastąpił inline EventLog (2 wpisy) w BottomBar. Klik → pełny overlay 'eventLog'.
    this._eventLogDrawer = new EventLogDrawer();
    window.KOSMOS.eventLogDrawer = this._eventLogDrawer;

    // Skala logiczne→ekran (dla DOM menu/dropdown przeniesionych do prawego górnego rogu).
    window.KOSMOS.uiScale = UI_SCALE;

    // UI v3 — BottomNavBar: STAŁY poziomy pasek nawigacji (7 grup NAV_GROUPS) u dołu,
    // tuż nad strefą dziennika. Zastępuje lewy wysuwany NavDrawer. Non-exclusive: rysowany
    // PO overlayManager (na wierzchu overlay'i), klik routowany PRZED overlayManager.
    // DOM overlaye Tech/Observatory rezerwują BOTTOM_NAV_H (BaseOverlay/DOM bounds) → nie
    // zakrywają paska, więc edge-shim niepotrzebny.
    this._bottomNavBar = new BottomNavBar();
    window.KOSMOS.bottomNavBar = this._bottomNavBar;

    this._setupEvents();
    this._startDrawLoop();

    // Scroll kółkiem myszy — normalizacja deltaY (różne przeglądarki/urządzenia)
    window.addEventListener('wheel', (e) => {
      // deltaMode: 0=px, 1=lines, 2=pages — normalizuj do px-like
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 20;       // linie → px (typowy wiersz ~20px)
      else if (e.deltaMode === 2) dy *= 400;  // strony → px
      this.handleWheel(e.clientX, e.clientY, dy);
    }, { passive: true });
  }

  // ── M3 P1.1: selection state API ──────────────────────────────
  // Single source of truth dla aktualnie zaznaczonego vessela.
  // FleetManagerOverlay._selectedVesselId synchronizowane jako cache
  // (jednokierunkowy data flow — UIManager pisze, FleetOverlay tylko czyta).
  getSelectedVesselId() {
    return this._selectedVesselId;
  }

  setSelectedVesselId(vesselId) {
    if (this._selectedVesselId === vesselId) return;  // dedupe
    if (vesselId !== null) {
      const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      if (!v) {
        console.warn(`[UIManager] setSelectedVesselId: vessel ${vesselId} nie istnieje`);
        return;
      }
    }
    const prev = this._selectedVesselId;
    this._selectedVesselId = vesselId;
    // Sync cache w FleetOverlay (D1: jednokierunkowy data flow)
    const fleetOv = this.overlayManager?.overlays?.fleet;
    if (fleetOv) fleetOv._selectedVesselId = vesselId;
    EventBus.emit('ui:selectionChanged', { vesselId, prevVesselId: prev });
  }

  // ── P2: Selected fleet (analog vessel) ────────────────────────
  getSelectedFleetId() {
    return this._selectedFleetId;
  }

  setSelectedFleetId(fleetId) {
    // Sync cache fleetOv zawsze (defensywnie), nawet gdy UIManager._selectedFleetId
    // === fleetId (dedupe). Bez tego direct-mutate w FleetManagerOverlay (które było
    // bugiem w _handleCreateFleet) powoduje permanentny desync — UIManager null,
    // fleetOv ma fleet.id. setSelectedFleetId(null) wtedy DEDUPE'uje i nie czyści
    // fleetOv → mutex nie działa.
    const fleetOv = this.overlayManager?.overlays?.fleet;
    if (fleetId !== null) {
      const f = window.KOSMOS?.fleetSystem?.getFleet?.(fleetId);
      if (!f) {
        console.warn(`[UIManager] setSelectedFleetId: fleet ${fleetId} nie istnieje`);
        return;
      }
    }
    if (fleetOv) fleetOv._selectedFleetId = fleetId;
    if (this._selectedFleetId === fleetId) return;  // dedupe event emit
    const prev = this._selectedFleetId;
    this._selectedFleetId = fleetId;
    EventBus.emit('ui:fleetSelectionChanged', { fleetId, prevFleetId: prev });
  }

  // M4 P2 — Tab / Shift+Tab cycling przez własne nie-wrak vessele.
  // Sortuje po id (deterministyczne), wraparound. Aktualizuje selection +
  // emituje vessel:focus żeby kamera 3D poleciała do wybranego statku.
  cycleSelectedVessel(direction = 1) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;
    const list = [...vMgr._vessels.values()]
      .filter(v => !v.isWreck && !isEnemyVessel(v))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (list.length === 0) return;
    const curId = this._selectedVesselId;
    const curIdx = curId ? list.findIndex(v => v.id === curId) : -1;
    let nextIdx;
    if (curIdx === -1) {
      nextIdx = direction === -1 ? list.length - 1 : 0;
    } else {
      const n = list.length;
      nextIdx = ((curIdx + direction) % n + n) % n;
    }
    const next = list[nextIdx];
    this.setSelectedVesselId(next.id);
    EventBus.emit('vessel:focus', { vesselId: next.id });
  }

  clearSelection() {
    this.setSelectedVesselId(null);
  }

  // ── M3 P1.3: picker mode API ──────────────────────────────────
  // Picker = "klikaj N punktów na mapie" tryb (np. patrol waypoints).
  // Logika delegowana do PickerStateMachine (pure helper); UIManager dodaje
  // EventBus emity (HUD banner i cursor reagują w GameScene._createPickerHUD).
  getPickerState() {
    return this._pickerState;
  }

  isPickerActive() {
    return this._pickerState !== null;
  }

  setPickerMode(mode, callback, metadata = {}) {
    const result = _startPicker(this._pickerState, mode, callback, metadata);
    if (!result.ok) {
      console.warn(`[UIManager] setPickerMode rejected: ${result.reason}`);
      return false;
    }
    this._pickerState = result.newState;
    EventBus.emit('ui:pickerModeStarted', { mode, metadata: result.newState.metadata });
    return true;
  }

  addPickerWaypoint(point) {
    if (!this._pickerState) return false;
    const result = _addPickerWaypoint(this._pickerState, point);
    if (!result.ok) {
      console.warn(`[UIManager] addPickerWaypoint rejected: ${result.reason}`);
      return false;
    }
    this._pickerState = result.newState;
    EventBus.emit('ui:pickerWaypointAdded', {
      point: { x: point.x, y: point.y },
      total: result.newState.waypoints.length,
    });
    return true;
  }

  finalizePickerMode() {
    if (!this._pickerState) return false;
    const result = _finalizePicker(this._pickerState);
    if (!result.ok) {
      console.warn(`[UIManager] finalizePickerMode rejected: ${result.reason}`);
      return false;
    }
    const { callback, metadata, result: pickerResult, mode } = result;
    this._pickerState = null;
    EventBus.emit('ui:pickerModeEnded', { result: pickerResult, metadata, mode, cancelled: false });
    if (typeof callback === 'function') {
      try {
        callback(pickerResult, metadata);
      } catch (err) {
        console.warn('[UIManager] picker callback threw:', err);
      }
    }
    return true;
  }

  cancelPickerMode() {
    if (!this._pickerState) return false;
    const prevMode = this._pickerState.mode;
    this._pickerState = null;
    EventBus.emit('ui:pickerModeEnded', { result: null, mode: prevMode, cancelled: true });
    return true;
  }

  // ── EventBus ──────────────────────────────────────────────────
  _setupEvents() {
    // Czas
    EventBus.on('time:stateChanged', ({ isPaused, multiplierIndex }) => {
      this._timeState.isPaused          = isPaused;
      this._timeState.multiplierIndex   = multiplierIndex;
      this._dirty = true;
    });
    EventBus.on('time:display', ({ displayText, multiplierIndex, autoSlow }) => {
      this._timeState.displayText       = displayText;
      this._timeState.multiplierIndex   = multiplierIndex;
      this._timeState.autoSlow          = autoSlow;
    });

    // Stabilność
    EventBus.on('system:stabilityChanged', ({ score, trend }) => {
      this._stability = { score, trend };
      this._dirty = true;
    });

    // Faza dysku
    EventBus.on('disk:phaseChanged', ({ newPhase, newPhasePL }) => {
      this._diskPhase   = newPhase;
      this._diskPhasePL = newPhasePL;
      this._dirty = true;
    });

    // Zaznaczenie
    EventBus.on('body:selected', ({ entity }) => {
      this._selectedEntity = entity;
      if (this._infoPanelTab === 'composition' && !entity.composition) {
        this._infoPanelTab = 'orbit';
      }
      this._dirty = true;
    });
    EventBus.on('body:deselected', () => { this._selectedEntity = null; this._dirty = true; });
    EventBus.on('player:planetUpdated', ({ planet }) => {
      if (this._selectedEntity?.id === planet.id) { this._selectedEntity = planet; this._dirty = true; }
    });
    EventBus.on('planet:compositionChanged', ({ planet }) => {
      if (this._selectedEntity?.id === planet.id) { this._selectedEntity = planet; this._dirty = true; }
    });
    EventBus.on('body:collision', () => {});

    // Synchronizacja stanu audio/muzyka z UI
    EventBus.on('audio:toggle', () => { this._audioEnabled = !this._audioEnabled; this._dirty = true; });
    EventBus.on('music:toggled', ({ enabled }) => { this._musicEnabled = enabled; this._dirty = true; });

    // Energia gracza
    EventBus.on('player:energyChanged', ({ energy, max }) => {
      this._energy    = energy;
      this._energyMax = max;
      this._dirty = true;
    });

    // Zasoby 4X
    const _applyResources = ({ resources, inventory }) => {
      if (resources) {
        for (const [key, res] of Object.entries(resources)) {
          this._resources[key] = res.amount   ?? 0;
          this._resDelta[key]  = res.perYear  ?? 0;
          this._resCap[key]    = res.capacity ?? 99999;
        }
      }
      if (inventory) {
        for (const [id, amt] of Object.entries(inventory)) {
          if (id.startsWith('_')) continue;
          this._inventory[id] = amt;
        }
        if (inventory._energy) {
          const wasBefore = this._wasBrownout;
          this._energyFlow = { ...inventory._energy };
          const isNow = !!this._energyFlow.brownout;
          // Brownout dotyczy aktywnej kolonii (resource:changed emituje tylko aktywna).
          const activeColonyId = window.KOSMOS?.colonyManager?.getActiveColony?.()?.planetId ?? null;
          if (isNow && !wasBefore) {
            this._log(t('log.brownoutStart'), 'civ_unrest', activeColonyId);
          } else if (!isNow && wasBefore) {
            this._log(t('log.brownoutEnd'), 'expedition_ok', activeColonyId);
          }
          this._wasBrownout = isNow;
        }
        // Research: sumuj ze WSZYSTKICH kolonii (badania są globalne)
        {
          const colMgr = window.KOSMOS?.colonyManager;
          const colonies = colMgr?.getAllColonies?.() ?? [];
          if (colonies.length > 1) {
            let totalAmt = 0, totalRate = 0;
            for (const col of colonies) {
              const rs = col.resourceSystem;
              if (!rs?.research) continue;
              totalAmt  += rs.research.amount  ?? 0;
              totalRate += rs.research.perYear ?? 0;
            }
            this._resources.research = totalAmt;
            this._resDelta.research  = totalRate;
          } else if (inventory._research) {
            this._resources.research = inventory._research.amount ?? 0;
            this._resDelta.research  = inventory._research.perYear ?? 0;
          }
        }
        // Preferuj obserwowane delty (uwzględniają mining + receive + spend)
        // Fallback na _perYear (tylko registrowane producenty)
        if (inventory._observedPerYear && Object.keys(inventory._observedPerYear).length > 0) {
          this._invPerYear = { ...inventory._observedPerYear };
        } else if (inventory._perYear) {
          this._invPerYear = { ...inventory._perYear };
        }
      }
      this._dirty = true;
    };
    EventBus.on('resource:changed',  _applyResources);
    EventBus.on('resource:snapshot', _applyResources);
    EventBus.on('resource:shortage', ({ resource }) => {
      this._flashResource(resource);
      this._dirty = true;
    });

    // CivPanel
    EventBus.on('civ:populationChanged', (data) => { this._civData = data; this._dirty = true; });
    EventBus.on('prosperity:changed',    (data) => { this._prosperityData = data; this._dirty = true; });

    // Fabryki
    EventBus.on('factory:statusChanged', (data) => { this._factoryData = data; this._dirty = true; });

    // Tech
    EventBus.on('tech:researched', ({ tech, restored }) => {
      if (!restored) this.addInfo(`Zbadano: ${tech.namePL}`);
    });
    EventBus.on('tech:researchFailed', ({ techId, reason }) => {
      this.addInfo(`Badanie: ${reason}`);
    });

    // Ekspedycje
    EventBus.on('expedition:launched', ({ expedition }) => {
      this._expeditions.push(expedition);
      this._dirty = true;
    });
    EventBus.on('expedition:arrived',  ({ expedition }) => {
      // Aktualizuj stan — orbiting/returning, nie usuwaj od razu
      const idx = this._expeditions.findIndex(e => e.id === expedition.id);
      if (idx !== -1) {
        this._expeditions[idx] = { ...this._expeditions[idx], ...expedition };
        // Usuwaj tylko jeśli completed (colony, transport po powrocie)
        if (expedition.status === 'completed') {
          this._expeditions.splice(idx, 1);
        }
      }
      this._dirty = true;
    });
    EventBus.on('expedition:disaster', ({ expedition }) => {
      this._expeditions = this._expeditions.filter(e => e.id !== expedition.id);
      this._dirty = true;
    });
    EventBus.on('expedition:returned', ({ expedition }) => {
      this._expeditions = this._expeditions.filter(e => e.id !== expedition.id);
      this._dirty = true;
    });
    EventBus.on('expedition:returnOrdered', ({ expedition }) => {
      // Aktualizuj status na returning
      const idx = this._expeditions.findIndex(e => e.id === expedition.id);
      if (idx !== -1) {
        this._expeditions[idx] = { ...this._expeditions[idx], ...expedition };
      }
      this._dirty = true;
    });
    EventBus.on('expedition:reconProgress', ({ expedition }) => {
      // Sekwencyjny full_system recon — aktualizuj dane (nowy targetId, arrivalYear, bodiesDiscovered)
      // ObservatorySystem emituje ten sam event dla discovery ciał — bez expedition.
      if (!expedition) return;
      const idx = this._expeditions.findIndex(e => e.id === expedition.id);
      if (idx !== -1) {
        this._expeditions[idx] = { ...this._expeditions[idx], ...expedition };
      }
      this._dirty = true;
    });
    EventBus.on('expedition:redirected', ({ expedition }) => {
      const idx = this._expeditions.findIndex(e => e.id === expedition.id);
      if (idx !== -1) {
        this._expeditions[idx] = { ...this._expeditions[idx], ...expedition };
      }
      this._dirty = true;
    });
    EventBus.on('expedition:redirectFailed', ({ reason }) => {
      this._addNotification(`⚠ Zmiana celu: ${reason}`);
    });

    // Flota — kanał 'fleet', severity info/warn zależnie od zdarzenia
    EventBus.on('fleet:buildStarted', ({ shipId }) => {
      const ship = SHIPS[shipId];
      this._addNotification(`⚓ Stocznia: budowa ${ship?.namePL ?? shipId}`, 'fleet', 'info');
    });
    EventBus.on('fleet:shipCompleted', ({ shipId }) => {
      const ship = SHIPS[shipId];
      this._addNotification(`✅ Statek gotowy: ${ship?.icon ?? '🚀'} ${ship?.namePL ?? shipId}`, 'fleet', 'info');
    });
    EventBus.on('fleet:buildFailed', ({ reason }) => {
      this._addNotification(`⚠ Stocznia: ${reason}`, 'fleet', 'warn');
    });
    EventBus.on('fleet:disbandFailed', ({ reason, details }) => {
      const suffix = details ? ` (${details})` : '';
      this._addNotification(`⚠ Disband: ${reason}${suffix}`, 'fleet', 'warn');
    });
    EventBus.on('fleet:disbanded', (payload) => {
      // Legacy (ColonyManager) emit {vesselId, shipId, planetId} dla decommissioned statku.
      // P2 FleetSystem emit {fleetId, reason} dla rozwiązania floty — pomijamy tu
      // (osobny handler poniżej dla fleet-context payloadu).
      if (payload?.fleetId) return;
      const { shipId } = payload ?? {};
      const ship = SHIPS[shipId] ?? null;
      this._addNotification(`🗑 Statek rozformowany: ${ship?.namePL ?? shipId}`, 'fleet', 'info');
    });
    EventBus.on('fleet:buildQueued', ({ shipId }) => {
      const ship = SHIPS[shipId];
      this._addNotification(`⏳ Stocznia: ${ship?.namePL ?? shipId} — oczekuje na surowce`, 'fleet', 'info');
    });

    // ── Player Fleet Groups (P2) — fleet lifecycle + orders ──
    EventBus.on('fleet:created', ({ fleet }) => {
      this._addNotification(`⚑ Utworzono flotę „${fleet?.name ?? '?'}"`, 'fleet', 'info');
    });
    EventBus.on('fleet:disbanded', ({ fleetId, reason }) => {
      // 'shipId' fleet:disbanded ma starszy semantykę (vessel decommission) i
      // dostarczana wyzej. Tu kontrastujemy po payloadzie: fleetId field.
      if (fleetId) {
        this._addNotification(`⚑ Rozwiązano flotę (${reason === 'empty' ? 'pusta' : reason ?? 'manual'})`, 'fleet', 'info');
      }
    });
    EventBus.on('fleet:orderIssued', ({ fleetId, type, accepted, rejected, fleetEta, speedCap }) => {
      const fname = window.KOSMOS?.fleetSystem?.getFleet?.(fleetId)?.name ?? fleetId;
      const aN = accepted?.length ?? 0;
      const rN = rejected?.length ?? 0;
      const total = aN + rN;
      let extra = '';
      if (typeof fleetEta === 'number') extra = ` (ETA ~${fleetEta.toFixed(1)} roku)`;
      else if (typeof speedCap === 'number') extra = ` (cap ${speedCap.toFixed(1)} AU/r)`;
      const sev = rN > 0 ? 'warn' : 'info';
      this._addNotification(`⚑ ${fname} → ${type}: ${aN}/${total}${extra}`, 'fleet', sev);
    });
    EventBus.on('fleet:orderCompleted', ({ fleetId, type }) => {
      const fname = window.KOSMOS?.fleetSystem?.getFleet?.(fleetId)?.name ?? fleetId;
      this._addNotification(`⚑ ${fname}: ${type} zakończone`, 'fleet', 'info');
    });
    EventBus.on('fleet:orderCancelled', ({ fleetId, reason }) => {
      const fname = window.KOSMOS?.fleetSystem?.getFleet?.(fleetId)?.name ?? fleetId;
      this._addNotification(`⚑ ${fname}: rozkaz anulowany (${reason})`, 'fleet', 'info');
    });
    // P3 — retreat_at_50 doctrine triggered auto-retreat.
    EventBus.on('fleet:retreatTriggered', ({ fleetId, aggregateHpPct, memberCount, retreatedIds }) => {
      const fname = window.KOSMOS?.fleetSystem?.getFleet?.(fleetId)?.name ?? fleetId;
      const pctText = Math.round((aggregateHpPct ?? 0) * 100);
      const issued = Array.isArray(retreatedIds) ? retreatedIds.length : (memberCount ?? 0);
      this._addNotification(t('log.fleetRetreatTriggered', fname, pctText, issued), 'fleet', 'warn');
      this._triggerAutoSlowIfTime(t('log.autoSlowFleetRetreat'));
    });

    // Vessel events
    EventBus.on('vessel:launched', ({ vessel, mission }) => {
      const sd = SHIPS[vessel.shipId];
      const icon = sd?.icon ?? '🚀';
      const mIcon = mission?.type === 'colony' ? '🚢'
        : mission?.type === 'transport' ? '📦' : mission?.type === 'recon' ? '🔭' : '⛏';
      this._addNotification(`${icon} ${vessel.name} → ${mission?.targetName ?? '?'} (${mIcon} ${mission?.type})`, 'fleet', 'info');
    });
    EventBus.on('vessel:docked', ({ vessel }) => {
      this._addNotification(`↩ ${vessel.name} powrócił`, 'fleet', 'info');
    });

    // Autosave
    EventBus.on('game:saved', ({ gameTime, sizeBytes }) => {
      const y = Math.round(gameTime).toLocaleString('pl-PL');
      const mb = sizeBytes ? ` ${(sizeBytes / 1024 / 1024).toFixed(2)} MB` : '';
      this._addNotification(`\u{1F4BE} Zapisano (${y} lat${mb})`, 'system', 'info');
    });

    // Save failure (np. localStorage quota — bez tego user nie wie ze save padl)
    EventBus.on('game:saveFailed', ({ reason, message }) => {
      let msg;
      if (reason === 'quota') {
        msg = '\u{26A0} Save NIE zapisany — localStorage pelny. Usun stare save lub eksportuj.';
      } else if (reason === 'serialization') {
        msg = `\u{26A0} Save padl (blad serializacji): ${message}. Zobacz konsole F12.`;
      } else {
        msg = `\u{26A0} Save padl: ${message}`;
      }
      this._addNotification(msg, 'system', 'warning');
    });

    // Proaktywne ostrzezenie gdy save zbliza sie do quota (~5 MB Chrome)
    EventBus.on('game:saveLargeWarning', ({ sizeMB }) => {
      const mb = sizeMB.toFixed(2);
      this._addNotification(
        `\u{26A0} Save duzy (${mb} MB / ~5 MB limit). Rozwaz eksport.`,
        'system',
        'warning',
      );
    });

    // Dialog Nowa Gra (emitowane z BottomBar)
    EventBus.on('ui:confirmNew', () => {
      this._confirmDialog = { visible: true };
      this._dirty = true;
    });

    // Game Over — cywilizacja zniszczona
    EventBus.on('game:over', ({ reason, planetName }) => {
      this._gameOverData = { reason, planetName };
      this._dirty = true;
      this._animating = true;
    });

    // EventLog subskrypcje
    this._setupLogEvents();
  }

  _setupLogEvents() {
    EventBus.on('time:display', ({ displayText, gameTime }) => {
      // Użyj gameTime bezpośrednio zamiast parsowania tekstu (i18n-safe)
      if (gameTime != null) this._logYear = Math.floor(gameTime);
    });

    EventBus.on('body:collision', ({ winner, loser, type }) => {
      const smallTypes = new Set(['asteroid', 'comet', 'planetesimal', 'planetoid']);
      if (loser && smallTypes.has(loser.type)) return;
      if (type === 'absorb') {
        this._log(t('log.absorbed', winner?.name ?? '?', loser?.name ?? '?'), 'collision_absorb');
      } else if (type === 'redirect') {
        this._log(t('log.collisionRedirect', winner?.name ?? '?', loser?.name ?? '?'), 'collision_redirect');
      } else if (type === 'eject') {
        this._log(t('log.ejected', loser?.name ?? '?'), 'ejection');
      }
    });

    EventBus.on('planet:ejected', ({ planet }) => {
      this._log(t('log.planetEjected', planet.name), 'ejection');
    });

    // Uderzenia kosmiczne na kolonie
    EventBus.on('impact:colonyDamage', ({ message, severity, popLost, buildingsDestroyed }) => {
      const type = severity === 'extinction' || severity === 'heavy' ? 'collision_destroy' : 'collision_absorb';
      let detail = message;
      if (popLost > 0 || buildingsDestroyed > 0) {
        const parts = [];
        if (popLost > 0) parts.push(t('log.impactPopLost', popLost));
        if (buildingsDestroyed > 0) parts.push(t('log.impactBuildingsDestroyed', buildingsDestroyed));
        detail += ` (${parts.join(', ')})`;
      }
      this._log(detail, type);
    });

    EventBus.on('accretion:newPlanet', (planet) => {
      this._log(t('log.newPlanet', planet.name), 'new_planet');
    });

    EventBus.on('life:emerged', ({ planet }) => {
      this._log(t('log.lifeEmerged', planet.name), 'life_good');
    });
    EventBus.on('life:evolved', ({ planet, stage }) => {
      this._log(t('log.lifeEvolved', planet.name, stage.label), 'life_good');
    });
    EventBus.on('life:extinct', ({ planet }) => {
      this._log(t('log.lifeExtinctShort', planet.name), 'life_bad');
    });

    EventBus.on('time:autoSlowTriggered', ({ reason }) => {
      this._log(t('log.autoSlow', reason), 'auto_slow');
    });


    EventBus.on('civ:epochChanged', ({ epoch, message }) => {
      this._log(message || t('log.epochChanged', epoch?.key ? t(epoch.key) : (epoch?.namePL ?? epoch)), 'civ_epoch');
    });
    EventBus.on('civ:unrest', ({ planetId, colonyName }) => {
      const name = colonyName ?? t('log.colonyUnknown');
      this._log(t('log.socialUnrest', name), 'civ_unrest', planetId);
    });
    EventBus.on('civ:unrestLifted', ({ planetId, colonyName }) => {
      if (!colonyName) return; // legacy event bez context — pomiń żeby nie spamować
      this._log(t('log.colonyUnrestLifted', colonyName), 'expedition_ok', planetId);
    });
    EventBus.on('civ:famine', ({ planetId, colonyName }) => {
      const name = colonyName ?? 'kolonia';
      this._log(t('log.colonyFamine', name), 'civ_famine', planetId);
    });
    EventBus.on('civ:famineLifted', ({ planetId, colonyName }) => {
      if (!colonyName) return;
      this._log(t('log.colonyFamineLifted', colonyName), 'expedition_ok', planetId);
    });

    EventBus.on('civ:popBorn', ({ population, planetId, colonyName }) => {
      const name = colonyName ?? '—';
      this._log(t('log.popBorn', name, population), 'pop_born', planetId);
    });
    EventBus.on('civ:popDied', ({ cause, population, planetId, colonyName }) => {
      const name = colonyName ?? '—';
      const key = cause === 'starvation' ? 'log.popDiedStarvation' : 'log.popDied';
      this._log(t(key, name, population), 'pop_died', planetId);
    });

    EventBus.on('expedition:reconProgress', ({ body, discovered }) => {
      // Postęp sekwencyjnego recon — odkryto kolejne ciało
      const name = body?.name ?? '???';
      this._log(t('log.reconDiscovered', name, discovered), 'expedition_ok');
    });
    EventBus.on('expedition:reconComplete', ({ scope, discovered }) => {
      const label = scope === 'nearest' ? t('log.reconNearest') : t('log.reconSystem');
      const count = Array.isArray(discovered) ? discovered.length : discovered;
      this._log(t('log.reconComplete', label, count), 'expedition_ok');
    });
    EventBus.on('expedition:arrived', ({ expedition, multiplier }) => {
      // Orbiting nie loguje "wraca" — raport logowany osobno
      if (expedition.status === 'orbiting') return;
      const mult = multiplier != null ? ` ×${multiplier.toFixed(1)}` : '';
      const typeLabel = expedition.type === 'transport' ? t('log.arrivalTransport')
        : expedition.type === 'colony' ? t('log.arrivalColony')
        : expedition.type === 'recon' ? t('log.arrivalRecon')
        : t('log.arrivalExpedition');
      this._log(`${typeLabel}: ${expedition.targetName}${mult}`, 'expedition_ok');
    });
    EventBus.on('expedition:missionReport', ({ text }) => {
      // Raport z misji mining — szczegółowe zasoby
      this._log(text, 'expedition_ok');
    });
    EventBus.on('expedition:disaster', ({ expedition }) => {
      this._log(t('log.arrivalDisaster', expedition.targetName), 'expedition_fail');
    });
    EventBus.on('expedition:launchFailed', ({ reason, cause }) => {
      this._log(t('log.expeditionLaunchFailed', reason), 'expedition_fail');
      // (d) Luka A — paliwowa porażka startu też jako toast (EventLog łatwo przeoczyć).
      // Tylko cause==='fuel' (precyzyjnie wg decyzji); łapie też cichą porażkę map-pick.
      if (cause === 'fuel') {
        EventBus.emit('ui:toast', { text: `⛽ ${reason}`, color: THEME.danger, durationMs: 3500 });
      }
    });
    // (d) Luka D — utknięcie statku to trwałe zdarzenie strategiczne → osobny wpis
    // w EventLogu (obok per-vessel missionLog + toastu). Toast może umknąć; historia zostaje.
    EventBus.on('vessel:strandedNoFuel', ({ vesselId, name }) => {
      const vName = name ?? window.KOSMOS?.vesselManager?.getVessel(vesselId)?.name ?? vesselId;
      this._log(t('vessel.stranded', vName), 'expedition_fail');
    });
    // (d) twardy stranding — rozkaz powrotu odrzucony (brak paliwa). EventLog + toast
    // (reuse kluczy vessel.stranded/strandedToast — semantyka identyczna).
    EventBus.on('vessel:returnBlocked', ({ vesselId }) => {
      const vName = window.KOSMOS?.vesselManager?.getVessel(vesselId)?.name ?? vesselId;
      this._log(t('vessel.stranded', vName), 'expedition_fail');
      EventBus.emit('ui:toast', { text: t('vessel.strandedToast', vName), color: THEME.danger, durationMs: 4000 });
    });
    EventBus.on('outpost:orderQueued', ({ order }) => {
      const bDef = BUILDINGS[order.buildingId];
      const bName = bDef ? getName(bDef, 'building') : order.buildingId;
      const targetName = order.targetName ?? order.targetId ?? '?';
      this._log(t('log.outpostOrderQueued', bName, targetName), 'expedition_ok');
      this._addNotification(`⏳ ${bName} → ${targetName}`, 'fleet', 'info');
    });
    EventBus.on('colony:founded', ({ colony }) => {
      this._log(t('log.colonyFounded', colony.name), 'new_planet');
      this._coloniesDirty = true;
    });
    // Przełączenie aktywnej kolonii z Outliner → odśwież wszystkie dane UI
    EventBus.on('colony:switched', () => {
      this._dirty = true;
      this._coloniesDirty = true;
      EventBus.emit('resource:requestSnapshot');
      // Odśwież dane populacji z nowej kolonii
      const cSys = window.KOSMOS?.civSystem;
      if (cSys) {
        this._civData = cSys._popSnapshot();
      }
      // Odśwież dane fabryk
      const fSys = window.KOSMOS?.factorySystem;
      if (fSys) {
        this._factoryData = {
          allocations: fSys.getAllocations(),
          totalPoints: fSys.totalPoints,
          usedPoints:  fSys.usedPoints,
          freePoints:  fSys.freePoints,
        };
      }
    });
    // Invalidacja cache kolonii przy zmianie listy
    EventBus.on('colony:destroyed', () => { this._coloniesDirty = true; this._dirty = true; });
    EventBus.on('outpost:founded',  () => { this._coloniesDirty = true; this._dirty = true; });

    EventBus.on('colony:tradeExecuted', ({ route }) => {
      this._log(t('log.tradeExecuted'), 'info');
    });
    EventBus.on('colony:migration', ({ from, to, count }) => {
      this._log(t('log.migration', count, from, to), 'info');
    });
    EventBus.on('trade:migrationExecuted', ({ fromName, toName, toId, popQty, krCost }) => {
      this._log(t('log.civMigration', popQty.toFixed(2), fromName, toName, krCost.toFixed(0)), 'info', toId);
    });

    // Prosperity events
    EventBus.on('epoch:changed', ({ epoch, oldEpoch }) => {
      const epochKey = `log.epoch${epoch.charAt(0).toUpperCase() + epoch.slice(1)}`;
      const epochName = t(epochKey);
      const goodsKey = `log.epochGoods${epoch.charAt(0).toUpperCase() + epoch.slice(1)}`;
      const goodsName = t(goodsKey);
      const msg = t('log.epochEntered', epochName);
      const detail = goodsName !== goodsKey ? t('log.epochExpectsGoods', goodsName) : '';
      this._log(msg + detail, 'civ_epoch');
    });

    // Anti-spam: max 1 wpis per towar per 5 lat
    this._lastShortageLog = {};
    EventBus.on('consumer:shortage', ({ goodId }) => {
      const now = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      const last = this._lastShortageLog[goodId] ?? -999;
      if (now - last < 5) return;
      this._lastShortageLog[goodId] = now;
      const colonyName = window.KOSMOS?.colonyManager?.getActiveColony?.()?.name ?? '';
      const goodDef = COMMODITIES[goodId];
      const goodName = goodDef ? getName({ id: goodId, namePL: goodDef.namePL }, 'commodity') : goodId;
      this._log(t('log.commodityShortage', goodName, colonyName), 'civ_famine');
    });

    // Lądowanie statku + raport cargo
    EventBus.on('vessel:docked', ({ vessel }) => {
      if (!vessel) return;
      this._log(`↩ ${vessel.name} ${t('log.vesselDocked')}`, 'fleet');
    });
    EventBus.on('trade:imported', ({ vesselName, colonyId, items, orderBoard }) => {
      if (orderBoard) return; // S3.5b — Order Board loguje własny wpis „🤝" (bez duplikatu 📦)
      if (!items || Object.keys(items).length === 0) return;
      const colName = window.KOSMOS?.colonyManager?.getColony?.(colonyId)?.name ?? colonyId;
      const summary = Object.entries(items)
        .map(([id, qty]) => `${id}:${qty}`)
        .join(', ');
      this._log(`📦 ${vesselName} → ${colName}: ${summary}`, 'fleet');
    });

    // S3.5b — Order Board: realizacja / anulowanie zleceń (rozliczenie po 1 roku gry)
    EventBus.on('tradeOrder:delivered', ({ order }) => {
      if (!order) return;
      const cd = COMMODITIES[order.goodId];
      const nm = cd ? getName({ id: order.goodId, namePL: cd.namePL }, 'commodity') : order.goodId;
      const side = order.side === 'buy' ? t('market.buy') : t('market.sell');
      this._log(t('market.log.delivered', side, nm, Math.round(order.qty), Math.round(order.total)), 'fleet', order.playerColonyId);
    });
    EventBus.on('tradeOrder:cancelled', ({ order, reason }) => {
      if (!order || reason === 'player_cancel') return; // ręczne anulowanie nie zaśmieca logu
      const cd = COMMODITIES[order.goodId];
      const nm = cd ? getName({ id: order.goodId, namePL: cd.namePL }, 'commodity') : order.goodId;
      const rk = `market.reason.${reason}`;
      const rl = t(rk);
      this._log(t('market.log.cancelled', nm, rl === rk ? reason : rl), 'info', order.playerColonyId);
    });

    // Milestone prosperity
    this._lastProsperity = {};
    EventBus.on('prosperity:changed', ({ prosperity, delta, planetId }) => {
      const oldP = prosperity - (delta ?? 0);
      const milestones = [30, 50, 65, 80];
      for (const m of milestones) {
        if (oldP < m && prosperity >= m) {
          const colonyName = window.KOSMOS?.colonyManager?.getColony?.(planetId)?.name ?? '';
          this._log(t('log.prosperityMilestone', colonyName, m), 'civ_epoch');
        }
      }
    });

    // M3 P3.1 post-fix #1 — POI runtime events. Handlery zarejestrowane
    // tu (NIE w src/ui/EventLog.js, który jest dead-file w runtime).
    EventBus.on('poi:alertTriggered', ({ poiName, vesselName, empireId }) => {
      this._log(t('eventLog.poi.picketAlert',
        poiName ?? '?', vesselName ?? '?', empireId ?? '?'), 'poi_alert');
    });
    EventBus.on('poi:rallyComplete', ({ poiName, memberCount }) => {
      this._log(t('eventLog.poi.rallyComplete',
        poiName ?? '?', memberCount ?? 0), 'poi_rally');
    });

    // ── M4 P1 — UI notifications dla M1/M2a eventów ──────────────────────
    this._subscribeM4Notifications();
  }

  /**
   * M4 P1 — subskrypcje UI dla eventów combat/fleet/diplomacy/drift.
   * Gated przez FEATURES.m4Notifications (rollback toggle).
   * Anti-spam: proximityEnter używa _lastProximityLog Map z 10-year cooldown per parę.
   */
  _subscribeM4Notifications() {
    if (!GAME_CONFIG?.FEATURES?.m4Notifications) return;

    this._lastProximityLog = new Map();   // pairKey → gameYear
    this._PROXIMITY_LOG_COOLDOWN_YEARS = 10;

    // Ruch wrogiej floty (intel-gated — pełen szczegół tylko gdy contact level).
    // Bez gated info wciąż logujemy ogólny komunikat — bo gracz powinien wiedzieć.
    EventBus.on('empire:fleetMoved', ({ empireId, destSystemId, etaYear }) => {
      if (!empireId) return;
      const empire = window.KOSMOS?.empireRegistry?.get?.(empireId);
      const empName = empire?.namePL ?? empire?.name ?? empireId;
      const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      const eta = (typeof etaYear === 'number')
        ? Math.max(0, etaYear - gameYear).toFixed(1)
        : '?';
      // Auto-slow tylko gdy flota leci na home (kluczowa informacja dla gracza).
      if (destSystemId === 'sys_home') {
        this._triggerAutoSlowIfTime(t('log.autoSlowEnemyFleet'));
      }
      this._log(t('log.m4.enemyFleetMoving', empName, eta), 'intel');
    });

    // Materializacja wrogiej floty przy home — krytyczne, auto-slow + log.
    EventBus.on('empire:fleetMaterialized', ({ empireId, vesselIds }) => {
      const empire = window.KOSMOS?.empireRegistry?.get?.(empireId);
      const empName = empire?.namePL ?? empire?.name ?? empireId ?? '?';
      const count = Array.isArray(vesselIds) ? vesselIds.length : 0;
      this._triggerAutoSlowIfTime(t('log.autoSlowEnemyMaterialize'));
      this._log(t('log.m4.enemyFleetArrival', empName, count), 'combat');
    });

    // Sensor proximity contact (wróg <0.5 AU od naszego statku).
    // Anti-spam: cooldown per para 10 game-years.
    EventBus.on('vessel:proximityEnter', ({ vesselAId, vesselBId, distanceAU, sameFaction }) => {
      if (sameFaction) return;
      const vm = window.KOSMOS?.vesselManager;
      if (!vm) return;
      const vA = vm.getVessel?.(vesselAId);
      const vB = vm.getVessel?.(vesselBId);
      if (!vA || !vB) return;
      // Tylko gdy jedna ze stron to player vessel (nie loguj kontaktów empire↔empire).
      const isPlayerA = !vA.ownerEmpireId || vA.ownerEmpireId === 'player';
      const isPlayerB = !vB.ownerEmpireId || vB.ownerEmpireId === 'player';
      if (!isPlayerA && !isPlayerB) return;
      const enemy = isPlayerA ? vB : vA;
      const pairKey = vesselAId < vesselBId ? `${vesselAId}|${vesselBId}` : `${vesselBId}|${vesselAId}`;
      const now = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      const last = this._lastProximityLog.get(pairKey);
      if (last != null && (now - last) < this._PROXIMITY_LOG_COOLDOWN_YEARS) return;
      this._lastProximityLog.set(pairKey, now);
      this._log(t('log.m4.proximityContact',
        enemy.name ?? enemy.id ?? '?',
        (distanceAU ?? 0).toFixed(2)), 'intel');
    });

    // Bitwa rozpoczęta (DSCS) — auto-slow + log. Daje graczowi czas zobaczyć
    // CombatHUD i HP bary (hotfix M4 P3: combat per-tick lecial za szybko).
    EventBus.on('vessel:engaged', ({ sideA, sideB }) => {
      const playerInvolved = (sideA && sideA.length > 0) || (sideB && sideB.length > 0);
      if (!playerInvolved) return;
      this._triggerAutoSlowIfTime(t('log.autoSlowBattle'));
    });

    // M4 P3 polish — manualne wycofanie gracza z bitwy → log.
    EventBus.on('vessel:retreatIssued', ({ vesselId, targetName }) => {
      const vessel = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      this._log(t('log.m4.retreatIssued', vessel?.name ?? '?', targetName ?? '?'), 'combat');
    });

    // Bitwa zakończona — popup-like log, klasyfikuj wynik.
    EventBus.on('battle:resolved', ({ battleId, result }) => {
      if (!result) return;
      // Filtruj: tylko gdy player jest stroną.
      const isPlayerSide = (p) => p?.type === 'vessel_group' && p?.empireId === 'player';
      const playerA = isPlayerSide(result.participantA);
      const playerB = isPlayerSide(result.participantB);
      if (!playerA && !playerB) return;
      const playerSide = playerA ? 'A' : 'B';
      this._triggerAutoSlowIfTime(t('log.autoSlowBattle'));
      if (result.retreated) {
        const retreatedSide = result.retreated === playerSide ? 'gracz' : 'wróg';
        this._log(t('log.m4.battleResolvedRetreat', battleId ?? '?', retreatedSide), 'combat');
      } else if (result.winner === 'draw') {
        this._log(t('log.m4.battleResolvedDraw', battleId ?? '?'), 'combat');
      } else if (result.winner === playerSide) {
        this._log(t('log.m4.battleResolvedVictory', battleId ?? '?'), 'combat');
      } else {
        this._log(t('log.m4.battleResolvedDefeat', battleId ?? '?'), 'combat');
      }
    });

    // Wycofanie nieudane (brak friendly planety + retry też failed).
    EventBus.on('vessel:autoRetreatFailed', ({ vesselId, reason }) => {
      const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      this._log(t('log.m4.autoRetreatFailed',
        v?.name ?? vesselId ?? '?', reason ?? 'unknown'), 'combat');
    });

    // Wycofanie awaryjne na resztkach paliwa (low_fuel_drift).
    EventBus.on('vessel:autoRetreatLowFuel', ({ vesselId, destinationPlanetId }) => {
      const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      const planet = window.KOSMOS?.entityManager?.get?.(destinationPlanetId);
      this._log(t('log.m4.autoRetreatLowFuel',
        v?.name ?? vesselId ?? '?',
        planet?.name ?? destinationPlanetId ?? '?'), 'combat');
    });

    // Drift idle po pursue/intercept na vessel target.
    EventBus.on('vessel:driftIdle', ({ vesselId }) => {
      const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      this._log(t('log.m4.driftIdle', v?.name ?? vesselId ?? '?'), 'fleet');
    });

    // Auto-return po driftcie (5y timer expired).
    EventBus.on('vessel:driftAutoReturn', ({ vesselId, destinationPlanetId }) => {
      const v = window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
      const planet = window.KOSMOS?.entityManager?.get?.(destinationPlanetId);
      this._log(t('log.m4.driftAutoReturn',
        v?.name ?? vesselId ?? '?',
        planet?.name ?? destinationPlanetId ?? '?'), 'fleet');
    });

    // Deklaracja wojny (gracz vs obcy).
    EventBus.on('diplomacy:warDeclared', ({ empireId, declaredBy }) => {
      const empire = window.KOSMOS?.empireRegistry?.get?.(empireId ?? declaredBy);
      const empName = empire?.namePL ?? empire?.name ?? empireId ?? declaredBy ?? '?';
      this._triggerAutoSlowIfTime(t('log.autoSlowWar'));
      this._log(t('log.m4.warDeclared', empName), 'diplomacy');
    });

    // S3.4 — log dyplomacji: AI envoy, emisariusz gracza, odpowiedź na traktat.
    const _empName = (empireId) => {
      const emp = window.KOSMOS?.empireRegistry?.get?.(empireId);
      return emp?.namePL ?? emp?.name ?? empireId ?? '?';
    };
    EventBus.on('diplomacy:aiEnvoy',        ({ empireId }) => {
      const nm = _empName(empireId);
      this._log(t('log.diplo.aiEnvoy', nm), 'diplomacy');
      EventBus.emit('ui:toast', { text: t('log.diplo.aiEnvoy', nm), color: '#50B0A0' });   // BUG6 — widoczny toast
    });
    EventBus.on('diplomacy:envoyArrived',   ({ empireId }) => this._log(t('log.diplo.envoyArrived', _empName(empireId)), 'diplomacy'));
    EventBus.on('diplomacy:envoyReturned',  ({ empireId }) => this._log(t('log.diplo.envoyReturned', _empName(empireId)), 'diplomacy'));
    EventBus.on('diplomacy:treatyAccepted', ({ empireId }) => this._log(t('log.diplo.treatyAccepted', _empName(empireId)), 'diplomacy'));
    EventBus.on('diplomacy:treatyRejected', ({ empireId, reason }) => {
      if (reason === 'already_signed') return;
      this._log(t('log.diplo.treatyRejected', _empName(empireId)), 'diplomacy');
    });

    // M4 P1.5 — vessel:firstSighting subskrypcja USUNIĘTA po playtest #4.
    // ObservatorySystem._tickVesselDetection już samodzielnie pushuje "🔭 Wykryto
    // wrogą jednostkę" do EventLogSystem (linie 313-321) + emit firstSighting
    // dla popup w GameScene:1324. Dodawanie kolejnego log entry = duplikat.
    // i18n key log.m4.firstSighting zachowany — może być reużyty w przyszłym
    // milestone jeśli Observatory zmieni format.
  }

  /**
   * M4 P1 — bezpieczne wywołanie TimeSystem._triggerAutoSlow z reason.
   */
  _triggerAutoSlowIfTime(reason) {
    const ts = window.KOSMOS?.timeSystem;
    if (ts?._triggerAutoSlow) {
      try { ts._triggerAutoSlow(reason); } catch (e) { /* defensive */ }
    }
  }

  _log(text, type = 'info', entityRef = null) {
    this._dirty = true;
    // Opcja B: jedyne źródło prawdy to EventLogSystem. Stare wywołania
    // z `type` (collision_absorb, civ_famine itd.) mapują się przez pushLegacy
    // na {channel, severity}. Kolor wpisu czytany jest w BottomBar z LOG_COLORS
    // — zachowane dla wizualnej ciągłości.
    // v57: entityRef (np. planetId) pozwala overlay'owi zrobić klikalny wpis
    // → fokus/otwarcie kolonii.
    const logSys = window.KOSMOS?.eventLogSystem;
    if (logSys) {
      logSys.pushLegacy(text, type, entityRef);
    } else {
      // Fallback (pre-init): dawne _logEntries jako bufor przejściowy.
      this._logEntries.unshift({ year: this._logYear, text, color: LOG_COLORS[type] || C.text, type, entityRef });
      if (this._logEntries.length > 8) this._logEntries.length = 8;
    }
  }

  addInfo(text) { this._log(text, 'info'); }

  /** Wymuszaj przerysowanie UI w następnej klatce */
  markDirty() { this._dirty = true; }

  /** Invaliduj cache kolonii + wymuszaj przerysowanie */
  invalidateColonies() { this._coloniesDirty = true; this._dirty = true; }

  /**
   * Opcja B: powiadomienia idą do dziennika zamiast do toasta.
   * Wszystkie historyczne wywołania zachowane — channel='system' to bezpieczny default.
   * Nowe callsite'y powinny podać channel+severity (np. fleet/warn dla porażki budowy).
   */
  _addNotification(text, channel = 'system', severity = 'info') {
    this._dirty = true;
    const logSys = window.KOSMOS?.eventLogSystem;
    if (logSys) logSys.push({ text, channel, severity });
  }

  _flashResource(resource) {
    this._log(t('log.resourceShortage', resource), 'civ_famine');
  }

  // ══════════════════════════════════════════════════════════════
  // isOverUI — blokada kamery gdy kursor nad UI
  // ══════════════════════════════════════════════════════════════
  isOverUI(rawX, rawY) {
    const x = rawX / UI_SCALE;
    const y = rawY / UI_SCALE;

    // Game Over / Dialog potwierdzenia — blokują cały ekran
    if (this._gameOverData) return true;
    if (this._confirmDialog?.visible) return true;

    // TopBar (zawsze widoczny)
    if (this._topBar.isOver(x, y)) return true;

    // BottomBar (zawsze widoczny) + panel menu
    if (this._bottomBar.isOver(x, y, W, H)) return true;

    // Outliner (prawy panel — tylko civMode)
    if (window.KOSMOS?.civMode && this._outliner.isOver(x, y, W, H)) return true;

    // Górny pasek surowców — trigger/rozwinięty panel (tylko civMode)
    if (window.KOSMOS?.civMode && this._topResourceDrawer?.isOver?.(x, y)) return true;

    // Dolny pasek nawigacji (stały) — blok kamery (tylko civMode)
    if (window.KOSMOS?.civMode && this._bottomNavBar?.isOver?.(x, y)) return true;

    // Dziennik (dolny hover-drawer) — trigger/rozwinięty panel (tylko civMode)
    if (window.KOSMOS?.civMode && this._eventLogDrawer?.isOver?.(x, y)) return true;

    // BottomContext (dolny panel kontekstowy — gdy encja zaznaczona)
    if (this._bottomContext.isOver(x, y, W, H, this._selectedEntity)) return true;

    // Overlay otwarty — blokuj kamerę
    if (this.overlayManager?.isAnyOpen()) return true;

    // CivPanel sidebar — pełna wysokość (zawsze widoczny gdy civMode)
    if (window.KOSMOS?.civMode) {
      const sidebarFullH = H - CIV_PANEL_Y - COSMIC.BOTTOM_BAR_H;
      if (x <= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + sidebarFullH) return true;
    }

    // Akcje gracza (lewy panel gdy nie civMode)
    if (!window.KOSMOS?.civMode) {
      const PW2 = 220, PAD = 10, BTN_H2 = 36, BTN_G = 6;
      const PH2 = PAD + 16 + 3 * (BTN_H2 + BTN_G) + PAD;
      const PX2 = W - COSMIC.OUTLINER_W - PW2 - 12;
      const PY2 = H - PH2 - COSMIC.BOTTOM_BAR_H - 8;
      if (x >= PX2 && x <= PX2 + PW2 && y >= PY2 && y <= PY2 + PH2) return true;
    }

    return false;
  }

  // ══════════════════════════════════════════════════════════════
  // handleClick
  // ══════════════════════════════════════════════════════════════
  handleClick(x, y) {
    this._dirty = true;
    x /= UI_SCALE; y /= UI_SCALE;

    // Game Over — klik na przycisk "Nowa Gra"
    if (this._gameOverData) {
      return this._hitTestGameOver(x, y);
    }

    // Dialog potwierdzenia
    if (this._confirmDialog?.visible) {
      return this._hitTestConfirm(x, y);
    }

    // CombatHUD minimize button — rysowany na wierzchu overlay'ów, więc klik
    // musi mieć priorytet PRZED overlayManager (inaczej overlay łapie najpierw).
    if (this.combatHud?.handleClick?.(x, y)) return true;
    if (this.stationPanel?.handleClick?.(x, y)) return true;   // S4-2 — panel info stacji (na wierzchu, PRZED overlayManager)
    if (window.KOSMOS?.civMode && this._bottomNavBar?.handleClick?.(x, y)) return true;   // UI v3 — dolny pasek nawigacji (PRZED overlayManager)
    if (window.KOSMOS?.civMode && this._outliner?.hitTest?.(x, y, W, H)) return true;   // Slice C — prawy Outliner drawer/dok (trigger/panel PRZED overlayManager)
    if (window.KOSMOS?.civMode && this._topResourceDrawer?.handleClick?.(x, y)) return true;   // górny pasek surowców — klik kolonii→panel, reszta pochłaniana (PRZED overlayManager)
    if (window.KOSMOS?.civMode && this._eventLogDrawer?.handleClick?.(x, y)) return true;   // dziennik (dolny hover-drawer) — klik → pełny overlay eventLog (PRZED overlayManager)

    // Panel MENU — DOM overlay nad canvasami, priorytet nad overlayami
    if (this._bottomBar.menuOpen && this._bottomBar.hitTestMenu(x, y, W, H)) {
      return true;
    }

    // Klaster prawego górnego rogu (bell 🔔 / MENU / chip walk) — priorytet nad overlayami
    // (dostępny zawsze; przeniesiony z dolnego paska obok chipa czasu).
    if (this._bottomBar._hitTestTopButtons?.(x, y)) return true;

    // Slice 4 — nawigacja w TopBarze (poziomy pasek); klik obsługuje topBar.hitTest niżej.

    // Overlay pełnoekranowy (FleetManager itp.) — przed resztą UI
    if (this.overlayManager.isAnyOpen()) {
      // Subnav (rodzeństwo grupy) — pas pod TopBarem, priorytet nad overlayem.
      // Klik zakładki → przełącz overlay; klik w tło pasa → absorbuj (nie spadaj na overlay).
      const sub = hitTestSubNav(x, y, W, this.overlayManager.active);
      if (sub) {
        if (sub.id && sub.id !== this.overlayManager.active) this.overlayManager.openPanel(sub.id);
        return true;
      }
      if (this.overlayManager.handleClick(x, y)) return true;
    }

    // TopBar (nawigacja + czas)
    if (this._topBar.hitTest(x, y, W)) {
      // Klik w TopBar poza otwartym menu — zamknij menu
      if (this._bottomBar.menuOpen) this._bottomBar._menuOpen = false;
      return true;
    }

    // BottomBar (stabilność + EventLog + menu)
    if (this._bottomBar.hitTest(x, y, W, H, this._audioEnabled, this._musicEnabled, this._timeState.autoSlow)) return true;

    // Outliner — Slice C: hitTest przeniesiony WYŻEJ (przed overlayManager), żeby trigger/
    // panel prawego drawera miał priorytet nad pełnoekranowym overlayem.

    // BottomContext (dolny panel kontekstowy)
    if (this._selectedEntity && this._bottomContext.hitTest(x, y, W, H, this._selectedEntity)) return true;

    // Akcje gracza
    if (this._hitTestActionPanel(x, y)) return true;

    return false;
  }

  // Pobierz WSZYSTKIE statki należące do kolonii (docked + in_transit + orbiting)
  _getAllVesselsForColony(planetId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return [];
    const ids = [];
    for (const v of vMgr.getAllVessels()) {
      if (v.colonyId === planetId) ids.push(v.id);
    }
    return ids;
  }

  // Wszystkie statki gracza — niezależne od aktywnej kolonii (do outlinera)
  _getAllPlayerVessels() {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return [];
    // Outliner pokazuje tylko statki gracza — wrogi vessel dostaje się do
    // FleetManagerOverlay (sekcja WROGIE JEDNOSTKI), nie tutaj.
    return vMgr.getAllVessels()
      .filter(v => !isEnemyVessel(v))
      .map(v => v.id);
  }

  // Obsługa scrolla
  handleWheel(rawX, rawY, deltaY) {
    this._dirty = true;
    const x = rawX / UI_SCALE;
    const y = rawY / UI_SCALE;
    const delta = deltaY * 0.6; // globalna redukcja czułości scrolla o 40%
    // Górny pasek surowców — scroll listy kolonii (gdy kursor nad rozwiniętym panelem).
    if (window.KOSMOS?.civMode && this._topResourceDrawer?.handleWheel?.(x, y, delta)) return true;
    // Overlay pełnoekranowy — scroll
    if (this.overlayManager.isAnyOpen()) {
      if (this.overlayManager.handleScroll(delta, x, y)) return true;
    }
    // BottomContext scroll
    if (this._selectedEntity) {
      if (this._bottomContext.handleWheel(x, y, delta, W, H, this._selectedEntity)) return true;
    }
    return false;
  }

  handleMouseDown(rawX, rawY, button = 0) {
    this._dirty = true;
    const x = rawX / UI_SCALE;
    const y = rawY / UI_SCALE;
    if (this.overlayManager.isAnyOpen()) { this.overlayManager.handleMouseDown(x, y, button); return; }
  }

  handleMouseUp(rawX, rawY, button = 0) {
    this._dirty = true;
    const x = rawX / UI_SCALE;
    const y = rawY / UI_SCALE;
    if (this.overlayManager.isAnyOpen()) { this.overlayManager.handleMouseUp(x, y, button); return; }
  }

  // M3 P1.5 — wystawiamy konwersję clientX/Y → ui-canvas local px (post-UI_SCALE)
  // żeby GameScene.tooltip hover dispatch mógł wywołać FleetOverlay.resolveHoverInfo
  // bez duplikowania UI_SCALE math.
  toLocalUI(rawX, rawY) {
    return { x: rawX / UI_SCALE, y: rawY / UI_SCALE };
  }

  handleMouseMove(x, y) {
    this._dirty = true;
    x /= UI_SCALE; y /= UI_SCALE;
    this._tooltipMouseX = x;
    this._tooltipMouseY = y;
    // Overlay pełnoekranowy — hover
    if (this.overlayManager.isAnyOpen()) {
      this.overlayManager.handleMouseMove(x, y);
    }
    if (this.stationPanel?.visible) this.stationPanel.handleMouseMove(x, y);   // S4-2 — hover przycisków panelu
    if (window.KOSMOS?.civMode) this._bottomNavBar.handleMouseMove(x, y);   // UI v3 — hover slotów dolnego paska nawigacji
    if (window.KOSMOS?.civMode) this._topResourceDrawer.handleMouseMove(x, y); // górny pasek surowców — hover triggera/panelu + tooltipy
    if (window.KOSMOS?.civMode) this._eventLogDrawer.handleMouseMove(x, y); // dziennik (dolny hover-drawer) — hover triggera/panelu
    // Hover w panelu menu
    this._bottomBar.handleMouseMove(x, y, W, H);
    const prev = this._hoveredBtn;
    this._hoveredBtn = this._detectHoverBtn(x, y);
    if (this._hoveredBtn !== prev) {
      const layer = document.getElementById('event-layer');
      if (layer) layer.style.cursor = this._hoveredBtn ? 'pointer' : 'default';
    }
    // Detekcja tooltipa CivPanel
    this._tooltip = this._detectCivPanelTooltip(x, y);
    // TopBar hover (tooltip zasobów)
    this._topBar.updateHover(x, y);
    // Outliner hover (tooltip kolonii)
    if (this._outliner) this._outliner.updateHover(x, y, W, H);
  }

  // ══════════════════════════════════════════════════════════════
  // Pętla rysowania
  // ══════════════════════════════════════════════════════════════
  _startDrawLoop() {
    const draw = () => {
      requestAnimationFrame(draw);
      const now = performance.now();
      // Gdy gra biega (nie pauza) — min ~10fps dla odświeżenia zegara
      const timeDirty = !this._timeState.isPaused
        && (now - this._lastDrawTime > 100);
      if (this._dirty || this._animating || timeDirty) {
        this._dirty = false;
        this._lastDrawTime = now;
        this._draw();
      }
    };
    draw();
  }

  _draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(UI_SCALE, 0, 0, UI_SCALE, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const civMode = !!window.KOSMOS?.civMode;
    const globeOpen = !!window.KOSMOS?.planetGlobeOpen;

    // ── TopBar (zasoby + czas) ───────────────────────────────
    if (civMode) {
      this._topBar.draw(ctx, W, H, {
        inventory: this._inventory,
        invPerYear: this._invPerYear,
        energyFlow: this._energyFlow,
        resources: this._resources,
        resDelta: this._resDelta,
        timeState: this._timeState,
        factoryData: this._factoryData,
      });
    } else {
      // W trybie Generator — prosty TopBar z logo + czas
      this._drawSimpleTopBar(ctx);
    }

    // ── CivPanel sidebar USUNIĘTY (Slice 4 — nawigacja w TopBarze, poziomy pasek) ──

    // ── Outliner (prawy panel) ───────────────────────────────
    if (civMode && !globeOpen) {
      const colMgr = window.KOSMOS?.colonyManager;
      const activePid = colMgr?.activePlanetId;
      // Cache getAllColonies() — invalidowany przez eventy koloni
      if (this._coloniesDirty) {
        this._cachedColonies = colMgr?.getAllColonies() ?? [];
        this._coloniesDirty = false;
      }
      // Outliner pokazuje tylko kolonie gracza. Wrogie kolonie (ownerEmpireId
       // !== 'player') są widoczne na mapie przez detekcję statków / Intel,
       // nie w liście Kolonie.
      const allColonies = this._cachedColonies.filter(c =>
        !c?.ownerEmpireId || c.ownerEmpireId === 'player'
      );
      // Filtruj ekspedycje po aktywnej kolonii (spójność z AKTYWNE MISJE)
      const vMgrOut = window.KOSMOS?.vesselManager;
      const outlinerExps = this._expeditions.filter(exp => {
        if (!exp.vesselId || !vMgrOut) return false;
        const v = vMgrOut.getVessel(exp.vesselId);
        return v && v.colonyId === activePid;
      });
      // Zbierz jednostki naziemne ze wszystkich kolonii.
      // Outliner pokazuje tylko WŁASNE, ŻYWE jednostki — wrogów widać na mapie,
      // ale nie chcemy ich na liście gracza (zabite pozostawałyby widoczne).
      const guMgr = window.KOSMOS?.groundUnitManager;
      const groundUnits = [];
      if (guMgr) {
        for (const col of allColonies) {
          const units = guMgr.getUnitsOnPlanet(col.planetId);
          for (const u of units) {
            if (u.owner && u.owner !== 'player') continue;  // ukryj wrogów
            if ((u.hp ?? 0) <= 0) continue;                 // ukryj martwych (defensywa)
            groundUnits.push({ ...u, planetName: col.name });
          }
        }
      }
      // Zbierz dane kolejek aktywnej kolonii
      let constructionQueue = [], pendingBuilds = [], pendingShipOrders = [];
      let pendingOutpostOrders = [], factoryQueue = [], factoryAllocations = [];
      try {
        const activeCol = colMgr?.getColony(activePid);
        constructionQueue    = activeCol?.buildingSystem?.serializeQueue() ?? [];
        pendingBuilds        = activeCol?.buildingSystem?.serializePendingQueue() ?? [];
        pendingShipOrders    = colMgr?.getPendingShipOrders(activePid) ?? [];
        pendingOutpostOrders = colMgr?.getPendingOutpostOrders(activePid) ?? [];
        factoryQueue         = activeCol?.factorySystem?.getQueue() ?? [];
        factoryAllocations   = activeCol?.factorySystem?.getAllocations() ?? [];
      } catch (_) { /* defensywne — nie blokuj renderingu */ }
      // Slice C — nie rysujemy tu: zbieramy stan i rysujemy PO overlayu (prawy drawer
      // musi być na wierzchu pełnoekranowego overlayu). Gdy brak overlaya → dok.
      this._outlinerState = {
        colonies: allColonies,
        expeditions: outlinerExps,
        fleet: this._getAllPlayerVessels(),
        shipQueues: colMgr?.getShipQueues(activePid) ?? [],
        groundUnits,
        constructionQueue, pendingBuilds, pendingShipOrders,
        pendingOutpostOrders, factoryQueue, factoryAllocations,
        inventory: colMgr?.getColony(activePid)?.resourceSystem?.inventorySnapshot() ?? {},
      };
    } else {
      this._outlinerState = null;   // poza civMode / w globe — brak danych Outlinera
    }

    // ── BottomContext (dolny panel info o encji) ──────────────
    // Ukryj gdy aktywny overlay (Ekonomia, Flota itp.) — przeszkadza
    if (!globeOpen && !this.overlayManager.isAnyOpen()) {
      this._bottomContext.draw(ctx, W, H, this._selectedEntity);
    }

    // ── (Slice 4 — sidebar usunięty, brak przerysowania nad BottomContext) ──

    // ── BottomBar (stabilność + EventLog + przyciski) ────────
    this._bottomBar.draw(ctx, W, H, {
      stability: this._stability,
      // Opcja B: BottomBar sam czyta z EventLogSystem (filtry per-kanał)
      logSystem: window.KOSMOS?.eventLogSystem ?? null,
      // Fallback pre-init: stara tablica (wyłącznie zanim GameScene zainicjuje system)
      logEntriesFallback: this._logEntries,
      audioEnabled: this._audioEnabled,
      musicEnabled: this._musicEnabled,
      autoSlow: this._timeState.autoSlow,
      civMode,
    });

    // ── Overlay pełnoekranowy (FleetManager itp.) ────────────
    if (civMode && !globeOpen) this.overlayManager.draw(ctx, W, H);
    // Subnav (rodzeństwo grupy) — PO overlayu, w pasie pod TopBarem (no-op dla singletonów)
    if (civMode && !globeOpen && this.overlayManager.active) drawSubNav(ctx, W, this.overlayManager.active);
    // ── Górny pasek surowców (wysuwany) — PO overlayManager (nad overlay'em), ale PRZED
    //    NavDrawer/Outliner/HUD: gdy nakładają się rogami, te malują się na wierzchu. ──
    if (civMode && !globeOpen) this._topResourceDrawer.draw(ctx, W, H);
    // ── BottomNavBar (stały dolny pasek nawigacji, 7 grup) — UI v3. PO overlayManager (na
    //    wierzchu canvasowych overlay'i), PRZED dziennikiem (ten może go zakryć na hoverze). ──
    if (civMode && !globeOpen) this._bottomNavBar.draw(ctx, W, H);
    // ── Outliner — Slice B+C: ZAWSZE prawy WYSUWANY drawer w civMode (hover prawej
    //    krawędzi → wysuwa; brak hovera → chowa), niezależnie od tego czy overlay jest
    //    otwarty. Rysowany PO overlayu (na wierzchu). ──
    if (civMode && !globeOpen && this._outlinerState) {
      this._outliner._drawerMode = true;
      this._outliner.draw(ctx, W, H, this._outlinerState);
    }
    // ── M4 P3 — CombatHUD always-on (rysowany NA WIERZCHU overlay'i,
    //    samo-filtrujący by active encounters). Tylko w civMode.
    if (civMode && !globeOpen) this.combatHud.draw(ctx, W, H);
    if (civMode && !globeOpen) this.stationPanel.draw(ctx, W, H);   // S4-2 — na wierzchu overlay'i (coexist z colony)
    if (civMode && !globeOpen) this._eventLogDrawer.draw(ctx, W, H);   // dziennik — hover-drawer dolnej krawędzi (nad overlay'em, nad paskiem bell/MENU)

    // ── Panel MENU — rysowany PO overlayach (na wierzchu) ──
    this._bottomBar.drawMenu(ctx, W, H, {
      audioEnabled: this._audioEnabled,
      musicEnabled: this._musicEnabled,
    });

    // ── Panel akcji gracza (tylko tryb Generator) ────────────
    if (!civMode && window.KOSMOS?.scenario === 'generator') this._drawActionPanel();

    // ── Powiadomienia (Opcja B): toast usunięty, wszystko w BottomBar EventLog ─

    // ── Tooltip TopBar (na wierzchu) ─────────────────────────
    if (civMode) this._topBar.drawTooltip(ctx, W, UI_SCALE);

    // ── Tooltip kolonii (Outliner) — na wierzchu (pomijaj gdy DOM overlay je zasłania)
    if (civMode && this._outliner && !this.overlayManager.isAnyOpen()) this._outliner.drawTooltip(ctx);

    // ── Tooltip CivPanel ─────────────────────────────────────
    if (this._tooltip) this._drawTooltip();

    // ── Tooltip górnego paska surowców (na samym wierzchu) ────────
    if (civMode && !globeOpen) this._topResourceDrawer.drawTooltip(ctx, W, H);

    // ── CTRL-hold: labele wszystkich obiektów w scenie 3D ──
    const tr = window.KOSMOS?.threeRenderer;
    if (tr?._showAllLabels) this._drawAllLabels(ctx, tr);

    // ── Dialog potwierdzenia ─────────────────────────────────
    if (this._confirmDialog?.visible) this._drawConfirmDialog();

    // ── Game Over ─────────────────────────────────────────────
    if (this._gameOverData) this._drawGameOver();

    // ── Aktualizuj flagę animacji — kontynuuj redraw przy flash nowego wpisu/Game Over ──
    const logSys = window.KOSMOS?.eventLogSystem;
    const latest = logSys?.getLatest();
    const flashActive = latest && (Date.now() - latest.createdAt) < 3000;
    // Hover-drawery (slide/hide-timer) wymagają ciągłego redrawu (pętla rysuje tylko gdy
    // _dirty || _animating || timeDirty — inaczej slide zamarza przy pauzie). BottomNavBar
    // jest stały (bez animacji) → nie wpinamy go tutaj.
    this._animating = flashActive || !!this._gameOverData
      || (this._topResourceDrawer?.isAnimating?.() ?? false)
      || (this._eventLogDrawer?.isAnimating?.() ?? false)
      || (this._outliner?.isAnimating?.() ?? false);

    ctx.restore();
  }

  // ── Prosty TopBar dla trybu Generator (logo + faza + czas) ──
  _drawSimpleTopBar(ctx) {
    ctx.fillStyle = bgAlpha(0.45);
    ctx.fillRect(0, 0, W, COSMIC.TOP_BAR_H);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, COSMIC.TOP_BAR_H); ctx.lineTo(W, COSMIC.TOP_BAR_H); ctx.stroke();

    // Logo
    ctx.font = `bold ${THEME.fontSizeTitle}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.textAlign = 'left';
    ctx.fillText('K O S M O S', 14, 20);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText(t('title.subtitle'), 14, 34);

    // Czas (prawa strona) — prosta wersja
    const { isPaused, multiplierIndex, displayText } = this._timeState;
    const LABELS = GAME_CONFIG.TIME_MULTIPLIER_LABELS;

    ctx.font = `${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = isPaused ? C.title : C.text;
    ctx.textAlign = 'center';
    ctx.fillText(isPaused ? t('ui.play') : t('ui.pause'), W - 220, 20);

    LABELS.slice(1).forEach((label, i) => {
      const bx = W - 175 + i * 29;
      const isActive = !isPaused && multiplierIndex === i + 1;
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = isActive ? C.title : C.text;
      ctx.fillText(label, bx, 20);
    });

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.bright;
    ctx.textAlign = 'right';
    ctx.fillText(displayText, W - 8, 38);
    ctx.textAlign = 'left';
  }

  // ══════════════════════════════════════════════════════════════
  // CivPanel — panel informacyjny cywilizacji
  // ══════════════════════════════════════════════════════════════
  _drawCivPanel() {
    const ctx = this.ctx;
    // Sidebar — aktywny przycisk = aktywny overlay
    const sidebarFullH = H - CIV_PANEL_Y - COSMIC.BOTTOM_BAR_H;
    drawCivPanelSidebar(ctx, CIV_PANEL_Y, this.overlayManager.active, sidebarFullH);
  }

  // ══════════════════════════════════════════════════════════════
  // ActionPanel (akcje gracza — tylko tryb Generator)
  // ══════════════════════════════════════════════════════════════
  _drawActionPanel() {
    if (window.KOSMOS?.civMode) return;
    const ctx    = this.ctx;
    const PW     = 220;
    const BTN_H  = 36;
    const BTN_G  = 6;
    const PAD    = 10;
    const PH     = PAD + 16 + 3 * (BTN_H + BTN_G) + PAD;
    const PX     = W - COSMIC.OUTLINER_W - PW - 12;
    const PY     = H - PH - COSMIC.BOTTOM_BAR_H - 8;

    this._roundRect(ctx, PX, PY, PW, PH, 3, THEME.bgPrimary, 0.88, C.border);

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText('AKCJE GRACZA', PX + PAD, PY + 14);

    // Pasek energii
    const E_Y  = PY + PAD + 16;
    const E_W  = PW - PAD * 2;
    const frac = this._energyMax > 0 ? this._energy / this._energyMax : 0;
    ctx.fillStyle = THEME.bgTertiary;
    ctx.fillRect(PX + PAD, E_Y, E_W, 6);
    ctx.fillStyle = frac > 0.5 ? THEME.info : frac > 0.2 ? THEME.yellow : THEME.dangerDim;
    ctx.fillRect(PX + PAD, E_Y, Math.round(E_W * frac), 6);
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.strokeRect(PX + PAD, E_Y, E_W, 6);

    const actions = [
      { id: 'stabilize', label: '[Q] STABILIZUJ',  cost: ACTION_COSTS.stabilize,  color: THEME.info },
      { id: 'nudgeToHz', label: '[W] PCHNIJ → HZ', cost: ACTION_COSTS.nudgeToHz,  color: THEME.accent },
      { id: 'bombard',   label: '[E] BOMBARDUJ',   cost: ACTION_COSTS.bombard,     color: THEME.warning },
    ];

    const hasTarget = !!this._selectedEntity;
    actions.forEach((act, i) => {
      const bx = PX + PAD;
      const by = PY + PAD + 16 + 10 + i * (BTN_H + BTN_G);
      const bw = PW - PAD * 2;
      const canUse = hasTarget && this._energy >= act.cost;
      ctx.fillStyle = canUse ? THEME.bgSecondary : THEME.bgPrimary;
      ctx.fillRect(bx, by, bw, BTN_H);
      ctx.strokeStyle = canUse ? THEME.borderActive : THEME.border; ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, BTN_H);
      ctx.fillStyle = canUse ? act.color : THEME.textDim;
      ctx.fillRect(bx, by, 2, BTN_H);
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = canUse ? act.color : C.label;
      ctx.fillText(act.label, bx + 8, by + 14);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.label;
      ctx.fillText(`Koszt: ${act.cost} en.`, bx + 8, by + 26);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // Powiadomienia
  // ══════════════════════════════════════════════════════════════
  _drawNotifications() {
    const ctx = this.ctx;
    const now = Date.now();
    this._notifications = this._notifications.filter(n => n.endTime > now);
    this._notifications.forEach((n, i) => {
      const remaining = n.endTime - now;
      n.alpha = Math.min(1.0, remaining / 600);
      ctx.globalAlpha = n.alpha;
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.title;
      ctx.textAlign = 'right';
      ctx.fillText(n.text, W - COSMIC.OUTLINER_W - 14, COSMIC.TOP_BAR_H + 16 + i * 14);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1.0;
    });
  }

  // ══════════════════════════════════════════════════════════════
  // Dialog potwierdzenia
  // ══════════════════════════════════════════════════════════════
  // CTRL-hold: subtelne etykiety obok każdego obiektu w scenie 3D.
  // Minimalistyczne — delikatny tekst bez ramek, lekka poświata zamiast stroke,
  // rozjaśnia tylko gdy user trzyma CTRL (nie zakłóca normalnego widoku).
  _drawAllLabels(ctx, tr) {
    const labels = tr.getAllVisibleLabels?.();
    if (!labels?.length) return;
    ctx.save();
    ctx.font = `10px ${THEME.fontFamily}`;
    ctx.textBaseline = 'middle';
    for (const lbl of labels) {
      const name = lbl.name ?? '?';
      const sx = lbl.x / UI_SCALE;
      const sy = lbl.y / UI_SCALE;
      if (sx < 0 || sx > W || sy < 0 || sy > H) continue;

      // Subtelny shadow — poprawia czytelność bez ciężkich ramek
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(name, sx + 9, sy + 1);
      // Główny text — pastel (rozjaśniony) żeby nie krzyczał
      ctx.fillStyle = lbl.color ? this._softenColor(lbl.color) : 'rgba(160,220,200,0.85)';
      ctx.fillText(name, sx + 8, sy);
      // Bardzo mała kropka (jedynie lokalizator)
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = lbl.color ? this._softenColor(lbl.color, 0.7) : 'rgba(160,220,200,0.7)';
      ctx.fill();
    }
    ctx.restore();
  }

  // Zmiękcz kolor dla delikatnego tekstu — alpha 0.85 + lekko rozjaśniony.
  _softenColor(hex, alpha = 0.85) {
    if (!hex || hex[0] !== '#') return `rgba(180,220,200,${alpha})`;
    const h = hex.slice(1);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // Wyblakły: miks z 180,180,180 w stosunku 60/40 — zachowuje ton ale ciszej
    const mix = (c) => Math.round(c * 0.6 + 180 * 0.4);
    return `rgba(${mix(r)},${mix(g)},${mix(b)},${alpha})`;
  }

  _drawConfirmDialog() {
    const ctx = this.ctx;
    const DW  = 300, DH  = 90;
    const DX  = W / 2 - DW / 2, DY  = H / 2 - DH / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    this._roundRect(ctx, DX, DY, DW, DH, 4, THEME.bgSecondary, 1.0, THEME.borderActive);

    ctx.font = `${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.bright; ctx.textAlign = 'center';
    ctx.fillText(t('dialog.newGameConfirm'), W / 2, DY + 22);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.text;
    ctx.fillText(t('dialog.progressLost'), W / 2, DY + 40);
    ctx.font = `${THEME.fontSizeNormal + 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.red; ctx.fillText('[ TAK ]', W / 2 - 50, DY + 62);
    ctx.fillStyle = C.title; ctx.fillText('[ ANULUJ ]', W / 2 + 50, DY + 62);
    ctx.textAlign = 'left';
  }

  // ══════════════════════════════════════════════════════════════
  // Game Over — ekran końca gry
  // ══════════════════════════════════════════════════════════════
  _drawGameOver() {
    const ctx = this.ctx;
    const d = this._gameOverData;
    if (!d) return;

    // Pulsujące czerwone tło
    const pulse = 0.5 + 0.15 * Math.sin(Date.now() / 800);

    // Ciemny overlay
    ctx.fillStyle = `rgba(20,0,0,${pulse})`;
    ctx.fillRect(0, 0, W, H);

    // Ramka centralna
    const DW = 420, DH = 180;
    const DX = W / 2 - DW / 2, DY = H / 2 - DH / 2;

    ctx.fillStyle = 'rgba(5,2,2,0.95)';
    ctx.fillRect(DX, DY, DW, DH);
    ctx.strokeStyle = THEME.danger;
    ctx.lineWidth = 2;
    ctx.strokeRect(DX, DY, DW, DH);

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeTitle + 4}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.danger;
    ctx.textAlign = 'center';
    ctx.fillText(t('dialog.civDestroyed'), W / 2, DY + 36);

    // Opis
    let reasonKey = 'dialog.civDestroyedExtinction';
    if (d.reason === 'collision') reasonKey = 'dialog.civDestroyedCollision';
    else if (d.reason === 'ejected') reasonKey = 'dialog.civDestroyedEjected';
    else if (['extinction_impact','colony_destroyed','colony_disaster','expedition_disaster','starvation','exposure','population_extinct','epidemic'].includes(d.reason))
      reasonKey = 'dialog.civDestroyedPopulation';
    const reasonText = t(reasonKey, d.planetName);
    ctx.font = `${THEME.fontSizeNormal + 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(reasonText, W / 2, DY + 64);
    ctx.fillText(t('dialog.civDead'), W / 2, DY + 84);

    // Czas przetrwania
    const gameTime = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const years = Math.round(gameTime).toLocaleString('pl-PL');
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`Czas przetrwania: ${years} lat`, W / 2, DY + 108);

    // Przycisk NOWA GRA
    const btnW = 140, btnH = 28;
    const btnX = W / 2 - btnW / 2, btnY = DY + DH - 44;
    ctx.fillStyle = THEME.dangerDim;
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = THEME.danger;
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX, btnY, btnW, btnH);
    ctx.font = `bold ${THEME.fontSizeNormal + 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText('NOWA GRA', W / 2, btnY + 18);

    ctx.textAlign = 'left';
  }

  _hitTestGameOver(x, y) {
    if (!this._gameOverData) return false;
    // Przycisk NOWA GRA
    const DW = 420, DH = 180;
    const DY = H / 2 - DH / 2;
    const btnW = 140, btnH = 28;
    const btnX = W / 2 - btnW / 2, btnY = DY + DH - 44;
    if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
      this._gameOverData = null;
      EventBus.emit('game:new');
      return true;
    }
    // Blokuj kliknięcia poza przyciskiem — ekran jest modalny
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // Tooltip CivPanel
  // ══════════════════════════════════════════════════════════════
  _detectCivPanelTooltip(x, y) {
    if (!window.KOSMOS?.civMode) return null;

    // Sidebar ikona — tooltip z nazwą zakładki
    const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                   + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;
    if (x <= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + sidebarH) {
      for (let i = 0; i < CIV_TABS.length; i++) {
        const btnY = CIV_PANEL_Y + CIV_SIDEBAR_PAD + i * (CIV_SIDEBAR_BTN + CIV_SIDEBAR_GAP);
        if (y >= btnY && y <= btnY + CIV_SIDEBAR_BTN) {
          return { type: 'sidebar_tab', data: { label: `${t(CIV_TABS[i].labelKey)} (${CIV_TABS[i].key})` } };
        }
      }
    }
    return null;
  }

  _detectFactoryTooltip(x, y) {
    const allocs = this._factoryData?.allocations
      ?? window.KOSMOS?.factorySystem?.getAllocations?.() ?? [];
    for (const btn of (this._factoryBtns ?? [])) {
      // Tooltip-only rects (TOWARY kolumna) — ścisły hit test
      if (btn.isTooltipOnly) {
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          const def = COMMODITIES[btn.commodityId];
          if (def) return { type: 'commodity', data: { def } };
        }
        continue;
      }
      if (x >= btn.x - 120 && x <= btn.x + btn.w + 40 && y >= btn.y && y <= btn.y + btn.h + 4) {
        const def = COMMODITIES[btn.commodityId];
        if (!def) continue;
        const a = allocs.find(al => al.commodityId === btn.commodityId);
        // Alokowany towar → pełny tooltip z postępem
        if (a) return { type: 'factory', data: { alloc: a, def } };
        // Niealokowany (przycisk "Dodaj produkcję") → tooltip z nazwą i recepturą
        return { type: 'commodity', data: { def } };
      }
    }
    return null;
  }

  _drawTooltip() {
    const tt = this._tooltip;
    if (!tt) return;
    const ctx = this.ctx;
    let lines;
    if (tt.type === 'sidebar_tab') {
      lines = [{ type: 'header', text: tt.data.label, color: C.bright }];
    } else if (tt.type === 'building') {
      lines = this._buildBuildingTooltipLines(tt.data);
    } else if (tt.type === 'factory') {
      lines = this._buildFactoryTooltipLines(tt.data);
    } else if (tt.type === 'commodity') {
      lines = this._buildCommodityTooltipLines(tt.data);
    } else if (tt.type === 'catalogBody') {
      lines = this._buildCatalogBodyTooltipLines(tt.data);
    } else {
      lines = this._buildTechTooltipLines(tt.data);
    }
    if (lines.length === 0) return;

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    let maxTextW = 0, totalH = TOOLTIP_PAD * 2;
    for (const line of lines) {
      if (line.type === 'separator') { totalH += TOOLTIP_SEP_H; continue; }
      if (line.type === 'header') {
        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        maxTextW = Math.max(maxTextW, ctx.measureText(line.text).width);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        totalH += TOOLTIP_HDR_H;
      } else {
        maxTextW = Math.max(maxTextW, ctx.measureText(line.text).width + (line.indent ?? 0));
        totalH += TOOLTIP_LINE_H;
      }
    }
    const tw = Math.min(TOOLTIP_MAX_W, maxTextW + TOOLTIP_PAD * 2 + 4);
    const th = totalH;
    let tx = this._tooltipMouseX + TOOLTIP_OFS;
    let ty = this._tooltipMouseY + TOOLTIP_OFS;
    if (tx + tw > W - 4) tx = this._tooltipMouseX - tw - 4;
    if (ty + th > H - 4) ty = this._tooltipMouseY - th - 4;
    if (tx < 4) tx = 4; if (ty < 4) ty = 4;

    this._roundRect(ctx, tx, ty, tw, th, 4, THEME.bgPrimary, 0.94, THEME.borderActive);

    let cy = ty + TOOLTIP_PAD;
    for (const line of lines) {
      if (line.type === 'separator') {
        cy += 3; ctx.strokeStyle = THEME.border; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx + 6, cy); ctx.lineTo(tx + tw - 6, cy); ctx.stroke();
        cy += TOOLTIP_SEP_H - 3;
      } else if (line.type === 'header') {
        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.fillStyle = line.color ?? C.bright;
        ctx.fillText(line.text, tx + TOOLTIP_PAD, cy + 11); cy += TOOLTIP_HDR_H;
      } else {
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = line.color ?? C.text;
        ctx.fillText(line.text, tx + TOOLTIP_PAD + (line.indent ?? 0), cy + 10); cy += TOOLTIP_LINE_H;
      }
    }
  }

  _buildBuildingTooltipLines({ building, group }) {
    const lines = [];
    const b = building;
    const countStr = group.count > 1 ? ` ×${group.count}` : '';
    lines.push({ type: 'header', text: `${b.icon} ${b.namePL}${countStr}`, color: C.bright });
    lines.push({ type: 'separator' });
    if (b.description) { for (const wl of this._wrapText(b.description, TOOLTIP_WRAP)) lines.push({ type: 'line', text: wl }); lines.push({ type: 'separator' }); }
    const baseStr = formatRates(b.rates);
    if (baseStr) { lines.push({ type: 'line', text: 'Na instancję:', color: C.label }); lines.push({ type: 'line', text: `  ${baseStr}`, color: C.bright }); }
    if (group.count > 0) {
      lines.push({ type: 'line', text: `Razem (×${group.count}):`, color: C.label });
      for (const [key, val] of Object.entries(group.totalRates)) {
        if (Math.abs(val) < 0.01) continue;
        const icon = RESOURCE_ICONS[key] ?? key;
        const sign = val >= 0 ? '+' : '';
        const color = val >= 0 ? C.green : C.red;
        lines.push({ type: 'line', text: `  ${sign}${val.toFixed(1)} ${icon}/rok`, color, indent: 4 });
      }
    }
    lines.push({ type: 'separator' });
    const costStr = formatCost(b.cost, b.popCost, b.commodityCost);
    if (costStr) lines.push({ type: 'line', text: `Koszt: ${costStr}`, color: C.yellow });
    if (b.energyCost > 0) lines.push({ type: 'line', text: `⚡ Energia: -${b.energyCost}/r`, color: C.orange });
    if (b.housing > 0) lines.push({ type: 'line', text: `Mieszkania: +${b.housing} POPów`, color: C.green });
    if (b.capacityBonus) {
      const capParts = Object.entries(b.capacityBonus).map(([k, v]) => `+${v}${RESOURCE_ICONS[k] ?? k}`).join(' ');
      lines.push({ type: 'line', text: `Pojemność: ${capParts}`, color: C.blue });
    }
    if (b.requires) {
      const techName = TECHS[b.requires]?.namePL ?? b.requires;
      lines.push({ type: 'line', text: `Wymaga: ${techName}`, color: C.purple });
    }
    return lines;
  }

  _buildFactoryTooltipLines({ alloc, def }) {
    const lines = [];
    const name = def?.namePL ?? COMMODITY_SHORT[alloc.commodityId] ?? alloc.commodityId;
    lines.push({ type: 'header', text: `${def?.icon ?? '📦'} ${name}`, color: C.bright });
    lines.push({ type: 'separator' });
    if (def?.recipe) {
      const recipeStr = Object.entries(def.recipe).map(([r, q]) => {
        const comDef = COMMODITIES[r];
        const resDef = ALL_RESOURCES[r];
        const label = comDef ? (COMMODITY_SHORT[r] ?? comDef.namePL) : resDef ? resDef.namePL : r;
        return `${q}× ${label}`;
      }).join(' + ');
      lines.push({ text: `Receptura: ${recipeStr}`, color: C.text });
    }
    const pts = alloc.points ?? 1;
    const timePerUnit = (def?.baseTime ?? 6) / pts;
    lines.push({ text: `Czas: ${timePerUnit.toFixed(1)} lat/szt (${pts} pkt)`, color: C.text });
    if (alloc.paused) lines.push({ text: '⚠ Wstrzymana — brak surowców', color: C.red });
    else lines.push({ text: `Postęp: ${Math.round(alloc.pctComplete ?? 0)}%`, color: C.green });
    if (def?.description) { lines.push({ type: 'separator' }); lines.push({ text: def.description, color: C.dim }); }
    return lines;
  }

  _buildCommodityTooltipLines({ def }) {
    const lines = [];
    lines.push({ type: 'header', text: `${def?.icon ?? '📦'} ${def?.namePL ?? def?.id ?? '?'}`, color: C.bright });
    lines.push({ type: 'separator' });
    if (def?.recipe) {
      const recipeStr = Object.entries(def.recipe).map(([r, q]) => {
        // Rozwiń nazwy: Fe→Żelazo, electronics→Elektronika itp.
        const comDef = COMMODITIES[r];
        const resDef = ALL_RESOURCES[r];
        const label = comDef ? (COMMODITY_SHORT[r] ?? comDef.namePL)
          : resDef ? resDef.namePL : r;
        return `${q}× ${label}`;
      }).join(' + ');
      lines.push({ text: `Receptura: ${recipeStr}`, color: C.text });
    }
    if (def?.baseTime) {
      lines.push({ text: `Czas bazowy: ${def.baseTime} lat/szt`, color: C.text });
    }
    if (def?.weight) {
      lines.push({ text: `Waga: ${def.weight} t/szt`, color: C.text });
    }
    if (def?.tier) {
      lines.push({ text: `Tier: ${def.tier}`, color: C.dim });
    }
    if (def?.description) {
      lines.push({ type: 'separator' });
      lines.push({ text: def.description, color: C.dim });
    }
    return lines;
  }

  _buildTechTooltipLines({ tech, researched, available }) {
    const lines = [];
    let statusIcon, statusColor, statusText;
    if (researched) { statusIcon = '✅'; statusColor = C.green; statusText = 'Zbadana'; }
    else if (available) { statusIcon = '🔓'; statusColor = C.yellow; statusText = 'Dostępna (kliknij)'; }
    else { statusIcon = '🔒'; statusColor = THEME.textDim; statusText = 'Zablokowana'; }
    lines.push({ type: 'header', text: `${statusIcon} ${tech.namePL}`, color: statusColor });
    lines.push({ type: 'separator' });
    if (tech.description) { for (const wl of this._wrapText(tech.description, TOOLTIP_WRAP)) lines.push({ type: 'line', text: wl }); lines.push({ type: 'separator' }); }
    if (tech.effects.length > 0) {
      lines.push({ type: 'line', text: 'Efekty:', color: C.label });
      for (const fx of tech.effects) lines.push({ type: 'line', text: `  ${this._formatTechEffect(fx)}`, color: C.bright, indent: 4 });
      lines.push({ type: 'separator' });
    }
    lines.push({ type: 'line', text: `Koszt: ${tech.cost.research} 🔬`, color: C.yellow });
    if (tech.requires.length > 0) {
      const reqNames = tech.requires.map(id => TECHS[id]?.namePL ?? id).join(', ');
      lines.push({ type: 'line', text: `Wymaga: ${reqNames}`, color: C.purple });
    }
    lines.push({ type: 'line', text: `Status: ${statusText}`, color: statusColor });
    return lines;
  }

  _buildCatalogBodyTooltipLines({ body, explored }) {
    const lines = [];
    const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
    const typeStr = body.planetType ?? body.type;

    if (!explored) {
      // Niezbadane ciało — ograniczone dane
      lines.push({ type: 'header', text: `${icon} ???`, color: THEME.textDim });
      lines.push({ type: 'separator' });
      lines.push({ type: 'line', text: `Typ: ${typeStr}`, color: C.dim });
      const orbA = body.orbital?.a ?? 0;
      lines.push({ type: 'line', text: `Orbita: ${orbA.toFixed(2)} AU`, color: C.dim });
      const distHome = DistanceUtils.orbitalFromHomeAU(body);
      lines.push({ type: 'line', text: `Odległość: ${distHome.toFixed(2)} AU`, color: C.dim });
      lines.push({ type: 'separator' });
      lines.push({ type: 'line', text: 'Wyślij misję rozpoznawczą', color: C.orange });
      lines.push({ type: 'line', text: 'Klik → focus kamery', color: C.label });
      return lines;
    }

    // Zbadane ciało — pełne dane
    lines.push({ type: 'header', text: `${icon} ${body.name}`, color: THEME.textPrimary });
    lines.push({ type: 'separator' });
    lines.push({ type: 'line', text: `Typ: ${typeStr}`, color: C.text });

    const tempC = body.temperatureC != null ? Math.round(body.temperatureC) : (body.temperatureK ? Math.round(body.temperatureK - 273) : null);
    if (tempC !== null) {
      const tempColor = tempC > -20 && tempC < 60 ? C.green : C.label;
      lines.push({ type: 'line', text: `Temperatura: ${tempC > 0 ? '+' : ''}${tempC}°C`, color: tempColor });
    }

    const mass = body.physics?.mass ?? 0;
    if (mass > 0) lines.push({ type: 'line', text: `Masa: ${mass.toFixed(2)} M⊕`, color: C.text });

    const orbA = body.orbital?.a ?? 0;
    lines.push({ type: 'line', text: `Orbita: ${orbA.toFixed(2)} AU`, color: C.text });
    const distHome = DistanceUtils.orbitalFromHomeAU(body);
    lines.push({ type: 'line', text: `Odległość od bazy: ${distHome.toFixed(2)} AU`, color: C.text });

    // Atmosfera (string: 'none'/'thin'/'dense')
    const atm = body.atmosphere || 'none';
    const atmLabels = { dense: 'Gęsta', thin: 'Cienka', breathable: 'Oddychalna', none: 'Brak' };
    let atmText = atmLabels[atm] || atm;
    if (atm === 'breathable' || body.breathableAtmosphere) atmText += ' — zdatna do życia ✅';
    const atmColor = atm === 'none' ? C.dim : (atm === 'breathable' || body.breathableAtmosphere) ? C.green : C.text;
    lines.push({ type: 'line', text: `Atmosfera: ${atmText}`, color: atmColor });

    // Skład chemiczny (top 5)
    if (body.composition) {
      const topComp = Object.entries(body.composition).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (topComp.length > 0) {
        const compStr = topComp.map(([e, v]) => `${e}:${v.toFixed(0)}%`).join(' ');
        lines.push({ type: 'line', text: `Skład: ${compStr}`, color: C.label });
      }
    }

    // Złoża
    const deps = body.deposits ?? [];
    if (deps.length > 0) {
      lines.push({ type: 'separator' });
      lines.push({ type: 'line', text: 'Złoża:', color: C.label });
      for (const d of deps) {
        const pct = d.totalAmount > 0 ? Math.round(d.remaining / d.totalAmount * 100) : 0;
        const stars = d.richness >= 0.7 ? '★★★' : d.richness >= 0.4 ? '★★' : '★';
        const color = pct <= 0 ? C.dim : d.richness >= 0.7 ? C.green : d.richness >= 0.4 ? C.orange : C.red;
        const text = pct <= 0 ? `  ${d.resourceId}: WYCZERPANE` : `  ${d.resourceId} ${stars} ${pct}%`;
        lines.push({ type: 'line', text, color });
      }
    }

    lines.push({ type: 'separator' });
    lines.push({ type: 'line', text: 'Klik → focus kamery', color: C.label });
    return lines;
  }

  _formatTechEffect(fx) {
    const icons = RESOURCE_ICONS;
    switch (fx.type) {
      case 'modifier': return `+${Math.round((fx.multiplier - 1) * 100)}% ${icons[fx.resource] ?? fx.resource} produkcji`;
      case 'unlockBuilding': { const b = BUILDINGS[fx.buildingId]; return `Odblokowanie: ${b?.namePL ?? fx.buildingId}`; }
      case 'unlockShip': { const s = SHIPS[fx.shipId]; return `Odblokowanie statku: ${s?.icon ?? '🚀'} ${s?.namePL ?? fx.shipId}`; }
      case 'prosperityBonus': return `+${fx.amount} dobrobyt (permanentny)`;
      case 'popGrowthBonus': return `+${Math.round((fx.multiplier - 1) * 100)}% wzrost populacji`;
      case 'consumptionMultiplier': return `${Math.round((fx.multiplier - 1) * 100)}% zużycie ${icons[fx.resource] ?? fx.resource}`;
      default: return fx.type;
    }
  }

  _wrapText(text, maxChars) {
    if (!text) return [];
    const words = text.split(' ');
    const lines = []; let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > maxChars && current.length > 0) { lines.push(current); current = word; }
      else { current = current ? current + ' ' + word : word; }
    }
    if (current) lines.push(current);
    return lines;
  }

  // ══════════════════════════════════════════════════════════════
  // Hit testing
  // ══════════════════════════════════════════════════════════════
  _hitTestCivPanel(x, y) {
    const sy = CIV_PANEL_Y;
    const fullH = H - sy - COSMIC.BOTTOM_BAR_H;
    const result = hitTestSidebar(x, y, sy, fullH);
    if (result) {
      if (result === 'sidebar') return true;
      // Toggle overlay — klik na aktywny zamyka, inny otwiera
      if (this.overlayManager.active === result) {
        this.overlayManager.closeActive();
      } else {
        this.overlayManager.openPanel(result);
      }
      return true;
    }
    return false;
  }


  _hitTestConfirm(x, y) {
    const DW = 300, DH = 90;
    const DX = W / 2 - DW / 2, DY = H / 2 - DH / 2;
    // Klik poza dialogiem — zamknij (modal)
    if (x < DX || x > DX + DW || y < DY || y > DY + DH) {
      this._confirmDialog = { visible: false };
      return true;
    }
    const btnY = DY + 52;
    if (x >= W / 2 - 80 && x <= W / 2 - 10 && y >= btnY && y <= btnY + 20) {
      this._confirmDialog = { visible: false }; EventBus.emit('game:new'); return true;
    }
    if (x >= W / 2 + 10 && x <= W / 2 + 90 && y >= btnY && y <= btnY + 20) {
      this._confirmDialog = { visible: false }; return true;
    }
    return true;
  }

  _hitTestActionPanel(x, y) {
    if (window.KOSMOS?.civMode) return false;
    if (window.KOSMOS?.scenario !== 'generator') return false;
    const PW = 220, BTN_H = 36, BTN_G = 6, PAD = 10;
    const PH = PAD + 16 + 3 * (BTN_H + BTN_G) + PAD;
    const PX = W - COSMIC.OUTLINER_W - PW - 12;
    const PY = H - PH - COSMIC.BOTTOM_BAR_H - 8;
    if (x < PX || x > PX + PW || y < PY || y > PY + PH) return false;
    const actions = ['stabilize', 'nudgeToHz', 'bombard'];
    actions.forEach((act, i) => {
      const by = PY + PAD + 16 + 10 + i * (BTN_H + BTN_G);
      if (y >= by && y <= by + BTN_H) EventBus.emit(`action:${act}`);
    });
    return true;
  }

  _detectHoverBtn(x, y) {
    // BottomBar
    if (y >= H - COSMIC.BOTTOM_BAR_H) return 'bottombar';
    // TopBar
    if (y <= COSMIC.TOP_BAR_H) return 'topbar';
    // CivPanel sidebar — pełna wysokość
    if (window.KOSMOS?.civMode) {
      const sidebarFullH = H - CIV_PANEL_Y - COSMIC.BOTTOM_BAR_H;
      if (x <= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + sidebarFullH) return 'civpanel';
    }
    // Outliner
    if (window.KOSMOS?.civMode && x >= W - COSMIC.OUTLINER_W && y >= COSMIC.TOP_BAR_H) return 'outliner';
    // ActionPanel
    if (!window.KOSMOS?.civMode) {
      const PW = 220, PH = 166;
      const PX = W - COSMIC.OUTLINER_W - PW - 12;
      const PY = H - PH - COSMIC.BOTTOM_BAR_H - 8;
      if (x >= PX && x <= PX + PW && y >= PY && y <= PY + PH) return 'action';
    }
    return null;
  }

  // ── Narzędzie: zaokrąglony prostokąt ─────────────────────────
  _roundRect(ctx, x, y, w, h, r, fill, alpha, stroke) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    if (stroke) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = stroke; ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Helper functions (module-level)
function _shortYear(y) {
  if (y >= 1e9) return (y / 1e9).toFixed(1) + 'G';
  if (y >= 1e6) return (y / 1e6).toFixed(1) + 'M';
  if (y >= 1000) return (y / 1000).toFixed(0) + 'k';
  if (y < 1 && y > 0) return y.toFixed(2);
  return String(Math.floor(y));
}

function _truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}
