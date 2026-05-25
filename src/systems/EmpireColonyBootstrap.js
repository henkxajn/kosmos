// EmpireColonyBootstrap — helper budujący startową kolonię imperium AI
//
// Slice 1 (patch v2 — real planets via StarSystemManager):
//   Imperium AI dostaje REALNĄ kolonię typu Colony na REALNEJ planecie wygenerowanej
//   przez ten sam pipeline co system gracza (SystemGenerator.generateForStar via
//   StarSystemManager.generateAndRegister). System AI jest strukturalnie identyczny
//   z sys_home gracza (planety, księżyce, planetesimals, asteroidy, planetoidy,
//   composition, deposits). Pozwala to na "cichą hybrydę" — gracz może w przyszłości
//   podbić AI i przejąć pełną planetę. Jest też reużywalne dla Slice 2 (ekspansja AI).
//
// Public API:
//   EmpireColonyBootstrap.bootstrapHomeColony(empireId, archetype, homeSystemId)
//     → colonyId (string) albo null przy błędzie
//
// Architektura: używa public API ColonyManager / BuildingSystem / FactorySystem /
// StarSystemManager. Nie modyfikuje core'a tych systemów (Slice 1 hook =
// tylko `colony.ownerEmpireId`).

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { BUILDINGS } from '../data/BuildingsData.js';

// Bazowy próg safety stock per tier (musi pasować do FactorySystem.getSafetyStockTarget).
// Bonus = target - base, aplikowany przez setDemandBonus.
const SAFETY_STOCK_BASE_TIER12 = 3;
const SAFETY_STOCK_BASE_TIER35 = 1;

export class EmpireColonyBootstrap {

  /**
   * Tworzy realną kolonię (typu Colony) dla imperium AI.
   * - Lazy-gen pełnego systemu via StarSystemManager.generateAndRegister
   *   (jeśli home-system AI nie jest jeszcze wygenerowany)
   * - Wybiera home planet z wygenerowanych planet (preferuje rocky)
   * - Wywołuje ColonyManager.createColony z REALNĄ planet entity (positional signature)
   * - Generuje HexGrid via PlanetMapGenerator
   * - Stawia startingBuildings via autoPlaceBuilding (instant, free, no-tech)
   * - Inicjalizuje startingPops per stratum (CivilizationSystem.addPop)
   * - Ustawia safety stocks (FactorySystem.setDemandBonus)
   * - Przełącza factorySystem w reactive mode
   * - Rejestruje kolonię w EmpireRegistry przez addColony
   *
   * @param {string} empireId — id już utworzonego imperium (createEmpire)
   * @param {Object} archetype — pełen obiekt INDUSTRIALIST (rich data)
   * @param {string} homeSystemId — id systemu galaktycznego (np. 'sys_001')
   * @returns {string|null} colonyId nowej kolonii, lub null przy błędzie
   */
  static bootstrapHomeColony(empireId, archetype, homeSystemId) {
    const colonyManager  = window.KOSMOS?.colonyManager;
    const empireRegistry = window.KOSMOS?.empireRegistry;

    if (!colonyManager || !empireRegistry) {
      console.error('[EmpireColonyBootstrap] Brak ColonyManager lub EmpireRegistry');
      return null;
    }
    if (!archetype || !archetype.id) {
      console.error('[EmpireColonyBootstrap] Brak archetype');
      return null;
    }

    const empire = empireRegistry.get(empireId);
    if (!empire) {
      console.error(`[EmpireColonyBootstrap] Imperium ${empireId} nie istnieje`);
      return null;
    }

    const gameYear = Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);

    // 1. Zapewnij że home-system AI ma wygenerowane planety/księżyce/asteroidy
    //    (parytet z sys_home gracza przez StarSystemManager.generateAndRegister).
    let sysData;
    try {
      sysData = this._ensureSystemGenerated(homeSystemId);
    } catch (err) {
      console.error(`[EmpireColonyBootstrap] _ensureSystemGenerated failed: ${err.message}`);
      return null;
    }

    // 2. Wybierz home planet (rocky preferred, fallback non-gas, fallback first)
    const planetEntities = (sysData.planetIds ?? [])
      .map(id => EntityManager.get(id))
      .filter(Boolean);
    const homePlanet = this._pickHomePlanet(planetEntities);
    if (!homePlanet) {
      console.error(`[EmpireColonyBootstrap] Brak planety nadającej się na home w ${homeSystemId}`);
      return null;
    }

    // 3. Utwórz kolonię na REALNEJ planecie (positional signature ColonyManager).
    //    startPop=0 — POPy dodamy ręcznie per stratum poniżej.
    //    credits to NIE resource — wyciągamy z startingResources do colony.credits.
    const startResources = { ...(archetype.startingResources ?? {}) };
    const credits = startResources.credits ?? 0;
    delete startResources.credits;

    const colony = colonyManager.createColony(homePlanet.id, startResources, 0, gameYear);
    if (!colony) {
      console.error(`[EmpireColonyBootstrap] createColony failed dla ${homePlanet.id}`);
      return null;
    }

    // 4. Slice 1 hook: ownerEmpireId. Default null = gracz.
    colony.ownerEmpireId = empireId;
    colony.credits       = credits;
    colony.isHomePlanet  = false;  // AI ma "home" ale flag tylko dla gracza

    // 5. Wygeneruj HexGrid (createColony NIE generuje grida — robimy to tu by
    //    autoPlaceBuilding miało siatkę do iteracji).
    const grid = PlanetMapGenerator.generate(homePlanet, false);
    colony.buildingSystem._grid       = grid;
    colony.buildingSystem._gridHeight = grid.height ?? 10;
    colony.grid                       = grid;

    // 6. Re-sync deposits (już ustawione w createColony, ale defensywne — homePlanet
    //    ma realne deposits z SystemGenerator._generateDepositsForAll).
    colony.buildingSystem.setDeposits(homePlanet.deposits ?? []);

    // 7. Postaw startingBuildings (instant, free, no-tech).
    //    autoPlaceBuilding ignoruje cost / tech / POPy — to bootstrap path.
    const placedCount = this._validateAndPlaceBuildings(colony, archetype.startingBuildings ?? []);

    // 8. Dodaj POPy per stratum.
    //    PO postawieniu budynków, bo habitat dodaje housing przez addHousing.
    const stratumCounts = archetype.startingPops ?? {};
    let totalPops = 0;
    for (const [stratum, count] of Object.entries(stratumCounts)) {
      if (count > 0 && colony.civSystem) {
        colony.civSystem.addPop(stratum, count);
        totalPops += count;
      }
    }

    // 8b. Wymuś rejestrację konsumpcji POP w ResourceSystem kolonii.
    //     addPop() sam nie wywołuje _syncConsumption (bug w CivSystem ale poza
    //     scope Slice 1). Bez tego ResourceSystem konsumuje 0 food/water/energy
    //     dopóki natural tick (_processPopGrowth) nie wywoła sync — co spowodować
    //     może hidden lag w pierwszych civYears. forceConsumptionSync robi to
    //     teraz, bezpośrednio na resourceSystem (bypass EventBus guard).
    if (totalPops > 0 && colony.civSystem?.forceConsumptionSync) {
      colony.civSystem.forceConsumptionSync(colony.resourceSystem);
    }

    // 9. Ustaw safety stocks targety przez FactorySystem.setDemandBonus.
    //    target = base (tier 1-2: 3, tier 3-5: 1) + bonus → bonus = target - base.
    const safetyStocks = archetype.startingSafetyStocks ?? {};
    const stockSummary = [];
    for (const [commodity, target] of Object.entries(safetyStocks)) {
      const def  = COMMODITIES[commodity];
      const base = (def?.tier <= 2) ? SAFETY_STOCK_BASE_TIER12 : SAFETY_STOCK_BASE_TIER35;
      const bonus = Math.max(0, target - base);
      colony.factorySystem?.setDemandBonus(commodity, bonus);
      stockSummary.push(`${commodity}=${target}`);
    }

    // 9b. Przełącz fabrykę w tryb reactive — auto-alokuje FP na deficyty
    //     z 6 źródeł (build/fuel/consumption/trade/safety/export). Bez tego
    //     fabryka stoi w 'manual' i ignoruje safety stock targety.
    colony.factorySystem?.setMode('reactive');

    // 10. Zarejestruj kolonię w imperium (EmpireRegistry.addColony nowy signature).
    empireRegistry.addColony(empireId, homePlanet.id);

    // 11. Log audit trail (DebugLog auto-subskrybuje ai:empireBootstrap).
    EventBus.emit('ai:empireBootstrap', {
      empireId,
      colonyId:      homePlanet.id,
      archetype:     archetype.id,
      buildingCount: placedCount,
      population:    totalPops,
      stocks:        stockSummary,
      year:          gameYear,
    });

    console.log(
      `[EmpireBootstrap] ${empire.name} bootstrapped: colony=${homePlanet.name} ` +
      `(${homePlanet.id}, ${homePlanet.planetType}), system=${homeSystemId} ` +
      `(${planetEntities.length} planet entities), buildings=${placedCount}, ` +
      `pop=${totalPops}, safetyStocks=[${stockSummary.join(', ')}], credits=${credits}`
    );

    return homePlanet.id;
  }

  /**
   * Zapewnia że home-system AI ma wygenerowane planety/księżyce/asteroidy/deposits.
   * Jeśli już wygenerowany (np. gracz wcześniej zwiedził go ekspedycją) — idempotent
   * fast path. Inaczej wywołuje StarSystemManager.generateAndRegister który robi
   * pełen pipeline jak dla sys_home gracza, z seeded PRNG (deterministycznie).
   *
   * @param {string} systemId
   * @returns {Object} sysData z StarSystemManager (zawiera planetIds, moonIds, etc.)
   */
  static _ensureSystemGenerated(systemId) {
    const ssMgr = window.KOSMOS?.starSystemManager;
    if (!ssMgr) {
      throw new Error('starSystemManager unavailable in window.KOSMOS');
    }

    // Idempotencja — czy system już jest zarejestrowany?
    const existing = ssMgr.getSystem?.(systemId);
    if (existing) return existing;

    // Znajdź galaxyStar w galaxyData (źródło dla seedowanej generacji)
    const galaxy = window.KOSMOS?.galaxyData;
    const galaxyStar = galaxy?.systems?.find(s => s.id === systemId);
    if (!galaxyStar) {
      throw new Error(`galaxyStar ${systemId} not found in galaxyData.systems`);
    }

    // Wygeneruj system (uses generateForStar w środku — deterministic seed
    // z hashString(galaxyStar.id), seeded PRNG, Math.random temporarily overridden
    // w try/finally — bezpieczne dla reszty kodu).
    const sysData = ssMgr.generateAndRegister(galaxyStar);

    // Reset explored=true które ssMgr.generateAndRegister ustawia automatycznie.
    // Gracz nie ma free intel na system AI — musi zrobić własny recon.
    // (IntelSystem.initForAllEmpires inicjalizuje level='unknown'.)
    galaxyStar.explored = false;

    return sysData;
  }

  /**
   * Wybiera home planet z listy planet wygenerowanego systemu.
   * Preferencja: rocky → non-gas → first.
   */
  static _pickHomePlanet(planets) {
    if (!Array.isArray(planets) || planets.length === 0) return null;
    const rocky = planets.find(p => p?.planetType === 'rocky');
    if (rocky) return rocky;
    const nonGas = planets.find(p => p?.planetType !== 'gas');
    return nonGas ?? planets[0];
  }

  /**
   * Stawia listę startingBuildings na koloni przez _placeBuildingSmart.
   * Każdy budynek instant (bez kosztu surowców, bez sprawdzania tech).
   * preferredTerrain priorytetyzuje wybór hexa, polar penalty unika biegunów.
   *
   * @returns {number} liczba pomyślnie postawionych budynków
   */
  static _validateAndPlaceBuildings(colony, buildings) {
    if (!Array.isArray(buildings) || !colony?.buildingSystem) return 0;
    let placed = 0;
    for (const spec of buildings) {
      if (!spec?.buildingId) continue;
      const count = Math.max(1, spec.count ?? 1);
      const opts  = (Array.isArray(spec.preferredTerrain) && spec.preferredTerrain.length > 0)
        ? { preferredTerrain: spec.preferredTerrain }
        : {};
      for (let i = 0; i < count; i++) {
        const ok = this._placeBuildingSmart(colony, spec.buildingId, opts);
        if (ok) {
          placed++;
        } else {
          console.warn(
            `[EmpireColonyBootstrap] Nie udało się postawić ${spec.buildingId} ` +
            `(prefer=${spec.preferredTerrain?.join(',') ?? 'any'})`
          );
        }
      }
    }
    return placed;
  }

  /**
   * Smart placer dla AI — scoring hexów zamiast brania pierwszego z listy.
   * Osobny od BuildingSystem.autoPlaceBuilding (gracz używa tamtego, nie chcemy
   * zmieniać UX gracza). Patch v3 Fix 3.
   *
   * Scoring:
   *   - preferredTerrain match: +10  (soft hint, nie wymóg)
   *   - polar (r=0 lub r=last): -5   (latitude penalty production ×0.5)
   *   - sub-polar (r=1 lub r=last-1): -2  (latitude penalty ×0.7)
   *   - adjacency bonus +2 per sąsiad tej samej kategorii (Etap 38 adjacency)
   *   - negatywne anomalie: -3
   *
   * allowedTerrain pozostaje wymogiem twardym (hex musi pasować).
   *
   * Po wybraniu hexa kopia finalizacji z autoPlaceBuilding (BuildingSystem.js:1206-1219):
   *   - tile.buildingId / capitalBase
   *   - _activateBuilding (rejestracja produkcji, housing, employment, faction shift)
   *
   * @returns {boolean} success
   */
  static _placeBuildingSmart(colony, buildingId, opts = {}) {
    const preferred = Array.isArray(opts.preferredTerrain) ? opts.preferredTerrain : [];
    const building = BUILDINGS[buildingId];
    if (!building) return false;

    const bSys = colony.buildingSystem;
    const grid = bSys?._grid;
    if (!grid || typeof grid.forEach !== 'function') return false;

    // Fix: pole w BuildingsData nazywa się `terrainOnly` (nie `allowedTerrain`),
    //   a hex trzyma typ w `tile.type` (nie `tile.terrain`) — wcześniej ten twardy
    //   filtr i miękki preferredTerrain były martwe (zawsze undefined/undefined).
    const allowed = building.terrainOnly;
    const totalRows = grid.height ?? this._inferRows(grid);
    const category = building.category;

    // Scoring każdego dostępnego hexa
    let bestTile = null;
    let bestKey  = null;
    let bestScore = -Infinity;

    grid.forEach(tile => {
      // Hard constraints — skip niedostępne / niezgodne
      if (tile.buildingId) return;
      if (tile.capitalBase) return;
      if (tile.underConstruction) return;
      if (tile.pendingBuild) return;
      if (allowed && !allowed.includes(tile.type)) return;
      if (tile.buildable === false) return;

      let score = 0;

      // preferredTerrain bonus (soft)
      if (preferred.length > 0 && preferred.includes(tile.type)) {
        score += 10;
      }

      // Polar penalty (latMod ×0.5 dla rzędu 0/last, ×0.7 dla 1/last-1)
      if (tile.r === 0 || tile.r === totalRows - 1) score -= 5;
      else if (tile.r === 1 || tile.r === totalRows - 2) score -= 2;

      // Adjacency bonus z budynkami tej samej kategorii (HexGrid.getNeighbors(q, r))
      if (category && typeof grid.getNeighbors === 'function') {
        const neighbors = grid.getNeighbors(tile.q, tile.r);
        const sameCount = neighbors.reduce((acc, n) => {
          if (!n?.buildingId) return acc;
          const nBuilding = BUILDINGS[n.buildingId];
          return nBuilding?.category === category ? acc + 1 : acc;
        }, 0);
        score += sameCount * 2;
      }

      // Negatywna anomalia (yieldMult < 1.0)
      const yieldMult = tile.anomalyEffect?.yieldMult;
      if (yieldMult != null && yieldMult < 1.0) score -= 3;

      if (score > bestScore) {
        bestScore = score;
        bestTile  = tile;
        bestKey   = tile.key ?? `${tile.q},${tile.r}`;
      }
    });

    if (!bestTile) return false;

    // Finalizacja — kopia z BuildingSystem.autoPlaceBuilding linie 1206-1219.
    // Bezpośrednie wywołanie _activateBuilding bypassuje koszt/tech/POPy
    // (bootstrap = handicap startowy, jak istniejący autoPlaceBuilding flow).
    const isCapital = !!building.isCapital;
    if (isCapital) {
      bestTile.capitalBase = true;
    } else {
      bestTile.buildingId    = buildingId;
      bestTile.buildingLevel = 1;
    }
    bSys._activateBuilding(bestKey, buildingId, bestTile.r, bestTile.type, isCapital);
    return true;
  }

  /** Fallback gdy grid nie eksponuje wymiarów — wnioskuj z max tile.r */
  static _inferRows(grid) {
    let maxR = 0;
    grid.forEach(t => { if (t.r > maxR) maxR = t.r; });
    return maxR + 1;
  }
}
