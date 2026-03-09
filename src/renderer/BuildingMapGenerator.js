// BuildingMapGenerator — generuje DataTexture z pozycjami budynków (R=jest budynek, G=kategoria)
//
// Wejście: grid (RegionSystem lub HexGrid) z tile'ami zawierającymi buildingId/capitalBase
// Wyjście: THREE.DataTexture 512×256, RGBA, Uint8Array
// Każdy piksel koduje: R=255 (budynek) lub R=0 (brak), G=kategoria (1-7), B=0, A=255
//
// Tekstura używana do nocnych świateł budynków na globie planety.

import * as THREE from 'three';
import { HexGrid } from '../map/HexGrid.js';

const BUF_W = 512;
const BUF_H = 256;

// Seeded PRNG — deterministyczny per budynek (Mulberry32)
function makePRNG(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return function() {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Oblicz hexSize dopasowany do rozmiaru bufora
function calcHexSize(grid) {
  const byW = BUF_W / (Math.sqrt(3) * (grid.width + 0.5));
  const byH = BUF_H / (1.5 * grid.height + 0.5);
  return Math.floor(Math.min(byW, byH));
}

// Rysuj cluster losowych punktów wokół centrum budynku (8-12 punktów w kole r=6)
function drawBuildingCluster(data, px, py, seed) {
  const rand = makePRNG(seed);
  const pointCount = 8 + Math.floor(rand() * 5);  // 8-12 punktów

  for (let i = 0; i < pointCount; i++) {
    // Losowe przesunięcie w kole r=6 wokół centrum
    const angle = rand() * Math.PI * 2;
    const radius = rand() * 6;
    const dx = Math.round(Math.cos(angle) * radius);
    const dy = Math.round(Math.sin(angle) * radius);

    const bx = Math.min(Math.max(px + dx, 0), BUF_W - 1);
    const by = Math.min(Math.max(py + dy, 0), BUF_H - 1);
    const idx = (by * BUF_W + bx) * 4;

    data[idx]     = 255;  // R — jest światło
    data[idx + 1] = 0;
    data[idx + 2] = 0;
    data[idx + 3] = 255;
  }
}

export class BuildingMapGenerator {

  /**
   * Generuje DataTexture z mapą budynków.
   * Obsługuje RegionSystem (getByLatLon) i HexGrid (forEach + hexToPixel).
   * @param {RegionSystem|HexGrid} grid
   * @returns {THREE.DataTexture|null}
   */
  static generate(grid) {
    if (!grid) return null;

    const data = new Uint8Array(BUF_W * BUF_H * 4);
    BuildingMapGenerator._fillData(data, grid);
    return BuildingMapGenerator._createTexture(data);
  }

  /**
   * Aktualizuj istniejącą teksturę po zmianie budynków (szybsze niż generate).
   * @param {THREE.DataTexture} existingTexture
   * @param {RegionSystem|HexGrid} grid
   */
  static update(existingTexture, grid) {
    if (!existingTexture || !grid) return;

    const data = existingTexture.image.data;
    data.fill(0); // wyczyść
    BuildingMapGenerator._fillData(data, grid);
    existingTexture.needsUpdate = true;
  }

  // ── Wypełnij bufor danymi budynków ─────────────────────────────────────────
  static _fillData(data, grid) {
    // RegionSystem: użyj centerLat/centerLon
    if (grid.getByLatLon) {
      BuildingMapGenerator._fillRegions(data, grid);
    } else if (grid.width !== undefined && grid.height !== undefined) {
      BuildingMapGenerator._fillHexGrid(data, grid);
    }
  }

  // ── RegionSystem: lat/lon → UV → piksel ────────────────────────────────────
  static _fillRegions(data, grid) {
    const regions = grid.toArray ? grid.toArray() : [];

    for (const tile of regions) {
      if (!BuildingMapGenerator._hasBuilding(tile)) continue;

      const u = tile.centerLon / (2 * Math.PI);
      const v = 1.0 - (tile.centerLat + Math.PI / 2) / Math.PI;

      const px = Math.floor(u * BUF_W);
      const py = Math.floor(v * BUF_H);
      const seed = (tile.q ?? 0) * 31337 + (tile.r ?? 0) * 7919;
      drawBuildingCluster(data, px, py, seed);
    }
  }

  // ── HexGrid: hex → UV → piksel ─────────────────────────────────────────────
  static _fillHexGrid(data, grid) {
    const hexSize = calcHexSize(grid);
    const gridPx = grid.gridPixelSize(hexSize);

    grid.forEach(tile => {
      if (!BuildingMapGenerator._hasBuilding(tile)) return;

      const center = HexGrid.hexToPixel(tile.q, tile.r, hexSize);
      const u = center.x / gridPx.w;
      const v = center.y / gridPx.h;

      const px = Math.floor(u * BUF_W);
      const py = Math.floor(v * BUF_H);
      const seed = tile.q * 31337 + tile.r * 7919;
      drawBuildingCluster(data, px, py, seed);
    });
  }

  // ── Sprawdź czy tile ma budynek lub stolicę ──────────────────────────────────
  static _hasBuilding(tile) {
    return !!(tile.buildingId || tile.capitalBase);
  }

  // ── Utwórz DataTexture z bufora ────────────────────────────────────────────
  static _createTexture(data) {
    const tex = new THREE.DataTexture(data, BUF_W, BUF_H, THREE.RGBAFormat);
    tex.type = THREE.UnsignedByteType;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;  // seamless wrap w poziomie (sfera)
    tex.needsUpdate = true;
    return tex;
  }
}
