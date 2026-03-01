// ResourceSystem — zarządzanie surowcami cywilizacji
//
// 4 surowce podstawowe:
//   minerals  — rudy metali, skały (wydobycie z pól hex)
//   energy    — elektryczność, ciepło (elektrownie, reaktory)
//   organics  — żywność, biomasa (farmy, ekosystem)
//   water     — woda pitna i techniczna (źródła powierzchniowe, lód)
//
// Stan każdego surowca: { amount, capacity, perYear }
//   amount   — bieżąca ilość (jednostki arbitralne)
//   capacity — maksymalny magazyn
//   perYear  — bilans netto za rok gry (suma wszystkich producentów i konsumentów)
//
// Komunikacja:
//   Nasłuchuje: 'time:tick'                     → aktualizacja stanu co tik
//               'resource:registerProducer'      → rejestracja budynku/instalacji
//               'resource:removeProducer'        → usunięcie budynku/instalacji
//   Emituje:    'resource:changed'   { resources } → UI odświeża paski
//               'resource:shortage'  { resource, deficit } → alert niedoboru

import EventBus from '../core/EventBus.js';

// ── Definicje surowców (metadane dla UI) ─────────────────────────────────────
export const RESOURCE_DEFS = {
  minerals: { namePL: 'Minerały', icon: '⛏', color: 0x8B7355 },
  energy:   { namePL: 'Energia',  icon: '⚡', color: 0xFFD700 },
  organics: { namePL: 'Organika', icon: '🌿', color: 0x44AA44 },
  water:    { namePL: 'Woda',     icon: '💧', color: 0x4488FF },
  research: { namePL: 'Nauka',    icon: '🔬', color: 0xAA44FF },
};

// ── Startowe wartości surowców ────────────────────────────────────────────────
// Przeznaczone na scenariusz "Świt" — bazowe zasoby młodej cywilizacji
// Scenariusze mogą nadpisywać przez restore() lub setInitial()
const DEFAULT_INITIAL = {
  minerals: { amount: 200, capacity:  500 },
  energy:   { amount: 100, capacity: 1000 },
  organics: { amount: 150, capacity:  500 },
  water:    { amount: 120, capacity:  500 },
  research: { amount:   0, capacity: 1000 },
};

// ── Jak często emitujemy resource:changed (co ile lat gry) ───────────────────
// Przy 1d/s i perYear=0 chcemy unikać spamu — emituj tylko gdy stan się zmienia
const EMIT_THROTTLE_YEARS = 1 / 365.25; // co dzień gry (przy najwolniejszym tempie)

export class ResourceSystem {
  constructor(initialOverride = {}) {
    // Stan surowców — głęboka kopia, ewentualne nadpisanie per scenariusz
    this.resources = {};
    for (const [key, def] of Object.entries(DEFAULT_INITIAL)) {
      this.resources[key] = {
        amount:  initialOverride[key]?.amount   ?? def.amount,
        capacity: initialOverride[key]?.capacity ?? def.capacity,
        perYear: 0,  // obliczane dynamicznie z rejestrów
      };
    }

    // Rejestr producentów/konsumentów
    // Klucz: dowolny unikalny string (np. 'building_42', 'planet_base')
    // Wartość: { minerals: N, energy: N, organics: N, water: N }
    //   dodatnie = produkcja rocznie, ujemne = konsumpcja rocznie
    this._producers = new Map();

    // Bufor czasu — throttle emitowania
    this._accumYears = 0;

    // Flaga: czy któryś surowiec jest w niedoborze (do unikania spamu alertów)
    this._shortageFlags = Object.fromEntries(Object.keys(this.resources).map(k => [k, false]));

    // ── Nasłuch zdarzeń ────────────────────────────────────────────────────
    EventBus.on('time:tick', ({ deltaYears }) => this._update(deltaYears));

    // Rejestracja producenta — tylko aktywna kolonia przetwarza
    EventBus.on('resource:registerProducer', ({ id, rates }) => {
      if (window.KOSMOS?.resourceSystem !== this) return;
      this.registerProducer(id, rates);
    });

    EventBus.on('resource:removeProducer', ({ id }) => {
      if (window.KOSMOS?.resourceSystem !== this) return;
      this.removeProducer(id);
    });

    // Natychmiastowy snapshot — tylko aktywna kolonia odpowiada
    EventBus.on('resource:requestSnapshot', () => {
      if (window.KOSMOS?.resourceSystem !== this) return;
      EventBus.emit('resource:changed', { resources: this.snapshot() });
    });
  }

  // ── API publiczne ──────────────────────────────────────────────────────────

  // Zarejestruj źródło produkcji/konsumpcji
  // id:    unikalny identyfikator (np. ID budynku)
  // rates: { minerals: 10, energy: -5 } — wartości za rok gry
  registerProducer(id, rates) {
    this._producers.set(id, { ...rates });
    this._recalcPerYear();
  }

  // Usuń źródło (zniszczony / wyłączony budynek)
  removeProducer(id) {
    if (this._producers.delete(id)) {
      this._recalcPerYear();
    }
  }

  // Jednorazowy wydatek (koszt budynku, misji itp.)
  // costs: { minerals: 50, energy: 20 }
  // Zwraca true jeśli udało się zapłacić, false jeśli brak surowców
  spend(costs) {
    // Weryfikacja przed pobraniem — niepodzielna operacja
    for (const [key, amount] of Object.entries(costs)) {
      if ((this.resources[key]?.amount ?? 0) < amount) return false;
    }
    for (const [key, amount] of Object.entries(costs)) {
      this.resources[key].amount -= amount;
    }
    EventBus.emit('resource:changed', { resources: this.snapshot() });
    return true;
  }

  // Jednorazowy przychód (nagroda, dostawa z ekspedycji, zdarzenie)
  // gains: { minerals: 100, water: 50 }
  receive(gains) {
    for (const [key, amount] of Object.entries(gains)) {
      if (this.resources[key] !== undefined) {
        this.resources[key].amount = Math.min(
          this.resources[key].capacity,
          this.resources[key].amount + amount
        );
      }
    }
    EventBus.emit('resource:changed', { resources: this.snapshot() });
  }

  // Ustaw pojemność magazynu (budynek Magazyn — etap 7.2)
  setCapacity(key, newCapacity) {
    if (this.resources[key]) {
      this.resources[key].capacity = newCapacity;
      // Przytnij nadmiar jeśli amount > nowy limit
      this.resources[key].amount = Math.min(this.resources[key].amount, newCapacity);
      EventBus.emit('resource:changed', { resources: this.snapshot() });
    }
  }

  // Snapshot stanu — płytka kopia do odczytu przez UI (bez mutowania oryginału)
  snapshot() {
    const snap = {};
    for (const [key, res] of Object.entries(this.resources)) {
      snap[key] = { ...res };
    }
    return snap;
  }

  // Czy stać na dany koszt? (sprawdzenie bez pobierania)
  canAfford(costs) {
    for (const [key, amount] of Object.entries(costs)) {
      if ((this.resources[key]?.amount ?? 0) < amount) return false;
    }
    return true;
  }

  // ── Serializacja (SaveSystem — etap 6.8+) ─────────────────────────────────

  serialize() {
    // Zapisujemy tylko amount i capacity; perYear jest obliczane z budynków
    const data = {};
    for (const [key, res] of Object.entries(this.resources)) {
      data[key] = { amount: res.amount, capacity: res.capacity };
    }
    return data;
  }

  restore(data) {
    for (const [key, saved] of Object.entries(data)) {
      if (this.resources[key]) {
        this.resources[key].amount   = saved.amount;
        this.resources[key].capacity = saved.capacity;
        // perYear zostanie przeliczone gdy budynki zarejestrują swoich producentów
      }
    }
  }

  // ── Prywatne ──────────────────────────────────────────────────────────────

  // Przelicz sumaryczne perYear ze wszystkich zarejestrowanych źródeł
  _recalcPerYear() {
    // Zeruj bilans
    for (const key of Object.keys(this.resources)) {
      this.resources[key].perYear = 0;
    }
    // Sumuj
    for (const rates of this._producers.values()) {
      for (const [key, value] of Object.entries(rates)) {
        if (this.resources[key] !== undefined) {
          this.resources[key].perYear += value;
        }
      }
    }
    EventBus.emit('resource:changed', { resources: this.snapshot() });
  }

  // Aktualizacja stanów surowców co tik czasu gry
  // Zasoby aktualizują się dla WSZYSTKICH kolonii (multi-colony tick),
  // ale eventy resource:changed/shortage emitowane tylko dla aktywnej kolonii (UI).
  _update(deltaYears) {
    this._accumYears += deltaYears;
    const isActive = (window.KOSMOS?.resourceSystem === this);

    // Aktualizuj zasoby proporcjonalnie do deltaYears
    let anyChange = false;
    for (const [key, res] of Object.entries(this.resources)) {
      if (res.perYear === 0) continue;

      const delta   = res.perYear * deltaYears;
      const before  = res.amount;
      res.amount    = Math.min(res.capacity, Math.max(0, res.amount + delta));

      if (res.amount !== before) anyChange = true;

      // Wykrywanie niedoboru — emituj tylko dla aktywnej kolonii
      if (isActive) {
        const isShortage = (res.amount <= 0 && res.perYear < 0);
        if (isShortage && !this._shortageFlags[key]) {
          this._shortageFlags[key] = true;
          EventBus.emit('resource:shortage', {
            resource: key,
            deficit:  Math.abs(res.perYear),  // jednostek/rok
          });
        } else if (!isShortage && this._shortageFlags[key]) {
          this._shortageFlags[key] = false;   // niedobór ustąpił
        }
      }
    }

    // Emituj resource:changed tylko dla aktywnej kolonii (UI update)
    if (isActive && (anyChange || this._accumYears >= EMIT_THROTTLE_YEARS)) {
      this._accumYears = 0;
      EventBus.emit('resource:changed', { resources: this.snapshot() });
    }
  }
}
