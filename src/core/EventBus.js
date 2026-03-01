// EventBus — globalny system komunikacji między modułami gry
// Wzorzec: Publish/Subscribe (pub/sub)
// Dzięki niemu systemy nie wiedzą o swoim istnieniu — rozmawiają tylko przez zdarzenia

class EventBus {
  constructor() {
    // Mapa: nazwa zdarzenia → tablica callbacków
    this.listeners = new Map();
  }

  // Subskrybuj zdarzenie
  // event: string, callback: function(data)
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return this; // umożliwia łańcuchowanie: bus.on(...).on(...)
  }

  // Odsubskrybuj zdarzenie (usuń konkretny callback)
  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event).filter(cb => cb !== callback);
    this.listeners.set(event, filtered);
  }

  // Wyemituj zdarzenie — wszystkie subskrybenci otrzymają dane
  emit(event, data = {}) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[EventBus] Błąd w handlerze zdarzenia "${event}":`, err);
      }
    });
  }

  // Jednorazowa subskrypcja — automatycznie się usuwa po pierwszym wywołaniu
  once(event, callback) {
    const wrapper = (data) => {
      callback(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  // Wyczyść wszystkie subskrypcje (używać przy restarcie gry)
  clear() {
    this.listeners.clear();
  }

  // Lista aktywnych zdarzeń (debugging)
  getActiveEvents() {
    return Array.from(this.listeners.keys());
  }
}

// Singleton — jeden EventBus dla całej gry
export default new EventBus();
