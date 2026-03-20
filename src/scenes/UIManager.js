// UIManager — zarządzanie interfejsem gry na Canvas 2D
// Redesign Stellaris-inspired: TopBar, Outliner, BottomContext, BottomBar, CivPanel
//
// Rysuje na #ui-canvas nakładanym nad Three.js.
// Obsługuje kliknięcia przez metodę handleClick(x, y) zwracającą true/false.
// Wszystkie dane UI aktualizowane przez EventBus.

import EventBus    from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { TECHS } from '../data/TechData.js';
import { BUILDINGS, RESOURCE_ICONS, formatRates, formatCost } from '../data/BuildingsData.js';
import { SHIPS } from '../data/ShipsData.js';
import { DistanceUtils }     from '../utils/DistanceUtils.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }          from '../config/LayoutConfig.js';
import { OverlayManager }  from '../ui/OverlayManager.js';
import { FleetManagerOverlay } from '../ui/FleetManagerOverlay.js';
import { PopulationOverlay }   from '../ui/PopulationOverlay.js';
import { EconomyOverlay }      from '../ui/EconomyOverlay.js';
import { TechOverlay }         from '../ui/TechOverlay.js';
import { ColonyOverlay }       from '../ui/ColonyOverlay.js';
import { ObservatoryOverlay }  from '../ui/ObservatoryOverlay.js';
import { GalaxyMapScene }      from './GalaxyMapScene.js';
import { t, getName }          from '../i18n/i18n.js';

// Nowe komponenty UI
import { TopBar }        from '../ui/TopBar.js';
import { BottomBar }     from '../ui/BottomBar.js';
import { BottomContext }  from '../ui/BottomContext.js';
import { Outliner }       from '../ui/Outliner.js';
import {
  CIV_SIDEBAR_W, CIV_SIDEBAR_BTN, CIV_SIDEBAR_GAP, CIV_SIDEBAR_PAD,
  CIV_TABS,
  drawCivPanelSidebar,
  hitTestSidebar,
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
    });

    // ── Nowe komponenty UI ───────────────────────────────
    this._topBar       = new TopBar();
    this._bottomBar    = new BottomBar();
    this._bottomContext = new BottomContext();
    this._outliner     = new Outliner();

    // ── Stan UI ───────────────────────────────────────────────
    this._selectedEntity  = null;
    this._infoPanelTab    = 'orbit';
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

    // ── OverlayManager (panele pełnoekranowe) ─────────────
    this.overlayManager = new OverlayManager();
    this.overlayManager.register('fleet', new FleetManagerOverlay());
    this.overlayManager.register('population', new PopulationOverlay());
    this.overlayManager.register('economy', new EconomyOverlay());
    this.overlayManager.register('tech', new TechOverlay());
    this.overlayManager.register('colony', new ColonyOverlay());
    this.overlayManager.register('observatory', new ObservatoryOverlay());
    this.overlayManager.register('galaxy', new GalaxyMapScene());

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

    // Synchronizacja stanu audio/muzyka z UI
    EventBus.on('audio:toggle', () => { this._audioEnabled = !this._audioEnabled; });
    EventBus.on('music:toggled', ({ enabled }) => { this._musicEnabled = enabled; });

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
            this._log(t('log.brownoutStart'), 'civ_unrest');
          } else if (!isNow && wasBefore) {
            this._log(t('log.brownoutEnd'), 'expedition_ok');
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
    EventBus.on('prosperity:changed',    (data) => { this._prosperityData = data; });

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
    EventBus.on('fleet:buildQueued', ({ shipId }) => {
      const ship = SHIPS[shipId];
      this._addNotification(`⏳ Stocznia: ${ship?.namePL ?? shipId} — oczekuje na surowce`);
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
    EventBus.on('civ:unrestStarted', () => {
      this._log(t('log.socialUnrest'), 'civ_unrest');
    });
    EventBus.on('civ:famine', () => {
      this._log(t('log.colonyFamine'), 'civ_famine');
    });

    EventBus.on('civ:popBorn', ({ population }) => {
      this._log(t('log.popBorn', population), 'pop_born');
    });
    EventBus.on('civ:popDied', ({ cause, population }) => {
      const key = cause === 'starvation' ? 'log.popDiedStarvation' : 'log.popDied';
      this._log(t(key, population), 'pop_died');
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
      // Raport z misji mining/scientific — szczegółowe zasoby
      this._log(text, 'expedition_ok');
    });
    EventBus.on('expedition:disaster', ({ expedition }) => {
      this._log(t('log.arrivalDisaster', expedition.targetName), 'expedition_fail');
    });
    EventBus.on('expedition:launchFailed', ({ reason }) => {
      this._log(t('log.expeditionLaunchFailed', reason), 'expedition_fail');
    });
    EventBus.on('colony:founded', ({ colony }) => {
      this._log(t('log.colonyFounded', colony.name), 'new_planet');
    });
    // Przełączenie aktywnej kolonii z Outliner → odśwież wszystkie dane UI
    EventBus.on('colony:switched', () => {
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
    EventBus.on('colony:tradeExecuted', ({ route }) => {
      this._log(t('log.tradeExecuted'), 'info');
    });
    EventBus.on('colony:migration', ({ from, to, count }) => {
      this._log(t('log.migration', count, from, to), 'info');
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
    EventBus.on('trade:imported', ({ vesselName, colonyId, items }) => {
      if (!items || Object.keys(items).length === 0) return;
      const colName = window.KOSMOS?.colonyManager?.getColony?.(colonyId)?.name ?? colonyId;
      const summary = Object.entries(items)
        .map(([id, qty]) => `${id}:${qty}`)
        .join(', ');
      this._log(`📦 ${vesselName} → ${colName}: ${summary}`, 'fleet');
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
    x /= UI_SCALE; y /= UI_SCALE;

    // Game Over — klik na przycisk "Nowa Gra"
    if (this._gameOverData) {
      return this._hitTestGameOver(x, y);
    }

    // Dialog potwierdzenia
    if (this._confirmDialog?.visible) {
      return this._hitTestConfirm(x, y);
    }

    // Panel MENU — DOM overlay nad canvasami, priorytet nad overlayami
    if (this._bottomBar.menuOpen && this._bottomBar.hitTestMenu(x, y, W, H)) {
      return true;
    }

    // Przycisk MENU — priorytet nad overlayami (dostępny zawsze)
    if (y >= H - COSMIC.BOTTOM_BAR_H) {
      const btnW = 64, btnX = W - btnW - 6;
      if (x >= btnX && x <= btnX + btnW) {
        this._bottomBar._menuOpen = !this._bottomBar._menuOpen;
        this._bottomBar._syncDomMenu();
        return true;
      }
    }

    // Overlay pełnoekranowy (FleetManager itp.) — przed resztą UI
    if (this.overlayManager.isAnyOpen()) {
      if (this.overlayManager.handleClick(x, y)) return true;
    }

    // TopBar (zasoby + czas)
    if (this._topBar.hitTest(x, y, W)) {
      // Zamknij menu jeśli kliknięto poza nim
      if (this._bottomBar.menuOpen) this._bottomBar._menuOpen = false;
      return true;
    }

    // BottomBar (stabilność + EventLog + menu)
    if (this._bottomBar.hitTest(x, y, W, H, this._audioEnabled, this._musicEnabled, this._timeState.autoSlow)) return true;

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
    // Overlay pełnoekranowy — scroll
    if (this.overlayManager.isAnyOpen()) {
      if (this.overlayManager.handleScroll(deltaY, x, y)) return true;
    }
    // BottomContext scroll
    if (this._selectedEntity) {
      if (this._bottomContext.handleWheel(x, y, deltaY, W, H, this._selectedEntity)) return true;
    }
    return false;
  }

  handleMouseDown(rawX, rawY) {
    const x = rawX / UI_SCALE;
    const y = rawY / UI_SCALE;
    if (this.overlayManager.isAnyOpen()) { this.overlayManager.handleMouseDown(x, y); return; }
  }

  handleMouseUp(rawX, rawY) {
    const x = rawX / UI_SCALE;
    const y = rawY / UI_SCALE;
    if (this.overlayManager.isAnyOpen()) { this.overlayManager.handleMouseUp(x, y); return; }
  }

  handleMouseMove(x, y) {
    x /= UI_SCALE; y /= UI_SCALE;
    this._tooltipMouseX = x;
    this._tooltipMouseY = y;
    // Overlay pełnoekranowy — hover
    if (this.overlayManager.isAnyOpen()) {
      this.overlayManager.handleMouseMove(x, y);
    }
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
      // Filtruj ekspedycje po aktywnej kolonii (spójność z AKTYWNE MISJE)
      const vMgrOut = window.KOSMOS?.vesselManager;
      const outlinerExps = this._expeditions.filter(exp => {
        if (!exp.vesselId || !vMgrOut) return false;
        const v = vMgrOut.getVessel(exp.vesselId);
        return v && v.colonyId === activePid;
      });
      this._outliner.draw(ctx, W, H, {
        colonies: colMgr?.getAllColonies() ?? [],
        expeditions: outlinerExps,
        fleet: colMgr?.getFleet(activePid) ?? [],
        shipQueues: colMgr?.getShipQueues(activePid) ?? [],
      });
    }

    // ── BottomContext (dolny panel info o encji) ──────────────
    if (!globeOpen) {
      this._bottomContext.draw(ctx, W, H, this._selectedEntity);
    }

    // ── Przerysuj sidebar nad BottomContext (zawsze na wierzchu) ──
    if (civMode && !globeOpen) this._drawCivPanel();

    // ── BottomBar (stabilność + EventLog + przyciski) ────────
    this._bottomBar.draw(ctx, W, H, {
      stability: this._stability,
      logEntries: this._logEntries,
      audioEnabled: this._audioEnabled,
      musicEnabled: this._musicEnabled,
      autoSlow: this._timeState.autoSlow,
      civMode,
    });

    // ── Overlay pełnoekranowy (FleetManager itp.) ────────────
    if (civMode && !globeOpen) this.overlayManager.draw(ctx, W, H);
    // ── Przerysuj sidebar nad overlayem (zawsze widoczny) ───
    if (civMode && !globeOpen && this.overlayManager.active) this._drawCivPanel();

    // ── Panel MENU — rysowany PO overlayach (na wierzchu) ──
    this._bottomBar.drawMenu(ctx, W, H, {
      audioEnabled: this._audioEnabled,
      musicEnabled: this._musicEnabled,
    });

    // ── Panel akcji gracza (tylko tryb Generator) ────────────
    if (!civMode && window.KOSMOS?.scenario === 'generator') this._drawActionPanel();

    // ── Powiadomienia (fade out) ─────────────────────────────
    this._drawNotifications();

    // ── Tooltip TopBar (na wierzchu) ─────────────────────────
    if (civMode) this._topBar.drawTooltip(ctx, W, UI_SCALE);

    // ── Tooltip kolonii (Outliner) — na wierzchu ────────────
    if (civMode && this._outliner) this._outliner.drawTooltip(ctx);

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
