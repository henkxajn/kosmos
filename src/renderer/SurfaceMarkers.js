// SurfaceMarkers — markery 3D budynków na powierzchni globusa
//
// Sprite z generowaną canvas-teksturą (ikona + kolor kategorii).
// Pozycja: (lat, lon) → XYZ na sferze r=1.06 (nad atmosferą).
// Pulsowanie: delikatna animacja scale (sin(time * 2) * 0.008).
// Integracja: PlanetGlobeRenderer tworzy instancję w open(), tick() w pętli render.

import * as THREE from 'three';
import { BUILDINGS } from '../data/BuildingsData.js';
import { HexGrid }   from '../map/HexGrid.js';

// Kolory kategorii budynków (te same co w reszcie UI)
const CAT_COLORS = {
  mining:     '#cc9944',
  energy:     '#ffdd44',
  food:       '#44cc66',
  population: '#4488ff',
  research:   '#cc66ff',
  space:      '#8888ff',
  military:   '#ff6644',
};

export class SurfaceMarkers {
  constructor(scene) {
    this._scene   = scene;
    this._markers = new Map();  // tileKey → THREE.Sprite
    this._grid    = null;       // referencja do grid (HexGrid lub RegionSystem)
    this._time    = 0;
  }

  // ── Aktualizuj markery na podstawie aktualnego stanu grid ──────────────
  // Wywołaj po refreshTexture() (budowa/rozbiórka) lub open()
  update(grid) {
    if (!grid) return;
    this._grid = grid;

    // Zbierz aktualny zbiór tile'ów z budynkami
    const currentTiles = new Map();  // tileKey → { tile, building }
    grid.forEach(tile => {
      if (!tile.buildingId && !tile.capitalBase) return;
      const key = tile.key ?? `${tile.q},${tile.r}`;
      const bDef = tile.buildingId ? BUILDINGS[tile.buildingId] : null;
      currentTiles.set(key, { tile, building: bDef });
    });

    // 1. Usuń markery których nie ma już w grid
    for (const [key, sprite] of this._markers) {
      if (!currentTiles.has(key)) {
        sprite.material.map?.dispose();
        sprite.material.dispose();
        this._scene.remove(sprite);
        this._markers.delete(key);
      }
    }

    // 2. Dodaj/aktualizuj markery
    for (const [key, { tile, building }] of currentTiles) {
      if (this._markers.has(key)) {
        // Marker istnieje — aktualizuj pozycję
        const sprite = this._markers.get(key);
        const pos = this._tileToXYZ(tile, 1.06);
        if (pos) sprite.position.copy(pos);
      } else {
        // Nowy marker
        const sprite = this._createMarker(tile, building);
        if (sprite) {
          this._scene.add(sprite);
          this._markers.set(key, sprite);
        }
      }
    }
  }

  // ── Oznacz tile jako wybrany (jaśniejszy, większy marker) ─────────────
  setSelected(tileKey) {
    for (const [key, sprite] of this._markers) {
      const isSelected = (key === tileKey);
      sprite.material.opacity = isSelected ? 1.0 : 0.75;
      sprite.userData.baseScale = isSelected ? 0.16 : 0.12;
      sprite.scale.setScalar(sprite.userData.baseScale);
    }
  }

  // ── Tick animacji (pulsowanie) — wywołaj w _startLoop ─────────────────
  tick(deltaTime) {
    this._time += deltaTime;
    for (const [, sprite] of this._markers) {
      if (sprite.userData.pulse) {
        const base = sprite.userData.baseScale ?? 0.12;
        const pulse = Math.sin(this._time * 2 + sprite.userData.phase) * 0.008;
        sprite.scale.setScalar(base + pulse);
      }
    }
  }

  // ── Wyczyść wszystko (przy close) ────────────────────────────────────
  dispose() {
    for (const sprite of this._markers.values()) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      this._scene.remove(sprite);
    }
    this._markers.clear();
    this._grid = null;
  }

  // ── Prywatne ─────────────────────────────────────────────────────────

  // Utwórz Sprite dla tile'a z budynkiem
  _createMarker(tile, building) {
    // Dla stolicy bez innego budynku — specjalny marker
    const icon = building?.icon ?? (tile.capitalBase ? '🏛' : '🏗');
    const category = building?.category ?? 'population';

    const tex = this._createMarkerTexture(icon, category);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.12);

    // Pozycja na sferze r=1.06
    const pos = this._tileToXYZ(tile, 1.06);
    if (!pos) return null;
    sprite.position.copy(pos);

    // Metadata
    const key = tile.key ?? `${tile.q},${tile.r}`;
    sprite.userData = {
      tileKey: key,
      buildingId: building?.id ?? null,
      baseScale: 0.12,
      phase: this._hashPhase(key),
      pulse: true,
    };

    return sprite;
  }

  // Generuj teksturę markera (canvas 64×64)
  _createMarkerTexture(icon, category) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const color = CAT_COLORS[category] ?? '#888888';

    // Kółko tło
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 13, 24, 0.85)';
    ctx.fill();

    // Kółko obramowanie — kolor kategorii
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Ikona budynku (emoji) — wyśrodkowana
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(icon, 32, 33);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Pozycja tile'a → XYZ na sferze
  // Obsługuje dwa tryby: RegionSystem (centerLat/centerLon) i HexGrid (q/r → UV → sfera)
  _tileToXYZ(tile, r) {
    // RegionSystem: lat/lon → XYZ
    if (tile.centerLat !== undefined && tile.centerLon !== undefined) {
      return this._latLonToXYZ(tile.centerLat, tile.centerLon, r);
    }

    // HexGrid: q/r → pixel → UV → lat/lon → XYZ
    if (tile.q !== undefined && tile.r !== undefined && this._grid?.gridPixelSize) {
      const hexSize = this._calcHexSize(this._grid);
      const gridPx  = this._grid.gridPixelSize(hexSize);
      const center  = HexGrid.hexToPixel(tile.q, tile.r, hexSize);

      const u = center.x / gridPx.w;
      const v = center.y / gridPx.h;

      // UV → lat/lon (equirectangular)
      const lon = u * 2 * Math.PI;
      const lat = Math.PI / 2 - v * Math.PI;
      return this._latLonToXYZ(lat, lon, r);
    }

    return null;
  }

  // Konwersja lat/lon → XYZ na sferze
  // Three.js SphereGeometry UV: x = -r*cos(lon)*sin(polar), y = r*cos(polar), z = r*sin(lon)*sin(polar)
  // gdzie lon odpowiada u*2π, polar odpowiada v*π
  _latLonToXYZ(lat, lon, r = 1.0) {
    const polar = Math.PI / 2 - lat;  // polar angle od +Y (0=biegun N, π=biegun S)
    const sinP  = Math.sin(polar);
    return new THREE.Vector3(
      -r * Math.cos(lon) * sinP,       // -cos(lon) — zgodne z Three.js SphereGeometry
       r * Math.cos(polar),
       r * Math.sin(lon) * sinP
    );
  }

  // Deterministyczna faza pulsowania z klucza tile'a
  _hashPhase(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return (Math.abs(hash) % 628) / 100; // 0 do ~6.28 (2π)
  }

  // Rozmiar hexa dopasowany do tekstury (identycznie jak w PlanetTerrainTexture)
  _calcHexSize(grid) {
    const TEX_W = 2048, TEX_H = 1024;
    const byW = TEX_W / (Math.sqrt(3) * (grid.width + 0.5));
    const byH = TEX_H / (1.5 * grid.height + 0.5);
    return Math.floor(Math.min(byW, byH));
  }
}
