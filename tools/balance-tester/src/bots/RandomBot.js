// RandomBot — losowe akcje (baseline brak strategii)
// Wybiera losową walidną akcję

import { BotInterface } from './BotInterface.js';

export class RandomBot extends BotInterface {
  constructor(runtime) {
    super(runtime, {});
    this.name = 'RandomBot';
  }

  decide(state) {
    const priorities = this.evaluatePriorities(state);
    // Filtruj dostępne (score > 0)
    const available = priorities.filter(p => p.score > 0);
    if (available.length === 0) return null;
    // Losowy wybór
    const idx = Math.floor(Math.random() * available.length);
    const chosen = available[idx];
    const result = chosen.action();
    if (result) return { type: chosen.type, name: chosen.name, ...result };
    return null;
  }
}
