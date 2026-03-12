// ScienceBot — research rush + pełne drzewo tech ASAP
import { BotInterface } from './BotInterface.js';

export class ScienceBot extends BotInterface {
  constructor(runtime) {
    super(runtime, {
      research_station: +35, tech: +30,
      upgrade: +15,       // upgraduje stacje badawcze
      proactive_food: +10, // nie umrzeć z głodu
      ship: +10, recon: +10, // eksploracja po techach
      mine: -15, factory: -10,
    });
    this.name = 'ScienceBot';
  }
}
