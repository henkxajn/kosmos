// HexGrid — siatka heksagonalna w układzie cube coordinates
//
// Cube coordinates: każde pole opisane przez (q, r, s) gdzie q+r+s = 0
//   Przechowujemy tylko q i r; s = -q-r
//
// Orientacja: pointy-top (wierzchołek u góry, płaskie boki po bokach)
//   Wygląda naturalnie w widoku "z góry", standardowa w grach strategicznych
//
// Kształt siatki: prostokątny (W × H pól) z offsetem co drugiego wiersza
//   Konwersja: offset (col, row) ↔ cube (q, r)
//
// Piksel ↔ hex: metody hexToPixel i pixelToHex dla Phaser (etap 6.5)

import { HexTile } from './HexTile.js';

// ── Kierunki sąsiadów w cube coordinates (pointy-top) ─────────────────────────
// Kolejność: E, NE, NW, W, SW, SE (zgodnie z ruchem wskazówek zegara od prawej)
export const HEX_DIRECTIONS = [
  { q:  1, r:  0 },  // E
  { q:  1, r: -1 },  // NE
  { q:  0, r: -1 },  // NW
  { q: -1, r:  0 },  // W
  { q: -1, r:  1 },  // SW
  { q:  0, r:  1 },  // SE
];

export class HexGrid {
  // width, height — liczba pól w poziomie i pionie (8–16 zgodnie z koncepcją)
  constructor(width, height) {
    this.width  = width;
    this.height = height;

    // Przechowujemy kafelki w Map: klucz = "q,r" → HexTile
    this._tiles = new Map();

    // Wypełnij siatkę pustymi kafelkami (plains domyślnie)
    // PlanetMapGenerator (krok 6.4) nadpisze typy terenu
    this._initGrid();
  }

  // ── Inicjalizacja ──────────────────────────────────────────────────────────

  _initGrid() {
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const { q, r } = HexGrid.offsetToCube(col, row);
        const tile = new HexTile(q, r, 'plains');
        this._tiles.set(tile.key, tile);
      }
    }
  }

  // ── Dostęp do pól ──────────────────────────────────────────────────────────

  // Pobierz pole po cube coordinates; null jeśli poza siatką
  get(q, r) {
    return this._tiles.get(`${q},${r}`) ?? null;
  }

  // Pobierz pole po offset coordinates (col, row)
  getOffset(col, row) {
    const { q, r } = HexGrid.offsetToCube(col, row);
    return this.get(q, r);
  }

  // Ustaw typ terenu pola (używane przez PlanetMapGenerator)
  setTerrain(q, r, type) {
    const tile = this.get(q, r);
    if (tile) tile.type = type;
  }

  // Ustaw zasób strategiczny pola
  setStrategicResource(q, r, resourceKey) {
    const tile = this.get(q, r);
    if (tile) tile.strategicResource = resourceKey;
  }

  // ── Sąsiedzi i odległości ─────────────────────────────────────────────────

  // Zwraca tablicę istniejących sąsiadów (max 6, mniej na krawędziach)
  getNeighbors(q, r) {
    const result = [];
    for (const dir of HEX_DIRECTIONS) {
      const neighbor = this.get(q + dir.q, r + dir.r);
      if (neighbor) result.push(neighbor);
    }
    return result;
  }

  // Odległość hexagonalna między dwoma polami (cube distance)
  static distance(q1, r1, q2, r2) {
    return Math.max(
      Math.abs(q1 - q2),
      Math.abs(r1 - r2),
      Math.abs((-q1 - r1) - (-q2 - r2))   // s = -q-r
    );
  }

  // Wszystkie pola dokładnie w odległości radius od (q, r)
  ring(q, r, radius) {
    if (radius === 0) {
      const t = this.get(q, r);
      return t ? [t] : [];
    }
    const results = [];
    // Start od pola bezpośrednio na południe od centrum, idź ringiem
    let cur = { q: q + HEX_DIRECTIONS[4].q * radius,
                r: r + HEX_DIRECTIONS[4].r * radius };
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < radius; j++) {
        const tile = this.get(cur.q, cur.r);
        if (tile) results.push(tile);
        cur = { q: cur.q + HEX_DIRECTIONS[i].q,
                r: cur.r + HEX_DIRECTIONS[i].r };
      }
    }
    return results;
  }

  // Wszystkie pola w odległości <= maxRadius (spirala od centrum)
  spiral(q, r, maxRadius) {
    const results = [];
    const center = this.get(q, r);
    if (center) results.push(center);
    for (let rad = 1; rad <= maxRadius; rad++) {
      results.push(...this.ring(q, r, rad));
    }
    return results;
  }

  // ── Iteracja ──────────────────────────────────────────────────────────────

  // Iteruj po wszystkich polach (kolejność: wiersz po wierszu)
  forEach(callback) {
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const { q, r } = HexGrid.offsetToCube(col, row);
        const tile = this.get(q, r);
        if (tile) callback(tile, col, row);
      }
    }
  }

  // Zwróć tablicę wszystkich pól
  toArray() {
    const arr = [];
    this.forEach(tile => arr.push(tile));
    return arr;
  }

  // Filtruj pola
  filter(predicate) {
    return this.toArray().filter(predicate);
  }

  // ── Konwersje współrzędnych ────────────────────────────────────────────────

  // Offset (col, row) → cube (q, r)
  // Używamy układu "odd-r" (nieparzyste wiersze przesunięte w prawo)
  static offsetToCube(col, row) {
    const q = col - (row - (row & 1)) / 2;
    const r = row;
    return { q, r };
  }

  // Cube (q, r) → offset (col, row)
  static cubeToOffset(q, r) {
    const col = q + (r - (r & 1)) / 2;
    const row = r;
    return { col, row };
  }

  // Cube (q, r) → piksel (x, y) — środek heksa, pointy-top
  // size: promień koła opisanego na heksie (odległość środka do wierzchołka)
  static hexToPixel(q, r, size) {
    const x = size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
    const y = size * (3 / 2 * r);
    return { x, y };
  }

  // Piksel (x, y) → cube (q, r) — znajdź najbliższy hex, pointy-top
  static pixelToHex(x, y, size) {
    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
    const r = (2 / 3 * y) / size;
    return HexGrid.cubeRound(q, r);
  }

  // Zaokrąglenie do najbliższego całkowitego hexa w cube coords
  static cubeRound(qFrac, rFrac) {
    const sFrac = -qFrac - rFrac;
    let q = Math.round(qFrac);
    let r = Math.round(rFrac);
    let s = Math.round(sFrac);

    const qDiff = Math.abs(q - qFrac);
    const rDiff = Math.abs(r - rFrac);
    const sDiff = Math.abs(s - sFrac);

    // Koryguj komponent z największym odchyleniem (zachowanie q+r+s=0)
    if (qDiff > rDiff && qDiff > sDiff) {
      q = -r - s;
    } else if (rDiff > sDiff) {
      r = -q - s;
    }
    // s nie jest przechowywane, można pominąć korektę s

    return { q, r };
  }

  // Pozycja środka siatki w pikselach (dla wycentrowania kamery)
  gridCenter(size) {
    // Środek offset: col = width/2, row = height/2
    const { q, r } = HexGrid.offsetToCube(
      Math.floor(this.width  / 2),
      Math.floor(this.height / 2)
    );
    return HexGrid.hexToPixel(q, r, size);
  }

  // Rozmiar siatki w pikselach (bounding box)
  gridPixelSize(size) {
    const w = size * Math.sqrt(3) * (this.width + 0.5);
    const h = size * 1.5 * this.height + size * 0.5;
    return { w, h };
  }

  // ── Modyfikator polarny ───────────────────────────────────────────────────

  // 3 strefy: bieguny (×0.5, +50% koszt), przedbieguny (×0.7, +25%), reszta (×1.0)
  static getLatitudeModifier(r, gridHeight) {
    if (r === 0 || r === gridHeight - 1) return { production: 0.5, buildCost: 1.5, label: '🧊 ×0.5' };
    if (r === 1 || r === gridHeight - 2) return { production: 0.7, buildCost: 1.25, label: '🧊 ×0.7' };
    return { production: 1.0, buildCost: 1.0, label: null };
  }

  // ── Serializacja ──────────────────────────────────────────────────────────

  serialize() {
    return {
      width:  this.width,
      height: this.height,
      tiles:  this.toArray().map(tile => tile.serialize()),
    };
  }

  static restore(data) {
    const grid = new HexGrid(data.width, data.height);
    // Nadpisz kafelki z zapisu
    for (const tileData of data.tiles) {
      const tile = HexTile.restore(tileData);
      grid._tiles.set(tile.key, tile);
    }
    return grid;
  }
}
