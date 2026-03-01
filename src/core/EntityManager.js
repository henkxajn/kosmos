// EntityManager — rejestr wszystkich ciał niebieskich w grze
// Centralne miejsce przechowywania i wyszukiwania encji

import EventBus from './EventBus.js';

class EntityManager {
  constructor() {
    // Główna mapa: id → encja
    this.entities = new Map();
    // Indeks typów dla szybkiego filtrowania ('star', 'planet', 'moon', 'asteroid')
    this.byType = new Map();
    // Licznik ID
    this._nextId = 1;
  }

  // Generuj unikalny ID dla nowej encji
  generateId() {
    return `entity_${this._nextId++}`;
  }

  // Dodaj encję do rejestru
  add(entity) {
    this.entities.set(entity.id, entity);

    // Indeksuj po typie
    if (!this.byType.has(entity.type)) {
      this.byType.set(entity.type, new Set());
    }
    this.byType.get(entity.type).add(entity.id);

    EventBus.emit('entity:added', { entity });
    return entity;
  }

  // Usuń encję z rejestru
  remove(id) {
    const entity = this.entities.get(id);
    if (!entity) return;

    this.entities.delete(id);

    if (this.byType.has(entity.type)) {
      this.byType.get(entity.type).delete(id);
    }

    EventBus.emit('entity:removed', { entity });
  }

  // Pobierz encję po ID
  get(id) {
    return this.entities.get(id) || null;
  }

  // Pobierz wszystkie encje jako tablicę
  getAll() {
    return Array.from(this.entities.values());
  }

  // Pobierz encje po typie ('star', 'planet', 'moon', 'asteroid')
  getByType(type) {
    if (!this.byType.has(type)) return [];
    return Array.from(this.byType.get(type))
      .map(id => this.entities.get(id))
      .filter(Boolean);
  }

  // Liczba encji
  get count() {
    return this.entities.size;
  }

  // Wyczyść wszystko (używać przy restarcie gry)
  clear() {
    this.entities.clear();
    this.byType.clear();
    this._nextId = 1;
  }
}

// Singleton — jeden EntityManager dla całej gry
export default new EntityManager();
