// ═══════════════════════════════════════════════════════════════
// RuleBot v4 — rozegrany bot: kolonizacja, eksploracja, reactive factory
// ─────────────────────────────────────────────────────────────
// Kluczowe ulepszenia vs v3:
//   • Aggresywny tech rush po rocketry→exploration→colonization
//   • Multiple factories (2 gdy pop≥6, 3 gdy pop≥10) + reactive mode
//   • Build launch_pad, shipyard, observatory sekwencyjnie
//   • Build science_vessel po shipyard, wysłanie recon na najbliższe niezbadane
//   • Po colonization tech + cargo_ship → build habitat_pod module → colonize
//   • Observatory wcześnie (auto-discovery ciał)
// ═══════════════════════════════════════════════════════════════

import EntityManager from '../../core/EntityManager.js';
import { BaseBot } from './BaseBot.js';
import { ACTION_TYPES } from '../actions/ActionAdapter.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { TECHS } from '../../data/TechData.js';

const DEFAULT_PERSONALITY = {
  aggression: 0.5, expansion: 0.7, science: 0.6, trade: 0.5, defense: 0.5,
};

// Ścieżka tech dla ekspansji kosmicznej — w tej kolejności
const SPACE_TECH_CHAIN = [
  'orbital_survey',     // T1 — odblokowuje observatory, rocketry
  'rocketry',           // T2 — odblokowuje launch_pad
  'exploration',        // T2 — odblokowuje shipyard, science_vessel, cargo_ship
  'colonization',       // T3 — odblokowuje habitat_pod module (dla colonize missions)
];

// TECH_PRIORITY — hybrydowa kolejność:
// metallurgy (TOP, tanie, factory) → space chain (żeby odblokować observatory/launch_pad/shipyard)
// → tanie foundation. Bez tego space chain odpala po 200+ latach i commodities już są wyczerpane.
const TECH_PRIORITY = [
  'metallurgy',         // 50 — unlock factory (TOP priority)
  'orbital_survey',     // 110 — unlock observatory + rocketry path
  'bio_recycling',      // 50 — biology (food/water efficiency)
  'hydroponics',        // 60 — food boost
  'rocketry',           // T2 — unlock launch_pad
  'exploration',        // T2 — unlock shipyard + science_vessel
  'advanced_mining',    // 90 — +20% minerals + nowe tereny
  'efficient_solar',    // energy
  'battery_tech',       // energy storage
  'urban_planning',     // housing
  'automation',         // efficiency
  'colonization',       // T3 — dla kolonizacji
];

// Opening build order — starter daje 3 budynki (farm, well, solar_farm) + colony_base
// Strategia:
//   mine (free tech) → factory (metallurgy) → observatory (orbital_survey) → lab → habitat
// Observatory w opening bo: tanie (4 SA + 3 ES + 2 PC), +6 research/year przyspiesza space chain,
// auto-discovery ciał. Gated przez orbital_survey tech — opening zapauzuje się tutaj
// dopóki research nie skończy, potem odpala build.
const OPENING_ORDER = [
  { id: 'farm',        target: 1 },
  { id: 'well',        target: 1 },
  { id: 'solar_farm',  target: 1 },
  { id: 'mine',        target: 1 },
  { id: 'factory',     target: 1 },
  { id: 'habitat',     target: 1 },  // housing przed research — pop dorośnie
  { id: 'observatory', target: 1 },
  { id: 'research_station',         target: 1 },
];

export class RuleBot extends BaseBot {
  constructor({ personality = DEFAULT_PERSONALITY, weights = {} } = {}) {
    super({ name: 'RuleBot' });
    this.personality = { ...DEFAULT_PERSONALITY, ...personality };
    this.weights = {
      food_min: 40, water_min: 40,
      energy_min: -1,
      housing_buffer: 1,
      research_prob: 0.45,
      expedition_prob: 0.5,
      upgrade_prob: 0.2,
      factory_prob: 0.15,
      ship_prob: 0.35,
      farm_per_pop: 1.0,
      well_per_pop: 1.0,
      solar_per_pop: 0.7,
      factory_per_pop: { 6: 2, 10: 3, 15: 4 },  // docelowa liczba factory per POP threshold
      ...weights,
    };
    this._recentEnqueues = new Map();
    this._enqueueCooldown = 15;
    this._factoryModeSetReactive = false;  // flag — raz ustawione
    this._reconnedTargets = new Set();      // ciała na które wysłano recon
    this._colonizedTargets = new Set();
  }

  _ESSENTIAL_COMMODITIES = [
    { id: 'pressure_modules',   target: 4, qty: 3 },
    { id: 'structural_alloys',  target: 6, qty: 3 },
    { id: 'electronic_systems', target: 4, qty: 2 },
    { id: 'extraction_systems', target: 3, qty: 2 },
    { id: 'power_cells',        target: 5, qty: 3 },
    { id: 'conductor_bundles',  target: 4, qty: 2 },
    { id: 'polymer_composites', target: 3, qty: 2 },
    { id: 'reactive_armor',     target: 3, qty: 2 },
  ];

  decideAction(obs, catalog) {
    const ctx = this._buildContext();
    if (!ctx) return { type: ACTION_TYPES.WAIT };

    const civYear = Math.floor((window.KOSMOS?.timeSystem?.gameTime ?? 0) * 12);

    // ── P-2: Factory reactive mode — PO zbudowaniu observatory + shipyard + launch_pad.
    // Reactive blokuje enqueue strategic commodities (electronic_systems, reactive_armor etc.)
    // które są wymagane dla observatory/launch_pad. Przełączamy w reactive dopiero gdy
    // kluczowe budynki kosmosowe stoją — wtedy factory może skupić się na POP prosperity.
    const hasSpaceInfra = ctx.countBuilding('observatory') > 0 &&
                          ctx.countBuilding('launch_pad') > 0;
    if (!this._factoryModeSetReactive && hasSpaceInfra && ctx.countBuilding('factory') >= 1) {
      this._factoryModeSetReactive = true;
      return { type: ACTION_TYPES.FACTORY_SET_MODE, mode: 'reactive', _tag: 'factory_reactive' };
    }

    // ── P-1: Pre-enqueue essential commodities ──
    if (ctx.countBuilding('factory') > 0) {
      for (const ec of this._ESSENTIAL_COMMODITIES) {
        const have = ctx.getAmount(ec.id);
        if (have < ec.target && this._canEnqueue(ec.id, civYear)) {
          this._recentEnqueues.set(ec.id, civYear);
          return { type: ACTION_TYPES.FACTORY_ENQUEUE, commodityId: ec.id, qty: ec.qty, _tag: `preenqueue_${ec.id}` };
        }
      }
    }

    // ── P0: Opening build order ──
    // Jeśli step wymaga tech nie zbadanego, zamiast break — zainicjuj research tego tech.
    // Jeśli canBuild fail przez commodity, enqueue commodity (gdy factory istnieje).
    for (const step of OPENING_ORDER) {
      if (ctx.countBuilding(step.id) < step.target) {
        const def = BUILDINGS[step.id];
        // Required tech nie zbadany → research tego tech
        if (def?.requires && !ctx.hasTech(def.requires)) {
          const techActions = catalog.listResearchActions();
          const techAction = techActions.find(a => a.techId === def.requires);
          if (techAction) { techAction._tag = `opening_tech_${def.requires}`; return techAction; }
          // tech niedostępny (deeper requires nie spełnione) — przejdź do innych priorytetów
          break;
        }
        if (ctx.canBuild(step.id)) {
          const a = this._findBuild(catalog, step.id);
          if (a) { a._tag = `opening_${step.id}`; return a; }
          // _findBuild zwróciło null (brak legalnego hexa) — pomiń ten krok
          continue;
        } else {
          const needed = this._findMissingCommodity(ctx, step.id);
          if (needed && this._canEnqueue(needed, civYear)) {
            this._recentEnqueues.set(needed, civYear);
            return { type: ACTION_TYPES.FACTORY_ENQUEUE, commodityId: needed, qty: 3, _tag: `opening_fact_${needed}` };
          }
          break;
        }
      }
    }

    // ── P1-P3: KRYTYCZNE food/water/energy ──
    if (ctx.food < this.weights.food_min || ctx.foodRate < ctx.pop * 0.6) {
      const up = this._findUpgrade(ctx, catalog, 'farm');
      if (up) { up._tag = 'food_upgrade'; return up; }
      if (ctx.canBuild('farm')) {
        const a = this._findBuild(catalog, 'farm');
        if (a) { a._tag = 'food_build'; return a; }
      }
    }
    if (ctx.water < this.weights.water_min || ctx.waterRate < ctx.pop * 0.4) {
      const up = this._findUpgrade(ctx, catalog, 'well');
      if (up) { up._tag = 'water_upgrade'; return up; }
      if (ctx.canBuild('well')) {
        const a = this._findBuild(catalog, 'well');
        if (a) { a._tag = 'water_build'; return a; }
      }
    }
    if (ctx.energyBalance < this.weights.energy_min) {
      const up = this._findUpgrade(ctx, catalog, 'solar_farm');
      if (up) { up._tag = 'energy_upgrade'; return up; }
      if (ctx.canBuild('solar_farm')) {
        const a = this._findBuild(catalog, 'solar_farm');
        if (a) { a._tag = 'energy_build'; return a; }
      }
    }

    // ── P4: Housing (anticipate pop growth) ──
    if (ctx.pop >= ctx.housing - this.weights.housing_buffer) {
      if (ctx.canBuild('habitat')) {
        const a = this._findBuild(catalog, 'habitat');
        if (a) { a._tag = 'housing_habitat'; return a; }
      }
      const up = this._findUpgrade(ctx, catalog, 'habitat');
      if (up) { up._tag = 'housing_upgrade'; return up; }
    }

    // ── P5: RESEARCH — priority na space chain ──
    if (Math.random() < this.personality.science * this.weights.research_prob * 2) {
      const availableTechs = catalog.listResearchActions();
      if (availableTechs.length > 0) {
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
        pick._tag = 'research';
        return pick;
      }
    }

    // ── P6: Observatory — tanie, odblokowuje skanowanie. Wcześnie, PRZED expand. ──
    // Obserwatorium kosztuje tylko Fe 25, Si 15, Cu 10 + 4 SA + 3 ES + 2 PC — łatwe do wybudowania.
    if (ctx.pop >= 3 && ctx.countBuilding('observatory') === 0 && ctx.canBuild('observatory')) {
      const a = this._findBuild(catalog, 'observatory');
      if (a) { a._tag = 'observatory'; return a; }
    }

    // ── P7: Lab — wcześnie żeby przyspieszyć research (space chain wymaga techów) ──
    if (ctx.pop >= 4 && ctx.countBuilding('research_station') === 0 && ctx.canBuild('research_station')) {
      const a = this._findBuild(catalog, 'research_station');
      if (a) { a._tag = 'research_station'; return a; }
    }

    // ── P8: Shipyard po exploration (lekki, Fe 80 Ti 30 — osiągalne z produkcji) ──
    if (ctx.hasTech('exploration')) {
      if (ctx.countBuilding('shipyard') === 0 && ctx.pop >= 4 && ctx.canBuild('shipyard')) {
        const a = this._findBuild(catalog, 'shipyard');
        if (a) { a._tag = 'shipyard'; return a; }
      }
    }

    // ── P9: Launch_pad po rocketry (DROGI: Fe 1200, Ti 600, SA 120 — wymaga długiej produkcji) ──
    if (ctx.hasTech('rocketry')) {
      if (ctx.countBuilding('launch_pad') === 0 && ctx.canBuild('launch_pad')) {
        const a = this._findBuild(catalog, 'launch_pad');
        if (a) { a._tag = 'launch_pad'; return a; }
      }
    }

    // ── P10: Expand food/water/solar z populacją (tylko jeśli jeszcze mało pop lub kryzys) ──
    // Ograniczony expand — żeby nie marnować commodities na kolejne farmy gdy trzeba space chain.
    const pop = Math.max(1, ctx.pop);
    if (ctx.countBuilding('farm') < Math.ceil(pop * this.weights.farm_per_pop / 2) && ctx.canBuild('farm')) {
      const a = this._findBuild(catalog, 'farm');
      if (a) { a._tag = 'expand_farm'; return a; }
    }
    if (ctx.countBuilding('well') < Math.ceil(pop * this.weights.well_per_pop / 2) && ctx.canBuild('well')) {
      const a = this._findBuild(catalog, 'well');
      if (a) { a._tag = 'expand_well'; return a; }
    }
    if (ctx.countBuilding('solar_farm') < Math.ceil(pop * this.weights.solar_per_pop / 1.5) && ctx.canBuild('solar_farm')) {
      const a = this._findBuild(catalog, 'solar_farm');
      if (a) { a._tag = 'expand_solar'; return a; }
    }

    // ── P11: 2nd mine ──
    if (ctx.countBuilding('mine') < 2 && ctx.pop >= 5 && ctx.canBuild('mine')) {
      const a = this._findBuild(catalog, 'mine');
      if (a) { a._tag = 'mine_second'; return a; }
    }

    // ── P12: Multiple factories (kluczowe dla expansion commodities) ──
    const factoryCount = ctx.countBuilding('factory');
    let factoryTarget = 1;
    for (const [popThresh, target] of Object.entries(this.weights.factory_per_pop).sort((a,b) => +a[0] - +b[0])) {
      if (ctx.pop >= +popThresh) factoryTarget = target;
    }
    if (factoryCount < factoryTarget && ctx.canBuild('factory')) {
      const a = this._findBuild(catalog, 'factory');
      if (a) { a._tag = `factory_${factoryCount+1}`; return a; }
    }

    // ── P13: Build ship (science_vessel najpierw, potem cargo_ship dla kolonizacji) ──
    if (ctx.countBuilding('shipyard') > 0 && ctx.pop >= 4) {
      const vm = window.KOSMOS?.vesselManager;
      const allVessels = vm?.getAllVessels?.() ?? [];
      const myVessels = allVessels.filter(v => v.colonyId === ctx.active.planetId);
      const hasScience = myVessels.some(v => v.shipId === 'science_vessel');
      const hasCargo   = myVessels.some(v => v.shipId === 'cargo_ship');

      if (!hasScience) {
        const ships = catalog.listBuildShipActions();
        const science = ships.find(a => a.shipId === 'science_vessel');
        if (science) { science._tag = 'ship_science'; return science; }
      }
      // Po science_vessel — cargo_ship (dla colonization gdy tech zbadane)
      if (hasScience && !hasCargo && ctx.hasTech('colonization')) {
        const ships = catalog.listBuildShipActions();
        const cargo = ships.find(a => a.shipId === 'cargo_ship');
        if (cargo) { cargo._tag = 'ship_cargo'; return cargo; }
      }
    }

    // ── P13: RECON — eksploracja najbliższych niezbadanych ciał ──
    const vm = window.KOSMOS?.vesselManager;
    const allVessels = vm?.getAllVessels?.() ?? [];
    const dockedScience = allVessels.find(v =>
      v.colonyId === ctx.active.planetId &&
      v.status === 'docked' &&
      v.shipId === 'science_vessel'
    );
    if (dockedScience && ctx.countBuilding('launch_pad') > 0) {
      const unexploredBody = this._findNearestUnexplored(ctx.active.planet);
      if (unexploredBody && !this._reconnedTargets.has(unexploredBody.id)) {
        this._reconnedTargets.add(unexploredBody.id);
        return {
          type: ACTION_TYPES.EXPEDITION,
          missionType: 'recon',
          targetId: unexploredBody.id,
          vesselId: dockedScience.id,
          _tag: `recon_${unexploredBody.id}`,
        };
      }
    }

    // ── P14: COLONIZE — po rekonesansie rocky planet, wysłanie colonize ──
    if (ctx.hasTech('colonization') && allVessels.length > 0) {
      const dockedCargo = allVessels.find(v =>
        v.colonyId === ctx.active.planetId &&
        v.status === 'docked' &&
        v.shipId === 'cargo_ship'
      );
      if (dockedCargo) {
        const rockyTarget = this._findExploredRockyForColony(ctx.active.planet);
        if (rockyTarget && !this._colonizedTargets.has(rockyTarget.id)) {
          this._colonizedTargets.add(rockyTarget.id);
          return {
            type: ACTION_TYPES.EXPEDITION,
            missionType: 'colonize',
            targetId: rockyTarget.id,
            vesselId: dockedCargo.id,
            _tag: `colonize_${rockyTarget.id}`,
          };
        }
      }
    }

    // ── P15: MINING — jeśli mamy explored bodies z deposits ──
    if (allVessels.length > 0 && Math.random() < 0.3) {
      const exps = catalog.listExpeditionActions({ limit: 15 });
      const mining = exps.find(e => e.missionType === 'mining');
      if (mining) { mining._tag = 'mining'; return mining; }
    }

    // ── P16: Upgrade random (żeby poprawiać istniejące) ──
    if (Math.random() < this.weights.upgrade_prob) {
      const ups = catalog.listUpgradeActions({ limit: 20 });
      if (ups.length > 0) {
        const u = ups[Math.floor(Math.random() * ups.length)];
        u._tag = 'upgrade_random';
        return u;
      }
    }

    // ── P17: Factory enqueue fallback ──
    if (Math.random() < this.personality.trade * this.weights.factory_prob * 2) {
      const neededCom = this._findMissingCommodity(ctx, null);
      if (neededCom && this._canEnqueue(neededCom, civYear)) {
        this._recentEnqueues.set(neededCom, civYear);
        return { type: ACTION_TYPES.FACTORY_ENQUEUE, commodityId: neededCom, qty: 2, _tag: `factory_${neededCom}` };
      }
    }

    return { type: ACTION_TYPES.WAIT };
  }

  _canEnqueue(commodityId, civYear) {
    const factSys = window.KOSMOS?.factorySystem;
    const queue = factSys?._queue ?? [];
    if (queue.some(q => q?.commodityId === commodityId)) return false;
    // W trybie reactive factory sam produkuje — nie enqueue duplicate
    if (factSys?._mode === 'reactive') return false;
    const last = this._recentEnqueues.get(commodityId);
    if (last == null) return true;
    return (civYear - last) >= this._enqueueCooldown;
  }

  /** Znajdź najbliższe ciało którego nie rozpoznaliśmy (nie explored + nie planowane recon) */
  _findNearestUnexplored(homePlanet) {
    if (!homePlanet) return null;
    const allEntities = EntityManager.getAll?.() ?? [];
    const candidates = allEntities.filter(e => {
      if (e.type === 'star') return false;
      if (e.id === homePlanet.id) return false;
      if (e.explored) return false;
      if (this._reconnedTargets.has(e.id)) return false;
      // Mamy pozycję
      return e.physics?.x != null || e.orbital?.a != null;
    });
    // Najbliższe — Euclid po position
    const hx = homePlanet.physics?.x ?? 0;
    const hy = homePlanet.physics?.y ?? 0;
    let best = null, bestDist = Infinity;
    for (const e of candidates) {
      const ex = e.physics?.x ?? 0;
      const ey = e.physics?.y ?? 0;
      const d = Math.hypot(ex - hx, ey - hy);
      if (d < bestDist) { best = e; bestDist = d; }
    }
    return best;
  }

  /** Znajdź explored rocky planetę, która nie jest już zasiedlona */
  _findExploredRockyForColony(homePlanet) {
    if (!homePlanet) return null;
    const colMgr = window.KOSMOS?.colonyManager;
    const existingColonies = new Set(colMgr?.getAllColonies?.()?.map(c => c.planetId) ?? []);
    const allEntities = EntityManager.getAll?.() ?? [];
    const rockies = allEntities.filter(e => {
      if (e.type !== 'planet') return false;
      if (!e.explored) return false;
      if (existingColonies.has(e.id)) return false;
      if (this._colonizedTargets.has(e.id)) return false;
      if (e.planetType !== 'rocky') return false;
      // Ma atmosferę która nie jest "none" (lub minimum breatheble/thin)
      return e.atmosphere !== 'none';
    });
    const hx = homePlanet.physics?.x ?? 0;
    const hy = homePlanet.physics?.y ?? 0;
    let best = null, bestDist = Infinity;
    for (const e of rockies) {
      const ex = e.physics?.x ?? 0;
      const ey = e.physics?.y ?? 0;
      const d = Math.hypot(ex - hx, ey - hy);
      if (d < bestDist) { best = e; bestDist = d; }
    }
    return best;
  }

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
      food: getAmount('food'), water: getAmount('water'),
      foodRate: getRate('food'), waterRate: getRate('water'),
      energyBalance: resSys.energy?.balance ?? 0,
      getAmount, getRate,
      countBuilding: (id) => buildingCounts.get(id) ?? 0,
      hasTech: (id) => techSys?.isResearched?.(id) ?? false,
      canBuild(buildingId) {
        const def = BUILDINGS[buildingId];
        if (!def) return false;
        if (def.requires && !techSys?.isResearched?.(def.requires)) return false;
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

  _findMissingCommodity(ctx, buildingId) {
    const candidates = buildingId ? [buildingId] : ['habitat', 'mine', 'research_station', 'research_station', 'shipyard', 'launch_pad'];
    for (const id of candidates) {
      const def = BUILDINGS[id];
      if (!def) continue;
      if (def.requires && !ctx.hasTech(def.requires)) continue;
      for (const [k, v] of Object.entries(def.commodityCost ?? {})) {
        if (ctx.getAmount(k) < v) return k;
      }
    }
    return null;
  }

  _findBuild(catalog, buildingId) {
    // Użyj filtra po buildingId — pomija wcześniejsze budynki w iteracji BUILDINGS,
    // dzięki czemu zawsze znajdziemy factory/shipyard/itp. niezależnie od `limit`.
    const actions = catalog.listBuildActions({ limit: 10, buildingId });
    return actions[0] ?? null;
  }

  _findUpgrade(ctx, catalog, buildingIdFilter) {
    const upgrades = catalog.listUpgradeActions({ limit: 20 });
    return upgrades.find(u => {
      const entry = ctx.active.buildingSystem?._active?.get(u.tile.key);
      const id = entry?.building?.id ?? entry?.buildingId;
      return id === buildingIdFilter;
    }) ?? null;
  }
}
