// PlanetGlobeTexture — overlay canvas dla globusa planety
//
// Generuje PRZEZROCZYSTĄ teksturę 1024×512 (equirectangular) z:
//   - Markerami budynków (kolorowe kółka per kategoria)
//   - Markerami stolicy (niebieski)
//   - Highlight hexów (selected/hovered)
//   - Opcjonalną siatką hex (delikatne linie)
//
// Główna tekstura planety to pre-generowane PNG PBR (MeshStandardMaterial).
// Ten moduł rysuje TYLKO overlay na oddzielnej sferze (r=1.005).

import * as THREE from 'three';
import { HexGrid }       from '../map/HexGrid.js';
import { TERRAIN_TYPES }  from '../map/HexTile.js';
import { BUILDINGS }      from '../data/BuildingsData.js';

// ── Rozmiar tekstury ──────────────────────────────────────────
const TEX_W = 1024;
const TEX_H = 512;

// ── Kolory kategorii budynków (markery na globie) ─────────────
const CAT_COLORS = {
  mining:     [204, 153,  68],
  energy:     [255, 221,  68],
  food:       [ 68, 204, 102],
  population: [ 68, 136, 255],
  research:   [204, 102, 255],
  military:   [255,  68,  68],
  space:      [170, 170, 255],
};

// ── API publiczne ─────────────────────────────────────────────

export class PlanetGlobeTexture {

  // Optymalny hexSize aby siatka pokryła teksturę
  static calcHexSize(grid) {
    const hexByW = TEX_W / (Math.sqrt(3) * (grid.width + 0.5));
    const hexByH = TEX_H / (1.5 * grid.height + 0.5);
    return Math.floor(Math.min(hexByW, hexByH));
  }

  // ── Overlay: markery + highlight + opcjonalna siatka ────────

  // Generuje nową CanvasTexture (przezroczyste tło + markery + highlight + siatka)
  static generateOverlay(grid, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.width  = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext('2d');
    // Canvas domyślnie przezroczysty (alpha=0)

    PlanetGlobeTexture._drawOverlayContent(ctx, grid, options);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Odśwież istniejącą teksturę overlay (clearRect + przerysuj)
  static updateOverlay(existingTex, grid, options = {}) {
    const canvas = existingTex.image;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, TEX_W, TEX_H);

    PlanetGlobeTexture._drawOverlayContent(ctx, grid, options);

    existingTex.needsUpdate = true;
  }

  // ── Kompatybilność wsteczna (używane w raycast — calcHexSize) ──

  // Stare API — zachowane dla PlanetGlobeRenderer._raycastToTile()
  static generateHighlightTexture(grid, selectedTile, hoveredTile) {
    return PlanetGlobeTexture.generateOverlay(grid, {
      showGrid: false,
      showBuildings: false,
      selectedTile,
      hoveredTile,
    });
  }

  static updateHighlightTexture(existingTex, grid, selectedTile, hoveredTile) {
    PlanetGlobeTexture.updateOverlay(existingTex, grid, {
      showGrid: false,
      showBuildings: false,
      selectedTile,
      hoveredTile,
    });
  }

  // ── Rysowanie zawartości overlay ──────────────────────────────

  static _drawOverlayContent(ctx, grid, options) {
    const hexSize = PlanetGlobeTexture.calcHexSize(grid);
    const gridPx  = grid.gridPixelSize(hexSize);

    // 1. Siatka hex (opcjonalna, delikatna)
    if (options.showGrid) {
      PlanetGlobeTexture._drawHexGrid(ctx, grid, hexSize, gridPx);
    }

    // 2. Markery budynków
    if (options.showBuildings !== false) {
      PlanetGlobeTexture._drawBuildingMarkers(ctx, grid, hexSize, gridPx);
    }

    // 3. Highlight hexów (selected + hovered)
    if (options.selectedTile) {
      PlanetGlobeTexture._drawHexHighlight(ctx, options.selectedTile.q, options.selectedTile.r, hexSize, gridPx, 'selected');
    }
    if (options.hoveredTile) {
      const sel = options.selectedTile;
      if (!sel || options.hoveredTile.q !== sel.q || options.hoveredTile.r !== sel.r) {
        PlanetGlobeTexture._drawHexHighlight(ctx, options.hoveredTile.q, options.hoveredTile.r, hexSize, gridPx, 'hovered');
      }
    }
  }

  // ── Delikatna siatka hex ──────────────────────────────────────

  static _drawHexGrid(ctx, grid, hexSize, gridPx) {
    const scaleX = TEX_W / gridPx.w;
    const scaleY = TEX_H / gridPx.h;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth   = 1;

    grid.forEach(tile => {
      const center = HexGrid.hexToPixel(tile.q, tile.r, hexSize);
      const texCX = (center.x / gridPx.w) * TEX_W;
      const texCY = (center.y / gridPx.h) * TEX_H;

      // 6 wierzchołków hexa (pointy-top)
      const hexR = hexSize * 0.95;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        const px = texCX + hexR * Math.cos(angle) * scaleX;
        const py = texCY + hexR * Math.sin(angle) * scaleY;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    });
  }

  // ── Markery budynków ────────────────────────────────────────

  static _drawBuildingMarkers(ctx, grid, hexSize, gridPx) {
    // Kolory anomalii
    const ANOMALY_COLORS = {
      scientific: [100, 200, 255],
      resource:   [255, 200, 50],
      danger:     [255, 80, 50],
    };

    grid.forEach(tile => {
      const hasBuilding = tile.buildingId && BUILDINGS[tile.buildingId];
      const hasCapital  = tile.capitalBase;
      const hasAnomaly  = tile.anomaly;
      if (!hasBuilding && !hasCapital && !hasAnomaly) return;

      // Centrum hexa w pikselach siatki → piksel tekstury
      const center = HexGrid.hexToPixel(tile.q, tile.r, hexSize);
      const texX = (center.x / gridPx.w) * TEX_W;
      const texY = (center.y / gridPx.h) * TEX_H;

      if (hasBuilding) {
        const building = BUILDINGS[tile.buildingId];
        // Kolor kategorii
        const catCol = CAT_COLORS[building.category] ?? [200, 200, 200];

        // Kółko 5px
        ctx.beginPath();
        ctx.arc(texX, texY, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${catCol[0]},${catCol[1]},${catCol[2]})`;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.stroke();

        // Mały marker Stolicy w rogu jeśli oba
        if (hasCapital) {
          ctx.beginPath();
          ctx.arc(texX - 4, texY - 4, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgb(68, 136, 255)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.stroke();
        }
      } else if (hasCapital) {
        // Marker Stolicy (niebieski)
        ctx.beginPath();
        ctx.arc(texX, texY, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(68, 136, 255)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.stroke();
      }

      // Marker anomalii (romb/diament) — obok budynku lub samodzielny
      if (hasAnomaly) {
        const aCol = ANOMALY_COLORS[tile.anomaly] ?? [200, 200, 200];
        const ax = hasBuilding || hasCapital ? texX + 6 : texX;
        const ay = hasBuilding || hasCapital ? texY - 6 : texY;
        const s = 4; // rozmiar rombu
        ctx.beginPath();
        ctx.moveTo(ax,     ay - s);
        ctx.lineTo(ax + s, ay);
        ctx.lineTo(ax,     ay + s);
        ctx.lineTo(ax - s, ay);
        ctx.closePath();
        ctx.fillStyle = `rgb(${aCol[0]},${aCol[1]},${aCol[2]})`;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.stroke();
      }
    });
  }

  // ── Highlight hexa ──────────────────────────────────────────

  // Rysuje JEDEN hex jako Canvas 2D path (fill + stroke) — <1ms
  static _drawHexHighlight(ctx, q, r, hexSize, gridPx, type) {
    // Centrum hexa w pikselach siatki → piksele tekstury
    const center = HexGrid.hexToPixel(q, r, hexSize);
    const texCX = (center.x / gridPx.w) * TEX_W;
    const texCY = (center.y / gridPx.h) * TEX_H;

    // Skala hexa: hex pixel size → texture pixels
    const scaleX = TEX_W / gridPx.w;
    const scaleY = TEX_H / gridPx.h;

    // 6 wierzchołków hexa (pointy-top, lekko mniejszy aby mieścił się wewnątrz krawędzi)
    const hexR = hexSize * 0.92;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      pts.push({
        x: texCX + hexR * Math.cos(angle) * scaleX,
        y: texCY + hexR * Math.sin(angle) * scaleY,
      });
    }

    // Fill + stroke
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();

    if (type === 'selected') {
      ctx.fillStyle   = 'rgba(136, 255, 204, 0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(136, 255, 204, 0.8)';
      ctx.lineWidth   = 2 * Math.max(scaleX, scaleY);
    } else {
      ctx.fillStyle   = 'rgba(255, 255, 255, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth   = 1.5 * Math.max(scaleX, scaleY);
    }
    ctx.stroke();
  }
}
