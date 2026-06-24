// EconomyHistoryLog — globalna historia ROCZNA produkcji i konsumpcji towarów
//
// Loguje (per ROK GRY, sumarycznie dla WSZYSTKICH kolonii GRACZA):
//   - produkcję fabryk      → factory:produced {commodityId, amount, planetId}
//   - konsumpcję towarów    → factory:consumed {commodityId, amount, planetId}
//                             (składniki fabryk) + ciągłe zużycie POP/budynków
//                             (ujemne stawki _producers, próbkowane co tick × deltaYears)
// Kolonie AI są filtrowane (atrybucja po planetId). Ring buffer MAX_YEARS lat.
// Zasila wykresy w prawym panelu EconomyOverlay. Zapisywany w save (serialize/restore),
// wzór TradeLog — brak migracji (defensywny restore: stare save → pusta historia).
//
// Nasłuchuje: factory:produced, factory:consumed, time:tick
// API:        getYearlyHistory(buckets) → [{year, producedTotal, consumedTotal, produced, consumed, current}]

import EventBus from '../core/EventBus.js';
import { COMMODITIES } from '../data/CommoditiesData.js';

const MAX_YEARS = 20;

export class EconomyHistoryLog {
  constructor() {
    this._history = [];   // zakończone lata: [{ year, produced:{id:amt}, consumed:{id:amt} }]
    this._cur = null;     // bieżący (w toku) rok
    this._curYear = null;

    EventBus.on('factory:produced', (e) => this._onProduced(e));
    EventBus.on('factory:consumed', (e) => this._onConsumed(e));
    EventBus.on('time:tick', (e) => this._onTick(e));
  }

  // ── Atrybucja: czy planetId to kolonia GRACZA (null/'player') ──────────────
  _isPlayer(planetId) {
    if (!planetId) return false;
    const col = window.KOSMOS?.colonyManager?.getColony?.(planetId);
    return !!col && (!col.ownerEmpireId || col.ownerEmpireId === 'player');
  }

  _ensureCur(year) {
    if (!this._cur) {
      this._cur = { year, produced: {}, consumed: {} };
      this._curYear = year;
    }
  }

  // ── Zdarzenia produkcji / konsumpcji (dyskretne, z fabryk) ─────────────────
  _onProduced({ commodityId, amount, planetId }) {
    if (!commodityId || !amount || !this._isPlayer(planetId)) return;
    this._ensureCur(this._curYear ?? 0);
    this._cur.produced[commodityId] = (this._cur.produced[commodityId] ?? 0) + amount;
  }

  _onConsumed({ commodityId, amount, planetId }) {
    if (!commodityId || !amount || !this._isPlayer(planetId)) return;
    this._ensureCur(this._curYear ?? 0);
    this._cur.consumed[commodityId] = (this._cur.consumed[commodityId] ?? 0) + amount;
  }

  // ── Tick: próbkuj ciągłą konsumpcję + rollover roku ────────────────────────
  _onTick({ deltaYears, gameTime }) {
    if (!window.KOSMOS?.civMode) return;
    const year = Math.floor(gameTime ?? 0);
    this._ensureCur(year);

    // Ciągła konsumpcja TOWARÓW (POP / budynki) — ujemne stawki _producers ×
    // deltaYears. Rozłączne z factory:consumed (tamto = spend() składników fabryk,
    // tu = zarejestrowane producent-stawki) → brak podwójnego liczenia.
    const dt = deltaYears ?? 0;
    if (dt > 0) {
      const colonies = window.KOSMOS?.colonyManager?.getPlayerColonies?.() ?? [];
      for (const col of colonies) {
        const producers = col.resourceSystem?._producers;
        if (!producers) continue;
        for (const rates of producers.values()) {
          for (const id in rates) {
            const r = rates[id];
            if (r < 0 && COMMODITIES[id]) {
              this._cur.consumed[id] = (this._cur.consumed[id] ?? 0) + (-r * dt);
            }
          }
        }
      }
    }

    // Rollover — nowy rok gry → zamknij bieżący bucket, otwórz nowy.
    if (this._curYear !== null && year > this._curYear) {
      this._history.push(this._cur);
      while (this._history.length > MAX_YEARS) this._history.shift();
      this._cur = { year, produced: {}, consumed: {} };
      this._curYear = year;
    }
  }

  // ── Dane do wykresów ───────────────────────────────────────────────────────
  // Zwraca ostatnie N lat (zakończone + bieżący „w toku") z sumami totali.
  getYearlyHistory(buckets = 10) {
    const all = [...this._history];
    if (this._cur) all.push({ ...this._cur, _current: true });
    return all.slice(-buckets).map(b => {
      const producedTotal = Object.values(b.produced).reduce((s, v) => s + v, 0);
      const consumedTotal = Object.values(b.consumed).reduce((s, v) => s + v, 0);
      return {
        year: b.year,
        producedTotal: Math.round(producedTotal),
        consumedTotal: Math.round(consumedTotal),
        produced: b.produced,
        consumed: b.consumed,
        current: !!b._current,
      };
    });
  }

  // ── Serializacja (wzór TradeLog — slot w save, bez migracji) ───────────────
  serialize() {
    return { history: this._history, cur: this._cur, curYear: this._curYear };
  }

  restore(data) {
    if (!data || typeof data !== 'object') return;
    this._history = Array.isArray(data.history) ? data.history.slice(-MAX_YEARS) : [];
    this._cur = (data.cur && typeof data.cur === 'object') ? data.cur : null;
    this._curYear = (typeof data.curYear === 'number') ? data.curYear : null;
  }
}
