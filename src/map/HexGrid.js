// HexGrid — siatka heksagonalna w układzie cube coordinates
//
// Cube coordinates: każde pole opisane przez (q, r, s) gdzie q+r+s = 0
//   Przechowujemy tylko q i r; s = -q-r
//
// Orientacja: pointy-top (wierzchołek u góry, płaskie boki po bokach)
//   Wygląda naturalnie w widoku "z góry", standardowa w grach strategicznych
//
// Dwa tryby siatki:
//   1. Prostokątny (klasyczny): W × H pól, wszystkie rzędy mają tę samą szerokość
//   2. Tapered (owalny):  rzędy mają zmienną szerokość — bieguny wąskie, równik szeroki
//      Daje efekt rozwiniętego globusa.
//
// Piksel ↔ hex: metody hexToPixel i pixelToHex

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
  // width, height — liczba pól w poziomie i pionie
  // options.tapered = true → owalny grid ze zmienną szerokością rzędów
  // options.rowWidths = [n, ...] — jawne szerokości (lub obliczone z width jako equatorWidth)
  constructor(width, height, options = {}) {
    this.width  = width;   // max szerokość (equatorWidth w tapered)
    this.height = height;

    this.tapered = !!options.tapered;

    // Oblicz szerokości rzędów
    if (this.tapered) {
      this._rowWidths = options.rowWidths
        ?? HexGrid.calcTaperedWidths(width, height);
    } else {
      this._rowWidths = null; // prostokątny — wszystkie rzędy = width
    }

    // Przechowujemy kafelki w Map: klucz = "q,r" → HexTile
    this._tiles = new Map();

    // Wypełnij siatkę pustymi kafelkami (plains domyślnie)
    this._initGrid();
  }

  // ── Oblicz szerokości rzędów dla tapered grid ───────────────────────────────
  // Sinusoidalny profil: bieguny wąskie (min 33% equatorW), równik pełny
  static calcTaperedWidths(equatorWidth, rows) {
    const widths = [];
    for (let r = 0; r < rows; r++) {
      const lat = rows <= 1 ? Math.PI / 2 : (r / (rows - 1)) * Math.PI;
      const scale = Math.sin(lat);
      const w = Math.max(4, Math.round(equatorWidth * Math.max(0.33, scale)));
      // Zapewnij parzystość (ładniejsze centrowanie)
      widths.push(w % 2 === equatorWidth % 2 ? w : w + 1);
    }
    return widths;
  }

  // ── Inicjalizacja ──────────────────────────────────────────────────────────

  _initGrid() {
    for (let row = 0; row < this.height; row++) {
      const rowW = this.getRowWidth(row);
      for (let col = 0; col < rowW; col++) {
        const { q, r } = HexGrid.offsetToCube(col, row);
        const tile = new HexTile(q, r, 'plains');
        this._tiles.set(tile.key, tile);
      }
    }
  }

  // ── Szerokość rzędu ────────────────────────────────────────────────────────

  getRowWidth(row) {
    if (!this.tapered || !this._rowWidths) return this.width;
    if (row < 0 || row >= this.height) return 0;
    return this._rowWidths[row];
  }

  // ── Offset X rzędu (w pikselach) — centrowanie wąskich rzędów ─────────────
  // Offset = ile pikseli przesunąć rząd w prawo, aby był wycentrowany
  getRowPixelOffset(row, hexSize) {
    if (!this.tapered) return 0;
    const maxW = this.width;
    const rowW = this.getRowWidth(row);
    const diff = maxW - rowW;
    // Przesunięcie = połowa różnicy w pikselach hexa
    return diff * hexSize * Math.sqrt(3) / 2;
  }

  // ── Dostęp do pól ──────────────────────────────────────────────────────────

  get(q, r) {
    return this._tiles.get(`${q},${r}`) ?? null;
  }

  getOffset(col, row) {
    const { q, r } = HexGrid.offsetToCube(col, row);
    return this.get(q, r);
  }

  setTerrain(q, r, type) {
    const tile = this.get(q, r);
    if (tile) tile.type = type;
  }

  setStrategicResource(q, r, resourceKey) {
    const tile = this.get(q, r);
    if (tile) tile.strategicResource = resourceKey;
  }

  // ── Sąsiedzi i odległości ─────────────────────────────────────────────────

  getNeighbors(q, r) {
    const result = [];
    for (const dir of HEX_DIRECTIONS) {
      let nq = q + dir.q, nr = r + dir.r;
      let neighbor = this.get(nq, nr);

      // Zawijanie poziome — planeta jest kulą
      if (!neighbor && nr >= 0 && nr < this.height) {
        const rowW = this.getRowWidth(nr);
        if (rowW > 0) {
          const { col } = HexGrid.cubeToOffset(nq, nr);
          if (col < 0 || col >= rowW) {
            const wrappedCol = ((col % rowW) + rowW) % rowW;
            const wrapped = HexGrid.offsetToCube(wrappedCol, nr);
            neighbor = this.get(wrapped.q, wrapped.r);
          }
        }
      }

      if (neighbor) result.push(neighbor);
    }
    return result;
  }

  static distance(q1, r1, q2, r2) {
    return Math.max(
      Math.abs(q1 - q2),
      Math.abs(r1 - r2),
      Math.abs((-q1 - r1) - (-q2 - r2))
    );
  }

  ring(q, r, radius) {
    if (radius === 0) {
      const t = this.get(q, r);
      return t ? [t] : [];
    }
    const results = [];
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

  forEach(callback) {
    for (let row = 0; row < this.height; row++) {
      const rowW = this.getRowWidth(row);
      for (let col = 0; col < rowW; col++) {
        const { q, r } = HexGrid.offsetToCube(col, row);
        const tile = this.get(q, r);
        if (tile) callback(tile, col, row);
      }
    }
  }

  toArray() {
    const arr = [];
    this.forEach(tile => arr.push(tile));
    return arr;
  }

  filter(predicate) {
    return this.toArray().filter(predicate);
  }

  // ── Konwersje współrzędnych ────────────────────────────────────────────────

  // Offset (col, row) → cube (q, r) — układ "odd-r"
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

    if (qDiff > rDiff && qDiff > sDiff) {
      q = -r - s;
    } else if (rDiff > sDiff) {
      r = -q - s;
    }
    return { q, r };
  }

  // Pozycja środka siatki w pikselach (dla wycentrowania kamery)
  gridCenter(size) {
    const midRow = Math.floor(this.height / 2);
    const midCol = Math.floor(this.getRowWidth(midRow) / 2);
    const { q, r } = HexGrid.offsetToCube(midCol, midRow);
    const base = HexGrid.hexToPixel(q, r, size);
    // Dodaj offset centrowania rzędu
    base.x += this.getRowPixelOffset(midRow, size);
    return base;
  }

  // Rozmiar siatki w pikselach (bounding box — najszerszy rząd × height)
  gridPixelSize(size) {
    const maxW = this.tapered
      ? Math.max(...this._rowWidths)
      : this.width;
    const w = size * Math.sqrt(3) * (maxW + 0.5);
    const h = size * 1.5 * this.height + size * 0.5;
    return { w, h };
  }

  // ── Pozycja hexa w pikselach z uwzględnieniem tapered offset ──────────────
  // Zwraca {x, y} — gotowe do rysowania (z centrowania rzędu)
  tilePixelPos(q, r, hexSize) {
    const base = HexGrid.hexToPixel(q, r, hexSize);
    base.x += this.getRowPixelOffset(r, hexSize);
    return base;
  }

  // Piksel → tile z uwzględnieniem tapered offset
  pixelToTile(px, py, hexSize) {
    // Szukamy w którym rzędzie jest py
    const row = Math.round(py / (hexSize * 1.5));
    if (row < 0 || row >= this.height) return null;

    // Odejmij offset centrowania rzędu
    const adjX = px - this.getRowPixelOffset(row, hexSize);
    const { q, r } = HexGrid.pixelToHex(adjX, py, hexSize);

    // Sprawdź czy wynik jest w grid (i sąsiednie rzędy, bo rounding)
    let tile = this.get(q, r);
    if (tile) return tile;

    // Fallback: sprawdź sąsiednie rzędy (rounding przy krawędziach tapered)
    for (const dr of [-1, 1]) {
      const altRow = row + dr;
      if (altRow < 0 || altRow >= this.height) continue;
      const altX = px - this.getRowPixelOffset(altRow, hexSize);
      const alt = HexGrid.pixelToHex(altX, py, hexSize);
      const altTile = this.get(alt.q, alt.r);
      if (altTile) return altTile;
    }
    return null;
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
    const data = {
      width:  this.width,
      height: this.height,
      tiles:  this.toArray().map(tile => tile.serialize()),
    };
    if (this.tapered) {
      data.tapered = true;
      data.rowWidths = this._rowWidths;
    }
    return data;
  }

  static restore(data) {
    const opts = {};
    if (data.tapered) {
      opts.tapered = true;
      opts.rowWidths = data.rowWidths;
    }
    const grid = new HexGrid(data.width, data.height, opts);
    // Nadpisz kafelki z zapisu
    for (const tileData of data.tiles) {
      const tile = HexTile.restore(tileData);
      grid._tiles.set(tile.key, tile);
    }
    return grid;
  }
}
