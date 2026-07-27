// Biotic Atmosphere Gate — smoke (offline).
//
// Cel: biomy biotyczne (roślinność / ciekła woda) wymagają atmosfery. Na ciałach bez
// atmosfery (atmosphere === 'none') worldgen usuwa je z puli i rozdziela wagi na abiotyczne.
// Ciała z atmosferą — dystrybucja BEZ zmian (determinizm zachowany). Nowe gry only —
// brak migracji, brak bumpu save (nie dotyczy tego testu, ale test pilnuje kontraktu worldgena).
//
// Pokrycie:
//   T1  Partycja: BIOTIC_TERRAIN_TYPES = {forest, plains, tundra, ocean}; reszta abiotyczna
//   T2  _gateBioticBiomes: matematyka redystrybucji (suma wag, proporcje abiotyczne, fallback)
//   T3  Airless moon (rocky, zimny): zero biotycznych, brak pustych/undefined heksów
//   T4  Airless moon (icy): zero biotycznych (baza ice ma tundrę!), brak pustych heksów
//   T5  Airless planety (rocky/hot_rocky/ice/gas): zero biotycznych, brak pustych heksów
//   T6  Polar tundra → ice_sheet na airless (biotyczna tundra nie wraca strefą przejściową)
//   T7  Atmospheric planet: determinizm (2× generate identyczne) + biomy biotyczne OBECNE (gate OFF)

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);}, removeItem(k){delete this._store[k];},
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { TERRAIN_TYPES, BIOTIC_TERRAIN_TYPES } = await import('../../map/HexTile.js');
const { PlanetMapGenerator } = await import('../../map/PlanetMapGenerator.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Zsumuj typy heksów w wygenerowanej siatce
function typeHistogram(grid) {
  const h = {};
  grid.forEach(t => { h[t.type] = (h[t.type] ?? 0) + 1; });
  return h;
}
// Weryfikacja: każdy hex ma zdefiniowany, znany typ (brak pustych/undefined)
function everyTileValid(grid) {
  let ok = true;
  grid.forEach(t => { if (!t.type || !TERRAIN_TYPES[t.type]) ok = false; });
  return ok;
}
function hasAnyBiotic(hist) {
  return Object.keys(hist).some(k => BIOTIC_TERRAIN_TYPES.has(k));
}

// ── T1 — partycja ─────────────────────────────────────────────────────────────
header('T1: partycja biotic/abiotic');
{
  const biotic = [...BIOTIC_TERRAIN_TYPES].sort();
  assert(JSON.stringify(biotic) === JSON.stringify(['forest', 'ocean', 'plains', 'tundra']),
    'BIOTIC_TERRAIN_TYPES = {forest, ocean, plains, tundra}');
  for (const t of ['crater', 'mountains', 'ice_sheet', 'desert', 'volcano', 'wasteland']) {
    assert(!BIOTIC_TERRAIN_TYPES.has(t), `${t} → abiotyczny`);
  }
  // Flaga w danych = źródło prawdy zbioru
  assert(TERRAIN_TYPES.forest.biotic === true && TERRAIN_TYPES.plains.biotic === true &&
         TERRAIN_TYPES.tundra.biotic === true && TERRAIN_TYPES.ocean.biotic === true,
    'flaga biotic:true na forest/plains/tundra/ocean');
  assert(!TERRAIN_TYPES.desert.biotic && !TERRAIN_TYPES.mountains.biotic,
    'brak flagi biotic na desert/mountains');
}

// ── T2 — matematyka redystrybucji ─────────────────────────────────────────────
header('T2: _gateBioticBiomes (redystrybucja)');
{
  // Baza rocky: biotic(plains25+forest18+ocean12+tundra8=63) abiotic(mountains18+desert10+crater5+wasteland4=37)
  const pool = [
    { type: 'plains', weight: 25 }, { type: 'forest', weight: 18 }, { type: 'ocean', weight: 12 },
    { type: 'tundra', weight: 8 },  { type: 'mountains', weight: 18 }, { type: 'desert', weight: 10 },
    { type: 'crater', weight: 5 },  { type: 'wasteland', weight: 4 },
  ];
  const out = PlanetMapGenerator._gateBioticBiomes(pool);
  assert(out.every(e => !BIOTIC_TERRAIN_TYPES.has(e.type)), 'wynik zawiera wyłącznie biomy abiotyczne');
  const sumIn  = pool.reduce((s, e) => s + e.weight, 0);
  const sumOut = out.reduce((s, e) => s + e.weight, 0);
  assert(near(sumIn, sumOut), `suma wag zachowana (${sumIn} == ${sumOut.toFixed(3)})`);
  const mnt = out.find(e => e.type === 'mountains').weight;
  const des = out.find(e => e.type === 'desert').weight;
  assert(near(mnt / des, 18 / 10), 'proporcje abiotyczne bez zmian (mountains/desert == 18/10)');
  assert(near(mnt, 18 + 63 * (18 / 37)), 'mountains = 18 + 63*(18/37)');

  // Fallback: pula wyłącznie biotyczna → jałowe wasteland (niepuste pole)
  const allBiotic = PlanetMapGenerator._gateBioticBiomes([{ type: 'plains', weight: 10 }, { type: 'forest', weight: 5 }]);
  assert(allBiotic.length === 1 && allBiotic[0].type === 'wasteland' && near(allBiotic[0].weight, 15),
    'pula wyłącznie biotyczna → fallback wasteland(15)');

  // Brak biotycznych (baza gas) → bez zmian
  const gas = [{ type: 'desert', weight: 40 }, { type: 'wasteland', weight: 35 }, { type: 'mountains', weight: 15 }];
  const gasOut = PlanetMapGenerator._gateBioticBiomes(gas);
  assert(gasOut === gas, 'pula bez biomów biotycznych → zwrócona bez zmian (ta sama referencja)');
}

// Fabryki ciał testowych
const airlessRockyMoon = { id: 'm_rocky', type: 'moon', moonType: 'rocky', atmosphere: 'none',
  planetType: 'rocky', surface: { temperature: -40, hasWater: false }, composition: {}, physics: { mass: 0.02 }, lifeScore: 0 };
const airlessIcyMoon = { id: 'm_icy', type: 'moon', moonType: 'icy', atmosphere: 'none',
  planetType: 'ice', surface: { temperature: -120, hasWater: true }, composition: { H2O: 30 }, physics: { mass: 0.05 }, lifeScore: 0 };
const airlessRockyPlanet = { id: 'p_rocky', planetType: 'rocky', atmosphere: 'none',
  surface: { temperature: -10, hasWater: false }, composition: {}, physics: { mass: 1 }, lifeScore: 0 };
const airlessHotPlanet = { id: 'p_hot', planetType: 'hot_rocky', atmosphere: 'none',
  surface: { temperature: 120, hasWater: false }, composition: {}, physics: { mass: 1 }, lifeScore: 0 };
const airlessIcePlanet = { id: 'p_ice', planetType: 'ice', atmosphere: 'none',
  surface: { temperature: -90, hasWater: true }, composition: { H2O: 30 }, physics: { mass: 1 }, lifeScore: 0 };
const airlessGasPlanet = { id: 'p_gas', planetType: 'gas', atmosphere: 'none',
  surface: { temperature: -50, hasWater: false }, composition: {}, physics: { mass: 20 }, lifeScore: 0 };
const atmoTemperate = { id: 'a_temperate', planetType: 'rocky', atmosphere: 'breathable',
  surface: { temperature: 18, hasWater: true }, composition: { H2O: 25 }, physics: { mass: 1 }, lifeScore: 90 };

// ── T3 — airless rocky moon ───────────────────────────────────────────────────
header('T3: airless rocky moon (zimny)');
{
  const grid = PlanetMapGenerator.generate(airlessRockyMoon, false);
  const hist = typeHistogram(grid);
  assert(everyTileValid(grid), 'wszystkie heksy mają zdefiniowany typ (brak pustych/undefined)');
  assert(!hasAnyBiotic(hist), 'zero biomów biotycznych (forest/plains/tundra/ocean)');
  assert(Object.keys(hist).length > 0, 'siatka niepusta');
  console.log('     hist:', JSON.stringify(hist));
}

// ── T4 — airless icy moon ─────────────────────────────────────────────────────
header('T4: airless icy moon (baza ice ma tundrę)');
{
  const grid = PlanetMapGenerator.generate(airlessIcyMoon, false);
  const hist = typeHistogram(grid);
  assert(everyTileValid(grid), 'wszystkie heksy mają zdefiniowany typ');
  assert(!hasAnyBiotic(hist), 'zero biomów biotycznych (tundra z bazy ice usunięta)');
  console.log('     hist:', JSON.stringify(hist));
}

// ── T5 — airless planety ──────────────────────────────────────────────────────
header('T5: airless planety (rocky/hot_rocky/ice/gas)');
for (const body of [airlessRockyPlanet, airlessHotPlanet, airlessIcePlanet, airlessGasPlanet]) {
  const grid = PlanetMapGenerator.generate(body, false);
  const hist = typeHistogram(grid);
  assert(everyTileValid(grid), `${body.id}: wszystkie heksy zdefiniowane`);
  assert(!hasAnyBiotic(hist), `${body.id}: zero biomów biotycznych`);
}

// ── T6 — polar tundra → ice_sheet na airless ──────────────────────────────────
header('T6: strefa przejściowa polar nie wprowadza tundry (airless)');
{
  // Zimny airless rocky planet → capRows>0. Bez fixu strefa przejściowa dawałaby tundrę.
  const grid = PlanetMapGenerator.generate(airlessRockyPlanet, false);
  const hist = typeHistogram(grid);
  assert(!('tundra' in hist), 'brak tundry na airless mimo capRows>0');
  assert('ice_sheet' in hist, 'ice_sheet obecny (substytut biegunowy)');
}

// ── T7 — atmospheric: determinizm + biotyczne obecne (gate OFF) ───────────────
header('T7: atmospheric planet niezmieniony (gate OFF)');
{
  const g1 = PlanetMapGenerator.generate(atmoTemperate, true);
  const g2 = PlanetMapGenerator.generate(atmoTemperate, true);
  const h1 = typeHistogram(g1), h2 = typeHistogram(g2);
  assert(JSON.stringify(h1) === JSON.stringify(h2), 'determinizm: 2× generate → identyczna dystrybucja');
  assert(everyTileValid(g1), 'wszystkie heksy zdefiniowane');
  assert(hasAnyBiotic(h1), 'biomy biotyczne OBECNE (bramka nie ruszyła ciała z atmosferą)');
  console.log('     hist:', JSON.stringify(h1));
}

console.log(`\nWYNIK: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
