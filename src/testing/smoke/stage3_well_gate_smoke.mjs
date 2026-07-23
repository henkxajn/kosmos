// KOSMOS Reform Stage 3 — smoke (offline).
//   A1  Bramka wody Studni: evaluatePlacement + requiresWater na well + i18n keys.
//   A2  Koszt UPGRADE skalowany środowiskiem (integracja: _upgrade → _pendingQueue.cost).
//
// Uruchom: node src/testing/smoke/stage3_well_gate_smoke.mjs

let pass = 0, fail = 0;
const assert = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const header = (h) => console.log('\n--- ' + h + ' ---');

// Stuby środowiska przeglądarki PRZED importami (i18n czyta localStorage na load).
globalThis.localStorage = {
  _store: {}, length: 0, key() { return null; },
  getItem(k) { return this._store[k] ?? null; }, setItem(k, v) { this._store[k] = String(v); }, removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };
globalThis.document = { createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }), getElementById: () => null };

const { evaluatePlacement } = await import('../../map/HexTile.js');
const { BUILDINGS } = await import('../../data/BuildingsData.js');
const { envMultiplier, computeBuildResourceCost, computeBuildCommodityCost } = await import('../../data/EnvironmentCost.js');
const { BuildingSystem } = await import('../../systems/BuildingSystem.js');
const PL = (await import('../../i18n/pl.js')).default ?? (await import('../../i18n/pl.js')).pl;
const EN = (await import('../../i18n/en.js')).default ?? (await import('../../i18n/en.js')).en;

const WELL = BUILDINGS.well, FARM = BUILDINGS.farm;
const tile = (type) => ({ type, damaged: false });

// ── A1 — flaga + bramka wody ─────────────────────────────────────────────────
header('A1: well.requiresWater + i18n');
assert(WELL.requiresWater === true, 'well.requiresWater === true');
assert(!FARM.requiresWater, 'farm BEZ requiresWater (bramka wody go nie tyka)');
// i18n w OBU językach (dwujęzyczność obowiązkowa)
const plMap = PL['ui.requiresWater'] ?? PL?.['ui.requiresWater'];
const enMap = EN['ui.requiresWater'] ?? EN?.['ui.requiresWater'];
assert(typeof plMap === 'string' && plMap.length > 0, `pl ui.requiresWater = "${plMap}"`);
assert(typeof enMap === 'string' && enMap.length > 0, `en ui.requiresWater = "${enMap}"`);

header('A1: evaluatePlacement — bramka wody (well)');
const wet   = { surface: { hasWater: true },  atmosphere: 'breathable', temperatureC: 20, surfaceGravity: 1 };
const dry   = { surface: { hasWater: false }, atmosphere: 'breathable', temperatureC: 20, surfaceGravity: 1 };
const noSurf= { atmosphere: 'breathable', temperatureC: 20, surfaceGravity: 1 };  // brak surface
const rWet = evaluatePlacement(tile('plains'), WELL, { planet: wet });
const rDry = evaluatePlacement(tile('plains'), WELL, { planet: dry });
const rNo  = evaluatePlacement(tile('plains'), WELL, { planet: noSurf });
const rNull= evaluatePlacement(tile('plains'), WELL, { planet: null });
assert(rWet.ok === true, 'well @ woda → ok');
assert(rDry.ok === false && rDry.reason === 'ui.requiresWater' && rDry.kind === 'climate',
  'well @ sucho → blok ui.requiresWater kind=climate (ścieżka „widoczny zablokowany")');
assert(rNo.ok === false && rNo.reason === 'ui.requiresWater', 'well @ brak surface → blok (brak potwierdzonej wody)');
assert(rNull.ok === true, 'well @ null → ok (fail-open, wzór Stage 1)');

header('A1: farma + bramka klimatu nienaruszone');
assert(evaluatePlacement(tile('plains'), FARM, { planet: dry }).ok === true, 'farm @ sucho → ok (woda nie tyka farmy)');
const climBlock = evaluatePlacement(tile('plains'), FARM, { planet: { surface: { hasWater: true }, atmosphere: 'none', temperatureC: 20 } });
assert(climBlock.ok === false && climBlock.reason === 'ui.requiresAtmosphere', 'farm @ none-atmo → nadal blok klimatyczny');

// ── A2 — koszt upgrade skalowany środowiskiem (integracja _upgrade) ───────────
header('A2: _upgrade koszt skalowany env WŁASNEJ planety (integracja → _pendingQueue.cost)');
// Stub kolonii: planeta 'pc' = high-grav; homePlanet = normal (NIE używana — dowód _resolveOwnPlanet).
const setColony = (planet) => { window.KOSMOS.colonyManager = { getColony: (id) => (id === 'pc' ? { planet } : null) }; };
window.KOSMOS.homePlanet = { surfaceGravity: 1.0, atmosphere: 'breathable', temperatureC: 20 };

const runUpgrade = (planet, buildingId = 'mine', level = 1) => {
  setColony(planet);
  const bs = Object.create(BuildingSystem.prototype);
  bs._planetId = 'pc'; bs._isOutpost = false;
  bs._active = new Map([['0,0', { building: BUILDINGS[buildingId], level, popCost: 0 }]]);
  bs._pendingQueue = new Map();
  bs.getMaxLevel = () => 10;
  bs.resourceSystem = { canAfford: () => false };   // wymuś ścieżkę pending → zapisze upgradeCost
  bs.civSystem = { freePops: 999 };
  const t = { key: '0,0', buildingId, buildingLevel: level, underConstruction: false, pendingBuild: false, q: 0, r: 0, type: 'plains' };
  bs._upgrade(t);
  return bs._pendingQueue.get('0,0')?.cost ?? null;
};

const highP = { surfaceGravity: 2.97, atmosphere: 'breathable', temperatureC: 20 };  // high band
const normP = { surfaceGravity: 0.99, atmosphere: 'breathable', temperatureC: 20 };  // normal band
const mineCostFe = BUILDINGS.mine.cost.Fe;  // 20
const nextLevel = 2;
const expHigh = Math.ceil(mineCostFe * nextLevel * 1.2 * envMultiplier('mining', highP));  // ×1.40
const expNorm = Math.ceil(mineCostFe * nextLevel * 1.2 * envMultiplier('mining', normP));  // ×1.00

const cHigh = runUpgrade(highP);
const cNorm = runUpgrade(normP);
const cNull = runUpgrade(null);   // fail-open → env=1 → jak normal

assert(cHigh?.Fe === expHigh, `mine Lv1→2 @ high-grav Fe=${cHigh?.Fe} (=${expHigh}, ×1.40)`);
assert(cNorm?.Fe === expNorm, `mine Lv1→2 @ normal Fe=${cNorm?.Fe} (=${expNorm}, ×1.00)`);
assert(cHigh.Fe > cNorm.Fe, `upgrade DROŻSZY na high-grav (${cHigh.Fe} > ${cNorm.Fe}) — luka scope zamknięta`);
assert(cNull?.Fe === expNorm, `mine Lv1→2 @ null planeta Fe=${cNull?.Fe} (fail-open = normal)`);

// Food (atmo/temp inert) nadal skaluje się grawitacją przy upgrade (spójnie z budową).
const farmHigh = runUpgrade(highP, 'farm');
const farmNorm = runUpgrade(normP, 'farm');
assert(farmHigh.Fe > farmNorm.Fe, `farm upgrade też drożej na high-grav (${farmHigh.Fe} > ${farmNorm.Fe}, food gSens 0.2)`);

// ── Part A — commodityCost skalowany tą samą premią środowiskową ──────────────
header('Part A: computeBuildCommodityCost skaluje commodity tą samą premią co surowce');
const highP2 = { surfaceGravity: 2.97, atmosphere: 'breathable', temperatureC: 20 };  // high grav
const normP2 = { surfaceGravity: 0.99, atmosphere: 'breathable', temperatureC: 20 };  // normal
// mine.commodityCost = { structural_alloys:3, extraction_systems:2, power_cells:1 }; mining ×1.40 na high.
const mcHigh = computeBuildCommodityCost(BUILDINGS.mine, highP2);
const mcNorm = computeBuildCommodityCost(BUILDINGS.mine, normP2);
assert(mcNorm.structural_alloys === 3 && mcNorm.power_cells === 1, `normal commodity raw ${JSON.stringify(mcNorm)}`);
assert(mcHigh.structural_alloys === Math.ceil(3 * 1.40) && mcHigh.extraction_systems === Math.ceil(2 * 1.40) && mcHigh.power_cells === Math.ceil(1 * 1.40),
  `high commodity ×1.40 ${JSON.stringify(mcHigh)} (SA 5, ES 3, PC 2)`);
assert(mcHigh.structural_alloys > mcNorm.structural_alloys, 'commodity DROŻSZE na high-grav (luka Part A zamknięta)');
// _upgrade (Lv2→3, commodities wchodzą od Lv3) — skalowane w _pendingQueue.cost.
const up2to3High = runUpgrade(highP2, 'mine', 2);
const up2to3Norm = runUpgrade(normP2, 'mine', 2);
assert(up2to3High.structural_alloys === Math.ceil(3 * 2 * 1.40) && up2to3Norm.structural_alloys === Math.ceil(3 * 2 * 1.00),
  `upgrade Lv2→3 commodity: high SA=${up2to3High.structural_alloys} (9) vs normal ${up2to3Norm.structural_alloys} (6)`);

// ── Part B — budynki orbitalne: zero wrażliwości środowiskowej ────────────────
header('Part B: orbital-anchored → envMultiplier=1 na wszystkich osiach');
const ORBITAL = ['orbital_habitat', 'orbital_mine', 'orbital_fabricator', 'dyson_command', 'warp_beacon', 'jump_gate'];
const SURFACE = ['mine', 'habitat', 'shipyard', 'terraformer', 'launch_pad', 'stellar_collector_relay', 'vacuum_generator', 'antimatter_factory'];
for (const id of ORBITAL) assert(BUILDINGS[id]?.orbitalAnchored === true, `${id}.orbitalAnchored === true`);
for (const id of SURFACE) assert(!BUILDINGS[id]?.orbitalAnchored, `${id} BEZ orbitalAnchored (powierzchnia — zachowuje wrażliwość)`);

// Ekstremalna planeta (high grav + brak atmo + zimno) — orbital MUSI być niezmienny.
const harsh = { surfaceGravity: 3.0, atmosphere: 'none', temperatureC: -120 };
for (const id of ['orbital_mine', 'orbital_fabricator', 'dyson_command', 'orbital_habitat']) {
  const b = BUILDINGS[id];
  assert(envMultiplier(b.category, harsh, { building: b }) === 1, `envMultiplier(${id}, harsh) === 1`);
  const rHarsh = computeBuildResourceCost(b, harsh), rNull = computeBuildResourceCost(b, null);
  assert(JSON.stringify(rHarsh) === JSON.stringify(rNull), `${id} koszt surowców na harsh == raw (${JSON.stringify(rHarsh)})`);
  const cHarsh = computeBuildCommodityCost(b, harsh), cNull = computeBuildCommodityCost(b, null);
  assert(JSON.stringify(cHarsh) === JSON.stringify(cNull), `${id} koszt commodity na harsh == raw`);
}
// Kontrola: surface sibling w tej samej kategorii NADAL czuje środowisko.
assert(envMultiplier('mining', harsh, { building: BUILDINGS.mine }) > 1, 'surface mine (mining) na harsh > 1 (wrażliwość zachowana)');
assert(computeBuildResourceCost(BUILDINGS.mine, harsh).Fe > BUILDINGS.mine.cost.Fe, 'surface mine koszt Fe > raw na harsh');
// Upkeep orbital też exempt (envUpkeep=1) — _calcBaseRates.
{
  window.KOSMOS.colonyManager = { getColony: (id) => (id === 'pc' ? { planet: harsh } : null) };
  const bs = Object.create(BuildingSystem.prototype);
  bs._planetId = 'pc'; bs._isRegionMode = false; bs._gridHeight = 0; bs.techSystem = null;
  const orb = { ...BUILDINGS.orbital_mine, rates: {}, energyCost: 10, maintenance: { Fe: 2 } };
  const rates = bs._calcBaseRates(orb, { type: 'plains', anomalyEffect: null }, 1);
  assert(Math.abs(rates.energy - (-10)) < 1e-6, `orbital upkeep energy NIEskalowany (${rates.energy} == -10)`);
  assert(Math.abs(rates.Fe - (-2)) < 1e-6, `orbital upkeep maintenance NIEskalowany (${rates.Fe} == -2)`);
}

console.log(`\nWYNIK: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
