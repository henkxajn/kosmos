// EconAI — decyzje ekonomiczne/ekspansja imperium (Faza 7)
//
// Akcje:
//   colonize          — zajmij pobliski niczyj system (abstract, add colony, mark galaxyData)
//   build_production  — zwiększ empire.resources.production (symuluje budowę infrastruktury)
//
// Colonize stopniowo zwiększa ekspansję — archetype.expansion wysoki → wiele kolonii szybko.

import { UtilityAI } from './UtilityAI.js';

const COLONIZE_COST = 20;      // production zużyte na kolonizację
const MAX_COLONIZE_RANGE_LY = 15;

export class EconAI {
  static tick(empireId) {
    return UtilityAI.decide(empireId, ACTIONS, 'econ');
  }
}

const ACTIONS = [
  {
    id: 'colonize',
    score(ctx) {
      const { empire, personality, galaxyData } = ctx;
      const production = empire.resources?.production ?? 0;
      if (production < COLONIZE_COST) return 0;
      if (!galaxyData?.systems) return 0;

      const candidates = this._findColonizationTargets(ctx);
      if (candidates.length === 0) return 0;

      const expansion = personality.expansion ?? 0.5;
      const colonyCount = empire.colonies?.length ?? 1;
      // Diminishing returns — pierwsze kolonie warte więcej
      const needFactor = Math.max(0.2, 1.0 - colonyCount * 0.12);

      return 40 * expansion * needFactor;
    },
    execute(ctx) {
      const { empire, empireReg } = ctx;
      const production = empire.resources?.production ?? 0;
      if (production < COLONIZE_COST) return;

      const candidates = this._findColonizationTargets(ctx);
      if (candidates.length === 0) return;

      // Zajmij najbliższy niczyj system
      const target = candidates[0];

      empireReg.updateResource(empire.id, 'production', -COLONIZE_COST, 'ai_colonize_cost');
      empireReg.addColony(empire.id, target.id, null);
      // Zaznacz galaxyData
      target.empireId = empire.id;
    },

    _findColonizationTargets(ctx) {
      const { empire, galaxyData } = ctx;
      if (!galaxyData?.systems) return [];
      const home = galaxyData.systems.find(s => s.id === empire.homeSystemId);
      if (!home) return [];

      return galaxyData.systems
        .filter(s => !s.isHome)
        .filter(s => !s.empireId)  // niczyj
        .map(s => {
          const dx = (s.x ?? 0) - (home.x ?? 0);
          const dy = (s.y ?? 0) - (home.y ?? 0);
          const dz = (s.z ?? 0) - (home.z ?? 0);
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          return { ...s, _dist: d };
        })
        .filter(s => s._dist <= MAX_COLONIZE_RANGE_LY)
        .sort((a, b) => a._dist - b._dist);
    },
  },

  {
    id: 'build_production',
    score(ctx) {
      const { empire } = ctx;
      const production = empire.resources?.production ?? 0;
      // Zawsze jakiś niski score — tak żeby imperium rosło gdy nie ma nic lepszego do roboty
      // Ale z malejącą użytecznością — production > 150 prawie zerowy
      if (production >= 150) return 5;
      return 15 * (1 - production / 150);
    },
    execute(ctx) {
      const { empire, empireReg } = ctx;
      // +5 production
      empireReg.updateResource(empire.id, 'production', 5, 'ai_build_production');
    },
  },
];
