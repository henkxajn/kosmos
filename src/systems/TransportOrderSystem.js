// TransportOrderSystem — MVP logistyki: ręcznie inicjowane Zlecenia Transportowe.
//
// Gracz jawnie deklaruje zlecenie (ile dobra A i B przewieźć, z kolonii F do kolonii T);
// gra automatycznie ogarnia wykonanie statkami z opt-in „puli logistycznej". To NIE jest
// jeszcze Giełda Ładunkowa (bez auto-detekcji deficytu, bez trybów Manual/Priorytetowy/
// Reaktywny, bez urgency scoring) — plan: `docs/plan-gielda-ladunkowa.md` (materiał na PO
// ocenie tej wersji light).
//
// ── Zasady (świadome decyzje architektoniczne, patrz plan MVP) ──────────────────────────
//  • Stan żyje w gameState.transportOrders (reactive store) — { orders[], pool[], nextId }.
//    Autorytatywny przydział statku do zlecenia jest w order.assignments[] (NIE na Vessel —
//    unikamy dual-source-of-truth, które zrobiło z AI-owego assignedRouteId martwy marker).
//  • Pula logistyczna = OSOBNY rejestr vesselId (opt-in per statek). Kwalifikacja wymaga
//    !isEnemyVessel → zbiory „pula gracza" i „kurierzy AI" są rozłączne z definicji.
//  • Transporty WYŁĄCZNIE przez OrderService.issueTransport — nigdy równolegle surowy
//    dispatchOnMission (izolacja od EmpireLogisticsSystem, który leci surowym VesselManagerem).
//  • Maszyna stanów per przydzielony statek — mirror kurierów AI, ale przez OrderService i
//    z REALNYM paliwem (potwierdzone empirycznie: pusty lot to_origin zużywa paliwo, statek
//    dokuje w źródle F przez dockAtTarget). Zamiast sztywnego outpost→stolica: (F, T, goods).
//  • Dispatcher fair-share: wszystkie otwarte zlecenia obsługiwane RÓWNOLEGLE — statki dobierane
//    wg głodu (mniej przypisanych statków = pierwszeństwo), FIFO tylko tie-break. Bez scoringu pilności.
//  • Zlecenie JEDNORAZOWE — po dostarczeniu całości znika, statki wracają do puli.
//  • MVP: same-system only (loty warp = Warstwa 3), tylko kolonie (nie stacje).
//
// Kolaboratorzy leniwie przez window.KOSMOS (zero cross-importów między systemami).
// Kill-switch: GAME_CONFIG.FEATURES.transportOrders (default ON).

import EventBus                       from '../core/EventBus.js';
import { GAME_CONFIG }                from '../config/GameConfig.js';
import { isEnemyVessel, loadCargo, isInService } from '../entities/Vessel.js';
import { COMMODITIES }                from '../data/CommoditiesData.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { isPlayerColony } from '../utils/ColonyOwnership.js';

const SWEEP_INTERVAL_CIVYEARS = 0.5;   // lekki sweep łapiący statki w fazie 'waiting' + backstop dispatchu

export class TransportOrderSystem {
  constructor() {
    this._sweepAccum = 0;

    // Bind + subskrypcje. Przylot transportu (główny driver maszyny stanów), cleanup, sweep.
    this._onArrivedBound = (d) => this._onArrival(d);
    this._onWreckedBound = (d) => this._onVesselWrecked(d);
    this._onColonyDestroyedBound = (d) => this._onColonyDestroyed(d);
    this._onTickBound = (d) => this._onTick(d);
    this._onMissionAbortedBound     = (d) => this._onMissionAborted(d);

    // TYLKO 'expedition:arrived' — MissionSystem._emit emituje OBA ('mission:arrived'
    // + 'expedition:arrived') dla każdego przylotu; subskrypcja obu = podwójne _onArrival
    // (drugie przetwarza już zmutowaną fazę → „kończy" haul na statku w locie).
    EventBus.on('expedition:arrived', this._onArrivedBound);
    EventBus.on('vessel:wrecked',     this._onWreckedBound);
    EventBus.on('colony:destroyed',   this._onColonyDestroyedBound);
    // ⚠ W3-1: przejęte ciało przestaje być prawidłowym końcem zlecenia (żyje, ale jest wrogie).
    EventBus.on('colony:captured',    this._onColonyDestroyedBound);
    EventBus.on('time:tick',          this._onTickBound);
    // ⚠ VO-3 — PREEMPCJA. Rozkaz gracza zabija misje kuriera, ale pula o tym nie wiedziala:
    //   TOS nie subskrybowal ZADNEGO zdarzenia rozkazu ani przerwania misji, wiec zlecenie
    //   zostawalo przypisane do statku, ktory juz nic nie wiozl. ZMIERZONE: po posciagu wydanym
    //   wozacemu kurierowi zlecenie wisialo `hauling` z zamrozonym `{Fe:50}` przez 60 lat gry,
    //   a `inFlight` REZERWOWAL te jednostki, wiec inne statki z puli tez ich nie wzialy.
    //   ⚠ Kanalem jest `mission:aborted`, a NIE `vessel:orderCancelled`: ten drugi leci tylko,
    //   gdy istnial POPRZEDNI `movementOrder`, a kurier na kursie jedzie na MISJI (issueTransport)
    //   i zadnego rozkazu ruchu nie ma — emisja by go nie dosiegla (zmierzone).
    //   Wlascicielem stanu misji jest MissionSystem i to on oglasza przerwanie; pula sprzata sie SAMA,
    //   zamiast rosnac jako kolejne wywolanie w `_preemptCommit`.
    EventBus.on('mission:aborted',     this._onMissionAbortedBound);
  }

  destroy() {
    EventBus.off('expedition:arrived', this._onArrivedBound);
    EventBus.off('vessel:wrecked',     this._onWreckedBound);
    EventBus.off('colony:destroyed',   this._onColonyDestroyedBound);
    EventBus.off('colony:captured',    this._onColonyDestroyedBound);
    EventBus.off('time:tick',          this._onTickBound);
    EventBus.off('mission:aborted',     this._onMissionAbortedBound);
  }

  // ── Kolaboratorzy (leniwie) ─────────────────────────────────────────────────
  _vm()  { return window.KOSMOS?.vesselManager ?? null; }
  _cm()  { return window.KOSMOS?.colonyManager ?? null; }
  _os()  { return window.KOSMOS?.orderService ?? null; }
  _gs()  { return window.KOSMOS?.gameState ?? null; }
  _state() { return this._gs()?.get?.('transportOrders') ?? null; }
  _gameYear() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }
  get _enabled() { return GAME_CONFIG.FEATURES?.transportOrders !== false; }

  // ── API: pula logistyczna (opt-in per statek) ───────────────────────────────

  isInPool(vesselId) { return !!this._state()?.pool?.includes(vesselId); }
  getPool()          { return [...(this._state()?.pool ?? [])]; }

  addToPool(vesselId) {
    const st = this._state();
    const v  = this._vm()?.getVessel?.(vesselId);
    if (!st || !v || isEnemyVessel(v)) return false;   // tylko statki gracza
    if (!st.pool.includes(vesselId)) {
      st.pool.push(vesselId);
      EventBus.emit('transportOrder:poolChanged', { vesselId, inPool: true });
      this._pump();
    }
    return true;
  }

  removeFromPool(vesselId) {
    const st = this._state();
    if (!st) return false;
    const i = st.pool.indexOf(vesselId);
    if (i >= 0) {
      st.pool.splice(i, 1);
      EventBus.emit('transportOrder:poolChanged', { vesselId, inPool: false });
    }
    return true;
  }

  togglePool(vesselId) {
    return this.isInPool(vesselId) ? this.removeFromPool(vesselId) : this.addToPool(vesselId);
  }

  // ── API: zlecenia ────────────────────────────────────────────────────────────

  getOrders()      { return [...(this._state()?.orders ?? [])]; }
  getOrder(orderId) { return this._state()?.orders?.find(o => o.id === orderId) ?? null; }

  /**
   * Utwórz zlecenie transportowe F→T z deklarowanymi dobrami.
   * @param {{fromColonyId:string, toColonyId:string, goods:Object<string,number>}} spec
   * @returns {{ok:boolean, orderId?:number, reason?:string}}
   */
  createOrder({ fromColonyId, toColonyId, goods } = {}) {
    if (!this._enabled) return { ok: false, reason: 'disabled' };
    const cm = this._cm(), st = this._state();
    if (!cm || !st) return { ok: false, reason: 'no_system' };
    if (!fromColonyId || !toColonyId || fromColonyId === toColonyId) return { ok: false, reason: 'invalid_route' };

    const from = cm.getColony(fromColonyId), to = cm.getColony(toColonyId);
    if (!from || !to) return { ok: false, reason: 'colony_missing' };
    if (!_isPlayerColony(from) || !_isPlayerColony(to)) return { ok: false, reason: 'not_player_colony' };

    // Cross-system dozwolone: OrderService robi composite (warp→dostawa). Bez bramki tech —
    // brak statku warp w puli → zlecenie po prostu czeka (jak przy pustej puli). Układy
    // wyprowadzamy NA ŻYWO z kolonii w dispatcherze (kolonie nie zmieniają układu) → bez migracji.
    const fromSys = from.systemId ?? 'sys_home';

    // Sanityzacja dóbr — tylko dodatnie całkowite ilości.
    const clean = {};
    for (const [g, q] of Object.entries(goods ?? {})) {
      const n = Math.floor(Number(q) || 0);
      if (n > 0) clean[g] = n;
    }
    if (Object.keys(clean).length === 0) return { ok: false, reason: 'no_goods' };

    const order = {
      id:           st.nextId++,
      fromColonyId, toColonyId,
      systemId:     fromSys,
      goods:        clean,        // zadeklarowane sumy
      delivered:    {},           // postęp (dostarczone do T)
      inFlight:     {},           // w locie / zarezerwowane (anty-nadmiar przy wielu statkach)
      assignments:  [],           // [{ vesselId, phase, courseCargo }]
      createdYear:  this._gameYear(),
    };
    st.orders.push(order);
    EventBus.emit('transportOrder:created', { orderId: order.id, fromColonyId, toColonyId, goods: clean });
    this._pump();
    return { ok: true, orderId: order.id };
  }

  /** Anuluj zlecenie — statki wracają do puli (zostają tam, gdzie są, jako wolne). */
  cancelOrder(orderId) {
    const st = this._state();
    if (!st) return false;
    const i = st.orders.findIndex(o => o.id === orderId);
    if (i < 0) return false;
    st.orders[i].assignments.length = 0;   // zwolnij przydziały (statki zostają zadokowane, wolne)
    st.orders.splice(i, 1);
    EventBus.emit('transportOrder:cancelled', { orderId, reason: 'player' });
    this._pump();
    return true;
  }

  // ── Restore-hook (po vesselManager.restore) ──────────────────────────────────
  onRestore() {
    const st = this._state();
    if (!st) return;
    const vm = this._vm(), cm = this._cm();

    // Prune puli: martwe / wrogie statki.
    st.pool = (st.pool ?? []).filter(id => {
      const v = vm?.getVessel?.(id);
      return v && !isEnemyVessel(v) && !v.isWreck;
    });

    // Prune zleceń: brakująca kolonia F/T → anuluj; martwe statki w przydziałach → zwolnij inFlight.
    for (const o of [...(st.orders ?? [])]) {
      o.delivered ??= {}; o.inFlight ??= {}; o.assignments ??= [];
      if (!cm?.hasColony?.(o.fromColonyId) || !cm?.hasColony?.(o.toColonyId)) {
        o.assignments.length = 0;
        st.orders.splice(st.orders.indexOf(o), 1);
        EventBus.emit('transportOrder:cancelled', { orderId: o.id, reason: 'colony_lost' });
        continue;
      }
      o.assignments = o.assignments.filter(a => {
        const v = vm?.getVessel?.(a.vesselId);
        if (!v || v.isWreck) { this._releaseInFlight(o, a); return false; }
        return true;
      });
    }
    this._pump();
  }

  // ── Maszyna stanów (event-driven; główny driver = przylot transportu) ────────

  _onArrival({ expedition } = {}) {
    if (!this._enabled) return;
    const exp = expedition;
    if (!exp || exp.type !== 'transport' || !exp.vesselId) return;
    const found = this._findAssignment(exp.vesselId);
    if (!found) return;                                   // nie nasze zlecenie
    const { order, a } = found;
    const v = this._vm()?.getVessel?.(exp.vesselId);
    if (!v) { this._releaseAssignment(order, a); this._pump(); return; }

    if (a.phase === 'hauling') {
      this._completeHaul(order, a, v);                    // dowiózł do T → rozlicz + przeplanuj
    } else {
      this._driveVessel(order, a, v);                     // przyleciał do F (to_origin) → załaduj i wyślij
      this._pump();
    }
  }

  /**
   * Napędź pojedynczy przydzielony statek wg jego pozycji/fazy. Idempotentne:
   * statek w locie (nie docked) jest pomijany — MissionSystem interpoluje i wyśle przylot.
   * Wołane z przylotu, sweepu i onRestore → jedno źródło logiki „co ma robić statek".
   */
  _driveVessel(order, a, v) {
    if (!v || v.isWreck) { this._releaseAssignment(order, a); return; }
    const docked    = v.position?.state === 'docked';
    const available = v.status === 'idle' || v.status === 'refueling';
    if (!docked || !available) return;                    // w locie / zajęty → zostaw

    if (a.phase === 'hauling') {
      if (v.position.dockedAt === order.toColonyId) { this._completeHaul(order, a, v); return; }
      // launch się nie powiódł (paliwo) / post-load: statek dalej w F z cargo → ponów haul.
      if ((v.cargoUsed ?? 0) > 0) { this._issueHaul(order, a, v); return; }
      a.phase = 'to_origin'; a.courseCargo = {};          // hauling bez cargo i nie w T → przeplanuj
    }

    // to_origin / waiting: zapewnij obecność w F, potem załaduj.
    if (v.position.dockedAt === order.fromColonyId) {
      this._loadAndHaul(order, a, v);
    } else {
      this._issueEmptyToF(order, a, v);
    }
  }

  /** Pusty przelot do źródła F (statek zadokowany w innym ciele, np. w T po dostawie). */
  _issueEmptyToF(order, a, v) {
    a.phase = 'to_origin'; a.courseCargo = {};
    // targetSystemId = układ źródła (live). Ten sam układ → direct pusty lot; inny → OrderService
    // robi composite (skok warp z powrotem → lot in-system do F). Launch może paść (paliwo/warp) →
    // statek zostaje docked, sweep ponowi po dotankowaniu (in-system LUB warp_cores). Zadbanie o
    // zatankowanie statków warp w puli należy do gracza (brak automatycznej bramki round-trip).
    this._os()?.issueTransport?.(v.id, { targetId: order.fromColonyId, targetSystemId: this._sysOf(order.fromColonyId), cargo: {} });
  }

  /** Na F: załaduj mix dóbr (clamp cargoMax/waga, ≤ remaining−inFlight) i wyślij do T. */
  _loadAndHaul(order, a, v) {
    const srcCol = this._cm()?.getColony(order.fromColonyId);
    if (!srcCol?.resourceSystem) { this._releaseAssignment(order, a); return; }

    let anyWant = false, loadedTotal = 0;
    const courseCargo = {};
    for (const [g, total] of Object.entries(order.goods)) {
      const want = total - (order.delivered[g] ?? 0) - (order.inFlight[g] ?? 0);
      if (want <= 0) continue;
      anyWant = true;
      const loaded = loadCargo(v, g, want, srcCol.resourceSystem);   // clampuje wg wolnego miejsca/wagi/dostępności
      if (loaded > 0) {
        courseCargo[g] = (courseCargo[g] ?? 0) + loaded;
        order.inFlight[g] = (order.inFlight[g] ?? 0) + loaded;
        loadedTotal += loaded;
      }
    }

    if (loadedTotal > 0) {
      a.courseCargo = courseCargo;
      a.phase = 'hauling';
      this._issueHaul(order, a, v);
    } else if (anyWant) {
      a.phase = 'waiting';                                 // źródło puste → sweep ponowi (akumuluj produkcję)
    } else {
      this._releaseAssignment(order, a);                   // nic do wożenia (inne statki pokryły) → zwolnij
    }
  }

  /** Wyślij załadowany statek do celu T. Cargo już fizycznie na statku (cargoPreloaded). */
  _issueHaul(order, a, v) {
    // targetSystemId = układ celu (live). Ten sam co statek → direct; inny → composite warp→dostawa.
    this._os()?.issueTransport?.(v.id, {
      targetId: order.toColonyId, targetSystemId: this._sysOf(order.toColonyId), cargo: { ...a.courseCargo },
    });
  }

  /**
   * Statek dowiózł kurs do T (lub backstop w sweepie). Idempotentne przez pusty courseCargo:
   * pierwsze wywołanie rozlicza dostawę i przeplanuje, kolejne (event vs sweep) jest no-opem.
   */
  _completeHaul(order, a, v) {
    const cc = a.courseCargo;
    if (!cc || Object.keys(cc).length === 0) return;       // już rozliczone → NIE przeplanuj (anty-double)

    for (const [g, q] of Object.entries(cc)) {
      order.delivered[g] = (order.delivered[g] ?? 0) + q;
      order.inFlight[g]  = Math.max(0, (order.inFlight[g] ?? 0) - q);
    }
    a.courseCargo = {};

    if (this._isComplete(order)) { this._closeOrder(order); this._pump(); return; }

    if (this._unreservedUnits(order) > 0) {
      this._issueEmptyToF(order, a, v);                    // kolejny kurs — wróć po ładunek do F
    } else {
      this._releaseAssignment(order, a);                   // reszta w locie u innych → zwolnij statek
    }
    this._pump();
  }

  // ── Dispatcher FIFO + sweep ──────────────────────────────────────────────────

  /**
   * Główna pompa: (1) re-napędza zadokowane przydzielone statki (waiting/launch-failed),
   * (2) FIFO dispatch wolnych statków z puli do otwartych zleceń (wiele statków/zlecenie OK).
   * Idempotentna — statek w locie pomijany; anti-overshoot przez inFlight + rezerwację pojemności.
   */
  _pump() {
    if (!this._enabled) return;
    const st = this._state();
    if (!st) return;
    const vm = this._vm();
    if (!vm) return;

    // 1. Napędź istniejące przydziały (waiting po restocku, launch retry po dotankowaniu).
    for (const order of st.orders) {
      for (const a of [...order.assignments]) {
        const v = vm.getVessel(a.vesselId);
        if (!v) { this._releaseAssignment(order, a); continue; }
        this._driveVessel(order, a, v);
      }
    }

    // 2. Fair-share dispatch wolnych statków z puli — WSZYSTKIE otwarte zlecenia obsługiwane
    //    RÓWNOLEGLE. Wcześniej pętla FIFO-greedy nasycała najstarsze zlecenie do pełna zanim
    //    tknęła następne → jedno duże zlecenie zabierało całą pulę, a reszta czekała z „0
    //    statków". Teraz każda runda przydziela statki wg GŁODU: zlecenie z mniejszą liczbą
    //    już przypisanych statków bierze pierwsze (FIFO tie-break). Kluczowe, że sortujemy po
    //    LICZBIE PRZYDZIAŁÓW (nie tylko wewnątrz jednego _pump) — statki dochodzą do puli
    //    pojedynczo (każdy addToPool/dostawa = osobny _pump), więc bez tego duże zlecenie i tak
    //    łapałoby każdy kolejny statek. Zlecenie z 0 statków wyprzedza to, które ma już flotę.
    const free = this._freePoolVessels();
    if (!free.length) return;

    // Pozostała tonaż per zlecenie (minus pojemność statków JUŻ przypisanych, niezaładowanych
    // — anti-overshoot). Liczona raz; w rundach odejmujemy cargoMax dobranego statku.
    const tonsLeft = new Map();
    for (const order of st.orders) {
      if (this._unreservedUnits(order) <= 0) continue;
      let tons = this._remainingTonnage(order);
      for (const a of order.assignments) {
        if (a.phase === 'to_origin' || a.phase === 'waiting') {
          tons -= (vm.getVessel(a.vesselId)?.cargoMax ?? 0);
        }
      }
      tonsLeft.set(order, tons);
    }
    if (tonsLeft.size === 0) return;

    // Set `consumed` — statek trafia do co najwyżej JEDNEGO zlecenia; pominięty dla jednego
    // (np. brak warp) może obsłużyć inne. Bez tego warp-only zablokowałby resztę.
    const consumed = new Set();
    let progress = true;
    while (progress) {
      progress = false;
      // Sortuj wygłodzone zlecenia: najmniej przypisanych statków → pierwsze; FIFO tie-break.
      const ordered = [...tonsLeft.keys()]
        .filter(o => (tonsLeft.get(o) ?? 0) > 0)
        .sort((x, y) =>
          (x.assignments.length - y.assignments.length) ||
          (x.createdYear - y.createdYear) || (x.id - y.id));
      for (const order of ordered) {
        const v = this._pickFreeVessel(free, consumed, order);
        if (!v) continue;
        consumed.add(v.id);
        this._assignVessel(order, v.id);
        tonsLeft.set(order, (tonsLeft.get(order) ?? 0) - (v.cargoMax ?? 0));
        progress = true;
      }
    }
  }

  /**
   * Wybierz wolny (niezużyty) statek zdatny do obsługi zlecenia. Dla zleceń same-system
   * preferuj statek BEZ warp — rzadkie statki warp zostawiamy zleceniom cross-system, które
   * inaczej w ogóle nie ruszą. Gdy zdatny jest wyłącznie statek warp, użyj go (brak strandowania).
   */
  _pickFreeVessel(free, consumed, order) {
    const cross = this._isCrossSystem(order);
    let warpFallback = null;
    for (const v of free) {
      if (consumed.has(v.id)) continue;
      if (!this._canServe(v, order)) continue;
      if (!cross && (v.warpFuel?.max ?? 0) > 0) { warpFallback ??= v; continue; }
      return v;
    }
    return warpFallback;
  }

  /** Układ (systemId) kolonii — live (kolonie nie zmieniają układu). Fallback 'sys_home'. */
  _sysOf(colonyId) {
    return this._cm()?.getColony(colonyId)?.systemId ?? 'sys_home';
  }

  _isCrossSystem(order) {
    return this._sysOf(order.fromColonyId) !== this._sysOf(order.toColonyId);
  }

  /** Czy statek może obsłużyć zlecenie? Cross-system wymaga zdolności warp (bak warp_cores>0). */
  _canServe(vessel, order) {
    if (!(vessel?.cargoMax > 0)) return false;            // musi mieć ładownię
    if (this._isCrossSystem(order)) return (vessel.warpFuel?.max ?? 0) > 0;
    return true;
  }

  _assignVessel(order, vesselId) {
    const a = { vesselId, phase: 'to_origin', courseCargo: {} };
    order.assignments.push(a);
    const v = this._vm()?.getVessel?.(vesselId);
    this._driveVessel(order, a, v);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  _onVesselWrecked({ vesselId } = {}) {
    if (!vesselId) return;
    this.removeFromPool(vesselId);
    const found = this._findAssignment(vesselId);
    if (found) this._releaseAssignment(found.order, found.a);
    this._pump();
  }

  /**
   * VO-3 — misja kuriera zostala PRZERWANA (preempcja rozkazem gracza). Zwolnij przydzial,
   * zeby zlecenie nie trzymalo statku, ktory juz nic nie wiezie, i zeby `inFlight` przestal
   * rezerwowac jednostki innym statkom z puli. Lustro `_onVesselWrecked`.
   * ⚠ Idempotentne: `_findAssignment` zwraca null, gdy nic nie ma, a `_releaseAssignment`
   *   ma wlasne guardy (`!a?.courseCargo`, `if (i >= 0)`) — zwolnienie zwolnionego to no-op.
   *   Dlatego NIE potrzebuje bramki „czy to na pewno preempcja": kazde przerwanie misji kuriera
   *   ma ten sam skutek dla puli.
   * ⚠ Statek ZOSTAJE w puli (`removeFromPool` NIE jest wolane) — gracz go stamtad nie wypisal,
   *   wiec po zwolnieniu przydzialu ma znow byc dostepny dla dispatchera.
   */
  _onMissionAborted({ expedition } = {}) {
    const vesselId = expedition?.vesselId;
    if (!vesselId) return;
    const found = this._findAssignment(vesselId);
    if (!found) return;
    this._releaseAssignment(found.order, found.a);
    this._pump();
  }

  _onColonyDestroyed({ planetId } = {}) {
    const st = this._state();
    if (!st || !planetId) return;
    const affected = st.orders.filter(o => o.fromColonyId === planetId || o.toColonyId === planetId);
    for (const o of affected) {
      o.assignments.length = 0;
      st.orders.splice(st.orders.indexOf(o), 1);
      EventBus.emit('transportOrder:cancelled', { orderId: o.id, reason: 'colony_lost', planetId });
    }
    if (affected.length) this._pump();
  }

  _onTick({ civDeltaYears } = {}) {
    if (!this._enabled) return;
    this._sweepAccum += (civDeltaYears ?? 0);
    if (this._sweepAccum < SWEEP_INTERVAL_CIVYEARS) return;
    this._sweepAccum = 0;
    this._pump();
  }

  // ── Helpery ───────────────────────────────────────────────────────────────────

  _closeOrder(order) {
    const st = this._state();
    order.assignments.length = 0;   // statki zostają zadokowane w T, wolne w puli
    const i = st?.orders.indexOf(order) ?? -1;
    if (i >= 0) st.orders.splice(i, 1);
    EventBus.emit('transportOrder:completed', {
      orderId: order.id, fromColonyId: order.fromColonyId, toColonyId: order.toColonyId, goods: order.goods,
    });
  }

  /** Usuń przydział z zlecenia; zwolnij ewentualny inFlight (statek zginął mid-haul → re-source). */
  _releaseAssignment(order, a) {
    this._releaseInFlight(order, a);
    const i = order.assignments.indexOf(a);
    if (i >= 0) order.assignments.splice(i, 1);
  }

  _releaseInFlight(order, a) {
    if (!a?.courseCargo) return;
    for (const [g, q] of Object.entries(a.courseCargo)) {
      order.inFlight[g] = Math.max(0, (order.inFlight[g] ?? 0) - q);
    }
    a.courseCargo = {};
  }

  _findAssignment(vesselId) {
    const st = this._state();
    if (!st) return null;
    for (const order of st.orders) {
      const a = order.assignments.find(x => x.vesselId === vesselId);
      if (a) return { order, a };
    }
    return null;
  }

  _assignedVesselIds() {
    const st = this._state();
    const set = new Set();
    if (st) for (const o of st.orders) for (const a of o.assignments) set.add(a.vesselId);
    return set;
  }

  /** Wolne statki z puli — zadokowane, dostępne, z ładownością, nie przypisane do żadnego zlecenia. */
  _freePoolVessels() {
    const st = this._state(), vm = this._vm();
    if (!st || !vm) return [];
    const assigned = this._assignedVesselIds();
    const out = [];
    for (const id of st.pool) {
      if (assigned.has(id)) continue;
      const v = vm.getVessel(id);
      if (!v || isEnemyVessel(v) || v.isWreck) continue;
      if (!isInService(v)) continue;                    // W2 — rezerwa nie wozi ładunku
      if (v.position?.state !== 'docked') continue;
      if (v.status !== 'idle' && v.status !== 'refueling') continue;   // 'refueling' = dostępny (mirror dispatchOnMission)
      if (v.mission) continue;
      if (v.movementOrder) continue;
      if (vm.isImmobilized?.(v)) continue;
      if (!(v.cargoMax > 0)) continue;                                 // canHaulCargo
      out.push(v);
    }
    return out;
  }

  _isComplete(order) {
    for (const [g, total] of Object.entries(order.goods)) {
      if ((order.delivered[g] ?? 0) < total) return false;
    }
    return true;
  }

  /** Suma jednostek jeszcze do zarezerwowania (goods − delivered − inFlight). >0 ⇒ zlecenie chce statków. */
  _unreservedUnits(order) {
    let sum = 0;
    for (const [g, total] of Object.entries(order.goods)) {
      sum += Math.max(0, total - (order.delivered[g] ?? 0) - (order.inFlight[g] ?? 0));
    }
    return sum;
  }

  /** Pozostała tonaż (do zarezerwowania) ważona — do rezerwacji pojemności statków w dispatcherze. */
  _remainingTonnage(order) {
    let tons = 0;
    for (const [g, total] of Object.entries(order.goods)) {
      const units = Math.max(0, total - (order.delivered[g] ?? 0) - (order.inFlight[g] ?? 0));
      tons += units * _weight(g);
    }
    return tons;
  }
}

// ── Helpery modułowe ─────────────────────────────────────────────────────────
// D6/OG-5 — dawna kopia inline istniała, bo „nie importujemy ColonyManager". Kanon mieszka teraz
// poza systemami (`src/utils/ColonyOwnership.js`, zero importów), więc powód zniknął.
const _isPlayerColony = isPlayerColony;

// Waga towaru/surowca (tony/szt) — mirror _getWeight z Vessel.js.
function _weight(id) {
  return COMMODITIES[id]?.weight ?? MINED_RESOURCES[id]?.weight ?? HARVESTED_RESOURCES[id]?.weight ?? 1;
}
