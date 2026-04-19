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

    // Ręczny bonus zapasu per-towar: Map<commodityId, number>
    // Dodawany do bazowego celu (safety stock tier default / consumption base)
    this._demandBonus = new Map();

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

    // Po wejściu w tryb reaktywny od razu napełnij cache demand
    // (bez tego UI czeka do 0.1 civYears na pierwszy _reactiveAllocate)
    if (mode === 'reactive') this._reactiveAllocate();

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

  /** Bonus zapasu gracza dla towaru (dodawany do bazowego celu) */
  getDemandBonus(commodityId) {
    return this._demandBonus.get(commodityId) ?? 0;
  }

  /** Zmień bonus zapasu (min 0) */
  setDemandBonus(commodityId, value) {
    const clamped = Math.max(0, Math.round(value));
    if (clamped === 0) {
      this._demandBonus.delete(commodityId);
    } else {
      this._demandBonus.set(commodityId, clamped);
    }
    this._emitStatus();
  }

  /** Cel zapasu bezpieczeństwa (domyślny wg tieru + bonus gracza) */
  getSafetyStockTarget(commodityId) {
    const def = COMMODITIES[commodityId];
    const base = (def?.tier <= 2) ? 3 : 1;
    return base + this.getDemandBonus(commodityId);
  }

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

    // Tech-gate: nie pozwól rozpocząć produkcji jeśli receptura jest zablokowana.
    // points<=0 to rozbiórka — pozwalamy (ktoś mógł odblokować allocate przed
    // utratą techu, teraz pozwól mu ją usunąć).
    if (points > 0 && !this.isRecipeAvailable(commodityId)) return;

    if (points <= 0) {
      const had = this._allocations.has(commodityId);
      this._allocations.delete(commodityId);
      if (had) {
        this._promoteFromQueue(); // promoteFromQueue woła _autoConsolidate() na końcu
      }
    } else {
      const existing = this._allocations.get(commodityId);
      // Dodaj z min 1 FP — konsolidacja skoryguje tylko jeśli suma > totalPoints
      this._allocations.set(commodityId, {
        points: Math.max(1, points),
        progress:  existing?.progress ?? 0,
        targetQty: existing?.targetQty ?? null,
        produced:  existing?.produced ?? 0,
      });
      this._autoConsolidate();
    }
    this._emitStatus();
  }

  setTarget(commodityId, qty) {
    if (this._mode !== 'manual') return;
    const alloc = this._allocations.get(commodityId);
    if (!alloc) return;
    const oldTarget = alloc.targetQty;
    alloc.targetQty = (qty != null && qty > 0) ? qty : null;
    if (alloc.targetQty !== null && alloc.produced >= alloc.targetQty) {
      alloc.produced = 0;
    }
    // Nowy lub zwiększony target → auto-kolejkuj brakujące składniki
    if (alloc.targetQty !== null && (oldTarget === null || alloc.targetQty > oldTarget)) {
      this._enqueuePrereqs(commodityId, alloc.targetQty - (alloc.produced ?? 0));
    }
    this._emitStatus();
  }

  enqueue(commodityId, qty) {
    if (this._mode !== 'manual') return;
    const def = COMMODITIES[commodityId];
    if (!def || !qty || qty <= 0) return;
    // Tech-gate: receptura musi być odblokowana
    if (!this.isRecipeAvailable(commodityId)) return;
    // Auto-kolejkuj brakujące składniki (commodity) PRZED głównym produktem
    this._enqueuePrereqs(commodityId, qty);
    this._queue.push({ commodityId, qty });
    // Natychmiast promuj z kolejki jeśli są wolne sloty
    this._promoteFromQueue();
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
      // Alokacja z 0 FP (zwykle zablokowana przez _autoConsolidate — brak
      // składników lub cel osiągnięty) UI traktuje jako "stalled".
      const isPaused = (alloc._paused ?? false) || (alloc.points <= 0);
      result.push({
        commodityId: id,
        namePL:      def.namePL,
        icon:        def.icon,
        points:      alloc.points,
        progress:    alloc.progress,
        timePerUnit,
        pctComplete: Math.min(100, (alloc.progress / timePerUnit) * 100),
        paused:      isPaused,
        targetQty:   alloc.targetQty ?? null,
        produced:    alloc.produced ?? 0,
        isChain:     alloc._isChain ?? false,       // flaga auto-łańcucha
        blockedByTech: alloc._blockedByTech ?? null, // [{ingredientId, requiresTech}]
      });
    }
    return result;
  }

  getQueue() { return [...this._queue]; }

  isRecipeAvailable(commodityId) {
    const def = COMMODITIES[commodityId];
    if (!def) return false;
    const techSys = window.KOSMOS?.techSystem;
    // Priorytet: efekty `unlockCommodity` w drzewie tech (JEDNO źródło prawdy).
    // Commodity może być odblokowane przez kilka tech'ów — isCommodityUnlocked
    // zwraca true jeśli DOWOLNA zbadana tech ma unlockCommodity dla tego id.
    if (techSys?.isCommodityUnlocked?.(commodityId)) return true;
    // Fallback: pole requiresTech z CommoditiesData (dla towarów bez wpisu
    // unlockCommodity w TechData, np. prefabrykaty, consumer goods).
    if (!def.requiresTech) return true;
    return techSys?.isResearched(def.requiresTech) ?? false;
  }

  // Zwróć listę sub-składników (commodity) zablokowanych technologicznie.
  // Używane do ostrzeżenia UI: "zablokowane przez tech X sub-składnika Y".
  _getTechBlockedIngredients(commodityId) {
    const def = COMMODITIES[commodityId];
    if (!def?.recipe) return [];
    const blocked = [];
    for (const ingId of Object.keys(def.recipe)) {
      const ingDef = COMMODITIES[ingId];
      if (!ingDef) continue; // surowiec bazowy — nie ma tech-gate
      if (this.isRecipeAvailable(ingId)) continue;
      blocked.push({
        ingredientId: ingId,
        requiresTech:  ingDef.requiresTech ?? null,
      });
    }
    return blocked;
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
      demandBonus: Object.fromEntries(this._demandBonus),
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
    this._demandBonus = new Map(Object.entries(data.demandBonus ?? data.safetyStockOverrides ?? {}));
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

    // Konsolidacja: 1 produkt → pełna moc
    this._autoConsolidate();

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

    // Zbierz potrzeby auto-łańcucha + tech-blockady
    const { chain: chainNeeds, blocked: blockedByTechMap } = this._resolveChainNeeds(needs);

    // Wyczyść obecne alokacje (zachowaj postęp)
    const oldProgress = new Map();
    for (const [id, alloc] of this._allocations) {
      oldProgress.set(id, { progress: alloc.progress, produced: alloc.produced });
    }
    this._allocations.clear();

    // Pojedynczy budżet FP — chain i main konkurują o ten sam zasób.
    // Faktyczny balans (kto dostaje ile) robi _autoConsolidate na podstawie
    // tego KTO może produkować (aktywne vs zablokowane brakiem składnika).
    let remainingFP = this._totalPoints;
    const newAutoChain = [];

    // Alokuj najpierw łańcuch (niższy tier → musi powstać zanim powstanie parent)
    for (const ch of chainNeeds) {
      if (remainingFP <= 0) break;
      const stock = this._getStock(ch.commodityId);
      const stillNeeded = Math.max(0, ch.qty - stock);
      if (stillNeeded <= 0) continue;

      const fp = Math.min(1, remainingFP);
      const old = oldProgress.get(ch.commodityId);
      this._allocations.set(ch.commodityId, {
        points: fp,
        progress: old?.progress ?? 0,
        targetQty: stillNeeded,
        produced: old?.produced ?? 0,
        _isChain: true,
      });
      remainingFP -= fp;
      newAutoChain.push({
        commodityId: ch.commodityId,
        qty: stillNeeded,
        produced: stock,
        forCommodityId: ch.forCommodityId,
      });
    }
    this._autoChain = newAutoChain;

    // Przydziel resztę FP do głównych priorytetów.
    // Gdy chain pochłonął cały budżet FP, rejestrujemy main z 0 FP —
    // _autoConsolidate przekaże mu FP gdy chain skończy (Bug #4/5 fix).
    for (const need of needs) {
      if (need.deficit <= 0) continue;

      const blockedByTech = blockedByTechMap.get(need.commodityId) ?? null;
      const fp = Math.min(1, Math.max(0, remainingFP));
      const existing = this._allocations.get(need.commodityId);
      if (existing) {
        existing.points += fp;
      } else {
        const old = oldProgress.get(need.commodityId);
        this._allocations.set(need.commodityId, {
          points: fp,
          progress: old?.progress ?? 0,
          targetQty: need.deficit,
          produced: old?.produced ?? 0,
          _isChain: false,
          _blockedByTech: (blockedByTech && blockedByTech.length > 0) ? blockedByTech : null,
        });
      }
      remainingFP -= fp;
    }

    // Dodatkowe FP → _autoConsolidate rozdzieli po _hasIngredients (aktywne/zablokowane).
    // Zostawiamy tu: jeśli wszyscy potrzebują i mają dostępne składniki,
    // bonus pójdzie do items z największym deficytem.
    if (remainingFP > 0) {
      const activeNeeds = needs.filter(n => n.deficit > 0 && this._allocations.has(n.commodityId));
      while (remainingFP > 0 && activeNeeds.length > 0) {
        activeNeeds.sort((a, b) => b.deficit - a.deficit);
        const best = activeNeeds[0];
        const alloc = this._allocations.get(best.commodityId);
        if (alloc) {
          alloc.points += 1;
          remainingFP -= 1;
          best.deficit -= 1;
          if (best.deficit <= 0) activeNeeds.shift();
        } else {
          break;
        }
      }
    }
  }

  // Rozwiąż łańcuch składników — zwróć listę brakujących sub-commodities
  // oraz mapę tech-zablokowanych sub-składników per główny towar.
  // Zwraca: { chain: [...], blocked: Map<mainCommodityId, [{ingredientId, requiresTech}]> }
  _resolveChainNeeds(mainNeeds) {
    const chainMap = new Map(); // commodityId → { qty, forCommodityId }
    const blockedMap = new Map(); // mainCommodityId → [{ ingredientId, requiresTech }]

    for (const need of mainNeeds) {
      if (need.deficit <= 0) continue;
      this._addChainFor(need.commodityId, need.deficit, need.commodityId, chainMap, 0, blockedMap);
    }

    // Zwróć jako tablicę posortowaną po tierze (niższy tier = produkuj pierwszy)
    const chain = [...chainMap.values()]
      .sort((a, b) => (COMMODITIES[a.commodityId]?.tier ?? 0) - (COMMODITIES[b.commodityId]?.tier ?? 0));
    return { chain, blocked: blockedMap };
  }

  _addChainFor(commodityId, qty, forCommodityId, chainMap, depth, blockedMap) {
    if (depth > 3) return; // max 3 poziomy rekurencji
    const def = COMMODITIES[commodityId];
    if (!def) return;

    for (const [ingId, ingQty] of Object.entries(def.recipe)) {
      const ingDef = COMMODITIES[ingId];
      if (!ingDef) continue; // to surowiec, nie commodity — pomiń

      if (!this.isRecipeAvailable(ingId)) {
        // Zapisz blockage dla parent — UI pokaże "⚠ wymaga tech X"
        if (blockedMap) {
          const list = blockedMap.get(forCommodityId) ?? [];
          if (!list.some(b => b.ingredientId === ingId)) {
            list.push({ ingredientId: ingId, requiresTech: ingDef.requiresTech ?? null });
          }
          blockedMap.set(forCommodityId, list);
        }
        continue;
      }

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
        this._addChainFor(ingId, deficit, forCommodityId, chainMap, depth + 1, blockedMap);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Tryb reaktywny — auto-detekcja zapotrzebowania
  // ══════════════════════════════════════════════════════════════════════════

  _reactiveAllocate() {
    // Skanuj zapotrzebowanie z 5 źródeł — zawsze, nawet przy 0 FP,
    // żeby UI mogło pokazać katalog towarów i pozwolić graczowi
    // ustawić min. zapas ZANIM wybuduje fabryki / odblokuje tech.
    const demandItems = this._scanDemand();
    this._reactiveDemand = demandItems; // cache do UI

    if (this._totalPoints === 0) return;

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

    // Rozwiąż auto-łańcuch NAJPIERW (sub-składniki niższego tieru muszą powstać
    // zanim parent zacznie produkcję). Chain i main konkurują o ten sam budżet FP;
    // _autoConsolidate potem balansuje wg kto faktycznie może produkować.
    const needs = [...aggregated.values()].map(a => ({
      commodityId: a.commodityId,
      deficit: Math.max(0, a.qty - this._getStock(a.commodityId)),
      stockTarget: a.qty,
    }));
    const { chain: chainNeeds, blocked: blockedByTechMap } = this._resolveChainNeeds(needs);
    const newAutoChain = [];

    for (const ch of chainNeeds) {
      if (remainingFP <= 0) break;
      if (this._allocations.has(ch.commodityId)) continue; // już alokowany jako main
      const stock = this._getStock(ch.commodityId);
      if (stock >= ch.qty) continue;

      const fp = Math.min(1, remainingFP);
      const old = oldProgress.get(ch.commodityId);
      this._allocations.set(ch.commodityId, {
        points: fp,
        progress: old?.progress ?? 0,
        targetQty: ch.qty - stock,
        produced: 0,
        _isChain: true,
      });
      remainingFP -= fp;
      newAutoChain.push({
        commodityId: ch.commodityId,
        qty: ch.qty - stock,
        produced: stock,
        forCommodityId: ch.forCommodityId,
      });
    }
    this._autoChain = newAutoChain;

    // Alokuj FP — każdy główny towar z deficytem rejestruje alokację.
    // Gdy chain pochłonął cały budżet FP, rejestrujemy main z 0 FP —
    // _autoConsolidate przekaże mu FP gdy chain skończy (Bug #4/5 fix).
    for (const agg of sorted) {
      if (this._allocations.has(agg.commodityId)) continue; // już z chain

      const blockedByTech = blockedByTechMap.get(agg.commodityId) ?? null;
      const fp = Math.min(1, Math.max(0, remainingFP));
      const old = oldProgress.get(agg.commodityId);
      this._allocations.set(agg.commodityId, {
        points: fp,
        progress: old?.progress ?? 0,
        targetQty: agg.deficit,
        produced: old?.produced ?? 0,
        _isChain: false,
        _blockedByTech: (blockedByTech && blockedByTech.length > 0) ? blockedByTech : null,
      });
      remainingFP -= fp;
    }

    // Rozdziel dodatkowe FP pozostałe po chain+main na aktywne mainy z deficytem.
    // _autoConsolidate dopieszczy balans per-tick (zablokowane → 0, wolne → aktywne).
    if (remainingFP > 0) {
      const active = sorted.filter(a => this._allocations.has(a.commodityId) && !this._allocations.get(a.commodityId)._isChain);
      for (const a of active) {
        if (remainingFP <= 0) break;
        const alloc = this._allocations.get(a.commodityId);
        if (alloc) {
          alloc.points += 1;
          remainingFP -= 1;
        }
      }
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
    const colony = this._getOwnerColony();

    // Pending buildings (budynki czekające na surowce/commodities)
    const bSys = colony?.buildingSystem ?? window.KOSMOS?.buildingSystem;
    if (bSys?.getPendingDemand) {
      const demand = bSys.getPendingDemand();
      for (const [resId, qty] of Object.entries(demand)) {
        if (!COMMODITIES[resId]) continue; // tylko commodities
        if (qty > 0) {
          items.push({ commodityId: resId, qty });
        }
      }
    }

    // Pending ship orders (statki czekające na surowce/commodities)
    const colMgr = window.KOSMOS?.colonyManager;
    const planetId = colony?.planetId ?? colMgr?.activePlanetId;
    if (colMgr && planetId) {
      const pending = colMgr.getPendingShipOrders?.(planetId) ?? [];
      // Fallback: sprawdź bezpośrednio colony.pendingShipOrders
      const directPending = colony?.pendingShipOrders ?? [];
      const allPending = pending.length > 0 ? pending : directPending;
      for (const order of allPending) {
        for (const [resId, qty] of Object.entries(order.cost ?? {})) {
          if (!COMMODITIES[resId]) continue;
          if (qty > 0) {
            items.push({ commodityId: resId, qty });
          }
        }
      }
    }

    // Pending outpost orders (placówki czekające na surowce/commodities)
    if (colMgr && planetId) {
      const outpostPending = colMgr.getPendingOutpostOrders?.(planetId)
                          ?? colony?.pendingOutpostOrders ?? [];
      for (const order of outpostPending) {
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

  // Znajdź kolonię do której należy ten FactorySystem
  _getOwnerColony() {
    // Szybka ścieżka: aktywna kolonia
    if (window.KOSMOS?.factorySystem === this) {
      const colMgr = window.KOSMOS?.colonyManager;
      const activePid = colMgr?.activePlanetId;
      if (activePid) return colMgr.getColony(activePid);
    }
    // Fallback: przeszukaj wszystkie kolonie
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return null;
    for (const col of colMgr.getAllColonies()) {
      if (col.factorySystem === this) return col;
    }
    return null;
  }

  // Źródło 2: Paliwo — power_cells potrzebne do tankowania floty
  // qty = CAŁKOWITA potrzeba (deficyt liczy alokator)
  _scanFuelDemand() {
    const items = [];
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return items;

    const colony = this._getOwnerColony();
    const planetId = colony?.planetId;

    let fuelNeeded = 0;
    for (const vessel of vMgr.getAllVessels()) {
      // Tylko statki zadokowane w NASZEJ kolonii
      if (vessel.position?.state === 'docked' && vessel.position?.dockedAt === planetId) {
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
    const colony = this._getOwnerColony();
    const civSys = colony?.civSystem ?? window.KOSMOS?.civSystem;
    if (!civSys) return items;

    const pop = civSys.population ?? 0;
    if (pop <= 0) return items;

    const yearsBuffer = 5;
    for (const [goodId, rate] of Object.entries(BASE_DEMAND)) {
      if (!COMMODITIES[goodId]) continue;
      if (!this.isRecipeAvailable(goodId)) continue;
      const needed = Math.ceil(pop * rate * yearsBuffer) + this.getDemandBonus(goodId);
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

  // Źródło 5: Zapas bezpieczeństwa — WSZYSTKIE towary (również tech-locked)
  // Tech-locked dostają flagę `locked:true` i nie są alokowane (filter w _reactiveAllocate),
  // ale pojawiają się w UI min. zapasów żeby gracz mógł pre-konfigurować próg.
  // qty = docelowy minimalny zapas (deficyt liczy alokator)
  _scanSafetyStockDemand() {
    const items = [];
    for (const [id, def] of Object.entries(COMMODITIES)) {
      const locked = !this.isRecipeAvailable(id);
      const minStock = this.getSafetyStockTarget(id);
      items.push({
        commodityId:   id,
        qty:           minStock,
        locked,
        requiresTech:  def.requiresTech ?? null,
      });
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
    // Promuj z kolejki — limit: łącznie alokacji nie więcej niż totalPoints
    while (this._queue.length > 0 && this._allocations.size < this._totalPoints) {
      const next = this._queue.shift();
      const existing = this._allocations.get(next.commodityId);
      if (existing) {
        if (existing.targetQty !== null) {
          existing.targetQty += next.qty;
        }
        continue;
      }
      this._allocations.set(next.commodityId, {
        points: 1,
        progress: 0,
        targetQty: next.qty,
        produced: 0,
      });
    }
    // Po promocji — rozdziel punkty równomiernie
    this._autoConsolidate();
  }

  // Konsolidacja: zablokowane oddają FP aktywnym; ręczne ustawienia zachowane.
  // Działa we WSZYSTKICH trybach — w reactive/priority chain dziedziczy FP
  // z głównych towarów które czekają na sub-składnik (Bug #4 fix).
  _autoConsolidate() {
    if (this._allocations.size === 0) return;

    // Sprawdź które alokacje mogą produkować (mają surowce + nie osiągnęły targetu)
    const active = [];
    const blocked = [];
    for (const [id, alloc] of this._allocations) {
      const def = COMMODITIES[id];
      if (!def) { blocked.push(alloc); continue; }
      const targetDone = alloc.targetQty !== null && alloc.produced >= alloc.targetQty;
      const hasIng = this._hasIngredients(def.recipe, id);
      if (!targetDone && hasIng) {
        active.push(alloc);
      } else {
        blocked.push(alloc);
      }
    }

    // Zablokowane dostają 0 FP (ale zachowują progress)
    for (const alloc of blocked) alloc.points = 0;

    if (active.length === 0) return;

    // Aktywne bez FP (nowo promowane z kolejki lub zwolnione przez zablokowanego
    // głównego) — nadaj min 1
    for (const alloc of active) {
      if (alloc.points <= 0) alloc.points = 1;
    }

    let sum = 0;
    for (const alloc of active) sum += alloc.points;

    if (sum > this._totalPoints) {
      // Skaluj proporcjonalnie w dół
      const scale = this._totalPoints / sum;
      let assigned = 0;
      for (let i = 0; i < active.length; i++) {
        if (i === active.length - 1) {
          active[i].points = Math.max(1, this._totalPoints - assigned);
        } else {
          active[i].points = Math.max(1, Math.round(active[i].points * scale));
          assigned += active[i].points;
        }
      }
    } else if (sum < this._totalPoints) {
      // Redystrybucja: wolne FP (uwolnione przez zablokowanych) idą do aktywnych.
      // Priorytet: chain (sub-składniki) pierwsze — gdy się skończą, parent
      // odzyska swoje FP. Potem items z najmniejszą liczbą FP (wyrównaj).
      let extra = this._totalPoints - sum;
      const sorted = [...active].sort((a, b) => {
        if (!!a._isChain !== !!b._isChain) return a._isChain ? -1 : 1;
        return a.points - b.points;
      });
      let i = 0;
      while (extra > 0 && sorted.length > 0) {
        sorted[i % sorted.length].points += 1;
        extra -= 1;
        i++;
      }
    }
  }

  // Auto-kolejkowanie składników: gdy towar wymaga innych towarów, kolejkuj brakujące
  _enqueuePrereqs(commodityId, qty) {
    const def = COMMODITIES[commodityId];
    if (!def) return;
    for (const [ingId, ingQty] of Object.entries(def.recipe)) {
      // Tylko commodity-składniki (nie surowce)
      if (!COMMODITIES[ingId]) continue;
      // Pomiń tech-zablokowane sub-składniki (nie da się ich wyprodukować)
      if (!this.isRecipeAvailable(ingId)) continue;
      const stock = this._getStock(ingId);
      const needed = ingQty * qty;
      const deficit = needed - stock;
      if (deficit <= 0) continue;
      // Czy już jest w alokacjach lub kolejce?
      const inAlloc = this._allocations.get(ingId);
      const inQueue = this._queue.find(q => q.commodityId === ingId);
      const alreadyPlanned = (inAlloc ? (inAlloc.targetQty ?? 0) - (inAlloc.produced ?? 0) : 0)
                           + (inQueue ? inQueue.qty : 0);
      const toEnqueue = Math.max(0, deficit - alreadyPlanned);
      if (toEnqueue <= 0) continue;
      // Rekurencja — składniki składników
      this._enqueuePrereqs(ingId, toEnqueue);
      // Dodaj na początek kolejki (przed głównym produktem)
      this._queue.unshift({ commodityId: ingId, qty: toEnqueue });
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
