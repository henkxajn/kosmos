// TurtleBot — defensywny, populacja i upgrade
// Override: wymusza stację badawczą (potrzebna na hydroponics/urban_planning)
import { BotInterface } from './BotInterface.js';

export class TurtleBot extends BotInterface {
  constructor(runtime) {
    super(runtime, {
      housing: +30, food: +20, water: +15,
      proactive_food: +20, proactive_water: +15,
      upgrade: +25,       // dużo upgraduje istniejące budynki
      factoryAlloc: +10,  // produkuje commodities na upgrade
      research_station: +5, tech: +5, // tech potrzebny na hydroponics/urban_planning
      shipyard: -15, ship: -20, recon: -20, colony: -20,
    });
    this.name = 'TurtleBot';
  }

  evaluatePriorities(state) {
    const base = super.evaluatePriorities(state);
    const researchCount = state.buildings.active
      .filter(b => b.buildingId === 'research_station').length;

    // Bez stacji badawczej: boost aż pokona upgrade+25
    if (researchCount === 0) {
      for (const p of base) {
        if (p.name === 'build_research') p.score += 30;
        if (p.name === 'proactive_energy') p.score += 10;
      }
    }
    return base;
  }
}
