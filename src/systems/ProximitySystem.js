// ProximitySystem — per-tick detection zbliżeń vessel↔vessel (M2a).
//
// Scaffold (Commit 2): tylko konstruktor + pusty _tick + destroy.
// Detection logic + hysteresis + budget → Commit 3 (§7 design doc).
//
// Feature flag: GAME_CONFIG.FEATURES.proximitySystem — lazy init w GameScene.
//
// Tick wywoływany synchronicznie z VesselManager._tick (PRZED MovementOrderSystem._tick),
// dzięki czemu kolejność jest deterministyczna: proximity → combat (event) →
// vessel:wrecked → MOS._onVesselWrecked → MOS._tick. Zob. master doc §5.
//
// API (public):
//   _tick(civDy)         — iteracja par vessel, emit proximityEnter/Exit (commit 3)
//   destroy()            — cleanup
//   getProximityPairs()  — debug: lista aktywnych par

import { GAME_CONFIG } from '../config/GameConfig.js';

// Stałe — użyte w commit 3 detection logic.
//   PROXIMITY_DETECTION_AU (enter), PROXIMITY_EXIT_AU (exit, hysteresis +20%),
//   COMBAT_ENGAGEMENT_AU (próg dla VesselCombatSystem, commit 4),
//   MAX_PAIRS_PER_TICK (budget — pełne skanowanie w ~ceil(n²/2 / budget) ticków).
export const PROXIMITY_DETECTION_AU = 0.5;
export const PROXIMITY_EXIT_AU      = 0.6;
export const COMBAT_ENGAGEMENT_AU   = 0.15;
export const MAX_PAIRS_PER_TICK     = 500;

/**
 * Zwraca stabilny klucz pary vesseli — niezależny od kolejności (v1,v2) vs (v2,v1).
 * @param {string} idA
 * @param {string} idB
 * @returns {string}
 */
export function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

export class ProximitySystem {
  /**
   * @param {import('./VesselManager.js').VesselManager} vesselManager
   */
  constructor(vesselManager) {
    this._vm = vesselManager;
    /** @type {Set<string>} aktywne pary (obecnie w zasięgu proximity) */
    this._activePairs = new Set();
    /** @type {number} offset do rotacji iteracji w _tick (budget handling) */
    this._iterationOffset = 0;
  }

  /**
   * Per-tick detection. No-op scaffold — logika w Commit 3.
   * @param {number} civDy — civDeltaYears
   */
  _tick(_civDy) {
    // Commit 2 scaffold: no-op. Detection + hysteresis + budget w Commit 3.
    if (!GAME_CONFIG.FEATURES?.proximitySystem) return;
    // NOTE(commit 3): iteracja par z budżetem MAX_PAIRS_PER_TICK + emit events.
  }

  destroy() {
    this._activePairs.clear();
    this._iterationOffset = 0;
  }

  /**
   * Debug: lista aktywnych par proximity.
   * @returns {string[][]}
   */
  getProximityPairs() {
    return [...this._activePairs].map(k => k.split('|'));
  }
}
