// DeepSpaceCombatSystem (DSCS) — per-tick deep-space combat (M4 P3).
//
// Zastępuje instant resolve VesselCombatSystem._resolveEngagement (BattleSystem)
// dla starć w przestrzeni między vessel'ami. BattleSystem zostaje używany dla:
//   - orbital combat (EnemyAttackHandler.planet defense)
//   - abstract empire fleet combat (WarSystem._fleetArrived gdy
//     unifiedAggregator skipuje materialized fleet)
//
// Wpięcie:
//   VesselCombatSystem._handleCombatRangeEnter → gdy FEATURES.m4DeepSpaceCombat
//     → window.KOSMOS.deepSpaceCombatSystem.handleCombatRangeEnter(...)
//   VesselManager._tick → po _tickEndurance, przed MovementOrderSystem._tick
//     → window.KOSMOS.deepSpaceCombatSystem._tick(civDy)
//
// Encounter state:
//   _activeEncounters: Map<encounterId, EncounterState>
//   EncounterState:
//     { id, sideA: {vesselIds[], ownerEmpireId, label, joinedVesselIds[]},
//       sideB: {...},
//       vesselStates: Map<vesselId, {hp, hpStart, shieldHP, shieldHPStart,
//                                    armor, evasion, weapons[], joinedAtRound}>,
//       location: {systemId, planetId:null, point:{x,y}},
//       startYear, currentRound, timeline[], isActive }
//
// P3-2 SKOPE (skeleton):
//   - handleCombatRangeEnter dispatch (startEngagement | _joinEncounter)
//   - startEngagement: team-up gather (kopia VCS), build EncounterState,
//     stationary AI dla enemy vesseli
//   - _joinEncounter: mid-combat reinforcement (Opcja B)
//   - _tickEncounter: STUB — increment currentRound, brak fire exchange
//   - _finalizeBattle: pełna semantyka — per-vessel wreck always +
//     side-level wreck żywych przegranych + emit battle:resolved
//
// P3-3 doda:  per-tick fire exchange, weapon cooldowns, damage application,
//             engage target priority (Opcja D), shield regen, _checkEndConditions
// P3-4 doda:  end-condition retreat threshold, combatRangeExit draw
// P3-8 doda:  serialize/restore (deepSpaceEngagements persist)

import EventBus from '../core/EventBus.js';
import gameState from '../core/GameState.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { COMBAT_ENGAGEMENT_AU } from './ProximitySystem.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

// Bufor team-up gather wokół midpoint spotkania (kopia z VCS).
const TEAMUP_BUFFER_FACTOR = 1.5;

// Limit rund per encounter — safety cap. P3-4 dodaje time-out semantykę.
export const MAX_ROUNDS = 30;

// Próg retreat: gdy aggregate HP strony spadnie ≤ tej frakcji startowej
// (z reinforcement) → strona retreat. P3-4 logika.
export const RETREAT_THRESHOLD = 0.2;

// Deterministyczny PRNG (kopia z BattleSystem — nie eksportowane).
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DeepSpaceCombatSystem {
  /**
   * @param {import('./VesselManager.js').VesselManager} vesselManager
   */
  constructor(vesselManager) {
    this._vm = vesselManager;
    /** @type {Map<string, EncounterState>} */
    this._activeEncounters = new Map();

    // combatRangeExit subskrypcja — P3-4 implementuje draw na rozejście stron.
    this._onCombatRangeExit = (e) => this._handleCombatRangeExit(e);
    EventBus.on('vessel:combatRangeExit', this._onCombatRangeExit);
  }

  destroy() {
    EventBus.off('vessel:combatRangeExit', this._onCombatRangeExit);
    this._activeEncounters.clear();
  }

  // ── Public API (wołane z VesselCombatSystem) ─────────────────────────

  /**
   * Wejście do DSCS — dispatch między startEngagement (nowy encounter)
   * a _joinEncounter (reinforcement do istniejącego).
   *
   * @param {string} v1Id
   * @param {string} v2Id
   * @param {boolean} sameFaction — gdy true, ignorujemy (M2a semantics)
   */
  handleCombatRangeEnter(v1Id, v2Id, sameFaction) {
    if (sameFaction) return;
    const vm = this._vm;
    if (!vm) return;
    const v1 = vm._vessels?.get(v1Id);
    const v2 = vm._vessels?.get(v2Id);
    if (!v1 || !v2 || v1.isWreck || v2.isWreck) return;

    const existing1 = this._findActiveEncounterContaining(v1Id);
    const existing2 = this._findActiveEncounterContaining(v2Id);

    // Oba w tym samym encounter — nic do roboty (już walczą).
    if (existing1 && existing1 === existing2) return;

    // Jeden w encounter, drugi nie — drugi dołącza jako reinforcement.
    if (existing1 && !existing2) { this._joinEncounter(existing1, v2Id); return; }
    if (existing2 && !existing1) { this._joinEncounter(existing2, v1Id); return; }

    // Oba w różnych encounterach — w P3 nie łączymy encounter'ów (edge case).
    // Pierwszy wygrywa: drugi vessel nie dołącza. P5 może to rozwiązać.
    if (existing1 && existing2) return;

    // Żaden w combat — startuj nowy encounter.
    this.startEngagement(v1Id, v2Id);
  }

  // ── Encounter lifecycle ──────────────────────────────────────────────

  /**
   * Stwórz nowy encounter. Team-up gather wokół midpoint (kopia VCS), build
   * EncounterState z per-vessel stanami, stationary AI dla enemy vesseli.
   *
   * @returns {EncounterState|null}
   */
  startEngagement(v1Id, v2Id) {
    const vm = this._vm;
    if (!vm) return null;
    const v1 = vm._vessels?.get(v1Id);
    const v2 = vm._vessels?.get(v2Id);
    if (!v1 || !v2 || v1.isWreck || v2.isWreck) return null;
    if (!_inCombatState(v1) || !_inCombatState(v2)) return null;

    // Midpoint spotkania — używany do wreck placement + cinematic location.
    const mid = {
      x: (v1.position.x + v2.position.x) / 2,
      y: (v1.position.y + v2.position.y) / 2,
    };

    // Team-up gather: vessele w buforze COMBAT_ENGAGEMENT_AU × 1.5 od mid.
    // Identyczna logika jak VCS._resolveEngagement (kopia 1:1, P3 §Architecture).
    const nearby = [];
    const bufferPx = COMBAT_ENGAGEMENT_AU * TEAMUP_BUFFER_FACTOR * AU_TO_PX;
    for (const v of vm._vessels.values()) {
      if (v.isWreck) continue;
      if (!_inCombatState(v)) continue;
      const dx = v.position.x - mid.x;
      const dy = v.position.y - mid.y;
      if (Math.hypot(dx, dy) <= bufferPx) nearby.push(v);
    }
    if (nearby.length < 2) return null;

    // Grupuj wg ownerEmpireId.
    const groups = new Map();
    for (const v of nearby) {
      const owner = _resolveOwner(v);
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push(v);
    }
    if (groups.size < 2) return null;

    // M2a/P3: tylko player ↔ empire. Empire↔empire = M5.
    const playerGroup = groups.get('player');
    if (!playerGroup || playerGroup.length === 0) return null;

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
    if (!bestEmpireId || !bestGroup) return null;

    return this._createEncounter(playerGroup, bestGroup, mid, 'player', bestEmpireId);
  }

  /**
   * Buduj EncounterState i dodaj do _activeEncounters.
   * @private
   */
  _createEncounter(sideAVessels, sideBVessels, mid, ownerA, ownerB) {
    const year = this._year();
    const id = this._makeEncounterId(year, ownerA, ownerB);

    // Per-vessel state (nie aggregate jak BattleSystem) — P3-3 wymienia damage
    // per pair (vessel attacker → vessel target).
    const vesselStates = new Map();
    for (const v of sideAVessels) vesselStates.set(v.id, this._buildVesselState(v));
    for (const v of sideBVessels) vesselStates.set(v.id, this._buildVesselState(v));

    const empireB = window.KOSMOS?.empireRegistry?.get?.(ownerB);
    const labelA = sideAVessels.length > 1
      ? `Gracz (${sideAVessels.length})`
      : `Gracz — ${sideAVessels[0].name ?? sideAVessels[0].shipId}`;
    const labelB = sideBVessels.length > 1
      ? `${empireB?.name ?? 'Wróg'} (${sideBVessels.length})`
      : `${empireB?.name ?? 'Wróg'} — ${sideBVessels[0].name ?? sideBVessels[0].shipId}`;

    const systemId = sideAVessels[0]?.systemId ?? sideBVessels[0]?.systemId ?? 'sys_home';

    /** @type {EncounterState} */
    const encounter = {
      id,
      sideA: {
        vesselIds:        sideAVessels.map(v => v.id),
        joinedVesselIds:  [],
        ownerEmpireId:    ownerA,
        label:            labelA,
      },
      sideB: {
        vesselIds:        sideBVessels.map(v => v.id),
        joinedVesselIds:  [],
        ownerEmpireId:    ownerB,
        label:            labelB,
      },
      vesselStates,
      location:           { systemId, planetId: null, point: { x: mid.x, y: mid.y } },
      startYear:          year,
      currentRound:       0,
      currentYear:        year,
      timeline:           [],
      isActive:           true,
      seedBase:           (Math.floor(year * 10000) * 7919) & 0x7FFFFFFF,
    };

    this._activeEncounters.set(id, encounter);

    // Stationary AI: enemy vessele zatrzymane na pozycji wejścia w combat.
    // Player vessele zachowują obecne movement orders (engage/pursue itp.).
    for (const v of sideBVessels) this._freezeAsStationary(v);

    EventBus.emit('vessel:engaged', {
      encounterId:   id,
      sideA:         sideAVessels.map(v => v.id),
      sideB:         sideBVessels.map(v => v.id),
      location:      encounter.location,
    });

    return encounter;
  }

  /**
   * Reinforcement — vessel dołącza do istniejącego encounter mid-combat.
   * Opcja B: aggregate hpStart strony się powiększa → próg retreat raised
   * proporcjonalnie (więcej siły = więcej buffera).
   *
   * @private
   */
  _joinEncounter(encounter, newVesselId) {
    const vm = this._vm;
    const v = vm?._vessels?.get(newVesselId);
    if (!v || v.isWreck) return;

    // Skip jeśli już w encounter.
    if (encounter.vesselStates.has(newVesselId)) return;

    const owner = _resolveOwner(v);
    let side;
    if (owner === 'player' && encounter.sideA.ownerEmpireId === 'player') {
      side = encounter.sideA;
    } else if (owner === encounter.sideB.ownerEmpireId) {
      side = encounter.sideB;
    } else {
      // Inny empire niż istniejące strony — P3 ignore (P5 multi-empire battles).
      return;
    }

    // Build vessel state z markerem joinedAtRound (>0 = reinforcement).
    const state = this._buildVesselState(v);
    state.joinedAtRound = encounter.currentRound;
    encounter.vesselStates.set(newVesselId, state);
    side.joinedVesselIds.push(newVesselId);

    // Stationary AI dla wroga.
    if (side === encounter.sideB) this._freezeAsStationary(v);

    // Append join event do timeline (na bieżącej rundzie).
    const round = this._ensureTimelineRound(encounter);
    round.joinEvents.push({
      vesselId:       newVesselId,
      side:           side === encounter.sideA ? 'A' : 'B',
      ownerEmpireId:  owner,
    });

    EventBus.emit('vessel:joinedCombat', {
      vesselId:     newVesselId,
      encounterId:  encounter.id,
      side:         side === encounter.sideA ? 'A' : 'B',
    });
  }

  // ── Tick loop ─────────────────────────────────────────────────────────

  /**
   * Per-frame tick wszystkich active encounters. Wołane z VesselManager._tick.
   * @param {number} civDy — civDeltaYears
   */
  _tick(civDy) {
    if (civDy <= 0) return;
    for (const encounter of this._activeEncounters.values()) {
      if (!encounter.isActive) continue;
      this._tickEncounter(encounter, civDy);
    }
    // Cleanup zakończonych encounter'ów po zakończeniu pętli.
    for (const [id, enc] of this._activeEncounters) {
      if (!enc.isActive) this._activeEncounters.delete(id);
    }
  }

  /**
   * Tick pojedynczego encounter (P3-3 pełna logika).
   *
   * Sekwencja:
   *   1. currentRound++, currentYear += civDy
   *   2. Per side, per vessel (alive only), per weapon:
   *      a. Decrement weapon.cooldownYearsRemaining (skip fire jeśli > 0)
   *      b. Resolve effectiveRangeAU (rangeAU × tech mult)
   *      c. Find target — Opcja D engage priority:
   *         - Player z movementOrder.type='engage' i engageTargetId żywy,
   *           w przeciwnej stronie, w zasięgu → target = engageTarget
   *         - Else: closest live enemy
   *      d. Skip jeśli dist > effectiveRangeAU
   *      e. Roll hit (tracking × (1 - evasion)) — rng < hitChance
   *      f. Apply damage (shield absorb → armor reduce → hp)
   *      g. Reset weapon cooldown
   *      h. Append timeline event
   *   3. Shield regen per alive vessel (shieldRegen × civDy)
   *   4. _checkEndConditions → _finalizeBattle (P3-4 doda retreat threshold)
   *
   * Damage roll PRNG seed: encounter.seedBase + currentRound (deterministyczne).
   *
   * @private
   */
  _tickEncounter(encounter, civDy) {
    encounter.currentRound++;
    encounter.currentYear = encounter.startYear + encounter.currentRound * civDy;

    const round = this._ensureTimelineRound(encounter);
    const rng = mulberry32(encounter.seedBase + encounter.currentRound);

    // Średnia odległość między stronami (dla timeline distanceAU).
    const distSamples = [];

    // Strony i ich ownerEmpireId — używane do tech-mult lookup i target picking.
    const sideAVids = [...encounter.sideA.vesselIds, ...encounter.sideA.joinedVesselIds];
    const sideBVids = [...encounter.sideB.vesselIds, ...encounter.sideB.joinedVesselIds];

    const fireFromSide = (attackerVids, defenderVids, attackerOwner) => {
      for (const aid of attackerVids) {
        const aState = encounter.vesselStates.get(aid);
        if (!aState || aState.hp <= 0) continue;
        const aVessel = this._vm?._vessels?.get(aid);
        if (!aVessel) continue;

        for (const weapon of aState.weapons) {
          // Cooldown decrement (per-tick — civDy * 1 = jeden "tick year unit").
          if (weapon.cooldownYearsRemaining > 0) {
            weapon.cooldownYearsRemaining = Math.max(0, weapon.cooldownYearsRemaining - civDy);
            continue;
          }

          const effectiveRangeAU = this._resolveWeaponRange(weapon, attackerOwner);

          // Find target — Opcja D engage priority dla player, closest fallback.
          const target = this._pickTarget(aVessel, aState, defenderVids, encounter, effectiveRangeAU);
          if (!target) continue;
          const { vesselId: tid, distanceAU } = target;
          const tState = encounter.vesselStates.get(tid);
          if (!tState) continue;

          distSamples.push(distanceAU);

          // Range gating.
          if (distanceAU > effectiveRangeAU) continue;

          // Roll hit.
          // tracking mult (kategoria) tylko dla player; empire bez tech P3.
          let effectiveTracking = weapon.tracking;
          if (attackerOwner === 'player') {
            const techSys = window.KOSMOS?.techSystem;
            if (techSys?.getMultiplier) {
              effectiveTracking *= techSys.getMultiplier(`weapon_tracking_${weapon.category}`);
            }
          }
          const hitChance = Math.max(0.05, Math.min(0.95, effectiveTracking * (1 - tState.evasion)));
          const hit = rng() < hitChance;

          if (!hit) {
            round.events.push({
              attacker: aid, target: tid, weapon: weapon.moduleId,
              hit: false, damage: 0, blockedByShield: 0,
              distanceAU,
            });
            // Cooldown reset też przy miss — broń strzeliła, czas naładowania reszta.
            weapon.cooldownYearsRemaining = weapon.fireCooldownYears;
            continue;
          }

          // Apply damage: shield absorb → armor reduce → hp.
          let damage = weapon.damage;
          let blockedByShield = 0;
          if (tState.shieldHP > 0) {
            blockedByShield = Math.min(tState.shieldHP, damage);
            tState.shieldHP -= blockedByShield;
            damage -= blockedByShield;
          }
          if (damage > 0) {
            // Armor reduction (− armor × 0.4 z minimum 1 — BattleSystem-like).
            // armorPierce redukuje effective armor.
            const effectiveArmor = Math.max(0, tState.armor - (weapon.armorPierce ?? 0));
            const armorReduction = effectiveArmor * 0.4;
            const netDamage = Math.max(1, damage - armorReduction);
            tState.hp -= netDamage;
            damage = netDamage;
          } else {
            damage = 0;
          }

          round.events.push({
            attacker: aid, target: tid, weapon: weapon.moduleId,
            hit: true, damage, blockedByShield, distanceAU,
          });

          weapon.cooldownYearsRemaining = weapon.fireCooldownYears;
        }
      }
    };

    // Fire from sideA → sideB i odwrotnie.
    fireFromSide(sideAVids, sideBVids, encounter.sideA.ownerEmpireId);
    fireFromSide(sideBVids, sideAVids, encounter.sideB.ownerEmpireId);

    // Shield regen (alive vessels).
    for (const state of encounter.vesselStates.values()) {
      if (state.hp <= 0) continue;
      if (state.shieldRegen > 0 && state.shieldHP < state.shieldHPStart) {
        state.shieldHP = Math.min(state.shieldHPStart, state.shieldHP + state.shieldRegen * civDy);
      }
    }

    // Średnia distance dla timeline.
    if (distSamples.length > 0) {
      round.distanceAU = distSamples.reduce((s, d) => s + d, 0) / distSamples.length;
    }

    const endResult = this._checkEndConditions(encounter);
    if (endResult) this._finalizeBattle(encounter, endResult.winner, endResult.retreated);
  }

  /**
   * Sprawdź czy encounter się kończy.
   *   - sideA all hp ≤ 0 → winner='B', retreated=null (kill)
   *   - sideB all hp ≤ 0 → winner='A', retreated=null (kill)
   *   - sideA aggregate hp ≤ RETREAT_THRESHOLD × sideAggregateHpStart AND
   *     niższe % niż sideB → retreat='A', winner='B'
   *   - sideB analogicznie → retreat='B', winner='A'
   *   - currentRound ≥ MAX_ROUNDS → time-out, highest aggregate HP wins
   *
   * Aggregate hpStart liczone dynamicznie (zawiera reinforcement joinedVesselIds)
   * — większa strona z reinforcement ma więcej buffera przed retreat (gameplay
   * positive: gracz chce żeby reinforcement pomagał).
   *
   * @private
   * @returns {{winner: 'A'|'B'|null, retreated: 'A'|'B'|null}|null}
   */
  _checkEndConditions(encounter) {
    const sideAVids = [...encounter.sideA.vesselIds, ...encounter.sideA.joinedVesselIds];
    const sideBVids = [...encounter.sideB.vesselIds, ...encounter.sideB.joinedVesselIds];

    const aliveA = sideAVids.filter(vid => (encounter.vesselStates.get(vid)?.hp ?? 0) > 0).length;
    const aliveB = sideBVids.filter(vid => (encounter.vesselStates.get(vid)?.hp ?? 0) > 0).length;

    // Hard kill conditions (priorytet — bez retreat option).
    if (aliveA === 0 && aliveB === 0) return { winner: null, retreated: null };
    if (aliveA === 0)                  return { winner: 'B',  retreated: null };
    if (aliveB === 0)                  return { winner: 'A',  retreated: null };

    // Retreat threshold dynamic (Opcja B — z reinforcement).
    const hpStartA = this._sideAggregateHpStart(encounter, 'A');
    const hpStartB = this._sideAggregateHpStart(encounter, 'B');
    const hpA = this._sumHP(encounter, 'A');
    const hpB = this._sumHP(encounter, 'B');
    const pctA = hpStartA > 0 ? hpA / hpStartA : 1.0;
    const pctB = hpStartB > 0 ? hpB / hpStartB : 1.0;

    // Strona poniżej progu I niżej procentowo niż przeciwnik → retreat.
    // Brak retreat gdy obie strony równo pod progiem (kontynuują walkę aż jedna padnie).
    if (pctA <= RETREAT_THRESHOLD && pctA < pctB) return { winner: 'B', retreated: 'A' };
    if (pctB <= RETREAT_THRESHOLD && pctB < pctA) return { winner: 'A', retreated: 'B' };

    // Time-out.
    if (encounter.currentRound >= MAX_ROUNDS) {
      const winner = hpA > hpB ? 'A' : hpB > hpA ? 'B' : null;
      return { winner, retreated: null };
    }

    return null;
  }

  /**
   * Suma hpStart vesseli strony (initial + joined reinforcement).
   * Używane do dynamicznego retreat threshold (Opcja B).
   *
   * @private
   */
  _sideAggregateHpStart(encounter, sideKey) {
    const side = sideKey === 'A' ? encounter.sideA : encounter.sideB;
    let sum = 0;
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const state = encounter.vesselStates.get(vid);
      if (state) sum += state.hpStart;
    }
    return sum;
  }

  /**
   * Target selection — Opcja D engage priority dla player + closest fallback.
   *
   * @private
   * @returns {{vesselId: string, distanceAU: number}|null}
   */
  _pickTarget(attackerVessel, attackerState, defenderVids, encounter, effectiveRangeAU) {
    const ax = attackerVessel.position.x;
    const ay = attackerVessel.position.y;

    // Player engage priority — jeśli vessel ma movementOrder.type='engage'
    // z engageTargetId, target jest w przeciwnej stronie i w zasięgu, prioritize.
    const order = attackerVessel.movementOrder;
    if (order?.type === 'engage' && order.targetEntityId) {
      const eid = order.targetEntityId;
      if (defenderVids.includes(eid)) {
        const tState = encounter.vesselStates.get(eid);
        const tVessel = this._vm?._vessels?.get(eid);
        if (tState && tState.hp > 0 && tVessel) {
          const dx = (tVessel.position.x - ax) / AU_TO_PX;
          const dy = (tVessel.position.y - ay) / AU_TO_PX;
          const distAU = Math.hypot(dx, dy);
          if (distAU <= effectiveRangeAU) {
            return { vesselId: eid, distanceAU: distAU };
          }
          // engage target poza zasięgiem — fallback closest.
        }
      }
    }

    // Closest live enemy fallback.
    let bestId = null;
    let bestDistAU = Infinity;
    for (const did of defenderVids) {
      const dState = encounter.vesselStates.get(did);
      if (!dState || dState.hp <= 0) continue;
      const dVessel = this._vm?._vessels?.get(did);
      if (!dVessel) continue;
      const dx = (dVessel.position.x - ax) / AU_TO_PX;
      const dy = (dVessel.position.y - ay) / AU_TO_PX;
      const distAU = Math.hypot(dx, dy);
      if (distAU < bestDistAU) {
        bestDistAU = distAU;
        bestId = did;
      }
    }
    if (bestId == null) return null;
    return { vesselId: bestId, distanceAU: bestDistAU };
  }

  /**
   * Combat range exit handler (P3-4).
   *
   * Gdy para vesseli rozłączyła się (dist ≥ COMBAT_EXIT_AU=0.20, hysteresis
   * proximity), sprawdź czy któryś z nich jest w aktywnym encounter. Jeśli tak:
   *   - Oblicz min/max dystans midpoint → vessele każdej strony (alive only)
   *   - Jeśli wszyscy żywi vessele jednej strony oddalili się > COMBAT_DISENGAGE_AU
   *     (0.50) od midpoint → finalize as draw (no wreck żywych)
   *   - Edge case: tylko niektóre vessele rozeszły się → kontynuuj z resztą
   *
   * @private
   */
  _handleCombatRangeExit({ vesselAId, vesselBId }) {
    if (!vesselAId || !vesselBId) return;
    const encA = this._findActiveEncounterContaining(vesselAId);
    const encB = this._findActiveEncounterContaining(vesselBId);
    const enc = encA ?? encB;
    if (!enc || !enc.isActive) return;
    // Para musi być w tym samym encounter (event dotyczy ich wspólnej combat sytuacji).
    if (encA && encB && encA !== encB) return;

    const mid = enc.location.point;
    const disengagePx = GAME_CONFIG.COMBAT_DISENGAGE_AU * AU_TO_PX;

    const sideAVids = [...enc.sideA.vesselIds, ...enc.sideA.joinedVesselIds];
    const sideBVids = [...enc.sideB.vesselIds, ...enc.sideB.joinedVesselIds];

    const allOutsideOf = (vids) => {
      let aliveCount = 0;
      let outsideCount = 0;
      for (const vid of vids) {
        const state = enc.vesselStates.get(vid);
        if (!state || state.hp <= 0) continue;
        const v = this._vm?._vessels?.get(vid);
        if (!v) continue;
        aliveCount++;
        const dx = v.position.x - mid.x;
        const dy = v.position.y - mid.y;
        if (Math.hypot(dx, dy) > disengagePx) outsideCount++;
      }
      // Wszyscy żywi rozeszli się (i co najmniej jeden żywy istnieje).
      return aliveCount > 0 && aliveCount === outsideCount;
    };

    if (allOutsideOf(sideAVids) || allOutsideOf(sideBVids)) {
      // Draw — żywi vessele pozostają (no wreck side-level). Dead per-vessel
      // wreck już zaaplikowane w _finalizeBattle.
      this._finalizeBattle(enc, null, null);
    }
  }

  // ── Finalize battle ──────────────────────────────────────────────────

  /**
   * Zakończ encounter z winner/retreated. Pełna semantyka P3-2:
   *   - Build BattleRecord (id, year, location, winner, retreated,
   *     participantA/B, timeline, lossesA/B, finalHPA/B, seed)
   *   - Per-vessel wreck pass (always): wszystkie vesselStates z hp ≤ 0 → wreck
   *     przez EnemyAttackHandler._turnIntoWreck(v, midpoint, year)
   *   - Side-level wreck żywych przegranych (tylko gdy retreated == null):
   *     żywi vessele z sideX (losing side) → wreck
   *   - Retreat outcome (retreated == 'A'|'B'): żywi pozostają — AutoRetreatSystem
   *     nasłuchuje battle:resolved i wydaje moveToPoint do friendly planety
   *   - gameState.set('battles.<id>', battleRec) + emit battle:resolved
   *   - encounter.isActive = false (cleanup w next _tick)
   *
   * @param {EncounterState} encounter
   * @param {'A'|'B'|null} winner — null = draw
   * @param {'A'|'B'|null} retreated — który ucieka (żywi pozostają)
   */
  _finalizeBattle(encounter, winner, retreated) {
    if (!encounter.isActive) return;

    const year = this._year();
    const mid = encounter.location.point;

    // Build BattleRecord (kompatybilny z VCS._applyOutcome payload).
    const lossesA = this._countLosses(encounter, 'A');
    const lossesB = this._countLosses(encounter, 'B');
    const finalHPA = this._sumHP(encounter, 'A');
    const finalHPB = this._sumHP(encounter, 'B');

    const battleId = encounter.id.replace(/^encounter_/, 'battle_ds_');
    const battleRec = {
      id:            battleId,
      warId:         null,
      year,
      location:      encounter.location,
      winner,
      retreated,
      seed:          encounter.seedBase,
      timeline:      encounter.timeline,
      lossesA,
      lossesB,
      finalHPA,
      finalHPB,
      participantA: {
        type:      'vessel_group',
        empireId:  encounter.sideA.ownerEmpireId,
        vesselIds: [...encounter.sideA.vesselIds, ...encounter.sideA.joinedVesselIds],
        count:     encounter.sideA.vesselIds.length + encounter.sideA.joinedVesselIds.length,
        label:     encounter.sideA.label,
      },
      participantB: {
        type:      'vessel_group',
        empireId:  encounter.sideB.ownerEmpireId,
        vesselIds: [...encounter.sideB.vesselIds, ...encounter.sideB.joinedVesselIds],
        count:     encounter.sideB.vesselIds.length + encounter.sideB.joinedVesselIds.length,
        label:     encounter.sideB.label,
      },
    };

    // Per-vessel wreck pass (always — dead vessel z każdej strony).
    for (const [vid, state] of encounter.vesselStates) {
      if (state.hp <= 0) {
        const vessel = this._vm?._vessels?.get(vid);
        if (vessel && !vessel.isWreck) this._wreckOne(vessel, mid, year);
      }
    }

    // Side-level wreck żywych przegranych (tylko brak retreat).
    if (retreated == null && winner != null) {
      const losingSide = winner === 'A' ? encounter.sideB : encounter.sideA;
      for (const vid of [...losingSide.vesselIds, ...losingSide.joinedVesselIds]) {
        const state = encounter.vesselStates.get(vid);
        if (!state || state.hp <= 0) continue;
        const vessel = this._vm?._vessels?.get(vid);
        if (vessel && !vessel.isWreck) this._wreckOne(vessel, mid, year);
      }
    }
    // Retreat: żywi vessele retreatującej strony pozostają — AutoRetreatSystem
    // nasłuchuje battle:resolved i wydaje moveToPoint do najbliższej friendly planety.

    gameState.set?.(`battles.${battleId}`, battleRec, 'deep_space_combat');
    EventBus.emit('battle:resolved', { warId: null, battleId, result: battleRec });

    encounter.isActive = false;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Buduj per-vessel state z hull + modules. Per-vessel (nie aggregate)
   * bo P3-3 wymienia damage per pair.
   *
   * @private
   * @returns {VesselState}
   */
  _buildVesselState(v) {
    const hull = HULLS?.[v.hullId] ?? HULLS?.[v.shipId];
    let hp = hull?.baseHP ?? 50;
    let armor = hull?.baseArmor ?? 0;
    let shieldHP = 0;
    let shieldRegen = 0;
    const weapons = [];
    const evasion = hull?.baseEvasion ?? 0.1;

    for (const modId of v.modules ?? []) {
      const mod = SHIP_MODULES?.[modId];
      if (!mod?.stats) continue;
      if (mod.stats.hpBonus)      hp += mod.stats.hpBonus;
      if (mod.stats.armorRating)  armor += mod.stats.armorRating;
      if (mod.stats.shieldHP)     shieldHP += mod.stats.shieldHP;
      if (mod.stats.shieldRegen)  shieldRegen += mod.stats.shieldRegen;
      if (mod.stats.damage != null) {
        weapons.push({
          moduleId:               modId,
          damage:                 mod.stats.damage,
          tracking:               mod.stats.tracking ?? 0.7,
          armorPierce:            mod.stats.armorPierce ?? 0,
          // M4 P3: deep-space-specific
          rangeAU:                mod.stats.rangeAU ?? this._fallbackRangeAU(mod.stats.range ?? mod.stats.category),
          category:               mod.stats.category ?? mod.stats.range ?? 'medium',
          fireCooldownYears:      mod.stats.fireCooldownYears ?? 0.5,
          cooldownYearsRemaining: 0,
        });
      }
    }

    return {
      hp:            Math.max(1, hp),
      hpStart:       Math.max(1, hp),
      shieldHP,
      shieldHPStart: shieldHP,
      shieldRegen,
      armor,
      evasion,
      weapons,
      joinedAtRound: 0,
    };
  }

  /**
   * Fallback gdy module nie ma rangeAU — z legacy string range/category.
   * Używa GameConfig WEAPON_*_AU stałych.
   *
   * @private
   */
  _fallbackRangeAU(category) {
    if (category === 'short')  return GAME_CONFIG.WEAPON_SHORT_AU;
    if (category === 'long')   return GAME_CONFIG.WEAPON_LONG_AU;
    return GAME_CONFIG.WEAPON_MED_AU;
  }

  /**
   * Effective weapon range (AU) z mnożnikami tech (kategoria + all).
   * Wołane z _tickEncounter w P3-3.
   *
   * @param {{rangeAU: number, category: string}} weapon
   * @param {string} ownerEmpireId — 'player' używa TechSystem; empire bez tech w P3.
   * @returns {number}
   */
  _resolveWeaponRange(weapon, ownerEmpireId) {
    const baseAU = weapon.rangeAU ?? this._fallbackRangeAU(weapon.category);
    let mult = 1.0;
    if (ownerEmpireId === 'player') {
      const techSys = window.KOSMOS?.techSystem;
      if (techSys?.getMultiplier) {
        mult *= techSys.getMultiplier(`weapon_range_${weapon.category}`);
        mult *= techSys.getMultiplier('weapon_range_all');
      }
    }
    // Empire tech state — P5 doda. W P3 zostaje mult=1.0 dla wrogów.
    return baseAU * mult;
  }

  /**
   * Stationary AI: zatrzymaj enemy vessela na pozycji wejścia w combat.
   * Mission=null (brak waypoint pursuit), state='orbiting' (no in_transit drift).
   *
   * @private
   */
  _freezeAsStationary(vessel) {
    if (!vessel) return;
    vessel.mission = null;
    if (vessel.position) vessel.position.state = 'orbiting';
  }

  /**
   * Wreck delegation — preferuje EnemyAttackHandler._turnIntoWreck (rozszerzony
   * kontrakt z M2a). Fallback inline gwarantuje stabilność headless.
   *
   * @private
   */
  _wreckOne(vessel, mid, year) {
    if (!vessel || vessel.isWreck) return;
    const handler = window.KOSMOS?.enemyAttackHandler;
    if (handler?._turnIntoWreck) {
      handler._turnIntoWreck(vessel, mid, year);
      return;
    }
    vessel.isWreck  = true;
    vessel.status   = 'destroyed';
    vessel.mission  = null;
    vessel.wreckedAt = year;
    if (vessel.position) {
      vessel.position.state    = 'orbiting';
      vessel.position.dockedAt = null;
      vessel.position.x = mid.x;
      vessel.position.y = mid.y;
    }
    vessel.wreckLocation = { x: mid.x, y: mid.y };
    if (vessel.fuel) vessel.fuel.current = 0;
    EventBus.emit('vessel:wrecked', { vesselId: vessel.id, vessel });
  }

  /** @private */
  _findActiveEncounterContaining(vesselId) {
    for (const enc of this._activeEncounters.values()) {
      if (!enc.isActive) continue;
      if (enc.vesselStates.has(vesselId)) return enc;
    }
    return null;
  }

  /** @private */
  _ensureTimelineRound(encounter) {
    const r = encounter.currentRound;
    let entry = encounter.timeline.find(t => t.round === r);
    if (!entry) {
      entry = { round: r, year: encounter.currentYear ?? encounter.startYear,
                distanceAU: 0, events: [], joinEvents: [] };
      encounter.timeline.push(entry);
    }
    return entry;
  }

  /** @private */
  _countLosses(encounter, sideKey) {
    const side = sideKey === 'A' ? encounter.sideA : encounter.sideB;
    let losses = 0;
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const state = encounter.vesselStates.get(vid);
      if (state && state.hp <= 0) losses++;
    }
    return losses;
  }

  /** @private */
  _sumHP(encounter, sideKey) {
    const side = sideKey === 'A' ? encounter.sideA : encounter.sideB;
    let sum = 0;
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const state = encounter.vesselStates.get(vid);
      if (state) sum += Math.max(0, state.hp);
    }
    return sum;
  }

  /** @private */
  _year() {
    return window.KOSMOS?.timeSystem?.gameTime ?? 0;
  }

  /** @private */
  _makeEncounterId(year, ownerA, ownerB) {
    const yr = Number(year).toFixed(2).replace(/\./g, '_');
    return `encounter_${yr}_${ownerA}_${ownerB}`;
  }

  // ── Public debug/test API ────────────────────────────────────────────

  /**
   * Wymuszone zakończenie encountera (devtools / test). Z parametrami
   * winner='A'|'B'|null i retreated='A'|'B'|null.
   */
  forceFinalize(encounterId, winner = null, retreated = null) {
    const enc = this._activeEncounters.get(encounterId);
    if (!enc) return null;
    this._finalizeBattle(enc, winner, retreated);
    return enc;
  }

  /** Lista aktywnych encounter'ów (devtools). */
  listActive() {
    return [...this._activeEncounters.values()].filter(e => e.isActive);
  }

  // ── Serialization (P3-8 — save v71) ─────────────────────────────────

  /**
   * Round-trip _activeEncounters do obiektu JSON-serializable.
   * vesselStates Map → object (klucze=vesselId, wartości=state).
   * Tylko isActive=true (zakończone encounters cleanup'owane w _tick).
   *
   * @returns {object} keyed by encounterId
   */
  serialize() {
    const out = {};
    for (const [id, enc] of this._activeEncounters) {
      if (!enc.isActive) continue;
      const vesselStatesObj = {};
      for (const [vid, state] of enc.vesselStates) {
        vesselStatesObj[vid] = { ...state, weapons: state.weapons.map(w => ({ ...w })) };
      }
      out[id] = {
        id:              enc.id,
        sideA:           { ...enc.sideA, vesselIds: [...enc.sideA.vesselIds], joinedVesselIds: [...enc.sideA.joinedVesselIds] },
        sideB:           { ...enc.sideB, vesselIds: [...enc.sideB.vesselIds], joinedVesselIds: [...enc.sideB.joinedVesselIds] },
        vesselStates:    vesselStatesObj,
        location:        { ...enc.location, point: { ...enc.location.point } },
        startYear:       enc.startYear,
        currentRound:    enc.currentRound,
        currentYear:     enc.currentYear,
        timeline:        enc.timeline.map(t => ({
          ...t,
          events:     [...(t.events ?? [])],
          joinEvents: [...(t.joinEvents ?? [])],
        })),
        isActive:        enc.isActive,
        seedBase:        enc.seedBase,
      };
    }
    return out;
  }

  /**
   * Restore _activeEncounters z save. Pomija encounter'y bez participantów
   * (np. wszystkie vessele wreck przy save — defensive).
   *
   * @param {object} data — keyed by encounterId
   */
  restore(data) {
    if (!data || typeof data !== 'object') return;
    for (const [id, enc] of Object.entries(data)) {
      if (!enc || !enc.isActive) continue;
      const vesselStates = new Map();
      for (const [vid, state] of Object.entries(enc.vesselStates ?? {})) {
        // Filter — vessel musi istnieć w vesselManager (wreck w międzyczasie
        // wycięty z save). Skip jeśli brak.
        if (!this._vm?._vessels?.has?.(vid)) continue;
        vesselStates.set(vid, { ...state, weapons: (state.weapons ?? []).map(w => ({ ...w })) });
      }
      if (vesselStates.size < 2) continue;  // brak walczących stron
      this._activeEncounters.set(id, {
        id:              enc.id ?? id,
        sideA:           enc.sideA ?? { vesselIds: [], joinedVesselIds: [], ownerEmpireId: 'player', label: 'Gracz' },
        sideB:           enc.sideB ?? { vesselIds: [], joinedVesselIds: [], ownerEmpireId: 'empire_unknown', label: 'Wróg' },
        vesselStates,
        location:        enc.location ?? { systemId: 'sys_home', planetId: null, point: { x: 0, y: 0 } },
        startYear:       enc.startYear ?? 0,
        currentRound:    enc.currentRound ?? 0,
        currentYear:     enc.currentYear ?? enc.startYear ?? 0,
        timeline:        Array.isArray(enc.timeline) ? enc.timeline : [],
        isActive:        true,
        seedBase:        enc.seedBase ?? 0,
      });
    }
  }
}

// ── Module helpers (kopia z VesselCombatSystem dla symetrii) ───────────

function _inCombatState(v) {
  const st = v.position?.state;
  if (st === 'in_transit') return true;
  if (st === 'orbiting') return true;
  return false;
}

function _resolveOwner(v) {
  if (v.ownerEmpireId && v.ownerEmpireId !== 'player') return v.ownerEmpireId;
  if (v.owner && v.owner !== 'player') return v.owner;
  if (v.isEnemy) return v.ownerEmpireId ?? v.owner ?? 'unknown_empire';
  return 'player';
}
