// LatitudeBands — modyfikator ekonomiczny pasa szerokości (COLONY SPHERE, krok CS-2; D-CS-7)
//
// Pas pola daje `TileGraph.latitudeBand(ref)`; tu tylko liczby (dawniej wpisane w HexGrid.getLatitudeModifier):
//   biegun      — produkcja ×0.5, koszt budowy ×1.5
//   przedbiegun — produkcja ×0.7, koszt budowy ×1.25
//   równik      — ×1.0 / ×1.0
// Czytelnicy: BuildingSystem (_build — koszt, _calcBaseRates — produkcja), ColonyOverlay (etykieta pola).

import { LATITUDE_BAND } from '../map/TileGraph.js';

const MODIFIERS = Object.freeze({
  [LATITUDE_BAND.POLAR]:      Object.freeze({ production: 0.5, buildCost: 1.5,  label: '🧊 ×0.5' }),
  [LATITUDE_BAND.SUBPOLAR]:   Object.freeze({ production: 0.7, buildCost: 1.25, label: '🧊 ×0.7' }),
  [LATITUDE_BAND.EQUATORIAL]: Object.freeze({ production: 1.0, buildCost: 1.0,  label: null }),
});

/** Modyfikator pasa: {production, buildCost, label} (świeża kopia — wywołujący może ją zmieniać). */
export function latitudeModifierOf(band) {
  return { ...(MODIFIERS[band] ?? MODIFIERS[LATITUDE_BAND.EQUATORIAL]) };
}

/** Modyfikator bez kary (tryb RegionSystem albo kolonia bez siatki). */
export function neutralLatitudeModifier() {
  return latitudeModifierOf(LATITUDE_BAND.EQUATORIAL);
}

// ── Siatka geodezyjna (CS-5a, D-CS-7) ────────────────────────────────────────
// Docelowe udziały pól polarnych / przedbiegunowych per klasa rozmiaru siatki (klucze GRID_TILE_COUNTS). Zmierzone
// 2026-11-19 na dzisiejszych płaskich siatkach tapered (PlanetMapGenerator): planetoida 8×6, księżyc 12×8, hot_rocky
// 16×10, small_rocky = średnia rocky + ice przy masach 0.3/0.5/0.8/1/1.2/1.5 M⊕, large_rocky = rocky przy 2/3/5/8 M⊕.
// GeodesicTopology.latitudeCutoffs dobiera progi |y| środka pola najbliżej tych udziałów (klastry symetryczne).
export const GEO_LATITUDE_SHARES = Object.freeze({
  planetoid:   Object.freeze({ polar: 0.2222, subpolar: 0.3333 }),
  moon:        Object.freeze({ polar: 0.1250, subpolar: 0.1875 }),
  gas:         Object.freeze({ polar: 0.1250, subpolar: 0.1875 }),   // dziś gas 14×10 — siatki geo gazu dopiero w CS-11
  hot_rocky:   Object.freeze({ polar: 0.1154, subpolar: 0.1154 }),
  small_rocky: Object.freeze({ polar: 0.0984, subpolar: 0.0984 }),
  large_rocky: Object.freeze({ polar: 0.0674, subpolar: 0.0674 }),
  largest_cap: Object.freeze({ polar: 0.0674, subpolar: 0.0674 }),
});
