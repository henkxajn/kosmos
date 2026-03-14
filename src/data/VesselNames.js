// VesselNames — pule auto-nazw statków per typ
//
// getNextName(shipId) → "Odkrywca I", "Odkrywca II", ... (PL)
//                      → "Explorer I", "Explorer II", ... (EN)
// Licznik per-pool resetowany przy nowej grze.
// Nazwy pobierane z i18n; NAME_POOLS jako fallback.

import { t } from '../i18n/i18n.js';

const NAME_POOLS = {
  science_vessel: [
    'Odkrywca', 'Zwiadowca', 'Pionier', 'Horyzon', 'Voyager',
    'Poszukiwacz', 'Obserwator', 'Promień', 'Ikarus', 'Kopernik',
  ],
  colony_ship: [
    'Nadzieja', 'Osadnik', 'Arka', 'Nowy Świt', 'Exodus',
    'Kolumb', 'Magellanus', 'Pielgrzym', 'Jutrznia', 'Genesis',
  ],
  cargo_ship: [
    'Handlarz', 'Kurier', 'Fracht', 'Karawana', 'Merkury',
    'Konwój', 'Transporter', 'Dostawca', 'Opat', 'Smok',
  ],
  heavy_freighter: [
    'Mamut', 'Behemot', 'Kolos', 'Tytan', 'Lewiatan',
    'Golem', 'Atlas', 'Juggernaut', 'Moloch', 'Kraken',
  ],
};

// Licznik nazw per typ — inkrementowany przy każdej generacji
const _counters = {};

/**
 * Pobierz pulę nazw dla danego typu statku z i18n.
 * Fallback na hardkodowaną polską pulę (NAME_POOLS).
 */
function _getPool(shipId) {
  const key = `vesselName.${shipId}`;
  const translated = t(key);
  // Jeśli klucz istnieje w locale (t() nie zwraca samego klucza), podziel po przecinku
  if (translated && translated !== key) {
    return translated.split(',').map(s => s.trim()).filter(Boolean);
  }
  // Fallback na hardkodowaną pulę
  return NAME_POOLS[shipId] ?? NAME_POOLS.science_vessel;
}

/**
 * Pobierz kolejną auto-nazwę dla typu statku.
 * Nazwy krążą cyklicznie po puli; numer (I, II, ...) rośnie po wyczerpaniu puli.
 * Pula nazw pobierana z i18n (locale-aware) z fallbackiem na NAME_POOLS.
 */
export function getNextName(shipId) {
  if (!_counters[shipId]) _counters[shipId] = 0;
  const pool = _getPool(shipId);
  const idx = _counters[shipId]++;
  const name = pool[idx % pool.length];
  const cycle = Math.floor(idx / pool.length) + 1;
  return cycle === 1 ? name : `${name} ${_toRoman(cycle)}`;
}

/**
 * Reset liczników (nowa gra).
 */
export function resetNameCounters() {
  for (const k of Object.keys(_counters)) delete _counters[k];
}

/**
 * Przywróć liczniki z save (aby nie powtarzać nazw).
 */
export function restoreNameCounters(data) {
  resetNameCounters();
  if (!data) return;
  for (const [k, v] of Object.entries(data)) {
    _counters[k] = v;
  }
}

/**
 * Serializuj liczniki do save.
 */
export function serializeNameCounters() {
  return { ..._counters };
}

// Prosta konwersja na liczby rzymskie (do ~20)
function _toRoman(n) {
  const vals = [10, 9, 5, 4, 1];
  const syms = ['X', 'IX', 'V', 'IV', 'I'];
  let s = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { s += syms[i]; n -= vals[i]; }
  }
  return s;
}
