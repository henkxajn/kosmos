// TradeRouteManager — automatyczne trasy handlowe (cykliczne kursowanie cargo ship)
//
// Trasa handlowa: cargo_ship kursuje między koloniami, automatycznie ładując
// i dostarczając zasoby. Warunek odblokowania: ≥2 wizyty na celu (visitCounts).
//
// EventBus:
//   Nasłuchuje: 'vessel:docked'          → auto-dispatch kolejnego kursu
//               'tradeRoute:create'      → nowa trasa
//               'tradeRoute:pause'       → pauza trasy
//               'tradeRoute:resume'      → wznowienie
//               'tradeRoute:delete'      → usunięcie
//   Emituje:    'tradeRoute:dispatched'  { routeId, vesselId }
//               'tradeRoute:completed'   { routeId }
//               'tradeRoute:statusChanged'

import EventBus from '../core/EventBus.js';

let _nextRouteId = 1;

export class TradeRouteManager {
  constructor() {
    // Lista tras: [{id, vesselId, sourceColonyId, targetBodyId, cargo, tripsTotal, tripsCompleted, status}]
    this._routes = [];

    EventBus.on('vessel:docked', ({ vessel }) => this._onVesselDocked(vessel));

    EventBus.on('tradeRoute:create', (data) => this.createRoute(data));
    EventBus.on('tradeRoute:pause', ({ routeId }) => this.pauseRoute(routeId));
    EventBus.on('tradeRoute:resume', ({ routeId }) => this.resumeRoute(routeId));
    EventBus.on('tradeRoute:delete', ({ routeId }) => this.deleteRoute(routeId));

    // Cleanup tras przy zniszczeniu kolonii
    EventBus.on('colony:destroyed', ({ planetId }) => {
      this._routes = this._routes.filter(
        r => r.sourceColonyId !== planetId && r.targetBodyId !== planetId
      );
      this._emitStatus();
    });
  }

  // ── API publiczne ──────────────────────────────────────────

  createRoute({ vesselId, sourceColonyId, targetBodyId, cargo, tripsTotal }) {
    const route = {
      id: `tr_${_nextRouteId++}`,
      vesselId,
      sourceColonyId,
      targetBodyId,
      cargo: { ...cargo },
      tripsTotal: tripsTotal ?? null, // null = nieskończoność
      tripsCompleted: 0,
      status: 'active',
    };
    this._routes.push(route);

    // Natychmiast wyślij pierwszy kurs (jeśli statek w hangarze)
    this._dispatchRoute(route);
    this._emitStatus();
    return route;
  }

  pauseRoute(routeId) {
    const route = this._routes.find(r => r.id === routeId);
    if (route) {
      route.status = 'paused';
      this._emitStatus();
    }
  }

  resumeRoute(routeId) {
    const route = this._routes.find(r => r.id === routeId);
    if (route && route.status === 'paused') {
      route.status = 'active';
      this._emitStatus();
    }
  }

  deleteRoute(routeId) {
    this._routes = this._routes.filter(r => r.id !== routeId);
    this._emitStatus();
  }

  getRoutes() { return [...this._routes]; }
  getRoutesForVessel(vesselId) { return this._routes.filter(r => r.vesselId === vesselId); }

  // ── Serializacja ───────────────────────────────────────────

  serialize() {
    return {
      routes: this._routes.map(r => ({ ...r })),
      nextRouteId: _nextRouteId,
    };
  }

  restore(data) {
    if (!data) return;
    this._routes = data.routes ?? [];
    _nextRouteId = data.nextRouteId ?? (this._routes.length + 1);
  }

  // ── Prywatne ───────────────────────────────────────────────

  _onVesselDocked(vessel) {
    if (!vessel) return;
    // Szukaj aktywnej trasy dla tego statku
    const route = this._routes.find(r =>
      r.vesselId === vessel.id && r.status === 'active'
    );
    if (!route) return;

    // Sprawdź czy ukończono wymaganą liczbę kursów
    if (route.tripsTotal !== null && route.tripsCompleted >= route.tripsTotal) {
      route.status = 'completed';
      EventBus.emit('tradeRoute:completed', { routeId: route.id });
      this._emitStatus();
      return;
    }

    // Auto-dispatch następnego kursu
    this._dispatchRoute(route);
  }

  _dispatchRoute(route) {
    const colMgr = window.KOSMOS?.colonyManager;
    const sourceCol = colMgr?.getColony(route.sourceColonyId);
    if (!sourceCol) return;

    // Sprawdź czy statek jest w hangarze (docked)
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(route.vesselId);
    if (!vessel || vessel.position.state !== 'docked') return;

    // Sprawdź czy stać na ładunek
    const resSys = sourceCol.resourceSystem;
    if (!resSys || !resSys.canAfford(route.cargo)) return;

    // Załaduj i wyślij
    route.tripsCompleted++;

    EventBus.emit('expedition:transportRequest', {
      targetId: route.targetBodyId,
      cargo: { ...route.cargo },
      vesselId: route.vesselId,
    });

    EventBus.emit('tradeRoute:dispatched', { routeId: route.id, vesselId: route.vesselId });
    this._emitStatus();
  }

  _emitStatus() {
    EventBus.emit('tradeRoute:statusChanged', { routes: this.getRoutes() });
  }
}
