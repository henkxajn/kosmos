// ═══════════════════════════════════════════════════════════════
// AiTerrainRules — współdzielone reguły terenu dla AI (Industrialist)
// ───────────────────────────────────────────────────────────────
// Jedno źródło prawdy używane przez DWA miejsca, żeby się nie rozjechały:
//   - EmpireColonyBootstrap._placeBuildingSmart  (handicap startowy)
//   - ColonyAutoExpander._findFreeTile           (runtime auto-rozbudowa)
//
// Conduct gracza z nagrań: kopalnie tylko w górach, farmy/studnie tylko na
// równinach (HARD). Fabryki/huty/habitaty preferują tereny ≠ wasteland (SOFT).
//
// mode:
//   'hard' — twardy filtr: budynek tylko na tile.type ∈ terrains[]. Fallback do
//            dowolnego buildowalnego hexa DOPIERO gdy żaden hex z listy nie jest
//            wolny (nie blokuj bootstrapu/rozbudowy — loguj warning).
//   'soft' — preferencja: +score dla terrains[], inne tereny też akceptowalne.
//
// Uwaga: 'industrial_zones' nie istnieje (jeszcze) w TERRAIN_TYPES — zostaje w
//   liście soft jako forward-compat (po prostu nigdy nie dopasuje hexa).
// ═══════════════════════════════════════════════════════════════

import { LATITUDE_BAND } from '../../map/TileGraph.js';

export const AI_TERRAIN_RULES = {
  mine:    { mode: 'hard', terrains: ['mountains'] },
  farm:    { mode: 'hard', terrains: ['plains'] },
  well:    { mode: 'hard', terrains: ['plains'] },
  factory: { mode: 'soft', terrains: ['plains', 'industrial_zones', 'tundra', 'desert', 'crater', 'forest'] },
  smelter: { mode: 'soft', terrains: ['plains', 'industrial_zones', 'tundra', 'desert', 'crater', 'forest'] },
  habitat: { mode: 'soft', terrains: ['plains', 'tundra', 'desert', 'crater', 'forest'] },

  // ── Budynki autonomiczne (drop z cargo / found_outpost / bootstrap) ─────────
  // Bez reguły lądowały na pierwszym wolnym hexie = biegun (penalty prod ×0.5).
  // Solarne preferują nasłonecznione tereny (desert/plains); polar penalty w
  //   scoringu (autoPlaceBuilding / _findFreeTile) sam dociąga je ku równikowi.
  autonomous_solar_farm: { mode: 'soft', terrains: ['desert', 'plains'] },
  // Kopalnie (orbitalna też) — twardo góry/krater, jak naziemny `mine`.
  autonomous_mine:       { mode: 'hard', terrains: ['mountains', 'crater'] },
  orbital_mine:          { mode: 'hard', terrains: ['mountains', 'crater'] },
  // Spaceport — jakikolwiek sensowny teren, byle nie biegun (polar penalty).
  autonomous_spaceport:  { mode: 'soft', terrains: ['plains', 'desert', 'tundra', 'crater', 'forest'] },

  // ai_nexus / warp_beacon / jump_gate — sensowny default = brak reguły:
  //   dowolny buildowalny hex, a polar penalty w scoringu i tak unika biegunów.
  //   (Nie blokujemy ich twardym terenem — to budynki strategiczne late-game.)
};

/** Zwraca regułę terenu dla budynku ({ mode, terrains }) lub null. */
export function getTerrainRule(buildingId) {
  return AI_TERRAIN_RULES[buildingId] ?? null;
}

// ── Kara polarna w scoringu wyboru pola (CS-2: jeden kanon zamiast trzech kopii) ──
// Czytelnicy: BuildingSystem.autoPlaceBuilding, ColonyAutoExpander._findFreeTile,
// EmpireColonyBootstrap._placeBuildingSmart. Odpowiada modyfikatorowi pasa (×0.5 → −5, ×0.7 → −2).
export const AI_POLAR_PENALTY = Object.freeze({
  [LATITUDE_BAND.POLAR]:      -5,
  [LATITUDE_BAND.SUBPOLAR]:   -2,
  [LATITUDE_BAND.EQUATORIAL]:  0,
});

/** Kara polarna pola (punkty scoringu ≤ 0) z pasa szerokości jego grafu. */
export function aiPolarPenalty(graph, tile) {
  return AI_POLAR_PENALTY[graph.latitudeBand(tile)];
}

export default AI_TERRAIN_RULES;
