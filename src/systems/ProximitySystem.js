// ProximitySystem — per-tick detection zbliżeń vessel↔vessel (M2a + M2b).
//
// Algorytm: O(n²/2) par z rotującym offsetem + budżet MAX_PAIRS_PER_TICK.
// Przy 100 vesseli pełne skanowanie zajmuje ~ceil(4950/500)=10 ticków.
//
// Dwa progi (M2b Commit 0, §11.5 dług z M2a):
//   Detection: enter <0.5 AU, exit ≥0.6 AU (hysteresis) — event proximityEnter/Exit.
//   Combat:    enter <0.15 AU, exit ≥0.20 AU (hysteresis) — event combatRangeEnter/Exit.
// VesselCombatSystem subskrybuje combatRangeEnter (nie filtruje po distanceAU).
// IntelSystem (M2b) subskrybuje proximityEnter dla observed contact upgrade.
//
// Feature flag: GAME_CONFIG.FEATURES.proximitySystem — lazy init w GameScene.
//
// Tick wywoływany synchronicznie z VesselManager._tick (PRZED MovementOrderSystem._tick),
// dzięki czemu kolejność jest deterministyczna: proximity → combat (event) →
// vessel:wrecked → MOS._onVesselWrecked → MOS._tick. Zob. master doc §5.
//
// Eventy:
//   vessel:proximityEnter    { vesselAId, vesselBId, distanceAU, sameFaction }
//   vessel:proximityExit     { vesselAId, vesselBId }
//   vessel:combatRangeEnter  { vesselAId, vesselBId, distanceAU, sameFaction }
//   vessel:combatRangeExit   { vesselAId, vesselBId }
//
// Flag sameFaction: true gdy ownerEmpireId obu pasuje. ProximitySystem NIE
// filtruje same-faction — emituje zawsze. Subscriber (VesselCombatSystem,
// IntelSystem) sam decyduje co z tym zrobić. Rozdzielenie odpowiedzialności
// ułatwia przyszłe use-cases (rally accumulation, escort hand-off).

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

// Stałe — użyte w detection + combat logic.
//   PROXIMITY_DETECTION_AU (enter), PROXIMITY_EXIT_AU (exit, hysteresis +20%),
//   COMBAT_ENGAGEMENT_AU  (enter combat, dla VesselCombatSystem),
//   COMBAT_EXIT_AU        (exit combat, hysteresis +33% vs engagement),
//   MAX_PAIRS_PER_TICK    (budget — pełne skanowanie w ~ceil(n²/2 / budget) ticków).
//
// M4 P3-7: PROXIMITY_DETECTION_AU staje się base value. Per-vessel próg
// dynamic via _getDetectionRangeAU (player z TechSystem.getMultiplier('sensor_range');
// empire bez tech → base). Hysteresis ratio (×1.2) zachowany. Combat range
// pozostaje hardcoded — to fizyczne ograniczenie engagement, nie sensora.
export const PROXIMITY_DETECTION_AU = 0.5;
export const PROXIMITY_EXIT_AU      = 0.6;
export const COMBAT_ENGAGEMENT_AU   = 0.15;
export const COMBAT_EXIT_AU         = 0.20;
export const MAX_PAIRS_PER_TICK     = 500;

// M4 P3-7: hysteresis ratio enter→exit dla dynamic detection.
const DETECTION_HYSTERESIS = 1.2;

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

/**
 * Zwraca stabilny klucz pary vesseli — niezależny od kolejności (v1,v2) vs (v2,v1).
 * @param {string} idA
 * @param {string} idB
 * @returns {string}
 */
export function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

/**
 * Czy vessel nadaje się do proximity check (nie wrak + ma poprawną pozycję).
 * @param {object} v
 * @returns {boolean}
 */
function _isValidForProximity(v) {
  if (!v || v.isWreck) return false;
  const p = v.position;
  if (!p) return false;
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return false;
  if (!isFinite(p.x) || !isFinite(p.y)) return false;
  return true;
}

export class ProximitySystem {
  /**
   * @param {import('./VesselManager.js').VesselManager} vesselManager
   */
  constructor(vesselManager) {
    this._vm = vesselManager;
    /** @type {Set<string>} aktywne pary (obecnie w zasięgu proximity detection <0.5 AU) */
    this._activePairs = new Set();
    /** @type {Set<string>} aktywne pary w combat range (<0.15 AU) */
    this._activeCombatPairs = new Set();
    /** @type {number} offset do rotacji iteracji w _tick (budget handling) */
    this._iterationOffset = 0;

    // Cleanup aktywnych par gdy którykolwiek vessel ginie — zapobiega
    // false-positive przy reuse vessel ID w przyszłości.
    this._onVesselWrecked = (e) => this._handleVesselWrecked(e);
    EventBus.on('vessel:wrecked', this._onVesselWrecked);
  }

  /**
   * Per-tick detection proximity z budget rotation.
   * @param {number} civDy — civDeltaYears
   */
  _tick(civDy) {
    if (!GAME_CONFIG.FEATURES?.proximitySystem) return;
    if (!civDy || civDy <= 0) return;
    if (!this._vm?._vessels?.size) return;

    const vessels = [];
    for (const v of this._vm._vessels.values()) {
      if (_isValidForProximity(v)) vessels.push(v);
    }
    const n = vessels.length;
    if (n < 2) return;

    const maxPairs = MAX_PAIRS_PER_TICK;
    let checked = 0;
    const startIdx = n > 0 ? (this._iterationOffset % n) : 0;

    // Faza 1: od startIdx do końca
    for (let i = startIdx; checked < maxPairs && i < n; i++) {
      for (let j = i + 1; checked < maxPairs && j < n; j++) {
        this._checkPair(vessels[i], vessels[j]);
        checked++;
      }
    }
    // Faza 2: wrap-around od 0 do startIdx, gdy budget wystarczy
    for (let i = 0; checked < maxPairs && i < startIdx; i++) {
      for (let j = i + 1; checked < maxPairs && j < n; j++) {
        this._checkPair(vessels[i], vessels[j]);
        checked++;
      }
    }

    // Rotacja offsetu — gwarantuje progres nawet gdy budget < total pairs.
    //   Cap przez n*n (odpowiednik "całego cyklu par") dla stabilności.
    this._iterationOffset = (this._iterationOffset + checked) % Math.max(1, n * n);
  }

  /**
   * Sprawdź parę vesseli — oblicz dystans, porównaj z hysteresis,
   * emit enter/exit jeśli przekraczamy próg.
   * @param {object} v1
   * @param {object} v2
   */
  _checkPair(v1, v2) {
    const key = pairKey(v1.id, v2.id);
    const dx = v1.position.x - v2.position.x;
    const dy = v1.position.y - v2.position.y;
    const distPx = Math.hypot(dx, dy);
    const distAU = distPx / AU_TO_PX;
    const isPaired = this._activePairs.has(key);

    // M4 P3-7 — dynamic detection threshold per vessel pair. Wygrywa większy
    // sensor (np. player ze zbadanym advanced_sensors_2 wykrywa z 0.75 AU;
    // empire bez tech sees go z 0.5 AU; pair entry threshold = 0.75 AU).
    const enterAU = Math.max(this._getDetectionRangeAU(v1), this._getDetectionRangeAU(v2));
    const exitAU  = enterAU * DETECTION_HYSTERESIS;

    if (!isPaired && distAU < enterAU) {
      this._activePairs.add(key);
      const sameFaction = (v1.ownerEmpireId ?? null) === (v2.ownerEmpireId ?? null);
      EventBus.emit('vessel:proximityEnter', {
        vesselAId:  v1.id,
        vesselBId:  v2.id,
        distanceAU: distAU,
        sameFaction,
      });
    } else if (isPaired && distAU >= exitAU) {
      this._activePairs.delete(key);
      EventBus.emit('vessel:proximityExit', {
        vesselAId: v1.id,
        vesselBId: v2.id,
      });
    }
    // W pasie hysteresis (enterAU .. exitAU) — no-op dla spójności.

    // Drugi próg: combat range (hysteresis 0.15 / 0.20 AU).
    const isCombat = this._activeCombatPairs.has(key);
    if (!isCombat && distAU < COMBAT_ENGAGEMENT_AU) {
      this._activeCombatPairs.add(key);
      const sameFaction = (v1.ownerEmpireId ?? null) === (v2.ownerEmpireId ?? null);
      EventBus.emit('vessel:combatRangeEnter', {
        vesselAId:  v1.id,
        vesselBId:  v2.id,
        distanceAU: distAU,
        sameFaction,
      });
    } else if (isCombat && distAU >= COMBAT_EXIT_AU) {
      this._activeCombatPairs.delete(key);
      EventBus.emit('vessel:combatRangeExit', {
        vesselAId: v1.id,
        vesselBId: v2.id,
      });
    }
  }

  /**
   * M4 P3-7 — dynamic detection range per vessel.
   *
   * Player vessel: BASE × TechSystem.getMultiplier('sensor_range'). Empire
   * vessel: BASE × 1.0 (empire tech state nie jest yet trackowany w grze;
   * P5 doda EmpireTechState i empire-specific multipliers).
   *
   * Fallback gdy techSystem niedostępny → BASE (sensowny default).
   *
   * @private
   * @param {object} vessel
   * @returns {number} detection range w AU
   */
  _getDetectionRangeAU(vessel) {
    const isPlayer = (vessel.ownerEmpireId == null || vessel.ownerEmpireId === 'player');
    if (!isPlayer) return PROXIMITY_DETECTION_AU;
    const techSys = window.KOSMOS?.techSystem;
    if (!techSys?.getMultiplier) return PROXIMITY_DETECTION_AU;
    return PROXIMITY_DETECTION_AU * techSys.getMultiplier('sensor_range');
  }

  /**
   * Cleanup aktywnych par (detection + combat) po wreckowaniu vessela.
   * Zapobiega false-positive gdy ID zostaje reużyte (teoretyczne future-proof).
   * NIE emitujemy proximityExit/combatRangeExit — wreck to terminal state;
   * konsumenci (VesselCombatSystem, IntelSystem M2b) słuchają vessel:wrecked osobno.
   * @param {{vesselId: string}} e
   */
  _handleVesselWrecked({ vesselId }) {
    if (!vesselId) return;
    if (this._activePairs.size === 0 && this._activeCombatPairs.size === 0) return;
    const prefix1 = `${vesselId}|`;
    const suffix1 = `|${vesselId}`;
    for (const key of [...this._activePairs]) {
      if (key.startsWith(prefix1) || key.endsWith(suffix1)) {
        this._activePairs.delete(key);
      }
    }
    for (const key of [...this._activeCombatPairs]) {
      if (key.startsWith(prefix1) || key.endsWith(suffix1)) {
        this._activeCombatPairs.delete(key);
      }
    }
  }

  destroy() {
    EventBus.off('vessel:wrecked', this._onVesselWrecked);
    this._activePairs.clear();
    this._activeCombatPairs.clear();
    this._iterationOffset = 0;
  }

  /**
   * Debug: lista aktywnych par proximity (detection <0.5 AU).
   * @returns {string[][]}
   */
  getProximityPairs() {
    return [...this._activePairs].map(k => k.split('|'));
  }

  /**
   * Debug: lista aktywnych par w combat range (<0.15 AU).
   * @returns {string[][]}
   */
  getCombatPairs() {
    return [...this._activeCombatPairs].map(k => k.split('|'));
  }

  /**
   * Lista other-vessel IDs które mają aktywną parę proximity (detection <0.5 AU)
   * z podanym vesselem. Używane przez IntelSystem (M2b) do multi-observer check
   * w _onVesselProximityExit — jeśli inny player vessel nadal obserwuje cel,
   * positionKnown nie jest resetowane.
   * @param {string} vesselId
   * @returns {string[]}
   */
  getActivePairsFor(vesselId) {
    const out = [];
    for (const key of this._activePairs) {
      const [a, b] = key.split('|');
      if (a === vesselId) out.push(b);
      else if (b === vesselId) out.push(a);
    }
    return out;
  }
}
