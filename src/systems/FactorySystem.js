// FactorySystem — alokacja punktów produkcji, wytwarzanie commodities
//
// Budynek 'factory' daje 1 punkt produkcji.
// Gracz alokuje punkty do receptur (wiele naraz).
// Produkcja zużywa surowce z inventory + zajmuje czas.
//
// EventBus:
//   Nasłuchuje: 'factory:allocate'     { commodityId, points }
//               'time:tick'            → aktualizacja produkcji
//   Emituje:    'factory:produced'     { commodityId, amount }
//               'factory:statusChanged' { allocations, totalPoints }

import EventBus from '../core/EventBus.js';
import { COMMODITIES } from '../data/CommoditiesData.js';

export class FactorySystem {
  constructor(resourceSystem) {
    this.resourceSystem = resourceSystem;

    // Całkowita liczba punktów produkcji (= liczba fabryk × level)
    this._totalPoints = 0;

    // Alokacja: Map<commodityId, { points, progress }>
    // points: ile punktów przydzielono do tej receptury
    // progress: postęp produkcji w latach (reset do 0 po ukończeniu)
    this._allocations = new Map();

    // Nasłuchuj zdarzeń
    EventBus.on('factory:allocate', ({ commodityId, points }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.allocate(commodityId, points);
    });

    EventBus.on('time:tick', ({ deltaYears }) => this._update(deltaYears));
  }

  // ── API publiczne ────────────────────────────────────────────────────────

  // Ustaw liczbę punktów fabrycznych
  setTotalPoints(points) {
    this._totalPoints = Math.max(0, points);
    this._emitStatus();
  }

  // Pobierz całkowitą liczbę punktów
  get totalPoints() { return this._totalPoints; }

  // Pobierz używane punkty
  get usedPoints() {
    let sum = 0;
    for (const alloc of this._allocations.values()) sum += alloc.points;
    return sum;
  }

  // Pobierz wolne punkty
  get freePoints() { return Math.max(0, this._totalPoints - this.usedPoints); }

  // Alokuj punkty do receptury
  allocate(commodityId, points) {
    const def = COMMODITIES[commodityId];
    if (!def) return;

    if (points <= 0) {
      // Usuń alokację
      this._allocations.delete(commodityId);
    } else {
      const existing = this._allocations.get(commodityId);
      const maxAlloc = this.freePoints + (existing?.points ?? 0);
      const actual = Math.min(points, maxAlloc);
      if (actual <= 0) {
        this._allocations.delete(commodityId);
      } else {
        this._allocations.set(commodityId, {
          points: actual,
          progress: existing?.progress ?? 0,
        });
      }
    }
    this._emitStatus();
  }

  // Pobierz stan alokacji (do UI)
  getAllocations() {
    const result = [];
    for (const [id, alloc] of this._allocations) {
      const def = COMMODITIES[id];
      if (!def) continue;
      const timePerUnit = def.baseTime / alloc.points; // lata na 1 szt.
      result.push({
        commodityId: id,
        namePL:      def.namePL,
        icon:        def.icon,
        points:      alloc.points,
        progress:    alloc.progress,
        timePerUnit,
        pctComplete: Math.min(100, (alloc.progress / timePerUnit) * 100),
        paused:      alloc._paused ?? false,
      });
    }
    return result;
  }

  // ── Serializacja ─────────────────────────────────────────────────────────

  serialize() {
    const allocs = [];
    for (const [id, alloc] of this._allocations) {
      allocs.push({
        commodityId: id,
        points:      alloc.points,
        progress:    alloc.progress,
      });
    }
    return { totalPoints: this._totalPoints, allocations: allocs };
  }

  restore(data) {
    this._totalPoints = data.totalPoints ?? 0;
    this._allocations.clear();
    if (data.allocations) {
      for (const a of data.allocations) {
        this._allocations.set(a.commodityId, {
          points:   a.points,
          progress: a.progress ?? 0,
        });
      }
    }
  }

  // ── Prywatne ─────────────────────────────────────────────────────────────

  _update(deltaYears) {
    if (this._allocations.size === 0) return;

    for (const [commodityId, alloc] of this._allocations) {
      const def = COMMODITIES[commodityId];
      if (!def || alloc.points <= 0) continue;

      // Sprawdź czy mamy surowce na recepturę
      const canProduce = this._hasIngredients(def.recipe);
      alloc._paused = !canProduce;
      if (!canProduce) continue;

      // Czas na 1 szt = baseTime / points
      const timePerUnit = def.baseTime / alloc.points;
      alloc.progress += deltaYears;

      // Sprawdź czy ukończono produkcję
      while (alloc.progress >= timePerUnit) {
        // Sprawdź ponownie surowce (mogły się skończyć)
        if (!this._hasIngredients(def.recipe)) {
          alloc._paused = true;
          break;
        }

        // Zużyj surowce
        this._consumeIngredients(def.recipe);
        alloc.progress -= timePerUnit;

        // Dodaj commodity do inventory
        if (this.resourceSystem) {
          this.resourceSystem.receive({ [commodityId]: 1 });
        }

        EventBus.emit('factory:produced', { commodityId, amount: 1 });
      }
    }
  }

  _hasIngredients(recipe) {
    if (!this.resourceSystem) return false;
    for (const [resId, qty] of Object.entries(recipe)) {
      if ((this.resourceSystem.inventory.get(resId) ?? 0) < qty) return false;
    }
    return true;
  }

  _consumeIngredients(recipe) {
    if (!this.resourceSystem) return;
    const costs = {};
    for (const [resId, qty] of Object.entries(recipe)) {
      costs[resId] = qty;
    }
    this.resourceSystem.spend(costs);
  }

  _emitStatus() {
    const isActive = (window.KOSMOS?.factorySystem === this);
    if (isActive) {
      EventBus.emit('factory:statusChanged', {
        allocations: this.getAllocations(),
        totalPoints: this._totalPoints,
        usedPoints:  this.usedPoints,
        freePoints:  this.freePoints,
      });
    }
  }
}
