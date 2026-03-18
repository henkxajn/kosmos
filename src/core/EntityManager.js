// EntityManager — rejestr wszystkich ciał niebieskich w grze
// Centralne miejsce przechowywania i wyszukiwania encji

import EventBus from './EventBus.js';

class EntityManager {
  constructor() {
    // Główna mapa: id → encja
    this.entities = new Map();
    // Indeks typów dla szybkiego filtrowania ('star', 'planet', 'moon', 'asteroid')
    this.byType = new Map();
    // Cache tablicowy dla getByType — invalidowany przy add/remove
    this._typeCache = new Map();
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

    // Invaliduj cache dla tego typu
    this._typeCache.delete(entity.type);

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

    // Invaliduj cache dla tego typu
    this._typeCache.delete(entity.type);

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
  // Wynik cachowany — invalidacja przy add/remove
  getByType(type) {
    const cached = this._typeCache.get(type);
    if (cached) return cached;

    if (!this.byType.has(type)) return [];
    const result = Array.from(this.byType.get(type))
      .map(id => this.entities.get(id))
      .filter(Boolean);
    this._typeCache.set(type, result);
    return result;
  }

  // Pobierz encje po typie w danym układzie gwiezdnym
  getByTypeInSystem(type, systemId) {
    return this.getByType(type).filter(e => e.systemId === systemId);
  }

  // Pobierz gwiazdę danego układu
  getStarOfSystem(systemId) {
    return this.getByType('star').find(s => s.systemId === systemId) || null;
  }

  // Pobierz wszystkie encje w danym układzie
  getEntitiesInSystem(systemId) {
    return this.getAll().filter(e => e.systemId === systemId);
  }

  // Liczba encji
  get count() {
    return this.entities.size;
  }

  // Wyczyść wszystko (używać przy restarcie gry)
  clear() {
    this.entities.clear();
    this.byType.clear();
    this._typeCache.clear();
    this._nextId = 1;
  }
}

// Singleton — jeden EntityManager dla całej gry
export default new EntityManager();
