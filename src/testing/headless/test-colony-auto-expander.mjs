// ═══════════════════════════════════════════════════════════════
// Smoke test — ColonyAutoExpander (Warstwa B AI, Industrialist)
// Uruchom: node src/testing/headless/test-colony-auto-expander.mjs
// ───────────────────────────────────────────────────────────────
// IZOLOWANY harness (bez GameCore) — pełny boot headless jest w tym
// środowisku niewykonywalny: GameCore→GroundUnitManager→GlbSnapshotRenderer
// importuje 'three' (CDN, brak w node_modules). Dotyczy też istniejących
// bot-testów. Rdzeń sim (ResourceSystem/BuildingSystem/FactorySystem/
// CivilizationSystem/HexGrid) jest wolny od 'three', więc budujemy realną
// kolonię z tych systemów + stub window.KOSMOS.
//
// Proof-of-life:
//   T1: konstrukcja realnej kolonii + ColonyAutoExpander subskrybuje time:tick
//   T2: twarda reguła terenu — _findFreeTile('mine')→mountains, ('farm')→plains
//   T3: tick do ~gy12 → farm count ≥ gameYear_10 target + budynków przybyło
//   T4: fabryka obecna + tryb reactive
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first — shim localStorage/window/THREE (NIE importuje pakietu 'three')
import EventBus from '../../core/EventBus.js';
import { ResourceSystem }     from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { BuildingSystem }     from '../../systems/BuildingSystem.js';
import { FactorySystem }      from '../../systems/FactorySystem.js';
import { TechSystem }         from '../../systems/TechSystem.js';
import { HexGrid }            from '../../map/HexGrid.js';
import { ColonyAutoExpander, MAX_PENDING_BUILDS_PER_COLONY } from '../../systems/ColonyAutoExpander.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { INDUSTRIALIST_TARGETS } from '../../data/targets/industrialist.js';
import { INDUSTRIALIST }      from '../../data/EmpireArchetypeIndustrialist.js';
import { BUILDINGS }          from '../../data/BuildingsData.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
};
const countBuilding = (colony, id) => {
  let n = 0;
  for (const e of colony.buildingSystem._active.values())
    if ((e.building?.id ?? e.buildingId) === id) n++;
  return n;
};
const totalBuildings = (colony) => colony.buildingSystem._active.size;

// ── Minimalny window.KOSMOS (ColonyAutoExpander + BuildingSystem czytają go) ──
const colonyRef = {};
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  timeSystem: { gameTime: 0 },
  colonyManager: { getAllColonies: () => [colonyRef.c], getColony: () => colonyRef.c },
  empireRegistry: { get: () => ({ archetype: 'industrialist' }) },
};

// ── Buduj realną kolonię AI ──────────────────────────────────────
console.log('--- T1: Konstrukcja realnej kolonii + system ---');
const planet = { id: 'p_test', name: 'Test', atmosphere: 'breathable' };

// HexGrid 8×10 — domyślnie wszystkie 'plains'; ustaw pas 'mountains' (rząd środkowy).
const grid = new HexGrid(8, 10);
let mountainsSet = 0;
grid.forEach(tile => { if (tile.r === 5 && mountainsSet < 4) { tile.type = 'mountains'; mountainsSet++; } });

// Surowce + komponenty (budynki mają commodityCost) — duży zapas, izolacja od ekonomii.
const startResources = {};
for (const r of [
  'Fe','Si','C','Cu','Ti','Li','Hv','Pt','food','water',
  'structural_alloys','polymer_composites','conductor_bundles','power_cells',
  'extraction_systems','electronic_systems','semiconductor_arrays','propulsion_systems',
  'android_worker','pressure_modules','reactive_armor','neurostimulants',
  'basic_supplies','civilian_goods',
]) startResources[r] = 1e6;

// Permisywny techStub — factory wymaga 'metallurgy'; mnożniki=1, isResearched=true.
const techStub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return () => true;
    return () => 1;
  },
});

const resSys  = new ResourceSystem(startResources);
const civSys  = new CivilizationSystem({}, techStub, planet);
civSys.resourceSystem = resSys;
const bSys    = new BuildingSystem(resSys, civSys, techStub);
civSys.buildingSystem = bSys;
bSys._grid = grid;
bSys._gridHeight = grid.height;
bSys.setDeposits?.([]);
const factSys = new FactorySystem(resSys);
bSys.setFactorySystem(factSys);

const colony = {
  planetId: 'p_test',
  ownerEmpireId: 'emp_smoke',
  isOutpost: false,
  planet,
  resourceSystem: resSys,
  civSystem: civSys,
  buildingSystem: bSys,
  factorySystem: factSys,
  // prosperitySystem pominięty → ColonyAutoExpander użyje fallbacku 100 (brak triggera prosperity)
};
civSys.population = 30; // dużo freePops → builds nie blokują się na brak POP
colonyRef.c = colony;   // ustaw PRZED setMode (FactorySystem._getOwnerColony skanuje window.KOSMOS)
factSys.setMode('reactive');

const expander = new ColonyAutoExpander();
ok('kolonia ma buildingSystem._grid', !!colony.buildingSystem._grid);
ok('factory mode = reactive (start)', colony.factorySystem.mode === 'reactive');

// ── T2: twarda reguła terenu (unit) ─────────────────────────────
console.log('--- T2: Reguła terenu ---');
const mineTile = expander._findFreeTile(colony, 'mine');
const farmTile = expander._findFreeTile(colony, 'farm');
ok('mine → hex type === mountains', mineTile != null && mineTile.type === 'mountains');
ok('farm → hex type === plains',    farmTile != null && farmTile.type === 'plains');

const buildingsStart = totalBuildings(colony);
console.log(`    budynki start: ${buildingsStart}, farm=${countBuilding(colony,'farm')}`);

// ── T3: tick do ~gameYear 12 ────────────────────────────────────
console.log('--- T3: Tick do ~gameYear 12 (cel: gameYear_10) ---');
let gt = 0;
for (let i = 0; i < 60; i++) {
  gt += 0.25;                  // +3 civYears / iterację
  window.KOSMOS.timeSystem.gameTime = gt;
  EventBus.emit('time:tick', { deltaYears: 0.25, civDeltaYears: 3, gameTime: gt, multiplier: 3 });
  resSys.receive(startResources); // utrzymuj zapas (izolacja od konsumpcji)
}
const gy = Math.floor(gt);
const farmCount = countBuilding(colony, 'farm');
const target10Farm = INDUSTRIALIST_TARGETS.gameYear_10.buildings.farm.count;
console.log(`    gy=${gy}, farm=${farmCount} (target gy10=${target10Farm}), budynki total=${totalBuildings(colony)}`);
ok(`farm count ≥ gameYear_10 target (${target10Farm})`, farmCount >= target10Farm);
ok('liczba budynków wzrosła vs start', totalBuildings(colony) > buildingsStart);

// ── T4: fabryka + reactive ──────────────────────────────────────
console.log('--- T4: Fabryka + reactive ---');
ok('co najmniej 1 fabryka', countBuilding(colony, 'factory') >= 1);
ok('factory mode = reactive', colony.factorySystem.mode === 'reactive');
// mine zbudowane wyłącznie na mountains (twarda reguła)
let mineOk = true;
grid.forEach(t => { if (t.buildingId === 'mine' && t.type !== 'mountains') mineOk = false; });
ok('wszystkie mine na mountains', mineOk);

// ── T5: silent-fail handling (bug #2) ───────────────────────────
// Osobna mini-kolonia z techStub blokującym factory (isResearched('metallurgy')
// === false). AutoExpander powinien: (a) NIE pętlić się — _tryBuild zwraca 'fail',
// (b) zarejestrować unreachable w _caeUnreachableTargets, (c) pominąć w backoffie.
console.log('--- T5: Silent fail factory (brak metallurgy) ---');

// techStub#2: wszystko researched OPRÓCZ metallurgy → factory.requires zablokowany.
const techStubNoMetal = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'getTerrainUnlocks') return () => [];
    if (prop === 'isResearched')      return (id) => id !== 'metallurgy';
    return () => 1;
  },
});

const grid2 = new HexGrid(8, 10);
grid2.forEach(tile => { tile.type = 'plains'; }); // brak mountains → mine też 'no_tile' (ignorowane)
const resSys2 = new ResourceSystem(startResources);
const civSys2 = new CivilizationSystem({}, techStubNoMetal, planet);
civSys2.resourceSystem = resSys2;
const bSys2 = new BuildingSystem(resSys2, civSys2, techStubNoMetal);
civSys2.buildingSystem = bSys2;
bSys2._grid = grid2;
bSys2._gridHeight = grid2.height;
bSys2.setDeposits?.([]);
const factSys2 = new FactorySystem(resSys2);
bSys2.setFactorySystem(factSys2);
civSys2.population = 30;

const colony2 = {
  planetId: 'p_test2', ownerEmpireId: 'emp_smoke2', isOutpost: false,
  planet, resourceSystem: resSys2, civSystem: civSys2,
  buildingSystem: bSys2, factorySystem: factSys2,
};

// Bezpośrednia próba budowy factory → 'fail' (brak metallurgy, tile niezmieniony).
const outcomeFail = expander._tryBuild(colony2, 'factory', { module: 'target', civYear: 100, why: 'T5' });
ok("_tryBuild('factory') === 'fail' bez metallurgy", outcomeFail === 'fail');

// Symuluj rejestrację unreachable jak w _runTargets.
expander._markUnreachable(colony2, 'build:factory', 100, { module: 'target' });
ok('_caeUnreachableTargets ma wpis build:factory', colony2._caeUnreachableTargets?.has('build:factory'));
ok('build:factory w backoffie @cy=110 (retry=130)', expander._isUnreachable(colony2, 'build:factory', 110) === true);
ok('build:factory NIE w backoffie po retryAtCivYear (cy=130)', expander._isUnreachable(colony2, 'build:factory', 130) === false);

// Clear → wpis znika (sukces po odkryciu techu).
expander._clearUnreachable(colony2, 'build:factory');
ok('_clearUnreachable usuwa wpis', !colony2._caeUnreachableTargets?.has('build:factory'));

// ── T6: _upgrade dla AI — success/queued ≠ unreachable (bug A) ───
// Regresja: queued upgrade (pendingBuild, gdy brak surowców/POP) był błędnie
// czytany jako 'fail' → AI rejestrował wszystkie upgrade:* jako unreachable.
console.log('--- T6: Upgrade AI (success + queued ≠ unreachable) ---');

const techRealT6 = new TechSystem();
techRealT6.grantTechs(INDUSTRIALIST.startingTechs);  // metallurgy + automation itd.

const grid6 = new HexGrid(8, 10);
grid6.forEach(t => { t.type = 'plains'; });
// 6a — pełne surowce + POP → upgrade rusza (underConstruction lub instant)
const res6 = new ResourceSystem(startResources);
const civ6 = new CivilizationSystem({}, techRealT6, planet); civ6.resourceSystem = res6;
const bSys6 = new BuildingSystem(res6, civ6, techRealT6); civ6.buildingSystem = bSys6;
bSys6._grid = grid6; bSys6._gridHeight = grid6.height; bSys6.setDeposits?.([]);
const fact6 = new FactorySystem(res6); bSys6.setFactorySystem(fact6);
civ6.population = 30;
let farm6 = null;
grid6.forEach(t => { if (!farm6 && t.r > 2 && t.r < 7) farm6 = t; });
bSys6._activateBuilding(farm6.key, 'farm', farm6.r, farm6.type, false);
farm6.buildingId = 'farm'; farm6.buildingLevel = 1;

const colony6 = { planetId:'p6', ownerEmpireId:'e6', isOutpost:false, planet,
  resourceSystem:res6, civSystem:civ6, buildingSystem:bSys6, factorySystem:fact6 };
const upgOut = expander._tryUpgrade(colony6, 'farm', 2, { module:'target', civYear:24 });
ok("_tryUpgrade('farm',2) === 'upgraded' (pełne surowce)", upgOut === 'upgraded');
ok('upgrade ruszył (underConstruction)', !!farm6.underConstruction);
// Dokończ budowę upgrade'u (driver: time:tick civDeltaYears). UWAGA: źródłem prawdy
// dla poziomu jest _active[tileKey].level (grid tile.buildingLevel to mirror UI,
// synchronizowany przez ColonyOverlay — w headless nie istnieje).
for (let i = 0; i < 10 && (bSys6._active.get(farm6.key)?.level ?? 1) < 2; i++) {
  EventBus.emit('time:tick', { deltaYears: 0.1, civDeltaYears: 2, gameTime: 30 + i, multiplier: 2 });
}
ok('po dokończeniu budowy _active[farm].level === 2', bSys6._active.get(farm6.key)?.level === 2);

// 6b — pusty inwentarz → upgrade queue (pendingBuild) → 'queued', NIE 'fail'
const grid6b = new HexGrid(8, 10); grid6b.forEach(t => { t.type = 'plains'; });
const res6b = new ResourceSystem({});  // brak surowców → queue
const civ6b = new CivilizationSystem({}, techRealT6, planet); civ6b.resourceSystem = res6b;
const bSys6b = new BuildingSystem(res6b, civ6b, techRealT6); civ6b.buildingSystem = bSys6b;
bSys6b._grid = grid6b; bSys6b._gridHeight = grid6b.height; bSys6b.setDeposits?.([]);
const fact6b = new FactorySystem(res6b); bSys6b.setFactorySystem(fact6b);
civ6b.population = 30;
let farm6b = null;
grid6b.forEach(t => { if (!farm6b && t.r > 2 && t.r < 7) farm6b = t; });
bSys6b._activateBuilding(farm6b.key, 'farm', farm6b.r, farm6b.type, false);
farm6b.buildingId = 'farm'; farm6b.buildingLevel = 1;
const colony6b = { planetId:'p6b', ownerEmpireId:'e6b', isOutpost:false, planet,
  resourceSystem:res6b, civSystem:civ6b, buildingSystem:bSys6b, factorySystem:fact6b };
// pełna ścieżka jak _runTargets: outcome → clear/mark
const upgOutB = expander._tryUpgrade(colony6b, 'farm', 2, { module:'target', civYear:24 });
ok("_tryUpgrade('farm',2) === 'queued' (brak surowców)", upgOutB === 'queued');
ok('queued upgrade NIE jest oznaczony unreachable', !colony6b._caeUnreachableTargets?.has('upgrade:farm'));

// Backoff stały 30 (bug B): retryAt = since + 30, since kotwiczy się na TERAZ.
// mark @cy=24 → since=24, retry=54. re-mark @cy=54 → since=54 (NIE 24!), retry=84.
// Stary kod zostawiał since=24 → (retry-since) rosło (54→60→…), wyglądało jak exp.
expander._markUnreachable(colony6, 'upgrade:smelter', 24, { module:'target' });
const rec1 = colony6._caeUnreachableTargets.get('upgrade:smelter');
ok('backoff mark@24: since=24, retryAt=54', rec1.sinceCivYear === 24 && rec1.retryAtCivYear === 54);
expander._markUnreachable(colony6, 'upgrade:smelter', 54, { module:'target' });
const rec2 = colony6._caeUnreachableTargets.get('upgrade:smelter');
ok('re-mark@54: since=54 (kotwica TERAZ), retryAt=84 — stałe 30, NIE exp',
   rec2.sinceCivYear === 54 && rec2.retryAtCivYear === 84);
ok('odstęp retry zawsze 30 (retryAt - since)', rec2.retryAtCivYear - rec2.sinceCivYear === 30);

// ── T7: integracja — kolonia jak po bootstrapie, tick ~100 civYears ──
// Po obu fixach: buildings rosną monotonicznie, ≥1 budynek osiąga level≥2
// (źródło prawdy: _active[].level), a mapa unreachable NIE zawiera fałszywych
// upgrade:*/build:* dla budynków buildowalnych (farm/solar_farm/mine/well).
// Pre-stawiamy startingBuildings jak EmpireColonyBootstrap (_activateBuilding +
// stamp grid tile.buildingId) — to budynki które AutoExpander może upgrade'ować.
console.log('--- T7: Integracja — tick ~100 civYears (upgrade flow) ---');
const techRealT7 = new TechSystem();
techRealT7.grantTechs(INDUSTRIALIST.startingTechs);
const grid7 = new HexGrid(8, 10);
let mset = 0; grid7.forEach(t => { if (t.r === 5 && mset < 5) { t.type = 'mountains'; mset++; } });
const res7 = new ResourceSystem(startResources);
const civ7 = new CivilizationSystem({}, techRealT7, planet); civ7.resourceSystem = res7;
const bSys7 = new BuildingSystem(res7, civ7, techRealT7); civ7.buildingSystem = bSys7;
bSys7._grid = grid7; bSys7._gridHeight = grid7.height; bSys7.setDeposits?.([]);
const fact7 = new FactorySystem(res7); bSys7.setFactorySystem(fact7);
civ7.population = 40;  // dużo POP → upgrade rusza (underConstruction)

// Pre-stawienie startingBuildings (jak bootstrap: instant, stamp grid tile).
const placeBootstrap = (bid, count, terrains) => {
  let done = 0;
  grid7.forEach(t => {
    if (done >= count) return;
    if (t.buildingId || t.capitalBase) return;
    if (terrains && !terrains.includes(t.type)) return;
    bSys7._activateBuilding(t.key, bid, t.r, t.type, BUILDINGS_IS_CAPITAL(bid));
    if (BUILDINGS_IS_CAPITAL(bid)) t.capitalBase = true;
    else { t.buildingId = bid; t.buildingLevel = 1; }
    done++;
  });
};
function BUILDINGS_IS_CAPITAL(bid) { return bid === 'colony_base'; }
placeBootstrap('colony_base', 1, null);
placeBootstrap('farm', 2, ['plains']);
placeBootstrap('well', 2, ['plains']);
placeBootstrap('solar_farm', 5, ['plains']);
placeBootstrap('mine', 1, ['mountains']);
placeBootstrap('factory', 1, ['plains']);

const colony7 = { planetId:'p7', ownerEmpireId:'e7', isOutpost:false, planet,
  resourceSystem:res7, civSystem:civ7, buildingSystem:bSys7, factorySystem:fact7 };
colonyRef.c = colony7;   // przekieruj expander na kolonię T7
fact7.setMode('reactive');

const activeLevels = () => { let mx = 1; for (const e of bSys7._active.values()) if ((e.level ?? 1) > mx) mx = e.level; return mx; };
let gt7 = 0;
const buildSamples = [];
for (let i = 0; i < 130; i++) {     // ~390 civYears (0.25 gy = 3 civYears/iter) — z zapasem
  gt7 += 0.25;
  window.KOSMOS.timeSystem.gameTime = gt7;
  EventBus.emit('time:tick', { deltaYears: 0.25, civDeltaYears: 3, gameTime: gt7, multiplier: 3 });
  res7.receive(startResources);     // utrzymuj zapas (izolacja od konsumpcji)
  if (i % 20 === 0) buildSamples.push(totalBuildings(colony7));
}
buildSamples.push(totalBuildings(colony7));
const grewMonotonic = buildSamples.every((v, i) => i === 0 || v >= buildSamples[i - 1]);
const maxActiveLvl = activeLevels();  // źródło prawdy (nie grid mirror)
const unreachKeys = [...(colony7._caeUnreachableTargets?.keys() ?? [])];
const falseUnreach = unreachKeys.filter(k => /(farm|solar_farm|mine|well)$/.test(k));
console.log(`    gy=${Math.floor(gt7)}, budynki=${totalBuildings(colony7)} (próbki ${buildSamples.join('→')}), maxActiveLevel=${maxActiveLvl}, unreachable=[${unreachKeys.join(', ')}]`);
ok('budynki rosną monotonicznie', grewMonotonic && totalBuildings(colony7) > 6);
ok('≥1 budynek osiągnął _active level ≥ 2 (upgrade zadziałał)', maxActiveLvl >= 2);
ok('brak fałszywych unreachable (farm/solar_farm/mine/well)', falseUnreach.length === 0);

// ── T8: survival rule — pop >= housing → buduj habitat (bug X1) ──
// Thuban b: pop utknął na 8 (= housing 8). Survival rule (najwyższy priorytet)
// musi dobudować habitat gdy housing < pop * 1.1.
console.log('--- T8: Survival habitat (pop 8 / housing 8 cap) ---');
const grid8 = new HexGrid(8, 10); grid8.forEach(t => { t.type = 'plains'; });
const techReal8 = new TechSystem(); techReal8.grantTechs(INDUSTRIALIST.startingTechs);
const res8 = new ResourceSystem(startResources);
const civ8 = new CivilizationSystem({}, techReal8, planet); civ8.resourceSystem = res8;
const bSys8 = new BuildingSystem(res8, civ8, techReal8); civ8.buildingSystem = bSys8;
bSys8._grid = grid8; bSys8._gridHeight = grid8.height; bSys8.setDeposits?.([]);
const fact8 = new FactorySystem(res8); bSys8.setFactorySystem(fact8);
civ8.population = 8;
civ8.housing = 8;   // cap osiągnięty: pop === housing → wzrost stoi
const colony8 = { planetId:'p8', ownerEmpireId:'e8', isOutpost:false, planet,
  resourceSystem:res8, civSystem:civ8, buildingSystem:bSys8, factorySystem:fact8 };
colonyRef.c = colony8;   // expander zarządza tą kolonią

expander._runSurvival(200);   // jeden przebieg survival @cy=200

let habitatQueued = false;
for (const [, c] of bSys8._constructionQueue) if (c.buildingId === 'habitat') habitatQueued = true;
const habitatActive = expander._countBuilding(colony8, 'habitat') > 0;
let habitatOnGrid = false;
grid8.forEach(t => { if (t.underConstruction?.buildingId === 'habitat' || t.buildingId === 'habitat') habitatOnGrid = true; });
console.log(`    habitatQueued=${habitatQueued}, habitatActive=${habitatActive}, habitatOnGrid=${habitatOnGrid}, lastSurvival=${colony8._caeLastSurvivalAction?.type}`);
ok('survival zbudował habitat (queue lub active)', habitatQueued || habitatActive);
ok('nowa habitat na gridzie (underConstruction lub buildingId)', habitatOnGrid);
ok('survival action = housing_cap (najwyższy priorytet)', colony8._caeLastSurvivalAction?.type === 'housing_cap');
ok('build:habitat NIE oznaczony unreachable', !colony8._caeUnreachableTargets?.has('build:habitat'));

// ── T9: bootstrap twarda reguła terenu (bug X2) ─────────────────
// EmpireColonyBootstrap._placeBuildingSmart MUSI stawiać well/farm na plains i
// mine na mountains nawet gdy inne tereny mają lepszy scoring (bug X2: well @
// mountains → deficyt wody). Plains+mountains dostępne → twarda reguła wygrywa.
console.log('--- T9: Bootstrap hard terrain (well/farm→plains, mine→mountains) ---');
const grid9 = new HexGrid(8, 10);
// Mieszanka: większość plains, pas mountains w środku (rząd 5), trochę desert.
let mm = 0;
grid9.forEach(t => {
  if (t.r === 5) { t.type = 'mountains'; mm++; }
  else if (t.r === 4) t.type = 'desert';
  else t.type = 'plains';
});
const techReal9 = new TechSystem(); techReal9.grantTechs(INDUSTRIALIST.startingTechs);
const res9 = new ResourceSystem(startResources);
const civ9 = new CivilizationSystem({}, techReal9, planet); civ9.resourceSystem = res9;
const bSys9 = new BuildingSystem(res9, civ9, techReal9); civ9.buildingSystem = bSys9;
bSys9._grid = grid9; bSys9._gridHeight = grid9.height; bSys9.setDeposits?.([]);
const fact9 = new FactorySystem(res9); bSys9.setFactorySystem(fact9);
civ9.population = 20;
const colony9 = { planetId:'p9', ownerEmpireId:'e9', isOutpost:false, planet,
  resourceSystem:res9, civSystem:civ9, buildingSystem:bSys9, factorySystem:fact9 };

// Stawiamy jak bootstrap: well×2 (archetypowy preferredTerrain water/ice — celowo
// "zły", twarda reguła AI ma go pokonać), farm×2, mine×1.
EmpireColonyBootstrap._placeBuildingSmart(colony9, 'well', { preferredTerrain: ['water', 'ice'] });
EmpireColonyBootstrap._placeBuildingSmart(colony9, 'well', { preferredTerrain: ['water', 'ice'] });
EmpireColonyBootstrap._placeBuildingSmart(colony9, 'farm', { preferredTerrain: ['plains', 'forest'] });
EmpireColonyBootstrap._placeBuildingSmart(colony9, 'farm', { preferredTerrain: ['plains', 'forest'] });
EmpireColonyBootstrap._placeBuildingSmart(colony9, 'mine', { preferredTerrain: ['mountains', 'crater'] });

const terrainOf = (bid) => {
  const types = [];
  grid9.forEach(t => { if (t.buildingId === bid) types.push(t.type); });
  return types;
};
const wellTypes = terrainOf('well');
const farmTypes = terrainOf('farm');
const mineTypes = terrainOf('mine');
console.log(`    well @ [${wellTypes.join(',')}], farm @ [${farmTypes.join(',')}], mine @ [${mineTypes.join(',')}]`);
ok('wszystkie well na plains (NIE mountains)', wellTypes.length === 2 && wellTypes.every(t => t === 'plains'));
ok('wszystkie farm na plains', farmTypes.length === 2 && farmTypes.every(t => t === 'plains'));
ok('wszystkie mine na mountains', mineTypes.length === 1 && mineTypes.every(t => t === 'mountains'));

// ── T10: Y1 — stuck pending queue → abandon + unreachable ────────
// Kolonia bez surowców i POP: każdy _build → queued (pendingBuild, czeka w
// nieskończoność). _reconcilePending musi: trzymać świeży wpis, a po
// PENDING_STUCK_CIVYEARS (30) anulować zamówienie i oznaczyć unreachable.
console.log('--- T10: Y1 stuck queue (queued bez końca → abandon) ---');
const techReal10 = new TechSystem(); techReal10.grantTechs(INDUSTRIALIST.startingTechs);
const grid10 = new HexGrid(8, 10); grid10.forEach(t => { t.type = 'plains'; });
const res10 = new ResourceSystem({});                 // brak surowców → queue
const civ10 = new CivilizationSystem({}, techReal10, planet); civ10.resourceSystem = res10;
const bSys10 = new BuildingSystem(res10, civ10, techReal10); civ10.buildingSystem = bSys10;
bSys10._grid = grid10; bSys10._gridHeight = grid10.height; bSys10.setDeposits?.([]);
const fact10 = new FactorySystem(res10); bSys10.setFactorySystem(fact10);
civ10.population = 0;                                  // brak freePops → queue
const colony10 = { planetId:'p10', ownerEmpireId:'e10', isOutpost:false, planet,
  resourceSystem:res10, civSystem:civ10, buildingSystem:bSys10, factorySystem:fact10 };

const out10 = expander._tryBuild(colony10, 'farm', { module:'target', civYear:0, why:'T10' });
ok("_tryBuild('farm') === 'queued' (brak surowców+POP)", out10 === 'queued');
ok('_caePendingBuilds śledzi 1 zamówienie', colony10._caePendingBuilds?.size === 1);
expander._reconcilePending(colony10, 5);              // age 5 < 30 → trzymaj
ok('reconcile@cy=5: wpis nadal śledzony (age<30)', colony10._caePendingBuilds?.size === 1);
ok('build:farm jeszcze NIE unreachable @cy=5', !colony10._caeUnreachableTargets?.has('build:farm'));
expander._reconcilePending(colony10, 40);             // age 40 > 30 → porzuć
ok('reconcile@cy=40: wpis porzucony (stuck > 30 cy)', (colony10._caePendingBuilds?.size ?? 0) === 0);
ok('build:farm oznaczony unreachable po abandon', colony10._caeUnreachableTargets?.has('build:farm'));
ok('cancelPending wyczyścił _pendingQueue', bSys10._pendingQueue.size === 0);

// ── T11: Y2 — rate limit MAX_PENDING_BUILDS_PER_COLONY ──────────
// freePops>0 ale brak surowców → builds queue'ują (resource-bound). Limit musi
// utrzymać _caePendingBuilds.builds ≤ MAX przez 100 civYears; logi "queue full"
// throttlowane (≤ 5 przez throttle 30 cy).
console.log('--- T11: Y2 rate limit (queue ≤ MAX przez 100 cy) ---');
const techReal11 = new TechSystem(); techReal11.grantTechs(INDUSTRIALIST.startingTechs);
const grid11 = new HexGrid(8, 10);
let mm11 = 0; grid11.forEach(t => { if (t.r === 5 && mm11 < 4) { t.type = 'mountains'; mm11++; } else t.type = 'plains'; });
const res11 = new ResourceSystem({});                 // brak surowców → resource-bound queue
const civ11 = new CivilizationSystem({}, techReal11, planet); civ11.resourceSystem = res11;
const bSys11 = new BuildingSystem(res11, civ11, techReal11); civ11.buildingSystem = bSys11;
bSys11._grid = grid11; bSys11._gridHeight = grid11.height; bSys11.setDeposits?.([]);
const fact11 = new FactorySystem(res11); bSys11.setFactorySystem(fact11);
civ11.population = 30;                                 // freePops>0 → MAX jest aktywnym ogranicznikiem
// energy balance ujemny → survival solar_farm; brak organics → farm itd.
const colony11 = { planetId:'p11', ownerEmpireId:'e11', isOutpost:false, planet,
  resourceSystem:res11, civSystem:civ11, buildingSystem:bSys11, factorySystem:fact11 };
colonyRef.c = colony11;
expander._verbose = true;
let queueFullLogs = 0;
const origLog = console.log;
console.log = (...args) => { if (String(args[0]).includes('queue full')) queueFullLogs++; origLog(...args); };
let invariantHeld = true;
for (let cy = 1; cy <= 100; cy++) {
  window.KOSMOS.timeSystem.gameTime = cy / 12;        // civYear = cy
  expander._runSurvival(cy);
  if (expander._pendingCounts(colony11).builds > MAX_PENDING_BUILDS_PER_COLONY) invariantHeld = false;
}
console.log = origLog;
expander._verbose = false;
console.log(`    builds=${expander._pendingCounts(colony11).builds}, queueFullLogs=${queueFullLogs}`);
ok(`builds ≤ MAX (${MAX_PENDING_BUILDS_PER_COLONY}) przez całe 100 cy`, invariantHeld);
ok('logi "queue full" throttlowane (≤ 5)', queueFullLogs <= 5);

// ── T12: Y3 — tile blacklist po [fail] ──────────────────────────
// _tryBuild zwraca [fail] (factory bez metallurgy) → tile na blacklist 60 cy.
// _findFreeTile pomija go w oknie backoffu, znów dostępny po 60 cy.
console.log('--- T12: Y3 tile blacklist (fail → skip 60 cy) ---');
const grid12 = new HexGrid(8, 10); grid12.forEach(t => { t.type = 'plains'; });
const res12 = new ResourceSystem(startResources);
const civ12 = new CivilizationSystem({}, techStubNoMetal, planet); civ12.resourceSystem = res12;
const bSys12 = new BuildingSystem(res12, civ12, techStubNoMetal); civ12.buildingSystem = bSys12;
bSys12._grid = grid12; bSys12._gridHeight = grid12.height; bSys12.setDeposits?.([]);
const fact12 = new FactorySystem(res12); bSys12.setFactorySystem(fact12);
civ12.population = 30;
const colony12 = { planetId:'p12', ownerEmpireId:'e12', isOutpost:false, planet,
  resourceSystem:res12, civSystem:civ12, buildingSystem:bSys12, factorySystem:fact12 };

window.KOSMOS.timeSystem.gameTime = 0;                // civYear 0
const tileBefore = expander._findFreeTile(colony12, 'factory');
const out12 = expander._tryBuild(colony12, 'factory', { module:'survival', why:'T12' }); // brak civYear → _civYear()=0
ok("_tryBuild('factory') === 'fail' (brak metallurgy)", out12 === 'fail');
ok('tile dodany do _caeBlacklistedTiles', colony12._caeBlacklistedTiles?.has(tileBefore.key));
const tileDuring = expander._findFreeTile(colony12, 'factory');
ok('_findFreeTile pomija blacklisted tile (≠ poprzedni)', tileDuring != null && tileDuring.key !== tileBefore.key);
window.KOSMOS.timeSystem.gameTime = 5;                // civYear 60 (>= retryAt 60)
const tileAfter = expander._findFreeTile(colony12, 'factory');
ok('po 60 cy blacklist wygasa — tile znów dostępny', tileAfter != null && tileAfter.key === tileBefore.key);

// ── T13: deadlock POP w housing cap — habitat.popCost=0 rozbija pętlę ────────
// Bug (investigation 2026-05-25): kolonia w housing cap (pop===housing) z
// freePops=0 (wszystkie POP zatrudnione) nie mogła zbudować habitatu, bo
// _tickPendingQueue gate'uje fulfillment na freePops >= popCost. Habitat
// popCost=0.25 → nigdy nie fulfilled → housing nie rośnie → pop nie rośnie →
// freePops zostaje 0. Fix: habitat.popCost 0.25 → 0 (mieszkanie nie zatrudnia).
// Planeta NIE-oddychalna (atmo='thin') → housing realnie gate'uje wzrost
// (na 'breathable' wzrost nie jest housing-gated, _updateStrataGrowth linia ~1069).
console.log('--- T13: Deadlock POP housing cap (habitat.popCost=0) ---');
const planetThin = { id: 'p13', name: 'Thuban b', atmosphere: 'thin' };
const techReal13 = new TechSystem(); techReal13.grantTechs(INDUSTRIALIST.startingTechs);
const grid13 = new HexGrid(8, 10); grid13.forEach(t => { t.type = 'plains'; });
const res13 = new ResourceSystem(startResources);
const civ13 = new CivilizationSystem({}, techReal13, planetThin); civ13.resourceSystem = res13;
const bSys13 = new BuildingSystem(res13, civ13, techReal13); civ13.buildingSystem = bSys13;
bSys13._grid = grid13; bSys13._gridHeight = grid13.height; bSys13.setDeposits?.([]);
const fact13 = new FactorySystem(res13); bSys13.setFactorySystem(fact13);
civ13.population    = 8;
civ13.housing       = 8;   // cap: pop === housing
civ13._employedPops = 8;   // wszystkie POP zatrudnione → freePops = 0 (deadlock przed fixem)
const colony13 = { planetId:'p13', ownerEmpireId:'e13', isOutpost:false, planet:planetThin,
  resourceSystem:res13, civSystem:civ13, buildingSystem:bSys13, factorySystem:fact13 };
colonyRef.c = colony13;   // expander zarządza tą kolonią
window.KOSMOS.civMode = true;  // CivilizationSystem._update early-returnuje gdy !civMode (linia ~739)

ok('warunek startowy: freePops === 0', civ13.freePops === 0);
ok('warunek startowy: effectiveHousing === 8', civ13.effectiveHousing === 8);

// Spójność rebalansu: wszystkie czyste budynki mieszkalne (kategoria 'population')
// mają popCost=0 — nie zatrudniają POP, więc nie blokują się w housing cap.
ok('habitat.popCost === 0', BUILDINGS.habitat.popCost === 0);
ok('arcology_building.popCost === 0', BUILDINGS.arcology_building.popCost === 0);
ok('orbital_habitat.popCost === 0', BUILDINGS.orbital_habitat.popCost === 0);

// Tikuj ~15 civYears (5 iteracji × civDeltaYears=3): survival queue'uje habitat,
// _tickConstruction (popCost=0 → idzie do construction, NIE pending) dokańcza go.
let gt13 = 0;
for (let i = 0; i < 5; i++) {
  gt13 += 0.25;
  window.KOSMOS.timeSystem.gameTime = gt13;
  EventBus.emit('time:tick', { deltaYears: 0.25, civDeltaYears: 3, gameTime: gt13, multiplier: 3 });
  res13.receive(startResources);  // utrzymuj zapas (izolacja od konsumpcji)
}

const habitat13 = expander._countBuilding(colony13, 'habitat');
console.log(`    habitat _active=${habitat13}, effectiveHousing=${civ13.effectiveHousing}, freePops=${civ13.freePops}`);
ok('habitat wszedł do _active (deadlock rozbity)', habitat13 > 0);
ok('housing wzrosło > 8 (habitat dodał miejsca)', civ13.effectiveHousing > 8);
ok('freePops nadal === 0 (habitat NIE zatrudnia — popCost 0)', civ13.freePops === 0);

// Po odblokowaniu housing wzrost populacji może ruszyć: tikuj dalej i sprawdź,
// że strata growthProgress > 0 (housing > pop → _updateStrataGrowth nie early-returnuje).
// UWAGA: globalny _growthProgress to legacy (path _updatePopGrowth nieaktywny);
// realny wzrost akumuluje się per-strata (strata[type].growthProgress).
for (let i = 0; i < 5; i++) {
  gt13 += 0.25;
  window.KOSMOS.timeSystem.gameTime = gt13;
  EventBus.emit('time:tick', { deltaYears: 0.25, civDeltaYears: 3, gameTime: gt13, multiplier: 3 });
  res13.receive(startResources);
}
const totalGrowthProgress = Object.values(civ13.strata).reduce((s, st) => s + (st.growthProgress ?? 0), 0);
console.log(`    Σ strata growthProgress=${totalGrowthProgress.toFixed(3)} (housing ${civ13.effectiveHousing} > pop ${civ13.population})`);
ok('wzrost populacji odblokowany (Σ strata growthProgress > 0)', totalGrowthProgress > 0);

console.log(`\n=== ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
