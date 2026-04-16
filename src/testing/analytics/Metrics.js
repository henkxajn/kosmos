// ═══════════════════════════════════════════════════════════════
// Metrics — zbieranie surowych serii czasowych dla detektorów
// ─────────────────────────────────────────────────────────────
// Lekki kontener — każdy detektor czyta z tego stanu.
// Uzupełniany co civYear przez SingleGame.onCivYear hook.
// ═══════════════════════════════════════════════════════════════

export class Metrics {
  constructor() {
    this.series = new Map();  // key → [{civYear, value}]
  }

  record(civYear, key, value) {
    if (!this.series.has(key)) this.series.set(key, []);
    this.series.get(key).push({ civYear, value });
  }

  /** Ostatnie N punktów dla serii */
  tail(key, n = 10) {
    const arr = this.series.get(key) ?? [];
    return arr.slice(-n);
  }

  /** Pierwsza próbka o civYear >= from */
  since(key, from) {
    const arr = this.series.get(key) ?? [];
    return arr.filter(s => s.civYear >= from);
  }

  /** Najnowsza wartość */
  latest(key) {
    const arr = this.series.get(key);
    return arr && arr.length > 0 ? arr[arr.length - 1].value : null;
  }

  /** Delta między civYear a civYear - windowYears */
  delta(key, currentCivYear, windowYears) {
    const arr = this.series.get(key) ?? [];
    const cur = arr.find(s => s.civYear >= currentCivYear) ?? arr[arr.length - 1];
    const pastTarget = currentCivYear - windowYears;
    const past = [...arr].reverse().find(s => s.civYear <= pastTarget);
    if (!cur || !past) return null;
    return cur.value - past.value;
  }
}
