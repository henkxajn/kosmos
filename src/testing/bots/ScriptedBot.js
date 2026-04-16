// ═══════════════════════════════════════════════════════════════
// ScriptedBot — odtwarza sekwencję akcji z JSON
// ─────────────────────────────────────────────────────────────
// Format skryptu:
//   {
//     "name": "crash_repro_example",
//     "description": "...",
//     "fallback": "idle" | "random" | "rule",   // co robić po wyczerpaniu
//     "actions": [
//       { "atCivYear": 10, "action": { "type": "research", "techId": "metallurgy" } },
//       { "atCivYear": 20, "action": { "type": "build", "tileQ": 5, "tileR": 3, "buildingId": "mine" } },
//       { "atCivYear": 30, "action": { "type": "build", "buildingId": "shipyard" } }  // bez Q/R → pierwszy wolny tile
//     ]
//   }
// Używane dla: regression tests (odtwórz crash'a) + hand-designed stress tests.
// ═══════════════════════════════════════════════════════════════

import { BaseBot } from './BaseBot.js';
import { ACTION_TYPES } from '../actions/ActionAdapter.js';
import { RandomBot } from './RandomBot.js';
import { RuleBot } from './RuleBot.js';

export class ScriptedBot extends BaseBot {
  constructor({ script, fallback = 'idle' } = {}) {
    super({ name: 'ScriptedBot' });
    this.script = script ?? { actions: [] };
    this.fallback = fallback;
    this._executed = new Set(); // indeksy wykonanych akcji
    this._fallbackBot = null;
    if (fallback === 'random') this._fallbackBot = new RandomBot();
    else if (fallback === 'rule') this._fallbackBot = new RuleBot();
  }

  decideAction(obs, catalog) {
    const civYear = obs.civYear;

    // Znajdź pierwszą nie-wykonaną akcję z atCivYear <= currentCivYear
    const actions = this.script?.actions ?? [];
    for (let i = 0; i < actions.length; i++) {
      if (this._executed.has(i)) continue;
      const entry = actions[i];
      if ((entry.atCivYear ?? 0) > civYear) continue;
      // Wykonaj
      this._executed.add(i);
      const resolved = this._resolveAction(entry.action, catalog);
      if (resolved) return resolved;
    }

    // Fallback
    if (this._fallbackBot) return this._fallbackBot.decideAction(obs, catalog);
    return { type: ACTION_TYPES.WAIT };
  }

  /** Resolve: zamień koordy q/r na obiekt tile z aktywnego grida */
  _resolveAction(action, catalog) {
    if (!action || !action.type) return null;
    const out = { ...action };

    // Jeśli akcja wymaga tile — zresolvuj z q/r
    if ([ACTION_TYPES.BUILD, ACTION_TYPES.UPGRADE, ACTION_TYPES.DEMOLISH].includes(action.type)) {
      if (!out.tile) {
        const K = window.KOSMOS;
        const active = K?.colonyManager?.getColony?.(K?.colonyManager?._activePlanetId ?? K?.homePlanet?.id);
        if (!active?.grid) return null;
        if (action.tileQ != null && action.tileR != null) {
          // Wyraźne koordy
          out.tile = active.grid.get?.(action.tileQ, action.tileR) ?? active.grid._map?.get?.(`${action.tileQ},${action.tileR}`);
        } else if (action.tileKey) {
          out.tile = active.grid.getByKey?.(action.tileKey) ?? active.grid._map?.get?.(action.tileKey);
        } else {
          // Auto-resolve: pierwszy legalny tile dla tego budynku
          const listCat = action.type === ACTION_TYPES.BUILD
            ? catalog.listBuildActions({ limit: 50 }).filter(a => a.buildingId === action.buildingId)
            : catalog.listUpgradeActions({ limit: 50 });
          if (listCat.length > 0) out.tile = listCat[0].tile;
        }
      }
    }

    return out;
  }

  /** Reset executed flags (do ponownego uruchomienia skryptu) */
  reset() {
    this._executed.clear();
  }
}

/** Statyczny helper do ładowania skryptu z JSON */
ScriptedBot.fromJSON = function (jsonObj, fallback = 'idle') {
  return new ScriptedBot({ script: jsonObj, fallback });
};
