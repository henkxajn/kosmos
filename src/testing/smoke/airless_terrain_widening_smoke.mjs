// Airless Terrain Widening — smoke (offline).
//
// Kontekst: bramka biotyczna (commit e8d6169) zdjęła plains/tundra z ciał bez atmosfery,
// przez co budynki research (crater-only) i market (desert-only) stały się niebudowalne
// na wielu airless. Poszerzenie reguł terenu:
//   research (kategoria + directional_observatory): + wasteland, + mountains
//   market   (kategoria):                            + wasteland
// ŚWIADOMIE NIE poszerzamy o ice_sheet/desert (research) ani mountains (market) — to
// utrzymuje intencjonalne „single-terrain worlds" bez research/handlu.
//
// Pokrycie:
//   T1  research (kategoria) placeable na crater/wasteland/mountains; BLOK na ice_sheet/desert/tundra/volcano
//   T2  directional_observatory (terrainOnly) placeable na plains/tundra/crater/wasteland/mountains; BLOK desert/ice_sheet/forest/volcano
//   T3  market placeable na desert/volcano/wasteland/plains/tundra; BLOK na mountains/crater/ice_sheet (market NIE dostał mountains)
//   T4  Nietknięte: plains/forest/crater dalej mają 'research'; plains/desert/tundra/volcano dalej mają 'market'
//   T5  Nieosłabione: farm dalej requiresAtmosphere; well dalej requiresWater; geothermal tylko volcano
//   T6  Zbiory allowedCategories: mountains/wasteland zyskały wpisy; plains/tundra/ocean NIETKNIĘTE

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);}, removeItem(k){delete this._store[k];},
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { TERRAIN_TYPES, evaluatePlacement } = await import('../../map/HexTile.js');
const { BUILDINGS } = await import('../../data/BuildingsData.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

const tile = (type) => ({ type, damaged: false, anomalyEffect: null });
const canPlace = (t, bId) => evaluatePlacement(tile(t), BUILDINGS[bId]).ok;

const RESEARCH_CAT = ['research_station', 'data_center', 'genetics_lab'];
const MARKET_CAT   = ['trade_hub', 'free_market'];

// ── T1 — research (kategoria) ─────────────────────────────────────────────────
header('T1: research kategoria (research_station/data_center/genetics_lab)');
for (const b of RESEARCH_CAT) {
  assert(canPlace('crater', b),    `${b} na crater → ok`);
  assert(canPlace('wasteland', b), `${b} na wasteland → ok (NOWE)`);
  assert(canPlace('mountains', b), `${b} na mountains → ok (NOWE)`);
  assert(!canPlace('ice_sheet', b),`${b} na ice_sheet → BLOK (świadomie nie dodane)`);
  assert(!canPlace('desert', b),   `${b} na desert → BLOK (świadomie nie dodane)`);
  assert(!canPlace('tundra', b),   `${b} na tundra → BLOK (kategoria; tundra bez 'research')`);
  assert(!canPlace('volcano', b),  `${b} na volcano → BLOK`);
}

// ── T2 — directional_observatory (terrainOnly) ────────────────────────────────
header('T2: directional_observatory (terrainOnly)');
{
  const b = 'directional_observatory';
  for (const t of ['plains', 'tundra', 'crater', 'wasteland', 'mountains']) {
    assert(canPlace(t, b), `${b} na ${t} → ok`);
  }
  for (const t of ['desert', 'ice_sheet', 'forest', 'volcano']) {
    assert(!canPlace(t, b), `${b} na ${t} → BLOK`);
  }
}

// ── T3 — market ───────────────────────────────────────────────────────────────
header('T3: market (trade_hub/free_market)');
for (const b of MARKET_CAT) {
  assert(canPlace('desert', b),    `${b} na desert → ok`);
  assert(canPlace('volcano', b),   `${b} na volcano → ok`);
  assert(canPlace('wasteland', b), `${b} na wasteland → ok (NOWE)`);
  assert(canPlace('plains', b),    `${b} na plains → ok`);
  assert(canPlace('tundra', b),    `${b} na tundra → ok`);
  assert(!canPlace('mountains', b),`${b} na mountains → BLOK (market NIE dostał mountains)`);
  assert(!canPlace('crater', b),   `${b} na crater → BLOK`);
  assert(!canPlace('ice_sheet', b),`${b} na ice_sheet → BLOK`);
}

// ── T4 — istniejące reguły nietknięte ─────────────────────────────────────────
header('T4: istniejące tereny research/market nietknięte');
{
  assert(canPlace('plains', 'research_station'), 'plains dalej research (research_station)');
  assert(canPlace('forest', 'research_station'), 'forest dalej research');
  assert(canPlace('plains', 'trade_hub'),        'plains dalej market');
  assert(canPlace('desert', 'trade_hub'),        'desert dalej market');
}

// ── T5 — nieosłabione bramki ──────────────────────────────────────────────────
header('T5: farm/well/geothermal nieosłabione');
{
  const airless = { atmosphere: 'none', temperatureC: 20, surface: { hasWater: true } };
  const noWater = { atmosphere: 'breathable', temperatureC: 20, surface: { hasWater: false } };
  const rFarm = evaluatePlacement(tile('plains'), BUILDINGS.farm, { planet: airless });
  assert(rFarm.ok === false && rFarm.reason === 'ui.requiresAtmosphere', 'farm dalej requiresAtmosphere (airless → blok)');
  const rWell = evaluatePlacement(tile('plains'), BUILDINGS.well, { planet: noWater });
  assert(rWell.ok === false && rWell.reason === 'ui.requiresWater', 'well dalej requiresWater (brak wody → blok)');
  // geothermal — terrainOnly ['volcano']; szukamy budynku z tą regułą
  const geo = Object.values(BUILDINGS).find(b => Array.isArray(b.terrainOnly)
    && b.terrainOnly.length === 1 && b.terrainOnly[0] === 'volcano');
  assert(!!geo, 'sanity: istnieje budynek geothermal terrainOnly:[volcano]');
  if (geo) {
    assert(canPlace('volcano', geo.id), `${geo.id} na volcano → ok`);
    assert(!canPlace('mountains', geo.id), `${geo.id} na mountains → BLOK (geothermal tylko volcano)`);
    assert(!canPlace('wasteland', geo.id), `${geo.id} na wasteland → BLOK`);
  }
}

// ── T6 — allowedCategories: mountains/wasteland zmienione, plains/tundra/ocean NIE ─
header('T6: allowedCategories — zakres zmian');
{
  assert(TERRAIN_TYPES.mountains.allowedCategories.includes('research'), "mountains ma 'research'");
  assert(TERRAIN_TYPES.wasteland.allowedCategories.includes('research'), "wasteland ma 'research'");
  assert(TERRAIN_TYPES.wasteland.allowedCategories.includes('market'),   "wasteland ma 'market'");
  assert(!TERRAIN_TYPES.mountains.allowedCategories.includes('market'),  "mountains NIE ma 'market' (market bez mountains)");
  // plains/tundra/ocean nietknięte — atmosferyczne ciała bez zmian
  assert(!TERRAIN_TYPES.plains.allowedCategories.includes('___sentinel___'), 'plains entry istnieje');
  assert(TERRAIN_TYPES.plains.allowedCategories.includes('research') && TERRAIN_TYPES.plains.allowedCategories.includes('market'),
    'plains dalej ma research+market (nietknięte)');
  assert(TERRAIN_TYPES.tundra.allowedCategories.includes('market') && !TERRAIN_TYPES.tundra.allowedCategories.includes('research'),
    'tundra dalej market, dalej bez research (nietknięte)');
  assert(TERRAIN_TYPES.ocean.allowedCategories.length === 0, 'ocean dalej pusty (nietknięte)');
}

console.log(`\nWYNIK: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
