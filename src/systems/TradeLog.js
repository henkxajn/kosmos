// TradeLog — per-kolonia historia transakcji handlowych
//
// Loguje eksporty (załadunek cargo, wylot) i importy (przylot, rozładunek).
// Max MAX_ENTRIES wpisów per kolonia (FIFO).
// Nasłuchuje EventBus: trade:exported, trade:imported.

import EventBus from '../core/EventBus.js';

const MAX_ENTRIES = 200;

// TradeEntry = {
//   year: number,           // rok gry
//   type: 'export' | 'import',
//   items: { commodityId: qty },
//   vesselName: string,
//   partnerName: string,    // nazwa kolonii docelowej (eksport) lub źródłowej (import)
// }

export default class TradeLog {
  constructor() {
    /** @type {Map<string, Object[]>} colonyId → TradeEntry[] */
    this._logs = new Map();

    // Nasłuchuj zdarzeń handlowych
    EventBus.on('trade:exported', (data) => this._onExport(data));
    EventBus.on('trade:imported', (data) => this._onImport(data));
  }

  // ── Obsługa zdarzeń ────────────────────────────────────────────────────

  _onExport({ colonyId, year, items, vesselName, targetName }) {
    if (!colonyId || !items || Object.keys(items).length === 0) return;
    this._addEntry(colonyId, {
      year,
      type: 'export',
      items: { ...items },
      vesselName: vesselName ?? '?',
      partnerName: targetName ?? '?',
    });
  }

  _onImport({ colonyId, year, items, vesselName, sourceName }) {
    if (!colonyId || !items || Object.keys(items).length === 0) return;
    this._addEntry(colonyId, {
      year,
      type: 'import',
      items: { ...items },
      vesselName: vesselName ?? '?',
      partnerName: sourceName ?? '?',
    });
  }

  _addEntry(colonyId, entry) {
    if (!this._logs.has(colonyId)) {
      this._logs.set(colonyId, []);
    }
    const list = this._logs.get(colonyId);
    list.push(entry);
    // FIFO — obcinaj najstarsze
    while (list.length > MAX_ENTRIES) list.shift();
  }

  // ── Dostęp do danych ──────────────────────────────────────────────────

  /** Ostatnie N wpisów dla kolonii (najnowsze na końcu) */
  getLog(colonyId, limit = 50) {
    const list = this._logs.get(colonyId) ?? [];
    return list.slice(-limit);
  }

  /** Statystyki sumaryczne: { exports: {id: totalQty}, imports: {id: totalQty} } */
  getStats(colonyId) {
    const list = this._logs.get(colonyId) ?? [];
    const exports = {};
    const imports = {};
    for (const entry of list) {
      const target = entry.type === 'export' ? exports : imports;
      for (const [id, qty] of Object.entries(entry.items)) {
        target[id] = (target[id] ?? 0) + qty;
      }
    }
    return { exports, imports };
  }

  /** Agregacja per-rok (do wykresów): { year → { exports: totalQty, imports: totalQty } } */
  getYearlyAggregation(colonyId, buckets = 10) {
    const list = this._logs.get(colonyId) ?? [];
    if (list.length === 0) return [];

    // Zbierz unikalne lata
    const byYear = new Map();
    for (const entry of list) {
      const yr = Math.floor(entry.year);
      if (!byYear.has(yr)) byYear.set(yr, { year: yr, exports: 0, imports: 0, exportItems: {}, importItems: {} });
      const agg = byYear.get(yr);
      const totalQty = Object.values(entry.items).reduce((s, v) => s + v, 0);
      if (entry.type === 'export') {
        agg.exports += totalQty;
        for (const [id, qty] of Object.entries(entry.items)) {
          agg.exportItems[id] = (agg.exportItems[id] ?? 0) + qty;
        }
      } else {
        agg.imports += totalQty;
        for (const [id, qty] of Object.entries(entry.items)) {
          agg.importItems[id] = (agg.importItems[id] ?? 0) + qty;
        }
      }
    }

    // Sortuj po roku i zwróć ostatnie N
    const sorted = [...byYear.values()].sort((a, b) => a.year - b.year);
    return sorted.slice(-buckets);
  }

  // ── Serializacja ──────────────────────────────────────────────────────

  serialize() {
    const obj = {};
    for (const [colId, entries] of this._logs) {
      obj[colId] = entries;
    }
    return obj;
  }

  restore(data) {
    this._logs.clear();
    if (!data || typeof data !== 'object') return;
    for (const [colId, entries] of Object.entries(data)) {
      if (Array.isArray(entries)) {
        this._logs.set(colId, entries.slice(-MAX_ENTRIES));
      }
    }
  }
}
