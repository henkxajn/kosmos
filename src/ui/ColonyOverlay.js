// ColonyOverlay — mapa 2D planety (klawisz C)
//
// Tapered hex grid: owalny kształt — bieguny wąskie, równik szeroki.
// Mapa zajmuje CAŁY overlay. Floating panel pojawia się obok zaznaczonego hexa.
// Nagłówek: nazwa kolonii + POP + budynki.

import { BaseOverlay, HEADER_H }  from './BaseOverlay.js';
import { THEME, bgAlpha, hexToRgb } from '../config/ThemeConfig.js';
import { UNIT_ARCHETYPES } from '../data/unitArchetypes.js';
import { BUILDINGS, RESOURCE_ICONS, formatCost } from '../data/BuildingsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { STATIONS } from '../data/StationData.js';
import EntityManager from '../core/EntityManager.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';
import { HexGrid }      from '../map/HexGrid.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { hashCode, TEXTURE_VARIANTS } from '../renderer/PlanetTextureUtils.js';
import EventBus          from '../core/EventBus.js';
import { dropTroop, fireOrbitalStrike } from '../entities/Vessel.js';
import { showUnitCard } from './UnitCardPanel.js';
import { showBattleGroup } from './BattleGroupPanel.js';
import { showConfirmModal } from './ConfirmModal.js';
import { ANOMALIES }     from '../data/AnomalyData.js';
import { t }   from '../i18n/i18n.js';
import { getTerrainTexture, getTransitionTexture, texturesLoaded } from '../renderer/TerrainTextures.js';
import { HEX_DIRECTIONS } from '../map/HexGrid.js';

const HDR_H = HEADER_H;   // wysokość pasma nagłówka (standard BaseOverlay)
const FLOAT_W = 200;  // szerokość floating panelu

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

    // Stacje orbitalne (S3.3b-S4) — dialog budowy + feedback (flash)
    this._stationDialogOpen = false;
    this._stationTargetId   = null;
    EventBus.on('station:orderQueued',    (e) => { if (this._isActivePlanet(e?.planetId)) this._showFlash('🛰 ' + t('station.flashQueued')); });
    EventBus.on('station:built',          (e) => { if (this._isActivePlanet(e?.planetId)) this._showFlash('🛰 ' + t('station.flashBuilt')); });
    EventBus.on('station:buildFailed',    (e) => { if (this._isActivePlanet(e?.planetId)) this._showFlash('⚠ ' + t('station.flashFailed')); });
    EventBus.on('station:orderCancelled', (e) => { if (this._isActivePlanet(e?.planetId)) this._showFlash('✕ ' + t('station.flashCancelled')); });
    EventBus.on('station:orderRejected',  (e) => { if (this._isActivePlanet(e?.planetId)) this._showFlash('🔒 ' + t('station.flashRejected')); });

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
    this._tooltipEl.style.left = `${Math.min(sx + 12, window.innerWidth - 330)}px`;
    this._tooltipEl.style.top  = `${Math.min(sy - 10, window.innerHeight - 200)}px`;
  }
  _hideTooltip() { if (this._tooltipEl) this._tooltipEl.style.display = 'none'; }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  show(opts = {}) {
    super.show();
    const colMgr = window.KOSMOS?.colonyManager;
    // opts.colonyId ma priorytet (np. drop mode na obcej planecie).
    // Inaczej: activePlanetId gracza.
    if (opts.colonyId) {
      this._selectedColonyId = opts.colonyId;
    } else if (colMgr) {
      this._selectedColonyId = colMgr.activePlanetId;
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
    this._selectedHex = null; this._hoveredHex = null;
    this._selectedUnit = null;
    this._hideTooltip();
    document.getElementById('colony-open-backdrop')?.remove();
    // Wymuś reset active w OverlayManager (nie czekaj na draw)
    const om = window.KOSMOS?.overlayManager;
    if (om && om.active === 'colony') om.active = null;
  }

  _fitMapToView(grid) {
    const canvas = document.getElementById('ui-canvas');
    if (!canvas) return;
    const W = canvas.width / _UI_SCALE, H = canvas.height / _UI_SCALE;
    const { ow, oh } = this._getOverlayBounds(W, H);
    const mapW = ow - 20, mapH = oh - HDR_H - 20;
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
  _getColony() { return window.KOSMOS?.colonyManager?.getColony(this._selectedColonyId) ?? null; }

  _getGrid(colony) {
    if (!colony) return null;
    const pid = colony.planetId;
    if (this._gridCache[pid]) return this._gridCache[pid];

    // Obca/test-enemy kolonia wygenerowana poza overlay (np. spawnTestEnemy już ustawił
    // grid z tile.owner=empireId i zbudował capital). Uszanuj istniejący grid — nie regeneruj.
    const isHostileColony = !!colony.ownerEmpireId || !!colony.isTestEnemy;
    if (colony.grid && isHostileColony) {
      this._gridCache[pid] = colony.grid;
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

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    // Ciemne tło
    ctx.fillStyle = 'rgba(2, 4, 8, 0.92)';
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = THEME.borderActive; ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    const colony = this._getColony();
    const grid = colony ? this._getGrid(colony) : null;

    // Nagłówek z podsumowaniem kolonii
    this._drawHeader(ctx, ox, oy, ow, colony);

    // Mapa hex 2D — pełna szerokość
    const mapY = oy + HDR_H;
    const mapH = oh - HDR_H;
    if (grid) {
      ctx.save();
      ctx.beginPath(); ctx.rect(ox, mapY, ow, mapH); ctx.clip();
      this._drawMap(ctx, ox, mapY, ow, mapH, grid, colony?.planet);
      ctx.restore();
    }

    // Floating panel obok zaznaczonego hexa (nie pokazuj gdy jednostka zaznaczona)
    if (this._selectedHex && !this._selectedUnit && grid && colony) {
      const tile = grid.get(this._selectedHex.q, this._selectedHex.r);
      if (tile) {
        // Jeśli na hexie jest stack (≥2 player units) → pokaż stack panel
        const gum = window.KOSMOS?.groundUnitManager;
        const playerStack = gum?.getUnitsAtHex?.(colony.planetId, tile.q, tile.r)
          .filter(u => !u.owner || u.owner === 'player') ?? [];
        if (playerStack.length >= 2) {
          const sp = this._tileScreenPos(tile, grid, ox, oy, ow, oh);
          let fx = sp.x + this._hexSize + 8;
          let fy = sp.y - 60;
          const STACK_W = 240;
          if (fx + STACK_W > ox + ow - 10) fx = sp.x - STACK_W - this._hexSize - 8;
          fx = Math.max(ox + 4, Math.min(ox + ow - STACK_W - 4, fx));
          fy = Math.max(mapY + 4, fy);
          this._floatX = fx; this._floatY = fy;
          this._drawStackFloatingPanel(ctx, fx, fy, STACK_W, playerStack, tile);
        } else {
          // Zwykły panel budowy
          const sp = this._tileScreenPos(tile, grid, ox, oy, ow, oh);
          let fx = sp.x + this._hexSize + 8;
          let fy = sp.y - 60;
          if (fx + FLOAT_W > ox + ow - 10) fx = sp.x - FLOAT_W - this._hexSize - 8;
          const panelH = this._floatH ?? 300;
          fy = Math.max(mapY + 4, Math.min(oy + oh - panelH - 4, fy));
          fx = Math.max(ox + 4, Math.min(ox + ow - FLOAT_W - 4, fx));
          this._floatX = fx; this._floatY = fy;
          this._drawFloatingPanel(ctx, fx, fy, tile, colony, grid);
        }
      }
    }

    // Panel jednostki naziemnej
    if (this._selectedUnit && colony) {
      this._drawUnitPanel(ctx, ox, oy, ow, oh);
    }

    // Bottom Drawer (Paradox HoI4-style) — pas pod mapą gdy coś zaznaczone
    if (this._selectedUnits.size > 0 && colony) {
      this._drawBottomDrawer(ctx, ox, oy, ow, oh);
    }

    // Station build dialog (S3.3b-S4) — modal nad mapą
    if (this._stationDialogOpen && colony && !colony.ownerEmpireId && !colony.isTestEnemy) {
      this._drawStationDialog(ctx, ox, oy, ow, oh, colony);
    }

    // Landing mode indicator
    if (this._landingMode) {
      const t = Date.now() / 1000;
      const pulse = (Math.sin(t * 3) + 1) / 2;
      ctx.fillStyle = `rgba(0, 200, 160, ${0.08 + pulse * 0.06})`;
      ctx.fillRect(ox, oy + HDR_H, ow, 22);
      ctx.font = `bold 11px ${THEME.fontFamily}`;
      ctx.fillStyle = `rgba(0, 255, 180, ${0.7 + pulse * 0.3})`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🤖 WYBIERZ HEX LĄDOWANIA — kliknij na mapie', ox + ow / 2, oy + HDR_H + 11);
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
    if (colony && !colony.ownerEmpireId && !colony.isTestEnemy) {
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

    // Zamknij [X]
    const closeX = ox + ow - 24;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
    ctx.fillText('✕', closeX, oy + 20);
    this._addHit(closeX - 4, oy + 6, 22, 22, 'close');
  }

  // ── Nagłówek (standard: BaseOverlay._drawOverlayHeader — pasmo 44 + tytuł + linia) ──
  _drawHeader(ctx, ox, oy, ow, colony) {
    if (!colony) {
      this._drawOverlayHeader(ctx, ox, oy, ow, 'Brak kolonii');
      return;
    }

    // Rząd 1: nazwa planety jako tytuł (bold accent przez helper)
    const name = colony.planet?.name ?? colony.planetId ?? '?';
    this._drawOverlayHeader(ctx, ox, oy, ow, name);

    // Podsumowanie + lista budynków
    const civ = colony.civSystem;
    const pop = civ?.population ?? 0;
    const housing = civ?.housing ?? 0;

    // Zlicz budynki per typ
    const buildingSummary = {};
    let totalBuildings = 0;
    if (colony.buildingSystem?._active) {
      for (const [key, entry] of colony.buildingSystem._active) {
        if (key.startsWith('capital_')) continue;
        const bid = entry.building?.id;
        if (!bid) continue;
        buildingSummary[bid] = (buildingSummary[bid] ?? 0) + 1;
        totalBuildings++;
      }
    }

    // Stats — druga linia w paśmie nagłówka
    const row2Y = oy + 34;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `11px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'left';
    let sx = ox + 14;
    ctx.fillText(`POP: ${pop}/${housing}`, sx, row2Y);
    sx += 90;

    // Mini ikony budynków (kompaktowe) z hit zones na tooltip
    for (const [bid, count] of Object.entries(buildingSummary)) {
      const b = BUILDINGS[bid];
      if (!b) continue;
      const label = `${b.icon ?? '?'}${count > 1 ? '×' + count : ''}`;
      ctx.fillStyle = CAT_COLORS[b.category] ?? THEME.textPrimary;
      ctx.fillText(label, sx, row2Y);
      const labelW = ctx.measureText(label).width;
      // Hit zone na ikonę budynku (tooltip)
      this._addHit(sx, oy + 24, labelW + 4, HDR_H - 26, 'headerBuilding', { buildingId: bid, count });
      sx += labelW + 6;
      if (sx > ox + ow - 122) { ctx.fillText('...', sx, row2Y); break; }
    }

    if (totalBuildings === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Brak budynków', sx, row2Y);
    }
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
      const icon = b?.icon ?? (tile.capitalBase ? '🏛' : '');
      if (icon && r > 10) {
        ctx.font = `${Math.max(8, Math.round(r * 0.65))}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(icon, cx, cy);
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
      // Produkcja (header + entries)
      const tileKey = `${tile.q},${tile.r}`;
      const aEntry = colony?.buildingSystem?._active?.get(tileKey);
      const rates = aEntry?.effectiveRates ?? aEntry?.baseRates ?? b.rates;
      const baseRates = b.rates ?? {};
      // Liczbę widocznych linii: efektywne != 0 + bazowe > 0 które wypadły na 0
      const shownCount = Object.keys(rates).filter(k => rates[k] !== 0).length;
      const zeroedCount = Object.keys(baseRates).filter(k => baseRates[k] > 0 && !(rates[k] > 0 || rates[k] < 0)).length;
      if (rates) h += 13 + (shownCount + zeroedCount) * 14;
      // Maintenance
      if (b.maintenance && Object.keys(b.maintenance).length > 0) h += 13 + Object.keys(b.maintenance).length * 14;
      if (b.energyCost) h += 14;
      if (b.popCost) h += 14;
      if (b.housing) h += 14;
      h += 8 + 28 + 6; // separator + buttons
      if (b.maxLevel && (tile.buildingLevel ?? 1) < b.maxLevel) h += 28;
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

    // Ogranicz max wysokość panelu do 70% viewport
    const canvas = document.getElementById('ui-canvas');
    const maxPanelH = canvas ? (canvas.height / _UI_SCALE) * 0.65 : 500;
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

      if (rates) {
        ctx.font = `10px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('Produkcja/rok:', x + 8, cy); cy += 13;
        ctx.font = `11px ${THEME.fontFamily}`;

        // Pokaż bazowe stawki (z rates budynku) — aby widać co POWINNO być produkowane
        const baseRates = b.rates ?? {};
        const shownKeys = new Set();
        for (const [res, rate] of Object.entries(rates)) {
          if (rate === 0) continue;
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

      // Energia
      if (b.energyCost) {
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(`⚡ -${b.energyCost} energy/rok`, x + 8, cy); cy += 14;
      }

      // POP
      if (b.popCost) {
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(`👤 ${b.popCost} POP`, x + 8, cy); cy += 14;
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
        this._addHit(x + 8, cy, FLOAT_W - 16, 24, 'upgrade');
        cy += 28;
      }
      this._drawBtn(ctx, '🗑 Rozbiórka', x + 8, cy, FLOAT_W - 16, 24, '#6e1a1a');
      this._addHit(x + 8, cy, FLOAT_W - 16, 24, 'demolish');

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

      for (const bid of available) {
        const bd = BUILDINGS[bid];
        if (!bd) continue;
        const rowH = 22;

        // Pomiń jeśli daleko poza widokiem
        if (cy + rowH < listTop - 50 || cy > listBot + 50) { cy += rowH + 2; continue; }

        const canAfford = this._canAfford(colony, bd);
        const isHov = this._hoveredBuildId === bid;

        ctx.fillStyle = isHov ? 'rgba(0,255,180,0.12)' : 'rgba(6,12,20,0.5)';
        ctx.fillRect(x + 6, cy, FLOAT_W - 12, rowH);
        ctx.strokeStyle = canAfford ? (CAT_COLORS[bd.category] ?? '#446') : '#442222';
        ctx.lineWidth = isHov ? 1.5 : 0.5;
        ctx.strokeRect(x + 6, cy, FLOAT_W - 12, rowH);

        ctx.font = `11px ${THEME.fontFamily}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = canAfford ? '#ddd' : '#666';
        ctx.fillText(`${bd.icon ?? '?'} ${bd.namePL ?? bd.id}`, x + 10, cy + rowH / 2);

        // Hit zone tylko dla widocznych elementów wewnątrz listy
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

  _getAvailableBuildings(tile) {
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

    const result = Object.values(BUILDINGS)
      .filter(b => {
        if (!b.id || b.isCapital) return false;
        if (b.requires && techSys && !techSys.isResearched(b.requires)) return false;
        // Faza D2b: budynek-prereq (np. heritage_dome wymaga mission_archive)
        if (b.requiresBuilding && activeBuildingsMap) {
          let found = false;
          for (const entry of activeBuildingsMap.values()) {
            if (entry.building?.id === b.requiresBuilding) { found = true; break; }
          }
          if (!found) return false;
        }
        // Faza C5: gating frakcyjny — ukryj budynki kulturowe gdy frakcje zablokowane
        if (b.requiresFactionUnlocked || b.factionGating) {
          if (!facSys || facSys.isLocked) return false;
          if (b.factionGating) {
            const slider = facSys.slider ?? 50;
            const { slider: op, value } = b.factionGating;
            if (op === '>'  && !(slider >  value)) return false;
            if (op === '<'  && !(slider <  value)) return false;
            if (op === '>=' && !(slider >= value)) return false;
            if (op === '<=' && !(slider <= value)) return false;
          }
        }
        if (b.terrainAny) return true;
        if (b.terrainOnly) return b.terrainOnly.includes(tile.type);
        return terrain.allowedCategories?.includes(b.category) ?? false;
      })
      .map(b => b.id);
    return result;
  }

  _canAfford(colony, building) {
    if (!colony?.resourceSystem) return false;
    const res = colony.resourceSystem;
    for (const [key, amount] of Object.entries(building.cost ?? {})) {
      if ((res.getAmount?.(key) ?? res.inventory?.get(key) ?? 0) < amount) return false;
    }
    for (const [key, amount] of Object.entries(building.commodityCost ?? {})) {
      if ((res.inventory?.get(key) ?? 0) < amount) return false;
    }
    return true;
  }

  // Zwraca listę brakujących zasobów/commodities do budowy
  _getMissing(colony, building) {
    const res = colony?.resourceSystem;
    if (!res) return [];
    const missing = [];
    for (const [key, amount] of Object.entries(building.cost ?? {})) {
      const have = res.getAmount?.(key) ?? res.inventory?.get(key) ?? 0;
      if (have < amount) {
        const icon = RESOURCE_ICONS[key] ?? '';
        missing.push(`${amount - have}${icon}${key}`);
      }
    }
    for (const [key, amount] of Object.entries(building.commodityCost ?? {})) {
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
  _getMapBounds() {
    const canvas = document.getElementById('ui-canvas');
    if (!canvas) return null;
    const W = canvas.width / _UI_SCALE, H = canvas.height / _UI_SCALE;
    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    return { ox, oy: oy + HDR_H, ow, oh: oh - HDR_H };
  }

  _screenToTile(sx, sy, grid) {
    if (!grid) return null;
    const b = this._getMapBounds();
    if (!b) return null;
    const cx = b.ox + b.ow / 2 - this._camX;
    const cy = b.oy + b.oh / 2 - this._camY;
    return grid.pixelToTile(sx - cx, sy - cy, this._hexSize);
  }

  // ── Input ────────────────────────────────────────────────────────────────
  handleClick(x, y) {
    if (!this.visible) return false;

    // Sprawdź czy klik jest w overlay bounds
    const canvas = document.getElementById('ui-canvas');
    if (canvas) {
      const W = canvas.width / _UI_SCALE, H = canvas.height / _UI_SCALE;
      const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
      // Klik POZA overlay → przepuść do reszty UI (tempo, lewy panel, itp.)
      if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;
    }

    const hit = this._hitTest(x, y);
    if (hit) { this._onHit(hit); return true; }

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
      case 'floatPanel': break;  // konsumuj klik — nie przebijaj na mapę
      case 'headerBuilding': break;  // konsumuj klik na ikonę budynku w nagłówku
      case 'stationDialogBg': break; // konsumuj klik w tło dialogu stacji
      case 'station_open':
        if (zone.data?.hasTech) this._stationDialogOpen = !this._stationDialogOpen;
        else this._showFlash('🔒 ' + t('station.requiresTech'));
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
      case 'demolish':
        if (tile) EventBus.emit('planet:demolishRequest', { tile });
        break;
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
        if (bd.popCost) html += `<br>👤 ${bd.popCost} POP/szt`;
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
        // Koszt surowców
        if (bd.cost) {
          html += '<br>Koszt: ' + Object.entries(bd.cost).map(([k, v]) => {
            const have = res?.getAmount?.(k) ?? res?.inventory?.get(k) ?? 0;
            const color = have >= v ? '#8f8' : '#f66';
            return `<span style="color:${color}">${k}:${v}</span>`;
          }).join(' ');
        }
        // Koszt commodities
        if (bd.commodityCost && Object.keys(bd.commodityCost).length > 0) {
          const parts = Object.entries(bd.commodityCost).map(([k, v]) => {
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
        if (bd.rates) {
          html += '<br>' + Object.entries(bd.rates).map(([k, v]) =>
            `<span style="color:${v > 0 ? '#8f8' : '#f88'}">${v > 0 ? '+' : ''}${v} ${k}</span>`
          ).join(' ');
        }
        if (bd.popCost) html += `<br>👤 ${bd.popCost} POP`;
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

    // Kursor poza overlay bounds → przepuść scroll
    const bounds = this._getMapBounds();
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
