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
import EntityManager from '../../core/EntityManager.js';

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

  /** Resolve: zamień koordy q/r na obiekt tile z aktywnego grida + semantic targetId dla ekspedycji */
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

    // Ekspedycja: jeśli oryginalny targetId nie istnieje w bieżącym układzie,
    // użyj _targetHint żeby znaleźć semantycznie odpowiednie ciało.
    // Dla starych skryptów bez hintu — stosuj defaulty per missionType.
    if (action.type === ACTION_TYPES.EXPEDITION) {
      const origExists = action.targetId && EntityManager.get?.(action.targetId);
      if (!origExists) {
        const hint = action._targetHint || this._defaultHintFor(action.missionType);
        const resolved = this._resolveSemanticTarget(hint, action.missionType, action.vesselId);
        if (resolved) out.targetId = resolved;
      }
      // Vessel hint — oryginalny v_5 pewnie nie istnieje; użyj pierwszego dostępnego.
      // Vessel.status = 'idle' po stworzeniu, 'on_mission' w trakcie misji.
      if (out.vesselId && !this._vesselAvailable(out.vesselId)) {
        const vm = window.KOSMOS?.vesselManager;
        const homeId = window.KOSMOS?.homePlanet?.id;
        const free = vm?.getAllVessels?.()?.find(v =>
          v.status === 'idle' && v.colonyId === homeId
        );
        if (free) out.vesselId = free.id;
      }
    }

    return out;
  }

  /** Znajdź semantycznie pasujące ciało. hint: { kind, planetType, rank, requireUnexplored, requireNoColony } */
  _resolveSemanticTarget(hint, missionType, vesselIdUnused) {
    const homePlanet = window.KOSMOS?.homePlanet;
    if (!homePlanet) return null;

    const colMgr = window.KOSMOS?.colonyManager;
    const existingColonyIds = new Set(colMgr?.getAllColonies?.()?.map(c => c.planetId) ?? []);

    const all = EntityManager.getAll?.() ?? [];
    const candidates = all.filter(e => {
      if (e.type === 'star') return false;
      if (e.id === homePlanet.id) return false;
      if (hint.kind && e.type !== hint.kind) return false;
      if (hint.planetType && e.planetType !== hint.planetType) return false;
      if (hint.requireUnexplored && e.explored) return false;
      if (hint.requireExplored && !e.explored) return false;
      if (hint.requireNoColony && existingColonyIds.has(e.id)) return false;
      return true;
    });

    if (candidates.length === 0) return null;

    // Najbliższe do domowej planety (Euclid w physics coords)
    const hx = homePlanet.physics?.x ?? 0;
    const hy = homePlanet.physics?.y ?? 0;
    let best = null, bestDist = Infinity;
    for (const e of candidates) {
      const ex = e.physics?.x ?? 0;
      const ey = e.physics?.y ?? 0;
      const d = Math.hypot(ex - hx, ey - hy);
      if (d < bestDist) { best = e; bestDist = d; }
    }
    return best?.id ?? null;
  }

  /** Default hint gdy skrypt nie ma _targetHint (stare nagrania). */
  _defaultHintFor(missionType) {
    if (missionType === 'colony' || missionType === 'colonize') {
      // Najpierw próbuj księżyc blisko (user w nagraniu kolonizował moon), potem rocky
      return { kind: 'moon', requireNoColony: true, requireExplored: true };
    }
    if (missionType === 'recon') {
      return { requireUnexplored: true };
    }
    if (missionType === 'mining' || missionType === 'scientific') {
      return { requireExplored: true };
    }
    return {};
  }

  _vesselAvailable(vesselId) {
    const vm = window.KOSMOS?.vesselManager;
    const v = vm?.getVessel?.(vesselId);
    return !!v && v.status === 'idle';
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
