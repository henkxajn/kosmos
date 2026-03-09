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
      const center = HexGrid.hexToPixel(tile.q, tile.r, hexSize);
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
