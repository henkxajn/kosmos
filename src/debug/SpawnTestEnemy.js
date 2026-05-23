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
import EventBus from '../core/EventBus.js';
import { createVessel } from '../entities/Vessel.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

export const TEST_ENEMY_ID = 'emp_test_enemy';

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
  reg.addColony(TEST_ENEMY_ID, target.id);

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

/**
 * Spawnuje wrogą flotę (warship) która ZARAZ DOLECI do systemu gracza i
 * odpali bitwę orbitalną. Zajmuje się wszystkim: sprawdza/tworzy imperium
 * testowe, deklaruje wojnę jeśli brak, zeruje dominację orbitalną (ustawioną
 * przez spawnTestEnemy), wysyła flotę z krótkim ETA.
 *
 * @param {object} opts
 * @param {number} [opts.strength=500]
 * @param {boolean} [opts.transport=false]      — dołóż troop bay
 * @param {number} [opts.troopCapacity=5]
 * @param {string[]} [opts.troops]              — archetypy desantu (auto-fill gdy brak)
 * @param {number} [opts.etaYears=0.1]          — za ile lat przybędzie
 */
export function spawnEnemyFleet(opts = {}) {
  const K = window.KOSMOS;
  if (!K?.civMode) {
    console.warn('[spawnEnemyFleet] Gracz jeszcze nie przejął cywilizacji');
    return { success: false, reason: 'no_civ_mode' };
  }

  const reg = K.empireRegistry;
  const warSys = K.warSystem;
  const dipl = K.diplomacySystem;
  if (!reg || !warSys) {
    console.warn('[spawnEnemyFleet] Brak EmpireRegistry / WarSystem');
    return { success: false, reason: 'no_systems' };
  }

  // 1. Upewnij się że wróg istnieje
  if (!reg.get(TEST_ENEMY_ID)) {
    console.log('[spawnEnemyFleet] Brak wroga — tworzę przez spawnTestEnemy()');
    const res = spawnTestEnemy();
    if (!res?.success) return res;
  }

  const homeSystemId = K.homePlanet?.systemId ?? K.activeSystemId ?? 'sys_home';

  // 2. Wojna — jeśli brak aktywnej, zadeklaruj
  const hasWar = warSys.getWarWith?.(TEST_ENEMY_ID)?.active;
  if (!hasWar) {
    if (dipl?.declareWar) {
      dipl.declareWar(TEST_ENEMY_ID, 'debug_spawn_fleet');
    } else {
      warSys.createWar('player', TEST_ENEMY_ID, 'debug');
    }
    console.log(`[spawnEnemyFleet] ⚔ Wojna zadeklarowana z ${TEST_ENEMY_ID}`);
  }

  // 3. Zeruj dominację orbitalną (spawnTestEnemy ustawia ją na gracza)
  const gameState = (window.KOSMOS?.gameState);
  if (gameState?.set) {
    gameState.set(`orbitalDominance.${homeSystemId}`, null, 'debug_clear_dominance');
  }

  // 4. Przygotuj desant
  const transport = !!opts.transport;
  const troopCapacity = transport ? (opts.troopCapacity ?? 5) : 0;
  let embarkedTroops = opts.troops;
  if (transport && !Array.isArray(embarkedTroops)) {
    const pool = ['shock_infantry', 'shock_infantry', 'rocket_artillery', 'medic_unit'];
    embarkedTroops = Array.from({ length: troopCapacity }, (_, i) => pool[i % pool.length]);
  }

  // 5. Spawnuj flotę w home-system wroga + ruch do gracza
  const emp = reg.get(TEST_ENEMY_ID);
  const sourceSystemId = emp?.homeSystemId ?? homeSystemId;
  const fleet = reg.spawnFleet(TEST_ENEMY_ID, {
    strength:          opts.strength ?? 500,
    systemId:          sourceSystemId,
    hasTroopTransport: transport,
    troopCapacity,
    embarkedTroops:    transport ? embarkedTroops : [],
  });
  if (!fleet) {
    console.warn('[spawnEnemyFleet] spawnFleet zwrócił null');
    return { success: false, reason: 'spawn_failed' };
  }

  // 6. Rozkaz ruchu do systemu gracza (z ETA żeby _fleetArrived odpalił bitwę)
  const etaYears = opts.etaYears ?? 0.1;
  reg.moveFleet(TEST_ENEMY_ID, fleet.id, homeSystemId, etaYears);

  const report = {
    success:    true,
    fleetId:    fleet.id,
    strength:   fleet.strength,
    from:       sourceSystemId,
    to:         homeSystemId,
    etaYears,
    transport,
    troops:     embarkedTroops?.length ?? 0,
  };
  console.log(`[spawnEnemyFleet] 🚀 Flota w drodze (ETA ${etaYears}y):`, report);
  return report;
}

/**
 * Combo cheat: spawnTestEnemy (cywilizacja wroga + 3 marines na mapie 2D)
 * + wrogi statek na orbicie z konfigurowalnym kadłubem i modułami.
 *
 * Domyślny statek: Kadłub Średni + 2× silnik jonowy + 1× pancerz standardowy
 * + 2× działo kinetyczne (5/6 slotów).
 *
 * @param {object} opts
 * @param {string} [opts.hullId='hull_medium']
 * @param {string[]} [opts.modules]            — lista ID modułów (override)
 * @param {string} [opts.vesselName='Łowca Testowy']
 */
export function spawnEnemyCiv(opts = {}) {
  const K = window.KOSMOS;
  if (!K?.civMode) {
    console.warn('[spawnEnemyCiv] Gracz jeszcze nie przejął cywilizacji');
    return { success: false, reason: 'no_civ_mode' };
  }

  // 1. Cywilizacja wroga + kolonia + 3 marines (jeśli jeszcze nie ma)
  let civReport;
  if (!K.empireRegistry?.get(TEST_ENEMY_ID)) {
    civReport = spawnTestEnemy();
    if (!civReport?.success) return civReport;
  } else {
    console.log('[spawnEnemyCiv] Wróg już istnieje — pomijam spawnTestEnemy');
    civReport = { targetId: K.empireRegistry.get(TEST_ENEMY_ID)?.colonies?.[0]?.planetId };
  }

  const enemyColonyId = civReport.targetId
    ?? K.empireRegistry.get(TEST_ENEMY_ID)?.colonies?.[0]?.planetId;
  if (!enemyColonyId) {
    console.warn('[spawnEnemyCiv] Nie znaleziono planety kolonii wrogiej');
    return { success: false, reason: 'no_enemy_colony' };
  }

  // 2. Spawnuj statek w orbicie wokół wrogiej kolonii
  const vMgr = K.vesselManager;
  if (!vMgr) {
    console.warn('[spawnEnemyCiv] Brak VesselManager');
    return { success: false, reason: 'no_vessel_manager' };
  }

  const hullId = opts.hullId ?? 'hull_medium';
  const modules = opts.modules ?? [
    'engine_ion', 'engine_ion',
    'armor_standard',
    'weapon_kinetic', 'weapon_kinetic',
  ];

  const enemyBody = EntityManager.get(enemyColonyId);
  const x = enemyBody?.x ?? 0;
  const y = enemyBody?.y ?? 0;

  const vessel = createVessel(hullId, enemyColonyId, {
    name:     opts.vesselName ?? 'Łowca Testowy',
    modules,
    x, y,
    systemId: enemyBody?.systemId ?? K.activeSystemId ?? 'sys_home',
  });

  // Oznacz jako wrogi (pole non-standardowe — UI/combat może je odczytywać)
  vessel.ownerEmpireId = TEST_ENEMY_ID;
  vessel.owner = TEST_ENEMY_ID;
  vessel.isEnemy = true;

  // Orbita nad wrogą kolonią (state=orbiting, dokowanie w enemyColonyId)
  vessel.position.state    = 'orbiting';
  vessel.position.dockedAt = enemyColonyId;
  vessel.status            = 'idle';

  vMgr._vessels.set(vessel.id, vessel);
  EventBus.emit('vessel:created', { vessel });
  // vessel:launched → ThreeRenderer doda sprite na orbitę
  EventBus.emit('vessel:launched', { vessel });
  // positionUpdate zmusi ThreeRenderer._syncVesselPositions do umieszczenia sprite'a
  // na pozycji wrogiego ciała (bez tego sprite siedzi tam gdzie był przy spawn bo
  // _updatePositions pomija orbitujące bez mission)
  EventBus.emit('vessel:positionUpdate', { vessels: [vessel] });

  // Focus kamery na statku (z opóźnieniem — GLB ładuje się async)
  setTimeout(() => {
    EventBus.emit('vessel:focus', { vesselId: vessel.id });
  }, 900);

  const report = {
    success:     true,
    empireId:    TEST_ENEMY_ID,
    enemyColony: enemyColonyId,
    position:    { x: vessel.position.x, y: vessel.position.y, systemId: vessel.systemId },
    activeSys:   K.activeSystemId,
    vessel: {
      id: vessel.id,
      name: vessel.name,
      hull: hullId,
      modules,
      orbiting: enemyColonyId,
    },
    hint: 'Kamera auto-focus za ~1s. Jeśli nie widać: sprawdź `KOSMOS.threeRenderer._vessels.has("' + vessel.id + '")`',
  };
  console.log('[spawnEnemyCiv] ✓ Cywilizacja + statek orbitalny:', report);
  return report;
}

/**
 * Spawn realnego wrogiego statku z misją ATAKU na planetę gracza.
 *
 * Tworzy vessel (kadłub + moduły skalowane wg strength), umieszcza go daleko
 * (domyślnie 15 AU od gwiazdy) po LOSOWEJ stronie orbity, ustawia misję typu
 * 'attack' z celem = planeta domowa gracza, i emituje `vessel:launched`.
 *
 * Od tego momentu vessel leci standardową ścieżką VesselManager (in_transit),
 * obserwatorium gracza go wykrywa gdy wejdzie w zasięg, a `EnemyAttackHandler`
 * odpala bitwę po `vessel:arrived`.
 *
 * To jest docelowa ścieżka także dla AI — gdy obca cywilizacja zbuduje statek
 * w swojej stoczni, użyje dokładnie tego samego flow.
 *
 * @param {object} opts
 * @param {number} [opts.strength=500]       — siła (→ wybór kadłuba i modułów)
 * @param {number} [opts.etaYears=20.0]      — za ile lat dotrze do gracza (interceptable speed)
 * @param {number} [opts.spawnDistanceAU=30] — odległość od gwiazdy przy spawn (M4 P1.5: friendly default)
 * @param {string} [opts.vesselName]         — override nazwy
 *
 * Prędkość statku = spawnDistanceAU / etaYears (default 30/20 = 1.5 AU/rok, matches player speedAU).
 * Historia defaultów: M4 P1 etaYears=0.5 → P1.5 friendly 2.0 → 4.0 (−50%) → 20.0 (interceptable).
 * Agresywne wartości via opts: spawnEnemyAttack({ etaYears: 0.3, spawnDistanceAU: 10 })
 */
export function spawnEnemyAttack(opts = {}) {
  const K = window.KOSMOS;
  if (!K?.civMode) {
    console.warn('[spawnEnemyAttack] Gracz jeszcze nie przejął cywilizacji');
    return { success: false, reason: 'no_civ_mode' };
  }
  const vMgr = K.vesselManager;
  const home = K.homePlanet;
  if (!vMgr || !home) {
    console.warn('[spawnEnemyAttack] Brak VesselManager lub homePlanet');
    return { success: false, reason: 'no_deps' };
  }

  // 1) Upewnij się że wróg istnieje
  if (!K.empireRegistry?.get(TEST_ENEMY_ID)) {
    const res = spawnTestEnemy();
    if (!res?.success) {
      console.warn('[spawnEnemyAttack] spawnTestEnemy zawiódł', res);
      return res;
    }
  }

  const strength = opts.strength ?? 500;
  // M4 P1.5 — friendly defaults: poprzednio 0.5 i 15. Player ma więcej czasu na
  // zareagowanie i widzi wroga lecącego z większego dystansu.
  // 2026-05-15: etaYears 2.0 → 4.0 → 20.0 — 1.5 AU/rok dopasowane do player speedAU (~1.0–1.4),
  // statek jest realnie przechwytywalny przez statki gracza, nie tylko trafialny po trasie.
  const etaYears = opts.etaYears ?? 20.0;
  const spawnDistAU = opts.spawnDistanceAU ?? 30;

  // 2) Dobór kadłuba + modułów wg strength
  //    <200 = lekki skirmisher, 200-800 = cruiser, >800 = battleship
  let hullId, modules;
  if (strength < 200) {
    hullId = 'hull_small';
    modules = ['engine_ion', 'armor_standard', 'weapon_kinetic'];
  } else if (strength < 800) {
    hullId = 'hull_medium';
    modules = ['engine_ion', 'engine_ion', 'armor_standard', 'weapon_kinetic', 'weapon_kinetic'];
  } else {
    hullId = 'hull_large';
    modules = ['engine_ion', 'engine_ion', 'engine_ion', 'armor_standard', 'armor_standard',
               'weapon_kinetic', 'weapon_kinetic', 'weapon_kinetic', 'weapon_kinetic'];
  }

  // 3) Pozycja startowa — losowy kąt, dystans spawnDistAU od gwiazdy (0,0)
  //    Wolimy kierunek z dala od gracza żeby droga była ciekawa
  const AU_TO_PX = GAME_CONFIG.AU_TO_PX;
  const angle = Math.random() * Math.PI * 2;
  const startX = Math.cos(angle) * spawnDistAU * AU_TO_PX;
  const startY = Math.sin(angle) * spawnDistAU * AU_TO_PX;

  // 4) Cel — PRZEWIDYWANA pozycja planety W MOMENCIE PRZYBYCIA (Kepler).
  //    Bez predykcji planeta orbituje wokół gwiazdy i w etaYears jest gdzie indziej,
  //    statek leci do pustego punktu. `_predictPosition` robi to samo co dla misji gracza.
  const systemId = home.systemId ?? K.activeSystemId ?? 'sys_home';
  const gameYear = K.timeSystem?.gameTime ?? 0;
  const arrivalYear = gameYear + etaYears;
  let tx, ty;
  try {
    const predicted = vMgr._predictPosition(home.id, arrivalYear);
    tx = predicted?.x ?? home.x ?? 0;
    ty = predicted?.y ?? home.y ?? 0;
  } catch (_) {
    tx = home.x ?? 0;
    ty = home.y ?? 0;
  }

  // 5) Stwórz vessel
  const vessel = createVessel(hullId, home.id, {
    name:    opts.vesselName ?? `Najeźdźca ${hullId.replace('hull_', '').toUpperCase()}`,
    modules,
    x: startX, y: startY,
    systemId,
  });

  // Oznacz jako wrogi — ObservatorySystem / FleetOverlay / ThreeRenderer to honorują
  vessel.ownerEmpireId = TEST_ENEMY_ID;
  vessel.owner         = TEST_ENEMY_ID;
  vessel.isEnemy       = true;

  // 6) Waypoints przez `_calcRoute` — unika Słońca
  let waypoints = [];
  try {
    const route = vMgr._calcRoute(startX, startY, tx, ty, systemId);
    waypoints = route?.waypoints ?? [];
  } catch (_) { /* fallback: prosta trasa */ }

  // 7) Konstrukcja misji (gameYear/arrivalYear już zdefiniowane wyżej)
  vessel.mission = {
    type:        'attack',
    targetId:    home.id,
    targetName:  home.name ?? 'Planeta gracza',
    startX, startY,
    targetX: tx, targetY: ty,
    liveTargetX: tx, liveTargetY: ty,
    liveOriginX: startX, liveOriginY: startY,
    departYear:  gameYear,
    arrivalYear,
    waypoints,
    phase:       'outbound',
    originId:    null,
  };
  vessel.position.state    = 'in_transit';
  vessel.position.dockedAt = null;
  vessel.status            = 'on_mission';

  // 8) Rejestracja + eventy (standardowa ścieżka jak w launchMission)
  vMgr._vessels.set(vessel.id, vessel);
  EventBus.emit('vessel:created',  { vessel });
  EventBus.emit('vessel:launched', { vessel, mission: vessel.mission });
  EventBus.emit('vessel:positionUpdate', { vessels: [vessel] });

  const report = {
    success:  true,
    vesselId: vessel.id,
    name:     vessel.name,
    hullId,
    modules,
    strength,
    spawn:    { x: startX, y: startY, distAU: spawnDistAU },
    target:   { id: home.id, name: home.name, x: tx, y: ty },
    etaYears,
    arrivalYear: vessel.mission.arrivalYear,
    hint: `Statek leci z ${spawnDistAU} AU. Zbuduj/ulepsz obserwatorium by wykryć wcześniej. Bitwa odpali się po dotarciu.`,
  };
  console.log('[spawnEnemyAttack] 🚀 Wrogi atak w drodze:', report);
  return report;
}
