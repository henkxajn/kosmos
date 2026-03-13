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
//               'time:tick'              → sprawdza tankujące statki tras
//   Emituje:    'tradeRoute:dispatched'  { routeId, vesselId }
//               'tradeRoute:completed'   { routeId }
//               'tradeRoute:statusChanged'

import EventBus from '../core/EventBus.js';
import { needsRefuel } from '../entities/Vessel.js';

let _nextRouteId = 1;

// Minimalna frakcja baku wymagana do wylotu trasy (80% — bezpieczny margines)
const MIN_FUEL_FRACTION = 0.8;

export class TradeRouteManager {
  constructor() {
    // Lista tras: [{id, vesselId, sourceColonyId, targetBodyId, cargo, tripsTotal, tripsCompleted, status}]
    this._routes = [];

    // Trasy czekające na zatankowanie statku (routeId → vesselId)
    this._pendingRefuel = new Set();

    EventBus.on('vessel:docked', ({ vessel }) => this._onVesselDocked(vessel));
    EventBus.on('time:tick', () => this._checkRefueledRoutes());

    EventBus.on('tradeRoute:create', (data) => this.createRoute(data));
    EventBus.on('tradeRoute:pause', ({ routeId }) => this.pauseRoute(routeId));
    EventBus.on('tradeRoute:resume', ({ routeId }) => this.resumeRoute(routeId));
    EventBus.on('tradeRoute:delete', ({ routeId }) => this.deleteRoute(routeId));

    // Cleanup tras przy zniszczeniu kolonii
    EventBus.on('colony:destroyed', ({ planetId }) => {
      this._routes = this._routes.filter(
        r => r.sourceColonyId !== planetId && r.targetBodyId !== planetId
      );
      this._pendingRefuel.clear();
      this._emitStatus();
    });
  }

  // ── API publiczne ──────────────────────────────────────────

  createRoute({ vesselId, sourceColonyId, targetBodyId, cargo, returnCargo, tripsTotal }) {
    const route = {
      id: `tr_${_nextRouteId++}`,
      vesselId,
      sourceColonyId,
      targetBodyId,
      cargo: { ...cargo },
      returnCargo: { ...(returnCargo ?? {}) }, // ładunek powrotny: cel → źródło
      tripsTotal: tripsTotal ?? null, // null = nieskończoność
      tripsCompleted: 0,
      status: 'active',
    };
    this._routes.push(route);

    // Natychmiast wyślij pierwszy kurs (jeśli statek w hangarze i zatankowany)
    this._tryDispatchOrRefuel(route);
    this._emitStatus();
    return route;
  }

  pauseRoute(routeId) {
    const route = this._routes.find(r => r.id === routeId);
    if (route) {
      route.status = 'paused';
      this._pendingRefuel.delete(routeId);
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
    this._pendingRefuel.delete(routeId);
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
    this._routes = (data.routes ?? []).map(r => ({
      ...r,
      returnCargo: r.returnCargo ?? {},  // kompatybilność ze starymi save'ami
    }));
    _nextRouteId = data.nextRouteId ?? (this._routes.length + 1);
  }

  // ── Prywatne ───────────────────────────────────────────────

  /**
   * Sprawdź czy statek ma wystarczająco paliwa na kolejny kurs.
   * Wymaga ≥80% baku aby uniknąć wysyłania na pustym baku.
   */
  _hasEnoughFuel(vessel) {
    if (!vessel || !vessel.fuel) return true;
    return vessel.fuel.current >= vessel.fuel.max * MIN_FUEL_FRACTION;
  }

  /**
   * Próbuj wysłać trasę lub poczekaj na tankowanie.
   */
  _tryDispatchOrRefuel(route) {
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(route.vesselId);

    if (vessel && !this._hasEnoughFuel(vessel)) {
      // Statek potrzebuje tankowania — poczekaj
      this._pendingRefuel.add(route.id);
      return;
    }

    // Paliwo OK — wyślij
    this._pendingRefuel.delete(route.id);

    if (vessel?.position?.dockedAt === route.sourceColonyId) {
      // Statek w źródle → wyślij outbound (źródło → cel)
      this._dispatchRoute(route);
    } else if (vessel?.position?.dockedAt === route.targetBodyId) {
      // Statek w celu → wyślij return (cel → źródło) z returnCargo
      this._dispatchReturn(route);
    } else if (vessel?.position?.state === 'docked') {
      // Statek w innej lokalizacji (np. outpost) → pusty powrót do źródła
      EventBus.emit('expedition:transportRequest', {
        targetId: route.sourceColonyId,
        cargo: {},
        vesselId: route.vesselId,
      });
    }
  }

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
      this._pendingRefuel.delete(route.id);
      EventBus.emit('tradeRoute:completed', { routeId: route.id });
      this._emitStatus();
      return;
    }

    // Sprawdź paliwo i wyślij lub poczekaj na tankowanie
    this._tryDispatchOrRefuel(route);
  }

  /**
   * Co tick sprawdza trasy czekające na tankowanie.
   * Gdy statek się zatankuje (≥80% baku), wysyła go na kolejny kurs.
   */
  _checkRefueledRoutes() {
    if (this._pendingRefuel.size === 0) return;

    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;

    for (const routeId of [...this._pendingRefuel]) {
      const route = this._routes.find(r => r.id === routeId);
      if (!route || route.status !== 'active') {
        this._pendingRefuel.delete(routeId);
        continue;
      }

      const vessel = vMgr.getVessel(route.vesselId);
      if (!vessel || vessel.position.state !== 'docked') {
        // Statek nie jest w hangarze — usuń z oczekujących
        this._pendingRefuel.delete(routeId);
        continue;
      }

      if (this._hasEnoughFuel(vessel)) {
        // Zatankowany — wyślij
        this._pendingRefuel.delete(routeId);
        this._tryDispatchOrRefuel(route);
      }
    }
  }

  _dispatchRoute(route) {
    const colMgr = window.KOSMOS?.colonyManager;
    const sourceCol = colMgr?.getColony(route.sourceColonyId);
    if (!sourceCol) return;

    // Sprawdź czy statek jest w hangarze (docked)
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(route.vesselId);
    if (!vessel || vessel.position.state !== 'docked') return;

    // Sprawdź czy stać na ładunek i odejmij zasoby
    const resSys = sourceCol.resourceSystem;
    if (!resSys || !resSys.canAfford(route.cargo)) return;
    resSys.spend(route.cargo);

    // Załaduj i wyślij (cargoPreloaded — zasoby już odjęte, isTradeRoute — pomija spaceport/POP)
    route.tripsCompleted++;

    EventBus.emit('expedition:transportRequest', {
      targetId: route.targetBodyId,
      cargo: { ...route.cargo },
      vesselId: route.vesselId,
      cargoPreloaded: true,
      isTradeRoute: true,
    });

    EventBus.emit('tradeRoute:dispatched', { routeId: route.id, vesselId: route.vesselId });
    this._emitStatus();
  }

  /**
   * Wyślij statek z celu z powrotem do źródła z returnCargo.
   * Nie inkrementuje tripsCompleted (to robi outbound).
   */
  _dispatchReturn(route) {
    const hasReturn = route.returnCargo && Object.keys(route.returnCargo).length > 0;

    // Zbierz ładunek powrotny (jeśli jest i kolonia docelowa stać)
    let returnPayload = {};
    if (hasReturn) {
      const colMgr = window.KOSMOS?.colonyManager;
      const targetCol = colMgr?.getColony(route.targetBodyId);
      if (targetCol) {
        const resSys = targetCol.resourceSystem;
        if (resSys && resSys.canAfford(route.returnCargo)) {
          resSys.spend(route.returnCargo);
          returnPayload = { ...route.returnCargo };
        }
        // Brak zasobów → pusty powrót (nie blokuj trasy)
      }
    }

    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(route.vesselId);
    if (!vessel || vessel.position.state !== 'docked') return;

    // Wyślij powrót (cargo może być puste — isTradeRoute pozwala na to)
    EventBus.emit('expedition:transportRequest', {
      targetId: route.sourceColonyId,
      cargo: returnPayload,
      vesselId: route.vesselId,
      cargoPreloaded: true,
      isTradeRoute: true,
    });

    EventBus.emit('tradeRoute:dispatched', { routeId: route.id, vesselId: route.vesselId });
    this._emitStatus();
  }

  _emitStatus() {
    EventBus.emit('tradeRoute:statusChanged', { routes: this.getRoutes() });
  }
}
