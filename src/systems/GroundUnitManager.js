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

    // Subskrybuj tick czasu (civDeltaYears)
    this._onTick = ({ civDeltaYears: dt }) => this.tick(dt);
    EventBus.on('time:tick', this._onTick);
  }

  // ── Tworzenie jednostki ──────────────────────────────────────────────────

  createUnit(type, planetId, q, r, opts = {}) {
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
    EventBus.emit('groundUnit:removed', { unitId, planetId: unit.planetId });
    return true;
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

  // ── Rozkaz ruchu (A* pathfinding) ────────────────────────────────────────

  moveUnit(unitId, targetQ, targetR) {
    const unit = this._units.get(unitId);
    if (!unit) return false;

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
    // Combat tick — co civYear obce jednostki atakują/ruszają się
    this._combatAccum = (this._combatAccum ?? 0) + civDeltaYears;
    if (this._combatAccum >= 1.0) {
      const steps = Math.floor(this._combatAccum);
      this._combatAccum -= steps;
      for (let i = 0; i < steps; i++) this._tickCombatAI();
    }
    // Faza 6.5: tick okupacji (co klatka — 2-mo timer to dużo civYears)
    this._tickOccupation(civDeltaYears);
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
   * Zwraca { hit: bool, damage, killed, attacker, defender }.
   */
  attackUnit(attackerId, targetId) {
    const atk = this._units.get(attackerId);
    const tgt = this._units.get(targetId);
    if (!atk || !tgt) return { hit: false, reason: 'no_unit' };
    if (atk.planetId !== tgt.planetId) return { hit: false, reason: 'diff_planet' };
    if (atk.owner === tgt.owner) return { hit: false, reason: 'same_owner' };
    if (atk._atkCooldown > 0) return { hit: false, reason: 'cooldown' };

    const dist = this._hexDistance(atk.q, atk.r, tgt.q, tgt.r);
    if (dist > (atk.range ?? 1)) return { hit: false, reason: 'out_of_range' };

    // Damage: max(1, attack - defense) + random variance ±20%
    const base = Math.max(1, (atk.attack ?? 5) - (tgt.defense ?? 0));
    const variance = 0.8 + Math.random() * 0.4;
    const damage = Math.max(1, Math.round(base * variance));

    tgt.hp = Math.max(0, (tgt.hp ?? 0) - damage);
    atk._atkCooldown = 1.0;  // 1 civYear cooldown

    EventBus.emit('groundUnit:attacked', {
      attackerId, targetId, damage,
      targetHP: tgt.hp, targetHPMax: tgt.hpMax,
      planetId: atk.planetId, q: tgt.q, r: tgt.r,
    });

    let killed = false;
    if (tgt.hp <= 0) {
      killed = true;
      EventBus.emit('groundUnit:destroyed', {
        unitId: targetId, planetId: tgt.planetId, owner: tgt.owner, killedBy: attackerId,
      });
      this.removeUnit(targetId);
    }

    return { hit: true, damage, killed };
  }

  /** Aktualny rok gry. */
  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  /** Dystans heksowy (cube coords). */
  _hexDistance(q1, r1, q2, r2) {
    const s1 = -q1 - r1;
    const s2 = -q2 - r2;
    return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(s1 - s2)) / 2;
  }

  /** Combat AI: obce jednostki same atakują/ruszają się. */
  _tickCombatAI() {
    const enemies = [];
    for (const u of this._units.values()) {
      if (u.owner && u.owner !== 'player' && u.role !== 'civilian') enemies.push(u);
    }
    if (enemies.length === 0) return;

    for (const atk of enemies) {
      if (atk.hp <= 0 || atk.status === 'moving') continue;

      // Znajdź najbliższą jednostkę gracza na tej samej planecie
      const targets = [];
      for (const u of this._units.values()) {
        if (u.planetId !== atk.planetId) continue;
        if (u.owner !== 'player') continue;
        if (u.hp <= 0) continue;
        targets.push(u);
      }
      if (targets.length === 0) continue;

      let best = null;
      let bestDist = Infinity;
      for (const t of targets) {
        const d = this._hexDistance(atk.q, atk.r, t.q, t.r);
        if (d < bestDist) { bestDist = d; best = t; }
      }
      if (!best) continue;

      // W zasięgu → atakuj
      if (bestDist <= (atk.range ?? 1)) {
        this.attackUnit(atk.id, best.id);
      } else if ((atk.role === 'military') && (atk.hp / atk.hpMax) > 0.3) {
        // Poruszaj się w stronę celu (jeden krok) — tylko military z >30% HP
        // Stacjonarne (speedHex=0) nie ruszają się
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
    const terrainSpeed = MOVE_SPEED / (unit._stepCost || 1);
    unit._animT += dt * terrainSpeed;

    if (unit._animT >= 1) {
      // Dotarł do następnego hexa
      const step = unit._path.shift();
      if (step) {
        unit.q = step.q;
        unit.r = step.r;
      }

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
      })),
      nextId: this._nextId,
    };
  }

  restore(data) {
    if (!data) return;
    this._units.clear();
    this._nextId = data.nextId ?? 1;
    for (const u of (data.units ?? [])) {
      const stats = getUnitStats(u.type);
      this._units.set(u.id, {
        ...u,
        status:     u.status ?? 'idle',
        mission:    u.mission ? { ...u.mission } : null,
        // Faza 6: combat (defensive defaults for legacy saves)
        owner:      u.owner ?? 'player',
        hp:         u.hp ?? stats.hp,
        hpMax:      u.hpMax ?? stats.hp,
        attack:     stats.attack,
        defense:    stats.defense,
        range:      stats.range,
        role:       stats.role,
        _atkCooldown: 0,
        _path:      [],
        _animT:     0,
        _fromPixel: null,
        _toPixel:   null,
        _facingLeft: u.facingLeft ?? false,
      });
    }
  }
}
