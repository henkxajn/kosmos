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
import { canColonize, canDoRecon } from '../../entities/Vessel.js';

// ⚠ S3.4d hull-gating: stocznia NAZIEMNA (kolonijna) buduje TYLKO hull_small (groundBuildable).
// Legacy science_vessel / cargo_ship NIE są groundBuildable → startShipBuild odrzuca je dla
// kolonii GRACZA (requiresOrbitalShipyard). Więc realny wczesny statek = hull_small + moduły
// (self-launch, bez launch_pad). To ten sam wzorzec, co kolonizator.
//   • Recon:      hull_small + [engine_chemical, science_lab]   → canDoRecon (survey).
//   • Kolonizator: hull_small + [engine_chemical, habitat_pod]  → canColonize + colonistCapacity.
const RECON_HULL        = 'hull_small';
const RECON_MODULES     = ['engine_chemical', 'science_lab'];
const COLONIZER_HULL    = 'hull_small';
const COLONIZER_MODULES = ['engine_chemical', 'habitat_pod'];

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
    // ── Rekalibracja Population 2.0 (Task 5) — MECHANICZNA, nie tuningowa ──
    // Redenominacja: POP ×4, konsumpcja per-POP ÷4, housing ×4 (CLAUDE.md). Zasada uczciwości:
    // przywróć ORYGINALNĄ intencję heurystyki pod nową skalą, NIE dostrajaj „by ładnie wyglądało".
    //   • progi porównywane z populacją (pop>=N, klucze factory_per_pop) → ×4 (pop jest ×4).
    //   • współczynniki per-POP (farm/well/solar_per_pop, food/water rate/POP) → ÷4
    //     (pop ×4 × per-POP ÷4 = ta sama ABSOLUTNA liczba budynków/rate — net bez zmian).
    //   • progi stocku absolutnego (food_min/water_min/energy_min) i prawdopodobieństwa → BEZ zmian
    //     (nie są pochodną POP; to zapasy surowca / knoby polityki).
    //   • housing_buffer w JEDNOSTKACH POP → ×4.
    this.weights = {
      food_min: 40, water_min: 40,      // stock absolutny — bez zmian
      energy_min: -1,                   // bilans energii — bez zmian
      housing_buffer: 4,                // ×4 (było 1; bufor w jednostkach POP)
      research_prob: 0.45,              // probability — bez zmian
      expedition_prob: 0.5,
      upgrade_prob: 0.2,
      factory_prob: 0.15,
      ship_prob: 0.35,
      farm_per_pop: 0.25,               // ÷4 (było 1.0)
      well_per_pop: 0.25,               // ÷4 (było 1.0)
      solar_per_pop: 0.175,             // ÷4 (było 0.7)
      factory_per_pop: { 24: 2, 40: 3, 60: 4 },  // klucze ×4 (było {6,10,15}); wartości = cel liczby factory
      ...weights,
    };
    this._recentEnqueues = new Map();
    this._enqueueCooldown = 15;
    this._factoryModeSetReactive = false;  // flag — raz ustawione
    this._reconnedTargets = new Set();      // ciała na które wysłano recon
    this._colonizedTargets = new Set();
    // 5C slider (Task 4a) — reaktywny, NIE predykcyjny: nudge tylko przy realnym niedoborze
    // (unemployed>0 I pressure straty wysokie). Cooldown przeciw thrashowi. Share z OBSERWOWANEJ
    // pressure (nie stała) — knoby to bot-policy (jak factory_per_pop), nie stałe balansu gry.
    this._lastSliderYear = -999;
    this._sliderCooldown = 8;   // civYears
    // Colonize: retry-friendly. NIE pre-markuj celu (transient „Brak surowców startowych" =
    // food/water dip → permanentna blokada). Zamiast tego cooldown między próbami + realny check
    // „czy cel już ma kolonię" (getColony). Statek z kolonistami czeka aż home ma zapas food/water.
    this._lastColonizeAttempt = -999;
    this._colonizeCooldown = 3;   // civYears między próbami tego samego statku
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
    if (ctx.food < this.weights.food_min || ctx.foodRate < ctx.pop * 0.15) {   // rate/POP ÷4 (było 0.6)
      const up = this._findUpgrade(ctx, catalog, 'farm');
      if (up) { up._tag = 'food_upgrade'; return up; }
      if (ctx.canBuild('farm')) {
        const a = this._findBuild(catalog, 'farm');
        if (a) { a._tag = 'food_build'; return a; }
      }
    }
    if (ctx.water < this.weights.water_min || ctx.waterRate < ctx.pop * 0.1) {   // rate/POP ÷4 (było 0.4)
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
    if (ctx.pop >= 12 && ctx.countBuilding('observatory') === 0 && ctx.canBuild('observatory')) {   // ×4 (było 3)
      const a = this._findBuild(catalog, 'observatory');
      if (a) { a._tag = 'observatory'; return a; }
    }

    // ── P7: Lab — wcześnie żeby przyspieszyć research (space chain wymaga techów) ──
    if (ctx.pop >= 16 && ctx.countBuilding('research_station') === 0 && ctx.canBuild('research_station')) {   // ×4 (było 4)
      const a = this._findBuild(catalog, 'research_station');
      if (a) { a._tag = 'research_station'; return a; }
    }

    // ── P8: Shipyard po exploration (lekki, Fe 80 Ti 30 — osiągalne z produkcji) ──
    if (ctx.hasTech('exploration')) {
      if (ctx.countBuilding('shipyard') === 0 && ctx.pop >= 16 && ctx.canBuild('shipyard')) {   // ×4 (było 4)
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
    if (ctx.countBuilding('mine') < 2 && ctx.pop >= 20 && ctx.canBuild('mine')) {   // ×4 (było 5)
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

    // ── P13: Build ship (science_vessel dla recon, potem realny KOLONIZATOR) ──
    if (ctx.countBuilding('shipyard') > 0 && ctx.pop >= 16) {   // ×4 (było 4)
      const vm = window.KOSMOS?.vesselManager;
      const allVessels = vm?.getAllVessels?.() ?? [];
      const myVessels = allVessels.filter(v => v.colonyId === ctx.active.planetId);
      const hasRecon = myVessels.some(v => canDoRecon(v));

      if (!hasRecon) {
        const sci = this._maybeBuildRecon(ctx, myVessels);
        if (sci) return sci;
      }
      // Realny kolonizator (hull_small + [engine_chemical, habitat_pod]) — gdy colonization tech.
      if (hasRecon && ctx.hasTech('colonization')) {
        const colo = this._maybeBuildColonizer(ctx, myVessels);
        if (colo) return colo;
      }
    }

    // ── P13: RECON — eksploracja najbliższych niezbadanych ciał ──
    // Statek recon = dowolny docked z canDoRecon (hull_small+science_lab). BEZ gate'u launch_pad —
    // hull_small self-launch (size 'small' → _needsSpaceportForVessel=false).
    const vm = window.KOSMOS?.vesselManager;
    const allVessels = vm?.getAllVessels?.() ?? [];
    const dockedRecon = allVessels.find(v =>
      v.colonyId === ctx.active.planetId &&
      v.position?.state === 'docked' && v.status === 'idle' &&   // docked+idle (status nigdy nie === 'docked')
      canDoRecon(v)
    );
    if (dockedRecon) {
      const unexploredBody = this._findNearestUnexplored(ctx.active.planet);
      if (unexploredBody && !this._reconnedTargets.has(unexploredBody.id)) {
        this._reconnedTargets.add(unexploredBody.id);
        return {
          type: ACTION_TYPES.EXPEDITION,
          missionType: 'recon',
          targetId: unexploredBody.id,
          vesselId: dockedRecon.id,
          _tag: `recon_${unexploredBody.id}`,
        };
      }
    }

    // ── P14: COLONIZE — realny 2-krok: załaduj POP → wyślij colonize ──
    // Statek MUSI mieć moduł habitat (canColonize) + kolonistów na pokładzie. To odzwierciedla
    // pełną sekwencję gracza (buduje kolonizator → ładuje POP → koloniazuje), bez obchodzenia bramek.
    if (ctx.hasTech('colonization') && allVessels.length > 0) {
      const dockedColonizer = allVessels.find(v =>
        v.colonyId === ctx.active.planetId &&
        v.position?.state === 'docked' && v.status === 'idle' &&   // docked+idle (status nigdy nie === 'docked')
        canColonize(v)
      );
      if (dockedColonizer) {
        const aboard = dockedColonizer.colonists ?? 0;
        const cabins = (dockedColonizer.colonistCapacity ?? 0) - aboard;
        const homeFree = ctx.active.civSystem?.freePops ?? 0;
        // Krok 1: brak kolonistów + wolne kabiny + nadwyżka POP w domu (glut) → załaduj do pojemności.
        // loadColonists sam capuje do min(kabiny, freePops); gate homeFree≥2 = nie drenuj ostatnich POP.
        if (aboard <= 0 && cabins > 0 && homeFree >= 2) {
          return { type: ACTION_TYPES.LOAD_COLONISTS, vesselId: dockedColonizer.id, _tag: 'load_colonists' };
        }
        // Krok 2: koloniści na pokładzie → colonize na explored rocky/ice.
        // Cooldown między próbami (transient food/water) — bez pre-marku (retry aż home ma zapas).
        if (aboard > 0 && (civYear - this._lastColonizeAttempt) >= this._colonizeCooldown) {
          const rockyTarget = this._findExploredRockyForColony(ctx.active.planet);
          if (rockyTarget) {
            this._lastColonizeAttempt = civYear;
            return {
              type: ACTION_TYPES.EXPEDITION,
              missionType: 'colonize',
              targetId: rockyTarget.id,
              vesselId: dockedColonizer.id,
              _tag: `colonize_${rockyTarget.id}`,
            };
          }
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

    // ── P18: 5C slider nudge (reaktywny — INV-2 lever) ──
    const slider = this._maybeSliderAction(ctx, civYear);
    if (slider) return slider;

    return { type: ACTION_TYPES.WAIT };
  }

  /**
   * Reaktywny nudge suwaka 5C (Allocation 2.0). Zasada uczciwości: reaguje na OBSERWOWANY stan
   * (unemployed + pressure straty), NIE predykcyjnie. Ustawia docelowy share na straty o najwyższej
   * pressure, gdy jest realny slack do rozdzielenia (unemployed>0) i strata nie ma jeszcze targetu.
   * Share pochodzi z pressure (nie stała). Cel: eksponować lever INV-2 dla telemetrii (Phase 2),
   * nie „optymalnie zagrać". Full recalibration progów = Task 5.
   */
  _maybeSliderAction(ctx, civYear) {
    const civ = ctx.active?.civSystem;
    if (!civ?.getWorkforceBreakdown || !civ?.setStrataTarget) return null;
    if ((civYear - this._lastSliderYear) < this._sliderCooldown) return null;
    if ((civ._unemployed ?? 0) <= 0) return null;   // brak slacku → suwak inertny, nie ruszaj

    const rows = civ.getWorkforceBreakdown();
    let best = null;
    for (const r of rows) {
      if (r.jobs > 0 && r.pressure > 0.4 && (r.target ?? 0) <= 0) {
        if (!best || r.pressure > best.pressure) best = r;
      }
    }
    if (!best) return null;

    this._lastSliderYear = civYear;
    // Share z OBSERWOWANEJ pressure (reaktywne): 0.2 baza + 0.3×pressure, cap 0.5. Knoby = bot-policy.
    const share = Math.min(0.5, 0.2 + 0.3 * best.pressure);
    return { type: ACTION_TYPES.SET_STRATA_TARGET, strataType: best.type, share, _tag: `slider_${best.type}` };
  }

  /**
   * Zbuduj recon (hull_small + [engine_chemical, science_lab]) — groundBuildable, self-launch.
   * SELF-QUEUING BUILD_SHIP (jak kolonizator): startShipBuild dorzuca do pendingShipOrders i
   * realizuje gdy surowce dopłyną — zrywa deadlock „commodity zjadane przez rozbudowę zanim
   * uzbiera się na statek" (katalog listBuildShipActions bramkuje affordability z góry → nigdy
   * nie kolejkuje). NIE science_vessel (legacy, nie-groundBuildable → orbital-only). Guard duplikatów.
   */
  _maybeBuildRecon(ctx, myVessels) {
    if (myVessels.some(v => canDoRecon(v))) return null;
    const queues  = ctx.active.shipQueues ?? [];
    const pending = ctx.active.pendingShipOrders ?? [];
    // Rozpoznaj recon-w-budowie po module science_lab (kadłub = hull_small współdzielony z kolonizatorem).
    if ([...queues, ...pending].some(q => (q.modules ?? []).includes('science_lab'))) return null;
    return {
      type: ACTION_TYPES.BUILD_SHIP,
      shipId: RECON_HULL,
      modules: [...RECON_MODULES],
      planetId: ctx.active.planetId,
      _tag: 'ship_recon',
    };
  }

  /**
   * Zbuduj realny kolonizator (hull_small + [engine_chemical, habitat_pod]) — chyba że już
   * istnieje/jest w budowie. startShipBuild sam kolejkuje przy braku surowców (real behavior),
   * więc nie sprawdzamy tu affordability; guard tylko przeciw duplikatom (drugi kolonizator).
   */
  _maybeBuildColonizer(ctx, myVessels) {
    // Już zbudowany kolonizator (moduł habitat)?
    if (myVessels.some(v => canColonize(v))) return null;
    // Już w kolejce stoczni lub w pending (rozpoznajemy po module habitat_pod)?
    const queues  = ctx.active.shipQueues ?? [];
    const pending = ctx.active.pendingShipOrders ?? [];
    const inBuild = [...queues, ...pending].some(q => (q.modules ?? []).includes('habitat_pod'));
    if (inBuild) return null;
    return {
      type: ACTION_TYPES.BUILD_SHIP,
      shipId: COLONIZER_HULL,
      modules: [...COLONIZER_MODULES],
      planetId: ctx.active.planetId,
      _tag: 'ship_colonizer',
    };
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
