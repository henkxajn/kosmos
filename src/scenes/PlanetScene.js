// PlanetScene — mapa powierzchni planety (hex 4X)
// Przepisana: bez Phasera, Canvas 2D na #planet-canvas
//
// Wyświetlana jako overlay nad Three.js gdy gracz otwiera mapę kolonii.
// HexGrid, PlanetMapGenerator, BuildingSystem — bez zmian.

import EventBus              from '../core/EventBus.js';
import { HexGrid }           from '../map/HexGrid.js';
import { TERRAIN_TYPES }     from '../map/HexTile.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { BUILDINGS, RESOURCE_ICONS, formatRates, formatCost } from '../data/BuildingsData.js';
import { TECHS }             from '../data/TechData.js';
import { showRenameModal }   from '../ui/ModalInput.js';

// ── Stałe layoutu ───────────────────────────────────────────
// HEX_SIZE dynamiczny — obliczany per planeta/rozdzielczość w _calcOptimalHexSize()
const TOP_BAR_H    = 44;
const RES_BAR_H    = 44;
const HEADER_H     = TOP_BAR_H + RES_BAR_H;
const BOTTOM_BAR_H = 52;  // 2 wiersze: info o terenie + kontrolki czasu
const LEFT_W       = 220;
const RIGHT_W      = 234;

const W = window.innerWidth;
const H = window.innerHeight;
// Skala UI — identyczny wzorzec jak UIManager; rysujemy w logicznych LW×LH px
const PS_SCALE = Math.min(W / 1280, H / 720);
const LW = Math.round(W / PS_SCALE);  // logiczna szerokość (≈1280)
const LH = Math.round(H / PS_SCALE);  // logiczna wysokość  (≈720)

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

export class PlanetScene {
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
    this._screenCX     = 0;
    this._screenCY     = 0;
    this._gridCenter   = { x: 0, y: 0 };
    this._prevMultiplierIndex = 1;
    this._hexSize      = 32;  // dynamicznie nadpisywany w open()

    // Panel budowania
    this._buildPanelTile = null;
    this._buildPanelScroll = 0;

    // Stan kontrolek czasu
    this._timeState = { isPaused: true, multiplierIndex: 1, displayText: '' };

    // Eventy
    this._onBuildResult    = null;
    this._onDemolishResult = null;
    this._onKeyDown        = null;
    this._onResourceChange = null;
    this._onTimeState      = null;
    this._onTimeDisplay    = null;

    // Pętla rysowania (requestAnimationFrame)
    this._animFrameId = null;
  }

  // Otwiera scenę dla podanej planety
  open(planet, prevMultiplierIndex = 1) {
    this.planet              = planet;
    this._prevMultiplierIndex = prevMultiplierIndex;
    this.isOpen              = true;
    this._hoveredTile        = null;
    this._selectedTile       = null;
    this._buildPanelTile     = null;

    // Zwolnij czas
    EventBus.emit('time:setMultiplier', { index: 1 });
    EventBus.emit('time:pause');

    // Generuj siatkę
    this.grid = PlanetMapGenerator.generate(planet, true);

    // Ustaw gridHeight w BuildingSystem (do modyfikatora polarnego)
    if (window.KOSMOS?.buildingSystem) {
      window.KOSMOS.buildingSystem._gridHeight = this.grid.height;
    }

    // Oblicz optymalny rozmiar heksów na podstawie dostępnej przestrzeni logicznej
    this._hexSize = this._calcOptimalHexSize();

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
    if (bSys && bSys._active.size === 0 && window.KOSMOS?.civMode) {
      const baseTile = this._findColonyBaseTile();
      if (baseTile) {
        EventBus.emit('planet:buildRequest', { tile: baseTile, buildingId: 'colony_base' });
      }
    }

    // Geometryczny środek bounding-box siatki (nie środek kafelka!)
    // grid.gridCenter() zwraca pixel środkowego kafelka, co NIE jest centrum bbox.
    // Używamy: geoCenter.x = -hexR * sqrt(3)/2 + gs.w/2, geoCenter.y = -hexR + gs.h/2
    const gsBB = this.grid.gridPixelSize(this._hexSize);
    this._gridCenter = {
      x: -this._hexSize * Math.sqrt(3) / 2 + gsBB.w / 2,
      y: -this._hexSize + gsBB.h / 2,
    };
    this._screenCX   = LEFT_W + Math.round((LW - LEFT_W - RIGHT_W) / 2);
    this._screenCY   = HEADER_H + (LH - HEADER_H - BOTTOM_BAR_H) / 2;

    // Ustaw rozdzielczość canvas (domyślnie 300×150 → ogromne skalowanie przez CSS)
    this.canvas.width  = W;
    this.canvas.height = H;

    // Pokaż canvas
    this.canvas.style.display = 'block';

    // Ustaw event-layer nad planet-canvas
    const layer = document.getElementById('event-layer');
    if (layer) layer.style.zIndex = '5';

    // Eventy
    this._registerEvents(layer);

    // Żądaj snapshot surowców
    EventBus.emit('resource:requestSnapshot');

    // Start pętli rysowania
    this._startDrawLoop();
  }

  // Zamknij scenę
  _close() {
    this.isOpen = false;
    this.canvas.style.display = 'none';

    const layer = document.getElementById('event-layer');
    if (layer) layer.style.zIndex = '3';

    // Usuń eventy
    this._unregisterEvents(layer);

    // Zatrzymaj pętlę
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }

    // Przywróć prędkość czasu
    EventBus.emit('time:setMultiplier', { index: this._prevMultiplierIndex });
    EventBus.emit('time:play');
  }

  _registerEvents(layer) {
    this._onKeyDown = (e) => {
      if (e.code === 'Escape') this._close();
    };
    document.addEventListener('keydown', this._onKeyDown);

    this._onMouseMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      // Przelicz CSS px → logiczne px (uwzględnia PS_SCALE)
      const mx   = (e.clientX - rect.left) / PS_SCALE;
      const my   = (e.clientY - rect.top)  / PS_SCALE;
      const tile = this._pixelToTile(mx, my);
      if (tile !== this._hoveredTile) {
        this._hoveredTile = tile;
        layer.style.cursor = tile ? 'pointer' : 'default';
      }
    };

    this._onClick = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      // Przelicz CSS px → logiczne px (uwzględnia PS_SCALE)
      const mx   = (e.clientX - rect.left) / PS_SCALE;
      const my   = (e.clientY - rect.top)  / PS_SCALE;

      // Sprawdź przyciski UI najpierw
      if (this._hitTestClose(mx, my))      return;
      if (this._hitTestTimeBar(mx, my))    return;
      if (this._hitTestBuildPanel(mx, my)) return;

      // Klik na hex
      const tile = this._pixelToTile(mx, my);
      if (tile) {
        this._selectedTile   = tile;
        this._buildPanelTile = tile;
      } else {
        this._selectedTile   = null;
        this._buildPanelTile = null;
      }
    };

    this._onBuildResult = ({ success, tile, reason }) => {
      if (success) {
        // Synchronizuj buildingId i capitalBase
        const bSys = window.KOSMOS?.buildingSystem;
        if (bSys) {
          // Wyczyść stan
          this.grid.toArray().forEach(t => {
            t.buildingId = null;
            t.capitalBase = false;
          });
          // Ustaw z _active
          bSys._active.forEach((entry, activeKey) => {
            if (activeKey.startsWith('capital_')) {
              const coordKey = activeKey.replace('capital_', '');
              const [q, r] = coordKey.split(',').map(Number);
              const t = this.grid.get(q, r);
              if (t) t.capitalBase = true;
              return;
            }
            const [q, r] = activeKey.split(',').map(Number);
            const t = this.grid.get(q, r);
            if (t) t.buildingId = entry.building.id;
          });
        }
      }
    };

    this._onDemolishResult = ({ success }) => {
      if (success && this.grid) {
        const bSys = window.KOSMOS?.buildingSystem;
        if (bSys) {
          this.grid.toArray().forEach(t => {
            t.buildingId = null;
            t.capitalBase = false;
          });
          bSys._active.forEach((entry, activeKey) => {
            if (activeKey.startsWith('capital_')) {
              const coordKey = activeKey.replace('capital_', '');
              const [q, r] = coordKey.split(',').map(Number);
              const t = this.grid.get(q, r);
              if (t) t.capitalBase = true;
              return;
            }
            const [q, r] = activeKey.split(',').map(Number);
            const t = this.grid.get(q, r);
            if (t) t.buildingId = entry.building.id;
          });
        }
      }
    };

    // ResourceSystem emituje { resources: { key: { amount, capacity, perYear } } }
    const applyRes = ({ resources }) => {
      if (!resources) return;
      for (const [k, v] of Object.entries(resources)) {
        this._resources[k] = v.amount ?? 0;
      }
    };
    this._onResourceChange = applyRes;
    this._onSnapshot       = applyRes;

    // Stan czasu (dla kontrolek prędkości w dolnym pasku)
    this._onTimeState = ({ isPaused, multiplierIndex }) => {
      this._timeState.isPaused        = isPaused;
      this._timeState.multiplierIndex = multiplierIndex;
    };
    this._onTimeDisplay = ({ displayText, multiplierIndex }) => {
      this._timeState.displayText     = displayText;
      this._timeState.multiplierIndex = multiplierIndex;
    };

    if (layer) {
      layer.addEventListener('mousemove', this._onMouseMove);
      layer.addEventListener('click',     this._onClick);
    }
    EventBus.on('planet:buildResult',   this._onBuildResult);
    EventBus.on('planet:demolishResult', this._onDemolishResult);
    EventBus.on('resource:changed',     this._onResourceChange);
    EventBus.on('resource:snapshot',    this._onSnapshot);
    EventBus.on('time:stateChanged',    this._onTimeState);
    EventBus.on('time:display',         this._onTimeDisplay);
  }

  _unregisterEvents(layer) {
    if (this._onKeyDown)  document.removeEventListener('keydown', this._onKeyDown);
    if (layer) {
      if (this._onMouseMove) layer.removeEventListener('mousemove', this._onMouseMove);
      if (this._onClick)     layer.removeEventListener('click',     this._onClick);
    }
    EventBus.off('planet:buildResult',   this._onBuildResult);
    EventBus.off('planet:demolishResult', this._onDemolishResult);
    EventBus.off('resource:changed',     this._onResourceChange);
    EventBus.off('resource:snapshot',    this._onSnapshot);
    EventBus.off('time:stateChanged',    this._onTimeState);
    EventBus.off('time:display',         this._onTimeDisplay);
  }

  // Oblicza optymalny HEX_SIZE aby mapa wypełniała dostępną przestrzeń logiczną
  _calcOptimalHexSize() {
    if (!this.grid) return 32;
    const availW = LW - LEFT_W - RIGHT_W - 40;
    const availH = LH - HEADER_H - BOTTOM_BAR_H - 40;
    const hexByW = availW / (Math.sqrt(3) * (this.grid.width + 0.5));
    const hexByH = availH / (1.5 * this.grid.height + 0.5);
    return Math.max(24, Math.min(72, Math.floor(Math.min(hexByW, hexByH))));
  }

  // ── Pętla rysowania ──────────────────────────────────────────
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
    // Skaluj logiczne LW×LH → fizyczne W×H (identyczny wzorzec jak UIManager)
    ctx.save();
    ctx.setTransform(PS_SCALE, 0, 0, PS_SCALE, 0, 0);
    ctx.clearRect(0, 0, LW, LH);

    // Tło
    ctx.fillStyle = 'rgba(6,8,16,0.96)';
    ctx.fillRect(0, 0, LW, LH);

    // Panel za siatką
    if (this.grid) {
      const gs  = this.grid.gridPixelSize(this._hexSize);
      const pad = 18;
      ctx.fillStyle = 'rgba(13,21,32,0.85)';
      ctx.fillRect(
        this._screenCX - gs.w / 2 - pad,
        this._screenCY - gs.h / 2 - pad,
        gs.w + pad * 2,
        gs.h + pad * 2
      );
      ctx.strokeStyle = '#2a4060';
      ctx.lineWidth   = 1;
      ctx.strokeRect(
        this._screenCX - gs.w / 2 - pad,
        this._screenCY - gs.h / 2 - pad,
        gs.w + pad * 2,
        gs.h + pad * 2
      );

      this._drawAllTiles();
    }

    // Górny pasek
    this._drawTopBar();

    // Pasek surowców
    this._drawResourceBar();

    // Lewy panel instalacji
    this._drawLeftPanel();

    // Dolny pasek info
    this._drawBottomBar();

    // Panel budowania (prawy)
    if (this._buildPanelTile) {
      this._drawBuildPanel();
    }

    ctx.restore();
  }

  // ── Renderowanie heksów ──────────────────────────────────────
  _drawAllTiles() {
    if (!this.grid) return;
    this.grid.toArray().forEach(tile => this._drawTile(tile));
  }

  _drawTile(tile) {
    const ctx = this.ctx;
    const pos = this._tileScreenPos(tile.q, tile.r);
    const pts = this._hexCorners(pos.x, pos.y, this._hexSize - 1);
    const terrain = TERRAIN_TYPES[tile.type];
    if (!terrain) return;

    const isHovered  = tile === this._hoveredTile;
    const isSelected = tile === this._selectedTile;

    // Wypełnienie
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();

    // terrain.color to liczba hex (np. 0x7ab648) — konwersja na string CSS
    ctx.fillStyle = '#' + (terrain.color || 0x334455).toString(16).padStart(6, '0');
    ctx.fill();

    // Overlay budynku
    if (tile.buildingId && BUILDINGS[tile.buildingId]) {
      const b = BUILDINGS[tile.buildingId];
      const catColor = CAT_COLORS[b.category] || '#888888';
      ctx.fillStyle = catColor + '38';
      ctx.fill();
    }

    // Hover/selected overlay
    if (isSelected) {
      ctx.fillStyle = 'rgba(136,255,204,0.18)';
      ctx.fill();
    } else if (isHovered) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fill();
    }

    // Obramowanie
    ctx.strokeStyle = isSelected ? '#88ffcc' : isHovered ? '#ffffff' : '#1a2a3a';
    ctx.lineWidth   = isSelected ? 2 : 1;
    ctx.stroke();

    // Ikona budynku lub Stolicy
    if (tile.buildingId && BUILDINGS[tile.buildingId]) {
      ctx.font      = '14px serif';
      ctx.textAlign = 'center';
      ctx.fillText(BUILDINGS[tile.buildingId].icon || '🏗', pos.x, pos.y + 5);
      // Mała ikona Stolicy w rogu jeśli oba
      if (tile.capitalBase) {
        ctx.font      = '8px serif';
        ctx.fillText('🏛', pos.x - this._hexSize * 0.4, pos.y - this._hexSize * 0.3);
      }
    } else if (tile.capitalBase) {
      ctx.font      = '14px serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏛', pos.x, pos.y + 5);
    }

    // Zasób strategiczny
    if (tile.strategicResource) {
      const sc = STRAT_COLORS[tile.strategicResource] || '#ffffff';
      ctx.font        = '8px monospace';
      ctx.fillStyle   = sc;
      ctx.textAlign   = 'center';
      ctx.fillText(tile.strategicResource, pos.x, pos.y + this._hexSize - 6);
    }
  }

  _hexCorners(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    return pts;
  }

  _tileScreenPos(q, r) {
    const local = HexGrid.hexToPixel(q, r, this._hexSize);
    return {
      x: this._screenCX + local.x - this._gridCenter.x,
      y: this._screenCY + local.y - this._gridCenter.y,
    };
  }

  // Znajdź najlepsze pole na Bazę Kolonijną (spirala od centrum)
  _findColonyBaseTile() {
    if (!this.grid) return null;
    const w = this.grid.width;
    const h = this.grid.height;
    // Środek siatki (offset coords)
    const centerQ = Math.floor(w / 2);
    const centerR = Math.floor(h / 2);
    const centerTile = this.grid.getOffset(centerQ, centerR);

    // Priorytet terenów: plains > forest > desert > tundra > dowolny buildable
    const preferred = ['plains', 'forest', 'desert', 'tundra'];

    // Spirala od centrum — próbuj kolejne pierścienie
    const maxRadius = Math.max(w, h);
    for (const prefType of preferred) {
      // Sprawdź centrum
      if (centerTile && centerTile.type === prefType && !centerTile.isOccupied) {
        const terrain = TERRAIN_TYPES[centerTile.type];
        if (terrain?.buildable) return centerTile;
      }
      // Spirala
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

    // Fallback: dowolny buildable
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

  _pixelToTile(px, py) {
    if (!this.grid) return null;
    if (px < LEFT_W || px > LW - RIGHT_W) return null;
    if (py < HEADER_H || py > LH - BOTTOM_BAR_H) return null;
    const localX = px - this._screenCX + this._gridCenter.x;
    const localY = py - this._screenCY + this._gridCenter.y;
    const { q, r } = HexGrid.pixelToHex(localX, localY, this._hexSize);
    return this.grid.get(q, r) || null;
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
      ctx.fillText(`${this.planet.planetType ?? ''} ${temp}`, LW / 2, TOP_BAR_H / 2 + 18);
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

    // ── Widget POP (nad listą instalacji) ─────────────────────────
    let y = HEADER_H + 6;

    if (cSys) {
      // Populacja / housing
      ctx.font      = '10px monospace';
      ctx.fillStyle = '#c8e8ff';
      ctx.fillText(`👤 POP: ${cSys.population} / ${cSys.housing}`, 12, y + 12);
      y += 18;

      // Pasek postępu wzrostu
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

      // Zatrudnieni / wolni
      ctx.font      = '8px monospace';
      ctx.fillStyle = '#6888aa';
      const emp = cSys._employedPops ?? 0;
      const free = cSys.freePops ?? 0;
      ctx.fillText(`Zatrudn: ${emp.toFixed(2)}  Wolni: ${free.toFixed(2)}`, 12, y + 6);
      y += 14;

      // Morale
      const morale = Math.round(cSys.morale ?? 50);
      const moraleColor = morale >= 60 ? '#44cc66' : morale >= 30 ? '#ffaa44' : '#cc4422';
      ctx.fillStyle = moraleColor;
      ctx.fillText(`Morale: ${morale}%`, 12, y + 6);

      // Epoka (obok morale)
      ctx.fillStyle = '#cc88ff';
      ctx.fillText(`Epoka: ${cSys.epochName}`, 110, y + 6);
      y += 14;

      // Kryzysy
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

      // Separator
      y += 4;
      ctx.strokeStyle = '#1a3050';
      ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(LEFT_W - 8, y); ctx.stroke();
      y += 6;
    }

    // ── Lista instalacji ──────────────────────────────────────────
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

  // ── Dolny pasek info ──────────────────────────────────────────
  _drawBottomBar() {
    const ctx  = this.ctx;
    const BY   = LH - BOTTOM_BAR_H;
    const CX   = LW / 2;

    // Tło
    ctx.fillStyle = 'rgba(6,13,24,0.90)';
    ctx.fillRect(0, BY, LW, BOTTOM_BAR_H);

    // Separator górny
    ctx.strokeStyle = '#1a3050';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, BY); ctx.lineTo(LW, BY); ctx.stroke();

    // Separator środkowy (między wierszami)
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
    const TY = BY + 38;   // środek Y drugiego wiersza

    // Przycisk pauza/graj
    ctx.font      = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = isPaused ? '#88ffcc' : '#6888aa';
    ctx.fillText(isPaused ? '▶ GRAJ' : '⏸ PAUZA', CX - 190, TY);

    ctx.fillStyle = '#2a4060';
    ctx.fillText('|', CX - 136, TY);

    // Przyciski prędkości ×1 … ×16
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

    // Wyświetlacz czasu gry
    if (displayText) {
      ctx.font      = '10px monospace';
      ctx.fillStyle = '#c8e8ff';
      ctx.textAlign = 'center';
      ctx.fillText(displayText, CX + 196, TY);
    }

    ctx.textAlign = 'left';
  }

  // ── Panel budowania ───────────────────────────────────────────
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

        ctx.fillStyle   = blocked ? 'rgba(30,8,8,0.85)' : (affordable ? 'rgba(13,26,46,0.90)' : 'rgba(8,14,24,0.90)');
        ctx.fillRect(BPX + 8, yy, RIGHT_W - 16, rowH);
        ctx.strokeStyle = blocked ? '#441818' : (affordable ? '#2a5080' : '#111828');
        ctx.lineWidth   = 1;
        ctx.strokeRect(BPX + 8, yy, RIGHT_W - 16, rowH);

        ctx.font      = '9px monospace';
        ctx.fillStyle = blocked ? '#663333' : (affordable ? CAT_COLORS[b.category] : '#2a3050');
        ctx.fillText(`${b.icon} ${b.namePL}`, BPX + 14, yy + 12);

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

        if (blocked) {
          ctx.font      = '7px monospace';
          ctx.fillStyle = '#884444';
          ctx.fillText(`❌ ${reason}`, BPX + 14, yy + 33);
        }

        yy += rowH + 4;
      });
    }
  }

  // ── Hit testing przycisków ─────────────────────────────────────

  _hitTestClose(mx, my) {
    // Przycisk "← Wróć" (lewy górny róg)
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
    // Dolny wiersz paska (wiersz 2 od BY+22 do LH)
    const BY = LH - BOTTOM_BAR_H;
    if (my < BY + 22 || my > LH) return false;

    const CX = LW / 2;
    const { isPaused } = this._timeState;

    // Przycisk pauza/graj (lewo od separatora)
    if (mx >= CX - 240 && mx <= CX - 136) {
      isPaused ? EventBus.emit('time:play') : EventBus.emit('time:pause');
      return true;
    }

    // Przyciski prędkości ×1…×16 (5 przycisków co 50px)
    for (let i = 0; i < 5; i++) {
      const bx = CX - 100 + i * 50;
      if (mx >= bx - 24 && mx <= bx + 24) {
        EventBus.emit('time:setMultiplier', { index: i + 1 });
        EventBus.emit('time:play');
        return true;
      }
    }

    // Pochłoń każdy klik w dolnym pasku (zapobiega zaznaczeniu hexów)
    return true;
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
