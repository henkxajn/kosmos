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
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { TERRAIN_TYPES } from '../../map/HexTile.js';
import { canColonize, canDoRecon, canHaulCargo } from '../../entities/Vessel.js';

// Droidy tier-1 obsadzają TYLKO prostą pracę (laborer/miner/worker) — Pop 2.0 Faza 4.
const DROID_TIER1_STRATA = ['laborer', 'miner', 'worker'];

// ⚠ S3.4d hull-gating: stocznia NAZIEMNA (kolonijna) buduje TYLKO hull_small (groundBuildable).
// Legacy science_vessel / cargo_ship NIE są groundBuildable → startShipBuild odrzuca je dla
// kolonii GRACZA (requiresOrbitalShipyard). Więc realny wczesny statek = hull_small + moduły
// (self-launch, bez launch_pad). To ten sam wzorzec, co kolonizator.
//   • Scout:      hull_small + [engine_chemical, deep_scanner]  → canDoRecon (deep_scan; doktryna Filipa).
//   • Kolonizator: hull_small + [engine_chemical, habitat_pod]  → canColonize + colonistCapacity.
// deep_scanner requires 'orbital_survey' (boosted-starter) — Scout = statek eksploracyjny gracza.
const RECON_HULL        = 'hull_small';
const RECON_MODULES     = ['engine_chemical', 'deep_scanner'];
// Task A — recall scout PROACTYWNIE przy ~46% paliwa (obserwowane zachowanie gracza, Filip): wraca z
// zapasem na powrót, NIE stranduje (koniec attrition „7-11 ciał → stranduje/ginie"). Knob = bot-policy
// (jak factory_per_pop), czyta ŻYWE paliwo — NIE strojone pod kotwicę metryki.
const RECALL_FUEL_FRAC  = 0.46;
// Task B — engine-upgrade: zasięg skauta ROŚNIE z techem silnika. Najlepszy dostępny silnik → dłuższy
// zasięg (engine_ion rangeMult 2.5 wymaga ion_drives; engine_fusion 4.0 wymaga fusion_drives). Bot
// SAM bramkuje na hasTech (build path NIE waliduje modułów tech-gate → nie „fake'ujemy" bez techu).
const SCOUT_ENGINE_TIERS = [
  { engine: 'engine_fusion', tech: 'fusion_drives' },
  { engine: 'engine_ion',    tech: 'ion_drives' },
  { engine: 'engine_chemical', tech: null },   // fallback (starter, bez techu)
];
// POP-colonizer: habitat (POP) + cargo (goods bundle) — B0 caveat: pure cargo nie wozi POP.
// ⚠ Take-4 Task B: slot [0] (silnik) jest PODMIENIANY na _bestScoutEngine(ctx) przy budowie (ion/fusion
// gdy tech) — te stałe trzymają tylko NIE-silnikowe moduły ([1..], przez .slice(1)); engine_chemical to
// fallback-nazwa dla czytelności. Cargo/kolonizator dostają ten sam upgrade zasięgu co skaut.
const COLONIZER_HULL    = 'hull_small';
const COLONIZER_MODULES = ['engine_chemical', 'habitat_pod', 'cargo_large'];
// Cargo (autonomous outpost): pure cargo (bez POP) — wozi materiały autonomous_mine na planetoid.
const CARGO_HULL        = 'hull_small';
const CARGO_MODULES     = ['engine_chemical', 'cargo_large', 'cargo_large'];
// Bundle startowy POP-kolonizacji (doktryna Filipa — behavior, nie stała balansu; suplement do
// COLONY_START_RESOURCES). ⚠ Phase-2 M4.3: mierz kolonię Z bundlem (intended play), nie bare-start.
const COLONY_BUNDLE = { structural_alloys: 40, electronic_systems: 30, power_cells: 20,
                        conductor_bundles: 20, extraction_systems: 20, food: 200, water: 200 };

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
  'efficient_solar',    // energy (Filip: energia PRZED silnikami)
  'battery_tech',       // energy storage
  'ion_drives',         // Task B — engine Gen II (engine_ion, ×2.5 rangeMult → skaut dosięga planetoid); requires rocketry
  'urban_planning',     // housing
  'automation',         // efficiency
  'colonization',       // T3 — dla kolonizacji
  'fusion_power',       // energy (prereq fusion_drives; researchuje się tylko gdy osiągalny)
  'fusion_drives',      // Task B — engine Gen III (engine_fusion, ×4 rangeMult); requires ion/plasma + fusion_power
];

// Opening build order — BAZA PRODUKCYJNA + survival (builder+explorer doctrine).
// Trim do farm/well/solar/mine/factory: habitat/observatory/research_station USUNIĘTE z beeline
// (pokrywają je P4 housing / P6 observatory / P7 lab PÓŹNIEJ). Powód: krótki opening → wczesny
// SCOUT BEELINE (P3.5) zamiast czekać na pełny opening. Explorer eksploruje zaraz po bazie produkcji.
const OPENING_ORDER = [
  { id: 'farm',        target: 1 },
  { id: 'well',        target: 1 },
  { id: 'solar_farm',  target: 1 },
  { id: 'mine',        target: 1 },
  { id: 'factory',     target: 1 },
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
      // Take-3 — Fe operational headroom (bot-policy reserve jak food_min): Fe wystarczające na NASTĘPNY
      // krok ekspansji (found outpost: droid recipe Fe 1000 + budynek + cargo ship). Poniżej + drenaż →
      // dołóż kopalnię (Faza 3). NIE „tuned to survive": to próg operacyjności pętli, nie przetrwania.
      fe_working_buffer: 1500,
      // Take-4 — energy operational headroom (bot-policy reserve, ta sama klasa co fe_working_buffer/
      // food_min): utrzymuj bilans energii ≥ reserve, by (a) dodanie NASTĘPNEGO konsumenta (mine 2⚡,
      // farm/well 1⚡) nie wpychało w brownout, (b) bramka life-support kopalń (energyBalance≥0) była
      // otwarta. Demand-aware energy scaling celuje w ten próg. NIE strojone pod kotwicę roku — próg
      // operacyjności (headroom ~2-3 budynków), analogicznie do rezerwy Fe.
      energy_reserve: 5,
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
    // Stage B — autonomous outpost loop (expansion-driven droid economy).
    this._outpostTargets = new Set();     // planetoidy z założoną/planowaną placówką
    this._lastOutpostAttempt = -999;
    this._outpostCooldown = 3;            // civYears między próbami found_outpost
    this._shippedOutposts = new Set();    // (legacy) — zastąpione przez _outpostShuttle (bot-managed shuttle)
    // Task 2 shipping — bot-managed shuttle: PRZYPISANY statek per placówka wozi rzadkie surowce
    // outpost↔home jednorazowymi transportami (loop mechanic zatrzymuje się po ~1 cyklu → zamiast
    // pętli sam kieruję statkiem: at-outpost=load+ship home, at-home=deadhead back). outpostId→shipId.
    this._outpostShuttle = new Map();
    // Take-3 — Fe-demand-aware mine scaling: próbka Fe raz/civYear do detekcji drenażu (demand>supply).
    this._feTrendYear = -1; this._fePrev = null; this._feSample = null;
    this._lastMineExpand = -999;   // cooldown Fazy 3 (demand override) — paced do build+ramp lag kopalni
    this._mineExpandCooldown = 4;  // civYears między dodatkowymi kopalniami przy drenażu (anti-runaway)
    // Task 1 — scout servicing loop: śledź misje którym wydano powrót (anty-spam ORDER_RETURN) i
    // skauty które STRANDNĘŁY (fuel-stop za daleko na powrót → startReturn odrzucony). Stranded scout
    // = niezdatny (nie liczy się jako „mam skauta" → bot buduje nowego). Reset per-misja przy dokowaniu.
    this._scoutReturnOrdered = new Set();  // exp.id którym już wydano ORDER_RETURN
    this._strandedScouts = new Set();      // vessel.id skautów utkniętych w kosmosie (nie do odzysku)
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

    // ── P-2: factory ZOSTAJE REACTIVE (auto-balansuje wszystkie commodities — manual serializuje
    // produkcję i głodzi je → kolonizacja spadła 5/5→1/5). Droidy: setDroidOrder (poza mode).
    // Bufor commodities placówki (SA/extraction_systems) → one-shot burst w _maybeOutpostPath.

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
    // ── P3-energy: DEMAND-AWARE ENERGY SCALING (take-4, generalizacja wzorca z _maybeScaleMines) ──
    // Stary branch „balance<-1 → buduj solar" CICHO padał: reactive factory trzyma commodities solara
    // (SA:4/PC:3/CB:2) na niskim equilibrium → canBuild('solar_farm')=false → _findBuild=null → fall-
    // through (probe: solar stuck 2/2 mimo Fe 9887, energyBalance −72). ROOT = starvation COMMODITY, nie
    // Fe/kafel. Fix = skaluj energię do popytu Z burstem commodity (jak robi to gracz i outpost path).
    {
      const energyAction = this._maybeScaleEnergy(ctx, civYear, catalog);
      if (energyAction) return energyAction;
    }

    // ── P3.4: Fe-DEMAND-AWARE MINE SCALING (take-3 fix, ⚠ REORDER: było P11 mine<2 cap) ──
    // Filip: kopalnie WCZEŚNIE, gdy life-support stabilny — TU (po P1-P3), PRZED scout/housing/expand.
    // Liczba kopalń = output bilansu Fe (skaluje z sinkiem + drenażem), NIE stała. Zastępuje cap mine<2.
    {
      const mineAction = this._maybeScaleMines(ctx, civYear, catalog);
      if (mineAction) return mineAction;
    }

    // ── P3.5: EARLY SCOUT BEELINE (builder+explorer — Filip buduje statek ~yr1) ──
    // PO zabezpieczeniu survival (P1-P3) i bazy produkcyjnej (opening mine/factory), PRZED
    // ekspansją/housing. POP-gated (crew) — akceptuje wczesną presję POP (wejście w works-forward).
    // Scout = hull_small + deep_scanner (home+small hull). NIE tunowane pod rok — mierzymy wynik.
    if (ctx.hasTech('exploration') && ctx.countBuilding('shipyard') > 0) {
      const vmScout = window.KOSMOS?.vesselManager;
      const myV = (vmScout?.getAllVessels?.() ?? []).filter(v => v.colonyId === ctx.active.planetId);
      // ⚠ Buduj skauta gdy NIE MA ŻADNEGO (stranded się LICZY). NIE _hasUsableScout: rebuild
      // stranded-scauta tutaj (wysoki priorytet, przed kolonizatorem) GŁODZIŁ budowę kolonizatora
      // (5/5→3/5 GOOD_FE) — statek utknięty raz na ~40gy nie może blokować kolonizacji. Servicing
      // loop obsługuje ŻYWEGO skauta; stranded siedzi (rzadki), martwy skaut → some(canDoRecon)=false → rebuild.
      if (!myV.some(v => canDoRecon(v))) {
        const scout = this._maybeBuildRecon(ctx, myV);
        if (scout) { scout._tag = 'ship_scout_beeline'; return scout; }
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

    // ── P5: RESEARCH — NON-BLOCKING (fix A) ──
    // queueTech jest PROGRESYWNE: raz zakolejkowany tech sam się posuwa co tick. Re-issue na
    // ~połowie tur (stary losowy gate 0.54) = no-op zjadający budżet decyzji i głodzący P13+.
    // Zasada realnego gracza: kolejkuj tech TYLKO gdy slot badawczy jest WOLNY i istnieje
    // queuable tech; inaczej NIE zwracaj — pozwól decyzji spaść niżej (statki/expand/...).
    {
      const rSys = window.KOSMOS?.researchSystem;
      const activeCount = rSys?.getActiveResearch?.()?.length ?? 0;
      const maxSlots = rSys?.getMaxSlots?.() ?? 1;
      if (rSys && activeCount < maxSlots) {   // wolny slot badawczy
        const queue = rSys.researchQueue ?? [];
        const queuable = catalog.listResearchActions()
          .filter(a => !rSys.isActive?.(a.techId) && !queue.includes(a.techId));
        if (queuable.length > 0) {
          let pick = null;
          // Stage A.3 — REAKTYWNA priorytetyzacja energii (doktryna): gdy bilans energii ujemny,
          // energy tech (efficient_solar/battery_tech) NA PRZÓD kolejki badań (boost energy balance).
          if (ctx.energyBalance < 0) {
            for (const et of ['efficient_solar', 'battery_tech']) {
              const f = queuable.find(a => a.techId === et);
              if (f) { pick = f; break; }
            }
          }
          if (!pick) for (const priority of TECH_PRIORITY) {
            const found = queuable.find(a => a.techId === priority);
            if (found) { pick = found; break; }
          }
          if (!pick) {
            const sorted = queuable
              .map(a => ({ a, cost: TECHS[a.techId]?.cost?.research ?? 1000 }))
              .sort((x, y) => x.cost - y.cost);
            pick = sorted[0].a;
          }
          pick._tag = 'research';
          return pick;
        }
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
    // ── P10-solar RETIRED (take-4): energia = JEDNA reguła demand-aware (P3 _maybeScaleEnergy), nie
    // proaktywny special-case pop×solar_per_pop. Stary expand_solar przebudowywał do pop-ratio (seed_4:
    // 16 solarów → +488 bilansu, daleko ponad reserve) drenując commodities/decyzje z ekspansji. Reguła
    // P3 trzyma bilans ≥ reserve i STOP (zbieżna). solar_per_pop zostaje w weights (nieużywane, historyczne).

    // ── P11: mine scaling — PRZENIESIONE do P3.4 (_maybeScaleMines, Fe-demand-aware) ──

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
      const hasRecon = myVessels.some(v => canDoRecon(v));   // dowolny skaut (stranded też) → kolonizator może się budować

      if (!hasRecon) {
        const sci = this._maybeBuildRecon(ctx, myVessels);
        if (sci) return sci;
      }
      // Realny kolonizator (hull_small + [engine_chemical, habitat_pod]) — gdy colonization tech.
      if (hasRecon && ctx.hasTech('colonization')) {
        const colo = this._maybeBuildColonizer(ctx, myVessels);
        if (colo) return colo;
      }
      // Task B — engine-upgrade scout replacement (buduj upgraded / rozbierz stary). PO kolonizatorze
      // (kolonizacja ma priorytet), ale bounded (raz per tier) → nie głodzi niższych priorytetów.
      const upgrade = this._maybeUpgradeScout(ctx, myVessels);
      if (upgrade) return upgrade;
    }

    // ── P13: RECON servicing loop (Task 1) — dispatch → fuel-stop → return → refuel → re-dispatch ──
    // full_system NIE zwiedza układu jednym lotem: fuel-stopuje po kilku ciałach (round-trip
    // affordability gate) i PARKUJE się na ostatnim ciele ze status='on_mission'/orbiting — dotąd
    // NIEWIDOCZNY dla findera idle → nigdy nie wracał, nie tankował, nie wznawiał (dziesiątki ciał
    // zostawały nieodkryte). Pełna obsługa w _maybeServiceScout (czyta ŻYWY stan: getUnexploredCount,
    // status misji, paliwo — NIE stała liczba cykli). vm/allVessels reużyte przez P14 colonize.
    const vm = window.KOSMOS?.vesselManager;
    const allVessels = vm?.getAllVessels?.() ?? [];
    const scoutAction = this._maybeServiceScout(ctx);
    if (scoutAction) return scoutAction;

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
        // Krok 0: załaduj goods bundle (doktryna) na kolonizator (cargo slot) — suplement do
        // COLONY_START_RESOURCES. Ładuj co stać z bundle, PRZED POP (jednorazowo per statek).
        if (aboard <= 0 && !dockedColonizer._bundleLoaded && (dockedColonizer.cargoMax ?? 0) > 0) {
          for (const [cid, qty] of Object.entries(COLONY_BUNDLE)) {
            const have = ctx.getAmount(cid);
            if (have >= qty && (dockedColonizer.cargo?.[cid] ?? 0) < qty) {
              return { type: ACTION_TYPES.LOAD_CARGO, vesselId: dockedColonizer.id, commodityId: cid, qty, _tag: `bundle_${cid}` };
            }
          }
          dockedColonizer._bundleLoaded = true;   // bundle skompletowany (co było stać) → dalej POP
        }
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

    // ── P14.5: AUTONOMOUS OUTPOST LOOP (Stage B — expansion-driven droid economy) ──
    const outpost = this._maybeOutpostPath(ctx, civYear);
    if (outpost) return outpost;

    // ── P14.6: SHIP RARE RESOURCES outpost→home (accelerates droids) ──
    const shipRare = this._maybeShipRareResources(ctx);
    if (shipRare) return shipRare;

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

    // ── P18: Droid install (Fix B — reaktywny: labor scarcity → droid substytuuje pracę) ──
    const droid = this._maybeDroidAction(ctx, civYear);
    if (droid) return droid;

    // ── P19: 5C slider nudge (reaktywny — INV-2 lever) ──
    const slider = this._maybeSliderAction(ctx, civYear);
    if (slider) return slider;

    return { type: ACTION_TYPES.WAIT };
  }

  /**
   * Reaktywna instalacja droida (Pop 2.0 Faza 4). Zasada uczciwości: reaguje na REALNY sygnał
   * niedoboru pracy — strata tier-1 (laborer/miner/worker) z NIEobsadzonymi etatami PRZY zerowym
   * bezrobociu (brak POP do obsady) — dokładnie decyzja gracza „droid zastępuje brakującego
   * pracownika". NIE tunowane pod „~3 do yr6" (to cel walidacji ceny droida, nie bota) — liczbę
   * droidów MIERZYMY jako output. Affordability = recipe (minerały) + Kr (creditCost), inaczej
   * produkcja jałowo wisi. Mając droida w magazynie → instaluj; inaczej → produkuj (jeśli stać).
   */
  _maybeDroidAction(ctx, civYear) {
    const civ = ctx.active?.civSystem;
    if (!civ?.getWorkforceBreakdown) return null;
    if ((civ._unemployed ?? 0) >= 1) return null;   // jest wolny POP → obsadź POP-em, nie droidem

    let scarce = null;
    for (const r of civ.getWorkforceBreakdown()) {
      if (!DROID_TIER1_STRATA.includes(r.type)) continue;
      const unfilled = (r.jobs ?? 0) - (r.workers ?? 0) - (r.synthetic ?? 0);
      if (unfilled >= 1 && (!scarce || unfilled > scarce.unfilled)) scarce = { type: r.type, unfilled };
    }
    if (!scarce) return null;

    // Mam droida w magazynie → instaluj (realna ścieżka installSyntheticForStrata).
    if (ctx.getAmount('automation_droid') >= 1) {
      return { type: ACTION_TYPES.INSTALL_DROID, strataType: scarce.type, _tag: `droid_install_${scarce.type}` };
    }
    // Brak droida → produkuj (droid = _droidOrders, dowolny tryb fabryki; NIE _canEnqueue).
    return this._maybeProduceDroid(ctx, civYear);
  }

  /**
   * Two-way juggle (Task 3) — RELEASE zainstalowanego droida tier-1 → +1 automation_droid w magazynie
   * (etat wraca do POP). Odwrotność _maybeDroidAction (install). „Release when it's worth more on a
   * found-outpost mission": droid pracujący w kolonii → materiał wejściowy autonomous_mine placówki.
   * removeSyntheticForStrata sam wybiera budynek z NAJWIĘCEJ droidami danej straty. Zwraca null gdy
   * NIC nie jest zainstalowane (na obecnym panelu install-for-employment nie odpala — patrz raport
   * Gate-2: uniwersalna nadwyżka pracy → brak niedoboru → droidy tylko ścieżką outpostu). Reużywalne
   * dla WSZYSTKICH strat tier-1; preferuj pierwszą z zainstalowanym droidem (kolejność = laborer→miner→worker).
   */
  _maybeReleaseDroid(ctx) {
    const bs = ctx.active?.buildingSystem;
    if (!bs?.removeSyntheticForStrata || !bs?.getSyntheticJobs) return null;
    for (const strata of DROID_TIER1_STRATA) {
      if ((bs.getSyntheticJobs(strata) ?? 0) >= 1) {
        return { type: ACTION_TYPES.RELEASE_DROID, strataType: strata, _tag: `droid_release_${strata}` };
      }
    }
    return null;
  }

  // ── Stage B: autonomous outpost loop ────────────────────────────────────────
  /**
   * Ścieżka autonomicznej placówki (works-forward): cargo ship → found outpost na planetoid z
   * rzadkim surowcem. Task 2 (decyzja Filipa: mine+solar) — placówka PRODUKTYWNA wymaga OBU
   * budynków: autonomous_mine (wydobycie) + autonomous_solar_farm (energia). Sama mine jest
   * brownout-zerowana (energyCost 4, brak źródła energii → availability 0 → produkcja 0 —
   * potwierdzone pomiarowo). KAŻDY budynek konsumuje 1 automation_droid (2 droidy/placówkę).
   * _nextOutpostStep: DOKOŃCZ półzbudowaną (ma mine, brak solar) PRZED założeniem nowej.
   * Gated na tech 'automation' (oba budynki wymagają) — świadoma inwestycja techowa (doktryna).
   */
  _maybeOutpostPath(ctx, civYear) {
    if (!ctx.hasTech('automation') || !ctx.hasTech('exploration')) return null;
    if (ctx.countBuilding('shipyard') === 0) return null;
    if ((civYear - this._lastOutpostAttempt) < this._outpostCooldown) return null;

    const step = this._nextOutpostStep(ctx);   // { buildingId, targetId } | null
    if (!step) return null;

    const vm = window.KOSMOS?.vesselManager;
    const myVessels = (vm?.getAllVessels?.() ?? []).filter(v => v.colonyId === ctx.active.planetId);
    // Cargo ship = idle+docked w DOMU (pure cargo). ⚠ Statek po foundzie utyka w placówce jako
    // 'refueling' (placówka nie ma paliwa → auto-refuel nie kończy → status nigdy 'idle'), więc
    // opuszcza pulę HOME (colonyId=placówka) → KAŻDY found bierze ŚWIEŻY statek z domu (2/placówkę).
    const cargoShip = myVessels.find(v =>
      v.status === 'idle' && v.position?.state === 'docked' && canHaulCargo(v) && !canColonize(v));
    if (!cargoShip) return this._maybeBuildCargo(ctx, myVessels);

    // Każdy budynek autonomiczny (mine I solar) KONSUMUJE 1 automation_droid. Two-way juggle (Task 3):
    // zwolnij zainstalowanego (→ +1 magazyn) zanim produkujesz świeżego (expansion-driven demand).
    if (ctx.getAmount('automation_droid') < 1) {
      const released = this._maybeReleaseDroid(ctx);
      if (released) return released;
      return this._maybeProduceDroid(ctx, civYear);
    }

    // Bufor commodities BIEŻĄCEGO budynku (mine: SA/extraction/PC; solar: SA/PC/conductor/electronic).
    // reactive trzyma je na niskim equilibrium → one-shot burst (najwyższy FP, działa w reactive) gdy short.
    const bCost = BUILDINGS[step.buildingId]?.commodityCost ?? {};
    const fs = window.KOSMOS?.factorySystem;
    for (const [cid, need] of Object.entries(bCost)) {
      if (cid === 'automation_droid') continue;   // droid już wyżej
      if (ctx.getAmount(cid) < need) {
        if (fs?.oneShotJob?.commodityId === cid) return null;   // burst w toku — czekaj
        return { type: ACTION_TYPES.SET_ONESHOT, commodityId: cid, qty: need + 2, _tag: `oneshot_${cid}` };
      }
    }

    // Załóż/rozbuduj placówkę bieżącym budynkiem. NIE pre-markuj celu (transient shortage →
    // permanentna blokada); cooldown + existing-colony check + step-recompute obsługują retry.
    this._lastOutpostAttempt = civYear;
    return { type: ACTION_TYPES.FOUND_OUTPOST, targetId: step.targetId, buildingId: step.buildingId,
             vesselId: cargoShip.id, _tag: `outpost_${step.buildingId.replace('autonomous_','')}_${step.targetId}` };
  }

  /** Task 2 — następny krok placówki: (1) DOKOŃCZ półzbudowaną gracza (ma mine, brak solar) → solar
   *  (energia → produkcja); (2) inaczej NOWA na świeżym planetoidzie z rzadkim złożem → mine. */
  _nextOutpostStep(ctx) {
    const colMgr = window.KOSMOS?.colonyManager;
    for (const c of (colMgr?.getAllColonies?.() ?? [])) {
      if (!c.isOutpost || c.ownerEmpireId) continue;   // tylko placówki GRACZA
      const bl = this._outpostBuildings(c);
      if (bl.includes('autonomous_mine') && !bl.includes('autonomous_solar_farm')) {
        return { buildingId: 'autonomous_solar_farm', targetId: c.planetId };
      }
    }
    const target = this._findOutpostTarget(ctx.active.planet);
    if (target) return { buildingId: 'autonomous_mine', targetId: target.id };
    return null;
  }

  /** Lista id budynków AKTYWNYCH na placówce (buildingSystem._active). */
  _outpostBuildings(colony) {
    const bs = colony?.buildingSystem;
    if (!bs?._active) return [];
    return [...bs._active.values()].map(e => e.building?.id ?? e.buildingId);
  }

  /** Zbuduj pure-cargo ship (hull_small + 2× cargo) — gdy brak idle+docked HOME cargo (statki po
   *  foundzie utykają w placówkach). Cap pacingu (bot-policy, NIE stała balansu): skalowany do liczby
   *  placówek (2 statki/placówkę: found mine+solar → potem shuttle) + bufor — chroni przed runaway. */
  _maybeBuildCargo(ctx, myVessels) {
    if (myVessels.some(v => canHaulCargo(v) && !canColonize(v))) return null;   // jest HOME cargo → czekaj
    const vm = window.KOSMOS?.vesselManager, colMgr = window.KOSMOS?.colonyManager;
    const totalCargo = (vm?.getAllVessels?.() ?? []).filter(v => canHaulCargo(v) && !canColonize(v)).length;
    const outposts = (colMgr?.getAllColonies?.() ?? []).filter(c => c.isOutpost && !c.ownerEmpireId).length;
    if (totalCargo >= 2 * outposts + 2) return null;   // safety cap (runaway guard)
    const queues = ctx.active.shipQueues ?? [], pending = ctx.active.pendingShipOrders ?? [];
    if ([...queues, ...pending].some(q => (q.modules ?? []).includes('cargo_large') &&
        !(q.modules ?? []).includes('habitat_pod'))) return null;
    // Task B (take-4) — buduj cargo z NAJLEPSZYM dostępnym silnikiem (ion/fusion gdy tech), ta sama
    // linia co skaut (_bestScoutEngine self-gate na hasTech). engine_chemical (range 20) NIE dosięgał
    // dalekich planetoid które ion-skaut ODKRYŁ (seed_5: Fe zdrowe 24k, 0 outpost — cargo nie dolatywał).
    return { type: ACTION_TYPES.BUILD_SHIP, shipId: CARGO_HULL,
             modules: [this._bestScoutEngine(ctx), ...CARGO_MODULES.slice(1)],
             planetId: ctx.active.planetId, _tag: 'ship_cargo' };
  }

  /** Produkuj automation_droid (factory) jeśli stać (recipe + Kr) — droid CELOWO drogi.
   *  ⚠ Droidy = INWESTYCYJNE (isDroidUnit → _droidOrders, POZA reactive/queue) → działają w KAŻDYM
   *  trybie fabryki. NIE używamy _canEnqueue (blokuje reactive) — sprawdzamy tylko duplikat zlecenia. */
  _maybeProduceDroid(ctx, civYear) {
    const recipe = COMMODITIES.automation_droid?.recipe ?? {};
    for (const [k, v] of Object.entries(recipe)) if (ctx.getAmount(k) < v) return null;
    if ((ctx.active.credits ?? 0) < (COMMODITIES.automation_droid?.creditCost ?? 0)) return null;
    if (this._droidOrderActive(ctx)) return null;   // już w produkcji
    // SET_DROID_ORDER (direct setDroidOrder) — factory:enqueue no-opuje w reactive; droid = _droidOrders.
    return { type: ACTION_TYPES.SET_DROID_ORDER, commodityId: 'automation_droid', qty: 1, _tag: 'droid_produce' };
  }

  /** Czy istnieje aktywne zlecenie droida? Sprawdza fabrykę AKTYWNĄ (tam ląduje factory:enqueue). */
  _droidOrderActive(ctx) {
    const fs = window.KOSMOS?.factorySystem ?? ctx.active?.factorySystem;
    const o = fs?.getDroidOrder?.('automation_droid');
    return !!o && (o.qty ?? 0) > (o.produced ?? 0);
  }

  /** Nearest explored planetoid z rzadkim surowcem (Xe/Hv/Nt/Li), bez placówki/kolonii. */
  _findOutpostTarget(homePlanet) {
    if (!homePlanet) return null;
    const colMgr = window.KOSMOS?.colonyManager;
    const existing = new Set(colMgr?.getAllColonies?.()?.map(c => c.planetId) ?? []);
    const RARE = ['Xe', 'Hv', 'Nt', 'Li'];
    const cand = (EntityManager.getAll?.() ?? []).filter(e => {
      if (e.type !== 'planetoid') return false;
      if (!e.explored) return false;
      if (existing.has(e.id) || this._outpostTargets.has(e.id)) return false;
      return (e.deposits ?? []).some(d => RARE.includes(d.resourceId) && (d.remaining ?? 0) > 0);
    });
    const hx = homePlanet.physics?.x ?? 0, hy = homePlanet.physics?.y ?? 0;
    let best = null, bd = Infinity;
    for (const e of cand) {
      const d = Math.hypot((e.physics?.x ?? 0) - hx, (e.physics?.y ?? 0) - hy);
      if (d < bd) { best = e; bd = d; }
    }
    return best;
  }

  /**
   * Task 2 — „ship rare resources (Li/Xe/Hv) home → accelerates droids". Bot-managed shuttle:
   * PRZYPISANY statek (ten co utknął w placówce po foundzie) wozi rzadkie surowce outpost↔home
   * jednorazowymi transportami. ⚠ Dwie korekty odkryte POMIAROWO (surface): (1) one-shot TRANSPORT
   * z domu NIE ładuje ze źródła (sourceColonyId = martwy param → spend z HOME → fail; a dostawa
   * `receive`uje manifest bez spendu = PHANTOM skażający pomiar) → ładujemy FIZYCZNIE przez LOAD_CARGO
   * (spend ze store placówki), statek AT-OUTPOST = redispatch (bez portu/home-spend), dostawa
   * zbalansowana. (2) LOOP transport zatrzymuje się po ~1 cyklu → zamiast pętli SAM kieruję statkiem
   * (at-outpost: załaduj każdy rzadki raz → ship home; at-home po dostawie: deadhead z powrotem).
   * Founding (HOME ships) i shipping (OUTPOST ships) = RÓŻNE statki → koniec kontencji z briefu
   * („statek busy founding") BEZ zmiany kolejności drabiny.
   */
  _maybeShipRareResources(ctx) {
    const colMgr = window.KOSMOS?.colonyManager;
    const vm = window.KOSMOS?.vesselManager;
    const home = window.KOSMOS?.homePlanet;
    if (!colMgr || !vm || !home) return null;
    const RARE = ['Li', 'Xe', 'Hv', 'Nt'];   // Li kluczowe (recipe droida); reszta bonus
    const assigned = new Set(this._outpostShuttle.values());

    for (const op of (colMgr.getAllColonies?.() ?? [])) {
      if (!op.isOutpost || op.ownerEmpireId) continue;
      const rs = op.resourceSystem;

      // Rozwiąż/przypisz shuttle placówki (statek z foundu, docked w placówce, jeszcze nieprzypisany).
      let ship = this._outpostShuttle.has(op.planetId) ? vm.getVessel(this._outpostShuttle.get(op.planetId)) : null;
      if (ship && ship.isWreck) { this._outpostShuttle.delete(op.planetId); assigned.delete(ship.id); ship = null; }
      if (!ship) {
        ship = (vm.getAllVessels?.() ?? []).find(v =>
          v.colonyId === op.planetId && v.position?.state === 'docked' &&
          (v.status === 'idle' || v.status === 'refueling') && canHaulCargo(v) && !canColonize(v) && !assigned.has(v.id));
        if (ship) { this._outpostShuttle.set(op.planetId, ship.id); assigned.add(ship.id); }
      }
      if (!ship || ship.status === 'on_mission') continue;   // brak shuttle lub w locie → czekaj

      const atOutpost = ship.colonyId === op.planetId && ship.position?.state === 'docked';
      const atHome    = ship.colonyId === home.id     && ship.position?.state === 'docked';

      if (atOutpost) {
        // Załaduj FIZYCZNIE każdy dostępny rzadki RAZ (starter batch; loadCargo clamp wagą), potem ship.
        const rareAvail = RARE.filter(r => (rs?.getAmount?.(r) ?? 0) > 20);
        const perTarget = Math.max(20, Math.floor((ship.cargoMax ?? 0) / (RARE.length || 1)));
        for (const r of rareAvail) {
          if ((ship.cargo?.[r] ?? 0) === 0 && (ship.cargoMax ?? 0) - (ship.cargoUsed ?? 0) > 1) {
            return { type: ACTION_TYPES.LOAD_CARGO, vesselId: ship.id, commodityId: r,
                     qty: Math.min(perTarget, Math.floor(rs.getAmount(r))), _tag: `load_rare_${r}` };
          }
        }
        // Wszystko co było załadowane → jednorazowy transport do domu (source-loaded fizycznie).
        const total = Object.values(ship.cargo ?? {}).reduce((s, v) => s + (v ?? 0), 0);
        if (total > 0) {
          return { type: ACTION_TYPES.TRANSPORT, targetId: home.id, vesselId: ship.id,
                   cargo: { ...ship.cargo }, _tag: `ship_rare_${op.planetId}` };
        }
        continue;   // pusty + nic do załadowania (placówka poniżej progu) → czekaj aż mine dorobi
      }
      if (atHome) {
        // Dostarczono → deadhead z powrotem do placówki (pusty jednorazowy transport) na kolejny kurs.
        return { type: ACTION_TYPES.TRANSPORT, targetId: op.planetId, vesselId: ship.id,
                 cargo: {}, _tag: `shuttle_return_${op.planetId}` };
      }
      // inny stan (orbiting/tranzyt) — czekaj
    }
    return null;
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
   * Task 1 — pętla obsługi skauta full_system: dispatch → fuel-stop → return → refuel → re-dispatch,
   * aż WSZYSTKIE kolonizowalne cele w układzie są zbadane. Rozszerza istniejącą zdolność skauta;
   * driven heurystyką czytającą ŻYWY stan (liczba nieodkrytych ciał, status misji, paliwo) — NIE stała
   * liczba cykli, NIE strojone pod kotwicę roku. Dodatkowe skauty = opcjonalne przyspieszenie (nie tu).
   *
   * Mechanika (z mapy MissionSystem/VesselManager): full_system leci greedy-NN od ciała do ciała;
   * na każdym przylocie gate paliwowy `fuel.current ≥ (distNext+distReturn)×consumption`. Gdy nie
   * starczy → skaut ZATRZYMUJE skan i orbituje OSTATNIE ciało (exp.status='orbiting', vessel
   * position.state='orbiting', status STAJE 'on_mission'); NIE wraca, NIE tankuje (auto-refuel wymaga
   * docked), NIE wznawia sam. Re-dispatch full_system POMIJA ciała już explored → kontynuuje sweep.
   */
  _maybeServiceScout(ctx) {
    const vm = window.KOSMOS?.vesselManager;
    const ms = window.KOSMOS?.missionSystem;
    if (!vm || !ms) return null;
    const unexplored = ms.getUnexploredCount?.() ?? { total: 0 };
    if ((unexplored.total ?? 0) <= 0) return null;   // cały układ zbadany — nic do obsługi

    // (1) Task A — RECALL PROAKTYWNIE przy ~46% paliwa (ZANIM skaut stranduje), lub gdy już fuel-stopował.
    //     Misja full_system aktywna ('en_route' skan) LUB zaparkowana ('orbiting'). ORDER_RETURN działa na
    //     obu (`_orderReturn` przyjmuje en_route+orbiting). Recall przy 46% → wraca z zapasem, startReturn
    //     się udaje → status→'returning' → pętla go pomija (koniec attrition/strandu). ANTY-SPAM: ordered
    //     JEDEN raz per misja; jeśli misja NADAL aktywna po rozkazie (startReturn odrzucony — edge, za mało
    //     na powrót) → stranded (oznacz, przestań ponawiać; NIE wymusza rebuildu — blokowałby kolonizator).
    for (const m of (ms._missions ?? [])) {
      if (m.type !== 'recon' || m.scope !== 'full_system') continue;
      if (m.status !== 'en_route' && m.status !== 'orbiting') continue;   // aktywny sweep lub zaparkowany
      const v = vm.getVessel(m.vesselId);
      if (!v || v.colonyId !== ctx.active.planetId || !canDoRecon(v)) continue;   // tylko własny skaut
      if (this._strandedScouts.has(v.id)) continue;             // już spisany na straty
      const parked   = m.status === 'orbiting' && v.position?.state === 'orbiting';
      const lowFuel  = (v.fuel?.max ?? 0) > 0 && (v.fuel.current ?? 0) <= RECALL_FUEL_FRAC * v.fuel.max;
      if (!parked && !lowFuel) continue;                        // jeszcze ma paliwo i leci — nie ruszaj
      if (this._scoutReturnOrdered.has(m.id)) {                 // wydano powrót, a misja wciąż aktywna →
        if (parked) this._strandedScouts.add(v.id);            // startReturn odrzucony → stranded
        continue;
      }
      this._scoutReturnOrdered.add(m.id);
      return { type: ACTION_TYPES.ORDER_RETURN, expeditionId: m.id, _tag: 'scout_return' };
    }

    // (2) Zadokowany idle/refueling skaut + niezbadane ciała → dotankuj (jeśli niepełny), potem
    //     re-dispatch full_system. hull_small self-launch (bez launch_pad); re-dispatch pomija
    //     explored → wznawia sweep. manualRefuel = natychmiast (bez czekania ~2-3 civY na auto-refuel).
    //     ⚠ Task B: gdy istnieje UPGRADED skaut (najlepszy silnik), dispatchuj TYLKO jego — stare-silnikowe
    //     zostają zadokowane do rozbiórki (_maybeUpgradeScout je disbanduje). Bez upgraded → dispatch dowolny.
    const best = this._bestScoutEngine(ctx);
    const myScouts = (vm.getAllVessels?.() ?? []).filter(v =>
      v.colonyId === ctx.active.planetId && canDoRecon(v) && !canColonize(v));
    const hasUpgraded = best !== 'engine_chemical' && myScouts.some(v => (v.modules ?? []).includes(best));
    const docked = myScouts.filter(v => (v.status === 'idle' || v.status === 'refueling') && v.position?.state === 'docked');
    const scout = hasUpgraded ? docked.find(v => (v.modules ?? []).includes(best)) : docked[0];
    if (scout) this._strandedScouts.delete(scout.id);
    if (scout) {
      const cur = scout.fuel?.current ?? 0;
      const max = scout.fuel?.max ?? scout.fuel?.capacity ?? 0;
      if (max > 0 && cur < max - 0.01) {
        return { type: ACTION_TYPES.REFUEL, vesselId: scout.id, _tag: 'scout_refuel' };
      }
      return { type: ACTION_TYPES.EXPEDITION, missionType: 'recon', targetId: 'full_system',
               vesselId: scout.id, _tag: 'scout_dispatch' };
    }
    return null;
  }

  /** Task B — najlepszy dostępny silnik skauta wg ZBADANEGO techu (bot self-gate; build path nie
   *  waliduje modułów tech-gate → bez hasTech byłby „fake" range bump). fusion>ion>chemical. */
  _bestScoutEngine(ctx) {
    for (const t of SCOUT_ENGINE_TIERS) {
      if (t.tech == null || ctx.hasTech(t.tech)) return t.engine;
    }
    return 'engine_chemical';
  }

  _bestScoutModules(ctx) {
    return [this._bestScoutEngine(ctx), 'deep_scanner'];
  }

  /**
   * Task B — engine-upgrade scout replacement. Gdy lepszy silnik dostępny (ion/fusion tech) I skaut
   * ma słabszy → zbuduj nowego z najlepszym silnikiem (dłuższy zasięg → dosięga dalekich planetoid),
   * potem ROZBIERZ starego (disband: zwrot 75% + załoga) — „replace", nie akumuluj skautów. Bounded:
   * buduje RAZ per tier (guard: brak upgraded w kolejce/istnieniu); disband gdy stary zadokowany+idle.
   * Progresywne (ion→fusion). Behavior/heurystyka czytająca ŻYWY tech+stan skauta, NIE strojone.
   */
  _maybeUpgradeScout(ctx, myVessels) {
    const best = this._bestScoutEngine(ctx);
    if (best === 'engine_chemical') return null;   // brak lepszego silnika → nic do upgrade
    const scouts = myVessels.filter(v => canDoRecon(v) && !canColonize(v));
    if (scouts.length === 0) return null;          // brak skauta w ogóle → beeline go zbuduje
    const hasUpgraded = scouts.some(v => (v.modules ?? []).includes(best));
    if (hasUpgraded) {
      // Upgrade istnieje → rozbierz stary (gorszy silnik) skaut zadokowany+idle w domu (replace).
      const old = scouts.find(v => !(v.modules ?? []).includes(best) &&
        (v.status === 'idle' || v.status === 'refueling') && v.position?.state === 'docked');
      if (old) return { type: ACTION_TYPES.DISBAND, vesselId: old.id, _tag: 'scout_disband_old' };
      return null;   // stary jeszcze w locie → recall (servicing loop) sprowadzi, potem disband
    }
    // Brak upgraded — zbuduj (jeśli nie w kolejce). Rozpoznaj upgraded-w-budowie po najlepszym silniku.
    const queues = ctx.active.shipQueues ?? [], pending = ctx.active.pendingShipOrders ?? [];
    if ([...queues, ...pending].some(q => (q.modules ?? []).includes(best))) return null;
    return { type: ACTION_TYPES.BUILD_SHIP, shipId: RECON_HULL, modules: this._bestScoutModules(ctx),
             planetId: ctx.active.planetId, _tag: `scout_upgrade_${best.replace('engine_', '')}` };
  }

  /**
   * Zbuduj recon (hull_small + [engine_chemical, science_lab]) — groundBuildable, self-launch.
   * SELF-QUEUING BUILD_SHIP (jak kolonizator): startShipBuild dorzuca do pendingShipOrders i
   * realizuje gdy surowce dopłyną — zrywa deadlock „commodity zjadane przez rozbudowę zanim
   * uzbiera się na statek" (katalog listBuildShipActions bramkuje affordability z góry → nigdy
   * nie kolejkuje). NIE science_vessel (legacy, nie-groundBuildable → orbital-only). Guard duplikatów.
   */
  _maybeBuildRecon(ctx, myVessels) {
    if (myVessels.some(v => canDoRecon(v))) return null;   // jest skaut (stranded też) → nie buduj następcy
    const queues  = ctx.active.shipQueues ?? [];
    const pending = ctx.active.pendingShipOrders ?? [];
    // Rozpoznaj scout-w-budowie po DOWOLNYM module recon (deep_scanner LUB science_lab) — inaczej
    // zmiana RECON_MODULES rozjeżdża guard i bot spamuje pending (958 zleceń — złapane w POOR).
    const RECON_SCIENCE_MODS = ['deep_scanner', 'science_lab'];
    if ([...queues, ...pending].some(q => (q.modules ?? []).some(m => RECON_SCIENCE_MODS.includes(m)))) return null;
    return {
      type: ACTION_TYPES.BUILD_SHIP,
      shipId: RECON_HULL,
      modules: this._bestScoutModules(ctx),   // Task B: najlepszy dostępny silnik od razu (ion/fusion gdy tech)
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
      // Task B (take-4) — kolonizator też z najlepszym silnikiem (dosięga dalszych rocky/ice do POP-kolonizacji).
      modules: [this._bestScoutEngine(ctx), ...COLONIZER_MODULES.slice(1)],
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
      return e.physics?.x != null || e.orbital?.a != null;
    });
    if (candidates.length === 0) return null;
    const hx = homePlanet.physics?.x ?? 0, hy = homePlanet.physics?.y ?? 0;
    const dist = (e) => Math.hypot((e.physics?.x ?? 0) - hx, (e.physics?.y ?? 0) - hy);
    // PREFERENCJA (doktryna): scout colonizable worlds FIRST. Ciała kolonizowalne (rocky/ice
    // planety = cele POP-kolonizacji) przed resztą (moons/planetoidy/gas). W grupie — najbliższe.
    const colonizable = (e) => e.type === 'planet' && (e.planetType === 'rocky' || e.planetType === 'ice');
    candidates.sort((a, b) => {
      const ca = colonizable(a) ? 0 : 1, cb = colonizable(b) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return dist(a) - dist(b);
    });
    return candidates[0];
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
    // countBuilding MUSI liczyć budynki AKTYWNE + W BUDOWIE (buildTime) + PENDING (brak surowców).
    // Inaczej bot nie widzi in-progress budynków (planet:buildResult success fires PRZY KOLEJCE,
    // nie ukończeniu) i RE-ISSUE'uje je co decyzję w oknie buildTime → masowe over-building
    // (95 kopalń, 22 farmy) → drenaż Fe → statki głodują. Analogia do fix A (research slot).
    const buildingCounts = new Map();
    const bump = (id) => { if (id) buildingCounts.set(id, (buildingCounts.get(id) ?? 0) + 1); };
    if (bSys?._active) for (const [, entry] of bSys._active) bump(entry.building?.id ?? entry.buildingId);
    if (bSys?._constructionQueue) for (const [, c] of bSys._constructionQueue) bump(c.buildingId);   // w budowie
    if (bSys?._pendingQueue) for (const [, p] of bSys._pendingQueue) bump(p.buildingId);              // czeka na surowce
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
    // BEST-OUTPUT PLACEMENT (doktryna gracza) — wybierz kafel o najwyższym yieldBonus[category]
    // budynku z ŻYWYCH danych kafli (mine→crater 1.8/mountains 1.6, solar→volcano 2.0/desert 1.5,
    // farm→plains 1.4). Adaptacyjne, NIE stały kafel. Zastępuje arbitralne actions[0] (pierwszy
    // kafel w kolejności siatki) — to była przyczyna Fe-starvation (kopalnie na słabym terenie).
    // limit=100 by ocenić WSZYSTKIE zdatne kafle, nie pierwsze 10.
    const actions = catalog.listBuildActions({ limit: 100, buildingId });
    if (actions.length === 0) return null;
    const cat = BUILDINGS[buildingId]?.category ?? 'default';
    let best = actions[0], bestScore = -Infinity;
    for (const a of actions) {
      const yb = TERRAIN_TYPES[a.tile?.type]?.yieldBonus ?? {};
      const score = yb[cat] ?? yb.default ?? 1.0;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  _findUpgrade(ctx, catalog, buildingIdFilter) {
    const upgrades = catalog.listUpgradeActions({ limit: 20 });
    return upgrades.find(u => {
      const entry = ctx.active.buildingSystem?._active?.get(u.tile.key);
      const id = entry?.building?.id ?? entry?.buildingId;
      return id === buildingIdFilter;
    }) ?? null;
  }

  /**
   * Take-3 fix — Fe-demand-aware mine scaling (zastępuje cap `mine<2`). Reguła Filipa: stawiaj kopalnie
   * WCZEŚNIE gdy life-support stabilny (food/water OK + rezerwa energii); skaluj LICZBĘ do zapotrzebowania
   * na Fe programu budowy. Baseline rośnie z liczbą fabryk (główny sink Fe→commodities, ~90% przepływu);
   * gdy Fe DRENUJE (demand>supply, wykryte z trendu inwentarza) dokładaj kolejne, aż Fe się ustabilizuje.
   * Liczba kopalń = OBSERWOWANY WYNIK bilansu Fe (NIE stała 2→4, NIE strojone pod „przetrwanie" kolapsu).
   * Filip: ~4×Lv2 to jego typowa równowaga, wyższa gdy program żąda więcej I złoże wspiera (richness 1.0,
   * 116-128k zostało — ekstrakcja nie jest limitem). Home mining = wystarczające-ze-wsparciem-shippingu
   * (import Fe z placówek), nie pełna samowystarczalność. Gdy złoże wyczerpane → nie kop (return null).
   */
  _maybeScaleMines(ctx, civYear, catalog) {
    // Life-support PRZED kopalniami (Filip: kopalnie gdy well+farm dają komfort). STOCK + rezerwa energii
    // (rate obsługuje P1-P3 wyżej — ich deficyt zbudowałby farm/well ZANIM tu dojdziemy; rate-gate tutaj
    // blokował skalowanie przy chwilowym deficycie tempa → seed_1 utykał na 2 kopalniach).
    const lifeOK = ctx.food >= this.weights.food_min && ctx.water >= this.weights.water_min && ctx.energyBalance >= 0;
    if (!lifeOK) return null;
    // Złoże Fe musi mieć rudę (nie kop na wyczerpanym — ekstrakcja nie jest limitem, ale wyczerpane złoże jest).
    const deposits = ctx.active.planet?.deposits ?? window.KOSMOS?.homePlanet?.deposits ?? [];
    const feDep = deposits.find(d => d.resourceId === 'Fe');
    if (!feDep || (feDep.remaining ?? 0) <= 0) return null;

    // Trend Fe (próbka raz/civYear; RÓŻNICA znacząca ≥20/civYear, nie szum): drenaż = demand > supply.
    if (this._feTrendYear !== civYear) { this._fePrev = this._feSample; this._feSample = ctx.getAmount('Fe'); this._feTrendYear = civYear; }
    const feDraining = this._fePrev != null && this._feSample < this._fePrev - 20;
    const feLow = ctx.getAmount('Fe') < this.weights.fe_working_buffer;   // za mało na następny krok ekspansji

    const mines = ctx.countBuilding('mine');   // liczy AKTYWNE + w budowie + pending (bez re-build storm)
    const factories = ctx.countBuilding('factory');
    // Baseline PROAKTYWNY (Filip stawia kopalnie WCZEŚNIE obok fabryk; ~4 przy jego skali). Skaluje z
    // sinkiem Fe (fabryki = ~90% przepływu Fe→commodities). Lv2 (Faza 2) redukuje ile kopalń trzeba.
    const baseline = Math.max(2, factories);

    // FAZA 1 — dobuduj do baseline (proaktywnie, gdy life-support stabilny).
    if (mines < baseline) {
      if (ctx.canBuild('mine')) {
        const a = this._findBuild(catalog, 'mine');
        if (a) { a._tag = 'mine_base'; return a; }
      } else {
        // Take-4 — kopalnia nieosiągalna przez BRAK COMMODITY (SA:3/extraction:2/PC:1), nie Fe → burst
        // (ta sama generalizacja co energy). MEDIAN: po otwarciu bramki life-support (energia trzyma)
        // kopalnie DALEJ stały na commodity (probe: SA stuck 0) → Fe kaskada nie zeszłaby bez burstu.
        const burst = this._burstMissingCommodity(ctx, 'mine');
        if (burst) return burst;
      }
    }
    // ⚠ Lv2 upgrade ODRZUCONE — headless upgrade NIE DZIAŁA (catalog.listUpgradeActions=0 przez zły
    // akcesor grid.getByKey/_map; a bezpośredni planet:upgradeRequest też nie podnosi poziomu kopalni
    // — osobny gap ścieżki upgrade BuildingSystem headless, spamował 927× i głodził pętlę). Skalujemy
    // Fe LICZBĄ kopalń (equivalent output, więcej Lv1 zamiast mniej Lv2). Filipowy kształt „~4×Lv2"
    // = te same Fe co ~8×Lv1; kształt Lv2 wymaga naprawy ścieżki upgrade (osobny harness issue). LOG.
    // FAZA 3 — Fe pod REALNĄ presją (drenuje I poniżej progu operacyjności pętli) → dołóż JEDNĄ kopalnię
    // co cooldown (paced do build+ramp lag). ⚠ Cooldown + feLow + stop-on-not-draining = klucz przeciw
    // runaway (bez feLow Faza 3 odpalała przy 57k Fe → 100+ kopalń). Zbieżne: gdy supply dogoni demand →
    // drenaż ustaje I Fe > buffer → stop.
    if (feDraining && feLow && (civYear - this._lastMineExpand) >= this._mineExpandCooldown) {
      if (ctx.canBuild('mine')) {
        this._lastMineExpand = civYear;
        const a = this._findBuild(catalog, 'mine');
        if (a) { a._tag = 'mine_demand'; return a; }
      } else {
        // Take-4 — j.w.: brak commodity blokuje demand-override → burst (NIE konsumuje cooldown; kopalnia
        // jeszcze nie zbudowana, więc nie startujemy pacing timera dopóki realnie nie postawimy).
        const burst = this._burstMissingCommodity(ctx, 'mine');
        if (burst) return burst;
      }
    }
    return null;
  }

  // ── Take-4: demand-aware ENERGY scaling + shared build-or-burst primitive ────────────────────
  /**
   * Demand-aware energy scaling (generalizacja wzorca „skaluj proaktywny producent P do sygnału popytu"
   * z _maybeScaleMines). Sygnał popytu energii = ŻYWY `energyBalance` (production − consumption; RATE, nie
   * stock — prostszy niż inventory-trend Fe: bilans wprost koduje popyt-vs-podaż). Utrzymuj bilans ≥
   * `energy_reserve` (headroom operacyjny). Gdy poniżej → dołóż producenta energii przy najlepszym
   * placemencie (solar na desert; coal na high-C fallback), Z BURSTEM commodity gdy build zablokowany.
   * Zbieżny: gdy produkcja przekroczy konsumpcję+reserve → stop. Overshoot podczas buildTime tłumiony
   * przez `_pendingEnergySupply` (in-progress producenci liczą się do bilansu). Heurystyka czyta ŻYWY
   * bilans — NIE stała liczba solarów, NIE strojona pod przetrwanie konkretnego seeda.
   *
   * ⚠ Dlaczego DUPLIKAT metody (parallel do _maybeScaleMines), nie jedna generyczna: sygnały popytu
   * genuinnie się różnią (Fe = inventory-trend + buffer; energia = rate). Wspólny jest tylko PRIMITYW
   * budowania-lub-burstu → wyekstrahowany do `_burstMissingCommodity`, używany przez OBIE reguły
   * (mine + energy). To jest generalizacja (współdzielony primitive), a demand-signal zostaje per-zasób.
   */
  _maybeScaleEnergy(ctx, civYear, catalog) {
    const reserve = this.weights.energy_reserve;
    // Projected balance = żywy bilans + energia budujących się producentów (nie widoczna w balance zanim
    // aktywni). Bez tego bot dołożyłby 4 solary/civYear zanim pierwszy wystartuje → overshoot.
    const proj = ctx.energyBalance + this._pendingEnergySupply(ctx);
    if (proj >= reserve) return null;   // popyt pokryty (z budującymi się) → stop (zbieżność)

    const building = this._bestEnergyBuilding(ctx);   // solar (desert) | coal (terrainAny, high-C fallback)
    if (ctx.canBuild(building)) {
      const a = this._findBuild(catalog, building);
      if (a) { a._tag = building === 'coal_plant' ? 'energy_coal' : 'energy_solar'; return a; }
      // Stać, ale brak legalnego kafla dla wybranego (np. solar bez desert) → coal (terrainAny) jako
      // fallback placement gdy C zdrowe. (Zwykle _bestEnergyBuilding już to wychwyci; belt-and-suspenders.)
      if (building === 'solar_farm' && ctx.getAmount('C') > 60 && ctx.canBuild('coal_plant')) {
        const coalA = this._findBuild(catalog, 'coal_plant');
        if (coalA) { coalA._tag = 'energy_coal'; return coalA; }
      }
      return null;   // brak kafla nigdzie — czekaj (nie da się zbudować)
    }
    // Nieosiągalny przez BRAK COMMODITY → burst (unblock next build). Raw (Fe/Si/Cu) short → null (czeka na kopalnie).
    return this._burstMissingCommodity(ctx, building);
  }

  /**
   * Wybór budynku energetycznego (doktryna Filipa: „solar na desert; coal na high-C"). Solar = domyślny
   * (yieldBonus energy 1.5 na desert, brak ciągłego wejścia = odporny). Coal = fallback gdy BRAK wolnego
   * kafla desert (coal terrainAny — buduje gdziekolwiek) I C zdrowe (stock > buffer + rate ≥ 0 → coal
   * 6C/rok nie zagłodzi się). Czyta ŻYWY stan (wolne kafle desert, stock/rate C) — NIE stała. Na klasach
   * harnessu (wszystkie high-C, desert nie wysycha w 45gy) coal głównie uśpiony-ale-osiągalny (raport).
   */
  _bestEnergyBuilding(ctx) {
    if (this._countFreeTiles(ctx, 'desert') > 0) return 'solar_farm';
    if (ctx.getAmount('C') > 60 && ctx.getRate('C') >= 0) return 'coal_plant';   // desert wyczerpany + C zdrowe
    return 'solar_farm';   // brak desert I brak C → solar gdziekolwiek (degraded placement)
  }

  /** Energia budujących się producentów (in-progress solar/coal) — overshoot guard podczas buildTime.
   *  Estimate = bazowa stawka energii z DANYCH (solar 8, coal 18), NIE magic number. Liczy tylko
   *  in-progress (construction+pending); aktywni są już w energyBalance. */
  _pendingEnergySupply(ctx) {
    const bs = ctx.active?.buildingSystem;
    if (!bs) return 0;
    const est = (id) => BUILDINGS[id]?.rates?.energy ?? 0;
    const isEnergy = (id) => id === 'solar_farm' || id === 'coal_plant' || id === 'geothermal';
    let supply = 0;
    if (bs._constructionQueue) for (const [, c] of bs._constructionQueue) if (isEnergy(c.buildingId)) supply += est(c.buildingId);
    if (bs._pendingQueue)      for (const [, p] of bs._pendingQueue)      if (isEnergy(p.buildingId)) supply += est(p.buildingId);
    return supply;
  }

  /** Liczba WOLNYCH (buildable, nie zajęte, nie damaged) kafli danego terenu. */
  _countFreeTiles(ctx, terrainType) {
    const tiles = ctx.active?.grid?.toArray?.() ?? [];
    let n = 0;
    for (const t of tiles) {
      if (t.type !== terrainType) continue;
      const terr = TERRAIN_TYPES[t.type];
      if (terr?.buildable && !t.isOccupied && !t.damaged) n++;
    }
    return n;
  }

  /**
   * SHARED PRIMITIVE (generalizacja budowania-lub-burstu, używany przez mine + energy scaling): gdy budynek
   * NIEosiągalny przez BRAK COMMODITY (nie raw Fe/Si/Cu), odpal one-shot burst brakującego towaru
   * (setOneShotJob — najwyższy priorytet FP, działa w reactive; DOKŁADNIE co robi gracz gdy brakuje
   * power_cells na solar, i co już robi outpost path dla budynków autonomicznych). Reactive factory trzyma
   * commodities na NISKIM equilibrium (~0-3) → koszt solar (SA:4,PC:3,CB:2) / mine (SA:3) bywa NIEosiągalny
   * bez burstu (probe). Raw surowce (Fe/Si/Cu) NIE burstowalne (produkują je kopalnie) → null (build czeka).
   * Zwraca burst action | null (brak brakującego commodity / burst tego towaru już w toku / tylko raw short).
   */
  _burstMissingCommodity(ctx, buildingId) {
    const def = BUILDINGS[buildingId];
    const fs = window.KOSMOS?.factorySystem;
    // (1) HONEST — jeśli budynek ma short RAW (Fe/Si/Cu w `cost`), burst commodity go NIE odblokuje
    //     (raw robią kopalnie) → yield (niech niższa drabina/kopalnie dorobią; NIE monopolizuj decyzji).
    //     ⚠ To wyprowadza bota z Fe-bootstrap-trap: MEDIAN low-Fe seed miał Fe=8 < solar Fe:15 → dawniej
    //     bot futilnie burstował SA (recepta Fe:8, drenując resztkę Fe) w kółko; teraz oddaje decyzję.
    for (const [k, v] of Object.entries(def?.cost ?? {})) {
      if (ctx.getAmount(k) < v) return null;
    }
    // (2) Zbierz short commodities. Jeśli KTÓRYKOLWIEK jest teraz NIEwytwarzalny (jego recepta ma raw za
    //     niski), cały budynek i tak zablokowany → yield (burst innych = marnotrawstwo; kopalnie dorobią raw).
    const bCost = def?.commodityCost ?? {};
    const short = [];
    for (const [cid, need] of Object.entries(bCost)) {
      if (cid === 'automation_droid') continue;   // droid = osobna ścieżka (nie factory burst)
      if (ctx.getAmount(cid) >= need) continue;
      if (!this._commodityMakeableNow(ctx, cid)) return null;   // nieodblokowywalny blocker → yield cały budynek
      short.push([cid, need]);
    }
    // (3) Wszystkie brakujące commodities SĄ wytwarzalne → burst pierwszy (odblokowuje budynek krok po kroku).
    for (const [cid, need] of short) {
      if (fs?.oneShotJob?.commodityId === cid) return null;   // burst tego towaru w toku — czekaj
      return { type: ACTION_TYPES.SET_ONESHOT, commodityId: cid, qty: need + 2, _tag: `oneshot_${cid}` };
    }
    return null;   // nic short (albo raw-blocked wyżej) → nic do burstu
  }

  /** Czy towar da się TERAZ wytworzyć: wszystkie RAW składniki recepty (Fe/Si/Cu/Li/C…) dostępne. Składniki
   *  będące commodity (tier-2 recepty) pomijamy — factory sama je zrobi. Blokujemy tylko na raw (kopalnie). */
  _commodityMakeableNow(ctx, cid) {
    const recipe = COMMODITIES[cid]?.recipe ?? {};
    for (const [ing, iq] of Object.entries(recipe)) {
      if (COMMODITIES[ing]) continue;         // składnik = commodity → factory zrobi, nie blokuj
      if (ctx.getAmount(ing) < iq) return false;   // raw surowiec za niski → nieopłacalne teraz
    }
    return true;
  }
}
