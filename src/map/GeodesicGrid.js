// GeodesicGrid — siatka geodezyjna kolonii: kontener pól na topologii GeodesicTopology (ARC COLONY SPHERE, CS-5a).
//
// Odpowiednik HexGrid dla kuli: `kind = 'geo'`, n (częstość), tiles[] (GeoTile ⊂ HexTile; q = indeks pola, r = GEO_TILE_R, key = id grafu `g<i>`),
// klasa rozmiaru (klucz GRID_TILE_COUNTS) i progi pasów szerokości (D-CS-7). Systemy rozmawiają z nią WYŁĄCZNIE przez
// `tileGraphOf(grid)` → GeodesicTileGraph. Metody w stylu HexGrid (get / forEach / toArray / filter / getNeighbors)
// istnieją tylko po to, by stare miejsca, które jeszcze czytają siatkę wprost, nie wywracały się (dostają pole albo
// undefined, tak jak płaska siatka dla nieistniejącego pola).
//
// Zapis (CS-5b) — format RZADKI: { kind: 'geo', n, gridClass, terrain, base, tiles }
//   terrain — string, jeden znak na pole (indeks w GEO_TERRAIN_CODES; teren spoza listy → '?' + `type` w rekordzie pola),
//   base    — najczęstsze wartości `explored` i `owner` (zwykle całe ciało ma jedno i drugie wspólne),
//   tiles   — tylko pola, które różnią się od domyślnych HexTile + base: [{ i, …pola różniące się }].
// Zapis bez `kind` = płaska siatka HexGrid (stare zapisy i każda płaska kolonia — płaska siatka NIE dostaje `kind`,
// więc jej zapis zostaje bit w bit).

import { HexTile } from './HexTile.js';
import { geodesicTopology } from './GeodesicTopology.js';
import { GEO_TILE_R, GEO_ID_PREFIX } from './TileGraph.js';
import { GEO_LATITUDE_SHARES } from '../data/LatitudeBands.js';

// Kody terenu w zapisie — KOLEJNOŚĆ JEST FORMATEM ZAPISU (nie zmieniać, tylko dopisywać na końcu).
export const GEO_TERRAIN_CODES = Object.freeze(['plains', 'mountains', 'ocean', 'forest', 'desert', 'tundra', 'volcano', 'crater',
  'ice_sheet', 'wasteland']);
const TERRAIN_INDEX = new Map(GEO_TERRAIN_CODES.map((t, i) => [t, i]));
const UNKNOWN_TERRAIN = '?';
// Wartości domyślne HexTile.restore (pola zapisu HexTile.serialize poza q / r / type).
const TILE_DEFAULTS = Object.freeze({ buildingId: null, buildingLevel: 1, explored: true, strategicResource: null, damaged: false,
  capitalBase: false, anomaly: null, anomalyDetected: false, anomalyRevealed: false, anomalyEffect: null, underConstruction: null,
  syntheticSlot: null, owner: null, occupyEmpireId: null, occupyStart: null });

// Finding 783 — pole kuli: `key` = id grafu (`g<i>`), nie płaskie `"q,r"` (`"i,-1"`). BuildingSystem (`_active`, kolejka budowy,
//   id producenta) i ColonyAutoExpander kluczują przez `tile.key`, a TileGraph / sync budynków czytają id grafu — bez tego
//   stolica kolonii postawiona przez `planet:buildRequest` miała klucz `capital_0,-1`, którego graf kuli nie rozwiązuje.
//   Współrzędne (q = indeks, r = GEO_TILE_R) zostają — tylko napis klucza pola jest kanoniczny.
export class GeoTile extends HexTile {
  get key() { return GEO_ID_PREFIX + this.q; }
}

function mostCommon(values) {
  const c = new Map();
  for (const v of values) c.set(v, (c.get(v) ?? 0) + 1);
  let best = values[0], bc = -1;
  for (const [v, k] of c) if (k > bc) { best = v; bc = k; }   // remis → pierwsza wartość w kolejności pól
  return best;
}

export class GeodesicGrid {
  /**
   * @param {number} n częstość podziału (3 → 92 pól, 4 → 162, 5 → 252, 6 → 362)
   * @param {{gridClass?: string}} [opts] klasa rozmiaru — wybiera udziały pasów szerokości (GEO_LATITUDE_SHARES)
   */
  constructor(n, { gridClass = 'small_rocky' } = {}) {
    this.kind = 'geo';
    this.n = n;
    this.gridClass = gridClass;
    const topo = geodesicTopology(n);
    this.count = topo.count;
    this.tiles = new Array(topo.count);
    for (let i = 0; i < topo.count; i++) this.tiles[i] = new GeoTile(i, GEO_TILE_R, 'plains');
    const shares = GEO_LATITUDE_SHARES[gridClass] ?? GEO_LATITUDE_SHARES.small_rocky;
    this.latCutoffs = topo.latitudeCutoffs(shares.polar, shares.subpolar);
  }

  // ── Zgodność z HexGrid (tylko odczyt; nowe miejsca używają TileGraph) ──
  get(q, r) { return r === GEO_TILE_R ? this.tiles[q] : undefined; }
  forEach(cb) { for (const t of this.tiles) cb(t); }
  toArray() { return this.tiles.slice(); }
  filter(pred) { return this.tiles.filter(pred); }
  getNeighbors(q, r) {
    if (r !== GEO_TILE_R || !this.tiles[q]) return [];
    return geodesicTopology(this.n).neighbors(q).map(j => this.tiles[j]);
  }

  // Pozycja „rysunku" pola dla interpolacji ruchu jednostki (GroundUnitManager._setupNextStep → `_fromPixel` / `_toPixel`).
  // Na kuli nie ma mapy 2D: zwracamy środek pola (wektor jednostkowy × hexSize, + z) — CS-10 interpoluje po kuli.
  // Czyta to dziś tylko martwy PlanetScene; rozgrywka nie.
  tilePixelPos(q, r, hexSize = 1) {
    if (r !== GEO_TILE_R || !this.tiles[q]) return { x: 0, y: 0, z: 0 };
    const t = geodesicTopology(this.n);
    return { x: t.cx[q] * hexSize, y: t.cy[q] * hexSize, z: t.cz[q] * hexSize };
  }

  // ── Zapis rzadki (CS-5b) ──
  serialize() {
    const recs = this.tiles.map(t => t.serialize());
    const base = { explored: mostCommon(recs.map(r => r.explored)), owner: mostCommon(recs.map(r => r.owner)) };
    const defaults = { ...TILE_DEFAULTS, ...base };
    let terrain = '';
    const tiles = [];
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      const code = TERRAIN_INDEX.get(r.type);
      terrain += code === undefined ? UNKNOWN_TERRAIN : String(code);
      const out = {};
      let any = false;
      if (code === undefined) { out.type = r.type; any = true; }
      for (const k of Object.keys(TILE_DEFAULTS)) {
        const v = r[k];
        if (v === defaults[k] || (v === undefined && defaults[k] === null)) continue;
        out[k] = v; any = true;
      }
      if (any) tiles.push({ i, ...out });
    }
    return { kind: 'geo', n: this.n, gridClass: this.gridClass, terrain, base, tiles };
  }

  static restore(data) {
    const grid = new GeodesicGrid(data.n, { gridClass: data.gridClass ?? 'small_rocky' });
    const base = data.base ?? {};
    const byIndex = new Map((data.tiles ?? []).map(r => [r.i, r]));
    for (let i = 0; i < grid.count; i++) {
      const ch = data.terrain?.[i];
      const rec = byIndex.get(i) ?? {};
      const type = rec.type ?? (ch !== undefined && ch !== UNKNOWN_TERRAIN ? GEO_TERRAIN_CODES[Number(ch)] : 'plains');
      const { i: _i, type: _t, ...fields } = rec;
      grid.tiles[i] = Object.setPrototypeOf(HexTile.restore({ ...TILE_DEFAULTS, ...base, ...fields, q: i, r: GEO_TILE_R, type }),
        GeoTile.prototype);   // Finding 783 — klucz pola = id grafu
    }
    return grid;
  }
}
