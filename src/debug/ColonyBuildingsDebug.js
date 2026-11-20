// ColonyBuildingsDebug — pomocniki konsoli przeglądarki do kontroli kroku CS-9 (budynki-portrety na kuli kolonii, światła
// miast, ikony na mapie układu). Bez argumentów, bez cudzysłowów.
//
//   csCity()        — rozbudowuje pokazywaną (albo aktywną) kolonię geo: ~26 budynków wokół stolicy (z portretem PNG i bez),
//                     kilka poziomów (2, 3, 5, 7, 10), dwie budowy w toku (35 % i 70 %), jedna rozbudowa w toku, dwa budynki
//                     uszkodzone; dosypuje ludność do 60. Wołane ponownie niczego nie dokłada (kolonia już rozbudowana).
//   csCityRepair()  — zdejmuje znacznik uszkodzenia ze wszystkich pól kolonii.
//   csTint()        — przełącza wariant A/B barwy kategorii: cienki obrys pola (domyślny) ↔ podbarwione pole.
//   csDots()        — podgląd LOD: znaczniki jak z dużej odległości (kropki kategorii, stolica zostaje portretem) ↔ zwykłe.
//   csBuildings()   — stan: liczba portretów / kropek w ostatniej klatce, koszt przebiegu znaczników [ms], atlas, światła
//                     kuli i mapy układu, wariant barwy.
//   csNight()       — obraca kulę tak, by stolica stanęła na nocnym sierpie (światła miast); csDay() — z powrotem nad stolicę.
//
// Importowalne pod node (bez THREE): czyta wyłącznie window.KOSMOS.

import { BUILDINGS } from '../data/BuildingsData.js';
import { geodesicTopology } from '../map/GeodesicTopology.js';
import { syncTileBuildings } from '../utils/ColonyGrid.js';
import { hasBuildingTexture } from '../renderer/BuildingTextures.js';
import { BUILDING_TINT } from '../ui/ColonySphereOverlayLogic.js';
import { sunDirFor, dirOf, lonLatOf } from '../renderer/ColonySphereLogic.js';

const LAND = ['plains', 'forest', 'desert', 'tundra', 'mountains'];
const WANT = ['habitat', 'farm', 'mine', 'solar_farm', 'factory', 'research_station', 'well', 'smelter', 'launch_pad', 'shipyard',
  'free_market', 'trade_hub', 'data_center', 'observatory', 'nuclear_plant', 'defense_tower', 'barracks_lv1', 'fuel_refinery',
  'coal_plant', 'arcology_building', 'commodity_nexus', 'fusion_reactor', 'trade_beacon'];
const CITY_SIZE = 26;
const LEVELS = [2, 3, 5, 7, 10];
const NIGHT_MIN_FACING = 0.5;   // stolica na nocnym sierpie ma zostać dobrze widoczna (iloczyn kierunek pola · kierunek kamery)

function ctx() {
  const K = window.KOSMOS, cm = K?.colonyManager;
  const ov = K?.overlayManager?.overlays?.colony ?? null;
  const col = (ov?.visible ? ov._getColony?.() : null) ?? cm?.getColony?.(cm?.activePlanetId) ?? cm?.getColony?.(K?.homePlanet?.id) ?? null;
  return { K, cm, ov, col };
}

function resync(K, ov, col) {
  const b = col?.buildingSystem;
  try { syncTileBuildings(col.grid, b); } catch (e) { /* siatka bez synchronizacji */ }
  const cached = ov?._gridCache?.[col.planetId];
  if (cached && cached !== col.grid) { try { ov._syncTileBuildings?.(cached, b); } catch (e) { /* nic */ } }
  if (K?.uiManager) K.uiManager._dirty = true;
}

export function csCity() {
  const { K, col, ov } = ctx();
  const b = col?.buildingSystem, grid = col?.grid;
  if (!b || grid?.kind !== 'geo') { console.warn('[csCity] no geo colony (start a new game with the colonySphere flag ON)'); return null; }
  const tiles = grid.tiles, topo = geodesicTopology(grid.n);
  const cap = Math.max(0, tiles.findIndex((t) => t.capitalBase));
  const have = tiles.filter((t) => t.buildingId && !t.capitalBase).length;
  const out = { colony: col.planet?.name ?? col.planetId, placed: [], levels: [], constructions: [], upgrade: null, damaged: [] };
  if (have < CITY_SIZE - 4) {
    const free = tiles.map((t, i) => i).filter((i) => { const t = tiles[i]; return !t.capitalBase && !t.buildingId && !t.underConstruction && !t.pendingBuild && !t.isOccupied && LAND.includes(t.type); })
      .map((i) => [topo.distance(cap, i), i]).sort((x, y) => (x[0] - y[0]) || (x[1] - y[1])).map((e) => e[1]);
    const noPng = Object.keys(BUILDINGS).filter((id) => !BUILDINGS[id].isCapital && !WANT.includes(id) && !hasBuildingTexture(id)).slice(0, 4);   // bez portretu → znak kategorii
    const ids = [...noPng, ...WANT.filter((id) => BUILDINGS[id])];   // budynki bez portretu najbliżej stolicy — widać je od razu
    const sites = free.slice(0, Math.min(free.length, ids.length + 2));
    ids.forEach((id, k) => {
      const t = tiles[sites[k]];
      if (!t) return;
      try { b._activateBuilding(t.key, id, null, t.type, false); out.placed.push(id); } catch (e) { /* budynek nie do aktywacji tą drogą */ }
    });
    // dwie budowy w toku — prawdziwe wpisy kolejki (gra je dokończy)
    [[0.35, 'habitat'], [0.7, 'factory']].forEach(([f, id], k) => {
      const t = tiles[sites[ids.length + k]];
      if (!t || b._constructionQueue.has(t.key)) return;
      const buildTime = 4;
      b._constructionQueue.set(t.key, { buildingId: id, progress: buildTime * f, buildTime, tileType: t.type });
      t.underConstruction = { buildingId: id, progress: f, buildTime };
      out.constructions.push(`${id} ${Math.round(f * 100)}%`);
    });
    resync(K, ov, col);
    // poziomy, rozbudowa w toku, uszkodzenia — na już postawionych budynkach
    const built = tiles.filter((t) => t.buildingId && !t.capitalBase && b._active.has(t.key));
    LEVELS.forEach((lv, k) => { const t = built[k * 2]; const e = t && b._active.get(t.key); if (e) { e.level = lv; out.levels.push(`${t.buildingId} L${lv}`); } });
    const up = built[1];
    if (up && !b._constructionQueue.has(up.key)) {
      b._constructionQueue.set(up.key, { buildingId: up.buildingId, progress: 1.5, buildTime: 3, tileType: up.type, isUpgrade: true, targetLevel: (b._active.get(up.key)?.level ?? 1) + 1 });
      out.upgrade = up.buildingId;
    }
    for (const t of [built[3], built[7]]) if (t) { t.damaged = true; out.damaged.push(t.buildingId); }
    const civ = col.civSystem;
    if (civ && typeof civ.population === 'number' && civ.population < 60) civ.population = 60;
  }
  resync(K, ov, col);
  out.buildings = tiles.filter((t) => t.buildingId || t.capitalBase).length;
  console.log('[csCity]', JSON.stringify(out));
  return out;
}

export function csCityRepair() {
  const { K, col, ov } = ctx();
  let n = 0;
  for (const t of col?.grid?.tiles ?? []) if (t.damaged) { t.damaged = false; n++; }
  if (col) resync(K, ov, col);
  console.log('[csCityRepair]', n);
  return n;
}

export function csTint() {
  const { K, ov } = ctx();
  const sp = ov?._sphere;
  if (!sp) { console.warn('[csTint] open a sphere colony first'); return null; }
  sp.tint = sp.tint === BUILDING_TINT.FULL ? BUILDING_TINT.SUBTLE : BUILDING_TINT.FULL;
  if (K?.uiManager) K.uiManager._dirty = true;
  console.log('[csTint]', sp.tint);
  return sp.tint;
}

// Obrót kamery nad stolicę (`night` = false) albo tak, by stolica stanęła możliwie głęboko w nocy, wciąż dobrze widoczna.
export function csDots() {
  const { K, ov } = ctx();
  const sp = ov?._sphere;
  if (!sp) { console.warn('[csDots] open a sphere colony first'); return null; }
  sp.lodBias = sp.lodBias === 1 ? 0.1 : 1;
  if (K?.uiManager) K.uiManager._dirty = true;
  console.log('[csDots]', sp.lodBias === 1 ? 'portraits' : 'dots (LOD preview)');
  return sp.lodBias;
}

function turnCapital(night) {
  const { K, ov, col } = ctx();
  const sp = ov?._sphere, r = sp?.renderer;
  const cap = (col?.grid?.tiles ?? []).findIndex((t) => t.capitalBase);
  if (!r?.topo || cap < 0) { console.warn('[csNight] open a sphere colony first'); return null; }
  const c = [r.topo.cx[cap], r.topo.cy[cap], r.topo.cz[cap]];
  const [lon0, lat0] = lonLatOf(c[0], c[1], c[2]);
  let best = { d: 0, sun: 1 };
  if (night) {
    for (let d = -2.2; d <= 2.2; d += 0.05) {
      const view = { ...r.view, lon: lon0 + d, lat: lat0 };
      const cam = dirOf(view.lon, view.lat), sun = sunDirFor(view, null, r.tuning);
      const facing = c[0] * cam[0] + c[1] * cam[1] + c[2] * cam[2], nl = c[0] * sun[0] + c[1] * sun[1] + c[2] * sun[2];
      if (facing >= NIGHT_MIN_FACING && nl < best.sun) best = { d, sun: nl };
    }
  }
  r.rotateBy(lon0 + best.d - r.view.lon, lat0 - r.view.lat);
  if (K?.uiManager) K.uiManager._dirty = true;
  const out = { capital: cap, turned: +best.d.toFixed(2), capitalSunDot: +best.sun.toFixed(2) };
  console.log(night ? '[csNight]' : '[csDay]', JSON.stringify(out));
  return out;
}
export function csNight() { return turnCapital(true); }
export function csDay() { return turnCapital(false); }

export function csBuildings() {
  const { K, ov, col } = ctx();
  const sp = ov?._sphere ?? null;
  const tiles = col?.grid?.tiles ?? [];
  const out = {
    colony: col?.planet?.name ?? col?.planetId ?? null, grid: col?.grid?.kind ?? null,
    buildings: tiles.filter((t) => t.buildingId || t.capitalBase).length, constructions: tiles.filter((t) => t.underConstruction).length,
    damaged: tiles.filter((t) => t.damaged && t.buildingId).length,
    sphere: sp ? sp.markerInfo() : null, sphereRenderMs: sp?.renderer?.info?.().renderMsMedian ?? null,
    hero: sp?.renderer ? { cityLights: sp.renderer.info().cityLights, cityMesh: sp.renderer.info().cityMesh } : null,
    systemMap: K?.threeRenderer?._cityLights?.info?.() ?? null,
    mapIcons: [...(K?.threeRenderer?._colonyMarkers?._markers?.values?.() ?? [])].length,
  };
  console.log('[csBuildings]', JSON.stringify(out));
  return out;
}

export function colonyBuildingsDebugHelpers() { return { csCity, csCityRepair, csTint, csDots, csBuildings, csNight, csDay }; }
