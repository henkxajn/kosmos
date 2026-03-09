// ColonyOverlay — panel Kolonii (klawisz C)
//
// Trójdzielny overlay: lista kolonii (L), globus 3D planety (C), budowanie/szczegóły (R).
// Środkowa kolumna osadza PlanetGlobeRenderer z teksturami PBR + siatką hexów.
// Dane czytane LIVE z ColonyManager / BuildingSystem / HexGrid.

import { BaseOverlay }  from './BaseOverlay.js';
import { THEME }        from '../config/ThemeConfig.js';
import { BUILDINGS, RESOURCE_ICONS, formatRates, formatCost } from '../data/BuildingsData.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';
import { HexGrid }      from '../map/HexGrid.js';
import { PlanetGlobeTexture } from '../renderer/PlanetGlobeTexture.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { PlanetGlobeRenderer } from '../renderer/PlanetGlobeRenderer.js';
import EventBus          from '../core/EventBus.js';

const LEFT_W  = 220;
const RIGHT_W = 260;
const HDR_H   = 44;
const ROW_H   = 56;

// Skala UI (identyczna jak w UIManager) — dynamiczna przy resize/fullscreen
let _UI_SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
window.addEventListener('resize', () => {
  _UI_SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
});

// Krótkie nazwy budynków do siatki kafelków
const TILE_NAMES = {
  mine:                   'Kopalnia',
  factory:                'Fabryka',
  smelter:                'Huta',
  launch_pad:             'Wyrzutnia',
  autonomous_mine:        'Kop. Auto.',
  solar_farm:             'El. Słoneczna',
  geothermal:             'El. Geoterm.',
  nuclear_plant:          'El. Jądrowa',
  autonomous_solar_farm:  'El. Aut. Sł.',
  fusion_reactor:         'Reaktor Fuz.',
  farm:                   'Farma',
  well:                   'Studnia',
  synthesized_food_plant: 'Synt. Żywn.',
  habitat:                'Habitat',
  research_station:       'St. Badawcza',
  shipyard:               'Stocznia',
  terraformer:            'Terraformer',
};

// Kategorie budynków do wyświetlenia
const BUILDING_CATEGORIES = [
  { id: 'mining',      label: '⛏ Wydobycie' },
  { id: 'energy',      label: '⚡ Energia' },
  { id: 'food',        label: '🌾 Żywność' },
  { id: 'population',  label: '🏠 Populacja' },
  { id: 'research',    label: '🔬 Badania' },
  { id: 'space',       label: '🚀 Kosmos' },
];

// Typy planet → ikona + label
function _planetTypeLabel(planet) {
  if (!planet) return '';
  const t = planet.planetType || planet.type || '';
  if (t.includes('ice'))     return '🧊 lodowa';
  if (t.includes('gas'))     return '🌀 gazowa';
  if (t.includes('volcanic'))return '🌋 wulkan.';
  if (planet.lifeScore > 50) return '🌿 życie';
  return '⛰ skalna';
}

export class ColonyOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedColonyId = null;
    this._selectedHex      = null;   // { q, r }
    this._hoveredHex       = null;   // { q, r }
    this._hoverMouseX      = 0;     // pozycja myszy przy hover na globie
    this._hoverMouseY      = 0;
    this._buildMode        = false;
    this._pendingBuildingId = null;
    this._buildError       = null;
    this._buildErrorTime   = 0;
    this._scrollOffset     = 0;      // scroll listy kolonii (LEFT)
    this._scrollRight      = 0;      // scroll prawego panelu
    this._hoverRowId       = null;
    this._collapsedCategories = new Set();

    // Tooltip budynku (build list hover)
    this._tooltipBuildingId = null;
    this._tooltipX = 0;
    this._tooltipY = 0;

    // Tooltip przycisku ULEPSZ (hover)
    this._tooltipUpgradeData = null; // { q, r, buildingId }
    this._tooltipUpgradeX = 0;
    this._tooltipUpgradeY = 0;

    // Tooltip kafelka budynku — z opóźnieniem 400ms
    this._tileTooltipId = null;     // buildingId hovered
    this._tileTooltipStart = 0;     // Date.now() gdy hover się zaczął
    this._tileTooltipReady = false;  // true po 400ms

    // DOM tooltip (nad globusem WebGL)
    this._tooltipEl = null;
    this._createTooltipEl();

    // Cache siatki hex (per kolonia)
    this._gridCache = {};  // planetId → HexGrid

    // Globus 3D (środkowa kolumna)
    this._globeRenderer = null;
    this._globePlanetId = null;  // aktualnie wyświetlana planeta na globie
    this._isDraggingGlobe = false;

    // Ostatnia pozycja myszy (raw screen)
    this._lastRawX = 0;
    this._lastRawY = 0;

    // Flash message (błąd upgrade/build/demolish)
    this._flashMsg = null;
    this._flashEnd = 0;

    // Nasłuchuj na zmiany budynków
    EventBus.on('planet:buildResult', (e) => {
      this._onBuildingChanged();
      if (!e.success && e.reason) this._showFlash(e.reason);
    });
    EventBus.on('planet:demolishResult', (e) => {
      this._onBuildingChanged();
      if (e.success) {
        // Jeśli pełna rozbiórka — deselect hex; downgrade — odśwież panel
        if (!e.downgrade) {
          this._selectedHex = null;
          if (this._globeRenderer) this._globeRenderer.setSelectedTile(null);
        }
      } else if (e.reason) {
        this._showFlash(e.reason);
      }
    });
    EventBus.on('planet:upgradeResult', (e) => {
      this._onBuildingChanged();
      if (!e.success && e.reason) this._showFlash(e.reason);
    });
    EventBus.on('planet:constructionComplete', () => this._onBuildingChanged());
    EventBus.on('planet:constructionProgress', () => this._onBuildingChanged());
  }

  _createTooltipEl() {
    if (this._tooltipEl) return;
    const el = document.createElement('div');
    el.id = 'colony-tooltip';
    el.style.cssText = `
      position: fixed; z-index: 50; pointer-events: none;
      display: none; max-width: 300px; padding: 8px 10px;
      background: rgba(6,12,20,0.96); border: 1px solid #1a6e50;
      border-radius: 4px; font-family: 'Courier New', monospace;
      font-size: 11px; color: #b0c4b0; line-height: 1.45;
      overflow-wrap: break-word; word-wrap: break-word;
    `;
    document.body.appendChild(el);
    this._tooltipEl = el;
  }

  /** Pokaż DOM tooltip na podanych koordynatach ekranowych */
  _showDomTooltip(html, sx, sy) {
    if (!this._tooltipEl) return;
    this._tooltipEl.innerHTML = html;
    this._tooltipEl.style.display = 'block';

    // Pozycjonowanie — po lewej od kursora, unikaj wyjścia poza ekran
    const W = window.innerWidth;
    const H = window.innerHeight;
    const rect = this._tooltipEl.getBoundingClientRect();
    let tx = sx - rect.width - 12;
    let ty = sy - rect.height / 2;
    if (tx < 4) tx = sx + 14;
    if (ty < 4) ty = 4;
    if (ty + rect.height > H - 4) ty = H - rect.height - 4;
    if (tx + rect.width > W - 4) tx = W - rect.width - 4;

    this._tooltipEl.style.left = `${Math.round(tx)}px`;
    this._tooltipEl.style.top = `${Math.round(ty)}px`;
  }

  _hideDomTooltip() {
    if (this._tooltipEl) this._tooltipEl.style.display = 'none';
  }

  /** Tooltip terenu przy hover na hex globusa */
  _updateHexHoverTooltip() {
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(this._selectedColonyId);
    const grid = colony ? this._getGrid(colony) : null;
    const hovTile = grid?.get(this._hoveredHex.q, this._hoveredHex.r);
    if (!hovTile) { this._hideDomTooltip(); return; }

    const terrain = TERRAIN_TYPES[hovTile.type];
    const tName   = terrain?.namePL ?? hovTile.type;
    const icon    = terrain?.icon ?? '';

    let html = `<div style="color:${THEME.textPrimary};font-size:13px;margin-bottom:2px"><b>${icon} ${tName}</b></div>`;

    // Budynek / stolica
    const bldg    = hovTile.buildingId ? BUILDINGS[hovTile.buildingId] : null;
    const capital = hovTile.capitalBase;
    if (capital && bldg) {
      html += `<div style="color:${THEME.textSecondary}">🏛 Stolica + ${bldg.icon ?? ''} ${bldg.namePL}</div>`;
    } else if (capital) {
      html += `<div style="color:${THEME.textSecondary}">🏛 Stolica</div>`;
    } else if (bldg) {
      const lvl = hovTile.buildingLevel > 1 ? ` Lv${hovTile.buildingLevel}` : '';
      html += `<div style="color:${THEME.textSecondary}">${bldg.icon ?? ''} ${bldg.namePL}${lvl}</div>`;
    }

    // Zasoby bazowe terenu
    const by = terrain?.baseYield ?? {};
    const RI = { minerals: '⛏', energy: '⚡', organics: '🌿', water: '💧', research: '🔬' };
    const yParts = Object.entries(by).filter(([,v]) => v).map(([r,v]) => `${RI[r]??r} ${v}`);
    if (yParts.length) {
      html += `<div style="color:${THEME.textDim};margin-top:2px">${yParts.join('  ')}</div>`;
    }

    // Deposits
    if (hovTile.deposit) {
      html += `<div style="color:#e8c870;margin-top:2px">💎 ${hovTile.deposit}</div>`;
    }

    this._showDomTooltip(html, this._hoverMouseX * _UI_SCALE, this._hoverMouseY * _UI_SCALE);
  }

  show() {
    super.show();
    // Zawsze synchronizuj z aktywną kolonią (mogła się zmienić przez switchActiveColony)
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr) {
      this._selectedColonyId = colMgr.activePlanetId;
    }
    this._buildMode = false;
    this._pendingBuildingId = null;
    // Globus otworzy się w draw() gdy znamy bounds
  }

  hide() {
    super.hide();
    this._hoverRowId = null;
    this._hoveredHex = null;
    this._buildMode = false;
    this._pendingBuildingId = null;
    this._tooltipBuildingId = null;
    this._tooltipUpgradeData = null;
    this._tileTooltipId = null;
    this._tileTooltipReady = false;
    this._hideDomTooltip();
    this._closeGlobe();
  }

  // ── Globus 3D — lifecycle ────────────────────────────────────────────

  _openGlobe(colony, bounds) {
    if (!colony?.planet) return;
    let grid = this._getGrid(colony);
    if (!grid) return;

    // Ustaw gridHeight, deposits i tryb regionów w BuildingSystem
    const bSys = colony.buildingSystem;
    if (bSys) {
      bSys._gridHeight = grid.height ?? grid.toArray().length;
      bSys.setDeposits(colony.planet.deposits ?? []);
      bSys.setRegionMode(!!grid.getByLatLon);
    }

    // Auto-place stolicy przy pierwszym otwarciu (pomiń outpost)
    const isOutpost = colony.isOutpost ?? false;
    if (bSys && window.KOSMOS?.civMode && !isOutpost) {
      let hasCapital = false;
      for (const key of bSys._active.keys()) {
        if (key.startsWith('capital_')) { hasCapital = true; break; }
      }
      if (!hasCapital) {
        const baseTile = this._findColonyBaseTile(grid);
        if (baseTile) {
          EventBus.emit('planet:buildRequest', { tile: baseTile, buildingId: 'colony_base' });
          // Re-sync grid po postawieniu stolicy (handler buildResult nie jest jeszcze aktywny)
          delete this._gridCache[colony.planetId];
          grid = this._getGrid(colony);
          this._syncTileBuildings(grid, bSys);
        }
      }
    }

    // Zamknij stary globus jeśli inna planeta
    if (this._globeRenderer && this._globePlanetId !== colony.planetId) {
      this._closeGlobe();
    }

    if (this._globeRenderer) return; // już otwarty dla tej planety

    this._globeRenderer = new PlanetGlobeRenderer();
    this._globeRenderer.open(colony.planet, grid, bounds, true);
    this._globeRenderer.setShowGrid(false);
    this._globePlanetId = colony.planetId;

    // Obróć kamerę na stolicę
    this._focusOnCapital(grid);

    // Debug helper — do testów w konsoli (usuń po testach)
    window._lastOpenedGrid = grid;

    // Globus nie powinien przechwytywać zdarzeń myszy (sterujemy z ColonyOverlay)
    if (this._globeRenderer._canvas) {
      this._globeRenderer._canvas.style.pointerEvents = 'none';
    }

    // Callbacki hover/click
    this._globeRenderer.onTileHover = (tile) => {
      this._hoveredHex = tile ? { q: tile.q, r: tile.r } : null;
    };
    this._globeRenderer.onTileClick = (tile) => {
      this._handleGlobeTileClick(tile, colony);
    };
  }

  _closeGlobe() {
    if (this._globeRenderer) {
      this._globeRenderer.close();
      this._globeRenderer = null;
      this._globePlanetId = null;
    }
  }

  // Obróć kamerę globusa na stolicę
  _focusOnCapital(grid) {
    if (!grid || !this._globeRenderer?.cameraCtrl) return;

    let capitalTile = null;
    grid.forEach(tile => { if (tile.capitalBase) capitalTile = tile; });
    if (!capitalTile) return;

    // RegionSystem: lon → yaw kamery (yaw = lon + π/2), lat → pitch
    if (capitalTile.centerLon !== undefined) {
      const yaw   = capitalTile.centerLon + Math.PI / 2;
      const pitch = capitalTile.centerLat;
      this._globeRenderer.cameraCtrl.setYawPitch(yaw, pitch);
      return;
    }

    // HexGrid: hex → UV → yaw/pitch
    const hexSize = PlanetGlobeTexture.calcHexSize(grid);
    const gridPx  = grid.gridPixelSize(hexSize);
    const center  = HexGrid.hexToPixel(capitalTile.q, capitalTile.r, hexSize);
    const u = center.x / gridPx.w;
    const v = center.y / gridPx.h;
    const yaw   = (u - 0.25) * 2 * Math.PI;
    const pitch = Math.max(-1.0, Math.min(1.0, (0.5 - v) * Math.PI));
    this._globeRenderer.cameraCtrl.setYawPitch(yaw, pitch);
  }

  _updateGlobeBounds(bounds) {
    if (!this._globeRenderer?._canvas) return;
    const c = this._globeRenderer._canvas;
    c.style.left   = `${Math.round(bounds.x)}px`;
    c.style.top    = `${Math.round(bounds.y)}px`;
    c.style.width  = `${Math.round(bounds.w)}px`;
    c.style.height = `${Math.round(bounds.h)}px`;
  }

  _onBuildingChanged() {
    if (!this.visible) return;
    // Odśwież grid cache
    if (this._selectedColonyId) {
      delete this._gridCache[this._selectedColonyId];
    }
    // Odśwież overlay na globie
    if (this._globeRenderer) {
      const colMgr = window.KOSMOS?.colonyManager;
      const colony = colMgr?.getColony(this._selectedColonyId);
      if (colony) {
        const grid = this._getGrid(colony);
        if (grid) {
          // Synchronizuj buildingId z BuildingSystem._active → tile
          // (constructionComplete aktywuje budynek ale nie aktualizuje tile)
          this._syncTileBuildings(grid, colony.buildingSystem ?? window.KOSMOS?.buildingSystem);
          this._globeRenderer._grid = grid;
          this._globeRenderer.refreshTexture();
        }
      }
    }
  }

  _showFlash(msg) {
    this._flashMsg = msg;
    this._flashEnd = Date.now() + 2500;
  }

  _handleGlobeTileClick(tile, colony) {
    if (!tile) {
      this._selectedHex = null;
      return;
    }

    // BuildMode — postaw budynek
    if (this._buildMode && this._pendingBuildingId && !tile.buildingId && !tile.underConstruction) {
      const terrain = TERRAIN_TYPES[tile.type];
      if (terrain?.buildable) {
        EventBus.emit('planet:buildRequest', {
          tile,
          buildingId: this._pendingBuildingId,
        });
        this._buildMode = false;
        this._pendingBuildingId = null;
        return;
      } else {
        this._buildError = 'Nie można budować na tym terenie';
        this._buildErrorTime = Date.now() + 2000;
        return;
      }
    }

    // Normalne kliknięcie — zaznacz hex
    this._selectedHex = { q: tile.q, r: tile.r };
    this._scrollRight = 0;

    // Highlight na globie
    if (this._globeRenderer) {
      this._globeRenderer.setSelectedTile(tile);
    }
  }

  // ── Znajdź najlepszy hex na stolicę (centrum → spirala, preferuj plains/forest) ──
  _findColonyBaseTile(grid) {
    if (!grid) return null;

    // RegionSystem: przeszukaj regiony po priorytetach
    if (grid.getByLatLon) {
      const preferred = ['plains', 'forest', 'desert', 'tundra'];
      for (const prefType of preferred) {
        const found = grid.filter(r => r.type === prefType && !r.isOccupied);
        if (found.length > 0) return found[0];
      }
      const any = grid.filter(r => {
        const terrain = TERRAIN_TYPES[r.type];
        return terrain?.buildable && !r.isOccupied;
      });
      return any[0] ?? null;
    }

    // HexGrid fallback
    const w = grid.width;
    const h = grid.height;
    const centerQ = Math.floor(w / 2);
    const centerR = Math.floor(h / 2);
    const centerTile = grid.getOffset(centerQ, centerR);

    const preferred = ['plains', 'forest', 'desert', 'tundra'];
    const maxRadius = Math.max(w, h);

    for (const prefType of preferred) {
      if (centerTile && centerTile.type === prefType && !centerTile.isOccupied) {
        const terrain = TERRAIN_TYPES[centerTile.type];
        if (terrain?.buildable) return centerTile;
      }
      for (let radius = 1; radius <= maxRadius; radius++) {
        const ring = grid.ring(centerTile?.q ?? 0, centerTile?.r ?? 0, radius);
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
      const ring = grid.ring(centerTile?.q ?? 0, centerTile?.r ?? 0, radius);
      for (const tile of ring) {
        if (!tile.isOccupied) {
          const terrain = TERRAIN_TYPES[tile.type];
          if (terrain?.buildable) return tile;
        }
      }
    }
    return null;
  }

  // ── Pobierz grid kolonii (z cache lub generuj) ──────────────────────
  _getGrid(colony) {
    if (!colony) return null;
    const pid = colony.planetId;
    // Grid zapisany na kolonii (z restore lub poprzedniej sesji)
    if (colony.grid) {
      // Upewnij się że buildingId są zsynchronizowane
      this._syncTileBuildings(colony.grid, colony.buildingSystem);
      return colony.grid;
    }
    // Cache
    if (this._gridCache[pid]) return this._gridCache[pid];
    // Generuj (deterministyczny PRNG)
    if (colony.planet) {
      const grid = PlanetMapGenerator.generate(colony.planet);
      // Synchronizuj budynki z _active na tile
      this._syncTileBuildings(grid, colony.buildingSystem);
      this._gridCache[pid] = grid;
      // Zapisz na kolonii dla serializacji (ColonyManager.serialize())
      colony.grid = grid;
      return grid;
    }
    return null;
  }

  // Synchronizuj budynki z BuildingSystem._active → tile.buildingId
  _syncTileBuildings(grid, bSys) {
    if (!grid || !bSys) return;
    // Wyczyść
    grid.forEach(tile => {
      tile.buildingId = null;
      tile.capitalBase = false;
      tile.buildingLevel = 1;
      tile.underConstruction = null;
    });
    // Ustaw z _active
    const active = bSys._active;
    if (!active) return;
    for (const [key, entry] of active) {
      if (key.startsWith('capital_')) {
        const coords = key.slice(8).split(',');
        const q = parseInt(coords[0]), r = parseInt(coords[1]);
        const tile = grid.get(q, r);
        if (tile) tile.capitalBase = true;
      } else {
        const coords = key.split(',');
        const q = parseInt(coords[0]), r = parseInt(coords[1]);
        const tile = grid.get(q, r);
        if (tile) {
          tile.buildingId = entry.building.id;
          tile.buildingLevel = entry.level ?? 1;
        }
      }
    }
    // Budowa w toku (Map: tileKey → { buildingId, progress, buildTime, isUpgrade })
    const queue = bSys._constructionQueue;
    if (queue) {
      for (const [tileKey, entry] of queue) {
        const coords = tileKey.split(',');
        const q = parseInt(coords[0]), r = parseInt(coords[1]);
        const tile = grid.get(q, r);
        if (tile) {
          tile.underConstruction = {
            buildingId: entry.buildingId,
            progress: entry.progress ?? 0,
            buildTime: entry.buildTime ?? 1,
            isUpgrade: entry.isUpgrade ?? false,
            targetLevel: entry.targetLevel,
          };
        }
      }
    }
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    const centerW = ow - LEFT_W - RIGHT_W;

    // Tło — trzy prostokąty: lewy panel, prawy panel, środkowy nagłówek
    // Centrum body przezroczyste gdy globus aktywny — WebGL (z-index 1) świeci przez ui-canvas (z-index 2)
    ctx.fillStyle = 'rgba(2,4,5,0.97)';
    ctx.fillRect(ox, oy, LEFT_W, oh);                           // lewa kolumna
    ctx.fillRect(ox + ow - RIGHT_W, oy, RIGHT_W, oh);           // prawa kolumna
    ctx.fillRect(ox + LEFT_W, oy, centerW, HDR_H);              // nagłówek środkowy
    if (!this._globeRenderer) {
      ctx.fillRect(ox + LEFT_W, oy + HDR_H, centerW, oh - HDR_H); // centrum body (gdy brak globusa)
    }
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Separatory kolumn
    ctx.beginPath();
    ctx.moveTo(ox + LEFT_W, oy); ctx.lineTo(ox + LEFT_W, oy + oh);
    ctx.moveTo(ox + ow - RIGHT_W, oy); ctx.lineTo(ox + ow - RIGHT_W, oy + oh);
    ctx.stroke();

    // Przycisk zamknięcia [X]
    const closeX = ox + ow - 24;
    const closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✕', closeX, closeY + 14);
    this._addHit(closeX - 4, closeY, 22, 22, 'close');

    // Dane
    const colMgr = window.KOSMOS?.colonyManager;
    const colonies = colMgr?.getAllColonies()?.filter(c => !c.isOutpost) ?? [];
    const selCol = colonies.find(c => c.planetId === this._selectedColonyId) ?? null;

    // Rysuj 3 kolumny
    this._drawLeft(ctx, ox, oy, LEFT_W, oh, colonies);
    this._drawCenter(ctx, ox + LEFT_W, oy, centerW, oh, selCol, colonies);
    this._drawRight(ctx, ox + ow - RIGHT_W, oy, RIGHT_W, oh, selCol);

    // Flash message (błąd upgrade/build/demolish)
    if (this._flashMsg && Date.now() < this._flashEnd) {
      const fAlpha = Math.min(1, (this._flashEnd - Date.now()) / 500);
      ctx.save();
      ctx.globalAlpha = fAlpha;
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const tw = ctx.measureText(this._flashMsg).width;
      const fx = ox + ow / 2 - tw / 2 - 10;
      const fy = oy + oh - 40;
      ctx.fillStyle = 'rgba(40,10,10,0.92)';
      ctx.fillRect(fx, fy, tw + 20, 24);
      ctx.strokeStyle = THEME.danger;
      ctx.strokeRect(fx, fy, tw + 20, 24);
      ctx.fillStyle = '#ffaaaa';
      ctx.textAlign = 'center';
      ctx.fillText(this._flashMsg, ox + ow / 2, fy + 16);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // Auto-check tooltip delay (bo draw() jest wywoływany co frame, a handleMouseMove tylko przy ruchu)
    if (this._tileTooltipId && !this._tileTooltipReady && Date.now() - this._tileTooltipStart >= 400) {
      this._tileTooltipReady = true;
      this._tooltipBuildingId = this._tileTooltipId;
    }

    // Tooltip budynku (hover nad kartą w build list) — DOM overlay
    if (this._tooltipBuildingId) {
      this._updateBuildingTooltip();
    } else if (this._tooltipUpgradeData) {
      this._updateUpgradeTooltip();
    } else if (this._hoveredHex && !this._buildMode) {
      this._updateHexHoverTooltip();
    } else {
      this._hideDomTooltip();
    }

    // Zarządzaj globusem 3D w środkowej kolumnie
    this._manageGlobe(selCol, ox + LEFT_W, oy, centerW, oh);
  }

  // ── Zarządzanie globusem (synchronizacja z draw) ──────────────────────

  _manageGlobe(colony, centerX, centerY, centerW, centerH) {
    if (!colony) {
      this._closeGlobe();
      return;
    }

    // Oblicz bounds w pikselach ekranowych (globus potrzebuje CSS px)
    const globeBounds = {
      x: (centerX) * _UI_SCALE,
      y: (centerY + HDR_H) * _UI_SCALE,
      w: (centerW) * _UI_SCALE,
      h: (centerH - HDR_H) * _UI_SCALE,
    };

    if (this._globePlanetId !== colony.planetId) {
      // Inna planeta — zamknij i otwórz nowy globus
      this._closeGlobe();
      this._openGlobe(colony, globeBounds);
    } else if (this._globeRenderer) {
      // Ta sama planeta — zaktualizuj bounds
      this._updateGlobeBounds(globeBounds);
    } else {
      // Brak globusa — otwórz
      this._openGlobe(colony, globeBounds);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // LEWA KOLUMNA — lista kolonii
  // ══════════════════════════════════════════════════════════════════════

  _drawLeft(ctx, x, y, w, h, colonies) {
    const pad = 14;

    // Nagłówek
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, HDR_H);

    this._drawText(ctx, 'KOLONIE', x + pad, y + 18, THEME.accent, THEME.fontSizeMedium);

    const totalBuildings = colonies.reduce((s, c) => s + (c.buildingSystem?._active?.size ?? 0), 0);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`${colonies.length} kolonii · ${totalBuildings} budynków`, x + pad, y + 32);

    this._drawSeparator(ctx, x, y + HDR_H, x + w, y + HDR_H);

    // Lista kolonii (scrollowalna)
    const listY = y + HDR_H;
    const listH = h - HDR_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY - this._scrollOffset;
    for (const col of colonies) {
      const isSel = col.planetId === this._selectedColonyId;
      const isHov = col.planetId === this._hoverRowId;
      const civ = col.civSystem;
      const bSys = col.buildingSystem;
      const pop = civ?.population ?? 0;
      const housing = civ?.housing ?? 0;
      const rSys = col.resourceSystem;
      const energyBal = rSys?._energyFlow?.balance ?? 0;

      // Zbierz listę budynków + budynki w budowie
      const bldgs = [];
      // Zbiór kluczy z upgrade w toku (aby oznaczyć na liście aktywnych)
      const upgradingKeys = new Set();
      if (bSys?._constructionQueue) {
        for (const [tKey, entry] of bSys._constructionQueue) {
          if (entry.isUpgrade) upgradingKeys.add(tKey);
        }
      }
      if (bSys?._active) {
        for (const [key, entry] of bSys._active) {
          const isCapital = key.startsWith('capital_');
          const b = entry.building;
          const lvl = entry.level ?? 1;
          // Sprawdź czy budynek ma upgrade w toku
          const realKey = isCapital ? key.slice(8) : key;
          const isUpgrading = upgradingKeys.has(realKey);
          bldgs.push({ icon: isCapital ? '🏛' : (b?.icon ?? '🏗'), name: b?.namePL ?? '?', lvl, underConstruction: false, upgrading: isUpgrading });
        }
      }
      if (bSys?._constructionQueue) {
        for (const [, entry] of bSys._constructionQueue) {
          if (entry.isUpgrade) continue; // upgrade już widoczny przy aktywnym budynku
          const b = BUILDINGS[entry.buildingId];
          if (b) bldgs.push({ icon: b.icon ?? '🏗', name: b.namePL ?? '?', lvl: 1, underConstruction: true, upgrading: false });
        }
      }

      // Dynamiczna wysokość: nagłówek(16) + stats(14) + budynki (12px/linia, 1 per linia)
      const rowH = 34 + Math.max(0, bldgs.length) * 12 + 4;

      if (ry + rowH < listY) { ry += rowH; continue; }
      if (ry > listY + listH) break;

      // Tło wiersza
      if (isSel) {
        ctx.fillStyle = 'rgba(0,255,180,0.05)';
        ctx.fillRect(x, ry, w, rowH);
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(x, ry, 2, rowH);
      } else if (isHov) {
        ctx.fillStyle = 'rgba(0,255,180,0.03)';
        ctx.fillRect(x, ry, w, rowH);
      }

      // Nazwa kolonii
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(col.name ?? col.planet?.name ?? '???', x + pad, ry + 14);

      // Typ planety
      const typeStr = _planetTypeLabel(col.planet);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      ctx.fillText(typeStr, x + w - 6, ry + 14);
      ctx.textAlign = 'left';

      // Stats: POP + energy
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`👤${pop}/${housing}`, x + pad, ry + 28);
      const enColor = energyBal >= 0 ? THEME.success : THEME.danger;
      ctx.fillStyle = enColor;
      ctx.fillText(`⚡${energyBal >= 0 ? '+' : ''}${energyBal.toFixed(0)}`, x + pad + 60, ry + 28);

      // Drzewo budynków — jednolista, 1 budynek per linia
      if (bldgs.length > 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        for (let i = 0; i < bldgs.length; i++) {
          const b = bldgs[i];
          const by = ry + 38 + i * 12;
          if (b.underConstruction) {
            ctx.fillStyle = THEME.warning;
            ctx.fillText(`⏳ ${b.icon} ${b.name}`, x + pad, by);
          } else if (b.upgrading) {
            ctx.fillStyle = THEME.warning;
            ctx.fillText(`${b.icon} ${b.name} Lv${b.lvl} 🔨`, x + pad, by);
          } else {
            ctx.fillStyle = THEME.textDim;
            const lvlStr = b.lvl > 1 ? ` Lv${b.lvl}` : '';
            ctx.fillText(`${b.icon} ${b.name}${lvlStr}`, x + pad, by);
          }
        }
      }

      // Separator
      this._drawSeparator(ctx, x + 4, ry + rowH - 1, x + w - 4, ry + rowH - 1);

      // Hit zone
      this._addHit(x, ry, w, rowH, 'colony', { planetId: col.planetId });
      ry += rowH;
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════
  // ŚRODKOWA KOLUMNA — globus 3D planety
  // ══════════════════════════════════════════════════════════════════════

  _drawCenter(ctx, x, y, w, h, colony, colonies) {
    // Nagłówek (wyrównany do HDR_H z lewego panelu)
    const hdrH = HDR_H;
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, hdrH);
    this._drawSeparator(ctx, x, y + hdrH, x + w, y + hdrH);

    if (!colony) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Wybierz kolonię z listy', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    // Nawigacja ←/→
    const colIdx = colonies.indexOf(colony);
    const hdrMid = y + Math.round(hdrH / 2) + 4;
    if (colIdx > 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('← POPRZ.', x + 8, hdrMid);
      this._addHit(x, y, 80, hdrH, 'prevColony');
    }
    if (colIdx < colonies.length - 1) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      ctx.fillText('NAST. →', x + w - 8, hdrMid);
      ctx.textAlign = 'left';
      this._addHit(x + w - 80, y, 80, hdrH, 'nextColony');
    }

    // Nazwa kolonii (wyśrodkowana)
    const name = colony.name ?? colony.planet?.name ?? '???';
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.textAlign = 'center';
    ctx.fillText(`🌍 ${name}`, x + w / 2, hdrMid);
    ctx.textAlign = 'left';

    // Obszar mapy — tutaj rysuje się globus 3D (WebGL canvas)
    // Hit zone na obszar globusa (do obsługi drag/click)
    const mapX = x;
    const mapY = y + hdrH;
    const mapW = w;
    const mapH = h - hdrH;
    this._addHit(mapX, mapY, mapW, mapH, 'globe');

    // BuildMode info (na dole środkowej kolumny)
    const barH = 24;
    if (this._buildMode && this._pendingBuildingId) {
      const pB = BUILDINGS[this._pendingBuildingId];
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = 'rgba(2,4,5,0.85)';
      ctx.fillRect(mapX, mapY + mapH - barH, mapW, barH);
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`🏗 Tryb budowy: ${pB?.icon} ${pB?.namePL} — Kliknij hex · Esc anuluj`, mapX + 10, mapY + mapH - 8);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PRAWA KOLUMNA — budowanie / szczegóły
  // ══════════════════════════════════════════════════════════════════════

  _drawRight(ctx, x, y, w, h, colony) {
    if (!colony) return;

    const pad = 10;
    const grid = this._getGrid(colony);
    const tile = this._selectedHex && grid ? grid.get(this._selectedHex.q, this._selectedHex.r) : null;

    // Tryb budowania lub brak wybranego hexa → lista budynków
    if (this._buildMode || !tile) {
      this._drawBuildList(ctx, x, y, w, h, colony, tile);
      return;
    }

    // Hex z budynkiem → szczegóły
    if (tile.buildingId) {
      this._drawBuildingDetails(ctx, x, y, w, h, colony, tile);
      return;
    }

    // Hex pusty → info + przycisk buduj
    this._drawEmptyHex(ctx, x, y, w, h, tile);
  }

  // ── Lista budynków — siatka kafelków (panel budowania) ───────────

  _drawBuildList(ctx, x, y, w, h, colony, tile) {
    const pad = 6;
    const COLS = 3;
    const GAP = 4;
    const TILE_W = Math.floor((w - pad * 2 - GAP * (COLS - 1)) / COLS);
    const TILE_H = TILE_W + 30;  // kwadrat ikony + dolna połowa na tekst
    const ICON_H = TILE_W;        // górna kwadratowa część = ikona

    // Nagłówek (wyrównany do HDR_H)
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, HDR_H);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText('🏗 BUDUJ', x + pad + 4, y + Math.round(HDR_H / 2) + 4);
    this._drawSeparator(ctx, x, y + HDR_H, x + w, y + HDR_H);

    let headerExtra = 0;
    if (this._buildMode && this._pendingBuildingId) {
      const pB = BUILDINGS[this._pendingBuildingId];
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`Tryb: ${pB?.icon} ${pB?.namePL}`, x + pad + 4, y + HDR_H + 14);
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Kliknij hex · Esc anuluj', x + pad + 4, y + HDR_H + 26);
      headerExtra = 32;
    }

    // Błąd budowy
    if (this._buildError && Date.now() < this._buildErrorTime) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText(`⚠ ${this._buildError}`, x + pad + 4, y + HDR_H + headerExtra + 14);
      headerExtra += 18;
    }

    const startY = y + HDR_H + headerExtra;
    const listH = h - (startY - y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, startY, w, listH);
    ctx.clip();

    let ly = startY + 4 - this._scrollRight;
    const tSys = window.KOSMOS?.techSystem;
    const bSys = colony.buildingSystem;
    const now = Date.now();

    // Zbierz budynki w budowie (id → { progress, buildTime })
    const constructionByType = {};
    if (bSys?._constructionQueue) {
      for (const [, entry] of bSys._constructionQueue) {
        if (!entry.isUpgrade) {
          constructionByType[entry.buildingId] = entry;
        }
      }
    }

    for (const cat of BUILDING_CATEGORIES) {
      const buildings = Object.values(BUILDINGS).filter(b => b.category === cat.id && b.id !== 'colony_base');
      if (buildings.length === 0) continue;

      const collapsed = this._collapsedCategories.has(cat.id);

      // Nagłówek kategorii — monochromatyczny (Industrial Blueprint)
      if (ly + 20 > startY - 40) {
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.accent;
        ctx.globalAlpha = 0.7;
        ctx.fillText(`${collapsed ? '▸' : '▾'} ${cat.label}`, x + pad + 4, ly + 14);
        ctx.globalAlpha = 1;
        // Cienka linia separatora pod nagłówkiem
        ctx.strokeStyle = THEME.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + pad, ly + 18);
        ctx.lineTo(x + w - pad, ly + 18);
        ctx.stroke();
        this._addHit(x, ly, w, 20, 'toggleCat', { catId: cat.id });
      }
      ly += 20;

      if (collapsed) continue;

      // Rysuj budynki w siatce 3-kolumnowej
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const col = i % COLS;
        const row = Math.floor(i / COLS);

        if (col === 0 && i > 0) ly += TILE_H + GAP;
        if (col === 0 && row === 0) { /* pierwszy wiersz — ly już ustawione */ }

        const tx = x + pad + col * (TILE_W + GAP);
        const ty = ly;

        if (ty + TILE_H < startY) { if (col === COLS - 1 || i === buildings.length - 1) { /* noop */ }; continue; }
        if (ty > startY + listH + 40) { if (col === COLS - 1 || i === buildings.length - 1) { /* noop */ }; continue; }

        const techOk = !b.requires || (tSys?.isResearched(b.requires) ?? false);
        const canAfford = this._canAfford(colony, b);
        const locked = !techOk;
        const isHovered = (this._tileTooltipId === b.id);
        const isSelected = (this._pendingBuildingId === b.id && this._buildMode);

        // --- Tło kafelka (Industrial Blueprint — jednolite, monochromatyczne) ---
        ctx.globalAlpha = locked ? 0.2 : 1;

        // Jednolite tło
        if (isSelected) {
          ctx.fillStyle = 'rgba(0,255,180,0.06)';
        } else if (isHovered && !locked) {
          ctx.fillStyle = 'rgba(0,255,180,0.04)';
        } else {
          ctx.fillStyle = 'rgba(6,12,18,0.85)';
        }
        ctx.fillRect(tx, ty, TILE_W, TILE_H);

        // Obramowanie — monochromatyczne
        if (isSelected) ctx.strokeStyle = THEME.borderActive;
        else if (isHovered && !locked) ctx.strokeStyle = THEME.borderLight;
        else ctx.strokeStyle = THEME.border;
        ctx.lineWidth = isSelected ? 1.5 : 1;
        ctx.strokeRect(tx + 0.5, ty + 0.5, TILE_W - 1, TILE_H - 1);

        // --- Ikona wyśrodkowana w górnej połowie ---
        ctx.font = `${Math.round(TILE_W * 0.38)}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(b.icon, tx + TILE_W / 2, ty + ICON_H * 0.58);

        // 🔒 w prawym górnym rogu jeśli locked
        if (locked) {
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          ctx.textAlign = 'right';
          ctx.fillText('🔒', tx + TILE_W - 3, ty + 12);
        }

        // --- Dolna połowa: nazwa ---
        ctx.textAlign = 'center';
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        const shortName = TILE_NAMES[b.id] ?? b.namePL;
        ctx.fillText(shortName, tx + TILE_W / 2, ty + ICON_H + 11);

        // --- Produkcja / koszt (stonowane, monochromatyczne) ---
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        if (b.rates && Object.keys(b.rates).length > 0) {
          ctx.fillStyle = THEME.textSecondary;
          const rateStr = formatRates(b.rates);
          ctx.fillText(rateStr, tx + TILE_W / 2, ty + ICON_H + 22);
        } else if (b.isMine) {
          ctx.fillStyle = THEME.textDim;
          ctx.fillText('⛏ złoża', tx + TILE_W / 2, ty + ICON_H + 22);
        } else if (b.id === 'factory') {
          ctx.fillStyle = THEME.textDim;
          ctx.fillText('+1PP/r', tx + TILE_W / 2, ty + ICON_H + 22);
        } else if (b.housing > 0) {
          ctx.fillStyle = THEME.textSecondary;
          ctx.fillText(`+${b.housing}🏠`, tx + TILE_W / 2, ty + ICON_H + 22);
        }

        // Krótki koszt (główne surowce)
        const costParts = Object.entries(b.cost ?? {}).slice(0, 3).map(([k, v]) => `${v}${RESOURCE_ICONS[k] ?? ''}`);
        if (costParts.length > 0) {
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(costParts.join(' '), tx + TILE_W / 2, ty + TILE_H - 3);
        }

        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;

        // Overlay "W BUDOWIE" + pasek postępu
        const constr = constructionByType[b.id];
        if (constr) {
          const pct = constr.buildTime > 0 ? Math.min(1, (constr.progress ?? 0) / constr.buildTime) : 0;
          // Ciemny overlay
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = 'rgba(2,6,10,0.85)';
          ctx.fillRect(tx + 1, ty + 1, TILE_W - 2, TILE_H - 2);
          ctx.globalAlpha = 1;

          // Tekst "W BUDOWIE"
          ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = THEME.warning;
          ctx.fillText('W BUDOWIE', tx + TILE_W / 2, ty + ICON_H * 0.45);

          // Pasek progresu
          const barW = TILE_W - 12;
          const barH = 5;
          const barX = tx + 6;
          const barY = ty + ICON_H * 0.55;
          ctx.fillStyle = THEME.border;
          ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = THEME.warning;
          ctx.fillRect(barX, barY, barW * pct, barH);

          // Procent
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textSecondary;
          ctx.fillText(`${Math.round(pct * 100)}%`, tx + TILE_W / 2, barY + barH + 11);
          ctx.textAlign = 'left';
        }

        // Hit zone
        this._addHit(tx, ty, TILE_W, TILE_H, 'selectBuilding', { buildingId: b.id, locked });
      }

      // Po bloku kafelków — przesuń ly za ostatni wiersz
      const rowCount = Math.ceil(buildings.length / COLS);
      ly += TILE_H + GAP + 4;
    }

    ctx.restore();
  }

  // ── Tooltip budynku (hover w build list) — DOM ─────────────────────

  _updateBuildingTooltip() {
    if (!this._tileTooltipReady) { this._hideDomTooltip(); return; }

    const b = BUILDINGS[this._tooltipBuildingId];
    if (!b) { this._hideDomTooltip(); return; }

    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(this._selectedColonyId);
    const inv = colony?.resourceSystem?.inventorySnapshot?.() ?? {};
    const tSys = window.KOSMOS?.techSystem;
    const techOk = !b.requires || (tSys?.isResearched(b.requires) ?? false);

    // Kompatybilność terenu
    const grid = colony ? this._getGrid(colony) : null;
    const tile = this._selectedHex && grid ? grid.get(this._selectedHex.q, this._selectedHex.r) : null;
    const hovHex = this._hoveredHex && grid ? grid.get(this._hoveredHex.q, this._hoveredHex.r) : null;
    const checkTile = hovHex ?? tile;

    const ok = (v) => `<span style="color:${THEME.success}">✓</span>`;
    const no = (v) => `<span style="color:${THEME.danger}">✗</span>`;
    const ln = (check, text) => `<div>${check ? ok() : no()} ${text}</div>`;

    let html = `<div style="color:${THEME.textPrimary};font-size:13px;margin-bottom:4px"><b>${b.icon} ${b.namePL}</b></div>`;

    if (b.description) {
      html += `<div style="color:${THEME.textSecondary};margin-bottom:4px">${b.description}</div>`;
    }

    html += `<div style="border-top:1px solid ${THEME.border};margin:4px 0"></div>`;

    // Surowce
    if (b.cost && Object.keys(b.cost).length > 0) {
      html += `<div style="color:${THEME.textDim};margin-bottom:2px">Surowce:</div>`;
      for (const [k, v] of Object.entries(b.cost)) {
        const have = Math.floor(inv[k] ?? 0);
        const isOk = have >= v;
        const icon = RESOURCE_ICONS[k] ?? k;
        html += `<div style="color:${isOk ? THEME.success : THEME.danger};padding-left:6px">${isOk ? '✓' : '✗'} ${icon} ${v} (masz: ${have})</div>`;
      }
    }

    // Commodities
    if (b.commodityCost && Object.keys(b.commodityCost).length > 0) {
      for (const [k, v] of Object.entries(b.commodityCost)) {
        const have = Math.floor(inv[k] ?? 0);
        const isOk = have >= v;
        const icon = COMMODITIES[k]?.icon ?? '📦';
        const name = COMMODITY_SHORT[k] ?? k;
        html += `<div style="color:${isOk ? THEME.success : THEME.danger};padding-left:6px">${isOk ? '✓' : '✗'} ${icon}${name} ${v} (masz: ${have})</div>`;
      }
    }

    // POP
    if (b.popCost > 0) {
      const civSys = colony?.civSystem;
      const freePop = (civSys?.population ?? 0) - (civSys?.employedPop ?? 0);
      const isOk = freePop >= b.popCost;
      html += `<div style="color:${isOk ? THEME.success : THEME.danger};padding-left:6px">${isOk ? '✓' : '✗'} 👤 ${b.popCost} POP (wolni: ${freePop.toFixed(1)})</div>`;
    }

    html += `<div style="border-top:1px solid ${THEME.border};margin:4px 0"></div>`;

    // Produkcja
    if (b.rates && Object.keys(b.rates).length > 0) {
      html += `<div style="color:${THEME.success}">Produkcja: ${formatRates(b.rates)}</div>`;
    }
    if (b.housing > 0) html += `<div style="color:${THEME.info ?? THEME.accent}">Mieszkania: +${b.housing} POP</div>`;
    if (b.buildTime > 0) html += `<div style="color:${THEME.textSecondary}">⏱ Budowa: ${b.buildTime} lat</div>`;

    // Tech
    if (b.requires) {
      html += `<div style="border-top:1px solid ${THEME.border};margin:4px 0"></div>`;
      html += `<div style="color:${techOk ? THEME.success : (THEME.purple ?? '#cc66ff')}">${techOk ? '✓' : '✗'} Wymaga: ${b.requires}</div>`;
    }

    // Teren
    if (checkTile) {
      const terrain = TERRAIN_TYPES[checkTile.type];
      let terrainOk = false;
      if (terrain?.buildable) {
        if (b.terrainOnly) terrainOk = b.terrainOnly.includes(checkTile.type);
        else if (b.terrainAny) terrainOk = true;
        else terrainOk = (terrain.allowedCategories ?? []).includes(b.category);
      }
      html += `<div style="color:${terrainOk ? THEME.success : THEME.danger}">${terrainOk ? '✓' : '✗'} Teren: ${terrain?.icon ?? ''} ${terrain?.namePL ?? checkTile.type}</div>`;
    }

    // Pokaż tooltip przy kursorze (screen coords)
    this._showDomTooltip(html, this._tooltipX * _UI_SCALE, this._tooltipY * _UI_SCALE);
  }

  // ── Tooltip przycisku ULEPSZ — DOM ───────────────────────────────

  _updateUpgradeTooltip() {
    const d = this._tooltipUpgradeData;
    if (!d) { this._hideDomTooltip(); return; }

    const bDef = BUILDINGS[d.buildingId];
    if (!bDef) { this._hideDomTooltip(); return; }

    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(this._selectedColonyId);
    const bSys = colony?.buildingSystem;
    const entry = bSys?._active?.get(`${d.q},${d.r}`);
    const level = entry?.level ?? 1;
    const nextLevel = level + 1;
    const maxLvl = bDef.maxLevel ?? 5;
    if (nextLevel > maxLvl) { this._hideDomTooltip(); return; }

    const upgCostMult = nextLevel * 1.2;
    const inv = colony?.resourceSystem?.inventorySnapshot?.() ?? {};

    let canAffordAll = true;
    let html = `<div style="color:${THEME.warning};font-size:13px;margin-bottom:4px"><b>▲ Ulepszenie → Poz. ${nextLevel}</b></div>`;
    html += `<div style="border-top:1px solid ${THEME.border};margin:4px 0"></div>`;

    for (const [k, v] of Object.entries(bDef.cost ?? {})) {
      const need = Math.ceil(v * upgCostMult);
      const have = Math.floor(inv[k] ?? 0);
      const isOk = have >= need;
      if (!isOk) canAffordAll = false;
      const icon = RESOURCE_ICONS[k] ?? k;
      html += `<div style="color:${isOk ? THEME.success : THEME.danger}">${icon} ${need} (masz: ${have})</div>`;
    }

    if (nextLevel >= 3 && bDef.commodityCost) {
      for (const [k, v] of Object.entries(bDef.commodityCost)) {
        const need = Math.ceil(v * (nextLevel - 1));
        const have = Math.floor(inv[k] ?? 0);
        const isOk = have >= need;
        if (!isOk) canAffordAll = false;
        const icon = COMMODITIES[k]?.icon ?? '📦';
        const name = COMMODITY_SHORT[k] ?? k;
        html += `<div style="color:${isOk ? THEME.success : THEME.danger}">${icon}${name} ${need} (masz: ${have})</div>`;
      }
    }

    if (bDef.popCost > 0) {
      const civSys = colony?.civSystem;
      const freePop = (civSys?.population ?? 0) - (civSys?.employedPop ?? 0);
      const isOk = freePop >= bDef.popCost;
      html += `<div style="color:${isOk ? THEME.success : THEME.danger}">👤 ${bDef.popCost} POP (wolni: ${freePop.toFixed(1)})</div>`;
    }

    if (bDef.buildTime > 0) {
      html += `<div style="border-top:1px solid ${THEME.border};margin:4px 0"></div>`;
      html += `<div style="color:${THEME.textSecondary}">⏱ Czas: ${(bDef.buildTime * 0.5).toFixed(1)} lat</div>`;
    }

    html += `<div style="border-top:1px solid ${THEME.border};margin:4px 0"></div>`;
    html += `<div style="color:${canAffordAll ? THEME.success : THEME.danger}">${canAffordAll ? '✅ Wystarczające zasoby' : '❌ Brakuje zasobów'}</div>`;

    this._showDomTooltip(html, this._tooltipUpgradeX * _UI_SCALE, this._tooltipUpgradeY * _UI_SCALE);
  }

  // ── Szczegóły budynku (wybrany hex) ────────────────────────────────

  _drawBuildingDetails(ctx, x, y, w, h, colony, tile) {
    const pad = 10;
    const bDef = BUILDINGS[tile.buildingId];
    if (!bDef) return;

    const bSys = colony.buildingSystem;
    const entry = bSys?._active?.get(`${tile.q},${tile.r}`);
    const level = entry?.level ?? tile.buildingLevel ?? 1;
    const effectiveRates = entry?.effectiveRates ?? bDef.rates ?? {};

    // Nagłówek (wyrównany do HDR_H)
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, HDR_H);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${bDef.icon} ${bDef.namePL}`, x + pad, y + Math.round(HDR_H / 2) + 4);
    this._drawSeparator(ctx, x, y + HDR_H, x + w, y + HDR_H);

    let ly = y + HDR_H + 8;

    // Typ i poziom
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    const catDef = BUILDING_CATEGORIES.find(c => c.id === bDef.category);
    ctx.fillText(`${catDef?.label ?? bDef.category} · Poz. ${level}`, x + pad, ly);
    ly += 14;

    // Opis
    if (bDef.description) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      const words = bDef.description.split(' ');
      let line = '';
      let lineCount = 0;
      for (const word of words) {
        if (lineCount >= 3) break;
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > w - pad * 2) {
          ctx.fillText(line, x + pad, ly);
          ly += 12;
          line = word;
          lineCount++;
        } else {
          line = test;
        }
      }
      if (line && lineCount < 3) {
        ctx.fillText(line, x + pad, ly);
        ly += 12;
      }
      ly += 4;
    }

    this._drawSeparator(ctx, x + pad, ly, x + w - pad, ly);
    ly += 8;

    // Produkcja
    for (const [res, val] of Object.entries(effectiveRates)) {
      if (Math.abs(val) < 0.01) continue;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const icon = RESOURCE_ICONS[res] ?? res;
      if (val > 0) {
        ctx.fillStyle = THEME.success;
        ctx.fillText(`↑ +${val.toFixed(1)} ${icon}/rok`, x + pad, ly);
      } else {
        ctx.fillStyle = THEME.danger;
        ctx.fillText(`↓ ${val.toFixed(1)} ${icon}/rok`, x + pad, ly);
      }
      ly += 14;
    }

    // Zatrudnieni
    if (bDef.popCost > 0) {
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`👷 ${bDef.popCost} POP`, x + pad, ly);
      ly += 14;
    }

    ly += 4;
    this._drawSeparator(ctx, x + pad, ly, x + w - pad, ly);
    ly += 10;

    // Pasek poziomu
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText('Poziom:', x + pad, ly);
    const maxLvl = bDef.maxLevel ?? 10;
    const sqSize = 8;
    const sqGap = 3;
    const sqX = x + pad + 50;
    for (let i = 1; i <= Math.min(maxLvl, 10); i++) {
      ctx.fillStyle = i <= level ? THEME.accent : THEME.border;
      ctx.fillRect(sqX + (i - 1) * (sqSize + sqGap), ly - 7, sqSize, sqSize);
    }
    ly += 16;

    // Rozbudowa w toku — pasek progresu zamiast przycisku ULEPSZ
    const isUpgrading = tile.underConstruction?.isUpgrade;
    if (isUpgrading) {
      const uc = tile.underConstruction;
      const pct = uc.buildTime > 0 ? Math.min(1, (uc.progress ?? 0) / uc.buildTime) : 0;
      const targetLvl = uc.targetLevel ?? (level + 1);

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`🔨 Rozbudowa → Poz. ${targetLvl}`, x + pad, ly);
      ly += 14;

      // Pasek progresu
      this._drawBar(ctx, x + pad, ly, w - pad * 2, 6, pct, THEME.warning, THEME.border);
      ly += 10;

      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${Math.round(pct * 100)}% ukończono`, x + pad, ly);
      ly += 18;
    } else if (level < maxLvl) {
      // Ulepszenie — koszt + przycisk
      const nextLevel = level + 1;
      const upgCostMult = nextLevel * 1.2;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`Ulepszenie → Poz. ${nextLevel}`, x + pad, ly);
      ly += 14;

      // Koszt surowców
      const inv = colony?.resourceSystem?.inventorySnapshot?.() ?? {};
      const upgCostParts = [];
      let canAffordAll = true;
      for (const [k, v] of Object.entries(bDef.cost)) {
        const need = Math.ceil(v * upgCostMult);
        const have = Math.floor(inv[k] ?? 0);
        const ok = have >= need;
        if (!ok) canAffordAll = false;
        upgCostParts.push({ text: `${need}${RESOURCE_ICONS[k] ?? k}`, ok });
      }
      // Commodities od poziomu 3
      if (nextLevel >= 3 && bDef.commodityCost) {
        for (const [k, v] of Object.entries(bDef.commodityCost)) {
          const need = Math.ceil(v * (nextLevel - 1));
          const have = Math.floor(inv[k] ?? 0);
          const ok = have >= need;
          if (!ok) canAffordAll = false;
          upgCostParts.push({ text: `${need}${RESOURCE_ICONS[k] ?? k}`, ok });
        }
      }

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      let cx = x + pad;
      for (const part of upgCostParts) {
        ctx.fillStyle = part.ok ? THEME.success : THEME.danger;
        ctx.fillText(part.text, cx, ly);
        cx += ctx.measureText(part.text).width + 6;
      }
      ly += 18;

      // Przycisk ULEPSZ (wyłączony gdy brak surowców)
      const btnStyle = canAffordAll ? 'primary' : 'disabled';
      this._drawButton(ctx, '▲ ULEPSZ', x + pad, ly, w - pad * 2, 24, btnStyle);
      this._addHit(x + pad, ly, w - pad * 2, 24, 'upgrade', { q: tile.q, r: tile.r, buildingId: tile.buildingId });
      ly += 32;
    }

    // Przycisk BURZ (ukryj przy trwającej rozbudowie)
    if (!bDef.isCapital && !isUpgrading) {
      this._drawButton(ctx, '🗑 BURZ', x + pad, ly, w - pad * 2, 24, 'danger');
      this._addHit(x + pad, ly, w - pad * 2, 24, 'demolish', { q: tile.q, r: tile.r });
    }
  }

  // ── Pusty hex ──────────────────────────────────────────────────────

  _drawEmptyHex(ctx, x, y, w, h, tile) {
    const pad = 10;

    // Nagłówek (wyrównany do HDR_H)
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, HDR_H);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('HEX PUSTY', x + pad, y + Math.round(HDR_H / 2) + 4);
    this._drawSeparator(ctx, x, y + HDR_H, x + w, y + HDR_H);

    let ly = y + HDR_H + 14;

    // Info o terenie
    const terrain = TERRAIN_TYPES[tile.type];
    if (terrain) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${terrain.icon} ${terrain.namePL}`, x + pad, ly);
      ly += 14;
      if (terrain.description) {
        ctx.fillStyle = THEME.textDim;
        const desc = terrain.description.length > 45 ? terrain.description.slice(0, 45) + '…' : terrain.description;
        ctx.fillText(desc, x + pad, ly);
        ly += 14;
      }
      // Dozwolone kategorie
      if (terrain.allowedCategories?.length > 0) {
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`Kategorie: ${terrain.allowedCategories.join(', ')}`, x + pad, ly);
        ly += 14;
      }
      // Bonus
      if (terrain.yieldBonus) {
        for (const [k, v] of Object.entries(terrain.yieldBonus)) {
          if (k === 'default' || v === 1.0) continue;
          ctx.fillStyle = v > 1 ? THEME.success : THEME.danger;
          ctx.fillText(`${k}: ×${v.toFixed(1)}`, x + pad, ly);
          ly += 12;
        }
      }
    }

    ly += 10;

    if (terrain?.buildable && !tile.underConstruction) {
      this._drawButton(ctx, '+ ZBUDUJ TUTAJ', x + pad, ly, w - pad * 2, 28, 'primary');
      this._addHit(x + pad, ly, w - pad * 2, 28, 'enterBuildMode');
    } else if (tile.underConstruction) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      const pct = Math.round((tile.underConstruction.progress / tile.underConstruction.buildTime) * 100);
      ctx.fillText(`🔨 Budowa w toku: ${pct}%`, x + pad, ly);
    } else {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Teren nie do zabudowy', x + pad, ly);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════

  _canAfford(colony, building) {
    const inv = colony?.resourceSystem?.inventorySnapshot?.() ?? {};
    for (const [k, v] of Object.entries(building.cost ?? {})) {
      if ((inv[k] ?? 0) < v) return false;
    }
    for (const [k, v] of Object.entries(building.commodityCost ?? {})) {
      if ((inv[k] ?? 0) < v) return false;
    }
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Obsługa interakcji
  // ══════════════════════════════════════════════════════════════════════

  _onHit(zone) {
    if (zone.type === 'close') {
      this.hide();
      return;
    }

    if (zone.type === 'colony') {
      this._selectedColonyId = zone.data.planetId;
      this._selectedHex = null;
      this._hoveredHex = null;
      this._buildMode = false;
      this._pendingBuildingId = null;
      this._scrollRight = 0;
      // Highlight reset na globie
      if (this._globeRenderer) this._globeRenderer.setSelectedTile(null);
      // Przełącz aktywną kolonię w ColonyManager
      const colMgr = window.KOSMOS?.colonyManager;
      if (colMgr) colMgr.switchActiveColony(zone.data.planetId);
      return;
    }

    if (zone.type === 'prevColony' || zone.type === 'nextColony') {
      const colMgr = window.KOSMOS?.colonyManager;
      const colonies = colMgr?.getAllColonies()?.filter(c => !c.isOutpost) ?? [];
      const idx = colonies.findIndex(c => c.planetId === this._selectedColonyId);
      const newIdx = zone.type === 'prevColony' ? idx - 1 : idx + 1;
      if (newIdx >= 0 && newIdx < colonies.length) {
        this._selectedColonyId = colonies[newIdx].planetId;
        this._selectedHex = null;
        this._buildMode = false;
        this._scrollRight = 0;
        if (this._globeRenderer) this._globeRenderer.setSelectedTile(null);
        if (colMgr) colMgr.switchActiveColony(colonies[newIdx].planetId);
      }
      return;
    }

    if (zone.type === 'toggleCat') {
      const catId = zone.data.catId;
      if (this._collapsedCategories.has(catId)) this._collapsedCategories.delete(catId);
      else this._collapsedCategories.add(catId);
      return;
    }

    if (zone.type === 'selectBuilding') {
      if (zone.data.locked) return; // zablokowany tech — nie buduj
      this._buildMode = true;
      this._pendingBuildingId = zone.data.buildingId;
      return;
    }

    if (zone.type === 'enterBuildMode') {
      this._buildMode = true;
      this._pendingBuildingId = null;
      return;
    }

    if (zone.type === 'globe') {
      // Klik na globus — deleguj do PlanetGlobeRenderer
      if (this._globeRenderer && !this._isDraggingGlobe) {
        const rawX = this._lastRawX;
        const rawY = this._lastRawY;
        if (!this._globeRenderer.cameraCtrl.wasDrag) {
          this._globeRenderer.handleExternalClick(rawX, rawY);
        }
      }
      return;
    }

    if (zone.type === 'upgrade') {
      const colMgr = window.KOSMOS?.colonyManager;
      const colony = colMgr?.getColony(this._selectedColonyId);
      const grid = colony ? this._getGrid(colony) : null;
      const tile = grid?.get(zone.data.q, zone.data.r);
      if (!tile) return;
      EventBus.emit('planet:upgradeRequest', { tile });
      return;
    }

    if (zone.type === 'demolish') {
      const colMgr = window.KOSMOS?.colonyManager;
      const colony = colMgr?.getColony(this._selectedColonyId);
      const grid = colony ? this._getGrid(colony) : null;
      const tile = grid?.get(zone.data.q, zone.data.r);
      if (!tile) return;
      EventBus.emit('planet:demolishRequest', { tile });
      return;
    }
  }

  handleClick(x, y) {
    if (!this.visible) return false;
    // Zapamiętaj raw screen coords (do raycastu globusa)
    this._lastRawX = x * _UI_SCALE;
    this._lastRawY = y * _UI_SCALE;
    return super.handleClick(x, y);
  }

  handleMouseMove(x, y) {
    if (!this.visible) return;
    super.handleMouseMove(x, y);

    // Hover nad wierszem kolonii / budynkiem / przyciskiem ULEPSZ
    this._hoverRowId = null;
    let hoveredBuildingId = null;
    this._tooltipUpgradeData = null;
    for (const z of this._hitZones) {
      if (z.type === 'colony' && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
        this._hoverRowId = z.data.planetId;
        break;
      }
      if (z.type === 'selectBuilding' && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
        hoveredBuildingId = z.data.buildingId;
        this._tooltipX = x;
        this._tooltipY = y;
      }
      if (z.type === 'upgrade' && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
        this._tooltipUpgradeData = z.data;
        this._tooltipUpgradeX = x;
        this._tooltipUpgradeY = y;
      }
    }

    // Logika opóźnienia tooltipa 400ms
    const now = Date.now();
    if (hoveredBuildingId !== this._tileTooltipId) {
      // Zmienił się hovered kafelek — resetuj timer
      this._tileTooltipId = hoveredBuildingId;
      this._tileTooltipStart = hoveredBuildingId ? now : 0;
      this._tileTooltipReady = false;
      this._tooltipBuildingId = null;
    } else if (hoveredBuildingId && !this._tileTooltipReady && now - this._tileTooltipStart >= 400) {
      // 400ms upłynęło — pokaż tooltip
      this._tileTooltipReady = true;
    }

    // Ustaw tooltipBuildingId tylko gdy gotowy (400ms)
    if (this._tileTooltipReady && hoveredBuildingId) {
      this._tooltipBuildingId = hoveredBuildingId;
    } else {
      this._tooltipBuildingId = null;
    }

    // Drag kamery globusa
    if (this._isDraggingGlobe && this._globeRenderer) {
      this._globeRenderer.cameraCtrl.applyDrag(x * _UI_SCALE, y * _UI_SCALE);
      return;
    }

    // Hover na globie — deleguj raycast + zapamiętaj pozycję myszy
    const globeZone = this._hitZones.find(z => z.type === 'globe');
    if (globeZone && this._globeRenderer) {
      if (x >= globeZone.x && x <= globeZone.x + globeZone.w &&
          y >= globeZone.y && y <= globeZone.y + globeZone.h) {
        this._globeRenderer.handleExternalMouseMove(x * _UI_SCALE, y * _UI_SCALE);
        this._hoverMouseX = x;
        this._hoverMouseY = y;
      } else {
        // Poza globem — wyczyść hover
        this._globeRenderer.handleExternalMouseMove(-9999, -9999);
      }
    }
  }

  handleMouseDown(x, y) {
    if (!this.visible) return;
    // Sprawdź czy klik w obszarze globusa
    const globeZone = this._hitZones.find(z => z.type === 'globe');
    if (globeZone && this._globeRenderer &&
        x >= globeZone.x && x <= globeZone.x + globeZone.w &&
        y >= globeZone.y && y <= globeZone.y + globeZone.h) {
      this._isDraggingGlobe = true;
      this._globeRenderer.cameraCtrl.startDrag(x * _UI_SCALE, y * _UI_SCALE);
    }
  }

  handleMouseUp(x, y) {
    if (!this.visible) return;
    if (this._isDraggingGlobe && this._globeRenderer) {
      this._globeRenderer.cameraCtrl.endDrag(x * _UI_SCALE, y * _UI_SCALE);
      this._isDraggingGlobe = false;
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      window.innerWidth / _UI_SCALE,
      window.innerHeight / _UI_SCALE
    );

    // Scroll listy kolonii (lewa kolumna)
    if (x >= ox && x <= ox + LEFT_W && y >= oy + HDR_H) {
      this._scrollOffset = Math.max(0, this._scrollOffset + delta * 0.5);
      return true;
    }

    // Scroll prawej kolumny
    if (x >= ox + ow - RIGHT_W) {
      this._scrollRight = Math.max(0, this._scrollRight + delta * 0.5);
      return true;
    }

    // Zoom globusa (środkowa kolumna)
    const globeZone = this._hitZones.find(z => z.type === 'globe');
    if (globeZone && this._globeRenderer &&
        x >= globeZone.x && x <= globeZone.x + globeZone.w &&
        y >= globeZone.y && y <= globeZone.y + globeZone.h) {
      this._globeRenderer.cameraCtrl.applyZoom(delta);
      return true;
    }

    return false;
  }

  // ── Obsługa klawiatury ──────────────────────────────────────────────

  handleKeyDown(key) {
    if (!this.visible) return false;

    if (key === 'Escape') {
      if (this._buildMode) {
        this._buildMode = false;
        this._pendingBuildingId = null;
        return true; // NIE zamykaj panelu
      }
      // Standardowy Escape zamknie panel (przez OverlayManager)
      return false;
    }

    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const colMgr = window.KOSMOS?.colonyManager;
      const colonies = colMgr?.getAllColonies()?.filter(c => !c.isOutpost) ?? [];
      const idx = colonies.findIndex(c => c.planetId === this._selectedColonyId);
      const newIdx = key === 'ArrowLeft' ? idx - 1 : idx + 1;
      if (newIdx >= 0 && newIdx < colonies.length) {
        this._selectedColonyId = colonies[newIdx].planetId;
        this._selectedHex = null;
        this._buildMode = false;
        if (this._globeRenderer) this._globeRenderer.setSelectedTile(null);
        if (colMgr) colMgr.switchActiveColony(colonies[newIdx].planetId);
      }
      return true;
    }

    if (key === 'Delete' && this._selectedHex) {
      const colMgr = window.KOSMOS?.colonyManager;
      const colony = colMgr?.getColony(this._selectedColonyId);
      const grid = colony ? this._getGrid(colony) : null;
      const tile = grid?.get(this._selectedHex.q, this._selectedHex.r);
      if (tile?.buildingId && !BUILDINGS[tile.buildingId]?.isCapital) {
        EventBus.emit('planet:demolishRequest', { tile });
        this._selectedHex = null;
        if (this._globeRenderer) this._globeRenderer.setSelectedTile(null);
        return true;
      }
    }

    return false;
  }
}
