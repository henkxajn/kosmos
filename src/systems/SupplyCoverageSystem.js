// SupplyCoverageSystem — Opcja C v3
//
// System zarządzający zaopatrzeniem jednostek naziemnych:
//   - Coverage: obszar 1 hex wokół Capital/Barracks/Supply Unit (własne źródła)
//   - Refill: jednostki w coverage dostają supply auto (z colony.commodities.military_supplies)
//   - Consumption matrix: idle 1.0×, moving 1.5×, attacking 2.0×, capturing 1.5×, loaded 0×
//   - Attrition: supply<=0 → HP -5%/civY, morale -10/civY (pełny HOI4)
//   - Regen: idle + supply>0 → org +3/civY, morale +5/civY (org>50 required)
//
// Szczegóły: docs/plan-ground-unit-recruitment-option-c-v3.md §9
//
// Komunikacja:
//   Emituje: groundUnit:supplyChanged, groundUnit:orgChanged, groundUnit:moraleChanged,
//            groundUnit:starved, groundUnit:destroyed (cause: 'starvation'),
//            supply:coverageChanged
//   Tick:    wywoływany z GameScene main loop po ColonyManager.update()
//            (argument: civDeltaYears)

import EventBus from '../core/EventBus.js';

// Consumption mnożniki per status jednostki (§4 planu)
const CONSUMPTION_BY_STATUS = {
  idle:       1.0,
  moving:     1.5,
  attacking:  2.0,
  capturing:  1.5,
  offline:    0.0,   // offline nic nie robi, nic nie zużywa (offline to brak upkeep)
  in_cargo:   0.0,   // synonim dla loaded
};

// Auto-refill: 20 supply/civY z Capital/Barracks; 30 dla Supply Unit (priorytet)
const CAPITAL_REFILL_RATE  = 20;
const SUPPLIER_REFILL_RATE = 30;

// Regen idle (z supply>0)
const ORG_REGEN_RATE     = 3;   // /civY
const MORALE_REGEN_RATE  = 5;   // /civY (wymaga org>50)
const MORALE_REGEN_ORG_THRESHOLD = 50;

// Attrition przy supply=0
const ATTRITION_MORALE_PER_CIVY  = 10;
const ATTRITION_HP_FRACTION_PER_CIVY = 0.05;  // 5% maxHp/civY

export class SupplyCoverageSystem {
  /**
   * @param {ColonyManager}     colonyManager
   * @param {GroundUnitManager} groundUnitManager
   */
  constructor(colonyManager, groundUnitManager) {
    this._colonyManager     = colonyManager;
    this._groundUnitManager = groundUnitManager;
    // Cache coverage map per planet — invalidowany gdy zmienia się układ Capital/Barracks/SupplyUnit.
    // Na razie zawsze przeliczane per tick (tanie dla ~30 unitów × ~15 heksów).
    this._coverageCache = new Map();  // planetId → Map<hexKey, { type, sourceId? }>

    // Subskrypcja tick'u czasu cywilizacyjnego (spójnie z ColonyManager)
    this._onTick = ({ civDeltaYears }) => this.update(civDeltaYears);
    EventBus.on('time:tick', this._onTick);
  }

  /**
   * Główny tick — wywoływany z GameScene po ColonyManager.update().
   * @param {number} civDeltaYears
   */
  update(civDeltaYears) {
    if (!civDeltaYears || civDeltaYears <= 0) return;

    const planetIds = this._getActivePlanetIds();
    for (const pid of planetIds) {
      const colony = this._colonyManager.getColony(pid);
      const units  = this._groundUnitManager.getUnitsOnPlanet?.(pid) ?? [];
      if (units.length === 0) continue;

      const coverage = this._computeCoverage(pid, colony, units);
      this._coverageCache.set(pid, coverage);

      // ── Faza 1: Refill jednostek w zasięgu Capital/Barracks (non-supplier) ──
      for (const u of units) {
        if (u.transportStatus === 'loaded')    continue;
        if (u.owner && u.owner !== 'player')   continue;   // tylko gracz (na razie)
        if (u.isSupplier)                      continue;   // suppliery w fazie 2
        const cov = coverage.get(this._key(u.q, u.r));
        if (!cov)                              continue;
        if (cov.type !== 'capital' && cov.type !== 'barracks') continue;
        const stock = colony?.commodities?.military_supplies ?? 0;
        if (stock <= 0) continue;
        const need = Math.max(0, (u.supplyCap ?? 100) - (u.supply ?? 0));
        if (need <= 0) continue;
        const rate = CAPITAL_REFILL_RATE * civDeltaYears;
        const draw = Math.min(need, rate, stock);
        if (draw > 0) {
          u.supply = (u.supply ?? 0) + draw;
          colony.commodities.military_supplies -= draw;
          EventBus.emit('groundUnit:supplyChanged', { unitId: u.id, supply: u.supply, max: u.supplyCap });
        }
      }

      // ── Faza 2: Supply Units tankują się w Capital/Barracks ──
      for (const u of units) {
        if (!u.isSupplier || u.transportStatus === 'loaded') continue;
        if (u.owner && u.owner !== 'player') continue;
        const cov = coverage.get(this._key(u.q, u.r));
        if (!cov) continue;
        if (cov.type !== 'capital' && cov.type !== 'barracks') continue;
        const stock = colony?.commodities?.military_supplies ?? 0;
        if (stock <= 0) continue;
        const need = Math.max(0, (u.supplyCap ?? 200) - (u.supply ?? 0));
        if (need <= 0) continue;
        const rate = SUPPLIER_REFILL_RATE * civDeltaYears;
        const draw = Math.min(need, rate, stock);
        if (draw > 0) {
          u.supply = (u.supply ?? 0) + draw;
          colony.commodities.military_supplies -= draw;
          EventBus.emit('groundUnit:supplyChanged', { unitId: u.id, supply: u.supply, max: u.supplyCap });
        }
      }

      // ── Faza 3: Suppliery karmią sąsiadów (1 hex) ──
      // Kluczowe dla planu gracz-friendly: Supply Unit ma cap 200, transferuje 10/civY do każdego.
      for (const su of units) {
        if (!su.isSupplier || su.transportStatus === 'loaded') continue;
        if ((su.supply ?? 0) <= 0) continue;
        if (su.owner && su.owner !== 'player') continue;

        const nbrs = this._getAdjacentAllied(units, su, 1);
        for (const ally of nbrs) {
          if (ally.id === su.id) continue;
          if (ally.transportStatus === 'loaded') continue;
          const need = Math.max(0, (ally.supplyCap ?? 100) - (ally.supply ?? 0));
          if (need <= 0) continue;
          const rate = (su.supplyTransferRate ?? 10) * civDeltaYears;
          const xfer = Math.min(need, rate, su.supply);
          if (xfer > 0) {
            ally.supply = (ally.supply ?? 0) + xfer;
            su.supply  -= xfer;
            EventBus.emit('groundUnit:supplyChanged', { unitId: ally.id, supply: ally.supply, max: ally.supplyCap });
            if (su.supply <= 0) break;
          }
        }
        EventBus.emit('groundUnit:supplyChanged', { unitId: su.id, supply: su.supply, max: su.supplyCap });
      }

      // ── Faza 4: Konsumpcja (tylko jednostki poza zasięgiem refillu) ──
      for (const u of units) {
        if (u.transportStatus === 'loaded') continue;  // FROZEN — transport stasis
        if (u.owner && u.owner !== 'player') continue;

        const cov = coverage.get(this._key(u.q, u.r));
        const inRefillZone = cov && (cov.type === 'capital' || cov.type === 'barracks');
        // Coverage typu 'supplier' NIE zwalnia z konsumpcji — faza 3 transferuje supply,
        // ale jednostka wciąż "pracuje". Wyjątek: Capital/Barracks refill jest na tyle szybki
        // że jednostka nie spada poniżej cap (i tak konsumuje, ale od razu dostaje z powrotem).
        // Dla czytelności: w refill zone pomijamy konsumpcję (net-zero effect).
        if (inRefillZone) continue;

        const mult = CONSUMPTION_BY_STATUS[u.status] ?? 1.0;
        if (mult === 0) continue;

        const base = u.supplyConsumption ?? 2;
        const spent = base * mult * civDeltaYears;
        const newSupply = Math.max(0, (u.supply ?? 0) - spent);
        if (newSupply !== u.supply) {
          u.supply = newSupply;
          EventBus.emit('groundUnit:supplyChanged', { unitId: u.id, supply: u.supply, max: u.supplyCap });
        }
      }

      // ── Faza 5: Attrition przy starvation (supply=0) ──
      for (const u of units) {
        if (u.transportStatus === 'loaded') continue;
        if (u.owner && u.owner !== 'player') continue;
        if ((u.supply ?? 0) > 0) continue;

        // Morale -10/civY (jeśli nie noMorale)
        if (!u.noMorale) {
          const newMor = Math.max(0, (u.morale ?? 0) - ATTRITION_MORALE_PER_CIVY * civDeltaYears);
          if (newMor !== u.morale) {
            u.morale = newMor;
            EventBus.emit('groundUnit:moraleChanged', { unitId: u.id, morale: u.morale, max: u.maxMorale ?? 100 });
          }
        }
        // HP -5%/civY
        const maxHp = u.hpMax ?? u.baseStats?.hp ?? u.hp ?? 10;
        const hpLoss = maxHp * ATTRITION_HP_FRACTION_PER_CIVY * civDeltaYears;
        const newHp  = Math.max(0, (u.hp ?? 0) - hpLoss);
        if (newHp !== u.hp) {
          u.hp = newHp;
          if (u.currentHP != null) u.currentHP = u.hp;
        }

        // Emit ostrzeżenie (gracz widzi w evenlog/alert) — tylko raz per cykl w granicach 1 civY
        if (!u._starvedEmitted) {
          EventBus.emit('groundUnit:starved', { unitId: u.id, planetId: u.planetId });
          u._starvedEmitted = true;
        }

        // Śmierć z głodu
        if (u.hp <= 0) {
          EventBus.emit('groundUnit:destroyed', {
            unitId: u.id, planetId: u.planetId, owner: u.owner, killedBy: null,
            archetypeId: u.archetypeId ?? null,
            popCost:     u.popCost ?? 0,
            cause:       'starvation',
          });
          this._groundUnitManager.removeUnit?.(u.id);
        }
      }

      // Reset flagi starved dla jednostek które odzyskały supply
      for (const u of units) {
        if ((u.supply ?? 0) > 0 && u._starvedEmitted) u._starvedEmitted = false;
      }

      // ── Faza 6: Regen idle z supply>0 ──
      for (const u of units) {
        if (u.transportStatus === 'loaded') continue;
        if (u.owner && u.owner !== 'player') continue;
        if ((u.supply ?? 0) <= 0) continue;
        if (u.status !== 'idle') continue;

        const maxOrg = u.maxOrg ?? 100;
        if ((u.org ?? 0) < maxOrg) {
          u.org = Math.min(maxOrg, (u.org ?? 0) + ORG_REGEN_RATE * civDeltaYears);
          EventBus.emit('groundUnit:orgChanged', { unitId: u.id, org: u.org, max: maxOrg });
        }
        if (!u.noMorale && (u.org ?? 0) > MORALE_REGEN_ORG_THRESHOLD) {
          const maxMor = u.maxMorale ?? 100;
          if ((u.morale ?? 0) < maxMor) {
            u.morale = Math.min(maxMor, (u.morale ?? 0) + MORALE_REGEN_RATE * civDeltaYears);
            EventBus.emit('groundUnit:moraleChanged', { unitId: u.id, morale: u.morale, max: maxMor });
          }
        }
      }
    }

    // Powiadom UI o zmianach coverage (np. ColonyOverlay toggle S renderuje tiles)
    EventBus.emit('supply:coverageChanged', {});
  }

  /** Zwraca coverage map dla planety (do UI overlay). Cache wypełniany przez update(). */
  getCoverage(planetId) {
    return this._coverageCache.get(planetId) ?? new Map();
  }

  // ── Helpery ────────────────────────────────────────────────────────────────

  _getActivePlanetIds() {
    const pids = new Set();
    const mgr = this._groundUnitManager;
    if (!mgr) return [];
    for (const u of mgr.getAllUnits?.() ?? mgr._units?.values() ?? []) {
      if (u.planetId) pids.add(u.planetId);
    }
    return [...pids];
  }

  _key(q, r) { return `${q},${r}`; }

  /**
   * Zwraca coverage map: hex → { type, sourceId? }.
   * type ∈ { 'capital', 'barracks', 'supplier' }
   * Dla przecinających się zasięgów wygrywa kolejność: capital > barracks > supplier.
   */
  _computeCoverage(planetId, colony, units) {
    const map = new Map();

    // 1. Capital hex + 6 sąsiadów
    const grid = colony?.grid;
    if (grid) {
      // Znajdź hex Capital
      for (const tile of grid.toArray()) {
        if (tile?.capitalBase) {
          this._addHexAndNeighbors(map, grid, tile.q, tile.r, { type: 'capital' });
          break;
        }
      }
      // 2. Barracks hexes
      const bSys = colony?.buildingSystem;
      if (bSys) {
        for (const [, entry] of bSys._active) {
          const id = entry.building.id;
          if (id !== 'barracks_lv1' && id !== 'barracks_lv2' && id !== 'barracks_lv3') continue;
          const tile = entry.tile;
          if (!tile) continue;
          this._addHexAndNeighbors(map, grid, tile.q, tile.r,
            { type: 'barracks' }, /* overwriteCapital */ false);
        }
      }
    }

    // 3. Supply Units (z magazynem supply>0)
    for (const u of units) {
      if (!u.isSupplier || (u.supply ?? 0) <= 0) continue;
      if (u.transportStatus === 'loaded') continue;
      if (u.owner && u.owner !== 'player') continue;
      this._addHexAndNeighbors(map, grid, u.q, u.r,
        { type: 'supplier', sourceId: u.id }, /* overwriteCapital */ false);
    }

    return map;
  }

  _addHexAndNeighbors(map, grid, q, r, info, overwriteCapital = true) {
    const k0 = this._key(q, r);
    if (overwriteCapital || !map.has(k0) || map.get(k0).type === 'supplier') {
      map.set(k0, info);
    }
    if (!grid) return;
    const ring = grid.ring(q, r, 1);
    for (const tile of ring) {
      if (!tile) continue;
      const k = this._key(tile.q, tile.r);
      const prev = map.get(k);
      if (!prev) { map.set(k, info); continue; }
      // Priorytet: capital > barracks > supplier — nie nadpisuj silniejszego źródła słabszym
      if (prev.type === 'capital')  continue;
      if (prev.type === 'barracks' && info.type === 'supplier') continue;
      map.set(k, info);
    }
  }

  /** Sąsiednie allied units w promieniu `rng` hexów (włącznie z siebie). */
  _getAdjacentAllied(units, src, rng = 1) {
    const result = [];
    for (const u of units) {
      if (u.owner !== src.owner) continue;
      const dist = this._hexDistance(src.q, src.r, u.q, u.r);
      if (dist <= rng) result.push(u);
    }
    return result;
  }

  _hexDistance(q1, r1, q2, r2) {
    const dq = q1 - q2;
    const dr = r1 - r2;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  // ── Serializacja (lekka — coverage przeliczany z live state) ──────────────

  serialize() { return {}; }
  restore(_data) { /* nothing — coverage przeliczany per tick */ }
}
