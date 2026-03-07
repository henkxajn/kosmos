// PlanetGlobeScene — widok 3D globusa planety z panelami 4X
//
// Odpowiednik PlanetScene (hex 2D), ale z globem 3D w centrum.
// Panele UI rysowane na #planet-canvas (Canvas 2D) — identyczne z PlanetScene.
// Globus 3D renderowany przez PlanetGlobeRenderer na osobnym WebGL canvasie.
//
// Lifecycle: open(planet, prevMultiplierIndex) → [interakcja] → _close()
// Input: event-layer (z-index 6) przechwytuje wszystko, scena decyduje
//        co przekazać do paneli, a co do globusa.

import EventBus              from '../core/EventBus.js';
import { HexGrid }           from '../map/HexGrid.js';
import { TERRAIN_TYPES }     from '../map/HexTile.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { BUILDINGS, RESOURCE_ICONS, formatRates, formatCost } from '../data/BuildingsData.js';
import { showRenameModal } from '../ui/ModalInput.js';
import { TECHS }             from '../data/TechData.js';
import { PlanetGlobeRenderer } from '../renderer/PlanetGlobeRenderer.js';
import { PlanetGlobeTexture } from '../renderer/PlanetGlobeTexture.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { GLOBE }         from '../config/LayoutConfig.js';
import { TopBar }        from '../ui/TopBar.js';

// ── Stałe layoutu (z LayoutConfig — spójne z nowym UI) ────────
const TOP_BAR_H    = GLOBE.TOP_BAR_H;     // 50
const HEADER_H     = TOP_BAR_H;           // 50 (TopBar zastępuje TopBar+ResourceBar)
const BOTTOM_BAR_H = GLOBE.BOTTOM_BAR_H;  // 44
const LEFT_W       = GLOBE.LEFT_W;        // 240
const RIGHT_W      = GLOBE.RIGHT_W;       // 220

const W = window.innerWidth;
const H = window.innerHeight;
const PS_SCALE = Math.min(W / 1280, H / 720);
const LW = Math.round(W / PS_SCALE);
const LH = Math.round(H / PS_SCALE);

// Kolory kategorii budynków
const CAT_COLORS = {
  mining:     '#cc9944',
  energy:     '#ffdd44',
  food:       '#44cc66',
  population: '#4488ff',
  research:   '#cc66ff',
  space:      '#8888ff',
  military:   '#ff6644',
};

// Kolory zasobów strategicznych
const STRAT_COLORS = { U: '#88ff44', Au: '#ffdd44', Pt: '#aaddff', H2O: '#44aaff', He: '#ff88cc' };

export class PlanetGlobeScene {
  constructor(planetCanvas, timeSystem) {
    this.canvas     = planetCanvas;
    this.ctx        = planetCanvas.getContext('2d');
    this.timeSystem = timeSystem;
    this.isOpen     = false;
    this.planet     = null;
    this.grid       = null;

    this._hoveredTile  = null;
    this._selectedTile = null;
    this._resources    = {};
    this._inventory    = {};  // pełne inventory z ResourceSystem
    this._prevMultiplierIndex = 1;

    // Panel budowania
    this._buildPanelTile   = null;
    this._buildPanelScrollY = 0;
    this._buildPanelMouseX = -1;  // pozycja kursora w panelu budowania (do tooltip)
    this._buildPanelMouseY = -1;
    this._buildPanelTab    = 'build'; // 'build' | 'deploy'
    this._deployBtns       = [];     // hit areas dla przycisków deploy

    // Stan kontrolek czasu
    this._timeState = { isPaused: true, multiplierIndex: 1, displayText: '' };

    // TopBar (nowy komponent zasobów + czas)
    this._topBar = new TopBar();
    this._invPerYear  = {};
    this._energyFlow  = {};

    // PlanetGlobeRenderer (tworzony w open)
    this._globeRenderer = null;

    this.uiManager = null; // referencja ustawiana przez GameScene

    // Toggle siatki hex (domyślnie OFF — czysty PBR)
    this._showGrid = false;

    // Drag kamery — stan
    this._isDragging = false;
    this._lastDragX  = 0;
    this._lastDragY  = 0;

    // Eventy (do cleanup)
    this._onKeyDown        = null;
    this._onMouseDown      = null;
    this._onMouseMove      = null;
    this._onMouseUp        = null;
    this._onClick          = null;
    this._onWheel          = null;
    this._onBuildResult    = null;
    this._onDemolishResult = null;
    this._onUpgradeResult  = null;
    this._onResourceChange = null;
    this._onSnapshot       = null;
    this._onTimeState      = null;
    this._onTimeDisplay    = null;

    // Komunikat flash (błąd budowy/ulepszenia)
    this._flashMsg     = null;   // tekst
    this._flashEnd     = 0;      // timestamp zakończenia

    // Pętla rysowania
    this._animFrameId = null;
  }

  // ── Otwiera scenę 3D globusa ──────────────────────────────────

  open(planet, prevMultiplierIndex = 1) {
    this.planet              = planet;
    this._prevMultiplierIndex = prevMultiplierIndex;
    this.isOpen              = true;
    this._hoveredTile        = null;
    this._selectedTile       = null;
    this._buildPanelTile     = null;
    this._buildPanelScrollY  = 0;
    this._isDragging         = false;
    this._showGrid           = false;

    // Flaga: UIManager NIE rysuje CivPanel (rysuje PlanetGlobeScene)
    if (window.KOSMOS) window.KOSMOS.planetGlobeOpen = true;

    // Przełącz aktywną kolonię w ColonyManager
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr) {
      colMgr.switchActiveColony(planet.id);
    }

    // Zachowaj prędkość gry (bez wymuszania zwolnienia)

    // Generuj siatkę
    this.grid = PlanetMapGenerator.generate(planet, true);

    // Ustaw gridHeight i deposits w BuildingSystem
    if (window.KOSMOS?.buildingSystem) {
      window.KOSMOS.buildingSystem._gridHeight = this.grid.height;
      window.KOSMOS.buildingSystem.setDeposits(planet.deposits ?? []);
    }

    // Synchronizuj budynki z BuildingSystem (pełny sync: id + level + capital + underConstruction)
    this._syncBuildingIds();

    const bSys = window.KOSMOS?.buildingSystem;

    // Auto-place Stolicy przy pierwszym otwarciu mapy (pomiń outpost)
    const colony = window.KOSMOS?.colonyManager?.getColony(planet.id);
    const isOutpost = colony?.isOutpost ?? false;
    // Stolica potrzebna: nowa kolonia (brak budynków) LUB upgraded outpost (budynki są, ale brak stolicy)
    let hasCapital = false;
    if (bSys) {
      for (const key of bSys._active.keys()) {
        if (key.startsWith('capital_')) { hasCapital = true; break; }
      }
    }
    const needsCapital = bSys && window.KOSMOS?.civMode && !isOutpost && !hasCapital;
    if (needsCapital) {
      const baseTile = this._findColonyBaseTile();
      if (baseTile) {
        EventBus.emit('planet:buildRequest', { tile: baseTile, buildingId: 'colony_base' });
      }
    }

    // Outpost: auto-select zakładka ZAINSTALUJ
    if (isOutpost) this._buildPanelTab = 'deploy';

    // Ustaw rozdzielczość canvas
    this.canvas.width  = W;
    this.canvas.height = H;
    this.canvas.style.display = 'block';

    // Event-layer nad globem (z-index 6 > globe canvas 5)
    const layer = document.getElementById('event-layer');
    if (layer) layer.style.zIndex = '6';

    // ── PlanetGlobeRenderer — globus w centrum ─────────────────
    const globeBounds = {
      x: LEFT_W * PS_SCALE,
      y: HEADER_H * PS_SCALE,
      w: (LW - LEFT_W - RIGHT_W) * PS_SCALE,
      h: (LH - HEADER_H - BOTTOM_BAR_H) * PS_SCALE,
    };

    this._globeRenderer = new PlanetGlobeRenderer();
    this._globeRenderer.open(planet, this.grid, globeBounds, true);

    // Obróć globus na stolicę (jeśli istnieje)
    this._focusOnCapital();

    // Callbacki z globusa
    this._globeRenderer.onTileHover = (tile) => {
      this._hoveredTile = tile;
    };
    this._globeRenderer.onTileClick = (tile) => {
      // Obsługiwane przez _onClick (nie tutaj — klik przechodzi przez event-layer)
    };

    // Eventy
    this._registerEvents(layer);

    // Żądaj snapshot surowców
    EventBus.emit('resource:requestSnapshot');

    // Start pętli rysowania paneli
    this._startDrawLoop();
  }

  // ── Zamknij scenę (publiczny alias) ────────────────────────────
  close() { this._close(); }

  // ── Zamknij scenę ──────────────────────────────────────────────

  _close() {
    this.isOpen = false;
    this.canvas.style.display = 'none';
    if (window.KOSMOS) window.KOSMOS.planetGlobeOpen = false;

    const layer = document.getElementById('event-layer');
    if (layer) layer.style.zIndex = '3';

    // Zamknij globus
    if (this._globeRenderer) {
      this._globeRenderer.close();
      this._globeRenderer = null;
    }

    // Usuń eventy
    this._unregisterEvents(layer);

    // Zatrzymaj pętlę rysowania
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }

    // Prędkość czasu zachowana (bez zmian przy wyjściu)
  }

  // ── Rejestracja eventów ────────────────────────────────────────

  _registerEvents(layer) {
    this._onKeyDown = (e) => {
      if (e.code === 'Escape') this._close();
    };
    document.addEventListener('keydown', this._onKeyDown);

    // ── Mouse: event-layer przechwytuje WSZYSTKO ──────────────
    // Scena decyduje: panele vs globus

    this._onMouseDown = (e) => {
      if (e.button !== 0) return;
      const mx = e.clientX / PS_SCALE;
      const my = e.clientY / PS_SCALE;

      // Klik w panelach → nie drag
      if (this._isInPanel(mx, my)) return;

      // Klik w obszarze globusa → rozpocznij drag kamery
      this._isDragging = true;
      this._lastDragX  = e.clientX;
      this._lastDragY  = e.clientY;
      this._globeRenderer?.cameraCtrl?.startDrag(e.clientX, e.clientY);
    };

    this._onMouseMove = (e) => {
      if (this._isDragging) {
        // Drag kamery
        this._globeRenderer?.cameraCtrl?.applyDrag(e.clientX, e.clientY);
        this._lastDragX = e.clientX;
        this._lastDragY = e.clientY;
        return;
      }

      const mx = e.clientX / PS_SCALE;
      const my = e.clientY / PS_SCALE;

      // TopBar hover (tooltip zasobów)
      this._topBar.updateHover(mx, my);

      if (this._isInPanel(mx, my)) {
        // W panelach → brak hover na globusie
        if (this._hoveredTile !== null) {
          this._hoveredTile = null;
          this._globeRenderer?.handleExternalMouseMove(-9999, -9999); // poza ekranem
        }
        // Śledź pozycję kursora w panelu budowania (do tooltip)
        const BPX = LW - RIGHT_W;
        if (this._buildPanelTile && mx >= BPX) {
          this._buildPanelMouseX = mx;
          this._buildPanelMouseY = my;
        } else {
          this._buildPanelMouseX = -1;
          this._buildPanelMouseY = -1;
        }
        layer.style.cursor = 'default';
        return;
      }
      // Kursor poza panelami — reset hover budowania
      this._buildPanelMouseX = -1;
      this._buildPanelMouseY = -1;
      // Reset tooltipa CivPanel
      if (this.uiManager) this.uiManager._tooltip = null;

      // W obszarze globusa → raycasting
      this._globeRenderer?.handleExternalMouseMove(e.clientX, e.clientY);
      layer.style.cursor = this._hoveredTile ? 'pointer' : 'default';
    };

    this._onMouseUp = (e) => {
      if (this._isDragging) {
        this._globeRenderer?.cameraCtrl?.endDrag(e.clientX, e.clientY);
        this._isDragging = false;
      }
    };

    this._onClick = (e) => {
      const mx = e.clientX / PS_SCALE;
      const my = e.clientY / PS_SCALE;

      // Panele UI — działają zawsze (wasDrag nie blokuje)
      if (this._hitTestClose(mx, my))      return;
      if (this._hitTestTimeBar(mx, my))    return;
      if (this._hitTestBuildPanel(mx, my)) return;
      if (this._hitTestLeftPanel(mx, my))  return;

      // Klik w globus — sprawdź wasDrag (drag kamery = nie klikaj hexa)
      if (this._globeRenderer?.cameraCtrl?.wasDrag) return;

      // Klik w obszarze globusa → raycasting
      if (!this._isInPanel(mx, my)) {
        const tile = this._globeRenderer?._raycastToTile(e.clientX, e.clientY);
        if (tile) {
          this._selectedTile   = tile;
          this._buildPanelTile = tile;
          this._buildPanelScrollY = 0;
          this._buildPanelTab    = 'build';
        } else {
          this._selectedTile   = null;
          this._buildPanelTile = null;
        }
        this._globeRenderer?.setSelectedTile(this._selectedTile);
      }
    };

    this._onWheel = (e) => {
      const mx = e.clientX / PS_SCALE;
      const my = e.clientY / PS_SCALE;
      // Scroll w prawym panelu budynków
      if (this._buildPanelTile && mx > LW - RIGHT_W && my > HEADER_H && my < LH - BOTTOM_BAR_H) {
        this._buildPanelScrollY = Math.max(0, this._buildPanelScrollY + e.deltaY * 0.5);
        e.preventDefault();
        return;
      }
      if (!this._isInPanel(mx, my)) {
        e.preventDefault();
        this._globeRenderer?.cameraCtrl?.applyZoom(e.deltaY);
      }
    };

    // Build/Demolish results
    this._onBuildResult = ({ success, reason }) => {
      if (success) {
        this._syncBuildingIds();
        this._globeRenderer?.refreshTexture();
      } else if (reason) {
        this._flashMsg = reason;
        this._flashEnd = Date.now() + 2500;
      }
    };

    this._onDemolishResult = ({ success, reason }) => {
      if (success) {
        this._syncBuildingIds();
        this._globeRenderer?.refreshTexture();
      } else if (reason) {
        this._flashMsg = reason;
        this._flashEnd = Date.now() + 2500;
      }
    };

    this._onUpgradeResult = ({ success, reason }) => {
      if (success) {
        this._syncBuildingIds();
        this._globeRenderer?.refreshTexture();
      } else if (reason) {
        this._flashMsg = reason;
        this._flashEnd = Date.now() + 2500;
      }
    };

    // Resources — nowy model inventory (rozszerzony o perYear/energyFlow dla TopBar)
    const applyRes = ({ resources, inventory }) => {
      if (resources) {
        for (const [k, v] of Object.entries(resources)) {
          this._resources[k] = v.amount ?? 0;
        }
      }
      if (inventory) {
        this._inventory = inventory;
        // Preferuj obserwowane delty (uwzględniają mining + receive + spend)
        if (inventory._observedPerYear && Object.keys(inventory._observedPerYear).length > 0) {
          this._invPerYear = { ...inventory._observedPerYear };
        } else if (inventory._perYear) {
          this._invPerYear = { ...inventory._perYear };
        }
        if (inventory._energy) {
          this._energyFlow = { ...inventory._energy };
        }
      }
    };
    this._onResourceChange = applyRes;
    this._onSnapshot       = applyRes;

    // Czas
    this._onTimeState = ({ isPaused, multiplierIndex }) => {
      this._timeState.isPaused        = isPaused;
      this._timeState.multiplierIndex = multiplierIndex;
    };
    this._onTimeDisplay = ({ displayText, multiplierIndex }) => {
      this._timeState.displayText     = displayText;
      this._timeState.multiplierIndex = multiplierIndex;
    };

    // Zamknięcie globusa z EventBus (np. klik w katalogu ciał)
    this._onCloseGlobe = () => { if (this.isOpen) this._close(); };

    // Budowa zakończona — resync widoku
    this._onConstructionComplete = ({ tileKey }) => {
      this._syncBuildingIds();
      this._globeRenderer?.refreshTexture();
    };

    // Postęp budowy — aktualizuj progress na tile'ach (pasek progresu + overlay)
    this._onConstructionProgress = () => {
      if (!this.grid) return;
      const bSys = window.KOSMOS?.buildingSystem;
      if (!bSys?._constructionQueue) return;
      let anyUpdate = false;
      bSys._constructionQueue.forEach((entry, tileKey) => {
        const [q, r] = tileKey.split(',').map(Number);
        const tile = this.grid.get(q, r);
        if (tile?.underConstruction) {
          tile.underConstruction.progress = entry.progress;
          anyUpdate = true;
        }
      });
      // Odśwież overlay globusa aby zaktualizować markery budowy
      if (anyUpdate) this._globeRenderer?.refreshTexture();
    };

    // Podpięcie
    if (layer) {
      layer.addEventListener('mousedown',  this._onMouseDown);
      layer.addEventListener('mousemove',  this._onMouseMove);
      layer.addEventListener('mouseup',    this._onMouseUp);
      layer.addEventListener('click',      this._onClick);
      layer.addEventListener('wheel',      this._onWheel, { passive: false });
    }
    EventBus.on('planet:buildResult',    this._onBuildResult);
    EventBus.on('planet:demolishResult', this._onDemolishResult);
    EventBus.on('planet:upgradeResult',  this._onUpgradeResult);
    EventBus.on('resource:changed',     this._onResourceChange);
    EventBus.on('resource:snapshot',    this._onSnapshot);
    EventBus.on('time:stateChanged',    this._onTimeState);
    EventBus.on('time:display',         this._onTimeDisplay);
    EventBus.on('planet:closeGlobe',    this._onCloseGlobe);
    EventBus.on('planet:constructionComplete', this._onConstructionComplete);
    EventBus.on('planet:constructionProgress', this._onConstructionProgress);
  }

  _unregisterEvents(layer) {
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
    if (layer) {
      if (this._onMouseDown) layer.removeEventListener('mousedown', this._onMouseDown);
      if (this._onMouseMove) layer.removeEventListener('mousemove', this._onMouseMove);
      if (this._onMouseUp)   layer.removeEventListener('mouseup',   this._onMouseUp);
      if (this._onClick)     layer.removeEventListener('click',     this._onClick);
      if (this._onWheel)     layer.removeEventListener('wheel',     this._onWheel);
    }
    EventBus.off('planet:buildResult',    this._onBuildResult);
    EventBus.off('planet:demolishResult', this._onDemolishResult);
    EventBus.off('planet:upgradeResult',  this._onUpgradeResult);
    EventBus.off('resource:changed',     this._onResourceChange);
    EventBus.off('resource:snapshot',    this._onSnapshot);
    EventBus.off('time:stateChanged',    this._onTimeState);
    EventBus.off('time:display',         this._onTimeDisplay);
    EventBus.off('planet:closeGlobe',    this._onCloseGlobe);
    EventBus.off('planet:constructionComplete', this._onConstructionComplete);
    EventBus.off('planet:constructionProgress', this._onConstructionProgress);
  }

  // ── Synchronizacja budynków z BuildingSystem ──────────────────

  _syncBuildingIds() {
    if (!this.grid) return;
    const bSys = window.KOSMOS?.buildingSystem;
    if (!bSys) return;

    // Wyczyść stan przed synchronizacją
    this.grid.toArray().forEach(t => {
      t.buildingId = null;
      t.buildingLevel = 1;
      t.capitalBase = false;
      t.underConstruction = null;
    });

    // Ustaw buildingId / capitalBase / buildingLevel z _active
    bSys._active.forEach((entry, activeKey) => {
      // Stolica: klucz 'capital_Q,R' → ustaw capitalBase na tile
      if (activeKey.startsWith('capital_')) {
        const coordKey = activeKey.replace('capital_', '');
        const [q, r] = coordKey.split(',').map(Number);
        const tile = this.grid.get(q, r);
        if (tile) tile.capitalBase = true;
        return;
      }
      // Zwykły budynek
      const [q, r] = activeKey.split(',').map(Number);
      const tile = this.grid.get(q, r);
      if (tile) {
        tile.buildingId = entry.building.id;
        tile.buildingLevel = entry.level ?? 1;
      }
    });

    // Sync underConstruction z kolejki budowy
    if (bSys._constructionQueue) {
      bSys._constructionQueue.forEach((entry, tileKey) => {
        const [q, r] = tileKey.split(',').map(Number);
        const tile = this.grid.get(q, r);
        if (tile) {
          tile.underConstruction = {
            buildingId: entry.buildingId,
            progress:   entry.progress,
            buildTime:  entry.buildTime,
            isUpgrade:  entry.isUpgrade,
          };
        }
      });
    }
  }

  // ── Sprawdzenie czy punkt w panelach ──────────────────────────

  _isInPanel(mx, my) {
    // Top bar + resource bar
    if (my < HEADER_H) return true;
    // Bottom bar
    if (my > LH - BOTTOM_BAR_H) return true;
    // Left panel
    if (mx < LEFT_W) return true;
    // Right panel (gdy aktywny)
    if (this._buildPanelTile && mx > LW - RIGHT_W) return true;
    return false;
  }

  // ── Szukanie miejsca na Bazę Kolonijną ────────────────────────

  _findColonyBaseTile() {
    if (!this.grid) return null;
    const w = this.grid.width;
    const h = this.grid.height;
    const centerQ = Math.floor(w / 2);
    const centerR = Math.floor(h / 2);
    const centerTile = this.grid.getOffset(centerQ, centerR);

    const preferred = ['plains', 'forest', 'desert', 'tundra'];
    const maxRadius = Math.max(w, h);

    for (const prefType of preferred) {
      if (centerTile && centerTile.type === prefType && !centerTile.isOccupied) {
        const terrain = TERRAIN_TYPES[centerTile.type];
        if (terrain?.buildable) return centerTile;
      }
      for (let radius = 1; radius <= maxRadius; radius++) {
        const ring = this.grid.ring(centerTile?.q ?? 0, centerTile?.r ?? 0, radius);
        for (const tile of ring) {
          if (tile.type === prefType && !tile.isOccupied) {
            const terrain = TERRAIN_TYPES[tile.type];
            if (terrain?.buildable) return tile;
          }
        }
      }
    }

    if (centerTile && !centerTile.isOccupied) {
      const terrain = TERRAIN_TYPES[centerTile.type];
      if (terrain?.buildable) return centerTile;
    }
    for (let radius = 1; radius <= maxRadius; radius++) {
      const ring = this.grid.ring(centerTile?.q ?? 0, centerTile?.r ?? 0, radius);
      for (const tile of ring) {
        if (!tile.isOccupied) {
          const terrain = TERRAIN_TYPES[tile.type];
          if (terrain?.buildable) return tile;
        }
      }
    }

    return null;
  }

  // ── Obróć kamerę globusa na stolicę ─────────────────────────────

  _focusOnCapital() {
    if (!this.grid || !this._globeRenderer?.cameraCtrl) return;

    // Znajdź tile ze stolicą
    let capitalTile = null;
    this.grid.forEach(tile => {
      if (tile.capitalBase) capitalTile = tile;
    });
    if (!capitalTile) return;

    // Hex → piksel → UV (0..1) na teksturze equirectangular
    const hexSize = PlanetGlobeTexture.calcHexSize(this.grid);
    const gridPx  = this.grid.gridPixelSize(hexSize);
    const center  = HexGrid.hexToPixel(capitalTile.q, capitalTile.r, hexSize);
    const u = center.x / gridPx.w;  // 0..1 poziomo
    const v = center.y / gridPx.h;  // 0..1 pionowo

    // UV → sferyczne (yaw, pitch) — Three.js SphereGeometry mapping
    // Three.js phi: uv.x=0→phi=0 (-X), uv.x=0.25→phi=π/2 (+Z), uv.x=0.5→phi=π (+X)
    // Kamera yaw=0 patrzy na +Z = uv.x=0.25
    const yaw   = (u - 0.25) * 2 * Math.PI;
    const pitch = Math.max(-1.0, Math.min(1.0, (0.5 - v) * Math.PI));

    this._globeRenderer.cameraCtrl.setYawPitch(yaw, pitch);
  }

  // ── Pętla rysowania paneli ─────────────────────────────────────

  _startDrawLoop() {
    const draw = () => {
      if (!this.isOpen) return;
      try {
        this._draw();
      } catch (err) {
        console.error('[PlanetGlobeScene] Błąd w pętli rysowania:', err);
      }
      this._animFrameId = requestAnimationFrame(draw);
    };
    this._animFrameId = requestAnimationFrame(draw);
  }

  _draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(PS_SCALE, 0, 0, PS_SCALE, 0, 0);
    ctx.clearRect(0, 0, LW, LH);

    // Tło pod panelami (nie pod globem — ten ma własny WebGL canvas)
    // Top area
    ctx.fillStyle = 'rgba(2,4,5,0.96)';
    ctx.fillRect(0, 0, LW, HEADER_H);
    // Bottom area
    ctx.fillRect(0, LH - BOTTOM_BAR_H, LW, BOTTOM_BAR_H);
    // Left panel
    ctx.fillRect(0, HEADER_H, LEFT_W, LH - HEADER_H - BOTTOM_BAR_H);
    // Right panel (zawsze wypełniony tłem — globus go nie zakrywa)
    ctx.fillRect(LW - RIGHT_W, HEADER_H, RIGHT_W, LH - HEADER_H - BOTTOM_BAR_H);

    // Separator prawego panelu
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(LW - RIGHT_W, HEADER_H); ctx.lineTo(LW - RIGHT_W, LH - BOTTOM_BAR_H); ctx.stroke();

    // Rysuj panele
    this._drawTopBarGlobe();
    this._drawLeftPanel();
    this._drawBottomBar();
    if (this._buildPanelTile) {
      this._drawBuildPanel();
    } else {
      this._buildTooltipVisible = false;
      // Podpowiedź w prawym panelu
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.borderLight;
      ctx.fillText('Kliknij hex', LW - RIGHT_W + 8, HEADER_H + 20);
      ctx.fillText('aby zobaczyć opcje', LW - RIGHT_W + 8, HEADER_H + 34);
    }

    // Flash message (błąd budowy/ulepszenia/rozbiórki)
    if (this._flashMsg && Date.now() < this._flashEnd) {
      const fAlpha = Math.min(1, (this._flashEnd - Date.now()) / 800);
      ctx.globalAlpha = fAlpha;
      const fW = ctx.measureText(this._flashMsg).width + 24;
      const fX = (LW - fW) / 2;
      const fY = HEADER_H + 8;
      ctx.fillStyle = 'rgba(40,10,10,0.92)';
      ctx.fillRect(fX, fY, fW, 22);
      ctx.strokeStyle = '#ff3344';
      ctx.lineWidth = 1;
      ctx.strokeRect(fX, fY, fW, 22);
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = '#ff8888';
      ctx.textAlign = 'center';
      ctx.fillText(this._flashMsg, LW / 2, fY + 15);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    } else if (this._flashMsg && Date.now() >= this._flashEnd) {
      this._flashMsg = null;
    }

    // Tooltip TopBar — na samym wierzchu (po wszystkich panelach)
    if (window.KOSMOS?.civMode) {
      this._topBar.drawTooltip(ctx, LW);
    }

    // Dynamiczny z-index globusa: obniż gdy tooltip lub CivPanel zasłaniałyby canvas 2D
    if (this._globeRenderer?._canvas) {
      const needLower = this._buildTooltipVisible || this._topBar?._tooltip;
      this._globeRenderer._canvas.style.zIndex = needLower ? '3' : '5';
    }

    ctx.restore();
  }

  // ── Górny pasek (TopBar z zasobami + "← Wróć") ────────────────

  _drawTopBarGlobe() {
    const ctx = this.ctx;

    // Szerokość bloku "← Wróć" + nazwa planety
    const BACK_W = 130;

    // TopBar z zasobami + kontrolkami czasu (reuse komponent)
    if (window.KOSMOS?.civMode) {
      this._topBar.draw(ctx, LW, LH, {
        inventory: this._inventory,
        invPerYear: this._invPerYear,
        energyFlow: this._energyFlow,
        resources: this._resources,
        resDelta: this._invPerYear,
        timeState: this._timeState,
        factoryData: this.uiManager?._factoryData,
      }, BACK_W);
    } else {
      // Tryb bez civMode — pusty pasek
      ctx.fillStyle = bgAlpha(0.95);
      ctx.fillRect(0, 0, LW, TOP_BAR_H);
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(0, TOP_BAR_H); ctx.lineTo(LW, TOP_BAR_H); ctx.stroke();
    }

    // Blok "← Wróć" + nazwa planety (na lewo, nad zasobami)
    ctx.fillStyle = 'rgba(2,4,5,0.92)';
    ctx.fillRect(0, 0, BACK_W, TOP_BAR_H);
    ctx.strokeStyle = 'rgba(0,255,180,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(BACK_W, 6); ctx.lineTo(BACK_W, TOP_BAR_H - 6); ctx.stroke();

    ctx.font      = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'left';
    ctx.fillText('← Wróć', 10, 20);

    // Nazwa planety + typ + temperatura (pod przyciskiem)
    if (this.planet) {
      ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      const outpostFlag = window.KOSMOS?.colonyManager?.getColony(this.planet.id)?.isOutpost;
      ctx.fillStyle = outpostFlag ? THEME.warning : THEME.textSecondary;
      const temp = this.planet.temperatureK
        ? ` ${Math.round(this.planet.temperatureK - 273)}°C`
        : '';
      const prefix = outpostFlag ? '🏗 PLACÓWKA — ' : '';
      ctx.fillText(`${prefix}${this.planet.name}${temp} ✏`, 10, 34);
    }

    ctx.textAlign = 'left';
  }

  // ── Lewy panel instalacji ─────────────────────────────────────

  _drawLeftPanel() {
    const ctx  = this.ctx;
    const bSys = window.KOSMOS?.buildingSystem;
    const cSys = window.KOSMOS?.civSystem;

    ctx.fillStyle = bgAlpha(0.88);
    ctx.fillRect(0, HEADER_H, LEFT_W, LH - HEADER_H);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(LEFT_W, HEADER_H); ctx.lineTo(LEFT_W, LH); ctx.stroke();

    // ── Widget POP (ukryty w outpost) ───────────────────────────
    let y = HEADER_H + 6;

    const isOutpostView = window.KOSMOS?.colonyManager?.getColony(this.planet?.id)?.isOutpost;

    if (cSys && !isOutpostView) {
      ctx.font      = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`👤 POP: ${cSys.population} / ${cSys.housing}`, 12, y + 12);
      y += 18;

      const barW = LEFT_W - 24;
      const barH = 5;
      ctx.fillStyle = THEME.bgTertiary;
      ctx.fillRect(12, y, barW, barH);
      const progress = Math.min(1, cSys._growthProgress ?? 0);
      if (progress > 0) {
        ctx.fillStyle = THEME.successDim;
        ctx.fillRect(12, y, Math.round(barW * progress), barH);
      }
      ctx.strokeStyle = THEME.border;
      ctx.strokeRect(12, y, barW, barH);
      y += 10;

      ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      const emp = cSys._employedPops ?? 0;
      const free = cSys.freePops ?? 0;
      ctx.fillText(`Zatrudn: ${emp.toFixed(2)}  Wolni: ${free.toFixed(2)}`, 12, y + 6);
      y += 14;

      const morale = Math.round(cSys.morale ?? 50);
      const moraleColor = morale >= 60 ? THEME.successDim : morale >= 30 ? THEME.warning : THEME.dangerDim;
      ctx.fillStyle = moraleColor;
      ctx.fillText(`Morale: ${morale}%`, 12, y + 6);

      ctx.fillStyle = THEME.purple;
      ctx.fillText(`Epoka: ${cSys.epochName}`, 110, y + 6);
      y += 14;

      if (cSys.isUnrest) {
        ctx.fillStyle = THEME.danger;
        ctx.fillText('⚠ NIEPOKOJE!', 12, y + 6);
        y += 12;
      }
      if (cSys.isFamine) {
        ctx.fillStyle = '#ffcc44';
        ctx.fillText('⚠ GŁÓD!', 12, y + 6);
        y += 12;
      }

      y += 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(LEFT_W - 8, y); ctx.stroke();
      y += 6;
    }

    // ── Lista instalacji ────────────────────────────────────────
    ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.borderLight;
    ctx.fillText('INSTALACJE', 12, y + 12);
    y += 20;

    if (!bSys || bSys._active.size === 0) {
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.borderLight;
      ctx.fillText('Brak instalacji', 12, y + 8);
      return;
    }

    bSys._active.forEach((entry, tileKey) => {
      if (y > LH - 60) return;
      const b = entry.building;
      const lvl = entry.level ?? 1;
      const pop = (entry.popCost ?? 0) * lvl;
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = CAT_COLORS[b.category] || '#888';
      const lvlStr = lvl > 1 ? ` Lv${lvl}` : '';
      ctx.fillText(`${b.icon || '🏗'} ${b.namePL}${lvlStr}`, 12, y + 8);
      ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.borderLight;
      const popStr = pop > 0 ? `  👤${pop}` : '';
      ctx.fillText(`${tileKey}${popStr}`, 12, y + 19);
      y += 26;
    });
  }

  // ── Dolny pasek (44px: info terenu + SIATKA; czas w TopBar) ───

  _drawBottomBar() {
    const ctx = this.ctx;
    const BY  = LH - BOTTOM_BAR_H;

    ctx.fillStyle = bgAlpha(0.90);
    ctx.fillRect(0, BY, LW, BOTTOM_BAR_H);

    ctx.strokeStyle = THEME.border;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, BY); ctx.lineTo(LW, BY); ctx.stroke();

    // ── Wiersz 1: podpowiedź ────────────────────
    ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'left';
    ctx.fillText('Klik: wybierz  |  ESC: wróć', 14, BY + 14);

    // ── Wiersz 2: info terenu (gdy hover) ────────
    if (this._hoveredTile) {
      const t       = this._hoveredTile;
      const terrain = TERRAIN_TYPES[t.type];
      const name    = terrain?.namePL ?? t.type;
      const bldg    = t.buildingId ? BUILDINGS[t.buildingId]?.namePL : null;
      const capital = t.capitalBase ? '🏛 Stolica' : null;

      let info = name;
      if (capital && bldg) info += ` → ${capital} + ${bldg}`;
      else if (capital)    info += ` → ${capital}`;
      else if (bldg)       info += ` → ${bldg}`;

      // Zasoby bazowe terenu (baseYield)
      const by = terrain?.baseYield ?? {};
      const yieldParts = [];
      const RI = { minerals: '⛏', energy: '⚡', organics: '🌿', water: '💧', research: '🔬' };
      for (const [res, val] of Object.entries(by)) {
        if (val) yieldParts.push(`${RI[res] ?? res}${val}`);
      }

      // Modyfikatory produkcji (yieldBonus)
      const yb = terrain?.yieldBonus ?? {};
      const modParts = [];
      for (const [cat, val] of Object.entries(yb)) {
        if (cat === 'default') continue;
        const icon = { mining: '⛏', energy: '⚡', food: '🌿' }[cat] ?? cat;
        modParts.push(`×${val}${icon}`);
      }
      const defVal = yb.default ?? 1.0;
      if (defVal !== 1.0) modParts.push(`×${defVal}`);

      // Debuff polarny
      const gridH = this.grid?.height ?? 0;
      const latMod = gridH > 0 ? HexGrid.getLatitudeModifier(t.r, gridH) : null;
      if (latMod?.label) modParts.push(latMod.label);
      if (latMod && latMod.buildCost !== 1.0) modParts.push(`Budowa×${latMod.buildCost}`);

      // Info terenu
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = THEME.textPrimary;
      const infoX = 200;
      ctx.fillText(info, infoX, BY + 14);

      if (yieldParts.length > 0 || modParts.length > 0) {
        const infoW = ctx.measureText(info).width;
        ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = '#aac8c0';
        const allParts = [...yieldParts, ...modParts].join('  ');
        ctx.fillText(allParts, infoX + infoW + 10, BY + 14);
      }

      // Modyfikatory terenu (wiersz 2)
      if (yieldParts.length > 0) {
        ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(yieldParts.join(' '), infoX, BY + 28);
      }
    }

    // ── Toggle SIATKA (prawy kraniec) ─────────────────
    const gridBtnX = LW - 70;
    const gridBtnY = BY + 3;
    const gridBtnW = 58;
    const gridBtnH = 16;
    ctx.fillStyle   = this._showGrid ? 'rgba(0,255,180,0.13)' : 'rgba(0,255,180,0.04)';
    ctx.fillRect(gridBtnX, gridBtnY, gridBtnW, gridBtnH);
    ctx.strokeStyle = this._showGrid ? THEME.info : THEME.borderLight;
    ctx.lineWidth   = 1;
    ctx.strokeRect(gridBtnX, gridBtnY, gridBtnW, gridBtnH);
    ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = this._showGrid ? THEME.accent : THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText('SIATKA', gridBtnX + gridBtnW / 2, gridBtnY + 12);

    ctx.textAlign = 'left';
  }

  // ── Sortowanie budynków wg dostępności (affordable → unaffordable → blocked) ──

  _getSortedBuildings(tile, tSys, cSys, inv) {
    const result = [];
    for (const b of Object.values(BUILDINGS)) {
      if (b.isColonyBase || b.isCapital) continue;

      let reason = null;
      const terrainDef = TERRAIN_TYPES[tile.type];
      const terrainOk = !terrainDef?.buildable ? false
        : b.terrainOnly ? b.terrainOnly.includes(tile.type)
        : b.terrainAny  ? true
        : terrainDef.allowedCategories.includes(b.category);
      if (!terrainOk) {
        reason = 'Zły teren';
      } else if (b.requires && !tSys?.isResearched(b.requires)) {
        const techName = TECHS[b.requires]?.namePL ?? b.requires;
        reason = `Wymaga: ${techName} (🔬 NAUKA)`;
      } else {
        const resourceOk = Object.entries(b.cost || {}).every(([res, amt]) => (inv[res] ?? 0) >= amt);
        const commodityOk = Object.entries(b.commodityCost || {}).every(([res, amt]) => (inv[res] ?? 0) >= amt);
        const popCost = b.popCost ?? 0.25;
        const isOutpost = window.KOSMOS?.colonyManager?.getColony(this.planet?.id)?.isOutpost;
        const popOk = isOutpost || popCost <= 0 || (cSys && cSys.freePops >= popCost);
        if (!resourceOk || !commodityOk) reason = 'Brak surowców';
        else if (!popOk) reason = 'Brak POPów';
      }

      // Priorytet sortowania: 0 = affordable, 1 = unaffordable, 2 = blocked
      const blocked = reason === 'Zły teren' || (reason && reason.startsWith('Wymaga'));
      const priority = !reason ? 0 : blocked ? 2 : 1;
      result.push({ b, reason, priority });
    }
    result.sort((a, b) => a.priority - b.priority);
    return result;
  }

  // ── Panel budowania (prawy) ───────────────────────────────────

  _drawBuildPanel() {
    const ctx  = this.ctx;
    const tile = this._buildPanelTile;
    if (!tile) return;

    // Reset flagi tooltip (ustawiana w else-branch — building list)
    this._buildTooltipVisible = false;

    const BPX   = LW - RIGHT_W;
    const terrain = TERRAIN_TYPES[tile.type];
    const bSys  = window.KOSMOS?.buildingSystem;
    const tSys  = window.KOSMOS?.techSystem;
    const cSys  = window.KOSMOS?.civSystem;
    const inv   = this._inventory;

    ctx.fillStyle = bgAlpha(0.95);
    ctx.fillRect(BPX, HEADER_H, RIGHT_W, LH - HEADER_H);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(BPX, HEADER_H); ctx.lineTo(BPX, LH); ctx.stroke();

    // Nagłówek pola
    ctx.font      = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(terrain?.namePL ?? tile.type, BPX + 8, HEADER_H + 20);

    if (tile.strategicResource) {
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = STRAT_COLORS[tile.strategicResource] || '#fff';
      ctx.fillText(`Zasób: ${tile.strategicResource}`, BPX + 8, HEADER_H + 34);
    }

    // Złoża na ciele niebieskim (zawsze wyświetlane)
    let buildListY = HEADER_H + 48;
    const deposits = this.planet?.deposits ?? [];
    if (deposits.length > 0) {
      ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText('ZŁOŻA:', BPX + 8, buildListY);
      buildListY += 10;
      for (const d of deposits) {
        const pct = d.totalAmount > 0 ? Math.round(d.remaining / d.totalAmount * 100) : 0;
        const richness = d.richness ?? (d.totalAmount > 0 ? d.remaining / d.totalAmount : 0);
        const icon = RESOURCE_ICONS[d.resourceId] ?? d.resourceId;
        if (pct <= 0) {
          ctx.fillStyle = '#666666';
          ctx.fillText(`${icon} ${d.resourceId}: WYCZERPANE`, BPX + 14, buildListY);
        } else {
          const stars = richness >= 0.7 ? '★★★' : richness >= 0.4 ? '★★' : '★';
          ctx.fillStyle = richness >= 0.7 ? THEME.successDim : richness >= 0.4 ? THEME.warning : THEME.dangerDim;
          ctx.fillText(`${icon} ${d.resourceId}: ${pct}% ${stars}`, BPX + 14, buildListY);
        }
        buildListY += 10;
      }
      buildListY += 4;
    }

    // Stolica (wirtualny budynek — nie blokuje budowy)
    if (tile.capitalBase) {
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.info;
      ctx.fillText('🏛 Stolica', BPX + 8, buildListY);
      buildListY += 14;
    }

    // Budowa w toku — pasek postępu i przycisk anulowania
    if (tile.underConstruction) {
      const uc = tile.underConstruction;
      const ucBuilding = BUILDINGS[uc.buildingId];
      const ucName = ucBuilding?.namePL ?? uc.buildingId;
      const ucIcon = ucBuilding?.icon ?? '🔨';
      const pct = uc.buildTime > 0 ? Math.min(1, uc.progress / uc.buildTime) : 1;
      const remaining = Math.max(0, uc.buildTime - uc.progress);

      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`🔨 ${ucIcon} ${ucName}`, BPX + 8, buildListY);
      buildListY += 12;

      ctx.fillStyle = THEME.textSecondary;
      ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillText(uc.isUpgrade ? 'Ulepszenie w toku...' : 'W budowie...', BPX + 8, buildListY);
      buildListY += 10;

      // Pasek postępu
      const barW = RIGHT_W - 24;
      const barH = 8;
      ctx.fillStyle = THEME.bgTertiary;
      ctx.fillRect(BPX + 8, buildListY, barW, barH);
      ctx.fillStyle = THEME.warning;
      ctx.fillRect(BPX + 8, buildListY, Math.round(barW * pct), barH);
      ctx.strokeStyle = THEME.border;
      ctx.strokeRect(BPX + 8, buildListY, barW, barH);
      buildListY += 14;

      // Procent i pozostały czas
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${Math.round(pct * 100)}%  ~${remaining.toFixed(1)} lat`, BPX + 8, buildListY);
      buildListY += 14;

      // Przycisk anulowania
      const cancelY = buildListY;
      ctx.fillStyle = 'rgba(40,10,10,0.8)';
      ctx.fillRect(BPX + 8, cancelY, RIGHT_W - 16, 18);
      ctx.strokeStyle = THEME.dangerDim;
      ctx.strokeRect(BPX + 8, cancelY, RIGHT_W - 16, 18);
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = '#ff8888';
      ctx.textAlign = 'center';
      ctx.fillText('[ Anuluj budowę ]', BPX + RIGHT_W / 2, cancelY + 13);
      ctx.textAlign = 'left';

      // Jeśli to upgrade, pokaż też istniejący budynek poniżej
      if (uc.isUpgrade && tile.buildingId && BUILDINGS[tile.buildingId]) {
        buildListY = cancelY + 28;
        // Kontynuuj do rysowania istniejącego budynku poniżej
      } else {
        return; // Nowa budowa — nie ma nic więcej do rysowania
      }
    }

    // Aktualny budynek — z poziomem i przyciskiem ulepszenia
    if (tile.buildingId && BUILDINGS[tile.buildingId]) {
      const b = BUILDINGS[tile.buildingId];
      const lvl = tile.buildingLevel ?? 1;
      const maxLvl = bSys?.getMaxLevel?.() ?? 3;

      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = CAT_COLORS[b.category] || '#fff';
      ctx.fillText(`${b.icon} ${b.namePL}  Lv.${lvl}/${maxLvl}`, BPX + 8, buildListY);
      buildListY += 4;

      // Pasek poziomu
      const barW = RIGHT_W - 24;
      const barH = 5;
      ctx.fillStyle = THEME.bgTertiary;
      ctx.fillRect(BPX + 8, buildListY, barW, barH);
      const frac = maxLvl > 1 ? (lvl - 1) / (maxLvl - 1) : 1;
      ctx.fillStyle = THEME.successDim;
      ctx.fillRect(BPX + 8, buildListY, Math.round(barW * frac), barH);
      ctx.strokeStyle = THEME.border;
      ctx.strokeRect(BPX + 8, buildListY, barW, barH);
      buildListY += 12;

      // Stawki produkcji budynku (efektywne — uwzględniają level, teren, tech)
      const activeEntry = bSys?._active.get(tile.key);
      const dispRates = activeEntry?.effectiveRates ?? b.rates ?? {};
      if (Object.keys(dispRates).length > 0) {
        ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(formatRates(dispRates), BPX + 8, buildListY);
        buildListY += 10;
      }

      // POP zatrudniony w budynku
      const bPopCost = activeEntry?.popCost ?? b.popCost ?? 0.25;
      if (bPopCost > 0) {
        const totalPop = bPopCost * lvl;
        ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = '#00ccff';
        ctx.fillText(`👤 ${totalPop} POP`, BPX + 8, buildListY);
        buildListY += 10;
      }

      // Przycisk ulepszenia (jeśli nie max)
      if (lvl < maxLvl && !b.isCapital) {
        const nextLvl = lvl + 1;
        const upgradeY = buildListY + 2;

        // Oblicz koszt ulepszenia (ta sama formuła co BuildingSystem._upgrade)
        const upgCost = {};
        if (b.cost) {
          for (const [k, v] of Object.entries(b.cost)) {
            upgCost[k] = Math.ceil(v * nextLvl * 1.2);
          }
        }
        if (nextLvl >= 3 && b.commodityCost) {
          for (const [k, v] of Object.entries(b.commodityCost)) {
            upgCost[k] = Math.ceil(v * (nextLvl - 1));
          }
        }

        // Sprawdź czy stać (surowce + POP)
        const upgPopCost = b.popCost ?? 0.25;
        const isOutpostUpg = window.KOSMOS?.colonyManager?.getColony(this.planet?.id)?.isOutpost;
        const upgPopOk   = isOutpostUpg || upgPopCost <= 0 || (cSys && cSys.freePops >= upgPopCost);
        const canAfford  = Object.entries(upgCost).every(([k, v]) => (inv[k] ?? 0) >= v) && upgPopOk;

        // Hover detection
        const isHover = this._buildPanelMouseX >= BPX + 8
          && this._buildPanelMouseX <= BPX + RIGHT_W - 8
          && this._buildPanelMouseY >= upgradeY
          && this._buildPanelMouseY <= upgradeY + 18;

        ctx.fillStyle = canAfford
          ? (isHover ? 'rgba(0,255,180,0.13)' : 'rgba(0,255,180,0.07)')
          : 'rgba(40,10,10,0.85)';
        ctx.fillRect(BPX + 8, upgradeY, RIGHT_W - 16, 18);
        ctx.strokeStyle = canAfford ? (isHover ? THEME.accent : THEME.successDim) : '#662233';
        ctx.strokeRect(BPX + 8, upgradeY, RIGHT_W - 16, 18);
        ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = canAfford ? THEME.accent : '#aa4455';
        ctx.textAlign = 'center';
        ctx.fillText(canAfford ? `[ Ulepsz do Lv.${nextLvl} ]` : `[ Ulepsz do Lv.${nextLvl} ] ✕`, BPX + RIGHT_W / 2, upgradeY + 13);
        ctx.textAlign = 'left';
        buildListY = upgradeY + 32;

        // Koszty ulepszenia — widoczne pod przyciskiem
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;

        // Rozdziel surowce i towary
        const rawEntries = [];
        const comEntries = [];
        for (const [resId, amt] of Object.entries(upgCost)) {
          if (COMMODITIES[resId]) comEntries.push([resId, amt]);
          else rawEntries.push([resId, amt]);
        }

        // Surowce
        if (rawEntries.length > 0) {
          ctx.fillStyle = THEME.textSecondary;
          ctx.fillText('Surowce:', BPX + 8, buildListY);
          buildListY += 12;
        }
        for (const [resId, amt] of rawEntries) {
          const have = Math.floor(inv[resId] ?? 0);
          const icon = RESOURCE_ICONS[resId] ?? resId;
          const resDef = ALL_RESOURCES[resId];
          const name = resDef?.namePL ?? resId;
          const ok = have >= amt;
          ctx.fillStyle = ok ? '#00ee88' : '#ff3344';
          ctx.fillText(`${icon} ${name}: ${have}/${amt}`, BPX + 14, buildListY);
          buildListY += 12;
        }

        // Towary (commodities)
        if (comEntries.length > 0) {
          ctx.fillStyle = THEME.textSecondary;
          ctx.fillText('Towary:', BPX + 8, buildListY);
          buildListY += 12;
          for (const [resId, amt] of comEntries) {
            const have = Math.floor(inv[resId] ?? 0);
            const comDef = COMMODITIES[resId];
            const name = COMMODITY_SHORT[resId] ?? resId;
            const dispIcon = comDef?.icon ?? resId;
            const ok = have >= amt;
            ctx.fillStyle = ok ? '#00ee88' : '#ff3344';
            ctx.fillText(`${dispIcon} ${name}: ${have}/${amt}`, BPX + 14, buildListY);
            buildListY += 12;
          }
        }
        // Koszt POP
        if (upgPopCost > 0) {
          const freePops = cSys?.freePops ?? 0;
          ctx.fillStyle = upgPopOk ? '#00ee88' : '#ff3344';
          ctx.fillText(`👤 POP: ${freePops >= upgPopCost ? '✓' : `${freePops}/${upgPopCost}`}`, BPX + 14, buildListY);
          buildListY += 12;
        }
        buildListY += 4;
      }

      // Przycisk rozbiórki / obniżenia poziomu (nie dla Stolicy)
      if (!b.isColonyBase && !b.isCapital) {
        const demolishY = buildListY + 2;
        if (lvl > 1) {
          // Obniżenie poziomu — żółto-pomarańczowy
          ctx.fillStyle = 'rgba(0,255,180,0.10)';
          ctx.fillRect(BPX + 8, demolishY, RIGHT_W - 16, 18);
          ctx.strokeStyle = 'rgba(0,255,180,0.30)';
          ctx.strokeRect(BPX + 8, demolishY, RIGHT_W - 16, 18);
          ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = '#ffcc44';
          ctx.textAlign = 'center';
          ctx.fillText(`[ Obniż Lv ${lvl} → ${lvl - 1} ]`, BPX + RIGHT_W / 2, demolishY + 11);
          ctx.textAlign = 'left';
        } else {
          // Pełna rozbiórka — czerwony
          ctx.fillStyle = 'rgba(40,10,10,0.8)';
          ctx.fillRect(BPX + 8, demolishY, RIGHT_W - 16, 18);
          ctx.strokeStyle = THEME.dangerDim;
          ctx.strokeRect(BPX + 8, demolishY, RIGHT_W - 16, 18);
          ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = '#ff8888';
          ctx.textAlign = 'center';
          ctx.fillText('[ Rozbiórka ]', BPX + RIGHT_W / 2, demolishY + 11);
          ctx.textAlign = 'left';
        }
      }
    } else {
      // Zakładki BUDUJ / ZAINSTALUJ
      const tabY = buildListY - 2;
      const tabW = (RIGHT_W - 16) / 2;
      const tabH = 16;
      this._buildTabRect = { x: BPX + 8, y: tabY, w: tabW, h: tabH }; // do hit test

      // BUDUJ tab
      ctx.fillStyle = this._buildPanelTab === 'build' ? 'rgba(0,255,180,0.13)' : 'rgba(0,255,180,0.04)';
      ctx.fillRect(BPX + 8, tabY, tabW, tabH);
      ctx.strokeStyle = this._buildPanelTab === 'build' ? THEME.accent : THEME.border;
      ctx.strokeRect(BPX + 8, tabY, tabW, tabH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = this._buildPanelTab === 'build' ? THEME.accent : THEME.textSecondary;
      ctx.textAlign = 'center';
      ctx.fillText('🔨 BUDUJ', BPX + 8 + tabW / 2, tabY + 11);

      // ZAINSTALUJ tab
      ctx.fillStyle = this._buildPanelTab === 'deploy' ? 'rgba(0,255,180,0.13)' : 'rgba(0,255,180,0.04)';
      ctx.fillRect(BPX + 8 + tabW, tabY, tabW, tabH);
      ctx.strokeStyle = this._buildPanelTab === 'deploy' ? THEME.accent : THEME.border;
      ctx.strokeRect(BPX + 8 + tabW, tabY, tabW, tabH);
      ctx.fillStyle = this._buildPanelTab === 'deploy' ? THEME.accent : THEME.textSecondary;
      ctx.fillText('📦 ZAINSTALUJ', BPX + 8 + tabW + tabW / 2, tabY + 11);
      ctx.textAlign = 'left';
      buildListY = tabY + tabH + 6;

      if (this._buildPanelTab === 'deploy') {
        // Panel deploy — prefabrykaty z cargo statków zadokowanych na tej planecie
        this._drawDeployPanel(ctx, tile, BPX, buildListY);
        return;
      }

      // Lista budynków (dostępne + niedostępne z powodem) — ze scrollem
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.borderLight;
      ctx.fillText('Budynki:', BPX + 8, buildListY);

      const clipTop = buildListY + 4;
      const clipBot = LH - BOTTOM_BAR_H;
      const scrollY = this._buildPanelScrollY;

      ctx.save();
      ctx.beginPath();
      ctx.rect(BPX, clipTop, RIGHT_W, clipBot - clipTop);
      ctx.clip();

      let yy = buildListY + 12 - scrollY;
      let totalContentH = 0;
      let hoveredBuilding = null; // budynek pod kursorem (do tooltip)
      let hoveredBuildY   = 0;

      // Sortowanie budynków wg dostępności: affordable → unaffordable → blocked
      const sortedBuildings = this._getSortedBuildings(tile, tSys, cSys, inv);

      sortedBuildings.forEach(({ b, reason }) => {

        const blocked  = reason === 'Zły teren' || (reason && reason.startsWith('Wymaga'));
        const affordable = !reason;
        // Większy wiersz dla nowych kosztów
        const hasCommodity = b.commodityCost && Object.keys(b.commodityCost).length > 0;
        const rowH = blocked ? 42 : (hasCommodity ? 38 : 28);

        // Hover detection — zapamiętaj budynek pod kursorem
        if (this._buildPanelMouseY >= 0) {
          const absY = yy; // aktualna pozycja wiersza (po scroll)
          if (this._buildPanelMouseY >= absY && this._buildPanelMouseY <= absY + rowH
              && this._buildPanelMouseX >= BPX + 8 && this._buildPanelMouseX <= BPX + RIGHT_W - 8) {
            hoveredBuilding = b;
            hoveredBuildY   = absY;
          }
        }

        // Tło i ramka
        const isHovered = hoveredBuilding === b;
        ctx.fillStyle   = blocked ? 'rgba(5,2,2,0.85)' : isHovered ? 'rgba(0,255,180,0.05)' : (affordable ? 'rgba(0,255,180,0.03)' : 'rgba(2,4,5,0.90)');
        ctx.fillRect(BPX + 8, yy, RIGHT_W - 16, rowH);
        ctx.strokeStyle = blocked ? 'rgba(255,51,68,0.15)' : isHovered ? 'rgba(0,255,180,0.25)' : (affordable ? 'rgba(0,255,180,0.10)' : 'rgba(0,255,180,0.04)');
        ctx.lineWidth   = 1;
        ctx.strokeRect(BPX + 8, yy, RIGHT_W - 16, rowH);

        // Nazwa budynku + koszt energii
        ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = blocked ? 'rgba(255,51,68,0.5)' : (affordable ? (CAT_COLORS[b.category] || '#fff') : 'rgba(160,200,190,0.25)');
        let nameStr = `${b.icon} ${b.namePL}`;
        if (b.energyCost > 0) nameStr += `  ⚡−${b.energyCost}`;
        ctx.fillText(nameStr, BPX + 14, yy + 12);

        // Koszt surowców
        const costStr = Object.entries(b.cost || {}).map(([k, v]) => `${RESOURCE_ICONS?.[k] ?? k}${v}`).join(' ');
        ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = blocked ? 'rgba(255,51,68,0.25)' : (affordable ? THEME.borderLight : 'rgba(160,200,190,0.15)');
        ctx.fillText(costStr, BPX + 14, yy + 23);

        const popCost = b.popCost ?? 0.25;
        if (popCost > 0) {
          const hasFreePops = cSys && cSys.freePops >= popCost;
          ctx.fillStyle = blocked ? 'rgba(255,51,68,0.25)' : (hasFreePops ? '#00ee88' : '#ff3344');
          ctx.fillText(`${popCost}👤`, BPX + RIGHT_W - 48, yy + 23);
        }

        // Koszt commodities (nowy wiersz)
        if (hasCommodity && !blocked) {
          const comStr = Object.entries(b.commodityCost).map(([k, v]) => {
            const icon = COMMODITIES[k]?.icon ?? '📦';
            const name = COMMODITY_SHORT[k] ?? k;
            return `${v}×${icon}${name}`;
          }).join(' ');
          ctx.fillStyle = affordable ? 'rgba(160,200,190,0.45)' : 'rgba(160,200,190,0.15)';
          ctx.fillText(comStr, BPX + 14, yy + 33);
        }

        // Powód blokady
        if (blocked) {
          ctx.font      = '7px monospace';
          ctx.fillStyle = 'rgba(255,51,68,0.35)';
          ctx.fillText(`❌ ${reason}`, BPX + 14, yy + 35);
        }

        yy += rowH + 4;
        totalContentH += rowH + 4;
      });

      ctx.restore();

      // ── Tooltip budynku (gdy hover) ────────────────────
      this._buildTooltipVisible = !!hoveredBuilding;
      if (hoveredBuilding) {
        this._drawBuildTooltip(ctx, hoveredBuilding, inv, cSys);
      }

      // Scrollbar
      const viewH = clipBot - clipTop;
      const maxScroll = Math.max(0, totalContentH - viewH + 12);
      if (this._buildPanelScrollY > maxScroll) this._buildPanelScrollY = maxScroll;
      if (maxScroll > 0) {
        const barH = Math.max(20, viewH * (viewH / (totalContentH + 12)));
        const barY = clipTop + (this._buildPanelScrollY / maxScroll) * (viewH - barH);
        ctx.fillStyle = 'rgba(0,255,180,0.25)';
        ctx.fillRect(BPX + RIGHT_W - 6, barY, 4, barH);
      }
    }
  }

  // ── Panel deploy — prefabrykaty z cargo statków ──────────────
  _drawDeployPanel(ctx, tile, BPX, startY) {
    const vMgr = window.KOSMOS?.vesselManager;
    const bSys = window.KOSMOS?.buildingSystem;
    const planetId = this.planet?.id;
    if (!vMgr || !planetId) return;

    this._deployBtns = [];

    // Zbierz statki zadokowane na tej planecie z prefabami w cargo
    const docked = vMgr.getAllVessels().filter(v =>
      v.position.dockedAt === planetId && v.position.state === 'docked' && v.cargo
    );

    let yy = startY;
    let anyPrefab = false;

    for (const vessel of docked) {
      if (!vessel.cargo || Object.keys(vessel.cargo).length === 0) continue;

      // Szukaj prefabów w cargo
      const prefabs = Object.entries(vessel.cargo).filter(([comId, qty]) => {
        const com = COMMODITIES[comId];
        return qty > 0 && com?.isPrefab;
      });
      if (prefabs.length === 0) continue;

      anyPrefab = true;

      // Nagłówek statku
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.info;
      ctx.fillText(`🚀 ${vessel.name}`, BPX + 8, yy + 10);
      yy += 16;

      for (const [comId, qty] of prefabs) {
        const com = COMMODITIES[comId];
        const deploysBuildingId = com.deploysBuilding;
        const buildingDef = BUILDINGS[deploysBuildingId];
        if (!buildingDef) continue;

        // Sprawdź czy deploy jest możliwy (teren, tech, POP)
        let canDeploy = true;
        let reason = '';
        if (!bSys._canBuildOnTile(tile, buildingDef)) {
          canDeploy = false;
          reason = 'Zły teren';
        } else if (buildingDef.requires && !window.KOSMOS?.techSystem?.isResearched(buildingDef.requires)) {
          canDeploy = false;
          reason = 'Wymaga tech';
        } else {
          const popCost = buildingDef.popCost ?? 0.25;
          const isOutpostCol = window.KOSMOS?.colonyManager?.getColony(this.planet?.id)?.isOutpost;
          if (popCost > 0 && !isOutpostCol && window.KOSMOS?.civSystem?.freePops < popCost) {
            canDeploy = false;
            reason = 'Brak POPów';
          }
        }

        const rowH = 24;
        ctx.fillStyle = canDeploy ? 'rgba(0,255,180,0.07)' : 'rgba(15,5,5,0.85)';
        ctx.fillRect(BPX + 8, yy, RIGHT_W - 16, rowH);
        ctx.strokeStyle = canDeploy ? 'rgba(0,255,180,0.18)' : '#331818';
        ctx.strokeRect(BPX + 8, yy, RIGHT_W - 16, rowH);

        // Ikona + nazwa + ilość
        ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = canDeploy ? THEME.successDim : '#663333';
        ctx.fillText(`${com.icon} ${buildingDef.icon} ${buildingDef.namePL} ×${qty}`, BPX + 14, yy + 10);

        if (canDeploy) {
          // Przycisk DEPLOY
          const btnW = 52;
          const btnX = BPX + RIGHT_W - 16 - btnW;
          const btnY = yy + 2;
          const btnH = rowH - 4;

          ctx.fillStyle = 'rgba(0,255,180,0.13)';
          ctx.fillRect(btnX, btnY, btnW, btnH);
          ctx.strokeStyle = THEME.successDim;
          ctx.strokeRect(btnX, btnY, btnW, btnH);
          ctx.fillStyle = THEME.successDim;
          ctx.textAlign = 'center';
          ctx.fillText('DEPLOY', btnX + btnW / 2, btnY + 13);
          ctx.textAlign = 'left';

          this._deployBtns.push({
            x: btnX, y: btnY, w: btnW, h: btnH,
            vesselId: vessel.id, prefabId: comId, buildingId: deploysBuildingId,
          });
        } else {
          ctx.fillStyle = '#663333';
          ctx.fillText(`❌ ${reason}`, BPX + RIGHT_W - 80, yy + 10);
        }
        yy += rowH + 2;
      }
      yy += 4;
    }

    if (!anyPrefab) {
      ctx.font      = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText('Brak prefabów w cargo', BPX + 8, yy + 10);
      yy += 14;
      ctx.fillStyle = THEME.borderLight;
      ctx.font      = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillText('Załaduj prefabrykaty na', BPX + 8, yy + 6);
      yy += 10;
      ctx.fillText('statek cargo w panelu floty.', BPX + 8, yy + 6);
    }
  }

  // ── Tooltip budynku (szczegółowe koszty + czego brakuje) ──────
  _drawBuildTooltip(ctx, building, inv, cSys) {
    const BPX = LW - RIGHT_W;
    const mx  = this._buildPanelMouseX;

    // Zbierz linie kosztów
    const lines = [];

    // Opis budynku
    if (building.description) {
      lines.push({ text: building.description, color: THEME.textSecondary, isDesc: true });
    }

    lines.push({ text: '── Koszty budowy ──', color: THEME.borderLight });

    // Surowce (cost)
    for (const [resId, amt] of Object.entries(building.cost || {})) {
      const have = Math.floor(inv[resId] ?? 0);
      const icon = RESOURCE_ICONS[resId] ?? resId;
      const name = ALL_RESOURCES[resId]?.namePL ?? resId;
      const ok   = have >= amt;
      lines.push({
        text: `${icon} ${name}: ${have}/${amt}`,
        color: ok ? THEME.successDim : '#ff6644',
        missing: !ok,
      });
    }

    // Commodities (commodityCost)
    for (const [comId, amt] of Object.entries(building.commodityCost || {})) {
      const have = Math.floor(inv[comId] ?? 0);
      const icon = COMMODITIES[comId]?.icon ?? '📦';
      const name = COMMODITY_SHORT[comId] ?? comId;
      const ok   = have >= amt;
      lines.push({
        text: `${icon} ${name}: ${have}/${amt}`,
        color: ok ? THEME.successDim : '#ff6644',
        missing: !ok,
      });
    }

    // POP (pomiń w outpost)
    const popCost = building.popCost ?? 0.25;
    const isOutpostTooltip = window.KOSMOS?.colonyManager?.getColony(this.planet?.id)?.isOutpost;
    if (popCost > 0 && !isOutpostTooltip) {
      const freePops = cSys?.freePops ?? 0;
      const ok = freePops >= popCost;
      lines.push({
        text: `👤 Populacja: ${freePops.toFixed(2)}/${popCost}`,
        color: ok ? THEME.successDim : '#ff6644',
        missing: !ok,
      });
    }

    // Energia (energyCost)
    if (building.energyCost > 0) {
      lines.push({
        text: `⚡ Energia: −${building.energyCost}/rok`,
        color: THEME.warning,
      });
    }

    // Produkcja (rates)
    if (building.rates && Object.keys(building.rates).length > 0) {
      lines.push({ text: '── Produkcja ──', color: THEME.borderLight });
      for (const [resId, val] of Object.entries(building.rates)) {
        const icon = RESOURCE_ICONS[resId] ?? resId;
        const name = ALL_RESOURCES[resId]?.namePL ?? resId;
        const sign = val >= 0 ? '+' : '';
        lines.push({
          text: `${icon} ${name}: ${sign}${val}/rok`,
          color: val >= 0 ? THEME.successDim : '#ff6644',
        });
      }
    }

    if (building.isMine) {
      lines.push({ text: '⛏ Wydobycie zależy od złóż', color: '#aac8c0' });
    }

    // Rozmiar tooltip
    const lineH   = 13;
    const padX    = 8;
    const padY    = 6;
    const ttW     = 200;
    const ttH     = padY * 2 + lines.length * lineH;

    // Pozycja — na lewo od panelu budowania
    let ttX = BPX - ttW - 6;
    let ttY = this._buildPanelMouseY - ttH / 2;
    if (ttX < 0) ttX = mx + 12;
    if (ttY < HEADER_H) ttY = HEADER_H;
    if (ttY + ttH > LH - BOTTOM_BAR_H) ttY = LH - BOTTOM_BAR_H - ttH;

    // Rysuj tło
    ctx.fillStyle = 'rgba(2,4,5,0.95)';
    ctx.fillRect(ttX, ttY, ttW, ttH);
    ctx.strokeStyle = 'rgba(0,255,180,0.40)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ttX, ttY, ttW, ttH);

    // Rysuj linie
    let ly = ttY + padY;
    for (const line of lines) {
      ctx.font = line.isDesc
        ? `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`
        : `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = line.color;
      ctx.textAlign = 'left';
      ctx.fillText(line.text, ttX + padX, ly + 9);
      ly += lineH;
    }
  }

  // ── Hit testing ───────────────────────────────────────────────

  _hitTestClose(mx, my) {
    const BACK_W = 130;
    // Przycisk "← Wróć" (lewa strona TopBar)
    if (mx >= 0 && mx <= BACK_W && my >= 0 && my <= 22) {
      this._close();
      return true;
    }
    // Przycisk ✏ zmiany nazwy planety (w obszarze back, wiersz 2)
    if (this.planet && mx >= 0 && mx <= BACK_W && my >= 22 && my <= TOP_BAR_H) {
      const ctx = this.ctx;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      const nameTxt = this.planet.name;
      const temp = this.planet.temperatureK
        ? ` ${Math.round(this.planet.temperatureK - 273)}°C`
        : '';
      const fullTxt = `${nameTxt}${temp}`;
      const fullW = ctx.measureText(fullTxt).width;
      const editX = 10 + fullW + 2;
      if (mx >= editX && mx <= editX + 16) {
        showRenameModal(this.planet.name).then(newName => {
          if (newName) this.planet.name = newName;
        });
        return true;
      }
    }
    // Klik TopBar (czas/zasoby) — deleguj do TopBar.hitTest
    if (my >= 0 && my <= TOP_BAR_H && mx > BACK_W) {
      return this._topBar.hitTest(mx, my, LW);
    }
    return false;
  }

  _hitTestTimeBar(mx, my) {
    const BY = LH - BOTTOM_BAR_H;
    if (my < BY || my > LH) return false;

    // ── Toggle SIATKA (prawy kraniec) ────────────────
    const gridBtnX = LW - 70;
    const gridBtnY = BY + 3;
    if (mx >= gridBtnX && mx <= gridBtnX + 58 && my >= gridBtnY && my <= gridBtnY + 16) {
      this._showGrid = !this._showGrid;
      this._globeRenderer?.setShowGrid(this._showGrid);
      return true;
    }

    // Kontrolki czasu przeniesione do TopBar — pochłoń klik w dolnym pasku
    return true;
  }

  // ── Deploy prefabu z cargo statku ──────────────────────────
  _handleDeploy(vesselId, prefabId, buildingId, tile) {
    const vMgr = window.KOSMOS?.vesselManager;
    const bSys = window.KOSMOS?.buildingSystem;
    if (!vMgr || !bSys) return;

    const vessel = vMgr.getVessel(vesselId);
    if (!vessel?.cargo?.[prefabId] || vessel.cargo[prefabId] <= 0) {
      this._flashMsg = 'Brak prefabu w cargo';
      this._flashEnd = Date.now() + 2500;
      return;
    }

    const result = bSys.deployFromCargo(tile, buildingId);
    if (result.success) {
      // Zużyj prefab z cargo
      vessel.cargo[prefabId] -= 1;
      if (vessel.cargo[prefabId] <= 0) delete vessel.cargo[prefabId];
      vessel.cargoUsed = Math.max(0, (vessel.cargoUsed ?? 0) - (COMMODITIES[prefabId]?.weight ?? 0));

      this._syncBuildingIds();
      this._globeRenderer?.refreshTexture();
    } else {
      this._flashMsg = result.reason;
      this._flashEnd = Date.now() + 2500;
    }
  }

  _hitTestLeftPanel(mx, my) {
    // Pochłoń kliknięcia w lewym panelu (nie propaguj do globusa)
    if (mx < LEFT_W && my > HEADER_H && my < LH - BOTTOM_BAR_H) {
      return true;
    }
    return false;
  }

  _hitTestBuildPanel(mx, my) {
    const tile = this._buildPanelTile;
    const BPX  = LW - RIGHT_W;
    if (!tile || mx < BPX) return false;
    const inv  = this._inventory;
    const bSys = window.KOSMOS?.buildingSystem;

    // Oblicz przesunięcie Y z uwzględnieniem złóż i Stolicy
    const deposits = this.planet?.deposits ?? [];
    let offsetY = HEADER_H + 48;
    if (deposits.length > 0) {
      offsetY += 14 + deposits.length * 10;
    }
    if (tile.capitalBase) offsetY += 14;

    // Budowa w toku — przycisk anulowania
    if (tile.underConstruction) {
      // Wysokość sekcji budowy: nagłówek(12) + tekst(10) + pasek(14) + procent(14) + przycisk(18) = ~68
      const cancelY = offsetY + 50;
      if (mx >= BPX + 8 && mx <= LW - 8 && my >= cancelY && my <= cancelY + 18) {
        const key = `${tile.q},${tile.r}`;
        EventBus.emit('planet:demolishRequest', { planet: this.planet, tileKey: key, tile });
        return true;
      }
      // Jeśli to upgrade — przesunięcie do istniejącego budynku poniżej
      if (tile.underConstruction.isUpgrade && tile.buildingId) {
        offsetY += 78; // przesunięcie po sekcji budowy
      } else {
        return true; // pochłoń klik (nowa budowa — brak budynku pod spodem)
      }
    }

    if (tile.buildingId && BUILDINGS[tile.buildingId]) {
      const bDef = BUILDINGS[tile.buildingId];
      if (bDef?.isColonyBase || bDef?.isCapital) return true; // pochłoń klik
      const lvl = tile.buildingLevel ?? 1;
      const maxLvl = window.KOSMOS?.buildingSystem?.getMaxLevel?.() ?? 3;

      // Oblicz pozycję przycisków (muszą odpowiadać _drawBuildPanel)
      let btnY = offsetY + 16; // po nazwie (+4) + pasku poziomu (+12)
      const htEntry = bSys?._active.get(tile.key);
      const htRates = htEntry?.effectiveRates ?? bDef.rates ?? {};
      if (Object.keys(htRates).length > 0) btnY += 10; // stawki produkcji
      const htPop = (htEntry?.popCost ?? bDef.popCost ?? 0.25) * lvl;
      if (htPop > 0) btnY += 10; // linia POP

      // Ulepszenie
      if (lvl < maxLvl) {
        const upgradeY = btnY + 2;
        if (mx >= BPX + 8 && mx <= LW - 8 && my >= upgradeY && my <= upgradeY + 18) {
          // Sprawdź czy stać — oblicz koszt (ta sama formuła co _drawBuildPanel)
          const upgCost = {};
          if (bDef.cost) {
            for (const [k, v] of Object.entries(bDef.cost)) upgCost[k] = Math.ceil(v * (lvl + 1) * 1.2);
          }
          if ((lvl + 1) >= 3 && bDef.commodityCost) {
            for (const [k, v] of Object.entries(bDef.commodityCost)) upgCost[k] = Math.ceil(v * lvl);
          }
          const upgPopCost = bDef.popCost ?? 0.25;
          const isOutpost = window.KOSMOS?.colonyManager?.getColony(this.planet?.id)?.isOutpost;
          const cSys = window.KOSMOS?.civSystem;
          const popOk = isOutpost || upgPopCost <= 0 || (cSys && cSys.freePops >= upgPopCost);
          const afford = Object.entries(upgCost).every(([k, v]) => (inv[k] ?? 0) >= v) && popOk;
          if (!afford) {
            // Pokaż flash z brakującymi zasobami
            const missing = Object.entries(upgCost)
              .filter(([k, v]) => (inv[k] ?? 0) < v)
              .map(([k, v]) => k);
            this._flashMsg = `Brak: ${missing.join(', ')}`;
            this._flashEnd = Date.now() + 2000;
            return true;
          }
          EventBus.emit('planet:upgradeRequest', { planet: this.planet, tile });
          return true;
        }
        // Pomiń przycisk + linie kosztów ulepszenia (+ nagłówek Towary + linia POP)
        const rawCount = Object.keys(bDef.cost || {}).length;
        const rawHeader = rawCount > 0 ? 1 : 0; // nagłówek "Surowce:"
        const hasCom   = ((tile.buildingLevel ?? 1) + 1) >= 3 && Object.keys(bDef.commodityCost || {}).length > 0;
        const comCount = hasCom ? Object.keys(bDef.commodityCost).length : 0;
        const comHeader = hasCom ? 1 : 0; // nagłówek "Towary:"
        const upgPopLine = (bDef.popCost ?? 0.25) > 0 ? 1 : 0;
        btnY = upgradeY + 32 + (rawHeader + rawCount + comCount + comHeader + upgPopLine) * 12 + 4;
      }

      // Rozbiórka
      const demolishY = btnY + 2;
      if (mx >= BPX + 8 && mx <= LW - 8 && my >= demolishY && my <= demolishY + 18) {
        const key = `${tile.q},${tile.r}`;
        EventBus.emit('planet:demolishRequest', { planet: this.planet, tileKey: key, tile });
        return true;
      }
      return true; // pochłoń kliknięcie w prawy panel
    } else {
      // Sprawdź klik na zakładkach BUDUJ/ZAINSTALUJ
      if (this._buildTabRect) {
        const tr = this._buildTabRect;
        if (my >= tr.y && my <= tr.y + tr.h && mx >= tr.x && mx <= tr.x + tr.w * 2) {
          // Lewa zakładka = BUDUJ, prawa = ZAINSTALUJ
          this._buildPanelTab = mx < tr.x + tr.w ? 'build' : 'deploy';
          this._buildPanelScrollY = 0;
          return true;
        }
      }

      // Panel deploy — sprawdź klik na przyciskach DEPLOY
      if (this._buildPanelTab === 'deploy') {
        for (const btn of this._deployBtns) {
          if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
            this._handleDeploy(btn.vesselId, btn.prefabId, btn.buildingId, tile);
            return true;
          }
        }
        return true; // pochłoń klik w panelu deploy
      }

      // Buduj — iteruj przez WSZYSTKIE budynki (posortowane wg dostępności, z uwzględnieniem scrolla)
      let yy   = offsetY + 12 + 20 - this._buildPanelScrollY; // +20 na tab bar
      const tSys = window.KOSMOS?.techSystem;
      const cSys = window.KOSMOS?.civSystem;
      const sortedClick = this._getSortedBuildings(tile, tSys, cSys, inv);
      for (const { b, reason } of sortedClick) {
        const blocked = reason === 'Zły teren' || (reason && reason.startsWith('Wymaga'));
        const hasCommodity = b.commodityCost && Object.keys(b.commodityCost).length > 0;
        const rowH = blocked ? 42 : (hasCommodity ? 38 : 28);

        // Tylko klikalne jeśli dostępne (nie zablokowane i nie za drogie)
        if (!reason && mx >= BPX + 8 && mx <= LW - 8 && my >= yy && my <= yy + rowH) {
          const key = `${tile.q},${tile.r}`;
          EventBus.emit('planet:buildRequest', {
            planet: this.planet, tileKey: key, tile,
            buildingId: b.id,
          });
          return true;
        }
        yy += rowH + 4;
      }
    }
    return false;
  }
}
