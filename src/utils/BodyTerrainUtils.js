// BodyTerrainUtils — predykcja terenów ciała niebieskiego
//
// Replikuje logikę PlanetMapGenerator._calcWeights() bez generowania mapy.
// Zwraca Set terenów, które ciało prawdopodobnie posiada.
// Używane do filtrowania budynków w OutpostBuildingPicker.

import { TERRAIN_TYPES } from '../map/HexTile.js';
import { getEffectivePlanetType } from './EntityUtils.js';

// ── Bazowe wagi per typ planety (kopia z PlanetMapGenerator) ────────────────
function _baseWeights(planetType) {
  switch (planetType) {
    case 'hot_rocky':
      return { volcano: 25, desert: 40, mountains: 20, wasteland: 10, crater: 5 };
    case 'ice':
      return { ice_sheet: 50, tundra: 25, mountains: 15, crater: 5, wasteland: 5 };
    case 'gas':
      return { desert: 40, wasteland: 35, mountains: 15, crater: 10 };
    case 'rocky':
    default:
      return { plains: 25, mountains: 18, forest: 18, desert: 10, ocean: 12, tundra: 8, crater: 5, wasteland: 4 };
  }
}

/**
 * Zwraca Set terenów, które ciało prawdopodobnie posiada.
 * Replikuje PlanetMapGenerator._calcWeights() (linie 114-193).
 * @param {object} body — encja ciała niebieskiego
 * @returns {Set<string>} — np. Set(['desert','mountains','crater','wasteland','volcano'])
 */
export function getBodyTerrains(body) {
  const temp     = body.surface?.temperature ?? 20;
  const hasWater = body.surface?.hasWater    ?? false;
  const life     = body.lifeScore            ?? 0;
  const comp     = body.composition          ?? {};
  const atmo     = body.atmosphere           ?? 'none';
  const type     = getEffectivePlanetType(body);

  const base = _baseWeights(type);

  // Modyfikatory temperatury
  if (temp > 80) {
    base.desert  = (base.desert  ?? 0) + 20;
    base.volcano = (base.volcano ?? 0) + 10;
    base.forest  = 0;
    base.ocean   = 0;
  } else if (temp > 40) {
    base.desert  = (base.desert  ?? 0) + 10;
    base.forest  = (base.forest  ?? 0) - 5;
  } else if (temp < -30) {
    base.tundra    = (base.tundra    ?? 0) + 20;
    base.ice_sheet = (base.ice_sheet ?? 0) + 15;
    base.plains    = Math.max(0, (base.plains ?? 0) - 15);
    base.forest    = 0;
    base.ocean     = 0;
  } else if (temp < 0) {
    base.tundra = (base.tundra ?? 0) + 10;
    base.plains = Math.max(0, (base.plains ?? 0) - 5);
  }

  // Modyfikatory wody
  if (hasWater && atmo !== 'none') {
    base.ocean = (base.ocean ?? 0) + 10;
  } else {
    base.ocean = 0;
  }

  // Modyfikatory życia
  if (life > 80) {
    base.forest    = (base.forest    ?? 0) + 15;
    base.plains    = (base.plains    ?? 0) + 10;
    base.ocean     = (base.ocean     ?? 0) + 5;
    base.wasteland = Math.max(0, (base.wasteland ?? 0) - 10);
  } else if (life > 40) {
    base.forest = (base.forest ?? 0) + 8;
    base.plains = (base.plains ?? 0) + 5;
  } else if (life === 0) {
    base.forest = 0;
  }

  // Modyfikatory składu chemicznego
  const h2o = comp.H2O ?? 0;
  const fe  = comp.Fe  ?? 0;
  if (h2o > 20) {
    base.ocean     = (base.ocean     ?? 0) + 8;
    base.ice_sheet = (base.ice_sheet ?? 0) + 5;
  }
  if (fe > 25) {
    base.mountains = (base.mountains ?? 0) + 8;
    base.crater    = (base.crater    ?? 0) + 3;
  }

  // Zbierz tereny z wagą > 0
  const terrains = new Set();
  for (const [key, weight] of Object.entries(base)) {
    if (weight > 0) terrains.add(key);
  }
  return terrains;
}

/**
 * Sprawdź czy budynek może być postawiony na ciele z danymi terenami.
 * @param {object} bDef — definicja budynku z BuildingsData
 * @param {Set<string>} bodyTerrains — zbiór terenów ciała (z getBodyTerrains)
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function canPlaceBuildingOnBody(bDef, bodyTerrains) {
  if (!bDef) return { ok: false, reason: 'noBuilding' };

  // terrainAny = true → pasuje wszędzie
  if (bDef.terrainAny) return { ok: true, reason: null };

  // terrainOnly → wymaga konkretnych terenów
  if (bDef.terrainOnly && bDef.terrainOnly.length > 0) {
    for (const t of bDef.terrainOnly) {
      if (bodyTerrains.has(t)) return { ok: true, reason: null };
    }
    // Szczegółowy reason
    if (bDef.terrainOnly.includes('volcano') && !bodyTerrains.has('volcano')) {
      return { ok: false, reason: 'noVolcano' };
    }
    return { ok: false, reason: 'noTerrain' };
  }

  // Sprawdź po kategorii budynku → allowedCategories terenów
  const cat = bDef.category;
  if (!cat) return { ok: true, reason: null }; // brak kategorii → pasuje

  for (const terrain of bodyTerrains) {
    const tDef = TERRAIN_TYPES[terrain];
    if (!tDef || !tDef.buildable) continue;
    if (tDef.allowedCategories.includes(cat)) return { ok: true, reason: null };
  }

  // Szczegółowe powody
  if (cat === 'food') {
    // Farma/studnia — sprawdź czy brak plains/forest (atmosfera)
    if (!bodyTerrains.has('plains') && !bodyTerrains.has('forest')) {
      return { ok: false, reason: 'noAtmosphere' };
    }
  }
  return { ok: false, reason: 'noTerrain' };
}
