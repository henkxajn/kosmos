// ColonyTilePosLogic — pozycje pól w UI kolonii przez TileGraph (ARC COLONY SPHERE, krok CS-7 część B).
//
// Miejsca UI, które dotąd same składały współrzędne pola (napisy „(q, r)", awaryjne (0, 0), cel rozkazu ruchu), czytają je
// stąd: na siatce płaskiej wynik jest IDENTYCZNY jak dotąd, na kuli (pole = indeks, współrzędna przejściowa (i, −1),
// D-CS-26) napis pokazuje numer pola, a pozycje awaryjne i cele pochodzą z grafu ciała.

import { GEO_TILE_R } from '../map/TileGraph.js';

/** Czy pozycja jest polem kuli (współrzędna przejściowa D-CS-26). */
export function isGeoPos(pos) { return !!pos && pos.r === GEO_TILE_R; }

/**
 * Napis pozycji pola do komunikatów: płaska „q<sep>r" (jak dotąd), kula „#<numer pola>". Nawiasy dodaje wołający.
 * @param {{q:number, r:number}} pos
 * @param {string} [sep] separator współrzędnych płaskich (',' albo ', ' — jak w dotychczasowym napisie)
 */
export function tilePosLabel(pos, sep = ',') {
  if (isGeoPos(pos)) return `#${pos.q}`;
  return `${pos?.q}${sep}${pos?.r}`;
}

/**
 * Pole wyładunku jednostki na ciele: własne pole jednostki, gdy istnieje w grafie ciała; inaczej dowolne pole grafu
 * (płaska: (0, 0) — jak dotychczasowe `unit.q ?? 0, unit.r ?? 0`; kula: pole 0, a nie nieistniejące (0, 0)).
 * @returns {{q:number, r:number}}
 */
export function unloadPosFor(unit, graph) {
  if (graph?.grid?.kind !== 'geo') return { q: unit?.q ?? 0, r: unit?.r ?? 0 };
  const own = (Number.isFinite(unit?.q) && unit?.r === GEO_TILE_R) ? graph.tile(unit) : null;
  const t = own ?? graph.anyTile();
  return t ? { q: t.q, r: t.r } : { q: 0, r: GEO_TILE_R };
}

/**
 * Cel rozkazu ruchu z klikniętego pola: współrzędne pola WZIĘTE Z GRAFU ciała (id pola → pole), nie z obiektu kliknięcia.
 * null, gdy pole nie należy do grafu.
 */
export function moveTargetFor(graph, tile) {
  if (!tile) return null;
  if (graph?.grid?.kind !== 'geo') return { q: tile.q, r: tile.r };
  const t = graph.tile(graph.idOf(tile));
  return t ? { q: t.q, r: t.r } : null;
}
