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
