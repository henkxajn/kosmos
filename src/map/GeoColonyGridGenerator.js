// GeoColonyGridGenerator — siatka geodezyjna kolonii z powierzchni ciała (ARC COLONY SPHERE, krok CS-5a; D-CS-3,
// D-CS-8, D-CS-9, D-CS-16).
//
//  • Rozmiar: klasa rozmiaru (BodyArchetypeLogic.gridClassFor) → GRID_TILE_COUNTS (D-CS-8, jedna tabela) → n.
//    FEATURES.largestHexMaps → large_rocky dostaje pułap `largest_cap` (362).
//  • Teren pola = classify(evalAt(środek pola)).terrain — jeden z 10 terenów rozgrywki (D-CS-3). Ścieżka rozgrywki:
//    tylko arytmetyka (środki z GeodesicTopology, evalAt bez trygonometrii, D-CS-16).
//  • Anomalie: ta sama liczba i ten sam rzut rzadkości co płaski generator, ale kandydaci w kolejności: PIĘCIOKĄTY
//    (potasowane), potem reszta (potasowana) — pięciokąty to „węzły anomalii" (D-CS-9). Losowanie z surfaceSeed
//    (nie z `planet.id`, który zależy od kolejności tworzenia encji — ryzyko §5.2).
//  • Bez efektów polarnych płaskiego generatora — czapy lodowe daje już pole powierzchni (kanał t).
//  • Nieuprawnione ciało (gaz, brak archetypu / ziarna) → null: wołający zostaje przy płaskiej siatce.

import { GeodesicGrid } from './GeodesicGrid.js';
import { geodesicTopology, geodesicNForCount } from './GeodesicTopology.js';
import { tileGraphOf } from './TileGraph.js';
import { GRID_TILE_COUNTS, ARCHETYPE_BY_ID } from '../data/BodyArchetypes.js';
import { gridClassFor, planetoidPaletteOf } from '../utils/BodyArchetypeLogic.js';
import { evalAt, classify, seaLevelOf } from '../utils/SurfaceField.js';
import { getEligibleAnomalies, ANOMALIES } from '../data/AnomalyData.js';
import { getEffectivePlanetType } from '../utils/EntityUtils.js';
import { mixSeed } from '../utils/SeedMath.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

const ANOMALY_SALT = 0x5a17c0de;   // sól strumienia anomalii (≠ sole SurfaceField / BodyArchetypeLogic)
const SURFACE_KINDS = ['planet', 'moon', 'planetoid'];

// Archetyp powierzchni i parametry pola — ta sama reguła co SurfaceCache.surfaceArchetypeOf / surfaceParamsOf (keeper
// G7e porównuje), bez importu SurfaceCache (EventBus / EntityManager nie wchodzą do warstwy mapy).
export function geoArchetypeOf(body) {
  if (!SURFACE_KINDS.includes(body?.type) || !Number.isFinite(body?.surfaceSeed)) return null;
  const arch = ARCHETYPE_BY_ID[body?.bodyArchetype];
  return arch && arch.family !== 'gas' ? arch : null;
}
export function geoSurfaceParamsOf(body) {
  return { waterCoverage: body?.waterCoverage ?? null, palette: body?.type === 'planetoid' ? planetoidPaletteOf(body) : null };
}

/**
 * Specyfikacja siatki geo ciała albo null (ciało nieuprawnione).
 * @returns {{n:number, count:number, gridClass:string, arch:object, params:object}|null}
 */
export function geoGridSpecFor(body, { largestHexMaps = GAME_CONFIG.FEATURES.largestHexMaps === true } = {}) {
  const arch = geoArchetypeOf(body);
  if (!arch) return null;
  let gridClass = gridClassFor(arch.id, body);
  if (largestHexMaps && gridClass === 'large_rocky') gridClass = 'largest_cap';
  const count = GRID_TILE_COUNTS[gridClass];
  const n = geodesicNForCount(count);
  if (!n) return null;
  return { n, count, gridClass, arch, params: geoSurfaceParamsOf(body) };
}

// mulberry32 z ziarna (jak makePRNG płaskiego generatora).
function prng(seed) {
  let s = seed >>> 0;
  return function rand() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Teren każdego pola siatki n dla ciała (tablica stringów w kolejności indeksów) — czysta funkcja spec. */
export function geoTerrainOf(body, spec) {
  const topo = geodesicTopology(spec.n);
  const seed = body.surfaceSeed >>> 0;
  const sea = seaLevelOf(seed, spec.arch, spec.params);
  const out = new Array(topo.count);
  for (let i = 0; i < topo.count; i++) {
    const s = evalAt(seed, spec.arch, spec.params, topo.cx[i], topo.cy[i], topo.cz[i]);
    out[i] = classify(s, spec.arch, sea).terrain;
  }
  return out;
}

/**
 * Siatka geo kolonii dla ciała (null = nieuprawnione → płaska).
 * @param {object} body planeta / księżyc / planetoida z `bodyArchetype` i `surfaceSeed`
 * @param {boolean} [homeWorld] true → wszystkie pola odkryte (jak płaski generator)
 */
export function generateGeoGrid(body, homeWorld = false, opts = {}) {
  const spec = geoGridSpecFor(body, opts);
  if (!spec) return null;
  const grid = new GeodesicGrid(spec.n, { gridClass: spec.gridClass });
  const terrain = geoTerrainOf(body, spec);
  for (let i = 0; i < grid.count; i++) grid.tiles[i].type = terrain[i];
  placeGeoAnomalies(grid, body);
  if (!homeWorld) for (const t of grid.tiles) t.explored = false;
  return grid;
}

/** Anomalie: pięciokąty najpierw (D-CS-9), liczba i rzadkość jak w PlanetMapGenerator._placeAnomalies. */
export function placeGeoAnomalies(grid, body) {
  const effectiveType = getEffectivePlanetType(body);
  const maxAnomalies = effectiveType === 'planetoid' ? 2 : effectiveType === 'moon' ? 3 : 5;
  const rand = prng(mixSeed(((body.surfaceSeed >>> 0) ^ ANOMALY_SALT) >>> 0));
  const graph = tileGraphOf(grid);
  const free = graph.tiles().filter(t => t.strategicResource === null && t.anomaly === null && !t.buildingId);
  const pent = free.filter(t => graph.isPentagon(t));
  const rest = free.filter(t => !graph.isPentagon(t));
  const order = [...shuffle(pent, rand), ...shuffle(rest, rand)];
  let placed = 0;
  for (const tile of order) {
    if (placed >= maxAnomalies) break;
    const eligible = getEligibleAnomalies(tile.type, body);
    if (eligible.length === 0) continue;
    for (const anomalyId of eligible) {
      if (rand() < ANOMALIES[anomalyId].rarity) { tile.anomaly = anomalyId; placed++; break; }
    }
  }
  return placed;
}
