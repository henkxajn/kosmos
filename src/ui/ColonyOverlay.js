// ColonyOverlay — panel Kolonii (klawisz C)
//
// Trójdzielny overlay: lista kolonii (L), globus 3D planety (C), budowanie/szczegóły (R).
// Środkowa kolumna osadza PlanetGlobeRenderer z teksturami PBR + siatką hexów.
// Dane czytane LIVE z ColonyManager / BuildingSystem / HexGrid.

import { BaseOverlay }  from './BaseOverlay.js';
import { THEME }        from '../config/ThemeConfig.js';
import { BUILDINGS, RESOURCE_ICONS, formatRates, formatCost } from '../data/BuildingsData.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';
import { HexGrid }      from '../map/HexGrid.js';
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

// Kategorie budynków do wyświetlenia
const BUILDING_CATEGORIES = [
  { id: 'mining',      label: '⛏ Wydobycie',    color: '#cc9944' },
  { id: 'energy',      label: '⚡ Energia',       color: '#ffdd44' },
  { id: 'food',        label: '🌾 Żywność',      color: '#44cc66' },
  { id: 'population',  label: '🏠 Populacja',    color: '#4488ff' },
  { id: 'research',    label: '🔬 Badania',      color: '#cc66ff' },
  { id: 'space',       label: '🚀 Kosmos',       color: '#8888ff' },
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
    this._closeGlobe();
  }

  // ── Globus 3D — lifecycle ────────────────────────────────────────────

  _openGlobe(colony, bounds) {
    if (!colony?.planet) return;
    const grid = this._getGrid(colony);
    if (!grid) return;

    // Zamknij stary globus jeśli inna planeta
    if (this._globeRenderer && this._globePlanetId !== colony.planetId) {
      this._closeGlobe();
    }

    if (this._globeRenderer) return; // już otwarty dla tej planety

    this._globeRenderer = new PlanetGlobeRenderer();
    this._globeRenderer.open(colony.planet, grid, bounds, true);
    this._globeRenderer.setShowGrid(true);
    this._globePlanetId = colony.planetId;

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

  // ── Pobierz grid kolonii (z cache lub generuj) ──────────────────────
  _getGrid(colony) {
    if (!colony) return null;
    const pid = colony.planetId;
    // Sprawdź czy BuildingSystem ma grid (aktywna kolonia)
    if (colony.grid) return colony.grid;
    // Cache
    if (this._gridCache[pid]) return this._gridCache[pid];
    // Generuj (deterministyczny PRNG)
    if (colony.planet) {
      const grid = PlanetMapGenerator.generate(colony.planet, true);
      // Synchronizuj budynki z _active na tile
      this._syncTileBuildings(grid, colony.buildingSystem);
      this._gridCache[pid] = grid;
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

    // Tło
    ctx.fillStyle = 'rgba(2,4,5,0.97)';
    ctx.fillRect(ox, oy, ow, oh);
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

    // Tooltip budynku (hover nad kartą w build list)
    if (this._tooltipBuildingId) {
      this._drawBuildingTooltip(ctx, W, H);
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
    const hdrH = 36;
    const globeBounds = {
      x: (centerX) * _UI_SCALE,
      y: (centerY + hdrH) * _UI_SCALE,
      w: (centerW) * _UI_SCALE,
      h: (centerH - hdrH) * _UI_SCALE,
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
      if (ry + ROW_H < listY) { ry += ROW_H; continue; }
      if (ry > listY + listH) break;

      const isSel = col.planetId === this._selectedColonyId;
      const isHov = col.planetId === this._hoverRowId;
      const civ = col.civSystem;
      const bSys = col.buildingSystem;
      const pop = civ?.population ?? 0;
      const housing = civ?.housing ?? 0;
      const buildingCount = bSys?._active?.size ?? 0;
      const rSys = col.resourceSystem;
      const energyBal = rSys?._energyFlow?.balance ?? 0;

      // Tło wiersza
      if (isSel) {
        ctx.fillStyle = 'rgba(0,255,180,0.05)';
        ctx.fillRect(x, ry, w, ROW_H);
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(x, ry, 2, ROW_H);
      } else if (isHov) {
        ctx.fillStyle = 'rgba(0,255,180,0.03)';
        ctx.fillRect(x, ry, w, ROW_H);
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

      // Pasek zabudowania
      const grid = this._getGrid(col);
      const totalHexes = grid ? grid.filter(t => TERRAIN_TYPES[t.type]?.buildable).length : 1;
      const usedHexes = buildingCount;
      const fillPct = totalHexes > 0 ? usedHexes / totalHexes : 0;
      const barColor = fillPct >= 0.9 ? THEME.danger : fillPct >= 0.6 ? THEME.warning : THEME.success;
      this._drawBar(ctx, x + pad, ry + 20, w - pad * 2, 3, fillPct, barColor, THEME.border);

      // Dolna linijka
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      const enColor = energyBal >= 0 ? THEME.success : THEME.danger;
      ctx.fillText(`POP: ${pop}/${housing}`, x + pad, ry + 38);
      ctx.fillText(`BUD: ${buildingCount}`, x + pad + 76, ry + 38);
      ctx.fillStyle = enColor;
      ctx.fillText(`⚡${energyBal >= 0 ? '+' : ''}${energyBal.toFixed(0)}`, x + pad + 136, ry + 38);

      // Separator
      this._drawSeparator(ctx, x + 4, ry + ROW_H - 1, x + w - 4, ry + ROW_H - 1);

      // Hit zone
      this._addHit(x, ry, w, ROW_H, 'colony', { planetId: col.planetId });
      ry += ROW_H;
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════
  // ŚRODKOWA KOLUMNA — globus 3D planety
  // ══════════════════════════════════════════════════════════════════════

  _drawCenter(ctx, x, y, w, h, colony, colonies) {
    // Nagłówek
    const hdrH = 36;
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
    if (colIdx > 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('← POPRZ.', x + 8, y + 22);
      this._addHit(x, y, 80, hdrH, 'prevColony');
    }
    if (colIdx < colonies.length - 1) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      ctx.fillText('NAST. →', x + w - 8, y + 22);
      ctx.textAlign = 'left';
      this._addHit(x + w - 80, y, 80, hdrH, 'nextColony');
    }

    // Nazwa kolonii (wyśrodkowana)
    const name = colony.name ?? colony.planet?.name ?? '???';
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.textAlign = 'center';
    ctx.fillText(`🌍 ${name}`, x + w / 2, y + 22);
    ctx.textAlign = 'left';

    // Obszar mapy — tutaj rysuje się globus 3D (WebGL canvas)
    // Hit zone na obszar globusa (do obsługi drag/click)
    const mapX = x;
    const mapY = y + hdrH;
    const mapW = w;
    const mapH = h - hdrH;
    this._addHit(mapX, mapY, mapW, mapH, 'globe');

    // BuildMode info (na dole środkowej kolumny)
    if (this._buildMode && this._pendingBuildingId) {
      const pB = BUILDINGS[this._pendingBuildingId];
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = 'rgba(2,4,5,0.85)';
      ctx.fillRect(mapX, mapY + mapH - 28, mapW, 28);
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`🏗 Tryb budowy: ${pB?.icon} ${pB?.namePL} — Kliknij hex · Esc anuluj`, mapX + 10, mapY + mapH - 10);
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

  // ── Lista budynków (panel budowania) ──────────────────────────────

  _drawBuildList(ctx, x, y, w, h, colony, tile) {
    const pad = 10;

    // Nagłówek
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, 32);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText('🏗 BUDUJ', x + pad, y + 20);
    this._drawSeparator(ctx, x, y + 32, x + w, y + 32);

    if (this._buildMode && this._pendingBuildingId) {
      const pB = BUILDINGS[this._pendingBuildingId];
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`Tryb budowy: ${pB?.icon} ${pB?.namePL}`, x + pad, y + 46);
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Kliknij hex na mapie · Esc anuluj', x + pad, y + 58);
    }

    // Błąd budowy
    if (this._buildError && Date.now() < this._buildErrorTime) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText(`⚠ ${this._buildError}`, x + pad, y + 70);
    }

    const startY = y + (this._buildMode ? 80 : 36);
    const listH = h - (startY - y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, startY, w, listH);
    ctx.clip();

    let ly = startY - this._scrollRight;
    const tSys = window.KOSMOS?.techSystem;
    const inv = colony.resourceSystem?.getInventory?.() ?? {};

    for (const cat of BUILDING_CATEGORIES) {
      const buildings = Object.values(BUILDINGS).filter(b => b.category === cat.id && b.id !== 'colony_base');
      if (buildings.length === 0) continue;

      const collapsed = this._collapsedCategories.has(cat.id);

      // Nagłówek kategorii
      if (ly + 22 > startY - 40) {
        ctx.fillStyle = 'rgba(0,255,180,0.03)';
        ctx.fillRect(x, ly, w, 22);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = cat.color;
        ctx.fillText(`${collapsed ? '▸' : '▾'} ${cat.label}`, x + pad, ly + 15);
        this._addHit(x, ly, w, 22, 'toggleCat', { catId: cat.id });
      }
      ly += 22;

      if (collapsed) continue;

      for (const b of buildings) {
        const cardH = 46;
        if (ly + cardH < startY) { ly += cardH + 2; continue; }
        if (ly > startY + listH + 20) { ly += cardH + 2; continue; }

        const techOk = !b.requires || (tSys?.isResearched(b.requires) ?? false);
        const canAfford = this._canAfford(colony, b);
        const locked = !techOk;

        // Tło karty
        ctx.globalAlpha = locked ? 0.4 : 1;
        ctx.fillStyle = THEME.bgPrimary;
        ctx.fillRect(x + 4, ly, w - 8, cardH);

        // Obramowanie
        if (locked) ctx.strokeStyle = THEME.border;
        else if (!canAfford) ctx.strokeStyle = 'rgba(255,51,68,0.3)';
        else ctx.strokeStyle = THEME.borderLight;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 4, ly, w - 8, cardH);

        // Ikona + nazwa
        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(`${b.icon} ${b.namePL}`, x + pad, ly + 14);
        if (locked) {
          ctx.fillStyle = THEME.textDim;
          ctx.fillText('🔒', x + w - 28, ly + 14);
        }

        // Opis
        if (b.description) {
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textSecondary;
          const desc = b.description.length > 40 ? b.description.slice(0, 40) + '…' : b.description;
          ctx.fillText(desc, x + pad + 4, ly + 28);
        }

        // Produkcja
        if (b.rates && Object.keys(b.rates).length > 0) {
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.success;
          ctx.fillText(formatRates(b.rates), x + pad + 4, ly + 40);
        }

        // Wymagana tech
        if (b.requires && !techOk) {
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`wymaga: ${b.requires}`, x + pad + 4, ly + 40);
        }

        ctx.globalAlpha = 1;

        // Hit zone — budynki (tooltip + kliknięcie)
        this._addHit(x + 4, ly, w - 8, cardH, 'selectBuilding', { buildingId: b.id, locked });

        ly += cardH + 2;
      }
    }

    ctx.restore();
  }

  // ── Tooltip budynku (hover w build list) ────────────────────────────

  _drawBuildingTooltip(ctx, W, H) {
    const b = BUILDINGS[this._tooltipBuildingId];
    if (!b) return;

    const PAD = 8;
    const LINE_H = 13;
    const HDR_H_T = 16;
    const SEP_H = 6;
    const MAX_W = 260;
    const OFS = 14;

    // Buduj linie tooltipa
    const lines = [];
    lines.push({ type: 'header', text: `${b.icon} ${b.namePL}` });
    lines.push({ type: 'sep' });

    if (b.description) {
      const words = b.description.split(' ');
      let cur = '';
      for (const word of words) {
        if (cur.length + word.length + 1 > 36 && cur.length > 0) {
          lines.push({ type: 'line', text: cur, color: THEME.textSecondary });
          cur = word;
        } else {
          cur = cur ? cur + ' ' + word : word;
        }
      }
      if (cur) lines.push({ type: 'line', text: cur, color: THEME.textSecondary });
      lines.push({ type: 'sep' });
    }

    // Koszt surowców + commodities
    const costStr = formatCost(b.cost, b.popCost, b.commodityCost);
    if (costStr) lines.push({ type: 'line', text: `Koszt: ${costStr}`, color: THEME.warning });

    // Produkcja
    if (b.rates && Object.keys(b.rates).length > 0) {
      const rStr = formatRates(b.rates);
      if (rStr) lines.push({ type: 'line', text: `Produkcja: ${rStr}`, color: THEME.success });
    }

    // Housing
    if (b.housing > 0) lines.push({ type: 'line', text: `Mieszkania: +${b.housing} POP`, color: THEME.info ?? THEME.accent });

    // Czas budowy
    if (b.buildTime > 0) lines.push({ type: 'line', text: `Budowa: ${b.buildTime} lat`, color: THEME.textSecondary });

    // Wymagana tech
    if (b.requires) lines.push({ type: 'line', text: `Wymaga: ${b.requires}`, color: THEME.purple ?? '#cc66ff' });

    // Oblicz wymiary
    ctx.save();
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    let maxTW = 0;
    let totalH = PAD * 2;
    for (const ln of lines) {
      if (ln.type === 'sep') { totalH += SEP_H; continue; }
      if (ln.type === 'header') {
        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        maxTW = Math.max(maxTW, ctx.measureText(ln.text).width);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        totalH += HDR_H_T;
      } else {
        maxTW = Math.max(maxTW, ctx.measureText(ln.text).width);
        totalH += LINE_H;
      }
    }
    const tw = Math.min(MAX_W, maxTW + PAD * 2 + 4);
    const th = totalH;

    // Pozycja (unikaj wyjścia poza ekran)
    let tx = this._tooltipX + OFS;
    let ty = this._tooltipY + OFS;
    if (tx + tw > W - 4) tx = this._tooltipX - tw - 4;
    if (ty + th > H - 4) ty = this._tooltipY - th - 4;
    if (tx < 4) tx = 4;
    if (ty < 4) ty = 4;

    // Tło
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = THEME.bgPrimary;
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = THEME.borderActive ?? THEME.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    ctx.globalAlpha = 1;

    // Rysuj linie
    let cy = ty + PAD;
    for (const ln of lines) {
      if (ln.type === 'sep') {
        cy += 2;
        ctx.strokeStyle = THEME.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx + 6, cy);
        ctx.lineTo(tx + tw - 6, cy);
        ctx.stroke();
        cy += SEP_H - 2;
      } else if (ln.type === 'header') {
        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(ln.text, tx + PAD, cy + 11);
        cy += HDR_H_T;
      } else {
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = ln.color ?? THEME.textPrimary;
        ctx.fillText(ln.text, tx + PAD, cy + 9);
        cy += LINE_H;
      }
    }
    ctx.restore();
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

    // Nagłówek
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, 32);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${bDef.icon} ${bDef.namePL}`, x + pad, y + 20);
    this._drawSeparator(ctx, x, y + 32, x + w, y + 32);

    let ly = y + 40;

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

    // Ulepszenie
    if (level < maxLvl) {
      const nextLevel = level + 1;
      const upgCostMult = nextLevel * 1.2;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`Ulepszenie → Poz. ${nextLevel}`, x + pad, ly);
      ly += 14;

      const upgCostParts = [];
      for (const [k, v] of Object.entries(bDef.cost)) {
        upgCostParts.push(`${Math.ceil(v * upgCostMult)}${RESOURCE_ICONS[k] ?? k}`);
      }
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(upgCostParts.join(' '), x + pad, ly);
      ly += 18;

      // Przycisk ULEPSZ
      this._drawButton(ctx, '▲ ULEPSZ', x + pad, ly, w - pad * 2, 24, 'primary');
      this._addHit(x + pad, ly, w - pad * 2, 24, 'upgrade', { q: tile.q, r: tile.r, buildingId: tile.buildingId });
      ly += 32;
    }

    // Przycisk BURZ
    if (!bDef.isCapital) {
      this._drawButton(ctx, '🗑 BURZ', x + pad, ly, w - pad * 2, 24, 'danger');
      this._addHit(x + pad, ly, w - pad * 2, 24, 'demolish', { q: tile.q, r: tile.r });
    }
  }

  // ── Pusty hex ──────────────────────────────────────────────────────

  _drawEmptyHex(ctx, x, y, w, h, tile) {
    const pad = 10;
    let ly = y + 20;

    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('HEX PUSTY', x + pad, ly);
    ly += 18;

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
    const inv = colony?.resourceSystem?.getInventory?.() ?? {};
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

    // Hover nad wierszem kolonii
    this._hoverRowId = null;
    this._tooltipBuildingId = null;
    for (const z of this._hitZones) {
      if (z.type === 'colony' && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
        this._hoverRowId = z.data.planetId;
        break;
      }
      if (z.type === 'selectBuilding' && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
        this._tooltipBuildingId = z.data.buildingId;
        this._tooltipX = x;
        this._tooltipY = y;
      }
    }

    // Drag kamery globusa
    if (this._isDraggingGlobe && this._globeRenderer) {
      this._globeRenderer.cameraCtrl.applyDrag(x * _UI_SCALE, y * _UI_SCALE);
      return;
    }

    // Hover na globie — deleguj raycast
    const globeZone = this._hitZones.find(z => z.type === 'globe');
    if (globeZone && this._globeRenderer) {
      if (x >= globeZone.x && x <= globeZone.x + globeZone.w &&
          y >= globeZone.y && y <= globeZone.y + globeZone.h) {
        this._globeRenderer.handleExternalMouseMove(x * _UI_SCALE, y * _UI_SCALE);
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
