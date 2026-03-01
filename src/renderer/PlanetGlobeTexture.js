// PlanetGlobeTexture — generuje teksturę łączącą powierzchnię planety z siatką hex
//
// Dwie warstwy:
//   1. Bazowa powierzchnia — FBM noise z paletami (port z ThreeRenderer)
//   2. Nakładka heksagonalna — kolory biomów + linie siatki + markery budynków
//
// Tekstura 1024×512 (equirectangular) mapowana na sferę UV.

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

// ── FBM noise (port z ThreeRenderer.js) ───────────────────────
function noise(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x, y, seed, octaves = 6) {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise(x * freq, y * freq, seed);
    amp *= 0.5; freq *= 2;
  }
  return val;
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const PALETTES = {
  hot_rocky: [[180,40,20],[220,80,20],[140,20,10],[255,120,30],[60,10,5]],
  rocky:     [[100,90,80],[130,120,100],[80,75,65],[150,140,120],[60,55,50]],
  rocky_hz:  [[34,80,60],[45,120,80],[80,150,60],[170,160,100],[200,200,220]],
  gas:       [[180,150,120],[200,170,130],[160,130,100],[140,120,90],[210,190,160]],
  gas_cold:  [[150,180,255],[100,140,220],[180,200,255],[80,120,200],[140,160,240]],
  ice:       [[180,200,240],[140,170,220],[200,220,255],[100,140,200],[240,245,255]],
};

// ── API publiczne ─────────────────────────────────────────────

export class PlanetGlobeTexture {

  // Generuje CanvasTexture z planetą + siatką hex
  // planet:  obiekt Planet (id, planetType, temperatureK…)
  // grid:    HexGrid (wygenerowana przez PlanetMapGenerator)
  // options: { showGrid: bool, showBuildings: bool, selectedTile: {q,r}, hoveredTile: {q,r} }
  static generate(planet, grid, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.width  = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext('2d');

    // 1. Bazowa tekstura planety (FBM)
    PlanetGlobeTexture._drawBaseTexture(ctx, planet);

    // 2. Nakładka heksagonalna
    PlanetGlobeTexture._drawHexOverlay(ctx, grid, options);

    // 3. Markery budynków
    if (options.showBuildings !== false) {
      PlanetGlobeTexture._drawBuildingMarkers(ctx, grid);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Odśwież istniejącą teksturę (np. po budowie)
  static update(existingTex, planet, grid, options = {}) {
    const canvas = existingTex.image;
    const ctx = canvas.getContext('2d');

    // Przerysuj od zera
    PlanetGlobeTexture._drawBaseTexture(ctx, planet);
    PlanetGlobeTexture._drawHexOverlay(ctx, grid, options);
    if (options.showBuildings !== false) {
      PlanetGlobeTexture._drawBuildingMarkers(ctx, grid);
    }

    existingTex.needsUpdate = true;
  }

  // Optymalny hexSize aby siatka pokryła teksturę
  static calcHexSize(grid) {
    const hexByW = TEX_W / (Math.sqrt(3) * (grid.width + 0.5));
    const hexByH = TEX_H / (1.5 * grid.height + 0.5);
    return Math.floor(Math.min(hexByW, hexByH));
  }

  // ── Bazowa tekstura (port z ThreeRenderer.generateTexture) ──

  static _drawBaseTexture(ctx, planet) {
    const seed  = hashCode(String(planet.id));
    const tempK = planet.temperatureK ?? 300;
    const pType = planet.planetType ?? 'rocky';

    // Wybór palety
    let palKey = 'rocky';
    if (pType === 'hot_rocky') palKey = 'hot_rocky';
    else if (pType === 'gas')  palKey = (seed % 2 === 0) ? 'gas' : 'gas_cold';
    else if (pType === 'ice')  palKey = 'ice';
    else if (tempK > 250 && tempK < 400) palKey = 'rocky_hz';

    const pal = PALETTES[palKey];

    for (let y = 0; y < TEX_H; y++) {
      for (let x = 0; x < TEX_W; x++) {
        const nx = x / TEX_W, ny = y / TEX_H;
        let val;

        if (pType === 'gas') {
          val = fbm(nx * 2 + ny * 0.5, ny * 8, seed, 5);
          val = (Math.sin(ny * 20 + val * 6) + 1) * 0.5;
        } else {
          val = fbm(nx * 4, ny * 4, seed, 6);
        }

        const idx = Math.min(Math.floor(val * pal.length), pal.length - 1);
        const c   = pal[idx];
        const v   = 0.85 + noise(x * 0.1, y * 0.1, seed + 1) * 0.3;
        ctx.fillStyle = `rgb(${c[0]*v|0},${c[1]*v|0},${c[2]*v|0})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Czapa polarna dla lodowej planety
    if (pType === 'ice') {
      const capH = 50 + (seed % 8) * 6;
      const g = ctx.createLinearGradient(0, 0, 0, capH);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, TEX_W, capH);
      const g2 = ctx.createLinearGradient(0, TEX_H - capH, 0, TEX_H);
      g2.addColorStop(0, 'rgba(255,255,255,0)');
      g2.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.fillStyle = g2; ctx.fillRect(0, TEX_H - capH, TEX_W, capH);
    }
  }

  // ── Nakładka heksagonalna ───────────────────────────────────

  static _drawHexOverlay(ctx, grid, options) {
    if (options.showGrid === false) return;

    const hexSize = PlanetGlobeTexture.calcHexSize(grid);
    const gridPx  = grid.gridPixelSize(hexSize);

    // Odczytaj bieżące piksele aby blendować
    const imgData = ctx.getImageData(0, 0, TEX_W, TEX_H);
    const data    = imgData.data;
    const alpha   = 0.45; // siła nakładki terenu

    for (let py = 0; py < TEX_H; py++) {
      for (let px = 0; px < TEX_W; px++) {
        // UV → hex pixel coordinates
        const hexX = (px / TEX_W) * gridPx.w;
        const hexY = (py / TEX_H) * gridPx.h;

        const { q, r } = HexGrid.pixelToHex(hexX, hexY, hexSize);
        const tile = grid.get(q, r);
        if (!tile) continue;

        const terrain = TERRAIN_TYPES[tile.type];
        if (!terrain) continue;

        // Kolor terenu
        const color = terrain.color;
        const cr = (color >> 16) & 0xff;
        const cg = (color >>  8) & 0xff;
        const cb =  color        & 0xff;

        const idx = (py * TEX_W + px) * 4;

        // Blend kolor terenu z bazową teksturą
        data[idx]     = Math.round(data[idx]     * (1 - alpha) + cr * alpha);
        data[idx + 1] = Math.round(data[idx + 1] * (1 - alpha) + cg * alpha);
        data[idx + 2] = Math.round(data[idx + 2] * (1 - alpha) + cb * alpha);

        // Krawędź hexa — rozjaśnij piksele blisko granicy
        const isEdge = PlanetGlobeTexture._isHexEdge(hexX, hexY, q, r, hexSize);
        if (isEdge) {
          data[idx]     = Math.min(255, data[idx]     + 50);
          data[idx + 1] = Math.min(255, data[idx + 1] + 50);
          data[idx + 2] = Math.min(255, data[idx + 2] + 50);
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  // Sprawdza czy punkt (hexX, hexY) leży blisko krawędzi hexa (pointy-top)
  static _isHexEdge(hexX, hexY, q, r, hexSize) {
    const center = HexGrid.hexToPixel(q, r, hexSize);
    const dx = hexX - center.x;
    const dy = hexY - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) return false; // centrum — na pewno nie krawędź

    // Kąt od centrum hexa
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;

    // Pointy-top hex: odległość granicy przy kącie θ
    const sectorAngle = angle % (Math.PI / 3);
    const edgeDist = hexSize * Math.cos(Math.PI / 6) / Math.cos(sectorAngle - Math.PI / 6);

    // 2px grubość linii
    return dist > (edgeDist - 2);
  }

  // ── Markery budynków ────────────────────────────────────────

  static _drawBuildingMarkers(ctx, grid) {
    const hexSize = PlanetGlobeTexture.calcHexSize(grid);
    const gridPx  = grid.gridPixelSize(hexSize);

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

  // ── Overlay highlight — lekka tekstura z 1-2 hexami ───────

  // Generuje przezroczystą teksturę RGBA z highlighted hexami
  static generateHighlightTexture(grid, selectedTile, hoveredTile) {
    const canvas = document.createElement('canvas');
    canvas.width  = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext('2d');
    // Canvas domyślnie przezroczysty (alpha=0)

    const hexSize = PlanetGlobeTexture.calcHexSize(grid);
    const gridPx  = grid.gridPixelSize(hexSize);

    if (selectedTile) {
      PlanetGlobeTexture._drawHexHighlight(ctx, selectedTile.q, selectedTile.r, hexSize, gridPx, 'selected');
    }
    if (hoveredTile && (!selectedTile || hoveredTile.q !== selectedTile.q || hoveredTile.r !== selectedTile.r)) {
      PlanetGlobeTexture._drawHexHighlight(ctx, hoveredTile.q, hoveredTile.r, hexSize, gridPx, 'hovered');
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Odśwież istniejącą teksturę overlay (clearRect + rysuj 1-2 hexy)
  static updateHighlightTexture(existingTex, grid, selectedTile, hoveredTile) {
    const canvas = existingTex.image;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, TEX_W, TEX_H);

    const hexSize = PlanetGlobeTexture.calcHexSize(grid);
    const gridPx  = grid.gridPixelSize(hexSize);

    if (selectedTile) {
      PlanetGlobeTexture._drawHexHighlight(ctx, selectedTile.q, selectedTile.r, hexSize, gridPx, 'selected');
    }
    if (hoveredTile && (!selectedTile || hoveredTile.q !== selectedTile.q || hoveredTile.r !== selectedTile.r)) {
      PlanetGlobeTexture._drawHexHighlight(ctx, hoveredTile.q, hoveredTile.r, hexSize, gridPx, 'hovered');
    }

    existingTex.needsUpdate = true;
  }

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
