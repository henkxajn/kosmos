// FactorySystem — alokacja punktów produkcji, wytwarzanie commodities
//
// Budynek 'factory' daje 1 punkt produkcji.
// 3 tryby pracy: manual (ręczny), priority (priorytetowy), reactive (reaktywny).
// Produkcja zużywa surowce z inventory + zajmuje czas.
//
// EventBus:
//   Nasłuchuje: 'factory:allocate'     { commodityId, points }
//               'factory:setMode'      { mode }
//               'time:tick'            → aktualizacja produkcji
//   Emituje:    'factory:produced'     { commodityId, amount }
//               'factory:statusChanged' { allocations, totalPoints, mode }
//               'factory:modeChanged'  { mode }

import EventBus from '../core/EventBus.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { BASE_DEMAND } from '../data/ConsumerGoodsData.js';

// ── Predefiniowane szablony priorytetów ──────────────────────────────────────
export const PRIORITY_TEMPLATES = {
  fuel: {
    id: 'fuel',
    namePL: 'Paliwo & Logistyka',
    nameEN: 'Fuel & Logistics',
    icon: '⛽',
    items: [
      { commodityId: 'power_cells',       stockTarget: 20 },
      { commodityId: 'structural_alloys', stockTarget: 15 },
      { commodityId: 'conductor_bundles', stockTarget: 10 },
    ],
  },
  expansion: {
    id: 'expansion',
    namePL: 'Rozbudowa',
    nameEN: 'Expansion',
    icon: '🏗',
    items: [
      { commodityId: 'structural_alloys',  stockTarget: 20 },
      { commodityId: 'pressure_modules',   stockTarget: 10 },
      { commodityId: 'electronic_systems', stockTarget: 10 },
      { commodityId: 'extraction_systems', stockTarget: 5 },
    ],
  },
  consumption: {
    id: 'consumption',
    namePL: 'Konsumpcja',
    nameEN: 'Consumption',
    icon: '👥',
    items: [
      { commodityId: 'basic_supplies',  stockTarget: 15 },
      { commodityId: 'civilian_goods',  stockTarget: 10 },
      { commodityId: 'neurostimulants', stockTarget: 5 },
    ],
  },
  research: {
    id: 'research',
    namePL: 'Naukowo-Techniczny',
    nameEN: 'Science & Tech',
    icon: '🔬',
    items: [
      { commodityId: 'electronic_systems',  stockTarget: 15 },
      { commodityId: 'semiconductor_arrays', stockTarget: 8 },
      { commodityId: 'polymer_composites',  stockTarget: 5 },
    ],
  },
  endgame: {
    id: 'endgame',
    namePL: 'Endgame',
    nameEN: 'Endgame',
    icon: '🚀',
    items: [
      { commodityId: 'quantum_cores',    stockTarget: 5 },
      { commodityId: 'antimatter_cells', stockTarget: 3 },
      { commodityId: 'warp_cores',       stockTarget: 1 },
    ],
  },
};

// Kolejność źródeł zapotrzebowania (reaktywny)
const DEFAULT_REACTIVE_ORDER = ['build', 'fuel', 'consumption', 'trade', 'safety'];

export class FactorySystem {
  constructor(resourceSystem) {
    this.resourceSystem = resourceSystem;

    // Całkowita liczba punktów produkcji (= liczba fabryk × level)
    this._totalPoints = 0;

    // Alokacja: Map<commodityId, { points, progress, targetQty, produced }>
    this._allocations = new Map();

    // Kolejka produkcji: [{commodityId, qty}]
    this._queue = [];

    // ── Tryb automatyzacji ──────────────────────────────────────────────────
    // 'manual' = obecny system, 'priority' = lista celów, 'reactive' = auto
    this._mode = 'manual';

    // Tryb priorytetowy: lista celów zapasowych
    // [{ commodityId, stockTarget }] — kolejność = priorytet
    this._priorityList = [];

    // Auto-łańcuch: tymczasowa produkcja składników
    // [{ commodityId, qty, produced, forCommodityId }]
    this._autoChain = [];

    // Szablony użytkownika (max 3)
    // [{ name, items: [{ commodityId, stockTarget }] }]
    this._customTemplates = [];

    // Tryb reaktywny: kolejność źródeł zapotrzebowania
    this._reactiveSourceOrder = [...DEFAULT_REACTIVE_ORDER];

    // Cache ostatniego skanu reaktywnego (do UI)
    this._reactiveDemand = [];

    // Interwał auto-alokacji (nie co tick — co ~0.1 roku civ)
    this._autoAllocTimer = 0;
    this._AUTO_ALLOC_INTERVAL = 0.1; // lata civ

    // ── EventBus listeners ──────────────────────────────────────────────────
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

    EventBus.on('factory:setMode', ({ mode }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.setMode(mode);
    });

    EventBus.on('factory:addPriority', ({ commodityId, stockTarget }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.addPriority(commodityId, stockTarget);
    });

    EventBus.on('factory:removePriority', ({ commodityId }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.removePriority(commodityId);
    });

    EventBus.on('factory:reorderPriority', ({ fromIdx, toIdx }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.reorderPriority(fromIdx, toIdx);
    });

    EventBus.on('factory:setPriorityTarget', ({ commodityId, stockTarget }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.setPriorityTarget(commodityId, stockTarget);
    });

    EventBus.on('factory:applyTemplate', ({ templateId }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.applyTemplate(templateId);
    });

    EventBus.on('factory:saveCustomTemplate', ({ name }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.saveCustomTemplate(name);
    });

    EventBus.on('factory:deleteCustomTemplate', ({ index }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this.deleteCustomTemplate(index);
    });

    EventBus.on('factory:setReactiveOrder', ({ order }) => {
      if (window.KOSMOS?.factorySystem !== this) return;
      this._reactiveSourceOrder = order;
      this._emitStatus();
    });

    // Tick produkcji (civDeltaYears)
    EventBus.on('time:tick', ({ civDeltaYears: deltaYears }) => this._update(deltaYears));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API publiczne — tryby
  // ══════════════════════════════════════════════════════════════════════════

  get mode() { return this._mode; }

  setMode(mode) {
    if (!['manual', 'priority', 'reactive'].includes(mode)) return;
    if (mode === this._mode) return;

    const oldMode = this._mode;
    this._mode = mode;

    // Konwersja manual → priority: istniejące alokacje → lista priorytetów
    if (oldMode === 'manual' && mode === 'priority') {
      this._convertAllocsToPriority();
    }

    // Konwersja reactive → manual: zamróź aktualne alokacje
    // (nic nie robimy — alokacje zostają)

    // Wyczyść auto-łańcuch przy zmianie trybu
    this._autoChain = [];

    EventBus.emit('factory:modeChanged', { mode });
    this._emitStatus();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API publiczne — tryb priorytetowy
  // ══════════════════════════════════════════════════════════════════════════

  get priorityList() { return [...this._priorityList]; }

  addPriority(commodityId, stockTarget = 10) {
    const def = COMMODITIES[commodityId];
    if (!def) return;
    // Nie dodawaj duplikatów
    if (this._priorityList.some(p => p.commodityId === commodityId)) return;
    this._priorityList.push({ commodityId, stockTarget });
    this._emitStatus();
  }

  removePriority(commodityId) {
    const idx = this._priorityList.findIndex(p => p.commodityId === commodityId);
    if (idx === -1) return;
    this._priorityList.splice(idx, 1);
    this._emitStatus();
  }

  reorderPriority(fromIdx, toIdx) {
    if (fromIdx < 0 || fromIdx >= this._priorityList.length) return;
    if (toIdx < 0 || toIdx >= this._priorityList.length) return;
    const [item] = this._priorityList.splice(fromIdx, 1);
    this._priorityList.splice(toIdx, 0, item);
    this._emitStatus();
  }

  setPriorityTarget(commodityId, stockTarget) {
    const item = this._priorityList.find(p => p.commodityId === commodityId);
    if (!item) return;
    item.stockTarget = Math.max(1, Math.min(999, stockTarget));
    this._emitStatus();
  }

  applyTemplate(templateId) {
    // Sprawdź custom templates najpierw
    const custom = this._customTemplates.find((t, i) => `custom_${i}` === templateId);
    const tpl = custom ?? PRIORITY_TEMPLATES[templateId];
    if (!tpl) return;

    // Ustaw nową listę (filtruj niedostępne)
    this._priorityList = (tpl.items || [])
      .filter(item => this.isRecipeAvailable(item.commodityId))
      .map(item => ({ commodityId: item.commodityId, stockTarget: item.stockTarget }));
    this._emitStatus();
  }

  saveCustomTemplate(name) {
    if (this._customTemplates.length >= 3) return;
    this._customTemplates.push({
      name: name || `Szablon ${this._customTemplates.length + 1}`,
      items: this._priorityList.map(p => ({ ...p })),
    });
    this._emitStatus();
  }

  deleteCustomTemplate(index) {
    if (index < 0 || index >= this._customTemplates.length) return;
    this._customTemplates.splice(index, 1);
    this._emitStatus();
  }

  get customTemplates() { return [...this._customTemplates]; }
  get autoChain() { return [...this._autoChain]; }
  get reactiveDemand() { return [...this._reactiveDemand]; }
  get reactiveSourceOrder() { return [...this._reactiveSourceOrder]; }

  // ══════════════════════════════════════════════════════════════════════════
  // API publiczne — obecny system (manual)
  // ══════════════════════════════════════════════════════════════════════════

  setTotalPoints(points) {
    this._totalPoints = Math.max(0, points);
    this._emitStatus();
  }

  get totalPoints() { return this._totalPoints; }

  get usedPoints() {
    let sum = 0;
    for (const alloc of this._allocations.values()) sum += alloc.points;
    return sum;
  }

  get freePoints() { return Math.max(0, this._totalPoints - this.usedPoints); }

  allocate(commodityId, points) {
    // W trybie auto — nie pozwól na ręczne zmiany
    if (this._mode !== 'manual') return;

    const def = COMMODITIES[commodityId];
    if (!def) return;

    if (points <= 0) {
      const had = this._allocations.has(commodityId);
      this._allocations.delete(commodityId);
      if (had) this._promoteFromQueue();
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

  setTarget(commodityId, qty) {
    if (this._mode !== 'manual') return;
    const alloc = this._allocations.get(commodityId);
    if (!alloc) return;
    alloc.targetQty = (qty != null && qty > 0) ? qty : null;
    if (alloc.targetQty !== null && alloc.produced >= alloc.targetQty) {
      alloc.produced = 0;
    }
    this._emitStatus();
  }

  enqueue(commodityId, qty) {
    if (this._mode !== 'manual') return;
    const def = COMMODITIES[commodityId];
    if (!def || !qty || qty <= 0) return;
    this._queue.push({ commodityId, qty });
    this._emitStatus();
  }

  dequeue(index) {
    if (this._mode !== 'manual') return;
    if (index < 0 || index >= this._queue.length) return;
    this._queue.splice(index, 1);
    this._emitStatus();
  }

  moveUp(index) {
    if (this._mode !== 'manual') return;
    if (index <= 0 || index >= this._queue.length) return;
    [this._queue[index - 1], this._queue[index]] = [this._queue[index], this._queue[index - 1]];
    this._emitStatus();
  }

  moveDown(index) {
    if (this._mode !== 'manual') return;
    if (index < 0 || index >= this._queue.length - 1) return;
    [this._queue[index], this._queue[index + 1]] = [this._queue[index + 1], this._queue[index]];
    this._emitStatus();
  }

  getAllocations() {
    const result = [];
    for (const [id, alloc] of this._allocations) {
      const def = COMMODITIES[id];
      if (!def) continue;
      const scenarioMult = window.KOSMOS?.scenario === 'civilization_boosted' ? 1.5 : 1;
      const techSpeedMult = window.KOSMOS?.techSystem?.getFactorySpeedMultiplier() ?? 1.0;
      const speedMult = scenarioMult * techSpeedMult;
      const timePerUnit = def.baseTime / (alloc.points * speedMult);
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
        isChain:     alloc._isChain ?? false,  // flaga auto-łańcucha
      });
    }
    return result;
  }

  getQueue() { return [...this._queue]; }

  isRecipeAvailable(commodityId) {
    const def = COMMODITIES[commodityId];
    if (!def) return false;
    if (!def.requiresTech) return true;
    const techSys = window.KOSMOS?.techSystem;
    return techSys?.isResearched(def.requiresTech) ?? false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Serializacja
  // ══════════════════════════════════════════════════════════════════════════

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
      totalPoints:          this._totalPoints,
      allocations:          allocs,
      queue:                [...this._queue],
      mode:                 this._mode,
      priorityList:         this._priorityList.map(p => ({ ...p })),
      customTemplates:      this._customTemplates.map(t => ({
        name: t.name,
        items: t.items.map(i => ({ ...i })),
      })),
      reactiveSourceOrder:  [...this._reactiveSourceOrder],
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
    this._mode = data.mode ?? 'manual';
    this._priorityList = data.priorityList ?? [];
    this._customTemplates = data.customTemplates ?? [];
    this._reactiveSourceOrder = data.reactiveSourceOrder ?? [...DEFAULT_REACTIVE_ORDER];
    this._autoChain = [];
    this._reactiveDemand = [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Tick produkcji
  // ══════════════════════════════════════════════════════════════════════════

  _update(deltaYears) {
    // Auto-alokacja (priorytetowy/reaktywny) co interwał
    if (this._mode !== 'manual') {
      this._autoAllocTimer += deltaYears;
      if (this._autoAllocTimer >= this._AUTO_ALLOC_INTERVAL) {
        this._autoAllocTimer = 0;
        if (this._mode === 'priority') this._priorityAllocate();
        else if (this._mode === 'reactive') this._reactiveAllocate();
      }
    }

    // Produkcja (wspólna dla wszystkich trybów)
    if (this._allocations.size === 0 && this._queue.length === 0) return;

    const targetReached = [];

    for (const [commodityId, alloc] of this._allocations) {
      const def = COMMODITIES[commodityId];
      if (!def || alloc.points <= 0) continue;

      // Target osiągnięty
      if (alloc.targetQty !== null && alloc.produced >= alloc.targetQty) {
        alloc._paused = true;
        targetReached.push({ commodityId, points: alloc.points });
        continue;
      }

      // Sprawdź surowce
      const canProduce = this._hasIngredients(def.recipe, commodityId);
      alloc._paused = !canProduce;
      if (!canProduce) continue;

      // Czas na 1 szt
      const scenarioMult = window.KOSMOS?.scenario === 'civilization_boosted' ? 1.5 : 1;
      const techSpeedMult = window.KOSMOS?.techSystem?.getFactorySpeedMultiplier() ?? 1.0;
      const speedMult = scenarioMult * techSpeedMult;
      const timePerUnit = def.baseTime / (alloc.points * speedMult);
      alloc.progress += deltaYears;

      while (alloc.progress >= timePerUnit) {
        if (!this._hasIngredients(def.recipe, commodityId)) {
          alloc._paused = true;
          break;
        }
        if (alloc.targetQty !== null && alloc.produced >= alloc.targetQty) {
          alloc._paused = true;
          targetReached.push({ commodityId, points: alloc.points });
          break;
        }

        this._consumeIngredients(def.recipe, commodityId);
        alloc.progress -= timePerUnit;
        alloc.produced = (alloc.produced ?? 0) + 1;

        if (this.resourceSystem) {
          this.resourceSystem.receive({ [commodityId]: 1 });
        }

        EventBus.emit('factory:produced', { commodityId, amount: 1 });
      }
    }

    // Obsługa targetów
    for (const { commodityId } of targetReached) {
      this._allocations.delete(commodityId);
      EventBus.emit('factory:targetReached', { commodityId });
    }
    if (targetReached.length > 0) {
      if (this._mode === 'manual') this._promoteFromQueue();
      this._emitStatus();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Tryb priorytetowy — auto-alokacja
  // ══════════════════════════════════════════════════════════════════════════

  _priorityAllocate() {
    if (this._totalPoints === 0) return;

    // Zbierz deficyty z listy priorytetów
    const needs = [];
    for (const item of this._priorityList) {
      const def = COMMODITIES[item.commodityId];
      if (!def || !this.isRecipeAvailable(item.commodityId)) continue;
      const stock = this._getStock(item.commodityId);
      const deficit = Math.max(0, item.stockTarget - stock);
      needs.push({ commodityId: item.commodityId, deficit, stockTarget: item.stockTarget });
    }

    // Zbierz potrzeby auto-łańcucha
    const chainNeeds = this._resolveChainNeeds(needs);

    // Wyczyść obecne alokacje (zachowaj postęp)
    const oldProgress = new Map();
    for (const [id, alloc] of this._allocations) {
      oldProgress.set(id, { progress: alloc.progress, produced: alloc.produced });
    }
    this._allocations.clear();

    // Najpierw przydziel łańcuch (max 50% FP)
    const maxChainFP = Math.max(1, Math.floor(this._totalPoints * 0.5));
    let chainFPUsed = 0;
    const newAutoChain = [];

    for (const ch of chainNeeds) {
      if (chainFPUsed >= maxChainFP) break;
      const stock = this._getStock(ch.commodityId);
      const stillNeeded = Math.max(0, ch.qty - stock);
      if (stillNeeded <= 0) continue;

      const fp = Math.min(1, maxChainFP - chainFPUsed);
      const old = oldProgress.get(ch.commodityId);
      this._allocations.set(ch.commodityId, {
        points: fp,
        progress: old?.progress ?? 0,
        targetQty: stillNeeded,
        produced: old?.produced ?? 0,
        _isChain: true,
      });
      chainFPUsed += fp;
      newAutoChain.push({
        commodityId: ch.commodityId,
        qty: stillNeeded,
        produced: this._getStock(ch.commodityId),
        forCommodityId: ch.forCommodityId,
      });
    }
    this._autoChain = newAutoChain;

    // Przydziel resztę FP do głównych priorytetów
    let remainingFP = this._totalPoints - chainFPUsed;

    for (const need of needs) {
      if (remainingFP <= 0) break;
      if (need.deficit <= 0) continue;

      const fp = Math.min(1, remainingFP);
      const existing = this._allocations.get(need.commodityId);
      if (existing) {
        // Jeśli łańcuch już alokował — dodaj FP
        existing.points += fp;
      } else {
        const old = oldProgress.get(need.commodityId);
        this._allocations.set(need.commodityId, {
          points: fp,
          progress: old?.progress ?? 0,
          targetQty: need.deficit,
          produced: old?.produced ?? 0,
          _isChain: false,
        });
      }
      remainingFP -= fp;
    }

    // Jeśli zostały wolne FP, rozdaj dodatkowe punkty proporcjonalnie do deficytu
    if (remainingFP > 0) {
      const activeNeeds = needs.filter(n => n.deficit > 0 && this._allocations.has(n.commodityId));
      while (remainingFP > 0 && activeNeeds.length > 0) {
        // Daj dodatkowy FP temu z największym deficytem
        activeNeeds.sort((a, b) => b.deficit - a.deficit);
        const best = activeNeeds[0];
        const alloc = this._allocations.get(best.commodityId);
        if (alloc) {
          alloc.points += 1;
          remainingFP -= 1;
          best.deficit -= 1; // Zmniejsz wirtualnie żeby rozłożyć FP
          if (best.deficit <= 0) activeNeeds.shift();
        } else {
          break;
        }
      }
    }
  }

  // Rozwiąż łańcuch składników — zwróć listę brakujących sub-commodities
  _resolveChainNeeds(mainNeeds) {
    const chainMap = new Map(); // commodityId → { qty, forCommodityId }

    for (const need of mainNeeds) {
      if (need.deficit <= 0) continue;
      this._addChainFor(need.commodityId, need.deficit, need.commodityId, chainMap, 0);
    }

    // Zwróć jako tablicę posortowaną po tierze (niższy tier = produkuj pierwszy)
    return [...chainMap.values()]
      .sort((a, b) => (COMMODITIES[a.commodityId]?.tier ?? 0) - (COMMODITIES[b.commodityId]?.tier ?? 0));
  }

  _addChainFor(commodityId, qty, forCommodityId, chainMap, depth) {
    if (depth > 3) return; // max 3 poziomy rekurencji
    const def = COMMODITIES[commodityId];
    if (!def) return;

    for (const [ingId, ingQty] of Object.entries(def.recipe)) {
      const ingDef = COMMODITIES[ingId];
      if (!ingDef) continue; // to surowiec, nie commodity — pomiń
      if (!this.isRecipeAvailable(ingId)) continue;

      const totalNeeded = qty * ingQty;
      const stock = this._getStock(ingId);
      const deficit = Math.max(0, totalNeeded - stock);

      if (deficit > 0) {
        const existing = chainMap.get(ingId);
        if (existing) {
          existing.qty = Math.max(existing.qty, deficit);
        } else {
          chainMap.set(ingId, { commodityId: ingId, qty: deficit, forCommodityId });
        }
        // Rekurencja: ten składnik też może potrzebować składników
        this._addChainFor(ingId, deficit, forCommodityId, chainMap, depth + 1);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Tryb reaktywny — auto-detekcja zapotrzebowania
  // ══════════════════════════════════════════════════════════════════════════

  _reactiveAllocate() {
    if (this._totalPoints === 0) return;

    // Skanuj zapotrzebowanie z 5 źródeł
    const demandItems = this._scanDemand();
    this._reactiveDemand = demandItems; // cache do UI

    // Wyczyść obecne alokacje (zachowaj postęp)
    const oldProgress = new Map();
    for (const [id, alloc] of this._allocations) {
      oldProgress.set(id, { progress: alloc.progress, produced: alloc.produced });
    }
    this._allocations.clear();
    this._autoChain = [];

    // Przydziel FP wg priorytetów zapotrzebowania
    let remainingFP = this._totalPoints;

    // Agreguj zapotrzebowanie po commodityId — bierz MAX qty (nie sumuj)
    // i zachowaj najwyższy priorytet źródła
    const sourceOrder = this._reactiveSourceOrder;
    const aggregated = new Map();
    for (const d of demandItems) {
      const existing = aggregated.get(d.commodityId);
      const srcPriority = sourceOrder.indexOf(d.source);
      if (existing) {
        existing.qty = Math.max(existing.qty, d.qty);
        existing.priority = Math.min(existing.priority, srcPriority);
        if (!existing.sources.includes(d.source)) existing.sources.push(d.source);
      } else {
        aggregated.set(d.commodityId, {
          commodityId: d.commodityId,
          qty: d.qty,
          sources: [d.source],
          priority: srcPriority >= 0 ? srcPriority : 99,
        });
      }
    }

    // Sortuj wg priorytetu źródła (Build=0 pierwszy) potem wg deficytu malejąco
    const sorted = [...aggregated.values()].map(agg => {
      const stock = this._getStock(agg.commodityId);
      return { ...agg, stock, deficit: Math.max(0, agg.qty - stock) };
    }).filter(a => a.deficit > 0 && this.isRecipeAvailable(a.commodityId))
      .sort((a, b) => a.priority !== b.priority ? a.priority - b.priority : b.deficit - a.deficit);

    // Alokuj FP — każdy towar z deficytem dostaje min 1 FP
    for (const agg of sorted) {
      if (remainingFP <= 0) break;

      const fp = Math.min(1, remainingFP);
      const old = oldProgress.get(agg.commodityId);
      this._allocations.set(agg.commodityId, {
        points: fp,
        progress: old?.progress ?? 0,
        targetQty: agg.deficit,
        produced: old?.produced ?? 0,
        _isChain: false,
      });
      remainingFP -= fp;
    }

    // Rozdziel dodatkowe FP proporcjonalnie do deficytu
    if (remainingFP > 0) {
      const active = sorted.filter(a => this._allocations.has(a.commodityId));
      for (const a of active) {
        if (remainingFP <= 0) break;
        const alloc = this._allocations.get(a.commodityId);
        if (alloc) {
          alloc.points += 1;
          remainingFP -= 1;
        }
      }
    }

    // Rozwiąż auto-łańcuch dla reaktywnych celów
    const needs = [...aggregated.values()].map(a => ({
      commodityId: a.commodityId,
      deficit: Math.max(0, a.qty - this._getStock(a.commodityId)),
      stockTarget: a.qty,
    }));
    const chainNeeds = this._resolveChainNeeds(needs);
    const maxChainFP = Math.max(1, Math.floor(this._totalPoints * 0.3));
    let chainFPUsed = 0;

    for (const ch of chainNeeds) {
      if (chainFPUsed >= maxChainFP) break;
      if (this._allocations.has(ch.commodityId)) continue; // już alokowany
      const stock = this._getStock(ch.commodityId);
      if (stock >= ch.qty) continue;

      const fp = Math.min(1, maxChainFP - chainFPUsed);
      const old = oldProgress.get(ch.commodityId);
      this._allocations.set(ch.commodityId, {
        points: fp,
        progress: old?.progress ?? 0,
        targetQty: ch.qty - stock,
        produced: 0,
        _isChain: true,
      });
      chainFPUsed += fp;
    }
  }

  // Skanuj 5 źródeł zapotrzebowania wg ustalonej kolejności
  _scanDemand() {
    const result = [];
    const scanners = {
      build:       () => this._scanBuildDemand(),
      fuel:        () => this._scanFuelDemand(),
      consumption: () => this._scanConsumptionDemand(),
      trade:       () => this._scanTradeDemand(),
      safety:      () => this._scanSafetyStockDemand(),
    };

    for (const source of this._reactiveSourceOrder) {
      const fn = scanners[source];
      if (fn) {
        const items = fn();
        for (const item of items) {
          result.push({ ...item, source });
        }
      }
    }
    return result;
  }

  // Źródło 1: Budowa — commodities potrzebne do pending builds i statków
  // WAŻNE: qty = CAŁKOWITA potrzeba (nie deficyt) — deficyt liczy alokator
  _scanBuildDemand() {
    const items = [];
    const bSys = window.KOSMOS?.buildingSystem;
    if (bSys?.getPendingDemand) {
      const demand = bSys.getPendingDemand();
      for (const [resId, qty] of Object.entries(demand)) {
        if (!COMMODITIES[resId]) continue; // tylko commodities
        if (qty > 0) {
          items.push({ commodityId: resId, qty });
        }
      }
    }

    // Pending ship orders
    const colMgr = window.KOSMOS?.colonyManager;
    const homePlanet = window.KOSMOS?.homePlanet;
    if (colMgr && homePlanet) {
      const pending = colMgr.getPendingShipOrders?.(homePlanet.id) ?? [];
      for (const order of pending) {
        for (const [resId, qty] of Object.entries(order.cost ?? {})) {
          if (!COMMODITIES[resId]) continue;
          if (qty > 0) {
            items.push({ commodityId: resId, qty });
          }
        }
      }
    }
    return items;
  }

  // Źródło 2: Paliwo — power_cells potrzebne do tankowania floty
  // qty = CAŁKOWITA potrzeba (deficyt liczy alokator)
  _scanFuelDemand() {
    const items = [];
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return items;

    let fuelNeeded = 0;
    for (const vessel of vMgr.getAllVessels()) {
      if (vessel.position?.state === 'docked') {
        const max = vessel.fuel?.max ?? 0;
        const current = vessel.fuel?.current ?? 0;
        if (current < max * 0.5) {
          fuelNeeded += (max - current);
        }
      }
    }

    if (fuelNeeded > 0) {
      const fuelType = 'power_cells';
      items.push({ commodityId: fuelType, qty: Math.ceil(fuelNeeded) });
    }
    return items;
  }

  // Źródło 3: Konsumpcja — dobra konsumpcyjne na 5 lat
  // qty = CAŁKOWITA potrzeba (deficyt liczy alokator)
  _scanConsumptionDemand() {
    const items = [];
    const civSys = window.KOSMOS?.civSystem;
    if (!civSys) return items;

    const pop = civSys.population ?? 0;
    if (pop <= 0) return items;

    const yearsBuffer = 5;
    for (const [goodId, rate] of Object.entries(BASE_DEMAND)) {
      if (!COMMODITIES[goodId]) continue;
      if (!this.isRecipeAvailable(goodId)) continue;
      const needed = Math.ceil(pop * rate * yearsBuffer);
      items.push({ commodityId: goodId, qty: needed });
    }
    return items;
  }

  // Źródło 4: Handel — towary eksportowane generujące Kredyty
  // qty = bufor docelowy (deficyt liczy alokator)
  _scanTradeDemand() {
    const items = [];
    const tradeSys = window.KOSMOS?.civilianTradeSystem;
    if (!tradeSys) return items;

    const connections = tradeSys._connections ?? [];
    const exported = new Set();
    for (const conn of connections) {
      if (conn.goods) {
        for (const g of conn.goods) exported.add(g.goodId);
      }
    }

    for (const goodId of exported) {
      if (!COMMODITIES[goodId] || !this.isRecipeAvailable(goodId)) continue;
      items.push({ commodityId: goodId, qty: 5 });
    }
    return items;
  }

  // Źródło 5: Zapas bezpieczeństwa — minimalne zapasy T1-T2
  // qty = docelowy minimalny zapas (deficyt liczy alokator)
  _scanSafetyStockDemand() {
    const items = [];
    for (const [id, def] of Object.entries(COMMODITIES)) {
      if (!this.isRecipeAvailable(id)) continue;
      const minStock = (def.tier <= 2) ? 3 : 1;
      items.push({ commodityId: id, qty: minStock });
    }
    return items;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpery
  // ══════════════════════════════════════════════════════════════════════════

  // Konwersja istniejących alokacji na listę priorytetów
  _convertAllocsToPriority() {
    if (this._priorityList.length > 0) return; // nie nadpisuj istniejącej listy
    for (const [id, alloc] of this._allocations) {
      const stock = this._getStock(id);
      this._priorityList.push({
        commodityId: id,
        stockTarget: alloc.targetQty ?? (stock + 10),
      });
    }
  }

  // Pobierz aktualny zapas towaru
  getStock(commodityId) {
    return this.resourceSystem?.inventory?.get(commodityId) ?? 0;
  }

  _getStock(commodityId) {
    return this.getStock(commodityId);
  }

  _promoteFromQueue() {
    while (this._queue.length > 0 && this.freePoints > 0) {
      const next = this._queue.shift();
      const existing = this._allocations.get(next.commodityId);
      if (existing) {
        if (existing.targetQty !== null) {
          existing.targetQty += next.qty;
        }
        continue;
      }
      const pts = Math.min(1, this.freePoints);
      this._allocations.set(next.commodityId, {
        points: pts,
        progress: 0,
        targetQty: next.qty,
        produced: 0,
      });
    }
  }

  _getScaledRecipe(recipe, commodityId) {
    const isBoosted = window.KOSMOS?.scenario === 'civilization_boosted';
    if (!isBoosted) return recipe;
    const def = COMMODITIES[commodityId];
    if (!def || def.tier !== 1) return recipe;
    const scaled = {};
    for (const resId in recipe) {
      scaled[resId] = recipe[resId] * 5;
    }
    return scaled;
  }

  _hasIngredients(recipe, commodityId) {
    if (!this.resourceSystem) return false;
    const actual = this._getScaledRecipe(recipe, commodityId);
    for (const resId in actual) {
      if ((this.resourceSystem.inventory.get(resId) ?? 0) < actual[resId]) return false;
    }
    return true;
  }

  _consumeIngredients(recipe, commodityId) {
    if (!this.resourceSystem) return;
    const actual = this._getScaledRecipe(recipe, commodityId);
    this.resourceSystem.spend(actual);
  }

  _emitStatus() {
    const isActive = (window.KOSMOS?.factorySystem === this);
    if (isActive) {
      EventBus.emit('factory:statusChanged', {
        allocations: this.getAllocations(),
        totalPoints: this._totalPoints,
        usedPoints:  this.usedPoints,
        freePoints:  this.freePoints,
        mode:        this._mode,
      });
    }
  }
}
