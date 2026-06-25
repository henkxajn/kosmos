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
import { canJump, isEnemyVessel } from '../entities/Vessel.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { calcShipStats } from '../data/ShipModulesData.js';
import { planWarpRoute, warpDist3D, WARP_ROUTE_REASONS } from '../utils/WarpRoutePlanner.js';

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
   * @returns {{ok:boolean, reason?:string, route?:Object}}
   */
  beginJourney(vesselId, targetSystemId) {
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
    const plan = planWarpRoute(systems, v.systemId ?? 'sys_home', targetSystemId, {
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
    };

    const firstHop = plan.hops[1];
    if (!this._vm.dispatchInterstellar(vesselId, firstHop)) {
      v.warpRoute = null;   // dispatch odrzucony (np. wyścig stanu) → wycofaj trasę
      return { ok: false, reason: 'dispatch_failed' };
    }

    EventBus.emit('warpRoute:started', { vesselId, route: plan, finalSystemId: targetSystemId });
    const finalName = this._systemName(targetSystemId);
    this._log(t('warpRoute.started', v.name, finalName, String(plan.hops.length - 1)), 'info');
    return { ok: true, route: plan };
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
      EventBus.emit('warpRoute:completed', { vesselId: v.id, finalSystemId: r.finalSystemId });
      this._log(t('warpRoute.completed', v.name, this._systemName(r.finalSystemId)), 'info');
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
    this._log(t('warpRoute.legDone', v.name, this._systemName(systemId)), 'info');

    if (!this._vm.dispatchInterstellar(v.id, nextTarget)) { this._abort(v, 'dispatch_failed'); }
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
