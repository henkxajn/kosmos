// SpawnTestEnemy — debugowe narzędzie do testowania desantu i walki
//
// Uruchamiane z konsoli: `KOSMOS.debug.spawnTestEnemy()`
// Tworzy wrogie imperium + kolonię na najbliższym niezamieszkałym ciele
// (planeta/księżyc/planetoid) z predefiniowanym layoutem:
//   - Stolica (colony_base) — auto
//   - 3× Elektrownia solarna (solar_farm) Lv2
//   - 1× Farma (farm) Lv2
//   - 1× Studnia (well) Lv2
//   - 1× Kopalnia (mine) Lv3
//   - 1× Fabryka (factory) Lv1
//   - 3× Marines (shock_infantry) obok stolicy, owner=empireId (wrogie)
//
// UWAGA: to jest cheat (bypass kosztów, migracji, save'ów). Stan może się rozjechać
// przy save/load — używać do testów sesyjnych.

import EntityManager from '../core/EntityManager.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { HEX_DIRECTIONS } from '../map/HexGrid.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import gameState from '../core/GameState.js';

const TEST_ENEMY_ID = 'emp_test_enemy';

// Layout budynków do postawienia (buildingId, targetLevel)
const BUILDING_LAYOUT = [
  { id: 'solar_farm', level: 2 },
  { id: 'solar_farm', level: 2 },
  { id: 'solar_farm', level: 2 },
  { id: 'farm',       level: 2 },
  { id: 'well',       level: 2 },
  { id: 'mine',       level: 3 },
  { id: 'factory',    level: 1 },
];

const MARINES_COUNT = 3;

// Zasoby startowe wrogiej kolonii (hojnie — by wszystko działało)
const START_RESOURCES = {
  Fe: 2000, C: 1500, Si: 1500, Cu: 500, Ti: 200, Li: 100, Pt: 20,
  food: 500, water: 500, energy: 1000, research: 100,
  // Commodities potrzebne jako koszty budowy (dla future-proof)
  structural_alloys: 50, electronic_systems: 30, power_cells: 30,
  extraction_systems: 20,
};

const START_POP = 6;  // dość POPów by pokryć popCost wszystkich budynków

export function spawnTestEnemy() {
  const K = window.KOSMOS;
  if (!K?.civMode) {
    console.warn('[SpawnTestEnemy] Gracz jeszcze nie przejął cywilizacji — czekaj na auto-kolonizację');
    return { success: false, reason: 'no_civ_mode' };
  }

  const homePlanet = K.homePlanet;
  if (!homePlanet) {
    console.warn('[SpawnTestEnemy] Brak homePlanet');
    return { success: false, reason: 'no_home_planet' };
  }

  const target = _findNearestUninhabitedBody(homePlanet);
  if (!target) {
    console.warn('[SpawnTestEnemy] Brak wolnego ciała niebieskiego w układzie');
    return { success: false, reason: 'no_target' };
  }

  // 1. Usuń poprzednie imperium testowe (respawn)
  const reg = K.empireRegistry;
  if (reg?.get(TEST_ENEMY_ID)) {
    console.log(`[SpawnTestEnemy] Usuwam poprzednie imperium ${TEST_ENEMY_ID}`);
    reg.destroyEmpire(TEST_ENEMY_ID, 'debug_respawn');
  }

  // Usuń ewentualną poprzednią kolonię testową na tym ciele
  const colMgr = K.colonyManager;
  if (colMgr?.hasColony(target.id)) {
    console.warn(`[SpawnTestEnemy] Cel ${target.name} ma już kolonię — abort`);
    return { success: false, reason: 'target_occupied' };
  }

  const systemId = target.systemId ?? K.activeSystemId ?? 'sys_home';

  // 2. Utwórz wrogie imperium (xenophage — archetyp militarystyczny)
  const empire = reg.createEmpire({
    id:           TEST_ENEMY_ID,
    name:         'Rój Testowy',
    namePL:       'Rój Testowy',
    nameEN:       'Test Swarm',
    archetype:    'xenophage',
    homeSystemId: systemId,
    colonies:     [],
    tech:         { level: 2, focus: 'military' },
    military:     { power: 200 },
  });
  reg.addColony(TEST_ENEMY_ID, systemId, target.id);

  // 3. Utwórz kolonię w ColonyManager — oznacz jako testową wrogą
  const gameYear = Math.floor(K.timeSystem?.gameTime ?? 0);
  const colony = colMgr.createColony(target.id, { ...START_RESOURCES }, START_POP, gameYear);
  if (!colony) {
    reg.destroyEmpire(TEST_ENEMY_ID, 'debug_rollback');
    return { success: false, reason: 'colony_create_failed' };
  }

  // Oznacz kolonię jako testowo-wrogą (dla przyszłych rozróżnień w UI)
  colony.isTestEnemy    = true;
  colony.ownerEmpireId  = TEST_ENEMY_ID;
  colony.name           = `${target.name} [WRÓG]`;

  // 4. Wygeneruj grid (replikacja logiki ColonyManager._onColonyFounded)
  const grid = PlanetMapGenerator.generate(colony.planet, false);
  colony.buildingSystem._grid       = grid;
  colony.buildingSystem._gridHeight = grid.height ?? 10;
  colony.grid = grid;

  // Oznacz wszystkie hexy jako własność wrogiego imperium
  for (const tile of grid.toArray()) {
    if (tile) tile.owner = TEST_ENEMY_ID;
  }

  // 5. Postaw stolicę (auto)
  const bSys = colony.buildingSystem;
  if (!bSys.autoPlaceBuilding('colony_base')) {
    console.warn('[SpawnTestEnemy] Nie udało się postawić stolicy');
  }

  // 6. Postaw budynki wg layoutu z docelowymi poziomami
  const placed = [];
  for (const spec of BUILDING_LAYOUT) {
    const tile = _placeBuilding(bSys, grid, spec.id, spec.level);
    if (tile) placed.push({ id: spec.id, lv: spec.level, tile: tile.key });
    else console.warn(`[SpawnTestEnemy] Nie udało się postawić ${spec.id}`);
  }

  // 7. Znajdź stolicę i postaw marines obok
  const capital = _findCapitalTile(grid);
  const marines = [];
  if (capital) {
    const spots = _findAdjacentFreeHexes(grid, capital, MARINES_COUNT);
    const gum = K.groundUnitManager;
    for (const tile of spots) {
      const unit = gum.createUnit('shock_infantry', target.id, tile.q, tile.r, {
        factionId: TEST_ENEMY_ID,
        owner:     TEST_ENEMY_ID,
      });
      if (unit) marines.push(unit.id);
    }
  } else {
    console.warn('[SpawnTestEnemy] Nie znaleziono hexu stolicy — marines nie spawned');
  }

  // 8. Oznacz ciało jako zbadane (żeby gracz mógł wysłać flotę)
  target.explored = true;

  // 9. Ustaw dominację orbitalną na gracza — test enemy nie ma floty, więc nie ma walki.
  // Bez tego drop troops byłby blokowany przez playerHasOrbitalDominance, który wymaga
  // explicit controller lub brak wrogiej floty (obie spełnione, ale ustawiamy explicit
  // dla wygody testowania i spójności debug flow).
  gameState.set(`orbitalDominance.${systemId}`, {
    controllerId: 'player',
    year: gameYear,
  }, 'spawn_test_enemy_dominance');

  const report = {
    success:    true,
    empireId:   TEST_ENEMY_ID,
    target:     target.name,
    targetId:   target.id,
    distanceAU: DistanceUtils.euclideanAU(homePlanet, target).toFixed(2),
    buildings:  placed,
    marines,
  };
  console.log('[SpawnTestEnemy] ✓ Wróg spawniony:', report);
  return report;
}

// ── Helpers ─────────────────────────────────────────────────────────

function _findNearestUninhabitedBody(homePlanet) {
  const colMgr = window.KOSMOS.colonyManager;
  const candidates = [
    ...EntityManager.getByType('planet'),
    ...EntityManager.getByType('moon'),
    ...EntityManager.getByType('planetoid'),
  ];

  let best = null;
  let bestDist = Infinity;
  for (const body of candidates) {
    if (body.id === homePlanet.id) continue;
    if (colMgr.hasColony(body.id)) continue;
    if (!body.physics) continue;  // musi być aktywny (ma pozycję)
    const d = DistanceUtils.euclideanAU(homePlanet, body);
    if (d < bestDist) {
      bestDist = d;
      best = body;
    }
  }
  return best;
}

// Postaw budynek przez autoPlaceBuilding, następnie wymuś podniesienie do poziomu
// bez obciążania zasobów — wywołujemy wewnętrzne metody BuildingSystem.
function _placeBuilding(bSys, grid, buildingId, targetLevel) {
  // Zapamiętaj jakie tile'e mają już ten buildingId — by znaleźć świeżo postawiony
  const before = new Set();
  for (const tile of grid.toArray()) {
    if (tile?.buildingId === buildingId) before.add(tile.key);
  }

  if (!bSys.autoPlaceBuilding(buildingId)) return null;

  let placed = null;
  for (const tile of grid.toArray()) {
    if (tile?.buildingId === buildingId && !before.has(tile.key)) {
      placed = tile;
      break;
    }
  }
  if (!placed) return null;

  if (targetLevel > 1) _forceUpgradeToLevel(bSys, placed, targetLevel);
  return placed;
}

// Wymuś ulepszenie do docelowego poziomu — tylko bump level + recalc rates.
// NIE obciąża kosztów/POPów (debug cheat).
function _forceUpgradeToLevel(bSys, tile, targetLevel) {
  const entry = bSys._active.get(tile.key);
  if (!entry) return;
  const building = entry.building;

  while (entry.level < targetLevel) {
    const nextLevel = entry.level + 1;
    entry.level         = nextLevel;
    tile.buildingLevel  = nextLevel;
    entry.baseRates     = bSys._calcBaseRates(building, tile, nextLevel);
    entry.effectiveRates = bSys._applyTechMultipliers(entry.baseRates, building);

    const producerId = `building_${tile.key}`;
    const hasRates = Object.keys(entry.effectiveRates || {}).length > 0;
    if (hasRates && bSys.resourceSystem) {
      bSys.resourceSystem.registerProducer(producerId, entry.effectiveRates);
    }
    if (building.housing > 0) {
      entry.housing = (entry.housing || 0) + building.housing;
    }
    if (building.id === 'factory' && bSys._factorySystem) {
      bSys._recalcFactoryPoints();
    }
    if (building.id === 'mine' || building.isMine) bSys._mineLevelDirty = true;
  }
}

function _findCapitalTile(grid) {
  for (const tile of grid.toArray()) {
    if (tile?.capitalBase) return tile;
  }
  return null;
}

// Sąsiedzi stolicy — preferuj puste (bez budynku, bez jednostki, nie ocean)
function _findAdjacentFreeHexes(grid, tile, n) {
  const gum = window.KOSMOS.groundUnitManager;
  const planetId = gum?.getAllUnits().find(u => u.planetId)?.planetId; // nieistotne, użyjemy tile.planetId

  // Ring 1 (direct neighbors), potem ring 2 jeśli brakuje
  const out = [];
  const visited = new Set([tile.key]);
  const queue = [{ q: tile.q, r: tile.r, depth: 0 }];

  while (queue.length > 0 && out.length < n) {
    const { q, r, depth } = queue.shift();
    if (depth >= 3) break;  // ring 3 max — wystarczy
    for (const d of HEX_DIRECTIONS) {
      const nq = q + d.q;
      const nr = r + d.r;
      const key = `${nq},${nr}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const nt = grid.get(nq, nr);
      if (!nt) continue;
      queue.push({ q: nq, r: nr, depth: depth + 1 });
      if (nt.buildingId)       continue;
      if (nt.capitalBase)      continue;
      if (nt.type === 'ocean') continue;
      out.push(nt);
      if (out.length >= n) break;
    }
  }
  return out;
}
