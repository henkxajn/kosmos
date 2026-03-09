// PlanetTerrainTexture — generuje proceduralną teksturę terenu 2048×1024
//
// Dwa tryby:
//   A) HexGrid: per hex polygon (blur-blended) — stary algorytm
//   B) RegionSystem: Voronoi na equirectangular (nearest region per pixel)
//
// Wejście: grid (HexGrid lub RegionSystem), planet (obiekt planety)
// Wyjście: THREE.CanvasTexture gotowa do MeshStandardMaterial.map

import * as THREE from 'three';
import { HexGrid } from '../map/HexGrid.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';

// ── Kolory biomów ───────────────────────────────────────────────────────────────
const BIOME_COLORS = {
  plains:    { base: '#4a7a28', dark: '#3a6018', light: '#6a9a48' },
  mountains: { base: '#8a7a6a', dark: '#6a5a4a', light: '#aa9a8a' },
  ocean:     { base: '#1a4a99', dark: '#0a2a6a', light: '#2a6ab9' },
  forest:    { base: '#1a5a1a', dark: '#0a3a0a', light: '#2a7a2a' },
  desert:    { base: '#c8a850', dark: '#a88030', light: '#e8c870' },
  tundra:    { base: '#7a9aaa', dark: '#5a7a8a', light: '#9abaca' },
  volcano:   { base: '#aa2800', dark: '#7a0800', light: '#cc4820' },
  crater:    { base: '#5a5040', dark: '#3a3020', light: '#7a7060' },
  ice_sheet: { base: '#c0daf0', dark: '#a0bae0', light: '#e0f0ff' },
  wasteland: { base: '#6a5a4a', dark: '#4a3a2a', light: '#8a7a6a' },
};

// Parsowanie koloru hex → [r, g, b]
function _parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export class PlanetTerrainTexture {

  // ── Główna metoda ─────────────────────────────────────────────────────────────
  static generate(grid, planet) {
    // Wykryj tryb: RegionSystem ma getByLatLon
    if (grid.getByLatLon) {
      return PlanetTerrainTexture._generateRegions(grid, planet);
    }
    return PlanetTerrainTexture._generateHexGrid(grid, planet);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ── Tryb B: RegionSystem — Voronoi na equirectangular ─────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════

  static _generateRegions(grid, planet) {
    const TEX_W = 2048, TEX_H = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext('2d');

    const regions = grid.toArray();

    // Precompute: kartezjańskie pozycje regionów na sferze jednostkowej
    const regData = regions.map(r => {
      const colors = BIOME_COLORS[r.type] ?? BIOME_COLORS.wasteland;
      const phi = Math.PI / 2 - r.centerLat;  // polar angle od +Y
      return {
        region: r,
        // Kartezjańskie na sferze jednostkowej (do szybkiego dot product)
        nx: Math.sin(phi) * Math.cos(r.centerLon),
        ny: Math.cos(phi),
        nz: Math.sin(phi) * Math.sin(r.centerLon),
        baseRGB:  _parseHex(colors.base),
        darkRGB:  _parseHex(colors.dark),
        lightRGB: _parseHex(colors.light),
      };
    });

    // Renderuj na mniejszym buforze (512×256) → upscale z blur
    const BUF_W = 512, BUF_H = 256;
    const bufCanvas = document.createElement('canvas');
    bufCanvas.width = BUF_W;
    bufCanvas.height = BUF_H;
    const bufCtx = bufCanvas.getContext('2d');
    const imgData = bufCtx.createImageData(BUF_W, BUF_H);
    const data = imgData.data;

    // Seed do variacji kolorów
    const seed = planet.id ? planet.id.charCodeAt(0) : 42;

    for (let py = 0; py < BUF_H; py++) {
      // UV → lat/lon
      const v = py / BUF_H;
      const lat = Math.PI / 2 - v * Math.PI;     // +π/2 do -π/2
      const phi = Math.PI / 2 - lat;              // polar angle

      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      for (let px = 0; px < BUF_W; px++) {
        const u = px / BUF_W;
        const lon = u * 2 * Math.PI;              // 0 do 2π

        // Kartezjański punkt na sferze
        const nx = sinPhi * Math.cos(lon);
        const ny = cosPhi;
        const nz = sinPhi * Math.sin(lon);

        // Znajdź najbliższy region (dot product = cos kąta → max = najbliższy)
        let bestDot = -2;
        let bestIdx = 0;
        for (let i = 0; i < regData.length; i++) {
          const rd = regData[i];
          const dot = nx * rd.nx + ny * rd.ny + nz * rd.nz;
          if (dot > bestDot) {
            bestDot = dot;
            bestIdx = i;
          }
        }

        const rd = regData[bestIdx];

        // Variacja koloru per piksel (hash noise)
        const hashVal = Math.abs(Math.sin((px * 12.9898 + py * 78.233 + seed) * 43758.5453)) % 1;
        // Mieszaj base ↔ dark/light (70% base, 30% variacja)
        const rgb = hashVal < 0.15
          ? rd.darkRGB
          : hashVal > 0.85
            ? rd.lightRGB
            : rd.baseRGB;

        const idx = (py * BUF_W + px) * 4;
        data[idx]     = rgb[0];
        data[idx + 1] = rgb[1];
        data[idx + 2] = rgb[2];
        data[idx + 3] = 255;
      }
    }

    bufCtx.putImageData(imgData, 0, 0);

    // Upscale na docelową teksturę z wygładzaniem
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bufCanvas, 0, 0, TEX_W, TEX_H);

    // Delikatny blur na granicach regionów
    ctx.filter = 'blur(3px)';
    ctx.globalAlpha = 0.4;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1.0;

    // Efekty specjalne per biom
    PlanetTerrainTexture._applyRegionBiomEffects(ctx, regData, TEX_W, TEX_H);

    // Noise overlay
    PlanetTerrainTexture._applyNoiseOverlay(ctx, TEX_W, TEX_H, seed);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Efekty specjalne per biom (wersja regionowa — pozycje z lat/lon → UV)
  static _applyRegionBiomEffects(ctx, regData, texW, texH) {
    for (const rd of regData) {
      const region = rd.region;
      const u = region.centerLon / (2 * Math.PI);
      const v = 1 - (region.centerLat + Math.PI / 2) / Math.PI;
      const cx = u * texW;
      const cy = v * texH;
      const radius = Math.sqrt(region.area ?? 0.05) * texW * 0.12;

      if (region.type === 'ocean') {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, 'rgba(10,42,106,0.4)');
        grad.addColorStop(1, 'rgba(10,42,106,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }

      if (region.type === 'volcano') {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, 'rgba(255,80,0,0.5)');
        grad.addColorStop(0.5, 'rgba(170,40,0,0.3)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }

      if (region.type === 'ice_sheet') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        const rng = Math.abs(Math.sin((region.q * 7 + 13) * 0.618)) * 1000;
        const numCracks = 2 + Math.floor(rng % 3);
        for (let i = 0; i < numCracks; i++) {
          const angle = ((rng * (i + 1) * 137.5) % 360) * Math.PI / 180;
          const len = radius * (0.3 + (rng * (i + 2) % 0.7));
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          const midX = cx + Math.cos(angle) * len * 0.5 + Math.sin(angle) * len * 0.15;
          const midY = cy + Math.sin(angle) * len * 0.5 - Math.cos(angle) * len * 0.15;
          const endX = cx + Math.cos(angle) * len;
          const endY = cy + Math.sin(angle) * len;
          ctx.quadraticCurveTo(midX, midY, endX, endY);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (region.type === 'mountains') {
        const grad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
        grad.addColorStop(0, 'rgba(255,255,255,0.12)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.12)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ── Tryb A: HexGrid — stary algorytm hex-polygon ─────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════

  static _generateHexGrid(grid, planet) {
    const TEX_W = 2048, TEX_H = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext('2d');

    const hexSize = PlanetTerrainTexture._calcHexSize(grid, TEX_W, TEX_H);
    const gridPx = grid.gridPixelSize(hexSize);

    // 1. Tło bazowe
    ctx.fillStyle = '#060810';
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    // 2. Wypełnij hexy biomami (z blur)
    grid.forEach(tile => {
      const colors = BIOME_COLORS[tile.type] ?? BIOME_COLORS.wasteland;
      PlanetTerrainTexture._fillHexBiom(
        ctx, tile.q, tile.r, hexSize, gridPx, colors, TEX_W, TEX_H
      );
    });

    // 3. Efekty specjalne per biom
    PlanetTerrainTexture._applyBiomEffects(ctx, grid, hexSize, gridPx, TEX_W, TEX_H);

    // 4. Noise overlay
    const seed = planet.id ? planet.id.charCodeAt(0) : 42;
    PlanetTerrainTexture._applyNoiseOverlay(ctx, TEX_W, TEX_H, seed);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ── Rozmiar hexa dopasowany do tekstury ─────────────────────────────────────
  static _calcHexSize(grid, texW, texH) {
    const byW = texW / (Math.sqrt(3) * (grid.width + 0.5));
    const byH = texH / (1.5 * grid.height + 0.5);
    return Math.floor(Math.min(byW, byH));
  }

  // ── Wypełnij jeden hex kolorem biomu (z blur) ──────────────────────────────
  static _fillHexBiom(ctx, q, r, hexSize, gridPx, colorObj, texW, texH) {
    const center = HexGrid.hexToPixel(q, r, hexSize);
    const cx = (center.x / gridPx.w) * texW;
    const cy = (center.y / gridPx.h) * texH;
    const scaleX = texW / gridPx.w;
    const scaleY = texH / gridPx.h;

    ctx.filter = 'blur(6px)';

    const hexR = hexSize * 1.15;
    const verts = PlanetTerrainTexture._hexVertices(cx, cy, hexR, scaleX, scaleY);
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.fillStyle = colorObj.base;
    ctx.fill();

    ctx.filter = 'none';
  }

  // ── 6 wierzchołków hexa (pointy-top) ───────────────────────────────────────
  static _hexVertices(cx, cy, hexR, scaleX, scaleY) {
    const verts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      verts.push({
        x: cx + hexR * Math.cos(angle) * scaleX,
        y: cy + hexR * Math.sin(angle) * scaleY,
      });
    }
    return verts;
  }

  // ── Nakładka noise (faktura skał) ──────────────────────────────────────────
  static _applyNoiseOverlay(ctx, texW, texH, seed) {
    const SIZE = 64;
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = SIZE;
    noiseCanvas.height = SIZE;
    const nCtx = noiseCanvas.getContext('2d');
    const imgData = nCtx.createImageData(SIZE, SIZE);

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dot = x * 12.9898 + y * 78.233;
        const val = Math.abs(Math.sin(dot + seed) * 43758.5453) % 1;
        const c = Math.floor(val * 255);
        const idx = (y * SIZE + x) * 4;
        imgData.data[idx]     = c;
        imgData.data[idx + 1] = c;
        imgData.data[idx + 2] = c;
        imgData.data[idx + 3] = 255;
      }
    }
    nCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.3;
    const pattern = ctx.createPattern(noiseCanvas, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, texW, texH);
    ctx.restore();
  }

  // ── Efekty specjalne per biom (HexGrid) ──────────────────────────────────────
  static _applyBiomEffects(ctx, grid, hexSize, gridPx, texW, texH) {
    const scaleX = texW / gridPx.w;
    const scaleY = texH / gridPx.h;
    const hexR = hexSize * 1.15;

    grid.forEach(tile => {
      const center = HexGrid.hexToPixel(tile.q, tile.r, hexSize);
      const cx = (center.x / gridPx.w) * texW;
      const cy = (center.y / gridPx.h) * texH;
      const radius = hexR * Math.min(scaleX, scaleY);

      if (tile.type === 'ocean') {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, 'rgba(10,42,106,0.4)');
        grad.addColorStop(1, 'rgba(10,42,106,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }

      if (tile.type === 'volcano') {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, 'rgba(255,80,0,0.5)');
        grad.addColorStop(0.5, 'rgba(170,40,0,0.3)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }

      if (tile.type === 'ice_sheet') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        const rng = Math.abs(Math.sin((tile.q * 7 + tile.r * 13) * 0.618)) * 1000;
        const numCracks = 2 + Math.floor(rng % 3);
        for (let i = 0; i < numCracks; i++) {
          const angle = ((rng * (i + 1) * 137.5) % 360) * Math.PI / 180;
          const len = radius * (0.3 + (rng * (i + 2) % 0.7));
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          const midX = cx + Math.cos(angle) * len * 0.5 + Math.sin(angle) * len * 0.15;
          const midY = cy + Math.sin(angle) * len * 0.5 - Math.cos(angle) * len * 0.15;
          const endX = cx + Math.cos(angle) * len;
          const endY = cy + Math.sin(angle) * len;
          ctx.quadraticCurveTo(midX, midY, endX, endY);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (tile.type === 'mountains') {
        const grad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
        grad.addColorStop(0, 'rgba(255,255,255,0.12)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.12)');

        const verts = PlanetTerrainTexture._hexVertices(cx, cy, hexR, scaleX, scaleY);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < 6; i++) ctx.lineTo(verts[i].x, verts[i].y);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = grad;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.restore();
      }
    });
  }
}
