// WarpRouteSystem — egzekutor wielo-przeskokowych podróży warp floty gracza.
//
// `VesselManager.dispatchInterstellar` pozostaje silnikiem POJEDYNCZEGO skoku.
// Ten system tylko orkiestruje SEKWENCJĘ skoków: planuje najkrótszą trasę
// (WarpRoutePlanner), startuje pierwszy odcinek, a po każdym `interstellar:arrived`
// łańcuchowo wysyła kolejny odcinek — aż do układu docelowego.
//
// Model paliwa = "tylko obecny bak" (decyzja gracza): cała trasa musi zmieścić
// się w aktualnym warpFuel.current; BEZ tankowania po drodze. Planner waliduje
// to z góry; egzekutor robi defensywny per-hop re-check (float guard) i czysto
// stranduje (abort) zamiast cichego dispatch=false.
//
// Stan podróży żyje na statku (`vessel.warpRoute`) — przeżywa nadpisanie
// `vessel.mission` przy każdym skoku ORAZ save/load (VesselManager serializuje
// warpRoute). System jest bezstanowy poza subskrypcją z konstruktora, więc po
// wczytaniu save statek w trasie kontynuuje przy najbliższym przylocie.
//
// Per CLAUDE.md: nowa mechanika → nowy system + komunikacja przez EventBus.
// NIE importuje Three ani UI → w pełni node-importowalny (smoke headless).

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { t } from '../i18n/i18n.js';
import { canJump, isEnemyVessel, isInService } from '../entities/Vessel.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { calcShipStats } from '../data/ShipModulesData.js';
import { planWarpRoute, warpDist3D, warpRouteGroupFields, WARP_ROUTE_REASONS } from '../utils/WarpRoutePlanner.js';
import { warpSystemLabel } from '../utils/SystemRevealWorld.js';

export class WarpRouteSystem {
  /**
   * @param {Object} vesselManager — referencja do VesselManager (dispatchInterstellar, getVessel, isImmobilized)
   */
  constructor(vesselManager) {
    this._vm = vesselManager;
    EventBus.on('interstellar:arrived', (e) => this._onArrived(e));
  }

  // ── Bramka zdolności wydania rozkazu ────────────────────────────────────────
  // Zwraca {ok, reason}. Wyeksponowane jako publiczne `canOrder` dla UI
  // (overlay nie importuje logiki bramki).

  /**
   * @param {Object} v — vessel
   * @returns {{ok:boolean, reason?:string}}
   */
  canOrder(v) {
    if (!v || v.isWreck || isEnemyVessel(v)) return { ok: false, reason: 'not_player' };
    if (!(v.warpFuel?.max > 0))               return { ok: false, reason: 'not_warp_capable' };
    // Finding 588 (D-GX-12): kadłub bez załogi nie skacze — bliźniak bramki MOS `vessel_in_reserve` (W3-4 / D6). Powód tego samego
    //   brzmienia co w MOS, żeby odmowa czytała ten sam klucz i18n. Przed `immobilized`: „obsadź załogą” jest tu krokiem do zrobienia.
    if (GAME_CONFIG.FEATURES?.galaxyWarp && !isInService(v)) return { ok: false, reason: 'vessel_in_reserve' };
    if (this._vm?.isImmobilized?.(v))         return { ok: false, reason: 'immobilized' };
    const st = v.position?.state;
    if (st === 'in_transit')                  return { ok: false, reason: 'in_transit' };
    if (st !== 'docked' && st !== 'orbiting') return { ok: false, reason: 'bad_state' };
    return { ok: true };
  }

  // ── Punkt wejścia dla UI ─────────────────────────────────────────────────────

  /**
   * Rozpocznij podróż warp do układu docelowego (single- lub multi-hop).
   * @param {string} vesselId
   * @param {string} targetSystemId
   * @param {{hops?:string[], groupId?:string, speedLY?:number, arrivalAngle?:number}} [opts] — G4 (D-GX-19), skok floty; przy `fleetWarp` OFF
   *   niewidzialne. `hops`: gotowa trasa, bez planera (bramka statku i jego bak sprawdzane dalej); `speedLY`: LY/rok na KAŻDYM odcinku;
   *   `arrivalAngle`: rad, tylko na ostatnim odcinku; `groupId`: linia Dziennika należy do floty. Bez opts — jak przed G4 co do bajtu.
   * @returns {{ok:boolean, reason?:string, route?:Object}}
   */
  beginJourney(vesselId, targetSystemId, opts = {}) {
    const v = this._vm?.getVessel?.(vesselId);
    if (!v) return { ok: false, reason: 'no_vessel' };

    const gate = this.canOrder(v);
    if (!gate.ok) return { ok: false, reason: gate.reason };

    const systems = this._galaxySystems();
    if (!systems.length) return { ok: false, reason: WARP_ROUTE_REASONS.UNKNOWN_SYSTEM };

    const wf = v.warpFuel;
    // Zasięg pojedynczego skoku = min(twardy limit napędu, zasięg z baku). Powyżej
    // limitu → planner łańcuchuje multi-hop przez układy pośrednie.
    const tankRange = (wf?.max > 0 && wf?.consumption > 0) ? wf.max / wf.consumption : 0;
    const maxHopLY = Math.min(GAME_CONFIG.WARP_MAX_JUMP_LY ?? 10, tankRange);
    const group = GAME_CONFIG.FEATURES?.fleetWarp ? (opts ?? {}) : {};
    const plan = Array.isArray(group.hops) ? this._givenRoute(v, systems, targetSystemId, group) : planWarpRoute(systems, v.systemId ?? 'sys_home', targetSystemId, {
      maxHopLY,
      currentFuel: wf?.current ?? 0,
      consumption: wf?.consumption ?? 0,
      warpSpeed:   this._baseWarpSpeed(v),
      allowedIds:  this._routableIds(),
    });
    if (!plan.ok) return { ok: false, reason: plan.reason, route: plan };

    // Zapisz trasę PRZED dispatch — gdyby arrival był synchroniczny (testy), handler ją widzi.
    v.warpRoute = {
      hops:             [...plan.hops],
      legIndex:         0,
      finalSystemId:    targetSystemId,
      totalFuelPlanned: plan.totalFuel,
      startedYear:      window.KOSMOS?.timeSystem?.gameTime ?? 0,
      ...warpRouteGroupFields(group),
    };

    const firstHop = plan.hops[1];
    if (!this._dispatchLeg(v, firstHop)) {
      v.warpRoute = null;   // dispatch odrzucony (np. wyścig stanu) → wycofaj trasę
      return { ok: false, reason: 'dispatch_failed' };
    }

    EventBus.emit('warpRoute:started', { vesselId, route: plan, finalSystemId: targetSystemId });
    // Finding 589 (D-GX-18): start skoku pisze do Dziennika PRZED przylotem, więc nazwa celu idzie przez kanon mgły.
    //   `warpRoute.legDone` / `completed` zostają przy `_systemName` — lecą po `markSystemExplored`, układ jest już poznany.
    const finalName = GAME_CONFIG.FEATURES?.galaxyWarp ? warpSystemLabel(targetSystemId) : this._systemName(targetSystemId);
    if (!group.groupId) this._log(t('warpRoute.started', v.name, finalName, String(plan.hops.length - 1)), 'info');
    return { ok: true, route: plan };
  }

  // ── Skok floty (G4, D-GX-19) ─────────────────────────────────────────────────

  /**
   * JEDEN plan dla grupy statków, BEZ skutków ubocznych: faza 1 rozkazu floty i podgląd UI.
   * Dijkstra po wspólnym limicie skoku wystarcza raz: paliwo członka = dystans × jego zużycie, więc najkrótsza trasa jest najtańsza dla
   * KAŻDEGO naraz. Bak liczony w LY (`consumption: 1`), członek wiążący = najmniejszy zasięg z obecnego baku; każdego członka i tak
   * sprawdzamy na wybranej trasie, skok po skoku — dokładnie tak, jak zrobi to `dispatchInterstellar`.
   * @param {Object[]} vessels — żywi członkowie
   * @param {string} targetSystemId
   * @returns {{ok:boolean, reason?:string, refused:Array<{vessel:Object, reason:string}>, bindingMemberId:string|null,
   *   hops?:string[], legs?:Array, totalLY?:number, etaYears?:number, groupSpeedLY?:number, fuelByMember?:Object<string,number>}}
   */
  planGroupJourney(vessels, targetSystemId) {
    const refused = [];
    const able = [];
    for (const v of vessels ?? []) {
      const reason = this._groupGateRefusal(v);
      if (reason) refused.push({ vessel: v, reason });
      else able.push(v);
    }
    // Układ odlotu = układ pierwszego członka zdolnego do skoku; kto stoi gdzie indziej, nie leci z flotą.
    const from = able[0]?.systemId ?? 'sys_home';
    const together = [];
    for (const v of able) {
      if ((v.systemId ?? 'sys_home') === from) together.push(v);
      else refused.push({ vessel: v, reason: 'group_split' });
    }
    if (together.length === 0) return { ok: false, reason: refused[0]?.reason ?? 'fleet_empty', refused, bindingMemberId: null };

    const hardMaxLY = GAME_CONFIG.WARP_MAX_JUMP_LY ?? 10;
    let maxHopLY = hardMaxLY, hopBinding = null, bindingRangeLY = Infinity, binding = null, groupSpeedLY = Infinity;
    for (const v of together) {
      const wf = v.warpFuel;
      const tankLY = wf?.consumption > 0 ? wf.max / wf.consumption : 0;
      if (tankLY < maxHopLY) { maxHopLY = tankLY; hopBinding = v; }
      const rangeLY = wf?.consumption > 0 ? wf.current / wf.consumption : 0;
      if (rangeLY < bindingRangeLY) { bindingRangeLY = rangeLY; binding = v; }
      groupSpeedLY = Math.min(groupSpeedLY, this._baseWarpSpeed(v));
    }
    const plan = planWarpRoute(this._galaxySystems(), from, targetSystemId, {
      maxHopLY,
      currentFuel: bindingRangeLY,   // LY — bak wiążącego członka
      consumption: 1,
      warpSpeed:   groupSpeedLY,
      allowedIds:  this._routableIds(),
    });

    if (plan.legs) {
      for (const v of together) {
        if (!this._routeFitsTank(v, plan.legs)) refused.push({ vessel: v, reason: WARP_ROUTE_REASONS.INSUFFICIENT_FUEL });
      }
    } else if (!plan.ok && hopBinding && (plan.reason === WARP_ROUTE_REASONS.NO_ROUTE || plan.reason === WARP_ROUTE_REASONS.BAD_CONFIG)) {
      refused.push({ vessel: hopBinding, reason: plan.reason });   // najmniejszy bak skraca skok całej floty
    }

    const result = {
      refused,
      bindingMemberId: binding?.id ?? null,
      bindingRangeLY,
      groupSpeedLY,
      hops: plan.hops, legs: plan.legs, totalLY: plan.totalLY, totalFuel: plan.totalFuel, etaYears: plan.etaYears,   // `legs` i `totalFuel` w LY (bak liczony w LY)
    };
    if (refused.length > 0 || !plan.ok) {
      return { ...result, ok: false, reason: refused[0]?.reason ?? plan.reason };
    }
    const fuelByMember = {};
    for (const v of together) fuelByMember[v.id] = plan.totalLY * v.warpFuel.consumption;   // warp_cores
    return { ...result, ok: true, fuelByMember };
  }

  /** Jedna linia Dziennika zamiast N linii członków. Start pisze PRZED przylotem, więc nazwa celu idzie przez kanon mgły (Finding 589). */
  logFleetStarted(fleetName, targetSystemId, hopCount) {
    this._log(t('warpRoute.fleetStarted', fleetName, warpSystemLabel(targetSystemId), String(hopCount)), 'info');
  }

  /** Koniec skoku floty: przylot `markSystemExplored`, układ jest już poznany. */
  logFleetCompleted(fleetName, targetSystemId) {
    this._log(t('warpRoute.fleetCompleted', fleetName, this._systemName(targetSystemId)), 'info');
  }

  /** Stop floty: jedna linia i jeden toast za całą flotę, gdy ląduje ostatni członek. Przylot `markSystemExplored`, układ jest już poznany. */
  logFleetAborted(fleetName, systemId) {
    const text = t('warpRoute.fleetAborted', fleetName, this._systemName(systemId));
    this._log(text, 'warn');
    EventBus.emit('ui:toast', { text, color: '#ffcc44', durationMs: 4000 });
  }

  // Bramka członka: `canOrder` + dwa terminy, których brak zepchnąłby odmowę do fazy 2, po starcie pierwszych członków.
  _groupGateRefusal(v) {
    const gate = this.canOrder(v);
    if (!gate.ok) return gate.reason;
    // Finding 588 — rezerwa odmawia także przy `galaxyWarp` OFF; `canOrder` bramkuje ten termin tamtą flagą.
    if (!isInService(v)) return 'vessel_in_reserve';
    // `dispatchInterstellar` wymaga NAPĘDU, `canOrder` pyta tylko o bak (kadłub z Komorą Warp bez `engine_warp`).
    const def = SHIPS[v.shipId] ?? HULLS[v.shipId] ?? null;
    const stats = (def && Array.isArray(v.modules) && v.modules.length > 0) ? calcShipStats(def, v.modules) : null;
    if (stats?.warpCapable !== true && def?.warpCapable !== true) return 'not_warp_capable';
    return null;
  }

  // Bak na wybranej trasie, skok po skoku — ten sam rachunek co `canJump` + `consumeWarpFuel` przy każdym odcinku.
  _routeFitsTank(v, legs) {
    const wf = v.warpFuel;
    if (!(wf?.consumption > 0)) return false;
    let left = wf.current;
    for (const leg of legs) {
      if (left / wf.consumption < leg.distLY) return false;
      left = Math.max(0, left - leg.distLY * wf.consumption);
    }
    return true;
  }

  // Trasa podana z góry: bez planera, ale z kontrolą, że pasuje do TEGO statku (układ odlotu, cel, bak).
  _givenRoute(v, systems, targetSystemId, { hops, speedLY }) {
    const byId = new Map(systems.map((s) => [s.id, s]));
    if (hops.length < 2 || hops[0] !== (v.systemId ?? 'sys_home') || hops[hops.length - 1] !== targetSystemId) {
      return { ok: false, reason: WARP_ROUTE_REASONS.BAD_CONFIG };
    }
    const consumption = v.warpFuel?.consumption ?? 0;
    const legs = [];
    let totalLY = 0;
    for (let i = 0; i < hops.length - 1; i++) {
      const a = byId.get(hops[i]);
      const b = byId.get(hops[i + 1]);
      if (!a || !b) return { ok: false, reason: WARP_ROUTE_REASONS.UNKNOWN_SYSTEM };
      const distLY = warpDist3D(a, b);
      legs.push({ from: hops[i], to: hops[i + 1], distLY, fuelCost: distLY * consumption });
      totalLY += distLY;
    }
    const base = { hops: [...hops], legs, totalLY, totalFuel: totalLY * consumption };
    if (!this._routeFitsTank(v, legs)) return { ok: false, reason: WARP_ROUTE_REASONS.INSUFFICIENT_FUEL, ...base };
    return { ok: true, ...base, etaYears: totalLY / (speedLY > 0 ? speedLY : this._baseWarpSpeed(v)) };
  }

  // Jeden odcinek trasy. Bez pól floty — wywołanie jak przed G4 (dwa argumenty). Kąt przylotu tylko na ostatnim odcinku:
  // z przystanku statek i tak od razu leci dalej.
  _dispatchLeg(v, hop) {
    const r = v.warpRoute;
    const legOpts = {};
    if (r?.speedLY > 0) legOpts.speedLY = r.speedLY;
    if (r?.groupId) legOpts.warpGroupId = r.groupId;
    if (hop === r?.finalSystemId && Number.isFinite(r?.arrivalAngle)) legOpts.arrivalAngle = r.arrivalAngle;
    return Object.keys(legOpts).length > 0
      ? this._vm.dispatchInterstellar(v.id, hop, legOpts)
      : this._vm.dispatchInterstellar(v.id, hop);
  }

  // Czy trasa tego statku należy do rekordu jego floty — wtedy linie Dziennika mówi flota. Członek, który opuścił flotę, mówi znów sam za siebie.
  _flyingAsFleet(v) {
    const groupId = v.warpRoute?.groupId;
    if (!groupId) return false;
    return window.KOSMOS?.fleetSystem?.getFleet?.(v.fleetId)?.activeOrder?.groupId === groupId;
  }

  // ── Maszyna stanów łańcuchowania ─────────────────────────────────────────────

  _onArrived({ vessel, systemId }) {
    const v = vessel;
    if (!v || v.isWreck) return;
    const r = v.warpRoute;
    if (!r) return;   // nie-routowany pojedynczy skok → ignoruj

    // Przylot do nieoczekiwanego układu (redirect/teleport) → przerwij trasę.
    if (systemId !== r.hops[r.legIndex + 1]) { this._abort(v, 'diverted'); return; }

    r.legIndex += 1;

    // Finał — dotarliśmy do celu.
    if (r.legIndex >= r.hops.length - 1) {
      const asFleet = this._flyingAsFleet(v);   // przed emisją: ostatni członek domyka rekord floty wewnątrz `warpRoute:completed`
      EventBus.emit('warpRoute:completed', { vesselId: v.id, finalSystemId: r.finalSystemId });
      if (!asFleet) this._log(t('warpRoute.completed', v.name, this._systemName(r.finalSystemId)), 'info');
      v.warpRoute = null;   // statek zostaje orbitujący w celu (jak dotąd)
      return;
    }

    // Przelot pośredni — wyślij kolejny odcinek.
    const nextTarget = r.hops[r.legIndex + 1];
    const systems = this._galaxySystems();
    const cur  = systems.find(s => s.id === systemId);
    const next = systems.find(s => s.id === nextTarget);
    if (!cur || !next) { this._abort(v, 'config'); return; }

    // Float guard: paliwo na kolejny skok (dispatchInterstellar i tak ma canJump-bramkę,
    // ale pre-check daje czysty abort + komunikat zamiast cichego dispatch=false).
    if (!canJump(v, warpDist3D(cur, next))) { this._abort(v, 'stranded_fuel'); return; }

    EventBus.emit('warpRoute:legComplete', { vesselId: v.id, atSystemId: systemId, legIndex: r.legIndex });
    if (!this._flyingAsFleet(v)) this._log(t('warpRoute.legDone', v.name, this._systemName(systemId)), 'info');

    if (!this._dispatchLeg(v, nextTarget)) { this._abort(v, 'dispatch_failed'); }
  }

  /**
   * VO-3 (D-VO3e) — PUBLICZNA INTENCJA: przerwij trwajaca podroz warp tego statku.
   *
   * ⚠ Istnieje, bo `MovementOrderSystem` NIE MA prawa dotykac `vessel.warpRoute` wprost:
   *   to pole ma JEDNEGO producenta (`beginJourney`) i trzy miejsca kasowania, wszystkie tutaj,
   *   a `_abort` jest prywatne. Ten sam wzorzec, ktorym preempcja siega po rekordy misji
   *   (`MissionSystem.abortMissionsForVessel`) — mutacja przez intencje u WLASCICIELA STANU.
   *
   * ⚠ POWOD: preempcja, ktora nadpisuje misje statku w skoku, ROZBIJA detekcje przylotu
   *   (`VesselManager` bramkuje ja na `mission.type === 'interstellar_jump'`). ZMIERZONE:
   *   bez tego wywolania trasa wisi na statku BEZTERMINOWO — 400 lat gry, ZERO zdarzen warp —
   *   a `OrderService._maybeDeliver` ma `if (v.warpRoute) return`, wiec osierocona trasa
   *   BLOKUJE composite dostawy do konca partii, takze po wczytaniu zapisu (oba pola sa
   *   serializowane). Samoleczenie istnialo, ale przypadkowe: dopiero NASTEPNY skok gracza
   *   konczyl sierote jako `diverted`.
   *
   * @returns {boolean} czy byla jakas trasa do przerwania (gate musi odroznic „przerwano"
   *   od „nie bylo czego" — inaczej zmierzy CISZE).
   */
  abortJourney(vesselId, reason = 'superseded') {
    const v = this._vm?.getVessel?.(vesselId);
    if (!v?.warpRoute) return false;
    this._abort(v, reason);
    return true;
  }

  /**
   * G4 (decyzja właściciela 2026-11-06) — Stop floty w skoku: trasa kończy się na najbliższym przystanku. Statek kończy bieżący odcinek, a gałąź finału
   * `_onArrived` zdejmuje trasę po lądowaniu, bez linii Dziennika członka. Skrócona lista przystanków jest jedynym źródłem dla panelu floty, trasy na płycie
   * i zapisu, więc od chwili kliku mówią one prawdę. Kąt floty wchodzi do lecącej misji, bo dotąd niósł go tylko ostatni odcinek: bez tego każdy statek
   * wylądowałby w innym punkcie obrzeży, a `fleetArrivalPopupKind` nie rozpoznałby końca lotu.
   * @returns {boolean} czy trasa się skróciła. Ostatni odcinek: przystankiem jest cel, więc nie ma czego przerywać.
   */
  stopJourneyAtNextHop(vesselId) {
    const v = this._vm?.getVessel?.(vesselId);
    const r = v?.warpRoute;
    if (!r || r.legIndex >= r.hops.length - 2) return false;
    r.hops = r.hops.slice(0, r.legIndex + 2);
    r.finalSystemId = r.hops[r.hops.length - 1];
    if (Number.isFinite(r.arrivalAngle) && v.mission?.phase === 'warp_transit') v.mission.arrivalAngle = r.arrivalAngle;
    return true;
  }

  _abort(v, reason) {
    const finalId = v.warpRoute?.finalSystemId ?? null;
    v.warpRoute = null;   // statek stranduje tam, gdzie jest (orbita bieżącego układu)
    EventBus.emit('warpRoute:aborted', { vesselId: v.id, reason, strandedAt: v.systemId ?? null, finalSystemId: finalId });
    this._log(t('warpRoute.aborted', v.name, reason), 'warn');
    EventBus.emit('ui:toast', { text: t('warpRoute.aborted', v.name, reason), color: '#ff4466', durationMs: 4000 });
  }

  // ── Helpery prywatne ─────────────────────────────────────────────────────────

  _galaxySystems() {
    return window.KOSMOS?.galaxyData?.systems ?? [];
  }

  // Fog policy: permisywnie — routing/cel także przez nieznane układy
  // (_tickInterstellar generuje je leniwie przy przylocie). Hook gotowy pod
  // ewentualny fog-lock (FEATURES.warpRouteFogLock) — wtedy zwróć Set widocznych.
  _routableIds() {
    return undefined;
  }

  // Bazowa prędkość warp (LY/rok) — TYLKO do estymaty ETA w plannerze. Realny
  // arrivalYear (z bonusem beacona) liczy dispatchInterstellar per hop.
  _baseWarpSpeed(v) {
    const def = SHIPS[v.shipId] ?? HULLS[v.shipId] ?? null;
    if (!def) return 2.5;
    const stats = (Array.isArray(v.modules) && v.modules.length > 0) ? calcShipStats(def, v.modules) : null;
    return stats?.warpSpeedLY || def.warpSpeedLY || 2.5;
  }

  _systemName(systemId) {
    const s = this._galaxySystems().find(x => x.id === systemId);
    return s?.name ?? systemId;
  }

  _log(text, severity = 'info') {
    window.KOSMOS?.eventLogSystem?.push?.({ text, channel: 'fleet', severity });
  }
}
