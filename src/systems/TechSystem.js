// TechSystem — zarządzanie drzewem technologii
//
// Odpowiada za:
//   - śledzenie zbadanych technologii
//   - sprawdzanie warunków (prerequisites, koszt badań)
//   - obliczanie mnożników produkcji i konsumpcji
//   - stały bonus morale / wzrostu populacji dla CivilizationSystem
//
// Komunikacja:
//   Nasłuchuje: 'tech:researchRequest' { techId } → próba zbadania
//   Emituje:    'tech:researched' { tech, restored }
//               'tech:researchFailed' { techId, reason }
//               'resource:requestSnapshot' → wymuszenie snapshotu zasobów
//
// Stałe metody pomocnicze (bez EventBus):
//   isResearched(id) → bool
//   getAvailable()   → [] dostępne techs (prereqs OK, nie zbadane)
//   getProductionMultiplier(resource) → łączny mnożnik dla resource
//   getConsumptionMultiplier(resource) → łączny mnożnik konsumpcji
//   getMoraleBonus()      → suma stałych bonusów morale (na rok)
//   getPopGrowthMultiplier() → łączny mnożnik wzrostu populacji
//   serialize() → { researched: [] }
//   restore(data) → wczytaj stan, emit tech:researched z restored:true

import EventBus from '../core/EventBus.js';
import { TECHS } from '../data/TechData.js';

export class TechSystem {
  constructor(resourceSystem = null) {
    this.resourceSystem = resourceSystem;

    // Zbiór zbadanych id technologii
    this._researched = new Set();

    // Nasłuch żądań badań
    EventBus.on('tech:researchRequest', ({ techId }) => this._research(techId));
  }

  // ── API publiczne ──────────────────────────────────────────────────────────

  isResearched(id) {
    return this._researched.has(id);
  }

  // Lista technologii dostępnych do zbadania: prereqs spełnione, jeszcze nie zbadana
  getAvailable() {
    return Object.values(TECHS).filter(t =>
      !this._researched.has(t.id) &&
      t.requires.every(req => this._researched.has(req))
    );
  }

  // Łączny mnożnik produkcji dla podanego surowca (produkt wszystkich modifier effects)
  getProductionMultiplier(resource) {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'modifier' && fx.resource === resource) {
          m *= fx.multiplier;
        }
      }
    }
    return m;
  }

  // Łączny mnożnik konsumpcji dla podanego surowca
  getConsumptionMultiplier(resource) {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'consumptionMultiplier' && fx.resource === resource) {
          m *= fx.multiplier;
        }
      }
    }
    return m;
  }

  // Suma stałych bonusów morale ze zbadanych technologii (na rok)
  getMoraleBonus() {
    let total = 0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'moraleBonus') total += fx.amount;
      }
    }
    return total;
  }

  // Łączny mnożnik wzrostu populacji ze zbadanych technologii
  getPopGrowthMultiplier() {
    let m = 1.0;
    for (const id of this._researched) {
      const tech = TECHS[id];
      if (!tech) continue;
      for (const fx of tech.effects) {
        if (fx.type === 'popGrowthBonus') m *= fx.multiplier;
      }
    }
    return m;
  }

  // ── Serializacja ──────────────────────────────────────────────────────────

  serialize() {
    return { researched: [...this._researched] };
  }

  restore(data) {
    const list = data?.researched ?? [];
    for (const id of list) {
      if (TECHS[id]) {
        this._researched.add(id);
        // Emituj z flagą restored:true — systemy re-synchronizują mnożniki
        // bez wyświetlania UI powiadomień
        EventBus.emit('tech:researched', { tech: TECHS[id], restored: true });
      }
    }
  }

  // ── Prywatne ──────────────────────────────────────────────────────────────

  _research(techId) {
    const tech = TECHS[techId];
    if (!tech) {
      EventBus.emit('tech:researchFailed', { techId, reason: 'Nieznana technologia' });
      return;
    }
    if (this._researched.has(techId)) {
      EventBus.emit('tech:researchFailed', { techId, reason: 'Już zbadana' });
      return;
    }

    // Sprawdź prerequisites
    for (const req of tech.requires) {
      if (!this._researched.has(req)) {
        const reqName = TECHS[req]?.namePL ?? req;
        EventBus.emit('tech:researchFailed', { techId, reason: `Wymaga: ${reqName}` });
        return;
      }
    }

    // Sprawdź koszt badań
    if (this.resourceSystem) {
      if (!this.resourceSystem.canAfford(tech.cost)) {
        EventBus.emit('tech:researchFailed', { techId, reason: 'Brak punktów badań' });
        return;
      }
      this.resourceSystem.spend(tech.cost);
    }

    this._researched.add(techId);
    EventBus.emit('tech:researched', { tech, restored: false });
  }
}
