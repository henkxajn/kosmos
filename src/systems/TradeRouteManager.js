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
//               'time:tick'              → sprawdza oczekujące statki (fuel / retry)
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
    // Lista tras: [{id, vesselId, sourceColonyId, targetBodyId, cargo, returnCargo, tripsTotal, tripsCompleted, status}]
    this._routes = [];

    // Trasy czekające na dispatch (paliwo, zasoby, itp.)
    this._pendingDispatch = new Set();

    EventBus.on('vessel:docked', ({ vessel }) => this._onVesselDocked(vessel));
    EventBus.on('time:tick', () => this._checkPendingRoutes());

    EventBus.on('tradeRoute:create', (data) => this.createRoute(data));
    EventBus.on('tradeRoute:pause', ({ routeId }) => this.pauseRoute(routeId));
    EventBus.on('tradeRoute:resume', ({ routeId }) => this.resumeRoute(routeId));
    EventBus.on('tradeRoute:delete', ({ routeId }) => this.deleteRoute(routeId));

    // Cleanup tras przy zniszczeniu kolonii
    EventBus.on('colony:destroyed', ({ planetId }) => {
      this._routes = this._routes.filter(
        r => r.sourceColonyId !== planetId && r.targetBodyId !== planetId
      );
      this._pendingDispatch.clear();
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
    this._tryDispatch(route);
    this._emitStatus();
    return route;
  }

  pauseRoute(routeId) {
    const route = this._routes.find(r => r.id === routeId);
    if (route) {
      route.status = 'paused';
      this._pendingDispatch.delete(routeId);
      this._emitStatus();
    }
  }

  resumeRoute(routeId) {
    const route = this._routes.find(r => r.id === routeId);
    if (route && route.status === 'paused') {
      route.status = 'active';
      // Spróbuj od razu wysłać
      this._tryDispatch(route);
      this._emitStatus();
    }
  }

  deleteRoute(routeId) {
    this._routes = this._routes.filter(r => r.id !== routeId);
    this._pendingDispatch.delete(routeId);
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

  /**
   * Kick po restore — opóźniony do pierwszego time:tick.
   * Zapewnia że VesselManager, ColonyManager, EntityManager są w pełni zainicjalizowane.
   */
  kickAfterRestore() {
    const handler = () => {
      EventBus.off('time:tick', handler);
      for (const route of this._routes) {
        if (route.status !== 'active') continue;
        this._tryDispatch(route);
      }
    };
    EventBus.on('time:tick', handler);
  }

  // ── Prywatne ───────────────────────────────────────────────

  /**
   * Sprawdź czy statek ma wystarczająco paliwa na kolejny kurs.
   */
  _hasEnoughFuel(vessel) {
    if (!vessel || !vessel.fuel) return true;
    return vessel.fuel.current >= vessel.fuel.max * MIN_FUEL_FRACTION;
  }

  /**
   * Główna logika dispatch — sprawdza pozycję statku i wysyła odpowiedni kurs.
   * Przy niepowodzeniu dodaje trasę do _pendingDispatch (retry na time:tick).
   */
  _tryDispatch(route) {
    const vMgr = window.KOSMOS?.vesselManager;
    const vessel = vMgr?.getVessel(route.vesselId);

    // Statek nie istnieje lub w locie — retry później
    if (!vessel || vessel.position.state !== 'docked') {
      return;
    }

    // Statek wymaga tankowania — retry co tick
    if (!this._hasEnoughFuel(vessel)) {
      this._pendingDispatch.add(route.id);
      return;
    }

    this._pendingDispatch.delete(route.id);

    // Określ kierunek kursu na podstawie pozycji statku
    const dockedAt = vessel.position.dockedAt;
    let cargo = {};
    let targetId = null;

    if (dockedAt === route.sourceColonyId) {
      // Statek w źródle → wyślij outbound (źródło → cel)
      cargo = { ...route.cargo };
      targetId = route.targetBodyId;
      route.tripsCompleted++;
    } else if (dockedAt === route.targetBodyId) {
      // Statek w celu → wyślij return (cel → źródło) z returnCargo
      const hasReturn = route.returnCargo && Object.keys(route.returnCargo).length > 0;
      cargo = hasReturn ? { ...route.returnCargo } : {};
      targetId = route.sourceColonyId;
    } else {
      // Statek w innej lokalizacji → wyślij do źródła (pusty)
      cargo = {};
      targetId = route.sourceColonyId;
    }

    // Wyślij transport — ExpeditionSystem obsłuży walidację zasobów, paliwa i dispatch
    EventBus.emit('expedition:transportRequest', {
      targetId,
      cargo,
      vesselId: route.vesselId,
      isTradeRoute: true,
      // sourceColonyId potrzebne aby ExpeditionSystem użył właściwego resource system
      sourceColonyId: dockedAt,
    });

    // Sprawdź czy dispatch się powiódł (statek zmienił stan)
    const vesselAfter = vMgr.getVessel(route.vesselId);
    if (vesselAfter && vesselAfter.position.state !== 'docked') {
      // Sukces — statek ruszył
      EventBus.emit('tradeRoute:dispatched', { routeId: route.id, vesselId: route.vesselId });
      this._emitStatus();
    } else {
      // Dispatch się nie powiódł — cofnij tripsCompleted jeśli outbound
      if (dockedAt === route.sourceColonyId) {
        route.tripsCompleted = Math.max(0, route.tripsCompleted - 1);
      }
      // Retry na następnym ticku
      this._pendingDispatch.add(route.id);
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
      this._pendingDispatch.delete(route.id);
      EventBus.emit('tradeRoute:completed', { routeId: route.id });
      this._emitStatus();
      return;
    }

    // Próbuj wysłać kolejny kurs
    this._tryDispatch(route);
  }

  /**
   * Co tick sprawdza trasy oczekujące na dispatch (tankowanie, brak zasobów, itp.).
   */
  _checkPendingRoutes() {
    if (this._pendingDispatch.size === 0) return;

    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr) return;

    for (const routeId of [...this._pendingDispatch]) {
      const route = this._routes.find(r => r.id === routeId);
      if (!route || route.status !== 'active') {
        this._pendingDispatch.delete(routeId);
        continue;
      }

      const vessel = vMgr.getVessel(route.vesselId);
      if (!vessel || vessel.position.state !== 'docked') {
        // Statek w locie — poczekaj na vessel:docked
        this._pendingDispatch.delete(routeId);
        continue;
      }

      // Spróbuj ponownie (sprawdzi paliwo, zasoby, itp.)
      this._tryDispatch(route);
    }
  }

  _emitStatus() {
    EventBus.emit('tradeRoute:statusChanged', { routes: this.getRoutes() });
  }
}
