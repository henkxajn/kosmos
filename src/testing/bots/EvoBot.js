// ═══════════════════════════════════════════════════════════════
// EvoBot — RuleBot z evolvable weights
// ─────────────────────────────────────────────────────────────
// 10 wag liczbowych definiujących zachowanie. Tournament (Tournament.js)
// ewoluuje wagi przez seleckję + mutację.
// ═══════════════════════════════════════════════════════════════

import { BaseBot } from './BaseBot.js';
import { ACTION_TYPES } from '../actions/ActionAdapter.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { TECHS } from '../../data/TechData.js';

// Domyślne (pochodzą z ręcznie tuningowanego RuleBot)
export const DEFAULT_EVO_WEIGHTS = {
  food_threshold:      50,    // priorytet farm gdy food <
  water_threshold:     50,
  energy_min:          -2,
  housing_ratio:       0.8,
  research_prob:       0.4,   // szansa research per decyzja
  mine_min_pop:        3,
  lab_min_pop:         5,
  shipyard_min_pop:    8,
  expedition_prob:     0.4,
  upgrade_prob:        0.3,
  ship_prob:           0.3,
  factory_prob:        0.2,
};

/** Zakresy wag do losowania/mutacji: [min, max] */
export const WEIGHT_RANGES = {
  food_threshold:      [10, 150],
  water_threshold:     [10, 150],
  energy_min:          [-10, 5],
  housing_ratio:       [0.3, 1.2],
  research_prob:       [0, 1],
  mine_min_pop:        [1, 10],
  lab_min_pop:         [1, 15],
  shipyard_min_pop:    [3, 20],
  expedition_prob:     [0, 1],
  upgrade_prob:        [0, 1],
  ship_prob:           [0, 1],
  factory_prob:        [0, 1],
};

export class EvoBot extends BaseBot {
  constructor({ weights = DEFAULT_EVO_WEIGHTS, name = 'EvoBot' } = {}) {
    super({ name });
    this.weights = { ...DEFAULT_EVO_WEIGHTS, ...weights };
  }

  decideAction(obs, catalog) {
    const K = window.KOSMOS;
    const active = K?.colonyManager?.getColony?.(K?.colonyManager?._activePlanetId ?? K?.homePlanet?.id);
    if (!active) return { type: ACTION_TYPES.WAIT };

    const resSys = active.resourceSystem;
    const civSys = active.civSystem;
    const bSys = active.buildingSystem;
    const techSys = K.techSystem;
    const W = this.weights;

    const food = resSys?.getAmount?.('food') ?? 0;
    const water = resSys?.getAmount?.('water') ?? 0;
    const energyBalance = resSys?.energy?.balance ?? 0;
    const pop = civSys?.population ?? 0;
    const housing = civSys?.housingCapacity ?? 0;
    const research = resSys?.getAmount?.('research') ?? 0;
    const hasRocketry = techSys?.isResearched?.('rocketry') ?? false;

    const haveBuilding = (id) => {
      if (!bSys?._active) return false;
      for (const [, e] of bSys._active) {
        if ((e.building?.id ?? e.buildingId) === id) return true;
      }
      return false;
    };

    // R1: food
    if (food < W.food_threshold) {
      const a = this._findBuild(catalog, 'farm');
      if (a) return a;
    }
    // R2: water
    if (water < W.water_threshold) {
      const a = this._findBuild(catalog, 'well');
      if (a) return a;
    }
    // R3: energy
    if (energyBalance < W.energy_min) {
      const a = this._findBuild(catalog, 'solar_farm');
      if (a) return a;
    }
    // R4: housing
    if (pop >= housing * W.housing_ratio && pop >= 2) {
      const a = this._findBuild(catalog, 'habitat') ?? this._findBuild(catalog, 'residential_block');
      if (a) return a;
    }
    // R5: research
    if (Math.random() < W.research_prob) {
      const available = catalog.listResearchActions();
      if (available.length > 0) {
        const sorted = available
          .map(a => ({ action: a, cost: TECHS[a.techId]?.cost?.research ?? 1000 }))
          .sort((a, b) => a.cost - b.cost);
        return sorted[0].action;
      }
    }
    // R6: mine
    if (pop >= W.mine_min_pop && !haveBuilding('mine')) {
      const a = this._findBuild(catalog, 'mine');
      if (a) return a;
    }
    // R7: lab
    if (pop >= W.lab_min_pop && !haveBuilding('lab') && !haveBuilding('research_lab')) {
      const a = this._findBuild(catalog, 'lab') ?? this._findBuild(catalog, 'research_lab');
      if (a) return a;
    }
    // R8: launch_pad po rocketry
    if (hasRocketry && !haveBuilding('launch_pad')) {
      const a = this._findBuild(catalog, 'launch_pad');
      if (a) return a;
    }
    // R9: shipyard
    if (hasRocketry && pop >= W.shipyard_min_pop && !haveBuilding('shipyard')) {
      const a = this._findBuild(catalog, 'shipyard');
      if (a) return a;
    }
    // R10: expedition
    if (Math.random() < W.expedition_prob) {
      const exps = catalog.listExpeditionActions({ limit: 10 });
      if (exps.length > 0) {
        const recon = exps.find(e => e.missionType === 'recon');
        return recon ?? exps[0];
      }
    }
    // R11: ship build
    if (Math.random() < W.ship_prob) {
      const ships = catalog.listBuildShipActions();
      if (ships.length > 0) return ships[0];
    }
    // R12: upgrade
    if (Math.random() < W.upgrade_prob) {
      const ups = catalog.listUpgradeActions({ limit: 15 });
      if (ups.length > 0) return ups[Math.floor(Math.random() * ups.length)];
    }
    // R13: factory
    if (Math.random() < W.factory_prob) {
      const f = catalog.listFactoryActions();
      if (f.length > 0) return f[0];
    }
    return { type: ACTION_TYPES.WAIT };
  }

  _findBuild(catalog, buildingId) {
    const actions = catalog.listBuildActions({ limit: 80 });
    return actions.find(a => a.buildingId === buildingId) ?? null;
  }
}

/** Losowe wagi w zakresach WEIGHT_RANGES */
export function randomWeights() {
  const w = {};
  for (const [k, [min, max]] of Object.entries(WEIGHT_RANGES)) {
    w[k] = min + Math.random() * (max - min);
  }
  return w;
}

/** Mutacja wag (gaussian + clip) */
export function mutateWeights(weights, { rate = 0.2, sigma = 0.15 } = {}) {
  const out = { ...weights };
  for (const [k, [min, max]] of Object.entries(WEIGHT_RANGES)) {
    if (Math.random() < rate) {
      const range = max - min;
      const delta = (Math.random() - 0.5) * 2 * sigma * range;
      out[k] = Math.max(min, Math.min(max, (out[k] ?? min) + delta));
    }
  }
  return out;
}

/** Crossover dwóch osobników (uniform) */
export function crossoverWeights(a, b) {
  const out = {};
  for (const k of Object.keys(WEIGHT_RANGES)) {
    out[k] = Math.random() < 0.5 ? a[k] : b[k];
  }
  return out;
}
