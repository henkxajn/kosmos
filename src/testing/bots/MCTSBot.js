// ═══════════════════════════════════════════════════════════════
// MCTSBot — simplified Monte Carlo-style heuristic-weighted sampler
// ─────────────────────────────────────────────────────────────
// UWAGA: Pełny MCTS wymagałby snapshot/restore stanu gry dla rolloutów,
// co w KOSMOS byłoby ekstremalnie kosztowne (każdy system ma swoje state + EventBus).
// Implementacja "light": próbkujemy K kandydujących akcji, oceniamy każdą
// statyczną heurystyczną funkcją użyteczności (bez rzeczywistej symulacji),
// a UCB1-inspired term dodaje eksplorację.
//
// Cel: wykrywać strategie których RuleBot nie widzi — przez szerokie sampling
// i ważenie wielu cech stanu jednocześnie.
// ═══════════════════════════════════════════════════════════════

import { BaseBot } from './BaseBot.js';
import { ACTION_TYPES } from '../actions/ActionAdapter.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { TECHS } from '../../data/TechData.js';

export class MCTSBot extends BaseBot {
  constructor({ iterations = 30, explorationC = 0.5 } = {}) {
    super({ name: 'MCTSBot' });
    this.iterations = iterations;
    this.explorationC = explorationC;
    this._actionVisitCount = new Map(); // rozpoznawanie powtórzeń dla UCB1
    this._totalVisits = 0;
  }

  decideAction(obs, catalog) {
    // Zbierz kandydatów: mix categorii z wagą ważonyh przez stan
    const candidates = this._sampleCandidates(catalog, this.iterations);
    if (candidates.length === 0) return { type: ACTION_TYPES.WAIT };

    // Oceń każdy kandydat
    let best = null;
    let bestScore = -Infinity;
    for (const action of candidates) {
      const utility = this._evaluate(action, obs);
      const ucbBonus = this._ucbBonus(action);
      const score = utility + ucbBonus;
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }

    // Zwiększ visit count
    if (best) {
      const key = this._actionKey(best);
      this._actionVisitCount.set(key, (this._actionVisitCount.get(key) ?? 0) + 1);
      this._totalVisits++;
    }
    return best ?? { type: ACTION_TYPES.WAIT };
  }

  _sampleCandidates(catalog, n) {
    const out = [];
    const seen = new Set();
    // perBuilding=2 — gwarantuje, że każdy buildingId ma ≥1-2 akcje w sample
    // (inaczej factory/shipyard były wypychane przez mine/solar_farm w limicie).
    // Dodaj build actions per-building żeby wszystkie typy miały szansę.
    const categoryLists = {
      build: catalog.listBuildActions({ limit: 60, perBuilding: 2 }),
      upgrade: catalog.listUpgradeActions({ limit: 20 }),
      research: catalog.listResearchActions(),
      expedition: catalog.listExpeditionActions({ limit: 15 }),
      buildShip: catalog.listBuildShipActions(),
      factoryEnqueue: catalog.listFactoryActions(),
    };
    // Flatten + random sample
    const all = [];
    for (const list of Object.values(categoryLists)) all.push(...list);
    // Shuffle
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    for (const a of shuffled) {
      if (out.length >= n) break;
      const key = this._actionKey(a);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    // Zawsze pass opcja wait (żeby bot mógł zdecydować się nie robić nic)
    out.push({ type: ACTION_TYPES.WAIT });
    return out;
  }

  _actionKey(action) {
    switch (action.type) {
      case ACTION_TYPES.BUILD: return `build:${action.buildingId}:${action.tile?.key ?? '?'}`;
      case ACTION_TYPES.UPGRADE: return `upgrade:${action.tile?.key ?? '?'}`;
      case ACTION_TYPES.DEMOLISH: return `demolish:${action.tile?.key ?? '?'}`;
      case ACTION_TYPES.RESEARCH: return `research:${action.techId}`;
      case ACTION_TYPES.EXPEDITION: return `exp:${action.missionType}:${action.targetId}`;
      case ACTION_TYPES.BUILD_SHIP: return `buildShip:${action.shipId}`;
      case ACTION_TYPES.FACTORY_ENQUEUE: return `factory:${action.commodityId}`;
      default: return action.type;
    }
  }

  /** UCB1-inspired exploration bonus — preferuje mniej odwiedzane akcje */
  _ucbBonus(action) {
    if (this._totalVisits < 2) return 0;
    const key = this._actionKey(action);
    const visits = this._actionVisitCount.get(key) ?? 0;
    return this.explorationC * Math.sqrt(Math.log(this._totalVisits) / (visits + 1));
  }

  /** Heurystyczna użyteczność akcji w danym kontekście */
  _evaluate(action, obs) {
    switch (action.type) {
      case ACTION_TYPES.BUILD: return this._evaluateBuild(action, obs);
      case ACTION_TYPES.UPGRADE: return this._evaluateUpgrade(action, obs);
      case ACTION_TYPES.DEMOLISH: return -5; // rzadko użyteczne
      case ACTION_TYPES.RESEARCH: return this._evaluateResearch(action, obs);
      case ACTION_TYPES.EXPEDITION: return this._evaluateExpedition(action, obs);
      case ACTION_TYPES.BUILD_SHIP: return this._evaluateBuildShip(action, obs);
      case ACTION_TYPES.FACTORY_ENQUEUE: return this._evaluateFactoryEnqueue(action, obs);
      case ACTION_TYPES.WAIT: return 0;
      default: return -1;
    }
  }

  /** Policz ile jest danego budynku w aktywnej kolonii */
  _countBuilding(id) {
    const K = window.KOSMOS;
    const bSys = K?.colonyManager?.getColony?.(K?.homePlanet?.id)?.buildingSystem;
    if (!bSys?._active) return 0;
    let n = 0;
    for (const [, entry] of bSys._active) {
      if ((entry.building?.id ?? entry.buildingId) === id) n++;
    }
    return n;
  }

  _evaluateBuild(action, obs) {
    const id = action.buildingId;
    const b = BUILDINGS[id];
    if (!b) return 0;
    let score = 15; // bazowa wartość budowy — PRIORYTETYZACJA nad research

    const food = obs.resources?.food ?? 0;
    const water = obs.resources?.water ?? 0;
    const count = this._countBuilding(id);

    // Foundation: kluczowe budynki mają bardzo wysoki boost gdy brakuje
    // (sekwencja solar→mine→factory zgodnie z user strategy)
    if (id === 'solar_farm' && count === 0) score += 30;
    if (id === 'mine' && count === 0)        score += 30;
    if (id === 'factory' && count === 0 && obs.researched.includes('metallurgy')) score += 35;
    if (id === 'farm' && count === 0)        score += 25;
    if (id === 'well' && count === 0)        score += 25;

    // Reaktywne: uzupełnianie gdy zasobów brak
    if (id === 'farm' && food < 80)          score += 20;
    if (id === 'well' && water < 80)         score += 18;
    if (id === 'solar_farm' && obs.energyBalance < 0) score += 22;

    // Housing gdy pop blisko cap
    if ((id === 'habitat' || id === 'residential_block') && obs.pop >= 3) score += 12;
    // Lab po fundamentach
    if ((id === 'lab' || id === 'research_lab') && obs.researched.length > 3) score += 10;
    // Dodatkowa fabryka gdy POP rośnie (dla prosperity przez commodities)
    if (id === 'factory' && count >= 1 && count < 3 && obs.pop >= 6) score += 18;
    // Space chain — po odpowiednich techach
    if (id === 'launch_pad' && obs.researched.includes('rocketry') && count === 0)   score += 20;
    if (id === 'shipyard'   && obs.researched.includes('exploration') && count === 0) score += 18;
    if (id === 'observatory' && count === 0 && obs.pop >= 4) score += 12;

    // Penalty: jeśli mamy już kilka tego typu
    if (count >= 3) score -= count * 4; // silniejsze malejące korzyści

    return score;
  }

  _evaluateUpgrade(action, obs) {
    // Upgrade jest cenny jeśli mamy nadmiar surowców
    const hasSurplus = Object.values(obs.resources ?? {}).some(v => v > 200);
    return hasSurplus ? 9 : 4;
  }

  _evaluateResearch(action, obs) {
    const tech = TECHS[action.techId];
    if (!tech) return 0;
    let score = 5; // obniżone — build ma priorytet
    // Bonus za tech niskiego tier-u (tanie, odblokowują więcej)
    if (tech.tier === 1) score += 6;
    if (tech.tier === 2) score += 3;
    // TOP PRIORITY: metallurgy (odblokowuje factory) — jak RuleBot
    if (action.techId === 'metallurgy' && !obs.researched.includes('metallurgy')) score += 25;
    // Space chain — konieczne dla ekspansji
    if (action.techId === 'orbital_survey' && !obs.researched.includes('orbital_survey')) score += 12;
    if (action.techId === 'rocketry' && !obs.researched.includes('rocketry')) score += 15;
    if (action.techId === 'exploration' && !obs.researched.includes('exploration')) score += 14;
    if (action.techId === 'colonization' && !obs.researched.includes('colonization')) score += 10;
    return score;
  }

  _evaluateExpedition(action, obs) {
    let score = 5;
    if (action.missionType === 'recon') score += 8; // recon = darmowa informacja
    if (action.missionType === 'mining') score += 6;
    if (action.missionType === 'scientific') score += 7;
    if (action.missionType === 'colonize') score += 12; // droga ale potężna
    return score;
  }

  _evaluateBuildShip(action, obs) {
    // Statki dopiero po shipyard; priorytet science_vessel (recon)
    const shipyardCount = this._countBuilding('shipyard');
    if (shipyardCount === 0) return 0;
    let score = 10;
    if (action.shipId === 'science_vessel' && obs.vesselCount === 0) score += 15;
    if (action.shipId === 'cargo_ship' && obs.researched.includes('colonization')) score += 12;
    return score;
  }

  _evaluateFactoryEnqueue(action, obs) {
    // Factory enqueue ma sens tylko gdy fabryka istnieje i coś brakuje.
    const factoryCount = this._countBuilding('factory');
    if (factoryCount === 0) return 0;
    let score = 8; // podwyższone z 2
    const have = obs.resources?.[action.commodityId] ?? 0;
    if (have < 3) score += 10; // krytyczny brak
    else if (have < 8) score += 5;
    return score;
  }
}
