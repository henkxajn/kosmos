// ColonyOverlay — mapa 2D planety (klawisz C)
//
// Tapered hex grid: owalny kształt — bieguny wąskie, równik szeroki.
// Mapa zajmuje CAŁY overlay. Floating panel pojawia się obok zaznaczonego hexa.
// Nagłówek: nazwa kolonii + POP + budynki.

import { BaseOverlay }  from './BaseOverlay.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { BUILDINGS, RESOURCE_ICONS, formatCost } from '../data/BuildingsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';
import { HexGrid }      from '../map/HexGrid.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { hashCode, TEXTURE_VARIANTS } from '../renderer/PlanetTextureUtils.js';
import EventBus          from '../core/EventBus.js';
import { ANOMALIES }     from '../data/AnomalyData.js';
import { t }   from '../i18n/i18n.js';
import { getTerrainTexture, getTransitionTexture, texturesLoaded } from '../renderer/TerrainTextures.js';
import { HEX_DIRECTIONS } from '../map/HexGrid.js';

const HDR_H = 32;
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
    this._selectedUnit = null;
    this._unitSprites = new Map();
    this._loadUnitSprites();

    // Drag
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
    EventBus.on('planet:pendingFulfilled', () => this._onBuildingChanged());
    EventBus.on('planet:pendingCancelled', () => this._onBuildingChanged());
    EventBus.on('planet:constructionComplete', () => this._onBuildingChanged());
    EventBus.on('planet:constructionProgress', () => this._onBuildingChanged());

    // Away Team — tryb wyboru hexa lądowania
    this._landingMode = false;
    this._landingVesselId = null;
    EventBus.on('vessel:awayTeamLanding', ({ vesselId, targetId }) => {
      // Otwórz overlay dla planety docelowej w trybie lądowania
      const colMgr = window.KOSMOS?.colonyManager;
      if (colMgr) {
        // Upewnij się że kolonia jest aktywna
        colMgr.switchActiveColony(targetId);
        this._selectedColonyId = targetId;
      }
      this._landingMode = true;
      this._landingVesselId = vesselId;
      if (!this.visible) {
        this.show({});
      }
      this._showFlash('🤖 Wybierz hex lądowania Away Team');
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
    if (colMgr) this._selectedColonyId = colMgr.activePlanetId;
    this._selectedHex = null;
    this._hoveredBuildId = null;

    const colony = this._getColony();
    const grid = this._getGrid(colony);
    if (grid) { this._fitMapToView(grid); this._centerOnCapital(grid); }

    if (opts.originX !== undefined) this._animateOpen(opts.originX, opts.originY);

    // Auto-spawn rovera jeśli brak jednostek na planecie domowej (stare save'y / nowa gra)
    this._autoSpawnRover(colony);
  }

  _autoSpawnRover(colony) {
    if (!colony) return;
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

    // Generuj grid z planety
    const isHome = (pid === window.KOSMOS?.homePlanet?.id);
    const grid = PlanetMapGenerator.generate(colony.planet, isHome);
    this._gridCache[pid] = grid;
    colony.grid = grid;

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

    // Auto-place stolicy przy pierwszym otwarciu (jeśli brak)
    const isOutpost = colony.isOutpost ?? false;
    if (bSys && window.KOSMOS?.civMode && !isOutpost) {
      let hasCapital = false;
      for (const key of bSys._active.keys()) {
        if (key.startsWith('capital_')) { hasCapital = true; break; }
      }
      if (!hasCapital) {
        const baseTile = this._findBestTileForCapital(grid);
        if (baseTile) {
          EventBus.emit('planet:buildRequest', { tile: baseTile, buildingId: 'colony_base' });
          // Re-sync po postawieniu stolicy
          delete this._gridCache[pid];
          return this._getGrid(colony);
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

  _onBuildingChanged() {
    const colony = this._getColony();
    if (!colony) return;
    const grid = this._gridCache[colony.planetId];
    if (grid) this._syncTileBuildings(grid, colony.buildingSystem);
  }

  _centerOnCapital(grid) {
    let cap = null;
    grid.forEach(tile => { if (tile.capitalBase) cap = tile; });
    const target = cap ? grid.tilePixelPos(cap.q, cap.r, this._hexSize) : grid.gridCenter(this._hexSize);
    this._camX = target.x; this._camY = target.y;
  }

  _showFlash(msg) { this._flashMsg = msg; this._flashEnd = Date.now() + 2500; }

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
    ctx.strokeStyle = GLASS_BORDER; ctx.lineWidth = 1;
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
        const sp = this._tileScreenPos(tile, grid, ox, oy, ow, oh);
        // Panel po prawej od hexa (lub lewej jeśli nie mieści się)
        let fx = sp.x + this._hexSize + 8;
        let fy = sp.y - 60;
        if (fx + FLOAT_W > ox + ow - 10) fx = sp.x - FLOAT_W - this._hexSize - 8;
        // Ogranicz pozycję — panel musi mieścić się w overlay
        const panelH = this._floatH ?? 300;
        fy = Math.max(mapY + 4, Math.min(oy + oh - panelH - 4, fy));
        fx = Math.max(ox + 4, Math.min(ox + ow - FLOAT_W - 4, fx));
        this._floatX = fx; this._floatY = fy;
        this._drawFloatingPanel(ctx, fx, fy, tile, colony, grid);
      }
    }

    // Panel jednostki naziemnej
    if (this._selectedUnit && colony) {
      this._drawUnitPanel(ctx, ox, oy, ow, oh);
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

    // Zamknij [X]
    const closeX = ox + ow - 24;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
    ctx.fillText('✕', closeX, oy + 20);
    this._addHit(closeX - 4, oy + 6, 22, 22, 'close');
  }

  // ── Nagłówek ─────────────────────────────────────────────────────────────
  _drawHeader(ctx, ox, oy, ow, colony) {
    ctx.fillStyle = bgAlpha(0.55);
    ctx.fillRect(ox, oy, ow, HDR_H);
    ctx.textBaseline = 'middle';
    const midY = oy + HDR_H / 2;

    if (!colony) {
      ctx.font = `bold 13px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim; ctx.textAlign = 'center';
      ctx.fillText('Brak kolonii', ox + ow / 2, midY);
      return;
    }

    // Lewa: nazwa planety
    ctx.font = `bold 13px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textBright; ctx.textAlign = 'left';
    const name = colony.planet?.name ?? colony.planetId ?? '?';
    ctx.fillText(name, ox + 10, midY);

    // Centrum: podsumowanie + lista budynków
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

    // Stats
    ctx.font = `11px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.text; ctx.textAlign = 'left';
    let sx = ox + 180;
    ctx.fillText(`POP: ${pop}/${housing}`, sx, midY);
    sx += 80;

    // Mini ikony budynków (kompaktowe) z hit zones na tooltip
    for (const [bid, count] of Object.entries(buildingSummary)) {
      const b = BUILDINGS[bid];
      if (!b) continue;
      const label = `${b.icon ?? '?'}${count > 1 ? '×' + count : ''}`;
      ctx.fillStyle = CAT_COLORS[b.category] ?? THEME.text;
      ctx.fillText(label, sx, midY);
      const labelW = ctx.measureText(label).width;
      // Hit zone na ikonę budynku (tooltip)
      this._addHit(sx, oy + 2, labelW + 4, HDR_H - 4, 'headerBuilding', { buildingId: bid, count });
      sx += labelW + 6;
      if (sx > ox + ow - 40) { ctx.fillText('...', sx, midY); break; }
    }

    if (totalBuildings === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Brak budynków', sx, midY);
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

    // Jednostki naziemne (rysowane NAD hexami)
    this._drawUnits(ctx, ox, oy, ow, oh, grid);
  }

  _drawUnitPanel(ctx, ox, oy, ow, oh) {
    const unit = this._selectedUnit;
    if (!unit) return;

    // Sprawdź czy hex pod roverem ma anomalię do analizy
    const colony = this._getColony();
    const grid = colony ? this._getGrid(colony) : null;
    const tile = grid?.get(unit.q, unit.r);
    const canAnalyze = tile?.anomaly && tile.anomalyDetected && !tile.anomalyRevealed;

    // Panel w prawym dolnym rogu overlay
    const pw = 190, ph = canAnalyze ? 160 : 140;
    const px = ox + ow - pw - 8;
    const py = oy + oh - ph - 8;

    // Tło
    ctx.fillStyle = 'rgba(4, 8, 16, 0.92)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#00ffb4';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, pw, ph);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let ly = py + 16;

    // Typ jednostki
    ctx.font = `bold 11px ${THEME.fontFamily}`;
    ctx.fillStyle = '#00ffb4';
    ctx.fillText('🔬 SCIENCE ROVER', px + 8, ly);
    ly += 18;

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
    ly += 16;

    // Pozycja
    ctx.fillText(`Hex: (${unit.q}, ${unit.r})`, px + 8, ly);
    ly += 20;

    // Przycisk 1: Skanuj obszar (survey) — gdy idle
    if (unit.status === 'idle') {
      const bx = px + 8, by = ly - 6, bw = pw - 16, bh = 22;
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#000';
      ctx.font = `bold 10px ${THEME.fontFamily}`;
      ctx.fillText('🔍 Skanuj obszar', bx + 6, by + 12);
      this._addHit(bx, by, bw, bh, 'unitSurvey');
      ly += 26;
    }

    // Przycisk 2: Analizuj anomalię — gdy idle + hex z anomalyDetected
    if (unit.status === 'idle' && canAnalyze) {
      const bx = px + 8, by = ly - 6, bw = pw - 16, bh = 22;
      ctx.fillStyle = '#cc66ff';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#000';
      ctx.font = `bold 10px ${THEME.fontFamily}`;
      ctx.fillText('🔬 Analizuj anomalię', bx + 6, by + 12);
      this._addHit(bx, by, bw, bh, 'unitAnalyze');
      ly += 26;
    }

    // Przycisk: Odznacz
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

  _loadUnitSprites() {
    const roverImg = new Image();
    roverImg.src = 'assets/units/science_rover.png';
    this._unitSprites.set('science_rover', roverImg);
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
      const img = this._unitSprites.get(unit.type);

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
      const t = Date.now() / 1000;  // sekundy (do animacji pulsu)

      // ── Glow pod sprite'em (turkusowa "podstawka") ──
      const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      glowGrad.addColorStop(0, 'rgba(0, 200, 160, 0.35)');
      glowGrad.addColorStop(0.6, 'rgba(0, 200, 160, 0.12)');
      glowGrad.addColorStop(1, 'rgba(0, 200, 160, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // ── Pulsujący ring ──
      const pulsePhase = (Math.sin(t * 2.5) + 1) / 2;  // 0→1→0, ~2.5 Hz
      const ringR = glowR * (0.85 + pulsePhase * 0.25);
      const ringAlpha = 0.2 + pulsePhase * 0.25;
      ctx.strokeStyle = `rgba(0, 255, 180, ${ringAlpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
      ctx.stroke();

      // ── Sprite (flip poziomy gdy patrzy w lewo) ──
      const flip = unit._facingLeft ? -1 : 1;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(flip, 1);
        ctx.drawImage(img, -S / 2, -S / 2, S, S);
        ctx.restore();
      } else {
        ctx.fillStyle = '#00cc88';
        ctx.beginPath();
        ctx.moveTo(sx + S / 3, sy);
        ctx.lineTo(sx, sy + S / 3);
        ctx.lineTo(sx - S / 3, sy);
        ctx.lineTo(sx, sy - S / 3);
        ctx.closePath();
        ctx.fill();
      }

      // ── Ramka selekcji (jaśniejsza, grubsza gdy zaznaczona) ──
      if (this._selectedUnit?.id === unit.id) {
        ctx.strokeStyle = '#00ffb4';
        ctx.lineWidth = 2;
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
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.fill();
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

    // Fog
    if (tile.explored === false) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill(); }

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
      if (rates) h += 13 + Object.keys(rates).filter(k => rates[k] !== 0).length * 14;
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
    ctx.fillStyle = THEME.textBright;
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
      ctx.fillStyle = THEME.text;
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
      ctx.fillStyle = CAT_COLORS[b.category] ?? THEME.textBright;
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
        for (const [res, rate] of Object.entries(rates)) {
          if (rate === 0) continue;
          ctx.fillStyle = rate > 0 ? '#88ff88' : '#ff8888';
          const sign = rate > 0 ? '+' : '';
          ctx.fillText(`${sign}${rate.toFixed?.(1) ?? rate} ${res}`, x + 12, cy); cy += 14;
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
        ctx.fillStyle = THEME.text;
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
      ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.text;
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
      ctx.fillStyle = THEME.textBright;
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

  _getAvailableBuildings(tile) {
    if (!tile) return [];
    const techSys = window.KOSMOS?.techSystem;
    const terrain = TERRAIN_TYPES[tile.type];
    if (!terrain) { console.warn('[ColonyOverlay] Brak TERRAIN_TYPES dla:', tile.type); return []; }
    if (!terrain.buildable) return [];

    const result = Object.values(BUILDINGS)
      .filter(b => {
        if (!b.id || b.isCapital) return false;
        if (b.requires && techSys && !techSys.isResearched(b.requires)) return false;
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
    return true;
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

      if (tile) {
        const mgr = window.KOSMOS?.groundUnitManager;
        const unitOnTile = mgr?.getUnitAt(colony?.planetId, tile.q, tile.r);

        if (this._selectedUnit) {
          // Tryb jednostki aktywny
          if (unitOnTile && unitOnTile.id === this._selectedUnit.id) {
            // Klik na tę samą jednostkę → odznacz
            this._selectedUnit = null;
            this._selectedHex = null;
            return true;
          }
          if (unitOnTile) {
            // Klik na inną jednostkę → przełącz
            this._selectedUnit = unitOnTile;
            this._selectedHex = { q: tile.q, r: tile.r };
            return true;
          }
          // Klik na pusty hex → rozkaz ruchu (nie otwieraj panelu budowy)
          mgr?.moveUnit(this._selectedUnit.id, tile.q, tile.r);
          return true;
        }

        // Brak zaznaczonej jednostki
        if (unitOnTile) {
          // Klik na jednostkę → zaznacz ją (bez floating panelu)
          this._selectedUnit = unitOnTile;
          this._selectedHex = { q: tile.q, r: tile.r };
          this._hoveredBuildId = null;
          return true;
        }

        // Normalny klik na hex → floating panel budowy
        this._selectedHex = { q: tile.q, r: tile.r };
        this._hoveredBuildId = null;
        this._floatScroll = 0;
        return true;
      }
      // Klik na overlay ale poza mapą — deselect wszystko
      this._selectedHex = null;
      this._selectedUnit = null;
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
    }
  }

  handleMouseMove(x, y) {
    if (!this.visible) return;
    super.handleMouseMove(x, y);

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
        let html = `<b>${bd.icon ?? ''} ${bd.namePL ?? bd.id}</b>`;
        if (bd.cost) {
          html += '<br>Koszt: ' + Object.entries(bd.cost).map(([k, v]) => `${k}:${v}`).join(' ');
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

  handleMouseDown(x, y) {
    if (!this.visible) return;
    // Nie draguj gdy klik jest w floating panel
    if (this._selectedHex && x >= this._floatX && x <= this._floatX + FLOAT_W &&
        y >= this._floatY && y <= this._floatY + (this._floatH ?? 300)) return;
    // Nie draguj gdy klik poza overlay bounds
    const bounds = this._getMapBounds();
    if (!bounds) return;
    if (x < bounds.ox || x > bounds.ox + bounds.ow || y < bounds.oy || y > bounds.oy + bounds.oh) return;
    this._isDragging = true; this._hasDragged = false;
    this._dragStartX = x; this._dragStartY = y;
    this._dragCamStartX = this._camX; this._dragCamStartY = this._camY;
  }

  handleMouseUp() { if (this.visible) this._isDragging = false; }

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

  handleKeyDown(key) {
    if (!this.visible) return false;
    if (key === 'Escape') {
      if (this._selectedUnit) { this._selectedUnit = null; this._selectedHex = null; return true; }
      if (this._selectedHex) { this._selectedHex = null; return true; }
      this.hide();
      if (window.KOSMOS?.overlayManager) window.KOSMOS.overlayManager.active = null;
      return true;
    }
    if (key === 'Delete' && this._selectedHex) {
      const colony = this._getColony();
      const grid = colony ? this._getGrid(colony) : null;
      const tile = grid?.get(this._selectedHex.q, this._selectedHex.r);
      if (tile?.buildingId) { EventBus.emit('planet:demolishRequest', { tile }); return true; }
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
