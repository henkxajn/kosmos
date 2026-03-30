// BiomeMapGenerator — generuje DataTexture z danymi biomów (R=biomId, G=height, B=humidity)
//
// Wejście: RegionSystem lub HexGrid + planet
// Wyjście: THREE.DataTexture 512×256, RGBA, Uint8Array
// Każdy piksel koduje: R=biomId (0-9), G=wysokość (0-255), B=wilgotność (0-255), A=255
//
// Tekstura używana jako uniform sampler2D w shaderze GLSL planety.
// Dwa tryby: RegionSystem (Voronoi na sferze) i HexGrid (hex → UV → piksel).

import * as THREE from 'three';
import { HexGrid } from '../map/HexGrid.js';
import { getTerrainImageData, texturesLoaded } from './TerrainTextures.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';

// Kodowanie biomów → kanały RGB
const BIOME_DATA = {
  plains:    { id: 0, height: 128, humidity: 120 },
  mountains: { id: 1, height: 220, humidity:  40 },
  ocean:     { id: 2, height:  30, humidity: 255 },
  forest:    { id: 3, height: 110, humidity: 200 },
  desert:    { id: 4, height: 100, humidity:  10 },
  tundra:    { id: 5, height: 140, humidity:  80 },
  volcano:   { id: 6, height: 200, humidity:  20 },
  crater:    { id: 7, height:  80, humidity:  30 },
  ice_sheet: { id: 8, height: 160, humidity:  60 },
  wasteland: { id: 9, height:  90, humidity:  25 },
};

const BUF_W = 1024;
const BUF_H = 512;

export class BiomeMapGenerator {

  /**
   * Generuje DataTexture z mapą biomów.
   * Obsługuje RegionSystem (getByLatLon) i HexGrid (forEach + hexToPixel).
   * @param {RegionSystem|HexGrid} grid
   * @param {object} planet
   * @returns {THREE.DataTexture|null}
   */
  static generate(grid, planet) {
    if (!grid) return null;

    // RegionSystem: Voronoi na sferze
    if (grid.getByLatLon) {
      return BiomeMapGenerator._generateRegions(grid);
    }

    // HexGrid: hex → UV → piksel
    if (grid.width !== undefined && grid.height !== undefined) {
      return BiomeMapGenerator._generateHexGrid(grid);
    }

    return null;
  }

  // ── RegionSystem: Voronoi per piksel ──────────────────────────────────────
  static _generateRegions(grid) {
    const regions = grid.toArray();
    if (regions.length === 0) return null;

    // Przelicz centra regionów na kartezjańskie (sfera jednostkowa)
    const centers = regions.map(region => {
      const phi = Math.PI / 2 - region.centerLat;
      return {
        nx: Math.sin(phi) * Math.cos(region.centerLon),
        ny: Math.cos(phi),
        nz: Math.sin(phi) * Math.sin(region.centerLon),
        type: region.type,
      };
    });

    const data = new Uint8Array(BUF_W * BUF_H * 4);

    for (let py = 0; py < BUF_H; py++) {
      const lat = Math.PI / 2 - (py / BUF_H) * Math.PI;
      const phi = Math.PI / 2 - lat;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      for (let px = 0; px < BUF_W; px++) {
        const lon = (px / BUF_W) * 2 * Math.PI;
        const pnx = sinPhi * Math.cos(lon);
        const pny = cosPhi;
        const pnz = sinPhi * Math.sin(lon);

        // Najbliższy region (max dot product)
        let bestDot = -2;
        let bestIdx = 0;
        for (let i = 0; i < centers.length; i++) {
          const dot = pnx * centers[i].nx + pny * centers[i].ny + pnz * centers[i].nz;
          if (dot > bestDot) {
            bestDot = dot;
            bestIdx = i;
          }
        }

        const biome = BIOME_DATA[centers[bestIdx].type] ?? BIOME_DATA.plains;
        const idx = (py * BUF_W + px) * 4;
        data[idx]     = biome.id;
        data[idx + 1] = biome.height;
        data[idx + 2] = biome.humidity;
        data[idx + 3] = 255;
      }
    }

    return BiomeMapGenerator._createTexture(data);
  }

  // ── HexGrid: hex → UV → piksel ───────────────────────────────────────────
  static _generateHexGrid(grid) {
    // Oblicz hexSize (identycznie jak PlanetTerrainTexture)
    const TEX_W = BUF_W, TEX_H = BUF_H;
    const byW = TEX_W / (Math.sqrt(3) * (grid.width + 0.5));
    const byH = TEX_H / (1.5 * grid.height + 0.5);
    const hexSize = Math.floor(Math.min(byW, byH));

    const gridPx = grid.gridPixelSize(hexSize);

    // Zbierz pozycje hexów i ich biomy + kopie przesunięte o ±gridPx.w (seamless wrapping)
    const baseHexes = [];
    grid.forEach(tile => {
      const center = grid.tilePixelPos
        ? grid.tilePixelPos(tile.q, tile.r, hexSize)
        : HexGrid.hexToPixel(tile.q, tile.r, hexSize);
      baseHexes.push({
        cx: center.x,
        cy: center.y,
        type: tile.type,
      });
    });

    if (baseHexes.length === 0) return null;

    // Dodaj kopie wraparound (hexy z lewej strony widziane po prawej i odwrotnie)
    const hexes = [];
    for (const h of baseHexes) {
      hexes.push(h);                                          // oryginał
      hexes.push({ cx: h.cx + gridPx.w, cy: h.cy, type: h.type }); // kopia przesunięta w prawo
      hexes.push({ cx: h.cx - gridPx.w, cy: h.cy, type: h.type }); // kopia przesunięta w lewo
    }

    const data = new Uint8Array(BUF_W * BUF_H * 4);

    // Per piksel bufora: mapuj do pozycji w gridzie, znajdź najbliższy hex (z wrappingiem)
    for (let py = 0; py < BUF_H; py++) {
      const gy = (py / BUF_H) * gridPx.h;
      for (let px = 0; px < BUF_W; px++) {
        const gx = (px / BUF_W) * gridPx.w;

        // Znajdź najbliższy hex (brute-force z kopiami wraparound)
        let bestDist = Infinity;
        let bestIdx = 0;
        for (let i = 0; i < hexes.length; i++) {
          const dx = gx - hexes[i].cx;
          const dy = gy - hexes[i].cy;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }

        const biome = BIOME_DATA[hexes[bestIdx].type] ?? BIOME_DATA.plains;
        const idx = (py * BUF_W + px) * 4;
        data[idx]     = biome.id;
        data[idx + 1] = biome.height;
        data[idx + 2] = biome.humidity;
        data[idx + 3] = 255;
      }
    }

    return BiomeMapGenerator._createTexture(data);
  }

  // ── Mapa kolorów z tekstur terenu → CanvasTexture (diffuse 3D) ────────────
  // Dla każdego piksela equirectangular: znajdź hex → próbkuj teksturę PNG
  // Wynik: 1:1 dopasowanie między mapą 2D a globusem 3D
  // Optymalizacja: spatial grid (O(1) lookup) zamiast brute-force (O(N))
  static generateColorMap(grid, planet) {
    if (!grid || !texturesLoaded()) return null;
    if (grid.width === undefined) return null;

    const TEX_W = BUF_W, TEX_H = BUF_H;
    const byW = TEX_W / (Math.sqrt(3) * (grid.width + 0.5));
    const byH = TEX_H / (1.5 * grid.height + 0.5);
    const hexSize = Math.floor(Math.min(byW, byH));
    const gridPx = grid.gridPixelSize(hexSize);

    // Zbierz hexy z ich ImageData tekstur (z tapered offset!)
    const baseHexes = [];
    grid.forEach(tile => {
      const center = grid.tilePixelPos
        ? grid.tilePixelPos(tile.q, tile.r, hexSize)
        : HexGrid.hexToPixel(tile.q, tile.r, hexSize);
      const tileIdx = Math.abs(tile.q * 31 + tile.r * 17);
      const imgData = getTerrainImageData(tile.type, planet, tileIdx);
      const terrain = TERRAIN_TYPES[tile.type];
      const fc = terrain?.color ?? 0x888888;
      baseHexes.push({
        cx: center.x, cy: center.y, imgData,
        fallbackR: (fc >> 16) & 0xFF,
        fallbackG: (fc >> 8) & 0xFF,
        fallbackB: fc & 0xFF,
      });
    });
    if (baseHexes.length === 0) return null;

    // Kopie wraparound (seamless w poziomie)
    const hexes = [];
    for (const h of baseHexes) {
      hexes.push(h);
      hexes.push({ ...h, cx: h.cx + gridPx.w });
      hexes.push({ ...h, cx: h.cx - gridPx.w });
    }

    // ── Spatial grid: dziel przestrzeń na komórki rozmiaru cellSize ────────
    // Każda komórka zawiera indeksy hexów których centrum jest blisko
    const cellSize = hexSize * 1.8; // nieco większy niż hex → pokrycie sąsiadów
    const gridCols = Math.ceil(gridPx.w / cellSize) + 2;
    const gridRows = Math.ceil(gridPx.h / cellSize) + 2;
    const spatialGrid = new Array(gridCols * gridRows);
    for (let i = 0; i < spatialGrid.length; i++) spatialGrid[i] = [];

    for (let i = 0; i < hexes.length; i++) {
      const gc = Math.floor(hexes[i].cx / cellSize) + 1;
      const gr = Math.floor(hexes[i].cy / cellSize) + 1;
      // Wstaw do komórki i sąsiednich (3×3) — gwarancja znalezienia najbliższego
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const c = gc + dc, r = gr + dr;
          if (c >= 0 && c < gridCols && r >= 0 && r < gridRows) {
            spatialGrid[r * gridCols + c].push(i);
          }
        }
      }
    }

    // Generuj piksele (polar cap nie jest tu potrzebny — hex grid ma ice_sheet na biegunach)
    const canvas = document.createElement('canvas');
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext('2d');
    const outData = ctx.createImageData(TEX_W, TEX_H);
    const out = outData.data;

    for (let py = 0; py < TEX_H; py++) {
      const gy = (py / TEX_H) * gridPx.h;
      const gr = Math.floor(gy / cellSize) + 1;

      for (let px = 0; px < TEX_W; px++) {
        const gx = (px / TEX_W) * gridPx.w;
        const gc = Math.floor(gx / cellSize) + 1;

        // Szukaj najbliższego hexa tylko w komórce spatial grid
        const cellIdx = (gr >= 0 && gr < gridRows && gc >= 0 && gc < gridCols)
          ? gr * gridCols + gc : -1;
        const candidates = cellIdx >= 0 ? spatialGrid[cellIdx] : null;

        let bestDist = Infinity, bestIdx = 0;
        if (candidates && candidates.length > 0) {
          for (let k = 0; k < candidates.length; k++) {
            const i = candidates[k];
            const dx = gx - hexes[i].cx, dy = gy - hexes[i].cy;
            const dist = dx * dx + dy * dy;
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }
          }
        } else {
          // Fallback: brute-force (rzadki case — piksele na krawędzi)
          for (let i = 0; i < hexes.length; i++) {
            const dx = gx - hexes[i].cx, dy = gy - hexes[i].cy;
            const dist = dx * dx + dy * dy;
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }
          }
        }

        const hex = hexes[bestIdx];
        const oIdx = (py * TEX_W + px) * 4;

        // Próbkuj kolor z tekstury lub fallback
        function sampleHex(h, sx, sy) {
          if (h.imgData) {
            const tw = h.imgData.width, th = h.imgData.height;
            const scale = tw / (hexSize * 2.5);
            const stx = Math.floor((sx * scale) % tw + tw) % tw;
            const sty = Math.floor((sy * scale) % th + th) % th;
            const si = (sty * tw + stx) * 4;
            return [h.imgData.data[si], h.imgData.data[si+1], h.imgData.data[si+2]];
          }
          return [h.fallbackR, h.fallbackG, h.fallbackB];
        }

        let [r, g, b] = sampleHex(hex, gx, gy);

        // Biome blending: mieszaj kolory na granicy hexów (delikatne przejścia)
        if (candidates && candidates.length > 1) {
          let secondDist = Infinity, secondIdx = bestIdx;
          for (let k = 0; k < candidates.length; k++) {
            const ci = candidates[k];
            if (ci === bestIdx) continue;
            const dx2 = gx - hexes[ci].cx, dy2 = gy - hexes[ci].cy;
            const d2 = dx2 * dx2 + dy2 * dy2;
            if (d2 < secondDist) { secondDist = d2; secondIdx = ci; }
          }
          if (secondIdx !== bestIdx) {
            const ratio = bestDist / (secondDist + 0.001);
            if (ratio > 0.75) { // tylko bardzo blisko granicy
              const blend = (ratio - 0.75) / 0.25; // 0 przy 0.75, 1 przy 1.0
              const t = blend * 0.3; // max 30% drugiego koloru
              const [r2, g2, b2] = sampleHex(hexes[secondIdx], gx, gy);
              r = Math.round(r * (1 - t) + r2 * t);
              g = Math.round(g * (1 - t) + g2 * t);
              b = Math.round(b * (1 - t) + b2 * t);
            }
          }
        }

        out[oIdx] = r; out[oIdx + 1] = g; out[oIdx + 2] = b;
        out[oIdx + 3] = 255;
      }
    }

    ctx.putImageData(outData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  // ── Utwórz DataTexture z bufora ──────────────────────────────────────────
  static _createTexture(data) {
    const tex = new THREE.DataTexture(data, BUF_W, BUF_H, THREE.RGBAFormat);
    tex.type = THREE.UnsignedByteType;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;  // seamless wrap w poziomie (sfera)
    tex.needsUpdate = true;
    return tex;
  }
}
