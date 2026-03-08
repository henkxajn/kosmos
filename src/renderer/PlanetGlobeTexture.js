// PlanetGlobeTexture — overlay canvas dla globusa planety
//
// Generuje PRZEZROCZYSTĄ teksturę 2048×1024 (equirectangular) z:
//   - Markerami budynków (PNG sprite'y 128×128 z generate-icons.js)
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

// ── Rozmiar tekstury (2048×1024 — ostrzejsze ikony przy zoomie) ──
const TEX_W = 2048;
const TEX_H = 1024;

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

// ── Ładowanie ikon budynków (PNG sprite'y generowane przez generate-icons.js) ──
// Unikalna ikona per typ budynku (building ID) + capital.
// 128×128 z gradientem, glow, cieniami — ładowane asynchronicznie.
// Jeśli nie załadowane, fallback do prostych kolorowych hexów.
const _buildingIcons = new Map();
const _ICON_IDS = [
  // mining
  'mine', 'factory', 'smelter', 'launch_pad', 'autonomous_mine',
  // energy
  'solar_farm', 'geothermal', 'nuclear_plant', 'autonomous_solar_farm', 'fusion_reactor',
  // food
  'farm', 'well', 'synthesized_food_plant',
  // population
  'habitat',
  // research
  'research_station',
  // space
  'shipyard', 'terraformer',
  // special
  'capital',
];

for (const id of _ICON_IDS) {
  const img = new Image();
  img.src = `assets/icons/building_${id}.png`;
  img.onload = () => _buildingIcons.set(id, img);
  // onerror: brak — fallback do Canvas 2D markera
}

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
    tex.minFilter  = THREE.LinearFilter; // bez mipmapów — ostrzejsze ikony przy zoomie
    tex.generateMipmaps = false;
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

  // ════════════════════════════════════════════════════════════
  // ── Markery budynków — PNG sprite'y z generate-icons.js ───
  // ════════════════════════════════════════════════════════════
  //
  // Ikony 128×128 PNG (SVG→sharp): gradient hex, glow, cień, biały symbol.
  // Ładowane asynchronicznie przy imporcie modułu (_buildingIcons).
  // Stemplowane drawImage() ze skalowaniem w dół → idealny AA.
  // Fallback: prosty kolorowy hex jeśli PNG nie załadowany.

  // ── Hex path helper (pointy-top) ─────────────────────────

  static _hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // ── Fallback marker (gdy PNG nie załadowany) ──────────────

  static _drawFallbackMarker(ctx, texX, texY, r, catCol) {
    PlanetGlobeTexture._hexPath(ctx, texX, texY, r);
    ctx.fillStyle = `rgba(${catCol[0]},${catCol[1]},${catCol[2]},0.85)`;
    ctx.fill();
    ctx.strokeStyle = `rgb(${catCol[0]},${catCol[1]},${catCol[2]})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── Główna metoda rysowania markerów ──────────────────────

  static _drawBuildingMarkers(ctx, grid, hexSize, gridPx) {
    // Rozmiar docelowy markera na teksturze (proporcjonalny do hexSize, bez limitu)
    const markerR = hexSize * 0.35;
    const drawSize = markerR * 2.4; // nieco większe aby glow był widoczny

    // Kolory anomalii
    const ANOMALY_COLORS = {
      scientific: [100, 200, 255],
      resource:   [255, 200, 50],
      danger:     [255, 80, 50],
    };

    grid.forEach(tile => {
      const hasBuilding     = tile.buildingId && BUILDINGS[tile.buildingId];
      const hasCapital      = tile.capitalBase;
      const hasAnomaly      = tile.anomaly;
      const hasConstruction = tile.underConstruction?.buildingId;
      if (!hasBuilding && !hasCapital && !hasAnomaly && !hasConstruction) return;

      // Centrum hexa → piksel tekstury
      const center = HexGrid.hexToPixel(tile.q, tile.r, hexSize);
      const texX = (center.x / gridPx.w) * TEX_W;
      const texY = (center.y / gridPx.h) * TEX_H;

      // ─ Gotowy budynek ─
      if (hasBuilding) {
        const building = BUILDINGS[tile.buildingId];
        const catCol = CAT_COLORS[building.category] ?? [200, 200, 200];
        // Szukaj ikony per buildingId, fallback na kategorię
        const icon = _buildingIcons.get(tile.buildingId);

        if (icon) {
          ctx.drawImage(icon, texX - drawSize / 2, texY - drawSize / 2, drawSize, drawSize);
        } else {
          PlanetGlobeTexture._drawFallbackMarker(ctx, texX, texY, markerR, catCol);
        }

        // Wskaźnik poziomu (kropki pod ikoną, jeśli level > 1)
        const level = tile.buildingLevel ?? 1;
        if (level > 1) {
          const dotCount = Math.min(level, 5);
          const dotR = Math.max(1.2, markerR * 0.14);
          const dotY = texY + markerR * 0.75;
          const spacing = dotR * 3;
          const startX = texX - ((dotCount - 1) * spacing) / 2;
          for (let i = 0; i < dotCount; i++) {
            ctx.beginPath();
            ctx.arc(startX + i * spacing, dotY, dotR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(200, 255, 230, 0.9)';
            ctx.fill();
          }
        }

        // Mini marker stolicy w rogu (jeśli hex ma oba)
        if (hasCapital) {
          const capIcon = _buildingIcons.get('capital');
          if (capIcon) {
            const capSize = drawSize * 0.45;
            ctx.drawImage(capIcon,
              texX - drawSize * 0.4 - capSize / 2,
              texY - drawSize * 0.4 - capSize / 2,
              capSize, capSize);
          }
        }

      // ─ Tylko stolica (bez budynku) ─
      } else if (hasCapital) {
        const capIcon = _buildingIcons.get('capital');
        if (capIcon) {
          ctx.drawImage(capIcon, texX - drawSize / 2, texY - drawSize / 2, drawSize, drawSize);
        } else {
          PlanetGlobeTexture._drawFallbackMarker(ctx, texX, texY, markerR, [68, 136, 255]);
        }
      }

      // ─ Rozbudowa istniejącego budynku (upgrade w toku) ─
      if (hasConstruction && hasBuilding) {
        const pct = tile.underConstruction.buildTime > 0
          ? Math.min(1, (tile.underConstruction.progress ?? 0) / tile.underConstruction.buildTime)
          : 0;
        // Pulsujący pierścień wokół ikony
        const ringR = markerR * 1.15;
        ctx.beginPath();
        ctx.arc(texX, texY, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
        ctx.strokeStyle = `rgba(255,200,50,0.9)`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // Tło pierścienia (ciemniejsze)
        ctx.beginPath();
        ctx.arc(texX, texY, ringR, -Math.PI / 2 + Math.PI * 2 * pct, -Math.PI / 2 + Math.PI * 2);
        ctx.strokeStyle = `rgba(255,200,50,0.2)`;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Mini pasek pod ikoną
        const barW2 = markerR * 1.6, barH2 = 2;
        const bx2 = texX - barW2 / 2;
        const by2 = texY + markerR + 3;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx2, by2, barW2, barH2);
        ctx.fillStyle = 'rgba(255,200,50,0.9)';
        ctx.fillRect(bx2, by2, barW2 * pct, barH2);
      }

      // ─ Budowa w toku (Canvas 2D — dynamiczny progress) ─
      if (hasConstruction && !hasBuilding) {
        const cBuilding = BUILDINGS[tile.underConstruction.buildingId];
        const cCatCol   = cBuilding ? (CAT_COLORS[cBuilding.category] ?? [200, 200, 200]) : [200, 200, 200];
        const pct       = tile.underConstruction.buildTime > 0
          ? Math.min(1, (tile.underConstruction.progress ?? 0) / tile.underConstruction.buildTime)
          : 0;

        // Hex ghost z przerywanym konturem
        PlanetGlobeTexture._hexPath(ctx, texX, texY, markerR);
        ctx.fillStyle = `rgba(${cCatCol[0]},${cCatCol[1]},${cCatCol[2]},0.2)`;
        ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = `rgba(${cCatCol[0]},${cCatCol[1]},${cCatCol[2]},0.8)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);

        // Wypełnienie stopniowe od dołu
        if (pct > 0) {
          ctx.save();
          const clipTop = texY + markerR - (2 * markerR * pct);
          ctx.beginPath();
          ctx.rect(texX - markerR - 1, clipTop, markerR * 2 + 2, texY + markerR + 1 - clipTop);
          ctx.clip();
          PlanetGlobeTexture._hexPath(ctx, texX, texY, markerR * 0.85);
          ctx.fillStyle = `rgba(${cCatCol[0]},${cCatCol[1]},${cCatCol[2]},0.5)`;
          ctx.fill();
          ctx.restore();
        }

        // Mini pasek progresu pod hexem
        const barW = markerR * 1.6, barH = 2;
        const bx = texX - barW / 2;
        const by = texY + markerR + 3;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = `rgb(${cCatCol[0]},${cCatCol[1]},${cCatCol[2]})`;
        ctx.fillRect(bx, by, barW * pct, barH);
      }

      // ─ Anomalia (romb) — bez zmian ─
      if (hasAnomaly) {
        const aCol = ANOMALY_COLORS[tile.anomaly] ?? [200, 200, 200];
        const offset = markerR * 0.9;
        const ax = hasBuilding || hasCapital ? texX + offset : texX;
        const ay = hasBuilding || hasCapital ? texY - offset : texY;
        const s = 4;
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
      ctx.fillStyle   = 'rgba(0, 255, 180, 0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 255, 180, 0.8)';
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
