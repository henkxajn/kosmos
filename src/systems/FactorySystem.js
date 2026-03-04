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

    // Alokacja: Map<commodityId, { points, progress, targetQty, produced }>
    // points: ile punktów przydzielono do tej receptury
    // progress: postęp produkcji w latach (reset do 0 po ukończeniu)
    // targetQty: docelowa ilość (null = nieskończona)
    // produced: licznik wyprodukowanych sztuk
    this._allocations = new Map();

    // Kolejka produkcji: [{commodityId, qty}]
    // Gdy bieżąca alokacja osiągnie target → automatycznie alokuj następny z kolejki
    this._queue = [];

    // Nasłuchuj zdarzeń
    EventBus.on('factory:allocate', ({ commodityId, points }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.allocate(commodityId, points);
    });

    EventBus.on('factory:setTarget', ({ commodityId, qty }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.setTarget(commodityId, qty);
    });

    EventBus.on('factory:enqueue', ({ commodityId, qty }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.enqueue(commodityId, qty);
    });

    EventBus.on('factory:dequeue', ({ index }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.dequeue(index);
    });

    EventBus.on('factory:reorderQueue', ({ index, direction }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      if (direction === 'up') this.moveUp(index);
      else this.moveDown(index);
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
          progress:  existing?.progress ?? 0,
          targetQty: existing?.targetQty ?? null,
          produced:  existing?.produced ?? 0,
        });
      }
    }
    this._emitStatus();
  }

  // Ustaw docelową ilość produkcji (null = nieskończona)
  setTarget(commodityId, qty) {
    const alloc = this._allocations.get(commodityId);
    if (!alloc) return;
    alloc.targetQty = (qty != null && qty > 0) ? qty : null;
    // Reset licznika jeśli nowy cel
    if (alloc.targetQty !== null && alloc.produced >= alloc.targetQty) {
      alloc.produced = 0;
    }
    this._emitStatus();
  }

  // Dodaj do kolejki produkcji
  enqueue(commodityId, qty) {
    const def = COMMODITIES[commodityId];
    if (!def || !qty || qty <= 0) return;
    this._queue.push({ commodityId, qty });
    this._emitStatus();
  }

  // Usuń z kolejki
  dequeue(index) {
    if (index < 0 || index >= this._queue.length) return;
    this._queue.splice(index, 1);
    this._emitStatus();
  }

  // Przesuń w kolejce w górę
  moveUp(index) {
    if (index <= 0 || index >= this._queue.length) return;
    [this._queue[index - 1], this._queue[index]] = [this._queue[index], this._queue[index - 1]];
    this._emitStatus();
  }

  // Przesuń w kolejce w dół
  moveDown(index) {
    if (index < 0 || index >= this._queue.length - 1) return;
    [this._queue[index], this._queue[index + 1]] = [this._queue[index + 1], this._queue[index]];
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
        targetQty:   alloc.targetQty ?? null,
        produced:    alloc.produced ?? 0,
      });
    }
    return result;
  }

  // Pobierz kolejkę (do UI)
  getQueue() { return [...this._queue]; }

  // ── Serializacja ─────────────────────────────────────────────────────────

  serialize() {
    const allocs = [];
    for (const [id, alloc] of this._allocations) {
      allocs.push({
        commodityId: id,
        points:      alloc.points,
        progress:    alloc.progress,
        targetQty:   alloc.targetQty ?? null,
        produced:    alloc.produced ?? 0,
      });
    }
    return {
      totalPoints: this._totalPoints,
      allocations: allocs,
      queue:       [...this._queue],
    };
  }

  restore(data) {
    this._totalPoints = data.totalPoints ?? 0;
    this._allocations.clear();
    if (data.allocations) {
      for (const a of data.allocations) {
        this._allocations.set(a.commodityId, {
          points:    a.points,
          progress:  a.progress ?? 0,
          targetQty: a.targetQty ?? null,
          produced:  a.produced ?? 0,
        });
      }
    }
    this._queue = data.queue ?? [];
  }

  // ── Prywatne ─────────────────────────────────────────────────────────────

  _update(deltaYears) {
    if (this._allocations.size === 0 && this._queue.length === 0) return;

    const targetReached = []; // commodityId które osiągnęły target

    for (const [commodityId, alloc] of this._allocations) {
      const def = COMMODITIES[commodityId];
      if (!def || alloc.points <= 0) continue;

      // Target osiągnięty — zatrzymaj produkcję
      if (alloc.targetQty !== null && alloc.produced >= alloc.targetQty) {
        alloc._paused = true;
        targetReached.push({ commodityId, points: alloc.points });
        continue;
      }

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

        // Sprawdź target
        if (alloc.targetQty !== null && alloc.produced >= alloc.targetQty) {
          alloc._paused = true;
          targetReached.push({ commodityId, points: alloc.points });
          break;
        }

        // Zużyj surowce
        this._consumeIngredients(def.recipe);
        alloc.progress -= timePerUnit;
        alloc.produced = (alloc.produced ?? 0) + 1;

        // Dodaj commodity do inventory
        if (this.resourceSystem) {
          this.resourceSystem.receive({ [commodityId]: 1 });
        }

        EventBus.emit('factory:produced', { commodityId, amount: 1 });
      }
    }

    // Obsługa osiągniętych targetów — zwolnij punkty i alokuj z kolejki
    for (const { commodityId, points } of targetReached) {
      // Usuń ukończoną alokację
      this._allocations.delete(commodityId);
      EventBus.emit('factory:targetReached', { commodityId });

      // Alokuj z kolejki (1 punkt)
      if (this._queue.length > 0 && this.freePoints > 0) {
        const next = this._queue.shift();
        this.allocate(next.commodityId, 1);
        this.setTarget(next.commodityId, next.qty);
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
