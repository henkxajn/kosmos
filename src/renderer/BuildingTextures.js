// src/renderer/BuildingTextures.js
// System ładowania tekstur PNG budynków dla mapy 2D kolonii (ColonyOverlay).
//
// Naming convention: assets/buildings/{building_id}.png — id budynku z BuildingsData.js.
// Podmienia emoji (ctx.fillText) na kaflu hex: gdy tekstura istnieje → drawImage,
// gdy pliku brak → brak wpisu w cache → ColonyOverlay renderuje emoji (fallback, bez zmian).

import EventBus from '../core/EventBus.js';
import { BUILDINGS } from '../data/BuildingsData.js';

const BASE_PATH = 'assets/buildings/';

// Cache: building id → HTMLImageElement (TYLKO pomyślnie załadowane tekstury)
const _cache = new Map();
let _loaded = false;
let _loadPromise = null;

/**
 * Ładuje tekstury PNG budynków asynchronicznie (jedna próba na każde id z BUILDINGS).
 * Brak pliku = cichy fallback (onerror → resolve bez wpisu w cache).
 * Po zakończeniu emituje 'buildings:texturesLoaded'.
 */
export function loadBuildingTextures() {
  if (_loadPromise) return _loadPromise;

  // Brak środowiska DOM (headless / testy node) — nic do załadowania
  if (typeof Image === 'undefined') {
    _loaded = true;
    _loadPromise = Promise.resolve();
    return _loadPromise;
  }

  const ids = Object.keys(BUILDINGS);
  const promises = ids.map((id) => new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => { _cache.set(id, img); resolve(); };
    img.onerror = () => resolve(); // brak pliku → cichy fallback do emoji
    img.src = `${BASE_PATH}${id}.png`;
  }));

  _loadPromise = Promise.all(promises).then(() => {
    _loaded = true;
    console.log(`[BuildingTextures] Załadowano ${_cache.size}/${ids.length} tekstur budynków`);
    EventBus.emit('buildings:texturesLoaded');
  });

  return _loadPromise;
}

/** Zwraca HTMLImageElement tekstury budynku lub null (brak = fallback do emoji). */
export function getBuildingTexture(id) {
  return _cache.get(id) ?? null;
}

/** Czy dla danego id budynku istnieje załadowana tekstura PNG. */
export function hasBuildingTexture(id) {
  return _cache.has(id);
}

/** Czy próba ładowania tekstur budynków się zakończyła. */
export function buildingTexturesLoaded() { return _loaded; }
