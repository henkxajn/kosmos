// KOSMOS Reform Stage 2 — smoke (offline).
// Part A: composition-driven surface.hasWater (WATER_H2O_THRESHOLD=3), entity constructors,
//         migracja v92→v93 (backfill + preserwacja kołyski), gwarancja wody macierzystej.
// Part B: pasma środowiskowe (EnvironmentBands) + dopłata kosztu budowy/utrzymania (EnvironmentCost).
//
// T1  Stała progu = 3
// T2  Konstruktory: Planet/Moon/Planetoid liczą hasWater z composition.H2O
// T3  Split progu 3: rocky in-HZ(2.5)→suchy / rocky_cold(28)→mokry / ice(49)→mokry / hot,gas(0)→suchy
// T4  Icy moon (template 55%) bezpiecznie mokry
// T5  Migracja v92→v93: cold rocky zyskuje wodę, warm rocky sucho, WYMUSZONA kołyska ZACHOWANA
// T6  makeHomeworldBreathable: podbija composition.H2O (margines) + hasWater=true (gracz i AI)
// T7  Pasma: gravityBand / temperatureBand (progi + null-defaults)
// T8  envMultiplier: population/atmo, mining/grav, food IGNORUJE atmo+temp (tylko grawitacja)
// T9  Utrzymanie = połowa siły budowy; brak planety → 1 (fail-open)
// T10 computeBuildResourceCost: dopłata + latBuildCost + Math.ceil; null planeta → surowy koszt
// T11 _calcBaseRates: utrzymanie skalowane env WŁASNEJ kolonii (nie homePlanet); produkcja bez zmian

globalThis.localStorage = {
  _store:{}, length:0, key(){ return null; },
  getItem(k){ return this._store[k] ?? null; }, setItem(k,v){ this._store[k]=String(v); }, removeItem(k){ delete this._store[k]; },
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { WATER_H2O_THRESHOLD, MOON_COMPOSITIONS } = await import('../../data/ElementsData.js');
const { Planet }    = await import('../../entities/Planet.js');
const { Moon }      = await import('../../entities/Moon.js');
const { Planetoid } = await import('../../entities/Planetoid.js');
const { SystemGenerator } = await import('../../generators/SystemGenerator.js');
const { migrate, CURRENT_VERSION } = await import('../../systems/SaveMigration.js');
const { gravityBand, temperatureBand } = await import('../../data/EnvironmentBands.js');
const { envMultiplier, computeBuildResourceCost, ENVIRONMENT_SENSITIVITY } = await import('../../data/EnvironmentCost.js');
const { BuildingSystem } = await import('../../systems/BuildingSystem.js');

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { console.log('  ✓ ' + label); pass++; } else { console.log('  ✗ ' + label); fail++; } }
function header(t) { console.log('\n--- ' + t + ' ---'); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const P = (comp) => new Planet({ id: 'p', composition: comp });

// ── T1 ──────────────────────────────────────────────────────────────────────
header('T1: WATER_H2O_THRESHOLD');
assert(WATER_H2O_THRESHOLD === 3, 'próg === 3');
assert(CURRENT_VERSION >= 93, 'CURRENT_VERSION >= 93 (Stage 2 bump obecny w łańcuchu; kolejne bumpy OK)');

// ── T2 / T3 — konstruktory + split ────────────────────────────────────────────
header('T2/T3: konstruktory liczą hasWater z composition');
assert(P({ H2O: 5 }).surface.hasWater === true,  'Planet H2O 5 → mokra');
assert(P({ H2O: 2.5 }).surface.hasWater === false,'Planet H2O 2.5 (rocky in-HZ) → sucha');
assert(P({ H2O: 3 }).surface.hasWater === true,  'Planet H2O 3 (granica) → mokra');
assert(P({ H2O: 28 }).surface.hasWater === true, 'Planet H2O 28 (rocky_cold) → mokra');
assert(P({ H2O: 0 }).surface.hasWater === false, 'Planet H2O 0 (hot/gas) → sucha');
assert(new Moon({ composition: { H2O: 55 }, moonType: 'icy' }).surface.hasWater === true,  'Moon icy H2O 55 → mokry');
assert(new Moon({ composition: { H2O: 0.5 }, moonType: 'rocky' }).surface.hasWater === false,'Moon rocky H2O 0.5 → suchy');
assert(new Planetoid({ composition: { H2O: 8 } }).surface.hasWater === true,  'Planetoid carbonaceous 8 → mokry (zmiana zachowania)');
assert(new Planetoid({ composition: { H2O: 5 } }).surface.hasWater === true,  'Planetoid silicate 5 → mokry');
assert(new Planetoid({ composition: { H2O: 0 } }).surface.hasWater === false, 'Planetoid metallic 0 → suchy');

// ── T4 — icy moon z realnego template ─────────────────────────────────────────
header('T4: icy moon (template) bezpiecznie mokry');
const icyMoon = new Moon({ composition: { ...MOON_COMPOSITIONS.icy }, moonType: 'icy' });
assert(MOON_COMPOSITIONS.icy.H2O >= 3 * 5, 'template icy H2O (55) >> próg');
assert(icyMoon.surface.hasWater === true, 'Moon z template icy → mokry');

// ── T5 — migracja v92→v93 ─────────────────────────────────────────────────────
header('T5: migracja v92→v93 (backfill + preserwacja kołyski)');
const migr = migrate({ version: 92, planets: [
  { composition: { H2O: 28 },  surface: { hasWater: false } },  // cold rocky → zyskuje
  { composition: { H2O: 2.5 }, surface: { hasWater: false } },  // warm rocky → sucho
  { composition: { H2O: 2.5 }, surface: { hasWater: true } },   // wymuszona kołyska → ZACHOWANA
  { composition: { H2O: 5 } },                                  // brak surface → utworzone
] });
assert(migr.version === CURRENT_VERSION, 'save zmigrowany do końca łańcucha (v93 backfill niesie się dalej)');
assert(migr.planets[0].surface.hasWater === true,  'cold rocky (28) → mokry');
assert(migr.planets[1].surface.hasWater === false, 'warm rocky (2.5, było false) → sucho');
assert(migr.planets[2].surface.hasWater === true,  'wymuszona kołyska (2.5, było true) → ZACHOWANA mokra');
assert(migr.planets[3].surface && migr.planets[3].surface.hasWater === true, 'planeta bez surface → utworzone + mokra');

// ── T6 — gwarancja wody macierzystej ──────────────────────────────────────────
header('T6: makeHomeworldBreathable gwarantuje wodę (composition + hasWater)');
const home = { atmosphere: 'none', temperatureK: 250, composition: { H2O: 2.5, Fe: 50 } };
SystemGenerator.makeHomeworldBreathable(home);
assert(home.composition.H2O >= WATER_H2O_THRESHOLD + 2, 'H2O podbite z marginesem (>=5)');
assert(home.surface.hasWater === true, 'kołyska (gracz/AI) → mokra przez regułę');
const homeWet = { atmosphere: 'none', temperatureK: 250, composition: { H2O: 30, Fe: 50 } };
SystemGenerator.makeHomeworldBreathable(homeWet);
assert(near(homeWet.composition.H2O, 30), 'już-mokra kołyska: H2O bez zmian (max)');
let threw = false;
try { SystemGenerator.makeHomeworldBreathable({ atmosphere: 'none', temperatureK: 250 }); } catch { threw = true; }
assert(!threw, 'null-safe gdy brak composition (bez throw)');

// ── T7 — pasma ────────────────────────────────────────────────────────────────
header('T7: gravityBand / temperatureBand');
assert(gravityBand(null) === 'normal' && gravityBand(0.3) === 'low' && gravityBand(0.4) === 'normal'
    && gravityBand(1.5) === 'normal' && gravityBand(1.6) === 'high', 'gravityBand progi 0.4/1.5');
assert(temperatureBand(null) === 'moderate' && temperatureBand(78) === 'hot' && temperatureBand(77) === 'moderate'
    && temperatureBand(-54) === 'cold' && temperatureBand(-53) === 'moderate' && temperatureBand(0) === 'moderate',
    'temperatureBand progi 77/-53');

// ── T8 — envMultiplier per kategoria ──────────────────────────────────────────
header('T8: envMultiplier (kategorie, food ignoruje atmo/temp)');
const highGrav = { surfaceGravity: 2.0, atmosphere: 'breathable', temperatureC: 20 };
const noneCold = { surfaceGravity: 1.0, atmosphere: 'none', temperatureC: -60 };
assert(envMultiplier('mining', highGrav) === 1 + 1.0 * 0.40, 'mining high-grav → 1.40');
assert(envMultiplier('population', { surfaceGravity: 1.0, atmosphere: 'none', temperatureC: 20 }) === 1 + 1.0 * 0.50,
  'population none-atmo → 1.50');
// food: atmo 0 + temp 0 → tylko grawitacja. Na none+cold+normal-grav → brak dopłaty.
assert(envMultiplier('food', noneCold) === 1, 'food na none+cold (normal grav) → 1.0 (atmo/temp ignorowane)');
assert(envMultiplier('food', highGrav) === 1 + 0.2 * 0.40, 'food high-grav → 1.08 (tylko grawitacja)');
assert(ENVIRONMENT_SENSITIVITY.food.atmosphere === 0 && ENVIRONMENT_SENSITIVITY.food.temperature === 0,
  'food.atmosphere===0 i food.temperature===0 (Farma ma własną bramkę Stage 1)');

// ── T9 — utrzymanie = połowa; fail-open ───────────────────────────────────────
header('T9: half-strength + fail-open');
const full = envMultiplier('population', { surfaceGravity: 1.0, atmosphere: 'none', temperatureC: 20 });
const half = envMultiplier('population', { surfaceGravity: 1.0, atmosphere: 'none', temperatureC: 20 }, { half: true });
assert(near(half, 1 + (full - 1) / 2), 'utrzymanie = 1 + (pełna-1)/2');
assert(envMultiplier('mining', null) === 1, 'brak planety → 1 (fail-open)');
assert(envMultiplier('mining', null, { half: true }) === 1, 'brak planety half → 1');

// ── T10 — computeBuildResourceCost ────────────────────────────────────────────
header('T10: computeBuildResourceCost');
const mineB = { category: 'mining', cost: { Fe: 10 } };
assert(computeBuildResourceCost(mineB, highGrav).Fe === Math.ceil(10 * 1.40), 'mining high-grav Fe → 14');
assert(computeBuildResourceCost(mineB, highGrav, 1.5).Fe === Math.ceil(10 * 1.5 * 1.40), 'latBuildCost 1.5 → 21');
assert(computeBuildResourceCost(mineB, null).Fe === 10, 'null planeta → surowy koszt (10)');
assert(computeBuildResourceCost({ category: 'food', cost: { Fe: 10 } }, noneCold).Fe === 10, 'food none+cold → koszt bez zmian');

// ── T11 — _calcBaseRates: utrzymanie env WŁASNEJ kolonii ──────────────────────
header('T11: _calcBaseRates upkeep skalowane planetą WŁASNEJ kolonii (nie homePlanet)');
const planetsById = { pc: { surfaceGravity: 2.0, atmosphere: 'breathable', temperatureC: 20 } }; // high grav
window.KOSMOS.colonyManager = { getColony: (id) => (planetsById[id] ? { planet: planetsById[id] } : null) };
window.KOSMOS.homePlanet = { surfaceGravity: 1.0, atmosphere: 'breathable', temperatureC: 20 };   // normal — NIE używana
const bs = Object.create(BuildingSystem.prototype);
bs._planetId = 'pc'; bs._isRegionMode = false; bs._gridHeight = 0; bs.techSystem = null;
const rates = bs._calcBaseRates({ category: 'mining', rates: { minerals: 10 }, energyCost: 4, maintenance: { Cu: 1 } },
  { type: 'plains', anomalyEffect: null }, 1);
// mining grav 1.0 × high 0.40 = 0.40 full; half = 0.20 → envUpkeep 1.20 (własna planeta high-grav)
assert(near(rates.energy, -4 * 1.20), 'energyCost skalowany env-half własnej planety (-4.8, nie -4)');
assert(near(rates.Cu, -1 * 1.20), 'maintenance skalowane env-half (-1.2)');
assert(near(rates.minerals, 10), 'produkcja NIE skalowana env (10)');

console.log(`\nWYNIK: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
