// Barwy kategorii budynków — jedno źródło dla okna kolonii (pasek budynków, panel pola) i kuli kolonii (CS-7:
// podbarwienie pól z budynkami). Wartości przeniesione 1:1 z ColonyOverlay (`CAT_COLORS`).

export const BUILDING_CATEGORY_COLORS = Object.freeze({
  mining: '#cc9944', energy: '#ffdd44', food: '#44cc66', population: '#4488ff',
  research: '#cc66ff', space: '#8888ff', military: '#ff6644', market: '#44ddcc',
  civil: '#ddaa44',
});

/** Barwa kategorii bez własnego wpisu (synthetic, governance, infrastructure…) na kuli kolonii. */
export const BUILDING_CATEGORY_FALLBACK = '#9fb4c8';
