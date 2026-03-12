// GreedyMinerBot — wydobycie + fabryka + upgrade kopalni
// Override: wymusza stację badawczą, produkuje mining_drills, boostuje mining tech
import { BotInterface } from './BotInterface.js';

export class GreedyMinerBot extends BotInterface {
  constructor(runtime) {
    super(runtime, {
      mine: +40, factory: +25, factoryAlloc: +20,
      upgrade: +15,       // upgraduje kopalnie
      proactive_food: +5, // minimalne planowanie food
      tech: +5,           // potrzebuje advanced_mining + deep_drilling
      shipyard: -10, ship: -15, recon: -15, colony: -15,
    });
    this.name = 'GreedyMinerBot';
  }

  evaluatePriorities(state) {
    const base = super.evaluatePriorities(state);
    const researchCount = state.buildings.active
      .filter(b => b.buildingId === 'research_station').length;
    const mineCount = state.buildings.active
      .filter(b => b.buildingId === 'mine').length;
    const hasMiningDrills = (state.resources.inventory.mining_drills ?? 0) >= 2;

    // Bez stacji badawczej: boost aż pokona mine+40
    if (researchCount === 0) {
      for (const p of base) {
        if (p.name === 'build_research') p.score += 40;
        if (p.name === 'proactive_energy') p.score += 15;
      }
    }

    // Boost mining-related tech (advanced_mining, deep_drilling)
    const researched = state.tech.researched;
    const wantsMiningTech = !researched.includes('advanced_mining') ||
                            !researched.includes('deep_drilling');
    if (wantsMiningTech) {
      for (const p of base) {
        if (p.name === 'research_tech') p.score += 15;
      }
    }

    // Gdy nie mamy mining_drills, boost factory alloc aby je wyprodukować
    if (!hasMiningDrills && mineCount < 2) {
      for (const p of base) {
        if (p.name === 'allocate_factory') p.score += 15;
      }
    }

    return base;
  }

  // Override: GreedyMiner priorytetyzuje mining_drills w _getNeededCommodities
  _getNeededCommodities(s) {
    const needs = super._getNeededCommodities(s);
    const inv = s.resources.inventory;
    // Wymuś mining_drills na górę listy (za steel jeśli steel < 3)
    if ((inv.mining_drills ?? 0) < 4) {
      const idx = needs.indexOf('mining_drills');
      if (idx > 1) {
        // Przesuń mining_drills na pozycję 1 (po steel)
        needs.splice(idx, 1);
        const steelIdx = needs.indexOf('steel_plates');
        needs.splice(steelIdx === 0 ? 1 : 0, 0, 'mining_drills');
      } else if (idx === -1) {
        needs.splice(1, 0, 'mining_drills');
      }
    }
    return needs;
  }
}
