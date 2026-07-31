// ColonyOverlay — mapa 2D planety (klawisz C)
//
// Tapered hex grid: owalny kształt — bieguny wąskie, równik szeroki.
// Mapa zajmuje CAŁY overlay. Floating panel pojawia się obok zaznaczonego hexa.
// Nagłówek: nazwa kolonii + POP + budynki.

import { BaseOverlay, HEADER_H }  from './BaseOverlay.js';
import { THEME, bgAlpha, hexToRgb } from '../config/ThemeConfig.js';
import { GAME_CONFIG } from '../config/GameConfig.js';   // Slice 5C.1: FEATURES.popAllocation2 (zakładka Załoga v2)
import { UNIT_ARCHETYPES } from '../data/unitArchetypes.js';
import { BUILDINGS, RESOURCE_ICONS, formatCost } from '../data/BuildingsData.js';
import { STRATA_META } from '../systems/CivilizationSystem.js';   // Faza 3: nazwy warstw w tooltipach
import { COMMODITIES } from '../data/CommoditiesData.js';
import { CULTURAL_TRAITS } from '../data/MilestonesData.js';   // C5 — cechy kulturowe w zakładce Populacja
import { STATIONS } from '../data/StationData.js';
import { STATION_MODULES } from '../data/StationModuleData.js';   // S3.4 FAZA 3 — nazwa modułu (rozbiórka)
import EntityManager from '../core/EntityManager.js';
import { TERRAIN_TYPES, evaluatePlacement } from '../map/HexTile.js';
import { computeBuildResourceCost, computeBuildCommodityCost } from '../data/EnvironmentCost.js';
import { HexGrid }      from '../map/HexGrid.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { shouldReuseColonyGrid } from './ColonyGridResolveLogic.js';
import { DepositSystem } from '../systems/DepositSystem.js';                   // C2 — getDepositsSummary (pozostało/początkowe)
import { computeDepositReadout, fmtCompact } from './DepositReadoutLogic.js';  // C2 — odczyt złoża (ratio + ETA wyczerpania)
import { computeEnvironmentEffects } from './EnvironmentEffectLogic.js';        // C3 — linie efektów środowiskowych (warunek → wpływ)
import { computeTabRects, clampScroll, scrollThumb, stepperButtonBand, fixedGlobeSize } from './InfoPanelLayoutLogic.js';  // C4 — layout zakładek + scroll + stepper ± + stały globus (wspólny)
import { hashCode, TEXTURE_VARIANTS } from '../renderer/PlanetTextureUtils.js';
import EventBus          from '../core/EventBus.js';
import { dropTroop, fireOrbitalStrike } from '../entities/Vessel.js';
import { showUnitCard } from './UnitCardPanel.js';
import { showBattleGroup } from './BattleGroupPanel.js';
import { showConfirmModal } from './ConfirmModal.js';
import { ANOMALIES }     from '../data/AnomalyData.js';
import { t, getLocale, getName } from '../i18n/i18n.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { PlanetGlobeRenderer } from '../renderer/PlanetGlobeRenderer.js';
import { getTerrainTexture, getTransitionTexture, texturesLoaded } from '../renderer/TerrainTextures.js';
import { getBuildingTexture, hasBuildingTexture } from '../renderer/BuildingTextures.js';
import { HEX_DIRECTIONS } from '../map/HexGrid.js';
import { drawStationManagement } from './StationManagementView.js';   // S3.4 FAZA 3 — ekran stacji
import { showRenameModal } from './ModalInput.js';                     // S3.4 FAZA 3 — rename stacji
import { GroundUnitPanel } from './GroundUnitPanel.js';                // rekrutacja jednostek scoped do tej kolonii

const HDR_H = HEADER_H;   // wysokość pasma nagłówka (standard BaseOverlay)
const FLOAT_W = 200;  // szerokość floating panelu

// Panel info planety (prawa kolumna) — ~30% szerokości overlayu z limitem,
// żeby na ultrawide nie był gigantyczny ani na wąskim ekranie nie zjadł mapy.
const INFO_FRAC = 0.30;
const INFO_MIN  = 300;
const INFO_MAX  = 460;

// Pasek listy budynków nad mapą 2D (kolumna mapy, pod nagłówkiem)
const BUILD_BAR_H = 30;

// S4 — przypięte pasmo podsumowania Załogi (3 linie 2-kolumnowe ×18 + strefa separatora).
// Rezerwowane u DOŁU panelu; pasmo scrolla tabeli kończy się NAD nim → bilans/zdrowie kolonii
// zawsze widoczne bez przewijania (odwrócenie kompromisu 0.26 z Fazy 3).
const WF_SUMMARY_H   = 54;   // 3 × 18px  (Bezrobotni|Satysfakcja · Prosperity|Wzrost · Bilans)
const WF_SUMMARY_GAP = 12;   // odstęp/separator między pasmem scrolla a podsumowaniem

let _UI_SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
window.addEventListener('resize', () => {
  _UI_SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
});

const CAT_COLORS = {
  mining: '#cc9944', energy: '#ffdd44', food: '#44cc66', population: '#4488ff',
  research: '#cc66ff', space: '#8888ff', military: '#ff6644', market: '#44ddcc',
  civil: '#ddaa44',
};

const BUILDING_CATEGORIES = [
  { id: 'mining', icon: '⛏' }, { id: 'energy', icon: '⚡' },
  { id: 'food', icon: '🌾' },  { id: 'population', icon: '🏠' },
  { id: 'research', icon: '🔬' }, { id: 'space', icon: '🚀' },
  { id: 'military', icon: '🛡' }, { id: 'market', icon: '💰' },
];

export class ColonyOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedColonyId = null;
    this._selectedHex      = null;
    this._hoveredHex       = null;
    this._hoveredBuildId   = null;

    // Tryb podglądu — mapa ciała PRZEANALIZOWANEGO (analyzed) bez kolonii. Read-only:
    // teren + biomy + globus + dossier, BEZ budowy/POP/zakładek. Wirtualna „kolonia"
    // (buildingSystem=null) trzymana lokalnie; NIE dotyka ColonyManager. Osobny cache
    // siatki, by preview (bez stolicy) nie kolidował z realną kolonią na tym ciele.
    this._previewMode      = false;
    this._previewColony    = null;
    this._previewGridCache = {};

    // Globus 3D w prawej kolumnie info (PlanetGlobeRenderer, tryb embedded)
    this._globe = null;
    this._globePlanetId = null;

    // Zakładka prawej kolumny info: 'planet' (dane planety — domyślna) | 'workforce'
    // (Population 2.0 Faza 2 — załoga/etaty/płace/focus).
    this._infoTab = 'planet';
    // C4 — per-zakładka scroll prawej kolumny (offset + zmierzona wysokość treści, keyed po tab id).
    // Offset przenosi się między zakładkami tej samej kolonii; zerowany przy zmianie kolonii.
    this._infoScroll = {};            // { [tabId]: offset scrolla px }
    this._infoContentH = {};          // { [tabId]: wysokość treści zmierzona w draw (górny klamp) }
    this._infoScrollColonyId = null;  // id kolonii dla której trzymamy offsety (reset przy zmianie)
    this._infoView = null;            // { x, w, top, bot, tab, scrollable } — pasmo treści dla handleScroll

    // Poziome przewinięcie paska budynków nad mapą (px)
    this._buildBarScroll = 0;
    // Poziome przewinięcie paska zakładek kolonii w nagłówku (px)
    this._colonyTabScroll = 0;

    // Kamera
    this._camX = 0; this._camY = 0;
    this._hexSize = 32;
    this._minHexSize = 10; this._maxHexSize = 56;

    // Jednostki naziemne
    this._selectedUnit = null;          // primary selection (last clicked) — compat
    this._selectedUnits = new Set();    // wszystkie zaznaczone unit IDs (multi-select)
    this._controlGroups = new Map();    // number → Set<unitId> (Ctrl+1..9 grupy bojowe)
    this._unitSprites = new Map();
    this._loadUnitSprites();

    // Rekrutacja jednostek naziemnych — modal SCOPED do oglądanej kolonii.
    // Panel rekrutacji (reużyty z JEDNOSTKI) dostaje getColony → this._getColony(),
    // więc rozkaz `startGroundUnitBuild` celuje w TĘ kolonię (nie globalną aktywną).
    this._mouseX = 0; this._mouseY = 0;   // pozycja kursora dla tooltipów panelu (jak UnitDesignOverlay)
    this._draftOpen = false;              // czy modal rekrutacji otwarty
    this._draftPanel = new GroundUnitPanel({
      addHit:       (x, y, w, h, type, data) => this._addHit(x, y, w, h, `ground:${type}`, data),
      getHoverZone: () => this._hoverZone,
      getMouse:     () => ({ x: this._mouseX, y: this._mouseY }),
      getColony:    () => this._getColony(),
    });

    // Modifiery ostatniego kliknięcia — ustawiane przez window.mousedown listener w GameScene.
    // Używane w handleClick do rozróżnienia single-select (bez modifierów) vs add-to-selection.
    this._lastMouseMods = { shift: false, ctrl: false };

    // Drag-select (prostokąt) — współdzielone API w BaseOverlay (this._rectSelect).
    // Opt-in przez _canStartRectSelect() poniżej.

    // Pan kamery (MMB drag lub klawiatura WASD/strzałki)
    this._isDragging = false;
    this._dragStartX = 0; this._dragStartY = 0;
    this._dragCamStartX = 0; this._dragCamStartY = 0;
    this._hasDragged = false;

    // Cache + flash
    this._gridCache = {};
    this._flashMsg = null; this._flashEnd = 0;

    // Floating panel pozycja ekranowa (obliczana w draw)
    this._floatX = 0; this._floatY = 0;

    // Tooltip DOM
    this._tooltipEl = null;
    this._createTooltipEl();

    // EventBus
    EventBus.on('planet:buildResult', (e) => {
      this._onBuildingChanged();
      if (e.success && e.queued) this._showFlash('⏳ W kolejce — brak surowców');
      else if (e.success && e.underConstruction) this._showFlash('🔨 Budowa rozpoczęta');
      else if (e.success) this._showFlash('✓ Zbudowano');
      else if (e.reason) this._showFlash(e.reason);
    });
    EventBus.on('planet:demolishResult', (e) => {
      this._onBuildingChanged();
      if (e.success && !e.downgrade) this._selectedHex = null;
      else if (!e.success && e.reason) this._showFlash(e.reason);
    });
    EventBus.on('planet:upgradeResult', (e) => {
      this._onBuildingChanged();
      if (!e.success && e.reason) this._showFlash(e.reason);
    });
    EventBus.on('planet:pendingFulfilled', (e) => this._onBuildingChanged(e?.planetId));
    EventBus.on('planet:pendingCancelled', () => this._onBuildingChanged());
    EventBus.on('planet:constructionComplete', (e) => this._onBuildingChanged(e?.planetId));
    EventBus.on('planet:constructionProgress', (e) => this._onBuildingChanged(e?.planetId));

    // Tekstury PNG budynków dogrywają się async (start/switch układu). Gdy mapa
    // kolonii jest już otwarta w chwili załadowania, dirty-based loop UIManagera
    // nie przerysuje jej sam (przy pauzie brak timeDirty) → tekstury pojawiłyby
    // się dopiero po ruchu kamery. Wymuś jeden redraw (wzór: teren→PlanetScene
    // przerysowuje mapę; tu odpowiednik = mark UIManager dirty).
    EventBus.on('buildings:texturesLoaded', () => {
      if (this.visible && window.KOSMOS?.uiManager) window.KOSMOS.uiManager._dirty = true;
    });

    // Stacje orbitalne (S3.3b-S4) — dialog budowy + feedback (flash)
    this._stationDialogOpen = false;
    this._stationTargetId   = null;
    EventBus.on('station:orderQueued',    (e) => { if (this._isActivePlanet(e?.planetId)) this._showFlash('🛰 ' + t('station.flashQueued')); });
    EventBus.on('station:built',          (e) => { if (this._isActivePlanet(e?.planetId)) this._showFlash('🛰 ' + t('station.flashBuilt')); });
    EventBus.on('station:buildFailed',    (e) => { if (this._isActivePlanet(e?.planetId)) this._showFlash('⚠ ' + t('station.flashFailed')); });
    EventBus.on('station:orderCancelled', (e) => { if (this._isActivePlanet(e?.planetId)) this._showFlash('✕ ' + t('station.flashCancelled')); });
    EventBus.on('station:orderRejected',  (e) => { if (this._isActivePlanet(e?.planetId)) this._showFlash('🔒 ' + t('station.flashRejected')); });
    // S3.4 FAZA 4 — flash przy dostawie/odbiorze POP (gdy oglądamy tę stację w trybie stacji).
    EventBus.on('station:popArrived',  (e) => { if (this._stationMode && e?.stationId === this._selectedStationId) this._showFlash('🧑‍🚀 +1 POP'); });
    EventBus.on('station:popDeparted', (e) => { if (this._stationMode && e?.stationId === this._selectedStationId) this._showFlash('🧑‍🚀 −1 POP'); });

    // S3.4 FAZA 3 — TRYB STACJI (ekran zarządzania w miejsce mapy hex). NIE woła switchActiveColony.
    this._stationMode          = false; // czy overlay renderuje ekran stacji zamiast mapy planety
    this._selectedStationId    = null;  // stacja pokazywana w trybie stacji
    this._stationPickerOpen    = false; // modal wyboru modułu (pusty slot → picker)
    this._stationShipPickerOpen = false; // modal wyboru kadłuba (kolejka stoczni → + Buduj statek)
    // Statusy modułów/postęp budowy zmieniają się PER TICK (StationSystem._tick), nie po akcji —
    // przy pauzie brak timeDirty, więc wymuś redraw na zdarzeniach stacji gdy jesteśmy w trybie stacji.
    for (const ev of ['station:moduleOrderQueued', 'station:moduleOrderCancelled', 'station:moduleBuildStarted',
                      'station:moduleBuilt', 'station:moduleOrderRejected', 'station:moduleDemolished',
                      'station:shipBuildStarted', 'station:shipCompleted', 'station:shipBuildCancelled',
                      'station:shipBuildRejected', 'station:rename', 'station:popArrived', 'station:popDeparted',
                      'vessel:awaitingHousing']) {
      EventBus.on(ev, () => { if (this.visible && this._stationMode && window.KOSMOS?.uiManager) window.KOSMOS.uiManager._dirty = true; });
    }

    // Away Team — tryb wyboru hexa lądowania
    this._landingMode = false;
    this._landingVesselId = null;
    EventBus.on('vessel:awayTeamLanding', ({ vesselId, targetId }) => {
      this._landingMode = true;
      this._landingVesselId = vesselId;
      this._openAsColonyPanel(targetId);
      this._showFlash('🤖 Wybierz hex lądowania Away Team');
    });

    // Desant — tryb wyboru hexów zrzutu jednostek z troop bay (Faza desantu)
    // Iteracyjnie: dla każdej jednostki w bay gracz klika hex docelowy.
    this._dropMode = false;
    this._dropVesselId = null;
    this._dropQueue = [];       // [unitId] — kolejka do zrzucenia
    this._dropPlanetId = null;
    // Ostrzał orbitalny — tryb wyboru hexa (Faza desantu)
    this._strikeMode = false;
    this._strikeVesselId = null;
    this._strikePlanetId = null;

    // Victoria 2 stack combat: tryb wyboru bitwy dla ranged support
    this._supportMode = false;
    this._supportSourceUnitId = null;
    EventBus.on('vessel:orbitalStrikeRequest', ({ vesselId, targetId }) => {
      const vMgr = window.KOSMOS?.vesselManager;
      const warSys = window.KOSMOS?.warSystem;
      const vessel = vMgr?.getVessel?.(vesselId);
      if (!vessel?.orbitalStrike) return;
      if ((vessel.orbitalStrike.ammoCurrent ?? 0) <= 0) { this._showFlash('Brak amunicji'); return; }

      // Sprawdź dominację (jeśli obca kolonia). Obca = brak w colMgr LUB ma ownerEmpireId/isTestEnemy.
      const colMgr = window.KOSMOS?.colonyManager;
      const targetColony = colMgr?.getColony?.(targetId);
      const isHostile = !targetColony || !!targetColony.ownerEmpireId || !!targetColony.isTestEnemy;
      if (isHostile && warSys && !warSys.playerHasOrbitalDominance(targetId)) {
        this._showFlash('Brak dominacji orbitalnej');
        return;
      }

      this._strikeMode = true;
      this._strikeVesselId = vesselId;
      this._strikePlanetId = targetId;
      this._openAsColonyPanel(targetId);
      this._showFlash(`💥 Wybierz hex ostrzału (${vessel.orbitalStrike.ammoCurrent} pocisków)`);
    });

    // Intercept movement — unit wpadł w kontakt z wrogiem, ruch przerwany
    EventBus.on('groundUnit:intercepted', ({ unitId, planetId, q, r }) => {
      if (!this.visible) return;
      const activePid = this._selectedColonyId ?? window.KOSMOS?.colonyManager?.activePlanetId;
      if (planetId !== activePid) return;
      this._showFlash(`⚠ Kontakt (${q},${r}) — ruch przerwany`);
    });

    // Victoria 2 stack combat: widoczny raport z walki (flash + event log entry)
    EventBus.on('combat:hexResolved', ({ planetId, q, r, winnerId, playerKilled, enemyKilled }) => {
      if (!this.visible) return;
      // Pokaż flash tylko gdy ta planeta jest otwarta
      const activePid = this._selectedColonyId ?? window.KOSMOS?.colonyManager?.activePlanetId;
      if (planetId !== activePid) return;
      if (winnerId === 'player') {
        this._showFlash(`⚔ Zwycięstwo (${q},${r}) — straty ${playerKilled} · wrogów ${enemyKilled}`);
      } else if (winnerId && winnerId !== 'player') {
        this._showFlash(`💀 Przegrana (${q},${r}) — straty ${playerKilled}`);
      } else {
        this._showFlash(`⚔ Bitwa (${q},${r}) zakończona`);
      }
    });

    EventBus.on('combat:round', ({ planetId, q, r, round, playerLosses, enemyLosses }) => {
      if (!this.visible) return;
      const activePid = this._selectedColonyId ?? window.KOSMOS?.colonyManager?.activePlanetId;
      if (planetId !== activePid) return;
      const pk = playerLosses?.killed ?? 0;
      const ek = enemyLosses?.killed ?? 0;
      // Flash tylko gdy są ofiary (inaczej zasypaliby ekran)
      if (pk > 0 || ek > 0) {
        this._showFlash(`⚔ (${q},${r}) runda ${round}: −${pk} / −${ek}`);
      }
    });

    EventBus.on('vessel:dropTroopsRequest', ({ vesselId, targetId, unitIds }) => {
      const vMgr = window.KOSMOS?.vesselManager;
      const warSys = window.KOSMOS?.warSystem;
      const vessel = vMgr?.getVessel?.(vesselId);
      if (!vessel) return;
      if (!vessel.canDropTroops) { this._showFlash('Brak Kapsuł Desantowych'); return; }
      if ((vessel.groundUnits ?? []).length === 0) { this._showFlash('Ładownia pusta'); return; }

      // Dominacja orbitalna: wymagana dla wrogich celów (własne kolonie OK).
      // Wroga kolonia = ta która ma ownerEmpireId lub isTestEnemy (debug spawn).
      const colMgr = window.KOSMOS?.colonyManager;
      const targetColony = colMgr?.getColony?.(targetId);
      const isHostileTarget = !targetColony
        || !!targetColony.ownerEmpireId
        || !!targetColony.isTestEnemy;
      if (isHostileTarget && warSys && !warSys.playerHasOrbitalDominance(targetId)) {
        this._showFlash('Brak dominacji orbitalnej — wygraj bitwę najpierw');
        return;
      }

      // Wybrane jednostki (z modalu) lub fallback na wszystkie
      const queueUnits = Array.isArray(unitIds) && unitIds.length > 0
        ? unitIds.filter(id => vessel.groundUnits.includes(id))
        : [...vessel.groundUnits];

      // Zapamiętaj skąd wracać po zakończeniu desantu (zwykle 'fleet').
      this._dropReturnOverlay = window.KOSMOS?.overlayManager?.active ?? 'fleet';
      this._dropMode = true;
      this._dropVesselId = vesselId;
      this._dropPlanetId = targetId;
      this._dropQueue = queueUnits;
      this._openAsColonyPanel(targetId);
      this._showDropPrompt();
    });

    // Zaznaczenie jednostki z Outlinera
    EventBus.on('groundUnit:select', ({ unitId }) => {
      const mgr = window.KOSMOS?.groundUnitManager;
      const unit = mgr?.getUnit(unitId);
      if (unit) {
        this._selectedUnit = unit;
        this._selectedHex = { q: unit.q, r: unit.r };
        // Wycentruj kamerę na jednostce
        const colony = this._getColony();
        const grid = colony ? this._getGrid(colony) : null;
        if (grid) {
          const pos = grid.tilePixelPos(unit.q, unit.r, this._hexSize);
          this._camX = pos.x;
          this._camY = pos.y;
        }
      }
    });
  }

  _createTooltipEl() {
    if (this._tooltipEl) return;
    const el = document.createElement('div');
    el.id = 'colony-tooltip';
    el.style.cssText = `
      position:fixed;z-index:50;pointer-events:none;
      display:none;max-width:320px;padding:8px 10px;
      background:rgba(6,12,20,0.96);border:1px solid #1a6e50;
      border-radius:4px;font-family:'Courier New',monospace;
      font-size:11px;color:#b0c4b0;line-height:1.45;
    `;
    document.body.appendChild(el);
    this._tooltipEl = el;
  }
  _showTooltip(html, sx, sy) {
    if (!this._tooltipEl) return;
    this._tooltipEl.innerHTML = html;
    this._tooltipEl.style.display = 'block';
    // Slice 5C.2 UX (review): FLIP na przeciwną stronę kursora gdy przy krawędzi — nie zasłaniaj kontrolki
    // POD kursorem (stary `min(sx+12, innerWidth-330)` przy prawej krawędzi dosuwał tooltip NA kontrolkę).
    const TW = 320, TH = 200;
    let left = sx + 14;
    if (left + TW > window.innerWidth - 8) left = Math.max(8, sx - TW - 14);   // przy prawej krawędzi → w lewo od kursora
    let top = sy - 10;
    if (top + TH > window.innerHeight - 8) top = Math.max(8, sy - TH - 10);    // przy dolnej krawędzi → w górę
    this._tooltipEl.style.left = `${left}px`;
    this._tooltipEl.style.top  = `${top}px`;
  }
  _hideTooltip() { if (this._tooltipEl) this._tooltipEl.style.display = 'none'; }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  show(opts = {}) {
    super.show();
    const colMgr = window.KOSMOS?.colonyManager;

    // Tryb podglądu — mapa ciała bez kolonii (analyzed). Wirtualna kolonia lokalna.
    if (opts.previewPlanet) {
      const p = opts.previewPlanet;
      this._previewMode = true;
      this._previewColony = {
        planetId: p.id, planet: p, buildingSystem: null,
        isPreview: true, isOutpost: false, isHomePlanet: false,
      };
      this._selectedColonyId = p.id;
      this._stationMode = false;
      this._selectedHex = null;
      this._hoveredBuildId = null;
      const grid = this._getGrid(this._previewColony);
      if (grid) { this._fitMapToView(grid); this._centerOnCapital(grid); }
      if (opts.originX !== undefined) this._animateOpen(opts.originX, opts.originY);
      return;
    }
    this._previewMode = false;
    this._previewColony = null;

    // opts.colonyId ma priorytet (np. drop mode na obcej planecie).
    // Inaczej: activePlanetId gracza.
    if (opts.colonyId) {
      this._selectedColonyId = opts.colonyId;
    } else if (colMgr) {
      this._selectedColonyId = colMgr.activePlanetId;
    }
    // S3.4 FAZA 3 — otwarcie w TRYBIE STACJI (np. z przycisku „Zarządzaj" w StationPanel).
    // Colony pozostaje ustawiona (tab bar/globus mają valid fallback), ale render idzie ekranem stacji.
    if (opts.stationMode && opts.stationId) {
      this._stationMode = true;
      this._selectedStationId = opts.stationId;
      this._stationPickerOpen = false;
    } else {
      this._stationMode = false;
    }
    this._selectedHex = null;
    this._hoveredBuildId = null;

    const colony = this._getColony();
    const grid = this._getGrid(colony);
    if (grid) { this._fitMapToView(grid); this._centerOnCapital(grid); }

    if (opts.originX !== undefined) this._animateOpen(opts.originX, opts.originY);

    // Auto-spawn rovera tylko na własnej planecie macierzystej — nie na obcym celu desantu
    if (!opts.colonyId) this._autoSpawnRover(colony);
  }

  _autoSpawnRover(colony) {
    if (!colony) return;
    // Tylko planeta macierzysta — nowe kolonie/outposty nie dostają darmowego rovera
    if (!colony.isHomePlanet) return;
    const mgr = window.KOSMOS?.groundUnitManager;
    if (!mgr) return;
    if (mgr.getUnitsOnPlanet(colony.planetId).length > 0) return;

    // Znajdź hex stolicy
    const bSys = colony.buildingSystem;
    let startQ = 0, startR = 0;
    if (bSys) {
      for (const [key] of bSys._active) {
        if (key.startsWith('capital_')) {
          const coords = key.replace('capital_', '').split(',').map(Number);
          startQ = coords[0]; startR = coords[1];
          break;
        }
      }
    }
    mgr.createUnit('science_rover', colony.planetId, startQ, startR);
  }

  hide() {
    super.hide();
    this._previewMode = false; this._previewColony = null;
    this._draftOpen = false; this._draftPanel?.hide();   // zamknij modal rekrutacji
    this._selectedHex = null; this._hoveredHex = null;
    this._selectedUnit = null;
    this._hideTooltip();
    this._teardownGlobe();   // zwolnij WebGL canvas globu (z-index 3 — nie może wisieć nad innymi overlay'ami)
    document.getElementById('colony-open-backdrop')?.remove();
    // Wymuś reset active w OverlayManager (nie czekaj na draw)
    const om = window.KOSMOS?.overlayManager;
    if (om && om.active === 'colony') om.active = null;
  }

  _fitMapToView(grid) {
    const canvas = document.getElementById('ui-canvas');
    if (!canvas) return;
    const _r = canvas.getBoundingClientRect(); const W = _r.width / _UI_SCALE, H = _r.height / _UI_SCALE;  // CSS-size (niezależne od DPR backing store)
    const { ow, oh } = this._getOverlayBounds(W, H);
    const mapW = (ow - this._infoW(ow)) - 20, mapH = oh - HDR_H - BUILD_BAR_H - 20;
    const gp = grid.gridPixelSize(1);
    this._hexSize = Math.max(this._minHexSize, Math.min(this._maxHexSize,
      Math.floor(Math.min(mapW / gp.w, mapH / gp.h) * 0.90)
    ));
  }

  _animateOpen(originX, originY) {
    let bd = document.getElementById('colony-open-backdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'colony-open-backdrop';
      bd.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;
        background:radial-gradient(circle at ${originX}px ${originY}px,rgba(2,4,8,0.95) 0%,rgba(2,4,8,0) 70%);
        opacity:0;transition:opacity 400ms ease;`;
      document.body.appendChild(bd);
    }
    bd.offsetHeight; bd.style.opacity = '1';
    setTimeout(() => bd?.remove(), 450);
  }

  // ── Dane ─────────────────────────────────────────────────────────────────
  _getColony() {
    // Tryb podglądu — wirtualna „kolonia" ciała bez faktycznej kolonii.
    if (this._previewMode && this._previewColony?.planetId === this._selectedColonyId) {
      return this._previewColony;
    }
    return window.KOSMOS?.colonyManager?.getColony(this._selectedColonyId) ?? null;
  }

  // S3.4 FAZA 3 — encja stacji pokazywanej w trybie stacji (null gdy zniknęła → wyjście z trybu).
  _getSelectedStation() {
    const s = EntityManager.get(this._selectedStationId);
    return s?.type === 'station' ? s : null;
  }

  // S3.4 FAZA 3 — deleguj render ekranu stacji do StationManagementView (addHit → _hitZones overlayu).
  _drawStationManagement(ctx, x, y, w, h, station) {
    drawStationManagement(ctx, { x, y, w, h }, station, {
      addHit: (hx, hy, hw, hh, type, data) => this._addHit(hx, hy, hw, hh, type, data),
      techIsResearched: (id) => window.KOSMOS?.techSystem?.isResearched?.(id) ?? false,
      // Ship picker buduje projekty gracza (parytet ze stocznią kolonijną — S3.4 FAZA 3 R2 / decyzja #10).
      designs: window.KOSMOS?.unitDesigns ?? [],
      pickerOpen: this._stationPickerOpen,
      shipPickerOpen: this._stationShipPickerOpen,
    });
  }

  _getGrid(colony) {
    if (!colony) return null;
    const pid = colony.planetId;

    // Podgląd — czysty teren (bez stolicy/budynków), osobny cache by nie zderzyć się
    // z realną kolonią gdyby powstała na tym samym ciele.
    if (colony.isPreview) {
      if (this._previewGridCache[pid]) return this._previewGridCache[pid];
      const g = PlanetMapGenerator.generate(colony.planet, false);
      this._previewGridCache[pid] = g;
      colony.grid = g;
      this._loadBiomeMap(colony.planet, g, pid);   // async — biomy 1:1 z teksturą 3D
      return g;
    }

    if (this._gridCache[pid]) return this._gridCache[pid];

    // Uszanuj istniejący grid zamiast regenerować, gdy:
    //  • kolonia obca (spawnTestEnemy/EmpireGenerator ustawił grid z owner+capital), LUB
    //  • kolonia gracza z gridem z SAVE (kafle niosą stan: syntheticSlot/droidy, owner).
    // ⚠ ROOT-CAUSE (Faza 4): dawny guard obejmował tylko `isHostileColony` → grid gracza był
    // regenerowany po każdym reloadzie, gubiąc syntheticSlot (droidy znikały; BUG A/B/C).
    const isHostileColony = !!colony.ownerEmpireId || !!colony.isTestEnemy;
    if (shouldReuseColonyGrid(colony, isHostileColony)) {
      this._gridCache[pid] = colony.grid;
      const bSys = colony.buildingSystem;
      if (bSys) {
        // Zsynchronizuj BuildingSystem z tą SAMĄ instancją grida (install/energyChain/render
        // muszą czytać/pisać jeden grid). Dla kolonii gracza z save inaczej bSys._grid = null.
        bSys._grid = colony.grid;
        bSys._gridHeight = colony.grid.height ?? 10;
        if (typeof bSys.setDeposits === 'function') bSys.setDeposits(colony.planet?.deposits ?? []);
      }
      this._loadBiomeMap(colony.planet, colony.grid, pid);   // biomy nie są serializowane (async)
      this._syncTileBuildings(colony.grid, bSys);
      return colony.grid;
    }

    // Generuj grid z planety
    const isHome = (pid === window.KOSMOS?.homePlanet?.id);
    const grid = PlanetMapGenerator.generate(colony.planet, isHome);
    this._gridCache[pid] = grid;
    colony.grid = grid;

    // Domyślny owner: dla obcej kolonii → empireId/isTestEnemy, inaczej → 'player'.
    // Nie nadpisuje hexów które już mają ownera (np. po invasion).
    const defaultOwner = colony.ownerEmpireId
      ?? (colony.isTestEnemy ? 'enemy' : 'player');
    for (const tile of grid.toArray()) {
      if (tile && tile.owner == null) tile.owner = defaultOwner;
    }

    // Próbuj załadować biome map (1:1 z 3D teksturą) — fallback: PlanetMapGenerator biomy
    this._loadBiomeMap(colony.planet, grid, pid);

    // Ustaw gridHeight, deposits i tryb w BuildingSystem (krytyczne!)
    const bSys = colony.buildingSystem;
    if (bSys) {
      bSys._gridHeight = grid.height ?? 10;
      bSys._grid = grid;
      if (typeof bSys.setDeposits === 'function') {
        bSys.setDeposits(colony.planet?.deposits ?? []);
      }
      if (typeof bSys.setRegionMode === 'function') {
        bSys.setRegionMode(false); // hex grid, nie regiony
      }
    }

    // Auto-place stolicy przy pierwszym otwarciu (jeśli brak).
    // Pomiń dla obcych/test-enemy kolonii — ich capital stawia spawnTestEnemy/EmpireGenerator.
    const isOutpost = colony.isOutpost ?? false;
    if (bSys && window.KOSMOS?.civMode && !isOutpost && !isHostileColony) {
      let hasCapital = false;
      for (const key of bSys._active.keys()) {
        if (key.startsWith('capital_')) { hasCapital = true; break; }
      }
      if (!hasCapital) {
        const baseTile = this._findBestTileForCapital(grid);
        if (baseTile) {
          EventBus.emit('planet:buildRequest', { tile: baseTile, buildingId: 'colony_base' });
          // Invaliduj cache ZAWSZE — kolejne _getGrid zsynchronizuje stolicę
          // (postawioną tu od razu, albo przez autoPlaceBuilding w
          // ColonyManager._onColonyFounded gdy kolonia jeszcze nie ma surowców).
          delete this._gridCache[pid];
          // Re-sync (rekurencja) TYLKO gdy stolica faktycznie trafiła do _active.
          // Gdy kolonia nie stać na colony_base, _build wrzuca ją do kolejki
          // pending → stolica NIE jest w _active. Bez tego warunku _getGrid
          // rekurowałby w nieskończoność (stack overflow łapany po cichu przez
          // try/catch EventBus). Fall-through zwraca bieżący grid; cache jest
          // skasowany, więc po autoPlaceBuilding następne wejście pokaże stolicę.
          let placed = false;
          for (const key of bSys._active.keys()) {
            if (key.startsWith('capital_')) { placed = true; break; }
          }
          if (placed) return this._getGrid(colony);
        }
      }
    }

    this._syncTileBuildings(grid, bSys);
    return grid;
  }

  // Znajdź najlepszy hex na stolicę (równiny/las w środku mapy)
  _findBestTileForCapital(grid) {
    const center = grid.gridCenter(1); // pixel center at size=1
    let bestTile = null, bestDist = Infinity;
    const preferred = ['plains', 'forest'];
    grid.forEach(tile => {
      if (tile.type === 'ocean' || tile.type === 'ice_sheet') return;
      const pos = grid.tilePixelPos(tile.q, tile.r, 1);
      const dx = pos.x - center.x, dy = pos.y - center.y;
      let dist = dx * dx + dy * dy;
      if (preferred.includes(tile.type)) dist *= 0.5; // preferuj równiny/las
      if (dist < bestDist) { bestDist = dist; bestTile = tile; }
    });
    return bestTile;
  }

  _syncTileBuildings(grid, bSys) {
    if (!grid || !bSys) return;
    // Wyczyść stany budynków
    grid.forEach(tile => {
      tile.buildingId = null; tile.buildingLevel = 1;
      tile.capitalBase = false; tile.underConstruction = null; tile.pendingBuild = null;
    });
    // Aktywne budynki
    for (const [tileKey, entry] of bSys._active) {
      if (tileKey.startsWith('capital_')) {
        const coords = tileKey.slice(8).split(',').map(Number);
        const t = grid.get(coords[0], coords[1]);
        if (t) t.capitalBase = true;
        continue;
      }
      const [q, r] = tileKey.split(',').map(Number);
      const t = grid.get(q, r);
      if (t) { t.buildingId = entry.building.id; t.buildingLevel = entry.level ?? 1; }
    }
    // Budowa w toku
    if (bSys._constructionQueue) {
      for (const [tileKey, constr] of bSys._constructionQueue) {
        const [q, r] = tileKey.split(',').map(Number);
        const t = grid.get(q, r);
        if (t) t.underConstruction = constr;
      }
    }
    // Oczekujące zamówienia (pending queue)
    if (bSys._pendingQueue) {
      for (const [tileKey, order] of bSys._pendingQueue) {
        const [q, r] = tileKey.split(',').map(Number);
        const t = grid.get(q, r);
        if (t) t.pendingBuild = order.buildingId ?? order.building?.id;
      }
    }
    // Aktualizuj _grid w BuildingSystem
    bSys._grid = grid;
  }

  // planetId opcjonalny — gdy podany, syncuj grid TEJ kolonii (nawet jeśli nie wyświetlana).
  // Konieczne dla constructionComplete/constructionProgress/pendingFulfilled, które ticki
  // mogą emitować dla każdej kolonii niezależnie od aktualnie otwartej.
  // Bez tego: gdy budowa kończy się na nieaktywnej kolonii, jej cached grid pozostaje
  // ze stale referencją do skasowanego entry → pasek "100%" zamrożony po powrocie.
  _onBuildingChanged(planetId = null) {
    if (planetId) {
      const grid = this._gridCache[planetId];
      if (!grid) return;  // grid nie był jeszcze cache'owany — _getGrid zsynchronizuje przy otwarciu
      const colony = window.KOSMOS?.colonyManager?.getColony(planetId);
      if (colony?.buildingSystem) this._syncTileBuildings(grid, colony.buildingSystem);
      return;
    }
    // Legacy: bez planetId — syncuj aktualnie wyświetlaną kolonię
    const colony = this._getColony();
    if (!colony) return;
    const grid = this._gridCache[colony.planetId];
    if (grid) this._syncTileBuildings(grid, colony.buildingSystem);
  }

  _centerOnCapital(grid) {
    // Centrujemy na bounding boxie wszystkich hexów. Wcześniej kamera celowała
    // w capital, ale gdy stolica wylądowała daleko od środka siatki (ocean/lód
    // w centrum + fallback na obrzeża), cała mapa była przesunięta. Bbox center
    // gwarantuje że widoczna jest pełna planeta przy otwarciu, niezależnie od
    // miejsca capital.
    const hs = this._hexSize;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    grid.forEach(tile => {
      const pos = grid.tilePixelPos(tile.q, tile.r, hs);
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    });
    if (minX === Infinity) {
      const c = grid.gridCenter(hs);
      this._camX = c.x; this._camY = c.y;
      return;
    }
    this._camX = (minX + maxX) / 2;
    this._camY = (minY + maxY) / 2;
  }

  _showFlash(msg) { this._flashMsg = msg; this._flashEnd = Date.now() + 2500; }

  // Czy dany planetId to aktualnie wyświetlana kolonia (do gate'owania flashy stacji)
  _isActivePlanet(planetId) {
    const activePid = this._selectedColonyId ?? window.KOSMOS?.colonyManager?.activePlanetId;
    return !!planetId && planetId === activePid;
  }

  /**
   * Czy jest contested hex w zasięgu jednostki ranged?
   */
  _hasSupportCandidates(unit, combatSystem) {
    if (!combatSystem) return false;
    const gum = window.KOSMOS?.groundUnitManager;
    if (!gum) return false;
    const range = unit.range ?? 1;
    for (const u of gum._units.values()) {
      if (u.planetId !== unit.planetId) continue;
      const d = this._hexDist(unit.q, unit.r, u.q, u.r);
      if (d === 0 || d > range) continue;
      if (combatSystem.isHexContested(unit.planetId, u.q, u.r)) return true;
    }
    return false;
  }

  _hexDist(q1, r1, q2, r2) {
    const s1 = -q1 - r1, s2 = -q2 - r2;
    return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(s1 - s2)) / 2;
  }

  // ── Multi-select helpers ──────────────────────────────────────────────
  /**
   * Zaznacz pojedynczą jednostkę (nadpisz cały select).
   */
  _selectSingle(unit) {
    this._selectedUnits.clear();
    if (unit) this._selectedUnits.add(unit.id);
    this._selectedUnit = unit ?? null;
  }

  /**
   * Toggle: jeśli jest w selectie usuń, inaczej dodaj (dla Shift/Ctrl click).
   * Tylko player-owned (chroni przed sterowaniem wrogiem).
   */
  _toggleInSelection(unit) {
    if (!unit) return;
    if (unit.owner && unit.owner !== 'player') return;  // wrogi: pomiń
    if (this._selectedUnits.has(unit.id)) {
      this._selectedUnits.delete(unit.id);
      if (this._selectedUnit?.id === unit.id) {
        // Primary wskazuje na usuwaną → znajdź nową primary
        const gum = window.KOSMOS?.groundUnitManager;
        const firstId = [...this._selectedUnits][0];
        this._selectedUnit = firstId ? (gum?.getUnit?.(firstId) ?? null) : null;
      }
    } else {
      this._selectedUnits.add(unit.id);
      this._selectedUnit = unit;
    }
  }

  /**
   * Wyczyść wszystkie zaznaczenia.
   */
  _clearSelection() {
    this._selectedUnits.clear();
    this._selectedUnit = null;
  }

  /**
   * Zwróć tablicę zaznaczonych jednostek (żywych i nadal istniejących).
   */
  _getSelectedUnits() {
    const gum = window.KOSMOS?.groundUnitManager;
    const out = [];
    for (const id of this._selectedUnits) {
      const u = gum?.getUnit?.(id);
      if (u) out.push(u);
    }
    return out;
  }

  /**
   * Tylko player-owned z selectu (dla rozkazów).
   */
  _getSelectedPlayerUnits() {
    return this._getSelectedUnits().filter(u => !u.owner || u.owner === 'player');
  }

  /**
   * Otwórz ColonyOverlay dla konkretnej planety (własnej LUB obcej) przez OverlayManager.
   * To kluczowe: sama `this.show()` ustawia lokalnie visible=true ale OverlayManager.active
   * zostaje na poprzednim panelu (np. 'fleet') — w efekcie ColonyOverlay nie dostaje
   * rysowania ani kliknięć. openPanel zamyka poprzedni panel i aktywuje 'colony'.
   */
  _openAsColonyPanel(planetId) {
    const om = window.KOSMOS?.overlayManager;
    if (om) {
      om.openPanel('colony', { colonyId: planetId });
    } else {
      // Fallback dla środowisk bez OverlayManager (testy headless)
      this.show({ colonyId: planetId });
    }
  }

  /**
   * Zakończ tryb desantu: wyczyść stan, flash + po 1.5s wróć do poprzedniego overlay'a
   * (zwykle 'fleet'), żeby gracz mógł kontynuować zarządzanie flotą.
   */
  _finishDropMode(flashMsg = '⚔ Desant zakończony') {
    this._dropMode = false;
    this._dropVesselId = null;
    this._dropPlanetId = null;
    this._dropQueue = [];
    this._showFlash(flashMsg);

    const returnTo = this._dropReturnOverlay;
    this._dropReturnOverlay = null;
    if (returnTo && returnTo !== 'colony') {
      setTimeout(() => {
        const om = window.KOSMOS?.overlayManager;
        if (om) om.openPanel(returnTo);
      }, 1500);
    }
  }

  /**
   * Wyświetl prompt dla bieżącej jednostki w kolejce desantu.
   * Pokazuje nazwę archetypu + ile jeszcze zostało do zrzucenia.
   */
  _showDropPrompt() {
    const gum = window.KOSMOS?.groundUnitManager;
    const unitId = this._dropQueue[0];
    const unit = gum?.getUnit?.(unitId);
    if (!unit) return;
    // Prosta nazwa po archetypie (unitArchetypes i18n w UI jest lżejsze)
    const archId = unit.archetypeId ?? 'unit';
    const remaining = this._dropQueue.length;
    this._showFlash(`⚔ Zrzut ${archId} — wybierz hex (${remaining} ${remaining === 1 ? 'jednostka' : 'jednostek'})`);
  }

  // ── Pozycja hexa na ekranie ──────────────────────────────────────────────
  _tileScreenPos(tile, grid, ox, oy, ow, oh) {
    const pos = grid.tilePixelPos(tile.q, tile.r, this._hexSize);
    return {
      x: ox + ow / 2 - this._camX + pos.x,
      y: oy + HDR_H + (oh - HDR_H) / 2 - this._camY + pos.y,
    };
  }

  // ── DRAW ─────────────────────────────────────────────────────────────────
  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    this._infoView = null;   // C4 — pasmo scrolla ważne tylko gdy info panel narysowany TĄ klatką (nie: tryb stacji / brak planety)

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    // Ciemne tło
    ctx.fillStyle = 'rgba(2, 4, 8, 0.92)';
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = THEME.borderActive; ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    const colony = this._getColony();
    const grid = colony ? this._getGrid(colony) : null;

    // Nagłówek z podsumowaniem kolonii (pełna szerokość — pasmo tytułu nad splitem)
    this._drawHeader(ctx, ox, oy, ow, colony);

    // S3.4 FAZA 3 — TRYB STACJI: ekran zarządzania zamiast mapy hex (gate całego bloku mapy).
    if (this._stationMode) {
      const station = this._getSelectedStation();
      if (station) {
        this._drawStationManagement(ctx, ox, oy + HDR_H, ow, oh - HDR_H, station);
      } else {
        this._stationMode = false;   // stacja zniknęła (destroy) → powrót do mapy planety
      }
    } else {

    // Split 70/30: mapa hex po lewej (mapW), dossier planety po prawej (infoW).
    const infoW = this._infoW(ow);
    const mapW  = ow - infoW;
    const colTop = oy + HDR_H;          // szczyt treści pod nagłówkiem
    // Pasek listy budynków nad mapą (tylko kolumna mapy) — ukryty w podglądzie (brak kolonii).
    if (!colony?.isPreview) this._drawBuildingsBar(ctx, ox, colTop, mapW, BUILD_BAR_H, colony);
    const mapY = colTop + BUILD_BAR_H;
    const mapH = oh - HDR_H - BUILD_BAR_H;
    if (grid) {
      ctx.save();
      ctx.beginPath(); ctx.rect(ox, mapY, mapW, mapH); ctx.clip();
      this._drawMap(ctx, ox, mapY, mapW, mapH, grid, colony?.planet);
      ctx.restore();
    }

    // Prawa kolumna — dossier planety (globus 3D + charakterystyka/surowce); pełna wysokość
    this._drawInfoPanel(ctx, ox + mapW, colTop, infoW, oh - HDR_H, colony, grid);

    // Floating panel obok zaznaczonego hexa (nie pokazuj gdy jednostka zaznaczona).
    // Clampowany do obszaru MAPY (ox..ox+mapW), żeby nie wchodził pod kolumnę info.
    if (this._selectedHex && !this._selectedUnit && grid && colony && !colony.isPreview) {
      const tile = grid.get(this._selectedHex.q, this._selectedHex.r);
      if (tile) {
        // Jeśli na hexie jest stack (≥2 player units) → pokaż stack panel
        const gum = window.KOSMOS?.groundUnitManager;
        const playerStack = gum?.getUnitsAtHex?.(colony.planetId, tile.q, tile.r)
          .filter(u => !u.owner || u.owner === 'player') ?? [];
        if (playerStack.length >= 2) {
          const sp = this._tileScreenPos(tile, grid, ox, oy, mapW, oh);
          let fx = sp.x + this._hexSize + 8;
          let fy = sp.y - 60;
          const STACK_W = 240;
          if (fx + STACK_W > ox + mapW - 10) fx = sp.x - STACK_W - this._hexSize - 8;
          fx = Math.max(ox + 4, Math.min(ox + mapW - STACK_W - 4, fx));
          fy = Math.max(mapY + 4, fy);
          this._floatX = fx; this._floatY = fy;
          this._drawStackFloatingPanel(ctx, fx, fy, STACK_W, playerStack, tile);
        } else {
          // Zwykły panel budowy
          const sp = this._tileScreenPos(tile, grid, ox, oy, mapW, oh);
          let fx = sp.x + this._hexSize + 8;
          let fy = sp.y - 60;
          if (fx + FLOAT_W > ox + mapW - 10) fx = sp.x - FLOAT_W - this._hexSize - 8;
          const panelH = this._floatH ?? 300;
          fy = Math.max(mapY + 4, Math.min(oy + oh - panelH - 4, fy));
          fx = Math.max(ox + 4, Math.min(ox + mapW - FLOAT_W - 4, fx));
          this._floatX = fx; this._floatY = fy;
          // Dostępny pion dla panelu = cały obszar mapy (panel dosuwany w górę powyżej) —
          // pozwala zmieścić wysokie panele budynków bez przycinania; nadmiar → scroll.
          this._floatMapTop = mapY + 4;
          this._floatMapBot = oy + oh - 4;
          this._drawFloatingPanel(ctx, fx, fy, tile, colony, grid);
        }
      }
    }

    // Panel jednostki naziemnej (dolny-prawy róg MAPY, nie pod kolumną info)
    if (this._selectedUnit && colony) {
      this._drawUnitPanel(ctx, ox, oy, mapW, oh);
    }

    // Bottom Drawer (Paradox HoI4-style) — pas pod mapą gdy coś zaznaczone
    if (this._selectedUnits.size > 0 && colony) {
      this._drawBottomDrawer(ctx, ox, oy, mapW, oh);
    }

    // Station build dialog (S3.3b-S4) — modal wyśrodkowany nad mapą
    if (this._stationDialogOpen && colony && !colony.ownerEmpireId && !colony.isTestEnemy) {
      this._drawStationDialog(ctx, ox, oy, mapW, oh, colony);
    }

    // Landing mode indicator (pas na szczycie mapy)
    if (this._landingMode) {
      const t = Date.now() / 1000;
      const pulse = (Math.sin(t * 3) + 1) / 2;
      ctx.fillStyle = `rgba(0, 200, 160, ${0.08 + pulse * 0.06})`;
      ctx.fillRect(ox, mapY, mapW, 22);
      ctx.font = `bold 11px ${THEME.fontFamily}`;
      ctx.fillStyle = `rgba(0, 255, 180, ${0.7 + pulse * 0.3})`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🤖 WYBIERZ HEX LĄDOWANIA — kliknij na mapie', ox + mapW / 2, mapY + 11);
    }

    // Rect-select (LMB drag) — live-preview obwódek jednostek wewnątrz prostokąta
    if (this._rectSelect.active) {
      const bounds = this._getRectSelectBounds();
      if (bounds) {
        const previewIds = this._onRectSelectPreview(bounds);
        if (previewIds && previewIds.size > 0) {
          const colony = this._getColony();
          const grid = colony ? this._getGrid(colony) : null;
          if (grid) {
            const mapBounds = this._getMapBounds();
            if (mapBounds) {
              const cx = mapBounds.ox + mapBounds.ow / 2 - this._camX;
              const cy = mapBounds.oy + mapBounds.oh / 2 - this._camY;
              const gum = window.KOSMOS?.groundUnitManager;
              for (const uid of previewIds) {
                const u = gum?.getUnit?.(uid);
                if (!u) continue;
                const pos = grid.tilePixelPos(u.q, u.r, this._hexSize);
                this._drawRectSelectPreviewOutline(ctx, cx + pos.x, cy + pos.y, 14);
              }
            }
          }
        }
      }
      // Właściwy prostokąt zaznaczenia (mint, spójny z resztą UI)
      this._drawRectSelect(ctx);
    }

    }   // koniec bloku !_stationMode (mapa hex)

    // Flash message
    if (this._flashMsg && Date.now() < this._flashEnd) {
      const fA = Math.min(1, (this._flashEnd - Date.now()) / 500);
      ctx.save(); ctx.globalAlpha = fA;
      ctx.font = `bold 12px ${THEME.fontFamily}`;
      const tw = ctx.measureText(this._flashMsg).width;
      const fx = ox + ow / 2 - tw / 2 - 10, fy = oy + oh - 30;
      ctx.fillStyle = 'rgba(40,10,10,0.92)';
      ctx.fillRect(fx, fy, tw + 20, 22);
      ctx.strokeStyle = '#ff4444'; ctx.strokeRect(fx, fy, tw + 20, 22);
      ctx.fillStyle = '#ffaaaa'; ctx.textAlign = 'center';
      ctx.fillText(this._flashMsg, ox + ow / 2, fy + 15);
      ctx.restore();
    }

    // Przycisk budowy stacji (S3.3b-S4) — nagłówek, na lewo od [✕]. Bramka tech orbital_construction.
    // W trybie stacji ukryty (dotyczy budowy NOWEJ stacji z kolonii, nie zarządzania bieżącą).
    if (!this._stationMode && colony && !colony.isPreview && !colony.ownerEmpireId && !colony.isTestEnemy) {
      ctx.save();
      const hasStationTech = window.KOSMOS?.techSystem?.isResearched('orbital_construction') ?? false;
      const sBtnW = 84, sBtnH = 20, sBtnY = oy + 6, sBtnX = ox + ow - 116;
      ctx.fillStyle = this._stationDialogOpen ? 'rgba(40,70,90,0.92)'
                    : (hasStationTech ? 'rgba(20,40,60,0.82)' : 'rgba(22,22,30,0.55)');
      ctx.fillRect(sBtnX, sBtnY, sBtnW, sBtnH);
      ctx.strokeStyle = hasStationTech ? (THEME.borderActive ?? '#3a6') : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1; ctx.strokeRect(sBtnX, sBtnY, sBtnW, sBtnH);
      ctx.font = `bold 11px ${THEME.fontFamily}`;
      ctx.fillStyle = hasStationTech ? THEME.accent : THEME.textDim;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${hasStationTech ? '🛰' : '🔒'} ${t('station.headerBtn')}`, sBtnX + sBtnW / 2, sBtnY + sBtnH / 2);
      ctx.restore();
      this._addHit(sBtnX, sBtnY, sBtnW, sBtnH, 'station_open', { hasTech: hasStationTech });
    }

    // Przycisk rekrutacji jednostek (na lewo od stacji) — SCOPED do tej kolonii.
    // Bramka: kolonia gracza (nie podgląd/wróg) + koszary. Brak koszar → disabled + powód.
    if (!this._stationMode && colony && !colony.isPreview && !colony.ownerEmpireId && !colony.isTestEnemy) {
      const barracksLv  = window.KOSMOS?.colonyManager?._getBarracksLevel?.(colony) ?? 0;
      const hasBarracks = barracksLv > 0;
      const dBtnW = 84, dBtnH = 20, dBtnY = oy + 6, dBtnX = ox + ow - 206;
      ctx.save();
      ctx.fillStyle = this._draftOpen ? 'rgba(40,70,90,0.92)'
                    : (hasBarracks ? 'rgba(20,40,60,0.82)' : 'rgba(22,22,30,0.55)');
      ctx.fillRect(dBtnX, dBtnY, dBtnW, dBtnH);
      ctx.strokeStyle = hasBarracks ? (THEME.borderActive ?? '#3a6') : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1; ctx.strokeRect(dBtnX, dBtnY, dBtnW, dBtnH);
      ctx.font = `bold 11px ${THEME.fontFamily}`;
      ctx.fillStyle = hasBarracks ? THEME.accent : THEME.textDim;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${hasBarracks ? '🎖' : '🔒'} ${t('groundPanel.draftBtn')}`, dBtnX + dBtnW / 2, dBtnY + dBtnH / 2);
      ctx.restore();
      this._addHit(dBtnX, dBtnY, dBtnW, dBtnH, 'draft_open', { hasBarracks });
    }

    // Zamknij [X]
    const closeX = ox + ow - 24;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
    ctx.fillText('✕', closeX, oy + 20);
    this._addHit(closeX - 4, oy + 6, 22, 22, 'close');

    // Modal rekrutacji — rysowany OSTATNI (na wierzchu). Klik/hover/scroll izolowane
    // w handleClick/handleMouseMove/handleScroll gdy _draftOpen (true modal).
    if (this._draftOpen && !this._stationMode && colony && !colony.isPreview
        && !colony.ownerEmpireId && !colony.isTestEnemy) {
      this._drawDraftModal(ctx, ox, oy, ow, oh);
    }
  }

  /** Modal rekrutacji jednostek naziemnych — panel scoped do this._getColony(). */
  _drawDraftModal(ctx, ox, oy, ow, oh) {
    ctx.save();
    // Backdrop przyciemniający kolonię
    ctx.fillStyle = 'rgba(2,6,10,0.55)';
    ctx.fillRect(ox, oy, ow, oh);

    // Panel wyśrodkowany
    const DW = Math.min(384, ow - 40);
    const DH = Math.min(560, oh - 40);
    const dx = Math.round(ox + ow / 2 - DW / 2);
    const dy = Math.round(oy + Math.max(HDR_H + 8, oh / 2 - DH / 2));

    ctx.fillStyle = 'rgba(6,12,20,0.98)';
    ctx.fillRect(dx, dy, DW, DH);
    ctx.strokeStyle = THEME.borderActive ?? '#3a6'; ctx.lineWidth = 1.5;
    ctx.strokeRect(dx, dy, DW, DH);

    // [✕] close — hit PRZED panelem (priorytet; short-circuit i tak filtruje strefy draftu)
    this._addHit(dx + DW - 24, dy + 4, 22, 22, 'draft_close');

    // Panel rekrutacji (dodaje własne strefy 'ground:*' podczas draw)
    this._draftPanel.draw(ctx, dx, dy, DW, DH);

    // Glyph [✕] na wierzchu panelu
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('✕', dx + DW - 8, dy + 18);
    ctx.textAlign = 'left';

    // Tło modalu na KOŃCU — absorber (wzór station dialog)
    this._addHit(dx, dy, DW, DH, 'draftDialogBg');
    ctx.restore();
  }

  // ── Nagłówek (standard: BaseOverlay._drawOverlayHeader — pasmo 44 + tytuł + linia) ──
  _drawHeader(ctx, ox, oy, ow, colony) {
    if (!colony) {
      this._drawOverlayHeader(ctx, ox, oy, ow, 'Brak kolonii');
      return;
    }

    // Podgląd — tytuł = nazwa ciała (bez zakładek kolonii ani POP).
    if (colony.isPreview) {
      const nm = colony.planet?.name ?? colony.planetId ?? '?';
      this._drawOverlayHeader(ctx, ox, oy, ow, `${nm} — ${t('colonyInfo.previewTag')}`);
      return;
    }

    const name = colony.planet?.name ?? colony.planetId ?? '?';
    const isPlayer = !colony.ownerEmpireId && !colony.isTestEnemy;

    if (!isPlayer) {
      // Obca planeta (drop-mode) — zwykły tytuł, bez zakładek przełączania.
      this._drawOverlayHeader(ctx, ox, oy, ow, name);
      return;
    }

    // Pasmo + linia bez tytułu — w rzędzie 1 idą zakładki kolonii gracza.
    this._drawOverlayHeader(ctx, ox, oy, ow, '');
    this._drawColonyTabs(ctx, ox, oy, ow);

    // Rząd 2: POP aktywnej kolonii (budynki → pasek nad mapą). W trybie stacji ukryte
    // (ekran stacji ma własny nagłówek z załogą/energią) — nie mieszaj danych kolonii i stacji.
    if (!this._stationMode) {
      const civ = colony.civSystem;
      // Population 2.0: floor(humans)/capacity + satysfakcja (§3.5). Pełna zakładka Workforce = Faza 2.
      const pop = Math.floor(civ?.humans ?? civ?.population ?? 0);
      const capacity = civ?.housing ?? 0;
      const sat = Math.round(civ?.satisfaction ?? 50);
      const growth = civ?.getAnnualGrowth?.() ?? 0;   // Population 2.0: wzrost logistyczny (jednostki POP/rok, §3.1)
      ctx.textBaseline = 'alphabetic';
      ctx.font = `11px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'left';
      const popStr = `POP: ${pop}/${capacity}  +${growth.toFixed(1)}/rok  ☺ ${sat}%`;
      ctx.fillText(popStr, ox + 14, oy + 38);

      // Orbital Logistics Hub — wskaźnik linku INLINE z klastrem POP (lewa strona, rząd 2), by czytać
      // status linku jako część witalności kolonii. font 11px (jak POP) — measureText poprawne.
      const hubLink = window.KOSMOS?.systemPoolService?.getHubLinkInfo?.(colony.planetId);
      if (hubLink) {
        const txt = hubLink.status === 'linked'
          ? (hubLink.anchorPlanetId === colony.planetId ? t('colony.hubLinked') : `${t('colony.hubLinked')} ▸ ${hubLink.anchorName}`)
          : t('colony.hubLinkSevered');
        const popW = ctx.measureText(popStr).width;
        ctx.fillStyle = hubLink.status === 'linked' ? THEME.accent : THEME.danger;
        ctx.fillText(txt, ox + 14 + popW + 16, oy + 38);   // tuż za klastrem POP/☺ (gap 16)
      }
    }
  }

  // ── Zakładki kolonii gracza (przełączanie aktywnej kolonii z nagłówka) ─────
  // Pigułki: aktywna = akcent, reszta stonowana. Nadmiar → poziome przewijanie
  // kółkiem nad nagłówkiem (wskaźniki ‹ ›). Klik → _switchColony.
  _drawColonyTabs(ctx, ox, oy, ow) {
    const colMgr = window.KOSMOS?.colonyManager;
    const colonies = colMgr?.getPlayerColonies?.() ?? [];
    if (!colonies.length) return;

    const activeId = this._selectedColonyId;
    const stationMode = this._stationMode;
    const tabY = oy + 5, tabH = 20;
    const x0 = ox + 14;
    const xRight = ox + ow - 130;          // miejsce na [🛰 Station] + [✕]
    const availW = Math.max(40, xRight - x0);

    // Zmierz pigułki: kolonie gracza + stacje gracza (🛰). Stacje = osobny typ hitu (tryb stacji).
    ctx.font = `bold 11px ${THEME.fontFamily}`;
    const tabs = [];
    let totalW = 0;
    for (const c of colonies) {
      const nm = c.planet?.name ?? c.planetId ?? '?';
      const label = nm.length > 16 ? nm.slice(0, 15) + '…' : nm;
      const tw = ctx.measureText(label).width + 22;
      tabs.push({ kind: 'colony', id: c.planetId, label, tw, active: !stationMode && c.planetId === activeId });
      totalW += tw + 6;
    }
    // Stacje gracza (mgła wojny: tylko własne). Encja stacji ma name + type='station'.
    const stations = (window.KOSMOS?.stationSystem?.getAllStations?.() ?? [])
      .filter(s => !s.ownerEmpireId || s.ownerEmpireId === 'player');
    for (const s of stations) {
      const nm = `🛰 ${s.name ?? s.id}`;
      const label = nm.length > 16 ? nm.slice(0, 15) + '…' : nm;
      const tw = ctx.measureText(label).width + 22;
      tabs.push({ kind: 'station', id: s.id, label, tw, active: stationMode && s.id === this._selectedStationId });
      totalW += tw + 6;
    }
    totalW = Math.max(0, totalW - 6);

    // Clamp scrollu do zawartości
    const maxScroll = Math.max(0, totalW - availW);
    this._colonyTabScroll = Math.max(0, Math.min(maxScroll, this._colonyTabScroll ?? 0));
    const scroll = this._colonyTabScroll;

    // Clip do strefy zakładek i rysuj
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 - 2, oy, availW + 4, HDR_H); ctx.clip();
    let sx = x0 - scroll;
    for (const tab of tabs) {
      const visible = sx + tab.tw > x0 && sx < xRight;
      if (visible) {
        ctx.fillStyle = tab.active ? THEME.accentDim : 'rgba(255,255,255,0.03)';
        ctx.fillRect(sx, tabY, tab.tw, tabH);
        ctx.strokeStyle = tab.active ? THEME.accent : THEME.borderLight;
        ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, tabY + 0.5, tab.tw - 1, tabH - 1);
        ctx.fillStyle = tab.active ? THEME.accent : THEME.textSecondary;
        ctx.font = `bold 11px ${THEME.fontFamily}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tab.label, sx + tab.tw / 2, tabY + tabH / 2);
        if (tab.kind === 'station') this._addHit(sx, tabY, tab.tw, tabH, 'stationTab', { stationId: tab.id });
        else                        this._addHit(sx, tabY, tab.tw, tabH, 'colonyTab', { planetId: tab.id });
      }
      sx += tab.tw + 6;
    }
    ctx.restore();

    // Wskaźniki przewijania ‹ ›
    ctx.font = `bold 13px ${THEME.fontFamily}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    if (scroll > 0)         { ctx.fillStyle = THEME.accent; ctx.fillText('‹', x0 - 7, tabY + tabH / 2); }
    if (scroll < maxScroll) { ctx.fillStyle = THEME.accent; ctx.fillText('›', xRight + 7, tabY + tabH / 2); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Przełącz aktywną kolonię (z zakładki nagłówka). Podmienia systemy w
  // window.KOSMOS (cała gra podąża) + przeładowuje mapę/globus overlayu.
  _switchColony(planetId) {
    if (!planetId || planetId === this._selectedColonyId) return;
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr?.getColony(planetId)) return;
    colMgr.switchActiveColony(planetId);
    this._selectedColonyId = planetId;
    this._selectedHex = null; this._hoveredHex = null;
    this._selectedUnit = null; this._selectedUnits.clear();
    this._buildBarScroll = 0; this._stationDialogOpen = false;
    this._stationMode = false; this._stationPickerOpen = false;   // S3.4 FAZA 3 — powrót do mapy planety
    const colony = this._getColony();
    const grid = colony ? this._getGrid(colony) : null;
    if (grid) { this._fitMapToView(grid); this._centerOnCapital(grid); }
    // Globus re-syncuje się sam przy następnym draw (zmiana _globePlanetId).
  }

  // ── Panel info planety (prawa kolumna 30%) ────────────────────────────────
  // Górę zajmuje żywy globus 3D (PlanetGlobeRenderer, osobny DOM canvas nad
  // ui-canvas). Poniżej dossier: charakterystyka, pierwiastki, surowce, budynki.
  _drawInfoPanel(ctx, x, y, w, h, colony, grid) {
    const planet = colony?.planet ?? null;

    // Pionowy separator mapa | panel (tło = standardowe ciemne tło overlayu)
    ctx.strokeStyle = THEME.borderActive; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + h); ctx.stroke();

    if (!planet) { this._teardownGlobe(); return; }
    const pad = 12;

    // ── Globus 3D (góra) ──
    // Globus to osobny DOM canvas (z-index:3) NAD ui-canvas — drawer rysowany na
    // ui-canvas nie może go zakryć. Dlatego kurczymy/przesuwamy globus tak, by nie
    // wchodził pod prawy drawer (Outliner). availRight = prawy limit (krawędź info
    // panelu minus aktualnie zasłonięta przez drawer szerokość).
    const drawer = window.KOSMOS?.uiManager?._outliner;
    const drawerCover = drawer?.getCoveredWidth?.() ?? 0;
    const availRight = (x + w - drawerCover) - 4;
    // ── Zakładki prawej kolumny: [Planeta | Załoga] (Population 2.0 Faza 2) ──
    // Podgląd (isPreview) i outposty (brak civSystem/POP) → tylko dane planety.
    const civ = colony?.civSystem ?? null;
    const canWorkforce = !!civ && !colony?.isPreview && !colony?.isOutpost;
    if (!canWorkforce) this._infoTab = 'planet';
    // C4 — konfiguracja zakładek (data-driven) + aktywna zakładka + reset scrolla przy zmianie kolonii.
    const tabs = this._getInfoTabs();
    const activeTab = canWorkforce ? this._infoTab : 'planet';
    const tabCfg = tabs.find(tt => tt.id === activeTab) ?? tabs[0];
    const colId = colony?.planetId ?? planet?.id ?? null;
    if (this._infoScrollColonyId !== colId) {   // offset per-zakładka NIE przenosi się między koloniami
      this._infoScrollColonyId = colId;
      this._infoScroll = {}; this._infoContentH = {};
    }
    // S4 — czy aktywna zakładka pinuje stopkę. DZIŚ bramkowane wyłącznie do Załogi-V2: `wfV2` chroni przed
    // podwójną stopką na ścieżce legacy V1 (V1 ma stopkę WPISANĄ w swoją przewijaną treść). ⚠ NIE jest to
    // jeszcze generyczne — `wfV2` twardo koduje activeTab==='workforce', więc hasSummary jest strukturalnie
    // false dla każdej innej zakładki niezależnie od jej configu. Przyszła zakładka z summary:true (C5)
    // będzie potrzebować WŁASNEGO odpowiednika guardu „stopka już wyłączona z body" — NIE dosłownie wfV2.
    const wfV2 = activeTab === 'workforce' && GAME_CONFIG.FEATURES?.popAllocation2 === true;
    const hasSummary = tabCfg.summary === true && wfV2;
    const summaryReserve = hasSummary ? (WF_SUMMARY_H + WF_SUMMARY_GAP) : 0;
    // viewBot — potrzebne przypiętej stopce S4 (dolna rezerwa). Klamp do paska BottomControlBar
    // rysowanego NA WIERZCHU overlayu (zegar/prędkości/data) — tylko gdy faktycznie nachodzi na X panelu.
    let viewBot = y + h;
    const bcbRect = window.KOSMOS?.bottomControlBar?._bgRect;
    if (bcbRect && bcbRect.y != null && bcbRect.x < x + w && bcbRect.x + bcbRect.w > x) {
      viewBot = Math.min(viewBot, bcbRect.y - 4);   // 4px luzu nad paskiem
    }
    // Globus: STAŁY rozmiar (0.42·h clamp do szer.) WSPÓLNY dla WSZYSTKICH zakładek — Załoga liczy przez
    // TĘ SAMĄ funkcję co Planeta → identyczne px przy każdej wysokości Z KONSTRUKCJI. (Adaptacja usunięta:
    // scroll C4 + stopka S4 zdejmują potrzebę kurczenia globusa; tabela strat zajmuje resztę i przewija się.)
    let discSize = fixedGlobeSize(h, w, pad);
    let discX = x + (w - discSize) / 2;
    if (discX + discSize > availRight) {
      discX = availRight - discSize;            // przesuń w lewo spod drawera
      if (discX < x + pad) {                     // nie mieści się — zmniejsz
        discX = x + pad;
        discSize = Math.max(60, availRight - discX);
      }
    }
    const discY = y + 8;
    this._syncGlobe(discX, discY, discSize, discSize, planet, grid);

    const cw = w - pad * 2;
    const lx = x + pad;

    let cy = discY + discSize + 10;
    if (canWorkforce) cy = this._drawInfoTabs(ctx, lx, cy, cw, tabs);

    // ── C4: per-zakładka scroll ──────────────────────────────────────────────
    // viewTop/viewBot = widoczne pasmo treści (pod zakładkami). Offset klampowany do wysokości
    // treści zmierzonej w POPRZEDNIEJ klatce (górny klamp „lag 1 klatka" — niewidoczny przy ciągłym
    // redraw); dolny klamp zawsze. Treść rysowana od (cy − scroll); hity poza pasmem przycinane
    // PO rysowaniu (stale-click guard). contentH mierzona TEJ klatki → następny klamp + kciuk.
    const viewTop = cy - 4;
    // #4 — dolna rezerwa: pasek BottomControlBar policzony wyżej (viewBot). S4 — jeśli zakładka ma
    // przypięte podsumowanie, pasmo scrolla kończy się NAD nim (scrollBot); inaczej sięga viewBot.
    const scrollBot = viewBot - summaryReserve;
    const viewportH = Math.max(0, scrollBot - viewTop);
    const scroll = clampScroll(this._infoScroll[activeTab] ?? 0, this._infoContentH[activeTab] ?? 0, viewportH);
    this._infoScroll[activeTab] = scroll;

    const hitStart = this._hitZones.length;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, viewTop, w, scrollBot - viewTop); ctx.clip();

    const startCy = cy - scroll;
    let endCy = startCy;
    switch (activeTab) {
      case 'workforce':
        endCy = wfV2
          ? this._drawWorkforceTableV2(ctx, lx, startCy, cw, colony, civ)                        // tylko tabela (stopka przypięta)
          : this._drawWorkforceTab(ctx, lx, startCy, cw, scrollBot - startCy - 4, colony, civ);  // legacy V1 (stopka w scrollu)
        break;
      case 'populacja':
        endCy = this._drawPopulationTab(ctx, lx, startCy, cw, colony, civ);
        break;
      case 'planet':
      default:
        endCy = this._drawPlanetTab(ctx, lx, startCy, cw, colony);
        break;
    }
    ctx.restore();

    const contentH = (endCy ?? startCy) - startCy;
    this._infoContentH[activeTab] = contentH;

    // Przytnij hity treści poza widocznym pasmem (wzór _bVis float panelu — cały zone musi być w środku).
    this._pruneHitsOutside(hitStart, viewTop, scrollBot);

    // Kciuk paska przewijania (afordancja przewijalności) — prawy skraj panelu.
    const thumb = scrollThumb(scroll, contentH, viewportH, viewTop);
    if (thumb) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x + w - 4, thumb.y, 3, thumb.h);
    }

    // Pasmo treści dla handleScroll (kursor nad info panelem → scroll aktywnej zakładki).
    this._infoView = { x, w, top: viewTop, bot: scrollBot, tab: activeTab, scrollable: contentH > viewportH };

    // ── S4: przypięte podsumowanie (poza transformacją scrolla — zawsze widoczne) ──
    if (hasSummary) {
      const sepY = scrollBot + Math.floor(WF_SUMMARY_GAP / 2);
      ctx.strokeStyle = THEME.borderActive; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + pad, sepY + 0.5); ctx.lineTo(x + w - pad, sepY + 0.5); ctx.stroke();
      ctx.globalAlpha = 1;
      this._drawWorkforceSummaryV2(ctx, lx, viewBot - WF_SUMMARY_H, cw, colony, civ);
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── C4: konfiguracja zakładek prawej kolumny — JEDNO źródło (pasek, szerokość, dispatch, layout) ──
  // N-zakładek-ready: C5 (Populacja) / C6 (Stacja) dopną kolejne wpisy bez ruszania geometrii.
  // summary:true = zakładka pinuje stopkę u dołu panelu (S4). Globus jest STAŁY dla WSZYSTKICH zakładek
  // (fixedGlobeSize) — brak per-zakładkowej frakcji globusa.
  _getInfoTabs() {
    return [
      { id: 'planet',    labelKey: 'colonyInfo.tabPlanet' },
      { id: 'workforce', labelKey: 'colonyInfo.tabWorkforce', summary: true },
      { id: 'populacja', labelKey: 'colonyInfo.tabPopulation' },   // C5 — cała treść przewija się (BEZ summary: §c — brak przypiętej stopki)
    ];
  }

  // ── C4: zakładka Planeta (charakterystyka + linie efektów środowiskowych C3 + złoża C2) ──
  // Rysuje od `y`, ZWRACA dolne `cy` (wysokość treści = zwrot − y) — konsumowane przez scroll panelu.
  _drawPlanetTab(ctx, x, y, w, colony) {
    const planet = colony?.planet ?? null;
    if (!planet) return y;
    const civ = colony?.civSystem ?? null;
    let cy = this._drawInfoSection(ctx, x, y, w, t('colonyInfo.physics'));
    const tempC = planet.temperatureC ?? planet.surface?.temperature ?? 0;
    const tempStr = `${tempC > 0 ? '+' : ''}${tempC.toFixed(0)} °C`;
    const atmKey = `colonyInfo.atm.${planet.atmosphere || 'none'}`;
    // C3 — planetMod/blockReason z getGrowthBreakdown() (to samo źródło co tooltip wzrostu w Załodze
    // → wartości zgodne). Pasmo grav/temp dopisane do wartości wiersza; wpływ = przygaszona pod-linia.
    const gb = civ?.getGrowthBreakdown?.() ?? null;
    const env = computeEnvironmentEffects(planet, gb ? { planetMod: gb.planetMod, blockReason: gb.blockReason } : null);
    const gravStr = `${(planet.surfaceGravity ?? 1).toFixed(2)} g`;
    const bandTag = (key) => (key ? ` (${t(key)})` : '');
    cy = this._drawInfoRow(ctx, x, cy, w, t('colonyInfo.temperature'), tempStr + bandTag(env?.temperature.bandKey));
    cy = this._drawEnvLine(ctx, x, cy, w, env?.temperature.effects);
    cy = this._drawInfoRow(ctx, x, cy, w, t('colonyInfo.mass'), `${(planet.physics?.mass ?? 1).toFixed(2)} ${t('colonyInfo.massUnit')}`);
    cy = this._drawInfoRow(ctx, x, cy, w, t('colonyInfo.gravity'), gravStr + bandTag(env?.gravity.bandKey));
    cy = this._drawEnvLine(ctx, x, cy, w, env?.gravity.effects);
    cy = this._drawInfoRow(ctx, x, cy, w, t('colonyInfo.radius'), `${(planet.surfaceRadius ?? 1).toFixed(2)} ${t('colonyInfo.radiusUnit')}`);
    cy = this._drawInfoRow(ctx, x, cy, w, t('colonyInfo.atmosphere'), t(atmKey));
    cy = this._drawEnvLine(ctx, x, cy, w, env?.atmosphere.effects);
    // Woda (nowy wiersz C3) + bramka Studni
    cy = this._drawInfoRow(ctx, x, cy, w, t('colonyInfo.water'), t(env?.water.hasWater ? 'colonyInfo.waterYes' : 'colonyInfo.waterNo'));
    cy = this._drawEnvLine(ctx, x, cy, w, env?.water.effects);
    // Wzrost populacji (łączny planetMod / twardy cap habitatów) — osobna linia z własną etykietą
    if (env?.growth) cy = this._drawEnvLine(ctx, x, cy, w, [env.growth], false);
    cy += 8;

    // ── Surowce (złoża) — C2: pozostało/początkowe + ETA wyczerpania ──
    cy = this._drawInfoSection(ctx, x, cy, w, t('colonyInfo.resources'));
    const deps = planet.deposits || [];
    if (!deps.length) {
      ctx.font = `italic 10px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
      ctx.fillText(t('colonyInfo.noResources'), x, cy + 10); cy += 18;
    } else {
      const summaries = DepositSystem.getDepositsSummary(deps);
      const resSys = colony?.resourceSystem;
      const rateCache = {};   // resourceId → tempo/rok cyw. (dedup w obrębie klatki)
      for (let i = 0; i < deps.length; i++) {
        const d = deps[i];
        let rate = rateCache[d.resourceId];
        if (rate === undefined) {
          let r = 0;
          try { r = resSys?.getResourceBreakdown?.(d.resourceId)?.producers?.mine?.total ?? 0; }
          catch { r = 0; }
          rate = rateCache[d.resourceId] = r;
        }
        const readout = computeDepositReadout(summaries[i], rate, { civTimeScale: GAME_CONFIG.CIV_TIME_SCALE });
        cy = this._drawDepositRow(ctx, x, cy, w, d, readout);
      }
    }
    return cy;
  }

  // ── C5: zakładka Populacja — Stabilność · Potrzeby · Dobrobyt · Konsumpcja · Grupy · Zakwaterowanie ──
  // Rysuje od `y`, ZWRACA dolne `cy` (wysokość treści = zwrot − y) → konsumowane przez scroll panelu (C4).
  // Cała treść PRZEWIJA SIĘ (BEZ przypiętej stopki — §c: żadna sekcja nie jest pojedynczą always-on liczbą
  // jak Bilans Załogi; witalia/alarmy są NA GÓRZE → widoczne przy scroll=0). Globus STAŁY (fixedGlobeSize)
  // jak w każdej zakładce. Read-only — ZERO _addHit (brak sterowników/tooltipów) → brak kolizji hit-zone.
  _drawPopulationTab(ctx, x, y, w, colony, civ) {
    const lang = getLocale();
    const rs = colony?.resourceSystem ?? null;
    const ps = colony?.prosperitySystem ?? null;
    const bs = colony?.buildingSystem ?? null;
    let cy = y;

    // ── SEKCJA 1: STABILNOŚĆ — lojalność/tożsamość + cechy kulturowe + zdarzenia aktywne ──
    cy = this._drawInfoSection(ctx, x, cy, w, t('colonyInfo.popTab.stabilityTitle'));
    const loyalty = civ?.loyalty ?? 80;
    const loyRatio = Math.max(0, Math.min(1, loyalty / 100));
    const loyColor = loyRatio > 0.7 ? THEME.success : loyRatio > 0.3 ? THEME.warning : THEME.danger;
    cy = this._drawLabeledBar(ctx, x, cy, w, t('popPanel.loyaltyLabel'), loyRatio, `${Math.round(loyalty)}%`, loyColor);
    const identityScore = civ?.identity?.score ?? 0;
    const idRatio = Math.max(0, Math.min(1, identityScore / 100));
    const idColor = idRatio > 0.5 ? '#c8a050' : idRatio > 0.2 ? '#a08040' : THEME.textDim;
    cy = this._drawLabeledBar(ctx, x, cy, w, t('popPanel.identityLabel'), idRatio, `${Math.round(identityScore)}`, idColor);

    // Cechy kulturowe (CULTURAL_TRAITS z MilestonesData — NIE martwy duplikat z MovementsData): ikona + nazwa
    // + efekt. 0 odblokowanych → jedna dim-linia (bez pustej luki). Ruchy społeczne świadomie POMINIĘTE (C5).
    cy += 4;
    ctx.font = `9px ${THEME.fontFamily}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = THEME.textDim; ctx.fillText(t('popPanel.traitsLabel'), x, cy + 8); cy += 14;
    const traits = civ?.identity?.traits ?? [];
    if (!traits.length) {
      ctx.font = `italic 10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('colonyInfo.popTab.noTraits'), x + 4, cy + 8); cy += 14;
    } else {
      for (const id of traits) {
        const tr = CULTURAL_TRAITS[id];
        const name = tr ? (lang === 'en' ? tr.nameEN : tr.namePL) : id;
        const icon = tr?.icon ?? '⭐';
        const effect = tr ? (lang === 'en' ? tr.effectEN : tr.effectPL) : '';
        ctx.font = `11px ${THEME.fontFamily}`; ctx.fillStyle = THEME.accent; ctx.textAlign = 'left';
        ctx.fillText(this._truncateText(ctx, `${icon} ${name}`, w), x, cy + 9); cy += 13;
        if (effect) {
          ctx.font = `9px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim;
          ctx.fillText(this._truncateText(ctx, effect, w - 6), x + 6, cy + 7); cy += 12;
        }
      }
    }

    // Zdarzenia aktywne — JEDNA reprezentacja (karty: zamieszki / głód / brownout). „Brak zdarzeń" gdy spokój.
    cy += 6;
    ctx.font = `9px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
    ctx.fillText(t('popPanel.activeEvents'), x, cy + 8); cy += 14;
    const events = [];
    if (civ?.isUnrest) events.push({ icon: '🔥', name: t('popPanel.crisisUnrest'), desc: t('popPanel.crisisUnrestDesc') });
    if (civ?.isFamine) events.push({ icon: '💀', name: t('popPanel.crisisFamine'), desc: t('popPanel.crisisFamineDesc') });
    if (rs?.energy?.brownout) events.push({ icon: '⚡', name: t('popPanel.crisisBrownout'), desc: t('popPanel.crisisBrownoutDesc') });
    if (!events.length) {
      ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'center';
      ctx.fillText(t('popPanel.noEvents'), x + w / 2, cy + 10); ctx.textAlign = 'left'; cy += 18;
    } else {
      for (const ev of events) {
        ctx.font = `11px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'left';
        ctx.fillText(`${ev.icon} ${ev.name}`, x, cy + 10);
        ctx.font = `9px ${THEME.fontFamily}`; ctx.fillStyle = THEME.danger; ctx.textAlign = 'right';
        ctx.fillText(t('popPanel.activeLabel'), x + w, cy + 10);
        ctx.textAlign = 'left'; ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(this._truncateText(ctx, ev.desc, w - 6), x + 4, cy + 22); cy += 30;
      }
    }

    // ── SEKCJA 2: POTRZEBY — pokrycie żywność/woda/energia (pool-aware zachowane 1:1) ──
    cy += 8;
    cy = this._drawInfoSection(ctx, x, cy, w, t('popPanel.needsTitle'));
    const needs = this._calcPopNeeds(civ, rs, civ?.population ?? 0);
    for (const need of needs) {
      ctx.font = `11px ${THEME.fontFamily}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(need.icon, x, cy + 8); ctx.fillText(need.name, x + 18, cy + 8);
      const barX = x + 96, barW = Math.max(20, w - 96 - 44);
      const color = need.ratio > 0.8 ? THEME.success : need.ratio > 0.5 ? THEME.warning : THEME.danger;
      this._drawBar(ctx, barX, cy + 4, barW, 6, need.ratio, color, THEME.border);
      ctx.fillStyle = color; ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(need.ratio * 100)}%`, x + w, cy + 8);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      cy += 18;
      if (need.pooled) {                        // Orbital Logistics Hub §7 — pokryte z puli (bez kary)
        ctx.font = `9px ${THEME.fontFamily}`; ctx.fillStyle = THEME.accent;
        ctx.fillText(t('popPanel.fedFromPool'), x + 18, cy + 4); cy += 12;
      } else if (need.ratio < 0.5) {
        ctx.font = `9px ${THEME.fontFamily}`; ctx.fillStyle = THEME.danger;
        ctx.fillText(t('popPanel.deficit', need.name, need.penalty), x + 18, cy + 4); cy += 12;
      }
    }

    // ── SEKCJA 3: DOBROBYT — 5 warstw + czynnik wzrostu (etykieta wyraźnie ≠ linia wzrostu Planety) ──
    cy += 8;
    cy = this._drawInfoSection(ctx, x, cy, w, t('colonyInfo.popTab.prosperityLayers'));
    const layers = ps?.getLayerScores?.() ?? {};   // {survival,infrastructure,functioning,comfort,luxury} — floaty 0..1
    const LAYER_LABELS = [
      ['survival', t('popPanel.layerSurvival')],
      ['infrastructure', t('popPanel.layerInfra')],   // ⚠ = civSystem.satisfaction/100 (re-display; zachowane dla pełni 5-setu)
      ['functioning', t('popPanel.layerFunctioning')],
      ['comfort', t('popPanel.layerComfort')],
      ['luxury', t('popPanel.layerLuxury')],
    ];
    for (const [key, label] of LAYER_LABELS) {
      const val = Math.max(0, Math.min(1, layers[key] ?? 0));   // 0..1 → ×100 w wartości
      const color = val >= 0.7 ? THEME.success : val >= 0.3 ? THEME.warning : THEME.danger;
      cy = this._drawLabeledBar(ctx, x, cy, w, label, val, `${Math.round(val * 100)}%`, color, { font: 10, pitch: 14, barH: 5, labelW: 108 });
    }
    const growthMult = ps?.getGrowthMultiplier?.() ?? 1.0;   // 0.2–1.2 — czynnik kondycjonujący dobrobyt→wzrost (≠ planetMod środowiskowy Planety)
    ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(t('colonyInfo.popTab.prosperityGrowthFactor', growthMult.toFixed(1)), x, cy + 9); cy += 14;

    // ── SEKCJA 4: KONSUMPCJA — epoka(+score) jako nagłówek + dobra konsumpcyjne (CFP usunięte — martwy accessor) ──
    cy += 8;
    cy = this._drawInfoSection(ctx, x, cy, w, t('popPanel.consumerGoods'));
    if (ps) {
      const epoch = ps._getCurrentEpoch?.() ?? { unlockedGoods: [], key: 'early' };   // ⚠ mutuje epochScore — czytać PO tym wywołaniu
      const epochScore = Math.round(ps.epochScore ?? 0);
      const epochNames = { early: t('epoch.early'), developing: t('epoch.developing'), advanced: t('epoch.advanced'), cosmic: t('epoch.space') };
      ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
      ctx.fillText(t('popPanel.epochScoreLabel', epochNames[epoch.key] ?? epoch.key, epochScore), x, cy + 9); cy += 15;
      const goods = ['basic_supplies', 'civilian_goods', 'neurostimulants'];
      for (const goodId of goods) {
        const commodity = COMMODITIES[goodId];
        if (!commodity) continue;
        const unlocked = epoch.unlockedGoods?.includes(goodId);
        const nm = getName(commodity, 'commodity');
        const icon = commodity.icon ?? '?';
        ctx.font = `10px ${THEME.fontFamily}`; ctx.textAlign = 'left';
        if (!unlocked) {
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`${icon} ${nm}  🔒`, x, cy + 9);
        } else {
          const demand = ps.getDemand?.(goodId) ?? 0;
          const production = ps.getProduction?.(goodId) ?? 0;
          const sat = ps.getSatisfaction?.(goodId) ?? 0;
          const sColor = sat >= 0.8 ? THEME.success : sat >= 0.5 ? THEME.warning : THEME.danger;
          ctx.fillStyle = THEME.textPrimary;
          ctx.fillText(`${icon} ${nm}`, x, cy + 9);
          ctx.fillStyle = sColor; ctx.textAlign = 'right';
          ctx.fillText(t('colonyInfo.popTab.goodsRate', production.toFixed(1), demand.toFixed(1)), x + w, cy + 9);
          ctx.textAlign = 'left';
        }
        cy += 14;
      }
    }

    // ── SEKCJA 5: GRUPY SPOŁECZNE — satysfakcja warstw (BEZ kolumny liczności — dup zakładki Załoga) ──
    cy += 8;
    cy = this._drawInfoSection(ctx, x, cy, w, t('colonyInfo.popTab.strataSatisfaction'));
    const breakdown = civ?.getStrataBreakdown?.() ?? [];   // {type,namePL,nameEN,icon,count,satisfaction,...}
    const activeStrata = breakdown.filter(s => s.count > 0);
    if (!activeStrata.length) {
      ctx.font = `italic 10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('—', x, cy + 8); cy += 16;
    } else {
      for (const s of activeStrata) {
        const name = lang === 'en' ? s.nameEN : s.namePL;
        const ratio = Math.max(0, Math.min(1, (s.satisfaction ?? 0) / 100));
        const color = ratio > 0.6 ? THEME.success : ratio > 0.3 ? THEME.warning : THEME.danger;
        cy = this._drawLabeledBar(ctx, x, cy, w, `${s.icon} ${name}`, ratio, `${Math.round(s.satisfaction ?? 0)}%`, color, { font: 11, pitch: 18, barH: 6, labelW: 128 });
      }
    }

    // ── SEKCJA 6: ZAKWATEROWANIE — sloty per budynek (FIX: entry.building/entry.housing; NIE entry.def; NIE ×level) ──
    cy += 8;
    cy = this._drawInfoSection(ctx, x, cy, w, t('popPanel.housingTitle'));
    if (!bs || !bs._active) {
      ctx.font = `italic 10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
      ctx.fillText(t('popPanel.noHousingData'), x, cy + 8); cy += 16;
    } else {
      const housing = [];
      for (const [, entry] of bs._active) {   // NIE pomijamy capital_<tileKey> — tam mieszka baza (colony_base 16)
        const b = entry.building;             // ⚠ NIE entry.def (nie istnieje — źródło buga w PopulationOverlay)
        const h = entry.housing ?? 0;         // per-level JUŻ SKUMULOWANE — NIE mnożyć przez level
        if (b && h > 0) housing.push({ name: getName(b, 'building'), level: entry.level ?? 1, housing: h });
      }
      if (!housing.length) {
        ctx.font = `italic 10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
        ctx.fillText(t('popPanel.noHousingBuildings'), x, cy + 8); cy += 16;
      } else {
        let total = 0;
        for (const b of housing) {
          total += b.housing;
          ctx.font = `11px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'left';
          ctx.fillText(this._truncateText(ctx, `${b.name} Lv${b.level}`, w - 70), x, cy + 10);
          ctx.fillStyle = THEME.accent; ctx.textAlign = 'right';
          ctx.fillText(t('popPanel.slotsCount', b.housing), x + w, cy + 10);
          ctx.textAlign = 'left'; cy += 18;
        }
        cy += 4;
        ctx.strokeStyle = THEME.borderActive; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, cy + 0.5); ctx.lineTo(x + w, cy + 0.5); ctx.stroke();
        ctx.globalAlpha = 1; cy += 8;
        ctx.font = `bold 11px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'left';
        ctx.fillText(t('popPanel.totalLabel'), x, cy + 10);
        ctx.fillStyle = THEME.accent; ctx.textAlign = 'right';
        ctx.fillText(t('popPanel.totalSlots', total), x + w, cy + 10);
        ctx.textAlign = 'left'; cy += 16;
      }
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return cy;
  }

  // C5 — pasek z etykietą: [label | pasek | wartość]. Wspólny dla lojalności/tożsamości, 5 warstw dobrobytu
  // i satysfakcji warstw. opt: font/pitch/barH/labelW/valW. Etykieta przycinana (_truncateText).
  _drawLabeledBar(ctx, x, y, w, label, ratio, valText, color, opt = {}) {
    const font = opt.font ?? 11, pitch = opt.pitch ?? 16, barH = opt.barH ?? 8;
    const labelW = opt.labelW ?? 96, valW = opt.valW ?? 42;
    const mid = y + Math.round(pitch / 2);
    ctx.textBaseline = 'middle'; ctx.font = `${font}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary; ctx.textAlign = 'left';
    ctx.fillText(this._truncateText(ctx, label, labelW - 4), x, mid);
    const barX = x + labelW, barW = Math.max(20, w - labelW - valW);
    this._drawBar(ctx, barX, mid - Math.round(barH / 2), barW, barH, ratio, color, THEME.border);
    ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.fillText(valText, x + w, mid);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return y + pitch;
  }

  // C5 — port _calcNeeds z PopulationOverlay (pool-aware zachowane 1:1 — §7 Orbital Logistics Hub).
  // Zwraca [{icon, name, ratio, penalty, pooled?}]. Energia = flow (NIE poolowana); żywność/woda = zapas/10lat.
  _calcPopNeeds(civ, rs, pop) {
    if (!rs || pop <= 0) {
      return [
        { icon: '🍖', name: t('popPanel.needFood'),   ratio: 1, penalty: '-15/rok' },
        { icon: '💧', name: t('popPanel.needWater'),  ratio: 1, penalty: '-10/rok' },
        { icon: '⚡', name: t('popPanel.needEnergy'), ratio: 1, penalty: '-15/rok' },
      ];
    }
    const foodCons = pop * 0.75, waterCons = pop * 0.375, energyCons = pop * 0.25;   // Population 2.0: ÷4 (pop ×4)
    const foodAmt  = (rs.getAmount?.('food')  ?? rs.inventory?.get?.('food')  ?? 0);
    const waterAmt = (rs.getAmount?.('water') ?? rs.inventory?.get?.('water') ?? 0);
    const energyBal = rs.energy?.balance ?? 0;
    const foodPooled  = !!window.KOSMOS?.systemPoolService?.poolCoversSurvival?.(rs, 'food');
    const waterPooled = !!window.KOSMOS?.systemPoolService?.poolCoversSurvival?.(rs, 'water');
    const foodRatio  = foodPooled  ? 1 : (foodCons  > 0 ? Math.min(1, foodAmt  / (foodCons  * 10)) : 1);
    const waterRatio = waterPooled ? 1 : (waterCons > 0 ? Math.min(1, waterAmt / (waterCons * 10)) : 1);
    const energyRatio = energyCons > 0 ? Math.min(1, Math.max(0, (energyBal + energyCons) / (energyCons * 2))) : 1;
    return [
      { icon: '🍖', name: t('popPanel.needFood'),   ratio: foodRatio,   penalty: '-15/rok', pooled: foodPooled },
      { icon: '💧', name: t('popPanel.needWater'),  ratio: waterRatio,  penalty: '-10/rok', pooled: waterPooled },
      { icon: '⚡', name: t('popPanel.needEnergy'), ratio: energyRatio, penalty: '-15/rok' },
    ];
  }

  // ── C4: przytnij hity treści (indeks ≥ fromIndex) leżące poza widocznym pasmem [top, bot] ──
  // Wzór _bVis float panelu: CAŁY zone musi się mieścić, inaczej usuwamy (scrolled-off item nie
  // zostawia martwej strefy klikalnej nachodzącej na pasek zakładek/inne UI). first-match _hitTest
  // → zakładki (rejestrowane PRZED treścią) wygrywają, a przycięta treść nie łapie klików.
  _pruneHitsOutside(fromIndex, top, bot) {
    const zones = this._hitZones;
    if (fromIndex >= zones.length) return;
    let write = fromIndex;
    for (let i = fromIndex; i < zones.length; i++) {
      const z = zones[i];
      if (z.y >= top - 0.5 && z.y + z.h <= bot + 0.5) zones[write++] = z;
    }
    zones.length = write;
  }

  // ── Zakładki prawej kolumny (pigułki, wzór _drawColonyTabs) — data-driven N-zakładek (C4) ──
  // Szerokość z computeTabRects (count=2 zachowuje historyczne (w−gap)/2); etykieta z labelKey.
  _drawInfoTabs(ctx, x, y, w, tabs) {
    const tabH = 20, gap = 6;
    const rects = computeTabRects(x, w, tabs.length, gap);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold 11px ${THEME.fontFamily}`;
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const { x: sx, w: tw } = rects[i];
      const active = this._infoTab === tab.id;
      // #2: rects są RÓWNE (computeTabRects); dotąd nierówny wygląd = iluzja od kontrastu ramki
      // (aktywna: accent nieprzezroczysty vs nieaktywna: borderLight 0.18α — ledwo widoczna →
      // „mniejsza"). Oba pudełka teraz WYRAŹNE (borderActive 0.40α); aktywne odróżnia jaśniejsza
      // ramka + mocniejsze tło + kolor tekstu (symetryczna geometria, brak iluzji rozmiaru).
      ctx.fillStyle = active ? THEME.accentMed : 'rgba(255,255,255,0.03)';
      ctx.fillRect(sx, y, tw, tabH);
      ctx.strokeStyle = active ? THEME.accent : THEME.borderActive;
      ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, y + 0.5, tw - 1, tabH - 1);
      ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
      ctx.fillText(t(tab.labelKey), sx + tw / 2, y + tabH / 2);
      this._addHit(sx, y, tw, tabH, 'infoTab', { tab: tab.id });
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return y + tabH + 10;
  }

  // ── Zakładka Załoga (Population 2.0 Faza 2 §5.1) — tabela strat + stopka ──
  // Tabela: strata | etaty | pracownicy | płaca (highlight pressure>0.25) | focus [− n +].
  // Stopka: bezrobotni (warn >10%), satysfakcja, prosperity + strzałka trendu, wzrost.
  _drawWorkforceTab(ctx, x, y, w, h, colony, civ) {
    // Legacy V1 (popAllocation2=false). Żywa ścieżka = _drawWorkforceTableV2 + _drawWorkforceSummaryV2.
    const lang = getLocale();
    const rows = civ.getWorkforceBreakdown();
    const humans = Math.floor(civ.humans ?? civ.population ?? 0);
    const unemployed = civ.unemployed ?? 0;

    // Kolumny liczbowe kotwiczone od prawej krawędzi panelu.
    const NUMW = 42, FOCUSW = 58;
    const focusRight = x + w;
    const focusX0    = focusRight - FOCUSW;
    const wageRight  = focusX0 - 6;
    const workRight  = wageRight - NUMW;
    const jobsRight  = workRight - NUMW;
    const nameRight  = jobsRight - NUMW;

    // Nagłówek kolumn.
    ctx.font = `bold 9px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';  ctx.fillText(t('workforce.colStrata'), x, y + 9);
    ctx.textAlign = 'right';
    ctx.fillText(t('workforce.colJobs'),    jobsRight, y + 9);
    ctx.fillText(t('workforce.colWorkers'), workRight, y + 9);
    ctx.fillText(t('workforce.colWage'),    wageRight, y + 9);
    ctx.textAlign = 'center';
    ctx.fillText(t('workforce.colFocus'), (focusX0 + focusRight) / 2, y + 9);
    let cy = y + 13;
    ctx.strokeStyle = THEME.borderActive; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + w, cy); ctx.stroke();
    ctx.globalAlpha = 1; cy += 4;

    const ROW_H = 20;
    for (const r of rows) {
      const name = lang === 'en' ? r.nameEN : r.namePL;
      const my = cy + ROW_H / 2;
      ctx.textBaseline = 'middle';

      // Nazwa (ikona + skrót, truncate do dostępnej szerokości).
      ctx.font = `11px ${THEME.fontFamily}`; ctx.textAlign = 'left';
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(this._truncateText(ctx, `${r.icon} ${name}`, nameRight - x - 4), x, my);

      // Jobs = BRUTTO (wszystkie fizyczne etaty budynków); Emp = ludzie + droidy „h+m🤖". Kolumna Jobs
      // pokazuje pełną pojemność (np. 2× kopalnia L2 auto = 4 jobs, 0+4🤖). Amber = niedobsada LUDZKA
      // (workers < NETTO r.jobs), math pressure/alokacji zostaje NETTO — to tylko wyświetlanie.
      ctx.font = `11px ${THEME.fontFamily}`; ctx.textAlign = 'right';
      ctx.fillStyle = THEME.textDim; ctx.fillText(String(r.grossJobs), jobsRight, my);
      ctx.fillStyle = (r.workers < r.jobs) ? THEME.warning : THEME.textPrimary;
      if (r.synthetic > 0) {   // Faza 4: obsada syntetyczna widoczna per warstwa (np. 6+2🤖)
        ctx.font = `10px ${THEME.fontFamily}`;
        ctx.fillText(`${r.workers}+${r.synthetic}🤖`, workRight, my);
        ctx.font = `11px ${THEME.fontFamily}`;
      } else {
        ctx.fillText(String(r.workers), workRight, my);
      }

      // Płaca — highlight gdy pressure > 0.25.
      ctx.fillStyle = (r.pressure > 0.25) ? THEME.warning : THEME.textDim;
      ctx.fillText(r.wage.toFixed(1), wageRight, my);

      // Focus [− n +] (wyszarzony gdy cap=0, czyli <4 etaty brutto).
      const capOff = r.focusCap <= 0;
      ctx.textAlign = 'center';
      ctx.font = `bold 13px ${THEME.fontFamily}`;
      ctx.fillStyle = capOff ? THEME.textDim : THEME.accent;
      ctx.fillText('−', focusX0 + 9, my);
      ctx.fillText('+', focusRight - 9, my);
      ctx.font = `11px ${THEME.fontFamily}`;
      ctx.fillStyle = r.focus > 0 ? THEME.accent : THEME.textDim;
      ctx.fillText(String(r.focus), (focusX0 + focusRight) / 2, my);
      if (!capOff) {
        this._addHit(focusX0, cy, 18, ROW_H, 'focusMinus', { type: r.type, tooltip: t('workforce.focusTooltip') });
        this._addHit(focusRight - 18, cy, 18, ROW_H, 'focusPlus', { type: r.type, tooltip: t('workforce.focusTooltip') });
      }
      // Hover na wierszu straty (obszar nazwy) → lista budynków zatrudniających tę warstwę.
      this._addHit(x, cy, nameRight - x, ROW_H, 'strataRow', { type: r.type, tooltip: this._strataBuildingsTooltip(colony, r.type) });
      cy += ROW_H;
    }

    // Separator + stopka.
    cy += 4;
    ctx.strokeStyle = THEME.borderActive; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + w, cy); ctx.stroke();
    ctx.globalAlpha = 1; cy += 6;

    // Bezrobotni (kolor ostrzegawczy > 10% ludzi).
    const unempFrac = humans > 0 ? unemployed / humans : 0;
    cy = this._drawWfRow(ctx, x, cy, w, t('workforce.unemployed'),
      `${unemployed} (${Math.round(unempFrac * 100)}%)`, unempFrac > 0.10 ? THEME.danger : THEME.textPrimary);
    // Satysfakcja.
    cy = this._drawWfRow(ctx, x, cy, w, t('workforce.satisfaction'),
      `${Math.round(civ.satisfaction ?? 50)}%`, THEME.textPrimary);
    // Prosperity + strzałka trendu do targetu.
    const pros = window.KOSMOS?.prosperitySystem;
    if (pros && window.KOSMOS?.civSystem === civ) {
      const cur = pros.prosperity ?? 50, tgt = pros.targetProsperity ?? 50;
      const arrow = tgt > cur + 0.5 ? '↑' : tgt < cur - 0.5 ? '↓' : '→';
      const acol  = tgt > cur + 0.5 ? THEME.success : tgt < cur - 0.5 ? THEME.danger : THEME.textDim;
      cy = this._drawWfRow(ctx, x, cy, w, t('workforce.prosperity'), `${Math.round(cur)} ${arrow} ${Math.round(tgt)}`, acol);
    }
    // Wzrost (reuse getAnnualGrowth — jednostki POP/rok cyw.).
    const growth = civ.getAnnualGrowth?.() ?? 0;
    cy = this._drawWfRow(ctx, x, cy, w, t('workforce.growth'),
      `+${growth.toFixed(1)}/${t('workforce.perYear')}`, growth > 0 ? THEME.success : THEME.textDim);

    // ── Bilans kolonii (Faza 3 §3.7/§5.2): przychód (podatek+handel) − płace = netto ──
    const colMgr = window.KOSMOS?.colonyManager;
    const tax    = colMgr?.calculateTaxIncome?.(colony) ?? 0;
    const trade  = colony.creditsPerYear ?? 0;
    const income = tax + trade;
    const wages  = civ.getTotalLaborCost?.() ?? 0;
    const net    = income - wages;
    cy += 3;
    cy = this._drawWfRow(ctx, x, cy, w, t('workforce.income'), `+${income.toFixed(0)} Kr`, THEME.textPrimary);
    cy = this._drawWfRow(ctx, x, cy, w, t('workforce.wages'),  `-${wages.toFixed(0)} Kr`, THEME.danger);
    cy = this._drawWfRow(ctx, x, cy, w, t('workforce.net'),
      `${net >= 0 ? '+' : ''}${net.toFixed(0)} Kr/${t('workforce.perYear')}`, net >= 0 ? THEME.success : THEME.danger);

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return cy;   // C4 — wysokość treści dla scrolla panelu
  }

  // ── Tabela Załogi v2 (Slice 5C.1, flag popAllocation2) — S2: sama tabela (stopka wydzielona) ──
  //  Wiersz 2-liniowy/warstwa: [nazwa · płaca · Focus share-stepper] / [termometr obsady ·
  //  POP+droidy/etaty · droid-stepper]. Termometr: (POP+droidy)/etaty, zielony <70% (miejsce na
  //  absorpcję) / pomarańcz 70-90% / czerwony ≥90% (SATUROWANA — rozbuduj budynki). Focus = docelowy
  //  UDZIAŁ (share) tej warstwy; droid [±] auto-pick (najsłabiej obsadzony budynek / zwrot do magazynu).
  //  ROW_H=30 i steppery NIETKNIĘTE (stepperButtonBand bez zmian); stopka → _drawWorkforceSummaryV2.
  _drawWorkforceTableV2(ctx, x, y, w, colony, civ) {
    const lang = getLocale();
    const rows = civ.getWorkforceBreakdown();

    // Anchory prawych sterowników — Focus (linia 1) i Droidy (linia 2) pionowo zestrojone.
    const STEPW = 74;
    const stepX0 = x + w - STEPW;
    const stepRight = x + w;
    const wageRight = stepX0 - 8;

    // Nagłówek kolumn (kompaktowy).
    ctx.font = `bold 9px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';   ctx.fillText(t('workforce.colStrata'), x, y + 9);
    ctx.textAlign = 'right';  ctx.fillText(t('workforce.colWage'), wageRight, y + 9);
    ctx.textAlign = 'center'; ctx.fillText(t('workforce.colTarget'), (stepX0 + stepRight) / 2, y + 9);
    let cy = y + 13;
    ctx.strokeStyle = THEME.borderActive; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + w, cy); ctx.stroke();
    ctx.globalAlpha = 1; cy += 5;

    for (const r of rows) {
      const active = r.grossJobs > 0 || r.workers > 0 || r.synthetic > 0;
      const name = lang === 'en' ? r.nameEN : r.namePL;
      if (!active) {
        // Warstwa pusta (brak budynków) — 1-linijkowy dim wpis (nadal umożliwia widok wszystkich strat).
        ctx.font = `11px ${THEME.fontFamily}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(this._truncateText(ctx, `${r.icon} ${name}`, w - 30), x, cy + 8);
        ctx.textAlign = 'right'; ctx.fillText('—', x + w, cy + 8);
        cy += 16;
        continue;
      }
      const ROW_H = 30, HALF = ROW_H / 2;
      const my1 = cy + 9, my2 = cy + 22;
      // Stepper ±: box i glif z JEDNEGO źródła (stepperButtonBand) — box wyśrodkowany na OPTYCZNYM
      // środku glifu (my−RISE), glif rysowany na band.glyphY(=my). Fix mis-klik „pod ikoną" (poprzednio
      // box na my wystawał pod glif). Box[top,top+h] = strefa klik; scroll-invariant (pochodne my).
      const b1 = stepperButtonBand(my1);   // przycisk focus (linia 1)
      const b2 = stepperButtonBand(my2);   // przycisk droid (linia 2)
      ctx.textBaseline = 'middle';

      // ── Linia 1: nazwa + płaca + Focus share [− nn% +] ──
      ctx.font = `11px ${THEME.fontFamily}`; ctx.textAlign = 'left';
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(this._truncateText(ctx, `${r.icon} ${name}`, wageRight - x - 44), x, my1);
      ctx.textAlign = 'right';
      ctx.fillStyle = (r.pressure > 0.25) ? THEME.warning : THEME.textDim;
      ctx.fillText(r.wage.toFixed(1), wageRight, my1);
      const tgtOff = r.grossJobs <= 0;
      const sharePct = Math.round((r.target ?? 0) * 100);
      // Slice 5C.2: stan suwaka + podgląd docelowej liczby osób „≈N" (cisza mechaniki myliła 5C.1).
      // active=zielony · inactive=szary+· · unreachable=amber+! (N = surowy cel przed capem).
      const tstate = civ.getTargetState?.(r.type) ?? 'off';
      const prevHc = civ.getTargetHeadcountPreview?.(r.type) ?? { target: 0, desired: 0, current: 0, delta: 0, capped: false };
      const stateCol = tstate === 'unreachable' ? THEME.warning
                     : tstate === 'active' ? THEME.success
                     : THEME.textDim;
      ctx.textAlign = 'center'; ctx.font = `bold 12px ${THEME.fontFamily}`;   // #3: 13→12 (bliżej 11px treści; waga bold odróżnia przyciski)
      ctx.fillStyle = tgtOff ? THEME.textDim : THEME.accent;
      ctx.fillText('−', stepX0 + 9, b1.glyphY); ctx.fillText('+', stepRight - 9, b1.glyphY);
      // Środek: „nn%≈P" (P = docelowa liczba osób; ! gdy nieosiągalne). Podgląd żywy podczas regulacji.
      ctx.font = `10px ${THEME.fontFamily}`;
      ctx.fillStyle = sharePct > 0 ? stateCol : THEME.textDim;
      const hcTxt = sharePct > 0
        ? `${sharePct}%≈${tstate === 'unreachable' ? prevHc.desired + '!' : prevHc.target}`
        : '0%';
      ctx.fillText(hcTxt, (stepX0 + stepRight) / 2, my1);
      if (!tgtOff) {
        this._addHit(stepX0, b1.top, 20, b1.h, 'targetMinus', { type: r.type, tooltip: t('workforce.targetTooltip') });
        this._addHit(stepRight - 20, b1.top, 20, b1.h, 'targetPlus', { type: r.type, tooltip: t('workforce.targetTooltip') });
        // Środkowa komórka % → tooltip: podgląd celu (≈N osób, delta) + stan (między − i +, bez nachodzenia).
        if (sharePct > 0) this._addHit(stepX0 + 20, b1.top, (stepRight - stepX0) - 40, b1.h, 'targetState',
          { tooltip: this._targetStateTooltip(tstate, prevHc) });
      }

      // ── Linia 2: termometr obsady + POP+droidy/etaty + droid [− n +] ──
      const gaugeX = x, cells = 8;
      const cellW = Math.min(14, Math.max(4, Math.floor((wageRight - x - 60) / cells)));
      const filled = Math.max(0, Math.min(cells, Math.round((r.staffing ?? 0) * cells)));
      const gcol = r.staffing >= 0.9 ? THEME.danger : r.staffing >= 0.7 ? THEME.warning : THEME.success;
      for (let i = 0; i < cells; i++) {
        ctx.fillStyle = i < filled ? gcol : 'rgba(255,255,255,0.08)';
        ctx.fillRect(gaugeX + i * cellW, my2 - 4, cellW - 1, 8);
      }
      ctx.font = `10px ${THEME.fontFamily}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.textSecondary;
      const capTxt = `${r.workers}${r.synthetic > 0 ? '+' + r.synthetic + '🤖' : ''}/${r.grossJobs}`;
      ctx.fillText(capTxt, gaugeX + cells * cellW + 5, my2);
      const canRemove = r.synthetic > 0;
      const canInstall = r.synthetic < r.grossJobs;
      ctx.textAlign = 'center'; ctx.font = `bold 12px ${THEME.fontFamily}`;   // #3: 13→12 (spójne z linią 1)
      ctx.fillStyle = canRemove ? THEME.accent : THEME.textDim;  ctx.fillText('−', stepX0 + 9, b2.glyphY);
      ctx.fillStyle = canInstall ? THEME.accent : THEME.textDim; ctx.fillText('+', stepRight - 9, b2.glyphY);
      ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = r.synthetic > 0 ? THEME.accent : THEME.textDim;
      ctx.fillText(`🤖${r.synthetic}`, (stepX0 + stepRight) / 2, my2);
      if (canRemove)  this._addHit(stepX0, b2.top, 20, b2.h, 'droidRemove', { type: r.type, tooltip: t('workforce.droidTooltip') });
      if (canInstall) this._addHit(stepRight - 20, b2.top, 20, b2.h, 'droidInstall', { type: r.type, tooltip: t('workforce.droidTooltip') });

      // Hover nazwy → lista budynków tej warstwy.
      this._addHit(x, cy, wageRight - x - 44, ROW_H, 'strataRow', { type: r.type, tooltip: this._strataBuildingsTooltip(colony, r.type) });
      cy += ROW_H;
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return cy;   // wysokość TABELI — pasmo scrolla panelu (C4); globus stały (fixedGlobeSize)
  }

  // S4 — przypięta stopka Załogi: 3 linie 2-kolumnowe. Ta sama treść/kolory/tooltipy co dawna stopka
  // (wfInfo dla satysfakcji i wzrostu zachowane); Bilans w pełnej szerokości (Przychód − Płace = Netto).
  _drawWorkforceSummaryV2(ctx, x, y, w, colony, civ) {
    const humans = Math.floor(civ.humans ?? civ.population ?? 0);
    const unemployed = civ.unemployed ?? 0;
    const unempFrac = humans > 0 ? unemployed / humans : 0;
    const halfW = Math.floor((w - 10) / 2), xR = x + halfW + 10, LINE = 18;
    let cy = y;
    ctx.textBaseline = 'alphabetic';
    const cell = (cx, cw, label, val, valCol) => {
      ctx.font = `11px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;               ctx.textAlign = 'left';  ctx.fillText(label, cx, cy + 11);
      ctx.fillStyle = valCol ?? THEME.textPrimary; ctx.textAlign = 'right'; ctx.fillText(val, cx + cw, cy + 11);
    };
    // L1: Bezrobotni | Satysfakcja (+wfInfo tooltip)
    cell(x, halfW, t('workforce.unemployed'), `${unemployed} (${Math.round(unempFrac * 100)}%)`,
      unempFrac > 0.10 ? THEME.danger : THEME.textPrimary);
    cell(xR, halfW, t('workforce.satisfaction'), `${Math.round(civ.satisfaction ?? 50)}%`, THEME.textPrimary);
    this._addHit(xR, cy, halfW, LINE, 'wfInfo', { tooltip: this._satisfactionTooltip(civ) });
    cy += LINE;
    // L2: Prosperity | Wzrost (+wfInfo tooltip)
    const pros = window.KOSMOS?.prosperitySystem;
    if (pros && window.KOSMOS?.civSystem === civ) {
      const cur = pros.prosperity ?? 50, tgt = pros.targetProsperity ?? 50;
      const arrow = tgt > cur + 0.5 ? '↑' : tgt < cur - 0.5 ? '↓' : '→';
      const acol  = tgt > cur + 0.5 ? THEME.success : tgt < cur - 0.5 ? THEME.danger : THEME.textDim;
      cell(x, halfW, t('workforce.prosperity'), `${Math.round(cur)} ${arrow} ${Math.round(tgt)}`, acol);
    }
    const growth = civ.getAnnualGrowth?.() ?? 0;
    cell(xR, halfW, t('workforce.growth'), `+${growth.toFixed(1)}/${t('workforce.perYear')}`,
      growth > 0 ? THEME.success : THEME.textDim);
    this._addHit(xR, cy, halfW, LINE, 'wfInfo', { tooltip: this._growthTooltip(civ) });
    cy += LINE;
    // L3: Bilans (pełna szerokość): +Przychód − Płace = Netto Kr/rok
    const colMgr = window.KOSMOS?.colonyManager;
    const income = (colMgr?.calculateTaxIncome?.(colony) ?? 0) + (colony.creditsPerYear ?? 0);
    const wages  = civ.getTotalLaborCost?.() ?? 0, net = income - wages;
    ctx.font = `11px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left'; ctx.fillText(t('workforce.net'), x, cy + 11);
    ctx.fillStyle = net >= 0 ? THEME.success : THEME.danger; ctx.textAlign = 'right';
    ctx.fillText(`+${income.toFixed(0)} − ${wages.toFixed(0)} = ${net >= 0 ? '+' : ''}${net.toFixed(0)} Kr/${t('workforce.perYear')}`, x + w, cy + 11);
    cy += LINE;
    ctx.textAlign = 'left';
    return cy;
  }

  /** Tooltip listy budynków zatrudniających daną warstwę (hover w wierszu Załogi). */
  _strataBuildingsTooltip(colony, strataType) {
    const lang = getLocale();
    const bs = colony?.buildingSystem;
    const counts = {};
    if (bs?._active) {
      for (const [, entry] of bs._active) {
        const b = entry.building;
        if (!b || (b.jobs ?? 0) <= 0) continue;
        if ((b.popType ?? 'laborer') !== strataType) continue;
        counts[b.id] = (counts[b.id] ?? 0) + 1;
      }
    }
    const stMeta = STRATA_META[strataType];
    const strataName = stMeta ? (lang === 'en' ? stMeta.en : stMeta.pl) : strataType;
    const entries = Object.entries(counts);
    let html = `<b>${t('workforce.buildingsUsing', strataName)}</b><br>`;
    if (!entries.length) return html + `<span style="opacity:.6">${t('workforce.noBuildings')}</span>`;
    for (const [bid, n] of entries) {
      const b = BUILDINGS[bid];
      const nm = b ? (lang === 'en' ? (b.nameEN ?? b.namePL) : b.namePL) : bid;
      html += `${b?.icon ?? '▪'} ${nm}${n > 1 ? ` ×${n}` : ''}<br>`;
    }
    return html;
  }

  // ── Slice 5C.2 (F9): tooltipy rozbicia wzrostu i satysfakcji (hover w stopce Załogi) ──
  _growthTooltip(civ) {
    const g = civ.getGrowthBreakdown?.();
    if (!g) return '';
    let html = `<b>${t('workforce.growth')}: +${g.growth.toFixed(2)}/${t('workforce.perYear')}</b><br>`;
    if (g.blockReason) html += `<span style="color:#e08a5a">${t('workforce.growthTip.block.' + g.blockReason)}</span><br>`;
    html += `${t('workforce.growthTip.base')} ${g.base.toFixed(2)}<br>`;
    html += `${t('workforce.growthTip.prosperity')} ×${g.prosperityMult.toFixed(2)}<br>`;
    html += `${t('workforce.growthTip.planet')} ×${g.planetMod.toFixed(2)}<br>`;
    if (Math.abs(g.factionMult - 1) > 0.005) html += `${t('workforce.growthTip.faction')} ×${g.factionMult.toFixed(2)}<br>`;
    html += `${t('workforce.growthTip.taper')} ×${g.taper.toFixed(2)}<br>`;
    html += `${t('workforce.growthTip.capacity')} ${Math.floor(g.humans)}/${Math.floor(g.capacity)} (${Math.round(g.fillFrac * 100)}%)`;
    if (g.capped) html += `<br><span style="opacity:.7">${t('workforce.growthTip.capped', g.cap.toFixed(2))}</span>`;
    return html;
  }
  // Slice 5C.2 UX: tooltip podglądu celu — „≈N osób", delta do obecnej obsady, + wyjaśnienie stanu.
  _targetStateTooltip(tstate, prev) {
    const shown = tstate === 'unreachable' ? prev.desired : prev.target;
    const dsign = prev.delta > 0 ? '+' + prev.delta : String(prev.delta);
    let html = `<b>${t('workforce.targetPreview.title', shown, prev.current)}</b><br>`;
    if (prev.delta !== 0) html += `${t('workforce.targetPreview.delta', dsign)}<br>`;
    html += `<span style="opacity:.85">${t('workforce.targetState.' + tstate)}</span>`;
    return html;
  }
  _satisfactionTooltip(civ) {
    const s = civ.getSatisfactionBreakdown?.();
    if (!s) return '';
    const sign = (v) => (v >= 0 ? '+' : '') + v.toFixed(1);
    let html = `<b>${t('workforce.satisfaction')}: ${Math.round(s.satisfaction)}%</b><br>`;
    html += `${t('workforce.satTip.base')} ${s.base}<br>`;
    html += `${t('workforce.satTip.emp')} ${sign(s.empTerm)} (${t('workforce.satTip.unemp', Math.round(s.unemploymentRate * 100))})<br>`;
    html += `${t('workforce.satTip.crowd')} ${sign(s.crowdTerm)}<br>`;
    html += `${t('workforce.satTip.tax')} ${sign(s.taxTerm)} (${Math.round(s.taxRate * 100)}%)`;
    return html;
  }

  _drawWfRow(ctx, x, y, w, label, val, valColor) {
    ctx.font = `11px ${THEME.fontFamily}`; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
    ctx.fillText(label, x, y + 11);
    ctx.fillStyle = valColor ?? THEME.textPrimary; ctx.textAlign = 'right';
    ctx.fillText(val, x + w, y + 11);
    ctx.textAlign = 'left';
    return y + 18;
  }

  _truncateText(ctx, str, maxW) {
    if (ctx.measureText(str).width <= maxW) return str;
    let s = str;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  /** „Etaty: n× <warstwa>" dla tooltipa budynku (Faza 3 §6). */
  _jobsLine(bd) {
    const meta = STRATA_META[bd.popType ?? 'laborer'];
    const sn = meta ? (getLocale() === 'en' ? meta.en : meta.pl) : (bd.popType ?? 'laborer');
    return t('workforce.jobsLine', bd.jobs ?? 0, sn);
  }

  // ── Pasek listy budynków nad mapą (poziomy, kompaktowe chipy ikona+×count) ─
  // Pokazuje WSZYSTKIE budynki (czytane z _active co klatkę → nowo powstałe na
  // żywo). Nadmiar dostępny przez poziome przewijanie kółkiem nad paskiem.
  _drawBuildingsBar(ctx, x, y, w, h, colony) {
    // Tło paska + dolna linia
    ctx.fillStyle = 'rgba(2,4,8,0.72)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.borderActive; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + h - 0.5); ctx.lineTo(x + w, y + h - 0.5); ctx.stroke();
    ctx.globalAlpha = 1;

    const cy = y + h / 2;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';

    // Etykieta sekcji (stała, nie przewija się)
    ctx.font = `bold 10px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(t('colonyInfo.buildings'), x + 12, cy);
    const labelW = ctx.measureText(t('colonyInfo.buildings')).width;

    const entries = Object.entries(this._buildingSummary(colony));
    if (!entries.length) {
      ctx.font = `italic 10px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('colonyInfo.noBuildings'), x + 12 + labelW + 16, cy);
      ctx.textBaseline = 'alphabetic';
      this._buildBarScroll = 0;
      return;
    }

    // Strefa chipów (przewijana). Zachowaj margines na strzałki ‹ ›.
    const chipsX0 = x + 12 + labelW + 16;
    const chipsX1 = x + w - 12;
    const availW = chipsX1 - chipsX0;

    // Zmierz chipy (kompaktowe: ikona + ×count gdy >1)
    ctx.font = `12px ${THEME.fontFamily}`;
    const chips = [];
    let totalW = 0;
    for (const [bid, count] of entries) {
      const b = BUILDINGS[bid];
      if (!b) continue;
      const label = count > 1 ? `${b.icon ?? '▪'}${count}` : `${b.icon ?? '▪'}`;
      const lw = ctx.measureText(label).width + 12;   // + padding chipa
      chips.push({ bid, count, b, label, lw });
      totalW += lw;
    }

    // Clamp scrollu do zawartości
    const maxScroll = Math.max(0, totalW - availW);
    this._buildBarScroll = Math.max(0, Math.min(maxScroll, this._buildBarScroll ?? 0));
    const scroll = this._buildBarScroll;

    // Clip do strefy chipów i rysuj
    ctx.save();
    ctx.beginPath(); ctx.rect(chipsX0, y, availW, h); ctx.clip();
    let sx = chipsX0 - scroll;
    for (const c of chips) {
      const visible = sx + c.lw > chipsX0 && sx < chipsX1;
      if (visible) {
        ctx.fillStyle = CAT_COLORS[c.b.category] ?? THEME.textPrimary;
        ctx.fillText(c.label, sx + 2, cy);
        this._addHit(sx, y + 4, c.lw, h - 8, 'headerBuilding', { buildingId: c.bid, count: c.count });
      }
      sx += c.lw;
    }
    ctx.restore();

    // Wskaźniki przewijania ‹ ›
    ctx.font = `bold 12px ${THEME.fontFamily}`;
    if (scroll > 0) {
      ctx.fillStyle = THEME.accent; ctx.textAlign = 'left';
      ctx.fillText('‹', chipsX0 - 10, cy);
    }
    if (scroll < maxScroll) {
      ctx.fillStyle = THEME.accent; ctx.textAlign = 'left';
      ctx.fillText('›', chipsX1 + 1, cy);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Zlicz budynki per typ (bez capital_*) — wspólne dla nagłówka i panelu info
  _buildingSummary(colony) {
    const out = {};
    if (colony?.buildingSystem?._active) {
      for (const [key, entry] of colony.buildingSystem._active) {
        if (key.startsWith('capital_')) continue;
        const bid = entry.building?.id;
        if (!bid) continue;
        out[bid] = (out[bid] ?? 0) + 1;
      }
    }
    return out;
  }

  _drawInfoSection(ctx, x, y, w, label) {
    ctx.font = `bold 10px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, y + 10);
    ctx.strokeStyle = THEME.borderActive; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(x, y + 15); ctx.lineTo(x + w, y + 15); ctx.stroke();
    ctx.globalAlpha = 1;
    return y + 24;
  }

  _drawInfoRow(ctx, x, y, w, label, val) {
    ctx.font = `11px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, y + 11);
    ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'right';
    ctx.fillText(val, x + w, y + 11);
    ctx.textAlign = 'left';
    return y + 17;
  }

  // C3 — przygaszona pod-linia efektów środowiskowych pod wierszem charakterystyki.
  // effects = tablica tokenów {key, params, tone} z computeEnvironmentEffects; pusta/brak → 0 wys.
  // arrow=true prefiksuje „→" (wpływ warunku z wiersza wyżej); false = linia samodzielna (wzrost).
  // Kolor: token 'gate' (twarda blokada) → ostrzegawczy akcent; inaczej przygaszony.
  _drawEnvLine(ctx, x, y, w, effects, arrow = true) {
    if (!effects || !effects.length) return y;
    const text = effects.map(e => t(e.key, ...(e.params ?? []))).join(', ');
    const gate = effects.some(e => e.tone === 'gate');
    ctx.font = `9px ${THEME.fontFamily}`;
    ctx.fillStyle = gate ? THEME.warning : THEME.textDim;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText((arrow ? '→ ' : '') + text, x + (arrow ? 6 : 0), y + 8);
    ctx.fillStyle = THEME.textDim;
    return y + 12;
  }

  _drawDepositRow(ctx, x, y, w, dep, readout) {
    const def = ALL_RESOURCES[dep.resourceId];
    const lang = getLocale();
    const name = def ? (lang === 'en' ? (def.nameEN ?? def.namePL) : def.namePL) : dep.resourceId;
    const icon = def?.icon ?? '•';
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = `11px ${THEME.fontFamily}`;
    ctx.fillStyle = readout?.depleted ? THEME.textDim : THEME.textPrimary;   // wyczerpane → przygaszone
    ctx.fillText(`${icon} ${name}`, x, y + 11);
    // Bogactwo złoża → 4 kropki (prawy skraj)
    const dx = x + w - 4 * 9;
    const dots = Math.max(0, Math.min(4, Math.round((dep.richness ?? 0) * 4)));
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < dots ? THEME.accent : 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(dx + i * 9 + 3, y + 7, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // C2 — pozostało/początkowe + ETA wyczerpania (środek, wyrównane do prawej przed kropkami).
    // „—" = brak aktywnego wydobycia; „~" = ETA liniowe (przybliżenie); kolor ostrzegawczy < 20 lat.
    if (readout) {
      const etaText = readout.etaYears == null
        ? '—'
        : `~${fmtCompact(Math.round(readout.etaYears))} ${t('colonyInfo.depositEtaUnit')}`;
      ctx.font = `9px ${THEME.fontFamily}`;
      ctx.textAlign = 'right';
      const rightEdge = dx - 8;
      ctx.fillStyle = readout.warn ? THEME.danger : THEME.textDim;
      ctx.fillText(etaText, rightEdge, y + 10);
      const etaW = ctx.measureText(etaText).width;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(readout.ratioStr, rightEdge - etaW - 8, y + 10);
      ctx.textAlign = 'left';
    }
    return y + 17;
  }

  // ── Globus 3D embedded — cykl życia ─────────────────────────────────────
  // bounds w pikselach CSS = logiczne × uiScale (osobny DOM canvas).
  _syncGlobe(discX, discY, discW, discH, planet, grid) {
    if (!planet) { this._teardownGlobe(); return; }
    const scale = window.KOSMOS?.uiScale ?? _UI_SCALE;
    const bounds = {
      x: Math.round(discX * scale), y: Math.round(discY * scale),
      w: Math.round(discW * scale), h: Math.round(discH * scale),
    };
    if (!this._globe) this._globe = new PlanetGlobeRenderer();

    // Re-open gdy zmiana planety (przełączenie aktywnej kolonii)
    if (this._globePlanetId !== planet.id) {
      if (this._globe.isOpen) this._globe.close();
      try {
        this._globe.open(planet, grid, bounds, /* externalInput */ true);
        // Globus jest dekoracyjny (auto-rotacja) — niech nie łapie zdarzeń myszy
        // w swoim prostokącie (z-index 3, nad ui-canvas); klik idzie do overlayu.
        if (this._globe._canvas) this._globe._canvas.style.pointerEvents = 'none';
        // Auto-rotacja napędzana pętlą renderu globu (płynna, niezależna od draw()).
        // Ustawiamy RAZ przy otwarciu — lekki tilt + powolny obrót.
        const ctrl = this._globe.cameraCtrl;
        if (ctrl) { ctrl.setYawPitch(0.6, 0.28); ctrl.setAutoRotate(0.18); }
        this._globePlanetId = planet.id;
      } catch (err) {
        console.warn('[ColonyOverlay] globe open failed:', err);
        this._globe = null; this._globePlanetId = null;
        return;
      }
    } else if (this._globe.isOpen) {
      this._globe.updateBounds(bounds);
    }
  }

  _teardownGlobe() {
    if (this._globe?.isOpen) this._globe.close();
    this._globePlanetId = null;
  }

  // ── Mapa 2D ──────────────────────────────────────────────────────────────
  _drawMap(ctx, ox, oy, ow, oh, grid, planet) {
    const hs = this._hexSize;
    const cx = ox + ow / 2 - this._camX;
    const cy = oy + oh / 2 - this._camY;

    grid.forEach((tile) => {
      const pos = grid.tilePixelPos(tile.q, tile.r, hs);
      const sx = cx + pos.x, sy = cy + pos.y;
      if (sx < ox - hs * 2 || sx > ox + ow + hs * 2) return;
      if (sy < oy - hs * 2 || sy > oy + oh + hs * 2) return;

      const terrain = TERRAIN_TYPES[tile.type] ?? TERRAIN_TYPES.plains;
      const hov = this._hoveredHex?.q === tile.q && this._hoveredHex?.r === tile.r;
      const sel = this._selectedHex?.q === tile.q && this._selectedHex?.r === tile.r;
      this._drawHex(ctx, sx, sy, hs, terrain, tile, hov, sel, planet, grid);
    });

    // Opcja C v3: Supply Coverage overlay (toggle 'S')
    if (this._showSupplyCoverage) {
      this._drawSupplyCoverage(ctx, ox, oy, ow, oh, grid);
    }

    // Jednostki naziemne (rysowane NAD hexami)
    this._drawUnits(ctx, ox, oy, ow, oh, grid);
  }

  /** Rysuje tint coverage (green=capital, blue=barracks, orange=supplier). */
  _drawSupplyCoverage(ctx, ox, oy, ow, oh, grid) {
    const colony = this._getColony();
    const sys = window.KOSMOS?.supplyCoverageSystem;
    if (!sys || !colony) return;
    const coverage = sys.getCoverage(colony.planetId);
    if (!coverage || coverage.size === 0) return;

    const hs = this._hexSize;
    const cx = ox + ow / 2 - this._camX;
    const cy = oy + oh / 2 - this._camY;

    ctx.save();
    for (const [key, info] of coverage) {
      const [qS, rS] = key.split(',');
      const q = Number(qS), r = Number(rS);
      const tile = grid?.get(q, r);
      if (!tile) continue;
      const pos = grid.tilePixelPos(q, r, hs);
      const sx = cx + pos.x;
      const sy = cy + pos.y;

      let color;
      if (info.type === 'capital')       color = 'rgba(50, 220, 100, 0.22)';
      else if (info.type === 'barracks') color = 'rgba(60, 150, 230, 0.20)';
      else                                color = 'rgba(230, 150, 50, 0.22)';

      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const px = sx + hs * Math.cos(a);
        const py = sy + hs * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawUnitPanel(ctx, ox, oy, ow, oh) {
    const unit = this._selectedUnit;
    if (!unit) return;

    // Sprawdź czy hex pod roverem ma anomalię do analizy
    const colony = this._getColony();
    const grid = colony ? this._getGrid(colony) : null;
    const tile = grid?.get(unit.q, unit.r);
    const canAnalyze = tile?.anomaly && tile.anomalyDetected && !tile.anomalyRevealed;

    // Faza 6: owner info i cele ataku
    const isEnemy = unit.owner && unit.owner !== 'player';
    const gum = window.KOSMOS?.groundUnitManager;
    const adjacentEnemy = (!isEnemy && gum)
      ? this._findAdjacentEnemyUnit(unit, gum)
      : null;
    const adjacentPlayer = (isEnemy && gum)
      ? this._findAdjacentPlayerUnit(unit, gum)
      : null;
    const canAttack = !isEnemy && adjacentEnemy && unit._atkCooldown <= 0 && (unit.attack ?? 0) > 0;

    // Deploy/Pack (garrison_unit): rezerwuj linię stanu + przycisk/progress
    const hasDeploy = !isEnemy && unit.deployState != null;
    const inTransit = hasDeploy && (unit.deployState === 'deploying' || unit.deployState === 'packing');

    // Stack navigator: jeśli na hexie jest >1 jednostek tej samej strony,
    // pokaż pasek cyklowania ◄ current/total ► (mały przycisk nawigacji)
    const hexSiblings = gum?.getUnitsAtHex?.(unit.planetId, unit.q, unit.r) ?? [];
    const ownerFilter = isEnemy
      ? (u => u.owner && u.owner !== 'player')
      : (u => !u.owner || u.owner === 'player');
    const siblings = hexSiblings.filter(ownerFilter);
    const hasSiblings = siblings.length > 1;

    // Panel w prawym dolnym rogu overlay — dynamiczna wysokość
    const pw = 200;
    let ph = 96;  // baza: nazwa + status + hex + HP
    if (isEnemy) ph += 14;                         // banner "ROZPOZNANIE"
    const multiSelect = this._selectedUnits.size > 1;
    if (multiSelect) ph += 18;                    // banner "Zaznaczono N"
    if (hasSiblings) ph += 22;                    // stack navigator
    if (unit.attack != null) ph += 18;            // linia attack/defense
    // Opcja C v3: rezerwuj miejsce dla supply/org/morale + damageMult (tylko archetypowe jednostki)
    const hasSupplyV3 = unit.supply != null && !isEnemy;
    if (hasSupplyV3) ph += 52;                     // 3 linie stats + 1 linia damageMult
    if (hasDeploy) ph += inTransit ? 44 : 44;      // label stanu (14) + button/progress (26) + odstęp (4)
    if (canAttack) ph += 26;                      // przycisk atak
    if (!isEnemy && unit.status === 'idle') ph += 26; // survey
    if (!isEnemy && unit.status === 'idle' && canAnalyze) ph += 26; // analyze
    ph += 26;  // deselect
    const px = ox + ow - pw - 8;
    const py = oy + oh - ph - 8;

    // Tło — neon accent (choose-your-leader style)
    const ACC = isEnemy ? '#FF4060' : '#00ffb4';
    const ACC_RGB = isEnemy ? 'rgba(255,64,96' : 'rgba(0,255,180';
    ctx.save();
    ctx.shadowColor = `${ACC_RGB},0.30)`;
    ctx.shadowBlur = 14;
    ctx.fillStyle = isEnemy ? 'rgba(16, 4, 4, 0.96)' : 'rgba(6, 5, 4, 0.96)';
    ctx.fillRect(px, py, pw, ph);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = ACC;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    // Inner accent line
    ctx.strokeStyle = `${ACC_RGB},0.15)`;
    ctx.strokeRect(px + 3.5, py + 3.5, pw - 7, ph - 7);
    ctx.restore();

    // Banner "ROZPOZNANIE" dla wrogiej jednostki
    if (isEnemy) {
      ctx.fillStyle = 'rgba(216, 90, 48, 0.25)';
      ctx.fillRect(px, py, pw, 14);
      ctx.font = `bold 9px ${THEME.fontFamily}`;
      ctx.fillStyle = '#FF9060';
      ctx.textAlign = 'center';
      ctx.fillText('🔴 ROZPOZNANIE — brak kontroli', px + pw / 2, py + 7);
      ctx.textAlign = 'left';
    }

    // Banner multi-select (nad normalnym content panelu)
    let multiBannerOffset = 0;
    if (multiSelect) {
      const bY = py + (isEnemy ? 14 : 0);
      ctx.fillStyle = 'rgba(0,255,180,0.14)';
      ctx.fillRect(px, bY, pw, 18);
      ctx.font = `bold 10px ${THEME.fontFamily}`;
      ctx.fillStyle = '#00ffb4';
      ctx.textAlign = 'center';
      ctx.fillText(`👥 ZAZNACZONO ${this._selectedUnits.size}`, px + pw / 2, bY + 9);
      ctx.textAlign = 'left';
      multiBannerOffset = 18;
    }

    // Stack navigator: ◄ current/total ► gdy na hexie jest >1 jednostek tego samego typu
    let navOffset = 0;
    if (hasSiblings) {
      const navY = py + (isEnemy ? 14 : 0) + multiBannerOffset;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(px, navY, pw, 22);
      ctx.strokeStyle = 'rgba(0,255,180,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, navY + 22);
      ctx.lineTo(px + pw, navY + 22);
      ctx.stroke();

      const curIdx = siblings.findIndex(u => u.id === unit.id);
      const prevIdx = (curIdx - 1 + siblings.length) % siblings.length;
      const nextIdx = (curIdx + 1) % siblings.length;

      // ◄ przycisk
      ctx.fillStyle = 'rgba(0,255,180,0.12)';
      ctx.fillRect(px + 4, navY + 3, 28, 16);
      ctx.strokeStyle = '#00ffb4';
      ctx.strokeRect(px + 4.5, navY + 3.5, 27, 15);
      ctx.fillStyle = '#00ffb4';
      ctx.font = `bold 12px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText('◄', px + 18, navY + 15);
      this._addHit(px + 4, navY + 3, 28, 16, 'cycleHexUnit', { unitId: siblings[prevIdx].id });

      // Current counter
      ctx.font = `10px ${THEME.fontFamily}`;
      ctx.fillStyle = '#00ffb4';
      ctx.fillText(`${curIdx + 1} / ${siblings.length} NA HEX`, px + pw / 2, navY + 15);

      // ► przycisk
      ctx.fillStyle = 'rgba(0,255,180,0.12)';
      ctx.fillRect(px + pw - 32, navY + 3, 28, 16);
      ctx.strokeStyle = '#00ffb4';
      ctx.strokeRect(px + pw - 31.5, navY + 3.5, 27, 15);
      ctx.fillStyle = '#00ffb4';
      ctx.font = `bold 12px ${THEME.fontFamily}`;
      ctx.fillText('►', px + pw - 18, navY + 15);
      this._addHit(px + pw - 32, navY + 3, 28, 16, 'cycleHexUnit', { unitId: siblings[nextIdx].id });

      navOffset = 22;
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let ly = py + (isEnemy ? 28 : 16) + multiBannerOffset + navOffset;

    // Nagłówek — typ jednostki + owner
    ctx.font = `bold 11px ${THEME.fontFamily}`;
    ctx.fillStyle = isEnemy ? '#FF6040' : '#00ffb4';
    const typeLabel = {
      science_rover: '🔬 ŁAZIK',
      infantry:      '🪖 PIECHOTA',
      mech:          '🤖 MECH',
      garrison:      '🛡 GARNIZON',
    }[unit.type] ?? unit.type.toUpperCase();
    const prefix = isEnemy ? '⚠ ' : '';
    ctx.fillText(`${prefix}${typeLabel}`, px + 8, ly);
    ly += 18;

    // Owner
    if (isEnemy) {
      const emp = window.KOSMOS?.empireRegistry?.get(unit.owner);
      ctx.font = `10px ${THEME.fontFamily}`;
      ctx.fillStyle = '#FF9060';
      ctx.fillText(emp?.name ?? unit.owner, px + 8, ly);
      ly += 14;
    }

    // Status
    ctx.font = `11px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const missionType = unit.mission?.type;
    const scanPct = Math.floor((unit.mission?.progress ?? 0) * 100);
    const statusLabels = {
      idle:     '⏸ Bezczynna',
      moving:   '🚀 W ruchu',
      scanning: missionType === 'survey'  ? `🔍 Skanowanie ${scanPct}%`
              : missionType === 'analyze' ? `🔬 Analiza ${scanPct}%`
              : `🔍 Skan ${scanPct}%`,
      working:  '⚙ Pracuje',
    };
    ctx.fillText(statusLabels[unit.status] ?? unit.status, px + 8, ly);
    ly += 14;

    // HP bar
    if (unit.hpMax) {
      const bw = pw - 16, bh = 6;
      const bx = px + 8, by = ly;
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.fillRect(bx, by, bw, bh);
      const hpPct = Math.max(0, Math.min(1, unit.hp / unit.hpMax));
      ctx.fillStyle = hpPct > 0.5 ? '#60E0B0' : hpPct > 0.25 ? '#D8A030' : '#D85A30';
      ctx.fillRect(bx, by, Math.round(bw * hpPct), bh);
      ctx.fillStyle = THEME.textDim;
      ctx.font = `9px ${THEME.fontFamily}`;
      ctx.fillText(`HP ${unit.hp}/${unit.hpMax}`, bx, by + 13);
      ly += 18;
    }

    // Attack/Defense
    if (unit.attack != null) {
      ctx.font = `10px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`⚔ ${unit.attack}  🛡 ${unit.defense}  🎯 ${unit.range ?? 1}`, px + 8, ly);
      ly += 16;
    }

    // Opcja C v3: Supply / Org / Morale + damageMult live
    if (hasSupplyV3) {
      ctx.font = `10px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      const supStr = `📦 ${Math.round(unit.supply)}/${unit.supplyCap}`;
      const conStr = `−${unit.supplyConsumption ?? 2}/y`;
      ctx.fillText(`${supStr}  ${conStr}`, px + 8, ly);
      ly += 14;

      const orgStr = `🎖 Org ${Math.round(unit.org)}/${unit.maxOrg}`;
      const morStr = unit.noMorale
        ? '🤖 N/A'
        : `🔥 Mor ${Math.round(unit.morale)}/${unit.maxMorale}`;
      ctx.fillText(`${orgStr}  ${morStr}`, px + 8, ly);
      ly += 14;

      // damageMult live (breakdown)
      const supFac = (unit.supply ?? 0) <= 0 ? 0 : Math.min((unit.supply ?? 0) / 20, 1);
      const noMor  = unit.noMorale === true;
      const coreSum = (unit.org ?? 0) + (noMor ? 0 : (unit.morale ?? 0));
      const coreDiv = noMor ? 100 : 200;
      const coreBonus = coreSum / coreDiv;
      const dmgMult = supFac * (1 + coreBonus);
      const multColor = dmgMult >= 1.5 ? '#60E0B0' : dmgMult >= 1.0 ? '#E0C020' : dmgMult > 0 ? '#E08020' : '#D85A30';
      ctx.fillStyle = multColor;
      ctx.font = `bold 10px ${THEME.fontFamily}`;
      ctx.fillText(`⚔ DMG ×${dmgMult.toFixed(2)}  (${supFac.toFixed(2)} × ${(1 + coreBonus).toFixed(2)})`, px + 8, ly);
      ly += 16;
    }

    // Hex pos
    ctx.font = `10px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`Hex: (${unit.q}, ${unit.r})`, px + 8, ly);
    ly += 18;

    // Deploy/Pack — label stanu + przycisk lub progress bar
    if (hasDeploy) {
      ctx.font = `bold 10px ${THEME.fontFamily}`;
      const stateLabels = {
        mobile:    '🚛 Tryb: Mobile (wóz kołowy)',
        deploying: '⏳ Rozkładanie...',
        deployed:  '🛡 Tryb: Deployed (okopany)',
        packing:   '⏳ Zwijanie...',
      };
      const stateColors = {
        mobile:    '#E0C020',
        deploying: '#E08020',
        deployed:  '#60E0B0',
        packing:   '#E08020',
      };
      ctx.fillStyle = stateColors[unit.deployState] ?? THEME.textDim;
      ctx.fillText(stateLabels[unit.deployState] ?? unit.deployState, px + 8, ly);
      ly += 14;

      // Progress bar w tranzycie; przyciski w stanach stabilnych
      if (inTransit) {
        // Pasek progresu (stateTimer liczy DO zera; pełny = 0, pusty = totalTime)
        const arch = this._deployArchetypes?.[unit.archetypeId];
        const total = unit.deployState === 'deploying'
          ? (arch?.deployTime ?? 2.0)
          : (arch?.packTime   ?? 1.0);
        const remain = Math.max(0, unit.stateTimer ?? 0);
        const pct = total > 0 ? (1 - remain / total) : 1;
        const bw = pw - 16, bh = 10;
        const bx = px + 8, by = ly;
        ctx.fillStyle = 'rgba(60,60,60,0.5)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#E0C020';
        ctx.fillRect(bx, by, Math.round(bw * pct), bh);
        ctx.font = `9px ${THEME.fontFamily}`;
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center';
        ctx.fillText(`${remain.toFixed(1)}y`, bx + bw / 2, by + 5);
        ctx.textAlign = 'left';
        // Przycisk anuluj (mały, pod paskiem)
        const abx = px + 8, aby = ly + 12, abw = pw - 16, abh = 18;
        ctx.fillStyle = 'rgba(216, 90, 48, 0.4)';
        ctx.fillRect(abx, aby, abw, abh);
        ctx.fillStyle = '#FFF';
        ctx.font = `bold 9px ${THEME.fontFamily}`;
        ctx.fillText('✕ Anuluj', abx + abw / 2 - 20, aby + 9);
        this._addHit(abx, aby, abw, abh, 'unitCancelDeploy');
        ly += 34;
      } else if (unit.deployState === 'mobile') {
        // Przycisk: Rozłóż
        const canDeploy = unit.status !== 'moving';
        const bx = px + 8, by = ly, bw = pw - 16, bh = 22;
        ctx.fillStyle = canDeploy ? '#60E0B0' : 'rgba(96,96,96,0.5)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#000';
        ctx.font = `bold 10px ${THEME.fontFamily}`;
        ctx.fillText('🏴 Rozłóż (2.0y)', bx + 6, by + 12);
        if (canDeploy) this._addHit(bx, by, bw, bh, 'unitDeploy');
        ly += 26;
      } else if (unit.deployState === 'deployed') {
        // Przycisk: Zwiń (potrzebuje org >= 15)
        const orgCost = 15;
        const canPack = (unit.org ?? 0) >= orgCost;
        const bx = px + 8, by = ly, bw = pw - 16, bh = 22;
        ctx.fillStyle = canPack ? '#E0C020' : 'rgba(96,96,96,0.5)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#000';
        ctx.font = `bold 10px ${THEME.fontFamily}`;
        const label = canPack ? '🎒 Zwiń (1.0y, -15 org)' : `🎒 Zwiń (potrzeba ${orgCost} org)`;
        ctx.fillText(label, bx + 6, by + 12);
        if (canPack) this._addHit(bx, by, bw, bh, 'unitPackUp');
        ly += 26;
      }
    }

    // Victoria 2 stack combat: ATAKUJ USUNIĘTY — bitwy rozstrzygają się automatycznie
    // gdy jednostki różnych właścicieli są na tym samym hexie. Zamiast kliknięcia,
    // gracz pozycjonuje jednostki ruchem.

    // Unit w bitwie — pokaż info
    if (!isEnemy && gum.isUnitInCombat(unit)) {
      ctx.font = `bold 10px ${THEME.fontFamily}`;
      ctx.fillStyle = '#FF6030';
      ctx.fillText(`⚔ W BITWIE`, px + 8, ly + 8);
      ly += 14;
      ctx.font = `9px ${THEME.fontFamily}`;
      ctx.fillStyle = '#C4A060';
      ctx.fillText(`Ruch = odwrót z −25% HP`, px + 8, ly + 6);
      ly += 14;
    }

    // Ranged support (artyleria, AA, deployed garrison) — przycisk "Wesprzyj bitwę"
    const unitRange = unit.range ?? 1;
    const isRangedCapable = !isEnemy && unitRange >= 2 && !gum.isUnitInCombat(unit);
    if (isRangedCapable) {
      const cs = window.KOSMOS?.combatSystem;
      // Jeśli już wspiera → pokaż cofnij
      if (unit.supportTarget) {
        const bx = px + 8, by = ly - 6, bw = pw - 16, bh = 22;
        ctx.fillStyle = '#888844';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#FFF';
        ctx.font = `bold 10px ${THEME.fontFamily}`;
        ctx.fillText(`✕ Cofnij wsparcie (${unit.supportTarget.q},${unit.supportTarget.r})`, bx + 6, by + 12);
        this._addHit(bx, by, bw, bh, 'unitClearSupport');
        ly += 26;
      } else if (cs) {
        // Sprawdź czy w zasięgu są contested hexy
        const hasCandidates = this._hasSupportCandidates(unit, cs);
        const bx = px + 8, by = ly - 6, bw = pw - 16, bh = 22;
        ctx.fillStyle = hasCandidates ? '#22AAFF' : 'rgba(60,80,100,0.5)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = hasCandidates ? '#FFF' : '#8899AA';
        ctx.font = `bold 10px ${THEME.fontFamily}`;
        const label = hasCandidates ? '🎯 Wesprzyj bitwę' : '🎯 Brak bitew w zasięgu';
        ctx.fillText(label, bx + 6, by + 12);
        if (hasCandidates) this._addHit(bx, by, bw, bh, 'unitSupportStart');
        ly += 26;
      }
    }

    // Przyciski survey/analyze — tylko dla gracza, idle
    if (!isEnemy && unit.status === 'idle') {
      const bx = px + 8, by = ly - 6, bw = pw - 16, bh = 22;
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#000';
      ctx.font = `bold 10px ${THEME.fontFamily}`;
      ctx.fillText('🔍 Skanuj obszar', bx + 6, by + 12);
      this._addHit(bx, by, bw, bh, 'unitSurvey');
      ly += 26;
    }
    if (!isEnemy && unit.status === 'idle' && canAnalyze) {
      const bx = px + 8, by = ly - 6, bw = pw - 16, bh = 22;
      ctx.fillStyle = '#cc66ff';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#000';
      ctx.font = `bold 10px ${THEME.fontFamily}`;
      ctx.fillText('🔬 Analizuj anomalię', bx + 6, by + 12);
      this._addHit(bx, by, bw, bh, 'unitAnalyze');
      ly += 26;
    }

    // Odznacz
    {
      const bx = px + 8, by = ly - 6, bw = pw - 16, bh = 20;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = THEME.textDim;
      ctx.font = `10px ${THEME.fontFamily}`;
      ctx.fillText('✕ Odznacz', bx + 6, by + 11);
      this._addHit(bx, by, bw, bh, 'unitDeselect');
    }
  }

  // Faza 6: znajdź wrogą jednostkę na sąsiadujących hexach
  _findAdjacentEnemyUnit(unit, gum) {
    const all = gum.getUnitsOnPlanet(unit.planetId);
    const range = unit.range ?? 1;
    for (const u of all) {
      if (u.id === unit.id) continue;
      if (u.owner === unit.owner || (!u.owner && !unit.owner)) continue;
      const dist = this._hexDist(unit.q, unit.r, u.q, u.r);
      if (dist <= range) return u;
    }
    return null;
  }
  _findAdjacentPlayerUnit(enemyUnit, gum) {
    const all = gum.getUnitsOnPlanet(enemyUnit.planetId);
    for (const u of all) {
      if (u.owner && u.owner !== 'player') continue;
      const dist = this._hexDist(enemyUnit.q, enemyUnit.r, u.q, u.r);
      if (dist <= 1) return u;
    }
    return null;
  }
  _hexDist(q1, r1, q2, r2) {
    const s1 = -q1 - r1;
    const s2 = -q2 - r2;
    return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(s1 - s2)) / 2;
  }

  _loadUnitSprites() {
    // ── Legacy jednostki (science_rover, infantry, mech, garrison) ──
    const roverImg = new Image();
    roverImg.src = 'assets/units/science_rover.png';
    this._unitSprites.set('science_rover', roverImg);

    // ── Ground Unit System: sprity wszystkich archetypów × frakcji ──
    // Klucz: `${factionId}:${archetypeId}` (np. 'humanity:shock_infantry').
    // Archetypy z supportsDeploy (garrison_unit) dodatkowo ładują dwa warianty
    // z sufiksami `_mobile` / `_deployed` (klucz `...:mobile` / `...:deployed`).
    // Brakujące PNG → GroundUnitFactory.loadUnitSprite() podstawia runtime placeholder.
    Promise.all([
      import('../systems/GroundUnitFactory.js'),
      import('../data/factions/humanity.js'),
      import('../data/factions/UNE.js'),
      import('../data/factions/Syndykat.js'),
      import('../data/unitArchetypes.js'),
    ]).then(([
      { GroundUnitFactory },
      { HUMANITY_UNITS },
      { UNE_UNITS },
      { SYNDYKAT_UNITS },
      { UNIT_ARCHETYPES },
    ]) => {
      const factions = { humanity: HUMANITY_UNITS, UNE: UNE_UNITS, Syndykat: SYNDYKAT_UNITS };
      for (const [factionId, units] of Object.entries(factions)) {
        for (const [archetypeId, def] of Object.entries(units)) {
          const key = `${factionId}:${archetypeId}`;
          this._unitSprites.set(key, GroundUnitFactory.loadUnitSprite(def.sprite));
          // Warianty deploy mode (jeśli archetyp wspiera rozkładanie)
          if (UNIT_ARCHETYPES[archetypeId]?.supportsDeploy) {
            const mobilePath   = this._deriveVariantPath(def.sprite, 'mobile');
            const deployedPath = this._deriveVariantPath(def.sprite, 'deployed');
            this._unitSprites.set(`${key}:mobile`,   GroundUnitFactory.loadUnitSprite(mobilePath));
            this._unitSprites.set(`${key}:deployed`, GroundUnitFactory.loadUnitSprite(deployedPath));
          }
        }
      }
      // Cache archetypów dla UI (progress bar czyta deployTime/packTime).
      this._deployArchetypes = UNIT_ARCHETYPES;
    }).catch(err => console.warn('[ColonyOverlay] Nie udało się załadować sprite\'ów jednostek:', err));
  }

  /**
   * Przekształć ścieżkę bazową w wariant deploy mode.
   * `human_garrison.png` → `human_garrison_mobile.png` lub `..._deployed.png`.
   */
  _deriveVariantPath(basePath, variant) {
    return basePath.replace(/(\.[a-z]+)$/i, `_${variant}$1`);
  }

  /** Zwróć obraz sprite'a dla jednostki (Ground Unit System + legacy fallback). */
  _getUnitSprite(unit) {
    if (unit.factionId && unit.archetypeId) {
      // Deploy mode variant: mobile/deploying → _mobile; deployed/packing → _deployed.
      if (unit.deployState) {
        const variant = (unit.deployState === 'mobile' || unit.deployState === 'deploying')
          ? 'mobile' : 'deployed';
        const variantKey = `${unit.factionId}:${unit.archetypeId}:${variant}`;
        const variantImg = this._unitSprites.get(variantKey);
        if (variantImg) return variantImg;
      }
      const key = `${unit.factionId}:${unit.archetypeId}`;
      const img = this._unitSprites.get(key);
      if (img) return img;
    }
    // Legacy fallback po `type`
    return this._unitSprites.get(unit.type);
  }

  _drawUnits(ctx, ox, oy, ow, oh, grid) {
    const mgr = window.KOSMOS?.groundUnitManager;
    const colony = this._getColony();
    if (!mgr || !colony) return;

    const units = mgr.getUnitsOnPlanet(colony.planetId);
    const hs = this._hexSize;
    const cx = ox + ow / 2 - this._camX;
    const cy = oy + oh / 2 - this._camY;

    for (const unit of units) {
      // Ground Unit System: ukryte jednostki (stealth) nie są rysowane dla wroga.
      // Dla 'player' pokazujemy zawsze (gracz widzi swoje).
      if (unit._stealthState === 'hidden' && unit.owner && unit.owner !== 'player') continue;
      const img = this._getUnitSprite(unit);
      // Faza 6: wroga jednostka → czerwone kolory glow/ring/ramka
      const isEnemy = unit.owner && unit.owner !== 'player';

      // Pozycja: interpolacja między hexami podczas ruchu
      let sx, sy;
      if (unit.status === 'moving' && unit._path?.length > 0) {
        const fromPos = grid.tilePixelPos(unit.q, unit.r, hs);
        const nextHex = unit._path[0];
        const toPos   = grid.tilePixelPos(nextHex.q, nextHex.r, hs);
        sx = cx + fromPos.x + (toPos.x - fromPos.x) * unit._animT;
        sy = cy + fromPos.y + (toPos.y - fromPos.y) * unit._animT;
      } else {
        const pos = grid.tilePixelPos(unit.q, unit.r, hs);
        sx = cx + pos.x;
        sy = cy + pos.y;
      }

      const S = hs * 1.2;
      const glowR = S * 0.55;

      // ── Owalny "footprint" pod jednostką (statyczny, bez pulsu) ──
      // Spłaszczona elipsa imituje światło/cień na podłożu, a nie pierścień na hexie.
      const fc = isEnemy ? { r: 216, g: 90, b: 48 } : { r: 100, g: 160, b: 255 };
      ctx.save();
      ctx.translate(sx, sy + S * 0.28);
      ctx.scale(1, 0.35);
      const footGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
      footGrad.addColorStop(0,   `rgba(${fc.r},${fc.g},${fc.b},0.55)`);
      footGrad.addColorStop(0.6, `rgba(${fc.r},${fc.g},${fc.b},0.20)`);
      footGrad.addColorStop(1,   `rgba(${fc.r},${fc.g},${fc.b},0)`);
      ctx.fillStyle = footGrad;
      ctx.beginPath();
      ctx.arc(0, 0, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ── Sprite (flip poziomy gdy patrzy w lewo) ──
      const flip = unit._facingLeft ? -1 : 1;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(flip, 1);
        if (isEnemy) {
          // Red tint dla wrogich jednostek
          ctx.filter = 'hue-rotate(-180deg) saturate(2)';
        } else if (unit.status === 'offline') {
          // Opcja C v3: szary filter dla jednostek bez utrzymania
          ctx.filter = 'grayscale(100%) brightness(0.55)';
        } else if ((unit.supply ?? Infinity) <= 0) {
          // Słaby szary tint gdy jednostka głoduje (supply=0 ale status jeszcze nie offline)
          ctx.filter = 'grayscale(60%) brightness(0.75)';
        }
        ctx.drawImage(img, -S / 2, -S / 2, S, S);
        ctx.restore();
      } else {
        // Fallback: romb w kolorze zależnym od owner
        ctx.fillStyle = isEnemy ? '#D85A30' : '#00cc88';
        ctx.beginPath();
        ctx.moveTo(sx + S / 3, sy);
        ctx.lineTo(sx, sy + S / 3);
        ctx.lineTo(sx - S / 3, sy);
        ctx.lineTo(sx, sy - S / 3);
        ctx.closePath();
        ctx.fill();
      }

      // ── Paski HP / Supply / Org / Morale (Opcja C v3) ──
      // Rysujemy tylko dla jednostek archetypowych (mają pole supply)
      const hasSupplySys = unit.supply != null && unit.supplyCap != null;
      const bw = hs * 1.4;
      const bh = 3;
      const bx = sx - bw / 2;
      let barY = sy - hs * 0.9;

      // HP bar (zawsze gdy hp < hpMax)
      if (unit.hpMax && unit.hp < unit.hpMax) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx, barY, bw, bh);
        const hpPct = Math.max(0, Math.min(1, unit.hp / unit.hpMax));
        ctx.fillStyle = hpPct > 0.5 ? '#60E0B0' : hpPct > 0.25 ? '#D8A030' : '#D85A30';
        ctx.fillRect(bx, barY, Math.round(bw * hpPct), bh);
        barY += bh + 1;
      }

      // Supply/Org/Morale — tylko dla unitów gracza + tylko gdy stan < pełny
      if (hasSupplySys && !isEnemy) {
        const supPct = unit.supplyCap > 0 ? Math.max(0, Math.min(1, unit.supply / unit.supplyCap)) : 0;
        const orgPct = (unit.maxOrg ?? 0) > 0 ? Math.max(0, Math.min(1, unit.org / unit.maxOrg)) : 0;
        const morPct = (unit.maxMorale ?? 0) > 0 ? Math.max(0, Math.min(1, unit.morale / unit.maxMorale)) : 0;

        // Supply (żółty) — rysuj zawsze gdy supply < cap, albo gdy status attrition
        if (supPct < 1.0 || unit.supply <= 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(bx, barY, bw, 2);
          ctx.fillStyle = supPct > 0.5 ? '#E0C020' : supPct > 0 ? '#E08020' : '#D85A30';
          ctx.fillRect(bx, barY, Math.round(bw * supPct), 2);
          barY += 3;
        }
        // Org (niebieski) — gdy org < max
        if (orgPct < 1.0) {
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fillRect(bx, barY, bw, 2);
          ctx.fillStyle = '#4090E8';
          ctx.fillRect(bx, barY, Math.round(bw * orgPct), 2);
          barY += 3;
        }
        // Morale (zielony) — gdy morale < max i nie noMorale
        if (!unit.noMorale && morPct < 1.0) {
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fillRect(bx, barY, bw, 2);
          ctx.fillStyle = '#80D060';
          ctx.fillRect(bx, barY, Math.round(bw * morPct), 2);
          barY += 3;
        }
      }

      // ── Ikony statusu (🔌 offline, 🍖 głód, 💤 transport) ──
      if (!isEnemy && hasSupplySys) {
        const iconY = sy - hs * 1.2;
        let iconX = sx - hs * 0.6;
        ctx.font = `${Math.round(hs * 0.5)}px sans-serif`;
        ctx.textAlign = 'left';
        if (unit.status === 'offline')           { ctx.fillText('🔌', iconX, iconY); iconX += hs * 0.55; }
        if ((unit.supply ?? 0) <= 0)             { ctx.fillText('🍖', iconX, iconY); iconX += hs * 0.55; }
        if (unit.transportStatus === 'loaded')   { ctx.fillText('💤', iconX, iconY); iconX += hs * 0.55; }
      }

      // ── Trójkąt-znacznik nad jednostką (wierzchołkiem w dół) ──
      // Umieszczony nad ikonami statusu, żeby był zawsze widoczny jako marker identyfikacyjny.
      const triW = 10;
      const triH = 10;
      const triTopY = sy - hs * 1.5;
      const triFill = isEnemy ? '#D85A30' : '#64A0FF';
      const triStroke = isEnemy ? '#FFB098' : '#B0D0FF';
      ctx.save();
      ctx.shadowColor = `rgba(${fc.r},${fc.g},${fc.b},0.9)`;
      ctx.shadowBlur = 6;
      ctx.fillStyle = triFill;
      ctx.beginPath();
      ctx.moveTo(sx - triW / 2, triTopY);
      ctx.lineTo(sx + triW / 2, triTopY);
      ctx.lineTo(sx, triTopY + triH);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = triStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - triW / 2, triTopY);
      ctx.lineTo(sx + triW / 2, triTopY);
      ctx.lineTo(sx, triTopY + triH);
      ctx.closePath();
      ctx.stroke();

      // ── Ramka selekcji ──
      // Ring dla zaznaczonych: primary (grubszy) + pozostałe z multi-selectu (cieńszy)
      const isPrimary = this._selectedUnit?.id === unit.id;
      const isMultiSelected = this._selectedUnits.has(unit.id);
      if (isPrimary || isMultiSelected) {
        ctx.strokeStyle = isEnemy ? '#FF6040' : '#64A0FF';
        ctx.lineWidth = isPrimary ? 2 : 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, S / 2 + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Pasek postępu skanowania
      if (unit.status === 'scanning' && unit.mission) {
        const bw = hs * 1.4;
        const bh = 3;
        const bx = sx - bw / 2;
        const by = sy + hs * 0.7;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#00ffb4';
        ctx.fillRect(bx, by, bw * unit.mission.progress, bh);
      }
    }

    // ── Victoria 2 stack combat: badges i battle markers ─────────────────────
    // Grupuj po (q,r) i rysuj: licznik stacka + ⚔ gdy contested
    const stacks = new Map();  // "q,r" → { player: [], enemy: [], tile }
    for (const u of units) {
      if (u.status === 'moving') continue;
      if (u._stealthState === 'hidden' && u.owner && u.owner !== 'player') continue;
      const key = `${u.q},${u.r}`;
      if (!stacks.has(key)) {
        stacks.set(key, { player: [], enemy: [], q: u.q, r: u.r });
      }
      const slot = stacks.get(key);
      if (u.owner && u.owner !== 'player') slot.enemy.push(u);
      else slot.player.push(u);
    }

    const cs = window.KOSMOS?.combatSystem;
    const time = Date.now();

    for (const [, slot] of stacks) {
      const total = slot.player.length + slot.enemy.length;
      if (total <= 1 && !(slot.player.length > 0 && slot.enemy.length > 0)) continue;
      const pos = grid.tilePixelPos(slot.q, slot.r, hs);
      const sx = cx + pos.x;
      const sy = cy + pos.y;

      const contested = slot.player.length > 0 && slot.enemy.length > 0;

      // Battle marker ⚔ — pulsujący nad hexem
      if (contested) {
        const pulse = 0.5 + 0.5 * Math.sin(time / 300);
        ctx.save();
        ctx.globalAlpha = 0.6 + 0.3 * pulse;
        ctx.font = `bold ${hs * 0.9}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF3030';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText('⚔', sx, sy - hs * 0.5);
        ctx.fillText('⚔', sx, sy - hs * 0.5);
        ctx.textAlign = 'left';
        ctx.restore();
      }

      // Stack badges: "P×3" player / "E×2" enemy po bokach hexa
      const badgeY = sy + hs * 0.55;
      if (slot.player.length > 1 || contested) {
        const label = `${slot.player.length}`;
        this._drawStackBadge(ctx, sx - hs * 0.3, badgeY, label, '#64A0FF');
      }
      if (slot.enemy.length > 1 || contested) {
        const label = `${slot.enemy.length}`;
        this._drawStackBadge(ctx, sx + hs * 0.3, badgeY, label, '#FF6040');
      }
    }

    // Army banner (Paradox-style flag nad hexem) — rysowany dla każdej armii
    const armySys = window.KOSMOS?.armySystem;
    if (armySys) {
      const armies = armySys.getArmiesOnPlanet?.(colony.planetId) ?? [];
      for (const army of armies) {
        if (army.ownerId !== 'player') continue;
        const pos = grid.tilePixelPos(army.q, army.r, hs);
        const bx = cx + pos.x;
        const by = cy + pos.y - hs * 0.85;
        // Proporzec (flag) — mały prostokąt z napisem
        ctx.save();
        ctx.fillStyle = 'rgba(224, 192, 96, 0.92)';
        ctx.fillRect(bx - 14, by - 9, 28, 14);
        ctx.strokeStyle = '#8A6020';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx - 14, by - 9, 28, 14);
        ctx.font = `bold 9px ${THEME.fontFamily}`;
        ctx.fillStyle = '#2a1608';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎖', bx, by - 2);
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
      }
    }

    // Support target lines — cyan linia od supportera do wspieranego hexu
    for (const u of units) {
      if (!u.supportTarget) continue;
      if (u.owner && u.owner !== 'player') continue;  // tylko player widzi linie swoich
      const from = grid.tilePixelPos(u.q, u.r, hs);
      const to = grid.tilePixelPos(u.supportTarget.q, u.supportTarget.r, hs);
      ctx.save();
      ctx.strokeStyle = 'rgba(100,220,255,0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cx + from.x, cy + from.y);
      ctx.lineTo(cx + to.x, cy + to.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Floating Stack Panel (Paradox-style przy hexie ze stackiem ≥2) ──────
  _drawStackFloatingPanel(ctx, x, y, w, units, tile) {
    const ROW_H = 20;
    const H_PAD = 8;
    const armySys = window.KOSMOS?.armySystem;
    const firstUnit = units[0];
    const existingArmy = armySys?.getArmyOnHex?.(firstUnit.planetId, tile.q, tile.r);
    const h = 40 + units.length * ROW_H + 80;  // header + rows + action buttons

    // Tło
    ctx.save();
    ctx.fillStyle = 'rgba(6, 12, 22, 0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = existingArmy ? '#E0C060' : '#64A0FF';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Header
    ctx.fillStyle = existingArmy ? 'rgba(224, 192, 96, 0.18)' : 'rgba(100, 160, 255, 0.15)';
    ctx.fillRect(x, y, w, 24);
    ctx.font = `bold 11px ${THEME.fontFamily}`;
    ctx.fillStyle = existingArmy ? '#E0C060' : '#80B8FF';
    ctx.textAlign = 'left';
    const header = existingArmy
      ? `🎖 ${existingArmy.name} (${tile.q},${tile.r})`
      : `👥 STACK (${tile.q},${tile.r}) — ${units.length} jedn.`;
    ctx.fillText(header, x + H_PAD, y + 16);

    // Lista jednostek
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    let ry = y + 32;
    let sumDmg = 0, sumHp = 0, sumHpMax = 0;
    for (const u of units) {
      const arch = UNIT_ARCHETYPES[u.archetypeId];
      const hp = Math.round(u.hp ?? 0);
      const maxHp = arch?.baseStats?.hp ?? u.hpMax ?? hp;
      sumDmg += arch?.baseStats?.dmg ?? u.attack ?? 0;
      sumHp += hp;
      sumHpMax += maxHp;
      const inArmy = armySys?.getArmyForUnit?.(u.id);
      const isSelected = this._selectedUnits.has(u.id);

      // Tło wiersza
      if (isSelected) {
        ctx.fillStyle = 'rgba(100,160,255,0.12)';
        ctx.fillRect(x + 2, ry - 4, w - 4, ROW_H - 2);
      }

      // Icon + name
      ctx.textAlign = 'left';
      ctx.fillStyle = THEME.textPrimary;
      const icon = arch?.icon ?? '🪖';
      const nm = arch?.descriptionPL?.split('.')[0] ?? u.archetypeId ?? u.type;
      const label = nm.length > 16 ? nm.slice(0, 15) + '…' : nm;
      ctx.fillText(`${icon} ${label}`, x + H_PAD, ry + 10);

      // HP right-aligned
      ctx.textAlign = 'right';
      const hpFrac = maxHp > 0 ? hp / maxHp : 0;
      ctx.fillStyle = hpFrac > 0.6 ? '#80D840' : hpFrac > 0.3 ? '#D88040' : '#D84040';
      ctx.fillText(`${hp}/${maxHp}`, x + w - H_PAD, ry + 10);

      // Hit zone per row (klik → toggle selection)
      this._addHit(x, ry - 4, w, ROW_H - 2, 'stackRowClick', { unitId: u.id });

      ry += ROW_H;
    }

    // Sum stats
    const sumY = ry + 2;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 2, sumY, w - 4, 18);
    ctx.font = `10px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'center';
    ctx.fillText(`Σ DMG ${sumDmg} · HP ${sumHp}/${sumHpMax}`, x + w / 2, sumY + 12);

    // Action buttons
    const btnY = sumY + 22;
    const btnH = 22;
    const btns = [];
    if (existingArmy) {
      btns.push({ label: '➕ Podziel', color: '#80B8FF', type: 'armySplit', data: { armyId: existingArmy.id } });
      btns.push({ label: '💔 Rozwiąż', color: '#D85A30', type: 'armyDisband', data: { armyId: existingArmy.id } });
      btns.push({ label: '✏ Nazwa', color: '#80D840', type: 'armyRename', data: { armyId: existingArmy.id } });
    } else {
      btns.push({ label: '⚡ Zaznacz', color: '#80B8FF', type: 'stackSelectAll', data: { tileQ: tile.q, tileR: tile.r } });
      btns.push({ label: '🎖 Połącz w armię', color: '#E0C060', type: 'armyCreate', data: { tileQ: tile.q, tileR: tile.r } });
    }

    const btnW = (w - H_PAD * (btns.length + 1)) / btns.length;
    let bx = x + H_PAD;
    for (const b of btns) {
      const c = hexToRgb ? hexToRgb(b.color) : { r: 100, g: 160, b: 255 };
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.22)`;
      ctx.fillRect(bx, btnY, btnW, btnH);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, btnY, btnW, btnH);
      ctx.font = `bold 10px ${THEME.fontFamily}`;
      ctx.fillStyle = b.color;
      ctx.textAlign = 'center';
      ctx.fillText(b.label, bx + btnW / 2, btnY + 14);
      this._addHit(bx, btnY, btnW, btnH, b.type, b.data);
      bx += btnW + H_PAD;
    }

    ctx.restore();
  }

  // ── Bottom Drawer (Paradox HoI4-style pod mapą) ─────────────────────────
  _drawBottomDrawer(ctx, ox, oy, ow, oh) {
    const sel = this._getSelectedPlayerUnits();
    if (sel.length === 0) return 0;  // Brak draw → 0 wysokości

    const armySys = window.KOSMOS?.armySystem;
    // Czy cały select to jedna armia?
    const firstArmy = armySys?.getArmyForUnit?.(sel[0].id);
    const allSameArmy = firstArmy && sel.every(u => armySys?.getArmyForUnit?.(u.id)?.id === firstArmy.id);

    const H = 86;
    const dx = ox + 4;
    const dy = oy + oh - H - 4;
    // Zostaw miejsce (212px) na prawy panel jednostki żeby nie nakładały się
    const hasUnitPanel = !!this._selectedUnit;
    const dw = ow - 8 - (hasUnitPanel ? 212 : 0);

    // Neon accent (Choose-your-leader style) — cyan/neon green
    const ACCENT = allSameArmy ? '#E0C060' : '#00ffb4';
    const ACCENT_DIM = allSameArmy ? 'rgba(224,192,96,0.12)' : 'rgba(0,255,180,0.08)';
    const ACCENT_GLOW = allSameArmy ? 'rgba(224,192,96,0.30)' : 'rgba(0,255,180,0.22)';

    ctx.save();
    // Tło + glow
    ctx.shadowColor = ACCENT_GLOW;
    ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(6, 5, 4, 0.96)';
    ctx.fillRect(dx, dy, dw, H);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, H - 1);
    // Inner accent line (cienka)
    ctx.strokeStyle = ACCENT_DIM;
    ctx.strokeRect(dx + 3.5, dy + 3.5, dw - 7, H - 7);

    // Header — letter-spacing + orbitron-like
    ctx.font = `bold 11px ${THEME.fontFamily}`;
    ctx.fillStyle = ACCENT;
    ctx.textAlign = 'left';
    const headerText = allSameArmy
      ? `🎖 ${firstArmy.name.toUpperCase()}  ·  ${sel.length} JEDN.  ·  (${firstArmy.q},${firstArmy.r})`
      : `👥 ZAZNACZONO ${sel.length} JEDNOSTEK`;
    ctx.fillText(headerText, dx + 12, dy + 18);

    // Lista ikon jednostek (horizontalnie)
    const iconSize = 40;
    const iconY = dy + 26;
    let ix = dx + 10;
    const maxIcons = Math.floor((dw - 280) / (iconSize + 4));
    const visibleUnits = sel.slice(0, maxIcons);

    for (const u of visibleUnits) {
      const arch = UNIT_ARCHETYPES[u.archetypeId];
      const hp = u.hp ?? 0;
      const maxHp = arch?.baseStats?.hp ?? u.hpMax ?? hp;
      const hpFrac = maxHp > 0 ? hp / maxHp : 0;

      // Tło ikony — neon style
      const isSel = (this._selectedUnit?.id === u.id);
      ctx.fillStyle = isSel ? ACCENT_DIM : 'rgba(255,255,255,0.04)';
      ctx.fillRect(ix, iconY, iconSize, iconSize);
      ctx.strokeStyle = isSel ? ACCENT : 'rgba(255,255,255,0.20)';
      ctx.lineWidth = isSel ? 1.5 : 1;
      ctx.strokeRect(ix + 0.5, iconY + 0.5, iconSize - 1, iconSize - 1);

      // Emoji
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(arch?.icon ?? '🪖', ix + iconSize / 2, iconY + 25);

      // HP bar (neon)
      const barY = iconY + iconSize - 5;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(ix + 2, barY, iconSize - 4, 3);
      ctx.fillStyle = hpFrac > 0.6 ? '#00ffb4' : hpFrac > 0.3 ? '#D8A040' : '#FF4060';
      ctx.fillRect(ix + 2, barY, (iconSize - 4) * hpFrac, 3);

      this._addHit(ix, iconY, iconSize, iconSize, 'drawerUnitClick', { unitId: u.id });
      ix += iconSize + 4;
    }

    if (sel.length > maxIcons) {
      ctx.font = `11px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'left';
      ctx.fillText(`+${sel.length - maxIcons}`, ix + 4, iconY + 28);
    }

    // Action buttons po prawej — neon style
    const btnH = 24;
    const btnW = 82;
    const btns = [];
    if (allSameArmy) {
      btns.push({ label: '➕ PODZIEL', type: 'armySplitFromDrawer', data: { armyId: firstArmy.id } });
      btns.push({ label: '✏ NAZWA',    type: 'armyRename',          data: { armyId: firstArmy.id } });
      btns.push({ label: '💔 ROZWIĄŻ', type: 'armyDisband',         data: { armyId: firstArmy.id }, danger: true });
    } else if (sel.length >= 2) {
      const sameHex = sel.every(u => u.q === sel[0].q && u.r === sel[0].r && u.planetId === sel[0].planetId);
      if (sameHex) {
        btns.push({ label: '🎖 POŁĄCZ', type: 'armyCreateFromSelection', data: {} });
      }
      btns.push({ label: '📋 SZCZEGÓŁY', type: 'drawerOpenGroup', data: {} });
    } else {
      btns.push({ label: '📋 SZCZEGÓŁY', type: 'drawerOpenUnit', data: { unitId: sel[0].id } });
    }

    const btnBlockX = dx + dw - (btns.length * (btnW + 4) + 4);
    const btnBlockY = dy + 28;
    let bx = btnBlockX;
    for (const b of btns) {
      if (bx + btnW > dx + dw - 6) break;
      const btnColor = b.danger ? '#FF4060' : ACCENT;
      const c = hexToRgb(btnColor);
      // Tło przycisku (subtle fill)
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.08)`;
      ctx.fillRect(bx, btnBlockY, btnW, btnH);
      // Border 1px — neon
      ctx.strokeStyle = btnColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, btnBlockY + 0.5, btnW - 1, btnH - 1);
      // Label
      ctx.font = `bold 10px ${THEME.fontFamily}`;
      ctx.fillStyle = btnColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, bx + btnW / 2, btnBlockY + btnH / 2);
      ctx.textBaseline = 'alphabetic';
      this._addHit(bx, btnBlockY, btnW, btnH, b.type, b.data);
      bx += btnW + 4;
    }

    // Sum stats pod przyciskami (dla armii)
    if (allSameArmy) {
      ctx.font = `9px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      let sumDmg = 0, sumHp = 0, sumHpMax = 0;
      for (const u of sel) {
        const arch = UNIT_ARCHETYPES[u.archetypeId];
        sumDmg += arch?.baseStats?.dmg ?? u.attack ?? 0;
        sumHp += u.hp ?? 0;
        sumHpMax += arch?.baseStats?.hp ?? u.hpMax ?? 0;
      }
      ctx.fillText(`Σ DMG ${sumDmg} · HP ${sumHp}/${sumHpMax} · Kills ${firstArmy.kills}`, dx + dw - 10, dy + H - 6);
    }

    ctx.restore();
    return H;
  }

  _drawStackBadge(ctx, x, y, label, color) {
    const r = 8;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawHex(ctx, cx, cy, r, terrain, tile, isHov, isSel, planet, grid) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();

    // ── Tekstura terenu lub fallback na kolor ────────────────────────────────
    const _tileIdx = Math.abs(tile.q * 31 + tile.r * 17);
    const _texImg = texturesLoaded()
      ? getTerrainTexture(tile.type, planet, _tileIdx)
      : null;

    const c = terrain.color ?? 0x888888;
    const cR = (c >> 16) & 0xFF, cG = (c >> 8) & 0xFF, cB = c & 0xFF;

    if (_texImg) {
      ctx.save();
      ctx.clip();
      const _xs = pts.map(p => p.x), _ys = pts.map(p => p.y);
      const _tx = Math.min(..._xs), _ty = Math.min(..._ys);
      const _tw = Math.max(..._xs) - _tx, _th = Math.max(..._ys) - _ty;
      if (tile.type === 'crater') {
        const _sz = Math.min(_tw, _th);
        ctx.drawImage(_texImg, _tx + (_tw - _sz) / 2, _ty + (_th - _sz) / 2, _sz, _sz);
      } else {
        ctx.drawImage(_texImg, _tx, _ty, _tw, _th);
      }
      // Bez nakładki — tekstury terenu same definiują wygląd ciała
      ctx.restore();

      // Odtwórz ścieżkę hexa (clip ją usunął)
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
    } else {
      ctx.fillStyle = `rgb(${cR},${cG},${cB})`;
      ctx.fill();
    }

    // ── Przejścia między biomami przy krawędziach ─────────────────────────
    if (grid && r > 8) {
      for (let ei = 0; ei < 6; ei++) {
        const dir = HEX_DIRECTIONS[ei];
        const nb = grid.get(tile.q + dir.q, tile.r + dir.r);
        if (!nb || nb.type === tile.type) continue;

        const pA = pts[ei], pB = pts[(ei + 1) % 6];
        const emx = (pA.x + pB.x) / 2, emy = (pA.y + pB.y) / 2;

        // PNG transition
        if (texturesLoaded()) {
          const edgeHash = Math.abs(tile.q * 7 + tile.r * 13 + ei * 31);
          const trans = getTransitionTexture(tile.type, nb.type, edgeHash);
          if (trans) {
            const angle = Math.atan2(emy - cy, emx - cx);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let j = 1; j < 6; j++) ctx.lineTo(pts[j].x, pts[j].y);
            ctx.closePath();
            ctx.clip();
            ctx.translate(emx, emy);
            ctx.rotate(angle);
            if (trans.flip) ctx.scale(-1, 1);
            const tw = r * 0.6, th = r * 0.8;
            ctx.globalAlpha = 0.40;
            ctx.drawImage(trans.img, -tw * 0.5, -th / 2, tw, th);
            ctx.globalAlpha = 1;
            ctx.restore();
            continue;
          }
        }

        // Fallback gradient dla par bez PNG
        const nbTerrain = TERRAIN_TYPES[nb.type];
        if (!nbTerrain) continue;
        const nc = nbTerrain.color ?? 0x888888;
        const nR = (nc >> 16) & 0xFF, nG = (nc >> 8) & 0xFF, nB = nc & 0xFF;
        const endX = emx + (cx - emx) * 0.45;
        const endY = emy + (cy - emy) * 0.45;
        const grad = ctx.createLinearGradient(emx, emy, endX, endY);
        grad.addColorStop(0, `rgba(${nR},${nG},${nB},0.3)`);
        grad.addColorStop(1, `rgba(${nR},${nG},${nB},0)`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
    }

    // Budynek
    if (tile.buildingId || tile.capitalBase) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
      const b = tile.buildingId ? BUILDINGS[tile.buildingId] : null;
      // Tekstura PNG budynku ma priorytet; brak pliku → fallback do emoji (jak dotąd)
      const tex = tile.buildingId && hasBuildingTexture(tile.buildingId)
        ? getBuildingTexture(tile.buildingId)
        : null;
      if (tex && r > 10) {
        const size = r * 1.3;   // ~promień hexa × 1.3 — mieści się w kaflu, nieco większe od emoji
        ctx.drawImage(tex, cx - size / 2, cy - size / 2, size, size);
      } else {
        const icon = b?.icon ?? (tile.capitalBase ? '🏛' : '');
        if (icon && r > 10) {
          ctx.font = `${Math.max(8, Math.round(r * 0.65))}px serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(icon, cx, cy);
        }
      }
      if ((tile.buildingLevel ?? 1) > 1 && r > 14) {
        ctx.font = `bold ${Math.max(6, r * 0.22)}px ${THEME.fontFamily}`;
        ctx.fillStyle = '#ffd700'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(`${tile.buildingLevel}`, cx + r * 0.65, cy + r * 0.65);
      }
    }

    // Budowa w toku
    if (tile.underConstruction) {
      ctx.fillStyle = 'rgba(255,221,68,0.2)'; ctx.fill();
      if (r > 14) {
        const prog = tile.underConstruction.progress ?? 0;
        const bw = r * 1.1, bh = Math.max(2, r * 0.08);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - bw / 2, cy + r * 0.45, bw, bh);
        ctx.fillStyle = '#ffdd44'; ctx.fillRect(cx - bw / 2, cy + r * 0.45, bw * prog, bh);
      }
    }


    // Anomalia — marker na hexie
    if (tile.anomaly && tile.anomalyDetected && r > 10) {
      if (tile.anomalyRevealed) {
        // Ujawniona — pokaż ikonę anomalii
        const aDef = ANOMALIES[tile.anomaly];
        const aIcon = aDef?.icon ?? '⚠';
        ctx.font = `${Math.max(8, Math.round(r * 0.5))}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffdd44';
        const iconY = tile.buildingId ? cy + r * 0.35 : cy;
        ctx.fillText(aIcon, cx, iconY);
      } else {
        // Wykryta ale nieujawniona — pulsujący ❓
        const t = Date.now() / 1000;
        const pulse = (Math.sin(t * 3) + 1) / 2;
        ctx.font = `${Math.max(8, Math.round(r * 0.5))}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255, 220, 50, ${0.5 + pulse * 0.5})`;
        ctx.fillText('❓', cx, cy);
      }
    }

    // Fog — renderowanie wyłączone; dane `tile.explored` pozostają w gridzie do przyszłego wykorzystania
    // if (tile.explored === false) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill(); }

    // Faza 6.5: granice terytoriów (gruba linia na krawędziach między różnymi ownerami)
    if (grid && tile.owner) {
      for (let ei = 0; ei < 6; ei++) {
        const dir = HEX_DIRECTIONS[ei];
        const nb = grid.get(tile.q + dir.q, tile.r + dir.r);
        if (!nb) continue;
        if (nb.owner === tile.owner) continue;  // sama frakcja — brak granicy

        // Kolor wg ownera OBECNEGO hexa (rysujemy granicę od wewnątrz)
        let borderColor = null;
        if (tile.owner === 'player') borderColor = '#64A0FF';
        else if (tile.owner && tile.owner !== 'player') borderColor = '#D85A30';
        if (!borderColor) continue;

        const pA = pts[ei], pB = pts[(ei + 1) % 6];
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }
    }

    // Faza 6.5: pasek postępu okupacji (gdy trwa 2-miesięczne przejmowanie budynku)
    if (tile.occupyEmpireId && tile.occupyStart != null) {
      const elapsed = (window.KOSMOS?.timeSystem?.gameTime ?? 0) - tile.occupyStart;
      const progress = Math.max(0, Math.min(1, elapsed / (6 / 12)));
      if (progress > 0 && progress < 1) {
        const bw = r * 1.2, bh = Math.max(2, r * 0.1);
        const bx = cx - bw / 2, by = cy + r * 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#D85A30';
        ctx.fillRect(bx, by, bw * progress, bh);
      }
    }

    // Obramowanie
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (isSel)      { ctx.strokeStyle = THEME.accent; ctx.lineWidth = 2.5; }
    else if (isHov) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; }
    else { ctx.strokeStyle = THEME.border; ctx.lineWidth = 1; }
    ctx.stroke();
  }

  // ── Floating panel ───────────────────────────────────────────────────────
  _drawFloatingPanel(ctx, x, y, tile, colony, grid) {
    const terrain = TERRAIN_TYPES[tile.type] ?? TERRAIN_TYPES.plains;
    const b = tile.buildingId ? BUILDINGS[tile.buildingId] : null;

    // Oblicz wysokość panelu
    let h = 8; // padding top
    h += 20; // teren header
    h += 16; // koordynaty + modifier
    if (terrain.yieldBonus) h += Object.keys(terrain.yieldBonus).length * 14 + 4;

    // Anomalia (jeśli ujawniona)
    const aDef = tile.anomaly && tile.anomalyRevealed ? ANOMALIES[tile.anomaly] : null;
    if (aDef) h += 18 + 14 + 10; // ikona+nazwa, efekt, separator

    h += 10; // separator

    if (b) {
      h += 20 + 16; // nazwa + level
      // Produkcja / wydobycie (header + linie) — MUSI odzwierciedlać blok rysujący 1:1, inaczej
      // panel jest za krótki i dolne elementy (Rozbiórka/droidy) wypadają pod clip (były ucinane).
      const tileKey = `${tile.q},${tile.r}`;
      const aEntry = colony?.buildingSystem?._active?.get(tileKey);
      const rates = aEntry?.effectiveRates ?? aEntry?.baseRates ?? b.rates;
      const baseRates = b.rates ?? {};
      // Kopalnie NIE mają `rates` — urobek liczony ze złóż (getMineOutputEstimate). Bez tej gałęzi
      // wysokość gubiła wszystkie linie wydobycia (~8×14 px) i panel obcinał przyciski.
      const _isMineH = (b.isMine || b.id === 'mine');
      const _mineEstH = _isMineH ? colony?.buildingSystem?.getMineOutputEstimate?.(tileKey) : null;
      if (_mineEstH && Object.keys(_mineEstH.gains).length > 0) {
        const gainLines = Object.values(_mineEstH.gains).filter(a => a > 0).length;
        h += 13 + gainLines * 14; // nagłówek „Extraction/yr" + po linii na dodatni urobek
      } else if (!_isMineH && rates) {
        // Liczba widocznych linii: efektywne != 0 + bazowe > 0 które wypadły na 0
        const shownCount = Object.keys(rates).filter(k => k !== 'energy' && rates[k] !== 0).length;   // Slice 5D (item 2): energia poza pętlą produkcji
        const zeroedCount = Object.keys(baseRates).filter(k => baseRates[k] > 0 && !(rates[k] > 0 || rates[k] < 0)).length;
        h += 13 + (shownCount + zeroedCount) * 14;
      }
      // Maintenance
      if (b.maintenance && Object.keys(b.maintenance).length > 0) h += 13 + Object.keys(b.maintenance).length * 14;
      if (b.energyCost) h += 14;
      if (b.jobs) h += 14;
      if (b.housing) h += 14;
      // Droid-per-job (UI 3): linia energii droidów + sekcja instalacji MUSZĄ wejść w wysokość, inaczej
      // przyciski Install/Remove wypadają pod panel i są przycinane (clip). Zgodne z blokiem rysującym.
      if (colony?.buildingSystem && (b.jobs ?? 0) > 0 && !b.isAutonomous) {
        const dCount = colony.buildingSystem._tileDroidCount?.(aEntry, tileKey) ?? 0;
        const prevH = colony.buildingSystem.previewSyntheticInstall?.(tileKey) ?? { ok: false, reason: 'no_building', count: dCount };
        if (dCount > 0) h += 14;   // „🤖 droidy: −X energy"
        h += 20;                   // nagłówek „n🤖 / J" (Slice 5D FIX C: 14→20, baseline top + odstęp od tri-state)
        if ((prevH.count ?? dCount) < (prevH.jobs ?? 0)) h += 24;   // Slice 5D (item 11): przycisk „Autonomizuj" (był pominięty → clip)
        if (prevH.ok) h += 24;
        else if (prevH.reason && prevH.reason !== 'no_building' && prevH.reason !== 'autonomous_building') h += 24 + 12;
        if ((prevH.count ?? dCount) > 0) h += 24 + 12;
      }
      h += 8 + 28 + 6; // separator + buttons (Rozbiórka)
      if (b.maxLevel && (tile.buildingLevel ?? 1) < b.maxLevel) h += 28;   // Ulepsz
      // Slice 5D (item 11): tri-state desygnacja {Aktywny|Pauza|Priorytet} — rysowana po Rozbiórce, MUSI
      // wejść w wysokość, inaczej droid-sekcja/status wypadają pod clip (ta sama klasa co synthetic-arc fix).
      if (GAME_CONFIG.FEATURES?.popAllocation2Priority === true && aEntry) h += 26;
    } else if (tile.underConstruction) {
      h += 36;
    } else if (tile.pendingBuild) {
      h += 52; // pending: nazwa + info + anuluj
    } else if (!tile.buildingId && !tile.underConstruction) {
      if (tile.capitalBase) h += 18; // label "Stolica"
      const available = this._getAvailableBuildings(tile);
      h += 20 + Math.max(1, available.length) * 24 + 8;
    }
    h += 8; // padding bottom

    // Cap wysokości zależny od trybu panelu:
    //  • ISTNIEJĄCY BUDYNEK (b): fit-to-map — panel rośnie, by zmieścić wszystko (Ulepsz/Rozbiórka/
    //    droidy). Panel jest dosuwany w górę, więc pełna wysokość mapy się mieści; gdy treść przewyższy
    //    nawet obszar mapy → scroll sekcji budynku (niżej).
    //  • LISTA BUDOWY (pusty hex): jak dawniej — 65% viewportu, scrollowalna. NIE fit-to-map, bo pełna
    //    lista budynków zabrałaby cały ekran.
    const canvas = document.getElementById('ui-canvas');
    const viewportH = canvas ? (canvas.getBoundingClientRect().height / _UI_SCALE) : 700;
    const mapAvailH = (this._floatMapBot ?? 0) - (this._floatMapTop ?? 0);
    const maxPanelH = b
      ? (mapAvailH > 60 ? mapAvailH : viewportH * 0.85)
      : viewportH * 0.65;
    const contentH = h;
    h = Math.min(h, maxPanelH);

    // Zapisz rzeczywistą wysokość panelu i zawartości
    this._floatH = h;
    this._floatContentH = contentH;

    // Ogranicz scroll (tylko jeśli panel jest obcięty)
    const maxScroll = Math.max(0, contentH - h);
    this._floatScroll = Math.max(0, Math.min(this._floatScroll ?? 0, maxScroll));

    // Tło panelu
    ctx.fillStyle = 'rgba(4, 8, 16, 0.94)';
    ctx.fillRect(x, y, FLOAT_W, h);
    ctx.strokeStyle = THEME.accent ?? '#1a6e50';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, FLOAT_W, h);

    // Clipping — nic nie rysuj poza panelem
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, FLOAT_W, h);
    ctx.clip();

    // Zamknij floating [x]
    ctx.font = `bold 11px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('✕', x + FLOAT_W - 6, y + 4);
    this._addHit(x + FLOAT_W - 18, y + 2, 16, 16, 'deselectHex');

    let cy = y + 8;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    // ── Sekcja: Teren ──
    ctx.font = `bold 12px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`${terrain.icon ?? ''} ${terrain.namePL ?? tile.type}`, x + 8, cy);
    cy += 18;

    // Koordynaty + modyfikator polarny
    ctx.font = `10px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const latMod = HexGrid.getLatitudeModifier(tile.r, grid.height);
    ctx.fillText(`(${tile.q},${tile.r})${latMod.label ? '  ' + latMod.label : ''}`, x + 8, cy);
    cy += 16;


    // Yield bonus
    if (terrain.yieldBonus) {
      ctx.fillStyle = THEME.textPrimary;
      for (const [res, mult] of Object.entries(terrain.yieldBonus)) {
        const label = res === 'default' ? 'ogólny' : res;
        const color = mult >= 1 ? '#88cc88' : '#cc8888';
        ctx.fillStyle = color;
        ctx.fillText(`${label}: ×${mult}`, x + 8, cy); cy += 14;
      }
    }

    // ── Sekcja: Anomalia (jeśli ujawniona) ──
    if (aDef) {
      ctx.font = `bold 11px ${THEME.fontFamily}`;
      ctx.fillStyle = '#ffdd44';
      ctx.fillText(`${aDef.icon ?? '❓'} ${aDef.namePL ?? aDef.id}`, x + 8, cy);
      cy += 16;
      ctx.font = `10px ${THEME.fontFamily}`;
      ctx.fillStyle = '#ccbb88';
      ctx.fillText(aDef.effectDescPL ?? '', x + 8, cy);
      cy += 14;
    }

    // Separator
    cy += 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.moveTo(x + 6, cy); ctx.lineTo(x + FLOAT_W - 6, cy); ctx.stroke();
    cy += 6;

    // ── Sekcja: Budynek / Budowa / Build list ──
    if (b) {
      // Sekcja budynku scrolluje się jako całość (clip poniżej stałego nagłówka terenu).
      // Dzięki temu przyciski (Ulepsz/Rozbiórka/droidy) są ZAWSZE osiągalne kółkiem myszy,
      // nawet gdy wysoka kopalnia nie mieści się w panelu. Hit-zony przycisków dodawane
      // tylko gdy widoczne w [_bTop, _bBot] (poza panelem klik nie może ich wyzwolić).
      const _bTop = cy;
      const _bBot = y + h;
      const _bVis = (hy, hh) => hy >= _bTop - 0.5 && hy + hh <= _bBot + 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, _bTop, FLOAT_W, Math.max(0, _bBot - _bTop));
      ctx.clip();
      cy -= (this._floatScroll ?? 0);

      // Budynek
      ctx.font = `bold 12px ${THEME.fontFamily}`;
      ctx.fillStyle = CAT_COLORS[b.category] ?? THEME.accent;
      ctx.fillText(`${b.icon ?? ''} ${b.namePL ?? b.id}`, x + 8, cy); cy += 16;

      ctx.font = `11px ${THEME.fontFamily}`;
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`Poziom ${tile.buildingLevel ?? 1}${b.maxLevel ? '/' + b.maxLevel : ''}`, x + 8, cy); cy += 16;

      // Efektywna produkcja z BuildingSystem._active
      const tileKey = `${tile.q},${tile.r}`;
      const activeEntry = colony.buildingSystem?._active?.get(tileKey);
      const rates = activeEntry?.effectiveRates ?? activeEntry?.baseRates ?? b.rates;

      // Population 2.0 (Report 2): kopalnie nie mają `rates` — wydobycie liczone ze złóż.
      // Pokaż realny urobek z mnożnikiem obsady zamiast mylącego pustego „Produkcja (×0)".
      const _isMineB = (b.isMine || b.id === 'mine');
      const _mineEst = _isMineB ? colony.buildingSystem?.getMineOutputEstimate?.(tileKey) : null;
      if (_mineEst && Object.keys(_mineEst.gains).length > 0) {
        ctx.font = `10px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        const _mult = _mineEst.staff < 0.995 ? ` (×${+_mineEst.staff.toFixed(2)})` : '';
        ctx.fillText(t('colonyPanel.mineExtraction', _mult), x + 8, cy); cy += 13;
        ctx.font = `11px ${THEME.fontFamily}`;
        for (const [res, amt] of Object.entries(_mineEst.gains)) {
          // 0.0 = uczciwy stan nieobsadzonej kopalni (twarda bramka) — muted red zamiast ukrywania
          ctx.fillStyle = amt > 0.05 ? '#88ff88' : '#ff8888';
          ctx.fillText(`+${amt.toFixed(1)} ${res}`, x + 12, cy); cy += 14;
        }
      } else if (!_isMineB && rates) {
        ctx.font = `10px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        // UI 1: mnożnik obsady (D2 efficiency) w nagłówku — gracz widzi CZEMU produkcja się zmieniła.
        const _eff = colony.buildingSystem?._getBuildingLaborEfficiency?.(b, tileKey) ?? 1.0;
        const _effLbl = Math.abs(_eff - 1.0) > 0.005 ? ` (×${+_eff.toFixed(2)})` : '';
        ctx.fillText(`Produkcja/rok${_effLbl}:`, x + 8, cy); cy += 13;
        ctx.font = `11px ${THEME.fontFamily}`;

        // Pokaż bazowe stawki (z rates budynku) — aby widać co POWINNO być produkowane
        const baseRates = b.rates ?? {};
        const shownKeys = new Set();
        for (const [res, rate] of Object.entries(rates)) {
          if (rate === 0 || res === 'energy') continue;   // Slice 5D (item 2): energię pokazuje dedykowana linia ⚡ + linia droidów (koniec potrójnego wyświetlania)
          shownKeys.add(res);
          ctx.fillStyle = rate > 0 ? '#88ff88' : '#ff8888';
          const sign = rate > 0 ? '+' : '';
          ctx.fillText(`${sign}${rate.toFixed?.(1) ?? rate} ${res}`, x + 12, cy); cy += 14;
        }

        // Pokaż zerowe stawki dla zasobów z definicji budynku (np. research = 0 z powodu braku naukowców)
        for (const [res, baseVal] of Object.entries(baseRates)) {
          if (baseVal <= 0 || shownKeys.has(res)) continue;
          // Bazowa stawka > 0 ale efektywna = 0 → wyjaśnij powód
          const empEff = activeEntry ? colony.buildingSystem?._getBuildingLaborEfficiency?.(b, tileKey) : 1.0;
          ctx.fillStyle = '#ff6644';
          if (empEff !== undefined && empEff <= 0) {
            const popType = b.popType ?? 'laborer';
            const label = popType === 'scientist' ? '(brak naukowców)'
                        : popType === 'engineer'  ? '(brak inżynierów)'
                        : `(brak ${popType})`;
            ctx.fillText(`0 ${res} ${label}`, x + 12, cy); cy += 14;
          } else {
            ctx.fillText(`0 ${res}`, x + 12, cy); cy += 14;
          }
        }
      }

      // Maintenance (konsumpcja)
      if (b.maintenance && Object.keys(b.maintenance).length > 0) {
        ctx.font = `10px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('Utrzymanie/rok:', x + 8, cy); cy += 13;
        ctx.font = `11px ${THEME.fontFamily}`;
        for (const [res, cost] of Object.entries(b.maintenance)) {
          ctx.fillStyle = '#ff8888';
          ctx.fillText(`-${cost} ${res}`, x + 12, cy); cy += 14;
        }
      }

      // Energia — Slice 5D (item 2, opcja A): EFEKTYWNA energia płyty (staff-scaled), NIE statyczna
      // b.energyCost. Upkeep droidów = osobna linia niżej; obie sumują się do effectiveRates.energy
      // (koherentne zaokrąglenie: plant = round(total)+round(droidDraw), droidLine = −round(droidDraw)).
      if (b.energyCost) {
        const _eE = rates?.energy ?? -b.energyCost;
        const _eTier = grid.get(tile.q, tile.r)?.syntheticSlot?.tier ?? 1;
        const _eD = colony.buildingSystem?._tileDroidCount?.(activeEntry, tileKey) ?? 0;
        const _eDraw = (colony.buildingSystem?.constructor?.SYNTH_ENERGY_UPKEEP?.[_eTier] ?? 2) * _eD;
        const _ePlant = Math.round(_eE) + Math.round(_eDraw);
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(`⚡ ${_ePlant >= 0 ? '+' : ''}${_ePlant} energy/rok`, x + 8, cy); cy += 14;
      }

      // Obsada (droid-per-job): {ludzkie etaty} POP + {droidy}🤖 / {J=jobs×level} + jawny upkeep droidów.
      if (b.jobs) {
        const _J = (b.jobs ?? 0) * (activeEntry?.level ?? 1);
        const _D = colony.buildingSystem?._tileDroidCount?.(activeEntry, tileKey) ?? 0;
        ctx.fillStyle = THEME.textPrimary;
        if (_D > 0) {
          ctx.fillText(t('colonyPanel.staffing', _J - _D, _D, _J), x + 8, cy); cy += 14;
          const _tier = grid.get(tile.q, tile.r)?.syntheticSlot?.tier ?? 1;
          const _per = colony.buildingSystem?.constructor?.SYNTH_ENERGY_UPKEEP?.[_tier] ?? 2;
          ctx.fillStyle = '#ffdd44';
          ctx.fillText(t('colonyPanel.droidUpkeep', _per, _D, _per * _D), x + 8, cy); cy += 14;
        } else {
          ctx.fillText(`👤 ${_J} POP`, x + 8, cy); cy += 14;
        }
      }

      // Housing
      if (b.housing) {
        ctx.fillStyle = '#4488ff';
        ctx.fillText(`🏠 +${b.housing} housing`, x + 8, cy); cy += 14;
      }

      cy += 4;
      // Przyciski
      if (b.maxLevel && (tile.buildingLevel ?? 1) < b.maxLevel) {
        this._drawBtn(ctx, '⬆ Ulepsz', x + 8, cy, FLOAT_W - 16, 24, '#1a6e50');
        if (_bVis(cy, 24)) this._addHit(x + 8, cy, FLOAT_W - 16, 24, 'upgrade');
        cy += 28;
      }
      this._drawBtn(ctx, '🗑 Rozbiórka', x + 8, cy, FLOAT_W - 16, 24, '#6e1a1a');
      if (_bVis(cy, 24)) this._addHit(x + 8, cy, FLOAT_W - 16, 24, 'demolish');
      cy += 28;

      // ── Slice 5C.2: tri-state desygnacja {Aktywny | Pauza | Priorytet} (segmentowy przełącznik) ──
      const _dsEntry = colony.buildingSystem?._active?.get(`${tile.q},${tile.r}`);
      if (GAME_CONFIG.FEATURES?.popAllocation2Priority === true && _dsEntry) {
        const dsKey = `${tile.q},${tile.r}`;
        const cur = _dsEntry.designation ?? 'active';
        const segs = [
          { id: 'active',   label: t('designation.active'),   col: '#2f6b3a' },
          { id: 'paused',   label: t('designation.paused'),   col: '#7a6a1a' },
          { id: 'priority', label: t('designation.priority'), col: '#7a3a1a' },
        ];
        const segW = Math.floor((FLOAT_W - 16 - 8) / 3);
        ctx.font = `10px ${THEME.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < 3; i++) {
          const sx = x + 8 + i * (segW + 4);
          const on = segs[i].id === cur;
          ctx.fillStyle = on ? segs[i].col : 'rgba(255,255,255,0.05)';
          ctx.fillRect(sx, cy, segW, 22);
          ctx.strokeStyle = on ? THEME.accent : THEME.borderLight; ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, cy + 0.5, segW - 1, 21);
          ctx.fillStyle = on ? '#fff' : THEME.textSecondary;
          ctx.fillText(segs[i].label, sx + segW / 2, cy + 11);
          if (_bVis(cy, 22)) this._addHit(sx, cy, segW, 22, 'setDesignation', { tileKey: dsKey, designation: segs[i].id, tooltip: t('designation.tooltip') });
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        cy += 26;
      }

      // Droid-per-job: „n🤖 / J" + Install (dopóki count<J) I Remove (gdy count>0) współistnieją.
      const bsSyn = colony?.buildingSystem;
      if (bsSyn && (b.jobs ?? 0) > 0 && !b.isAutonomous) {
        const tileKey = `${tile.q},${tile.r}`;
        const prev = bsSyn.previewSyntheticInstall?.(tileKey) ?? { ok: false, reason: 'no_building', count: 0, jobs: 0 };
        const dCount = prev.count ?? 0, dJobs = prev.jobs ?? 0;
        // Nagłówek stanu automatyzacji „n🤖 / J". Slice 5D FIX C: baseline 'top' + odstęp, by
        // emoji 🤖 (wyższe niż font) NIE wjeżdżało w rząd tri-state nad nim (nakładka na „Pauza",
        // wyśrodkowany badge = środkowy segment). Linia 20 px mieści top-aligned emoji + luz.
        ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = dCount > 0 ? THEME.accent : THEME.textDim;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(t('synthetic.count', dCount, dJobs), x + FLOAT_W / 2, cy + 3);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; cy += 20;
        // Slice 5B — „Autonomizuj": wypełnij WSZYSTKIE wolne sloty droidami jednym ruchem (bulk).
        // Widoczny gdy są wolne sloty (dCount < J). Typ droida dobiera BuildingSystem wg straty (tier split).
        if (dCount < dJobs) {
          this._drawBtn(ctx, `🤖 ${t('synthetic.autonomize')}`, x + 8, cy, FLOAT_W - 16, 22, '#1a6e50');
          if (_bVis(cy, 22)) this._addHit(x + 8, cy, FLOAT_W - 16, 22, 'autonomizeBuilding', { tileKey });
          cy += 24;
        }
        // Install — aktywny gdy jest miejsce i droid pasuje; inaczej wyszarzony + powód (poza no_building/autonomous).
        if (prev.ok) {
          this._drawBtn(ctx, `🤖 ${t('synthetic.install')}`, x + 8, cy, FLOAT_W - 16, 22, '#1a5a6e');
          if (_bVis(cy, 22)) this._addHit(x + 8, cy, FLOAT_W - 16, 22, 'installSynthetic', { tileKey, commodityId: prev.commodityId });
          cy += 24;
        } else if (prev.reason && prev.reason !== 'no_building' && prev.reason !== 'autonomous_building') {
          this._drawBtn(ctx, `🤖 ${t('synthetic.install')}`, x + 8, cy, FLOAT_W - 16, 22, '#333');
          cy += 24;
          ctx.font = `9px ${THEME.fontFamily}`; ctx.fillStyle = THEME.warning; ctx.textAlign = 'center';
          ctx.fillText(t('synthetic.reason.' + prev.reason), x + FLOAT_W / 2, cy); ctx.textAlign = 'left'; cy += 12;
        }
        // Remove — gdy jest choć jeden droid (zdejmuje JEDNEGO). Slice 5C.1: pod flagą ZWRACA do
        // magazynu (ikona 🔄 + komunikat „zwraca"); flag OFF = NISZCZY (🗑, Faza 4).
        if (dCount > 0) {
          const retRule = GAME_CONFIG.FEATURES?.popAllocation2 === true;
          this._drawBtn(ctx, `${retRule ? '🔄' : '🗑'} ${t('colonyPanel.removeSynthetic')}`, x + 8, cy, FLOAT_W - 16, 22, '#6e4a1a');
          if (_bVis(cy, 22)) this._addHit(x + 8, cy, FLOAT_W - 16, 22, 'removeSynthetic', { tileKey });
          cy += 24;
          ctx.font = `9px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'center';
          ctx.fillText(t(retRule ? 'synthetic.removeReturnHint' : 'synthetic.removeWarn'), x + FLOAT_W / 2, cy); ctx.textAlign = 'left'; cy += 12;
        }
      }
      ctx.restore(); // koniec clip+scroll sekcji budynku

    } else if (tile.underConstruction) {
      const ub = BUILDINGS[tile.underConstruction.buildingId];
      ctx.font = `bold 12px ${THEME.fontFamily}`;
      ctx.fillStyle = '#ffdd44';
      ctx.fillText(`🔨 ${(ub?.namePL ?? ub?.id) ?? '...'}`, x + 8, cy); cy += 16;
      const pct = Math.round((tile.underConstruction.progress ?? 0) * 100);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x + 8, cy, FLOAT_W - 16, 8);
      ctx.fillStyle = '#ffdd44';
      ctx.fillRect(x + 8, cy, (FLOAT_W - 16) * pct / 100, 8);
      cy += 12;
      ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${pct}%`, x + 8, cy);

    } else if (tile.pendingBuild) {
      // Budynek oczekujący na surowce
      const pb = BUILDINGS[tile.pendingBuild];
      ctx.font = `bold 12px ${THEME.fontFamily}`;
      ctx.fillStyle = '#ffb400';
      ctx.fillText(`⏳ ${pb?.namePL ?? tile.pendingBuild}`, x + 8, cy); cy += 16;
      ctx.font = `10px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Oczekuje na surowce...', x + 8, cy); cy += 14;
      // Anuluj
      this._drawBtn(ctx, '✕ Anuluj', x + 8, cy, FLOAT_W - 16, 22, '#6e4e1a');
      this._addHit(x + 8, cy, FLOAT_W - 16, 22, 'cancelPending');

    } else if (!tile.buildingId && !tile.underConstruction) {
      // Stolica — wirtualny budynek, hex wolny do budowy
      if (tile.capitalBase) {
        ctx.font = `bold 12px ${THEME.fontFamily}`;
        ctx.fillStyle = '#ffd700';
        ctx.fillText('🏛 Stolica (hex wolny)', x + 8, cy); cy += 18;
      }
      // ── Lista budynków do budowy ──
      ctx.font = `bold 11px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.fillText('🔨 Buduj:', x + 8, cy); cy += 16;

      const available = this._getAvailableBuildings(tile);
      if (available.length === 0) {
        ctx.font = `10px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('Brak dostępnych budynków', x + 8, cy);
      }

      // Clip na obszar listy (od "Buduj:" w dół do dołu panelu)
      const listTop = cy;
      const listBot = y + this._floatH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, listTop, FLOAT_W, listBot - listTop);
      ctx.clip();

      // Scroll offset — tylko lista budynków
      cy -= (this._floatScroll ?? 0);

      for (const entry of available) {
        const bid = entry.id;
        const bd = BUILDINGS[bid];
        if (!bd) continue;
        const rowH = 22;

        // Pomiń jeśli daleko poza widokiem
        if (cy + rowH < listTop - 50 || cy > listBot + 50) { cy += rowH + 2; continue; }

        const canAfford = this._canAfford(colony, bd);
        const locked = entry.locked;            // Stage 1: klimat — widoczny, ale zablokowany
        const greyed = locked || !canAfford;    // wyszarzenie jak przy braku surowców
        const isHov = this._hoveredBuildId === bid;

        ctx.fillStyle = isHov ? 'rgba(0,255,180,0.12)' : 'rgba(6,12,20,0.5)';
        ctx.fillRect(x + 6, cy, FLOAT_W - 12, rowH);
        ctx.strokeStyle = greyed ? '#442222' : (CAT_COLORS[bd.category] ?? '#446');
        ctx.lineWidth = isHov ? 1.5 : 0.5;
        ctx.strokeRect(x + 6, cy, FLOAT_W - 12, rowH);

        ctx.font = `11px ${THEME.fontFamily}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = greyed ? '#666' : '#ddd';
        const lockIcon = locked ? '🔒 ' : '';
        ctx.fillText(`${lockIcon}${bd.icon ?? '?'} ${bd.namePL ?? bd.id}`, x + 10, cy + rowH / 2);

        // Hit zone tylko dla widocznych elementów wewnątrz listy.
        // Zablokowany klimatem zostaje klikalny: klik → _build odrzuci z powodem → flash (serwer = jedyna bramka).
        if (cy >= listTop && cy + rowH <= listBot) {
          this._addHit(x + 6, cy, FLOAT_W - 12, rowH, 'build', { buildingId: bid });
        }
        cy += rowH + 2;
      }
      ctx.restore(); // koniec clip listy
    }

    // Koniec clipping
    ctx.restore();

    // Scrollbar indicator (jeśli zawartość większa niż panel)
    if (this._floatContentH > this._floatH) {
      const scrollPct = (this._floatScroll ?? 0) / Math.max(1, this._floatContentH - this._floatH);
      const barH = Math.max(20, this._floatH * (this._floatH / this._floatContentH));
      const barY = y + scrollPct * (this._floatH - barH);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x + FLOAT_W - 4, barY, 3, barH);
    }

    // Hit zone na CAŁY panel — blokuje klik-through na mapę (OSTATNI = najniższy priorytet)
    this._addHit(x, y, FLOAT_W, this._floatH, 'floatPanel');
  }

  _drawBtn(ctx, label, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.font = `bold 11px ${THEME.fontFamily}`;
    ctx.fillStyle = '#ddd'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // ── Dialog budowy stacji orbitalnej (S3.3b-S4) ─────────────────────────────
  // Modal nad mapą: wybór ciała docelowego (planeta + księżyce), koszt, kolejka.
  _drawStationDialog(ctx, ox, oy, ow, oh, colony) {
    const def    = STATIONS.orbital_station;
    const colMgr = window.KOSMOS?.colonyManager;

    // Cele: planeta macierzysta + jej księżyce
    const targets = [];
    if (colony.planet) targets.push(colony.planet);
    EntityManager.getByType('moon')
      .filter(m => m.parentPlanetId === colony.planetId)
      .forEach(m => targets.push(m));
    // Domyślny/awaryjny cel = planeta macierzysta
    if (!this._stationTargetId || !targets.some(b => b.id === this._stationTargetId)) {
      this._stationTargetId = colony.planetId;
    }

    const costEntries = [...Object.entries(def.cost ?? {}), ...Object.entries(def.commodityCost ?? {})];
    const pending     = colMgr?.getPendingStationOrders?.(colony.planetId) ?? [];

    const DW = 340;
    const DH = 138 + targets.length * 20 + costEntries.length * 14 + Math.max(1, pending.length) * 18;
    const dx = ox + ow / 2 - DW / 2;
    const dy = oy + Math.max(HDR_H + 8, oh / 2 - DH / 2);

    ctx.save();
    ctx.fillStyle = 'rgba(6,12,20,0.97)';
    ctx.fillRect(dx, dy, DW, DH);
    ctx.strokeStyle = THEME.borderActive ?? '#3a6'; ctx.lineWidth = 1.5;
    ctx.strokeRect(dx, dy, DW, DH);

    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    let cy = dy + 8;

    // Tytuł + [✕]
    ctx.font = `bold 13px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText('🛰 ' + t('station.dialogTitle'), dx + 10, cy);
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'right';
    ctx.fillText('✕', dx + DW - 10, cy);
    this._addHit(dx + DW - 24, cy - 4, 22, 22, 'station_dialog_close');
    ctx.textAlign = 'left';
    cy += 24;

    // Cel — jedno ciało (tylko planeta) → statyczna linia bez pickera; >1 → wybór
    ctx.font = `11px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textPrimary;
    if (targets.length === 1) {
      ctx.fillText(`${t('station.target')}: ${targets[0]?.name ?? targets[0]?.id}`, dx + 10, cy);
      cy += 20;
    } else {
      ctx.fillText(t('station.target') + ':', dx + 10, cy); cy += 16;
      for (const body of targets) {
        const sel = body.id === this._stationTargetId;
        ctx.fillStyle = sel ? 'rgba(0,255,180,0.12)' : 'rgba(255,255,255,0.03)';
        ctx.fillRect(dx + 12, cy, DW - 24, 18);
        ctx.strokeStyle = sel ? (THEME.borderActive ?? '#3a6') : 'rgba(255,255,255,0.08)';
        ctx.strokeRect(dx + 12, cy, DW - 24, 18);
        ctx.fillStyle = sel ? THEME.accent : THEME.textPrimary;
        ctx.fillText(`${sel ? '●' : '○'} ${body.type === 'moon' ? '🌑' : '🪐'} ${body.name ?? body.id}`, dx + 18, cy + 3);
        this._addHit(dx + 12, cy, DW - 24, 18, 'station_pick_target', { bodyId: body.id });
        cy += 20;
      }
    }

    // Koszt
    cy += 4;
    ctx.fillStyle = THEME.textPrimary; ctx.font = `11px ${THEME.fontFamily}`;
    ctx.fillText(t('station.cost') + ':', dx + 10, cy); cy += 18;
    ctx.font = `10px ${THEME.fontFamily}`;
    const res = colony.resourceSystem;
    for (const [key, amount] of costEntries) {
      const have = res?.getAmount?.(key) ?? res?.inventory?.get(key) ?? 0;
      const icon = RESOURCE_ICONS[key] ?? COMMODITIES[key]?.icon ?? '📦';
      const nm   = COMMODITIES[key]?.namePL ?? key;
      ctx.fillStyle = have >= amount ? '#8cdf9c' : '#cc7777';
      ctx.fillText(`${icon} ${nm}: ${Math.floor(have)}/${amount}`, dx + 16, cy);
      cy += 14;
    }

    // Przycisk budowy
    cy += 6;
    const canAfford = this._canAfford(colony, def);
    this._drawBtn(ctx, t('station.build'), dx + 12, cy, DW - 24, 26,
      canAfford ? 'rgba(20,80,50,0.9)' : 'rgba(60,50,20,0.85)');
    this._addHit(dx + 12, cy, DW - 24, 26, 'station_build');
    cy += 30;
    ctx.font = `9px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'center';
    ctx.fillText(canAfford ? t('station.buildAfford') : t('station.buildWait'), dx + DW / 2, cy);
    ctx.textAlign = 'left'; cy += 16;

    // W kolejce
    ctx.font = `11px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(t('station.pending') + ':', dx + 10, cy); cy += 16;
    ctx.font = `10px ${THEME.fontFamily}`;
    if (pending.length === 0) {
      ctx.fillStyle = THEME.textDim; ctx.fillText('—', dx + 16, cy);
    } else {
      for (const order of pending) {
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(`• ${order.targetName ?? order.targetBodyId}`, dx + 16, cy);
        ctx.fillStyle = '#cc7777'; ctx.textAlign = 'right';
        ctx.fillText('✕', dx + DW - 14, cy); ctx.textAlign = 'left';
        this._addHit(dx + DW - 26, cy - 3, 20, 16, 'station_cancel_order', { orderId: order.id });
        cy += 18;
      }
    }
    // Tło dialogu na KOŃCU — _hitTest (Array.find) zwraca pierwszy match, więc przyciski
    // (dodane wyżej) mają priorytet; tło tylko konsumuje kliki w pustą część panelu.
    this._addHit(dx, dy, DW, DH, 'stationDialogBg');
    ctx.restore();
  }

  // Zwraca listę pozycji budowy: [{ id, locked, reason }]. Budynki zablokowane KLIMATEM są
  // pokazywane (locked:true, z powodem), teren/tech/frakcja/prereq nadal pomijane (jak dotąd).
  _getAvailableBuildings(tile) {
    this._buildLockReasons = new Map();  // bid → klucz i18n powodu (dla tooltipa)
    if (!tile) return [];
    const techSys = window.KOSMOS?.techSystem;
    const facSys  = window.KOSMOS?.factionSystem;
    const colMgr  = window.KOSMOS?.colonyManager;
    const terrain = TERRAIN_TYPES[tile.type];
    if (!terrain) { console.warn('[ColonyOverlay] Brak TERRAIN_TYPES dla:', tile.type); return []; }
    if (!terrain.buildable) return [];

    // Faza D2b: aktywne budynki na bieżącej kolonii — do sprawdzenia requiresBuilding
    const activeCol = colMgr?.getColony(colMgr?.activePlanetId);
    const activeBuildingsMap = activeCol?.buildingSystem?._active;
    const planet = activeCol?.planet ?? null;   // Stage 1: bramka klimatyczna — planeta TEJ kolonii

    const result = [];
    for (const b of Object.values(BUILDINGS)) {
      if (!b.id || b.isCapital) continue;
      if (b.requires && techSys && !techSys.isResearched(b.requires)) continue;
      // Faza D2b: budynek-prereq (np. heritage_dome wymaga mission_archive)
      if (b.requiresBuilding && activeBuildingsMap) {
        let found = false;
        for (const entry of activeBuildingsMap.values()) {
          if (entry.building?.id === b.requiresBuilding) { found = true; break; }
        }
        if (!found) continue;
      }
      // Faza C5: gating frakcyjny — ukryj budynki kulturowe gdy frakcje zablokowane
      if (b.requiresFactionUnlocked || b.factionGating) {
        if (!facSys || facSys.isLocked) continue;
        if (b.factionGating) {
          const slider = facSys.slider ?? 50;
          const { slider: op, value } = b.factionGating;
          if (op === '>'  && !(slider >  value)) continue;
          if (op === '<'  && !(slider <  value)) continue;
          if (op === '>=' && !(slider >= value)) continue;
          if (op === '<=' && !(slider <= value)) continue;
        }
      }
      // Bramka teren+klimat (jedno źródło prawdy — evaluatePlacement)
      const verdict = evaluatePlacement(tile, b, { techSystem: techSys, planet });
      if (verdict.ok) {
        result.push({ id: b.id, locked: false, reason: null });
      } else if (verdict.kind === 'climate') {
        // Klimat: pokaż zablokowany z powodem (nie znikaj z pickera)
        result.push({ id: b.id, locked: true, reason: verdict.reason });
        this._buildLockReasons.set(b.id, verdict.reason);
      }
      // teren niedozwolony → pomiń (bez zmian względem dotychczasowego zachowania)
    }
    return result;
  }

  _canAfford(colony, building) {
    if (!colony?.resourceSystem) return false;
    const res = colony.resourceSystem;
    // Stage 2: koszt surowców z dopłatą środowiskową (spójne z _build i podglądem)
    for (const [key, amount] of Object.entries(computeBuildResourceCost(building, colony.planet))) {
      if ((res.getAmount?.(key) ?? res.inventory?.get(key) ?? 0) < amount) return false;
    }
    for (const [key, amount] of Object.entries(computeBuildCommodityCost(building, colony.planet))) {
      if ((res.inventory?.get(key) ?? 0) < amount) return false;
    }
    return true;
  }

  // Zwraca listę brakujących zasobów/commodities do budowy
  _getMissing(colony, building) {
    const res = colony?.resourceSystem;
    if (!res) return [];
    const missing = [];
    // Stage 2: koszt surowców z dopłatą środowiskową (spójne z _build i podglądem)
    for (const [key, amount] of Object.entries(computeBuildResourceCost(building, colony?.planet))) {
      const have = res.getAmount?.(key) ?? res.inventory?.get(key) ?? 0;
      if (have < amount) {
        const icon = RESOURCE_ICONS[key] ?? '';
        missing.push(`${amount - have}${icon}${key}`);
      }
    }
    for (const [key, amount] of Object.entries(computeBuildCommodityCost(building, colony?.planet))) {
      const have = res.inventory?.get(key) ?? 0;
      if (have < amount) {
        const icon = COMMODITIES[key]?.icon ?? '📦';
        const name = COMMODITIES[key]?.namePL ?? key;
        missing.push(`${amount - have}×${icon}${name}`);
      }
    }
    return missing;
  }

  // ── Pixel → Tile ─────────────────────────────────────────────────────────
  // Szerokość prawej kolumny info (clamp 30% — patrz INFO_* na górze pliku).
  // Nigdy nie przekracza połowy overlayu (ochrona wąskich ekranów).
  _infoW(ow) {
    return Math.round(Math.min(Math.floor(ow * 0.5), Math.max(INFO_MIN, Math.min(INFO_MAX, ow * INFO_FRAC))));
  }

  _getMapBounds() {
    const canvas = document.getElementById('ui-canvas');
    if (!canvas) return null;
    const _r = canvas.getBoundingClientRect(); const W = _r.width / _UI_SCALE, H = _r.height / _UI_SCALE;  // CSS-size (niezależne od DPR backing store)
    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    // Mapa: overlay POMNIEJSZONY o prawą kolumnę info (szer.) oraz pasek budynków (wys.).
    return { ox, oy: oy + HDR_H + BUILD_BAR_H, ow: ow - this._infoW(ow), oh: oh - HDR_H - BUILD_BAR_H };
  }

  _screenToTile(sx, sy, grid) {
    if (!grid) return null;
    const b = this._getMapBounds();
    if (!b) return null;
    // Po splicie 70/30: ignoruj kliknięcia/hover w prawej kolumnie info (poza
    // obszarem mapy) — inaczej klik w dossier wybierałby losowy hex.
    if (sx < b.ox || sx > b.ox + b.ow || sy < b.oy || sy > b.oy + b.oh) return null;
    const cx = b.ox + b.ow / 2 - this._camX;
    const cy = b.oy + b.oh / 2 - this._camY;
    return grid.pixelToTile(sx - cx, sy - cy, this._hexSize);
  }

  // ── Input ────────────────────────────────────────────────────────────────
  /**
   * Klik przy otwartym modalu rekrutacji. TYLKO strefy 'draft_*' / 'ground:*' są aktywne
   * (find-first po przefiltrowanych strefach — niezależne od kolejności dodania). Klik poza
   * panelem zamyka modal; każdy klik jest pochłaniany (nie przebija do mapy/UI pod spodem).
   */
  _handleDraftClick(x, y) {
    const z = this._hitZones.find(zn =>
      x >= zn.x && x <= zn.x + zn.w && y >= zn.y && y <= zn.y + zn.h &&
      (zn.type === 'draft_close' || zn.type === 'draftDialogBg' || zn.type?.startsWith('ground:'))
    );
    if (!z) { this._draftOpen = false; return true; }          // klik poza panelem → zamknij
    if (z.type === 'draft_close')          this._draftOpen = false;
    else if (z.type === 'draftDialogBg')   { /* konsumuj klik w pustą część panelu */ }
    else                                   this._draftPanel.onHit(z.type.slice(7), z.data ?? {});
    return true;
  }

  handleClick(x, y) {
    if (!this.visible) return false;

    // Modal rekrutacji otwarty → TYLKO strefy draftu żyją; reszta pochłonięta (true modal).
    if (this._draftOpen) return this._handleDraftClick(x, y);

    // Sprawdź czy klik jest w overlay bounds
    const canvas = document.getElementById('ui-canvas');
    if (canvas) {
      const _r = canvas.getBoundingClientRect(); const W = _r.width / _UI_SCALE, H = _r.height / _UI_SCALE;  // CSS-size (niezależne od DPR backing store)
      const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
      // Klik POZA overlay → przepuść do reszty UI (tempo, lewy panel, itp.)
      if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;
    }

    const hit = this._hitTest(x, y);
    if (hit) { this._onHit(hit); return true; }

    // S3.4 FAZA 3 — w trybie stacji brak mapy hex: klik poza przyciskiem konsumowany (bez logiki kafla).
    if (this._stationMode) return true;
    // Podgląd — read-only: klik w mapę nic nie buduje/selekcjonuje (pan/zoom działają osobno).
    if (this._previewMode) return true;

    if (!this._hasDragged) {
      const colony = this._getColony();
      const grid = colony ? this._getGrid(colony) : null;
      const tile = this._screenToTile(x, y, grid);

      // ── Tryb lądowania Away Team ──
      if (this._landingMode && tile) {
        const terrain = TERRAIN_TYPES[tile.type];
        if (tile.type === 'ocean') {
          this._showFlash('Nie można lądować na oceanie');
        } else if (tile.buildingId) {
          this._showFlash('Hex zajęty przez budynek');
        } else {
          // Deploy rovera
          const vMgr = window.KOSMOS?.vesselManager;
          if (vMgr && this._landingVesselId) {
            vMgr.deployAwayTeam(this._landingVesselId, colony.planetId, tile.q, tile.r);
            this._showFlash('🤖 Away Team wylądował');
          }
          this._landingMode = false;
          this._landingVesselId = null;
        }
        return true;
      }

      // ── Tryb ostrzału orbitalnego ──
      if (this._strikeMode && tile) {
        const vMgr = window.KOSMOS?.vesselManager;
        const vessel = vMgr?.getVessel?.(this._strikeVesselId);
        if (!vessel) {
          this._strikeMode = false;
          return true;
        }
        const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
        const res = fireOrbitalStrike(vessel, gameYear);
        if (res?.ok) {
          EventBus.emit('groundUnit:orbitalStrike', {
            vesselId: vessel.id,
            planetId: this._strikePlanetId,
            q: tile.q, r: tile.r,
            damage: res.damage,
            ownerId: 'player',
          });
          this._showFlash(`💥 Ostrzał (${tile.q},${tile.r}) — ${res.damage} dmg`);
        } else {
          this._showFlash(`Błąd ostrzału: ${res?.reason ?? 'unknown'}`);
        }
        this._strikeMode = false;
        this._strikeVesselId = null;
        this._strikePlanetId = null;
        return true;
      }

      // ── Tryb desantu (drop mode) ──
      if (this._dropMode && tile) {
        // Blokady (hard — gracz wybiera inny hex):
        if (tile.type === 'ocean') {
          this._showFlash('Nie można zrzucić wojsk na ocean');
          return true;
        }
        const vMgr = window.KOSMOS?.vesselManager;
        const gum = window.KOSMOS?.groundUnitManager;
        const vessel = vMgr?.getVessel?.(this._dropVesselId);
        if (!vessel || this._dropQueue.length === 0) {
          this._dropMode = false;
          this._dropVesselId = null;
          this._dropQueue = [];
          return true;
        }

        // Victoria 2 stack combat: wiele jednostek może stać na hexie.
        // Ocean pozostaje zablokowany (już wcześniej). Wrogi hex → jednostka ląduje ale
        // dostaje -25% HP penalty za "chaotyczne lądowanie pod ogniem" i od razu
        // wchodzi w bitwę (CombatSystem zauważy następnym tickiem).
        const occupants = gum?.getUnitsAtHex?.(this._dropPlanetId, tile.q, tile.r) ?? [];
        const hasHostile = occupants.some(u => u.owner && u.owner !== 'player');

        const unitId = this._dropQueue.shift();
        const unit = gum?.getUnit?.(unitId);
        if (unit) {
          const res = dropTroop(vessel, unit, this._dropPlanetId, tile.q, tile.r);
          if (!res?.ok) {
            this._showFlash(`Błąd zrzutu: ${res?.reason ?? 'unknown'}`);
            this._dropQueue = [];
          } else if (hasHostile) {
            // Penalty HP za wrogi hex — jednostka wchodzi w bitwę osłabiona
            const beforeHp = unit.hp ?? 0;
            unit.hp = Math.max(1, Math.floor(beforeHp * 0.75));
            if (unit.currentHP != null) unit.currentHP = unit.hp;
            EventBus.emit('groundUnit:attacked', {
              attackerId: null, targetId: unit.id,
              damage: beforeHp - unit.hp,
              targetHP: unit.hp, targetHPMax: unit.hpMax ?? unit.maxHp,
              planetId: this._dropPlanetId, q: tile.q, r: tile.r,
            });
            this._showFlash(`🔥 Chaotyczne lądowanie (${tile.q},${tile.r}) — -25% HP`);
          } else {
            this._showFlash(`🪖 Zrzucono na (${tile.q},${tile.r})`);
          }
        }
        if (this._dropQueue.length > 0) {
          this._showDropPrompt();
        } else {
          this._finishDropMode('⚔ Desant zakończony');
        }
        return true;
      }

      // ── Tryb wyboru bitwy do wsparcia (ranged support) ──
      if (this._supportMode && tile) {
        const gum = window.KOSMOS?.groundUnitManager;
        const cs = window.KOSMOS?.combatSystem;
        const unit = gum?.getUnit?.(this._supportSourceUnitId);
        if (!unit || !cs) {
          this._supportMode = false;
          this._supportSourceUnitId = null;
          return true;
        }
        const range = unit.range ?? 1;
        const dist = this._hexDist(unit.q, unit.r, tile.q, tile.r);
        if (dist === 0 || dist > range) {
          this._showFlash(`Poza zasięgiem (${dist}/${range})`);
          return true;
        }
        if (!cs.isHexContested(unit.planetId, tile.q, tile.r)) {
          this._showFlash('Na tym hexie nie ma bitwy');
          return true;
        }
        unit.supportTarget = { q: tile.q, r: tile.r };
        this._showFlash(`🎯 Wsparcie bitwy (${tile.q},${tile.r})`);
        this._supportMode = false;
        this._supportSourceUnitId = null;
        return true;
      }

      if (tile) {
        const mgr = window.KOSMOS?.groundUnitManager;
        const unitOnTile = mgr?.getUnitAt(colony?.planetId, tile.q, tile.r);
        const mods = this._lastMouseMods ?? { shift: false, ctrl: false };
        const isMultiSelectMod = mods.shift || mods.ctrl;

        if (unitOnTile) {
          // Klik na jednostkę
          if (isMultiSelectMod) {
            // Shift/Ctrl+click → toggle pojedynczej jednostki (bez army auto-select)
            this._toggleInSelection(unitOnTile);
            this._selectedHex = { q: tile.q, r: tile.r };
          } else {
            // Zwykły klik — Paradox-style: jeśli unit w armii, zaznacz CAŁĄ armię
            const armySys = window.KOSMOS?.armySystem;
            const army = armySys?.getArmyForUnit?.(unitOnTile.id);
            if (army && army.members.size > 1) {
              // Toggle: drugi klik na jednostkę z już zaznaczonej armii → odznacz
              const alreadyAllSelected = army.members.size === this._selectedUnits.size
                && [...army.members].every(id => this._selectedUnits.has(id));
              if (alreadyAllSelected) {
                this._clearSelection();
                this._selectedHex = null;
              } else {
                this._selectedUnits.clear();
                const gum = window.KOSMOS?.groundUnitManager;
                for (const uid of army.members) {
                  const u = gum?.getUnit?.(uid);
                  if (u) this._selectedUnits.add(uid);
                }
                this._selectedUnit = unitOnTile; // primary = clicked unit
                this._selectedHex = { q: tile.q, r: tile.r };
              }
            } else if (this._selectedUnits.has(unitOnTile.id) && this._selectedUnits.size === 1) {
              // Klik na jedynie zaznaczoną loose jednostkę → odznacz
              this._clearSelection();
              this._selectedHex = null;
            } else {
              // Nadpisz select jedną loose jednostką
              this._selectSingle(unitOnTile);
              this._selectedHex = { q: tile.q, r: tile.r };
            }
          }
          this._hoveredBuildId = null;
          return true;
        }

        // Klik na pusty hex — jeśli miałeś selected unit, odznacz (bez shift/ctrl)
        if (this._selectedUnits.size > 0 && !isMultiSelectMod) {
          this._clearSelection();
        }

        // Normalny klik na hex → floating panel budowy
        this._selectedHex = { q: tile.q, r: tile.r };
        this._hoveredBuildId = null;
        this._floatScroll = 0;
        return true;
      }
      // Klik na overlay ale poza mapą — deselect wszystko
      this._selectedHex = null;
      this._clearSelection();
    }
    return true;
  }

  _onHit(zone) {
    const colony = this._getColony();
    const grid = colony ? this._getGrid(colony) : null;
    const tile = this._selectedHex && grid ? grid.get(this._selectedHex.q, this._selectedHex.r) : null;

    switch (zone.type) {
      case 'close':
        this.hide();
        // Wymuś reset active w OverlayManager (nie czekaj na draw)
        if (window.KOSMOS?.overlayManager) window.KOSMOS.overlayManager.active = null;
        break;
      case 'deselectHex': this._selectedHex = null; break;
      // Population 2.0 Faza 2 — przełącznik prawej kolumny [Planeta | Załoga].
      case 'infoTab':
        if (zone.data?.tab) this._infoTab = zone.data.tab;
        break;
      // Slider focus straty (demandBonus → pressure). Krok całkowity, clamp w setStrataFocus.
      case 'focusMinus':
      case 'focusPlus': {
        const civ = colony?.civSystem;
        const ty = zone.data?.type;
        if (civ?.setStrataFocus && ty) {
          civ.setStrataFocus(ty, civ.getStrataFocus(ty) + (zone.type === 'focusPlus' ? 1 : -1));
        }
        break;
      }
      // Slice 5C.1 — suwak share-% (docelowy udział warstwy w sile roboczej). Krok 5%.
      case 'targetMinus':
      case 'targetPlus': {
        const civ = colony?.civSystem;
        const ty = zone.data?.type;
        if (civ?.setStrataTarget && ty) {
          civ.setStrataTarget(ty, civ.getStrataTarget(ty) + (zone.type === 'targetPlus' ? 0.05 : -0.05));
        }
        break;
      }
      // Slice 5C.1 — instaluj/usuń droida PER WARSTWA (auto-pick budynku, zwrot do magazynu przy usuwaniu).
      case 'droidInstall': {
        const bSyn = colony?.buildingSystem;
        const res = bSyn?.installSyntheticForStrata?.(zone.data?.type);
        this._showFlash(res?.success ? t('synthetic.installedFlash') : t('synthetic.reason.' + (res?.reason ?? 'no_open_slot')));
        break;
      }
      case 'droidRemove': {
        const bSyn = colony?.buildingSystem;
        const res = bSyn?.removeSyntheticForStrata?.(zone.data?.type);
        this._showFlash(res?.success
          ? t(res.returned ? 'synthetic.removedReturnedFlash' : 'synthetic.removedFlash')
          : t('synthetic.reason.' + (res?.reason ?? 'no_synthetic')));
        break;
      }
      case 'colonyTab':
        if (zone.data?.planetId) {
          // B1 fix: wyjście z trybu stacji MUSI nastąpić nawet gdy klikamy zakładkę TEJ SAMEJ
          // kolonii (fallback active) — _switchColony robi early-return przy planetId===selected,
          // więc czyścimy stationMode tutaj, przed nim (inaczej mapa hex nie wraca).
          this._stationMode = false;
          this._stationPickerOpen = false;
          this._stationShipPickerOpen = false;
          this._switchColony(zone.data.planetId);
        }
        break;
      // ── S3.4 FAZA 3 — tryb stacji ──────────────────────────────────────────
      case 'stationTab':
        // Wejście w tryb stacji BEZ switchActiveColony (globalny stan nietknięty).
        if (zone.data?.stationId) {
          this._stationMode = true;
          this._selectedStationId = zone.data.stationId;
          this._stationPickerOpen = false;
        }
        break;
      case 'station_mgmt_rename': {
        const st = this._getSelectedStation();
        if (st) {
          const sid = st.id;
          showRenameModal(st.name ?? '').then((n) => {
            const nm = n?.trim();
            if (nm) EventBus.emit('station:rename', { stationId: sid, name: nm });
          });
        }
        break;
      }
      case 'station_mgmt_addslot':
        this._stationPickerOpen = true;
        this._stationShipPickerOpen = false;
        break;
      case 'station_mgmt_picker_close':
      case 'station_mgmt_picker_bg':
        this._stationPickerOpen = false;
        break;
      case 'station_mgmt_demolish':
        // R1 — rozbiórka modułu: potwierdzenie (akcja niszcząca) → StationSystem.demolishModule (bez zwrotu).
        if (zone.data?.moduleId && this._selectedStationId) {
          const modId = zone.data.moduleId, sid = this._selectedStationId;
          const def = STATION_MODULES[zone.data.moduleType];
          const nm = def ? (getLocale() === 'en' ? def.nameEN : def.namePL) : zone.data.moduleType;
          showConfirmModal({ message: t('station.mgmt.demolishConfirm', nm), danger: true }).then((ok) => {
            if (ok) {
              window.KOSMOS?.stationSystem?.demolishModule(sid, modId);
              if (window.KOSMOS?.uiManager) window.KOSMOS.uiManager._dirty = true;
            }
          });
        }
        break;
      case 'station_mgmt_demolish_blocked':
        // K2 — habitat zasiedlony: rozbiórka zablokowana (po niej pop > popCapacity). Komunikat zamiast modalu.
        this._showFlash('🔒 ' + t('station.mgmt.demolishBlocked'));
        break;
      case 'station_mgmt_addship':
        this._stationShipPickerOpen = true;
        this._stationPickerOpen = false;
        break;
      case 'station_mgmt_shippicker_close':
      case 'station_mgmt_shippicker_bg':
        this._stationShipPickerOpen = false;
        break;
      case 'station_mgmt_buildship':
        // Buduj PROJEKT gracza: hullId (kadłub) + modules (moduły projektu) — parytet ze stocznią kolonijną.
        if (zone.data?.hullId && this._selectedStationId) {
          const r = window.KOSMOS?.stationSystem?.queueStationShip(this._selectedStationId, zone.data.hullId, zone.data.modules ?? []);
          if (r?.ok) { this._stationShipPickerOpen = false; this._showFlash('🛠 ' + t('station.mgmt.flashShipQueued')); }
          else if (r?.reason === 'requiresTech')          this._showFlash('🔒 ' + t('station.mgmt.flashLocked'));
          else if (r?.reason === 'insufficient_resources') this._showFlash('⚠ ' + t('station.mgmt.flashShipCost'));
          else if (r?.reason === 'no_shipyard')            this._showFlash('⚠ ' + t('station.mgmt.flashNoShipyard'));
        }
        break;
      case 'station_mgmt_build':
        if (zone.data?.moduleType && this._selectedStationId) {
          const r = window.KOSMOS?.stationSystem?.addPendingModuleOrder(this._selectedStationId, zone.data.moduleType);
          if (r?.ok) { this._stationPickerOpen = false; this._showFlash('🛰 ' + t('station.mgmt.flashQueued')); }
          else if (r?.reason === 'requiresTech') this._showFlash('🔒 ' + t('station.mgmt.flashLocked'));
          else if (r?.reason === 'no_slots')     this._showFlash('⚠ ' + t('station.mgmt.flashFull'));
        }
        break;
      case 'station_mgmt_cancelmodule':
        if (zone.data?.orderId && this._selectedStationId) {
          window.KOSMOS?.stationSystem?.cancelPendingModuleOrder(this._selectedStationId, zone.data.orderId);
        }
        break;
      case 'station_mgmt_cancelship':
        if (zone.data?.index != null && this._selectedStationId) {
          window.KOSMOS?.stationSystem?.cancelStationShip(this._selectedStationId, zone.data.index);
        }
        break;
      case 'stationMgmtBg': break;   // konsumuj klik w tło ekranu stacji
      case 'floatPanel': break;  // konsumuj klik — nie przebijaj na mapę
      case 'headerBuilding': break;  // konsumuj klik na ikonę budynku w nagłówku
      case 'stationDialogBg': break; // konsumuj klik w tło dialogu stacji
      case 'station_open':
        if (zone.data?.hasTech) this._stationDialogOpen = !this._stationDialogOpen;
        else this._showFlash('🔒 ' + t('station.requiresTech'));
        break;
      case 'draft_open':
        if (zone.data?.hasBarracks) this._draftOpen = !this._draftOpen;
        else this._showFlash('🔒 ' + t('groundPanel.needBarracks'));
        break;
      case 'station_dialog_close':
        this._stationDialogOpen = false;
        break;
      case 'station_pick_target':
        if (zone.data?.bodyId) this._stationTargetId = zone.data.bodyId;
        break;
      case 'station_build': {
        if (colony) {
          const target = this._stationTargetId ?? colony.planetId;
          window.KOSMOS?.colonyManager?.addPendingStationOrder(colony.planetId, { targetBodyId: target });
        }
        break;
      }
      case 'station_cancel_order':
        if (colony && zone.data?.orderId) {
          window.KOSMOS?.colonyManager?.cancelPendingStationOrder(colony.planetId, zone.data.orderId);
        }
        break;
      case 'build':
        if (zone.data?.buildingId && tile) {
          EventBus.emit('planet:buildRequest', { tile, buildingId: zone.data.buildingId });
        }
        break;
      case 'upgrade':
        if (tile) EventBus.emit('planet:upgradeRequest', { tile });
        break;
      // Slice 5C.2: tri-state desygnacja budynku (active/paused/priority).
      case 'setDesignation': {
        const bs = colony?.buildingSystem;
        const r = bs?.setBuildingDesignation?.(zone.data?.tileKey, zone.data?.designation);
        if (r?.success && !r.unchanged) this._showFlash(t('designation.flash.' + zone.data.designation));
        break;
      }
      case 'demolish': {
        if (!tile) break;
        // Droid-per-job (D5): ostrzeż gdy rozbiórka/downgrade ZNISZCZY droidy (wzór dialogu wyparcia).
        const dLoss = colony?.buildingSystem?.getDemolishDroidLoss?.(`${tile.q},${tile.r}`) ?? 0;
        const doDemolish = () => EventBus.emit('planet:demolishRequest', { tile });
        if (dLoss > 0) {
          showConfirmModal({
            title: t('synthetic.demolishDroidTitle'),
            message: t('synthetic.demolishDroidWarn', dLoss),
            danger: true,
          }).then(okBtn => { if (okBtn) doDemolish(); });
        } else {
          doDemolish();
        }
        break;
      }
      // Faza 4: instalacja/usuwanie droida (syntetyk) w budynku.
      case 'installSynthetic': {
        const bSyn = colony?.buildingSystem;
        const tileKey = zone.data?.tileKey;
        const commodityId = zone.data?.commodityId;
        const doInstall = () => {
          const res = bSyn?.installSynthetic?.(tileKey, commodityId);
          this._showFlash(res?.success ? t('synthetic.installedFlash') : t('synthetic.reason.' + (res?.reason ?? 'no_commodity')));
        };
        // FIX B: świadome wyparcie — gdy budynek MA ludzkich pracowników, potwierdź (ile wyprze, ile
        // wolnych etatów na kolonii; styl ostrzeżenia gdy nadwyżka trafi do bezrobotnych). Bez obsady = od razu.
        const disp = bSyn?.getSyntheticDisplacement?.(tileKey) ?? { displaced: 0, freeSlots: 0, staffed: false };
        if (disp.staffed) {
          const warn = disp.freeSlots < disp.displaced;
          const msg = t('synthetic.displaceMsg', disp.displaced, disp.freeSlots)
            + (warn ? '\n\n⚠ ' + t('synthetic.displaceWarn', disp.displaced - disp.freeSlots) : '');
          showConfirmModal({
            title: t('synthetic.displaceTitle'),
            message: msg,
            confirmLabel: t('synthetic.install'),
            danger: warn,
          }).then(okBtn => { if (okBtn) doInstall(); });
        } else {
          doInstall();
        }
        break;
      }
      // Slice 5B — bulk „Autonomizuj": wypełnij wszystkie wolne sloty droidami jednym ruchem.
      case 'autonomizeBuilding': {
        const bSyn = colony?.buildingSystem;
        const tileKey = zone.data?.tileKey;
        const doAuto = () => {
          const res = bSyn?.autonomizeBuilding?.(tileKey);
          if (res?.success) {
            this._showFlash(res.shortfall > 0
              ? t('synthetic.autonomizePartial', res.installed, res.shortfall)
              : t('synthetic.autonomizeFull', res.installed));
          } else {
            this._showFlash(t('synthetic.reason.' + (res?.reason ?? 'no_droids')));
          }
        };
        // Świadome wyparcie: gdy budynek MA ludzkich pracowników, potwierdź (pełna autonomizacja
        // zabierze etaty wszystkim). Bez obsady = od razu.
        const disp = bSyn?.getSyntheticDisplacement?.(tileKey) ?? { staffed: false };
        if (disp.staffed) {
          showConfirmModal({
            title: t('synthetic.autonomizeTitle'),
            message: t('synthetic.autonomizeConfirm'),
            confirmLabel: t('synthetic.autonomize'),
            danger: false,
          }).then(okBtn => { if (okBtn) doAuto(); });
        } else {
          doAuto();
        }
        break;
      }
      case 'removeSynthetic': {
        const bSyn = colony?.buildingSystem;
        const res = bSyn?.removeSynthetic?.(zone.data?.tileKey);
        this._showFlash(res?.success
          ? t(res.returned ? 'synthetic.removedReturnedFlash' : 'synthetic.removedFlash')
          : t('synthetic.reason.' + (res?.reason ?? 'no_synthetic')));
        break;
      }
      case 'cancelPending':
        if (tile) {
          // Anuluj oczekujące zamówienie
          const tileKey = `${tile.q},${tile.r}`;
          const bSys = colony?.buildingSystem;
          if (bSys?._pendingQueue?.has(tileKey)) {
            bSys._pendingQueue.delete(tileKey);
            tile.pendingBuild = null;
            EventBus.emit('planet:pendingCancelled', { tileKey });
          }
        }
        break;
      case 'unitSurvey':
        if (this._selectedUnit) {
          window.KOSMOS?.groundUnitManager?.startSurvey(this._selectedUnit.id);
        }
        break;
      case 'unitAnalyze':
        if (this._selectedUnit) {
          window.KOSMOS?.groundUnitManager?.startAnalysis(this._selectedUnit.id);
        }
        break;
      case 'unitDeselect':
        this._selectedUnit = null;
        break;
      case 'unitAttack':
        // Legacy — kliki ATAKUJ zastąpione przez Victoria 2 stack combat (automatyczne)
        this._showFlash('Bitwa automatyczna — wejdź na hex wroga');
        break;
      case 'unitSupportStart':
        // Tryb wyboru bitwy do wsparcia — klik w contested hex ustawi supportTarget
        if (this._selectedUnit) {
          this._supportMode = true;
          this._supportSourceUnitId = this._selectedUnit.id;
          this._showFlash('🎯 Wybierz contested hex w zasięgu');
        }
        break;
      case 'unitClearSupport':
        if (this._selectedUnit) {
          this._selectedUnit.supportTarget = null;
          this._showFlash('✕ Wsparcie anulowane');
        }
        break;
      case 'unitDeploy':
        if (this._selectedUnit) {
          const res = window.KOSMOS?.groundUnitManager?.deploy(this._selectedUnit.id);
          if (!res?.success) console.warn('[ColonyOverlay] Rozłożenie nieudane:', res?.reason);
        }
        break;
      case 'unitPackUp':
        if (this._selectedUnit) {
          const res = window.KOSMOS?.groundUnitManager?.packUp(this._selectedUnit.id);
          if (!res?.success) console.warn('[ColonyOverlay] Zwijanie nieudane:', res?.reason);
        }
        break;
      case 'unitCancelDeploy':
        if (this._selectedUnit) {
          window.KOSMOS?.groundUnitManager?.cancelDeployTransition(this._selectedUnit.id);
        }
        break;

      // ── Army actions (Paradox-style) ──
      case 'stackRowClick': {
        // Toggle jednostki w selektcie
        const u = window.KOSMOS?.groundUnitManager?.getUnit?.(zone.data?.unitId);
        if (u) this._toggleInSelection(u);
        break;
      }
      case 'stackSelectAll': {
        const mgr = window.KOSMOS?.groundUnitManager;
        if (!mgr) break;
        const pid = this._getColony()?.planetId;
        const stack = mgr.getUnitsAtHex(pid, zone.data.tileQ, zone.data.tileR)
          .filter(u => !u.owner || u.owner === 'player');
        this._selectedUnits.clear();
        for (const u of stack) this._selectedUnits.add(u.id);
        if (stack.length > 0) this._selectedUnit = stack[0];
        this._showFlash(`⚡ Zaznaczono ${stack.length}`);
        break;
      }
      case 'armyCreate': {
        const mgr = window.KOSMOS?.groundUnitManager;
        const armySys = window.KOSMOS?.armySystem;
        if (!mgr || !armySys) break;
        const pid = this._getColony()?.planetId;
        const stack = mgr.getUnitsAtHex(pid, zone.data.tileQ, zone.data.tileR)
          .filter(u => !u.owner || u.owner === 'player');
        if (stack.length < 2) { this._showFlash('Potrzeba ≥2 jednostek'); break; }
        const res = armySys.createArmy(stack.map(u => u.id));
        if (res.success) this._showFlash(`🎖 Utworzono ${res.army.name}`);
        else this._showFlash(`Błąd: ${res.reason}`);
        break;
      }
      case 'armyCreateFromSelection': {
        const armySys = window.KOSMOS?.armySystem;
        if (!armySys) break;
        const ids = [...this._selectedUnits];
        if (ids.length < 2) { this._showFlash('Potrzeba ≥2 jednostek'); break; }
        const res = armySys.createArmy(ids);
        if (res.success) this._showFlash(`🎖 Utworzono ${res.army.name}`);
        else this._showFlash(`Błąd: ${res.reason}`);
        break;
      }
      case 'armyDisband': {
        const armySys = window.KOSMOS?.armySystem;
        if (!armySys || !zone.data?.armyId) break;
        const army = armySys.getArmy(zone.data.armyId);
        if (!army) break;
        const armyId = zone.data.armyId;
        showConfirmModal({
          title:        t('army.disband.title'),
          message:      t('army.disband.message', army.name),
          confirmLabel: t('common.disband'),
          cancelLabel:  t('confirm.cancel'),
          danger:       true,
        }).then((confirmed) => {
          if (!confirmed) return;
          armySys.disbandArmy(armyId);
          this._showFlash('💔 Armia rozwiązana');
        });
        break;
      }
      case 'armyRename': {
        const armySys = window.KOSMOS?.armySystem;
        if (!armySys || !zone.data?.armyId) break;
        const army = armySys.getArmy(zone.data.armyId);
        if (!army) break;
        const name = window.prompt('Nowa nazwa armii:', army.name);
        if (name) armySys.renameArmy(zone.data.armyId, name);
        break;
      }
      case 'armySplit':
      case 'armySplitFromDrawer': {
        const armySys = window.KOSMOS?.armySystem;
        if (!armySys || !zone.data?.armyId) break;
        const army = armySys.getArmy(zone.data.armyId);
        if (!army) break;
        // Wyodrębnij zaznaczone z selektu (jeśli to członkowie tej armii)
        const split = [...this._selectedUnits].filter(id => army.members.has(id));
        if (split.length === 0) {
          this._showFlash('Zaznacz członków armii do wydzielenia');
          break;
        }
        if (split.length >= army.members.size) {
          this._showFlash('Nie można wydzielić całej armii');
          break;
        }
        const res = armySys.splitArmy(zone.data.armyId, split);
        if (res.success && res.newArmy) {
          this._showFlash(`➕ Wydzielono ${res.newArmy.name}`);
        } else if (res.success) {
          this._showFlash('➕ Jednostki wydzielone (za mało na armię)');
        } else {
          this._showFlash(`Błąd: ${res.reason}`);
        }
        break;
      }
      case 'drawerUnitClick': {
        const u = window.KOSMOS?.groundUnitManager?.getUnit?.(zone.data?.unitId);
        if (u) {
          // Klik na ikonę w drawerze → zaznacz pojedynczo
          this._selectSingle(u);
          this._selectedHex = { q: u.q, r: u.r };
        }
        break;
      }
      case 'drawerOpenUnit': {
        const u = window.KOSMOS?.groundUnitManager?.getUnit?.(zone.data?.unitId);
        if (u) {
          try { showUnitCard(u); } catch { /* */ }
        }
        break;
      }
      case 'drawerOpenGroup': {
        try { showBattleGroup(this._getSelectedUnits(), this._selectedUnits); } catch { /* */ }
        break;
      }
      case 'cycleHexUnit': {
        const u = window.KOSMOS?.groundUnitManager?.getUnit?.(zone.data?.unitId);
        if (u) this._selectSingle(u);
        break;
      }
    }
  }

  handleMouseMove(x, y) {
    if (!this.visible) return;
    super.handleMouseMove(x, y);  // aktualizuje _hoverZone + _rectSelect.curX/Y
    this._mouseX = x; this._mouseY = y;   // dla tooltipów panelu rekrutacji

    // Modal rekrutacji → hover TYLKO po strefach panelu (tooltipy); reszta widoku nieaktywna.
    if (this._draftOpen) {
      this._hoverZone = this._hitZones.find(zn =>
        x >= zn.x && x <= zn.x + zn.w && y >= zn.y && y <= zn.y + zn.h && zn.type?.startsWith('ground:')
      ) ?? null;
      return;
    }

    // Rect-select aktywne → nic więcej nie rób (pan i hover nie dotyczą drag-select)
    if (this._rectSelect.active) return;

    if (this._isDragging) {
      const dx = x - this._dragStartX, dy = y - this._dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._hasDragged = true;
      this._camX = this._dragCamStartX - dx;
      this._camY = this._dragCamStartY - dy;
      return;
    }

    // Hover — hit test na elementy UI
    const hit = this._hitTest(x, y);
    const oldHov = this._hoveredBuildId;
    this._hoveredBuildId = (hit?.type === 'build') ? hit.data?.buildingId : null;

    // Faza 3: generyczny tooltip z pola zone.data.tooltip (focus slider, lista budynków warstw).
    if (hit?.data?.tooltip) { this._showTooltip(hit.data.tooltip, x * _UI_SCALE, y * _UI_SCALE); return; }

    // Tooltip budynku w nagłówku (ikony budynków kolonii)
    if (hit?.type === 'headerBuilding') {
      const bd = BUILDINGS[hit.data.buildingId];
      const colony = this._getColony();
      if (bd && colony) {
        let html = `<b>${bd.icon ?? ''} ${bd.namePL ?? bd.id}</b>`;
        html += ` (×${hit.data.count})`;
        // Pokaż WSZYSTKIE instancje z _active
        const bSys = colony.buildingSystem;
        if (bSys?._active) {
          let idx = 0;
          for (const [key, entry] of bSys._active) {
            if (entry.building?.id !== hit.data.buildingId) continue;
            idx++;
            const rates = entry.effectiveRates ?? entry.baseRates;
            html += `<br>`;
            if (hit.data.count > 1) html += `#${idx} `;
            html += `<b>Lv.${entry.level ?? 1}</b> `;
            if (rates) {
              html += Object.entries(rates)
                .filter(([, v]) => v !== 0)
                .map(([k, v]) => `<span style="color:${v > 0 ? '#8f8' : '#f88'}">${v > 0 ? '+' : ''}${typeof v === 'number' ? v.toFixed(1) : v} ${k}</span>`)
                .join(' ');
            }
          }
        }
        if (bd.jobs) html += `<br>${this._jobsLine(bd)}`;   // Faza 3: „Etaty: n× <warstwa>"
        if (bd.housing) html += ` 🏠 +${bd.housing}`;
        this._showTooltip(html, x * _UI_SCALE, y * _UI_SCALE);
      }
      return;
    }

    // Tooltip budynku w build list
    if (this._hoveredBuildId && this._hoveredBuildId !== oldHov) {
      const bd = BUILDINGS[this._hoveredBuildId];
      if (bd) {
        const colony = this._getColony();
        const res = colony?.resourceSystem;
        let html = `<b>${bd.icon ?? ''} ${bd.namePL ?? bd.id}</b>`;
        // Koszt surowców (z dopłatą środowiskową — Stage 2; podgląd == rzeczywisty spend)
        const envCost = computeBuildResourceCost(bd, colony?.planet);
        if (Object.keys(envCost).length > 0) {
          html += '<br>Koszt: ' + Object.entries(envCost).map(([k, v]) => {
            const have = res?.getAmount?.(k) ?? res?.inventory?.get(k) ?? 0;
            const color = have >= v ? '#8f8' : '#f66';
            return `<span style="color:${color}">${k}:${v}</span>`;
          }).join(' ');
        }
        // Koszt commodities (z dopłatą środowiskową — Stage 3 Part A; podgląd == rzeczywisty spend)
        const envCommodity = computeBuildCommodityCost(bd, colony?.planet);
        if (Object.keys(envCommodity).length > 0) {
          const parts = Object.entries(envCommodity).map(([k, v]) => {
            const have = res?.inventory?.get(k) ?? 0;
            const color = have >= v ? '#8f8' : '#f66';
            const icon = COMMODITIES[k]?.icon ?? '📦';
            const name = COMMODITIES[k]?.namePL ?? k;
            return `<span style="color:${color}">${v}×${icon}${name}</span>`;
          });
          html += '<br>' + parts.join(' ');
        }
        // Braki
        const missing = this._getMissing(colony, bd);
        if (missing.length > 0) {
          html += `<br><span style="color:#f66">Brakuje: ${missing.join(', ')}</span>`;
        }
        // Stage 1: blokada klimatyczna — pokaż powód na hover (nie tylko przy kliknięciu)
        const lockReason = this._buildLockReasons?.get(this._hoveredBuildId);
        if (lockReason) {
          html += `<br><span style="color:#f66">🔒 ${t(lockReason)}</span>`;
        }
        if (bd.rates) {
          html += '<br>' + Object.entries(bd.rates).map(([k, v]) =>
            `<span style="color:${v > 0 ? '#8f8' : '#f88'}">${v > 0 ? '+' : ''}${v} ${k}</span>`
          ).join(' ');
        }
        if (bd.jobs) html += `<br>${this._jobsLine(bd)}`;   // Faza 3: „Etaty: n× <warstwa>"
        if (bd.housing) html += `<br>🏠 +${bd.housing} housing`;
        this._showTooltip(html, x * _UI_SCALE, y * _UI_SCALE);
      }
    } else if (!this._hoveredBuildId && hit?.type !== 'headerBuilding') {
      // Hover na hex
      const colony = this._getColony();
      const grid = colony ? this._getGrid(colony) : null;
      const tile = this._screenToTile(x, y, grid);
      if (tile) {
        this._hoveredHex = { q: tile.q, r: tile.r };
        const terrain = TERRAIN_TYPES[tile.type];
        let html = `<b>${terrain?.icon ?? ''} ${terrain?.namePL ?? tile.type}</b>`;
        if (tile.buildingId) {
          const b = BUILDINGS[tile.buildingId];
          html += `<br>${b?.icon ?? ''} ${(b?.namePL ?? b?.id)} Lv.${tile.buildingLevel ?? 1}`;
        }
        // Anomalia na hexie
        if (tile.anomaly && tile.anomalyDetected) {
          if (tile.anomalyRevealed) {
            const ad = ANOMALIES[tile.anomaly];
            if (ad) {
              html += `<br><span style="color:#ffdd44">${ad.icon ?? ''} ${ad.namePL ?? ad.id}</span>`;
              html += `<br><span style="color:#ccbb88;font-size:10px">${ad.effectDescPL ?? ''}</span>`;
            }
          } else {
            html += `<br><span style="color:#ffdd44">❓ Wykryto anomalię — wyślij rovera</span>`;
          }
        }
        this._showTooltip(html, x * _UI_SCALE, y * _UI_SCALE);
      } else {
        this._hoveredHex = null;
        this._hideTooltip();
      }
    }
  }

  // ── Rect-select (LMB drag) — opt-in dla BaseOverlay ────────────────────────
  // Zwraca true gdy punkt (x,y) nadaje się na start prostokąta selekcji.
  _canStartRectSelect(x, y) {
    if (!this.visible) return false;
    // Nie w floating panelu
    if (this._selectedHex && x >= this._floatX && x <= this._floatX + FLOAT_W &&
        y >= this._floatY && y <= this._floatY + (this._floatH ?? 300)) return false;
    // W bounds mapy
    const bounds = this._getMapBounds();
    if (!bounds) return false;
    if (x < bounds.ox || x > bounds.ox + bounds.ow || y < bounds.oy || y > bounds.oy + bounds.oh) return false;
    // Nie w specjalnych trybach (tam LMB = wybór hexa)
    if (this._landingMode || this._strikeMode || this._supportMode) return false;
    // Nie nad hit-zone (np. przycisk)
    if (this._hitTest(x, y)) return false;
    return true;
  }

  // Helper: pobierz jednostki-gracza których sprite leży w prostokącie screen-space.
  _collectUnitsInRect(bounds) {
    const out = new Set();
    const mgr = window.KOSMOS?.groundUnitManager;
    const colony = this._getColony();
    const grid = colony ? this._getGrid(colony) : null;
    if (!mgr || !grid) return out;
    const mapBounds = this._getMapBounds();
    if (!mapBounds) return out;
    const cx = mapBounds.ox + mapBounds.ow / 2 - this._camX;
    const cy = mapBounds.oy + mapBounds.oh / 2 - this._camY;
    const units = mgr.getUnitsOnPlanet?.(colony.planetId) ?? [];
    for (const u of units) {
      if (u.owner && u.owner !== 'player') continue;
      const pos = grid.tilePixelPos(u.q, u.r, this._hexSize);
      const sx = cx + pos.x, sy = cy + pos.y;
      if (sx >= bounds.minX && sx <= bounds.maxX && sy >= bounds.minY && sy <= bounds.maxY) {
        out.add(u.id);
      }
    }
    return out;
  }

  _onRectSelectPreview(bounds) {
    return this._collectUnitsInRect(bounds);
  }

  _onRectSelectComplete(bounds, mods) {
    // Gate supresji click'a który zaraz wystrzeli po mouseup
    this._hasDragged = true;

    const ids = this._collectUnitsInRect(bounds);
    // Ctrl trzymane na release → dodaj do istniejącego selectu; bez Ctrl → nadpisz
    if (!mods.ctrl) this._clearSelection();
    const mgr = window.KOSMOS?.groundUnitManager;
    for (const uid of ids) {
      const u = mgr?.getUnit?.(uid);
      if (!u) continue;
      this._selectedUnits.add(uid);
      this._selectedUnit = u;
    }
    if (ids.size > 0) {
      this._showFlash(`Zaznaczono ${this._selectedUnits.size} jednostek`);
    } else if (!mods.ctrl) {
      // Pusty rect bez Ctrl = deselekcja (oczyść wybór)
      this._showFlash('Wybór wyczyszczony');
    }
  }

  handleMouseDown(x, y, button = 0) {
    if (!this.visible) return;
    // LMB → pozwól BaseOverlay uruchomić rect-select jeśli _canStartRectSelect()
    if (button === 0) {
      this._hasDragged = false;  // reset dla click-vs-drag w handleClick
      super.handleMouseDown(x, y, button);
      return; // brak pan-kamery pod LMB
    }
    // MMB → pan kamery
    if (button === 1) {
      // Nie pan gdy klik w floating panel
      if (this._selectedHex && x >= this._floatX && x <= this._floatX + FLOAT_W &&
          y >= this._floatY && y <= this._floatY + (this._floatH ?? 300)) return;
      const bounds = this._getMapBounds();
      if (!bounds) return;
      if (x < bounds.ox || x > bounds.ox + bounds.ow || y < bounds.oy || y > bounds.oy + bounds.oh) return;
      this._isDragging = true; this._hasDragged = false;
      this._dragStartX = x; this._dragStartY = y;
      this._dragCamStartX = this._camX; this._dragCamStartY = this._camY;
    }
    // RMB (button 2) → rozkaz ruchu obsługuje window.contextmenu w GameScene
  }

  handleMouseUp(x, y, button = 0) {
    if (!this.visible) return;
    // LMB → domknij rect-select (BaseOverlay wywoła _onRectSelectComplete)
    if (button === 0) {
      super.handleMouseUp(x, y, button);
      return;
    }
    // MMB → zakończ pan
    if (button === 1) {
      this._isDragging = false;
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;

    // Modal rekrutacji → scroll rusza detal panelu (nie mapę/paski pod spodem).
    if (this._draftOpen) { this._draftPanel.handleScroll(delta, x, y); return true; }

    const mb = this._getMapBounds();
    // Scroll poziomy zakładek kolonii (kursor nad pasmem nagłówka)
    if (mb && x >= mb.ox && y >= mb.oy - HDR_H - BUILD_BAR_H && y <= mb.oy - BUILD_BAR_H) {
      this._colonyTabScroll = Math.max(0, (this._colonyTabScroll ?? 0) + delta * 24); // górny clamp w draw
      return true;
    }
    // Scroll poziomy paska budynków (kursor nad paskiem nad mapą)
    if (mb && x >= mb.ox && x <= mb.ox + mb.ow && y >= mb.oy - BUILD_BAR_H && y <= mb.oy) {
      this._buildBarScroll = Math.max(0, (this._buildBarScroll ?? 0) + delta * 24); // górny clamp w draw
      return true;
    }

    // C4 — scroll prawej kolumny (info panel, per-zakładka). Info panel jest NA PRAWO od mapy
    // (x > mb.ox+mb.ow), więc MUSI być sprawdzony PRZED bramką „poza bounds" (która by go odrzuciła).
    // Tylko gdy treść przewijalna (mieści się → przepuść bez zmian, jak dotąd). Górny klamp w draw.
    const iv = this._infoView;
    if (iv && iv.scrollable && x >= iv.x && x <= iv.x + iv.w && y >= iv.top && y <= iv.bot) {
      this._infoScroll ??= {};
      this._infoScroll[iv.tab] = Math.max(0, (this._infoScroll[iv.tab] ?? 0) + delta);
      return true;
    }

    // Kursor poza overlay bounds → przepuść scroll
    const bounds = mb;
    if (bounds && (x < bounds.ox || x > bounds.ox + bounds.ow || y < bounds.oy - HDR_H || y > bounds.oy + bounds.oh)) {
      return false;
    }

    // Scroll floating panelu (jeśli kursor nad nim)
    if (this._selectedHex && x >= this._floatX && x <= this._floatX + FLOAT_W &&
        y >= this._floatY && y <= this._floatY + (this._floatH ?? 300)) {
      this._floatScroll = (this._floatScroll ?? 0) + delta * 3;
      this._floatScroll = Math.max(0, this._floatScroll);
      return true;
    }

    // Zoom mapy
    const oldSize = this._hexSize;
    this._hexSize = Math.max(this._minHexSize, Math.min(this._maxHexSize, this._hexSize - delta * 0.1));
    if (this._hexSize !== oldSize) {
      const scale = this._hexSize / oldSize;
      const b = this._getMapBounds();
      if (b) {
        this._camX = this._camX * scale + (x - b.ox - b.ow / 2) * (scale - 1);
        this._camY = this._camY * scale + (y - b.oy - b.oh / 2) * (scale - 1);
      }
    }
    return true;
  }

  handleKeyDown(key, mods = {}) {
    if (!this.visible) return false;

    // Grupy bojowe: 1..9 select / Ctrl+1..9 assign
    if (/^[1-9]$/.test(key)) {
      const n = Number(key);
      if (mods.ctrl) {
        // Ctrl+N: przypisz aktualny select → grupa N
        if (this._selectedUnits.size === 0) {
          this._showFlash(`Nic nie zaznaczono do grupy ${n}`);
        } else {
          this._controlGroups.set(n, new Set(this._selectedUnits));
          this._showFlash(`✓ Grupa ${n} (${this._selectedUnits.size} jednostek)`);
        }
        return true;
      }
      // Sam N: select grupy N
      const group = this._controlGroups.get(n);
      if (!group || group.size === 0) {
        this._showFlash(`Grupa ${n} jest pusta`);
        return true;
      }
      const gum = window.KOSMOS?.groundUnitManager;
      this._selectedUnits.clear();
      let primary = null;
      for (const id of group) {
        const u = gum?.getUnit?.(id);
        if (u) {
          this._selectedUnits.add(id);
          if (!primary) primary = u;
        }
      }
      // Usuń martwe jednostki z grupy
      for (const id of group) if (!gum?.getUnit?.(id)) group.delete(id);
      this._selectedUnit = primary;
      this._showFlash(`👥 Grupa ${n} (${this._selectedUnits.size} jednostek)`);
      return true;
    }

    if (key === 'Escape') {
      // Priorytet: anuluj tryby specjalne zamiast zamykać overlay
      if (this._dropMode)    { this._finishDropMode('⚔ Desant anulowany'); return true; }
      if (this._strikeMode)  { this._strikeMode = false; this._strikeVesselId = null; this._strikePlanetId = null; this._showFlash('💥 Ostrzał anulowany'); return true; }
      if (this._supportMode) { this._supportMode = false; this._supportSourceUnitId = null; this._showFlash('🎯 Wybór wsparcia anulowany'); return true; }
      if (this._landingMode) { this._landingMode = false; this._landingVesselId = null; this._showFlash('🤖 Away Team anulowany'); return true; }
      if (this._selectedUnit) { this._selectedUnit = null; this._selectedHex = null; return true; }
      if (this._selectedHex) { this._selectedHex = null; return true; }
      this.hide();
      if (window.KOSMOS?.overlayManager) window.KOSMOS.overlayManager.active = null;
      return true;
    }
    // Karta jednostki / grupy (klawisz I)
    if (key === 'i' || key === 'I') {
      if (this._selectedUnits.size > 1) {
        // Multi-select → panel grupy
        try { showBattleGroup(this._getSelectedUnits(), this._selectedUnits); } catch { /* */ }
        return true;
      }
      if (this._selectedUnit) {
        try { showUnitCard(this._selectedUnit); } catch { /* */ }
        return true;
      }
    }
    if (key === 'Delete' && this._selectedHex) {
      const colony = this._getColony();
      const grid = colony ? this._getGrid(colony) : null;
      const tile = grid?.get(this._selectedHex.q, this._selectedHex.r);
      if (tile?.buildingId) { EventBus.emit('planet:demolishRequest', { tile }); return true; }
    }

    // Opcja C v3: toggle Supply Coverage overlay — Shift+S (żeby samo 's' mogło być pan)
    if (key === 'S' || (mods.shift && key === 's')) {
      this._showSupplyCoverage = !this._showSupplyCoverage;
      return true;
    }

    // Pan kamery klawiaturą: WASD / strzałki (gdy bez shift — Shift+S to supply)
    if (!mods.shift) {
      const PAN_STEP = 40;
      if (key === 'ArrowLeft'  || key === 'a') { this._camX -= PAN_STEP; return true; }
      if (key === 'ArrowRight' || key === 'd') { this._camX += PAN_STEP; return true; }
      if (key === 'ArrowUp'    || key === 'w') { this._camY -= PAN_STEP; return true; }
      if (key === 'ArrowDown'  || key === 's') { this._camY += PAN_STEP; return true; }
    }
    return false;
  }

  // ── Biome map loader — ładuje _biome.png i ustawia tile.type per hex ────
  // Fallback: PlanetMapGenerator biomy (jeśli biome.png nie istnieje)
  _loadBiomeMap(planet, grid, planetId) {
    if (!planet || !grid) return;

    const texType = planet._cachedTexType ?? null;
    if (!texType || texType.startsWith('gas')) return; // gas giganty → PlanetMapGenerator

    const variant = planet._cachedTexVariant ?? ((hashCode(planet.id || 'p') % TEXTURE_VARIANTS) + 1);
    const vStr = String(variant).padStart(2, '0');
    const url = `assets/planet-textures/${texType}_${vStr}_biome.png`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);

      this._applyBiomeMap(grid, imageData);
    };
    img.onerror = () => {
      // Biome map nie istnieje — zachowaj PlanetMapGenerator biomy (fallback)
    };
    img.src = url;
  }

  // Mapuj kolory biome map → TERRAIN_TYPES key
  _applyBiomeMap(grid, imageData) {
    const texW = imageData.width, texH = imageData.height;
    const data = imageData.data;
    const hexSize = 32;
    const gridPx = grid.gridPixelSize(hexSize);

    // Kolory biomów z generatora (muszą matchować BIOME_COLORS w generate-planets.js)
    const BIOME_RGB = [
      { key: 'DEEP_OCEAN', rgb: [0, 40, 140] },
      { key: 'OCEAN', rgb: [0, 80, 200] },
      { key: 'COAST', rgb: [0, 130, 220] },
      { key: 'PLAINS', rgb: [100, 180, 60] },
      { key: 'FOREST', rgb: [30, 120, 40] },
      { key: 'DESERT', rgb: [210, 170, 80] },
      { key: 'SAVANNA', rgb: [180, 160, 60] },
      { key: 'TUNDRA', rgb: [150, 170, 160] },
      { key: 'MOUNTAINS', rgb: [120, 100, 80] },
      { key: 'HIGH_PEAKS', rgb: [200, 200, 210] },
      { key: 'VOLCANIC', rgb: [80, 20, 10] },
      { key: 'ICE', rgb: [210, 230, 255] },
      { key: 'TOXIC', rgb: [140, 200, 40] },
      { key: 'CRATER', rgb: [80, 70, 60] },
      { key: 'BARREN', rgb: [130, 110, 90] },
    ];

    // Biome key → TERRAIN_TYPES key (gameplay)
    const BIOME_TO_TERRAIN = {
      DEEP_OCEAN: 'ocean', OCEAN: 'ocean', COAST: 'ocean',
      PLAINS: 'plains', FOREST: 'forest', DESERT: 'desert',
      SAVANNA: 'plains', TUNDRA: 'tundra', MOUNTAINS: 'mountains',
      HIGH_PEAKS: 'mountains', VOLCANIC: 'volcano', ICE: 'ice_sheet',
      TOXIC: 'wasteland', CRATER: 'crater', BARREN: 'wasteland',
    };

    grid.forEach(tile => {
      const pos = grid.tilePixelPos(tile.q, tile.r, hexSize);
      const u = Math.max(0, Math.min(0.999, pos.x / gridPx.w));
      const v = Math.max(0, Math.min(0.999, pos.y / gridPx.h));
      const px = Math.floor(u * (texW - 1));
      const py = Math.floor(v * (texH - 1));
      const idx = (py * texW + px) * 4;

      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      // Dopasuj kolor do najbliższego biome key (Euklidesowy)
      let bestKey = 'PLAINS', bestDist = Infinity;
      for (const { key, rgb } of BIOME_RGB) {
        const d = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
        if (d < bestDist) { bestDist = d; bestKey = key; }
      }

      // Mapuj na TERRAIN_TYPES key
      tile.type = BIOME_TO_TERRAIN[bestKey] ?? 'plains';
    });
  }
}
