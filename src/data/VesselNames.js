// VesselNames — pule auto-nazw statków per typ
//
// getNextName(shipId) → "Odkrywca I", "Odkrywca II", ...
// Licznik per-pool resetowany przy nowej grze.

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
 * Pobierz kolejną auto-nazwę dla typu statku.
 * Nazwy krążą cyklicznie po puli; numer (I, II, ...) rośnie po wyczerpaniu puli.
 */
export function getNextName(shipId) {
  if (!_counters[shipId]) _counters[shipId] = 0;
  const pool = NAME_POOLS[shipId] ?? NAME_POOLS.science_vessel;
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
