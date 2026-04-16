// ═══════════════════════════════════════════════════════════════
// RuleBot v2 — predykcyjny bot z bogatym contextem
// ─────────────────────────────────────────────────────────────
// Zamiast reagować na stan aktualny, przewiduje potrzeby:
//   - food/water rates per year (nie tylko bieżący amount)
//   - housing vs pop growth trajectory
//   - commodity shortages (żeby budować factory gdy brakuje inputów do budynków)
// Priority-ordered rules: pierwsza która trafia → akcja.
// ═══════════════════════════════════════════════════════════════

import { BaseBot } from './BaseBot.js';
import { ACTION_TYPES } from '../actions/ActionAdapter.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { TECHS } from '../../data/TechData.js';

const DEFAULT_PERSONALITY = {
  aggression: 0.5, expansion: 0.5, science: 0.5, trade: 0.5, defense: 0.5,
};

// Tech których warto szukać jako priority — odblokowują kluczowe budynki
const TECH_PRIORITY = [
  'metallurgy', 'basic_power', 'basic_chemistry', 'agriculture',  // T1 fundamenty
  'rocketry',                                                      // odblokowuje ekspedycje
  'industrial_revolution', 'advanced_chemistry',                   // commodities T2
  'colonization',                                                  // kolonie
  'orbital_infrastructure',                                        // shipyard level 2+
];

export class RuleBot extends BaseBot {
  constructor({ personality = DEFAULT_PERSONALITY, weights = {} } = {}) {
    super({ name: 'RuleBot' });
    this.personality = { ...DEFAULT_PERSONALITY, ...personality };
    this.weights = {
      food_min: 40, water_min: 40,
      food_rate_warn: 0.5,      // foodRate < 0.5 per POP → warning
      water_rate_warn: 0.3,
      energy_min: -1,
      housing_anticipate: 1,    // buduj gdy pop > housing - 1
      research_min_pop: 3,      // min pop żeby robić research
      mine_min_pop: 3,
      shipyard_min_pop: 6,
      observatory_min_pop: 5,
      ship_build_min_pop: 8,
      ...weights,
    };
  }

  decideAction(obs, catalog) {
    const ctx = this._buildContext();
    if (!ctx) return { type: ACTION_TYPES.WAIT };

    const tryResult = (action, tag) => {
      if (!action) return null;
      action._tag = tag;
      return action;
    };

    // ── R1 KRYTYCZNE: FOOD ──────────────────────────────────────────────
    if (ctx.food < this.weights.food_min || ctx.foodRate < ctx.pop * this.weights.food_rate_warn) {
      // Preferuj upgrade istniejącego farm zamiast budowy nowej (tańsze)
      const upgrade = this._findUpgrade(ctx, catalog, 'farm');
      if (upgrade) return tryResult(upgrade, 'food_upgrade');
      const build = this._findBuild(catalog, 'farm');
      if (build && ctx.canBuild('farm')) return tryResult(build, 'food_build');
    }

    // ── R2 KRYTYCZNE: WATER ─────────────────────────────────────────────
    if (ctx.water < this.weights.water_min || ctx.waterRate < ctx.pop * this.weights.water_rate_warn) {
      const upgrade = this._findUpgrade(ctx, catalog, 'well');
      if (upgrade) return tryResult(upgrade, 'water_upgrade');
      const build = this._findBuild(catalog, 'well');
      if (build && ctx.canBuild('well')) return tryResult(build, 'water_build');
    }

    // ── R3 KRYTYCZNE: ENERGY ────────────────────────────────────────────
    if (ctx.energyBalance < this.weights.energy_min) {
      const upgrade = this._findUpgrade(ctx, catalog, 'solar_farm');
      if (upgrade) return tryResult(upgrade, 'energy_upgrade');
      const build = this._findBuild(catalog, 'solar_farm');
      if (build && ctx.canBuild('solar_farm')) return tryResult(build, 'energy_build');
    }

    // ── R4 URGENT: HOUSING (anticipate growth) ──────────────────────────
    if (ctx.pop > ctx.housing - this.weights.housing_anticipate) {
      // habitat najpierw (główny housing building)
      if (ctx.canBuild('habitat')) {
        const a = this._findBuild(catalog, 'habitat');
        if (a) return tryResult(a, 'housing_habitat');
      }
      // residential_block jako fallback
      if (ctx.canBuild('residential_block')) {
        const a = this._findBuild(catalog, 'residential_block');
        if (a) return tryResult(a, 'housing_residential');
      }
      // Upgrade istniejących habitatów
      const up = this._findUpgrade(ctx, catalog, 'habitat');
      if (up) return tryResult(up, 'housing_upgrade');
    }

    // ── R5 URGENT: brak mine, a mamy POP ──────────────────────────────
    if (ctx.pop >= this.weights.mine_min_pop && ctx.countBuilding('mine') === 0 && ctx.canBuild('mine')) {
      const a = this._findBuild(catalog, 'mine');
      if (a) return tryResult(a, 'mine_first');
    }

    // ── R6 COMMODITIES: factory dla potrzebnych commodities ─────────────
    // Jeśli zaraz nie zbudujemy habitat/mine bo brakuje commodities → enqueue
    const neededCom = this._findNeededCommodity(ctx);
    if (neededCom) {
      return tryResult({ type: ACTION_TYPES.FACTORY_ENQUEUE, commodityId: neededCom, qty: 2 }, `factory_${neededCom}`);
    }

    // ── R7 EXPAND: predict food/water future needs ─────────────────────
    if (ctx.foodRate < ctx.pop * 1.0 && ctx.canBuild('farm')) {
      const build = this._findBuild(catalog, 'farm');
      if (build) return tryResult(build, 'food_expand');
    }
    if (ctx.waterRate < ctx.pop * 0.8 && ctx.canBuild('well')) {
      const build = this._findBuild(catalog, 'well');
      if (build) return tryResult(build, 'water_expand');
    }

    // ── R8 LAB/RESEARCH STATION ─────────────────────────────────────────
    if (ctx.pop >= this.weights.research_min_pop) {
      const hasLab = ctx.countBuilding('lab') + ctx.countBuilding('research_station') > 0;
      if (!hasLab) {
        if (ctx.canBuild('research_station')) {
          const a = this._findBuild(catalog, 'research_station');
          if (a) return tryResult(a, 'research_lab');
        }
        if (ctx.canBuild('lab')) {
          const a = this._findBuild(catalog, 'lab');
          if (a) return tryResult(a, 'research_lab');
        }
      }
    }

    // ── R9 RESEARCH ─────────────────────────────────────────────────────
    // Próbuj research często — TechSystem trzyma pending queue, auto-complete gdy stać
    if (Math.random() < this.personality.science * 0.5) {
      const availableTechs = catalog.listResearchActions();
      if (availableTechs.length > 0) {
        // Preferuj tech z TECH_PRIORITY listy, potem najtańsze
        let pick = null;
        for (const priority of TECH_PRIORITY) {
          const found = availableTechs.find(a => a.techId === priority);
          if (found) { pick = found; break; }
        }
        if (!pick) {
          const sorted = availableTechs
            .map(a => ({ a, cost: TECHS[a.techId]?.cost?.research ?? 1000 }))
            .sort((x, y) => x.cost - y.cost);
          pick = sorted[0].a;
        }
        return tryResult(pick, 'research');
      }
    }

    // ── R10 SPACE: launch_pad po rocketry ──────────────────────────────
    if (ctx.hasTech('rocketry') && ctx.countBuilding('launch_pad') === 0 && ctx.canBuild('launch_pad')) {
      const a = this._findBuild(catalog, 'launch_pad');
      if (a) return tryResult(a, 'launch_pad');
    }

    // ── R11 SHIPYARD ────────────────────────────────────────────────────
    if (ctx.hasTech('rocketry') && ctx.pop >= this.weights.shipyard_min_pop &&
        ctx.countBuilding('shipyard') === 0 && ctx.canBuild('shipyard')) {
      const a = this._findBuild(catalog, 'shipyard');
      if (a) return tryResult(a, 'shipyard');
    }

    // ── R12 OBSERVATORY ────────────────────────────────────────────────
    if (ctx.pop >= this.weights.observatory_min_pop &&
        ctx.countBuilding('observatory') === 0 && ctx.canBuild('observatory')) {
      const a = this._findBuild(catalog, 'observatory');
      if (a) return tryResult(a, 'observatory');
    }

    // ── R13 BUILD SHIP (science_vessel dla recon) ─────────────────────
    if (ctx.countBuilding('shipyard') > 0 && ctx.pop >= this.weights.ship_build_min_pop) {
      const shipActions = catalog.listBuildShipActions();
      const science = shipActions.find(a => a.shipId === 'science_vessel');
      if (science) return tryResult(science, 'build_science_ship');
      if (shipActions.length > 0 && Math.random() < this.personality.expansion * 0.4) {
        return tryResult(shipActions[0], 'build_ship_any');
      }
    }

    // ── R14 EXPEDITION: recon w pierwszej kolejności ──────────────────
    const expActions = catalog.listExpeditionActions({ limit: 20 });
    if (expActions.length > 0 && Math.random() < this.personality.expansion * 0.6) {
      const recon = expActions.find(e => e.missionType === 'recon');
      if (recon) return tryResult(recon, 'recon');
      if (Math.random() < 0.3) return tryResult(expActions[0], 'expedition');
    }

    // ── R15 2ND MINE ───────────────────────────────────────────────────
    if (ctx.countBuilding('mine') === 1 && ctx.pop >= 5 && ctx.canBuild('mine')) {
      const a = this._findBuild(catalog, 'mine');
      if (a) return tryResult(a, 'mine_second');
    }

    // ── R16 UPGRADE: nadwyżka resources → upgrade losowego ─────────────
    if (Math.random() < 0.25) {
      const upgrades = catalog.listUpgradeActions({ limit: 20 });
      if (upgrades.length > 0) {
        return tryResult(upgrades[Math.floor(Math.random() * upgrades.length)], 'upgrade_random');
      }
    }

    // ── R17 FACTORY: general commodity production ──────────────────────
    if (Math.random() < this.personality.trade * 0.25) {
      const fact = catalog.listFactoryActions();
      if (fact.length > 0) return tryResult(fact[0], 'factory_general');
    }

    // ── R18 FALLBACK build: solar_farm is cheap ─────────────────────────
    if (ctx.canBuild('solar_farm')) {
      const a = this._findBuild(catalog, 'solar_farm');
      if (a && Math.random() < 0.3) return tryResult(a, 'fallback_solar');
    }

    return { type: ACTION_TYPES.WAIT };
  }

  // ── Context builder — agreguje state ─────────────────────────────────
  _buildContext() {
    const K = window.KOSMOS;
    const active = K?.colonyManager?.getColony?.(K?.colonyManager?._activePlanetId ?? K?.homePlanet?.id);
    if (!active) return null;
    const resSys = active.resourceSystem;
    if (!resSys) return null;

    const inv = resSys.inventory ?? new Map();
    const rates = resSys._inventoryPerYear ?? new Map();

    const getAmount = (id) => inv.get(id) ?? 0;
    const getRate   = (id) => rates.get(id) ?? 0;

    const pop = active.civSystem?.population ?? 0;
    const housing = active.civSystem?.housing ?? 0;

    const bSys = active.buildingSystem;
    const buildingCounts = new Map();
    if (bSys?._active) {
      for (const [, entry] of bSys._active) {
        const id = entry.building?.id ?? entry.buildingId;
        buildingCounts.set(id, (buildingCounts.get(id) ?? 0) + 1);
      }
    }

    const techSys = K.techSystem;

    return {
      active, resSys, bSys, techSys,
      pop, housing,
      food: getAmount('food'),
      water: getAmount('water'),
      research: getAmount('research'),
      foodRate: getRate('food'),
      waterRate: getRate('water'),
      researchRate: getRate('research'),
      energyBalance: resSys.energy?.balance ?? 0,

      // Main resources
      fe: getAmount('Fe'),
      si: getAmount('Si'),
      cu: getAmount('Cu'),

      // Commodities important for basic building
      structAlloys: getAmount('structural_alloys'),
      pressureMod:  getAmount('pressure_modules'),
      electronicSys: getAmount('electronic_systems'),
      polymerComp:  getAmount('polymer_composites'),
      conductorBun: getAmount('conductor_bundles'),
      powerCells:   getAmount('power_cells'),
      extractionSys: getAmount('extraction_systems'),

      // Helpers
      countBuilding: (id) => buildingCounts.get(id) ?? 0,
      haveBuilding: (id) => (buildingCounts.get(id) ?? 0) > 0,
      hasTech: (id) => techSys?.isResearched?.(id) ?? false,

      canBuild(buildingId) {
        const def = BUILDINGS[buildingId];
        if (!def) return false;
        if (def.requires && !techSys?.isResearched?.(def.requires)) return false;
        // Check resource costs
        for (const [k, v] of Object.entries(def.cost ?? {})) {
          if (getAmount(k) < v) return false;
        }
        for (const [k, v] of Object.entries(def.commodityCost ?? {})) {
          if (getAmount(k) < v) return false;
        }
        return true;
      },
    };
  }

  /** Znajdź najtańszy brakujący commodity w commodityCost kluczowych budynków */
  _findNeededCommodity(ctx) {
    // Sprawdź 3 kluczowe budynki: habitat, mine, lab
    const keyBuildings = ['habitat', 'mine', 'research_station', 'lab'];
    for (const id of keyBuildings) {
      const def = BUILDINGS[id];
      if (!def) continue;
      // Jeśli NIE mamy tego budynku i brakuje ~commodity ale resource'y OK
      if (def.requires && !ctx.hasTech(def.requires)) continue;
      // Commodity shortage?
      for (const [k, v] of Object.entries(def.commodityCost ?? {})) {
        const have = ctx.active.resourceSystem.getAmount?.(k) ?? 0;
        if (have < v) {
          return k;  // zwróć pierwszy brakujący
        }
      }
    }
    return null;
  }

  _findBuild(catalog, buildingId) {
    const actions = catalog.listBuildActions({ limit: 80 });
    return actions.find(a => a.buildingId === buildingId) ?? null;
  }

  _findUpgrade(ctx, catalog, buildingIdFilter) {
    const upgrades = catalog.listUpgradeActions({ limit: 20 });
    const active = ctx.active;
    return upgrades.find(u => {
      const entry = active.buildingSystem?._active?.get(u.tile.key);
      const id = entry?.building?.id ?? entry?.buildingId;
      return id === buildingIdFilter;
    }) ?? null;
  }
}
