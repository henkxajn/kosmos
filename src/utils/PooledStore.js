// PooledStore — fasada „wspólnej puli" surowców (Orbital Logistics Hub).
//
// Cienki wrapper nad ResourceSystem kolonii-DOMU (ciała, na którym wykonywana jest operacja)
// oraz jego RODZEŃSTWEM w puli. NIE przepisuje ResourceSystem — deleguje spend/canAfford/getAmount
// na realne instancje. Reguły (plan „Orbital Logistics Hub"):
//   • deposit ZAWSZE lokalny  — receive() → dom (produkcja/dostawa ląduje na ciele-producencie)
//   • draw local-first        — spend/getAmount: dom → rodzeństwo (kolejność ustala SystemPoolService:
//                               matka najpierw, potem księżyce wg stanu malejąco)
//   • tylko surowce MATERIALNE — energia/research NIGDY nie poolowane (delegacja do domu)
//
// Fasada jest budowana on-demand (SystemPoolService.getStore) i używana WYŁĄCZNIE do
// materialnego spend/canAfford/getAmount + odczytu inventory. Rejestracja producentów,
// bilans energii i produkcja pozostają na surowym ResourceSystem domu.

// Klucze „utility" — traktowane specjalnie przez ResourceSystem.spend/canAfford (nie z inventory).
const UTILITY_KEYS = new Set(['energy', 'research']);

export class PooledStore {
  /**
   * @param {object}   home     — ResourceSystem ciała, na którym wykonywana jest operacja (local-first)
   * @param {object[]} siblings — pozostałe ResourceSystem w puli, w kolejności poboru (BEZ domu)
   */
  constructor(home, siblings) {
    this._home = home;
    this._siblings = Array.isArray(siblings) ? siblings : [];
  }

  // Wszyscy członkowie w kolejności poboru — dom najpierw (local-first).
  get _members() { return [this._home, ...this._siblings]; }

  // Depozyt ZAWSZE lokalny (reguła deposit — produkcja/dostawa nie „rozpływa się" po puli).
  receive(gains) { return this._home.receive(gains); }

  // Suma materialna po całej puli; energia/research z domu (nie poolowane).
  getAmount(id) {
    if (UTILITY_KEYS.has(id)) return this._home.getAmount(id);
    let sum = 0;
    for (const m of this._members) sum += m.getAmount(id);
    return sum;
  }

  // Scalony widok inventory (Map) — Vessel._getAvailable sprawdza `instanceof Map`; UI też czyta.
  // Zwraca ŚWIEŻĄ Mapę (suma inventory materialnych wszystkich członków).
  get inventory() {
    const merged = new Map();
    for (const m of this._members) {
      const inv = m?.inventory;
      if (!(inv instanceof Map)) continue;
      for (const [k, v] of inv) merged.set(k, (merged.get(k) ?? 0) + v);
    }
    return merged;
  }

  // Czy pula stać na koszt? Materialne — suma po puli; energia/research — z domu (semantyka ResourceSystem).
  canAfford(costs) {
    for (const [key, amount] of Object.entries(costs)) {
      if (amount <= 0) continue;
      if (UTILITY_KEYS.has(key)) {
        if (!this._home.canAfford({ [key]: amount })) return false;
        continue;
      }
      if (this.getAmount(key) < amount) return false;
    }
    return true;
  }

  // Pobranie all-or-nothing (jak ResourceSystem.spend): pre-check całości, potem drenaż dom→rodzeństwo.
  spend(costs) {
    if (!this.canAfford(costs)) return false;
    for (const [key, amount] of Object.entries(costs)) {
      if (amount <= 0) continue;
      if (UTILITY_KEYS.has(key)) { this._home.spend({ [key]: amount }); continue; }
      let need = amount;
      for (const m of this._members) {
        if (need <= 1e-9) break;
        const have = m.getAmount(key);
        if (have <= 0) continue;
        const take = Math.min(have, need);
        if (m.spend({ [key]: take })) need -= take;
      }
    }
    return true;
  }

  // ── Delegacje „przezroczyste" na dom ─────────────────────────────────────
  // Energia/research/produkcja/rejestracja producentów NIGDY nie poolowane. Fasada zachowuje
  // kształt ResourceSystem dla kodu, który dostał ją zamiast surowego magazynu.
  get energy()   { return this._home.energy; }
  get research() { return this._home.research; }
  get resources(){ return this._home.resources; }
  getPerYear(id)      { return this._home.getPerYear(id); }
  getGrossPerYear(id) { return this._home.getGrossPerYear(id); }
  getEnergyAvailability() { return this._home.getEnergyAvailability(); }
  registerProducer(id, rates) { return this._home.registerProducer(id, rates); }
  removeProducer(id)          { return this._home.removeProducer(id); }
  snapshot()          { return this._home.snapshot(); }
  inventorySnapshot() { return this._home.inventorySnapshot(); }
}
