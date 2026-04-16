// InvasionSystem — orkiestracja inwazji naziemnych (Faza 6)
//
// Domena gameState.invasions[invId] = {
//   id, planetId, aggressor, defender,
//   startYear, landedTroops[], active,
//   playerEmptySince — od którego civYear planeta nie ma obrońców
// }
//
// Triggery:
//   battle:resolved (wygrana obcego lub draw) z location=systemId gracza
//     → wyladuj troops na planecie gracza w tym systemie
//
// Capture:
//   Tick co 1 civYear — jeśli na planecie:
//     • są wrogie jednostki (owner != player)
//     • są 0 player ground units (militarne lub civilne)
//     • trwa już 3+ civYears
//   → ColonyManager.transferColony(planetId, aggressor)

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import gameState from '../core/GameState.js';
import { INVASION_UNIT_POOLS } from '../data/GroundUnitData.js';

const CAPTURE_GRACE_YEARS = 3.0;
const MIN_SURVIVING_STRENGTH_TO_LAND = 30; // flota musi mieć min. siły
const TROOPS_PER_LANDING = 3;               // ile jednostek desantuje

export class InvasionSystem {
  constructor() {
    this._tickAccum = 0;

    // Po każdej bitwie sprawdzamy desant
    EventBus.on('battle:resolved', (ev) => this._onBattleResolved(ev));

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      if (this._tickAccum < 1.0) return;
      const steps = Math.floor(this._tickAccum);
      this._tickAccum -= steps;
      this._tickCaptureChecks(steps);
    });
  }

  // ── Read-only ────────────────────────────────────────────────

  listAll() {
    const inv = gameState.get('invasions') ?? {};
    return Object.values(inv);
  }
  listActive() { return this.listAll().filter(i => i.active); }
  getInvasionForPlanet(planetId) {
    return this.listActive().find(i => i.planetId === planetId) ?? null;
  }

  // ── Intent methods ───────────────────────────────────────────

  /**
   * Ląduj wojska na planecie.
   * @param {string} empireId — agresor
   * @param {string} planetId — cel (planeta gracza)
   * @param {number} troopCount — ile jednostek desantuje (domyślnie TROOPS_PER_LANDING)
   */
  launchInvasion(empireId, planetId, troopCount = TROOPS_PER_LANDING) {
    const body = EntityManager.get(planetId);
    if (!body) return { success: false, reason: 'no_planet' };

    const reg = window.KOSMOS?.empireRegistry;
    const emp = reg?.get(empireId);
    if (!emp) return { success: false, reason: 'no_empire' };

    const gum = window.KOSMOS?.groundUnitManager;
    if (!gum) return { success: false, reason: 'no_gum' };

    // Grid planety
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(planetId);
    const grid = colony?.grid;
    if (!grid) return { success: false, reason: 'no_grid' };

    // Pool jednostek wg archetypu
    const pool = INVASION_UNIT_POOLS[emp.archetype] ?? ['infantry', 'infantry'];

    // Znajdź hexy landing: brzeg siatki, nie ocean, nie capital, nie pod wrogą jednostką
    const landingHexes = this._findLandingHexes(grid, colony);
    if (landingHexes.length === 0) {
      console.warn('[InvasionSystem] Brak miejsca do lądowania na', planetId);
      return { success: false, reason: 'no_landing_zone' };
    }

    const landed = [];
    for (let i = 0; i < troopCount; i++) {
      const hex = landingHexes[i % landingHexes.length];
      const type = pool[Math.floor(Math.random() * pool.length)];
      const unit = gum.createUnit(type, planetId, hex.q, hex.r, { owner: empireId });
      landed.push(unit.id);
    }

    // Zarejestruj w gameState.invasions
    const year = this._year();
    const invId = `inv_${empireId}_${planetId}_${year}`.replace(/\./g, '_');
    let inv = gameState.get(`invasions.${invId}`);
    if (!inv) {
      inv = {
        id:          invId,
        planetId,
        aggressor:   empireId,
        defender:    'player',
        startYear:   year,
        landedTroops: [],
        active:      true,
        playerEmptySince: null,
      };
    }
    inv.landedTroops = [...(inv.landedTroops ?? []), ...landed];
    gameState.set(`invasions.${invId}`, inv, 'invasion_launched');

    EventBus.emit('invasion:launched', { invasionId: invId, empireId, planetId, troops: landed.length });
    EventBus.emit('invasion:troopsLanded', { invasionId: invId, empireId, planetId, unitIds: landed });

    return { success: true, invasionId: invId, landed };
  }

  // ── Event handlers ───────────────────────────────────────────

  _onBattleResolved({ warId, battleId, result }) {
    if (!result) return;
    // Desant tylko gdy:
    //   - jest lokalizacja (systemId gracza)
    //   - uczestnik B był graczem, uczestnik A to flota imperium
    //   - zwycięstwo A lub draw z surviving strength
    const pA = result.participantA;
    const pB = result.participantB;
    if (pA?.type !== 'empire' || pB?.type !== 'player') return;
    const systemId = result.location;
    if (!systemId) return;

    // Obcy musi mieć resztki siły — if destroyed, no landing.
    // Nie wymagamy już winner=='A' — desant idzie też przy remisie i przegranej,
    // o ile pozostaje wystarczająca siła floty ("przedarta blokada").
    const empireId = pA.empireId;
    const startStr = pA.strength ?? 0;
    const survived = startStr - (result.lossesA ?? 0);
    if (survived < MIN_SURVIVING_STRENGTH_TO_LAND) return;

    // Znajdź player colony w tym systemie — najlepsza (home jeśli możliwa)
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;
    const targets = colMgr.getAllColonies().filter(c => {
      const body = EntityManager.get(c.planetId);
      return body?.systemId === systemId;
    });
    if (targets.length === 0) return;

    // Prefer home, else first
    const target = targets.find(c => c.isHomePlanet) ?? targets[0];
    this.launchInvasion(empireId, target.planetId, TROOPS_PER_LANDING);
  }

  // ── Tick: capture checks ─────────────────────────────────────

  _tickCaptureChecks(years) {
    const gum = window.KOSMOS?.groundUnitManager;
    const colMgr = window.KOSMOS?.colonyManager;
    if (!gum || !colMgr) return;

    const currentYear = this._year();
    for (const inv of this.listActive()) {
      const units = gum.getUnitsOnPlanet(inv.planetId);
      const enemyUnits = units.filter(u => u.owner && u.owner !== 'player' && (u.hp ?? 0) > 0);
      const playerMilitary = units.filter(u =>
        (u.owner === 'player' || !u.owner) &&
        u.role === 'military' &&
        (u.hp ?? 0) > 0
      );

      // Brak obcych → inwazja wygasa
      if (enemyUnits.length === 0) {
        const next = { ...inv, active: false, endYear: currentYear, endReason: 'defenders_repelled' };
        gameState.set(`invasions.${inv.id}`, next, 'invasion_repelled');
        EventBus.emit('invasion:repelled', { invasionId: inv.id, planetId: inv.planetId });
        continue;
      }

      // Faza 6.5: capture wymaga DWÓCH warunków naraz:
      //   (1) capital hex owned by aggressor
      //   (2) player nie ma żywych jednostek wojskowych na planecie
      // Gdy choćby jedna military żyje — gracz ma szansę odbić kapitał.
      const colony = colMgr.getColony(inv.planetId);
      const grid = colony?.grid;
      if (!grid) continue;
      const capital = grid.toArray().find(t => t?.capitalBase);
      if (!capital) continue;

      if (capital.owner === inv.aggressor && playerMilitary.length === 0) {
        this._captureColony(inv);
      }
    }
  }

  _captureColony(inv) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr?.transferColony) {
      console.warn('[InvasionSystem] ColonyManager.transferColony brak — nie mogę przejąć');
      return;
    }
    const year = this._year();
    const success = colMgr.transferColony(inv.planetId, inv.aggressor, 'invasion');
    if (!success) return;

    const next = {
      ...inv,
      active: false,
      endYear: year,
      endReason: 'colony_captured',
    };
    gameState.set(`invasions.${inv.id}`, next, 'invasion_successful');
    // colony:captured emituje ColonyManager.transferColony
  }

  /** Dostępne brzegowe hexy do lądowania (poza centralnymi, bez oceanu, bez wrogich jednostek). */
  _findLandingHexes(grid, colony) {
    const edgeHexes = [];
    const fallback = [];
    const gum = window.KOSMOS?.groundUnitManager;
    const allTiles = grid.toArray();  // HexGrid.toArray() — pełna lista

    for (const tile of allTiles) {
      if (!tile) continue;
      if (tile.type === 'ocean') continue;
      if (tile.capitalBase) continue;
      if (gum?.getUnitAt(colony.planetId, tile.q, tile.r)) continue;

      const isEdge = this._isEdgeHex(grid, tile);
      if (isEdge) edgeHexes.push({ q: tile.q, r: tile.r });
      else fallback.push({ q: tile.q, r: tile.r });
    }

    const pool = edgeHexes.length > 0 ? edgeHexes : fallback;
    // Shuffle (nie zawsze te same hexy)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  _isEdgeHex(grid, tile) {
    // Brzegowe hexy mają mniej niż 6 sąsiadów (pierwsza/ostatnia row, brzeg mapy).
    const neighbors = grid.getNeighbors ? grid.getNeighbors(tile.q, tile.r) : [];
    return neighbors.length < 6;
  }

  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }
}
