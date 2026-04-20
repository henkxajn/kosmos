// ProductionRequestBoard — rejestr zleceń produkcyjnych między koloniami
//
// Gdy CivilianTradeSystem wykryje deficyt towaru G na kolonii X, którego X nie
// produkuje lokalnie (i nie da się pokryć z nadwyżki innej kolonii), emituje
// zlecenie tutaj. FactorySystem kolonii Y z wolnymi FP i opcją acceptsExportOrders
// może przyjąć zlecenie w _scanExportOrdersDemand (najniższy priorytet reactive).
//
// Zlecenie wygasa po 2 latach gry (game years, nie civYears) — czytelne dla
// gracza (HUD pokazuje game years). Subskrypcja time:tick używa deltaYears.
//
// EventBus:
//   Emituje: 'productionRequest:created'    { request }
//            'productionRequest:assigned'   { requestId, colonyId }
//            'productionRequest:fulfilled'  { requestId, producedBy }
//            'productionRequest:expired'    { request }
//            'productionRequest:cancelled'  { requestId, reason }
//
// Format zlecenia:
//   { id, requesterId, commodityId, qty, urgency, assignedTo, ageYears, createdAtYear }

import EventBus from '../core/EventBus.js';

// Ile lat gry (deltaYears) czeka zlecenie zanim wygaśnie bez przyjęcia
const EXPIRY_GAME_YEARS = 2;

export class ProductionRequestBoard {
  constructor() {
    this._openRequests = [];
    this._nextId = 1;
    this._currentGameYear = 0;  // aktualizowany z time:tick

    // Statystyki (do UI/debug)
    this._totalCreated = 0;
    this._totalFulfilled = 0;
    this._totalExpired = 0;

    // Subskrybuj tick — używamy deltaYears (game years), NIE civDeltaYears
    // — bo expiry to pojęcie dla gracza (czyta datę na HUDzie).
    this._onTick = ({ deltaYears, gameTime }) => {
      if (typeof gameTime === 'number') this._currentGameYear = gameTime;
      this._tickExpiry(deltaYears);
    };
    EventBus.on('time:tick', this._onTick);
  }

  // ── API publiczne ─────────────────────────────────────────────────────────

  /**
   * Utwórz nowe zlecenie (lub zaktualizuj istniejące jeśli ten sam requester+commodity).
   * @param {string} requesterId — planetId kolonii potrzebującej
   * @param {string} commodityId
   * @param {number} qty — ile sztuk potrzebne
   * @param {number} urgency — 0–1 (1 = kończą się zapasy natychmiast)
   * @returns {object} request
   */
  createOrUpdate(requesterId, commodityId, qty, urgency = 0.5) {
    // Jeśli już jest otwarte zlecenie tego samego typu — aktualizuj qty/urgency
    const existing = this._openRequests.find(
      r => r.requesterId === requesterId && r.commodityId === commodityId
    );
    if (existing) {
      existing.qty = Math.max(existing.qty, qty);
      existing.urgency = Math.max(existing.urgency, urgency);
      return existing;
    }

    const request = {
      id:            `pr_${this._nextId++}`,
      requesterId,
      commodityId,
      qty,
      urgency,
      assignedTo:    null,
      ageYears:      0,          // narastająco w game years
      createdAtYear: this._currentGameYear,
    };
    this._openRequests.push(request);
    this._totalCreated++;
    EventBus.emit('productionRequest:created', { request });
    return request;
  }

  /** Oznacz zlecenie jako przyjęte przez kolonię (pierwsza która faktycznie zaczęła produkować) */
  assign(requestId, colonyId) {
    const req = this._openRequests.find(r => r.id === requestId);
    if (!req || req.assignedTo) return false;
    req.assignedTo = colonyId;
    EventBus.emit('productionRequest:assigned', { requestId, colonyId });
    return true;
  }

  /** Oznacz zlecenie jako wypełnione (producer wyprodukował wystarczająco) */
  fulfill(requestId, producedBy) {
    const idx = this._openRequests.findIndex(r => r.id === requestId);
    if (idx === -1) return false;
    const [req] = this._openRequests.splice(idx, 1);
    this._totalFulfilled++;
    EventBus.emit('productionRequest:fulfilled', { requestId, producedBy, request: req });
    return true;
  }

  /** Anuluj zlecenie (deficyt zniknął naturalnie — np. inna kolonia dorobiła) */
  cancel(requestId, reason = 'deficit_resolved') {
    const idx = this._openRequests.findIndex(r => r.id === requestId);
    if (idx === -1) return false;
    this._openRequests.splice(idx, 1);
    EventBus.emit('productionRequest:cancelled', { requestId, reason });
    return true;
  }

  /** Znajdź zlecenie po (requester, commodity) — używane przez trade system do cleanupu */
  findOpenFor(requesterId, commodityId) {
    return this._openRequests.find(
      r => r.requesterId === requesterId && r.commodityId === commodityId
    );
  }

  /** Wszystkie otwarte zlecenia (read-only kopia) */
  getOpenRequests() {
    return this._openRequests.map(r => ({ ...r }));
  }

  /** Zlecenia potencjalnie dostępne dla danej kolonii (nie jej własne, nie przypisane albo przypisane do niej) */
  getAvailableFor(colonyId) {
    return this._openRequests.filter(
      r => r.requesterId !== colonyId && (r.assignedTo == null || r.assignedTo === colonyId)
    );
  }

  // ── Expiry tick (deltaYears = game years) ────────────────────────────────

  _tickExpiry(deltaYears) {
    if (!deltaYears || deltaYears <= 0) return;
    if (this._openRequests.length === 0) return;

    const expired = [];
    for (const req of this._openRequests) {
      // Zlecenia przypisane nie wygasają (producer w trakcie) — ma czas na pracę
      if (req.assignedTo) continue;
      req.ageYears += deltaYears;
      if (req.ageYears >= EXPIRY_GAME_YEARS) expired.push(req);
    }

    for (const req of expired) {
      const idx = this._openRequests.indexOf(req);
      if (idx !== -1) this._openRequests.splice(idx, 1);
      this._totalExpired++;
      EventBus.emit('productionRequest:expired', { request: req });
    }
  }

  // ── Serializacja ─────────────────────────────────────────────────────────

  serialize() {
    return {
      openRequests: this._openRequests.map(r => ({ ...r })),
      nextId:       this._nextId,
      totalCreated:   this._totalCreated,
      totalFulfilled: this._totalFulfilled,
      totalExpired:   this._totalExpired,
    };
  }

  restore(data) {
    if (!data) return;
    this._openRequests = (data.openRequests ?? []).map(r => ({ ...r }));
    this._nextId = data.nextId ?? 1;
    this._totalCreated   = data.totalCreated   ?? 0;
    this._totalFulfilled = data.totalFulfilled ?? 0;
    this._totalExpired   = data.totalExpired   ?? 0;
  }

  dispose() {
    EventBus.off('time:tick', this._onTick);
  }
}
