// ColonyBuildingMarkers — ikony budynków na planecie w widoku układu słonecznego
//
// Lekkie sprite'y (emoji w kolorowych kółkach) widoczne przy bliskim zoomie.
// Sprite'y są children grupy planety → automatycznie podążają za orbitą.
// Visibility: histereza — pokaż gdy dist < r*15, ukryj gdy dist > r*18.
// Reuse logiki hex→sfera z SurfaceMarkers.

import * as THREE from 'three';
import { BUILDINGS } from '../data/BuildingsData.js';
import { HexGrid }   from '../map/HexGrid.js';

// Kolory kategorii budynków
const CAT_COLORS = {
  mining:     '#cc9944',
  energy:     '#ffdd44',
  food:       '#44cc66',
  population: '#4488ff',
  research:   '#cc66ff',
  space:      '#8888ff',
  military:   '#ff6644',
  market:     '#44ddcc',
  civil:      '#ddaa44',
};

export class ColonyBuildingMarkers {
  constructor() {
    this._markers     = new Map();   // tileKey → THREE.Sprite
    this._parentGroup = null;        // THREE.Group planety
    this._planetRadius = 0;
    this._grid         = null;
    this._visible      = false;
    this._shown        = false;      // czy sprite'y dodane do sceny
    this._time         = 0;
    this._entityId     = null;       // id planety
  }

  // ── Pokaż markery budynków na planecie ──────────────────────────────────
  show(planetGroup, planetRadius, grid, entityId) {
    if (!planetGroup || !grid) return;

    // Jeśli zmieniono planetę — wyczyść stare markery
    if (this._entityId !== entityId) {
      this.hide();
    }

    this._parentGroup  = planetGroup;
    this._planetRadius = planetRadius;
    this._grid         = grid;
    this._entityId     = entityId;
    this._shown        = false; // markery pojawią się w tick() gdy zoom wystarczający

    this._rebuildMarkers();
  }

  // ── Ukryj i wyczyść markery ─────────────────────────────────────────────
  hide() {
    this._removeAllSprites();
    this._markers.clear();
    this._parentGroup  = null;
    this._grid         = null;
    this._entityId     = null;
    this._visible      = false;
    this._shown        = false;
  }

  // ── Odśwież po budowie/rozbiórce ────────────────────────────────────────
  refresh(grid) {
    if (!this._parentGroup || !grid) return;
    this._grid = grid;
    this._rebuildMarkers();
    // Jeśli były widoczne — od razu pokaż nowe
    if (this._shown) {
      this._addAllSprites();
    }
  }

  // ── Tick — pulsowanie + visibility threshold ────────────────────────────
  tick(deltaTime, cameraDist) {
    if (!this._parentGroup || !this._entityId) return;

    this._time += deltaTime;
    const r = this._planetRadius;

    // Histereza widoczności
    if (!this._shown && cameraDist < r * 15) {
      this._shown = true;
      this._addAllSprites();
    } else if (this._shown && cameraDist > r * 18) {
      this._shown = false;
      this._removeAllSprites();
    }

    if (!this._shown) return;

    // Fade opacity w zależności od dystansu (bliżej = bardziej widoczne)
    const fadeStart = r * 12;
    const fadeEnd   = r * 15;
    const alpha = cameraDist < fadeStart ? 1.0
                : cameraDist > fadeEnd   ? 0.15
                : 1.0 - 0.85 * ((cameraDist - fadeStart) / (fadeEnd - fadeStart));

    // Pulsowanie i opacity
    for (const sprite of this._markers.values()) {
      const base  = sprite.userData.baseScale;
      const phase = sprite.userData.phase;
      const pulse = Math.sin(this._time * 2 + phase) * (base * 0.06);
      sprite.scale.setScalar(base + pulse);
      sprite.material.opacity = alpha * 0.85;
    }
  }

  // ── Raycasting: znajdź marker pod kursorem ─────────────────────────────
  // Zwraca { tileKey, buildingId } lub null
  hitTest(raycaster) {
    if (!this._shown || this._markers.size === 0) return null;
    const sprites = [...this._markers.values()];
    const hits = raycaster.intersectObjects(sprites);
    if (hits.length === 0) return null;
    const sprite = hits[0].object;
    return {
      tileKey: sprite.userData.tileKey,
      buildingId: sprite.userData.buildingId,
    };
  }

  // ── Zwróć id aktualnie wyświetlanej planety ─────────────────────────────
  get entityId() { return this._entityId; }
  get isShown() { return this._shown; }

  // ── Wyczyść zasoby (np. przy zamknięciu renderera) ──────────────────────
  dispose() {
    this.hide();
  }

  // ── Prywatne ────────────────────────────────────────────────────────────

  _rebuildMarkers() {
    // Usuń stare sprite'y z grupy
    this._removeAllSprites();

    // Wyczyść stare dane
    for (const sprite of this._markers.values()) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    this._markers.clear();

    if (!this._grid) return;

    const markerRadius = this._planetRadius * 1.15;

    this._grid.forEach(tile => {
      if (!tile.buildingId && !tile.capitalBase && !tile.underConstruction) return;

      const key = tile.key ?? `${tile.q},${tile.r}`;
      const effectiveId = tile.buildingId ?? tile.underConstruction?.buildingId;
      const bDef = effectiveId ? BUILDINGS[effectiveId] : null;
      if (!bDef && !tile.capitalBase) return;

      const icon     = bDef?.icon ?? (tile.capitalBase ? '🏛' : '🏗');
      const category = bDef?.category ?? 'population';

      // Pozycja na sferze
      const pos = this._tileToXYZ(tile, markerRadius);
      if (!pos) return;

      // Tekstura markera
      const tex = this._createMarkerTexture(icon, category);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: true,
        sizeAttenuation: true,
      });

      const sprite = new THREE.Sprite(mat);
      const baseScale = this._planetRadius * 0.22;
      sprite.scale.setScalar(baseScale);
      sprite.position.copy(pos);
      sprite.userData = {
        tileKey: key,
        buildingId: effectiveId ?? (tile.capitalBase ? 'colony_base' : null),
        level: tile.buildingLevel ?? 1,
        baseScale,
        phase: this._hashPhase(key),
      };

      this._markers.set(key, sprite);
    });
  }

  _addAllSprites() {
    if (!this._parentGroup) return;
    for (const sprite of this._markers.values()) {
      this._parentGroup.add(sprite);
    }
  }

  _removeAllSprites() {
    if (!this._parentGroup) return;
    for (const sprite of this._markers.values()) {
      this._parentGroup.remove(sprite);
    }
  }

  // Hex → XYZ na sferze (equirectangular, identycznie jak SurfaceMarkers)
  _tileToXYZ(tile, r) {
    if (tile.q === undefined || tile.r === undefined || !this._grid?.gridPixelSize) return null;

    const hexSize = this._calcHexSize(this._grid);
    const gridPx  = this._grid.gridPixelSize(hexSize);
    const center  = HexGrid.hexToPixel(tile.q, tile.r, hexSize);

    const u = center.x / gridPx.w;
    const v = center.y / gridPx.h;

    // UV → lat/lon (equirectangular)
    const lon   = u * 2 * Math.PI;
    const polar = v * Math.PI;        // polar angle: 0=N, PI=S
    const sinP  = Math.sin(polar);

    return new THREE.Vector3(
      -r * Math.cos(lon) * sinP,
       r * Math.cos(polar),
       r * Math.sin(lon) * sinP
    );
  }

  // Generuj teksturę markera (canvas 64×64)
  _createMarkerTexture(icon, category) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const catColor = CAT_COLORS[category] ?? '#888888';

    // Kółko tło
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 13, 24, 0.85)';
    ctx.fill();

    // Kółko obramowanie
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.strokeStyle = catColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Ikona budynku (emoji)
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(icon, 32, 33);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Deterministyczna faza pulsowania z klucza tile'a
  _hashPhase(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return (Math.abs(hash) % 628) / 100;
  }

  // Rozmiar hexa (identycznie jak SurfaceMarkers)
  _calcHexSize(grid) {
    const TEX_W = 2048, TEX_H = 1024;
    const byW = TEX_W / (Math.sqrt(3) * (grid.width + 0.5));
    const byH = TEX_H / (1.5 * grid.height + 0.5);
    return Math.floor(Math.min(byW, byH));
  }
}
