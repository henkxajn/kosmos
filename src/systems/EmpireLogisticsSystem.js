// ═══════════════════════════════════════════════════════════════
// EmpireLogisticsSystem — Warstwa 2 transportu AI (logistyka kurierska)
// ───────────────────────────────────────────────────────────────
// Slice 2 / Sesja 3. Fizyczne małe statki (hull_small + cargo_small) krążą
// outpost↔stolica wożąc surowce strategiczne (Xe/Nt). Model ROUTE-BASED:
//   • Każdy outpost imperium ze złożem strategicznym dostaje 1 trasę → stolica.
//   • Trasa ma N dedykowanych kurierów (couriersPerRoute=2), którzy krążą
//     nieustannie póki trasa żyje. Brak detekcji deficytu jako trigger.
//   • Kurier homed @stolica (vessel.colonyId stała) → brak churn colonyId/fleet.
//
// Trzy warstwy transportu (model Filipa):
//   Warstwa 1 = CivilianTradeSystem (intra-empire, abstrakcyjny) — NIE ruszamy.
//   Warstwa 2 = TEN system (fizyczne kurierki outpost↔stolica).
//   Warstwa 3 = heavy cargo z portami — przyszłość (Slice 4).
//
// Stan per imperium na `empire.logistics` (gameState.empires — round-trip w save):
//   { routes:[{routeId, motherId, outpostId, courierIds:[]}], reserve:[],
//     pendingBuildRoute:null, stats:{built,dispatched,delivered} }
//
// KLUCZOWE realia API (zweryfikowane w kodzie):
//   - VesselManager._updatePositions auto-arrival OUTBOUND (orbiting + vessel:arrived);
//     POWRÓT NIE jest auto-wykrywany → pollujemy mission.returnYear i sami dokujemy.
//   - dispatchOnMission wymaga idle+docked; startReturn predykuje dom z vessel.colonyId
//     i mission.returnYear (ustawiamy returnYear ŚWIEŻO przed startReturn).
//   - loadCargo/unloadCargo (Vessel.js) — RAW minerały OK, clamp cargoMax z WAGĄ
//     surowca (Xe weight 0.1 → 200t mieści 2000 szt; Fe weight 2.0 → 100 szt).
//   - consumeFuel clampuje do 0, NIGDY nie strandi → fuel non-blocking dla AI.
//   - hull_small.size='small' → ląduje bez portu (dokuje wszędzie).
//
// Wzorzec ticku jak EmpireStrategySystem (konstruktor subskrybuje time:tick,
// deps leniwie z window.KOSMOS).
// ═══════════════════════════════════════════════════════════════

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { MINED_RESOURCES } from '../data/ResourcesData.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { loadCargo, unloadCargo } from '../entities/Vessel.js';

// px na 1 AU (z DistanceUtils/VesselManager — spójność travel-time z fizyką lotu)
const AU_TO_PX = GAME_CONFIG?.AU_TO_PX ?? 110;

// Tempo dispatchera (co ile civYears przeglądamy trasy + budujemy). Per-tick
// state machine (advance kurierów) biegnie KAŻDY tick — interwał dotyczy tylko
// zarządzania trasami i budową statków.
const LOGISTICS_INTERVAL_CIVYEARS = 1;

// Silniki kuriera od najlepszego do najgorszego (tech-gated). _bestEngine zwraca
// pierwszy którego `requires` spełnia techSystem imperium; engine_chemical
// (requires:null) to zawsze dostępny fallback.
// S3.2 S1: silniki WARP są WYKLUCZONE. Kurier jest in-system (zero dispatchInterstellar)
//   i fuel-immune, więc warp nic mu nie daje, a jego budowa wymaga warp_cores (T5,
//   Ti-zależne). Po wejściu modelu badań AI (S3.2 S2) kurier z warpem zaqueue'owałby
//   się na wieczność na nieosiągalnym warp_cores → logistyka by stanęła. (Zapalnik:
//   S3.0b S3 obniżył engine_warp.requires do ion_drives = mid-game.)
const ENGINE_TIERS = ['engine_fusion', 'engine_ion', 'engine_chemical'];

// Domyślny config logistyki — fallback per-klucz gdy archetyp nie ma logisticsConfig.
const DEFAULT_LOGISTICS_CONFIG = {
  couriersPerRoute:      2,
  cargoModule:           'cargo_small',
  minFreePopsForCourier: 0.05,
  strategicDeposits:     ['Xe', 'Nt'],
};

const EPS = 1e-6;

export class EmpireLogisticsSystem {
  constructor() {
    this._acc     = 0;       // akumulator civDeltaYears dla dispatchera
    this._verbose = false;   // KOSMOS.empireLogisticsSystem._verbose = true

    this._onTick            = ({ civDeltaYears }) => this._tick(civDeltaYears ?? 0);
    this._onVesselCreated   = ({ vessel })        => this._onVesselCreatedClaim(vessel);
    this._onColonyDestroyed = (data)              => this._onColonyDestroyedCleanup(data);
    this._onVesselWrecked   = ({ vesselId, vessel }) => this._onVesselWreckedCleanup(vesselId ?? vessel?.id);

    EventBus.on('time:tick',        this._onTick);
    EventBus.on('vessel:created',   this._onVesselCreated);
    EventBus.on('colony:destroyed', this._onColonyDestroyed);
    EventBus.on('vessel:wrecked',   this._onVesselWrecked);
  }

  stop() {
    EventBus.off('time:tick',        this._onTick);
    EventBus.off('vessel:created',   this._onVesselCreated);
    EventBus.off('colony:destroyed', this._onColonyDestroyed);
    EventBus.off('vessel:wrecked',   this._onVesselWrecked);
  }

  _log(msg, ctx = '') {
    if (!this._verbose) return;
    console.log(`[EmpireLogisticsSystem] ${msg}${ctx ? ' — ' + ctx : ''}`);
  }

  // ── Leniwe deps ───────────────────────────────────────────────────────────
  _vm()       { return window.KOSMOS?.vesselManager; }
  _cm()       { return window.KOSMOS?.colonyManager; }
  _reg()      { return window.KOSMOS?.empireRegistry; }
  _gameTime() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  // Imperia obsługiwane (mają znany archetyp; gracz NIE jest w EmpireRegistry).
  _managedEmpires() {
    const reg = this._reg();
    if (!reg?.listAll) return [];
    return reg.listAll().filter(e => !!ARCHETYPES[e?.archetype]);
  }

  // Config logistyki: archetyp nadpisuje DEFAULT per-klucz.
  _logisticsConfig(empire) {
    const block = ARCHETYPES[empire?.archetype]?.logisticsConfig;
    return block ? { ...DEFAULT_LOGISTICS_CONFIG, ...block } : { ...DEFAULT_LOGISTICS_CONFIG };
  }

  // Lazy init stanu logistyki na obiekcie imperium (gameState live ref → round-trip).
  _ensureLogistics(empire) {
    if (!empire) return null;
    if (!empire.logistics) {
      empire.logistics = {
        routes:            [],
        reserve:           [],
        pendingBuildRoute: null,
        stats:             { built: 0, dispatched: 0, delivered: 0 },
      };
    }
    const l = empire.logistics;
    if (!Array.isArray(l.routes))  l.routes = [];
    if (!Array.isArray(l.reserve)) l.reserve = [];
    if (l.pendingBuildRoute === undefined) l.pendingBuildRoute = null;
    if (!l.stats) l.stats = { built: 0, dispatched: 0, delivered: 0 };
    return l;
  }

  // ── Pętla czasu ─────────────────────────────────────────────────────────────
  _tick(civDt) {
    // Per-tick: advance state machine WSZYSTKICH kurierów (płynny polling faz).
    this._advanceAllCouriers();

    // Co interwał: dispatcher (zarządzanie trasami + budowa kurierów).
    this._acc += civDt;
    if (this._acc < LOGISTICS_INTERVAL_CIVYEARS) return;
    this._acc -= LOGISTICS_INTERVAL_CIVYEARS;

    for (const empire of this._managedEmpires()) {
      try { this._runDispatcher(empire); }
      catch (e) { console.error(`[EmpireLogisticsSystem] runDispatcher ${empire?.id} threw:`, e); }
    }
  }

  // ── Dispatcher: zarządzanie trasami + reassign reserve + budowa ──────────────
  _runDispatcher(empire) {
    const reg = this._reg(); const cm = this._cm();
    const ssm = window.KOSMOS?.starSystemManager;
    if (!reg || !cm || !ssm) return;

    const logi = this._ensureLogistics(empire);

    const capital = this._pickCapital(empire);
    if (!capital) { this._log('brak stolicy (pełnej kolonii) — skip', empire?.id); return; }
    if (this._shipyardLevel(capital) <= 0) { this._log('brak stoczni @stolica — czekam', empire?.id); return; }

    const systemId = empire.homeSystemId ?? capital.systemId;
    const sys = ssm.getSystem?.(systemId);
    if (!sys) return;

    const cfg              = this._logisticsConfig(empire);
    const strategic        = cfg.strategicDeposits ?? DEFAULT_LOGISTICS_CONFIG.strategicDeposits;
    const couriersPerRoute = cfg.couriersPerRoute ?? DEFAULT_LOGISTICS_CONFIG.couriersPerRoute;

    // #14: outposty są teraz w EmpireRegistry (bootstrapAutonomousOutpost woła addColony)
    //   → bierzemy je z getColoniesByEmpire (jedno źródło prawdy, koniec skanu bodyIds systemu).
    const outpostIds = reg.getColoniesByEmpire(empire.id)
      .filter(c => c.isOutpost && strategic.some(r => this._hasDeposit(EntityManager.get(c.planetId), r)))
      .map(c => c.planetId);

    for (const outpostId of outpostIds) {
      let route = logi.routes.find(r => r.outpostId === outpostId);
      if (!route) {
        route = { routeId: `logi_${empire.id}_${outpostId}`, motherId: capital.planetId, outpostId, courierIds: [] };
        logi.routes.push(route);
        this._log('nowa trasa', route.routeId);
      } else {
        route.motherId = capital.planetId;  // re-home gdy stolica się zmieniła
      }

      // Prune martwych kurierów (zniszczonych / wraków).
      route.courierIds = route.courierIds.filter(id => {
        const v = this._vm()?.getVessel(id);
        return v && !v.isWreck;
      });

      // U1: reassign z reserve do limitu (while-guard chroni przed overshoot >cap).
      while (route.courierIds.length < couriersPerRoute && logi.reserve.length > 0) {
        const cid = logi.reserve.shift();
        const v = this._vm()?.getVessel(cid);
        if (v && !v.isWreck) {
          v.assignedRouteId = route.routeId;
          route.courierIds.push(cid);
        }
      }

      // Budowa nowego kuriera — gdy nadal za mało I brak pending buildu (1 na raz/empire).
      if (route.courierIds.length < couriersPerRoute && logi.pendingBuildRoute == null) {
        if (this._shipyardSlotFree(capital) && this._enoughFreePops(capital, cfg)) {
          const engine = this._bestEngine(capital.techSystem);
          const modules = [engine, cfg.cargoModule ?? 'cargo_small'];
          const res = cm.startShipBuild(capital.planetId, 'hull_small', modules);
          if (res?.ok) {
            // {ok:true} (build natychmiastowy) LUB {ok:true,queued:true} (brak surowców →
            // kolejka). Oba ustawiają pendingBuildRoute do vessel:created/fail (U3).
            logi.pendingBuildRoute = route.routeId;
            logi.stats.built++;
            EventBus.emit('logistics:shipBuildRequested', {
              empireId: empire.id, routeId: route.routeId, queued: !!res.queued,
            });
            this._log('budowa kuriera', `${route.routeId} engine=${engine}${res.queued ? ' (queued)' : ''}`);
          }
        }
      }
    }
  }

  // ── Per-tick state machine kurierów ─────────────────────────────────────────
  _advanceAllCouriers() {
    for (const empire of this._managedEmpires()) {
      const logi = empire.logistics;
      if (!logi) continue;
      const capital = this._pickCapital(empire);

      // Kurierzy tras — pełna maszyna stanów.
      for (const route of (logi.routes ?? [])) {
        route.courierIds = route.courierIds.filter(id => {
          const v = this._vm()?.getVessel(id);
          return v && !v.isWreck;
        });
        for (const cid of [...route.courierIds]) {
          try { this._advanceRouteCourier(empire, route, cid, capital); }
          catch (e) { console.error('[EmpireLogisticsSystem] advanceRouteCourier threw:', e); }
        }
      }

      // Kurierzy w rezerwie — tylko sprowadzenie do domu + idle (BEZ dispatchu).
      logi.reserve = (logi.reserve ?? []).filter(id => {
        const v = this._vm()?.getVessel(id);
        return v && !v.isWreck;
      });
      for (const cid of [...logi.reserve]) {
        try { this._advanceReserveCourier(empire, cid, capital); }
        catch (e) { console.error('[EmpireLogisticsSystem] advanceReserveCourier threw:', e); }
      }
    }
  }

  // Faza derived z vessel state (brak osobnego pola fazy w Vessel):
  //   IDLE@capital (idle + docked)                 → dispatch outbound → outpost
  //   LOADING (on_mission + orbiting + @outpost)   → loadByRarity; pełny → startReturn
  //   RETURNING (phase=returning + past returnYear)→ unload all → dock @stolica
  //   in_transit (out/in)                          → no-op (VesselManager interpoluje)
  _advanceRouteCourier(empire, route, cid, capital) {
    const vm = this._vm(); const cm = this._cm();
    const v = vm?.getVessel(cid);
    if (!v) return;
    const gameTime = this._gameTime();

    const outpost = cm?.getColony(route.outpostId);
    const capEnt  = EntityManager.get(route.motherId);
    const outEnt  = EntityManager.get(route.outpostId);
    const speedAU = Math.max(0.05, v.speedAU ?? 1.0);

    // IDLE@capital → dispatch outbound do outpostu.
    // 'refueling' też akceptowany (lustro dispatchOnMission): po reformie paliwa S3.0a
    // kurier AI nie ma w kolonii 'fuel' do tankowania → utknąłby w 'refueling' i nigdy
    // nie wrócił do 'idle'. AI jest fuel-immune (dispatch clampuje paliwo do 0), więc
    // kurier ma krążyć niezależnie od stanu paliwa.
    if ((v.status === 'idle' || v.status === 'refueling') && v.position?.state === 'docked') {
      if (!outpost || !outEnt) return;  // outpost zniknął — cleanup przeniesie do reserve
      const distAU = this._distAU(capEnt, outEnt);
      const travel = distAU / speedAU;
      const fuelCost = distAU * (v.fuel?.consumption ?? v._baseFuelPerAU ?? 0.35);
      const ok = vm.dispatchOnMission(cid, {
        type:        'logistics',
        targetId:    route.outpostId,
        targetName:  outEnt?.name,
        departYear:  gameTime,
        arrivalYear: gameTime + travel,
        returnYear:  gameTime + travel * 2,   // estymata; odświeżana świeżo przed startReturn
        fuelCost,
      });
      if (ok) {
        this._ensureLogistics(empire).stats.dispatched++;
        this._log('dispatch outbound', `${cid} → ${route.outpostId}`);
      }
      return;
    }

    // LOADING@outpost (on_mission + orbiting + dockedAt===outpost, nie returning).
    if (v.status === 'on_mission' && v.position?.state === 'orbiting'
        && v.position.dockedAt === route.outpostId
        && v.mission && v.mission.phase !== 'returning') {
      if (outpost?.resourceSystem) {
        this._loadByRarity(v, outpost.resourceSystem);
        this._depletionWarn(outpost);
      }
      const full = (v.cargoUsed ?? 0) >= (v.cargoMax ?? 0) - EPS;
      // Granularność wagi: po loadByRarity outpost może mieć resztkę zbyt ciężką by
      // wejść w wolne miejsce → cargo "efektywnie pełny". stillHasLoadable=true gdy
      // outpost wciąż ma jakiś surowiec mineralny (loadByRarity nie wziął wszystkiego).
      const stillHasLoadable = outpost?.resourceSystem ? this._outpostHasMined(outpost.resourceSystem) : false;
      if (full || (stillHasLoadable && (v.cargoUsed ?? 0) > 0)) {
        const distAU = this._distAU(outEnt, capEnt);
        const travel = distAU / speedAU;
        v.mission.returnYear = gameTime + travel;   // ŚWIEŻO przed startReturn (startReturn predykuje dom)
        vm.startReturn(cid);
        this._log('startReturn (pełny)', `${cid} cargoUsed=${(v.cargoUsed ?? 0).toFixed(1)}/${v.cargoMax}`);
      }
      // else: outpost wyczerpany + cargo ma miejsce → WAIT (re-poll, akumuluj produkcję).
      return;
    }

    // RETURNING → unload all do stolicy + dock.
    if (v.mission?.phase === 'returning' && gameTime >= (v.mission.returnYear ?? Infinity)) {
      this._deliverAndDock(v, capital ?? cm?.getColony(route.motherId));
      this._ensureLogistics(empire).stats.delivered++;
      this._log('dostawa + dok', `${cid} → ${route.motherId}`);
      return;
    }
    // in_transit (outbound/inbound przed arrival) → no-op (VesselManager interpoluje).
  }

  // Kurier rezerwowy — tylko sprowadzenie do domu (gdy wracał) + idle. Dispatcher
  // reassignuje go do trasy (idle@stolica) przy następnym przebiegu.
  _advanceReserveCourier(empire, cid, capital) {
    const vm = this._vm();
    const v = vm?.getVessel(cid);
    if (!v || !capital) return;
    const gameTime = this._gameTime();
    if (v.mission?.phase === 'returning' && gameTime >= (v.mission.returnYear ?? Infinity)) {
      this._deliverAndDock(v, capital);
    }
    // else: in_transit / idle → leave (dispatcher zajmie się idle reserve).
  }

  // Rozładuj cały cargo do stolicy + zadokuj.
  _deliverAndDock(v, capital) {
    const vm = this._vm();
    if (capital?.resourceSystem && v.cargo) {
      for (const [resId, qty] of Object.entries({ ...v.cargo })) {
        if (qty > 0) unloadCargo(v, resId, qty, capital.resourceSystem);
      }
    }
    vm.dockAtColony(v.id, capital?.planetId ?? v.colonyId);
  }

  // ── Ładowanie rare-first ─────────────────────────────────────────────────────
  // Sortuje surowce wydobywalne malejąco po rarity (Xe/Nt=5 najpierw, Fe/C=1 na końcu)
  // i ładuje każdy do pełna. loadCargo clampuje wg wolnego miejsca/wagi/dostępności.
  _loadByRarity(vessel, resSys) {
    if (!vessel || !resSys) return;
    const ids = Object.keys(MINED_RESOURCES).sort(
      (a, b) => (MINED_RESOURCES[b]?.rarity ?? 0) - (MINED_RESOURCES[a]?.rarity ?? 0)
    );
    for (const resId of ids) {
      if ((vessel.cargoUsed ?? 0) >= (vessel.cargoMax ?? 0) - EPS) break;
      const avail = resSys.getAmount?.(resId) ?? 0;
      if (avail <= 0) continue;
      loadCargo(vessel, resId, avail, resSys);
    }
  }

  // Czy outpost ma JESZCZE jakikolwiek surowiec wydobywalny w inwentarzu?
  _outpostHasMined(resSys) {
    for (const id of Object.keys(MINED_RESOURCES)) {
      if ((resSys.getAmount?.(id) ?? 0) > 0) return true;
    }
    return false;
  }

  // Tech debt #16: wyczerpywalność złóż — tylko warning (AI nie reaguje proaktywnie).
  // Zwraca tablicę resourceId złóż <10% (do testu T14) + warn gdy _verbose.
  _checkDepletion(outpostColony) {
    const ent = EntityManager.get(outpostColony?.planetId);
    const low = [];
    for (const d of (ent?.deposits ?? [])) {
      const total = d.totalAmount ?? 0;
      if (total > 0 && (d.remaining ?? 0) / total < 0.1) low.push(d.resourceId);
    }
    return low;
  }

  _depletionWarn(outpostColony) {
    const low = this._checkDepletion(outpostColony);
    if (low.length && this._verbose) {
      console.warn(`[EmpireLogisticsSystem] outpost ${outpostColony?.planetId} złoża <10%: ${low.join(',')}`);
    }
    return low;
  }

  // ── Claim kuriera (vessel:created) ───────────────────────────────────────────
  // Synchronicznie taguje świeżo zbudowany hull_small jako kuriera imperium i dopina
  // do trasy z pendingBuildRoute. Wyklucza statki gracza (colony.ownerEmpireId null).
  _onVesselCreatedClaim(vessel) {
    if (!vessel || vessel.shipId !== 'hull_small') return;       // budujemy tylko hull_small
    const cm = this._cm();
    const colony = cm?.getColony(vessel.colonyId);
    const empId = colony?.ownerEmpireId;
    if (!empId || empId === 'player') return;                    // gracz: ownerEmpireId null
    const reg = this._reg();
    const empire = reg?.get(empId);
    if (!empire || !ARCHETYPES[empire.archetype]) return;        // tylko zarządzane imperium
    const logi = empire.logistics;
    if (!logi || !logi.pendingBuildRoute) return;                // brak oczekiwanego buildu
    const route = logi.routes.find(r => r.routeId === logi.pendingBuildRoute);
    if (!route) { logi.pendingBuildRoute = null; return; }

    // Tag ownership (filtry UI/combat) + assignedRouteId.
    vessel.ownerEmpireId  = empId;
    vessel.isEnemy        = true;
    vessel.owner          = empId;
    vessel.assignedRouteId = route.routeId;

    const cap = this._couriersPerRoute(empire);
    if (!route.courierIds.includes(vessel.id) && route.courierIds.length < cap) {
      route.courierIds.push(vessel.id);
    } else if (!route.courierIds.includes(vessel.id)) {
      // Trasa pełna (race: reserve uzupełnił w międzyczasie) → reserve (no overshoot, T17).
      logi.reserve.push(vessel.id);
    }
    logi.pendingBuildRoute = null;
    EventBus.emit('logistics:courierClaimed', { empireId: empId, routeId: route.routeId, vesselId: vessel.id });
    this._log('claim kuriera', `${vessel.id} → ${route.routeId}`);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  _onColonyDestroyedCleanup(data) {
    const planetId = data?.planetId;
    if (!planetId) return;
    for (const empire of this._managedEmpires()) {
      const logi = empire.logistics;
      if (!logi) continue;

      // (1) Zniszczony OUTPOST → abort trasy: kurierzy → reserve (+ powrót do domu).
      const routeIdx = logi.routes.findIndex(r => r.outpostId === planetId);
      if (routeIdx >= 0) {
        const route = logi.routes[routeIdx];
        for (const cid of [...route.courierIds]) {
          const v = this._vm()?.getVessel(cid);
          if (!v || v.isWreck) continue;
          v.assignedRouteId = null;
          this._sendCourierHome(v, route.motherId);
          if (!logi.reserve.includes(cid)) logi.reserve.push(cid);
        }
        if (logi.pendingBuildRoute === route.routeId) logi.pendingBuildRoute = null;
        logi.routes.splice(routeIdx, 1);
        EventBus.emit('logistics:routeAborted', { empireId: empire.id, routeId: route.routeId, reason: 'outpost_destroyed' });
        this._log('routeAborted (outpost zniszczony)', route.routeId);
      }

      // (2) Zniszczona STOLICA → rozwiąż wszystkie trasy do niej; kurierzy → reserve.
      //     Następny dispatch re-home'uje do nowej stolicy (pierwsza pozostała pełna
      //     kolonia). Brak nowej → empire prawdopodobnie ginie (reserve idle).
      const capitalRoutes = logi.routes.filter(r => r.motherId === planetId);
      if (capitalRoutes.length > 0) {
        for (const route of capitalRoutes) {
          for (const cid of [...route.courierIds]) {
            const v = this._vm()?.getVessel(cid);
            if (v && !v.isWreck) {
              v.assignedRouteId = null;
              if (!logi.reserve.includes(cid)) logi.reserve.push(cid);
            }
          }
        }
        logi.routes = logi.routes.filter(r => r.motherId !== planetId);
        logi.pendingBuildRoute = null;
        EventBus.emit('logistics:capitalLost', { empireId: empire.id });
        this._log('capitalLost — trasy rozwiązane', empire.id);
      }
    }
  }

  // Sprowadź kuriera do stolicy (re-home colonyId + startReturn gdy mid-flight).
  // VesselManager._onColonyDestroyed mógł wcześniej przekierować colonyId na PLAYER
  // homePlanet (jego logika redirectu) — tu nadpisujemy na właściwą stolicę imperium.
  _sendCourierHome(v, capitalId) {
    if (!v || !capitalId) return;
    v.colonyId = capitalId;
    if (v.position?.state !== 'docked' && v.mission && v.mission.phase !== 'returning') {
      const capEnt = EntityManager.get(capitalId);
      const distAU = this._distAU({ x: v.position?.x, y: v.position?.y }, capEnt);
      const speedAU = Math.max(0.05, v.speedAU ?? 1.0);
      v.mission.returnYear = this._gameTime() + distAU / speedAU;
      try { this._vm()?.startReturn(v.id); } catch (_e) { /* best-effort */ }
    }
  }

  _onVesselWreckedCleanup(vesselId) {
    if (!vesselId) return;
    for (const empire of this._managedEmpires()) {
      const logi = empire.logistics;
      if (!logi) continue;
      for (const route of (logi.routes ?? [])) {
        const idx = route.courierIds.indexOf(vesselId);
        if (idx >= 0) route.courierIds.splice(idx, 1);   // dispatcher odbuduje (route<cap → build)
      }
      const ridx = logi.reserve.indexOf(vesselId);
      if (ridx >= 0) logi.reserve.splice(ridx, 1);
    }
  }

  // ── Helpery ───────────────────────────────────────────────────────────────────
  // Stolica = pierwsza pełna kolonia (!isOutpost) imperium z resourceSystem.
  _pickCapital(empire) {
    const colonies = this._reg()?.getColoniesByEmpire?.(empire.id) ?? [];
    for (const c of colonies) {
      if (c && !c.isOutpost && c.resourceSystem) return c;
    }
    return null;
  }

  _shipyardLevel(capital) {
    return this._cm()?._getShipyardLevel?.(capital) ?? 0;
  }

  _shipyardSlotFree(capital) {
    return this._shipyardLevel(capital) > (capital.shipQueues?.length ?? 0);
  }

  _enoughFreePops(capital, cfg) {
    const free = capital.civSystem?.freePops ?? 0;
    return free >= (cfg.minFreePopsForCourier ?? DEFAULT_LOGISTICS_CONFIG.minFreePopsForCourier);
  }

  _couriersPerRoute(empire) {
    return this._logisticsConfig(empire).couriersPerRoute ?? DEFAULT_LOGISTICS_CONFIG.couriersPerRoute;
  }

  // Najlepszy dostępny silnik kuriera wg tech imperium (fallback engine_chemical).
  // S3.2 S1: defensywnie pomija silniki warpCapable (gdyby ktoś dopisał warp do
  //   ENGINE_TIERS) — kurier nigdy nie skacze, a warp = T5 warp_cores stall.
  _bestEngine(techSystem) {
    for (const eid of ENGINE_TIERS) {
      const m = SHIP_MODULES[eid];
      if (!m) continue;
      if (m.warpCapable) continue;  // kurier in-system — nigdy warp (S3.2 S1)
      if (!m.requires || techSystem?.isResearched?.(m.requires)) return eid;
    }
    return 'engine_chemical';
  }

  _distAU(a, b) {
    if (!a || !b) return 0;
    const dx = (a.x ?? 0) - (b.x ?? 0);
    const dy = (a.y ?? 0) - (b.y ?? 0);
    return Math.hypot(dx, dy) / AU_TO_PX;
  }

  _hasDeposit(entity, resourceId) {
    return !!entity?.deposits?.some(d => d.resourceId === resourceId && d.remaining > 0);
  }
}

export default EmpireLogisticsSystem;
