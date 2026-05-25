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
import { HexGrid }            from '../../map/HexGrid.js';
import { ColonyAutoExpander } from '../../systems/ColonyAutoExpander.js';
import { INDUSTRIALIST_TARGETS } from '../../data/targets/industrialist.js';

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

console.log(`\n=== ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
