// VesselNames — pule auto-nazw statków per typ
//
// getNextName(shipId) → "Odkrywca I", "Odkrywca II", ... (PL)
//                      → "Explorer I", "Explorer II", ... (EN)
// Licznik per-pool resetowany przy nowej grze.
// Nazwy pobierane z i18n; NAME_POOLS jako fallback.

import { t } from '../i18n/i18n.js';

const NAME_POOLS = {
  // Legacy (przed refactorem capability) — wciąż obsługiwane dla kompatybilności
  science_vessel: [
    'Odkrywca', 'Zwiadowca', 'Pionier', 'Horyzon', 'Voyager',
    'Poszukiwacz', 'Obserwator', 'Promień', 'Ikarus', 'Kopernik',
  ],
  cargo_ship: [
    'Handlarz', 'Kurier', 'Fracht', 'Karawana', 'Merkury',
    'Konwój', 'Transporter', 'Dostawca', 'Opat', 'Smok',
  ],
  space_supply_ship: [
    'Kwatermistrz', 'Prowiant', 'Zaopatrzeniowiec', 'Arsenał', 'Intendent',
    'Magazyn', 'Depot', 'Tabor', 'Furaż', 'Komisariat',
  ],

  // Capability-based (nowy system — nazwa po primary role)
  role_scout: [
    'Odkrywca', 'Zwiadowca', 'Pionier', 'Horyzon', 'Voyager',
    'Poszukiwacz', 'Obserwator', 'Promień', 'Ikarus', 'Kopernik',
  ],
  role_science: [
    'Hubble', 'Tycho', 'Galileo', 'Newton', 'Einstein',
    'Curie', 'Sagan', 'Laboratoire', 'Prometeusz', 'Inkwizytor',
  ],
  role_cargo: [
    'Handlarz', 'Kurier', 'Fracht', 'Karawana', 'Merkury',
    'Konwój', 'Transporter', 'Dostawca', 'Opat', 'Smok',
  ],
  role_colony: [
    'Arka', 'Osadnik', 'Kolonista', 'Założyciel', 'Exodus',
    'Pokolenie', 'Pierwszy Krok', 'Nowy Świt', 'Sprague', 'Kepler',
  ],
  role_warship: [
    'Bellator', 'Gladiator', 'Furia', 'Orzeł', 'Wilk',
    'Żmija', 'Sztylet', 'Klinga', 'Burza', 'Huragan',
  ],
  role_transport: [
    'Szerpa', 'Wierny', 'Karawan', 'Roztocz', 'Ibis',
    'Kotwica', 'Przewoźnik', 'Brzytwa', 'Łopot', 'Dźwig',
  ],
  role_assault: [
    'Najeźdźca', 'Tytan', 'Młot', 'Behemot', 'Spartanin',
    'Legion', 'Conquistador', 'Kirys', 'Topornik', 'Trzon',
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
 * Pobierz kolejną auto-nazwę.
 * @param {string} shipIdOrRole — shipId (legacy) LUB `role_<primary>` (scout/science/cargo/colony/warship/transport/assault)
 * @returns {string} nazwa z numerem rzymskim przy cyklu > 1
 */
export function getNextName(shipIdOrRole) {
  const key = shipIdOrRole;
  if (!_counters[key]) _counters[key] = 0;
  const pool = _getPool(key);
  const idx = _counters[key]++;
  const name = pool[idx % pool.length];
  const cycle = Math.floor(idx / pool.length) + 1;
  return cycle === 1 ? name : `${name} ${_toRoman(cycle)}`;
}

/**
 * Pobierz nazwę dla statku na podstawie jego primary role (capability-based).
 * @param {string} role — 'scout'|'science'|'cargo'|'colony'|'warship'|'transport'|'assault'
 */
export function getNextNameByRole(role) {
  return getNextName(`role_${role}`);
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
