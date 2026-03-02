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
  get collision_destroy()  { return '#ff6644'; },
  get collision_redirect() { return '#ff9933'; },
  get ejection()           { return THEME.purple; },
  get new_planet()         { return THEME.accent; },
  get life_good()          { return THEME.success; },
  life_bad:           '#ff4488',
  get info()               { return THEME.textSecondary; },
  get auto_slow()          { return THEME.warning; },
  disk_phase:         '#88aaff',
  civ_epoch:          '#ffcc88',
  get civ_unrest()         { return THEME.danger; },
  civ_famine:         '#ff8800',
  get expedition_ok()      { return THEME.mint; },
  get expedition_fail()    { return '#ff6644'; },
  get pop_born()           { return THEME.success; },
  get pop_died()           { return THEME.danger; },
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
    this._selectedVesselId = null;
    this._vesselMissionType = null;
    this._colonyListItems = [];
    this._transportBtnRect = null;

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
      this._expeditions = this._expeditions.filter(e => e.id !== expedition.id);
    });
    EventBus.on('expedition:disaster', ({ expedition }) => {
      this._expeditions = this._expeditions.filter(e => e.id !== expedition.id);
    });
    EventBus.on('expedition:returned', ({ expedition }) => {
      this._expeditions = this._expeditions.filter(e => e.id !== expedition.id);
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

    EventBus.on('expedition:reconComplete', ({ scope, discovered }) => {
      const label = scope === 'nearest' ? 'Rozpoznanie planety' : 'Rozpoznanie układu';
      this._log(`${label}: odkryto ${discovered.length} ciał`, 'expedition_ok');
    });
    EventBus.on('expedition:arrived', ({ expedition, multiplier }) => {
      const mult = multiplier != null ? ` ×${multiplier.toFixed(1)}` : '';
      const typeLabel = expedition.type === 'transport' ? 'Transport dostarczony'
        : expedition.type === 'colony' ? 'Kolonia założona'
        : expedition.type === 'recon' ? 'Rozpoznanie zakończone'
        : 'Ekspedycja wraca';
      this._log(`${typeLabel}: ${expedition.targetName}${mult}`, 'expedition_ok');
    });
    EventBus.on('expedition:disaster', ({ expedition }) => {
      this._log(`Katastrofa: ${expedition.targetName}!`, 'expedition_fail');
    });
    EventBus.on('colony:founded', ({ colony }) => {
      this._log(`🏙 Nowa kolonia: ${colony.name}`, 'new_planet');
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
      const bodyH = this._civPanelTab === 'expeditions' ? 300 : CIV_PANEL_BODY_H;
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
        shipQueue: colMgr?.getShipQueue(activePid) ?? null,
      });
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
    const h = this._civPanelTab === 'expeditions' ? 300 : CIV_PANEL_BODY_H;
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
      this._factoryBtns = drawEconomyTab(ctx, bodyY, bodyX, bodyW, state);
    }
    if (this._civPanelTab === 'population')  drawPopulationTab(ctx, bodyY, bodyX, bodyW, state);
    if (this._civPanelTab === 'tech')        drawTechTab(ctx, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'buildings')   drawBuildingsTab(ctx, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'expeditions') this._drawExpeditionsTab(ctx, bodyY, bodyX, bodyW);
  }

  // Ekspedycje — zachowana w UIManager (ma dużo stanu)
  _drawExpeditionsTab(ctx, bodyY, bodyX, bodyW) {
    const exSys  = window.KOSMOS?.expeditionSystem;
    const colMgr = window.KOSMOS?.colonyManager;
    const PAD    = 14;
    const LH     = 14;
    const halfW  = Math.floor(bodyW / 2);
    let y = bodyY + 16;

    // MISJE (lewa kolumna)
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.fillText('AKTYWNE MISJE', bodyX + PAD, y);

    const count = this._expeditions.length;
    ctx.fillStyle = count > 0 ? C.mint : C.label;
    ctx.textAlign = 'right';
    ctx.fillText(`${count} w locie`, bodyX + halfW - PAD, y);
    ctx.textAlign = 'left';
    y += 4;

    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + halfW - PAD, y); ctx.stroke();
    y += 10;

    if (count === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.text;
      ctx.fillText('Brak aktywnych misji', bodyX + PAD, y);
      y += LH;
    } else {
      for (const exp of this._expeditions.slice(0, 6)) {
        const icon = exp.type === 'scientific' ? '🔬' : exp.type === 'colony' ? '🚢'
          : exp.type === 'transport' ? '📦' : exp.type === 'recon' ? '🔭' : '⛏';
        const arrow = exp.status === 'returning' ? '↩' : '→';
        const color = exp.status === 'returning' ? C.mint : '#88ccff';
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = color;
        ctx.fillText(`${arrow} ${icon} ${_truncate(exp.targetName ?? '?', 14)}`, bodyX + PAD, y);
        const eta = exp.status === 'returning'
          ? `↩ ${_shortYear(exp.returnYear ?? 0)}`
          : `▶ ${_shortYear(exp.arrivalYear ?? 0)}`;
        ctx.fillStyle = C.label;
        ctx.textAlign = 'right';
        ctx.fillText(eta, bodyX + halfW - PAD, y);
        ctx.textAlign = 'left';
        y += LH;
      }
      if (count > 6) { ctx.fillStyle = C.text; ctx.fillText(`...i ${count - 6} więcej`, bodyX + PAD, y); y += LH; }
    }

    // Status gotowości
    y += 4;
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + halfW - PAD, y); ctx.stroke();
    y += 10;
    const { techOk, padOk, crewOk } = exSys?.canLaunch() ?? {};
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    if (!techOk) { ctx.fillStyle = C.orange; ctx.fillText('🔒 Wymaga: Rakietnictwo', bodyX + PAD, y); }
    else if (!padOk) { ctx.fillStyle = C.orange; ctx.fillText('🔒 Wymaga: Wyrzutnia', bodyX + PAD, y); }
    else if (!crewOk) { ctx.fillStyle = C.orange; ctx.fillText('🔒 Brak POPów (0.5👤)', bodyX + PAD, y); }
    else { ctx.fillStyle = C.green; ctx.fillText('✅ Gotowy do startu', bodyX + PAD, y); }
    y += LH + 2;

    // MISJE ROZPOZNAWCZE
    this._reconBtns = [];
    const unexplored = exSys?.getUnexploredCount() ?? { planets: 0, moons: 0, other: 0, total: 0 };
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + halfW - PAD, y); ctx.stroke();
    y += 10;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title;
    ctx.fillText('MISJE', bodyX + PAD, y);
    y += 4;
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + halfW - PAD, y); ctx.stroke();
    y += 10;

    if (unexplored.total === 0) {
      ctx.fillStyle = C.green; ctx.fillText('✅ Układ w pełni zbadany', bodyX + PAD, y); y += LH;
    } else {
      ctx.fillStyle = C.text;
      let countStr = `Niezbadane: ${unexplored.planets}🪐`;
      if (unexplored.moons > 0) countStr += ` ${unexplored.moons}🌙`;
      if (unexplored.other > 0) countStr += ` ${unexplored.other}☄`;
      ctx.fillText(countStr, bodyX + PAD, y); y += LH;

      const reconOk = exSys?.canLaunchRecon() ?? {};
      const btnW = (halfW - PAD * 3) / 2 - 2;
      const btnH = 16;
      // Nearest
      {
        const bx = bodyX + PAD; const by = y;
        const enabled = reconOk.ok && unexplored.planets > 0;
        ctx.fillStyle = enabled ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.6)';
        ctx.fillRect(bx, by, btnW, btnH);
        ctx.strokeStyle = enabled ? '#4488cc' : '#333'; ctx.strokeRect(bx, by, btnW, btnH);
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = enabled ? '#88ccff' : '#555';
        ctx.textAlign = 'center'; ctx.fillText('Najbliższa 🪐', bx + btnW / 2, by + 11); ctx.textAlign = 'left';
        this._reconBtns.push({ x: bx, y: by, w: btnW, h: btnH, scope: 'nearest', enabled });
      }
      // Full system
      {
        const bx = bodyX + PAD + btnW + 4; const by = y;
        const enabled = reconOk.ok && unexplored.total > 0;
        ctx.fillStyle = enabled ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.6)';
        ctx.fillRect(bx, by, btnW, btnH);
        ctx.strokeStyle = enabled ? '#4488cc' : '#333'; ctx.strokeRect(bx, by, btnW, btnH);
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = enabled ? '#88ccff' : '#555';
        ctx.textAlign = 'center'; ctx.fillText('Cały układ ☀', bx + btnW / 2, by + 11); ctx.textAlign = 'left';
        this._reconBtns.push({ x: bx, y: by, w: btnW, h: btnH, scope: 'full_system', enabled });
      }
      y += btnH + 2;
      ctx.font = '7px monospace'; ctx.fillStyle = C.label;
      const nearT = exSys?.getReconTime('nearest') ?? 3;
      const fullT = exSys?.getReconTime('full_system') ?? 16;
      ctx.fillText(`~${nearT} lat, 100⚡`, bodyX + PAD, y);
      ctx.textAlign = 'right'; ctx.fillText(`~${fullT} lat, 100⚡`, bodyX + halfW - PAD, y); ctx.textAlign = 'left';
      y += LH - 4;
    }
    y += 2;

    // FLOTA + STOCZNIA (pełna szerokość — poniżej lewej kolumny misji)
    this._fleetBuildBtns = [];
    this._vesselRows = [];
    const tSys = window.KOSMOS?.techSystem;
    const vMgr = window.KOSMOS?.vesselManager;
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + halfW - PAD, y); ctx.stroke();
    y += 10;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.title; ctx.fillText('FLOTA', bodyX + PAD, y);
    y += 4;
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + halfW - PAD, y); ctx.stroke();
    y += 10;

    const activePid = colMgr?.activePlanetId;
    const activeCol = colMgr?.getColony(activePid);
    const hasShipyard = activeCol?.buildingSystem
      ? (() => { for (const [, e] of activeCol.buildingSystem._active) { if (e.building.id === 'shipyard') return true; } return false; })()
      : false;
    const hasExploration = tSys?.isResearched('exploration') ?? false;

    if (!hasExploration) { ctx.fillStyle = C.orange; ctx.fillText('🔒 Wymaga: Eksploracja', bodyX + PAD, y); y += LH; }
    else if (!hasShipyard) { ctx.fillStyle = C.orange; ctx.fillText('⚓ Stocznia: ❌ (zbuduj)', bodyX + PAD, y); y += LH; }
    else {
      ctx.fillStyle = C.green; ctx.fillText('⚓ Stocznia: ✅', bodyX + PAD, y); y += LH;
      const queue = colMgr?.getShipQueue(activePid);
      if (queue) {
        const shipDef = SHIPS[queue.shipId];
        const frac = queue.buildTime > 0 ? queue.progress / queue.buildTime : 0;
        ctx.fillStyle = '#88ccff'; ctx.fillText(`Budowa: ${shipDef?.icon ?? '🚀'} ${shipDef?.namePL ?? queue.shipId}`, bodyX + PAD, y); y += LH - 2;
        drawMiniBar(ctx, bodyX + PAD, y, halfW - PAD * 3, 6, frac, '#4488cc'); y += 8;
        ctx.fillStyle = C.text; ctx.fillText(`${Math.floor(queue.progress)}/${queue.buildTime} lat`, bodyX + PAD, y); y += LH;
      }

      // ── Hangar — indywidualne statki ────────────────────────────────
      const vessels = vMgr?.getVesselsAt(activePid) ?? [];
      const fullW = halfW - PAD * 2;
      ctx.fillStyle = C.label; ctx.fillText(`Hangar (${vessels.length}):`, bodyX + PAD, y); y += LH - 2;

      if (vessels.length === 0) {
        ctx.fillStyle = C.dim; ctx.fillText('  (pusty)', bodyX + PAD, y); y += LH - 2;
      } else {
        for (const v of vessels) {
          const sd = SHIPS[v.shipId];
          const rowH = 16;
          const rx = bodyX + PAD;
          const ry = y;
          const isSelected = this._selectedVesselId === v.id;

          // Tło wiersza
          ctx.fillStyle = isSelected ? 'rgba(40,80,120,0.5)' : 'rgba(15,25,40,0.4)';
          ctx.fillRect(rx, ry, fullW, rowH);
          if (isSelected) { ctx.strokeStyle = '#4488cc'; ctx.strokeRect(rx, ry, fullW, rowH); }

          // Ikona + nazwa
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          const statusColor = v.status === 'idle' ? '#44cc66'
            : v.status === 'refueling' ? '#cccc44'
            : v.status === 'on_mission' ? '#4488ff'
            : '#cc4444';
          ctx.fillStyle = statusColor;
          ctx.fillText(`${sd?.icon ?? '🚀'} ${_truncate(v.name, 14)}`, rx + 2, ry + 11);

          // Pasek paliwa (mini)
          const barW = 40;
          const barX = rx + fullW - barW - 4;
          const barY = ry + 4;
          const barH = 6;
          const fuelFrac = v.fuel.max > 0 ? v.fuel.current / v.fuel.max : 0;
          const fuelColor = fuelFrac > 0.5 ? '#44cc66' : fuelFrac > 0.2 ? '#cccc44' : '#cc4444';
          ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = fuelColor; ctx.fillRect(barX, barY, barW * fuelFrac, barH);
          ctx.strokeStyle = '#334'; ctx.strokeRect(barX, barY, barW, barH);
          // Tekst paliwa
          ctx.font = '7px monospace'; ctx.fillStyle = C.label;
          ctx.fillText(`⛽${v.fuel.current.toFixed(1)}/${v.fuel.max}`, barX - 2, ry + 15);

          // Zapamiętaj rect do kliku
          this._vesselRows.push({ x: rx, y: ry, w: fullW, h: rowH, vesselId: v.id });
          y += rowH + 1;
        }
      }
      y += 4;

      // ── Panel akcji wybranego statku ────────────────────────────────
      if (this._selectedVesselId && vMgr) {
        const sv = vMgr.getVessel(this._selectedVesselId);
        if (sv && sv.position.state === 'docked') {
          y = this._drawVesselActionPanel(ctx, sv, bodyX + PAD, y, fullW);
        }
      }

      y += 4;
      // ── Budowa statków ─────────────────────────────────────────────
      const canBuildAny = hasShipyard && !queue;
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
        ctx.strokeStyle = canBuild ? '#4488cc' : '#333';
        ctx.strokeRect(bx, by, fullW, btnH);
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = canBuild ? '#88ccff' : '#555';
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
        for (const part of costParts) {
          ctx.fillStyle = part.ok ? '#668844' : '#cc4422';
          const tw = ctx.measureText(part.text).width;
          if (cx + tw > bodyX + PAD + fullW - 2) {
            y += LH - 4; cx = bodyX + PAD + 2;
          }
          ctx.fillText(part.text, cx, y + 9);
          cx += tw + 6;
        }
        y += LH - 2;

        ctx.fillStyle = C.dim;
        ctx.fillText(`⏱${ship.buildTime} lat`, bodyX + PAD + 2, y + 8);
        y += LH;
      }
    }
  }

  // ── Panel akcji wybranego statku (misje) ───────────────────────────
  _drawVesselActionPanel(ctx, vessel, px, py, panelW) {
    const LH = 14;
    const sd = SHIPS[vessel.shipId];
    let y = py;

    // Tło panelu
    ctx.fillStyle = 'rgba(10,20,40,0.7)';
    ctx.fillRect(px, y, panelW, 4); // separator
    y += 6;

    // Nagłówek
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = '#88ccff';
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

    // Określ dostępne typy misji wg typu statku
    const missionTypes = [];
    if (vessel.shipId === 'science_vessel') {
      missionTypes.push({ type: 'scientific', label: '🔬 Naukowa', icon: '🔬' });
      missionTypes.push({ type: 'recon', label: '🔭 Rozpoznanie', icon: '🔭' });
    }
    if (vessel.shipId === 'cargo_ship') {
      missionTypes.push({ type: 'transport', label: '📦 Transport', icon: '📦' });
    }
    if (vessel.shipId === 'colony_ship') {
      missionTypes.push({ type: 'colony', label: '🚢 Kolonizacja', icon: '🚢' });
    }
    // Mining — dowolny statek z launch_padem
    missionTypes.push({ type: 'mining', label: '⛏ Wydobycie', icon: '⛏' });

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
      ctx.strokeStyle = isActive ? '#66aaee' : '#334';
      ctx.strokeRect(bx, by, bw, btnH);
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = isActive ? '#aaddff' : '#88aacc';
      ctx.textAlign = 'center';
      ctx.fillText(mt.label, bx + bw / 2, by + 10);
      ctx.textAlign = 'left';
      this._vesselActionBtns.push({
        x: bx, y: by, w: bw, h: btnH,
        action: 'missionType', missionType: mt.type, vesselId: vessel.id,
      });
    }
    y += btnH + 4;

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

    // Recon — specjalne przyciski (nearest / full_system)
    if (missionType === 'recon') {
      const exSys = window.KOSMOS?.expeditionSystem;
      const unexplored = exSys?.getUnexploredCount() ?? { total: 0 };
      if (unexplored.total === 0) {
        ctx.fillStyle = C.green; ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillText('✅ Układ w pełni zbadany', px + 2, y); y += LH;
      } else {
        const btnH = 15; const halfW = Math.floor((panelW - 4) / 2);
        for (const scope of ['nearest', 'full_system']) {
          const label = scope === 'nearest' ? '🪐 Najbliższa' : '☀ Cały układ';
          const bx = scope === 'nearest' ? px : px + halfW + 4;
          const by = y;
          ctx.fillStyle = 'rgba(20,40,60,0.8)'; ctx.fillRect(bx, by, halfW, btnH);
          ctx.strokeStyle = '#4488cc'; ctx.strokeRect(bx, by, halfW, btnH);
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = '#88ccff'; ctx.textAlign = 'center';
          ctx.fillText(label, bx + halfW / 2, by + 10); ctx.textAlign = 'left';
          this._vesselActionBtns.push({
            x: bx, y: by, w: halfW, h: btnH,
            action: 'launchRecon', scope, vesselId: vessel.id,
          });
        }
        y += btnH + 4;
      }
      return y;
    }

    // Transport — lista kolonii docelowych
    if (missionType === 'transport') {
      const colonies = colMgr?.getAllColonies() ?? [];
      const activePid = colMgr?.activePlanetId;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.label; ctx.fillText('Cel transportu:', px + 2, y); y += LH;
      for (const col of colonies) {
        if (col.planetId === activePid) continue;
        const btnH = 14;
        const bx = px; const by = y;
        ctx.fillStyle = 'rgba(20,40,60,0.6)'; ctx.fillRect(bx, by, panelW, btnH);
        ctx.strokeStyle = '#335'; ctx.strokeRect(bx, by, panelW, btnH);
        ctx.fillStyle = '#88ccff'; ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillText(`📦 → ${_truncate(col.name, 18)}`, bx + 2, by + 10);
        this._vesselActionBtns.push({
          x: bx, y: by, w: panelW, h: btnH,
          action: 'launchTransport', targetId: col.planetId, vesselId: vessel.id,
        });
        y += btnH + 1;
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
      for (const t of targets.slice(0, 8)) {
        const btnH = 14;
        const bx = px; const by = y;
        const inRange = t.inRange;
        ctx.fillStyle = inRange ? 'rgba(20,40,60,0.6)' : 'rgba(20,15,15,0.5)';
        ctx.fillRect(bx, by, panelW, btnH);
        ctx.strokeStyle = inRange ? '#335' : '#322'; ctx.strokeRect(bx, by, panelW, btnH);
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = inRange ? '#88ccff' : '#665555';
        const distStr = t.dist.toFixed(1);
        const fuelCost = (t.dist * vessel.fuel.consumption).toFixed(1);
        ctx.fillText(`${t.icon} ${_truncate(t.name, 14)}  ${distStr}AU ⛽${fuelCost}`, bx + 2, by + 10);
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
    const targets = [];
    const TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];

    for (const t of TYPES) {
      for (const body of EntityManager.getByType(t)) {
        if (body === homePl) continue;
        if (!body.explored) continue;

        // Filtruj wg typu misji
        if (missionType === 'colony') {
          if (colMgr?.hasColony(body.id)) continue;
          if (body.type === 'planet' && body.planetType !== 'rocky' && body.planetType !== 'ice') continue;
        }

        const dist = DistanceUtils.orbitalFromHomeAU(body);
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

    this._roundRect(ctx, PX, PY, PW, PH, 3, '#060d18', 0.88, C.border);

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    ctx.fillText('AKCJE GRACZA', PX + PAD, PY + 14);

    // Pasek energii
    const E_Y  = PY + PAD + 16;
    const E_W  = PW - PAD * 2;
    const frac = this._energyMax > 0 ? this._energy / this._energyMax : 0;
    ctx.fillStyle = THEME.bgTertiary;
    ctx.fillRect(PX + PAD, E_Y, E_W, 6);
    ctx.fillStyle = frac > 0.5 ? '#44aaff' : frac > 0.2 ? '#aabb22' : THEME.dangerDim;
    ctx.fillRect(PX + PAD, E_Y, Math.round(E_W * frac), 6);
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.strokeRect(PX + PAD, E_Y, E_W, 6);

    const actions = [
      { id: 'stabilize', label: '[Q] STABILIZUJ',  cost: ACTION_COSTS.stabilize,  color: '#44aaff' },
      { id: 'nudgeToHz', label: '[W] PCHNIJ → HZ', cost: ACTION_COSTS.nudgeToHz,  color: '#88ffcc' },
      { id: 'bombard',   label: '[E] BOMBARDUJ',   cost: ACTION_COSTS.bombard,     color: '#ffaa44' },
    ];

    const hasTarget = !!this._selectedEntity;
    actions.forEach((act, i) => {
      const bx = PX + PAD;
      const by = PY + PAD + 16 + 10 + i * (BTN_H + BTN_G);
      const bw = PW - PAD * 2;
      const canUse = hasTarget && this._energy >= act.cost;
      ctx.fillStyle = canUse ? '#0d1a2e' : '#080e18';
      ctx.fillRect(bx, by, bw, BTN_H);
      ctx.strokeStyle = canUse ? '#2a4060' : '#111828'; ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, BTN_H);
      ctx.fillStyle = canUse ? act.color : '#2a3050';
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

    this._roundRect(ctx, DX, DY, DW, DH, 4, '#111828', 1.0, '#3a6090');

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
    ctx.strokeStyle = '#cc2222';
    ctx.lineWidth = 2;
    ctx.strokeRect(DX, DY, DW, DH);

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeTitle + 4}px ${THEME.fontFamily}`;
    ctx.fillStyle = '#ff3333';
    ctx.textAlign = 'center';
    ctx.fillText('CYWILIZACJA ZNISZCZONA', W / 2, DY + 36);

    // Opis
    const reasonText = d.reason === 'collision'
      ? `Kolizja planetarna zniszczyła planetę ${d.planetName}.`
      : d.reason === 'ejected'
        ? `Planeta ${d.planetName} została wyrzucona z układu.`
        : `Życie na planecie ${d.planetName} wymarło.`;
    ctx.font = `${THEME.fontSizeNormal + 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = '#ccaaaa';
    ctx.fillText(reasonText, W / 2, DY + 64);
    ctx.fillText('Twoja cywilizacja nie przetrwała.', W / 2, DY + 84);

    // Czas przetrwania
    const gameTime = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const years = Math.round(gameTime).toLocaleString('pl-PL');
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = '#887766';
    ctx.fillText(`Czas przetrwania: ${years} lat`, W / 2, DY + 108);

    // Przycisk NOWA GRA
    const btnW = 140, btnH = 28;
    const btnX = W / 2 - btnW / 2, btnY = DY + DH - 44;
    ctx.fillStyle = '#881111';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = '#cc3333';
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX, btnY, btnW, btnH);
    ctx.font = `bold ${THEME.fontSizeNormal + 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = '#ffcccc';
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
    if (this._civPanelTab === 'economy')   return this._detectFactoryTooltip(x, y);
    if (this._civPanelTab === 'buildings') return this._detectBuildingTooltip(x, y, bodyY, bodyX, bodyW);
    if (this._civPanelTab === 'tech')      return this._detectTechTooltip(x, y, bodyY, bodyX, bodyW);
    return null;
  }

  _detectFactoryTooltip(x, y) {
    const allocs = this._factoryData?.allocations
      ?? window.KOSMOS?.factorySystem?.getAllocations?.() ?? [];
    for (const btn of this._factoryBtns) {
      if (x >= btn.x - 120 && x <= btn.x + btn.w + 40 && y >= btn.y && y <= btn.y + btn.h + 4) {
        const a = allocs.find(al => al.commodityId === btn.commodityId);
        if (a) {
          const def = COMMODITIES[btn.commodityId];
          return { type: 'factory', data: { alloc: a, def } };
        }
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

    this._roundRect(ctx, tx, ty, tw, th, 4, '#0a1020', 0.94, '#2a5080');

    let cy = ty + TOOLTIP_PAD;
    for (const line of lines) {
      if (line.type === 'separator') {
        cy += 3; ctx.strokeStyle = '#1a3050'; ctx.lineWidth = 1;
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
      const recipeStr = Object.entries(def.recipe).map(([r, q]) => `${q}×${r}`).join(' + ');
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

  _buildTechTooltipLines({ tech, researched, available }) {
    const lines = [];
    let statusIcon, statusColor, statusText;
    if (researched) { statusIcon = '✅'; statusColor = C.green; statusText = 'Zbadana'; }
    else if (available) { statusIcon = '🔓'; statusColor = C.yellow; statusText = 'Dostępna (kliknij)'; }
    else { statusIcon = '🔒'; statusColor = '#555555'; statusText = 'Zablokowana'; }
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
    // Recon buttons (stare — w sekcji MISJE)
    for (const rb of (this._reconBtns ?? [])) {
      if (rb.enabled && x >= rb.x && x <= rb.x + rb.w && y >= rb.y && y <= rb.y + rb.h) {
        EventBus.emit('expedition:sendRequest', { type: 'recon', targetId: rb.scope });
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

  // Obsługa kliknięcia w panel akcji statku
  _handleVesselAction(btn) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;

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

    if (btn.action === 'launchTransport') {
      // Otwórz modal transportu z przypisanym statkiem
      const colMgr = window.KOSMOS?.colonyManager;
      const activePid = colMgr?.activePlanetId;
      const sourceCol = colMgr?.getColony(activePid);
      const targetCol = colMgr?.getColony(btn.targetId);
      if (sourceCol && targetCol) {
        showTransportModal(sourceCol, [targetCol]).then(result => {
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
        const bodyH = this._civPanelTab === 'expeditions' ? 300 : CIV_PANEL_BODY_H;
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
  return String(Math.floor(y));
}

function _truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}
