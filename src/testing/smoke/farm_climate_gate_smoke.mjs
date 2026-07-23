// Farm Climate Gate + Unified Placement Gate — smoke (offline). KOSMOS Reform Stage 1.
//
// A1 — evaluatePlacement (jedno źródło prawdy) = ladder terenowy z gałęzią terrainUnlock
//      (której picker wcześniej NIE miał — desync). BuildingSystem._canBuildOnTile deleguje.
// A2 — flaga requiresOpenAirClimate (tylko farm): atmosphere 'none' → blok, temperatureC<0 → blok,
//      'thin' → ×0.5 do żywności (multiplikatywnie z terenowym yieldBonus). Planeta TEJ kolonii.
// A3 — powód blokady to konkretny klucz i18n (kind:'climate'), nie 'ui.terrainForbidden'.
//
// Pokrycie:
//   T1  Ladder terenowy: ocean blok / mountains+farm blok / plains+farm ok / ice_sheet+farm ok / damaged blok
//   T2  Fix desync: fake techSystem.getTerrainUnlocks → farm na mountains staje się ok (gałąź, którą picker gubił)
//   T3  Bramka klimatyczna: none→requiresAtmosphere, temp<0→requiresWarmth, thin/breathable/dense(+temp≥0)→ok
//   T4  Spared: well (woda, brak flagi) i synthesized_food_plant (isSynthFood, brak flagi) nigdy nie blok klimatem
//   T5  Fail-open: brak planety (planet:null) → klimat pomijany (nie blokuje)
//   T6  ×0.5 w _calcBaseRates: farm/plains thin=7.0 vs breathable=14.0; ice_sheet thin=4.0 (0.8×0.5) vs 8.0
//   T7  ×0.5 spared: well i synth mają identyczny output na thin i breathable (klimat ich nie tyka)
//   T8  Multi-colony: _canBuildOnTile i _calcBaseRates używają planety WŁASNEJ kolonii, nie homePlanet

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);}, removeItem(k){delete this._store[k];},
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { TERRAIN_TYPES, evaluatePlacement } = await import('../../map/HexTile.js');
const { BUILDINGS }      = await import('../../data/BuildingsData.js');
const { BuildingSystem } = await import('../../systems/BuildingSystem.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const FARM = BUILDINGS.farm;
const WELL = BUILDINGS.well;
const SYNTH = BUILDINGS.synthesized_food_plant;
const tile = (type, damaged = false) => ({ type, damaged, anomalyEffect: null });

// Sanity: dane muszą być takie, jak zakłada test
assert(FARM.requiresOpenAirClimate === true, 'sanity: farm.requiresOpenAirClimate === true');
assert(FARM.category === 'food' && WELL.category === 'food' && SYNTH.category === 'food', 'sanity: farm/well/synth kategoria food');
assert(!WELL.requiresOpenAirClimate && !SYNTH.requiresOpenAirClimate, 'sanity: well/synth BEZ flagi klimatu');
assert(SYNTH.isSynthFood === true, 'sanity: synth.isSynthFood === true');

// ── T1 — ladder terenowy ─────────────────────────────────────────────────────
header('T1: ladder terenowy (evaluatePlacement)');
{
  assert(evaluatePlacement(tile('ocean'), FARM).ok === false, 'ocean → blok (buildable:false)');
  assert(evaluatePlacement(tile('ocean'), FARM).kind === 'terrain', 'ocean → kind terrain');
  assert(evaluatePlacement(tile('mountains'), FARM).ok === false, 'mountains+farm → blok (brak food w allowedCategories)');
  assert(evaluatePlacement(tile('plains'), FARM).ok === true, 'plains+farm → ok');
  assert(evaluatePlacement(tile('ice_sheet'), FARM).ok === true, 'ice_sheet+farm → ok (food dozwolone)');
  assert(evaluatePlacement(tile('plains', true), FARM).ok === false, 'damaged plains → blok');
}

// ── T2 — fix desync (gałąź terrainUnlock) ────────────────────────────────────
header('T2: fix desync tech-unlock');
{
  const fakeTech = { getTerrainUnlocks: (type) => (type === 'mountains' ? ['food'] : []) };
  assert(evaluatePlacement(tile('mountains'), FARM).ok === false, 'bez tech: farm na mountains blok');
  assert(evaluatePlacement(tile('mountains'), FARM, { techSystem: fakeTech }).ok === true,
    'z tech (getTerrainUnlocks food) → farm na mountains ok (gałąź, którą picker gubił)');
}

// ── T3 — bramka klimatyczna ──────────────────────────────────────────────────
header('T3: bramka klimatyczna (farm)');
{
  const none = { atmosphere: 'none', temperatureC: 20 };
  const cold = { atmosphere: 'breathable', temperatureC: -5 };
  const thinCold = { atmosphere: 'thin', temperatureC: -1 };
  const thin = { atmosphere: 'thin', temperatureC: 10 };
  const breathe = { atmosphere: 'breathable', temperatureC: 10 };
  const dense = { atmosphere: 'dense', temperatureC: 10 };

  const rNone = evaluatePlacement(tile('plains'), FARM, { planet: none });
  assert(rNone.ok === false && rNone.reason === 'ui.requiresAtmosphere' && rNone.kind === 'climate',
    "atmosphere 'none' → blok requiresAtmosphere");
  const rCold = evaluatePlacement(tile('plains'), FARM, { planet: cold });
  assert(rCold.ok === false && rCold.reason === 'ui.requiresWarmth' && rCold.kind === 'climate',
    'temperatureC<0 (breathable) → blok requiresWarmth');
  assert(evaluatePlacement(tile('plains'), FARM, { planet: thinCold }).reason === 'ui.requiresWarmth',
    'thin + temp<0 → temp wygrywa (requiresWarmth)');
  assert(evaluatePlacement(tile('plains'), FARM, { planet: thin }).ok === true, 'thin + temp≥0 → ok (placeable)');
  assert(evaluatePlacement(tile('plains'), FARM, { planet: breathe }).ok === true, 'breathable + temp≥0 → ok');
  assert(evaluatePlacement(tile('plains'), FARM, { planet: dense }).ok === true, 'dense + temp≥0 → ok');
  assert(evaluatePlacement(tile('plains'), FARM, { planet: { atmosphere: 'thin', temperatureC: 0 } }).ok === true,
    'granica temp === 0 → ok (>= 0)');
}

// ── T4 — spared budynki (bramka placement) ───────────────────────────────────
header('T4: well/synth nigdy nie blokowane klimatem');
{
  // Stage 3: well ma teraz requiresWater — dajemy wodę, by izolować OŚ KLIMATU (intencja T4:
  // well nie jest tykany bramką KLIMATU). Bramka wody testowana osobno w stage3_well_gate_smoke.
  const none = { atmosphere: 'none', temperatureC: -50, surface: { hasWater: true } };
  assert(evaluatePlacement(tile('plains'), WELL, { planet: none }).ok === true, 'well na none/zimno (z wodą) → ok (brak flagi klimatu)');
  assert(evaluatePlacement(tile('plains'), SYNTH, { planet: none }).ok === true, 'synth na none/zimno → ok (terrainAny + brak flagi)');
}

// ── T5 — fail-open bez planety ────────────────────────────────────────────────
header('T5: fail-open (planet null)');
{
  assert(evaluatePlacement(tile('plains'), FARM, { planet: null }).ok === true, 'brak planety → klimat pomijany (nie blokuje)');
  assert(evaluatePlacement(tile('plains'), FARM).ok === true, 'brak opcji → klimat pomijany');
}

// ── Helper: BuildingSystem z zamockowaną planetą kolonii ─────────────────────
const planetsById = {};
globalThis.window.KOSMOS.colonyManager = { getColony: (id) => (planetsById[id] ? { planet: planetsById[id] } : null) };
function makeBS(planetId) {
  const bs = Object.create(BuildingSystem.prototype);
  bs._planetId = planetId;
  bs._isRegionMode = false;
  bs._gridHeight = 0;       // latMod = 1.0 (bez modyfikatora polarnego)
  bs.techSystem = null;
  return bs;
}
const foodRate = (bs, building, t) => bs._calcBaseRates(building, t, 1).food;

// ── T6 — ×0.5 w _calcBaseRates (stackowanie z terenem) ───────────────────────
header('T6: ×0.5 klimatyczny (multiplikatywnie z yieldBonus)');
{
  planetsById.p_thin = { atmosphere: 'thin', temperatureC: 10 };
  planetsById.p_breathe = { atmosphere: 'breathable', temperatureC: 10 };
  const bsThin = makeBS('p_thin');
  const bsBreathe = makeBS('p_breathe');

  // plains: yieldBonus food 1.4 → farm food 10*1.4 = 14 (pełny), *0.5 = 7 (thin)
  assert(near(foodRate(bsBreathe, FARM, tile('plains')), 14.0), 'farm/plains breathable = 14.0');
  assert(near(foodRate(bsThin, FARM, tile('plains')), 7.0), 'farm/plains thin = 7.0 (×0.5)');
  // ice_sheet: yieldBonus default 0.8 (brak klucza food) → 10*0.8 = 8 (pełny), *0.5 = 4 (thin)
  assert(near(foodRate(bsBreathe, FARM, tile('ice_sheet')), 8.0), 'farm/ice_sheet breathable = 8.0');
  assert(near(foodRate(bsThin, FARM, tile('ice_sheet')), 4.0), 'farm/ice_sheet thin = 4.0 (0.8×0.5)');
}

// ── T7 — ×0.5 spared (well/synth output niezmienny thin vs breathable) ───────
header('T7: well/synth output niezmienny przez klimat');
{
  const bsThin = makeBS('p_thin');
  const bsBreathe = makeBS('p_breathe');
  // well produkuje WATER (nie food) — brak klucza food; sprawdzamy że jego rate w ogóle nie ma food
  const wellThin = bsThin._calcBaseRates(WELL, tile('plains'), 1);
  const wellBreathe = bsBreathe._calcBaseRates(WELL, tile('plains'), 1);
  assert(wellThin.food === undefined && wellBreathe.food === undefined, 'well nie produkuje food');
  assert(near(wellThin.water, wellBreathe.water), 'well water identyczny thin vs breathable');
  // synth produkuje food, ale bez flagi → nie halved
  assert(near(foodRate(bsThin, SYNTH, tile('plains')), foodRate(bsBreathe, SYNTH, tile('plains'))),
    'synth food identyczny thin vs breathable (klimat go nie tyka)');
  assert(foodRate(bsThin, SYNTH, tile('plains')) > 0, 'synth food > 0 na thin (nie zablokowany)');
}

// ── T8 — multi-colony (planeta WŁASNEJ kolonii, nie homePlanet) ──────────────
header('T8: multi-colony safety (nie homePlanet)');
{
  // homePlanet ustawiony na breathable/ciepło — gdyby bramka go używała, obie kolonie byłyby OK/pełne
  globalThis.window.KOSMOS.homePlanet = { atmosphere: 'breathable', temperatureC: 25 };
  planetsById.c1 = { atmosphere: 'none', temperatureC: 20 };        // kolonia bez atmosfery
  planetsById.c2 = { atmosphere: 'breathable', temperatureC: 20 };  // kolonia oddychalna
  const bs1 = makeBS('c1');
  const bs2 = makeBS('c2');
  assert(bs1._canBuildOnTile(tile('plains'), FARM) === false, 'kolonia c1 (none) → farm zablokowana (własna planeta, nie home)');
  assert(bs2._canBuildOnTile(tile('plains'), FARM) === true, 'kolonia c2 (breathable) → farm dozwolona');

  planetsById.c3 = { atmosphere: 'thin', temperatureC: 10 };
  const bs3 = makeBS('c3');
  // c3 thin → ×0.5 mimo że homePlanet jest breathable
  assert(near(foodRate(bs3, FARM, tile('plains')), 7.0), 'kolonia c3 (thin) → food ×0.5 (własna planeta) mimo home breathable');
}

console.log(`\nWYNIK: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
