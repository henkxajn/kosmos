// M3 P3.1 — POIRuntimeSystem
//
// Runtime detection logic dla 2 z 5 POI types: picket (alert zone) + rally
// (multi-vessel assembly point). Pozostałe (waypoint/patrol/ambush) — bez
// runtime hooków w P3.1; ambush → P3.2 scope.
//
// Architektura:
//   - Subskrypcja 'time:tick' bezpośrednio (nie wire'ujemy ręcznie w GameScene)
//   - Throttling: detection runs co GAME_CONFIG.poiDetectionTickInterval ticks
//     (~167ms przy 60fps przy interval=10) — tradeoff perf/responsiveness
//   - Brute-force N×M scan (POIs × vessels). M3 scale: typowo ~5-20 POI ×
//     ~20-100 vessels = max ~2000 par/tick → akceptowalne (M2a Proximity ma
//     budget 500 par/tick, ale tam runs co tick; my mamy throttling)
//
// Detection logic per type:
//   picket → enemy w zasięgu (rangePxLocal) + alertOnEmpireIds filter
//            → updatePOI({triggered, cooldownEndsAt}) + emit poi:alertTriggered
//            + window.KOSMOS.timeSystem._triggerAutoSlow(t('log.autoSlowPicketAlert'))
//   rally  → liczy memberVesselIds w zasięgu (rallyGatherRangePx) → progress
//            → gdy >= waitForCount: updatePOI({complete, completedYear}) +
//              emit poi:rallyComplete (one-time, idempotent przez complete flag)
//
// Auto-clear triggered:
//   Po cooldownEndsAt (gameTime) wygasa → updatePOI({triggered:false, cooldownEndsAt:null})
//   → poi:updated emit → ThreeRenderer/FleetOverlay re-render w kolorze normalnym
//
// Coord space: vessel.position.x/y i poi.center.x/y są w gameplay px
//   (1 AU = AU_TO_PX = 110 px). gameplayDistance helper w CoordTransform.
//
// Save persistence: runtime fields (triggered/cooldownEndsAt/complete/
//   currentMembers/completedYear) persisted w gameState.pois, migracja
//   v67→v68 (default values, backward compatible).
//
// Events:
//   IN:  time:tick (deltaYears, civDeltaYears, gameTime, multiplier)
//   OUT: poi:alertTriggered { poiId, poiName, vesselId, vesselName, empireId, location }
//   OUT: poi:rallyComplete  { poiId, poiName, memberCount, location }
//   OUT (via POIRegistry): poi:updated (przy każdej mutacji runtime fields)

import EventBus              from '../core/EventBus.js';
import { GAME_CONFIG }       from '../config/GameConfig.js';
import { gameplayDistance }  from '../utils/CoordTransform.js';
import { isEnemyVessel }     from '../entities/Vessel.js';
import { t }                 from '../i18n/i18n.js';

// gameTime jest w latach. picketCooldownGameDays = 30 dni → 30/365.25 lat.
const DAYS_TO_YEARS = 1 / 365.25;

export class POIRuntimeSystem {
  constructor({ poiRegistry, vesselManager } = {}) {
    this.poiRegistry   = poiRegistry   ?? null;
    this.vesselManager = vesselManager ?? null;

    this._tickCounter   = 0;
    this._tickInterval  = GAME_CONFIG.poiDetectionTickInterval ?? 10;
    this._cooldownYears = (GAME_CONFIG.picketCooldownGameDays ?? 30) * DAYS_TO_YEARS;
    this._gatherRangePx = GAME_CONFIG.rallyGatherRangePx ?? 50;

    this._timeTickHandler = ({ gameTime }) => this._onTick(gameTime);
    EventBus.on('time:tick', this._timeTickHandler);
  }

  // ── Cleanup (gdy GameScene resetuje systemy — defensive, rzadko używane)
  destroy() {
    if (this._timeTickHandler) {
      EventBus.off?.('time:tick', this._timeTickHandler);
      this._timeTickHandler = null;
    }
  }

  // ── Główna pętla — throttled detection ──────────────────────────────────
  _onTick(gameTime) {
    this._tickCounter++;
    if (this._tickCounter % this._tickInterval !== 0) return;

    // Lazy resolve: poiRegistry / vesselManager mogą być null gdy konstruktor
    // dostał undefined (testy) → użyj window.KOSMOS jako fallback runtime.
    const poiReg = this.poiRegistry ?? window.KOSMOS?.poiRegistry ?? null;
    const vMgr   = this.vesselManager ?? window.KOSMOS?.vesselManager ?? null;
    if (!poiReg?.listPOIs || !vMgr?.getAllVessels) return;

    const pois = poiReg.listPOIs() ?? [];
    if (pois.length === 0) return;
    const vessels = vMgr.getAllVessels() ?? [];

    for (const poi of pois) {
      if (poi.type === 'picket')      this._tickPicket(poi, vessels, gameTime, poiReg);
      else if (poi.type === 'rally')  this._tickRally(poi, vessels, gameTime, poiReg);
      // ambush → P3.2 scope
      // waypoint, patrol → no runtime logic
    }
  }

  // ── Picket detection ────────────────────────────────────────────────────
  _tickPicket(poi, vessels, gameTime, poiReg) {
    // Auto-clear triggered po cooldownEndsAt expire
    if (poi.triggered && poi.cooldownEndsAt != null && gameTime >= poi.cooldownEndsAt) {
      poiReg.updatePOI(poi.id, { triggered: false, cooldownEndsAt: null });
      // Po update'cie poi już ma nowe wartości (poi:updated event), ale lokalna
      // zmienna `poi` jest stale — co nie szkodzi, kontynuujemy do detection.
    }

    // Cooldown active → skip detection
    if (poi.cooldownEndsAt != null && gameTime < poi.cooldownEndsAt) return;

    const center = poi.center;
    const range  = poi.rangePxLocal;
    if (!center || !(range > 0)) return;

    // alertOnEmpireIds semantyka:
    //   null     → alert na każdego wroga (default)
    //   []       → alert na nikogo (whitelist pusta)
    //   [...]    → alert tylko na wymienione empire IDs
    const alertOn = poi.alertOnEmpireIds;

    for (const vessel of vessels) {
      if (!vessel || !vessel.position) continue;
      // Pomijaj wraki (state z VesselManager) — nie powinny triggerować picket
      if (vessel.wreckedAt != null) continue;

      // Skip own vessels (poi.ownerEmpireId vs vessel.ownerEmpireId).
      // Player vessels nie mają ownerEmpireId set → traktuj jako 'player'.
      const vesselEmpire = vessel.ownerEmpireId ?? (isEnemyVessel(vessel) ? 'enemy' : 'player');
      const poiOwner     = poi.ownerEmpireId ?? 'player';
      if (vesselEmpire === poiOwner) continue;

      // alertOnEmpireIds filter
      if (alertOn !== null && alertOn !== undefined) {
        if (!Array.isArray(alertOn) || alertOn.length === 0) continue;  // [] = nikt
        if (!alertOn.includes(vesselEmpire)) continue;
      }

      const dist = gameplayDistance(center, vessel.position);
      if (dist > range) continue;

      // Trigger! Update POI + emit + auto-slow.
      poiReg.updatePOI(poi.id, {
        triggered: true,
        cooldownEndsAt: gameTime + this._cooldownYears,
      });

      EventBus.emit('poi:alertTriggered', {
        poiId:     poi.id,
        poiName:   poi.name,
        vesselId:  vessel.id,
        vesselName: vessel.name,
        empireId:  vesselEmpire,
        location:  { x: center.x, y: center.y },
      });

      // Auto-slow (smart — built-in respect dla already-slow w TimeSystem._triggerAutoSlow)
      const ts = window.KOSMOS?.timeSystem;
      if (ts?._triggerAutoSlow) {
        try { ts._triggerAutoSlow(t('log.autoSlowPicketAlert')); }
        catch (e) { /* defensive — auto-slow nigdy nie powinien rzucić, ale safe */ }
      }

      break;  // 1 trigger per tick — first vessel wins
    }
  }

  // ── Rally member assembly ───────────────────────────────────────────────
  _tickRally(poi, vessels, gameTime, poiReg) {
    if (poi.complete) return;  // już zebrany — one-time event (idempotent)

    const memberIds = poi.memberVesselIds ?? [];
    if (memberIds.length === 0) {
      // Brak przypisań — ale jeśli currentMembers było > 0 (np. po remove all),
      // wyzeruj UI. Avoid spam: only if changed.
      if (poi.currentMembers !== 0) {
        poiReg.updatePOI(poi.id, { currentMembers: 0 });
      }
      return;
    }

    const center = poi.center;
    if (!center) return;

    // Liczba vessels w zasięgu (gather range px)
    let inRangeCount = 0;
    for (const memberId of memberIds) {
      const vessel = this._findVessel(vessels, memberId);
      if (!vessel || !vessel.position) continue;
      // Pomijaj wraki (member zniszczony — nie liczy się)
      if (vessel.wreckedAt != null) continue;
      const dist = gameplayDistance(center, vessel.position);
      if (dist <= this._gatherRangePx) inRangeCount++;
    }

    // Update progress (UI display) — tylko przy zmianie, avoid spam
    if (poi.currentMembers !== inRangeCount) {
      poiReg.updatePOI(poi.id, { currentMembers: inRangeCount });
    }

    // Complete check (waitForCount validated >= 1 w POITypes)
    if (inRangeCount >= poi.waitForCount) {
      poiReg.updatePOI(poi.id, {
        complete: true,
        completedYear: gameTime,
        currentMembers: inRangeCount,
      });

      EventBus.emit('poi:rallyComplete', {
        poiId:       poi.id,
        poiName:     poi.name,
        memberCount: inRangeCount,
        location:    { x: center.x, y: center.y },
      });
    }
  }

  // Lookup vessel po ID — small N (zwykle <100), linear scan acceptable
  _findVessel(vessels, vesselId) {
    for (let i = 0; i < vessels.length; i++) {
      if (vessels[i].id === vesselId) return vessels[i];
    }
    return null;
  }

  // ── Test helpers (exposed dla devtools KOSMOS.debug) ────────────────────
  /**
   * Force-trigger picket (devtools only). Bypassuje detection logic, ale
   * używa tego samego update + emit flow co prawdziwy trigger.
   */
  simulatePicketAlert(poiId, vesselId) {
    const poiReg = this.poiRegistry ?? window.KOSMOS?.poiRegistry;
    const vMgr   = this.vesselManager ?? window.KOSMOS?.vesselManager;
    if (!poiReg || !vMgr) return { ok: false, reason: 'systems_unavailable' };
    const poi = poiReg.getPOI(poiId);
    if (!poi || poi.type !== 'picket') return { ok: false, reason: 'not_picket' };
    const vessel = vMgr.getVessel?.(vesselId) ?? null;
    if (!vessel) return { ok: false, reason: 'vessel_not_found' };

    const gameTime = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    poiReg.updatePOI(poiId, {
      triggered: true,
      cooldownEndsAt: gameTime + this._cooldownYears,
    });
    EventBus.emit('poi:alertTriggered', {
      poiId:     poi.id,
      poiName:   poi.name,
      vesselId:  vessel.id,
      vesselName: vessel.name,
      empireId:  vessel.ownerEmpireId ?? (isEnemyVessel(vessel) ? 'enemy' : 'player'),
      location:  { x: poi.center?.x ?? 0, y: poi.center?.y ?? 0 },
    });
    const ts = window.KOSMOS?.timeSystem;
    if (ts?._triggerAutoSlow) {
      try { ts._triggerAutoSlow(t('log.autoSlowPicketAlert')); } catch (e) { /* noop */ }
    }
    return { ok: true };
  }

  /**
   * Lookup runtime state per poiId (devtools).
   */
  getPOIRuntimeState(poiId) {
    const poiReg = this.poiRegistry ?? window.KOSMOS?.poiRegistry;
    if (!poiReg) return null;
    const poi = poiReg.getPOI(poiId);
    if (!poi) return null;
    return {
      type:           poi.type,
      triggered:      poi.triggered ?? false,
      cooldownEndsAt: poi.cooldownEndsAt ?? null,
      complete:       poi.complete ?? false,
      currentMembers: poi.currentMembers ?? 0,
      completedYear:  poi.completedYear ?? null,
    };
  }
}

export default POIRuntimeSystem;
