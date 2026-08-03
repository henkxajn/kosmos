// KOSMOS — small-bodies kill-switch smoke (offline).
// Flaga FEATURES.smallBodies gate'uje asteroidy + komety + planetezymale
// (nieteksturowane THREE.Points, dekoracja bez gameplayu, NIE serializowane).
// OFF (default): asteroidy/komety nie trafiają do EntityManager, a result.*
//   (asteroids/comets/planetesimals) wraca []. Planetoidy (grywalne) ZAWSZE obecne.
// Determinizm RNG (spójność skanu STRATCOM): flaga NIE przesuwa sekwencji
//   generatorów → peekCountsForStar/generateForStar dają identyczne
//   planets/moons/planetoids w OBU stanach flagi.
//
// T1  Flaga istnieje, default false
// T2  generate() OFF → result asteroids/comets/planetesimals = [], planetoids/planets obecne
// T3  generate() OFF → EntityManager: 0 asteroid, 0 komet, planetoidy > 0
// T4  generate() ON  → comets/planetesimals niepuste; asteroids spójne z EntityManager
// T5  generate() ON  → EntityManager: komety > 0
// T6  generateForStar OFF vs ON → gating EntityManager (komety 0 vs >0); planetoidy zawsze te same
// T7  peekCountsForStar OFF → asteroids/comets = 0; ON → comets > 0
// T8  Determinizm: peek(OFF).{planets,moons,planetoids} === peek(ON).* (flaga nie rusza RNG)
//     oraz generateForStar(star).{planets,planetoids}.length === peek(star).* (spójność skanu)

globalThis.localStorage = {
  _store:{}, length:0, key(){ return null; },
  getItem(k){ return this._store[k] ?? null; }, setItem(k,v){ this._store[k]=String(v); }, removeItem(k){ delete this._store[k]; },
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { GAME_CONFIG }     = await import('../../config/GameConfig.js');
const { SystemGenerator } = await import('../../generators/SystemGenerator.js');
const EntityManager       = (await import('../../core/EntityManager.js')).default;

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { console.log('  ✓ ' + label); pass++; } else { console.log('  ✗ ' + label); fail++; } }
function header(t) { console.log('\n--- ' + t + ' ---'); }

// Deterministyczna gwiazda galaktyczna (seed = id) — wspólna dla peek/generateForStar.
const GALAXY_STAR = { id: 'star_test_01', name: 'Testowa', spectralType: 'G', mass: 1.0, luminosity: 1.0 };

// Ustaw flagę, wykonaj, przywróć poprzedni stan (izolacja testów).
function withFlag(v, fn) {
  const prev = GAME_CONFIG.FEATURES.smallBodies;
  GAME_CONFIG.FEATURES.smallBodies = v;
  try { return fn(); } finally { GAME_CONFIG.FEATURES.smallBodies = prev; }
}

// ── T1 ────────────────────────────────────────────────────────────────────────
header('T1: flaga');
assert(typeof GAME_CONFIG.FEATURES.smallBodies === 'boolean', 'smallBodies jest boolean');
assert(GAME_CONFIG.FEATURES.smallBodies === false, 'default false (ukryte)');

// ── T2/T3 — generate() OFF ──────────────────────────────────────────────────────
header('T2/T3: generate() OFF');
const offRes = withFlag(false, () => { EntityManager.clear(); return new SystemGenerator().generate(); });
assert(offRes.asteroids.length === 0,     'result.asteroids = []');
assert(offRes.comets.length === 0,        'result.comets = []');
assert(offRes.planetesimals.length === 0, 'result.planetesimals = []');
assert(offRes.planetoids.length > 0,      'result.planetoids > 0 (grywalne zostają)');
assert(offRes.planets.length > 0,         'result.planets > 0');
assert(EntityManager.getByType('asteroid').length === 0, 'EntityManager: 0 asteroid');
assert(EntityManager.getByType('comet').length === 0,    'EntityManager: 0 komet');
assert(EntityManager.getByType('planetoid').length > 0,  'EntityManager: planetoidy > 0');

// ── T4/T5 — generate() ON ───────────────────────────────────────────────────────
header('T4/T5: generate() ON');
const onRes = withFlag(true, () => { EntityManager.clear(); return new SystemGenerator().generate(); });
assert(onRes.comets.length > 0,        'result.comets > 0 (8-15)');
assert(onRes.planetesimals.length > 0, 'result.planetesimals > 0 (40-60)');
assert(onRes.asteroids.length === EntityManager.getByType('asteroid').length, 'asteroids: result spójne z EntityManager');
assert(EntityManager.getByType('comet').length === onRes.comets.length, 'EntityManager: komety = result.comets');
assert(EntityManager.getByType('comet').length > 0, 'EntityManager: komety > 0');

// ── T6 — generateForStar gating + inwariant planetoid ──────────────────────────
header('T6: generateForStar gating');
const gfsOff = withFlag(false, () => { EntityManager.clear(); return new SystemGenerator().generateForStar(GALAXY_STAR); });
const cometsOff    = EntityManager.getByType('comet').length;
const planetoidsOff = EntityManager.getByType('planetoid').length;
const gfsOn = withFlag(true, () => { EntityManager.clear(); return new SystemGenerator().generateForStar(GALAXY_STAR); });
const cometsOn     = EntityManager.getByType('comet').length;
const planetoidsOn  = EntityManager.getByType('planetoid').length;
assert(cometsOff === 0, 'generateForStar OFF → 0 komet w EntityManager');
assert(cometsOn > 0,    'generateForStar ON → komety w EntityManager');
assert(planetoidsOff === planetoidsOn && planetoidsOff > 0, 'planetoidy identyczne OFF/ON (flaga nie rusza RNG)');
assert(gfsOff.asteroids.length === 0 && gfsOff.comets.length === 0 && gfsOff.planetesimals.length === 0, 'gfs OFF → result małe ciała puste');

// ── T7 — peekCountsForStar ──────────────────────────────────────────────────────
header('T7: peekCountsForStar');
const peekOff = withFlag(false, () => new SystemGenerator().peekCountsForStar(GALAXY_STAR));
const peekOn  = withFlag(true,  () => new SystemGenerator().peekCountsForStar(GALAXY_STAR));
assert(peekOff.asteroids === 0 && peekOff.comets === 0, 'peek OFF → asteroids/comets = 0');
assert(peekOn.comets > 0, 'peek ON → comets > 0');
assert(peekOff.total < peekOn.total, 'peek total OFF < ON (małe ciała nie liczone przy OFF)');

// ── T8 — determinizm RNG ────────────────────────────────────────────────────────
header('T8: determinizm RNG (flaga nie przesuwa sekwencji generatorów)');
assert(peekOff.planets === peekOn.planets,       'planets identyczne OFF/ON');
assert(peekOff.moons === peekOn.moons,           'moons identyczne OFF/ON');
assert(peekOff.planetoids === peekOn.planetoids, 'planetoids identyczne OFF/ON');
assert(gfsOn.planets.length === peekOn.planets,       'generateForStar.planets === peek.planets (spójność skanu)');
assert(gfsOn.planetoids.length === peekOn.planetoids, 'generateForStar.planetoids === peek.planetoids');

console.log(`\n${'='.repeat(48)}\n  small_bodies_killswitch: ${pass} PASS / ${fail} FAIL\n${'='.repeat(48)}`);
process.exit(fail ? 1 : 0);
