// EventCounter — zlicza WSZYSTKIE eventy z EventBus per-typ
// Przydatne do debugowania i analizy aktywności systemów

export class EventCounter {
  constructor() {
    this._counts = {};
    this._handlers = new Map();
  }

  /**
   * Podepnij na EventBus — liczy wszystkie emitowane eventy
   * @param {EventBus} eventBus
   * @param {string[]} eventNames — nazwy eventów do śledzenia
   */
  attach(eventBus, eventNames) {
    for (const name of eventNames) {
      const handler = () => {
        this._counts[name] = (this._counts[name] || 0) + 1;
      };
      this._handlers.set(name, handler);
      eventBus.on(name, handler);
    }
  }

  detach(eventBus) {
    for (const [name, handler] of this._handlers) {
      eventBus.off(name, handler);
    }
    this._handlers.clear();
  }

  /** Zwróć posortowane zestawienie eventów */
  getSummary() {
    return Object.entries(this._counts)
      .sort((a, b) => b[1] - a[1])
      .map(([event, count]) => ({ event, count }));
  }

  /** Resetuj wszystkie liczniki */
  reset() {
    this._counts = {};
  }

  /** Liczba danego eventu */
  getCount(eventName) {
    return this._counts[eventName] || 0;
  }

  /** Łączna liczba eventów */
  getTotal() {
    return Object.values(this._counts).reduce((a, b) => a + b, 0);
  }
}
