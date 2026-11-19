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
//   kind                              — 'flat' (CS-5 doda 'geo')
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
// Reguły geometrii siatki (pasy szerokości, kara polarna, krawędź lądowania, krok przez szew,
// _gridHeight) przechodzą za ten interfejs w CS-2 — tu ich jeszcze nie ma.

import { HexGrid, HEX_DIRECTIONS } from './HexGrid.js';

// ── Klucze z prefiksem ───────────────────────────────────────────────────────
// Prefiksy kluczy budynków: wirtualna stolica w `_active` ('capital_q,r') i id producenta zasobów
// ('building_q,r'). Część po prefiksie to id pola.
export const CAPITAL_PREFIX  = 'capital_';
export const BUILDING_PREFIX = 'building_';
export const TILE_KEY_PREFIXES = Object.freeze([CAPITAL_PREFIX, BUILDING_PREFIX]);

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

// ── Wejście: siatka → graf ───────────────────────────────────────────────────
const _graphs = new WeakMap();

/**
 * Graf pól dla siatki kolonii. Falsy siatka → null (jak `grid?.…`). Graf jest buforowany per
 * instancja siatki. Do CS-5 jedynym rodzajem jest płaski hex.
 * @param {HexGrid|null|undefined} grid
 * @returns {FlatHexTileGraph|null}
 */
export function tileGraphOf(grid) {
  if (!grid) return null;
  let g = _graphs.get(grid);
  if (!g) {
    g = new FlatHexTileGraph(grid);
    _graphs.set(grid, g);
  }
  return g;
}
