// OrderService — zunifikowana fasada wydawania rozkazów flocie.
//
// Cel: JEDEN punkt wejścia, który WSZYSTKIE UI (rejestr floty, mapa Stratcom G,
// menu PPM mapy) wołają zamiast trzech rozbieżnych ścieżek. Fasada jest CIENKIM
// routerem — nie reimplementuje logiki (paliwo, dystans, Kepler, pętle zostają
// w MissionSystem / VesselManager / WarpRouteSystem). Kolaboratorzy rozwiązywani
// LENIWIE przez window.KOSMOS (wzór FleetActions/WarpRouteSystem) → zero cross-importów
// między systemami, zgodnie z regułą EventBus.
//
// OrderService jest JEDYNYM dozwolonym orkiestratorem sekwencji multi-system
// (composite warp→transport), która dziś jest rozsmarowana po trzech UI.
//
// Komunikacja (EventBus):
//   Nasłuchuje:
//     warpRoute:completed   → _maybeDeliver (multi-hop finał)
//     interstellar:arrived  → _maybeDeliver (single-hop)
//     warpRoute:aborted     → _abortComposite
//   Emituje:
//     expedition:transportRequest / expedition:passengerRequest (delegacja do MissionSystem)
//     order:compositeStarted / order:compositeFailed
//     ui:toast (feedback błędu composite)

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { t }         from '../i18n/i18n.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { WARP_ROUTE_REASONS } from '../utils/WarpRoutePlanner.js';
import { returnJumpTransactional } from '../utils/ReturnJump.js';

export class OrderService {
  constructor() {
    // Subskrypcje łańcuchowania composite (Slice C). Jedna instancja na sesję.
    this._onArrivedBound   = ({ vessel })  => this._maybeDeliver(vessel?.id);
    this._onCompletedBound = ({ vesselId }) => this._maybeDeliver(vesselId);
    this._onAbortedBound   = ({ vesselId, reason }) => this._abortComposite(vesselId, reason);
    EventBus.on('interstellar:arrived', this._onArrivedBound);
    EventBus.on('warpRoute:completed',  this._onCompletedBound);
    EventBus.on('warpRoute:aborted',    this._onAbortedBound);
  }

  destroy() {
    EventBus.off('interstellar:arrived', this._onArrivedBound);
    EventBus.off('warpRoute:completed',  this._onCompletedBound);
    EventBus.off('warpRoute:aborted',    this._onAbortedBound);
  }

  // ── Kolaboratorzy (leniwie) ────────────────────────────────────────────────
  get _vm()  { return window.KOSMOS?.vesselManager ?? null; }
  get _wrs() { return window.KOSMOS?.warpRouteSystem ?? null; }
  get _mos() { return window.KOSMOS?.movementOrderSystem ?? null; }
  get _colMgr() { return window.KOSMOS?.colonyManager ?? null; }
  get _stations() { return window.KOSMOS?.stationSystem ?? null; }

  // ── Intent methods ─────────────────────────────────────────────────────────

  /**
   * Transport cargo. Same-system → emit expedition:transportRequest (MissionSystem
   * właścicielem logiki). Cross-system → composite (warp→lot→dostawa).
   * @returns {{ok:boolean, reason?:string, composite?:boolean}}
   */
  issueTransport(vesselId, { targetId, targetSystemId = null, cargo = null, loop = false, returnCargoSpec = null } = {}) {
    const vessel = this._vm?.getVessel?.(vesselId);
    if (!vessel) return { ok: false, reason: 'no_vessel' };
    if (!targetId) return { ok: false, reason: 'no_target' };

    if (this._sameSystem(vessel, targetSystemId)) {
      EventBus.emit('expedition:transportRequest', {
        targetId, cargo: cargo ?? vessel.cargo ?? {}, vesselId,
        cargoPreloaded: true, loop: !!loop, returnCargoSpec: returnCargoSpec ?? null,
      });
      return { ok: true };
    }
    return this._beginComposite(vessel, 'transport', { targetId, targetSystemId, cargo, loop, returnCargoSpec });
  }

  /**
   * Transport pasażerski (1 POP). Same-system → emit expedition:passengerRequest.
   * Cross-system → composite.
   */
  issuePassenger(vesselId, { targetId, targetSystemId = null } = {}) {
    const vessel = this._vm?.getVessel?.(vesselId);
    if (!vessel) return { ok: false, reason: 'no_vessel' };
    if (!targetId) return { ok: false, reason: 'no_target' };

    if (this._sameSystem(vessel, targetSystemId)) {
      EventBus.emit('expedition:passengerRequest', { targetId, vesselId });
      return { ok: true };
    }
    return this._beginComposite(vessel, 'passenger', { targetId, targetSystemId });
  }

  /**
   * Rozkaz ruchu (moveToPoint/pursue/intercept/engage/retreat/patrol/escort).
   * Cienki forward do MovementOrderSystem.issueOrder — spec buduje OrderDispatcher.
   */
  issueMove(vesselId, spec, opts = undefined) {
    const mos = this._mos;
    if (!mos) return { ok: false, reason: 'mos_disabled' };
    return mos.issueOrder(vesselId, spec, opts);
  }

  /**
   * Skok warp do układu (single/multi-hop). Forward do WarpRouteSystem.beginJourney
   * z fallbackiem na dispatchInterstellar (parytet ze starą ścieżką Stratcom).
   */
  issueWarp(vesselId, targetSystemId) {
    if (!targetSystemId) return { ok: false, reason: 'no_target' };

    // ⚠ W3-4c — skok do układu, w którym statek JUŻ JEST, to nie awaria dyspozytora.
    // Ścieżka gracza mówiła tu `same_system` (planer, `WarpRoutePlanner:57`), a ścieżka AI
    // wracała `dispatch_failed` — jeden stan, dwie różne odpowiedzi zależnie od tego, KTO pyta.
    // Zwracamy kanoniczny `same_system`: stała już istnieje (`WARP_ROUTE_REASONS.SAME_SYSTEM`),
    // ma mapowanie w UI (`FleetManagerOverlay:6623`) i tekst w OBU językach
    // (`fleet.warpErrSame` — „Statek już tu jest"). Nowa nazwa byłaby DRUGIM słownikiem
    // na to samo zdarzenie.
    const v0 = this._vm?.getVessel?.(vesselId);
    if (v0 && this._sameSystem(v0, targetSystemId)) {
      return { ok: false, reason: WARP_ROUTE_REASONS.SAME_SYSTEM };
    }

    const wrs = this._wrs;
    // ⚠ W3-4b — okręt AI NIE przechodzi przez planer wielo-skokowy. `WarpRouteSystem.canOrder`
    // odrzuca każdy `isEnemyVessel` powodem `not_player` — to bramka INTERFEJSU (planer liczy
    // trasę dla panelu gracza), nie reguła świata. Regułą świata jest `dispatchInterstellar`,
    // które ma WŁASNY, jawny widelec właściciela (S3.0a): gracz ma twardą bramkę paliwa przez
    // `canJump`, a AI leci „na oparach" z clampem zużycia. Kierujemy więc AI wprost tam.
    // KONSEKWENCJA, ZADEKLAROWANA: AI dostaje skok POJEDYNCZY (bez łańcuchowania przez układy
    // pośrednie) i bez limitu długości skoku — zasięg uderzenia AI jest więc sprawą REGUŁY
    // wyboru celu (W3-5, sąsiedztwo z `InfluenceMap`), nie tej warstwy transportu.
    const vessel = this._vm?.getVessel?.(vesselId);
    const aiVessel = !!vessel && isEnemyVessel(vessel);
    if (wrs && !aiVessel) return wrs.beginJourney(vesselId, targetSystemId);
    const ok = this._vm?.dispatchInterstellar?.(vesselId, targetSystemId);
    return { ok: !!ok, reason: ok ? undefined : 'dispatch_failed' };
  }

  /**
   * W3-4b — UDERZENIE NA CIAŁO, także MIĘDZYGWIEZDNE. Jedyne wejście, przez które wolno wysłać
   * okręt na cel: rozwiązuje układ celu i sam decyduje, czy wystarczy podejście wewnątrz układu,
   * czy trzeba najpierw skoczyć.
   *
   * Dlaczego TU, a nie w `MovementOrderSystem`: rozkazy ruchu są z konstrukcji wewnątrzukładowe
   * (współrzędne liczone od gwiazdy, która w każdym układzie stoi w (0,0)), a orkiestracja
   * wielu układów należy do tej fasady. Bez tego rozdziału „atak" na planetę z innego układu
   * leciał do jej współrzędnych WEWNĄTRZ własnego układu napastnika — defekt z GATE 2.
   *
   * D4 (orzeczenie właściciela): PRAWDZIWA PODRÓŻ z macierzystego układu AI, bo gracz ma
   * zobaczyć nadlatujące okręty sensorami. Stąd `bypassFuelCheck` na odcinku wewnątrzukładowym
   * (sankcjonowany wzór — kolonie AI nie trzymają paliwa in-system).
   *
   * @param {string} vesselId
   * @param {{ targetBodyId: string, targetSystemId?: string }} spec
   * @returns {{ok:boolean, reason?:string, composite?:boolean, orderId?:string}}
   */
  issueAttack(vesselId, { targetBodyId, targetSystemId = null } = {}) {
    const vessel = this._vm?.getVessel?.(vesselId);
    if (!vessel) return { ok: false, reason: 'no_vessel' };
    if (!targetBodyId) return { ok: false, reason: 'no_target' };

    const body = EntityManager.get(targetBodyId);
    if (!body) return { ok: false, reason: 'target_not_found' };
    const sysId = targetSystemId ?? this._resolveTargetSystemId(targetBodyId);

    if (this._sameSystem(vessel, sysId)) {
      return this.issueMove(vesselId, {
        type: 'attack', targetBodyId,
        issuedBy: 'order_service_attack', bypassFuelCheck: true,
      });
    }
    return this._beginComposite(vessel, 'attack', { targetId: targetBodyId, targetSystemId: sysId });
  }

  /**
   * Z2 (D-Z2-1) — ODWOŁANIE OKRĘTU AI DO WŁASNEJ STOLICY.
   *
   * Powrót jest z natury WIELO-UKŁADOWY, więc mieszka tutaj: skok warp jest tylko PIERWSZYM
   * odcinkiem, a `_tickInterstellar` zostawia statek na obrzeżach (30 AU, `dockedAt=null`)
   * z NIEWYCZYSZCZONĄ misją `interstellar_jump`. ⚠ ZMIERZONE (plan §2, Pomiar 1): sam skok
   * WYPYCHA rajdera z KAŻDEJ puli AI (uderzeniowej, doktrynalnej, rezerwy) — czyli „naiwna
   * naprawa" jest gorsza od defektu, który miała zamknąć. Dlatego rozkaz jest COMPOSITE'em:
   * drugi odcinek (`_maybeDeliver`, gałąź `recall`) dowozi okręt na orbitę stolicy.
   *
   * ⚠ TO NIE JEST `issueReturn` I NIE MOŻE BYĆ. Tamten czyta `vessel.colonyId`, a
   * `VesselManager._onColonyDestroyed:1136-1153` przepisuje to pole BEZ TERMINU WŁAŚCICIELA
   * na kolonię GRACZA (`_resolvePlayerHomePort`, AC-8) ⇒ rajder mógłby dostać rozkaz powrotu
   * do domu gracza (Finding 195). Do tego `issueReturn` jawnie zeruje `pendingOrder`, czyli
   * z założenia NIE łańcuchuje. Domem jest tu `directorProduction.capitalOf` — kanon Directora.
   *
   * @param {string} vesselId
   * @param {{ homeSystemId: string, capitalBodyId: string }} spec
   * @returns {{ok:boolean, reason?:string, composite?:boolean, orderId?:string}}
   */
  issueRecall(vesselId, { homeSystemId, capitalBodyId } = {}) {
    const vessel = this._vm?.getVessel?.(vesselId);
    if (!vessel) return { ok: false, reason: 'no_vessel' };
    if (!homeSystemId || !capitalBodyId) return { ok: false, reason: 'no_capital' };
    if (!EntityManager.get(capitalBodyId)) return { ok: false, reason: 'no_capital' };

    // Już we własnym układzie — zostaje sam odcinek wewnątrzukładowy.
    if (this._sameSystem(vessel, homeSystemId)) return this._issueRecallLeg(vessel, capitalBodyId);
    return this._beginComposite(vessel, 'recall', { targetId: capitalBodyId, targetSystemId: homeSystemId });
  }

  /**
   * Odcinek domowy powrotu — `moveToPoint` na CIAŁO stolicy.
   * Wzór 1:1 z `DirectorDoctrine._holdAtHome` (ciało + punkt zapasowy, bo `validateOrder`
   * wymaga `targetPoint` nawet przy podanym ciele) i z `bypassFuelCheck`, bo kolonie AI nie
   * trzymają paliwa. Stan końcowy po przylocie: `orbiting` + `dockedAt = stolica` — czyli
   * dokładnie ten, który wszystkie pule Directora rozumieją.
   * @private
   */
  _issueRecallLeg(vessel, capitalBodyId) {
    const body = EntityManager.get(capitalBodyId);
    if (!body) return { ok: false, reason: 'target_lost' };
    const mos = this._mos;
    if (!mos) return { ok: false, reason: 'mos_disabled' };
    return mos.issueOrder(vessel.id, {
      type:         'moveToPoint',
      targetBodyId: capitalBodyId,
      targetPoint:  { x: body.x ?? 0, y: body.y ?? 0 },
      targetName:   body.name ?? null,
      issuedBy:     'ai_recall',
      bypassFuelCheck: true,
    });
  }

  /**
   * Powrót do macierzystego układu. Foreign → skok warp; local → anuluj misję / startReturn.
   * Absorbuje logikę FleetActions.return_home.execute (jedno źródło prawdy).
   */
  issueReturn(vesselId) {
    const vMgr = this._vm;
    const vessel = vMgr?.getVessel?.(vesselId);
    if (!vessel) return { ok: false, reason: 'no_vessel' };

    const homeColony  = vMgr._findEntity?.(vessel.colonyId);
    const homeSystemId = homeColony?.systemId ?? 'sys_home';
    const isForeign   = vessel.systemId && vessel.systemId !== homeSystemId;

    if (isForeign) {
      // POZA transakcją świadomie: `abortForeignRecon` sam ląduje statek na orbicie z panelem
      // `exploration/orbiting_body`, więc odmowa skoku zostawia go SPRAWNYM (patrz ReturnJump.js).
      if (vessel.mission?.type === 'foreign_recon') vMgr.abortForeignRecon?.(vessel.id);
      // Finding 125 — skok TRANSAKCYJNY. Ta ścieżka kłamała o stanie statku
      // (`idle`+`docked`+`mission=null`), żeby przejść bramkę dyspozytora, a kłamstwa nikt nie
      // cofał, gdy skok odpadał (brak `warp_cores` = najczęstszy powód kliknięcia tego przycisku)
      // → statek zostawał „zadokowany" przy ciele bez portu i nie mógł już nic.
      // Kasowanie composite'u (warp→dostawa) siedzi WEWNĄTRZ transakcji: odmowa skoku nie ma
      // prawa po cichu unieważnić zakolejkowanej dostawy, której gracz nie odwoływał.
      return returnJumpTransactional(vessel, () => {
        vessel.pendingOrder = null;
        return this.issueWarp(vesselId, homeSystemId);
      });
    }

    // Lokalny powrót — anuluj aktywną misję lub bezpośredni startReturn.
    const ms = window.KOSMOS?.missionSystem ?? window.KOSMOS?.expeditionSystem;
    const mission = ms?.getActive?.().find(m => m.vesselId === vessel.id);
    if (mission) { ms.cancelMission(mission.id); return { ok: true }; }
    if (typeof vMgr.startReturn === 'function') { vMgr.startReturn(vessel.id); return { ok: true }; }
    return { ok: false, reason: 'no_active_mission' };
  }

  // ── Composite (cross-system transport: warp → in-system → dostawa) ──────────

  _beginComposite(vessel, kind, opts) {
    vessel.pendingOrder = null;                      // redirect safety — jeden composite naraz
    const r = this.issueWarp(vessel.id, opts.targetSystemId);
    if (!r?.ok) return { ok: false, reason: r?.reason ?? 'warp_failed' };

    vessel.pendingOrder = {
      kind,
      targetId:        opts.targetId,
      targetSystemId:  opts.targetSystemId,
      cargo:           opts.cargo ?? null,
      loop:            !!opts.loop,
      returnCargoSpec: opts.returnCargoSpec ?? null,
      stage:           'awaiting_warp',
      createdYear:     window.KOSMOS?.timeSystem?.gameTime ?? 0,
    };
    EventBus.emit('order:compositeStarted', { vesselId: vessel.id, kind, targetSystemId: opts.targetSystemId, targetId: opts.targetId });
    return { ok: true, composite: true };
  }

  /**
   * Wyzwalane po KAŻDYM interstellar:arrived + warpRoute:completed. Guardy
   * gwarantują JEDNOKROTNĄ dostawę na finalnym układzie (single- i multi-hop):
   *   - v.warpRoute !== null → multi-hop trwa (dostawa dopiero po :completed)
   *   - v.systemId !== targetSystemId → nie w celu → ignoruj
   */
  _maybeDeliver(vesselId) {
    const vMgr = this._vm;
    const v = vMgr?.getVessel?.(vesselId);
    const po = v?.pendingOrder;
    if (!po) return;
    if (v.warpRoute) return;                          // multi-hop w toku
    if (v.systemId !== po.targetSystemId) return;     // nie w układzie docelowym

    // W3-4b — uderzenie: celem jest CIAŁO, nie kolonia/stacja gracza, więc re-walidacja
    // i dostawa są inne. Wydajemy dopiero TERAZ, gdy statek jest już w układzie celu —
    // wtedy bramka układu w `MovementOrderSystem` przepuszcza rozkaz.
    if (po.kind === 'attack') {
      const body = EntityManager.get(po.targetId);
      v.pendingOrder = null;
      if (!body) {
        EventBus.emit('order:compositeFailed', { vesselId, reason: 'target_lost' });
        return;
      }
      const r = this._mos?.issueOrder?.(vesselId, {
        type: 'attack', targetBodyId: po.targetId,
        issuedBy: 'order_service_attack', bypassFuelCheck: true,
      });
      if (!r?.ok) {
        // Głośno (R12): statek doleciał, a rozkaz odpadł — to błąd wpięcia, nie stan gry.
        console.error('[OrderService] uderzenie po skoku ODRZUCONE', { vesselId, targetId: po.targetId, reason: r?.reason });
        EventBus.emit('order:compositeFailed', { vesselId, reason: r?.reason ?? 'attack_rejected' });
        return;
      }
      EventBus.emit('order:compositeDelivering', { vesselId, kind: po.kind, targetId: po.targetId });
      return;
    }

    // Z2 (D-Z2-1) — POWRÓT: drugi odcinek to podejście do stolicy WEWNĄTRZ własnego układu.
    // Celem jest CIAŁO imperium, nie kolonia/stacja gracza, więc re-walidacja jest inna —
    // tak samo jak przy `attack` wyżej.
    if (po.kind === 'recall') {
      v.pendingOrder = null;
      const r = this._issueRecallLeg(v, po.targetId);
      if (!r?.ok) {
        // ⚠ NIE ZOSTAWIAMY STATKU Z MARTWĄ MISJĄ `interstellar_jump` — to jest DOKŁADNIE brick
        // z §2 planu: okręt stoi 30 AU od gwiazdy i wypada z każdej puli AI NA ZAWSZE, bo nikt
        // tej misji nie czyści. Sprowadzamy go do stanu, który świat rozumie: bezczynny okręt
        // WE WŁASNYM układzie — czyli z powrotem materiał na uderzenie. (Gałąź `attack` wyżej
        // świadomie tego nie robi: tam odmowa po skoku jest błędem wpięcia, nie stanem gry.)
        if (v.mission?.type === 'interstellar_jump') { v.mission = null; v.status = 'idle'; }
        EventBus.emit('order:compositeFailed', { vesselId, reason: r?.reason ?? 'recall_rejected' });
        return;
      }
      EventBus.emit('order:compositeDelivering', { vesselId, kind: po.kind, targetId: po.targetId });
      return;
    }

    // Re-walidacja: cel przeżył podróż (kolonia lub stacja gracza)?
    // ⚠ d1 (Finding 254) — DRUGA POWIERZCHNIA tej samej reguły co picker. Sam filtr w
    //   `_getValidTargets` by nie wystarczył: `pendingOrder` jest serializowane, więc cel mógł
    //   zostać wybrany przed zmianą reguł albo pochodzić z zapisu. Ciało BEZ kolonii jest legalnym
    //   celem cargo (`_startForeignUnload` zakłada z ładunku placówkę), ale WYŁĄCZNIE w układzie
    //   JUŻ WYGENEROWANYM — inaczej dostawa celowałaby w encję, której nie ma, i otwierałaby mgłę
    //   z Findingu 186 od strony DOSTAWY zamiast od strony listy.
    const targetBody = EntityManager.get(po.targetId);
    const bodyTargetOk = !!targetBody
      && !!window.KOSMOS?.starSystemManager?.getSystem?.(targetBody.systemId);
    const targetAlive = !!this._colMgr?.hasColony?.(po.targetId)
      || !!this._stations?.getStation?.(po.targetId)
      || bodyTargetOk;
    if (!targetAlive) {
      v.pendingOrder = null;
      EventBus.emit('order:compositeFailed', { vesselId, reason: 'target_lost' });
      EventBus.emit('ui:toast', { text: t('order.compositeTargetLost', v.name), color: '#ff4466', durationMs: 4000 });
      return;
    }

    v.pendingOrder = null;
    if (po.kind === 'transport') {
      EventBus.emit('expedition:transportRequest', {
        targetId: po.targetId, cargo: po.cargo ?? v.cargo ?? {}, vesselId,
        cargoPreloaded: true, loop: !!po.loop, returnCargoSpec: po.returnCargoSpec ?? null,
      });
    } else {
      EventBus.emit('expedition:passengerRequest', { targetId: po.targetId, vesselId });
    }
    EventBus.emit('order:compositeDelivering', { vesselId, kind: po.kind, targetId: po.targetId });
  }

  _abortComposite(vesselId, reason) {
    const v = this._vm?.getVessel?.(vesselId);
    if (!v?.pendingOrder) return;
    v.pendingOrder = null;
    EventBus.emit('order:compositeFailed', { vesselId, reason: reason ?? 'aborted' });
  }

  /**
   * Wznów composite po load: statek już przyleciał do celu (pendingOrder && brak
   * warpRoute && systemId===targetSystemId), a event arrival nie wróci po restore.
   * Wołane z GameScene po vesselManager.restore + validateMissions.
   */
  _resumePendingOrders() {
    const vMgr = this._vm;
    if (!vMgr?.getAllVessels) return;
    for (const v of vMgr.getAllVessels()) {
      if (v?.pendingOrder && !v.warpRoute) this._maybeDeliver(v.id);
    }
  }

  // ── Traffic (system-aware) ─────────────────────────────────────────────────

  /**
   * Jedno API stanu ruchu floty dla rejestru/mapy/minimapy. Czyta systemId
   * (nie colonyId) → obcy statek trafia do WŁAŚCIWEGO układu.
   */
  getTraffic() {
    const vMgr = this._vm;
    const bySystem = new Map();
    const systems = window.KOSMOS?.galaxyData?.systems ?? [];
    if (vMgr) {
      for (const sys of systems) bySystem.set(sys.id, vMgr.getVesselsInSystem(sys.id));
      if (!bySystem.has('sys_home')) bySystem.set('sys_home', vMgr.getVesselsInSystem('sys_home'));
    }
    const inTransit = (vMgr?.getInterstellarVessels?.() ?? [])
      .filter(v => v.mission?.phase === 'warp_transit')
      .map(v => ({
        vesselId: v.id, fromSystemId: v.mission.fromSystemId, toSystemId: v.mission.toSystemId,
        progress: v.mission.galProgress ?? 0, arrivalYear: v.mission.arrivalYear,
        pending: v.pendingOrder ? { kind: v.pendingOrder.kind, targetSystemId: v.pendingOrder.targetSystemId } : null,
      }));
    const ms = window.KOSMOS?.missionSystem ?? window.KOSMOS?.expeditionSystem;
    const missions = (ms?.getActive?.() ?? []).map(m => ({
      id: m.id, vesselId: m.vesselId, type: m.type, targetId: m.targetId,
      originSystemId: m.originSystemId ?? 'sys_home', destSystemId: m.destSystemId ?? 'sys_home', status: m.status,
    }));
    return { bySystem, inTransit, missions };
  }

  // ── Helpery ────────────────────────────────────────────────────────────────

  _sameSystem(vessel, targetSystemId) {
    return !targetSystemId || targetSystemId === (vessel.systemId ?? 'sys_home');
  }

  /** systemId ciała/kolonii/stacji docelowej; fallback 'sys_home'. */
  _resolveTargetSystemId(targetId) {
    if (!targetId) return 'sys_home';
    const ent = EntityManager.get(targetId);
    return ent?.systemId ?? 'sys_home';
  }
}
