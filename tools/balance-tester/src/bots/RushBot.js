// RushBot — agresywny tech rush + szybka eksploracja kosmosu
import { BotInterface } from './BotInterface.js';

export class RushBot extends BotInterface {
  constructor(runtime) {
    super(runtime, {
      tech: +25, research_station: +20,
      proactive_energy: +10, // energia na stację badawczą
      shipyard: +15, ship: +15, recon: +15, colony: +10,
      upgrade: +10,
      mine: -10, housing: -5,
      // Nie karzemy food/water — śmierć głodowa = przegrana
    });
    this.name = 'RushBot';
  }
}
