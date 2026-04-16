// ═══════════════════════════════════════════════════════════════
// RandomBot — crash hunter (fuzz tester)
// ─────────────────────────────────────────────────────────────
// Losowo próbkuje akcje z ActionCatalog, ważone po kategoriach.
// Cel: odkryć sekwencje wywołujące błędy w engine.
// ═══════════════════════════════════════════════════════════════

import { BaseBot } from './BaseBot.js';
import { DEFAULT_WEIGHTS } from '../actions/ActionCatalog.js';

export class RandomBot extends BaseBot {
  constructor({ weights = DEFAULT_WEIGHTS, chaosFactor = 0.05 } = {}) {
    super({ name: 'RandomBot' });
    this.weights = weights;
    this.chaosFactor = chaosFactor; // szansa na "truly random" akcję
  }

  decideAction(observation, catalog) {
    // 5% szans na chaos (w tym demolish/factory niezależnie od wag)
    if (Math.random() < this.chaosFactor) {
      const chaosCats = ['demolish', 'factoryEnqueue', 'wait'];
      const cat = chaosCats[Math.floor(Math.random() * chaosCats.length)];
      const list = catalog._listByCategory(cat);
      if (list.length > 0) return list[Math.floor(Math.random() * list.length)];
    }
    return catalog.sample({ weights: this.weights });
  }
}
