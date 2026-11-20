// ColonyBillboardLogic — CZYSTA logika budynków na kuli kolonii jako portretów-billboardów (ARC COLONY SPHERE, krok CS-9;
// plan §3.18). Decyzja właściciela 2026-11-20: grafiką budynku jest JEGO portret (`assets/buildings/{id}.png`) — nie
// proceduralna bryła. Nowy plik PNG działa po samym wrzuceniu (ładuje go `BuildingTextures`, atlas dobiera mipmapy).
//
//   • `billboardSpecOf(tile)`   — co stoi na polu: portret, stan (zbudowany / budowa / rozbudowa / uszkodzony), postęp,
//                                 poziom → pipsy, stolica (portret `colony_base` + budynek pola jako plakietka), kategoria;
//   • `billboardLod(tilePx)`    — płynna skala z zoomem z klamrą min / max, daleko → kropka w barwie kategorii;
//   • `horizonAlpha(...)`       — chowanie za horyzontem kuli (pole po drugiej stronie = nic, przy limbie wygaszanie);
//   • `buildBillboardList(...)` — lista rysowania jednej klatki (kolejność malarska, stolica na wierzchu);
//   • `mipFor(...)` / `topMipFor(...)` — dobór poziomu atlasu (128 / 256 / 512 px źródła, ostre zbliżenia);
//   • `geoTileDirOf(grid, tile)` — kierunek pola siatki geo w układzie ciała (Finding 784: ikony na mapie układu).
//
// Moduł bez DOM, bez three — keeper `colony_sphere_buildings_smoke` wykonuje go pod node.

import { BUILDINGS } from '../data/BuildingsData.js';
import { BUILDING_CATEGORY_COLORS, BUILDING_CATEGORY_FALLBACK } from '../data/BuildingCategoryColors.js';
import { geodesicTopology } from '../map/GeodesicTopology.js';

export const CAPITAL_BUILDING_ID = Object.keys(BUILDINGS).find(id => BUILDINGS[id].isCapital) ?? 'colony_base';

/** Strojenie billboardów (wartości do przeglądu przez właściciela — plan §3.18). */
export const BILLBOARD = Object.freeze({
  sizePerTile: 0.96,      // bok portretu / odstęp pól na ekranie
  minPx: 20,              // klamry boku portretu na ekranie [px gospodarza]
  maxPx: 176,
  dotBelowPx: 13,         // odstęp pól poniżej tego → sama kropka kategorii
  dotBandPx: 4,           // pasmo przenikania kropka ↔ portret [px odstępu pól]
  dotMinPx: 2.2,          // promień kropki
  dotMaxPx: 4.2,
  facingMin: 0.10,        // poniżej — pole przy limbie / za horyzontem: nic
  facingFull: 0.34,       // powyżej — pełne krycie
  groundY: 0.80,          // linia gruntu grafiki (ułamek wysokości od góry): portret STOI na środku pola
  capitalScale: 1.35,     // portret stolicy względem zwykłego budynku
  capitalMinPx: 18,       // stolica widoczna zawsze (także tam, gdzie reszta to kropki)
  shadowW: 0.70,          // cień / stopa pod budynkiem (ułamki boku portretu)
  shadowH: 0.22,
  shadowAlpha: 0.55,
  baseW: 0.56,            // obrys podstawy w barwie kategorii
  baseH: 0.17,
  constructionAlpha: 0.80,   // portret w budowie: odbarwiony i lekko przezroczysty
  pipMax: 5,              // najwyżej tyle pipsów poziomu; poziomy 6…10 = pipsy „mocne"
  pipMinPortraitPx: 26,   // poniżej — pipsów nie rysujemy
  ringMinPortraitPx: 24,  // poniżej — pierścienia postępu nie rysujemy
  mips: Object.freeze([512, 256, 128, 64, 32]),
});

export const BILLBOARD_STATE = Object.freeze({ BUILT: 'built', CONSTRUCTION: 'construction', UPGRADE: 'upgrade', DAMAGED: 'damaged' });

/** Barwy stanów (CSS) — wspólne dla kuli i arkusza dowodowego. */
export const BILLBOARD_COLORS = Object.freeze({
  capitalRing: '#ffc83c', construction: '#ffdd44', damaged: '#ff4a38', pip: '#ffd24a', pipStrong: '#ffffff', ink: 'rgba(8,10,14,0.78)',
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / Math.max(1e-9, b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Barwa kategorii budynku jako napis CSS (#rrggbb). */
export function categoryCss(category) {
  const c = BUILDING_CATEGORY_COLORS[category] ?? BUILDING_CATEGORY_FALLBACK;
  return typeof c === 'number' ? `#${c.toString(16).padStart(6, '0')}` : String(c);
}

/** Pipsy poziomu: poziom 1 — brak; 2…5 — tyle pipsów; 6…10 — pięć pipsów, z czego (poziom − 5) „mocnych". */
export function pipsOf(level, T = BILLBOARD) {
  const lv = Math.floor(Number(level) || 1);
  if (lv < 2) return { count: 0, strong: 0 };
  return { count: Math.min(T.pipMax, lv), strong: clamp(lv - T.pipMax, 0, T.pipMax) };
}

/**
 * Co stoi na polu (czyste). Stolica jest WIRTUALNA (`capitalBase`, `buildingId` puste albo budynek postawiony na polu
 * stolicy) — portret stolicy to `colony_base`, budynek pola staje się plakietką.
 * @returns {null | {portraitId:string, category:string, capital:boolean, badgeId:string|null, state:string,
 *   progress:number|null, level:number, pips:{count:number, strong:number}, scale:number}}
 */
export function billboardSpecOf(tile, T = BILLBOARD) {
  if (!tile) return null;
  const uc = tile.underConstruction ?? null;
  const progress = uc ? clamp(Number(uc.progress) || 0, 0, 1) : null;
  if (tile.capitalBase) {
    return { portraitId: CAPITAL_BUILDING_ID, category: BUILDINGS[CAPITAL_BUILDING_ID]?.category ?? 'population', capital: true,
      badgeId: tile.buildingId ?? null, state: tile.damaged ? BILLBOARD_STATE.DAMAGED : (uc ? BILLBOARD_STATE.UPGRADE : BILLBOARD_STATE.BUILT),
      progress, level: 1, pips: { count: 0, strong: 0 }, scale: T.capitalScale };
  }
  if (tile.buildingId) {
    const level = Math.max(1, Math.floor(Number(tile.buildingLevel) || 1));
    return { portraitId: tile.buildingId, category: BUILDINGS[tile.buildingId]?.category ?? 'civil', capital: false, badgeId: null,
      state: tile.damaged ? BILLBOARD_STATE.DAMAGED : (uc ? BILLBOARD_STATE.UPGRADE : BILLBOARD_STATE.BUILT),
      progress, level, pips: pipsOf(level, T), scale: 1 };
  }
  if (uc?.buildingId) {
    return { portraitId: uc.buildingId, category: BUILDINGS[uc.buildingId]?.category ?? 'civil', capital: false, badgeId: null,
      state: BILLBOARD_STATE.CONSTRUCTION, progress, level: 1, pips: { count: 0, strong: 0 }, scale: 1 };
  }
  return null;
}

/**
 * Poziom szczegółu z odstępu pól na ekranie [px]: bok portretu rośnie płynnie z zoomem w klamrach min / max; poniżej
 * `dotBelowPx` zostaje kropka kategorii (pasmo `dotBandPx` = płynne przenikanie).
 * @returns {{mode:'none'|'dot'|'portrait', sizePx:number, dotPx:number, portraitAlpha:number, dotAlpha:number}}
 */
export function billboardLod(tilePx, T = BILLBOARD) {
  if (!(tilePx > 0)) return { mode: 'none', sizePx: 0, dotPx: 0, portraitAlpha: 0, dotAlpha: 0 };
  const f = smooth(T.dotBelowPx, T.dotBelowPx + T.dotBandPx, tilePx);
  return {
    mode: f > 0 ? 'portrait' : 'dot',
    sizePx: clamp(tilePx * T.sizePerTile, T.minPx, T.maxPx),
    dotPx: clamp(tilePx * 0.22, T.dotMinPx, T.dotMaxPx),
    portraitAlpha: f, dotAlpha: 1 - f,
  };
}

/** Krycie znacznika od kąta do kamery: za horyzontem / przy limbie 0, w paśmie `facingMin…facingFull` rośnie do 1. */
export function horizonAlpha(facing, front = true, T = BILLBOARD) {
  if (!front || !(facing > T.facingMin)) return 0;
  return smooth(T.facingMin, T.facingFull, facing);
}

/**
 * Lista rysowania jednej klatki. Kolejność malarska: wyżej na ekranie = dalej = najpierw; stolica zawsze na wierzchu.
 * @param {object} p
 * @param {object[]} p.tiles pola siatki (indeks = id pola)
 * @param {(i:number) => ({x:number, y:number, visible:boolean, facing:number}|null)} p.project rzut pola na ekran
 * @param {number} p.tilePx odstęp pól na ekranie w środku tarczy [px]
 * @param {number} [p.lodBias] mnożnik odległości dla LOD (podgląd `csDots()`: < 1 = jak z daleka); rozmiar portretu bez zmian
 * @returns {Array<{tile:number, x:number, y:number, alpha:number, mode:string, size:number, dot:number, portraitAlpha:number,
 *   dotAlpha:number, spec:object}>}
 */
export function buildBillboardList(p, T = BILLBOARD) {
  const out = [];
  const tiles = p.tiles ?? [];
  for (let i = 0; i < tiles.length; i++) {
    const spec = billboardSpecOf(tiles[i], T);
    if (!spec) continue;
    const pr = p.project(i);
    if (!pr) continue;
    const alpha = horizonAlpha(pr.facing, pr.visible !== false, T);
    if (alpha <= 0) continue;
    // Skrót perspektywiczny przy limbie: pole widziane z boku jest węższe — znacznik maleje razem z nim.
    const px = p.tilePx * Math.sqrt(clamp(pr.facing, 0, 1));
    const lod = billboardLod(px, T);
    if (lod.mode === 'none') continue;
    if (p.lodBias > 0 && p.lodBias !== 1) { const far = billboardLod(px * p.lodBias, T); lod.mode = far.mode; lod.portraitAlpha = far.portraitAlpha; lod.dotAlpha = far.dotAlpha; lod.dotPx = Math.max(far.dotPx, T.dotMaxPx); }
    const it = { tile: i, x: pr.x, y: pr.y, alpha, mode: lod.mode, size: lod.sizePx * spec.scale, dot: lod.dotPx,
      portraitAlpha: lod.portraitAlpha, dotAlpha: lod.dotAlpha, spec };
    if (spec.capital) { it.mode = 'portrait'; it.size = Math.max(T.capitalMinPx, it.size); it.portraitAlpha = 1; it.dotAlpha = 0; }
    out.push(it);
  }
  out.sort((a, b) => (a.spec.capital - b.spec.capital) || (a.y - b.y) || (a.tile - b.tile));
  return out;
}

/** Największy poziom atlasu dla źródła o boku `nativePx`: najmniejszy mip ≥ źródło, najwyżej 512 (128 → 128, 500 → 512). */
export function topMipFor(nativePx, T = BILLBOARD) {
  const m = [...T.mips].sort((a, b) => a - b);
  const n = Number(nativePx) || 0;
  for (const s of m) if (s >= n) return s;
  return m[m.length - 1];
}

/** Poziom atlasu dla portretu rysowanego na `devicePx` pikselach urządzenia: najmniejszy mip ≥ potrzeba, nie większy niż `top`. */
export function mipFor(devicePx, top, T = BILLBOARD) {
  const m = [...T.mips].filter(s => s <= top).sort((a, b) => a - b);
  for (const s of m) if (s >= devicePx) return s;
  return m[m.length - 1] ?? top;
}

/**
 * Finding 784 — kierunek środka pola siatki geo w układzie ciała (wektor jednostkowy) albo null (siatka płaska / pole spoza
 * siatki). Pole geo niesie swój numer w `q` (kodowanie przejściowe `(index, −1)`, D-CS-26).
 */
export function geoTileDirOf(grid, tile, out = [0, 0, 0]) {
  if (grid?.kind !== 'geo' || !tile) return null;
  const i = Number.isInteger(tile.index) ? tile.index : tile.q;
  let topo = null;
  try { topo = geodesicTopology(grid.n); } catch (e) { return null; }
  if (!Number.isInteger(i) || i < 0 || i >= topo.count) return null;
  out[0] = topo.cx[i]; out[1] = topo.cy[i]; out[2] = topo.cz[i];
  return out;
}

export const ColonyBillboardLogic = {
  BILLBOARD, BILLBOARD_STATE, BILLBOARD_COLORS, CAPITAL_BUILDING_ID, categoryCss, pipsOf, billboardSpecOf, billboardLod, horizonAlpha,
  buildBillboardList, topMipFor, mipFor, geoTileDirOf,
};
export default ColonyBillboardLogic;
