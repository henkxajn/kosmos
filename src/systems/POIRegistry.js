// M2b — POIRegistry (Commit 5)
//
// CRUD per-type dla POI (Point of Interest) — strategiczne lokacje w przestrzeni
// (waypoint/patrol/picket/rally/ambush). Schema w POITypes.js, validatePOISpec.
//
// Architektura: zero-arg constructor (jak IntelSystem), dostęp do innych systemów
// przez `window.KOSMOS?.X` lookup wewnątrz metod. Stan w `gameState.pois` (top-level
// subdomena reactive store, init w `initPOISubdomain()` po `gameState.reset()`).
//
// Lekcja L2 z M2b C2 fix #2: init `gameState.pois` MUSI być w `initPOISubdomain()`
// wywoływanym z GameScene/GameCore PO `gameState.reset()/restore()`. Constructor
// init zostanie wymieciony.
//
// Events:
//   poi:created       { poi }                     — pełny obiekt POI
//   poi:updated       { poiId, poi: merged }      — po merge changes
//   poi:deleted       { poiId, name }             — name capture PRZED delete (D1)
//   poi:vesselReached { vesselId, poiId }         — emit-only placeholder, runtime w C6/M3

import EventBus               from '../core/EventBus.js';
import gameState              from '../core/GameState.js';
import { GAME_CONFIG }        from '../config/GameConfig.js';
import { validatePOISpec, POI_SOFT_CAP } from '../data/POITypes.js';

export class POIRegistry {
  constructor() {
    this._nextId = 1;
    // Init gameState.pois w initPOISubdomain() — patrz L2 z M2b C2 fix #2
    // (constructor wymiatany przez gameState.reset() w GameScene.start)
  }

  /**
   * Init POI sub-domain. Wywoływane z GameScene/GameCore PO gameState.reset()/restore().
   * Idempotentne — nie nadpisuje istniejących POI z restore'a, reconstruct _nextId z max(id).
   */
  initPOISubdomain() {
    const existing = gameState.get('pois');
    if (!existing) {
      gameState.set('pois', {}, 'm2b_poi_init');
    }
    // Reconstruct _nextId z istniejących POI po load (poi_47 → _nextId=48)
    const all = gameState.get('pois') ?? {};
    let maxId = 0;
    for (const id of Object.keys(all)) {
      const m = id.match(/^poi_(\d+)$/);
      if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
    }
    this._nextId = maxId + 1;
  }

  /**
   * @param {object} spec — patrz POITypes.validatePOISpec
   * @returns {{ok: true, poiId: string} | {ok: false, reason: string}}
   */
  createPOI(spec) {
    if (!GAME_CONFIG.FEATURES.poiSystem) return { ok: false, reason: 'feature_disabled' };

    const validation = validatePOISpec(spec);
    if (!validation.ok) return { ok: false, reason: validation.reason };

    const poiId = `poi_${this._nextId++}`;
    const poi = {
      id:            poiId,
      type:          spec.type,
      name:          spec.name,
      ownerEmpireId: spec.ownerEmpireId ?? 'player',
      createdYear:   window.KOSMOS?.timeSystem?.gameTime ?? 0,
      ...this._extractTypeFields(spec),
    };

    const pois = gameState.get('pois') ?? {};
    const updated = { ...pois, [poiId]: poi };
    gameState.set('pois', updated, 'poi_created');

    // Soft cap warning (hard limit brak w M2b)
    if (Object.keys(updated).length > POI_SOFT_CAP) {
      console.warn(`[POIRegistry] POI count exceeded soft cap ${POI_SOFT_CAP} (current: ${Object.keys(updated).length})`);
    }

    EventBus.emit('poi:created', { poi });
    return { ok: true, poiId };
  }

  /**
   * Update istniejącego POI. Typ jest immutable (zmiana typu wymaga delete + create).
   * @returns {{ok: true} | {ok: false, reason: string}}
   */
  updatePOI(poiId, changes) {
    if (!GAME_CONFIG.FEATURES.poiSystem) return { ok: false, reason: 'feature_disabled' };

    const pois = gameState.get('pois') ?? {};
    const existing = pois[poiId];
    if (!existing) return { ok: false, reason: 'poi_not_found' };

    if (changes.type && changes.type !== existing.type) {
      return { ok: false, reason: 'type_immutable' };
    }
    const merged = { ...existing, ...changes, type: existing.type, id: poiId };
    const validation = validatePOISpec(merged);
    if (!validation.ok) return { ok: false, reason: validation.reason };

    const updated = { ...pois, [poiId]: merged };
    gameState.set('pois', updated, 'poi_updated');

    EventBus.emit('poi:updated', { poiId, poi: merged });
    return { ok: true };
  }

  /**
   * Delete POI. D1: payload zawiera `name` (capture PRZED mutation) dla EventLog.
   * @returns {{ok: true} | {ok: false, reason: string}}
   */
  deletePOI(poiId) {
    if (!GAME_CONFIG.FEATURES.poiSystem) return { ok: false, reason: 'feature_disabled' };

    const pois = gameState.get('pois') ?? {};
    const poi = pois[poiId];
    if (!poi) return { ok: false, reason: 'poi_not_found' };

    const name = poi.name;  // capture PRZED mutation — subscriber EventLog potrzebuje
    const updated = { ...pois };
    delete updated[poiId];
    gameState.set('pois', updated, 'poi_deleted');

    EventBus.emit('poi:deleted', { poiId, name });
    return { ok: true };
  }

  getPOI(poiId) {
    return gameState.get('pois')?.[poiId] ?? null;
  }

  listPOIs(filter) {
    const pois = gameState.get('pois') ?? {};
    const all = Object.values(pois);
    if (!filter) return all;
    if (filter.type) return all.filter(p => p.type === filter.type);
    if (filter.ownerEmpireId) return all.filter(p => p.ownerEmpireId === filter.ownerEmpireId);
    return all;
  }

  listByType(type) {
    return this.listPOIs({ type });
  }

  /**
   * Internal trigger — wołane z MovementOrderSystem._tickGoToPOI (Commit 6) gdy vessel
   * dotrze do POI. W C5 emit-only (placeholder — rally tracker logic to C6/M3).
   */
  vesselReachedPOI(vesselId, poiId) {
    EventBus.emit('poi:vesselReached', { vesselId, poiId });
  }

  _extractTypeFields(spec) {
    switch (spec.type) {
      case 'waypoint': return { point: spec.point };
      case 'patrol':   return { waypoints: spec.waypoints, loopMode: spec.loopMode };
      case 'picket':   return {
        center: spec.center,
        rangePxLocal: spec.rangePxLocal,
        alertOnEmpireIds: spec.alertOnEmpireIds ?? null,
      };
      case 'rally':    return {
        center: spec.center,
        waitForCount: spec.waitForCount,
        memberVesselIds: [],
      };
      case 'ambush':   return {
        center: spec.center,
        rangePxLocal: spec.rangePxLocal,
        triggerOnEmpireIds: spec.triggerOnEmpireIds ?? null,
        hidden: spec.hidden,
      };
    }
    return {};
  }
}
