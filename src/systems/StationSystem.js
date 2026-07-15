// StationSystem — tworzenie/niszczenie/persistencja stacji orbitalnych (S3.3b-S2).
// Bezstanowy nad EntityManager: rejestr stacji = EntityManager.getByType('station').
// Pozycja orbity zarządzana przez OrbitalSpaceSystem (rola 'station' → GEO, anchored).
// Przyszły dom logiki dokowania/depotu/rescue (S3.3b-S3). Dostęp do innych systemów
// przez window.KOSMOS (zasada: nie importujemy systemów między sobą).

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { Station } from '../entities/Station.js';
import {
  createStarterModules, makeStationModule, stationModuleCost,
  STATION_MODULES, MODULE_SHED_ORDER, CREW_SHED_ORDER,
} from '../data/StationModuleData.js';
import { STATIONS } from '../data/StationData.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { calcShipCost } from '../data/ShipModulesData.js';
import { resolveHomeColony } from '../utils/TransferStore.js';

export class StationSystem {
  constructor() {
    // S4-2 — zmiana nazwy stacji (mirror VesselManager vessel:rename → _renameVessel).
    EventBus.on('station:rename', ({ stationId, name }) => this._renameStation(stationId, name));
    // S3.4c (D5) — osierocenie stacji po zniszczeniu kolonii-matki: przełącz na własny depot (nie niszcz).
    EventBus.on('colony:destroyed', ({ planetId }) => this._onColonyDestroyed(planetId));
    // S3.4 FAZA 2 — tick stacji: budowa modułów/statków (postęp wg civDeltaYears — spójnie z
    // ColonyManager._tickShipBuilds), bilans energii/pracy (gasi moduły), efekty (lab → research).
    EventBus.on('time:tick', ({ civDeltaYears: civDt }) => this._tick(civDt ?? 0));
  }

  /**
   * Utwórz stację na orbicie ciała (instant — Wariant A). Wołane przez
   * ColonyManager._tickPendingStationOrders (po spend) oraz debug.spawnStation.
   * Bez limitu stacji per ciało/system. @returns {Station|null} (null gdy brak ciała)
   */
  createStation(bodyId, { ownerEmpireId = 'player', stationType = 'orbital_station', tier = 1, name = null, ownerColonyId = null } = {}) {
    const body = EntityManager.get(bodyId);
    if (!body) {
      console.warn(`[StationSystem] createStation: brak ciała ${bodyId}`);
      return null;
    }

    // ID kolizjo-odporny (stacje to pierwszy runtime-user encji po generacji;
    // generateId() resetuje się przy clear() i nie jest bumpowany przez restore).
    const id   = `station_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const year = window.KOSMOS?.timeSystem?.gameTime ?? 0;

    const station = new Station({
      id,
      name:          name ?? `Stacja ${body.name}`,
      bodyId,
      ownerEmpireId,
      ownerColonyId,   // S3.4c (D1) — kolonia-matka (płatnik); null dla debug spawn bez matki
      stationType,
      tier,
      createdYear:   year,
      systemId:      body.systemId ?? 'sys_home',
      x:             body.x,
      y:             body.y,
      modules:       createStarterModules(),   // S3.4 FAZA 1.3 — 1× habitat + 1× power_atom (w cenie bazy)
    });
    EntityManager.add(station);

    // Orbita: GEO, anchored, omega=0. Serializuje się przez OrbitalSpaceSystem
    // (civ4x.orbitalSpace) — round-trip bez dodatkowego kodu.
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    if (orbital) orbital.assignOrbit(bodyId, id, 'station');

    EventBus.emit('station:created', { station });
    return station;
  }

  /** Zniszcz stację — zwolnij orbitę, usuń encję, powiadom render. */
  destroyStation(stationId) {
    const station = EntityManager.get(stationId);
    if (!station || station.type !== 'station') return false;
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    if (orbital) orbital.releaseOrbit(stationId);
    EntityManager.remove(stationId);
    EventBus.emit('station:destroyed', { stationId });
    return true;
  }

  /** Stacje na danym ciele (helper pod S3.3b-S3 dokowanie/depot). */
  getStationsAt(bodyId) {
    return EntityManager.getByType('station').filter(s => s.bodyId === bodyId);
  }

  /** Wszystkie stacje (rejestr = EntityManager). Helper pod UI/debug (S3.4). */
  getAllStations() {
    return EntityManager.getByType('station');
  }

  /** S4-2 — zmień nazwę stacji (mirror VesselManager._renameVessel; StationPanel czyta name live). */
  _renameStation(stationId, name) {
    const s = EntityManager.get(stationId);
    if (s && s.type === 'station' && name) s.name = name;
  }

  // ── Save / Restore ──────────────────────────────────────────────────────
  // Encje w civ4x.stationSystem; orbita osobno w civ4x.orbitalSpace.

  serialize() {
    return EntityManager.getByType('station').map(s => ({
      id:            s.id,
      name:          s.name,
      bodyId:        s.bodyId,
      ownerEmpireId: s.ownerEmpireId,
      ownerColonyId: s.ownerColonyId,   // S3.4c (D1) — kolonia-matka (round-trip; brak w starym save → null w konstruktorze)
      depotDetached: s.depotDetached,   // S3.4c (D5) — sierota po zniszczeniu matki (round-trip; brak → false)
      tier:          s.tier,
      stationType:   s.stationType,
      createdYear:   s.createdYear,
      depot:         s.depot.serialize(),   // S3.3b-S3 — {fuel, warp_cores} (zastąpił fuelStore/fuelCapacity)
      systemId:      s.systemId,
      modules:             s.modules,               // S3.4 FAZA 1 — lista { id, moduleType, level, active }
      pop:                 s.pop,                   // załoga (popCapacity = pochodna, NIE serializowana)
      pendingModuleOrders: s.pendingModuleOrders,   // kolejka budowy modułów
      shipQueues:          s.shipQueues,            // S3.4 FAZA 2 — kolejka stoczni (bez migracji, ?? [] w konstruktorze)
    }));
  }

  restore(data) {
    if (!Array.isArray(data)) return;
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    for (const sd of data) {
      if (!sd?.id) continue;
      if (EntityManager.get(sd.id)) continue;        // idempotent — nie duplikuj
      const station = new Station({ ...sd });
      EntityManager.add(station);
      // S3.4c (D3) — drain zawartości starego depotu do kolonii-matki (kolonie żyją — restore po
      // colonyManager.restore) + normalizacja stampu ownerColonyId dla starych save. Idempotentny.
      this._normalizeAndDrainDepot(station);
      // Orbita przywracana WCZEŚNIEJ przez orbitalSpace.restore. Defensywnie:
      // gdy jej brak (uszkodzony save) → przypisz na nowo (nowa θ akceptowalna).
      if (orbital && sd.bodyId && !orbital.hasOrbit(sd.id)) {
        orbital.assignOrbit(sd.bodyId, sd.id, 'station');
      }
      EventBus.emit('station:created', { station });
    }
  }

  /**
   * S3.4c (D3) — normalizacja + drain depotu stacji przy restore. Dla stacji gracza z rozwiązywalną
   * kolonią-matką: (1) stampuje `ownerColonyId` gdy brak (stare save bez stampu — by runtime
   * orphaning matchował po stampie), (2) przelewa surową zawartość depotu (Mapa z save) do magazynu
   * kolonii tym samym resolverem co runtime. IDEMPOTENTNY (drugi przebieg = pusta Mapa → no-op).
   * Sierota (brak matki / depotDetached) NIETKNIĘTA — jej depot to jedyny magazyn.
   */
  _normalizeAndDrainDepot(station) {
    if (!station || station.ownerEmpireId !== 'player') return;   // AI — depot własny, bez normalizacji
    if (station.depotDetached) return;                            // zapisana sierota — zostaw własny depot
    const col = resolveHomeColony(station);
    if (!col?.resourceSystem) return;                             // brak matki → sierota (własny depot)
    if (!station.ownerColonyId) station.ownerColonyId = col.planetId;   // stamp normalizacyjny (stare save)
    station.depot.drainOwnInventoryTo(col.resourceSystem);        // przelej zawartość → magazyn kolonii
  }

  /**
   * S3.4c (D5) — reakcja na zniszczenie kolonii. Osierocenie stacji, których matką była zniszczona
   * kolonia: ustaw `depotDetached` (wymusza własny depot mimo fallbacków). Match po STAMPIE
   * `ownerColonyId` — kolonia jest już usunięta z rejestru (emit po _colonies.delete), więc
   * resolveHomeColony jej nie potwierdzi. Stacja NIE jest niszczona — zamraża się z pustym magazynem.
   */
  _onColonyDestroyed(planetId) {
    if (!planetId) return;
    for (const st of EntityManager.getByType('station')) {
      if (st.ownerEmpireId !== 'player' || st.depotDetached) continue;
      if (st.ownerColonyId === planetId) {
        st.depotDetached = true;
        EventBus.emit('station:orphaned', { stationId: st.id, formerColonyId: planetId });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // S3.4 FAZA 2 — LOGIKA STACJI (moduły: budowa/energia/praca/efekty; stocznia)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Zamówienia budowy modułów (mirror ColonyManager pending-order) ──────────

  /**
   * Dodaj zamówienie budowy modułu. Bramka: tech (module.requires) + limit slotów
   * (STATIONS.maxModules, liczone modules + pendingModuleOrders). Koszt = stationModuleCost.
   * Order startuje jako 'queued' — spend odroczony do momentu, aż depot stać (w _tick).
   * @returns {{ok:boolean, reason?:string, orderId?:string}}
   */
  addPendingModuleOrder(stationId, moduleType, level = 1) {
    const station = EntityManager.get(stationId);
    if (!station || station.type !== 'station') return { ok: false, reason: 'no_station' };

    const def = STATION_MODULES[moduleType];
    if (!def) return { ok: false, reason: 'unknown_module' };

    // Bramka tech (fail-closed jak ColonyManager.addPendingStationOrder)
    if (def.requires) {
      const techSys = window.KOSMOS?.techSystem;
      if (!techSys?.isResearched?.(def.requires)) {
        EventBus.emit('station:moduleOrderRejected', { stationId, moduleType, reason: 'requiresTech', requires: def.requires });
        return { ok: false, reason: 'requiresTech', requires: def.requires };
      }
    }

    // Limit slotów (zajęte moduły + zamówienia w toku)
    const maxModules = STATIONS[station.stationType]?.maxModules ?? 8;
    const used = station.modules.length + station.pendingModuleOrders.length;
    if (used >= maxModules) {
      EventBus.emit('station:moduleOrderRejected', { stationId, moduleType, reason: 'no_slots' });
      return { ok: false, reason: 'no_slots' };
    }

    const order = {
      id:        `smo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      moduleType,
      level,
      cost:      stationModuleCost(moduleType),
      status:    'queued',   // 'queued' (czeka na środki) → 'building' (spend pobrany, progres)
      progress:  0,
      buildTime: def.buildTime,
    };
    station.pendingModuleOrders.push(order);
    EventBus.emit('station:moduleOrderQueued', { stationId, order });
    return { ok: true, orderId: order.id };
  }

  /** Anuluj zamówienie modułu. Bez zwrotu kosztu (konwencja stacji — jak cancelPendingStationOrder). */
  cancelPendingModuleOrder(stationId, orderId) {
    const station = EntityManager.get(stationId);
    if (!station?.pendingModuleOrders) return false;
    const idx = station.pendingModuleOrders.findIndex(o => o.id === orderId);
    if (idx === -1) return false;
    station.pendingModuleOrders.splice(idx, 1);
    EventBus.emit('station:moduleOrderCancelled', { stationId, orderId });
    return true;
  }

  getPendingModuleOrders(stationId) {
    return EntityManager.get(stationId)?.pendingModuleOrders ?? [];
  }

  /**
   * S3.4 FAZA 3 — rozbiórka ZBUDOWANEGO modułu. BEZ zwrotu kosztu (konwencja stacji — jak cancel
   * budowy). Slot wraca do pustego; bilanse (energia/praca/tradeCapacity/popCapacity) przeliczą się
   * na kolejnym ticku (_recomputeModuleStates). Guard: rozbiórka habitatu może zejść popCapacity
   * poniżej pop (pasażerowie = FAZA 4) → DOZWOLONA z console.warn (limit egzekwuje FAZA 4, spójnie
   * z decyzją o stationSetPop). @returns {boolean}
   */
  demolishModule(stationId, moduleId) {
    const station = EntityManager.get(stationId);
    if (!station?.modules) return false;
    const idx = station.modules.findIndex(m => m.id === moduleId);
    if (idx === -1) return false;
    const [removed] = station.modules.splice(idx, 1);
    // K2 (FAZA 4): rozbiórka ZABLOKOWANA, jeśli po niej pop przekroczyłby popCapacity (zasiedlony
    // habitat). Zastępuje wariant „dozwolone + warn". Splice-check-revert korzysta z żywego gettera
    // popCapacity (liczonego z modules). Gracz musi najpierw przetransportować POP. Defense-in-depth —
    // UI (StationManagementView) i tak wyszarza przycisk (station_mgmt_demolish_blocked).
    if ((station.pop ?? 0) > station.popCapacity) {
      station.modules.splice(idx, 0, removed);   // przywróć — rozbiórka niedozwolona
      return false;
    }
    EventBus.emit('station:moduleDemolished', { stationId, moduleId, moduleType: removed.moduleType });
    return true;
  }

  // ── Stocznia orbitalna — kolejka budowy statków (MVP: bez POP, koszt z depotu) ──

  /**
   * Zakolejkuj statek w stoczni stacji. Buduje WYŁĄCZNIE projekty gracza (kadłub + moduły z
   * `window.KOSMOS.unitDesigns`) — parytet ze stocznią kolonijną (S3.4 FAZA 3 R2, decyzja #10).
   * Wymaga AKTYWNEGO modułu shipyard (bilans energii/pracy w _recomputeModuleStates — sam moduł
   * potrzebuje obsady jak każdy) + tech KADŁUBA + środków w depocie (spend all-or-nothing).
   * MVP: sama BUDOWA statku nie blokuje POP (brak crewCost — inaczej niż kolonia; koszt tylko z depotu).
   * @param {string} stationId
   * @param {string} shipId    — id kadłuba projektu (HULLS) lub legacy statku (SHIPS)
   * @param {string[]} moduleIds — moduły projektu (koszt liczony przez calcShipCost, spawn z modułami)
   * @returns {{ok:boolean, reason?:string, missing?:object}}
   */
  queueStationShip(stationId, shipId, moduleIds = []) {
    const station = EntityManager.get(stationId);
    if (!station || station.type !== 'station') return { ok: false, reason: 'no_station' };
    if (!station.hasActiveShipyard) return { ok: false, reason: 'no_shipyard' };

    const ship = SHIPS[shipId] ?? HULLS[shipId];
    if (!ship) return { ok: false, reason: 'unknown_ship' };

    // Bramka tech (gracz — globalny techSystem). Kadłub gatuje budowę; moduły projektu odblokowuje
    // projektant (statku z zablokowanym modułem nie da się zapisać jako projekt).
    if (ship.requires && !window.KOSMOS?.techSystem?.isResearched?.(ship.requires)) {
      EventBus.emit('station:shipBuildRejected', { stationId, shipId, reason: 'requiresTech', requires: ship.requires });
      return { ok: false, reason: 'requiresTech', requires: ship.requires };
    }

    // Koszt = kadłub + MODUŁY projektu (calcShipCost — identycznie jak stocznia kolonijna). BRAK
    // kredytów/paliwa: budowa płacona wyłącznie MATERIAŁAMI z depotu (kredyty utrzymania floty to
    // osobny sink — S3.5a-1 — z globalnej puli gracza, nie z depotu stacji).
    const mods = (moduleIds ?? []).filter(Boolean);
    const { cost: rawCost, commodityCost } = calcShipCost(ship, mods);
    const cost = { ...rawCost, ...commodityCost };
    if (!station.depot.spend(cost)) {
      // Wypisz brakujące pozycje (have < need) — żeby live-gate dało się debugować z konsoli.
      const missing = {};
      for (const [id, amt] of Object.entries(cost)) {
        const have = station.depot.getAmount(id);
        if (have < amt) missing[id] = +(amt - have).toFixed(3);
      }
      EventBus.emit('station:shipBuildRejected', { stationId, shipId, reason: 'insufficient_resources', missing });
      return { ok: false, reason: 'insufficient_resources', missing };
    }

    station.shipQueues.push({ shipId, modules: mods, progress: 0, buildTime: ship.buildTime ?? 5 });
    EventBus.emit('station:shipBuildStarted', { stationId, shipId });
    return { ok: true };
  }

  /** Anuluj budowę statku w stoczni (indeks w shipQueues). Bez zwrotu (konwencja stacji). */
  cancelStationShip(stationId, index) {
    const station = EntityManager.get(stationId);
    if (!station?.shipQueues || index < 0 || index >= station.shipQueues.length) return false;
    station.shipQueues.splice(index, 1);
    EventBus.emit('station:shipBuildCancelled', { stationId, index });
    return true;
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  /** Tick wszystkich stacji (civDeltaYears). Kolejność: budowa modułów → bilans → efekty → stocznia. */
  _tick(civDt) {
    if (civDt <= 0) return;
    const stations = EntityManager.getByType('station');
    if (stations.length === 0) return;
    for (const station of stations) {
      this._tickModuleOrders(station, civDt);
      this._recomputeModuleStates(station);   // po budowie — świeży moduł wchodzi do bilansu
      this._tickEffects(station, civDt);
      this._tickShipQueues(station, civDt);
    }
  }

  /** Budowa modułów: 'queued' → (depot stać → spend) → 'building' → (progres ≥ buildTime) → moduł active. */
  _tickModuleOrders(station, civDt) {
    const orders = station.pendingModuleOrders;
    if (!orders || orders.length === 0) return;
    for (let i = orders.length - 1; i >= 0; i--) {
      const o = orders[i];
      if (o.status === 'queued') {
        // spend all-or-nothing z depotu (StationDepot.spend nie pobiera gdy nie stać)
        if (station.depot.spend(o.cost)) {
          o.status = 'building';
          o.progress = 0;
          EventBus.emit('station:moduleBuildStarted', { stationId: station.id, order: o });
        }
        continue;   // nieopłacalne → czeka w kolejce
      }
      if (o.status === 'building') {
        o.progress += civDt;
        if (o.progress >= o.buildTime) {
          station.modules.push(makeStationModule(o.moduleType, o.level, true));
          orders.splice(i, 1);
          EventBus.emit('station:moduleBuilt', { stationId: station.id, moduleType: o.moduleType, level: o.level });
        }
      }
    }
  }

  /**
   * Bilans energii + pracy. Reset wszystkich modułów na active, potem:
   *  (1) ENERGIA — gaś KONSUMENTÓW (MODULE_SHED_ORDER: trade→lab→shipyard) aż net energii ≥ 0.
   *      Producenci (power_*) nigdy nie gaszeni dla energii.
   *  (2) PRACA — gaś wg CREW_SHED_ORDER (konsumenci → power_*) aż Σ popWork(active) ≤ pop.
   * S3.4 FAZA 4 (decyzja obsada=pop): dostępna załoga = `station.pop` (habitat daje TYLKO
   * pojemność, NIE obsadę). Świeża stacja z pop=0 → wszystkie moduły z popWork>0 (w tym power_*)
   * na no_crew; żyją tylko habitat i power_solar_auto (popWork 0). Stacja ożywa po dowiezieniu POP.
   */
  _recomputeModuleStates(station) {
    const mods = station.modules;
    if (!mods || mods.length === 0) return;
    for (const m of mods) { m.active = true; m.inactiveReason = null; }

    const energyOf  = (m) => STATION_MODULES[m.moduleType]?.energy  ?? 0;
    const popWorkOf = (m) => STATION_MODULES[m.moduleType]?.popWork ?? 0;

    // Energia: gaś konsumentów dopóki net < 0
    let guard = 0;
    while (guard++ < 64) {
      let net = 0;
      for (const m of mods) if (m.active !== false) net += energyOf(m);
      if (net >= 0) break;
      const t = this._firstActiveSheddable(station, MODULE_SHED_ORDER);
      if (!t) break;   // tylko producenci/core aktywne — deficyt akceptowany (zbuduj więcej energii)
      t.active = false; t.inactiveReason = 'no_power';
    }

    // Praca: gaś wg CREW_SHED_ORDER (power OSTATNIE) dopóki Σ popWork(active) > pop (epsilon na float).
    // Konsumenci gasną przed power → gdy power gaśnie, żaden aktywny konsument już go nie potrzebuje
    // (invariant: każdy moduł z popWork>0 jest w CREW_SHED_ORDER i wcześniej od power).
    const availCrew = station.pop ?? 0;
    guard = 0;
    while (guard++ < 64) {
      let crew = 0;
      for (const m of mods) if (m.active !== false) crew += popWorkOf(m);
      if (crew <= availCrew + 1e-9) break;
      const t = this._firstActiveSheddable(station, CREW_SHED_ORDER);
      if (!t) break;   // pozostały tylko moduły popWork=0 (habitat/power_solar_auto) — best-effort
      t.active = false; t.inactiveReason = 'no_crew';
    }
  }

  /** Pierwszy AKTYWNY moduł do wyłączenia wg zadanej kolejności (MODULE_SHED_ORDER / CREW_SHED_ORDER). */
  _firstActiveSheddable(station, order) {
    for (const type of order) {
      const m = station.modules.find(mm => mm.active !== false && mm.moduleType === type);
      if (m) return m;
    }
    return null;
  }

  /** Efekty modułów aktywnych: lab → research do globalnej puli (home colony). trade/pop = gettery. */
  _tickEffects(station, civDt) {
    let labRP = 0;
    for (const m of station.modules) {
      if (m.active === false) continue;
      const def = STATION_MODULES[m.moduleType];
      if (def?.researchPerYear) labRP += def.researchPerYear * (m.level || 1);
    }
    if (labRP > 0) {
      const col = this._resolveHomeColony();
      col?.resourceSystem?.receive?.({ research: labRP * civDt });
    }
  }

  /** Stocznia: progres kolejki (tylko gdy shipyard aktywny) → spawn statku zadokowanego przy stacji. */
  _tickShipQueues(station, civDt) {
    const q = station.shipQueues;
    if (!q || q.length === 0) return;
    if (!station.hasActiveShipyard) return;   // zgaszona stocznia (no_power/no_crew) → build wstrzymany
    for (let i = q.length - 1; i >= 0; i--) {
      q[i].progress += civDt;
      if (q[i].progress >= q[i].buildTime) {
        const shipId  = q[i].shipId;
        const modules = q[i].modules ?? [];
        q.splice(i, 1);
        this._spawnStationShip(station, shipId, modules);
      }
    }
  }

  /** Materializuj statek zbudowany w stoczni: createAndRegister + dockAtStation + dodaj do floty domu. */
  _spawnStationShip(station, shipId, modules = []) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?.createAndRegister) return;
    const homeCol  = this._resolveHomeColony();
    const colonyId = homeCol?.planetId ?? window.KOSMOS?.homePlanet?.id ?? null;
    const body     = EntityManager.get(station.bodyId);
    const vessel = vMgr.createAndRegister(shipId, colonyId, {
      x: body?.x ?? station.x,
      y: body?.y ?? station.y,
      modules,   // moduły projektu → colonistCapacity/staty (parytet ze stocznią kolonijną)
    });
    if (!vessel) return;
    vMgr.dockAtStation?.(vessel.id, station.id);   // port uniwersalny (nie zmienia vessel.colonyId)
    if (homeCol?.fleet) homeCol.fleet.push(vessel.id);
    EventBus.emit('station:shipCompleted', { stationId: station.id, shipId, vesselId: vessel.id });
  }

  /** Stabilna kolonia-dom (sink researchu + dom statków ze stoczni): home planet → 1. kolonia gracza. */
  _resolveHomeColony() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return null;
    const home = window.KOSMOS?.homePlanet;
    const homeCol = home ? colMgr.getColony?.(home.id) : null;
    if (homeCol?.resourceSystem) return homeCol;
    const all = colMgr.getPlayerColonies?.() ?? [];
    return all.find(c => c.resourceSystem) ?? null;
  }
}
