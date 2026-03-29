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
// Texture sampling usunięty — biomy z PlanetMapGenerator + dane planety
import EventBus          from '../core/EventBus.js';
import { t }   from '../i18n/i18n.js';

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
  }

  hide() {
    super.hide();
    this._selectedHex = null; this._hoveredHex = null;
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

    // Biomy ustawione przez PlanetMapGenerator (wagi zależne od danych planety)

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
      this._drawMap(ctx, ox, mapY, ow, mapH, grid);
      ctx.restore();
    }

    // Floating panel obok zaznaczonego hexa
    if (this._selectedHex && grid && colony) {
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
  _drawMap(ctx, ox, oy, ow, oh, grid) {
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
      this._drawHex(ctx, sx, sy, hs, terrain, tile, hov, sel);
    });
  }

  _drawHex(ctx, cx, cy, r, terrain, tile, isHov, isSel) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();

    // Kolor terenu z TERRAIN_TYPES
    const c = terrain.color ?? 0x888888;
    const cR = (c >> 16) & 0xFF, cG = (c >> 8) & 0xFF, cB = c & 0xFF;
    ctx.fillStyle = `rgb(${cR},${cG},${cB})`;
    ctx.fill();

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

    // Deposit
    if (tile.strategicResource && r > 16) {
      ctx.font = `bold ${Math.max(5, r * 0.18)}px ${THEME.fontFamily}`;
      ctx.fillStyle = '#ffcc00'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(tile.strategicResource, cx - r * 0.55, cy - r * 0.7);
    }

    // Fog
    if (tile.explored === false) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill(); }

    // Obramowanie
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (isSel)      { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; }
    else if (isHov) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; }
    else { ctx.strokeStyle = `rgb(${Math.max(0,cR-30)},${Math.max(0,cG-30)},${Math.max(0,cB-30)})`; ctx.lineWidth = 1; }
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
    if (tile.strategicResource) h += 16;
    if (terrain.yieldBonus) h += Object.keys(terrain.yieldBonus).length * 14 + 4;
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

    // Deposit
    if (tile.strategicResource) {
      ctx.fillStyle = '#ffcc00';
      ctx.fillText(`💎 Złoże: ${tile.strategicResource}`, x + 8, cy); cy += 16;
    }

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
      if (tile) {
        this._selectedHex = { q: tile.q, r: tile.r };
        this._hoveredBuildId = null;
        this._floatScroll = 0;
        return true;
      }
      // Klik na overlay ale poza mapą — deselect hex, konsumuj klik
      this._selectedHex = null;
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
        if (tile.strategicResource) html += `<br>💎 ${tile.strategicResource}`;
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

  // Usunięto: _sampleTextureForBiomes — sampling tekstur był niestabilny.
  // Biomy generowane przez PlanetMapGenerator z wagami zależnymi od danych planety.
  _sampleTextureForBiomes_REMOVED(planet, grid) {
    if (!planet || !grid) return;

    const texType = resolveTextureType(planet);
    if (!texType || texType.startsWith('gas')) return;

    const seed = hashCode(planet.id || 'planet_0');
    const variant = (seed % TEXTURE_VARIANTS) + 1;
    const vStr = String(variant).padStart(2, '0');
    const heightUrl = `assets/planet-textures/${texType}_${vStr}_height.png`;
    const diffuseUrl = `assets/planet-textures/${texType}_${vStr}_diffuse.png`;

    // Ile wpisów palety to woda (z generate-planets.js)
    // ocean: 7 z 18 wpisów = woda. Palette index 7/17 ≈ 0.41
    const WATER_PALETTE_PCT = {
      ocean: 0.41, rocky: 0, desert: 0, iron: 0,
      ice: 0.10, volcanic: 0, 'lava-ocean': 0, toxic: 0, mercury: 0,
    };
    const waterPalettePct = WATER_PALETTE_PCT[texType] ?? 0;
    const life = planet.lifeScore ?? 0;
    const temp = planet.surface?.temperature ?? 20;

    // Ładuj OBIE tekstury równolegle
    let heightData = null, diffData = null, texW = 0, texH = 0;
    let loaded = 0;
    const pid = planet.id ?? 'unknown';
    const onBothLoaded = () => {
      if (loaded < 2 || !heightData) return;
      this._applyTextureMapping(grid, heightData, diffData, texW, texH,
        waterPalettePct, life, temp);
      this._texturesReady[pid] = true;
    };

    const hImg = new Image(); hImg.crossOrigin = 'anonymous';
    hImg.onload = () => {
      const c = document.createElement('canvas');
      texW = hImg.width; texH = hImg.height;
      c.width = texW; c.height = texH;
      const ctx = c.getContext('2d');
      ctx.drawImage(hImg, 0, 0);
      heightData = ctx.getImageData(0, 0, texW, texH).data;
      loaded++; onBothLoaded();
    };
    hImg.onerror = () => { loaded++; onBothLoaded(); };
    hImg.src = heightUrl;

    const dImg = new Image(); dImg.crossOrigin = 'anonymous';
    dImg.onload = () => {
      const c = document.createElement('canvas');
      c.width = dImg.width; c.height = dImg.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(dImg, 0, 0);
      diffData = ctx.getImageData(0, 0, c.width, c.height).data;
      loaded++; onBothLoaded();
    };
    dImg.onerror = () => { loaded++; onBothLoaded(); };
    dImg.src = diffuseUrl;
  }

  _applyTextureMapping(grid, heightData, diffData, texW, texH, waterPalettePct, life, temp) {
    const hexSize = 32;
    const gridPx = grid.gridPixelSize(hexSize);

    // Zbierz heightmap wartości + UV per hex
    const hexData = [];
    grid.forEach((tile, col, row) => {
      const pos = grid.tilePixelPos(tile.q, tile.r, hexSize);
      const u = Math.max(0, Math.min(0.999, pos.x / gridPx.w));
      const v = Math.max(0, Math.min(0.999, pos.y / gridPx.h));
      const px = Math.floor(u * (texW - 1));
      const py = Math.floor(v * (texH - 1));
      const idx = (py * texW + px) * 4;
      const h = heightData[idx] / 255;

      // Ustaw KOLOR BEZPOŚREDNIO z diffuse (1:1 match z 3D!)
      if (diffData) {
        const r = diffData[idx], g = diffData[idx + 1], b = diffData[idx + 2];
        tile._displayColor = (r << 16) | (g << 8) | b;
      }

      hexData.push({ tile, h, row });
    });

    // Percentylowy próg wody (heightmap)
    let waterThreshold = 0;
    if (waterPalettePct > 0) {
      const sorted = hexData.map(d => d.h).sort((a, b) => a - b);
      waterThreshold = sorted[Math.floor(sorted.length * waterPalettePct)] ?? 0;
    }

    // Ustaw terrain TYPE (dla gameplay: canBuild, yieldBonus)
    for (const { tile, h, row } of hexData) {
      const latPct = row / Math.max(1, grid.height - 1);
      const polarDist = Math.abs(latPct - 0.5) * 2;
      const landH = waterThreshold > 0 ? (h - waterThreshold) / (1 - waterThreshold) : h;

      if (polarDist > 0.82 && temp < 25) tile.type = 'ice_sheet';
      else if (waterPalettePct > 0 && h < waterThreshold) tile.type = 'ocean';
      else if (landH > 0.75) tile.type = 'mountains';
      else if (landH > 0.60) tile.type = life > 30 ? 'mountains' : 'crater';
      else if (polarDist > 0.60 && temp < 10) tile.type = 'tundra';
      else if (landH > 0.40) tile.type = life > 50 ? 'plains' : (temp > 50 ? 'desert' : 'wasteland');
      else if (life > 60) tile.type = 'forest';
      else if (life > 30) tile.type = 'plains';
      else if (temp > 60) tile.type = 'desert';
      else tile.type = 'plains';
    }
  }

  // Regeneruj biomy gridu z podanymi wagami (Voronoi)
  _regenerateBiomes(grid, weights, planet) {
    // Seeded PRNG z planet.id (deterministyczny!)
    let s = 5381;
    const id = planet.id ?? 'p';
    for (let i = 0; i < id.length; i++) s = (Math.imul(s, 33) ^ id.charCodeAt(i)) >>> 0;
    const rand = () => { s += 0x6D2B79F5; let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

    // Losuj biom wg wag
    const totalW = weights.reduce((sum, w) => sum + w.weight, 0);
    const pickBiome = () => {
      let roll = rand() * totalW;
      for (const w of weights) { roll -= w.weight; if (roll <= 0) return w.type; }
      return weights[weights.length - 1].type;
    };

    const allTiles = grid.toArray();
    const seedCount = Math.max(8, Math.floor(allTiles.length / 4));

    // Tasuj tile'y (Fisher-Yates)
    const shuffled = [...allTiles];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Ziarna Voronoi
    const seeds = shuffled.slice(0, seedCount).map(t => ({
      q: t.q, r: t.r, type: pickBiome(),
    }));

    // Każdy tile → biom najbliższego ziarna
    for (const tile of allTiles) {
      let minDist = Infinity, chosen = seeds[0].type;
      for (const s of seeds) {
        const d = HexGrid.distance(tile.q, tile.r, s.q, s.r);
        if (d < minDist) { minDist = d; chosen = s.type; }
      }
      tile.type = chosen;
    }

    // Wygładzanie (2 passy)
    for (let pass = 0; pass < 2; pass++) {
      const changes = [];
      grid.forEach(tile => {
        const neighbors = grid.getNeighbors(tile.q, tile.r);
        if (neighbors.length < 2) return;
        const freq = {};
        for (const n of neighbors) freq[n.type] = (freq[n.type] ?? 0) + 1;
        let maxCount = 0, dominant = tile.type;
        for (const [t, cnt] of Object.entries(freq)) {
          if (cnt > maxCount) { maxCount = cnt; dominant = t; }
        }
        if (maxCount >= 4 && dominant !== tile.type) changes.push({ tile, type: dominant });
      });
      for (const { tile, type } of changes) tile.type = type;
    }

    // Bieguny → lód (jeśli planeta zimna/umiarkowana)
    const temp = planet.surface?.temperature ?? 20;
    if (temp < 25) {
      grid.forEach((tile, col, row) => {
        if (row === 0 || row === grid.height - 1) tile.type = 'ice_sheet';
        else if (row === 1 || row === grid.height - 2) {
          if (temp < 5) tile.type = 'ice_sheet';
          else if (rand() < 0.5) tile.type = 'tundra';
        }
      });
    }

    // Granice las↔pustynia → równina (naturalna przejście)
    grid.forEach(tile => {
      if (tile.type !== 'forest') return;
      const hasDesert = grid.getNeighbors(tile.q, tile.r)
        .some(n => n.type === 'desert' || n.type === 'volcano');
      if (hasDesert && rand() < 0.5) tile.type = 'plains';
    });
  }
}
