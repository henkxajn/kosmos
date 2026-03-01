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

// ── Stałe layoutu (identyczne z PlanetScene) ─────────────────
const TOP_BAR_H    = 44;
const RES_BAR_H    = 44;
const HEADER_H     = TOP_BAR_H + RES_BAR_H;
const BOTTOM_BAR_H = 52;
const LEFT_W       = 220;
const RIGHT_W      = 234;

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
    this._prevMultiplierIndex = 1;

    // Panel budowania
    this._buildPanelTile   = null;
    this._buildPanelScroll = 0;

    // Stan kontrolek czasu
    this._timeState = { isPaused: true, multiplierIndex: 1, displayText: '' };

    // PlanetGlobeRenderer (tworzony w open)
    this._globeRenderer = null;

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
    this._onResourceChange = null;
    this._onSnapshot       = null;
    this._onTimeState      = null;
    this._onTimeDisplay    = null;

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
    this._isDragging         = false;

    // Przełącz aktywną kolonię w ColonyManager
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr) {
      colMgr.activePlanetId = planet.id;
      // Przełącz aktywne systemy na systemy tej kolonii
      const colony = colMgr.getColony(planet.id);
      if (colony) {
        window.KOSMOS.resourceSystem  = colony.resourceSystem;
        window.KOSMOS.civSystem       = colony.civSystem;
        // Per-kolonia BuildingSystem — każda kolonia ma swój
        if (colony.buildingSystem) {
          window.KOSMOS.buildingSystem = colony.buildingSystem;
        }
        if (window.KOSMOS.expeditionSystem) {
          window.KOSMOS.expeditionSystem.resourceSystem = colony.resourceSystem;
        }
        if (window.KOSMOS.techSystem) {
          window.KOSMOS.techSystem.resourceSystem = colony.resourceSystem;
        }
      }
    }

    // Zwolnij czas
    EventBus.emit('time:setMultiplier', { index: 1 });
    EventBus.emit('time:pause');

    // Generuj siatkę
    this.grid = PlanetMapGenerator.generate(planet, true);

    // Ustaw gridHeight w BuildingSystem (do modyfikatora polarnego)
    if (window.KOSMOS?.buildingSystem) {
      window.KOSMOS.buildingSystem._gridHeight = this.grid.height;
    }

    // Synchronizuj budynki z BuildingSystem
    const bSys = window.KOSMOS?.buildingSystem;
    if (bSys) {
      bSys._active.forEach((entry, activeKey) => {
        if (activeKey.startsWith('capital_')) {
          const coordKey = activeKey.replace('capital_', '');
          const [q, r] = coordKey.split(',').map(Number);
          const tile = this.grid.get(q, r);
          if (tile) tile.capitalBase = true;
          return;
        }
        const [q, r] = activeKey.split(',').map(Number);
        const tile = this.grid.get(q, r);
        if (tile) tile.buildingId = entry.building.id;
      });
    }

    // Auto-place Stolicy przy pierwszym otwarciu mapy
    const isNewColony = bSys && bSys._active.size === 0 && window.KOSMOS?.civMode;
    if (isNewColony) {
      const baseTile = this._findColonyBaseTile();
      if (baseTile) {
        EventBus.emit('planet:buildRequest', { tile: baseTile, buildingId: 'colony_base' });
      }
    }

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

  // ── Zamknij scenę ──────────────────────────────────────────────

  _close() {
    this.isOpen = false;
    this.canvas.style.display = 'none';

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

    // Przywróć prędkość czasu
    EventBus.emit('time:setMultiplier', { index: this._prevMultiplierIndex });
    EventBus.emit('time:play');
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

      if (this._isInPanel(mx, my)) {
        // W panelach → brak hover na globusie
        if (this._hoveredTile !== null) {
          this._hoveredTile = null;
          this._globeRenderer?.handleExternalMouseMove(-9999, -9999); // poza ekranem
        }
        layer.style.cursor = 'default';
        return;
      }

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
      if (!this._isInPanel(mx, my)) {
        e.preventDefault();
        this._globeRenderer?.cameraCtrl?.applyZoom(e.deltaY);
      }
    };

    // Build/Demolish results
    this._onBuildResult = ({ success }) => {
      if (success) {
        this._syncBuildingIds();
        this._globeRenderer?.refreshTexture();
      }
    };

    this._onDemolishResult = ({ success }) => {
      if (success) {
        this._syncBuildingIds();
        this._globeRenderer?.refreshTexture();
      }
    };

    // Resources
    const applyRes = ({ resources }) => {
      if (!resources) return;
      for (const [k, v] of Object.entries(resources)) {
        this._resources[k] = v.amount ?? 0;
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

    // Podpięcie
    if (layer) {
      layer.addEventListener('mousedown',  this._onMouseDown);
      layer.addEventListener('mousemove',  this._onMouseMove);
      layer.addEventListener('mouseup',    this._onMouseUp);
      layer.addEventListener('click',      this._onClick);
      layer.addEventListener('wheel',      this._onWheel, { passive: false });
    }
    EventBus.on('planet:buildResult',   this._onBuildResult);
    EventBus.on('planet:demolishResult', this._onDemolishResult);
    EventBus.on('resource:changed',     this._onResourceChange);
    EventBus.on('resource:snapshot',    this._onSnapshot);
    EventBus.on('time:stateChanged',    this._onTimeState);
    EventBus.on('time:display',         this._onTimeDisplay);
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
    EventBus.off('planet:buildResult',   this._onBuildResult);
    EventBus.off('planet:demolishResult', this._onDemolishResult);
    EventBus.off('resource:changed',     this._onResourceChange);
    EventBus.off('resource:snapshot',    this._onSnapshot);
    EventBus.off('time:stateChanged',    this._onTimeState);
    EventBus.off('time:display',         this._onTimeDisplay);
  }

  // ── Synchronizacja budynków z BuildingSystem ──────────────────

  _syncBuildingIds() {
    if (!this.grid) return;
    const bSys = window.KOSMOS?.buildingSystem;
    if (!bSys) return;

    // Wyczyść stan przed synchronizacją
    this.grid.toArray().forEach(t => {
      t.buildingId = null;
      t.capitalBase = false;
    });

    // Ustaw buildingId / capitalBase z _active
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
      if (tile) tile.buildingId = entry.building.id;
    });
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

  // ── Pętla rysowania paneli ─────────────────────────────────────

  _startDrawLoop() {
    const draw = () => {
      if (!this.isOpen) return;
      this._draw();
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
    ctx.fillStyle = 'rgba(6,8,16,0.96)';
    ctx.fillRect(0, 0, LW, HEADER_H);
    // Bottom area
    ctx.fillRect(0, LH - BOTTOM_BAR_H, LW, BOTTOM_BAR_H);
    // Left panel
    ctx.fillRect(0, HEADER_H, LEFT_W, LH - HEADER_H - BOTTOM_BAR_H);
    // Right panel (zawsze wypełniony tłem — globus go nie zakrywa)
    ctx.fillRect(LW - RIGHT_W, HEADER_H, RIGHT_W, LH - HEADER_H - BOTTOM_BAR_H);

    // Separator prawego panelu
    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(LW - RIGHT_W, HEADER_H); ctx.lineTo(LW - RIGHT_W, LH - BOTTOM_BAR_H); ctx.stroke();

    // Rysuj panele
    this._drawTopBar();
    this._drawResourceBar();
    this._drawLeftPanel();
    this._drawBottomBar();
    if (this._buildPanelTile) {
      this._drawBuildPanel();
    } else {
      // Podpowiedź w prawym panelu
      ctx.font      = '9px monospace';
      ctx.fillStyle = '#2a4060';
      ctx.fillText('Kliknij hex', LW - RIGHT_W + 8, HEADER_H + 20);
      ctx.fillText('aby zobaczyć opcje', LW - RIGHT_W + 8, HEADER_H + 34);
    }

    ctx.restore();
  }

  // ── Górny pasek ───────────────────────────────────────────────

  _drawTopBar() {
    const ctx = this.ctx;

    ctx.fillStyle = 'rgba(6,13,24,0.95)';
    ctx.fillRect(0, 0, LW, TOP_BAR_H);
    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, TOP_BAR_H); ctx.lineTo(LW, TOP_BAR_H); ctx.stroke();

    // Przycisk WRÓĆ
    ctx.font      = '11px monospace';
    ctx.fillStyle = '#88ffcc';
    ctx.textAlign = 'left';
    ctx.fillText('← Wróć', 14, TOP_BAR_H / 2 + 4);

    // Nazwa planety + przycisk zmiany nazwy ✏
    if (this.planet) {
      ctx.font      = '14px monospace';
      ctx.fillStyle = '#c8e8ff';
      ctx.textAlign = 'center';
      ctx.fillText(this.planet.name, LW / 2, TOP_BAR_H / 2 + 5);

      // Przycisk ✏ obok nazwy
      const nameW = ctx.measureText(this.planet.name).width;
      ctx.font      = '10px monospace';
      ctx.fillStyle = '#6888aa';
      ctx.fillText('✏', LW / 2 + nameW / 2 + 8, TOP_BAR_H / 2 + 5);

      ctx.font      = '9px monospace';
      ctx.fillStyle = '#6888aa';
      const temp = this.planet.temperatureK
        ? `${Math.round(this.planet.temperatureK - 273)} °C`
        : '';
      ctx.fillText(`${this.planet.planetType ?? ''} ${temp}  [3D]`, LW / 2, TOP_BAR_H / 2 + 18);
    }

    ctx.textAlign = 'left';
  }

  // ── Pasek surowców ────────────────────────────────────────────

  _drawResourceBar() {
    if (!window.KOSMOS?.civMode) return;
    const ctx  = this.ctx;
    const Y    = TOP_BAR_H;
    const rSys = window.KOSMOS?.resourceSystem;

    ctx.fillStyle = 'rgba(6,13,24,0.90)';
    ctx.fillRect(0, Y, LW, RES_BAR_H);
    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, Y + RES_BAR_H); ctx.lineTo(LW, Y + RES_BAR_H); ctx.stroke();

    const icons = { minerals: '⛏', energy: '⚡', organics: '🌿', water: '💧', research: '🔬' };
    const RES   = ['minerals', 'energy', 'organics', 'water', 'research'];
    const colW  = LW / 5;

    RES.forEach((r, i) => {
      const cx = i * colW + colW / 2;
      const amt = this._resources[r]             ?? 0;
      const cap = rSys?.resources?.[r]?.capacity ?? 500;
      const dlt = rSys?.resources?.[r]?.perYear  ?? 0;

      ctx.font      = '9px monospace';
      ctx.fillStyle = '#6a8aaa';
      ctx.textAlign = 'center';
      ctx.fillText(icons[r] + ' ' + r.toUpperCase(), cx, Y + 12);

      const frac = cap > 0 ? amt / cap : 0;
      ctx.font      = '11px monospace';
      ctx.fillStyle = frac < 0.10 ? '#cc4422' : frac < 0.25 ? '#ffaa44' : '#c8e8ff';
      ctx.fillText(`${Math.floor(amt)} / ${cap}`, cx, Y + 25);

      ctx.font      = '9px monospace';
      ctx.fillStyle = (dlt || 0) >= 0 ? '#44cc66' : '#cc4422';
      ctx.fillText(`${(dlt || 0) >= 0 ? '+' : ''}${(dlt || 0).toFixed(1)}/r`, cx, Y + 38);
    });
    ctx.textAlign = 'left';
  }

  // ── Lewy panel instalacji ─────────────────────────────────────

  _drawLeftPanel() {
    const ctx  = this.ctx;
    const bSys = window.KOSMOS?.buildingSystem;
    const cSys = window.KOSMOS?.civSystem;

    ctx.fillStyle = 'rgba(6,13,24,0.88)';
    ctx.fillRect(0, HEADER_H, LEFT_W, LH - HEADER_H);
    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(LEFT_W, HEADER_H); ctx.lineTo(LEFT_W, LH); ctx.stroke();

    // ── Widget POP ──────────────────────────────────────────────
    let y = HEADER_H + 6;

    if (cSys) {
      ctx.font      = '10px monospace';
      ctx.fillStyle = '#c8e8ff';
      ctx.fillText(`👤 POP: ${cSys.population} / ${cSys.housing}`, 12, y + 12);
      y += 18;

      const barW = LEFT_W - 24;
      const barH = 5;
      ctx.fillStyle = '#0d1520';
      ctx.fillRect(12, y, barW, barH);
      const progress = Math.min(1, cSys._growthProgress ?? 0);
      if (progress > 0) {
        ctx.fillStyle = '#44cc66';
        ctx.fillRect(12, y, Math.round(barW * progress), barH);
      }
      ctx.strokeStyle = '#1a3050';
      ctx.strokeRect(12, y, barW, barH);
      y += 10;

      ctx.font      = '8px monospace';
      ctx.fillStyle = '#6888aa';
      const emp = cSys._employedPops ?? 0;
      const free = cSys.freePops ?? 0;
      ctx.fillText(`Zatrudn: ${emp.toFixed(2)}  Wolni: ${free.toFixed(2)}`, 12, y + 6);
      y += 14;

      const morale = Math.round(cSys.morale ?? 50);
      const moraleColor = morale >= 60 ? '#44cc66' : morale >= 30 ? '#ffaa44' : '#cc4422';
      ctx.fillStyle = moraleColor;
      ctx.fillText(`Morale: ${morale}%`, 12, y + 6);

      ctx.fillStyle = '#cc88ff';
      ctx.fillText(`Epoka: ${cSys.epochName}`, 110, y + 6);
      y += 14;

      if (cSys.isUnrest) {
        ctx.fillStyle = '#ff4444';
        ctx.fillText('⚠ NIEPOKOJE!', 12, y + 6);
        y += 12;
      }
      if (cSys.isFamine) {
        ctx.fillStyle = '#ff8800';
        ctx.fillText('⚠ GŁÓD!', 12, y + 6);
        y += 12;
      }

      y += 4;
      ctx.strokeStyle = '#1a3050';
      ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(LEFT_W - 8, y); ctx.stroke();
      y += 6;
    }

    // ── Lista instalacji ────────────────────────────────────────
    ctx.font      = '9px monospace';
    ctx.fillStyle = '#2a4060';
    ctx.fillText('INSTALACJE', 12, y + 12);
    y += 20;

    if (!bSys || bSys._active.size === 0) {
      ctx.font      = '9px monospace';
      ctx.fillStyle = '#2a4060';
      ctx.fillText('Brak instalacji', 12, y + 8);
      return;
    }

    bSys._active.forEach((entry, tileKey) => {
      if (y > LH - 60) return;
      const b = entry.building;
      ctx.font      = '9px monospace';
      ctx.fillStyle = CAT_COLORS[b.category] || '#888';
      ctx.fillText(`${b.icon || '🏗'} ${b.namePL}`, 12, y + 8);
      ctx.font      = '8px monospace';
      ctx.fillStyle = '#2a4060';
      ctx.fillText(tileKey, 12, y + 19);
      y += 26;
    });
  }

  // ── Dolny pasek ───────────────────────────────────────────────

  _drawBottomBar() {
    const ctx = this.ctx;
    const BY  = LH - BOTTOM_BAR_H;
    const CX  = LW / 2;

    ctx.fillStyle = 'rgba(6,13,24,0.90)';
    ctx.fillRect(0, BY, LW, BOTTOM_BAR_H);

    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, BY); ctx.lineTo(LW, BY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, BY + 22); ctx.lineTo(LW, BY + 22); ctx.stroke();

    // ── Wiersz 1: info terenu + podpowiedź ────────────────────
    ctx.font      = '9px monospace';
    ctx.fillStyle = '#6888aa';
    ctx.textAlign = 'left';
    ctx.fillText('Klik: wybierz  |  ESC: wróć', 14, BY + 14);

    if (this._hoveredTile) {
      const t       = this._hoveredTile;
      const terrain = TERRAIN_TYPES[t.type];
      const name    = terrain?.namePL ?? t.type;
      const bldg    = t.buildingId ? BUILDINGS[t.buildingId]?.namePL : null;
      const capital = t.capitalBase ? '🏛 Stolica' : null;

      // Nazwa terenu + budynek
      let info = name;
      if (capital && bldg) info += ` → ${capital} + ${bldg}`;
      else if (capital)    info += ` → ${capital}`;
      else if (bldg)       info += ` → ${bldg}`;

      // Zasoby bazowe terenu (baseYield) — np. "⛏0.8  💧2.5"
      const by = terrain?.baseYield ?? {};
      const yieldParts = [];
      const RI = { minerals: '⛏', energy: '⚡', organics: '🌿', water: '💧', research: '🔬' };
      for (const [res, val] of Object.entries(by)) {
        if (val) yieldParts.push(`${RI[res] ?? res}${val}`);
      }

      // Modyfikatory produkcji (yieldBonus) — np. "×1.6⛏"
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

      // Rysuj: nazwa terenu po lewej-centrum
      ctx.textAlign = 'left';
      ctx.fillStyle = '#c8e8ff';
      const infoX = 200;
      ctx.fillText(info, infoX, BY + 14);

      // Zasoby bazowe + modyfikatory obok nazwy terenu
      if (yieldParts.length > 0 || modParts.length > 0) {
        const infoW = ctx.measureText(info).width;
        ctx.font      = '8px monospace';
        ctx.fillStyle = '#88aacc';
        const allParts = [...yieldParts, ...modParts].join('  ');
        ctx.fillText(allParts, infoX + infoW + 10, BY + 14);
      }
    }

    // ── Wiersz 2: kontrolki czasu ─────────────────────────────
    const { isPaused, multiplierIndex, displayText } = this._timeState;
    const TY = BY + 38;

    ctx.font      = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = isPaused ? '#88ffcc' : '#6888aa';
    ctx.fillText(isPaused ? '▶ GRAJ' : '⏸ PAUZA', CX - 190, TY);

    ctx.fillStyle = '#2a4060';
    ctx.fillText('|', CX - 136, TY);

    const speedLabels = ['×1', '×2', '×4', '×8', '×16'];
    speedLabels.forEach((label, i) => {
      const bx = CX - 100 + i * 50;
      const isActive = !isPaused && multiplierIndex === i + 1;
      ctx.font      = '11px monospace';
      ctx.fillStyle = isActive ? '#88ffcc' : '#6888aa';
      ctx.textAlign = 'center';
      ctx.fillText(label, bx, TY);
    });

    ctx.fillStyle = '#2a4060';
    ctx.fillText('|', CX + 116, TY);

    if (displayText) {
      ctx.font      = '10px monospace';
      ctx.fillStyle = '#c8e8ff';
      ctx.textAlign = 'center';
      ctx.fillText(displayText, CX + 196, TY);
    }

    ctx.textAlign = 'left';
  }

  // ── Panel budowania (prawy) ───────────────────────────────────

  _drawBuildPanel() {
    const ctx  = this.ctx;
    const tile = this._buildPanelTile;
    if (!tile) return;

    const BPX   = LW - RIGHT_W;
    const terrain = TERRAIN_TYPES[tile.type];
    const bSys  = window.KOSMOS?.buildingSystem;
    const tSys  = window.KOSMOS?.techSystem;

    ctx.fillStyle = 'rgba(6,13,24,0.95)';
    ctx.fillRect(BPX, HEADER_H, RIGHT_W, LH - HEADER_H);
    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(BPX, HEADER_H); ctx.lineTo(BPX, LH); ctx.stroke();

    // Nagłówek pola
    ctx.font      = '10px monospace';
    ctx.fillStyle = '#c8e8ff';
    ctx.fillText(terrain?.namePL ?? tile.type, BPX + 8, HEADER_H + 20);

    if (tile.strategicResource) {
      ctx.font      = '9px monospace';
      ctx.fillStyle = STRAT_COLORS[tile.strategicResource] || '#fff';
      ctx.fillText(`Zasób: ${tile.strategicResource}`, BPX + 8, HEADER_H + 34);
    }

    // Stolica (wirtualny budynek — nie blokuje budowy)
    let buildListY = HEADER_H + 48;
    if (tile.capitalBase) {
      ctx.font      = '9px monospace';
      ctx.fillStyle = '#4488ff';
      ctx.fillText('🏛 Stolica', BPX + 8, buildListY);
      buildListY += 14;
    }

    // Aktualny budynek
    if (tile.buildingId && BUILDINGS[tile.buildingId]) {
      const b = BUILDINGS[tile.buildingId];
      ctx.font      = '9px monospace';
      ctx.fillStyle = CAT_COLORS[b.category] || '#fff';
      ctx.fillText(`${b.icon} ${b.namePL}`, BPX + 8, buildListY);

      // Przycisk rozbiórki (nie dla Stolicy)
      const demolishY = buildListY + 6;
      if (!b.isColonyBase && !b.isCapital) {
        ctx.fillStyle = 'rgba(100,30,30,0.8)';
        ctx.fillRect(BPX + 8, demolishY, RIGHT_W - 16, 18);
        ctx.strokeStyle = '#cc4422';
        ctx.strokeRect(BPX + 8, demolishY, RIGHT_W - 16, 18);
        ctx.font      = '9px monospace';
        ctx.fillStyle = '#ff8888';
        ctx.textAlign = 'center';
        ctx.fillText('[ Rozbiórka ]', BPX + RIGHT_W / 2, demolishY + 11);
        ctx.textAlign = 'left';
      }
    } else {
      // Lista budynków (dostępne + niedostępne z powodem)
      ctx.font      = '9px monospace';
      ctx.fillStyle = '#2a4060';
      ctx.fillText('Budynki:', BPX + 8, buildListY);

      let yy = buildListY + 12;
      const cSys = window.KOSMOS?.civSystem;

      Object.values(BUILDINGS).forEach(b => {
        if (yy > LH - 50) return;
        if (b.isColonyBase || b.isCapital) return;

        // Sprawdź powód niedostępności
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
          const resourceOk = Object.entries(b.cost || {}).every(([res, amt]) => (this._resources[res] ?? 0) >= amt);
          const popCost = b.popCost ?? 0.25;
          const popOk   = popCost <= 0 || (cSys && cSys.freePops >= popCost);
          if (!resourceOk) reason = 'Brak surowców';
          else if (!popOk) reason = 'Brak POPów';
        }

        const blocked  = reason === 'Zły teren' || (reason && reason.startsWith('Wymaga'));
        const affordable = !reason;
        const rowH = blocked ? 36 : 28;

        // Tło i ramka
        ctx.fillStyle   = blocked ? 'rgba(30,8,8,0.85)' : (affordable ? 'rgba(13,26,46,0.90)' : 'rgba(8,14,24,0.90)');
        ctx.fillRect(BPX + 8, yy, RIGHT_W - 16, rowH);
        ctx.strokeStyle = blocked ? '#441818' : (affordable ? '#2a5080' : '#111828');
        ctx.lineWidth   = 1;
        ctx.strokeRect(BPX + 8, yy, RIGHT_W - 16, rowH);

        // Nazwa budynku
        ctx.font      = '9px monospace';
        ctx.fillStyle = blocked ? '#663333' : (affordable ? (CAT_COLORS[b.category] || '#fff') : '#2a3050');
        ctx.fillText(`${b.icon} ${b.namePL}`, BPX + 14, yy + 12);

        // Koszt
        const costStr = Object.entries(b.cost || {}).map(([k, v]) => `${RESOURCE_ICONS?.[k] ?? k}${v}`).join(' ');
        ctx.font      = '8px monospace';
        ctx.fillStyle = blocked ? '#442222' : (affordable ? '#2a4060' : '#181e28');
        ctx.fillText(costStr, BPX + 14, yy + 23);

        const popCost = b.popCost ?? 0.25;
        if (popCost > 0) {
          const hasFreePops = cSys && cSys.freePops >= popCost;
          ctx.fillStyle = blocked ? '#442222' : (hasFreePops ? '#448866' : '#884422');
          ctx.fillText(`${popCost}👤`, BPX + RIGHT_W - 48, yy + 23);
        }

        // Powód blokady
        if (blocked) {
          ctx.font      = '7px monospace';
          ctx.fillStyle = '#884444';
          ctx.fillText(`❌ ${reason}`, BPX + 14, yy + 33);
        }

        yy += rowH + 4;
      });
    }
  }

  // ── Hit testing ───────────────────────────────────────────────

  _hitTestClose(mx, my) {
    if (mx >= 8 && mx <= 80 && my >= 4 && my <= TOP_BAR_H - 4) {
      this._close();
      return true;
    }
    // Przycisk ✏ zmiany nazwy planety (obok nazwy w top barze)
    if (this.planet && my >= 4 && my <= TOP_BAR_H - 4) {
      const ctx = this.ctx;
      ctx.font = '14px monospace';
      const nameW = ctx.measureText(this.planet.name).width;
      const editX = LW / 2 + nameW / 2 + 2;
      if (mx >= editX && mx <= editX + 20) {
        showRenameModal(this.planet.name).then(newName => {
          if (newName) this.planet.name = newName;
        });
        return true;
      }
    }
    return false;
  }

  _hitTestTimeBar(mx, my) {
    const BY = LH - BOTTOM_BAR_H;
    if (my < BY + 22 || my > LH) return false;

    const CX = LW / 2;
    const { isPaused } = this._timeState;

    if (mx >= CX - 240 && mx <= CX - 136) {
      isPaused ? EventBus.emit('time:play') : EventBus.emit('time:pause');
      return true;
    }

    for (let i = 0; i < 5; i++) {
      const bx = CX - 100 + i * 50;
      if (mx >= bx - 24 && mx <= bx + 24) {
        EventBus.emit('time:setMultiplier', { index: i + 1 });
        EventBus.emit('time:play');
        return true;
      }
    }

    return true; // Pochłoń każdy klik w dolnym pasku
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

    // Przesunięcie Y gdy Stolica jest na hexie
    const capitalOffset = tile.capitalBase ? 14 : 0;

    if (tile.buildingId && BUILDINGS[tile.buildingId]) {
      const bDef = BUILDINGS[tile.buildingId];
      if (bDef?.isColonyBase || bDef?.isCapital) return false;
      // Rozbiórka — Y przesunięte o capitalOffset
      const demolishY = HEADER_H + 54 + capitalOffset;
      if (mx >= BPX + 8 && mx <= LW - 8 && my >= demolishY && my <= demolishY + 18) {
        const key = `${tile.q},${tile.r}`;
        EventBus.emit('planet:demolishRequest', { planet: this.planet, tileKey: key, tile });
        return true;
      }
    } else {
      // Buduj — iteruj przez WSZYSTKIE budynki (identycznie jak _drawBuildPanel)
      let yy   = HEADER_H + 60 + capitalOffset;
      const tSys = window.KOSMOS?.techSystem;
      const cSys = window.KOSMOS?.civSystem;
      for (const b of Object.values(BUILDINGS)) {
        if (yy > LH - 50) break;
        if (b.isColonyBase || b.isCapital) continue;

        // Sprawdź powód niedostępności (ta sama logika co _drawBuildPanel)
        let reason = null;
        const terrainDef = TERRAIN_TYPES[tile.type];
        const terrainOk = !terrainDef?.buildable ? false
          : b.terrainOnly ? b.terrainOnly.includes(tile.type)
          : b.terrainAny  ? true
          : terrainDef.allowedCategories.includes(b.category);
        if (!terrainOk) {
          reason = 'blocked';
        } else if (b.requires && !tSys?.isResearched(b.requires)) {
          reason = 'blocked';
        } else {
          const resourceOk = Object.entries(b.cost || {}).every(([res, amt]) => (this._resources[res] ?? 0) >= amt);
          const popCost = b.popCost ?? 0.25;
          const popOk   = popCost <= 0 || (cSys && cSys.freePops >= popCost);
          if (!resourceOk || !popOk) reason = 'unaffordable';
        }

        const blocked = reason === 'blocked';
        const rowH = blocked ? 36 : 28;

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
