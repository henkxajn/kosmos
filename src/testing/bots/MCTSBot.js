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
    // Deterministyczne dodanie po 1 z każdej kategorii (jeśli istnieje)
    const categoryLists = {
      build: catalog.listBuildActions({ limit: 30 }),
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
      case ACTION_TYPES.BUILD_SHIP: return 8;
      case ACTION_TYPES.FACTORY_ENQUEUE: return 2;
      case ACTION_TYPES.WAIT: return 0;
      default: return -1;
    }
  }

  _evaluateBuild(action, obs) {
    const id = action.buildingId;
    const b = BUILDINGS[id];
    if (!b) return 0;
    let score = 5; // bazowa wartość budowy

    const food = obs.resources?.food ?? 0;
    const water = obs.resources?.water ?? 0;

    // Farm/well gdy brakuje jedzenia/wody
    if (id === 'farm' && food < 80)  score += 15;
    if (id === 'well' && water < 80) score += 12;
    // Solar_farm gdy brownout
    if (id === 'solar_farm' && obs.energyBalance < 0) score += 14;
    // Habitat gdy pop blisko housing cap
    if ((id === 'habitat' || id === 'residential_block') && obs.pop >= 3) score += 10;
    // Lab dla tempa research
    if ((id === 'lab' || id === 'research_lab') && obs.researched.length > 3) score += 8;
    // Mine gdy mamy pop, nie mamy mine
    if (id === 'mine' && obs.pop >= 3) score += 6;
    // Shipyard po rocketry
    if (id === 'shipyard' && obs.researched.includes('rocketry')) score += 9;
    // Launch_pad po rocketry
    if (id === 'launch_pad' && obs.researched.includes('rocketry')) score += 10;

    // Penalty: jeśli mamy już kilka tego typu
    const K = window.KOSMOS;
    const bSys = K?.colonyManager?.getColony?.(K?.homePlanet?.id)?.buildingSystem;
    if (bSys?._active) {
      let sameCount = 0;
      for (const [, entry] of bSys._active) {
        if ((entry.building?.id ?? entry.buildingId) === id) sameCount++;
      }
      if (sameCount >= 3) score -= sameCount * 2; // malejące korzyści
    }

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
    let score = 8; // research jest generalnie wartościowy
    // Bonus za tech niskiego tier-u (tanie, odblokowują więcej)
    if (tech.tier <= 2) score += 6;
    // Bonus za rocketry (otwiera ekspedycje)
    if (action.techId === 'rocketry' && !obs.researched.includes('rocketry')) score += 15;
    // Bonus za colonization
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
}
