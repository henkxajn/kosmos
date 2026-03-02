// ResourceSystem — zarządzanie zasobami cywilizacji (nowy model inventory)
//
// 4 kategorie zasobów:
//   MINED (10):     inventory (stockpile), wydobywane z kopalni
//   HARVESTED (2):  inventory, z farm/studni (food, water)
//   COMMODITIES:    inventory, produkowane w fabrykach
//   UTILITY (2):    energy (flow/bilans), research (accumulator)
//
// Inventory: Map<resourceId, amount> — nieograniczona pojemność
// Energy: bilans (produkcja − zużycie), brak stockpile, deficyt = brownout
// Research: akumuluje się, wydawane na tech
//
// Komunikacja:
//   Nasłuchuje: 'time:tick'                     → aktualizacja co tik
//               'resource:registerProducer'      → rejestracja budynku/instalacji
//               'resource:removeProducer'        → usunięcie budynku/instalacji
//   Emituje:    'resource:changed'   { resources, inventory } → UI
//               'resource:shortage'  { resource, deficit } → alert

import EventBus from '../core/EventBus.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES, UTILITY_RESOURCES, ALL_RESOURCES }
  from '../data/ResourcesData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';

// ── Jak często emitujemy resource:changed (co ile lat gry) ─────────────────
const EMIT_THROTTLE_YEARS = 1 / 365.25; // co dzień gry

// ── Stare klucze zasobów (do kompatybilności z istniejącym kodem) ──────────
export const RESOURCE_DEFS = {
  minerals: { namePL: 'Minerały', icon: '⛏', color: 0x8B7355 },
  energy:   { namePL: 'Energia',  icon: '⚡', color: 0xFFD700 },
  organics: { namePL: 'Organika', icon: '🌿', color: 0x44AA44 },
  water:    { namePL: 'Woda',     icon: '💧', color: 0x4488FF },
  research: { namePL: 'Nauka',    icon: '🔬', color: 0xAA44FF },
};

export class ResourceSystem {
  constructor(initialOverride = {}) {
    // ── Inventory: Map<resourceId, amount> ───────────────────────────────
    // Przechowuje MINED + HARVESTED + COMMODITIES
    this.inventory = new Map();

    // Inicjalizuj mined resources
    for (const id of Object.keys(MINED_RESOURCES)) {
      this.inventory.set(id, initialOverride[id] ?? 0);
    }
    // Inicjalizuj harvested
    for (const id of Object.keys(HARVESTED_RESOURCES)) {
      this.inventory.set(id, initialOverride[id] ?? 0);
    }
    // Inicjalizuj commodities
    for (const id of Object.keys(COMMODITIES)) {
      this.inventory.set(id, initialOverride[id] ?? 0);
    }

    // ── Energy: flow (bilans) ────────────────────────────────────────────
    // Nie w inventory — obliczany z producentów
    this.energy = {
      production: 0,   // suma produkcji ⚡/rok
      consumption: 0,  // suma konsumpcji ⚡/rok (wartość dodatnia)
      balance: 0,      // production - consumption
      brownout: false,  // true gdy balance < 0
    };

    // ── Research: accumulator ────────────────────────────────────────────
    this.research = {
      amount: initialOverride.research ?? 0,
      perYear: 0,  // netto produkcja/rok
    };

    // ── Rejestr producentów ──────────────────────────────────────────────
    // Klucz: string id, Wartość: { rates } — rates to Map z kluczami zasobów
    // Dla inventory resources: dodatnie = produkcja/rok, ujemne = konsumpcja/rok
    // Dla energy: klucz 'energy', dodatnie = produkcja, ujemne = konsumpcja
    // Dla research: klucz 'research'
    this._producers = new Map();

    // ── Śledzenie zmian inventory per rok (do UI delta) ──────────────────
    this._inventoryPerYear = new Map();

    // Bufor czasu — throttle emitowania
    this._accumYears = 0;

    // Flagi niedoboru
    this._shortageFlags = {};

    // ── Obserwowane delty (faktyczne zmiany inventory w czasie) ─────────
    // Śledzą WSZYSTKIE źródła zmian: producenci + receive() + spend()
    this._deltaTracker = {
      prevSnapshot: new Map(),   // inventory na początku okna pomiarowego
      prevResearch: 0,
      timer: 0,                  // czas okna pomiarowego (lata gry)
      observedPerYear: new Map(), // obliczone stawki per rok
      initialized: false,
    };

    // ── Kompatybilność wsteczna: stary obiekt resources ──────────────────
    // Wielu konsumentów (UI, BuildingSystem, CivSystem) czyta this.resources
    // Tworzymy proxy obiekt który mapuje stare klucze na nowy system
    this.resources = this._buildLegacyProxy();

    // ── Nasłuch zdarzeń ──────────────────────────────────────────────────
    EventBus.on('time:tick', ({ deltaYears }) => this._update(deltaYears));

    EventBus.on('resource:registerProducer', ({ id, rates }) => {
      if (window.KOSMOS?.resourceSystem !== this) return;
      this.registerProducer(id, rates);
    });

    EventBus.on('resource:removeProducer', ({ id }) => {
      if (window.KOSMOS?.resourceSystem !== this) return;
      this.removeProducer(id);
    });

    EventBus.on('resource:requestSnapshot', () => {
      if (window.KOSMOS?.resourceSystem !== this) return;
      EventBus.emit('resource:changed', { resources: this.snapshot(), inventory: this.inventorySnapshot() });
    });
  }

  // ── API publiczne ────────────────────────────────────────────────────────

  registerProducer(id, rates) {
    this._producers.set(id, { ...rates });
    this._recalcPerYear();
  }

  removeProducer(id) {
    if (this._producers.delete(id)) {
      this._recalcPerYear();
    }
  }

  // Jednorazowy wydatek — obsługuje zarówno inventory jak i stare klucze
  // costs: { Fe: 50, steel_plates: 2, energy: 20 } lub { minerals: 50 }
  spend(costs) {
    // Weryfikacja
    for (const [key, amount] of Object.entries(costs)) {
      if (amount <= 0) continue;
      if (key === 'energy' || key === 'research') continue; // utility — nie z inventory
      const mapped = this._mapLegacyKey(key);
      if ((this.inventory.get(mapped) ?? 0) < amount) return false;
    }
    // Pobranie
    for (const [key, amount] of Object.entries(costs)) {
      if (amount <= 0) continue;
      if (key === 'energy') continue; // energia to flow, nie pobieramy jednorazowo
      if (key === 'research') {
        this.research.amount = Math.max(0, this.research.amount - amount);
        continue;
      }
      const mapped = this._mapLegacyKey(key);
      this.inventory.set(mapped, (this.inventory.get(mapped) ?? 0) - amount);
    }
    this._syncLegacyProxy();
    this._emitChanged();
    return true;
  }

  // Jednorazowy przychód
  receive(gains) {
    for (const [key, amount] of Object.entries(gains)) {
      if (amount <= 0) continue;
      if (key === 'energy') continue; // flow
      if (key === 'research') {
        this.research.amount += amount;
        continue;
      }
      const mapped = this._mapLegacyKey(key);
      this.inventory.set(mapped, (this.inventory.get(mapped) ?? 0) + amount);
    }
    this._syncLegacyProxy();
    this._emitChanged();
  }

  // Czy stać na dany koszt?
  canAfford(costs) {
    for (const [key, amount] of Object.entries(costs)) {
      if (amount <= 0) continue;
      if (key === 'energy') continue; // flow — nie płacisz z stockpile
      if (key === 'research') {
        if (this.research.amount < amount) return false;
        continue;
      }
      const mapped = this._mapLegacyKey(key);
      if ((this.inventory.get(mapped) ?? 0) < amount) return false;
    }
    return true;
  }

  // Snapshot stanu (kompatybilność ze starym kodem — zwraca obiekt z minerals/energy/etc.)
  snapshot() {
    this._syncLegacyProxy();
    const snap = {};
    for (const [key, res] of Object.entries(this.resources)) {
      snap[key] = { ...res };
    }
    return snap;
  }

  // Snapshot pełnego inventory
  inventorySnapshot() {
    const snap = {};
    for (const [id, amount] of this.inventory) {
      snap[id] = amount;
    }
    snap._energy = { ...this.energy };
    snap._research = { ...this.research };
    snap._perYear = {};
    for (const [id, val] of this._inventoryPerYear) {
      snap._perYear[id] = val;
    }
    // Obserwowane delty (faktyczne zmiany inventory — uwzględnia mining, receive, spend)
    snap._observedPerYear = {};
    for (const [id, val] of this._deltaTracker.observedPerYear) {
      snap._observedPerYear[id] = val;
    }
    return snap;
  }

  // Pobierz ilość danego zasobu z inventory
  getAmount(resourceId) {
    const mapped = this._mapLegacyKey(resourceId);
    if (mapped === 'energy') return this.energy.balance;
    if (mapped === 'research') return this.research.amount;
    return this.inventory.get(mapped) ?? 0;
  }

  // Pobierz zmianę/rok danego zasobu
  getPerYear(resourceId) {
    if (resourceId === 'energy') return this.energy.balance;
    if (resourceId === 'research') return this.research.perYear;
    return this._inventoryPerYear.get(resourceId) ?? 0;
  }

  // Pojemność magazynu — nie używana w nowym systemie (nieograniczone)
  // Zachowana dla kompatybilności ze starym kodem
  setCapacity(key, newCapacity) {
    if (this.resources[key]) {
      this.resources[key].capacity = newCapacity;
    }
  }

  // ── Serializacja ─────────────────────────────────────────────────────────

  serialize() {
    const inv = {};
    for (const [id, amount] of this.inventory) {
      if (amount !== 0) inv[id] = amount;
    }
    return {
      inventory: inv,
      research: this.research.amount,
    };
  }

  restore(data) {
    if (data.inventory) {
      // Nowy format (v6)
      for (const [id, amount] of Object.entries(data.inventory)) {
        this.inventory.set(id, amount);
      }
      this.research.amount = data.research ?? 0;
    } else {
      // Stary format (v5) — migracja minerals/organics/water/energy/research
      for (const [key, saved] of Object.entries(data)) {
        if (key === 'minerals') {
          this.inventory.set('Fe', (saved.amount ?? 0));
        } else if (key === 'organics') {
          this.inventory.set('food', (saved.amount ?? 0));
        } else if (key === 'water') {
          this.inventory.set('water', (saved.amount ?? 0));
        } else if (key === 'research') {
          this.research.amount = saved.amount ?? 0;
        }
        // energy — flow, nie przywracamy stockpile
      }
    }
    this._syncLegacyProxy();
  }

  // ── Prywatne ─────────────────────────────────────────────────────────────

  // Mapuj stare klucze zasobów na nowe
  _mapLegacyKey(key) {
    if (key === 'minerals') return 'Fe';
    if (key === 'organics') return 'food';
    // water, energy, research — bez zmian
    return key;
  }

  // Przelicz sumaryczne perYear ze wszystkich producentów
  _recalcPerYear() {
    // Reset
    this._inventoryPerYear.clear();
    let energyProd = 0, energyCons = 0;
    let researchPerYear = 0;

    for (const rates of this._producers.values()) {
      for (const [key, value] of Object.entries(rates)) {
        if (key === 'energy') {
          if (value > 0) energyProd += value;
          else energyCons += Math.abs(value);
        } else if (key === 'research') {
          researchPerYear += value;
        } else {
          const mapped = this._mapLegacyKey(key);
          this._inventoryPerYear.set(mapped,
            (this._inventoryPerYear.get(mapped) ?? 0) + value);
        }
      }
    }

    this.energy.production = energyProd;
    this.energy.consumption = energyCons;
    this.energy.balance = energyProd - energyCons;
    this.energy.brownout = this.energy.balance < 0;

    this.research.perYear = researchPerYear;

    this._syncLegacyProxy();
    this._emitChanged();
  }

  // Oblicz obserwowane stawki zmian inventory (co ~0.5 roku gry)
  _computeObservedRates() {
    const dt = this._deltaTracker;
    if (dt.timer <= 0) return;

    for (const [id, current] of this.inventory) {
      const prev = dt.prevSnapshot.get(id) ?? current;
      const rate = (current - prev) / dt.timer;
      dt.observedPerYear.set(id, rate);
      dt.prevSnapshot.set(id, current);
    }

    // Research
    const resRate = (this.research.amount - dt.prevResearch) / dt.timer;
    dt.observedPerYear.set('research', resRate);
    dt.prevResearch = this.research.amount;

    dt.timer = 0;
  }

  // Aktualizacja co tik
  _update(deltaYears) {
    this._accumYears += deltaYears;
    const isActive = (window.KOSMOS?.resourceSystem === this);

    let anyChange = false;

    // Aktualizuj inventory resources (mined, harvested) wg perYear
    for (const [id, perYear] of this._inventoryPerYear) {
      if (perYear === 0) continue;
      const delta = perYear * deltaYears;
      const before = this.inventory.get(id) ?? 0;
      const after = Math.max(0, before + delta);
      this.inventory.set(id, after);
      if (after !== before) anyChange = true;

      // Wykrywanie niedoboru
      if (isActive) {
        const isShortage = (after <= 0 && perYear < 0);
        if (isShortage && !this._shortageFlags[id]) {
          this._shortageFlags[id] = true;
          EventBus.emit('resource:shortage', { resource: id, deficit: Math.abs(perYear) });
        } else if (!isShortage && this._shortageFlags[id]) {
          this._shortageFlags[id] = false;
        }
      }
    }

    // Aktualizuj research (accumulator)
    if (this.research.perYear !== 0) {
      const before = this.research.amount;
      this.research.amount = Math.max(0, this.research.amount + this.research.perYear * deltaYears);
      if (this.research.amount !== before) anyChange = true;
    }

    // Obserwowane delty — co ~0.5 roku gry przelicz faktyczne zmiany
    this._deltaTracker.timer += deltaYears;
    if (!this._deltaTracker.initialized) {
      // Inicjalizacja snapshot przy pierwszym tiku
      for (const [id, amount] of this.inventory) {
        this._deltaTracker.prevSnapshot.set(id, amount);
      }
      this._deltaTracker.prevResearch = this.research.amount;
      this._deltaTracker.initialized = true;
    } else if (this._deltaTracker.timer >= 0.5) {
      this._computeObservedRates();
    }

    // Brownout check
    if (this.energy.balance < 0 && !this.energy.brownout) {
      this.energy.brownout = true;
      if (isActive) EventBus.emit('resource:shortage', { resource: 'energy', deficit: Math.abs(this.energy.balance) });
    } else if (this.energy.balance >= 0 && this.energy.brownout) {
      this.energy.brownout = false;
    }

    // Emituj zmianę
    if (isActive && (anyChange || this._accumYears >= EMIT_THROTTLE_YEARS)) {
      this._accumYears = 0;
      this._syncLegacyProxy();
      EventBus.emit('resource:changed', { resources: this.snapshot(), inventory: this.inventorySnapshot() });
    }
  }

  // Buduj legacy proxy obiekt (kompatybilność wsteczna)
  _buildLegacyProxy() {
    return {
      minerals: { amount: 0, capacity: 99999, perYear: 0 },
      energy:   { amount: 0, capacity: 99999, perYear: 0 },
      organics: { amount: 0, capacity: 99999, perYear: 0 },
      water:    { amount: 0, capacity: 99999, perYear: 0 },
      research: { amount: 0, capacity: 99999, perYear: 0 },
    };
  }

  // Synchronizuj legacy proxy z aktualnym stanem
  _syncLegacyProxy() {
    // minerals → Fe
    this.resources.minerals.amount  = this.inventory.get('Fe') ?? 0;
    this.resources.minerals.perYear = this._inventoryPerYear.get('Fe') ?? 0;

    // energy → flow
    this.resources.energy.amount  = this.energy.balance;
    this.resources.energy.perYear = this.energy.balance;

    // organics → food
    this.resources.organics.amount  = this.inventory.get('food') ?? 0;
    this.resources.organics.perYear = this._inventoryPerYear.get('food') ?? 0;

    // water
    this.resources.water.amount  = this.inventory.get('water') ?? 0;
    this.resources.water.perYear = this._inventoryPerYear.get('water') ?? 0;

    // research
    this.resources.research.amount  = this.research.amount;
    this.resources.research.perYear = this.research.perYear;
  }

  _emitChanged() {
    const isActive = (window.KOSMOS?.resourceSystem === this);
    if (isActive) {
      EventBus.emit('resource:changed', { resources: this.snapshot(), inventory: this.inventorySnapshot() });
    }
  }
}
