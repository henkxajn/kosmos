// ColonySphereHeroDebug — pomocniki konsoli kontroli kroku CS-7 (kula kolonii). Bez argumentów, bez cudzysłowów.
//
//   csSphere()     — stan kuli w oknie kolonii: rodzaj siatki aktywnej kolonii, liczba pól, tryb rysunku (gl / 2d), faza
//                    mapy (lod / cross / hero), auto-obrót, soczewka, liczba renderów. Okno kolonii nie musi być otwarte.
//   csSphereUnit() — stawia WŁASNĄ jednostkę piechoty na polu przy stolicy aktywnej kolonii (kula albo mapa 2D) — do
//                    sprawdzenia zaznaczania i rozkazu ruchu (prawy klik w pole).
//   csSphere2D()   — przełącza wymuszony widok 2D kuli (to, co zobaczy gracz bez WebGL); drugie wywołanie wraca do 3D.
//
// Importowalne pod node (bez THREE): czyta wyłącznie window.KOSMOS.

import { tileGraphOf } from '../map/TileGraph.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';

function activeColony() {
  const K = window.KOSMOS, cm = K?.colonyManager;
  const ov = K?.overlayManager?.overlays?.colony;
  const col = (ov?.visible ? ov._getColony?.() : null) ?? cm?.getColony?.(cm?.activePlanetId) ?? cm?.getColony?.(K?.homePlanet?.id) ?? null;
  return { K, ov, col };
}

export function csSphere() {
  const { ov, col } = activeColony();
  const grid = col?.grid ?? null;
  const info = ov?._sphere?.renderer?.info?.() ?? null;
  const out = {
    colony: col?.name ?? col?.planetId ?? null,
    grid: grid ? (grid.kind ?? 'flat') : 'none (opens with the colony screen)',
    tiles: grid?.tiles?.length ?? grid?.toArray?.().length ?? null,
    flag: window.KOSMOS?.gameConfig?.FEATURES?.colonySphere === true,
    sphereOnScreen: !!ov?._sphereActive,
    draw: info?.mode ?? null, fallbackReason: info?.fallbackReason ?? null, map: info?.mapPhase ?? null, rotation: info?.spin ?? null,
    lens: ov?._sphere?.lens ?? null, renders: info?.renders ?? null, canvas: info?.device ?? null,
  };
  console.log('[csSphere]', JSON.stringify(out));
  return out;
}

export function csSphereUnit() {
  const { K, col } = activeColony();
  const gum = K?.groundUnitManager;
  const grid = col?.grid;
  if (!gum || !grid) { console.warn('[csSphereUnit] open the colony screen first (no grid yet)'); return null; }
  const graph = tileGraphOf(grid);
  const tiles = graph.tiles();
  const cap = tiles.find(t => t.capitalBase) ?? tiles.find(t => t.buildingId) ?? graph.anyTile();
  const free = (t) => TERRAIN_TYPES[t.type]?.buildable && t.type !== 'ocean' && !gum.getUnitAt?.(col.planetId, t.q, t.r);
  const spot = graph.within(cap, 2).map(x => graph.tile(x) ?? x).find(t => t && t !== cap && free(t)) ?? cap;
  const unit = gum.createUnit('shock_infantry', col.planetId, spot.q, spot.r, { factionId: 'humanity', owner: 'player' });
  const out = { unit: unit?.id ?? null, tile: graph.idOf(spot), grid: grid.kind ?? 'flat' };
  console.log('[csSphereUnit]', JSON.stringify(out));
  if (K?.uiManager) K.uiManager._dirty = true;
  return out;
}

export function csSphere2D() {
  const { K, ov } = activeColony();
  const r = ov?._sphere?.renderer;
  if (!r) { console.warn('[csSphere2D] open a sphere colony first'); return null; }
  const on = !r._forced;
  r.forceFallback(on);
  if (K?.uiManager) K.uiManager._dirty = true;
  console.log('[csSphere2D]', on ? '2D view forced' : 'back to 3D');
  return on;
}

export function colonySphereHeroDebugHelpers() { return { csSphere, csSphereUnit, csSphere2D }; }
