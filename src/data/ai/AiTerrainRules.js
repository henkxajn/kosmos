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

export const AI_TERRAIN_RULES = {
  mine:    { mode: 'hard', terrains: ['mountains'] },
  farm:    { mode: 'hard', terrains: ['plains'] },
  well:    { mode: 'hard', terrains: ['plains'] },
  factory: { mode: 'soft', terrains: ['plains', 'industrial_zones', 'tundra', 'desert', 'crater', 'forest'] },
  smelter: { mode: 'soft', terrains: ['plains', 'industrial_zones', 'tundra', 'desert', 'crater', 'forest'] },
  habitat: { mode: 'soft', terrains: ['plains', 'tundra', 'desert', 'crater', 'forest'] },
  // pozostałe budynki: brak reguły → dowolny buildowalny teren OK
};

/** Zwraca regułę terenu dla budynku ({ mode, terrains }) lub null. */
export function getTerrainRule(buildingId) {
  return AI_TERRAIN_RULES[buildingId] ?? null;
}

export default AI_TERRAIN_RULES;
