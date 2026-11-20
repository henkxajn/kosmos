// TileGraph — jeden interfejs grafu pól kolonii (COLONY SPHERE, krok CS-1a; plan §2)
//
// Każdy system rozgrywki rozmawia z siatką kolonii WYŁĄCZNIE przez ten interfejs: wyszukanie pola
// po id/kluczu, sąsiedzi, odległość, ścieżka, okolica (spirala/pierścień), iteracja, format kluczy.
// Dziś jedyną implementacją jest `FlatHexTileGraph` — cienka nakładka na `HexGrid`, która tylko
// DELEGUJE do jego metod (ta sama kolejność sąsiadów, te same remisy, ta sama kolejność iteracji),
// więc zachowanie jest bit w bit identyczne. Druga implementacja (`GeodesicGrid`) przychodzi w CS-5.
//
// Odniesienie do pola („ref”) = id (string; na płaskiej siatce dzisiejszy klucz "q,r") ALBO dowolny
// obiekt osadzony na siatce (pole, jednostka, {q,r}). Dzięki temu miejsca wywołań nie muszą same
// składać kluczy ani rozbierać współrzędnych.
//
// Interfejs (każda implementacja):
//   kind                              — 'flat' | 'geo' (CS-5a: GeodesicTileGraph)
//   tiles()                           — wszystkie pola, stała kolejność iteracji
//   forEachTile(cb)                   — cb(tile) w kolejności tiles()
//   anyTile()                         — pierwsze pole w kolejności iteracji albo null
//   tile(ref)                         — pole albo null/undefined (dokładnie to, co zwraca siatka)
//   idOf(ref)                         — id pola (string)
//   parseKey(key) / formatKey(ref, p) — klucze z prefiksem (`capital_`, `building_`)
//   neighbors(ref, {crossSeam})       — sąsiednie pola (stała kolejność)
//   distance(a, b)                    — odległość w krokach
//   within(ref, k)                    — pola w promieniu k (środek pierwszy, potem pierścienie)
//   ring(ref, k)                      — pola dokładnie w odległości k
//   path(from, to, {passable, maxIterations}) — A*: kroki bez startu, z celem; null = brak
// Reguły geometrii siatki (CS-2) — wywołujący NIE liczą rzędów, krawędzi ani pikseli sami:
//   latitudeBand(ref)                 — pas szerokości: LATITUDE_BAND.EQUATORIAL / SUBPOLAR / POLAR (D-CS-7)
//   equatorTile()                     — jakieś pole w pasie równikowym (fallback „neutralnej szerokości”)
//   isLandingEdge(ref)                — czy pole należy do strefy lądowania desantu (D-CS-9)
//   stepDirection(from, to)           — {crossesSeam, facingLeft}: krok przez szew mapy + zwrot sprite'a

import { HexGrid, HEX_DIRECTIONS } from './HexGrid.js';
import { geodesicTopology } from './GeodesicTopology.js';
import { GEO_LANDING_MIN_DISTANCE } from '../data/GeoGridRules.js';

// ── Klucze z prefiksem ───────────────────────────────────────────────────────
// Prefiksy kluczy budynków: wirtualna stolica w `_active` ('capital_q,r') i id producenta zasobów
// ('building_q,r'). Część po prefiksie to id pola.
export const CAPITAL_PREFIX  = 'capital_';
export const BUILDING_PREFIX = 'building_';
export const TILE_KEY_PREFIXES = Object.freeze([CAPITAL_PREFIX, BUILDING_PREFIX]);

// ── Pasy szerokości (CS-2, D-CS-7) ───────────────────────────────────────────
// Pas pola = jedyne wejście reguł szerokości (modyfikator ekonomiczny `src/data/LatitudeBands.js`, kara polarna AI
// `AiTerrainRules.aiPolarPenalty`). Liczby (×0.5 / ×0.7, −5 / −2) żyją w danych, nie tutaj.
export const LATITUDE_BAND = Object.freeze({ EQUATORIAL: 0, SUBPOLAR: 1, POLAR: 2 });

/** Czy klucz to wirtualna stolica ('capital_<id pola>'). */
export function isCapitalKey(key) {
  return parseTileKey(key).prefix === CAPITAL_PREFIX;
}

/** Rozbiera klucz na {prefix, id}; brak znanego prefiksu → prefix ''. */
export function parseTileKey(key) {
  const s = String(key);
  for (const p of TILE_KEY_PREFIXES) {
    if (s.startsWith(p)) return { prefix: p, id: s.slice(p.length) };
  }
  return { prefix: '', id: s };
}

/** Składa klucz: prefiks + id pola. */
export function formatTileKey(id, prefix = '') {
  return prefix + id;
}

/** Czy dwa obiekty osadzone na siatce (jednostka, armia, pole, {q,r}) stoją na tym samym polu. */
export function samePos(a, b) {
  return a.q === b.q && a.r === b.r;
}

// ── FlatHexTileGraph — dzisiejsza płaska siatka hex ──────────────────────────
export class FlatHexTileGraph {
  /** @param {HexGrid|null} grid — null = graf odłączony (tylko arytmetyka współrzędnych) */
  constructor(grid) {
    this.grid = grid;
    this.kind = 'flat';
  }

  // ref → {q, r}. Id "q,r" rozbierane jak dotąd: split(',').map(Number). Brak ref → pola bez
  // współrzędnych (jak dawne `tile?.q`), więc wyszukanie zwraca to, co siatka dla undefined.
  _qr(ref) {
    if (typeof ref === 'string') {
      const [q, r] = ref.split(',').map(Number);
      return { q, r };
    }
    return ref ?? {};
  }

  // ── Iteracja ────────────────────────────────────────────────────────────
  tiles() {
    return this.grid?.toArray?.() ?? [];
  }

  forEachTile(cb) {
    this.grid.forEach(tile => cb(tile));
  }

  anyTile() {
    return this.tiles()[0] ?? null;
  }

  // ── Pola i klucze ───────────────────────────────────────────────────────
  tile(ref) {
    const p = this._qr(ref);
    return this.grid.get(p.q, p.r);
  }

  idOf(ref) {
    if (typeof ref === 'string') return ref;
    return `${ref.q},${ref.r}`;
  }

  parseKey(key) {
    return parseTileKey(key);
  }

  formatKey(ref, prefix = '') {
    return formatTileKey(this.idOf(ref), prefix);
  }

  // ── Sąsiedzi i odległości ───────────────────────────────────────────────
  // crossSeam=false → bez zawijania przez szew mapy (kolejność HEX_DIRECTIONS, tylko istniejące
  // pola). Na kuli (CS-5) szwu nie ma, więc opcja nic tam nie zmienia.
  neighbors(ref, { crossSeam = true } = {}) {
    const p = this._qr(ref);
    if (crossSeam) return this.grid.getNeighbors(p.q, p.r);
    const out = [];
    for (const d of HEX_DIRECTIONS) {
      const t = this.grid.get(p.q + d.q, p.r + d.r);
      if (t) out.push(t);
    }
    return out;
  }

  // Dzisiejsza odległość sześcienna BEZ zawijania (Finding 760 zachowany celowo).
  distance(a, b) {
    const p = this._qr(a);
    const s = this._qr(b);
    return HexGrid.distance(p.q, p.r, s.q, s.r);
  }

  within(ref, k) {
    const p = this._qr(ref);
    return this.grid.spiral(p.q, p.r, k);
  }

  ring(ref, k) {
    const p = this._qr(ref);
    return this.grid.ring(p.q, p.r, k);
  }

  // ── Reguły geometrii siatki (CS-2) ──────────────────────────────────────
  // Pas szerokości z rzędu pola i wysokości TEJ siatki (dawne HexGrid.getLatitudeModifier(r, height), ta sama
  // kolejność warunków): rząd 0 / ostatni = biegun, 1 / przedostatni = przedbiegun, reszta = równik.
  // Ref = pole, {q,r} albo id "q,r" (pas liczony z id, nie z zapisanego `tileR`).
  latitudeBand(ref) {
    const h = this.grid?.height;
    const r = this._qr(ref).r;
    if (r === 0 || r === h - 1) return LATITUDE_BAND.POLAR;
    if (r === 1 || r === h - 2) return LATITUDE_BAND.SUBPOLAR;
    return LATITUDE_BAND.EQUATORIAL;
  }

  // Pole w pasie równikowym: pierwsze (w kolejności iteracji) pole środkowego rzędu floor(height/2) — dawny
  // fallback RandomEventSystem `r = height/2`. Brak takiego pola → null.
  equatorTile() {
    const mid = Math.floor((this.grid?.height ?? 0) / 2);
    return this.tiles().find(t => t.r === mid) ?? null;
  }

  // Strefa lądowania desantu na płaskiej mapie = brzeg: mniej niż 6 sąsiadów (z zawijaniem przez szew, więc
  // brzeg to pierwszy / ostatni rząd i krótsze rzędy). Na kuli (CS-5) brzegu nie ma — reguła D-CS-9.
  isLandingEdge(ref) {
    return this.neighbors(ref).length < 6;
  }

  // Krok jednostki z pola `from` na sąsiednie `to`: czy przechodzi przez szew mapy (|dx| > 0.4 szerokości siatki
  // w pikselach przy hexSize = 1 → teleport bez animacji) i czy sprite patrzy w lewo (przy szwie odwrotnie, bo
  // wizualnie jednostka „wychodzi” z drugiej strony). Na kuli (CS-5): szwu nie ma, zwrot z kierunku w płaszczyźnie
  // stycznej.
  stepDirection(from, to) {
    const a = this._qr(from);
    const b = this._qr(to);
    const fromLocal = this.grid.tilePixelPos(a.q, a.r, 1);
    const toLocal   = this.grid.tilePixelPos(b.q, b.r, 1);
    const dx = toLocal.x - fromLocal.x;
    const crossesSeam = Math.abs(dx) > this.grid.gridPixelSize(1).w * 0.4;
    return { crossesSeam, facingLeft: crossesSeam ? dx > 0 : dx < 0 };
  }

  // ── Ścieżka ─────────────────────────────────────────────────────────────
  // A* o jednolitym koszcie 1 (przeniesione 1:1 z GroundUnitManager._aStar): heurystyka = distance
  // (bez zawijania), sąsiedzi przez neighbors() (z zawijaniem), remis f → pierwszy w kolejce.
  // passable(tile) === false blokuje wejście na pole. Zwraca [{q, r}, …] bez startu, z celem.
  path(from, to, { passable = () => true, maxIterations = 2000 } = {}) {
    const s = this._qr(from);
    const g = this._qr(to);
    const startKey = `${s.q},${s.r}`;
    const goalKey  = `${g.q},${g.r}`;

    const open     = [{ q: s.q, r: s.r, f: 0 }];
    const gScore   = new Map(); // klucz → koszt dotarcia
    const cameFrom = new Map(); // klucz → poprzedni klucz
    gScore.set(startKey, 0);

    let iterations = 0;
    while (open.length > 0 && iterations++ < maxIterations) {
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0];
      const curKey = `${current.q},${current.r}`;

      if (curKey === goalKey) return FlatHexTileGraph._reconstructPath(cameFrom, goalKey);

      for (const neighbor of this.grid.getNeighbors(current.q, current.r)) {
        if (!passable(neighbor)) continue;
        const nKey = `${neighbor.q},${neighbor.r}`;
        const tentativeG = (gScore.get(curKey) ?? Infinity) + 1;
        if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
          cameFrom.set(nKey, curKey);
          gScore.set(nKey, tentativeG);
          const f = tentativeG + HexGrid.distance(neighbor.q, neighbor.r, g.q, g.r);
          const existing = open.find(n => `${n.q},${n.r}` === nKey);
          if (existing) existing.f = f;
          else open.push({ q: neighbor.q, r: neighbor.r, f });
        }
      }
    }
    return null; // brak ścieżki
  }

  static _reconstructPath(cameFrom, goalKey) {
    const path = [];
    let current = goalKey;
    while (cameFrom.has(current)) {
      const [q, r] = current.split(',').map(Number);
      path.unshift({ q, r });
      current = cameFrom.get(current);
    }
    return path;
  }
}

// Graf odłączony — dla pozycji bez siatki (np. jednostka na ciele bez kolonii): tylko distance /
// idOf / klucze; tile()/neighbors()/within() wymagają siatki.
export const DETACHED_FLAT_GRAPH = new FlatHexTileGraph(null);

// ── GeodesicTileGraph — siatka geodezyjna kuli (CS-5a) ─────────────────────
// Id pola = "g<indeks>" (indeks z GeodesicTopology: 0…11 pięciokąty). Pole siatki geo to HexTile z q = indeks i
// r = GEO_TILE_R (−1, na płaskiej siatce r ≥ 0 zawsze) — para (q, r) jednostki / armii / zdarzenia nadal wskazuje pole,
// więc obiekty osadzone na siatce i `samePos` działają bez zmian; klucze składa WYŁĄCZNIE graf (idOf / formatKey).
// Reguły geometrii kuli (D-CS-7, D-CS-9) są metodami TEJ klasy — nie dziedziczy nic po FlatHexTileGraph.
export const GEO_TILE_R = -1;
export const GEO_ID_PREFIX = 'g';

export class GeodesicTileGraph {
  /** @param {object} grid — GeodesicGrid (kind 'geo', n, tiles[], latCutoffs) */
  constructor(grid) {
    this.grid = grid;
    this.kind = 'geo';
    this.topo = geodesicTopology(grid.n);
  }

  // ref → indeks pola (NaN, gdy ref nie wskazuje pola tej siatki).
  _idx(ref) {
    if (typeof ref === 'string') {
      if (!ref.startsWith(GEO_ID_PREFIX)) return NaN;
      const s = ref.slice(GEO_ID_PREFIX.length);
      return /^[0-9]+$/.test(s) ? Number(s) : NaN;
    }
    if (typeof ref === 'number') return ref;
    if (ref && ref.r === GEO_TILE_R && Number.isInteger(ref.q)) return ref.q;
    return NaN;
  }

  _ok(i) { return Number.isInteger(i) && i >= 0 && i < this.topo.count; }

  // ── Iteracja ────────────────────────────────────────────────────────────
  tiles() { return this.grid.tiles.slice(); }
  forEachTile(cb) { for (const t of this.grid.tiles) cb(t); }
  anyTile() { return this.grid.tiles[0] ?? null; }

  // ── Pola i klucze ───────────────────────────────────────────────────────
  tile(ref) {
    const i = this._idx(ref);
    return this._ok(i) ? this.grid.tiles[i] : undefined;
  }

  idOf(ref) {
    if (typeof ref === 'string') return ref;
    return GEO_ID_PREFIX + this._idx(ref);
  }

  parseKey(key) { return parseTileKey(key); }
  formatKey(ref, prefix = '') { return formatTileKey(this.idOf(ref), prefix); }

  /** Czy pole jest pięciokątem (5 sąsiadów — „węzeł anomalii", D-CS-9). */
  isPentagon(ref) { return this.topo.isPentagon(this._idx(ref)); }

  /** Środek pola (wektor jednostkowy) — dla rysunku i wyboru; rozgrywka czyta tylko arytmetykę. */
  centerOf(ref) {
    const i = this._idx(ref);
    return this._ok(i) ? { x: this.topo.cx[i], y: this.topo.cy[i], z: this.topo.cz[i] } : null;
  }

  // ── Sąsiedzi i odległości (crossSeam bez znaczenia — kula nie ma szwu) ──
  neighbors(ref) {
    const i = this._idx(ref);
    if (!this._ok(i)) return [];
    return this.topo.neighbors(i).map(j => this.grid.tiles[j]);
  }

  distance(a, b) {
    const i = this._idx(a), j = this._idx(b);
    if (!this._ok(i) || !this._ok(j)) return NaN;
    return this.topo.distance(i, j);
  }

  within(ref, k) {
    const i = this._idx(ref);
    if (!this._ok(i)) return [];
    return this.topo.within(i, k).map(j => this.grid.tiles[j]);
  }

  ring(ref, k) {
    const i = this._idx(ref);
    if (!this._ok(i)) return [];
    return this.topo.ring(i, k).map(j => this.grid.tiles[j]);
  }

  // A* (GeodesicTopology.path): optymalny, remisy deterministyczne, trasa najbliżej wielkiego koła (Finding 781).
  // passable(tile) === false blokuje wejście. Zwraca [{q, r}, …] bez startu, z celem; null = brak.
  path(from, to, { passable = () => true, maxIterations = 2000 } = {}) {
    const a = this._idx(from), b = this._idx(to);
    if (!this._ok(a) || !this._ok(b)) return null;
    const tiles = this.grid.tiles;
    const steps = this.topo.path(a, b, (j) => passable(tiles[j]) !== false, maxIterations);
    return steps ? steps.map(j => ({ q: j, r: GEO_TILE_R })) : null;
  }

  // ── Reguły geometrii kuli ───────────────────────────────────────────────
  // Pas szerokości z |y| środka pola i progów siatki (GEO_LATITUDE_SHARES klasy rozmiaru, D-CS-7).
  latitudeBand(ref) {
    const i = this._idx(ref);
    if (!this._ok(i)) return LATITUDE_BAND.EQUATORIAL;
    const c = this.grid.latCutoffs;
    const ay = Math.abs(this.topo.cy[i]);
    if (c && ay >= c.polar) return LATITUDE_BAND.POLAR;
    if (c && ay >= c.subpolar) return LATITUDE_BAND.SUBPOLAR;
    return LATITUDE_BAND.EQUATORIAL;
  }

  // Pole o najmniejszym |y| środka (remis → mniejszy indeks).
  equatorTile() { return this.grid.tiles[this.topo.equatorTile()] ?? null; }

  // Strefa lądowania (D-CS-9): pole w odległości grafowej ≥ GEO_LANDING_MIN_DISTANCE od KAŻDEGO pola zajętego
  // (właściciel, budynek, budowa, stolica). Ciało bez zajętych pól → całe jest strefą lądowania. NIE „mniej niż 6
  // sąsiadów" — to byłyby dokładnie pięciokąty.
  isLandingEdge(ref) {
    const i = this._idx(ref);
    if (!this._ok(i)) return false;
    const held = this._heldTiles();
    for (const h of held) if (this.topo.distance(i, h) < GEO_LANDING_MIN_DISTANCE) return false;
    return true;
  }

  _heldTiles() {
    const out = [];
    const tiles = this.grid.tiles;
    for (let j = 0; j < tiles.length; j++) {
      const t = tiles[j];
      if (t.owner != null || t.buildingId != null || t.underConstruction != null || t.capitalBase) out.push(j);
    }
    return out;
  }

  // Krok jednostki: szwu nie ma; zwrot sprite'a z rzutu kroku na lokalny kierunek wschodni (−z, 0, x) w punkcie startu.
  stepDirection(from, to) {
    const a = this._idx(from), b = this._idx(to);
    if (!this._ok(a) || !this._ok(b)) return { crossesSeam: false, facingLeft: false };
    const t = this.topo;
    const east = (t.cx[b] - t.cx[a]) * -t.cz[a] + (t.cz[b] - t.cz[a]) * t.cx[a];
    return { crossesSeam: false, facingLeft: east < 0 };
  }
}

// ── Wejście: siatka → graf ───────────────────────────────────────────────────
const _graphs = new WeakMap();

/**
 * Graf pól dla siatki kolonii. Falsy siatka → null (jak `grid?.…`). Graf jest buforowany per
 * instancja siatki: płaski hex albo (CS-5a) siatka geodezyjna (`grid.kind === 'geo'`).
 * @param {HexGrid|GeodesicGrid|null|undefined} grid
 * @returns {FlatHexTileGraph|GeodesicTileGraph|null}
 */
export function tileGraphOf(grid) {
  if (!grid) return null;
  let g = _graphs.get(grid);
  if (!g) {
    g = grid.kind === 'geo' ? new GeodesicTileGraph(grid) : new FlatHexTileGraph(grid);
    _graphs.set(grid, g);
  }
  return g;
}
