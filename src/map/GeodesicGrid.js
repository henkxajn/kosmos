// GeodesicGrid — siatka geodezyjna kolonii: kontener pól na topologii GeodesicTopology (ARC COLONY SPHERE, CS-5a).
//
// Odpowiednik HexGrid dla kuli: `kind = 'geo'`, n (częstość), tiles[] (HexTile; q = indeks pola, r = GEO_TILE_R),
// klasa rozmiaru (klucz GRID_TILE_COUNTS) i progi pasów szerokości (D-CS-7). Systemy rozmawiają z nią WYŁĄCZNIE przez
// `tileGraphOf(grid)` → GeodesicTileGraph. Metody w stylu HexGrid (get / forEach / toArray / filter / getNeighbors)
// istnieją tylko po to, by stare miejsca, które jeszcze czytają siatkę wprost, nie wywracały się (dostają pole albo
// undefined, tak jak płaska siatka dla nieistniejącego pola).

import { HexTile } from './HexTile.js';
import { geodesicTopology } from './GeodesicTopology.js';
import { GEO_TILE_R } from './TileGraph.js';
import { GEO_LATITUDE_SHARES } from '../data/LatitudeBands.js';

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
    for (let i = 0; i < topo.count; i++) this.tiles[i] = new HexTile(i, GEO_TILE_R, 'plains');
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
}
