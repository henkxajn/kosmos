// VesselCombatSystem — deep-space combat vessel↔vessel (M2a + M2b Commit 0).
//
// Event-driven (bez własnego _tick). Nasłuchuje vessel:combatRangeEnter
// z ProximitySystem (próg <0.15 AU, hysteresis 0.20). Gdy sameFaction === false
// i cooldown minął — triggeruje bitwę.
//
// M2b Commit 0 (§11.5): zastąpienie M2a hookov'ow na vessel:proximityEnter
// i vessel:orderCompleted (tymczasowe rozwiązanie z commit 23270dd). Dzięki
// dedykowanemu eventowi combatRangeEnter VCS działa jednolicie dla wszystkich
// scenariuszy ruchu (pursue, intercept, patrol, escort, drift in-transit).
//
// Flow:
//   combatRangeEnter
//     → sameFaction bail
//     → cooldown check (ENGAGEMENT_COOLDOWN_YEARS=2)
//     → _resolveEngagement (team-up by ownerEmpireId, w M2a: tylko player ↔ empire)
//     → BattleSystem.resolveBattle(sideA, sideB, {location: {systemId, planetId: null, point: mid}})
//     → _applyOutcome:
//         winner=A, !retreated → wreck sideB
//         winner=B, !retreated → wreck sideA
//         draw                 → wreck oba
//         retreated=X          → X żyje; AutoRetreatSystem (commit 7) wyda moveToPoint order
//     → gameState.set('battles.<id>', battleRec)
//     → emit 'battle:resolved' { warId: null, battleId, result }
//
// M2a NIE obejmuje: empire↔empire combat (wymaga hostility matrix między
// obcymi imperiami, M3); full cinematic BattleView3D dla deep-space (reuse
// generic); bidirectional materialize/dematerialize reconciliation.
//
// Wreck placement w deep-space: delegacja do EnemyAttackHandler._turnIntoWreck
// (commit 5 rozszerzył kontrakt o {x,y} deep-space path). Fallback inline
// gwarantuje stabilność w testach headless.

import EventBus from '../core/EventBus.js';
import gameState from '../core/GameState.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { resolveBattle, playerVesselsToBattleUnit } from './BattleSystem.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { COMBAT_ENGAGEMENT_AU, pairKey } from './ProximitySystem.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

// Cooldown — para po starciu nie triggeruje combat przez N civYears.
// M4 P1 post-playtest #2 (C): skrócone z 2 → 1 civYear. Cooldown działa teraz
// głównie jako anti-flicker last-resort dla par stale stłoczonych — fresh
// engagement po prawdziwym disengage uzyskany przez reset na combatRangeExit (B).
export const ENGAGEMENT_COOLDOWN_YEARS = 1;

export class VesselCombatSystem {
  /**
   * @param {import('./VesselManager.js').VesselManager} vesselManager
   */
  constructor(vesselManager) {
    this._vm = vesselManager;
    /** @type {Map<string, number>} pairKey → lastEngagedYear */
    this._recentlyEngaged = new Map();

    this._onCombatRangeEnter = (e) => this._handleCombatRangeEnter(e);
    EventBus.on('vessel:combatRangeEnter', this._onCombatRangeEnter);

    // M4 P1 post-playtest #2 (B) — reset cooldown gdy vessele rozłączają się
    // po combat (dist ≥ 0.20 AU exit threshold). Cooldown działa teraz głównie
    // jako anti-flicker dla par stale stłoczonych; po prawdziwym disengage
    // (retreat lub manewr) fresh engagement możliwy bez czekania.
    this._onCombatRangeExit = (e) => this._handleCombatRangeExit(e);
    EventBus.on('vessel:combatRangeExit', this._onCombatRangeExit);

    // P3 polish (2026-05-20) — reset cooldown po finalize encountera. Bez tego
    // przy retreat enemy, gdy player engage order CONTINUES i dist nigdy nie
    // przekroczy combatExitAU, combatRangeExit się nie emit'uje → cooldown
    // blokuje restart → player kite hover bez walki przez 1 civYear.
    this._onBattleResolved = (e) => this._handleBattleResolved(e);
    EventBus.on('battle:resolved', this._onBattleResolved);
  }

  destroy() {
    EventBus.off('vessel:combatRangeEnter', this._onCombatRangeEnter);
    EventBus.off('vessel:combatRangeExit', this._onCombatRangeExit);
    EventBus.off('battle:resolved', this._onBattleResolved);
    this._recentlyEngaged.clear();
  }

  /**
   * P3 polish — battle finalize → wyczyść cooldown dla par participantA × participantB.
   * Po legitimate end-of-combat gracz/AI może natychmiast podjąć nową walkę
   * (np. enemy retreat → player engage order chase'uje → restart combat).
   * @private
   */
  _handleBattleResolved({ result }) {
    if (!result?.participantA?.vesselIds || !result?.participantB?.vesselIds) return;
    const aIds = result.participantA.vesselIds;
    const bIds = result.participantB.vesselIds;
    for (const a of aIds) {
      for (const b of bIds) {
        this._recentlyEngaged.delete(pairKey(a, b));
      }
    }
  }

  // ── Event handling ────────────────────────────────────────────────────

  /**
   * M2b Commit 0: combatRangeEnter → deep-space engage.
   *
   * Event gwarantuje że dystans <COMBAT_ENGAGEMENT_AU (0.15) w momencie
   * emit. Nie filtrujemy po distanceAU; event przychodzi raz per pair
   * (hysteresis 0.15/0.20 w ProximitySystem).
   *
   * Filter chain:
   *   1. !FEATURES.vesselCombat         → return
   *   2. sameFaction                    → return
   *   3. cooldown (ENGAGEMENT_COOLDOWN_YEARS=2) → return
   *   4. engage (reuse _resolveEngagement)
   */
  _handleCombatRangeEnter({ vesselAId, vesselBId, sameFaction }) {
    if (!GAME_CONFIG.FEATURES?.vesselCombat) return;
    if (sameFaction) return;

    const now = this._year();
    const key = pairKey(vesselAId, vesselBId);
    const last = this._recentlyEngaged.get(key);

    // P3 polish — bypass cooldown gdy któryś vessel ma aktywny engage order
    // targetujący drugiego (player intent). Cooldown istnieje żeby chronić
    // przed flicker'em dla par "przypadkowo" stale w combat range; gdy gracz
    // explicit'ie ŚCIGA cel rozkazem engage, restart combat musi być natychmiastowy.
    const playerIntentOverride = this._hasEngageIntentBetween(vesselAId, vesselBId);

    if (!playerIntentOverride && last != null && (now - last) < ENGAGEMENT_COOLDOWN_YEARS) return;

    this._recentlyEngaged.set(key, now);

    // M4 P3: gdy FEATURES.m4DeepSpaceCombat ON → deleguj do DeepSpaceCombatSystem
    // (per-tick simulation zamiast instant resolve). Flag OFF = M2a/M4 P2 behavior
    // (instant BattleSystem.resolveBattle). Bezpieczny rollback dla regresji.
    if (GAME_CONFIG.FEATURES?.m4DeepSpaceCombat) {
      const dscs = window.KOSMOS?.deepSpaceCombatSystem;
      if (dscs?.handleCombatRangeEnter) {
        dscs.handleCombatRangeEnter(vesselAId, vesselBId, sameFaction);
        return;
      }
      // Flag ON ale system nieinstancjonowany — log + fallback do instant path.
      // (Defensywne; production path: GameScene._ensureDeepSpaceCombatSystem
      // jest wołany przy starcie sceny gdy flag ON.)
      console.warn('[VCS] m4DeepSpaceCombat=true ale brak deepSpaceCombatSystem — fallback do instant resolve');
    }

    this._resolveEngagement(vesselAId, vesselBId);
  }

  /**
   * M4 P1 post-playtest #2 (B) — reset cooldown gdy para vesseli rozłącza się
   * (dist ≥ COMBAT_EXIT_AU = 0.20 AU). Po prawdziwym disengage gracz może
   * ponownie atakować ten sam target bez czekania na ENGAGEMENT_COOLDOWN_YEARS.
   * Cooldown chroni tylko przed flicker'em gdy vessele zostają stale w combat
   * range po niekonkluzywnej bitwie.
   */
  /**
   * Czy któryś z dwóch vesseli ma aktywny engage order targetujący drugiego.
   * @private
   */
  _hasEngageIntentBetween(idA, idB) {
    const vm = this._vm;
    const vA = vm?._vessels?.get?.(idA);
    const vB = vm?._vessels?.get?.(idB);
    const oA = vA?.movementOrder;
    const oB = vB?.movementOrder;
    if (oA?.type === 'engage' && oA.targetEntityId === idB) return true;
    if (oB?.type === 'engage' && oB.targetEntityId === idA) return true;
    return false;
  }

  _handleCombatRangeExit({ vesselAId, vesselBId }) {
    if (!GAME_CONFIG.FEATURES?.vesselCombat) return;
    const key = pairKey(vesselAId, vesselBId);
    this._recentlyEngaged.delete(key);
  }

  // ── Team-up + battle resolve ─────────────────────────────────────────

  /**
   * Zbierz vessele wokół punktu spotkania, pogrupuj wg ownerEmpireId.
   * W M2a wybiera tylko pary player↔empire o najwyższej hostility.
   */
  _resolveEngagement(v1Id, v2Id) {
    const vm = this._vm;
    if (!vm) return;
    const v1 = vm._vessels?.get(v1Id);
    const v2 = vm._vessels?.get(v2Id);
    if (!v1 || !v2 || v1.isWreck || v2.isWreck) return;
    if (!_inCombatState(v1) || !_inCombatState(v2)) return;

    // Midpoint spotkania — używany do wreck placement + cinematic location.
    const mid = {
      x: (v1.position.x + v2.position.x) / 2,
      y: (v1.position.y + v2.position.y) / 2,
    };

    // Zbierz vessele w buforze COMBAT_ENGAGEMENT_AU * 1.5 od mid — team-up logic.
    const nearby = [];
    const bufferPx = COMBAT_ENGAGEMENT_AU * 1.5 * AU_TO_PX;
    for (const v of vm._vessels.values()) {
      if (v.isWreck) continue;
      if (!_inCombatState(v)) continue;
      const dx = v.position.x - mid.x;
      const dy = v.position.y - mid.y;
      if (Math.hypot(dx, dy) <= bufferPx) nearby.push(v);
    }
    if (nearby.length < 2) return;

    // Grupuj wg ownerEmpireId (null/undefined → 'player').
    const groups = new Map();
    for (const v of nearby) {
      const owner = _resolveOwner(v);
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push(v);
    }
    if (groups.size < 2) return;

    // M2a: tylko player ↔ empire. Empire↔empire → M3.
    const playerGroup = groups.get('player');
    if (!playerGroup || playerGroup.length === 0) return;

    let bestEmpireId = null;
    let bestHostility = -1;
    let bestGroup = null;
    const dipl = window.KOSMOS?.diplomacySystem;
    for (const [ownerId, group] of groups) {
      if (ownerId === 'player') continue;
      if (!group || group.length === 0) continue;
      const hostility = dipl?.getHostility?.(ownerId) ?? 50;
      if (hostility > bestHostility) {
        bestHostility = hostility;
        bestEmpireId = ownerId;
        bestGroup = group;
      }
    }
    if (!bestEmpireId || !bestGroup) return;

    this._battle(playerGroup, bestGroup, mid, 'player', bestEmpireId);
  }

  _battle(sideA, sideB, mid, ownerA, ownerB) {
    const empireB = window.KOSMOS?.empireRegistry?.get?.(ownerB);
    const systemId = sideA[0]?.systemId ?? sideB[0]?.systemId ?? 'sys_home';
    const location = { systemId, planetId: null, point: { x: mid.x, y: mid.y } };

    const labelA = sideA.length > 1 ? `Gracz (${sideA.length})` : `Gracz — ${sideA[0].name ?? sideA[0].shipId}`;
    const labelB = sideB.length > 1
      ? `${empireB?.name ?? 'Wróg'} (${sideB.length})`
      : `${empireB?.name ?? 'Wróg'} — ${sideB[0].name ?? sideB[0].shipId}`;

    const unitA = playerVesselsToBattleUnit(sideA, HULLS, SHIP_MODULES, labelA);
    const unitB = playerVesselsToBattleUnit(sideB, HULLS, SHIP_MODULES, labelB);

    // Seed deterministyczny — year × prime + hash uczestników.
    const year = this._year();
    const seedBase = (Math.floor(year * 10000) * 7919) & 0x7FFFFFFF;
    const seed = (seedBase + sideA.length * 113 + sideB.length * 127) & 0x7FFFFFFF;

    const result = resolveBattle(unitA, unitB, {
      casusBelli: 'border_incident',
      location,
      seed,
    });

    this._applyOutcome(sideA, sideB, result, location, ownerA, ownerB, year);
  }

  _applyOutcome(sideA, sideB, result, location, ownerA, ownerB, year) {
    const mid = location.point;
    const { winner, retreated } = result;

    // Wreck strony przegrywającej (nie-retreated).
    if (!retreated) {
      if (winner === 'A')       this._wreckGroup(sideB, mid, year);
      else if (winner === 'B')  this._wreckGroup(sideA, mid, year);
      else                       { this._wreckGroup(sideA, mid, year); this._wreckGroup(sideB, mid, year); }
    }
    // retreated: side X żyje. AutoRetreatSystem (commit 7) nasłuchuje battle:resolved.

    const battleId = this._makeBattleId(year, ownerA, ownerB);
    const battleRec = {
      ...result,
      id:    battleId,
      warId: null,
      year,
      location,
      participantA: {
        type:      'vessel_group',
        empireId:  ownerA,
        vesselIds: sideA.map(v => v.id),
        count:     sideA.length,
        label:     `Gracz (${sideA.length})`,
      },
      participantB: {
        type:      'vessel_group',
        empireId:  ownerB,
        vesselIds: sideB.map(v => v.id),
        count:     sideB.length,
        label:     window.KOSMOS?.empireRegistry?.get?.(ownerB)?.name ?? ownerB,
      },
    };
    gameState.set(`battles.${battleId}`, battleRec, 'deep_space_combat');
    EventBus.emit('battle:resolved', { warId: null, battleId, result: battleRec });

    // M4 P1 post-playtest #2 (A) — DROP team-up smearing. Cooldown ustawiamy
    // tylko dla triggering pair (już zrobione w _handleCombatRangeEnter).
    // Poprzednio: po team-up bitwie cooldown smarowany na wszystkie pary
    // sideA × sideB — vessele które nie strzelały też dostawały cooldown,
    // przez co pursue na innego wroga z grupy nie wywoływał combat. Anti-spam
    // w tym samym ticku obsługuje teraz B (reset on exit) + zwykły cooldown
    // (1 civYear) tylko dla triggering pair.
  }

  // ── Wreck placement — delegacja do EnemyAttackHandler._turnIntoWreck ──
  // Commit 5: _turnIntoWreck rozszerzony o deep-space {x,y} point path.
  // Fallback inline wreck (gdy handler nieosiągalny) gwarantuje stabilność
  // w testach headless.

  _wreckGroup(group, mid, year) {
    for (const v of group) this._wreckOne(v, mid, year);
  }

  _wreckOne(vessel, mid, year) {
    if (!vessel || vessel.isWreck) return;
    const handler = window.KOSMOS?.enemyAttackHandler;
    if (handler?._turnIntoWreck) {
      handler._turnIntoWreck(vessel, mid, year);
      return;
    }
    // Fallback (np. headless test bez pełnego GameScene). Zamraża pozycję
    // w punkcie zderzenia — identyczna semantyka jak deep-space path w EAH.
    vessel.isWreck  = true;
    vessel.status   = 'destroyed';
    vessel.mission  = null;
    vessel.wreckedAt = year;
    vessel.position.state    = 'orbiting';
    vessel.position.dockedAt = null;
    vessel.position.x = mid.x;
    vessel.position.y = mid.y;
    vessel.wreckLocation = { x: mid.x, y: mid.y };
    if (vessel.fuel) vessel.fuel.current = 0;
    EventBus.emit('vessel:wrecked', { vesselId: vessel.id, vessel });
  }

  // ── Public debug API ──────────────────────────────────────────────────

  /**
   * Force-resolve bitwę dwóch grup vesseli w punkcie location.point.
   * Używane przez KOSMOS.debug (commit 8) + test.
   */
  resolveDeepSpaceBattle(sideA, sideB, location) {
    if (!Array.isArray(sideA) || !Array.isArray(sideB)) return null;
    if (sideA.length === 0 || sideB.length === 0) return null;
    const mid = location?.point ?? {
      x: (sideA[0].position.x + sideB[0].position.x) / 2,
      y: (sideA[0].position.y + sideB[0].position.y) / 2,
    };
    const ownerA = _resolveOwner(sideA[0]);
    const ownerB = _resolveOwner(sideB[0]);
    this._battle(sideA, sideB, mid, ownerA, ownerB);
    return gameState.get(`battles.${this._makeBattleId(this._year(), ownerA, ownerB)}`) ?? null;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  _year() {
    return window.KOSMOS?.timeSystem?.gameTime ?? 0;
  }

  // TODO M3: battleId collision w tym samym ticku między tymi samymi stronami.
  // Currently mitigated by team-up cooldown (wszystkie pary w engagement →
  // cooldown po _applyOutcome, więc kolejny combatRangeEnter w tym ticku jest
  // odrzucany przez _handleCombatRangeEnter). Prawdziwy fix: counter/sequence
  // w _makeBattleId.
  _makeBattleId(year, ownerA, ownerB) {
    const yr = Number(year).toFixed(2).replace(/\./g, '_');
    return `battle_ds_${yr}_${ownerA}_${ownerB}`;
  }
}

// ── Module helpers ─────────────────────────────────────────────────────

/**
 * Vessel w stanie który pozwala na deep-space combat.
 * Fizycznie zadokowany (state='docked') nie walczy; in_transit lub orbiting = OK
 * niezależnie od dockedAt. M2b Commit 0 off-design z M2a §8.2: patrol/escort/
 * picket (§9.1) oraz Combat Sandbox spawnują wrogie vessele jako orbiting
 * z dockedAt='entity_X' (orbita ciała niebieskiego, nie hangar). M2a wymagał
 * dockedAt==null — blokowało auto-engage dla całego M2b scope.
 */
function _inCombatState(v) {
  const st = v.position?.state;
  if (st === 'in_transit') return true;
  if (st === 'orbiting') return true;
  return false;
}

/**
 * Owner ID vessela — 'player' dla własnych, empireId dla obcych.
 * Fallback na polach historycznych (isEnemy, owner).
 */
function _resolveOwner(v) {
  if (v.ownerEmpireId && v.ownerEmpireId !== 'player') return v.ownerEmpireId;
  if (v.owner && v.owner !== 'player') return v.owner;
  if (v.isEnemy) return v.ownerEmpireId ?? v.owner ?? 'unknown_empire';
  return 'player';
}
