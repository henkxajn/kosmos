// GroundUnitManager — zarządza jednostkami naziemnymi na mapie planety
//
// Jednostki poruszają się po siatce hex (A* pathfinding) i wykonują akcje:
//   - scan: skanowanie hexa (odkrywanie terenu, anomalii)
//   - (przyszłe): budowa, wydobycie, walka
//
// Komunikacja przez EventBus:
//   Emituje: groundUnit:scanComplete, groundUnit:anomalyFound, groundUnit:moved,
//            groundUnit:created, groundUnit:pathBlocked
//   Słucha:  time:tick (civDeltaYears)

import EventBus from '../core/EventBus.js';
import { HexGrid } from '../map/HexGrid.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';
import { getUnitStats } from '../data/GroundUnitData.js';
import { UNIT_ARCHETYPES } from '../data/unitArchetypes.js';
import { GroundUnitFactory } from './GroundUnitFactory.js';

// ── Koszty ruchu po terenie ──────────────────────────────────────────────────
const MOVE_COST = {
  plains:    1,
  forest:    2,
  desert:    2,
  tundra:    2,
  mountains: 3,
  volcano:   4,
  crater:    2,
  ice_sheet: 3,
  wasteland: 1,
  ocean:     Infinity,  // nieprzejezdny
};

// Prędkość ruchu: 3 hexy na rok cywilizacyjny
const MOVE_SPEED = 3.0;

export class GroundUnitManager {
  constructor() {
    this._units = new Map();  // unitId → GroundUnit
    this._nextId = 1;

    // Ground Unit System: progres zajmowania budynków { unitId → {planetId, q, r, progress, buildingId} }
    this._captureProgress = new Map();
    // Akumulator do tick passive abilities (co 1.0 civYear = jedna "tura")
    this._passiveAccum = 0;

    // Subskrybuj tick czasu (civDeltaYears)
    this._onTick = ({ civDeltaYears: dt }) => this.tick(dt);
    EventBus.on('time:tick', this._onTick);

    // Ostrzał orbitalny — zadaje damage jednostkom na docelowym hexie (Faza desantu)
    EventBus.on('groundUnit:orbitalStrike', (ev) => this._onOrbitalStrike(ev));
  }

  /**
   * Odbiór ostrzału orbitalnego — damage dla WSZYSTKICH jednostek na hexie
   * (nie filtrujemy po ownerze — kinetyczny pocisk nie widzi flagi).
   * Friendly fire jest cenną decyzją taktyczną gracza.
   */
  _onOrbitalStrike({ planetId, q, r, damage }) {
    if (!planetId || damage == null) return;
    const dmg = Math.max(0, damage);
    if (dmg === 0) return;
    const toKill = [];
    for (const u of this._units.values()) {
      if (u.planetId !== planetId) continue;
      if (u.q !== q || u.r !== r) continue;
      const hp = (u.currentHP ?? u.hp ?? 0) - dmg;
      u.currentHP = hp;
      u.hp = hp;
      if (hp <= 0) toKill.push(u);
    }
    for (const u of toKill) {
      EventBus.emit('groundUnit:destroyed', {
        unitId: u.id,
        planetId: u.planetId,
        cause: 'orbital_strike',
        archetypeId: u.archetypeId,
        popCost: u.popCost ?? 0,
        ownerId: u.owner ?? null,
      });
      this.removeUnit(u.id);
    }
  }

  // ── Tworzenie jednostki ──────────────────────────────────────────────────

  createUnit(type, planetId, q, r, opts = {}) {
    // ── Overload detection (Ground Unit System) ──
    // Factory-style call: createUnit(archetypeId, factionId, planetId, q, r)
    //   — 5 args, 5-ty arg to number (hex r). Używane w testach + bezpośrednio z Factory.
    // Legacy-style call: createUnit(type, planetId, q, r, opts?)
    //   — 4 args lub 5 z 5-tym argiem jako obiektem. Używane przez GameScene, InvasionSystem.
    if (UNIT_ARCHETYPES[type] && arguments.length === 5 && typeof arguments[4] === 'number') {
      // Remapuj: planetId → factionId, q → planetId, r → q, opts(number) → r
      const factionId = planetId;
      planetId = q;
      q = r;
      r = opts;
      opts = { factionId };
    }

    // ── Ground Unit System: dispatch archetyp vs legacy ──
    // Jeśli `type` jest w UNIT_ARCHETYPES → użyj Factory (nowy kształt z baseStats/factionId).
    // W przeciwnym razie (infantry/mech/garrison/science_rover) → legacy ścieżka.
    if (UNIT_ARCHETYPES[type]) {
      const factionId = opts.factionId ?? 'humanity';
      const unit = GroundUnitFactory.create(type, factionId, planetId, q, r);
      if (!unit) return null;
      // Nadpisz ID wewnętrznym licznikiem (zgodnie z konwencją `gu_N`)
      const id = `gu_${this._nextId++}`;
      unit.id = id;
      unit.owner = opts.owner ?? 'player';
      if (opts.hp != null) {
        unit.currentHP = opts.hp;
        unit.hp        = opts.hp;
      }
      // Jednostki z supportsDeploy (garrison_unit) startują w trybie Mobile —
      // gracz dojeżdża wozem w docelowe miejsce i rozkłada przez `deploy()`.
      const arch = UNIT_ARCHETYPES[type];
      if (arch.supportsDeploy) {
        unit.deployState = opts.deployState ?? 'mobile';
        unit.stateTimer  = 0;
        this._applyDeployStateStats(unit);
      } else {
        unit.deployState = null;
        unit.stateTimer  = 0;
      }
      // Victoria 2 stack combat: ranged unit może wspierać bitwę na sąsiednim hexie
      unit.supportTarget = null;
      this._units.set(id, unit);
      EventBus.emit('groundUnit:created', {
        unitId: id, type, planetId, q, r, owner: unit.owner,
        archetypeId: unit.archetypeId, factionId: unit.factionId,
      });
      return unit;
    }

    // ── Legacy ścieżka (science_rover/infantry/mech/garrison) — niezmieniona ──
    const id = `gu_${this._nextId++}`;
    const stats = getUnitStats(type);
    const unit = {
      id,
      type,
      planetId,
      q, r,
      // Faza 6: combat
      owner:    opts.owner ?? 'player',    // 'player' lub empireId ('emp_001')
      hp:       opts.hp ?? stats.hp,
      hpMax:    stats.hp,
      attack:   stats.attack,
      defense:  stats.defense,
      range:    stats.range,
      role:     stats.role,
      status:   'idle',  // idle | moving | scanning | working | attacking | dead
      mission:  null,
      // Cooldown ataku (w civYears) — zapobiega spam atakom
      _atkCooldown: 0,
      // Victoria 2 stack combat: ranged unit support target (null dla piechoty)
      supportTarget: null,
      // Animacja ruchu (nie serializowane oprócz _heading)
      _path:      [],
      _animT:     0,
      _fromPixel: null,
      _toPixel:   null,
      _facingLeft: false,      // true = sprite odbity (patrzy w lewo)
      _stepCost:   1,          // koszt terenu aktualnego kroku (wpływa na prędkość)
    };
    this._units.set(id, unit);
    EventBus.emit('groundUnit:created', { unitId: id, type, planetId, q, r, owner: unit.owner });
    return unit;
  }

  removeUnit(unitId) {
    const unit = this._units.get(unitId);
    if (!unit) return false;
    this._units.delete(unitId);
    // Ground Unit System: cleanup capture progress
    this._captureProgress.delete(unitId);
    EventBus.emit('groundUnit:removed', { unitId, planetId: unit.planetId });
    return true;
  }

  /** Zwróć wszystkie jednostki (płaska tablica). */
  getAllUnits() {
    return [...this._units.values()];
  }

  /**
   * Zwróć jednostki w promieniu hex od (q,r) na danej planecie.
   * @param {string} planetId
   * @param {number} q
   * @param {number} r
   * @param {number} range — max hex distance
   * @param {string|null} factionFilter — 'player' | empireId | null (brak filtra)
   */
  getUnitsInRange(planetId, q, r, range, factionFilter = null) {
    const result = [];
    for (const u of this._units.values()) {
      if (u.planetId !== planetId) continue;
      if (factionFilter && u.owner !== factionFilter) continue;
      if (this._hexDistance(q, r, u.q, u.r) <= range) result.push(u);
    }
    return result;
  }

  // ── Zapytania ────────────────────────────────────────────────────────────

  getUnit(unitId) {
    return this._units.get(unitId) ?? null;
  }

  getUnitsOnPlanet(planetId) {
    const result = [];
    for (const u of this._units.values()) {
      if (u.planetId === planetId) result.push(u);
    }
    return result;
  }

  getUnitAt(planetId, q, r) {
    for (const u of this._units.values()) {
      if (u.planetId === planetId && u.q === q && u.r === r && u.status !== 'moving') {
        return u;
      }
    }
    return null;
  }

  /**
   * Wszystkie jednostki na danym hexie (tablica — stack combat).
   * Pomija jednostki w ruchu (status='moving') — jeszcze tam nie ma.
   */
  getUnitsAtHex(planetId, q, r) {
    const out = [];
    for (const u of this._units.values()) {
      if (u.planetId === planetId && u.q === q && u.r === r && u.status !== 'moving') {
        out.push(u);
      }
    }
    return out;
  }

  /**
   * Czy jednostka jest w trakcie bitwy (na hexie z przeciwnikiem)?
   */
  isUnitInCombat(unit) {
    if (!unit || unit.hp <= 0) return false;
    const ownerId = unit.owner ?? 'player';
    const occupants = this.getUnitsAtHex(unit.planetId, unit.q, unit.r);
    return occupants.some(u => (u.owner ?? 'player') !== ownerId);
  }

  // ── Rozkaz ruchu (A* pathfinding) ────────────────────────────────────────

  moveUnit(unitId, targetQ, targetR) {
    const unit = this._units.get(unitId);
    if (!unit) return false;

    // Deployable unit w trybie deployed/deploying/packing nie może się ruszać —
    // tylko Mobile. Dodatkowo speedHex=0 w tych stanach blokuje ruch w AI.
    if (unit.deployState && unit.deployState !== 'mobile') {
      EventBus.emit('groundUnit:pathBlocked', {
        unitId, targetQ, targetR, reason: 'not_mobile',
      });
      return false;
    }

    // Pobierz grid planety
    const grid = this._getGrid(unit.planetId);
    if (!grid) return false;

    const targetTile = grid.get(targetQ, targetR);
    if (!targetTile) return false;

    // Ocean = nieprzejezdny
    if (MOVE_COST[targetTile.type] === Infinity) return false;

    // Już na miejscu
    if (unit.q === targetQ && unit.r === targetR) return false;

    // Oblicz ścieżkę A*
    const path = this._aStar(grid, unit.q, unit.r, targetQ, targetR);
    if (!path || path.length === 0) {
      EventBus.emit('groundUnit:pathBlocked', { unitId, targetQ, targetR });
      return false;
    }

    // Anuluj bieżącą misję skanowania jeśli jest
    if (unit.status === 'scanning') {
      unit.mission = null;
    }

    // Disengagement penalty: wyjście z hexu gdzie są wrogowie kosztuje -25% HP
    if (this.isUnitInCombat(unit)) {
      const beforeHp = unit.hp ?? 0;
      unit.hp = Math.max(1, Math.floor(beforeHp * 0.75));
      if (unit.currentHP != null) unit.currentHP = unit.hp;
      const hpLost = beforeHp - unit.hp;
      EventBus.emit('groundUnit:disengaged', {
        unitId, planetId: unit.planetId,
        fromQ: unit.q, fromR: unit.r, hpLost,
      });
    }

    // Auto-clear supportTarget przy ruchu — ranged unit zaprzestaje wsparcia gdy się porusza
    if (unit.supportTarget) unit.supportTarget = null;

    unit._path = path;
    unit._animT = 0;
    unit.status = 'moving';

    // Ustaw piksele animacji dla pierwszego kroku
    this._setupNextStep(unit, grid);

    return true;
  }

  // ── Skan ogólny (survey) — wykrywa anomalie w promieniu 15 hexów ─────────

  startSurvey(unitId) {
    const unit = this._units.get(unitId);
    if (!unit) return false;
    if (unit.status !== 'idle') return false;

    unit.mission = {
      type:     'survey',
      targetQ:  unit.q,
      targetR:  unit.r,
      progress: 0,
      duration: 0.5,  // 0.5 roku cywilizacyjnego
    };
    unit.status = 'scanning';
    return true;
  }

  // ── Skan dokładny (analyze) — ujawnia anomalię na hexie ────────────────

  startAnalysis(unitId) {
    const unit = this._units.get(unitId);
    if (!unit) return false;
    if (unit.status !== 'idle') return false;

    // Sprawdź czy hex ma wykrytą, nieujawnioną anomalię
    const grid = this._getGrid(unit.planetId);
    const tile = grid?.get(unit.q, unit.r);
    if (!tile || !tile.anomaly || !tile.anomalyDetected || tile.anomalyRevealed) return false;

    unit.mission = {
      type:     'analyze',
      targetQ:  unit.q,
      targetR:  unit.r,
      progress: 0,
      duration: 1.0,  // 1 rok cywilizacyjny
    };
    unit.status = 'scanning';
    return true;
  }

  // ── Tick — wywoływany co klatkę przez time:tick ──────────────────────────

  tick(civDeltaYears) {
    for (const unit of this._units.values()) {
      // Cooldown ataku
      if (unit._atkCooldown > 0) {
        unit._atkCooldown = Math.max(0, unit._atkCooldown - civDeltaYears);
      }
      if (unit.status === 'moving') {
        this._tickMovement(unit, civDeltaYears);
      } else if (unit.status === 'scanning' && unit.mission) {
        this._tickScan(unit, civDeltaYears);
      }
    }
    // Combat tick — Victoria 2 stack combat: CombatSystem resolve bitew na hexach,
    // lokalny _tickCombatAI tylko porusza AI wrogów poza bitwą.
    this._combatAccum = (this._combatAccum ?? 0) + civDeltaYears;
    if (this._combatAccum >= 1.0) {
      const steps = Math.floor(this._combatAccum);
      this._combatAccum -= steps;
      for (let i = 0; i < steps; i++) this._tickCombatAI(1.0);
    }
    // Faza 6.5: tick okupacji (co klatka — 2-mo timer to dużo civYears)
    this._tickOccupation(civDeltaYears);

    // ── Ground Unit System: passive abilities (co 1.0 civYear = jedna tura) ──
    this._passiveAccum += civDeltaYears;
    if (this._passiveAccum >= 1.0) {
      const turns = Math.floor(this._passiveAccum);
      this._passiveAccum -= turns;
      for (let i = 0; i < turns; i++) this._tickPassiveAbilities();
    }

    // ── Ground Unit System: capture progress (ciągły) ──
    this._tickCaptures(civDeltaYears);

    // ── Deploy/Pack state machine (garrison_unit i inne supportsDeploy) ──
    for (const unit of this._units.values()) {
      if (unit.deployState === 'deploying' || unit.deployState === 'packing') {
        this._tickDeployTransition(unit, civDeltaYears);
      }
    }
  }

  // ── Deploy/Pack state machine ──────────────────────────────────────────────
  //
  // Stany:
  //   mobile    — wóz kołowy: mov=2, ac=3, dmg=0, zużywa 4 supply/civY, brak aury
  //   deploying — rozkładanie (2 civY): ac=1, dmg=0, mov=0 — okno podatności
  //   deployed  — okopany: bazowe staty (mov=0, ac=8, dmg=5, rng=2), aura +2 AC
  //   packing   — zwijanie (1 civY, -15 org): ac=2, dmg=0, mov=0

  /**
   * Wymusza staty jednostki zgodne z jej bieżącym deployState.
   * Wywoływane po każdym przejściu stanu. Modyfikuje flat fields
   * (attack/defense/range/speedHex) + baseStats snapshot + supplyConsumption.
   * HP/org/morale to stan jednostki (nie tryb) — NIE są resetowane.
   */
  _applyDeployStateStats(unit) {
    const arch = UNIT_ARCHETYPES[unit.archetypeId];
    if (!arch?.supportsDeploy) return;

    let stats;
    if (unit.deployState === 'mobile') {
      stats = arch.mobileStats;
      unit.supplyConsumption = arch.mobileSupplyConsumption ?? arch.supplyConsumption;
    } else if (unit.deployState === 'deploying' || unit.deployState === 'packing') {
      // tranzyt: bezbronny, nieruchomy; wyższy koszt supply bo silnik pracuje
      const baseAc = unit.deployState === 'deploying' ? 1 : 2;
      stats = { hp: arch.baseStats.hp, ac: baseAc, dmg: 0, rng: 0, mov: 0 };
      unit.supplyConsumption = arch.mobileSupplyConsumption ?? arch.supplyConsumption;
    } else {
      // deployed — bazowe staty z archetypu
      stats = arch.baseStats;
      unit.supplyConsumption = arch.supplyConsumption;
    }

    unit.attack   = stats.dmg;
    unit.defense  = stats.ac;
    unit.range    = stats.rng;
    unit.speedHex = stats.mov;
    // Snapshot baseStats dla readers (GroundUnitFactory.getEffectiveDmg itp.)
    unit.baseStats = { ...stats, hp: unit.hpMax ?? stats.hp };
  }

  /**
   * Rozpocznij rozkładanie (mobile → deploying → deployed).
   * @returns {{ success: boolean, reason?: string }}
   */
  deploy(unitId) {
    const unit = this._units.get(unitId);
    if (!unit) return { success: false, reason: 'no_unit' };
    const arch = UNIT_ARCHETYPES[unit.archetypeId];
    if (!arch?.supportsDeploy) return { success: false, reason: 'not_deployable' };
    if (unit.deployState !== 'mobile') return { success: false, reason: 'not_mobile' };
    if (unit.status === 'moving')      return { success: false, reason: 'moving' };

    unit.deployState = 'deploying';
    unit.stateTimer  = arch.deployTime ?? 2.0;
    this._applyDeployStateStats(unit);
    EventBus.emit('groundUnit:deployStateChanged', {
      unitId, planetId: unit.planetId,
      deployState: 'deploying', stateTimer: unit.stateTimer, totalTime: unit.stateTimer,
    });
    return { success: true };
  }

  /**
   * Rozpocznij zwijanie (deployed → packing → mobile). Kosztuje min. 15 org.
   * @returns {{ success: boolean, reason?: string, required?: number }}
   */
  packUp(unitId) {
    const unit = this._units.get(unitId);
    if (!unit) return { success: false, reason: 'no_unit' };
    const arch = UNIT_ARCHETYPES[unit.archetypeId];
    if (!arch?.supportsDeploy)           return { success: false, reason: 'not_deployable' };
    if (unit.deployState !== 'deployed') return { success: false, reason: 'not_deployed' };
    const orgCost = arch.packOrgCost ?? 15;
    if ((unit.org ?? 0) < orgCost) {
      return { success: false, reason: 'low_org', required: orgCost };
    }

    unit.org = Math.max(0, (unit.org ?? 0) - orgCost);
    EventBus.emit('groundUnit:orgChanged', {
      unitId, org: unit.org, max: unit.maxOrg ?? 100,
    });

    unit.deployState = 'packing';
    unit.stateTimer  = arch.packTime ?? 1.0;
    this._applyDeployStateStats(unit);
    EventBus.emit('groundUnit:deployStateChanged', {
      unitId, planetId: unit.planetId,
      deployState: 'packing', stateTimer: unit.stateTimer, totalTime: unit.stateTimer,
    });
    return { success: true };
  }

  /**
   * Anuluj trwające rozkładanie/zwijanie → powrót do stanu źródłowego.
   * deploying → mobile; packing → deployed. Bez zwrotu org.
   */
  cancelDeployTransition(unitId) {
    const unit = this._units.get(unitId);
    if (!unit) return { success: false, reason: 'no_unit' };
    if (unit.deployState !== 'deploying' && unit.deployState !== 'packing') {
      return { success: false, reason: 'not_in_transit' };
    }
    const newState = unit.deployState === 'deploying' ? 'mobile' : 'deployed';
    unit.deployState = newState;
    unit.stateTimer  = 0;
    this._applyDeployStateStats(unit);
    EventBus.emit('groundUnit:deployStateChanged', {
      unitId, planetId: unit.planetId,
      deployState: newState, stateTimer: 0, totalTime: 0,
    });
    return { success: true };
  }

  _tickDeployTransition(unit, civDeltaYears) {
    unit.stateTimer = Math.max(0, (unit.stateTimer ?? 0) - civDeltaYears);
    if (unit.stateTimer > 0) return;

    const oldState = unit.deployState;
    const newState = oldState === 'deploying' ? 'deployed' : 'mobile';
    unit.deployState = newState;
    this._applyDeployStateStats(unit);
    EventBus.emit('groundUnit:deployStateChanged', {
      unitId: unit.id, planetId: unit.planetId,
      deployState: newState, stateTimer: 0, totalTime: 0,
    });
  }

  // ── Faza 6.5: Okupacja hexów ───────────────────────────────────
  //
  // Reguły (docs/plan):
  //   - Jednostka innego ownera na pustym hexie → instant owner change
  //   - Jednostka na hexie z budynkiem → 2 miesiące (2/12 civYears) progresji
  //   - Jednostka odchodzi przed ukończeniem → reset timera
  //
  // Emituje: tile:ownerChanged { planetId, q, r, oldOwner, newOwner }

  _tickOccupation(dt) {
    const OCCUPY_DURATION = 6 / 12; // 6 miesięcy = 0.5 civYear

    // Indeks: planetId → Set 'q,r' zajętych przez jednostkę nie-właściciela
    const occupiedByForeigner = new Map();

    for (const unit of this._units.values()) {
      if (unit.status === 'moving') continue; // w tranzycie nie okupuje
      if ((unit.hp ?? 0) <= 0) continue;
      const owner = unit.owner ?? 'player';
      const grid = this._getGrid(unit.planetId);
      if (!grid) continue;
      const tile = grid.get(unit.q, unit.r);
      if (!tile) continue;

      const tileOwner = tile.owner; // null/player/empireId
      if (tileOwner === owner) continue; // swój hex — nic nie robimy

      // Zanotuj że foreigner jest na tym hexie (żeby potem nie resetować jego timera)
      const key = `${unit.q},${unit.r}`;
      if (!occupiedByForeigner.has(unit.planetId)) occupiedByForeigner.set(unit.planetId, new Map());
      occupiedByForeigner.get(unit.planetId).set(key, owner);

      const hasBuilding = tile.buildingId !== null || tile.capitalBase === true;

      if (!hasBuilding) {
        // Pusty hex — instant przejęcie
        this._changeTileOwner(tile, unit.planetId, owner);
      } else {
        // Budynek — progres 2/12 civYears
        if (tile.occupyEmpireId !== owner) {
          // Inny okupant — reset i start
          tile.occupyEmpireId = owner;
          tile.occupyStart = this._year();
        } else {
          // Kontynuuj progres
          const elapsed = this._year() - (tile.occupyStart ?? this._year());
          if (elapsed >= OCCUPY_DURATION) {
            this._changeTileOwner(tile, unit.planetId, owner);
            tile.occupyEmpireId = null;
            tile.occupyStart = null;
          }
        }
      }
    }

    // Reset timerów na hexach, na których nikt już nie okupuje
    // (Przeszukujemy tylko hexy które mają aktywny occupyEmpireId — inaczej pętla po całej mapie byłaby kosztowna)
    this._cleanupStaleOccupations(occupiedByForeigner);
  }

  _changeTileOwner(tile, planetId, newOwner) {
    if (tile.owner === newOwner) return;
    const oldOwner = tile.owner;
    tile.owner = newOwner;
    EventBus.emit('tile:ownerChanged', { planetId, q: tile.q, r: tile.r, oldOwner, newOwner });
  }

  _cleanupStaleOccupations(occupiedByForeigner) {
    // Dla każdego grida — sprawdź hexy z occupyEmpireId które nie mają już okupanta
    for (const [planetId, tiles] of this._stalePlanetCache()) {
      const foreignHere = occupiedByForeigner.get(planetId);
      for (const tile of tiles) {
        if (!tile.occupyEmpireId) continue;
        const key = `${tile.q},${tile.r}`;
        const foreigner = foreignHere?.get(key);
        if (foreigner !== tile.occupyEmpireId) {
          // Już nikt nie okupuje z tej frakcji → reset
          tile.occupyEmpireId = null;
          tile.occupyStart = null;
        }
      }
    }
  }

  /** Iteruj grida wszystkich planet które mają kolonie (lub kiedyś miały — ma budynki/owner). */
  *_stalePlanetCache() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;
    for (const col of colMgr.getAllColonies()) {
      const grid = col.grid;
      if (!grid) continue;
      // Tylko hexy z aktywnym occupy (perf)
      const tiles = grid.toArray().filter(t => t && t.occupyEmpireId);
      if (tiles.length > 0) yield [col.planetId, tiles];
    }
  }

  // ── Faza 6: Combat ─────────────────────────────────────────────

  /**
   * Atak jednostki na inną jednostkę w zasięgu.
   * Używa GroundUnitFactory.getEffectiveDmg() — legacy jednostki bez `counters`
   * dostają surowy dmg (zero regresji).
   * Zwraca { hit: bool, damage, killed, attacker, defender }.
   */
  attackUnit(attackerId, targetId) {
    const atk = this._units.get(attackerId);
    const tgt = this._units.get(targetId);
    if (!atk || !tgt) return { hit: false, reason: 'no_unit' };
    if (atk.planetId !== tgt.planetId) return { hit: false, reason: 'diff_planet' };
    if (atk.owner === tgt.owner) return { hit: false, reason: 'same_owner' };
    if (atk._atkCooldown > 0) return { hit: false, reason: 'cooldown' };
    // Opcja C v3: offline jednostki nie atakują (brak utrzymania)
    if (atk.status === 'offline') return { hit: false, reason: 'offline' };

    const dist = this._hexDistance(atk.q, atk.r, tgt.q, tgt.r);
    if (dist > (atk.range ?? 1)) return { hit: false, reason: 'out_of_range' };

    // Ground Unit System: counter bonus wlicza się do dmg PRZED odjęciem AC.
    // Opcja C v3: getEffectiveDmg mnoży dodatkowo przez computeDamageMult(atk)
    //             = supplyFactor × (1 + (org+morale)/200). Brak supply → dmg=0.
    const dmgAfterCounter = GroundUnitFactory.getEffectiveDmg(atk, tgt);
    const base     = Math.max(0, dmgAfterCounter - (tgt.defense ?? 0));
    const variance = 0.8 + Math.random() * 0.4;
    // Jeśli dmgAfterCounter===0 (brak supply), damage musi pozostać 0 — nie klampuj do >=1
    const damage   = dmgAfterCounter > 0 ? Math.max(1, Math.round(base * variance)) : 0;

    if (damage > 0) {
      tgt.hp = Math.max(0, (tgt.hp ?? 0) - damage);
      if (tgt.currentHP != null) tgt.currentHP = tgt.hp; // sync legacy mirror
    }
    atk._atkCooldown = 1.0;  // 1 civYear cooldown

    // Opcja C v3: degradacja org/morale po walce
    //   — atakujący traci -5 org (zmęczenie, zużycie amunicji)
    //   — cel traci -5 org (dezorganizacja) i -3 morale jeśli nie noMorale
    atk.org = Math.max(0, (atk.org ?? 0) - 5);
    if (damage > 0) {
      tgt.org = Math.max(0, (tgt.org ?? 0) - 5);
      if (!tgt.noMorale) tgt.morale = Math.max(0, (tgt.morale ?? 0) - 3);
      EventBus.emit('groundUnit:orgChanged',    { unitId: tgt.id, org: tgt.org, max: tgt.maxOrg ?? 100 });
      if (!tgt.noMorale) EventBus.emit('groundUnit:moraleChanged', { unitId: tgt.id, morale: tgt.morale, max: tgt.maxMorale ?? 100 });
    }
    EventBus.emit('groundUnit:orgChanged', { unitId: atk.id, org: atk.org, max: atk.maxOrg ?? 100 });

    // Ground Unit System: reveal stealth attackera (re-hide timer reset)
    if (atk.abilityId === 'stealth') {
      const wasHidden = atk._stealthState === 'hidden';
      atk._stealthState    = 'revealed';
      atk._stealthCooldown = 2;
      if (wasHidden) {
        EventBus.emit('groundUnit:stealthRevealed', { unitId: atk.id });
      }
    }

    EventBus.emit('groundUnit:attacked', {
      attackerId, targetId, damage,
      targetHP: tgt.hp, targetHPMax: tgt.hpMax,
      planetId: atk.planetId, q: tgt.q, r: tgt.r,
    });

    let killed = false;
    if (tgt.hp <= 0) {
      killed = true;
      // Opcja C v3: emit popCost dla reintegracji POPów w ColonyManager
      EventBus.emit('groundUnit:destroyed', {
        unitId: targetId, planetId: tgt.planetId, owner: tgt.owner, killedBy: attackerId,
        archetypeId: tgt.archetypeId ?? null,
        popCost:     tgt.popCost ?? 0,
        cause:       'combat',
      });
      this.removeUnit(targetId);
    }

    return { hit: true, damage, killed };
  }

  // ── Ground Unit System: zajęcie budynku (capture_building ability) ────

  /**
   * Rozpocznij zajmowanie budynku na hexie jednostki.
   * Progres 2 civYears = 100%. Reset gdy jednostka opuści hex.
   */
  capture(unitId) {
    const unit = this._units.get(unitId);
    if (!unit) return { success: false, reason: 'no_unit' };
    if (unit.status === 'moving')  return { success: false, reason: 'moving' };
    if (unit.status === 'offline') return { success: false, reason: 'offline' };  // Opcja C v3

    const grid = this._getGrid(unit.planetId);
    if (!grid) return { success: false, reason: 'no_grid' };
    const tile = grid.get(unit.q, unit.r);
    if (!tile) return { success: false, reason: 'no_tile' };

    const hasBuilding = tile.buildingId || tile.capitalBase;
    if (!hasBuilding) return { success: false, reason: 'no_building' };
    if (tile.owner === unit.owner) return { success: false, reason: 'already_owned' };

    this._captureProgress.set(unitId, {
      planetId:   unit.planetId,
      q:          unit.q,
      r:          unit.r,
      buildingId: tile.buildingId ?? 'capital',
      progress:   0,
    });
    EventBus.emit('groundUnit:capturingBuilding', {
      unitId, planetId: unit.planetId, q: unit.q, r: unit.r, progress: 0,
    });
    return { success: true };
  }

  /** Tick progresu zajmowania (ciągły — gra pokazuje płynny pasek). */
  _tickCaptures(civDeltaYears) {
    if (this._captureProgress.size === 0) return;

    for (const [unitId, cap] of [...this._captureProgress.entries()]) {
      const unit = this._units.get(unitId);
      // Jednostka zniknęła lub zginęła
      if (!unit || (unit.hp ?? 0) <= 0) {
        this._captureProgress.delete(unitId);
        continue;
      }
      // Jednostka opuściła hex → reset
      if (unit.q !== cap.q || unit.r !== cap.r) {
        this._captureProgress.delete(unitId);
        EventBus.emit('groundUnit:captureInterrupted', {
          unitId, planetId: cap.planetId, q: cap.q, r: cap.r,
        });
        continue;
      }

      // 2 tury = 2 civYears, skalowane przez damageMult (Opcja C v3)
      // — głodna / zdemoralizowana jednostka zajmuje budynek wolniej
      const mult = GroundUnitFactory.computeDamageMult(unit);
      cap.progress += (civDeltaYears / 2) * mult;

      if (cap.progress >= 1) {
        const grid = this._getGrid(cap.planetId);
        const tile = grid?.get(cap.q, cap.r);
        if (tile) this._changeTileOwner(tile, cap.planetId, unit.owner);
        EventBus.emit('groundUnit:buildingCaptured', {
          unitId, planetId: cap.planetId, q: cap.q, r: cap.r,
          buildingId: cap.buildingId, newOwner: unit.owner,
        });
        this._captureProgress.delete(unitId);
      } else {
        EventBus.emit('groundUnit:capturingBuilding', {
          unitId, planetId: cap.planetId, q: cap.q, r: cap.r,
          progress: cap.progress,
        });
      }
    }
  }

  // ── Ground Unit System: passive abilities tick (co 1.0 civYear) ────────

  _tickPassiveAbilities() {
    // 1. Cooldown zdolności
    for (const u of this._units.values()) {
      if (u.abilityCooldownRemaining > 0) {
        u.abilityCooldownRemaining = Math.max(0, u.abilityCooldownRemaining - 1);
      }
    }

    // 2. Drone lifespan — recon_drone expired po 5 turach
    for (const u of [...this._units.values()]) {
      if (u.archetypeId === 'recon_drone') {
        u.turnsAlive = (u.turnsAlive ?? 0) + 1;
        if (GroundUnitFactory.isExpired(u)) {
          EventBus.emit('groundUnit:expired', {
            unitId: u.id, planetId: u.planetId, reason: 'drone_battery',
          });
          this.removeUnit(u.id);
        }
      }
    }

    // 3. Heal nearby — medycy leczą przyjazne sąsiednie jednostki
    for (const medic of this._units.values()) {
      if (medic.abilityId !== 'heal_nearby') continue;
      if ((medic.hp ?? 0) <= 0) continue;
      if (medic.status === 'offline') continue;  // Opcja C v3
      const ability = GroundUnitFactory.getAbility(medic);
      if (!ability) continue;
      const heal = ability.healPerTurn ?? 3;
      const rng  = ability.healRange   ?? 1;
      const allies = this.getUnitsInRange(medic.planetId, medic.q, medic.r, rng, medic.owner);
      for (const ally of allies) {
        if (ally.id === medic.id) continue;
        if ((ally.hp ?? 0) >= (ally.hpMax ?? 0)) continue;
        const newHP = Math.min(ally.hpMax, (ally.hp ?? 0) + heal);
        const delta = newHP - (ally.hp ?? 0);
        ally.hp = newHP;
        if (ally.currentHP != null) ally.currentHP = newHP;
        if (delta > 0) {
          EventBus.emit('groundUnit:healed', {
            medicId: medic.id, targetId: ally.id, amount: delta,
          });
        }
      }
    }

    // 4. Reveal fog — recon drones ujawniają hex'y w promieniu
    for (const scout of this._units.values()) {
      if (scout.abilityId !== 'reveal_fog') continue;
      if ((scout.hp ?? 0) <= 0) continue;
      const ability = GroundUnitFactory.getAbility(scout);
      if (!ability) continue;
      const rng = ability.revealRange ?? 3;
      const hexes = [];
      for (let dq = -rng; dq <= rng; dq++) {
        for (let dr = Math.max(-rng, -dq - rng); dr <= Math.min(rng, -dq + rng); dr++) {
          hexes.push({ q: scout.q + dq, r: scout.r + dr });
        }
      }
      EventBus.emit('groundUnit:fogRevealed', {
        unitId: scout.id, planetId: scout.planetId, hexes,
      });
    }

    // 5. Stealth re-hide — po 2 turach od ujawnienia wraca do 'hidden'
    for (const u of this._units.values()) {
      if (u.abilityId !== 'stealth') continue;
      if (u._stealthState !== 'revealed') continue;
      u._stealthCooldown = Math.max(0, (u._stealthCooldown ?? 0) - 1);
      if (u._stealthCooldown <= 0) {
        u._stealthState = 'hidden';
        EventBus.emit('groundUnit:stealthHidden', { unitId: u.id });
      }
    }
  }

  // ── Ground Unit System: sprawdź czy jednostka weszła na minę ──────────

  _checkMineTrigger(unit) {
    const gs = window.KOSMOS?.gameState;
    if (!gs) return false;
    const key  = `${unit.q}_${unit.r}`;
    const path = `minefields.${unit.planetId}.${key}`;
    const mine = gs.get(path);
    if (!mine) return false;
    if (mine.ownerId === unit.owner) return false; // swoja mina — ignoruj

    const damage = mine.damage ?? 8;
    unit.hp = Math.max(0, (unit.hp ?? 0) - damage);
    if (unit.currentHP != null) unit.currentHP = unit.hp;

    EventBus.emit('groundUnit:mineTrigger', {
      planetId: unit.planetId, q: unit.q, r: unit.r,
      unitId: unit.id, damage,
    });

    // Usuń zużytą minę
    gs.set(path, null, 'mine_consumed');

    if (unit.hp <= 0) {
      EventBus.emit('groundUnit:destroyed', {
        unitId: unit.id, planetId: unit.planetId, owner: unit.owner, killedBy: 'minefield',
      });
      this.removeUnit(unit.id);
      return true; // unit died
    }
    return false;
  }

  /** Aktualny rok gry. */
  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  /** Dystans heksowy (cube coords). */
  _hexDistance(q1, r1, q2, r2) {
    const s1 = -q1 - r1;
    const s2 = -q2 - r2;
    return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(s1 - s2)) / 2;
  }

  /**
   * Combat AI: stary per-unit click-target model ZASTĄPIONY przez stack-hex combat
   * w CombatSystem (Victoria 2 style). Tutaj pozostaje tylko:
   *  - delegacja do CombatSystem.tick() (resolve bitew na hexach)
   *  - AI ruchu wrogów (podchodź do najbliższego gracza jeśli nie ma bitwy)
   *
   * @param {number} deltaYears civYears od ostatniego ticku
   */
  _tickCombatAI(deltaYears = 0) {
    // 1. Stack combat tick — resolve bitwy na hexach (bez klikania, automatycznie)
    const cs = window.KOSMOS?.combatSystem;
    if (cs && deltaYears > 0) cs.tick(deltaYears);

    // 2. AI ruchu: każdy wrogi military unit poza bitwą idzie w stronę najbliższego gracza
    for (const atk of this._units.values()) {
      if (!atk.owner || atk.owner === 'player') continue;
      if (atk.role === 'civilian' || atk.role === 'support' || atk.role === 'drone') continue;
      if (atk.hp <= 0 || atk.status === 'moving' || atk.status === 'offline') continue;
      if (this.isUnitInCombat(atk)) continue; // jest w bitwie — zostaje i walczy

      // Znajdź najbliższą jednostkę gracza na tej samej planecie
      let best = null;
      let bestDist = Infinity;
      for (const u of this._units.values()) {
        if (u.planetId !== atk.planetId) continue;
        if ((u.owner ?? 'player') === atk.owner) continue;
        if (u.hp <= 0) continue;
        if (u._stealthState === 'hidden') continue;
        const d = this._hexDistance(atk.q, atk.r, u.q, u.r);
        if (d < bestDist) { bestDist = d; best = u; }
      }
      if (!best) continue;

      // Blisko wroga → wejdź na jego hex (rozpocznij bitwę). Daleko → krok w jego stronę.
      if (bestDist > 0 && (atk.role === 'military') && (atk.hp / (atk.hpMax ?? atk.maxHp ?? 100)) > 0.3) {
        const stats = getUnitStats(atk.type);
        if ((stats.speedHex ?? 0) > 0) {
          this.moveUnit(atk.id, best.q, best.r);
        }
      }
    }
  }

  _tickMovement(unit, dt) {
    // Krok przez krawędź mapy → natychmiastowy teleport (bez animacji lecącej przez mapę)
    if (unit._wrapStep) {
      const step = unit._path.shift();
      if (step) { unit.q = step.q; unit.r = step.r; }
      unit._wrapStep = false;
      unit._animT = 0;
      // Ground Unit System: wejście na hex — sprawdź minę (może zabić jednostkę)
      if (this._checkMineTrigger(unit)) return;
      if (unit._path.length === 0) {
        unit.status = 'idle';
        unit._fromPixel = null;
        unit._toPixel = null;
        EventBus.emit('groundUnit:moved', { unitId: unit.id, q: unit.q, r: unit.r });
      } else {
        const grid = this._getGrid(unit.planetId);
        if (grid) this._setupNextStep(unit, grid);
      }
      return;
    }

    // Prędkość zależy od terenu: MOVE_SPEED / koszt_terenu
    // Opcja C v3: supply<20 → ruch wolniejszy o 50% (zmęczenie, brak paliwa)
    let terrainSpeed = MOVE_SPEED / (unit._stepCost || 1);
    if (unit.supply != null && unit.supply < 20) terrainSpeed *= (1 / 1.5);  // +50% cost = 2/3 speed
    unit._animT += dt * terrainSpeed;

    if (unit._animT >= 1) {
      // Dotarł do następnego hexa
      const step = unit._path.shift();
      if (step) {
        unit.q = step.q;
        unit.r = step.r;
      }
      // Ground Unit System: wejście na hex — sprawdź minę
      if (this._checkMineTrigger(unit)) return;

      if (unit._path.length === 0) {
        // Koniec ścieżki
        unit.status = 'idle';
        unit._animT = 0;
        unit._fromPixel = null;
        unit._toPixel = null;
        EventBus.emit('groundUnit:moved', { unitId: unit.id, q: unit.q, r: unit.r });
      } else {
        // Następny krok
        unit._animT = 0;
        const grid = this._getGrid(unit.planetId);
        if (grid) this._setupNextStep(unit, grid);
      }
    }
  }

  _tickScan(unit, dt) {
    unit.mission.progress += dt / unit.mission.duration;

    if (unit.mission.progress >= 1) {
      if (unit.mission.type === 'survey') {
        this._completeSurvey(unit);
      } else if (unit.mission.type === 'analyze') {
        this._completeAnalysis(unit);
      }
    }
  }

  // Survey zakończony — wykryj anomalie w promieniu
  _completeSurvey(unit) {
    const grid = this._getGrid(unit.planetId);
    let detectedCount = 0;

    if (grid) {
      const SURVEY_RADIUS = 15;
      const tiles = grid.spiral(unit.q, unit.r, SURVEY_RADIUS);
      for (const tile of tiles) {
        if (tile.anomaly && !tile.anomalyDetected) {
          tile.anomalyDetected = true;
          detectedCount++;
        }
      }
    }

    EventBus.emit('groundUnit:surveyComplete', {
      unitId:        unit.id,
      detectedCount,
      planetId:      unit.planetId,
    });

    unit.status  = 'idle';
    unit.mission = null;
  }

  // Analyze zakończony — ujawnij anomalię i aplikuj efekty
  _completeAnalysis(unit) {
    const grid = this._getGrid(unit.planetId);
    const tile = grid?.get(unit.q, unit.r);

    if (tile && tile.anomaly && tile.anomalyDetected) {
      tile.anomalyRevealed = true;

      EventBus.emit('groundUnit:anomalyFound', {
        unitId:   unit.id,
        tileKey:  `${unit.q},${unit.r}`,
        anomaly:  tile.anomaly,
        planetId: unit.planetId,
      });
    }

    unit.status  = 'idle';
    unit.mission = null;
  }

  // ── A* pathfinding na siatce hex ─────────────────────────────────────────

  _aStar(grid, startQ, startR, goalQ, goalR) {
    const startKey = `${startQ},${startR}`;
    const goalKey  = `${goalQ},${goalR}`;

    // Open set: priority queue (prosty heap na tablicy)
    const open    = [{ q: startQ, r: startR, f: 0 }];
    const gScore  = new Map(); // klucz → koszt dotarcia
    const cameFrom = new Map(); // klucz → poprzedni klucz

    gScore.set(startKey, 0);

    const heuristic = (q, r) => HexGrid.distance(q, r, goalQ, goalR);

    let iterations = 0;
    const MAX_ITERATIONS = 2000; // zabezpieczenie

    while (open.length > 0 && iterations++ < MAX_ITERATIONS) {
      // Znajdź węzeł z najniższym f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0];
      const curKey = `${current.q},${current.r}`;

      if (curKey === goalKey) {
        // Odtwórz ścieżkę (bez startu, z celem)
        return this._reconstructPath(cameFrom, goalKey);
      }

      const neighbors = grid.getNeighbors(current.q, current.r);
      for (const neighbor of neighbors) {
        const cost = MOVE_COST[neighbor.type] ?? 1;
        if (cost === Infinity) continue;  // nieprzejezdny

        const nKey = `${neighbor.q},${neighbor.r}`;
        const tentativeG = (gScore.get(curKey) ?? Infinity) + cost;

        if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
          cameFrom.set(nKey, curKey);
          gScore.set(nKey, tentativeG);
          const f = tentativeG + heuristic(neighbor.q, neighbor.r);

          // Dodaj do open set (lub zaktualizuj)
          const existing = open.find(n => `${n.q},${n.r}` === nKey);
          if (existing) {
            existing.f = f;
          } else {
            open.push({ q: neighbor.q, r: neighbor.r, f });
          }
        }
      }
    }

    return null; // brak ścieżki
  }

  _reconstructPath(cameFrom, goalKey) {
    const path = [];
    let current = goalKey;
    while (cameFrom.has(current)) {
      const [q, r] = current.split(',').map(Number);
      path.unshift({ q, r });
      current = cameFrom.get(current);
    }
    return path;
  }

  // ── Pomocnicze ───────────────────────────────────────────────────────────

  _getGrid(planetId) {
    // Pobierz grid z ColonyManager (per-kolonia) lub z planety
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr) {
      const colony = colMgr.getColony(planetId);
      if (colony?.grid) return colony.grid;
    }
    return null;
  }

  _setupNextStep(unit, grid) {
    const nextHex = unit._path[0];
    if (!nextHex) return;

    // Piksele startowe (aktualny hex)
    const fromLocal = grid.tilePixelPos(unit.q, unit.r, 1);  // znormalizowane (hexSize=1)
    const toLocal   = grid.tilePixelPos(nextHex.q, nextHex.r, 1);

    // Wykryj zawinięcie mapy — jeśli dystans X > połowa szerokości gridu,
    // to krok przechodzi przez krawędź → teleportuj natychmiast (bez animacji)
    const gridW = grid.gridPixelSize(1).w;
    const dx = toLocal.x - fromLocal.x;
    if (Math.abs(dx) > gridW * 0.4) {
      unit._wrapStep = true;  // flaga: pomiń interpolację
    } else {
      unit._wrapStep = false;
    }

    unit._fromPixel = fromLocal;
    unit._toPixel   = toLocal;

    // Oblicz kierunek sprite'a na podstawie rzeczywistego kierunku ruchu
    // Przy zawinięciu: odwróć logikę (leci "przez krawędź" w drugą stronę)
    if (unit._wrapStep) {
      unit._facingLeft = dx > 0;  // odwrócone — wizualnie idzie w drugą stronę
    } else {
      unit._facingLeft = dx < 0;
    }

    // Koszt terenu docelowego hexa → wpływa na prędkość ruchu
    const nextTile = grid.get(nextHex.q, nextHex.r);
    unit._stepCost = nextTile ? (MOVE_COST[nextTile.type] ?? 1) : 1;
  }

  // ── Serializacja ─────────────────────────────────────────────────────────

  serialize() {
    return {
      units: [...this._units.values()].map(u => ({
        id:       u.id,
        type:     u.type,
        planetId: u.planetId,
        q:        u.q,
        r:        u.r,
        status:   u.status,
        facingLeft: u._facingLeft ?? false,
        mission:  u.mission ? { ...u.mission } : null,
        // Faza 6: combat
        owner:    u.owner ?? 'player',
        hp:       u.hp,
        hpMax:    u.hpMax,
        // ── Ground Unit System (nowe pola — obecne tylko dla archetypowych jednostek) ──
        archetypeId: u.archetypeId ?? null,
        factionId:   u.factionId ?? null,
        baseStats:   u.baseStats ?? null,
        currentHP:   u.currentHP ?? u.hp,
        experience:  u.experience ?? 0,
        morale:      u.morale ?? 100,
        turnsAlive:  u.turnsAlive ?? 0,
        abilityId:   u.abilityId ?? null,
        abilityCooldownRemaining: u.abilityCooldownRemaining ?? 0,
        stealthState:    u._stealthState ?? null,
        stealthCooldown: u._stealthCooldown ?? 0,
        // ── Opcja C v3: Supply/Org/Morale ──
        org:                 u.org               ?? null,
        maxOrg:              u.maxOrg            ?? null,
        maxMorale:           u.maxMorale         ?? null,
        supply:              u.supply            ?? null,
        supplyCap:           u.supplyCap         ?? null,
        supplyConsumption:   u.supplyConsumption ?? null,
        noMorale:            u.noMorale          ?? false,
        isSupplier:          u.isSupplier        ?? false,
        supplyTransferRate:  u.supplyTransferRate ?? 0,
        transportStatus:     u.transportStatus   ?? null,
        prevStatus:          u.prevStatus        ?? null,
        unpaidYears:         u.unpaidYears       ?? 0,
        popCost:             u.popCost           ?? 0,
        homeColonyId:        u.homeColonyId      ?? u.planetId,
        // Deploy/Pack state machine (tylko dla supportsDeploy archetypes)
        deployState:         u.deployState       ?? null,
        stateTimer:          u.stateTimer        ?? 0,
        // Victoria 2 stack combat: support target dla ranged
        supportTarget:       u.supportTarget     ?? null,
      })),
      nextId: this._nextId,
      // Ground Unit System: progres zajmowania budynków
      captureProgress: [...this._captureProgress.entries()].map(([unitId, cap]) => ({
        unitId, ...cap,
      })),
      passiveAccum: this._passiveAccum ?? 0,
    };
  }

  restore(data) {
    if (!data) return;
    this._units.clear();
    this._captureProgress.clear();
    this._nextId = data.nextId ?? 1;
    this._passiveAccum = data.passiveAccum ?? 0;

    for (const u of (data.units ?? [])) {
      // Ground Unit System: rozpoznaj archetyp po obecności archetypeId lub zgodności type z UNIT_ARCHETYPES
      const archId = u.archetypeId ?? (UNIT_ARCHETYPES[u.type] ? u.type : null);

      if (archId && UNIT_ARCHETYPES[archId]) {
        // Nowa jednostka archetypowa — odtwórz przez Factory + nadpisz zapisany runtime
        const arch = UNIT_ARCHETYPES[archId];
        const rebuilt = GroundUnitFactory.create(archId, u.factionId ?? 'humanity', u.planetId, u.q, u.r);
        if (!rebuilt) continue;
        rebuilt.id         = u.id;
        rebuilt.owner      = u.owner ?? 'player';
        rebuilt.hp         = u.hp ?? rebuilt.hp;
        rebuilt.hpMax      = u.hpMax ?? rebuilt.hpMax;
        rebuilt.currentHP  = u.currentHP ?? rebuilt.hp;
        rebuilt.status     = u.status ?? 'idle';
        rebuilt.mission    = u.mission ? { ...u.mission } : null;
        rebuilt.experience = u.experience ?? 0;
        rebuilt.morale     = u.morale ?? 100;
        rebuilt.turnsAlive = u.turnsAlive ?? 0;
        rebuilt.abilityCooldownRemaining = u.abilityCooldownRemaining ?? 0;
        rebuilt._stealthState    = u.stealthState ?? (arch.ability === 'stealth' ? 'hidden' : null);
        rebuilt._stealthCooldown = u.stealthCooldown ?? 0;
        rebuilt._facingLeft      = u.facingLeft ?? false;
        // ── Opcja C v3: Supply/Org/Morale — defaulty dla starych save'ów ──
        const noMor = arch.noMorale === true;
        rebuilt.maxOrg            = u.maxOrg            ?? (arch.baseOrg       ?? 10);
        rebuilt.maxMorale         = u.maxMorale         ?? (noMor ? 0 : (arch.baseMorale ?? 10));
        rebuilt.org               = u.org               ?? rebuilt.maxOrg;
        rebuilt.morale            = noMor ? 0 : (u.morale ?? rebuilt.maxMorale);
        rebuilt.supplyCap         = u.supplyCap         ?? (arch.baseSupplyCap ?? 100);
        rebuilt.supply            = u.supply            ?? rebuilt.supplyCap;
        rebuilt.supplyConsumption = u.supplyConsumption ?? (arch.supplyConsumption ?? 2);
        rebuilt.noMorale          = noMor;
        rebuilt.isSupplier        = arch.isSupplier === true;
        rebuilt.supplyTransferRate = arch.supplyTransferRate ?? 0;
        rebuilt.transportStatus   = u.transportStatus   ?? null;
        rebuilt.prevStatus        = u.prevStatus        ?? null;
        rebuilt.unpaidYears       = u.unpaidYears       ?? 0;
        rebuilt.popCost           = u.popCost           ?? 0;
        // Opcja C v3 "macierz": fallback na planetId dla legacy save (v54 i starsze)
        rebuilt.homeColonyId      = u.homeColonyId      ?? u.planetId;
        // Deploy/Pack: legacy save bez deployState → załóż 'deployed' (jak dotychczas
        // stacjonarne). Spawn świeżej jednostki ustawia 'mobile' w createUnit().
        if (arch.supportsDeploy) {
          rebuilt.deployState = u.deployState ?? 'deployed';
          rebuilt.stateTimer  = u.stateTimer  ?? 0;
          this._applyDeployStateStats(rebuilt);
        } else {
          rebuilt.deployState = null;
          rebuilt.stateTimer  = 0;
        }
        rebuilt.supportTarget = u.supportTarget ?? null;
        this._units.set(u.id, rebuilt);
      } else {
        // Legacy jednostka (infantry/mech/garrison/science_rover)
        const stats = getUnitStats(u.type);
        this._units.set(u.id, {
          ...u,
          status:     u.status ?? 'idle',
          mission:    u.mission ? { ...u.mission } : null,
          owner:      u.owner ?? 'player',
          hp:         u.hp ?? stats.hp,
          hpMax:      u.hpMax ?? stats.hp,
          attack:     stats.attack,
          defense:    stats.defense,
          range:      stats.range,
          role:       stats.role,
          _atkCooldown: 0,
          supportTarget: u.supportTarget ?? null,
          _path:      [],
          _animT:     0,
          _fromPixel: null,
          _toPixel:   null,
          _facingLeft: u.facingLeft ?? false,
        });
      }
    }

    // Ground Unit System: przywróć capture progress
    for (const cap of (data.captureProgress ?? [])) {
      if (!cap?.unitId) continue;
      this._captureProgress.set(cap.unitId, {
        planetId:   cap.planetId,
        q:          cap.q,
        r:          cap.r,
        buildingId: cap.buildingId ?? 'capital',
        progress:   cap.progress ?? 0,
      });
    }
  }
}
