// CombatSandbox — scenariusz testowy M2 combat systems.
//
// Jedno kliknięcie produkuje deterministyczny stan bojowy:
//   - Gracz: kolonia „Bastion" na wewnętrznej rocky w HZ, 4 vessele na orbicie
//     (3× warship + 1× science_vessel), wszystkie techy odblokowane, pełne
//     stocki surowców.
//   - Wróg: „emp_sandbox_enemy" (archetyp xenophage) z kolonią na najdalszej
//     planecie tego samego układu, 3× warship orbitujące. WAR od startu.
//   - Feature flagi M1+M2 wszystkie ON (co zarejestrowane w GAME_CONFIG.FEATURES).
//   - timeSystem.gameTime = 5 — unika pierwszych ticków gdy systemy 4X się
//     rozpędzają.
//
// Scenariusz jest PLAYER-INITIATED — wrogie vessele NIE mają mission.attack,
// gracz sam wydaje ordery (pursue/intercept/moveToPoint) i testuje combat.
//
// Bootowane z GameScene auto-colonization IIFE gdy window.KOSMOS.scenario
// === 'combat_sandbox'. Po załadowaniu ustawia KOSMOS.scenarioMode =
// 'combat_sandbox' — flaga dla debug helperów sandbox-only.

import EntityManager from '../core/EntityManager.js';
import EventBus from '../core/EventBus.js';
import gameState from '../core/GameState.js';
import { createVessel } from '../entities/Vessel.js';
import { PlanetMapGenerator } from '../map/PlanetMapGenerator.js';
import { HEX_DIRECTIONS } from '../map/HexGrid.js';
import { TECHS } from '../data/TechData.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

export const SANDBOX_ENEMY_ID = 'emp_sandbox_enemy';

// ── Konfiguracja deterministyczna ─────────────────────────────────

const START_YEAR = 5;                    // unika pierwszych ticków systemów 4X
const PLAYER_POPULATION = 6;
const ENEMY_POPULATION = 4;

// Layout startowy gracza — minimalny żeby ekonomia nie tonęła od razu
const PLAYER_BUILDINGS = [
  { id: 'solar_farm', level: 2 },
  { id: 'solar_farm', level: 2 },
  { id: 'solar_farm', level: 2 },
  { id: 'solar_farm', level: 2 },
  { id: 'farm',       level: 2 },
  { id: 'farm',       level: 2 },
  { id: 'well',       level: 2 },
  { id: 'well',       level: 2 },
  { id: 'mine',       level: 2 },
  { id: 'shipyard',   level: 2 },
];

const ENEMY_BUILDINGS = [
  { id: 'solar_farm', level: 2 },
  { id: 'solar_farm', level: 2 },
  { id: 'farm',       level: 2 },
  { id: 'well',       level: 2 },
  { id: 'mine',       level: 2 },
];

const ENEMY_START_RESOURCES = {
  Fe: 2000, C: 1500, Si: 1500, Cu: 500, Ti: 200, Li: 100, Hv: 20,
  food: 500, water: 500, energy: 1000, research: 100,
  structural_alloys: 50, electronic_systems: 30, power_cells: 30,
  extraction_systems: 20,
};

// Flota gracza — 3 warship + explorer (science_vessel osobno).
// Wyłącznie kadłuby bojowe (frigate/destroyer/cruiser) — hull_small/medium/large
// nie są przeznaczone do walki. Sloty: propulsion + utility (weapons, armor).
const PLAYER_WARSHIPS = [
  {
    // Krążownik — flagship (8 slotów: 3P + 5U)
    name:    'Obrońca Alfa',
    hullId:  'hull_cruiser',
    modules: ['engine_ion', 'engine_ion', 'engine_ion',
              'armor_standard', 'armor_standard',
              'weapon_kinetic', 'weapon_kinetic', 'weapon_kinetic'],
  },
  {
    // Niszczyciel (6 slotów: 2P + 4U)
    name:    'Obrońca Beta',
    hullId:  'hull_destroyer',
    modules: ['engine_ion', 'engine_ion',
              'armor_standard', 'armor_standard',
              'weapon_kinetic', 'weapon_kinetic'],
  },
  {
    // Fregata (4 sloty: 1P + 3U)
    name:    'Obrońca Gamma',
    hullId:  'hull_frigate',
    modules: ['engine_ion', 'armor_standard',
              'weapon_kinetic', 'weapon_kinetic'],
  },
];

const ENEMY_WARSHIPS = [
  {
    // Krążownik — flagship wroga
    name:    'Łowca Alfa',
    hullId:  'hull_cruiser',
    modules: ['engine_ion', 'engine_ion', 'engine_ion',
              'armor_standard', 'armor_standard',
              'weapon_kinetic', 'weapon_kinetic', 'weapon_kinetic'],
  },
  {
    // Niszczyciel
    name:    'Łowca Beta',
    hullId:  'hull_destroyer',
    modules: ['engine_ion', 'engine_ion',
              'armor_standard', 'armor_standard',
              'weapon_kinetic', 'weapon_kinetic'],
  },
  {
    // Fregata
    name:    'Łowca Gamma',
    hullId:  'hull_frigate',
    modules: ['engine_ion', 'armor_standard',
              'weapon_kinetic', 'weapon_kinetic'],
  },
];

// Feature flagi — M1 istniejące + M2a/M2b planowane. Iterujemy z guardem
// `f in FEATURES` — flagi z przyszłych milestonów włączą się automatycznie
// po ich rejestracji, bez zmian w tym pliku.
const SANDBOX_FEATURE_FLAGS = [
  // M1 (save v65) — zarejestrowane
  'movementOrders',
  'fleetMaterialization',
  // M2a (save v66, planowane) — proximity + vessel combat + unified aggregator
  'proximitySystem',
  'vesselCombat',
  'unifiedAggregator',
  // M2b (save v67, planowane) — intel + POI + prediction cone
  'intelContactState',
  'predictionCone',
  'poiSystem',
];

// ── Public API ────────────────────────────────────────────────────

/**
 * Załaduj Combat Sandbox. Wywoływane z GameScene auto-colonization IIFE.
 * @param {GameScene} scene
 * @param {Planet} civPlanet — planeta macierzysta gracza (już wybrana przez SystemGenerator)
 * @returns {{ playerFleet: string[], enemyFleet: string[], enemyColonyId: string }}
 */
export function loadCombatSandbox(scene, civPlanet) {
  // 1) Kolonia gracza — reuse istniejący _setupColony
  scene._setupColony(civPlanet);
  window.KOSMOS.civName = 'Combat Sandbox';
  civPlanet.name = 'Bastion';
  const playerColony = scene.colonyManager.getColony(civPlanet.id);
  if (playerColony) playerColony.name = 'Bastion';

  // 2) Odblokuj WSZYSTKIE technologie (jedno restore, emit events per tech)
  scene.techSystem.restore({ researched: Object.keys(TECHS) });

  // 3) Zapełnij stocki — wszystkie elementy + commodities + research
  _fillResourceStocks(scene.resourceSystem);

  // 4) Ustaw populację + wygeneruj grid + postaw stolicę i layout
  scene.civSystem.setPopulation(PLAYER_POPULATION);
  const playerGrid = PlanetMapGenerator.generate(civPlanet, true);
  scene.buildingSystem._grid       = playerGrid;
  scene.buildingSystem._gridHeight = playerGrid.height;
  if (playerColony) playerColony.grid = playerGrid;
  _placeLayout(scene.buildingSystem, playerGrid, PLAYER_BUILDINGS);

  // 5) Spawn floty gracza na orbicie Bastionu
  const playerFleetIds = _spawnOrbitingFleet(
    scene, civPlanet, PLAYER_WARSHIPS,
    { empireId: null, isEnemy: false, ownerTag: 'player' }
  );
  // Explorer — science_vessel przez VesselManager.createAndRegister (standardowy flow)
  const explorer = scene.vesselManager.createAndRegister('science_vessel', civPlanet.id, {
    name: 'Badacz Sigma',
  });
  explorer.position.state    = 'orbiting';
  explorer.position.dockedAt = civPlanet.id;
  explorer.status            = 'idle';
  playerColony.fleet.push(explorer.id);
  playerFleetIds.push(explorer.id);
  EventBus.emit('vessel:launched',       { vessel: explorer });
  EventBus.emit('vessel:positionUpdate', { vessels: [explorer] });

  // 6) Wybierz najdalszą planetę jako cel wrogiej kolonii
  const enemyPlanet = _pickFarthestAvailablePlanet(scene, civPlanet);
  if (!enemyPlanet) {
    console.warn('[CombatSandbox] Brak wolnej dalekiej planety — skip enemy setup');
    _activateFeatureFlags(scene);
    return { playerFleet: playerFleetIds, enemyFleet: [], enemyColonyId: null };
  }

  // 7) Wrogie imperium + kolonia na dalekiej planecie
  const enemyColonyId = _setupEnemyCivilization(scene, enemyPlanet);

  // 8) Flota wroga na orbicie enemy colony
  const enemyFleetIds = _spawnOrbitingFleet(
    scene, enemyPlanet, ENEMY_WARSHIPS,
    { empireId: SANDBOX_ENEMY_ID, isEnemy: true, ownerTag: SANDBOX_ENEMY_ID }
  );

  // 9) WAR
  _declareSandboxWar(scene);

  // 10) Dominacja orbitalna gracza nad jego systemem (player home)
  //     Uwaga: cały sandbox to 1 system, więc to dominacja nad sys_home.
  const systemId = civPlanet.systemId ?? window.KOSMOS?.activeSystemId ?? 'sys_home';
  gameState.set(`orbitalDominance.${systemId}`, {
    controllerId: 'player',
    year: START_YEAR,
  }, 'combat_sandbox');

  // 11) Feature flagi M1 + M2 (ON gdy zarejestrowane w GAME_CONFIG.FEATURES)
  _activateFeatureFlags(scene);

  // 12) Czas gry = rok 5 (stabilny baseline)
  if (scene.timeSystem) scene.timeSystem.gameTime = START_YEAR;

  // 13) Scenario mode flag + snapshot default pozycji (dla sandboxResetPositions)
  window.KOSMOS.scenarioMode = 'combat_sandbox';
  window.KOSMOS._sandboxDefaults = {
    playerHomeId: civPlanet.id,
    enemyHomeId:  enemyPlanet.id,
    playerFleet:  playerFleetIds.slice(),
    enemyFleet:   enemyFleetIds.slice(),
  };

  // 14) Aktywuj kolonię gracza w UI + otwórz ColonyOverlay
  scene.colonyManager.switchActiveColony(civPlanet.id);
  scene.uiManager?.overlayManager?.openPanel?.('colony');

  console.log(`[CombatSandbox] ✓ Załadowano: gracz=${playerFleetIds.length} vesseli, ` +
              `wróg=${enemyFleetIds.length} vesseli na ${enemyPlanet.name}. ` +
              `Feature flagi aktywne: ${_listActiveFlags().join(', ')}.`);

  return {
    playerFleet:    playerFleetIds,
    enemyFleet:     enemyFleetIds,
    enemyColonyId,
  };
}

// ── Helpers: surowce, budynki, flota ──────────────────────────────

function _fillResourceStocks(rs) {
  if (!rs) return;
  const gains = {};
  for (const id of rs.inventory.keys()) gains[id] = 999;
  gains.food     = 500;
  gains.water    = 500;
  gains.research = 20000;
  rs.receive(gains);
}

function _placeLayout(bSys, grid, layout) {
  // Stolica najpierw (auto)
  if (!bSys.autoPlaceBuilding('colony_base')) {
    console.warn('[CombatSandbox] Nie postawiono stolicy');
  }
  for (const spec of layout) {
    const tile = _placeBuilding(bSys, grid, spec.id, spec.level);
    if (!tile) console.warn(`[CombatSandbox] Nie postawiono ${spec.id}`);
  }
}

// Postaw budynek via autoPlaceBuilding + wymuś upgrade do targetLevel
// (skopiowane z SpawnTestEnemy._placeBuilding — cheat-style bez kosztów).
function _placeBuilding(bSys, grid, buildingId, targetLevel) {
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

// Spawn N vesseli na orbicie planety (emit pełnego flow vessel:created/launched/positionUpdate).
// Zwraca listę vesselId.
function _spawnOrbitingFleet(scene, body, fleetSpec, { empireId, isEnemy, ownerTag }) {
  const vMgr = scene.vesselManager;
  const systemId = body.systemId ?? window.KOSMOS?.activeSystemId ?? 'sys_home';
  const ids = [];
  const colony = scene.colonyManager.getColony(body.id);

  for (const spec of fleetSpec) {
    const vessel = createVessel(spec.hullId, body.id, {
      name:    spec.name,
      modules: spec.modules,
      x:       body.x ?? 0,
      y:       body.y ?? 0,
      systemId,
    });
    if (empireId) {
      vessel.ownerEmpireId = empireId;
      vessel.owner         = ownerTag;
    } else {
      vessel.owner         = ownerTag;
    }
    if (isEnemy) vessel.isEnemy = true;

    vessel.position.state    = 'orbiting';
    vessel.position.dockedAt = body.id;
    vessel.status            = 'idle';

    vMgr._vessels.set(vessel.id, vessel);
    if (colony) colony.fleet.push(vessel.id);

    EventBus.emit('vessel:created',        { vessel });
    EventBus.emit('vessel:launched',       { vessel });
    EventBus.emit('vessel:positionUpdate', { vessels: [vessel] });

    ids.push(vessel.id);
  }
  return ids;
}

// ── Helpers: wybór planet + wrogie imperium ───────────────────────

function _pickFarthestAvailablePlanet(scene, civPlanet) {
  const colMgr = scene.colonyManager;
  const planets = EntityManager.getByType('planet')
    .filter(p => p.id !== civPlanet.id && !colMgr.hasColony(p.id) && p.orbital);
  if (planets.length === 0) return null;
  planets.sort((a, b) => (b.orbital.a ?? 0) - (a.orbital.a ?? 0));
  return planets[0];
}

function _setupEnemyCivilization(scene, enemyPlanet) {
  const reg = scene.empireRegistry;
  const colMgr = scene.colonyManager;
  const systemId = enemyPlanet.systemId ?? window.KOSMOS?.activeSystemId ?? 'sys_home';

  // Respawn-safe: usuń poprzednie sandbox empire jeśli istnieje
  if (reg.get(SANDBOX_ENEMY_ID)) {
    reg.destroyEmpire?.(SANDBOX_ENEMY_ID, 'combat_sandbox_reload');
  }

  reg.createEmpire({
    id:           SANDBOX_ENEMY_ID,
    name:         'Rój Sandboxowy',
    namePL:       'Rój Sandboxowy',
    nameEN:       'Sandbox Swarm',
    archetype:    'xenophage',
    homeSystemId: systemId,
    colonies:     [],
    tech:         { level: 2, focus: 'military' },
    military:     { power: 200 },
  });
  reg.addColony(SANDBOX_ENEMY_ID, enemyPlanet.id);

  const colony = colMgr.createColony(enemyPlanet.id, { ...ENEMY_START_RESOURCES },
                                     ENEMY_POPULATION, START_YEAR, SANDBOX_ENEMY_ID);
  if (!colony) {
    console.warn('[CombatSandbox] Nie utworzono wrogiej kolonii');
    return null;
  }
  colony.ownerEmpireId = SANDBOX_ENEMY_ID;
  colony.isTestEnemy   = true;
  colony.name          = `${enemyPlanet.name} [WRÓG]`;

  const grid = PlanetMapGenerator.generate(enemyPlanet, false);
  colony.buildingSystem._grid       = grid;
  colony.buildingSystem._gridHeight = grid.height ?? 10;
  colony.grid = grid;
  for (const tile of grid.toArray()) {
    if (tile) tile.owner = SANDBOX_ENEMY_ID;
  }

  _placeLayout(colony.buildingSystem, grid, ENEMY_BUILDINGS);

  enemyPlanet.explored = true;
  return enemyPlanet.id;
}

function _declareSandboxWar(scene) {
  const dipl = scene.diplomacySystem;
  const war  = scene.warSystem;
  if (dipl?.declareWar) {
    dipl.declareWar(SANDBOX_ENEMY_ID, 'sandbox_scenario');
  } else if (war?.createWar) {
    war.createWar('player', SANDBOX_ENEMY_ID, 'sandbox_scenario');
  }
}

// ── Helpers: feature flagi ────────────────────────────────────────

function _activateFeatureFlags(scene) {
  GAME_CONFIG.FEATURES = GAME_CONFIG.FEATURES ?? {};
  for (const flag of SANDBOX_FEATURE_FLAGS) {
    if (flag in GAME_CONFIG.FEATURES) {
      GAME_CONFIG.FEATURES[flag] = true;
    }
    // else: flaga nie zarejestrowana (future milestone) — no-op
  }
  // Instancjonuj systemy M1 jeśli jeszcze nie powstały
  scene._ensureMovementOrderSystem?.();
  scene._ensureEmpireFleetMaterializer?.();
  // M2a/M2b systemy będą miały analogiczne _ensure*; scenariusz włącza flagi
  // — systemy startują gdy milestone zostanie zaimplementowany (idempotent call OK).
  scene._ensureProximitySystem?.();
  scene._ensureVesselCombatSystem?.();
  scene._ensureAutoRetreatSystem?.();
  scene._ensureUnifiedAggregator?.();
}

function _listActiveFlags() {
  const out = [];
  const f = GAME_CONFIG.FEATURES ?? {};
  for (const flag of SANDBOX_FEATURE_FLAGS) {
    if (f[flag] === true) out.push(flag);
  }
  return out;
}

// ── Debug helpery (eksportowane dla KOSMOS.debug.*) ───────────────

/** sandboxInfo — dump stanu sandboxa. */
export function sandboxInfo() {
  if (window.KOSMOS?.scenarioMode !== 'combat_sandbox') {
    console.warn('[sandbox] Tylko w Combat Sandbox');
    return null;
  }
  const K = window.KOSMOS;
  const vessels = [...(K.vesselManager?._vessels?.values() ?? [])];
  const rows = vessels.map(v => ({
    id:       v.id,
    name:     v.name,
    owner:    v.ownerEmpireId ?? v.owner ?? 'player',
    hullId:   v.hullId ?? v.shipId,
    state:    v.position?.state,
    dockedAt: v.position?.dockedAt,
    x:        v.position?.x?.toFixed?.(1),
    y:        v.position?.y?.toFixed?.(1),
  }));
  console.group('[sandboxInfo]');
  console.log('Empires:', K.empireRegistry?.listIds?.());
  console.log('Feature flags ON:', _listActiveFlags());
  console.log('Defaults:', K._sandboxDefaults);
  console.table(rows);
  console.groupEnd();
  return { empires: K.empireRegistry?.listIds?.() ?? [], vessels: rows };
}

/** sandboxResetPositions — każde vessele wraca na pozycję bazową. */
export function sandboxResetPositions() {
  if (window.KOSMOS?.scenarioMode !== 'combat_sandbox') {
    console.warn('[sandbox] Tylko w Combat Sandbox');
    return false;
  }
  const K = window.KOSMOS;
  const defs = K._sandboxDefaults;
  if (!defs) { console.warn('[sandbox] Brak defaults — czy scenariusz załadowany?'); return false; }
  const vMgr = K.vesselManager;
  const mos  = K.movementOrderSystem;
  const resetTo = (ids, dockId) => {
    const body = EntityManager.get(dockId);
    const x = body?.x ?? 0;
    const y = body?.y ?? 0;
    for (const id of ids) {
      const v = vMgr?.getVessel?.(id);
      if (!v) continue;
      mos?.cancelOrder?.(id, 'sandbox_reset');
      v.mission              = null;
      v.position.state       = 'orbiting';
      v.position.dockedAt    = dockId;
      v.position.x           = x;
      v.position.y           = y;
      v.status               = 'idle';
      EventBus.emit('vessel:positionUpdate', { vessels: [v] });
    }
  };
  resetTo(defs.playerFleet, defs.playerHomeId);
  resetTo(defs.enemyFleet,  defs.enemyHomeId);
  console.log('[sandbox] Pozycje zresetowane');
  return true;
}

/** sandboxSpawnMoreEnemies — dodaje N wrogich hull_small na orbicie enemy home. */
export function sandboxSpawnMoreEnemies(count = 1) {
  if (window.KOSMOS?.scenarioMode !== 'combat_sandbox') {
    console.warn('[sandbox] Tylko w Combat Sandbox');
    return [];
  }
  const K = window.KOSMOS;
  const defs = K._sandboxDefaults;
  if (!defs?.enemyHomeId) { console.warn('[sandbox] Brak wrogiej kolonii'); return []; }
  const enemyBody = EntityManager.get(defs.enemyHomeId);
  if (!enemyBody) return [];

  const vMgr = K.vesselManager;
  const colony = K.colonyManager?.getColony?.(defs.enemyHomeId);
  const systemId = enemyBody.systemId ?? K.activeSystemId ?? 'sys_home';
  const ids = [];

  for (let i = 0; i < count; i++) {
    const idx = defs.enemyFleet.length + i + 1;
    const vessel = createVessel('hull_frigate', enemyBody.id, {
      name:    `Łowca Spawn ${idx}`,
      modules: ['engine_ion', 'armor_standard',
                'weapon_kinetic', 'weapon_kinetic'],
      x:       enemyBody.x ?? 0,
      y:       enemyBody.y ?? 0,
      systemId,
    });
    vessel.ownerEmpireId  = SANDBOX_ENEMY_ID;
    vessel.owner          = SANDBOX_ENEMY_ID;
    vessel.isEnemy        = true;
    vessel.position.state    = 'orbiting';
    vessel.position.dockedAt = enemyBody.id;
    vessel.status            = 'idle';

    vMgr._vessels.set(vessel.id, vessel);
    if (colony) colony.fleet.push(vessel.id);
    defs.enemyFleet.push(vessel.id);

    EventBus.emit('vessel:created',        { vessel });
    EventBus.emit('vessel:launched',       { vessel });
    EventBus.emit('vessel:positionUpdate', { vessels: [vessel] });
    ids.push(vessel.id);
  }
  console.log(`[sandbox] +${ids.length} wrogich vesseli na ${enemyBody.name}:`, ids);
  return ids;
}
