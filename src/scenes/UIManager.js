// UIManager — zarządzanie interfejsem gry na Canvas 2D
// Redesign Stellaris-inspired: TopBar, Outliner, BottomContext, BottomBar, CivPanel
//
// Rysuje na #ui-canvas nakładanym nad Three.js.
// Obsługuje kliknięcia przez metodę handleClick(x, y) zwracającą true/false.
// Wszystkie dane UI aktualizowane przez EventBus.

import EventBus    from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { TECHS, TECH_BRANCHES } from '../data/TechData.js';
import { BUILDINGS, RESOURCE_ICONS, formatRates, formatCost } from '../data/BuildingsData.js';
import { SHIPS } from '../data/ShipsData.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { showRenameModal } from '../ui/ModalInput.js';
import { showTransportModal } from '../ui/TransportModal.js';
import { showTradeRouteModal } from '../ui/TradeRouteModal.js';
import { showCargoLoadModal } from '../ui/CargoLoadModal.js';
import { DistanceUtils }     from '../utils/DistanceUtils.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }          from '../config/LayoutConfig.js';

// Nowe komponenty UI
import { TopBar }        from '../ui/TopBar.js';
import { BottomBar }     from '../ui/BottomBar.js';
import { BottomContext }  from '../ui/BottomContext.js';
import { Outliner }       from '../ui/Outliner.js';
import {
  CIV_SIDEBAR_W, CIV_SIDEBAR_BTN, CIV_SIDEBAR_GAP, CIV_SIDEBAR_PAD,
  CIV_PANEL_BODY_H, CIV_TABS,
  drawCivPanelSidebar, drawCivPanelBody,
  drawEconomyTab, drawPopulationTab, drawTechTab, drawBuildingsTab,
  drawMiniBar, getBuildingGroups, formatGroupRates, techEffectSummary,
  hitTestSidebar, handleTechClick, handleFactoryClick,
} from '../ui/CivPanelDrawer.js';

// Wymiary fizyczne canvas (piksele urządzenia)
const _PW = window.innerWidth;
const _PH = window.innerHeight;
// Skala UI względem bazowego 1280×720 — automatycznie skaluje tekst i panele
const UI_SCALE = Math.min(_PW / 1280, _PH / 720);
// Wymiary logiczne (używane w kodzie rysującym — niezależne od DPI/rozdzielczości)
const W = Math.round(_PW / UI_SCALE);
const H = Math.round(_PH / UI_SCALE);

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
};

// Koszty akcji gracza (zsynchronizowane z PlayerActionSystem)
const ACTION_COSTS = { stabilize: 25, nudgeToHz: 35, bombard: 20 };

// Pozycja CivPanel (pod TopBar)
const CIV_PANEL_Y = COSMIC.TOP_BAR_H;
const CIV_EXPEDITIONS_H = H - CIV_PANEL_Y - 15; // dynamiczna wysokość — panel rozciąga się do dołu ekranu

// ── Tooltip CivPanel ────────────────────────────────────────────
const TOOLTIP_PAD    = 8;
const TOOLTIP_MAX_W  = 260;
const TOOLTIP_LINE_H = 13;
const TOOLTIP_HDR_H  = 16;
const TOOLTIP_SEP_H  = 8;
const TOOLTIP_WRAP   = 30;
const TOOLTIP_OFS    = 14;

const MORALE_MAX = { housing: 20, food: 20, water: 15, energy: 15, employment: 15, safety: 15 };
const MORALE_LABELS = {
  housing: '🏠 Mieszkania', food: '🌿 Żywność', water: '💧 Woda',
  energy: '⚡ Energia', employment: '👷 Zatrudnienie', safety: '🛡 Bezpiecz.',
};

export class UIManager {
  constructor(uiCanvas) {
    uiCanvas.width  = _PW;
    uiCanvas.height = _PH;
    this.canvas = uiCanvas;
    this.ctx    = uiCanvas.getContext('2d');

    // ── Nowe komponenty UI ───────────────────────────────
    this._topBar       = new TopBar();
    this._bottomBar    = new BottomBar();
    this._bottomContext = new BottomContext();
    this._outliner     = new Outliner();

    // ── Stan UI ───────────────────────────────────────────────
    this._selectedEntity  = null;
    this._infoPanelTab    = 'orbit';
    this._stability       = { score: 50, trend: 'stable' };
    this._timeState       = { isPaused: false, multiplierIndex: 1, displayText: 'Rok 0, dzień 0', autoSlow: true };
    this._diskPhase       = 'DISK';
    this._diskPhasePL     = 'Dysk';
    this._energy          = 0;
    this._energyMax       = 100;
    this._hoverAction     = null;
    this._audioEnabled    = true;
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
    this._factoryBtns = [];

    // ── Stan CivPanel ──────
    this._civPanelTab = null;
    this._civData     = null;
    this._moraleData  = null;

    // ── EventLog ──────────────────────────────────────────────
    this._logEntries = [];
    this._logYear    = 0;

    // ── Hover buttonów ────────────────────────────────────────
    this._hoveredBtn = null;

    // ── Tooltip CivPanel ────────────────────────────────────
    this._tooltip       = null;
    this._tooltipMouseX = 0;
    this._tooltipMouseY = 0;

    // ── Ekspedycje zakładka ──────────────────────────────────
    this._reconBtns = [];
    this._fleetBuildBtns = [];
    this._vesselRows = [];
    this._vesselActionBtns = [];
    this._orbitReturnBtns = [];
    this._orbitRedirectBtns = [];
    this._redirectTargetBtns = [];
    this._redirectTargetExpId = null;  // ID ekspedycji w trybie wyboru celu
    this._selectedVesselId = null;
    this._vesselMissionType = null;
    this._colonyListItems = [];
    this._transportBtnRect = null;

    // ── Katalog zbadanych ciał (scroll) ────────────────────
    this._catalogScrollY = 0;
    this._catalogContentH = 0;
    this._catalogVisibleH = 0;
    this._catalogRowRects = [];  // hit rects wierszy katalogu

    // ── Scroll sekcji FLOTA ──────────────────────────────────
    this._fleetScrollY = 0;
    this._fleetContentH = 0;
    this._fleetVisibleH = 0;
    this._fleetClipRect = { y: 0, h: 0 };

    this._setupEvents();
    this._startDrawLoop();

    // Scroll kółkiem myszy
    window.addEventListener('wheel', (e) => {
      this.handleWheel(e.clientX, e.clientY, e.deltaY);
    }, { passive: true });
  }

  // ── EventBus ──────────────────────────────────────────────────
  _setupEvents() {
    // Czas
    EventBus.on('time:stateChanged', ({ isPaused, multiplierIndex }) => {
      this._timeState.isPaused          = isPaused;
      this._timeState.multiplierIndex   = multiplierIndex;
    });
    EventBus.on('time:display', ({ displayText, multiplierIndex, autoSlow }) => {
      this._timeState.displayText       = displayText;
      this._timeState.multiplierIndex   = multiplierIndex;
      this._timeState.autoSlow          = autoSlow;
    });

    // Stabilność
    EventBus.on('system:stabilityChanged', ({ score, trend }) => {
      this._stability = { score, trend };
    });

    // Faza dysku
    EventBus.on('disk:phaseChanged', ({ newPhase, newPhasePL }) => {
      this._diskPhase   = newPhase;
      this._diskPhasePL = newPhasePL;
    });

    // Zaznaczenie
    EventBus.on('body:selected', ({ entity }) => {
      this._selectedEntity = entity;
      if (this._infoPanelTab === 'composition' && !entity.composition) {
        this._infoPanelTab = 'orbit';
      }
    });
    EventBus.on('body:deselected', () => { this._selectedEntity = null; });
    EventBus.on('player:planetUpdated', ({ planet }) => {
      if (this._selectedEntity?.id === planet.id) this._selectedEntity = planet;
    });
    EventBus.on('planet:compositionChanged', ({ planet }) => {
      if (this._selectedEntity?.id === planet.id) this._selectedEntity = planet;
    });
    EventBus.on('body:collision', () => {});

    // Energia gracza
    EventBus.on('player:energyChanged', ({ energy, max }) => {
      this._energy    = energy;
      this._energyMax = max;
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
          if (isNow && !wasBefore) {
            this._log('⚠ BROWNOUT! Deficyt energii — produkcja wstrzymana', 'civ_unrest');
          } else if (!isNow && wasBefore) {
            this._log('✅ Energia: bilans dodatni — brownout zakończony', 'expedition_ok');
          }
          this._wasBrownout = isNow;
        }
        if (inventory._research) {
          this._resources.research = inventory._research.amount ?? 0;
          this._resDelta.research  = inventory._research.perYear ?? 0;
        }
        // Preferuj obserwowane delty (uwzględniają mining + receive + spend)
        // Fallback na _perYear (tylko registrowane producenty)
        if (inventory._observedPerYear && Object.keys(inventory._observedPerYear).length > 0) {
          this._invPerYear = { ...inventory._observedPerYear };
        } else if (inventory._perYear) {
          this._invPerYear = { ...inventory._perYear };
        }
      }
    };
    EventBus.on('resource:changed',  _applyResources);
    EventBus.on('resource:snapshot', _applyResources);
    EventBus.on('resource:shortage', ({ resource }) => {
      this._flashResource(resource);
    });

    // CivPanel
    EventBus.on('civ:populationChanged', (data) => { this._civData = data; });
    EventBus.on('civ:moraleChanged',     (data) => { this._moraleData = data; });

    // Fabryki
    EventBus.on('factory:statusChanged', (data) => { this._factoryData = data; });

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
    });
    EventBus.on('expedition:disaster', ({ expedition }) => {
      this._expeditions = this._expeditions.filter(e => e.id !== expedition.id);
    });
    EventBus.on('expedition:returned', ({ expedition }) => {
      this._expeditions = this._expeditions.filter(e => e.id !== expedition.id);
    });
    EventBus.on('expedition:returnOrdered', ({ expedition }) => {
      // Aktualizuj status na returning
      const idx = this._expeditions.findIndex(e => e.id === expedition.id);
      if (idx !== -1) {
        this._expeditions[idx] = { ...this._expeditions[idx], ...expedition };
      }
    });
    EventBus.on('expedition:reconProgress', ({ expedition }) => {
      // Sekwencyjny full_system recon — aktualizuj dane (nowy targetId, arrivalYear, bodiesDiscovered)
      const idx = this._expeditions.findIndex(e => e.id === expedition.id);
      if (idx !== -1) {
        this._expeditions[idx] = { ...this._expeditions[idx], ...expedition };
      }
    });
    EventBus.on('expedition:redirected', ({ expedition }) => {
      const idx = this._expeditions.findIndex(e => e.id === expedition.id);
      if (idx !== -1) {
        this._expeditions[idx] = { ...this._expeditions[idx], ...expedition };
      }
    });
    EventBus.on('expedition:redirectFailed', ({ reason }) => {
      this._addNotification(`⚠ Zmiana celu: ${reason}`);
    });

    // Flota
    EventBus.on('fleet:buildStarted', ({ shipId }) => {
      const ship = SHIPS[shipId];
      this._addNotification(`⚓ Stocznia: budowa ${ship?.namePL ?? shipId}`);
    });
    EventBus.on('fleet:shipCompleted', ({ shipId }) => {
      const ship = SHIPS[shipId];
      this._addNotification(`✅ Statek gotowy: ${ship?.icon ?? '🚀'} ${ship?.namePL ?? shipId}`);
    });
    EventBus.on('fleet:buildFailed', ({ reason }) => {
      this._addNotification(`⚠ Stocznia: ${reason}`);
    });

    // Vessel events
    EventBus.on('vessel:launched', ({ vessel, mission }) => {
      const sd = SHIPS[vessel.shipId];
      const icon = sd?.icon ?? '🚀';
      const mIcon = mission?.type === 'scientific' ? '🔬' : mission?.type === 'colony' ? '🚢'
        : mission?.type === 'transport' ? '📦' : mission?.type === 'recon' ? '🔭' : '⛏';
      this._addNotification(`${icon} ${vessel.name} → ${mission?.targetName ?? '?'} (${mIcon} ${mission?.type})`);
    });
    EventBus.on('vessel:docked', ({ vessel }) => {
      this._addNotification(`↩ ${vessel.name} powrócił`);
    });

    // Autosave
    EventBus.on('game:saved', ({ gameTime }) => {
      const y = Math.round(gameTime).toLocaleString('pl-PL');
      this._addNotification(`\u{1F4BE} Zapisano (${y} lat)`);
    });

    // Dialog Nowa Gra (emitowane z BottomBar)
    EventBus.on('ui:confirmNew', () => {
      this._confirmDialog = { visible: true };
    });

    // Game Over — cywilizacja zniszczona
    EventBus.on('game:over', ({ reason, planetName }) => {
      this._gameOverData = { reason, planetName };
    });

    // EventLog subskrypcje
    this._setupLogEvents();
  }

  _setupLogEvents() {
    EventBus.on('time:display', ({ displayText }) => {
      const m = displayText.match(/Rok\s+([\d\s,]+)/);
      if (m) this._logYear = parseInt(m[1].replace(/[\s,]/g, '')) || this._logYear;
    });

    EventBus.on('body:collision', ({ winner, loser, type }) => {
      const smallTypes = new Set(['asteroid', 'comet', 'planetesimal', 'planetoid']);
      if (loser && smallTypes.has(loser.type)) return;
      if (type === 'absorb') {
        this._log(`${winner?.name ?? '?'} pochłonął ${loser?.name ?? '?'}`, 'collision_absorb');
      } else if (type === 'redirect') {
        this._log(`Zderzenie: ${winner?.name ?? '?'} ↔ ${loser?.name ?? '?'}`, 'collision_redirect');
      } else if (type === 'eject') {
        this._log(`${loser?.name ?? '?'} wyrzucona!`, 'ejection');
      }
    });

    EventBus.on('planet:ejected', ({ planet }) => {
      this._log(`${planet.name} wyrzucona z układu`, 'ejection');
    });

    // Uderzenia kosmiczne na kolonie
    EventBus.on('impact:colonyDamage', ({ message, severity, popLost, buildingsDestroyed }) => {
      const type = severity === 'extinction' || severity === 'heavy' ? 'collision_destroy' : 'collision_absorb';
      let detail = message;
      if (popLost > 0 || buildingsDestroyed > 0) {
        const parts = [];
        if (popLost > 0) parts.push(`-${popLost} POP`);
        if (buildingsDestroyed > 0) parts.push(`-${buildingsDestroyed} budynków`);
        detail += ` (${parts.join(', ')})`;
      }
      this._log(detail, type);
    });

    EventBus.on('accretion:newPlanet', (planet) => {
      this._log(`Nowa planeta: ${planet.name}`, 'new_planet');
    });

    EventBus.on('life:emerged', ({ planet }) => {
      this._log(`Życie na ${planet.name}!`, 'life_good');
    });
    EventBus.on('life:evolved', ({ planet, stage }) => {
      this._log(`${planet.name}: ${stage.label}`, 'life_good');
    });
    EventBus.on('life:extinct', ({ planet }) => {
      this._log(`Wymieranie na ${planet.name}`, 'life_bad');
    });

    EventBus.on('time:autoSlowTriggered', ({ reason }) => {
      this._log(`Auto-slow: ${reason}`, 'auto_slow');
    });


    EventBus.on('civ:epochChanged', ({ epoch }) => {
      this._log(`Nowa epoka: ${epoch}`, 'civ_epoch');
    });
    EventBus.on('civ:unrestStarted', () => {
      this._log('Niepokoje społeczne!', 'civ_unrest');
    });
    EventBus.on('civ:famine', () => {
      this._log('Głód w kolonii!', 'civ_famine');
    });

    EventBus.on('civ:popBorn', ({ population }) => {
      this._log(`Nowy POP! Populacja: ${population}`, 'pop_born');
    });
    EventBus.on('civ:popDied', ({ cause, population }) => {
      const causeText = cause === 'starvation' ? ' (głód)' : '';
      this._log(`Strata POPa${causeText}! Populacja: ${population}`, 'pop_died');
    });

    EventBus.on('expedition:reconProgress', ({ body, discovered }) => {
      // Postęp sekwencyjnego recon — odkryto kolejne ciało
      const name = body?.name ?? '???';
      this._log(`🔭 Odkryto: ${name} (${discovered} zbadanych)`, 'expedition_ok');
    });
    EventBus.on('expedition:reconComplete', ({ scope, discovered }) => {
      const label = scope === 'nearest' ? 'Rozpoznanie' : 'Rozpoznanie układu';
      const count = Array.isArray(discovered) ? discovered.length : discovered;
      this._log(`${label}: odkryto ${count} ciał`, 'expedition_ok');
    });
    EventBus.on('expedition:arrived', ({ expedition, multiplier }) => {
      // Orbiting nie loguje "wraca" — raport logowany osobno
      if (expedition.status === 'orbiting') return;
      const mult = multiplier != null ? ` ×${multiplier.toFixed(1)}` : '';
      const typeLabel = expedition.type === 'transport' ? 'Transport dostarczony'
        : expedition.type === 'colony' ? 'Kolonia założona'
        : expedition.type === 'recon' ? 'Rozpoznanie zakończone'
        : 'Ekspedycja dotarła';
      this._log(`${typeLabel}: ${expedition.targetName}${mult}`, 'expedition_ok');
    });
    EventBus.on('expedition:missionReport', ({ text }) => {
      // Raport z misji mining/scientific — szczegółowe zasoby
      this._log(text, 'expedition_ok');
    });
    EventBus.on('expedition:disaster', ({ expedition }) => {
      this._log(`Katastrofa: ${expedition.targetName}!`, 'expedition_fail');
    });
    EventBus.on('expedition:launchFailed', ({ reason }) => {
      this._log(`⚠ Start anulowany: ${reason}`, 'expedition_fail');
    });
    EventBus.on('colony:founded', ({ colony }) => {
      this._log(`🏙 Nowa kolonia: ${colony.name}`, 'new_planet');
    });
    // Przełączenie aktywnej kolonii z Outliner → odśwież wszystkie dane UI
    EventBus.on('colony:switched', () => {
      EventBus.emit('resource:requestSnapshot');
      // Odśwież dane populacji i morale z nowej kolonii
      const cSys = window.KOSMOS?.civSystem;
      if (cSys) {
        this._civData = cSys._popSnapshot();
        this._moraleData = {
          morale:     cSys.morale,
          target:     cSys.moraleTarget,
          components: { ...cSys.moraleComponents },
        };
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
    EventBus.on('colony:tradeExecuted', ({ route }) => {
      this._log('📦 Droga handlowa: transfer wykonany', 'info');
    });
    EventBus.on('colony:migration', ({ from, to, count }) => {
      this._log(`👤 Migracja: ${count} POP z ${from} → ${to}`, 'info');
    });
  }

  _log(text, type = 'info') {
    const MAX = 8;
    this._logEntries.unshift({ year: this._logYear, text, color: LOG_COLORS[type] || C.text });
    if (this._logEntries.length > MAX) this._logEntries.length = MAX;
  }

  addInfo(text) { this._log(text, 'info'); }

  _addNotification(text) {
    this._notifications.push({ text, alpha: 1.0, endTime: Date.now() + 2800 });
  }

  _flashResource(resource) {
    this._log(`Niedobór: ${resource}`, 'civ_famine');
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

    // BottomBar (zawsze widoczny)
    if (this._bottomBar.isOver(x, y, H)) return true;

    // Outliner (prawy panel — tylko civMode)
    if (window.KOSMOS?.civMode && this._outliner.isOver(x, y, W, H)) return true;

    // BottomContext (dolny panel kontekstowy — gdy encja zaznaczona)
    if (this._bottomContext.isOver(x, y, W, H, this._selectedEntity)) return true;

    // CivPanel sidebar (zawsze widoczny gdy civMode)
    if (window.KOSMOS?.civMode) {
      const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                     + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;
      if (x <= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + sidebarH) return true;
    }
    // CivPanel body
    if (window.KOSMOS?.civMode && this._civPanelTab !== null) {
      const bodyH = (this._civPanelTab === 'expeditions' || this._civPanelTab === 'economy')
        ? CIV_EXPEDITIONS_H : CIV_PANEL_BODY_H;
      const panelBottom = CIV_PANEL_Y + bodyH;
      if (x >= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= panelBottom) return true;
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
    x /= UI_SCALE; y /= UI_SCALE;

    // Game Over — klik na przycisk "Nowa Gra"
    if (this._gameOverData) {
      return this._hitTestGameOver(x, y);
    }

    // Dialog potwierdzenia
    if (this._confirmDialog?.visible) {
      return this._hitTestConfirm(x, y);
    }

    // TopBar (zasoby + czas)
    if (this._topBar.hitTest(x, y, W)) return true;

    // BottomBar (stabilność + EventLog + przyciski)
    if (this._bottomBar.hitTest(x, y, W, H, this._audioEnabled, this._timeState.autoSlow)) return true;

    // Outliner (prawy panel — kolonie/ekspedycje)
    if (window.KOSMOS?.civMode && this._outliner.hitTest(x, y, W, H)) return true;

    // BottomContext (dolny panel kontekstowy)
    if (this._selectedEntity && this._bottomContext.hitTest(x, y, W, H, this._selectedEntity)) return true;

    // CivPanel
    if (window.KOSMOS?.civMode && this._hitTestCivPanel(x, y)) return true;

    // Akcje gracza
    if (this._hitTestActionPanel(x, y)) return true;

    return false;
  }

  // Obsługa scrolla
  handleWheel(rawX, rawY, deltaY) {
    const x = rawX / UI_SCALE;
    const y = rawY / UI_SCALE;
    // Ekspedycje — scroll katalogu (prawa kolumna) lub floty (dolna sekcja)
    if (this._civPanelTab === 'expeditions') {
      const rect = this._civPanelBodyRect();
      const halfW = Math.floor(rect.w / 2);
      const upperZoneH = 200;
      // Katalog — scroll w prawej kolumnie górnej strefy
      if (x >= rect.x + halfW && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + upperZoneH) {
        const maxScroll = Math.max(0, this._catalogContentH - this._catalogVisibleH);
        this._catalogScrollY = Math.max(0, Math.min(maxScroll, this._catalogScrollY + deltaY * 0.5));
        return true;
      }
      // Flota — scroll w dolnej sekcji
      const fc = this._fleetClipRect;
      if (fc && fc.h > 0 && x >= rect.x && x <= rect.x + rect.w && y >= fc.y && y <= fc.y + fc.h) {
        const maxScroll = Math.max(0, this._fleetContentH - this._fleetVisibleH);
        this._fleetScrollY = Math.max(0, Math.min(maxScroll, (this._fleetScrollY || 0) + deltaY * 0.5));
        return true;
      }
    }
    // BottomContext scroll
    if (this._selectedEntity) {
      if (this._bottomContext.handleWheel(x, y, deltaY, W, H, this._selectedEntity)) return true;
    }
    return false;
  }

  handleMouseMove(x, y) {
    x /= UI_SCALE; y /= UI_SCALE;
    this._tooltipMouseX = x;
    this._tooltipMouseY = y;
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
      this._draw();
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

    // ── CivPanel (sidebar + zakładki) ────────────────────────
    if (civMode && !globeOpen) this._drawCivPanel();

    // ── Outliner (prawy panel) ───────────────────────────────
    if (civMode && !globeOpen) {
      const colMgr = window.KOSMOS?.colonyManager;
      const activePid = colMgr?.activePlanetId;
      this._outliner.draw(ctx, W, H, {
        colonies: colMgr?.getAllColonies() ?? [],
        expeditions: this._expeditions,
        fleet: colMgr?.getFleet(activePid) ?? [],
        shipQueues: colMgr?.getShipQueues(activePid) ?? [],
      });
      // Tooltip kolonii (hover w Outliner)
      this._outliner.drawTooltip(ctx);
    }

    // ── BottomContext (dolny panel info o encji) ──────────────
    if (!globeOpen) {
      this._bottomContext.draw(ctx, W, H, this._selectedEntity);
    }

    // ── BottomBar (stabilność + EventLog + przyciski) ────────
    this._bottomBar.draw(ctx, W, H, {
      stability: this._stability,
      logEntries: this._logEntries,
      audioEnabled: this._audioEnabled,
      autoSlow: this._timeState.autoSlow,
      civMode,
    });

    // ── Panel akcji gracza (tylko tryb Generator) ────────────
    if (!civMode) this._drawActionPanel();

    // ── Powiadomienia (fade out) ─────────────────────────────
    this._drawNotifications();

    // ── Tooltip TopBar (na wierzchu) ─────────────────────────
    if (civMode) this._topBar.drawTooltip(ctx, W);

    // ── Tooltip CivPanel ─────────────────────────────────────
    if (this._tooltip) this._drawTooltip();

    // ── Dialog potwierdzenia ─────────────────────────────────
    if (this._confirmDialog?.visible) this._drawConfirmDialog();

    // ── Game Over ─────────────────────────────────────────────
    if (this._gameOverData) this._drawGameOver();

    ctx.restore();
  }

  // ── Prosty TopBar dla trybu Generator (logo + faza + czas) ──
  _drawSimpleTopBar(ctx) {
    ctx.fillStyle = bgAlpha(0.90);
    ctx.fillRect(0, 0, W, COSMIC.TOP_BAR_H);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, COSMIC.TOP_BAR_H); ctx.lineTo(W, COSMIC.TOP_BAR_H); ctx.stroke();

    // Logo
    ctx.font = `bold ${THEME.fontSizeTitle}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.textAlign = 'left';
    ctx.fillText('K O S M O S', 14, 20);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText('Symulator Układu Słonecznego', 14, 34);

    // Czas (prawa strona) — prosta wersja
    const { isPaused, multiplierIndex, displayText } = this._timeState;
    const LABELS = GAME_CONFIG.TIME_MULTIPLIER_LABELS;

    ctx.font = `${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = isPaused ? C.title : C.text;
    ctx.textAlign = 'center';
    ctx.fillText(isPaused ? '▶ GRAJ' : '⏸ PAUZA', W - 220, 20);

    LABELS.slice(1).forEach((label, i) => {
      const bx = W - 160 + i * 34;
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
  _civPanelBodyRect() {
    const h = (this._civPanelTab === 'expeditions' || this._civPanelTab === 'economy')
      ? CIV_EXPEDITIONS_H : CIV_PANEL_BODY_H;
    return { x: CIV_SIDEBAR_W, y: CIV_PANEL_Y, w: W - CIV_SIDEBAR_W - COSMIC.OUTLINER_W, h };
  }

  _drawCivPanel() {
    const ctx = this.ctx;

    // Sidebar (z CivPanelDrawer)
    drawCivPanelSidebar(ctx, CIV_PANEL_Y, this._civPanelTab);

    if (!this._civPanelTab) return;

    const { x: bodyX, y: bodyY, w: bodyW, h: bodyH } = this._civPanelBodyRect();

    // Tło treści (z CivPanelDrawer)
    drawCivPanelBody(ctx, bodyX, bodyY, bodyW, bodyH);

    // Rysuj zakładkę (z CivPanelDrawer)
    const state = {
      inventory: this._inventory,
      invPerYear: this._invPerYear,
      energyFlow: this._energyFlow,
      factoryData: this._factoryData,
      civData: this._civData,
      moraleData: this._moraleData,
    };

    if (this._civPanelTab === 'economy') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(bodyX, bodyY, bodyW, bodyH);
      ctx.clip();
      this._factoryBtns = drawEconomyTab(ctx, bodyY, bodyX, bodyW, state);
      ctx.restore();
    }
    if (this._civPanelTab === 'population')  drawPopulationTab(ctx, bodyY, bodyX, bodyW, state);
    if (this._civPanelTab === 'tech')        drawTechTab(ctx, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'buildings')   drawBuildingsTab(ctx, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'expeditions') this._drawExpeditionsTab(ctx, bodyY, bodyX, bodyW, bodyH);
  }

  // Ekspedycje — zachowana w UIManager (ma dużo stanu)
  _drawExpeditionsTab(ctx, bodyY, bodyX, bodyW, bodyH) {
    const exSys  = window.KOSMOS?.expeditionSystem;
    const colMgr = window.KOSMOS?.colonyManager;

    // Synchronizuj listę ekspedycji z ExpeditionSystem (po save/restore)
    if (exSys && this._expeditions.length === 0) {
      const active = exSys.getActive?.() ?? [];
      if (active.length > 0) this._expeditions = active.map(e => ({ ...e }));
    }
    const PAD    = 14;
    const LH     = 14;
    const halfW  = Math.floor(bodyW / 2);
    const upperZoneH = 200; // wysokość górnej strefy (misje + katalog)
    let y = bodyY + 16;

    // ═══════════════════════════════════════════════════════════════
    // GÓRNA STREFA: dwie kolumny
    // ═══════════════════════════════════════════════════════════════

    // ── LEWA KOLUMNA: AKTYWNE MISJE ──────────────────────────────
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.fillText('AKTYWNE MISJE', bodyX + PAD, y);

    const count = this._expeditions.length;
    const orbitCount = this._expeditions.filter(e => e.status === 'orbiting').length;
    const statusText = orbitCount > 0 ? `${count - orbitCount} w locie, ${orbitCount} na orbicie` : `${count} w locie`;
    ctx.fillStyle = count > 0 ? C.mint : C.label;
    ctx.textAlign = 'right';
    ctx.fillText(statusText, bodyX + halfW - PAD, y);
    ctx.textAlign = 'left';
    y += 4;

    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + halfW - PAD, y); ctx.stroke();
    y += 10;

    // Przyciski powrotu i redirect (orbiting) — zbierane do hitTest
    this._orbitReturnBtns = [];
    this._orbitRedirectBtns = [];

    if (count === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.text;
      ctx.fillText('Brak aktywnych misji', bodyX + PAD, y);
      y += LH;
    } else {
      for (const exp of this._expeditions.slice(0, 10)) {
        const icon = exp.type === 'scientific' ? '🔬' : exp.type === 'colony' ? '🚢'
          : exp.type === 'transport' ? '📦' : exp.type === 'recon' ? '🔭' : '⛏';
        const arrow = exp.status === 'returning' ? '↩' : exp.status === 'orbiting' ? '⊙' : '→';
        const color = exp.status === 'returning' ? C.mint
          : exp.status === 'orbiting' ? C.yellow : THEME.textPrimary;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = color;
        // Dla full_system recon pokaż postęp
        let displayName = _truncate(exp.targetName ?? '?', 14);
        if (exp.scope === 'full_system' && exp.bodiesDiscovered) {
          displayName = `Recon (${exp.bodiesDiscovered.length} zbad.)`;
        }
        ctx.fillText(`${arrow} ${icon} ${displayName}`, bodyX + PAD, y);

        if (exp.status === 'orbiting') {
          // Dwa przyciski: Powrót + Cel
          const btnW = 34; const btnH = 12; const gap = 2;
          const btnRetX = bodyX + halfW - PAD - btnW * 2 - gap;
          const btnRedX = bodyX + halfW - PAD - btnW;
          const btnY = y - 9;
          // Powrót
          ctx.fillStyle = 'rgba(60,50,10,0.7)';
          ctx.fillRect(btnRetX, btnY, btnW, btnH);
          ctx.strokeStyle = C.yellow; ctx.strokeRect(btnRetX, btnY, btnW, btnH);
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = C.yellow; ctx.textAlign = 'center';
          ctx.fillText('↩ Baza', btnRetX + btnW / 2, btnY + 9);
          ctx.textAlign = 'left';
          this._orbitReturnBtns.push({ x: btnRetX, y: btnY, w: btnW, h: btnH, expId: exp.id });
          // Zmień cel
          const isRedirectActive = this._redirectTargetExpId === exp.id;
          ctx.fillStyle = isRedirectActive ? 'rgba(20,50,80,0.8)' : 'rgba(10,30,60,0.7)';
          ctx.fillRect(btnRedX, btnY, btnW, btnH);
          ctx.strokeStyle = THEME.borderActive; ctx.strokeRect(btnRedX, btnY, btnW, btnH);
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'center';
          ctx.fillText('➡ Cel', btnRedX + btnW / 2, btnY + 9);
          ctx.textAlign = 'left';
          this._orbitRedirectBtns.push({ x: btnRedX, y: btnY, w: btnW, h: btnH, expId: exp.id });
        } else {
          const eta = exp.status === 'returning'
            ? `↩ ${_shortYear(exp.returnYear ?? 0)}`
            : `▶ ${_shortYear(exp.arrivalYear ?? 0)}`;
          ctx.fillStyle = C.label;
          ctx.textAlign = 'right';
          ctx.fillText(eta, bodyX + halfW - PAD, y);
          ctx.textAlign = 'left';
        }
        y += LH;
      }
      if (count > 10) { ctx.fillStyle = C.text; ctx.fillText(`...i ${count - 10} więcej`, bodyX + PAD, y); y += LH; }

      // Inline target picker — gdy redirectTargetExpId jest ustawiony
      if (this._redirectTargetExpId) {
        const redExp = this._expeditions.find(e => e.id === this._redirectTargetExpId);
        if (redExp && redExp.status === 'orbiting') {
          y = this._drawRedirectTargetPicker(ctx, redExp, bodyX + PAD, y, halfW - PAD * 2);
        }
      }
    }

    // ── PRAWA KOLUMNA: KATALOG CIAŁ NIEBIESKICH ──────────────────
    const catalogX = bodyX + halfW;
    const catalogW = halfW - PAD;
    const catalogMaxH = upperZoneH - 20; // margines
    this._drawBodyCatalog(ctx, bodyY, catalogX, catalogW, catalogMaxH);

    // ═══════════════════════════════════════════════════════════════
    // DOLNA STREFA: FLOTA + STOCZNIA (pełna szerokość)
    // ═══════════════════════════════════════════════════════════════
    y = bodyY + upperZoneH;
    const fullW = bodyW - PAD * 2;

    // Separator
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + PAD + fullW, y); ctx.stroke();
    y += 10;

    this._fleetBuildBtns = [];
    this._vesselRows = [];
    this._vesselActionBtns = [];
    const tSys = window.KOSMOS?.techSystem;
    const vMgr = window.KOSMOS?.vesselManager;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title; ctx.fillText('FLOTA', bodyX + PAD, y);
    y += 4;
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + PAD + fullW, y); ctx.stroke();
    y += 10;

    // === Strefa scrollowalna FLOTA ===
    const CLIP_PAD = 12; // zapas na ascenders tekstu (górna krawędź liter)
    const fleetContentY = y;
    const fleetMaxH = bodyY + bodyH - fleetContentY;
    this._fleetVisibleH = fleetMaxH;
    this._fleetClipRect = { y: fleetContentY - CLIP_PAD, h: fleetMaxH + CLIP_PAD };
    ctx.save();
    ctx.beginPath();
    ctx.rect(bodyX, fleetContentY - CLIP_PAD, bodyW, fleetMaxH + CLIP_PAD);
    ctx.clip();
    y -= (this._fleetScrollY || 0);

    const activePid = colMgr?.activePlanetId;
    const activeCol = colMgr?.getColony(activePid);
    // Pobierz poziom stoczni (0 = brak) — deleguj do ColonyManager
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

    if (!hasExploration) { ctx.fillStyle = C.orange; ctx.fillText('🔒 Wymaga: Eksploracja', bodyX + PAD, y); y += LH; }
    else if (!hasShipyard) { ctx.fillStyle = C.orange; ctx.fillText('⚓ Stocznia: ❌ (zbuduj)', bodyX + PAD, y); y += LH; }
    else {
      const queues = colMgr?.getShipQueues(activePid) ?? [];
      const usedSlots = queues.length || 1;
      const speedBonus = Math.max(1, Math.floor(shipyardLevel / usedSlots));
      const bonusStr = speedBonus > 1 ? ` ×${speedBonus}⚡` : '';
      ctx.fillStyle = C.green; ctx.fillText(`⚓ Stocznia ✅ (${queues.length}/${shipyardLevel} slotów${bonusStr})`, bodyX + PAD, y); y += LH;
      for (const q of queues) {
        const shipDef = SHIPS[q.shipId];
        const effectiveTime = speedBonus > 1 ? (q.buildTime / speedBonus) : q.buildTime;
        const frac = effectiveTime > 0 ? q.progress / q.buildTime : 0;
        ctx.fillStyle = THEME.textPrimary; ctx.fillText(`Budowa: ${shipDef?.icon ?? '🚀'} ${shipDef?.namePL ?? q.shipId}`, bodyX + PAD, y); y += LH - 2;
        drawMiniBar(ctx, bodyX + PAD, y, fullW - PAD, 6, frac, THEME.borderActive); y += 8;
        const remaining = Math.max(0, effectiveTime - q.progress / speedBonus);
        ctx.fillStyle = C.text; ctx.fillText(`~${remaining.toFixed(1)} lat (×${speedBonus}⚡)`, bodyX + PAD, y); y += LH;
      }

      // ── Hangar — indywidualne statki ────────────────────────────────
      const vessels = vMgr?.getVesselsAt(activePid) ?? [];
      ctx.fillStyle = C.label; ctx.fillText(`Hangar (${vessels.length}):`, bodyX + PAD, y); y += LH - 2;

      if (vessels.length === 0) {
        ctx.fillStyle = C.dim; ctx.fillText('Brak statków — zbuduj w Stoczni', bodyX + PAD, y); y += LH - 2;
      } else {
        for (const v of vessels) {
          const sd = SHIPS[v.shipId];
          const rowH = 16;
          const rx = bodyX + PAD;
          const ry = y;
          const isSelected = this._selectedVesselId === v.id;

          ctx.fillStyle = isSelected ? 'rgba(40,80,120,0.5)' : 'rgba(15,25,40,0.4)';
          ctx.fillRect(rx, ry, fullW, rowH);
          if (isSelected) { ctx.strokeStyle = THEME.borderActive; ctx.strokeRect(rx, ry, fullW, rowH); }

          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          const statusColor = v.status === 'idle' ? THEME.successDim
            : v.status === 'refueling' ? THEME.yellow
            : v.status === 'on_mission' ? THEME.info
            : THEME.dangerDim;
          ctx.fillStyle = statusColor;
          ctx.fillText(`${sd?.icon ?? '🚀'} ${_truncate(v.name, 14)}`, rx + 2, ry + 11);

          // Pasek paliwa (mini)
          const barW = 40;
          const barX = rx + fullW - barW - 4;
          const barY = ry + 4;
          const barH = 6;
          const fuelFrac = v.fuel.max > 0 ? v.fuel.current / v.fuel.max : 0;
          const fuelColor = fuelFrac > 0.5 ? THEME.successDim : fuelFrac > 0.2 ? THEME.yellow : THEME.dangerDim;
          ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = fuelColor; ctx.fillRect(barX, barY, barW * fuelFrac, barH);
          ctx.strokeStyle = THEME.textLabel; ctx.strokeRect(barX, barY, barW, barH);
          ctx.font = '7px monospace'; ctx.fillStyle = C.label;
          ctx.fillText(`⛽${v.fuel.current.toFixed(1)}/${v.fuel.max}`, barX - 2, ry + 15);

          this._vesselRows.push({ x: rx, y: ry, w: fullW, h: rowH, vesselId: v.id });
          y += rowH + 1;
        }
      }
      y += 4;

      // ── Na orbicie (statki z tej kolonii orbitujące cele) ────────────
      const allVessels = vMgr?.getAllVessels() ?? [];
      const orbitingVessels = allVessels.filter(v => v.colonyId === activePid && v.position.state === 'orbiting');
      const inTransitVessels = allVessels.filter(v => v.colonyId === activePid && v.position.state === 'in_transit');

      if (orbitingVessels.length > 0) {
        ctx.fillStyle = C.yellow; ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillText(`Na orbicie (${orbitingVessels.length}):`, bodyX + PAD, y); y += LH - 2;
        for (const v of orbitingVessels) {
          const sd = SHIPS[v.shipId];
          const rowH = 16;
          const rx = bodyX + PAD; const ry = y;
          const isSelected = this._selectedVesselId === v.id;
          ctx.fillStyle = isSelected ? 'rgba(60,60,20,0.5)' : 'rgba(30,30,10,0.4)';
          ctx.fillRect(rx, ry, fullW, rowH);
          if (isSelected) { ctx.strokeStyle = C.yellow; ctx.strokeRect(rx, ry, fullW, rowH); }
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = C.yellow;
          const targetName = v.mission?.targetName ?? '?';
          ctx.fillText(`${sd?.icon ?? '🚀'} ${_truncate(v.name, 10)} ⊙ ${_truncate(targetName, 8)}`, rx + 2, ry + 11);
          this._vesselRows.push({ x: rx, y: ry, w: fullW, h: rowH, vesselId: v.id });
          y += rowH + 1;
        }
        y += 2;
      }

      if (inTransitVessels.length > 0) {
        ctx.fillStyle = THEME.info; ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillText(`W locie (${inTransitVessels.length}):`, bodyX + PAD, y); y += LH - 2;
        for (const v of inTransitVessels) {
          const sd = SHIPS[v.shipId];
          const rowH = 16;
          const rx = bodyX + PAD; const ry = y;
          const isSelected = this._selectedVesselId === v.id;
          ctx.fillStyle = isSelected ? 'rgba(20,40,80,0.6)' : 'rgba(15,25,50,0.4)';
          ctx.fillRect(rx, ry, fullW, rowH);
          if (isSelected) { ctx.strokeStyle = THEME.info; ctx.strokeRect(rx, ry, fullW, rowH); }
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.info;
          const targetName = v.mission?.targetName ?? '?';
          const phaseIcon = v.mission?.phase === 'returning' ? '↩' : '→';
          ctx.fillText(`${sd?.icon ?? '🚀'} ${_truncate(v.name, 10)} ${phaseIcon} ${_truncate(targetName, 8)}`, rx + 2, ry + 11);
          this._vesselRows.push({ x: rx, y: ry, w: fullW, h: rowH, vesselId: v.id });
          y += rowH + 1;
        }
        y += 2;
      }

      // ── Panel akcji wybranego statku ────────────────────────────────
      if (this._selectedVesselId && vMgr) {
        const sv = vMgr.getVessel(this._selectedVesselId);
        if (sv && (sv.position.state === 'docked' || sv.position.state === 'orbiting' || sv.position.state === 'in_transit')) {
          y = this._drawVesselActionPanel(ctx, sv, bodyX + PAD, y, fullW);
        }
      } else if (vessels.length > 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.dim;
        ctx.fillText('Wybierz statek aby rozpocząć misję', bodyX + PAD, y);
        y += LH;
      }

      y += 4;
      // ── Budowa statków ─────────────────────────────────────────────
      const canBuildAny = hasShipyard && queues.length < shipyardLevel;
      const inv = activeCol?.resourceSystem?.inventorySnapshot() ?? {};

      for (const ship of Object.values(SHIPS)) {
        const hasTech = !ship.requires || (tSys?.isResearched(ship.requires) ?? false);
        if (!hasTech) continue;

        const allCosts = { ...(ship.cost || {}), ...(ship.commodityCost || {}) };
        const canAfford = Object.entries(allCosts).every(([k, v]) => (inv[k] ?? 0) >= v);
        const canBuild = canBuildAny && canAfford;

        const btnH = 18;
        const bx = bodyX + PAD; const by = y;
        ctx.fillStyle = canBuild ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.6)';
        ctx.fillRect(bx, by, fullW, btnH);
        ctx.strokeStyle = canBuild ? THEME.borderActive : THEME.textLabel;
        ctx.strokeRect(bx, by, fullW, btnH);
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = canBuild ? THEME.textPrimary : THEME.textDim;
        ctx.textAlign = 'center';
        ctx.fillText(`Buduj ${ship.icon} ${ship.namePL}`, bx + fullW / 2, by + 12);
        ctx.textAlign = 'left';
        this._fleetBuildBtns.push({ x: bx, y: by, w: fullW, h: btnH, shipId: ship.id, enabled: canBuild });
        y += btnH + 2;

        // Koszt
        const costParts = [];
        for (const [resId, amt] of Object.entries(ship.cost || {})) {
          const have = Math.floor(inv[resId] ?? 0);
          const icon = RESOURCE_ICONS[resId] ?? resId;
          const name = ALL_RESOURCES[resId]?.namePL ?? resId;
          const ok = have >= amt;
          costParts.push({ text: `${icon}${name}:${have}/${amt}`, ok });
        }
        for (const [comId, amt] of Object.entries(ship.commodityCost || {})) {
          const have = Math.floor(inv[comId] ?? 0);
          const icon = COMMODITIES[comId]?.icon ?? '📦';
          const name = COMMODITY_SHORT[comId] ?? comId;
          const ok = have >= amt;
          costParts.push({ text: `${icon}${name}:${have}/${amt}`, ok });
        }
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        let cx = bodyX + PAD + 2;
        let costLineY = y;
        for (const part of costParts) {
          ctx.fillStyle = part.ok ? THEME.successDim : THEME.dangerDim;
          const tw = ctx.measureText(part.text).width;
          if (cx + tw > bodyX + PAD + fullW - 2) {
            costLineY += LH - 4; cx = bodyX + PAD + 2;
          }
          ctx.fillText(part.text, cx, costLineY + 9);
          cx += tw + 6;
        }
        y = costLineY + LH;

        ctx.fillStyle = C.dim;
        const effectiveBuildTime = speedBonus > 1 ? (ship.buildTime / speedBonus).toFixed(1) : ship.buildTime;
        ctx.fillText(`⏱${effectiveBuildTime} lat${speedBonus > 1 ? ` (×${speedBonus}⚡)` : ''}`, bodyX + PAD + 2, y + 8);
        y += LH;
      }
    }

    // ── Aktywne trasy handlowe ──────────────────────────────────
    const trMgr = window.KOSMOS?.tradeRouteManager;
    const trRoutes = trMgr?.getRoutes()?.filter(r => r.status === 'active' || r.status === 'paused') ?? [];
    if (trRoutes.length > 0) {
      y += 4;
      ctx.fillStyle = THEME.accent; ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillText(`🔄 Trasy handlowe (${trRoutes.length}):`, bodyX + PAD, y); y += LH - 2;
      for (const tr of trRoutes) {
        const vName = vMgr?.getVessel(tr.vesselId)?.name ?? '?';
        const statusIcon = tr.status === 'paused' ? '⏸' : '▶';
        const tripsStr = tr.tripsTotal ? `${tr.tripsCompleted}/${tr.tripsTotal}` : `${tr.tripsCompleted}/∞`;
        const rowH = 14; const rx = bodyX + PAD; const ry = y;
        ctx.fillStyle = 'rgba(20,40,30,0.4)'; ctx.fillRect(rx, ry, fullW, rowH);
        ctx.strokeStyle = THEME.textLabel; ctx.strokeRect(rx, ry, fullW, rowH);
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = tr.status === 'paused' ? THEME.textDim : THEME.mint;
        ctx.fillText(`${statusIcon} ${_truncate(vName, 8)} → ${_truncate(tr.targetBodyId, 8)} [${tripsStr}]`, rx + 2, ry + 10);
        // Przycisk pauza/wznów + usuń
        const delBtnW = 14;
        const delBtnX = rx + fullW - delBtnW - 1;
        ctx.fillStyle = 'rgba(80,20,20,0.6)'; ctx.fillRect(delBtnX, ry + 1, delBtnW, rowH - 2);
        ctx.fillStyle = THEME.dangerDim; ctx.textAlign = 'center';
        ctx.fillText('✕', delBtnX + delBtnW / 2, ry + 10);
        ctx.textAlign = 'left';
        this._vesselActionBtns.push({ x: delBtnX, y: ry, w: delBtnW, h: rowH, action: 'deleteTradeRoute', routeId: tr.id });
        y += rowH + 1;
      }
    }

    // === Koniec strefy scrollowalnej FLOTA ===
    this._fleetContentH = y - fleetContentY + (this._fleetScrollY || 0);
    // Clamp scroll — zabezpieczenie gdy content się skurczył
    const maxFleetScroll = Math.max(0, this._fleetContentH - fleetMaxH);
    if (this._fleetScrollY > maxFleetScroll) this._fleetScrollY = maxFleetScroll;
    ctx.restore();

    // Scrollbar wizualny (3px pasek po prawej)
    if (this._fleetContentH > fleetMaxH) {
      const sbH = Math.max(12, fleetMaxH * (fleetMaxH / this._fleetContentH));
      const maxScroll = this._fleetContentH - fleetMaxH;
      const scrollFrac = maxScroll > 0 ? (this._fleetScrollY || 0) / maxScroll : 0;
      const sbY = fleetContentY + scrollFrac * (fleetMaxH - sbH);
      ctx.fillStyle = 'rgba(100,140,180,0.3)';
      ctx.fillRect(bodyX + bodyW - 3, sbY, 3, sbH);
    }
  }

  // ── Katalog WSZYSTKICH ciał niebieskich (bez homePlanet) ──────────
  _getAllCatalogBodies() {
    const homePl = window.KOSMOS?.homePlanet;

    // Zbierz planety i planetoidy (ciała "główne")
    const planets = [];
    for (const t of ['planet', 'planetoid']) {
      for (const body of EntityManager.getByType(t)) {
        if (body === homePl) continue;
        planets.push({ body, explored: !!body.explored });
      }
    }
    // Sortuj główne ciała: explored najpierw, potem wg odległości orbitalnej
    planets.sort((a, b) => {
      if (a.explored !== b.explored) return a.explored ? -1 : 1;
      return (a.body.orbital?.a ?? 0) - (b.body.orbital?.a ?? 0);
    });

    // Zbierz księżyce pogrupowane wg parentPlanetId
    const moonsByParent = new Map();
    for (const moon of EntityManager.getByType('moon')) {
      const pid = moon.parentPlanetId;
      if (!moonsByParent.has(pid)) moonsByParent.set(pid, []);
      moonsByParent.get(pid).push({ body: moon, explored: !!moon.explored, isMoon: true });
    }
    // Sortuj księżyce każdej planety wg odległości orbitalnej
    for (const moons of moonsByParent.values()) {
      moons.sort((a, b) => (a.body.orbital?.a ?? 0) - (b.body.orbital?.a ?? 0));
    }

    // Buduj wynikową listę: planeta → jej księżyce → następna planeta...
    const result = [];
    // Księżyce homePlanet (bez samej planety)
    const homeMoons = homePl ? (moonsByParent.get(homePl.id) ?? []) : [];
    if (homeMoons.length > 0) {
      for (const m of homeMoons) result.push(m);
      moonsByParent.delete(homePl.id);
    }
    for (const entry of planets) {
      result.push(entry);
      const moons = moonsByParent.get(entry.body.id) ?? [];
      for (const m of moons) result.push(m);
    }
    return result;
  }

  // ── Rysowanie katalogu ciał niebieskich (prawa kolumna, scrollowalna) ──
  _drawBodyCatalog(ctx, bodyY, catalogX, catalogW, maxH) {
    const PAD = 8;
    const LH = 14;
    const ROW_H = 28; // 2 wiersze na ciało
    let cy = bodyY + 16;
    this._catalogRowRects = [];  // reset hit rects

    // Nagłówek
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.fillText('KATALOG CIAŁ', catalogX + PAD, cy);

    const entries = this._getAllCatalogBodies();
    const exploredCount = entries.filter(e => e.explored).length;
    ctx.fillStyle = C.label;
    ctx.textAlign = 'right';
    ctx.fillText(`${exploredCount}/${entries.length}`, catalogX + catalogW - PAD, cy);
    ctx.textAlign = 'left';
    cy += 4;

    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(catalogX + PAD, cy); ctx.lineTo(catalogX + catalogW - PAD, cy); ctx.stroke();
    cy += 6;

    if (entries.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.dim;
      ctx.fillText('Brak ciał w układzie', catalogX + PAD, cy);
      this._catalogContentH = 0;
      this._catalogVisibleH = 0;
      return;
    }

    // Strefa scrollowalna z clippingiem
    const catClipPad = 4; // zapas na ascenders
    const visibleH = maxH - (cy - bodyY);
    this._catalogVisibleH = visibleH;
    this._catalogContentH = entries.length * ROW_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(catalogX, cy - catClipPad, catalogW, visibleH + catClipPad);
    ctx.clip();

    const scrollY = this._catalogScrollY || 0;
    let ry = cy - scrollY;

    for (const entry of entries) {
      const { body, explored } = entry;
      const isMoon = !!entry.isMoon;
      // Wcięcie dla księżyców
      const indent = isMoon ? 12 : 0;

      // Pomiń elementy poza widocznym obszarem (optymalizacja)
      if (ry + ROW_H < cy - 2) { ry += ROW_H; continue; }
      if (ry > cy + visibleH + 2) break;

      const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
      const typeStr = body.planetType ?? body.type;
      const orbA = body.orbital?.a ?? 0;
      const distHome = DistanceUtils.orbitalFromHomeAU(body);

      // Prefix dla księżyców — wizualna gałąź drzewa
      const namePrefix = isMoon ? '└ ' : '';

      if (explored) {
        // ── Zbadane ciało — pełne dane ──
        const tempC = body.temperatureK ? Math.round(body.temperatureK - 273) : null;
        const tempStr = tempC !== null ? `${tempC > 0 ? '+' : ''}${tempC}°C` : '—';

        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = isMoon ? THEME.textLabel : THEME.textPrimary;
        ctx.fillText(`${namePrefix}${icon} ${_truncate(body.name, isMoon ? 10 : 12)}`, catalogX + PAD + indent, ry + 10);
        ctx.fillStyle = C.dim;
        ctx.fillText(typeStr, catalogX + PAD + 90 + indent, ry + 10);

        // Ikona atmosfery obok typu
        const atm = body.atmosphere || 'none';
        if (atm !== 'none') {
          const atmIcon = body.breathableAtmosphere ? '☁✓' : '☁';
          ctx.fillStyle = body.breathableAtmosphere ? THEME.success : THEME.info;
          ctx.fillText(atmIcon, catalogX + PAD + 125 + indent, ry + 10);
        }

        ctx.fillStyle = tempC !== null && tempC > -20 && tempC < 60 ? THEME.successDim : C.label;
        ctx.textAlign = 'right';
        ctx.fillText(tempStr, catalogX + catalogW - PAD - 3, ry + 10);
        ctx.textAlign = 'left';

        // Wiersz 2: masa + AU od gwiazdy + AU od gracza + złoża
        const mass = body.physics?.mass ?? 0;
        const massStr = mass > 0 ? `${mass.toFixed(1)}M⊕` : '—';
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.dim;
        ctx.fillText(`${massStr}  ☀${orbA.toFixed(1)}AU  🏠${distHome.toFixed(1)}AU`, catalogX + PAD + 2 + indent, ry + 22);

        // Złoża (top 3 wg richness)
        const deps = body.deposits ?? [];
        if (deps.length > 0) {
          const topDeps = [...deps]
            .filter(d => d.remaining > 0)
            .sort((a, b) => b.richness - a.richness)
            .slice(0, 3);
          let depStr = '';
          for (const d of topDeps) {
            const stars = d.richness >= 0.7 ? '★★★' : d.richness >= 0.4 ? '★★' : '★';
            depStr += `${d.resourceId}${stars} `;
          }
          ctx.fillStyle = THEME.yellow;
          ctx.textAlign = 'right';
          ctx.fillText(depStr.trim(), catalogX + catalogW - PAD - 3, ry + 22);
          ctx.textAlign = 'left';
        }
      } else {
        // ── Niezbadane ciało — ukryte dane ──
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`${namePrefix}${icon} ???`, catalogX + PAD + indent, ry + 10);
        ctx.fillStyle = THEME.textLabel;
        ctx.fillText(typeStr, catalogX + PAD + 90 + indent, ry + 10);
        ctx.textAlign = 'right';
        ctx.fillText('???', catalogX + catalogW - PAD - 3, ry + 10);
        ctx.textAlign = 'left';

        // Wiersz 2: odległość widoczna, masa/złoża ukryte
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textLabel;
        ctx.fillText(`???  ☀${orbA.toFixed(1)}AU  🏠${distHome.toFixed(1)}AU`, catalogX + PAD + 2 + indent, ry + 22);
      }

      // Hit rect (widoczne wiersze — po clipping pozycje to ry, nie screen-y)
      this._catalogRowRects.push({ x: catalogX, y: ry, w: catalogW, h: ROW_H, body, explored });

      ry += ROW_H;
    }

    ctx.restore();

    // Scrollbar wizualny (3px pasek po prawej)
    if (this._catalogContentH > visibleH) {
      const sbH = Math.max(12, visibleH * (visibleH / this._catalogContentH));
      const maxScroll = this._catalogContentH - visibleH;
      const sbY = cy + (scrollY / maxScroll) * (visibleH - sbH);
      ctx.fillStyle = 'rgba(100,140,180,0.3)';
      ctx.fillRect(catalogX + catalogW - 3, sbY, 3, sbH);
    }
  }

  // ── Panel akcji wybranego statku (misje) ───────────────────────────
  _drawVesselActionPanel(ctx, vessel, px, py, panelW) {
    const LH = 14;
    const sd = SHIPS[vessel.shipId];
    let y = py;

    // Separator + tło panelu akcji
    ctx.fillStyle = 'rgba(10,20,40,0.85)';
    ctx.fillRect(px, y, panelW, 4); // separator
    y += 6;

    // Nagłówek
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = vessel.position.state === 'orbiting' ? C.yellow : THEME.textPrimary;
    ctx.fillText(`${sd?.icon ?? '🚀'} ${vessel.name}`, px + 2, y);
    y += LH;

    // Info
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.text;
    const range = vessel.fuel.consumption > 0
      ? (vessel.fuel.current / vessel.fuel.consumption).toFixed(1) : '∞';
    ctx.fillText(`Typ: ${sd?.namePL ?? vessel.shipId}  Zasięg: ${range} AU`, px + 2, y);
    y += LH;
    ctx.fillText(`⛽ ${vessel.fuel.current.toFixed(1)}/${vessel.fuel.max} power_cells`, px + 2, y);
    y += LH;

    // Przyciski misji
    if (!this._vesselActionBtns) this._vesselActionBtns = [];
    this._vesselActionBtns = [];

    const exSys = window.KOSMOS?.expeditionSystem;
    const colMgr = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;

    // ── Statek w locie — przycisk zawrócenia ────────────────────────
    if (vessel.position.state === 'in_transit') {
      const phase = vessel.mission?.phase;
      const targetName = vessel.mission?.targetName ?? '?';

      if (phase === 'returning') {
        // Statek już wraca — info
        ctx.fillStyle = THEME.info;
        ctx.fillText(`↩ Wraca do bazy`, px + 2, y); y += LH;
      } else {
        // Statek leci do celu — można zawrócić
        ctx.fillStyle = THEME.info;
        ctx.fillText(`→ Cel: ${targetName}`, px + 2, y); y += LH;

        // Znajdź ekspedycję powiązaną ze statkiem
        let exp = this._expeditions.find(e => e.vesselId === vessel.id && e.status === 'en_route');
        if (!exp && exSys) {
          const active = exSys.getActive?.() ?? [];
          exp = active.find(e => e.vesselId === vessel.id && e.status === 'en_route');
        }

        if (exp) {
          const btnH = 15;
          ctx.fillStyle = 'rgba(60,50,10,0.7)'; ctx.fillRect(px, y, panelW, btnH);
          ctx.strokeStyle = C.yellow; ctx.strokeRect(px, y, panelW, btnH);
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = C.yellow; ctx.textAlign = 'center';
          ctx.fillText('↩ Zawróć do bazy', px + panelW / 2, y + 11);
          ctx.textAlign = 'left';
          this._vesselActionBtns.push({
            x: px, y, w: panelW, h: btnH,
            action: 'orbitReturn', expId: exp.id, vesselId: vessel.id,
          });
          y += btnH + 4;
        }
      }
      return y;
    }

    // ── Statek na orbicie — rozkazy zamiast listy misji ────────────
    if (vessel.position.state === 'orbiting') {
      // Znajdź powiązaną ekspedycję (UIManager cache → fallback do ExpeditionSystem)
      let orbExp = this._expeditions.find(e => e.vesselId === vessel.id && e.status === 'orbiting');
      if (!orbExp && exSys) {
        const active = exSys.getActive?.() ?? [];
        orbExp = active.find(e => e.vesselId === vessel.id && e.status === 'orbiting');
      }
      const targetName = orbExp?.targetName ?? vessel.mission?.targetName ?? '?';
      ctx.fillStyle = C.yellow;
      ctx.fillText(`⊙ Na orbicie: ${targetName}`, px + 2, y); y += LH;

      // Dwa przyciski: Powrót i Zmień cel
      const btnH = 15; const gap = 4;
      const halfW = Math.floor((panelW - gap) / 2);
      // Powrót
      const bRetX = px; const bRetY = y;
      ctx.fillStyle = 'rgba(60,50,10,0.7)'; ctx.fillRect(bRetX, bRetY, halfW, btnH);
      ctx.strokeStyle = C.yellow; ctx.strokeRect(bRetX, bRetY, halfW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.yellow; ctx.textAlign = 'center';
      ctx.fillText('↩ Powrót do bazy', bRetX + halfW / 2, bRetY + 11);
      ctx.textAlign = 'left';
      if (orbExp) {
        this._vesselActionBtns.push({
          x: bRetX, y: bRetY, w: halfW, h: btnH,
          action: 'orbitReturn', expId: orbExp.id, vesselId: vessel.id,
        });
      }
      // Zmień cel
      const bRedX = px + halfW + gap; const bRedY = y;
      const isRedirectActive = this._redirectTargetExpId === orbExp?.id;
      ctx.fillStyle = isRedirectActive ? 'rgba(20,50,80,0.8)' : 'rgba(10,30,60,0.7)';
      ctx.fillRect(bRedX, bRedY, halfW, btnH);
      ctx.strokeStyle = THEME.borderActive; ctx.strokeRect(bRedX, bRedY, halfW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'center';
      ctx.fillText('➡ Zmień cel', bRedX + halfW / 2, bRedY + 11);
      ctx.textAlign = 'left';
      if (orbExp) {
        this._vesselActionBtns.push({
          x: bRedX, y: bRedY, w: halfW, h: btnH,
          action: 'orbitRedirect', expId: orbExp.id, vesselId: vessel.id,
        });
      }
      y += btnH + 4;

      // Jeśli tryb wyboru celu → rysuj listę celów
      if (isRedirectActive && orbExp) {
        y = this._drawRedirectTargetPicker(ctx, orbExp, px, y, panelW);
      }

      return y;
    }

    // ── Statek w hangarze — normalna lista misji ─────────────────

    // Przycisk "Załaduj cargo" dla statków z ładownią
    const shipDef2 = SHIPS[vessel.shipId];
    if (shipDef2?.cargoCapacity > 0) {
      const cbH = 15;
      const cbW = panelW;
      ctx.fillStyle = 'rgba(30,60,40,0.6)';
      ctx.fillRect(px, y, cbW, cbH);
      ctx.strokeStyle = THEME.successDim;
      ctx.strokeRect(px, y, cbW, cbH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.successDim;
      ctx.textAlign = 'center';
      const cargoUsed = vessel.cargoUsed ?? 0;
      ctx.fillText(`📦 Cargo (${cargoUsed.toFixed(0)}/${shipDef2.cargoCapacity}t)`, px + cbW / 2, y + 10);
      ctx.textAlign = 'left';
      this._vesselActionBtns.push({
        x: px, y: y, w: cbW, h: cbH,
        action: 'openCargoModal', vesselId: vessel.id,
      });
      y += cbH + 4;
    }

    // Przycisk "Rozformuj" — zwrot surowców i POP
    {
      const dbH = 15;
      ctx.fillStyle = 'rgba(60,20,20,0.6)';
      ctx.fillRect(px, y, panelW, dbH);
      ctx.strokeStyle = THEME.danger ?? '#c44';
      ctx.strokeRect(px, y, panelW, dbH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger ?? '#c44';
      ctx.textAlign = 'center';
      ctx.fillText('🗑 Rozformuj (100% zwrot)', px + panelW / 2, y + 10);
      ctx.textAlign = 'left';
      this._vesselActionBtns.push({
        x: px, y, w: panelW, h: dbH,
        action: 'disbandVessel', vesselId: vessel.id,
      });
      y += dbH + 4;
    }

    // Określ dostępne typy misji wg typu statku
    const missionTypes = [];
    if (vessel.shipId === 'science_vessel') {
      missionTypes.push({ type: 'recon', label: '🔭 Rozpoznanie', icon: '🔭' });
    }
    if (vessel.shipId === 'cargo_ship') {
      missionTypes.push({ type: 'transport', label: '📦 Transport', icon: '📦' });
      missionTypes.push({ type: 'tradeRoute', label: '🔄 Trasa', icon: '🔄' });
    }
    if (vessel.shipId === 'colony_ship') {
      missionTypes.push({ type: 'colony', label: '🚢 Kolonizacja', icon: '🚢' });
    }

    const btnH = 15;
    const gap = 2;
    const bw = Math.floor((panelW - gap * (missionTypes.length - 1)) / missionTypes.length);

    for (let i = 0; i < missionTypes.length; i++) {
      const mt = missionTypes[i];
      const bx = px + i * (bw + gap);
      const by = y;
      const isActive = this._vesselMissionType === mt.type;
      ctx.fillStyle = isActive ? 'rgba(40,80,120,0.8)' : 'rgba(20,40,60,0.6)';
      ctx.fillRect(bx, by, bw, btnH);
      ctx.strokeStyle = isActive ? THEME.borderActive : THEME.textLabel;
      ctx.strokeRect(bx, by, bw, btnH);
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = isActive ? THEME.textPrimary : THEME.textSecondary;
      ctx.textAlign = 'center';
      ctx.fillText(mt.label, bx + bw / 2, by + 10);
      ctx.textAlign = 'left';
      this._vesselActionBtns.push({
        x: bx, y: by, w: bw, h: btnH,
        action: 'missionType', missionType: mt.type, vesselId: vessel.id,
      });
    }
    y += btnH + 10;

    // Lista celów (jeśli wybrany typ misji)
    if (this._vesselMissionType) {
      y = this._drawMissionTargets(ctx, vessel, this._vesselMissionType, px, y, panelW);
    }

    return y;
  }

  // ── Lista celów misji dla wybranego statku ─────────────────────────
  _drawMissionTargets(ctx, vessel, missionType, px, py, panelW) {
    const LH = 13;
    let y = py;
    const colMgr = window.KOSMOS?.colonyManager;

    // Recon — przyciski nearest / full_system + lista ciał do rozpoznania
    if (missionType === 'recon') {
      const exSys = window.KOSMOS?.expeditionSystem;
      const unexplored = exSys?.getUnexploredCount() ?? { total: 0 };
      if (unexplored.total === 0) {
        ctx.fillStyle = C.green; ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillText('✅ Układ w pełni zbadany', px + 2, y); y += LH;
      } else {
        const btnH = 15; const halfW = Math.floor((panelW - 4) / 2);
        for (const scope of ['nearest', 'full_system']) {
          const label = scope === 'nearest' ? '🔭 Najbliższe' : '☀ Cały układ';
          const bx = scope === 'nearest' ? px : px + halfW + 4;
          const by = y;
          ctx.fillStyle = 'rgba(20,40,60,0.8)'; ctx.fillRect(bx, by, halfW, btnH);
          ctx.strokeStyle = THEME.borderActive; ctx.strokeRect(bx, by, halfW, btnH);
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'center';
          ctx.fillText(label, bx + halfW / 2, by + 10); ctx.textAlign = 'left';
          this._vesselActionBtns.push({
            x: bx, y: by, w: halfW, h: btnH,
            action: 'launchRecon', scope, vesselId: vessel.id,
          });
        }
        y += btnH + 4;

        // Lista konkretnych ciał do rozpoznania (explored + unexplored)
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.label; ctx.fillText('Lub wybierz konkretne ciało:', px + 2, y); y += LH;

        const reconTargets = this._getReconTargets(vessel);
        for (const t of reconTargets) {
          const btnH2 = 14;
          const bx = px; const by = y;
          const inRange = t.inRange;
          const isExplored = t.explored;
          ctx.fillStyle = isExplored ? 'rgba(15,25,15,0.4)'
            : inRange ? 'rgba(20,40,60,0.6)' : 'rgba(20,15,15,0.5)';
          ctx.fillRect(bx, by, panelW, btnH2);
          ctx.strokeStyle = isExplored ? THEME.successDim
            : inRange ? THEME.textLabel : THEME.dangerDim;
          ctx.strokeRect(bx, by, panelW, btnH2);
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = isExplored ? THEME.successDim
            : inRange ? THEME.textPrimary : THEME.textDim;
          const distStr = t.dist < 0.1 ? t.dist.toFixed(3) : t.dist.toFixed(1);
          const fuelCost = (t.dist * 2 * vessel.fuel.consumption).toFixed(1); // ×2: tam + powrót
          const shipSpeed = SHIPS[vessel.shipId]?.speedAU ?? 1.0;
          const eta = t.dist / shipSpeed;
          const etaStr = eta < 0.05 ? `${Math.round(eta * 365)}d` : `${eta.toFixed(1)}y`;
          const nameStr = isExplored ? `✓${_truncate(t.name, 10)}` : `${t.icon} ???`;
          ctx.fillText(`${nameStr} ${distStr}AU ⛽${fuelCost} ⏱${etaStr}`, bx + 2, by + 10);
          // Tylko niezbadane ciała + w zasięgu → klikalny przycisk
          if (!isExplored && inRange) {
            this._vesselActionBtns.push({
              x: bx, y: by, w: panelW, h: btnH2,
              action: 'launchRecon', scope: t.id, vesselId: vessel.id,
            });
          }
          y += btnH2 + 1;
        }
      }
      return y;
    }

    // Trasa handlowa — lista explored bodies z ≥2 wizytami
    if (missionType === 'tradeRoute') {
      const exSys = window.KOSMOS?.expeditionSystem;
      const targets = this._getMissionTargets(vessel, 'transport');
      // Filtruj: tylko ciała z ≥2 wizytami
      const tradeTargets = targets.filter(t => (exSys?.getVisitCount(t.id) ?? 0) >= 2);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.label; ctx.fillText('Cel trasy handlowej (≥2 wizyty):', px + 2, y); y += LH;
      if (tradeTargets.length === 0) {
        ctx.fillStyle = C.dim; ctx.fillText('Brak celów (wymagane ≥2 wizyty)', px + 2, y);
        y += LH;
      } else {
        for (const t of tradeTargets) {
          const btnH = 14;
          const bx = px; const by = y;
          const inRange = t.inRange;
          ctx.fillStyle = inRange ? 'rgba(20,40,60,0.6)' : 'rgba(20,15,15,0.5)';
          ctx.fillRect(bx, by, panelW, btnH);
          ctx.strokeStyle = inRange ? THEME.textLabel : THEME.dangerDim; ctx.strokeRect(bx, by, panelW, btnH);
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = inRange ? THEME.textPrimary : THEME.textDim;
          const visits = exSys?.getVisitCount(t.id) ?? 0;
          ctx.fillText(`🔄 → ${_truncate(t.name, 12)} (${visits}×)`, bx + 2, by + 10);
          if (inRange) {
            this._vesselActionBtns.push({
              x: bx, y: by, w: panelW, h: btnH,
              action: 'setupTradeRoute', targetId: t.id, targetName: t.name, vesselId: vessel.id,
            });
          }
          y += btnH + 1;
        }
      }
      return y;
    }

    // Transport — lista wszystkich explored bodies
    if (missionType === 'transport') {
      const targets = this._getMissionTargets(vessel, 'transport');
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.label; ctx.fillText('Cel transportu:', px + 2, y); y += LH;
      if (targets.length === 0) {
        ctx.fillStyle = C.dim;
        ctx.fillText('Brak zbadanych celów — wyślij', px + 2, y); y += LH;
        ctx.fillText('najpierw misję rozpoznawczą 🔭', px + 2, y);
        y += LH;
      } else {
        for (const t of targets) {
          const btnH = 14;
          const bx = px; const by = y;
          const inRange = t.inRange;
          const hasColony = !!colMgr?.hasColony(t.id);
          ctx.fillStyle = inRange ? 'rgba(20,40,60,0.6)' : 'rgba(20,15,15,0.5)';
          ctx.fillRect(bx, by, panelW, btnH);
          ctx.strokeStyle = inRange ? THEME.textLabel : THEME.dangerDim; ctx.strokeRect(bx, by, panelW, btnH);
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = inRange ? (hasColony ? THEME.textPrimary : THEME.textSecondary) : THEME.textDim;
          const distStr = t.dist < 0.1 ? t.dist.toFixed(3) : t.dist.toFixed(1);
          const fuelCost = (t.dist * vessel.fuel.consumption).toFixed(1);
          const colIcon = hasColony ? '🏠' : '📦';
          ctx.fillText(`${colIcon} → ${_truncate(t.name, 10)} ${distStr}AU ⛽${fuelCost}`, bx + 2, by + 10);
          if (inRange) {
            this._vesselActionBtns.push({
              x: bx, y: by, w: panelW, h: btnH,
              action: 'launchTransport', targetId: t.id, vesselId: vessel.id,
            });
          }
          y += btnH + 1;
        }
      }
      return y;
    }

    // Mining / Scientific / Colony — lista explored bodies w zasięgu
    const targets = this._getMissionTargets(vessel, missionType);
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label; ctx.fillText('Wybierz cel:', px + 2, y); y += LH;

    if (targets.length === 0) {
      ctx.fillStyle = C.dim; ctx.fillText('Brak dostępnych celów', px + 2, y);
      y += LH;
    } else {
      for (const t of targets) {
        const btnH = 14;
        const bx = px; const by = y;
        const inRange = t.inRange;
        ctx.fillStyle = inRange ? 'rgba(20,40,60,0.6)' : 'rgba(20,15,15,0.5)';
        ctx.fillRect(bx, by, panelW, btnH);
        ctx.strokeStyle = inRange ? THEME.textLabel : THEME.dangerDim; ctx.strokeRect(bx, by, panelW, btnH);
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = inRange ? THEME.textPrimary : THEME.textDim;
        const distStr = t.dist < 0.1 ? t.dist.toFixed(3) : t.dist.toFixed(1);
        const fuelCost = (t.dist * vessel.fuel.consumption).toFixed(1);
        const shipSpeed = SHIPS[vessel.shipId]?.speedAU ?? 1.0;
        const eta = t.dist / shipSpeed;
        const etaStr = eta < 0.05 ? `${Math.round(eta * 365)}d` : `${eta.toFixed(1)}y`;
        ctx.fillText(`${t.icon} ${_truncate(t.name, 12)} ${distStr}AU ⛽${fuelCost} ⏱${etaStr}`, bx + 2, by + 10);
        if (inRange) {
          this._vesselActionBtns.push({
            x: bx, y: by, w: panelW, h: btnH,
            action: 'launchMission', missionType, targetId: t.id, vesselId: vessel.id,
          });
        }
        y += btnH + 1;
      }
    }
    return y;
  }

  // ── Pobierz cele misji dla statku ─────────────────────────────────
  _getMissionTargets(vessel, missionType) {
    const homePl = window.KOSMOS?.homePlanet;
    const colMgr = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId ?? homePl?.id;
    const targets = [];
    const TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];

    for (const t of TYPES) {
      for (const body of EntityManager.getByType(t)) {
        // Wyklucz aktywną kolonię (źródło) — nie homePlanet ogólnie
        if (body.id === activePid) continue;
        if (!body.explored) continue;

        // Filtruj wg typu misji
        if (missionType === 'colony') {
          if (colMgr?.hasColony(body.id)) continue;
          if (body.type === 'planet' && body.planetType !== 'rocky' && body.planetType !== 'ice') continue;
        }

        // Euclidean — spójne z ExpeditionSystem._calcDistance()
        const dist = Math.max(0.001, DistanceUtils.euclideanAU(homePl, body));
        const fuelNeeded = dist * vessel.fuel.consumption;
        const inRange = vessel.fuel.current >= fuelNeeded;
        const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙'
          : body.type === 'planetoid' ? '🪨' : body.type === 'comet' ? '☄' : '🪨';
        targets.push({ id: body.id, name: body.name, dist, inRange, icon });
      }
    }

    targets.sort((a, b) => a.dist - b.dist);
    return targets;
  }

  // ── Pobierz cele rozpoznania (WSZYSTKIE ciała, explored + unexplored) ──
  _getReconTargets(vessel) {
    const homePl = window.KOSMOS?.homePlanet;
    const targets = [];
    const TYPES = ['planet', 'moon', 'planetoid'];

    for (const t of TYPES) {
      for (const body of EntityManager.getByType(t)) {
        if (body === homePl) continue;
        // Euclidean — spójne z ExpeditionSystem._calcDistance()
        const dist = Math.max(0.001, DistanceUtils.euclideanAU(homePl, body));
        // Paliwo na lot + powrót (2× dystans)
        const fuelNeeded = dist * 2 * vessel.fuel.consumption;
        const inRange = vessel.fuel.current >= fuelNeeded;
        const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
        targets.push({
          id: body.id, name: body.name, dist, inRange, icon,
          explored: !!body.explored,
        });
      }
    }

    // Niezbadane najpierw, potem wg dystansu
    targets.sort((a, b) => {
      if (a.explored !== b.explored) return a.explored ? 1 : -1;
      return a.dist - b.dist;
    });
    return targets;
  }

  // ── Inline target picker dla redirect z orbity ────────────────────
  _drawRedirectTargetPicker(ctx, exp, px, py, panelW) {
    const LH = 13;
    let y = py;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText(`Nowy cel dla: ${_truncate(exp.targetName ?? '?', 12)}`, px, y); y += LH;

    // Pobierz vessel
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = exp.vesselId ? vMgr?.getVessel(exp.vesselId) : null;
    if (!vessel) {
      ctx.fillStyle = C.dim; ctx.fillText('Statek niedostępny', px, y);
      return y + LH;
    }

    // Oblicz dystanse od bieżącej pozycji (orbiting body)
    const currentBody = this._findTargetBody(exp.targetId);
    const homePl = window.KOSMOS?.homePlanet;
    const TYPES = ['planet', 'moon', 'planetoid'];
    const targets = [];

    // Dodaj kolonie/outposty gracza jako cele (🏠/🏗)
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr) {
      for (const col of colMgr.getAllColonies()) {
        if (col.planetId === exp.targetId) continue; // pomiń bieżący cel
        const colBody = this._findTargetBody(col.planetId);
        if (!colBody) continue;
        const fromEntity = currentBody ?? homePl;
        if (!fromEntity) continue;
        const dist = Math.max(0.001, DistanceUtils.euclideanAU(fromEntity, colBody));
        const fuelNeeded = dist * vessel.fuel.consumption;
        const inRange = vessel.fuel.current >= fuelNeeded;
        const icon = col.isOutpost ? '🏗' : '🏠';
        targets.push({ id: col.planetId, name: col.name ?? colBody.name, dist, inRange, icon, explored: true, isColony: true });
      }
    }

    for (const t of TYPES) {
      for (const body of EntityManager.getByType(t)) {
        if (body.id === exp.targetId) continue;
        // Pomiń ciała, które już dodano jako kolonie
        if (targets.some(tg => tg.id === body.id)) continue;
        const fromEntity = currentBody ?? homePl;
        if (!fromEntity) continue;
        const dist = Math.max(0.001, DistanceUtils.euclideanAU(fromEntity, body));
        const fuelNeeded = dist * vessel.fuel.consumption;
        const inRange = vessel.fuel.current >= fuelNeeded;
        const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
        targets.push({ id: body.id, name: body.name, dist, inRange, icon, explored: !!body.explored });
      }
    }

    // Kolonie gracza na górze, potem reszta — wewnątrz grup sortuj po dystansie
    targets.sort((a, b) => (b.isColony ? 1 : 0) - (a.isColony ? 1 : 0) || a.dist - b.dist);

    if (!this._redirectTargetBtns) this._redirectTargetBtns = [];
    this._redirectTargetBtns = [];

    for (const t of targets) {
      const btnH = 13;
      const bx = px; const by = y;
      ctx.fillStyle = t.inRange ? 'rgba(20,40,60,0.6)' : 'rgba(20,15,15,0.5)';
      ctx.fillRect(bx, by, panelW, btnH);
      ctx.strokeStyle = t.inRange ? THEME.textLabel : THEME.dangerDim; ctx.strokeRect(bx, by, panelW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = t.inRange ? THEME.textPrimary : THEME.textDim;
      const distStr = t.dist < 0.1 ? t.dist.toFixed(3) : t.dist.toFixed(1);
      const fuelCost = (t.dist * vessel.fuel.consumption).toFixed(1);
      const nameStr = t.explored ? `${t.icon} ${_truncate(t.name, 8)}` : `${t.icon} ???`;
      ctx.fillText(`${nameStr} ${distStr}AU ⛽${fuelCost}`, bx + 2, by + 9);
      if (t.inRange) {
        this._redirectTargetBtns.push({
          x: bx, y: by, w: panelW, h: btnH, targetId: t.id, expId: exp.id,
        });
      }
      y += btnH + 1;
    }

    return y;
  }

  // Helper: znajdź ciało po id (dla redirect target picker)
  _findTargetBody(targetId) {
    const TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];
    for (const t of TYPES) {
      for (const body of EntityManager.getByType(t)) {
        if (body.id === targetId) return body;
      }
    }
    return null;
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
  _drawConfirmDialog() {
    const ctx = this.ctx;
    const DW  = 300, DH  = 90;
    const DX  = W / 2 - DW / 2, DY  = H / 2 - DH / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    this._roundRect(ctx, DX, DY, DW, DH, 4, THEME.bgSecondary, 1.0, THEME.borderActive);

    ctx.font = `${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.bright; ctx.textAlign = 'center';
    ctx.fillText('Rozpocząć nową grę?', W / 2, DY + 22);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.text;
    ctx.fillText('Aktualny postęp zostanie utracony.', W / 2, DY + 40);
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

    ctx.fillStyle = 'rgba(10,4,4,0.95)';
    ctx.fillRect(DX, DY, DW, DH);
    ctx.strokeStyle = THEME.danger;
    ctx.lineWidth = 2;
    ctx.strokeRect(DX, DY, DW, DH);

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeTitle + 4}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.danger;
    ctx.textAlign = 'center';
    ctx.fillText('CYWILIZACJA ZNISZCZONA', W / 2, DY + 36);

    // Opis
    const reasonText = d.reason === 'collision'
      ? `Kolizja planetarna zniszczyła planetę ${d.planetName}.`
      : d.reason === 'ejected'
        ? `Planeta ${d.planetName} została wyrzucona z układu.`
        : `Życie na planecie ${d.planetName} wymarło.`;
    ctx.font = `${THEME.fontSizeNormal + 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(reasonText, W / 2, DY + 64);
    ctx.fillText('Twoja cywilizacja nie przetrwała.', W / 2, DY + 84);

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
    const { x: bodyX, y: bodyY, w: bodyW, h: bodyH } = this._civPanelBodyRect();

    // Sidebar ikona
    const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                   + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;
    if (x <= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + sidebarH) {
      for (let i = 0; i < CIV_TABS.length; i++) {
        const btnY = CIV_PANEL_Y + CIV_SIDEBAR_PAD + i * (CIV_SIDEBAR_BTN + CIV_SIDEBAR_GAP);
        if (y >= btnY && y <= btnY + CIV_SIDEBAR_BTN) {
          return { type: 'sidebar_tab', data: { label: CIV_TABS[i].label } };
        }
      }
      return null;
    }

    if (!this._civPanelTab) return null;
    if (x < bodyX || y < bodyY || y > bodyY + bodyH) return null;
    if (this._civPanelTab === 'economy')     return this._detectFactoryTooltip(x, y);
    if (this._civPanelTab === 'buildings')  return this._detectBuildingTooltip(x, y, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'tech')       return this._detectTechTooltip(x, y, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'expeditions') return this._detectCatalogTooltip(x, y);
    return null;
  }

  _detectFactoryTooltip(x, y) {
    const allocs = this._factoryData?.allocations
      ?? window.KOSMOS?.factorySystem?.getAllocations?.() ?? [];
    for (const btn of this._factoryBtns) {
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

  _detectBuildingTooltip(x, y, bodyY, bodyX, bodyW) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!bSys) return null;
    const PAD = 14, LH = 13;
    const firstRowY = bodyY + 30;
    if (x < bodyX + PAD || x > bodyX + bodyW - PAD) return null;
    if (y < firstRowY || y > firstRowY + 9 * LH) return null;
    const rowIndex = Math.floor((y - firstRowY) / LH);
    const { groups } = getBuildingGroups(bSys);
    const groupArr = [...groups.values()];
    if (rowIndex < 0 || rowIndex >= groupArr.length) return null;
    return { type: 'building', data: { building: groupArr[rowIndex].building, group: groupArr[rowIndex] } };
  }

  _detectTechTooltip(x, y, bodyY, bodyX, bodyW) {
    const tSys = window.KOSMOS?.techSystem;
    if (!tSys) return null;
    const branches = Object.entries(TECH_BRANCHES);
    const colW = Math.floor(bodyW / branches.length);
    const PAD = 8;
    for (let bi = 0; bi < branches.length; bi++) {
      const [branchId] = branches[bi];
      const bx = bodyX + bi * colW + PAD;
      if (x < bx || x > bx + colW - PAD * 2) continue;
      let by = bodyY + 30;
      const techs = Object.values(TECHS).filter(t => t.branch === branchId).sort((a, b) => a.tier - b.tier);
      for (const tech of techs) {
        const rowH = 26;
        if (y >= by - 10 && y < by + rowH - 10) {
          const researched = tSys.isResearched(tech.id);
          const available  = !researched && tech.requires.every(r => tSys.isResearched(r));
          return { type: 'tech', data: { tech, researched, available } };
        }
        by += rowH;
      }
    }
    return null;
  }

  _detectCatalogTooltip(x, y) {
    for (const row of (this._catalogRowRects ?? [])) {
      if (x >= row.x && x <= row.x + row.w && y >= row.y && y <= row.y + row.h) {
        return { type: 'catalogBody', data: { body: row.body, explored: row.explored } };
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

    const tempC = body.temperatureK ? Math.round(body.temperatureK - 273) : null;
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
    const atmLabels = { dense: 'Gęsta', thin: 'Cienka', none: 'Brak' };
    let atmText = atmLabels[atm] || atm;
    if (body.breathableAtmosphere) atmText += ' — zdatna do życia ✅';
    const atmColor = atm === 'none' ? C.dim : body.breathableAtmosphere ? C.green : C.text;
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
      case 'moraleBonus': return `+${fx.amount} morale/rok`;
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
    const result = hitTestSidebar(x, y, sy);
    if (result) {
      if (result === 'sidebar') return true;
      // Toggle zakładki
      this._civPanelTab = (this._civPanelTab === result) ? null : result;
      this._catalogScrollY = 0; // reset scrolla katalogu przy zmianie zakładki
      this._fleetScrollY = 0;   // reset scrolla floty
      return true;
    }

    if (this._civPanelTab) {
      const { x: bx, y: by, w: bw, h: bh } = this._civPanelBodyRect();
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        if (this._civPanelTab === 'economy') {
          handleFactoryClick(x, y, this._factoryBtns);
        } else if (this._civPanelTab === 'tech') {
          handleTechClick(x, y, by, bx, bw);
        } else if (this._civPanelTab === 'expeditions') {
          this._handleExpeditionsClick(x, y);
        }
        return true;
      }
    }
    return false;
  }

  _handleExpeditionsClick(x, y) {
    // Orbit return buttons — przycisk "Powrót" dla orbiting (górna strefa, bez scrollu)
    for (const btn of (this._orbitReturnBtns ?? [])) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        EventBus.emit('expedition:orderReturn', { expeditionId: btn.expId });
        this._redirectTargetExpId = null;
        return;
      }
    }
    // Orbit redirect buttons — przycisk "Cel" w AKTYWNE MISJE
    for (const btn of (this._orbitRedirectBtns ?? [])) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        // Toggle tryb wyboru celu
        this._redirectTargetExpId = this._redirectTargetExpId === btn.expId ? null : btn.expId;
        return;
      }
    }
    // Redirect target picker — inline lista celów (górna strefa, bez scrollu)
    for (const btn of (this._redirectTargetBtns ?? [])) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        EventBus.emit('expedition:orderRedirect', { expeditionId: btn.expId, targetId: btn.targetId });
        this._redirectTargetExpId = null;
        return;
      }
    }
    // Elementy sekcji FLOTA — tylko gdy klik w widocznym obszarze scrollu
    const fc = this._fleetClipRect;
    const inFleetArea = fc && fc.h > 0 && y >= fc.y && y <= fc.y + fc.h;
    if (inFleetArea) {
      // Vessel action buttons (typ misji, cel, launch)
      for (const btn of (this._vesselActionBtns ?? [])) {
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
          this._handleVesselAction(btn);
          return;
        }
      }
      // Vessel row click → select/deselect
      for (const vr of (this._vesselRows ?? [])) {
        if (x >= vr.x && x <= vr.x + vr.w && y >= vr.y && y <= vr.y + vr.h) {
          if (this._selectedVesselId === vr.vesselId) {
            this._selectedVesselId = null; // toggle off
            this._vesselMissionType = null;
          } else {
            this._selectedVesselId = vr.vesselId;
            this._vesselMissionType = null;
          }
          return;
        }
      }
      // Fleet build buttons
      for (const fb of (this._fleetBuildBtns ?? [])) {
        if (fb.enabled && x >= fb.x && x <= fb.x + fb.w && y >= fb.y && y <= fb.y + fb.h) {
          EventBus.emit('fleet:buildRequest', { shipId: fb.shipId });
          return;
        }
      }
    }
    // Klik w wiersz katalogu ciał → focus kamery na ciało
    for (const row of (this._catalogRowRects ?? [])) {
      if (x >= row.x && x <= row.x + row.w && y >= row.y && y <= row.y + row.h) {
        EventBus.emit('body:selected', { entity: row.body });
        // Zamknij globus jeśli otwarty
        if (window.KOSMOS?.planetGlobeOpen) EventBus.emit('planet:closeGlobe');
        return;
      }
    }
  }

  // Obsługa kliknięcia w panel akcji statku
  _handleVesselAction(btn) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;

    // Rozkaz powrotu z orbity (z panelu floty)
    if (btn.action === 'orbitReturn') {
      EventBus.emit('expedition:orderReturn', { expeditionId: btn.expId });
      this._selectedVesselId = null;
      this._redirectTargetExpId = null;
      return;
    }

    // Toggle trybu wyboru celu redirect (z panelu floty)
    if (btn.action === 'orbitRedirect') {
      this._redirectTargetExpId = this._redirectTargetExpId === btn.expId ? null : btn.expId;
      return;
    }

    if (btn.action === 'openCargoModal') {
      // Otwórz modal załadunku cargo (orbiting → kolonia przy której orbituje)
      const vessel = vMgr.getVessel(btn.vesselId);
      const colMgr = window.KOSMOS?.colonyManager;
      const orbitColonyId = (vessel?.position?.state === 'orbiting')
        ? vessel.position.dockedAt
        : vessel.colonyId;
      const colony = colMgr?.getColony(orbitColonyId);
      if (vessel && colony) {
        showCargoLoadModal(vessel, colony);
      }
      return;
    }

    if (btn.action === 'disbandVessel') {
      EventBus.emit('fleet:disbandRequest', { vesselId: btn.vesselId });
      this._selectedVesselId = null;
      this._vesselMissionType = null;
      return;
    }

    if (btn.action === 'missionType') {
      // Zmień wybrany typ misji
      this._vesselMissionType = this._vesselMissionType === btn.missionType ? null : btn.missionType;
      return;
    }

    if (btn.action === 'launchRecon') {
      // Recon z konkretnego statku — wyślij żądanie
      EventBus.emit('expedition:sendRequest', {
        type: 'recon', targetId: btn.scope, vesselId: btn.vesselId,
      });
      this._selectedVesselId = null;
      this._vesselMissionType = null;
      return;
    }

    if (btn.action === 'setupTradeRoute') {
      // Otwórz modal konfiguracji trasy handlowej
      const colMgr = window.KOSMOS?.colonyManager;
      const activePid = colMgr?.activePlanetId;
      const sourceCol = colMgr?.getColony(activePid);
      if (sourceCol) {
        showTradeRouteModal(sourceCol, btn.targetId, btn.targetName).then(result => {
          if (result) {
            EventBus.emit('tradeRoute:create', {
              vesselId: btn.vesselId,
              sourceColonyId: activePid,
              targetBodyId: btn.targetId,
              cargo: result.cargo,
              tripsTotal: result.trips,
            });
          }
        });
      }
      this._selectedVesselId = null;
      this._vesselMissionType = null;
      return;
    }

    if (btn.action === 'launchTransport') {
      const colMgr = window.KOSMOS?.colonyManager;
      const activePid = colMgr?.activePlanetId;
      const sourceCol = colMgr?.getColony(activePid);
      const vMgr = window.KOSMOS?.vesselManager;
      const vessel = vMgr?.getVessel(btn.vesselId);

      // Jeśli statek ma już załadowane cargo → wyślij bezpośrednio (bez modala)
      const existingCargo = vessel?.cargo ?? {};
      const hasExistingCargo = Object.values(existingCargo).some(qty => qty > 0);

      if (hasExistingCargo) {
        EventBus.emit('expedition:transportRequest', {
          targetId: btn.targetId, cargo: { ...existingCargo }, vesselId: btn.vesselId,
          cargoPreloaded: true,
        });
        this._selectedVesselId = null;
        this._vesselMissionType = null;
        return;
      }

      // Brak cargo → otwórz modal transportu (jak dotychczas)
      if (sourceCol) {
        const targetCol = colMgr?.getColony(btn.targetId);
        const targetsList = targetCol ? [targetCol] : [];
        showTransportModal(sourceCol, targetsList, btn.targetId).then(result => {
          if (result) {
            EventBus.emit('expedition:transportRequest', {
              targetId: btn.targetId, cargo: result.cargo, vesselId: btn.vesselId,
            });
          }
        });
      }
      this._selectedVesselId = null;
      this._vesselMissionType = null;
      return;
    }

    if (btn.action === 'deleteTradeRoute') {
      EventBus.emit('tradeRoute:delete', { routeId: btn.routeId });
      return;
    }

    if (btn.action === 'launchMission') {
      // Mining / Scientific / Colony z konkretnym statkiem
      EventBus.emit('expedition:sendRequest', {
        type: btn.missionType, targetId: btn.targetId, vesselId: btn.vesselId,
      });
      this._selectedVesselId = null;
      this._vesselMissionType = null;
      return;
    }
  }

  _hitTestConfirm(x, y) {
    const DW = 300, DH = 90;
    const DX = W / 2 - DW / 2, DY = H / 2 - DH / 2;
    if (x < DX || x > DX + DW || y < DY || y > DY + DH) return false;
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
    // CivPanel sidebar
    if (window.KOSMOS?.civMode) {
      const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                     + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;
      if (x <= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + sidebarH) return 'civpanel';
      if (this._civPanelTab) {
        const bodyH = (this._civPanelTab === 'expeditions' || this._civPanelTab === 'economy')
          ? CIV_EXPEDITIONS_H : CIV_PANEL_BODY_H;
        if (x >= CIV_SIDEBAR_W && y >= CIV_PANEL_Y && y <= CIV_PANEL_Y + bodyH) return 'civpanel';
      }
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
