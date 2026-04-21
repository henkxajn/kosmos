// CombatSystem — Victoria 2-style stack combat on hex grid
//
// Filozofia:
//   Pozycja jednostki = rozkaz. Gracz ustawia jednostki ruchem, bitwy rozstrzygają się
//   automatycznie. Stack-on-hex: wiele jednostek na jednym hexie bije się jednocześnie.
//   Brak przycisku ATAKUJ. Ranged unit z sąsiedniego hexu może wspierać wybraną bitwę.
//
// Architektura:
//   - tick() co 1 civYear znajduje "contested hexes" (hexy z jednostkami >1 właściciela)
//   - Dla każdego hexa: _runBattleRound() resolve simultaneous fire exchange
//   - Każdy atakujący wybiera cel przez priority picker (counter > support > low HP > closest)
//   - Terrain bonus dla obrońców (mountains +20%, forest +10%, itd.)
//   - Ranged units (range >= 2) z sąsiednich hexów dodają damage jeśli mają supportTarget
//
// Komunikacja (EventBus):
//   Emituje:
//     combat:round         → { planetId, q, r, round, playerLosses, enemyLosses }
//     combat:hexResolved   → { planetId, q, r, winnerId }
//     groundUnit:routed    → { unitId, fromQ, fromR, toQ, toR }

import EventBus from '../core/EventBus.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';
import { UNIT_ARCHETYPES } from '../data/unitArchetypes.js';
import { GroundUnitFactory } from './GroundUnitFactory.js';

// Priorytety targetowania — bonusy do score (wyższy = preferowany cel)
const SCORE_COUNTER      = 100;
const SCORE_SUPPORT_ROLE = 50;
const SCORE_SUPPLIER     = 50;
const SCORE_SCOUT        = 40;
const SCORE_LOW_HP       = 30;
const SCORE_RANGED_ROLE  = 20;
const SCORE_TOUGH_PENALTY = -30;
const SCORE_JITTER       = 5;

// Dezorganizacja jednostek po rundzie walki (zachowuje istniejącą mechanikę)
const ORG_COST_PER_ATTACK = 5;
const ORG_COST_WHEN_HIT   = 5;
const MORALE_COST_WHEN_HIT = 3;

// Retreat threshold
const MORALE_RETREAT_THRESHOLD = 20;

export class CombatSystem {
  constructor() {
    this._accum = 0;  // civYears accumulator
    this._battleRounds = new Map(); // "planetId_q_r" → round count
    this._battleTotals = new Map(); // "planetId_q_r" → { playerKilled, enemyKilled, playerDmg, enemyDmg, startYear }
  }

  // ── Public tick — wywoływany przez GroundUnitManager co civDeltaYears ────
  tick(civDeltaYears) {
    this._accum += civDeltaYears;
    if (this._accum < 1.0) return;
    const steps = Math.floor(this._accum);
    this._accum -= steps;
    for (let i = 0; i < steps; i++) {
      this._runAllBattles();
    }
  }

  // ── Czy na hexie trwa bitwa? (do UI — battle marker) ──────────────────
  isHexContested(planetId, q, r) {
    const gum = window.KOSMOS?.groundUnitManager;
    if (!gum) return false;
    const units = gum.getUnitsAtHex?.(planetId, q, r) ?? [];
    const owners = new Set();
    for (const u of units) {
      if (u.hp <= 0) continue;
      // Null owner traktujemy jako 'player' (legacy units)
      owners.add(u.owner ?? 'player');
      if (owners.size >= 2) return true;
    }
    return false;
  }

  // ── Stan bitwy do tooltip'a ─────────────────────────────────────────────
  getBattleStateAt(planetId, q, r) {
    const gum = window.KOSMOS?.groundUnitManager;
    if (!gum) return null;
    const units = gum.getUnitsAtHex?.(planetId, q, r) ?? [];
    if (units.length === 0) return null;
    const sides = this._groupByOwner(units);
    if (Object.keys(sides).length < 2) return null;
    const key = `${planetId}_${q}_${r}`;
    const round = this._battleRounds.get(key) ?? 0;

    const tile = this._getTile(planetId, q, r);
    const terrain = tile ? TERRAIN_TYPES[tile.type] : null;

    return { sides, round, terrain };
  }

  // ── Prywatne: główna pętla ──────────────────────────────────────────────

  _runAllBattles() {
    const gum = window.KOSMOS?.groundUnitManager;
    if (!gum) return;

    const contested = this._findContestedHexes(gum);
    const seenKeys = new Set();

    for (const { planetId, q, r } of contested) {
      // Separator `|` (nie `_`) — planetId może zawierać `_` (np. "p_3"), co psuło split
      const key = `${planetId}|${q}|${r}`;
      seenKeys.add(key);
      this._runBattleRound(planetId, q, r, key);
    }

    // Wyczyść round counters dla bitew które się zakończyły + emit hexResolved
    for (const key of this._battleRounds.keys()) {
      if (!seenKeys.has(key)) {
        const totals = this._battleTotals.get(key);
        this._battleRounds.delete(key);
        this._battleTotals.delete(key);
        if (totals) {
          // Ustal zwycięzcę: jeśli jakiś gracz/wróg zginął i teraz bitwa skończona → któraś strona wyczyściła hex
          // winner = kto ma żywych na hexie (lub null jeśli obie wyczyściły się)
          // Separator `|` — planetId może zawierać `_` (np. "p_3")
          const [pid, qS, rS] = key.split('|');
          const q = Number(qS), r = Number(rS);
          const gum = window.KOSMOS?.groundUnitManager;
          const occupants = gum?.getUnitsAtHex?.(pid, q, r) ?? [];
          let winnerId = null;
          if (occupants.length > 0) {
            const alive = occupants.filter(u => u.hp > 0);
            if (alive.length > 0) {
              const owners = new Set(alive.map(u => u.owner ?? 'player'));
              winnerId = owners.size === 1 ? [...owners][0] : null;
            }
          }
          EventBus.emit('combat:hexResolved', {
            planetId: pid, q, r, winnerId,
            playerKilled: totals.playerKilled ?? 0,
            enemyKilled:  totals.enemyKilled  ?? 0,
            playerDmg:    totals.playerDmg    ?? 0,
            enemyDmg:     totals.enemyDmg     ?? 0,
          });
        }
      }
    }

    // Auto-clear supportTarget dla unitów których bitwa już nie istnieje / wyszła z range
    this._cleanupSupportTargets(gum);
  }

  _findContestedHexes(gum) {
    // Grupuj po (planetId, q, r) → Set<owner>; zwracaj te z >=2 owners.
    // Moving units teraz TEŻ się liczą — ich pozycja logiczna to (q,r) = hex startu
    // bieżącego kroku. Unit "mijający się" z wrogim na tym samym hexie walczy.
    // Offline pomijamy (brak utrzymania → nie walczy).
    const groups = new Map();
    for (const u of gum._units.values()) {
      if (u.hp <= 0) continue;
      if (u.status === 'offline' || u.status === 'in_cargo') continue;
      const key = `${u.planetId}|${u.q}|${u.r}`;
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key).add(u.owner ?? 'player');
    }
    const out = [];
    for (const [key, owners] of groups.entries()) {
      if (owners.size < 2) continue;
      const [planetId, qS, rS] = key.split('|');
      out.push({ planetId, q: Number(qS), r: Number(rS) });
    }
    return out;
  }

  _runBattleRound(planetId, q, r, key) {
    const gum = window.KOSMOS?.groundUnitManager;
    // Moving unit też walczy (patrz _findContestedHexes). Offline pomijamy.
    const unitsAtHex = gum.getUnitsAtHex(planetId, q, r).filter(u =>
      u.hp > 0 && u.status !== 'offline'
    );
    const sides = this._groupByOwner(unitsAtHex);
    const owners = Object.keys(sides);
    if (owners.length < 2) return;

    // Increment round counter
    const round = (this._battleRounds.get(key) ?? 0) + 1;
    this._battleRounds.set(key, round);

    // MVP 2-stronne: gracz vs wszyscy wrogowie jako jedna strona (merge)
    const playerSide = sides['player'] ?? [];
    const enemyUnits = [];
    for (const o of owners) {
      if (o === 'player') continue;
      enemyUnits.push(...sides[o]);
    }

    if (playerSide.length === 0 && enemyUnits.length === 0) return;

    // Obrona bonus z terenu (dotyczy każdej strony — broniący każdego hitu ma bonus)
    const tile = this._getTile(planetId, q, r);
    const terrain = tile ? TERRAIN_TYPES[tile.type] : null;
    const defBonus = terrain?.defenseBonus ?? 1.0;

    // Wspierający ranged z sąsiednich hexów (jeśli mają supportTarget == {q,r})
    const playerSupporters = this._findSupporters(gum, planetId, q, r, 'player');
    const enemySupporters = [];
    for (const o of owners) {
      if (o === 'player') continue;
      enemySupporters.push(...this._findSupporters(gum, planetId, q, r, o));
    }

    // Simultaneous fire exchange
    const playerLosses = this._resolveFire(
      [...enemyUnits, ...enemySupporters],  // atakujący: wrogowie + ich supporterzy
      playerSide,                            // broniący: gracz na hexie
      defBonus
    );
    const enemyLosses = this._resolveFire(
      [...playerSide, ...playerSupporters],  // atakujący: gracz + jego supporterzy
      enemyUnits,                            // broniący: wrogowie na hexie
      defBonus
    );

    // Usuń zabite jednostki
    for (const unit of [...playerSide, ...enemyUnits]) {
      if (unit.hp <= 0) {
        EventBus.emit('groundUnit:destroyed', {
          unitId: unit.id, planetId: unit.planetId, owner: unit.owner,
          archetypeId: unit.archetypeId ?? null,
          popCost: unit.popCost ?? 0,
          cause: 'combat',
        });
        gum.removeUnit(unit.id);
      }
    }

    // Morale collapse → auto retreat
    for (const unit of [...playerSide, ...enemyUnits]) {
      if (unit.hp <= 0) continue;
      if (unit.noMorale) continue;
      const morale = unit.morale ?? 100;
      if (morale <= 0) {
        EventBus.emit('groundUnit:disbanded', {
          unitId: unit.id, planetId: unit.planetId, reason: 'morale_collapse',
          archetypeId: unit.archetypeId ?? null,
        });
        gum.removeUnit(unit.id);
      } else if (morale <= MORALE_RETREAT_THRESHOLD && unit.role !== 'defense') {
        this._tryRetreat(gum, unit);
      }
    }

    // Akumuluj totalsy bitwy do raportu końcowego
    const totals = this._battleTotals.get(key) ?? {
      playerKilled: 0, enemyKilled: 0, playerDmg: 0, enemyDmg: 0,
      startYear: window.KOSMOS?.timeSystem?.gameTime ?? 0,
    };
    totals.enemyKilled += enemyLosses.summary.killed ?? 0;
    totals.playerKilled += playerLosses.summary.killed ?? 0;
    totals.enemyDmg += enemyLosses.summary.dmgDealt ?? 0;
    totals.playerDmg += playerLosses.summary.dmgDealt ?? 0;
    this._battleTotals.set(key, totals);

    EventBus.emit('combat:round', {
      planetId, q, r, round,
      playerLosses: playerLosses.summary,
      enemyLosses: enemyLosses.summary,
    });
  }

  _resolveFire(attackers, defenders, defenderBonus) {
    const summary = { dmgDealt: 0, hits: 0, killed: 0 };
    if (attackers.length === 0 || defenders.length === 0) return { summary };

    for (const atk of attackers) {
      if (atk.hp <= 0) continue;
      if (atk.status === 'offline') continue;
      // Cooldown — skip if on cooldown (zostawione z starego systemu, ale w stack combat
      // nie powinno być restrykcyjne; każda runda = nowy atak)
      // Resetujemy cooldown na 0 żeby każdy mógł strzelać co rundę
      atk._atkCooldown = 0;

      // Żywi kandydaci w defenders
      const alive = defenders.filter(d => d.hp > 0);
      if (alive.length === 0) break;

      const target = this._pickBestTarget(atk, alive);
      if (!target) continue;

      const dmgRaw = GroundUnitFactory.getEffectiveDmg
        ? GroundUnitFactory.getEffectiveDmg(atk, target)
        : (atk.dmg ?? atk.attack ?? 0);

      // AC obrońcy + bonus terenu
      const ac = (target.ac ?? target.defense ?? 0) * defenderBonus;
      const base = Math.max(0, dmgRaw - ac);
      const variance = 0.8 + Math.random() * 0.4;
      const dmg = dmgRaw > 0 ? Math.max(1, Math.round(base * variance)) : 0;

      if (dmg > 0) {
        target.hp = Math.max(0, (target.hp ?? 0) - dmg);
        if (target.currentHP != null) target.currentHP = target.hp;
        summary.dmgDealt += dmg;
        summary.hits++;

        // Dezorganizacja + morale penalty (zachowuje existing Opcja C v3)
        target.org = Math.max(0, (target.org ?? 0) - ORG_COST_WHEN_HIT);
        if (!target.noMorale) {
          target.morale = Math.max(0, (target.morale ?? 0) - MORALE_COST_WHEN_HIT);
          EventBus.emit('groundUnit:moraleChanged', {
            unitId: target.id, morale: target.morale, max: target.maxMorale ?? 100,
          });
        }
        EventBus.emit('groundUnit:orgChanged', {
          unitId: target.id, org: target.org, max: target.maxOrg ?? 100,
        });
        EventBus.emit('groundUnit:attacked', {
          attackerId: atk.id, targetId: target.id, damage: dmg,
          targetHP: target.hp, targetHPMax: target.maxHp ?? target.hpMax,
          planetId: atk.planetId, q: target.q, r: target.r,
        });

        if (target.hp <= 0) summary.killed++;
      }

      // Atakujący traci org (zużycie amunicji/zmęczenie)
      atk.org = Math.max(0, (atk.org ?? 0) - ORG_COST_PER_ATTACK);
      EventBus.emit('groundUnit:orgChanged', {
        unitId: atk.id, org: atk.org, max: atk.maxOrg ?? 100,
      });
    }

    return { summary };
  }

  // Priority target picker — każdy atakujący wybiera niezależnie
  _pickBestTarget(attacker, candidates) {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    let best = null;
    let bestScore = -Infinity;
    for (const c of candidates) {
      const score = this._scoreTarget(attacker, c);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  _scoreTarget(attacker, defender) {
    let score = 0;
    const arch = UNIT_ARCHETYPES[attacker.archetypeId];
    if (arch?.counters?.includes(defender.archetypeId)) score += SCORE_COUNTER;
    if (defender.role === 'support')  score += SCORE_SUPPORT_ROLE;
    if (defender.isSupplier)          score += SCORE_SUPPLIER;
    if (defender.role === 'scout')    score += SCORE_SCOUT;
    const hpFrac = (defender.hp ?? 0) / (defender.maxHp ?? defender.hpMax ?? 100);
    if (hpFrac < 0.3) score += SCORE_LOW_HP;
    if (defender.role === 'ranged')   score += SCORE_RANGED_ROLE;
    const dmg = attacker.dmg ?? attacker.attack ?? 1;
    const ac = defender.ac ?? defender.defense ?? 0;
    if (ac > dmg * 1.5)               score += SCORE_TOUGH_PENALTY;
    score += Math.random() * SCORE_JITTER;
    return score;
  }

  _findSupporters(gum, planetId, q, r, ownerId) {
    const out = [];
    for (const u of gum._units.values()) {
      if ((u.owner ?? 'player') !== ownerId) continue;
      if (u.planetId !== planetId) continue;
      if (u.hp <= 0) continue;
      if (u.status === 'offline' || u.status === 'moving' || u.status === 'in_cargo') continue;
      if (!u.supportTarget) continue;
      if (u.supportTarget.q !== q || u.supportTarget.r !== r) continue;
      const dist = this._hexDist(u.q, u.r, q, r);
      const range = u.range ?? 1;
      if (dist > range) { u.supportTarget = null; continue; }  // wyszło z zasięgu
      // Nie support jeśli sam na contested hex
      if (this.isHexContested(u.planetId, u.q, u.r)) continue;
      out.push(u);
    }
    return out;
  }

  _cleanupSupportTargets(gum) {
    for (const u of gum._units.values()) {
      if (!u.supportTarget) continue;
      if (u.hp <= 0) { u.supportTarget = null; continue; }
      const { q, r } = u.supportTarget;
      // Bitwa już się skończyła?
      if (!this.isHexContested(u.planetId, q, r)) {
        u.supportTarget = null;
      }
    }
  }

  _tryRetreat(gum, unit) {
    const grid = gum._getGrid?.(unit.planetId);
    if (!grid) return;
    // Znajdź sąsiedni hex bez wrogów
    const HEX_DIRS = [
      { q: +1, r:  0 }, { q: +1, r: -1 }, { q:  0, r: -1 },
      { q: -1, r:  0 }, { q: -1, r: +1 }, { q:  0, r: +1 },
    ];
    let best = null;
    for (const d of HEX_DIRS) {
      const nq = unit.q + d.q;
      const nr = unit.r + d.r;
      const tile = grid.get(nq, nr);
      if (!tile || tile.type === 'ocean') continue;
      const occupants = gum.getUnitsAtHex(unit.planetId, nq, nr);
      const hasEnemy = occupants.some(u => (u.owner ?? 'player') !== (unit.owner ?? 'player'));
      if (hasEnemy) continue;
      best = { q: nq, r: nr };
      break;
    }
    if (!best) return; // otoczony
    const fromQ = unit.q, fromR = unit.r;
    unit.q = best.q;
    unit.r = best.r;
    unit.morale = Math.min((unit.maxMorale ?? 100), (unit.morale ?? 0) + 10); // małe morale recovery po odwrocie
    EventBus.emit('groundUnit:routed', {
      unitId: unit.id, planetId: unit.planetId,
      fromQ, fromR, toQ: best.q, toR: best.r,
    });
    EventBus.emit('groundUnit:moved', {
      unitId: unit.id, q: best.q, r: best.r,
    });
  }

  _groupByOwner(units) {
    const out = {};
    for (const u of units) {
      const o = u.owner ?? 'player';
      if (!out[o]) out[o] = [];
      out[o].push(u);
    }
    return out;
  }

  _getTile(planetId, q, r) {
    const gum = window.KOSMOS?.groundUnitManager;
    const grid = gum?._getGrid?.(planetId);
    return grid?.get?.(q, r) ?? null;
  }

  _hexDist(q1, r1, q2, r2) {
    const s1 = -q1 - r1;
    const s2 = -q2 - r2;
    return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(s1 - s2)) / 2;
  }
}
