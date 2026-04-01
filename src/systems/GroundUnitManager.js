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

  createUnit(type, planetId, q, r) {
    const id = `gu_${this._nextId++}`;
    const unit = {
      id,
      type,
      planetId,
      q, r,
      status:   'idle',  // idle | moving | scanning | working
      mission:  null,
      // Animacja ruchu (nie serializowane oprócz _heading)
      _path:      [],
      _animT:     0,
      _fromPixel: null,
      _toPixel:   null,
      _facingLeft: false,      // true = sprite odbity (patrzy w lewo)
      _stepCost:   1,          // koszt terenu aktualnego kroku (wpływa na prędkość)
    };
    this._units.set(id, unit);
    EventBus.emit('groundUnit:created', { unitId: id, type, planetId, q, r });
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
      if (unit.status === 'moving') {
        this._tickMovement(unit, civDeltaYears);
      } else if (unit.status === 'scanning' && unit.mission) {
        this._tickScan(unit, civDeltaYears);
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
      })),
      nextId: this._nextId,
    };
  }

  restore(data) {
    if (!data) return;
    this._units.clear();
    this._nextId = data.nextId ?? 1;
    for (const u of (data.units ?? [])) {
      this._units.set(u.id, {
        ...u,
        status:     u.status ?? 'idle',
        mission:    u.mission ? { ...u.mission } : null,
        _path:      [],
        _animT:     0,
        _fromPixel: null,
        _toPixel:   null,
        _facingLeft: u.facingLeft ?? false,
      });
    }
  }
}
